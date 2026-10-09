// Dessin des graphiques de Grist en image (PNG). Un graphique du document est une image `img.editor-image` (js/chart-block.js) dessinée à la Lecture et
// à l'export pour la ligne affichée, comme le QR code (js/qr-code.js) : Lecture, PDF et Word montrent donc la même image.
// Le moteur est celui de Grist, plotly.js-basic-dist 2.13.2 (la version de grist-core 1.7.20), chargé à la première utilisation depuis jsDelivr avec une
// empreinte SRI, comme JSZip (js/export-common.js) ; l'adresse exacte est dans la politique de sécurité du contenu d'index.html. Les fonctions qui
// transforment les colonnes en traces sont le port de celles de Grist (app/client/components/ChartView.ts et app/client/lib/chartUtil.ts, Apache-2.0 :
// voir NOTICE), pour que le graphique du document soit celui que montre Grist - couleurs, axes, légende, barres empilées ou horizontales, échelle
// logarithmique, anneau et son total.
// Pas encore redessinés (js/chart-source.js les grise dans la liste, avec la raison) : Kaplan-Meier, « Split series » et « Error bars ».
const ChartPlot = (function () {
  // Recalculer l'empreinte si la version change : `curl -s <url> | openssl dgst -sha384 -binary | openssl base64 -A`.
  const LIB = { src: 'https://cdn.jsdelivr.net/npm/plotly.js-basic-dist-min@2.13.2/plotly-basic.min.js', integrity: 'sha384-1heFF/cJ46y4QUvJzTPTs4/F4/UYCTLl6QErQgvqkxbzN+5yx5TQUVGf6ufPqcve' };
  // Les types de graphique que Grist propose, moins Kaplan-Meier. La clé est la valeur de `chartType` de la section ('' veut dire barres).
  const TYPES = ['bar', 'line', 'area', 'scatter', 'pie', 'donut'];
  const SCALE = 3;               // 3 pixels d'image par pixel de mise en page : net à l'impression, ~65 Ko pour un graphique de 480 x 300
  const DONUT_DEFAULT_HOLE_SIZE = 0.75;
  const DONUT_DEFAULT_TEXT_SIZE = 24;
  // Les couleurs, la police et les fonds du thème clair de Grist (ChartView.ts:_getPlotlyTheme) : un document s'imprime sur du blanc, jamais dans le
  // thème sombre du widget.
  const COLORWAY = ['#2b78ae', '#fe945b', '#3a936e', '#d34141', '#8563cc', '#8c564b', '#db7fbf', '#7f7f7f', '#b3b42b', '#28b4d3'];
  const FOREGROUND = '#444444';
  const BACKGROUND = '#ffffff';
  const LEGEND_BACKGROUND = '#ffffff80';
  const FONT_FAMILY = 'Arial, Helvetica, sans-serif';

  // La bibliothèque
  let libPromise = null;
  // Résolue quand `window.Plotly` est prêt ; rejetée si le script ne charge pas, et réessayée alors à l'appel suivant.
  function ensureLibrary() {
    if (!libPromise) libPromise = (window.Plotly ? Promise.resolve() : ExportCommon.loadScriptOnce(LIB)).catch((e) => { libPromise = null; throw e; });
    return libPromise;
  }

  // Comparer des valeurs de cellule (SortFunc.ts:typedCompare de grist-core)
  // Une colonne numérique peut contenir du texte, du vide ou des valeurs codées en tableau (['E', …] pour une erreur) : la comparaison natif de JavaScript
  // n'est pas transitive d'un type à l'autre (1 < "2" et "2" < "a", mais pas 1 < "a"). On compare donc le type d'abord, puis la valeur, et les textes avec
  // la langue de Grist (en-US, `defaultCollator` de gutil.ts), jamais celle du navigateur : l'ordre du document est celui de la page de Grist.
  const collator = new Intl.Collator('en-US');
  const nativeCompare = (a, b) => (a < b ? -1 : (a > b ? 1 : 0));
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

  // Les séries (chartUtil.ts)
  // Une série : { label, values, pureType, … } ; la première est l'axe X, les suivantes les valeurs Y. Toutes ont autant de valeurs.
  // Trie toutes les séries d'après la première (les lignes se tracent dans l'ordre des points : une courbe ne revient pas en arrière).
  function sortByXValues(series) {
    if (!series[0]) return;
    const x = series[0].values;
    const indices = x.map((value, i) => i);
    indices.sort((a, b) => typedCompare(x[a], x[b]));
    series.forEach((s) => { const values = s.values; s.values = indices.map(i => values[i]); });
  }
  // Ne garde qu'une ligne par valeur de X (Plotly additionne les barres de même abscisse mais n'en montre qu'une au survol : mieux vaut qu'il n'y en ait qu'une).
  function uniqXValues(series) {
    if (!series[0]) return;
    const seen = new Set();
    const keep = new Set();
    series[0].values.forEach((value, i) => { if (!seen.has(value)) { seen.add(value); keep.add(i); } });
    series.forEach((s) => { s.values = s.values.filter((value, i) => keep.has(i)); });
  }
  // Retire de toutes les séries les points dont aucune valeur Y n'est un nombre (vide, texte, erreur).
  function trimNonNumericData(series) {
    const values = series.slice(1).map(s => s.values);
    series.forEach((s) => { s.values = s.values.filter((value, i) => values.some(v => typeof v[i] === 'number')); });
  }
  // Un libellé vide devient « - » : Plotly l'écrirait comme son rang (« 2 ») dans un secteur, et l'omettrait sur un axe.
  const replaceEmptyLabels = values => values.map(v => (v == null || v === '' ? '-' : v));
  // Les séries dont les valeurs d'une liste (ChoiceList, RefList : ['L', 'a', 'b']) donnent une ligne par élément, les autres colonnes recopiées
  // (splitValuesByIndex de chartUtil.ts, à l'indice 0). `listItems` rend les éléments d'une valeur, ou null quand ce n'en est pas une.
  function splitValues(series, listItems) {
    if (!series[0]) return series;
    const items = series[0].values.map(listItems);
    return series.map((s, si) => {
      const values = [];
      items.forEach((list, i) => {
        if (!list) values.push(si === 0 ? series[0].values[i] : s.values[i]);
        else list.forEach(item => values.push(si === 0 ? item : s.values[i]));
      });
      return Object.assign({}, s, { values });
    });
  }

  // Les traces (ChartView.ts)
  const isPlainObject = v => !!v && typeof v === 'object' && !Array.isArray(v);
  // Les valeurs de `source` qui manquent à `target` (_.defaultsDeep de Grist) ; `target` est modifié.
  function defaultsDeep(target, source) {
    target = target || {};
    Object.keys(source || {}).forEach((key) => {
      if (isPlainObject(source[key])) target[key] = defaultsDeep(isPlainObject(target[key]) ? target[key] : (target[key] === undefined ? {} : target[key]), source[key]);
      else if (target[key] === undefined) target[key] = source[key];
    });
    return target;
  }
  // `source` par-dessus `target` (_.merge) ; `target` est modifié.
  function merge(target, source) {
    Object.keys(source || {}).forEach((key) => {
      if (isPlainObject(source[key])) target[key] = merge(isPlainObject(target[key]) ? target[key] : {}, source[key]);
      else target[key] = source[key];
    });
    return target;
  }
  const isCategoryType = pureType => ['Numeric', 'Int', 'Any', 'Date', 'DateTime'].indexOf(pureType) === -1;
  function seriesName(series) { return series.label; }

  // Les traces d'un graphique à axes : une par série Y, l'axe X étant la première série. Les titres d'axes sont ceux de Grist : l'axe X porte le nom de sa
  // colonne ; l'axe Y celui de l'unique série Y, et rien quand une légende nomme plusieurs séries.
  function basicPlot(series, options, dataOptions) {
    trimNonNumericData(series);
    // Plotly fait une chose différente au survol d'une abscisse répétée ; pour des barres, une seule par valeur.
    if (dataOptions.type === 'bar') uniqXValues(series);
    const axes = options.orientation === 'h' ? ['y', 'x'] : ['x', 'y'];
    // Les séries empilées dont la première valeur non nulle est négative forment leur propre pile, sous l'axe : comme `barmode: relative` pour des barres.
    const stackGroupOf = (group, values) => {
      if (!group) return group;
      const first = values.find(v => typeof v === 'number' && v !== 0);
      return first && first < 0 ? '-' + group : group;
    };
    const data = series.slice(1).map((line) => {
      const trace = { name: seriesName(line) };
      trace[axes[0]] = replaceEmptyLabels(series[0].values);
      trace[axes[1]] = line.values;
      trace.orientation = options.orientation;
      Object.assign(trace, dataOptions);
      trace.stackgroup = stackGroupOf(dataOptions.stackgroup, line.values);
      return trace;
    });
    const layout = {};
    layout[axes[0] + 'axis'] = { title: series.length > 0 ? { text: series[0].label } : {} };
    layout[axes[1] + 'axis'] = { title: series.length === 2 ? { text: series[1].label } : {} };
    return { data, layout };
  }

  const chartTypes = {
    bar(series, options) {
      const plot = basicPlot(series, options, { type: 'bar' });
      // Un axe X qui n'est pas numérique ou une date est une liste de catégories : Plotly ne le devine pas toujours (un code postal serait un nombre).
      const useCategory = series[0] && series[0].pureType && isCategoryType(series[0].pureType);
      const axis = plot.layout[options.orientation === 'h' ? 'yaxis' : 'xaxis'];
      if (useCategory && axis) axis.type = 'category';
      return plot;
    },
    line(series, options) {
      sortByXValues(series);
      return basicPlot(series, options, { type: 'scatter', connectgaps: options.lineConnectGaps, mode: options.lineMarkers ? 'lines+markers' : 'lines', stackgroup: options.stacked ? 'A' : '' });
    },
    area(series, options) {
      sortByXValues(series);
      return basicPlot(series, options, { type: 'scatter', fill: 'tozeroy', line: { shape: 'spline' } });
    },
    scatter(series, options) {
      return basicPlot(series.slice(1), options, { type: 'scatter', mode: 'text+markers', text: series[0].values, textposition: 'bottom center' });
    },
    // Secteurs : les libellés sont la première série, les parts la deuxième ; sans deuxième série, on compte les occurrences de chaque libellé.
    pie(series, options, dataOptions) {
      if (series.length === 0) return { data: [] };
      let line;
      if (series.length > 1) { trimNonNumericData(series); line = series[1]; }
      else line = { label: 'Count', values: series[0].values.map(() => 1) };
      const trace = { type: 'pie', name: seriesName(line), labels: replaceEmptyLabels(series[0].values), values: line.values };
      return { data: [Object.assign(trace, dataOptions || {})] };
    },
    donut(series, options, dataOptions) {
      const hole = typeof options.donutHoleSize === 'number' && isFinite(options.donutHoleSize) ? options.donutHoleSize : DONUT_DEFAULT_HOLE_SIZE;
      const plot = chartTypes.pie(series, options, Object.assign({}, dataOptions, { hole }));
      const annotations = [];
      if (options.showTotal && plot.data.length) {
        // La somme des parts, ou le nombre de libellés quand il n'y a pas de parts. Grist l'écrit avec le format de la colonne ; ici, le nombre tel quel.
        const total = series.length > 1 ? series[1].values.filter(v => typeof v === 'number' && isFinite(v)).reduce((sum, v) => sum + v, 0) : plot.data[0].labels.length;
        annotations.push({ text: String(total), showarrow: false, font: { size: typeof options.textSize === 'number' ? options.textSize : DONUT_DEFAULT_TEXT_SIZE } });
      }
      return defaultsDeep(plot, { layout: { annotations } });
    },
  };

  // La mise en page commune à tous les types (ChartView.ts:_getPlotlyLayout) : marges, axe Y logarithmique ou inversé, barres empilées, couleurs.
  function baseLayout(options) {
    const yaxis = { automargin: true, title: { standoff: 0 } };
    const xaxis = { automargin: true, title: { standoff: 0 } };
    if (options.logYAxis) yaxis.type = 'log';
    if (options.invertYAxis) yaxis.autorange = 'reversed';
    const layout = { margin: { l: 50, r: 50, b: 40, t: 30, pad: 4 }, yaxis, xaxis };
    if (options.stacked) layout.barmode = 'relative';
    return merge(layout, {
      colorway: COLORWAY, paper_bgcolor: BACKGROUND, plot_bgcolor: BACKGROUND,
      xaxis: { color: FOREGROUND }, yaxis: { color: FOREGROUND },
      font: { color: FOREGROUND, family: FONT_FAMILY },
      legend: { bgcolor: LEGEND_BACKGROUND },
    });
  }

  // Plotly lit un peu de HTML dans ses textes (<b>, <br>, <a href>) : le contenu d'une cellule ou le nom d'une colonne qui en contient ne doit jamais
  // devenir une balise du graphique, il s'écrit tel quel.
  const escapeText = value => (typeof value === 'string' ? value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : value);
  const escapeAll = values => (Array.isArray(values) ? values.map(escapeText) : values);
  function escapeFigure(figure) {
    figure.data.forEach((trace) => {
      ['x', 'y', 'labels', 'text'].forEach((key) => { if (trace[key]) trace[key] = escapeAll(trace[key]); });
      if (trace.name != null) trace.name = escapeText(trace.name);
    });
    ['xaxis', 'yaxis'].forEach((key) => {
      const title = figure.layout[key] && figure.layout[key].title;
      if (title && title.text != null) title.text = escapeText(title.text);
    });
    return figure;
  }

  // La figure Plotly d'un graphique de type `type` ('bar', 'line', 'area', 'scatter', 'pie', 'donut') : `series` (la première est l'axe X) et `options`
  // (celles de la section de Grist : stacked, orientation, logYAxis…). Ne modifie pas `series`.
  function figure(type, series, options) {
    if (TYPES.indexOf(type) === -1) throw new Error('Type de graphique non pris en charge : ' + type);
    options = options || {};
    const copy = series.map(s => Object.assign({}, s, { values: s.values.slice() }));
    const dataOptions = {};
    if (type === 'pie' || type === 'donut') {
      // Plotly range les secteurs par taille : on garde l'ordre des libellés, qui ne bouge plus quand une valeur change.
      dataOptions.sort = false;
      sortByXValues(copy);
    }
    const plot = chartTypes[type](copy, options, dataOptions);
    const layout = defaultsDeep(plot.layout || {}, baseLayout(options));
    return escapeFigure({ data: plot.data, layout, config: { displayModeBar: false } });
  }

  // L'image PNG (adresse `data:`) de `fig`, de `width` x `height` pixels de mise en page. Charge Plotly au premier appel.
  async function toImage(fig, width, height) {
    await ensureLibrary();
    return window.Plotly.toImage(fig, { format: 'png', width, height, scale: SCALE });
  }

  return { LIB, TYPES, ensureLibrary, typedCompare, splitValues, figure, toImage };
})();
