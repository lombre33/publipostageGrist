// Publipostage Grist — wrapper API Grist v1.2.0 — 2026-09-04
console.log('[GristAPI] module chargé, timestamp:', new Date().toISOString(), 'v1.2.0');

const GristAPI = (function () {
  // Tables internes de bookkeeping du widget (modèles, règles de correspon-
  // dance entre tables) - jamais des tables "métier" de l'utilisateur, donc
  // exclues de _tables/getAllVariables/tout sélecteur de table présenté à
  // l'utilisateur (sans quoi elles polluaient la liste d'autocomplétion #
  // et les sélecteurs de table cible du panneau de liaison).
  const INTERNAL_TABLES = ['Publipostage_Modeles', 'Publipostage_LiensTables', 'Publipostage_UserProbe'];
  const LINKS_TABLE_NAME = 'Publipostage_LiensTables';
  // Table interne pour GristAPI.getCurrentUserEmail() ci-dessous (chip
  // intelligent "Email de l'utilisateur") - une seule colonne à FORMULE
  // DÉCLENCHÉE (pas une formule normale, toujours recalculée pour tout le
  // monde pareil - une formule déclenchée capture QUI a réellement déclenché
  // le calcul, ex. `user.Email`, l'identité de la vraie session Grist qui a
  // fait l'action). Table vidée après chaque lecture (cf. getCurrentUserEmail),
  // jamais montrée à l'utilisateur (exclue ci-dessus comme les autres tables
  // internes de ce fichier).
  const USER_PROBE_TABLE_NAME = 'Publipostage_UserProbe';
  let _tables = [];
  let _columnsByTable = {};
  let _columnTypesByTable = {};
  let _linkRulesByTable = {};
  let _currentRecord = null;
  let _currentMappings = null;
  let _currentOptions = null;
  let _currentTableId = null;
  let _onRecordCallbacks = [];
  let _recordSubscriptionRegistered = false;
  let _tokenCache = null;

  async function init() {
    console.log('[GristAPI] init: appel de grist.ready({requiredAccess: "full"}).');
    try {
      // ATTENTION : ne PAS ajouter columns:[...] ici sans revalider en conditions
      // réelles (Grist) que ça ne casse rien. Un ajout de mappage de colonne
      // "Colonne PJ pour le PDF exporté" (pour main.js:onSaveToAttachment, cf.
      // commit 5dfecb1) a coïncidé avec une régression totale de la résolution
      // des variables #Xxx (vide partout : lecture, export, nom de fichier),
      // très probablement parce que déclarer des `columns` change la façon
      // dont Grist peuple `mappings` (dont mappings.tableId, dont dépend toute
      // la détection de table courante ici) - retiré en urgence tant que la
      // fonctionnalité PJ elle-même est de toute façon différée (cf. mémoire
      // project_pdf_attachment_column_feature.md). Revoir get PdfAttachmentColumnId()
      // plus bas si cette fonctionnalité est reprise plus tard.
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
      grist.onRecord(function (record, mappings) {
        const receivedAt = new Date();
        const rowId = record && record.id != null ? record.id : null;
        console.log('[GristAPI] onRecord reçu:', { rowId, receivedAt: receivedAt.toISOString(), record, mappings: mappings || null, mappingsJSON: safeJSONStringify(mappings) });
        updateRowDebug(rowId, receivedAt);
        _currentRecord = record;
        _currentMappings = mappings || null;
        if (!record) {
          console.warn('[GristAPI] onRecord: aucune ligne sélectionnée (record=null).');
        }

        // Notifier immédiatement à chaque événement de sélection. La détection
        // du tableId peut nécessiter des appels async et ne doit pas retarder
        // le rendu du mode lecture ni bloquer les événements suivants.
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
      });
      _recordSubscriptionRegistered = true;
      console.log('[GristAPI] grist.onRecord enregistré.');
    } catch (e) {
      console.error('[GristAPI] ERREUR lors de grist.onRecord():', e);
    }

    try {
      grist.onOptions(function (options, settings) {
        _currentOptions = options || null;
        console.log('[GristAPI] onOptions reçu: optionsJSON=', safeJSONStringify(options), 'settings=', settings);
      });
      console.log('[GristAPI] grist.onOptions enregistré.');
    } catch (e) {
      console.warn('[GristAPI] onOptions non disponible:', e);
    }

    // Seed immédiat: en mode édition plein accès, getOptions() renvoie déjà
    // l'objet InteractionOptions { accessLevel, linking: { asTarget, asSource } }.
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
      const tables = await grist.docApi.listTables();
      _tables = (tables || []).filter(t => INTERNAL_TABLES.indexOf(t) === -1);
      console.log('[GristAPI] refreshSchema: tables détectées =', _tables);
      // Un fetchTable par table, EN PARALLÈLE (indépendants) plutôt qu'en
      // séquence - la latence totale devient celle du plus lent des appels,
      // pas leur somme. Déterminant depuis que Variables.js
      // (v2/js/variables.js:createExtension) appelle refreshSchema() à
      // chaque nouvelle session de saisie de #Variable (pour voir les
      // colonnes ajoutées depuis le lancement du widget) - un doc à N
      // tables ne doit pas payer N aller-retours séquentiels à chaque fois.
      // Écrit dans un objet TEMPORAIRE, remplacé d'un coup à la fin plutôt
      // que vidé puis repeuplé sur _columnsByTable directement : sinon,
      // toute lecture de getAllVariables()/getColumns() qui tombe pendant
      // les allers-retours réseau (précisément ce qui arrive maintenant,
      // rafraîchissement déclenché à CHAQUE frappe de # par l'utilisateur)
      // verrait un schéma vidé mais pas encore repeuplé - la popup #Variable
      // clignoterait à vide pendant le rafraîchissement.
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

  // Type Grist de chaque colonne (ex. "Ref:Employes", "Text"...) - utilisé
  // pour signaler dans la modale de liaison entre tables qu'une colonne est
  // une Référence (et vers quelle table), afin que l'utilisateur sache qu'il
  // faut la comparer à l'Identifiant de ligne de la table référencée, pas à
  // une colonne texte (source du bug "aucune ligne ne correspond" quand on
  // compare par erreur une Référence à un nom affiché).
  async function refreshColumnTypes() {
    _columnTypesByTable = {};
    try {
      const tablesMeta = await grist.docApi.fetchTable('_grist_Tables');
      const tableIdByRowId = {};
      for (let i = 0; i < tablesMeta.id.length; i++) tableIdByRowId[tablesMeta.id[i]] = tablesMeta.tableId[i];
      const colsMeta = await grist.docApi.fetchTable('_grist_Tables_column');
      for (let i = 0; i < colsMeta.id.length; i++) {
        const tableId = tableIdByRowId[colsMeta.parentId[i]];
        if (!tableId) continue;
        if (!_columnTypesByTable[tableId]) _columnTypesByTable[tableId] = {};
        _columnTypesByTable[tableId][colsMeta.colId[i]] = colsMeta.type[i];
      }
    } catch (e) {
      console.warn('[GristAPI] refreshColumnTypes: échec', e);
    }
  }

  function getColumnType(tableId, colId) {
    return (_columnTypesByTable[tableId] && _columnTypesByTable[tableId][colId]) || null;
  }

  function updateRowDebug(rowId, receivedAt) {
    let debug = document.getElementById('debug-rowid');
    if (!debug) {
      debug = document.createElement('div');
      debug.id = 'debug-rowid';
      debug.style.cssText = 'font-size:11px;color:#777;margin:4px 0;text-align:right;';
      (document.getElementById('app') || document.body).appendChild(debug);
    }
    debug.textContent = 'Ligne courante: ' + (rowId == null ? '—' : rowId)
      + ' — reçu à ' + receivedAt.toLocaleTimeString();
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
  function getCurrentMappings() { return _currentMappings; }
  function getCurrentOptions() { return _currentOptions; }

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
    return row;
  }

  // Toutes les lignes d'une table sous forme de tableau d'objets {colonne: valeur}
  // (au lieu du format colonnaire brut de fetchTable) - utilisé par la résolution
  // "match"/"singleton" des règles de liaison entre tables (cf. saveLinkRule plus
  // bas), qui doit comparer/lire plusieurs lignes à la fois, contrairement à
  // fetchRowById qui n'en cible qu'une seule.
  async function fetchTableRows(tableId) {
    const data = await grist.docApi.fetchTable(tableId);
    const ids = data && data.id ? data.id : [];
    const rows = [];
    for (let i = 0; i < ids.length; i++) {
      const row = {};
      for (const key of Object.keys(data)) row[key] = data[key][i];
      rows.push(row);
    }
    return rows;
  }

  // Table de bookkeeping stockant, pour chaque table cible référencée via #
  // depuis une table différente de la table courante, COMMENT en trouver la
  // bonne ligne : soit "singleton" (une seule ligne pertinente, ex. une table
  // de paramètres), soit "match" (comparer ColonneCible de la table cible à
  // ColonneSource de la table courante - ColonneSource ou ColonneCible peut
  // valoir le littéral "id" pour désigner l'identifiant de ligne Grist). Un
  // seul mécanisme générique couvre donc colonne Référence directe, relation
  // inverse, et correspondance par clé métier arbitraire. Même pattern que
  // Publipostage_Modeles (templates.js) : table créée à la volée au premier
  // besoin, jamais explicitement par l'utilisateur.
  async function ensureLinksTableExists() {
    const tables = await grist.docApi.listTables();
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

  // Upsert (une seule règle par table cible) - écrase la précédente si l'utilisateur
  // reconfigure une table déjà liée (depuis le panneau de gestion, ou en réinsérant
  // la variable après une modification de schéma).
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

  // Sur certaines instances Grist auto-hébergées (APP_HOME_URL mal configuré côté
  // serveur), getAccessToken() renvoie un baseUrl avec un host interne injoignable
  // depuis le navigateur (ex. 0.0.0.0). On le corrige en réutilisant l'origine de
  // document.referrer (celle de la page Grist qui embarque ce widget en iframe),
  // seul indice disponible côté client sans configuration serveur supplémentaire.
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

  // Jeton d'accès court terme (quelques minutes) réutilisé pour les appels REST
  // d'upload/téléchargement de pièces jointes, avec marge de sécurité avant expiration.
  async function getAccessTokenCached() {
    const now = Date.now();
    if (_tokenCache && _tokenCache.expiresAt - now > 15000) return _tokenCache;
    const info = await grist.docApi.getAccessToken({ readOnly: false });
    const baseUrl = fixBaseUrl(info.baseUrl);
    if (baseUrl !== info.baseUrl) console.warn('[GristAPI] baseUrl corrigé:', info.baseUrl, '->', baseUrl);
    _tokenCache = { token: info.token, baseUrl, expiresAt: now + (info.ttlMsecs || 120000) };
    return _tokenCache;
  }

  // Récupère les id de pièces jointes déjà connus, pour pouvoir repérer la
  // nouvelle après upload (cf. uploadAttachment).
  async function knownAttachmentIds() {
    try {
      const data = await grist.docApi.fetchTable('_grist_Attachments');
      return new Set(data && data.id ? data.id : []);
    } catch (e) {
      console.warn('[GristAPI] lecture _grist_Attachments impossible:', e);
      return new Set();
    }
  }

  // Certaines instances Grist auto-hébergées n'envoient pas d'en-têtes CORS sur
  // l'endpoint POST /attachments pour l'origine du widget, même si le domaine est
  // parfaitement valide et joignable (contrairement au cas "baseUrl cassé" traité
  // par fixBaseUrl) : le navigateur lève alors une NetworkError et bloque
  // totalement la requête en mode 'cors' normal. On repère la pièce jointe
  // nouvellement créée en comparant les id de _grist_Attachments avant/après,
  // celle-ci étant lue via le pont RPC du plugin (grist.docApi.fetchTable), qui
  // n'est jamais soumis à CORS puisqu'il ne passe pas par un fetch réseau direct.
  async function findNewAttachmentId(beforeIds, fileName) {
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 400));
      try {
        const data = await grist.docApi.fetchTable('_grist_Attachments');
        if (!data || !data.id) continue;
        const candidates = [];
        for (let i = 0; i < data.id.length; i++) {
          if (!beforeIds.has(data.id[i])) candidates.push({ id: data.id[i], fileName: data.fileName ? data.fileName[i] : '' });
        }
        if (!candidates.length) continue;
        const exactMatch = candidates.filter(c => c.fileName === fileName);
        const pool = exactMatch.length ? exactMatch : candidates;
        return pool.reduce((max, c) => (c.id > max.id ? c : max), pool[0]).id;
      } catch (e) {
        console.warn('[GristAPI] findNewAttachmentId: échec de lecture', e);
      }
    }
    return null;
  }

  async function uploadAttachment(file) {
    if (!file) throw new Error('Fichier manquant pour l’upload.');
    const info = await getAccessTokenCached();
    const formData = new FormData();
    formData.append('upload', file, file.name || 'image');
    const url = `${info.baseUrl}/attachments?auth=${info.token}`;
    const beforeIds = await knownAttachmentIds();
    try {
      // mode: 'no-cors' — le navigateur envoie quand même la requête (l'upload a
      // bien lieu côté serveur) mais la réponse devient opaque : impossible d'y
      // lire l'identifiant créé, d'où la recherche via findNewAttachmentId ensuite.
      await fetch(url, { method: 'POST', mode: 'no-cors', body: formData });
    } catch (e) {
      throw new Error('Échec réseau vers ' + info.baseUrl + '/attachments (' + e.message + ')');
    }
    const id = await findNewAttachmentId(beforeIds, file.name || 'image');
    if (!id) throw new Error('Upload envoyé mais la pièce jointe n’a pas pu être confirmée dans le document (vérifiez si elle y apparaît malgré tout).');
    return id;
  }

  async function getAttachmentDownloadUrl(attachmentId) {
    if (!attachmentId) return '';
    const info = await getAccessTokenCached();
    return `${info.baseUrl}/attachments/${attachmentId}/download?auth=${info.token}`;
  }

  // Email de l'utilisateur courant (chip intelligent #Variable, cf.
  // v2/js/editor.js:createSmartChipNode).
  //
  // PREMIÈRE VERSION (abandonnée) : GET /api/profile/user via le jeton de
  // getAccessTokenCached() - signalé cassé par l'utilisateur, renvoyait
  // systématiquement "anon@getgrist.com" au lieu du vrai email. Confirmé par
  // recherche (communauté Grist officielle) : ce jeton d'accès "hors-bande"
  // représente une identité scopée au DOCUMENT, PAS la vraie session
  // navigateur de l'utilisateur - /profile/user y répond donc pour un
  // utilisateur anonyme/générique, jamais la bonne personne.
  //
  // VRAIE TECHNIQUE (celle que la communauté Grist utilise réellement pour
  // ce besoin, aucune méthode dédiée n'existe dans l'API Plugin officielle) :
  // une FORMULE DÉCLENCHÉE (trigger formula, PAS une formule normale - une
  // formule normale est recalculée pour TOUT LE MONDE pareil, elle ne peut
  // structurellement pas capturer "qui regarde CE viewer précis") sur une
  // colonne, réglée sur `user.Email` - Grist attribue alors CETTE valeur à
  // QUI A RÉELLEMENT DÉCLENCHÉ le calcul (ici : la création d'une ligne via
  // grist.docApi.applyUserActions, qui passe par le pont RPC du plugin -
  // donc bien la VRAIE session navigateur de l'utilisateur, contrairement au
  // jeton REST hors-bande ci-dessus). Table interne dédiée
  // (USER_PROBE_TABLE_NAME, créée au premier besoin comme LINKS_TABLE_NAME) :
  // une ligne y est ajoutée (déclenche le calcul), relue pour récupérer
  // l'email résolu, puis retirée aussitôt - cette table reste donc vide en
  // régime permanent, aucune trace laissée.
  async function ensureUserProbeTable() {
    const tables = await grist.docApi.listTables();
    if (tables.includes(USER_PROBE_TABLE_NAME)) return;
    await grist.docApi.applyUserActions([
      ['AddTable', USER_PROBE_TABLE_NAME, [
        // recalcWhen:0 = RecalcWhen.DEFAULT ("calculer sur les nouvelles
        // lignes, ou quand un champ de recalcDeps change") - recalcDeps:null
        // car aucune dépendance à un autre champ n'est nécessaire ici, seule
        // la création de ligne doit déclencher le calcul.
        { id: 'Email', type: 'Text', isFormula: false, formula: 'user.Email', recalcWhen: 0, recalcDeps: null },
      ]],
    ]);
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
      // Nettoyage best-effort - une ligne orpheline ici n'est pas grave (la
      // table reste de toute façon interne/invisible), mais mieux vaut ne
      // rien laisser trainer à chaque appel.
      grist.docApi.applyUserActions([['RemoveRecord', USER_PROBE_TABLE_NAME, rowId]]).catch(() => {});
    }
  }

  // Colonne Pièce Jointe (table de l'utilisateur) choisie via le panneau de
  // mappage de droite - cf. columns: [...] dans grist.ready() plus haut.
  function getPdfAttachmentColumnId() {
    return _currentMappings && _currentMappings.pdfAttachment ? _currentMappings.pdfAttachment : null;
  }

  // Enregistre un PDF déjà généré (Blob) dans la colonne mappée, sur la ligne
  // actuellement sélectionnée. ['L', attachmentId] REMPLACE la liste de
  // pièces jointes de la cellule (pas d'ajout) : une seule pièce jointe pour
  // ce widget dans cette colonne, toujours la plus récemment exportée -
  // l'ancienne devient orpheline et Grist la purge de lui-même.
  async function saveAttachmentToMappedColumn(blob, filename) {
    const colId = getPdfAttachmentColumnId();
    if (!colId) throw new Error('Aucune colonne Pièce Jointe n’est mappée pour le PDF (panneau de configuration du widget, à droite).');
    if (!_currentRecord || _currentRecord.id == null) throw new Error('Aucune ligne sélectionnée.');
    const tableId = _currentTableId;
    if (!tableId) throw new Error('Table du document introuvable.');
    const file = new File([blob], filename, { type: 'application/pdf' });
    const attachmentId = await uploadAttachment(file);
    await grist.docApi.applyUserActions([
      ['UpdateRecord', tableId, _currentRecord.id, { [colId]: ['L', attachmentId] }]
    ]);
    return attachmentId;
  }

  // Rafraîchit le src des images de pièces jointes dans un DOM donné : le jeton d'accès
  // expire après quelques minutes, donc le src ne doit jamais être conservé tel quel
  // dans le HTML enregistré — seul data-attachment-id est persistant.
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

  return { init, refreshSchema, getTables, getColumns, getColumnType, getAllVariables, onRecord, getCurrentRecord, getCurrentTableId, getCurrentMappings, getCurrentOptions, detectTableId, findReferenceColumns, fetchRowById, fetchTableRows, detectCurrentContext, uploadAttachment, getAttachmentDownloadUrl, getCurrentUserEmail, hydrateAttachmentImages, getPdfAttachmentColumnId, saveAttachmentToMappedColumn, getLinkRule, getAllLinkRules, saveLinkRule, deleteLinkRule };
})();
