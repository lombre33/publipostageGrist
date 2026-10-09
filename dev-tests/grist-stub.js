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

// Sans langue enregistrée, js/i18n.js suit celle du navigateur ; celui des tests est en en-US, et les scénarios sont écrits en français. Le navigateur de
// test se dit donc français ; un test de la langue par défaut fixe `window.__browserLanguages` (page.addInitScript) avant le chargement de la page.
try {
  const asked = () => window.__browserLanguages || ['fr-FR', 'fr'];
  Object.defineProperty(navigator, 'languages', { configurable: true, get: () => asked() });
  Object.defineProperty(navigator, 'language', { configurable: true, get: () => asked()[0] });
} catch (e) { /* un navigateur qui refuse : les tests suivent alors sa langue */ }

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
    displayCols: {}, // { tableId: { colId: colonne d'affichage } } - Références affichées par une colonne d'aide gristHelper_Display* (cf. setVariables)
    visibleCols: {}, // { tableId: { colId: colonne de la table liée } } - « Colonne à afficher » d'une Référence (visibleCol, cf. setVariables)
    labels: {}, // { tableId: { colId: libellé } } - le nom de l'en-tête quand il diffère de l'identifiant (label de _grist_Tables_column, cf. setColumnLabels) ; absent = le libellé est l'identifiant
    formulas: {}, // { tableId: { colId: texte de la formule } } - colonnes dont isFormula est vrai (setFormulaColumn, AddColumn d'un modèle de la galerie) et formules des colonnes d'aide de SetDisplayFormula : le stub ne les calcule pas, il les garde pour qu'un test lise ce que le widget a demandé ; absent = colonne de données
    rows: {}, // { tableId: { id: [...], col: [...] } } forme columnaire Grist
    // Un widget réel ne peut jamais désinscrire un onRecord (pas d'"offRecord" dans l'API publique) et PLUSIEURS souscriptions coexistent, chacune
    // recevant CHAQUE événement indépendamment (grist-plugin-api.ts : chaque appel à onRecord() ajoute son propre écouteur 'message' interne) - donc
    // un tableau, jamais un seul slot qu'un 2e appel écraserait. { cb, includeColumns } par entrée.
    recordCallbacks: [],
    // { tableId: [colId, ...] } - colonnes PAS cochées dans le panneau de droite DE CE WIDGET, pour ce
    // tableId (cf. setHiddenColumns). Vide par défaut = toutes les colonnes "montrées", pour ne rien
    // changer aux tests existants qui ne s'en soucient pas - un test qui veut vérifier le comportement
    // includeColumns:'shown' (vérifié à la source grist-core, GristAPI.ts/WidgetFrame.ts - cf. mémoire
    // d'équipe project-publipostage-macro-condition-columntype-fix) doit le déclarer explicitement.
    hiddenColumnsByTable: {},
    // Les lignes que la VUE de ce widget affiche (GristView.fetchSelectedTable : la section une fois filtrée et triée, cf. setViewRows) : null = toute la table, dans
    // l'ordre de ses lignes, pour ne rien changer aux tests qui ne s'en soucient pas. viewFailure : le message d'une panne simulée de l'appel (null : aucune).
    viewRowIds: null,
    viewFailure: null,
    viewCalls: [],
    nextRowId: { Publipostage_Modeles: 1, Publipostage_LiensTables: 1, Publipostage_UserProbe: 1 },
    // Niveau d'accès RÉELLEMENT accordé au widget (settings.accessLevel de onOptions côté grist-core,
    // JAMAIS ce que grist.getOptions() renvoie - WidgetAPI.getOptions() est les options JSON PROPRES au
    // widget, pas InteractionOptions, vérifié à la source le 2026-09-28). 'full' par défaut pour ne rien
    // changer aux tests existants (dont ceux qui dépendent déjà de includeColumns:'normal') - un test qui
    // veut simuler un accès limité doit appeler setAccessLevel explicitement.
    accessLevel: 'full',
    optionsCallback: null,
    // Options JSON PROPRES au widget (activeCustomOptions côté grist-core) : null tant que rien n'est réglé, comme une vue neuve. setOption/setOptions
    // les modifient et rappellent onOptions, comme le vrai ConfigNotifier (vérifié à la source le 2026-09-28).
    options: null,
    // Les options ENREGISTRÉES de la vue (celles que reçoivent les autres personnes) : `options` est le brouillon (activeCustomOptions), que « Enregistrer »
    // (saveOptions) recopie ici et que « Retour » (revertOptions) rend. setWidgetOptions les pose toutes les deux : ce sont des options qui viennent de Grist.
    savedOptions: null,
    // Vrai : setOption ne rappelle onOptions que si les options changent vraiment, comme le vrai Grist (mesuré le 09/10 : aucun rappel pour une valeur qui ne
    // change rien). Faux par défaut : un rappel à chaque appel, ce que supposent les scénarios existants.
    echoOnlyChanges: false,
    // Email que renverrait la formule déclenchée user.Email de Publipostage_UserProbe (js/grist-api.js:getCurrentUserEmail). null = formule sans
    // valeur, comme avant ce champ : l'identification échoue, ce que tous les scénarios existants supposent.
    userEmail: null,
    // Nom que renverrait user.Name (js/grist-api.js:getCurrentUserName) : écrit dans la colonne Name de la table-sonde SI elle existe - comme la formule déclenchée, qui n'a rien à calculer
    // tant que la colonne n'a pas été ajoutée. null = Grist ne donne aucun nom à cette personne (compte sans nom : user.Name vaut None).
    userName: null,
    // Compte Lecteur de Grist : Grist met `readonly=true` dans l'adresse du cadre du widget (setViewer le fait aussi, sans recharger la page) et refuse toute
    // écriture du document (applyUserActions lève, la ligne refusée est gardée dans deniedWrites). Vrai dès le chargement quand l'adresse de la page porte
    // déjà `readonly=true` (script Node qui ouvre la page ainsi).
    viewer: /(?:^|[?&])readonly=true(?:&|$)/.test(location.search),
    deniedWrites: [],
    docId: 'stub' + Math.random().toString(36).slice(2, 8),
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
  state.rows._grist_Tables = columnarEmpty(['tableId', 'primaryViewId']);
  // Volet des pages du document (js/page-tree.js) : une vue et une page par table créée par AddTable, comme useractions.py:doAddView - voir addPage / resetPages ci-dessous.
  // Vide au départ : les quatre tables internes pré-remplies représentent un document déjà migré dont on ne connaît pas le volet ; un scénario le pose avec resetPages.
  state.rows._grist_Views = columnarEmpty(['name']);
  state.rows._grist_Pages = columnarEmpty(['viewRef', 'indentation', 'pagePos', 'options']);
  state.primaryViewOf = {}; // tableId -> id de sa vue principale (primaryViewId)
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

  function setVariables(tableId, columns, choicesByCol, displayCols, visibleCols) {
    // columns: { colId: type } (ex: {Nom:'Text', Logo:'Attachments', Client:'Ref:Clients'})
    // choicesByCol (optionnel) : { colId: string[] } pour une colonne Choice/ChoiceList - même clé "choices" que le vrai widgetOptions JSON de Grist
    // (grist-core ChoiceTextBox.ts: this.options.prop("choices")), vérifié à la source le 2026-09-28.
    // displayCols (optionnel) : { colRef: colonneAide } - une Référence affichée par une colonne de la table cible a, dans le vrai Grist, une colonne
    // d'aide « gristHelper_Display… » dans SA table (à déclarer dans `columns` et remplir via setRows, comme fetchTable la renvoie) et son displayCol
    // pointe dessus (schema.ts, ColumnRec.displayColModel, vérifié à la source le 2026-09-28). Absent = aucune : la Référence s'affiche par son id.
    // visibleCols (optionnel) : { colRef: colonneDeLaTableLiée } - la « Colonne à afficher » d'une Référence ou d'une liste de références, dite par le nom de
    // la colonne de la table liée (déclarée dans son propre setVariables) ; le vrai visibleCol en est l'id de ligne dans _grist_Tables_column (schema.ts,
    // Ref:_grist_Tables_column). Absent = 0 : la Référence montre l'id de la ligne.
    if (state.tables.indexOf(tableId) === -1) state.tables.push(tableId);
    state.columns[tableId] = columns;
    if (!state.rows[tableId]) state.rows[tableId] = columnarEmpty(Object.keys(columns));
    if (choicesByCol) state.choices[tableId] = Object.assign({}, state.choices[tableId], choicesByCol);
    state.displayCols[tableId] = Object.assign({}, displayCols);
    state.visibleCols[tableId] = Object.assign({}, visibleCols);
    rebuildColumnMeta();
  }

  // Le libellé (l'en-tête que Grist montre) de colonnes de `tableId`, quand il n'est pas leur identifiant : { colId: libellé }. Grist tire l'identifiant du libellé
  // (accents retirés, le reste en « _ ») mais les deux se changent ensuite l'un sans l'autre ; sans appel ici, le libellé d'une colonne est son identifiant, comme
  // pour une colonne créée par l'API. Gardé d'un setVariables à l'autre de la même table.
  function setColumnLabels(tableId, labels) {
    state.labels[tableId] = Object.assign({}, state.labels[tableId], labels);
    rebuildColumnMeta();
  }

  // Le texte de la formule d'une colonne (`isFormula` vrai dans _grist_Tables_column), undefined pour une colonne de données. '' : une colonne « vide » (isFormula vrai, formule
  // vide), l'état d'une colonne que l'on vient d'ajouter dans Grist ; un texte : une vraie colonne à formule, que Grist refuse d'écrire (mesuré dans un vrai Grist le 09/10).
  function formulaOf(tableId, colId) { return state.formulas[tableId] ? state.formulas[tableId][colId] : undefined; }
  // Pose (formula: texte, '' pour une colonne vide) ou retire (null) la formule d'une colonne de `tableId`.
  function setFormulaColumn(tableId, colId, formula) {
    state.formulas[tableId] = Object.assign({}, state.formulas[tableId]);
    if (formula == null) delete state.formulas[tableId][colId]; else state.formulas[tableId][colId] = String(formula);
    rebuildColumnMeta();
  }

  // Identifiants de ligne de _grist_Tables et de _grist_Tables_column, comme Grist les donne : attribués à la création d'une table ou d'une colonne, jamais décalés ni réutilisés
  // (un renommage garde le sien - renameColumn / renameTable ci-dessous ; supprimer une colonne ou une table ne change pas ceux des autres ; une colonne recréée sous le même nom en reçoit un neuf).
  // Les colonnes sont rangées par identifiant de leur table + nom : renommer une table ne les déplace pas.
  const metaIds = { tableNext: 1, columnNext: 1, tables: {}, columns: {} };
  function tableRowId(tableId) { return metaIds.tables[tableId] || (metaIds.tables[tableId] = metaIds.tableNext++); }
  function columnRowId(tableId, colId) { const key = tableRowId(tableId) + '\n' + colId; return metaIds.columns[key] || (metaIds.columns[key] = metaIds.columnNext++); }

  // Peuple _grist_Tables/_grist_Tables_column pour que getColumnType()/getColumnChoices() fonctionnent
  // (refreshColumnTypes, cf. js/grist-api.js) - un seul appel idempotent suffit,
  // reconstruit tout à chaque fois à partir de state.tables/columns/choices, avec les identifiants de ligne de metaIds ci-dessus.
  function rebuildColumnMeta() {
    const gtc = columnarEmpty(['parentId', 'colId', 'type', 'widgetOptions', 'displayCol', 'visibleCol', 'label', 'isFormula', 'formula']);
    const rowIdOf = {}; // "table.colonne" -> id de ligne dans _grist_Tables_column, pour displayCol
    state.tables.forEach(t => Object.keys(state.columns[t] || {}).forEach(colId => { rowIdOf[t + '.' + colId] = columnRowId(t, colId); }));
    state.tables.forEach(t => {
      Object.keys(state.columns[t] || {}).forEach(colId => {
        const choices = state.choices[t] && state.choices[t][colId];
        const helper = state.displayCols[t] && state.displayCols[t][colId];
        gtc.id.push(rowIdOf[t + '.' + colId]); gtc.parentId.push(tableRowId(t)); gtc.colId.push(colId); gtc.type.push(state.columns[t][colId]);
        gtc.widgetOptions.push(choices ? JSON.stringify({ choices }) : '');
        gtc.displayCol.push((helper && rowIdOf[t + '.' + helper]) || 0);
        const shown = state.visibleCols[t] && state.visibleCols[t][colId];
        const linked = /^Ref(?:List)?:(.+)$/.exec(state.columns[t][colId]);
        gtc.visibleCol.push((shown && linked && rowIdOf[linked[1] + '.' + shown]) || 0);
        gtc.label.push((state.labels[t] && state.labels[t][colId]) || colId);
        const formula = formulaOf(t, colId);
        gtc.isFormula.push(formula !== undefined);
        gtc.formula.push(formula === undefined ? '' : formula);
      });
    });
    // Ce qui a disparu du schéma perd son identifiant (jamais redonné : les compteurs ne reculent pas).
    const liveColumns = {};
    state.tables.forEach(t => Object.keys(state.columns[t] || {}).forEach(colId => { liveColumns[tableRowId(t) + '\n' + colId] = true; }));
    Object.keys(metaIds.columns).forEach(key => { if (!liveColumns[key]) delete metaIds.columns[key]; });
    const liveTables = state.tables.concat(Object.keys(state.primaryViewOf));
    Object.keys(metaIds.tables).forEach(t => { if (liveTables.indexOf(t) === -1) delete metaIds.tables[t]; });
    syncTableRows();
    state.rows._grist_Tables_column = gtc;
  }

  // _grist_Tables : une ligne par table de state.tables, puis celles qui n'ont qu'une page (créées par AddTable sans passer par setVariables).
  function syncTableRows() {
    const gt = columnarEmpty(['tableId', 'primaryViewId']);
    const ids = state.tables.concat(Object.keys(state.primaryViewOf).filter(t => state.tables.indexOf(t) === -1));
    ids.forEach(t => { gt.id.push(tableRowId(t)); gt.tableId.push(t); gt.primaryViewId.push(state.primaryViewOf[t] || 0); });
    state.rows._grist_Tables = gt;
  }

  // Un objet recopié avec une clé renommée, au même rang (l'ordre des colonnes d'une table est celui des clés).
  function renameKey(obj, from, to) {
    const out = {};
    Object.keys(obj).forEach(k => { out[k === from ? to : k] = obj[k]; });
    return out;
  }

  // Renomme une colonne comme Grist (useractions.py:RenameColumn, vérifié à la source le 2026-10-02) : la MÊME ligne de _grist_Tables_column change de colId, son identifiant ne bouge pas.
  // Les données, les choix, la colonne d'affichage et la « colonne à afficher » des Références qui la montrent suivent ; les formules et les modèles du widget, eux, ne sont jamais réécrits
  // par Grist. Faux si la colonne n'existe pas ou si le nouveau nom est pris.
  function renameColumn(tableId, oldId, newId) {
    const columns = state.columns[tableId];
    if (!columns || !(oldId in columns) || newId in columns) return false;
    const prefix = tableRowId(tableId) + '\n';
    metaIds.columns[prefix + newId] = columnRowId(tableId, oldId);
    delete metaIds.columns[prefix + oldId];
    state.columns[tableId] = renameKey(columns, oldId, newId);
    if (state.rows[tableId] && oldId in state.rows[tableId]) state.rows[tableId] = renameKey(state.rows[tableId], oldId, newId);
    ['choices', 'displayCols', 'visibleCols', 'labels', 'formulas'].forEach(bag => { if (state[bag][tableId]) state[bag][tableId] = renameKey(state[bag][tableId], oldId, newId); });
    Object.keys(state.displayCols[tableId] || {}).forEach(k => { if (state.displayCols[tableId][k] === oldId) state.displayCols[tableId][k] = newId; });
    state.tables.forEach(t => Object.keys(state.visibleCols[t] || {}).forEach(k => {
      const linked = /^Ref(?:List)?:(.+)$/.exec((state.columns[t] || {})[k] || '');
      if (linked && linked[1] === tableId && state.visibleCols[t][k] === oldId) state.visibleCols[t][k] = newId;
    }));
    rebuildColumnMeta();
    return true;
  }

  // Renomme une table comme Grist (useractions.py:RenameTable) : même ligne de _grist_Tables, même identifiant ; les colonnes Référence qui la désignaient changent de type (« Ref:Ancien » -> « Ref:Nouveau »).
  function renameTable(oldId, newId) {
    const at = state.tables.indexOf(oldId);
    if (at === -1 || state.tables.indexOf(newId) !== -1) return false;
    metaIds.tables[newId] = tableRowId(oldId);
    delete metaIds.tables[oldId];
    state.tables[at] = newId;
    ['columns', 'choices', 'displayCols', 'visibleCols', 'labels', 'formulas', 'rows', 'nextRowId', 'primaryViewOf'].forEach(bag => {
      if (state[bag] && oldId in state[bag]) { state[bag][newId] = state[bag][oldId]; delete state[bag][oldId]; }
    });
    state.tables.forEach(t => Object.keys(state.columns[t] || {}).forEach(k => {
      const ref = /^(Ref(?:List)?):(.+)$/.exec(state.columns[t][k]);
      if (ref && ref[2] === oldId) state.columns[t][k] = ref[1] + ':' + newId;
    }));
    rebuildColumnMeta();
    return true;
  }

  // Supprime une colonne du schéma comme Grist (RemoveColumn) : ses données, ses choix, son affichage s'en vont, les identifiants des autres colonnes ne changent pas, et une colonne recréée
  // sous le même nom aura un identifiant neuf. Différent de dropColumn plus bas, qui n'ôte que la donnée d'une ligne. Faux si la colonne n'existe pas.
  function deleteColumn(tableId, colId) {
    if (!state.columns[tableId] || !(colId in state.columns[tableId])) return false;
    delete state.columns[tableId][colId];
    if (state.rows[tableId]) delete state.rows[tableId][colId];
    ['choices', 'displayCols', 'visibleCols', 'labels', 'formulas'].forEach(bag => { if (state[bag][tableId]) delete state[bag][tableId][colId]; });
    rebuildColumnMeta();
    return true;
  }

  // Supprime une table du schéma comme Grist (RemoveTable) : ses colonnes et ses données s'en vont, son identifiant n'est jamais redonné.
  function dropTable(tableId) {
    const at = state.tables.indexOf(tableId);
    if (at === -1) return false;
    state.tables.splice(at, 1);
    ['columns', 'choices', 'displayCols', 'visibleCols', 'labels', 'formulas', 'rows', 'nextRowId', 'primaryViewOf'].forEach(bag => { if (state[bag]) delete state[bag][tableId]; });
    rebuildColumnMeta();
    return true;
  }

  // Ce que fait AddTable dans Grist (useractions.py:doAddView) : une vue du nom de la table, et sa page au premier niveau, tout en bas du volet.
  function addPage(tableId, indentation) {
    const views = state.rows._grist_Views;
    const pages = state.rows._grist_Pages;
    const viewId = views.id.length ? Math.max.apply(null, views.id) + 1 : 1;
    views.id.push(viewId); views.name.push(tableId);
    const pageId = pages.id.length ? Math.max.apply(null, pages.id) + 1 : 1;
    const pos = pages.pagePos.length ? Math.max.apply(null, pages.pagePos) + 1 : 1;
    pages.id.push(pageId); pages.viewRef.push(viewId); pages.indentation.push(indentation || 0); pages.pagePos.push(pos); pages.options.push('');
    state.primaryViewOf[tableId] = viewId;
    syncTableRows();
    return viewId;
  }

  // Pose un volet de pages connu : `layout` = [{ table, indentation?, options? }, ...] dans l'ordre du volet (indentation 0 par défaut). Les tables nommées ici existent
  // pour la suite (listTables ne change pas : une table du volet qui n'est pas dans state.tables n'est qu'une page).
  function resetPages(layout) {
    state.rows._grist_Views = columnarEmpty(['name']);
    state.rows._grist_Pages = columnarEmpty(['viewRef', 'indentation', 'pagePos', 'options']);
    state.primaryViewOf = {};
    layout.forEach(entry => {
      addPage(entry.table, entry.indentation || 0);
      const pages = state.rows._grist_Pages;
      pages.options[pages.options.length - 1] = entry.options || '';
    });
    syncTableRows();
  }

  // Lecture du volet dans l'ordre où Grist l'affiche : [{ table, indentation, collapsed }, ...].
  function readPages() {
    const pages = state.rows._grist_Pages;
    const tableOfView = {};
    Object.keys(state.primaryViewOf).forEach(t => { tableOfView[state.primaryViewOf[t]] = t; });
    return pages.id.map((id, i) => {
      let options = {};
      try { options = pages.options[i] ? JSON.parse(pages.options[i]) : {}; } catch (e) { /* option illisible : comme absente */ }
      return { id, table: tableOfView[pages.viewRef[i]] || null, indentation: pages.indentation[i], pagePos: pages.pagePos[i], collapsed: options.collapsed === true };
    }).sort((a, b) => a.pagePos - b.pagePos);
  }

  // Position d'une page quand on met à jour `pagePos` : null = tout en bas ; la position d'une autre page = juste avant elle (relabeling.py:prepare_inserts, comme le fait le
  // glisser-déposer du volet) ; sinon la valeur donnée.
  function resolvePagePos(pages, rowId, wanted) {
    const others = pages.id.map((id, i) => ({ id, pos: pages.pagePos[i] })).filter(p => p.id !== rowId);
    if (wanted == null) return others.length ? Math.max.apply(null, others.map(p => p.pos)) + 1 : 1;
    if (!others.some(p => p.pos === wanted)) return wanted;
    const before = others.filter(p => p.pos < wanted).map(p => p.pos);
    return ((before.length ? Math.max.apply(null, before) : 0) + wanted) / 2;
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
    if (state.optionsCallback) state.optionsCallback(state.options, { accessLevel: state.accessLevel, linking: {} });
  }

  // Options du widget changées côté Grist (autre personne qui enregistre la vue, bouton Enregistrer...) : même rappel onOptions que le vrai
  // ConfigNotifier, asynchrone comme lui.
  function setWidgetOptions(options) {
    state.options = options == null ? null : JSON.parse(JSON.stringify(options));
    state.savedOptions = state.options == null ? null : JSON.parse(JSON.stringify(state.options));
    notifyOptions();
  }
  // Le clic sur « Enregistrer » de Grist : le brouillon devient l'état enregistré. Grist ne dit RIEN au widget (mesuré le 09/10 dans un vrai Grist : aucun
  // message, ni onOptions ni autre, parce que les options actives ne changent pas) : le widget ne peut pas savoir qu'on a enregistré.
  function saveOptions() {
    state.savedOptions = state.options == null ? null : JSON.parse(JSON.stringify(state.options));
  }
  // Le clic sur « Retour » de Grist : le brouillon est remplacé par l'état enregistré, que Grist renvoie.
  function revertOptions() {
    state.options = state.savedOptions == null ? null : JSON.parse(JSON.stringify(state.savedOptions));
    notifyOptions();
  }
  function sortKeys(value) {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (value && typeof value === 'object') return Object.keys(value).sort().reduce((out, k) => { out[k] = sortKeys(value[k]); return out; }, {});
    return value;
  }
  function notifyOptions() {
    const cb = state.optionsCallback;
    if (cb) setTimeout(() => cb(state.options, { accessLevel: state.accessLevel, linking: {} }), 0);
  }
  // Passe le widget en compte Lecteur de Grist (ou le rend à un compte qui modifie) : l'adresse de la page porte `readonly=true` comme celle du cadre d'un
  // vrai Grist, et les écritures du document sont refusées. Le widget lit l'adresse à neuf à chaque fois (GristAPI.isDocumentReadOnly) : un scénario
  // appelle ensuite AccessRights.refresh() pour qu'il en tire ses droits.
  function setViewer(on) {
    state.viewer = !!on;
    state.deniedWrites = [];
    const url = new URL(location.href);
    if (on) url.searchParams.set('readonly', 'true'); else url.searchParams.delete('readonly');
    history.replaceState(history.state, '', url.href);
  }
  function setUserEmail(email) { state.userEmail = email || null; }
  function setUserName(name) { state.userName = name || null; }
  function setDocId(id) { state.docId = String(id); }

  // Même filtrage que la vraie API (WidgetFrame.ts:_visibleColumns, vérifié à la source) : 'shown' retire les colonnes pas cochées dans CETTE
  // section, 'normal'/'all' garde tout. Partagé entre fireRecord et docApi.fetchSelectedRecord ci-dessous.
  function filterRecordForIncludeColumns(record, tableId, includeColumns) {
    if (!record || includeColumns !== 'shown') return record;
    const hidden = state.hiddenColumnsByTable[tableId] || [];
    if (!hidden.length) return record;
    const filtered = { id: record.id };
    Object.keys(record).forEach(k => { if (k === 'id' || hidden.indexOf(k) === -1) filtered[k] = record[k]; });
    return filtered;
  }

  // GristViewImpl._visibleColumns (WidgetFrame.ts, vérifié à la source le 2026-09-28) lève quand includeColumns vaut 'normal'/'all' et que l'accès
  // accordé n'est pas "full" - ce throw se produit CÔTÉ FRAME PARENT, dans la promesse que fetchSelectedRecord attend : le callback onRecord n'est
  // alors JAMAIS appelé pour ce message (pas d'erreur qui remonte au code du widget). Partagé entre fireRecord et docApi.fetchSelectedRecord.
  function deniedByAccessLevel(includeColumns) {
    return (includeColumns === 'normal' || includeColumns === 'all') && state.accessLevel !== 'full';
  }

  function fireRecord(record, tableId) {
    // Mémorise la table de CETTE ligne pour fetchSelectedRecord ci-dessous (docApi) : la vraie API Grist ne prend jamais de tableId, elle opère
    // implicitement sur la section/table à laquelle ce widget est lié - state.lastTableId en tient lieu ici.
    state.lastTableId = tableId;
    // Photographie des écouteurs enregistrés à CET INSTANT : un écouteur enregistré APRÈS cet appel ne doit PAS recevoir cet événement, exactement
    // comme le vrai bus 'message' de grist-plugin-api.ts (un nouvel écouteur ne rejoue jamais les événements passés). Notification SYNCHRONE (pas de
    // microtâche) : le vrai fetchSelectedRecord fait un aller-retour RPC async, mais de nombreux scénarios existants appellent fireRecord() puis lisent
    // GristAPI.getCurrentRecord()/ouvrent la modale sans attendre - la garder synchrone évite de casser tout ce qui n'a pas de rapport avec ce fichier
    // (constaté : la rendre async cassait 2 scénarios sans lien avec includeColumns, simplement en retardant la livraison d'un tick).
    const snapshot = state.recordCallbacks.slice();
    snapshot.forEach(function (entry) {
      if (deniedByAccessLevel(entry.includeColumns)) return; // callback jamais appelé, cf. deniedByAccessLevel ci-dessus
      const effective = filterRecordForIncludeColumns(record, tableId, entry.includeColumns);
      entry.cb(effective, { tableId });
    });
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
  // ---- Tables et colonnes créées par le widget pour le compte d'un modèle de la galerie (js/template-pack.js) ----
  // Ce que Grist fait de ces actions a été essayé dans un vrai Grist le 09/10 (grist-static 0.1.6, labo-grist-reel/probe-pack.mjs et probe-names.mjs) : le stub n'invente rien.
  // Les tables du widget (Publipostage_…) gardent leur ancien traitement : leurs colonnes n'ont jamais été déclarées ici et aucun scénario ne les lit par les métadonnées.
  const isWidgetTable = tableId => INTERNAL_TABLES.indexOf(tableId) !== -1 || /^Publipostage_/.test(tableId);

  // Le nom que Grist donne à une table ajoutée : sans accents, tout ce qui n'est ni lettre ni chiffre devient « _ », la première lettre passe en capitale, et un nom déjà
  // pris - SANS tenir compte de la casse - reçoit un numéro (« Fournisseurs » prise : « fournisseurs » devient « Fournisseurs2 », « FOURNISSEURS » devient « FOURNISSEURS3 »).
  function pickTableId(wanted) {
    const clean = String(wanted).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_]+/g, '_');
    const base = clean.charAt(0).toUpperCase() + clean.slice(1);
    const taken = {};
    state.tables.concat(Object.keys(state.primaryViewOf), INTERNAL_TABLES).forEach(t => { taken[t.toLowerCase()] = true; });
    let id = base;
    for (let n = 2; taken[id.toLowerCase()]; n++) id = base + n;
    return id;
  }
  // Même règle pour une colonne (la première lettre reste telle quelle) : « Nom » puis « nom » donne « Nom » et « nom2 ».
  function pickColumnId(wanted, existing) {
    const base = String(wanted).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_]+/g, '_');
    const taken = {};
    Object.keys(existing).forEach(c => { taken[c.toLowerCase()] = true; });
    let id = base;
    for (let n = 2; taken[id.toLowerCase()]; n++) id = base + n;
    return id;
  }
  function parseWidgetOptions(text) {
    if (!text) return null;
    try { const options = JSON.parse(text); return options && typeof options === 'object' ? options : null; } catch (e) { return null; }
  }
  // La colonne (table, identifiant) d'une ligne de _grist_Tables_column, ou null.
  function columnByRowId(rowId) {
    const key = Object.keys(metaIds.columns).find(k => metaIds.columns[k] === rowId);
    if (!key) return null;
    const at = key.indexOf('\n');
    const tableRow = Number(key.slice(0, at));
    const tableId = Object.keys(metaIds.tables).find(t => metaIds.tables[t] === tableRow);
    return tableId ? { tableId, colId: key.slice(at + 1) } : null;
  }
  // Une colonne ajoutée à une table connue des métadonnées : son type, son libellé, ses choix et sa formule rejoignent le schéma que le widget relit.
  function registerColumn(tableId, colId, info) {
    state.columns[tableId][colId] = info.type || 'Any';
    if (info.label && info.label !== colId) (state.labels[tableId] = state.labels[tableId] || {})[colId] = info.label;
    const options = parseWidgetOptions(info.widgetOptions);
    if (options && Array.isArray(options.choices)) (state.choices[tableId] = state.choices[tableId] || {})[colId] = options.choices.slice();
    if (info.isFormula && info.formula) (state.formulas[tableId] = state.formulas[tableId] || {})[colId] = info.formula;
  }
  // Une table créée par AddTable pour un modèle : métadonnées, données vides, vue et page. Rend ce que Grist rend : { id, table_id, columns, views }.
  function addUserTable(wanted, cols) {
    const given = pickTableId(wanted);
    state.tables.push(given);
    state.columns[given] = {}; state.labels[given] = {}; state.choices[given] = {}; state.displayCols[given] = {}; state.visibleCols[given] = {}; state.formulas[given] = {};
    cols.forEach(c => registerColumn(given, pickColumnId(c.id, state.columns[given]), c));
    state.rows[given] = columnarEmpty(Object.keys(state.columns[given]));
    const viewId = addPage(given, 0);
    rebuildColumnMeta();
    return { id: tableRowId(given), table_id: given, columns: Object.keys(state.columns[given]), views: [{ id: viewId, sections: [] }] };
  }
  // « Colonne à afficher » d'une Référence (UpdateRecord de _grist_Tables_column, visibleCol : l'identifiant de ligne de la colonne montrée, 0 pour aucune).
  function setVisibleCol(rowId, shownRowId) {
    const own = columnByRowId(rowId);
    if (!own) throw new Error('KeyError : colonne ' + rowId + ' inconnue');
    const bag = state.visibleCols[own.tableId] = state.visibleCols[own.tableId] || {};
    const shown = shownRowId ? columnByRowId(shownRowId) : null;
    if (shown) bag[own.colId] = shown.colId; else delete bag[own.colId];
    rebuildColumnMeta();
  }
  // SetDisplayFormula : Grist range la formule dans une colonne d'aide « gristHelper_Display » de la même table et la déclare displayCol de la colonne.
  function setDisplayFormula(tableId, colRef, formula) {
    const own = columnByRowId(colRef);
    if (!own || own.tableId !== tableId) throw new Error('KeyError : colonne ' + colRef + ' inconnue dans ' + tableId);
    const columns = state.columns[tableId];
    const bag = state.displayCols[tableId] = state.displayCols[tableId] || {};
    let helper = bag[own.colId];
    if (!helper) {
      helper = 'gristHelper_Display';
      for (let n = 2; helper in columns; n++) helper = 'gristHelper_Display' + n;
      columns[helper] = 'Any';
      if (state.rows[tableId]) state.rows[tableId][helper] = state.rows[tableId].id.map(() => null);
      bag[own.colId] = helper;
    }
    (state.formulas[tableId] = state.formulas[tableId] || {})[helper] = formula;
    rebuildColumnMeta();
  }
  // RemoveTable : la table, ses colonnes, ses données, sa vue et sa page s'en vont.
  function removeTable(tableId) {
    if (state.tables.indexOf(tableId) === -1) throw new Error('KeyError : table ' + tableId + ' inconnue');
    const viewId = state.primaryViewOf[tableId];
    [['_grist_Pages', 'viewRef'], ['_grist_Views', 'id']].forEach(([name, key]) => {
      const rows = state.rows[name];
      if (!rows || viewId == null) return;
      for (let i = rows[key].length - 1; i >= 0; i--) {
        if (rows[key][i] !== viewId) continue;
        Object.keys(rows).forEach(k => rows[k].splice(i, 1));
      }
    });
    dropTable(tableId);
  }

  // Une écriture dans une vraie colonne à formule est refusée par Grist (le lot entier) ; une colonne « vide » (formule vide) devient une colonne de données à la première écriture.
  function refuseFormulaColumns(tableId, colIds) {
    const formula = colIds.find(k => formulaOf(tableId, k));
    if (formula !== undefined) throw new Error('Error : la colonne ' + tableId + '.' + formula + ' est une colonne à formule');
  }
  function convertEmptyColumns(tableId, colIds) {
    const empty = colIds.filter(k => formulaOf(tableId, k) === '');
    if (!empty.length) return;
    empty.forEach(k => { delete state.formulas[tableId][k]; });
    rebuildColumnMeta();
  }
  async function applyUserActions(actions) {
    if (state.viewer) {
      actions.forEach(a => state.deniedWrites.push(a));
      throw new Error('Blocked by access rules : ce compte ne peut pas modifier le document');
    }
    actions.forEach(a => state.actionLog.push(a));
    // Une écriture dans la table des modèles vient d'avoir lieu : la prochaine lecture de cette table peut échouer (failReadBackOnce). Synchrone, aucun tour de microtâche de plus.
    if (actions.some(a => a[1] === 'Publipostage_Modeles' && (a[0] === 'UpdateRecord' || a[0] === 'AddRecord'))) state.modelsWriteSeen = true;
    const retValues = [];
    actions.forEach(action => {
      const [type, tableId] = action;
      if (type === 'AddTable') {
        const cols = action[2] || [];
        if (isWidgetTable(tableId)) {
          if (state.tables.indexOf(tableId) === -1 && INTERNAL_TABLES.indexOf(tableId) === -1) state.tables.push(tableId);
          if (!state.rows[tableId]) state.rows[tableId] = columnarEmpty(cols.map(c => c.id));
          if (!state.primaryViewOf[tableId]) addPage(tableId, 0);
          retValues.push({ table_id: tableId, columns: cols.map(c => c.id), views: [] });
        } else {
          // Une autre table (celle d'un modèle de la galerie) : nommée comme Grist la nomme, avec ses colonnes typées dans les métadonnées. Rend { id, table_id, columns, views } :
          // le nom réellement donné est `table_id`, jamais `tableId`.
          retValues.push(addUserTable(tableId, cols));
        }
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
        // Formule déclenchée à la création (user.Email) - seulement si un scénario a fixé l'email (setUserEmail).
        if (tableId === 'Publipostage_UserProbe' && state.userEmail) {
          if (!table.Email) table.Email = table.id.map(() => null);
          table.Email[table.id.length - 1] = state.userEmail;
        }
        // Formule déclenchée user.Name : seulement dans une table qui a déjà sa colonne Name (ajoutée par AddColumn), pas dans la table-sonde d'avant la chip Nom.
        if (tableId === 'Publipostage_UserProbe' && 'Name' in table) table.Name[table.id.length - 1] = state.userName;
        retValues.push(newId);
      } else if (type === 'UpdateRecord') {
        const rowId = action[2];
        let fields = action[3] || {};
        // La « colonne à afficher » d'une Référence vit dans le schéma (state.visibleCols), que rebuildColumnMeta recopie dans _grist_Tables_column : une écriture directe dans la copie serait perdue.
        if (tableId === '_grist_Tables_column' && 'visibleCol' in fields) {
          setVisibleCol(rowId, fields.visibleCol);
          fields = Object.keys(fields).filter(k => k !== 'visibleCol').reduce((rest, k) => { rest[k] = fields[k]; return rest; }, {});
        }
        const table = state.rows[tableId];
        if (tableId === '_grist_Pages' && table && 'pagePos' in fields) fields = Object.assign({}, fields, { pagePos: resolvePagePos(table, rowId, fields.pagePos) });
        if (table) {
          const unknown = Object.keys(fields).find(k => !(k in table));
          if (unknown) throw new Error('KeyError : colonne inconnue ' + tableId + '.' + unknown);
          refuseFormulaColumns(tableId, Object.keys(fields));
          const idx = table.id.indexOf(rowId);
          if (idx !== -1) Object.keys(fields).forEach(k => {
            table[k][idx] = (tableId === 'Publipostage_Modeles' && k === 'DateModif') ? coerceDateModif(fields[k]) : fields[k];
          });
          convertEmptyColumns(tableId, Object.keys(fields));
        }
        retValues.push(null);
      } else if (type === 'BulkUpdateRecord') {
        // Comme Grist (mesuré dans un vrai Grist le 09/10) : une colonne inconnue, une colonne à formule ou une ligne qui n'existe plus font refuser TOUT le lot, rien n'est écrit.
        const rowIds = action[2] || [];
        const columns = action[3] || {};
        const table = state.rows[tableId];
        if (table) {
          const unknown = Object.keys(columns).find(k => !(k in table));
          if (unknown) throw new Error('KeyError : colonne inconnue ' + tableId + '.' + unknown);
          refuseFormulaColumns(tableId, Object.keys(columns));
          const missing = rowIds.find(id => table.id.indexOf(id) === -1);
          if (missing !== undefined) throw new Error('Error : la ligne ' + missing + ' de ' + tableId + ' n\u2019existe pas');
          rowIds.forEach((rowId, at) => {
            const idx = table.id.indexOf(rowId);
            Object.keys(columns).forEach(k => { table[k][idx] = columns[k][at]; });
          });
          convertEmptyColumns(tableId, Object.keys(columns));
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
        // Une table dont le schéma est connu (setVariables, ou AddTable d'un modèle de la galerie) garde la colonne dans ses métadonnées. Les tables du widget, non : voir isWidgetTable.
        if (!isWidgetTable(tableId) && state.columns[tableId]) { registerColumn(tableId, colId, action[3] || {}); rebuildColumnMeta(); }
        retValues.push({ colId });
      } else if (type === 'SetDisplayFormula') {
        setDisplayFormula(tableId, action[3], action[4]);
        retValues.push(null);
      } else if (type === 'RemoveTable') {
        removeTable(tableId);
        retValues.push(null);
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

  // Pose ce que la vue du widget affiche : les identifiants des lignes, dans l'ordre de la vue (un filtre en retire, un tri les réordonne, un lien « Sélectionner par » les
  // restreint). null : la vue montre toute la table. Un identifiant que la table ne porte pas est rendu tel quel, comme Grist le ferait d'une ligne supprimée entre-temps.
  function setViewRows(ids) { state.viewRowIds = ids == null ? null : ids.slice(); }
  // Fait échouer l'appel suivant et ceux d'après (le message de l'erreur) ; null le rétablit.
  function setViewFailure(message) { state.viewFailure = message == null ? null : String(message); }

  // GristView.fetchSelectedTable (WidgetFrame.ts : GristViewImpl.fetchSelectedTable, vérifié à la source de grist-static 0.1.6) : les lignes de BaseView.sortedRows - donc
  // filtrées et triées comme la vue les montre - sous forme de colonnes, `id` compris, pour les colonnes que la section montre. Opère sur la table de CE widget
  // (state.lastTableId), comme fetchSelectedRecord ; même refus d'accès que lui.
  async function fetchSelectedTable(options) {
    const includeColumns = (options && options.includeColumns) || 'shown';
    state.viewCalls.push({ includeColumns, keepEncoded: !!(options && options.keepEncoded) });
    if (state.viewFailure != null) throw new Error(state.viewFailure);
    if (deniedByAccessLevel(includeColumns)) {
      throw new Error('Setting includeColumns to ' + includeColumns + ' requires full access, but the current access level is ' + state.accessLevel);
    }
    const tableId = state.lastTableId;
    const table = readTable(tableId);
    const ids = state.viewRowIds ? state.viewRowIds.slice() : table.id.slice();
    const hidden = includeColumns === 'shown' ? (state.hiddenColumnsByTable[tableId] || []) : [];
    const data = { id: ids };
    Object.keys(table).forEach(function (col) {
      if (col === 'id' || hidden.indexOf(col) !== -1) return;
      data[col] = ids.map(function (id) { const at = table.id.indexOf(id); return at === -1 ? null : table[col][at]; });
    });
    return data;
  }

  // Latence simulée des appels réseau (grist.docApi.fetchTable / applyUserActions) : un vrai Grist met de quelques dizaines de millisecondes à plusieurs secondes
  // à répondre (la table des modèles se relit EN ENTIER, contenus compris, à chaque passage de l'enregistrement automatique), alors que ce stub répond dans la même
  // microtâche - un défaut qui ne naît que d'appels qui se chevauchent (deux passages de l'auto-save, un Enregistrer pendant un passage...) ne peut donc jamais s'y
  // produire. Modèle d'un aller-retour : la requête arrive au serveur après la moitié du délai (c'est LÀ que la lecture ou l'écriture a lieu), la réponse revient
  // après l'autre moitié. 0 (défaut) = aucun minuteur, comportement d'avant. setLatency(ms) pour les deux appels, setLatency({ fetchTable: ms, applyUserActions: ms }).
  state.latency = { fetchTable: 0, applyUserActions: 0 };
  // Appels en cours et plus grand nombre simultané depuis resetInFlightStats() : prouve qu'un client n'écrit jamais deux fois en même temps.
  state.inFlight = { fetchTable: 0, applyUserActions: 0 };
  state.maxInFlight = { fetchTable: 0, applyUserActions: 0 };
  // true : la prochaine lecture de la table des modèles faite APRÈS une écriture dans cette table échoue une fois (réseau coupé), cf. failReadBackOnce.
  state.failNextModelsFetchAfterWrite = false;
  state.modelsWriteSeen = false;
  function setLatency(spec) {
    if (typeof spec === 'number') spec = { fetchTable: spec, applyUserActions: spec };
    state.latency = Object.assign({ fetchTable: 0, applyUserActions: 0 }, spec || {});
  }
  function resetInFlightStats() { state.maxInFlight = { fetchTable: state.inFlight.fetchTable, applyUserActions: state.inFlight.applyUserActions }; }
  function failReadBackOnce() { state.failNextModelsFetchAfterWrite = true; state.modelsWriteSeen = false; }
  const waitMs = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  async function withLatency(method, work) {
    const ms = state.latency[method] || 0;
    if (!ms) return work();
    state.inFlight[method]++;
    if (state.inFlight[method] > state.maxInFlight[method]) state.maxInFlight[method] = state.inFlight[method];
    try {
      await waitMs(ms / 2);
      const out = await work();
      await waitMs(ms / 2);
      return out;
    } finally { state.inFlight[method]--; }
  }

  // Ce que rend fetchTable : une copie de la table, ou - une seule fois, quand failReadBackOnce l'a armé et qu'une écriture de la table des modèles a eu lieu depuis - une panne
  // de réseau simulée. Synchrone : l'appelant (une fonction async) garde les mêmes tours de microtâche qu'avant.
  function readTable(tableId) {
    if (tableId === 'Publipostage_Modeles' && state.failNextModelsFetchAfterWrite && state.modelsWriteSeen) {
      state.failNextModelsFetchAfterWrite = false; state.modelsWriteSeen = false;
      throw new Error('Réseau coupé (simulé par failReadBackOnce)');
    }
    return state.rows[tableId] ? JSON.parse(JSON.stringify(state.rows[tableId])) : columnarEmpty([]);
  }

  window.grist = {
    ready: function () { /* no-op, cf. GristAPI.init() */ },
    // Ajoute TOUJOURS un nouvel écouteur, ne remplace jamais le précédent : la vraie API n'offre pas d'"offRecord", plusieurs souscriptions coexistent
    // (cf. state.recordCallbacks ci-dessus).
    onRecord: function (cb, opts) { state.recordCallbacks.push({ cb, includeColumns: (opts && opts.includeColumns) || 'shown' }); },
    // Déclenché immédiatement à l'enregistrement (simule "on ready, send initial configuration",
    // ConfigNotifier._ready côté grist-core) puis à chaque setAccessLevel() ultérieur - c'est la SEULE
    // source fiable de accessLevel (jamais getOptions(), cf. son commentaire ci-dessous).
    onOptions: function (cb) { state.optionsCallback = cb; cb(state.options, { accessLevel: state.accessLevel, linking: {} }); },
    // WidgetAPI.getOptions() = options JSON PROPRES au widget (activeCustomOptions), jamais accessLevel (vérifié à la source le 2026-09-28, cf.
    // js/grist-api.js:onOptions pour la vraie source d'accessLevel). Écrites par l'onglet Réglages > Accès (js/access-rights.js) via setOption.
    getOptions: async function () { return state.options == null ? null : JSON.parse(JSON.stringify(state.options)); },
    getOption: async function (key) { return state.options ? state.options[key] : undefined; },
    setOption: async function (key, value) {
      const next = Object.assign({}, state.options, { [key]: value === undefined ? null : JSON.parse(JSON.stringify(value)) });
      const unchanged = state.options != null && JSON.stringify(sortKeys(next)) === JSON.stringify(sortKeys(state.options));
      state.options = next;
      if (!(state.echoOnlyChanges && unchanged)) notifyOptions();
    },
    setOptions: async function (options) { state.options = JSON.parse(JSON.stringify(options || {})); notifyOptions(); },
    clearOptions: async function () { state.options = null; notifyOptions(); },
    // Exposée aussi en haut de grist (grist-plugin-api.ts exporte fetchSelectedTable à la fois seule et dans docApi).
    fetchSelectedTable: fetchSelectedTable,
    docApi: {
      listTables: async function () { return state.tables.slice(); },
      // Latence nulle (le défaut) : les mêmes fonctions qu'avant, appelées directement, sans minuteur ni tour de microtâche de plus - seuls les scénarios qui posent setLatency
      // ou failReadBackOnce voient autre chose.
      fetchTable: async function (tableId) {
        if (state.latency.fetchTable) return withLatency('fetchTable', async () => readTable(tableId));
        return readTable(tableId);
      },
      applyUserActions: function (actions) {
        return state.latency.applyUserActions ? withLatency('applyUserActions', () => applyUserActions(actions)) : applyUserActions(actions);
      },
      // Le document, par l'adresse de son interface de programmation (…/api/docs/<identifiant>) : js/schema-renames.js y lit l'identifiant du document pour ranger son instantané.
      // Un identifiant tiré à chaque chargement de la page : deux pages de test ne partagent jamais un instantané (setDocId pour jouer « le même document, rouvert »).
      getAccessToken: async function () { return { token: 'stub-token', baseUrl: 'http://localhost/api/docs/' + state.docId }; },
      // La vraie fetchSelectedRecord (GristView, jamais GristDocAPI - exposée ici via docApi comme grist-plugin-api.ts le fait, cf. son export
      // `docApi = {...coreDocApi, ...viewApi, fetchSelectedTable, fetchSelectedRecord}`) ne prend PAS de tableId : elle opère sur la section liée à
      // CE widget, state.lastTableId ci-dessus en tient lieu. Même filtrage que fireRecord (filterRecordForIncludeColumns), même refus d'accès
      // (deniedByAccessLevel) - c'est cet appel-ci, fait en interne par grist.onRecord (grist-plugin-api.ts), qui lève réellement côté vraie API.
      fetchSelectedTable: fetchSelectedTable,
      fetchSelectedRecord: async function (rowId, options) {
        const includeColumns = (options && options.includeColumns) || 'shown';
        if (deniedByAccessLevel(includeColumns)) {
          throw new Error('Setting includeColumns to ' + includeColumns + ' requires full access, but the current access level is ' + state.accessLevel);
        }
        const tableId = state.lastTableId;
        const row = getRow(tableId, rowId);
        if (!row) return { id: rowId };
        return filterRecordForIncludeColumns(row, tableId, includeColumns);
      },
    },
  };

  window.__gristStub = { state, setViewer, setVariables, setColumnLabels, setFormulaColumn, setRows, setHiddenColumns, setAccessLevel, setWidgetOptions, saveOptions, revertOptions, setUserEmail, setUserName, setDocId, renameColumn, renameTable, deleteColumn, dropTable, fireRecord, applyUserActions, getActionLog, clearActionLog, countActions, remoteWrite, getRow, dropColumn, resetPages, readPages, setLatency, resetInFlightStats, failReadBackOnce, setViewRows, setViewFailure };
  // Point d'ancrage pour seeder AVANT que main.js:init() ne tourne (donc avant le tout premier
  // fetchTable de GristAPI.init()) - contrairement à un appel de setVariables/setRows APRÈS "Widget
  // prêt.", qui ne peut jamais tester "le widget démarre avec tel modèle déjà marqué par défaut" (cf.
  // dev-tests/README.md). Posé via page.addInitScript AVANT page.goto (donc déjà présent quand ce
  // fichier s'exécute, lui-même chargé avant js/main.js dans _test-harness.html).
  if (typeof window.__preSeedGristStub === 'function') window.__preSeedGristStub(window.__gristStub);
})();
