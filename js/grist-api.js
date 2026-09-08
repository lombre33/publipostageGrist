// Publipostage Grist — wrapper API Grist v1.2.0 — 2026-09-04
console.log('[GristAPI] module chargé, timestamp:', new Date().toISOString(), 'v1.2.0');

const GristAPI = (function () {
  let _tables = [];
  let _columnsByTable = {};
  let _currentRecord = null;
  let _currentMappings = null;
  let _currentOptions = null;
  let _currentTableId = null;
  let _onRecordCallbacks = [];
  let _recordSubscriptionRegistered = false;
  let _tokenCache = null;

  async function init() {
    console.log('[GristAPI] init: appel de grist.ready({requiredAccess: "full"}).');
    try {
      grist.ready({
        requiredAccess: 'full',
        // Fait apparaître une section de mappage dans le panneau de droite
        // (mode configuration du widget) pour que l'utilisateur choisisse LA
        // colonne Pièce Jointe de sa propre table où enregistrer le PDF
        // exporté (bouton dédié, cf. main.js:onSaveToAttachment) - optionnel :
        // le widget fonctionne normalement si rien n'est mappé, le bouton
        // signale juste qu'aucune colonne n'est configurée.
        columns: [
          { name: 'pdfAttachment', title: 'Colonne PJ pour le PDF exporté', type: 'Attachments', optional: true }
        ]
      });
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
        console.log('[GristAPI] onRecord reçu:', { rowId, receivedAt: receivedAt.toISOString(), record, mappings: mappings || null, mappingsJSON: safeJSONStringify(mappings) });
        updateRowDebug(rowId, receivedAt);
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

    try {
      grist.onOptions(function (options, settings) {
        _currentOptions = options || null;
        console.log('[GristAPI] onOptions reçu: optionsJSON=', safeJSONStringify(options), 'settings=', settings);
      });
      console.log('[GristAPI] grist.onOptions enregistré.');
    } catch (e) {
      console.warn('[GristAPI] onOptions non disponible:', e);
    }

    // Seed immédiat: en mode édition plein accès, getOptions() renvoie déjà
    // l'objet InteractionOptions { accessLevel, linking: { asTarget, asSource } }.
    try {
      if (typeof grist.getOptions === 'function') {
        const seedOptions = await grist.getOptions();
        _currentOptions = seedOptions || _currentOptions;
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

  function updateRowDebug(rowId, receivedAt) {
    let debug = document.getElementById('debug-rowid');
    if (!debug) {
      debug = document.createElement('div');
      debug.id = 'debug-rowid';
      debug.style.cssText = 'font-size:11px;color:#777;margin:4px 0;text-align:right;';
      (document.getElementById('app') || document.body).appendChild(debug);
    }
    debug.textContent = 'Ligne courante: ' + (rowId == null ? '—' : rowId)
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

  function safeJSONStringify(value) {
    try { return JSON.stringify(value); }
    catch (e) { return '[unserializable: ' + e.message + ']'; }
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

  // Sur certaines instances Grist auto-hébergées (APP_HOME_URL mal configuré côté
  // serveur), getAccessToken() renvoie un baseUrl avec un host interne injoignable
  // depuis le navigateur (ex. 0.0.0.0). On le corrige en réutilisant l'origine de
  // document.referrer (celle de la page Grist qui embarque ce widget en iframe),
  // seul indice disponible côté client sans configuration serveur supplémentaire.
  function fixBaseUrl(baseUrl) {
    try {
      const url = new URL(baseUrl);
      if (['0.0.0.0', 'localhost', '127.0.0.1'].includes(url.hostname) && document.referrer) {
        const ref = new URL(document.referrer);
        url.protocol = ref.protocol;
        url.hostname = ref.hostname;
        url.port = ref.port;
        return url.toString().replace(/\/$/, '');
      }
    } catch (e) {
      console.warn('[GristAPI] fixBaseUrl: impossible d’analyser', baseUrl, e);
    }
    return baseUrl;
  }

  // Jeton d'accès court terme (quelques minutes) réutilisé pour les appels REST
  // d'upload/téléchargement de pièces jointes, avec marge de sécurité avant expiration.
  async function getAccessTokenCached() {
    const now = Date.now();
    if (_tokenCache && _tokenCache.expiresAt - now > 15000) return _tokenCache;
    const info = await grist.docApi.getAccessToken({ readOnly: false });
    const baseUrl = fixBaseUrl(info.baseUrl);
    if (baseUrl !== info.baseUrl) console.warn('[GristAPI] baseUrl corrigé:', info.baseUrl, '->', baseUrl);
    _tokenCache = { token: info.token, baseUrl, expiresAt: now + (info.ttlMsecs || 120000) };
    return _tokenCache;
  }

  // Récupère les id de pièces jointes déjà connus, pour pouvoir repérer la
  // nouvelle après upload (cf. uploadAttachment).
  async function knownAttachmentIds() {
    try {
      const data = await grist.docApi.fetchTable('_grist_Attachments');
      return new Set(data && data.id ? data.id : []);
    } catch (e) {
      console.warn('[GristAPI] lecture _grist_Attachments impossible:', e);
      return new Set();
    }
  }

  // Certaines instances Grist auto-hébergées n'envoient pas d'en-têtes CORS sur
  // l'endpoint POST /attachments pour l'origine du widget, même si le domaine est
  // parfaitement valide et joignable (contrairement au cas "baseUrl cassé" traité
  // par fixBaseUrl) : le navigateur lève alors une NetworkError et bloque
  // totalement la requête en mode 'cors' normal. On repère la pièce jointe
  // nouvellement créée en comparant les id de _grist_Attachments avant/après,
  // celle-ci étant lue via le pont RPC du plugin (grist.docApi.fetchTable), qui
  // n'est jamais soumis à CORS puisqu'il ne passe pas par un fetch réseau direct.
  async function findNewAttachmentId(beforeIds, fileName) {
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 400));
      try {
        const data = await grist.docApi.fetchTable('_grist_Attachments');
        if (!data || !data.id) continue;
        const candidates = [];
        for (let i = 0; i < data.id.length; i++) {
          if (!beforeIds.has(data.id[i])) candidates.push({ id: data.id[i], fileName: data.fileName ? data.fileName[i] : '' });
        }
        if (!candidates.length) continue;
        const exactMatch = candidates.filter(c => c.fileName === fileName);
        const pool = exactMatch.length ? exactMatch : candidates;
        return pool.reduce((max, c) => (c.id > max.id ? c : max), pool[0]).id;
      } catch (e) {
        console.warn('[GristAPI] findNewAttachmentId: échec de lecture', e);
      }
    }
    return null;
  }

  async function uploadAttachment(file) {
    if (!file) throw new Error('Fichier manquant pour l’upload.');
    const info = await getAccessTokenCached();
    const formData = new FormData();
    formData.append('upload', file, file.name || 'image');
    const url = `${info.baseUrl}/attachments?auth=${info.token}`;
    const beforeIds = await knownAttachmentIds();
    try {
      // mode: 'no-cors' — le navigateur envoie quand même la requête (l'upload a
      // bien lieu côté serveur) mais la réponse devient opaque : impossible d'y
      // lire l'identifiant créé, d'où la recherche via findNewAttachmentId ensuite.
      await fetch(url, { method: 'POST', mode: 'no-cors', body: formData });
    } catch (e) {
      throw new Error('Échec réseau vers ' + info.baseUrl + '/attachments (' + e.message + ')');
    }
    const id = await findNewAttachmentId(beforeIds, file.name || 'image');
    if (!id) throw new Error('Upload envoyé mais la pièce jointe n’a pas pu être confirmée dans le document (vérifiez si elle y apparaît malgré tout).');
    return id;
  }

  async function getAttachmentDownloadUrl(attachmentId) {
    if (!attachmentId) return '';
    const info = await getAccessTokenCached();
    return `${info.baseUrl}/attachments/${attachmentId}/download?auth=${info.token}`;
  }

  // Colonne Pièce Jointe (table de l'utilisateur) choisie via le panneau de
  // mappage de droite - cf. columns: [...] dans grist.ready() plus haut.
  function getPdfAttachmentColumnId() {
    return _currentMappings && _currentMappings.pdfAttachment ? _currentMappings.pdfAttachment : null;
  }

  // Enregistre un PDF déjà généré (Blob) dans la colonne mappée, sur la ligne
  // actuellement sélectionnée. ['L', attachmentId] REMPLACE la liste de
  // pièces jointes de la cellule (pas d'ajout) : une seule pièce jointe pour
  // ce widget dans cette colonne, toujours la plus récemment exportée -
  // l'ancienne devient orpheline et Grist la purge de lui-même.
  async function saveAttachmentToMappedColumn(blob, filename) {
    const colId = getPdfAttachmentColumnId();
    if (!colId) throw new Error('Aucune colonne Pièce Jointe n’est mappée pour le PDF (panneau de configuration du widget, à droite).');
    if (!_currentRecord || _currentRecord.id == null) throw new Error('Aucune ligne sélectionnée.');
    const tableId = _currentTableId;
    if (!tableId) throw new Error('Table du document introuvable.');
    const file = new File([blob], filename, { type: 'application/pdf' });
    const attachmentId = await uploadAttachment(file);
    await grist.docApi.applyUserActions([
      ['UpdateRecord', tableId, _currentRecord.id, { [colId]: ['L', attachmentId] }]
    ]);
    return attachmentId;
  }

  // Rafraîchit le src des images de pièces jointes dans un DOM donné : le jeton d'accès
  // expire après quelques minutes, donc le src ne doit jamais être conservé tel quel
  // dans le HTML enregistré — seul data-attachment-id est persistant.
  async function hydrateAttachmentImages(root) {
    if (!root || !root.querySelectorAll) return;
    const images = Array.from(root.querySelectorAll('img.editor-image[data-source="attachment"][data-attachment-id]'));
    await Promise.all(images.map(async img => {
      const id = img.dataset.attachmentId;
      if (!id) return;
      try { img.src = await getAttachmentDownloadUrl(id); }
      catch (e) { console.warn('[GristAPI] hydrateAttachmentImages: échec pour', id, e); }
    }));
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

  return { init, refreshSchema, getTables, getColumns, getAllVariables, onRecord, getCurrentRecord, getCurrentTableId, getCurrentMappings, getCurrentOptions, detectTableId, findReferenceColumns, fetchRowById, detectCurrentContext, uploadAttachment, getAttachmentDownloadUrl, hydrateAttachmentImages, getPdfAttachmentColumnId, saveAttachmentToMappedColumn };
})();
