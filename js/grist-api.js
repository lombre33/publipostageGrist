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
  const INTERNAL_TABLES = ['Publipostage_Modeles', 'Publipostage_LiensTables', 'Publipostage_UserProbe', 'Publipostage_PreferencesModeles', 'Publipostage_Commentaires'];
  const LINKS_TABLE_NAME = 'Publipostage_LiensTables';
  // Table interne pour getCurrentUserEmail() (chip "Email de l'utilisateur") - une colonne à formule déclenchée (capture qui a réellement déclenché le
  // calcul, `user.Email`), vidée après chaque lecture.
  const USER_PROBE_TABLE_NAME = 'Publipostage_UserProbe';
  let _tables = [];
  let _columnsByTable = {};
  let _columnTypesByTable = {};
  let _columnChoicesByTable = {};
  // { tableId: { colId: colonne d'affichage } } - pour une Référence, la colonne d'aide (« gristHelper_Display… ») que Grist calcule dans la même table
  // avec la valeur affichée, cf. getDisplayColumn.
  let _displayColByTable = {};
  // Lignes lues par fetchTable (fetchTableRows/fetchRowById) : forme BRUTE (une Référence = id de ligne), contrairement à la ligne livrée par
  // grist.onRecord (valeur affichée) - cf. isRawRow.
  const _rawRows = new WeakSet();
  // Liste BRUTE (tables internes incluses) de listTables(), mémorisée pour éviter de la redemander à chaque ensureXxxTableExists() - `_tables` ci-dessus
  // les exclut déjà, inutilisable ici. Tenue à jour manuellement après un AddTable réussi (cf. listAllTablesCached/ensureLinksTableExists/
  // ensureUserProbeTable) pour ne jamais répondre "table absente" pour une table qu'on vient nous-mêmes de créer dans la même session.
  let _rawTables = null;
  async function listAllTablesCached() {
    if (!_rawTables) _rawTables = (await grist.docApi.listTables()) || [];
    return _rawTables;
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

    // Seed immédiat des options JSON propres au widget (jamais accessLevel : grist.getOptions() = WidgetAPI.getOptions(), qui renvoie les options
    // personnalisées DU WIDGET lui-même (activeCustomOptions côté grist-core), pas InteractionOptions - seul onOptions(cb) ci-dessus reçoit
    // {accessLevel, linking} en 2e argument, vérifié à la source le 2026-09-28).
    try {
      if (typeof grist.getOptions === 'function') {
        const seedOptions = await grist.getOptions();
        _currentOptions = seedOptions || _currentOptions;
        console.log('[GristAPI] getOptions (seed) optionsJSON=', safeJSONStringify(seedOptions));
      }
    } catch (e) {
      console.warn('[GristAPI] getOptions indisponible:', e);
    }

    try {
      await refreshSchema();
    } catch (e) {
      console.error('[GristAPI] refreshSchema a échoué:', e);
    }
    try {
      await loadLinkRules();
    } catch (e) {
      console.error('[GristAPI] loadLinkRules a échoué:', e);
    }
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

  async function refreshSchema() {
    try {
      _rawTables = (await grist.docApi.listTables()) || [];
      _tables = _rawTables.filter(t => INTERNAL_TABLES.indexOf(t) === -1);
      console.log('[GristAPI] refreshSchema: tables détectées =', _tables);
      // fetchTable en parallèle (latence = le plus lent, pas la somme) ; écrit dans un objet temporaire, remplacé d'un coup pour éviter un schéma
      // vidé-mais-pas-repeuplé pendant les allers-retours réseau.
      const nextColumnsByTable = {};
      await Promise.all(_tables.map(async t => {
        try {
          const data = await grist.docApi.fetchTable(t);
          const cols = Object.keys(data || {}).filter(k => k !== 'id' && k !== 'manualSort');
          nextColumnsByTable[t] = cols;
        } catch (e) {
          console.warn('[GristAPI] refreshSchema: échec fetchTable(' + t + ') —', e);
          nextColumnsByTable[t] = [];
        }
      }));
      _columnsByTable = nextColumnsByTable;
    } catch (e) {
      console.error('[GristAPI] refreshSchema: erreur globale —', e);
    }
    await refreshColumnTypes();
  }

  // Type Grist de chaque colonne (ex. "Ref:Employes", "Text"...) - signale dans la modale de liaison qu'une colonne est une Référence, pour que l'utilisateur
  // la compare à l'Identifiant de ligne, pas à une colonne texte.
  async function refreshColumnTypes() {
    _columnTypesByTable = {};
    _columnChoicesByTable = {};
    _displayColByTable = {};
    try {
      const tablesMeta = await grist.docApi.fetchTable('_grist_Tables');
      const tableIdByRowId = {};
      for (let i = 0; i < tablesMeta.id.length; i++) tableIdByRowId[tablesMeta.id[i]] = tablesMeta.tableId[i];
      const colsMeta = await grist.docApi.fetchTable('_grist_Tables_column');
      const colIdByRowId = {};
      for (let i = 0; i < colsMeta.id.length; i++) colIdByRowId[colsMeta.id[i]] = colsMeta.colId[i];
      for (let i = 0; i < colsMeta.id.length; i++) {
        const tableId = tableIdByRowId[colsMeta.parentId[i]];
        if (!tableId) continue;
        if (!_columnTypesByTable[tableId]) _columnTypesByTable[tableId] = {};
        _columnTypesByTable[tableId][colsMeta.colId[i]] = colsMeta.type[i];
        // displayCol (schema.ts : Ref:_grist_Tables_column) : la colonne dont Grist affiche la valeur, la colonne elle-même si 0 (ColumnRec.displayColModel,
        // vérifié à la source grist-core le 2026-09-28).
        const displayRef = colsMeta.displayCol ? colsMeta.displayCol[i] : 0;
        if (displayRef && displayRef !== colsMeta.id[i] && colIdByRowId[displayRef]) {
          if (!_displayColByTable[tableId]) _displayColByTable[tableId] = {};
          _displayColByTable[tableId][colsMeta.colId[i]] = colIdByRowId[displayRef];
        }
        // Choix d'une colonne Choice/ChoiceList : widgetOptions est un JSON stocké en Text (schema.ts), clé "choices" (vérifié à la source grist-core,
        // ChoiceTextBox.ts: this.options.prop("choices")) - un tableau de chaînes. widgetOptions absent/mal formé ne doit jamais faire planter tout
        // refreshSchema, juste laisser cette colonne sans choix connus (repli sur le champ texte libre, cf. js/macro-editor.js:buildValueField).
        if (!_columnChoicesByTable[tableId]) _columnChoicesByTable[tableId] = {};
        try {
          const raw = colsMeta.widgetOptions && colsMeta.widgetOptions[i];
          const opts = raw ? JSON.parse(raw) : null;
          if (opts && Array.isArray(opts.choices)) _columnChoicesByTable[tableId][colsMeta.colId[i]] = opts.choices;
        } catch (e) { /* widgetOptions mal formé pour cette colonne : pas de choix connus, tant pis */ }
      }
    } catch (e) {
      console.warn('[GristAPI] refreshColumnTypes: échec', e);
    }
  }

  function getColumnType(tableId, colId) {
    return (_columnTypesByTable[tableId] && _columnTypesByTable[tableId][colId]) || null;
  }

  // Colonne qui porte la valeur AFFICHÉE d'une Référence/liste de références (ex. "gristHelper_Display2", présente dans les lignes de fetchTable), null
  // si la colonne s'affiche elle-même (identifiant de ligne) ou n'est pas une Référence.
  function getDisplayColumn(tableId, colId) {
    return (_displayColByTable[tableId] && _displayColByTable[tableId][colId]) || null;
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
      const tablesMeta = await grist.docApi.fetchTable('_grist_Tables');
      const tableRowId = {};
      for (let i = 0; i < tablesMeta.id.length; i++) {
        tableRowId[tablesMeta.tableId[i]] = tablesMeta.id[i];
      }
      const fromRowId = tableRowId[fromTableId];
      const toRowId = tableRowId[toTableId];
      if (!fromRowId || !toRowId) return [];
      const colsMeta = await grist.docApi.fetchTable('_grist_Tables_column');
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

  async function fetchRowById(tableId, rowId) {
    const data = await grist.docApi.fetchTable(tableId);
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
    const data = await grist.docApi.fetchTable(tableId);
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

  // Email utilisateur (chip #Variable) : le jeton de getAccessTokenCached() renvoie toujours "anon@getgrist.com" (identité scopée au document, pas la session
  // navigateur). Contournement : une formule DÉCLENCHÉE sur `user.Email`, dans une table interne dédiée, attribue la vraie valeur (ligne ajoutée puis retirée).
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
  }
  let _userEmailCache = null;
  async function getCurrentUserEmail() {
    if (_userEmailCache) return _userEmailCache;
    await ensureUserProbeTable();
    const addResult = await grist.docApi.applyUserActions([['AddRecord', USER_PROBE_TABLE_NAME, null, {}]]);
    const rowId = addResult && addResult.retValues && addResult.retValues[0];
    if (rowId == null) throw new Error('AddRecord sur ' + USER_PROBE_TABLE_NAME + ' n’a renvoyé aucun id de ligne');
    try {
      const row = await fetchRowById(USER_PROBE_TABLE_NAME, rowId);
      const email = row && row.Email;
      if (!email) throw new Error('la formule déclenchée user.Email n’a renvoyé aucune valeur');
      _userEmailCache = email;
      return email;
    } finally {
      // Nettoyage best-effort - une ligne orpheline ici n'est pas grave (la table reste de toute façon interne/invisible), mais mieux vaut ne rien laisser
      // trainer à chaque appel.
      grist.docApi.applyUserActions([['RemoveRecord', USER_PROBE_TABLE_NAME, rowId]]).catch(() => {});
    }
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

  return { init, refreshSchema, getTables, getColumns, getColumnType, getColumnChoices, getAllVariables, onRecord, getCurrentRecord, getCurrentTableId, getWidgetOptions, onWidgetOptionsChange, setWidgetOption, detectTableId, findReferenceColumns, fetchRowById, fetchTableRows, detectCurrentContext, getAttachmentDownloadUrl, getCurrentUserEmail, hydrateAttachmentImages, getLinkRule, getAllLinkRules, saveLinkRule, deleteLinkRule, getDisplayColumn, isRawRow };
})();
