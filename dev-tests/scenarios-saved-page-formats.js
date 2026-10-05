// Formats de page enregistrés (js/saved-page-formats.js) : la liste des tailles nommées du document, proposée par la fenêtre « Format libre… » (js/page-size-dialog.js, dev-tests/scenarios-page-size.js)
// - demande d'Antoine du 04/10 : « donner un nom à un format, par exemple « Étiquette 70 × 37 », et le reprendre sur d'autres modèles ». Une ligne de la table Publipostage_FormatsPage du document
// (Nom, Largeur, Hauteur en millimètres, la page telle qu'on la voit) ; choisir un format remplit les deux champs, « Valider » pose la taille ; le modèle garde sa taille, pas le nom du format.
//
// La table n'est lue qu'à l'ouverture de la fenêtre (jamais au démarrage), créée à la première écriture seulement (une fois), et jamais offerte comme table de l'utilisateur (INTERNAL_TABLES de
// js/grist-api.js). Les lignes illisibles sont ignorées sans être corrigées dans Grist. Le nom pris devient « nom (2) » comme celui d'un modèle ; un échec d'écriture est dit sous les champs.
// La fenêtre et la liste sont atteintes par leurs VRAIS éléments (clics sur le champ de la liste et sur ses lignes, sur « Enregistrer ce format… » et sur la corbeille) ; la souris réelle, à
// 700x400, est dans verify-saved-page-formats-mouse.mjs.
window.EditorTestSuites = window.EditorTestSuites || {};
window.EditorTestSuites.savedFormats = (function () {
  const TABLE = 'Publipostage_FormatsPage';
  const COLUMNS = [{ id: 'Nom', type: 'Text' }, { id: 'Largeur', type: 'Numeric' }, { id: 'Hauteur', type: 'Numeric' }];
  const stub = () => window.__gristStub;
  const EMPTY_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };

  // --- Le document ----------------------------------------------------------------------------------------------------------------------------------------------------------
  const rowsOf = () => {
    const t = stub().state.rows[TABLE];
    return t ? t.id.map((id, i) => ({ id, name: t.Nom[i], w: t.Largeur[i], h: t.Hauteur[i] })) : [];
  };
  // Document sans table ni format enregistré, module vide, journal d'actions remis à zéro.
  function wipe() {
    const s = stub().state;
    s.tables = s.tables.filter(t => t !== TABLE);
    delete s.rows[TABLE];
    delete s.nextRowId[TABLE];
    SavedPageFormats.reset();
    stub().clearActionLog();
  }
  // Table déjà là, comme dans un document où l'équipe en a créé : [[nom, largeur mm, hauteur mm], ...].
  async function seed(rows) {
    const actions = [['AddTable', TABLE, COLUMNS]];
    rows.forEach(([Nom, Largeur, Hauteur]) => actions.push(['AddRecord', TABLE, null, { Nom, Largeur, Hauteur }]));
    await stub().applyUserActions(actions);
    stub().clearActionLog();
  }
  // Rend un appel du document en échec : `match(action)` désigne l'action qui échoue, jusqu'à ce que la restauration soit appelée.
  function failActions(match) {
    const original = grist.docApi.applyUserActions;
    grist.docApi.applyUserActions = function (actions) {
      if (actions.some(match)) return Promise.reject(new Error('refusé par le document (essai)'));
      return original.apply(this, arguments);
    };
    return () => { grist.docApi.applyUserActions = original; };
  }
  function countFetches() {
    const original = grist.docApi.fetchTable;
    const counter = { n: 0, restore() { grist.docApi.fetchTable = original; } };
    grist.docApi.fetchTable = function (table) { if (table === TABLE) counter.n++; return original.apply(this, arguments); };
    return counter;
  }

  // --- La page --------------------------------------------------------------------------------------------------------------------------------------------------------
  // Repart d'un modèle neuf, en Aperçu A4 (toute mesure de page n'a de sens qu'avec lui) ; les formats enregistrés ne bougent pas.
  async function freshPage(h) {
    await h.resetEditor();
    PageLayout.setMarginsMm(null);
    OrientationToggle.sync();
    h.setA4Preview(true);
    document.dispatchEvent(new CustomEvent('pp:pageLayoutChanged'));
    await h.sleep(300);
  }
  // Repart de plus d'un document sans table ni format enregistré.
  async function setup(h) {
    wipe();
    await freshPage(h);
  }
  function resetPage() {
    closeAll();
    PageLayout.setMarginsMm(null);
    OrientationToggle.sync();
  }
  function applySize(widthMm, heightMm) { return OrientationToggle.selectPageSize(widthMm, heightMm); }
  async function savedTemplate(h, nom, widthMm, heightMm) {
    // « Nouveau » d'abord : sans lui, Enregistrer réécrirait le modèle précédent au lieu d'en créer un.
    await h.clickButton('btn-new');
    await h.sleep(300);
    await freshPage(h);
    if (widthMm) applySize(widthMm, heightMm);
    Editor.setHTML('<p>Contenu</p>');
    document.getElementById('template-name').value = nom;
    await h.clickButton('btn-save');
    await h.sleep(500);
    return Templates.getCurrentId();
  }
  async function selectTemplate(h, id) {
    const select = document.getElementById('template-select');
    select.value = String(id);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await h.sleep(700);
  }

  // --- La fenêtre « Format libre… » -------------------------------------------------------------------------------------------------------------------------------------
  const modal = () => document.getElementById('pp-pagesize-modal');
  const isOpen = () => !!modal() && modal().style.display !== 'none';
  const field = side => document.getElementById('pp-pagesize-' + side);
  function type(side, value) { const input = field(side); input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); }
  const select = () => document.getElementById('pp-pagesize-saved');
  const trigger = () => modal().querySelector('.pp-pagesize-saved .ss-trigger');
  const saveButton = () => modal().querySelector('.pp-pagesize-save');
  const removeButton = () => modal().querySelector('.pp-pagesize-remove');
  const okButton = () => modal().querySelector('.var-modal-actions .var-modal-primary');
  const cancelButton = () => modal().querySelector('.var-modal-actions button:not(.var-modal-primary):not(.pp-pagesize-save)');
  const notice = () => { const e = document.getElementById('pp-pagesize-error'); return e.hidden ? '' : e.textContent; };
  const status = () => document.getElementById('pp-pagesize-status').textContent;
  // La fenêtre est ouverte par la vraie ligne du menu ; la liste attend la lecture du document (elle est grisée en attendant).
  async function openWindow(h) {
    document.querySelector('#v2-page-flyout [data-page-format="custom"]').click();
    for (let i = 0; i < 40 && (!isOpen() || select().disabled); i++) await h.sleep(50);
    return isOpen() && !select().disabled;
  }
  // Ce que la liste montre : ses lignes (hors invite), le choix, le texte du champ fermé et l'état de la corbeille.
  function listState() {
    const s = select();
    const t = trigger();
    return {
      value: s.value,
      names: Array.from(s.options).filter(o => !o.disabled).map(o => o.dataset.name),
      hints: Array.from(s.options).filter(o => !o.disabled).map(o => o.dataset.hint),
      shown: t.querySelector('.ss-name').textContent,
      placeholder: t.classList.contains('is-placeholder'),
      disabled: t.disabled,
      trashDisabled: removeButton().disabled,
    };
  }
  const fieldsText = () => field('width').value + ' × ' + field('height').value;
  const caption = () => modal().querySelector('.pp-pagesize-caption').textContent;
  // Choisit une ligne de la liste comme la personne : un clic sur le champ, un clic sur la ligne.
  async function pick(h, name) {
    trigger().click();
    await h.sleep(30);
    const row = Array.from(modal().querySelectorAll('.ss-panel .ss-option')).find(li => li.querySelector('.ss-name').textContent === name);
    if (!row) { if (modal().querySelector('.ss-panel:not([hidden])')) trigger().click(); return false; }
    row.click();
    await h.sleep(30);
    return true;
  }
  // La fenêtre de saisie et de confirmation (js/dialogs.js), au-dessus de celle du format.
  const dialog = () => document.getElementById('pp-dialog-modal');
  const dialogOpen = () => !!dialog() && dialog().style.display !== 'none';
  const dialogState = () => ({
    title: dialog().querySelector('h3').textContent,
    label: dialog().querySelector('.pp-dialog-label').hidden ? '' : dialog().querySelector('.pp-dialog-label').textContent,
    message: dialog().querySelector('.pp-dialog-message').hidden ? '' : dialog().querySelector('.pp-dialog-message').textContent,
    value: document.getElementById('pp-dialog-input').value,
    ok: dialog().querySelector('.var-modal-primary').textContent,
    cancel: dialog().querySelector('.var-modal-actions button:not(.var-modal-primary)').textContent,
    focus: document.activeElement === dialog().querySelector('.var-modal-primary') ? 'ok'
      : document.activeElement === dialog().querySelector('.var-modal-actions button:not(.var-modal-primary)') ? 'cancel'
        : document.activeElement === document.getElementById('pp-dialog-input') ? 'input' : '?',
  });
  async function answer(h, text) { // text = null : « Annuler »
    if (text === null) dialog().querySelector('.var-modal-actions button:not(.var-modal-primary)').click();
    else { document.getElementById('pp-dialog-input').value = text; dialog().querySelector('.var-modal-primary').click(); }
    await h.sleep(300);
  }
  // Enregistre la taille des champs sous `name` par les vrais boutons ; rend l'état de la fenêtre de saisie à son ouverture.
  async function saveAs(h, name) {
    saveButton().focus(); // un vrai clic ou un Entrée sur le bouton lui donne le focus : c'est lui que l'écriture grise puis rend
    saveButton().click();
    if (!dialogOpen()) return null;
    const asked = dialogState();
    await answer(h, name);
    return asked;
  }
  function describeFocus() {
    const a = document.activeElement;
    return a ? (a === document.body ? 'corps' : (a.id || a.className || a.tagName)) : 'rien';
  }
  function closeAll() {
    if (dialogOpen()) dialog().querySelector('.var-modal-actions button:not(.var-modal-primary)').click();
    if (isOpen()) cancelButton().click();
  }

  return [
    {
      id: 'savedfmt_table_is_read_when_the_window_opens_and_created_by_the_first_save_only',
      description: 'La table Publipostage_FormatsPage n\'est ni lue ni créée au démarrage ; l\'ouverture de la fenêtre la lit si elle existe (jamais pour la créer) et la liste dit « Aucun format enregistré. » ; seul le premier « Enregistrer ce format… » la crée (une fois : Nom, Largeur, Hauteur), chaque suivant ajoute une ligne',
      async run(h) {
        await setup(h);
        const problems = [];
        const fetches = countFetches();
        try {
          const atStart = { tables: stub().countActions('AddTable', TABLE), fetched: fetches.n };
          if (!(await openWindow(h))) return { pass: false, notes: 'la fenêtre ne s\'ouvre pas' };
          if (stub().countActions('AddTable', TABLE) !== 0 || fetches.n !== 0) problems.push('ouvrir la fenêtre sans table : créée=' + stub().countActions('AddTable', TABLE) + ' lectures=' + fetches.n);
          const empty = listState();
          if (empty.names.length || !empty.placeholder || empty.shown !== '— Choisir un format —' || empty.disabled || !empty.trashDisabled) problems.push('liste vide : ' + JSON.stringify(empty));
          trigger().click();
          await h.sleep(30);
          const message = modal().querySelector('.ss-empty');
          if (message.hidden || message.textContent !== 'Aucun format enregistré.') problems.push('message de la liste vide : ' + (message.hidden ? '(caché)' : message.textContent));
          const searchHint = modal().querySelector('.ss-input').placeholder;
          if (searchHint !== 'Chercher un format…') problems.push('zone de recherche : ' + searchHint);
          trigger().click();
          // Rien n'est écrit tant que la personne n'enregistre pas.
          type('width', '7'); type('height', '3,7');
          await h.sleep(100);
          if (stub().countActions('AddTable', TABLE) !== 0 || stub().countActions('AddRecord', TABLE) !== 0) problems.push('une saisie a écrit dans le document');
          await saveAs(h, 'Étiquette 70 × 37');
          const afterFirst = { tables: stub().countActions('AddTable', TABLE), records: stub().countActions('AddRecord', TABLE), rows: rowsOf() };
          if (afterFirst.tables !== 1 || afterFirst.records !== 1 || afterFirst.rows.length !== 1 || afterFirst.rows[0].name !== 'Étiquette 70 × 37' || afterFirst.rows[0].w !== 70 || afterFirst.rows[0].h !== 37) problems.push('premier enregistrement : ' + JSON.stringify(afterFirst));
          const cols = Object.keys(stub().state.rows[TABLE] || {}).filter(k => k !== 'id').sort().join();
          if (cols !== 'Hauteur,Largeur,Nom') problems.push('colonnes : ' + cols);
          type('width', '8,5'); type('height', '5,5');
          await saveAs(h, 'Carte 85 × 55');
          const afterSecond = { tables: stub().countActions('AddTable', TABLE), records: stub().countActions('AddRecord', TABLE), rows: rowsOf().map(r => r.name + ' ' + r.w + 'x' + r.h) };
          if (afterSecond.tables !== 1 || afterSecond.records !== 2 || afterSecond.rows.join() !== 'Étiquette 70 × 37 70x37,Carte 85 × 55 85x55') problems.push('second enregistrement : ' + JSON.stringify(afterSecond));
          // Une fenêtre rouverte relit le document (la lecture ne crée rien).
          cancelButton().click();
          await h.sleep(100);
          fetches.n = 0;
          await openWindow(h);
          if (fetches.n !== 1 || stub().countActions('AddTable', TABLE) !== 1) problems.push('réouverture : lectures=' + fetches.n + ' tables créées=' + stub().countActions('AddTable', TABLE));
          if (listState().names.join() !== 'Carte 85 × 55,Étiquette 70 × 37') problems.push('liste après réouverture : ' + JSON.stringify(listState().names));
          void atStart;
          if (atStart.tables !== 0 || atStart.fetched !== 0) problems.push('au démarrage : ' + JSON.stringify(atStart));
        } finally {
          fetches.restore();
          resetPage();
        }
        return { pass: problems.length === 0, notes: JSON.stringify(problems) };
      },
    },
    {
      id: 'savedfmt_the_list_is_read_once_shared_by_simultaneous_reads_read_again_on_demand_and_forgotten_by_reset',
      description: 'Le module ne lit la table qu\'une fois et garde la liste (un second appel ne relit pas) ; deux relectures simultanées n\'en font qu\'une ; load(true) relit et voit un format ajouté dans le document entre-temps ; add et remove tiennent la liste gardée à jour sans relire ; reset l\'oublie (vide, la lecture suivante repart du document).',
      async run(h) {
        await setup(h);
        const problems = [];
        const fetches = countFetches();
        const names = () => SavedPageFormats.list().map(e => e.name).join();
        try {
          await seed([['Étiquette 70 × 37', 70, 37]]);
          if (SavedPageFormats.list().length !== 0) problems.push('liste avant toute lecture : ' + names());
          await SavedPageFormats.load();
          await SavedPageFormats.load();
          if (names() !== 'Étiquette 70 × 37' || fetches.n !== 1) problems.push('deux lectures de suite : liste=' + names() + ' lectures=' + fetches.n);
          // Un format ajouté dans le document sans passer par le module : la liste gardée ne le voit qu\'après une relecture.
          await stub().applyUserActions([['AddRecord', TABLE, null, { Nom: 'Carte 85 × 55', Largeur: 85, Hauteur: 55 }]]);
          stub().clearActionLog();
          if (names() !== 'Étiquette 70 × 37') problems.push('liste gardée : ' + names());
          const lists = await Promise.all([SavedPageFormats.load(true), SavedPageFormats.load(true)]);
          if (fetches.n !== 2 || names() !== 'Carte 85 × 55,Étiquette 70 × 37' || lists[0] !== lists[1]) problems.push('deux relectures simultanées : lectures=' + fetches.n + ' liste=' + names());
          const added = await SavedPageFormats.add('Ticket', 80, 200);
          if (fetches.n !== 2 || names() !== 'Carte 85 × 55,Étiquette 70 × 37,Ticket') problems.push('après un ajout : lectures=' + fetches.n + ' liste=' + names());
          const removed = await SavedPageFormats.remove(added.rowId);
          if (removed !== true || fetches.n !== 2 || names() !== 'Carte 85 × 55,Étiquette 70 × 37') problems.push('après une suppression : retour=' + removed + ' lectures=' + fetches.n + ' liste=' + names());
          const inDocument = rowsOf().map(r => r.name).sort().join();
          if (inDocument !== 'Carte 85 × 55,Étiquette 70 × 37') problems.push('document après la suppression : ' + inDocument);
          SavedPageFormats.reset();
          if (SavedPageFormats.list().length !== 0) problems.push('après reset, la liste devrait être vide : ' + names());
          await SavedPageFormats.load();
          if (fetches.n !== 3 || names() !== 'Carte 85 × 55,Étiquette 70 × 37') problems.push('lecture après reset : lectures=' + fetches.n + ' liste=' + names());
        } finally {
          fetches.restore();
          resetPage();
        }
        return { pass: problems.length === 0, notes: JSON.stringify(problems) };
      },
    },
    {
      id: 'savedfmt_table_is_never_offered_as_a_user_table',
      description: 'La table Publipostage_FormatsPage fait partie des tables internes du widget : #Variable et les sélecteurs de table ne la proposent jamais (le vrai listTables() la rend, comme toutes les autres)',
      async run(h) {
        await setup(h);
        await seed([['Étiquette 70 × 37', 70, 37]]);
        stub().setVariables('PpAutreTable', { Nom: 'Text' });
        await GristAPI.refreshSchema();
        const tables = GristAPI.getTables().slice();
        const inVariables = GristAPI.getAllVariables().filter(v => v.table === TABLE).map(v => v.key);
        const listed = stub().state.tables.indexOf(TABLE) !== -1;
        return {
          pass: listed && tables.indexOf('PpAutreTable') !== -1 && tables.indexOf(TABLE) === -1 && inVariables.length === 0,
          notes: JSON.stringify({ listedByTheDocument: listed, tables, inVariables }),
        };
      },
    },
    {
      id: 'savedfmt_save_asks_a_name_proposes_the_size_and_keeps_names_unique',
      description: '« Enregistrer ce format… » ouvre la saisie du nom (la taille en toutes lettres par défaut, sous le premier nom libre) ; Annuler n\'écrit rien ; un nom vide ou d\'espaces prend la proposition ; un nom pris (casse et espaces ignorés) devient « nom (2) », « nom (3) », une série « (n) » continue ; le format enregistré est choisi dans la liste, la corbeille s\'active et l\'état est dit',
      async run(h) {
        await setup(h);
        const problems = [];
        try {
          await openWindow(h);
          if (!saveButton().disabled === false) problems.push('« Enregistrer ce format… » devrait être actif sur la page courante');
          type('width', '7'); type('height', '3,7');
          saveButton().click();
          if (!dialogOpen()) return { pass: false, notes: 'la saisie du nom ne s\'ouvre pas' };
          const asked = dialogState();
          if (asked.title !== 'Enregistrer ce format' || asked.label !== 'Nom du format' || asked.value !== '7 × 3,7 cm' || asked.ok !== 'Enregistrer' || asked.cancel !== 'Annuler' || asked.focus !== 'input') problems.push('saisie du nom : ' + JSON.stringify(asked));
          if (!isOpen()) problems.push('la fenêtre du format s\'est fermée sous la saisie');
          await answer(h, null);
          if (dialogOpen() || rowsOf().length !== 0 || stub().countActions('AddTable', TABLE) !== 0) problems.push('Annuler a écrit : ' + rowsOf().length + ' ligne(s)');
          if (!isOpen() || fieldsText() !== '7 × 3,7') problems.push('Annuler a touché la fenêtre : ' + isOpen() + ' ' + fieldsText());
          // Un nom.
          await saveAs(h, '  Étiquette   70 × 37  ');
          let rows = rowsOf();
          if (rows.length !== 1 || rows[0].name !== 'Étiquette 70 × 37' || rows[0].w !== 70 || rows[0].h !== 37) problems.push('premier format : ' + JSON.stringify(rows));
          const afterSave = listState();
          if (afterSave.value !== String(rows[0] && rows[0].id) || afterSave.shown !== 'Étiquette 70 × 37' || afterSave.placeholder || afterSave.trashDisabled || afterSave.hints.join() !== '7 × 3,7 cm') problems.push('liste après enregistrement : ' + JSON.stringify(afterSave));
          if (status() !== 'Format « Étiquette 70 × 37 » enregistré.') problems.push('état dit : ' + status());
          if (notice() !== '') problems.push('erreur après enregistrement : ' + notice());
          // Le bouton grisé le temps de l'écriture rend le focus à la fin : on peut enchaîner au clavier (Tab, Entrée) sans retomber sur le document.
          if (document.activeElement !== saveButton()) problems.push('focus après l\'enregistrement : ' + describeFocus());
          // La taille des champs est restée celle qu'on voit (le format choisi lui est égal).
          if (fieldsText() !== '7 × 3,7' || !(afterSave.value)) problems.push('champs après enregistrement : ' + fieldsText());
          // Noms pris : « (2) », « (3) », la série continue.
          const wanted = [
            ['Étiquette 70 × 37', 'Étiquette 70 × 37 (2)'],
            ['étiquette 70 × 37', 'étiquette 70 × 37 (3)'],
            [' ÉTIQUETTE 70 × 37 ', 'ÉTIQUETTE 70 × 37 (4)'],
            ['Étiquette 70 × 37 (2)', 'Étiquette 70 × 37 (5)'],
          ];
          for (const [typed, expected] of wanted) {
            await saveAs(h, typed);
            const last = rowsOf().slice(-1)[0];
            if (!last || last.name !== expected) problems.push('« ' + typed + ' » enregistré « ' + (last && last.name) + ' » (« ' + expected + ' » attendu)');
          }
          // Un nom vide, ou fait d'espaces : la proposition.
          await saveAs(h, '');
          if (rowsOf().slice(-1)[0].name !== '7 × 3,7 cm') problems.push('nom vide : ' + rowsOf().slice(-1)[0].name);
          // La proposition est déjà prise : la saisie propose le premier nom libre, et Entrée suffit.
          saveButton().click();
          const second = dialogState();
          if (second.value !== '7 × 3,7 cm (2)') problems.push('proposition quand la première est prise : ' + second.value);
          await answer(h, '   ');
          if (rowsOf().slice(-1)[0].name !== '7 × 3,7 cm (2)') problems.push('nom d\'espaces : ' + rowsOf().slice(-1)[0].name);
          rows = rowsOf();
          if (stub().countActions('AddTable', TABLE) !== 1 || rows.length !== 7) problems.push('lignes ' + rows.length + ', tables créées ' + stub().countActions('AddTable', TABLE));
          if (rows.some(r => r.w !== 70 || r.h !== 37)) problems.push('une taille a changé : ' + JSON.stringify(rows.map(r => [r.w, r.h])));
          // « Enregistrer ce format… » reste grisé tant qu'un champ n'est pas bon.
          type('height', 'abc');
          if (!saveButton().disabled) problems.push('« Enregistrer ce format… » actif sur une saisie mauvaise');
          saveButton().click();
          if (dialogOpen()) problems.push('la saisie du nom s\'ouvre sur une taille mauvaise');
          type('height', '');
          if (!saveButton().disabled) problems.push('« Enregistrer ce format… » actif sur un champ vide');
          type('height', '3,7');
          if (saveButton().disabled) problems.push('« Enregistrer ce format… » reste grisé sur une saisie bonne');
        } finally {
          resetPage();
        }
        return { pass: problems.length === 0, notes: JSON.stringify(problems) };
      },
    },
    {
      id: 'savedfmt_choosing_fills_the_fields_and_the_page_changes_on_confirm_only',
      description: 'Choisir un format de la liste (triée par nom, la taille en indice) remplit la largeur et la hauteur, redessine l\'aperçu et active la corbeille, sans toucher la page ; « Valider » la pose (sens compris), « Annuler » la laisse ; la fenêtre rouverte revient à l\'invite',
      async run(h) {
        await setup(h);
        const problems = [];
        try {
          await seed([['Étiquette 70 × 37', 70, 37], ['Carte 85 × 55', 85, 55], ['Flyer', 100, 210], ['Affiche', 400, 500]]);
          await openWindow(h);
          const start = listState();
          if (start.names.join() !== 'Affiche,Carte 85 × 55,Étiquette 70 × 37,Flyer' || start.hints.join() !== '40 × 50 cm,8,5 × 5,5 cm,7 × 3,7 cm,10 × 21 cm') problems.push('liste : ' + JSON.stringify([start.names, start.hints]));
          if (start.value !== '' || !start.placeholder || !start.trashDisabled) problems.push('départ : ' + JSON.stringify(start));
          if (!(await pick(h, 'Étiquette 70 × 37'))) return { pass: false, notes: 'la ligne « Étiquette 70 × 37 » n\'est pas dans la liste ouverte' };
          const chosen = listState();
          if (fieldsText() !== '7 × 3,7' || caption() !== '7 × 3,7 cm' || modal().querySelector('.pp-pagesize-orientation').textContent !== 'Paysage') problems.push('champs après le choix : ' + fieldsText() + ' / ' + caption());
          if (chosen.shown !== 'Étiquette 70 × 37' || chosen.placeholder || chosen.trashDisabled || chosen.value === '') problems.push('liste après le choix : ' + JSON.stringify(chosen));
          if (okButton().disabled || notice() !== '') problems.push('« Valider » ou erreur après le choix : ' + okButton().disabled + ' ' + notice());
          if (PageLayout.getFormat() !== 'A4' || PageLayout.isLandscape()) problems.push('la page a changé avant « Valider » : ' + PageLayout.getFormat());
          okButton().click();
          await h.sleep(300);
          if (isOpen() || PageLayout.getFormat() !== '37x70' || !PageLayout.isLandscape()) problems.push('« Valider » : ouverte=' + isOpen() + ' format=' + PageLayout.getFormat() + ' paysage=' + PageLayout.isLandscape());
          const size = PageLayout.getPageSizeMm();
          if (size.width !== 70 || size.height !== 37) problems.push('taille posée : ' + JSON.stringify(size));
          // Réouverture : les champs sont ceux de la page, la liste revient à l'invite (le modèle ne garde pas le nom du format).
          await openWindow(h);
          const reopened = listState();
          if (fieldsText() !== '7 × 3,7' || reopened.value !== '' || !reopened.placeholder || !reopened.trashDisabled) problems.push('réouverture : ' + fieldsText() + ' ' + JSON.stringify(reopened));
          // Un portrait, puis « Annuler » : la page reste.
          await pick(h, 'Affiche');
          if (fieldsText() !== '40 × 50' || modal().querySelector('.pp-pagesize-orientation').textContent !== 'Portrait') problems.push('Affiche : ' + fieldsText());
          cancelButton().click();
          await h.sleep(100);
          if (PageLayout.getFormat() !== '37x70') problems.push('« Annuler » a changé la page : ' + PageLayout.getFormat());
          // Un format qui fait une page de la liste redevient ce format (A5 = 148 x 210).
          await seed([]).catch(() => {});
          await stub().applyUserActions([['AddRecord', TABLE, null, { Nom: 'Demi-A4', Largeur: 148, Hauteur: 210 }]]);
          await openWindow(h);
          await pick(h, 'Demi-A4');
          okButton().click();
          await h.sleep(300);
          if (PageLayout.getFormat() !== 'A5') problems.push('148 × 210 devrait redevenir A5 : ' + PageLayout.getFormat());
        } finally {
          resetPage();
        }
        return { pass: problems.length === 0, notes: JSON.stringify(problems) };
      },
    },
    {
      id: 'savedfmt_editing_a_field_after_the_choice_puts_the_list_back_to_its_prompt',
      description: 'Une fois un format choisi, modifier la largeur ou la hauteur (même pour un texte mauvais) remet la liste à « — Choisir un format — » et grise la corbeille : le format choisi n\'est plus celui qu\'on voit ; le même format se rechoisit ensuite',
      async run(h) {
        await setup(h);
        const problems = [];
        try {
          await seed([['Carte 85 × 55', 85, 55], ['Flyer', 100, 210]]);
          await openWindow(h);
          await pick(h, 'Carte 85 × 55');
          if (listState().value === '') problems.push('le choix n\'a pas pris');
          type('height', '5,6');
          const edited = listState();
          if (edited.value !== '' || !edited.placeholder || !edited.trashDisabled || edited.shown !== '— Choisir un format —') problems.push('après 5,6 : ' + JSON.stringify(edited));
          type('height', '5,5');
          if (listState().value !== '') problems.push('revenir à la taille d\'origine ne rechoisit pas le format tout seul : ' + listState().value);
          await pick(h, 'Carte 85 × 55');
          if (listState().value === '' || fieldsText() !== '8,5 × 5,5') problems.push('rechoisir : ' + JSON.stringify(listState()) + ' ' + fieldsText());
          type('width', 'abc');
          if (listState().value !== '' || !listState().trashDisabled) problems.push('texte mauvais : ' + JSON.stringify(listState()));
          type('width', '8,5');
          await pick(h, 'Flyer');
          type('width', '');
          if (listState().value !== '') problems.push('champ vidé : ' + listState().value);
          // Le choix ne remplace pas une page restée telle quelle : un champ retouché garde la page courante tant que « Valider » n'est pas pressé.
          if (PageLayout.getFormat() !== 'A4') problems.push('la page a changé : ' + PageLayout.getFormat());
        } finally {
          resetPage();
        }
        return { pass: problems.length === 0, notes: JSON.stringify(problems) };
      },
    },
    {
      id: 'savedfmt_delete_asks_first_and_the_templates_keep_their_size',
      description: 'La corbeille est grisée sans format choisi ; elle demande confirmation (focus sur « Annuler », le nom et la taille dans le message) ; « Annuler » ne retire rien ; « Supprimer » retire la ligne, rebâtit la liste et rend le focus à la liste ; un modèle qui avait pris ce format garde sa taille ; un format déjà retiré par quelqu\'un d\'autre ne casse rien',
      async run(h) {
        await setup(h);
        const problems = [];
        try {
          await seed([['Carte 85 × 55', 85, 55], ['Flyer', 100, 210]]);
          const other = await savedTemplate(h, 'Modèle autre', null, null);
          const card = await savedTemplate(h, 'Modèle carte', null, null);
          await openWindow(h);
          if (!removeButton().disabled || removeButton().getAttribute('aria-label') !== 'Supprimer le format enregistré' || removeButton().title !== 'Supprimer le format enregistré') problems.push('corbeille sans choix : grisée=' + removeButton().disabled + ' ' + removeButton().title);
          removeButton().click();
          await h.sleep(50);
          if (dialogOpen()) problems.push('la corbeille grisée a ouvert une confirmation');
          // Le modèle « carte » prend le format par la liste, puis s'enregistre avec cette taille.
          await pick(h, 'Carte 85 × 55');
          okButton().click();
          await h.sleep(300);
          await h.clickButton('btn-save');
          await h.sleep(500);
          if (Templates.getCurrentId() !== card || PageLayout.getFormat() !== '55x85') problems.push('la carte n\'a pas pris : ' + PageLayout.getFormat() + ' modèle ' + Templates.getCurrentId() + '/' + card);
          // La suppression : confirmation, focus sur « Annuler » (un Entrée distrait ne supprime rien).
          await openWindow(h);
          await pick(h, 'Carte 85 × 55');
          removeButton().click();
          await h.sleep(50);
          if (!dialogOpen()) return { pass: false, notes: 'la confirmation ne s\'ouvre pas : ' + JSON.stringify(problems) };
          const asked = dialogState();
          if (asked.title !== 'Supprimer ce format ?' || asked.ok !== 'Supprimer' || asked.cancel !== 'Annuler' || asked.focus !== 'cancel') problems.push('confirmation : ' + JSON.stringify(asked));
          if (asked.message !== 'Le format « Carte 85 × 55 » (8,5 × 5,5 cm) sera retiré de la liste. Les modèles qui l’utilisent gardent leur taille.') problems.push('message : ' + asked.message);
          await answer(h, null);
          if (rowsOf().length !== 2 || listState().value === '' || !isOpen()) problems.push('« Annuler » : lignes=' + rowsOf().length + ' choix=' + listState().value + ' ouverte=' + isOpen());
          removeButton().click();
          await h.sleep(50);
          dialog().querySelector('.var-modal-primary').click();
          await h.sleep(400);
          const after = listState();
          if (rowsOf().length !== 1 || rowsOf()[0].name !== 'Flyer' || stub().countActions('RemoveRecord', TABLE) !== 1) problems.push('après « Supprimer » : ' + JSON.stringify(rowsOf()) + ' retraits=' + stub().countActions('RemoveRecord', TABLE));
          if (after.names.join() !== 'Flyer' || after.value !== '' || !after.placeholder || !after.trashDisabled) problems.push('liste après suppression : ' + JSON.stringify(after));
          if (status() !== 'Format « Carte 85 × 55 » supprimé.') problems.push('état dit : ' + status());
          if (document.activeElement !== trigger()) problems.push('focus après suppression : ' + (document.activeElement && (document.activeElement.id || document.activeElement.className || document.activeElement.tagName)));
          if (fieldsText() !== '8,5 × 5,5') problems.push('les champs ont changé : ' + fieldsText());
          cancelButton().click();
          await h.sleep(100);
          // Copie, pas lien : le modèle garde sa taille, même rouvert depuis la liste des modèles.
          if (PageLayout.getFormat() !== '55x85') problems.push('la page a changé : ' + PageLayout.getFormat());
          await selectTemplate(h, other);
          if (PageLayout.getFormat() !== 'A4') problems.push('l\'autre modèle : ' + PageLayout.getFormat());
          await selectTemplate(h, card);
          if (PageLayout.getFormat() !== '55x85') problems.push('modèle rouvert : ' + PageLayout.getFormat());
          // Un format retiré entre-temps par quelqu\'un d\'autre : rien ne casse, la liste se vide.
          await openWindow(h);
          await pick(h, 'Flyer');
          await stub().applyUserActions([['RemoveRecord', TABLE, rowsOf()[0].id]]);
          removeButton().click();
          await h.sleep(50);
          dialog().querySelector('.var-modal-primary').click();
          await h.sleep(400);
          if (notice() !== '' || listState().names.length !== 0) problems.push('format déjà retiré : erreur=' + notice() + ' liste=' + JSON.stringify(listState().names));
        } finally {
          resetPage();
        }
        return { pass: problems.length === 0, notes: JSON.stringify(problems) };
      },
    },
    {
      id: 'savedfmt_unreadable_rows_are_ignored_and_names_sort_naturally',
      description: 'Une ligne sans nom, d\'une taille hors de 2 à 55,88 cm ou non numérique est ignorée (et laissée telle quelle dans Grist) ; une taille est arrondie au dixième de millimètre ; la liste est triée par nom, « Étiquette 2 » avant « Étiquette 10 »',
      async run(h) {
        await setup(h);
        const problems = [];
        try {
          await seed([
            ['  ', 70, 37], ['Trop petit', 10, 10], ['Trop grand', 600, 100], ['Zéro', 0, 0], ['Texte', 'abc', 'def'], ['Bon', 100, 150],
            ['Étiquette 10', 70, 37], ['Étiquette 2', 70, 37], ['étiquette 1', 70, 37], ['Arrondi', 70.04, 36.96], ['Limite basse', 20, 20], ['Limite haute', 558.8, 558.8],
          ]);
          await openWindow(h);
          const s = listState();
          const expected = 'Arrondi,Bon,étiquette 1,Étiquette 2,Étiquette 10,Limite basse,Limite haute';
          if (s.names.join() !== expected) problems.push('liste : ' + s.names.join() + ' (attendu ' + expected + ')');
          if (rowsOf().length !== 12) problems.push('une ligne illisible a été retirée ou corrigée dans Grist : ' + rowsOf().length + ' lignes');
          await pick(h, 'Arrondi');
          if (fieldsText() !== '7 × 3,7') problems.push('arrondi : ' + fieldsText());
          await pick(h, 'Limite haute');
          if (fieldsText() !== '55,88 × 55,88' || notice() !== '' || okButton().disabled) problems.push('limite haute : ' + fieldsText() + ' ' + notice());
          await pick(h, 'Limite basse');
          if (fieldsText() !== '2 × 2' || notice() !== '' || okButton().disabled) problems.push('limite basse : ' + fieldsText() + ' ' + notice());
          // La recherche : accents et casse ignorés, tous les mots.
          trigger().click();
          await h.sleep(30);
          const input = modal().querySelector('.ss-input');
          input.value = 'etiquette 1';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          const found = Array.from(modal().querySelectorAll('.ss-panel .ss-option .ss-name')).map(n => n.textContent).join();
          if (found !== 'étiquette 1,Étiquette 10') problems.push('recherche « etiquette 1 » : ' + found);
          input.value = 'zzz';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          const none = modal().querySelector('.ss-empty');
          if (none.hidden || none.textContent !== 'Aucun format ne correspond.') problems.push('aucun résultat : ' + (none.hidden ? '(caché)' : none.textContent));
          trigger().click();
        } finally {
          resetPage();
        }
        return { pass: problems.length === 0, notes: JSON.stringify(problems) };
      },
    },
    {
      id: 'savedfmt_a_failed_write_is_said_under_the_fields_and_nothing_is_half_done',
      description: 'Si le document refuse l\'écriture, la fenêtre le dit sous les champs (« Le format n\'a pas pu être enregistré… » / « …supprimé… »), la liste et la page restent comme avant, « Enregistrer ce format… » redevient actif ; l\'erreur part à la frappe suivante ; la reprise réussit',
      async run(h) {
        await setup(h);
        const problems = [];
        let restore = null;
        try {
          await openWindow(h);
          type('width', '7'); type('height', '3,7');
          restore = failActions(a => a[0] === 'AddRecord' && a[1] === TABLE);
          await saveAs(h, 'Étiquette 70 × 37');
          if (notice() !== 'Le format n’a pas pu être enregistré dans le document.') problems.push('erreur d\'écriture : « ' + notice() + ' »');
          if (document.getElementById('pp-pagesize-error').getAttribute('role') !== 'alert') problems.push('l\'erreur n\'est pas une alerte');
          if (listState().names.length || listState().value !== '' || rowsOf().length !== 0) problems.push('liste ou table après l\'échec : ' + JSON.stringify([listState().names, rowsOf()]));
          if (saveButton().disabled || !isOpen() || fieldsText() !== '7 × 3,7') problems.push('fenêtre après l\'échec : save grisé=' + saveButton().disabled + ' ouverte=' + isOpen() + ' ' + fieldsText());
          if (document.activeElement !== saveButton()) problems.push('focus après l\'échec d\'enregistrement : ' + describeFocus());
          type('height', '3,8');
          if (notice() !== '') problems.push('l\'erreur reste après une frappe : ' + notice());
          type('height', '3,7');
          restore();
          restore = null;
          await saveAs(h, 'Étiquette 70 × 37');
          if (notice() !== '' || rowsOf().length !== 1 || listState().names.join() !== 'Étiquette 70 × 37') problems.push('reprise : « ' + notice() + ' » ' + JSON.stringify(rowsOf()));
          // La suppression refusée.
          restore = failActions(a => a[0] === 'RemoveRecord' && a[1] === TABLE);
          removeButton().focus();
          removeButton().click();
          await h.sleep(50);
          dialog().querySelector('.var-modal-primary').click();
          await h.sleep(400);
          if (notice() !== 'Le format n’a pas pu être supprimé du document.') problems.push('erreur de suppression : « ' + notice() + ' »');
          if (document.activeElement !== removeButton()) problems.push('focus après l\'échec de suppression : ' + describeFocus());
          if (rowsOf().length !== 1 || listState().names.join() !== 'Étiquette 70 × 37' || listState().value === '') problems.push('liste après la suppression refusée : ' + JSON.stringify(listState()));
          if (removeButton().disabled) problems.push('la corbeille reste grisée après un échec');
        } finally {
          if (restore) restore();
          resetPage();
        }
        return { pass: problems.length === 0, notes: JSON.stringify(problems) };
      },
    },
    {
      id: 'savedfmt_texts_follow_the_language',
      description: 'Libellés, invite, recherche, messages vides, boutons, saisie du nom, confirmation et états de la liste des formats suivent la langue (dimensions au point en anglais) ; aucune clé sans traduction',
      async run(h) {
        await setup(h);
        const problems = [];
        try {
          I18n.setLang('en');
          await h.sleep(100);
          // Un document sans format : la liste dit qu'il n'y en a pas.
          await openWindow(h);
          trigger().click();
          await h.sleep(30);
          const none = modal().querySelector('.ss-empty');
          if (none.hidden || none.textContent !== 'No saved formats.') problems.push('liste vide : ' + (none.hidden ? '(cachée)' : none.textContent));
          trigger().click();
          cancelButton().click();
          await h.sleep(100);
          await seed([['Carte', 85, 55]]);
          await openWindow(h);
          const labels = Array.from(modal().querySelectorAll('.pp-pagesize-label')).map(l => l.textContent).join();
          const s = listState();
          if (labels !== 'Format,Width,Height' || s.shown !== '— Choose a format —' || s.hints.join() !== '8.5 × 5.5 cm') problems.push('libellés : ' + labels + ' ' + JSON.stringify(s));
          if (saveButton().textContent !== 'Save this format…' || removeButton().title !== 'Delete the saved format' || removeButton().getAttribute('aria-label') !== 'Delete the saved format') problems.push('boutons : ' + saveButton().textContent + ' / ' + removeButton().title);
          trigger().click();
          await h.sleep(30);
          const search = modal().querySelector('.ss-input').placeholder;
          if (search !== 'Search formats…') problems.push('recherche : ' + search);
          const input = modal().querySelector('.ss-input');
          input.value = 'zzz';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          if (modal().querySelector('.ss-empty').textContent !== 'No format matches.') problems.push('aucun résultat : ' + modal().querySelector('.ss-empty').textContent);
          trigger().click();
          type('width', '7'); type('height', '3,7');
          saveButton().click();
          const asked = dialogState();
          if (asked.title !== 'Save this format' || asked.label !== 'Format name' || asked.value !== '7 × 3.7 cm' || asked.ok !== 'Save' || asked.cancel !== 'Cancel') problems.push('saisie du nom : ' + JSON.stringify(asked));
          await answer(h, 'Label');
          if (status() !== 'Format “Label” saved.') problems.push('état : ' + status());
          removeButton().click();
          await h.sleep(50);
          const confirm = dialogState();
          if (confirm.title !== 'Delete this format?' || confirm.ok !== 'Delete' || confirm.message !== 'The format “Label” (7 × 3.7 cm) will be removed from the list. Templates that use it keep their size.') problems.push('confirmation : ' + JSON.stringify(confirm));
          dialog().querySelector('.var-modal-primary').click();
          await h.sleep(400);
          if (status() !== 'Format “Label” deleted.') problems.push('état après suppression : ' + status());
          if (/\{(name|size|min|max)\}/.test(JSON.stringify([asked, confirm, status()]))) problems.push('un {…} non remplacé');
        } finally {
          I18n.setLang('fr');
          await h.sleep(150);
          resetPage();
        }
        return { pass: problems.length === 0, notes: JSON.stringify(problems) };
      },
    },
    {
      id: 'savedfmt_a_format_is_reused_on_another_template_and_feeds_the_assembly',
      description: 'Le format enregistré depuis un modèle se retrouve sur un autre (la liste vient du document, pas de la mémoire du module) : le second modèle prend la même taille, et l\'assemblage avant impression suit cette page',
      async run(h) {
        await setup(h);
        const problems = [];
        try {
          const first = await savedTemplate(h, 'Modèle étiquettes A', 70, 37);
          if (PageLayout.getFormat() !== '37x70') problems.push('premier modèle : ' + PageLayout.getFormat());
          await openWindow(h);
          await saveAs(h, 'Étiquette 70 × 37');
          cancelButton().click();
          await h.sleep(100);
          const second = await savedTemplate(h, 'Modèle étiquettes B', null, null);
          if (PageLayout.getFormat() !== 'A4' || second === first) problems.push('second modèle : ' + PageLayout.getFormat() + ' id ' + second + '/' + first);
          SavedPageFormats.reset();
          await openWindow(h);
          if (listState().names.join() !== 'Étiquette 70 × 37') problems.push('la liste du document n\'est pas retrouvée : ' + JSON.stringify(listState().names));
          await pick(h, 'Étiquette 70 × 37');
          okButton().click();
          await h.sleep(300);
          if (PageLayout.getFormat() !== '37x70' || !PageLayout.isLandscape()) problems.push('second modèle après le choix : ' + PageLayout.getFormat() + ' paysage=' + PageLayout.isLandscape());
          // L'assemblage suit : la page tient sur la feuille, le résumé et le dessin existent.
          window.__gristStub.setVariables('Clients', { Nom: 'Text' });
          await GristAPI.refreshSchema();
          Editor.setHeaderFooterData(EMPTY_HF);
          const opening = SheetAssemblyDialog.open({ count: 6, table: 'Clients' });
          await h.sleep(150);
          const dlg = document.getElementById('pp-sheets-modal');
          const summary = dlg.querySelector('.pp-sheets-summary').textContent;
          const slots = dlg.querySelectorAll('.pp-sheets-slot').length;
          if (!slots || /ne tient/.test(summary) || /n’est pas possible/.test(summary)) problems.push('assemblage : ' + summary + ' / ' + slots + ' emplacement(s)');
          dlg.querySelector('.var-modal-actions button:not(.var-modal-primary)').click();
          await opening;
        } finally {
          const dlg = document.getElementById('pp-sheets-modal');
          if (dlg && dlg.style.display !== 'none') dlg.querySelector('.var-modal-actions button:not(.var-modal-primary)').click();
          resetPage();
        }
        return { pass: problems.length === 0, notes: JSON.stringify(problems) };
      },
    },
    {
      id: 'savedfmt_window_keyboard_order_and_labels',
      description: 'Tab parcourt la fenêtre dans l\'ordre de la page : la liste, la corbeille quand elle est active, la largeur, la hauteur, « Enregistrer ce format… », « Annuler », « Valider » ; le champ de la liste est nommé par son libellé « Format »',
      async run(h) {
        await setup(h);
        const problems = [];
        try {
          await seed([['Carte 85 × 55', 85, 55]]);
          await openWindow(h);
          const order = () => Array.from(modal().querySelectorAll('button, input, select'))
            .filter(e => !e.disabled && e.tabIndex >= 0 && !e.closest('[hidden]') && e.getClientRects().length > 0)
            .map(e => e.classList.contains('ss-trigger') ? 'liste' : e.classList.contains('pp-pagesize-remove') ? 'corbeille' : e.classList.contains('pp-pagesize-save') ? 'enregistrer'
              : e.id === 'pp-pagesize-width' ? 'largeur' : e.id === 'pp-pagesize-height' ? 'hauteur' : e.classList.contains('var-modal-primary') ? 'valider' : 'annuler').join();
          if (order() !== 'liste,largeur,hauteur,enregistrer,annuler,valider') problems.push('ordre sans choix : ' + order());
          await pick(h, 'Carte 85 × 55');
          if (order() !== 'liste,corbeille,largeur,hauteur,enregistrer,annuler,valider') problems.push('ordre avec un choix : ' + order());
          const name = trigger().getAttribute('aria-labelledby').split(' ').map(id => (document.getElementById(id) || {}).textContent).join('|');
          if (!/^Format\|/.test(name)) problems.push('nom accessible de la liste : ' + name);
          if (document.activeElement !== trigger()) problems.push('focus après le choix : ' + (document.activeElement && (document.activeElement.id || document.activeElement.className)));
        } finally {
          resetPage();
        }
        return { pass: problems.length === 0, notes: JSON.stringify(problems) };
      },
    },
  ];
})();
