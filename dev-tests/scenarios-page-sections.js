// Orientation par page d'un document (demande d'Antoine, 22/10 : « au sein d'un modèle avoir une page en paysage et les autres en portrait », un menu du bouton Page pour dire si le choix
// vaut pour tout le document ou pour la page choisie). Une page tournée n'est qu'un saut de page qui porte le sens des pages qui le suivent (`data-page-orientation`, js/page-sections.js),
// le repère que la Lecture, le PDF, le Word et l'impression lisent déjà dans un macro-modèle aux sens mêlés (groupe `mixedOrientation`) : ce fichier épingle ce contrat pour le HTML d'un
// DOCUMENT ordinaire, dont la page de départ est celle des marges (`PageLayout`), puis, lot après lot, l'éditeur (feuilles de largeurs différentes, pagination par section) et le menu.
//
// Lot 1 (données et sorties) : le nœud « Saut de page » porte le sens (`orientation`, nul par défaut : le HTML d'un saut ordinaire ne change pas d'un octet), un macro-modèle au sens imposé ne
// laisse pas les pages tournées d'un modèle assemblé le suivre, « Selon chaque modèle » les garde.
// Lot 2 (l'éditeur, js/page-section-view.js) : la feuille prend la largeur de la plus large des pages et chaque page y est un papier à sa taille, le texte d'une page plus étroite se répartit dans
// SA largeur, chaque page a sa hauteur utile (la pagination, les coutures, les zones d'en-tête et de pied de bord), une image en calque suit sa page et reste derrière le texte.
window.EditorTestSuites = window.EditorTestSuites || {};
window.EditorTestSuites.pageSections = (function () {
  const PORTRAIT_PT = { width: 595.28, height: 841.89 };
  const LANDSCAPE_PT = { width: 841.89, height: 595.28 };
  const near = (a, b, tolerance) => Math.abs(a - b) <= tolerance;
  const clone = value => JSON.parse(JSON.stringify(value));
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const verdict = (problems, summary) => ({ pass: problems.length === 0, notes: JSON.stringify({ summary, problems }) });
  // Le saut de page tel que l'éditeur l'écrit (js/editor-nodes.js:createPageBreakNode), avec ou sans sens.
  const PLAIN_BREAK = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
  const breakTo = sense => '<div class="page-break-marker" contenteditable="false"' + (sense ? ' data-page-orientation="' + sense + '"' : '') + '>Saut de page</div>';
  const lines = (n, tag) => Array.from({ length: n }, (_, i) => '<p>' + tag + ' ' + i + ' du modèle de test.</p>').join('');
  const words = text => text.split(/\s+/).filter(Boolean);
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  // Une image derrière le texte : posée à (leftPt, topPt) de la grille de la page `pageIndex` (0 : la première page du document), répétée sur toutes les pages ou non.
  const layerImage = o => {
    const width = o.width || 40;
    const layer = o.layer || 'behind';
    const style = 'width: ' + width + 'px; height: ' + width + 'px; position: absolute; left: ' + (o.leftPx || 0) + 'px; top: ' + (o.topPx || 0) + 'px; z-index: ' + (layer === 'front' ? 5 : -1) + ';';
    const grid = ' data-page-index="' + (o.pageIndex || 0) + '" data-page-left-pt="' + (o.leftPt === undefined ? 50 : o.leftPt) + '" data-page-top-pt="' + (o.topPt === undefined ? 50 : o.topPt) + '"';
    return '<p><img class="editor-image" src="' + PNG + '" alt="" style="' + style + '" data-layer="' + layer + '" data-wrap="inline"' + (o.repeat ? ' data-repeat="true"' : '') + grid + '></p>';
  };

  // La page du document d'avant les scénarios : A4 portrait, marges par défaut, sans réglage de sens par modèle.
  async function plainPage(h, orientation) {
    await h.resetEditor();
    PageLayout.setMarginsMm(orientation ? { orientation } : null);
    OrientationToggle.sync();
    document.dispatchEvent(new CustomEvent('pp:pageLayoutChanged'));
    await h.sleep(150);
  }
  async function pdfPages(h, html, hf) {
    const result = await h.exportPdfContent(html, hf || null, PageLayout.getMarginsPt());
    const gt = await h.extractPdfGroundTruth(result.base64);
    const pages = gt.pages.map(page => ({
      sense: page.width > page.height ? 'L' : 'P', width: page.width, height: page.height, items: page.textItems, images: page.images || [],
      words: page.textItems.flatMap(item => words(item.str)),
    }));
    return { result, pages, sizes: pages.map(page => page.sense).join('') };
  }
  const sizeProblems = (pages, expected) => {
    const problems = [];
    pages.forEach((page, i) => {
      const want = expected[i] === 'L' ? LANDSCAPE_PT : PORTRAIT_PT;
      if (!near(page.width, want.width, 1) || !near(page.height, want.height, 1)) problems.push('page ' + (i + 1) + ' : ' + page.width.toFixed(1) + ' x ' + page.height.toFixed(1) + ' pt au lieu de ' + want.width + ' x ' + want.height);
    });
    return problems;
  };
  const tagsOn = (page, tags) => tags.filter(tag => page.words.indexOf(tag) !== -1);

  // --- L'éditeur (lot 2) : la feuille d'un document aux pages mêlées, lue sur le DOM, en pixels de mise en page ---
  const MIXED = 'pp-mixed-pages';
  const PT = 96 / 72;
  const HF = { enabled: true, differentFirstPage: false, header: { default: '<p>EN-TETE</p>', first: '' }, footer: { default: '<p>PIED</p>', first: '' } };
  const sheetPx = sense => PageLayout.withOrientation(sense, () => PageLayout.getSheetWidthPx());
  const heightPx = sense => PageLayout.withOrientation(sense, () => PageLayout.getPageSizePx().height);
  // Le document affiché dans l'éditeur en Aperçu A4 (le sens des marges du modèle `base`, ou celui d'avant), puis les papiers peints, depuis le coin de la feuille.
  async function showEditor(h, html, hf, base) {
    await plainPage(h, base);
    h.setA4Preview(true);
    Editor.setHeaderFooterData(clone(hf || NO_HF));
    Editor.setHTML(html);
    Editor.refreshLayout();
    await h.sleep(500);
    const box = document.getElementById('editor-container');
    const sheet = box.querySelector('.v2-page-sheet');
    const zoom = parseFloat(getComputedStyle(sheet).zoom) || 1;
    const sheetRect = sheet.getBoundingClientRect();
    const papers = Array.from(box.querySelectorAll('.v2-page-paper')).map(el => {
      const r = el.getBoundingClientRect();
      return { el, left: (r.left - sheetRect.left) / zoom, top: (r.top - sheetRect.top) / zoom, width: r.width / zoom, height: r.height / zoom };
    });
    return { box, sheet, zoom, sheetRect, papers, tiptap: box.querySelector('.tiptap') };
  }

  // --- Le Word, relu dans son XML (mêmes lectures que le groupe mixedOrientation) ---
  const wordText = node => Array.from(node.getElementsByTagName('w:t')).map(t => t.textContent).join('').replace(/ du modèle de test\.$/, '');
  const wordOpensPage = node => node.nodeName === 'w:p' && node.getElementsByTagName('w:pageBreakBefore').length > 0;
  const numberOf = (el, name) => (el && el.getAttribute(name) !== null ? Number(el.getAttribute(name)) : null);
  // Les sections du document.xml, dans l'ordre : la page de chacune (taille, sens) et ses blocs. Le <w:sectPr> d'une section est dans un paragraphe vide à sa fin : pas du contenu.
  function wordSections(parts) {
    const rels = {};
    Array.from(parts.part('word/_rels/document.xml.rels').getElementsByTagName('Relationship')).forEach(rel => { rels[rel.getAttribute('Id')] = 'word/' + rel.getAttribute('Target'); });
    const refs = (sect, tag) => { const out = {}; Array.from(sect.getElementsByTagName(tag)).forEach(ref => { out[ref.getAttribute('w:type')] = rels[ref.getAttribute('r:id')]; }); return out; };
    const sections = [];
    let blocks = [];
    const close = sect => {
      const pgSz = sect.getElementsByTagName('w:pgSz')[0];
      sections.push({ width: numberOf(pgSz, 'w:w'), height: numberOf(pgSz, 'w:h'), orient: pgSz ? pgSz.getAttribute('w:orient') : null, headers: refs(sect, 'w:headerReference'), blocks });
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
  const pageTwip = { P: [11906, 16838, 'portrait'], L: [16838, 11906, 'landscape'] };
  function wordSizeProblems(sections, expected) {
    const problems = [];
    sections.forEach((section, i) => {
      const [width, height, orient] = pageTwip[expected[i]];
      if (section.width !== width || section.height !== height || section.orient !== orient) problems.push('section ' + (i + 1) + ' : ' + section.width + ' x ' + section.height + ' ' + section.orient + ' au lieu de ' + width + ' x ' + height + ' ' + orient);
    });
    return problems;
  }

  // --- La Lecture, mesurée dans le DOM ---
  const SHEET_PX = { P: 793.71, L: 1122.52 };
  const readerBox = () => document.getElementById('reader-container');
  async function readSheets(h, html, hf) {
    h.setA4Preview(true);
    await h.renderReaderMode(html, hf);
    await h.sleep(250);
    const box = readerBox();
    const sheets = Array.from(box.querySelectorAll(':scope > .reader-content')).map(el => {
      const rect = el.getBoundingClientRect();
      const width = rect.width / EditorCore.layoutZoom(el);
      return { el, width, sense: width > 1000 ? 'L' : 'P' };
    });
    return { box, sheets, senses: sheets.map(sheet => sheet.sense).join('') };
  }

  // --- L'impression par le navigateur ---
  async function printJob(html, hf) { return PrintExport.prepare(html, null, { id: 1 }, clone(hf || NO_HF), 'essai'); }
  const printSense = sheet => (parseFloat(sheet.style.width) > 1000 ? 'L' : 'P');

  return [
    // ---------- Le nœud « Saut de page » ----------
    {
      id: 'sections_the_page_break_node_carries_the_sense_of_the_pages_that_follow',
      description: 'Le saut de page de l\'éditeur lit et écrit `data-page-orientation` (portrait ou paysage) : relu tel quel par getHTML(), un sens illisible est écarté, et un saut ordinaire garde exactement le HTML d\'avant (aucun attribut de plus)',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const run = async html => { await h.resetEditor(); Editor.setHTML(html); await h.sleep(120); return Editor.getHTML(); };
        const plain = await run('<p>A</p>' + PLAIN_BREAK + '<p>B</p>');
        if (plain.indexOf('data-page-orientation') !== -1) problems.push('un saut ordinaire écrit un sens : ' + plain);
        if (plain.indexOf(PLAIN_BREAK) === -1) problems.push('le saut ordinaire n\'est plus celui d\'avant : ' + plain);
        const turned = await run('<p>A</p>' + breakTo('landscape') + '<p>B</p>' + breakTo('portrait') + '<p>C</p>');
        if (turned.indexOf(breakTo('landscape')) === -1 || turned.indexOf(breakTo('portrait')) === -1) problems.push('les sauts tournés ne sont pas relus tels quels : ' + turned);
        const unreadable = await run('<p>A</p>' + breakTo('diagonal') + '<p>B</p>');
        if (unreadable.indexOf('data-page-orientation') !== -1) problems.push('un sens illisible est gardé : ' + unreadable);
        // Le nœud dit son sens (JSON), et sa vue de l'éditeur le porte aussi : la pagination lit le DOM.
        await run('<p>A</p>' + breakTo('landscape') + '<p>B</p>');
        const node = EditorCore.getEditor().getJSON().content.find(n => n.type === 'pageBreak');
        if (!node || !node.attrs || node.attrs.orientation !== 'landscape') problems.push('le nœud ne porte pas le sens : ' + JSON.stringify(node));
        const marker = document.querySelector('#editor-container .tiptap .page-break-marker');
        if (!marker || marker.getAttribute('data-page-orientation') !== 'landscape') problems.push('la vue du saut ne porte pas le sens');
        await run('<p>A</p>' + PLAIN_BREAK + '<p>B</p>');
        const bare = EditorCore.getEditor().getJSON().content.find(n => n.type === 'pageBreak');
        if (!bare || (bare.attrs && bare.attrs.orientation)) problems.push('un saut ordinaire porte un sens : ' + JSON.stringify(bare));
        const bareMarker = document.querySelector('#editor-container .tiptap .page-break-marker');
        if (!bareMarker || bareMarker.hasAttribute('data-page-orientation')) problems.push('la vue d\'un saut ordinaire porte un sens');
        return verdict(problems, {});
      },
    },

    // ---------- Le PDF ----------
    {
      id: 'sections_pdf_a_document_turns_its_pages_at_the_breaks_that_say_so',
      description: 'PDF d\'un DOCUMENT : portrait, un saut qui tourne en paysage, un saut qui ramène en portrait donnent trois pages P L P, le texte de chaque partie sur la sienne ; une page de départ en paysage donne L P L',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const html = lines(3, 'Alpha') + breakTo('landscape') + lines(3, 'Bravo') + breakTo('portrait') + lines(3, 'Charlie');
        const tags = ['Alpha', 'Bravo', 'Charlie'];
        let out = await pdfPages(h, html);
        if (out.sizes !== 'PLP') problems.push('sens des pages : ' + out.sizes + ' au lieu de PLP');
        problems.push(...sizeProblems(out.pages, 'PLP'));
        out.pages.forEach((page, i) => { if (tagsOn(page, tags).join() !== tags[i]) problems.push('page ' + (i + 1) + ' : « ' + tagsOn(page, tags).join(' ') + ' » au lieu de « ' + tags[i] + ' »'); });
        // Le document est paysage au départ : ses pages le sont, le saut qui dit « portrait » les ramène.
        await plainPage(h, 'landscape');
        out = await pdfPages(h, lines(3, 'Alpha') + breakTo('portrait') + lines(3, 'Bravo') + breakTo('landscape') + lines(3, 'Charlie'));
        if (out.sizes !== 'LPL') problems.push('départ paysage : sens des pages ' + out.sizes + ' au lieu de LPL');
        problems.push(...sizeProblems(out.pages, 'LPL'));
        await plainPage(h);
        return verdict(problems, {});
      },
    },

    // ---------- Le Word ----------
    {
      id: 'sections_docx_a_document_has_a_word_section_per_run_of_equal_sense',
      description: 'Word d\'un DOCUMENT : trois sections (la taille et le sens de la page de chacune), le saut qui tourne remplace le saut de page et son premier bloc ne porte pas de saut de plus ; un saut ordinaire reste un saut de page dans sa section',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const html = lines(2, 'Alpha') + PLAIN_BREAK + lines(2, 'Bravo') + breakTo('landscape') + lines(2, 'Charlie') + breakTo('portrait') + lines(2, 'Delta');
        const sections = wordSections(await h.exportDocxParts(html, null, PageLayout.getMarginsTwip()));
        if (sections.length !== 3) { problems.push(sections.length + ' section(s) au lieu de 3'); return verdict(problems, {}); }
        problems.push(...wordSizeProblems(sections, 'PLP'));
        const texts = sections.map(section => section.blocks.map(wordText).filter(Boolean).join('|'));
        const want = ['Alpha 0|Alpha 1|Bravo 0|Bravo 1', 'Charlie 0|Charlie 1', 'Delta 0|Delta 1'];
        texts.forEach((text, i) => { if (text !== want[i]) problems.push('section ' + (i + 1) + ' : « ' + text + ' » au lieu de « ' + want[i] + ' »'); });
        const breaks = sections.map(section => section.blocks.filter(wordOpensPage).map(wordText).join());
        if (JSON.stringify(breaks) !== JSON.stringify(['Bravo 0', '', ''])) problems.push('sauts de page par section : ' + JSON.stringify(breaks) + ' au lieu de [\"Bravo 0\",\"\",\"\"]');
        // Une page de départ en paysage : L P.
        await plainPage(h, 'landscape');
        const second = wordSections(await h.exportDocxParts(lines(2, 'Alpha') + breakTo('portrait') + lines(2, 'Bravo'), null, PageLayout.getMarginsTwip()));
        problems.push(...wordSizeProblems(second, 'LP'));
        if (second.length !== 2) problems.push('départ paysage : ' + second.length + ' section(s) au lieu de 2');
        await plainPage(h);
        return verdict(problems, { sections: sections.map(section => section.width + 'x' + section.height + ' ' + section.orient).join(' ; ') });
      },
    },

    // ---------- La Lecture ----------
    {
      id: 'sections_reader_a_document_is_read_on_sheets_of_the_sense_of_each_part',
      description: 'Lecture d\'un DOCUMENT : une feuille de lecture par suite de pages de même sens (793,71 px en portrait, 1 122,52 px en paysage), le texte de chaque partie sur la sienne, le facteur d\'ajustement pris sur la plus large ; sans saut tourné, une seule feuille comme avant',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const html = lines(2, 'Alpha') + breakTo('landscape') + lines(2, 'Bravo') + breakTo('portrait') + lines(2, 'Charlie');
        const { box, sheets, senses } = await readSheets(h, html);
        if (senses !== 'PLP') problems.push('feuilles : ' + senses + ' au lieu de PLP');
        sheets.forEach((sheet, i) => { if (!near(sheet.width, SHEET_PX[senses[i]], 1.5)) problems.push('feuille ' + (i + 1) + ' : ' + sheet.width.toFixed(1) + ' px'); });
        const texts = sheets.map(sheet => sheet.el.textContent.replace(/\s+/g, ' ').replace(/Saut de page/g, '').trim());
        ['Alpha', 'Bravo', 'Charlie'].forEach((tag, i) => { if (!sheets[i] || sheets[i].el.textContent.indexOf(tag + ' 0') === -1 || texts.filter(t => t.indexOf(tag + ' 0') !== -1).length !== 1) problems.push('« ' + tag + ' » n\'est pas seul sur sa feuille'); });
        if (!near(parseFloat(box.getAttribute('data-pp-widest-sheet')), SHEET_PX.L, 1.5)) problems.push('la feuille la plus large : ' + box.getAttribute('data-pp-widest-sheet'));
        // Sans saut tourné : une seule feuille, aucune trace de feuille la plus large.
        const plain = await readSheets(h, lines(2, 'Alpha') + PLAIN_BREAK + lines(2, 'Bravo'));
        if (plain.sheets.length !== 1 || box.hasAttribute('data-pp-widest-sheet')) problems.push('sans saut tourné : ' + plain.sheets.length + ' feuille(s)');
        // Un document en paysage au départ qu'un saut ramène en portrait : L P.
        await plainPage(h, 'landscape');
        const second = await readSheets(h, lines(2, 'Alpha') + breakTo('portrait') + lines(2, 'Bravo'));
        if (second.senses !== 'LP') problems.push('départ paysage : ' + second.senses + ' au lieu de LP');
        await plainPage(h);
        return verdict(problems, {});
      },
    },

    // ---------- L'impression ----------
    {
      id: 'sections_print_a_document_prints_each_part_on_sheets_of_its_page',
      description: 'Impression d\'un DOCUMENT : une feuille par page, chacune de la taille et du nom de page de son sens (portrait, paysage, portrait), rien de tourné sans saut qui tourne',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const job = await printJob(lines(2, 'Alpha') + breakTo('landscape') + lines(2, 'Bravo') + breakTo('portrait') + lines(2, 'Charlie'));
        const senses = Array.from(job.root.querySelectorAll('.pp-print-sheet')).map(printSense).join('');
        if (senses !== 'PLP') problems.push('feuilles imprimées : ' + senses + ' au lieu de PLP');
        const plain = await printJob(lines(2, 'Alpha') + PLAIN_BREAK + lines(2, 'Bravo'));
        const plainSenses = Array.from(plain.root.querySelectorAll('.pp-print-sheet')).map(printSense).join('');
        if (plainSenses !== 'PP') problems.push('sans saut tourné : ' + plainSenses + ' au lieu de PP');
        await plainPage(h);
        return verdict(problems, {});
      },
    },

    // ---------- Les images en calque d'un DOCUMENT aux pages tournées ----------
    {
      id: 'sections_images_a_repeated_image_of_a_document_is_on_every_page_of_every_section',
      description: 'Une image « Sur toutes les pages » d\'un DOCUMENT dont une page est en paysage est peinte sur TOUTES ses pages, dans le PDF (une par page), le Word (ancrée dans l\'en-tête de chacune des trois sections), la Lecture et l\'impression (copie sur chaque feuille sauf celle où elle est posée), sans copie dans le macro-modèle qui la garde dans son modèle',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const html = layerImage({ repeat: true }) + lines(2, 'Alpha') + breakTo('landscape') + lines(2, 'Bravo') + breakTo('portrait') + lines(2, 'Charlie');
        // PDF : une image par page, à la même place du coin du contenu.
        const pdf = await pdfPages(h, html);
        const perPage = pdf.pages.map(page => page.images.length).join();
        if (perPage !== '1,1,1') problems.push('PDF : images par page ' + perPage + ' au lieu de 1,1,1');
        const spots = pdf.pages.map(page => page.images[0] ? page.images[0].x.toFixed(1) + '/' + page.images[0].y.toFixed(1) : '-');
        if (new Set(spots).size !== 1) problems.push('PDF : la place de l\'image change d\'une page à l\'autre : ' + spots.join(' ; '));
        // Word : l'ancre est dans l'en-tête de chaque section.
        const parts = await h.exportDocxParts(html, null, PageLayout.getMarginsTwip());
        const sections = wordSections(parts);
        const anchors = sections.map(section => { const header = section.headers.default && parts.part(section.headers.default); return header ? h.docxDrawings(header).filter(d => d.kind === 'anchor').length : 0; });
        if (sections.length !== 3 || anchors.join() !== '1,1,1') problems.push('Word : ancres de l\'en-tête par section ' + anchors.join() + ' au lieu de 1,1,1');
        // Lecture : l'original sur la première feuille, une copie sur chacune des deux autres pages, dans la boîte de SA page.
        const read = await readSheets(h, html);
        const copies = Array.from(read.box.querySelectorAll('.v2-page-layer-copy'));
        if (copies.length !== 2) problems.push('Lecture : ' + copies.length + ' copie(s) au lieu de 2');
        const boxes = Array.from(read.box.querySelectorAll('.v2-page-layer-page')).map(box => Math.round(parseFloat(box.style.width)));
        if (boxes.join() !== '1123,794') problems.push('Lecture : largeur des boîtes de copie ' + boxes.join() + ' au lieu de 1123,794 (paysage puis portrait)');
        const originals = read.sheets.map(sheet => sheet.el.querySelectorAll('img.editor-image').length).join();
        if (originals !== '1,0,0') problems.push('Lecture : l\'original est ' + originals + ' au lieu de 1,0,0 (sur la première feuille seulement)');
        // Impression : la même chose que la Lecture (chaque feuille imprimée porte une copie entière du document mesuré, d'où ses copies comptées par feuille).
        const job = await printJob(html);
        const printCopies = job.root.querySelectorAll('.v2-page-layer-copy').length / job.pageCount;
        if (printCopies !== 2) problems.push('Impression : ' + printCopies + ' copie(s) par document mesuré au lieu de 2');
        // Un macro-modèle « Selon chaque modèle » garde l'image répétée d'un modèle dans ce modèle : le même HTML assemblé n'en peint aucune copie sur la page des autres.
        const macroHtml = await MacroTemplates.buildConcatenatedHtml({ slots: [{ type: 'fixed', modeleId: 'a' }, { type: 'fixed', modeleId: 'b' }] }, 'Clients', { id: 1 }, [
          { id: 'a', contenu: layerImage({ repeat: true }) + lines(2, 'Alpha'), marginsMm: { orientation: 'portrait' } },
          { id: 'b', contenu: lines(2, 'Bravo'), marginsMm: { orientation: 'landscape' } },
        ], { perModel: true });
        const macro = await readSheets(h, macroHtml);
        const macroCopies = macro.box.querySelectorAll('.v2-page-layer-copy').length;
        if (macro.senses !== 'PL' || macroCopies !== 0) problems.push('macro-modèle : feuilles ' + macro.senses + ', ' + macroCopies + ' copie(s) au lieu de PL et 0');
        await plainPage(h);
        return verdict(problems, { pdf: perPage, word: anchors.join(), lecture: copies.length, macro: macroCopies });
      },
    },

    {
      id: 'sections_images_a_layered_image_stays_on_its_own_page_in_a_document_with_turned_pages',
      description: 'Une image en calque posée sur la 3e page d\'un DOCUMENT portrait / paysage / portrait (sa grille de page dit « page 3 », son `top` d\'origine compte depuis le haut du document) se retrouve sur la 3e page dans la Lecture (dans la 3e feuille de lecture, pas hors d\'elle) et dans le PDF',
      async run(h) {
        const problems = [];
        await plainPage(h);
        const image = layerImage({ layer: 'front', pageIndex: 2, leftPt: 60, topPt: 80, topPx: 2300, leftPx: 100 });
        const html = lines(2, 'Alpha') + breakTo('landscape') + lines(2, 'Bravo') + breakTo('portrait') + image + lines(2, 'Charlie');
        const read = await readSheets(h, html);
        if (read.senses !== 'PLP') problems.push('feuilles : ' + read.senses + ' au lieu de PLP');
        const third = read.sheets[2];
        const img = third && third.el.querySelector('img.editor-image');
        if (!img) problems.push('l\'image n\'est pas dans la 3e feuille de lecture');
        else {
          const zoom = EditorCore.layoutZoom(third.el);
          const sheetTop = third.el.getBoundingClientRect().top;
          const offset = (img.getBoundingClientRect().top - sheetTop) / zoom;
          // Le haut du corps de la page vient de la marge du haut ; l'image est 80 pt (106,7 px) plus bas.
          const expected = (PageLayout.getMarginsPx().top) + 80 * 96 / 72;
          if (!near(offset, expected, 40)) problems.push('Lecture : l\'image est à ' + offset.toFixed(0) + ' px du haut de la 3e feuille au lieu d\'environ ' + expected.toFixed(0));
        }
        const pdf = await pdfPages(h, html);
        const perPage = pdf.pages.map(page => page.images.length).join();
        if (perPage !== '0,0,1') problems.push('PDF : images par page ' + perPage + ' au lieu de 0,0,1');
        await plainPage(h);
        return verdict(problems, { pdf: perPage });
      },
    },

    // ---------- Les macro-modèles ----------
    {
      id: 'sections_macro_imposed_sense_ignores_the_turned_pages_of_assembled_models',
      description: 'Macro-modèle assemblé : au sens imposé, les pages tournées d\'un modèle assemblé ne le suivent pas (leurs sauts redeviennent ordinaires, aucun repère de sens dans le HTML), sans saut tourné le HTML est celui d\'avant octet pour octet ; « Selon chaque modèle » les garde, chacune dans son modèle, et le modèle suivant repart de sa propre page',
      async run() {
        const problems = [];
        const templates = [
          { id: 'a', contenu: lines(1, 'Alpha') + breakTo('landscape') + lines(1, 'Bravo'), marginsMm: { orientation: 'portrait' } },
          { id: 'b', contenu: lines(1, 'Charlie') + breakTo('portrait') + lines(1, 'Delta'), marginsMm: { orientation: 'landscape' } },
        ];
        const composition = { slots: [{ type: 'fixed', modeleId: 'a' }, { type: 'fixed', modeleId: 'b' }] };
        const imposed = await MacroTemplates.buildConcatenatedHtml(composition, 'Clients', { id: 1 }, templates);
        if (PageSections.hasSenses(imposed)) problems.push('sens imposé : des repères de sens restent : ' + imposed.slice(0, 300));
        const breaks = (imposed.match(/class="page-break-marker"/g) || []).length;
        if (breaks !== 3) problems.push('sens imposé : ' + breaks + ' sauts de page au lieu de 3 (un dans chaque modèle, un entre eux)');
        ['Alpha', 'Bravo', 'Charlie', 'Delta'].forEach(tag => { if (imposed.indexOf(tag + ' 0') === -1) problems.push('sens imposé : « ' + tag + ' » a disparu'); });
        // Sans aucun saut tourné, le HTML assemblé est celui d'avant.
        const flat = templates.map(tpl => ({ ...tpl, contenu: lines(1, tpl.id) + PLAIN_BREAK + lines(1, tpl.id + '2') }));
        const legacy = flat.map(tpl => tpl.contenu).reduce((html, content, rank) => html + (rank ? MacroTemplates.slotBreakHtml(rank) : '') + content, '');
        const same = await MacroTemplates.buildConcatenatedHtml(composition, 'Clients', { id: 1 }, flat);
        if (same !== legacy) problems.push('sans saut tourné, le HTML a changé : ' + same.slice(0, 200));
        // « Selon chaque modèle » : portrait (Alpha), paysage (Bravo, puis Charlie : le modèle b est paysage), portrait (Delta).
        const perModel = await MacroTemplates.buildConcatenatedHtml(composition, 'Clients', { id: 1 }, templates, { perModel: true });
        const root = document.createElement('div');
        root.innerHTML = perModel;
        const sections = PageSections.split(root.childNodes, 'portrait');
        const senses = sections.map(section => section.orientation[0]).join('');
        if (senses !== 'plp') problems.push('« Selon chaque modèle » : sections ' + senses + ' au lieu de plp');
        const texts = sections.map(section => section.nodes.map(node => node.textContent || '').join(' '));
        const holds = [['Alpha'], ['Bravo', 'Charlie'], ['Delta']];
        holds.forEach((tags, i) => { if (!texts[i] || tags.some(tag => texts[i].indexOf(tag + ' 0') === -1)) problems.push('section ' + (i + 1) + ' : « ' + (texts[i] || '').slice(0, 80) + ' » ne porte pas ' + tags.join(' + ')); });
        return verdict(problems, { senses });
      },
    },

    // ---------- L'éditeur : une feuille de pages de largeurs différentes (lot 2) ----------
    {
      id: 'sections_editor_a_document_of_one_sense_is_shown_as_before',
      description: 'Éditeur : un document dont toutes les pages ont le même sens (sans saut tourné, avec un saut « portrait » dans un document portrait, avec un saut « paysage » dans un document paysage) garde la feuille blanche d\'avant - aucune classe de pages mêlées, aucune décoration, aucun papier peint, la largeur de la feuille du sens du document',
      async run(h) {
        const problems = [];
        const cases = [
          { name: 'ordinaire', html: lines(3, 'Alpha') + PLAIN_BREAK + lines(2, 'Bravo'), base: null, sense: 'portrait' },
          { name: 'saut portrait en portrait', html: lines(3, 'Alpha') + breakTo('portrait') + lines(2, 'Bravo'), base: null, sense: 'portrait' },
          { name: 'saut paysage en paysage', html: lines(3, 'Alpha') + breakTo('landscape') + lines(2, 'Bravo'), base: 'landscape', sense: 'landscape' },
        ];
        for (const item of cases) {
          const view = await showEditor(h, item.html, HF, item.base);
          if (view.box.classList.contains(MIXED)) problems.push(item.name + ' : le conteneur est en pages mêlées');
          if (view.box.hasAttribute('data-pp-widest-sheet')) problems.push(item.name + ' : la feuille la plus large est posée');
          if (view.papers.length) problems.push(item.name + ' : ' + view.papers.length + ' papiers peints');
          if (view.tiptap.querySelector('.pp-sec-narrow')) problems.push(item.name + ' : des blocs sont rentrés');
          const background = getComputedStyle(view.sheet).backgroundColor;
          if (background === 'rgba(0, 0, 0, 0)' || background === 'transparent') problems.push(item.name + ' : la feuille est transparente');
          if (!near(view.sheetRect.width / view.zoom, sheetPx(item.sense), 1)) problems.push(item.name + ' : feuille de ' + (view.sheetRect.width / view.zoom).toFixed(1) + ' px au lieu de ' + sheetPx(item.sense).toFixed(1));
        }
        await plainPage(h);
        return verdict(problems, { cases: cases.length });
      },
    },

    {
      id: 'sections_editor_mixed_senses_give_the_sheet_the_widest_page_and_each_page_a_paper',
      description: 'Éditeur : un document portrait / paysage / portrait a une feuille transparente de la largeur de la plus large de ses pages (le facteur d\'ajustement se règle sur elle : pas de défilement horizontal), et un papier par page, à la taille de son sens, centré sur la feuille, avec la gouttière habituelle entre deux papiers',
      async run(h) {
        const problems = [];
        const view = await showEditor(h, lines(4, 'Alpha') + breakTo('landscape') + lines(4, 'Bravo') + breakTo('portrait') + lines(4, 'Charlie'), HF);
        if (!view.box.classList.contains(MIXED)) problems.push('le conteneur n\'est pas en pages mêlées');
        const widest = parseFloat(view.box.getAttribute('data-pp-widest-sheet'));
        if (!near(widest, sheetPx('landscape'), 1)) problems.push('feuille la plus large : ' + widest + ' au lieu de ' + sheetPx('landscape').toFixed(1));
        if (!near(view.sheetRect.width / view.zoom, sheetPx('landscape'), 1)) problems.push('largeur de la feuille : ' + (view.sheetRect.width / view.zoom).toFixed(1));
        const background = getComputedStyle(view.sheet).backgroundColor;
        if (!(background === 'rgba(0, 0, 0, 0)' || background === 'transparent')) problems.push('la feuille n\'est pas transparente : ' + background);
        if (view.box.scrollWidth > view.box.clientWidth + 1) problems.push('défilement horizontal : ' + view.box.scrollWidth + ' pour ' + view.box.clientWidth);
        const senses = ['portrait', 'landscape', 'portrait'];
        if (view.papers.length !== 3) problems.push(view.papers.length + ' papiers au lieu de 3');
        const gutter = view.box.querySelector('.v2-page-seam-divider').getBoundingClientRect().height / view.zoom;
        view.papers.forEach((paper, k) => {
          const sense = senses[k];
          if (!near(paper.width, sheetPx(sense), 1.5)) problems.push('papier ' + (k + 1) + ' : ' + paper.width.toFixed(1) + ' px de large au lieu de ' + sheetPx(sense).toFixed(1));
          if (!near(paper.height, heightPx(sense), 1.5)) problems.push('papier ' + (k + 1) + ' : ' + paper.height.toFixed(1) + ' px de haut au lieu de ' + heightPx(sense).toFixed(1));
          if (!near(paper.left, (view.sheetRect.width / view.zoom - paper.width) / 2, 1.5)) problems.push('papier ' + (k + 1) + ' n\'est pas centré : ' + paper.left.toFixed(1));
          const next = view.papers[k + 1];
          if (next && !near(next.top - (paper.top + paper.height), gutter, 1.5)) problems.push('gouttière après le papier ' + (k + 1) + ' : ' + (next.top - (paper.top + paper.height)).toFixed(1) + ' au lieu de ' + gutter.toFixed(1));
        });
        await plainPage(h);
        return verdict(problems, { papers: view.papers.map(paper => Math.round(paper.width) + 'x' + Math.round(paper.height)).join(' ') });
      },
    },

    {
      id: 'sections_editor_the_text_of_each_page_spans_its_own_page_width',
      description: 'Éditeur : le texte d\'une page portrait (à côté d\'une page paysage) a la largeur utile de SA page - le même que dans le PDF, le Word, la Lecture et l\'impression -, rentré de la marge de son papier, le texte de la page paysage la largeur utile du paysage ; le HTML du modèle ne garde aucune trace de ces décorations',
      async run(h) {
        const problems = [];
        const html = lines(3, 'Alpha') + breakTo('landscape') + lines(3, 'Bravo') + breakTo('portrait') + lines(3, 'Charlie');
        const view = await showEditor(h, html, null);
        const m = PageLayout.getMarginsPx();
        const useful = sense => sheetPx(sense) - m.left - m.right;
        const paragraph = tag => Array.from(view.tiptap.querySelectorAll('p')).find(el => el.textContent.indexOf(tag + ' 0') === 0);
        [['Alpha', 'portrait', 0], ['Bravo', 'landscape', 1], ['Charlie', 'portrait', 2]].forEach(([tag, sense, rank]) => {
          const el = paragraph(tag);
          const paper = view.papers[rank];
          if (!el || !paper) { problems.push(tag + ' : introuvable'); return; }
          const rect = el.getBoundingClientRect();
          if (!near(rect.width / view.zoom, useful(sense), 1.5)) problems.push(tag + ' : ' + (rect.width / view.zoom).toFixed(1) + ' px de large au lieu de ' + useful(sense).toFixed(1));
          const inset = (rect.left - view.sheetRect.left) / view.zoom - paper.left;
          if (!near(inset, m.left, 1.5)) problems.push(tag + ' : ' + inset.toFixed(1) + ' px du bord de son papier au lieu de ' + m.left.toFixed(1));
        });
        const html2 = Editor.getHTML();
        if (/pp-sec-|pp-mixed|--pp-/.test(html2)) problems.push('le HTML du modèle porte une trace des pages mêlées : ' + (html2.match(/pp-sec-|pp-mixed|--pp-/) || [])[0]);
        if (html2.indexOf('data-page-orientation="landscape"') === -1 || html2.indexOf('data-page-orientation="portrait"') === -1) problems.push('le HTML du modèle a perdu le sens des sauts de page');
        await plainPage(h);
        return verdict(problems, {});
      },
    },

    {
      id: 'sections_editor_each_page_holds_what_its_sense_holds',
      description: 'Éditeur : la pagination compte la place de chaque page selon son sens - une page paysage en tient moins qu\'une page portrait, avec un en-tête et un pied comme sans : aucune page ne dépasse la hauteur utile de son sens, une coupure automatique tombe quand le bloc suivant ne tiendrait plus, et le dernier bloc de chaque page finit au-dessus de la marge du bas de son papier',
      async run(h) {
        const problems = [];
        const summary = {};
        for (const [name, hf] of [['sans en-tête', NO_HF], ['avec en-tête et pied', HF]]) {
          const view = await showEditor(h, lines(2, 'Alpha') + breakTo('landscape') + lines(70, 'Bravo') + breakTo('portrait') + lines(70, 'Charlie'), hf);
          const breaks = HeaderFooterPreview.pageBreaks();
          const senses = PageSectionView.pageSenses(breaks);
          const children = Array.from(view.tiptap.children);
          const m = PageLayout.getMarginsPx();
          const bands = hf.enabled ? 2 * (PageLayout.HEADER_FOOTER_ZONE_PX + PageLayout.HEADER_FOOTER_GAP_PX) : 0;
          const capacity = sense => heightPx(sense) - m.top - m.bottom - bands;
          const heightOf = el => el.getBoundingClientRect().height / view.zoom;
          const ends = breaks.map(brk => children.indexOf(brk.afterEl));
          ends.push(children.length - 1);
          let start = 0;
          const perPage = [];
          ends.forEach((end, k) => {
            const blocks = children.slice(start, end + 1);
            const used = blocks.reduce((sum, el) => sum + heightOf(el), 0);
            perPage.push(blocks.length);
            if (used > capacity(senses[k]) + 1) problems.push(name + ' : la page ' + (k + 1) + ' (' + senses[k] + ') prend ' + used.toFixed(0) + ' px pour ' + capacity(senses[k]).toFixed(0));
            const next = children[end + 1];
            if (k < breaks.length && !breaks[k].forced && next && used + heightOf(next) <= capacity(senses[k]) - 1) problems.push(name + ' : la page ' + (k + 1) + ' aurait pu garder le bloc suivant');
            const paper = view.papers[k];
            const last = blocks[blocks.length - 1];
            // Une page pleine a la hauteur de son papier : la couture qui la ferme compte la place de SON sens.
            if (paper && k < breaks.length && !near(paper.height, heightPx(senses[k]), 2)) problems.push(name + ' : le papier de la page ' + (k + 1) + ' (' + senses[k] + ') est haut de ' + paper.height.toFixed(1) + ' px au lieu de ' + heightPx(senses[k]).toFixed(1));
            if (paper && last && k < breaks.length) {
              const bottomOfBody = view.sheetRect.top + (paper.top + paper.height - m.bottom - (hf.enabled ? PageLayout.HEADER_FOOTER_ZONE_PX + PageLayout.HEADER_FOOTER_GAP_PX : 0)) * view.zoom;
              if (last.getBoundingClientRect().bottom > bottomOfBody + 1.5) problems.push(name + ' : la page ' + (k + 1) + ' déborde le bas de son papier');
            }
            start = end + 1;
          });
          if (view.papers.length !== ends.length) problems.push(name + ' : ' + view.papers.length + ' papiers pour ' + ends.length + ' pages');
          summary[name] = { pages: senses.map(sense => sense[0]).join(''), perPage: perPage.join('/') };
          if (!(senses.indexOf('landscape') > 0 && senses.indexOf('portrait', 1) > 0)) problems.push(name + ' : les sens des pages sont ' + senses.join());
        }
        // Le même nombre de lignes tient mieux sur une page portrait que sur une page paysage : 2 pages portrait pour 70 lignes contre 3 pages paysage.
        const landscapePages = (summary['avec en-tête et pied'].pages.match(/l/g) || []).length;
        const portraitPages = (summary['avec en-tête et pied'].pages.match(/p/g) || []).length - 1;
        if (!(landscapePages > portraitPages)) problems.push('pages paysage ' + landscapePages + ' pour ' + portraitPages + ' pages portrait : la place d\'une page paysage n\'est pas plus petite');
        await plainPage(h);
        return verdict(problems, summary);
      },
    },

    {
      id: 'sections_editor_seams_and_edge_zones_have_the_width_of_their_page',
      description: 'Éditeur : avec un en-tête et un pied, le bas de la page qui finit et le haut de la page qui commence (la couture) ont chacun la largeur de SA page, centrée sur la feuille, la gouttière celle de la feuille entière ; la zone d\'en-tête de la première page et celle du pied de la dernière ont la largeur de leur page',
      async run(h) {
        const problems = [];
        const wide = async (html, senses, edges) => {
          const view = await showEditor(h, html, HF);
          const seams = Array.from(view.box.querySelectorAll('.v2-pagination-overlay .v2-page-seam'));
          const sheetW = view.sheetRect.width / view.zoom;
          const box = el => { const r = el.getBoundingClientRect(); return { width: r.width / view.zoom, left: (r.left - view.sheetRect.left) / view.zoom }; };
          const check = (label, el, sense) => {
            if (!el) { problems.push(label + ' : introuvable'); return; }
            const b = box(el);
            if (!near(b.width, sheetPx(sense), 1.5)) problems.push(label + ' : ' + b.width.toFixed(1) + ' px au lieu de ' + sheetPx(sense).toFixed(1));
            if (!near(b.left, (sheetW - sheetPx(sense)) / 2, 1.5)) problems.push(label + ' : décalé de ' + b.left.toFixed(1) + ' px');
          };
          if (seams.length !== senses.length - 1) problems.push(senses.join('') + ' : ' + seams.length + ' coutures');
          seams.forEach((seam, k) => {
            check('couture ' + (k + 1) + ', bas de la page ' + (k + 1), seam.querySelector('.v2-page-seam-foot'), senses[k]);
            check('couture ' + (k + 1) + ', haut de la page ' + (k + 2), seam.querySelector('.v2-page-seam-head'), senses[k + 1]);
            const divider = seam.querySelector('.v2-page-seam-divider');
            if (divider && !near(box(divider).width, sheetW, 1.5)) problems.push('gouttière ' + (k + 1) + ' : ' + box(divider).width.toFixed(1) + ' px au lieu de ' + sheetW.toFixed(1));
            const text = seam.textContent;
            if (text.indexOf('PIED') === -1 || text.indexOf('EN-TETE') === -1) problems.push('couture ' + (k + 1) + ' : « ' + text.slice(0, 40) + ' » sans le pied ou l\'en-tête');
          });
          check('zone d\'en-tête de la première page', view.box.querySelector('.v2-page-edge-top'), senses[0]);
          check('zone de pied de la dernière page', view.box.querySelector('.v2-page-edge-bottom'), senses[senses.length - 1]);
          return view;
        };
        await wide(lines(2, 'Alpha') + breakTo('landscape') + lines(2, 'Bravo') + breakTo('portrait') + lines(2, 'Charlie'), ['portrait', 'landscape', 'portrait']);
        await wide(lines(2, 'Alpha') + breakTo('landscape') + lines(2, 'Bravo'), ['portrait', 'landscape']);
        await plainPage(h);
        return verdict(problems, {});
      },
    },

    {
      id: 'sections_editor_a_wide_table_is_trimmed_to_its_own_page',
      description: 'Éditeur : un tableau de 1000 px, rogné à la largeur utile de la page où il tombe - 719 px sur une page portrait à côté d\'une page paysage, rien sur la page paysage (1048 px) -, comme un tableau trop large l\'est sur une page de la largeur de la feuille',
      async run(h) {
        const problems = [];
        const table = '<table><tbody><tr><td colwidth="500"><p>un</p></td><td colwidth="500"><p>deux</p></td></tr></tbody></table>';
        const html = lines(1, 'Alpha') + table + breakTo('landscape') + lines(1, 'Bravo') + table;
        const view = await showEditor(h, html, null);
        await h.sleep(300);
        const m = PageLayout.getMarginsPx();
        const widths = [];
        EditorCore.getEditor().state.doc.descendants(node => {
          if (node.type.name === 'table') { let total = 0; node.firstChild.forEach(cell => { total += (cell.attrs.colwidth || [0]).reduce((sum, w) => sum + w, 0); }); widths.push(total); }
          return node.type.name !== 'table';
        });
        const portraitUseful = sheetPx('portrait') - m.left - m.right;
        const landscapeUseful = sheetPx('landscape') - m.left - m.right;
        if (widths.length !== 2) problems.push(widths.length + ' tableaux au lieu de 2');
        else {
          if (!(widths[0] <= portraitUseful + 4 && widths[0] >= portraitUseful - 40)) problems.push('tableau de la page portrait : ' + widths[0] + ' px pour ' + portraitUseful.toFixed(0) + ' utiles');
          if (widths[1] !== 1000) problems.push('tableau de la page paysage : ' + widths[1] + ' px au lieu de 1000 (il tient dans ' + landscapeUseful.toFixed(0) + ')');
        }
        const first = view.tiptap.querySelector('table');
        if (first) {
          const wrapper = first.closest('.tiptap > *');
          const rect = first.getBoundingClientRect();
          const paper = view.papers[0];
          if (paper && rect.right > view.sheetRect.left + (paper.left + paper.width - m.right + 3) * view.zoom) problems.push('le tableau de la page portrait dépasse le bord droit de son papier');
          if (wrapper && !wrapper.classList.contains('pp-sec-narrow')) problems.push('le tableau de la page portrait n\'est pas rentré');
        }
        await plainPage(h);
        return verdict(problems, { widths: widths.join('/') });
      },
    },

    {
      id: 'sections_editor_changing_the_page_sense_of_the_template_swaps_the_narrow_pages',
      description: 'Éditeur : changer le sens des marges du modèle (la première page est paysage) refait les pages sans toucher au document - les blocs rentrés, les papiers et la feuille se relisent -, et retirer les sauts tournés rend la feuille blanche d\'un seul sens',
      async run(h) {
        const problems = [];
        const html = lines(3, 'Alpha') + breakTo('landscape') + lines(3, 'Bravo') + breakTo('portrait') + lines(3, 'Charlie');
        const view = await showEditor(h, html, null);
        const narrow = () => Array.from(view.tiptap.querySelectorAll(':scope > .pp-sec-narrow')).map(el => el.textContent.slice(0, 7));
        const before = narrow();
        if (view.papers.length !== 3) problems.push('avant : ' + view.papers.length + ' papiers');
        if (before.length !== 7) problems.push('avant : ' + before.length + ' blocs rentrés au lieu de 7 (les 3 lignes de la première page, son saut, les 3 de la troisième)');
        // Le modèle passe en paysage : la page 1 et la page 2 le sont, seule la page 3 reste portrait.
        PageLayout.setMarginsMm({ orientation: 'landscape' });
        OrientationToggle.sync();
        document.dispatchEvent(new CustomEvent('pp:pageLayoutChanged'));
        await h.sleep(500);
        const sheet = view.box.querySelector('.v2-page-sheet');
        const zoom = parseFloat(getComputedStyle(sheet).zoom) || 1;
        const papers = Array.from(view.box.querySelectorAll('.v2-page-paper')).map(el => Math.round(el.getBoundingClientRect().width / zoom));
        const after = narrow();
        if (papers.join() !== [sheetPx('landscape'), sheetPx('landscape'), sheetPx('portrait')].map(Math.round).join()) problems.push('après : papiers ' + papers.join() + ' au lieu de paysage, paysage, portrait');
        if (after.length !== 3 || after.some(text => text.indexOf('Charlie') !== 0)) problems.push('après : blocs rentrés ' + after.join('|') + ' au lieu des 3 lignes de la page portrait');
        // Plus aucun saut tourné : la feuille redevient celle d'un seul sens, blanche.
        PageLayout.setMarginsMm(null);
        OrientationToggle.sync();
        Editor.setHTML(lines(3, 'Alpha') + PLAIN_BREAK + lines(3, 'Bravo'));
        Editor.refreshLayout();
        document.dispatchEvent(new CustomEvent('pp:pageLayoutChanged'));
        await h.sleep(500);
        if (view.box.classList.contains(MIXED)) problems.push('sans saut tourné : le conteneur reste en pages mêlées');
        if (view.box.hasAttribute('data-pp-widest-sheet') || view.box.style.getPropertyValue('--pp-sec-gap')) problems.push('sans saut tourné : la feuille la plus large ou l\'écart sont restés posés');
        if (view.box.querySelector('.v2-page-papers')) problems.push('sans saut tourné : les papiers sont restés');
        if (view.tiptap.querySelector('.pp-sec-narrow')) problems.push('sans saut tourné : des blocs restent rentrés');
        const background = getComputedStyle(sheet).backgroundColor;
        if (background === 'rgba(0, 0, 0, 0)' || background === 'transparent') problems.push('sans saut tourné : la feuille est restée transparente');
        if (!near(sheet.getBoundingClientRect().width / (parseFloat(getComputedStyle(sheet).zoom) || 1), sheetPx('portrait'), 1)) problems.push('sans saut tourné : feuille de ' + sheet.getBoundingClientRect().width.toFixed(1));
        await plainPage(h);
        return verdict(problems, { before: before.length, after: after.length, papers: papers.join() });
      },
    },

    {
      id: 'sections_editor_the_marker_of_a_turned_page_says_which_way_it_turns',
      description: 'Éditeur : le repère d\'un saut de page qui tourne dit dans quel sens (« la suite en paysage » / « la suite en portrait »), le saut ordinaire garde son libellé d\'avant, et le texte vient des deux langues',
      async run(h) {
        const problems = [];
        const view = await showEditor(h, lines(1, 'Alpha') + breakTo('landscape') + lines(1, 'Bravo') + breakTo('portrait') + lines(1, 'Charlie') + PLAIN_BREAK + lines(1, 'Delta'), null);
        const markers = Array.from(view.tiptap.querySelectorAll('.page-break-marker'));
        const want = [I18n.t('pageBreak.markerLandscape'), I18n.t('pageBreak.markerPortrait'), I18n.t('pageBreak.marker')];
        if (markers.length !== 3) problems.push(markers.length + ' repères au lieu de 3');
        markers.forEach((marker, k) => { if (marker.textContent.trim() !== want[k]) problems.push('repère ' + (k + 1) + ' : « ' + marker.textContent.trim() + ' » au lieu de « ' + want[k] + ' »'); });
        if (new Set(want).size !== 3) problems.push('les trois libellés ne sont pas distincts : ' + want.join(' | '));
        if (!/paysage|landscape/i.test(want[0]) || !/portrait/i.test(want[1])) problems.push('les libellés ne disent pas le sens : ' + want.slice(0, 2).join(' | '));
        ['pageBreak.markerLandscape', 'pageBreak.markerPortrait'].forEach(key => {
          const entry = I18n.translations && I18n.translations[key];
          if (entry && (!entry.fr || !entry.en)) problems.push(key + ' : une langue manque');
        });
        await plainPage(h);
        return verdict(problems, { labels: want.join(' | ') });
      },
    },

    {
      id: 'sections_editor_a_two_columns_zone_is_measured_on_its_own_page',
      description: 'Éditeur : la largeur utile qu\'une zone à deux colonnes lit pour sa saisie en mm est celle de sa page (190,2 mm sur une page portrait, 277,2 mm sur une page paysage) dans un document aux pages mêlées, et celle des marges du modèle dans un document d\'un seul sens',
      async run(h) {
        const problems = [];
        const view = await showEditor(h, lines(1, 'Alpha') + breakTo('landscape') + lines(1, 'Bravo') + breakTo('portrait') + lines(1, 'Charlie'), null);
        const mm = tag => PageSectionView.contentWidthMmAt(Array.from(view.tiptap.querySelectorAll('p')).find(el => el.textContent.indexOf(tag + ' 0') === 0));
        const portraitMm = PageLayout.withOrientation('portrait', () => PageLayout.getContentWidthMm());
        const landscapeMm = PageLayout.withOrientation('landscape', () => PageLayout.getContentWidthMm());
        [['Alpha', portraitMm], ['Bravo', landscapeMm], ['Charlie', portraitMm]].forEach(([tag, expected]) => {
          if (!near(mm(tag), expected, 0.2)) problems.push(tag + ' : ' + mm(tag).toFixed(1) + ' mm au lieu de ' + expected.toFixed(1));
        });
        const plain = await showEditor(h, lines(2, 'Alpha'), null);
        const alpha = Array.from(plain.tiptap.querySelectorAll('p'))[0];
        if (!near(PageSectionView.contentWidthMmAt(alpha), PageLayout.getContentWidthMm(), 0.001)) problems.push('document d\'un seul sens : ' + PageSectionView.contentWidthMmAt(alpha) + ' mm au lieu de ' + PageLayout.getContentWidthMm());
        await plainPage(h);
        return verdict(problems, { portraitMm: portraitMm.toFixed(1), landscapeMm: landscapeMm.toFixed(1) });
      },
    },

    // ---------- L'éditeur : les images en calque ----------
    {
      id: 'sections_editor_a_layered_image_follows_its_page_and_stays_behind_the_text',
      description: 'Éditeur : une image « derrière le texte » sur la page portrait d\'un document aux pages mêlées se montre à sa place de SA page (`left` compté depuis le coin de la page, rien de l\'écart de la feuille dans ce qui s\'enregistre ni dans sa grille), reste derrière le texte (aucun ancêtre de l\'<img> ne forme un contexte d\'empilement : le z-index négatif joue sur le texte), et « Sur toutes les pages » la peint à la même place du papier de chaque page',
      async run(h) {
        const problems = [];
        const bare = o => '<p><img class="editor-image" src="' + PNG + '" alt="" style="width: 40px; height: 40px; position: absolute; left: ' + o.left + 'px; top: ' + o.top + 'px; z-index: -1;" data-layer="behind" data-wrap="inline"' + (o.repeat ? ' data-repeat="true"' : '') + '></p>';
        const html = bare({ left: 100, top: 100, repeat: true }) + lines(6, 'Alpha') + breakTo('landscape') + lines(3, 'Bravo') + breakTo('portrait') + lines(3, 'Charlie');
        const view = await showEditor(h, html, null);
        HeaderFooterPreview.migrateLegacyImagePositions();
        await h.sleep(200);
        HeaderFooterPreview.renderPaginationOverlay();
        await h.sleep(300);
        const m = PageLayout.getMarginsPx();
        const img = view.tiptap.querySelector('img.editor-image');
        const wrap = img && img.closest('.editor-image-view');
        if (!img || !wrap) return verdict(['image introuvable'], {});
        const paper = view.papers[0];
        const rect = img.getBoundingClientRect();
        const shownLeft = (rect.left - view.sheetRect.left) / view.zoom - paper.left;
        if (!near(shownLeft, 100, 1.5)) problems.push('l\'image est à ' + shownLeft.toFixed(1) + ' px du bord de son papier au lieu de 100');
        if (!near(wrap.offsetLeft - PageSectionView.layerGapAt(wrap), 100, 1.5)) problems.push('left enregistrable : ' + (wrap.offsetLeft - PageSectionView.layerGapAt(wrap)) + ' au lieu de 100');
        let attrs = null;
        EditorCore.getEditor().state.doc.descendants(node => { if (!attrs && node.type.name === 'editorImage') attrs = node.attrs; });
        if (!attrs || attrs.pageIndex !== 0) problems.push('grille : page ' + (attrs && attrs.pageIndex));
        else if (!near(attrs.pageLeftPt * PT, 100 - m.left, 1.5)) problems.push('grille : ' + (attrs.pageLeftPt * PT).toFixed(1) + ' px depuis le texte au lieu de ' + (100 - m.left).toFixed(1) + ' (l\'écart de la feuille y est entré)');
        // Derrière le texte : ni l'<img> ni ses ancêtres, jusqu'à `.tiptap`, ne forment un contexte d'empilement qui garderait son z-index à l'intérieur.
        const stacking = el => { const cs = getComputedStyle(el); return cs.transform !== 'none' || (cs.translate && cs.translate !== 'none') || cs.filter !== 'none' || cs.isolation === 'isolate' || parseFloat(cs.opacity) < 1 || cs.perspective !== 'none' || (cs.position !== 'static' && cs.zIndex !== 'auto') || cs.willChange !== 'auto'; };
        for (let el = img.parentElement; el && el !== view.tiptap; el = el.parentElement) if (stacking(el)) problems.push('un ancêtre de l\'image forme un contexte d\'empilement : ' + el.tagName + '.' + el.className);
        if (getComputedStyle(img).zIndex !== '-1') problems.push('z-index de l\'image : ' + getComputedStyle(img).zIndex);
        // « Sur toutes les pages » : une copie sur chacune des deux autres pages, à la même place du papier que l'original sur le sien.
        const boxes = Array.from(view.box.querySelectorAll('.v2-page-layer-page'));
        if (boxes.length !== 2) problems.push(boxes.length + ' pages portent une copie au lieu de 2');
        boxes.forEach((box, k) => {
          const copy = box.querySelector('img');
          if (!copy) { problems.push('page ' + (k + 2) + ' : pas de copie'); return; }
          const at = (copy.getBoundingClientRect().left - box.getBoundingClientRect().left) / view.zoom;
          if (!near(at, 100, 1.5)) problems.push('page ' + (k + 2) + ' : la copie est à ' + at.toFixed(1) + ' px du bord de la page au lieu de 100');
          const wantWidth = sheetPx(k === 0 ? 'landscape' : 'portrait');
          if (!near(parseFloat(box.style.width), wantWidth, 1.5)) problems.push('page ' + (k + 2) + ' : boîte de ' + box.style.width + ' au lieu de ' + wantWidth.toFixed(1));
        });
        await plainPage(h);
        return verdict(problems, { shownLeft: shownLeft.toFixed(1), grid: attrs && attrs.pageLeftPt });
      },
    },

    {
      id: 'sections_editor_the_image_toolbar_aligns_and_layers_on_the_page_of_the_image',
      description: 'Éditeur : sur la page portrait d\'un document aux pages mêlées, les boutons « à gauche / au centre / à droite » de l\'image en calque l\'alignent sur le texte de SA page (le centre du papier, les marges de son papier), et le passage d\'une image en ligne « derrière le texte » la laisse où elle était, sans saut, avec une grille de page sans l\'écart de la feuille',
      async run(h) {
        const problems = [];
        const barWith = action => [...document.querySelectorAll('.v2-floating-toolbar')].find(el => el.querySelector('button[data-action="' + action + '"]')) || null;
        const press = action => { const bar = barWith(action); const btn = bar && bar.querySelector('button[data-action="' + action + '"]'); if (!btn) throw new Error('bouton « ' + action + ' » introuvable'); btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); };
        const inline = '<p><img class="editor-image" src="' + PNG + '" alt="" style="width: 40px;"></p>';
        const view = await showEditor(h, inline + lines(5, 'Alpha') + breakTo('landscape') + lines(3, 'Bravo'), null);
        const editor = EditorCore.getEditor();
        const m = PageLayout.getMarginsPx();
        let pos = -1;
        editor.state.doc.descendants((node, p) => { if (pos < 0 && node.type.name === 'editorImage') pos = p; });
        editor.view.focus();
        editor.commands.setNodeSelection(pos);
        await h.sleep(200);
        const imgOf = () => view.tiptap.querySelector('img.editor-image');
        const paper = view.papers[0];
        const place = () => { const r = imgOf().getBoundingClientRect(); return { left: (r.left - view.sheetRect.left) / view.zoom - paper.left, right: (r.right - view.sheetRect.left) / view.zoom - paper.left, top: r.top, width: r.width / view.zoom }; };
        const before = place();
        press('layer-behind');
        await h.sleep(300);
        const layered = place();
        if (!near(layered.left, before.left, 2)) problems.push('derrière le texte : l\'image a sauté de ' + before.left.toFixed(1) + ' à ' + layered.left.toFixed(1) + ' px du bord de son papier');
        let attrs = null;
        editor.state.doc.descendants(node => { if (!attrs && node.type.name === 'editorImage') attrs = node.attrs; });
        if (!attrs || attrs.layer !== 'behind') problems.push('le calque n\'est pas « derrière »');
        else if (!near(attrs.pageLeftPt * PT, layered.left - m.left, 1.5)) problems.push('grille : ' + (attrs.pageLeftPt * PT).toFixed(1) + ' px depuis le texte au lieu de ' + (layered.left - m.left).toFixed(1));
        editor.commands.setNodeSelection(pos);
        await h.sleep(150);
        const wantCenter = paper.width / 2;
        press('align-center');
        await h.sleep(250);
        const centered = place();
        if (!near((centered.left + centered.right) / 2, wantCenter, 1.5)) problems.push('au centre : ' + ((centered.left + centered.right) / 2).toFixed(1) + ' px au lieu de ' + wantCenter.toFixed(1));
        press('align-left');
        await h.sleep(250);
        if (!near(place().left, m.left, 1.5)) problems.push('à gauche : ' + place().left.toFixed(1) + ' px au lieu de ' + m.left.toFixed(1));
        press('align-right');
        await h.sleep(250);
        if (!near(place().right, paper.width - m.right, 1.5)) problems.push('à droite : ' + place().right.toFixed(1) + ' px au lieu de ' + (paper.width - m.right).toFixed(1));
        await plainPage(h);
        return verdict(problems, { before: before.left.toFixed(1), layered: layered.left.toFixed(1) });
      },
    },
  ];
})();
