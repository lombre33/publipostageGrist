// La vue d'à côté à laquelle ce widget est relié par « Sélectionner par » (même table), lue dans les réglages de Grist, et le moteur des filtres et du tri ENREGISTRÉS qui la lit : celui
// du graphique de la page (extensions/graphique/chart-source.js) s'en sert aussi, pour ses propres lignes.
// Pourquoi : Grist ne donne à un widget que les lignes de SA section (GristView.fetchSelectedTable). Un lien de même table (« Cursor:Same-Table » dans Grist) ne fait que suivre la ligne
// choisie, il ne filtre rien : le widget voit toutes les lignes, quel que soit le filtre du tableau d'à côté (mesuré dans un vrai Grist, 23/10). Ce que Grist écrit dans le document, lui,
// se lit : la section de ce widget (`_grist_Views_section`, `linkSrcSectionRef` : la section d'à côté), les filtres ENREGISTRÉS de celle-ci (`_grist_Filters`) et son tri (`sortColRefs`).
// Un filtre posé sans cliquer « Enregistrer » dans Grist n'est que dans le navigateur de la personne : aucun widget ne le voit, et rien ne dit qu'il existe.
// Les règles de sélection des lignes, de tri et de filtre sont celles de Grist (app/client/models/SectionFilter.ts, app/common/ColumnFilterFunc.ts, FilterState.ts, SortFunc.ts, SortSpec.ts,
// app/client/lib/LinkingState.ts de grist-core 1.7.20, Apache-2.0 : voir NOTICE). Lire ces tables demande l'accès complet, que le widget a déjà ; elles passent par
// GristAPI.fetchTableRows, donc par la même lecture partagée qu'une bulle pendant un rendu.
//  ViewSource.linkedRows(tableId, allRows) -> Promise<null | { name, ids } | { name, unreadable }>
//    allRows : toutes les lignes de la table `tableId` (GristAPI.fetchTableRows : forme brute, une Référence y est un identifiant de ligne).
//    null : rien à suivre - le widget n'est pas relié à une autre section de sa table, la relie autrement (une colonne, une table de synthèse : Grist filtre alors les lignes du widget
//    lui-même), ou ses réglages sont illisibles. `ids` : les identifiants des lignes que la vue liée affiche, dans son ordre. `unreadable` : ce que le widget ne sait pas calculer,
//    `name` étant la vue concernée ('' quand on ne sait même pas laquelle) - « relative » (un filtre de dates relatives : « les 7 derniers jours »), « upstream » (la vue liée est
//    elle-même filtrée par la ligne choisie dans un autre widget) ou « ambiguous » (plusieurs widgets de la table ont l'adresse de celui-ci, et ils ne sont pas tous reliés à la même vue).
//  Le moteur : filterOf, savedFiltersOf, sortKeyOf, sortKeysOf, arrange, typedCompare, isoInTimezone, dayEdge, parseJson, pureTypeOf, ownWidgetUrl, isOwnWidget (graphique de la page).
const ViewSource = (function () {
  const parseJson = (text, fallback) => {
    try { const value = text ? JSON.parse(text) : null; return value == null ? fallback : value; } catch (e) { return fallback; }
  };
  const pureTypeOf = type => String(type || '').split(':')[0];
  const nativeCompare = (a, b) => (a < b ? -1 : (a > b ? 1 : 0));

  // Comparer des valeurs de cellule (SortFunc.ts:typedCompare de grist-core)
  // Une colonne numérique peut contenir du texte, du vide ou des valeurs codées en tableau (['E', …] pour une erreur) : la comparaison natif de JavaScript
  // n'est pas transitive d'un type à l'autre (1 < "2" et "2" < "a", mais pas 1 < "a"). On compare donc le type d'abord, puis la valeur, et les textes avec
  // la langue de Grist (en-US, `defaultCollator` de gutil.ts), jamais celle du navigateur : l'ordre du document est celui de la page de Grist.
  const collator = new Intl.Collator('en-US');
  function arrayCompare(a, b) {
    for (let i = 0; i < a.length; i += 1) {
      if (i >= b.length) return 1;
      const result = typedCompare(a[i], b[i]);
      if (result) return result;
    }
    return a.length === b.length ? 0 : -1;
  }
  function typedCompare(a, b) {
    const type = typeof a;
    let result = nativeCompare(type, typeof b);
    if (result !== 0) return result;
    if (type === 'object') {
      result = nativeCompare(Array.isArray(a), Array.isArray(b));
      if (result !== 0) return result;
      if (Array.isArray(a)) return arrayCompare(a, b);
    }
    if (type === 'string') return collator.compare(a, b);
    return nativeCompare(a, b);
  }

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

  // Les filtres enregistrés de la section `sectionId` (les lignes de `_grist_Filters`, `columns` : les colonnes par identifiant) : { filters, relative } - `filters` : [{ colId, accepts }] ;
  // `relative` : vrai si l'un a une borne relative, que le widget ne sait pas calculer (il n'est alors pas dans `filters`). Un filtre dont la colonne n'existe plus ou qui est illisible est ignoré.
  function savedFiltersOf(saved, sectionId, columns) {
    const result = { filters: [], relative: false };
    saved.filter(filter => filter.viewSectionRef === sectionId && filter.filter).forEach((one) => {
      const column = columns.get(one.colRef);
      const made = column ? filterOf(one.filter, column.type) : null;
      if (made && made.relative) result.relative = true;
      else if (made) result.filters.push({ colId: column.colId, accepts: made.accepts });
    });
    return result;
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
  // Les clés du tri enregistré d'une section de la table `table` (`sortColRefs` : son texte JSON), pour `arrange`. `displayOf(column)` rend la colonne dont les valeurs servent au tri
  // - la colonne d'affichage d'une Référence (activeDisplaySortSpec de Grist) -, la colonne elle-même à défaut.
  function sortKeysOf(sortColRefs, columns, table, displayOf) {
    const keys = [];
    parseJson(sortColRefs, []).forEach((entry) => {
      const key = sortKeyOf(entry);
      const column = key && columns.get(key.colRef);
      if (!column || column.parentId !== table.id) return;
      const sortColumn = displayOf(column) || column;
      let choices = null;
      if (key.orderByChoice && pureTypeOf(sortColumn.type) === 'Choice') choices = (parseJson(sortColumn.widgetOptions, {}).choices) || [];
      keys.push({ colId: sortColumn.colId, baseColId: column.colId, desc: key.desc, emptyLast: key.emptyLast, naturalSort: key.naturalSort, choices });
    });
    return keys;
  }
  const naturalCollator = new Intl.Collator(undefined, { numeric: true });
  const naturalCompare = (a, b) => (typeof a === 'string' && typeof b === 'string' ? naturalCollator.compare(a, b) : typedCompare(a, b));
  // Les vides en dernier : une valeur vide est fausse sans être le nombre 0.
  const emptyLastOf = next => (a, b) => {
    const emptyA = !a && typeof a !== 'number';
    const emptyB = !b && typeof b !== 'number';
    if (emptyA && !emptyB) return 1;
    if (emptyB && !emptyA) return -1;
    return next(a, b);
  };

  // Les lignes `found` filtrées par `filters` ([{ colId, accepts }]) puis triées par `sortKeys`, puis l'ordre manuel de la table et l'identifiant (SortFunc.compare). Une copie : `found` ne change pas.
  function arrange(found, filters, sortKeys) {
    const kept = found.filter(row => filters.every(filter => filter.accepts(row[filter.colId])));
    const comparators = sortKeys.map((key) => {
      let compare = key.naturalSort ? naturalCompare : typedCompare;
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
      for (let i = 0; i < sortKeys.length; i += 1) {
        const key = sortKeys[i];
        const result = comparators[i](valueOf(key, a), valueOf(key, b));
        if (result !== 0) return result * (key.desc ? -1 : 1);
      }
      if ('manualSort' in a && 'manualSort' in b) {
        const result = typedCompare(a.manualSort, b.manualSort);
        if (result !== 0) return result;
      }
      return nativeCompare(a.id, b.id);
    });
  }

  // Le widget personnalisé qu'est ce widget lui-même. Grist garde l'adresse telle que la personne l'a écrite : on la compare sans requête, sans `index.html` et sans barre finale. Hébergé par
  // GFS, la section de la page porte l'adresse de GFS, pas celle de cette page, qui n'en est que le sous-cadre (consigne GFS 009) : GFS la donne dans son contexte (`adresseWidget`,
  // Extensions.widgetAddress). Seul, ou si GFS ne la donne pas, c'est l'adresse de la page.
  const bareUrl = url => String(url || '').replace(/[?#].*$/, '').replace(/index\.html$/, '').replace(/\/+$/, '');
  function ownWidgetUrl() { return bareUrl(Extensions.widgetAddress() || window.location.origin + window.location.pathname); }
  function isOwnWidget(section) {
    if (section.parentKey !== 'custom') return false;
    const custom = parseJson(section.options, {}).customView;
    const config = typeof custom === 'string' ? parseJson(custom, {}) : (custom || {});
    const url = bareUrl(config.url);
    return !!url && url === ownWidgetUrl();
  }

  // La vue liée
  const META_TABLES = ['_grist_Views_section', '_grist_Views_section_field', '_grist_Tables', '_grist_Tables_column', '_grist_Filters'];

  // Les tables de réglages, lues d'un coup : { sections, fields, tables, columns, filters } (des Map par identifiant, sauf `fields` et `filters` : des tableaux de lignes). `_grist_Filters`
  // manque dans un très vieux document : alors pas de filtre.
  async function readMeta() {
    const lists = await Promise.all(META_TABLES.map(name => GristAPI.fetchTableRows(name).catch((e) => { if (name === '_grist_Filters') return []; throw e; })));
    const byId = rows => new Map(rows.map(row => [row.id, row]));
    return { sections: byId(lists[0]), fields: lists[1], tables: byId(lists[2]), columns: byId(lists[3]), filters: lists[4] };
  }

  // La section à laquelle `section` est reliée par un lien de curseur sur la MÊME table (« Cursor:Same-Table » : ni colonne source ni colonne cible, LinkingState.ts), 0 sinon : un autre
  // lien (colonne, table de synthèse, références) filtre déjà les lignes de la section elle-même, que Grist rend alors au widget.
  function cursorSourceOf(meta, section) {
    const source = section.linkSrcSectionRef ? meta.sections.get(section.linkSrcSectionRef) : null;
    return source && !section.linkSrcColRef && !section.linkTargetColRef && source.tableRef === section.tableRef ? source.id : 0;
  }

  // Le lien de `section` filtre-t-il ses lignes d'après la ligne choisie dans un autre widget (LinkingState.ts : une colonne cible, les lignes référencées par une liste, une table de
  // synthèse) ? Un lien de curseur (la même table, ou une Référence simple) ne filtre rien.
  function isFilteredByLink(meta, section) {
    const upstream = section.linkSrcSectionRef ? meta.sections.get(section.linkSrcSectionRef) : null;
    if (!upstream) return false;
    if (section.linkTargetColRef) return true;
    if (section.linkSrcColRef) { const column = meta.columns.get(section.linkSrcColRef); return !!column && pureTypeOf(column.type) === 'RefList'; }
    return upstream.tableRef !== section.tableRef;
  }

  // Les sections qui montrent des lignes : « record » (un tableau) et « detail » (une liste de fiches). Une fiche seule (« single ») ne montre que la ligne choisie.
  const ROW_VIEWS = ['record', 'detail'];

  async function readLinkedRows(tableId, allRows) {
    const meta = await readMeta();
    const table = Array.from(meta.tables.values()).find(one => one.tableId === tableId);
    if (!table) return null;
    // Ce widget : les sections de sa table qui portent son adresse. Une seule, sauf s'il est posé plusieurs fois sur la table ou si GFS le porte (toutes ses applications ont l'adresse de GFS).
    const own = Array.from(meta.sections.values()).filter(section => section.tableRef === table.id && isOwnWidget(section));
    const sources = new Set(own.map(section => cursorSourceOf(meta, section)));
    if (!own.length || (sources.size === 1 && sources.has(0))) return null;
    // Plusieurs sections possibles, reliées à des vues différentes (ou l'une reliée, l'autre non) : rien ne dit laquelle est ce widget.
    if (sources.size > 1) return { name: '', unreadable: 'ambiguous' };
    const source = meta.sections.get(Array.from(sources)[0]);
    if (ROW_VIEWS.indexOf(source.parentKey) === -1) return null;
    const name = String(source.title || '').trim() || table.tableId;
    const saved = savedFiltersOf(meta.filters, source.id, meta.columns);
    if (saved.relative) return { name, unreadable: 'relative' };
    if (isFilteredByLink(meta, source)) return { name, unreadable: 'upstream' };
    // Le tri suit la colonne que le champ montre (activeDisplaySortSpec : la colonne d'affichage d'une Référence, celle du champ s'il a ses propres réglages, sinon celle de la colonne) ;
    // une colonne que la section ne montre pas se trie telle quelle (une Référence, par l'identifiant de ligne).
    const displayOf = (column) => {
      const field = meta.fields.find(one => one.parentId === source.id && one.colRef === column.id);
      return field ? meta.columns.get((field.widgetOptions ? field.displayCol : column.displayCol) || column.id) : column;
    };
    const keys = sortKeysOf(source.sortColRefs, meta.columns, table, displayOf);
    return { name, ids: arrange(allRows, saved.filters, keys).map(row => row.id) };
  }

  // Des réglages illisibles (accès insuffisant, document sans ces tables) ou inattendus : le lot reste ce qu'il était, sur les lignes du widget, et la console le dit.
  async function linkedRows(tableId, allRows) {
    try { return await readLinkedRows(tableId, allRows); }
    catch (e) {
      console.error('[ViewSource] les réglages de Grist sont illisibles : la vue liée n’est pas suivie', e);
      return null;
    }
  }

  return { linkedRows, filterOf, savedFiltersOf, sortKeyOf, sortKeysOf, arrange, typedCompare, isoInTimezone, dayEdge, parseJson, pureTypeOf, ownWidgetUrl, isOwnWidget };
})();
