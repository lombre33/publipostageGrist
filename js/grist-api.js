// Publipostage Grist — wrapper API Grist v1.1.0 — 2026-09-03 (logs [GristAPI] verbeux)
console.log('[GristAPI] module chargé, timestamp:', new Date().toISOString(), 'v1.1.0');

const GristAPI = (function () {
  let _t;
  let _defaultTable = null;
  let _schemas = {}; // cache des schémas par table
  let _currentRecord = null;
  let _currentMappings = null;
  let _currentTableId = null;
  let _recordCallbacks = [];
  let _recordSubscriptionRegistered = false;
  let _pollingInterval = null;
  let _lastSelectedRowId = null;

  async function init(defaultTable = null) {
    console.log('[GristAPI] init(): lancement');
    _defaultTable = defaultTable;
    try {
      // 1. Appel de grist.ready()
      await grist.ready({ requiredAccess: 'full' });
      console.log('[GristAPI] grist.ready() complété');

      // 2. Charger les schémas
      await loadAllSchemas();
      console.log('[GristAPI] loadAllSchemas() complété');

      // 3. S'abonner à grist.onRecord()
      if (!_recordSubscriptionRegistered) {
        console.log('[GristAPI] enregistrement de grist.onRecord()...');
        grist.onRecord((record, mappings) => {
          console.log('[GristAPI] onRecord natif reçu:', record?.id || 'null', 'à', new Date().toLocaleTimeString());
          _currentRecord = record;
          _currentMappings = mappings;
          if (mappings?.tableId) {
            _currentTableId = mappings.tableId;
            console.log('[GristAPI] tableId depuis mappings:', _currentTableId);
          }
          notifyCallbacks();
          detectTableIdAsync();
        });
        _recordSubscriptionRegistered = true;
      }

      // 4. Lancer le polling autonome (fallback si SELECT BY n'est pas configuré)
      startRowSelectionPolling();

      console.log('[GristAPI] init() terminé avec succès');
    } catch (err) {
      console.error('[GristAPI] init() erreur:', err);
    }
  }

  /**
   * Polling autonome : interroge grist.getSelectedRows() toutes les 500ms
   * pour détecter les changements de sélection sans dépendre de "SELECT BY".
   */
  function startRowSelectionPolling() {
    if (_pollingInterval) {
      console.log('[GristAPI] polling déjà actif, pas de redémarrage');
      return;
    }

    console.log('[GristAPI] startRowSelectionPolling() démarrage (interval 500ms)');

    _pollingInterval = setInterval(async () => {
      try {
        const selectedRows = await grist.getSelectedRows();
        if (!selectedRows || selectedRows.length === 0) {
          // Aucune ligne sélectionnée
          if (_lastSelectedRowId !== null) {
            console.log('[GristAPI] polling: aucune ligne sélectionnée');
            _lastSelectedRowId = null;
            _currentRecord = null;
            notifyCallbacks();
          }
          return;
        }

        const currentRowId = selectedRows[0]; // prendre la première ligne sélectionnée
        if (currentRowId !== _lastSelectedRowId) {
          console.log('[GristAPI] polling: sélection changée de', _lastSelectedRowId, 'à', currentRowId);
          _lastSelectedRowId = currentRowId;

          // Récupérer le record complet de cette ligne
          try {
            const record = await grist.getRecord(currentRowId);
            console.log('[GristAPI] polling: record récupéré:', record?.id || 'null');
            _currentRecord = record;
            notifyCallbacks();
            detectTableIdAsync();
          } catch (err) {
            console.error('[GristAPI] polling: erreur lors de grist.getRecord():', err);
          }
        }
      } catch (err) {
        console.warn('[GristAPI] polling: erreur grist.getSelectedRows():', err.message);
      }
    }, 500);
  }

  function notifyCallbacks() {
    console.log('[GristAPI] notifyCallbacks(): appel de', _recordCallbacks.length, 'callback(s)');
    for (const cb of _recordCallbacks) {
      try {
        cb(_currentRecord, _currentMappings);
      } catch (err) {
        console.error('[GristAPI] erreur dans callback:', err);
      }
    }
  }

  async function loadAllSchemas() {
    try {
      const tables = await grist.getTable('_grist_Tables');
      if (!tables || !tables.columns) {
        console.warn('[GristAPI] loadAllSchemas: aucune table système trouvée');
        return;
      }

      const tableIds = tables.columns['tableId'] || [];
      const tableNames = tables.columns['tableName'] || [];

      for (let i = 0; i < tableIds.length; i++) {
        const tId = tableIds[i];
        const tName = tableNames[i] || 'Unknown';
        try {
          const table = await grist.getTable(tId);
          if (table && table.columns) {
            _schemas[tId] = { name: tName, columns: table.columns };
            console.log('[GristAPI] schéma chargé:', tName, '(' + tId + '), colonnes:', Object.keys(table.columns).length);
          }
        } catch (err) {
          console.warn('[GristAPI] impossible de charger le schéma de', tName, ':', err.message);
        }
      }
    } catch (err) {
      console.error('[GristAPI] loadAllSchemas() erreur globale:', err);
    }
  }

  async function detectTableIdAsync() {
    if (_currentTableId) return; // déjà détecté

    // Niveau 1 : mappings
    if (_currentMappings?.tableId) {
      _currentTableId = _currentMappings.tableId;
      console.log('[GristAPI] detectTableIdAsync: tableId trouvé dans mappings:', _currentTableId);
      return;
    }

    // Niveau 2 : grist.getTable() (mais attention, peut être déjà "en cours de chargement")
    try {
      const t = await grist.getTable();
      if (t && t._tableId) {
        _currentTableId = t._tableId;
        console.log('[GristAPI] detectTableIdAsync: tableId trouvé via grist.getTable():', _currentTableId);
        return;
      }
    } catch (err) {
      console.warn('[GristAPI] detectTableIdAsync: grist.getTable() a échoué:', err.message);
    }

    // Niveau 3 : correspondance avec les schémas chargés
    if (_currentRecord && Object.keys(_schemas).length > 0) {
      for (const [tId, schema] of Object.entries(_schemas)) {
        const columns = schema.columns || {};
        if (Object.keys(columns).every(col => col in _currentRecord)) {
          _currentTableId = tId;
          console.log('[GristAPI] detectTableIdAsync: tableId trouvé par correspondance de schéma:', _currentTableId);
          return;
        }
      }
    }

    console.warn('[GristAPI] detectTableIdAsync: aucune source de tableId disponible');
  }

  function getCurrentRecord() {
    if (!_currentRecord) {
      console.warn('[GristAPI] getCurrentRecord: aucun record disponible');
      return null;
    }
    return _currentRecord;
  }

  function getCurrentTableId() {
    return _currentTableId || null;
  }

  function onRecord(callback) {
    console.log('[GristAPI] onRecord: abonné ajouté. total=', _recordCallbacks.length + 1);
    _recordCallbacks.push(callback);
    // Rejouer le dernier record connu si disponible
    if (_currentRecord) {
      try {
        callback(_currentRecord, _currentMappings);
      } catch (err) {
        console.error('[GristAPI] erreur dans callback initial:', err);
      }
    }
  }

  async function getTableName(tableId) {
    if (tableId in _schemas) {
      return _schemas[tableId].name || tableId;
    }
    console.warn('[GristAPI] getTableName: table', tableId, 'non trouvée en cache');
    return tableId;
  }

  async function getTableColumns(tableId) {
    if (tableId in _schemas) {
      return _schemas[tableId].columns || {};
    }
    console.warn('[GristAPI] getTableColumns: table', tableId, 'non trouvée en cache');
    return {};
  }

  async function getAllTables() {
    return Object.entries(_schemas).map(([id, schema]) => ({
      id,
      name: schema.name,
      columns: schema.columns || {},
    }));
  }

  return {
    init,
    getCurrentRecord,
    getCurrentTableId,
    onRecord,
    getTableName,
    getTableColumns,
    getAllTables,
  };
})();

console.log('[GristAPI] module initialisé et prêt');
