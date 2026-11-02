// Les graphiques CRÉÉS dans le modèle (la ligne « Créer un graphique… » du menu « Ajouter une image », extensions/graphique/chart-make-ui.js) : à la différence du graphique de la page
// (chart-block.js, chart-plot.js), ils n'existent pas dans Grist et n'y ajoutent rien. Leurs réglages sont gardés dans le modèle, sur l'image : l'attribut `chartSpec` du nœud (`data-chart-spec`,
// js/editor-nodes.js), un petit texte JSON { v, kind, table, label, values, stack, horizontal } - la forme du graphique, la table, la colonne des étiquettes et les colonnes à tracer, par leur identifiant.
// Ce fichier ne sait que deux choses : lire et écrire cette définition (normalize, parse, stringify) et la tracer. Les lignes viennent de chart-source.js (`made` rend la section que Grist aurait
// écrite, `rows` et `series` en font les séries), le cadre de l'éditeur, la Lecture et les exports de chart-block.js, comme pour le graphique de la page.
// Le moteur est ECharts 6.1.0 (Apache-2.0), le paquet complet : seul lui dessine le radar (et plus tard la jauge et l'entonnoir). Comme Plotly, il n'est ni dans la liste des bibliothèques du widget ni dans son
// import map : Grist Factory Suite le porte et en donne l'adresse et l'empreinte (js/extensions.js : Extensions.library), `ensureLibrary` le charge à la première utilisation par le chargeur
// des exports (ExportCommon.loadScriptOnce). Aucun fichier du widget n'écrit son adresse : seule la politique de sécurité du contenu d'index.html la garde.
// Le dessin est une image PNG (adresse `data:`) à 3 pixels par pixel de mise en page, sur fond blanc, avec les couleurs et la police du graphique de la page : un document s'imprime sur du blanc,
// jamais dans le thème sombre du widget. Le texte d'une cellule s'écrit tel quel, jamais lu comme du HTML ni comme un modèle de texte d'ECharts.
const ChartMake = (function () {
  // La bibliothèque que le dessin exige : son identifiant dans le catalogue de Grist Factory Suite et la version exacte pour laquelle les options sont écrites. C'est le SEUL endroit du widget qui la
  // nomme ; aucune adresse ni empreinte ici : elles sont à GFS.
  const LIBRARY = { id: 'echarts', version: '6.1.0' };
  const KINDS = ['bar', 'line', 'area', 'scatter', 'pie', 'donut', 'radar'];
  const MAX_VALUES = 8;           // les colonnes à tracer d'un graphique
  const MAX_TEXT = 200;           // un identifiant de table ou de colonne
  const SCALE = 3;                // 3 pixels d'image par pixel de mise en page : net à l'impression
  const COLORWAY = ['#2b78ae', '#fe945b', '#3a936e', '#d34141', '#8563cc', '#8c564b', '#db7fbf', '#7f7f7f', '#b3b42b', '#28b4d3'];
  const FOREGROUND = '#444444';
  const AXIS_LINE = '#9aa0a6';
  const GRID_LINE = '#e3e5e8';
  const BACKGROUND = '#ffffff';
  const FONT_FAMILY = 'Arial, Helvetica, sans-serif';
  const FONT_SIZE = 12;

  // La bibliothèque : l'UNIQUE point d'accès à `window.echarts` du dessin.
  let libPromise = null;
  function loadLibrary() {
    if (window.echarts) return Promise.resolve();
    // La source que Grist Factory Suite donne (contexte ou événement `extensions`) : { src, integrite }. Sans elle - extension retirée, GFS qui ne la porte pas -, rien ne se charge.
    const source = Extensions.library(LIBRARY.id);
    if (!source) return Promise.reject(new Error('Bibliothèque non fournie par Grist Factory Suite : ' + LIBRARY.id + '@' + LIBRARY.version));
    return ExportCommon.loadScriptOnce({ src: source.src, integrity: source.integrite });
  }
  // Résolue quand `window.echarts` est prêt ; rejetée si la source manque ou que le script ne charge pas, et réessayée alors à l'appel suivant.
  function ensureLibrary() {
    if (!libPromise) libPromise = loadLibrary().catch((e) => { libPromise = null; throw e; });
    return libPromise;
  }

  // La définition
  const isText = value => typeof value === 'string' && value !== '' && value.length <= MAX_TEXT;
  // Ce que le widget garde d'une définition lue (ou d'un choix de la fenêtre) : la forme, la table, la colonne des étiquettes, les colonnes à tracer et les deux réglages qui ont un sens pour la forme
  // (barres et aires empilées, barres horizontales). Null quand ce n'est pas un graphique que ce widget sait tracer : une forme inconnue (celle d'une version à venir) ne devient jamais des barres.
  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || KINDS.indexOf(raw.kind) === -1 || !isText(raw.table) || !isText(raw.label)) return null;
    const values = (Array.isArray(raw.values) ? raw.values : []).filter(isText).slice(0, MAX_VALUES);
    const def = { kind: raw.kind, table: raw.table, label: raw.label, values };
    if (raw.stack === true && (raw.kind === 'bar' || raw.kind === 'area')) def.stack = true;
    if (raw.horizontal === true && raw.kind === 'bar') def.horizontal = true;
    return def;
  }
  function parse(text) {
    if (typeof text !== 'string' || !text || text.length > 4000) return null;
    try { return normalize(JSON.parse(text)); } catch (e) { return null; }
  }
  const stringify = def => JSON.stringify(Object.assign({ v: 1 }, normalize(def)));
  // Les formes qui n'ont rien à tracer sans colonne de valeurs : toutes sauf secteurs et anneau, qui comptent alors les occurrences de chaque étiquette.
  const needsValues = kind => kind !== 'pie' && kind !== 'donut';
  // Le nom montré dans le cadre de l'éditeur : « Barres · Notes ».
  const nameOf = def => I18n.t('chart.type.' + def.kind) + ' · ' + def.table;

  // Les séries (la première est l'axe des étiquettes, les suivantes les valeurs) mises au goût d'ECharts
  const finite = value => typeof value === 'number' && isFinite(value);
  // Un libellé vide devient « - » (comme le graphique de la page) ; une date arrive déjà en texte (ChartSource.series).
  const labelOf = value => (value == null || value === '' ? '-' : String(value));
  const numberOrNull = value => (finite(value) ? value : null);
  // Le plus petit « beau » nombre (1, 2, 2,5, 5 × 10^n) qui n'est pas inférieur à `value` : le bout des axes d'un radar.
  function niceCeil(value) {
    if (!(value > 0)) return 0;
    const power = Math.pow(10, Math.floor(Math.log10(value)));
    const fraction = value / power;
    const step = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
    return step * power;
  }
  // Les séries dans l'ordre de l'axe des étiquettes quand ce sont des nombres ou des dates (une courbe ne revient pas en arrière) : les lignes sont triées d'après la première série. Des étiquettes
  // de texte gardent l'ordre de la table, qui est celui que la personne a voulu (les matières d'un bulletin, les mois d'une année).
  const isOrdered = x => ['Numeric', 'Int', 'Date', 'DateTime'].indexOf(x.pureType) !== -1 || (x.values.some(finite) && x.values.every(value => value == null || finite(value)));
  function sortedByLabel(series) {
    if (!isOrdered(series[0])) return series;
    const x = series[0].values;
    const order = x.map((value, i) => i).sort((a, b) => ViewSource.typedCompare(x[a], x[b]) || a - b);
    return series.map(s => Object.assign({}, s, { values: order.map(i => s.values[i]) }));
  }

  // L'option d'ECharts
  const textStyle = (extra) => Object.assign({ fontFamily: FONT_FAMILY, fontSize: FONT_SIZE, color: FOREGROUND }, extra || {});
  // La place d'un texte de `count` caractères (Arial 12 px : 6 px en moyenne, 7 par prudence) et la hauteur d'une ligne.
  const widthOfText = count => count * 7;
  const LINE_PX = 14;
  const NAME_PX = 18;             // la place d'un titre d'axe (une ligne, sa marge comprise) hors des graduations
  const longest = texts => texts.reduce((most, text) => Math.max(most, String(text).length), 0);
  const valuesOf = ys => ys.reduce((all, s) => all.concat(s.values.filter(finite)), []);
  const legendOf = (ys, show) => (show ? { top: 4, itemWidth: 14, itemHeight: 10, textStyle: textStyle(), data: ys.map(s => s.label) } : undefined);

  // La largeur des graduations de l'axe des valeurs : de quoi savoir la place qui reste aux étiquettes de l'autre axe.
  const tickWidthOf = ys => widthOfText(longest(valuesOf(ys).map(value => Math.round(value * 10) / 10)) + 1) + 8;
  // L'axe des valeurs : ses graduations seules ; les titres des axes sont posés à part (axisNames), à une place sûre dans les marges, que les graduations ne gagnent jamais.
  const valueAxisOf = () => ({
    type: 'value', axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: GRID_LINE } }, axisLabel: textStyle(),
  });
  // Les marges du graphique : de quoi loger un titre d'axe à gauche et en bas, les graduations étant comptées en plus (`containLabel`).
  const marginsOf = (xName, yName, legend) => ({ left: yName ? NAME_PX + 6 : 8, right: 18, top: legend ? 34 : 18, bottom: xName ? NAME_PX + 6 : 8, containLabel: true });
  // Les titres des axes : celui de l'axe horizontal sous le graphique, celui de l'axe vertical à gauche, tourné d'un quart de tour (il se lit de bas en haut). Ils sont coupés à la longueur de leur axe.
  function axisNames(size, grid, xName, yName) {
    const width = size.width || 480;
    const height = size.height || 300;
    const font = FONT_SIZE + 'px ' + FONT_FAMILY;
    const items = [];
    const text = (name, extra, room) => Object.assign({ type: 'text', silent: true, z: 100, style: { text: name, font, fill: FOREGROUND, textAlign: 'center', textVerticalAlign: 'middle', width: Math.max(40, room), overflow: 'truncate' } }, extra);
    if (xName) items.push(text(xName, { x: grid.left + (width - grid.left - grid.right) / 2, y: height - NAME_PX / 2 - 2 }, width - grid.left - grid.right));
    if (yName) items.push(text(yName, { x: NAME_PX / 2 + 2, y: grid.top + (height - grid.top - grid.bottom) / 2, rotation: -Math.PI / 2 }, height - grid.top - grid.bottom));
    return items;
  }

  // Les étiquettes de l'axe des catégories : à plat quand elles tiennent côte à côte, sinon penchées (et coupées à 110 px) ; au-delà, celles qui se recouvrent sont cachées.
  function categoryLabels(labels, room) {
    const wide = Math.min(110, widthOfText(longest(labels)));
    const slot = room / Math.max(1, labels.length);
    if (wide + 8 <= slot) return textStyle({ interval: 0 });
    const tilt = slot >= LINE_PX + 6;
    return textStyle({ rotate: tilt ? 45 : 90, width: 110, overflow: 'truncate', hideOverlap: true, interval: tilt ? 0 : 'auto' });
  }

  // Barres, courbes et aires : l'axe des étiquettes (catégories) et l'axe des valeurs, qui se croisent (barres horizontales) ou non.
  function cartesian(def, series, size) {
    const kind = def.kind;
    const horizontal = kind === 'bar' && !!def.horizontal;
    const ordered = kind === 'line' || kind === 'area' ? sortedByLabel(series) : series;
    const labels = ordered[0].values.map(labelOf);
    const ys = ordered.slice(1);
    // Les titres sont ceux du graphique de la page : l'axe des étiquettes porte le nom de sa colonne, l'axe des valeurs celui de l'unique série, et rien quand une légende nomme plusieurs séries.
    const valueName = ys.length === 1 ? ys[0].label : '';
    const width = size.width || 480;
    const category = {
      type: 'category', data: labels, boundaryGap: kind !== 'area', axisLine: { lineStyle: { color: AXIS_LINE } }, axisTick: { alignWithLabel: true, lineStyle: { color: AXIS_LINE } },
    };
    if (horizontal) {
      category.inverse = true;
      category.axisLabel = textStyle({ width: 140, overflow: 'truncate', interval: 0 });
    } else {
      category.axisLabel = categoryLabels(labels, width - tickWidthOf(ys) - (valueName ? NAME_PX : 0) - 28);
    }
    const data = ys.map((s) => {
      const line = { name: s.label, data: s.values.map(numberOrNull) };
      if (kind === 'bar') Object.assign(line, { type: 'bar', barMaxWidth: 48 });
      else Object.assign(line, { type: 'line', symbol: 'circle', symbolSize: 6, lineStyle: { width: 2 }, connectNulls: false });
      if (kind === 'area') line.areaStyle = { opacity: 0.28 };
      if (def.stack) line.stack = 'total';
      return line;
    });
    const legend = ys.length > 1;
    const xName = horizontal ? valueName : ordered[0].label;
    const yName = horizontal ? ordered[0].label : valueName;
    const grid = marginsOf(xName, yName, legend);
    return {
      legend: legendOf(ys, legend), grid, graphic: axisNames(size, grid, xName, yName),
      xAxis: horizontal ? valueAxisOf() : category,
      yAxis: horizontal ? category : valueAxisOf(),
      series: data,
    };
  }

  // Nuage de points : l'axe des étiquettes est l'abscisse (nombres, dates ou catégories), chaque colonne de valeurs un nuage.
  function scatter(def, series, size) {
    const x = series[0];
    const ys = series.slice(1);
    const isDate = x.pureType === 'Date' || x.pureType === 'DateTime';
    const numeric = !isDate && x.values.some(finite) && x.values.every(value => value == null || finite(value));
    const type = isDate ? 'time' : (numeric ? 'value' : 'category');
    const xAxis = { type, axisLine: { lineStyle: { color: AXIS_LINE } }, axisTick: { lineStyle: { color: AXIS_LINE } }, axisLabel: textStyle({ hideOverlap: true }), splitLine: { show: false } };
    if (type === 'value') xAxis.scale = true;
    if (type === 'category') xAxis.data = Array.from(new Set(x.values.map(labelOf)));
    const yAxis = valueAxisOf();
    yAxis.scale = true;
    const data = ys.map((s) => {
      const points = [];
      s.values.forEach((value, i) => {
        const at = x.values[i];
        if (finite(value) && at != null && at !== '') points.push([type === 'category' ? labelOf(at) : at, value]);
      });
      return { type: 'scatter', name: s.label, symbolSize: 9, data: points };
    });
    const legend = ys.length > 1;
    const yName = ys.length === 1 ? ys[0].label : '';
    const grid = marginsOf(x.label, yName, legend);
    return { legend: legendOf(ys, legend), grid, graphic: axisNames(size, grid, x.label, yName), xAxis, yAxis, series: data };
  }

  // La part d'un secteur, dans la langue de l'interface : « 15,1 % » (espace insécable) en français, « 15.1% » en anglais ; une décimale sous 10 %, aucune au-delà.
  function percentText(part) {
    const percent = Number(part.percent) || 0;
    const rounded = percent < 10 ? Math.round(percent * 10) / 10 : Math.round(percent);
    const french = I18n.getLang() === 'fr';
    return rounded.toLocaleString(french ? 'fr-FR' : 'en-US', { maximumFractionDigits: 1 }) + (french ? '\u00a0%' : '%');
  }
  // Secteurs et anneau : les étiquettes sont les parts, la première colonne de valeurs leur taille ; sans valeur, chaque ligne compte pour un. Deux lignes de même étiquette ne font qu'une part.
  function pie(def, series) {
    const x = series[0];
    const y = series[1];
    const parts = new Map();
    x.values.forEach((value, i) => {
      const size = y ? y.values[i] : 1;
      if (!finite(size) || size <= 0) return;
      const name = labelOf(value);
      parts.set(name, (parts.get(name) || 0) + size);
    });
    const data = Array.from(parts, ([name, value]) => ({ name, value }));
    return {
      legend: { bottom: 4, itemWidth: 14, itemHeight: 10, textStyle: textStyle(), data: data.map(part => part.name) },
      series: [{
        type: 'pie', name: y ? y.label : x.label, radius: def.kind === 'donut' ? ['38%', '60%'] : '60%', center: ['50%', '45%'], data, sort: undefined, avoidLabelOverlap: true,
        label: { show: true, formatter: percentText, color: FOREGROUND, fontFamily: FONT_FAMILY, fontSize: FONT_SIZE }, labelLine: { show: true, length: 8, length2: 6, lineStyle: { color: AXIS_LINE } },
        itemStyle: { borderColor: BACKGROUND, borderWidth: 1 },
      }],
    };
  }

  // Radar : une branche par étiquette, un polygone par colonne de valeurs, tous sur la même échelle (de zéro, ou du plus petit négatif, au plus grand « beau » nombre).
  function radar(def, series) {
    const x = series[0];
    const ys = series.slice(1);
    const labels = x.values.map(labelOf);
    const all = ys.reduce((list, s) => list.concat(s.values.filter(finite)), []);
    const top = niceCeil(Math.max(0, ...all)) || 1;
    const bottom = Math.min(0, ...all) < 0 ? -niceCeil(-Math.min(0, ...all)) : 0;
    const legend = ys.length > 1;
    return {
      legend: legendOf(ys, legend),
      radar: {
        indicator: labels.map(name => ({ name, max: top, min: bottom })), center: ['50%', legend ? '56%' : '52%'], radius: '62%', splitNumber: 4, shape: 'polygon',
        axisName: textStyle(), axisLine: { lineStyle: { color: GRID_LINE } }, splitLine: { lineStyle: { color: GRID_LINE } }, splitArea: { show: false },
      },
      series: [{
        type: 'radar', symbol: 'circle', symbolSize: 5,
        data: ys.map(s => ({ name: s.label, value: s.values.map(value => (finite(value) ? value : bottom)), lineStyle: { width: 2 }, areaStyle: { opacity: 0.18 } })),
      }],
    };
  }

  const BUILDERS = { bar: cartesian, line: cartesian, area: cartesian, scatter, pie, donut: pie, radar };

  // L'option d'ECharts de `def` pour ces séries (celles de ChartSource.series : la première est l'axe des étiquettes), pour une image de `size.width` x `size.height` pixels de mise en page.
  // Ne modifie pas `series`.
  function option(def, series, size) {
    if (!def || KINDS.indexOf(def.kind) === -1) throw new Error('Forme de graphique non prise en charge : ' + (def && def.kind));
    if (!series.length) throw new Error('Aucune série à tracer');
    const copy = series.map(s => Object.assign({}, s, { values: s.values.slice() }));
    const built = BUILDERS[def.kind](def, copy, size || {});
    return Object.assign({ animation: false, backgroundColor: BACKGROUND, color: COLORWAY, textStyle: textStyle() }, built);
  }

  // L'image PNG (adresse `data:`) de cette option, de `width` x `height` pixels de mise en page. Charge ECharts au premier appel. Le dessin se fait sur une page hors de l'écran, détruite aussitôt.
  async function toImage(chartOption, width, height) {
    await ensureLibrary();
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-10000px;top:0;pointer-events:none;width:' + width + 'px;height:' + height + 'px';
    document.body.appendChild(host);
    let chart = null;
    try {
      chart = window.echarts.init(host, null, { renderer: 'canvas', width, height, devicePixelRatio: SCALE });
      chart.setOption(chartOption, true);
      return chart.getDataURL({ type: 'png', pixelRatio: SCALE, backgroundColor: BACKGROUND });
    } finally {
      if (chart) chart.dispose();
      host.remove();
    }
  }

  return { LIBRARY, KINDS, SCALE, ensureLibrary, normalize, parse, stringify, needsValues, nameOf, option, toImage };
})();
