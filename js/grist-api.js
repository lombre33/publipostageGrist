// Publipostage Grist — wrapper API Grist v1.2.3 — 2026-09-04
// Détection fiable du « Select By » : linking.asTarget (officiel) + confirmation
// manuelle persistée via grist.setOption({ selectByConfirmed: true }), sans polling.
console.log('[GristAPI] module chargé, timestamp:', new Date().toISOString(), 'v1.2.3');

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

  // === Détection fiable du Select By (v1.2.3) ===
  //
  // Cause racine confirmée (cf. commit 8c4f7011 / v1.2.2) : la combinaison
  // `_selectByActiveByRecord || _selectByActiveByOptions` est cassée parce
  // que `_selectByActiveByRecord` passait à true dès le **premier** record
  // reçu via grist.onRecord — or Grist peut transmettre un record initial
  // même en l'absence de Select By configuré par l'utilisateur (widget
  // placé dans une vue rattachée à la table). Résultat : bandeau
  // d'avertissement JAMAIS affiché en mode lecture sans Select By.
  //
  // Nouveau contrat (v1.2.3) :
  //   1. _selectByActiveByOptions  = linking.asTarget != null  (signal officiel)
  //   2. _userSelectByOverride     = options.selectByConfirmed === true
  //                                  (repli robuste : confirmation manuelle
  //                                   de l'utilisateur, persistée via
  //                                   grist.setOption, ré-émise par Grist
  //                                   dans onOptions — pas de polling)
  //   3. _selectByActive = _selectByActiveByOptions || _userSelectByOverride
  //
  // On supprime totalement le signal "_selectByActiveByRecord" : le simple
  // fait qu'onRecord ait été appelé n'est plus une preuve de Select By.
  // _onRecordCount, _lastRecordRowId et _lastRecordAt sont conservés à
  // des fins de diagnostic console uniquement.
  let _selectByActive = false;                 // état public (lu par main.js)
  let _selectByActiveByOptions = false;         // signal officiel
  let _userSelectByOverride = false;            // signal de repli (utilisateur)
  let _onRecordCount = 0;                       // diagnostic
  let _lastRecordRowId = null;                  // diagnostic
  let _lastRecordAt = null;                     // diagnostic

  function recomputeSelectByActive(source) {
    const previous = _selectByActive;
    _selectByActive = _selectByActiveByOptions || _userSelectByOverride;
    console.log('[GristAPI] recomputeSelectByActive(' + source + '):',
      'byOptions(linking.asTarget)=' + _selectByActiveByOptions,
      'userOverride=' + _userSelectByOverride,
      '=> selectByActive=' + _selectByActive,
      previous !== _selectByActive ? '(CHANGEMENT)' : '(inchangé)');
    if (previous !== _selectByActive) {
      for (const cb of _onSelectByChangeCallbacks) {
        try { cb(_selectByActive, _currentOptions); }
        catch (e) { console.error('[GristAPI] erreur callback onSelectByChange:', e); }
      }
    }
  }

  // Met à jour les deux signaux (_selectByActiveByOptions + _userSelectByOverride)
  // à partir d'un objet `options` reçu de Grist (onOptions ou getOptions seed).
  // Affiche explicitement le contenu brut de `options.linking` pour permettre
  // à l'utilisateur de vérifier ce que Grist envoie réellement.
  function updateSelectByStateFromOptions(options, source) {
    _currentOptions = options || null;
    const linking = _currentOptions && _currentOptions.linking;
    const linkingJSON = safeJSONStringify(linking);
    const userConfirmed = !!( _currentOptions && _currentOptions.selectByConfirmed === true );
    _selectByActiveByOptions = hasActiveLinking(_currentOptions);
    _userSelectByOverride = userConfirmed;
    console.log('[GristAPI] ' + source + ': options.linking brut=', linking,
      '(JSON:', linkingJSON + ')',
      '=> selectByActiveByOptions=' + _selectByActiveByOptions);
    console.log('[GristAPI] ' + source + ': options.selectByConfirmed=',
      _currentOptions ? _currentOptions.selectByConfirmed : '(options absent)',
      '=> userSelectByOverride=' + _userSelectByOverride);
    recomputeSelectByActive(source);
  }

  async function init() {
    // Enregistrer onOptions AVANT ready() : Grist peut émettre l'état initial
    // immédiatement pendant le handshake déclenché par ready().
    try {
      grist.onOptions(function (options, settings) {
        console.log('[GristAPI] onOptions reçu: options (brut)=', options,
          'settings=', settings);
        updateSelectByStateFromOptions(options, 'onOptions reçu');
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
        console.log('[GristAPI] onRecord: ce callback n\'est PLUS utilisé pour basculer Select By actif (cause du bug v1.2.2).');
        if (!record) {
          console.warn('[GristAPI] onRecord: aucune ligne sélectionnée (record=null).');
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
    // l'objet options complet (linking + champs custom comme selectByConfirmed).
    try {
      if (typeof grist.getOptions === 'function') {
        const seedOptions = await grist.getOptions();
        console.log('[GristAPI] getOptions (seed) options brut=', seedOptions,
          'JSON=', safeJSONStringify(seedOptions));
        updateSelectByStateFromOptions(seedOptions || _currentOptions, 'getOptions (seed)');
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
      '(byOptions=' + _selectByActiveByOptions + ', userOverride=' + _userSelectByOverride + ').');
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

  // === Détection officielle du Select By via onOptions ===
  //
  // Source : code source officiel de https://docs.getgrist.com/grist-plugin-api.js
  // (CustomSectionAPI-ti.ts + grist-plugin-api.ts, bundle webpack inspecté).
  //
  //   - Le 2e paramètre de grist.onRecord(record, mappings) est un
  //     WidgetColumnMap = { [widgetCol]: "gristCol" | ["gristCol"] | null } :
  //     il porte UNIQUEMENT les correspondances de colonnes choisies par
  //     l'utilisateur via `grist.ready({columns:[...]})`. Il ne contient PAS
  //     de clé `tableId` et n'indique PAS la présence d'un Select By.
  //
  //   - Le signal officiel de linking « Select By » est envoyé par Grist dans
  //     le 1er paramètre de grist.onOptions(options, settings), où :
  //         options = InteractionOptions { accessLevel: string,
  //                                         linking?: LinkingInfo,
  //                                         ... + champs custom }
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
  // NOTE v1.2.3 : dans le contexte réel observé pour ce widget, Grist
  // expose `linking` comme `undefined` ou `{}` (cf. diagnostic logs). C'est
  // pourquoi un repli robuste `selectByConfirmed` est désormais exposé :
  // l'utilisateur peut cocher une case (créée dynamiquement par main.js)
  // qui appelle `grist.setOption({ selectByConfirmed: true })`. Grist
  // ré-émet cet objet via onOptions, ce qui remet `_selectByActive` à true
  // sans aucun polling.
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

  function getUserSelectByOverride() {
    return _userSelectByOverride;
  }

  // Repli robuste : persiste un booléen dans les options du widget via
  // grist.setOption. Grist ré-émettra l'objet options complet via onOptions,
  // ce qui recalculera `_selectByActive` automatiquement (pas de polling).
  async function setUserSelectByOverride(value) {
    const newValue = !!value;
    const previous = _userSelectByOverride;
    _userSelectByOverride = newValue; // maj optimiste pour UX instantanée
    console.log('[GristAPI] setUserSelectByOverride(', newValue, ') : maj optimiste appliquée (était', previous + ').');
    try {
      if (typeof grist.setOption === 'function') {
        const merged = Object.assign({}, _currentOptions || {}, { selectByConfirmed: newValue });
        await grist.setOption(merged);
        console.log('[GristAPI] setUserSelectByOverride: grist.setOption({ selectByConfirmed:', newValue, '}) appelé avec succès.');
      } else {
        console.warn('[GristAPI] setUserSelectByOverride: grist.setOption indisponible, la confirmation ne sera PAS persistée.');
      }
    } catch (e) {
      console.error('[GristAPI] setUserSelectByOverride: échec grist.setOption —', e);
    }
    recomputeSelectByActive('setUserSelectByOverride');
  }

  // Diagnostics exposés pour le débug (lecture seule)
  function _debugSelectBy() {
    return {
      active: _selectByActive,
      byOptions: _selectByActiveByOptions,
      userOverride: _userSelectByOverride,
      onRecordCount: _onRecordCount,
      lastRowId: _lastRecordRowId,
      lastRecordAt: _lastRecordAt ? _lastRecordAt.toISOString() : null,
      rawOptions: _currentOptions,
      rawLinking: _currentOptions && _currentOptions.linking
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

  return {
    init, refreshSchema, getTables, getColumns, getAllVariables,
    onRecord, onSelectByChange,
    getCurrentRecord, getCurrentTableId, getCurrentMappings, getCurrentOptions,
    isSelectByActive, getUserSelectByOverride, setUserSelectByOverride,
    detectTableId, findReferenceColumns, fetchRowById, detectCurrentContext,
    _debugSelectBy
  };
})();
