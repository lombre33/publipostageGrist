// Suite "exportType" - le menu « Type d'export » (ex-« Qualité PDF », #v2-btn-quality) et le menu du bouton Exporter (#v2-btn-export-pdf-flyout...). Demande d'Antoine du 12/10 :
// « le bouton qualité PDF doit devenir le choix pour le type d'export » (PDF, Word, Excel, avec les options de chacun), « une seule ligne ou toutes les lignes » (+ le classeur unique
// pour l'Excel, l'assemblage pour le PDF), le menu du bouton d'export s'appelle « Exporter » ; « attention à ne pas perdre de features ».
// Ce que la suite garde :
//  1) le menu Type : trois lignes (PDF, Word, Excel), leurs noms français et anglais, la ligne du type choisi active, Word grisé dans une grille et Excel grisé dans un document (jamais
//     retiré), un clic sur une ligne grisée ne choisit rien ; la qualité du PDF est dans le même menu, active pour le PDF seulement ;
//  2) le menu Exporter : titre « Exporter » (« Export »), la ligne affichée puis les lots DU TYPE CHOISI (PDF : ZIP, un seul PDF, assemblage ; Word : ZIP ; Excel : ZIP, classeur unique),
//     dans les deux langues ; les autres lignes restent dans la page, masquées ;
//  3) le bouton Exporter exporte la ligne affichée dans le type choisi (PDF, impression navigateur, PDF « Léger », Word, Excel), jamais un autre ;
//  4) un type que le modèle ne sait pas faire revient au PDF (Word vers une grille, Excel vers un document) et n'est pas retrouvé au modèle suivant ;
//  5) rien n'est perdu : chacune des neuf lignes d'export d'avant garde son identifiant et lance le même export ; la ligne « Exporter en PDF » du menu fait comme le bouton.
// Le vrai survol et le vrai clic à 700 x 400 sont dans dev-tests/verify-export-type-mouse.mjs.
(function () {
  const cases = [];
  const TABLE = 'ExpTypeClients';
  const NAMES = ['Alpha Durand', 'Bravo Martin', 'Charlie Petit'];
  const TYPE_FLYOUT = '#v2-quality-flyout';
  const EXPORT_FLYOUT = '#v2-export-pdf-flyout';
  const badge = column => `<span class="var-badge" data-table="${TABLE}" data-column="${column}" data-key="${TABLE}.${column}"></span>`;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const typeSelect = () => document.getElementById('v2-export-type');
  const qualitySelect = () => document.getElementById('v2-pdf-quality');
  const typeRow = type => document.querySelector(TYPE_FLYOUT + ' .v2-hover-row[data-export-type="' + type + '"]');
  const qualityRow = quality => document.querySelector(TYPE_FLYOUT + ' .v2-hover-row[data-quality="' + quality + '"]');
  const greyed = row => row.classList.contains('v2-hover-row-disabled') && row.getAttribute('aria-disabled') === 'true';
  const live = row => !row.classList.contains('v2-hover-row-disabled') && row.getAttribute('aria-disabled') === null;
  const shownIds = () => Array.from(document.querySelectorAll(EXPORT_FLYOUT + ' .v2-hover-row')).filter(row => !row.hidden).map(row => row.id);
  const inLang = async (lang, fn) => { const before = I18n.getLang(); I18n.setLang(lang); try { return await fn(); } finally { I18n.setLang(before); } };

  async function seed(h) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables(TABLE, { Nom: 'Text' });
    stub.setRows(TABLE, NAMES.map((Nom, i) => ({ id: i + 1, Nom })));
    await GristAPI.refreshSchema();
    stub.fireRecord({ id: 1, Nom: NAMES[0] }, TABLE);
    await sleep(50);
    Editor.setHTML(`<p>Bonjour ${badge('Nom')}, voici votre courrier.</p>`);
    await sleep(80);
  }
  async function enterGrid(h) {
    h.openFlyout('#v2-new-template-group');
    await h.clickButton('v2-btn-new-grid');
    await sleep(250);
  }
  async function leaveGrid(h) {
    h.openFlyout('#v2-new-template-group');
    await h.clickButton('v2-btn-new-document');
    await sleep(250);
  }
  // Le choix par un vrai clic sur la ligne du menu, comme la personne.
  const pickType = async type => { typeRow(type).click(); await sleep(20); };
  const pickQuality = async quality => { qualityRow(quality).click(); await sleep(20); };
  // Remet le menu d'avant : PDF vectoriel, dans un document.
  async function reset(h) {
    await leaveGrid(h);
    typeSelect().value = 'pdf';
    qualitySelect().value = 'native';
    await pickType('pdf');
    await pickQuality('native');
  }

  // Les quatre moteurs que le bouton Exporter appelle, remplacés par des espions qui rendent aussitôt : `calls` note qui a été appelé (et avec quelle qualité d'image pour le PDF).
  function spyOnEngines() {
    const calls = { pdf: [], print: 0, docx: 0, xlsx: 0 };
    const orig = { pdf: PdfExport.exportCurrentRecord, print: PrintExport.printRecord, docx: DocxExport.exportCurrentRecord, xlsx: XlsxExport.exportCurrentRecord };
    PdfExport.exportCurrentRecord = async (...args) => { calls.pdf.push(args[7]); };
    PrintExport.printRecord = async () => { calls.print++; };
    DocxExport.exportCurrentRecord = async () => { calls.docx++; };
    XlsxExport.exportCurrentRecord = async () => { calls.xlsx++; };
    return {
      calls,
      total: () => calls.pdf.length + calls.print + calls.docx + calls.xlsx,
      restore() { PdfExport.exportCurrentRecord = orig.pdf; PrintExport.printRecord = orig.print; DocxExport.exportCurrentRecord = orig.docx; XlsxExport.exportCurrentRecord = orig.xlsx; },
    };
  }
  // Clique le bouton (ou la ligne) et attend que l'export lancé ait fini : un moteur appelé, puis le verrou rendu.
  async function clickAndWait(id, spies) {
    const before = spies.total();
    document.getElementById(id).click();
    for (let i = 0; i < 80 && spies.total() === before; i++) await sleep(50);
    for (let i = 0; i < 40 && document.getElementById('btn-export-pdf').style.pointerEvents === 'none'; i++) await sleep(50);
    await sleep(30);
  }

  cases.push({
    id: 'exporttype_menu_lists_pdf_word_excel_then_the_pdf_quality',
    description: 'Le menu du bouton à gauche d\'Exporter s\'appelle « Type d\'export » et a trois lignes de type (PDF, Word, Excel) nommées en français et en anglais, puis la qualité du PDF (Vectoriel, Impression navigateur, Léger) ; au départ PDF et Vectoriel sont les lignes actives, Excel est grisé dans un document',
    run: async (h) => {
      await seed(h);
      await reset(h);
      const bad = [];
      try {
        const flyout = document.querySelector(TYPE_FLYOUT);
        const read = () => ({
          label: flyout.querySelector('.v2-hover-flyout-label').textContent.trim(),
          aria: document.getElementById('v2-btn-quality').getAttribute('aria-label'),
          types: Array.from(flyout.querySelectorAll('.v2-hover-row[data-export-type]')).map(row => row.textContent.trim()),
          qualityLabel: flyout.querySelectorAll('.v2-hover-flyout-label')[1].textContent.trim(),
          qualities: Array.from(flyout.querySelectorAll('.v2-hover-row[data-quality]')).map(row => row.textContent.trim()),
          options: Array.from(typeSelect().options).map(o => o.textContent.trim()),
        });
        const fr = read();
        const en = await inLang('en', async () => read());
        const wantFr = { label: 'Type d’export', aria: 'Type d’export', types: ['PDF', 'Word (bêta)', 'Excel'], qualityLabel: 'Qualité PDF', qualities: ['Vectoriel (par défaut)', 'Impression navigateur', 'Léger (images réduites)'], options: ['PDF', 'Word (bêta)', 'Excel'] };
        const wantEn = { label: 'Export type', aria: 'Export type', types: ['PDF', 'Word (beta)', 'Excel'], qualityLabel: 'PDF quality', qualities: ['Vector (default)', 'Browser print', 'Light (smaller images)'], options: ['PDF', 'Word (beta)', 'Excel'] };
        if (JSON.stringify(fr) !== JSON.stringify(wantFr)) bad.push('français=' + JSON.stringify(fr));
        if (JSON.stringify(en) !== JSON.stringify(wantEn)) bad.push('anglais=' + JSON.stringify(en));
        const order = Array.from(flyout.querySelectorAll('.v2-hover-row')).map(row => row.dataset.exportType || row.dataset.quality).join();
        if (order !== 'pdf,docx,xlsx,native,browser-print,light') bad.push('ordre=' + order);
        const active = Array.from(flyout.querySelectorAll('.v2-hover-row.is-active')).map(row => row.dataset.exportType || row.dataset.quality).join();
        if (active !== 'pdf,native') bad.push('lignes actives=' + active);
        if (!live(typeRow('pdf')) || !live(typeRow('docx')) || !greyed(typeRow('xlsx'))) bad.push('grisés dans un document : ' + JSON.stringify(['pdf', 'docx', 'xlsx'].map(t => typeRow(t).className)));
        if (!['native', 'browser-print', 'light'].every(q => live(qualityRow(q)))) bad.push('qualités grisées pour le PDF');
        if (document.getElementById('v2-btn-quality').classList.contains('active')) bad.push('bouton allumé pour le PDF');
      } finally { await reset(h); }
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    },
  });

  cases.push({
    id: 'exporttype_choosing_a_type_marks_it_and_greys_the_pdf_quality',
    description: 'Choisir Word marque sa ligne, allume le bouton du type et grise la qualité du PDF (aucune ligne retirée, un clic dessus ne change rien) ; choisir Excel dans un document ne fait rien ; revenir au PDF rend la qualité choisie, active',
    run: async (h) => {
      await seed(h);
      await reset(h);
      const bad = [];
      try {
        await pickQuality('light');
        if (qualitySelect().value !== 'light' || !qualityRow('light').classList.contains('is-active')) bad.push('« Léger » non choisi');
        await pickType('xlsx');
        if (typeSelect().value !== 'pdf' || !typeRow('pdf').classList.contains('is-active') || typeRow('xlsx').classList.contains('is-active')) bad.push('Excel grisé a été choisi dans un document : ' + typeSelect().value);
        await pickType('docx');
        const button = document.getElementById('v2-btn-quality');
        if (typeSelect().value !== 'docx') bad.push('Word non choisi : ' + typeSelect().value);
        const active = Array.from(document.querySelectorAll(TYPE_FLYOUT + ' .v2-hover-row.is-active')).map(row => row.dataset.exportType || row.dataset.quality).join();
        if (active !== 'docx') bad.push('lignes actives avec Word=' + active);
        if (!button.classList.contains('active')) bad.push('bouton du type non allumé avec Word');
        if (!['native', 'browser-print', 'light'].every(q => greyed(qualityRow(q)))) bad.push('qualités non grisées avec Word');
        await pickQuality('native');
        if (qualitySelect().value !== 'light') bad.push('un clic sur une qualité grisée a changé la qualité : ' + qualitySelect().value);
        await pickType('pdf');
        if (typeSelect().value !== 'pdf' || button.classList.contains('active')) bad.push('retour au PDF : ' + typeSelect().value + ' / bouton allumé ' + button.classList.contains('active'));
        const back = Array.from(document.querySelectorAll(TYPE_FLYOUT + ' .v2-hover-row.is-active')).map(row => row.dataset.exportType || row.dataset.quality).join();
        if (back !== 'pdf,light') bad.push('lignes actives au retour=' + back);
        if (!['native', 'browser-print', 'light'].every(q => live(qualityRow(q)))) bad.push('qualités encore grisées au retour du PDF');
      } finally { await reset(h); }
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    },
  });

  cases.push({
    id: 'exporttype_export_menu_is_titled_exporter_and_lists_the_chosen_types_rows',
    description: 'Le menu du bouton Exporter a pour titre « Exporter » (« Export ») et, dans l\'ordre, la ligne affichée puis les lots du type choisi : PDF (ZIP, un seul PDF, assemblage), Word (ZIP), Excel dans une grille (ZIP, un seul classeur) ; les autres lignes restent dans la page, masquées',
    run: async (h) => {
      await seed(h);
      await reset(h);
      const bad = [];
      const allIds = ['v2-btn-export-pdf', 'v2-btn-export-docx', 'v2-btn-export-xlsx', 'v2-btn-export-pdf-batch', 'v2-btn-export-pdf-merged', 'v2-btn-export-pdf-sheets', 'v2-btn-export-docx-batch', 'v2-btn-export-xlsx-batch', 'v2-btn-export-xlsx-single'];
      try {
        const labelOf = () => document.querySelector(EXPORT_FLYOUT + ' .v2-hover-flyout-label').textContent.trim();
        const ariaOf = () => document.getElementById('btn-export-pdf').getAttribute('aria-label');
        if (labelOf() !== 'Exporter' || ariaOf() !== 'Exporter') bad.push('titre français=' + labelOf() + ' / ' + ariaOf());
        const en = await inLang('en', async () => ({ label: labelOf(), aria: ariaOf() }));
        if (en.label !== 'Export' || en.aria !== 'Export') bad.push('titre anglais=' + JSON.stringify(en));
        const present = allIds.filter(id => document.querySelector(EXPORT_FLYOUT + ' #' + id));
        if (present.join() !== allIds.join()) bad.push('lignes présentes=' + present.join());
        const doc = { pdf: 'v2-btn-export-pdf,v2-btn-export-pdf-batch,v2-btn-export-pdf-merged,v2-btn-export-pdf-sheets', docx: 'v2-btn-export-docx,v2-btn-export-docx-batch' };
        if (shownIds().join() !== doc.pdf) bad.push('PDF : ' + shownIds().join());
        await pickType('docx');
        if (shownIds().join() !== doc.docx) bad.push('Word : ' + shownIds().join());
        const words = { fr: ['Exporter en DOCX (bêta)…', 'Exporter les lignes en DOCX (ZIP)…'], en: ['Export to DOCX (beta)…', 'Export rows to DOCX (ZIP)…'] };
        const texts = lang => inLang(lang, async () => Array.from(document.querySelectorAll(EXPORT_FLYOUT + ' .v2-hover-row')).filter(row => !row.hidden).map(row => row.textContent.trim()));
        if (JSON.stringify(await texts('fr')) !== JSON.stringify(words.fr)) bad.push('Word en français=' + JSON.stringify(await texts('fr')));
        if (JSON.stringify(await texts('en')) !== JSON.stringify(words.en)) bad.push('Word en anglais=' + JSON.stringify(await texts('en')));
        await pickType('pdf');
        const pdfWords = { fr: ['Exporter en PDF', 'Exporter les lignes (ZIP)…', 'Exporter les lignes en un seul PDF…', 'Assemblage avant impression…'], en: ['Export to PDF', 'Export rows (ZIP)…', 'Export rows as a single PDF…', 'Assemble before printing…'] };
        if (JSON.stringify(await texts('fr')) !== JSON.stringify(pdfWords.fr)) bad.push('PDF en français=' + JSON.stringify(await texts('fr')));
        if (JSON.stringify(await texts('en')) !== JSON.stringify(pdfWords.en)) bad.push('PDF en anglais=' + JSON.stringify(await texts('en')));
        await enterGrid(h);
        await pickType('xlsx');
        if (typeSelect().value !== 'xlsx') bad.push('Excel non choisi dans une grille');
        if (shownIds().join() !== 'v2-btn-export-xlsx,v2-btn-export-xlsx-batch,v2-btn-export-xlsx-single') bad.push('Excel : ' + shownIds().join());
        const xlsxWords = { fr: ['Exporter en Excel…', 'Exporter les valeurs de la table en Excel (ZIP)…', 'Exporter les valeurs de la table dans un seul classeur…'], en: ['Export to Excel…', 'Export table values to Excel (ZIP)…', 'Export table values to a single workbook…'] };
        if (JSON.stringify(await texts('fr')) !== JSON.stringify(xlsxWords.fr)) bad.push('Excel en français=' + JSON.stringify(await texts('fr')));
        if (JSON.stringify(await texts('en')) !== JSON.stringify(xlsxWords.en)) bad.push('Excel en anglais=' + JSON.stringify(await texts('en')));
        await pickType('pdf');
        const gridPdf = { fr: ['Exporter en PDF', 'Exporter les valeurs de la table (ZIP)…', 'Exporter les valeurs de la table en un seul PDF…', 'Assemblage avant impression…'] };
        if (JSON.stringify(await texts('fr')) !== JSON.stringify(gridPdf.fr)) bad.push('PDF d\'une grille=' + JSON.stringify(await texts('fr')));
        const present2 = allIds.filter(id => document.querySelector(EXPORT_FLYOUT + ' #' + id));
        if (present2.join() !== allIds.join()) bad.push('lignes présentes dans une grille=' + present2.join());
      } finally { await reset(h); }
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    },
  });

  cases.push({
    id: 'exporttype_export_button_exports_the_displayed_row_in_the_chosen_type',
    description: 'Le bouton Exporter exporte la ligne affichée dans le type choisi : PDF vectoriel, PDF « Léger » (images ramenées), impression navigateur, Word dans un document, Excel dans une grille ; un seul export par clic, jamais un autre type, et le verrou est rendu',
    run: async (h) => {
      await seed(h);
      await reset(h);
      const spies = spyOnEngines();
      const bad = [];
      const expect = (label, want) => {
        const got = { pdf: spies.calls.pdf.join(), print: spies.calls.print, docx: spies.calls.docx, xlsx: spies.calls.xlsx };
        if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(label + ' : ' + JSON.stringify(got) + ' au lieu de ' + JSON.stringify(want));
        spies.calls.pdf.length = 0; spies.calls.print = 0; spies.calls.docx = 0; spies.calls.xlsx = 0;
      };
      try {
        await clickAndWait('btn-export-pdf', spies);
        expect('PDF vectoriel', { pdf: 'native', print: 0, docx: 0, xlsx: 0 });
        await pickQuality('light');
        await clickAndWait('btn-export-pdf', spies);
        expect('PDF Léger', { pdf: 'light', print: 0, docx: 0, xlsx: 0 });
        await pickQuality('browser-print');
        await clickAndWait('btn-export-pdf', spies);
        expect('impression navigateur', { pdf: '', print: 1, docx: 0, xlsx: 0 });
        await pickQuality('native');
        await pickType('docx');
        await clickAndWait('btn-export-pdf', spies);
        expect('Word', { pdf: '', print: 0, docx: 1, xlsx: 0 });
        await pickType('pdf');
        await enterGrid(h);
        await pickType('xlsx');
        await clickAndWait('btn-export-pdf', spies);
        expect('Excel', { pdf: '', print: 0, docx: 0, xlsx: 1 });
        await pickType('pdf');
        await clickAndWait('btn-export-pdf', spies);
        expect('PDF d\'une grille', { pdf: 'native', print: 0, docx: 0, xlsx: 0 });
        if (document.getElementById('btn-export-pdf').style.pointerEvents !== '') bad.push('bouton Exporter resté verrouillé');
      } finally { spies.restore(); await reset(h); }
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    },
  });

  cases.push({
    id: 'exporttype_a_type_the_model_cannot_do_falls_back_to_pdf_and_stays_there',
    description: 'Word choisi puis une grille ouverte : le type revient au PDF (ligne PDF active, Word grisé, bouton Exporter = PDF) et le document suivant ne le rend pas à Word ; Excel choisi dans une grille puis un document ouvert : de même',
    run: async (h) => {
      await seed(h);
      await reset(h);
      const spies = spyOnEngines();
      const bad = [];
      try {
        await pickType('docx');
        await enterGrid(h);
        if (typeSelect().value !== 'pdf' || !typeRow('pdf').classList.contains('is-active') || !greyed(typeRow('docx')) || !live(typeRow('xlsx'))) bad.push('grille après Word : ' + typeSelect().value + ' / ' + typeRow('docx').className);
        if (document.getElementById('v2-btn-quality').classList.contains('active')) bad.push('bouton allumé dans une grille avec le PDF');
        await clickAndWait('btn-export-pdf', spies);
        if (spies.calls.pdf.length !== 1 || spies.calls.docx || spies.calls.xlsx) bad.push('l\'export de la grille n\'est pas un PDF : ' + JSON.stringify(spies.calls));
        await leaveGrid(h);
        if (typeSelect().value !== 'pdf') bad.push('Word retrouvé au document suivant : ' + typeSelect().value);
        await enterGrid(h);
        await pickType('xlsx');
        await leaveGrid(h);
        if (typeSelect().value !== 'pdf' || !live(typeRow('docx')) || !greyed(typeRow('xlsx'))) bad.push('document après Excel : ' + typeSelect().value);
        if (shownIds().join() !== 'v2-btn-export-pdf,v2-btn-export-pdf-batch,v2-btn-export-pdf-merged,v2-btn-export-pdf-sheets') bad.push('lignes du menu Exporter=' + shownIds().join());
        // Même un appel direct (la liste cachée posée de l'extérieur) ne fait pas exporter un type que le modèle ne sait pas faire.
        typeSelect().value = 'xlsx';
        spies.calls.pdf.length = 0;
        await clickAndWait('btn-export-pdf', spies);
        if (spies.calls.xlsx || spies.calls.pdf.length !== 1) bad.push('Excel exporté depuis un document : ' + JSON.stringify(spies.calls));
      } finally { spies.restore(); await reset(h); }
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    },
  });

  cases.push({
    id: 'exporttype_every_export_of_before_is_still_there_and_launches_the_same_export',
    description: 'Aucune fonction perdue : les neuf lignes d\'export d\'avant (PDF seul par le bouton, ZIP, PDF unique, assemblage, Word et son ZIP, Excel, son ZIP, son classeur unique) gardent leur identifiant et lancent le même export ; la ligne « Exporter en PDF » du menu fait comme le bouton',
    run: async (h) => {
      await seed(h);
      await reset(h);
      const spies = spyOnEngines();
      const bad = [];
      const dialogs = h.stubDialogs({ confirm: false });
      // Une ligne de lot pose sa confirmation avant de rien générer : la poser une fois (refusée ici) prouve que la ligne est câblée à son export.
      const confirmsAfter = async id => {
        const before = dialogs.asked.length;
        document.getElementById(id).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        for (let i = 0; i < 60 && dialogs.asked.length === before; i++) await sleep(50);
        await sleep(30);
        return dialogs.asked.slice(before).map(a => a.message);
      };
      try {
        const zip = await confirmsAfter('v2-btn-export-pdf-batch');
        if (zip.length !== 1 || !/PDF/.test(zip[0])) bad.push('ZIP de PDF=' + JSON.stringify(zip));
        const merged = await confirmsAfter('v2-btn-export-pdf-merged');
        if (merged.length !== 1 || !/PDF/.test(merged[0])) bad.push('PDF unique=' + JSON.stringify(merged));
        const wordZip = await confirmsAfter('v2-btn-export-docx-batch');
        if (wordZip.length !== 1 || !/DOCX/.test(wordZip[0])) bad.push('ZIP de Word=' + JSON.stringify(wordZip));
        await clickAndWait('v2-btn-export-pdf', spies);
        if (spies.calls.pdf.join() !== 'native' || spies.total() !== 1) bad.push('ligne « Exporter en PDF » : ' + JSON.stringify(spies.calls));
        spies.calls.pdf.length = 0;
        await pickQuality('browser-print');
        await clickAndWait('v2-btn-export-pdf', spies);
        if (spies.calls.print !== 1 || spies.calls.pdf.length) bad.push('ligne « Exporter en PDF » en impression navigateur : ' + JSON.stringify(spies.calls));
        spies.calls.print = 0;
        await pickQuality('native');
        await clickAndWait('v2-btn-export-docx', spies);
        if (spies.calls.docx !== 1 || spies.total() !== 1) bad.push('ligne Word : ' + JSON.stringify(spies.calls));
        spies.calls.docx = 0;
        const grey = ['v2-btn-export-xlsx', 'v2-btn-export-xlsx-batch', 'v2-btn-export-xlsx-single'].map(id => greyed(document.getElementById(id)));
        if (grey.some(g => !g)) bad.push('lignes Excel d\'un document non grisées=' + grey.join());
        await enterGrid(h);
        const xlsxZip = await confirmsAfter('v2-btn-export-xlsx-batch');
        if (xlsxZip.length !== 1 || !/Excel/.test(xlsxZip[0])) bad.push('ZIP d\'Excel=' + JSON.stringify(xlsxZip));
        const xlsxSingle = await confirmsAfter('v2-btn-export-xlsx-single');
        if (xlsxSingle.length !== 1 || !/Excel/.test(xlsxSingle[0])) bad.push('classeur unique=' + JSON.stringify(xlsxSingle));
        await clickAndWait('v2-btn-export-xlsx', spies);
        if (spies.calls.xlsx !== 1 || spies.total() !== 1) bad.push('ligne Excel : ' + JSON.stringify(spies.calls));
        const greyWord = ['v2-btn-export-docx', 'v2-btn-export-docx-batch'].map(id => greyed(document.getElementById(id)));
        if (greyWord.some(g => !g)) bad.push('lignes Word d\'une grille non grisées=' + greyWord.join());
        if (document.getElementById('v2-btn-export-pdf-sheets') === null) bad.push('ligne d\'assemblage absente');
      } finally { dialogs.restore(); spies.restore(); await reset(h); }
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.exportType = cases;
})();
