// Suite "exportType" - le menu « Type d'export » (ex-« Qualité PDF », #v2-btn-quality) et le menu du bouton Exporter (#btn-export-pdf, #v2-export-pdf-flyout). Demande d'Antoine du 12/10 :
// « le bouton qualité PDF doit devenir le choix pour le type d'export » (PDF, Word, Excel, avec les options de chacun), « une seule ligne ou toutes les lignes » (+ le classeur unique pour
// l'Excel, l'assemblage pour le PDF), le menu du bouton d'export s'appelle « Exporter » ; « attention à ne pas perdre de features » ; puis, du même jour : « le sous-menu qualité PDF ne
// pourrait apparaître que quand on sélectionne PDF », « il ne doit y avoir dans le menu du bouton Exporter que les options de lignes/classeur » (pas d'« Exporter en docx »), « le bouton
// Exporter, c'est le toggle du choix : quand on met toutes les lignes, le bouton par défaut devient toutes les lignes, avec une petite coche devant ».
// Ce que la suite garde :
//  1) le menu Type : six lignes (PDF, PDF protégé, Word, Excel, Markdown, Markdown (modèle)), leurs noms français et anglais, la ligne du type choisi active, Word, Markdown et Markdown (modèle) grisés dans une grille et Excel grisé dans un document (jamais retiré) ;
//     la qualité du PDF (intitulé, filet, trois lignes) n'est montrée que pour les deux PDF ; la qualité choisie est gardée et revient avec le PDF ; le PDF protégé a sa suite : groupe pdfProtection ;
//  2) le menu Exporter : titre « Exporter » (« Export »), rien que les options de lignes et de classeur du type choisi (PDF : une seule ligne, toutes les lignes en ZIP, en un seul PDF,
//     l'assemblage ; Word et Markdown : une seule ligne, ZIP ; Excel : une seule ligne, ZIP, un seul classeur), aucune ligne qui nomme un format, la coche DEVANT l'option cochée ;
//  3) cliquer une option (ou Entrée, Espace) la coche et n'exporte rien ; le bouton Exporter lance l'option cochée dans le type choisi : la ligne affichée (PDF, impression navigateur, PDF
//     « Léger », Word, Excel, Markdown) ou le lot avec sa confirmation (ou la fenêtre de l'assemblage) ;
//  4) une option que le type n'a pas retombe sur « toutes les lignes (ZIP) » et revient avec son type ; une valeur étrangère vaut « une seule ligne » ;
//  5) un type que le modèle ne sait pas faire revient au PDF (Word ou Markdown vers une grille, Excel vers un document) et n'est pas retrouvé au modèle suivant ;
//  6) rien n'est perdu : chacune des neuf lignes d'export d'avant garde son identifiant (masquée, dans #v2-export-legacy-rows), son grisé et lance le même export ; « Exporter en PDF » aussi.
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
  const linesSelect = () => document.getElementById('v2-export-lines');
  const typeRow = type => document.querySelector(TYPE_FLYOUT + ' .v2-hover-row[data-export-type="' + type + '"]');
  const qualityRow = quality => document.querySelector(TYPE_FLYOUT + ' .v2-hover-row[data-quality="' + quality + '"]');
  const linesRow = lines => document.querySelector(EXPORT_FLYOUT + ' .v2-hover-row[data-export-lines="' + lines + '"]');
  const greyed = row => row.classList.contains('v2-hover-row-disabled') && row.getAttribute('aria-disabled') === 'true';
  const live = row => !row.classList.contains('v2-hover-row-disabled') && row.getAttribute('aria-disabled') === null;
  // « Montré » : ni la ligne ni un parent n'est `hidden` (le panneau lui-même n'apparaît qu'au survol, on ne lit donc pas sa mise en page).
  const shown = el => el.closest('[hidden]') === null;
  const shownRows = flyout => Array.from(document.querySelectorAll(flyout + ' .v2-hover-row')).filter(shown);
  const shownLines = () => shownRows(EXPORT_FLYOUT).map(row => row.dataset.exportLines).join();
  const tickedLines = () => Array.from(document.querySelectorAll(EXPORT_FLYOUT + ' .v2-hover-row[aria-checked="true"]')).map(row => row.dataset.exportLines).join();
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
  const pickLines = async lines => { linesRow(lines).click(); await sleep(20); };
  // Remet le menu d'avant : PDF vectoriel, une seule ligne, dans un document.
  async function reset(h) {
    await leaveGrid(h);
    typeSelect().value = 'pdf';
    qualitySelect().value = 'native';
    linesSelect().value = 'one';
    await pickType('pdf');
    await pickQuality('native');
    await pickLines('one');
  }

  // Les cinq moteurs que le bouton Exporter appelle pour une ligne, remplacés par des espions qui rendent aussitôt : `calls` note qui a été appelé (et avec quelle qualité d'image pour le PDF).
  function spyOnEngines() {
    const calls = { pdf: [], print: 0, docx: 0, xlsx: 0, md: 0 };
    const orig = { pdf: PdfExport.exportCurrentRecord, print: PrintExport.printRecord, docx: DocxExport.exportCurrentRecord, xlsx: XlsxExport.exportCurrentRecord, md: MarkdownExport.exportCurrentRecord };
    PdfExport.exportCurrentRecord = async (...args) => { calls.pdf.push(args[7]); };
    PrintExport.printRecord = async () => { calls.print++; };
    DocxExport.exportCurrentRecord = async () => { calls.docx++; };
    XlsxExport.exportCurrentRecord = async () => { calls.xlsx++; };
    MarkdownExport.exportCurrentRecord = async () => { calls.md++; };
    return {
      calls,
      total: () => calls.pdf.length + calls.print + calls.docx + calls.xlsx + calls.md,
      restore() { PdfExport.exportCurrentRecord = orig.pdf; PrintExport.printRecord = orig.print; DocxExport.exportCurrentRecord = orig.docx; XlsxExport.exportCurrentRecord = orig.xlsx; MarkdownExport.exportCurrentRecord = orig.md; },
    };
  }
  // Le lot : sa confirmation est refusée (rien n'est généré, la question suffit à prouver quel lot part) et la fenêtre de l'assemblage est remplacée par un espion qui renonce.
  function spyOnBatches(h) {
    const dialogs = h.stubDialogs({ confirm: false });
    const sheets = [];
    const realOpen = SheetAssemblyDialog.open;
    SheetAssemblyDialog.open = async context => { sheets.push(context); return null; };
    return {
      confirms: since => dialogs.asked.slice(since || 0).filter(a => a.kind === 'confirm').map(a => a.message),
      asked: () => dialogs.asked.length,
      sheets,
      restore() { dialogs.restore(); SheetAssemblyDialog.open = realOpen; },
    };
  }
  // Clique le bouton (ou la ligne) et attend ce qu'il lance : un moteur appelé, une confirmation posée ou la fenêtre de l'assemblage, puis le verrou rendu. Rend ce qui est arrivé.
  async function clickAndWait(id, spies, batches) {
    const before = { engines: spies.total(), asked: batches ? batches.asked() : 0, sheets: batches ? batches.sheets.length : 0 };
    document.getElementById(id).click();
    const moved = () => spies.total() !== before.engines || (batches && (batches.asked() !== before.asked || batches.sheets.length !== before.sheets));
    for (let i = 0; i < 80 && !moved(); i++) await sleep(50);
    for (let i = 0; i < 40 && document.getElementById('btn-export-pdf').style.pointerEvents === 'none'; i++) await sleep(50);
    await sleep(30);
    return { engines: spies.total() - before.engines, confirms: batches ? batches.confirms(before.asked) : [], sheets: batches ? batches.sheets.slice(before.sheets) : [] };
  }
  const result = bad => ({ pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' });

  cases.push({
    id: 'exporttype_menu_lists_pdf_word_excel_and_shows_the_pdf_quality_only_for_pdf',
    description: 'Le menu du bouton à gauche d\'Exporter s\'appelle « Type d\'export » et a six lignes de type (PDF, PDF protégé, Word, Excel, Markdown, Markdown (modèle)) nommées en français et en anglais ; la qualité du PDF (intitulé, filet, Vectoriel, Impression navigateur, Léger) n\'est montrée que pour les deux PDF ; au départ PDF et Vectoriel sont les lignes actives, Excel est grisé dans un document',
    run: async (h) => {
      await seed(h);
      await reset(h);
      const bad = [];
      try {
        const flyout = document.querySelector(TYPE_FLYOUT);
        const labels = () => Array.from(flyout.querySelectorAll('.v2-hover-flyout-label')).filter(shown).map(el => el.textContent.trim());
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
        const wantFr = { label: 'Type d’export', aria: 'Type d’export', types: ['PDF', 'PDF protégé', 'Word (bêta)', 'Excel', 'Markdown', 'Markdown (modèle)'], qualityLabel: 'Qualité PDF', qualities: ['Vectoriel (par défaut)', 'Impression navigateur', 'Léger (images réduites)'], options: ['PDF', 'PDF protégé', 'Word (bêta)', 'Excel', 'Markdown', 'Markdown (modèle)'] };
        const wantEn = { label: 'Export type', aria: 'Export type', types: ['PDF', 'Protected PDF', 'Word (beta)', 'Excel', 'Markdown', 'Markdown (template)'], qualityLabel: 'PDF quality', qualities: ['Vector (default)', 'Browser print', 'Light (smaller images)'], options: ['PDF', 'Protected PDF', 'Word (beta)', 'Excel', 'Markdown', 'Markdown (template)'] };
        if (JSON.stringify(fr) !== JSON.stringify(wantFr)) bad.push('français=' + JSON.stringify(fr));
        if (JSON.stringify(en) !== JSON.stringify(wantEn)) bad.push('anglais=' + JSON.stringify(en));
        const order = Array.from(flyout.querySelectorAll('.v2-hover-row')).map(row => row.dataset.exportType || row.dataset.quality).join();
        if (order !== 'pdf,pdfProtected,docx,xlsx,md,mdTemplate,native,browser-print,light') bad.push('ordre=' + order);
        const active = Array.from(flyout.querySelectorAll('.v2-hover-row.is-active')).map(row => row.dataset.exportType || row.dataset.quality).join();
        if (active !== 'pdf,native') bad.push('lignes actives=' + active);
        if (!live(typeRow('pdf')) || !live(typeRow('pdfProtected')) || !live(typeRow('docx')) || !live(typeRow('md')) || !live(typeRow('mdTemplate')) || !greyed(typeRow('xlsx'))) bad.push('grisés dans un document : ' + JSON.stringify(['pdf', 'pdfProtected', 'docx', 'xlsx', 'md', 'mdTemplate'].map(t => typeRow(t).className)));
        if (!['native', 'browser-print', 'light'].every(q => live(qualityRow(q)))) bad.push('qualités grisées pour le PDF');
        if (document.getElementById('v2-btn-quality').classList.contains('active')) bad.push('bouton allumé pour le PDF');
        // Pour le PDF : les deux intitulés, le filet et les trois lignes de qualité sont montrés.
        if (JSON.stringify(labels()) !== JSON.stringify(['Type d’export', 'Qualité PDF'])) bad.push('intitulés montrés pour le PDF=' + JSON.stringify(labels()));
        if (!Array.from(flyout.querySelectorAll('.v2-hover-hsep')).every(shown)) bad.push('filet masqué pour le PDF');
        if (shownRows(TYPE_FLYOUT).length !== 9) bad.push('lignes montrées pour le PDF=' + shownRows(TYPE_FLYOUT).length);
        // Pour Word : seulement les six types ; la qualité (intitulé, filet, lignes) n'est pas montrée, mais reste dans la page.
        await pickType('docx');
        if (JSON.stringify(labels()) !== JSON.stringify(['Type d’export'])) bad.push('intitulés montrés avec Word=' + JSON.stringify(labels()));
        if (Array.from(flyout.querySelectorAll('.v2-hover-hsep')).some(shown)) bad.push('filet montré avec Word');
        const wordRows = shownRows(TYPE_FLYOUT).map(row => row.dataset.exportType || row.dataset.quality).join();
        if (wordRows !== 'pdf,pdfProtected,docx,xlsx,md,mdTemplate') bad.push('lignes montrées avec Word=' + wordRows);
        if (flyout.querySelectorAll('.v2-hover-row[data-quality]').length !== 3) bad.push('une ligne de qualité a été retirée de la page');
        // Pour Excel (dans une grille) : de même.
        await pickType('pdf');
        await enterGrid(h);
        await pickType('xlsx');
        if (JSON.stringify(labels()) !== JSON.stringify(['Type d’export']) || shownRows(TYPE_FLYOUT).length !== 6) bad.push('menu avec Excel : ' + JSON.stringify(labels()) + ' / ' + shownRows(TYPE_FLYOUT).length + ' lignes');
        // Dans une grille, Word et les deux Markdown sont grisés (jamais retirés) ; Excel, les deux PDF ne le sont pas.
        if (!greyed(typeRow('docx')) || !greyed(typeRow('md')) || !greyed(typeRow('mdTemplate')) || !live(typeRow('xlsx')) || !live(typeRow('pdf')) || !live(typeRow('pdfProtected'))) bad.push('grisés dans une grille : ' + JSON.stringify(['pdf', 'pdfProtected', 'docx', 'xlsx', 'md', 'mdTemplate'].map(t => typeRow(t).className)));
        await pickType('md');
        if (typeSelect().value !== 'xlsx') bad.push('Markdown grisé a été choisi dans une grille : ' + typeSelect().value);
        await pickType('mdTemplate');
        if (typeSelect().value !== 'xlsx') bad.push('Markdown (modèle) grisé a été choisi dans une grille : ' + typeSelect().value);
        await pickType('pdf');
        if (shownRows(TYPE_FLYOUT).length !== 9 || labels().length !== 2) bad.push('retour au PDF : ' + shownRows(TYPE_FLYOUT).length + ' lignes, ' + labels().length + ' intitulés');
      } finally { await reset(h); }
      return result(bad);
    },
  });

  cases.push({
    id: 'exporttype_choosing_a_type_marks_it_hides_the_pdf_quality_and_keeps_it_for_the_pdf',
    description: 'Choisir Word marque sa ligne, allume le bouton du type et cache la qualité du PDF (la qualité choisie est gardée, un clic dessus ne change rien) ; choisir Excel dans un document ne fait rien ; revenir au PDF rend la qualité choisie, montrée et active',
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
        if (!['native', 'browser-print', 'light'].every(q => !shown(qualityRow(q)) && greyed(qualityRow(q)))) bad.push('qualités encore montrées ou non grisées avec Word');
        await pickQuality('native');
        if (qualitySelect().value !== 'light') bad.push('un clic sur une qualité cachée a changé la qualité : ' + qualitySelect().value);
        await pickType('pdf');
        if (typeSelect().value !== 'pdf' || button.classList.contains('active')) bad.push('retour au PDF : ' + typeSelect().value + ' / bouton allumé ' + button.classList.contains('active'));
        const back = Array.from(document.querySelectorAll(TYPE_FLYOUT + ' .v2-hover-row.is-active')).map(row => row.dataset.exportType || row.dataset.quality).join();
        if (back !== 'pdf,light') bad.push('lignes actives au retour=' + back);
        if (!['native', 'browser-print', 'light'].every(q => shown(qualityRow(q)) && live(qualityRow(q)))) bad.push('qualités cachées ou grisées au retour du PDF');
        // Markdown : même chose que Word (ligne active, bouton allumé, qualité du PDF cachée mais gardée).
        await pickType('md');
        if (typeSelect().value !== 'md') bad.push('Markdown non choisi : ' + typeSelect().value);
        const activeMd = Array.from(document.querySelectorAll(TYPE_FLYOUT + ' .v2-hover-row.is-active')).map(row => row.dataset.exportType || row.dataset.quality).join();
        if (activeMd !== 'md') bad.push('lignes actives avec Markdown=' + activeMd);
        if (!button.classList.contains('active')) bad.push('bouton du type non allumé avec Markdown');
        if (!['native', 'browser-print', 'light'].every(q => !shown(qualityRow(q)) && greyed(qualityRow(q)))) bad.push('qualités encore montrées ou non grisées avec Markdown');
        if (qualitySelect().value !== 'light') bad.push('la qualité du PDF n\'a pas été gardée avec Markdown : ' + qualitySelect().value);
        await pickType('pdf');
        if (typeSelect().value !== 'pdf' || button.classList.contains('active')) bad.push('retour au PDF après Markdown : ' + typeSelect().value);
      } finally { await reset(h); }
      return result(bad);
    },
  });

  cases.push({
    id: 'exporttype_export_menu_has_only_the_lines_and_workbook_options_with_the_check_in_front',
    description: 'Le menu du bouton Exporter a pour titre « Exporter » (« Export ») et, rien d\'autre que les options de lignes et de classeur du type choisi : PDF (une seule ligne, toutes les lignes en ZIP, en un seul PDF, assemblage), Word (une seule ligne, ZIP), Excel dans une grille (une seule ligne, ZIP, un seul classeur), en français et en anglais, sans aucune ligne « Exporter en… » ; la coche est devant l\'option cochée (« une seule ligne » au départ)',
    run: async (h) => {
      await seed(h);
      await reset(h);
      const bad = [];
      const legacyIds = ['v2-btn-export-pdf', 'v2-btn-export-docx', 'v2-btn-export-xlsx', 'v2-btn-export-pdf-batch', 'v2-btn-export-pdf-merged', 'v2-btn-export-pdf-sheets', 'v2-btn-export-docx-batch', 'v2-btn-export-xlsx-batch', 'v2-btn-export-xlsx-single'];
      try {
        const labelOf = () => document.querySelector(EXPORT_FLYOUT + ' .v2-hover-flyout-label').textContent.trim();
        const ariaOf = () => document.getElementById('btn-export-pdf').getAttribute('aria-label');
        if (labelOf() !== 'Exporter' || ariaOf() !== 'Exporter') bad.push('titre français=' + labelOf() + ' / ' + ariaOf());
        const en = await inLang('en', async () => ({ label: labelOf(), aria: ariaOf() }));
        if (en.label !== 'Export' || en.aria !== 'Export') bad.push('titre anglais=' + JSON.stringify(en));
        const texts = lang => inLang(lang, async () => shownRows(EXPORT_FLYOUT).map(row => row.textContent.trim()));
        const expectTexts = async (label, fr, enTexts) => {
          if (JSON.stringify(await texts('fr')) !== JSON.stringify(fr)) bad.push(label + ' en français=' + JSON.stringify(await texts('fr')));
          if (JSON.stringify(await texts('en')) !== JSON.stringify(enTexts)) bad.push(label + ' en anglais=' + JSON.stringify(await texts('en')));
        };
        // Aucune ligne montrée ne porte l'identifiant ni le nom d'un export d'avant : le menu ne dit que les lignes exportées.
        const noOldRow = label => {
          const olds = legacyIds.filter(id => { const row = document.getElementById(id); return !row || shown(row); });
          if (olds.length) bad.push(label + ' : anciennes lignes montrées ou absentes=' + olds.join());
          const named = shownRows(EXPORT_FLYOUT).filter(row => /Exporter en|Export to|DOCX|Excel…|PDF…/.test(row.textContent));
          if (named.length) bad.push(label + ' : ligne qui nomme un format=' + named.map(row => row.textContent.trim()).join('|'));
        };
        // PDF, dans un document.
        if (shownLines() !== 'one,zip,merged,sheets') bad.push('PDF : ' + shownLines());
        noOldRow('PDF');
        await expectTexts('PDF', ['Une seule ligne', 'Toutes les lignes (ZIP)', 'Toutes les lignes en un seul PDF', 'Assemblage avant impression'], ['A single row', 'All rows (ZIP)', 'All rows as a single PDF', 'Assemble before printing']);
        // La coche : devant l'option cochée seulement, visible ; la place de la coche est réservée sur chaque option (les libellés restent alignés).
        if (tickedLines() !== 'one') bad.push('option cochée au départ=' + tickedLines());
        const tickOf = row => { const s = getComputedStyle(row, '::before'); return { visibility: s.visibility, width: s.width, content: s.content, display: getComputedStyle(row).display }; };
        const t1 = tickOf(linesRow('one'));
        const t2 = tickOf(linesRow('zip'));
        if (t1.visibility !== 'visible' || t1.width !== '13px' || t1.content === 'none' || t1.display !== 'flex') bad.push('coche de l\'option cochée=' + JSON.stringify(t1));
        if (t2.visibility !== 'hidden' || t2.width !== '13px') bad.push('place de la coche sur une option non cochée=' + JSON.stringify(t2));
        const roles = shownRows(EXPORT_FLYOUT).map(row => row.getAttribute('role') + ':' + row.getAttribute('aria-checked') + ':' + row.getAttribute('tabindex'));
        if (roles.join() !== 'menuitemradio:true:0,menuitemradio:false:0,menuitemradio:false:0,menuitemradio:false:0') bad.push('rôles=' + roles.join());
        if (document.querySelector(EXPORT_FLYOUT).getAttribute('role') !== 'menu') bad.push('le menu n\'a pas le rôle « menu »');
        // Word.
        await pickType('docx');
        if (shownLines() !== 'one,zip') bad.push('Word : ' + shownLines());
        noOldRow('Word');
        await expectTexts('Word', ['Une seule ligne', 'Toutes les lignes (ZIP)'], ['A single row', 'All rows (ZIP)']);
        // Markdown : les mêmes deux options que Word (un fichier .md, ou un par ligne dans un ZIP).
        await pickType('md');
        if (shownLines() !== 'one,zip') bad.push('Markdown : ' + shownLines());
        noOldRow('Markdown');
        await expectTexts('Markdown', ['Une seule ligne', 'Toutes les lignes (ZIP)'], ['A single row', 'All rows (ZIP)']);
        // PDF dans une grille : les lots parlent de « valeurs de la table ».
        await pickType('pdf');
        await enterGrid(h);
        if (shownLines() !== 'one,zip,merged,sheets') bad.push('PDF d\'une grille : ' + shownLines());
        noOldRow('PDF d\'une grille');
        await expectTexts('PDF d\'une grille', ['Une seule ligne', 'Toutes les valeurs de la table (ZIP)', 'Toutes les valeurs de la table en un seul PDF', 'Assemblage avant impression'], ['A single row', 'All table values (ZIP)', 'All table values as a single PDF', 'Assemble before printing']);
        // Excel, dans une grille.
        await pickType('xlsx');
        if (typeSelect().value !== 'xlsx') bad.push('Excel non choisi dans une grille');
        if (shownLines() !== 'one,zip,workbook') bad.push('Excel : ' + shownLines());
        noOldRow('Excel');
        await expectTexts('Excel', ['Une seule ligne', 'Toutes les valeurs de la table (ZIP)', 'Toutes les valeurs de la table dans un seul classeur'], ['A single row', 'All table values (ZIP)', 'All table values in a single workbook']);
        await pickType('pdf');
        await leaveGrid(h);
        // Le même menu dans un document retrouve les mots du document.
        await expectTexts('PDF après la grille', ['Une seule ligne', 'Toutes les lignes (ZIP)', 'Toutes les lignes en un seul PDF', 'Assemblage avant impression'], ['A single row', 'All rows (ZIP)', 'All rows as a single PDF', 'Assemble before printing']);
      } finally { await reset(h); }
      return result(bad);
    },
  });

  cases.push({
    id: 'exporttype_ticking_an_option_only_ticks_it_and_exports_nothing',
    description: 'Un clic sur une option du menu Exporter (ou Entrée, Espace) la coche et décoche l\'autre, garde le choix dans la liste cachée, n\'exporte rien et ne pose aucune question ; recliquer l\'option cochée la laisse cochée',
    run: async (h) => {
      await seed(h);
      await reset(h);
      const spies = spyOnEngines();
      const batches = spyOnBatches(h);
      const bad = [];
      try {
        await pickLines('zip');
        if (linesSelect().value !== 'zip' || tickedLines() !== 'zip' || linesRow('one').getAttribute('aria-checked') !== 'false') bad.push('« ZIP » non coché : ' + linesSelect().value + ' / ' + tickedLines());
        await pickLines('merged');
        if (linesSelect().value !== 'merged' || tickedLines() !== 'merged') bad.push('« un seul PDF » non coché : ' + linesSelect().value + ' / ' + tickedLines());
        await pickLines('merged');
        if (linesSelect().value !== 'merged' || tickedLines() !== 'merged') bad.push('recliquer l\'option cochée l\'a décochée : ' + linesSelect().value + ' / ' + tickedLines());
        await pickLines('sheets');
        if (linesSelect().value !== 'sheets' || tickedLines() !== 'sheets') bad.push('« assemblage » non coché : ' + tickedLines());
        // Au clavier : Entrée, puis Espace (la ligne a le focus clavier, tabindex 0).
        linesRow('zip').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        if (linesSelect().value !== 'zip' || tickedLines() !== 'zip') bad.push('Entrée n\'a pas coché « ZIP » : ' + tickedLines());
        const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
        linesRow('one').dispatchEvent(space);
        if (linesSelect().value !== 'one' || tickedLines() !== 'one') bad.push('Espace n\'a pas coché « une seule ligne » : ' + tickedLines());
        if (!space.defaultPrevented) bad.push('Espace fait défiler la page au lieu de cocher');
        if (spies.total() !== 0 || batches.asked() !== 0 || batches.sheets.length !== 0) bad.push('cocher une option a lancé un export : ' + JSON.stringify({ engines: spies.total(), asked: batches.asked(), sheets: batches.sheets.length }));
        if (document.getElementById('btn-export-pdf').style.pointerEvents === 'none') bad.push('bouton Exporter verrouillé');
      } finally { batches.restore(); spies.restore(); await reset(h); }
      return result(bad);
    },
  });

  cases.push({
    id: 'exporttype_export_button_runs_the_ticked_option_in_the_chosen_type',
    description: 'Le bouton Exporter lance l\'option cochée dans le type choisi : « une seule ligne » exporte la ligne affichée (PDF vectoriel, PDF « Léger », impression navigateur, Word, Excel, Markdown), « toutes les lignes » pose la confirmation du bon lot (ZIP de PDF, un seul PDF, ZIP de Word, ZIP et classeur unique d\'Excel, ZIP de Markdown) ou ouvre la fenêtre de l\'assemblage ; un seul export par clic, jamais un autre, et le verrou est rendu',
    run: async (h) => {
      await seed(h);
      await reset(h);
      const spies = spyOnEngines();
      const batches = spyOnBatches(h);
      const bad = [];
      const run = async (label, want) => {
        const got = await clickAndWait('btn-export-pdf', spies, batches);
        const engines = { pdf: spies.calls.pdf.join(), print: spies.calls.print, docx: spies.calls.docx, xlsx: spies.calls.xlsx, md: spies.calls.md };
        spies.calls.pdf.length = 0; spies.calls.print = 0; spies.calls.docx = 0; spies.calls.xlsx = 0; spies.calls.md = 0;
        const wantEngines = Object.assign({ pdf: '', print: 0, docx: 0, xlsx: 0, md: 0 }, want.engines || {});
        if (JSON.stringify(engines) !== JSON.stringify(wantEngines)) bad.push(label + ' : moteurs ' + JSON.stringify(engines) + ' au lieu de ' + JSON.stringify(wantEngines));
        const confirms = want.confirm ? [want.confirm] : [];
        if (got.confirms.length !== confirms.length || (want.confirm && !want.confirm.test(got.confirms[0]))) bad.push(label + ' : confirmations ' + JSON.stringify(got.confirms) + ' au lieu de ' + String(want.confirm));
        if (got.sheets.length !== (want.sheets ? 1 : 0) || (want.sheets && (got.sheets[0].table !== TABLE || got.sheets[0].count !== NAMES.length || got.sheets[0].grid !== !!want.grid))) bad.push(label + ' : fenêtre de l\'assemblage ' + JSON.stringify(got.sheets));
      };
      try {
        await run('PDF, une ligne', { engines: { pdf: 'native' } });
        await pickQuality('light');
        await run('PDF Léger, une ligne', { engines: { pdf: 'light' } });
        await pickQuality('browser-print');
        await run('impression navigateur, une ligne', { engines: { print: 1 } });
        await pickQuality('native');
        await pickLines('zip');
        await run('PDF, ZIP', { confirm: /^Générer un PDF pour chacune des 3 lignes de « ExpTypeClients » et les regrouper dans une archive ZIP/ });
        await pickLines('merged');
        await run('PDF, un seul PDF', { confirm: /^Générer un PDF pour chacune des 3 lignes de « ExpTypeClients » et les réunir dans un seul fichier PDF/ });
        await pickLines('sheets');
        await run('PDF, assemblage', { sheets: true });
        await pickType('docx');
        // « Un seul PDF » et l'assemblage ne sont pas à Word : l'option retombe sur le ZIP (la liste cachée garde le choix).
        await run('Word, option du PDF → ZIP', { confirm: /^Générer un DOCX pour chacune des 3 lignes de « ExpTypeClients » et les regrouper dans une archive ZIP/ });
        await pickLines('one');
        await run('Word, une ligne', { engines: { docx: 1 } });
        await pickLines('zip');
        await run('Word, ZIP', { confirm: /^Générer un DOCX pour chacune des 3 lignes/ });
        await pickLines('one');
        await pickType('md');
        await run('Markdown, une ligne', { engines: { md: 1 } });
        await pickLines('zip');
        await run('Markdown, ZIP', { confirm: /^Générer un fichier Markdown pour chacune des 3 lignes de « ExpTypeClients » et les regrouper dans une archive ZIP/ });
        await pickLines('sheets');
        await run('Markdown, option du PDF → ZIP', { confirm: /^Générer un fichier Markdown pour chacune des 3 lignes/ });
        await pickLines('one');
        await pickType('pdf');
        await enterGrid(h);
        await run('PDF d\'une grille, une ligne', { engines: { pdf: 'native' } });
        await pickLines('zip');
        await run('PDF d\'une grille, ZIP', { confirm: /^Générer un PDF par valeur de « ExpTypeClients » \(3 valeurs\) et les regrouper dans une archive ZIP/ });
        await pickLines('merged');
        await run('PDF d\'une grille, un seul PDF', { confirm: /^Générer un PDF par valeur de « ExpTypeClients » \(3 valeurs\) et les réunir dans un seul fichier PDF/ });
        await pickLines('sheets');
        await run('PDF d\'une grille, assemblage', { sheets: true, grid: true });
        await pickType('xlsx');
        await pickLines('one');
        await run('Excel, une ligne', { engines: { xlsx: 1 } });
        await pickLines('zip');
        await run('Excel, ZIP', { confirm: /^Générer un classeur Excel par valeur de « ExpTypeClients » \(3 valeurs\) et les regrouper dans une archive ZIP/ });
        await pickLines('workbook');
        await run('Excel, un seul classeur', { confirm: /^Générer un seul classeur Excel, avec une feuille par valeur de « ExpTypeClients » \(3 valeurs\)/ });
        if (document.getElementById('btn-export-pdf').style.pointerEvents !== '') bad.push('bouton Exporter resté verrouillé');
      } finally { batches.restore(); spies.restore(); await reset(h); }
      return result(bad);
    },
  });

  cases.push({
    id: 'exporttype_an_option_the_type_does_not_have_falls_back_to_zip_and_returns_with_its_type',
    description: 'Une option que le type choisi n\'a pas (« un seul PDF » ou l\'assemblage après un passage à Word, le classeur unique après un retour au PDF) est montrée comme « toutes les lignes (ZIP) » cochée et lancée comme telle, sans toucher au choix gardé, qui revient avec son type ; une valeur étrangère vaut « une seule ligne »',
    run: async (h) => {
      await seed(h);
      await reset(h);
      const spies = spyOnEngines();
      const batches = spyOnBatches(h);
      const bad = [];
      try {
        await pickLines('merged');
        await pickType('docx');
        if (tickedLines() !== 'zip' || shownLines() !== 'one,zip') bad.push('Word après « un seul PDF » : coché ' + tickedLines() + ', options ' + shownLines());
        if (linesSelect().value !== 'merged') bad.push('le choix gardé a été touché : ' + linesSelect().value);
        const wordRun = await clickAndWait('btn-export-pdf', spies, batches);
        if (wordRun.confirms.length !== 1 || !/DOCX/.test(wordRun.confirms[0]) || spies.total()) bad.push('bouton avec Word : ' + JSON.stringify(wordRun));
        await pickType('md');
        if (tickedLines() !== 'zip' || shownLines() !== 'one,zip') bad.push('Markdown après « un seul PDF » : coché ' + tickedLines() + ', options ' + shownLines());
        if (linesSelect().value !== 'merged') bad.push('le choix gardé a été touché avec Markdown : ' + linesSelect().value);
        const mdRun = await clickAndWait('btn-export-pdf', spies, batches);
        if (mdRun.confirms.length !== 1 || !/Markdown/.test(mdRun.confirms[0]) || spies.total()) bad.push('bouton avec Markdown : ' + JSON.stringify(mdRun));
        await pickType('pdf');
        if (tickedLines() !== 'merged') bad.push('retour au PDF : coché ' + tickedLines());
        const pdfRun = await clickAndWait('btn-export-pdf', spies, batches);
        if (pdfRun.confirms.length !== 1 || !/un seul fichier PDF/.test(pdfRun.confirms[0])) bad.push('bouton avec le PDF : ' + JSON.stringify(pdfRun));
        // Le classeur unique d'Excel, puis le PDF d'une grille : l'option n'y est pas, c'est le ZIP.
        await enterGrid(h);
        await pickType('xlsx');
        await pickLines('workbook');
        if (tickedLines() !== 'workbook') bad.push('classeur unique non coché : ' + tickedLines());
        await pickType('pdf');
        if (tickedLines() !== 'zip' || shownLines() !== 'one,zip,merged,sheets') bad.push('PDF d\'une grille après le classeur unique : coché ' + tickedLines() + ', options ' + shownLines());
        const gridRun = await clickAndWait('btn-export-pdf', spies, batches);
        if (gridRun.confirms.length !== 1 || !/Générer un PDF par valeur de .* ZIP/.test(gridRun.confirms[0])) bad.push('bouton du PDF d\'une grille : ' + JSON.stringify(gridRun));
        await pickType('xlsx');
        if (tickedLines() !== 'workbook') bad.push('retour à Excel : coché ' + tickedLines());
        await leaveGrid(h);
        // Une valeur étrangère dans la liste cachée (posée de l'extérieur) vaut « une seule ligne », au menu comme au bouton.
        linesSelect().add(new Option('bogus', 'bogus'));
        linesSelect().value = 'bogus';
        document.getElementById('v2-btn-quality').closest('.v2-hover-group').dispatchEvent(new MouseEvent('mouseenter'));
        if (tickedLines() !== 'one') bad.push('valeur étrangère : coché ' + tickedLines());
        spies.calls.pdf.length = 0;
        const junkRun = await clickAndWait('btn-export-pdf', spies, batches);
        if (junkRun.confirms.length || spies.calls.pdf.join() !== 'native') bad.push('bouton avec une valeur étrangère : ' + JSON.stringify(junkRun) + ' / ' + spies.calls.pdf.join());
        linesSelect().querySelector('option[value="bogus"]').remove();
      } finally { batches.restore(); spies.restore(); await reset(h); }
      return result(bad);
    },
  });

  cases.push({
    id: 'exporttype_a_type_the_model_cannot_do_falls_back_to_pdf_and_stays_there',
    description: 'Word (ou Markdown) choisi puis une grille ouverte : le type revient au PDF (ligne PDF active, Word et Markdown grisés, bouton Exporter = PDF) et le document suivant ne le rend pas à Word ; Excel choisi dans une grille puis un document ouvert : de même ; l\'option de lignes cochée est gardée',
    run: async (h) => {
      await seed(h);
      await reset(h);
      const spies = spyOnEngines();
      const bad = [];
      try {
        // Markdown, comme Word, ne sait faire qu'un document : dans une grille il est grisé, le type revient au PDF et le bouton exporte un PDF.
        await pickType('md');
        await enterGrid(h);
        if (typeSelect().value !== 'pdf' || !typeRow('pdf').classList.contains('is-active') || !greyed(typeRow('md')) || typeRow('md').classList.contains('is-active')) bad.push('grille après Markdown : ' + typeSelect().value + ' / ' + typeRow('md').className);
        await clickAndWait('btn-export-pdf', spies);
        if (spies.calls.pdf.length !== 1 || spies.calls.md || spies.calls.docx || spies.calls.xlsx) bad.push('l\'export de la grille après Markdown n\'est pas un PDF : ' + JSON.stringify(spies.calls));
        spies.calls.pdf.length = 0;
        typeSelect().value = 'md';
        await clickAndWait('btn-export-pdf', spies);
        if (spies.calls.md || spies.calls.pdf.length !== 1) bad.push('Markdown exporté depuis une grille : ' + JSON.stringify(spies.calls));
        spies.calls.pdf.length = 0;
        await leaveGrid(h);
        if (typeSelect().value !== 'pdf') bad.push('Markdown retrouvé au document suivant : ' + typeSelect().value);
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
        if (shownLines() !== 'one,zip,merged,sheets') bad.push('options du menu Exporter=' + shownLines());
        // Même un appel direct (la liste cachée posée de l'extérieur) ne fait pas exporter un type que le modèle ne sait pas faire.
        typeSelect().value = 'xlsx';
        spies.calls.pdf.length = 0;
        await clickAndWait('btn-export-pdf', spies);
        if (spies.calls.xlsx || spies.calls.pdf.length !== 1) bad.push('Excel exporté depuis un document : ' + JSON.stringify(spies.calls));
      } finally { spies.restore(); await reset(h); }
      return result(bad);
    },
  });

  cases.push({
    id: 'exporttype_markdown_template_exports_the_model_itself_with_no_row_and_no_lot',
    description: 'Le type « Markdown (modèle) » (Antoine, 12/10 : « laisser le choix à l\'export, dans le menu des types d\'export ») exporte le modèle ouvert, ses variables écrites {{Table.Colonne}} : un seul fichier nommé d\'après le modèle (« publipostage » sans nom), sans ligne ni valeur ni confirmation, même quand « toutes les lignes (ZIP) » est gardé pour un autre type ; le menu Exporter ne montre alors qu\'un mot qui le dit (en français et en anglais) et ne montre plus aucune option de lignes ; il est grisé dans une grille (le type revient au PDF) et dans un macro-modèle, qui n\'a pas de contenu à lui, alors que Markdown (les valeurs d\'une ligne) y reste possible',
    run: async (h) => {
      await seed(h);
      await reset(h);
      // reset() ouvre un document neuf : le contenu à exporter se pose après.
      Editor.setHTML(`<p>Bonjour ${badge('Nom')}, voici votre courrier.</p>`);
      await sleep(80);
      const spies = spyOnEngines();
      const batches = spyOnBatches(h);
      const bad = [];
      const downloads = [];
      const realDownload = ExportCommon.downloadBlob;
      ExportCommon.downloadBlob = (blob, name) => downloads.push({ blob, name });
      const note = () => document.querySelector(EXPORT_FLYOUT + ' .v2-hover-flyout-label[data-export-for="mdTemplate"]');
      const exportWithButton = async () => {
        const before = downloads.length;
        document.getElementById('btn-export-pdf').click();
        for (let i = 0; i < 80 && downloads.length === before; i++) await sleep(50);
        for (let i = 0; i < 40 && document.getElementById('btn-export-pdf').style.pointerEvents === 'none'; i++) await sleep(50);
        await sleep(30);
        return downloads.slice(before);
      };
      const nameInput = document.getElementById('template-name');
      try {
        // « Toutes les lignes (ZIP) » gardé pour Markdown : le modèle ne le suit pas.
        await pickType('md');
        await pickLines('zip');
        await pickType('mdTemplate');
        if (typeSelect().value !== 'mdTemplate' || !typeRow('mdTemplate').classList.contains('is-active') || typeRow('md').classList.contains('is-active')) bad.push('type non choisi : ' + typeSelect().value);
        if (!document.getElementById('v2-btn-quality').classList.contains('active')) bad.push('bouton du type non allumé');
        if (!['native', 'browser-print', 'light'].every(q => !shown(qualityRow(q)) && greyed(qualityRow(q)))) bad.push('qualités du PDF encore montrées ou non grisées');
        // Le menu Exporter : aucune option de lignes, un mot qui dit ce qui part.
        if (shownLines() !== '') bad.push('options de lignes montrées=' + shownLines());
        if (!note() || !shown(note()) || note().textContent.trim() !== 'Un seul fichier : le modèle') bad.push('mot du menu Exporter en français=' + (note() && shown(note()) ? note().textContent.trim() : 'absent'));
        const en = await inLang('en', async () => (note() && shown(note()) ? note().textContent.trim() : 'absent'));
        if (en !== 'One file: the template') bad.push('mot du menu Exporter en anglais=' + en);
        if (linesSelect().value !== 'zip') bad.push('le choix de lignes gardé a été touché : ' + linesSelect().value);
        // La touche du bouton (« (Alt+P) ») va au titre « Exporter » (js/shortcuts.js), pas au mot : il ne nomme pas le bouton.
        const title = document.querySelector(EXPORT_FLYOUT + ' .v2-hover-flyout-label:not([data-export-for])');
        if (!title || title.getAttribute('data-keytip') !== ' (Alt+P)') bad.push('le titre « Exporter » a perdu sa touche : ' + (title && title.getAttribute('data-keytip')));
        if (note() && note().hasAttribute('data-keytip')) bad.push('le mot du menu Exporter porte la touche du bouton : ' + note().getAttribute('data-keytip'));
        // Le bouton Exporter : un fichier, le modèle, sans ligne.
        nameInput.value = 'Contrat / Client';
        const first = await exportWithButton();
        if (first.length !== 1 || first[0].name !== 'Contrat _ Client.md') bad.push('fichier=' + JSON.stringify(first.map(d => d.name)));
        const text = first.length ? await first[0].blob.text() : '';
        if (text !== 'Bonjour {{' + TABLE + '.Nom}}, voici votre courrier.\n') bad.push('texte=' + JSON.stringify(text));
        if (first.length && first[0].blob.type !== 'text/markdown;charset=utf-8') bad.push('type=' + first[0].blob.type);
        if (spies.total() !== 0 || batches.asked() !== 0 || batches.sheets.length !== 0) bad.push('un autre export ou une question est partie : ' + JSON.stringify({ engines: spies.calls, asked: batches.asked() }));
        const status = document.getElementById('status-msg').textContent.trim();
        if (status !== 'Modèle exporté en Markdown, variables comprises.') bad.push('état=' + status);
        nameInput.value = '';
        const second = await exportWithButton();
        if (second.length !== 1 || second[0].name !== 'publipostage.md') bad.push('fichier sans nom=' + JSON.stringify(second.map(d => d.name)));
        // Un autre type : le mot s'en va, les options de lignes reviennent, le choix gardé aussi.
        await pickType('md');
        if (shown(note()) || shownLines() !== 'one,zip' || tickedLines() !== 'zip') bad.push('retour à Markdown : mot ' + shown(note()) + ', options ' + shownLines() + ', coché ' + tickedLines());
        // Une grille : le type est grisé, il ne se choisit pas et le bouton exporte un PDF.
        await pickType('mdTemplate');
        await enterGrid(h);
        if (typeSelect().value !== 'pdf' || !greyed(typeRow('mdTemplate')) || typeRow('mdTemplate').classList.contains('is-active')) bad.push('grille après Markdown (modèle) : ' + typeSelect().value + ' / ' + typeRow('mdTemplate').className);
        await pickType('mdTemplate');
        if (typeSelect().value !== 'pdf') bad.push('Markdown (modèle) grisé a été choisi dans une grille : ' + typeSelect().value);
        typeSelect().value = 'mdTemplate';
        spies.calls.pdf.length = 0;
        await clickAndWait('btn-export-pdf', spies);
        if (spies.calls.pdf.length !== 1 || downloads.length !== 2) bad.push('export d\'une grille avec le type posé de l\'extérieur : ' + JSON.stringify(spies.calls) + ' / fichiers ' + downloads.length);
        await leaveGrid(h);
        if (typeSelect().value !== 'pdf') bad.push('Markdown (modèle) retrouvé au document suivant : ' + typeSelect().value);
        // Un macro-modèle n'a pas de contenu à lui (il assemble d'autres modèles) : grisé aussi, alors que Markdown (les valeurs d'une ligne) y reste possible.
        h.openFlyout('#v2-new-template-group');
        await h.clickButton('v2-btn-new-macro');
        await sleep(150);
        const macroName = document.getElementById('macro-editor-name');
        if (!macroName) bad.push('fenêtre du macro-modèle introuvable');
        else {
          macroName.value = 'Macro Markdown (modèle)';
          document.getElementById('macro-editor-save').click();
          await sleep(300);
          if (!greyed(typeRow('mdTemplate')) || !live(typeRow('md'))) bad.push('dans un macro-modèle : ' + typeRow('mdTemplate').className + ' / ' + typeRow('md').className);
          typeSelect().value = 'mdTemplate';
          spies.calls.pdf.length = 0;
          await clickAndWait('btn-export-pdf', spies);
          if (spies.calls.pdf.length !== 1 || downloads.length !== 2) bad.push('export d\'un macro-modèle avec le type posé de l\'extérieur : ' + JSON.stringify(spies.calls) + ' / fichiers ' + downloads.length);
        }
      } finally { ExportCommon.downloadBlob = realDownload; nameInput.value = ''; batches.restore(); spies.restore(); await reset(h); }
      return result(bad);
    },
  });

  cases.push({
    id: 'exporttype_every_export_of_before_is_still_there_hidden_and_launches_the_same_export',
    description: 'Aucune fonction perdue : les neuf lignes d\'export d\'avant (PDF seul, ZIP, PDF unique, assemblage, Word et son ZIP, Excel, son ZIP, son classeur unique) gardent leur identifiant, leur grisé selon le modèle et lancent le même export, mais ne sont plus montrées dans le menu Exporter ; « Exporter en PDF » fait comme le bouton',
    run: async (h) => {
      await seed(h);
      await reset(h);
      const spies = spyOnEngines();
      const bad = [];
      const batches = spyOnBatches(h);
      const legacy = ['v2-btn-export-pdf', 'v2-btn-export-pdf-batch', 'v2-btn-export-pdf-merged', 'v2-btn-export-pdf-sheets', 'v2-btn-export-docx', 'v2-btn-export-docx-batch', 'v2-btn-export-xlsx', 'v2-btn-export-xlsx-batch', 'v2-btn-export-xlsx-single'];
      // Une ligne de lot pose sa confirmation avant de rien générer : la poser une fois (refusée ici) prouve que la ligne est câblée à son export.
      const confirmsAfter = async id => {
        const got = await clickAndWait(id, spies, batches);
        return got.confirms;
      };
      try {
        const missing = legacy.filter(id => !document.getElementById(id));
        if (missing.length) bad.push('lignes absentes=' + missing.join());
        const visible = legacy.filter(id => document.getElementById(id) && shown(document.getElementById(id)));
        if (visible.length) bad.push('lignes montrées dans le menu Exporter=' + visible.join());
        if (document.getElementById('v2-export-legacy-rows').parentElement !== document.querySelector(EXPORT_FLYOUT)) bad.push('les lignes d\'avant ne sont plus dans le panneau du menu Exporter');
        const zip = await confirmsAfter('v2-btn-export-pdf-batch');
        if (zip.length !== 1 || !/PDF/.test(zip[0])) bad.push('ZIP de PDF=' + JSON.stringify(zip));
        const merged = await confirmsAfter('v2-btn-export-pdf-merged');
        if (merged.length !== 1 || !/PDF/.test(merged[0])) bad.push('PDF unique=' + JSON.stringify(merged));
        const wordZip = await confirmsAfter('v2-btn-export-docx-batch');
        if (wordZip.length !== 1 || !/DOCX/.test(wordZip[0])) bad.push('ZIP de Word=' + JSON.stringify(wordZip));
        const sheets = await clickAndWait('v2-btn-export-pdf-sheets', spies, batches);
        if (sheets.sheets.length !== 1 || sheets.sheets[0].table !== TABLE) bad.push('assemblage=' + JSON.stringify(sheets));
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
      } finally { batches.restore(); spies.restore(); await reset(h); }
      return result(bad);
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.exportType = cases;
})();
