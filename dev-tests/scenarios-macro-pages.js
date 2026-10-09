// Macro-modèle : l'éditeur, la Lecture et le PDF montrent les MÊMES pages (demande d'Antoine, 2026-10-09 : « mode macro modèle, en mode lecture et éditeur je n'ai pas de page vide, à l'export pdf j'ai
// une page vide qui vient se glisser » ; puis « une batterie de test dédiée pour vérifier que ça ne réarrive plus. Je veux que les vues éditeur, lecture et export pdf soient identifiées à 100% »,
// avec ce contexte : « pas d'utilisation du saut de page, ici chaque modèle du macro modèle ne fait qu'une page. La page exportée seule dans son modèle ne fait pas apparaître cette page, c'est
// uniquement en mode macro modèle »).
//
// Ce que la batterie compare. Un macro-modèle met ses modèles bout à bout (js/macro-templates.js:buildConcatenatedHtml : chacun derrière un saut de page `data-macro-slot`). L'éditeur ne montre
// jamais ce document d'un bloc (il ouvre UN modèle à la fois, `Editor.setHTML('')` côté macro-modèle : son getHTML() est vide par construction) ; la Lecture et le PDF, eux, paginent les modèles
// bout à bout. L'identité se juge donc ainsi, page par page, sur le texte réellement posé :
//   1. chaque modèle SEUL : l'éditeur (Aperçu A4), la Lecture et le PDF (relu par pdf.js) ont le même nombre de pages, les mêmes mots sur chaque page, et le même « n/total » dans le pied ;
//   2. le macro-modèle : la Lecture et le PDF ont exactement les pages de ses modèles mis bout à bout (ni page blanche, ni page de moins, ni mot qui change de page), le même « n/total » ;
//   3. le Word : un saut de page par modèle suivant (même devant un tableau ou une zone à deux colonnes), et jamais un paragraphe vide devant lui.
// La page est remplie « ras la marge » PAR LES TROIS MOTEURS : leur capacité est MESURÉE (jamais écrite en dur, elle dépend des polices de la machine), et la batterie vérifie d'abord que les trois
// moteurs la trouvent égale. Chaque modèle de la matrice est une page pleine à sa façon (texte, fin vide, lettre en deux colonnes, tableau, image en calque, saut de page de fin, deux pages) ;
// chaque configuration de page (A4, en-tête et pied avec « n/total », paysage, A5, petit format libre) rejoue toute la matrice.
//
// Deux scénarios à part, voulus par Antoine (carte du 09/10, « Les deux », « Aligner les sauts de page du Word et du PDF sur l'éditeur ») : deux sauts de page de suite laissent une page blanche dans
// l'éditeur, la Lecture, le PDF, l'impression navigateur et le Word (seuls ou à l'entrée d'un modèle de macro-modèle), et un saut posé à la main devant un paragraphe, un titre, une liste, un bloc de
// code, un tableau, des colonnes, un encadré, un trait ou un sommaire ouvre la page suivante dans les cinq (le Word perdait le saut devant un tableau, des colonnes et un trait).
//
// Limites connues, non couvertes ici (voir dev-tests/README.md) : une zone à deux colonnes PLUS HAUTE qu'une page est coupée comme le PDF par l'éditeur et la Lecture depuis le 09/10 (js/zone-page-cut.js, groupe
// zonePageCut), la matrice, elle, reste sous la hauteur d'une page ; le saut de page posé à la main EN FIN de modèle garde son repère dans l'éditeur (choix d'Antoine, carte du 01/10) alors que la Lecture et les exports l'ignorent.
window.EditorTestSuites = window.EditorTestSuites || {};
window.EditorTestSuites.macroPages = (function () {
  const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  // En-tête, pied et numéro de page (« n/total ») : ce qui se répète sur chaque page, jamais compté comme du corps.
  const WITH_HF = { enabled: true, differentFirstPage: false, header: { default: '<p>EN-TETE</p>', first: '' }, footer: { default: '<p>PIED <span class="page-number-badge" data-format="n-slash-total">#</span></p>', first: '' } };
  const HF_WORDS = /^(EN-TETE|EN-|TETE|PIED|\d+\/\d+)$/;
  const MANUAL_BREAK = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';

  // --- Les modèles ---
  // `tag` : un mot propre à chaque modèle, pour qu'une page du mauvais modèle (ou un mot qui change de page) se voie.
  function lines(n, tag) { return Array.from({ length: n }, (_, i) => '<p>' + tag + ' ' + i + ' du modèle de test.</p>').join(''); }
  function zone(left, right) {
    return '<div class="two-columns-zone" style="--layout-left: 50%"><div class="two-columns-column">' + left + '</div><div class="two-columns-column">' + right + '</div></div>';
  }
  // La forme d'une lettre : une colonne de gauche et un texte à droite, `k` lignes dans chacune.
  function zoneOfLines(k, tag) {
    const column = side => Array.from({ length: k }, (_, i) => '<p>' + tag + side + ' ' + i + '</p>').join('');
    return zone(column('G'), column('D'));
  }
  function tableOfRows(r, tag) {
    return '<table><tbody>' + Array.from({ length: r }, (_, i) => '<tr><td><p>' + tag + 'T ' + i + '</p></td><td><p>deux</p></td></tr>').join('') + '</tbody></table>';
  }
  // Une image en calque posée sur la page 1 (sa grille : 150 pt à droite et 20 pt sous le coin du contenu, ce que l'Aperçu A4 capture), seule sur sa ligne.
  function anchorLine() {
    const m = PageLayout.getMarginsMm();
    return '<p><img class="editor-image" src="' + TINY_PNG + '" alt="" style="width: 40px; height: 40px; position: absolute; left: ' + (m.left * 96 / 25.4 + 150 * 96 / 72) + 'px; top: '
      + (m.top * 96 / 25.4 + 20 * 96 / 72) + 'px; z-index: 5;" data-layer="front" data-wrap="inline" data-page-index="0" data-page-left-pt="150" data-page-top-pt="20"></p>';
  }
  // Les modèles d'une page pleine : [identifiant, ce que c'est, pages attendues SEUL, HTML d'après les capacités mesurées `c`, modèle sans repère de saut de page dans l'éditeur].
  const SHAPES = [
    ['text', 'texte ras la marge', 1, (c, t) => lines(c.text, t)],
    ['blank1', 'texte ras la marge + une ligne vide', 1, (c, t) => lines(c.text, t) + '<p></p>'],
    ['blank3', 'texte ras la marge + trois lignes vides', 1, (c, t) => lines(c.text, t) + '<p></p><p></p><p></p>'],
    ['nbsp', 'texte ras la marge + un espace insécable', 1, (c, t) => lines(c.text, t) + '<p>&nbsp;</p>'],
    ['br', 'texte ras la marge + un saut de ligne seul', 1, (c, t) => lines(c.text, t) + '<p><br></p>'],
    ['zone', 'lettre en deux colonnes ras la marge + le paragraphe vide que l\'éditeur laisse derrière', 1, (c, t) => zoneOfLines(c.zone, t) + '<p></p>'],
    ['table', 'tableau ras la marge + le paragraphe vide que l\'éditeur laisse derrière', 1, (c, t) => tableOfRows(c.table, t) + '<p></p>'],
    ['image', 'texte ras la marge + une ligne qui ne porte qu\'une image en calque de la page 1', 1, (c, t) => lines(c.text, t) + anchorLine()],
    ['twoPages', 'deux pages pleines + une ligne vide', 2, (c, t) => lines(2 * c.text, t) + '<p></p>'],
    ['manualMiddle', 'deux pages par un saut de page posé à la main au milieu, une ligne vide derrière', 2, (c, t) => lines(3, t) + MANUAL_BREAK + lines(3, t) + '<p></p>'],
    // Le repère du saut de page de fin reste dans l'éditeur : la comparaison de l'éditeur est donc sautée pour ce modèle (la Lecture et le PDF l'ignorent).
    ['manualEnd', 'texte ras la marge + un saut de page posé à la main à la fin', 1, (c, t) => lines(c.text, t) + MANUAL_BREAK, true],
  ];

  // --- Les pages de chaque moteur ---
  const words = text => text.split(/\s+/).filter(Boolean);
  const bag = list => list.slice().sort().join(' ');
  const isBody = word => !HF_WORDS.test(word);

  // Le macro-modèle tel que l'application l'assemble : le HTML de chaque modèle, un saut de page `data-macro-slot` devant chacun sauf le premier.
  async function macroDocument(fragments, tableId, record) {
    const templates = fragments.map((contenu, index) => ({ id: index + 1, contenu }));
    return MacroTemplates.buildConcatenatedHtml({ slots: templates.map(template => ({ type: 'fixed', modeleId: template.id })) }, tableId || 'Clients', record || { id: 1 }, templates);
  }
  // Les mots (hors en-tête et pied), les « n/total » du pied et, pour le PDF, les images peintes de chaque page : un PDF relu par pdf.js.
  async function pdfView(h, html, hf, source) {
    const result = await h.exportPdfContent(html, hf || null, PageLayout.getMarginsPt(), source);
    const gt = await h.extractPdfGroundTruth(result.base64);
    return {
      count: gt.pages.length,
      words: gt.pages.map(page => page.textItems.flatMap(item => words(item.str)).filter(isBody)),
      feet: gt.pages.map(page => page.textItems.map(item => item.str.trim()).filter(str => /^\d+\/\d+$/.test(str)).join('')),
      images: gt.pages.map(page => page.images.length),
    };
  }
  // Une page de l'éditeur (Aperçu A4) ou de la Lecture : les mots de chaque bloc de texte, rangés par la couture qui les précède (la bande « Page N », ou la couture avec pied et en-tête).
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
      pages[page].push(...words(node.textContent).filter(isBody));
    }
    // Le pied de chaque page : « n/total » dans la couture qui la clôt, ou dans la zone du bas pour la dernière.
    const feet = Array.from(document.querySelectorAll(scope + ' .v2-page-seam-foot, ' + scope + ' .v2-page-edge-bottom'))
      .map(foot => (foot.textContent.match(/(\d+)\/(\d+)/) || [])[0]).filter(Boolean).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    return { count: pages.length, words: pages, feet };
  }
  async function readerView(h, html, hf, source) {
    if (source) {
      document.getElementById('reader-container').style.display = 'block';
      document.getElementById('editor-container').style.display = 'block';
      await ReaderMode.render(html, source.tableId, source.record, hf || NO_HF);
    } else {
      await h.renderReaderMode(html, hf || null);
    }
    await h.sleep(250);
    return domView('#reader-container', '.reader-content');
  }
  async function editorView(h, html, hf) {
    Editor.setHeaderFooterData(hf || NO_HF);
    Editor.setHTML(html);
    await h.sleep(250);
    Editor.refreshPaginationPreview();
    await h.sleep(60);
    return domView('#editor-container', '.tiptap');
  }

  // Les feuilles que l'impression navigateur enverrait au navigateur (js/print-export.js : la Lecture découpée en pages) : les mots posés sur chacune.
  async function printView(h, html, hf) {
    const job = await PrintExport.prepare(html, null, { id: 1 }, JSON.parse(JSON.stringify(hf || NO_HF)), 'essai');
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
          if (rect && rect.top >= box.top - 1 && rect.bottom <= box.bottom + 1 && rect.left >= box.left - 1 && rect.right <= box.right + 1) found.push(...words(node.textContent).filter(isBody));
        }
        return found;
      });
      return { count: pages.length, words: pages };
    } finally { job.dispose(); }
  }

  // --- Comparer ---
  const sig = list => (list.length ? list.length + ' mots (' + list[0] + ')' : 'VIDE');
  const sigs = view => view.words.map(sig).join(' | ');
  // La première différence entre deux vues (nombre de pages, puis mots de chaque page), ou ''.
  function firstDifference(a, b) {
    if (a.count !== b.count) return a.count + ' page(s) [' + sigs(a) + '] contre ' + b.count + ' [' + sigs(b) + ']';
    for (let i = 0; i < a.count; i++) {
      if (bag(a.words[i]) !== bag(b.words[i])) return 'page ' + (i + 1) + ' : ' + sig(a.words[i]) + ' contre ' + sig(b.words[i]);
    }
    return '';
  }
  // Le pied attendu d'une vue de `count` pages : « 1/count » ... « count/count ».
  const expectedFeet = count => Array.from({ length: count }, (_, i) => (i + 1) + '/' + count);
  function footDifference(view, hf) {
    if (!hf || !hf.enabled) return '';
    const got = Array.isArray(view.feet) ? view.feet : [];
    const expected = expectedFeet(view.count);
    return got.join(' ') === expected.join(' ') ? '' : 'pieds [' + got.join(' ') + '] au lieu de [' + expected.join(' ') + ']';
  }
  // Mêmes pages que `expected`, un autre mot propre à chaque modèle : « Alpha » devient « Bravo » sans refaire le rendu.
  const retag = (view, from, to) => ({ ...view, words: view.words.map(page => page.map(word => (word.startsWith(from) ? to + word.slice(from.length) : word))) });
  const concat = views => ({ count: views.reduce((sum, v) => sum + v.count, 0), words: views.flatMap(v => v.words), images: views.flatMap(v => v.images || []) });
  const blankPages = view => view.words.map((page, i) => (page.length || (view.images && view.images[i]) ? -1 : i + 1)).filter(i => i > 0);

  // --- Les capacités de page, mesurées ---
  // Plus grand nombre n tel que build(n) tient sur UNE page du PDF : recherche par dichotomie, chaque essai est un vrai export.
  async function capacity(count, build, low, high) {
    let fits = low; let over = high;
    while (over - fits > 1) {
      const mid = (fits + over) >> 1;
      if ((await count(build(mid))) === 1) fits = mid; else over = mid;
    }
    return fits;
  }
  const capacityCache = new Map();
  async function capacitiesOf(h, config) {
    if (capacityCache.has(config.id)) return capacityCache.get(config.id);
    const count = html => pdfView(h, html, config.hf).then(view => view.count);
    const measured = {
      text: await capacity(count, n => lines(n, 'Alpha'), 1, 130),
      zone: await capacity(count, n => zoneOfLines(n, 'Alpha'), 1, 130),
      table: await capacity(count, n => tableOfRows(n, 'Alpha'), 1, 90),
    };
    capacityCache.set(config.id, measured);
    return measured;
  }

  // Les écarts d'un même modèle se ressemblent (une page blanche de trop se voit dans plusieurs comparaisons) : les trois premiers suffisent à la lecture.
  function compact(problems) {
    const seen = {};
    const kept = [];
    for (const problem of problems) {
      const where = problem.split(' : ')[0];
      seen[where] = (seen[where] || 0) + 1;
      if (seen[where] <= 3) kept.push(problem);
      else if (seen[where] === 4) kept.push(where + ' : … et d\'autres écarts');
    }
    return kept;
  }

  // --- Les configurations de page ---
  async function applyPage(h, orientation, format, size) {
    await h.resetEditor();
    PageLayout.setMarginsMm(null);
    if (size) PageLayout.setPageSize(size[0], size[1]);
    OrientationToggle.sync();
    h.setA4Preview(true);
    document.dispatchEvent(new CustomEvent('pp:pageLayoutChanged'));
    if (orientation === 'landscape' || (format && format !== 'A4')) {
      PageLayout.setOrientation(orientation || 'portrait');
      PageLayout.setFormat(format || 'A4');
      OrientationToggle.sync();
      document.dispatchEvent(new CustomEvent('pp:marginsChanged'));
    }
    await h.sleep(300);
  }
  function restorePage() {
    PageLayout.setMarginsMm(null);
    OrientationToggle.sync();
    document.dispatchEvent(new CustomEvent('pp:pageLayoutChanged'));
  }
  const CONFIGS = [
    { id: 'a4', label: 'A4 portrait, sans en-tête ni pied', hf: null, apply: h => applyPage(h, 'portrait', 'A4') },
    { id: 'a4hf', label: 'A4 portrait, en-tête et pied avec « n/total »', hf: WITH_HF, apply: h => applyPage(h, 'portrait', 'A4') },
    { id: 'a4landscape', label: 'A4 paysage, en-tête et pied avec « n/total »', hf: WITH_HF, apply: h => applyPage(h, 'landscape', 'A4') },
    { id: 'a5', label: 'A5 portrait, sans en-tête ni pied', hf: null, apply: h => applyPage(h, 'portrait', 'A5') },
    { id: 'custom', label: 'format libre 100 x 70 mm, sans en-tête ni pied', hf: null, apply: h => applyPage(h, 'portrait', 'A4', [100, 70]) },
  ];

  // Un modèle SEUL dans les trois moteurs (la vue de l'éditeur est sautée quand `skipEditor`) : les mêmes pages, partout.
  async function aloneIn(h, html, hf, skipEditor) {
    return { editor: skipEditor ? null : await editorView(h, html, hf), reader: await readerView(h, html, hf), pdf: await pdfView(h, html, hf) };
  }

  // Toute la matrice sur une configuration de page : capacités égales, puis chaque modèle seul et dans un macro-modèle [modèle, modèle, modèle court].
  async function runConfig(h, config) {
    const problems = [];
    const summary = {};
    try {
      await config.apply(h);
      const c = await capacitiesOf(h, config);
      summary.capacites = c;
      // Les trois moteurs trouvent la même capacité de page (texte et tableau : la zone n'a pas de capacité commune, voir l'en-tête).
      for (const [name, build] of [['texte', n => lines(n, 'Alpha')], ['tableau', n => tableOfRows(n, 'Alpha')]]) {
        const key = name === 'texte' ? c.text : c.table;
        for (const [engine, view] of [['éditeur', html => editorView(h, html, config.hf)], ['Lecture', html => readerView(h, html, config.hf)]]) {
          const fits = (await view(build(key))).count;
          const over = (await view(build(key + 1))).count;
          if (fits !== 1 || over !== 2) problems.push(config.id + ' : capacité du ' + name + ' mesurée au PDF (' + key + ') : ' + engine + ' ' + fits + ' page(s) puis ' + over + ' avec une ligne de plus (1 puis 2 attendues)');
        }
      }
      const shortHtml = lines(3, 'Charlie');
      const short = await aloneIn(h, shortHtml, config.hf);
      for (const [engine, view] of [['éditeur', short.editor], ['Lecture', short.reader]]) {
        const diff = firstDifference(view, short.pdf);
        if (diff) problems.push(config.id + ' : modèle court seul, ' + engine + ' et PDF : ' + diff);
      }
      for (const [id, label, pages, build, skipEditor] of SHAPES) {
        const where = config.id + ', ' + id + ' (' + label + ')';
        const alpha = build(c, 'Alpha');
        const alone = await aloneIn(h, alpha, config.hf, skipEditor);
        const row = {};
        // 1. Seul : l'éditeur, la Lecture et le PDF ont les mêmes pages ; la matrice garde le nombre de pages voulu (sinon c'est elle, pas le moteur, qui a dérivé).
        if (alone.pdf.count !== pages) problems.push(where + ' : seul, le PDF fait ' + alone.pdf.count + ' page(s) (' + pages + ' attendue(s) : le modèle n\'est plus ce qu\'il doit être)');
        for (const [engine, view] of [['éditeur', alone.editor], ['Lecture', alone.reader]]) {
          if (!view) continue;
          const diff = firstDifference(view, alone.pdf);
          if (diff) problems.push(where + ' : seul, ' + engine + ' et PDF diffèrent : ' + diff);
          const foot = footDifference(view, config.hf);
          if (foot) problems.push(where + ' : seul, ' + engine + ' : ' + foot);
        }
        const footPdf = footDifference(alone.pdf, config.hf);
        if (footPdf) problems.push(where + ' : seul, PDF : ' + footPdf);
        row.seul = (alone.editor ? alone.editor.count : '-') + '/' + alone.reader.count + '/' + alone.pdf.count;
        // 2. Dans un macro-modèle, après un modèle du même genre : ses pages sont celles de ses modèles bout à bout.
        const bravo = build(c, 'Bravo');
        const macro = await macroDocument([alpha, bravo, shortHtml]);
        const expected = concat([alone.pdf, retag(alone.pdf, 'Alpha', 'Bravo'), short.pdf]);
        const macroReader = await readerView(h, macro, config.hf);
        const macroPdf = await pdfView(h, macro, config.hf);
        for (const [engine, view] of [['Lecture', macroReader], ['PDF', macroPdf]]) {
          const diff = firstDifference(view, expected);
          if (diff) problems.push(where + ' : macro-modèle, ' + engine + ' ≠ ses modèles bout à bout : ' + diff);
          const blank = blankPages(view);
          if (blank.length) problems.push(where + ' : macro-modèle, ' + engine + ' : page(s) blanche(s) ' + blank.join(', '));
          const foot = footDifference(view, config.hf);
          if (foot) problems.push(where + ' : macro-modèle, ' + engine + ' : ' + foot);
        }
        if (JSON.stringify(macroPdf.images) !== JSON.stringify(expected.images)) problems.push(where + ' : macro-modèle, PDF : images peintes par page ' + JSON.stringify(macroPdf.images) + ' au lieu de ' + JSON.stringify(expected.images));
        row.macro = 'Lecture ' + macroReader.count + ', PDF ' + macroPdf.count + ' (' + expected.count + ' attendues)';
        summary[id] = row;
      }
    } finally {
      restorePage();
    }
    return { pass: problems.length === 0, notes: JSON.stringify({ summary, problems: compact(problems) }) };
  }

  const matrixCases = CONFIGS.map(config => ({
    id: 'macro_pages_matrix_' + config.id,
    description: 'Macro-modèle, ' + config.label + ' : pour chaque modèle d\'une page pleine (texte, fins vides, lettre en deux colonnes, tableau, image en calque, deux pages, saut de page de fin), l\'éditeur, la Lecture et le PDF ont les mêmes pages, seuls et dans un macro-modèle (mots de chaque page, pied « n/total », aucune page blanche)',
    run: h => runConfig(h, config),
  }));

  // --- Les autres scénarios ---
  // Le Word n'a pas de pagination à lui (Word pagine à l'ouverture) : l'identité se lit dans son XML. Chaque modèle suivant garde son saut de page, et rien de vide ne le précède.
  const wordBodyOf = parts => Array.from(parts.doc.getElementsByTagName('w:body')[0].children).filter(node => node.nodeName !== 'w:sectPr');
  const wordTextOf = node => Array.from(node.getElementsByTagName('w:t')).map(run => run.textContent).join('');
  const wordHasContent = node => node.nodeName === 'w:tbl' || wordTextOf(node).trim() !== '' || node.getElementsByTagName('w:drawing').length > 0 || node.getElementsByTagName('w:pict').length > 0;
  // Les pages que les sauts écrits dans le Word ouvrent : le corps coupé à chaque bloc qui porte `pageBreakBefore` (Word ajoute ses coupes de remplissage à l'ouverture, les documents d'ici tiennent
  // sur une page chacun). Même forme que les autres vues : le nombre de pages et les mots de chacune.
  async function wordView(h, html) {
    const body = wordBodyOf(await h.exportDocxParts(html, null, PageLayout.getMarginsTwip()));
    const pages = [[]];
    body.forEach(node => { if (node.getElementsByTagName('w:pageBreakBefore').length) pages.push([]); pages[pages.length - 1].push(node); });
    return {
      count: pages.length,
      words: pages.map(nodes => nodes.flatMap(node => words(wordTextOf(node))).filter(isBody)),
      images: pages.map(nodes => (nodes.some(node => node.getElementsByTagName('w:drawing').length) ? 1 : 0)),
    };
  }

  return [
    ...matrixCases,
    {
      id: 'macro_pages_views_see_a_blank_page_and_a_moved_line',
      description: 'Garde-fou de la batterie : une vraie page blanche (deux sauts de page séparés par une ligne vide) et une ligne de trop qui passe seule sur la page 2 sont VUES par la Lecture et le PDF, sinon la matrice pourrait ne rien trouver',
      async run(h) {
        const problems = [];
        const summary = {};
        try {
          await CONFIGS[0].apply(h);
          const c = await capacitiesOf(h, CONFIGS[0]);
          const blankMiddle = lines(3, 'Alpha') + MANUAL_BREAK + '<p></p>' + MANUAL_BREAK + lines(3, 'Charlie');
          const overflow = lines(c.text + 1, 'Alpha');
          const lastLine = 'Alpha ' + c.text + ' du modèle de test.';
          for (const [engine, view] of [['Lecture', html => readerView(h, html)], ['PDF', html => pdfView(h, html)]]) {
            const middle = await view(blankMiddle);
            if (middle.count !== 3 || blankPages(middle).join() !== '2') problems.push(engine + ', une page blanche au milieu : ' + middle.count + ' page(s) [' + sigs(middle) + '] (3 pages dont la 2 vide attendues)');
            const over = await view(overflow);
            if (over.count !== 2 || over.words[1].join(' ') !== lastLine) problems.push(engine + ', une ligne de trop : ' + over.count + ' page(s) [' + sigs(over) + '], page 2 : « ' + (over.words[1] || []).join(' ') + ' » (2 pages, la seconde avec la seule dernière ligne « ' + lastLine + ' » attendues)');
            summary[engine] = { milieuVide: middle.count + ' [' + sigs(middle) + ']', ligneDeTrop: over.count + ' [' + sigs(over) + ']' };
          }
          const editor = await editorView(h, overflow, null);
          if (editor.count !== 2 || editor.words[1].join(' ') !== lastLine) problems.push('éditeur, une ligne de trop : ' + editor.count + ' page(s) [' + sigs(editor) + '] (2 pages, la seconde avec la seule dernière ligne attendues)');
          // Le pied « n/total » se lit dans les trois moteurs, sur deux pages comme sur une.
          await applyPage(h, 'portrait', 'A4');
          const feet = {};
          for (const [engine, view] of [['éditeur', html => editorView(h, html, WITH_HF)], ['Lecture', html => readerView(h, html, WITH_HF)], ['PDF', html => pdfView(h, html, WITH_HF)]]) {
            const two = await view(lines(2 * (await capacitiesOf(h, CONFIGS[1])).text, 'Alpha'));
            feet[engine] = two.count + ' pages, pieds [' + (two.feet || []).join(' ') + ']';
            if (two.count !== 2 || (two.feet || []).join(' ') !== expectedFeet(2).join(' ')) problems.push(engine + ', deux pages avec pied : ' + feet[engine] + ' (2 pages et « 1/2 2/2 » attendus)');
          }
          summary.pieds = feet;
        } finally {
          restorePage();
        }
        return { pass: problems.length === 0, notes: JSON.stringify({ summary, problems }) };
      },
    },
    {
      id: 'macro_pages_word_keeps_one_page_break_per_template_and_nothing_empty_before_it',
      description: 'Macro-modèle, Word : pour chaque modèle de la matrice, le saut de page du modèle suivant n\'est jamais précédé d\'un paragraphe vide, et il y en a un par modèle suivant',
      async run(h) {
        const problems = [];
        const summary = {};
        try {
          await CONFIGS[0].apply(h);
          const c = await capacitiesOf(h, CONFIGS[0]);
          for (const [id, label, , build] of SHAPES) {
            const macro = await macroDocument([build(c, 'Alpha'), build(c, 'Bravo'), lines(3, 'Charlie')]);
            const body = wordBodyOf(await h.exportDocxParts(macro, null, PageLayout.getMarginsTwip()));
            const breaks = [];
            body.forEach((node, i) => { if (node.getElementsByTagName('w:pageBreakBefore').length) breaks.push(i); });
            // Un saut posé à la main au milieu d'un modèle s'ajoute à celui du modèle suivant : deux modèles, deux sauts de plus.
            const expected = id === 'manualMiddle' ? 4 : 2;
            summary[id] = breaks.length + ' saut(s) de page';
            if (breaks.length !== expected) problems.push(id + ' (' + label + ') : ' + breaks.length + ' saut(s) de page dans le Word (' + expected + ' attendu(s))');
            for (const i of breaks) {
              const before = body[i - 1];
              if (before && !wordHasContent(before)) problems.push(id + ' (' + label + ') : un paragraphe vide précède le saut de page du bloc ' + i);
            }
          }
        } finally {
          restorePage();
        }
        return { pass: problems.length === 0, notes: JSON.stringify({ summary, problems }) };
      },
    },
    {
      id: 'macro_pages_template_ending_with_an_empty_variable_opens_no_page',
      description: 'Macro-modèle : un modèle dont la dernière ligne est une variable VIDE pour la ligne affichée (un complément d\'adresse, par exemple) n\'ouvre pas de page blanche avant le suivant, comme le même modèle dont la variable est remplie ; la Lecture et le PDF ont les mêmes pages',
      async run(h) {
        const problems = [];
        const summary = {};
        const TABLE = 'MpDossiers';
        try {
          await CONFIGS[0].apply(h);
          const c = await capacitiesOf(h, CONFIGS[0]);
          const stub = window.__gristStub;
          stub.setVariables(TABLE, { Nom: 'Text', Complement: 'Text' });
          const filled = { id: 1, Nom: 'Dupont', Complement: 'Bât. B' };
          const empty = { id: 2, Nom: 'Martin', Complement: '' };
          stub.setRows(TABLE, [filled, empty]);
          await GristAPI.refreshSchema();
          const badge = '<p><span class="var-badge" data-table="' + TABLE + '" data-column="Complement" data-key="' + TABLE + '.Complement"></span></p>';
          // La ligne de la variable est la dernière de la page : (c.text - 1) lignes devant elle quand elle est remplie, c.text quand elle est vide (sa ligne n'est pas comptée).
          for (const [name, record, before] of [['variable remplie', filled, c.text - 1], ['variable vide', empty, c.text]]) {
            const source = { tableId: TABLE, record };
            const alpha = lines(before, 'Alpha') + badge;
            const bravo = lines(before, 'Bravo') + badge;
            const short = lines(3, 'Charlie');
            const macro = await macroDocument([alpha, bravo, short], TABLE, record);
            const shortAlone = await pdfView(h, short, null, source);
            const reader = await readerView(h, macro, null, source);
            const pdf = await pdfView(h, macro, null, source);
            const aloneReader = await readerView(h, alpha, null, source);
            const alonePdf = await pdfView(h, alpha, null, source);
            summary[name] = { lecture: reader.count, pdf: pdf.count, seulLecture: aloneReader.count, seulPdf: alonePdf.count };
            if (alonePdf.count !== 1 || aloneReader.count !== 1) problems.push(name + ' : le modèle seul fait ' + aloneReader.count + ' page(s) à la Lecture et ' + alonePdf.count + ' au PDF (1 attendue)');
            const expected = concat([alonePdf, retag(alonePdf, 'Alpha', 'Bravo'), shortAlone]);
            for (const [engine, view] of [['Lecture', reader], ['PDF', pdf]]) {
              const diff = firstDifference(view, expected);
              if (diff) problems.push(name + ', macro-modèle, ' + engine + ' ≠ ses modèles bout à bout : ' + diff);
              const blank = blankPages(view);
              if (blank.length) problems.push(name + ', macro-modèle, ' + engine + ' : page(s) blanche(s) ' + blank.join(', '));
            }
          }
        } finally {
          restorePage();
        }
        return { pass: problems.length === 0, notes: JSON.stringify({ summary, problems }) };
      },
    },
    {
      id: 'macro_pages_page_breaks_in_a_row_leave_the_same_blank_pages_in_every_engine',
      description: 'Deux (ou trois) sauts de page de suite laissent une (ou deux) page(s) blanche(s), la même dans l\'éditeur, la Lecture, le PDF, l\'impression navigateur et le Word, seuls ou à l\'entrée d\'un modèle de macro-modèle (choix d\'Antoine du 09/10, « Les deux »)',
      async run(h) {
        const problems = [];
        const summary = {};
        try {
          await CONFIGS[0].apply(h);
          // [libellé, HTML, pages attendues, pages blanches attendues, l\'éditeur la montre-t-il (un macro-modèle ne s\'y ouvre pas d\'un bloc)]
          const RUNS = [
            ['deux sauts de suite', lines(3, 'Alpha') + MANUAL_BREAK + MANUAL_BREAK + lines(3, 'Charlie'), 3, [2], true],
            ['trois sauts de suite', lines(3, 'Alpha') + MANUAL_BREAK + MANUAL_BREAK + MANUAL_BREAK + lines(3, 'Charlie'), 4, [2, 3], true],
            ['deux sauts de suite devant un tableau', lines(3, 'Alpha') + MANUAL_BREAK + MANUAL_BREAK + tableOfRows(2, 'Charlie'), 3, [2], true],
            ['deux sauts de suite devant une zone à deux colonnes', lines(3, 'Alpha') + MANUAL_BREAK + MANUAL_BREAK + zoneOfLines(2, 'Charlie'), 3, [2], true],
            // Témoin, déjà d\'accord partout : un saut, une ligne vide, un saut.
            ['un saut, une ligne vide, un saut', lines(3, 'Alpha') + MANUAL_BREAK + '<p></p>' + MANUAL_BREAK + lines(3, 'Charlie'), 3, [2], true],
            // Un modèle qui COMMENCE par un saut de page posé à la main, derrière le saut du macro-modèle : deux sauts de suite.
            ['macro-modèle : un modèle qui commence par un saut de page', await macroDocument([lines(3, 'Alpha'), MANUAL_BREAK + lines(3, 'Charlie')]), 3, [2], false],
            ['macro-modèle : un modèle qui commence par un saut puis un tableau', await macroDocument([lines(3, 'Alpha'), MANUAL_BREAK + tableOfRows(2, 'Charlie')]), 3, [2], false],
          ];
          for (const [label, html, count, blanks, withEditor] of RUNS) {
            const views = [];
            if (withEditor) views.push(['éditeur', await editorView(h, html, null)]);
            views.push(['Lecture', await readerView(h, html)], ['PDF', await pdfView(h, html)], ['impression navigateur', await printView(h, html)], ['Word', await wordView(h, html)]);
            summary[label] = views.map(([engine, view]) => engine + ' ' + view.count + ' [' + sigs(view) + ']').join(' ; ');
            for (const [engine, view] of views) {
              if (view.count !== count || blankPages(view).join() !== blanks.join()) {
                problems.push(label + ', ' + engine + ' : ' + view.count + ' page(s) [' + sigs(view) + '], page(s) blanche(s) ' + (blankPages(view).join(', ') || 'aucune') + ' (' + count + ' pages dont ' + blanks.join(', ') + ' vide attendues)');
                continue;
              }
              const first = view.words[0].join(' ');
              const last = view.words[view.words.length - 1].join(' ');
              if (!/Alpha/.test(first) || /Charlie/.test(first) || !/Charlie/.test(last) || /Alpha/.test(last)) problems.push(label + ', ' + engine + ' : les mots ne sont pas sur les bonnes pages (première : ' + sig(view.words[0]) + ', dernière : ' + sig(view.words[view.words.length - 1]) + ')');
            }
          }
        } finally {
          restorePage();
        }
        return { pass: problems.length === 0, notes: JSON.stringify({ summary, problems }) };
      },
    },
    {
      id: 'macro_pages_page_break_opens_a_page_before_any_kind_of_block_in_every_engine',
      description: 'Un saut de page posé à la main devant un paragraphe, un titre, une liste, un bloc de code, un tableau, une zone à deux colonnes, un encadré, un trait ou un sommaire ouvre la page suivante dans l\'éditeur, la Lecture, le PDF, l\'impression navigateur ET le Word (avant, le Word perdait le saut devant un tableau, des colonnes ou un trait, et posait celui d\'un sommaire après lui)',
      async run(h) {
        const problems = [];
        const summary = {};
        try {
          await CONFIGS[0].apply(h);
          const text = tag => tag + ' 0 du modèle de test.';
          const BLOCKS = [
            ['paragraphe', tag => '<p>' + text(tag) + '</p>'],
            ['titre', tag => '<h2>' + text(tag) + '</h2>'],
            ['liste à puces', tag => '<ul><li><p>' + text(tag) + '</p></li></ul>'],
            ['bloc de code', tag => '<pre><code>' + text(tag) + '</code></pre>'],
            ['tableau', tag => tableOfRows(2, tag)],
            ['zone à deux colonnes', tag => zoneOfLines(2, tag)],
            ['encadré', tag => '<div class="callout" data-color="green" data-icon="check"><p>' + text(tag) + '</p></div>'],
            ['trait horizontal', tag => '<hr><p>' + text(tag) + '</p>'],
            ['sommaire', tag => '<div class="toc-marker">Sommaire</div><h2>' + text(tag) + '</h2>'],
          ];
          for (const [label, block] of BLOCKS) {
            const html = lines(2, 'Alpha') + MANUAL_BREAK + block('Charlie');
            const views = [['éditeur', await editorView(h, html, null)], ['Lecture', await readerView(h, html)], ['PDF', await pdfView(h, html)], ['impression navigateur', await printView(h, html)], ['Word', await wordView(h, html)]];
            summary[label] = views.map(([engine, view]) => engine + ' ' + view.count).join(', ');
            for (const [engine, view] of views) {
              const first = (view.words[0] || []).join(' ');
              const last = (view.words[view.words.length - 1] || []).join(' ');
              if (view.count !== 2 || !/Alpha/.test(first) || /Charlie/.test(first) || !/Charlie/.test(last) || /Alpha/.test(last)) {
                problems.push(label + ', ' + engine + ' : ' + view.count + ' page(s) [' + sigs(view) + '] (2 pages attendues : « Alpha » sur la première, « Charlie » sur la seconde)');
              }
            }
          }
        } finally {
          restorePage();
        }
        return { pass: problems.length === 0, notes: JSON.stringify({ summary, problems }) };
      },
    },
  ];
})();
