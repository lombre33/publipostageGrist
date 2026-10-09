// Suite "zonePageCut" - une zone à deux colonnes qui passe le bas de la page se coupe, colonne par colonne, comme dans le PDF : l'éditeur, la Lecture et l'impression navigateur ouvrent la page
// suivante avec les mêmes lignes que lui (demande d'Antoine, 2026-10-09 : « quand je suis dans un module 2 colonnes dans l'éditeur, et que je fais des sauts de ligne, j'ai l'impression que ça ne
// déclenche dans l'éditeur jamais une deuxième page »).
//
// Ce que la suite a trouvé : le PDF (pdfmake) coupe une zone à deux colonnes là où la page finit, chaque colonne à sa ligne ; l'éditeur et la Lecture la traitaient comme UNE pièce (js/header-footer-preview.js:computePageBreaks,
// js/reader-mode.js:computePageBreakOffsets : un bloc que l'export coupe « reste sur la page où sa plus grande partie tient »). Une zone de deux pages et demie n'ouvrait donc jamais de page, elle dépassait le bas de la feuille ;
// et l'impression navigateur, qui découpe la Lecture, la coupait à un autre endroit que le PDF (54 lignes sur la première page, 52 pour le PDF).
//
// La règle (js/zone-page-cut.js), la même partout : chaque colonne de la zone est coupée AVANT le premier de ses blocs qui ne tient pas dans la place qui reste, ce bloc ouvre la page suivante tout en haut du corps de page, et les
// deux colonnes y reprennent à la même hauteur. Le grain est le bloc (un paragraphe, une liste... jamais coupé en deux, comme partout dans l'aperçu). Les lignes vides au bas des colonnes de la DERNIÈRE zone du document ne comptent
// pas (la Lecture et les exports les retirent : ReaderMode.trimTrailingBlankBlocks), elles dépassent la dernière page sans en ouvrir une.
//
// Comment la suite juge. Les capacités de page sont MESURÉES (jamais écrites en dur : elles dépendent des polices de la machine) : le PDF fait référence, une zone de `c` lignes par colonne tient sur sa page, une de plus la coupe. Chaque
// moteur rend ensuite le même document (éditeur en Aperçu A4, Lecture, impression navigateur, PDF relu par pdf.js) : mêmes pages, mêmes mots sur chaque page. Les cas de l'éditeur seul lisent aussi la géométrie (aucune ligne à cheval
// sur la couture, les deux colonnes reprennent à la même hauteur, tout en haut du corps de la page suivante).
(function () {
  const cases = [];
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };

  // --- Fixtures ---
  const rows = (k, tag) => Array.from({ length: k }, (_, i) => '<p>' + tag + ' ' + i + '</p>').join('');
  const blanks = n => '<p></p>'.repeat(n);
  const zone = (left, right) => '<div class="two-columns-zone" style="--layout-left: 50%"><div class="two-columns-column">' + left + '</div><div class="two-columns-column">' + right + '</div></div>';
  const zoneOfRows = (k, tag) => zone(rows(k, tag + 'G'), rows(k, tag + 'D'));
  // La lettre d'Antoine (scénario du 29/09, bigZoneHtml) : à gauche l'expéditeur, des lignes vides, l'adresse ; à droite le début du courrier.
  const letter = n => zone('<p><strong>Presidence</strong></p>' + blanks(n) + '<p>Adresse postale</p>', '<p>Madame, Monsieur,</p>' + blanks(Math.round(n / 2)) + rows(3, 'Corps'));
  const FIN = '<p>Fin du modele.</p>';

  // --- Les pages de chaque moteur ---
  const words = text => text.split(/\s+/).filter(Boolean);
  const bag = list => list.slice().sort().join(' ');
  const sig = list => (list.length ? list.length + ' mots (' + list[0] + ')' : 'VIDE');
  const sigs = view => view.words.map(sig).join(' | ');
  function firstDifference(a, b) {
    if (a.count !== b.count) return a.count + ' page(s) [' + sigs(a) + '] contre ' + b.count + ' [' + sigs(b) + ']';
    for (let i = 0; i < a.count; i++) {
      if (bag(a.words[i]) !== bag(b.words[i])) return 'page ' + (i + 1) + ' : ' + sig(a.words[i]) + ' contre ' + sig(b.words[i]);
    }
    return '';
  }
  async function pdfView(h, html) {
    const result = await h.exportPdfContent(html, null, PageLayout.getMarginsPt());
    const gt = await h.extractPdfGroundTruth(result.base64);
    return { count: gt.pages.length, words: gt.pages.map(page => page.textItems.flatMap(item => words(item.str))) };
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
    };
    return capacityCache;
  }

  // Un document dans les quatre moteurs : l'éditeur, la Lecture et l'impression se comparent au PDF (la référence : lui seul coupe déjà une zone).
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
  // Les écarts d'un même document se ressemblent : les trois premiers par document suffisent à la lecture.
  const compact = problems => problems.slice(0, 12).concat(problems.length > 12 ? ['… et ' + (problems.length - 12) + ' autres écarts'] : []);
  async function inPage(h, fn) {
    try {
      await applyPage(h);
      return await fn(await capacitiesOf(h));
    } finally { restorePage(); }
  }

  cases.push({
    id: 'zone_cut_zone_alone_has_the_same_pages_in_every_engine',
    description: 'Une zone à deux colonnes seule, ou suivie d\'un paragraphe, de la hauteur d\'une page à deux pages et demie : l\'éditeur, la Lecture, l\'impression et le PDF ont les mêmes pages et les mêmes mots sur chacune',
    run: h => inPage(h, async c => {
      const problems = []; const summary = { capacites: c };
      for (const k of [c.zone, c.zone + 1, c.zone + 10, Math.round(c.zone * 1.5), c.zone * 2, c.zone * 2 + 5]) {
        await compareEngines(h, 'zone de ' + k + ' lignes', zoneOfRows(k, 'Alpha'), problems, summary);
        await compareEngines(h, 'zone de ' + k + ' lignes puis un paragraphe', zoneOfRows(k, 'Alpha') + FIN, problems, summary);
      }
      return { pass: problems.length === 0, notes: JSON.stringify({ problems: compact(problems), summary }) };
    }),
  });

  cases.push({
    id: 'zone_cut_zone_starting_mid_page_has_the_same_pages_in_every_engine',
    description: 'Une zone qui commence au milieu d\'une page (du texte avant elle) et passe le bas de la page : mêmes pages, mêmes mots, dans les quatre moteurs',
    run: h => inPage(h, async c => {
      const problems = []; const summary = { capacites: c };
      for (const before of [5, Math.round(c.text / 2), c.text - 3]) {
        for (const k of [10, Math.round(c.zone / 2), c.zone]) {
          await compareEngines(h, before + ' lignes puis une zone de ' + k + ' lignes', rows(before, 'Alpha') + zoneOfRows(k, 'Bravo') + FIN, problems, summary);
        }
      }
      return { pass: problems.length === 0, notes: JSON.stringify({ problems: compact(problems), summary }) };
    }),
  });

  cases.push({
    id: 'zone_cut_letter_with_blank_lines_opens_the_next_page_like_the_pdf',
    description: 'La lettre d\'Antoine (expéditeur, lignes vides, adresse à gauche ; courrier à droite) dont les lignes vides font passer le bas de la page : la page suivante s\'ouvre au même endroit partout',
    run: h => inPage(h, async c => {
      const problems = []; const summary = { capacites: c };
      for (const n of [c.zone - 4, c.zone - 1, c.zone, c.zone + 3, c.zone * 2]) {
        await compareEngines(h, 'lettre à ' + n + ' lignes vides', letter(n) + FIN, problems, summary);
      }
      return { pass: problems.length === 0, notes: JSON.stringify({ problems: compact(problems), summary }) };
    }),
  });

  cases.push({
    id: 'zone_cut_each_column_is_cut_on_its_own',
    description: 'Colonnes de hauteurs inégales : la plus longue continue sur la page suivante, l\'autre finit sur la première ; mêmes pages partout',
    run: h => inPage(h, async c => {
      const problems = []; const summary = { capacites: c };
      const long = c.zone * 2 + 5;
      const builds = [
        ['gauche longue, droite courte', zone(rows(long, 'LongG'), rows(5, 'CourtD'))],
        ['gauche courte, droite longue', zone(rows(5, 'CourtG'), rows(long, 'LongD'))],
        ['gauche d\'une page et demie, droite de trois quarts de page', zone(rows(Math.round(c.zone * 1.5), 'HautG'), rows(Math.round(c.zone * 0.75), 'BasD'))],
      ];
      for (const [label, html] of builds) {
        const { pdf } = await compareEngines(h, label, html + FIN, problems, summary);
        if (/courte/.test(label) && pdf.words.length >= 2 && pdf.words[1].some(word => /^Court/.test(word))) problems.push(label + ' : le PDF a changé (la colonne courte devrait finir sur la première page)');
      }
      return { pass: problems.length === 0, notes: JSON.stringify({ problems: compact(problems), summary }) };
    }),
  });

  cases.push({
    id: 'zone_cut_trailing_blank_lines_of_the_last_zone_open_no_page',
    description: 'Les lignes vides au bas des colonnes de la dernière zone ne comptent pas (la Lecture et les exports les retirent) : elles ne font pas ouvrir de page ; devant un paragraphe elles comptent',
    run: h => inPage(h, async c => {
      const problems = []; const summary = { capacites: c };
      const tail = zone(rows(c.zone - 3, 'HautG') + blanks(15), rows(3, 'HautD') + blanks(15));
      const last = await compareEngines(h, 'dernière zone, quinze lignes vides en bas des colonnes', tail, problems, summary);
      if (last.pdf.count !== 1) problems.push('dernière zone : le PDF fait ' + last.pdf.count + ' pages (une seule attendue, les lignes vides de fin sont retirées)');
      await compareEngines(h, 'mêmes colonnes devant un paragraphe', tail + FIN, problems, summary);
      return { pass: problems.length === 0, notes: JSON.stringify({ problems: compact(problems), summary }) };
    }),
  });

  cases.push({
    id: 'zone_cut_blank_lines_then_text_in_the_last_zone_open_the_next_page',
    description: 'Dernière zone du modèle : des lignes vides SEULES au bas d\'une colonne n\'ouvrent pas de page (la Lecture et les exports les retirent), mais dès qu\'un texte les suit elles ne sont plus « de fin » : la page suivante s\'ouvre, aux mêmes lignes dans les quatre moteurs',
    run: h => inPage(h, async c => {
      const problems = []; const summary = { capacites: c };
      const only = zone(rows(c.zone - 3, 'HautG') + blanks(5), rows(3, 'HautD'));
      const withText = zone(rows(c.zone - 3, 'HautG') + blanks(5) + '<p>Dernier</p>', rows(3, 'HautD'));
      const alone = await compareEngines(h, 'dernière zone, cinq lignes vides seules en bas de la colonne', only, problems, summary);
      if (alone.pdf.count !== 1) problems.push('lignes vides seules : le PDF fait ' + alone.pdf.count + ' pages (une seule attendue)');
      const text = await compareEngines(h, 'dernière zone, cinq lignes vides puis un texte', withText, problems, summary);
      if (text.pdf.count !== 2) problems.push('lignes vides puis un texte : le PDF fait ' + text.pdf.count + ' pages (deux attendues)');
      if (text.pdf.count === 2 && !text.pdf.words[1].includes('Dernier')) problems.push('le texte tapé n\'est pas sur la seconde page du PDF');
      return { pass: problems.length === 0, notes: JSON.stringify({ problems: compact(problems), summary }) };
    }),
  });

  // --- La géométrie de l'éditeur ---
  const toWords = el => words(el.textContent);
  cases.push({
    id: 'zone_cut_editor_seam_falls_between_two_rows_and_both_columns_resume_together',
    description: 'Éditeur : la couture tombe entre deux lignes de chaque colonne (aucune ligne à cheval), et les deux colonnes reprennent à la même hauteur, tout en haut du corps de la page suivante',
    run: h => inPage(h, async c => {
      const k = Math.round(c.zone * 1.5);
      await editorView(h, zone(rows(k, 'HautG'), rows(k - 7, 'HautD')) + FIN);
      const seams = Array.from(document.querySelectorAll('#editor-container .v2-pagination-overlay .v2-page-break-line, #editor-container .v2-pagination-overlay .v2-page-seam'));
      const problems = [];
      if (seams.length !== 1) problems.push(seams.length + ' couture(s) au lieu d\'une');
      const seam = seams[0];
      const cols = Array.from(document.querySelectorAll('#editor-container .tiptap .two-columns-zone > .two-columns-column'));
      const info = {};
      if (seam && cols.length === 2) {
        const seamRect = seam.getBoundingClientRect();
        const firstOnSecond = [];
        cols.forEach((col, i) => {
          const before = []; const after = [];
          Array.from(col.children).forEach(p => {
            const r = p.getBoundingClientRect();
            if (r.bottom <= seamRect.top + 1) before.push(p);
            else if (r.top >= seamRect.bottom - 1) after.push(p);
            else problems.push('colonne ' + (i + 1) + ' : « ' + p.textContent + ' » est à cheval sur la couture');
          });
          info['colonne ' + (i + 1)] = before.length + ' lignes avant, ' + after.length + ' après';
          if (after.length) firstOnSecond.push(after[0].getBoundingClientRect().top);
          if (!after.length) problems.push('colonne ' + (i + 1) + ' : rien après la couture (la zone n\'est pas coupée)');
          if (before.length !== c.zone) problems.push('colonne ' + (i + 1) + ' : ' + before.length + ' lignes sur la première page (' + c.zone + ' mesurées au PDF)');
        });
        if (firstOnSecond.length === 2 && Math.abs(firstOnSecond[0] - firstOnSecond[1]) > 1) problems.push('les colonnes ne reprennent pas à la même hauteur : ' + firstOnSecond.map(v => v.toFixed(1)).join(' / '));
        if (firstOnSecond.length && Math.abs(firstOnSecond[0] - seamRect.bottom) > 1.5) problems.push('la reprise (' + firstOnSecond[0].toFixed(1) + ') n\'est pas au bas de la couture (' + seamRect.bottom.toFixed(1) + ')');
        info.fin = toWords(h.tiptap().lastElementChild).join(' ');
      }
      return { pass: problems.length === 0, notes: JSON.stringify({ problems, info }) };
    }),
  });

  cases.push({
    id: 'zone_cut_enter_in_a_column_opens_the_next_page',
    description: 'Le geste d\'Antoine : Entrée dans une colonne de la zone jusqu\'à passer le bas de la page ouvre la page suivante dans l\'éditeur (et la Lecture et le PDF de ce même document sont d\'accord)',
    run: h => inPage(h, async c => {
      const problems = []; const summary = { capacites: c };
      await editorView(h, zone(rows(c.zone - 2, 'HautG'), rows(3, 'HautD')) + FIN);
      const counts = [];
      const before = domView('#editor-container', '.tiptap').count;
      const column = h.tiptap().querySelector('.two-columns-column');
      await h.focusInElement(column.lastElementChild, false);
      for (let i = 0; i < 6; i++) { document.execCommand('insertParagraph'); await h.sleep(30); }
      await h.typeText('Dernier');
      await h.sleep(400);
      Editor.refreshPaginationPreview();
      await h.sleep(100);
      const after = domView('#editor-container', '.tiptap');
      counts.push(before, after.count);
      if (before !== 1) problems.push('avant les Entrées : ' + before + ' page(s) (1 attendue)');
      if (after.count !== 2) problems.push('après six Entrées dans la colonne : ' + after.count + ' page(s) [' + sigs(after) + '] (2 attendues)');
      const html = Editor.getHTML();
      const pdf = await pdfView(h, html);
      const reader = await readerView(h, html);
      const diff = firstDifference(reader, pdf);
      if (diff) problems.push('Lecture et PDF du même document : ' + diff);
      await editorView(h, html);
      const editorDiff = firstDifference(domView('#editor-container', '.tiptap'), pdf);
      if (editorDiff) problems.push('éditeur et PDF du même document : ' + editorDiff);
      summary.pages = counts;
      return { pass: problems.length === 0, notes: JSON.stringify({ problems, summary }) };
    }),
  });

  cases.push({
    id: 'zone_cut_line_breaks_in_a_column_paragraph_open_the_next_page',
    description: 'Maj+Entrée (retour à la ligne, sans nouveau paragraphe) dans le dernier paragraphe d\'une colonne jusqu\'à passer le bas de la page : ce paragraphe, d\'un bloc, passe sur la page suivante comme tout paragraphe de l\'éditeur ; l\'éditeur, la Lecture et l\'impression ont les mêmes pages, le PDF le même nombre',
    run: h => inPage(h, async c => {
      const problems = []; const summary = { capacites: c };
      await editorView(h, zone(rows(c.zone - 6, 'HautG') + '<p>Fin de colonne</p>', rows(3, 'HautD')) + FIN);
      const before = domView('#editor-container', '.tiptap').count;
      const column = h.tiptap().querySelector('.two-columns-column');
      await h.focusInElement(column.lastElementChild, false);
      for (let i = 0; i < 8; i++) { document.execCommand('insertLineBreak'); await h.sleep(30); }
      await h.typeText('Suite');
      await h.sleep(400);
      Editor.refreshPaginationPreview();
      await h.sleep(100);
      const editor = domView('#editor-container', '.tiptap');
      if (before !== 1) problems.push('avant les retours à la ligne : ' + before + ' page(s) (1 attendue)');
      if (editor.count !== 2) problems.push('après huit retours à la ligne : ' + editor.count + ' page(s) [' + sigs(editor) + '] (2 attendues)');
      const html = Editor.getHTML();
      const reader = await readerView(h, html);
      const print = await printView(h, html);
      const pdf = await pdfView(h, html);
      const diffReader = firstDifference(reader, editor);
      if (diffReader) problems.push('Lecture et éditeur : ' + diffReader);
      const diffPrint = firstDifference(print, reader);
      if (diffPrint) problems.push('impression et Lecture : ' + diffPrint);
      if (pdf.count !== editor.count) problems.push('le PDF a ' + pdf.count + ' page(s), l\'éditeur ' + editor.count);
      summary.pages = { editeur: sigs(editor), lecture: sigs(reader), impression: sigs(print), pdf: sigs(pdf) };
      return { pass: problems.length === 0, notes: JSON.stringify({ problems, summary }) };
    }),
  });

  // --- La règle seule (ZonePageCut.plan, sans DOM) : des colonnes de blocs de hauteur connue, une page de 100 ---
  // `column(heights, endPad)` : les blocs l'un sous l'autre depuis le haut de la zone (sans écart entre eux).
  const column = (heights, endPad) => {
    const tops = []; const bottoms = [];
    let y = 0;
    heights.forEach(height => { tops.push(y); y += height; bottoms.push(y); });
    return { blocks: heights.map((_, i) => 'b' + i), tops, bottoms, endPad: endPad || 0 };
  };
  const measured = (...columns) => ({ columns });
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  cases.push({
    id: 'zone_cut_plan_cuts_each_column_before_its_first_block_that_does_not_fit',
    description: 'ZonePageCut.plan : chaque colonne est coupée avant son premier bloc qui dépasse la page ; la colonne courte finit sur la première page ; une zone qui tient ne coupe rien',
    run: async () => {
      const problems = [];
      const check = (label, got, want) => { if (!same(got, want)) problems.push(label + ' : ' + JSON.stringify(got) + ' au lieu de ' + JSON.stringify(want)); };
      const ten = Array(10).fill(20);
      // Dix blocs de 20 dans une page de 100 : le sixième (bas à 120) ouvre la page suivante, qui porte les cinq derniers.
      let plan = ZonePageCut.plan(0, 0, measured(column(ten), column([20, 20, 20])), 100, 0);
      check('deux colonnes, une longue', plan.cuts, [{ ranks: [5, null], lasts: [4, 2] }]);
      check('deux colonnes, rien avant la zone', plan.blockBreakBefore, false);
      // Pile à la hauteur de la page (5 x 20 = 100) : ça tient, pas de coupure ; l'arrondi d'un demi-pixel ne coupe pas non plus.
      plan = ZonePageCut.plan(0, 0, measured(column(Array(5).fill(20)), column([20])), 100, 0);
      check('pile à la page', plan.cuts, []);
      plan = ZonePageCut.plan(0, 0, measured(column([20, 20, 20, 20, 20.4]), column([20])), 100, 0);
      check('0,4 px de trop (arrondi)', plan.cuts, []);
      plan = ZonePageCut.plan(0, 0, measured(column([20, 20, 20, 20, 21]), column([20])), 100, 0);
      check('1 px de trop', plan.cuts, [{ ranks: [4, null], lasts: [3, 0] }]);
      // Cinq pages à gauche (25 blocs), trois à droite (12 blocs) : la colonne droite finit à la page 3 (son dernier bloc, le douzième, est le « dernier gardé » de cette page).
      plan = ZonePageCut.plan(0, 0, measured(column(Array(25).fill(20)), column(Array(12).fill(20))), 100, 0);
      check('cinq pages', plan.cuts, [
        { ranks: [5, 5], lasts: [4, 4] }, { ranks: [10, 10], lasts: [9, 9] },
        { ranks: [15, null], lasts: [14, 11] }, { ranks: [20, null], lasts: [19, null] },
      ]);
      // Un bloc plus haut que la page, seul en haut de page, reste là (il déborde : il n'y a rien de mieux à faire) ; le suivant ouvre la page d'après.
      plan = ZonePageCut.plan(0, 0, measured(column([250, 20]), column([20])), 100, 0);
      check('bloc plus haut que la page', plan.cuts, [{ ranks: [1, null], lasts: [0, 0] }]);
      return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
    },
  });

  cases.push({
    id: 'zone_cut_plan_starts_from_what_the_page_already_carries',
    description: 'ZonePageCut.plan : une zone qui commence au milieu d\'une page ne dispose que de la place qui reste ; si le premier bloc de chaque colonne n\'y tient pas, la zone entière passe à la page suivante',
    run: async () => {
      const problems = [];
      const check = (label, got, want) => { if (!same(got, want)) problems.push(label + ' : ' + JSON.stringify(got) + ' au lieu de ' + JSON.stringify(want)); };
      const ten = Array(10).fill(20);
      // 40 déjà posés + 6 d'écart : il reste 54, soit deux blocs de 20 ; le troisième (bas à 60) ouvre la page suivante.
      let plan = ZonePageCut.plan(40, 6, measured(column(ten), column(ten)), 100, 0);
      check('au milieu d\'une page', plan.cuts, [{ ranks: [2, 2], lasts: [1, 1] }, { ranks: [7, 7], lasts: [6, 6] }]);
      check('au milieu d\'une page, le premier bloc tient', plan.blockBreakBefore, false);
      // 90 déjà posés : le premier bloc de chaque colonne (bas à 20) ne tient pas dans les 10 qui restent : la zone commence la page suivante, sans coupure dedans.
      plan = ZonePageCut.plan(90, 0, measured(column(Array(5).fill(20)), column(Array(5).fill(20))), 100, 0);
      check('plus de place pour un bloc', plan.blockBreakBefore, true);
      check('plus de place pour un bloc, la zone tient sur la page suivante', plan.cuts, []);
      // Une seule colonne dont le premier bloc ne tient pas : l'autre reste sur la page (coupure dans la zone, pas avant).
      plan = ZonePageCut.plan(90, 0, measured(column([20, 20]), column([5, 20])), 100, 0);
      check('une colonne a de la place', plan.blockBreakBefore, false);
      check('une colonne a de la place, la haute passe', plan.cuts, [{ ranks: [0, 1], lasts: [null, 0] }]);
      // La même zone en haut de page n'a aucune raison de couper avant son premier bloc.
      plan = ZonePageCut.plan(0, 0, measured(column([120, 20]), column([20])), 100, 0);
      check('en haut de page, bloc plus haut que la page', plan.cuts, [{ ranks: [1, null], lasts: [0, 0] }]);
      return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
    },
  });

  cases.push({
    id: 'zone_cut_plan_reports_what_the_last_page_of_the_zone_carries',
    description: 'ZonePageCut.plan : ce que la dernière page de la zone porte (bas de la colonne la plus longue, son bas de colonne et l\'écart avant le bloc suivant) sert au bloc suivant',
    run: async () => {
      const problems = [];
      const check = (label, got, want) => { if (!same(got, want)) problems.push(label + ' : ' + JSON.stringify(got) + ' au lieu de ' + JSON.stringify(want)); };
      // Sans coupure : la colonne la plus longue (3 x 20 + 5 de bas de colonne) et 12 d'écart avant le bloc suivant, depuis ce que la page porte déjà.
      let plan = ZonePageCut.plan(30, 6, measured(column([20, 20, 20], 5), column([20], 5)), 100, 12);
      check('sans coupure', plan.consumedAfter, 30 + 6 + 60 + 5 + 12);
      // Une coupure : la dernière page ne porte que ce que la colonne la plus longue y met (cinq blocs), le bas de colonne et l'écart.
      plan = ZonePageCut.plan(0, 0, measured(column(Array(10).fill(20), 5), column([20], 5)), 100, 12);
      check('une coupure', plan.consumedAfter, 100 + 5 + 12);
      // La colonne qui a le plus de pages décide, pas la plus haute en tout : celle qui finit sur la première page ne compte pas pour la dernière.
      plan = ZonePageCut.plan(0, 0, measured(column(Array(6).fill(20), 5), column([20, 20], 50)), 100, 0);
      check('la colonne qui continue décide', plan.consumedAfter, 20 + 5);
      return { pass: problems.length === 0, notes: JSON.stringify({ problems }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.zonePageCut = cases;
})();
