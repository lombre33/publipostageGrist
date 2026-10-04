// Publipostage Grist : enveloppe de l'API Grist (ligne courante et options du widget, schéma du document, lecture des tables, règles de liaison,
// identité de la personne, pièces jointes).

const GristAPI = (function () {
  // Tables internes du widget (modèles, règles de liaison, sonde de l'utilisateur, préférences de l'arbre de modèles, fils de commentaires,
  // abréviations, formats de page) : jamais des tables « métier » de la personne, donc exclues de _tables, de getAllVariables et de tout sélecteur de
  // table, sinon elles s'afficheraient dans l'autocomplétion # et les sélecteurs de liaison. Le vrai listTables() les rend avec les autres
  // (grist-core, WidgetFrame.ts : _grist_Tables sans filtre) ; une nouvelle table interne s'ajoute donc ici, car dev-tests/grist-stub.js ne liste
  // jamais ses tables internes et ne révélerait pas l'oubli.
  const INTERNAL_TABLES = [
    'Publipostage_Modeles', 'Publipostage_LiensTables', 'Publipostage_UserProbe', 'Publipostage_PreferencesModeles', 'Publipostage_Commentaires',
    'Publipostage_Abreviations', 'Publipostage_FormatsPage',
  ];
  const LINKS_TABLE_NAME = 'Publipostage_LiensTables';
  // Table interne de getCurrentUserEmail() et getCurrentUserName() (chips « Email de l'utilisateur » et « Nom de l'utilisateur ») : des colonnes à
  // formule déclenchée (`user.Email`, `user.Name`) capturent qui a réellement déclenché le calcul ; la ligne est supprimée après chaque lecture.
  const USER_PROBE_TABLE_NAME = 'Publipostage_UserProbe';
  let _tables = [];
  let _columnsByTable = {};
  let _columnTypesByTable = {};
  let _columnChoicesByTable = {};
  // { tableId: { colId: colonne d'affichage } } - pour une Référence, la colonne d'aide (« gristHelper_Display… ») que Grist calcule dans la même
  // table avec la valeur affichée, cf. getDisplayColumn.
  let _displayColByTable = {};
  // { tableId: { colId: { table, column } } } - pour une colonne Référence / liste de références, la colonne de la table liée que Grist affiche à la
  // place de l'id (visibleCol, « Colonne à afficher » du panneau de droite), cf. getReferenceColumn. Seules celles dont le type se lit comme du texte
  // ou un nombre.
  let _referenceColumnByTable = {};
  // Lignes lues par fetchTable (fetchTableRows, fetchRowById) : forme brute (une Référence = id de ligne), contrairement à la ligne que livre
  // grist.onRecord (valeur affichée) ; cf. isRawRow.
  const _rawRows = new WeakSet();
  // Liste brute de listTables(), tables internes comprises, gardée pour ne pas la redemander à chaque ensureXxxTableExists() : `_tables` exclut les
  // tables internes, il ne sert pas ici. Complétée à la main après un AddTable réussi (addTableIfMissing), pour ne jamais répondre « table absente »
  // à propos d'une table que la session vient de créer.
  let _rawTables = null;
  // listTables en cours : partagé par refreshSchema et listAllTablesCached (deux demandes qui se chevauchent n'en font qu'une).
  let _rawTablesLoading = null;
  function loadRawTables() {
    if (!_rawTablesLoading) {
      _rawTablesLoading = grist.docApi.listTables().then(list => { _rawTables = list || []; return _rawTables; });
      const done = () => { _rawTablesLoading = null; };
      _rawTablesLoading.then(done, done);
    }
    return _rawTablesLoading;
  }
  async function listAllTablesCached() {
    return _rawTables || loadRawTables();
  }
  // Crée la table interne `name` (colonnes `columns`) quand `tables`, la liste que l'appelant vient de lire, ne la contient pas ; vrai si elle vient
  // d'être créée. Grist crée une page avec la table : js/page-tree.js la range sous celle des modèles, sans qu'on l'attende, rien n'en dépend.
  async function addTableIfMissing(tables, name, columns) {
    if (tables.includes(name)) return false;
    await grist.docApi.applyUserActions([['AddTable', name, columns]]);
    if (_rawTables && !_rawTables.includes(name)) _rawTables.push(name);
    if (typeof PageTree !== 'undefined') PageTree.afterTableCreated(name);
    return true;
  }
  // La table interne `name` d'un module du widget (modèles, commentaires, préférences, abréviations, formats de page), créée au premier besoin. La
  // liste des tables est relue à neuf : une autre fenêtre a pu créer la table depuis la dernière lecture, et la créer une seconde fois la doublerait.
  async function ensureTable(name, columns) {
    return addTableIfMissing(await grist.docApi.listTables(), name, columns);
  }
  // File d'écritures d'un module : les tâches passent l'une après l'autre, et l'échec de l'une n'arrête pas les suivantes (il ne remonte qu'à son
  // appelant). `reset` repart d'une file vide.
  function createWriteQueue() {
    let tail = Promise.resolve();
    return {
      enqueue(job) {
        const run = tail.then(job);
        tail = run.catch(() => {});
        return run;
      },
      reset() { tail = Promise.resolve(); },
    };
  }
  // Lectures de tables partagées pendant un rendu. fetchTable est un aller-retour jusqu'au serveur de Grist, qui renvoie la table entière
  // (WidgetFrame.ts : docComm.fetchTable, dans grist-core). Une bulle d'une autre table en demandait plusieurs d'affilée (la ligne de la table liée,
  // celle de la page, les deux tables de métadonnées pour trouver la colonne Référence) : des centaines de lectures identiques pour un macro-modèle,
  // que la Lecture attendait une à une. Le temps d'un rendu (withReadPass), chaque table n'est lue qu'une fois et tous les appels, simultanés ou
  // suivants, partagent cette lecture. Le cache est jeté à la fin du rendu : une ligne modifiée dans Grist apparaît au rendu suivant, et un rendu qui
  // démarre repart d'un cache neuf, pour qu'une modification arrivée entre deux rendus ne lui échappe pas.
  let _readPass = null;
  let _readPassesOpen = 0;
  async function withReadPass(work) {
    _readPass = { tables: new Map(), rows: new Map() };
    _readPassesOpen++;
    try { return await work(); }
    finally { if (--_readPassesOpen === 0) _readPass = null; }
  }
  // Données colonnaires d'une table (le résultat de fetchTable, jamais modifié par les appelants). `fresh` : lecture directe, hors rendu - quand le
  // résultat dépend d'une écriture qui vient d'avoir lieu (getCurrentUserEmail).
  function readTable(tableId, fresh) {
    const pass = _readPass;
    if (!pass || fresh) return grist.docApi.fetchTable(tableId);
    if (!pass.tables.has(tableId)) {
      const read = Promise.resolve(grist.docApi.fetchTable(tableId));
      // Une lecture qui échoue n'est pas mémorisée : l'appel suivant la retente.
      read.catch(() => { if (pass.tables.get(tableId) === read) pass.tables.delete(tableId); });
      pass.tables.set(tableId, read);
    }
    return pass.tables.get(tableId);
  }
  let _linkRulesByTable = {};
  let _currentRecord = null;
  let _currentMappings = null;
  let _currentOptions = null;
  let _currentTableId = null;
  let _onRecordCallbacks = [];
  let _recordSubscriptionRegistered = false;
  // Vrai une fois que la souscription includeColumns:'normal' a réellement livré au moins un record (pas quand elle a seulement été enregistrée ou
  // demandée ; cf. init()). Les souscriptions 'shown' et 'normal' sont enregistrées ensemble au démarrage : ce drapeau sert à faire taire le repli
  // 'shown' dès que 'normal' a prouvé qu'elle fonctionne, pour ne jamais écraser une donnée enrichie par une donnée bridée.
  let _normalDataDelivered = false;
  let _limitedAccessWarned = false;
  let _tokenCache = null;
  // Abonnés aux options JSON du widget (js/access-rights.js) : grist.onOptions n'est enregistré qu'une fois, ici, et redistribué.
  let _optionsCallbacks = [];
  // Le lien « Sélectionner par » de ce widget, d'après settings.linking de grist.onOptions (js/reader-guide.js). 'unknown' tant que Grist ne le dit
  // pas.
  let _linkState = 'unknown';
  let _linkStateCallbacks = [];
  // Le niveau d'accès accordé à ce widget, d'après settings.accessLevel de grist.onOptions ('none', 'read table' ou 'full') : null tant que Grist ne
  // le dit pas. Sans accès, Grist ne lui envoie aucune ligne, même relié et avec une ligne cliquée (js/reader-guide.js : l'étape « accès complet » à
  // la place de « Aucune ligne sélectionnée »).
  let _accessLevel = null;
  let _accessLevelCallbacks = [];

  // Corps commun aux deux souscriptions onRecord (repli 'shown' et souscription enrichie 'normal') : écrit une fois pour que leur traitement
  // (notification des abonnés, detectTableId) ne se désynchronise pas.
  function handleIncomingRecord(record, mappings) {
    _currentRecord = record;
    _currentMappings = mappings || null;
    if (!record) {
      console.warn('[GristAPI] onRecord: aucune ligne sélectionnée (record=null).');
    }

    // Notifier immédiatement à chaque événement de sélection. La détection du tableId peut nécessiter des appels async et ne doit pas retarder le
    // rendu du mode lecture ni bloquer les événements suivants.
    const mappedTableId = mappings && mappings.tableId
      ? String(mappings.tableId).trim()
      : null;
    if (mappedTableId) _currentTableId = mappedTableId;
    for (const cb of _onRecordCallbacks) {
      try {
        Promise.resolve(cb(record, _currentTableId, mappings)).catch(function (e) {
          console.error('[GristAPI] erreur callback onRecord:', e);
        });
      } catch (e) {
        console.error('[GristAPI] erreur callback onRecord:', e);
      }
    }

    detectTableId(mappings, 'onRecord').then(function (tableId) {
      if (tableId) _currentTableId = tableId;
    }).catch(function (e) {
      console.warn('[GristAPI] onRecord: échec detectTableId —', e);
    });
  }

  // settings.linking = { asTarget, asSource } (WidgetFrame.ts de grist-core) : asTarget est le type du lien qui pilote ce widget
  // (« Cursor:Same-Table »...) ou null quand « Sélectionner par » est vide, et Grist le renvoie à chaque changement de ce réglage. Absent des
  // versions de Grist qui ne le disent pas : rien n'est alors affirmé.
  function linkStateOf(settings) {
    const linking = settings && settings.linking;
    if (!linking || typeof linking !== 'object') return 'unknown';
    if (linking.asTarget === null) return 'unlinked';
    return typeof linking.asTarget === 'string' && linking.asTarget ? 'linked' : 'unknown';
  }

  // Avertit une seule fois, depuis onOptions, que l'accès accordé n'est pas « full ». Purement informatif : la souscription 'normal' (cf. init())
  // reste enregistrée dans tous les cas, elle échoue seulement, sans bruit, à chaque événement tant que l'accès n'est pas complet ; le repli 'shown'
  // continue de livrer les données.
  function warnIfLimitedAccess(accessLevel) {
    if (accessLevel === 'full' || _limitedAccessWarned) return;
    _limitedAccessWarned = true;
    console.warn('[GristAPI] accès accordé au widget = "' + accessLevel + '" (pas "full") : includeColumns:\'normal\' pour onRecord échoue - '
      + 'les règles macro-modèle testant une colonne non cochée dans le panneau de droite de CE widget échoueront silencieusement '
      + '(record[col] absent) tant qu\'un accès complet n\'est pas accordé.');
  }

  // Prévient les abonnés d'un état : la panne de l'un n'empêche pas les suivants.
  function notifyAll(callbacks, label, value) {
    for (const cb of callbacks) {
      try { cb(value); } catch (e) { console.error('[GristAPI] erreur callback ' + label + ':', e); }
    }
  }

  // Ce que Grist envoie à chaque changement d'options : les options JSON du widget, le lien « Sélectionner par » et le niveau d'accès. Les abonnés du
  // lien et de l'accès ne sont prévenus que si leur état change.
  function handleIncomingOptions(options, settings) {
    _currentOptions = options || null;
    warnIfLimitedAccess(settings && settings.accessLevel);
    // Les deux états sont posés avant tout rappel : un abonné qui lit l'un pendant que l'autre change ne voit jamais un mélange des deux versions
    // des options.
    const linkState = linkStateOf(settings);
    const accessLevel = settings && typeof settings.accessLevel === 'string' ? settings.accessLevel : null;
    const linkChanged = linkState !== _linkState;
    const accessChanged = accessLevel !== _accessLevel;
    _linkState = linkState;
    _accessLevel = accessLevel;
    if (linkChanged) notifyAll(_linkStateCallbacks, 'onLinkStateChange', linkState);
    if (accessChanged) notifyAll(_accessLevelCallbacks, 'onAccessLevelChange', accessLevel);
    notifyAll(_optionsCallbacks, 'onOptions', _currentOptions);
  }

  function subscribeToRecords() {
    if (_recordSubscriptionRegistered) return;
    try {
      // includeColumns:'normal' (au lieu du défaut 'shown') : avec 'shown', seules les colonnes cochées dans le panneau de droite de ce widget
      // arrivent dans `record` (GristAPI.ts, FetchSelectedOptions.includeColumns) ; une colonne créée depuis une autre vue, ou simplement pas
      // affichée ici, est absente (record[col] === undefined), jamais seulement vide. Une règle de macro-modèle qui teste cette colonne échoue alors
      // sans bruit en « = » (undefined ne correspond jamais) et retombe sur le cas par défaut. 'normal' exige un accès complet, demandé ci-dessus
      // (requiredAccess:'full') mais pas forcément accordé.
      //
      // Deux souscriptions onRecord indépendantes sont enregistrées ici, ensemble, avant tout await : Grist n'a pas d'« offRecord », et un abonnement
      // ajouté plus tard ne reçoit jamais les messages déjà distribués.
      //  - 'normal' (enrichie) : la source de vérité dès qu'elle a livré un record (_normalDataDelivered). Si l'accès n'est pas « full », chaque
      //    tentative échoue sans bruit côté Grist (rejet RPC que le widget ne rattrape pas ; warnIfLimitedAccess donne le diagnostic) et
      //    _normalDataDelivered reste faux, sans conséquence : le repli continue de fonctionner.
      //  - 'shown' (repli) : ignorée seulement une fois que 'normal' a livré un record. Tant que ce n'est pas le cas (accès encore incertain, ou pas
      //    « full »), ses données passent toujours par handleIncomingRecord, jamais perdues.
      //
      // Pourquoi pas une bascule (repli 'shown' seul au démarrage, souscription 'normal' ajoutée une fois l'accès complet confirmé par onOptions) :
      // au démarrage, la ligne courante et les options arrivent presque ensemble (WidgetFrame.ts : TableNotifier puis ConfigNotifier au ready), si
      // bien que la confirmation d'onOptions précède la réponse RPC du repli. La souscription 'normal', ajoutée après coup, ne recevait jamais ce
      // premier message (aucun rejeu côté RPC) : aucun rappel n'était appelé pour la ligne initiale, et getCurrentRecord() restait null jusqu'au
      // changement de ligne suivant. Enregistrer les deux dès le départ supprime ce délai.
      grist.onRecord(function (record, mappings) {
        if (_normalDataDelivered) return;
        handleIncomingRecord(record, mappings);
      }, { includeColumns: 'shown' });
      grist.onRecord(function (record, mappings) {
        _normalDataDelivered = true;
        handleIncomingRecord(record, mappings);
      }, { includeColumns: 'normal' });
      _recordSubscriptionRegistered = true;
    } catch (e) {
      console.error('[GristAPI] ERREUR lors de grist.onRecord():', e);
    }
  }

  function subscribeToOptions() {
    try {
      grist.onOptions(handleIncomingOptions);
    } catch (e) {
      console.warn('[GristAPI] onOptions non disponible:', e);
    }
  }

  // Les options JSON propres au widget se lisent tout de suite, sans accessLevel : grist.getOptions() (WidgetAPI.getOptions) rend les options
  // personnalisées du widget lui-même (activeCustomOptions côté grist-core), pas InteractionOptions ; seul onOptions(cb) reçoit {accessLevel,
  // linking} en second argument.
  async function loadSeedOptions() {
    try {
      if (typeof grist.getOptions === 'function') {
        const seedOptions = await grist.getOptions();
        _currentOptions = seedOptions || _currentOptions;
      }
    } catch (e) {
      console.warn('[GristAPI] getOptions indisponible:', e);
    }
  }

  // Schéma rapide : noms des tables, types et colonnes tirées des métadonnées (cf. runSchemaPass). La lecture complète de chaque table, qui rend
  // les colonnes exactes, ne bloque plus l'ouverture : Editor.setHTML la demande dès le premier modèle affiché (et js/main.js la rappelle quelques
  // secondes après l'ouverture si rien ne l'a fait).
  async function loadInitialSchema() {
    try {
      await (_schemaPass ? refreshSchema() : startSchemaPass(true));
    } catch (e) {
      console.error('[GristAPI] refreshSchema a échoué:', e);
    }
  }

  async function loadInitialLinkRules() {
    try {
      await loadLinkRules();
    } catch (e) {
      console.error('[GristAPI] loadLinkRules a échoué:', e);
    }
  }

  async function init() {
    try {
      // N'ajouter columns:[...] qu'après un essai dans un vrai Grist : cela change mappings.tableId, dont dépend la détection de la table courante,
      // et casserait toute la résolution des #Variable.
      grist.ready({ requiredAccess: 'full' });
    } catch (e) {
      console.error('[GristAPI] ERREUR lors de grist.ready():', e);
      throw e;
    }

    // Enregistrer onRecord avant tout await, pour ne pas rater l'événement initial.
    subscribeToRecords();
    subscribeToOptions();

    // Les options du widget, le schéma du document et les règles de liaison se lisent ensemble : en série, ces appels feraient attendre cinq
    // aller-retour de plus l'affichage du premier modèle. Aucun ne dépend d'un autre, et chacun attrape ses propres erreurs.
    await Promise.all([loadSeedOptions(), loadInitialSchema(), loadInitialLinkRules()]);
  }

  // Le tableId que dit l'objet table de grist.getTable() : getTableId() d'abord, sinon ses propriétés.
  async function tableIdOf(table) {
    if (typeof table.getTableId === 'function') {
      const id = await table.getTableId();
      if (id) return id;
    }
    if (table.tableId) return String(table.tableId);
    for (const key of ['id', 'tableRef', 'name']) {
      if (table[key]) return String(table[key]);
    }
    return null;
  }
  async function tableIdFromGristTable(source) {
    try {
      if (typeof grist.getTable !== 'function') return null;
      const table = await grist.getTable();
      return table ? await tableIdOf(table) : null;
    } catch (e) {
      console.warn('[GristAPI] detectTableId(' + source + '): échec grist.getTable —', e);
      return null;
    }
  }
  // La première table du schéma dont une colonne est une clé de la ligne courante.
  function tableIdFromRecordKeys() {
    const keys = new Set(Object.keys(_currentRecord));
    return _tables.find(tableId => (_columnsByTable[tableId] || []).some(column => keys.has(column))) || null;
  }

  // Récupération robuste du tableId : mappings -> grist.getTable() -> schéma -> vues
  async function detectTableId(mappings, source) {
    source = source || 'unknown';
    // 1. Via mappings.tableId (présent en accès full)
    const mapped = mappings && String(mappings.tableId || '').trim();
    if (mapped) return mapped;
    // 2. Via grist.getTable()
    const fromTable = await tableIdFromGristTable(source);
    if (fromTable) return fromTable;
    // 3. Repli par le schéma : les clés de la ligne courante contre les colonnes de chaque table
    const fromRecord = _currentRecord && tableIdFromRecordKeys();
    if (fromRecord) return fromRecord;
    console.warn('[GristAPI] detectTableId(' + source + '): aucune source de tableId disponible.');
    return null;
  }

  // Une passe de schéma à la fois (jamais deux lectures complètes de toutes les tables en même temps) : un appel qui arrive pendant une passe attend
  // la suivante, qui part dès la fin de celle-ci et sert tous ceux qui l'ont demandée entre-temps - la passe en cours a pu lire avant le changement
  // que l'appelant vient de faire (une colonne ajoutée, renommée), elle ne le dispense pas d'une relecture. `maxAgeMs` (facultatif) : se contente
  // d'une passe commencée il y a moins que ça, en cours ou terminée - Editor.setHTML le demande, le schéma qu'init() vient de lire n'a aucune raison
  // d'être relu à l'instant où s'affiche le premier modèle.
  let _schemaPass = null;       // { startedAt, promise } de la passe en cours
  let _schemaNext = null;       // promesse de la passe qui suivra
  let _schemaLastStart = 0;     // début de la dernière passe terminée
  function startSchemaPass(fast) {
    const pass = { startedAt: Date.now(), fast: !!fast };
    _schemaPass = pass;
    // Une passe rapide (init) ne compte pas comme « lue il y a moins de maxAgeMs » : ses listes de colonnes sont provisoires, la passe complète qui
    // la suit les rend exactes.
    pass.promise = runSchemaPass(fast).then(() => { if (!fast) _schemaLastStart = pass.startedAt; }).finally(() => { if (_schemaPass === pass) _schemaPass = null; });
    return pass.promise;
  }
  function refreshSchema(options) {
    const maxAgeMs = options && options.maxAgeMs > 0 ? options.maxAgeMs : 0;
    if (maxAgeMs) {
      if (_schemaPass && !_schemaPass.fast && Date.now() - _schemaPass.startedAt < maxAgeMs) return _schemaPass.promise;
      if (!_schemaPass && _schemaLastStart && Date.now() - _schemaLastStart < maxAgeMs) return Promise.resolve();
    }
    if (!_schemaPass) return startSchemaPass();
    if (!_schemaNext) _schemaNext = _schemaPass.promise.then(() => { _schemaNext = null; return startSchemaPass(); });
    return _schemaNext;
  }

  // `fast` (init) : les listes de colonnes viennent des métadonnées (provisionalColumnsByTable), quelques Ko lus avec listTables, au lieu de la
  // lecture complète de chaque table, qui faisait attendre plusieurs secondes l'affichage du premier modèle sur un gros document. La passe complète
  // qui suit les rend exactes.
  async function runSchemaPass(fast) {
    // Les métadonnées des colonnes partent en même temps que listTables (un aller-retour de moins) ; leur échec éventuel est traité par
    // refreshColumnTypes.
    const metaRead = readColumnMeta();
    metaRead.catch(() => {});
    try {
      await loadRawTables();
      _tables = _rawTables.filter(t => INTERNAL_TABLES.indexOf(t) === -1);
      _columnsByTable = await (fast ? provisionalColumnsByTable(metaRead) : exactColumnsByTable());
    } catch (e) {
      console.error('[GristAPI] refreshSchema: erreur globale —', e);
    }
    await refreshColumnTypes(metaRead);
  }

  // Colonnes exactes : les clés que Grist rend à fetchTable pour chaque table (lecture complète de toutes les tables).
  async function exactColumnsByTable() {
    // fetchTable en parallèle (latence = le plus lent, pas la somme) ; écrit dans un objet temporaire, remplacé d'un coup par l'appelant pour éviter
    // un schéma vidé-mais-pas-repeuplé pendant les allers-retours réseau.
    const nextColumnsByTable = {};
    await Promise.all(_tables.map(async t => {
      try {
        const data = await readTable(t);
        const cols = Object.keys(data || {}).filter(k => k !== 'id' && k !== 'manualSort');
        nextColumnsByTable[t] = cols;
      } catch (e) {
        // Une table qu'on ne parvient pas à lire garde les colonnes déjà connues (celles des métadonnées, ou d'une passe réussie) : sans elles,
        // toutes ses variables disparaissaient de la liste « # » et des choix de colonne, avec ce seul avertissement dans la console.
        console.warn('[GristAPI] refreshSchema: échec fetchTable(' + t + ') —', e);
        nextColumnsByTable[t] = _columnsByTable[t] || [];
      }
    }));
    return nextColumnsByTable;
  }

  // Identifiant de chaque table des métadonnées (_grist_Tables), par numéro de ligne : { [rowId]: tableId }. Une colonne que la réponse ne porte pas
  // (règle d'accès qui la cache, lecture partielle) se lit vide : la passe continue, sans colonnes pour ces tables.
  function tableIdsByRowId(tablesMeta) {
    const tableIds = tablesMeta.tableId || [];
    const byRowId = {};
    for (let i = 0; i < tablesMeta.id.length; i++) byRowId[tablesMeta.id[i]] = tableIds[i];
    return byRowId;
  }

  // Colonnes provisoires : celles que les métadonnées (_grist_Tables_column) rangent sous chaque table, dans l'ordre de leur position (parentPos,
  // celui du code que Grist génère pour la table). Les mêmes que les clés de fetchTable, à l'ordre et aux colonnes qu'un accès restreint cache près :
  // ce que la passe complète corrige.
  async function provisionalColumnsByTable(metaRead) {
    const [tablesMeta, colsMeta] = await metaRead;
    const tableIdByRowId = tableIdsByRowId(tablesMeta);
    const parentIds = colsMeta.parentId || [];
    const colIds = colsMeta.colId || [];
    const found = {};
    for (let i = 0; i < colsMeta.id.length; i++) {
      const tableId = tableIdByRowId[parentIds[i]];
      const colId = colIds[i];
      if (!tableId || !colId || colId === 'manualSort') continue;
      const pos = colsMeta.parentPos && colsMeta.parentPos[i] != null ? colsMeta.parentPos[i] : i;
      (found[tableId] = found[tableId] || []).push({ colId, pos });
    }
    const next = {};
    _tables.forEach(t => { next[t] = (found[t] || []).sort((a, b) => a.pos - b.pos).map(c => c.colId); });
    return next;
  }

  // Types de la « colonne à afficher » d'une Référence dont les valeurs se proposent dans un champ Valeur (getReferenceValues). « Any » : une colonne
  // à formule dont Grist n'a pas encore fixé le type ; ses valeurs qui ne sont ni du texte ni un nombre sont écartées à la lecture.
  const REFERENCE_SHOWN_TYPES = ['Text', 'Choice', 'Int', 'Numeric', 'Any'];

  // Type Grist de chaque colonne (ex. "Ref:Employes", "Text"...) : signale dans la modale de liaison qu'une colonne est une Référence, pour que
  // l'utilisateur la compare à l'Identifiant de ligne, pas à une colonne texte. Les deux tables de métadonnées sont demandées ensemble (un
  // aller-retour au lieu de deux) ; refreshSchema les lance en même temps que listTables et les passe à refreshColumnTypes.
  function readColumnMeta() {
    return Promise.all([readTable('_grist_Tables'), readTable('_grist_Tables_column')]);
  }
  // Choix d'une colonne Choice/ChoiceList : widgetOptions est un JSON stocké en Text (schema.ts), clé « choices » (ChoiceTextBox.ts de grist-core),
  // un tableau de chaînes. Un widgetOptions absent ou mal formé ne doit pas faire échouer tout refreshSchema : la colonne reste sans choix connus, et
  // le champ de valeur retombe sur le texte libre (js/condition-fields.js:buildValueField).
  function choicesOf(colsMeta, i) {
    try {
      const raw = colsMeta.widgetOptions && colsMeta.widgetOptions[i];
      const options = raw ? JSON.parse(raw) : null;
      return options && Array.isArray(options.choices) ? options.choices : null;
    } catch (e) {
      return null;
    }
  }
  // displayCol (schema.ts : Ref:_grist_Tables_column) : la colonne dont Grist affiche la valeur, la colonne elle-même si 0
  // (ColumnRec.displayColModel, grist-core). L'identifiant de colonne de l'aide d'affichage de la colonne `i`, null si elle s'affiche elle-même.
  function displayColIdOf(colsMeta, i, colIdByRowId) {
    const displayRef = colsMeta.displayCol ? colsMeta.displayCol[i] : 0;
    return displayRef && displayRef !== colsMeta.id[i] && colIdByRowId[displayRef] || null;
  }
  // visibleCol (schema.ts : Ref:_grist_Tables_column ; 0 = aucune, la Référence montre alors l'id de la ligne) : la colonne de la table liée dont la
  // valeur s'affiche. Retenue seulement si elle porte du texte ou un nombre, seules valeurs qu'une règle peut proposer : une date ou un booléen
  // s'afficheraient autrement que la valeur brute lue dans la table liée. { table, column } pour la colonne `i`, null si elle n'en a pas.
  function shownColumnOf(colsMeta, i, colIndexByRowId) {
    const reference = referenceOf(String(colsMeta.type[i] || ''));
    if (!reference) return null;
    const shown = colIndexByRowId[colsMeta.visibleCol ? colsMeta.visibleCol[i] : 0];
    if (shown === undefined || !REFERENCE_SHOWN_TYPES.includes(colsMeta.type[shown])) return null;
    return { table: reference.table, column: colsMeta.colId[shown] };
  }
  const rowOf = (map, tableId) => map[tableId] || (map[tableId] = {});

  // Écrit dans des objets temporaires, remplacés d'un coup à la fin (comme refreshSchema pour les colonnes) : pendant les allers-retours, un autre
  // rendu qui lit un type (getColumnType) ne tombe plus sur un schéma vidé. `metaRead` : la lecture des métadonnées déjà lancée par refreshSchema,
  // sinon elle est faite ici.
  async function refreshColumnTypes(metaRead) {
    const types = {};
    const choices = {};
    const displayCols = {};
    const referenceCols = {};
    try {
      const [tablesMeta, colsMeta] = await (metaRead || readColumnMeta());
      const tableIdByRowId = tableIdsByRowId(tablesMeta);
      const colIdByRowId = {};
      const colIndexByRowId = {};
      for (let i = 0; i < colsMeta.id.length; i++) { colIdByRowId[colsMeta.id[i]] = colsMeta.colId[i]; colIndexByRowId[colsMeta.id[i]] = i; }
      for (let i = 0; i < colsMeta.id.length; i++) {
        const tableId = tableIdByRowId[colsMeta.parentId[i]];
        if (!tableId) continue;
        const colId = colsMeta.colId[i];
        rowOf(types, tableId)[colId] = colsMeta.type[i];
        const displayColId = displayColIdOf(colsMeta, i, colIdByRowId);
        if (displayColId) rowOf(displayCols, tableId)[colId] = displayColId;
        const shown = shownColumnOf(colsMeta, i, colIndexByRowId);
        if (shown) rowOf(referenceCols, tableId)[colId] = shown;
        const columnChoices = choicesOf(colsMeta, i);
        if (columnChoices) rowOf(choices, tableId)[colId] = columnChoices;
      }
      _columnTypesByTable = types;
      _columnChoicesByTable = choices;
      _displayColByTable = displayCols;
      _referenceColumnByTable = referenceCols;
    } catch (e) {
      console.warn('[GristAPI] refreshColumnTypes: échec', e);
    }
  }

  // La table que vise un type Référence (« Ref:Annuaire ») ou Liste de références (« RefList:Annuaire ») : { table, list }, `list` vrai pour la
  // seconde ; null pour tout autre type.
  function referenceOf(type) {
    const found = /^(Ref|RefList):(.+)$/.exec(type);
    return found ? { table: found[2], list: found[1] === 'RefList' } : null;
  }
  // Type d'une colonne. Un chemin « Ref.Colonne » (bulle qui descend de référence en référence, cf. resolveColumnPath) a le type de sa dernière
  // colonne : c'est lui qui décide du format date/nombre et des images d'une variable.
  function getColumnType(tableId, colId) {
    if (typeof colId === 'string' && colId.indexOf('.') !== -1) {
      const end = resolveColumnPath(tableId, colId);
      return end ? end.type : null;
    }
    return (_columnTypesByTable[tableId] && _columnTypesByTable[tableId][colId]) || null;
  }
  // Table où mène une suite de colonnes Référence simples à partir de `tableId` (la table elle-même si la suite est vide), null si un maillon manque
  // ou n'est pas une Référence (une liste de références désigne plusieurs lignes : on ne descend pas dedans).
  function tableAtEndOf(tableId, hops) {
    let table = tableId;
    for (let i = 0; i < hops.length; i++) {
      const ref = referenceOf(_columnTypesByTable[table] && _columnTypesByTable[table][hops[i]]);
      if (!ref || ref.list) return null;
      table = ref.table;
    }
    return table;
  }
  // Une bulle #Variable peut descendre de référence en référence, comme $Projet.Accompagnateur.Email dans une formule Grist : sa colonne est alors un
  // chemin « Accompagnateur.Email » (colonnes Référence puis colonne finale) à partir de sa table. Les identifiants de colonne de Grist ne
  // contiennent jamais de point, il sépare donc sans ambiguïté. Retourne { table, column, type } pour la colonne où le chemin aboutit, null si un
  // maillon manque ou n'est pas une Référence. Une colonne ordinaire (sans point) est un chemin d'un seul maillon.
  function resolveColumnPath(tableId, path) {
    const hops = String(path == null ? '' : path).split('.');
    const column = hops.pop();
    const table = tableAtEndOf(tableId, hops);
    const type = table && _columnTypesByTable[table] && _columnTypesByTable[table][column];
    return type ? { table, column, type } : null;
  }

  // Colonne qui porte la valeur AFFICHÉE d'une Référence/liste de références (ex. "gristHelper_Display2", présente dans les lignes de fetchTable),
  // null si la colonne s'affiche elle-même (identifiant de ligne) ou n'est pas une Référence.
  function getDisplayColumn(tableId, colId) {
    return (_displayColByTable[tableId] && _displayColByTable[tableId][colId]) || null;
  }
  // Colonne de la table liée que montre une colonne Référence / liste de références ({ table, column }), null si la colonne n'en est pas une, si elle
  // montre l'id de la ligne, ou si la colonne montrée n'est ni du texte ni un nombre - pas de valeurs à lui proposer
  // (js/condition-fields.js:buildValueField).
  function getReferenceColumn(tableId, colId) {
    return (_referenceColumnByTable[tableId] && _referenceColumnByTable[tableId][colId]) || null;
  }
  // Lectures de table en cours, par colonne lue : les règles d'une même fenêtre qui portent sur la même Référence partagent une seule lecture (sans
  // mémoire ensuite : une ligne ajoutée dans Grist entre deux ouvertures apparaît à la suivante).
  const _referenceValuesPending = {};
  // Valeurs qu'une colonne Référence / liste de références peut afficher, telles que le compare une règle : celles de la colonne montrée
  // (getReferenceColumn) sur toutes les lignes de la table liée, texte ou nombre écrits en texte, sans espaces autour (compareValues les rogne), sans
  // doublon, dans l'ordre alphabétique (chiffres compris). [] si la colonne n'a rien à proposer ; rejette si la table liée est illisible.
  function getReferenceValues(tableId, colId) {
    const source = getReferenceColumn(tableId, colId);
    if (!source) return Promise.resolve([]);
    const key = source.table + '\u0000' + source.column;
    if (!_referenceValuesPending[key]) {
      const read = grist.docApi.fetchTable(source.table).then(data => {
        const seen = new Set();
        ((data && data[source.column]) || []).forEach(value => {
          const text = typeof value === 'string' ? value : (typeof value === 'number' && isFinite(value) ? String(value) : '');
          if (text.trim()) seen.add(text.trim());
        });
        return Array.from(seen).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
      });
      const done = () => { if (_referenceValuesPending[key] === read) delete _referenceValuesPending[key]; };
      read.then(done, done);
      _referenceValuesPending[key] = read;
    }
    return _referenceValuesPending[key];
  }
  // Vrai pour une ligne lue par fetchTableRows/fetchRowById (forme brute), faux pour la ligne de grist.onRecord - js/variables.js:cellValue ne
  // convertit que la première.
  function isRawRow(row) { return !!row && typeof row === 'object' && _rawRows.has(row); }

  // Liste des choix configurés (widgetOptions.choices) d'une colonne Choice/ChoiceList, ou null si absente/non applicable - cf. refreshColumnTypes.
  function getColumnChoices(tableId, colId) {
    return (_columnChoicesByTable[tableId] && _columnChoicesByTable[tableId][colId]) || null;
  }

  function getTables() { return _tables; }

  function getColumns(tableId) {
    return _columnsByTable[tableId] || [];
  }
  // Une colonne d'aide « gristHelper_… » : le texte affiché d'une Référence, que Grist range dans la même table. Le widget ne la propose ni ne la
  // nomme jamais.
  function isHelperColumn(column) { return String(column).indexOf('gristHelper_') === 0; }
  function getVisibleColumns(tableId) { return getColumns(tableId).filter(column => !isHelperColumn(column)); }

  function getAllVariables() {
    const vars = [];
    for (const t of _tables) {
      for (const c of getColumns(t)) {
        vars.push({ key: t + '.' + c, table: t, column: c });
      }
    }
    return vars;
  }

  function onRecord(cb) {
    _onRecordCallbacks.push(cb);
    // Rejouer immédiatement le dernier record connu si on est déjà prêt
    if (_currentRecord) {
      try { cb(_currentRecord, _currentTableId, _currentMappings); }
      catch (e) { console.error('[GristAPI] onRecord replay callback erreur:', e); }
    }
  }

  function getCurrentRecord() { return _currentRecord; }
  function getCurrentTableId() { return _currentTableId; }

  // Options JSON propres au widget (jamais accessLevel, cf. init()) : lues au démarrage par getOptions puis tenues à jour par onOptions.
  function getWidgetOptions() { return _currentOptions; }
  function onWidgetOptionsChange(cb) { _optionsCallbacks.push(cb); }
  // 'linked' (relié à une autre vue), 'unlinked' (« Sélectionner par » vide) ou 'unknown' ; le rappel reçoit le nouvel état à chaque changement.
  function getLinkState() { return _linkState; }
  function onLinkStateChange(cb) { _linkStateCallbacks.push(cb); }
  // 'none', 'read table', 'full' ou null (Grist ne l'a pas encore dit) ; Grist renvoie les options, donc le rappel, quand l'accès est accordé ou
  // retiré.
  function getAccessLevel() { return _accessLevel; }
  function onAccessLevelChange(cb) { _accessLevelCallbacks.push(cb); }
  // grist.setOption ne pose qu'un brouillon des options de la section (ViewSectionRec.activeCustomOptions, grist-core) : Grist affiche alors un
  // bouton Enregistrer en haut du widget, seul moyen de le rendre durable et visible des autres personnes. Recopié localement tout de suite, sans
  // attendre le retour d'onOptions.
  async function setWidgetOption(key, value) {
    _currentOptions = Object.assign({}, _currentOptions, { [key]: value });
    await grist.setOption(key, value);
  }

  async function findReferenceColumns(fromTableId, toTableId) {
    if (!fromTableId || !toTableId) return [];
    try {
      const [tablesMeta, colsMeta] = await Promise.all([readTable('_grist_Tables'), readTable('_grist_Tables_column')]);
      const tableRowId = {};
      for (let i = 0; i < tablesMeta.id.length; i++) {
        tableRowId[tablesMeta.tableId[i]] = tablesMeta.id[i];
      }
      const fromRowId = tableRowId[fromTableId];
      const toRowId = tableRowId[toTableId];
      if (!fromRowId || !toRowId) return [];
      const refCols = [];
      if (colsMeta && colsMeta.parentId && colsMeta.type) {
        colsMeta.parentId.forEach((parent, i) => {
          const ref = referenceOf(colsMeta.type[i]);
          if (parent === fromRowId && ref && !ref.list && ref.table === toTableId) refCols.push(colsMeta.colId[i]);
        });
      }
      return refCols;
    } catch (e) {
      console.warn('[GristAPI] findReferenceColumns: échec:', e);
      return [];
    }
  }

  async function fetchRowById(tableId, rowId, fresh) {
    const data = await readTable(tableId, fresh);
    const ids = data && data.id ? data.id : [];
    const idx = ids.indexOf(rowId);
    if (idx === -1) return null;
    const row = {};
    for (const key of Object.keys(data)) row[key] = data[key][idx];
    _rawRows.add(row);
    return row;
  }

  // Toutes les lignes d'une table sous forme de tableau d'objets {colonne: valeur} (au lieu du format colonnaire de fetchTable) - utilisé par la
  // résolution "match"/"singleton" des règles de liaison, qui compare plusieurs lignes à la fois, contrairement à fetchRowById.
  async function fetchTableRows(tableId) {
    // Pendant un rendu, les lignes sont construites une fois par table (readTable partage déjà la lecture) : les appelants ne font que chercher,
    // filtrer ou trier une copie (tableOrder), jamais modifier une ligne.
    const pass = _readPass;
    if (!pass) return rowsOf(await readTable(tableId));
    if (!pass.rows.has(tableId)) {
      const built = readTable(tableId).then(rowsOf);
      built.catch(() => { if (pass.rows.get(tableId) === built) pass.rows.delete(tableId); });
      pass.rows.set(tableId, built);
    }
    return (await pass.rows.get(tableId)).slice();
  }
  function rowsOf(data) {
    const ids = data && data.id ? data.id : [];
    const rows = [];
    for (let i = 0; i < ids.length; i++) {
      const row = {};
      for (const key of Object.keys(data)) row[key] = data[key][i];
      _rawRows.add(row);
      rows.push(row);
    }
    return rows;
  }

  // Table de bookkeeping stockant, pour chaque table cible référencée via # depuis une autre table, comment en trouver la bonne ligne : "singleton"
  // (une seule ligne pertinente) ou "match" (comparer ColonneCible à ColonneSource, "id" désignant l'identifiant de ligne Grist). Créée à la volée au
  // 1er besoin.
  async function ensureLinksTableExists() {
    const tables = await listAllTablesCached();
    try {
      await addTableIfMissing(tables, LINKS_TABLE_NAME, [
        { id: 'TableCible', type: 'Text' },
        { id: 'Mode', type: 'Text' },
        { id: 'ColonneCible', type: 'Text' },
        { id: 'ColonneSource', type: 'Text' },
      ]);
    } catch (e) {
      console.error('[GristAPI] Erreur création table de liaison', e);
    }
  }

  async function loadLinkRules() {
    await ensureLinksTableExists();
    _linkRulesByTable = {};
    try {
      const data = await grist.docApi.fetchTable(LINKS_TABLE_NAME);
      const ids = data && data.id ? data.id : [];
      for (let i = 0; i < ids.length; i++) {
        _linkRulesByTable[data.TableCible[i]] = {
          id: data.id[i],
          mode: data.Mode[i],
          colonneCible: data.ColonneCible[i],
          colonneSource: data.ColonneSource[i]
        };
      }
    } catch (e) {
      console.warn('[GristAPI] loadLinkRules: échec de lecture', e);
    }
  }

  function getLinkRule(tableId) { return _linkRulesByTable[tableId] || null; }

  function getAllLinkRules() {
    return Object.keys(_linkRulesByTable).map(t => Object.assign({ tableCible: t }, _linkRulesByTable[t]));
  }

  // Upsert (une seule règle par table cible) - écrase la précédente si l'utilisateur reconfigure une table déjà liée (depuis le panneau de gestion,
  // ou en réinsérant la variable après une modification de schéma).
  async function saveLinkRule(tableCible, rule) {
    await ensureLinksTableExists();
    const columns = {
      TableCible: tableCible,
      Mode: rule.mode,
      ColonneCible: rule.mode === 'match' ? (rule.colonneCible || '') : '',
      ColonneSource: rule.mode === 'match' ? (rule.colonneSource || '') : ''
    };
    const existing = _linkRulesByTable[tableCible];
    if (existing) {
      await grist.docApi.applyUserActions([['UpdateRecord', LINKS_TABLE_NAME, existing.id, columns]]);
      _linkRulesByTable[tableCible] = { id: existing.id, mode: columns.Mode, colonneCible: columns.ColonneCible, colonneSource: columns.ColonneSource };
    } else {
      const result = await grist.docApi.applyUserActions([['AddRecord', LINKS_TABLE_NAME, null, columns]]);
      const newId = result.retValues[0];
      _linkRulesByTable[tableCible] = { id: newId, mode: columns.Mode, colonneCible: columns.ColonneCible, colonneSource: columns.ColonneSource };
    }
  }

  async function deleteLinkRule(tableCible) {
    const existing = _linkRulesByTable[tableCible];
    if (!existing) return;
    await grist.docApi.applyUserActions([['RemoveRecord', LINKS_TABLE_NAME, existing.id]]);
    delete _linkRulesByTable[tableCible];
  }

  // Sur certaines instances Grist auto-hébergées (APP_HOME_URL mal configuré), getAccessToken() renvoie un baseUrl dont l'hôte interne est
  // injoignable (ex. 0.0.0.0) : on reprend l'origine de document.referrer, la page Grist qui embarque ce widget en iframe.
  function fixBaseUrl(baseUrl) {
    try {
      const url = new URL(baseUrl);
      if (['0.0.0.0', 'localhost', '127.0.0.1'].includes(url.hostname) && document.referrer) {
        const ref = new URL(document.referrer);
        url.protocol = ref.protocol;
        url.hostname = ref.hostname;
        url.port = ref.port;
        return url.toString().replace(/\/$/, '');
      }
    } catch (e) {
      console.warn('[GristAPI] fixBaseUrl: impossible d’analyser', baseUrl, e);
    }
    return baseUrl;
  }

  // Jeton d'accès court terme (quelques minutes) réutilisé pour télécharger des pièces jointes, avec une marge de sécurité avant expiration. En
  // lecture seule : le widget ne fait que lire des pièces jointes, il n'en envoie aucune, et un jeton capable d'écrire serait un risque inutile s'il
  // sortait du widget.
  async function getAccessTokenCached() {
    const now = Date.now();
    if (_tokenCache && _tokenCache.expiresAt - now > 15000) return _tokenCache;
    const info = await grist.docApi.getAccessToken({ readOnly: true });
    const baseUrl = fixBaseUrl(info.baseUrl);
    if (baseUrl !== info.baseUrl) console.warn('[GristAPI] baseUrl corrigé:', info.baseUrl, '->', baseUrl);
    _tokenCache = { token: info.token, baseUrl, expiresAt: now + (info.ttlMsecs || 120000) };
    return _tokenCache;
  }

  // L'identifiant d'une pièce jointe de Grist est un numéro de ligne : des chiffres, rien d'autre. Un modèle écrit `data-attachment-id` comme il
  // veut ; tout ce qui n'est pas un numéro (`..`, `/`, `?`, `#`, `@`...) est refusé ici, avant de se glisser dans le chemin de l'adresse. '' :
  // refusé.
  function attachmentIdOf(value) {
    if (!value || (typeof value !== 'number' && typeof value !== 'string')) return '';
    const id = String(value).trim();
    return /^\d+$/.test(id) ? id : '';
  }

  // L'adresse de téléchargement d'une pièce jointe, ou '' quand il n'y en a pas : pas d'identifiant, ou un identifiant refusé (aucun jeton n'est
  // alors demandé).
  async function getAttachmentDownloadUrl(attachmentId) {
    const id = attachmentIdOf(attachmentId);
    if (!id) return '';
    const info = await getAccessTokenCached();
    return `${info.baseUrl}/attachments/${id}/download?auth=${info.token}`;
  }

  // Email et nom de la personne (chips #Variable) : le jeton de getAccessTokenCached() renvoie toujours « anon@getgrist.com » (identité scopée au
  // document, pas à la session navigateur). Contournement : une formule déclenchée sur `user.Email`, dans une table interne dédiée, attribue la vraie
  // valeur (ligne ajoutée puis retirée). `user.Name` se lit de la même ligne, dans une seconde colonne ajoutée à la première demande de nom
  // (sandbox/grist/user.py de grist-core : `Name` comme `Email` ; GranularAccess.ts:getUser : le nom du profil Grist, à défaut la partie de l'adresse
  // avant le @, ou null pour un compte sans nom).
  async function ensureUserProbeTable() {
    await addTableIfMissing(await listAllTablesCached(), USER_PROBE_TABLE_NAME, [
      // recalcWhen:0 = RecalcWhen.DEFAULT (nouvelles lignes ou changement de recalcDeps) ; recalcDeps:null car seule la création de ligne doit
      // déclencher le calcul.
      { id: 'Email', type: 'Text', isFormula: false, formula: 'user.Email', recalcWhen: 0, recalcDeps: null },
    ]);
  }
  // Une lecture de la sonde : la ligne que les formules déclenchées viennent de remplir (Email, et Name si sa colonne existe). Les demandes qui se
  // chevauchent n'en font qu'une - plusieurs chips d'un même rendu, Email et Nom ensemble : deux cycles en parallèle sur un document sans table-sonde
  // auraient créé la table deux fois.
  let _userProbeRead = null;
  function probeUserRow() {
    if (!_userProbeRead) {
      _userProbeRead = readUserProbeRow();
      const done = () => { _userProbeRead = null; };
      _userProbeRead.then(done, done);
    }
    return _userProbeRead;
  }
  async function readUserProbeRow() {
    await ensureUserProbeTable();
    const addResult = await grist.docApi.applyUserActions([['AddRecord', USER_PROBE_TABLE_NAME, null, {}]]);
    const rowId = addResult && addResult.retValues && addResult.retValues[0];
    if (rowId == null) throw new Error('AddRecord sur ' + USER_PROBE_TABLE_NAME + ' n’a renvoyé aucun id de ligne');
    try {
      return await fetchRowById(USER_PROBE_TABLE_NAME, rowId, true);
    } finally {
      // Nettoyage best-effort - une ligne orpheline ici n'est pas grave (la table reste de toute façon interne/invisible), mais mieux vaut ne rien
      // laisser trainer à chaque appel.
      grist.docApi.applyUserActions([['RemoveRecord', USER_PROBE_TABLE_NAME, rowId]]).catch(() => {});
    }
  }
  let _userEmailCache = null;
  async function getCurrentUserEmail() {
    if (_userEmailCache) return _userEmailCache;
    const row = await probeUserRow();
    const email = row && row.Email;
    if (!email) throw new Error('la formule déclenchée user.Email n’a renvoyé aucune valeur');
    rememberUserRow(row);
    return email;
  }

  // Nom de la personne : null tant qu'il n'est pas lu, '' quand Grist n'en donne aucun (une réponse comme une autre, gardée pour la session). Une
  // lecture qui échoue n'est pas gardée.
  let _userNameCache = null;
  let _userNameRead = null;
  // Le nom que porte une ligne de la sonde : null si elle n'a pas la colonne `Name` (table-sonde d'avant la chip Nom), sinon le texte sans espaces
  // autour - '' pour un compte sans nom ou une formule en erreur (une valeur qui n'est pas du texte).
  function userNameOf(row) {
    if (!row || !('Name' in row)) return null;
    return typeof row.Name === 'string' ? row.Name.trim() : '';
  }
  // Une ligne lue donne les deux : l'email et, si la ligne a sa colonne, le nom sont gardés pour la session - la chip qui demande l'autre ensuite n'a
  // rien à relire.
  function rememberUserRow(row) {
    if (row && row.Email) _userEmailCache = row.Email;
    const name = userNameOf(row);
    if (name !== null) _userNameCache = name;
  }
  async function getCurrentUserName() {
    if (_userNameCache !== null) return _userNameCache;
    if (!_userNameRead) {
      _userNameRead = readUserName();
      const done = () => { _userNameRead = null; };
      _userNameRead.then(done, done);
    }
    return _userNameRead;
  }
  async function readUserName() {
    let row = await probeUserRow();
    if (!row) throw new Error('la ligne ajoutée à ' + USER_PROBE_TABLE_NAME + ' est introuvable');
    if (userNameOf(row) === null) {
      // Table-sonde d'avant la chip Nom : sa colonne s'ajoute une fois pour toutes (la ligne qu'on vient de lire ne l'avait pas, donc aucun id pris :
      // AddColumn renommerait sinon), puis une ligne neuve la remplit. Lue hors du partage de probeUserRow : une lecture déjà partie a pu être écrite
      // avant la colonne.
      await grist.docApi.applyUserActions([['AddColumn', USER_PROBE_TABLE_NAME, 'Name', { type: 'Text', isFormula: false, formula: 'user.Name', recalcWhen: 0, recalcDeps: null }]]);
      row = await readUserProbeRow();
    }
    const name = userNameOf(row);
    if (name === null) throw new Error('la colonne Name de ' + USER_PROBE_TABLE_NAME + ' reste absente après son ajout');
    rememberUserRow(row);
    return name;
  }

  // Rafraîchit le src des images de pièces jointes dans un DOM donné : le jeton d'accès expire après quelques minutes, donc le src ne doit jamais
  // être conservé tel quel dans le HTML enregistré — seul data-attachment-id est persistant.
  async function hydrateAttachmentImages(root) {
    if (!root || !root.querySelectorAll) return;
    const images = Array.from(root.querySelectorAll('img.editor-image[data-source="attachment"][data-attachment-id]'));
    await Promise.all(images.map(async img => {
      const id = img.dataset.attachmentId;
      if (!id) return;
      try {
        const url = await getAttachmentDownloadUrl(id);
        // Un identifiant refusé ne donne aucune adresse : le src de l'image reste ce qu'il est, jamais vidé ni remplacé par une adresse bricolée.
        if (url) img.src = url;
        else console.warn('[GristAPI] hydrateAttachmentImages: identifiant de pièce jointe refusé', id);
      } catch (e) { console.warn('[GristAPI] hydrateAttachmentImages: échec pour', id, e); }
    }));
  }

  async function detectCurrentContext() {
    if (!_currentRecord) {
      console.warn('[GristAPI] detectCurrentContext: pas de record courant.');
      return null;
    }
    if (!_currentTableId) _currentTableId = await detectTableId(_currentMappings, 'detectCurrentContext');
    if (!_currentTableId) return null;
    return { tableId: _currentTableId, record: _currentRecord, mappings: _currentMappings };
  }

  return { init, refreshSchema, refreshColumnTypes, withReadPass, getTables, getColumns, getVisibleColumns, isHelperColumn, referenceOf, getColumnType, getColumnChoices, getAllVariables, onRecord, getCurrentRecord, getCurrentTableId, getWidgetOptions, onWidgetOptionsChange, setWidgetOption, detectTableId, findReferenceColumns, fetchRowById, fetchTableRows, detectCurrentContext, getAttachmentDownloadUrl, getCurrentUserEmail, getCurrentUserName, hydrateAttachmentImages, getLinkRule, getAllLinkRules, saveLinkRule, deleteLinkRule, getDisplayColumn, getReferenceColumn, getReferenceValues, isRawRow, resolveColumnPath, tableAtEndOf, getLinkState, onLinkStateChange, getAccessLevel, onAccessLevelChange, ensureTable, createWriteQueue };
})();
