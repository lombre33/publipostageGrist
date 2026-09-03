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
      // L'objet record ne contient pas de tableId. Celui-ci vient de viewApi.
      try {
        if (grist.viewApi && typeof grist.viewApi.getTableId === 'function') {
          _currentTableId = await grist.viewApi.getTableId();
          console.log('[GristAPI] tableId courant détecté via viewApi.getTableId:', _currentTableId);
        } else if (mappings && mappings.tableId) {
          _currentTableId = mappings.tableId;
          console.log('[GristAPI] tableId courant détecté via mappings.tableId:', _currentTableId);
        } else {
          console.warn('[GristAPI] onRecord: aucune source de tableId disponible.');
        }
      } catch (e) {
        console.warn('[GristAPI] onRecord: détection du tableId échouée —', e);
      }
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

  // Détecte le contexte courant sans interpréter le record comme s'il contenait
  // un tableId : Grist fournit le record et le contexte de vue séparément.
  async function detectCurrentContext() {
    console.log('[GristAPI] detectCurrentContext: début. record=', !!_currentRecord, 'tableId=', _currentTableId);
    try {
      if (!_currentTableId && grist.viewApi && typeof grist.viewApi.getTableId === 'function') {
        _currentTableId = await grist.viewApi.getTableId();
        console.log('[GristAPI] detectCurrentContext: tableId via viewApi=', _currentTableId);
      }
    } catch (e) {
      console.warn('[GristAPI] detectCurrentContext: viewApi.getTableId a échoué —', e);
    }
    if (!_currentTableId && _currentMappings && _currentMappings.tableId) {
      _currentTableId = _currentMappings.tableId;
      console.log('[GristAPI] detectCurrentContext: tableId via mappings=', _currentTableId);
    }
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
