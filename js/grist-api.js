// Publipostage Grist — wrapper API Grist v1.2.2 — 2026-09-04
// Détection fiable du « Select By » basée sur onRecord (avec confirmation par onOptions)
console.log('[GristAPI] module chargé, timestamp:', new Date().toISOString(), 'v1.2.2');

const GristAPI = (function () {
  let _tables = [];
  let _columnsByTable = {};
  let _currentRecord = null;
  let _currentMappings = null;
  let _currentOptions = null;
  let _currentTableId = null;
  let _onRecordCallbacks = [];
  let _recordSubscriptionRegistered = false;
  let _onSelectByChangeCallbacks = [];

  // === Détection fiable du Select By (v1.2.2) ===
  //
  // Constat empirique : les tentatives précédentes s'appuyant uniquement sur
  // `grist.onOptions` + `options.linking.asTarget` échouent (commits 6d92213,
  // 93bf9ce, 3fa12c9). Dans la pratique, Grist envoie systématiquement
  // `linking = undefined` ou `linking = {}` à ce widget, ce qui force
  // `hasActiveLinking` à false en permanence, et le bandeau d'avertissement
  // reste donc collé en mode lecture.
  //
  // Nouveau contrat : on s'appuie en priorité sur le comportement RÉEL de
  // `grist.onRecord`, qui est lui-même la preuve que le widget est ciblé
  // par un Select By (l'API Grist n'envoie `onRecord` qu'aux widgets liés
  // comme cible). Le signal `linking.asTarget` est conservé comme
  // confirmation secondaire, mais combiné en OU : aucun signal seul ne
  // peut bloquer la détection.
  let _selectByActive = false;                 // état public (lu par main.js)
  let _selectByActiveByOptions = false;         // signal n°1 : linking.asTarget
  let _selectByActiveByRecord = false;          // signal n°2 : onRecord reçu
  let _onRecordCount = 0;                       // nombre d'appels onRecord
  let _lastRecordRowId = null;                  // dernier rowId reçu via onRecord
  let _lastRecordAt = null;                     // horodatage du dernier onRecord

  function recomputeSelectByActive(source) {
    const previous = _selectByActive;
    _selectByActive = _selectByActiveByRecord || _selectByActiveByOptions;
    console.log('[GristAPI] recomputeSelectByActive(' + source + '):',
      'byRecord=' + _selectByActiveByRecord,
      '(count=' + _onRecordCount + ', lastRowId=' + (_lastRecordRowId == null ? '—' : _lastRecordRowId) + ')',
      'byOptions=' + _selectByActiveByOptions,
      '=> selectByActive=' + _selectByActive,
      previous !== _selectByActive ? '(CHANGEMENT)' : '(inchangé)');
    if (previous !== _selectByActive) {
      for (const cb of _onSelectByChangeCallbacks) {
        try { cb(_selectByActive, _currentOptions); }
        catch (e) { console.error('[GristAPI] erreur callback onSelectByChange:', e); }
      }
    }
  }

  function updateSelectByStateFromOptions(options, source) {
    _currentOptions = options || null;
    const linking = _currentOptions && _currentOptions.linking;
    _selectByActiveByOptions = hasActiveLinking(_currentOptions);
    console.log('[GristAPI] ' + source + ': options.linking brut=',
      linking, 'selectByActiveByOptions=', _selectByActiveByOptions);
    recomputeSelectByActive(source);
  }

  async function init() {
    // Enregistrer onOptions AVANT ready(): Grist peut émettre l'état initial
    // immédiatement pendant le handshake déclenché par ready().
    try {
      grist.onOptions(function (options, settings) {
        updateSelectByStateFromOptions(options, 'onOptions reçu');
        console.log('[GristAPI] onOptions settings=', settings);
      });
      console.log('[GristAPI] grist.onOptions enregistré AVANT grist.ready().');
    } catch (e) {
      console.warn('[GristAPI] grist.onOptions non disponible:', e);
    }

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
        _onRecordCount += 1;
        _lastRecordAt = receivedAt;
        const previousRowId = _lastRecordRowId;
        _lastRecordRowId = rowId;
        console.log('[GristAPI] onRecord reçu #' + _onRecordCount + ':',
          { rowId, prevRowId: previousRowId, changed: previousRowId !== rowId,
            receivedAt: receivedAt.toISOString(),
            record, mappings: mappings || null,
            mappingsJSON: safeJSONStringify(mappings) });

        // === Signal empirique : onRecord reçu = Select By actif ===
        // D'après le contrat de l'API Grist, onRecord n'est invoqué que sur
        // les widgets liés comme cible d'un Select By. Un seul appel suffit
        // donc à prouver que le Select By est actif. On conserve aussi la
        // trace du rowId pour permettre, plus tard, de détecter les
        // changements de ligne réels côté UI.
        if (record) {
          if (!_selectByActiveByRecord) {
            _selectByActiveByRecord = true;
            console.log('[GristAPI] onRecord: premier record reçu => Select By confirmé actif.');
          }
          recomputeSelectByActive('onRecord(premier record)');
        } else {
          console.warn('[GristAPI] onRecord: aucune ligne sélectionnée (record=null). Select By reste dans son état précédent.');
        }

        updateRowDebug(rowId, receivedAt, previousRowId);
        _currentRecord = record;
        _currentMappings = mappings || null;

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

    // Seed immédiat: en mode édition plein accès, getOptions() renvoie déjà
    // l'objet InteractionOptions { accessLevel, linking: { asTarget, asSource } }.
    try {
      if (typeof grist.getOptions === 'function') {
        const seedOptions = await grist.getOptions();
        updateSelectByStateFromOptions(seedOptions || _currentOptions, 'getOptions (seed)');
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
    console.log('[GristAPI] init terminé. État final Select By =', _selectByActive,
      '(byRecord=' + _selectByActiveByRecord + ', byOptions=' + _selectByActiveByOptions + ').');
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

  function updateRowDebug(rowId, receivedAt, prevRowId) {
    let debug = document.getElementById('debug-rowid');
    if (!debug) {
      debug = document.createElement('div');
      debug.id = 'debug-rowid';
      debug.style.cssText = 'font-size:11px;color:#777;margin:4px 0;text-align:right;';
      (document.getElementById('app') || document.body).appendChild(debug);
    }
    const arrow = (prevRowId != null && prevRowId !== rowId) ? ' (← ' + prevRowId + ')' : '';
    debug.textContent = 'Ligne courante: ' + (rowId == null ? '—' : rowId)
      + arrow
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
  function onSelectByChange(cb) {
    if (typeof cb !== 'function') return;
    _onSelectByChangeCallbacks.push(cb);
    console.log('[GristAPI] onSelectByChange: abonné ajouté. total=', _onSelectByChangeCallbacks.length);
  }

  // === Détection complémentaire du Select By via onOptions ===
  //
  // Source : code source officiel de https://docs.getgrist.com/grist-plugin-api.js
  // (CustomSectionAPI-ti.ts + grist-plugin-api.ts, bundle webpack inspecté).
  //
  //   - Le 2e paramètre de grist.onRecord(record, mappings) est un
  //     WidgetColumnMap = { [widgetCol]: "gristCol" | ["gristCol"] | null } :
  //     il porte UNIQUEMENT les correspondances de colonnes choisies par
  //     l'utilisateur via `grist.ready({columns:[...]})`. Il ne contient PAS
  //     de clé `tableId`.
  //
  //   - Le signal officiel de linking « Select By » est envoyé par Grist dans
  //     le 1er paramètre de grist.onOptions(options, settings), où :
  //         options = InteractionOptions { accessLevel: string, linking?: LinkingInfo }
  //         linking = { asTarget: LinkType|null, asSource: boolean }
  //         LinkType ∈ { "Cursor:Same-Table", "Cursor:Reference",
  //                      "Filter:Summary-Group", "Filter:Col->Col",
  //                      "Filter:Row->Col", "Summary",
  //                      "Show-Referenced-Records", "Error:Invalid" }
  //
  //   - asTarget non nul = le widget EST la cible d'un Select By configuré
  //     par l'utilisateur ; asTarget === null signifie explicitement
  //     "aucun Select By".
  //
  // NOTE v1.2.2 : ce signal n'est PLUS utilisé seul (il est resté à false
  // dans toutes les sessions réelles, cf. commits 6d92213/93bf9ce/3fa12c9).
  // Il sert désormais de confirmation OR avec le signal onRecord.
  function hasActiveLinking(options) {
    const linking = options && options.linking;
    return !!(linking && linking.asTarget != null);
  }

  function safeJSONStringify(value) {
    try { return JSON.stringify(value); }
    catch (e) { return '[unserializable: ' + e.message + ']'; }
  }

  function isSelectByActive() {
    return _selectByActive;
  }

  // Diagnostics exposés pour le débug (lecture seule)
  function _debugSelectBy() {
    return {
      active: _selectByActive,
      byRecord: _selectByActiveByRecord,
      byOptions: _selectByActiveByOptions,
      onRecordCount: _onRecordCount,
      lastRowId: _lastRecordRowId,
      lastRecordAt: _lastRecordAt ? _lastRecordAt.toISOString() : null
    };
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

  async function detectCurrentContext() {
    if (!_currentRecord) {
      console.warn('[GristAPI] detectCurrentContext: pas de record courant.');
      return null;
    }
    if (!_currentTableId) _currentTableId = await detectTableId(_currentMappings, 'detectCurrentContext');
    if (!_currentTableId) return null;
    return { tableId: _currentTableId, record: _currentRecord, mappings: _currentMappings };
  }

  return { init, refreshSchema, getTables, getColumns, getAllVariables, onRecord, onSelectByChange, getCurrentRecord, getCurrentTableId, getCurrentMappings, getCurrentOptions, isSelectByActive, detectTableId, findReferenceColumns, fetchRowById, detectCurrentContext, _debugSelectBy };
})();
