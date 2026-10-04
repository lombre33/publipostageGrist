// Publipostage Grist — wrapper API Grist v1.2.0 — 2026-09-04
console.log('[GristAPI] module chargé, timestamp:', new Date().toISOString(), 'v1.2.0');

const GristAPI = (function () {
  // Tables internes de bookkeeping du widget (modèles, règles de correspondance entre tables) - jamais des tables "métier" de l'utilisateur, donc exclues de
  // _tables/getAllVariables/tout sélecteur de table présenté à l'utilisateur (sans quoi elles polluaient l'autocomplétion # et les sélecteurs de liaison).
  // Publipostage_PreferencesModeles (js/template-preferences.js, épingle/dossier par utilisateur pour
  // l'arbre de modèles) : même raison d'exclusion que les trois tables ci-dessus, jamais un choix
  // métier de l'utilisateur. Publipostage_Commentaires (js/comments.js, fils de discussion) manquait : le vrai
  // listTables() rend TOUTES les tables du document (grist-core WidgetFrame.ts, _grist_Tables sans filtre), elle
  // apparaissait donc dans l'autocomplétion # et les sélecteurs - invisible avec dev-tests/grist-stub.js, qui ne
  // liste jamais ses tables internes.
  const INTERNAL_TABLES = ['Publipostage_Modeles', 'Publipostage_LiensTables', 'Publipostage_UserProbe', 'Publipostage_PreferencesModeles', 'Publipostage_Commentaires', 'Publipostage_Abreviations'];
  const LINKS_TABLE_NAME = 'Publipostage_LiensTables';
  // Table interne pour getCurrentUserEmail() et getCurrentUserName() (chips "Email de l'utilisateur" et "Nom de l'utilisateur") - des colonnes à formule déclenchée
  // (capture qui a réellement déclenché le calcul, `user.Email` et `user.Name`), vidée après chaque lecture.
  const USER_PROBE_TABLE_NAME = 'Publipostage_UserProbe';
  let _tables = [];
  let _columnsByTable = {};
  let _columnTypesByTable = {};
  let _columnChoicesByTable = {};
  // { tableId: { colId: colonne d'affichage } } - pour une Référence, la colonne d'aide (« gristHelper_Display… ») que Grist calcule dans la même table
  // avec la valeur affichée, cf. getDisplayColumn.
  let _displayColByTable = {};
  // { tableId: { colId: { table, column } } } - pour une colonne Référence / liste de références, la colonne de la table liée que Grist affiche à la
  // place de l'id (visibleCol, « Colonne à afficher » du panneau de droite), cf. getReferenceColumn. Seules celles dont le type se lit comme du texte ou un nombre.
  let _referenceColumnByTable = {};
  // Lignes lues par fetchTable (fetchTableRows/fetchRowById) : forme BRUTE (une Référence = id de ligne), contrairement à la ligne livrée par
  // grist.onRecord (valeur affichée) - cf. isRawRow.
  const _rawRows = new WeakSet();
  // Liste BRUTE (tables internes incluses) de listTables(), mémorisée pour éviter de la redemander à chaque ensureXxxTableExists() - `_tables` ci-dessus
  // les exclut déjà, inutilisable ici. Tenue à jour manuellement après un AddTable réussi (cf. listAllTablesCached/ensureLinksTableExists/
  // ensureUserProbeTable) pour ne jamais répondre "table absente" pour une table qu'on vient nous-mêmes de créer dans la même session.
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
  // === Lectures de tables partagées pendant un rendu ===
  // fetchTable est un aller-retour jusqu'au serveur de Grist, qui renvoie la table ENTIÈRE (WidgetFrame.ts : docComm.fetchTable, vérifié à la source grist-core le
  // 2026-10-02). Une bulle d'une autre table en demandait plusieurs d'affilée - la ligne de la table liée, celle de la page, les deux tables de métadonnées pour
  // trouver la colonne Référence -, soit des centaines de lectures identiques pour un macro-modèle (304 pour trois pages dans le banc d'essai) : la Lecture attendait
  // chacune. Le temps d'un rendu (withReadPass), chaque table n'est lue qu'une fois, et tous les appels, simultanés ou suivants, partagent cette lecture. Sans mémoire
  // ensuite : le cache est jeté à la fin du rendu, une ligne modifiée dans Grist apparaît donc au rendu suivant. Un rendu qui démarre repart d'un cache neuf, jamais
  // des lectures d'un rendu plus ancien (une modification arrivée entre les deux ne doit pas lui échapper).
  let _readPass = null;
  let _readPassesOpen = 0;
  async function withReadPass(work) {
    _readPass = { tables: new Map(), rows: new Map() };
    _readPassesOpen++;
    try { return await work(); }
    finally { if (--_readPassesOpen === 0) _readPass = null; }
  }
  // Données colonnaires d'une table (le résultat de fetchTable, jamais modifié par les appelants). `fresh` : lecture directe, hors rendu - quand le résultat dépend d'une
  // écriture qui vient d'avoir lieu (getCurrentUserEmail).
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
  // true UNE FOIS QUE la souscription includeColumns:'normal' a réellement LIVRÉ au moins un record (jamais juste "a été enregistrée" ni "demandée" -
  // cf. le commentaire dans init() : les deux souscriptions 'shown' et 'normal' sont enregistrées ensemble au démarrage, ce drapeau sert uniquement à
  // faire taire le repli 'shown' une fois que 'normal' a prouvé qu'elle fonctionne, pour ne jamais écraser une donnée enrichie par une donnée bridée -
  // distinction issue d'une régression de production corrigée le 2026-09-28).
  let _normalDataDelivered = false;
  let _limitedAccessWarned = false;
  let _tokenCache = null;
  // Abonnés aux options JSON du widget (js/access-rights.js) : grist.onOptions n'est enregistré qu'une fois, ici, et redistribué.
  let _optionsCallbacks = [];

  // Corps commun à toutes les souscriptions onRecord ci-dessous (repli 'shown' et souscription enrichie 'normal') - jamais dupliqué entre elles pour
  // ne pas désynchroniser leur traitement (notification des callbacks, detectTableId, logs) au fil des correctifs futurs.
  function handleIncomingRecord(record, mappings) {
    const receivedAt = new Date();
    const rowId = record && record.id != null ? record.id : null;
    // Ne jamais logger `record`/`mappings` en entier : une ligne de ce widget contient typiquement des données personnelles (RGPD). Seul l'ID de ligne,
    // déjà visible dans l'UI Grist, est loggé.
    console.log('[GristAPI] onRecord reçu, rowId=' + rowId + ', à ' + receivedAt.toISOString());
    _currentRecord = record;
    _currentMappings = mappings || null;
    if (!record) {
      console.warn('[GristAPI] onRecord: aucune ligne sélectionnée (record=null).');
    }

    // Notifier immédiatement à chaque événement de sélection. La détection du tableId peut nécessiter des appels async et ne doit pas retarder le rendu
    // du mode lecture ni bloquer les événements suivants.
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

  // Avertit une seule fois si l'accès accordé n'est pas "full" - appelé depuis onOptions dans init(). Purement informatif : la souscription 'normal'
  // (cf. init()) reste enregistrée dans tous les cas, elle échoue juste silencieusement à chaque événement tant que l'accès n'est pas complet (le
  // repli 'shown', enregistré en même temps, continue lui de fonctionner et de livrer des données - cf. commentaire détaillé dans init()).
  function warnIfLimitedAccess(accessLevel) {
    if (accessLevel === 'full' || _limitedAccessWarned) return;
    _limitedAccessWarned = true;
    console.warn('[GristAPI] accès accordé au widget = "' + accessLevel + '" (pas "full") : includeColumns:\'normal\' pour onRecord échoue - '
      + 'les règles macro-modèle testant une colonne non cochée dans le panneau de droite de CE widget échoueront silencieusement '
      + '(record[col] absent) tant qu\'un accès complet n\'est pas accordé.');
  }

  async function init() {
    console.log('[GristAPI] init: appel de grist.ready({requiredAccess: "full"}).');
    try {
      // Ne pas ajouter columns:[...] sans revalider en Grist réel : ça a déjà cassé toute la résolution #Variable (change mappings.tableId, dont dépend la
      // détection de table courante).
      grist.ready({ requiredAccess: 'full' });
      console.log('[GristAPI] grist.ready({requiredAccess: "full"}) appelé avec succès.');
    } catch (e) {
      console.error('[GristAPI] ERREUR lors de grist.ready():', e);
      throw e;
    }

    // Enregistrer onRecord AVANT tout await pour ne pas rater l'événement initial.
    if (_recordSubscriptionRegistered) {
      console.log('[GristAPI] grist.onRecord déjà enregistré, souscription réutilisée.');
    } else try {
      // includeColumns:'normal' (au lieu du défaut 'shown') : sans ça, seules les colonnes cochées visibles dans le panneau de droite DE CE WIDGET
      // arrivent dans `record` (GristAPI.ts, FetchSelectedOptions.includeColumns, vérifié à la source jsDelivr le 2026-09-28) - toute colonne créée
      // depuis une autre vue, ou simplement pas affichée ici, est absente de `record` (record[col] === undefined), jamais juste vide. Une règle
      // macro-modèle qui teste cette colonne échoue alors silencieusement en "=" (undefined ne matche jamais) et bascule sur le cas par défaut -
      // symptôme d'Antoine du 2026-09-28. 'normal' exige un accès complet, déjà demandé ci-dessus (requiredAccess:'full') mais pas forcément accordé.
      //
      // Deux souscriptions onRecord INDÉPENDANTES sont enregistrées ici, ensemble, avant tout await (Grist n'a pas d'"offRecord" - un abonnement
      // ajouté plus tard ne reçoit jamais les messages déjà distribués, vérifié à la source jsDelivr le 2026-09-28) :
      //  - 'normal' (enrichie) : la source de vérité une fois qu'elle a livré au moins un record (_normalDataDelivered). Si l'accès n'est pas
      //    "full", chaque tentative échoue silencieusement côté Grist (rejet RPC jamais rattrapé par le widget, cf. warnIfLimitedAccess ci-dessous
      //    pour le diagnostic) et _normalDataDelivered reste faux indéfiniment - sans conséquence, le repli ci-dessous continue de fonctionner.
      //  - 'shown' (repli) : ignorée UNIQUEMENT une fois que 'normal' a réellement livré au moins un record. Tant que ce n'est pas le cas (accès
      //    encore incertain, ou pas "full"), ses données sont toujours appliquées via handleIncomingRecord - jamais perdues.
      // Une première version bascule pas à pas (repli 'shown' seul au démarrage, souscription 'normal' ajoutée seulement APRÈS confirmation de
      // l'accès complet par onOptions) a été essayée puis RETIRÉE en urgence : au démarrage, la ligne courante et les options arrivent quasi
      // simultanément (WidgetFrame.ts, TableNotifier puis ConfigNotifier au ready), si bien que la confirmation par onOptions arrivait AVANT la
      // réponse RPC du repli 'shown' - mesuré par le coordinateur avec le vrai grist-plugin-api.js et grain-rpc (ready 101ms, ligne 105ms,
      // options 106ms, réponse 'shown' 113ms). La souscription 'normal', ajoutée après coup à la confirmation, n'avait de toute façon jamais reçu
      // ce premier message (pas de rejeu d'événements passés côté RPC, cf. ci-dessus) : aucun rappel n'était jamais appelé pour la ligne initiale,
      // `getCurrentRecord()` restait `null` jusqu'au changement de ligne suivant - régression PIRE que le bug d'origine (accès complet = cas normal
      // d'Antoine). Enregistrer les deux souscriptions ensemble dès le départ élimine ce délai : il n'y a plus de "bascule" à faire au bon moment.
      grist.onRecord(function (record, mappings) {
        if (_normalDataDelivered) return;
        handleIncomingRecord(record, mappings);
      }, { includeColumns: 'shown' });
      grist.onRecord(function (record, mappings) {
        _normalDataDelivered = true;
        handleIncomingRecord(record, mappings);
      }, { includeColumns: 'normal' });
      _recordSubscriptionRegistered = true;
      console.log('[GristAPI] grist.onRecord enregistré (repli \'shown\' + souscription enrichie \'normal\').');
    } catch (e) {
      console.error('[GristAPI] ERREUR lors de grist.onRecord():', e);
    }

    try {
      grist.onOptions(function (options, settings) {
        _currentOptions = options || null;
        console.log('[GristAPI] onOptions reçu: optionsJSON=', safeJSONStringify(options), 'settings=', settings);
        warnIfLimitedAccess(settings && settings.accessLevel);
        for (const cb of _optionsCallbacks) {
          try { cb(_currentOptions); } catch (e) { console.error('[GristAPI] erreur callback onOptions:', e); }
        }
      });
      console.log('[GristAPI] grist.onOptions enregistré.');
    } catch (e) {
      console.warn('[GristAPI] onOptions non disponible:', e);
    }

    // Les options du widget, le schéma du document et les règles de liaison se lisent ENSEMBLE : en série, ces appels faisaient attendre cinq aller-retour de plus l'affichage du
    // premier modèle (mesure d'ouverture du 2026-10-02). Aucun ne dépend d'un autre, et chacun attrape ses propres erreurs.
    //
    // Seed immédiat des options JSON propres au widget (jamais accessLevel : grist.getOptions() = WidgetAPI.getOptions(), qui renvoie les options
    // personnalisées DU WIDGET lui-même (activeCustomOptions côté grist-core), pas InteractionOptions - seul onOptions(cb) ci-dessus reçoit
    // {accessLevel, linking} en 2e argument, vérifié à la source le 2026-09-28).
    const seedOptionsLoaded = (async function () {
      try {
        if (typeof grist.getOptions === 'function') {
          const seedOptions = await grist.getOptions();
          _currentOptions = seedOptions || _currentOptions;
          console.log('[GristAPI] getOptions (seed) optionsJSON=', safeJSONStringify(seedOptions));
        }
      } catch (e) {
        console.warn('[GristAPI] getOptions indisponible:', e);
      }
    })();
    // Schéma RAPIDE : noms des tables, types et colonnes tirées des métadonnées (cf. runSchemaPass). La lecture complète de chaque table, qui rend les colonnes exactes, ne bloque plus
    // l'ouverture : Editor.setHTML la demande dès le premier modèle affiché (et js/main.js la rappelle quelques secondes après l'ouverture si rien ne l'a fait).
    const schemaLoaded = (async function () {
      try {
        await (_schemaPass ? refreshSchema() : startSchemaPass(true));
      } catch (e) {
        console.error('[GristAPI] refreshSchema a échoué:', e);
      }
    })();
    const linkRulesLoaded = (async function () {
      try {
        await loadLinkRules();
      } catch (e) {
        console.error('[GristAPI] loadLinkRules a échoué:', e);
      }
    })();
    await Promise.all([seedOptionsLoaded, schemaLoaded, linkRulesLoaded]);
    console.log('[GristAPI] init terminé.');
  }

  // Récupération robuste du tableId : mappings -> grist.getTable() -> schéma -> vues
  async function detectTableId(mappings, source) {
    source = source || 'unknown';
    console.log('[GristAPI] detectTableId(' + source + '): début.');

    // 1. Via mappings.tableId (présent en accès full)
    if (mappings && typeof mappings.tableId !== 'undefined') {
      const id = String(mappings.tableId || '').trim();
      if (id) {
        console.log('[GristAPI] detectTableId(' + source + '): via mappings.tableId =', id);
        return id;
      }
    }

    // 2. Via grist.getTable().getTableId()
    try {
      if (typeof grist.getTable === 'function') {
        const t = await grist.getTable();
        if (t) {
          if (typeof t.getTableId === 'function') {
            const id = await t.getTableId();
            if (id) {
              console.log('[GristAPI] detectTableId(' + source + '): via grist.getTable().getTableId() =', id);
              return id;
            }
          }
          if (t.tableId) {
            console.log('[GristAPI] detectTableId(' + source + '): via grist.getTable().tableId =', t.tableId);
            return String(t.tableId);
          }
          // last-resort : propriétés de l'objet
          for (const k of ['id', 'tableRef', 'name']) {
            if (t[k]) {
              console.log('[GristAPI] detectTableId(' + source + '): via grist.getTable().' + k + ' =', t[k]);
              return String(t[k]);
            }
          }
        }
      }
    } catch (e) {
      console.warn('[GristAPI] detectTableId(' + source + '): échec grist.getTable —', e);
    }

    // 3. Fallback via schéma Grist : record keys vs colonnes candidates
    if (_currentRecord) {
      try {
        const recordKeys = Object.keys(_currentRecord);
        for (const tableId of _tables) {
          const cols = _columnsByTable[tableId] || [];
          // une colonne est matchée si elle existe dans le record ET dans la table
          const matched = cols.filter(c => recordKeys.indexOf(c) !== -1);
          if (matched.length >= 1) {
            console.log('[GristAPI] detectTableId(' + source + '): via fallback schéma table=', tableId, 'colonnes matchées=', matched);
            return tableId;
          }
        }
      } catch (e) {
        console.warn('[GristAPI] detectTableId(' + source + '): fallback schéma a échoué —', e);
      }
    }

    console.warn('[GristAPI] detectTableId(' + source + '): aucune source de tableId disponible.');
    return null;
  }

  // Une passe de schéma à la fois (jamais deux lectures complètes de toutes les tables en même temps) : un appel qui arrive pendant une passe attend la suivante, qui part dès
  // la fin de celle-ci et sert tous ceux qui l'ont demandée entre-temps - la passe en cours a pu lire avant le changement que l'appelant vient de faire (une colonne ajoutée,
  // renommée), elle ne le dispense pas d'une relecture. `maxAgeMs` (facultatif) : se contente d'une passe commencée il y a moins que ça, en cours ou terminée - Editor.setHTML
  // le demande, le schéma qu'init() vient de lire n'a aucune raison d'être relu à l'instant où s'affiche le premier modèle.
  let _schemaPass = null;       // { startedAt, promise } de la passe en cours
  let _schemaNext = null;       // promesse de la passe qui suivra
  let _schemaLastStart = 0;     // début de la dernière passe terminée
  function startSchemaPass(fast) {
    const pass = { startedAt: Date.now(), fast: !!fast };
    _schemaPass = pass;
    // Une passe rapide (init) ne compte pas comme « lue il y a moins de maxAgeMs » : ses listes de colonnes sont provisoires, la passe complète qui la suit les rend exactes.
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

  // `fast` (init) : les listes de colonnes viennent des métadonnées (provisionalColumnsByTable), quelques Ko lus avec listTables, au lieu de la lecture complète de chaque table - qui, sur un
  // gros document, faisait attendre plusieurs secondes l'affichage du premier modèle (mesure d'ouverture du 2026-10-02). La passe complète qui suit les rend exactes.
  async function runSchemaPass(fast) {
    // Les métadonnées des colonnes partent en même temps que listTables (un aller-retour de moins) ; leur échec éventuel est traité par refreshColumnTypes.
    const metaRead = readColumnMeta();
    metaRead.catch(() => {});
    try {
      await loadRawTables();
      _tables = _rawTables.filter(t => INTERNAL_TABLES.indexOf(t) === -1);
      console.log('[GristAPI] refreshSchema: tables détectées =', _tables);
      _columnsByTable = await (fast ? provisionalColumnsByTable(metaRead) : exactColumnsByTable());
    } catch (e) {
      console.error('[GristAPI] refreshSchema: erreur globale —', e);
    }
    await refreshColumnTypes(metaRead);
  }

  // Colonnes exactes : les clés que Grist rend à fetchTable pour chaque table (lecture complète de toutes les tables).
  async function exactColumnsByTable() {
    // fetchTable en parallèle (latence = le plus lent, pas la somme) ; écrit dans un objet temporaire, remplacé d'un coup par l'appelant pour éviter un schéma
    // vidé-mais-pas-repeuplé pendant les allers-retours réseau.
    const nextColumnsByTable = {};
    await Promise.all(_tables.map(async t => {
      try {
        const data = await readTable(t);
        const cols = Object.keys(data || {}).filter(k => k !== 'id' && k !== 'manualSort');
        nextColumnsByTable[t] = cols;
      } catch (e) {
        console.warn('[GristAPI] refreshSchema: échec fetchTable(' + t + ') —', e);
        nextColumnsByTable[t] = [];
      }
    }));
    return nextColumnsByTable;
  }

  // Colonnes PROVISOIRES : celles que les métadonnées (_grist_Tables_column) rangent sous chaque table, dans l'ordre de leur position (parentPos, celui du code que Grist génère pour la
  // table). Les mêmes que les clés de fetchTable, à l'ordre et aux colonnes qu'un accès restreint cache près - ce que la passe complète corrige.
  async function provisionalColumnsByTable(metaRead) {
    const [tablesMeta, colsMeta] = await metaRead;
    const tableIdByRowId = {};
    for (let i = 0; i < tablesMeta.id.length; i++) tableIdByRowId[tablesMeta.id[i]] = tablesMeta.tableId[i];
    const found = {};
    for (let i = 0; i < colsMeta.id.length; i++) {
      const tableId = tableIdByRowId[colsMeta.parentId[i]];
      const colId = colsMeta.colId[i];
      if (!tableId || colId === 'manualSort') continue;
      const pos = colsMeta.parentPos && colsMeta.parentPos[i] != null ? colsMeta.parentPos[i] : i;
      (found[tableId] = found[tableId] || []).push({ colId, pos });
    }
    const next = {};
    _tables.forEach(t => { next[t] = (found[t] || []).sort((a, b) => a.pos - b.pos).map(c => c.colId); });
    return next;
  }

  // Types de la « colonne à afficher » d'une Référence dont les valeurs se proposent dans un champ Valeur (getReferenceValues). « Any » : une colonne à
  // formule dont Grist n'a pas encore fixé le type ; ses valeurs qui ne sont ni du texte ni un nombre sont écartées à la lecture.
  const REFERENCE_SHOWN_TYPES = ['Text', 'Choice', 'Int', 'Numeric', 'Any'];

  // Type Grist de chaque colonne (ex. "Ref:Employes", "Text"...) - signale dans la modale de liaison qu'une colonne est une Référence, pour que l'utilisateur
  // la compare à l'Identifiant de ligne, pas à une colonne texte.
  // Les deux tables de métadonnées, demandées ENSEMBLE (un aller-retour au lieu de deux) ; refreshSchema les lance en même temps que listTables et les passe à refreshColumnTypes.
  function readColumnMeta() {
    return Promise.all([readTable('_grist_Tables'), readTable('_grist_Tables_column')]);
  }
  // Écrit dans des objets temporaires, remplacés d'un coup à la fin (comme refreshSchema pour les colonnes) : pendant les allers-retours, un autre rendu qui lit un type
  // (getColumnType) ne tombe plus sur un schéma vidé. `metaRead` : la lecture des métadonnées déjà lancée par refreshSchema, sinon elle est faite ici.
  async function refreshColumnTypes(metaRead) {
    const types = {};
    const choices = {};
    const displayCols = {};
    const referenceCols = {};
    try {
      const [tablesMeta, colsMeta] = await (metaRead || readColumnMeta());
      const tableIdByRowId = {};
      for (let i = 0; i < tablesMeta.id.length; i++) tableIdByRowId[tablesMeta.id[i]] = tablesMeta.tableId[i];
      const colIdByRowId = {};
      const colIndexByRowId = {};
      for (let i = 0; i < colsMeta.id.length; i++) { colIdByRowId[colsMeta.id[i]] = colsMeta.colId[i]; colIndexByRowId[colsMeta.id[i]] = i; }
      for (let i = 0; i < colsMeta.id.length; i++) {
        const tableId = tableIdByRowId[colsMeta.parentId[i]];
        if (!tableId) continue;
        if (!types[tableId]) types[tableId] = {};
        types[tableId][colsMeta.colId[i]] = colsMeta.type[i];
        // displayCol (schema.ts : Ref:_grist_Tables_column) : la colonne dont Grist affiche la valeur, la colonne elle-même si 0 (ColumnRec.displayColModel,
        // vérifié à la source grist-core le 2026-09-28).
        const displayRef = colsMeta.displayCol ? colsMeta.displayCol[i] : 0;
        if (displayRef && displayRef !== colsMeta.id[i] && colIdByRowId[displayRef]) {
          if (!displayCols[tableId]) displayCols[tableId] = {};
          displayCols[tableId][colsMeta.colId[i]] = colIdByRowId[displayRef];
        }
        // visibleCol (schema.ts : Ref:_grist_Tables_column, 0 = aucune, la Référence montre alors l'id de la ligne) : la colonne de la TABLE LIÉE dont la valeur
        // s'affiche (vérifié à la source grist-core le 2026-09-29). Retenue seulement si elle porte du texte ou un nombre, seules valeurs qu'une règle peut
        // proposer : une date ou un booléen s'afficheraient sous une autre forme que la valeur brute lue dans la table liée.
        const refType = String(colsMeta.type[i] || '');
        const refColon = refType.indexOf(':');
        if (refColon !== -1 && (refType.slice(0, refColon) === 'Ref' || refType.slice(0, refColon) === 'RefList') && refType.length > refColon + 1) {
          const shown = colIndexByRowId[colsMeta.visibleCol ? colsMeta.visibleCol[i] : 0];
          if (shown !== undefined && REFERENCE_SHOWN_TYPES.indexOf(colsMeta.type[shown]) !== -1) {
            if (!referenceCols[tableId]) referenceCols[tableId] = {};
            referenceCols[tableId][colsMeta.colId[i]] = { table: refType.slice(refColon + 1), column: colsMeta.colId[shown] };
          }
        }
        // Choix d'une colonne Choice/ChoiceList : widgetOptions est un JSON stocké en Text (schema.ts), clé "choices" (vérifié à la source grist-core,
        // ChoiceTextBox.ts: this.options.prop("choices")) - un tableau de chaînes. widgetOptions absent/mal formé ne doit jamais faire planter tout
        // refreshSchema, juste laisser cette colonne sans choix connus (repli sur le champ texte libre, cf. js/macro-editor.js:buildValueField).
        if (!choices[tableId]) choices[tableId] = {};
        try {
          const raw = colsMeta.widgetOptions && colsMeta.widgetOptions[i];
          const opts = raw ? JSON.parse(raw) : null;
          if (opts && Array.isArray(opts.choices)) choices[tableId][colsMeta.colId[i]] = opts.choices;
        } catch (e) { /* widgetOptions mal formé pour cette colonne : pas de choix connus, tant pis */ }
      }
      _columnTypesByTable = types;
      _columnChoicesByTable = choices;
      _displayColByTable = displayCols;
      _referenceColumnByTable = referenceCols;
    } catch (e) {
      console.warn('[GristAPI] refreshColumnTypes: échec', e);
    }
  }

  // Type d'une colonne. Un chemin « Ref.Colonne » (bulle qui descend de référence en référence, cf. resolveColumnPath) a le type de sa dernière colonne :
  // c'est lui qui décide du format date/nombre et des images d'une variable.
  function getColumnType(tableId, colId) {
    if (typeof colId === 'string' && colId.indexOf('.') !== -1) {
      const end = resolveColumnPath(tableId, colId);
      return end ? end.type : null;
    }
    return (_columnTypesByTable[tableId] && _columnTypesByTable[tableId][colId]) || null;
  }
  // Table où mène une suite de colonnes Référence simples à partir de `tableId` (la table elle-même si la suite est vide), null si un maillon manque ou n'est
  // pas une Référence (une liste de références désigne plusieurs lignes : on ne descend pas dedans).
  function tableAtEndOf(tableId, hops) {
    let table = tableId;
    for (let i = 0; i < hops.length; i++) {
      const type = (_columnTypesByTable[table] && _columnTypesByTable[table][hops[i]]) || '';
      if (type.indexOf('Ref:') !== 0 || !type.slice(4)) return null;
      table = type.slice(4);
    }
    return table;
  }
  // Une bulle #Variable peut descendre de référence en référence, comme $Projet.Accompagnateur.Email dans une formule Grist : sa colonne est alors un chemin
  // « Accompagnateur.Email » (colonnes Référence puis colonne finale) à partir de sa table. Les identifiants de colonne de Grist ne contiennent jamais de
  // point, il sépare donc sans ambiguïté. Retourne { table, column, type } pour la colonne où le chemin aboutit, null si un maillon manque ou n'est pas une
  // Référence. Une colonne ordinaire (sans point) est un chemin d'un seul maillon.
  function resolveColumnPath(tableId, path) {
    const hops = String(path == null ? '' : path).split('.');
    const column = hops.pop();
    const table = tableAtEndOf(tableId, hops);
    const type = table && _columnTypesByTable[table] && _columnTypesByTable[table][column];
    return type ? { table, column, type } : null;
  }

  // Colonne qui porte la valeur AFFICHÉE d'une Référence/liste de références (ex. "gristHelper_Display2", présente dans les lignes de fetchTable), null
  // si la colonne s'affiche elle-même (identifiant de ligne) ou n'est pas une Référence.
  function getDisplayColumn(tableId, colId) {
    return (_displayColByTable[tableId] && _displayColByTable[tableId][colId]) || null;
  }
  // Colonne de la table liée que montre une colonne Référence / liste de références ({ table, column }), null si la colonne n'en est pas une, si elle
  // montre l'id de la ligne, ou si la colonne montrée n'est ni du texte ni un nombre - pas de valeurs à lui proposer (js/condition-fields.js:buildValueField).
  function getReferenceColumn(tableId, colId) {
    return (_referenceColumnByTable[tableId] && _referenceColumnByTable[tableId][colId]) || null;
  }
  // Lectures de table en cours, par colonne lue : les règles d'une même fenêtre qui portent sur la même Référence partagent UNE lecture (sans mémoire
  // ensuite : une ligne ajoutée dans Grist entre deux ouvertures apparaît à la suivante).
  const _referenceValuesPending = {};
  // Valeurs qu'une colonne Référence / liste de références peut afficher, telles que le compare une règle : celles de la colonne montrée (getReferenceColumn)
  // sur toutes les lignes de la table liée, texte ou nombre écrits en texte, sans espaces autour (compareValues les rogne), sans doublon, dans l'ordre alphabétique
  // (chiffres compris). [] si la colonne n'a rien à proposer ; rejette si la table liée est illisible.
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
    console.log('[GristAPI] onRecord: abonné ajouté. total=', _onRecordCallbacks.length);
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
  // grist.setOption ne pose qu'un BROUILLON des options de la section (ViewSectionRec.activeCustomOptions, vérifié à la source grist-core) : Grist
  // affiche alors un bouton Enregistrer en haut du widget, seul moyen de le rendre durable et visible des autres personnes. Recopié localement tout de
  // suite, sans attendre le retour d'onOptions.
  async function setWidgetOption(key, value) {
    _currentOptions = Object.assign({}, _currentOptions, { [key]: value });
    await grist.setOption(key, value);
  }

  function safeJSONStringify(value) {
    try { return JSON.stringify(value); }
    catch (e) { return '[unserializable: ' + e.message + ']'; }
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
      if (colsMeta && colsMeta.parentId) {
        for (let i = 0; i < colsMeta.parentId.length; i++) {
          if (colsMeta.parentId[i] === fromRowId && colsMeta.type && String(colsMeta.type[i]).indexOf('Ref:') === 0) {
            const parentId = colsMeta.type[i].slice(4);
            if (parentId === toTableId) refCols.push(colsMeta.colId[i]);
          }
        }
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

  // Toutes les lignes d'une table sous forme de tableau d'objets {colonne: valeur} (au lieu du format colonnaire de fetchTable) - utilisé par la résolution
  // "match"/"singleton" des règles de liaison, qui compare plusieurs lignes à la fois, contrairement à fetchRowById.
  async function fetchTableRows(tableId) {
    // Pendant un rendu, les lignes sont construites une fois par table (readTable partage déjà la lecture) : les appelants ne font que chercher, filtrer ou trier une
    // copie (tableOrder), jamais modifier une ligne.
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

  // Table de bookkeeping stockant, pour chaque table cible référencée via # depuis une autre table, comment en trouver la bonne ligne : "singleton" (une
  // seule ligne pertinente) ou "match" (comparer ColonneCible à ColonneSource, "id" désignant l'identifiant de ligne Grist). Créée à la volée au 1er besoin.
  async function ensureLinksTableExists() {
    const tables = await listAllTablesCached();
    if (tables.includes(LINKS_TABLE_NAME)) return;
    try {
      await grist.docApi.applyUserActions([
        ['AddTable', LINKS_TABLE_NAME, [
          { id: 'TableCible', type: 'Text' },
          { id: 'Mode', type: 'Text' },
          { id: 'ColonneCible', type: 'Text' },
          { id: 'ColonneSource', type: 'Text' }
        ]]
      ]);
      _rawTables.push(LINKS_TABLE_NAME);
      if (typeof PageTree !== 'undefined') PageTree.afterTableCreated(LINKS_TABLE_NAME);
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

  // Upsert (une seule règle par table cible) - écrase la précédente si l'utilisateur reconfigure une table déjà liée (depuis le panneau de gestion, ou en
  // réinsérant la variable après une modification de schéma).
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

  // Sur certaines instances Grist auto-hébergées (APP_HOME_URL mal configuré), getAccessToken() renvoie un baseUrl avec un host interne injoignable (ex.
  // 0.0.0.0). Corrigé en réutilisant l'origine de document.referrer (la page Grist qui embarque ce widget en iframe).
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

  // Jeton d'accès court terme (quelques minutes) réutilisé pour les appels REST d'upload/téléchargement de pièces jointes, avec marge de sécurité avant
  // expiration.
  async function getAccessTokenCached() {
    const now = Date.now();
    if (_tokenCache && _tokenCache.expiresAt - now > 15000) return _tokenCache;
    const info = await grist.docApi.getAccessToken({ readOnly: false });
    const baseUrl = fixBaseUrl(info.baseUrl);
    if (baseUrl !== info.baseUrl) console.warn('[GristAPI] baseUrl corrigé:', info.baseUrl, '->', baseUrl);
    _tokenCache = { token: info.token, baseUrl, expiresAt: now + (info.ttlMsecs || 120000) };
    return _tokenCache;
  }

  async function getAttachmentDownloadUrl(attachmentId) {
    if (!attachmentId) return '';
    const info = await getAccessTokenCached();
    return `${info.baseUrl}/attachments/${attachmentId}/download?auth=${info.token}`;
  }

  // Email et nom de la personne (chips #Variable) : le jeton de getAccessTokenCached() renvoie toujours "anon@getgrist.com" (identité scopée au document, pas la session
  // navigateur). Contournement : une formule DÉCLENCHÉE sur `user.Email`, dans une table interne dédiée, attribue la vraie valeur (ligne ajoutée puis retirée). `user.Name`
  // se lit de la même ligne, dans une seconde colonne ajoutée à la première demande de nom (vérifié à la source grist-core le 2026-10-04 : sandbox/grist/user.py, `Name`
  // comme `Email` ; GranularAccess.ts:getUser, le nom du profil Grist - à défaut la partie de l'adresse avant le @ - ou null pour un compte sans nom).
  async function ensureUserProbeTable() {
    const tables = await listAllTablesCached();
    if (tables.includes(USER_PROBE_TABLE_NAME)) return;
    await grist.docApi.applyUserActions([
      ['AddTable', USER_PROBE_TABLE_NAME, [
        // recalcWhen:0 = RecalcWhen.DEFAULT (nouvelles lignes ou changement de recalcDeps) ; recalcDeps:null car seule la création de ligne doit déclencher
        // le calcul.
        { id: 'Email', type: 'Text', isFormula: false, formula: 'user.Email', recalcWhen: 0, recalcDeps: null },
      ]],
    ]);
    _rawTables.push(USER_PROBE_TABLE_NAME);
    if (typeof PageTree !== 'undefined') PageTree.afterTableCreated(USER_PROBE_TABLE_NAME);
  }
  // Une lecture de la sonde : la ligne que les formules déclenchées viennent de remplir (Email, et Name si sa colonne existe). Les demandes qui se chevauchent n'en font
  // qu'une - plusieurs chips d'un même rendu, Email et Nom ensemble : deux cycles en parallèle sur un document sans table-sonde auraient créé la table deux fois.
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
      // Nettoyage best-effort - une ligne orpheline ici n'est pas grave (la table reste de toute façon interne/invisible), mais mieux vaut ne rien laisser
      // trainer à chaque appel.
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

  // Nom de la personne : null tant qu'il n'est pas lu, '' quand Grist n'en donne aucun (une réponse comme une autre, gardée pour la session). Une lecture qui échoue n'est pas gardée.
  let _userNameCache = null;
  let _userNameRead = null;
  // Le nom que porte une ligne de la sonde : null si elle n'a pas la colonne `Name` (table-sonde d'avant la chip Nom), sinon le texte sans espaces autour - '' pour un compte sans
  // nom ou une formule en erreur (une valeur qui n'est pas du texte).
  function userNameOf(row) {
    if (!row || !('Name' in row)) return null;
    return typeof row.Name === 'string' ? row.Name.trim() : '';
  }
  // Une ligne lue donne les deux : l'email et, si la ligne a sa colonne, le nom sont gardés pour la session - la chip qui demande l'autre ensuite n'a rien à relire.
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
      // Table-sonde d'avant la chip Nom : sa colonne s'ajoute une fois pour toutes (la ligne qu'on vient de lire ne l'avait pas, donc aucun id pris : AddColumn renommerait sinon),
      // puis une ligne neuve la remplit. Lue hors du partage de probeUserRow : une lecture déjà partie a pu être écrite avant la colonne.
      await grist.docApi.applyUserActions([['AddColumn', USER_PROBE_TABLE_NAME, 'Name', { type: 'Text', isFormula: false, formula: 'user.Name', recalcWhen: 0, recalcDeps: null }]]);
      row = await readUserProbeRow();
    }
    const name = userNameOf(row);
    if (name === null) throw new Error('la colonne Name de ' + USER_PROBE_TABLE_NAME + ' reste absente après son ajout');
    rememberUserRow(row);
    return name;
  }

  // Rafraîchit le src des images de pièces jointes dans un DOM donné : le jeton d'accès expire après quelques minutes, donc le src ne doit jamais être
  // conservé tel quel dans le HTML enregistré — seul data-attachment-id est persistant.
  async function hydrateAttachmentImages(root) {
    if (!root || !root.querySelectorAll) return;
    const images = Array.from(root.querySelectorAll('img.editor-image[data-source="attachment"][data-attachment-id]'));
    await Promise.all(images.map(async img => {
      const id = img.dataset.attachmentId;
      if (!id) return;
      try { img.src = await getAttachmentDownloadUrl(id); }
      catch (e) { console.warn('[GristAPI] hydrateAttachmentImages: échec pour', id, e); }
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

  return { init, refreshSchema, refreshColumnTypes, withReadPass, getTables, getColumns, getColumnType, getColumnChoices, getAllVariables, onRecord, getCurrentRecord, getCurrentTableId, getWidgetOptions, onWidgetOptionsChange, setWidgetOption, detectTableId, findReferenceColumns, fetchRowById, fetchTableRows, detectCurrentContext, getAttachmentDownloadUrl, getCurrentUserEmail, getCurrentUserName, hydrateAttachmentImages, getLinkRule, getAllLinkRules, saveLinkRule, deleteLinkRule, getDisplayColumn, getReferenceColumn, getReferenceValues, isRawRow, resolveColumnPath, tableAtEndOf };
})();
