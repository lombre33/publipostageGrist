// « Pages entières » (Antoine, 01/10 15:55) : chaque feuille est dessinée à sa taille réelle dans l'éditeur et dans la Lecture, la dernière comprise (un modèle d'une ligne montre
// une page A4 entière) ; la couture entre deux feuilles rejoue le bas de la page qui finit, la gouttière, le haut de la page qui commence. C'est ce qui donne une vraie place au coin
// d'une page 2 : les copies de « Sur toutes les pages » (js/page-layer.js) s'y peignent, à la même place que dans le PDF (fond de page de pdfmake) et que dans le Word.
//
// Les mesures sont celles du rendu (rectangles du DOM, ramenés en pixels de mise en page par le zoom de la feuille) ; la place des copies est comparée au PDF relu par pdf.js.
window.EditorTestSuites = window.EditorTestSuites || {};
window.EditorTestSuites.fullPages = (function () {
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const PT = 96 / 72;
  // Même valeur que HF_MAX_ZONE_HEIGHT_PT + HEADER_FOOTER_GAP_PT de js/pdf-export.js : la bande que le PDF réserve sous la marge du haut (et au-dessus de celle du bas).
  const BAND_PT = 55;
  const EMPTY = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const HF = { enabled: true, differentFirstPage: false, header: { default: '<p>EN-TETE</p>', first: '' }, footer: { default: '<p>PIED</p>', first: '' } };
  const clone = o => JSON.parse(JSON.stringify(o));
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  const r2 = v => Math.round(v * 100) / 100;
  const lines = (n, tag) => Array.from({ length: n }, (_, i) => '<p>' + (tag || 'Ligne') + ' ' + (i + 1) + ' du corps du document.</p>').join('');
  const BREAK = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';

  // Une image en calque dans son paragraphe, avec sa grille page (points depuis le coin du contenu de SA page) et le `left`/`top` en pixels qui lui correspond sur la première page :
  // depuis le bord de `.tiptap` (la marge comprise), jamais depuis le haut de la feuille - la bande de l'en-tête est au-dessus de `.tiptap`.
  function layerImg(o) {
    const m = PageLayout.getMarginsPx();
    const width = o.width || 120;
    const leftPt = o.leftPt != null ? o.leftPt : -10;
    const topPt = o.topPt != null ? o.topPt : -20;
    const left = o.left != null ? o.left : m.left + leftPt * PT;
    const top = o.top != null ? o.top : m.top + topPt * PT;
    const style = 'width: ' + width + 'px; height: ' + width + 'px; position: absolute; left: ' + left + 'px; top: ' + top + 'px; z-index: -1;';
    return '<p><img class="editor-image" src="' + PNG + '" alt="" style="' + style + '" data-layer="behind" data-wrap="inline"' + (o.repeat ? ' data-repeat="true"' : '')
      + ' data-page-index="' + (o.pageIndex || 0) + '" data-page-left-pt="' + leftPt + '" data-page-top-pt="' + topPt + '"></p>';
  }

  async function setup(h, hf, html) {
    await h.resetEditor();
    PageLayout.setMarginsMm(null);
    h.setA4Preview(true);
    Editor.setHeaderFooterData(clone(hf));
    Editor.setHTML(html);
    Editor.refreshLayout();
    await h.sleep(300);
  }
  function restoreReader(h) {
    const container = document.getElementById('reader-container');
    if (container) container.style.display = '';
    document.getElementById('editor-container').style.display = '';
    document.getElementById('btn-mode-edit').click();
  }
  async function pdfOf(h, html, hf) {
    const res = await h.exportPdfContent(html, hf, PageLayout.getMarginsPt());
    return { res, truth: await h.extractPdfGroundTruth(res.base64) };
  }
  const zoomOf = el => { const z = parseFloat(getComputedStyle(el).zoom); return isFinite(z) && z > 0 ? z : 1; };
  const pageHeightPx = () => PageLayout.getPageSizePx().height;
  const bandPx = hf => (hf.enabled ? (60 + 10 * PT) : 0);

  // La pile de feuilles de l'éditeur : le haut de chaque page et sa hauteur, en pixels de mise en page depuis le haut de la feuille.
  function editorPages() {
    const ec = document.getElementById('editor-container');
    const sheet = ec.querySelector('.v2-page-sheet');
    const z = zoomOf(sheet);
    const sr = sheet.getBoundingClientRect();
    const seams = Array.from(ec.querySelectorAll('.v2-pagination-overlay .v2-page-band')).map(s => ({
      el: s, rect: s.getBoundingClientRect(), foot: s.querySelector('.v2-page-seam-foot'), divider: s.querySelector('.v2-page-seam-divider'), head: s.querySelector('.v2-page-seam-head'),
    }));
    const pages = [];
    seams.forEach((s, k) => {
      const top = k === 0 ? sr.top : seams[k - 1].divider.getBoundingClientRect().bottom;
      pages.push({ topScreen: top, top: (top - sr.top) / z, height: (s.divider.getBoundingClientRect().top - top) / z });
    });
    const lastTop = seams.length ? seams[seams.length - 1].divider.getBoundingClientRect().bottom : sr.top;
    pages.push({ topScreen: lastTop, top: (lastTop - sr.top) / z, height: (sr.bottom - lastTop) / z });
    return { ec, sheet, z, sheetRect: sr, seams, pages };
  }
  function readerPages() {
    const rc = document.getElementById('reader-container');
    const paper = rc.querySelector('.v2-reader-paper');
    const z = zoomOf(rc.querySelector('.reader-content'));
    const pr = paper.getBoundingClientRect();
    const seams = Array.from(rc.querySelectorAll('.v2-pagination-overlay .v2-page-band')).map(s => ({
      el: s, rect: s.getBoundingClientRect(), foot: s.querySelector('.v2-page-seam-foot'), divider: s.querySelector('.v2-page-seam-divider'), head: s.querySelector('.v2-page-seam-head'),
    }));
    const pages = [];
    seams.forEach((s, k) => {
      const top = k === 0 ? pr.top : seams[k - 1].divider.getBoundingClientRect().bottom;
      pages.push({ topScreen: top, top: (top - pr.top) / z, height: (s.divider.getBoundingClientRect().top - top) / z });
    });
    const lastTop = seams.length ? seams[seams.length - 1].divider.getBoundingClientRect().bottom : pr.top;
    pages.push({ topScreen: lastTop, top: (lastTop - pr.top) / z, height: (pr.bottom - lastTop) / z });
    return { rc, paper, z, paperRect: pr, seams, pages };
  }
  const allWhole = (pages, H) => pages.every(p => near(p.height, H, 0.6));
  // Glisse une image en calque par sa poignée de déplacement, avec les événements que sa vue attend (mousedown sur la poignée, mousemove et mouseup sur le document) :
  // `dx`, `dy` en pixels écran. Rend le centre de la poignée avant le geste.
  function dragImageBy(wrap, dx, dy) {
    const handle = wrap.querySelector('.editor-image-move-handle');
    const hr = handle.getBoundingClientRect();
    const x = hr.left + hr.width / 2, y = hr.top + hr.height / 2;
    const ev = (type, px, py) => new MouseEvent(type, { bubbles: true, cancelable: true, clientX: px, clientY: py, button: 0, view: window });
    handle.dispatchEvent(ev('mousedown', x, y));
    document.dispatchEvent(ev('mousemove', x + dx / 2, y + dy / 2));
    document.dispatchEvent(ev('mousemove', x + dx, y + dy));
    document.dispatchEvent(ev('mouseup', x + dx, y + dy));
    return { x, y };
  }
  const firstImageAttrs = () => { let found = null; EditorCore.getEditor().state.doc.descendants(n => { if (!found && n.type.name === 'editorImage') found = n.attrs; }); return found; };

  const cases = [];

  // --- La hauteur de chaque feuille, dans l'éditeur ---
  [['sans en-tête ni pied', EMPTY], ['avec un en-tête et un pied', HF]].forEach(([label, hf]) => {
    cases.push({
      id: 'fullpages_editor_every_sheet_is_a_whole_page_' + (hf.enabled ? 'hf' : 'plain'),
      description: 'Éditeur, ' + label + ' : un long texte, la dernière page comprise, donne autant de feuilles que de pages et CHACUNE a la hauteur de la page (le dessin de la couture rend le bas de la page qui finit, la gouttière, le haut de la page qui commence)',
      run: async (h) => {
        await setup(h, hf, lines(130));
        const g = editorPages();
        const H = pageHeightPx();
        const gutter = g.seams.map(s => s.divider.getBoundingClientRect().height / g.z);
        const total = g.pages.length * H + (g.pages.length - 1) * gutter[0];
        const sheetHeight = g.sheetRect.height / g.z;
        const pass = g.pages.length >= 3 && allWhole(g.pages, H) && near(sheetHeight, total, 1);
        return { pass, notes: JSON.stringify({ H: r2(H), pages: g.pages.map(p => r2(p.height)), gouttieres: gutter.map(r2), feuille: r2(sheetHeight), attendu: r2(total) }) };
      },
    });
  });

  cases.push({
    id: 'fullpages_editor_one_line_is_one_whole_sheet',
    description: 'Éditeur : un modèle d\'une seule ligne montre une page entière (la dernière page est complétée jusqu\'à sa hauteur), sans et avec en-tête et pied',
    run: async (h) => {
      const rows = [];
      for (const hf of [EMPTY, HF]) {
        await setup(h, hf, '<p>Une seule ligne</p>');
        const g = editorPages();
        rows.push({ hf: hf.enabled, pages: g.pages.length, hauteur: r2(g.sheetRect.height / g.z) });
      }
      const H = pageHeightPx();
      return { pass: rows.every(r => r.pages === 1 && near(r.hauteur, H, 0.6)), notes: JSON.stringify({ H: r2(H), rows }) };
    },
  });

  cases.push({
    id: 'fullpages_editor_forced_breaks_make_whole_pages',
    description: 'Éditeur : deux sauts de page forcés donnent trois feuilles entières, le repère « Saut de page » compris dans la hauteur de la page qu\'il ferme',
    run: async (h) => {
      await setup(h, HF, '<p>Un</p>' + BREAK + '<p>Deux</p>' + BREAK + '<p>Trois</p>');
      const g = editorPages();
      const H = pageHeightPx();
      return { pass: g.pages.length === 3 && allWhole(g.pages, H), notes: JSON.stringify({ H: r2(H), pages: g.pages.map(p => r2(p.height)) }) };
    },
  });

  cases.push({
    id: 'fullpages_editor_page_two_does_not_move_when_page_one_changes',
    description: 'Éditeur : ajouter des lignes sur la page 1 ne déplace pas la page 2 (les pages ont toutes la même hauteur : le haut de la page 2 est toujours à une page et une gouttière du haut de la feuille)',
    run: async (h) => {
      const tops = [];
      for (const n of [60, 63, 70]) {
        await setup(h, HF, lines(n));
        tops.push(r2(editorPages().pages[1].top));
      }
      return { pass: tops.every(t => near(t, tops[0], 0.6)), notes: JSON.stringify({ hautDeLaPage2: tops }) };
    },
  });

  cases.push({
    id: 'fullpages_editor_seam_is_foot_gutter_head',
    description: 'Éditeur : la couture se compose du bas de la page qui finit (marge du bas + bande du pied), de la gouttière, du haut de la page qui commence (bande de l\'en-tête + marge du haut) ; le bas et le haut sont transparents et laissent passer la souris, la gouttière est pleine',
    run: async (h) => {
      const rows = [];
      for (const hf of [EMPTY, HF]) {
        await setup(h, hf, lines(100));
        const g = editorPages();
        const m = PageLayout.getMarginsPx();
        const band = bandPx(hf);
        const s = g.seams[0];
        const foot = s.foot.getBoundingClientRect().height / g.z;
        const head = s.head.getBoundingClientRect().height / g.z;
        const cs = el => getComputedStyle(el);
        rows.push({
          hf: hf.enabled,
          foot: r2(foot), footAttendu: r2(m.bottom + band), head: r2(head), headAttendu: r2(m.top + band),
          footTransparent: cs(s.foot).backgroundColor === 'rgba(0, 0, 0, 0)',
          headTransparent: cs(s.head).backgroundColor === 'rgba(0, 0, 0, 0)',
          gouttierePleine: cs(s.divider).backgroundColor !== 'rgba(0, 0, 0, 0)' && cs(s.divider).pointerEvents !== 'none',
          coutureSansSouris: cs(s.el).pointerEvents === 'none',
        });
      }
      const pass = rows.every(r => near(r.foot, r.footAttendu, 0.6) && near(r.head, r.headAttendu, 0.6) && r.footTransparent && r.headTransparent && r.gouttierePleine && r.coutureSansSouris);
      return { pass, notes: JSON.stringify(rows) };
    },
  });

  cases.push({
    id: 'fullpages_editor_footer_and_header_in_the_seam',
    description: 'Éditeur : le pied de la page qui finit est tout en haut du bas de page (juste sous le texte), l\'en-tête de la page qui commence est à la moitié de la marge du haut de la feuille ; ni l\'un ni l\'autre n\'a de marge de paragraphe en plus',
    run: async (h) => {
      await setup(h, HF, lines(100));
      const g = editorPages();
      const m = PageLayout.getMarginsPx();
      const s = g.seams[0];
      const footerBox = s.el.querySelector('.v2-page-band-footer');
      const headerBox = s.el.querySelector('.v2-page-band-header');
      const footP = footerBox.querySelector('p').getBoundingClientRect();
      const headP = headerBox.querySelector('p').getBoundingClientRect();
      const footOffset = (footP.top - s.foot.getBoundingClientRect().top) / g.z;
      const headOffset = (headP.top - s.divider.getBoundingClientRect().bottom) / g.z;
      // La zone du pied a une bordure en pointillé de 1 px en haut : le texte commence juste dessous.
      const pass = near(footOffset, 1, 1.2) && near(headOffset, m.top / 2, 1.2);
      return { pass, notes: JSON.stringify({ piedSousLeTexte: r2(footOffset), enteteDepuisLeHautDeLaPage: r2(headOffset), demiMarge: r2(m.top / 2) }) };
    },
  });

  // --- La Lecture : les mêmes feuilles ---
  cases.push({
    id: 'fullpages_reader_same_sheets_as_the_editor',
    description: 'Lecture : même texte, mêmes pages que l\'éditeur - la même hauteur de page, les mêmes gouttières à la même distance du haut de la feuille, un seul fond blanc de la hauteur de la pile',
    run: async (h) => {
      const rows = [];
      for (const hf of [EMPTY, HF]) {
        await setup(h, hf, lines(130));
        const e = editorPages();
        await h.renderReaderMode(Editor.getHTML(), Editor.getHeaderFooterData());
        await h.sleep(250);
        const r = readerPages();
        restoreReader(h);
        const H = pageHeightPx();
        rows.push({
          hf: hf.enabled, pagesEditeur: e.pages.length, pagesLecture: r.pages.length,
          entieres: allWhole(r.pages, H), memesHauts: e.pages.length === r.pages.length && e.pages.every((p, k) => near(p.top, r.pages[k].top, 0.8)),
          fond: r2(r.paperRect.height / r.z), feuilleEditeur: r2(e.sheetRect.height / e.z),
        });
      }
      return { pass: rows.every(x => x.pagesEditeur >= 3 && x.pagesEditeur === x.pagesLecture && x.entieres && x.memesHauts && near(x.fond, x.feuilleEditeur, 1)), notes: JSON.stringify(rows) };
    },
  });

  cases.push({
    id: 'fullpages_reader_one_line_is_one_whole_sheet',
    description: 'Lecture : un modèle d\'une ligne montre une page entière, sans et avec en-tête et pied',
    run: async (h) => {
      const rows = [];
      for (const hf of [EMPTY, HF]) {
        await setup(h, hf, '<p>Une seule ligne</p>');
        await h.renderReaderMode(Editor.getHTML(), Editor.getHeaderFooterData());
        await h.sleep(200);
        const r = readerPages();
        restoreReader(h);
        rows.push({ hf: hf.enabled, pages: r.pages.length, hauteur: r2(r.paperRect.height / r.z) });
      }
      const H = pageHeightPx();
      return { pass: rows.every(x => x.pages === 1 && near(x.hauteur, H, 0.6)), notes: JSON.stringify({ H: r2(H), rows }) };
    },
  });

  cases.push({
    id: 'fullpages_reader_paper_is_behind_the_body_and_the_bands',
    description: 'Lecture : le blanc de la feuille est un fond derrière tout (z-index négatif) ; le corps et les espaceurs de bord sont transparents, sans quoi le blanc de l\'espaceur de l\'en-tête cachait une image « derrière le texte » posée dans la bande',
    run: async (h) => {
      await setup(h, HF, layerImg({ repeat: false, leftPt: -28, topPt: -83 }) + lines(5));
      await h.renderReaderMode(Editor.getHTML(), Editor.getHeaderFooterData());
      await h.sleep(250);
      const rc = document.getElementById('reader-container');
      const cs = el => getComputedStyle(el);
      const paper = rc.querySelector('.v2-reader-paper');
      const content = rc.querySelector('.reader-content');
      const edgeTop = rc.querySelector('.v2-page-edge-top');
      const edgeBottom = rc.querySelector('.v2-page-edge-bottom');
      const transparent = el => cs(el).backgroundColor === 'rgba(0, 0, 0, 0)';
      const img = rc.querySelector('img.editor-image');
      const imgRect = img.getBoundingClientRect();
      const topRect = edgeTop.getBoundingClientRect();
      const paperRect = paper.getBoundingClientRect();
      // Le fond est derrière le corps (négatif) ; l'image est dans le corps ; la bande de l'en-tête (au-dessus) ne la couvre plus.
      const info = {
        fondZ: cs(paper.parentElement).zIndex, fondBlanc: cs(paper).backgroundColor, corpsTransparent: transparent(content), espaceurHautTransparent: transparent(edgeTop), espaceurBasTransparent: !!edgeBottom && transparent(edgeBottom),
        imageDansLaBande: near(imgRect.top, topRect.top, 1), fondRecouvre: paperRect.top <= topRect.top + 0.5 && paperRect.bottom >= (edgeBottom ? edgeBottom.getBoundingClientRect().bottom : 0) - 0.5,
      };
      restoreReader(h);
      return { pass: info.fondZ === '-1' && info.fondBlanc === 'rgb(255, 255, 255)' && info.corpsTransparent && info.espaceurHautTransparent && info.espaceurBasTransparent && info.imageDansLaBande && info.fondRecouvre, notes: JSON.stringify(info) };
    },
  });

  // --- Les copies de « Sur toutes les pages » ---
  // Place d'une copie dans une page : décalage de l'image depuis le coin haut gauche de la boîte de la page, en points.
  function copiesOf(root, z) {
    return Array.from(root.querySelectorAll('.v2-page-layer-page')).map(box => {
      const br = box.getBoundingClientRect();
      return { box, boxHeight: br.height / z, images: Array.from(box.querySelectorAll('img.v2-page-layer-copy')).map(img => { const ir = img.getBoundingClientRect(); return { x: r2((ir.left - br.left) / z / PT), y: r2((ir.top - br.top) / z / PT), w: r2(ir.width / z / PT), topScreen: br.top, el: img }; }) };
    });
  }
  // La page (index) d'une boîte de copies, d'après son haut.
  function pageOfBox(box, pages) { let k = 0; pages.forEach((p, i) => { if (near(p.topScreen, box.getBoundingClientRect().top, 1)) k = i; }); return k; }

  const COPY_CASES = [
    { name: 'corner', label: 'au coin de la feuille', leftPt: -28, topPt: -28, hf: EMPTY },
    { name: 'corner_hf', label: 'au coin de la feuille, sous un en-tête', leftPt: -28, topPt: -83, hf: HF },
    { name: 'inside', label: 'dans la page', leftPt: 120, topPt: 300, hf: HF },
  ];
  COPY_CASES.forEach(c => {
    cases.push({
      id: 'fullpages_editor_copies_match_the_pdf_' + c.name,
      description: 'Éditeur : l\'image « Sur toutes les pages » posée ' + c.label + ' a ses copies sur les pages 2 et 3, à la même place de la page que dans le PDF (0,3 pt près) ; pas de copie sur la page 1, où se trouve l\'image elle-même',
      run: async (h) => {
        await setup(h, c.hf, layerImg({ repeat: true, leftPt: c.leftPt, topPt: c.topPt }) + lines(130));
        const g = editorPages();
        const copies = copiesOf(g.ec, g.z);
        const byPage = {};
        copies.forEach(b => { byPage[pageOfBox(b.box, g.pages)] = b.images.map(i => ({ x: i.x, y: i.y, w: i.w })); });
        const html = Editor.getHTML();
        const { truth } = await pdfOf(h, html, Editor.getHeaderFooterData());
        const m = PageLayout.getMarginsPt();
        const want = { x: r2(m.left + c.leftPt), y: r2(m.top + (c.hf.enabled ? BAND_PT : 0) + c.topPt) };
        const pdf = truth.pages.map(p => p.images.map(i => ({ x: r2(i.x), y: r2(i.y) })));
        const pages = Object.keys(byPage).map(Number).sort();
        const sameAsPdf = pages.every(k => byPage[k].length === 1 && near(byPage[k][0].x, want.x, 0.3) && near(byPage[k][0].y, want.y, 0.3) && pdf[k] && pdf[k].length === 1 && near(pdf[k][0].x, want.x, 0.5) && near(pdf[k][0].y, want.y, 0.5));
        const pass = g.pages.length >= 3 && pages.join() === '1,2' && sameAsPdf && !byPage[0];
        return { pass, notes: JSON.stringify({ attendu: want, copiesEditeur: byPage, pdf: pdf.slice(0, 3), pages: g.pages.length }) };
      },
    });
    cases.push({
      id: 'fullpages_reader_copies_match_the_pdf_' + c.name,
      description: 'Lecture : l\'image « Sur toutes les pages » posée ' + c.label + ' a ses copies sur les pages 2 et 3, à la même place de la page que dans le PDF (0,3 pt près) ; l\'image elle-même est sur la page 1',
      run: async (h) => {
        await setup(h, c.hf, layerImg({ repeat: true, leftPt: c.leftPt, topPt: c.topPt }) + lines(130));
        const html = Editor.getHTML();
        const hfData = Editor.getHeaderFooterData();
        await h.renderReaderMode(html, hfData);
        await h.sleep(250);
        const r = readerPages();
        const copies = copiesOf(r.rc, r.z);
        const byPage = {};
        copies.forEach(b => { byPage[pageOfBox(b.box, r.pages)] = b.images.map(i => ({ x: i.x, y: i.y, w: i.w })); });
        const orig = r.rc.querySelector('.reader-content img.editor-image');
        const or = orig.getBoundingClientRect();
        const origin = { x: r2((or.left - r.paperRect.left) / r.z / PT), y: r2((or.top - r.paperRect.top) / r.z / PT) };
        restoreReader(h);
        const m = PageLayout.getMarginsPt();
        const want = { x: r2(m.left + c.leftPt), y: r2(m.top + (c.hf.enabled ? BAND_PT : 0) + c.topPt) };
        const pages = Object.keys(byPage).map(Number).sort();
        const sameAsPdf = pages.every(k => byPage[k].length === 1 && near(byPage[k][0].x, want.x, 0.3) && near(byPage[k][0].y, want.y, 0.3));
        const pass = r.pages.length >= 3 && pages.join() === '1,2' && sameAsPdf && near(origin.x, want.x, 0.3) && near(origin.y, want.y, 0.3);
        return { pass, notes: JSON.stringify({ attendu: want, copiesLecture: byPage, original: origin, pages: r.pages.length }) };
      },
    });
  });

  cases.push({
    id: 'fullpages_copies_are_clipped_to_their_page_and_ignore_the_mouse',
    description: 'Éditeur et Lecture : chaque page de copies est une boîte de la hauteur d\'une feuille qui rogne ce qui dépasse (le PDF coupe de même au bord de la page), et ni la couche ni les copies ne prennent la souris',
    run: async (h) => {
      // Une image de 120 px posée à 20 pt du bas du corps d'une page : elle sort de la page.
      const m = PageLayout.getMarginsPt();
      const H = pageHeightPx();
      const bottomPt = H / PT - m.top - m.bottom - 20;
      await setup(h, EMPTY, layerImg({ repeat: true, leftPt: 10, topPt: bottomPt }) + lines(130));
      // Chaque rendu est jugé tout de suite : l'éditeur repeint ses copies (de nouveaux nœuds) quand la Lecture s'affiche, les anciens ne se mesurent plus.
      const clipped = list => list.length > 0 && list.every(b => getComputedStyle(b.box).overflow === 'hidden' && near(b.boxHeight, H, 0.6)
        && b.images.every(i => i.el.getBoundingClientRect().bottom > b.box.getBoundingClientRect().bottom + 1));
      const deaf = (layer, list) => !!layer && getComputedStyle(layer).pointerEvents === 'none' && list.every(b => getComputedStyle(b.box).pointerEvents === 'none' && b.images.every(i => getComputedStyle(i.el).pointerEvents === 'none'));
      const g = editorPages();
      const eCopies = copiesOf(g.ec, g.z);
      const editorVerdict = { copies: eCopies.length, clipped: clipped(eCopies), deaf: deaf(g.ec.querySelector('.v2-page-layer'), eCopies) };
      await h.renderReaderMode(Editor.getHTML(), Editor.getHeaderFooterData());
      await h.sleep(250);
      const r = readerPages();
      const rCopies = copiesOf(r.rc, r.z);
      const readerVerdict = { copies: rCopies.length, clipped: clipped(rCopies), deaf: deaf(r.rc.querySelector('.v2-page-layer'), rCopies) };
      restoreReader(h);
      const ok = v => v.copies >= 2 && v.clipped && v.deaf;
      return { pass: ok(editorVerdict) && ok(readerVerdict), notes: JSON.stringify({ H: r2(H), editeur: editorVerdict, lecture: readerVerdict }) };
    },
  });

  cases.push({
    id: 'fullpages_editor_copies_are_under_the_text_and_over_the_sheet',
    description: 'Éditeur : la couche des copies est le premier enfant de la feuille (au-dessus de son blanc), avant `.tiptap` dont le texte passe devant ; l\'en-tête et le pied de la page 1 se peignent au-dessus du corps (le PDF les dessine après le contenu)',
    run: async (h) => {
      await setup(h, HF, layerImg({ repeat: true, leftPt: -28, topPt: -83 }) + lines(130));
      const ec = document.getElementById('editor-container');
      const sheet = ec.querySelector('.v2-page-sheet');
      const layer = ec.querySelector('.v2-page-layer');
      const tiptap = ec.querySelector('.tiptap');
      const cs = el => getComputedStyle(el);
      const edgeTop = ec.querySelector('.v2-page-edge-top');
      const info = {
        premierEnfant: sheet.firstElementChild === layer, avantTiptap: !!layer && (layer.compareDocumentPosition(tiptap) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
        zCouche: layer && cs(layer).zIndex, zTiptap: cs(tiptap).zIndex, zEntete: cs(edgeTop).zIndex, feuilleBlanche: cs(sheet).backgroundColor,
      };
      return { pass: info.premierEnfant && info.avantTiptap && info.zCouche === '0' && info.zTiptap === '0' && Number(info.zEntete) > 0 && info.feuilleBlanche === 'rgb(255, 255, 255)', notes: JSON.stringify(info) };
    },
  });

  cases.push({
    id: 'fullpages_copies_go_away_with_the_checkbox_and_the_preview',
    description: 'Éditeur : décocher la case retire les copies, ainsi que l\'Aperçu A4 coché sur Désactivé ; les recocher les rend',
    run: async (h) => {
      await setup(h, EMPTY, layerImg({ repeat: true, leftPt: -28, topPt: -28 }) + lines(130));
      const count = () => document.querySelectorAll('#editor-container .v2-page-layer img.v2-page-layer-copy').length;
      const withBox = count();
      EditorCore.getEditor().state.doc.descendants((node, pos) => {
        if (node.type.name === 'editorImage') { const tr = EditorCore.getEditor().state.tr.setNodeMarkup(pos, undefined, Object.assign({}, node.attrs, { repeat: false })); EditorCore.getEditor().view.dispatch(tr); }
      });
      Editor.refreshPaginationPreview();
      await h.sleep(300);
      const unchecked = count();
      EditorCore.getEditor().state.doc.descendants((node, pos) => {
        if (node.type.name === 'editorImage') { const tr = EditorCore.getEditor().state.tr.setNodeMarkup(pos, undefined, Object.assign({}, node.attrs, { repeat: true })); EditorCore.getEditor().view.dispatch(tr); }
      });
      Editor.refreshPaginationPreview();
      await h.sleep(300);
      const checked = count();
      h.setA4Preview(false);
      Editor.refreshPaginationPreview();
      await h.sleep(300);
      const noPreview = count();
      h.setA4Preview(true);
      return { pass: withBox >= 2 && unchecked === 0 && checked === withBox && noPreview === 0, notes: JSON.stringify({ casee: withBox, decochee: unchecked, recochee: checked, sansApercu: noPreview }) };
    },
  });

  // --- Une image posée sur la page 2 suit sa grille page ---
  cases.push({
    id: 'fullpages_image_on_page_two_follows_its_grid_in_the_editor_the_reader_and_the_pdf',
    description: 'Un modèle enregistré avant les pages entières, où une image est sur la page 2 avec un `top` d\'avant (la page 2 commençait plus haut) : l\'éditeur et la Lecture la remettent à la place que dit sa grille page, la même que celle du PDF',
    run: async (h) => {
      const m = PageLayout.getMarginsPx();
      const mPt = PageLayout.getMarginsPt();
      const leftPt = 60; const topPt = 40;
      // `top` d'avant : bien plus haut que la page 2 d'aujourd'hui.
      const html = layerImg({ pageIndex: 1, leftPt, topPt, top: 1000 }) + lines(130);
      await setup(h, HF, html);
      const g = editorPages();
      const img = document.querySelector('#editor-container .tiptap img.editor-image');
      const ir = img.getBoundingClientRect();
      const page2 = g.pages[1];
      const editor = { x: r2((ir.left - g.sheetRect.left) / g.z / PT), y: r2((ir.top - page2.topScreen) / g.z / PT) };
      const saved = Editor.getHTML();
      await h.renderReaderMode(saved, Editor.getHeaderFooterData());
      await h.sleep(250);
      const r = readerPages();
      const rimg = r.rc.querySelector('.reader-content img.editor-image');
      const rr = rimg.getBoundingClientRect();
      const reader = { x: r2((rr.left - r.paperRect.left) / r.z / PT), y: r2((rr.top - r.pages[1].topScreen) / r.z / PT) };
      restoreReader(h);
      const { truth } = await pdfOf(h, saved, Editor.getHeaderFooterData());
      const pdfImg = (truth.pages[1] || { images: [] }).images[0];
      const want = { x: r2(mPt.left + leftPt), y: r2(mPt.top + BAND_PT + topPt) };
      const pass = !!pdfImg && near(editor.x, want.x, 0.5) && near(editor.y, want.y, 0.5) && near(reader.x, want.x, 0.5) && near(reader.y, want.y, 0.5) && near(pdfImg.x, want.x, 0.5) && near(pdfImg.y, want.y, 0.5);
      return { pass, notes: JSON.stringify({ attendu: want, editeur: editor, lecture: reader, pdf: pdfImg ? { x: r2(pdfImg.x), y: r2(pdfImg.y) } : null, marge: m.left }) };
    },
  });

  // --- Une image tirée sur la page 2 prend la grille de la page 2 ---
  cases.push({
    id: 'fullpages_image_dragged_to_page_two_takes_the_grid_of_page_two',
    description: 'Une image dont le paragraphe est sur la page 1, tirée par sa poignée sur la page 2 : sa grille dit « page 2 » et le décalage depuis le corps de la page 2 (avant, elle gardait la page de son paragraphe et un décalage de plus d\'une page, hors de la feuille du PDF) ; l\'éditeur, la Lecture et le PDF la montrent au même endroit',
    run: async (h) => {
      const mPt = PageLayout.getMarginsPt();
      const leftPt = 60; const topPt = 40;
      await setup(h, HF, layerImg({ pageIndex: 0, leftPt: 10, topPt: 10 }) + lines(130));
      const g = editorPages();
      const wrap = document.querySelector('#editor-container .tiptap .editor-image-view');
      const ir = wrap.getBoundingClientRect();
      // Le haut-gauche visé : leftPt / topPt depuis le corps de la page 2, soit marge + bande depuis le haut de sa feuille.
      const wantLeft = g.sheetRect.left + (mPt.left + leftPt) * PT * g.z;
      const wantTop = g.pages[1].topScreen + (mPt.top + BAND_PT + topPt) * PT * g.z;
      dragImageBy(wrap, wantLeft - ir.left, wantTop - ir.top);
      await h.sleep(250);
      const attrs = firstImageAttrs();
      const after = wrap.isConnected ? wrap : document.querySelector('#editor-container .tiptap .editor-image-view');
      const ar = after.getBoundingClientRect();
      const editor = { x: r2((ar.left - g.sheetRect.left) / g.z / PT), y: r2((ar.top - g.pages[1].topScreen) / g.z / PT) };
      // La grille enregistrée : le geste est précis au pixel (le départ du glisser est le `left`/`top` entier de l'image), soit 0,75 pt ; chaque rendu montre ensuite cette grille-là.
      const want = { x: r2(mPt.left + attrs.pageLeftPt), y: r2(mPt.top + BAND_PT + attrs.pageTopPt) };
      const saved = Editor.getHTML();
      await h.renderReaderMode(saved, Editor.getHeaderFooterData());
      await h.sleep(250);
      const r = readerPages();
      const rr = r.rc.querySelector('.reader-content img.editor-image').getBoundingClientRect();
      const reader = { x: r2((rr.left - r.paperRect.left) / r.z / PT), y: r2((rr.top - r.pages[1].topScreen) / r.z / PT) };
      restoreReader(h);
      const { truth } = await pdfOf(h, saved, Editor.getHeaderFooterData());
      const pdfImg = (truth.pages[1] || { images: [] }).images[0];
      const grid = { page: attrs.pageIndex, left: r2(attrs.pageLeftPt), top: r2(attrs.pageTopPt) };
      const pass = attrs.pageIndex === 1 && near(attrs.pageLeftPt, leftPt, 0.75) && near(attrs.pageTopPt, topPt, 0.75)
        && near(editor.x, want.x, 0.5) && near(editor.y, want.y, 0.5) && near(reader.x, want.x, 0.5) && near(reader.y, want.y, 0.5)
        && !!pdfImg && near(pdfImg.x, want.x, 0.5) && near(pdfImg.y, want.y, 0.5);
      return { pass, notes: JSON.stringify({ visee: { x: leftPt, y: topPt }, grille: grid, attendu: want, editeur: editor, lecture: reader, pdf: pdfImg ? { x: r2(pdfImg.x), y: r2(pdfImg.y) } : null }) };
    },
  });

  cases.push({
    id: 'fullpages_image_dropped_in_the_gutter_goes_to_the_top_of_the_next_page',
    description: 'Une image lâchée dans la gouttière entre deux feuilles est rangée contre le bord haut de la feuille suivante (jamais sur une page de la grille hors de toute feuille) : sa grille dit « page 2, au bord de la feuille »',
    run: async (h) => {
      const mPt = PageLayout.getMarginsPt();
      await setup(h, HF, layerImg({ pageIndex: 0, leftPt: 10, topPt: 10 }) + lines(130));
      const g = editorPages();
      const wrap = document.querySelector('#editor-container .tiptap .editor-image-view');
      const ir = wrap.getBoundingClientRect();
      const gutter = g.seams[0].divider.getBoundingClientRect();
      // Le haut de l'image au milieu de la gouttière.
      dragImageBy(wrap, 0, (gutter.top + gutter.height / 2) - ir.top);
      await h.sleep(250);
      const attrs = firstImageAttrs();
      const ar = document.querySelector('#editor-container .tiptap .editor-image-view').getBoundingClientRect();
      const topOnSheet = (ar.top - g.pages[1].topScreen) / g.z;
      const pass = attrs.pageIndex === 1 && near(attrs.pageTopPt, -(mPt.top + BAND_PT), 0.4) && near(topOnSheet, 0, 0.6);
      return { pass, notes: JSON.stringify({ grille: { page: attrs.pageIndex, top: r2(attrs.pageTopPt) }, bordAttendu: r2(-(mPt.top + BAND_PT)), hautSurLaFeuille: r2(topOnSheet) }) };
    },
  });

  // --- Recalculer les pages ne déplace pas le défilement ---
  cases.push({
    id: 'fullpages_editor_scroll_stays_put_when_the_pages_are_recomputed',
    description: 'Éditeur : recalculer les pages (une frappe le fait, 200 ms après) laisse la position de défilement où elle est, au milieu du document comme tout en bas (le calcul retire puis repose les réserves de coupure : sans garde, le navigateur reculait la position de la hauteur de la première page à chaque passage, ou la ramenait au nouveau bas du document raccourci)',
    run: async (h) => {
      await setup(h, HF, lines(130));
      const ec = document.getElementById('editor-container');
      const max = () => ec.scrollHeight - ec.clientHeight;
      const rows = [];
      let pass = max() > 400;
      for (const [label, frac] of [['milieu', 0.4], ['bas', 1]]) {
        ec.scrollTop = Math.floor(max() * frac);
        await h.sleep(150);
        const start = ec.scrollTop;
        const trail = [];
        for (let i = 0; i < 3; i++) { HeaderFooterPreview.renderPaginationOverlay(); trail.push(ec.scrollTop); }
        // Une frappe à la fin du texte, puis le recalcul différé.
        const ed = EditorCore.getEditor();
        ed.commands.insertContentAt(ed.state.doc.content.size - 1, ' x');
        await h.sleep(450);
        trail.push(ec.scrollTop);
        rows.push({ [label]: { depart: start, apres: trail } });
        // Une frappe peut raccourcir le bas d'un pixel (arrondi) : tolérance de 2 px.
        pass = pass && trail.every(v => near(v, start, 2));
      }
      return { pass, notes: JSON.stringify({ rows, max: max() }) };
    },
  });

  cases.push({
    id: 'fullpages_page_one_images_are_left_alone',
    description: 'Le calage sur la grille ne touche pas une image de la page 1 : son `top` enregistré reste celui du modèle',
    run: async (h) => {
      await setup(h, HF, layerImg({ pageIndex: 0, leftPt: 30, topPt: 50, top: 333 }) + lines(5));
      const node = (() => { let found = null; EditorCore.getEditor().state.doc.descendants(n => { if (!found && n.type.name === 'editorImage') found = n; }); return found; })();
      return { pass: !!node && node.attrs.top === 333, notes: JSON.stringify({ top: node && node.attrs.top }) };
    },
  });

  // --- Un macro-modèle : les copies restent dans leur courrier ---
  cases.push({
    id: 'fullpages_reader_macro_copies_stay_in_their_courrier',
    description: 'Lecture d\'un macro-modèle de deux courriers de deux pages : l\'image répétée du premier courrier a sa copie sur la page 2 seulement (la sienne), celle du second sur la page 4 seulement',
    run: async (h) => {
      const first = layerImg({ repeat: true, leftPt: -28, topPt: -28, width: 120 }) + lines(70, 'Premier');
      const second = MacroTemplates.slotBreakHtml(1) + layerImg({ repeat: true, leftPt: 100, topPt: 100, width: 80 }) + lines(70, 'Second');
      await setup(h, EMPTY, first + second);
      // Le HTML assemblé tel que la Lecture le reçoit : l'éditeur ne garde pas le numéro de slot du repère de saut de page.
      await h.renderReaderMode(first + second, EMPTY);
      await h.sleep(300);
      const r = readerPages();
      const copies = copiesOf(r.rc, r.z);
      const byPage = {};
      copies.forEach(b => { byPage[pageOfBox(b.box, r.pages)] = b.images.map(i => r2(i.w)); });
      restoreReader(h);
      // Largeurs en points : 120 px = 90 pt, 80 px = 60 pt.
      const pass = r.pages.length === 4 && Object.keys(byPage).sort().join() === '1,3' && byPage[1].join() === '90' && byPage[3].join() === '60';
      return { pass, notes: JSON.stringify({ pages: r.pages.length, copiesParPage: byPage }) };
    },
  });

  // --- Paysage ---
  cases.push({
    id: 'fullpages_landscape_sheets_are_landscape_pages',
    description: 'En paysage, chaque feuille de l\'éditeur et de la Lecture a la hauteur d\'une page paysage',
    run: async (h) => {
      await setup(h, EMPTY, lines(130));
      PageLayout.setOrientation(PageLayout.LANDSCAPE);
      document.dispatchEvent(new CustomEvent('pp:marginsChanged'));
      await h.sleep(700);
      Editor.refreshPaginationPreview();
      await h.sleep(300);
      const H = pageHeightPx();
      const g = editorPages();
      await h.renderReaderMode(Editor.getHTML(), Editor.getHeaderFooterData());
      await h.sleep(250);
      const r = readerPages();
      restoreReader(h);
      PageLayout.setOrientation(PageLayout.PORTRAIT);
      document.dispatchEvent(new CustomEvent('pp:marginsChanged'));
      await h.sleep(300);
      return { pass: g.pages.length >= 2 && allWhole(g.pages, H) && allWhole(r.pages, H) && near(H, 595.28 * 96 / 72, 1), notes: JSON.stringify({ H: r2(H), editeur: g.pages.map(p => r2(p.height)), lecture: r.pages.map(p => r2(p.height)) }) };
    },
  });

  return cases;
})();
