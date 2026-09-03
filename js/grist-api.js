// Module d'accès à l'API Grist : tables, colonnes, enregistrement courant
const GristAPI = (function () {
  let _tables = [];
  let _columnsByTable = {};
  let _currentRecord = null;
  let _currentMappings = null;
  let _currentTableId = null;
  let _onRecordCallbacks = [];

  async function init() {
    grist.ready({ requiredAccess: 'full' });
    await refreshSchema();
    grist.onRecord(function (record, mappings) {
      _currentRecord = record;
      _currentMappings = mappings;
      _onRecordCallbacks.forEach(cb => cb(record));
    });
    grist.onOptions(function () {});
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


  // =====================================================================
  // Détection ISOLÉE du contexte courant (table + ligne).
  // - Ne lève JAMAIS d'exception vers l'appelant.
  // - Chaque étape est dans son propre try/catch et renvoie null en cas d'échec.
  // - Retourne { tableId, record } ou null.
  // - Aucun badge de diagnostic, aucune modification des IDs DOM V1.
  // =====================================================================
  async function detectCurrentContext() {
    // a) grist.viewApi?.getTableId?.() si disponible
    try {
      const va = (typeof grist !== 'undefined') ? grist.viewApi : null;
      if (va && typeof va.getTableId === 'function') {
        const id = await va.getTableId();
        if (id) {
          return { tableId: id, record: _currentRecord };
        }
      }
    } catch (e) {
      console.warn('[GristAPI] detectCurrentContext: viewApi.getTableId a échoué —', e);
    }
    // b) Fallback : déduction depuis mappings fourni par grist.onRecord
    try {
      if (_currentMappings && _currentMappings.tableId) {
        return { tableId: _currentMappings.tableId, record: _currentRecord };
      }
    } catch (e) {
      console.warn('[GristAPI] detectCurrentContext: mappings.tableId inaccessible —', e);
    }
    return null;
  }

  return {
    init,
    refreshSchema,
    getTables,
    getColumns,
    getAllVariables,
    onRecord,
    getCurrentRecord,
    findReferenceColumns,
    fetchRowById,
    detectCurrentContext,
  };
})();
