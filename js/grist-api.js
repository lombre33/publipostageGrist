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
        console.log('[GristAPI] onRecord reçu: record=', record ? Object.keys(record) : null, 'mappings=', mappings || null);
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
          try { cb(record, _currentTableId, mappings); }
          catch (e) { console.error('[GristAPI] erreur callback onRecord:', e); }
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
        _currentOptions = options || {};
        console.log('[GristAPI] onOptions reçu: options=', options, 'settings=', settings);
      });
      console.log('[GristAPI] grist.onOptions enregistré.');
    } catch (e) {
      console.warn('[GristAPI] grist.onOptions non disponible:', e);
    }

    try {
      await refreshSchema();
    } catch (e) {
      console.error('[GristAPI] refreshSchema a échoué:', e);
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
      _tables = tables || [];
      console.log('[GristAPI] refreshSchema: tables détectées =', _tables);
      _columnsByTable = {};
      for (const t of _tables) {
        try {
          const data = await grist.docApi.fetchTable(t);
          const cols = Object.keys(data || {}).filter(k => k !== 'id' && k !== 'manualSort');
          _columnsByTable[t] = cols;
        } catch (e) {
          console.warn('[GristAPI] refreshSchema: échec fetchTable(' + t + ') —', e);
          _columnsByTable[t] = [];
        }
      }
    } catch (e) {
      console.error('[GristAPI] refreshSchema: erreur globale —', e);
    }
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
      console.error('[GristAPI] findReferenceColumns error:', e);
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

  async function detectCurrentContext() {
    if (!_currentRecord) {
      console.warn('[GristAPI] detectCurrentContext: pas de record courant.');
      return null;
    }
    if (!_currentTableId) {
      _currentTableId = await detectTableId(_currentMappings, 'detectCurrentContext');
    }
    if (!_currentTableId) {
      console.warn('[GristAPI] detectCurrentContext: tableId introuvable.');
      return null;
    }
    return { tableId: _currentTableId, record: _currentRecord, mappings: _currentMappings };
  }

  return {
    init,
    refreshSchema,
    getTables,
    getColumns,
    getAllVariables,
    onRecord,
    getCurrentRecord,
    getCurrentTableId,
    getCurrentMappings,
    detectTableId,
    findReferenceColumns,
    fetchRowById,
    detectCurrentContext,
  };
})();
