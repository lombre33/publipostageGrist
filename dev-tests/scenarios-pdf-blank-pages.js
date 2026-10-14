// Suite "pdfBlankPages" - les pages blanches du PDF, dites à la personne avant que le fichier ne parte (demande d'Antoine du 13/10 : « idéalement corriger le bug des pages blanches
// vides et à défaut prévoir un message d'erreur au moment de l'export en popup »). Les causes connues sont corrigées une à une (groupe blankLastPage) ; celle qu'on n'a pas vue venir
// est rattrapée ici : le PDF fini est repéré dans la mise en page de pdfmake (js/pdf-export.js:blankPagesOf), une page où rien ne se peint - ni texte, ni image, ni trait - est une
// page blanche, et l'export d'une ligne ouvre une fenêtre (js/batch-failures.js:confirmBlankPages : « Annuler » / « Exporter quand même ») avant d'enregistrer ; un lot rapporte ses
// lignes à pages blanches à la fin (BatchFailures.showBlankPages, cas pdfbatch_blank_pages_* du groupe pdfBatch).
// Ce que la suite garde :
//  1) le REPÉRAGE : les numéros de pages blanches que rend le moteur (getNativePdfBlobForRecord(...).blankPages) sont ceux que pdf.js lit dans le PDF (aucun texte du corps, aucune image) -
//     une page de lignes vides au milieu, deux de suite, et les deux causes connues quand on rend au rognage le défaut qu'il corrige (ReaderMode.trimTrailingBlankBlocks neutralisé) ;
//  2) pas de FAUSSE ALERTE : du texte sur plusieurs pages, une page qui ne porte qu'un tableau ou qu'une image, une image « derrière le texte » posée sur une page par ailleurs vide ;
//  3) le FOND ne cache pas une page blanche : l'en-tête et le pied de page (avec le numéro de page), le filigrane et une image répétée sur toutes les pages sont peints sur chaque page,
//     blanche ou non - ils n'en font pas une page à voir ;
//  4) la page blanche VOULUE n'est pas signalée : deux sauts de page de suite (carte du 09/10, « Les deux ») gardent leur page blanche, comme l'éditeur et la Lecture ;
//  5) la FENÊTRE : l'export d'une ligne qui a une page blanche la pose (titre, texte avec le numéro de la page, « Exporter quand même », en français et en anglais), « Annuler » n'enregistre
//     rien et rend `false`, « Exporter quand même » enregistre ; sans page blanche, pas de fenêtre ;
//  6) le PDF n'est PAS fait deux fois : le repérage lit la mise en page qui sert aussi à l'enregistrement (une seule mise en pages par PDF).
window.EditorTestSuites = window.EditorTestSuites || {};
window.EditorTestSuites.pdfBlankPages = (function () {
  const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const MANUAL_BREAK = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
  const HEADER_FOOTER = {
    enabled: true, differentFirstPage: false,
    header: { default: '<p>EN-TETE</p>', first: '' },
    footer: { default: '<p>PIED DE PAGE <span class="page-number-badge" contenteditable="false" data-format="n-slash-total">#</span></p>', first: '' },
  };
  const lines = n => Array.from({ length: n }, (_, i) => '<p>Ligne ' + i + ' du document de test de pagination.</p>').join('');
  const blankLines = n => '<p></p>'.repeat(n);

  async function setup(h) {
    await h.resetEditor();
    PageLayout.setOrientation('portrait');
    PageLayout.setMarginsMm(null);
    PageLayout.setWatermark(null);
    h.setA4Preview(true);
    await h.sleep(150);
  }

  // Le PDF d'un HTML (marges de la page courante) : ce que le moteur dit (`blankPages`) et ce que pdf.js y lit.
  async function pdfOf(h, html, headerFooter) {
    const result = await h.exportPdfContent(html, headerFooter || null, PageLayout.getMarginsPt());
    return { result, gt: await h.extractPdfGroundTruth(result.base64) };
  }
  // Les pages que pdf.js lit sans rien dans le corps : ni texte entre les marges haute et basse (l'en-tête et le pied sont dans les marges), ni image. `ignoreImages` : le fond d'images
  // répétées sur toutes les pages n'est pas du corps ; `ignoreText` : le texte du filigrane (peint au milieu de chaque page) non plus.
  function visiblyBlankPages(result, gt, options) {
    const { ignoreImages, ignoreText } = options || {};
    const [, top, , bottom] = result.docDefinition.pageMargins;
    return gt.pages.map((page, i) => {
      const body = page.textItems.some(item => item.y > top && item.y < page.height - bottom && !(ignoreText && ignoreText.test(item.str)));
      return !body && (ignoreImages || !page.images.length) ? i + 1 : null;
    }).filter(Boolean);
  }
  // Plus grand nombre de lignes qui tient sur UNE page du PDF (par dichotomie, chaque essai est un vrai rendu) : la capacité dépend des polices et de l'en-tête, elle n'est jamais écrite en dur.
  // `prefix` : ce qui précède les lignes dans le document et en prend une (la ligne d'ancrage d'une image sur toutes les pages, par exemple).
  async function capacity(h, headerFooter, prefix) {
    let fits = 20; let over = 90;
    while (over - fits > 1) {
      const mid = (fits + over) >> 1;
      if ((await pdfOf(h, (prefix || '') + lines(mid), headerFooter)).gt.pages.length === 1) fits = mid; else over = mid;
    }
    return fits;
  }
  // Le défaut que le rognage corrige (lignes vides en queue de document ou devant un saut) rendu au PDF le temps de `fn` : c'est ainsi qu'une page blanche « qu'on n'a pas vue venir » arrive.
  async function withoutTrimming(fn) {
    const original = ReaderMode.trimTrailingBlankBlocks;
    ReaderMode.trimTrailingBlankBlocks = () => {};
    try { return await fn(); } finally { ReaderMode.trimTrailingBlankBlocks = original; }
  }
  // Une image flottante posée sur la page (la grille que l'Aperçu A4 capture) : `layer` 'front' ou 'behind', `repeat` : « Sur toutes les pages ».
  function floatingImage(o) {
    const margins = PageLayout.getMarginsMm();
    const layer = o.layer || 'front';
    return '<img class="editor-image" src="' + TINY_PNG + '" alt="" style="width: 40px; height: 40px; position: absolute; left: ' + (margins.left * 96 / 25.4 + 150 * 96 / 72) + 'px; top: '
      + (margins.top * 96 / 25.4 + 20 * 96 / 72) + 'px; z-index: ' + (layer === 'front' ? 5 : -1) + ';" data-layer="' + layer + '" data-wrap="inline"' + (o.repeat ? ' data-repeat="true"' : '')
      + ' data-page-index="' + (o.pageIndex || 0) + '" data-page-left-pt="150" data-page-top-pt="20">';
  }

  const cases = [];

  cases.push({
    id: 'pdfblank_the_engine_reports_the_pages_pdfjs_reads_empty',
    description: 'Les pages blanches que le moteur rend (blankPages) sont celles que pdf.js lit sans texte ni image : une page de lignes vides au milieu du texte, deux de suite, et les deux défauts connus rendus au PDF (lignes vides en queue de document, lignes vides devant un saut de page) ; du texte seul n\'en a aucune',
    async run(h) {
      await setup(h);
      const problems = [];
      const n = await capacity(h, null);
      const docs = [
        ['du texte sur deux pages', () => lines(n + 8), []],
        ['une page de lignes vides au milieu du texte', () => lines(n) + blankLines(n) + '<p>Fin</p>', [2]],
        ['deux pages de lignes vides de suite', () => lines(n) + blankLines(2 * n) + '<p>Fin</p>', [2, 3]],
        ['une page de lignes vides au début', () => blankLines(n) + '<p>Fin</p>', [1]],
      ];
      const seen = {};
      for (const [name, html, expected] of docs) {
        const { result, gt } = await pdfOf(h, html(), null);
        const reported = result.blankPages;
        const read = visiblyBlankPages(result, gt);
        seen[name] = { pages: gt.pages.length, reported, pdfjs: read };
        if (!Array.isArray(reported)) { problems.push(name + ' : blankPages n\'est pas une liste (' + typeof reported + ')'); continue; }
        if (JSON.stringify(reported) !== JSON.stringify(expected)) problems.push(name + ' : le moteur rend ' + JSON.stringify(reported) + ' (attendu ' + JSON.stringify(expected) + ')');
        if (JSON.stringify(read) !== JSON.stringify(expected)) problems.push(name + ' : pdf.js lit ' + JSON.stringify(read) + ' de pages sans corps (attendu ' + JSON.stringify(expected) + ') - le test ne mesure pas ce qu\'il croit');
      }
      // Les deux défauts connus : le rognage les retire, le neutraliser les rend à la mise en page.
      const known = [
        ['des lignes vides en fin de document', () => lines(n) + blankLines(3), [2]],
        ['des lignes vides devant un saut de page', () => lines(n) + blankLines(3) + MANUAL_BREAK + '<p>Suite</p>', [2]],
      ];
      for (const [name, html, expected] of known) {
        const trimmed = await pdfOf(h, html(), null);
        const raw = await withoutTrimming(() => pdfOf(h, html(), null));
        seen[name] = { rogne: trimmed.result.blankPages, brut: raw.result.blankPages, brutPdfjs: visiblyBlankPages(raw.result, raw.gt) };
        if (JSON.stringify(raw.result.blankPages) !== JSON.stringify(expected)) problems.push(name + ' (non rogné) : le moteur rend ' + JSON.stringify(raw.result.blankPages) + ' (attendu ' + JSON.stringify(expected) + ')');
        if (JSON.stringify(visiblyBlankPages(raw.result, raw.gt)) !== JSON.stringify(expected)) problems.push(name + ' (non rogné) : pdf.js ne lit pas la page blanche attendue : ' + JSON.stringify(visiblyBlankPages(raw.result, raw.gt)));
      }
      // Le défaut de fin de document est corrigé (groupe blankLastPage) : rogné, pas de page blanche à signaler.
      if (JSON.stringify(seen['des lignes vides en fin de document'].rogne) !== '[]') problems.push('lignes vides en fin de document, rognées : ' + JSON.stringify(seen['des lignes vides en fin de document'].rogne) + ' (aucune attendue)');
      return { pass: problems.length === 0, notes: JSON.stringify({ lignesParPage: n, seen, problems }) };
    },
  });

  cases.push({
    id: 'pdfblank_a_page_with_something_to_see_is_not_reported',
    description: 'Pas de fausse alerte : une page qui ne porte qu\'un tableau, qu\'une image, une liste, un trait, une zone à deux colonnes, une citation, un bloc de code ou une image « derrière le texte » posée sur elle (sa ligne d\'ancrage est vide) n\'est pas blanche',
    async run(h) {
      await setup(h);
      const problems = [];
      const n = await capacity(h, null);
      const TABLE = '<table><tbody><tr><td><p>un</p></td><td><p>deux</p></td></tr></tbody></table>';
      const EMPTY_TABLE = '<table><tbody><tr><td><p></p></td><td><p></p></td></tr></tbody></table>';
      const IMAGE_LINE = '<p><img class="editor-image" src="' + TINY_PNG + '" alt="" style="width: 300px; height: 300px;" data-layer="normal" data-wrap="inline"></p>';
      const docs = [
        ['un tableau seul sur la page 2', lines(n) + TABLE],
        ['un tableau aux cases vides sur la page 2 (ses traits se peignent)', lines(n) + EMPTY_TABLE],
        ['une image seule sur la page 2', lines(n) + IMAGE_LINE],
        ['une liste seule sur la page 2', lines(n) + '<ul><li><p>un point</p></li></ul>'],
        ['un trait horizontal seul sur la page 2', lines(n) + '<hr>'],
        ['une zone à deux colonnes seule sur la page 2', lines(n) + '<div class="two-columns-zone"><div class="two-columns-column"><p>GAUCHE</p></div><div class="two-columns-column"><p>DROITE</p></div></div>'],
        ['une citation seule sur la page 2', lines(n) + '<blockquote><p>Une citation</p></blockquote>'],
        ['un bloc de code seul sur la page 2', lines(n) + '<pre><code>x = 1</code></pre>'],
        ['une image derrière le texte posée sur la page 2, sur une ligne vide', lines(n) + '<p>' + floatingImage({ layer: 'behind', pageIndex: 1 }) + '</p>' + '<p>Suite</p>'],
      ];
      const seen = {};
      for (const [name, html] of docs) {
        const { result, gt } = await pdfOf(h, html, null);
        seen[name] = { pages: gt.pages.length, reported: result.blankPages, pdfjsImages: gt.pages.map(page => page.images.length) };
        if (gt.pages.length < 2) problems.push(name + ' : une seule page (la page 2 est le point du test)');
        if (JSON.stringify(result.blankPages) !== '[]') problems.push(name + ' : signalé blanc : ' + JSON.stringify(result.blankPages));
      }
      return { pass: problems.length === 0, notes: JSON.stringify({ lignesParPage: n, seen, problems }) };
    },
  });

  cases.push({
    id: 'pdfblank_page_furniture_does_not_hide_a_blank_page',
    description: 'L\'en-tête, le pied de page (avec le numéro), le filigrane et une image répétée sur toutes les pages sont peints sur chaque page, blanche ou non : une page blanche reste signalée avec eux, et du texte seul reste sans alerte avec eux',
    async run(h) {
      await setup(h);
      const problems = [];
      const seen = {};
      const nHf = await capacity(h, HEADER_FOOTER);
      const variants = [
        ['en-tête et pied de page', null, HEADER_FOOTER, ''],
        ['filigrane', { text: 'CONFIDENTIEL' }, null, ''],
        ['image répétée sur toutes les pages', null, null, '<p>' + floatingImage({ layer: 'behind', repeat: true }) + '</p>'],
      ];
      try {
        for (const [name, watermark, headerFooter, letterhead] of variants) {
          PageLayout.setWatermark(watermark);
          // `n` : les lignes d'une page pleine ; `first` : celles de la page 1 quand une ligne d'ancrage les précède (il en reste moins, la page 2 des lignes vides en prend n).
          const n = headerFooter ? nHf : await capacity(h, null);
          const first = letterhead ? await capacity(h, headerFooter, letterhead) : n;
          const textOnly = await pdfOf(h, letterhead + lines(first + 8), headerFooter);
          const blank = await pdfOf(h, letterhead + lines(first) + blankLines(n) + '<p>Fin</p>', headerFooter);
          const read = visiblyBlankPages(blank.result, blank.gt, { ignoreImages: !!letterhead, ignoreText: watermark ? /CONFIDENTIEL/ : null });
          seen[name] = {
            lignesParPage: n, lignesPage1: first, texte: textOnly.result.blankPages, blanche: blank.result.blankPages, pdfjs: read,
            texteSurLaPage2: blank.gt.pages[1] ? blank.gt.pages[1].textItems.length : null, imagesSurLaPage2: blank.gt.pages[1] ? blank.gt.pages[1].images.length : null,
          };
          if (JSON.stringify(textOnly.result.blankPages) !== '[]') problems.push(name + ', du texte seul : signalé ' + JSON.stringify(textOnly.result.blankPages));
          if (JSON.stringify(blank.result.blankPages) !== '[2]') problems.push(name + ', une page de lignes vides : le moteur rend ' + JSON.stringify(blank.result.blankPages) + ' (attendu [2])');
          if (JSON.stringify(read) !== '[2]') problems.push(name + ' : pdf.js lit ' + JSON.stringify(read) + ' de pages sans corps (attendu [2])');
          if (headerFooter && !blank.gt.pages[1].textItems.length) problems.push(name + ' : la page blanche n\'a pas son en-tête / pied peint - le test ne mesure pas ce qu\'il croit');
          if (watermark && !blank.gt.pages[1].textItems.some(item => /CONFIDENTIEL/.test(item.str))) problems.push(name + ' : le filigrane n\'est pas peint sur la page blanche - le test ne mesure pas ce qu\'il croit');
          if (letterhead && !blank.gt.pages[1].images.length) problems.push(name + ' : l\'image répétée n\'est pas peinte sur la page 2 - le test ne mesure pas ce qu\'il croit');
        }
      } finally { PageLayout.setWatermark(null); }
      return { pass: problems.length === 0, notes: JSON.stringify({ seen, problems }) };
    },
  });

  cases.push({
    id: 'pdfblank_the_blank_page_asked_for_by_two_page_breaks_is_not_reported',
    description: 'Deux sauts de page de suite (carte du 09/10 : « Les deux ») gardent leur page blanche, comme l\'éditeur et la Lecture : le PDF la garde et le moteur ne la signale pas ; une page blanche non voulue juste derrière, elle, est signalée seule',
    async run(h) {
      await setup(h);
      const problems = [];
      const seen = {};
      const n = await capacity(h, null);
      // Un macro-modèle tel que l'application l'assemble (un saut de page `data-macro-slot` devant chaque modèle sauf le premier) dont le second modèle COMMENCE par un saut posé à la main : deux sauts de suite.
      const macro = fragments => MacroTemplates.buildConcatenatedHtml({ slots: fragments.map((_, i) => ({ type: 'fixed', modeleId: i + 1 })) }, 'Clients', { id: 1 }, fragments.map((contenu, i) => ({ id: i + 1, contenu })));
      const docs = [
        ['macro-modèle : un modèle qui commence par un saut de page', await macro(['<p>A</p>', MANUAL_BREAK + '<p>B</p>']), 3, []],
        ['deux sauts de suite', '<p>A</p>' + MANUAL_BREAK + MANUAL_BREAK + '<p>B</p>', 3, []],
        ['trois sauts de suite', '<p>A</p>' + MANUAL_BREAK + MANUAL_BREAK + MANUAL_BREAK + '<p>B</p>', 4, []],
        ['la page voulue, puis une page de lignes vides non voulue', '<p>A</p>' + MANUAL_BREAK + MANUAL_BREAK + lines(n) + blankLines(n) + '<p>Fin</p>', 5, [4]],
      ];
      for (const [name, html, pages, expected] of docs) {
        const { result, gt } = await pdfOf(h, html, null);
        seen[name] = { pages: gt.pages.length, reported: result.blankPages, pdfjs: visiblyBlankPages(result, gt) };
        if (gt.pages.length !== pages) problems.push(name + ' : ' + gt.pages.length + ' pages (attendu ' + pages + ')');
        if (JSON.stringify(result.blankPages) !== JSON.stringify(expected)) problems.push(name + ' : le moteur rend ' + JSON.stringify(result.blankPages) + ' (attendu ' + JSON.stringify(expected) + ')');
        if (!visiblyBlankPages(result, gt).includes(2)) problems.push(name + ' : la page 2 n\'est pas blanche dans le PDF - le test ne mesure pas ce qu\'il croit');
      }
      return { pass: problems.length === 0, notes: JSON.stringify({ lignesParPage: n, seen, problems }) };
    },
  });

  // Un export d'une ligne comme le fait js/main.js (PdfExport.exportCurrentRecord), sans rien enregistrer : le téléchargement de pdfmake est noté, la fenêtre est remplacée par une réponse toute faite.
  async function exportRow(h, html, headerFooter, answer) {
    await PdfExport.ensurePdfLibsLoaded();
    const original = window.pdfMake.createPdf;
    const downloads = [];
    const generators = [];
    window.pdfMake.createPdf = function (docDefinition) {
      const gen = original.call(window.pdfMake, docDefinition);
      gen.download = function (name) { downloads.push(name); };
      const flush = gen._flushDoc;
      gen.flushes = 0;
      gen._flushDoc = function () { gen.flushes++; return flush.apply(this, arguments); };
      generators.push(gen);
      return gen;
    };
    const dialogs = h.stubDialogs({ confirm: answer });
    try {
      const outcome = await PdfExport.exportCurrentRecord(html, null, { id: 1 }, '', headerFooter || null, PageLayout.getMarginsPt(), undefined, 'native');
      return { outcome, downloads, asked: dialogs.asked.filter(a => a.kind === 'confirm'), generators };
    } finally {
      dialogs.restore();
      window.pdfMake.createPdf = original;
    }
  }

  cases.push({
    id: 'pdfblank_export_row_asks_before_saving_a_pdf_with_a_blank_page',
    description: 'L\'export d\'une ligne dont le PDF a une page blanche ouvre la fenêtre avant d\'enregistrer (titre, numéro de la page, « Exporter quand même ») : « Annuler » n\'enregistre rien et rend false, « Exporter quand même » enregistre ; sans page blanche, pas de fenêtre ; deux pages blanches, au pluriel',
    async run(h) {
      await setup(h);
      const problems = [];
      const n = await capacity(h, null);
      const blank = lines(n) + blankLines(n) + '<p>Fin</p>';
      const seen = {};
      const declined = await exportRow(h, blank, null, () => false);
      seen.annule = { outcome: declined.outcome, telechargements: declined.downloads.length, fenetres: declined.asked.length };
      if (declined.asked.length !== 1) problems.push('annulé : ' + declined.asked.length + ' fenêtre(s) (1 attendue)');
      if (declined.outcome !== false) problems.push('annulé : l\'export rend ' + JSON.stringify(declined.outcome) + ' (false attendu)');
      if (declined.downloads.length) problems.push('annulé : un fichier est parti (' + declined.downloads.join(', ') + ')');
      const ask = declined.asked[0] || {};
      seen.fenetre = { title: ask.title, message: ask.message, confirmLabel: ask.confirmLabel };
      if (ask.title !== 'Une page blanche dans ce PDF') problems.push('titre : ' + JSON.stringify(ask.title));
      if (!/^La page 2 est blanche : elle ne montre ni texte ni image\./.test(ask.message || '')) problems.push('texte : ' + JSON.stringify(ask.message));
      if (!/Exporter quand même \?$/.test(ask.message || '')) problems.push('le texte ne finit pas par la question : ' + JSON.stringify(ask.message));
      if (ask.confirmLabel !== 'Exporter quand même') problems.push('bouton : ' + JSON.stringify(ask.confirmLabel));

      const accepted = await exportRow(h, blank, null, () => true);
      seen.accepte = { outcome: accepted.outcome, telechargements: accepted.downloads, fenetres: accepted.asked.length };
      if (accepted.outcome !== true) problems.push('accepté : l\'export rend ' + JSON.stringify(accepted.outcome) + ' (true attendu)');
      if (accepted.downloads.length !== 1 || !/\.pdf$/.test(accepted.downloads[0] || '')) problems.push('accepté : ' + JSON.stringify(accepted.downloads) + ' (un fichier .pdf attendu)');

      const clean = await exportRow(h, lines(n + 8), null, () => false);
      seen.sansPageBlanche = { outcome: clean.outcome, telechargements: clean.downloads.length, fenetres: clean.asked.length };
      if (clean.asked.length) problems.push('sans page blanche : ' + clean.asked.length + ' fenêtre(s)');
      if (clean.outcome !== true || clean.downloads.length !== 1) problems.push('sans page blanche : l\'export rend ' + JSON.stringify(clean.outcome) + ', ' + clean.downloads.length + ' fichier(s)');

      const two = await exportRow(h, lines(n) + blankLines(2 * n) + '<p>Fin</p>', null, () => false);
      const askTwo = two.asked[0] || {};
      seen.deux = { title: askTwo.title, message: askTwo.message };
      if (askTwo.title !== '2 pages blanches dans ce PDF') problems.push('deux pages, titre : ' + JSON.stringify(askTwo.title));
      if (!/^Les pages 2, 3 sont blanches : elles ne montrent ni texte ni image\. Elles viennent souvent/.test(askTwo.message || '')) problems.push('deux pages, texte : ' + JSON.stringify(askTwo.message));
      return { pass: problems.length === 0, notes: JSON.stringify({ lignesParPage: n, seen, problems }) };
    },
  });

  cases.push({
    id: 'pdfblank_the_window_speaks_english_in_english',
    description: 'La fenêtre des pages blanches suit la langue de l\'interface : titre, texte et bouton en anglais, au singulier comme au pluriel',
    async run(h) {
      await setup(h);
      const problems = [];
      const previous = I18n.getLang();
      const seen = {};
      try {
        const n = await capacity(h, null);
        I18n.setLang('en');
        const one = await exportRow(h, lines(n) + blankLines(n) + '<p>Fin</p>', null, () => false);
        const two = await exportRow(h, lines(n) + blankLines(2 * n) + '<p>Fin</p>', null, () => false);
        const [a, b] = [one.asked[0] || {}, two.asked[0] || {}];
        seen.one = { title: a.title, message: a.message, confirmLabel: a.confirmLabel };
        seen.two = { title: b.title, message: b.message };
        if (a.title !== 'A blank page in this PDF') problems.push('titre : ' + JSON.stringify(a.title));
        if (!/^Page 2 is blank: it shows no text or image\. It often comes from empty lines, or a page break, right after a full page\.\n\nExport anyway\?$/.test(a.message || '')) problems.push('texte : ' + JSON.stringify(a.message));
        if (a.confirmLabel !== 'Export anyway') problems.push('bouton : ' + JSON.stringify(a.confirmLabel));
        if (b.title !== '2 blank pages in this PDF') problems.push('pluriel, titre : ' + JSON.stringify(b.title));
        if (!/^Pages 2, 3 are blank: they show no text or image\. They often come from/.test(b.message || '')) problems.push('pluriel, texte : ' + JSON.stringify(b.message));
      } finally { I18n.setLang(previous); }
      return { pass: problems.length === 0, notes: JSON.stringify({ seen, problems }) };
    },
  });

  cases.push({
    id: 'pdfblank_the_pdf_is_laid_out_once',
    description: 'Le repérage lit la mise en page qui sert aussi à l\'enregistrement : un PDF n\'est mis en pages qu\'une fois, que l\'on enregistre (download), qu\'on en prenne le blob ou qu\'on le relise (getBase64), avec ou sans page blanche',
    async run(h) {
      await setup(h);
      const problems = [];
      const n = await capacity(h, null);
      const seen = {};
      for (const [name, html] of [['sans page blanche', lines(n + 8)], ['avec une page blanche', lines(n) + blankLines(n) + '<p>Fin</p>']]) {
        const row = await exportRow(h, html, null, () => true);
        const final = row.generators[row.generators.length - 1];
        const base64 = await new Promise(resolve => final.getBase64(resolve));
        const blob = await new Promise(resolve => final.getBlob(resolve));
        const text = await new Promise(resolve => final.getBuffer(buffer => resolve(String.fromCharCode.apply(null, Array.from(buffer.slice(0, 5))))));
        seen[name] = { miseEnPages: final.flushes, octetsBase64: base64.length, octetsBlob: blob.size, debut: text };
        if (final.flushes !== 1) problems.push(name + ' : ' + final.flushes + ' mise(s) en pages du PDF final (1 attendue)');
        if (!base64.length || blob.size < 1000) problems.push(name + ' : le PDF relu est vide (' + base64.length + ' / ' + blob.size + ')');
        if (text !== '%PDF-') problems.push(name + ' : le fichier ne commence pas par %PDF- (' + JSON.stringify(text) + ')');
        if (Math.abs(Math.floor(base64.length * 3 / 4) - blob.size) > 3) problems.push(name + ' : le blob et le base64 ne sont pas le même fichier');
      }
      return { pass: problems.length === 0, notes: JSON.stringify({ seen, problems }) };
    },
  });

  cases.push({
    id: 'pdfblank_the_windows_cap_long_lists',
    description: 'Les fenêtres restent lisibles : au-delà de douze pages blanches la liste des pages s\'arrête sur « … », la fin de lot liste cent lignes puis dit combien d\'autres suivent, et rien à lister n\'ouvre aucune fenêtre',
    async run(h) {
      const problems = [];
      const seen = {};
      const dialogs = h.stubDialogs({ confirm: () => true, choose: () => null });
      try {
        const pages = Array.from({ length: 20 }, (_, i) => i + 1);
        await BatchFailures.confirmBlankPages(pages);
        const single = dialogs.asked.find(a => a.kind === 'confirm') || {};
        seen.single = { title: single.title, message: single.message };
        if (single.title !== '20 pages blanches dans ce PDF') problems.push('titre : ' + JSON.stringify(single.title));
        if (!/^Les pages 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, … sont blanches/.test(single.message || '')) problems.push('pages : ' + JSON.stringify((single.message || '').slice(0, 90)));

        const rows = Array.from({ length: 105 }, (_, i) => ({ id: i + 1, name: i % 2 ? 'Durand ' + i : '', pages: i === 0 ? pages : [2] }));
        await BatchFailures.showBlankPages(rows);
        const win = dialogs.asked.find(a => a.kind === 'choose') || {};
        const lines = String(win.message).split('\n');
        seen.batch = { title: win.title, lignes: lines.length, premiere: lines[2], derniere: lines[lines.length - 1] };
        if (win.title !== 'Des pages blanches dans 105 documents') problems.push('titre de fin de lot : ' + JSON.stringify(win.title));
        if (lines.length !== 2 + 100 + 1) problems.push('lignes : ' + lines.length + ' (introduction, vide, cent lignes et le reste attendus)');
        if (lines[2] !== '• Ligne n° 1 : pages 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, …') problems.push('première ligne : ' + JSON.stringify(lines[2]));
        if (lines[3] !== '• Durand 1 (ligne n° 2) : page 2') problems.push('deuxième ligne : ' + JSON.stringify(lines[3]));
        if (lines[lines.length - 1] !== '… et 5 autres documents.') problems.push('dernière ligne : ' + JSON.stringify(lines[lines.length - 1]));

        const before = dialogs.asked.length;
        await BatchFailures.showBlankPages([]);
        await BatchFailures.showBlankPages(undefined);
        if (dialogs.asked.length !== before) problems.push('rien à lister : ' + (dialogs.asked.length - before) + ' fenêtre(s) ouverte(s)');
      } finally { dialogs.restore(); }
      return { pass: problems.length === 0, notes: JSON.stringify({ seen, problems }) };
    },
  });

  return cases;
})();
