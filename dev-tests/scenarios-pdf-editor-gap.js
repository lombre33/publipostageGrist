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
// 4. Le trait d'une citation posée dans un élément de liste, dans une case ou dans une autre citation (carte du 2026-10-12 « Corriger les trois petits défauts relevés avant la 1.0 ? », réponse « Les trois »). Ces citations étaient lues d'un seul tenant avec
//    ce qui les entoure : le trait ne se dessinait pas et leur première ligne se collait à celle de l'élément de liste. Elles sont maintenant leurs propres blocs (ou une ligne de la case) ; un cas les mesure, un autre garde le fait qu'une liste de tâches ne peut pas contenir de
//    trait (l'éditeur le sort de la liste), donc rien n'est à y dessiner.
//
// 5. Une liste dans une case de tableau (14/10, « polish » avant la 1.0 voulu par Antoine). Son retrait était mesuré depuis l'hôte de mesure, pas depuis la case : dans la deuxième colonne la liste partait à 591 pt avec une lettre par ligne, dans la première
//    elle était décalée de la bordure et du remplissage de la case, et une sous-liste de case sortait sans puce ni retrait. Un cas la pose dans les trois colonnes d'un tableau et la compare à la même liste hors tableau.
//
// 6. Une citation dans une case de tableau (14/10, « polish » avant la 1.0). Elle sortait à plat, sans italique, sans retrait et sans les 4 pt de dessus et de dessous du flux : un cas la pose dans les trois colonnes d'un tableau et la compare à la même citation hors tableau, puis à la coupe de lignes de l'éditeur.
//
// 7. Une liste dans une citation (14/10, « polish » avant la 1.0). Le PDF la lisait d'un seul tenant avec la citation : éléments collés sur une ligne, sans puce ni numéro, trait d'un élément jamais dessiné. Un cas compare les distances, le retrait, l'italique et le trait au PDF.
//
// 8. Le texte d'une liste commence où l'éditeur le fait commencer (14/10, carte « Aligner le texte des listes du PDF sur celui de l'éditeur ? », réponse « Aligner le PDF »). Le PDF écrivait la puce dans le texte, au bord de l'élément : la première ligne partait 6 à 11 pt trop à droite et les suivantes
//    revenaient sous la puce. Deux cas comparent où l'éditeur et le PDF commencent le texte de chaque ligne, au premier niveau et dans les trois colonnes d'un tableau.
//
// 9. L'alignement d'un point de liste (14/10, carte « Dans le PDF, respecter l'alignement des points de liste (centré, à droite, justifié) ? », réponse « Respecter l'alignement »). L'éditeur pose `text-align` sur le paragraphe de l'élément ; le PDF ne lisait que le <li> et écrivait ces éléments à gauche.
//    Trois cas comparent, ligne à ligne, le mot qui ouvre la ligne et ses bords gauche et droit : au premier niveau (puces, numéros à deux chiffres, deux niveaux, liste de tâches), dans les cases d'un tableau, et quand un point est coupé par une page.
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
    // Le début du texte sur la ligne d'« Avant » : son premier mot (la puce ou le numéro d'une liste pend à sa gauche, hors de la boîte de l'élément où le trait se pose).
    const startX = before.x;
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

  // --- Le trait d'une citation posée dans un élément de liste, dans une case ou dans une autre citation (12/10, carte « Corriger les trois petits défauts » : « Les trois ») ---
  // Le PDF lisait ces citations d'un seul tenant avec ce qui les entoure : le trait ne se dessinait pas, et la première ligne de la citation se collait à celle de l'élément de liste (« AlphaBeta » sur une ligne).
  // Une liste de tâches ne figure pas ici : un élément de tâche n'accepte que des paragraphes (TaskItem `nested: false`), l'éditeur sort le trait de la liste en la coupant en deux (cas `task_list_cannot_hold_a_rule`).
  const round2 = n => Math.round(n * 100) / 100;
  // Les traits noirs RÉELLEMENT peints sur la première page du PDF : le trait du document (`#000000`), ni les bordures grises des tableaux ni les cases à cocher.
  async function paintedRules(h, view) {
    const lines = (await h.extractPdfLines(await blobBase64(view.result.blob))).pages[0].lines.filter(line => line.color === '#000000');
    return lines.map(line => ({ x1: round2(line.x1), x2: round2(line.x2), y: round2(line.y1) }));
  }

  cases.push({
    id: 'pdf_gap_rule_inside_a_quote_in_a_list_cell_or_quote_follows_the_editor',
    description: 'Un trait dans une citation posée dans un élément de liste (au milieu, en fin, avec un paragraphe après la citation, numérotée), dans une case de tableau ou dans une autre citation : le PDF le peint (un seul trait, de la ligne de texte de la citation, sans déborder sur la case voisine), pose les paragraphes à la même distance que l\'éditeur, ne colle plus la première ligne de la citation à celle de l\'élément de liste, et la suite d\'un élément de liste n\'a ni puce ni numéro',
    run: async h => {
      const problems = []; const summary = {};
      try {
        await applyPage(h);
        const margins = PageLayout.getMarginsPt();
        const cell = inner => '<table><tbody><tr><td>' + inner + '</td><td><p>Autre</p></td></tr></tbody></table>';
        // [libellé, HTML, repères (un par paragraphe), traits attendus, repère qui suit le trait dans un élément de liste (ni puce ni numéro à sa gauche) ou null, repère de la citation (où le trait commence)]
        const fixtures = [
          ['citation dans un élément de liste', '<ul><li><p>Alpha</p><blockquote><p>Beta</p><hr><p>Gamma</p></blockquote></li><li><p>Delta</p></li></ul>', ['Alpha', 'Beta', 'Gamma', 'Delta'], 1, null, 'Beta'],
          ['citation dans une liste numérotée, trait en fin', '<ol><li><p>Alpha</p><blockquote><p>Beta</p><hr></blockquote></li></ol><p>Gamma</p>', ['Alpha', 'Beta', 'Gamma'], 1, null, 'Beta'],
          ['citation suivie d\'un paragraphe dans l\'élément de liste', '<ul><li><p>Alpha</p><blockquote><p>Beta</p><hr><p>Gamma</p></blockquote><p>Zeta</p></li></ul>', ['Alpha', 'Beta', 'Gamma', 'Zeta'], 1, 'Zeta', 'Beta'],
          ['citation sans trait dans un élément de liste', '<ul><li><p>Alpha</p><blockquote><p>Beta</p></blockquote></li></ul><p>Gamma</p>', ['Alpha', 'Beta', 'Gamma'], 0, null, 'Beta'],
          ['citation dans une citation', '<blockquote><p>Alpha</p><blockquote><p>Beta</p><hr><p>Gamma</p></blockquote></blockquote><p>Delta</p>', ['Alpha', 'Beta', 'Gamma', 'Delta'], 1, null, 'Beta'],
          ['citation dans une case', cell('<blockquote><p>Beta</p><hr><p>Gamma</p></blockquote>') + '<p>Fin</p>', ['Beta', 'Gamma'], 1, null, 'Beta'],
        ];
        for (const [label, html, markers, expectedRules, continued, quoteMarker] of fixtures) {
          const d = await distancesBetween(h, html, markers);
          const rules = await paintedRules(h, d.view);
          summary[label] = { editor: d.editor, pdf: d.pdf, rules };
          d.pdf.forEach((gap, i) => {
            const want = d.editor[i];
            if (gap == null || want == null) problems.push(label + ' : le repère ' + markers[i] + ' ou ' + markers[i + 1] + ' manque (PDF ' + gap + ', éditeur ' + want + ')');
            else if (Math.abs(gap - want) > 1.5) problems.push(label + ' : de ' + markers[i] + ' à ' + markers[i + 1] + ', ' + gap + ' px dans le PDF contre ' + want + ' px dans l\'éditeur');
          });
          if (rules.length !== expectedRules) { problems.push(label + ' : le PDF peint ' + rules.length + ' trait(s) au lieu de ' + expectedRules + ' : ' + JSON.stringify(rules)); continue; }
          const quoteAt = d.items.find(it => it.str === quoteMarker);
          if (expectedRules && quoteAt) {
            const rule = rules[0];
            if (Math.abs(rule.x1 - quoteAt.x) > 1.5) problems.push(label + ' : le trait part de ' + rule.x1 + ' pt, le texte de la citation de ' + round2(quoteAt.x) + ' pt');
            // Dans une case, le trait s'arrête avant le texte de la case voisine ; ailleurs il va jusqu'à la marge de droite de la page.
            const neighbour = d.items.find(it => it.str === 'Autre');
            if (neighbour) { if (rule.x2 > neighbour.x) problems.push(label + ' : le trait finit à ' + rule.x2 + ' pt, après le début de la case voisine (' + round2(neighbour.x) + ' pt)'); }
            else if (Math.abs(rule.x2 - (d.view.truth.pages[0].width - margins.right)) > 1) problems.push(label + ' : le trait finit à ' + rule.x2 + ' pt, la marge de droite est à ' + round2(d.view.truth.pages[0].width - margins.right) + ' pt');
            const above = d.items.find(it => it.str === markers[markers.indexOf(quoteMarker) + 1]);
            if (above && !(rule.y > quoteAt.y && rule.y < above.y)) problems.push(label + ' : le trait (' + rule.y + ' pt) n\'est pas entre ' + quoteMarker + ' (' + round2(quoteAt.y) + ') et ' + above.str + ' (' + round2(above.y) + ')');
          }
          if (continued) {
            const at = d.items.find(it => it.str === continued);
            const before = at ? d.items.filter(it => it !== at && Math.abs(it.y - at.y) < 1 && it.x < at.x).map(it => it.str) : ['(repère absent)'];
            if (before.length) problems.push(label + ' : après le trait, la ligne de ' + continued + ' porte aussi ' + JSON.stringify(before) + ' (ni puce ni numéro attendus)');
          }
        }
      } finally { restorePage(); }
      return { pass: problems.length === 0, notes: JSON.stringify({ problems: compact(problems), summary }) };
    },
  });

  // Une liste de tâches ne peut pas contenir de trait : l'élément n'accepte que des paragraphes, l'éditeur pose le trait ENTRE deux listes (c'est lui que le PDF reçoit), et le PDF le peint à la largeur de la page.
  cases.push({
    id: 'pdf_gap_task_list_cannot_hold_a_rule',
    description: 'Un trait collé dans un élément d\'une liste de tâches sort de la liste dans l\'éditeur (deux listes, le trait entre elles) et le PDF de ce que l\'éditeur écrit peint ce trait une seule fois, à la largeur de la page : il n\'y a pas de « trait dans une liste de tâches » à dessiner',
    run: async h => {
      try {
        await applyPage(h);
        const html = '<ul data-type="taskList"><li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span></span></label><div><p>Alpha</p><hr><p>Beta</p></div></li></ul><p>Gamma</p>';
        Editor.setHeaderFooterData(NO_HF);
        Editor.setHTML(html);
        await h.sleep(250);
        const written = Editor.getHTML();
        const insideItem = /<li[^>]*data-type="taskItem"[^>]*>(?:(?!<\/li>)[\s\S])*<hr/.test(written);
        const betweenLists = /<\/ul><hr><(?:p|ul)/.test(written);
        const view = await pdfView(h, written);
        const rules = await paintedRules(h, view);
        const margins = PageLayout.getMarginsPt();
        const pageRight = view.truth.pages[0].width - margins.right;
        const pass = !insideItem && betweenLists && rules.length === 1 && Math.abs(rules[0].x2 - pageRight) <= 1;
        return { pass, notes: JSON.stringify({ written, insideItem, betweenLists, rules, pageRight: round2(pageRight) }) };
      } finally { restorePage(); }
    },
  });

  // --- 5. Une liste dans une case de tableau (14/10, « polish » avant la 1.0 voulu par Antoine : « liste dans une case de tableau hors première colonne mal placée dans le PDF ») ---
  // Le retrait d'un élément de liste (le bord de sa boîte) était mesuré depuis le bord gauche de l'hôte de mesure, pas depuis la case où pdfmake le pose : dans la deuxième colonne il valait la largeur de la première
  // (la liste partait à 591 pt, le texte tenait à une lettre par ligne), et dans la première il comptait en trop la bordure et le remplissage de la case. Une liste de case se pose comme une liste du flux, depuis
  // le bord intérieur de sa case : la référence est la même liste hors tableau, mesurée comme eux depuis le premier mot d'un paragraphe qui la précède (« Titre »).
  const LIST_IN_CELL_FIXTURES = [
    ['liste à puces', '<ul><li><p>Alpha</p></li><li><p>Beta</p></li></ul>', ['Alpha', 'Beta']],
    ['liste numérotée', '<ol><li><p>Alpha</p></li><li><p>Beta</p></li></ol>', ['Alpha', 'Beta']],
    ['liste à deux niveaux', '<ul><li><p>Alpha</p><ul><li><p>Beta</p></li></ul></li></ul>', ['Alpha', 'Beta']],
    ['liste de tâches', '<ul data-type="taskList"><li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span></span></label><div><p>Alpha</p></div></li></ul>', ['Alpha']],
  ];
  // « Titre » seul dans sa case, la liste dans la case de la colonne `column` (0, 1 ou 2) d'un tableau de trois colonnes.
  const threeColumns = (column, inner) => '<table><tbody><tr>' + [0, 1, 2].map(i => '<td>' + (i === column ? '<p>Titre</p>' + inner : '<p>Autre ' + i + '</p>') + '</td>').join('') + '</tr></tbody></table>';
  // Où le PDF pose chaque mot repère et ce qui le précède sur sa ligne (la puce ou le numéro), en pt depuis « Titre » ; `lost` : les mots que le PDF n'a pas écrits d'un seul tenant.
  async function offsetsFromTitle(h, html, words) {
    const view = await pdfView(h, html);
    const items = view.truth.pages[0].textItems;
    const title = items.find(item => item.str === 'Titre');
    const found = { lost: [], at: {} };
    words.forEach(word => {
      const at = items.find(item => item.str === word);
      if (!at || !title) { found.lost.push(word); return; }
      const before = items.filter(item => item !== at && Math.abs(item.y - at.y) < 1 && item.x < at.x).sort((a, b) => b.x - a.x)[0];
      found.at[word] = { text: round1(at.x - title.x), marker: before ? round1(before.x - title.x) : null };
    });
    return found;
  }

  cases.push({
    id: 'pdf_gap_list_in_a_table_cell_is_placed_from_the_cell_in_every_column',
    description: 'Une liste (à puces, numérotée, à deux niveaux, de tâches) dans la première, la deuxième ou la troisième colonne d\'un tableau : le PDF écrit chaque mot d\'un seul tenant (pas une lettre par ligne) et pose la puce et le texte à la même distance du bord de la case que la même liste hors tableau, à 1,5 pt près',
    run: async h => {
      const problems = []; const summary = {};
      try {
        await applyPage(h);
        for (const [label, list, words] of LIST_IN_CELL_FIXTURES) {
          const reference = await offsetsFromTitle(h, '<p>Titre</p>' + list, words);
          summary[label] = { flux: reference.at };
          if (reference.lost.length) { problems.push(label + ' : hors tableau, le PDF n\'écrit pas ' + JSON.stringify(reference.lost) + ' d\'un seul tenant'); continue; }
          for (const column of [0, 1, 2]) {
            const name = label + ', colonne ' + (column + 1);
            const got = await offsetsFromTitle(h, threeColumns(column, list), words);
            summary[label]['colonne ' + (column + 1)] = got.at;
            if (got.lost.length) { problems.push(name + ' : le PDF n\'écrit pas ' + JSON.stringify(got.lost) + ' d\'un seul tenant (texte coupé lettre à lettre ou absent)'); continue; }
            words.forEach(word => {
              const want = reference.at[word]; const have = got.at[word];
              if (Math.abs(have.text - want.text) > 1.5) problems.push(name + ' : « ' + word + ' » est à ' + have.text + ' pt du bord de la case, ' + want.text + ' pt hors tableau');
              if (want.marker != null && (have.marker == null || Math.abs(have.marker - want.marker) > 1.5)) problems.push(name + ' : la puce de « ' + word + ' » est à ' + have.marker + ' pt du bord de la case, ' + want.marker + ' pt hors tableau');
            });
          }
        }
      } finally { restorePage(); }
      return { pass: problems.length === 0, notes: JSON.stringify({ problems: compact(problems), summary }) };
    },
  });

  // --- 6. Une citation dans une case de tableau (14/10, « polish » avant la 1.0 : « citation de case mise à plat dans le PDF ») ---
  // Une citation de case sortait du PDF comme du texte de la case : sans l'italique, sans son retrait et sans les 4 pt de dessus et de dessous qu'elle a hors tableau. Elle s'écrit maintenant comme celle du flux, depuis le bord
  // de sa case, dans chaque colonne ; sa coupe de lignes est celle de l'éditeur (le texte tient dans la case moins le retrait).
  const QUOTE_LONG = 'Un texte de citation assez long pour passer sur deux ou trois lignes dans une colonne de tableau étroite, et vérifier la coupe.';
  const QUOTE_FIXTURES = [
    ['citation', '<blockquote><p>Citation</p></blockquote><p>Suite</p>', ['Citation']],
    ['citation de deux paragraphes', '<blockquote><p>Un</p><p>Deux</p></blockquote><p>Suite</p>', ['Un', 'Deux']],
  ];
  // Où le PDF pose chaque mot repère par rapport à « Titre » (pt, vers la droite et vers le bas) et la largeur de son texte (l'italique est plus étroit que le romain).
  async function quoteOffsets(h, html, words) {
    const view = await pdfView(h, html);
    const items = view.truth.pages[0].textItems;
    const title = items.find(item => item.str === 'Titre');
    const found = { lost: [], at: {}, items, title };
    words.concat(['Suite']).forEach(word => {
      const at = items.find(item => item.str === word);
      if (!at || !title) { found.lost.push(word); return; }
      found.at[word] = { x: round1(at.x - title.x), y: round1(at.y - title.y), w: round2(at.width) };
    });
    return found;
  }
  // Le premier mot de chaque ligne de la citation, dans l'éditeur (un mot par plage, ses lignes lues à leur hauteur) et dans le PDF (les mots écrits entre « Titre » et « Suite »).
  async function quoteLinesInEditor(h, html) {
    Editor.setHeaderFooterData(NO_HF);
    Editor.setHTML(html);
    await h.sleep(250);
    Editor.refreshPaginationPreview();
    await h.sleep(60);
    const quote = document.querySelector('#editor-container .tiptap blockquote');
    const firsts = [];
    let lastTop = null;
    const walker = document.createTreeWalker(quote, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const re = /\S+/g;
      let match;
      while ((match = re.exec(node.textContent))) {
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        const top = range.getBoundingClientRect().top;
        if (lastTop === null || Math.abs(top - lastTop) > 3) firsts.push(match[0]);
        lastTop = top;
      }
    }
    return firsts;
  }
  function quoteLinesInPdf(found) {
    const after = found.at.Suite;
    const body = found.items.filter(item => item.y > found.title.y + 1 && item.y < found.title.y + after.y - 1).sort((a, b) => a.y - b.y || a.x - b.x);
    const firsts = [];
    let lastY = null;
    body.forEach(item => { if (lastY === null || Math.abs(item.y - lastY) > 2) firsts.push(item.str); lastY = item.y; });
    return firsts;
  }

  cases.push({
    id: 'pdf_gap_quote_in_a_table_cell_keeps_its_indent_italics_and_spacing_in_every_column',
    description: 'Une citation (d\'un paragraphe, de deux, longue) dans la première, la deuxième ou la troisième colonne d\'un tableau : le PDF l\'écrit en italique, avec son retrait et les 4 pt de dessus et de dessous, à la même distance du bord de la case que la même citation hors tableau, et coupe ses lignes aux mêmes mots que l\'éditeur',
    run: async h => {
      const problems = []; const summary = {};
      try {
        await applyPage(h);
        for (const [label, quote, words] of QUOTE_FIXTURES) {
          const reference = await quoteOffsets(h, '<p>Titre</p>' + quote, words);
          summary[label] = { flux: reference.at };
          if (reference.lost.length) { problems.push(label + ' : hors tableau, le PDF n\'écrit pas ' + JSON.stringify(reference.lost)); continue; }
          for (const column of [0, 1, 2]) {
            const name = label + ', colonne ' + (column + 1);
            const got = await quoteOffsets(h, threeColumns(column, quote), words);
            summary[label]['colonne ' + (column + 1)] = got.at;
            if (got.lost.length) { problems.push(name + ' : le PDF n\'écrit pas ' + JSON.stringify(got.lost)); continue; }
            words.concat(['Suite']).forEach(word => {
              const want = reference.at[word]; const have = got.at[word];
              if (Math.abs(have.x - want.x) > 1.5) problems.push(name + ' : « ' + word + ' » est à ' + have.x + ' pt du bord de la case, ' + want.x + ' pt hors tableau');
              if (Math.abs(have.y - want.y) > 1) problems.push(name + ' : « ' + word + ' » est à ' + have.y + ' pt sous « Titre », ' + want.y + ' pt hors tableau (les 4 pt de la citation)');
              if (Math.abs(have.w - want.w) > 0.15) problems.push(name + ' : « ' + word + ' » fait ' + have.w + ' pt de large, ' + want.w + ' pt hors tableau (italique attendu pour une citation)');
            });
          }
        }
        // La coupe des lignes d'une citation longue, dans chaque colonne, est celle de l'éditeur.
        for (const column of [0, 1, 2]) {
          const html = threeColumns(column, '<blockquote><p>' + QUOTE_LONG + '</p></blockquote><p>Suite</p>');
          const wanted = await quoteLinesInEditor(h, html);
          const got = await quoteOffsets(h, html, ['Un']);
          const lines = got.lost.length ? ['(repères absents : ' + got.lost.join(', ') + ')'] : quoteLinesInPdf(got);
          summary['coupe, colonne ' + (column + 1)] = { editeur: wanted, pdf: lines };
          if (JSON.stringify(wanted) !== JSON.stringify(lines)) problems.push('citation longue, colonne ' + (column + 1) + ' : le PDF commence ses lignes par ' + JSON.stringify(lines) + ', l\'éditeur par ' + JSON.stringify(wanted));
        }
      } finally { restorePage(); }
      return { pass: problems.length === 0, notes: JSON.stringify({ problems: compact(problems), summary }) };
    },
  });

  // --- 7. Une liste dans une citation (14/10, « polish » avant la 1.0 : « trait d'une liste placée dans une citation ») ---
  // Le PDF lisait la citation d'un seul tenant, liste comprise : les éléments se collaient sur une même ligne, sans puce ni numéro, et le trait d'un élément ne se dessinait pas. La liste est maintenant ses propres blocs (un par
  // élément, avec sa puce, son retrait et son trait), en italique comme le reste de la citation, entre le texte d'avant et le texte d'après.
  cases.push({
    id: 'pdf_gap_list_inside_a_quote_keeps_its_items_bullets_indent_and_rule',
    description: 'Une liste à puces ou numérotée dans une citation (avec un trait dans un élément, entre un texte d\'avant et un texte d\'après) : le PDF met chaque élément sur sa ligne avec sa puce ou son numéro, à la même distance du bord que l\'éditeur, en italique, pose les paragraphes à la même distance que l\'éditeur et peint le trait d\'un élément (un seul, de la puce au bord droit de la page)',
    run: async h => {
      const problems = []; const summary = {};
      try {
        await applyPage(h);
        const margins = PageLayout.getMarginsPt();
        // [libellé, HTML de la citation, repères (un par paragraphe), éléments qui portent une puce ou un numéro, traits attendus, repère de l'élément qui porte le trait]
        const fixtures = [
          ['liste à puces', '<blockquote><ul><li><p>Alpha</p></li><li><p>Beta</p></li></ul></blockquote><p>Gamma</p>', ['Alpha', 'Beta', 'Gamma'], ['Alpha', 'Beta'], 0, null],
          ['liste avec un trait', '<blockquote><ul><li><p>Alpha</p><hr><p>Beta</p></li></ul></blockquote><p>Gamma</p>', ['Alpha', 'Beta', 'Gamma'], ['Alpha'], 1, 'Alpha'],
          ['liste numérotée entre deux textes', '<blockquote><p>Avant</p><ol><li><p>Alpha</p><hr><p>Beta</p></li><li><p>Gamma</p></li></ol><p>Apres</p></blockquote><p>Fin</p>', ['Avant', 'Alpha', 'Beta', 'Gamma', 'Apres', 'Fin'], ['Alpha', 'Gamma'], 1, 'Alpha'],
        ];
        for (const [label, quoteHtml, markers, bulleted, expectedRules, ruleItem] of fixtures) {
          const d = await distancesBetween(h, '<p>Titre</p>' + quoteHtml, ['Titre'].concat(markers));
          const rules = await paintedRules(h, d.view);
          const title = d.items.find(it => it.str === 'Titre');
          const markerOf = word => { const at = d.items.find(it => it.str === word); return at ? d.items.filter(it => it !== at && Math.abs(it.y - at.y) < 1 && it.x < at.x).sort((a, b) => b.x - a.x)[0] : null; };
          summary[label] = { editor: d.editor, pdf: d.pdf, rules };
          d.pdf.forEach((gap, i) => {
            const want = d.editor[i];
            const pair = (i === 0 ? 'Titre' : markers[i - 1]) + ' à ' + markers[i];
            if (gap == null || want == null) problems.push(label + ' : un repère de ' + pair + ' manque (PDF ' + gap + ', éditeur ' + want + ')');
            else if (Math.abs(gap - want) > 1.5) problems.push(label + ' : de ' + pair + ', ' + gap + ' px dans le PDF contre ' + want + ' px dans l\'éditeur');
          });
          // Chaque élément a sa puce ou son numéro, sur sa ligne, au retrait que lui donne l'éditeur depuis « Titre ».
          const root = document.querySelector('#editor-container .tiptap');
          const zoom = EditorCore.layoutZoom(root);
          const titleParagraph = Array.from(root.querySelectorAll('p')).find(p => p.textContent.trim() === 'Titre');
          const textLeft = el => { const range = document.createRange(); range.selectNodeContents(el.firstChild); return range.getBoundingClientRect().left; };
          const itemAt = word => Array.from(root.querySelectorAll('li')).find(li => li.querySelector('p') && li.querySelector('p').textContent.trim() === word);
          bulleted.forEach(word => {
            const marker = markerOf(word);
            if (!marker) { problems.push(label + ' : « ' + word + ' » n\'a ni puce ni numéro avant lui sur sa ligne'); return; }
            const li = itemAt(word);
            const want = round1((li.getBoundingClientRect().left - textLeft(titleParagraph)) / zoom * 0.75);
            // Le texte de l'élément commence au bord de sa boîte (la puce pend à sa gauche, comme dans l'éditeur).
            const have = round1(d.items.find(it => it.str === word).x - title.x);
            summary[label][word] = { texte: have, puce: round1(marker.x - title.x), editeur: want };
            if (Math.abs(have - want) > 2) problems.push(label + ' : le texte de « ' + word + ' » commence à ' + have + ' pt de « Titre », l\'élément de l\'éditeur à ' + want + ' pt');
            if (marker.x >= d.items.find(it => it.str === word).x) problems.push(label + ' : la puce de « ' + word + ' » (' + round1(marker.x - title.x) + ' pt) n\'est pas à gauche de son texte (' + have + ' pt)');
          });
          // L'italique de la citation : « Alpha » aussi large que dans une citation d'un paragraphe.
          const reference = await pdfView(h, '<p>Titre</p><blockquote><p>' + markers[bulleted[0] === 'Alpha' ? markers.indexOf('Alpha') : 0] + '</p></blockquote>');
          const italicWidth = reference.truth.pages[0].textItems.find(it => it.str === bulleted[0]);
          const itemWidth = d.items.find(it => it.str === bulleted[0]);
          if (italicWidth && itemWidth && Math.abs(italicWidth.width - itemWidth.width) > 0.15) problems.push(label + ' : « ' + bulleted[0] + ' » fait ' + round2(itemWidth.width) + ' pt de large, ' + round2(italicWidth.width) + ' pt en italique');
          if (rules.length !== expectedRules) { problems.push(label + ' : le PDF peint ' + rules.length + ' trait(s) au lieu de ' + expectedRules + ' : ' + JSON.stringify(rules)); continue; }
          if (expectedRules) {
            const rule = rules[0]; const itemText = d.items.find(it => it.str === ruleItem);
            if (itemText && Math.abs(rule.x1 - itemText.x) > 1.5) problems.push(label + ' : le trait part de ' + rule.x1 + ' pt, le texte de l\'élément de ' + round2(itemText.x) + ' pt');
            const pageRight = d.view.truth.pages[0].width - margins.right;
            if (Math.abs(rule.x2 - pageRight) > 1) problems.push(label + ' : le trait finit à ' + rule.x2 + ' pt, la marge de droite est à ' + round2(pageRight) + ' pt');
          }
        }
      } finally { restorePage(); }
      return { pass: problems.length === 0, notes: JSON.stringify({ problems: compact(problems), summary }) };
    },
  });

  // --- 8. Le texte d'une liste commence où l'éditeur le fait commencer (14/10, carte « Aligner le PDF ») ---
  // Dans l'éditeur, la Lecture (`::marker`) et le Word (retrait suspendu), la puce ou le numéro pend à GAUCHE de la boîte de l'élément : le texte de la première ligne commence au bord de la boîte, comme les lignes suivantes. Le PDF écrivait le
  // marqueur en tête du texte, au bord de la boîte : la première ligne partait 6,2 pt (une puce) à 11,3 pt (« 1. ») trop à droite, avait autant de place en moins, et les lignes suivantes revenaient sous le marqueur. Le marqueur est maintenant le premier
  // mot du bloc, avec un retrait de première ligne négatif de sa largeur (`leadingIndent` de pdfmake) : il sort à gauche du bord de la boîte, le texte qui le suit commence au bord, comme les lignes suivantes. Deux cas comparent, pour chaque forme de liste, où le
  // PDF et l'éditeur commencent le texte (pt depuis « Titre ») sur la première ligne et sur les suivantes, et quels mots ouvrent chaque ligne : au premier niveau, puis dans les trois colonnes d'un tableau.
  const LIST_LONG = 'un point de liste assez long pour passer sur plusieurs lignes dans la largeur de la page, et montrer où commencent la première ligne et les suivantes, dans l\'éditeur comme dans le PDF, avec des mots de longueurs variées.';
  const listItem = (word, long) => '<li><p>' + word + (long ? ' ' + LIST_LONG : '') + '</p></li>';
  const LIST_ALIGN_FIXTURES = [
    ['puces', '<ul>' + listItem('Alpha', true) + listItem('Beta') + '</ul>', ['Alpha', 'Beta']],
    ['puces rondes', '<ul data-bullet-style="circle">' + listItem('Alpha', true) + '</ul>', ['Alpha']],
    ['puces carrées', '<ul data-bullet-style="square">' + listItem('Alpha', true) + '</ul>', ['Alpha']],
    ['numérotée', '<ol>' + listItem('Alpha', true) + listItem('Beta') + '</ol>', ['Alpha', 'Beta']],
    ['numérotée à deux chiffres', '<ol start="9">' + listItem('Alpha', true) + listItem('Beta', true) + '</ol>', ['Alpha', 'Beta']],
    // « 100. » est plus large que le retrait de la liste : le numéro sort à gauche du retrait, comme dans l'éditeur, le texte reste au retrait.
    ['numérotée à trois chiffres', '<ol start="99">' + listItem('Alpha', true) + listItem('Beta', true) + '</ol>', ['Alpha', 'Beta']],
    ['lettres', '<ol data-number-style="alpha">' + listItem('Alpha', true) + '</ol>', ['Alpha']],
    ['chiffres romains', '<ol data-number-style="roman">' + listItem('Alpha', true) + '</ol>', ['Alpha']],
    ['deux niveaux', '<ul><li><p>Alpha ' + LIST_LONG + '</p><ul>' + listItem('Beta', true) + '</ul></li></ul>', ['Alpha', 'Beta']],
  ];
  // Où l'éditeur commence le texte de chaque élément (pt depuis le premier caractère de « Titre ») et quel mot ouvre chacune de ses lignes.
  async function listStartsInEditor(h, html, firsts) {
    Editor.setHeaderFooterData(NO_HF);
    Editor.setHTML(html);
    await h.sleep(250);
    Editor.refreshPaginationPreview();
    await h.sleep(60);
    const root = document.querySelector('#editor-container .tiptap');
    const zoom = EditorCore.layoutZoom(root);
    const range = document.createRange();
    const paragraphOf = word => Array.from(root.querySelectorAll('li > p')).find(p => p.textContent.trim().split(/\s+/)[0] === word);
    const titleLeft = (() => {
      const title = Array.from(root.querySelectorAll('p')).find(p => p.textContent.trim() === 'Titre');
      range.setStart(title.firstChild, 0); range.setEnd(title.firstChild, 1);
      return range.getBoundingClientRect().left;
    })();
    const found = {};
    firsts.forEach(word => {
      const paragraph = paragraphOf(word);
      if (!paragraph) { found[word] = null; return; }
      const lines = [];
      let lastTop = null; let startLeft = null;
      const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const re = /\S+/g; let match;
        while ((match = re.exec(node.textContent))) {
          range.setStart(node, match.index); range.setEnd(node, match.index + match[0].length);
          const rect = range.getBoundingClientRect();
          if (lastTop === null || Math.abs(rect.top - lastTop) > 3) { lines.push(match[0]); if (startLeft === null) startLeft = rect.left; }
          lastTop = rect.top;
        }
      }
      found[word] = { x: round1((startLeft - titleLeft) / zoom * 0.75), lines };
    });
    return found;
  }
  // Où le PDF commence le texte de chaque élément (pt depuis « Titre ») : sa première ligne, les suivantes, les mots qui les ouvrent, et le marqueur qui précède le premier mot.
  async function listStartsInPdf(h, html, firsts) {
    const view = await pdfView(h, html);
    const items = view.truth.pages[0].textItems.map(item => Object.assign({}, item, { str: item.str.trim() }));
    const title = items.find(item => item.str === 'Titre');
    const end = items.find(item => item.str === 'Fin');
    const ats = firsts.map(word => items.find(item => item.str === word));
    const found = { lost: [], at: {} };
    if (!title || !end || ats.some(at => !at)) { found.lost = ['Titre', 'Fin'].concat(firsts).filter(word => !items.some(item => item.str === word)); return found; }
    firsts.forEach((word, k) => {
      const at = ats[k];
      const bottom = k + 1 < firsts.length ? ats[k + 1].y : end.y;
      const groups = [];
      items.filter(item => item.y >= at.y - 1 && item.y < bottom - 1).sort((a, b) => a.y - b.y || a.x - b.x).forEach(item => {
        const group = groups[groups.length - 1];
        if (group && Math.abs(item.y - group.y) < 2) group.items.push(item); else groups.push({ y: item.y, items: [item] });
      });
      // Le premier mot est « at » (le marqueur est à sa gauche) ; une ligne suivante s'ouvre par son mot le plus à gauche.
      const openers = groups.map((group, i) => i === 0 ? at : group.items.slice().sort((a, b) => a.x - b.x)[0]);
      const marker = items.filter(item => item !== at && Math.abs(item.y - at.y) < 1 && item.x < at.x).sort((a, b) => b.x - a.x)[0] || null;
      found.at[word] = {
        x: round1(at.x - title.x),
        starts: openers.slice(1).map(item => round1(item.x - title.x)),
        lines: openers.map(item => item.str),
        marker: marker ? { x: round1(marker.x - title.x), gap: round1(at.x - (marker.x + marker.width)) } : null,
      };
    });
    return found;
  }
  // Juge un document : le PDF contre l'éditeur, élément par élément. `name` : ce qui est mesuré, pour le message.
  function judgeListStarts(name, wanted, got, firsts, problems) {
    if (got.lost.length) { problems.push(name + ' : le PDF n\'écrit pas ' + JSON.stringify(got.lost) + ' d\'un seul tenant'); return; }
    firsts.forEach(word => {
      const want = wanted[word]; const have = got.at[word];
      if (!want) { problems.push(name + ' : « ' + word + ' » est introuvable dans l\'éditeur'); return; }
      if (Math.abs(have.x - want.x) > 1.5) problems.push(name + ' : le texte de « ' + word + ' » commence à ' + have.x + ' pt de « Titre » dans le PDF, à ' + want.x + ' pt dans l\'éditeur');
      have.starts.forEach((start, i) => {
        if (Math.abs(start - want.x) > 1.5) problems.push(name + ' : la ligne ' + (i + 2) + ' de « ' + word + ' » commence à ' + start + ' pt de « Titre » dans le PDF, à ' + want.x + ' pt dans l\'éditeur');
      });
      if (JSON.stringify(have.lines) !== JSON.stringify(want.lines)) problems.push(name + ' : « ' + word + ' » : le PDF ouvre ses lignes par ' + JSON.stringify(have.lines) + ', l\'éditeur par ' + JSON.stringify(want.lines));
      // Le marqueur pend à gauche du texte, contre lui : ni dessus, ni loin.
      if (!have.marker) problems.push(name + ' : « ' + word + ' » n\'a ni puce ni numéro avant lui sur sa ligne');
      else if (have.marker.x >= have.x - 1 || have.marker.gap < -0.6 || have.marker.gap > 5) problems.push(name + ' : le marqueur de « ' + word + ' » est à ' + have.marker.x + ' pt de « Titre » (le texte à ' + have.x + ' pt), ' + have.marker.gap + ' pt de vide entre eux');
    });
  }

  cases.push({
    id: 'pdf_gap_list_text_starts_where_the_editor_starts_it',
    description: 'Une liste (à puces, rondes, carrées, numérotée, à deux chiffres, en lettres, en chiffres romains, à deux niveaux) dont un élément passe sur plusieurs lignes : le PDF commence le texte de la première ligne et celui des lignes suivantes au même endroit que l\'éditeur (le marqueur pend à gauche, contre le texte), à 1,5 pt près, et ouvre chaque ligne par le même mot',
    run: async h => {
      const problems = []; const summary = {};
      try {
        await applyPage(h);
        for (const [label, list, firsts] of LIST_ALIGN_FIXTURES) {
          const html = '<p>Titre</p>' + list + '<p>Fin</p>';
          const wanted = await listStartsInEditor(h, html, firsts);
          const got = await listStartsInPdf(h, html, firsts);
          summary[label] = { editeur: wanted, pdf: got.at };
          judgeListStarts(label, wanted, got, firsts, problems);
        }
      } finally { restorePage(); }
      return { pass: problems.length === 0, notes: JSON.stringify({ problems: compact(problems), summary }) };
    },
  });

  cases.push({
    id: 'pdf_gap_list_text_in_a_table_cell_starts_where_the_editor_starts_it',
    description: 'Une liste à puces et une liste numérotée à deux chiffres dans la première, la deuxième ou la troisième colonne d\'un tableau : le PDF commence le texte de chaque ligne au même endroit que l\'éditeur depuis « Titre » (la puce ou le numéro pend à gauche), à 1,5 pt près',
    run: async h => {
      const problems = []; const summary = {};
      try {
        await applyPage(h);
        for (const [label, list, firsts] of LIST_ALIGN_FIXTURES.filter(f => f[0] === 'puces' || f[0] === 'numérotée à deux chiffres')) {
          for (const column of [0, 1, 2]) {
            const name = label + ', colonne ' + (column + 1);
            const html = threeColumns(column, list) + '<p>Fin</p>';
            const wanted = await listStartsInEditor(h, html, firsts);
            const got = await listStartsInPdf(h, html, firsts);
            summary[name] = { editeur: wanted, pdf: got.at };
            judgeListStarts(name, wanted, got, firsts, problems);
          }
        }
      } finally { restorePage(); }
      return { pass: problems.length === 0, notes: JSON.stringify({ problems: compact(problems), summary }) };
    },
  });

  // --- 9. L'alignement d'un point de liste (14/10, carte « Dans le PDF, respecter l'alignement des points de liste (centré, à droite, justifié) ? », réponse « Respecter l'alignement ») ---
  // Le bouton d'alignement de l'éditeur pose `text-align` sur le PARAGRAPHE de l'élément de liste, jamais sur le <li> : le PDF ne lisait que le <li> et écrivait donc à gauche ce que l'éditeur centre, aligne à droite ou justifie. Il lit maintenant le premier paragraphe de l'élément
  // (celui de sa zone de texte, dans une liste de tâches). La puce ou le numéro reste au bord gauche de la boîte de l'élément, hors d'elle, comme `::marker` dans Chromium (la puce d'un point centré ne suit pas son texte) : deux colonnes, le marqueur large comme lui, puis le texte aligné ;
  // la rangée recule de la largeur du marqueur pour que le texte reste au retrait de la liste. Trois cas comparent, ligne à ligne, le mot qui ouvre la ligne et ses bords gauche et droit (pt depuis « Titre ») dans le PDF et dans l'éditeur : au premier niveau et en sous-liste, dans les trois
  // colonnes d'un tableau, puis quand un point est coupé par une page. Ce dernier garde un piège de pdfmake 0.2.7 : une rangée de colonnes coupée par un saut de page remet la largeur du conteneur de premier niveau à celle de la page, puis la marge de la rangée s'y ajoute en sortant, et tout
  // ce qui suit sort à droite de la page de cette marge (les points d'après et le paragraphe justifié qui les suit sont jugés eux aussi).
  const TEXT_ALIGNS = ['center', 'right', 'justify'];
  // L'alignement du sous-niveau : un autre que celui du parent, pour que les deux niveaux se jugent.
  const OTHER_ALIGN = { left: 'left', center: 'right', right: 'justify', justify: 'center' };
  const alignedItem = (align, word, long) => '<li><p style="text-align: ' + align + '">' + word + (long ? ' ' + LIST_LONG : '') + '</p></li>';
  const taskItem = (align, word) => '<li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span></span></label><div><p style="text-align: ' + align + '">' + word + ' ' + LIST_LONG + '</p></div></li>';
  // [nom, liste pour un alignement, mots qui ouvrent ses éléments, liste de tâches]
  const TEXT_ALIGN_FIXTURES = [
    ['puces', a => '<ul>' + alignedItem(a, 'Alpha', true) + alignedItem(a, 'Beta') + '</ul>', ['Alpha', 'Beta']],
    // « 10. » est plus large que le retrait de la liste : le numéro sort à gauche du retrait, la rangée recule d'une marge négative.
    ['numérotée à deux chiffres', a => '<ol start="9">' + alignedItem(a, 'Alpha', true) + alignedItem(a, 'Beta', true) + '</ol>', ['Alpha', 'Beta']],
    ['deux niveaux', a => '<ul><li><p style="text-align: ' + a + '">Alpha ' + LIST_LONG + '</p><ul>' + alignedItem(OTHER_ALIGN[a], 'Beta', true) + '</ul></li></ul>', ['Alpha', 'Beta']],
    ['liste de tâches', a => '<ul data-type="taskList">' + taskItem(a, 'Alpha') + '</ul>', ['Alpha'], true],
  ];
  // Les lignes de chaque paragraphe de `firsts` (repéré par son premier mot) dans l'éditeur : le mot qui ouvre chacune, ses bords gauche et droit (pt depuis le premier caractère de « Titre »).
  async function textLinesInEditor(h, html, firsts) {
    Editor.setHeaderFooterData(NO_HF);
    Editor.setHTML(html);
    await h.sleep(250);
    Editor.refreshPaginationPreview();
    await h.sleep(60);
    const root = document.querySelector('#editor-container .tiptap');
    const zoom = EditorCore.layoutZoom(root);
    const range = document.createRange();
    const title = Array.from(root.querySelectorAll('p')).find(p => p.textContent.trim() === 'Titre');
    range.setStart(title.firstChild, 0); range.setEnd(title.firstChild, 1);
    const titleLeft = range.getBoundingClientRect().left;
    const pt = px => round1((px - titleLeft) / zoom * 0.75);
    const found = {};
    firsts.forEach(word => {
      const paragraph = Array.from(root.querySelectorAll('p')).find(p => p.textContent.trim().split(/\s+/)[0] === word);
      if (!paragraph) { found[word] = null; return; }
      const lines = [];
      let lastTop = null;
      const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const re = /\S+/g; let match;
        while ((match = re.exec(node.textContent))) {
          range.setStart(node, match.index); range.setEnd(node, match.index + match[0].length);
          const rect = range.getBoundingClientRect();
          if (lastTop === null || Math.abs(rect.top - lastTop) > 3) lines.push({ opener: match[0], left: pt(rect.left), right: pt(rect.right) });
          else lines[lines.length - 1].right = pt(rect.right);
          lastTop = rect.top;
        }
      }
      found[word] = lines;
    });
    return found;
  }
  // Les mêmes lignes dans le PDF, page après page (les pages se lisent à la suite), avec le marqueur qui précède le premier mot et les pages que couvre le paragraphe.
  async function textLinesInPdf(h, html, firsts) {
    const view = await pdfView(h, html);
    const PAGE = 100000;
    const items = [];
    view.truth.pages.forEach((page, p) => page.textItems.forEach(item => items.push({ str: item.str.trim(), x: item.x, y: item.y + p * PAGE, width: item.width, page: p })));
    const title = items.find(item => item.str === 'Titre');
    const end = items.find(item => item.str === 'Fin');
    const ats = firsts.map(word => items.find(item => item.str === word));
    const found = { lost: [], at: {} };
    if (!title || !end || ats.some(at => !at)) { found.lost = ['Titre', 'Fin'].concat(firsts).filter(word => !items.some(item => item.str === word)); return found; }
    firsts.forEach((word, k) => {
      const at = ats[k];
      const bottom = k + 1 < firsts.length ? ats[k + 1].y : end.y;
      const groups = [];
      items.filter(item => item.y >= at.y - 1 && item.y < bottom - 1).sort((a, b) => a.y - b.y || a.x - b.x).forEach(item => {
        const group = groups[groups.length - 1];
        if (group && Math.abs(item.y - group.y) < 2) group.items.push(item); else groups.push({ y: item.y, items: [item] });
      });
      const marker = items.filter(item => item !== at && Math.abs(item.y - at.y) < 1 && item.x < at.x).sort((a, b) => b.x - a.x)[0] || null;
      const lines = groups.map(group => {
        const row = group.items.filter(item => item !== marker).sort((a, b) => a.x - b.x);
        return { opener: row[0].str, left: round1(row[0].x - title.x), right: round1(Math.max(...row.map(item => item.x + item.width)) - title.x) };
      });
      found.at[word] = { lines, marker: marker ? round1(marker.x - title.x) : null, pages: Array.from(new Set(groups.map(group => group.items[0].page))) };
    });
    return found;
  }
  const linesText = lines => lines.map(line => line.opener + '[' + line.left + '..' + line.right + ']').join(' ');
  // Juge un document : le PDF contre l'éditeur, paragraphe par paragraphe, ligne par ligne. `ref` : le même document aligné à gauche dans le PDF, où la puce ne bouge pas ; `options.plain` : les paragraphes sans puce ; `options.taskBox` : une liste de tâches, dont la case
  // est plus étroite dans le PDF (13 pt) que dans l'éditeur (21 pt) depuis toujours : seuls les bords droits se comparent, à 5,5 pt près (9,8 pt pour la dernière ligne, que la justification laisse à gauche : les 8 pt de la case s'y ajoutent).
  function judgeTextLines(name, wanted, got, ref, firsts, problems, options = {}) {
    if (got.lost.length) { problems.push(name + ' : le PDF n\'écrit pas ' + JSON.stringify(got.lost) + ' d\'un seul tenant'); return; }
    firsts.forEach(word => {
      const want = wanted[word]; const have = got.at[word];
      if (!want) { problems.push(name + ' : « ' + word + ' » est introuvable dans l\'éditeur'); return; }
      const openers = lines => JSON.stringify(lines.map(line => line.opener));
      if (openers(want) !== openers(have.lines)) { problems.push(name + ' : « ' + word + ' » : le PDF ouvre ses lignes par ' + openers(have.lines) + ', l\'éditeur par ' + openers(want)); return; }
      want.forEach((line, i) => {
        const mine = have.lines[i];
        // La dernière ligne d'un texte centré ou à droite : le PDF garde à droite la largeur d'une espace (cf. spaceWidthPt) que la dernière ligne de l'éditeur, sans espace de fin, n'a pas : 1,3 pt (centré), 2,6 pt (à droite).
        const last = i === want.length - 1;
        const tolerance = options.taskBox ? (last ? 9.8 : 5.5) : (last ? 3.3 : 1.5);
        if (!options.taskBox && Math.abs(mine.left - line.left) > tolerance) problems.push(name + ' : la ligne ' + (i + 1) + ' de « ' + word + ' » (' + line.opener + ') commence à ' + mine.left + ' pt de « Titre » dans le PDF, à ' + line.left + ' pt dans l\'éditeur');
        if (Math.abs(mine.right - line.right) > tolerance) problems.push(name + ' : la ligne ' + (i + 1) + ' de « ' + word + ' » (' + line.opener + ') finit à ' + mine.right + ' pt de « Titre » dans le PDF, à ' + line.right + ' pt dans l\'éditeur');
      });
      if (options.taskBox || (options.plain || []).includes(word)) return;
      // Le marqueur reste au bord gauche de la boîte, où qu'aille le texte : là où il est quand le point est à gauche.
      const base = ref && ref.at[word];
      if (have.marker === null) problems.push(name + ' : « ' + word + ' » n\'a ni puce ni numéro avant lui sur sa ligne');
      else if (base && base.marker !== null && Math.abs(have.marker - base.marker) > 0.6) problems.push(name + ' : le marqueur de « ' + word + ' » est à ' + have.marker + ' pt de « Titre », à ' + base.marker + ' pt quand le point est à gauche');
    });
  }
  const summaryOf = (wanted, got, firsts) => {
    const out = {};
    firsts.forEach(word => { out[word] = { editeur: wanted[word] ? linesText(wanted[word]) : null, pdf: got.at[word] ? linesText(got.at[word].lines) + (got.at[word].marker === null ? '' : ' (marqueur ' + got.at[word].marker + ')') : null }; });
    return out;
  };

  cases.push({
    id: 'pdf_gap_aligned_list_text_lines_match_the_editor',
    description: 'Une liste à puces, une numérotée à deux chiffres, une à deux niveaux et une liste de tâches dont le texte est centré, à droite ou justifié (le bouton d\'alignement le pose sur le paragraphe de l\'élément) : le PDF ouvre chaque ligne par le même mot que l\'éditeur et la commence et la finit au même endroit (1,5 pt près), la puce ou le numéro restant au bord gauche de la boîte',
    run: async h => {
      const problems = []; const summary = {};
      try {
        await applyPage(h);
        for (const [label, build, firsts, taskBox] of TEXT_ALIGN_FIXTURES) {
          const ref = await textLinesInPdf(h, '<p>Titre</p>' + build('left') + '<p>Fin</p>', firsts);
          for (const align of TEXT_ALIGNS) {
            const name = label + ', ' + align;
            const html = '<p>Titre</p>' + build(align) + '<p>Fin</p>';
            const wanted = await textLinesInEditor(h, html, firsts);
            const got = await textLinesInPdf(h, html, firsts);
            if (!got.lost.length) summary[name] = summaryOf(wanted, got, firsts);
            judgeTextLines(name, wanted, got, ref, firsts, problems, { taskBox });
          }
        }
      } finally { restorePage(); }
      return { pass: problems.length === 0, notes: JSON.stringify({ problems: compact(problems), summary }) };
    },
  });

  cases.push({
    id: 'pdf_gap_aligned_list_text_in_a_table_cell_matches_the_editor',
    description: 'Une liste à puces (dans la première, la deuxième ou la troisième colonne d\'un tableau) et une liste numérotée à deux chiffres (deuxième colonne) dont le texte est centré, à droite ou justifié : le PDF ouvre chaque ligne par le même mot que l\'éditeur et la commence et la finit au même endroit depuis « Titre » (1,5 pt près), la puce ou le numéro restant au bord gauche',
    run: async h => {
      const problems = []; const summary = {};
      try {
        await applyPage(h);
        const [bullets, numbered] = [TEXT_ALIGN_FIXTURES[0], TEXT_ALIGN_FIXTURES[1]];
        for (const [label, build, firsts, columns] of [bullets.concat([[0, 1, 2]]), numbered.concat([[1]])]) {
          for (const column of columns) {
            const ref = await textLinesInPdf(h, threeColumns(column, build('left')) + '<p>Fin</p>', firsts);
            for (const align of TEXT_ALIGNS) {
              const name = label + ', colonne ' + (column + 1) + ', ' + align;
              const html = threeColumns(column, build(align)) + '<p>Fin</p>';
              const wanted = await textLinesInEditor(h, html, firsts);
              const got = await textLinesInPdf(h, html, firsts);
              if (!got.lost.length) summary[name] = summaryOf(wanted, got, firsts);
              judgeTextLines(name, wanted, got, ref, firsts, problems);
            }
          }
        }
      } finally { restorePage(); }
      return { pass: problems.length === 0, notes: JSON.stringify({ problems: compact(problems), summary }) };
    },
  });

  // Un point centré que la fin de la page coupe, un point d'après avec sa sous-liste à droite, un paragraphe justifié, un autre à droite : tout se juge, le décor étant choisi pour que le saut de page tombe dans un point (au 43e et au 45e paragraphe de remplissage il tombe dans « Suite », puis dans « Coupe »).
  const BREAK_FILLERS = [43, 45];
  cases.push({
    id: 'pdf_gap_aligned_list_item_cut_by_a_page_keeps_its_lines_and_leaves_what_follows_alone',
    description: 'Un point de liste centré que la fin de la page coupe, suivi d\'un point centré avec une sous-liste à droite, d\'un paragraphe justifié et d\'un paragraphe à droite : aucune ligne ne change de mot d\'ouverture ni de place par rapport à l\'éditeur, y compris derrière la coupe (pdfmake 0.2.7 élargit sinon ce qui suit la rangée coupée de la marge de la rangée)',
    run: async h => {
      const problems = []; const summary = {};
      try {
        await applyPage(h);
        const firsts = ['Coupe', 'Suite', 'Sous', 'Apres', 'Dernier'];
        for (const fillers of BREAK_FILLERS) {
          const name = fillers + ' paragraphes de remplissage';
          const html = '<p>Titre</p>' + rows(fillers, 'Remplissage')
            + '<ul>' + alignedItem('center', 'Coupe ' + LIST_LONG + ' ' + LIST_LONG, true)
            + '<li><p style="text-align: center">Suite ' + LIST_LONG + '</p><ul>' + alignedItem('right', 'Sous', true) + '</ul></li></ul>'
            + '<p style="text-align: justify">Apres ' + LIST_LONG + ' ' + LIST_LONG + '</p><p style="text-align: right">Dernier ' + LIST_LONG + '</p><p>Fin</p>';
          const wanted = await textLinesInEditor(h, html, firsts);
          const got = await textLinesInPdf(h, html, firsts);
          if (!got.lost.length) summary[name] = summaryOf(wanted, got, firsts);
          judgeTextLines(name, wanted, got, null, firsts, problems, { plain: ['Apres', 'Dernier'] });
          if (!got.lost.length && !['Coupe', 'Suite', 'Sous'].some(word => got.at[word].pages.length > 1)) problems.push(name + ' : aucun point de liste n\'est coupé par la page : le décor ne vérifie plus ce qu\'il doit');
        }
      } finally { restorePage(); }
      return { pass: problems.length === 0, notes: JSON.stringify({ problems: compact(problems), summary }) };
    },
  });

  // --- 10. L'alignement d'une citation (14/10, carte « Dans le PDF, respecter l'alignement d'une citation (centrée, à droite, justifiée) ? », réponse « Respecter ») ---
  // Comme un point de liste (9) : le bouton d'alignement de l'éditeur pose `text-align` sur le PARAGRAPHE de la citation, jamais sur le <blockquote>, et le PDF ne lisait que lui. Il lit maintenant le premier paragraphe de la citation, au premier niveau comme dans une case de tableau.
  // Deux cas comparent, ligne à ligne, le mot qui ouvre la ligne et ses bords gauche et droit (pt depuis « Titre ») dans le PDF et dans l'éditeur : une citation d'un paragraphe, de deux et une que coupe un trait, au premier niveau, puis dans les trois colonnes d'un tableau.
  const quoteOf = (align, word) => '<blockquote><p style="text-align: ' + align + '">' + word + ' ' + LIST_LONG + '</p></blockquote>';
  // [nom, citations pour un alignement, mots qui ouvrent leurs paragraphes]
  const QUOTE_ALIGN_FIXTURES = [
    ['citation d\'un paragraphe', a => quoteOf(a, 'Alpha') + quoteOf(a, 'Beta'), ['Alpha', 'Beta']],
    ['citation de deux paragraphes', a => '<blockquote><p style="text-align: ' + a + '">Alpha ' + LIST_LONG + '</p><p style="text-align: ' + a + '">Beta ' + LIST_LONG + '</p></blockquote>', ['Alpha', 'Beta']],
    ['citation coupée par un trait', a => '<blockquote><p style="text-align: ' + a + '">Alpha ' + LIST_LONG + '</p><hr><p style="text-align: ' + a + '">Beta ' + LIST_LONG + '</p></blockquote>', ['Alpha', 'Beta']],
  ];

  cases.push({
    id: 'pdf_gap_aligned_quote_text_lines_match_the_editor',
    description: 'Une citation d\'un paragraphe, une de deux paragraphes et une que coupe un trait, dont le texte est centré, à droite ou justifié (le bouton d\'alignement le pose sur le paragraphe de la citation) : le PDF ouvre chaque ligne par le même mot que l\'éditeur et la commence et la finit au même endroit (1,5 pt près)',
    run: async h => {
      const problems = []; const summary = {};
      try {
        await applyPage(h);
        for (const [label, build, firsts] of QUOTE_ALIGN_FIXTURES) {
          for (const align of TEXT_ALIGNS) {
            const name = label + ', ' + align;
            const html = '<p>Titre</p>' + build(align) + '<p>Fin</p>';
            const wanted = await textLinesInEditor(h, html, firsts);
            const got = await textLinesInPdf(h, html, firsts);
            if (!got.lost.length) summary[name] = summaryOf(wanted, got, firsts);
            judgeTextLines(name, wanted, got, null, firsts, problems, { plain: firsts });
          }
        }
      } finally { restorePage(); }
      return { pass: problems.length === 0, notes: JSON.stringify({ problems: compact(problems), summary }) };
    },
  });

  cases.push({
    id: 'pdf_gap_aligned_quote_text_in_a_table_cell_matches_the_editor',
    description: 'Une citation (dans la première, la deuxième ou la troisième colonne d\'un tableau) et une citation que coupe un trait (deuxième colonne) dont le texte est centré, à droite ou justifié : le PDF ouvre chaque ligne par le même mot que l\'éditeur et la commence et la finit au même endroit depuis « Titre » (1,5 pt près)',
    run: async h => {
      const problems = []; const summary = {};
      try {
        await applyPage(h);
        for (const [[label, build, firsts], columns] of [[QUOTE_ALIGN_FIXTURES[0], [0, 1, 2]], [QUOTE_ALIGN_FIXTURES[2], [1]]]) {
          for (const column of columns) {
            for (const align of TEXT_ALIGNS) {
              const name = label + ', colonne ' + (column + 1) + ', ' + align;
              const html = threeColumns(column, build(align)) + '<p>Fin</p>';
              const wanted = await textLinesInEditor(h, html, firsts);
              const got = await textLinesInPdf(h, html, firsts);
              if (!got.lost.length) summary[name] = summaryOf(wanted, got, firsts);
              judgeTextLines(name, wanted, got, null, firsts, problems, { plain: firsts });
            }
          }
        }
      } finally { restorePage(); }
      return { pass: problems.length === 0, notes: JSON.stringify({ problems: compact(problems), summary }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.pdfEditorGap = cases;
})();
