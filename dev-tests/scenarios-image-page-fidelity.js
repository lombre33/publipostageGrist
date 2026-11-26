// Suite "imagePageFidelity" - une image en calque (devant ou derrière le texte) est PEINTE à la page et à la place où l'éditeur la montre, dans le PDF, le Word et l'OpenDocument
// (bug du 26/11, signalé par Antoine : « en Lecture comme dans l'éditeur, le logo est en haut à gauche de la page 1, à côté du logo France 2030 ; dans le PDF, il disparaît de la page 1 et se
// retrouve sur la page suivante, à gauche de la formule de politesse »).
//
// Ce que la suite a trouvé. js/pdf-export.js posait une image « devant le texte » à position de page APRÈS le dernier bloc qui COMMENCE sur sa page. pdfmake peint une image à position
// absolue sur la page où il en est de son contenu : quand ce dernier bloc finit sur la page suivante - la zone à deux colonnes d'une lettre, un tableau, un long paragraphe -, le logo de la
// page 1 se peignait en page 2, à la même place. Une image visée sur une page où AUCUN bloc ne commence (une zone ou un tableau la traverse de part en part) se posait, elle, sur la dernière
// page. Corrigé : la page d'une image est celle de sa grille (`data-page-index`), jamais celle d'un bloc voisin ; « devant » qui ne peut suivre un bloc de sa page se peint au pied de cette page
// (js/pdf-export.js : placeOnGridPage, footFrontImages).
// Word et OpenDocument ancrent l'image au PARAGRAPHE qui la porte, à une place relative à la PAGE de ce paragraphe : une image de la page 1 portée par un paragraphe de la page 2 (insérée à la fin,
// puis glissée en haut) sortait en page 2. Elle est désormais ancrée au premier paragraphe du document (ExportCommon.anchorFirstPageImages).
//
// Comment la suite juge. Jamais une valeur écrite en dur ni une métadonnée interne : l'ÉCRAN est mesuré dans le DOM de l'éditeur (la feuille, ses coutures de pagination), le PDF est RELU par pdf.js
// (la page et le rectangle réellement peints), le Word et l'OpenDocument sont ouverts et leur XML lu (le paragraphe d'ancrage, la place sur la page).
window.EditorTestSuites = window.EditorTestSuites || {};
window.EditorTestSuites.imagePageFidelity = (function () {
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const PT = 96 / 72;
  const TOLERANCE_PT = 1.5;
  const cases = [];
  const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? TOLERANCE_PT : tol);
  const r2 = v => Math.round(v * 100) / 100;

  // --- Les documents : un bloc qui COMMENCE sur la page 1 et FINIT plus loin ---
  const blanks = n => '<p></p>'.repeat(n);
  const rows = (k, tag) => Array.from({ length: k }, (_, i) => '<p>' + tag + ' ' + i + '</p>').join('');
  const zone = (left, right) => '<div class="two-columns-zone" style="--layout-left: 50%"><div class="two-columns-column">' + left + '</div><div class="two-columns-column">' + right + '</div></div>';
  // La lettre d'Antoine : à gauche l'expéditeur, des lignes vides, l'adresse ; à droite le destinataire, des lignes vides, le corps.
  const letter = n => zone('<p><strong>Vice-presidence</strong></p>' + blanks(n) + '<p>Affaire suivie par</p>', '<p>Madame, Monsieur,</p>' + blanks(Math.round(n / 2)) + rows(3, 'Corps'));
  const table = n => '<table><tbody>' + Array.from({ length: n }, (_, i) => '<tr><td><p>Ligne ' + i + '</p></td><td><p>valeur ' + i + '</p></td></tr>').join('') + '</tbody></table>';
  const bigParagraph = '<p>' + 'mot de remplissage '.repeat(900) + '</p>';

  // `grid(layer, left, top, page)` : l'image en calque telle que l'éditeur l'écrit (style, calque, grille page capturée) ; `host` : où se pose le <img> dans le document.
  const imgTag = (layer, leftPt, topPt, pageIndex, src, width) => '<img class="editor-image" src="' + (src || PNG) + '" alt="" style="width: ' + (width || 120) + 'px; position: absolute; left: ' + r2(leftPt * PT) + 'px; top: ' + r2(topPt * PT) + 'px; z-index: ' + (layer === 'front' ? 5 : -1)
    + ';" data-layer="' + layer + '" data-wrap="inline" data-page-index="' + pageIndex + '" data-page-left-pt="' + leftPt + '" data-page-top-pt="' + topPt + '">';

  // Les formes de document : `html(image, host)` rend le document avec l'image portée par son premier paragraphe (`host` 'top'), par le dernier (`host` 'end', page tardive), ou par un paragraphe
  // DANS le bloc qui déborde (`host` 'inside' : une zone, une case de tableau).
  const SHAPES = {
    short: { pages: 1, html: (image, host) => (host === 'end' ? '<p>Debut</p>' + rows(4, 'Corps') + '<p>Fin' + image + '</p>' : '<p>Debut' + image + '</p>' + rows(4, 'Corps') + '<p>Fin</p>') },
    zone: {
      pages: 2,
      html: (image, host) => '<p>Debut' + (host === 'top' ? image : '') + '</p>'
        + zone('<p>Gauche' + (host === 'inside' ? image : '') + '</p>' + blanks(60) + '<p>Bas gauche</p>', '<p>Droite</p>' + rows(30, 'Corps'))
        + '<p>Fin' + (host === 'end' ? image : '') + '</p>',
    },
    zoneThreePages: {
      pages: 3,
      html: (image, host) => '<p>Debut' + (host === 'top' ? image : '') + '</p>'
        + zone('<p>Gauche' + (host === 'inside' ? image : '') + '</p>' + blanks(130) + '<p>Bas gauche</p>', '<p>Droite</p>' + rows(65, 'Corps'))
        + '<p>Fin' + (host === 'end' ? image : '') + '</p>',
    },
    table: {
      pages: 3,
      html: (image, host) => '<p>Debut' + (host === 'top' ? image : '') + '</p>' + table(120).replace('<td><p>Ligne 0</p>', '<td><p>Ligne 0' + (host === 'inside' ? image : '') + '</p>') + '<p>Fin' + (host === 'end' ? image : '') + '</p>',
    },
    bigParagraph: {
      pages: 3,
      html: (image, host) => '<p>Debut' + (host === 'top' ? image : '') + '</p>' + bigParagraph + '<p>Fin' + (host === 'end' ? image : '') + '</p>',
    },
  };

  const pdfMargins = () => PageLayout.getMarginsPt();

  async function paintedImages(h, html) {
    const res = await h.exportPdfContent(html, null, pdfMargins());
    const truth = await h.extractPdfGroundTruth(res.base64);
    return { res, truth, count: truth.pages.length, painted: truth.pages.map(page => page.images) };
  }

  // ============================================================================================================================================================================================
  // 1. Le PDF : chaque forme de document × devant / derrière × page visée × paragraphe porteur
  // ============================================================================================================================================================================================
  Object.keys(SHAPES).forEach((shapeName) => {
    const shape = SHAPES[shapeName];
    const targets = shape.pages > 1 ? [0, 1] : [0];
    const hosts = (shapeName === 'short' || shapeName === 'bigParagraph') ? ['top', 'end'] : ['top', 'end', 'inside'];
    ['front', 'behind'].forEach(layer => targets.forEach(pageIndex => hosts.forEach((host) => {
      cases.push({
        id: 'ipf_pdf_' + shapeName + '_' + layer + '_page' + (pageIndex + 1) + '_host_' + host,
        description: 'PDF, ' + shapeName + ' : l\'image ' + (layer === 'front' ? 'devant' : 'derrière') + ' le texte de la page ' + (pageIndex + 1) + ' (portée par ' + host + ') est PEINTE sur cette page, à la place de la grille',
        run: async (h) => {
          await h.resetEditor();
          const leftPt = 30, topPt = 20;
          const html = shape.html(imgTag(layer, leftPt, topPt, pageIndex), host);
          const { count, painted } = await paintedImages(h, html);
          const margins = pdfMargins();
          const want = { page: Math.min(pageIndex, count - 1), x: margins.left + leftPt, y: margins.top + topPt };
          const all = painted.reduce((n, list) => n + list.length, 0);
          const onPage = painted[want.page] || [];
          const one = onPage[0];
          const where = painted.map((list, i) => i + 1 + ':' + list.length).join(' ');
          // Le document doit réellement déborder : sans quoi la suite ne prouve rien.
          const setup = count >= shape.pages;
          const pass = setup && all === 1 && onPage.length === 1 && near(one.x, want.x) && near(one.y, want.y);
          return { pass, notes: JSON.stringify({ pagesDuPdf: count, pagesAttendues: '≥' + shape.pages, imagesParPage: where, attendu: want, peint: one || null }) };
        },
      });
    })));
  });

  // Le pied de page, où se peignent les images « devant » qu'aucun bloc ne peut porter, a lui aussi ses hôtes : bande d'en-tête et de pied, note de bas de page, page en paysage. L'image reste à sa
  // place de grille (marge du haut du document, bande comprise) sur la page 1, et ce que le pied porte déjà (la note) reste.
  const hfOf = (header, footer) => ({ enabled: true, differentFirstPage: false, header: { default: header, first: '' }, footer: { default: footer, first: '' } });
  const FOOT_VARIANTS = {
    header_and_footer: { hf: hfOf('<p>EN-TETE</p>', '<p>PIED</p>'), prepare: () => {}, extra: html => html, restore: () => {} },
    footnote: { hf: null, prepare: () => {}, extra: html => html.replace('<p>Debut', '<p>Debut<sup class="footnote-ref-marker" data-note-id="n1" data-note-text="Texte de la note">1</sup>'), restore: () => {}, note: 'Texte de la note' },
    landscape: { hf: null, prepare: () => PageLayout.setOrientation('landscape'), extra: html => html, restore: () => PageLayout.setOrientation('portrait') },
  };
  Object.keys(FOOT_VARIANTS).forEach((name) => {
    const variant = FOOT_VARIANTS[name];
    cases.push({
      id: 'ipf_pdf_zone_front_foot_' + name,
      description: 'PDF, zone débordante, image devant le texte de la page 1 (' + name.replace(/_/g, ' ') + ') : peinte sur la page 1, à sa place de grille, et rien de ce que le pied portait ne disparaît',
      run: async (h) => {
        await h.resetEditor();
        variant.prepare();
        try {
          const html = variant.extra(SHAPES.zone.html(imgTag('front', 30, 20, 0), 'end'));
          const res = await h.exportPdfContent(html, variant.hf, PageLayout.getMarginsPt());
          const truth = await h.extractPdfGroundTruth(res.base64);
          const painted = truth.pages.map(page => page.images);
          const margins = res.docDefinition.pageMargins;
          const first = (painted[0] || [])[0];
          const all = painted.reduce((n, list) => n + list.length, 0);
          const wantX = margins[0] + 30, wantY = margins[1] + 20;
          const footerText = name === 'header_and_footer' ? 'PIED' : (variant.note || null);
          const footerSeen = !footerText || truth.pages.some(page => page.textItems.map(item => item.str).join(' ').replace(/\s+/g, ' ').indexOf(footerText) >= 0);
          const problems = [];
          if (truth.pages.length < 2) problems.push('le document ne déborde pas : ' + truth.pages.length + ' page');
          if (all !== 1 || !first) problems.push('images peintes : ' + painted.map(list => list.length).join('/'));
          else if (!(near(first.x, wantX) && near(first.y, wantY))) problems.push('place ' + r2(first.x) + ',' + r2(first.y) + ' au lieu de ' + r2(wantX) + ',' + r2(wantY));
          if (!footerSeen) problems.push('« ' + footerText + ' » a disparu du PDF');
          return { pass: problems.length === 0, notes: JSON.stringify({ problems, pages: truth.pages.length, peint: first || null, attendu: { x: wantX, y: wantY } }) };
        } finally { variant.restore(); }
      },
    });
  });

  // Les deux logos de la lettre : France 2030 derrière (en haut à droite), l'université devant (en haut à gauche), portés par la zone à deux colonnes - les deux sur la page 1.
  cases.push({
    id: 'ipf_pdf_two_logos_of_the_letter',
    description: 'PDF, la lettre d\'Antoine : le logo devant (haut gauche) ET le logo derrière (haut droite) sont tous deux sur la page 1, aucun sur la page 2',
    run: async (h) => {
      await h.resetEditor();
      const front = imgTag('front', 30, 12, 0, PNG, 160);
      const behind = imgTag('behind', 420, 12, 0, PNG, 70);
      const html = '<p>' + front + behind + '</p>' + letter(60) + '<p>Fin</p>';
      const { count, painted } = await paintedImages(h, html);
      const margins = pdfMargins();
      const page1 = painted[0] || [];
      const hasAt = (x, y) => page1.some(i => near(i.x, margins.left + x) && near(i.y, margins.top + y));
      const later = painted.slice(1).reduce((n, list) => n + list.length, 0);
      const pass = count >= 2 && page1.length === 2 && later === 0 && hasAt(30, 12) && hasAt(420, 12);
      return { pass, notes: JSON.stringify({ pagesDuPdf: count, page1, apres: later }) };
    },
  });

  // Une page visée qui n'existe plus (le document a raccourci depuis le positionnement de l'image) : sur la dernière page, jamais perdue.
  cases.push({
    id: 'ipf_pdf_page_beyond_the_end_goes_to_the_last_page',
    description: 'PDF : une image visée sur la page 6 d\'un document de 2 pages est peinte sur la dernière page (jamais perdue ni sur la première)',
    run: async (h) => {
      await h.resetEditor();
      const html = SHAPES.zone.html(imgTag('front', 30, 20, 5), 'top');
      const { count, painted } = await paintedImages(h, html);
      const all = painted.reduce((n, list) => n + list.length, 0);
      const pass = count === 2 && all === 1 && (painted[count - 1] || []).length === 1;
      return { pass, notes: JSON.stringify({ pagesDuPdf: count, imagesParPage: painted.map(list => list.length) }) };
    },
  });

  // Un macro-modèle : le logo de chaque courrier est sur la première page de SON courrier (le premier courrier déborde sur la page 2, le second commence en page 3).
  const macroHtml = () => '<p>Courrier 1' + imgTag('front', 30, 20, 0) + '</p>' + letter(60) + '<p>Fin 1</p>' + MacroTemplates.slotBreakHtml(1) + '<p>Courrier 2' + imgTag('behind', 200, 40, 0) + imgTag('front', 30, 20, 0) + '</p>' + rows(4, 'Corps') + '<p>Fin 2</p>';
  cases.push({
    id: 'ipf_pdf_macro_each_letter_logo_on_its_own_first_page',
    description: 'PDF, macro-modèle : le logo du courrier 1 (devant, la zone déborde) est sur la page 1, ceux du courrier 2 (devant et derrière) sont sur la page où ce courrier commence',
    run: async (h) => {
      await h.resetEditor();
      const { count, painted, truth } = await paintedImages(h, macroHtml());
      const margins = pdfMargins();
      const pageOf = word => truth.pages.findIndex(page => page.textItems.some(item => item.str.indexOf(word) >= 0));
      const second = pageOf('Courrier');
      const secondStart = truth.pages.findIndex(page => /Courrier\s*2/.test(page.textItems.map(item => item.str).join(' ')));
      const at = (list, x, y) => list.filter(i => near(i.x, margins.left + x) && near(i.y, margins.top + y)).length;
      const problems = [];
      if (count < 3) problems.push('le scénario ne prouve rien : ' + count + ' page(s) seulement');
      if (at(painted[0] || [], 30, 20) !== 1) problems.push('logo du courrier 1 absent de la page 1');
      if (secondStart < 1) problems.push('le courrier 2 ne commence pas après la page 1 (page ' + (secondStart + 1) + ')');
      else {
        if (at(painted[secondStart] || [], 30, 20) !== 1) problems.push('logo devant du courrier 2 absent de la page ' + (secondStart + 1));
        if (at(painted[secondStart] || [], 200, 40) !== 1) problems.push('logo derrière du courrier 2 absent de la page ' + (secondStart + 1));
      }
      const total = painted.reduce((n, list) => n + list.length, 0);
      if (total !== 3) problems.push(total + ' image(s) peinte(s) au lieu de 3');
      return { pass: problems.length === 0, notes: JSON.stringify({ problems, pagesDuPdf: count, imagesParPage: painted.map(list => list.length), courrier2: secondStart + 1, premierMot: second + 1 }) };
    },
  });

  // ============================================================================================================================================================================================
  // 2. L'écran = le PDF = le Word = l'OpenDocument, par le vrai geste : insérer l'image à la fin, la mettre devant, la glisser en haut à gauche de la page 1
  // ============================================================================================================================================================================================
  function zoomOf(el) {
    const sheet = el.closest ? el.closest('.v2-page-sheet') : null;
    const z = sheet ? parseFloat(getComputedStyle(sheet).zoom) : NaN;
    return (isFinite(z) && z > 0) ? z : 1;
  }
  // Les coutures de la pagination de l'éditeur, de haut en bas (l'écran : ce que la personne voit).
  const seamsTop = () => Array.from(document.querySelectorAll('#editor-container .v2-pagination-overlay .v2-page-break-line, #editor-container .v2-pagination-overlay .v2-page-seam'))
    .map(seam => seam.getBoundingClientRect().top).sort((a, b) => a - b);

  // L'image à l'écran : sa page (celle des coutures qui la précèdent) et son coin en points depuis le coin de la feuille de CETTE page (pour la page 1 : le coin de la feuille).
  function onScreen(wrap) {
    const tip = document.querySelector('#editor-container .tiptap');
    const sheet = tip.parentElement.getBoundingClientRect();
    const rect = wrap.getBoundingClientRect();
    const seams = seamsTop();
    let page = 0;
    while (page < seams.length && seams[page] <= rect.top) page++;
    const zoom = zoomOf(tip);
    return { page, seams: seams.length, x: r2((rect.left - sheet.left) / zoom / PT), y: r2((rect.top - sheet.top) / zoom / PT) };
  }

  // Le document de la lettre dans l'éditeur, en Aperçu A4 : la zone déborde sur la page 2 (vérifié : une couture coupe la zone).
  async function openLetter(h) {
    await h.resetEditor();
    PageLayout.setMarginsMm(null);
    h.setA4Preview(true);
    Editor.setHTML('<p>Vice-presidence</p>' + letter(60) + '<p>Formule de politesse</p>');
    Editor.refreshLayout();
    await h.sleep(300);
    const zoneEl = document.querySelector('#editor-container .tiptap .two-columns-zone');
    const zoneRect = zoneEl.getBoundingClientRect();
    const seams = seamsTop();
    return { straddles: seams.some(top => top > zoneRect.top && top < zoneRect.bottom) };
  }

  // Insère l'image au curseur placé à la FIN du document (son paragraphe porteur est celui de la formule de politesse, page 2), la met devant ou derrière, puis la glisse au coin haut gauche de la page 1.
  async function placeLogoOnPageOne(h, layer) {
    await h.focusAtEnd();
    await h.insertImage(h.makeImage(200, 100, { logo: true }));
    await h.sleep(150);
    const img = h.tiptap().querySelector('img.editor-image');
    if (!img) return null;
    await h.selectAtomNode(img);
    await h.sleep(80);
    const button = document.querySelector('.v2-floating-toolbar button[data-action="layer-' + layer + '"]');
    if (!button) return null;
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await h.sleep(120);
    const wrap = img.closest('.editor-image-view');
    const handle = wrap.querySelector('.editor-image-move-handle');
    if (!handle) return null;
    const tip = document.querySelector('#editor-container .tiptap');
    const sheet = tip.parentElement.getBoundingClientRect();
    await h.dragFromTo(handle, null, [sheet.left + 110 * zoomOf(tip), sheet.top + 120 * zoomOf(tip)], 10);
    await h.sleep(150);
    return { img, wrap };
  }

  // Le paragraphe d'ancrage et la place de l'image dans le .docx : le rang du `w:p` qui la porte parmi tous ceux du document (0 = le premier paragraphe, sur la page 1), son origine et sa place.
  async function docxFacts(h, html) {
    const parts = await h.exportDocxParts(html, null, PageLayout.getMarginsTwip());
    const paragraphs = Array.from(parts.doc.getElementsByTagName('w:p'));
    const drawing = h.docxDrawings(parts.doc).find(d => d.kind === 'anchor');
    const anchor = parts.doc.getElementsByTagName('wp:anchor')[0];
    let hostParagraph = anchor;
    while (hostParagraph && hostParagraph.nodeName !== 'w:p') hostParagraph = hostParagraph.parentNode;
    return { anchors: parts.doc.getElementsByTagName('wp:anchor').length, hostRank: hostParagraph ? paragraphs.indexOf(hostParagraph) : -1, x: drawing ? drawing.x : null, y: drawing ? drawing.y : null, from: drawing ? drawing.relativeFrom : null };
  }
  async function odtFacts(html) {
    await ExportEngines.ensure(['odtExport']);
    const built = await OdtExport.build(html, { margins: PageLayout.getMarginsMm() });
    const zip = await JSZip.loadAsync(await built.blob.arrayBuffer());
    const xml = new DOMParser().parseFromString(await zip.file('content.xml').async('string'), 'application/xml');
    const frames = Array.from(xml.getElementsByTagName('draw:frame'));
    const frame = frames[0];
    const paragraphs = Array.from(xml.getElementsByTagName('office:text')[0].getElementsByTagName('*')).filter(el => el.nodeName === 'text:p' || el.nodeName === 'text:h');
    let hostParagraph = frame;
    while (hostParagraph && hostParagraph.nodeName !== 'text:p' && hostParagraph.nodeName !== 'text:h') hostParagraph = hostParagraph.parentNode;
    const cm = value => (value ? parseFloat(value) * 72 / 2.54 : null);
    return { frames: frames.length, hostRank: hostParagraph ? paragraphs.indexOf(hostParagraph) : -1, x: frame ? cm(frame.getAttribute('svg:x')) : null, y: frame ? cm(frame.getAttribute('svg:y')) : null };
  }

  ['front', 'behind'].forEach(layer => {
    cases.push({
      id: 'ipf_screen_pdf_word_odt_same_page_' + layer,
      description: 'Lettre à zone débordante : le logo ' + (layer === 'front' ? 'devant' : 'derrière') + ' le texte, inséré à la fin puis glissé en haut de la page 1, est à la même page et à la même place à l\'écran, dans le PDF, le Word et l\'OpenDocument',
      run: async (h) => {
        const opened = await openLetter(h);
        if (!opened.straddles) return { pass: false, notes: 'la zone ne déborde pas sur la page 2 : le scénario ne prouve rien' };
        const placed = await placeLogoOnPageOne(h, layer);
        if (!placed) return { pass: false, notes: 'image, bouton « ' + layer + ' » ou poignée introuvable' };
        const screen = onScreen(placed.wrap);
        const html = Editor.getHTML();
        const margins = pdfMargins();
        const pdf = await paintedImages(h, html);
        const first = (pdf.painted[0] || [])[0];
        const later = pdf.painted.slice(1).reduce((n, list) => n + list.length, 0);
        const word = await docxFacts(h, html);
        const odt = await odtFacts(html);
        const marginsTwip = PageLayout.getMarginsTwip();
        const problems = [];
        if (screen.page !== 0) problems.push('à l\'écran l\'image n\'est pas sur la page 1 (' + (screen.page + 1) + ')');
        if (!first) problems.push('PDF : rien de peint sur la page 1');
        else if (!(near(first.x, screen.x) && near(first.y, screen.y))) problems.push('PDF : place peinte ' + r2(first.x) + ',' + r2(first.y) + ' au lieu de ' + screen.x + ',' + screen.y + ' (écran)');
        if (later) problems.push('PDF : ' + later + ' image(s) peinte(s) sur les pages suivantes');
        if (word.anchors !== 1) problems.push('Word : ' + word.anchors + ' ancre(s) au lieu d\'une');
        else {
          if (word.hostRank !== 0) problems.push('Word : l\'image est ancrée au paragraphe n° ' + word.hostRank + ' (la page 2) au lieu du premier (la page 1)');
          if (!(near(word.x, screen.x) && near(word.y, screen.y))) problems.push('Word : place ' + r2(word.x) + ',' + r2(word.y) + ' au lieu de ' + screen.x + ',' + screen.y);
        }
        if (odt.frames !== 1) problems.push('OpenDocument : ' + odt.frames + ' cadre(s) au lieu d\'un');
        else {
          if (odt.hostRank !== 0) problems.push('OpenDocument : l\'image est ancrée au paragraphe n° ' + odt.hostRank + ' (la page 2) au lieu du premier (la page 1)');
          if (!(near(odt.x, screen.x) && near(odt.y, screen.y))) problems.push('OpenDocument : place ' + r2(odt.x) + ',' + r2(odt.y) + ' au lieu de ' + screen.x + ',' + screen.y);
        }
        return { pass: problems.length === 0, notes: JSON.stringify({ problems, ecran: screen, pdf: first || null, word: { hostRank: word.hostRank, x: word.x, y: word.y, depuis: word.from }, odt, margesTwip: marginsTwip, margesPdf: margins }) };
      },
    });
  });

  // ============================================================================================================================================================================================
  // 3. Word et OpenDocument : l'ancre suit la page de l'image, pas le paragraphe où elle a été insérée
  // ============================================================================================================================================================================================
  // Dans un macro-modèle, la « première page » d'un courrier est celle qui suit son saut : le logo de la page 1 d'un courrier, porté par le dernier paragraphe de CE courrier, est ancré à son premier
  // paragraphe - jamais à celui d'un autre courrier.
  ['docx', 'odt'].forEach(format => {
    cases.push({
      id: 'ipf_' + format + '_macro_logo_anchored_in_the_first_paragraph_of_its_own_letter',
      description: format.toUpperCase() + ', macro-modèle : le logo de la page 1 de chaque courrier, porté par son dernier paragraphe, est ancré au premier paragraphe de ce courrier',
      run: async (h) => {
        await h.resetEditor();
        const html = '<p>Courrier 1</p>' + rows(3, 'A') + '<p>Fin 1' + imgTag('front', 30, 20, 0) + '</p>' + MacroTemplates.slotBreakHtml(1) + '<p>Courrier 2</p>' + rows(3, 'B') + '<p>Fin 2' + imgTag('behind', 200, 40, 0) + '</p>';
        let hostTexts = [];
        if (format === 'docx') {
          const parts = await h.exportDocxParts(html, null, PageLayout.getMarginsTwip());
          hostTexts = Array.from(parts.doc.getElementsByTagName('wp:anchor')).map((anchor) => { let node = anchor; while (node && node.nodeName !== 'w:p') node = node.parentNode; return node ? node.textContent : null; });
        } else {
          await ExportEngines.ensure(['odtExport']);
          const built = await OdtExport.build(html, { margins: PageLayout.getMarginsMm() });
          const zip = await JSZip.loadAsync(await built.blob.arrayBuffer());
          const xml = new DOMParser().parseFromString(await zip.file('content.xml').async('string'), 'application/xml');
          hostTexts = Array.from(xml.getElementsByTagName('draw:frame')).map((frame) => { let node = frame; while (node && node.nodeName !== 'text:p' && node.nodeName !== 'text:h') node = node.parentNode; return node ? node.textContent : null; });
        }
        const pass = hostTexts.length === 2 && (hostTexts[0] || '').indexOf('Courrier 1') === 0 && (hostTexts[1] || '').indexOf('Courrier 2') === 0;
        return { pass, notes: JSON.stringify({ paragraphesDAncrage: hostTexts }) };
      },
    });
  });

  ['docx', 'odt'].forEach(format => ['front', 'behind'].forEach(layer => {
    ['short', 'zone'].forEach((shapeName) => {
      cases.push({
        id: 'ipf_' + format + '_anchor_follows_the_page_' + shapeName + '_' + layer,
        description: format.toUpperCase() + ', ' + shapeName + ' : l\'image ' + (layer === 'front' ? 'devant' : 'derrière') + ' le texte de la page 1, portée par le DERNIER paragraphe, est ancrée au premier paragraphe (page 1), à sa place de page',
        run: async (h) => {
          await h.resetEditor();
          const leftPt = 30, topPt = 20;
          const html = SHAPES[shapeName].html(imgTag(layer, leftPt, topPt, 0), 'end');
          const facts = format === 'docx' ? await docxFacts(h, html) : await odtFacts(html);
          const margins = format === 'docx' ? PageLayout.getMarginsTwip() : null;
          const marginLeftPt = format === 'docx' ? margins.left / 20 : PageLayout.getMarginsPt().left;
          const marginTopPt = format === 'docx' ? margins.top / 20 : PageLayout.getMarginsPt().top;
          const problems = [];
          if (facts.hostRank !== 0) problems.push('ancrée au paragraphe n° ' + facts.hostRank + ' au lieu du premier');
          if (!(near(facts.x, marginLeftPt + leftPt) && near(facts.y, marginTopPt + topPt))) problems.push('place ' + r2(facts.x) + ',' + r2(facts.y) + ' au lieu de ' + r2(marginLeftPt + leftPt) + ',' + r2(marginTopPt + topPt));
          return { pass: problems.length === 0, notes: JSON.stringify({ problems, facts: { hostRank: facts.hostRank, x: facts.x, y: facts.y } }) };
        },
      });
    });
    // Rien ne bouge quand l'image est déjà portée par le premier paragraphe : le fichier est celui d'avant.
    cases.push({
      id: 'ipf_' + format + '_anchor_stays_in_the_first_paragraph_' + layer,
      description: format.toUpperCase() + ' : une image ' + (layer === 'front' ? 'devant' : 'derrière') + ' le texte déjà portée par le premier paragraphe y reste, à sa place',
      run: async (h) => {
        await h.resetEditor();
        const html = SHAPES.short.html(imgTag(layer, 30, 20, 0), 'top');
        const facts = format === 'docx' ? await docxFacts(h, html) : await odtFacts(html);
        return { pass: facts.hostRank === 0, notes: JSON.stringify({ hostRank: facts.hostRank, x: facts.x, y: facts.y }) };
      },
    });
  }));

  return cases;
})();
