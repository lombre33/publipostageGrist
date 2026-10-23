// Les graphiques de la page, lus dans les réglages de Grist (chart-block.js les choisit et les dessine, chart-plot.js trace). Le widget ne recopie
// aucun réglage : un graphique de Grist est une section de page (`_grist_Views_section`, `parentKey` « chart ») dont le type, les options, les colonnes
// (`_grist_Views_section_field`), le tri et les filtres enregistrés (`_grist_Filters`) se lisent à chaque affichage ; le document suit donc le graphique
// quand la personne le change dans Grist, et retrouve ses colonnes par leur numéro interne (un renommage ne casse rien). Lire ces tables demande l'accès
// complet, que le widget a déjà ; elles passent par GristAPI.fetchTableRows, donc par la même lecture partagée qu'une bulle pendant un rendu.
// Les règles de sélection des lignes, de tri et de filtre sont celles de Grist (app/client/models/SectionFilter.ts, app/common/ColumnFilterFunc.ts,
// FilterState.ts, SortFunc.ts, SortSpec.ts de grist-core 1.7.20, Apache-2.0 : voir NOTICE) ; leur code est dans js/view-source.js, que l'export en lot lit aussi pour suivre la vue
// à laquelle le widget est relié. Ce que le widget ne sait pas encore redessiner ressort de `read` avec une raison (`unsupported`, une clé de js/i18n.js) : la liste le montre grisé.
const ChartSource = (function () {
  const META_TABLES = ['_grist_Views', '_grist_Views_section', '_grist_Views_section_field', '_grist_Pages', '_grist_Tables', '_grist_Tables_column', '_grist_Filters'];

  // Les tables de réglages, lues d'un coup : { views, sections, fields, pages, tables, columns, filters } (des tableaux de lignes, sauf `views`, `tables` et
  // `columns`, rangées par identifiant dans une Map). `_grist_Filters` manque dans un très vieux document : alors pas de filtre.
  async function readMeta() {
    const lists = await Promise.all(META_TABLES.map(name => GristAPI.fetchTableRows(name).catch((e) => { if (name === '_grist_Filters') return []; throw e; })));
    const byId = rows => new Map(rows.map(row => [row.id, row]));
    return { views: byId(lists[0]), sections: lists[1], fields: lists[2], pages: lists[3], tables: byId(lists[4]), columns: byId(lists[5]), filters: lists[6] };
  }

  const { parseJson, pureTypeOf, isoInTimezone, dayEdge } = ViewSource;

  // La section
  // La colonne d'une table de synthèse qui regroupe : son nom ou son libellé. « Ventes [par Catégorie] » est le nom que Grist donne à la table.
  function tableLabelOf(meta, table) {
    if (!table) return '';
    const source = table.summarySourceTable ? meta.tables.get(table.summarySourceTable) : null;
    if (!source) return table.tableId;
    const groups = Array.from(meta.columns.values()).filter(col => col.parentId === table.id && col.summarySourceCol)
      .sort((a, b) => a.parentPos - b.parentPos).map(col => col.label || col.colId);
    return source.tableId + ' ' + I18n.t(groups.length ? 'chart.summary.by' : 'chart.summary.totals', { columns: groups.join(', ') });
  }

  // Le widget personnalisé qu'est ce widget lui-même n'est pas un graphique à proposer (ViewSource.isOwnWidget : son adresse, ou celle de GFS qui l'héberge).
  const { isOwnWidget, ownWidgetUrl } = ViewSource;

  // Une colonne du graphique : la première est l'axe X, les autres les séries (ChartView.ts:_updateView, _isCompatibleSeries). Les valeurs viennent de la colonne
  // d'affichage de la colonne dans le graphique (la colonne montrée par une Référence), son libellé de la colonne elle-même.
  function fieldOf(meta, field) {
    const column = meta.columns.get(field.colRef);
    if (!column) return null;
    // Une colonne qui a ses propres options dans le graphique (`widgetOptions`) a aussi sa propre colonne d'affichage ; sinon c'est celle de la colonne.
    const display = meta.columns.get((field.widgetOptions ? field.displayCol : column.displayCol) || field.colRef) || column;
    const type = pureTypeOf(column.type);
    let numericType = type;
    if (type === 'Ref') { const shown = meta.columns.get(column.visibleCol); numericType = shown ? shown.type : ''; }
    const displayFullType = String(display.type || '');
    const displayType = pureTypeOf(displayFullType);
    return {
      colRef: column.id, colId: column.colId, label: column.label || column.colId, displayColRef: display.id, displayColId: display.colId, pureType: displayType,
      isDate: displayType === 'Date' || displayType === 'DateTime',
      timezone: (displayFullType.indexOf('DateTime:') === 0 && displayFullType.slice(9)) || 'UTC',
      isList: type === 'ChoiceList' || type === 'RefList',
      numeric: numericType === 'Numeric' || numericType === 'Int' || numericType === 'Any',
    };
  }

  // Ce que le widget lit d'une section : { id, kind, type, options, title, name, pageId, page, table, tableLabel, fields, filters, sortKeys, linkedInGrist,
  // unsupported }. `unsupported` : la clé de la raison pour laquelle il ne sait pas le redessiner, '' sinon.
  function specOf(meta, section) {
    const table = meta.tables.get(section.tableRef) || null;
    const options = parseJson(section.options, {});
    const kind = section.parentKey === 'chart' ? 'chart' : 'custom';
    const type = kind === 'chart' ? (section.chartType || 'bar') : 'custom';
    const view = meta.views.get(section.parentId);
    const label = tableLabelOf(meta, table);
    const spec = {
      id: section.id, kind, type, options, table: table ? table.tableId : '', tableLabel: label, pageId: section.parentId, page: view ? view.name : '',
      title: String(section.title || '').trim(), name: String(section.title || '').trim() || label,
      fields: [], filters: [], sortKeys: [], linkedInGrist: !!section.linkSrcSectionRef, unsupported: '',
    };
    if (kind === 'custom') { spec.unsupported = 'chart.reason.custom'; return spec; }
    if (ChartPlot.TYPES.indexOf(type) === -1) spec.unsupported = type === 'kaplan_meier' ? 'chart.reason.kaplan' : 'chart.reason.unknownType';
    else if (options.multiseries) spec.unsupported = 'chart.reason.multiseries';
    else if (options.errorBars) spec.unsupported = 'chart.reason.errorBars';
    else if (!table) spec.unsupported = 'chart.reason.noTable';
    if (!table) return spec;
    spec.fields = meta.fields.filter(field => field.parentId === section.id).sort((a, b) => a.parentPos - b.parentPos || a.id - b.id)
      .map(field => fieldOf(meta, field)).filter(Boolean);
    if (!spec.unsupported && !spec.fields.length) spec.unsupported = 'chart.reason.noColumn';
    const saved = ViewSource.savedFiltersOf(meta.filters, section.id, meta.columns);
    spec.filters = saved.filters;
    if (saved.relative && !spec.unsupported) spec.unsupported = 'chart.reason.relativeFilter';
    // Le tri suit la colonne d'affichage de la colonne quand elle est dans le graphique (activeDisplaySortSpec de Grist).
    spec.sortKeys = ViewSource.sortKeysOf(section.sortColRefs, meta.columns, table, (column) => {
      const shown = spec.fields.find(field => field.colRef === column.id);
      return shown && meta.columns.get(shown.displayColRef);
    });
    return spec;
  }

  // Les graphiques de la page, dans l'ordre des pages de Grist puis des sections : les graphiques et les widgets personnalisés (ceux-là, grisés), pas ce
  // widget. Rend des `specOf`.
  async function list() {
    const meta = await readMeta();
    const position = new Map(meta.pages.map(page => [page.viewRef, page.pagePos]));
    return meta.sections
      .filter(section => (section.parentKey === 'chart' || section.parentKey === 'custom') && position.has(section.parentId) && !isOwnWidget(section))
      .sort((a, b) => position.get(a.parentId) - position.get(b.parentId) || a.id - b.id)
      .map(section => specOf(meta, section));
  }

  // Le graphique de la section `id` : un `specOf`, ou null quand la section n'existe plus ou n'est pas un graphique (supprimé dans Grist, ou numéro d'un
  // autre document).
  async function read(id) {
    const meta = await readMeta();
    const section = meta.sections.find(row => row.id === Number(id));
    return section && section.parentKey === 'chart' ? specOf(meta, section) : null;
  }

  // Les lignes
  // Les lignes à tracer pour la ligne `record` de la table `tableId` : `scope` « linked » (celles que trouve la règle de liaison de la table du graphique, comme
  // pour une bulle - une seule si le graphique est de la table du document) ou « all » (toute la table, comme la page de Grist), filtrées et triées comme le
  // graphique.
  async function rows(spec, scope, tableId, record) {
    let found;
    if (scope === 'all') found = await GristAPI.fetchTableRows(spec.table);
    else {
      const resolved = await Variables.resolveRows(spec.table, [], tableId, record);
      if (resolved.error) throw new Error(resolved.error);
      found = resolved.rows.filter(Boolean);
    }
    return arrange(spec, found);
  }

  // Les lignes filtrées par les filtres enregistrés du graphique puis triées par son tri, puis l'ordre manuel de la table et l'identifiant (SortFunc.compare).
  const arrange = (spec, found) => ViewSource.arrange(found, spec.filters, spec.sortKeys);

  // Les séries
  // Les séries de `spec` pour ces lignes, au format de ChartPlot.figure : l'axe X d'abord, puis les colonnes qui peuvent se tracer (un nombre ou « Any ») ;
  // le reste de la liste des colonnes du graphique est ignoré, comme Grist.
  function series(spec, found) {
    const plotted = spec.fields.filter((field, i) => i === 0 || field.numeric);
    let result = plotted.map((field) => {
      const values = found.map((row) => {
        const raw = field.displayColId in row ? row[field.displayColId] : row[field.colId];
        // Une date arrive en secondes ; 0 et ce qui n'est pas un nombre donnent une case vide (sinon Plotly ajoute le 1er janvier 1970 à l'axe).
        if (field.isDate) return typeof raw === 'number' && raw ? isoInTimezone(raw * 1000, field.timezone) : null;
        return raw === undefined ? null : raw;
      });
      return { label: field.label, pureType: field.pureType, values };
    });
    // Un axe X en liste (plusieurs choix, plusieurs références) donne un point par élément.
    if (plotted.length && plotted[0].isList) result = ChartPlot.splitValues(result, value => (Array.isArray(value) && value[0] === 'L' ? value.slice(1) : null));
    // Les autres valeurs codées (une erreur de formule, une valeur en attente) ne se tracent pas.
    result.forEach((s) => { s.values = s.values.map(value => (Array.isArray(value) ? null : value)); });
    return result;
  }

  return { list, read, rows, series, isoInTimezone, dayEdge, ownWidgetUrl };
})();
