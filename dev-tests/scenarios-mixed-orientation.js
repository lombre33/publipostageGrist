// Macro-modèle aux modèles de sens différents : portrait, paysage (et grille) dans un même document, chacun sur des pages de SON sens (demande d'Antoine, 12/10 : « il faudrait qu'un macro
// modèle puisse contenir des modèles paysage, portrait et grille » ; carte « Dans un macro-modèle, qui décide du sens des pages ? », réponse « Chaque modèle, ou imposé » : le bouton Page du
// macro-modèle propose « Selon chaque modèle », « Portrait » et « Paysage »).
//
// Le HTML assemblé dit lui-même le sens de chaque modèle (js/page-sections.js) : le saut de page qui ouvre un modèle porte `data-page-orientation="portrait|landscape"`, et un repère vide
// `page-section-start` ouvre le premier. Toutes les sorties (la Lecture, le PDF, le Word, l'impression navigateur) lisent ces repères de la même façon ; sans eux (un document ordinaire, un
// macro-modèle au sens imposé), rien ne change. Ce fichier écrit les repères À LA MAIN, à dessein : il épingle le contrat du HTML assemblé, du côté de la sortie ; l'assemblage lui-même (les
// repères que `MacroTemplates` pose) a ses scénarios plus bas dans le groupe, une fois l'interrupteur en place.
//
// Lot 5 (activation) : « Selon chaque modèle » est le réglage de page du macro-modèle (`PageLayout.isOrientationAuto`, clé `orientationAuto` de la colonne Margins ; le défaut d'un macro-modèle
// neuf, un macro-modèle déjà fait garde son sens imposé). `MacroTemplates.buildConcatenatedHtml(…, { perModel: true })` écrit alors le sens de chaque modèle assemblé (celui de sa propre page,
// Grille comprise) : les scénarios `mixed_assembly_*` épinglent ce HTML contre le contrat écrit à la main, `mixed_following_*` suivent le document jusqu'aux quatre sorties, et le menu Page
// du macro-modèle (`OrientationToggle`) a ses cas `mixed_page_*`.
//
// Lot 3 (Lecture) : `js/reader-mode.js` range le document résolu en une feuille de lecture par section (`splitIntoSections`, `paginateSections`) : un `.reader-content` à part pour chaque suite de
// modèles de même sens, de la largeur de SA page et paginé dans SON sens (`PageLayout.withOrientation`), les pages numérotées de bout en bout, une gouttière entre deux sections, les titres et les
// notes qui continuent, le facteur d'ajustement pris sur la feuille la plus large (`js/page-zoom.js`). Sans repère, la Lecture garde son unique `.reader-content` : rien ne change.
//
// Lot 2 (Word) : `js/docx-export.js` écrit une section Word par suite de modèles de même sens (`sectionPartsOf`, `buildDocxDocument`) : taille et sens de la page de chaque section, le saut de
// section remplace le saut de page du modèle qui l'ouvre, tableaux, colonnes et en-têtes bâtis dans la largeur de SA page, « première page différente » seulement sur la première page du
// document, le sommaire et la numérotation des titres sur tout le document. Le Word n'a pas de pagination à lui (Word pagine à l'ouverture) : l'identité se lit dans son XML.
//
// Lot 1 (PDF) : le sens de chaque section est lu par `js/pdf-export.js` (`prepareSections`, `visitSection`, `visitPageBreak`, `turnPage`) : la mise en page se fait dans la largeur de la page où le
// bloc tombe, pdfmake tourne la page au saut (`pageOrientation` sur le premier bloc de la section), l'en-tête, le pied et le filigrane suivent la page qu'ils habillent, et rien ne reste de l'un
// à l'autre des exports. Le format et les marges ne changent jamais d'une section à l'autre (ceux du macro-modèle pour tous ses modèles, choix du 09/10) : seul le sens tourne.
window.EditorTestSuites = window.EditorTestSuites || {};
window.EditorTestSuites.mixedOrientation = (function () {
  const PORTRAIT_PT = { width: 595.28, height: 841.89 };
  const LANDSCAPE_PT = { width: 841.89, height: 595.28 };
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const WITH_HF = { enabled: true, differentFirstPage: false, header: { default: '<p>EN-TETE</p>', first: '' }, footer: { default: '<p>PIED <span class="page-number-badge" data-format="n-slash-total">#</span></p>', first: '' } };
  const HF_WORDS = /^(EN-TETE|EN-|TETE|PIED|\d+\/\d+)$/;
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

  // --- Le HTML assemblé d'un macro-modèle aux sens mêlés, écrit à la main ---
  const start = sense => '<div class="page-section-start" contenteditable="false" data-page-orientation="' + sense + '"></div>';
  const slotBreak = (rank, sense) => '<div class="page-break-marker" contenteditable="false" data-macro-slot="' + rank + '" data-page-orientation="' + sense + '">Saut de page</div>';
  // `slots` : [{ sense, html }], un modèle chacun.
  const assemble = slots => start(slots[0].sense) + slots.map((slot, rank) => (rank ? slotBreak(rank, slot.sense) : '') + slot.html).join('');
  const slot = (sense, html) => ({ sense, html });
  // Les modèles tels que `Templates` les rend à l'assemblage (lot 5) : `sense` est celui de leur page (colonne Margins), nul pour un modèle qui n'en dit pas.
  const template = (id, sense, html, extra) => Object.assign({ id, nom: 'Modèle ' + id, contenu: html, typeModele: 'document', marginsMm: sense ? { orientation: sense } : null }, extra || {});
  const fixedSlots = (...ids) => ({ slots: ids.map(id => ({ type: 'fixed', modeleId: id })) });
  // Un élément et ses attributs triés, récursivement : de quoi comparer deux HTML par leur structure sans dépendre de l'ordre où les attributs sont écrits.
  function canon(html) {
    const root = document.createElement('div');
    root.innerHTML = html;
    const walk = node => (node.nodeType === 3 ? node.nodeValue : node.nodeType === 1
      ? '<' + node.localName + Array.from(node.attributes).map(a => ' ' + a.name + '="' + a.value + '"').sort().join('') + '>' + Array.from(node.childNodes).map(walk).join('') + '</' + node.localName + '>' : '');
    return Array.from(root.childNodes).map(walk).join('');
  }
  const assembleWith = (composition, templates, perModel, record) => MacroTemplates.buildConcatenatedHtml(composition, 'Clients', record || { id: 1 }, templates, perModel === undefined ? undefined : { perModel });
  // Un modèle Grille : un seul tableau aux colonnes réglées en px (colgroup et colwidth), ici 4 x 230 px = 920 px : trop large pour la largeur utile d'une page portrait (719 px à 9,9 mm
  // de marge), il tient dans une page paysage (1047 px).
  function gridTable(tag) {
    const widths = [230, 230, 230, 230];
    const row = r => '<tr data-row-height="28" style="height: 28px">' + widths.map((w, c) => '<td colwidth="' + w + '"><p>' + tag + r + 'c' + c + '</p></td>').join('') + '</tr>';
    return '<table style="width: 920px;"><colgroup>' + widths.map(w => '<col style="width: ' + w + 'px;">').join('') + '</colgroup><tbody>' + row(0) + row(1) + '</tbody></table>';
  }

  // --- Les modèles ---
  const lines = (n, tag) => Array.from({ length: n }, (_, i) => '<p>' + tag + ' ' + i + ' du modèle de test.</p>').join('');
  const longParagraph = tag => '<p>' + tag + ' ' + Array.from({ length: 70 }, (_, i) => 'mot' + i).join(' ') + '</p>';
  const tableOf = tag => '<table><tbody><tr><td><p>' + tag + 'a</p></td><td><p>' + tag + 'b</p></td><td><p>' + tag + 'c</p></td></tr></tbody></table>';
  const zoneOf = tag => '<div class="two-columns-zone" style="--layout-left: 50%"><div class="two-columns-column"><p>' + tag + 'G</p></div><div class="two-columns-column"><p>' + tag + 'D</p></div></div>';
  // Une image en calque posée par sa grille de page (à `left` pt du coin du contenu, `top` pt sous lui), seule sur sa ligne.
  const layerImage = (left, top) => '<p><img class="editor-image" src="' + PNG + '" alt="" style="width: 40px; height: 40px; position: absolute; left: 100px; top: 100px; z-index: 5;" data-layer="front" data-wrap="inline" data-page-index="0" data-page-left-pt="' + left + '" data-page-top-pt="' + top + '"></p>';
  const rightFloat = tag => '<p><img class="editor-image" src="' + PNG + '" alt="" style="width: 120px; height: 80px;" data-align="right" data-wrap="square">' + tag + ' ' + Array.from({ length: 40 }, (_, i) => 'mot' + i).join(' ') + '</p>';

  // --- Le PDF, relu par pdf.js ---
  const words = text => text.split(/\s+/).filter(Boolean);
  const near = (a, b, tolerance) => Math.abs(a - b) <= tolerance;
  async function pdfPages(h, html, hf, margins) {
    const result = await h.exportPdfContent(html, hf || null, margins || PageLayout.getMarginsPt());
    const gt = await h.extractPdfGroundTruth(result.base64);
    const pages = gt.pages.map(page => ({
      sense: page.width > page.height ? 'landscape' : 'portrait',
      width: page.width, height: page.height, items: page.textItems, images: page.images,
      words: page.textItems.flatMap(item => words(item.str)),
    }));
    return { result, pages, sizes: pages.map(page => (page.sense === 'landscape' ? 'L' : 'P')).join('') };
  }
  const bodyWords = page => page.words.filter(word => !HF_WORDS.test(word));
  // La taille réelle de chaque page, contre celle du sens attendu (A4 : le format du macro-modèle ne change pas).
  function sizeProblems(pages, expected) {
    const problems = [];
    pages.forEach((page, i) => {
      const want = expected[i] === 'L' ? LANDSCAPE_PT : PORTRAIT_PT;
      if (!near(page.width, want.width, 1) || !near(page.height, want.height, 1)) problems.push('page ' + (i + 1) + ' : ' + page.width.toFixed(1) + ' x ' + page.height.toFixed(1) + ' pt au lieu de ' + want.width + ' x ' + want.height);
    });
    return problems;
  }
  // Le mot repère de chaque modèle dit sur quelle page il tombe : la liste, page par page, des repères présents.
  const tagsOn = (page, tags) => tags.filter(tag => page.words.indexOf(tag) !== -1);
  const verdict = (problems, summary) => ({ pass: problems.length === 0, notes: JSON.stringify({ summary, problems }) });

  // --- Le Word, relu dans son XML ---
  // Le texte d'un bloc, sans la fin commune des lignes de test (« Alpha 0 du modèle de test. » donne « Alpha 0 »).
  const wordText = node => Array.from(node.getElementsByTagName('w:t')).map(t => t.textContent).join('').replace(/ du modèle de test\.$/, '');
  const wordOpensPage = node => node.nodeName === 'w:p' && node.getElementsByTagName('w:pageBreakBefore').length > 0;
  const numberOf = (el, name) => (el && el.getAttribute(name) !== null ? Number(el.getAttribute(name)) : null);
  // Les sections du document.xml, dans l'ordre : la page (taille, sens, marges, « première page différente »), les en-têtes et pieds qu'elle déclare (type -> fichier) et ses blocs.
  // Docx.js écrit le <w:sectPr> d'une section dans un paragraphe vide à sa fin (le dernier est au bout du corps) : ce paragraphe-là n'est pas du contenu, `blocks` ne le garde pas.
  function wordSections(parts) {
    const rels = {};
    Array.from(parts.part('word/_rels/document.xml.rels').getElementsByTagName('Relationship')).forEach(rel => { rels[rel.getAttribute('Id')] = 'word/' + rel.getAttribute('Target'); });
    const refs = (sect, tag) => { const out = {}; Array.from(sect.getElementsByTagName(tag)).forEach(ref => { out[ref.getAttribute('w:type')] = rels[ref.getAttribute('r:id')]; }); return out; };
    const sections = [];
    let blocks = [];
    const close = sect => {
      const pgSz = sect.getElementsByTagName('w:pgSz')[0];
      const pgMar = sect.getElementsByTagName('w:pgMar')[0];
      const titlePg = sect.getElementsByTagName('w:titlePg')[0];
      sections.push({
        width: numberOf(pgSz, 'w:w'), height: numberOf(pgSz, 'w:h'), orient: pgSz ? pgSz.getAttribute('w:orient') : null,
        margins: ['top', 'right', 'bottom', 'left', 'header', 'footer'].map(name => numberOf(pgMar, 'w:' + name)).join(','),
        titlePg: !!titlePg && titlePg.getAttribute('w:val') !== 'false' && titlePg.getAttribute('w:val') !== '0',
        headers: refs(sect, 'w:headerReference'), footers: refs(sect, 'w:footerReference'), blocks,
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
  // La largeur d'un tableau : la somme de sa grille (<w:tblGrid>).
  const wordGridWidth = tbl => Array.from(tbl.getElementsByTagName('w:tblGrid')[0].getElementsByTagName('w:gridCol')).reduce((sum, col) => sum + Number(col.getAttribute('w:w')), 0);
  const pageTwip = { portrait: [11906, 16838], landscape: [16838, 11906] };
  function wordSizeProblems(sections, expected) {
    const problems = [];
    sections.forEach((section, i) => {
      const [width, height] = pageTwip[expected[i] === 'L' ? 'landscape' : 'portrait'];
      const orient = expected[i] === 'L' ? 'landscape' : 'portrait';
      if (section.width !== width || section.height !== height || section.orient !== orient) problems.push('section ' + (i + 1) + ' : ' + section.width + ' x ' + section.height + ' ' + section.orient + ' au lieu de ' + width + ' x ' + height + ' ' + orient);
    });
    return problems;
  }

  // La page du document d'avant les scénarios : A4 portrait, marges par défaut (les scénarios n'y touchent pas, mais un groupe d'avant a pu la laisser autrement).
  async function plainPage(h) {
    await h.resetEditor();
    PageLayout.setMarginsMm(null);
    OrientationToggle.sync();
    document.dispatchEvent(new CustomEvent('pp:pageLayoutChanged'));
    await h.sleep(150);
  }

  // --- La Lecture, mesurée dans le DOM ---
  const SHEET_PX = { P: 793.71, L: 1122.52 };
  const SHEET_HEIGHT_PX = { P: 1122.52, L: 793.71 };
  const readerBox = () => document.getElementById('reader-container');
  const squash = el => el.textContent.replace(/\s+/g, ' ').trim();
  // Les textes d'une famille de bandes (en-têtes, pieds, repères « Page N »), de haut en bas, sans les bandes vides.
  const bandTexts = (box, selector) => Array.from(box.querySelectorAll(selector)).filter(el => squash(el)).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top).map(squash);
  const NUMBERED_HF = {
    enabled: true, differentFirstPage: true,
    header: { default: '<p>EN-TETE <span class="page-number-badge" data-format="n">#</span></p>', first: '<p>PREMIERE</p>' },
    footer: { default: '<p>PIED <span class="page-number-badge" data-format="n-slash-total">#</span></p>', first: '<p>PREMIER-PIED <span class="page-number-badge" data-format="n-slash-total">#</span></p>' },
  };
  // Rend `html` dans la Lecture (aperçu A4 allumé) et mesure ses feuilles de lecture : pour chacune sa largeur et sa hauteur en pixels de mise en page, son sens (d'après sa largeur), son rang et
  // le nombre de pages qu'elle compte (une couture par frontière de page, dans la surcouche qui lui correspond).
  async function readSheets(h, html, hf) {
    h.setA4Preview(true);
    await h.renderReaderMode(html, hf);
    await h.sleep(250);
    const box = readerBox();
    const overlays = Array.from(box.querySelectorAll(':scope > .v2-pagination-overlay'));
    const sheets = Array.from(box.querySelectorAll(':scope > .reader-content')).map((el, index) => {
      const zoom = EditorCore.layoutZoom(el);
      const rect = el.getBoundingClientRect();
      return {
        el, rank: el.getAttribute('data-pp-sheet'), width: rect.width / zoom, height: rect.height / zoom, top: rect.top, bottom: rect.bottom,
        sense: rect.width / zoom > 1000 ? 'L' : 'P', pages: overlays[index] ? overlays[index].querySelectorAll('.v2-page-band').length + 1 : 1,
      };
    });
    return { box, sheets, senses: sheets.map(sheet => sheet.sense).join(''), pages: sheets.map(sheet => sheet.pages).join(',') };
  }
  // Une feuille mesurée contre la page de son sens (A4).
  function sheetProblems(sheets, senses) {
    const problems = [];
    sheets.forEach((sheet, i) => {
      const want = senses[i];
      if (!want) return;
      if (!near(sheet.width, SHEET_PX[want], 1.5)) problems.push('feuille ' + (i + 1) + ' : largeur ' + sheet.width.toFixed(1) + ' px au lieu de ' + SHEET_PX[want]);
      if (sheet.pages === 1 && !near(sheet.height, SHEET_HEIGHT_PX[want], 2)) problems.push('feuille ' + (i + 1) + ' : hauteur ' + sheet.height.toFixed(1) + ' px au lieu de ' + SHEET_HEIGHT_PX[want]);
    });
    return problems;
  }

  // --- L'impression par le navigateur, mesurée dans le cadre caché ---
  const clone = value => JSON.parse(JSON.stringify(value));
  const printSheets = job => Array.from(job.frame.contentDocument.querySelectorAll('.pp-print-sheet'));
  const printSense = sheet => (parseFloat(sheet.style.width) > 1000 ? 'L' : 'P');
  // Les boîtes de texte qu'une feuille montre : celles qui tiennent dans sa fenêtre (le reste du document, que la fenêtre rogne, n'est pas à elle), avec leur coin haut gauche en pixels depuis
  // le coin de la feuille.
  function sheetText(sheet) {
    const view = sheet.querySelector('.pp-print-window').getBoundingClientRect();
    const origin = sheet.getBoundingClientRect();
    const doc = sheet.ownerDocument;
    const range = doc.createRange();
    const walker = doc.createTreeWalker(sheet, NodeFilter.SHOW_TEXT);
    const boxes = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!/\S/.test(node.nodeValue) || node.parentElement.closest('style, script, template')) continue;
      range.selectNodeContents(node);
      const inside = Array.from(range.getClientRects()).filter(r => r.width > 0 && r.height > 0 && r.top >= view.top - 0.5 && r.bottom <= view.bottom + 0.5 && r.left >= view.left - 0.5 && r.right <= view.right + 0.5);
      if (inside.length) boxes.push({ text: node.nodeValue.trim(), left: inside[0].left - origin.left, top: inside[0].top - origin.top });
    }
    return boxes;
  }
  const textOf = boxes => boxes.map(box => box.text).join(' ');
  const PRINT_PAGE_RULES = {
    default: '@page { size: 210mm 297mm; margin: 0; }',
    portrait: '@page pp-portrait { size: 210mm 297mm; margin: 0; }',
    landscape: '@page pp-landscape { size: 297mm 210mm; margin: 0; }',
  };
  async function printJob(html, hf) { return PrintExport.prepare(html, null, { id: 1 }, clone(hf || NO_HF), 'essai'); }

  return [
    // ---------- Le lecteur des repères ----------
    {
      id: 'mixed_sections_the_reader_of_markers_splits_runs_of_equal_sense',
      description: 'PageSections : un document sans repère n\'est pas une suite de sections ; le repère de départ dit le sens du premier modèle, un saut de page qui garde le sens reste dans sa section, un changement de sens ouvre la suivante (le saut en est le premier nœud), un repère illisible ne compte pas',
      async run() {
        const problems = [];
        const parse = html => { const root = document.createElement('div'); root.innerHTML = html; return root; };
        const shape = sections => sections.map(s => s.orientation[0] + ':' + s.nodes.filter(n => n.nodeType === 1).map(n => (n.classList.contains('page-break-marker') ? '|' + (n.getAttribute('data-macro-slot') || '') : n.textContent)).join(','));
        const plainBreak = '<div class="page-break-marker" contenteditable="false" data-macro-slot="1">Saut de page</div>';
        if (PageSections.hasSenses('<p>texte</p>' + plainBreak)) problems.push('un saut de page de macro-modèle SANS repère de sens est pris pour un document aux sens mêlés');
        if (PageSections.hasSenses(parse('<p>texte</p>' + plainBreak))) problems.push('(nœuds) un saut de page sans repère de sens est pris pour un repère');
        const mixed = parse(assemble([slot('portrait', '<p>A</p>'), slot('portrait', '<p>B</p>'), slot('landscape', '<p>C</p>'), slot('landscape', '<p>D</p>'), slot('portrait', '<p>E</p>')]));
        if (!PageSections.hasSenses(mixed) || !PageSections.hasSenses(mixed.innerHTML)) problems.push('un document aux sens mêlés n\'est pas reconnu');
        const sections = PageSections.split(mixed.childNodes, 'portrait');
        if (shape(sections).join(' ') !== 'p:A,|1,B l:|2,C,|3,D p:|4,E') problems.push('découpage : ' + shape(sections).join(' ') + ' au lieu de « p:A,|1,B l:|2,C,|3,D p:|4,E »');
        // Le premier modèle en paysage : la section de départ prend le sens du repère, pas celui de la page de base.
        const landscapeFirst = PageSections.split(parse(assemble([slot('landscape', '<p>A</p>'), slot('portrait', '<p>B</p>')])).childNodes, 'portrait');
        if (shape(landscapeFirst).join(' ') !== 'l:A p:|1,B') problems.push('premier modèle en paysage : ' + shape(landscapeFirst).join(' '));
        // Un modèle vide au départ : le repère seul ouvre une section vide, pour que la première page suive son sens.
        const onlyStart = PageSections.split(parse(start('landscape')).childNodes, 'portrait');
        if (onlyStart.length !== 1 || onlyStart[0].orientation !== 'landscape' || onlyStart[0].nodes.length) problems.push('repère de départ seul : ' + JSON.stringify(onlyStart.map(s => s.orientation)));
        // Des espaces devant le repère de départ (le HTML assemblé en garde parfois) n'ouvrent pas une section de plus.
        const spaced = PageSections.split(parse('\n  ' + assemble([slot('landscape', '<p>A</p>')])).childNodes, 'portrait');
        if (spaced.length !== 1 || spaced[0].orientation !== 'landscape') problems.push('espaces devant le repère de départ : ' + JSON.stringify(spaced.map(s => s.orientation)));
        // Un sens illisible ne change rien : le saut reste dans sa section.
        const unreadable = PageSections.split(parse(start('portrait') + '<p>A</p><div class="page-break-marker" data-macro-slot="1" data-page-orientation="diagonal">Saut de page</div><p>B</p>').childNodes, 'portrait');
        if (unreadable.length !== 1) problems.push('un sens illisible ouvre une section : ' + unreadable.length);
        // Les sens employés, dans l'ordre, et le sens du départ lu sans analyser tout le document.
        if (PageSections.sensesIn(mixed.innerHTML).join() !== 'portrait,landscape') problems.push('sensesIn : ' + PageSections.sensesIn(mixed.innerHTML).join());
        if (PageSections.firstSenseOf(assemble([slot('landscape', '<p>A</p>')])) !== 'landscape' || PageSections.firstSenseOf(assemble([slot('portrait', '<p>A</p>')])) !== 'portrait' || PageSections.firstSenseOf('<p>A</p>') !== null) problems.push('firstSenseOf : ' + [PageSections.firstSenseOf(assemble([slot('landscape', '<p>A</p>')])), PageSections.firstSenseOf('<p>A</p>')].join(' / '));
        // Le repère de départ fabriqué par PageSections est celui que ce fichier écrit à la main : le contrat du HTML assemblé.
        if (PageSections.startHtml('landscape') !== start('landscape') || PageSections.startHtml('portrait') !== start('portrait')) problems.push('startHtml : ' + PageSections.startHtml('landscape'));
        const stripped = parse(assemble([slot('landscape', '<p>A</p>')]));
        PageSections.stripStart(stripped);
        if (stripped.querySelector('.page-section-start') || stripped.textContent !== 'A') problems.push('stripStart laisse le repère de départ');
        return verdict(problems, { decoupage: shape(sections).join(' ') });
      },
    },

    // ---------- Le PDF ----------
    {
      id: 'mixed_pdf_each_template_has_pages_of_its_own_sense',
      description: 'PDF : portrait, paysage, portrait, paysage dans un macro-modèle aux sens mêlés : quatre pages, chacune de la taille de son sens (A4), le texte de chaque modèle sur la sienne, l\'en-tête sur chacune, le pied « n/total » qui continue (1/4 à 4/4) et au bas de chaque page',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const html = assemble([slot('portrait', lines(3, 'Alpha')), slot('landscape', lines(3, 'Bravo')), slot('portrait', lines(3, 'Charlie')), slot('landscape', lines(3, 'Delta'))]);
        const { pages, sizes } = await pdfPages(h, html, WITH_HF);
        if (sizes !== 'PLPL') problems.push('sens des pages : ' + sizes + ' au lieu de PLPL');
        problems.push(...sizeProblems(pages, 'PLPL'));
        const tags = ['Alpha', 'Bravo', 'Charlie', 'Delta'];
        pages.forEach((page, i) => {
          if (tagsOn(page, tags).join() !== tags[i]) problems.push('page ' + (i + 1) + ' : les modèles posés sont « ' + tagsOn(page, tags).join(' ') + ' » au lieu de « ' + tags[i] + ' »');
          if (bodyWords(page).length !== 18) problems.push('page ' + (i + 1) + ' : ' + bodyWords(page).length + ' mots de corps au lieu de 18 (trois lignes de six mots)');
          const head = page.items.find(item => item.str.indexOf('EN-') === 0);
          if (!head) problems.push('page ' + (i + 1) + ' : pas d\'en-tête');
          const foot = page.items.find(item => item.str.indexOf('PIED') === 0);
          if (!foot) problems.push('page ' + (i + 1) + ' : pas de pied');
          else if (!near(page.height - foot.y, 73, 12)) problems.push('page ' + (i + 1) + ' : le pied est à ' + (page.height - foot.y).toFixed(0) + ' pt du bas de SA page (73 attendus)');
        });
        const feet = pages.map(page => (page.items.map(item => item.str.trim()).find(str => /^\d+\/\d+$/.test(str)) || '-'));
        if (feet.join(' ') !== '1/4 2/4 3/4 4/4') problems.push('pieds : ' + feet.join(' ') + ' au lieu de 1/4 2/4 3/4 4/4');
        return verdict(problems, { sens: sizes, pieds: feet.join(' ') });
      },
    },
    {
      id: 'mixed_pdf_starts_in_the_sense_of_the_first_template',
      description: 'PDF : le document commence dans le sens de son premier modèle (paysage, puis portrait ; un seul modèle paysage), sans page blanche devant, et la définition du document le dit',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const summary = {};
        const runs = [
          ['paysage puis portrait', [slot('landscape', lines(3, 'Alpha')), slot('portrait', lines(3, 'Bravo'))], 'LP'],
          ['un seul modèle paysage', [slot('landscape', lines(3, 'Alpha'))], 'L'],
          ['un seul modèle portrait', [slot('portrait', lines(3, 'Alpha'))], 'P'],
        ];
        for (const [label, slots, expected] of runs) {
          const { pages, sizes, result } = await pdfPages(h, assemble(slots), NO_HF);
          summary[label] = sizes;
          if (sizes !== expected) problems.push(label + ' : ' + sizes + ' au lieu de ' + expected);
          problems.push(...sizeProblems(pages, expected).map(p => label + ', ' + p));
          pages.forEach((page, i) => { if (!bodyWords(page).length) problems.push(label + ', page ' + (i + 1) + ' blanche'); });
          const first = result.docDefinition.pageOrientation;
          if (first !== (expected[0] === 'L' ? 'landscape' : 'portrait')) problems.push(label + ' : la définition du document commence en « ' + first + ' »');
        }
        return verdict(problems, summary);
      },
    },
    {
      id: 'mixed_pdf_templates_of_the_same_sense_follow_each_other_without_turning',
      description: 'PDF : des modèles de même sens à la suite (portrait, portrait, paysage, paysage, portrait) gardent leur saut de page ordinaire entre eux et ne tournent la page qu\'à un changement de sens : cinq pages PPLLP, pieds 1/5 à 5/5, aucune blanche',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const html = assemble([slot('portrait', lines(3, 'Alpha')), slot('portrait', lines(3, 'Bravo')), slot('landscape', lines(3, 'Charlie')), slot('landscape', lines(3, 'Delta')), slot('portrait', lines(3, 'Echo'))]);
        const { pages, sizes } = await pdfPages(h, html, WITH_HF);
        if (sizes !== 'PPLLP') problems.push('sens des pages : ' + sizes + ' au lieu de PPLLP');
        problems.push(...sizeProblems(pages, 'PPLLP'));
        const tags = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'];
        pages.forEach((page, i) => { if (tagsOn(page, tags).join() !== tags[i]) problems.push('page ' + (i + 1) + ' : « ' + tagsOn(page, tags).join(' ') + ' » au lieu de « ' + tags[i] + ' »'); });
        const feet = pages.map(page => (page.items.map(item => item.str.trim()).find(str => /^\d+\/\d+$/.test(str)) || '-'));
        if (feet.join(' ') !== '1/5 2/5 3/5 4/5 5/5') problems.push('pieds : ' + feet.join(' '));
        return verdict(problems, { sens: sizes, pieds: feet.join(' ') });
      },
    },
    {
      id: 'mixed_pdf_a_long_template_flows_over_several_pages_of_its_sense',
      description: 'PDF : un modèle paysage plus long qu\'une page coule sur plusieurs pages PAYSAGE (leur hauteur est celle du paysage, plus basse), puis le modèle portrait suivant reprend une page portrait ; aucun mot perdu',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const html = assemble([slot('landscape', lines(60, 'Bravo')), slot('portrait', lines(3, 'Charlie'))]);
        const { pages, sizes } = await pdfPages(h, html, NO_HF);
        if (!/^L{2,}P$/.test(sizes)) problems.push('sens des pages : ' + sizes + ' (des pages paysage puis une page portrait attendues)');
        const bravo = pages.reduce((sum, page) => sum + page.words.filter(w => w === 'Bravo').length, 0);
        const charlie = pages.reduce((sum, page) => sum + page.words.filter(w => w === 'Charlie').length, 0);
        if (bravo !== 60 || charlie !== 3) problems.push('mots perdus ou en double : ' + bravo + ' lignes de Bravo (60) et ' + charlie + ' de Charlie (3)');
        const last = pages[pages.length - 1];
        if (!last || last.sense !== 'portrait' || tagsOn(last, ['Bravo', 'Charlie']).join() !== 'Charlie') problems.push('la dernière page n\'est pas celle du modèle portrait seul');
        pages.slice(0, -1).forEach((page, i) => {
          const lowest = Math.max(...page.items.map(item => item.y));
          if (lowest > LANDSCAPE_PT.height) problems.push('page ' + (i + 1) + ' : du texte à ' + lowest.toFixed(0) + ' pt, plus bas que la page paysage (' + LANDSCAPE_PT.height + ' pt)');
        });
        return verdict(problems, { sens: sizes });
      },
    },
    {
      id: 'mixed_pdf_text_wraps_to_the_width_of_its_page',
      description: 'PDF : le même long paragraphe revient à la ligne à la largeur de SA page : bord droit du texte à la marge droite d\'une page portrait (≤ 567 pt) et vers celle d\'une page paysage (> 700 pt, ≤ 814 pt)',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const html = assemble([slot('portrait', longParagraph('Alpha')), slot('landscape', longParagraph('Bravo')), slot('portrait', longParagraph('Charlie'))]);
        const { pages, sizes } = await pdfPages(h, html, NO_HF);
        if (sizes !== 'PLP') problems.push('sens des pages : ' + sizes);
        const right = page => Math.max(...page.items.map(item => item.x + item.width));
        const edges = pages.map(right);
        const marginRight = PageLayout.getMarginsPt().right;
        pages.forEach((page, i) => {
          const limit = page.width - marginRight;
          if (edges[i] > limit + 1) problems.push('page ' + (i + 1) + ' : le texte va jusqu\'à ' + edges[i].toFixed(0) + ' pt, au-delà de la marge droite (' + limit.toFixed(0) + ' pt)');
          if (edges[i] < limit - 60) problems.push('page ' + (i + 1) + ' : le texte s\'arrête à ' + edges[i].toFixed(0) + ' pt, loin de la marge droite (' + limit.toFixed(0) + ' pt) : mis en page dans une autre largeur');
        });
        return verdict(problems, { sens: sizes, bordsDroits: edges.map(e => Math.round(e)).join(' ') });
      },
    },
    {
      id: 'mixed_pdf_tables_and_two_column_zones_follow_the_width_of_their_page',
      description: 'PDF : un tableau de trois cases et une zone à deux colonnes tiennent la largeur de leur page (cases au tiers et aux deux tiers de la largeur utile, deuxième colonne à la moitié), en portrait comme en paysage',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const html = assemble([slot('portrait', tableOf('TA') + zoneOf('ZA')), slot('landscape', tableOf('TB') + zoneOf('ZB')), slot('portrait', tableOf('TC') + zoneOf('ZC'))]);
        const { pages, sizes } = await pdfPages(h, html, NO_HF);
        if (sizes !== 'PLP') problems.push('sens des pages : ' + sizes);
        const margins = PageLayout.getMarginsPt();
        const summary = {};
        pages.forEach((page, i) => {
          const content = page.width - margins.left - margins.right;
          const x = str => { const item = page.items.find(it => it.str === str); return item ? (item.x - margins.left) / content : null; };
          const tag = ['A', 'B', 'C'][i];
          const cells = [x('T' + tag + 'a'), x('T' + tag + 'b'), x('T' + tag + 'c')];
          const zone = x('Z' + tag + 'D');
          summary['page ' + (i + 1)] = { cases: cells.map(c => (c == null ? null : Math.round(c * 100) / 100)), colonne: zone == null ? null : Math.round(zone * 100) / 100 };
          if (cells.some(c => c == null)) { problems.push('page ' + (i + 1) + ' : cases du tableau introuvables'); return; }
          if (!near(cells[0], 0.01, 0.02) || !near(cells[1], 0.343, 0.025) || !near(cells[2], 0.675, 0.025)) problems.push('page ' + (i + 1) + ' : cases à ' + cells.map(c => c.toFixed(2)).join(' / ') + ' de la largeur utile (0,01 / 0,34 / 0,68 attendus)');
          if (zone == null || !near(zone, 0.525, 0.03)) problems.push('page ' + (i + 1) + ' : deuxième colonne à ' + (zone == null ? 'rien' : zone.toFixed(2)) + ' de la largeur utile (0,52 attendu)');
        });
        return verdict(problems, summary);
      },
    },
    {
      id: 'mixed_pdf_layer_images_and_floating_images_stay_on_their_own_page',
      description: 'PDF : l\'image en calque d\'un modèle garde sa position de page (à sa marge + sa grille) sur la page de son sens, et une image flottante à droite touche la marge droite de SA page, en portrait comme en paysage',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const html = assemble([slot('portrait', lines(2, 'Alpha') + layerImage(150, 20) + rightFloat('Alpha')), slot('landscape', lines(2, 'Bravo') + layerImage(700, 50) + rightFloat('Bravo')), slot('portrait', lines(2, 'Charlie') + layerImage(400, 50))]);
        const { pages, sizes } = await pdfPages(h, html, NO_HF);
        if (sizes !== 'PLP') problems.push('sens des pages : ' + sizes);
        const m = PageLayout.getMarginsPt();
        const wantLayer = [[150, 20], [700, 50], [400, 50]];
        const summary = {};
        pages.forEach((page, i) => {
          const layer = page.images.find(img => near(img.width, 30, 2));
          const floating = page.images.find(img => near(img.width, 90, 2));
          summary['page ' + (i + 1)] = { calque: layer ? Math.round(layer.x) + ',' + Math.round(layer.y) : null, flottante: floating ? Math.round(floating.x + floating.width) : null };
          if (!layer) problems.push('page ' + (i + 1) + ' : l\'image en calque n\'est pas peinte sur sa page (' + page.images.length + ' image(s) peinte(s))');
          else if (!near(layer.x, m.left + wantLayer[i][0], 3) || !near(layer.y, m.top + wantLayer[i][1], 3)) problems.push('page ' + (i + 1) + ' : image en calque à ' + layer.x.toFixed(0) + ', ' + layer.y.toFixed(0) + ' pt au lieu de ' + (m.left + wantLayer[i][0]) + ', ' + (m.top + wantLayer[i][1]));
          if (i < 2) {
            if (!floating) problems.push('page ' + (i + 1) + ' : l\'image flottante n\'est pas peinte');
            else if (!near(floating.x + floating.width, page.width - m.right, 2)) problems.push('page ' + (i + 1) + ' : l\'image flottante finit à ' + (floating.x + floating.width).toFixed(0) + ' pt, sa marge droite est à ' + (page.width - m.right).toFixed(0) + ' pt');
          }
        });
        return verdict(problems, summary);
      },
    },
    {
      id: 'mixed_pdf_header_and_footer_are_laid_out_for_the_page_they_dress',
      description: 'PDF : l\'en-tête (un tableau de deux cases) et le pied (aligné à droite, avec « n/total ») sont mis en page dans la largeur de chaque page : la case de droite de l\'en-tête est plus loin à droite sur une page paysage, le pied finit à la marge droite de sa page',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const hf = {
          enabled: true, differentFirstPage: false,
          header: { default: '<table><tbody><tr><td><p>GAUCHE</p></td><td><p>DROITE</p></td></tr></tbody></table>', first: '' },
          footer: { default: '<p style="text-align: right">PIED <span class="page-number-badge" data-format="n-slash-total">#</span></p>', first: '' },
        };
        const html = assemble([slot('portrait', lines(2, 'Alpha')), slot('landscape', lines(2, 'Bravo')), slot('portrait', lines(2, 'Charlie'))]);
        const { pages, sizes } = await pdfPages(h, html, hf);
        if (sizes !== 'PLP') problems.push('sens des pages : ' + sizes);
        const m = PageLayout.getMarginsPt();
        const rightCell = pages.map(page => { const item = page.items.find(it => it.str === 'DROITE'); return item ? item.x : null; });
        if (rightCell.some(x => x == null)) problems.push('case de droite de l\'en-tête introuvable : ' + rightCell.join(' '));
        else {
          const ratio = pages.map((page, i) => (rightCell[i] - m.left) / (page.width - m.left - m.right));
          ratio.forEach((r, i) => { if (!near(r, 0.5, 0.04)) problems.push('page ' + (i + 1) + ' : la case de droite de l\'en-tête commence à ' + r.toFixed(2) + ' de la largeur utile (0,5 attendu)'); });
          if (!(rightCell[1] - rightCell[0] > 100)) problems.push('la case de droite n\'est pas plus loin sur la page paysage : ' + rightCell.map(x => Math.round(x)).join(' / '));
        }
        pages.forEach((page, i) => {
          const numbers = page.items.filter(item => /^\d+\/\d+$/.test(item.str.trim()));
          const last = numbers[numbers.length - 1];
          if (!last) problems.push('page ' + (i + 1) + ' : pas de « n/total » au pied');
          else if (!near(last.x + last.width, page.width - m.right, 4)) problems.push('page ' + (i + 1) + ' : le pied finit à ' + (last.x + last.width).toFixed(0) + ' pt, la marge droite est à ' + (page.width - m.right).toFixed(0) + ' pt');
        });
        return verdict(problems, { casesDeDroite: rightCell.map(x => Math.round(x)).join(' / ') });
      },
    },
    {
      id: 'mixed_pdf_watermark_is_drawn_for_each_page_size',
      description: 'PDF : le filigrane du macro-modèle est dessiné à la taille de chaque page (595 x 842 pt sur une page portrait, 842 x 595 pt sur une page paysage), le même pour toutes les pages de même sens',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const margins = Object.assign({}, PageLayout.getMarginsPt(), { watermark: { text: 'CONFIDENTIEL' } });
        const html = assemble([slot('portrait', lines(2, 'Alpha')), slot('landscape', lines(2, 'Bravo')), slot('portrait', lines(2, 'Charlie'))]);
        const { result, sizes } = await pdfPages(h, html, NO_HF, margins);
        if (sizes !== 'PLP') problems.push('sens des pages : ' + sizes);
        const background = result.docDefinition.background;
        if (typeof background !== 'function') problems.push('pas de fond de page pour le filigrane');
        else {
          const svgOf = (page, size) => { const nodes = background(page, size) || []; return nodes.map(node => node.svg || '').find(svg => svg.indexOf('CONFIDENTIEL') !== -1) || ''; };
          const sizeOfSvg = svg => { const w = /width="([\d.]+)"/.exec(svg); const hgt = /height="([\d.]+)"/.exec(svg); return w && hgt ? [parseFloat(w[1]), parseFloat(hgt[1])] : null; };
          const portrait = sizeOfSvg(svgOf(1, { width: PORTRAIT_PT.width, height: PORTRAIT_PT.height, orientation: 'portrait' }));
          const landscape = sizeOfSvg(svgOf(2, { width: LANDSCAPE_PT.width, height: LANDSCAPE_PT.height, orientation: 'landscape' }));
          const portraitAgain = sizeOfSvg(svgOf(3, { width: PORTRAIT_PT.width, height: PORTRAIT_PT.height, orientation: 'portrait' }));
          if (!portrait || !near(portrait[0], PORTRAIT_PT.width, 0.5) || !near(portrait[1], PORTRAIT_PT.height, 0.5)) problems.push('filigrane d\'une page portrait : ' + JSON.stringify(portrait));
          if (!landscape || !near(landscape[0], LANDSCAPE_PT.width, 0.5) || !near(landscape[1], LANDSCAPE_PT.height, 0.5)) problems.push('filigrane d\'une page paysage : ' + JSON.stringify(landscape));
          if (!portraitAgain || !near(portraitAgain[0], PORTRAIT_PT.width, 0.5)) problems.push('filigrane de la page portrait qui suit : ' + JSON.stringify(portraitAgain));
        }
        return verdict(problems, { sens: sizes });
      },
    },
    {
      id: 'mixed_pdf_an_empty_template_keeps_its_page_and_a_last_empty_one_opens_none',
      description: 'PDF : un modèle paysage VIDE entre deux modèles portrait ouvre quand même sa page (blanche, paysage : « deux sauts de suite laissent une page blanche », choix du 09/10) ; un dernier modèle vide n\'ouvre aucune page',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const summary = {};
        const middle = await pdfPages(h, assemble([slot('portrait', lines(2, 'Alpha')), slot('landscape', ''), slot('portrait', lines(2, 'Charlie'))]), NO_HF);
        summary.milieu = middle.sizes;
        if (middle.sizes !== 'PLP') problems.push('modèle vide au milieu : ' + middle.sizes + ' au lieu de PLP');
        else if (middle.pages[1].words.length) problems.push('la page du modèle vide n\'est pas blanche : ' + middle.pages[1].words.join(' '));
        const last = await pdfPages(h, assemble([slot('portrait', lines(2, 'Alpha')), slot('landscape', '')]), NO_HF);
        summary.fin = last.sizes;
        if (last.sizes !== 'P') problems.push('dernier modèle vide : ' + last.sizes + ' au lieu de P');
        return verdict(problems, summary);
      },
    },
    {
      id: 'mixed_pdf_table_of_contents_and_numbered_headings_cross_sections',
      description: 'PDF : le sommaire du premier modèle (portrait) donne la bonne page à un titre d\'un modèle paysage et à un titre du modèle portrait qui suit, et la numérotation des titres continue d\'un modèle à l\'autre',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const heading = tag => '<h1>' + tag + 'titre</h1><p>' + tag + ' texte.</p>';
        const html = assemble([slot('portrait', '<div class="toc-marker"></div>' + heading('Alpha')), slot('landscape', heading('Bravo')), slot('portrait', heading('Charlie'))]);
        const { pages, sizes } = await pdfPages(h, html, NO_HF);
        if (sizes !== 'PLP') { problems.push('sens des pages : ' + sizes + ' au lieu de PLP'); return verdict(problems, { sens: sizes }); }
        // Le sommaire est sur la page 1 : pour chaque titre, la ligne « titre ...... n » finit par son numéro de page.
        const page1 = pages[0];
        const lineOf = name => {
          const items = page1.items.filter(item => item.str.indexOf(name) !== -1);
          if (!items.length) return null;
          const y = items[0].y;
          return page1.items.filter(item => near(item.y, y, 2)).sort((a, b) => a.x - b.x).map(item => item.str.trim()).join(' ');
        };
        const entries = ['Alphatitre', 'Bravotitre', 'Charlietitre'].map(lineOf);
        const wantPages = ['1', '2', '3'];
        entries.forEach((entry, i) => {
          if (!entry) problems.push('le sommaire n\'a pas « ' + ['Alpha', 'Bravo', 'Charlie'][i] + 'titre »');
          else if (!new RegExp('(^|\\s)' + wantPages[i] + '$').test(entry)) problems.push('sommaire : « ' + entry + ' » (page ' + wantPages[i] + ' attendue en fin de ligne)');
        });
        return verdict(problems, { sens: sizes, sommaire: entries });
      },
    },
    {
      id: 'mixed_pdf_nothing_changes_without_markers_and_nothing_leaks_between_exports',
      description: 'PDF : un macro-modèle au sens imposé (des sauts de page de modèle SANS repère de sens) garde toutes ses pages dans le sens des marges, portrait comme paysage ; et un export aux sens mêlés ne laisse rien derrière lui : l\'export suivant, ordinaire, retrouve le sens de ses marges',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const summary = {};
        const imposed = '<div class="page-break-marker" contenteditable="false" data-macro-slot="1">Saut de page</div>';
        const imposedDoc = lines(2, 'Alpha') + imposed + lines(2, 'Bravo') + imposed.replace('"1"', '"2"') + lines(2, 'Charlie');
        const portraitMargins = PageLayout.getMarginsPt();
        const landscapeMargins = Object.assign({}, portraitMargins, { orientation: 'landscape' });
        summary.imposePortrait = (await pdfPages(h, imposedDoc, NO_HF, portraitMargins)).sizes;
        summary.imposePaysage = (await pdfPages(h, imposedDoc, NO_HF, landscapeMargins)).sizes;
        if (summary.imposePortrait !== 'PPP') problems.push('macro-modèle imposé portrait : ' + summary.imposePortrait);
        if (summary.imposePaysage !== 'LLL') problems.push('macro-modèle imposé paysage : ' + summary.imposePaysage);
        // Un export aux sens mêlés qui commence en paysage, puis des exports ordinaires dans chaque sens.
        const mixed = await pdfPages(h, assemble([slot('landscape', lines(2, 'Alpha')), slot('portrait', lines(2, 'Bravo'))]), WITH_HF, portraitMargins);
        summary.mele = mixed.sizes;
        if (mixed.sizes !== 'LP') problems.push('aux sens mêlés : ' + mixed.sizes);
        const afterPortrait = await pdfPages(h, lines(2, 'Alpha'), WITH_HF, portraitMargins);
        const afterLandscape = await pdfPages(h, lines(2, 'Alpha'), WITH_HF, landscapeMargins);
        summary.apresPortrait = afterPortrait.sizes;
        summary.apresPaysage = afterLandscape.sizes;
        if (afterPortrait.sizes !== 'P') problems.push('export portrait ordinaire après un export mêlé : ' + afterPortrait.sizes);
        if (afterLandscape.sizes !== 'L') problems.push('export paysage ordinaire après un export mêlé : ' + afterLandscape.sizes);
        problems.push(...sizeProblems(afterPortrait.pages, 'P').map(p => 'après un export mêlé, ' + p));
        problems.push(...sizeProblems(afterLandscape.pages, 'L').map(p => 'après un export mêlé, ' + p));
        // L'export mêlé lui-même, refait : même résultat (rien ne reste d'une passe à l'autre).
        const again = await pdfPages(h, assemble([slot('landscape', lines(2, 'Alpha')), slot('portrait', lines(2, 'Bravo'))]), WITH_HF, portraitMargins);
        if (again.sizes !== 'LP') problems.push('le même export mêlé, refait : ' + again.sizes);
        return verdict(problems, summary);
      },
    },
    {
      id: 'mixed_pdf_a_mixed_macro_exported_in_a_batch_has_the_same_pages',
      description: 'PDF en lot : le PDF d\'une ligne (getNativePdfBlobForRecord, celui que le ZIP de lot range) d\'un macro-modèle aux sens mêlés a les mêmes pages que l\'export d\'une seule ligne : PLP, chacune à sa taille',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const html = assemble([slot('portrait', lines(2, 'Alpha')), slot('landscape', lines(2, 'Bravo')), slot('portrait', lines(2, 'Charlie'))]);
        const { result } = await pdfPages(h, html, WITH_HF);
        if (!result.blob || !result.blob.size) return verdict(['aucun PDF produit'], {});
        const base64 = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.readAsDataURL(result.blob); });
        const gt = await h.extractPdfGroundTruth(base64);
        const sizes = gt.pages.map(page => (page.width > page.height ? 'L' : 'P')).join('');
        if (sizes !== 'PLP') problems.push('le PDF téléchargé (le premier calcul) : ' + sizes + ' au lieu de PLP');
        problems.push(...sizeProblems(gt.pages.map(page => ({ width: page.width, height: page.height })), 'PLP'));
        return verdict(problems, { sens: sizes });
      },
    },

    // ---------- Le Word ----------
    {
      id: 'mixed_docx_one_section_per_run_of_equal_sense_each_with_its_own_page',
      description: 'Word : portrait, portrait, paysage, paysage, portrait : trois sections (la taille et le sens de la page de chacune, les mêmes marges), le saut de page entre deux modèles de même sens reste un saut de page, le saut de section ouvre les autres et leur premier bloc ne porte pas de saut de plus',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const html = assemble([slot('portrait', lines(2, 'Alpha')), slot('portrait', lines(2, 'Bravo')), slot('landscape', lines(2, 'Charlie')), slot('landscape', lines(2, 'Delta')), slot('portrait', lines(2, 'Echo'))]);
        const sections = wordSections(await h.exportDocxParts(html, null, PageLayout.getMarginsTwip()));
        if (sections.length !== 3) { problems.push(sections.length + ' section(s) au lieu de 3'); return verdict(problems, {}); }
        problems.push(...wordSizeProblems(sections, 'PLP'));
        const m = PageLayout.getMarginsTwip();
        const wantMargins = [m.top, m.right, m.bottom, m.left].join(',');
        sections.forEach((section, i) => { if (section.margins.split(',').slice(0, 4).join(',') !== wantMargins) problems.push('section ' + (i + 1) + ' : marges ' + section.margins + ' au lieu de ' + wantMargins); });
        if (new Set(sections.map(section => section.margins)).size !== 1) problems.push('les marges changent d\'une section à l\'autre : ' + sections.map(section => section.margins).join(' | '));
        const texts = sections.map(section => section.blocks.map(wordText).filter(Boolean));
        const want = [['Alpha 0', 'Alpha 1', 'Bravo 0', 'Bravo 1'], ['Charlie 0', 'Charlie 1', 'Delta 0', 'Delta 1'], ['Echo 0', 'Echo 1']];
        texts.forEach((list, i) => { if (list.join('|') !== want[i].join('|')) problems.push('section ' + (i + 1) + ' : « ' + list.join(' | ') + ' » au lieu de « ' + want[i].join(' | ') + ' »'); });
        // Les sauts de page de la section : un seul, devant le deuxième modèle de la suite ; aucun devant le premier bloc d'une section (le saut de section a ouvert sa page).
        const breaks = sections.map(section => section.blocks.filter(wordOpensPage).map(wordText));
        if (JSON.stringify(breaks) !== JSON.stringify([['Bravo 0'], ['Delta 0'], []])) problems.push('sauts de page : ' + JSON.stringify(breaks) + ' au lieu de [["Bravo 0"],["Delta 0"],[]]');
        sections.slice(1).forEach((section, i) => { if (section.blocks[0] && wordOpensPage(section.blocks[0])) problems.push('section ' + (i + 2) + ' : son premier bloc porte un saut de page de plus (une page blanche dans Word)'); });
        return verdict(problems, { sections: sections.map(section => section.width + 'x' + section.height + ' ' + section.orient).join(' ; ') });
      },
    },
    {
      id: 'mixed_docx_tables_and_two_column_zones_take_the_width_of_their_section',
      description: 'Word : un tableau et une zone à deux colonnes ont la largeur utile de LEUR page : 10 786 twips en portrait, 15 718 en paysage (A4, marges de 28 pt)',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const html = assemble([slot('portrait', tableOf('TA') + zoneOf('ZA')), slot('landscape', tableOf('TB') + zoneOf('ZB')), slot('portrait', tableOf('TC') + zoneOf('ZC'))]);
        const sections = wordSections(await h.exportDocxParts(html, null, PageLayout.getMarginsTwip()));
        if (sections.length !== 3) return verdict([sections.length + ' section(s) au lieu de 3'], {});
        const m = PageLayout.getMarginsTwip();
        const summary = {};
        sections.forEach((section, i) => {
          const content = section.width - m.left - m.right;
          const tables = section.blocks.filter(node => node.nodeName === 'w:tbl');
          const widths = tables.map(wordGridWidth);
          summary['section ' + (i + 1)] = widths.join(' / ') + ' (utile ' + content + ')';
          if (tables.length !== 2) problems.push('section ' + (i + 1) + ' : ' + tables.length + ' tableau(x) (le tableau et la zone attendus)');
          widths.forEach(width => { if (Math.abs(width - content) > 30) problems.push('section ' + (i + 1) + ' : un tableau de ' + width + ' twips dans une page utile de ' + content); });
        });
        return verdict(problems, summary);
      },
    },
    {
      id: 'mixed_docx_headers_and_footers_are_built_for_each_section_and_the_first_page_stays_the_documents',
      description: 'Word : chaque section a son en-tête (un tableau de deux cases) et son pied bâtis dans la largeur de sa page ; « première page différente » ne vaut que pour la première section (les autres n\'ont que l\'en-tête ordinaire) ; le pied garde ses champs PAGE et NUMPAGES, qui continuent d\'une section à l\'autre',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const hf = {
          enabled: true, differentFirstPage: true,
          header: { default: '<table><tbody><tr><td><p>GAUCHE</p></td><td><p>DROITE</p></td></tr></tbody></table>', first: '<p>PREMIERE</p>' },
          footer: { default: '<p>PIED <span class="page-number-badge" data-format="n-slash-total">#</span></p>', first: '' },
        };
        const html = assemble([slot('portrait', lines(2, 'Alpha')), slot('landscape', lines(2, 'Bravo')), slot('portrait', lines(2, 'Charlie'))]);
        const parts = await h.exportDocxParts(html, hf, PageLayout.getMarginsTwip());
        const sections = wordSections(parts);
        if (sections.length !== 3) return verdict([sections.length + ' section(s) au lieu de 3'], {});
        const m = PageLayout.getMarginsTwip();
        const titlePgs = sections.map(section => section.titlePg).join();
        if (titlePgs !== 'true,false,false') problems.push('« première page différente » par section : ' + titlePgs + ' au lieu de true,false,false');
        const headerTypes = sections.map(section => Object.keys(section.headers).sort().join('+'));
        if (headerTypes.join(' ') !== 'default+first default default') problems.push('en-têtes déclarés par section : ' + headerTypes.join(' ') + ' au lieu de « default+first default default »');
        const files = sections.map(section => section.headers.default);
        if (new Set(files).size !== 3) problems.push('les sections se partagent un fichier d\'en-tête : ' + files.join(' '));
        const summary = {};
        sections.forEach((section, i) => {
          const content = section.width - m.left - m.right;
          const header = section.headers.default && parts.part(section.headers.default);
          const table = header && header.getElementsByTagName('w:tbl')[0];
          if (!table) { problems.push('section ' + (i + 1) + ' : pas de tableau dans son en-tête'); return; }
          summary['en-tête ' + (i + 1)] = wordGridWidth(table) + ' (utile ' + content + ')';
          if (Math.abs(wordGridWidth(table) - content) > 30) problems.push('section ' + (i + 1) + ' : l\'en-tête fait ' + wordGridWidth(table) + ' twips dans une page utile de ' + content);
          const footer = section.footers.default && parts.part(section.footers.default);
          const fields = footer ? h.docxFields(footer).join(' ') : '';
          if (!/PAGE/.test(fields) || !/NUMPAGES/.test(fields)) problems.push('section ' + (i + 1) + ' : champs du pied « ' + fields + ' »');
        });
        return verdict(problems, summary);
      },
    },
    {
      id: 'mixed_docx_table_of_contents_and_numbered_headings_cover_every_section',
      description: 'Word : le sommaire du premier modèle liste les titres des trois sections (une entrée par titre) et la numérotation des titres continue d\'une section à l\'autre (1), 2), 3))',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const heading = tag => '<h1>' + tag + 'titre</h1><p>' + tag + ' texte.</p>';
        const html = assemble([slot('portrait', '<div class="heading-numbering-config" data-style="numeric"></div><div class="toc-marker"></div>' + heading('Alpha')), slot('landscape', heading('Bravo')), slot('portrait', heading('Charlie'))]);
        const parts = await h.exportDocxParts(html, null, PageLayout.getMarginsTwip());
        const sections = wordSections(parts);
        if (sections.length !== 3) problems.push(sections.length + ' section(s) au lieu de 3');
        const paragraphs = h.docxParagraphs(parts.doc);
        const headings = paragraphs.filter(p => /^Heading/i.test(p.style || '')).map(p => p.text);
        if (headings.join('|') !== '1) Alphatitre|2) Bravotitre|3) Charlietitre') problems.push('titres : « ' + headings.join(' | ') + ' »');
        const entries = paragraphs.filter(p => /^TOC\d$/.test(p.style || '')).map(p => p.text);
        if (entries.join('|') !== '1) Alphatitre|2) Bravotitre|3) Charlietitre') problems.push('entrées du sommaire : « ' + entries.join(' | ') + ' »');
        return verdict(problems, { titres: headings, sommaire: entries });
      },
    },
    {
      id: 'mixed_docx_a_template_that_starts_with_a_page_break_keeps_its_blank_page_and_an_empty_template_keeps_its_page',
      description: 'Word : un modèle paysage qui COMMENCE par un saut de page garde sa page blanche (un paragraphe d\'un point sans saut, puis le texte avec son saut : « deux sauts de suite laissent une page blanche ») ; un modèle paysage vide au milieu garde une section de sa page ; un dernier modèle vide n\'ouvre aucune section',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const manual = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
        const started = wordSections(await h.exportDocxParts(assemble([slot('portrait', lines(2, 'Alpha')), slot('landscape', manual + lines(2, 'Bravo'))]), null, PageLayout.getMarginsTwip()));
        if (started.length !== 2) problems.push('modèle qui commence par un saut : ' + started.length + ' section(s) au lieu de 2');
        else {
          const blocks = started[1].blocks;
          if (!(blocks.length >= 2 && !wordText(blocks[0]) && !wordOpensPage(blocks[0]) && wordText(blocks[1]) === 'Bravo 0' && wordOpensPage(blocks[1]))) problems.push('section paysage : blocs ' + JSON.stringify(blocks.map(node => (wordOpensPage(node) ? '^' : '') + wordText(node))) + ' (un paragraphe vide sans saut, puis « Bravo 0 » avec son saut attendus)');
        }
        const middle = wordSections(await h.exportDocxParts(assemble([slot('portrait', lines(2, 'Alpha')), slot('landscape', ''), slot('portrait', lines(2, 'Charlie'))]), null, PageLayout.getMarginsTwip()));
        if (middle.length !== 3) problems.push('modèle vide au milieu : ' + middle.length + ' section(s) au lieu de 3');
        else {
          problems.push(...wordSizeProblems(middle, 'PLP'));
          if (middle[1].blocks.some(node => wordText(node))) problems.push('la section du modèle vide n\'est pas vide : ' + middle[1].blocks.map(wordText).join('|'));
        }
        const last = wordSections(await h.exportDocxParts(assemble([slot('portrait', lines(2, 'Alpha')), slot('landscape', '')]), null, PageLayout.getMarginsTwip()));
        if (last.length !== 1) problems.push('dernier modèle vide : ' + last.length + ' section(s) au lieu de 1');
        return verdict(problems, { commence: started.length, milieu: middle.length, fin: last.length });
      },
    },
    {
      id: 'mixed_docx_repeated_layer_images_stay_with_their_section',
      description: 'Word : l\'image « Sur toutes les pages » d\'un modèle paysage est ancrée dans l\'en-tête de SA section seulement (ni dans celui des sections portrait, qui ne reprennent pas l\'en-tête de la précédente), et le filigrane est ancré dans l\'en-tête de chaque section',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const repeated = '<p><img class="editor-image" src="' + PNG + '" alt="" style="width: 40px; height: 40px;" data-layer="behind" data-repeat="true" data-page-index="0" data-page-left-pt="50" data-page-top-pt="50"></p>';
        const withWatermark = Object.assign({}, PageLayout.getMarginsTwip(), { watermark: { text: 'CONFIDENTIEL' } });
        const html = assemble([slot('portrait', lines(2, 'Alpha')), slot('landscape', lines(2, 'Bravo') + repeated), slot('portrait', lines(2, 'Charlie'))]);
        const anchors = (parts, section) => { const header = section.headers.default && parts.part(section.headers.default); return header ? h.docxDrawings(header).filter(d => d.kind === 'anchor').length : 0; };
        const partsPlain = await h.exportDocxParts(html, null, PageLayout.getMarginsTwip());
        const sectionsPlain = wordSections(partsPlain);
        const counts = sectionsPlain.map(section => anchors(partsPlain, section));
        if (counts.join() !== '0,1,0') problems.push('ancres de l\'en-tête par section : ' + counts.join() + ' au lieu de 0,1,0 (l\'image répétée est dans l\'en-tête de la section paysage seulement)');
        const partsMark = await h.exportDocxParts(html, null, withWatermark);
        const sectionsMark = wordSections(partsMark);
        const marked = sectionsMark.map(section => anchors(partsMark, section));
        if (marked.join() !== '1,2,1') problems.push('avec un filigrane : ' + marked.join() + ' au lieu de 1,2,1 (le filigrane dans chaque section, plus l\'image répétée dans la section paysage)');
        return verdict(problems, { sansFiligrane: counts.join(), avecFiligrane: marked.join() });
      },
    },
    {
      id: 'mixed_docx_nothing_changes_without_markers_and_nothing_leaks_between_exports',
      description: 'Word : un macro-modèle au sens imposé (des sauts de page de modèle SANS repère de sens) reste UNE section dans le sens des marges, portrait comme paysage, avec le saut de page de chaque modèle ; et après un export aux sens mêlés, un export ordinaire retrouve le sens de ses marges',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const summary = {};
        const imposed = n => '<div class="page-break-marker" contenteditable="false" data-macro-slot="' + n + '">Saut de page</div>';
        const imposedDoc = lines(2, 'Alpha') + imposed(1) + lines(2, 'Bravo') + imposed(2) + lines(2, 'Charlie');
        const portraitTwip = PageLayout.getMarginsTwip();
        const landscapeTwip = Object.assign({}, portraitTwip, { orientation: 'landscape' });
        for (const [label, margins, want] of [['imposé portrait', portraitTwip, 'P'], ['imposé paysage', landscapeTwip, 'L']]) {
          const sections = wordSections(await h.exportDocxParts(imposedDoc, null, margins));
          summary[label] = sections.length + ' section(s)';
          if (sections.length !== 1) problems.push(label + ' : ' + sections.length + ' section(s) au lieu d\'une');
          else {
            problems.push(...wordSizeProblems(sections, want).map(p => label + ', ' + p));
            const breaks = sections[0].blocks.filter(wordOpensPage).map(wordText);
            if (breaks.join('|') !== 'Bravo 0|Charlie 0') problems.push(label + ' : sauts de page devant « ' + breaks.join(' | ') + ' » au lieu de « Bravo 0 | Charlie 0 »');
          }
        }
        const mixed = wordSections(await h.exportDocxParts(assemble([slot('landscape', lines(2, 'Alpha')), slot('portrait', lines(2, 'Bravo'))]), null, portraitTwip));
        summary.mele = mixed.map(section => section.orient).join(' ');
        if (mixed.map(section => section.orient).join(' ') !== 'landscape portrait') problems.push('aux sens mêlés : ' + summary.mele);
        const afterPortrait = wordSections(await h.exportDocxParts(lines(2, 'Alpha'), null, portraitTwip));
        const afterLandscape = wordSections(await h.exportDocxParts(lines(2, 'Alpha'), null, landscapeTwip));
        if (afterPortrait.length !== 1 || wordSizeProblems(afterPortrait, 'P').length) problems.push('export portrait ordinaire après un export mêlé : ' + JSON.stringify(afterPortrait.map(section => [section.width, section.height, section.orient])));
        if (afterLandscape.length !== 1 || wordSizeProblems(afterLandscape, 'L').length) problems.push('export paysage ordinaire après un export mêlé : ' + JSON.stringify(afterLandscape.map(section => [section.width, section.height, section.orient])));
        return verdict(problems, summary);
      },
    },

    // ---------- La Lecture ----------
    {
      id: 'mixed_reader_each_section_is_a_stack_of_sheets_of_its_own_sense',
      description: 'Lecture : portrait, paysage, portrait, paysage dans un macro-modèle aux sens mêlés : quatre feuilles de lecture, chacune de la largeur de son sens (A4 : 793,71 et 1 122,52 px) et de la hauteur de sa page, le texte de chaque modèle sur la sienne, sans saut de page de modèle en haut d\'une section, séparées par une gouttière « Page N » qui continue ; la page du document n\'a pas bougé',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const rootWidth = document.documentElement.style.getPropertyValue('--pp-page-width');
        const html = assemble([slot('portrait', lines(3, 'Alpha')), slot('landscape', lines(3, 'Bravo')), slot('portrait', lines(3, 'Charlie')), slot('landscape', lines(3, 'Delta'))]);
        const { box, sheets, senses, pages } = await readSheets(h, html);
        if (senses !== 'PLPL') problems.push('sens des feuilles : ' + senses + ' au lieu de PLPL');
        problems.push(...sheetProblems(sheets, 'PLPL'));
        if (pages !== '1,1,1,1') problems.push('pages par feuille : ' + pages + ' au lieu de 1,1,1,1');
        const tags = ['Alpha', 'Bravo', 'Charlie', 'Delta'];
        sheets.forEach((sheet, i) => {
          if (sheet.rank !== String(i)) problems.push('feuille ' + (i + 1) + ' : rang ' + sheet.rank);
          const text = sheet.el.textContent;
          tags.forEach((tag, t) => { if (text.includes(tag) !== (t === i)) problems.push('feuille ' + (i + 1) + ' : le texte « ' + tag + ' » ' + (t === i ? 'manque' : 'est de trop')); });
          if (sheet.el.firstElementChild && sheet.el.firstElementChild.classList.contains('page-break-marker')) problems.push('feuille ' + (i + 1) + ' : elle commence par le saut de page du modèle');
          if (i && sheet.top < sheets[i - 1].bottom - 0.5) problems.push('feuille ' + (i + 1) + ' : elle recouvre la précédente');
        });
        if (box.querySelectorAll(':scope > .v2-reader-gutter').length !== 3) problems.push('gouttières entre les sections : ' + box.querySelectorAll(':scope > .v2-reader-gutter').length + ' au lieu de 3');
        const labels = bandTexts(box, '.v2-page-break-label');
        if (labels.join('|') !== 'Page 2|Page 3|Page 4') problems.push('repères de page : ' + labels.join('|') + ' au lieu de Page 2|Page 3|Page 4');
        if (box.querySelector('.page-section-start')) problems.push('le repère de départ reste dans la Lecture');
        // Le sens passé à chaque section n'a servi que le temps de sa mise en page : la page du document est restée la sienne.
        if (PageLayout.getMarginsMm().orientation !== 'portrait') problems.push('la page du document est restée en ' + PageLayout.getMarginsMm().orientation);
        if (document.documentElement.style.getPropertyValue('--pp-page-width') !== rootWidth) problems.push('--pp-page-width de la racine : ' + document.documentElement.style.getPropertyValue('--pp-page-width') + ' au lieu de ' + rootWidth);
        return verdict(problems, { sens: senses, pages, reperes: labels });
      },
    },
    {
      id: 'mixed_reader_pages_are_numbered_from_end_to_end_in_headers_and_footers',
      description: 'Lecture : portrait (1 page), paysage (plusieurs pages), portrait, avec en-tête et pied : les numéros de page et le total continuent d\'une section à l\'autre (« n/total »), la première page différente reste celle du DOCUMENT (la première page de la deuxième section a l\'en-tête ordinaire), le pied de la dernière page de chaque section est dans sa feuille',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const html = assemble([slot('portrait', lines(3, 'Alpha')), slot('landscape', lines(80, 'Bravo')), slot('portrait', lines(3, 'Charlie'))]);
        const { box, sheets, senses, pages } = await readSheets(h, html, NUMBERED_HF);
        if (senses !== 'PLP') problems.push('sens des feuilles : ' + senses + ' au lieu de PLP');
        const counts = sheets.map(sheet => sheet.pages);
        const total = counts.reduce((sum, n) => sum + n, 0);
        if (counts.length !== 3 || counts[0] !== 1 || counts[1] < 2 || counts[2] !== 1) problems.push('pages par feuille : ' + pages + ' (1, 2 ou plus, 1 attendues)');
        const headers = bandTexts(box, '.v2-page-edge-top, .v2-page-band-header');
        const footers = bandTexts(box, '.v2-page-edge-bottom, .v2-page-band-footer');
        const wantHeaders = ['PREMIERE'].concat(Array.from({ length: total - 1 }, (_, i) => 'EN-TETE ' + (i + 2)));
        const wantFooters = ['PREMIER-PIED 1/' + total].concat(Array.from({ length: total - 1 }, (_, i) => 'PIED ' + (i + 2) + '/' + total));
        if (headers.join('|') !== wantHeaders.join('|')) problems.push('en-têtes : ' + headers.join('|') + ' au lieu de ' + wantHeaders.join('|'));
        if (footers.join('|') !== wantFooters.join('|')) problems.push('pieds : ' + footers.join('|') + ' au lieu de ' + wantFooters.join('|'));
        return verdict(problems, { pages, total, entetes: headers, pieds: footers });
      },
    },
    {
      id: 'mixed_reader_a_section_is_laid_out_like_the_same_template_alone_in_its_sense',
      description: 'Lecture : un modèle paysage de plusieurs pages entre deux portraits est coupé comme le même modèle dans un macro-modèle imposé en paysage : même nombre de pages, même hauteur de feuille (la hauteur utile d\'une page paysage, pas portrait)',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const long = lines(80, 'Bravo');
        const mixed = await readSheets(h, assemble([slot('portrait', lines(3, 'Alpha')), slot('landscape', long), slot('portrait', lines(3, 'Charlie'))]));
        PageLayout.setMarginsMm(Object.assign({}, PageLayout.getMarginsMm(), { orientation: 'landscape' }));
        const alone = await readSheets(h, long);
        await plainPage(h);
        const portraitAlone = await readSheets(h, long);
        if (alone.sheets.length !== 1 || alone.senses !== 'L') problems.push('le modèle seul en paysage : ' + alone.senses + ' (' + alone.sheets.length + ' feuille(s))');
        else if (mixed.sheets.length !== 3) problems.push('feuilles du macro-modèle : ' + mixed.sheets.length + ' au lieu de 3');
        else {
          const section = mixed.sheets[1];
          if (section.pages !== alone.sheets[0].pages) problems.push('pages : ' + section.pages + ' dans le macro-modèle contre ' + alone.sheets[0].pages + ' pour le modèle seul en paysage');
          if (!near(section.height, alone.sheets[0].height, 2)) problems.push('hauteur : ' + section.height.toFixed(1) + ' px contre ' + alone.sheets[0].height.toFixed(1));
          if (!(section.pages > portraitAlone.sheets[0].pages)) problems.push('une page paysage (' + section.pages + ' pages) devrait en demander plus qu\'une page portrait (' + portraitAlone.sheets[0].pages + ' pages)');
        }
        return verdict(problems, { macro: mixed.pages, seulEnPaysage: alone.pages, seulEnPortrait: portraitAlone.pages });
      },
    },
    {
      id: 'mixed_reader_the_zoom_fits_the_widest_sheet',
      description: 'Lecture : dans un panneau étroit (700 px), le facteur d\'ajustement est pris sur la feuille la plus large du document (le paysage, 1 122,52 px) : aucune feuille ne déborde du panneau ; un document sans section paysage retrouve le facteur du portrait',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const box = readerBox();
        const saved = { width: box.style.width, flex: box.style.flex, overflowY: box.style.overflowY };
        box.style.width = '700px'; box.style.flex = 'none'; box.style.overflowY = 'scroll';
        const summary = {};
        try {
          const cs = getComputedStyle(box);
          const available = () => box.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
          const factor = () => parseFloat(box.style.getPropertyValue('--pp-fit-zoom'));
          const mixed = await readSheets(h, assemble([slot('portrait', lines(3, 'Alpha')), slot('landscape', lines(3, 'Bravo'))]));
          const wantMixed = Math.max(0.5, Math.min(1, available() / SHEET_PX.L));
          summary.mele = { facteur: factor(), attendu: wantMixed, plusLarge: box.getAttribute('data-pp-widest-sheet') };
          if (mixed.senses !== 'PL') problems.push('sens des feuilles : ' + mixed.senses);
          if (!near(factor(), wantMixed, 0.004)) problems.push('facteur aux sens mêlés : ' + factor() + ' au lieu de ' + wantMixed.toFixed(3) + ' (la feuille paysage tient dans ' + available() + ' px)');
          const outside = mixed.sheets.filter(sheet => sheet.el.getBoundingClientRect().right > box.getBoundingClientRect().right + 1);
          if (outside.length || box.scrollWidth > box.clientWidth + 1) problems.push('une feuille déborde du panneau (défilement horizontal de ' + (box.scrollWidth - box.clientWidth) + ' px)');
          const portrait = await readSheets(h, lines(3, 'Alpha'));
          const wantPortrait = Math.max(0.5, Math.min(1, available() / SHEET_PX.P));
          summary.portrait = { facteur: factor(), attendu: wantPortrait, plusLarge: box.getAttribute('data-pp-widest-sheet') };
          if (portrait.sheets.length !== 1) problems.push('document ordinaire : ' + portrait.sheets.length + ' feuilles');
          if (!near(factor(), wantPortrait, 0.004)) problems.push('facteur d\'un document ordinaire après un document mêlé : ' + factor() + ' au lieu de ' + wantPortrait.toFixed(3));
          if (box.hasAttribute('data-pp-widest-sheet')) problems.push('la feuille la plus large d\'un document mêlé reste posée sur un document ordinaire');
        } finally {
          box.style.width = saved.width; box.style.flex = saved.flex; box.style.overflowY = saved.overflowY;
          box.removeAttribute('data-pp-widest-sheet');
          box.style.removeProperty('--pp-fit-zoom');
        }
        return verdict(problems, summary);
      },
    },
    {
      id: 'mixed_reader_a_document_without_a_turning_section_keeps_its_single_sheet',
      description: 'Lecture : un document ordinaire, un macro-modèle dont tous les modèles ont le sens des marges (repères de sens présents), et un macro-modèle imposé en paysage gardent leur unique feuille de lecture, sans rang, sans largeur en ligne, sans gouttière, sans repère de départ : exactement la Lecture d\'avant',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const check = (label, read, senses, pages) => {
          if (read.sheets.length !== 1) { problems.push(label + ' : ' + read.sheets.length + ' feuilles au lieu d\'une'); return; }
          const sheet = read.sheets[0];
          if (sheet.rank !== null) problems.push(label + ' : la feuille porte un rang (' + sheet.rank + ')');
          if (sheet.el.style.getPropertyValue('--pp-page-width')) problems.push(label + ' : la feuille porte une largeur en ligne');
          if (read.box.querySelector('.v2-reader-gutter')) problems.push(label + ' : une gouttière entre sections');
          if (read.box.querySelector('.page-section-start')) problems.push(label + ' : le repère de départ reste');
          if (read.box.hasAttribute('data-pp-widest-sheet')) problems.push(label + ' : feuille la plus large posée');
          if (read.senses !== senses) problems.push(label + ' : sens ' + read.senses + ' au lieu de ' + senses);
          if (read.pages !== pages) problems.push(label + ' : pages ' + read.pages + ' au lieu de ' + pages);
        };
        check('document ordinaire', await readSheets(h, lines(3, 'Alpha')), 'P', '1');
        const allPortrait = await readSheets(h, assemble([slot('portrait', lines(3, 'Alpha')), slot('portrait', lines(3, 'Bravo'))]));
        check('macro-modèle tout portrait', allPortrait, 'P', '2');
        if (allPortrait.box.querySelectorAll('.page-break-marker[data-macro-slot]').length !== 1) problems.push('macro-modèle tout portrait : le saut de page du deuxième modèle manque');
        PageLayout.setMarginsMm(Object.assign({}, PageLayout.getMarginsMm(), { orientation: 'landscape' }));
        check('macro-modèle tout paysage', await readSheets(h, assemble([slot('landscape', lines(3, 'Alpha')), slot('landscape', lines(3, 'Bravo'))])), 'L', '2');
        await plainPage(h);
        return verdict(problems, {});
      },
    },
    {
      id: 'mixed_reader_titles_and_notes_keep_counting_across_sections',
      description: 'Lecture : la numérotation des titres et des notes de bas de page continue d\'une section à l\'autre (un compteur CSS ne passe que d\'un frère à l\'autre, et les titres sont numérotés par `counter-reset`/`counter-increment` sur `.reader-content`) : chaque section repart des valeurs où la précédente s\'est arrêtée, la numérotation choisie reste celle de toutes',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const config = '<div class="heading-numbering-config" data-style="numeric"></div>';
        const note = '<p>Texte<sup class="footnote-ref-marker"></sup> et<sup class="footnote-ref-marker"></sup></p>';
        const html = assemble([
          slot('portrait', config + '<h1>Un</h1><h2>Un-a</h2><h2>Un-b</h2>' + note),
          slot('landscape', '<h2>Deux-a</h2><h3>Deux-a-i</h3>' + note),
          slot('portrait', '<h1>Trois</h1>'),
        ]);
        const { sheets } = await readSheets(h, html);
        if (sheets.length !== 3) problems.push('feuilles : ' + sheets.length + ' au lieu de 3');
        else {
          const resets = sheets.map(sheet => sheet.el.style.counterReset);
          if (resets[0]) problems.push('la première section pose ses compteurs en ligne : « ' + resets[0] + ' »');
          if (resets[1] !== 'h1c 1 h2c 2 h3c 0 h4c 0 h5c 0 h6c 0 footnote-ref 2') problems.push('deuxième section : « ' + resets[1] + ' » au lieu de « h1c 1 h2c 2 h3c 0 h4c 0 h5c 0 h6c 0 footnote-ref 2 »');
          if (resets[2] !== 'h1c 1 h2c 3 h3c 1 h4c 0 h5c 0 h6c 0 footnote-ref 4') problems.push('troisième section : « ' + resets[2] + ' » au lieu de « h1c 1 h2c 3 h3c 1 h4c 0 h5c 0 h6c 0 footnote-ref 4 »');
          sheets.forEach((sheet, i) => { if (sheet.el.dataset.headingStyle !== 'numeric') problems.push('feuille ' + (i + 1) + ' : numérotation « ' + sheet.el.dataset.headingStyle + ' » au lieu de numeric'); });
          const computed = sheets.map(sheet => getComputedStyle(sheet.el).counterReset);
          if (!/h1c 1/.test(computed[1])) problems.push('le compteur posé en ligne n\'est pas celui de la feuille : « ' + computed[1] + ' »');
        }
        return verdict(problems, {});
      },
    },
    {
      id: 'mixed_reader_watermark_is_painted_at_the_size_of_each_sheet',
      description: 'Lecture : le filigrane est peint sur chaque page à la taille de la page de sa section (portrait, paysage, portrait : 793,71 x 1 122,52, puis 1 122,52 x 793,71, puis la première)',
      async run(h) {
        const problems = [];
        await plainPage(h);
        PageLayout.setMarginsMm(Object.assign({}, PageLayout.getMarginsMm(), { watermark: { text: 'CONFIDENTIEL' } }));
        const { box, sheets, senses } = await readSheets(h, assemble([slot('portrait', lines(3, 'Alpha')), slot('landscape', lines(3, 'Bravo')), slot('portrait', lines(3, 'Charlie'))]));
        const boxes = Array.from(box.querySelectorAll('.v2-page-layer-page')).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
        const sizes = boxes.map(el => (parseFloat(el.style.width) > 1000 ? 'L' : 'P')).join('');
        if (senses !== 'PLP') problems.push('sens des feuilles : ' + senses);
        if (sizes !== 'PLP') problems.push('pages du filigrane : ' + sizes + ' au lieu de PLP');
        boxes.forEach((el, i) => {
          const sense = 'PLP'[i];
          if (!sense) return;
          if (!near(parseFloat(el.style.width), SHEET_PX[sense], 1.5) || !near(parseFloat(el.style.height), SHEET_HEIGHT_PX[sense], 2)) problems.push('page ' + (i + 1) + ' du filigrane : ' + el.style.width + ' x ' + el.style.height + ' au lieu de ' + SHEET_PX[sense] + ' x ' + SHEET_HEIGHT_PX[sense]);
          if (!el.querySelector('.v2-page-watermark')) problems.push('page ' + (i + 1) + ' : pas de filigrane');
        });
        await plainPage(h);
        return verdict(problems, { tailles: sizes, feuilles: sheets.length });
      },
    },
    {
      id: 'mixed_reader_an_empty_first_template_keeps_its_page_in_every_output',
      description: 'Lecture et PDF : un premier modèle vide (portrait) devant un modèle paysage puis un portrait : la première page existe (blanche), comme pour un macro-modèle ordinaire (le repère de départ n\'est pas un bloc : la ligne vide du premier modèle reste)',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const html = assemble([slot('portrait', '<p></p>'), slot('landscape', lines(3, 'Bravo')), slot('portrait', lines(3, 'Charlie'))]);
        const { sheets, senses } = await readSheets(h, html);
        if (senses !== 'PLP') problems.push('Lecture : sens des feuilles ' + senses + ' au lieu de PLP');
        else if (!sheets[0].el.querySelector('p')) problems.push('Lecture : le premier modèle vide a perdu sa ligne');
        const { pages, sizes } = await pdfPages(h, html, NO_HF);
        if (sizes !== 'PLP') problems.push('PDF : sens des pages ' + sizes + ' au lieu de PLP');
        else if (bodyWords(pages[0]).length) problems.push('PDF : la première page, vide, porte du texte : ' + bodyWords(pages[0]).join(' '));
        return verdict(problems, { lecture: senses, pdf: sizes });
      },
    },

    // ---------- L'impression par le navigateur ----------
    {
      id: 'mixed_print_each_sheet_has_the_size_and_the_name_of_its_page',
      description: 'Impression navigateur : portrait, paysage, portrait : une feuille par page de la Lecture, de la taille exacte de SA page (793,71 x 1 122,52 puis 1 122,52 x 793,71 px), posée dans un bloc qui porte le nom de sa page (`page: pp-portrait` / `pp-landscape`), des règles `@page` nommées à la taille de chaque sens (en millimètres) et celle des marges par défaut ; le texte de chaque modèle sur la feuille de son sens, à la marge gauche de SA feuille (la feuille portrait, plus étroite que la pile, est centrée dans la largeur du paysage)',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const summary = {};
        const margin = PageLayout.getMarginsPx();
        const job = await printJob(assemble([slot('portrait', lines(3, 'Alpha')), slot('landscape', lines(3, 'Bravo')), slot('portrait', lines(3, 'Charlie'))]), NO_HF);
        try {
          const doc = job.frame.contentDocument;
          const sheets = printSheets(job);
          const senses = sheets.map(printSense).join('');
          summary.sens = senses; summary.feuilles = job.pageCount;
          if (senses !== 'PLP') problems.push('sens des feuilles : ' + senses + ' au lieu de PLP');
          if (job.pageCount !== sheets.length) problems.push('pageCount ' + job.pageCount + ' pour ' + sheets.length + ' feuilles');
          sheets.forEach((sheet, i) => {
            const want = 'PLP'[i];
            if (!want) return;
            const rect = sheet.getBoundingClientRect();
            if (!near(rect.width, SHEET_PX[want], 0.05) || !near(rect.height, SHEET_HEIGHT_PX[want], 0.05)) problems.push('feuille ' + (i + 1) + ' : ' + rect.width.toFixed(2) + ' x ' + rect.height.toFixed(2) + ' px au lieu de ' + SHEET_PX[want] + ' x ' + SHEET_HEIGHT_PX[want]);
            const holder = sheet.parentElement;
            const name = want === 'L' ? 'pp-landscape' : 'pp-portrait';
            if (!holder.classList.contains('pp-print-page') || !holder.classList.contains(want === 'L' ? 'pp-print-landscape' : 'pp-print-portrait')) problems.push('feuille ' + (i + 1) + ' : le bloc qui porte le nom de la page est « ' + holder.className + ' »');
            else if (getComputedStyle(holder).getPropertyValue('page') !== name) problems.push('feuille ' + (i + 1) + ' : `page` vaut « ' + getComputedStyle(holder).getPropertyValue('page') + ' » au lieu de « ' + name + ' »');
            const boxes = sheetText(sheet).filter(box => /^(Alpha|Bravo|Charlie) \d/.test(box.text));
            const tags = ['Alpha', 'Bravo', 'Charlie'];
            tags.forEach((tag, t) => { const count = boxes.filter(box => box.text.indexOf(tag) === 0).length; if (count !== (t === i ? 3 : 0)) problems.push('feuille ' + (i + 1) + ' : ' + count + ' ligne(s) « ' + tag + ' » au lieu de ' + (t === i ? 3 : 0)); });
            const leftmost = boxes.reduce((min, box) => Math.min(min, box.left), Infinity);
            if (!near(leftmost, margin.left, 0.6)) problems.push('feuille ' + (i + 1) + ' : le texte commence à ' + leftmost.toFixed(2) + ' px du bord au lieu de ' + margin.left.toFixed(2));
            const win = job.windows[i];
            if (!win || !win.sheet || win.sheet.orientation !== (want === 'L' ? 'landscape' : 'portrait')) problems.push('fenêtre ' + (i + 1) + ' : sens ' + (win && win.sheet ? win.sheet.orientation : 'absent'));
          });
          const rule = (doc.getElementById('pp-print-page') || { textContent: '' }).textContent;
          summary.regle = rule;
          Object.keys(PRINT_PAGE_RULES).forEach(key => { if (rule.indexOf(PRINT_PAGE_RULES[key]) === -1) problems.push('règle « ' + key + ' » absente : ' + rule); });
          if (!near(job.frame.getBoundingClientRect().width, SHEET_PX.L, 1.1)) problems.push('le cadre est large de ' + job.frame.getBoundingClientRect().width + ' px : la feuille paysage n\'y tient pas');
          if (job.pageMm.width !== 210 || job.pageMm.height !== 297) problems.push('pageMm : ' + job.pageMm.width + ' x ' + job.pageMm.height);
        } finally { job.dispose(); }
        // Un document qui commence en paysage : la règle `@page` du départ est la sienne.
        const landscapeFirst = await printJob(assemble([slot('landscape', lines(3, 'Alpha')), slot('portrait', lines(3, 'Bravo'))]));
        try {
          const rule = landscapeFirst.frame.contentDocument.getElementById('pp-print-page').textContent;
          summary.paysageDabord = printSheets(landscapeFirst).map(printSense).join('');
          if (summary.paysageDabord !== 'LP') problems.push('document qui commence en paysage : ' + summary.paysageDabord);
          if (rule.indexOf('@page { size: 297mm 210mm; margin: 0; }') !== 0) problems.push('la règle de départ d\'un document qui commence en paysage : ' + rule);
          if (landscapeFirst.pageMm.width !== 297) problems.push('pageMm d\'un document qui commence en paysage : ' + landscapeFirst.pageMm.width + ' x ' + landscapeFirst.pageMm.height);
        } finally { landscapeFirst.dispose(); }
        return verdict(problems, summary);
      },
    },
    {
      id: 'mixed_print_pages_are_numbered_from_end_to_end_and_laid_out_like_the_reading',
      description: 'Impression navigateur : portrait (1 page), paysage (plusieurs pages), portrait, avec en-tête et pied numérotés : autant de feuilles que de pages de la Lecture, les numéros de page et le total continuent d\'une section à l\'autre sur chaque feuille (« première page différente » : celle du DOCUMENT), chaque ligne de texte au même endroit de sa page (0,05 px) que dans la Lecture',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const html = assemble([slot('portrait', lines(3, 'Alpha')), slot('landscape', lines(80, 'Bravo')), slot('portrait', lines(3, 'Charlie'))]);
        const reading = await readSheets(h, html, NUMBERED_HF);
        const readingPages = reading.sheets.reduce((sum, sheet) => sum + sheet.pages, 0);
        // Les lignes de chaque page de la Lecture, depuis le coin de SA feuille : le haut de la page (une couture par frontière) et le bord gauche de la section.
        const readerLines = [];
        reading.sheets.forEach(sheet => {
          const zoom = EditorCore.layoutZoom(sheet.el);
          const content = sheet.el.getBoundingClientRect();
          const range = document.createRange();
          const walker = document.createTreeWalker(sheet.el, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (!/^(Alpha|Bravo|Charlie) \d/.test(node.nodeValue.trim())) continue;
            range.selectNodeContents(node);
            const r = range.getClientRects()[0];
            readerLines.push({ text: node.nodeValue.trim(), left: (r.left - content.left) / zoom, width: r.width / zoom, height: r.height / zoom });
          }
        });
        const job = await printJob(html, NUMBERED_HF);
        const summary = { pagesLecture: readingPages };
        try {
          const sheets = printSheets(job);
          summary.feuilles = sheets.length;
          if (sheets.length !== readingPages) problems.push('feuilles : ' + sheets.length + ' pour ' + readingPages + ' pages de la Lecture');
          const total = sheets.length;
          const footers = []; const headers = [];
          const printed = [];
          sheets.forEach((sheet, i) => {
            const boxes = sheetText(sheet);
            const text = textOf(boxes);
            const footer = /(PREMIER-PIED|PIED) (\d+)\/(\d+)/.exec(text);
            const header = /(PREMIERE|EN-TETE (\d+))/.exec(text);
            footers.push(footer ? footer[0] : 'aucun'); headers.push(header ? header[0] : 'aucun');
            boxes.filter(box => /^(Alpha|Bravo|Charlie) \d/.test(box.text)).forEach(box => printed.push(box));
          });
          const wantFooters = ['PREMIER-PIED 1/' + total].concat(Array.from({ length: total - 1 }, (_, i) => 'PIED ' + (i + 2) + '/' + total));
          const wantHeaders = ['PREMIERE'].concat(Array.from({ length: total - 1 }, (_, i) => 'EN-TETE ' + (i + 2)));
          if (footers.join('|') !== wantFooters.join('|')) problems.push('pieds : ' + footers.join('|') + ' au lieu de ' + wantFooters.join('|'));
          if (headers.join('|') !== wantHeaders.join('|')) problems.push('en-têtes : ' + headers.join('|') + ' au lieu de ' + wantHeaders.join('|'));
          // Les lignes : la même ligne, dans le même ordre, avec la même largeur et la même hauteur ; le bord gauche à la marge de SA feuille (celui de la Lecture est depuis le bord de la section).
          if (printed.length !== readerLines.length) problems.push('lignes de texte : ' + printed.length + ' imprimées pour ' + readerLines.length + ' en Lecture');
          else {
            let worst = 0;
            printed.forEach((box, i) => { if (box.text !== readerLines[i].text) problems.push('ligne ' + (i + 1) + ' : « ' + box.text + ' » au lieu de « ' + readerLines[i].text + ' »'); else worst = Math.max(worst, Math.abs(box.left - readerLines[i].left)); });
            summary.ecartGauche = Math.round(worst * 1000) / 1000;
            if (worst > 0.05) problems.push('bord gauche des lignes : écart de ' + worst.toFixed(3) + ' px avec la Lecture');
          }
        } finally { job.dispose(); }
        return verdict(problems, summary);
      },
    },
    {
      id: 'mixed_print_a_page_taller_than_its_sheet_continues_on_sheets_of_its_own_sense',
      description: 'Impression navigateur : une liste de 80 éléments dans un modèle paysage (une page plus haute qu\'une feuille : la pagination ne coupe pas une liste) continue sur d\'autres feuilles PAYSAGE, coupée entre deux éléments, chaque élément une fois et une seule ; les feuilles portrait de part et d\'autre gardent leur page',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const list = '<ul>' + Array.from({ length: 80 }, (_, i) => '<li><p>Élément ' + (i + 1) + ' de la liste du modèle paysage, avec un texte assez long pour passer sur deux lignes quand la page est étroite.</p></li>').join('') + '</ul>';
        const job = await printJob(assemble([slot('portrait', lines(3, 'Alpha')), slot('landscape', list), slot('portrait', lines(3, 'Charlie'))]));
        const summary = {};
        try {
          const sheets = printSheets(job);
          const senses = sheets.map(printSense).join('');
          summary.sens = senses;
          if (!/^PL{2,}P$/.test(senses)) problems.push('sens des feuilles : ' + senses + ' (P, au moins deux L, P attendus)');
          const found = new Map();
          sheets.forEach((sheet, i) => sheetText(sheet).forEach(box => {
            const match = /^Élément (\d+) de la liste/.exec(box.text);
            if (!match) return;
            found.set(Number(match[1]), (found.get(Number(match[1])) || 0) + 1);
            if (printSense(sheet) !== 'L') problems.push('l\'élément ' + match[1] + ' est sur la feuille ' + (i + 1) + ', portrait');
          }));
          const lost = []; const doubled = [];
          for (let i = 1; i <= 80; i++) { const n = found.get(i) || 0; if (n === 0) lost.push(i); if (n > 1) doubled.push(i); }
          if (lost.length || doubled.length) problems.push('éléments perdus : ' + lost.join(',') + ' ; doublés : ' + doubled.join(','));
          const first = textOf(sheetText(sheets[0])); const last = textOf(sheetText(sheets[sheets.length - 1]));
          if (!/Alpha 0/.test(first) || /Élément/.test(first)) problems.push('la première feuille : ' + first.slice(0, 80));
          if (!/Charlie 0/.test(last) || /Élément/.test(last)) problems.push('la dernière feuille : ' + last.slice(0, 80));
        } finally { job.dispose(); }
        return verdict(problems, summary);
      },
    },
    {
      id: 'mixed_print_nothing_changes_without_a_turning_section',
      description: 'Impression navigateur : un document ordinaire, un macro-modèle dont tous les modèles ont le sens des marges (repères présents) et un macro-modèle imposé en paysage gardent leurs feuilles d\'avant : posées directement dans l\'hôte (aucun bloc nommé), une seule règle `@page`, sans nom, à la taille du modèle, aucune fenêtre qui porte un sens',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const check = async (label, html, senses, rule) => {
          const job = await printJob(html);
          try {
            const sheets = printSheets(job);
            const got = sheets.map(printSense).join('');
            if (got !== senses) problems.push(label + ' : feuilles ' + got + ' au lieu de ' + senses);
            if (job.frame.contentDocument.querySelector('.pp-print-page')) problems.push(label + ' : un bloc nommé enveloppe une feuille');
            if (sheets.some(sheet => sheet.parentElement.id !== 'pp-print-sheets')) problems.push(label + ' : une feuille n\'est pas posée directement dans l\'hôte');
            const got1 = job.frame.contentDocument.getElementById('pp-print-page').textContent;
            if (got1 !== rule) problems.push(label + ' : règle « ' + got1 + ' » au lieu de « ' + rule + ' »');
            if (job.windows.some(win => win.sheet)) problems.push(label + ' : une fenêtre porte un sens');
          } finally { job.dispose(); }
        };
        await check('document ordinaire', lines(3, 'Alpha'), 'P', PRINT_PAGE_RULES.default);
        await check('macro-modèle tout portrait', assemble([slot('portrait', lines(3, 'Alpha')), slot('portrait', lines(3, 'Bravo'))]), 'PP', PRINT_PAGE_RULES.default);
        PageLayout.setMarginsMm(Object.assign({}, PageLayout.getMarginsMm(), { orientation: 'landscape' }));
        await check('macro-modèle tout paysage', assemble([slot('landscape', lines(3, 'Alpha')), slot('landscape', lines(3, 'Bravo'))]), 'LL', '@page { size: 297mm 210mm; margin: 0; }');
        await plainPage(h);
        return verdict(problems, {});
      },
    },

    // ---------- L'assemblage : « Selon chaque modèle » (lot 5) ----------
    {
      id: 'mixed_assembly_following_each_model_writes_the_sense_of_every_model',
      description: 'MacroTemplates.buildConcatenatedHtml avec perModel (« Selon chaque modèle ») écrit le sens de chaque modèle assemblé, celui de sa propre page : un repère de départ devant le premier, data-page-orientation sur le saut de page de chacun des autres, un modèle sans page en portrait, un modèle Grille avec la sienne - le HTML écrit à la main du contrat ; sans l\'option, ou avec perModel faux, le HTML d\'avant octet pour octet, sans aucun repère',
      async run() {
        const problems = [];
        const templates = [
          template('p', 'portrait', lines(2, 'Alpha')),
          template('l', 'landscape', lines(2, 'Bravo')),
          template('none', null, lines(2, 'Charlie')),
          template('g', 'landscape', gridTable('Delta'), { typeModele: 'grille' }),
        ];
        const composition = fixedSlots('p', 'l', 'none', 'g');
        const html = await assembleWith(composition, templates, true);
        const want = assemble([slot('portrait', lines(2, 'Alpha')), slot('landscape', lines(2, 'Bravo')), slot('portrait', lines(2, 'Charlie')), slot('landscape', gridTable('Delta'))]);
        if (canon(html) !== canon(want)) problems.push('HTML assemblé : ' + html.slice(0, 500) + ' … au lieu de ' + want.slice(0, 500) + ' …');
        const root = document.createElement('div');
        root.innerHTML = html;
        const senses = PageSections.split(root.childNodes, 'portrait').map(section => section.orientation[0]).join('');
        if (senses !== 'plpl') problems.push('sections lues : ' + senses + ' au lieu de plpl');
        if (PageSections.firstSenseOf(html) !== 'portrait') problems.push('sens du repère de départ : ' + PageSections.firstSenseOf(html));
        const ranks = Array.from(root.querySelectorAll('.page-break-marker')).map(el => el.getAttribute('data-macro-slot') + ':' + el.getAttribute('data-page-orientation')).join(',');
        if (ranks !== '1:landscape,2:portrait,3:landscape') problems.push('sauts de page : ' + ranks);
        // Sans l'option : le HTML d'avant, sans repère.
        const legacy = templates.map(tpl => tpl.contenu).reduce((html2, content, rank) => html2 + (rank ? MacroTemplates.slotBreakHtml(rank) : '') + content, '');
        [['sans option', await assembleWith(composition, templates)], ['perModel faux', await assembleWith(composition, templates, false)]].forEach(([label, got]) => {
          if (got !== legacy) problems.push(label + ' : le HTML a changé (' + got.slice(0, 200) + ')');
          if (PageSections.hasSenses(got)) problems.push(label + ' : des repères de sens sont écrits');
        });
        return verdict(problems, { senses, ranks });
      },
    },
    {
      id: 'mixed_assembly_follows_the_models_kept_for_the_row',
      description: 'L\'assemblage « Selon chaque modèle » suit les modèles RETENUS : un premier modèle masqué (l\'œil) cède le repère de départ au suivant et les rangs se recomptent, un seul modèle retenu n\'a pas de saut de page, rien de retenu n\'écrit rien (pas même un repère), une annexe choisie par la ligne donne son sens à cette ligne',
      async run() {
        const problems = [];
        const templates = [template('p', 'portrait', lines(1, 'Alpha')), template('l', 'landscape', lines(1, 'Bravo')), template('q', 'portrait', lines(1, 'Charlie'))];
        const hidden = { slots: [{ type: 'fixed', modeleId: 'p', hiddenModeleIds: ['p'] }, { type: 'fixed', modeleId: 'l' }, { type: 'fixed', modeleId: 'q' }] };
        const first = await assembleWith(hidden, templates, true);
        if (canon(first) !== canon(assemble([slot('landscape', lines(1, 'Bravo')), slot('portrait', lines(1, 'Charlie'))]))) problems.push('premier modèle masqué : ' + first.slice(0, 400));
        const one = await assembleWith(fixedSlots('l'), templates, true);
        if (canon(one) !== canon(start('landscape') + lines(1, 'Bravo'))) problems.push('un seul modèle : ' + one.slice(0, 300));
        const none = await assembleWith({ slots: [{ type: 'conditional', rules: [], defaultModeleId: null }] }, templates, true);
        if (none !== '') problems.push('rien de retenu : ' + none.slice(0, 200));
        const byRow = { slots: [{ type: 'fixed', modeleId: 'p' }, { type: 'conditional', rules: [{ column: 'Type', operator: '=', value: 'Large', modeleId: 'l' }], defaultModeleId: 'q' }] };
        const sensesFor = async record => {
          const html = await MacroTemplates.buildConcatenatedHtml(byRow, 'Dossiers', record, templates, { perModel: true });
          const root = document.createElement('div');
          root.innerHTML = html;
          return PageSections.split(root.childNodes, 'portrait').map(section => section.orientation[0]).join('');
        };
        const large = await sensesFor({ id: 1, Type: 'Large' });
        const small = await sensesFor({ id: 2, Type: 'Petit' });
        if (large !== 'pl' || small !== 'p') problems.push('annexe selon la ligne : ' + large + ' / ' + small + ' au lieu de pl / p');
        return verdict(problems, { large, small });
      },
    },
    {
      id: 'mixed_following_each_model_comes_out_turned_in_the_reading_the_pdf_the_word_and_the_print',
      description: 'Un macro-modèle « Selon chaque modèle » assemblé par l\'application (portrait, paysage, Grille paysage, portrait) : la Lecture a trois feuilles (portrait, paysage de deux pages, portrait), le PDF quatre pages de la taille du sens de leur modèle, le Word trois sections, l\'impression quatre feuilles sur le papier de leur sens ; la grille de 920 px, trop large pour une page portrait, tient dans sa page paysage dans chacune des quatre sorties',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const templates = [template('a', 'portrait', lines(2, 'Alpha')), template('b', 'landscape', lines(2, 'Bravo')), template('g', 'landscape', gridTable('Gri'), { typeModele: 'grille' }), template('d', 'portrait', lines(2, 'Delta'))];
        const html = await assembleWith(fixedSlots('a', 'b', 'g', 'd'), templates, true);
        const summary = {};
        // La Lecture : trois feuilles, la grille entière dans la largeur utile de la page paysage.
        const reading = await readSheets(h, html);
        summary.lecture = reading.senses + ' ' + reading.pages;
        if (reading.senses !== 'PLP' || reading.pages !== '1,2,1') problems.push('Lecture : feuilles ' + reading.senses + ', pages ' + reading.pages + ' au lieu de PLP, 1,2,1');
        problems.push(...sheetProblems(reading.sheets, 'PLP'));
        if (reading.sheets[1]) {
          const sheet = reading.sheets[1];
          const zoom = EditorCore.layoutZoom(sheet.el);
          const table = sheet.el.querySelector('table');
          const right = table ? (table.getBoundingClientRect().right - sheet.el.getBoundingClientRect().left) / zoom : null;
          const limit = SHEET_PX.L - PageLayout.getMarginsPx().right + 1;
          summary.grilleLecture = right === null ? null : Math.round(right);
          if (right === null || right > limit) problems.push('Lecture : la grille dépasse la page paysage (' + right + ' px pour ' + limit + ')');
        }
        // Le PDF : quatre pages, chaque modèle sur la sienne, la grille dans la largeur de la page paysage.
        const pdf = await pdfPages(h, html);
        summary.pdf = pdf.sizes;
        if (pdf.sizes !== 'PLLP') problems.push('PDF : pages ' + pdf.sizes + ' au lieu de PLLP');
        else {
          problems.push(...sizeProblems(pdf.pages, 'PLLP'));
          const tags = ['Alpha', 'Bravo', 'Gri0c0', 'Gri1c3', 'Delta'];
          const wantTags = [['Alpha'], ['Bravo'], ['Gri0c0', 'Gri1c3'], ['Delta']];
          pdf.pages.forEach((page, i) => { const got = tagsOn(page, tags); if (got.join() !== wantTags[i].join()) problems.push('PDF page ' + (i + 1) + ' : ' + got.join(',') + ' au lieu de ' + wantTags[i].join(',')); });
          const gridPage = pdf.pages[2];
          const right = Math.max(...gridPage.items.filter(item => /^Gri\d/.test(item.str)).map(item => item.x + item.width));
          summary.grillePdf = Math.round(right);
          if (right > gridPage.width - PageLayout.getMarginsPt().right + 1) problems.push('PDF : la grille dépasse la page paysage (' + right.toFixed(1) + ' pt)');
        }
        // Le Word : trois sections, le tableau de la grille bâti à la largeur de sa page paysage (920 px = 13800 twips, non réduit comme sur une page portrait).
        const sections = wordSections(await h.exportDocxParts(html, null, PageLayout.getMarginsTwip()));
        summary.word = sections.map(section => section.orient[0]).join('');
        if (sections.length !== 3) problems.push('Word : ' + sections.length + ' section(s) au lieu de 3');
        else {
          problems.push(...wordSizeProblems(sections, 'PLP'));
          const table = sections[1].blocks.find(node => node.nodeName === 'w:tbl');
          const width = table ? wordGridWidth(table) : null;
          summary.grilleWord = width;
          if (width === null || Math.abs(width - 13800) > 100) problems.push('Word : largeur de la grille ' + width + ' twips au lieu de 13800');
        }
        // L'impression : quatre feuilles, chacune sur le papier de son sens.
        const job = await printJob(html);
        try {
          const printed = printSheets(job).map(printSense).join('');
          summary.impression = printed;
          if (printed !== 'PLLP') problems.push('impression : feuilles ' + printed + ' au lieu de PLLP');
        } finally { job.dispose(); }
        return verdict(problems, summary);
      },
    },
    {
      id: 'mixed_following_each_model_with_models_of_one_sense_comes_out_like_an_imposed_sense',
      description: 'Un macro-modèle « Selon chaque modèle » dont tous les modèles ont le même sens sort comme avant : tous portrait, la Lecture, le PDF, le Word et l\'impression donnent ce que donne l\'assemblage sans repère (mêmes mots sur les mêmes pages, une feuille, une section, le papier par défaut) ; tous paysage, ce que donne un macro-modèle imposé en paysage',
      async run(h) {
        const problems = [];
        const build = async (templates, perModel) => assembleWith(fixedSlots('a', 'b'), templates, perModel);
        // Tout ce que les quatre sorties montrent d'un document : les feuilles de la Lecture, les pages du PDF (taille, mots), les sections du Word (sens, blocs), les feuilles imprimées.
        const outputs = async html => {
          const reading = await readSheets(h, html);
          const pdf = await pdfPages(h, html);
          const sections = wordSections(await h.exportDocxParts(html, null, PageLayout.getMarginsTwip()));
          const job = await printJob(html);
          try {
            return {
              lecture: reading.senses + ' ' + reading.pages,
              pdf: pdf.sizes + ' ' + JSON.stringify(pdf.pages.map(bodyWords)),
              word: sections.map(section => section.orient + ':' + section.blocks.map(wordText).filter(Boolean).join('|')).join(' ; '),
              // Les feuilles et le papier de la première page (la règle `@page` sans nom) : un macro-modèle « Selon chaque modèle » ajoute des règles nommées, le papier ne change pas.
              impression: printSheets(job).map(printSense).join('') + ' ' + (/@page\s*\{\s*size:\s*([^;]+);/.exec(job.frame.contentDocument.getElementById('pp-print-page').textContent) || [])[1],
            };
          } finally { job.dispose(); }
        };
        const compare = (label, got, want) => { Object.keys(want).forEach(key => { if (got[key] !== want[key]) problems.push(label + ' — ' + key + ' : ' + got[key] + ' au lieu de ' + want[key]); }); };
        await plainPage(h);
        const portraits = [template('a', 'portrait', lines(3, 'Alpha')), template('b', null, lines(3, 'Bravo'))];
        const plainPortrait = await outputs(await build(portraits));
        const followingPortrait = await outputs(await build(portraits, true));
        compare('tout portrait', followingPortrait, plainPortrait);
        if (plainPortrait.lecture !== 'P 2' || !/^PP /.test(plainPortrait.pdf)) problems.push('tout portrait : la référence a changé (' + plainPortrait.lecture + ', ' + plainPortrait.pdf.slice(0, 20) + ')');
        // Tout paysage : le macro-modèle imposé en paysage (page du macro-modèle, aucun repère) est la référence.
        const landscapes = [template('a', 'landscape', lines(3, 'Alpha')), template('b', 'landscape', lines(3, 'Bravo'))];
        PageLayout.setMarginsMm(Object.assign({}, PageLayout.getMarginsMm(), { orientation: 'landscape' }));
        const imposed = await outputs(await build(landscapes));
        await plainPage(h);
        const followingLandscape = await outputs(await build(landscapes, true));
        compare('tout paysage', followingLandscape, imposed);
        if (followingLandscape.lecture !== 'L 2' || !/^LL /.test(followingLandscape.pdf)) problems.push('tout paysage : ' + followingLandscape.lecture + ' / ' + followingLandscape.pdf.slice(0, 20));
        await plainPage(h);
        return verdict(problems, { portrait: followingPortrait.lecture, paysage: followingLandscape.lecture });
      },
    },

    // ---------- Le réglage de page « Selon chaque modèle » et son menu (lot 5) ----------
    {
      id: 'mixed_page_layout_following_each_model_is_a_setting_of_the_macro_page',
      description: 'PageLayout : « Selon chaque modèle » est la clé orientationAuto du JSON des marges, posée seulement quand le réglage l\'est (une page sans lui se recharge à l\'identique) ; le brouillon reste en portrait, les marges se bornent sur le côté court du format ; choisir un sens, ou saisir une forme de page qui change de sens, le quitte (pp:pageLayoutChanged), setOrientationAuto le rétablit ; changer le format le garde',
      async run() {
        const problems = [];
        const events = [];
        const onEvent = event => events.push(JSON.stringify(event.detail));
        document.addEventListener('pp:pageLayoutChanged', onEvent);
        const key = () => PageLayout.getOrientation() + ':' + PageLayout.isOrientationAuto() + ':' + ('orientationAuto' in PageLayout.getMarginsMm());
        try {
          PageLayout.setMarginsMm(null);
          if (key() !== 'portrait:false:false') problems.push('une page ordinaire : ' + key());
          // Rechargé tel qu'enregistré, même avec un sens paysage écrit : le réglage vaut, le brouillon est en portrait, le format est gardé.
          PageLayout.setMarginsMm({ orientation: 'landscape', orientationAuto: true, format: 'A5' });
          if (key() !== 'portrait:true:true' || PageLayout.getFormat() !== 'A5') problems.push('rechargé : ' + key() + ' ' + PageLayout.getFormat());
          const saved = JSON.parse(JSON.stringify(PageLayout.getMarginsMm()));
          if (saved.orientationAuto !== true || saved.orientation !== 'portrait') problems.push('JSON des marges : ' + JSON.stringify(saved));
          PageLayout.setMarginsMm(saved);
          if (key() !== 'portrait:true:true') problems.push('relu après l\'écriture : ' + key());
          // Un modèle chargé ensuite, sans le réglage ou avec une valeur qui n'est pas « vrai », est un sens imposé.
          PageLayout.setMarginsMm(null);
          if (key() !== 'portrait:false:false') problems.push('modèle suivant sans réglage : ' + key());
          PageLayout.setMarginsMm({ orientation: 'landscape', orientationAuto: 'oui' });
          if (key() !== 'landscape:false:false') problems.push('valeur illisible : ' + key());
          // Un macro-modèle neuf.
          const fresh = PageLayout.newMacroMarginsMm();
          PageLayout.setMarginsMm(fresh);
          if (fresh.orientationAuto !== true || fresh.orientation !== 'portrait' || fresh.format !== 'A4' || key() !== 'portrait:true:true') problems.push('macro-modèle neuf : ' + JSON.stringify(fresh));
          // Les marges se bornent sur le côté court (210 mm d'un A4), pas sur la hauteur de la page portrait (297 mm).
          const sum = () => PageLayout.getMarginsMm().top + PageLayout.getMarginsMm().bottom;
          PageLayout.setMarginsMm({ top: 150, bottom: 150, left: 10, right: 10, orientationAuto: true });
          const autoSum = sum();
          PageLayout.setMarginsMm({ top: 150, bottom: 150, left: 10, right: 10 });
          const imposedSum = sum();
          if (Math.abs(autoSum - 190) > 0.5 || Math.abs(imposedSum - 277) > 0.5) problems.push('bornes des marges : ' + autoSum.toFixed(1) + ' (190 attendu) et ' + imposedSum.toFixed(1) + ' (277 attendu)');
          PageLayout.setMarginsMm(fresh);
          const limits = PageLayout.getMarginLimitsMm();
          if (!['top', 'bottom', 'left', 'right'].every(side => Math.abs(limits[side] - 210) < 0.01)) problems.push('plafonds « Selon chaque modèle » : ' + JSON.stringify(limits));
          PageLayout.setMarginsMm(null);
          const normal = PageLayout.getMarginLimitsMm();
          if (Math.abs(normal.top - 297) > 0.01 || Math.abs(normal.left - 210) > 0.01) problems.push('plafonds d\'une page portrait : ' + JSON.stringify(normal));
          // Choisir un sens le quitte, même « portrait » (le brouillon y est déjà) ; le rétablir garde le format.
          PageLayout.setMarginsMm(Object.assign({}, fresh, { format: 'A3' }));
          events.length = 0;
          PageLayout.setOrientation('portrait');
          if (key() !== 'portrait:false:false' || events.length !== 1 || JSON.parse(events[0]).orientationAuto !== false) problems.push('Portrait depuis « Selon chaque modèle » : ' + key() + ' ' + events.join('|'));
          events.length = 0;
          if (PageLayout.setOrientationAuto(true) !== true || key() !== 'portrait:true:true' || PageLayout.getFormat() !== 'A3' || events.length !== 1 || JSON.parse(events[0]).orientationAuto !== true) problems.push('rétabli : ' + key() + ' ' + PageLayout.getFormat() + ' ' + events.join('|'));
          events.length = 0;
          if (PageLayout.setOrientationAuto(true) !== false || events.length) problems.push('le rétablir deux fois annonce un changement');
          PageLayout.setOrientation('landscape');
          if (key() !== 'landscape:false:false') problems.push('Paysage depuis « Selon chaque modèle » : ' + key());
          // Revenir à un sens imposé laisse le portrait (le sens qu'on impose ensuite est un choix).
          PageLayout.setOrientationAuto(true);
          if (PageLayout.setOrientationAuto(false) !== true || key() !== 'portrait:false:false') problems.push('retiré : ' + key());
          // Une forme saisie : celle de la page en cours garde le réglage, une autre impose son sens.
          PageLayout.setMarginsMm(fresh);
          PageLayout.setPageSize(40, 80);
          if (PageLayout.getFormat() !== '40x80' || !PageLayout.isOrientationAuto()) problems.push('forme semblable (40 x 80) : ' + key() + ' ' + PageLayout.getFormat());
          PageLayout.setPageSize(80, 40);
          if (PageLayout.isOrientationAuto() || PageLayout.getOrientation() !== 'landscape') problems.push('forme paysage (80 x 40) : ' + key());
          // Le format se change sans quitter le réglage ; un calcul dans le sens d'un modèle ne touche pas au brouillon.
          PageLayout.setMarginsMm(fresh);
          PageLayout.setFormat('A3');
          if (!PageLayout.isOrientationAuto() || PageLayout.getFormat() !== 'A3') problems.push('format changé : ' + key());
          const inside = PageLayout.withOrientation('landscape', () => PageLayout.getPageSizeMm().width + 'x' + PageLayout.getPageSizeMm().height + ':' + PageLayout.isOrientationAuto());
          if (inside !== '420x297:true' || key() !== 'portrait:true:true') problems.push('withOrientation : ' + inside + ' puis ' + key());
        } finally {
          document.removeEventListener('pp:pageLayoutChanged', onEvent);
          PageLayout.setMarginsMm(null);
        }
        return verdict(problems, {});
      },
    },
    {
      id: 'mixed_page_menu_of_a_macro_has_the_row_following_each_model',
      description: 'Le menu Page d\'un macro-modèle a une ligne de plus, la première, « Selon chaque modèle » (cochée quand le réglage l\'est, Portrait et Paysage alors décochés) : la choisir prévient l\'enregistrement et la Lecture, Portrait ou Paysage ou le clic sur le bouton imposent un sens, le bouton dit le réglage (libellé, non allumé) ; les autres types gardent le menu d\'avant, sans la ligne ; en anglais ; grisée pendant un export ; les champs de marge des Réglages plafonnent sur le côté court',
      async run() {
        const problems = [];
        const button = document.getElementById('btn-page-orientation');
        const rows = () => Array.from(document.querySelectorAll('#v2-page-flyout .v2-hover-row-check')).map(row => ({ key: row.getAttribute('data-page-orientation') || row.getAttribute('data-page-format'), name: row.querySelector('.v2-page-row-name').textContent, checked: row.getAttribute('aria-checked'), disabled: row.getAttribute('aria-disabled') }));
        const keys = () => rows().map(row => row.key).join();
        const checked = () => rows().filter(row => row.checked === 'true').map(row => row.key).join();
        const row = key => document.querySelector('#v2-page-flyout [data-page-orientation="' + key + '"]');
        const events = [];
        const onEvent = event => events.push(event.type);
        const settingsMax = () => {
          document.getElementById('v2-btn-settings').click();
          const max = ['top', 'bottom', 'left', 'right'].map(side => document.getElementById('settings-margin-' + side).max).join(',');
          document.getElementById('settings-close').click();
          return max;
        };
        try {
          // Un document : le menu d'avant.
          PageLayout.setMarginsMm(null);
          OrientationToggle.sync('document');
          const documentKeys = keys();
          if (row('auto') || documentKeys.split(',').slice(0, 2).join() !== 'portrait,landscape') problems.push('document : ' + documentKeys);
          // Un macro-modèle sans le réglage (fait avant lui) : la ligne est la première et décochée, Portrait est coché.
          OrientationToggle.sync('macro');
          if (keys() !== 'auto,' + documentKeys) problems.push('macro-modèle : ' + keys() + ' au lieu de auto,' + documentKeys);
          if (rows()[0].name !== 'Selon chaque modèle' || rows()[0].checked !== 'false' || checked() !== 'portrait,A4') problems.push('macro-modèle sans réglage : ' + JSON.stringify(rows().slice(0, 3)) + ' ' + checked());
          if (button.getAttribute('aria-label') !== 'Page A4 en portrait (passer en paysage)' || button.dataset.orientation !== 'portrait') problems.push('bouton sans réglage : ' + button.getAttribute('aria-label') + ' ' + button.dataset.orientation);
          if (settingsMax() !== '277,277,190,190') problems.push('champs de marge sans réglage : ' + settingsMax());
          // La choisir : coché seule, une annonce pour l'enregistrement et une pour la Lecture, le bouton dit le réglage et n'est pas allumé.
          document.addEventListener('pp:marginsChanged', onEvent);
          document.addEventListener('pp:pageLayoutChanged', onEvent);
          row('auto').click();
          if (checked() !== 'auto,A4' || !PageLayout.isOrientationAuto()) problems.push('« Selon chaque modèle » choisie : ' + checked());
          if (events.filter(type => type === 'pp:marginsChanged').length !== 1 || events.filter(type => type === 'pp:pageLayoutChanged').length !== 1) problems.push('annonces : ' + events.join());
          if (button.getAttribute('aria-label') !== 'Page A4 selon chaque modèle (passer en paysage)' || button.dataset.orientation !== 'auto' || button.getAttribute('aria-pressed') !== 'false' || button.classList.contains('active')) problems.push('bouton réglé : ' + button.getAttribute('aria-label') + ' ' + button.dataset.orientation + ' ' + button.getAttribute('aria-pressed'));
          if (settingsMax() !== '190,190,190,190') problems.push('champs de marge « Selon chaque modèle » : ' + settingsMax());
          events.length = 0;
          row('auto').click();
          if (events.length) problems.push('la choisir de nouveau annonce un changement : ' + events.join());
          // Le clic sur le bouton impose le paysage ; la ligne rétablit ; Portrait impose le portrait.
          button.click();
          if (checked() !== 'landscape,A4' || PageLayout.isOrientationAuto() || button.dataset.orientation !== 'landscape' || button.getAttribute('aria-pressed') !== 'true') problems.push('clic sur le bouton : ' + checked());
          row('auto').click();
          if (checked() !== 'auto,A4') problems.push('rétablie : ' + checked());
          row('portrait').click();
          if (checked() !== 'portrait,A4' || PageLayout.isOrientationAuto() || 'orientationAuto' in PageLayout.getMarginsMm()) problems.push('Portrait depuis « Selon chaque modèle » : ' + checked());
          row('auto').click();
          row('landscape').click();
          if (checked() !== 'landscape,A4' || PageLayout.isOrientationAuto()) problems.push('Paysage depuis « Selon chaque modèle » : ' + checked());
          // Le format se change sans quitter le réglage.
          row('auto').click();
          document.querySelector('#v2-page-flyout [data-page-format="A5"]').click();
          if (checked() !== 'auto,A5') problems.push('format A5 : ' + checked());
          // En anglais.
          I18n.setLang('en');
          if (rows()[0].name !== 'Follow each template' || button.getAttribute('aria-label') !== 'A5 page following each template (switch to landscape)') problems.push('anglais : ' + rows()[0].name + ' / ' + button.getAttribute('aria-label'));
          I18n.setLang('fr');
          // Pendant un export (setBusy), la ligne est grisée et sans effet.
          row('portrait').click();
          OrientationToggle.setBusy(true);
          if (row('auto').getAttribute('aria-disabled') !== 'true' || !row('auto').classList.contains('v2-hover-row-disabled')) problems.push('pendant un export, la ligne n\'est pas grisée');
          events.length = 0;
          row('auto').click();
          OrientationToggle.selectAuto();
          if (PageLayout.isOrientationAuto() || events.length) problems.push('pendant un export, un geste change la page : ' + events.join());
          OrientationToggle.setBusy(false);
          // Revenu à un document : le menu d'avant, la ligne retirée.
          OrientationToggle.sync('document');
          if (keys() !== documentKeys) problems.push('retour à un document : ' + keys());
          OrientationToggle.selectAuto();
          if (PageLayout.isOrientationAuto()) problems.push('« Selon chaque modèle » posée sur un document');
        } finally {
          document.removeEventListener('pp:marginsChanged', onEvent);
          document.removeEventListener('pp:pageLayoutChanged', onEvent);
          I18n.setLang('fr');
          OrientationToggle.setBusy(false);
          PageLayout.setMarginsMm(null);
          OrientationToggle.sync('document');
        }
        return verdict(problems, {});
      },
    },
  ];
})();
