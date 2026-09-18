// Suite "docxImages" - POSITION des images dans l'export DOCX, vérifiée dans les octets du .docx GÉNÉRÉ (dézippé, word/document.xml parsé), jamais sur les
// objets `docx.ImageRun` passés en entrée.
//
// Pourquoi cette suite existe, et pourquoi elle ressemble à scenarios-pdf-ground-truth.js : l'export DOCX est arrivé sans aucun test automatisé, alors que
// tout son historique est fait de corrections de POSITION D'IMAGE (habillage gauche/droite ignoré, image plaquée en haut du paragraphe, image enfant direct
// du document qui disparaissait, id wp:docPr dupliqué que Word refusait d'ouvrir). Chacune de ces régressions était invisible dans les objets d'entrée et
// ne se voyait QUE dans l'OOXML sérialisé - exactement le même piège que `.absolutePosition` côté pdfmake, qui affichait la bonne valeur pendant que le
// rendu réel divergeait. D'où le même principe ici : on ouvre le fichier.
//
// Le repère : une image en calque produit un <wp:anchor> positionné relativement à la PAGE, donc la valeur attendue est marge de page + position "grille
// page" capturée dans l'éditeur (HeaderFooterPreview.computePageGridPosition) - la MÊME formule que l'export PDF (js/pdf-export.js), ce que la dernière
// famille de scénarios vérifie explicitement en comparant les deux exports sur un scénario identique.
(function () {
  const cases = [];
  const PAGE_MARGIN_PT = 28; // 560 twips, cf. js/docx-export.js - la valeur par défaut de PageLayout quand aucune marge n'est passée.
  const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const TOL_PT = 1; // 1pt = 12700 EMU : les arrondis d'EMU de l'export sont très en dessous, cette tolérance ne couvre que la mesure DOM du scénario.

  function img(attrs, style) {
    const a = Object.entries(attrs).map(([k, v]) => ` ${k}="${v}"`).join('');
    return `<img class="editor-image" src="${PNG_1PX}" alt="Image"${a} style="${style}">`;
  }

  // --- Matrice contexte x alignement x type d'ancre, construite dans le VRAI éditeur ---
  // Même construction que scenarios-pdf-ground-truth.js:buildScenario (clics réels sur la toolbar, pas un HTML écrit à la main) : ce qui est testé inclut
  // la capture de la grille page par l'éditeur, pas seulement la conversion HTML -> OOXML.
  async function buildLayeredScenario(h, context, align, anchorType) {
    await h.resetEditor();
    document.getElementById('editor-container').classList.add('a4-preview');
    await h.focusAtEnd();
    let hostP;
    if (context === 'tableCell') {
      document.getElementById('v2-btn-table').click();
      await h.sleep(80);
      const cells = h.tiptap().querySelectorAll('table td');
      hostP = cells[cells.length - 1].querySelector('p');
    } else if (context === 'mainFlow') {
      hostP = h.tiptap().lastElementChild;
    } else {
      document.getElementById('v2-btn-two-columns').click();
      await h.sleep(80);
      const colIdx = context === 'twoColumnsLeft' ? 0 : 1;
      hostP = h.tiptap().querySelectorAll('.two-columns-zone > .two-columns-column')[colIdx].querySelector('p');
    }
    const ed = EditorCore.getEditor();
    ed.commands.setTextSelection(ed.view.posAtDOM(hostP, 0));
    ed.commands.focus();
    await h.sleep(50);
    await h.typeText('XXXXXXXXXX texte ancre suffisamment long pour forcer un vrai retour a la ligne dans la colonne la plus etroite du scenario teste ici');
    if (align !== 'left') { document.getElementById('v2-btn-align-' + align).click(); await h.sleep(30); }
    if (anchorType === 'above') {
      ed.commands.enter();
      await h.sleep(60);
      if (align !== 'left') { document.getElementById('v2-btn-align-' + align).click(); await h.sleep(30); }
    }
    const origPrompt = window.prompt;
    window.prompt = () => PNG_1PX;
    document.getElementById('v2-btn-image').click();
    await h.sleep(120);
    window.prompt = origPrompt;
    const container = context === 'tableCell'
      ? h.tiptap().querySelectorAll('table td')[h.tiptap().querySelectorAll('table td').length - 1]
      : (context === 'mainFlow' ? h.tiptap() : h.tiptap().querySelectorAll('.two-columns-column')[context === 'twoColumnsLeft' ? 0 : 1]);
    const imgEl = container.querySelector('img.editor-image');
    if (!imgEl) return null;
    await h.selectAtomNode(imgEl);
    await h.sleep(80);
    const frontBtn = document.querySelector('.v2-floating-toolbar button[data-action="layer-front"]');
    if (!frontBtn) return null;
    frontBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await h.sleep(100);
    const wrap = imgEl.closest('.editor-image-view');
    const grid = HeaderFooterPreview.computePageGridPosition(wrap);
    if (!grid) return null;
    return { html: Editor.getHTML(), expected: { x: PAGE_MARGIN_PT + grid.pageLeftPt, y: PAGE_MARGIN_PT + grid.pageTopPt } };
  }

  ['mainFlow', 'twoColumnsLeft', 'twoColumnsRight', 'tableCell'].forEach(context => {
    ['left', 'center', 'right', 'justify'].forEach(align => {
      ['container', 'above'].forEach(anchorType => {
        cases.push({
          id: 'docximg_matrix_' + context + '_' + align + '_' + anchorType,
          description: 'Image en calque (contexte=' + context + ', align=' + align + ', ancre=' + anchorType + ') : <wp:anchor> page-relatif à la position grille page capturée',
          run: async (h) => {
            const scenario = await buildLayeredScenario(h, context, align, anchorType);
            if (!scenario) return { pass: false, notes: 'construction du scénario a échoué (bouton/toolbar introuvable)' };
            const parts = await h.exportDocxParts(scenario.html);
            const drawings = h.docxDrawings(parts.doc);
            if (drawings.length !== 1) return { pass: false, notes: 'attendu 1 <w:drawing>, trouvé ' + drawings.length };
            const d = drawings[0];
            if (d.kind !== 'anchor') return { pass: false, notes: 'image en calque exportée en <wp:inline> (position perdue) au lieu de <wp:anchor>' };
            // L'alignement du paragraphe hôte ne doit JAMAIS déplacer une image en calque : c'est exactement le bug qui a motivé scenarios-pdf-ground-truth.js
            // côté PDF (pdfmake appliquait `alignment` par-dessus `absolutePosition`). Ici le décalage est explicite dans le fichier, donc directement lisible.
            if (d.relativeFrom.h !== 'page' || d.relativeFrom.v !== 'page') {
              return { pass: false, notes: 'ancrage attendu relatif à la PAGE, trouvé h=' + d.relativeFrom.h + ' v=' + d.relativeFrom.v };
            }
            const dx = Math.abs(d.x - scenario.expected.x), dy = Math.abs(d.y - scenario.expected.y);
            const pass = dx <= TOL_PT && dy <= TOL_PT;
            return { pass, notes: JSON.stringify({ expected: scenario.expected, docx: { x: d.x, y: d.y }, dx, dy, behindDoc: d.behindDoc, wrap: d.wrap }) };
          },
        });
      });
    });
  });

  // --- Cohérence PDF <-> DOCX sur un scénario identique ---
  // Les deux exports partent de la même grille page et doivent placer l'image au même endroit de la feuille A4. Vérifié contre la position RÉELLEMENT
  // PEINTE dans le PDF (pdf.js), pas contre les métadonnées pdfmake - sinon les deux exports pourraient dériver ensemble sans que rien ne le signale.
  ['mainFlow', 'tableCell'].forEach(context => {
    cases.push({
      id: 'docximg_parity_pdf_' + context,
      description: 'Image en calque (contexte=' + context + ') : position DOCX (<wp:anchor>) == position réellement peinte dans le PDF',
      run: async (h) => {
        const scenario = await buildLayeredScenario(h, context, 'left', 'container');
        if (!scenario) return { pass: false, notes: 'construction du scénario a échoué' };
        const pdf = await h.exportPdfContent(scenario.html, null);
        const truth = await h.extractPdfGroundTruth(pdf.base64);
        const painted = truth.pages[0] && truth.pages[0].images[0];
        if (!painted) return { pass: false, notes: 'aucune image peinte dans le PDF' };
        const parts = await h.exportDocxParts(scenario.html);
        const d = h.docxDrawings(parts.doc)[0];
        if (!d || d.kind !== 'anchor') return { pass: false, notes: 'pas d\'ancre DOCX : ' + JSON.stringify(d || null) };
        const dx = Math.abs(d.x - painted.x), dy = Math.abs(d.y - painted.y);
        return { pass: dx <= TOL_PT && dy <= TOL_PT, notes: JSON.stringify({ pdf: { x: painted.x, y: painted.y }, docx: { x: d.x, y: d.y }, dx, dy }) };
      },
    });
  });

  // --- Taille : même largeur affichée que dans l'éditeur et que dans le PDF ---
  // `width:320px` dans l'éditeur -> 240pt (320 * 0.75) dans les DEUX exports. docx.js prend `transformation` en PIXELS (9525 EMU/px) : une confusion px/pt
  // ici passerait totalement inaperçue dans les objets d'entrée et donnerait une image 33% trop grande dans Word.
  cases.push({
    id: 'docximg_size_px_to_pt',
    description: 'Une image de 320px dans l\'éditeur mesure 240pt (=320px @96dpi) dans le .docx, comme dans le PDF',
    run: async (h) => {
      const html = '<p>' + img({}, 'width: 320px;') + '</p>';
      const parts = await h.exportDocxParts(html);
      const d = h.docxDrawings(parts.doc)[0];
      if (!d) return { pass: false, notes: 'aucune image exportée' };
      const pdf = await h.exportPdfContent(html, null);
      const pdfImg = h.findImages(pdf.content)[0];
      const okDocx = Math.abs(d.widthPt - 240) <= 0.5;
      const okParity = pdfImg && Math.abs(d.widthPt - pdfImg.width) <= 0.5;
      return { pass: okDocx && !!okParity, notes: JSON.stringify({ docxWidthPt: d.widthPt, docxHeightPt: d.heightPt, pdfWidthPt: pdfImg && pdfImg.width }) };
    },
  });
  cases.push({
    id: 'docximg_height_from_intrinsic_ratio',
    description: 'La hauteur est déduite du ratio intrinsèque du fichier (docx exige les deux dimensions, contrairement à pdfmake)',
    run: async (h) => {
      // PNG 4x1 : ratio 0.25, donc 320px de large -> 80px de haut -> 60pt.
      const png4x1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAABCAIAAAB2XpiaAAAADUlEQVR4nGP4z8AARwAd7wP95hFmHQAAAABJRU5ErkJggg==';
      const html = '<p><img class="editor-image" src="' + png4x1 + '" alt="Image" style="width: 320px;"></p>';
      const parts = await h.exportDocxParts(html);
      const d = h.docxDrawings(parts.doc)[0];
      if (!d) return { pass: false, notes: 'aucune image exportée' };
      return { pass: Math.abs(d.widthPt - 240) <= 0.5 && Math.abs(d.heightPt - 60) <= 1, notes: JSON.stringify({ widthPt: d.widthPt, heightPt: d.heightPt, attendu: { widthPt: 240, heightPt: 60 } }) };
    },
  });

  // --- Habillage gauche/droite (data-align) ---
  // Régression c9870ee (habillage ignoré) puis 31cd74d/9ef697c (image plaquée en haut du paragraphe entier) : le texte doit couler du côté OPPOSÉ au bord
  // d'alignement, et le paragraphe hôte doit être DÉCOUPÉ au point d'insertion de l'image pour que "haut du paragraphe" tombe à la bonne hauteur.
  [['left', 'right'], ['right', 'left']].forEach(([align, expectedSide]) => {
    cases.push({
      id: 'docximg_wrap_' + align,
      description: 'Image alignée à ' + align + ' : <wp:anchor> habillage carré, le texte coule à ' + expectedSide,
      run: async (h) => {
        const html = '<p>Avant' + img({ 'data-align': align }, 'width: 200px;') + 'Apres</p>';
        const parts = await h.exportDocxParts(html);
        const d = h.docxDrawings(parts.doc)[0];
        if (!d) return { pass: false, notes: 'aucune image exportée' };
        const okKind = d.kind === 'anchor';
        const okWrap = d.wrap === 'square' && d.wrapSide === expectedSide;
        const okAnchor = d.relativeFrom.h === 'margin' && d.alignH === align && d.relativeFrom.v === 'paragraph' && d.alignV === 'top';
        return { pass: okKind && okWrap && okAnchor, notes: JSON.stringify(d) };
      },
    });
  });
  cases.push({
    id: 'docximg_wrap_splits_host_paragraph',
    description: 'Le paragraphe hôte d\'une image habillée est découpé au point d\'insertion (le texte AVANT l\'image reste dans son propre <w:p>)',
    run: async (h) => {
      const parts = await h.exportDocxParts('<p>Avant' + img({ 'data-align': 'right' }, 'width: 200px;') + 'Apres</p>');
      const ps = h.docxParagraphs(parts.doc).filter(p => p.text || p.drawingCount);
      const withImage = ps.filter(p => p.drawingCount);
      const pass = ps.length === 2 && ps[0].text === 'Avant' && ps[0].drawingCount === 0 && withImage.length === 1 && withImage[0].text === 'Apres';
      return { pass, notes: JSON.stringify(ps.map(p => ({ text: p.text, drawings: p.drawingCount }))) };
    },
  });
  cases.push({
    id: 'docximg_wrap_no_split_when_image_first',
    description: 'Image habillée en TÊTE de paragraphe : aucun <w:p> vide n\'est créé avant elle',
    run: async (h) => {
      const parts = await h.exportDocxParts('<p>' + img({ 'data-align': 'left' }, 'width: 200px;') + 'Texte</p>');
      const ps = h.docxParagraphs(parts.doc);
      const pass = ps.length === 1 && ps[0].drawingCount === 1 && ps[0].text === 'Texte';
      return { pass, notes: JSON.stringify(ps.map(p => ({ text: p.text, drawings: p.drawingCount }))) };
    },
  });
  cases.push({
    id: 'docximg_align_center',
    description: 'Image centrée (data-align="center") : image CENTRÉE dans le .docx, comme dans le PDF (pdfmake `alignment:center`)',
    run: async (h) => {
      const html = '<p>' + img({ 'data-align': 'center' }, 'width: 200px;') + '</p>';
      const parts = await h.exportDocxParts(html);
      const d = h.docxDrawings(parts.doc)[0];
      if (!d) return { pass: false, notes: 'aucune image exportée' };
      const hostP = h.docxParagraphs(parts.doc).find(p => p.drawingCount === 1);
      // Deux façons acceptables de centrer : le paragraphe porteur est centré (image en ligne), ou l'ancre elle-même est centrée.
      const centered = (d.kind === 'inline' && hostP && hostP.align === 'center') || (d.kind === 'anchor' && d.alignH === 'center');
      const pdf = await h.exportPdfContent(html, null);
      const pdfImg = h.findImages(pdf.content)[0];
      return { pass: centered, notes: JSON.stringify({ kind: d.kind, anchorAlignH: d.alignH, paragraphAlign: hostP && hostP.align, pdfAlignment: pdfImg && pdfImg.alignment }) };
    },
  });
  cases.push({
    id: 'docximg_no_align_stays_inline',
    description: 'Image sans calque ni alignement : reste une image EN LIGNE (<wp:inline>), jamais un flottant',
    run: async (h) => {
      const parts = await h.exportDocxParts('<p>Texte' + img({}, 'width: 120px;') + 'suite</p>');
      const d = h.docxDrawings(parts.doc)[0];
      return { pass: !!d && d.kind === 'inline', notes: JSON.stringify(d || null) };
    },
  });

  // --- Calque devant / derrière ---
  cases.push({
    id: 'docximg_layer_behind',
    description: 'Calque "derrière le texte" : behindDoc=1 ; calque "devant" : behindDoc=0',
    run: async (h) => {
      const layered = (layer, top) => img({ 'data-layer': layer, 'data-page-index': 0, 'data-page-left-pt': 100, 'data-page-top-pt': top }, 'width: 100px; position:absolute; left:10px; top:' + top + 'px;');
      const parts = await h.exportDocxParts('<p>a' + layered('behind', 40) + '</p><p>b' + layered('front', 80) + '</p>');
      const ds = h.docxDrawings(parts.doc);
      if (ds.length !== 2) return { pass: false, notes: 'attendu 2 images, trouvé ' + ds.length };
      return { pass: ds[0].behindDoc === true && ds[1].behindDoc === false, notes: JSON.stringify(ds.map(d => ({ behindDoc: d.behindDoc, wrap: d.wrap }))) };
    },
  });
  cases.push({
    id: 'docximg_layer_no_wrap',
    description: 'Une image en calque ne repousse JAMAIS le texte (<wp:wrapNone>) - contrairement à une image habillée',
    run: async (h) => {
      const parts = await h.exportDocxParts('<p>a' + img({ 'data-layer': 'front', 'data-page-index': 0, 'data-page-left-pt': 50, 'data-page-top-pt': 60 }, 'width: 100px; position:absolute; left:10px; top:60px;') + '</p>');
      const d = h.docxDrawings(parts.doc)[0];
      return { pass: !!d && d.wrap === 'none', notes: JSON.stringify(d || null) };
    },
  });
  cases.push({
    id: 'docximg_layer_page_grid_exact',
    description: 'Position en calque = marge de page + grille page capturée (formule identique à js/pdf-export.js), à l\'EMU près',
    run: async (h) => {
      const parts = await h.exportDocxParts('<p>a' + img({ 'data-layer': 'front', 'data-page-index': 0, 'data-page-left-pt': 123.5, 'data-page-top-pt': 47.25 }, 'width: 100px; position:absolute; left:10px; top:47px;') + '</p>');
      const d = h.docxDrawings(parts.doc)[0];
      if (!d) return { pass: false, notes: 'aucune image exportée' };
      const expected = { x: PAGE_MARGIN_PT + 123.5, y: PAGE_MARGIN_PT + 47.25 };
      const pass = Math.abs(d.x - expected.x) < 0.01 && Math.abs(d.y - expected.y) < 0.01;
      return { pass, notes: JSON.stringify({ expected, got: { x: d.x, y: d.y } }) };
    },
  });
  cases.push({
    id: 'docximg_layer_follows_page_margins',
    description: 'Des marges de page personnalisées décalent d\'autant l\'ancre en calque (la grille page est relative au CONTENU, pas au bord de la feuille)',
    run: async (h) => {
      const margins = { top: 1440, right: 1440, bottom: 1440, left: 1440 }; // 1 pouce = 72pt
      const parts = await h.exportDocxParts('<p>a' + img({ 'data-layer': 'front', 'data-page-index': 0, 'data-page-left-pt': 30, 'data-page-top-pt': 40 }, 'width: 100px; position:absolute; left:30px; top:40px;') + '</p>', null, margins);
      const d = h.docxDrawings(parts.doc)[0];
      const sect = h.docxSectionProps(parts.doc);
      if (!d) return { pass: false, notes: 'aucune image exportée' };
      const expected = { x: 72 + 30, y: 72 + 40 };
      const pass = Math.abs(d.x - expected.x) < 0.01 && Math.abs(d.y - expected.y) < 0.01 && sect.margins.left === 1440;
      return { pass, notes: JSON.stringify({ expected, got: { x: d.x, y: d.y }, pgMar: sect.margins }) };
    },
  });
  cases.push({
    id: 'docximg_layer_fallback_measured_position',
    description: 'Calque SANS grille page (document ancien, left/top posés à la main) : repli sur la mesure réelle du rendu, jamais sur une image en ligne',
    run: async (h) => {
      const parts = await h.exportDocxParts('<p>a' + img({ 'data-layer': 'front' }, 'width: 100px; position:absolute; left:60px; top:24px;') + '</p>');
      const d = h.docxDrawings(parts.doc)[0];
      if (!d) return { pass: false, notes: 'aucune image exportée' };
      if (d.kind !== 'anchor') return { pass: false, notes: 'repli en image en ligne : la position est perdue' };
      // 60px = 45pt, 24px = 18pt, plus la marge de page.
      const expected = { x: PAGE_MARGIN_PT + 45, y: PAGE_MARGIN_PT + 18 };
      const pass = Math.abs(d.x - expected.x) <= TOL_PT && Math.abs(d.y - expected.y) <= TOL_PT;
      return { pass, notes: JSON.stringify({ expected, got: { x: d.x, y: d.y } }) };
    },
  });

  // --- Régressions déjà payées une fois (cf. historique git) ---
  cases.push({
    id: 'docximg_unique_docpr_ids',
    description: 'Régression f7bfb78 : deux images du même document ont des id <wp:docPr> DIFFÉRENTS (Word refuse d\'ouvrir un fichier avec des id dupliqués)',
    run: async (h) => {
      const parts = await h.exportDocxParts('<p>' + img({}, 'width: 100px;') + '</p><p>' + img({}, 'width: 100px;') + '</p><p>' + img({ 'data-align': 'right' }, 'width: 100px;') + '</p>');
      const ids = h.docxDrawings(parts.doc).map(d => d.docPrId);
      const unique = new Set(ids);
      return { pass: ids.length === 3 && unique.size === 3, notes: 'ids=' + JSON.stringify(ids) };
    },
  });
  cases.push({
    id: 'docximg_direct_child_of_body',
    description: 'Régression 7a9cffe : une <img> enfant DIRECT du document (hors <p>) ne disparaît pas de l\'export',
    run: async (h) => {
      const parts = await h.exportDocxParts('<p>avant</p>' + img({}, 'width: 100px;') + '<p>apres</p>');
      const ds = h.docxDrawings(parts.doc);
      return { pass: ds.length === 1, notes: 'images exportées : ' + ds.length + ' ' + JSON.stringify(ds) };
    },
  });
  cases.push({
    id: 'docximg_direct_child_layered_keeps_position',
    description: 'Une <img> en calque enfant DIRECT du document garde sa position (ancre), pas seulement sa présence',
    run: async (h) => {
      const parts = await h.exportDocxParts('<p>avant</p>' + img({ 'data-layer': 'behind', 'data-page-index': 0, 'data-page-left-pt': 70, 'data-page-top-pt': 90 }, 'width: 100px; position:absolute; left:70px; top:90px;') + '<p>apres</p>');
      const d = h.docxDrawings(parts.doc)[0];
      if (!d) return { pass: false, notes: 'image disparue' };
      const pass = d.kind === 'anchor' && Math.abs(d.x - (PAGE_MARGIN_PT + 70)) < 0.01 && Math.abs(d.y - (PAGE_MARGIN_PT + 90)) < 0.01 && d.behindDoc === true;
      return { pass, notes: JSON.stringify(d) };
    },
  });

  // --- Images dans les contextes imbriqués et les zones en-tête/pied ---
  cases.push({
    id: 'docximg_in_table_cell_inline',
    description: 'Une image en ligne dans une cellule de tableau reste DANS la cellule',
    run: async (h) => {
      const parts = await h.exportDocxParts('<table><tbody><tr><td><p>A' + img({}, 'width: 80px;') + '</p></td><td><p>B</p></td></tr></tbody></table>');
      const ds = h.docxDrawings(parts.doc);
      const tables = h.docxTables(parts.doc);
      const inCell = tables.length === 1 && tables[0].rows[0].cells[0].text === 'A';
      return { pass: ds.length === 1 && ds[0].kind === 'inline' && inCell, notes: JSON.stringify({ drawings: ds.length, kind: ds[0] && ds[0].kind, tables: tables.length }) };
    },
  });
  cases.push({
    id: 'docximg_in_header_and_footer',
    description: 'Une image posée dans l\'en-tête et dans le pied de page se retrouve dans header1.xml / footer1.xml (pas dans le corps)',
    run: async (h) => {
      const hf = { enabled: true, differentFirstPage: false, header: { default: '<p>En-tete' + img({}, 'width: 60px;') + '</p>', first: '' }, footer: { default: '<p>Pied' + img({}, 'width: 60px;') + '</p>', first: '' } };
      const parts = await h.exportDocxParts('<p>corps</p>', hf);
      const bodyDrawings = h.docxDrawings(parts.doc);
      const headerNames = parts.names.filter(n => /word\/header\d+\.xml$/.test(n));
      const footerNames = parts.names.filter(n => /word\/footer\d+\.xml$/.test(n));
      const inHeader = headerNames.map(n => h.docxDrawings(parts.part(n)).length).reduce((a, b) => a + b, 0);
      const inFooter = footerNames.map(n => h.docxDrawings(parts.part(n)).length).reduce((a, b) => a + b, 0);
      return { pass: bodyDrawings.length === 0 && inHeader === 1 && inFooter === 1, notes: JSON.stringify({ corps: bodyDrawings.length, headerNames, footerNames, inHeader, inFooter }) };
    },
  });

  // --- Robustesse : ce qui ne doit PAS finir dans le fichier ---
  cases.push({
    id: 'docximg_pdf_skip_excluded',
    description: 'Une image marquée data-pdf-skip (placeholder d\'aperçu) n\'est jamais exportée',
    run: async (h) => {
      const parts = await h.exportDocxParts('<p>' + img({ 'data-pdf-skip': 'true' }, 'width: 100px;') + 'texte</p>');
      const ds = h.docxDrawings(parts.doc);
      return { pass: ds.length === 0, notes: 'images exportées : ' + ds.length };
    },
  });
  cases.push({
    id: 'docximg_unreachable_src_skipped',
    description: 'Une image dont la source est introuvable est ignorée sans faire échouer tout l\'export',
    run: async (h) => {
      const parts = await h.exportDocxParts('<p>avant<img class="editor-image" src="/dev-tests/introuvable-404.png" alt="Image" style="width:100px;">apres</p>');
      const ds = h.docxDrawings(parts.doc);
      const text = h.docxParagraphs(parts.doc).map(p => p.text).join('');
      return { pass: ds.length === 0 && text.includes('avant') && text.includes('apres'), notes: JSON.stringify({ images: ds.length, text }) };
    },
  });
  cases.push({
    id: 'docximg_webp_rasterized_to_png',
    description: 'Un format que DOCX n\'accepte pas (WEBP) est rastérisé en PNG au lieu d\'être perdu',
    run: async (h) => {
      // WEBP 4x1 réel (encodé par Chromium lui-même) - un WEBP tronqué passerait le test pour une mauvaise raison (image ignorée = 0 image aussi).
      const webp = 'data:image/webp;base64,UklGRh4CAABXRUJQVlA4WAoAAAAgAAAAAwAAAAAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZWUDggMAAAANABAJ0BKgQAAQABQCYloAJ0ugH4AAOwAP73WS/+QWlct4A//jKnxlT4yp/xcwAAAA==';
      const parts = await h.exportDocxParts('<p><img class="editor-image" src="' + webp + '" alt="Image" style="width:100px;"></p>');
      const ds = h.docxDrawings(parts.doc);
      const media = Object.keys(parts.mediaSizes);
      return { pass: ds.length === 1 && media.length === 1 && /\.png$/.test(media[0]), notes: JSON.stringify({ images: ds.length, media }) };
    },
  });
  cases.push({
    id: 'docximg_same_source_shared_media',
    description: 'Deux images de la même source ne sont embarquées qu\'une fois dans word/media (poids du fichier)',
    run: async (h) => {
      const parts = await h.exportDocxParts('<p>' + img({}, 'width: 100px;') + '</p><p>' + img({}, 'width: 200px;') + '</p>');
      const media = Object.keys(parts.mediaSizes);
      return { pass: h.docxDrawings(parts.doc).length === 2 && media.length === 1, notes: JSON.stringify({ media, drawings: h.docxDrawings(parts.doc).length }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.docxImages = cases;
})();
