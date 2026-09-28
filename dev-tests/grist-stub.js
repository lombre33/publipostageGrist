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
    // Les 4 tables internes pré-remplies plus bas (Publipostage_Modeles/LiensTables/UserProbe/
    // Commentaires) DOIVENT apparaître ici dès le départ, pas seulement dans state.rows : sans ça,
    // grist.docApi.listTables() ne les rapporte jamais comme existantes, et Templates.ensureTableExists()
    // (js/templates.js) reprend donc la branche AddTable à CHAQUE appel (loadAll/save/setDefault, et une
    // deuxième fois depuis l'intérieur de chacun des 6 ensureXxxColumn) au lieu de s'arrêter au tout
    // premier `if (tables.includes(TABLE_NAME)) return`, comme sur le document déjà migré d'Antoine.
    // Régression trouvée le 2026-09-28 en creusant "l'enregistrement ne fonctionne pas" (mémoire
    // project-publipostage-stub-listtables-vs-preseeded-tables) : ce décalage masquait totalement, dans
    // toute la suite dev-tests/, le VRAI volume d'appels AddTable/ensureTableExists qu'un Enregistrer ou
    // un tick d'auto-save déclenche en pratique.
    tables: ['Publipostage_Modeles', 'Publipostage_LiensTables', 'Publipostage_UserProbe', 'Publipostage_Commentaires'],
    columns: {}, // { tableId: { colId: type } }
    choices: {}, // { tableId: { colId: string[] } } - colonnes Choice/ChoiceList (widgetOptions.choices, cf. setVariables)
    rows: {}, // { tableId: { id: [...], col: [...] } } forme columnaire Grist
    recordCallback: null,
    recordIncludeColumns: 'shown', // 2e argument de grist.onRecord (cf. window.grist.onRecord ci-dessous)
    // { tableId: [colId, ...] } - colonnes PAS cochées dans le panneau de droite DE CE WIDGET, pour ce
    // tableId (cf. setHiddenColumns). Vide par défaut = toutes les colonnes "montrées", pour ne rien
    // changer aux tests existants qui ne s'en soucient pas - un test qui veut vérifier le comportement
    // includeColumns:'shown' (vérifié à la source grist-core, GristAPI.ts/WidgetFrame.ts - cf. mémoire
    // d'équipe project-publipostage-macro-condition-columntype-fix) doit le déclarer explicitement.
    hiddenColumnsByTable: {},
    nextRowId: { Publipostage_Modeles: 1, Publipostage_LiensTables: 1, Publipostage_UserProbe: 1 },
    // Niveau d'accès RÉELLEMENT accordé au widget (settings.accessLevel de onOptions côté grist-core,
    // JAMAIS ce que grist.getOptions() renvoie - WidgetAPI.getOptions() est les options JSON PROPRES au
    // widget, pas InteractionOptions, vérifié à la source le 2026-09-28). 'full' par défaut pour ne rien
    // changer aux tests existants (dont ceux qui dépendent déjà de includeColumns:'normal') - un test qui
    // veut simuler un accès limité doit appeler setAccessLevel explicitement.
    accessLevel: 'full',
    optionsCallback: null,
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
  state.rows._grist_Tables_column = columnarEmpty(['parentId', 'colId', 'type', 'widgetOptions']);

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

  function setVariables(tableId, columns, choicesByCol) {
    // columns: { colId: type } (ex: {Nom:'Text', Logo:'Attachments', Client:'Ref:Clients'})
    // choicesByCol (optionnel) : { colId: string[] } pour une colonne Choice/ChoiceList - même clé "choices" que le vrai widgetOptions JSON de Grist
    // (grist-core ChoiceTextBox.ts: this.options.prop("choices")), vérifié à la source le 2026-09-28.
    if (state.tables.indexOf(tableId) === -1) state.tables.push(tableId);
    state.columns[tableId] = columns;
    if (!state.rows[tableId]) state.rows[tableId] = columnarEmpty(Object.keys(columns));
    if (choicesByCol) state.choices[tableId] = Object.assign({}, state.choices[tableId], choicesByCol);
    // Peuple _grist_Tables/_grist_Tables_column pour que getColumnType()/getColumnChoices() fonctionnent
    // (refreshColumnTypes, cf. js/grist-api.js) - un seul appel idempotent suffit,
    // reconstruit tout à chaque fois à partir de state.tables/columns/choices.
    const gt = columnarEmpty(['tableId']);
    const gtc = columnarEmpty(['parentId', 'colId', 'type', 'widgetOptions']);
    let rowId = 1;
    state.tables.forEach((t, tIdx) => {
      gt.id.push(tIdx + 1); gt.tableId.push(t);
      Object.keys(state.columns[t] || {}).forEach(colId => {
        const choices = state.choices[t] && state.choices[t][colId];
        gtc.id.push(rowId++); gtc.parentId.push(tIdx + 1); gtc.colId.push(colId); gtc.type.push(state.columns[t][colId]);
        gtc.widgetOptions.push(choices ? JSON.stringify({ choices }) : '');
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

  // Colonnes de `tableId` PAS cochées dans le panneau de droite DE CE WIDGET (donc absentes de `record`
  // sous includeColumns:'shown', le défaut réel de grist.onRecord) - cf. le commentaire de
  // state.hiddenColumnsByTable ci-dessus pour le "pourquoi". `id` ne peut jamais être masqué (Grist ne le
  // permet pas non plus).
  function setHiddenColumns(tableId, colIds) {
    state.hiddenColumnsByTable[tableId] = (colIds || []).filter(c => c !== 'id');
  }

  // Simule un changement du niveau d'accès accordé (ex. l'utilisateur refuse l'accès complet demandé par
  // grist.ready({requiredAccess:'full'}), ou l'accorde plus tard) - re-déclenche onOptions si déjà
  // enregistré, exactement comme grist-core le fait à chaque changement réel (ConfigNotifier, pas
  // seulement au ready initial).
  function setAccessLevel(level) {
    state.accessLevel = level;
    if (state.optionsCallback) state.optionsCallback(null, { accessLevel: state.accessLevel, linking: {} });
  }

  function fireRecord(record, tableId) {
    let effective = record;
    // 'shown' (défaut) : Grist retire du record les colonnes pas cochées dans CETTE section (vérifié à la
    // source, cf. state.recordIncludeColumns). 'normal'/'all' : toutes les colonnes normales, quel que
    // soit l'affichage (le correctif de js/grist-api.js:onRecord demande explicitement 'normal').
    if (record && state.recordIncludeColumns === 'shown') {
      const hidden = state.hiddenColumnsByTable[tableId] || [];
      if (hidden.length) {
        effective = {};
        Object.keys(record).forEach(k => { if (k === 'id' || hidden.indexOf(k) === -1) effective[k] = record[k]; });
      }
    }
    if (state.recordCallback) state.recordCallback(effective, { tableId });
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
        // Lève sur une colonne inconnue si la table EXISTE déjà (schéma déjà fixé) - comme le vrai Grist
        // (useractions.py, KeyError sur un colId absent), vérifié le 2026-09-28 contre grist-core@main en
        // creusant "l'enregistrement ne fonctionne pas" (mémoire project-publipostage-templates-migration-
        // race). Une table encore inconnue ici (AddRecord avant tout AddTable) garde son bootstrap existant
        // (déduit du premier enregistrement) - aucun appelant réel ne passe par ce chemin, AddTable précède
        // toujours dans js/templates.js/js/template-preferences.js.
        const existed = !!state.rows[tableId];
        const table = state.rows[tableId] || (state.rows[tableId] = columnarEmpty(Object.keys(fields)));
        if (existed) {
          const unknown = Object.keys(fields).find(k => !(k in table));
          if (unknown) throw new Error('KeyError : colonne inconnue ' + tableId + '.' + unknown);
        }
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
          const unknown = Object.keys(fields).find(k => !(k in table));
          if (unknown) throw new Error('KeyError : colonne inconnue ' + tableId + '.' + unknown);
          const idx = table.id.indexOf(rowId);
          if (idx !== -1) Object.keys(fields).forEach(k => {
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
        //
        // Renomme (suffixe numérique) si l'id demandé existe déjà, EXACTEMENT comme le vrai Grist -
        // vérifié le 2026-09-28 contre grist-core@main (useractions.py:doAddColumn -> _pick_col_name ->
        // identifiers.pick_col_ident) : AddColumn/AddVisibleColumn ne refuse JAMAIS un id déjà pris,
        // contrairement à une première version de ce garde-fou (qui levait une erreur - FAUSSE, cf.
        // mémoire d'équipe project-publipostage-templates-migration-race). Le code appelant qui ignore
        // le colId réellement renvoyé (comme js/templates.js:ensureXxxColumn) continue donc de chercher
        // son id d'origine indéfiniment si une vraie collision se produit - à dessein, pour rester fidèle.
        const requestedColId = action[2];
        const table = state.rows[tableId];
        let colId = requestedColId;
        if (table) {
          let suffix = 2;
          while (colId in table) { colId = requestedColId + suffix; suffix++; }
          table[colId] = table.id.map(() => null);
        }
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
    onRecord: function (cb, opts) { state.recordCallback = cb; state.recordIncludeColumns = (opts && opts.includeColumns) || 'shown'; },
    // Déclenché immédiatement à l'enregistrement (simule "on ready, send initial configuration",
    // ConfigNotifier._ready côté grist-core) puis à chaque setAccessLevel() ultérieur - c'est la SEULE
    // source fiable de accessLevel (jamais getOptions(), cf. son commentaire ci-dessous).
    onOptions: function (cb) { state.optionsCallback = cb; cb(null, { accessLevel: state.accessLevel, linking: {} }); },
    // WidgetAPI.getOptions() = options JSON PROPRES au widget (activeCustomOptions), jamais accessLevel -
    // ce widget n'appelle jamais grist.setOptions(), donc toujours null en pratique (vérifié à la source
    // le 2026-09-28, cf. js/grist-api.js:onOptions pour la vraie source d'accessLevel).
    getOptions: async function () { return null; },
    docApi: {
      listTables: async function () { return state.tables.slice(); },
      fetchTable: async function (tableId) {
        return state.rows[tableId] ? JSON.parse(JSON.stringify(state.rows[tableId])) : columnarEmpty([]);
      },
      applyUserActions: applyUserActions,
      getAccessToken: async function () { return { token: 'stub-token', baseUrl: 'http://localhost/api/docs/stub' }; },
    },
  };

  window.__gristStub = { state, setVariables, setRows, setHiddenColumns, setAccessLevel, fireRecord, applyUserActions, getActionLog, clearActionLog, countActions, remoteWrite, getRow, dropColumn };
  // Point d'ancrage pour seeder AVANT que main.js:init() ne tourne (donc avant le tout premier
  // fetchTable de GristAPI.init()) - contrairement à un appel de setVariables/setRows APRÈS "Widget
  // prêt.", qui ne peut jamais tester "le widget démarre avec tel modèle déjà marqué par défaut" (cf.
  // dev-tests/README.md). Posé via page.addInitScript AVANT page.goto (donc déjà présent quand ce
  // fichier s'exécute, lui-même chargé avant js/main.js dans _test-harness.html).
  if (typeof window.__preSeedGristStub === 'function') window.__preSeedGristStub(window.__gristStub);
})();
