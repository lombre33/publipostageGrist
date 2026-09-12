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
  state.rows.Publipostage_Modeles = columnarEmpty(['Nom', 'Contenu', 'NomFichierPDF', 'HeaderFooter']);
  state.rows.Publipostage_LiensTables = columnarEmpty(['TableCible', 'Mode', 'ColonneCible', 'ColonneSource']);
  state.rows.Publipostage_UserProbe = columnarEmpty(['Email']);
  state.rows._grist_Tables = columnarEmpty(['tableId']);
  state.rows._grist_Tables_column = columnarEmpty(['parentId', 'colId', 'type']);

  const INTERNAL_TABLES = ['Publipostage_Modeles', 'Publipostage_LiensTables', 'Publipostage_UserProbe', '_grist_Tables', '_grist_Tables_column'];

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

  async function applyUserActions(actions) {
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
          table[k][table.id.length - 1] = fields[k];
        });
        retValues.push(newId);
      } else if (type === 'UpdateRecord') {
        const rowId = action[2];
        const fields = action[3] || {};
        const table = state.rows[tableId];
        if (table) {
          const idx = table.id.indexOf(rowId);
          if (idx !== -1) Object.keys(fields).forEach(k => { if (!table[k]) table[k] = table.id.map(() => null); table[k][idx] = fields[k]; });
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
        retValues.push({ colId: action[2] });
      } else {
        retValues.push(null);
      }
    });
    return { retValues };
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

  window.__gristStub = { state, setVariables, setRows, fireRecord, applyUserActions };
})();
