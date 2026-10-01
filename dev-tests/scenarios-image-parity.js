// Parité de la bande d'en-tête et de pied de page entre l'éditeur, la Lecture, le PDF et le Word (Antoine, 01/10, carte « Sur le PDF »).
//
// Le PDF réserve TOUJOURS la même bande sous la marge du haut dès qu'un en-tête a du contenu (45 pt de zone + 10 pt d'écart = 55 pt, quelle que soit la
// hauteur réelle du texte), autant au-dessus de la marge du bas pour le pied, et rien quand la zone est vide : c'est le fichier remis, rien ne le fait bouger.
// L'éditeur, la Lecture et le Word se calent dessus. Les scénarios mesurent donc la MÊME chose dans les quatre rendus, jamais une valeur écrite en dur dans
// un seul d'entre eux :
//  - l'origine du corps (là où commence la première ligne de la page) : marge + bande, identique partout ;
//  - le coin de la feuille : une image en calque tirée au-delà du bord haut gauche s'arrête pile dans le coin, dans les quatre rendus ;
//  - la hauteur de page utile : la Lecture coupe ses pages aux mêmes lignes que l'éditeur et le PDF ;
//  - une zone vide ne prend aucune place ;
//  - les marges du fichier Word (marge du haut et du bas, distance de l'en-tête et du pied).
// Toutes les positions sont en points depuis le coin haut gauche de la feuille.
window.EditorTestSuites = window.EditorTestSuites || {};
window.EditorTestSuites.imageParity = (function () {
  const PT = 96 / 72;
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  // Même valeur que HF_MAX_ZONE_HEIGHT_PT + HEADER_FOOTER_GAP_PT de js/pdf-export.js (60 px = 45 pt, plus 10 pt).
  const BAND_PT = 55;
  const EMPTY = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const hfOf = (header, footer, extra) => Object.assign({ enabled: true, differentFirstPage: false, header: { default: header || '', first: '' }, footer: { default: footer || '', first: '' } }, extra || {});
  // Chaque forme de données qui change ce que le PDF réserve : rien, un seul des deux, les deux, un en-tête dont seule la page 1 est vide (le PDF réserve la
  // même marge sur toutes les pages), un en-tête qui ne contient qu'une image.
  const CONFIGS = {
    none: { hf: EMPTY, top: 0, bottom: 0 },
    header: { hf: hfOf('<p>EN-TETE</p>', ''), top: BAND_PT, bottom: 0 },
    footer: { hf: hfOf('', '<p>PIED</p>'), top: 0, bottom: BAND_PT },
    both: { hf: hfOf('<p>EN-TETE</p>', '<p>PIED</p>'), top: BAND_PT, bottom: BAND_PT },
    firstPageEmpty: { hf: hfOf('<p>EN-TETE</p>', '<p>PIED</p>', { differentFirstPage: true }), top: BAND_PT, bottom: BAND_PT },
    imageOnly: { hf: hfOf('<p><img class="editor-image" src="' + PNG + '" alt="" style="width: 60px; height: 60px" data-layer="normal" data-wrap="inline"></p>', ''), top: BAND_PT, bottom: 0 },
  };

  function near(a, b, tol) { return Math.abs(a - b) <= tol; }
  const r2 = v => Math.round(v * 100) / 100;
  function zoomOf(el) {
    const sheet = el.closest ? el.closest('.v2-page-sheet, .reader-content') : null;
    const z = sheet ? parseFloat(getComputedStyle(sheet).zoom) : NaN;
    return (isFinite(z) && z > 0) ? z : 1;
  }
  const clone = o => JSON.parse(JSON.stringify(o));

  async function setup(h, hf, html) {
    await h.resetEditor();
    PageLayout.setMarginsMm(null);
    h.setA4Preview(true);
    Editor.setHeaderFooterData(clone(hf));
    Editor.setHTML(html);
    Editor.refreshLayout();
    await h.sleep(250);
  }

  // Le corps seul : un paragraphe repère, pour mesurer l'origine du contenu sans rien d'autre dans la page.
  const BODY = '<p>Corps du document.</p>';
  // Une image en calque tirée très au-delà du coin haut gauche : la capture de la grille page la rend au coin de la feuille (c'est le geste de glisser, sans la souris).
  const CORNER = '<p><img class="editor-image" src="' + PNG + '" alt="" style="width: 120px; height: 120px; position: absolute; left: -9999px; top: -9999px; z-index: 5;" data-layer="front" data-wrap="inline" data-page-index="0" data-page-left-pt="-9999" data-page-top-pt="-9999"></p><p>Corps du document.</p>';

  // Origine du contenu (haut de la première ligne du corps) dans l'éditeur, depuis le haut de la feuille.
  function editorOriginPt() {
    const tip = document.querySelector('#editor-container .tiptap');
    const sheet = tip.parentElement.getBoundingClientRect();
    const first = tip.querySelector(':scope > p');
    return r2((first.getBoundingClientRect().top - sheet.top) / zoomOf(tip) / PT);
  }
  // La Lecture : la bande d'en-tête est une carte au-dessus de la feuille ; le haut de la page est le haut de cette carte, ou celui de la feuille sans en-tête.
  function readerTopOf(rc) {
    const edge = document.querySelector('#reader-container .v2-page-edge-top');
    return (edge || rc).getBoundingClientRect().top;
  }
  async function readerOriginPt(h, html, hf) {
    const rc = await h.renderReaderMode(html, hf);
    await h.sleep(150);
    const first = rc.querySelector(':scope > p');
    return r2((first.getBoundingClientRect().top - readerTopOf(rc)) / zoomOf(rc) / PT);
  }
  async function pdfOf(h, html, hf) {
    const res = await h.exportPdfContent(html, hf, PageLayout.getMarginsPt());
    return { res, truth: await h.extractPdfGroundTruth(res.base64), margins: res.docDefinition.pageMargins };
  }
  async function docxOf(h, html, hf) {
    const parts = await h.exportDocxParts(html, hf, PageLayout.getMarginsTwip());
    return { parts, sect: h.docxSectionProps(parts.doc) };
  }
  function restoreReader(h) {
    const container = document.getElementById('reader-container');
    if (container) container.style.display = '';
    document.getElementById('editor-container').style.display = '';
    document.getElementById('btn-mode-edit').click();
  }

  const cases = [];

  // --- L'origine du corps : marge + bande, identique dans les quatre rendus ---
  Object.keys(CONFIGS).forEach(name => {
    const cfg = CONFIGS[name];
    cases.push({
      id: 'imgparity_body_origin_' + name,
      description: 'Zones « ' + name + ' » : la première ligne du corps commence à la marge du haut + ' + cfg.top + ' pt du bord de la feuille, dans l\'éditeur, la Lecture, le PDF et le Word',
      run: async (h) => {
        await setup(h, cfg.hf, BODY);
        const html = Editor.getHTML();
        const hf = Editor.getHeaderFooterData();
        const margin = PageLayout.getMarginsPt().top;
        const want = r2(margin + cfg.top);
        const editor = editorOriginPt();
        const reader = await readerOriginPt(h, html, hf);
        restoreReader(h);
        const pdf = (await pdfOf(h, html, hf)).margins[1];
        const word = (await docxOf(h, html, hf)).sect.margins.top / 20;
        const pass = [editor, reader, pdf, word].every(v => near(v, want, 0.3));
        return { pass, notes: JSON.stringify({ attendu: want, editeur: editor, lecture: reader, pdf: r2(pdf), word }) };
      },
    });
  });

  // --- Le coin de la feuille : une image tirée au-delà du bord haut gauche s'y arrête, au même endroit partout ---
  ['none', 'header', 'both', 'firstPageEmpty'].forEach(name => {
    const cfg = CONFIGS[name];
    cases.push({
      id: 'imgparity_corner_reached_' + name,
      description: 'Zones « ' + name + ' » : une image en calque tirée au-delà du coin haut gauche s\'arrête pile dans le coin de la feuille (0 ; 0), dans l\'éditeur, la Lecture, le PDF et le Word',
      run: async (h) => {
        await setup(h, cfg.hf, CORNER);
        HeaderFooterPreview.recaptureLayeredImageGrids();
        await h.sleep(100);
        const tip = document.querySelector('#editor-container .tiptap');
        const sheet = tip.parentElement.getBoundingClientRect();
        const z = zoomOf(tip);
        const ir = tip.querySelector('img.editor-image').getBoundingClientRect();
        const editor = { x: r2((ir.left - sheet.left) / z / PT), y: r2((ir.top - sheet.top) / z / PT) };
        const attrs = (() => { let a = null; EditorCore.getEditor().state.doc.descendants(n => { if (n.type.name === 'editorImage') a = n.attrs; }); return a; })();
        const html = Editor.getHTML();
        const hf = Editor.getHeaderFooterData();
        const rc = await h.renderReaderMode(html, hf);
        await h.sleep(150);
        const rr = rc.querySelector('img.editor-image').getBoundingClientRect();
        const rz = zoomOf(rc);
        const readerTop = readerTopOf(rc);
        const reader = { x: r2((rr.left - rc.getBoundingClientRect().left) / rz / PT), y: r2((rr.top - readerTop) / rz / PT) };
        restoreReader(h);
        const pdfRes = await pdfOf(h, html, hf);
        const pi = pdfRes.truth.pages[0].images[0];
        const pdf = pi ? { x: r2(pi.x), y: r2(pi.y) } : null;
        const dx = await docxOf(h, html, hf);
        const d = h.docxDrawings(dx.parts.doc)[0];
        const word = d && d.x != null ? { x: r2(d.x), y: r2(d.y) } : null;
        const all = { editeur: editor, lecture: reader, pdf, word };
        const pass = Object.values(all).every(p => p && near(p.x, 0, 0.3) && near(p.y, 0, 0.3));
        return { pass, notes: JSON.stringify({ rendus: all, grille: attrs && { pageIndex: attrs.pageIndex, pageLeftPt: attrs.pageLeftPt, pageTopPt: attrs.pageTopPt } }) };
      },
    });
  });

  cases.push({
    id: 'imgparity_corner_clamp_counts_the_band',
    description: 'La grille d\'une image tirée au-delà du coin vaut -(marge + bande) avec un en-tête, -marge sans (le bord physique de la feuille, pas la marge)',
    run: async (h) => {
      const result = {};
      for (const name of ['none', 'both']) {
        await setup(h, CONFIGS[name].hf, CORNER);
        HeaderFooterPreview.recaptureLayeredImageGrids();
        await h.sleep(100);
        let a = null;
        EditorCore.getEditor().state.doc.descendants(n => { if (n.type.name === 'editorImage') a = n.attrs; });
        result[name] = a && { left: r2(a.pageLeftPt), top: r2(a.pageTopPt) };
      }
      const m = PageLayout.getMarginsPt();
      const pass = result.none && result.both && near(result.none.top, -m.top, 0.3) && near(result.both.top, -(m.top + BAND_PT), 0.3) && near(result.both.left, -m.left, 0.3);
      return { pass, notes: JSON.stringify({ attendu: { sans: -m.top, avec: -(m.top + BAND_PT), gauche: -m.left }, mesure: result }) };
    },
  });

  // --- Une zone vide ne prend aucune place ; une zone remplie réserve la bande du PDF ---
  // Ce que les zones ajoutent au-dessus et au-dessous du bloc de texte (`.tiptap`, qui porte déjà les marges) : la bande du PDF quand elles ont du contenu,
  // rien sinon. Une zone vide reste cliquable (invitation « + En-tête »), mais dans la marge, sans rien ajouter à la page.
  cases.push({
    id: 'imgparity_zone_room_is_the_band_or_nothing',
    description: 'Éditeur : une zone d\'en-tête ou de pied vide ne prend aucune place dans la page, une zone remplie réserve la bande du PDF (55 pt) - même quand seule la page 1 est vide',
    run: async (h) => {
      const rows = {};
      for (const name of Object.keys(CONFIGS)) {
        await setup(h, CONFIGS[name].hf, BODY);
        const tip = document.querySelector('#editor-container .tiptap');
        const sheet = tip.parentElement.getBoundingClientRect();
        const t = tip.getBoundingClientRect();
        const z = zoomOf(tip);
        const above = r2((t.top - sheet.top) / z / PT);
        const below = r2((sheet.bottom - t.bottom) / z / PT);
        rows[name] = { above, below, want: { above: CONFIGS[name].top, below: CONFIGS[name].bottom } };
      }
      const bad = Object.keys(rows).filter(k => !(near(rows[k].above, rows[k].want.above, 0.3) && near(rows[k].below, rows[k].want.below, 0.3)));
      return { pass: bad.length === 0, notes: JSON.stringify({ mauvais: bad, rows }) };
    },
  });

  // --- La hauteur de page utile : mêmes coupures de page dans les trois rendus paginés ---
  const manyLines = n => Array.from({ length: n }, (_, i) => '<p>L' + String(i).padStart(3, '0') + '</p>').join('');
  ['both', 'imageOnly'].forEach(name => {
    cases.push({
      id: 'imgparity_page_capacity_' + name,
      description: 'Zones « ' + name + ' » : la page 1 contient autant de lignes dans l\'éditeur, la Lecture et le PDF (la Lecture réservait la hauteur mesurée du texte, pas la bande du PDF)',
      run: async (h) => {
        await setup(h, CONFIGS[name].hf, manyLines(140));
        const tip = document.querySelector('#editor-container .tiptap');
        const seams = Array.from(document.querySelectorAll('#editor-container .v2-page-band')).map(e => e.getBoundingClientRect().top);
        const countBefore = (root, limit) => Array.from(root.querySelectorAll(':scope > p')).filter(p => /^L\d+$/.test(p.textContent.trim()) && p.getBoundingClientRect().top < limit).length;
        const editor = seams.length ? countBefore(tip, seams[0]) : null;
        const html = Editor.getHTML();
        const hf = Editor.getHeaderFooterData();
        const rc = await h.renderReaderMode(html, hf);
        await h.sleep(200);
        const rseams = Array.from(document.querySelectorAll('#reader-container .v2-pagination-overlay .v2-page-band')).map(e => e.getBoundingClientRect().top);
        const reader = rseams.length ? countBefore(rc, rseams[0]) : null;
        restoreReader(h);
        const pdfRes = await pdfOf(h, html, hf);
        const page1 = pdfRes.truth.pages[0].textItems.filter(t => /^L\d+$/.test(t.str.trim())).length;
        const pass = editor != null && editor === reader && editor === page1;
        return { pass, notes: JSON.stringify({ lignesPage1: { editeur: editor, lecture: reader, pdf: page1 } }) };
      },
    });
  });

  // --- Le Word : mêmes marges que le PDF, en-tête et pied à la même distance ---
  cases.push({
    id: 'imgparity_word_margins_hold_the_band',
    description: 'Word : la marge du haut (du bas) vaut la marge du modèle + 55 pt quand l\'en-tête (le pied) a du contenu, la marge seule sinon ; l\'en-tête est à la moitié de la marge du haut du bord de la page, comme dans le PDF',
    run: async (h) => {
      const m = PageLayout.getMarginsPt();
      const rows = {};
      for (const name of Object.keys(CONFIGS)) {
        await setup(h, CONFIGS[name].hf, BODY);
        const dx = await docxOf(h, Editor.getHTML(), Editor.getHeaderFooterData());
        const mg = dx.sect.margins;
        rows[name] = { top: mg.top / 20, bottom: mg.bottom / 20, header: mg.header / 20 };
      }
      const bad = Object.keys(rows).filter(k => !(near(rows[k].top, m.top + CONFIGS[k].top, 0.3) && near(rows[k].bottom, m.bottom + CONFIGS[k].bottom, 0.3) && (CONFIGS[k].top === 0 || near(rows[k].header, m.top / 2, 0.3))));
      return { pass: bad.length === 0, notes: JSON.stringify({ mauvais: bad, margesPt: { haut: m.top, bas: m.bottom }, rows }) };
    },
  });

  cases.push({
    id: 'imgparity_word_layered_image_follows_the_band',
    description: 'Word : une image en calque posée à (0 ; 0) du contenu est ancrée à la marge du haut + la bande, comme dans le PDF',
    run: async (h) => {
      const grid = 'data-page-index="0" data-page-left-pt="10" data-page-top-pt="20"';
      const html = '<p><img class="editor-image" src="' + PNG + '" alt="" style="width: 60px; height: 60px; position: absolute; left: 13px; top: 27px" data-layer="front" data-wrap="inline" ' + grid + '></p><p>Corps</p>';
      const rows = {};
      for (const name of ['none', 'both']) {
        const hf = CONFIGS[name].hf;
        const pdfRes = await pdfOf(h, html, hf);
        const pi = pdfRes.truth.pages[0].images[0];
        const dx = await docxOf(h, html, hf);
        const d = h.docxDrawings(dx.parts.doc)[0];
        rows[name] = { pdf: pi && { x: r2(pi.x), y: r2(pi.y) }, word: d && { x: r2(d.x), y: r2(d.y) } };
      }
      const bad = Object.keys(rows).filter(k => !(rows[k].pdf && rows[k].word && near(rows[k].pdf.x, rows[k].word.x, 0.3) && near(rows[k].pdf.y, rows[k].word.y, 0.3)));
      return { pass: bad.length === 0, notes: JSON.stringify({ mauvais: bad, rows }) };
    },
  });

  // --- Le haut du contenu de l'en-tête : à la moitié de la marge du haut, comme le PDF ---
  cases.push({
    id: 'imgparity_header_logo_top',
    description: 'Un logo d\'en-tête est au même endroit depuis le haut de la feuille dans l\'éditeur, la Lecture, le PDF et le Word (à la marge du haut / 2, le PDF y ajoute les 2 pt de marge qu\'il laisse au-dessus d\'une image dans le texte)',
    run: async (h) => {
      await setup(h, CONFIGS.imageOnly.hf, BODY);
      const tip = document.querySelector('#editor-container .tiptap');
      const sheet = tip.parentElement.getBoundingClientRect();
      const z = zoomOf(tip);
      const logo = document.querySelector('#editor-container .v2-page-edge-top img');
      const editor = logo ? r2((logo.getBoundingClientRect().top - sheet.top) / z / PT) : null;
      const html = Editor.getHTML();
      const hf = Editor.getHeaderFooterData();
      const rc = await h.renderReaderMode(html, hf);
      await h.sleep(150);
      const rl = document.querySelector('#reader-container .v2-page-edge-top img');
      const reader = rl ? r2((rl.getBoundingClientRect().top - readerTopOf(rc)) / zoomOf(rc) / PT) : null;
      restoreReader(h);
      const pdfRes = await pdfOf(h, html, hf);
      const pdfImg = pdfRes.truth.pages[0].images[0];
      // Écart 10 de ecarts-mesures.md : le PDF laisse 2 pt au-dessus d'une image dans le texte (l'éditeur 0). À mettre à 0 quand cet écart est corrigé.
      const PDF_IMAGE_MARGIN_TOP_PT = 2;
      const pdf = pdfImg ? r2(pdfImg.y - PDF_IMAGE_MARGIN_TOP_PT) : null;
      const word = (await docxOf(h, html, hf)).sect.margins.header / 20;
      const want = r2(PageLayout.getMarginsPt().top / 2);
      const all = { editeur: editor, lecture: reader, pdf, word };
      const pass = Object.values(all).every(v => v != null && near(v, want, 0.3));
      return { pass, notes: JSON.stringify({ attendu: want, rendus: all }) };
    },
  });

  // --- Les marges restent des marges : un clic à vide ouvre la zone, une image posée dans la marge garde son clic ---
  // Les espaceurs d'en-tête et de pied recouvrent maintenant la marge de `.tiptap` : ils ne prennent pas le clic (une image tirée dans un coin de la feuille doit rester
  // atteignable), c'est js/header-footer-preview.js:zoneUnderPointer qui retrouve la zone sous le curseur. `elementFromPoint` donne le vrai résultat du test de survol.
  function pointIn(el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  function clickAt(target, x, y) {
    const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 };
    ['mousedown', 'mouseup', 'click'].forEach(type => target.dispatchEvent(new MouseEvent(type, opts)));
  }
  const isMargin = el => !!el && (el.classList.contains('tiptap') || el.classList.contains('v2-page-sheet'));

  ['none', 'both'].forEach(name => {
    cases.push({
      id: 'imgparity_margin_click_opens_the_zone_' + name,
      description: 'Zones « ' + name + ' » : un clic au milieu de la marge du haut ouvre l\'en-tête, au milieu de celle du bas le pied de page (c\'est la marge, pas l\'espaceur, qui reçoit la souris)',
      run: async (h) => {
        await setup(h, CONFIGS[name].hf, BODY);
        const rows = {};
        for (const pos of ['top', 'bottom']) {
          const zone = document.querySelector('#editor-container .v2-page-edge-' + pos);
          zone.scrollIntoView({ block: 'center' });
          await h.sleep(100);
          const c = pointIn(zone);
          const hit = document.elementFromPoint(c.x, c.y);
          clickAt(hit, c.x, c.y);
          await h.sleep(50);
          const mode = HeaderFooterPreview.getHfMode();
          rows[pos] = { cible: hit ? (hit.className || hit.tagName).toString().split(' ')[0] : null, ouvre: mode ? mode.zone : null };
          HeaderFooterPreview.exitHeaderFooterModeIfActive();
          await h.sleep(50);
        }
        const pass = ['top', 'bottom'].every(pos => rows[pos].ouvre === (pos === 'top' ? 'header' : 'footer') && ['tiptap', 'v2-page-sheet'].includes(rows[pos].cible));
        return { pass, notes: JSON.stringify(rows) };
      },
    });
  });

  cases.push({
    id: 'imgparity_margin_image_keeps_its_click',
    description: 'Avec un en-tête et un pied remplis, une image en calque posée dans le coin de la feuille (marge du haut) ou à cheval sur la marge du bas reçoit la souris : la zone ne la recouvre pas et ne s\'ouvre pas',
    run: async (h) => {
      const rows = {};
      for (const pos of ['top', 'bottom']) {
        await setup(h, CONFIGS.both.hf, pos === 'top' ? CORNER : BODY);
        if (pos === 'top') {
          HeaderFooterPreview.recaptureLayeredImageGrids();
        } else {
          // Une image de 120 px posée à cheval sur le bas de `.tiptap` (sa marge du bas est recouverte par la zone du pied).
          const tip = document.querySelector('#editor-container .tiptap');
          const top = Math.round(tip.offsetHeight - 60);
          Editor.setHTML('<p><img class="editor-image" src="' + PNG + '" alt="" style="width: 120px; height: 120px; position: absolute; left: 40px; top: ' + top + 'px; z-index: 5;" data-layer="front" data-wrap="inline"></p><p>Corps du document.</p>');
          Editor.refreshLayout();
        }
        await h.sleep(150);
        const tip = document.querySelector('#editor-container .tiptap');
        const img = tip.querySelector('img.editor-image');
        img.scrollIntoView({ block: 'center' });
        await h.sleep(100);
        const zone = document.querySelector('#editor-container .v2-page-edge-' + pos);
        const zr = zone.getBoundingClientRect();
        const ir = img.getBoundingClientRect();
        // Un point dans l'image ET dans la zone : le coin haut gauche de la feuille, ou le milieu de la marge du bas.
        const x = ir.left + ir.width / 2;
        const y = pos === 'top' ? Math.min(ir.bottom - 4, zr.bottom - 4) - 8 : Math.max(ir.top + 4, zr.top + 4) + 8;
        const inZone = y >= zr.top && y < zr.bottom && x >= zr.left && x < zr.right;
        const hit = document.elementFromPoint(x, y);
        const onImage = !!hit && !!hit.closest('.editor-image-view, img.editor-image');
        if (hit) clickAt(hit, x, y);
        await h.sleep(50);
        rows[pos] = { dansLaZone: inZone, cible: hit ? (hit.className || hit.tagName).toString().split(' ')[0] : null, surLImage: onImage, zoneOuverte: !!HeaderFooterPreview.getHfMode() };
        HeaderFooterPreview.exitHeaderFooterModeIfActive();
      }
      const pass = ['top', 'bottom'].every(pos => rows[pos].dansLaZone && rows[pos].surLImage && !rows[pos].zoneOuverte);
      return { pass, notes: JSON.stringify(rows) };
    },
  });

  cases.push({
    id: 'imgparity_margin_hover_lights_the_zone',
    description: 'Le survol d\'une marge à vide allume sa zone (classe v2-hf-zone-hover) ; un bouton de souris enfoncé (glisser une image) ou une ligne de texte l\'éteint',
    run: async (h) => {
      await setup(h, CONFIGS.none.hf, BODY);
      const tip = document.querySelector('#editor-container .tiptap');
      const zone = document.querySelector('#editor-container .v2-page-edge-top');
      zone.scrollIntoView({ block: 'center' });
      await h.sleep(100);
      const c = pointIn(zone);
      const move = (target, extra) => target.dispatchEvent(new MouseEvent('mousemove', Object.assign({ bubbles: true, clientX: c.x, clientY: c.y }, extra || {})));
      move(tip);
      const lit = zone.classList.contains('v2-hf-zone-hover');
      move(tip, { buttons: 1 });
      const dragging = zone.classList.contains('v2-hf-zone-hover');
      move(tip);
      move(tip.querySelector('p'));
      const onText = zone.classList.contains('v2-hf-zone-hover');
      return { pass: lit && !dragging && !onText, notes: JSON.stringify({ allumee: lit, boutonEnfonce: dragging, surUneLigne: onText }) };
    },
  });

  return cases;
})();
