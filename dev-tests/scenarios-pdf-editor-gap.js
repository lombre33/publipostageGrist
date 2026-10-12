// Suite "pdfEditorGap" - les écarts de pagination entre le PDF et l'éditeur, relevés par la batterie `macroPages` (09/10) et tranchés par Antoine : le 2026-10-11 (carte « Corriger quels écarts entre le PDF et
// l'éditeur ? », réponse « Les deux »), puis le 2026-10-12 pour la hauteur du trait (carte « Donner la même hauteur au trait dans l'éditeur, la Lecture et le PDF ? », réponse « Aligner »).
//
// 1. Le paragraphe à cheval sur le bas d'une page. L'éditeur, la Lecture et l'impression le passent en entier sur la page suivante (un bloc de texte qui ne tient pas dans la place qui reste ouvre la page : il n'est
//    jamais coupé entre deux lignes) ; le PDF (pdfmake) le coupait là où la page finit. Il garde maintenant d'une pièce un paragraphe de plusieurs lignes qui tient dans une page (moins de 90 %, le plafond des lignes
//    de tableau), au premier niveau comme dans une colonne de zone : parfois un peu de blanc en bas de page, comme dans l'éditeur. Au-delà de 90 % d'une page, ou pour un paragraphe qui porte une image en calque comme
//    ancre, une légende, une suite « Garder avec le suivant » : comme avant, rien n'est perdu.
// 2. Le trait (`<hr>`), en deux temps. (a) La batterie voyait « un trait juste après une zone de deux pages » donner 3 pages au PDF au lieu de 2. Cette page de plus n'existe pas dans le PDF que l'on télécharge : la
//    sonde de test (helpers.js:exportPdfContent) met le même document en page DEUX fois, et pdfmake allonge alors le trait à chaque mise en page. Le PDF réel est la première, `result.blob` : toute la suite lit
//    celle-là, jamais `result.base64`. Un cas garde cette vérité (le trait n'ajoute aucune page). (b) Le trait prenait 21 px dans l'éditeur, 16 px en Lecture, 13,3 px au PDF, et la pagination de l'éditeur et de la
//    Lecture, qui additionne des hauteurs de blocs SANS leurs marges, ne comptait pas les 20 px d'air du trait : avec plusieurs traits les pages ne tombaient plus aux mêmes lignes (l'éditeur en mettait huit de
//    trop sur la première). Il pèse maintenant 21 px partout (l'air est en remplissage dans l'éditeur et la Lecture, un bloc de 15,75 pt d'un seul tenant au PDF) : deux cas le mesurent, puis comparent les pages.
//
// 3. Le trait dans un conteneur (carte du 2026-10-12 « Corriger le trait du PDF dans les colonnes, cases et listes ? », réponse « Corriger »). Le PDF écrivait le trait sur 515 pt en dur (plus court que le texte, débordant sur la colonne voisine d'une zone) et ne le
//    dessinait pas du tout dans une case de tableau, un élément de liste ni une citation. Il a maintenant la largeur de ce qui le contient et se voit dans chacun, à 21 px de haut comme dans l'éditeur et la Lecture ; deux cas le mesurent (largeur, présence, hauteur ;
//    puis l'ordre et les distances de dix documents) et comparent le PDF à l'éditeur.
//
// Comment la suite juge. Les capacités de page sont MESURÉES (jamais écrites en dur : elles dépendent des polices de la machine) sur le PDF, la référence de ce qui tient dans une page ; chaque moteur rend ensuite le
// même document (éditeur en Aperçu A4, Lecture, impression navigateur, PDF relu par pdf.js) : mêmes pages, mêmes mots sur chacune.
(function () {
  const cases = [];
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

  // --- Fixtures ---
  const rows = (k, tag) => Array.from({ length: k }, (_, i) => '<p>' + tag + ' ' + i + '</p>').join('');
  // Des mots de même longueur et tous différents : la coupure de ligne est la même dans tous les moteurs, et un mot perdu ou doublé se voit.
  const tokens = (tag, n) => Array.from({ length: n }, (_, i) => tag + 'w' + (1000 + i)).join(' ');
  const longPara = (tag, n) => '<p>' + tokens(tag, n) + '</p>';
  const zone = (left, right) => '<div class="two-columns-zone" style="--layout-left: 50%"><div class="two-columns-column">' + left + '</div><div class="two-columns-column">' + right + '</div></div>';
  const zoneOfRows = (k, tag) => zone(rows(k, tag + 'G'), rows(k, tag + 'D'));
  const FIN = '<p>Fin du modele.</p>';
  const NOTE = n => '<sup class="footnote-ref-marker" data-note-id="' + n + '" data-note-text="NOTE' + n + ' texte de la note"></sup>';
  // Une image en calque posée sur la page 1 par sa grille de page (le geste de la glisser dans l'Aperçu A4) : c'est la grille, pas la ligne qui la porte, qui la place dans le PDF.
  const layerImage = '<p><img class="editor-image" src="' + TINY_PNG + '" alt="" style="width: 40px; height: 40px; position: absolute; left: 200px; top: 160px; z-index: 5;" data-layer="front" data-wrap="inline" data-page-index="0" data-page-left-pt="150" data-page-top-pt="20"></p>';

  // --- Les pages de chaque moteur ---
  const words = text => text.split(/\s+/).filter(Boolean);
  const bag = list => list.slice().sort().join(' ');
  const sig = list => (list.length ? list.length + ' mots (' + list[0] + '..' + list[list.length - 1] + ')' : 'VIDE');
  const sigs = view => view.words.map(sig).join(' | ');
  function firstDifference(a, b) {
    if (a.count !== b.count) return a.count + ' page(s) [' + sigs(a) + '] contre ' + b.count + ' [' + sigs(b) + ']';
    for (let i = 0; i < a.count; i++) {
      if (bag(a.words[i]) !== bag(b.words[i])) return 'page ' + (i + 1) + ' : ' + sig(a.words[i]) + ' contre ' + sig(b.words[i]);
    }
    return '';
  }
  async function blobBase64(blob) {
    const buf = new Uint8Array(await blob.arrayBuffer());
    let text = '';
    for (let i = 0; i < buf.length; i += 8192) text += String.fromCharCode.apply(null, buf.subarray(i, i + 8192));
    return btoa(text);
  }
  // Le PDF que l'on télécharge (`result.blob`, la première mise en page), relu par pdf.js.
  async function pdfView(h, html) {
    const result = await h.exportPdfContent(html, null, PageLayout.getMarginsPt());
    const truth = await h.extractPdfGroundTruth(await blobBase64(result.blob));
    return { count: truth.pages.length, words: truth.pages.map(page => page.textItems.flatMap(item => words(item.str))), truth, result };
  }
  // Les mots de chaque page de l'éditeur (Aperçu A4) ou de la Lecture, rangés par la couture qui les précède.
  function domView(scope, content) {
    const root = document.querySelector(scope + ' ' + content);
    const seams = Array.from(document.querySelectorAll(scope + ' .v2-pagination-overlay .v2-page-break-line, ' + scope + ' .v2-pagination-overlay .v2-page-seam'))
      .map(seam => seam.getBoundingClientRect().top).sort((a, b) => a - b);
    const pages = Array.from({ length: seams.length + 1 }, () => []);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim() || node.parentElement.closest('.v2-pagination-overlay, .page-break-marker, style, script, button')) continue;
      range.selectNodeContents(node);
      const rect = range.getClientRects()[0];
      if (!rect) continue;
      let page = 0;
      while (page < seams.length && seams[page] <= rect.top) page++;
      pages[page].push(...words(node.textContent));
    }
    return { count: pages.length, words: pages };
  }
  async function editorView(h, html) {
    Editor.setHeaderFooterData(NO_HF);
    Editor.setHTML(html);
    await h.sleep(250);
    Editor.refreshPaginationPreview();
    await h.sleep(60);
    return domView('#editor-container', '.tiptap');
  }
  async function readerView(h, html) {
    await h.renderReaderMode(html, null);
    await h.sleep(250);
    return domView('#reader-container', '.reader-content');
  }
  // Les feuilles que l'impression navigateur enverrait au navigateur (js/print-export.js : la Lecture découpée en pages) : les mots posés sur chacune.
  async function printView(h, html) {
    const job = await PrintExport.prepare(html, null, { id: 1 }, JSON.parse(JSON.stringify(NO_HF)), 'essai');
    try {
      const doc = job.frame.contentDocument;
      const range = doc.createRange();
      const pages = Array.from(doc.querySelectorAll('.pp-print-sheet')).map(sheet => {
        const box = sheet.getBoundingClientRect();
        const found = [];
        const walker = doc.createTreeWalker(sheet, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (!node.textContent.trim() || node.parentElement.closest('.v2-pagination-overlay, .page-break-marker, style, script, button')) continue;
          range.selectNodeContents(node);
          const rect = range.getClientRects()[0];
          if (rect && rect.top >= box.top - 1 && rect.bottom <= box.bottom + 1 && rect.left >= box.left - 1 && rect.right <= box.right + 1) found.push(...words(node.textContent));
        }
        return found;
      });
      return { count: pages.length, words: pages };
    } finally { job.dispose(); }
  }

  // --- La page et ses capacités, mesurées ---
  async function applyPage(h) {
    await h.resetEditor();
    PageLayout.setMarginsMm(null);
    OrientationToggle.sync();
    h.setA4Preview(true);
    document.dispatchEvent(new CustomEvent('pp:pageLayoutChanged'));
    await h.sleep(300);
  }
  function restorePage() {
    PageLayout.setMarginsMm(null);
    OrientationToggle.sync();
    document.dispatchEvent(new CustomEvent('pp:pageLayoutChanged'));
  }
  // Plus grand nombre n tel que build(n) tient sur UNE page du PDF : dichotomie, chaque essai est un vrai export.
  async function capacity(count, build, low, high) {
    let fits = low; let over = high;
    while (over - fits > 1) {
      const mid = (fits + over) >> 1;
      if ((await count(build(mid))) === 1) fits = mid; else over = mid;
    }
    return fits;
  }
  let capacityCache = null;
  async function capacitiesOf(h) {
    if (capacityCache) return capacityCache;
    const count = html => pdfView(h, html).then(view => view.count);
    capacityCache = {
      text: await capacity(count, n => rows(n, 'Alpha'), 1, 130),
      zone: await capacity(count, n => zoneOfRows(n, 'Alpha'), 1, 130),
      // Les mots d'UN paragraphe qui remplit la page : la hauteur d'une page, en mots.
      paragraph: await capacity(count, n => longPara('Cap', n), 20, 2000),
    };
    return capacityCache;
  }
  async function inPage(h, fn) {
    try {
      await applyPage(h);
      return await fn(await capacitiesOf(h));
    } finally { restorePage(); }
  }

  // Un document dans les quatre moteurs : l'éditeur, la Lecture et l'impression se comparent au PDF.
  async function compareEngines(h, label, html, problems, summary) {
    const pdf = await pdfView(h, html);
    const views = [['éditeur', await editorView(h, html)], ['Lecture', await readerView(h, html)], ['impression', await printView(h, html)]];
    if (summary) summary[label] = 'PDF ' + pdf.count + ' [' + sigs(pdf) + ']' + views.map(([engine, view]) => ' ; ' + engine + ' ' + view.count + ' [' + sigs(view) + ']').join('');
    for (const [engine, view] of views) {
      const diff = firstDifference(view, pdf);
      if (diff) problems.push(label + ', ' + engine + ' et PDF : ' + diff);
    }
    return { pdf, views };
  }
  // Les écarts d'un même document se ressemblent : les premiers par document suffisent à la lecture.
  const compact = problems => problems.slice(0, 12).concat(problems.length > 12 ? ['… et ' + (problems.length - 12) + ' autres écarts'] : []);
  const pageOf = (view, wordPrefix) => view.words.findIndex(page => page.some(word => word.indexOf(wordPrefix) === 0)) + 1;

  // --- Le paragraphe à cheval sur le bas d'une page ---
  cases.push({
    id: 'pdf_gap_paragraph_across_the_page_end_moves_whole_like_the_editor',
    description: 'Du texte jusqu\'à quelques lignes du bas de la page, puis un paragraphe de plusieurs lignes qui ne tient plus : il passe en entier sur la page suivante, mêmes pages et mêmes mots dans l\'éditeur, la Lecture, l\'impression et le PDF',
    run: h => inPage(h, async c => {
      const problems = []; const summary = { capacites: c };
      for (const back of [1, 2, 3, 5, 8]) {
        const { pdf } = await compareEngines(h, (c.text - back) + ' lignes puis un paragraphe de 120 mots', rows(c.text - back, 'Alpha') + longPara('Long', 120) + FIN, problems, summary);
        if (pdf.count !== 2 || pdf.words[0].some(word => word.indexOf('Long') === 0)) problems.push('à ' + back + ' lignes du bas : le paragraphe doit commencer la page 2 du PDF (' + sigs(pdf) + ')');
      }
      // Le même paragraphe loin du bas de la page tient sur la première : rien ne bouge.
      const far = await compareEngines(h, 'quinze lignes puis le même paragraphe', rows(15, 'Alpha') + longPara('Long', 120) + FIN, problems, summary);
      if (far.pdf.count !== 1) problems.push('loin du bas de la page : le PDF fait ' + far.pdf.count + ' pages (une seule attendue)');
      return { pass: problems.length === 0, notes: JSON.stringify({ problems: compact(problems), summary }) };
    }),
  });

  cases.push({
    id: 'pdf_gap_long_document_has_the_same_pages_in_every_engine',
    description: 'Un long courrier de paragraphes de longueurs variées (cinq pages environ) : à chaque bas de page, le PDF passe le paragraphe à cheval en entier, mêmes mots sur chaque page que l\'éditeur, la Lecture et l\'impression, aucun mot perdu ni doublé',
    run: h => inPage(h, async c => {
      const problems = []; const summary = { capacites: c };
      const lengths = [20, 45, 80, 33, 120, 60, 15, 95, 50, 70];
      const html = Array.from({ length: Math.round(c.text * 1.05) }, (_, i) => longPara('P' + i + 'x', lengths[i % lengths.length])).join('');
      const expected = words(html.replace(/<[^>]+>/g, ' '));
      const { pdf } = await compareEngines(h, 'long courrier', html, problems, summary);
      const got = pdf.words.flat();
      if (bag(got) !== bag(expected)) problems.push('le PDF ne porte pas les mêmes mots que le texte : ' + got.length + ' mots contre ' + expected.length);
      if (pdf.count < 4) problems.push('le courrier ne fait que ' + pdf.count + ' pages : la fixture est trop courte pour juger');
      return { pass: problems.length === 0, notes: JSON.stringify({ problems: compact(problems), pages: pdf.count, mots: expected.length }) };
    }),
  });

  cases.push({
    id: 'pdf_gap_paragraph_in_a_zone_column_moves_whole_like_the_editor',
    description: 'Dans une colonne de zone, le paragraphe qui ne tient plus dans ce qui reste de la page passe en entier sur la suivante (l\'autre colonne finit sur la première) : mêmes pages et mêmes mots dans les quatre moteurs',
    run: h => inPage(h, async c => {
      const problems = []; const summary = { capacites: c };
      for (const back of [2, 4]) {
        const html = zone(rows(c.zone - back, 'Gauche') + longPara('LongG', 100) + rows(3, 'Suite'), rows(6, 'Droite')) + FIN;
        const { pdf } = await compareEngines(h, 'colonne gauche à ' + back + ' lignes du bas', html, problems, summary);
        if (pdf.words[0] && pdf.words[0].some(word => word.indexOf('LongG') === 0)) problems.push('à ' + back + ' lignes du bas : le paragraphe de la colonne ne doit pas commencer sur la page 1 du PDF');
      }
      return { pass: problems.length === 0, notes: JSON.stringify({ problems: compact(problems), summary }) };
    }),
  });

  cases.push({
    id: 'pdf_gap_quote_moves_whole_like_the_editor',
    description: 'Une citation de plusieurs lignes à cheval sur le bas de la page passe en entier sur la suivante, comme dans l\'éditeur, la Lecture et l\'impression',
    run: h => inPage(h, async c => {
      const problems = []; const summary = { capacites: c };
      for (const back of [2, 4]) {
        const html = rows(c.text - back - 1, 'Alpha') + '<blockquote><p>' + tokens('Cit', 70) + '</p></blockquote>' + FIN;
        const { pdf } = await compareEngines(h, 'citation à ' + back + ' lignes du bas', html, problems, summary);
        if (pdf.words[0] && pdf.words[0].some(word => word.indexOf('Cit') === 0)) problems.push('à ' + back + ' lignes du bas : la citation ne doit pas commencer sur la page 1 du PDF');
      }
      return { pass: problems.length === 0, notes: JSON.stringify({ problems: compact(problems), summary }) };
    }),
  });

  // --- Ce qui ne change pas ---
  cases.push({
    id: 'pdf_gap_paragraph_taller_than_90_percent_of_a_page_is_cut_and_loses_no_word',
    description: 'Un paragraphe de plus de 90 % d\'une page n\'est pas gardé d\'une pièce (pdfmake perdrait sa fin s\'il dépassait la page) : il se coupe entre deux lignes comme avant, sans perdre un mot, même plus haut qu\'une page ; à 80 % d\'une page il passe en entier',
    run: h => inPage(h, async c => {
      const problems = []; const summary = { capacites: c };
      // Les mots de la capacité mesurée (« Cap ») : un mot d'autres lettres est plus large, et le paragraphe n'occuperait plus la part de page visée.
      const big = Math.round(c.paragraph * 0.97);
      const bigHtml = rows(15, 'Alpha') + longPara('Cap', big) + FIN;
      const bigPdf = await pdfView(h, bigHtml);
      summary.gros = 'PDF ' + bigPdf.count + ' [' + sigs(bigPdf) + ']';
      const expectedBig = words(bigHtml.replace(/<[^>]+>/g, ' '));
      if (bag(bigPdf.words.flat()) !== bag(expectedBig)) problems.push('paragraphe de 97 % d\'une page : ' + bigPdf.words.flat().length + ' mots dans le PDF au lieu de ' + expectedBig.length);
      if (bigPdf.count !== 2) problems.push('paragraphe de 97 % d\'une page : ' + bigPdf.count + ' pages au lieu de 2');
      if (bigPdf.words[0] && !bigPdf.words[0].some(word => word.indexOf('Cap') === 0)) problems.push('paragraphe de 97 % d\'une page : il doit commencer sur la page 1 (il se coupe comme avant)');
      // Plus haut qu'une page : pdfmake ne range qu'une page d'un bloc insécable, la fin du paragraphe serait perdue s'il était gardé d'une pièce.
      const hugeHtml = rows(15, 'Alpha') + longPara('Cap', Math.round(c.paragraph * 1.3)) + FIN;
      const hugePdf = await pdfView(h, hugeHtml);
      summary.enorme = 'PDF ' + hugePdf.count + ' [' + sigs(hugePdf) + ']';
      const expectedHuge = words(hugeHtml.replace(/<[^>]+>/g, ' '));
      if (bag(hugePdf.words.flat()) !== bag(expectedHuge)) problems.push('paragraphe de 130 % d\'une page : ' + hugePdf.words.flat().length + ' mots dans le PDF au lieu de ' + expectedHuge.length);
      const midHtml = rows(15, 'Alpha') + longPara('Cap', Math.round(c.paragraph * 0.8)) + FIN;
      const mid = await compareEngines(h, 'paragraphe de 80 % d\'une page', midHtml, problems, summary);
      if (mid.pdf.words[0] && mid.pdf.words[0].some(word => word.indexOf('Cap') === 0)) problems.push('paragraphe de 80 % d\'une page : il ne tient pas à la suite de quinze lignes, il doit passer en entier sur la page 2');
      return { pass: problems.length === 0, notes: JSON.stringify({ problems: compact(problems), summary }) };
    }),
  });

  cases.push({
    id: 'pdf_gap_note_stays_on_the_page_of_its_paragraph',
    description: 'Un paragraphe à cheval sur le bas de la page qui porte une note passe en entier sur la page suivante, avec sa note au pied de cette page',
    run: h => inPage(h, async c => {
      const problems = []; const summary = { capacites: c };
      // Une page qui porte une note réserve en bas la place de quatre lignes de note : trois lignes de texte de moins (FOOTNOTE_BAND_PT, js/pdf-export.js).
      const band = 3;
      for (const back of [2, 4]) {
        const html = rows(c.text - band - back, 'Alpha') + '<p>' + tokens('Long', 40) + NOTE(1) + ' ' + tokens('Suite', 40) + '</p>' + FIN;
        const pdf = await pdfView(h, html);
        summary['note, ' + back + ' lignes du bas'] = 'PDF ' + pdf.count + ' [' + sigs(pdf) + ']';
        const paragraphPage = pageOf(pdf, 'Long'), endPage = pageOf(pdf, 'Suitew1039'), notePage = pageOf(pdf, 'NOTE1');
        if (!notePage) problems.push('à ' + back + ' lignes du bas : la note n\'est dans aucune page du PDF');
        else if (notePage !== paragraphPage) problems.push('à ' + back + ' lignes du bas : la note est sur la page ' + notePage + ' et le début du paragraphe sur la page ' + paragraphPage);
        if (paragraphPage !== 2 || endPage !== 2) problems.push('à ' + back + ' lignes du bas : le paragraphe doit tenir sur la page 2 (début page ' + paragraphPage + ', fin page ' + endPage + ')');
      }
      return { pass: problems.length === 0, notes: JSON.stringify({ problems, summary }) };
    }),
  });

  cases.push({
    id: 'pdf_gap_page_positioned_image_stays_on_its_page',
    description: 'Une image en calque posée sur la page 1 par sa grille de page reste sur la page 1 du PDF quand le dernier paragraphe de cette page passe en entier sur la suivante',
    run: h => inPage(h, async c => {
      const problems = []; const summary = { capacites: c };
      for (const back of [2, 4]) {
        const html = layerImage + rows(c.text - back - 1, 'Alpha') + longPara('Long', 120) + FIN;
        const pdf = await pdfView(h, html);
        const perPage = pdf.truth.pages.map(page => page.images.length);
        summary['image, ' + back + ' lignes du bas'] = { pages: pdf.count, imagesParPage: perPage };
        if (pdf.count < 2) problems.push('à ' + back + ' lignes du bas : le PDF ne fait qu\'une page, la fixture ne coupe pas');
        else if (perPage[0] !== 1 || perPage.slice(1).some(n => n !== 0)) problems.push('à ' + back + ' lignes du bas : images par page ' + JSON.stringify(perPage) + ' au lieu de la seule page 1');
      }
      return { pass: problems.length === 0, notes: JSON.stringify({ problems, summary }) };
    }),
  });

  cases.push({
    id: 'pdf_gap_paragraphs_next_to_a_layer_image_anchor_are_not_kept_whole',
    description: 'Les deux paragraphes qui encadrent une image en calque sans grille de page (celui du dessus et celui du dessous, ses ancres) ne sont pas gardés d\'une pièce : leur haut, mesuré par pdfmake, doit être celui où l\'image se pose ; tous les autres le sont',
    run: h => inPage(h, async () => {
      const problems = []; const summary = {};
      // Quatre paragraphes de cinq lignes environ, l'image au milieu du troisième : le quatrième est sous elle (l'ancre « dessous »), le deuxième au-dessus (l'ancre « dessus »).
      const paragraph = tag => longPara(tag, 50);
      const image = top => '<p><img class="editor-image" src="' + TINY_PNG + '" alt="" style="width: 20px; height: 20px; position: absolute; left: 600px; top: ' + top + 'px; z-index: 5;" data-layer="front" data-wrap="inline"></p>';
      const flags = async html => {
        const { result } = await pdfView(h, html);
        const out = {};
        (result.content || []).forEach(block => {
          const text = block && block.text !== undefined && !block.absolutePosition ? JSON.stringify(block.text) : '';
          ['Aw', 'Bw', 'Cw', 'Dw'].forEach(prefix => { if (text.indexOf(prefix + '1000') !== -1) out[prefix[0]] = !!block.unbreakable; });
        });
        return out;
      };
      const base = paragraph('A') + paragraph('B') + paragraph('C') + paragraph('D');
      summary.sans_image = await flags(base);
      if (JSON.stringify(summary.sans_image) !== JSON.stringify({ A: true, B: true, C: true, D: true })) problems.push('sans image, les quatre paragraphes de plusieurs lignes devraient être gardés d\'une pièce : ' + JSON.stringify(summary.sans_image));
      // Chaque paragraphe fait quatre lignes (environ 80 px) : le troisième va d'environ 160 à 240 px du haut du texte, l'image (20 px) est posée sur lui, à 200 px.
      summary.avec_image = await flags(paragraph('A') + paragraph('B') + image(200) + paragraph('C') + paragraph('D'));
      if (JSON.stringify(summary.avec_image) !== JSON.stringify({ A: true, B: false, C: true, D: false })) problems.push('avec une image sur le paragraphe C, seuls B (dessus) et D (dessous) ne doivent pas être gardés d\'une pièce : ' + JSON.stringify(summary.avec_image));
      return { pass: problems.length === 0, notes: JSON.stringify({ problems, summary }) };
    }),
  });

  cases.push({
    id: 'pdf_gap_whole_paragraphs_need_no_page_break_callback',
    description: 'Garder un paragraphe d\'une pièce ne passe pas par le rappel `pageBreakBefore` de pdfmake (il remet tout le document en page à chaque paragraphe à cheval : plusieurs secondes pour un courrier de dix pages) ; le contenu rendu ne porte aucun `id` de plus',
    run: h => inPage(h, async c => {
      const problems = [];
      const html = Array.from({ length: Math.round(c.text * 0.7) }, (_, i) => longPara('P' + i + 'x', 60)).join('');
      const { result } = await pdfView(h, html);
      const doc = result.docDefinition;
      if (typeof doc.pageBreakBefore !== 'undefined') problems.push('la définition du document porte un rappel pageBreakBefore');
      const content = doc.content || [];
      const whole = content.filter(block => block.unbreakable).length;
      if (whole < content.length * 0.9) problems.push('seulement ' + whole + ' paragraphes gardés d\'une pièce sur ' + content.length);
      const withId = content.filter(block => typeof block.id === 'string' && block.id.indexOf('pp-whole-') === 0).length;
      if (withId) problems.push(withId + ' paragraphes portent un id « pp-whole- » dans le PDF rendu (il alourdit le fichier d\'une destination par paragraphe)');
      return { pass: problems.length === 0, notes: JSON.stringify({ problems, paragraphes: content.length, gardes: whole }) };
    }),
  });

  // --- Le trait ---
  cases.push({
    id: 'pdf_gap_rule_adds_no_page_to_the_pdf',
    description: 'Un trait juste après une zone de deux pages et plus ne fait aucune page de plus au PDF que l\'on télécharge : mêmes pages avec et sans trait, et mêmes pages que l\'éditeur, la Lecture et l\'impression',
    run: h => inPage(h, async c => {
      const problems = []; const summary = { capacites: c };
      for (const k of [c.zone + 10, c.zone * 2, c.zone * 2 + 3]) {
        const withRule = await compareEngines(h, 'zone de ' + k + ' lignes, un trait, une ligne', zoneOfRows(k, 'Zed') + '<hr>' + FIN, problems, summary);
        const without = await pdfView(h, zoneOfRows(k, 'Zed') + FIN);
        if (withRule.pdf.count !== without.count) problems.push('zone de ' + k + ' lignes : ' + withRule.pdf.count + ' pages avec le trait, ' + without.count + ' sans');
      }
      return { pass: problems.length === 0, notes: JSON.stringify({ problems: compact(problems), summary }) };
    }),
  });

  // La place d'un ou de plusieurs traits entre deux paragraphes, en pixels de mise en page : l'écart entre le haut du premier et du dernier paragraphe, avec les traits moins sans eux. L'éditeur et la Lecture
  // se mesurent sur le DOM (divisé par le zoom de la feuille), le PDF sur les lignes de texte relues par pdf.js (1 pt = 4/3 px) ; `boxes` donne la boîte du premier trait de chacun.
  async function roomOfRules(h, count) {
    const pair = '<p>Avant</p><p>Apres</p>';
    const withRules = '<p>Avant</p>' + '<hr>'.repeat(count) + '<p>Apres</p>';
    const gapIn = (scope, content) => {
      const root = document.querySelector(scope + ' ' + content);
      const zoom = EditorCore.layoutZoom(root);
      const paragraphs = Array.from(root.querySelectorAll(':scope > p'));
      const rule = root.querySelector(':scope > hr');
      const style = rule ? getComputedStyle(rule) : null;
      return {
        gap: (paragraphs[paragraphs.length - 1].getBoundingClientRect().top - paragraphs[0].getBoundingClientRect().top) / zoom,
        box: rule ? { height: rule.getBoundingClientRect().height / zoom, margins: parseFloat(style.marginTop) + parseFloat(style.marginBottom) } : null,
      };
    };
    const inEditor = async html => {
      Editor.setHeaderFooterData(NO_HF);
      Editor.setHTML(html);
      await h.sleep(250);
      Editor.refreshPaginationPreview();
      await h.sleep(60);
      return gapIn('#editor-container', '.tiptap');
    };
    const inReader = async html => {
      await h.renderReaderMode(html, null);
      await h.sleep(250);
      return gapIn('#reader-container', '.reader-content');
    };
    const inPdf = async html => {
      const view = await pdfView(h, html);
      const items = view.truth.pages[0].textItems;
      const before = items.find(item => item.str.indexOf('Avant') !== -1);
      const after = items.find(item => item.str.indexOf('Apres') !== -1);
      const lines = (await h.extractPdfLines(await blobBase64(view.result.blob))).pages[0].lines;
      return { gap: Math.abs(after.y - before.y) / 0.75, lines };
    };
    const [editorWith, editorWithout, readerWith, readerWithout, pdfWith, pdfWithout] =
      [await inEditor(withRules), await inEditor(pair), await inReader(withRules), await inReader(pair), await inPdf(withRules), await inPdf(pair)];
    const round = n => Math.round(n * 100) / 100;
    return {
      room: { editor: round(editorWith.gap - editorWithout.gap), reader: round(readerWith.gap - readerWithout.gap), pdf: round(pdfWith.gap - pdfWithout.gap) },
      boxes: { editor: editorWith.box, reader: readerWith.box },
      pdfLines: pdfWith.lines,
    };
  }

  cases.push({
    id: 'pdf_gap_rule_takes_the_same_room_in_every_engine',
    description: 'Un trait entre deux paragraphes prend 21 px (10 d\'air, 1 de trait, 10 d\'air) dans l\'éditeur, la Lecture et le PDF, deux traits de suite 42 px (leur air ne s\'additionne pas à celui du voisin) ; dans l\'éditeur et la Lecture cet air est dans la boîte du trait, pas en marge, parce que la pagination additionne des hauteurs de blocs sans leurs marges ; le PDF peint un seul trait par trait',
    run: h => inPage(h, async c => {
      const problems = []; const summary = {};
      for (const count of [1, 2]) {
        const measured = await roomOfRules(h, count);
        summary[count + ' trait(s)'] = measured.room;
        const expected = 21 * count;
        Object.keys(measured.room).forEach(engine => {
          if (Math.abs(measured.room[engine] - expected) > 0.5) problems.push(count + ' trait(s) : ' + engine + ' prend ' + measured.room[engine] + ' px au lieu de ' + expected);
        });
        if (count === 1) {
          Object.keys(measured.boxes).forEach(engine => {
            const box = measured.boxes[engine];
            if (!box || Math.abs(box.height - 21) > 0.5 || box.margins !== 0) problems.push('le trait de ' + (engine === 'editor' ? 'l\'éditeur' : 'la Lecture') + ' doit être une boîte de 21 px sans marge (la pagination ne compte pas les marges) : ' + JSON.stringify(box));
          });
        }
        if (measured.pdfLines.length !== count) problems.push(count + ' trait(s) : le PDF peint ' + measured.pdfLines.length + ' trait(s) : ' + JSON.stringify(measured.pdfLines.map(line => [line.x1, line.y1, line.x2, line.y2])));
      }
      return { pass: problems.length === 0, notes: JSON.stringify({ problems, summary }) };
    }),
  });

  cases.push({
    id: 'pdf_gap_rules_give_the_same_pages_in_every_engine',
    description: 'Des traits dans un courrier de plusieurs pages (un tous les trois paragraphes ; un seul de plus en plus près du bas de la page, jusqu\'à celui qui ne tient plus et ouvre la page suivante ; deux de suite ; un en haut de page) : mêmes pages et mêmes mots sur chacune dans l\'éditeur, la Lecture, l\'impression et le PDF',
    run: h => inPage(h, async c => {
      const problems = []; const summary = { capacites: c };
      const many = Array.from({ length: 22 }, (_, i) => rows(3, 'R' + i + 'x') + '<hr>').join('') + FIN;
      await compareEngines(h, 'un trait tous les trois paragraphes', many, problems, summary);
      // Le trait pèse un peu plus qu\'une ligne : de n = c.text - 4 lignes devant lui, il tient avec de la place de reste, puis de moins en moins, jusqu\'à n = c.text - 1 où il ne tient plus et passe en haut de la page suivante.
      for (const n of [c.text - 4, c.text - 3, c.text - 2, c.text - 1, c.text]) {
        await compareEngines(h, 'un trait après ' + n + ' lignes', rows(n, 'Alpha') + '<hr>' + rows(8, 'Beta') + FIN, problems, summary);
      }
      for (const n of [c.text - 4, c.text - 3, c.text - 2]) {
        await compareEngines(h, 'deux traits de suite après ' + n + ' lignes', rows(n, 'Alpha') + '<hr><hr>' + rows(8, 'Beta') + FIN, problems, summary);
      }
      return { pass: problems.length === 0, notes: JSON.stringify({ problems: compact(problems), summary }) };
    }),
  });

  // --- Le trait dans un conteneur : sa largeur et sa présence (carte du 12/10 : « Corriger le trait du PDF dans les colonnes, cases et listes ? », réponse « Corriger ») ---
  // Deux paragraphes « Avant » et « Apres », avec ou sans trait entre eux, rangés dans chaque sorte de conteneur que le PDF construit par un chemin à lui.
  const RULE_CONTAINERS = [
    ['la page', inner => inner],
    ['une colonne de zone', inner => zone(inner, '<p>Droite</p>')],
    ['une case de tableau', inner => '<table><tbody><tr><td>' + inner + '</td><td><p>Autre</p></td></tr></tbody></table>'],
    ['un élément de liste', inner => '<ul><li>' + inner + '</li></ul>'],
    ['une citation', inner => '<blockquote>' + inner + '</blockquote>'],
  ];
  const round1 = n => Math.round(n * 10) / 10;
  const RULE_PAIR = withRule => '<p>Avant</p>' + (withRule ? '<hr>' : '') + '<p>Apres</p>';

  // Ce que l'éditeur et la Lecture font du trait d'un conteneur : la place qu'il prend entre « Avant » et « Apres » (pixels de mise en page) et sa largeur en pt.
  function ruleBoxIn(scope, content) {
    const root = document.querySelector(scope + ' ' + content);
    const zoom = EditorCore.layoutZoom(root);
    const paragraph = word => Array.from(root.querySelectorAll('p')).find(p => p.textContent.trim() === word);
    const hr = root.querySelector('hr');
    return {
      gap: (paragraph('Apres').getBoundingClientRect().top - paragraph('Avant').getBoundingClientRect().top) / zoom,
      widthPt: hr ? hr.getBoundingClientRect().width / zoom * 0.75 : null,
    };
  }
  async function ruleInContainer(h, wrap) {
    const html = wrap(RULE_PAIR(true));
    const plain = wrap(RULE_PAIR(false));
    const editorOf = async source => { Editor.setHeaderFooterData(NO_HF); Editor.setHTML(source); await h.sleep(250); Editor.refreshPaginationPreview(); await h.sleep(60); return ruleBoxIn('#editor-container', '.tiptap'); };
    const readerOf = async source => { await h.renderReaderMode(source, null); await h.sleep(250); return ruleBoxIn('#reader-container', '.reader-content'); };
    const [editorWith, editorWithout, readerWith, readerWithout] = [await editorOf(html), await editorOf(plain), await readerOf(html), await readerOf(plain)];
    const withRule = await pdfView(h, html);
    const withoutRule = await pdfView(h, plain);
    const row = (view, word) => view.truth.pages[0].textItems.find(item => item.str.indexOf(word) !== -1);
    const pdfGap = view => row(view, 'Apres').y - row(view, 'Avant').y;
    const before = row(withRule, 'Avant');
    const page = withRule.truth.pages[0];
    // Le début du texte sur la ligne d'« Avant » : la puce d'une liste, le texte d'une case, d'une colonne ou d'une citation, la marge de la page.
    const startX = Math.min.apply(null, page.textItems.filter(item => Math.abs(item.y - before.y) < 1).map(item => item.x));
    const painted = (await h.extractPdfLines(await blobBase64(withRule.result.blob))).pages[0].lines.filter(line => line.color === '#000000');
    const margins = PageLayout.getMarginsPt();
    const round = n => Math.round(n * 100) / 100;
    return {
      room: { editor: round(editorWith.gap - editorWithout.gap), reader: round(readerWith.gap - readerWithout.gap), pdf: round((pdfGap(withRule) - pdfGap(withoutRule)) / 0.75) },
      editorWidthPt: editorWith.widthPt,
      pageRightPt: page.width - margins.right,
      startX,
      lines: painted.map(line => ({ x1: round(line.x1), x2: round(line.x2) })),
    };
  }

  cases.push({
    id: 'pdf_gap_rule_fits_its_container_in_the_pdf',
    description: 'Un trait entre deux paragraphes d\'une page, d\'une colonne de zone, d\'une case de tableau, d\'un élément de liste et d\'une citation : le PDF le peint (un seul trait), de la ligne de texte à la largeur de son conteneur (la colonne ne déborde pas sur sa voisine, la case garde le trait dans ses bords, la liste et la citation vont jusqu\'à la marge de droite), et il prend 21 px de haut comme dans l\'éditeur et la Lecture',
    run: h => inPage(h, async c => {
      const problems = []; const summary = {};
      for (const [label, wrap] of RULE_CONTAINERS) {
        const m = await ruleInContainer(h, wrap);
        summary[label] = m;
        Object.keys(m.room).forEach(engine => {
          if (Math.abs(m.room[engine] - 21) > 0.6) problems.push(label + ' : ' + engine + ' donne ' + m.room[engine] + ' px au trait au lieu de 21');
        });
        if (m.lines.length !== 1) { problems.push(label + ' : le PDF peint ' + m.lines.length + ' trait(s) au lieu de 1 : ' + JSON.stringify(m.lines)); continue; }
        const line = m.lines[0];
        if (Math.abs(line.x1 - m.startX) > 1) problems.push(label + ' : le trait part de ' + line.x1 + ' pt, le texte de ' + m.startX + ' pt');
        // La colonne et la case ont leur propre largeur, celle que l'éditeur donne à son trait ; le reste va jusqu'à la marge de droite de la page.
        if (label === 'une colonne de zone' || label === 'une case de tableau') {
          if (Math.abs((line.x2 - line.x1) - m.editorWidthPt) > 1.5) problems.push(label + ' : le trait fait ' + round1(line.x2 - line.x1) + ' pt de large, celui de l\'éditeur ' + round1(m.editorWidthPt) + ' pt');
        } else if (Math.abs(line.x2 - m.pageRightPt) > 1) {
          problems.push(label + ' : le trait finit à ' + line.x2 + ' pt, la marge de droite est à ' + round1(m.pageRightPt) + ' pt');
        }
      }
      return { pass: problems.length === 0, notes: JSON.stringify({ problems, summary }) };
    }),
  });

  // Des mots repères, un par paragraphe : la distance de l'un à l'autre, dans l'éditeur (haut du paragraphe, px de mise en page) et dans le PDF (ligne de texte, pt / 0,75).
  async function distancesBetween(h, html, markers) {
    const view = await pdfView(h, html);
    const items = view.truth.pages[0].textItems;
    const pdfY = markers.map(word => { const item = items.find(it => it.str === word); return item ? item.y / 0.75 : null; });
    Editor.setHeaderFooterData(NO_HF);
    Editor.setHTML(html);
    await h.sleep(250);
    Editor.refreshPaginationPreview();
    await h.sleep(60);
    const root = document.querySelector('#editor-container .tiptap');
    const zoom = EditorCore.layoutZoom(root);
    const editorY = markers.map(word => { const p = Array.from(root.querySelectorAll('p')).find(el => el.textContent.trim() === word); return p ? p.getBoundingClientRect().top / zoom : null; });
    const gaps = ys => ys.slice(1).map((y, i) => (y == null || ys[i] == null ? null : Math.round((y - ys[i]) * 10) / 10));
    return { editor: gaps(editorY), pdf: gaps(pdfY), items, view };
  }

  cases.push({
    id: 'pdf_gap_rule_inside_lists_quotes_and_cells_follows_the_editor',
    description: 'Un trait dans un élément de liste (avec une sous-liste, numérotée, deux de suite, suivi d\'un paragraphe vide), une citation (au milieu, à la fin), une liste dans une case, une case qui commence ou ne contient que le trait, un encadré : le PDF pose le texte d\'avant, le trait et le texte d\'après dans le même ordre et aux mêmes distances que l\'éditeur, sans puce ni numéro de plus après le trait',
    run: h => inPage(h, async c => {
      const problems = []; const summary = {};
      const cell = inner => '<table><tbody><tr><td>' + inner + '</td><td><p>Autre</p></td></tr></tbody></table>';
      // [libellé, HTML, repères (un par paragraphe), repère qui suit un trait dans un élément de liste]
      const fixtures = [
        ['liste avec une sous-liste', '<ul><li><p>Alpha</p><hr><p>Beta</p><ul><li><p>Gamma</p></li></ul></li><li><p>Delta</p></li></ul>', ['Alpha', 'Beta', 'Gamma', 'Delta'], 'Beta'],
        ['liste numérotée', '<ol><li><p>Alpha</p></li><li><p>Beta</p><hr><p>Gamma</p></li><li><p>Delta</p></li></ol>', ['Alpha', 'Beta', 'Gamma', 'Delta'], 'Gamma'],
        ['liste, deux traits de suite', '<ul><li><p>Alpha</p><hr><hr><p>Beta</p></li></ul><p>Gamma</p>', ['Alpha', 'Beta', 'Gamma'], 'Beta'],
        ['liste, paragraphe vide après le trait', '<ul><li><p>Alpha</p><hr><p></p></li></ul><p>Beta</p>', ['Alpha', 'Beta'], null],
        ['citation', '<blockquote><p>Alpha</p><hr><p>Beta</p></blockquote><p>Gamma</p>', ['Alpha', 'Beta', 'Gamma'], null],
        ['citation, trait en fin', '<blockquote><p>Alpha</p><hr></blockquote><p>Beta</p>', ['Alpha', 'Beta'], null],
        ['liste dans une case', cell('<ul><li><p>Alpha</p><hr><p>Beta</p></li></ul>') + '<p>Gamma</p>', ['Alpha', 'Beta', 'Gamma'], 'Beta'],
        ['case qui commence par le trait', '<p>Alpha</p>' + cell('<hr><p>Beta</p>') + '<p>Gamma</p>', ['Alpha', 'Beta', 'Gamma'], null],
        ['case qui ne contient que le trait', '<p>Alpha</p><table><tbody><tr><td><hr></td><td><p>Beta</p></td></tr></tbody></table><p>Gamma</p>', ['Alpha', 'Beta', 'Gamma'], null],
        ['encadré', '<div class="callout"><p>Alpha</p><hr><p>Beta</p></div><p>Gamma</p>', ['Alpha', 'Beta', 'Gamma'], null],
      ];
      for (const [label, html, markers, continued] of fixtures) {
        const d = await distancesBetween(h, html, markers);
        summary[label] = { editor: d.editor, pdf: d.pdf };
        d.pdf.forEach((gap, i) => {
          const want = d.editor[i];
          if (gap == null || want == null) problems.push(label + ' : le repère ' + markers[i] + ' ou ' + markers[i + 1] + ' manque (PDF ' + gap + ', éditeur ' + want + ')');
          else if (Math.abs(gap - want) > 1.5) problems.push(label + ' : de ' + markers[i] + ' à ' + markers[i + 1] + ', ' + gap + ' px dans le PDF contre ' + want + ' px dans l\'éditeur');
        });
        // Après le trait, la suite d'un élément de liste n'a ni puce ni numéro : à gauche de son repère, sur sa ligne, il n'y a rien.
        if (continued) {
          const at = d.items.find(it => it.str === continued);
          const before = at ? d.items.filter(it => it !== at && Math.abs(it.y - at.y) < 1 && it.x < at.x).map(it => it.str) : ['(repère absent)'];
          if (before.length) problems.push(label + ' : après le trait, la ligne de ' + continued + ' porte aussi ' + JSON.stringify(before) + ' (ni puce ni numéro attendus)');
        }
      }
      return { pass: problems.length === 0, notes: JSON.stringify({ problems, summary }) };
    }),
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.pdfEditorGap = cases;
})();
