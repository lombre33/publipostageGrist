// Suite "pdfEditorGap" - deux écarts de pagination entre le PDF et l'éditeur, relevés par la batterie `macroPages` (09/10) et tranchés par Antoine le 2026-10-11 (carte « Corriger quels écarts entre le PDF et
// l'éditeur ? », réponse « Les deux »).
//
// 1. Le paragraphe à cheval sur le bas d'une page. L'éditeur, la Lecture et l'impression le passent en entier sur la page suivante (un bloc de texte qui ne tient pas dans la place qui reste ouvre la page : il n'est
//    jamais coupé entre deux lignes) ; le PDF (pdfmake) le coupait là où la page finit. Il garde maintenant d'une pièce un paragraphe de plusieurs lignes qui tient dans une page (moins de 90 %, le plafond des lignes
//    de tableau), au premier niveau comme dans une colonne de zone : parfois un peu de blanc en bas de page, comme dans l'éditeur. Au-delà de 90 % d'une page, ou pour un paragraphe qui porte une image en calque comme
//    ancre, une légende, une suite « Garder avec le suivant » : comme avant, rien n'est perdu.
// 2. Le trait (`<hr>`). La batterie voyait « un trait juste après une zone de deux pages » donner 3 pages au PDF au lieu de 2. Cette page de plus n'existe pas dans le PDF que l'on télécharge : la sonde de test
//    (helpers.js:exportPdfContent) met le même document en page DEUX fois, et pdfmake allonge alors le trait à chaque mise en page. Le PDF réel est la première, `result.blob` : toute la suite lit celle-là, jamais
//    `result.base64`. Le cas ci-dessous garde cette vérité (le trait n'ajoute aucune page).
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

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.pdfEditorGap = cases;
})();
