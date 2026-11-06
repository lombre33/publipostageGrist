// Suite "rowAttachment" - le PDF joint à la ligne Grist (js/row-attachment.js, js/pdf-delivery.js ; demande du 06/11, point 2 des retours d'Antoine). Une colonne de type Pièces jointes, choisie dans Réglages > Vue (options
// `pdfJointColonne` et `pdfJointMode`), reçoit le PDF de chaque ligne exportée quand la case « Joindre à la ligne » du menu Exporter est cochée (clé de la personne pp_export_attach). Quatre décisions d'Antoine (06/11) : la
// case du menu, « Remplacer le PDF de même nom » ou « Toujours ajouter » (réglage), un jeton d'écriture demandé à chaque export et jeté, Grist Factory Suite décidée plus tard.
// ATTENTION - ce que cette suite ne prouve pas : l'envoi d'un fichier à Grist (POST multipart `…/attachments?auth=…`, champ `upload`, réponse = la liste des numéros, cellule `['L', ...]`) est décrit par la communauté de Grist
// (« Upload attachment from custom widget ») et JOUÉ ICI par le faux serveur de dev-tests/grist-stub.js (installUploadServer) : il encode ce que nous avons décidé de croire, rien n'en est mesuré dans un vrai Grist (le labo
// grist-static ne reçoit pas de fichier). La preuve se fait dans le Grist d'Antoine (dev-tests/PROTOCOLE_TEST_MANUEL.md, section « PDF joint à la ligne »).
// Ce que la suite garde :
//  1) les réglages : les colonnes proposées, les options lues (une valeur étrangère vaut l'origine), les textes d'état en français et en anglais, le grisé en lecture seule, Ctrl + Z ;
//  2) la case du menu Exporter : grisée avec sa raison (pas de colonne, lecture seule, PDF qui réunit plusieurs lignes), jamais retirée, cochée seulement quand la jointure s'applique, un pas d'Annuler, Entrée et Espace ;
//  3) l'envoi (RowAttachment.attachAll) : la requête, le jeton d'écriture demandé UNE fois par export et jamais gardé, la cellule écrite en UNE écriture, « Remplacer » / « Toujours ajouter », les pièces jointes des autres
//     noms qui restent, une pièce jointe posée pendant l'export qui n'est pas perdue, les refus (trop gros, droits, réseau, ligne supprimée, colonne disparue, jeton refusé) ;
//  4) la livraison (PdfDelivery.deliver) et les phrases du coin d'état ;
//  5) les VRAIS exports : le PDF d'une ligne, l'archive ZIP (chaque PDF dans SA ligne), le PDF réuni (rien n'est joint).
// Le vrai clic à la souris à 700 x 400 est dans dev-tests/verify-row-attachment-mouse.mjs.
(function () {
  const cases = [];
  const stub = () => window.__gristStub;
  const TABLE = 'RaClients';
  const COLUMN_OPTION = 'pdfJointColonne';
  const MODE_OPTION = 'pdfJointMode';
  const KEY = 'pp_export_attach';
  const FLYOUT = '#v2-export-pdf-flyout';
  const el = id => document.getElementById(id);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const verdict = (problems, summary) => ({ pass: problems.length === 0, notes: JSON.stringify({ summary, problems }) });
  function check(problems, label, got, want) { if (!same(got, want)) problems.push(label + ' : ' + JSON.stringify(got) + ' au lieu de ' + JSON.stringify(want)); }
  const statusText = () => el('status-msg').textContent;
  const keyEvent = key => new KeyboardEvent('keydown', { key, code: 'Key' + key.toUpperCase(), ctrlKey: true, bubbles: true, cancelable: true });
  const ed = () => EditorCore.getEditor();
  // Un « PDF » pour les essais qui ne passent pas par le moteur : le début d'un vrai fichier.
  const pdfBlob = (label, extra) => new Blob(['%PDF-1.4\n% ' + label + '\n' + (extra || '') + '\n%%EOF'], { type: 'application/pdf' });
  const item = (index, rowId, name, extra) => ({ index, rowId, name, blob: pdfBlob(name, extra) });
  const cell = (rowId, column) => stub().getRow(TABLE, rowId)[column || 'Pdf'];
  const attachmentNames = () => { const table = stub().state.rows._grist_Attachments; return table.id.map((id, i) => id + ':' + table.fileName[i]); };
  const writes = () => stub().getActionLog().filter(a => a[0] === 'BulkUpdateRecord' && a[1] === TABLE);

  // Les colonnes d'un vrai document : Pdf et Autre sont des Pièces jointes, Calcul en est une à formule (que Grist refuse d'écrire), Texte et Nom n'en sont pas.
  const COLUMNS = { Nom: 'Text', Pdf: 'Attachments', Autre: 'Attachments', Calcul: 'Attachments', Texte: 'Text' };
  const ROWS = [1, 2, 3, 4].map(id => ({ id, Nom: 'Client ' + id }));
  const servers = [];
  const useServer = options => { const server = stub().installUploadServer(options); servers.push(server); return server; };

  async function seed(h, options) {
    await h.resetEditor();
    I18n.setLang('fr');
    const s = stub();
    s.setAttachments([]);
    s.setVariables(TABLE, COLUMNS);
    s.setFormulaColumn(TABLE, 'Calcul', '$Pdf');
    s.setRows(TABLE, ROWS);
    s.state.tokenCalls.length = 0;
    s.state.tokenFailure = '';
    s.state.tokenTtlMs = 120000;
    s.clearActionLog();
    PersonStore.remove(KEY);
    await GristAPI.refreshSchema();
    s.fireRecord({ id: 1, Nom: 'Client 1' }, TABLE);
    await sleep(50);
    s.setWidgetOptions(options || null);
    await sleep(60);
  }
  async function cleanup() {
    servers.splice(0).forEach(server => server.uninstall());
    if (el('settings-modal').style.display === 'flex') { el('settings-close').click(); await sleep(400); }
    stub().setViewer(false);
    stub().setWidgetOptions(null);
    stub().state.tokenFailure = '';
    stub().state.tokenTtlMs = 120000;
    PersonStore.remove(KEY);
    I18n.setLang('fr');
    await sleep(80);
    stub().dropTable(TABLE);
    stub().setAttachments([]);
    await GristAPI.refreshSchema();
    RowAttachment.render();
  }
  function scenario(id, description, body, options) {
    cases.push({
      id, description,
      run: async (h) => {
        await seed(h, options);
        try { return await body(h); } finally { await cleanup(); }
      },
    });
  }
  // Des pièces jointes déjà dans Grist, et la cellule Pdf de la ligne 1 qui les porte.
  function holdOn(rowId, given, column) {
    const files = given.map((f, i) => Object.assign({ id: i + 1 }, f));
    stub().setAttachments(files);
    stub().setRows(TABLE, ROWS.map(row => (row.id === rowId ? Object.assign({}, row, { [column || 'Pdf']: ['L'].concat(files.map(f => f.id)) }) : row)));
  }
  const PDF = name => ({ fileName: name, fileType: 'application/pdf' });

  // --- 1) les réglages ---
  scenario('rowattachment_panel_offers_only_attachments_columns_without_formula',
    'La liste des colonnes de Réglages > Vue > « PDF joint à la ligne » ne propose que les colonnes de type Pièces jointes sans formule : Pdf et Autre, ni Calcul (formule), ni Texte, ni Nom.',
    async () => {
      const problems = [];
      RowAttachment.render();
      const select = el('settings-rowattachment-column');
      check(problems, 'les colonnes proposées', Array.from(select.options).map(o => o.value), ['', 'Pdf', 'Autre']);
      check(problems, 'sans choix : « — Aucune — » et rien à dire', [select.value, select.options[0].textContent, el('settings-rowattachment-status').hidden], ['', '— Aucune —', true]);
      check(problems, 'le mode de départ', [el('settings-rowattachment-mode').value, RowAttachment.getMode()], ['replace', 'replace']);
      return verdict(problems, {});
    });

  scenario('rowattachment_options_are_read_and_a_foreign_value_falls_back',
    'Les options `pdfJointColonne` et `pdfJointMode` se lisent avec le widget ; une valeur étrangère (un mode inconnu, un nombre, un texte vide) vaut l’origine : aucune colonne, « Remplacer ».',
    async () => {
      const problems = [];
      stub().setWidgetOptions({ [COLUMN_OPTION]: 'Pdf', [MODE_OPTION]: 'add' }); await sleep(60);
      check(problems, 'lues', [RowAttachment.getColumn(), RowAttachment.getMode()], ['Pdf', 'add']);
      stub().setWidgetOptions({ [COLUMN_OPTION]: '', [MODE_OPTION]: 'n’importe quoi' }); await sleep(60);
      check(problems, 'texte vide et mode inconnu', [RowAttachment.getColumn(), RowAttachment.getMode()], [null, 'replace']);
      stub().setWidgetOptions({ [COLUMN_OPTION]: 42, [MODE_OPTION]: 7 }); await sleep(60);
      check(problems, 'des nombres', [RowAttachment.getColumn(), RowAttachment.getMode()], [null, 'replace']);
      return verdict(problems, {});
    });

  scenario('rowattachment_panel_choices_write_the_options_and_ctrl_z_undoes_them',
    'Choisir la colonne puis le mode dans Réglages écrit les deux options ; chaque choix est UN pas d’Annuler : Ctrl + Z rend l’état d’avant et le dit au coin d’état, Ctrl + Y le remet.',
    async () => {
      const problems = [];
      RowAttachment.render();
      const choose = async (id, value) => { const select = el(id); select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); await sleep(80); };
      const press = async key => { ed().commands.focus('end'); await sleep(60); ed().view.dom.dispatchEvent(keyEvent(key)); await ActionHistory.whenIdle(); await sleep(150); };
      ActionHistory.reset();
      await choose('settings-rowattachment-column', 'Pdf');
      await choose('settings-rowattachment-mode', 'add');
      const options = () => GristAPI.getWidgetOptions() || {};
      check(problems, 'écrites', [options()[COLUMN_OPTION], options()[MODE_OPTION], RowAttachment.getColumn(), RowAttachment.getMode(), ActionHistory.count()], ['Pdf', 'add', 'Pdf', 'add', 2]);
      await press('z');
      check(problems, 'Ctrl + Z rend « Remplacer »', [RowAttachment.getMode(), el('settings-rowattachment-mode').value, statusText()], ['replace', 'replace', 'Réglage « Si la ligne a déjà un PDF » : Remplacer le PDF de même nom.']);
      await press('z');
      check(problems, 'Ctrl + Z encore rend « aucune colonne »', [RowAttachment.getColumn(), statusText()], [null, 'Réglage « PDF joint à la ligne » : aucune colonne.']);
      await press('y');
      check(problems, 'Ctrl + Y remet la colonne', [RowAttachment.getColumn(), statusText()], ['Pdf', 'Réglage « PDF joint à la ligne » : colonne « Pdf ».']);
      ActionHistory.reset();
      return verdict(problems, {});
    });

  scenario('rowattachment_status_line_says_what_the_chosen_column_can_do_in_french_and_english',
    'Sous la liste : « Les PDF joints vont dans « Pdf » » ; en rouge quand la colonne a disparu ou n’est plus une pièce jointe sans formule (Calcul, Texte) ; « aucune colonne de type Pièces jointes » quand la table n’en a pas — en français et en anglais.',
    async () => {
      const problems = [];
      const say = async column => { stub().setWidgetOptions({ [COLUMN_OPTION]: column }); await sleep(60); RowAttachment.render(); const status = el('settings-rowattachment-status'); return [status.hidden ? '' : status.textContent, status.classList.contains('is-problem')]; };
      check(problems, 'colonne utilisable', await say('Pdf'), ['Les PDF joints vont dans « Pdf ».', false]);
      check(problems, 'colonne à formule', await say('Calcul'), ['« Calcul » n’est plus de type Pièces jointes, ou porte une formule : aucun PDF ne peut y être joint.', true]);
      check(problems, 'colonne de texte', (await say('Texte'))[1], true);
      check(problems, 'colonne disparue', await say('Fantome'), ['La colonne « Fantome » n’existe plus : choisissez-en une autre ou aucune.', true]);
      I18n.setLang('en');
      check(problems, 'en anglais, colonne utilisable', await say('Pdf'), ['Attached PDFs go to “Pdf”.', false]);
      check(problems, 'en anglais, colonne disparue', await say('Fantome'), ['The column “Fantome” no longer exists: pick another one or none.', true]);
      I18n.setLang('fr');
      stub().setVariables(TABLE, { Nom: 'Text' });
      await GristAPI.refreshSchema();
      check(problems, 'aucune colonne de pièces jointes dans la table', await say(''), ['La table « ' + TABLE + ' » n’a aucune colonne de type Pièces jointes : ajoutez-en une dans Grist.', false]);
      return verdict(problems, {});
    });

  scenario('rowattachment_read_only_account_greys_the_panel_and_attaches_nothing',
    'Un compte Lecteur de Grist : la liste et le mode sont grisés avec leur mention, rien n’est envoyé ni écrit (aucun jeton demandé), sans message.',
    async () => {
      const problems = [];
      const server = useServer();
      stub().setViewer(true);
      RowAttachment.render();
      check(problems, 'le panneau', [el('settings-rowattachment-column').disabled, el('settings-rowattachment-mode').disabled, el('settings-rowattachment-locked').hidden], [true, true, false]);
      const report = await RowAttachment.attachAll(TABLE, [item(0, 1, 'a.pdf')]);
      check(problems, 'rien ne part', [report, server.requests.length, stub().state.tokenCalls.length, writes().length], [null, 0, 0, 0]);
      stub().setViewer(false);
      RowAttachment.render();
      check(problems, 'dégrisé', [el('settings-rowattachment-column').disabled, el('settings-rowattachment-locked').hidden], [false, true]);
      return verdict(problems, {});
    }, { [COLUMN_OPTION]: 'Pdf' });

  // --- 2) la case du menu Exporter ---
  const row = () => document.querySelector(FLYOUT + ' #v2-export-attach');
  const syncMenus = () => el('v2-export-pdf-group').dispatchEvent(new Event('mouseenter'));
  const typeSelect = () => el('v2-export-type');
  async function pickType(type) { typeSelect().value = type; syncMenus(); await sleep(20); }
  const greyed = r => r.classList.contains('v2-hover-row-disabled') && r.getAttribute('aria-disabled') === 'true';
  const live = r => !r.classList.contains('v2-hover-row-disabled') && r.getAttribute('aria-disabled') === null;

  scenario('rowattachment_menu_box_is_shown_for_the_two_pdf_types_only_and_greyed_with_its_reason',
    'La case « Joindre à la ligne » est dans le menu Exporter, montrée pour PDF et PDF protégé seulement (cachée pour Word, Markdown, HTML…) ; grisée — jamais retirée — avec sa raison sans colonne, sur un compte Lecteur, et pour le PDF réuni et l’assemblage avant impression.',
    async () => {
      const problems = [];
      const hidden = () => row().closest('[hidden]') !== null || row().hidden;
      const reason = () => LockReasons.reasonOf(row());
      await pickType('pdf');
      check(problems, 'PDF : montrée, intitulé', [hidden(), row().textContent.trim(), row().getAttribute('role')], [false, 'Joindre à la ligne', 'menuitemcheckbox']);
      for (const type of ['docx', 'md', 'html']) { await pickType(type); if (!hidden()) problems.push('la case est montrée pour ' + type); }
      await pickType('pdfProtected');
      check(problems, 'PDF protégé : montrée', hidden(), false);
      await pickType('pdf');
      check(problems, 'sans colonne : grisée et dit pourquoi', [greyed(row()), reason()], [true, 'Choisissez d’abord une colonne de type Pièces jointes dans Réglages > Vue.']);
      stub().setWidgetOptions({ [COLUMN_OPTION]: 'Pdf' }); await sleep(60); syncMenus();
      check(problems, 'avec une colonne : vivante, décochée', [live(row()), row().getAttribute('aria-checked'), reason()], [true, 'false', '']);
      stub().setWidgetOptions({ [COLUMN_OPTION]: 'Calcul' }); await sleep(60); syncMenus();
      check(problems, 'colonne à formule : grisée', [greyed(row()), reason()], [true, 'Choisissez d’abord une colonne de type Pièces jointes dans Réglages > Vue.']);
      stub().setWidgetOptions({ [COLUMN_OPTION]: 'Pdf' }); await sleep(60);
      const lines = value => { const select = el('v2-export-lines'); select.value = value; syncMenus(); };
      lines('zip');
      check(problems, 'archive ZIP : vivante', live(row()), true);
      lines('merged');
      check(problems, 'PDF réuni : grisée et dit pourquoi', [greyed(row()), reason()], [true, 'Ce PDF réunit plusieurs lignes : il n’est joint à aucune.']);
      lines('sheets');
      check(problems, 'assemblage : grisée', greyed(row()), true);
      lines('one');
      check(problems, 'une ligne : vivante', live(row()), true);
      stub().setViewer(true); syncMenus();
      check(problems, 'compte Lecteur : grisée et dit pourquoi', [greyed(row()), reason()], [true, 'Vous êtes en lecture seule : rien ne peut être joint.']);
      stub().setViewer(false); syncMenus();
      // En anglais (la page se recharge pour changer de langue : les textes de la page ne sont pas relus ici, seuls ceux que le code écrit à chaque synchro le sont).
      I18n.setLang('en'); stub().setWidgetOptions(null); await sleep(60); syncMenus();
      check(problems, 'en anglais : la case et la raison', [I18n.t('attach.label'), LockReasons.reasonOf(row())], ['Attach to the row', 'First choose an Attachments column in Settings > View.']);
      I18n.setLang('fr'); syncMenus();
      lines('one');
      return verdict(problems, {});
    });

  scenario('rowattachment_menu_box_is_kept_for_the_person_undone_by_ctrl_z_and_answers_the_keyboard',
    'Un clic coche la case (clé pp_export_attach = 1, un pas d’Annuler), un second la décoche (clé retirée) ; Ctrl + Z / Ctrl + Y le disent au coin d’état ; Entrée et Espace font de même ; grisée, la case ne change rien et un clic dit sa raison ; cochée puis colonne retirée, elle s’affiche décochée mais le choix reste gardé.',
    async () => {
      const problems = [];
      await pickType('pdf');
      const press = async key => { ed().commands.focus('end'); await sleep(60); ed().view.dom.dispatchEvent(keyEvent(key)); await ActionHistory.whenIdle(); await sleep(120); };
      const said = value => I18n.t('status.settingSet', { setting: 'Joindre à la ligne', value });
      // Sans colonne : grisée, le clic ne coche rien et dit pourquoi.
      ActionHistory.reset();
      row().click(); await sleep(40);
      check(problems, 'grisée : rien de gardé, la raison au coin d’état', [PersonStore.get(KEY), ActionHistory.count(), statusText()], [null, 0, 'Choisissez d’abord une colonne de type Pièces jointes dans Réglages > Vue.']);
      stub().setWidgetOptions({ [COLUMN_OPTION]: 'Pdf' }); await sleep(60); syncMenus();
      row().click(); await sleep(40);
      check(problems, 'coché', [PersonStore.get(KEY), row().getAttribute('aria-checked'), RowAttachment.isOn(), RowAttachment.active(), ActionHistory.count()], ['1', 'true', true, true, 1]);
      row().click(); await sleep(40);
      check(problems, 'décoché', [PersonStore.get(KEY), row().getAttribute('aria-checked'), RowAttachment.active(), ActionHistory.count()], [null, 'false', false, 2]);
      await press('z'); syncMenus();
      check(problems, 'Ctrl + Z rend la case cochée', [PersonStore.get(KEY), row().getAttribute('aria-checked'), statusText()], ['1', 'true', said('cochée')]);
      await press('y'); syncMenus();
      check(problems, 'Ctrl + Y la décoche', [PersonStore.get(KEY), row().getAttribute('aria-checked'), statusText()], [null, 'false', said('décochée')]);
      // Le clavier : Entrée puis Espace sur la case qui a le focus.
      const pressRow = key => { row().focus(); const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }); row().dispatchEvent(event); return event.defaultPrevented; };
      const enterTaken = pressRow('Enter'); await sleep(40);
      check(problems, 'Entrée coche', [enterTaken, PersonStore.get(KEY)], [true, '1']);
      const spaceTaken = pressRow(' '); await sleep(40);
      check(problems, 'Espace décoche', [spaceTaken, PersonStore.get(KEY)], [true, null]);
      check(problems, 'une autre touche ne fait rien', [pressRow('a'), PersonStore.get(KEY)], [false, null]);
      // Cochée, puis la colonne est retirée : décochée à l'écran, le choix de la personne est gardé et revient avec la colonne.
      row().click(); await sleep(40);
      stub().setWidgetOptions(null); await sleep(60); syncMenus();
      check(problems, 'colonne retirée : grisée et décochée, choix gardé, la jointure ne vaut pas', [greyed(row()), row().getAttribute('aria-checked'), PersonStore.get(KEY), RowAttachment.active(), PdfDelivery.plan().attach], [true, 'false', '1', false, false]);
      // Grisée, Entrée dit la raison comme le clic.
      stub().state.options = stub().state.options; el('status-msg').textContent = '';
      pressRow('Enter'); await sleep(40);
      check(problems, 'grisée : Entrée dit la raison', statusText(), 'Choisissez d’abord une colonne de type Pièces jointes dans Réglages > Vue.');
      stub().setWidgetOptions({ [COLUMN_OPTION]: 'Pdf' }); await sleep(60); syncMenus();
      check(problems, 'colonne revenue : cochée de nouveau', [row().getAttribute('aria-checked'), RowAttachment.active(), PdfDelivery.plan().attach], ['true', true, true]);
      ActionHistory.reset();
      return verdict(problems, {});
    });

  // --- 3) l'envoi ---
  scenario('rowattachment_upload_request_is_the_documented_multipart_post_with_a_write_token',
    'L’envoi est un POST multipart vers `<baseUrl>/attachments?auth=<jeton>` (champ `upload`, nom du fichier, type PDF, en-tête X-Requested-With) ; le jeton est celui d’ÉCRITURE (readOnly: false), jamais celui de lecture ; la cellule reçoit `[\'L\', numéro]`.',
    async () => {
      const problems = [];
      const server = useServer();
      const report = await RowAttachment.attachAll(TABLE, [item(0, 2, 'Facture 0002.pdf', 'contenu')]);
      const request = server.requests[0];
      check(problems, 'une requête POST', [server.requests.length, request.method, request.url.indexOf('http://localhost/api/docs/' + stub().state.docId + '/attachments?auth=') === 0], [1, 'POST', true]);
      check(problems, 'champ, nom et type', [request.fields, request.fileName, request.type, request.headers['X-Requested-With']], [['upload'], 'Facture 0002.pdf', 'application/pdf', 'XMLHttpRequest']);
      check(problems, 'le jeton d’écriture', [request.auth, stub().state.tokenCalls], ['stub-write-token1', [{ readOnly: false }]]);
      check(problems, 'la cellule de la ligne 2', [cell(2), cell(1), cell(3)], [['L', 1], null, null]);
      check(problems, 'le rapport', report, { column: 'Pdf', problem: null, attached: [{ index: 0, replaced: 0 }], failed: [] });
      return verdict(problems, {});
    }, { [COLUMN_OPTION]: 'Pdf' });

  scenario('rowattachment_write_token_is_asked_once_per_export_and_never_kept',
    'Trois fichiers d’un même export : UN seul jeton d’écriture demandé ; un second export en redemande un (rien n’est gardé d’un export à l’autre) ; le jeton de LECTURE des images n’est pas touché ; un jeton qui expire pendant l’export est redemandé avant l’envoi suivant.',
    async () => {
      const problems = [];
      useServer();
      await RowAttachment.attachAll(TABLE, [item(0, 1, 'a.pdf'), item(1, 2, 'b.pdf'), item(2, 3, 'c.pdf')]);
      check(problems, 'un jeton pour trois envois', stub().state.tokenCalls, [{ readOnly: false }]);
      await RowAttachment.attachAll(TABLE, [item(0, 4, 'd.pdf')]);
      check(problems, 'un autre export en redemande un', stub().state.tokenCalls, [{ readOnly: false }, { readOnly: false }]);
      check(problems, 'aucun jeton de lecture demandé par la jointure', stub().state.tokenCalls.filter(c => c.readOnly).length, 0);
      // Une durée de vie courte : chaque envoi trouve le jeton sur le point d'expirer et en redemande un.
      stub().state.tokenCalls.length = 0;
      stub().state.tokenTtlMs = 1000;
      await RowAttachment.attachAll(TABLE, [item(0, 1, 'e.pdf'), item(1, 2, 'f.pdf'), item(2, 3, 'g.pdf')]);
      check(problems, 'jeton qui expire : redemandé à chaque envoi', stub().state.tokenCalls.length, 4);
      return verdict(problems, {});
    }, { [COLUMN_OPTION]: 'Pdf' });

  scenario('rowattachment_many_rows_go_one_by_one_and_are_written_in_a_single_update',
    'Trois lignes : trois envois l’un après l’autre (jamais deux à la fois), puis UNE seule écriture BulkUpdateRecord pour les trois cellules ; chaque ligne reçoit son propre PDF.',
    async () => {
      const problems = [];
      const server = useServer();
      const progress = [];
      const report = await RowAttachment.attachAll(TABLE, [item(0, 1, 'a.pdf'), item(1, 2, 'b.pdf'), item(2, 3, 'c.pdf')], (current, total) => progress.push([current, total]));
      check(problems, 'un à la fois', [server.requests.length, server.maxActive], [3, 1]);
      check(problems, 'une écriture', [writes().length, writes()[0] && writes()[0][2]], [1, [1, 2, 3]]);
      check(problems, 'les cellules', [cell(1), cell(2), cell(3), cell(4)], [['L', 1], ['L', 2], ['L', 3], null]);
      check(problems, 'les noms rangés dans Grist', attachmentNames(), ['1:a.pdf', '2:b.pdf', '3:c.pdf']);
      check(problems, 'la progression', progress, [[1, 3], [2, 3], [3, 3]]);
      check(problems, 'le rapport', [report.attached.map(a => a.index), report.failed], [[0, 1, 2], []]);
      return verdict(problems, {});
    }, { [COLUMN_OPTION]: 'Pdf' });

  scenario('rowattachment_replace_mode_swaps_the_pdf_with_the_same_name_and_keeps_every_other_attachment',
    'Mode « Remplacer » : la cellule de la ligne 1 porte « F-1.pdf » et « contrat.docx » ; réexporter « F-1.pdf » retire l’ancien et garde « contrat.docx » (la cellule devient [contrat, nouveau F-1]) ; un autre nom (« F-0.pdf ») s’ajoute sans rien retirer ; le rapport compte ce qui est remplacé.',
    async () => {
      const problems = [];
      useServer();
      holdOn(1, [PDF('F-1.pdf'), { fileName: 'contrat.docx', fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }]);
      await GristAPI.refreshSchema();
      const report = await RowAttachment.attachAll(TABLE, [item(0, 1, 'F-1.pdf')]);
      check(problems, 'même nom : remplacé', [cell(1), report.attached], [['L', 2, 3], [{ index: 0, replaced: 1 }]]);
      check(problems, 'le nouveau fichier porte bien le nom', attachmentNames().slice(-1), ['3:F-1.pdf']);
      const other = await RowAttachment.attachAll(TABLE, [item(0, 1, 'F-0.pdf')]);
      check(problems, 'autre nom : ajouté', [cell(1), other.attached], [['L', 2, 3, 4], [{ index: 0, replaced: 0 }]]);
      return verdict(problems, {});
    }, { [COLUMN_OPTION]: 'Pdf', [MODE_OPTION]: 'replace' });

  scenario('rowattachment_add_mode_always_adds_even_with_the_same_name',
    'Mode « Toujours ajouter » : réexporter « F-1.pdf » ajoute un second « F-1.pdf » à la cellule, rien n’est retiré.',
    async () => {
      const problems = [];
      useServer();
      holdOn(1, [PDF('F-1.pdf')]);
      await GristAPI.refreshSchema();
      const report = await RowAttachment.attachAll(TABLE, [item(0, 1, 'F-1.pdf')]);
      check(problems, 'ajouté', [cell(1), report.attached, attachmentNames()], [['L', 1, 2], [{ index: 0, replaced: 0 }], ['1:F-1.pdf', '2:F-1.pdf']]);
      return verdict(problems, {});
    }, { [COLUMN_OPTION]: 'Pdf', [MODE_OPTION]: 'add' });

  scenario('rowattachment_replace_never_removes_anything_when_grist_does_not_tell_the_names',
    'Mode « Remplacer » alors que la table des pièces jointes de Grist est illisible : on ne sait pas quel fichier a quel nom, RIEN n’est retiré (le PDF s’ajoute), jamais une pièce jointe perdue.',
    async () => {
      const problems = [];
      useServer();
      holdOn(1, [PDF('F-1.pdf')]);
      const real = GristAPI.getAttachmentInfos;
      GristAPI.getAttachmentInfos = async () => new Map();
      try {
        await RowAttachment.attachAll(TABLE, [item(0, 1, 'F-1.pdf')]);
      } finally { GristAPI.getAttachmentInfos = real; }
      check(problems, 'la cellule garde l’ancien', cell(1), ['L', 1, 2]);
      return verdict(problems, {});
    }, { [COLUMN_OPTION]: 'Pdf', [MODE_OPTION]: 'replace' });

  scenario('rowattachment_two_pdfs_of_one_row_land_in_the_same_cell',
    '« Un document par valeur » : deux PDF de la même ligne (noms différents) vont tous les deux dans sa cellule, en une seule écriture ; en mode « Remplacer » ils ne se remplacent pas entre eux.',
    async () => {
      const problems = [];
      useServer();
      const report = await RowAttachment.attachAll(TABLE, [item(0, 2, 'Contrat - Paris.pdf'), item(1, 2, 'Contrat - Lyon.pdf'), item(2, 3, 'Contrat - Paris.pdf')]);
      check(problems, 'la ligne 2 a ses deux PDF', [cell(2), cell(3), writes().length], [['L', 1, 2], ['L', 3], 1]);
      check(problems, 'le rapport', report.attached.map(a => a.index), [0, 1, 2]);
      return verdict(problems, {});
    }, { [COLUMN_OPTION]: 'Pdf' });

  scenario('rowattachment_a_file_without_a_row_is_left_alone',
    'Un fichier sans ligne (le PDF réuni) n’est ni envoyé ni compté ; s’il est seul, rien ne se passe du tout (aucun jeton, aucune écriture, rapport nul).',
    async () => {
      const problems = [];
      const server = useServer();
      const report = await RowAttachment.attachAll(TABLE, [{ index: 0, rowId: undefined, name: 'tout.pdf', blob: pdfBlob('tout') }]);
      check(problems, 'seul : rien', [report, server.requests.length, stub().state.tokenCalls.length, writes().length], [null, 0, 0, 0]);
      const mixed = await RowAttachment.attachAll(TABLE, [{ index: 0, rowId: null, name: 'tout.pdf', blob: pdfBlob('tout') }, item(1, 1, 'a.pdf')]);
      check(problems, 'avec un fichier de ligne : lui seul', [server.requests.length, mixed.attached.map(a => a.index), cell(1)], [1, [1], ['L', 1]]);
      return verdict(problems, {});
    }, { [COLUMN_OPTION]: 'Pdf' });

  scenario('rowattachment_the_column_is_read_just_before_the_write_so_nothing_added_meanwhile_is_lost',
    'Pendant les envois, quelqu’un ajoute une pièce jointe dans la cellule dans Grist : la colonne est relue juste avant l’écriture, la pièce jointe d’entre-temps reste dans la cellule avec le nouveau PDF.',
    async () => {
      const problems = [];
      useServer({
        onRequest: async (rank) => {
          // Au deuxième envoi, une autre personne pose « photo.png » dans la cellule de la ligne 1.
          if (rank !== 2) return;
          const known = stub().state.rows._grist_Attachments;
          stub().setAttachments(known.id.map((id, i) => ({ id, fileName: known.fileName[i], fileType: known.fileType[i] })).concat([{ id: 40, fileName: 'photo.png', fileType: 'image/png' }]));
          stub().setRows(TABLE, ROWS.map(r => (r.id === 1 ? Object.assign({}, r, { Pdf: ['L', 40] }) : r)));
        },
      });
      await RowAttachment.attachAll(TABLE, [item(0, 1, 'a.pdf'), item(1, 2, 'b.pdf')]);
      check(problems, 'la cellule de la ligne 1 garde la pièce jointe d’entre-temps', [cell(1), cell(2)], [['L', 40, 1], ['L', 41]]);
      return verdict(problems, {});
    }, { [COLUMN_OPTION]: 'Pdf' });

  scenario('rowattachment_an_unreadable_column_writes_nothing_so_no_existing_attachment_is_overwritten',
    'Si la colonne ne peut pas être relue avant l’écriture, rien n’est écrit (écrire [\'L\', nouveau] effacerait les pièces jointes qui s’y trouvent) : tous les fichiers sont comptés en échec.',
    async () => {
      const problems = [];
      useServer();
      holdOn(1, [PDF('F-1.pdf')]);
      const realFetch = grist.docApi.fetchTable;
      grist.docApi.fetchTable = async (table) => { if (table === TABLE) throw new Error('illisible'); return realFetch.call(grist.docApi, table); };
      let report;
      try { report = await RowAttachment.attachAll(TABLE, [item(0, 1, 'b.pdf')]); } finally { grist.docApi.fetchTable = realFetch; }
      check(problems, 'rien écrit, la cellule intacte', [writes().length, cell(1)], [0, ['L', 1]]);
      check(problems, 'le rapport', [report.problem, report.attached.length, report.failed.map(f => f.reason)], ['failed', 0, ['failed']]);
      return verdict(problems, {});
    }, { [COLUMN_OPTION]: 'Pdf' });

  scenario('rowattachment_refusals_are_told_row_by_row_and_never_lose_the_other_files',
    'Un envoi refusé ne fait pas perdre les autres : trop gros (413) = « tooLarge », droits (403) = « denied », autre refus (500) = « failed », Grist injoignable = « unreachable » ; le rapport dit pour chaque fichier ce qui est arrivé et les cellules des autres lignes sont écrites.',
    async () => {
      const problems = [];
      useServer({ failures: { 2: 413, 3: 403, 4: 500 } });
      const report = await RowAttachment.attachAll(TABLE, [item(0, 1, 'a.pdf'), item(1, 2, 'b.pdf'), item(2, 3, 'c.pdf'), item(3, 4, 'd.pdf')]);
      check(problems, 'les échecs', report.failed, [{ index: 1, reason: 'tooLarge' }, { index: 2, reason: 'denied' }, { index: 3, reason: 'failed' }]);
      check(problems, 'la ligne qui a réussi est écrite, les autres intactes', [cell(1), cell(2), cell(3), cell(4), writes().length], [['L', 1], null, null, null, 1]);
      check(problems, 'le problème du lot', report.problem, null);
      for (const server of servers.splice(0)) server.uninstall();
      useServer({ networkDown: true });
      const down = await RowAttachment.attachAll(TABLE, [item(0, 2, 'b.pdf')]);
      check(problems, 'Grist injoignable', [down.problem, down.failed, writes().length], ['unreachable', [{ index: 0, reason: 'unreachable' }], 1]);
      return verdict(problems, {});
    }, { [COLUMN_OPTION]: 'Pdf' });

  scenario('rowattachment_a_refused_write_token_a_gone_column_or_a_wrong_type_stop_the_whole_export',
    'Grist refuse le jeton d’écriture : rien n’est envoyé, « denied » pour tous ; la colonne disparue ou devenue Texte : rien n’est demandé du tout (ni jeton ni envoi), « missing » ou « unusable » pour tous.',
    async () => {
      const problems = [];
      const server = useServer();
      stub().state.tokenFailure = 'Access denied';
      const refused = await RowAttachment.attachAll(TABLE, [item(0, 1, 'a.pdf'), item(1, 2, 'b.pdf')]);
      check(problems, 'jeton refusé', [refused.problem, refused.failed.map(f => f.reason), server.requests.length], ['denied', ['denied', 'denied'], 0]);
      stub().state.tokenFailure = '';
      stub().state.tokenCalls.length = 0;
      stub().setVariables(TABLE, { Nom: 'Text', Texte: 'Text', Autre: 'Attachments', Calcul: 'Attachments' });
      await GristAPI.refreshSchema();
      const gone = await RowAttachment.attachAll(TABLE, [item(0, 1, 'a.pdf')]);
      check(problems, 'colonne disparue', [gone.problem, server.requests.length, stub().state.tokenCalls.length], ['missing', 0, 0]);
      stub().setWidgetOptions({ [COLUMN_OPTION]: 'Texte' }); await sleep(60);
      const wrong = await RowAttachment.attachAll(TABLE, [item(0, 1, 'a.pdf')]);
      check(problems, 'colonne devenue Texte', [wrong.problem, server.requests.length, stub().state.tokenCalls.length], ['unusable', 0, 0]);
      return verdict(problems, {});
    }, { [COLUMN_OPTION]: 'Pdf' });

  scenario('rowattachment_a_row_deleted_during_the_export_does_not_cost_the_other_rows',
    'Une ligne supprimée dans Grist pendant l’export : Grist refuserait toute l’écriture ; les lignes qui restent sont écrites quand même, la ligne disparue est comptée en échec (raison « row »).',
    async () => {
      const problems = [];
      useServer({ onRequest: async (rank) => { if (rank === 2) stub().setRows(TABLE, ROWS.filter(r => r.id !== 2)); } });
      const report = await RowAttachment.attachAll(TABLE, [item(0, 1, 'a.pdf'), item(1, 2, 'b.pdf'), item(2, 3, 'c.pdf')]);
      check(problems, 'les lignes qui restent', [cell(1), cell(3)], [['L', 1], ['L', 3]]);
      check(problems, 'le rapport', [report.attached.map(a => a.index), report.failed], [[0, 2], [{ index: 1, reason: 'row' }]]);
      return verdict(problems, {});
    }, { [COLUMN_OPTION]: 'Pdf' });

  scenario('rowattachment_a_write_grist_refuses_is_told_as_denied',
    'Grist accepte les envois mais refuse d’écrire la cellule (règle d’accès sur la colonne) : tous les fichiers sont comptés « denied », le problème du lot est « denied ».',
    async () => {
      const problems = [];
      useServer();
      const real = grist.docApi.applyUserActions;
      grist.docApi.applyUserActions = async (actions) => { if (actions.some(a => a[0] === 'BulkUpdateRecord' && a[1] === TABLE)) throw new Error('Blocked by access rules'); return real.call(grist.docApi, actions); };
      let report;
      try { report = await RowAttachment.attachAll(TABLE, [item(0, 1, 'a.pdf'), item(1, 2, 'b.pdf')]); } finally { grist.docApi.applyUserActions = real; }
      check(problems, 'refus d’écriture', [report.problem, report.failed.map(f => f.reason), report.attached.length, cell(1)], ['denied', ['denied', 'denied'], 0, null]);
      return verdict(problems, {});
    }, { [COLUMN_OPTION]: 'Pdf' });

  // --- 4) la livraison et les phrases ---
  scenario('rowattachment_plan_follows_the_box_and_deliver_attaches_after_the_download_choice',
    'PdfDelivery.plan() porte `attach` : faux tant que la case n’est pas cochée, vrai cochée avec une colonne ; deliver() avec attach joint chaque fichier à sa ligne ET garde le téléchargement (tout, d’un bloc), compte les fichiers joints comme partis (`delivered`) et laisse le compte rendu dans `report.attach`.',
    async () => {
      const problems = [];
      useServer();
      check(problems, 'case décochée', PdfDelivery.plan(), { download: true, shelve: false, attach: false });
      RowAttachment.setOn(true);
      check(problems, 'case cochée', PdfDelivery.plan(), { download: true, shelve: false, attach: true });
      const downloads = [];
      const files = [{ name: 'a', blob: pdfBlob('a'), rowId: 1 }, { name: 'b', blob: async () => pdfBlob('b'), rowId: 2 }];
      const report = await PdfDelivery.deliver(files, async subset => { downloads.push(subset ? subset.map(f => f.name) : 'all'); }, { plan: PdfDelivery.plan(), table: TABLE });
      check(problems, 'téléchargé d’un bloc et joint', [downloads, cell(1), cell(2), attachmentNames()], [['all'], ['L', 1], ['L', 2], ['1:a.pdf', '2:b.pdf']]);
      check(problems, 'le rapport', [report.attach.attached.map(a => a.index), Array.from(report.delivered).sort(), report.downloaded], [[0, 1], [0, 1], 2]);
      // Sans `table`, ou sans `attach` dans le plan : rien n'est joint.
      const before = stub().state.tokenCalls.length;
      await PdfDelivery.deliver(files, async () => {}, { plan: { download: true, shelve: false, attach: true } });
      await PdfDelivery.deliver(files, async () => {}, { plan: { download: true, shelve: false, attach: false }, table: TABLE });
      check(problems, 'ni table ni case : aucun jeton', stub().state.tokenCalls.length, before);
      // Une jointure qui lève ne fait pas perdre le téléchargement.
      const realAttach = RowAttachment.attachAll;
      RowAttachment.attachAll = async () => { throw new Error('boum'); };
      const survived = [];
      let failed;
      try { failed = await PdfDelivery.deliver(files, async subset => { survived.push(subset ? subset.length : 'all'); }, { plan: PdfDelivery.plan(), table: TABLE }); } finally { RowAttachment.attachAll = realAttach; }
      check(problems, 'une jointure qui lève : téléchargé quand même, dit en rouge', [survived, failed.attach.problem, PdfDelivery.describe(failed).note], [['all'], 'failed', '2 PDF non joints à leur ligne (Grist a refusé l’envoi).']);
      RowAttachment.setOn(false);
      return verdict(problems, {});
    }, { [COLUMN_OPTION]: 'Pdf' });

  scenario('rowattachment_status_sentences_in_french_and_english',
    'Les phrases du coin d’état : un PDF joint (colonne dite), plusieurs (combien ont remplacé l’ancien), et en rouge ce qui ne l’est pas — colonne disparue, mauvais type, trop gros, droits, Grist injoignable, ligne supprimée — en français et en anglais.',
    async () => {
      const problems = [];
      const make = (attached, failed, problem) => ({ shelved: false, total: 3, counts: { ajoute: 0, remplace: 0, copie: 0, ignore: 0 }, copies: [], failed: [], skipped: 0, attach: { column: 'Pdf', problem: problem || null, attached, failed } });
      const one = (replaced) => ({ index: 0, replaced });
      const fr = {
        one: PdfDelivery.describe(make([one(0)], [])),
        many: PdfDelivery.describe(make([one(0), one(0), one(0)], [])),
        replaced: PdfDelivery.describe(make([one(1), one(0), one(2)], [])),
        replacedOne: PdfDelivery.describe(make([one(1)], [])),
        tooLarge: PdfDelivery.describe(make([one(0)], [{ index: 1, reason: 'tooLarge' }, { index: 2, reason: 'tooLarge' }])),
        denied: PdfDelivery.describe(make([], [{ index: 0, reason: 'denied' }], 'denied')),
        unreachable: PdfDelivery.describe(make([], [{ index: 0, reason: 'unreachable' }], 'unreachable')),
        row: PdfDelivery.describe(make([one(0)], [{ index: 1, reason: 'row' }])),
        missing: PdfDelivery.describe(make([], [{ index: 0, reason: 'missing' }], 'missing')),
        unusable: PdfDelivery.describe(make([], [{ index: 0, reason: 'unusable' }], 'unusable')),
      };
      check(problems, 'un PDF', fr.one, { text: 'PDF joint à la ligne, colonne « Pdf ».', note: '' });
      check(problems, 'trois PDF', fr.many.text, '3 PDF joints à leur ligne, colonne « Pdf ».');
      check(problems, 'trois PDF dont trois remplacés', fr.replaced.text, '3 PDF joints à leur ligne, colonne « Pdf » (3 remplacés).');
      check(problems, 'un PDF qui en remplace un', fr.replacedOne.text, '1 PDF joint à sa ligne, colonne « Pdf » (1 remplacé).');
      check(problems, 'deux trop gros', [fr.tooLarge.text, fr.tooLarge.note], ['PDF joint à la ligne, colonne « Pdf ».', '2 PDF non joints à leur ligne (fichier trop gros pour Grist).']);
      check(problems, 'droits', fr.denied.note, '1 PDF non joint à leur ligne (Grist a refusé l’écriture).');
      check(problems, 'injoignable', fr.unreachable.note, '1 PDF non joint à leur ligne (Grist ne répond pas).');
      check(problems, 'ligne supprimée', fr.row.note, '1 PDF non joint à leur ligne (la ligne n’existe plus).');
      check(problems, 'colonne disparue', fr.missing.note, 'PDF non joint : la colonne « Pdf » n’existe plus.');
      check(problems, 'colonne devenue autre chose', fr.unusable.note, 'PDF non joint : « Pdf » doit être de type Pièces jointes, sans formule.');
      I18n.setLang('en');
      check(problems, 'EN : un', PdfDelivery.describe(make([one(0)], [])).text, 'PDF attached to the row, column “Pdf”.');
      check(problems, 'EN : plusieurs remplacés', PdfDelivery.describe(make([one(1), one(0), one(0)], [])).text, '3 PDFs attached to their rows, column “Pdf” (1 replaced).');
      check(problems, 'EN : refus', PdfDelivery.describe(make([], [{ index: 0, reason: 'denied' }, { index: 1, reason: 'denied' }], 'denied')).note, '2 PDFs not attached to the row (Grist refused the write).');
      check(problems, 'EN : colonne disparue', PdfDelivery.describe(make([], [{ index: 0, reason: 'missing' }], 'missing')).note, 'PDF not attached: the column “Pdf” no longer exists.');
      I18n.setLang('fr');
      check(problems, 'rien à joindre : rien à dire', [PdfDelivery.describe({ shelved: false, total: 1, counts: { ajoute: 0, remplace: 0, copie: 0, ignore: 0 }, copies: [], failed: [], skipped: 0, attach: null }), PdfDelivery.describe(null)], [{ text: '', note: '' }, { text: '', note: '' }]);
      return verdict(problems, {});
    });

  // --- 5) les vrais exports ---
  const NAMES = ['Alpha Durand', 'Bravo Martin', 'Charlie Petit'];
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const badge = column => `<span class="var-badge" data-table="${TABLE}" data-column="${column}" data-key="${TABLE}.${column}"></span>`;
  async function seedExports(h) {
    await h.resetEditor();
    I18n.setLang('fr');
    stub().setAttachments([]);
    stub().setVariables(TABLE, COLUMNS);
    stub().setFormulaColumn(TABLE, 'Calcul', '$Pdf');
    stub().setRows(TABLE, NAMES.map((Nom, i) => ({ id: i + 1, Nom })));
    await GristAPI.refreshSchema();
    stub().fireRecord({ id: 1, Nom: NAMES[0] }, TABLE);
    await sleep(50);
    Editor.setHTML(`<p>Bonjour ${badge('Nom')}, voici votre courrier.</p>`);
    Editor.setHeaderFooterData(NO_HF);
    stub().setWidgetOptions({ [COLUMN_OPTION]: 'Pdf' });
    await sleep(60);
    RowAttachment.setOn(true);
    stub().clearActionLog();
    stub().state.tokenCalls.length = 0;
  }
  async function runExport(buttonId, until, settle) {
    const downloads = [];
    const blobsByUrl = new Map();
    const origCreate = URL.createObjectURL;
    const origClick = HTMLAnchorElement.prototype.click;
    const dialogs = window.__dialogStubs = null;
    const origConfirm = Dialogs.confirm;
    Dialogs.confirm = async () => true;
    await PdfExport.ensurePdfLibsLoaded();
    const origCreatePdf = window.pdfMake.createPdf;
    window.pdfMake.createPdf = function (docDefinition) {
      const generated = origCreatePdf.call(window.pdfMake, docDefinition);
      generated.download = function (name) { generated.getBlob(blob => downloads.push({ name, blob })); };
      return generated;
    };
    URL.createObjectURL = obj => { const url = origCreate.call(URL, obj); blobsByUrl.set(url, obj); return url; };
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) { downloads.push({ name: this.download, blob: blobsByUrl.get(this.href) }); return undefined; }
      return origClick.call(this);
    };
    const statuses = [];
    const statusEl = el('status-msg');
    const observer = new MutationObserver(() => { if (statuses[statuses.length - 1] !== statusEl.textContent) statuses.push(statusEl.textContent); });
    observer.observe(statusEl, { childList: true, characterData: true, subtree: true });
    try {
      el(buttonId).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      const startedAt = Date.now();
      while (!until() && Date.now() - startedAt < 60000) await sleep(100);
      await sleep(settle === undefined ? 150 : settle);
    } finally {
      observer.disconnect();
      Dialogs.confirm = origConfirm;
      URL.createObjectURL = origCreate;
      HTMLAnchorElement.prototype.click = origClick;
      window.pdfMake.createPdf = origCreatePdf;
    }
    return { downloads, statuses, status: statusText(), error: el('status-msg').className, dialogs };
  }
  const done = pattern => () => pattern.test(statusText());

  cases.push({
    id: 'rowattachment_single_pdf_export_attaches_the_downloaded_pdf_to_its_row',
    description: 'Le vrai bouton Exporter, PDF d’une ligne, case cochée : le PDF est téléchargé comme avant ET joint à la cellule de SA ligne (le fichier joint est le PDF téléchargé, au même nom), le coin d’état le dit, un jeton d’écriture pour l’export ; case décochée : aucun envoi, aucune écriture ; mode « Remplacer » : réexporter remplace le PDF de même nom au lieu de s’ajouter.',
    run: async (h) => {
      const problems = [];
      await seedExports(h);
      const server = useServer();
      try {
        const first = await runExport('btn-export-pdf', done(/PDF joint à la ligne/), 400);
        const name = first.downloads[0] && first.downloads[0].name;
        check(problems, 'téléchargé ET joint', [first.downloads.length, server.requests.length, server.requests[0] && server.requests[0].fileName === name, cell(1)], [1, 1, true, ['L', 1]]);
        check(problems, 'le fichier joint est le PDF téléchargé', [server.requests[0] && server.requests[0].size === first.downloads[0].blob.size, server.requests[0] && server.requests[0].type], [true, 'application/pdf']);
        check(problems, 'le coin d’état et le jeton', [first.status, first.error, stub().state.tokenCalls], ['PDF joint à la ligne, colonne « Pdf ». PDF généré.', '', [{ readOnly: false }]]);
        // Réexporter : « Remplacer » met le nouveau PDF à la place de l'ancien.
        const second = await runExport('btn-export-pdf', done(/\(1 remplacé\)/), 400);
        check(problems, 'réexporté : remplacé', [cell(1), second.status], [['L', 2], '1 PDF joint à sa ligne, colonne « Pdf » (1 remplacé). PDF généré.']);
        // Case décochée : rien ne part.
        RowAttachment.setOn(false);
        const requestsBefore = server.requests.length;
        const plain = await runExport('btn-export-pdf', () => true, 1500);
        check(problems, 'décochée : téléchargé seulement', [plain.downloads.length, server.requests.length === requestsBefore, plain.status], [1, true, 'PDF généré.']);
        // Une ligne qui n'est pas la première : c'est SA cellule qui reçoit le PDF.
        RowAttachment.setOn(true);
        stub().fireRecord({ id: 3, Nom: NAMES[2] }, TABLE);
        await sleep(80);
        await runExport('btn-export-pdf', done(/PDF joint à la ligne/), 400);
        check(problems, 'la ligne 3', [cell(3), cell(2)], [['L', 3], null]);
      } finally { await cleanup(); }
      return verdict(problems, {});
    },
  });

  cases.push({
    id: 'rowattachment_zip_export_attaches_each_pdf_to_its_own_row_and_the_merged_pdf_attaches_nothing',
    description: 'L’archive ZIP (une ligne = un PDF), case cochée : l’archive est téléchargée comme avant ET chaque PDF va dans SA ligne (nom de son entrée de l’archive), trois envois puis une seule écriture, un jeton ; le PDF réuni (plusieurs lignes, un fichier) n’envoie rien même avec la case cochée.',
    run: async (h) => {
      const problems = [];
      await seedExports(h);
      const server = useServer();
      try {
        const zip = await runExport('v2-btn-export-pdf-batch', done(/PDF joints à leur ligne/), 600);
        const entries = zip.downloads[0] ? Object.keys((await JSZip.loadAsync(await zip.downloads[0].blob.arrayBuffer())).files) : [];
        check(problems, 'l’archive téléchargée', [zip.downloads.map(d => d.name), entries.length], [[TABLE + '-export-pdf.zip'], 3]);
        check(problems, 'trois envois, une écriture, un jeton', [server.requests.length, writes().length, writes()[0] && writes()[0][2], stub().state.tokenCalls], [3, 1, [1, 2, 3], [{ readOnly: false }]]);
        check(problems, 'chaque PDF dans sa ligne, sous le nom de son entrée', [cell(1), cell(2), cell(3), server.requests.map(r => r.fileName).sort()], [['L', 1], ['L', 2], ['L', 3], entries.slice().sort()]);
        check(problems, 'le coin d’état', zip.status.indexOf('3 PDF joints à leur ligne, colonne « Pdf »') === 0, true);
        // Le PDF réuni : ni jeton ni envoi, il est téléchargé comme avant.
        const sentBefore = server.requests.length;
        stub().state.tokenCalls.length = 0;
        const merged = await runExport('v2-btn-export-pdf-merged', done(/généré|téléchargé/), 800);
        check(problems, 'PDF réuni : téléchargé, rien joint', [merged.downloads.length, server.requests.length === sentBefore, stub().state.tokenCalls.length, /joint/.test(merged.status)], [1, true, 0, false]);
      } finally { await cleanup(); }
      return verdict(problems, {});
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.rowAttachment = cases;
})();
