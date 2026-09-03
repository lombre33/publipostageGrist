// Module d'accès à l'API Grist : tables, colonnes, enregistrement courant
const GristAPI = (function () {
  let _tables = [];
  let _columnsByTable = {};
  let _currentRecord = null;
  let _currentMappings = null;
  let _currentTableId = null;
  let _onRecordCallbacks = [];

  async function init() {
    console.log('[GristAPI] init: appel de grist.ready({requiredAccess: "full"}).');
    grist.ready({ requiredAccess: 'full' });
    // Enregistrer onRecord avant tout await pour ne pas rater l'événement initial.
    grist.onRecord(async function (record, mappings) {
      _currentRecord = record;
      _currentMappings = mappings || null;
      console.log('[GristAPI] onRecord reçu:', record ? Object.keys(record) : null, 'mappings:', mappings || null);
      if (!record) {
        console.warn('[GristAPI] onRecord: aucune ligne sélectionnée (record=null).');
      }
      // Le record ne contient pas de tableId. Utiliser d'abord l'API de vue
      // si elle existe, puis grist.getTable(), qui est l'API widget documentée.
      _currentTableId = await detectTableId(mappings, 'onRecord');
      _onRecordCallbacks.forEach(cb => cb(record, _currentTableId, mappings));
    });
    grist.onOptions(function () {});
    await refreshSchema();
    console.log('[GristAPI] init terminé.');
  }

  // Récupère la liste des tables et de leurs colonnes via docApi
  async function refreshSchema() {
    try {
      const tables = await grist.docApi.listTables();
      _tables = tables;
      _columnsByTable = {};
      for (const t of tables) {
        try {
          const data = await grist.docApi.fetchTable(t);
          const cols = Object.keys(data).filter(c => c !== 'id');
          _columnsByTable[t] = cols;
        } catch (e) {
          _columnsByTable[t] = [];
        }
      }
    } catch (e) {
      console.error('Erreur refreshSchema', e);
    }
  }

  function getTables() {
    return _tables;
  }

  function getColumns(tableId) {
    return _columnsByTable[tableId] || [];
  }

  // Retourne toutes les variables disponibles sous forme Table_Colonne
  function getAllVariables() {
    const vars = [];
    for (const t of _tables) {
      for (const c of getColumns(t)) {
        vars.push({ table: t, column: c, key: t + '_' + c });
      }
    }
    return vars;
  }

  function onRecord(cb) {
    _onRecordCallbacks.push(cb);
    // Note : Grist bufferise et rejoue automatiquement l'état initial sur les
    // nouveaux abonnés à grist.onRecord, donc pas besoin de replay manuel ici.
  }

  function getCurrentRecord() {
    return _currentRecord;
  }

  // Détecte les colonnes de type Référence dans la table courante pointant vers une table cible
  // Nécessite les métadonnées de colonnes (_grist_Tables_column)
  async function findReferenceColumns(fromTableId, toTableId) {
    try {
      const colsMeta = await grist.docApi.fetchTable('_grist_Tables_column');
      const tablesMeta = await grist.docApi.fetchTable('_grist_Tables');
      const tableRowId = {};
      for (let i = 0; i < tablesMeta.id.length; i++) {
        tableRowId[tablesMeta.tableId[i]] = tablesMeta.id[i];
      }
      const fromId = tableRowId[fromTableId];
      const toId = tableRowId[toTableId];
      const refCols = [];
      for (let i = 0; i < colsMeta.id.length; i++) {
        if (colsMeta.parentId[i] === fromId) {
          const type = colsMeta.type[i] || '';
          const match = type.match(/^Ref(?:List)?:(.+)$/);
          if (match && match[1] === toTableId) {
            refCols.push(colsMeta.colId[i]);
          }
        }
      }
      return refCols;
    } catch (e) {
      console.error('Erreur findReferenceColumns', e);
      return [];
    }
  }

  async function fetchRowById(tableId, rowId) {
    const data = await grist.docApi.fetchTable(tableId);
    const idx = data.id.indexOf(rowId);
    if (idx === -1) return null;
    const row = {};
    for (const key of Object.keys(data)) {
      row[key] = data[key][idx];
    }
    return row;
  }

  // Obtient le tableId sans supposer que record ou mappings le contiennent.
  // grist.getTable() est le fallback fiable pour un widget lié à une table.
  async function detectTableId(mappings, source) {
    console.log('[GristAPI] ' + source + ': tentative obtention du tableId.');
    try {
      if (grist.viewApi && typeof grist.viewApi.getTableId === 'function') {
        console.log('[GristAPI] ' + source + ': tentative viewApi.getTableId().');
        const tableId = await grist.viewApi.getTableId();
        if (tableId) {
          console.log('[GristAPI] ' + source + ': tableId obtenu via viewApi=', tableId);
          return tableId;
        }
        console.warn('[GristAPI] ' + source + ': viewApi.getTableId() a renvoyé une valeur vide.');
      } else {
        console.log('[GristAPI] ' + source + ': viewApi.getTableId indisponible.');
      }
    } catch (e) {
      console.warn('[GristAPI] ' + source + ': échec viewApi.getTableId —', e);
    }
    try {
      if (typeof grist.getTable === 'function') {
        console.log('[GristAPI] ' + source + ': tentative grist.getTable().');
        const table = await grist.getTable();
        const tableId = typeof table === 'string' ? table : table && (table.tableId || table.id || table.name);
        if (tableId) {
          console.log('[GristAPI] ' + source + ': tableId obtenu via grist.getTable=', tableId);
          return tableId;
        }
        console.warn('[GristAPI] ' + source + ': grist.getTable() a renvoyé une valeur inexploitable.', table);
      } else {
        console.log('[GristAPI] ' + source + ': grist.getTable indisponible.');
      }
    } catch (e) {
      console.warn('[GristAPI] ' + source + ': échec grist.getTable —', e);
    }
    if (mappings && (mappings.tableId || mappings.table)) {
      const tableId = mappings.tableId || mappings.table;
      console.log('[GristAPI] ' + source + ': tableId obtenu via mappings=', tableId);
      return tableId;
    }
    console.warn('[GristAPI] ' + source + ': aucune source de tableId disponible.');
    return null;
  }

  async function detectCurrentContext() {
    console.log('[GristAPI] detectCurrentContext: début. record=', !!_currentRecord, 'tableId=', _currentTableId);
    if (!_currentTableId) _currentTableId = await detectTableId(_currentMappings, 'detectCurrentContext');
    if (!_currentRecord) {
      console.warn('[GristAPI] detectCurrentContext: record absent, retour null.');
      return null;
    }
    if (!_currentTableId) {
      console.warn('[GristAPI] detectCurrentContext: tableId absent malgré record, retour null.');
      return null;
    }
    console.log('[GristAPI] detectCurrentContext: contexte résolu.', _currentTableId);
    return { tableId: _currentTableId, record: _currentRecord };
  }

  return {
    init,
    refreshSchema,
    getTables,
    getColumns,
    getAllVariables,
    onRecord,
    getCurrentRecord,
    getCurrentTableId: () => _currentTableId,
    findReferenceColumns,
    fetchRowById,
    detectCurrentContext,
  };
})();
