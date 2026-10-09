// Les graphiques de la page, lus dans les réglages de Grist (js/chart-block.js les choisit et les dessine, js/chart-plot.js trace). Le widget ne recopie
// aucun réglage : un graphique de Grist est une section de page (`_grist_Views_section`, `parentKey` « chart ») dont le type, les options, les colonnes
// (`_grist_Views_section_field`), le tri et les filtres enregistrés (`_grist_Filters`) se lisent à chaque affichage ; le document suit donc le graphique
// quand la personne le change dans Grist, et retrouve ses colonnes par leur numéro interne (un renommage ne casse rien). Lire ces tables demande l'accès
// complet, que le widget a déjà ; elles passent par GristAPI.fetchTableRows, donc par la même lecture partagée qu'une bulle pendant un rendu.
// Les règles de sélection des lignes, de tri et de filtre sont celles de Grist (app/client/models/SectionFilter.ts, app/common/ColumnFilterFunc.ts,
// FilterState.ts, SortFunc.ts, SortSpec.ts de grist-core 1.7.20, Apache-2.0 : voir NOTICE). Ce que le widget ne sait pas encore redessiner ressort de
// `read` avec une raison (`unsupported`, une clé de js/i18n.js) : la liste le montre grisé.
const ChartSource = (function () {
  const META_TABLES = ['_grist_Views', '_grist_Views_section', '_grist_Views_section_field', '_grist_Pages', '_grist_Tables', '_grist_Tables_column', '_grist_Filters'];

  // Les tables de réglages, lues d'un coup : { views, sections, fields, pages, tables, columns, filters } (des tableaux de lignes, sauf `views`, `tables` et
  // `columns`, rangées par identifiant dans une Map). `_grist_Filters` manque dans un très vieux document : alors pas de filtre.
  async function readMeta() {
    const lists = await Promise.all(META_TABLES.map(name => GristAPI.fetchTableRows(name).catch((e) => { if (name === '_grist_Filters') return []; throw e; })));
    const byId = rows => new Map(rows.map(row => [row.id, row]));
    return { views: byId(lists[0]), sections: lists[1], fields: lists[2], pages: lists[3], tables: byId(lists[4]), columns: byId(lists[5]), filters: lists[6] };
  }

  const parseJson = (text, fallback) => {
    try { const value = text ? JSON.parse(text) : null; return value == null ? fallback : value; } catch (e) { return fallback; }
  };
  const pureTypeOf = type => String(type || '').split(':')[0];
  const nativeCompare = (a, b) => (a < b ? -1 : (a > b ? 1 : 0));

  // Les dates : un fuseau, un jour
  const formats = new Map();
  // La date et l'heure qu'affiche un mur dans `timezone` à l'instant `ms` : { year, month, day, hour, minute, second } en texte. Un fuseau inconnu vaut UTC.
  function wallClock(ms, timezone) {
    let format = formats.get(timezone);
    if (!format) {
      const options = { hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' };
      try { format = new Intl.DateTimeFormat('en-US', Object.assign({ timeZone: timezone }, options)); }
      catch (e) { format = new Intl.DateTimeFormat('en-US', Object.assign({ timeZone: 'UTC' }, options)); }
      formats.set(timezone, format);
    }
    const parts = {};
    format.formatToParts(new Date(ms)).forEach((part) => { parts[part.type] = part.value; });
    return parts;
  }
  const wallMs = p => Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  // L'écart du fuseau à UTC à l'instant `ms`, en millisecondes (positif à l'est de Greenwich).
  const offsetMs = (ms, timezone) => wallMs(wallClock(ms, timezone)) - Math.floor(ms / 1000) * 1000;
  const two = n => String(n).padStart(2, '0');
  // Une date comme Grist la donne à Plotly (ChartView.ts:dateGetter, `moment.tz(ms, timezone).toISOString(true)`) : l'heure du mur dans le fuseau de la
  // colonne, suivie de l'écart. Plotly oublie l'écart et trace l'heure écrite, qui est donc celle que la personne voit dans Grist.
  function isoInTimezone(ms, timezone) {
    const p = wallClock(ms, timezone);
    const offset = Math.round(offsetMs(ms, timezone) / 60000);
    const sign = offset < 0 ? '-' : '+';
    const millis = String(((ms % 1000) + 1000) % 1000).padStart(3, '0');
    return p.year + '-' + p.month + '-' + p.day + 'T' + p.hour + ':' + p.minute + ':' + p.second + '.' + millis + sign + two(Math.floor(Math.abs(offset) / 60)) + ':' + two(Math.abs(offset) % 60);
  }
  // Le premier ou le dernier instant, en secondes, du jour de `seconds` dans le fuseau (ColumnFilterFunc.ts:changeTimezone, startOf / endOf « day »).
  function dayEdge(seconds, timezone, end) {
    const p = wallClock(seconds * 1000, timezone);
    const wall = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), end ? 23 : 0, end ? 59 : 0, end ? 59 : 0, end ? 999 : 0);
    // L'instant dont l'heure du mur est `wall` : l'écart du fuseau dépend de l'instant (heure d'été), donc on le relit une fois sur la première estimation.
    const first = wall - offsetMs(wall, timezone);
    return Math.floor((wall - offsetMs(first, timezone)) / 1000);
  }

  // Les filtres enregistrés (FilterState.ts, ColumnFilterFunc.ts)
  // La fonction qui dit si une valeur de cellule passe le filtre `filterJson` d'une colonne de type `columnType` ; null quand le filtre est illisible.
  // `relative` est vrai pour une borne relative (« les 7 derniers jours »), que le widget ne sait pas encore calculer.
  function filterOf(filterJson, columnType) {
    const spec = parseJson(filterJson, null);
    if (!spec || typeof spec !== 'object') return null;
    if (spec.min !== undefined || spec.max !== undefined) {
      if ((spec.min !== undefined && typeof spec.min !== 'number') || (spec.max !== undefined && typeof spec.max !== 'number')) return { relative: true };
      const pure = pureTypeOf(columnType);
      const isDate = pure === 'Date' || pure === 'DateTime';
      // Un filtre par plage sur une autre colonne (après un changement de type) laisse tout passer.
      if (!isDate && pure !== 'Numeric' && pure !== 'Int') return { accepts: () => true };
      let min = spec.min;
      let max = spec.max;
      if (isDate) {
        // Les bornes sont des jours entiers dans le fuseau de la colonne ; un Date est un jour UTC.
        const timezone = pure === 'DateTime' && columnType.indexOf(':') !== -1 ? columnType.slice(columnType.indexOf(':') + 1) : 'UTC';
        if (min !== undefined) min = dayEdge(min, timezone, false);
        if (max !== undefined) max = dayEdge(max, timezone, true);
      }
      return { accepts: value => typeof value === 'number' && (typeof max !== 'number' || value <= max) && (typeof min !== 'number' || min <= value) };
    }
    const include = Boolean(spec.included);
    const values = new Set(spec.included || spec.excluded || []);
    const isListColumn = columnType === 'ChoiceList' || pureTypeOf(columnType) === 'RefList' || columnType === 'Attachments';
    return {
      accepts(value) {
        // Une liste ('L', …) passe si un de ses éléments passe ; une liste vide se filtre comme la valeur vide de la colonne.
        if (isListColumn && Array.isArray(value) && value[0] === 'L') {
          const items = value.slice(1);
          if (items.length) return items.some(item => values.has(item) === include);
          value = columnType === 'ChoiceList' ? '' : null;
        }
        return values.has(Array.isArray(value) ? JSON.stringify(value) : value) === include;
      },
    };
  }

  // Le tri enregistré (SortSpec.ts, SortFunc.ts)
  // Une clé de tri, `1` ou `-1` (numéro de colonne, négatif pour décroissant) ou « -12:emptyLast;naturalSort;orderByChoice » : { colRef, desc, … } ; null
  // si elle est illisible ou vise une colonne virtuelle.
  function sortKeyOf(entry) {
    if (typeof entry === 'number') return { colRef: Math.abs(entry), desc: entry < 0, emptyLast: false, naturalSort: false, orderByChoice: false };
    const found = /^(-)?(\d+)(?::([\w;]+))?$/.exec(String(entry));
    if (!found) return null;
    const flags = (found[3] || '').split(';');
    return { colRef: Number(found[2]), desc: found[1] === '-', emptyLast: flags.indexOf('emptyLast') !== -1, naturalSort: flags.indexOf('naturalSort') !== -1, orderByChoice: flags.indexOf('orderByChoice') !== -1 };
  }
  const naturalCollator = new Intl.Collator(undefined, { numeric: true });
  const naturalCompare = (a, b) => (typeof a === 'string' && typeof b === 'string' ? naturalCollator.compare(a, b) : ChartPlot.typedCompare(a, b));
  // Les vides en dernier : une valeur vide est fausse sans être le nombre 0.
  const emptyLastOf = next => (a, b) => {
    const emptyA = !a && typeof a !== 'number';
    const emptyB = !b && typeof b !== 'number';
    if (emptyA && !emptyB) return 1;
    if (emptyB && !emptyA) return -1;
    return next(a, b);
  };

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

  // Le widget personnalisé qu'est ce widget lui-même : il n'est pas un graphique à proposer. Grist garde l'adresse telle que la personne l'a écrite : on la
  // compare sans requête, sans `index.html` et sans barre finale.
  const bareUrl = url => String(url || '').replace(/[?#].*$/, '').replace(/index\.html$/, '').replace(/\/+$/, '');
  function ownWidgetUrl() { return bareUrl(window.location.origin + window.location.pathname); }
  function isOwnWidget(section) {
    if (section.parentKey !== 'custom') return false;
    const custom = parseJson(section.options, {}).customView;
    const config = typeof custom === 'string' ? parseJson(custom, {}) : (custom || {});
    const url = bareUrl(config.url);
    return !!url && url === ownWidgetUrl();
  }

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
    meta.filters.filter(filter => filter.viewSectionRef === section.id && filter.filter).forEach((saved) => {
      const column = meta.columns.get(saved.colRef);
      const made = column ? filterOf(saved.filter, column.type) : null;
      if (made && made.relative) { if (!spec.unsupported) spec.unsupported = 'chart.reason.relativeFilter'; }
      else if (made) spec.filters.push({ colId: column.colId, accepts: made.accepts });
    });
    parseJson(section.sortColRefs, []).forEach((entry) => {
      const key = sortKeyOf(entry);
      const column = key && meta.columns.get(key.colRef);
      if (!column || column.parentId !== table.id) return;
      // Le tri suit la colonne d'affichage de la colonne quand elle est dans le graphique (activeDisplaySortSpec de Grist).
      const shown = spec.fields.find(field => field.colRef === column.id);
      const sortColumn = (shown && meta.columns.get(shown.displayColRef)) || column;
      let choices = null;
      if (key.orderByChoice && pureTypeOf(sortColumn.type) === 'Choice') choices = (parseJson(sortColumn.widgetOptions, {}).choices) || [];
      spec.sortKeys.push({ colId: sortColumn.colId, baseColId: column.colId, desc: key.desc, emptyLast: key.emptyLast, naturalSort: key.naturalSort, choices });
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
  function arrange(spec, found) {
    const kept = found.filter(row => spec.filters.every(filter => filter.accepts(row[filter.colId])));
    const comparators = spec.sortKeys.map((key) => {
      let compare = key.naturalSort ? naturalCompare : ChartPlot.typedCompare;
      if (key.emptyLast) compare = emptyLastOf(compare);
      return compare;
    });
    const valueOf = (key, row) => {
      let value = key.colId in row ? row[key.colId] : row[key.baseColId];
      // « Ordre des choix » : une valeur se classe par son rang dans la liste des choix de la colonne, sur 5 chiffres pour garder l'ordre des types.
      if (key.choices) { const at = key.choices.indexOf(value); if (at >= 0) value = String(at).padStart(5, '0'); }
      return value;
    };
    return kept.sort((a, b) => {
      for (let i = 0; i < spec.sortKeys.length; i += 1) {
        const key = spec.sortKeys[i];
        const result = comparators[i](valueOf(key, a), valueOf(key, b));
        if (result !== 0) return result * (key.desc ? -1 : 1);
      }
      if ('manualSort' in a && 'manualSort' in b) {
        const result = ChartPlot.typedCompare(a.manualSort, b.manualSort);
        if (result !== 0) return result;
      }
      return nativeCompare(a.id, b.id);
    });
  }

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
