// Suite "chart" - « Graphique de la page… » (demande d'Antoine, 2026-10-09 : intégrer dans le document un graphique réglé dans Grist), js/chart-plot.js, js/chart-source.js,
// js/chart-block.js. Un graphique de Grist est une section de page lue dans les tables de réglages de Grist (`_grist_Views_section`, `_grist_Views_section_field`,
// `_grist_Filters`, `_grist_Pages`…), puis redessinée en image PNG par Plotly 2.13.2 - le moteur de Grist - comme le QR code. Cinq moitiés :
//  1) la LECTURE des réglages (ChartSource) : la liste des graphiques de la page et les raisons des grisés, les colonnes (libellé, colonne d'affichage d'une Référence, dates
//     dans leur fuseau, listes), les filtres enregistrés, le tri, les lignes liées ou de toute la table ;
//  2) le DESSIN (ChartPlot) : la figure de chaque type et de chaque option de Grist, le texte jamais lu comme du HTML, l'image PNG réellement tracée par Plotly ;
//  3) l'ÉDITEUR : la ligne du menu de la chaîne, le nœud (attributs `data-chart-*` sans image), le cadre, la taille, la fenêtre (liste, lignes grisées, mode des lignes, aperçu,
//     liaison à régler, graphique supprimé), la modification ;
//  4) les RENDUS : Lecture, PDF, Word et Excel (grille) montrent la même image, une ligne sans valeur n'a pas d'image, un graphique supprimé laisse une note ;
//  5) les AUTRES MODES : suivi des modifications, anglais, grisage en en-tête / e-mail / macro-modèle.
// La vraie souris et le vrai clavier à 700x400 (clair, sombre, anglais) sont dans dev-tests/verify-chart-mouse.mjs : une page.evaluate ne déclenche ni un survol ni une frappe
// de confiance.
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const tiptap = () => document.querySelector('.tiptap');
  const modal = () => document.getElementById('pp-chart-modal');
  const modalOpen = () => { const m = modal(); return !!m && m.style.display !== 'none'; };
  const okButton = () => document.querySelector('#pp-chart-modal .var-modal-primary');
  const cancelButton = () => document.querySelector('#pp-chart-modal .var-modal-actions button:not(.var-modal-primary)');
  const picker = () => document.getElementById('pp-chart-pick');
  const radio = value => document.querySelector('#pp-chart-modal input[name="pp-chart-rows"][value="' + value + '"]');
  const previewImage = () => document.querySelector('#pp-chart-modal .pp-chart-image');
  const previewMessage = () => document.querySelector('#pp-chart-modal .pp-chart-message');
  const chartRow = () => document.getElementById('v2-btn-chart');
  const isLocked = id => document.getElementById(id).classList.contains('v2-hf-locked');
  const parse = html => new DOMParser().parseFromString(html, 'text/html').body;
  const written = () => Editor.getHTML().replace(/<p><\/p>$/, '');
  const chartNodes = () => Array.from(parse(Editor.getHTML()).querySelectorAll('img[data-chart-section]'));
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const PAGE_TABLE = 'GfClients';
  const SALES = 'GfVentes';
  const utc = (y, m, d, h, mi) => Date.UTC(y, m - 1, d, h || 0, mi || 0) / 1000;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // === Le document de Grist ================================================================================================================================
  // Deux tables : les clients (la table du document) et leurs ventes (la table des graphiques, une colonne Référence vers le client, affichée par son nom grâce à la colonne
  // d'aide `gristHelper_Display`, comme Grist). Cinq ventes aux mois tous différents (une barre par mois) ; un jour à 0 (case vide), une famille vide.
  const clients = [
    { id: 1, Nom: 'Atelier Durand', Ville: 'Lyon' },
    { id: 2, Nom: 'Brasserie Roy', Ville: 'Nantes' },
    { id: 3, Nom: 'Cabinet Morel', Ville: 'Lyon' },
  ];
  const sales = [
    { id: 1, manualSort: 1, Client: 1, gristHelper_Display: 'Atelier Durand', Mois: 'Mars', Montant: 300, Cout: 120, Jour: utc(2026, 3, 10), Heure: utc(2026, 3, 10, 23, 30), Famille: 'Pain', Tags: ['L', 'bio', 'local'], Libelle: 'Item 10', Note: 'a' },
    { id: 2, manualSort: 2, Client: 1, gristHelper_Display: 'Atelier Durand', Mois: 'Janvier', Montant: 100, Cout: 60, Jour: utc(2026, 1, 5), Heure: utc(2026, 1, 5, 12), Famille: 'Gâteau', Tags: ['L', 'bio'], Libelle: 'Item 2', Note: '' },
    { id: 3, manualSort: 3, Client: 2, gristHelper_Display: 'Brasserie Roy', Mois: 'Février', Montant: 200, Cout: 90, Jour: utc(2026, 2, 20), Heure: utc(2026, 2, 20, 9), Famille: 'Pain', Tags: ['L'], Libelle: 'Item 1', Note: 'c' },
    { id: 4, manualSort: 4, Client: 2, gristHelper_Display: 'Brasserie Roy', Mois: 'Avril', Montant: 50, Cout: 20, Jour: utc(2026, 4, 2), Heure: utc(2026, 4, 2, 0, 0), Famille: 'Autre', Tags: ['L', 'local'], Libelle: '', Note: '' },
    { id: 5, manualSort: 5, Client: 3, gristHelper_Display: 'Cabinet Morel', Mois: 'Mai', Montant: 75, Cout: 30, Jour: 0, Heure: 0, Famille: '', Tags: ['L'], Libelle: 'Item 3', Note: 'e' },
  ];
  const OWN_URL = () => window.location.origin + window.location.pathname;

  // Les graphiques de la page, décrits par les noms des colonnes (installCharts les met en numéros de colonnes, comme Grist). `fields` : l'axe X puis les séries ; `sort` :
  // [{ col, desc, flags }] ; `filters` : [{ col, filter }] (le JSON de Grist). Les pages : « Ventes » (11) et « Clients » (12), puis une vue sans page (13).
  function baseCharts() {
    return [
      { id: 101, view: 11, type: 'bar', title: 'Ventes par mois', table: SALES, options: { stacked: false }, fields: ['Mois', 'Montant', 'Cout'], sort: [{ col: 'Montant', desc: true }] },
      { id: 102, view: 11, type: 'line', title: '', table: SALES, options: { lineMarkers: false }, fields: ['Jour', 'Montant'] },
      { id: 103, view: 12, type: 'pie', title: 'Familles', table: SALES, options: {}, fields: ['Famille', 'Montant'] },
      { id: 104, view: 12, type: 'donut', title: 'Répartition', table: SALES, options: { showTotal: true, donutHoleSize: 0.5 }, fields: ['Famille', 'Montant'] },
      { id: 105, view: 12, type: 'kaplan_meier', title: 'Survie', table: SALES, options: {}, fields: ['Mois', 'Montant'] },
      { id: 106, view: 12, type: 'bar', title: 'Par client', table: SALES, options: { multiseries: true }, fields: ['Client', 'Mois', 'Montant'] },
      { id: 107, view: 12, type: 'bar', title: 'Avec marges', table: SALES, options: { errorBars: true }, fields: ['Mois', 'Montant'] },
      { id: 108, view: 12, type: 'scatter', title: 'Coût et ventes', table: SALES, options: {}, fields: ['Libelle', 'Cout', 'Montant'] },
      { id: 109, view: 12, type: 'area', title: 'Aire', table: SALES, options: {}, fields: ['Jour', 'Montant'] },
      { id: 110, view: 12, kind: 'custom', title: 'Carte', table: SALES, options: { customView: JSON.stringify({ mode: 'url', url: 'https://widgets.example/carte/index.html' }) }, fields: [] },
      { id: 111, view: 12, kind: 'custom', title: '', table: PAGE_TABLE, options: { customView: JSON.stringify({ mode: 'url', url: OWN_URL() + '?x=1#y' }) }, fields: [] },
      { id: 112, view: 13, type: 'bar', title: 'Sur une vue sans page', table: SALES, options: {}, fields: ['Mois', 'Montant'] },
      { id: 113, view: 12, type: 'pie', title: 'Clients par ville', table: PAGE_TABLE, options: {}, fields: ['Ville'] },
    ];
  }
  const jsonOf = value => (value === undefined ? '' : JSON.stringify(value));

  // Installe les tables de réglages de Grist dans le faux Grist (`_grist_Views`, `_grist_Pages`, `_grist_Views_section`, `_grist_Views_section_field`, `_grist_Filters`) ; les
  // colonnes sont désignées par leur numéro de ligne dans `_grist_Tables_column`, comme dans Grist.
  function installCharts(charts, pages) {
    const state = window.__gristStub.state;
    const tables = state.rows._grist_Tables;
    const columns = state.rows._grist_Tables_column;
    const tableRef = tableId => { const at = tables.tableId.indexOf(tableId); if (at < 0) throw new Error('table inconnue ' + tableId); return tables.id[at]; };
    const colRef = (tableId, colId) => {
      const parent = tableRef(tableId);
      for (let i = 0; i < columns.id.length; i++) if (columns.parentId[i] === parent && columns.colId[i] === colId) return columns.id[i];
      throw new Error('colonne inconnue ' + tableId + '.' + colId);
    };
    const views = { id: [11, 12, 13], name: ['Ventes', 'Clients', 'Données brutes'] };
    const pageList = pages || [{ id: 1, viewRef: 11, indentation: 0, pagePos: 1 }, { id: 2, viewRef: 12, indentation: 0, pagePos: 2 }];
    const pageRows = { id: pageList.map(p => p.id), viewRef: pageList.map(p => p.viewRef), indentation: pageList.map(p => p.indentation), pagePos: pageList.map(p => p.pagePos), options: pageList.map(() => '') };
    const sections = { id: [], parentId: [], parentKey: [], tableRef: [], chartType: [], title: [], options: [], sortColRefs: [], linkSrcSectionRef: [] };
    const fields = { id: [], parentId: [], parentPos: [], colRef: [], displayCol: [], widgetOptions: [] };
    const filters = { id: [], viewSectionRef: [], colRef: [], filter: [] };
    let fieldId = 1000;
    let filterId = 2000;
    charts.forEach((chart) => {
      sections.id.push(chart.id);
      sections.parentId.push(chart.view);
      sections.parentKey.push(chart.kind === 'custom' ? 'custom' : 'chart');
      sections.tableRef.push(tableRef(chart.table));
      sections.chartType.push(chart.kind === 'custom' ? '' : (chart.type === 'bar' && chart.emptyType ? '' : chart.type));
      sections.title.push(chart.title || '');
      sections.options.push(jsonOf(chart.options || {}));
      sections.sortColRefs.push(jsonOf((chart.sort || []).map(key => (key.flags ? (key.desc ? '-' : '') + colRef(chart.table, key.col) + ':' + key.flags : (key.desc ? -1 : 1) * colRef(chart.table, key.col)))));
      sections.linkSrcSectionRef.push(chart.linkedInGrist ? 999 : 0);
      (chart.fields || []).forEach((colId, at) => {
        fieldId += 1;
        fields.id.push(fieldId); fields.parentId.push(chart.id); fields.parentPos.push(at + 1); fields.colRef.push(colRef(chart.table, colId)); fields.displayCol.push(0); fields.widgetOptions.push('');
      });
      (chart.filters || []).forEach((saved) => {
        filterId += 1;
        filters.id.push(filterId); filters.viewSectionRef.push(chart.id); filters.colRef.push(colRef(chart.table, saved.col)); filters.filter.push(jsonOf(saved.filter));
      });
    });
    state.rows._grist_Views = views;
    state.rows._grist_Pages = pageRows;
    state.rows._grist_Views_section = sections;
    state.rows._grist_Views_section_field = fields;
    state.rows._grist_Filters = filters;
  }

  async function seed(h, charts, pages) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables(PAGE_TABLE, { Nom: 'Text', Ville: 'Text' });
    stub.setRows(PAGE_TABLE, clients);
    stub.setVariables(SALES, {
      manualSort: 'ManualSortPos', Client: 'Ref:' + PAGE_TABLE, gristHelper_Display: 'Text', Mois: 'Text', Montant: 'Numeric', Cout: 'Numeric', Jour: 'Date', Heure: 'DateTime:Europe/Paris',
      Famille: 'Choice', Tags: 'ChoiceList', Libelle: 'Text', Note: 'Text',
    }, { Famille: ['Pain', 'Gâteau', 'Autre'], Tags: ['bio', 'local'] }, { Client: 'gristHelper_Display' }, { Client: 'Nom' });
    stub.setRows(SALES, sales);
    installCharts(charts || baseCharts(), pages);
    await GristAPI.refreshSchema();
    await GristAPI.deleteLinkRule(SALES);
    await GristAPI.saveLinkRule(SALES, { mode: 'match', colonneCible: 'Client', colonneSource: 'id' });
    await GristAPI.refreshSchema();
    stub.fireRecord(Object.assign({}, clients[0]), PAGE_TABLE);
    await sleep(60);
  }
  const recordOf = id => Object.assign({}, clients.find(r => r.id === id));
  const specs = async () => { const list = await GristAPI.withReadPass(() => ChartSource.list()); return new Map(list.map(s => [s.id, s])); };
  const specOf = async id => (await specs()).get(id);
  async function rowsOf(id, scope, record, tableId) {
    const spec = await GristAPI.withReadPass(() => ChartSource.read(id));
    return { spec, rows: await GristAPI.withReadPass(() => ChartSource.rows(spec, scope, tableId || PAGE_TABLE, record || recordOf(1))) };
  }
  const idsOf = rows => rows.map(r => r.id);

  // === 1) La lecture des réglages ===========================================================================================================================
  cases.push({
    id: 'chart_list_shows_the_charts_of_the_pages_in_page_order_with_a_reason_for_the_ones_it_cannot_redraw',
    description: 'La liste : les graphiques des pages dans l\'ordre des pages puis des sections, les widgets personnalisés grisés (raison), ce widget-ci et une vue sans page absents ; Kaplan-Meier, « Split series » et « Error bars » grisés avec leur raison',
    run: async (h) => {
      await seed(h);
      const list = await GristAPI.withReadPass(() => ChartSource.list());
      const byId = new Map(list.map(s => [s.id, s]));
      const order = list.map(s => s.id);
      const reasons = {};
      list.forEach((s) => { reasons[s.id] = s.unsupported; });
      return {
        pass: same(order, [101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 113])
          && same(list.slice(0, 2).map(s => s.page), ['Ventes', 'Ventes']) && list[2].page === 'Clients'
          && reasons[101] === '' && reasons[102] === '' && reasons[103] === '' && reasons[104] === '' && reasons[108] === '' && reasons[109] === ''
          && reasons[105] === 'chart.reason.kaplan' && reasons[106] === 'chart.reason.multiseries' && reasons[107] === 'chart.reason.errorBars' && reasons[110] === 'chart.reason.custom'
          && !byId.has(111) && !byId.has(112)
          && byId.get(101).name === 'Ventes par mois' && byId.get(102).name === SALES && byId.get(102).title === '' && byId.get(110).kind === 'custom',
        notes: JSON.stringify({ order, reasons }),
      };
    },
  });

  cases.push({
    id: 'chart_list_reads_the_real_settings_for_each_type_and_a_missing_type_is_a_bar_chart',
    description: 'Le type est celui de `chartType` (barres quand il est vide, comme Grist) ; un type que le widget ne connaît pas est grisé « type inconnu » ; une section sans colonne ou sans table lisible aussi',
    run: async (h) => {
      const charts = baseCharts().filter(c => [101, 102, 103].includes(c.id));
      charts[0].emptyType = true;
      charts.push({ id: 120, view: 11, type: 'treemap', title: 'Inconnu', table: SALES, options: {}, fields: ['Mois', 'Montant'] });
      charts.push({ id: 121, view: 11, type: 'bar', title: 'Sans colonne', table: SALES, options: {}, fields: [] });
      await seed(h, charts);
      const map = await specs();
      const types = [101, 102, 103, 120, 121].map(id => map.get(id).type);
      const reasons = [101, 120, 121].map(id => map.get(id).unsupported);
      return { pass: same(types, ['bar', 'line', 'pie', 'treemap', 'bar']) && same(reasons, ['', 'chart.reason.unknownType', 'chart.reason.noColumn']), notes: JSON.stringify({ types, reasons }) };
    },
  });

  cases.push({
    id: 'chart_list_greys_a_chart_with_a_relative_date_filter_and_keeps_the_other_filters',
    description: 'Un filtre enregistré sur des dates relatives (« 7 derniers jours ») grise le graphique avec sa raison ; un filtre par valeurs ou par plage ne le grise pas',
    run: async (h) => {
      const charts = baseCharts().filter(c => [101, 102, 103].includes(c.id));
      charts[0].filters = [{ col: 'Famille', filter: { excluded: ['Autre'] } }, { col: 'Montant', filter: { min: 60 } }];
      charts[1].filters = [{ col: 'Jour', filter: { min: { relative: [-7, 'day'] } } }];
      await seed(h, charts);
      const map = await specs();
      return { pass: map.get(101).unsupported === '' && map.get(101).filters.length === 2 && map.get(102).unsupported === 'chart.reason.relativeFilter' && map.get(103).unsupported === '', notes: JSON.stringify([map.get(101).filters.length, map.get(102).unsupported]) };
    },
  });

  cases.push({
    id: 'chart_own_widget_is_never_listed_whatever_the_way_its_address_is_written',
    description: 'Ce widget-ci, ajouté à la page comme widget personnalisé, n\'est pas un graphique à proposer : son adresse est reconnue avec ou sans barre finale, avec `index.html`, avec une requête ou un fragment, et le JSON de réglages peut être un texte ou un objet ; un autre widget reste listé',
    run: async (h) => {
      // La page de test s'appelle _test-harness.html : on la fait passer, le temps du scénario, pour la page du widget publié (…/pp/index.html), sans la recharger.
      const here = window.location.pathname + window.location.search + window.location.hash;
      history.replaceState(null, '', '/pp/index.html');
      try {
        const base = window.location.origin + '/pp';
        const written = [base + '/', base, base + '/index.html', base + '/?a=1', base + '/#x', base + '/index.html?a=1#x', base + '2/', window.location.origin + '/', 'https://elsewhere.example/pp/'];
        const charts = baseCharts().filter(c => c.id === 101);
        written.forEach((url, i) => { charts.push({ id: 200 + i, view: 11, kind: 'custom', title: '', table: PAGE_TABLE, options: { customView: JSON.stringify({ url }) }, fields: [] }); });
        charts.push({ id: 300, view: 11, kind: 'custom', title: '', table: PAGE_TABLE, options: { customView: { url: base + '/' } }, fields: [] });
        await seed(h, charts);
        const map = await specs();
        const listed = written.map((url, i) => map.has(200 + i));
        return { pass: same(listed, [false, false, false, false, false, false, true, true, true]) && !map.has(300) && map.has(101) && ChartSource.ownWidgetUrl() === base, notes: JSON.stringify({ listed, objectForm: map.has(300), own: ChartSource.ownWidgetUrl() }) };
      } finally {
        history.replaceState(null, '', here);
      }
    },
  });

  cases.push({
    id: 'chart_spec_columns_follow_a_rename_and_a_new_label_and_a_summary_table_gets_a_readable_name',
    description: 'Les colonnes sont retrouvées par leur numéro : renommée dans Grist, la colonne reste dans le graphique ; le libellé de la colonne est le nom de la série ; la table de synthèse d\'un graphique s\'appelle « Source [par Colonne] »',
    run: async (h) => {
      await seed(h);
      const before = await specOf(101);
      window.__gristStub.renameColumn(SALES, 'Montant', 'CA');
      window.__gristStub.setColumnLabels(SALES, { CA: 'Chiffre d\'affaires' });
      const after = await specOf(101);
      // Une table de synthèse : « GfVentes [par Famille] », dont la colonne Famille porte `summarySourceCol` (le faux Grist ne remplit pas ces deux colonnes de réglages).
      const stub = window.__gristStub;
      stub.setVariables('GfVentes_summary_Famille', { Famille: 'Choice', count: 'Int', Montant: 'Numeric' });
      stub.setRows('GfVentes_summary_Famille', [{ id: 1, Famille: 'Pain', count: 2, Montant: 500 }, { id: 2, Famille: 'Gâteau', count: 1, Montant: 100 }]);
      const tables = stub.state.rows._grist_Tables;
      const columns = stub.state.rows._grist_Tables_column;
      tables.summarySourceTable = tables.id.map(() => 0);
      const sumAt = tables.tableId.indexOf('GfVentes_summary_Famille');
      tables.summarySourceTable[sumAt] = tables.id[tables.tableId.indexOf(SALES)];
      columns.summarySourceCol = columns.id.map(() => 0);
      columns.parentPos = columns.id.map((id, i) => i);
      const famille = columns.id.findIndex((id, i) => columns.parentId[i] === tables.id[sumAt] && columns.colId[i] === 'Famille');
      columns.summarySourceCol[famille] = 1;
      installCharts([{ id: 130, view: 11, type: 'bar', title: '', table: 'GfVentes_summary_Famille', options: {}, fields: ['Famille', 'Montant'] }]);
      const summary = await specOf(130);
      return {
        pass: before.fields[1].colId === 'Montant' && before.fields[1].label === 'Montant' && after.fields[1].colId === 'CA' && after.fields[1].label === 'Chiffre d\'affaires' && after.fields[1].colRef === before.fields[1].colRef
          && summary.tableLabel === SALES + ' [par Famille]' && summary.name === SALES + ' [par Famille]' && summary.fields.length === 2,
        notes: JSON.stringify({ before: before.fields.map(f => f.colId), after: after.fields.map(f => [f.colId, f.label]), summary: summary.name }),
      };
    },
  });

  cases.push({
    id: 'chart_series_use_the_display_column_of_a_reference_and_keep_only_plottable_columns',
    description: 'Une colonne Référence se lit par sa colonne d\'affichage (le nom du client, pas son numéro) ; une colonne texte parmi les séries Y est ignorée, comme dans Grist ; les nombres, les entiers et « Any » se tracent',
    run: async (h) => {
      const charts = [
        { id: 101, view: 11, type: 'bar', title: 'Par client', table: SALES, options: {}, fields: ['Client', 'Montant', 'Libelle', 'Cout'] },
      ];
      await seed(h, charts);
      const { spec, rows } = await rowsOf(101, 'all');
      const series = ChartSource.series(spec, rows);
      return {
        pass: series.length === 3 && series[0].label === 'Client' && same(series[0].values, ['Atelier Durand', 'Atelier Durand', 'Brasserie Roy', 'Brasserie Roy', 'Cabinet Morel'])
          && same(series.map(s => s.label), ['Client', 'Montant', 'Cout']) && same(series[1].values, [300, 100, 200, 50, 75]) && spec.fields[0].pureType === 'Text',
        notes: JSON.stringify({ labels: series.map(s => s.label), x: series[0].values }),
      };
    },
  });

  cases.push({
    id: 'chart_series_write_dates_in_the_column_timezone_and_an_empty_date_is_an_empty_value',
    description: 'Une date (Date en UTC, DateTime dans le fuseau de la colonne) arrive à Plotly comme l\'heure du mur de la colonne : 23 h 30 UTC un jour de mars est 00 h 30 le lendemain à Paris ; 0 est une case vide (sinon le 1er janvier 1970 étend l\'axe)',
    run: async (h) => {
      const charts = [
        { id: 101, view: 11, type: 'line', title: '', table: SALES, options: {}, fields: ['Jour', 'Montant'] },
        { id: 102, view: 11, type: 'line', title: '', table: SALES, options: {}, fields: ['Heure', 'Montant'] },
      ];
      await seed(h, charts);
      const day = await rowsOf(101, 'all');
      const hour = await rowsOf(102, 'all');
      const days = ChartSource.series(day.spec, day.rows)[0].values;
      const hours = ChartSource.series(hour.spec, hour.rows)[0].values;
      const summer = ChartSource.isoInTimezone(Date.UTC(2026, 6, 14, 22, 30), 'Europe/Paris');
      const unknown = ChartSource.isoInTimezone(Date.UTC(2026, 0, 1, 10, 0), 'Pas/Unfuseau');
      const west = ChartSource.isoInTimezone(Date.UTC(2026, 0, 1, 3, 30), 'America/St_Johns');
      return {
        pass: days[0] === '2026-03-10T00:00:00.000+00:00' && days[4] === null && hours[0] === '2026-03-11T00:30:00.000+01:00' && hours[1] === '2026-01-05T13:00:00.000+01:00' && hours[4] === null
          && summer === '2026-07-15T00:30:00.000+02:00' && unknown === '2026-01-01T10:00:00.000+00:00' && west === '2026-01-01T00:00:00.000-03:30',
        notes: JSON.stringify({ days, hours, summer, unknown, west }),
      };
    },
  });

  cases.push({
    id: 'chart_series_split_a_choice_list_on_the_x_axis_into_one_point_per_item',
    description: 'Une liste de choix en abscisse donne un point par élément (la valeur Y est recopiée), comme Grist ; une liste vide ne donne aucun point',
    run: async (h) => {
      const charts = [{ id: 101, view: 11, type: 'bar', title: '', table: SALES, options: {}, fields: ['Tags', 'Montant'] }];
      await seed(h, charts);
      const { spec, rows } = await rowsOf(101, 'all');
      const series = ChartSource.series(spec, rows);
      return {
        pass: spec.fields[0].isList && same(series[0].values, ['bio', 'local', 'bio', 'local']) && same(series[1].values, [300, 300, 100, 50]),
        notes: JSON.stringify({ x: series[0].values, y: series[1].values }),
      };
    },
  });

  // Les lignes d'un graphique, filtrées comme Grist (ColumnFilterFunc.ts) : un graphique de la table des ventes avec ses filtres enregistrés.
  async function filtered(h, filters) {
    await seed(h, [{ id: 101, view: 11, type: 'bar', title: '', table: SALES, options: {}, fields: ['Mois', 'Montant'], filters }]);
    return idsOf((await rowsOf(101, 'all')).rows);
  }

  cases.push({
    id: 'chart_rows_apply_the_saved_value_filters_of_the_chart_including_lists_and_empty_values',
    description: 'Filtres enregistrés par valeurs : « tout sauf Autre », « seulement Pain », « sans les vides » ; une colonne Liste de choix passe si UN de ses éléments passe, une liste vide se filtre comme la valeur vide',
    run: async (h) => {
      const notOther = await filtered(h, [{ col: 'Famille', filter: { excluded: ['Autre'] } }]);
      const onlyBread = await filtered(h, [{ col: 'Famille', filter: { included: ['Pain'] } }]);
      const noEmpty = await filtered(h, [{ col: 'Famille', filter: { excluded: [''] } }]);
      const bio = await filtered(h, [{ col: 'Tags', filter: { included: ['bio'] } }]);
      const noTag = await filtered(h, [{ col: 'Tags', filter: { included: [''] } }]);
      const notBioNorLocal = await filtered(h, [{ col: 'Tags', filter: { excluded: ['bio', 'local'] } }]);
      const two = await filtered(h, [{ col: 'Famille', filter: { excluded: ['Autre'] } }, { col: 'Montant', filter: { min: 80 } }]);
      return {
        pass: same(notOther, [1, 2, 3, 5]) && same(onlyBread, [1, 3]) && same(noEmpty, [1, 2, 3, 4]) && same(bio, [1, 2]) && same(noTag, [3, 5]) && same(notBioNorLocal, [3, 5]) && same(two, [1, 2, 3]),
        notes: JSON.stringify({ notOther, onlyBread, noEmpty, bio, noTag, notBioNorLocal, two }),
      };
    },
  });

  cases.push({
    id: 'chart_rows_apply_range_filters_on_numbers_and_on_days_in_the_column_timezone',
    description: 'Filtres par plage : un nombre (bornes comprises), un jour (la borne de fin garde tout son jour), un DateTime (le jour est celui du fuseau de la colonne : 23 h 30 UTC est déjà le lendemain à Paris) ; un côté libre ; la valeur vide n\'entre pas dans une plage',
    run: async (h) => {
      const between = await filtered(h, [{ col: 'Montant', filter: { min: 75, max: 200 } }]);
      const atLeast = await filtered(h, [{ col: 'Montant', filter: { min: 200 } }]);
      const atMost = await filtered(h, [{ col: 'Montant', filter: { max: 75 } }]);
      const days = await filtered(h, [{ col: 'Jour', filter: { min: utc(2026, 2, 1), max: utc(2026, 3, 10) } }]);
      const parisDay = await filtered(h, [{ col: 'Heure', filter: { min: utc(2026, 3, 11), max: utc(2026, 3, 11) } }]);
      const utcDay = await filtered(h, [{ col: 'Heure', filter: { min: utc(2026, 3, 10), max: utc(2026, 3, 10) } }]);
      const wholeLine = await filtered(h, [{ col: 'Mois', filter: { min: 1, max: 2 } }]);
      return {
        pass: same(between, [2, 3, 5]) && same(atLeast, [1, 3]) && same(atMost, [4, 5]) && same(days, [1, 3]) && same(parisDay, [1]) && same(utcDay, []) && same(wholeLine, [1, 2, 3, 4, 5]),
        notes: JSON.stringify({ between, atLeast, atMost, days, parisDay, utcDay, wholeLine }),
      };
    },
  });

  // Les lignes d'un graphique de la table des ventes, triées par `sort` (le tri enregistré du graphique) ; `rowsData` remplace les données.
  async function sorted(h, sort, fields, rowsData) {
    await seed(h, [{ id: 101, view: 11, type: 'bar', title: '', table: SALES, options: {}, fields: fields || ['Mois', 'Montant'], sort }]);
    if (rowsData) window.__gristStub.setRows(SALES, rowsData);
    return idsOf((await rowsOf(101, 'all')).rows);
  }

  cases.push({
    id: 'chart_rows_follow_the_saved_sort_of_the_chart_with_its_options_and_ties_keep_the_table_order',
    description: 'Le tri enregistré : décroissant, tri naturel (« Item 2 » avant « Item 10 »), vides en dernier, ordre des choix ; sans tri ou à égalité, l\'ordre manuel de la table puis le numéro de ligne, comme la page de Grist',
    run: async (h) => {
      const byAmountDesc = await sorted(h, [{ col: 'Montant', desc: true }]);
      const plain = await sorted(h, [{ col: 'Libelle' }]);
      const natural = await sorted(h, [{ col: 'Libelle', flags: 'naturalSort' }]);
      const emptyLast = await sorted(h, [{ col: 'Libelle', flags: 'emptyLast;naturalSort' }]);
      const byChoice = await sorted(h, [{ col: 'Famille', flags: 'orderByChoice' }]);
      const none = await sorted(h, []);
      const reversed = sales.map(r => Object.assign({}, r, { manualSort: 6 - r.id }));
      const tie = await sorted(h, [{ col: 'Famille' }], undefined, reversed);
      const manual = await sorted(h, [], undefined, reversed);
      return {
        pass: same(byAmountDesc, [1, 3, 2, 5, 4]) && same(plain, [4, 3, 1, 2, 5]) && same(natural, [4, 3, 2, 5, 1]) && same(emptyLast, [3, 2, 5, 1, 4]) && same(byChoice, [5, 1, 3, 2, 4])
          && same(none, [1, 2, 3, 4, 5]) && same(tie, [5, 4, 2, 3, 1]) && same(manual, [5, 4, 3, 2, 1]),
        notes: JSON.stringify({ byAmountDesc, plain, natural, emptyLast, byChoice, none, tie, manual }),
      };
    },
  });

  cases.push({
    id: 'chart_rows_sort_a_reference_by_its_display_column_when_it_is_in_the_chart',
    description: 'Un tri sur une colonne Référence du graphique suit la colonne d\'affichage (le nom, pas le numéro de ligne) ; hors du graphique, il suit la valeur de la colonne',
    run: async (h) => {
      const names = { 1: 'Zéro', 2: 'Alpha', 3: 'Milieu' };
      const renamed = sales.map(r => Object.assign({}, r, { gristHelper_Display: names[r.Client] }));
      const inChart = await sorted(h, [{ col: 'Client' }], ['Client', 'Montant'], renamed);
      const inChartDesc = await sorted(h, [{ col: 'Client', desc: true }], ['Client', 'Montant'], renamed);
      const notInChart = await sorted(h, [{ col: 'Client' }], ['Mois', 'Montant'], renamed);
      return { pass: same(inChart, [3, 4, 5, 1, 2]) && same(inChartDesc, [1, 2, 5, 3, 4]) && same(notInChart, [1, 2, 3, 4, 5]), notes: JSON.stringify({ inChart, inChartDesc, notInChart }) };
    },
  });

  cases.push({
    id: 'chart_rows_linked_scope_uses_the_link_rule_like_a_bubble_and_all_scope_reads_the_whole_table',
    description: 'Lignes « liées » : celles que la règle de liaison de la table du graphique trouve pour la ligne du document (client 1 : deux ventes, client 3 : une, un client inconnu : aucune) ; « toute la table » : les cinq, filtrées et triées comme le graphique',
    run: async (h) => {
      await seed(h);
      const linked = [];
      for (const id of [1, 2, 3]) linked.push(idsOf((await rowsOf(101, 'linked', recordOf(id))).rows));
      const unknown = idsOf((await rowsOf(101, 'linked', { id: 99, Nom: 'Inconnu' })).rows);
      const all = idsOf((await rowsOf(101, 'all', recordOf(1))).rows);
      let failure = null;
      await GristAPI.deleteLinkRule(SALES);
      await GristAPI.refreshSchema();
      try { await rowsOf(101, 'linked', recordOf(1)); } catch (e) { failure = e.message; }
      return { pass: same(linked, [[1, 2], [3, 4], [5]]) && same(unknown, []) && same(all, [1, 3, 2, 5, 4]) && typeof failure === 'string' && failure.length > 0, notes: JSON.stringify({ linked, unknown, all, failure }) };
    },
  });

  // === 2) Le dessin ========================================================================================================================================
  const xs = (label, values, pureType) => ({ label, values, pureType: pureType || 'Text' });
  const ys = (label, values) => ({ label, values, pureType: 'Numeric' });
  const months = ['Janvier', 'Février', 'Mars'];
  // Les pixels d'une image PNG (adresse `data:`) : { width, height, data }.
  async function pixelsOf(src) {
    const img = new Image();
    img.src = src;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { width: canvas.width, height: canvas.height, data: data.data };
  }
  const pixelAt = (picture, x, y) => { const i = (y * picture.width + x) * 4; return [picture.data[i], picture.data[i + 1], picture.data[i + 2], picture.data[i + 3]]; };
  // Le nombre de pixels qui ne sont ni blancs ni transparents.
  const inkOf = (picture) => { let n = 0; for (let i = 0; i < picture.data.length; i += 4) if (picture.data[i + 3] > 0 && (picture.data[i] < 235 || picture.data[i + 1] < 235 || picture.data[i + 2] < 235)) n += 1; return n; };

  cases.push({
    id: 'chart_library_is_loaded_lazily_pinned_with_sri_allowed_by_the_csp_and_retried_after_a_failure',
    description: 'Plotly 2.13.2 (la version de Grist) est demandé à jsDelivr en version fixe avec un hash SRI sha384, seulement au premier dessin ; l\'adresse exacte est dans la politique de sécurité (script-src) sans joker ; un chargement qui échoue est réessayé au dessin suivant',
    run: async () => {
      const lib = ChartPlot.LIB;
      const csp = (document.querySelector('meta[http-equiv="Content-Security-Policy"]') || {}).content || '';
      const scriptSrc = (/script-src([^;]*)/.exec(csp) || [])[1] || '';
      const allowed = scriptSrc.split(/\s+/).filter(Boolean);
      const before = typeof window.Plotly;
      const real = ExportCommon.loadScriptOnce;
      let calls = 0;
      let failure = null;
      try { ExportCommon.loadScriptOnce = () => { calls += 1; return Promise.reject(new Error('réseau coupé')); }; await ChartPlot.ensureLibrary(); } catch (e) { failure = e.message; } finally { ExportCommon.loadScriptOnce = real; }
      await ChartPlot.ensureLibrary();
      return {
        pass: before === 'undefined' && lib.src === 'https://cdn.jsdelivr.net/npm/plotly.js-basic-dist-min@2.13.2/plotly-basic.min.js' && /^sha384-[A-Za-z0-9+/]{64}$/.test(lib.integrity)
          && allowed.includes(lib.src) && !allowed.some(entry => /\*/.test(entry) && entry.indexOf('jsdelivr') !== -1) && calls === 1 && failure === 'réseau coupé' && typeof window.Plotly === 'object' && typeof window.Plotly.toImage === 'function',
        notes: JSON.stringify({ before, lib, calls, failure, jsdelivr: allowed.filter(entry => entry.indexOf('jsdelivr') !== -1) }),
      };
    },
  });

  cases.push({
    id: 'chart_typed_compare_orders_mixed_cell_values_like_grist',
    description: 'La comparaison des valeurs de cellule est celle de Grist : par type d\'abord (nombres, puis vide et tableaux codés, puis textes), les textes avec la langue de Grist (en-US) jamais celle du navigateur, ce qui rend le tri transitif',
    run: async () => {
      const sortedValues = ['b', 2, null, 'a', 1, ['E', 'TypeError'], 'B', 'é', 'e', 'f'].sort(ChartPlot.typedCompare);
      const transitive = (() => {
        const sample = [1, '2', 'a', null, ['E'], 'A', '10', 5, ''];
        for (const a of sample) for (const b of sample) for (const c of sample) {
          if (ChartPlot.typedCompare(a, b) <= 0 && ChartPlot.typedCompare(b, c) <= 0 && ChartPlot.typedCompare(a, c) > 0) return false;
        }
        return true;
      })();
      return { pass: same(sortedValues, [1, 2, null, ['E', 'TypeError'], 'a', 'b', 'B', 'e', 'é', 'f']) && transitive, notes: JSON.stringify(sortedValues) };
    },
  });

  cases.push({
    id: 'chart_figure_bar_has_one_trace_per_series_with_grist_axes_colors_and_a_white_paper',
    description: 'Barres : une trace par série Y, l\'axe X en catégories avec le nom de sa colonne, l\'axe Y sans titre quand une légende nomme plusieurs séries ; les couleurs, la police et le fond blanc du thème clair de Grist ; une abscisse répétée ne garde qu\'une barre ; les séries données ne sont pas modifiées',
    run: async () => {
      const series = [xs('Mois', months.concat(['Mars'])), ys('Montant', [1, 2, 3, 9]), ys('Cout', [3, 2, 1, 9])];
      const frozen = JSON.stringify(series);
      const fig = ChartPlot.figure('bar', series, {});
      const one = ChartPlot.figure('bar', series.slice(0, 2), {});
      return {
        pass: fig.data.length === 2 && fig.data.every(t => t.type === 'bar') && same(fig.data.map(t => t.name), ['Montant', 'Cout']) && same(fig.data[0].x, months) && same(fig.data[0].y, [1, 2, 3]) && same(fig.data[1].y, [3, 2, 1])
          && fig.layout.xaxis.type === 'category' && fig.layout.xaxis.title.text === 'Mois' && fig.layout.yaxis.title.text === undefined && one.layout.yaxis.title.text === 'Montant'
          && fig.layout.colorway[0] === '#2b78ae' && fig.layout.paper_bgcolor === '#ffffff' && fig.layout.plot_bgcolor === '#ffffff' && /Arial/.test(fig.layout.font.family) && fig.layout.font.color === '#444444'
          && fig.layout.barmode === undefined && fig.config.displayModeBar === false && JSON.stringify(series) === frozen,
        notes: JSON.stringify({ names: fig.data.map(t => t.name), x: fig.data[0].x, layout: fig.layout.xaxis }),
      };
    },
  });

  cases.push({
    id: 'chart_figure_bar_options_horizontal_stacked_log_and_inverted_axes',
    description: 'Options de Grist : barres horizontales (les axes échangent leur place), empilées (`barmode relative`), axe Y logarithmique, axe Y inversé ; un axe X numérique ou une date n\'est pas forcé en catégories',
    run: async () => {
      const series = [xs('Mois', months), ys('Montant', [1, 2, 3]), ys('Cout', [3, 2, 1])];
      const horizontal = ChartPlot.figure('bar', series, { orientation: 'h' });
      const stacked = ChartPlot.figure('bar', series, { stacked: true });
      const log = ChartPlot.figure('bar', series, { logYAxis: true, invertYAxis: true });
      const numeric = ChartPlot.figure('bar', [xs('Année', [2024, 2025, 2026], 'Int'), ys('Montant', [1, 2, 3])], {});
      const dated = ChartPlot.figure('bar', [xs('Jour', ['2026-03-10T00:00:00.000+00:00', '2026-03-11T00:00:00.000+00:00'], 'Date'), ys('Montant', [1, 2])], {});
      return {
        pass: same(horizontal.data[0].y, months) && same(horizontal.data[0].x, [1, 2, 3]) && horizontal.data[0].orientation === 'h' && horizontal.layout.yaxis.type === 'category' && horizontal.layout.yaxis.title.text === 'Mois'
          && stacked.layout.barmode === 'relative' && log.layout.yaxis.type === 'log' && log.layout.yaxis.autorange === 'reversed'
          && numeric.layout.xaxis.type === undefined && dated.layout.xaxis.type === undefined,
        notes: JSON.stringify({ h: horizontal.data[0].orientation, layout: [stacked.layout.barmode, log.layout.yaxis, numeric.layout.xaxis.type, dated.layout.xaxis.type] }),
      };
    },
  });

  cases.push({
    id: 'chart_figure_line_and_area_sort_by_x_and_follow_the_marker_gap_and_stack_options',
    description: 'Courbe et aire : points triés par abscisse (une courbe ne revient pas en arrière), marqueurs selon l\'option, trous reliés ou non, courbes empilées dans un même groupe (un groupe à part sous l\'axe pour des valeurs négatives), aire pleine jusqu\'à zéro',
    run: async () => {
      const unsorted = [xs('Jour', ['2026-03-10', '2026-01-05', '2026-02-20'], 'Date'), ys('Montant', [300, 100, 200])];
      const plain = ChartPlot.figure('line', unsorted, { lineMarkers: false });
      const markers = ChartPlot.figure('line', unsorted, { lineMarkers: true, lineConnectGaps: true });
      const stacked = ChartPlot.figure('line', [unsorted[0], ys('A', [1, 2, 3]), ys('B', [-1, -2, -3])], { stacked: true });
      const area = ChartPlot.figure('area', unsorted, {});
      return {
        pass: same(plain.data[0].x, ['2026-01-05', '2026-02-20', '2026-03-10']) && same(plain.data[0].y, [100, 200, 300]) && plain.data[0].type === 'scatter' && plain.data[0].mode === 'lines' && markers.data[0].mode === 'lines+markers'
          && markers.data[0].connectgaps === true && stacked.data[0].stackgroup === 'A' && stacked.data[1].stackgroup === '-A' && plain.data[0].stackgroup === ''
          && area.data[0].fill === 'tozeroy' && area.data[0].line.shape === 'spline' && same(area.data[0].y, [100, 200, 300]),
        notes: JSON.stringify({ x: plain.data[0].x, modes: [plain.data[0].mode, markers.data[0].mode], groups: stacked.data.map(t => t.stackgroup) }),
      };
    },
  });

  cases.push({
    id: 'chart_figure_scatter_plots_the_second_column_against_the_third_and_labels_the_points_with_the_first',
    description: 'Nuage de points : la première colonne nomme les points, la deuxième est l\'abscisse et la troisième l\'ordonnée ; les axes portent le nom de leur colonne',
    run: async () => {
      const fig = ChartPlot.figure('scatter', [xs('Libellé', ['a', 'b', 'c']), ys('Coût', [10, 20, 30]), ys('Ventes', [1, 2, 3])], {});
      const trace = fig.data[0];
      return {
        pass: fig.data.length === 1 && trace.type === 'scatter' && trace.mode === 'text+markers' && same(trace.x, [10, 20, 30]) && same(trace.y, [1, 2, 3]) && same(trace.text, ['a', 'b', 'c']) && fig.layout.xaxis.title.text === 'Coût' && fig.layout.yaxis.title.text === 'Ventes',
        notes: JSON.stringify(trace),
      };
    },
  });

  cases.push({
    id: 'chart_figure_pie_and_donut_keep_label_order_count_when_there_is_no_value_and_show_the_total',
    description: 'Secteurs et anneau : les libellés gardent leur ordre (pas de tri par taille), un libellé vide s\'écrit « - », sans colonne de valeurs on compte les occurrences, l\'anneau a le trou du réglage (75 % sinon) et son total quand le réglage est coché',
    run: async () => {
      const labels = xs('Famille', ['Pain', 'Gâteau', '', 'Pain']);
      const pie = ChartPlot.figure('pie', [labels, ys('Montant', [300, 100, 75, 200])], {});
      const counted = ChartPlot.figure('pie', [labels], {});
      const donut = ChartPlot.figure('donut', [labels, ys('Montant', [300, 100, 75, 200])], { showTotal: true, donutHoleSize: 0.5, textSize: 30 });
      const plain = ChartPlot.figure('donut', [labels, ys('Montant', [300, 100, 75, 200])], {});
      return {
        pass: pie.data.length === 1 && pie.data[0].type === 'pie' && pie.data[0].sort === false && same(pie.data[0].labels, ['-', 'Gâteau', 'Pain', 'Pain']) && same(pie.data[0].values, [75, 100, 300, 200])
          && same(counted.data[0].values, [1, 1, 1, 1]) && counted.data[0].name === 'Count'
          && donut.data[0].hole === 0.5 && donut.layout.annotations.length === 1 && donut.layout.annotations[0].text === '675' && donut.layout.annotations[0].font.size === 30
          && plain.data[0].hole === 0.75 && (plain.layout.annotations || []).length === 0,
        notes: JSON.stringify({ labels: pie.data[0].labels, values: pie.data[0].values, hole: [donut.data[0].hole, plain.data[0].hole], notes: donut.layout.annotations }),
      };
    },
  });

  cases.push({
    id: 'chart_figure_never_reads_a_cell_or_a_name_as_html_and_refuses_a_type_it_cannot_draw',
    description: 'Le contenu d\'une cellule, un nom de colonne ou un titre d\'axe qui contient « <b> » ou « & » ne devient jamais une balise Plotly (il s\'écrit tel quel) ; un type inconnu ou non redessiné (Kaplan-Meier) lève une erreur claire',
    run: async () => {
      const fig = ChartPlot.figure('bar', [xs('A&B <i>', ['<b>gras</b>', 'x & y']), ys('Total <u>', [1, 2])], {});
      let unknown = null;
      for (const type of ['kaplan_meier', 'treemap', '']) { try { ChartPlot.figure(type, [xs('A', ['a']), ys('B', [1])], {}); } catch (e) { unknown = (unknown || []).concat(e.message); } }
      return {
        pass: same(fig.data[0].x, ['&lt;b&gt;gras&lt;/b&gt;', 'x &amp; y']) && fig.data[0].name === 'Total &lt;u&gt;' && fig.layout.xaxis.title.text === 'A&amp;B &lt;i&gt;' && Array.isArray(unknown) && unknown.length === 3 && unknown.every(m => /non pris en charge/.test(m)),
        notes: JSON.stringify({ x: fig.data[0].x, name: fig.data[0].name, title: fig.layout.xaxis.title.text, unknown }),
      };
    },
  });

  cases.push({
    id: 'chart_image_is_a_real_png_of_the_requested_proportions_on_white_with_the_text_written_as_is',
    description: 'Plotly trace une vraie image PNG à 3 pixels par pixel de mise en page (480 x 300 donne 1 440 x 900), fond blanc opaque même dans le thème sombre, avec du tracé coloré ; le texte « <b> » est écrit tel quel dans l\'image (lu dans le SVG de la même figure)',
    run: async () => {
      const fig = ChartPlot.figure('bar', [xs('Mois', months), ys('Montant', [100, 200, 150])], {});
      const uri = await ChartPlot.toImage(fig, 480, 300);
      const picture = await pixelsOf(uri);
      const corner = pixelAt(picture, 2, 2);
      const colors = new Set();
      for (let i = 0; i < picture.data.length; i += 4 * 97) colors.add(picture.data[i] + ',' + picture.data[i + 1] + ',' + picture.data[i + 2]);
      const wide = await pixelsOf(await ChartPlot.toImage(fig, 600, 200));
      const tricky = ChartPlot.figure('bar', [xs('Mois', ['<b>gras</b>', 'x & y']), ys('Montant', [1, 2])], {});
      const svgUri = await window.Plotly.toImage(tricky, { format: 'svg', width: 480, height: 300 });
      const svg = decodeURIComponent(svgUri.slice(svgUri.indexOf(',') + 1));
      const labels = Array.from(new DOMParser().parseFromString(svg, 'image/svg+xml').querySelectorAll('.xtick text')).map(node => node.textContent);
      return {
        pass: uri.startsWith('data:image/png;base64,') && picture.width === 1440 && picture.height === 900 && same(corner, [255, 255, 255, 255]) && inkOf(picture) > 5000 && colors.size > 4
          && wide.width === 1800 && wide.height === 600 && labels.includes('<b>gras</b>') && labels.includes('x & y'),
        notes: JSON.stringify({ size: [picture.width, picture.height], corner, ink: inkOf(picture), colors: colors.size, wide: [wide.width, wide.height], labels, bytes: uri.length }),
      };
    },
  });

  cases.push({
    id: 'chart_image_draws_every_type_with_ink_and_no_exception',
    description: 'Les six types se dessinent pour de vrai (barres, courbe, aire, nuage, secteurs, anneau) : une image 480 x 300 avec du tracé, y compris un graphique de deux lignes seulement et des valeurs vides',
    run: async () => {
      const bars = [xs('Mois', months), ys('Montant', [100, 200, 150]), ys('Cout', [50, 80, 40])];
      const dates = [xs('Jour', ['2026-01-05T00:00:00.000+00:00', '2026-02-20T00:00:00.000+00:00', '2026-03-10T00:00:00.000+00:00'], 'Date'), ys('Montant', [100, null, 150])];
      const checks = {};
      for (const [type, series, options] of [['bar', bars, {}], ['line', dates, { lineMarkers: true }], ['area', dates, {}], ['scatter', [xs('P', ['a', 'b']), ys('X', [1, 2]), ys('Y', [2, 1])], {}], ['pie', bars, {}], ['donut', bars, { showTotal: true }], ['bar', [xs('Mois', ['Mars']), ys('Montant', [5])], {}]]) {
        const picture = await pixelsOf(await ChartPlot.toImage(ChartPlot.figure(type, series, options), 480, 300));
        checks[type + (series.length === 2 && series[0].values.length === 1 ? '-one' : '')] = [picture.width, picture.height, inkOf(picture) > 3000];
      }
      return { pass: Object.values(checks).every(c => c[0] === 1440 && c[1] === 900 && c[2]), notes: JSON.stringify(checks) };
    },
  });

  // === 3) L'éditeur ========================================================================================================================================
  const waitFor = async (check, timeout) => { const end = Date.now() + (timeout || 4000); while (Date.now() < end) { if (check()) return true; await sleep(40); } return false; };
  const paper = () => document.querySelector('#pp-chart-modal .pp-chart-paper');
  const paperState = () => (paper() || {}).dataset && paper().dataset.state;
  const text = sel => (document.querySelector(sel) || {}).textContent;
  async function openWindow() {
    chartRow().click();
    await waitFor(() => modalOpen() && picker() && picker().options[0] && picker().options[0].textContent !== I18n.t('chart.pick.loading'), 6000);
    await sleep(40);
  }
  async function closeWindowIfOpen() {
    if (modalOpen()) cancelButton().click();
    await sleep(60);
  }
  async function settle() { await waitFor(() => paperState() !== 'loading', 25000); await sleep(40); }
  async function chooseChart(id) {
    picker().value = String(id);
    picker().dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(80);
    await settle();
  }
  async function chooseRows(value) {
    const input = radio(value);
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(80);
    await settle();
  }
  // Ouvre la fenêtre, choisit le graphique `id` (et les lignes `scope` s'il est donné) et valide.
  async function insertChart(id, scope) {
    await openWindow();
    await chooseChart(id);
    if (scope) await chooseRows(scope);
    okButton().click();
    await waitFor(() => !modalOpen(), 6000);
    await sleep(160);
  }
  function chartPos() {
    let found = null;
    EditorCore.getEditor().state.doc.descendants((node, pos) => { if (node.type.name === 'editorImage' && node.attrs.chartSection && found === null) found = pos; });
    return found;
  }
  async function selectChart() {
    EditorCore.getEditor().commands.setNodeSelection(chartPos());
    await sleep(160);
  }
  const chartAttrs = () => { const pos = chartPos(); return pos === null ? null : EditorCore.getEditor().state.doc.nodeAt(pos).attrs; };
  async function setDoc(h, html) {
    await h.resetEditor();
    Editor.setHTML(html);
    await sleep(150);
  }
  async function placeCursorAtEnd() {
    EditorCore.getEditor().commands.focus('end');
    await sleep(100);
  }
  // Le HTML d'un graphique tel que l'éditeur l'écrit : jamais d'image, ses références et sa taille.
  const chartHtml = (id, scope, name, style) => '<img class="editor-image" alt="Graphique" style="' + (style || 'width: 480px; height: 300px') + '" data-layer="normal" data-wrap="inline" data-chart-section="' + id + '" data-chart-scope="' + (scope || 'linked') + '" data-chart-name="' + (name || 'Ventes par mois') + '">';

  cases.push({
    id: 'chart_row_is_in_the_chain_menu_after_qr_code_with_its_icon_and_the_other_menus_are_unchanged',
    description: 'La ligne « Graphique de la page… » est dans le menu de la chaîne (« Lien et blocs de contenu »), sous « QR code… », avec son icône ; c\'est un vrai bouton, elle se clique et ouvre la fenêtre ; aucune nouvelle icône dans la barre, le menu Image est inchangé',
    run: async (h) => {
      await seed(h);
      const group = document.getElementById('v2-blocks-group');
      const flyout = document.getElementById('v2-blocks-flyout');
      const chain = Array.from(flyout.querySelectorAll('.v2-menu-row')).map(r => r.id);
      const imageRows = Array.from(document.getElementById('v2-image-flyout').querySelectorAll('.v2-hover-row')).map(r => r.id);
      const row = chartRow();
      const icon = row.querySelector('.v2-menu-row-icon svg');
      const info = {
        tag: row.tagName, type: row.getAttribute('type'), label: row.textContent.trim(), aria: row.getAttribute('aria-label'), role: row.getAttribute('role'), tabIndex: row.tabIndex,
        icons: group.querySelectorAll(':scope > button').length, hasIcon: !!icon && icon.querySelectorAll('path').length === 2, inImageMenu: document.getElementById('v2-image-flyout').contains(row), inToolbar: row.parentElement === document.getElementById('v2-toolbar'),
      };
      row.click();
      await sleep(250);
      const byClick = modalOpen();
      await closeWindowIfOpen();
      return {
        pass: same(chain, ['v2-row-link', 'v2-btn-citation', 'v2-btn-code-block', 'v2-btn-callout', 'v2-btn-signature', 'v2-btn-qr', 'v2-btn-chart']) && same(imageRows, ['v2-btn-image-from-variable'])
          && info.tag === 'BUTTON' && info.type === 'button' && info.label === 'Graphique de la page…' && info.aria === 'Insérer un graphique de la page' && info.role === null && info.tabIndex === 0 && info.icons === 1 && info.hasIcon && !info.inImageMenu && !info.inToolbar && byClick,
        notes: JSON.stringify({ chain, imageRows, info, byClick }),
      };
    },
  });

  cases.push({
    id: 'chart_row_is_greyed_in_header_email_and_macro_modes_never_removed_and_stays_active_in_a_grid',
    description: 'En-tête/pied et e-mail : la ligne se grise (jamais retirée) comme « QR code… » ; macro-modèle : tout le menu de la chaîne se grise avec elle ; grille : elle reste active (l\'image se pose sur sa case) pendant que « Encadré… » se grise',
    run: async (h) => {
      await setDoc(h, '<p>Texte</p>');
      MainToolbar.syncToolbarState();
      const free = !isLocked('v2-btn-chart') && !isLocked('v2-blocks-group');
      const realGetHfMode = HeaderFooterPreview.getHfMode;
      let inHf; let afterHf;
      try {
        HeaderFooterPreview.getHfMode = () => 'header';
        MainToolbar.syncToolbarState();
        inHf = isLocked('v2-btn-chart') && isLocked('v2-btn-qr') && isLocked('v2-btn-callout');
      } finally {
        HeaderFooterPreview.getHfMode = realGetHfMode;
        MainToolbar.syncToolbarState();
        afterHf = !isLocked('v2-btn-chart') && !isLocked('v2-btn-callout');
      }
      MainToolbar.setEmailMode(true);
      MainToolbar.syncToolbarState();
      const inEmail = isLocked('v2-btn-chart') && isLocked('v2-image-group') && !isLocked('v2-blocks-group');
      MainToolbar.setEmailMode(false);
      MainToolbar.syncToolbarState();
      const afterEmail = !isLocked('v2-btn-chart');
      MainToolbar.setMacroMode(true);
      MainToolbar.syncToolbarState();
      const inMacro = isLocked('v2-blocks-group');
      MainToolbar.setMacroMode(false);
      MainToolbar.syncToolbarState();
      const afterMacro = !isLocked('v2-blocks-group') && !isLocked('v2-btn-chart');
      MainToolbar.setGridMode(true);
      MainToolbar.syncToolbarState();
      const inGrid = !isLocked('v2-btn-chart') && isLocked('v2-btn-callout');
      MainToolbar.setGridMode(false);
      MainToolbar.syncToolbarState();
      return { pass: free && inHf && afterHf && inEmail && afterEmail && inMacro && afterMacro && inGrid && !!chartRow(), notes: JSON.stringify({ free, inHf, afterHf, inEmail, afterEmail, inMacro, afterMacro, inGrid }) };
    },
  });

  cases.push({
    id: 'chart_window_lists_the_charts_by_page_greys_the_ones_it_cannot_redraw_and_starts_with_insert_disabled',
    description: 'La fenêtre liste les graphiques de la page rangés par page (« Page : Ventes », « Page : Clients »), le nom du graphique suivi de (type · table) quand il a un titre ; les graphiques que le widget ne sait pas redessiner portent leur raison ; « Insérer » grisé tant qu\'aucun n\'est choisi ; ce widget et une vue sans page ne sont pas listés',
    run: async (h) => {
      await seed(h);
      await openWindow();
      const groups = Array.from(picker().querySelectorAll('optgroup')).map(g => ({ label: g.label, ids: Array.from(g.querySelectorAll('option')).map(o => o.value) }));
      const option = id => picker().querySelector('option[value="' + id + '"]');
      const info = {
        groups, title: text('#pp-chart-title'), placeholder: picker().options[0].textContent, placeholderDisabled: picker().options[0].disabled, selected: picker().value, okDisabled: okButton().disabled, message: previewMessage().textContent,
        first: option(101).textContent, second: option(102).textContent, third: option(113).textContent, reasons: [105, 106, 107, 110, 101].map(id => option(id).dataset.unavailable || ''),
        label: text('#pp-chart-modal .pp-dialog-label'), cancel: cancelButton().textContent, ok: okButton().textContent,
      };
      await closeWindowIfOpen();
      return {
        pass: same(groups, [{ label: 'Page : Ventes', ids: ['101', '102'] }, { label: 'Page : Clients', ids: ['103', '104', '105', '106', '107', '108', '109', '110', '113'] }])
          && info.title === 'Insérer un graphique de la page' && info.placeholder === '— Choisir un graphique —' && info.placeholderDisabled && info.selected === '' && info.okDisabled && info.message === 'Choisissez un graphique.'
          && info.first === 'Ventes par mois (Barres · GfVentes)' && info.second === 'GfVentes (Courbe)' && info.third === 'Clients par ville (Secteurs · GfClients)'
          && info.reasons[0] === 'Kaplan-Meier : pas encore redessiné.' && info.reasons[1].indexOf('Split series') !== -1 && info.reasons[2].indexOf('Error bars') !== -1 && info.reasons[3].indexOf('Widget personnalisé') === 0 && info.reasons[4] === ''
          && info.label === 'Graphique' && info.cancel === 'Annuler' && info.ok === 'Insérer',
        notes: JSON.stringify(info),
      };
    },
  });

  cases.push({
    id: 'chart_window_without_any_chart_says_so_under_the_field_and_a_read_failure_is_shown',
    description: 'Sans aucun graphique dans les pages, la fenêtre le dit sous le champ (avec la marche à suivre dans Grist) et « Insérer » reste grisé ; si la lecture des réglages échoue, un message le dit',
    run: async (h) => {
      await seed(h, []);
      await openWindow();
      const none = { hint: text('#pp-chart-hint'), disabled: picker().disabled, ok: okButton().disabled, options: picker().options.length };
      await closeWindowIfOpen();
      await seed(h);
      const real = GristAPI.fetchTableRows;
      GristAPI.fetchTableRows = async (name) => { if (name === '_grist_Views_section') throw new Error('accès refusé'); return real(name); };
      let failed;
      try {
        await openWindow();
        await sleep(150);
        failed = { error: !document.getElementById('pp-chart-error').hidden, text: text('#pp-chart-error'), ok: okButton().disabled };
      } finally {
        GristAPI.fetchTableRows = real;
        await closeWindowIfOpen();
      }
      return {
        pass: /Aucun graphique dans les pages de ce document/.test(none.hint) && /Ajouter un widget/.test(none.hint) && none.disabled && none.ok && none.options === 1 && failed.error && failed.text === 'Les graphiques du document n’ont pas pu être lus.' && failed.ok,
        notes: JSON.stringify({ none, failed }),
      };
    },
  });

  cases.push({
    id: 'chart_insert_a_linked_chart_makes_a_frame_node_without_image_of_the_default_size',
    description: 'Un graphique d\'une autre table s\'insère avec « les lignes liées » par défaut (une règle de liaison existe) : l\'aperçu montre le graphique de la ligne en cours, le nœud n\'a ni image ni src (480 x 300 px), porte le numéro de la section, le mode et le nom, un seul Annuler le retire, l\'éditeur reprend le focus',
    run: async (h) => {
      await seed(h);
      await setDoc(h, '<p>Avant</p>');
      await placeCursorAtEnd();
      await openWindow();
      await chooseChart(101);
      const preview = { state: paperState(), shown: !previewImage().hidden && previewMessage().hidden, uri: previewImage().src.slice(0, 22), caption: text('#pp-chart-modal .pp-chart-caption'), linked: radio('linked').checked, all: radio('all').checked, ok: !okButton().disabled };
      okButton().click();
      await waitFor(() => !modalOpen(), 6000);
      await sleep(160);
      const node = chartNodes()[0];
      const attrs = chartAttrs();
      const focused = document.activeElement && document.activeElement.closest('.tiptap') !== null;
      await h.clickButton('v2-btn-undo');
      await sleep(150);
      const afterUndo = chartNodes().length;
      await h.clickButton('v2-btn-redo');
      await sleep(150);
      return {
        pass: preview.state === 'chart' && preview.shown && preview.uri === 'data:image/png;base64,' && preview.caption === 'Pour la ligne en cours.' && preview.linked && !preview.all && preview.ok
          && !!node && !node.hasAttribute('src') && node.getAttribute('data-chart-section') === '101' && node.getAttribute('data-chart-scope') === 'linked' && node.getAttribute('data-chart-name') === 'Ventes par mois'
          && node.style.width === '480px' && node.style.height === '300px' && attrs.src === null && attrs.alt === 'Graphique : Ventes par mois' && !Editor.getHTML().includes('data:image/png') && focused && afterUndo === 0 && chartNodes().length === 1,
        notes: JSON.stringify({ preview, node: node && node.outerHTML.slice(0, 260), focused, afterUndo }),
      };
    },
  });

  cases.push({
    id: 'chart_of_the_document_table_can_only_plot_the_whole_table_and_says_why',
    description: 'Un graphique de la table du document (ici les clients) ne peut tracer que « toute la table » : la case « liées » est grisée avec sa raison, l\'autre est cochée ; l\'aperçu se dessine ; l\'insertion garde le mode « toute la table »',
    run: async (h) => {
      await seed(h);
      await setDoc(h, '<p>Avant</p>');
      await placeCursorAtEnd();
      await openWindow();
      await chooseChart(113);
      const info = { linkedOff: radio('linked').disabled, linkedClass: radio('linked').closest('label').classList.contains('is-off'), allChecked: radio('all').checked, detail: text('#pp-chart-modal .pp-chart-option:first-of-type .pp-chart-option-detail') || text('#pp-chart-modal .pp-chart-rows .pp-chart-option-detail'), state: paperState(), caption: previewImage().hidden ? 'x' : document.querySelector('#pp-chart-modal .pp-chart-caption').hidden };
      okButton().click();
      await waitFor(() => !modalOpen(), 6000);
      await sleep(160);
      const attrs = chartAttrs();
      return { pass: info.linkedOff && info.linkedClass && info.allChecked && /Indisponible : le graphique est de la table du document/.test(info.detail) && info.state === 'chart' && info.caption === true && attrs.chartScope === 'all' && attrs.chartSection === '113', notes: JSON.stringify({ info, scope: attrs && attrs.chartScope }) };
    },
  });

  cases.push({
    id: 'chart_rows_choice_changes_the_preview_and_the_all_table_mode_is_one_graph_for_every_row',
    description: 'Les lignes liées donnent le graphique de la ligne en cours (client 1 : deux ventes), « toute la table » les cinq ventes : deux images différentes ; « toute la table » n\'écrit plus « Pour la ligne en cours » sous l\'aperçu',
    run: async (h) => {
      await seed(h);
      await openWindow();
      await chooseChart(101);
      const linked = previewImage().src;
      const captionLinked = !document.querySelector('#pp-chart-modal .pp-chart-caption').hidden;
      await chooseRows('all');
      const all = previewImage().src;
      const captionAll = !document.querySelector('#pp-chart-modal .pp-chart-caption').hidden;
      await chooseRows('linked');
      const again = previewImage().src;
      window.__gristStub.fireRecord(Object.assign({}, clients[2]), PAGE_TABLE);
      await sleep(80);
      await chooseChart(101);
      const other = previewImage().src;
      await closeWindowIfOpen();
      return { pass: linked.startsWith('data:image/png') && all.startsWith('data:image/png') && linked !== all && captionLinked && !captionAll && again === linked && other !== linked, notes: JSON.stringify({ lengths: [linked.length, all.length, other.length], captionLinked, captionAll, sameAgain: again === linked }) };
    },
  });

  cases.push({
    id: 'chart_unsupported_or_missing_chart_cannot_be_inserted_and_a_removed_chart_is_flagged_when_editing',
    description: 'Un graphique grisé (Kaplan-Meier) ne s\'insère pas (« Insérer » grisé, message d\'aperçu) ; ouvrir la fenêtre sur un graphique supprimé dans Grist affiche « Ce graphique n\'existe plus dans Grist » et ne permet pas de valider',
    run: async (h) => {
      await seed(h);
      await openWindow();
      await chooseChart(105);
      const grey = { ok: okButton().disabled, state: paperState(), message: previewMessage().textContent };
      await closeWindowIfOpen();
      await setDoc(h, '<p>Avant</p><p>' + chartHtml(999, 'linked', 'Supprimé') + '</p>');
      await selectChart();
      await openWindow();
      const gone = { error: !document.getElementById('pp-chart-error').hidden, text: text('#pp-chart-error'), ok: okButton().disabled, selected: picker().value, invalid: picker().getAttribute('aria-invalid'), title: text('#pp-chart-title') };
      await closeWindowIfOpen();
      return {
        pass: grey.ok && grey.state === 'unsupported' && grey.message === 'Le widget ne sait pas encore redessiner ce graphique.' && gone.error && gone.text === 'Ce graphique n’existe plus dans Grist. Choisissez-en un autre.' && gone.ok && gone.selected === '' && gone.invalid === 'true' && gone.title === 'Modifier le graphique',
        notes: JSON.stringify({ grey, gone }),
      };
    },
  });

  cases.push({
    id: 'chart_linked_rows_without_a_link_rule_ask_for_it_on_insert_and_a_refusal_keeps_the_window_open',
    description: 'Sans règle de liaison entre les tables, le mode par défaut est « toute la table » ; « liées » le dit (« à régler à la validation », aperçu « Liaison à régler ») ; « Insérer » demande la liaison (comme une bulle d\'une autre table) : refusée, la fenêtre reste ouverte et rien n\'est inséré ; acceptée, le graphique s\'insère',
    run: async (h) => {
      await seed(h);
      await GristAPI.deleteLinkRule(SALES);
      await GristAPI.refreshSchema();
      await setDoc(h, '<p>Avant</p>');
      await placeCursorAtEnd();
      const real = Variables.ensureLinkConfigured;
      const calls = [];
      let answer = false;
      Variables.ensureLinkConfigured = async (opts) => { calls.push(opts && opts.table); return answer; };
      try {
        await openWindow();
        await chooseChart(101);
        const defaults = { all: radio('all').checked, linked: radio('linked').checked };
        await chooseRows('linked');
        const needs = { detail: text('#pp-chart-modal .pp-chart-rows .pp-chart-option .pp-chart-option-detail'), state: paperState(), message: previewMessage().textContent, ok: !okButton().disabled };
        okButton().click();
        await sleep(300);
        const refused = { open: modalOpen(), count: chartNodes().length, calls: calls.slice() };
        answer = true;
        okButton().click();
        await waitFor(() => !modalOpen(), 6000);
        await sleep(160);
        const accepted = { open: modalOpen(), count: chartNodes().length, scope: chartAttrs() && chartAttrs().chartScope, calls: calls.slice() };
        return {
          pass: defaults.all && !defaults.linked && /La liaison entre les deux tables se règle à la validation/.test(needs.detail) && needs.state === 'needsLink' && needs.message === 'Liaison avec « GfVentes » à régler : l’aperçu viendra ensuite.' && needs.ok
            && refused.open && refused.count === 0 && same(refused.calls, [SALES]) && !accepted.open && accepted.count === 1 && accepted.scope === 'linked' && same(accepted.calls, [SALES, SALES]),
          notes: JSON.stringify({ defaults, needs, refused, accepted }),
        };
      } finally {
        Variables.ensureLinkConfigured = real;
        await closeWindowIfOpen();
      }
    },
  });

  cases.push({
    id: 'chart_node_attributes_survive_the_html_round_trip_and_two_charts_are_never_merged_or_given_an_image',
    description: 'Les trois références (`data-chart-section`, `data-chart-scope`, `data-chart-name`) survivent à l\'enregistrement du modèle et à sa relecture, sans jamais recevoir de src ; deux graphiques côte à côte restent deux nœuds ; une image ordinaire à côté n\'est pas prise pour un graphique',
    run: async (h) => {
      await setDoc(h, '<p>' + chartHtml(101, 'linked', 'Ventes par mois') + chartHtml(102, 'all', 'Courbe &amp; coût') + '</p><p><img class="editor-image" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="Image" style="width: 40px"></p>');
      const html = Editor.getHTML();
      const nodes = chartNodes();
      Editor.setHTML(html);
      await sleep(150);
      const again = chartNodes();
      const view = tiptap().querySelectorAll('.editor-image-view');
      return {
        pass: nodes.length === 2 && again.length === 2 && same(again.map(n => [n.getAttribute('data-chart-section'), n.getAttribute('data-chart-scope'), n.getAttribute('data-chart-name')]), [['101', 'linked', 'Ventes par mois'], ['102', 'all', 'Courbe & coût']])
          && again.every(n => !n.hasAttribute('src')) && parse(html).querySelectorAll('img').length === 3 && view.length === 3 && !html.includes('data:image/png'),
        notes: JSON.stringify({ nodes: nodes.length, again: again.map(n => n.outerHTML.slice(0, 200)) }),
      };
    },
  });

  cases.push({
    id: 'chart_frame_in_the_editor_shows_the_chart_name_with_a_chart_icon_at_the_size_set_and_never_an_image',
    description: 'Dans l\'éditeur le graphique est un cadre pointillé (comme une image de variable) à la taille réglée, avec l\'icône d\'un graphique et son nom ; il n\'a aucune image ; la taille réglée (largeur ET hauteur) est celle du cadre',
    run: async (h) => {
      await setDoc(h, '<p>Avant</p><p>' + chartHtml(101, 'linked', 'Ventes par mois', 'width: 300px; height: 180px') + '</p>');
      const view = tiptap().querySelector('.editor-image-view.editor-image-chart-placeholder');
      const label = view && view.querySelector('.editor-image-var-label');
      const rect = view && view.getBoundingClientRect();
      const labelBefore = label && getComputedStyle(label, '::before');
      const attrs = chartAttrs();
      return {
        pass: !!view && view.classList.contains('editor-image-var-placeholder') && label.textContent === 'Ventes par mois' && rect.width >= 300 && rect.width <= 303 && rect.height >= 180 && rect.height <= 183 && attrs.src === null
          && labelBefore.maskImage !== 'none' && labelBefore.width === '28px' && Array.from(view.querySelectorAll('img')).every(i => !i.getAttribute('src')),
        notes: JSON.stringify({ rect: rect && [rect.width, rect.height], label: label && label.textContent, mask: labelBefore && labelBefore.maskImage.slice(0, 24), attrs: attrs && [attrs.width, attrs.height] }),
      };
    },
  });

  cases.push({
    id: 'chart_row_reads_edit_when_a_chart_is_selected_and_editing_keeps_size_place_and_wrapping',
    description: 'La ligne devient « Modifier le graphique… » (et son nom accessible) quand un graphique est sélectionné, pas pour une image ordinaire ni un QR code ; la fenêtre s\'ouvre sur le graphique et ses lignes ; changer de graphique et de lignes garde la taille, la place et l\'habillage du cadre',
    run: async (h) => {
      await seed(h);
      await setDoc(h, '<p>Avant</p><p><img class="editor-image" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="Image" style="width: 40px"></p><p>' + chartHtml(101, 'linked', 'Ventes par mois', 'width: 300px; height: 180px') + '</p>');
      let plain;
      EditorCore.getEditor().state.doc.descendants((node, pos) => { if (node.type.name === 'editorImage' && !node.attrs.chartSection && plain === undefined) plain = pos; });
      EditorCore.getEditor().commands.setNodeSelection(plain);
      await sleep(150);
      const onPlain = { label: chartRow().textContent.trim(), active: chartRow().classList.contains('is-active') };
      await selectChart();
      const onChart = { label: chartRow().textContent.trim(), aria: chartRow().getAttribute('aria-label'), active: chartRow().classList.contains('is-active') };
      await openWindow();
      const opened = { title: text('#pp-chart-title'), ok: okButton().textContent, selected: picker().value, linked: radio('linked').checked, enabled: !okButton().disabled };
      await settle();
      await chooseChart(102);
      await chooseRows('all');
      okButton().click();
      await waitFor(() => !modalOpen(), 6000);
      await sleep(160);
      const after = chartAttrs();
      const nodes = chartNodes();
      return {
        pass: onPlain.label === 'Graphique de la page…' && !onPlain.active && onChart.label === 'Modifier le graphique…' && onChart.aria === 'Modifier le graphique' && onChart.active
          && opened.title === 'Modifier le graphique' && opened.ok === 'Valider' && opened.selected === '101' && opened.linked && opened.enabled
          && nodes.length === 1 && after.chartSection === '102' && after.chartScope === 'all' && after.chartName === SALES && after.width === '300px' && after.height === '180px' && after.layer === 'normal' && after.wrap === 'inline',
        notes: JSON.stringify({ onPlain, onChart, opened, after: after && { section: after.chartSection, scope: after.chartScope, name: after.chartName, w: after.width, h: after.height, layer: after.layer, wrap: after.wrap }, nodes: nodes.length }),
      };
    },
  });

  cases.push({
    id: 'chart_window_and_row_follow_the_interface_language',
    description: 'La ligne du menu, la fenêtre (insertion puis modification), la liste (« Page : … »), les raisons grisées et les messages passent en anglais avec la langue de l\'interface, puis reviennent en français',
    run: async (h) => {
      await seed(h);
      await setDoc(h, '<p>Avant</p><p>' + chartHtml(101, 'linked', 'Ventes par mois') + '</p>');
      await placeCursorAtEnd();
      I18n.setLang('en');
      await sleep(150);
      const en = {};
      try {
        en.row = chartRow().textContent.trim();
        en.aria = chartRow().getAttribute('aria-label');
        await openWindow();
        Object.assign(en, {
          title: text('#pp-chart-title'), label: text('#pp-chart-modal .pp-dialog-label'), placeholder: picker().options[0].textContent, group: picker().querySelector('optgroup').label, kaplan: picker().querySelector('option[value="105"]').dataset.unavailable,
          custom: picker().querySelector('option[value="110"]').dataset.unavailable, type: picker().querySelector('option[value="101"]').textContent, empty: previewMessage().textContent, ok: okButton().textContent, cancel: cancelButton().textContent,
          rows: text('#pp-chart-modal .pp-chart-rows legend'),
        });
        await chooseChart(101);
        en.caption = text('#pp-chart-modal .pp-chart-caption');
        await closeWindowIfOpen();
        await selectChart();
        en.rowEdit = chartRow().textContent.trim();
        en.ariaEdit = chartRow().getAttribute('aria-label');
        await openWindow();
        en.titleEdit = text('#pp-chart-title');
        en.okEdit = okButton().textContent;
        await closeWindowIfOpen();
      } finally {
        await closeWindowIfOpen();
        I18n.setLang('fr');
        await sleep(150);
      }
      const back = { label: chartRow().textContent.trim(), aria: chartRow().getAttribute('aria-label') };
      return {
        pass: en.row === 'Chart from the page…' && en.aria === 'Insert a chart from the page' && en.title === 'Insert a chart from the page' && en.label === 'Chart' && en.placeholder === '— Choose a chart —' && en.group === 'Page: Ventes'
          && en.kaplan === 'Kaplan-Meier: not redrawn yet.' && /^Custom widget/.test(en.custom) && en.type === 'Ventes par mois (Bars · GfVentes)' && en.empty === 'Choose a chart.' && en.ok === 'Insert' && en.cancel === 'Cancel' && en.rows === 'Rows to plot' && en.caption === 'For the current row.'
          && en.rowEdit === 'Edit chart…' && en.ariaEdit === 'Edit the chart' && en.titleEdit === 'Edit the chart' && en.okEdit === 'Confirm' && back.label === 'Modifier le graphique…' && back.aria === 'Modifier le graphique',
        notes: JSON.stringify({ en, back }),
      };
    },
  });

  cases.push({
    id: 'chart_window_does_not_open_when_the_editor_is_read_only',
    description: 'Un éditeur non modifiable (Lecture, compte Lecteur) n\'ouvre pas la fenêtre : `ChartBlock.open()` rend faux',
    run: async (h) => {
      await seed(h);
      const ed = EditorCore.getEditor();
      ed.setEditable(false);
      let opened;
      try { opened = ChartBlock.open(); await sleep(150); } finally { ed.setEditable(true); }
      const shown = modalOpen();
      await closeWindowIfOpen();
      return { pass: opened === false && !shown, notes: JSON.stringify({ opened, shown }) };
    },
  });

  // === 4) Les rendus : Lecture, PDF, Word, Excel ============================================================================================================
  async function renderReader(html, record) {
    const reader = document.getElementById('reader-container');
    reader.style.display = 'block';
    await ReaderMode.render(html, PAGE_TABLE, record || GristAPI.getCurrentRecord(), NO_HF);
    return reader.querySelector('.reader-content');
  }
  async function previewOf(html, record) {
    const box = document.createElement('div');
    box.innerHTML = await ReaderMode.preview(html, PAGE_TABLE, record || GristAPI.getCurrentRecord());
    return box;
  }
  const docOf = (...blocks) => '<p>Avant</p>' + blocks.map(b => '<p>' + b + '</p>').join('') + '<p>Après</p>';
  const bytesOf = uri => Uint8Array.from(atob(uri.slice(uri.indexOf(',') + 1)), c => c.charCodeAt(0));
  const sameBytes = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  // Le nombre de pixels proches de `rgb` (à `tolerance` près) dans un canevas.
  function nearColor(canvas, rgb, tolerance) {
    const data = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) if (Math.abs(data[i] - rgb[0]) <= tolerance && Math.abs(data[i + 1] - rgb[1]) <= tolerance && Math.abs(data[i + 2] - rgb[2]) <= tolerance) n += 1;
    return n;
  }
  const BAR_BLUE = [43, 120, 174];

  cases.push({
    id: 'chart_reader_draws_the_chart_of_the_displayed_row_as_a_png_of_the_size_set_in_the_editor',
    description: 'Lecture : le graphique est une image PNG tracée pour la ligne affichée (client 1, 2 puis 3 : trois images différentes), à la taille réglée dans l\'éditeur (480 x 300 px, image de 1 440 x 900), sans hauteur figée ; « toute la table » donne la même image pour toutes les lignes ; le modèle n\'a toujours pas d\'image',
    run: async (h) => {
      await seed(h);
      const linked = docOf(chartHtml(101, 'linked'));
      const all = docOf(chartHtml(101, 'all'));
      const srcFor = async (html, id) => { const content = await renderReader(html, recordOf(id)); const img = content.querySelector('img'); return img ? { src: img.getAttribute('src'), width: img.style.width, height: img.style.height, ratio: img.style.aspectRatio, count: content.querySelectorAll('img').length } : null; };
      const one = await srcFor(linked, 1);
      const two = await srcFor(linked, 2);
      const three = await srcFor(linked, 3);
      const allOne = await srcFor(all, 1);
      const allTwo = await srcFor(all, 2);
      const picture = one && await pixelsOf(one.src);
      return {
        pass: !!one && !!two && !!three && one.src.startsWith('data:image/png;base64,') && picture.width === 1440 && picture.height === 900 && one.width === '480px' && one.height === '' && one.ratio === '480 / 300' && one.count === 1
          && one.src !== two.src && two.src !== three.src && one.src !== three.src && allOne.src === allTwo.src && allOne.src !== one.src && !chartNodes().length,
        notes: JSON.stringify({ one: one && { w: one.width, h: one.height, r: one.ratio }, picture: picture && [picture.width, picture.height], differs: [one && two && one.src !== two.src, two && three && two.src !== three.src], all: allOne && allTwo && allOne.src === allTwo.src }),
      };
    },
  });

  cases.push({
    id: 'chart_reader_follows_the_size_and_the_ratio_of_the_frame_and_draws_each_chart_of_the_document',
    description: 'Lecture : un cadre de 240 x 120 px donne une image de 720 x 360 aux mêmes proportions (aspect-ratio 240 / 120) ; sans taille réglée le graphique a la taille par défaut ; deux graphiques d\'un même document sont tracés chacun à sa taille',
    run: async (h) => {
      await seed(h);
      const small = chartHtml(101, 'linked', 'a', 'width: 240px; height: 120px');
      const bare = '<img class="editor-image" alt="Graphique" data-layer="normal" data-wrap="inline" data-chart-section="102" data-chart-scope="all" data-chart-name="b">';
      const content = await renderReader(docOf(small, bare), recordOf(1));
      const imgs = Array.from(content.querySelectorAll('img'));
      const sizes = [];
      for (const img of imgs) { const picture = await pixelsOf(img.getAttribute('src')); sizes.push([picture.width, picture.height, img.style.width, img.style.aspectRatio]); }
      return { pass: imgs.length === 2 && same(sizes[0], [720, 360, '240px', '240 / 120']) && same(sizes[1], [1440, 900, '480px', '480 / 300']), notes: JSON.stringify(sizes) };
    },
  });

  cases.push({
    id: 'chart_reader_a_row_without_rows_to_plot_has_no_image_and_a_missing_chart_leaves_a_note_in_the_interface_language',
    description: 'Lecture : un client sans aucune vente n\'a pas d\'image (le texte autour reste, aucune note) ; un graphique supprimé dans Grist, un graphique grisé (Kaplan-Meier) ou un tracé qui échoue laissent « [Graphique indisponible] » (« [Chart unavailable] » en anglais), jamais une image cassée',
    run: async (h) => {
      await seed(h);
      const noRows = await renderReader(docOf(chartHtml(101, 'linked')), { id: 99, Nom: 'Sans vente' });
      const empty = { images: noRows.querySelectorAll('img').length, notes: noRows.querySelectorAll('.error-msg').length, text: noRows.textContent.includes('Avant') && noRows.textContent.includes('Après') };
      const gone = await renderReader(docOf(chartHtml(999, 'linked')), recordOf(1));
      const goneNote = gone.querySelector('.error-msg');
      const kaplan = await renderReader(docOf(chartHtml(105, 'all')), recordOf(1));
      const real = ChartPlot.toImage;
      ChartPlot.toImage = async () => { throw new Error('bibliothèque absente'); };
      let broken;
      try { broken = await renderReader(docOf(chartHtml(101, 'all')), recordOf(1)); } finally { ChartPlot.toImage = real; }
      I18n.setLang('en');
      await sleep(100);
      let english;
      try { english = await renderReader(docOf(chartHtml(999, 'linked')), recordOf(1)); } finally { I18n.setLang('fr'); await sleep(100); }
      return {
        pass: empty.images === 0 && empty.notes === 0 && empty.text && !!goneNote && goneNote.textContent === '[Graphique indisponible]' && gone.querySelectorAll('img').length === 0 && kaplan.querySelector('.error-msg').textContent === '[Graphique indisponible]'
          && broken.querySelector('.error-msg').textContent === '[Graphique indisponible]' && broken.querySelectorAll('img').length === 0 && english.querySelector('.error-msg').textContent === '[Chart unavailable]',
        notes: JSON.stringify({ empty, gone: goneNote && goneNote.textContent, kaplan: kaplan.querySelector('.error-msg') && kaplan.querySelector('.error-msg').textContent, broken: broken.querySelector('.error-msg') && broken.querySelector('.error-msg').textContent, english: english.querySelector('.error-msg') && english.querySelector('.error-msg').textContent }),
      };
    },
  });

  cases.push({
    id: 'chart_preview_used_by_the_exports_resolves_the_chart_too',
    description: 'L\'aperçu de la ligne (ReaderMode.preview, ce que lisent le PDF, le Word et l\'Excel) contient le même PNG que la Lecture pour la ligne, et rien pour une ligne sans vente',
    run: async (h) => {
      await seed(h);
      const html = docOf(chartHtml(101, 'linked'));
      const reader = (await renderReader(html, recordOf(1))).querySelector('img');
      const preview = (await previewOf(html, recordOf(1))).querySelector('img');
      const none = (await previewOf(html, { id: 99, Nom: 'Sans vente' })).querySelectorAll('img').length;
      return { pass: !!reader && !!preview && reader.getAttribute('src') === preview.getAttribute('src') && none === 0, notes: JSON.stringify({ same: reader && preview && reader.getAttribute('src') === preview.getAttribute('src'), none }) };
    },
  });

  async function pdfCanvas(base64) {
    await TestHelpers.ensurePdfJsLoaded();
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d', { willReadFrequently: true }), viewport }).promise;
    return canvas;
  }

  cases.push({
    id: 'chart_pdf_embeds_the_same_png_as_the_reader_at_the_size_set_and_a_row_without_rows_has_no_image',
    description: 'PDF : le graphique est une image PNG de 360 pt de large (480 px) et de 225 pt de haut, la MÊME image que la Lecture pour la ligne ; le PDF rendu par pdf.js contient les barres bleues du graphique ; une ligne sans vente n\'a aucune image ; trois lignes, trois PDF différents',
    run: async (h) => {
      await seed(h);
      const html = docOf(chartHtml(101, 'linked'));
      const out = [];
      for (const id of [1, 3]) {
        const result = await h.exportPdfContent(html, null, null, { tableId: PAGE_TABLE, record: recordOf(id) });
        const images = h.findImages(result.content);
        out.push({ images, result });
      }
      const noRows = await h.exportPdfContent(html, null, null, { tableId: PAGE_TABLE, record: { id: 99, Nom: 'Sans vente' } });
      const one = out[0].images[0];
      const reader = (await renderReader(html, recordOf(1))).querySelector('img').getAttribute('src');
      const canvas = await pdfCanvas(out[0].result.base64);
      const blue = nearColor(canvas, BAR_BLUE, 14);
      const pdfSrc = one && (typeof one.image === 'string' && one.image.startsWith('data:') ? one.image : (out[0].result.docDefinition.images || {})[one.image]);
      return {
        pass: out[0].images.length === 1 && out[1].images.length === 1 && !!one && Math.abs(one.width - 360) < 0.6 && (one.height === undefined || Math.abs(one.height - 225) < 0.6) && pdfSrc === reader && blue > 2500
          && h.findImages(noRows.content).length === 0 && pdfSrc !== (out[1].images[0].image.startsWith('data:') ? out[1].images[0].image : (out[1].result.docDefinition.images || {})[out[1].images[0].image]),
        notes: JSON.stringify({ images: out.map(o => o.images.map(i => [i.width, i.height, i.fit, String(i.image).slice(0, 24)])), sameAsReader: pdfSrc === reader, blue, noRows: h.findImages(noRows.content).length }),
      };
    },
  });

  async function docxFor(html, record) {
    await ExportCommon.ensureJsZipLoaded();
    await DocxExport.ensureDocxLibLoaded();
    const { blob } = await DocxExport.getDocxBlobForRecord(html, PAGE_TABLE, record, '', null, null);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const names = Object.keys(zip.files).filter(n => n.startsWith('word/media/') && !zip.files[n].dir);
    const document = new DOMParser().parseFromString(await zip.file('word/document.xml').async('string'), 'application/xml');
    const media = [];
    for (const name of names) { const bytes = await zip.file(name).async('uint8array'); media.push({ name, bytes, url: URL.createObjectURL(new Blob([bytes], { type: 'image/png' })) }); }
    return { document, media };
  }

  cases.push({
    id: 'chart_docx_embeds_the_same_png_as_the_reader_inline_at_the_size_set_and_a_row_without_rows_has_no_image',
    description: 'Word : le graphique est une image PNG dans le flux du texte de 360 x 225 pt (la MÊME image que la Lecture, 1 440 x 900) ; une ligne sans vente n\'a aucune image',
    run: async (h) => {
      await seed(h);
      const html = docOf(chartHtml(101, 'linked'));
      const filled = await docxFor(html, recordOf(1));
      const empty = await docxFor(html, { id: 99, Nom: 'Sans vente' });
      const drawings = h.docxDrawings(filled.document);
      const reader = (await renderReader(html, recordOf(1))).querySelector('img').getAttribute('src');
      const picture = filled.media[0] && await pixelsOf(filled.media[0].url);
      return {
        pass: filled.media.length === 1 && drawings.length === 1 && drawings[0].kind === 'inline' && Math.abs(drawings[0].widthPt - 360) < 0.6 && Math.abs(drawings[0].heightPt - 225) < 0.6
          && picture.width === 1440 && picture.height === 900 && sameBytes(filled.media[0].bytes, bytesOf(reader)) && empty.media.length === 0 && h.docxDrawings(empty.document).length === 0,
        notes: JSON.stringify({ drawings: drawings.map(d => [d.kind, d.widthPt, d.heightPt]), media: filled.media.map(m => m.name), picture: picture && [picture.width, picture.height], empty: empty.media.length }),
      };
    },
  });

  async function xlsxOfGrid(frame, record) {
    GridEditor.setActive(false);
    Editor.setHTML(`<table style="width: 300px;"><colgroup><col style="width: 150px;"><col style="width: 150px;"></colgroup><tbody><tr data-row-height="140" style="height: 140px"><td colwidth="150"><p>Avant</p></td><td colwidth="150"><p>${frame}</p></td></tr></tbody></table>`);
    GridEditor.setActive(true);
    await sleep(250);
    try {
      await ExportCommon.ensureJsZipLoaded();
      const { blob } = await XlsxExport.getXlsxBlobForRecord(Editor.getHTML(), PAGE_TABLE, record, '');
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const media = Object.keys(zip.files).filter(n => n.startsWith('xl/media/') && !zip.files[n].dir);
      const drawingName = Object.keys(zip.files).find(n => /^xl\/drawings\/drawing\d+\.xml$/.test(n));
      const drawing = drawingName ? await zip.file(drawingName).async('string') : '';
      const pictures = [];
      for (const name of media) pictures.push(await pixelsOf(URL.createObjectURL(new Blob([await zip.file(name).async('uint8array')], { type: 'image/png' }))));
      return { media: media.length, pictures, anchor: /<xdr:from><xdr:col>(\d+)<\/xdr:col>.*?<xdr:row>(\d+)<\/xdr:row>/.exec(drawing), ext: /<xdr:ext cx="(\d+)" cy="(\d+)"/.exec(drawing) };
    } finally {
      GridEditor.setActive(false);
    }
  }

  cases.push({
    id: 'chart_xlsx_puts_the_chart_of_a_grid_cell_on_its_cell_and_a_row_without_rows_has_no_image',
    description: 'Excel (grille) : le graphique d\'une case est une image PNG du classeur posée sur sa case (colonne B, ligne 1), aux proportions réglées (140 x 90 px) ; une ligne sans vente n\'a aucune image',
    run: async (h) => {
      await seed(h);
      const frame = chartHtml(101, 'linked', 'Ventes par mois', 'width: 140px; height: 90px');
      const filled = await xlsxOfGrid(frame, recordOf(1));
      const empty = await xlsxOfGrid(frame, { id: 99, Nom: 'Sans vente' });
      const ratio = filled.ext && Number(filled.ext[1]) / Number(filled.ext[2]);
      return {
        pass: filled.media === 1 && filled.pictures[0].width === 420 && filled.pictures[0].height === 270 && !!filled.anchor && filled.anchor[1] === '1' && filled.anchor[2] === '0' && Math.abs(ratio - 140 / 90) < 0.02 && empty.media === 0,
        notes: JSON.stringify({ media: filled.media, picture: filled.pictures[0] && [filled.pictures[0].width, filled.pictures[0].height], anchor: filled.anchor && filled.anchor.slice(1, 3), ext: filled.ext && filled.ext.slice(1, 3), empty: empty.media }),
      };
    },
  });

  // Le document de ce fichier (les deux tables, les graphiques de la page) pour dev-tests/verify-chart-mouse.mjs, qui le charge dans sa page : une seule description des données.
  window.__chartFixture = { seed, baseCharts, installCharts, clients, sales };

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.chart = cases;
})();
