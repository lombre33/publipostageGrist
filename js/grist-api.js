// grist-api.js
// Couche d'abstraction autour de l'API Grist Custom Widget.
// Objectif de ce module : exposer GristAPI.getCurrentTableId() de façon fiable,
// même quand le widget est en accès complet (fullDocument) et n'a PAS de mapping
// de colonnes explicite vers une table donnée.
//
// Piste explorée (cf. discussion) : au moment de la création du custom widget,
// celui-ci est posé sur une VUE qui est elle-même rattachée à une table.
// grist.ready() reçoit, via le protocole bas niveau, des informations sur le
// contexte d'exécution (dont potentiellement le tableId de la vue hôte).
// On tente donc plusieurs sources, de la plus fiable à la plus "best effort",
// et on garde la première qui répond, avec un mécanisme de rafraîchissement
// continu (au cas où l'utilisateur change de ligne / de vue).

const GristAPI = (() => {
  let currentTableId = null;
  let allTables = [];       // liste des tables du document: [{tableId, columns:[...]}]
  let onTableIdChangeCbs = [];
  let onRecordCbs = [];

  function notifyTableIdChange(tableId) {
    if (tableId && tableId !== currentTableId) {
      currentTableId = tableId;
      onTableIdChangeCbs.forEach(cb => {
        try { cb(currentTableId); } catch (e) { console.error(e); }
      });
    } else if (tableId) {
      currentTableId = tableId;
    }
  }

  // --- Piste 1 : grist.viewApi / grist.getTable() (API haut niveau) ---
  async function tryGetTableIdFromViewApi() {
    try {
      if (grist.viewApi && typeof grist.viewApi.getTableId === 'function') {
        const id = await grist.viewApi.getTableId();
        if (id) return id;
      }
    } catch (e) { /* silencieux, on tente la suite */ }
    return null;
  }

  // --- Piste 2 : table renvoyée par grist.getTable() (mapping implicite) ---
  async function tryGetTableIdFromGetTable() {
    try {
      if (typeof grist.getTable === 'function') {
        const table = grist.getTable();
        if (table) {
          if (table.tableId) return table.tableId;
          if (typeof table.getTableId === 'function') {
            const id = await table.getTableId();
            if (id) return id;
          }
        }
      }
    } catch (e) { /* silencieux */ }
    return null;
  }

  // --- Piste 3 : écoute des messages bruts du protocole plugin (bas niveau) ---
  // Le message 'message' émis par grist-plugin-api.js contient parfois
  // directement un champ tableId dans les événements internes (selon version).
  function listenRawMessages() {
    try {
      grist.on('message', (msg) => {
        if (msg && msg.tableId) {
          notifyTableIdChange(msg.tableId);
        }
        // Certaines versions encapsulent l'info dans msg.data
        if (msg && msg.data && msg.data.tableId) {
          notifyTableIdChange(msg.data.tableId);
        }
      });
    } catch (e) { /* silencieux */ }
  }

  // --- Piste 4 (fallback ultime) : déduire la table par élimination via les
  // champs présents dans le record reçu par onRecord, comparés à la liste des
  // colonnes de chaque table du document. Si une seule table matche tous les
  // champs du record, on la retient. ---
  function guessTableIdFromRecordShape(record) {
    if (!record || allTables.length === 0) return null;
    const recordFields = Object.keys(record).filter(k => k !== 'id');
    if (recordFields.length === 0) return null;

    const candidates = allTables.filter(t => {
      const cols = t.columns.map(c => c.colId);
      return recordFields.every(f => cols.includes(f));
    });

    if (candidates.length === 1) return candidates[0].tableId;
    return null; // ambigu, on ne prend pas de risque
  }

  async function refreshAllTables() {
    try {
      const tableIds = await grist.docApi.listTables();
      const tables = [];
      for (const tableId of tableIds) {
        try {
          const cols = await grist.docApi.fetchTable('_grist_Tables_column');
          // fetchTable direct sur les colonnes n'est pas garanti selon la version;
          // on utilise plutôt une approche par table cible ci-dessous.
        } catch (e) { /* ignore, fallback plus bas */ }
      }
      // Approche fiable : interroger les métadonnées _grist_Tables et
      // _grist_Tables_column pour obtenir tableId -> [colId...]
      const metaTables = await grist.docApi.fetchTable('_grist_Tables');
      const metaCols = await grist.docApi.fetchTable('_grist_Tables_column');

      const tableIdById = {};
      for (let i = 0; i < metaTables.id.length; i++) {
        tableIdById[metaTables.id[i]] = metaTables.tableId[i];
      }

      const colsByTableRef = {};
      for (let i = 0; i < metaCols.id.length; i++) {
        const tableRef = metaCols.parentId[i];
        const colId = metaCols.colId[i];
        const tId = tableIdById[tableRef];
        if (!tId) continue;
        if (!colsByTableRef[tId]) colsByTableRef[tId] = [];
        colsByTableRef[tId].push({ colId });
      }

      allTables = Object.keys(colsByTableRef).map(tId => ({
        tableId: tId,
        columns: colsByTableRef[tId],
      }));
    } catch (e) {
      console.error('Erreur lors du chargement des métadonnées de tables', e);
      allTables = [];
    }
  }

  async function init() {
    // Accès complet requis pour explorer toutes les tables / métadonnées.
    grist.ready({
      requiredAccess: 'full',
    });

    listenRawMessages();

    await refreshAllTables();

    // Tentative immédiate via les API haut niveau.
    const idFromViewApi = await tryGetTableIdFromViewApi();
    if (idFromViewApi) notifyTableIdChange(idFromViewApi);

    const idFromGetTable = await tryGetTableIdFromGetTable();
    if (idFromGetTable) notifyTableIdChange(idFromGetTable);

    // Abonnement aux changements de ligne courante.
    grist.onRecord((record, mappings) => {
      // Si Grist fournit un mapping avec tableId, on l'utilise en priorité.
      if (mappings && mappings.tableId) {
        notifyTableIdChange(mappings.tableId);
      } else if (!currentTableId) {
        // Sinon on tente la déduction par forme du record (fallback).
        const guessed = guessTableIdFromRecordShape(record);
        if (guessed) notifyTableIdChange(guessed);
      }
      onRecordCbs.forEach(cb => {
        try { cb(record, currentTableId); } catch (e) { console.error(e); }
      });
    });

    // Certaines versions de l'API exposent onOptions avec des infos de contexte.
    if (typeof grist.onOptions === 'function') {
      grist.onOptions((options, settings) => {
        if (settings && settings.tableId) {
          notifyTableIdChange(settings.tableId);
        }
      });
    }
  }

  function onTableIdChange(cb) {
    onTableIdChangeCbs.push(cb);
    if (currentTableId) cb(currentTableId);
  }

  function onRecord(cb) {
    onRecordCbs.push(cb);
  }

  function getCurrentTableId() {
    return currentTableId;
  }

  function getAllTables() {
    return allTables;
  }

  async function docApiFetchTable(tableId) {
    return grist.docApi.fetchTable(tableId);
  }

  async function applyUserActions(actions) {
    return grist.docApi.applyUserActions(actions);
  }

  return {
    init,
    onTableIdChange,
    onRecord,
    getCurrentTableId,
    getAllTables,
    docApiFetchTable,
    applyUserActions,
  };
})();
