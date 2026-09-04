// Publipostage Grist — wrapper API Grist v1.1.2 — 2026-09-04 (détection fiable Select By)
console.log('[GristAPI] module chargé, timestamp:', new Date().toISOString(), 'v1.1.2');

const GristAPI = (function () {
  let _tables = [];
  let _columnsByTable = {};
  let _currentRecord = null;
  let _currentMappings = null;
  let _currentOptions = null;
  let _currentTableId = null;
  let _onRecordCallbacks = [];
  let _recordSubscriptionRegistered = false;
  let _selectByActive = false;
  let _onSelectByChangeCallbacks = [];

  function computeSelectByActive(m) {
    if (!m || typeof m !== 'object') return false;
    if (typeof m.tableId === 'string' && m.tableId.trim()) return true;
    if (typeof m.tableId === 'number') return true;
    if (Array.isArray(m.tables) && m.tables.length > 0) return true;
    for (const k of Object.keys(m)) {
      if (k.toLowerCase().indexOf('tableid') !== -1 && m[k]) return true;
    }
    return false;
  }

  function setSelectByActive(next) {
    if (next === _selectByActive) return;
    _selectByActive = !!next;
    console.log('[GristAPI] setSelectByActive:', _selectByActive);
    for (const cb of _onSelectByChangeCallbacks) {
      try { cb(_selectByActive); } catch (e) { console.error('[GristAPI] onSelectByChange callback erreur:', e); }
    }
  }

  async function init() {
    grist.ready({ requiredAccess: 'full' });
    if (!_recordSubscriptionRegistered) {
      grist.onRecord(function (record, mappings) {
        const receivedAt = new Date();
        const rowId = record && record.id != null ? record.id : null;
        updateRowDebug(rowId, receivedAt);
        _currentRecord = record;
        _currentMappings = mappings || null;
        setSelectByActive(computeSelectByActive(_currentMappings));
        const mappedTableId = mappings && mappings.tableId ? String(mappings.tableId).trim() : null;
        if (mappedTableId) _currentTableId = mappedTableId;
        for (const cb of _onRecordCallbacks) {
          try { Promise.resolve(cb(record, _currentTableId, mappings)).catch(e => console.error('[GristAPI] erreur callback onRecord:', e)); }
          catch (e) { console.error('[GristAPI] erreur callback onRecord:', e); }
        }
        detectTableId(mappings, 'onRecord').then(id => { if (id) _currentTableId = id; }).catch(() => {});
      });
      _recordSubscriptionRegistered = true;
    }
    try { grist.onOptions((options) => { _currentOptions = options || {}; }); } catch (e) {}
    await refreshSchema();
  }

  async function detectTableId(mappings) {
    if (mappings && typeof mappings.tableId !== 'undefined') {
      const id = String(mappings.tableId || '').trim(); if (id) return id;
    }
    try {
      if (typeof grist.getTable === 'function') {
        const t = await grist.getTable();
        if (t) {
          if (typeof t.getTableId === 'function') { const id = await t.getTableId(); if (id) return id; }
          if (t.tableId) return String(t.tableId);
          for (const k of ['id', 'tableRef', 'name']) if (t[k]) return String(t[k]);
        }
      }
    } catch (e) {}
    if (_currentRecord) {
      try {
        const keys = Object.keys(_currentRecord);
        for (const tableId of _tables) if ((_columnsByTable[tableId] || []).some(c => keys.indexOf(c) !== -1)) return tableId;
      } catch (e) {}
    }
    return null;
  }

  async function refreshSchema() {
    try {
      _tables = await grist.docApi.listTables() || [];
      _columnsByTable = {};
      for (const t of _tables) {
        try { const data = await grist.docApi.fetchTable(t); _columnsByTable[t] = Object.keys(data || {}).filter(k => k !== 'id' && k !== 'manualSort'); }
        catch (e) { _columnsByTable[t] = []; }
      }
    } catch (e) { console.error('[GristAPI] refreshSchema:', e); }
  }

  function updateRowDebug(rowId, receivedAt) {
    let debug = document.getElementById('debug-rowid');
    if (!debug) { debug = document.createElement('div'); debug.id = 'debug-rowid'; debug.style.cssText = 'font-size:11px;color:#777;margin:4px 0;text-align:right;'; (document.getElementById('app') || document.body).appendChild(debug); }
    debug.textContent = 'Ligne courante: ' + (rowId == null ? '—' : rowId) + ' — reçu à ' + receivedAt.toLocaleTimeString();
  }
  function getTables() { return _tables; }
  function getColumns(tableId) { return _columnsByTable[tableId] || []; }
  function getAllVariables() { const vars = []; for (const t of _tables) for (const c of getColumns(t)) vars.push({ key: t + '.' + c, table: t, column: c }); return vars; }
  function onRecord(cb) { _onRecordCallbacks.push(cb); if (_currentRecord) { try { cb(_currentRecord, _currentTableId, _currentMappings); } catch (e) {} } }
  function getCurrentRecord() { return _currentRecord; }
  function getCurrentTableId() { return _currentTableId; }
  function getCurrentMappings() { return _currentMappings; }
  function isSelectByActive() { return _selectByActive; }
  function onSelectByChange(cb) { _onSelectByChangeCallbacks.push(cb); try { cb(_selectByActive); } catch (e) {} return _onSelectByChangeCallbacks.length; }

  async function findReferenceColumns(fromTableId, toTableId) {
    if (!fromTableId || !toTableId) return [];
    try {
      const tablesMeta = await grist.docApi.fetchTable('_grist_Tables'); const tableRowId = {};
      for (let i = 0; i < tablesMeta.id.length; i++) tableRowId[tablesMeta.tableId[i]] = tablesMeta.id[i];
      const fromRowId = tableRowId[fromTableId]; const toRowId = tableRowId[toTableId]; if (!fromRowId || !toRowId) return [];
      const colsMeta = await grist.docApi.fetchTable('_grist_Tables_column'); const refCols = [];
      if (colsMeta && colsMeta.parentId) for (let i = 0; i < colsMeta.parentId.length; i++) if (colsMeta.parentId[i] === fromRowId && colsMeta.type && String(colsMeta.type[i]).indexOf('Ref:') === 0 && colsMeta.type[i].slice(4) === toTableId) refCols.push(colsMeta.colId[i]);
      return refCols;
    } catch (e) { return []; }
  }
  async function fetchRowById(tableId, rowId) { const data = await grist.docApi.fetchTable(tableId); const ids = data && data.id ? data.id : []; const idx = ids.indexOf(rowId); if (idx === -1) return null; const row = {}; for (const key of Object.keys(data)) row[key] = data[key][idx]; return row; }
  async function detectCurrentContext() { if (!_currentRecord) return null; if (!_currentTableId) _currentTableId = await detectTableId(_currentMappings); if (!_currentTableId) return null; return { tableId: _currentTableId, record: _currentRecord, mappings: _currentMappings }; }
  return { init, refreshSchema, getTables, getColumns, getAllVariables, onRecord, onSelectByChange, getCurrentRecord, getCurrentTableId, getCurrentMappings, isSelectByActive, detectTableId, findReferenceColumns, fetchRowById, detectCurrentContext };
})();
