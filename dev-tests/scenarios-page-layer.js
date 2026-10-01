// « Sur toutes les pages » (Antoine, 01/10, la Fiche mission : un triangle bleu dans le coin de chaque feuille) : une image en calque « derrière le texte » dont la case est
// cochée (data-repeat="true", js/page-layer.js) est peinte à la MÊME place de CHAQUE page. Ce groupe vérifie la case et ce que le PDF et le Word en font ; l'éditeur et la
// Lecture (copies sur les pages 2 et plus) ont leur propre suite.
//
// La place est celle de la grille page de l'image (data-page-left-pt / data-page-top-pt, points depuis le coin haut gauche du CONTENU : marges et bande d'en-tête
// comprises). Les mesures se font sur les fichiers produits (PDF relu par pdf.js, Word dézippé), jamais sur les objets d'entrée.
window.EditorTestSuites = window.EditorTestSuites || {};
window.EditorTestSuites.pageLayer = (function () {
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  // Même valeur que HF_MAX_ZONE_HEIGHT_PT + HEADER_FOOTER_GAP_PT de js/pdf-export.js (60 px = 45 pt, plus 10 pt) : la bande que le PDF réserve sous la marge du haut.
  const BAND_PT = 55;
  const EMPTY = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const HF = { enabled: true, differentFirstPage: false, header: { default: '<p>EN-TETE</p>', first: '' }, footer: { default: '<p>PIED</p>', first: '' } };
  const HF_FIRST = { enabled: true, differentFirstPage: true, header: { default: '<p>EN-TETE</p>', first: '' }, footer: { default: '<p>PIED</p>', first: '' } };
  const clone = o => JSON.parse(JSON.stringify(o));
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  const r2 = v => Math.round(v * 100) / 100;

  // Une image en calque dans son paragraphe. `grid: false` : jamais positionnée dans l'Aperçu A4 (document ancien).
  function layerImg(o) {
    const width = o.width || 120;
    const layer = o.layer || 'behind';
    const style = 'width: ' + width + 'px; height: ' + width + 'px; position: absolute; left: ' + (o.left || 0) + 'px; top: ' + (o.top || 0) + 'px; z-index: ' + (layer === 'front' ? 5 : -1) + ';'
      + (o.opacity != null ? ' opacity: ' + o.opacity + ';' : '');
    const grid = o.grid === false ? '' : ' data-page-index="' + (o.pageIndex || 0) + '" data-page-left-pt="' + (o.leftPt != null ? o.leftPt : -10) + '" data-page-top-pt="' + (o.topPt != null ? o.topPt : -20) + '"';
    return '<p><img class="editor-image" src="' + PNG + '" alt="" style="' + style + '" data-layer="' + layer + '" data-wrap="inline"' + (o.repeat ? ' data-repeat="true"' : '') + grid + '></p>';
  }
  const lines = (n, tag) => Array.from({ length: n }, (_, i) => '<p>' + (tag || 'Ligne') + ' ' + (i + 1) + ' du corps du document.</p>').join('');

  async function setup(h, hf, html, opts) {
    await h.resetEditor();
    PageLayout.setMarginsMm(null);
    h.setA4Preview(!(opts && opts.a4 === false));
    Editor.setHeaderFooterData(clone(hf));
    Editor.setHTML(html);
    Editor.refreshLayout();
    await h.sleep(250);
  }
  async function pdfOf(h, html, hf) {
    const res = await h.exportPdfContent(html, hf, PageLayout.getMarginsPt());
    return { res, truth: await h.extractPdfGroundTruth(res.base64) };
  }
  async function docxOf(h, html, hf) {
    const parts = await h.exportDocxParts(html, hf, PageLayout.getMarginsTwip());
    const headers = parts.names.filter(n => /^word\/header\d+\.xml$/.test(n)).map(name => ({ name, text: parts.parts[name], drawings: h.docxDrawings(parts.part(name)) }));
    return { parts, sect: h.docxSectionProps(parts.doc), headers, body: h.docxDrawings(parts.doc) };
  }
  // Un nœud du contenu pdfmake qui porte encore une position absolue (une image restée dans le flux) ; les listes privées de l'export (`_…`, dont les images répétées, qui ne sont
  // plus dans le flux) et les liens vers les parents que pdfmake accroche sont laissés de côté.
  function anyAbsolutePosition(node, seen) {
    seen = seen || new Set();
    if (!node || typeof node !== 'object' || seen.has(node)) return false;
    seen.add(node);
    if (node.absolutePosition) return true;
    return Object.keys(node).some(k => k !== 'positions' && k[0] !== '_' && anyAbsolutePosition(node[k], seen));
  }
  const imageNode = () => { let found = null; EditorCore.getEditor().state.doc.descendants(n => { if (!found && n.type.name === 'editorImage') found = n; }); return found; };
  const repeatButton = () => document.querySelector('.v2-floating-toolbar button[data-action="repeat"]');
  const press = btn => btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  async function selectImage(h) {
    await h.selectAtomNode(h.tiptap().querySelector('img.editor-image'));
    await h.sleep(80);
  }

  const cases = [];

  // --- La case dans le modèle ---
  cases.push({
    id: 'pagelayer_attr_round_trip',
    description: 'La case s\'écrit data-repeat="true" dans le HTML du modèle et se relit ; elle ne vaut rien devant le texte ni sans grille page (PageLayer.isRepeatedAttrs)',
    run: async (h) => {
      await setup(h, EMPTY, layerImg({ repeat: true }) + lines(2));
      const html = Editor.getHTML();
      const node = imageNode();
      const wrote = /data-repeat="true"/.test(html);
      const read = !!node && node.attrs.repeat === true && PageLayer.isRepeatedAttrs(node.attrs);
      const probe = (extra) => { const d = document.createElement('div'); d.innerHTML = layerImg(extra); return d.querySelector('img'); };
      const front = PageLayer.isRepeatedEl(probe({ layer: 'front', repeat: true }));
      const noGrid = PageLayer.isRepeatedEl(probe({ repeat: true, grid: false }));
      const unchecked = PageLayer.isRepeatedEl(probe({ repeat: false }));
      const behind = PageLayer.isRepeatedEl(probe({ repeat: true }));
      return { pass: wrote && read && behind && !front && !noGrid && !unchecked, notes: JSON.stringify({ wrote, read, behind, front, noGrid, unchecked }) };
    },
  });

  // --- La case dans la barre flottante de l'image ---
  cases.push({
    id: 'pagelayer_toolbar_toggle_on_off',
    description: 'Barre de l\'image, image derrière le texte : « Sur toutes les pages » coche puis décoche la case (HTML, bouton enfoncé)',
    run: async (h) => {
      await setup(h, EMPTY, layerImg({}) + lines(2));
      await selectImage(h);
      const btn = repeatButton();
      if (!btn) return { pass: false, notes: 'bouton « Sur toutes les pages » introuvable dans la barre de l\'image' };
      const enabled = !btn.classList.contains('is-disabled') && btn.getAttribute('aria-disabled') === 'false';
      press(btn); await h.sleep(80);
      const on = { html: /data-repeat="true"/.test(Editor.getHTML()), pressed: repeatButton().getAttribute('aria-pressed') === 'true', active: repeatButton().classList.contains('is-active') };
      press(repeatButton()); await h.sleep(80);
      const off = { html: /data-repeat="true"/.test(Editor.getHTML()), pressed: repeatButton().getAttribute('aria-pressed') === 'true' };
      return { pass: enabled && on.html && on.pressed && on.active && !off.html && !off.pressed, notes: JSON.stringify({ enabled, on, off, titre: btn.title }) };
    },
  });

  cases.push({
    id: 'pagelayer_toolbar_greyed_unless_behind',
    description: 'Barre de l\'image : « Sur toutes les pages » est grisée (jamais retirée, info-bulle qui dit pourquoi) pour une image dans le texte ou devant le texte, et un clic dessus ne change rien',
    run: async (h) => {
      const rows = {};
      for (const layer of ['normal', 'front']) {
        const html = layer === 'normal'
          ? '<p><img class="editor-image" src="' + PNG + '" alt="" style="width: 120px" data-layer="normal" data-wrap="inline"></p>' + lines(2)
          : layerImg({ layer: 'front' }) + lines(2);
        await setup(h, EMPTY, html);
        await selectImage(h);
        const btn = repeatButton();
        if (!btn) { rows[layer] = { absent: true }; continue; }
        const before = Editor.getHTML();
        press(btn); await h.sleep(80);
        rows[layer] = {
          disabled: btn.classList.contains('is-disabled'), aria: btn.getAttribute('aria-disabled'), titre: btn.title === I18n.t('imgToolbar.repeatNeedsBehind'),
          unchanged: Editor.getHTML() === before,
        };
      }
      const pass = Object.values(rows).every(r => r.disabled && r.aria === 'true' && r.titre && r.unchanged);
      return { pass, notes: JSON.stringify(rows) };
    },
  });

  cases.push({
    id: 'pagelayer_leaving_behind_clears_the_box',
    description: 'Une image répétée qui passe devant le texte (ou dans le texte) perd sa case ; revenue derrière le texte, elle ne la retrouve pas',
    run: async (h) => {
      await setup(h, EMPTY, layerImg({ repeat: true }) + lines(2));
      await selectImage(h);
      const frontBtn = document.querySelector('.v2-floating-toolbar button[data-action="layer-front"]');
      if (!frontBtn) return { pass: false, notes: 'bouton « Devant le texte » introuvable' };
      press(frontBtn); await h.sleep(100);
      const afterFront = { layer: imageNode().attrs.layer, repeat: imageNode().attrs.repeat, html: /data-repeat/.test(Editor.getHTML()) };
      press(document.querySelector('.v2-floating-toolbar button[data-action="layer-behind"]')); await h.sleep(100);
      const afterBack = { layer: imageNode().attrs.layer, repeat: imageNode().attrs.repeat, html: /data-repeat/.test(Editor.getHTML()) };
      const pass = afterFront.layer === 'front' && afterFront.repeat === false && !afterFront.html && afterBack.layer === 'behind' && afterBack.repeat === false && !afterBack.html;
      return { pass, notes: JSON.stringify({ afterFront, afterBack }) };
    },
  });

  cases.push({
    id: 'pagelayer_toggle_needs_the_a4_preview_for_an_image_without_a_page_grid',
    description: 'Une image derrière le texte chargée sans l\'Aperçu A4 (aucune place de page) : « Sur toutes les pages » est grisée et dit pourquoi ; l\'Aperçu A4 revenu, cocher la case capture sa place de page',
    run: async (h) => {
      await setup(h, EMPTY, layerImg({ grid: false, left: 90, top: 110 }) + lines(2), { a4: false });
      const before = imageNode().attrs;
      await selectImage(h);
      const btn = repeatButton();
      const grey = !!btn && btn.classList.contains('is-disabled') && btn.title === I18n.t('imgToolbar.repeatNeedsPage');
      const htmlBefore = Editor.getHTML();
      if (btn) press(btn);
      await h.sleep(80);
      const unchanged = Editor.getHTML() === htmlBefore;
      h.setA4Preview(true);
      Editor.refreshLayout();
      await h.sleep(200);
      await selectImage(h);
      const enabled = !!repeatButton() && !repeatButton().classList.contains('is-disabled');
      if (repeatButton()) press(repeatButton());
      await h.sleep(120);
      const a = imageNode().attrs;
      const captured = a.repeat === true && Number.isFinite(a.pageLeftPt) && Number.isFinite(a.pageTopPt) && PageLayer.isRepeatedAttrs(a);
      return { pass: !Number.isFinite(before.pageLeftPt) && grey && unchanged && enabled && captured, notes: JSON.stringify({ sansApercu: { grille: Number.isFinite(before.pageLeftPt), grey, unchanged }, avecApercu: { enabled, repeat: a.repeat, left: a.pageLeftPt, top: a.pageTopPt } }) };
    },
  });

  // --- Le PDF : en fond de chaque page, à la même place ---
  cases.push({
    id: 'pagelayer_pdf_every_page_same_place',
    description: 'PDF de trois pages avec en-tête et pied : l\'image répétée est sur chacune, à (marge + position, marge + bande + position) ; la même image non répétée n\'est que sur la page 1',
    run: async (h) => {
      const m = PageLayout.getMarginsPt();
      const html = body => body + lines(120);
      await setup(h, HF, html(layerImg({ repeat: true, leftPt: -10, topPt: -20 })));
      const repeated = await pdfOf(h, Editor.getHTML(), Editor.getHeaderFooterData());
      await setup(h, HF, html(layerImg({ repeat: false, leftPt: -10, topPt: -20 })));
      const single = await pdfOf(h, Editor.getHTML(), Editor.getHeaderFooterData());
      const want = { x: r2(m.left - 10), y: r2(m.top + BAND_PT - 20) };
      const perPage = repeated.truth.pages.map(p => p.images.map(i => ({ x: r2(i.x), y: r2(i.y), w: r2(i.width) })));
      const everywhere = perPage.length >= 3 && perPage.every(list => list.length === 1 && near(list[0].x, want.x, 0.5) && near(list[0].y, want.y, 0.5) && near(list[0].w, 90, 0.5));
      const singleCounts = single.truth.pages.map(p => p.images.length);
      const onlyFirst = singleCounts.length >= 3 && singleCounts[0] === 1 && singleCounts.slice(1).every(n => n === 0);
      return { pass: everywhere && onlyFirst, notes: JSON.stringify({ attendu: want, repete: perPage, nonRepete: singleCounts }) };
    },
  });

  cases.push({
    id: 'pagelayer_pdf_two_layers_and_opacity',
    description: 'PDF : deux images répétées sont sur chaque page, l\'opacité de chacune est gardée, et la couche reste DERRIÈRE le texte (fond de page : appelée page par page, avant le contenu)',
    run: async (h) => {
      await setup(h, EMPTY, layerImg({ repeat: true, leftPt: -28, topPt: -28, width: 120 }) + layerImg({ repeat: true, leftPt: 300, topPt: 600, width: 80, opacity: 0.5 }) + lines(120));
      const { res, truth } = await pdfOf(h, Editor.getHTML(), Editor.getHeaderFooterData());
      const bg = res.docDefinition.background;
      const page2 = typeof bg === 'function' ? bg(2) : null;
      const opacities = (page2 || []).map(n => n.opacity == null ? 1 : n.opacity).sort();
      const perPage = truth.pages.map(p => p.images.map(i => r2(i.width)).sort((a, b) => a - b));
      const both = perPage.length >= 3 && perPage.every(w => w.length === 2 && near(w[0], 60, 0.5) && near(w[1], 90, 0.5));
      const inFlow = anyAbsolutePosition(res.docDefinition.content);
      return { pass: both && !!page2 && page2.length === 2 && opacities[0] === 0.5 && opacities[1] === 1 && !inFlow, notes: JSON.stringify({ perPage, fond: !!page2, opacities, dansLeFlux: inFlow }) };
    },
  });

  cases.push({
    id: 'pagelayer_pdf_macro_courriers',
    description: 'Macro-modèle de deux courriers de deux pages : l\'image répétée du premier courrier est sur ses pages seulement, celle du second sur les siennes seulement',
    run: async (h) => {
      const first = layerImg({ repeat: true, leftPt: -28, topPt: -28, width: 120 }) + lines(70, 'Premier');
      const second = MacroTemplates.slotBreakHtml(1) + layerImg({ repeat: true, leftPt: 100, topPt: 100, width: 80 }) + lines(70, 'Second');
      await setup(h, EMPTY, first + second);
      const { truth } = await pdfOf(h, first + second, EMPTY);
      const perPage = truth.pages.map(p => p.images.map(i => r2(i.width)));
      const ok = perPage.length === 4 && [0, 1].every(i => perPage[i].length === 1 && near(perPage[i][0], 90, 0.5)) && [2, 3].every(i => perPage[i].length === 1 && near(perPage[i][0], 60, 0.5));
      return { pass: ok, notes: JSON.stringify({ largeursParPage: perPage }) };
    },
  });

  cases.push({
    id: 'pagelayer_pdf_without_grid_is_not_repeated',
    description: 'Une image cochée mais sans grille page (document ancien, jamais positionné dans l\'Aperçu A4) n\'est pas répétée : le PDF la garde où elle est, comme avant',
    run: async (h) => {
      await setup(h, EMPTY, lines(120));
      // Le HTML tel que l'enregistrement l'a gardé : l'éditeur, lui, mesure une grille à l'ouverture, d'où le HTML direct.
      const { truth } = await pdfOf(h, layerImg({ repeat: true, grid: false, left: 60, top: 80 }) + lines(120), EMPTY);
      const counts = truth.pages.map(p => p.images.length);
      return { pass: counts.length >= 3 && counts[0] === 1 && counts.slice(1).every(n => n === 0), notes: JSON.stringify({ imagesParPage: counts }) };
    },
  });

  // Le triangle répété posé juste après un saut de page (début du courrier suivant) : l'image sort du flux du PDF et emportait le saut avec elle (cas génériques dans `pdfGroundTruth`,
  // `pdfgt_page_break_before_a_layer_only_paragraph_*`) ; ici, le saut tient ET l'image est sur chaque page.
  cases.push({
    id: 'pagelayer_pdf_page_break_before_the_repeated_image',
    description: 'PDF : un saut de page suivi d\'une image répétée seule dans son paragraphe ouvre bien une nouvelle page (le texte d\'après ne reste pas sous celui d\'avant) et l\'image est sur chaque page',
    run: async (h) => {
      await setup(h, EMPTY, lines(5));
      const html = lines(70, 'Premier') + MacroTemplates.PAGE_BREAK_HTML + layerImg({ repeat: true, leftPt: 100, topPt: 100, width: 80, pageIndex: 2 }) + lines(70, 'Second');
      const { truth } = await pdfOf(h, html, EMPTY);
      const mixed = truth.pages.some(p => p.textItems.some(t => /Premier/.test(t.str)) && p.textItems.some(t => /Second/.test(t.str)));
      const firstSecond = truth.pages.findIndex(p => p.textItems.some(t => /Second/.test(t.str)));
      const topOfPage = firstSecond > 0 && !!truth.pages[firstSecond].textItems[0] && /Second/.test(truth.pages[firstSecond].textItems[0].str);
      const painted = truth.pages.map(p => p.images.length);
      return { pass: !mixed && topOfPage && painted.length === 4 && painted.every(n => n === 1), notes: JSON.stringify({ pages: truth.pages.length, textesMelanges: mixed, premiereDuSecond: firstSecond + 1, enHaut: topOfPage, imagesParPage: painted }) };
    },
  });

  // --- Le Word : ancres derrière le texte dans l'en-tête de chaque page ---
  cases.push({
    id: 'pagelayer_docx_every_header',
    description: 'Word, première page différente : l\'en-tête de la page 1 et celui des autres portent chacun l\'ancre de l\'image (derrière le texte, relative à la PAGE, marge + bande + position) ; le corps n\'en a plus',
    run: async (h) => {
      const m = PageLayout.getMarginsPt();
      await setup(h, HF_FIRST, layerImg({ repeat: true, leftPt: -10, topPt: -20 }) + lines(40));
      const d = await docxOf(h, Editor.getHTML(), Editor.getHeaderFooterData());
      const want = { x: r2(m.left - 10), y: r2(m.top + BAND_PT - 20) };
      const anchors = d.headers.map(hd => hd.drawings.filter(a => a.kind === 'anchor'));
      const good = anchors.length === 2 && anchors.every(list => list.length === 1 && list[0].behindDoc && list[0].relativeFrom.h === 'page' && list[0].relativeFrom.v === 'page'
        && near(list[0].x, want.x, 0.3) && near(list[0].y, want.y, 0.3) && near(list[0].widthPt, 90, 0.3));
      const refs = d.sect && d.sect.headerRefs.slice().sort().join(',') === 'default,first' && d.sect.titlePg;
      return { pass: good && !!refs && d.body.length === 0, notes: JSON.stringify({ attendu: want, ancres: anchors, refs: d.sect && d.sect.headerRefs, corps: d.body.length }) };
    },
  });

  cases.push({
    id: 'pagelayer_docx_no_header_creates_one',
    description: 'Word, sans en-tête ni pied : un en-tête est créé pour porter l\'image répétée, les marges de la page ne changent pas (pas de bande)',
    run: async (h) => {
      const m = PageLayout.getMarginsPt();
      await setup(h, EMPTY, layerImg({ repeat: true, leftPt: -28, topPt: -28 }) + lines(10));
      const d = await docxOf(h, Editor.getHTML(), Editor.getHeaderFooterData());
      const anchors = d.headers.flatMap(hd => hd.drawings.filter(a => a.kind === 'anchor'));
      const margins = d.sect && d.sect.margins;
      const pass = d.headers.length === 1 && anchors.length === 1 && near(anchors[0].x, 0, 0.3) && near(anchors[0].y, 0, 0.3) && !!margins && near(margins.top / 20, m.top, 0.1) && near(margins.bottom / 20, m.bottom, 0.1)
        && d.sect.headerRefs.join(',') === 'default' && !d.sect.titlePg;
      return { pass, notes: JSON.stringify({ en_tetes: d.headers.length, ancres: anchors, marges: margins, refs: d.sect && d.sect.headerRefs }) };
    },
  });

  cases.push({
    id: 'pagelayer_docx_keeps_the_header_text_and_ids',
    description: 'Word : l\'en-tête garde son texte à côté de l\'ancre, et les numéros d\'objet (wp:docPr) de l\'en-tête sont tous différents, dont ceux d\'un logo de l\'en-tête',
    run: async (h) => {
      const logo = '<p><img class="editor-image" src="' + PNG + '" alt="" style="width: 60px; height: 60px" data-layer="normal" data-wrap="inline"></p>';
      const hf = { enabled: true, differentFirstPage: false, header: { default: '<p>EN-TETE</p>' + logo, first: '' }, footer: { default: '', first: '' } };
      await setup(h, hf, layerImg({ repeat: true }) + lines(10));
      const d = await docxOf(h, Editor.getHTML(), Editor.getHeaderFooterData());
      const header = d.headers[0];
      const ids = header ? header.drawings.map(a => a.docPrId) : [];
      const hasText = !!header && header.text.includes('EN-TETE');
      const pass = d.headers.length === 1 && hasText && header.drawings.length === 2 && header.drawings.filter(a => a.kind === 'anchor').length === 1 && new Set(ids).size === ids.length;
      return { pass, notes: JSON.stringify({ texte: hasText, dessins: header && header.drawings.map(a => ({ kind: a.kind, id: a.docPrId })) }) };
    },
  });

  cases.push({
    id: 'pagelayer_docx_normal_layers_stay_in_the_body',
    description: 'Word : une image derrière le texte NON répétée reste ancrée dans le corps, et ne crée aucun en-tête',
    run: async (h) => {
      await setup(h, EMPTY, layerImg({ repeat: false }) + lines(10));
      const d = await docxOf(h, Editor.getHTML(), Editor.getHeaderFooterData());
      const pass = d.headers.length === 0 && d.body.filter(a => a.kind === 'anchor').length === 1 && d.sect.headerRefs.length === 0;
      return { pass, notes: JSON.stringify({ en_tetes: d.headers.length, corps: d.body.length, refs: d.sect && d.sect.headerRefs }) };
    },
  });

  cases.push({
    id: 'pagelayer_pdf_and_word_same_place',
    description: 'La même image répétée tombe au même endroit de la feuille dans le PDF (page 2) et dans le Word (en-tête), avec un en-tête et un pied',
    run: async (h) => {
      await setup(h, HF, layerImg({ repeat: true, leftPt: 40, topPt: 70 }) + lines(120));
      const html = Editor.getHTML();
      const hf = Editor.getHeaderFooterData();
      const pdf = (await pdfOf(h, html, hf)).truth.pages[1].images[0];
      const d = await docxOf(h, html, hf);
      const word = d.headers.flatMap(hd => hd.drawings.filter(a => a.kind === 'anchor'))[0];
      return { pass: !!pdf && !!word && near(pdf.x, word.x, 0.3) && near(pdf.y, word.y, 0.3), notes: JSON.stringify({ pdf: pdf && { x: r2(pdf.x), y: r2(pdf.y) }, word: word && { x: r2(word.x), y: r2(word.y) } }) };
    },
  });

  return cases;
})();
