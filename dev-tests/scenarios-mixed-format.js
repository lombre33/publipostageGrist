// Pages de deux formats dans un macro-modèle (demande d'Antoine, 22/10, « importer des slides dans des documents et des pages de document dans des slides » ; carte « Pages de deux formats
// dans un macro-modèle » : « Maintenant, avec l'import », Word et Lecture d'abord, puis le PDF) : une présentation assemblée garde sa page de diapositive (16:9, 33,87 x 19,05 cm, en paysage)
// au milieu de pages A4, dans un macro-modèle « Selon chaque modèle ». Les documents et les modèles Grille suivent toujours le format du macro-modèle (choix du 09/10 : seul leur sens tourne).
//
// Le HTML assemblé le dit lui-même (js/page-sections.js) : à côté de `data-page-orientation`, le saut de page qui ouvre une présentation (et le repère de départ, si elle est la première) porte
// `data-page-format="190.5x338.7"` ; sans lui, le format reste celui des marges. Une SECTION est une suite de modèles de même sens ET de même format. Ce fichier écrit ces repères À LA MAIN,
// à dessein, comme le groupe `mixedOrientation` : il épingle le contrat du côté des sorties ; l'assemblage lui-même (`MacroTemplates`) a ses scénarios `format_assembly_*`.
//
// Lot 4a (la Lecture, le Word, l'impression) : `PageLayout.withPage` pose le sens ET le format le temps d'un calcul ; la Lecture range le document en une feuille par section (largeur et hauteur de
// SA page, le facteur d'ajustement qui montre une diapositive en entier) ; le Word écrit une section par suite de pages semblables (taille de page et largeur utile des tableaux) ; l'impression
// nomme sa page par sens et par format (`@page pp-landscape-190-5x338-7`).
//
// Lot 4b (le PDF) : pdfmake ne sait que tourner ses pages, un fichier n'a qu'UN format ; le contenu d'un macro-modèle qui mêle des formats se met donc en page suite par suite de pages de même format,
// un PDF chacune, que pdf-lib réunit (`PdfMerge.joinParts`) : chaque page a la taille de sa page, les numéros (en-tête, pied, sommaire, notes) restent ceux du document entier, l'en-tête et le pied sont
// refaits dans la largeur de chaque page, les liens du sommaire passent d'un fichier à l'autre. Un PDF protégé (chiffré par pdfmake, que pdf-lib ne relit pas) ne peut pas mêler les formats.
window.EditorTestSuites = window.EditorTestSuites || {};
window.EditorTestSuites.mixedFormat = (function () {
  const SLIDE = '190.5x338.7';
  const near = (a, b, tolerance) => Math.abs(a - b) <= tolerance;
  const clone = value => JSON.parse(JSON.stringify(value));
  const verdict = (problems, summary) => ({ pass: problems.length === 0, notes: JSON.stringify({ summary, problems }) });
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const PLAIN_BREAK = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';

  // --- Le HTML assemblé d'un macro-modèle aux pages mêlées, écrit à la main ---
  const attrsOf = (orientation, format) => ' data-page-orientation="' + orientation + '"' + (format ? ' data-page-format="' + format + '"' : '');
  const start = (orientation, format) => '<div class="page-section-start" contenteditable="false"' + attrsOf(orientation, format) + '></div>';
  const slotBreak = (rank, orientation, format) => '<div class="page-break-marker" contenteditable="false" data-macro-slot="' + rank + '"' + attrsOf(orientation, format) + '>Saut de page</div>';
  const lines = (n, tag) => Array.from({ length: n }, (_, i) => '<p>' + tag + ' ' + i + ' du modèle de test.</p>').join('');
  // Une présentation de `n` diapositives : un titre et un texte chacune, séparées par le saut de page de l'éditeur.
  const slidesOf = (n, tag) => Array.from({ length: n }, (_, i) => '<h1>' + tag + ' titre ' + i + '</h1><p>' + tag + ' texte ' + i + '</p>').join(PLAIN_BREAK);
  // Un tableau de quatre colonnes de 300 px : 1 200 px, trop large pour la largeur utile d'une page A4 portrait (719 px), il tient dans une diapositive (1 205 px).
  function wideTable(tag) {
    const widths = [300, 300, 300, 300];
    const row = r => '<tr data-row-height="28" style="height: 28px">' + widths.map((w, c) => '<td colwidth="' + w + '"><p>' + tag + r + 'c' + c + '</p></td>').join('') + '</tr>';
    return '<table style="width: 1200px;"><colgroup>' + widths.map(w => '<col style="width: ' + w + 'px;">').join('') + '</colgroup><tbody>' + row(0) + row(1) + '</tbody></table>';
  }
  // Un élément et ses attributs triés, récursivement : de quoi comparer deux HTML par leur structure sans dépendre de l'ordre où les attributs sont écrits.
  function canon(html) {
    const root = document.createElement('div');
    root.innerHTML = html;
    const walk = node => (node.nodeType === 3 ? node.nodeValue : node.nodeType === 1
      ? '<' + node.localName + Array.from(node.attributes).map(a => ' ' + a.name + '="' + a.value + '"').sort().join('') + '>' + Array.from(node.childNodes).map(walk).join('') + '</' + node.localName + '>' : '');
    return Array.from(root.childNodes).map(walk).join('');
  }
  const parse = html => { const root = document.createElement('div'); root.innerHTML = html; return root; };
  // Les modèles tels que `Templates` les rend à l'assemblage.
  const doc = (id, marginsMm, html, extra) => Object.assign({ id, nom: 'Modèle ' + id, contenu: html, typeModele: 'document', marginsMm }, extra || {});
  const deck = (id, html, marginsMm, extra) => Object.assign({ id, nom: 'Présentation ' + id, contenu: html, typeModele: 'presentation', marginsMm: marginsMm || null }, extra || {});
  const fixedSlots = (...ids) => ({ slots: ids.map(id => ({ type: 'fixed', modeleId: id })) });
  const assembleWith = (composition, templates, perModel) => MacroTemplates.buildConcatenatedHtml(composition, 'Clients', { id: 1 }, templates, perModel === undefined ? undefined : { perModel });
  // Le HTML d'une présentation tel que ses sorties le reçoivent (js/slides-entry.js:outputHtml).
  const deckOut = html => SlidesEntry.outputHtml('presentation', html);

  // La page du document d'avant les scénarios : A4 portrait, marges par défaut, sans réglage de sens par modèle.
  async function plainPage(h) {
    await h.resetEditor();
    PageLayout.setMarginsMm(null);
    OrientationToggle.sync();
    document.dispatchEvent(new CustomEvent('pp:pageLayoutChanged'));
    await h.sleep(150);
  }

  // --- La Lecture, mesurée dans le DOM ---
  const SHEET_PX = { P: 793.71, L: 1122.52, S: 1280.13 };
  const SHEET_HEIGHT_PX = { P: 1122.52, L: 793.71, S: 720 };
  const kindOfWidth = width => Object.keys(SHEET_PX).find(kind => near(width, SHEET_PX[kind], 1.5)) || '?';
  const readerBox = () => document.getElementById('reader-container');
  // Rend `html` dans la Lecture (aperçu A4 allumé) et mesure ses feuilles : pour chacune sa largeur et sa hauteur en pixels de mise en page, son genre (P portrait, L paysage, S diapositive, d'après sa
  // largeur) et le nombre de pages qu'elle compte (une couture par frontière de page, dans la surcouche qui lui correspond).
  async function readSheets(h, html, hf) {
    h.setA4Preview(true);
    await h.renderReaderMode(html, hf);
    await h.sleep(250);
    const box = readerBox();
    const overlays = Array.from(box.querySelectorAll(':scope > .v2-pagination-overlay'));
    const sheets = Array.from(box.querySelectorAll(':scope > .reader-content')).map((el, index) => {
      const zoom = EditorCore.layoutZoom(el);
      const rect = el.getBoundingClientRect();
      const width = rect.width / zoom;
      return { el, rank: el.getAttribute('data-pp-sheet'), width, height: rect.height / zoom, kind: kindOfWidth(width), pages: overlays[index] ? overlays[index].querySelectorAll('.v2-page-band').length + 1 : 1 };
    });
    return { box, sheets, kinds: sheets.map(sheet => sheet.kind).join(''), pages: sheets.map(sheet => sheet.pages).join(',') };
  }

  // --- Le Word, relu dans son XML (mêmes lectures que le groupe mixedOrientation) ---
  const wordText = node => Array.from(node.getElementsByTagName('w:t')).map(t => t.textContent).join('');
  const numberOf = (el, name) => (el && el.getAttribute(name) !== null ? Number(el.getAttribute(name)) : null);
  function wordSections(parts) {
    const sections = [];
    let blocks = [];
    const close = sect => {
      const pgSz = sect.getElementsByTagName('w:pgSz')[0];
      const pgMar = sect.getElementsByTagName('w:pgMar')[0];
      sections.push({
        width: numberOf(pgSz, 'w:w'), height: numberOf(pgSz, 'w:h'), orient: pgSz ? pgSz.getAttribute('w:orient') : null,
        margins: ['top', 'right', 'bottom', 'left'].map(name => numberOf(pgMar, 'w:' + name)).join(','), blocks,
      });
      blocks = [];
    };
    Array.from(parts.doc.getElementsByTagName('w:body')[0].children).forEach(node => {
      if (node.nodeName === 'w:sectPr') { close(node); return; }
      const pPr = node.nodeName === 'w:p' ? Array.from(node.children).find(child => child.nodeName === 'w:pPr') : null;
      const sect = pPr && Array.from(pPr.children).find(child => child.nodeName === 'w:sectPr');
      if (sect) close(sect); else blocks.push(node);
    });
    return sections;
  }
  const wordGridWidth = tbl => Array.from(tbl.getElementsByTagName('w:tblGrid')[0].getElementsByTagName('w:gridCol')).reduce((sum, col) => sum + Number(col.getAttribute('w:w')), 0);
  const PAGE_TWIP = { P: [11906, 16838, 'portrait'], L: [16838, 11906, 'landscape'], S: [19202, 10800, 'landscape'] };

  // --- L'impression par le navigateur, mesurée dans le conteneur caché de la page ---
  const printSheets = job => Array.from(job.root.querySelectorAll('.pp-print-sheet'));
  const printKind = sheet => kindOfWidth(parseFloat(sheet.style.width));
  async function printJob(html) { return PrintExport.prepare(html, null, { id: 1 }, clone(NO_HF), 'essai'); }

  // --- Le PDF, relu par pdf.js ---
  const PAGE_PT = { P: [595.28, 841.89], L: [841.89, 595.28], S: [960.09, 540] };
  const kindOfPdfPage = page => Object.keys(PAGE_PT).find(kind => near(page.width, PAGE_PT[kind][0], 1) && near(page.height, PAGE_PT[kind][1], 1)) || '?';
  const squash = text => text.replace(/\s+/g, ' ').trim();
  const blobBase64 = blob => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(blob); });
  // Le PDF fini d'un HTML (le fichier réuni, pas une mise en page intermédiaire) : par page sa taille, son genre (P, L, S), ses textes et ses images. Un document qui mêle des formats se rend en
  // plusieurs PDF que pdf-lib réunit : le fichier fini est le blob que le moteur rend (pas la dernière génération de pdfmake que `exportPdfContent` relit), et `docDefinition` celle de sa première
  // suite, qui porte les suivantes (`_followingRuns`).
  async function pdfOf(h, html, hf, margins) {
    await PdfExport.ensurePdfLibsLoaded();
    const definitions = [];
    const original = window.pdfMake.createPdf;
    window.pdfMake.createPdf = function (definition) { definitions.push(definition); return original.apply(window.pdfMake, arguments); };
    let result;
    try { result = await h.exportPdfContent(html, hf || null, margins || PageLayout.getMarginsPt()); } finally { window.pdfMake.createPdf = original; }
    result.docDefinition = definitions.find(definition => definition._followingRuns) || result.docDefinition;
    const gt = await h.extractPdfGroundTruth(await blobBase64(result.blob));
    const pages = gt.pages.map(page => ({ kind: kindOfPdfPage(page), width: page.width, height: page.height, items: page.textItems, images: page.images, text: squash(page.textItems.map(item => item.str).join(' ')) }));
    return { result, pages, kinds: pages.map(page => page.kind).join('') };
  }
  const NUMBERED_HF = {
    enabled: true, differentFirstPage: true,
    header: { default: '<table><tbody><tr><td><p>GAUCHE</p></td><td><p>DROITE</p></td></tr></tbody></table>', first: '<p>PREMIERE <span class="page-number-badge" data-format="n-slash-total">#</span></p>' },
    footer: { default: '<p style="text-align: right">PIED <span class="page-number-badge" data-format="n-slash-total">#</span></p>', first: '<p style="text-align: right">PREMIER-PIED <span class="page-number-badge" data-format="n-slash-total">#</span></p>' },
  };
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  // Une image en calque posée par sa grille de page (à `left` pt du coin du contenu, `top` pt sous lui), seule sur sa ligne ; une image flottante à droite, dans un paragraphe de texte ; une note de bas de page.
  const layerImage = (left, top) => '<p><img class="editor-image" src="' + PNG + '" alt="" style="width: 40px; height: 40px; position: absolute; left: 100px; top: 100px; z-index: 5;" data-layer="front" data-wrap="inline" data-page-index="0" data-page-left-pt="' + left + '" data-page-top-pt="' + top + '"></p>';
  const rightFloat = tag => '<p><img class="editor-image" src="' + PNG + '" alt="" style="width: 120px; height: 80px;" data-align="right" data-wrap="square">' + tag + ' ' + Array.from({ length: 40 }, (_, i) => 'mot' + i).join(' ') + '</p>';
  const note = (id, text) => '<sup class="footnote-ref-marker" data-note-id="' + id + '" data-note-text="' + text + '"></sup>';

  return [
    // ---------- Le lecteur des repères ----------
    {
      id: 'format_sections_the_reader_of_markers_splits_runs_of_equal_sense_and_format',
      description: 'PageSections : un saut de page qui garde le sens ET le format de la section en cours reste dans sa section, un autre format (même sens) ouvre la suivante, un format égal à celui des marges ne change rien, un repère sans format prend celui des marges, un format seul ou illisible ne dit rien, les pages employées et le repère de départ se lisent avec leur format, un appel à l\'ancienne (le sens seul) donne les mêmes sections qu\'avant',
      async run() {
        const problems = [];
        const base = { orientation: 'portrait', format: 'A4' };
        const shape = sections => sections.map(s => s.orientation[0] + ':' + s.format + ':' + s.nodes.filter(n => n.nodeType === 1).map(n => (n.classList.contains('page-break-marker') ? '|' + (n.getAttribute('data-macro-slot') || '') : n.textContent)).join(',')).join(' ');
        const html = start('portrait') + '<p>A</p>' + slotBreak(1, 'landscape', SLIDE) + '<p>B</p>' + slotBreak(2, 'landscape', SLIDE) + '<p>C</p>' + slotBreak(3, 'landscape') + '<p>D</p>'
          + slotBreak(4, 'portrait', 'A4') + '<p>E</p>' + slotBreak(5, 'portrait') + '<p>F</p>';
        const root = parse(html);
        if (!PageSections.hasSenses(root) || !PageSections.hasSenses(html)) problems.push('un document aux pages mêlées n\'est pas reconnu');
        const sections = PageSections.split(root.childNodes, base);
        const want = 'p:A4:A l:190.5x338.7:|1,B,|2,C l:A4:|3,D p:A4:|4,E,|5,F';
        if (shape(sections) !== want) problems.push('découpage : ' + shape(sections) + ' au lieu de « ' + want + ' »');
        // Une présentation qui ouvre le document : la section de départ a sa page.
        const slidesFirst = PageSections.split(parse(start('landscape', SLIDE) + '<p>A</p>' + slotBreak(1, 'portrait') + '<p>B</p>').childNodes, base);
        if (shape(slidesFirst) !== 'l:190.5x338.7:A p:A4:|1,B') problems.push('la présentation en premier : ' + shape(slidesFirst));
        // Un format seul (sans sens) ne dit rien ; un format illisible n\'en est pas un : le saut reste dans sa section, ou prend le format des marges.
        const formatOnly = PageSections.split(parse(start('portrait') + '<p>A</p><div class="page-break-marker" data-macro-slot="1" data-page-format="' + SLIDE + '">Saut de page</div><p>B</p>').childNodes, base);
        if (formatOnly.length !== 1) problems.push('un format sans sens ouvre une section : ' + shape(formatOnly));
        const unreadable = PageSections.split(parse(start('portrait') + '<p>A</p>' + slotBreak(1, 'portrait', 'carré') + '<p>B</p>').childNodes, base);
        if (unreadable.length !== 1) problems.push('un format illisible ouvre une section : ' + shape(unreadable));
        // Sans format de base (l\'appel d\'avant : le sens seul), les sections gardent leur sens et un repère sans format n\'en a pas.
        const legacy = PageSections.split(parse(start('portrait') + '<p>A</p>' + slotBreak(1, 'landscape') + '<p>B</p>').childNodes, 'portrait');
        if (shape(legacy) !== 'p:null:A l:null:|1,B') problems.push('appel à l\'ancienne : ' + shape(legacy));
        // Les pages employées, dans l\'ordre, sans doublon ; le repère de départ.
        const pages = PageSections.pagesIn(html).map(p => p.orientation[0] + ':' + p.format).join(' ');
        if (pages !== 'p:null l:190.5x338.7 l:null p:A4') problems.push('pagesIn : ' + pages);
        const first = PageSections.firstPageOf(start('landscape', SLIDE) + '<p>A</p>');
        if (!first || first.orientation !== 'landscape' || first.format !== SLIDE) problems.push('firstPageOf : ' + JSON.stringify(first));
        if (PageSections.firstPageOf(start('portrait')).format !== null || PageSections.firstPageOf('<p>A</p>') !== null) problems.push('firstPageOf sans format ou sans repère');
        if (PageSections.firstSenseOf(start('landscape', SLIDE)) !== 'landscape' || PageSections.sensesIn(html).join() !== 'portrait,landscape') problems.push('firstSenseOf / sensesIn changent : ' + PageSections.sensesIn(html).join());
        // Les attributs et le repère de départ fabriqués par PageSections sont ceux que ce fichier écrit à la main : le contrat du HTML assemblé.
        if (PageSections.attrsFor({ orientation: 'landscape', format: SLIDE }) !== attrsOf('landscape', SLIDE) || PageSections.attrsFor('landscape') !== attrsOf('landscape')) problems.push('attrsFor : ' + PageSections.attrsFor({ orientation: 'landscape', format: SLIDE }));
        if (PageSections.startHtml({ orientation: 'landscape', format: SLIDE }) !== start('landscape', SLIDE) || PageSections.startHtml('landscape', SLIDE) !== start('landscape', SLIDE) || PageSections.startHtml('portrait') !== start('portrait')) problems.push('startHtml : ' + PageSections.startHtml({ orientation: 'landscape', format: SLIDE }));
        if (PageSections.formatToken('a4') !== 'A4' || PageSections.formatToken('190.5X338.7') !== SLIDE || PageSections.formatToken('A44') !== null || PageSections.formatToken('') !== null) problems.push('formatToken');
        return verdict(problems, { decoupage: shape(sections), pages });
      },
    },
    {
      id: 'format_layout_with_page_sets_the_sense_and_the_format_for_one_calculation',
      description: 'PageLayout.withPage : le temps d\'un calcul, la page a ce sens et ce format (taille, largeur de feuille, marges inchangées), un format absent garde celui de la page, la page du document est rendue telle qu\'elle était, même si le calcul lève une exception ; withOrientation ne change que le sens',
      async run(h) {
        const problems = [];
        await plainPage(h);
        PageLayout.setMarginsMm({ top: 12, right: 14, bottom: 16, left: 18, orientation: 'portrait', format: 'A4' });
        const before = JSON.stringify(PageLayout.getMarginsMm());
        const seen = PageLayout.withPage({ orientation: 'landscape', format: SLIDE }, () => ({
          orientation: PageLayout.getOrientation(), format: PageLayout.getFormat(), sheet: PageLayout.getSheetWidthPx(), height: PageLayout.getPageSizePx().height, mm: PageLayout.getPageSizeMm(), margins: PageLayout.getMarginsMm(),
        }));
        if (seen.orientation !== 'landscape' || seen.format !== SLIDE) problems.push('page vue : ' + seen.orientation + ' ' + seen.format);
        if (!near(seen.sheet, SHEET_PX.S, 0.1) || !near(seen.height, SHEET_HEIGHT_PX.S, 0.1)) problems.push('taille de la diapositive : ' + seen.sheet + ' x ' + seen.height + ' px au lieu de ' + SHEET_PX.S + ' x ' + SHEET_HEIGHT_PX.S);
        if (!near(seen.mm.width, 338.7, 0.001) || !near(seen.mm.height, 190.5, 0.001)) problems.push('taille en mm : ' + JSON.stringify(seen.mm));
        if ([seen.margins.top, seen.margins.right, seen.margins.bottom, seen.margins.left].join() !== '12,14,16,18') problems.push('les marges changent : ' + JSON.stringify(seen.margins));
        if (JSON.stringify(PageLayout.getMarginsMm()) !== before) problems.push('la page du document n\'est pas rendue : ' + JSON.stringify(PageLayout.getMarginsMm()));
        const sense = PageLayout.withPage({ orientation: 'landscape' }, () => [PageLayout.getFormat(), PageLayout.getSheetWidthPx()]);
        if (sense[0] !== 'A4' || !near(sense[1], SHEET_PX.L, 0.1)) problems.push('sens seul : ' + sense.join());
        const format = PageLayout.withPage({ orientation: 'portrait', format: 'A5' }, () => PageLayout.getSheetWidthPx());
        if (!near(format, 559.37, 0.1)) problems.push('A5 portrait : ' + format);
        const old = PageLayout.withOrientation('landscape', () => [PageLayout.getFormat(), PageLayout.getOrientation()]);
        if (old.join() !== 'A4,landscape') problems.push('withOrientation : ' + old.join());
        let caught = false;
        try { PageLayout.withPage({ orientation: 'landscape', format: SLIDE }, () => { throw new Error('essai'); }); } catch (e) { caught = true; }
        if (!caught) problems.push('l\'exception du calcul est avalée');
        if (JSON.stringify(PageLayout.getMarginsMm()) !== before) problems.push('la page n\'est pas rendue après une exception');
        await plainPage(h);
        return verdict(problems, { seen: { sheet: seen.sheet, height: seen.height } });
      },
    },

    // ---------- L'assemblage ----------
    {
      id: 'format_assembly_a_presentation_keeps_its_slide_page_and_documents_follow_the_macro',
      description: 'MacroTemplates.buildConcatenatedHtml avec perModel : une présentation écrit sa page de diapositive (paysage, 190.5x338.7) sur le saut de page qui l\'ouvre, ou sur le repère de départ si elle est la première ; une présentation au format choisi (A4 portrait) écrit celui-là ; un document, même enregistré en A3, n\'écrit que son sens (le format du macro-modèle) ; le HTML d\'une présentation est celui de ses sorties (sauts de diapositive marqués) ; sans perModel, rien n\'est ajouté',
      async run() {
        const problems = [];
        const slides = slidesOf(3, 'Alpha');
        const other = slidesOf(2, 'Bravo');
        const templates = [
          doc('p', null, lines(2, 'Garde')),
          deck('s', slides),
          doc('l', { orientation: 'landscape', format: 'A3' }, lines(2, 'Annexe')),
          deck('d4', other, { orientation: 'portrait', format: 'A4' }),
          doc('c', null, lines(1, 'Fin')),
        ];
        const html = await assembleWith(fixedSlots('p', 's', 'l', 'd4', 'c'), templates, true);
        const want = start('portrait') + lines(2, 'Garde') + slotBreak(1, 'landscape', SLIDE) + deckOut(slides) + slotBreak(2, 'landscape') + lines(2, 'Annexe')
          + slotBreak(3, 'portrait', 'A4') + deckOut(other) + slotBreak(4, 'portrait') + lines(1, 'Fin');
        if (canon(html) !== canon(want)) problems.push('HTML assemblé : ' + html.slice(0, 600) + ' … au lieu de ' + want.slice(0, 600) + ' …');
        const root = parse(html);
        const breaks = Array.from(root.querySelectorAll('.page-break-marker[data-macro-slot]')).map(el => el.getAttribute('data-macro-slot') + ':' + el.getAttribute('data-page-orientation') + ':' + el.getAttribute('data-page-format')).join(',');
        if (breaks !== '1:landscape:' + SLIDE + ',2:landscape:null,3:portrait:A4,4:portrait:null') problems.push('sauts de page de modèle : ' + breaks);
        const slideBreaks = root.querySelectorAll('.page-break-marker[data-slide-break]').length;
        if (slideBreaks !== 3) problems.push('sauts de diapositive marqués : ' + slideBreaks + ' au lieu de 3 (deux dans la première présentation, un dans la seconde)');
        if (root.querySelectorAll('.page-break-marker[data-macro-slot][data-slide-break]').length) problems.push('un saut de page de modèle est pris pour un saut de diapositive');
        const sections = PageSections.split(root.childNodes, { orientation: 'portrait', format: 'A4' }).map(s => s.orientation[0] + ':' + s.format).join(' ');
        if (sections !== 'p:A4 l:190.5x338.7 l:A4 p:A4') problems.push('sections lues : ' + sections + ' au lieu de « p:A4 l:190.5x338.7 l:A4 p:A4 »');
        // La page d'un modèle : une présentation sans page à elle a la diapositive, un document sans format n'en dit pas.
        const pages = templates.map(tpl => JSON.stringify(MacroTemplates.pageOfTemplate(tpl))).join(' ');
        const wantPages = '{"orientation":"portrait","format":null} {"orientation":"landscape","format":"' + SLIDE + '"} {"orientation":"landscape","format":null} {"orientation":"portrait","format":"A4"} {"orientation":"portrait","format":null}';
        if (pages !== wantPages) problems.push('pageOfTemplate : ' + pages);
        if (MacroTemplates.senseOfTemplate(templates[1]) !== 'landscape' || MacroTemplates.senseOfTemplate(templates[0]) !== 'portrait') problems.push('senseOfTemplate d\'une présentation');
        // Sans perModel (un sens imposé au macro-modèle) : aucun repère de page, les sauts de diapositive restent marqués.
        const imposed = await assembleWith(fixedSlots('p', 's', 'l', 'd4', 'c'), templates, false);
        if (PageSections.hasSenses(imposed) || imposed.indexOf('data-page-format') !== -1) problems.push('perModel faux : des repères de page sont écrits');
        if (parse(imposed).querySelectorAll('.page-break-marker[data-slide-break]').length !== 3) problems.push('perModel faux : les sauts de diapositive ne sont plus marqués');
        // Les sauts de page tournés d'un modèle suivent le même chemin : gardés « Selon chaque modèle », retirés sous un sens imposé (le format n'y change rien).
        const turned = [doc('t', null, '<p>A</p><div class="page-break-marker" contenteditable="false" data-page-orientation="landscape">Saut de page</div><p>B</p>'), deck('s2', slidesOf(2, 'Echo'))];
        const kept = await assembleWith(fixedSlots('t', 's2'), turned, true);
        const dropped = await assembleWith(fixedSlots('t', 's2'), turned, false);
        if (kept.indexOf('data-page-orientation="landscape"') === -1 || dropped.indexOf('data-page-orientation') !== -1) problems.push('sauts tournés d\'un modèle : gardés ' + (kept.indexOf('data-page-orientation="landscape"') !== -1) + ', retirés ' + (dropped.indexOf('data-page-orientation') === -1));
        return verdict(problems, { sauts: breaks, sections });
      },
    },

    // ---------- La Lecture ----------
    {
      id: 'format_reader_the_slide_section_is_a_stack_of_sheets_of_the_slide_page',
      description: 'Lecture : un document A4, une présentation de trois diapositives, un document A4 : trois feuilles de lecture, la largeur et la hauteur de leur page (A4 : 793,71 px ; diapositive : 1 280,13 x 720 px), une page par diapositive, le texte de chaque modèle sur la sienne, le facteur d\'ajustement qui montre la diapositive en entier ; un format égal à celui des marges ne fait pas de section',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const html = start('portrait') + lines(3, 'Alpha') + slotBreak(1, 'landscape', SLIDE) + deckOut(slidesOf(3, 'Slide')) + slotBreak(2, 'portrait') + lines(3, 'Echo');
        const rootWidth = document.documentElement.style.getPropertyValue('--pp-page-width');
        const { box, sheets, kinds, pages } = await readSheets(h, html);
        if (kinds !== 'PSP') problems.push('genre des feuilles : ' + kinds + ' au lieu de PSP');
        if (pages !== '1,3,1') problems.push('pages par feuille : ' + pages + ' au lieu de 1,3,1');
        sheets.forEach((sheet, i) => {
          const want = 'PSP'[i];
          if (!want) return;
          if (!near(sheet.width, SHEET_PX[want], 1.5)) problems.push('feuille ' + (i + 1) + ' : largeur ' + sheet.width.toFixed(1) + ' px au lieu de ' + SHEET_PX[want]);
          if (sheet.pages === 1 && !near(sheet.height, SHEET_HEIGHT_PX[want], 2)) problems.push('feuille ' + (i + 1) + ' : hauteur ' + sheet.height.toFixed(1) + ' px au lieu de ' + SHEET_HEIGHT_PX[want]);
        });
        const tags = ['Alpha', 'Slide', 'Echo'];
        sheets.forEach((sheet, i) => {
          const text = sheet.el.textContent;
          tags.forEach((tag, t) => { if (text.includes(tag) !== (t === i)) problems.push('feuille ' + (i + 1) + ' : le texte « ' + tag + ' » ' + (t === i ? 'manque' : 'est de trop')); });
          if (sheet.el.firstElementChild && sheet.el.firstElementChild.classList.contains('page-break-marker')) problems.push('feuille ' + (i + 1) + ' : elle commence par le saut de page du modèle');
        });
        // Trois diapositives, trois pages : le titre de chacune est sur sa page (trois pages de 720 px dans la feuille).
        const slideSheet = sheets[1];
        if (slideSheet) {
          const zoom = EditorCore.layoutZoom(slideSheet.el);
          const sheetTop = slideSheet.el.getBoundingClientRect().top;
          const heads = Array.from(slideSheet.el.querySelectorAll('h1')).map(el => Math.floor((el.getBoundingClientRect().top - sheetTop) / zoom / SHEET_HEIGHT_PX.S));
          if (heads.join() !== '0,1,2') problems.push('pages des titres de diapositive : ' + heads.join() + ' au lieu de 0,1,2');
        }
        // Le facteur d'ajustement se règle sur la feuille la plus large, et sait qu'elle est une diapositive.
        if (!near(parseFloat(box.getAttribute('data-pp-widest-sheet')), SHEET_PX.S, 0.1)) problems.push('feuille la plus large : ' + box.getAttribute('data-pp-widest-sheet'));
        if (!box.hasAttribute('data-pp-slide-sheet')) problems.push('l\'attribut data-pp-slide-sheet manque : le facteur d\'ajustement ne sait pas qu\'une diapositive est là');
        // La page du document n'a servi que le temps de la mise en page de chaque section.
        if (PageLayout.getFormat() !== 'A4' || PageLayout.getOrientation() !== 'portrait') problems.push('la page du document est devenue ' + PageLayout.getOrientation() + ' ' + PageLayout.getFormat());
        if (document.documentElement.style.getPropertyValue('--pp-page-width') !== rootWidth) problems.push('--pp-page-width de la racine : ' + document.documentElement.style.getPropertyValue('--pp-page-width') + ' au lieu de ' + rootWidth);
        // Une présentation au format des marges (A4 portrait) : même page que ses voisins, une seule feuille, aucun attribut de diapositive.
        const same = await readSheets(h, start('portrait') + lines(2, 'Alpha') + slotBreak(1, 'portrait', 'A4') + lines(2, 'Bravo'));
        if (same.kinds !== 'P') problems.push('un format égal à celui des marges fait des sections : ' + same.kinds);
        if (same.box.hasAttribute('data-pp-slide-sheet')) problems.push('data-pp-slide-sheet resté sur une Lecture sans diapositive');
        return verdict(problems, { genres: kinds, pages });
      },
    },
    {
      id: 'format_reader_the_zoom_shows_a_slide_sheet_in_full',
      description: 'PageZoom.factorFor : comme pour une présentation, une feuille de diapositive (data-pp-slide-sheet, posé par la Lecture d\'un macro-modèle) se voit en entier même dans un panneau où l\'ajustement automatique s\'arrête à 50 % ; sans l\'attribut, le plancher reste',
      async run() {
        const problems = [];
        PageZoom.useTemplate({ id: 'format-zoom-probe' });
        const probe = document.createElement('div');
        probe.style.cssText = 'position:fixed;left:-9999px;top:0;width:500px;height:100px;padding:0;overflow:auto;';
        probe.setAttribute('data-pp-widest-sheet', String(SHEET_PX.S));
        document.body.appendChild(probe);
        try {
          const floor = PageZoom.factorFor(probe);
          probe.setAttribute('data-pp-slide-sheet', '');
          const full = PageZoom.factorFor(probe);
          if (!near(floor, 0.5, 0.001)) problems.push('sans diapositive, le plancher n\'est plus 0,5 : ' + floor);
          if (!near(full, probe.clientWidth / SHEET_PX.S, 0.002)) problems.push('avec une diapositive : ' + full + ' au lieu de ' + (probe.clientWidth / SHEET_PX.S).toFixed(3));
        } finally { probe.remove(); }
        return verdict(problems, {});
      },
    },

    // ---------- Le Word ----------
    {
      id: 'format_docx_the_slide_section_has_its_own_page_and_width',
      description: 'Word : un document A4, une présentation, un document A4 : trois sections, la page de chacune (A4 portrait : 11906 x 16838 twips ; diapositive : 19202 x 10800, paysage), les mêmes marges, un tableau de 1 200 px bâti à la largeur de sa page (non réduit dans la diapositive, ramené dans la page A4), le saut de section ouvre la page ; un document ordinaire reste une seule section',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const html = start('portrait') + lines(2, 'Alpha') + wideTable('Tab') + slotBreak(1, 'landscape', SLIDE) + deckOut(slidesOf(2, 'Slide') + PLAIN_BREAK + wideTable('Lar')) + slotBreak(2, 'portrait') + lines(2, 'Echo');
        const sections = wordSections(await h.exportDocxParts(html, null, PageLayout.getMarginsTwip()));
        if (sections.length !== 3) { problems.push(sections.length + ' section(s) au lieu de 3'); return verdict(problems, {}); }
        sections.forEach((section, i) => {
          const [width, height, orient] = PAGE_TWIP['PSP'[i]];
          if (!near(section.width, width, 2) || !near(section.height, height, 2) || section.orient !== orient) problems.push('section ' + (i + 1) + ' : ' + section.width + ' x ' + section.height + ' ' + section.orient + ' au lieu de ' + width + ' x ' + height + ' ' + orient);
        });
        if (new Set(sections.map(section => section.margins)).size !== 1) problems.push('les marges changent d\'une section à l\'autre : ' + sections.map(section => section.margins).join(' | '));
        const texts = sections.map(section => section.blocks.map(wordText).filter(Boolean).join(' | '));
        ['Alpha 0', 'Slide titre 0', 'Echo 0'].forEach((tag, i) => { if (texts[i].indexOf(tag) === -1) problems.push('section ' + (i + 1) + ' : le texte « ' + tag + ' » manque (' + texts[i].slice(0, 80) + ')'); });
        ['Slide', 'Echo'].forEach(tag => { if (texts[0].indexOf(tag) !== -1) problems.push('section 1 : le texte « ' + tag + ' » est de trop'); });
        // Le tableau de 1 200 px : réduit dans la page A4 (719 px de large utile), entier dans la diapositive (1 205 px).
        const widthIn = section => { const table = section.blocks.find(node => node.nodeName === 'w:tbl'); return table ? wordGridWidth(table) : null; };
        const narrow = widthIn(sections[0]);
        const wide = widthIn(sections[1]);
        if (narrow === null || narrow > 10900) problems.push('tableau de la section A4 : ' + narrow + ' twips, plus large que la page');
        if (wide === null || !near(wide, 18000, 150)) problems.push('tableau de la diapositive : ' + wide + ' twips au lieu de 18000 (1 200 px)');
        // Le saut de section ouvre la page : le premier bloc de la section de la présentation ne porte pas un saut de page de plus.
        const opens = node => node.nodeName === 'w:p' && node.getElementsByTagName('w:pageBreakBefore').length > 0;
        if (sections[1].blocks[0] && opens(sections[1].blocks[0])) problems.push('la présentation commence par un saut de page de plus (une page blanche dans Word)');
        // Sans repère de page, une seule section, A4 portrait, comme avant.
        const plain = wordSections(await h.exportDocxParts(lines(2, 'Alpha'), null, PageLayout.getMarginsTwip()));
        if (plain.length !== 1 || plain[0].width !== 11906 || plain[0].orient !== 'portrait') problems.push('un document ordinaire : ' + JSON.stringify(plain.map(s => [s.width, s.height, s.orient])));
        // Rien ne reste d'un export à l'autre : le même document ordinaire, exporté après, est encore A4.
        const after = wordSections(await h.exportDocxParts(lines(2, 'Echo'), null, PageLayout.getMarginsTwip()));
        if (after.length !== 1 || after[0].width !== 11906) problems.push('le format d\'une section reste d\'un export à l\'autre : ' + JSON.stringify(after.map(s => [s.width, s.height])));
        return verdict(problems, { sections: sections.map(section => section.width + 'x' + section.height + ' ' + section.orient).join(' ; '), tableaux: [narrow, wide] });
      },
    },

    // ---------- L'impression ----------
    {
      id: 'format_print_each_sheet_has_the_size_and_the_name_of_its_page',
      description: 'Impression navigateur : un document A4, une présentation de deux diapositives, un document A4 : quatre feuilles à la taille exacte de leur page (793,71 x 1 122,52 puis 1 280,13 x 720 px), chacune dans un bloc qui porte le nom de sa page (`page: pp-portrait`, `pp-landscape-190-5x338-7`), une règle `@page` nommée par page à sa taille en millimètres (338,7 x 190,5 pour la diapositive), le conteneur assez large pour la plus grande ; un document sans repère de page garde sa règle unique',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const summary = {};
        const job = await printJob(start('portrait') + lines(2, 'Alpha') + slotBreak(1, 'landscape', SLIDE) + deckOut(slidesOf(2, 'Slide')) + slotBreak(2, 'portrait') + lines(2, 'Echo'));
        try {
          const sheets = printSheets(job);
          const kinds = sheets.map(printKind).join('');
          summary.genres = kinds;
          if (kinds !== 'PSSP') problems.push('genre des feuilles : ' + kinds + ' au lieu de PSSP');
          sheets.forEach((sheet, i) => {
            const want = 'PSSP'[i];
            if (!want) return;
            const rect = sheet.getBoundingClientRect();
            if (!near(rect.width, SHEET_PX[want], 0.1) || !near(rect.height, SHEET_HEIGHT_PX[want], 0.1)) problems.push('feuille ' + (i + 1) + ' : ' + rect.width.toFixed(2) + ' x ' + rect.height.toFixed(2) + ' px au lieu de ' + SHEET_PX[want] + ' x ' + SHEET_HEIGHT_PX[want]);
            const holder = sheet.parentElement;
            const name = want === 'S' ? 'pp-landscape-190-5x338-7' : 'pp-portrait';
            if (!holder.classList.contains('pp-print-page')) problems.push('feuille ' + (i + 1) + ' : le bloc qui porte le nom de la page est « ' + holder.className + ' »');
            else if (getComputedStyle(holder).getPropertyValue('page') !== name) problems.push('feuille ' + (i + 1) + ' : `page` vaut « ' + getComputedStyle(holder).getPropertyValue('page') + ' » au lieu de « ' + name + ' »');
            const win = job.windows[i];
            const wantFormat = want === 'S' ? SLIDE : null;
            if (!win || !win.sheet || win.sheet.format !== wantFormat || win.sheet.name !== name) problems.push('fenêtre ' + (i + 1) + ' : ' + JSON.stringify(win && win.sheet && { format: win.sheet.format, name: win.sheet.name }));
          });
          const rule = (document.getElementById('pp-print-page') || { textContent: '' }).textContent;
          summary.regle = rule;
          ['@page { size: 210mm 297mm; margin: 0; }', '@page pp-portrait { size: 210mm 297mm; margin: 0; }', '@page pp-landscape-190-5x338-7 { size: 338.7mm 190.5mm; margin: 0; }'].forEach(want => { if (rule.indexOf(want) === -1) problems.push('règle absente : « ' + want + ' » dans ' + rule); });
          if (rule.split('@page pp-landscape-190-5x338-7').length !== 2) problems.push('la règle de la diapositive est écrite plusieurs fois : ' + rule);
          if (!near(job.host.getBoundingClientRect().width, SHEET_PX.S, 1.5)) problems.push('le conteneur est large de ' + job.host.getBoundingClientRect().width + ' px : la diapositive n\'y tient pas');
        } finally { job.dispose(); }
        // Un document qui commence par une présentation : la règle sans nom est la sienne.
        const slidesFirst = await printJob(start('landscape', SLIDE) + deckOut(slidesOf(1, 'Slide')) + slotBreak(1, 'portrait') + lines(2, 'Echo'));
        try {
          const rule = document.getElementById('pp-print-page').textContent;
          summary.diapoDabord = printSheets(slidesFirst).map(printKind).join('');
          if (summary.diapoDabord !== 'SP') problems.push('document qui commence par une présentation : ' + summary.diapoDabord);
          if (rule.indexOf('@page { size: 338.7mm 190.5mm; margin: 0; }') !== 0) problems.push('la règle de départ : ' + rule);
        } finally { slidesFirst.dispose(); }
        // Sans repère de page : les feuilles posées directement dans l'hôte, une seule règle sans nom.
        const plain = await printJob(lines(3, 'Alpha'));
        try {
          const rule = document.getElementById('pp-print-page').textContent;
          if (rule !== '@page { size: 210mm 297mm; margin: 0; }') problems.push('document ordinaire : ' + rule);
          if (plain.root.querySelector('.pp-print-page')) problems.push('document ordinaire : un bloc nommé');
        } finally { plain.dispose(); }
        return verdict(problems, summary);
      },
    },

    // ---------- Les autres sorties : HTML, Markdown, e-mail ----------
    {
      id: 'format_other_outputs_ignore_the_page_format',
      description: 'Mesure du lot 4c, épinglée (aucun comportement ne change) : le HTML, le Markdown et le texte d\'un e-mail d\'un macro-modèle aux pages mêlées ne laissent fuir aucun repère de page (`data-page-format`, `data-page-orientation`, `data-macro-slot`), le Markdown pose un saut de page entre les modèles et entre les diapositives, et le repère de format ne change rien au texte d\'un e-mail (un e-mail ne s\'assemble de toute façon jamais dans un macro-modèle)',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const html = start('portrait') + lines(2, 'Alpha') + slotBreak(1, 'landscape', SLIDE) + deckOut(slidesOf(2, 'Slide')) + slotBreak(2, 'portrait') + lines(2, 'Echo');
        const markers = /data-page-format|data-page-orientation|data-macro-slot|page-section-start|data-page-added/;
        const document_ = await HtmlExport.htmlToDocument(html, null, { title: 'essai' });
        const body = document_.slice(document_.indexOf('<body>'), document_.indexOf('</body>'));
        if (markers.test(body)) problems.push('HTML : un repère de page est resté dans le fichier (' + (body.match(markers) || [''])[0] + ')');
        if (/Saut de page/.test(body)) problems.push('HTML : le texte du saut de page est dans le fichier');
        if (/<div class="pp-doc">\s*<div><\/div>/.test(body)) problems.push('HTML : le fichier commence par un bloc vide (le repère de départ)');
        ['Alpha 0', 'Alpha 1', 'Slide titre 0', 'Slide texte 1', 'Echo 1'].forEach(text => { if (body.indexOf(text) === -1) problems.push('HTML : « ' + text + ' » manque'); });
        const md = await MarkdownExport.htmlToMarkdown(html, null);
        if (markers.test(md)) problems.push('Markdown : un repère de page est resté dans le fichier (' + (md.match(markers) || [''])[0] + ')');
        if (/Saut de page/.test(md)) problems.push('Markdown : le texte du saut de page est dans le fichier');
        const breaks = (md.match(/page-break-after: always/g) || []).length;
        if (breaks !== 3) problems.push('Markdown : ' + breaks + ' saut(s) de page au lieu de 3 (deux entre les modèles, un entre les diapositives)');
        ['Alpha 0', 'Slide titre 0', 'Slide titre 1', 'Echo 1'].forEach(text => { if (md.indexOf(text) === -1) problems.push('Markdown : « ' + text + ' » manque'); });
        // Le texte d'un e-mail : le repère de format n'y change rien.
        const mail = MailtoExport.plainTextFromHtml(html);
        const mailWithoutFormat = MailtoExport.plainTextFromHtml(html.replace(/ data-page-format="[^"]*"/g, ''));
        if (mail !== mailWithoutFormat) problems.push('e-mail : le repère de format change le texte (' + mail.slice(0, 80) + ')');
        if (markers.test(mail)) problems.push('e-mail : un repère de page est dans le texte');
        ['Alpha 0', 'Slide titre 0', 'Echo 1'].forEach(text => { if (mail.indexOf(text) === -1) problems.push('e-mail : « ' + text + ' » manque'); });
        return verdict(problems, { sautsMarkdown: breaks, courrier: mail.split('\n').length + ' lignes' });
      },
    },

    // ---------- Le PDF ----------
    {
      id: 'format_pdf_every_run_of_pages_has_the_size_of_its_page',
      description: 'PDF : un document A4, une présentation de trois diapositives, un document A4 : un seul fichier de cinq pages, chacune de la taille de sa page (A4 portrait 595 x 842 pt, diapositive 960 x 540 pt), le texte de chaque modèle sur ses pages, aucune page blanche signalée ; une présentation en tête ou en queue, une présentation vide (sa diapositive blanche voulue), une présentation seule ; un macro-modèle dont tous les modèles ont le même format reste un PDF d\'un seul tenant ; deux lignes de ce document réunies en un seul PDF (« Exporter les lignes ») gardent la taille de chaque page',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const html = start('portrait') + lines(3, 'Alpha') + slotBreak(1, 'landscape', SLIDE) + deckOut(slidesOf(3, 'Slide')) + slotBreak(2, 'portrait') + lines(3, 'Echo');
        const { result, pages, kinds } = await pdfOf(h, html);
        if (kinds !== 'PSSSP') problems.push('taille des pages : ' + kinds + ' au lieu de PSSSP (' + pages.map(page => page.width.toFixed(1) + 'x' + page.height.toFixed(1)).join(' ') + ')');
        const want = ['Alpha 0', 'Slide titre 0', 'Slide titre 1', 'Slide titre 2', 'Echo 0'];
        pages.forEach((page, i) => {
          want.forEach((tag, t) => { if (page.text.includes(tag) !== (t === i)) problems.push('page ' + (i + 1) + ' : le texte « ' + tag + ' » ' + (t === i ? 'manque' : 'est de trop') + ' (' + page.text.slice(0, 60) + ')'); });
        });
        if (result.blankPages.length) problems.push('pages blanches signalées : ' + JSON.stringify(result.blankPages));
        // Le fichier est UN fichier, de cinq pages ; la définition qui le décrit porte ses suites.
        const runs = result.docDefinition && result.docDefinition._followingRuns;
        if (!runs || runs.length !== 2) problems.push('suites de pages : ' + (runs ? runs.length + 1 : 'aucune') + ' au lieu de 3 (A4, diapositives, A4)');
        // « Toutes les lignes de la vue en un seul PDF » : le fichier de chaque ligne est un PDF ordinaire pour pdf-lib, qui garde la taille de chaque page en les posant à la suite.
        const rows = await PdfMerge.create('essai');
        await rows.append(result.blob);
        await rows.append(result.blob);
        const together = await h.extractPdfGroundTruth(await blobBase64(await rows.toBlob()));
        const togetherKinds = together.pages.map(kindOfPdfPage).join('');
        if (togetherKinds !== 'PSSSPPSSSP') problems.push('deux lignes en un seul PDF : ' + togetherKinds + ' au lieu de PSSSPPSSSP');
        // Un macro-modèle de même format partout (un sens tourné seulement) : un PDF d'un seul tenant, comme avant.
        const single = await pdfOf(h, start('portrait') + lines(2, 'Alpha') + slotBreak(1, 'landscape') + lines(2, 'Bravo') + slotBreak(2, 'portrait') + lines(2, 'Charlie'));
        if (single.kinds !== 'PLP') problems.push('même format, sens tournés : ' + single.kinds + ' au lieu de PLP');
        if (single.result.docDefinition._followingRuns) problems.push('un macro-modèle de même format est coupé en suites');
        // Une présentation seule dans un macro-modèle : tout le fichier est à la page de diapositive.
        const only = await pdfOf(h, start('landscape', SLIDE) + deckOut(slidesOf(2, 'Seule')));
        if (only.kinds !== 'SS') problems.push('une présentation seule : ' + only.kinds + ' au lieu de SS');
        // Une présentation qui commence le document, puis un document, puis une présentation : trois suites, chacune à sa page.
        const around = await pdfOf(h, start('landscape', SLIDE) + deckOut(slidesOf(2, 'Un')) + slotBreak(1, 'portrait') + lines(2, 'Echo') + slotBreak(2, 'landscape', SLIDE) + deckOut(slidesOf(1, 'Deux')));
        if (around.kinds !== 'SSPS') problems.push('une présentation devant et derrière : ' + around.kinds + ' au lieu de SSPS');
        // Une présentation vide ouvre quand même sa diapositive, de son format (une page blanche voulue, jamais signalée).
        const empty = await pdfOf(h, start('portrait') + lines(1, 'Alpha') + slotBreak(1, 'landscape', SLIDE) + slotBreak(2, 'portrait') + lines(1, 'Echo'));
        if (empty.kinds !== 'PSP') problems.push('une présentation vide : ' + empty.kinds + ' au lieu de PSP');
        if (empty.result.blankPages.length) problems.push('une présentation vide signale des pages blanches : ' + JSON.stringify(empty.result.blankPages));
        // Rien ne reste d'un export à l'autre : le même document ordinaire, exporté après, est encore A4.
        const after = await pdfOf(h, lines(2, 'Plain'));
        if (after.kinds !== 'P') problems.push('le format d\'une suite reste d\'un export à l\'autre : ' + after.kinds);
        return verdict(problems, { pages: kinds, tailles: pages.map(page => page.width.toFixed(0) + 'x' + page.height.toFixed(0)).join(' ') });
      },
    },
    {
      id: 'format_pdf_numbers_and_zones_follow_the_whole_document',
      description: 'PDF : l\'en-tête et le pied d\'un document de cinq pages (A4, trois diapositives, A4) portent le numéro et le total du document ENTIER (« n/5 », jamais 1/1 ni le rang dans sa suite), « première page différente » ne vaut que pour la première page du document, le tableau de l\'en-tête est mis en page dans la largeur de chaque page (sa case de droite à la moitié de la largeur utile, plus loin sur la diapositive), le pied finit à la marge droite de sa page',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const html = start('portrait') + lines(3, 'Alpha') + slotBreak(1, 'landscape', SLIDE) + deckOut(slidesOf(3, 'Slide')) + slotBreak(2, 'portrait') + lines(3, 'Echo');
        const { pages, kinds } = await pdfOf(h, html, clone(NUMBERED_HF));
        if (kinds !== 'PSSSP') problems.push('taille des pages : ' + kinds);
        const m = PageLayout.getMarginsPt();
        pages.forEach((page, i) => {
          const n = i + 1;
          // pdf.js coupe « PREMIER-PIED » en deux morceaux : les blancs entre eux ne comptent pas.
          if (n === 1) {
            if (!/PREMIERE 1\/5/.test(page.text) || !/PREMIER-\s*PIED 1\/5/.test(page.text)) problems.push('page 1 : l\'en-tête et le pied de la première page manquent ou n\'ont pas « 1/5 » (' + page.text.slice(-80) + ')');
            if (page.text.includes('GAUCHE') || page.text.replace(/PREMIER-\s*PIED/g, '').includes('PIED')) problems.push('page 1 : l\'en-tête ou le pied ordinaire sur la première page');
          } else {
            if (!page.text.includes('GAUCHE') || !page.text.includes('DROITE')) problems.push('page ' + n + ' : l\'en-tête ordinaire manque (' + page.text.slice(-60) + ')');
            if (!new RegExp('PIED ' + n + '/5').test(page.text)) problems.push('page ' + n + ' : « PIED ' + n + '/5 » manque (' + page.text.slice(-60) + ')');
            if (page.text.includes('PREMIERE') || /PREMIER-\s*PIED/.test(page.text)) problems.push('page ' + n + ' : l\'en-tête ou le pied de la première page se répète');
          }
          const numbers = page.items.filter(item => /^\d+\/\d+$/.test(item.str.trim()));
          const last = numbers[numbers.length - 1];
          if (!last) problems.push('page ' + n + ' : pas de « n/total » au pied');
          else if (!near(last.x + last.width, page.width - m.right, 4)) problems.push('page ' + n + ' : le pied finit à ' + (last.x + last.width).toFixed(0) + ' pt, la marge droite est à ' + (page.width - m.right).toFixed(0) + ' pt');
        });
        // La case de droite de l'en-tête (page 2 et suivantes) : à la moitié de la largeur utile de SA page.
        const rightCell = pages.map(page => { const item = page.items.find(it => it.str === 'DROITE'); return item ? item.x : null; });
        pages.forEach((page, i) => {
          if (i === 0) return;
          if (rightCell[i] == null) { problems.push('page ' + (i + 1) + ' : la case de droite de l\'en-tête manque'); return; }
          const ratio = (rightCell[i] - m.left) / (page.width - m.left - m.right);
          if (!near(ratio, 0.5, 0.04)) problems.push('page ' + (i + 1) + ' : la case de droite de l\'en-tête commence à ' + ratio.toFixed(2) + ' de la largeur utile (0,5 attendu)');
        });
        if (rightCell[1] != null && rightCell[4] != null && !(rightCell[1] - rightCell[4] > 100)) problems.push('la case de droite n\'est pas plus loin sur la diapositive : ' + rightCell.map(x => x == null ? '-' : Math.round(x)).join(' / '));
        return verdict(problems, { casesDeDroite: rightCell.map(x => x == null ? '-' : Math.round(x)).join(' / ') });
      },
    },
    {
      id: 'format_pdf_the_contents_table_and_its_links_cross_the_files',
      description: 'PDF : le sommaire (posé dans la première suite) donne les numéros de page du document entier, y compris pour les titres des diapositives et du document qui les suit, et ses liens mènent à la bonne page d\'un fichier à l\'autre (les destinations nommées de tous les fichiers sont reliées dans le fichier réuni)',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const slides = '<h1>Titre diapo un</h1><p>Texte un</p>' + PLAIN_BREAK + '<h1>Titre diapo deux</h1><p>Texte deux</p>';
        const html = start('portrait') + '<div class="toc-marker"></div><h1>Titre alpha</h1><p>Texte alpha</p>' + slotBreak(1, 'landscape', SLIDE) + deckOut(slides) + slotBreak(2, 'portrait') + '<h1>Titre echo</h1><p>Texte echo</p>';
        const { result, pages, kinds } = await pdfOf(h, html);
        if (kinds !== 'PSSP') problems.push('taille des pages : ' + kinds + ' au lieu de PSSP');
        const links = await h.extractPdfLinks(result.blob);
        const firstPage = links.pages[0] ? links.pages[0].links : [];
        const targets = firstPage.slice().sort((a, b) => a.y - b.y).map(link => link.page);
        const distinct = targets.filter((page, i) => page !== targets[i - 1]);
        if (distinct.join() !== '1,2,3,4') problems.push('les liens du sommaire mènent aux pages ' + (targets.join() || 'aucune') + ' au lieu de 1, 2, 3, 4 (un lien par ligne)');
        // Les numéros écrits dans le sommaire sont ceux du document entier.
        const numbers = pages[0] ? pages[0].items.map(item => item.str.trim()).filter(str => /^[1-9]$/.test(str)) : [];
        if (numbers.join() !== '1,2,3,4') problems.push('numéros écrits dans le sommaire : ' + numbers.join() + ' au lieu de 1,2,3,4');
        // Chaque titre est bien sur la page où le sommaire le dit.
        ['Titre alpha', 'Titre diapo un', 'Titre diapo deux', 'Titre echo'].forEach((title, i) => {
          const where = pages.map((page, p) => (page.text.includes(title) ? p + 1 : null)).filter(Boolean);
          const body = where.filter(p => p !== 1 || i === 0);
          if (body.indexOf(i + 1) === -1) problems.push('le titre « ' + title + ' » n\'est pas sur la page ' + (i + 1) + ' : ' + where.join());
        });
        return verdict(problems, { liens: targets.join(), numeros: numbers.join() });
      },
    },

    {
      id: 'format_pdf_images_and_notes_land_on_their_own_page',
      description: 'PDF : l\'image en calque d\'un modèle garde sa position de page (marge + sa grille) sur la page de SON format (jusqu\'à 700 pt de la marge sur une diapositive, qui n\'existerait pas en A4), une image flottante à droite touche la marge droite de la diapositive, et les notes de bas de page sont au pied de la page de leur appel avec une numérotation continue d\'un fichier à l\'autre',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const html = start('portrait') + lines(2, 'Alpha') + layerImage(150, 20) + '<p>Appel alpha' + note('a', 'NOTEALPHA') + '</p>'
          + slotBreak(1, 'landscape', SLIDE) + deckOut('<h1>Slide un</h1><p>Appel slide' + note('s', 'NOTESLIDE') + '</p>' + layerImage(700, 50) + PLAIN_BREAK + '<h1>Slide deux</h1>' + rightFloat('Slide'))
          + slotBreak(2, 'portrait') + lines(2, 'Echo') + layerImage(400, 50) + '<p>Appel echo' + note('e', 'NOTEECHO') + '</p>';
        const { pages, kinds } = await pdfOf(h, html);
        if (kinds !== 'PSSP') problems.push('taille des pages : ' + kinds + ' au lieu de PSSP');
        const m = PageLayout.getMarginsPt();
        const wantLayer = { 0: [150, 20], 1: [700, 50], 3: [400, 50] };
        const summary = {};
        Object.keys(wantLayer).forEach(key => {
          const page = pages[key];
          if (!page) return;
          const layer = page.images.find(img => near(img.width, 30, 2));
          summary['calque page ' + (Number(key) + 1)] = layer ? Math.round(layer.x) + ',' + Math.round(layer.y) : null;
          if (!layer) problems.push('page ' + (Number(key) + 1) + ' : l\'image en calque n\'est pas peinte sur sa page (' + page.images.length + ' image(s) peinte(s))');
          else if (!near(layer.x, m.left + wantLayer[key][0], 3) || !near(layer.y, m.top + wantLayer[key][1], 3)) problems.push('page ' + (Number(key) + 1) + ' : image en calque à ' + layer.x.toFixed(0) + ', ' + layer.y.toFixed(0) + ' pt au lieu de ' + (m.left + wantLayer[key][0]) + ', ' + (m.top + wantLayer[key][1]));
        });
        const slideTwo = pages[2];
        const floating = slideTwo && slideTwo.images.find(img => near(img.width, 90, 2));
        summary.flottante = floating ? Math.round(floating.x + floating.width) : null;
        if (!floating) problems.push('page 3 : l\'image flottante n\'est pas peinte sur la deuxième diapositive');
        else if (!near(floating.x + floating.width, slideTwo.width - m.right, 2)) problems.push('page 3 : l\'image flottante finit à ' + (floating.x + floating.width).toFixed(0) + ' pt, la marge droite de la diapositive est à ' + (slideTwo.width - m.right).toFixed(0) + ' pt');
        // Les notes : sur la page de leur appel, numérotées de bout en bout.
        const notes = [['NOTEALPHA', 0, 1], ['NOTESLIDE', 1, 2], ['NOTEECHO', 3, 3]];
        notes.forEach(([text, index, number]) => {
          pages.forEach((page, i) => {
            const has = page.text.includes(text);
            if (has !== (i === index)) problems.push('page ' + (i + 1) + ' : la note « ' + text + ' » ' + (has ? 'est de trop' : 'manque'));
          });
          if (pages[index] && !new RegExp(number + '\\.\\s*' + text).test(pages[index].text)) problems.push('la note « ' + text + ' » n\'est pas numérotée ' + number + ' : ' + pages[index].text.slice(-80));
        });
        return verdict(problems, summary);
      },
    },
    {
      id: 'format_pdf_watermark_and_blank_pages_follow_the_pages_of_the_whole_document',
      description: 'PDF : le filigrane est dessiné à la taille de chaque page (595 x 842 pt en A4, 960 x 540 pt sur une diapositive) et se lit sur chacune des quatre pages ; les pages blanches sont comptées dans le document entier (celle du dernier document est la 6e page du fichier, pas la 3e de sa suite), et une diapositive blanche n\'est jamais signalée ; une présentation seule dans un macro-modèle n\'en signale aucune non plus',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const margins = Object.assign({}, PageLayout.getMarginsPt(), { watermark: { text: 'CONFIDENTIEL' } });
        const html = start('portrait') + lines(2, 'Alpha') + slotBreak(1, 'landscape', SLIDE) + deckOut(slidesOf(2, 'Slide')) + slotBreak(2, 'portrait') + lines(2, 'Echo');
        const { result, pages, kinds } = await pdfOf(h, html, null, margins);
        if (kinds !== 'PSSP') problems.push('taille des pages : ' + kinds);
        pages.forEach((page, i) => { if (!page.text.includes('CONFIDENTIEL')) problems.push('page ' + (i + 1) + ' : le filigrane ne se lit pas'); });
        const first = result.docDefinition;
        const following = first._followingRuns || [];
        const svgOf = (definition, page, size) => ((typeof definition.background === 'function' && definition.background(page, size)) || []).map(node => node.svg || '').find(svg => svg.indexOf('CONFIDENTIEL') !== -1) || '';
        const sizeOfSvg = svg => { const w = /width="([\d.]+)"/.exec(svg); const hgt = /height="([\d.]+)"/.exec(svg); return w && hgt ? [parseFloat(w[1]), parseFloat(hgt[1])] : null; };
        const slideSvg = following[0] ? sizeOfSvg(svgOf(following[0], 1, { width: PAGE_PT.S[0], height: PAGE_PT.S[1], orientation: 'landscape' })) : null;
        const lastSvg = following[1] ? sizeOfSvg(svgOf(following[1], 1, { width: PAGE_PT.P[0], height: PAGE_PT.P[1], orientation: 'portrait' })) : null;
        if (!slideSvg || !near(slideSvg[0], PAGE_PT.S[0], 0.5) || !near(slideSvg[1], PAGE_PT.S[1], 0.5)) problems.push('filigrane de la diapositive : ' + JSON.stringify(slideSvg));
        if (!lastSvg || !near(lastSvg[0], PAGE_PT.P[0], 0.5)) problems.push('filigrane du dernier document : ' + JSON.stringify(lastSvg));
        // Pages blanches : des lignes vides dans le dernier document (une page n'a que cela, dans le fichier réuni), une diapositive vide au milieu.
        const blankLines = n => '<p></p>'.repeat(n);
        const blank = await pdfOf(h, start('portrait') + lines(2, 'Alpha') + slotBreak(1, 'landscape', SLIDE) + deckOut('<h1>Slide un</h1>' + PLAIN_BREAK + '<p></p>') + slotBreak(2, 'portrait') + lines(60, 'Echo') + blankLines(120) + '<p>Fin du document</p>');
        // Ce que pdf.js lit : les pages dont le corps (entre les marges haute et basse) n'a aucun texte ; une diapositive vide est voulue, le moteur ne la signale pas.
        const [, top, , bottom] = blank.result.docDefinition.pageMargins;
        const visiblyBlank = blank.pages.map((page, i) => (!page.items.some(item => item.y > top && item.y < page.height - bottom) ? i + 1 : null)).filter(Boolean);
        const wanted = visiblyBlank.filter(n => blank.pages[n - 1].kind !== 'S');
        const slideEnd = 3;
        if (!visiblyBlank.some(n => blank.pages[n - 1].kind === 'S')) problems.push('le test ne mesure pas ce qu\'il croit : la diapositive vide n\'est pas lue blanche (' + JSON.stringify(visiblyBlank) + ')');
        if (!wanted.length || wanted.some(n => n <= slideEnd)) problems.push('le test ne mesure pas ce qu\'il croit : pdf.js lit les pages blanches ' + JSON.stringify(visiblyBlank) + ' (une seule, après les diapositives, est attendue)');
        if (JSON.stringify(blank.result.blankPages) !== JSON.stringify(wanted)) problems.push('pages blanches du moteur ' + JSON.stringify(blank.result.blankPages) + ', lues par pdf.js hors diapositives ' + JSON.stringify(wanted));
        // Une présentation seule : ses diapositives vides ne sont pas des pages blanches.
        const only = await pdfOf(h, start('landscape', SLIDE) + deckOut('<h1>Seule un</h1>' + PLAIN_BREAK + '<p></p>' + PLAIN_BREAK + '<h1>Seule trois</h1>'));
        if (only.kinds !== 'SSS') problems.push('une présentation seule : ' + only.kinds);
        if (only.result.blankPages.length) problems.push('une présentation seule signale des pages blanches : ' + JSON.stringify(only.result.blankPages));
        return verdict(problems, { blanches: blank.result.blankPages, lues: visiblyBlank, pages: blank.kinds });
      },
    },
    {
      id: 'format_pdf_a_wrong_measure_is_corrected_by_the_final_render',
      description: 'PDF : la numérotation du document vient de la mesure de chaque suite de pages ; quand une suite rend à la fin un autre nombre de pages que celui qu\'elle avait mesuré (ici la mesure de la suite des diapositives compte une page de trop), le document est rendu une fois de plus avec les nombres que ses pages ont donnés : le pied dit « n/5 » partout, jamais « n/6 », et chaque suite n\'est rendue que deux fois',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const html = start('portrait') + lines(3, 'Alpha') + slotBreak(1, 'landscape', SLIDE) + deckOut(slidesOf(3, 'Slide')) + slotBreak(2, 'portrait') + lines(3, 'Echo');
        await PdfExport.ensurePdfLibsLoaded();
        const original = window.pdfMake.createPdf;
        let lies = 0;
        let finals = 0;
        // Les définitions finales portent `_everyPageWanted` (documentOfRuns), pas celles de la mesure : la mesure de la suite des diapositives annonce une page de plus que le moteur n'en rend.
        window.pdfMake.createPdf = function (definition) {
          const pdf = original.apply(window.pdfMake, arguments);
          if (definition._everyPageWanted !== undefined) { finals++; return pdf; }
          if (JSON.stringify(definition.content).includes('Slide titre')) {
            const flush = pdf._flushDoc;
            pdf._flushDoc = function (kit, done) { return flush.call(pdf, kit, (buffer, pages) => { lies++; done(buffer, (pages || []).concat([pages[pages.length - 1]])); }); };
          }
          return pdf;
        };
        let shot;
        try { shot = await pdfOf(h, html, clone(NUMBERED_HF)); } finally { window.pdfMake.createPdf = original; }
        if (!lies) problems.push('la mesure n\'a pas été faussée : l\'essai ne prouve rien');
        if (shot.kinds !== 'PSSSP') problems.push('taille des pages : ' + shot.kinds + ' au lieu de PSSSP');
        shot.pages.forEach((page, i) => {
          const n = i + 1;
          if (!new RegExp(n + '/5').test(page.text)) problems.push('page ' + n + ' : « ' + n + '/5 » manque au pied (' + page.text.slice(-70) + ')');
          if (/\d\/6/.test(page.text)) problems.push('page ' + n + ' : le total faux (« /6 ») est resté au pied (' + page.text.slice(-70) + ')');
        });
        if (finals !== 6) problems.push('rendus finals : ' + finals + ' au lieu de 6 (trois suites, deux fois chacune)');
        return verdict(problems, { mesuresFaussees: lies, rendusFinals: finals, pages: shot.kinds });
      },
    },
    {
      id: 'format_pdf_a_protected_pdf_does_not_mix_formats',
      description: 'PDF protégé : le fichier chiffré par pdfmake ne se relit pas avec pdf-lib, donc un macro-modèle qui mêle des formats ne peut pas être protégé - l\'export s\'arrête avec `passwordProblem = \'mixedFormats\'` (jamais un PDF livré sans la protection demandée), sa phrase existe en français et en anglais à l\'écran et à la fin d\'un lot ; le même macro-modèle sans protection, et un macro-modèle de même format avec protection, s\'exportent',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const mixed = start('portrait') + lines(2, 'Alpha') + slotBreak(1, 'landscape', SLIDE) + deckOut(slidesOf(2, 'Slide')) + slotBreak(2, 'portrait') + lines(2, 'Echo');
        const sameFormat = start('portrait') + lines(2, 'Alpha') + slotBreak(1, 'landscape') + lines(2, 'Bravo');
        const protection = () => PdfProtection.docFields({ mode: 'typed', password: 'stub-token-secret' });
        const exportWith = (html, docFields) => PdfExport.getNativePdfBlobForRecord(html, null, {}, '', null, PageLayout.getMarginsPt(), undefined, undefined, docFields);
        let refused = null;
        try { await exportWith(mixed, protection()); } catch (e) { refused = e; }
        if (!refused) problems.push('un PDF protégé qui mêle des formats a été exporté');
        else if (refused.passwordProblem !== 'mixedFormats') problems.push('l\'erreur ne dit pas mixedFormats : ' + refused.passwordProblem + ' / ' + refused.message);
        const plain = await exportWith(mixed, undefined);
        if (!plain.blob || !(plain.blob.size > 1000)) problems.push('le même macro-modèle sans protection ne s\'exporte pas');
        let protectedSame = null;
        try { protectedSame = await exportWith(sameFormat, protection()); } catch (e) { problems.push('un macro-modèle de même format ne peut plus être protégé : ' + e.message); }
        if (protectedSame && !(protectedSame.blob.size > 1000)) problems.push('le PDF protégé de même format est vide');
        // Les phrases : à l'écran (status.pdfPasswordProblem.*) et à la fin d'un lot (batchFailures.password.*), dans les deux langues, sans clé nue.
        const before = I18n.getLang();
        try {
          ['fr', 'en'].forEach(lang => {
            I18n.setLang(lang);
            ['status.pdfPasswordProblem.mixedFormats', 'batchFailures.password.mixedFormats'].forEach(key => {
              const sentence = I18n.t(key, { column: '' });
              if (!sentence || sentence === key || /\{[a-z]+\}/i.test(sentence)) problems.push(lang + ' : la phrase « ' + key + ' » est absente ou mal remplie (' + sentence + ')');
            });
          });
        } finally { I18n.setLang(before); }
        return verdict(problems, { erreur: refused && refused.passwordProblem });
      },
    },

    // ---------- La chaîne entière ----------
    {
      id: 'format_following_each_model_comes_out_with_its_slide_page_in_all_four_outputs',
      description: 'Un macro-modèle « Selon chaque modèle » assemblé par l\'application (un document, une présentation de deux diapositives, une annexe en paysage) : la Lecture a trois feuilles (portrait, diapositive, paysage A4), le Word trois sections, l\'impression quatre feuilles sur le papier de leur page, le PDF quatre pages de leur taille',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const templates = [doc('a', null, lines(2, 'Alpha')), deck('s', slidesOf(2, 'Slide')), doc('l', { orientation: 'landscape' }, lines(2, 'Annexe'))];
        const html = await assembleWith(fixedSlots('a', 's', 'l'), templates, true);
        const summary = {};
        const reading = await readSheets(h, html);
        summary.lecture = reading.kinds + ' ' + reading.pages;
        if (reading.kinds !== 'PSL' || reading.pages !== '1,2,1') problems.push('Lecture : feuilles ' + reading.kinds + ', pages ' + reading.pages + ' au lieu de PSL, 1,2,1');
        const sections = wordSections(await h.exportDocxParts(html, null, PageLayout.getMarginsTwip()));
        summary.word = sections.map(section => section.width + 'x' + section.height).join(' ');
        if (sections.length !== 3) problems.push('Word : ' + sections.length + ' section(s) au lieu de 3');
        else sections.forEach((section, i) => {
          const [width, height, orient] = PAGE_TWIP['PSL'[i]];
          if (!near(section.width, width, 2) || !near(section.height, height, 2) || section.orient !== orient) problems.push('Word, section ' + (i + 1) + ' : ' + section.width + ' x ' + section.height + ' ' + section.orient + ' au lieu de ' + width + ' x ' + height + ' ' + orient);
        });
        const job = await printJob(html);
        try {
          const printed = printSheets(job).map(printKind).join('');
          summary.impression = printed;
          if (printed !== 'PSSL') problems.push('impression : feuilles ' + printed + ' au lieu de PSSL');
        } finally { job.dispose(); }
        const pdf = await pdfOf(h, html);
        summary.pdf = pdf.kinds;
        if (pdf.kinds !== 'PSSL') problems.push('PDF : pages ' + pdf.kinds + ' au lieu de PSSL');
        return verdict(problems, summary);
      },
    },
  ];
})();
