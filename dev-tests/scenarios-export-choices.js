// Suite "exportChoices" - les réglages d'export gardés par personne et par modèle (js/export-choices.js, js/template-preferences.js). Antoine (12/10) : « est-ce que ces choix
// sont sauvegardés dans le modèle ? par user ? » ; carte « Où garder ton type d'export, la qualité PDF et le choix une ligne / toutes les lignes ? » : « Par personne et modèle »
// (comme les épingles : chacun retrouve ses choix par modèle sur n'importe quel ordinateur ; un compte en lecture seule les garde pour la session).
// Ce que la suite garde :
//  1) chaque modèle a ses réglages : le type, la qualité du PDF et « une ligne / toutes » ne passent pas d'un modèle au suivant, et un modèle revu retrouve les siens ;
//  2) ils s'écrivent dans la table des préférences de la personne, sur la ligne de ce modèle, et rien pour un modèle dont rien n'a changé ; une rafale de clics = une ligne ;
//  3) un autre ordinateur (rien en mémoire, préférences relues) les retrouve ; ce que la lecture du démarrage apporte après coup ne remplace jamais un choix déjà fait ;
//  4) un compte en lecture seule les garde pour la session, sans écrire dans le document ;
//  5) un nouveau modèle les voit écrits à son premier enregistrement ; « Enregistrer sous » emporte ceux de l'écran sans toucher au modèle d'origine ;
//  6) une valeur que les listes ne connaissent pas, un type que le modèle ne sait pas faire et la ligne d'une autre personne ne changent rien ;
//  7) un document d'avant (colonnes absentes) reçoit ses trois colonnes une fois, avant la première ligne.
// Le stockage seul (sans page) est dans dev-tests/unit-template-preferences.mjs ; le vrai clic à 700 x 400 et le rechargement de la page dans dev-tests/verify-export-type-mouse.mjs.
(function () {
  const cases = [];
  const TABLE = 'Publipostage_PreferencesModeles';
  const TYPE_FLYOUT = '#v2-quality-flyout';
  const EXPORT_FLYOUT = '#v2-export-pdf-flyout';
  const stub = () => window.__gristStub;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const typeSelect = () => document.getElementById('v2-export-type');
  const qualitySelect = () => document.getElementById('v2-pdf-quality');
  const linesSelect = () => document.getElementById('v2-export-lines');
  const typeRow = type => document.querySelector(TYPE_FLYOUT + ' .v2-hover-row[data-export-type="' + type + '"]');
  const qualityRow = quality => document.querySelector(TYPE_FLYOUT + ' .v2-hover-row[data-quality="' + quality + '"]');
  const linesRow = lines => document.querySelector(EXPORT_FLYOUT + ' .v2-hover-row[data-export-lines="' + lines + '"]');
  const pickType = async type => { typeRow(type).click(); await sleep(20); };
  const pickQuality = async quality => { qualityRow(quality).click(); await sleep(20); };
  const pickLines = async lines => { linesRow(lines).click(); await sleep(20); };
  const values = () => [typeSelect().value, qualitySelect().value, linesSelect().value].join('|');
  // Ce que les menus montrent : la ligne de type active, l'option cochée de « Exporter », le bouton du type allumé quand ce n'est pas le PDF.
  const menus = () => ({
    type: Array.from(document.querySelectorAll(TYPE_FLYOUT + ' .v2-hover-row[data-export-type].is-active')).map(row => row.dataset.exportType).join(),
    ticked: Array.from(document.querySelectorAll(EXPORT_FLYOUT + ' .v2-hover-row[aria-checked="true"]')).map(row => row.dataset.exportLines).join(),
    lit: document.getElementById('v2-btn-quality').classList.contains('active'),
  });
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // Les lignes de la table des préférences, une par (personne × modèle), telles que Grist les a.
  function prefRows(modelId) {
    const table = stub().state.rows[TABLE];
    if (!table) return [];
    return table.id.map((id, i) => ({
      id, user: table.Utilisateur[i], model: table.ModeleId[i],
      type: table.TypeExport ? table.TypeExport[i] : undefined,
      quality: table.QualitePdf ? table.QualitePdf[i] : undefined,
      lines: table.LignesExport ? table.LignesExport[i] : undefined,
    })).filter(row => modelId === undefined || row.model === modelId);
  }
  const logOf = start => stub().getActionLog().slice(start).filter(action => action[1] === TABLE);
  async function me() {
    try { return (await GristAPI.getCurrentUserEmail()) || ''; } catch (e) { return ''; }
  }

  // Un modèle enregistré par le vrai flux (« Nouveau document », contenu, nom, Enregistrer) : son identifiant sort de Grist.
  async function saved(h, name) {
    await h.resetEditor();
    h.openFlyout('#v2-new-template-group');
    await h.clickButton('v2-btn-new-document');
    await sleep(80);
    Editor.setHTML('<p>Contenu de ' + name + '</p>');
    document.getElementById('template-name').value = name;
    await h.clickButton('btn-save');
    await sleep(450);
    return Templates.getCurrentId();
  }
  // Ouvre un modèle par la liste, comme la personne (le vrai chargement : js/main.js:onTemplateSelectChange).
  async function open(id) {
    const select = document.getElementById('template-select');
    select.value = String(id);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(300);
  }
  // Ce qu'une page rechargée aurait : rien en mémoire, les préférences relues dans Grist.
  async function reload() {
    ExportChoices.reset();
    await TemplatePreferences.loadForCurrentUser();
  }
  // Remet l'écran d'avant pour le scénario suivant : plus de modèle suivi, PDF vectoriel, une seule ligne.
  async function clean() {
    ExportChoices.reset();
    await pickType('pdf');
    await pickQuality('native');
    await pickLines('one');
  }
  async function waitFor(fn, timeoutMs) {
    const t0 = Date.now();
    while (Date.now() - t0 < (timeoutMs || 3000)) { if (fn()) return true; await sleep(40); }
    return !!fn();
  }

  cases.push({
    id: 'export_choices_each_model_keeps_its_own_choices_in_the_session',
    description: 'Le type d\'export, la qualité du PDF et « une ligne / toutes les lignes » choisis sur un modèle ne passent pas au suivant (PDF, vectoriel, une seule ligne, bouton du type éteint) et le modèle revu retrouve les siens, avec les menus redessinés (ligne de type active, option cochée, bouton du type allumé)',
    run: async (h) => {
      const a = await saved(h, 'Export gardé - A');
      const b = await saved(h, 'Export gardé - B');
      await open(a);
      await pickQuality('light'); await pickType('docx'); await pickLines('zip'); // la qualité se choisit avec le type PDF : sous Word sa ligne est grisée
      const onA = { values: values(), menus: menus() };
      await open(b);
      const onB = { values: values(), menus: menus() };
      await pickLines('merged');
      await open(a);
      const backOnA = { values: values(), menus: menus() };
      await open(b);
      const backOnB = { values: values(), menus: menus() };
      await clean();
      const pass = same(onA, { values: 'docx|light|zip', menus: { type: 'docx', ticked: 'zip', lit: true } })
        && same(onB, { values: 'pdf|native|one', menus: { type: 'pdf', ticked: 'one', lit: false } })
        && same(backOnA, onA)
        && same(backOnB, { values: 'pdf|native|merged', menus: { type: 'pdf', ticked: 'merged', lit: false } });
      return { pass, notes: JSON.stringify({ onA, onB, backOnA, backOnB }) };
    },
  });

  cases.push({
    id: 'export_choices_are_written_for_the_person_and_the_model_only_when_they_differ_from_the_default',
    description: 'Un choix écrit UNE ligne de la table des préférences pour ce modèle (type, qualité, lignes ; vide = réglage d\'origine), mise à jour sur place ensuite ; un modèle dont rien n\'a changé n\'a aucune ligne, ni après son enregistrement, ni après un choix puis le retour à l\'origine sans ligne créée pour rien ; une rafale de clics n\'écrit qu\'une ligne',
    run: async (h) => {
      const a = await saved(h, 'Export écrit - A');
      const untouched = prefRows(a).length;
      await open(a);
      await pickQuality('light');
      await sleep(350);
      const afterQuality = prefRows(a);
      await pickType('docx');
      await sleep(350);
      const afterType = prefRows(a);
      await pickLines('zip');
      await sleep(350);
      const afterAll = prefRows(a);
      // la rafale : des clics sans attendre Grist
      const b = await saved(h, 'Export écrit - B');
      await open(b);
      qualityRow('light').click(); typeRow('docx').click(); typeRow('pdf').click(); typeRow('docx').click(); linesRow('merged').click(); linesRow('zip').click();
      await sleep(600);
      const burst = prefRows(b);
      // revenir à l'origine sur un modèle sans ligne n'en crée pas
      const c = await saved(h, 'Export écrit - C');
      await open(c);
      await pickType('docx'); await pickType('pdf'); await pickLines('one');
      await sleep(350);
      const origin = prefRows(c);
      await clean();
      const pass = untouched === 0
        && afterQuality.length === 1 && afterQuality[0].quality === 'light' && afterQuality[0].type === '' && afterQuality[0].lines === ''
        && afterType.length === 1 && afterType[0].id === afterQuality[0].id && afterType[0].type === 'docx' && afterType[0].quality === 'light' && afterType[0].lines === ''
        && afterAll.length === 1 && afterAll[0].id === afterQuality[0].id && afterAll[0].type === 'docx' && afterAll[0].quality === 'light' && afterAll[0].lines === 'zip'
        && burst.length === 1 && burst[0].type === 'docx' && burst[0].quality === 'light' && burst[0].lines === 'zip'
        && origin.length <= 1 && (origin.length === 0 || (origin[0].type === '' && origin[0].lines === ''));
      return { pass, notes: JSON.stringify({ untouched, afterQuality, afterType, afterAll, burst, origin }) };
    },
  });

  cases.push({
    id: 'export_choices_come_back_on_another_computer',
    description: 'Une page rechargée (rien en mémoire, préférences relues dans Grist) rouvre le modèle avec ses réglages ; un modèle sans choix repart de l\'origine ; les menus sont dessinés avec',
    run: async (h) => {
      const a = await saved(h, 'Export ailleurs - A');
      const b = await saved(h, 'Export ailleurs - B');
      await open(a);
      await pickQuality('browser-print'); await pickType('docx'); await pickLines('zip');
      await sleep(400);
      await reload();
      await pickType('pdf'); await pickQuality('native'); await pickLines('one'); // la page neuve montre l'origine avant tout modèle
      await open(a);
      const onA = { values: values(), menus: menus() };
      await open(b);
      const onB = { values: values(), menus: menus() };
      await clean();
      const pass = same(onA, { values: 'docx|browser-print|zip', menus: { type: 'docx', ticked: 'zip', lit: true } })
        && same(onB, { values: 'pdf|native|one', menus: { type: 'pdf', ticked: 'one', lit: false } });
      return { pass, notes: JSON.stringify({ onA, onB }) };
    },
  });

  cases.push({
    id: 'export_choices_read_after_the_first_model_opened_never_replace_a_choice_made_meanwhile',
    description: 'La lecture du démarrage finit après l\'ouverture du premier modèle : ce qu\'elle apporte est mis à l\'écran (menus redessinés) tant que la personne n\'a rien choisi pour ce modèle, et jamais à la place d\'un choix déjà fait',
    run: async (h) => {
      const user = await me();
      const untouched = await saved(h, 'Export tardif - sans choix');
      const chosen = await saved(h, 'Export tardif - choisi');
      await open(untouched);
      const before = values();
      await stub().applyUserActions([['AddRecord', TABLE, null, { Utilisateur: user, ModeleId: untouched, Epingle: false, Dossier: '', TypeExport: 'docx', QualitePdf: '', LignesExport: 'zip' }]]);
      await TemplatePreferences.loadForCurrentUser();
      ExportChoices.refresh();
      await sleep(60);
      const lateUntouched = { values: values(), menus: menus() };

      await open(chosen);
      await pickLines('sheets');
      await sleep(350);
      const rows = prefRows(chosen);
      await stub().applyUserActions([['UpdateRecord', TABLE, rows[0].id, { TypeExport: 'docx', LignesExport: 'zip' }]]); // un autre ordinateur a réglé ce modèle autrement
      await TemplatePreferences.loadForCurrentUser();
      ExportChoices.refresh();
      await sleep(60);
      const lateChosen = values();
      await clean();
      const pass = before === 'pdf|native|one'
        && same(lateUntouched, { values: 'docx|native|zip', menus: { type: 'docx', ticked: 'zip', lit: true } })
        && lateChosen === 'pdf|native|sheets';
      return { pass, notes: JSON.stringify({ before, lateUntouched, lateChosen }) };
    },
  });

  cases.push({
    id: 'export_choices_a_read_only_account_keeps_them_for_the_session_without_writing',
    description: 'Compte Lecteur de Grist (lecture seule) : ses réglages tiennent pour la session et suivent chaque modèle, mais rien n\'est écrit dans la table des préférences (aucune écriture tentée, aucune refusée), et ceux déjà gardés pour lui sont lus',
    run: async (h) => {
      const a = await saved(h, 'Export lecteur - A');
      const b = await saved(h, 'Export lecteur - B');
      await open(a);
      await pickType('docx'); await pickLines('zip');
      await sleep(350);
      const rowBefore = prefRows(a)[0];
      stub().setViewer(true);
      await AccessRights.refresh();
      await waitFor(() => AccessRights.get().readOnly);
      await sleep(300);
      const logStart = stub().getActionLog().length;
      const deniedStart = stub().state.deniedWrites.length;
      await open(b);
      await pickQuality('light'); await pickLines('merged');
      await open(a);
      const readStored = values(); // docx|native|zip : ce que Grist gardait pour lui
      await pickLines('sheets');
      await open(b);
      const onB = values();
      await open(a);
      const backOnA = values();
      await sleep(350);
      const written = logOf(logStart).filter(action => action[0] !== 'fetchTable');
      const denied = stub().state.deniedWrites.length - deniedStart;
      const rowAfter = prefRows(a)[0];
      stub().setViewer(false);
      await AccessRights.refresh();
      await waitFor(() => !AccessRights.get().readOnly);
      await sleep(300);
      document.getElementById('btn-mode-edit').click();
      await sleep(300);
      await clean();
      const pass = !!rowBefore && rowBefore.type === 'docx' && rowBefore.lines === 'zip'
        && readStored === 'docx|native|zip' && onB === 'pdf|light|merged' && backOnA === 'docx|native|sheets'
        && written.length === 0 && denied === 0 && same(rowAfter, rowBefore);
      return { pass, notes: JSON.stringify({ rowBefore, readStored, onB, backOnA, written, denied, rowAfter }) };
    },
  });

  cases.push({
    id: 'export_choices_of_a_new_model_are_written_at_its_first_save',
    description: 'Un nouveau modèle (sans identifiant) garde ses réglages à l\'écran et n\'écrit rien avant d\'être enregistré ; son premier enregistrement les écrit pour son nouvel identifiant, et ils reviennent quand on le rouvre',
    run: async (h) => {
      await h.resetEditor();
      h.openFlyout('#v2-new-template-group');
      await h.clickButton('v2-btn-new-document');
      await sleep(120);
      const rowsBefore = prefRows().length;
      await pickType('docx'); await pickLines('zip');
      await sleep(350);
      const rowsWhileNew = prefRows().length;
      Editor.setHTML('<p>Nouveau modèle avec réglages</p>');
      document.getElementById('template-name').value = 'Export nouveau modèle';
      await h.clickButton('btn-save');
      await sleep(600);
      const id = Templates.getCurrentId();
      const afterSave = prefRows(id);
      const other = await saved(h, 'Export nouveau modèle - autre');
      await open(other);
      const onOther = values();
      await open(id);
      const reopened = values();
      await clean();
      const pass = id != null && rowsWhileNew === rowsBefore
        && afterSave.length === 1 && afterSave[0].type === 'docx' && afterSave[0].lines === 'zip' && afterSave[0].quality === ''
        && onOther === 'pdf|native|one' && reopened === 'docx|native|zip';
      return { pass, notes: JSON.stringify({ rowsBefore, rowsWhileNew, id, afterSave, onOther, reopened }) };
    },
  });

  cases.push({
    id: 'export_choices_save_as_copy_takes_the_screen_choices_and_leaves_the_original',
    description: '« Enregistrer sous » : la copie garde les réglages de l\'écran, écrits pour son identifiant à son enregistrement ; un choix fait ensuite sur la copie ne touche pas le modèle d\'origine, ni l\'inverse',
    run: async (h) => {
      const a = await saved(h, 'Export copie - original');
      await open(a);
      await pickQuality('light'); await pickType('docx');
      await sleep(350);
      const dialogs = TestHelpers.stubDialogs({ prompt: 'Export copie - la copie' });
      document.getElementById('v2-btn-save-as').click();
      await waitFor(() => Templates.getCurrentId() != null && Templates.getCurrentId() !== a, 4000);
      await sleep(600);
      dialogs.restore();
      const copy = Templates.getCurrentId();
      const onCopy = values();
      const copyRow = prefRows(copy);
      await pickLines('zip');
      await sleep(350);
      const copyAfter = prefRows(copy);
      const originalAfter = prefRows(a);
      await open(a);
      const backOnOriginal = values();
      await pickLines('merged');
      await sleep(350);
      await open(copy);
      const backOnCopy = values();
      await clean();
      const pass = copy != null && copy !== a && onCopy === 'docx|light|one'
        && copyRow.length === 1 && copyRow[0].type === 'docx' && copyRow[0].quality === 'light'
        && copyAfter.length === 1 && copyAfter[0].lines === 'zip'
        && originalAfter.length === 1 && originalAfter[0].type === 'docx' && originalAfter[0].lines === ''
        && backOnOriginal === 'docx|light|one' && backOnCopy === 'docx|light|zip';
      return { pass, notes: JSON.stringify({ a, copy, onCopy, copyRow, copyAfter, originalAfter, backOnOriginal, backOnCopy }) };
    },
  });

  cases.push({
    id: 'export_choices_unknown_values_impossible_types_and_other_people_change_nothing',
    description: 'Une valeur que les listes ne connaissent pas vaut l\'origine ; un type que le modèle ne sait pas faire (Excel gardé pour un document) revient au PDF sans effacer ce que Grist garde ; la ligne d\'une AUTRE personne pour ce modèle n\'est jamais appliquée',
    run: async (h) => {
      const user = await me();
      const a = await saved(h, 'Export valeurs - étrangères');
      const b = await saved(h, 'Export valeurs - impossible');
      const c = await saved(h, 'Export valeurs - autre personne');
      await stub().applyUserActions([
        ['AddRecord', TABLE, null, { Utilisateur: user, ModeleId: a, Epingle: false, Dossier: '', TypeExport: 'odt', QualitePdf: 'ultra', LignesExport: 'toutes' }],
        ['AddRecord', TABLE, null, { Utilisateur: user, ModeleId: b, Epingle: false, Dossier: '', TypeExport: 'xlsx', QualitePdf: 'light', LignesExport: 'merged' }],
        ['AddRecord', TABLE, null, { Utilisateur: 'autre@exemple.fr', ModeleId: c, Epingle: false, Dossier: '', TypeExport: 'docx', QualitePdf: 'light', LignesExport: 'zip' }],
      ]);
      await reload();
      await open(a);
      const onA = values();
      await open(b);
      const onB = { values: values(), menus: menus() };
      const keptForB = prefRows(b)[0];
      await open(c);
      const onC = values();
      await clean();
      const pass = onA === 'pdf|native|one'
        && same(onB, { values: 'pdf|light|merged', menus: { type: 'pdf', ticked: 'merged', lit: false } })
        && !!keptForB && keptForB.type === 'xlsx'
        && onC === 'pdf|native|one';
      return { pass, notes: JSON.stringify({ onA, onB, keptForB, onC }) };
    },
  });

  cases.push({
    id: 'export_choices_old_document_gets_its_three_columns_once_before_the_first_row',
    description: 'Document créé avant cette fonction (trois colonnes absentes de la table des préférences) : le premier choix ajoute les colonnes UNE fois, en une action, AVANT d\'écrire la ligne (sinon Grist annule tout) ; les choix suivants ne les rajoutent pas ; une épingle seule n\'en ajoute aucune',
    run: async (h) => {
      const a = await saved(h, 'Export ancien document - A');
      const b = await saved(h, 'Export ancien document - B');
      ['TypeExport', 'QualitePdf', 'LignesExport'].forEach(column => stub().dropColumn(TABLE, column));
      await TemplatePreferences.loadForCurrentUser(); // relit le schéma : les colonnes manquent
      await TemplatePreferences.setPinned(b, true);
      const columnsAfterPin = ['TypeExport', 'QualitePdf', 'LignesExport'].filter(column => column in stub().state.rows[TABLE]);
      const logStart = stub().getActionLog().length;
      await open(a);
      await pickType('docx');
      await sleep(500);
      await pickLines('zip');
      await sleep(350);
      const log = logOf(logStart);
      const addColumns = log.filter(action => action[0] === 'AddVisibleColumn').map(action => action[2]);
      const firstColumn = log.findIndex(action => action[0] === 'AddVisibleColumn');
      const lastColumn = log.map(action => action[0]).lastIndexOf('AddVisibleColumn');
      const firstRecord = log.findIndex(action => action[0] === 'AddRecord' || action[0] === 'UpdateRecord');
      const rows = prefRows(a);
      await clean();
      const pass = columnsAfterPin.length === 0
        && same(addColumns, ['TypeExport', 'QualitePdf', 'LignesExport']) && firstColumn !== -1 && lastColumn < firstRecord
        && rows.length === 1 && rows[0].type === 'docx' && rows[0].lines === 'zip';
      return { pass, notes: JSON.stringify({ columnsAfterPin, addColumns, firstColumn, lastColumn, firstRecord, rows }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.exportChoices = cases;
})();
