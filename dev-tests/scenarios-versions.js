// Suite "versions" - l'historique des versions d'un modèle, dans la vraie page (js/versions-store.js, js/versions-history.js, ce que js/main.js et js/templates.js en font).
// Les règles de garde, les plafonds et les pannes se jouent sans navigateur, sur une horloge que le test avance : dev-tests/unit-versions.mjs. Ici, ce que seule la page montre :
//  - la ligne « Historique des versions… » du menu Enregistrer, et la fenêtre qui ne se charge qu'à son premier clic (et pas pour un modèle jamais enregistré) ;
//  - un vrai Enregistrer garde la version dans le MÊME lot que le modèle, et ne lit jamais la table des versions ;
//  - la fenêtre : « Version actuelle » en tête, les versions de la plus récente à la plus ancienne avec leur personne, leur nom et leur genre, l'aperçu de celle qu'on choisit
//    (document, e-mail avec objet et destinataires, macro-modèle avec sa composition), l'historique vide, la lecture qui échoue, la version illisible ;
//  - « Restaurer cette version » : la question, le modèle et l'écran qui reprennent l'état choisi, l'état remplacé gardé, ce qui était tapé enregistré d'abord, l'échec dit dans
//    la fenêtre qui reste ouverte, le refus qui n'écrit rien ;
//  - la table fait partie des tables internes : jamais offerte comme table du document.
(function () {
  const cases = [];
  const MODELS = 'Publipostage_Modeles';
  const VERSIONS = 'Publipostage_Versions';
  const TICK_MS = 2500; // = AUTOSAVE_INTERVAL_MS (js/main.js)
  const stub = () => window.__gristStub;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  async function waitFor(test, ms) {
    const until = Date.now() + (ms || 4000);
    while (Date.now() < until) {
      if (test()) return true;
      await sleep(40);
    }
    return !!test();
  }

  // --- La fenêtre ------------------------------------------------------------------------------------------------------------------------------------------------------
  const overlay = () => document.getElementById('pp-versions-modal');
  const isOpen = () => !!overlay() && overlay().style.display !== 'none';
  const rows = () => Array.from(document.querySelectorAll('#pp-versions-modal .pp-versions-row'));
  const checkedRow = () => rows().find(row => row.getAttribute('aria-checked') === 'true') || null;
  const part = (row, name) => { const node = row && row.querySelector('.pp-versions-' + name); return node ? node.textContent : ''; };
  const previewText = () => (document.querySelector('#pp-versions-modal .pp-versions-tiptap') || {}).textContent || '';
  const extraText = () => { const node = document.querySelector('#pp-versions-modal .pp-versions-extra'); return node && !node.hidden ? node.textContent : ''; };
  const sheetShown = () => { const node = document.querySelector('#pp-versions-modal .pp-versions-sheet'); return !!node && !node.hidden; };
  const statusText = () => { const node = document.querySelector('#pp-versions-modal .pp-versions-status'); return node && !node.hidden ? node.textContent : ''; };
  const emptyText = () => { const node = document.querySelector('#pp-versions-modal .pp-versions-empty'); return node && !node.hidden ? node.textContent : ''; };
  const restoreButton = () => document.querySelector('#pp-versions-modal .pp-modal-actions .var-modal-primary');
  const closeButton = () => document.querySelector('#pp-versions-modal .pp-modal-actions button:not(.var-modal-primary)');
  const headText = () => (document.querySelector('#pp-versions-modal .pp-versions-head') || {}).textContent || '';
  const statusMsg = () => document.getElementById('status-msg').textContent;

  async function openHistory() {
    document.getElementById('v2-btn-history').click();
    await waitFor(() => isOpen(), 4000);
    await waitFor(() => rows().length > 0, 4000);
  }
  async function closeHistory() {
    if (isOpen() && closeButton()) closeButton().click();
    await waitFor(() => !isOpen(), 2000);
  }
  async function pickRow(index) {
    rows()[index].click();
    await sleep(60);
  }

  // --- Le document de test --------------------------------------------------------------------------------------------------------------------------------------------
  // Chaque scénario repart d'une table des versions absente et d'une mémoire de session vide.
  function resetVersions() {
    VersionsStore.reset();
    if (stub().state.tables.indexOf(VERSIONS) !== -1) stub().dropTable(VERSIONS);
  }

  // La personne devant l'écran, connue de la session comme après son premier enregistrement : « Moi Même <moi@exemple.fr> » est l'auteur de ce qu'elle enregistre.
  async function identify() {
    stub().setUserEmail('moi@exemple.fr');
    stub().setUserName('Moi Même');
    await GristAPI.getCurrentUserEmail();
    await GristAPI.getCurrentUserName();
  }

  // Un document neuf : le modèle du scénario précédent n'est plus le modèle courant AVANT que l'éditeur ne soit vidé. Sans cela, un passage de l'enregistrement automatique (toutes les 2,5 s)
  // qui tombe entre « vider l'éditeur » et « Nouveau » écrit le document vide dans ce modèle, et sa copie dans la table des versions du scénario suivant.
  async function freshDocument(h) {
    Templates.setCurrentId(null);
    await h.resetEditor();
    await h.clickButton('btn-new');
  }

  // Un modèle réellement enregistré par le vrai bouton Enregistrer : le modèle courant de la page.
  async function savedModel(h, nom, html) {
    await identify();
    await freshDocument(h);
    await h.sleep(250);
    Editor.setHTML(html);
    document.getElementById('template-name').value = nom;
    await h.clickButton('btn-save');
    await h.sleep(500);
    return Templates.getCurrentId();
  }

  // L'état d'une version, comme VersionsStore.snapshotOf l'écrit.
  const stateOf = (html, extra) => Object.assign({ v: 1, typeModele: 'document', contenu: html, nomFichierPDF: '', headerFooter: null, margins: null }, extra || {});

  // Pose une version dans la table, comme l'enregistrement l'aurait fait (la table est créée au besoin, avec le jeton du modèle).
  async function addVersion(id, spec) {
    const token = await Templates.ensureToken(id);
    await GristAPI.ensureTable(VersionsStore.TABLE_NAME, VersionsStore.TABLE_COLUMNS);
    const data = spec.raw !== undefined ? spec.raw : await VersionsStore.pack(VersionsStore.stable(spec.state || stateOf(spec.html)));
    await grist.docApi.applyUserActions([['AddRecord', VERSIONS, null, {
      Jeton: token, Date: Math.floor((Date.now() - (spec.minutesAgo || 0) * 60000) / 1000), Auteur: spec.author || '', Nom: spec.name || '', Genre: spec.genre || '', Donnees: data,
    }]]);
  }
  const versionRows = () => (stub().state.rows[VERSIONS] ? stub().state.rows[VERSIONS].id.map(rowId => stub().getRow(VERSIONS, rowId)) : []);
  const modelRow = id => stub().getRow(MODELS, id);
  // Les versions gardées pour CE modèle (son jeton) : ce qu'un scénario compte, jamais les lignes d'un autre modèle de la même table.
  const versionRowsOf = id => { const token = modelRow(id) && modelRow(id).Jeton; return versionRows().filter(row => row.Jeton === token); };

  function failActions(match) {
    const original = grist.docApi.applyUserActions;
    grist.docApi.applyUserActions = function (actions) {
      if (actions.some(match)) return Promise.reject(new Error('refusé par le document (essai)'));
      return original.apply(this, arguments);
    };
    return () => { grist.docApi.applyUserActions = original; };
  }
  function recordBatches() {
    const original = grist.docApi.applyUserActions;
    const batches = [];
    grist.docApi.applyUserActions = function (actions) { batches.push(actions.map(action => action.slice())); return original.apply(this, arguments); };
    return { batches, restore() { grist.docApi.applyUserActions = original; } };
  }
  function countFetches(table) {
    const original = grist.docApi.fetchTable;
    const counter = { n: 0, restore() { grist.docApi.fetchTable = original; } };
    grist.docApi.fetchTable = function (name) { if (name === table) counter.n++; return original.apply(this, arguments); };
    return counter;
  }

  async function finish(h, problems) {
    await closeHistory();
    stub().setLatency(0);
    return { pass: problems.length === 0, notes: JSON.stringify(problems) };
  }

  // --- 1. Le menu et le chargement paresseux (en premier : plus rien n'a ouvert la fenêtre) ---------------------------------------------------------------------------
  cases.push({
    id: 'versions_menu_row_and_window_loads_on_first_click',
    description: 'La ligne « Historique des versions… » est dans le menu Enregistrer, après « Enregistrer sous… » ; la fenêtre ne se charge ni au démarrage ni pour un modèle jamais enregistré, mais à son premier clic sur un modèle enregistré, une seule fois',
    async run(h) {
      const problems = [];
      const row = document.getElementById('v2-btn-history');
      const flyout = document.getElementById('v2-save-flyout');
      const saveAs = document.getElementById('v2-btn-save-as');
      if (!row || !flyout || !flyout.contains(row)) return { pass: false, notes: 'la ligne n\'est pas dans le menu Enregistrer' };
      if (row.getAttribute('role') !== 'menuitem' || row.getAttribute('tabindex') !== '0') problems.push('rôle ou tabindex : ' + row.getAttribute('role') + ' ' + row.getAttribute('tabindex'));
      if (row.textContent.trim() !== 'Historique des versions…') problems.push('texte : ' + row.textContent);
      if (!(saveAs.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING)) problems.push('la ligne devrait suivre « Enregistrer sous… »');
      if (!(row.compareDocumentPosition(document.getElementById('v2-btn-autosave')) & Node.DOCUMENT_POSITION_FOLLOWING)) problems.push('la ligne devrait précéder « Enregistrement automatique »');
      if (typeof VersionsStore === 'undefined') problems.push('le magasin devrait être chargé avec la page');
      if (typeof VersionsHistory !== 'undefined') problems.push('la fenêtre ne devrait pas être chargée au démarrage');
      const tag = document.querySelector('script[type="text/x-lazy-module"][data-module="versions"]');
      if (!tag || !/^js\/versions-history\.js\?v=/.test(tag.getAttribute('src') || '')) problems.push('balise inerte de la fenêtre : ' + (tag && tag.getAttribute('src')));
      const loaded = () => document.head.querySelectorAll('script[src*="versions-history.js"]').length;
      if (loaded() !== 0) problems.push('un script de la fenêtre est déjà dans la page');
      resetVersions();
      await identify();
      // Un modèle jamais enregistré n'a pas d'historique : le dire, sans rien charger.
      await freshDocument(h);
      await h.sleep(250);
      row.click();
      await sleep(300);
      if (typeof VersionsHistory !== 'undefined' || loaded() !== 0) problems.push('la fenêtre s\'est chargée pour un modèle jamais enregistré');
      if (!/Enregistrez d’abord le modèle/.test(statusMsg())) problems.push('message pour un modèle neuf : ' + statusMsg());
      // Un modèle enregistré : la fenêtre se charge et s'ouvre.
      const id = await savedModel(h, 'Historique : premier clic', '<p>Texte du modèle</p>');
      row.click();
      await waitFor(() => isOpen(), 4000);
      if (!isOpen()) problems.push('la fenêtre ne s\'ouvre pas');
      if (typeof VersionsHistory === 'undefined' || loaded() !== 1) problems.push('chargement au clic : ' + typeof VersionsHistory + ', ' + loaded() + ' script(s)');
      await closeHistory();
      row.click();
      await waitFor(() => isOpen(), 4000);
      if (loaded() !== 1) problems.push('la fenêtre s\'est rechargée au second clic : ' + loaded());
      if (!id) problems.push('modèle non enregistré');
      return finish(h, problems);
    },
  });

  // --- 2. Un vrai Enregistrer ---------------------------------------------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'versions_real_save_keeps_the_replaced_state_in_the_same_batch',
    description: 'Le vrai bouton Enregistrer garde l\'état remplacé dans le MÊME lot que le modèle (UpdateRecord puis AddRecord), avec le jeton, la date et l\'auteur de cet état, sans jamais lire la table des versions',
    async run(h) {
      const problems = [];
      resetVersions();
      const id = await savedModel(h, 'Historique : un enregistrement', '<p>Premier état</p>');
      const fetches = countFetches(VERSIONS);
      const recorded = recordBatches();
      try {
        Editor.setHTML('<p>Second état</p>');
        await h.clickButton('btn-save');
        await h.sleep(700);
      } finally { recorded.restore(); fetches.restore(); }
      const batch = recorded.batches.find(actions => actions.some(a => a[0] === 'AddRecord' && a[1] === VERSIONS));
      if (!batch) return { pass: false, notes: 'aucun lot ne porte la version : ' + JSON.stringify(recorded.batches.map(b => b.map(a => a[0] + ':' + a[1]))) };
      if (batch.length !== 2 || batch[0][0] !== 'UpdateRecord' || batch[0][1] !== MODELS || batch[1][1] !== VERSIONS) problems.push('composition du lot : ' + JSON.stringify(batch.map(a => a[0] + ':' + a[1])));
      if (fetches.n !== 0) problems.push('la table des versions a été lue ' + fetches.n + ' fois');
      const rowsNow = versionRowsOf(id);
      if (rowsNow.length !== 1) return { pass: false, notes: problems.concat('versions gardées : ' + rowsNow.length) };
      const kept = await VersionsStore.unpack(rowsNow[0].Donnees);
      if (kept.contenu !== '<p>Premier état</p>' || kept.typeModele !== 'document') problems.push('état gardé : ' + JSON.stringify(kept).slice(0, 160));
      if (!rowsNow[0].Jeton || rowsNow[0].Jeton !== modelRow(id).Jeton) problems.push('jeton : ' + rowsNow[0].Jeton + ' / ' + modelRow(id).Jeton);
      if (rowsNow[0].Auteur !== 'Moi Même <moi@exemple.fr>') problems.push('auteur : ' + rowsNow[0].Auteur);
      if (rowsNow[0].Genre !== '' || rowsNow[0].Nom !== '') problems.push('genre / nom : ' + rowsNow[0].Genre + ' / ' + rowsNow[0].Nom);
      if (modelRow(id).Contenu !== '<p>Second état</p>') problems.push('le modèle n\'a pas le second état : ' + modelRow(id).Contenu);
      if (modelRow(id).ModifiePar !== 'Moi Même <moi@exemple.fr>') problems.push('ModifiePar : ' + modelRow(id).ModifiePar);
      return finish(h, problems);
    },
  });

  cases.push({
    id: 'versions_table_is_never_offered_as_a_user_table',
    description: 'La table Publipostage_Versions fait partie des tables internes du widget : #Variable et les sélecteurs de table ne la proposent jamais (le vrai listTables() la rend, comme toutes les autres)',
    async run(h) {
      resetVersions();
      const id = await savedModel(h, 'Historique : table interne', '<p>Texte</p>');
      await addVersion(id, { html: '<p>Ancien</p>', minutesAgo: 30 });
      stub().setVariables('PpAutreTable', { Nom: 'Text' });
      await GristAPI.refreshSchema();
      const tables = GristAPI.getTables().slice();
      const inVariables = GristAPI.getAllVariables().filter(v => v.table === VERSIONS).map(v => v.key);
      const listed = stub().state.tables.indexOf(VERSIONS) !== -1;
      return {
        pass: listed && tables.indexOf('PpAutreTable') !== -1 && tables.indexOf(VERSIONS) === -1 && inVariables.length === 0,
        notes: JSON.stringify({ listedByTheDocument: listed, tables, inVariables }),
      };
    },
  });

  // --- 3. La fenêtre -----------------------------------------------------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'versions_window_lists_current_then_versions_newest_first',
    description: '« Version actuelle » en tête, puis les versions de la plus récente à la plus ancienne (personne, nom, genre) ; l\'aperçu suit le choix, « Restaurer » n\'est actif que sur une ancienne version lisible',
    async run(h) {
      const problems = [];
      resetVersions();
      const id = await savedModel(h, 'Historique A', '<p>Texte actuel</p>');
      await addVersion(id, { html: '<p>Texte ancien</p>', minutesAgo: 120, author: 'Ada Lovelace <ada@exemple.fr>' });
      await addVersion(id, { html: '<p>Texte nommé</p>', minutesAgo: 45, author: 'Bob <bob@exemple.fr>', name: 'Avant envoi' });
      await addVersion(id, { html: '<p>Texte avant restauration</p>', minutesAgo: 10, author: '', genre: 'restauration' });
      // Le modèle d'un autre jeton n'apparaît pas.
      await addVersion(id, { html: '<p>Autre modèle</p>', minutesAgo: 5 });
      const other = stub().state.rows[VERSIONS];
      other.Jeton[other.Jeton.length - 1] = 'jeton-d-un-autre-modele';
      await openHistory();
      await waitFor(() => rows().length === 4, 3000);
      const labels = rows().map(row => part(row, 'when'));
      if (rows().length !== 4) return finish(h, problems.concat('lignes : ' + JSON.stringify(labels)));
      if (document.getElementById('pp-versions-title').textContent !== 'Historique des versions : Historique A') problems.push('titre : ' + document.getElementById('pp-versions-title').textContent);
      if (labels[0] !== 'Version actuelle' || checkedRow() !== rows()[0]) problems.push('la version actuelle devrait être en tête et choisie : ' + JSON.stringify(labels));
      if (!previewText().includes('Texte actuel')) problems.push('aperçu de la version actuelle : ' + previewText());
      if (!restoreButton().disabled) problems.push('« Restaurer » devrait être grisé sur la version actuelle');
      if (restoreButton().textContent !== 'Restaurer cette version' || closeButton().textContent !== 'Fermer') problems.push('boutons : ' + restoreButton().textContent + ' / ' + closeButton().textContent);
      if (!part(rows()[0], 'who').includes('Moi Même')) problems.push('l\'auteur de la version actuelle : ' + part(rows()[0], 'who'));
      // Ordre et contenu des lignes.
      if (!part(rows()[1], 'who').includes('auteur inconnu') || !part(rows()[1], 'tag').includes('Avant une restauration')) problems.push('ligne « avant une restauration » : ' + rows()[1].textContent);
      if (part(rows()[2], 'when') !== 'Avant envoi' || !part(rows()[2], 'who').includes('Bob')) problems.push('ligne nommée : ' + rows()[2].textContent);
      if (!part(rows()[3], 'who').includes('Ada Lovelace') || rows()[3].querySelector('.pp-versions-who').title !== 'Ada Lovelace <ada@exemple.fr>') problems.push('ligne de la plus ancienne : ' + rows()[3].textContent + ' | ' + rows()[3].querySelector('.pp-versions-who').title);
      if (rows().some(row => row.textContent.includes('Autre modèle'))) problems.push('une version d\'un autre modèle est listée');
      // Choisir une version : son aperçu, son entête, « Restaurer » actif.
      await pickRow(3);
      await waitFor(() => previewText().includes('Texte ancien'), 2000);
      if (!previewText().includes('Texte ancien') || previewText().includes('Texte actuel')) problems.push('aperçu de la plus ancienne : ' + previewText());
      if (checkedRow() !== rows()[3]) problems.push('la ligne choisie n\'est pas cochée');
      if (!headText().includes('Ada Lovelace')) problems.push('en-tête de l\'aperçu : ' + headText());
      if (restoreButton().disabled) problems.push('« Restaurer » devrait être actif sur une ancienne version');
      await pickRow(2);
      await waitFor(() => previewText().includes('Texte nommé'), 2000);
      if (!previewText().includes('Texte nommé') || !headText().includes('Avant envoi')) problems.push('aperçu de la version nommée : ' + previewText() + ' | ' + headText());
      await pickRow(1);
      await waitFor(() => previewText().includes('Texte avant restauration'), 2000);
      if (!headText().includes('Avant une restauration')) problems.push('en-tête de la version « avant une restauration » : ' + headText());
      // Clavier : flèche bas depuis la dernière ligne revient en haut (groupe à boutons radio), Entrée ne restaure pas la version actuelle.
      rows()[1].focus();
      rows()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      await sleep(80);
      if (checkedRow() !== rows()[2]) problems.push('flèche bas : la ligne suivante devrait être choisie');
      await pickRow(0);
      if (!restoreButton().disabled || !previewText().includes('Texte actuel')) problems.push('retour à la version actuelle : bouton ' + restoreButton().disabled + ', aperçu ' + previewText());
      return finish(h, problems);
    },
  });

  cases.push({
    id: 'versions_window_empty_history_and_read_error',
    description: 'Un modèle sans version : la liste ne montre que la version actuelle et dit pourquoi, sans créer la table ; une table des versions illisible le dit sans faire croire à un historique vide',
    async run(h) {
      const problems = [];
      resetVersions();
      const id = await savedModel(h, 'Historique vide', '<p>Texte</p>');
      const recorded = recordBatches();
      try {
        await openHistory();
        await sleep(200);
      } finally { recorded.restore(); }
      if (rows().length !== 1 || part(rows()[0], 'when') !== 'Version actuelle') problems.push('lignes : ' + rows().length);
      if (!emptyText().startsWith('Aucune version gardée pour l’instant')) problems.push('message d\'historique vide : ' + emptyText());
      if (!restoreButton().disabled) problems.push('« Restaurer » devrait être grisé');
      if (statusText() !== '') problems.push('état affiché : ' + statusText());
      if (recorded.batches.length || stub().state.tables.indexOf(VERSIONS) !== -1) problems.push('l\'ouverture a écrit ou créé la table : ' + JSON.stringify(recorded.batches));
      await closeHistory();
      // Une lecture qui échoue.
      await addVersion(id, { html: '<p>Ancien</p>', minutesAgo: 30 });
      const original = grist.docApi.fetchTable;
      grist.docApi.fetchTable = function (name) { return name === VERSIONS ? Promise.reject(new Error('lecture refusée (essai)')) : original.apply(this, arguments); };
      try { await openHistory(); await sleep(200); } finally { grist.docApi.fetchTable = original; }
      if (rows().length !== 1) problems.push('lecture en échec : lignes ' + rows().length);
      if (statusText() !== 'L’historique n’a pas pu être lu. Réessayez dans un instant.') problems.push('message de lecture en échec : ' + statusText());
      if (emptyText() !== '') problems.push('« aucune version » ne devrait pas s\'afficher quand la lecture échoue : ' + emptyText());
      if (!restoreButton().disabled) problems.push('« Restaurer » devrait être grisé quand la lecture échoue');
      await closeHistory();
      // Rouverte une fois la panne passée : la version est là.
      await openHistory();
      await waitFor(() => rows().length === 2, 3000);
      if (rows().length !== 2 || statusText() !== '') problems.push('réouverture : lignes ' + rows().length + ', état ' + statusText());
      return finish(h, problems);
    },
  });

  cases.push({
    id: 'versions_window_unreadable_version_cannot_be_restored',
    description: 'Une version dont les données ne se lisent pas (format inconnu) le dit et ne se restaure pas ; les autres restent restaurables',
    async run(h) {
      const problems = [];
      resetVersions();
      const id = await savedModel(h, 'Historique illisible', '<p>Texte actuel</p>');
      await addVersion(id, { html: '<p>Bonne version</p>', minutesAgo: 90 });
      await addVersion(id, { raw: 'zip9:abc', minutesAgo: 40 });
      await openHistory();
      await waitFor(() => rows().length === 3, 3000);
      await pickRow(1);
      await waitFor(() => statusText() !== '', 2000);
      if (!statusText().startsWith('Cette version ne peut pas être lue')) problems.push('message : ' + statusText());
      if (sheetShown()) problems.push('la feuille devrait être cachée');
      if (!restoreButton().disabled) problems.push('« Restaurer » devrait être grisé sur une version illisible');
      await pickRow(2);
      await waitFor(() => previewText().includes('Bonne version'), 2000);
      if (statusText() !== '' || !sheetShown() || restoreButton().disabled) problems.push('la bonne version : état ' + statusText() + ', feuille ' + sheetShown() + ', bouton ' + restoreButton().disabled);
      return finish(h, problems);
    },
  });

  cases.push({
    id: 'versions_window_previews_email_and_macro_models',
    description: 'L\'aperçu d\'un e-mail ajoute son objet et ses destinataires ; celui d\'un macro-modèle montre sa composition (pages de garde, annexes, modèle supprimé) au lieu d\'une feuille',
    async run(h) {
      const problems = [];
      resetVersions();
      // Un e-mail.
      const mail = await Templates.save(null, 'Historique courrier', '<p>Corps actuel</p>', '', null, null, 'email', { destinataires: 'a@exemple.fr', cc: 'c@exemple.fr', cci: '', objet: 'Objet actuel' }, {});
      await Templates.loadAll();
      await addVersion(mail.id, { state: stateOf('<p>Corps ancien</p>', { typeModele: 'email', destinataires: 'ancien@exemple.fr', cc: 'copie@exemple.fr', cci: 'cachee@exemple.fr', objet: 'Objet ancien' }), minutesAgo: 60, author: 'Ada <ada@exemple.fr>' });
      await openHistory();
      await waitFor(() => rows().length === 2, 3000);
      if (!extraText().includes('Objet : Objet actuel') || !extraText().includes('À : a@exemple.fr') || !extraText().includes('Cc : c@exemple.fr') || extraText().includes('Cci')) problems.push('e-mail actuel : ' + extraText());
      await pickRow(1);
      await waitFor(() => previewText().includes('Corps ancien'), 2000);
      for (const wanted of ['Objet : Objet ancien', 'À : ancien@exemple.fr', 'Cc : copie@exemple.fr', 'Cci : cachee@exemple.fr']) if (!extraText().includes(wanted)) problems.push('e-mail ancien, manque « ' + wanted + ' » : ' + extraText());
      await closeHistory();
      // Un macro-modèle.
      const first = await Templates.save(null, 'Historique modèle un', '<p>Un</p>', '', null, null, 'document', null, {});
      const composition = ids => JSON.stringify({ slots: [{ type: 'fixed', modeleId: ids[0] }, { type: 'annexe', rules: [{ modeleId: ids[1] }], defaultModeleId: ids[0] }, { type: 'fixed', modeleId: 987654 }] });
      const second = await Templates.save(null, 'Historique modèle deux', '<p>Deux</p>', '', null, null, 'document', null, {});
      const macro = await Templates.save(null, 'Historique macro', composition([first.id, second.id]), '', null, null, 'macro', null, null);
      await Templates.loadAll();
      await addVersion(macro.id, { state: stateOf(JSON.stringify({ slots: [] }), { typeModele: 'macro' }), minutesAgo: 30 });
      await openHistory();
      await waitFor(() => rows().length === 2, 3000);
      if (sheetShown()) problems.push('un macro-modèle ne montre pas de feuille');
      const lines = extraText();
      if (!lines.includes('Page de garde : Historique modèle un') || !lines.includes('Annexe 1 : Historique modèle deux, Historique modèle un') || !lines.includes('Page de garde : modèle supprimé')) problems.push('composition actuelle : ' + lines);
      await pickRow(1);
      await sleep(150);
      if (!extraText().includes('Aucune position dans la composition.') || restoreButton().disabled) problems.push('composition vide : ' + extraText() + ' / bouton ' + restoreButton().disabled);
      return finish(h, problems);
    },
  });

  // --- 4. Restaurer ------------------------------------------------------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'versions_restore_puts_the_old_state_on_screen_and_keeps_the_replaced_one',
    description: '« Restaurer cette version » pose la question, remet l\'état choisi dans le modèle ET dans l\'éditeur (nom inchangé), garde l\'état remplacé dans une version « avant une restauration », ferme la fenêtre ; l\'enregistrement automatique n\'écrase rien ensuite',
    async run(h) {
      const problems = [];
      resetVersions();
      const id = await savedModel(h, 'Historique restauration', '<p>État actuel</p>');
      await addVersion(id, { html: '<p>État ancien</p>', minutesAgo: 90, author: 'Ada Lovelace <ada@exemple.fr>' });
      const dialogs = h.stubDialogs({ confirm: true });
      try {
        stub().clearActionLog();
        await openHistory();
        await waitFor(() => rows().length === 2, 3000);
        await pickRow(1);
        await waitFor(() => previewText().includes('État ancien'), 2000);
        restoreButton().click();
        await waitFor(() => !isOpen(), 5000);
      } finally { dialogs.restore(); }
      if (isOpen()) problems.push('la fenêtre est restée ouverte');
      if (dialogs.asked.length !== 1 || dialogs.asked[0].kind !== 'confirm' || !/Ada Lovelace/.test(dialogs.asked[0].message || '') || dialogs.asked[0].confirmLabel !== 'Restaurer') problems.push('question posée : ' + JSON.stringify(dialogs.asked));
      if (!Editor.getHTML().includes('État ancien') || Editor.getHTML().includes('État actuel')) problems.push('éditeur : ' + Editor.getHTML());
      if (modelRow(id).Contenu !== '<p>État ancien</p>') problems.push('modèle : ' + modelRow(id).Contenu);
      if (modelRow(id).Nom !== 'Historique restauration' || document.getElementById('template-name').value !== 'Historique restauration') problems.push('le nom a changé : ' + modelRow(id).Nom + ' / ' + document.getElementById('template-name').value);
      if (modelRow(id).ModifiePar !== 'Moi Même <moi@exemple.fr>') problems.push('ModifiePar : ' + modelRow(id).ModifiePar);
      const kept = versionRowsOf(id);
      if (kept.length !== 2) return { pass: false, notes: JSON.stringify(problems.concat('versions : ' + kept.length)) };
      const replaced = kept.find(row => row.Genre === 'restauration');
      if (!replaced) problems.push('aucune version « restauration »');
      else {
        const state = await VersionsStore.unpack(replaced.Donnees);
        if (state.contenu !== '<p>État actuel</p>') problems.push('l\'état remplacé n\'est pas gardé : ' + state.contenu);
      }
      if (!/restaurée/.test(statusMsg())) problems.push('message d\'état : ' + statusMsg());
      if (String(document.getElementById('template-select').value) !== String(id)) problems.push('liste des modèles : ' + document.getElementById('template-select').value);
      // L'enregistrement automatique ne remet rien d'avant : le modèle reste restauré, sans bandeau de conflit, sans écriture de plus.
      const writes = stub().countActions('UpdateRecord', MODELS);
      await h.sleep(6200);
      const banner = document.getElementById('autosave-conflict-banner');
      if (banner && banner.style.display !== 'none') problems.push('un bandeau de conflit est apparu');
      if (modelRow(id).Contenu !== '<p>État ancien</p>' || stub().countActions('UpdateRecord', MODELS) !== writes) problems.push('l\'enregistrement automatique a écrit après la restauration : ' + modelRow(id).Contenu + ', écritures ' + writes + ' -> ' + stub().countActions('UpdateRecord', MODELS));
      return finish(h, problems);
    },
  });

  cases.push({
    id: 'versions_restore_saves_what_was_typed_first',
    description: 'Ce qui est tapé et pas encore enregistré part d\'abord (comme un Enregistrer) : c\'est cet état-là que la restauration remplace et garde, rien ne se perd',
    async run(h) {
      const problems = [];
      resetVersions();
      const id = await savedModel(h, 'Historique frappe', '<p>État enregistré</p>');
      await addVersion(id, { html: '<p>État ancien</p>', minutesAgo: 90, author: 'Ada <ada@exemple.fr>' });
      const dialogs = h.stubDialogs({ confirm: true });
      try {
        await h.focusAtEnd();
        await h.typeText(' et du texte tapé');
        await openHistory();
        await waitFor(() => rows().length >= 2, 3000);
        await pickRow(rows().length - 1);
        await waitFor(() => previewText().includes('État ancien'), 2000);
        restoreButton().click();
        await waitFor(() => !isOpen(), 6000);
      } finally { dialogs.restore(); }
      if (isOpen()) problems.push('la fenêtre est restée ouverte');
      if (modelRow(id).Contenu !== '<p>État ancien</p>' || !Editor.getHTML().includes('État ancien')) problems.push('restauration : modèle ' + modelRow(id).Contenu + ', éditeur ' + Editor.getHTML());
      const replaced = versionRowsOf(id).find(row => row.Genre === 'restauration');
      if (!replaced) return { pass: false, notes: JSON.stringify(problems.concat('aucune version « restauration »')) };
      const state = await VersionsStore.unpack(replaced.Donnees);
      if (!/et du texte tapé/.test(state.contenu)) problems.push('le texte tapé n\'est pas gardé : ' + state.contenu);
      return finish(h, problems);
    },
  });

  cases.push({
    id: 'versions_restore_refused_question_writes_nothing',
    description: 'Entrée sur une version pose la question de « Restaurer » ; la refuser n\'écrit rien : la fenêtre reste ouverte, le modèle et l\'éditeur ne bougent pas, « Restaurer » reste actif',
    async run(h) {
      const problems = [];
      resetVersions();
      const id = await savedModel(h, 'Historique refus', '<p>État actuel</p>');
      await addVersion(id, { html: '<p>État ancien</p>', minutesAgo: 90 });
      const dialogs = h.stubDialogs({ confirm: false });
      try {
        await openHistory();
        await waitFor(() => rows().length === 2, 3000);
        await pickRow(1);
        await waitFor(() => previewText().includes('État ancien'), 2000);
        stub().clearActionLog();
        // Entrée sur la version choisie pose la même question que le bouton.
        rows()[1].focus();
        rows()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        await waitFor(() => dialogs.asked.length > 0, 2000);
        await sleep(300);
      } finally { dialogs.restore(); }
      if (dialogs.asked.length !== 1) problems.push('questions posées : ' + dialogs.asked.length);
      if (!isOpen()) problems.push('la fenêtre s\'est fermée');
      if (stub().countActions('UpdateRecord', MODELS) !== 0 || stub().countActions('AddRecord', VERSIONS) !== 0) problems.push('des écritures ont eu lieu');
      if (modelRow(id).Contenu !== '<p>État actuel</p>' || !Editor.getHTML().includes('État actuel')) problems.push('le modèle ou l\'éditeur a bougé');
      if (restoreButton().disabled || restoreButton().textContent !== 'Restaurer cette version') problems.push('bouton : ' + restoreButton().disabled + ' ' + restoreButton().textContent);
      return finish(h, problems);
    },
  });

  cases.push({
    id: 'versions_restore_failure_is_said_in_the_window',
    description: 'Une restauration que Grist refuse se dit dans la fenêtre, qui reste ouverte : ni le modèle ni l\'éditeur ne changent, le bouton redevient actif',
    async run(h) {
      const problems = [];
      resetVersions();
      const id = await savedModel(h, 'Historique échec', '<p>État actuel</p>');
      await addVersion(id, { html: '<p>État ancien</p>', minutesAgo: 90 });
      const dialogs = h.stubDialogs({ confirm: true });
      let restoreWrites = () => {};
      try {
        await openHistory();
        await waitFor(() => rows().length === 2, 3000);
        await pickRow(1);
        await waitFor(() => previewText().includes('État ancien'), 2000);
        restoreWrites = failActions(a => a[0] === 'UpdateRecord' && a[1] === MODELS);
        restoreButton().click();
        await waitFor(() => statusText() !== '', 4000);
      } finally { restoreWrites(); dialogs.restore(); }
      if (!isOpen()) problems.push('la fenêtre s\'est fermée');
      if (statusText() !== 'La version n’a pas pu être restaurée.') problems.push('message : ' + statusText());
      if (modelRow(id).Contenu !== '<p>État actuel</p>' || !Editor.getHTML().includes('État actuel')) problems.push('le modèle ou l\'éditeur a changé : ' + modelRow(id).Contenu);
      if (restoreButton().disabled || restoreButton().textContent !== 'Restaurer cette version') problems.push('le bouton reste occupé : ' + restoreButton().disabled + ' ' + restoreButton().textContent);
      // Une fois le refus passé, la même restauration réussit.
      const again = h.stubDialogs({ confirm: true });
      try {
        restoreButton().click();
        await waitFor(() => !isOpen(), 5000);
      } finally { again.restore(); }
      if (isOpen() || modelRow(id).Contenu !== '<p>État ancien</p>') problems.push('la restauration ne réussit pas ensuite : ' + modelRow(id).Contenu);
      return finish(h, problems);
    },
  });

  cases.push({
    id: 'versions_restore_button_shows_it_is_working_while_grist_is_slow',
    description: 'Pendant une restauration lente, le bouton est grisé et dit « Restauration… » ; la liste ne permet pas d\'en lancer une deuxième',
    async run(h) {
      const problems = [];
      resetVersions();
      const id = await savedModel(h, 'Historique lent', '<p>État actuel</p>');
      await addVersion(id, { html: '<p>État ancien</p>', minutesAgo: 90 });
      const dialogs = h.stubDialogs({ confirm: true });
      try {
        await openHistory();
        await waitFor(() => rows().length === 2, 3000);
        await pickRow(1);
        await waitFor(() => previewText().includes('État ancien'), 2000);
        stub().setLatency({ applyUserActions: 900 });
        restoreButton().click();
        await waitFor(() => restoreButton().textContent === 'Restauration…', 1500);
        if (restoreButton().textContent !== 'Restauration…' || !restoreButton().disabled) problems.push('pendant la restauration : ' + restoreButton().textContent + ' / ' + restoreButton().disabled);
        const writes = stub().countActions('AddRecord', VERSIONS);
        restoreButton().click();
        await sleep(100);
        if (stub().countActions('AddRecord', VERSIONS) !== writes) problems.push('un second clic a lancé une autre écriture');
        await waitFor(() => !isOpen(), 8000);
      } finally { dialogs.restore(); stub().setLatency(0); }
      if (isOpen() || modelRow(id).Contenu !== '<p>État ancien</p>') problems.push('la restauration lente n\'a pas abouti : ' + isOpen() + ' ' + modelRow(id).Contenu);
      return finish(h, problems);
    },
  });

  cases.push({
    id: 'versions_restore_holds_autosave_until_the_screen_is_reloaded',
    description: 'Entre l\'écriture de la version restaurée et le rechargement de l\'éditeur (la liste des modèles se relit), un passage de l\'enregistrement automatique n\'écrit pas l\'ancien écran par-dessus : la version restaurée reste dans le modèle et à l\'écran',
    async run(h) {
      const problems = [];
      resetVersions();
      const id = await savedModel(h, 'Historique garde', '<p>État actuel</p>');
      await addVersion(id, { html: '<p>État ancien</p>', minutesAgo: 90 });
      // La relecture de la liste des modèles, juste après l'écriture, dure 6 s : l'éditeur montre encore l'ancien écran, et plus d'un passage de l'enregistrement automatique (2,5 s) y tombe.
      const original = Templates.loadAll;
      let armed = false;
      Templates.loadAll = async function () {
        if (armed) { armed = false; await sleep(6000); }
        return original.apply(this, arguments);
      };
      const dialogs = h.stubDialogs({ confirm: true });
      try {
        await openHistory();
        await waitFor(() => rows().length === 2, 3000);
        await pickRow(1);
        await waitFor(() => previewText().includes('État ancien'), 2000);
        stub().clearActionLog();
        armed = true;
        restoreButton().click();
        await waitFor(() => modelRow(id).Contenu === '<p>État ancien</p>', 4000);
        // Quelqu'un tape dans l'éditeur à cet instant : le texte part à l'enregistrement automatique s'il passe avant le rechargement.
        await h.focusAtEnd();
        await h.typeText(' TAPÉ ENTRE-TEMPS');
        await h.sleep(TICK_MS + 800);
        await waitFor(() => !isOpen(), 12000);
      } finally { Templates.loadAll = original; dialogs.restore(); }
      if (isOpen()) problems.push('la fenêtre est restée ouverte');
      if (modelRow(id).Contenu !== '<p>État ancien</p>') problems.push('le modèle n\'a plus la version restaurée : ' + modelRow(id).Contenu);
      if (!Editor.getHTML().includes('État ancien') || Editor.getHTML().includes('TAPÉ')) problems.push('éditeur : ' + Editor.getHTML());
      if (stub().countActions('UpdateRecord', MODELS) !== 1) problems.push('écritures du modèle pendant la restauration : ' + stub().countActions('UpdateRecord', MODELS));
      return finish(h, problems);
    },
  });

  cases.push({
    id: 'versions_restore_stops_when_what_is_typed_cannot_be_saved',
    description: 'Ce qui est tapé et que Grist refuse d\'enregistrer arrête la restauration, et la fenêtre le dit : rien n\'est remplacé, le texte tapé reste à l\'écran, aucune version de plus',
    async run(h) {
      const problems = [];
      resetVersions();
      const id = await savedModel(h, 'Historique frappe refusée', '<p>État enregistré</p>');
      await addVersion(id, { html: '<p>État ancien</p>', minutesAgo: 90 });
      const dialogs = h.stubDialogs({ confirm: true });
      let unfail = () => {};
      try {
        await h.focusAtEnd();
        await h.typeText(' texte tapé');
        await openHistory();
        await waitFor(() => rows().length === 2, 3000);
        await pickRow(1);
        await waitFor(() => previewText().includes('État ancien'), 2000);
        unfail = failActions(a => a[0] === 'UpdateRecord' && a[1] === MODELS);
        restoreButton().click();
        await waitFor(() => statusText() !== '', 6000);
      } finally { unfail(); dialogs.restore(); }
      if (!isOpen()) problems.push('la fenêtre s\'est fermée');
      if (statusText() !== 'Ce qui est en cours de saisie n’a pas pu être enregistré : la restauration n’a pas eu lieu.') problems.push('message : ' + statusText());
      if (modelRow(id).Contenu !== '<p>État enregistré</p>') problems.push('le modèle a changé : ' + modelRow(id).Contenu);
      if (!Editor.getHTML().includes('texte tapé') || Editor.getHTML().includes('État ancien')) problems.push('l\'éditeur a perdu ce qui était tapé : ' + Editor.getHTML());
      if (versionRowsOf(id).length !== 1) problems.push('versions : ' + versionRowsOf(id).length);
      if (restoreButton().disabled || restoreButton().textContent !== 'Restaurer cette version') problems.push('le bouton reste occupé : ' + restoreButton().textContent);
      return finish(h, problems);
    },
  });

  cases.push({
    id: 'versions_restore_refuses_a_version_of_another_type',
    description: 'Une version d\'un autre type de modèle (un e-mail pour un document) ne se restaure pas : la fenêtre le dit, le modèle et l\'éditeur ne bougent pas, aucune version de plus',
    async run(h) {
      const problems = [];
      resetVersions();
      const id = await savedModel(h, 'Historique autre type', '<p>Texte du document</p>');
      await addVersion(id, { state: stateOf('<p>Courrier</p>', { typeModele: 'email', objet: 'Un objet' }), minutesAgo: 60 });
      const dialogs = h.stubDialogs({ confirm: true });
      try {
        await openHistory();
        await waitFor(() => rows().length === 2, 3000);
        await pickRow(1);
        await waitFor(() => previewText().includes('Courrier'), 2000);
        if (!extraText().includes('Objet : Un objet')) problems.push('aperçu de la version : ' + extraText());
        stub().clearActionLog();
        restoreButton().click();
        await waitFor(() => statusText() !== '', 4000);
      } finally { dialogs.restore(); }
      if (!isOpen()) problems.push('la fenêtre s\'est fermée');
      if (statusText() !== 'La version n’a pas pu être restaurée.') problems.push('message : ' + statusText());
      if (modelRow(id).Contenu !== '<p>Texte du document</p>' || !Editor.getHTML().includes('Texte du document')) problems.push('le modèle ou l\'éditeur a changé');
      if (stub().countActions('UpdateRecord', MODELS) !== 0 || versionRowsOf(id).length !== 1) problems.push('écritures : ' + stub().countActions('UpdateRecord', MODELS) + ', versions ' + versionRowsOf(id).length);
      if (restoreButton().disabled) problems.push('le bouton reste occupé');
      return finish(h, problems);
    },
  });

  cases.push({
    id: 'versions_restore_a_macro_model',
    description: 'Un macro-modèle se restaure aussi : sa composition reprend celle de la version, l\'ancienne composition reste dans une version « avant une restauration », son nom ne change pas',
    async run(h) {
      const problems = [];
      resetVersions();
      await identify();
      await freshDocument(h);
      await h.sleep(300);
      const cover = await Templates.save(null, 'Historique macro - garde', '<p>Page de garde</p>', '', null, null, 'document', null);
      const other = await Templates.save(null, 'Historique macro - autre', '<p>Autre page</p>', '', null, null, 'document', null);
      await Templates.loadAll();
      // Le macro-modèle, par la vraie fenêtre de composition : enregistré, choisi et chargé comme par une personne.
      MacroEditor.openModal(null);
      document.getElementById('macro-editor-name').value = 'Historique macro à restaurer';
      const select = document.getElementById('macro-editor-cover');
      select.value = String(cover.id);
      select.dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('macro-editor-save').click();
      await h.sleep(900);
      const id = Templates.getCurrentId();
      const slotsOf = row => { try { return JSON.parse(row.Contenu).slots; } catch (e) { return null; } };
      if (!id || !modelRow(id) || modelRow(id).TypeModele !== 'macro') return { pass: false, notes: 'le macro-modèle n\'est pas chargé : ' + id };
      const nameBefore = modelRow(id).Nom;
      if (nameBefore !== 'Historique macro à restaurer') problems.push('nom du macro-modèle : ' + nameBefore);
      await addVersion(id, { state: stateOf(JSON.stringify({ slots: [{ type: 'fixed', modeleId: other.id }] }), { typeModele: 'macro' }), minutesAgo: 60, author: 'Ada <ada@exemple.fr>' });
      const dialogs = h.stubDialogs({ confirm: true });
      try {
        await openHistory();
        await waitFor(() => rows().length === 2, 3000);
        if (!extraText().includes('Page de garde : Historique macro - garde')) problems.push('composition actuelle : ' + extraText());
        await pickRow(1);
        await waitFor(() => extraText().includes('Historique macro - autre'), 2000);
        if (!extraText().includes('Page de garde : Historique macro - autre')) problems.push('composition de la version : ' + extraText());
        restoreButton().click();
        await waitFor(() => !isOpen(), 6000);
      } finally { dialogs.restore(); }
      if (isOpen()) problems.push('la fenêtre est restée ouverte');
      const slots = slotsOf(modelRow(id));
      if (!slots || slots.length !== 1 || String(slots[0].modeleId) !== String(other.id)) problems.push('composition du modèle : ' + modelRow(id).Contenu);
      if (modelRow(id).Nom !== nameBefore || String(Templates.getCurrentId()) !== String(id)) problems.push('nom ou modèle courant : ' + modelRow(id).Nom + ' / ' + Templates.getCurrentId());
      const replaced = versionRowsOf(id).find(row => row.Genre === 'restauration');
      if (!replaced) problems.push('aucune version « restauration »');
      else {
        const state = await VersionsStore.unpack(replaced.Donnees);
        const old = state.contenu ? JSON.parse(state.contenu).slots : null;
        if (state.typeModele !== 'macro' || !old || String(old[0].modeleId) !== String(cover.id)) problems.push('l\'ancienne composition n\'est pas gardée : ' + JSON.stringify(state).slice(0, 200));
      }
      if (!/restaurée/.test(statusMsg())) problems.push('message d\'état : ' + statusMsg());
      await h.clickButton('btn-new');
      await h.sleep(300);
      return finish(h, problems);
    },
  });

  // --- 5. Lecture seule -------------------------------------------------------------------------------------------------------------------------------------------
  // Les droits comme les pose Réglages > Accès (js/access-rights.js) : une table de droits, une ligne pour l'adresse de la personne.
  async function setReadOnly(on) {
    stub().setVariables('PpDroits', { Email: 'Text', LectureSeule: 'Bool', Export: 'Bool', Commentaires: 'Bool' });
    stub().setRows('PpDroits', [{ id: 1, Email: 'Moi@Exemple.fr', LectureSeule: on, Export: true, Commentaires: true }]);
    await GristAPI.refreshSchema();
    stub().setWidgetOptions({ droitsAcces: { table: 'PpDroits', emailColumn: 'Email', readOnlyColumn: 'LectureSeule', exportColumn: 'Export', commentsColumn: 'Commentaires' } });
    await sleep(60);
    await AccessRights.refresh();
    await waitFor(() => AccessRights.get().readOnly === on, 4000);
    await sleep(500);
  }
  async function clearRights() {
    stub().setWidgetOptions(null);
    await waitFor(() => !AccessRights.getConfig() && !AccessRights.get().readOnly, 4000);
    await sleep(200);
    document.getElementById('btn-mode-edit').click();
    await sleep(300);
  }

  cases.push({
    id: 'versions_row_is_greyed_and_inert_in_read_only',
    description: 'Lecture seule : la ligne « Historique des versions… » est grisée avec le menu Enregistrer et ne s\'ouvre ni à la souris ni au clavier, sans lire la table des versions ; elle revient avec les droits',
    async run(h) {
      const problems = [];
      resetVersions();
      const id = await savedModel(h, 'Historique lecture seule', '<p>Texte</p>');
      await addVersion(id, { html: '<p>Ancien</p>', minutesAgo: 30 });
      const fetches = countFetches(VERSIONS);
      try {
        await setReadOnly(true);
        const row = document.getElementById('v2-btn-history');
        if (!document.getElementById('v2-save-group').classList.contains('pp-access-locked')) problems.push('le menu Enregistrer n\'est pas grisé');
        row.click();
        row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        await sleep(500);
        if (isOpen()) problems.push('la fenêtre s\'est ouverte en lecture seule');
        if (fetches.n !== 0) problems.push('la table des versions a été lue ' + fetches.n + ' fois');
        await clearRights();
        if (document.getElementById('v2-save-group').classList.contains('pp-access-locked')) problems.push('le menu reste grisé après le retour des droits');
        row.click();
        await waitFor(() => isOpen(), 4000);
        if (!isOpen()) problems.push('la fenêtre ne s\'ouvre pas avec les droits');
      } finally { fetches.restore(); stub().setWidgetOptions(null); }
      return finish(h, problems);
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.versions = cases;
})();
