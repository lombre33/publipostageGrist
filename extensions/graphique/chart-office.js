// Le MODÈLE D'OFFICE d'un graphique créé (extensions/graphique/chart-make.js) : ce que Word, PowerPoint et Excel ont besoin de savoir pour refaire le graphique en graphique NATIF, que la personne
// modifie dans l'application (ses données s'ouvrent dans Excel), au lieu de l'image PNG que la Lecture, le PDF et l'éditeur montrent. Ce fichier ne sait que le construire : mêmes séries que le dessin
// (celles de chart-source.js, dans le même ordre, avec les mêmes couleurs, les mêmes types de séries et les mêmes valeurs affichées), en données simples que n'importe quel export lit sans rien savoir
// du widget, d'ECharts ni de la définition du graphique. Aucune bibliothèque : une fonction pure, comme `ChartMake.option`.
// L'entonnoir, la cascade et la jauge (lot 6) n'ont pas de modèle : Office n'a pas ces formes, `model` rend null et l'image PNG reste dans les exports (Word, PowerPoint, Excel).
//
// Le modèle voyage de la Lecture à l'export dans l'attribut `data-chart-office` de l'image (ChartBlock.resolveImage le pose avec le dessin, pour la ligne exportée), en JSON :
//   { v: 1, kind, title?, horizontal?, stacked?, labels?, axes?: { category?, value? }, categories: [texte], series: [...], scale?: { min, max }, xDates? }
//  - `kind` : la forme de la définition (bar, line, area, scatter, pie, donut, radar) ; `categories` : les étiquettes (barres, courbe, aire, radar) ou le nom de chaque part (secteurs, anneau) ;
//  - `series` : { name, color: '#rrggbb', type, values } - `type` : 'column', 'line' ou 'area' (une série d'un graphique mixte a le sien), `values` : un nombre ou null par catégorie ; un nuage de points
//    a `points: [[x, y]]` à la place de `values` ; secteurs et anneau une seule série dont `colors` donne la couleur de chaque part ;
//  - `labels` : les valeurs sont écrites sur le graphique ; `stacked` : barres ou aires empilées ; `horizontal` : barres couchées ; `axes` : le nom des deux axes quand le dessin en porte ;
//    `scale` : les bouts de l'échelle d'un radar ; `xDates` : les abscisses d'un nuage sont des dates (numéros de série d'Excel).
// Un graphique que cette forme ne sait pas dire (un nuage dont l'abscisse est du texte, plus de MAX_CATEGORIES étiquettes) n'a pas de modèle : il reste l'image, qui sort telle quelle.
const ChartOffice = (function () {
  const VERSION = 1;
  const MAX_CATEGORIES = 2000;    // au-delà, un graphique n'est plus lisible ni modifiable : l'image seule
  const finite = value => typeof value === 'number' && isFinite(value);
  const numberOrNull = value => (finite(value) ? value : null);
  const labelOf = value => (value == null || value === '' ? '-' : String(value));
  // Le type de série d'Office pour le type de la définition : des barres sont des « colonnes », la courbe d'une aire est une aire.
  const OFFICE_TYPE = { bar: 'column', line: 'line' };
  const typeOf = (def, column) => (def.kind === 'area' && ChartMake.seriesType(def, column) === 'line' ? 'area' : OFFICE_TYPE[ChartMake.seriesType(def, column)]);
  // Des abscisses en dates : le numéro de série qu'Excel donne à un jour (le 30/12/1899 est le jour 0, un jour = 1), d'après l'heure du mur du texte de ChartSource.series (« 2026-11-02T14:30:00.000+01:00 » : l'écart
  // se tait, c'est l'heure que la personne voit dans Grist) ; null pour un texte qui n'est pas une date.
  function serialOf(text) {
    const parts = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(String(text));
    if (!parts) return null;
    const ms = Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]), Number(parts[4] || 0), Number(parts[5] || 0), Number(parts[6] || 0));
    return isFinite(ms) ? Math.round((ms / 86400000 + 25569) * 86400) / 86400 : null;
  }

  // Les séries d'un graphique à catégories (barres, courbe, aire) : dans l'ordre que le dessin leur a donné (ChartMake.ordered : courbe et aire suivent l'ordre des nombres et des dates).
  function cartesian(def, series) {
    const ordered = ChartMake.ordered(def, series);
    const ys = ordered.slice(1);
    return {
      categories: ordered[0].values.map(labelOf),
      horizontal: def.kind === 'bar' && !!def.horizontal,
      stacked: !!def.stack,
      axes: { category: ordered[0].label, value: ys.length === 1 ? ys[0].label : '' },
      series: ys.map((s, i) => ({ name: s.label, color: ChartMake.seriesColor(def, s.colId, i), type: typeOf(def, s.colId), values: s.values.map(numberOrNull) })),
    };
  }

  // Un nuage de points : les abscisses sont des nombres ou des dates ; des abscisses de texte n'ont pas de place dans un nuage d'Office (null).
  function scatter(def, series) {
    const x = series[0];
    const isDate = x.pureType === 'Date' || x.pureType === 'DateTime';
    const numeric = !isDate && x.values.some(finite) && x.values.every(value => value == null || finite(value));
    if (!isDate && !numeric) return null;
    const ys = series.slice(1);
    const abscissa = x.values.map(value => (isDate ? serialOf(value) : value));
    return {
      xDates: isDate || undefined,
      axes: { category: x.label, value: ys.length === 1 ? ys[0].label : '' },
      series: ys.map((s, i) => ({
        name: s.label, color: ChartMake.seriesColor(def, s.colId, i),
        points: s.values.map((value, at) => [abscissa[at], value]).filter(point => finite(point[0]) && finite(point[1])),
      })),
    };
  }

  // Secteurs et anneau : une part par étiquette (deux lignes de même étiquette n'en font qu'une, sans valeur chaque ligne compte pour un), les couleurs du jeu dans l'ordre, comme le dessin.
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
    const palette = ChartMake.paletteOf(def);
    return {
      categories: Array.from(parts.keys()),
      series: [{ name: y ? y.label : x.label, color: palette[0], values: Array.from(parts.values()), colors: Array.from(parts.keys(), (name, at) => palette[at % palette.length]) }],
    };
  }

  // Radar : une branche par étiquette, un polygone par colonne de valeurs, sur l'échelle que le dessin a prise (zéro ou le plus petit négatif, jusqu'au plus grand « beau » nombre).
  function radar(def, series) {
    const ys = series.slice(1);
    const all = ys.reduce((list, s) => list.concat(s.values.filter(finite)), []);
    const top = ChartMake.niceCeil(Math.max(0, ...all)) || 1;
    const bottom = Math.min(0, ...all) < 0 ? -ChartMake.niceCeil(-Math.min(0, ...all)) : 0;
    return {
      categories: series[0].values.map(labelOf),
      scale: { min: bottom, max: top },
      series: ys.map((s, i) => ({ name: s.label, color: ChartMake.seriesColor(def, s.colId, i), type: 'line', values: s.values.map(value => (finite(value) ? value : bottom)) })),
    };
  }

  const BUILDERS = { bar: cartesian, line: cartesian, area: cartesian, scatter, pie, donut: pie, radar };

  // Le modèle de `def` pour ces séries (celles de ChartSource.series) : un objet simple, prêt à s'écrire en JSON ; null quand la forme n'a pas d'équivalent modifiable. Ne modifie pas `series`.
  function model(def, series) {
    if (!def || !BUILDERS[def.kind] || !series.length) return null;
    const copy = series.map(s => Object.assign({}, s, { values: s.values.slice() }));
    if (copy[0].values.length > MAX_CATEGORIES) return null;
    const built = BUILDERS[def.kind](def, copy);
    if (!built || !built.series.length) return null;
    const out = { v: VERSION, kind: def.kind };
    if (def.title) out.title = def.title;
    if (def.labels) out.labels = true;
    Object.keys(built).forEach((key) => { if (built[key] !== undefined && built[key] !== false) out[key] = built[key]; });
    return out;
  }

  return { VERSION, MAX_CATEGORIES, model };
})();
