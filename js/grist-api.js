// Module d'accès à l'API Grist : tables, colonnes, enregistrement courant
const GristAPI = (function () {
  let _tables = [];
  let _columnsByTable = {};
  let _currentRecord = null;
  let _currentMappings = null;
  let _currentTableId = null;
  let _currentOptions = null;
  let _onRecordCallbacks = [];

  async function init() {
    grist.ready({ requiredAccess: 'full' });
    await refreshSchema();
    grist.onRecord(function (record, mappings) {
      _currentRecord = record;
      _currentMappings = mappings;
      _onRecordCallbacks.forEach(cb => cb(record));
      detectCurrentContext().catch(() => {});
    });
    grist.onOptions(function (options, settings) {
      _currentOptions = { options, settings };
      console.debug('[GristAPI] onOptions reçu:', options, settings);
      detectCurrentContext().catch(() => {});
    });
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

  // Détection du contexte courant (table + ligne).
  // Grist expose le tableId via la TableOperations retournée par
  // grist.getTable(), et non comme une chaîne renvoyée directement par
  // grist.getTable(). Les autres méthodes sont des replis de compatibilité.
  function describeObject(value) {
    if (!value || (typeof value !== 'object' && typeof value !== 'function')) return [];
    try {
      return Array.from(new Set([
        ...Object.keys(value),
        ...Object.getOwnPropertyNames(value),
        ...Object.getOwnPropertyNames(Object.getPrototypeOf(value) || {})
      ])).sort();
    } catch (e) { return []; }
  }

  function normalizeTableId(value) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (value && typeof value === 'object') {
      for (const key of ['tableId', 'table_id', 'table']) {
        if (typeof value[key] === 'string' && value[key].trim()) return value[key].trim();
      }
    }
    return null;
  }

  function findTableIdInObject(value, label, seen = new Set(), depth = 0) {
    if (!value || depth > 3 || (typeof value !== 'object' && typeof value !== 'function') || seen.has(value)) return null;
    seen.add(value);
    const keys = describeObject(value);
    console.debug('[GristAPI] detectCurrentContext:', label, 'propriétés/méthodes:', keys);
    for (const key of ['tableId', 'table_id']) {
      try { const id = normalizeTableId(value[key]); if (id) { console.debug('[GristAPI] tentative', label + '.' + key, '=>', id); return id; } } catch (e) {}
    }
    for (const key of keys) {
      if (!/table/i.test(key)) continue;
      try {
        const nested = value[key];
        const id = normalizeTableId(nested);
        if (id) { console.debug('[GristAPI] tentative', label + '.' + key, '=>', id); return id; }
      } catch (e) {}
    }
    return null;
  }

  async function detectTableId() {
    // API documentée : getTable() renvoie TableOperations, dont getTableId()
    try {
      if (typeof grist !== 'undefined' && typeof grist.getTable === 'function') {
        const table = grist.getTable();
        console.debug('[GristAPI] detectTableId: résultat brut de grist.getTable():', table);
        console.debug('[GristAPI] detectTableId: propriétés/méthodes disponibles:', describeObject(table));
        if (table && typeof table.getTableId === 'function') {
          const id = await table.getTableId();
          console.debug('[GristAPI] tentative grist.getTable().getTableId() =>', id);
          if (normalizeTableId(id)) return normalizeTableId(id);
        }
        const id = findTableIdInObject(table, 'grist.getTable()');
        if (id) return id;
      }
    } catch (e) { console.warn('[GristAPI] tentative grist.getTable().getTableId échouée:', e); }

    for (const source of [
      ['grist.selectedTable', (typeof grist !== 'undefined') ? grist.selectedTable : null],
      ['grist.viewApi', (typeof grist !== 'undefined') ? grist.viewApi : null]
    ]) {
      try {
        const id = findTableIdInObject(source[1], source[0]);
        if (id) return id;
        if (source[1] && typeof source[1].getTableId === 'function') {
          const methodId = await source[1].getTableId();
          console.debug('[GristAPI] tentative', source[0] + '.getTableId()', '=>', methodId);
          if (normalizeTableId(methodId)) return normalizeTableId(methodId);
        }
      } catch (e) { console.warn('[GristAPI] tentative', source[0], 'échouée:', e); }
    }

    const mappedId = findTableIdInObject(_currentMappings, 'onRecord.mappings') || findTableIdInObject(_currentOptions, 'onOptions.options');
    if (mappedId) return mappedId;

    // Dernier recours : le record doit correspondre à une seule table connue.
    try {
      const recordKeys = Object.keys(_currentRecord || {}).filter(k => k !== 'id' && !k.startsWith('__'));
      const candidates = _tables.filter(t => {
        const cols = _columnsByTable[t] || [];
        return recordKeys.length > 0 && recordKeys.every(k => cols.includes(k));
      });
      console.debug('[GristAPI] tentative fallback schéma:', { recordKeys, candidates });
      if (candidates.length === 1) return candidates[0];
    } catch (e) { console.warn('[GristAPI] fallback schéma échoué:', e); }
    return null;
  }

  async function detectCurrentContext() {
    try {
      const tableId = await detectTableId();
      if (tableId) {
        _currentTableId = tableId;
        console.info('[GristAPI] detectCurrentContext: table détectée:', tableId);
        return { tableId, record: _currentRecord };
      }
      if (_currentRecord) console.warn('[GristAPI] detectCurrentContext: tableId absent malgré record, retour null.');
      else console.debug('[GristAPI] detectCurrentContext: aucun record courant.');
    } catch (e) { console.warn('[GristAPI] detectCurrentContext: échec global:', e); }
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
    detectTableId,
    detectCurrentContext,
  };
})();

