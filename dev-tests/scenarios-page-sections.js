// Orientation par page d'un document (demande d'Antoine, 22/10 : « au sein d'un modèle avoir une page en paysage et les autres en portrait », un menu du bouton Page pour dire si le choix
// vaut pour tout le document ou pour la page choisie). Une page tournée n'est qu'un saut de page qui porte le sens des pages qui le suivent (`data-page-orientation`, js/page-sections.js),
// le repère que la Lecture, le PDF, le Word et l'impression lisent déjà dans un macro-modèle aux sens mêlés (groupe `mixedOrientation`) : ce fichier épingle ce contrat pour le HTML d'un
// DOCUMENT ordinaire, dont la page de départ est celle des marges (`PageLayout`), puis, lot après lot, l'éditeur (feuilles de largeurs différentes, pagination par section) et le menu.
//
// Lot 1 (données et sorties) : le nœud « Saut de page » porte le sens (`orientation`, nul par défaut : le HTML d'un saut ordinaire ne change pas d'un octet), un macro-modèle au sens imposé ne
// laisse pas les pages tournées d'un modèle assemblé le suivre, « Selon chaque modèle » les garde.
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
  ];
})();
