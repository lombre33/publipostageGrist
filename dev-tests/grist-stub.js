// Stub minimal de window.grist pour tester l'éditeur/export PDF HORS Grist
// (cf. dev-tests/README.md - même principe déjà éprouvé de nombreuses fois en
// séance sous forme de fichiers jetables, ici rendu permanent et réutilisable).
// Remplace le <script src="https://docs.getgrist.com/grist-plugin-api.js">
// dans _test-harness.html (généré depuis index.html, cf.
// generate-harness.sh) - js/grist-api.js lui-même n'est PAS modifié, il tourne
// tel quel contre ce stub, exactement comme il tournerait contre le vrai
// window.grist fourni par Grist.
//
// Portée volontairement limitée au nécessaire pour que main.js:init() se
// termine sans lever d'exception (cf. audit du flux de démarrage) - donne un
// éditeur vide, sans modèle, sans règle de correspondance, sans variable
// disponible. Les tests qui ont besoin de variables spécifiques peuvent
// appeler `window.__gristStub.setVariables([...])` puis relancer
// GristAPI.refreshSchema() eux-mêmes (aucun besoin de rebooter tout le
// harnais pour ça).
(function () {
  const state = {
    tables: [], // liste de tableId (hors tables internes, jamais mentionnées ici)
    columns: {}, // { tableId: { colId: type } }
    rows: {}, // { tableId: { id: [...], col: [...] } } forme columnaire Grist
    recordCallback: null,
    nextRowId: { Publipostage_Modeles: 1, Publipostage_LiensTables: 1, Publipostage_UserProbe: 1 },
  };

  function columnarEmpty(cols) {
    const obj = { id: [] };
    cols.forEach(c => { obj[c] = []; });
    return obj;
  }

  // Tables internes de bookkeeping (mêmes noms que js/grist-api.js/js/templates.js) -
  // pré-remplies VIDES pour éviter tout AddTable au démarrage (simplifie le
  // stub : pas besoin d'implémenter réellement applyUserActions pour AddTable
  // au 1er chargement, seulement pour les actions déclenchées PENDANT un
  // test, cf. applyUserActions ci-dessous qui gère quand même AddTable/
  // AddRecord/UpdateRecord/RemoveRecord au cas où un test les exercerait).
  // DateModif/Margins/EstParDefaut sont déclarées ICI plutôt que laissées apparaître au 1er
  // UpdateRecord : `ensureMarginsColumn()`/`ensureDefaultColumn()` testent `'Margins' in data`, et une
  // table à qui ces clés manquent envoie le code sur un chemin de migration qu'un vrai document Grist
  // déjà à jour ne prend jamais.
  state.rows.Publipostage_Modeles = columnarEmpty(['Nom', 'Contenu', 'NomFichierPDF', 'HeaderFooter', 'DateModif', 'Margins', 'EstParDefaut']);
  state.rows.Publipostage_LiensTables = columnarEmpty(['TableCible', 'Mode', 'ColonneCible', 'ColonneSource']);
  state.rows.Publipostage_UserProbe = columnarEmpty(['Email']);
  state.rows.Publipostage_Commentaires = columnarEmpty(['ModeleId', 'CommentId', 'Auteur', 'Texte', 'CreeLe']);
  state.rows._grist_Tables = columnarEmpty(['tableId']);
  state.rows._grist_Tables_column = columnarEmpty(['parentId', 'colId', 'type']);

  const INTERNAL_TABLES = ['Publipostage_Modeles', 'Publipostage_LiensTables', 'Publipostage_UserProbe', 'Publipostage_Commentaires', '_grist_Tables', '_grist_Tables_column'];

  // Grist représente en réalité un DateTime comme un timestamp Unix NUMÉRIQUE (secondes depuis
  // l'epoch, cf. documentation/grist-data-format.md du projet grist-core) - jamais la chaîne ISO que
  // ce widget envoie côté client (cf. js/templates.js:save, `new Date().toISOString()`). Un stub qui
  // se contentait de stocker cette chaîne telle quelle (passthrough intégral, sans coercion d'aucune
  // sorte) ne pouvait STRUCTURELLEMENT jamais faire apparaître un écart de représentation entre
  // l'écriture et une relecture ultérieure - ce qui a rendu invisible un vrai bug de production
  // (bandeau "modifié ailleurs" affiché à un utilisateur seul sur son document, cf. js/main.js
  // autosaveTick). Spécifique à Publipostage_Modeles.DateModif : les colonnes de ce fichier sont
  // pré-déclarées à la main plutôt que passer par setVariables, pas besoin d'un système de type
  // général pour corriger ce point précis.
  function coerceDateModif(value) {
    if (value == null) return value;
    if (typeof value === 'number') return value; // déjà à la forme Grist (ex. déjà coercée par un appel précédent)
    const ms = new Date(value).getTime();
    if (Number.isNaN(ms)) return value; // non parseable : passthrough, comme une vraie colonne Grist recevrait une valeur "mismatch"
    return Math.floor(ms / 1000); // secondes entières depuis l'epoch, jamais des millisecondes (cf. doc citée ci-dessus)
  }

  function setVariables(tableId, columns) {
    // columns: { colId: type } (ex: {Nom:'Text', Logo:'Attachments', Client:'Ref:Clients'})
    if (state.tables.indexOf(tableId) === -1) state.tables.push(tableId);
    state.columns[tableId] = columns;
    if (!state.rows[tableId]) state.rows[tableId] = columnarEmpty(Object.keys(columns));
    // Peuple _grist_Tables/_grist_Tables_column pour que getColumnType() fonctionne
    // (refreshColumnTypes, cf. js/grist-api.js) - un seul appel idempotent suffit,
    // reconstruit tout à chaque fois à partir de state.tables/columns.
    const gt = columnarEmpty(['tableId']);
    const gtc = columnarEmpty(['parentId', 'colId', 'type']);
    let rowId = 1;
    state.tables.forEach((t, tIdx) => {
      gt.id.push(tIdx + 1); gt.tableId.push(t);
      Object.keys(state.columns[t] || {}).forEach(colId => {
        gtc.id.push(rowId++); gtc.parentId.push(tIdx + 1); gtc.colId.push(colId); gtc.type.push(state.columns[t][colId]);
      });
    });
    state.rows._grist_Tables = gt;
    state.rows._grist_Tables_column = gtc;
  }

  function setRows(tableId, rows) {
    // rows: array of plain objects {id, ...cols} -> convertit en forme columnaire.
    const cols = Object.keys(state.columns[tableId] || {});
    const out = columnarEmpty(cols);
    rows.forEach(r => {
      out.id.push(r.id);
      cols.forEach(c => out[c].push(r[c] !== undefined ? r[c] : null));
    });
    state.rows[tableId] = out;
  }

  function fireRecord(record, tableId) {
    if (state.recordCallback) state.recordCallback(record, { tableId });
  }

  // Journal de TOUTES les écritures passées par ce client. Certaines promesses ne se vérifient que
  // comme ça : "annuler un fil de commentaire jamais publié n'écrit AUCUNE ligne" a exactement le
  // même état final que "le fil a été écrit puis supprimé" - seul le compte des écritures réelles
  // distingue les deux.
  state.actionLog = [];
  function getActionLog() { return state.actionLog.slice(); }
  function clearActionLog() { state.actionLog = []; }
  // Compte les actions d'un type sur une table (ex: countActions('UpdateRecord', 'Publipostage_Modeles')).
  function countActions(type, tableId) {
    return state.actionLog.filter(a => a[0] === type && (!tableId || a[1] === tableId)).length;
  }
  async function applyUserActions(actions) {
    actions.forEach(a => state.actionLog.push(a));
    const retValues = [];
    actions.forEach(action => {
      const [type, tableId] = action;
      if (type === 'AddTable') {
        const cols = action[2] || [];
        if (state.tables.indexOf(tableId) === -1 && INTERNAL_TABLES.indexOf(tableId) === -1) state.tables.push(tableId);
        if (!state.rows[tableId]) state.rows[tableId] = columnarEmpty(cols.map(c => c.id));
        retValues.push({ tableId });
      } else if (type === 'AddRecord' || type === 'BulkAddRecord') {
        const fields = action[3] || {};
        const table = state.rows[tableId] || (state.rows[tableId] = columnarEmpty(Object.keys(fields)));
        const newId = (state.nextRowId[tableId] = (state.nextRowId[tableId] || 1));
        state.nextRowId[tableId]++;
        table.id.push(newId);
        Object.keys(fields).forEach(k => {
          if (!table[k]) table[k] = table.id.map(() => null);
          table[k][table.id.length - 1] = (tableId === 'Publipostage_Modeles' && k === 'DateModif') ? coerceDateModif(fields[k]) : fields[k];
        });
        retValues.push(newId);
      } else if (type === 'UpdateRecord') {
        const rowId = action[2];
        const fields = action[3] || {};
        const table = state.rows[tableId];
        if (table) {
          const idx = table.id.indexOf(rowId);
          if (idx !== -1) Object.keys(fields).forEach(k => {
            if (!table[k]) table[k] = table.id.map(() => null);
            table[k][idx] = (tableId === 'Publipostage_Modeles' && k === 'DateModif') ? coerceDateModif(fields[k]) : fields[k];
          });
        }
        retValues.push(null);
      } else if (type === 'RemoveRecord' || type === 'BulkRemoveRecord') {
        const rowId = action[2];
        const table = state.rows[tableId];
        if (table) {
          const ids = Array.isArray(rowId) ? rowId : [rowId];
          ids.forEach(id => {
            const idx = table.id.indexOf(id);
            if (idx !== -1) { table.id.splice(idx, 1); Object.keys(table).forEach(k => { if (k !== 'id') table[k].splice(idx, 1); }); }
          });
        }
        retValues.push(null);
      } else if (type === 'AddVisibleColumn' || type === 'AddColumn') {
        // Ajoute VRAIMENT la colonne à la table (valeur null pour les lignes existantes) - avant ceci, cette action ne faisait que renvoyer un retValue
        // sans toucher `state.rows`, ce qui masquait un vrai bug (colonne DateModif jamais migrée sur un document existant, cf. js/templates.js
        // ensureDateModifColumn) : le stub se comportait comme si TOUTE colonne migrée existait déjà depuis toujours, puisque les tables internes
        // ci-dessus la déclarent dès l'init. Un scénario qui veut tester un chemin de migration doit RETIRER la colonne de `state.rows` avant de jouer
        // l'action qui la lit/l'écrit (cf. dev-tests/scenarios-autosave.js:autosave_date_modif_column_migrated_on_existing_document).
        const colId = action[2];
        const table = state.rows[tableId];
        if (table && !(colId in table)) table[colId] = table.id.map(() => null);
        retValues.push({ colId });
      } else {
        retValues.push(null);
      }
    });
    return { retValues };
  }

  // Simule l'écriture d'un AUTRE utilisateur/onglet directement dans les données (pas d'action journalisée : ce
  // n'est pas une action de CE client) - utilisé par les scénarios de conflit d'auto-save pour changer le
  // DateModif d'un modèle "sous les pieds" du client testé, sans passer par applyUserActions.
  function remoteWrite(tableId, rowId, fields) {
    const table = state.rows[tableId];
    if (!table) return;
    const idx = table.id.indexOf(rowId);
    if (idx === -1) return;
    Object.keys(fields).forEach(k => {
      if (!table[k]) table[k] = table.id.map(() => null);
      table[k][idx] = (tableId === 'Publipostage_Modeles' && k === 'DateModif') ? coerceDateModif(fields[k]) : fields[k];
    });
  }

  // Retire une colonne d'une table - simule un document EXISTANT créé avant qu'une colonne donnée n'existe (ex. DateModif avant l'auto-save), pour tester
  // le chemin de migration (ensureXColumn dans js/templates.js) plutôt que le cas "document déjà à jour" que l'init de ce stub représente par défaut.
  function dropColumn(tableId, colId) {
    const table = state.rows[tableId];
    if (table) delete table[colId];
  }

  // Relit une ligne sous forme d'objet plain (pas la forme columnaire de fetchTable) - pratique pour asserter
  // l'état final d'un test sans reconvertir soi-même.
  function getRow(tableId, rowId) {
    const table = state.rows[tableId];
    if (!table) return null;
    const idx = table.id.indexOf(rowId);
    if (idx === -1) return null;
    const row = { id: rowId };
    Object.keys(table).forEach(k => { if (k !== 'id') row[k] = table[k][idx]; });
    return row;
  }

  window.grist = {
    ready: function () { /* no-op, cf. GristAPI.init() */ },
    onRecord: function (cb) { state.recordCallback = cb; },
    onOptions: function () { /* no-op */ },
    getOptions: async function () { return { accessLevel: 'full', linking: {} }; },
    docApi: {
      listTables: async function () { return state.tables.slice(); },
      fetchTable: async function (tableId) {
        return state.rows[tableId] ? JSON.parse(JSON.stringify(state.rows[tableId])) : columnarEmpty([]);
      },
      applyUserActions: applyUserActions,
      getAccessToken: async function () { return { token: 'stub-token', baseUrl: 'http://localhost/api/docs/stub' }; },
    },
  };

  window.__gristStub = { state, setVariables, setRows, fireRecord, applyUserActions, getActionLog, clearActionLog, countActions, remoteWrite, getRow, dropColumn };
})();
