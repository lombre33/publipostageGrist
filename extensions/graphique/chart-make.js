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
  const MAX_TITLE = 120;          // le titre du graphique, en caractères
  // Les couleurs au choix : un jeu de dix couleurs pour tout le graphique (« standard » est celui du graphique de la page, Plotly), et sur chaque série une couleur à elle. Les jeux se lisent sur
  // le blanc, leurs premières couleurs se distinguent bien entre elles (les « gris » aussi une fois imprimés en noir et blanc : des clartés bien écartées). Le jeu est gardé par son NOM, jamais par
  // ses couleurs : un jeu retouché plus tard change tous les graphiques qui le portent ; la couleur d'une série, elle, est une couleur de la personne et reste telle quelle (#rrggbb).
  const PALETTES = {
    standard: ['#2b78ae', '#fe945b', '#3a936e', '#d34141', '#8563cc', '#8c564b', '#db7fbf', '#7f7f7f', '#b3b42b', '#28b4d3'],
    blue: ['#12385c', '#4d94c8', '#a9cbe6', '#2b78ae', '#0b2540', '#7fb2d9', '#1c5a8c', '#cfe2f1', '#164a78', '#6aa3d0'],
    warm: ['#a32a1f', '#e8742c', '#f0b13a', '#7d2f1c', '#d4504a', '#f4d27a', '#c2571b', '#8c1f2e', '#f08a5d', '#b8860b'],
    cool: ['#1d6b73', '#2f6fb0', '#4aa37f', '#4f5bb5', '#79b8c9', '#2a8c8c', '#8aa7d8', '#136447', '#6f7fcf', '#9fcfb8'],
    gray: ['#262626', '#8f8f8f', '#5a5a5a', '#c2c2c2', '#404040', '#a8a8a8', '#737373', '#d9d9d9', '#333333', '#7f7f7f'],
  };
  const PALETTE_IDS = Object.keys(PALETTES);
  const DEFAULT_PALETTE = PALETTE_IDS[0];
  const HEX = /^#[0-9a-f]{6}$/i;
  // Les formes dont les séries se mêlent (barres, courbes, aires : un même axe des étiquettes et un même axe des valeurs) et le type de série qu'elles ont d'origine : celui d'une série qui n'a
  // pas de type à elle. Une aire est une courbe remplie.
  const MIXABLE = ['bar', 'line', 'area'];
  const SERIES_TYPES = ['bar', 'line'];
  const baseTypeOf = kind => (kind === 'bar' ? 'bar' : 'line');
  const hasSeries = kind => kind !== 'pie' && kind !== 'donut';
  const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const COLORWAY = PALETTES[DEFAULT_PALETTE];
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
  // Le titre : une seule ligne (les retours à la ligne et les espaces en suite n'en font qu'un), 120 caractères au plus ; vide, il n'y en a pas.
  function titleOf(raw) {
    if (typeof raw !== 'string') return '';
    return Array.from(raw.replace(/\s+/g, ' ').trim()).slice(0, MAX_TITLE).join('').trim();
  }
  // Les réglages PAR SÉRIE sont gardés par l'identifiant de la colonne, jamais par son rang : retirer une colonne ou en changer l'ordre ne donne pas sa couleur à sa voisine. Seules les colonnes
  // tracées gardent le leur, et rien quand la forme n'a pas de série (secteurs et anneau : les parts n'ont pas de colonne).
  function colorsOf(raw, values, kind) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !hasSeries(kind)) return null;
    const colors = {};
    values.forEach((column) => { if (hasOwn(raw, column) && typeof raw[column] === 'string' && HEX.test(raw[column])) colors[column] = raw[column].toLowerCase(); });
    return Object.keys(colors).length ? colors : null;
  }
  // Le type des séries qui ne sont pas du type de la forme (une série en courbe dans des barres, ou en barres dans une courbe) : un graphique mixte. Sans effet pour les autres formes et pour des
  // barres horizontales, dont la courbe n'aurait pas de sens.
  function mixOf(raw, values, kind, horizontal) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || MIXABLE.indexOf(kind) === -1 || horizontal) return null;
    const mix = {};
    values.forEach((column) => { if (hasOwn(raw, column) && SERIES_TYPES.indexOf(raw[column]) !== -1 && raw[column] !== baseTypeOf(kind)) mix[column] = raw[column]; });
    return Object.keys(mix).length ? mix : null;
  }
  // Ce que le widget garde d'une définition lue (ou d'un choix de la fenêtre) : la forme, la table, la colonne des étiquettes, les colonnes à tracer, les deux réglages qui ont un sens pour la forme
  // (barres et aires empilées, barres horizontales) et l'aspect : le titre, le jeu de couleurs (le jeu d'origine n'est pas écrit), la couleur de chaque série, les valeurs affichées et le type des
  // séries d'un graphique mixte. Null quand ce n'est pas un graphique que ce widget sait tracer : une forme inconnue (celle d'une version à venir) ne devient jamais des barres. Une définition d'avant
  // l'aspect (lot 1) se lit telle quelle et se réécrit de même : rien n'est ajouté tant que la personne n'a rien réglé.
  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || KINDS.indexOf(raw.kind) === -1 || !isText(raw.table) || !isText(raw.label)) return null;
    const values = (Array.isArray(raw.values) ? raw.values : []).filter(isText).slice(0, MAX_VALUES);
    const def = { kind: raw.kind, table: raw.table, label: raw.label, values };
    if (raw.stack === true && (raw.kind === 'bar' || raw.kind === 'area')) def.stack = true;
    if (raw.horizontal === true && raw.kind === 'bar') def.horizontal = true;
    const title = titleOf(raw.title);
    if (title) def.title = title;
    if (PALETTE_IDS.indexOf(raw.palette) > 0) def.palette = raw.palette;
    const colors = colorsOf(raw.colors, values, raw.kind);
    if (colors) def.colors = colors;
    if (raw.labels === true) def.labels = true;
    const mix = mixOf(raw.mix, values, raw.kind, def.horizontal);
    if (mix) def.mix = mix;
    return def;
  }
  // Le jeu de couleurs de `def` et la couleur de sa colonne `column` : celle de la personne, sinon celle du jeu au rang de la colonne parmi les colonnes à tracer (le jeu revient au début après dix).
  const paletteOf = def => PALETTES[def && PALETTE_IDS.indexOf(def.palette) !== -1 ? def.palette : DEFAULT_PALETTE];
  // `fallback` : le rang à prendre pour une colonne qui n'est pas dans les colonnes à tracer (une série sans identifiant de colonne).
  function seriesColor(def, column, fallback) {
    const palette = paletteOf(def);
    const at = ((def && def.values) || []).indexOf(column);
    return (def && def.colors && hasOwn(def.colors, column) && def.colors[column]) || palette[(at >= 0 ? at : (fallback || 0)) % palette.length];
  }
  // Le type de la série `column` d'une forme qui se mêle : le sien (graphique mixte), sinon celui de la forme.
  const seriesType = (def, column) => (def.mix && hasOwn(def.mix, column) ? def.mix[column] : baseTypeOf(def.kind));
  function parse(text) {
    if (typeof text !== 'string' || !text || text.length > 4000) return null;
    try { return normalize(JSON.parse(text)); } catch (e) { return null; }
  }
  const stringify = def => JSON.stringify(Object.assign({ v: 1 }, normalize(def)));
  // Les formes qui n'ont rien à tracer sans colonne de valeurs : toutes sauf secteurs et anneau, qui comptent alors les occurrences de chaque étiquette.
  const needsValues = kind => kind !== 'pie' && kind !== 'donut';
  // Le nom montré dans le cadre de l'éditeur et lu pour l'image : le titre du graphique quand il en a un, sinon « Barres · Notes ».
  const nameOf = def => def.title || (I18n.t('chart.type.' + def.kind) + ' · ' + def.table);

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
  // Les séries d'un graphique à catégories dans l'ordre où le dessin les trace : courbe et aire suivent l'ordre des étiquettes, les barres celui de la table (aussi pour le modèle d'Office, chart-office.js).
  const orderedSeries = (def, series) => (def.kind === 'line' || def.kind === 'area' ? sortedByLabel(series) : series);

  // L'option d'ECharts
  const textStyle = (extra) => Object.assign({ fontFamily: FONT_FAMILY, fontSize: FONT_SIZE, color: FOREGROUND }, extra || {});
  // La place d'un texte de `count` caractères (Arial 12 px : 6 px en moyenne, 7 par prudence) et la hauteur d'une ligne.
  const widthOfText = count => count * 7;
  const LINE_PX = 14;
  const NAME_PX = 18;             // la place d'un titre d'axe (une ligne, sa marge comprise) hors des graduations
  const TITLE_PX = 28;            // la place du titre du graphique en haut de l'image (une ligne de 15 px en gras et sa marge) : tout le reste descend d'autant
  const VALUE_PX = 11;            // la taille des valeurs affichées
  const longest = texts => texts.reduce((most, text) => Math.max(most, String(text).length), 0);
  const valuesOf = ys => ys.reduce((all, s) => all.concat(s.values.filter(finite)), []);
  // Un nombre écrit dans le dessin (graduation, valeur affichée), dans la langue de l'interface : « 1 234,5 » en français, « 1,234.5 » en anglais ; `digits` décimales au plus (deux par défaut). L'espace
  // fine insécable que le français met entre les milliers devient une espace insécable ordinaire, que la police du dessin a toujours.
  function numberText(value, digits) {
    const text = Number(value).toLocaleString(I18n.getLang() === 'fr' ? 'fr-FR' : 'en-US', { maximumFractionDigits: digits === undefined ? 2 : digits });
    return text.replace(/ /g, ' ');
  }
  // Le titre : centré en haut de l'image, sur une seule ligne coupée par « … » à la largeur de l'image. Le texte s'écrit tel quel (pas de gabarit ni de style riche). `liftOf` est la place qu'il prend.
  const liftOf = def => (def.title ? TITLE_PX : 0);
  function titleOption(def, size) {
    if (!def.title) return undefined;
    return { text: def.title, left: 'center', top: 7, textStyle: { fontFamily: FONT_FAMILY, fontSize: 15, fontWeight: 'bold', color: FOREGROUND, width: Math.max(80, (size.width || 480) - 32), overflow: 'truncate' } };
  }
  const legendOf = (ys, show, lift) => (show ? { top: 4 + lift, itemWidth: 14, itemHeight: 10, textStyle: textStyle(), data: ys.map(s => s.label) } : undefined);

  // La largeur des graduations de l'axe des valeurs : de quoi savoir la place qui reste aux étiquettes de l'autre axe.
  const tickWidthOf = ys => widthOfText(longest(valuesOf(ys).map(value => numberText(Math.round(value * 10) / 10, 1))) + 1) + 8;
  // L'axe des valeurs : ses graduations seules (écrites dans la langue de l'interface) ; les titres des axes sont posés à part (axisNames), à une place sûre dans les marges, que les graduations ne gagnent jamais.
  const valueAxisOf = () => ({
    type: 'value', axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { color: GRID_LINE } }, axisLabel: textStyle({ formatter: value => numberText(value, 6) }),
  });
  // Les marges du graphique : de quoi loger un titre d'axe à gauche et en bas, les graduations étant comptées en plus (`containLabel`). `lift` descend le tout sous le titre du graphique ; `room` donne
  // la place de plus que prennent les valeurs affichées : au-dessus des barres et des points (`top`), au bout des barres horizontales (`right`).
  const marginsOf = (xName, yName, legend, lift, room) => ({
    left: yName ? NAME_PX + 6 : 8, right: 18 + (room.right || 0), top: (legend ? 34 : 18) + lift + (room.top || 0), bottom: xName ? NAME_PX + 6 : 8, containLabel: true,
  });
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

  // Les valeurs affichées sur une série : au-dessus des barres et des points, au bout des barres horizontales, au milieu des barres empilées (en noir ou en blanc, selon la couleur de la barre) ; celles
  // qui se recouvrent sont cachées (`labelLayout`).
  const valueLabel = (position, color, pick) => ({ show: true, position, fontFamily: FONT_FAMILY, fontSize: VALUE_PX, color, formatter: pick || (part => numberText(part.value)) });
  const NO_OVERLAP = { hideOverlap: true };
  // Le groupe où s'empile une série (ECharts empile entre elles les séries d'un même groupe) : des barres empilées s'empilent entre elles et les courbes d'un graphique mixte se posent par-dessus, sans
  // s'empiler ; des aires empilées s'empilent entre elles, les barres d'un graphique mixte formant un groupe à part.
  function stackOf(def, type) {
    if (!def.stack) return undefined;
    if (def.kind === 'bar') return type === 'bar' ? 'total' : undefined;
    return type === 'line' ? 'total' : 'bars';
  }

  // Barres, courbes et aires : l'axe des étiquettes (catégories) et l'axe des valeurs, qui se croisent (barres horizontales) ou non. Chaque série a son type (celui de la forme, ou le sien dans un graphique
  // mixte : des barres et une courbe sur les mêmes axes) et sa couleur.
  function cartesian(def, series, size) {
    const kind = def.kind;
    const horizontal = kind === 'bar' && !!def.horizontal;
    const ordered = orderedSeries(def, series);
    const labels = ordered[0].values.map(labelOf);
    const ys = ordered.slice(1);
    const types = ys.map(s => seriesType(def, s.colId));
    const colors = ys.map((s, i) => seriesColor(def, s.colId, i));
    const lift = liftOf(def);
    // Les titres sont ceux du graphique de la page : l'axe des étiquettes porte le nom de sa colonne, l'axe des valeurs celui de l'unique série, et rien quand une légende nomme plusieurs séries.
    const valueName = ys.length === 1 ? ys[0].label : '';
    const width = size.width || 480;
    const category = {
      type: 'category', data: labels, boundaryGap: kind !== 'area' || types.indexOf('bar') !== -1, axisLine: { lineStyle: { color: AXIS_LINE } }, axisTick: { alignWithLabel: true, lineStyle: { color: AXIS_LINE } },
    };
    if (horizontal) {
      category.inverse = true;
      category.axisLabel = textStyle({ width: 140, overflow: 'truncate', interval: 0 });
    } else {
      category.axisLabel = categoryLabels(labels, width - tickWidthOf(ys) - (valueName ? NAME_PX : 0) - 28);
    }
    const data = ys.map((s, i) => {
      const type = types[i];
      const line = { name: s.label, data: s.values.map(numberOrNull) };
      if (type === 'bar') Object.assign(line, { type: 'bar', barMaxWidth: 48 });
      else Object.assign(line, { type: 'line', symbol: 'circle', symbolSize: 6, lineStyle: { width: 2 }, connectNulls: false });
      if (kind === 'area' && type === 'line') line.areaStyle = { opacity: 0.28 };
      const stack = stackOf(def, type);
      if (stack) line.stack = stack;
      if (def.labels) {
        line.label = type === 'bar' ? valueLabel(stack ? 'inside' : (horizontal ? 'right' : 'top'), stack ? ColorMath.inkOn(colors[i]) : FOREGROUND) : valueLabel('top', FOREGROUND);
        line.labelLayout = NO_OVERLAP;
      }
      return line;
    });
    const legend = ys.length > 1;
    const xName = horizontal ? valueName : ordered[0].label;
    const yName = horizontal ? ordered[0].label : valueName;
    const grid = marginsOf(xName, yName, legend, lift, def.labels ? (horizontal ? { right: 28 } : { top: 10 }) : {});
    return {
      legend: legendOf(ys, legend, lift), grid, graphic: axisNames(size, grid, xName, yName),
      xAxis: horizontal ? valueAxisOf() : category,
      yAxis: horizontal ? category : valueAxisOf(),
      series: data, color: colors,
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
      const cloud = { type: 'scatter', name: s.label, symbolSize: 9, data: points };
      if (def.labels) {
        cloud.label = valueLabel('top', FOREGROUND, part => numberText(part.value[1]));
        cloud.labelLayout = NO_OVERLAP;
      }
      return cloud;
    });
    const legend = ys.length > 1;
    const yName = ys.length === 1 ? ys[0].label : '';
    const grid = marginsOf(x.label, yName, legend, liftOf(def), def.labels ? { top: 10 } : {});
    return { legend: legendOf(ys, legend, liftOf(def)), grid, graphic: axisNames(size, grid, x.label, yName), xAxis, yAxis, series: data, color: ys.map((s, i) => seriesColor(def, s.colId, i)) };
  }

  // La part d'un secteur, dans la langue de l'interface : « 15,1 % » (espace insécable) en français, « 15.1% » en anglais ; une décimale sous 10 %, aucune au-delà.
  function percentText(part) {
    const percent = Number(part.percent) || 0;
    const rounded = percent < 10 ? Math.round(percent * 10) / 10 : Math.round(percent);
    const french = I18n.getLang() === 'fr';
    return rounded.toLocaleString(french ? 'fr-FR' : 'en-US', { maximumFractionDigits: 1 }) + (french ? ' %' : '%');
  }
  // Secteurs et anneau : les étiquettes sont les parts, la première colonne de valeurs leur taille ; sans valeur, chaque ligne compte pour un. Deux lignes de même étiquette ne font qu'une part. Les
  // parts prennent les couleurs du jeu, dans l'ordre. Un titre fait descendre et rétrécir le disque ; les valeurs affichées s'écrivent avec la part : « 12 (15,1 %) ».
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
    const outer = def.title ? 54 : 60;
    return {
      legend: { bottom: 4, itemWidth: 14, itemHeight: 10, textStyle: textStyle(), data: data.map(part => part.name) },
      series: [{
        type: 'pie', name: y ? y.label : x.label, radius: def.kind === 'donut' ? [Math.round(outer * 0.63) + '%', outer + '%'] : outer + '%', center: ['50%', def.title ? '50%' : '45%'], data, sort: undefined, avoidLabelOverlap: true,
        label: { show: true, formatter: def.labels ? part => numberText(part.value) + ' (' + percentText(part) + ')' : percentText, color: FOREGROUND, fontFamily: FONT_FAMILY, fontSize: FONT_SIZE },
        labelLine: { show: true, length: 8, length2: 6, lineStyle: { color: AXIS_LINE } }, itemStyle: { borderColor: BACKGROUND, borderWidth: 1 },
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
    const lift = liftOf(def);
    const colors = ys.map((s, i) => seriesColor(def, s.colId, i));
    // Le titre et la légende descendent le centre ; le polygone rétrécit d'autant pour que les noms des branches tiennent dans l'image.
    const centerY = 52 + (legend ? 4 : 0) + (lift ? 5 : 0);
    const series0 = {
      type: 'radar', symbol: 'circle', symbolSize: 5,
      data: ys.map((s, i) => ({ name: s.label, value: s.values.map(value => (finite(value) ? value : bottom)), itemStyle: { color: colors[i] }, lineStyle: { width: 2, color: colors[i] }, areaStyle: { opacity: 0.18, color: colors[i] } })),
    };
    if (def.labels) {
      series0.label = { show: true, fontFamily: FONT_FAMILY, fontSize: VALUE_PX, color: FOREGROUND, formatter: part => numberText(part.value) };
      series0.labelLayout = NO_OVERLAP;
    }
    return {
      legend: legendOf(ys, legend, lift),
      radar: {
        indicator: labels.map(name => ({ name, max: top, min: bottom })), center: ['50%', centerY + '%'], radius: (lift ? 56 : 62) + '%', splitNumber: 4, shape: 'polygon',
        axisName: textStyle(), axisLine: { lineStyle: { color: GRID_LINE } }, splitLine: { lineStyle: { color: GRID_LINE } }, splitArea: { show: false },
      },
      series: [series0], color: colors,
    };
  }

  const BUILDERS = { bar: cartesian, line: cartesian, area: cartesian, scatter, pie, donut: pie, radar };

  // L'option d'ECharts de `def` pour ces séries (celles de ChartSource.series : la première est l'axe des étiquettes, les autres portent l'identifiant de leur colonne), pour une image de `size.width` x
  // `size.height` pixels de mise en page. Ne modifie pas `series`.
  function option(def, series, size) {
    if (!def || KINDS.indexOf(def.kind) === -1) throw new Error('Forme de graphique non prise en charge : ' + (def && def.kind));
    if (!series.length) throw new Error('Aucune série à tracer');
    const copy = series.map(s => Object.assign({}, s, { values: s.values.slice() }));
    const frame = size || {};
    const title = titleOption(def, frame);
    return Object.assign({ animation: false, backgroundColor: BACKGROUND, color: paletteOf(def), textStyle: textStyle() }, title ? { title } : {}, BUILDERS[def.kind](def, copy, frame));
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

  return {
    LIBRARY, KINDS, SCALE, PALETTES, PALETTE_IDS, MAX_TITLE, MIXABLE, ensureLibrary, normalize, parse, stringify, needsValues, nameOf, option, toImage, paletteOf, seriesColor, seriesType, baseTypeOf, hasSeries, numberText, ordered: orderedSeries, niceCeil,
  };
})();
