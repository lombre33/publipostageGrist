// Publipostage Grist — wrapper API Grist v1.1.0 — 2026-09-03 (logs [GristAPI] verbeux)
console.log('[GristAPI] module chargé, timestamp:', new Date().toISOString(), 'v1.1.0');

const GristAPI = (function () {
  let _tables = [];
  let _columnsByTable = {};
  let _currentRecord = null;
  let _currentMappings = null;
  let _currentOptions = null;
  let _currentTableId = null;
  let _onRecordCallbacks = [];
  let _recordSubscriptionRegistered = false;

  async function init() {
    console.log('[GristAPI] init: appel de grist.ready({requiredAccess: "full"}).');
    try {
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
        console.log('[GristAPI] onRecord reçu:', { rowId, receivedAt: receivedAt.toISOString(), record, mappings: mappings || null });
        updateRowDebug(rowId, receivedAt);
        _currentRecord = record;
        _currentMappings = mappings || null;
        if (!record) console.warn('[GristAPI] onRecord: aucune ligne sélectionnée (record=null).');
        const mappedTableId = mappings && mappings.tableId ? String(mappings.tableId).trim() : null;
        if (mappedTableId) _currentTableId = mappedTableId;
        for (const cb of _onRecordCallbacks) {
          try {
            Promise.resolve(cb(record, _currentTableId, mappings)).catch(function (e) { console.error('[GristAPI] erreur callback onRecord:', e); });
          } catch (e) { console.error('[GristAPI] erreur callback onRecord:', e); }
        }
        detectTableId(mappings, 'onRecord').then(function (tableId) { if (tableId) _currentTableId = tableId; }).catch(function (e) { console.warn('[GristAPI] onRecord: échec detectTableId —', e); });
      });
      _recordSubscriptionRegistered = true;
      console.log('[GristAPI] grist.onRecord enregistré.');
    } catch (e) { console.error('[GristAPI] ERREUR lors de grist.onRecord():', e); }

    try { grist.onOptions(function (options, settings) { _currentOptions = options || {}; console.log('[GristAPI] onOptions reçu: options=', options, 'settings=', settings); }); } catch (e) { console.warn('[GristAPI] grist.onOptions non disponible:', e); }
    try { await refreshSchema(); } catch (e) { console.error('[GristAPI] refreshSchema a échoué:', e); }
    console.log('[GristAPI] init terminé.');
  }

  async function detectTableId(mappings, source) {
    source = source || 'unknown';
    if (mappings && typeof mappings.tableId !== 'undefined') { const id = String(mappings.tableId || '').trim(); if (id) return id; }
    try {
      if (typeof grist.getTable === 'function') {
        const t = await grist.getTable();
        if (t) {
          if (typeof t.getTableId === 'function') { const id = await t.getTableId(); if (id) return id; }
          if (t.tableId) return String(t.tableId);
          for (const k of ['id', 'tableRef', 'name']) if (t[k]) return String(t[k]);
        }
      }
    } catch (e) { console.warn('[GristAPI] detectTableId: échec grist.getTable —', e); }
    if (_currentRecord) {
      try { for (const tableId of _tables) { const cols = _columnsByTable[tableId] || []; if (cols.filter(c => Object.prototype.hasOwnProperty.call(_currentRecord, c)).length >= 1) return tableId; } } catch (e) { console.warn('[GristAPI] fallback schéma a échoué —', e); }
    }
    return null;
  }

  async function refreshSchema() {
    try { const tables = await grist.docApi.listTables(); _tables = tables || []; _columnsByTable = {}; for (const t of _tables) { try { const data = await grist.docApi.fetchTable(t); _columnsByTable[t] = Object.keys(data || {}).filter(k => k !== 'id' && k !== 'manualSort'); } catch (e) { _columnsByTable[t] = []; } } } catch (e) { console.error('[GristAPI] refreshSchema: erreur globale —', e); }
  }

  function updateRowDebug(rowId, receivedAt) { let debug = document.getElementById('debug-rowid'); if (!debug) { debug = document.createElement('div'); debug.id = 'debug-rowid'; debug.style.cssText = 'font-size:11px;color:#777;margin:4px 0;text-align:right;'; (document.getElementById('app') || document.body).appendChild(debug); } debug.textContent = 'Ligne courante: ' + (rowId == null ? '—' : rowId) + ' — reçu à ' + receivedAt.toLocaleTimeString(); }
  function getTables() { return _tables; }
  function getColumns(tableId) { return _columnsByTable[tableId] || []; }
  function getAllVariables() { const vars = []; for (const t of _tables) for (const c of getColumns(t)) vars.push({ key: t + '.' + c, table: t, column: c }); return vars; }
  function onRecord(cb) { _onRecordCallbacks.push(cb); if (_currentRecord) { try { cb(_currentRecord, _currentTableId, _currentMappings); } catch (e) { console.error('[GristAPI] onRecord replay callback erreur:', e); } } }
  function getCurrentRecord() { return _currentRecord; }
  function getCurrentTableId() { return _currentTableId; }
  function getCurrentMappings() { return _currentMappings; }
  async function findReferenceColumns(fromTableId, toTableId) { if (!fromTableId || !toTableId) return []; try { const m = await grist.docApi.fetchTable('_grist_Tables'); const ids = {}; for (let i=0;i<m.id.length;i++) ids[m.tableId[i]]=m.id[i]; const a=ids[fromTableId], b=ids[toTableId]; if (!a || !b) return []; const c=await grist.docApi.fetchTable('_grist_Tables_column'), out=[]; for (let i=0;i<(c.parentId||[]).length;i++) if(c.parentId[i]===a && String(c.type[i]||'').indexOf('Ref:')===0 && c.type[i].slice(4)===toTableId) out.push(c.colId[i]); return out; } catch(e) { return []; } }
  async function fetchRowById(tableId, rowId) { const data=await grist.docApi.fetchTable(tableId), idx=data.id.indexOf(rowId); if(idx===-1)return null; const row={}; for(const key of Object.keys(data)) row[key]=data[key][idx]; return row; }
  async function detectCurrentContext() { if (!_currentRecord) return null; if (!_currentTableId) _currentTableId=await detectTableId(_currentMappings,'detectCurrentContext'); if(!_currentTableId)return null; return {tableId:_currentTableId,record:_currentRecord,mappings:_currentMappings}; }
  return {init,refreshSchema,getTables,getColumns,getAllVariables,onRecord,getCurrentRecord,getCurrentTableId,getCurrentMappings,detectTableId,findReferenceColumns,fetchRowById,detectCurrentContext};
})();