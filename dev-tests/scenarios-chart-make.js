// Suite "chartMake" - « Créer un graphique… » (lots 1 et 2 du module de graphiques, demande du 02/11 : un graphique réglé dans le modèle, en plus de celui qu'on importe de Grist, pour le document, la grille et
// la présentation), extensions/graphique/chart-make.js (la définition et le dessin d'ECharts), chart-make-ui.js (la fenêtre), chart-source.js (`made`), chart-block.js (`drawMade`, le cadre de l'éditeur, la Lecture
// et les exports) et js/chart-entry.js. Joué hébergé comme la suite « chart » : un GFS simulé donne l'extension « graphique » et les sources de ses deux bibliothèques (cf. HOSTED_GROUPS de run-headless.mjs) ;
// le document de Grist est celui de dev-tests/scenarios-chart-block.js (`window.__chartFixture` : les clients, leurs ventes, la règle de liaison). Cinq parties :
//  1) la DÉFINITION et le DESSIN : ce que le widget garde d'un graphique créé, l'option d'ECharts de chaque forme (barres, courbe, aire, nuage, secteurs, anneau, radar ; lot 6 : entonnoir, cascade, jauge), l'image PNG réellement tracée ;
//  2) les LIGNES : les colonnes lues par leur identifiant dans l'ordre de la table, les lignes liées, la table ou la colonne disparue, une ligne sans valeur ;
//  3) l'ÉDITEUR : la ligne du menu « Ajouter une image » (celui des blocs garde ses neuf lignes), son grisé, la fenêtre (formes, table, colonnes, lignes, aperçu), le nœud (`data-chart-spec`, jamais d'image),
//     le cadre dessiné, la modification, la relecture du modèle, la définition illisible, l'anglais, le mode lecture seule ;
//  4) les RENDUS : Lecture et PDF montrent la même image que l'éditeur ; le Word, le PowerPoint et l'Excel sont des graphiques natifs (lots 3 à 5 : suite « chartOffice ») ;
//  5) l'ASPECT (lot 2) : le titre, les cinq jeux de couleurs, la couleur de chaque série, les valeurs affichées, les barres mêlées à une courbe ; leur définition, leur dessin, l'onglet « Aspect » de la fenêtre,
//     le choix d'une couleur à la place des onglets (dont la rangée « Couleurs du thème »), l'écriture dans le nœud et UN seul Annuler.
// La vraie souris et le vrai clavier à 700x400 (clair, sombre, anglais) sont dans dev-tests/verify-chart-make-mouse.mjs : une page.evaluate ne déclenche ni un survol ni une frappe de confiance.
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const tiptap = () => document.querySelector('.tiptap');
  const parse = html => new DOMParser().parseFromString(html, 'text/html').body;
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const PAGE_TABLE = 'GfClients';
  const SALES = 'GfVentes';
  const waitFor = async (check, timeout) => { const end = Date.now() + (timeout || 4000); while (Date.now() < end) { if (check()) return true; await sleep(40); } return false; };

  // === Le document de Grist : celui de la suite « chart » ====================================================================================================
  let fixturePromise = null;
  function fixture() {
    if (window.__chartFixture) return Promise.resolve(window.__chartFixture);
    if (!fixturePromise) {
      fixturePromise = new Promise((ok, ko) => {
        const script = document.createElement('script');
        script.src = '/dev-tests/scenarios-chart-block.js';
        script.onload = () => ok(window.__chartFixture);
        script.onerror = () => ko(new Error('dev-tests/scenarios-chart-block.js introuvable'));
        document.head.appendChild(script);
      });
    }
    return fixturePromise;
  }
  async function seed(h) { await (await fixture()).seed(h); }
  const recordOf = id => Object.assign({}, window.__chartFixture.clients.find(r => r.id === id));
  const NO_SALE = { id: 99, Nom: 'Sans vente' };

  // === Les données des essais sans éditeur ===================================================================================================================
  const xs = (label, values, pureType) => ({ label, values, pureType: pureType || 'Text' });
  const ys = (label, values) => ({ label, values, pureType: 'Numeric' });
  const MONTHS = xs('Mois', ['Mars', 'Janvier', 'Février']);
  const AMOUNT = ys('Montant', [300, 100, 200]);
  const COST = ys('Cout', [120, 60, 90]);
  const def = (kind, extra) => ChartMake.normalize(Object.assign({ kind, table: SALES, label: 'Mois', values: ['Montant', 'Cout'] }, extra || {}));
  const optionOf = (kind, series, extra, size) => ChartMake.option(def(kind, extra), series, size || { width: 480, height: 300 });
  const titlesOf = option => (option.graphic || []).map(item => item.style.text);
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
    return { width: canvas.width, height: canvas.height, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
  }
  // Le nombre de pixels qui ne sont ni blancs ni transparents, et celui qui sont proches de `rgb`.
  const inkOf = (picture) => { let n = 0; for (let i = 0; i < picture.data.length; i += 4) if (picture.data[i + 3] > 0 && (picture.data[i] < 235 || picture.data[i + 1] < 235 || picture.data[i + 2] < 235)) n += 1; return n; };
  const nearOf = (picture, rgb, tolerance) => { let n = 0; for (let i = 0; i < picture.data.length; i += 4) if (Math.abs(picture.data[i] - rgb[0]) <= tolerance && Math.abs(picture.data[i + 1] - rgb[1]) <= tolerance && Math.abs(picture.data[i + 2] - rgb[2]) <= tolerance) n += 1; return n; };
  const BAR_BLUE = [43, 120, 174];

  // === 1) La définition et le dessin ========================================================================================================================
  cases.push({
    id: 'chart_make_definition_keeps_what_the_widget_can_draw_and_refuses_the_rest',
    description: 'La définition gardée sur le nœud : la forme, la table, la colonne des étiquettes et jusqu\'à huit colonnes à tracer ; « empilé » seulement pour barres et aire, « horizontal » seulement pour barres ; une forme inconnue (celle d\'une version à venir), une table ou des étiquettes absentes ne deviennent jamais un graphique ; le texte écrit (`v` : 1) se relit à l\'identique ; un texte illisible ou trop long est refusé ; secteurs et anneau se passent de colonne de valeurs, les autres non ; le nom du cadre dit la forme et la table',
    run: async () => {
      const full = ChartMake.normalize({ kind: 'bar', table: SALES, label: 'Mois', values: ['Montant', 'Cout'], stack: true, horizontal: true });
      const line = ChartMake.normalize({ kind: 'line', table: SALES, label: 'Mois', values: ['Montant'], stack: true, horizontal: true });
      const area = ChartMake.normalize({ kind: 'area', table: SALES, label: 'Mois', values: ['Montant'], stack: true, horizontal: true });
      const many = ChartMake.normalize({ kind: 'bar', table: SALES, label: 'Mois', values: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 3, '', null] });
      const refused = [{ kind: 'treemap', table: 'T', label: 'L', values: [] }, { kind: 'bar', label: 'L', values: [] }, { kind: 'bar', table: 'T', values: [] }, { kind: 'bar', table: 'x'.repeat(201), label: 'L' }, null, 'bar', 42].map(raw => ChartMake.normalize(raw));
      const written = ChartMake.stringify(full);
      const back = ChartMake.parse(written);
      const bad = [ChartMake.parse('{bad'), ChartMake.parse(''), ChartMake.parse(null), ChartMake.parse('x'.repeat(4001)), ChartMake.parse('{"v":1,"kind":"treemap","table":"T","label":"L"}')];
      return {
        pass: same(full, { kind: 'bar', table: SALES, label: 'Mois', values: ['Montant', 'Cout'], stack: true, horizontal: true })
          && same(line, { kind: 'line', table: SALES, label: 'Mois', values: ['Montant'] }) && same(area, { kind: 'area', table: SALES, label: 'Mois', values: ['Montant'], stack: true })
          && many.values.length === 8 && many.values.join('') === 'abcdefgh' && refused.every(r => r === null)
          && written.startsWith('{"v":1,"kind":"bar"') && same(back, full) && bad.every(r => r === null)
          && ChartMake.needsValues('bar') && ChartMake.needsValues('radar') && ChartMake.needsValues('scatter') && !ChartMake.needsValues('pie') && !ChartMake.needsValues('donut')
          && ChartMake.nameOf(full) === 'Barres · GfVentes' && ChartMake.nameOf(line) === 'Courbe · GfVentes' && same(ChartMake.KINDS, ['bar', 'line', 'area', 'scatter', 'pie', 'donut', 'radar', 'funnel', 'waterfall', 'gauge'])
          && ChartMake.LIBRARY.id === 'echarts' && ChartMake.LIBRARY.version === '6.1.0',
        notes: JSON.stringify({ full, line, area, many: many.values.length, written, bad }),
      };
    },
  });

  cases.push({
    id: 'chart_make_option_bar_has_one_series_per_column_with_its_titles_and_stacks_or_lies_down_on_request',
    description: 'Barres : une série par colonne à tracer, l\'axe des étiquettes dans l\'ordre de la table (des mois ne sont pas triés), une légende quand il y a plusieurs séries, le titre de l\'axe des étiquettes (sa colonne) et, pour une seule série, celui de l\'axe des valeurs ; « empilées » met les séries sur la même pile ; « horizontales » croise les axes (les étiquettes en colonne, de haut en bas)',
    run: async () => {
      const two = optionOf('bar', [MONTHS, AMOUNT, COST]);
      const one = optionOf('bar', [MONTHS, AMOUNT], { values: ['Montant'] });
      const stacked = optionOf('bar', [MONTHS, AMOUNT, COST], { stack: true });
      const lying = optionOf('bar', [MONTHS, AMOUNT], { values: ['Montant'], horizontal: true });
      const y = one.graphic.find(item => item.rotation);
      return {
        pass: two.series.length === 2 && two.series.every(s => s.type === 'bar') && same(two.series.map(s => s.name), ['Montant', 'Cout']) && same(two.series[0].data, [300, 100, 200]) && same(two.xAxis.data, ['Mars', 'Janvier', 'Février'])
          && two.xAxis.type === 'category' && two.yAxis.type === 'value' && same(two.legend.data, ['Montant', 'Cout']) && same(titlesOf(two), ['Mois'])
          && !one.legend && same(titlesOf(one), ['Mois', 'Montant']) && !!y && Math.abs(y.rotation + Math.PI / 2) < 1e-9
          && two.series.every(s => !s.stack) && stacked.series.every(s => s.stack === 'total')
          && lying.xAxis.type === 'value' && lying.yAxis.type === 'category' && lying.yAxis.inverse === true && same(lying.yAxis.data, ['Mars', 'Janvier', 'Février']) && same(titlesOf(lying), ['Montant', 'Mois'])
          && two.backgroundColor === '#ffffff' && two.animation === false && two.color[0] === '#2b78ae',
        notes: JSON.stringify({ two: [two.series.length, titlesOf(two)], one: titlesOf(one), lying: [lying.xAxis.type, lying.yAxis.type, titlesOf(lying)] }),
      };
    },
  });

  cases.push({
    id: 'chart_make_option_line_and_area_follow_the_order_of_numbers_and_dates_but_not_of_text',
    description: 'Courbe et aire : des étiquettes de texte gardent l\'ordre de la table ; des nombres ou des dates sont rangés dans l\'ordre de l\'axe (une courbe ne revient pas en arrière) en emportant les valeurs de chaque série ; l\'aire est une courbe remplie qui commence au bord de l\'axe, empilable ; la courbe n\'est jamais remplie',
    run: async () => {
      const text = optionOf('line', [MONTHS, AMOUNT, COST]);
      const numbers = optionOf('line', [xs('Jour', [3, 1, 2], 'Numeric'), ys('A', [30, 10, 20]), ys('B', [33, 11, 22])]);
      const dates = optionOf('area', [xs('Date', ['2026-03-10', '2026-01-05', '2026-02-20'], 'Date'), ys('A', [3, 1, 2])], { kind: 'area', values: ['A'] });
      const area = optionOf('area', [MONTHS, AMOUNT, COST], { stack: true });
      return {
        pass: text.series.every(s => s.type === 'line' && !s.areaStyle) && same(text.xAxis.data, ['Mars', 'Janvier', 'Février']) && same(text.series[0].data, [300, 100, 200]) && text.xAxis.boundaryGap === true
          && same(numbers.xAxis.data, ['1', '2', '3']) && same(numbers.series[0].data, [10, 20, 30]) && same(numbers.series[1].data, [11, 22, 33])
          && same(dates.xAxis.data, ['2026-01-05', '2026-02-20', '2026-03-10']) && same(dates.series[0].data, [1, 2, 3])
          && area.series.every(s => s.type === 'line' && !!s.areaStyle && s.stack === 'total') && area.xAxis.boundaryGap === false && same(area.xAxis.data, ['Mars', 'Janvier', 'Février']),
        notes: JSON.stringify({ text: text.xAxis.data, numbers: [numbers.xAxis.data, numbers.series.map(s => s.data)], dates: dates.xAxis.data }),
      };
    },
  });

  cases.push({
    id: 'chart_make_option_scatter_pie_donut_and_radar_read_the_series_as_their_shape_needs',
    description: 'Nuage : l\'axe des étiquettes est l\'abscisse (nombres, dates ou catégories), un nuage par colonne, les points sans valeur laissés ; secteurs et anneau : les étiquettes de même nom ne font qu\'une part, sans colonne de valeurs chaque ligne compte pour un, une valeur nulle, négative ou absente n\'a pas de part, l\'anneau a un trou et les parts sont écrites en pourcentage dans la langue de l\'interface ; radar : une branche par étiquette, un polygone par colonne, tous sur la même échelle (le plus petit « beau » nombre qui n\'est pas inférieur au plus grand)',
    run: async () => {
      const numbers = optionOf('scatter', [xs('Heures', [1, 2, 3], 'Numeric'), ys('Note', [10, null, 14])], { values: ['Note'] });
      const categories = optionOf('scatter', [MONTHS, AMOUNT], { values: ['Montant'] });
      const dates = optionOf('scatter', [xs('Jour', ['2026-01-05', '2026-02-20'], 'Date'), ys('Note', [1, 2])], { values: ['Note'] });
      const sizes = optionOf('pie', [xs('Famille', ['Pain', 'Gâteau', 'Pain', 'Autre', 'Vide']), ys('Montant', [300, 100, 200, 0, -5])], { kind: 'pie', label: 'Famille', values: ['Montant'] });
      const counted = optionOf('pie', [xs('Statut', ['Payé', 'Payé', 'En attente', 'Payé', 'Refusé', 'En attente'])], { kind: 'pie', label: 'Statut', values: [] });
      const donut = optionOf('donut', [xs('Famille', ['Pain', 'Gâteau']), ys('Montant', [3, 1])], { kind: 'donut', label: 'Famille', values: ['Montant'] });
      const percent = sizes.series[0].label.formatter;
      const radar = optionOf('radar', [MONTHS, AMOUNT, COST]);
      return {
        pass: numbers.xAxis.type === 'value' && same(numbers.series[0].data, [[1, 10], [3, 14]]) && categories.xAxis.type === 'category' && same(categories.series[0].data[0], ['Mars', 300]) && dates.xAxis.type === 'time'
          && sizes.series[0].type === 'pie' && same(sizes.series[0].data, [{ name: 'Pain', value: 500 }, { name: 'Gâteau', value: 100 }]) && sizes.series[0].radius === '60%'
          && same(counted.series[0].data, [{ name: 'Payé', value: 3 }, { name: 'En attente', value: 2 }, { name: 'Refusé', value: 1 }]) && Array.isArray(donut.series[0].radius)
          && percent({ percent: 15.12 }) === '15 %' && percent({ percent: 5.26 }) === '5,3 %' && percent({ percent: 0 }) === '0 %'
          && radar.radar.indicator.length === 3 && same(radar.radar.indicator.map(i => i.name), ['Mars', 'Janvier', 'Février']) && radar.radar.indicator.every(i => i.max === 500 && i.min === 0)
          && radar.series[0].type === 'radar' && radar.series[0].data.length === 2 && same(radar.series[0].data[0].value, [300, 100, 200]) && radar.series[0].data[1].name === 'Cout',
        notes: JSON.stringify({ numbers: numbers.series[0].data, sizes: sizes.series[0].data, counted: counted.series[0].data, radar: radar.radar.indicator.map(i => i.max), percent: [percent({ percent: 15.12 }), percent({ percent: 5.26 })] }),
      };
    },
  });

  cases.push({
    id: 'chart_make_option_never_reads_a_cell_as_html_never_changes_the_series_and_refuses_an_unknown_shape',
    description: 'Le texte d\'une cellule ou d\'un nom de colonne s\'écrit tel quel (jamais du HTML, jamais un texte « riche » d\'ECharts) ; l\'option ne modifie pas les séries qu\'on lui donne ; une forme inconnue ou aucune série lève une erreur au lieu de tracer autre chose',
    run: async () => {
      const evil = '<img src=x onerror="window.__made_xss=1">';
      const series = [xs(evil, [evil, '{b|gras}', 'a\nb']), ys('<b>Montant</b>', [1, 2, 3])];
      const before = JSON.stringify(series);
      const option = optionOf('bar', series, { values: ['x'] });
      const after = JSON.stringify(series);
      let unknown = ''; let empty = '';
      try { ChartMake.option({ kind: 'treemap', table: 'T', label: 'L', values: [] }, [MONTHS], {}); } catch (e) { unknown = String(e.message); }
      try { ChartMake.option(def('bar'), [], {}); } catch (e) { empty = String(e.message); }
      const text = JSON.stringify(option);
      return {
        pass: before === after && option.xAxis.data[0] === evil && option.xAxis.data[1] === '{b|gras}' && titlesOf(option).indexOf(evil) !== -1 && !('rich' in (option.xAxis.axisLabel || {})) && !text.includes('"rich"') && !text.includes('"formatter"') && window.__made_xss === undefined
          && /non prise en charge/.test(unknown) && /Aucune série/.test(empty),
        notes: JSON.stringify({ unknown, empty, equal: before === after }),
      };
    },
  });

  cases.push({
    id: 'chart_make_image_is_a_png_of_the_requested_proportions_with_ink_for_every_shape',
    description: 'L\'image de chaque forme est un vrai PNG de 3 pixels par pixel de mise en page (480 x 300 : 1 440 x 900), sur fond blanc, avec de l\'encre ; les barres ont la première couleur de la palette ; un graphique de 300 x 180 fait 900 x 540 ; les dix formes se tracent sans erreur',
    run: async () => {
      const picture = async (kind, series, extra, size) => {
        const option = optionOf(kind, series, extra, size);
        const uri = await ChartMake.toImage(option, (size || { width: 480 }).width, (size || { height: 300 }).height);
        return Object.assign({ uri }, await pixelsOf(uri));
      };
      const results = {};
      const shapes = { bar: [MONTHS, AMOUNT, COST], line: [MONTHS, AMOUNT, COST], area: [MONTHS, AMOUNT, COST], scatter: [xs('Heures', [1, 2, 3], 'Numeric'), AMOUNT], pie: [MONTHS, AMOUNT], donut: [MONTHS, AMOUNT], radar: [MONTHS, AMOUNT, COST], funnel: [MONTHS, AMOUNT], waterfall: [MONTHS, AMOUNT], gauge: [MONTHS, AMOUNT] };
      let failure = '';
      for (const kind of ChartMake.KINDS) {
        try { const p = await picture(kind, shapes[kind], { values: ['Montant', 'Cout'] }); results[kind] = { w: p.width, h: p.height, ink: inkOf(p), png: p.uri.startsWith('data:image/png;base64,'), corner: [p.data[0], p.data[1], p.data[2], p.data[3]] }; }
        catch (e) { failure += kind + ': ' + e.message + ' '; }
      }
      const small = await picture('bar', [MONTHS, AMOUNT], { values: ['Montant'] }, { width: 300, height: 180 });
      const bars = await picture('bar', [MONTHS, AMOUNT], { values: ['Montant'] });
      return {
        pass: !failure && ChartMake.KINDS.every(kind => results[kind] && results[kind].w === 1440 && results[kind].h === 900 && results[kind].png && results[kind].ink > 3000 && same(results[kind].corner, [255, 255, 255, 255]))
          && small.width === 900 && small.height === 540 && nearOf(bars, BAR_BLUE, 14) > 2500 && ChartMake.SCALE === 3,
        notes: JSON.stringify({ failure, results, small: [small.width, small.height], blue: nearOf(bars, BAR_BLUE, 14) }),
      };
    },
  });

  // === 1 ter) Entonnoir, cascade et jauge (lot 6) ============================================================================================================
  const raw6 = (kind, extra) => Object.assign({ kind, table: SALES, label: 'Mois', values: ['Montant'] }, extra || {});
  const SET = ChartMake.PALETTES.standard;
  const rgbOf = hex => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  const picture6 = async (kind, series, extra, size) => {
    const frame = size || { width: 480, height: 300 };
    return pixelsOf(await ChartMake.toImage(optionOf(kind, series, extra, frame), frame.width, frame.height));
  };

  cases.push({
    id: 'chart_make_definition_of_funnel_waterfall_and_gauge_keeps_the_total_and_the_maximum_only_where_they_mean_something',
    description: 'Entonnoir, cascade et jauge : la définition garde « total » (une dernière marche) pour une cascade seulement et « maximum » pour une jauge seulement ; un maximum nul, négatif, absent, qui n\'est pas un nombre, plus grand que mille milliards ou égal au 100 d\'origine ne s\'écrit pas ; « empilé », « horizontal », les couleurs par série et les types de séries n\'ont aucun sens pour ces formes et ne se gardent pas ; l\'entonnoir se passe de colonne de valeurs (il compte les lignes de chaque étiquette), la cascade et la jauge non ; aucune de ces trois formes n\'a de série à colorer ; le texte écrit se relit à l\'identique ; le nom du cadre dit la forme',
    run: async () => {
      const own = { table: SALES, label: 'Mois' };
      const fall = ChartMake.normalize(raw6('waterfall', { total: true, stack: true, horizontal: true, colors: { Montant: '#112233' }, mix: { Montant: 'line' } }));
      const fallOff = ChartMake.normalize(raw6('waterfall', { total: false }));
      const barsWith = ChartMake.normalize(raw6('bar', { total: true, max: 500 }));
      const gauge = ChartMake.normalize(raw6('gauge', { max: 500, total: true }));
      const gaugeFull = ChartMake.normalize(raw6('gauge', { max: 100 }));
      const badMax = [0, -5, '500', NaN, Infinity, 1e13, null].map(max => ChartMake.normalize(raw6('gauge', { max })));
      const small = ChartMake.normalize(raw6('gauge', { max: 0.5 }));
      const funnel = ChartMake.normalize(raw6('funnel', { values: [], stack: true, total: true, max: 5, colors: { Montant: '#112233' } }));
      const written = ChartMake.stringify(gauge);
      const back = ChartMake.parse(written);
      return {
        pass: same(fall, { kind: 'waterfall', ...own, values: ['Montant'], total: true }) && same(fallOff, { kind: 'waterfall', ...own, values: ['Montant'] }) && same(barsWith, { kind: 'bar', ...own, values: ['Montant'] })
          && same(gauge, { kind: 'gauge', ...own, values: ['Montant'], max: 500 }) && same(gaugeFull, { kind: 'gauge', ...own, values: ['Montant'] }) && badMax.every(def => def && !('max' in def)) && small.max === 0.5
          && same(funnel, { kind: 'funnel', ...own, values: [] })
          && ChartMake.needsValues('waterfall') && ChartMake.needsValues('gauge') && !ChartMake.needsValues('funnel') && ['pie', 'donut', 'funnel', 'waterfall', 'gauge'].every(kind => !ChartMake.hasSeries(kind))
          && ['bar', 'line', 'area', 'scatter', 'radar'].every(kind => ChartMake.hasSeries(kind))
          && written === '{"v":1,"kind":"gauge","table":"GfVentes","label":"Mois","values":["Montant"],"max":500}' && same(back, gauge)
          && ChartMake.nameOf(fall) === 'Cascade · GfVentes' && ChartMake.nameOf(gauge) === 'Jauge · GfVentes' && ChartMake.nameOf(funnel) === 'Entonnoir · GfVentes' && ChartMake.GAUGE_FULL === 100 && ChartMake.MAX_GAUGES === 12,
        notes: JSON.stringify({ fall, fallOff, barsWith, gauge, gaugeFull, badMax: badMax.map(def => def && def.max), funnel, written }),
      };
    },
  });

  cases.push({
    id: 'chart_make_option_funnel_has_one_stage_per_label_in_table_order_as_wide_as_its_value_with_its_name_beside_it',
    description: 'Entonnoir : une étape par étiquette dans l\'ordre de la table (jamais triée : c\'est le parcours), deux lignes de même étiquette n\'en font qu\'une, une valeur nulle, négative ou absente n\'a pas d\'étape ; sans colonne de valeurs chaque ligne compte pour un ; la plus grande étape remplit la largeur et zéro n\'en a pas ; le nom est écrit à côté de l\'étape, avec sa valeur quand « Afficher les valeurs » est coché ; l\'entonnoir laisse la place du nom le plus long dans l\'image et un titre le fait descendre',
    run: async () => {
      const stages = xs('Étape', ['Visites', 'Devis', 'Visites', 'Commandes', 'Vide', 'Négatif', 'Absent']);
      const sizes = ys('Nombre', [1000, 300, 200, 120, 0, -4, null]);
      const mine = { kind: 'funnel', label: 'Étape', values: ['Nombre'] };
      const sized = optionOf('funnel', [stages, sizes], mine);
      const counted = optionOf('funnel', [xs('Statut', ['Nouveau', 'Gagné', 'Nouveau', 'Nouveau'])], { kind: 'funnel', label: 'Statut', values: [] });
      const shown = optionOf('funnel', [stages, sizes], Object.assign({ labels: true }, mine));
      const titled = optionOf('funnel', [stages, sizes], Object.assign({ title: 'Parcours' }, mine));
      const long = optionOf('funnel', [xs('Étape', ['Une étape au nom vraiment très très long à lire', 'Courte']), ys('Nombre', [100, 10])], mine);
      const s = sized.series[0];
      const wide = option => 480 - 12 - option.series[0].right;
      return {
        pass: s.type === 'funnel' && same(s.data, [{ name: 'Visites', value: 1200 }, { name: 'Devis', value: 300 }, { name: 'Commandes', value: 120 }]) && s.sort === 'none' && s.min === 0 && s.max === 1200
          && same(counted.series[0].data, [{ name: 'Nouveau', value: 3 }, { name: 'Gagné', value: 1 }]) && s.label.show && s.label.position === 'right' && s.label.formatter(s.data[0]) === 'Visites'
          && shown.series[0].label.formatter(s.data[0]) === 'Visites : ' + ChartMake.numberText(1200) && s.left === 12 && s.right >= 12 && wide(sized) >= 144 && wide(sized) <= 456
          && wide(long) < wide(sized) && long.series[0].label.overflow === 'truncate' && long.series[0].label.width <= 192 && titled.title && titled.series[0].top > s.top && !sized.legend
          && sized.backgroundColor === '#ffffff' && sized.color[0] === SET[0],
        notes: JSON.stringify({ data: s.data, counted: counted.series[0].data, box: [s.left, s.right, s.top, s.bottom], wide: [wide(sized), wide(long)], titledTop: titled.series[0].top }),
      };
    },
  });

  cases.push({
    id: 'chart_make_option_waterfall_walks_a_running_total_across_zero_with_hausse_baisse_and_total_steps',
    description: 'Cascade : chaque ligne ajoute sa valeur au cumul des précédentes, la marche va de l\'ancien cumul au nouveau (y compris de l\'autre côté de zéro, d\'un seul tenant) ; une valeur absente n\'est pas une marche ; avec « Afficher le total » une dernière marche « Total » va de zéro au cumul final ; hausses, baisses et total sont trois séries (la légende dit lesquelles existent) aux trois premières couleurs du jeu ; un trait relie chaque marche à la suivante, les valeurs affichées s\'écrivent avec leur signe, et la marche reste un seul rectangle même quand elle franchit zéro',
    run: async () => {
      const names = xs('Poste', ['Début', 'Ventes', 'Remises', 'Vide', 'Aides']);
      const deltas = ys('Variation', [100, -250, 80, null, 300]);
      const mine = { kind: 'waterfall', label: 'Poste', values: ['Variation'] };
      const full = optionOf('waterfall', [names, deltas], Object.assign({ total: true, labels: true }, mine));
      const open = optionOf('waterfall', [names, deltas], mine);
      const ups = optionOf('waterfall', [xs('Mois', ['A', 'B']), ys('V', [10, 5])], mine);
      const warm = optionOf('waterfall', [names, deltas], Object.assign({ palette: 'warm', total: true }, mine));
      const [up, down, total] = ['Hausse', 'Baisse', 'Total'].map(name => full.series.find(s => s.name === name));
      // Un faux repère (100 px par catégorie, un pixel par unité, vers le haut) pour dessiner une marche : la « Baisse » de 100 à -150 franchit zéro.
      const frame = item => ({ value: i => item[i], coord: point => [50 + point[0] * 100, 300 - point[1]], size: () => [100, 0], style: () => ({ fill: '#2b78ae' }) });
      const group = down.renderItem({}, frame(down.data[0]));
      const rect = group.children[0];
      const link = group.children.find(c => c.type === 'line');
      const label = group.children.find(c => c.type === 'text');
      const lastUp = up.renderItem({}, frame(up.data[2]));
      const totalGroup = total.renderItem({}, frame(total.data[0]));
      return {
        pass: same(full.xAxis.data, ['Début', 'Ventes', 'Remises', 'Aides', 'Total']) && same(full.series.map(s => s.name), ['Hausse', 'Baisse', 'Total']) && full.series.every(s => s.type === 'custom')
          && same(up.data, [[0, 0, 100, 100, 1], [2, -150, -70, 80, 1], [3, -70, 230, 300, 1]]) && same(down.data, [[1, 100, -150, -250, 1]]) && same(total.data, [[4, 0, 230, 230, 0]])
          && same(full.color, [SET[0], SET[1], SET[2]]) && same(full.legend.data, ['Hausse', 'Baisse', 'Total']) && up.itemStyle.color === SET[0] && down.itemStyle.color === SET[1] && total.itemStyle.color === SET[2]
          && same(open.xAxis.data, ['Début', 'Ventes', 'Remises', 'Aides']) && same(open.series.map(s => s.name), ['Hausse', 'Baisse']) && ups.series.length === 1 && !ups.legend && same(ups.series[0].data, [[0, 0, 10, 10, 1], [1, 10, 15, 5, 0]])
          && same(warm.color, [ChartMake.PALETTES.warm[0], ChartMake.PALETTES.warm[1], ChartMake.PALETTES.warm[2]])
          && rect.type === 'rect' && rect.shape.y === 200 && rect.shape.height === 250 && rect.shape.width === 48 && !!link && link.shape.y1 === 450 && link.shape.y2 === 450 && link.shape.x1 < link.shape.x2
          && !!label && label.style.text === '-250' && lastUp.children.find(c => c.type === 'text').style.text === '+300' && !totalGroup.children.some(c => c.type === 'line') && totalGroup.children.find(c => c.type === 'text').style.text === '230',
        notes: JSON.stringify({ cats: full.xAxis.data, up: up.data, down: down.data, total: total.data, rect: rect.shape, link: link && link.shape, label: label && label.style.text }),
      };
    },
  });

  cases.push({
    id: 'chart_make_option_gauge_draws_one_dial_per_row_up_to_twelve_on_a_scale_from_zero_to_the_maximum',
    description: 'Jauge : un cadran par ligne qui a une valeur (une ligne sans valeur n\'en a pas), douze au plus, de zéro au maximum réglé (100 sans réglage) ; la valeur est au centre, l\'étiquette dessous, chacun a une couleur du jeu dans l\'ordre ; les cadrans tiennent dans l\'image sans se toucher, d\'autant plus grands qu\'ils sont moins nombreux, sous le titre quand il y en a un ; « Afficher les valeurs » écrit les deux bouts de l\'échelle',
    run: async () => {
      const kpi = xs('Indicateur', ['Ventes', 'Marge', 'Vide', 'Qualité']);
      const kv = ys('Valeur', [72, 55, null, 130]);
      const mine = { kind: 'gauge', label: 'Indicateur', values: ['Valeur'] };
      const plain = optionOf('gauge', [kpi, kv], mine);
      const g200 = optionOf('gauge', [kpi, kv], Object.assign({ max: 200 }, mine));
      const marked = optionOf('gauge', [kpi, kv], Object.assign({ labels: true }, mine));
      const titled = optionOf('gauge', [kpi, kv], Object.assign({ title: 'Tableau de bord' }, mine));
      const many = optionOf('gauge', [xs('N', Array.from({ length: 15 }, (_, i) => 'L' + i)), ys('V', Array.from({ length: 15 }, (_, i) => i * 5))], mine);
      const solo = optionOf('gauge', [xs('N', ['A']), ys('V', [40])], mine);
      const inside = (option, top) => option.series.every(s => s.center[0] - s.radius >= 0 && s.center[0] + s.radius <= 480 && s.center[1] - s.radius >= top && s.center[1] + Math.round(s.radius * 0.72) + 10 <= 300);
      const apart = option => option.series.every((a, i) => option.series.every((b, j) => i === j || Math.hypot(a.center[0] - b.center[0], a.center[1] - b.center[1]) >= a.radius + b.radius - 1));
      return {
        pass: plain.series.length === 3 && plain.series.every(s => s.type === 'gauge' && s.min === 0 && s.max === 100) && same(plain.series.map(s => s.data[0]), [{ value: 72, name: 'Ventes' }, { value: 55, name: 'Marge' }, { value: 130, name: 'Qualité' }])
          && g200.series.every(s => s.max === 200) && same(plain.series.map(s => s.progress.itemStyle.color), [SET[0], SET[1], SET[2]]) && plain.series.every(s => s.title.show && !s.pointer.show && s.progress.show)
          && inside(plain, 0) && apart(plain) && inside(many, 0) && apart(many) && many.series.length === 12 && many.series[11].data[0].name === 'L11' && solo.series[0].radius > plain.series[0].radius && plain.series[0].radius > many.series[0].radius
          && inside(titled, 28) && titled.title.text === 'Tableau de bord' && plain.series.every(s => s.axisLabel.show === false) && marked.series.every(s => s.axisLabel.show === true && s.splitNumber === 1)
          && marked.series[0].axisLabel.formatter(100) === '100' && plain.series[0].detail.formatter(1234.5) === ChartMake.numberText(1234.5) && !plain.legend,
        notes: JSON.stringify({ radius: [solo.series[0].radius, plain.series[0].radius, many.series[0].radius], centers: plain.series.map(s => s.center), many: many.series.length }),
      };
    },
  });

  cases.push({
    id: 'chart_make_image_of_funnel_waterfall_and_gauge_takes_the_colors_of_the_set_in_order_and_writes_the_values',
    description: 'L\'image de l\'entonnoir, de la cascade et de la jauge est tracée avec les couleurs du jeu choisi, dans l\'ordre (étapes ; hausse, baisse et total ; cadrans) et pas avec celles d\'un autre jeu ; « Afficher les valeurs » ajoute du texte à la cascade ; une jauge de 1 440 x 900 et un graphique de 300 x 180 (900 x 540) se tracent aussi',
    run: async () => {
      const stages = xs('Étape', ['Visites', 'Devis', 'Commandes']);
      const counts = ys('Nombre', [1000, 600, 300]);
      const funnel = await picture6('funnel', [stages, counts], { kind: 'funnel', label: 'Étape', values: ['Nombre'] });
      const names = xs('Poste', ['Début', 'Ventes', 'Remises']);
      const steps = ys('Variation', [100, 40, -30]);
      const mine = { kind: 'waterfall', label: 'Poste', values: ['Variation'], total: true };
      const fall = await picture6('waterfall', [names, steps], mine);
      const shown = await picture6('waterfall', [names, steps], Object.assign({ labels: true }, mine));
      const kpi = xs('Indicateur', ['Ventes', 'Marge', 'Qualité']);
      const kv = ys('Valeur', [72, 55, 88]);
      const gauge = await picture6('gauge', [kpi, kv], { kind: 'gauge', label: 'Indicateur', values: ['Valeur'] });
      const warm = await picture6('gauge', [kpi, kv], { kind: 'gauge', label: 'Indicateur', values: ['Valeur'], palette: 'warm' });
      const small = await picture6('gauge', [kpi, kv], { kind: 'gauge', label: 'Indicateur', values: ['Valeur'] }, { width: 300, height: 180 });
      const dark = p => nearOf(p, hexRgb('#444444'), 40);
      const near = (p, hex) => nearOf(p, rgbOf(hex), 14);
      return {
        pass: [0, 1, 2].every(i => near(funnel, SET[i]) > 3000) && [0, 1, 2].every(i => near(fall, SET[i]) > 1500) && dark(shown) > dark(fall) + 100 && shown.width === 1440
          && [0, 1, 2].every(i => near(gauge, SET[i]) > 2000) && gauge.width === 1440 && gauge.height === 900 && near(warm, ChartMake.PALETTES.warm[0]) > 2000 && near(warm, SET[0]) < 60 && small.width === 900 && small.height === 540 && inkOf(small) > 3000,
        notes: JSON.stringify({ funnel: [0, 1, 2].map(i => near(funnel, SET[i])), fall: [0, 1, 2].map(i => near(fall, SET[i])), text: [dark(fall), dark(shown)], gauge: [0, 1, 2].map(i => near(gauge, SET[i])), warmBlue: near(warm, SET[0]) }),
      };
    },
  });

  // === 1 bis) L'aspect : le titre, les couleurs, les valeurs affichées, le type des séries (lot 2) ==========================================================================================
  // Une série qui porte l'identifiant de sa colonne (ChartSource.series le met) : sa couleur est celle de sa colonne, jamais celle de son rang.
  const withId = (series, colId) => Object.assign({}, series, { colId });
  const AMOUNT_ID = withId(AMOUNT, 'Montant');
  const COST_ID = withId(COST, 'Cout');
  const STANDARD = ChartMake.PALETTES.standard;
  const hexRgb = hex => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

  cases.push({
    id: 'chart_make_aspect_is_kept_cleaned_and_a_definition_written_before_it_reads_and_writes_back_the_same',
    description: 'L\'aspect gardé sur le nœud : le titre (une seule ligne, 120 caractères au plus, vide = aucun), le jeu de couleurs par son nom (« standard » et un nom inconnu ne s\'écrivent pas), la couleur de chaque série par l\'identifiant de sa colonne (#rrggbb seulement, rien pour une colonne qui n\'est pas tracée ni pour secteurs et anneau), les valeurs affichées et le type des séries d\'un graphique mixte (seulement ceux qui diffèrent de la forme, seulement pour barres, courbe et aire, jamais pour des barres horizontales) ; une définition écrite avant l\'aspect se relit et se réécrit à l\'identique, octet pour octet',
    run: async () => {
      const base = { kind: 'bar', table: SALES, label: 'Mois', values: ['Montant', 'Cout'] };
      const made = extra => ChartMake.normalize(Object.assign({}, base, extra));
      const titled = made({ title: '  Ventes \n par   mois\t' });
      const long = made({ title: 'é'.repeat(130) });
      const blank = made({ title: ' \n ' });
      const notText = made({ title: 42 });
      const palettes = ['blue', 'warm', 'cool', 'gray', 'standard', 'rose', 7, null].map(palette => made({ palette }).palette);
      const colors = made({ colors: { Montant: '#E8742C', Cout: 'red', Autre: '#00ff00' } }).colors;
      const noColors = [made({ colors: { Montant: 'red' } }), made({ colors: [] }), made({ kind: 'pie', colors: { Montant: '#112233' } })].map(d => d.colors);
      const labels = [true, 'true', 1, false].map(value => made({ labels: value }).labels);
      const mix = (kind, extra) => made(Object.assign({ kind }, extra)).mix;
      const mixes = {
        bar: mix('bar', { mix: { Montant: 'bar', Cout: 'line', Autre: 'line' } }), line: mix('line', { mix: { Cout: 'bar', Montant: 'line' } }), area: mix('area', { mix: { Cout: 'bar' } }),
        bad: mix('bar', { mix: { Cout: 'area', Montant: 'pie' } }), horizontal: mix('bar', { horizontal: true, mix: { Cout: 'line' } }),
        others: ['scatter', 'pie', 'donut', 'radar'].map(kind => mix(kind, { mix: { Cout: 'line' } })),
      };
      const full = made({ stack: true, title: 'Ventes', palette: 'warm', colors: { Cout: '#112233' }, labels: true, mix: { Cout: 'line' } });
      const back = ChartMake.parse(ChartMake.stringify(full));
      const old = '{"v":1,"kind":"bar","table":"GfVentes","label":"Mois","values":["Montant","Cout"],"stack":true}';
      const oldBack = ChartMake.stringify(ChartMake.parse(old));
      const plain = ChartMake.stringify(made({}));
      return {
        pass: titled.title === 'Ventes par mois' && Array.from(long.title).length === 120 && !('title' in blank) && !('title' in notText)
          && same(palettes, ['blue', 'warm', 'cool', 'gray', undefined, undefined, undefined, undefined])
          && same(colors, { Montant: '#e8742c' }) && noColors.every(c => c === undefined) && same(labels, [true, undefined, undefined, undefined])
          && same(mixes.bar, { Cout: 'line' }) && same(mixes.line, { Cout: 'bar' }) && same(mixes.area, { Cout: 'bar' }) && mixes.bad === undefined && mixes.horizontal === undefined && mixes.others.every(m => m === undefined)
          && same(back, full) && full.stack === true && oldBack === old && plain === '{"v":1,"kind":"bar","table":"GfVentes","label":"Mois","values":["Montant","Cout"]}'
          && ChartMake.nameOf(titled) === 'Ventes par mois' && ChartMake.nameOf(made({})) === 'Barres · GfVentes' && ChartMake.PALETTE_IDS[0] === 'standard' && ChartMake.PALETTE_IDS.length === 5,
        notes: JSON.stringify({ titled: titled.title, long: Array.from(long.title).length, palettes, colors, noColors, labels, mixes, full, oldBack }),
      };
    },
  });

  cases.push({
    id: 'chart_make_option_title_sits_on_top_values_show_and_each_series_keeps_the_color_of_its_column',
    description: 'Le titre est centré en haut de l\'image et tout descend d\'autant (légende, graphique, disque, radar) ; il s\'écrit tel quel (jamais du HTML) ; le jeu de couleurs donne leur couleur aux séries dans l\'ordre (et aux parts de secteurs) ; la couleur choisie d\'une colonne la suit : retirer ou réordonner les autres colonnes ne la change pas ; « valeurs affichées » écrit les nombres au-dessus des barres, des points et des courbes, au milieu des barres empilées (dans l\'encre qui se lit sur leur couleur), au bout des barres horizontales, avec la part des secteurs ; dans la langue de l\'interface ; rien tant que la personne ne le demande',
    run: async () => {
      const two = [MONTHS, AMOUNT_ID, COST_ID];
      const plain = optionOf('bar', two);
      const titled = optionOf('bar', two, { title: 'Ventes par mois' });
      const evil = optionOf('bar', two, { title: '<img src=x onerror="window.__made_title=1">{b|gras}' });
      const pieTitled = optionOf('pie', [MONTHS, AMOUNT_ID], { kind: 'pie', values: ['Montant'], title: 'Parts' });
      const pieBare = optionOf('pie', [MONTHS, AMOUNT_ID], { kind: 'pie', values: ['Montant'] });
      const radarTitled = optionOf('radar', two, { title: 'Profil' });
      const radarBare = optionOf('radar', two);
      const blue = optionOf('bar', two, { palette: 'blue' });
      const pieWarm = optionOf('pie', [MONTHS, AMOUNT_ID], { kind: 'pie', values: ['Montant'], palette: 'warm' });
      const own = optionOf('bar', two, { colors: { Cout: '#112233' } });
      const swapped = optionOf('bar', [MONTHS, COST_ID, AMOUNT_ID], { values: ['Cout', 'Montant'], colors: { Cout: '#112233' } });
      const alone = optionOf('bar', [MONTHS, COST_ID], { values: ['Cout'], colors: { Cout: '#112233' } });
      const noId = optionOf('bar', [MONTHS, AMOUNT, COST]);
      const shown = optionOf('bar', two, { labels: true });
      const stacked = optionOf('bar', two, { labels: true, stack: true });
      const lying = optionOf('bar', [MONTHS, AMOUNT_ID], { values: ['Montant'], labels: true, horizontal: true });
      const lyingBare = optionOf('bar', [MONTHS, AMOUNT_ID], { values: ['Montant'], horizontal: true });
      const lines = optionOf('line', two, { labels: true });
      const cloud = optionOf('scatter', [xs('Heures', [1, 2, 3], 'Numeric'), AMOUNT_ID], { values: ['Montant'], labels: true });
      const pie = optionOf('pie', [xs('Famille', ['Pain', 'Gâteau']), ys('Montant', [500, 100])], { kind: 'pie', label: 'Famille', values: ['Montant'], labels: true });
      const donutBare = optionOf('donut', [xs('Famille', ['Pain', 'Gâteau']), ys('Montant', [500, 100])], { kind: 'donut', label: 'Famille', values: ['Montant'] });
      const radar = optionOf('radar', two, { labels: true });
      const thousands = shown.series[0].label.formatter({ value: 1234.5 });
      return {
        pass: plain.title === undefined && titled.title.text === 'Ventes par mois' && titled.title.left === 'center' && titled.title.textStyle.overflow === 'truncate' && titled.title.textStyle.fontWeight === 'bold'
          && titled.legend.top > plain.legend.top && titled.grid.top > plain.grid.top && titled.grid.top - plain.grid.top === titled.legend.top - plain.legend.top
          && evil.title.text === '<img src=x onerror="window.__made_title=1">{b|gras}' && !('rich' in evil.title.textStyle) && window.__made_title === undefined
          && pieTitled.title.text === 'Parts' && Number.parseFloat(pieTitled.series[0].radius) < Number.parseFloat(pieBare.series[0].radius) && pieBare.title === undefined
          && radarTitled.title.text === 'Profil' && Number.parseFloat(radarTitled.radar.center[1]) > Number.parseFloat(radarBare.radar.center[1])
          && same(plain.color, [STANDARD[0], STANDARD[1]]) && same(blue.color, [ChartMake.PALETTES.blue[0], ChartMake.PALETTES.blue[1]]) && same(pieWarm.color, ChartMake.PALETTES.warm) && same(pieBare.color, STANDARD)
          && same(own.color, [STANDARD[0], '#112233']) && same(swapped.color, ['#112233', STANDARD[1]]) && same(alone.color, ['#112233']) && same(noId.color, [STANDARD[0], STANDARD[1]])
          && plain.series.every(s => !s.label) && plain.series.every(s => !s.labelLayout)
          && shown.series.every(s => s.label.show === true && s.label.position === 'top' && s.labelLayout.hideOverlap === true) && shown.grid.top === plain.grid.top + 10
          && stacked.series.every((s, i) => s.label.position === 'inside' && s.label.color === ColorMath.inkOn(stacked.color[i])) && lying.series[0].label.position === 'right' && lying.grid.right === lyingBare.grid.right + 28 && lines.series.every(s => s.label.position === 'top')
          && cloud.series[0].label.formatter({ value: [2, 1234.5] }) === thousands && pie.series[0].label.formatter({ value: 500, percent: 83.33 }) === '500 (83\u00a0%)' && donutBare.series[0].label.formatter({ percent: 16.67 }) === '17\u00a0%'
          && radar.series[0].label.show === true && radar.series[0].label.formatter({ value: 300 }) === '300'
          && thousands === '1\u00a0234,5',
        notes: JSON.stringify({ title: titled.title, tops: [plain.legend.top, titled.legend.top, plain.grid.top, titled.grid.top], colors: [plain.color, blue.color, own.color, swapped.color, alone.color], pie: [pieBare.series[0].radius, pieTitled.series[0].radius], labels: [stacked.series.map(s => s.label.position), lying.series[0].label.position], thousands, pieLabel: pie.series[0].label.formatter({ value: 500, percent: 83.33 }) }),
      };
    },
  });

  cases.push({
    id: 'chart_make_option_mixes_bars_and_lines_on_the_same_axes_and_stacks_each_kind_apart',
    description: 'Un graphique mixte : des barres avec une courbe, une courbe avec des barres, une aire avec des barres, sur les mêmes axes et dans l\'ordre des séries (la légende ne change pas) ; la barre garde sa largeur, la courbe ses points ; sur une aire, seule la courbe est remplie ; avec des barres l\'axe des étiquettes laisse une marge au bord ; « empilées » empile les barres entre elles et les courbes entre elles, jamais une courbe sur des barres ; des barres horizontales ne se mêlent pas à une courbe (le réglage est ignoré)',
    run: async () => {
      const two = [MONTHS, AMOUNT_ID, COST_ID];
      const types = option => option.series.map(s => s.type);
      const barsLine = optionOf('bar', two, { mix: { Cout: 'line' } });
      const stackedBarsLine = optionOf('bar', two, { stack: true, mix: { Cout: 'line' } });
      const lineBars = optionOf('line', two, { mix: { Cout: 'bar' } });
      const areaBars = optionOf('area', two, { stack: true, mix: { Cout: 'bar' } });
      const areaOnly = optionOf('area', two, { stack: true });
      const lying = optionOf('bar', two, { horizontal: true, mix: { Cout: 'line' } });
      const reversed = optionOf('bar', [MONTHS, COST_ID, AMOUNT_ID], { values: ['Cout', 'Montant'], mix: { Cout: 'line' } });
      return {
        pass: same(types(barsLine), ['bar', 'line']) && same(barsLine.series.map(s => s.name), ['Montant', 'Cout']) && same(barsLine.legend.data, ['Montant', 'Cout']) && barsLine.series[0].barMaxWidth === 48 && barsLine.series[1].symbol === 'circle' && barsLine.series[1].lineStyle.width === 2
          && barsLine.xAxis.boundaryGap === true && same(barsLine.xAxis.data, ['Mars', 'Janvier', 'Février']) && same(barsLine.series[1].data, [120, 60, 90])
          && same(stackedBarsLine.series.map(s => s.stack), ['total', undefined])
          && same(types(lineBars), ['line', 'bar']) && lineBars.series.every(s => !s.areaStyle) && lineBars.xAxis.boundaryGap === true
          && same(types(areaBars), ['line', 'bar']) && !!areaBars.series[0].areaStyle && !areaBars.series[1].areaStyle && same(areaBars.series.map(s => s.stack), ['total', 'bars']) && areaBars.xAxis.boundaryGap === true
          && areaOnly.xAxis.boundaryGap === false && areaOnly.series.every(s => s.type === 'line' && !!s.areaStyle && s.stack === 'total')
          && same(types(lying), ['bar', 'bar']) && lying.xAxis.type === 'value' && same(types(reversed), ['line', 'bar']) && same(reversed.series.map(s => s.name), ['Cout', 'Montant']),
        notes: JSON.stringify({ barsLine: types(barsLine), stacked: stackedBarsLine.series.map(s => s.stack), lineBars: types(lineBars), areaBars: [types(areaBars), areaBars.series.map(s => s.stack)], lying: types(lying), reversed: types(reversed) }),
      };
    },
  });

  cases.push({
    id: 'chart_make_image_shows_the_title_the_color_chosen_the_palette_the_values_and_a_line_among_bars',
    description: 'L\'image réellement tracée change avec l\'aspect : le titre met de l\'encre en haut de l\'image (où rien ne s\'écrit sans lui) ; la couleur choisie d\'une colonne remplace celle du jeu (plus de bleu, de l\'orange) ; un autre jeu de couleurs donne d\'autres couleurs (rouge brique pour « Chaudes ») ; les valeurs affichées ajoutent du texte gris foncé ; une courbe mêlée aux barres laisse les barres bleues et ajoute la couleur de la courbe ; une image sans aspect reste celle du lot 1 (le bleu, aucun titre)',
    run: async () => {
      const picture = async (extra, series) => {
        const option = ChartMake.option(def('bar', Object.assign({ values: ['Montant'] }, extra)), series || [MONTHS, AMOUNT_ID], { width: 480, height: 300 });
        const uri = await ChartMake.toImage(option, 480, 300);
        return Object.assign({ uri }, await pixelsOf(uri));
      };
      const topInk = (p) => { let n = 0; for (let y = 0; y < 50; y += 1) for (let x = 300; x < 1140; x += 1) { const i = (y * p.width + x) * 4; if (p.data[i + 3] > 0 && (p.data[i] < 200 || p.data[i + 1] < 200 || p.data[i + 2] < 200)) n += 1; } return n; };
      const plain = await picture({});
      const titled = await picture({ title: 'Ventes par mois' });
      const orange = await picture({ colors: { Montant: '#e8742c' } });
      const warm = await picture({ palette: 'warm' });
      const shown = await picture({ labels: true });
      const mixed = await picture({ values: ['Montant', 'Cout'], mix: { Cout: 'line' } }, [MONTHS, AMOUNT_ID, COST_ID]);
      const bars = await picture({ values: ['Montant', 'Cout'] }, [MONTHS, AMOUNT_ID, COST_ID]);
      const darkOf = p => nearOf(p, hexRgb('#444444'), 40);
      const ORANGE = hexRgb('#e8742c');
      const BRICK = hexRgb('#a32a1f');
      const LINE = hexRgb(STANDARD[1]);
      return {
        pass: topInk(plain) === 0 && topInk(titled) > 500 && nearOf(plain, BAR_BLUE, 14) > 2500 && nearOf(orange, ORANGE, 14) > 2500 && nearOf(orange, BAR_BLUE, 14) < 60
          && nearOf(warm, BRICK, 14) > 2500 && nearOf(warm, BAR_BLUE, 14) < 60 && darkOf(shown) > darkOf(plain) + 100 && shown.uri !== plain.uri
          && nearOf(mixed, BAR_BLUE, 14) > 1500 && nearOf(mixed, LINE, 14) > 300 && mixed.uri !== bars.uri && nearOf(bars, LINE, 14) > 2500 && nearOf(plain, ORANGE, 14) < 60,
        notes: JSON.stringify({ topInk: [topInk(plain), topInk(titled)], blue: [nearOf(plain, BAR_BLUE, 14), nearOf(orange, BAR_BLUE, 14), nearOf(warm, BAR_BLUE, 14)], orange: nearOf(orange, ORANGE, 14), brick: nearOf(warm, BRICK, 14), dark: [darkOf(plain), darkOf(shown)], mixed: [nearOf(mixed, BAR_BLUE, 14), nearOf(mixed, LINE, 14), nearOf(bars, LINE, 14)] }),
      };
    },
  });

  // === 2) Les lignes =========================================================================================================================================
  cases.push({
    id: 'chart_make_source_reads_the_columns_by_identifier_in_table_order_and_the_linked_rows_follow_the_link_rule',
    description: 'ChartSource.made rend la section que Grist aurait écrite (colonnes par identifiant, sans filtre ni tri) : « toute la table » donne les cinq ventes dans l\'ordre de la table, « liées » celles du client affiché par la règle de liaison (les deux de l\'un, la seule d\'un autre, aucune d\'un client sans vente) ; les séries ont les libellés des colonnes ; une table ou une colonne disparue donne rien',
    run: async (h) => {
      await seed(h);
      const made = await ChartSource.made(def('bar'));
      const gone = [await ChartSource.made(def('bar', { table: 'Nulle part' })), await ChartSource.made(def('bar', { values: ['Montant', 'Disparue'] })), await ChartSource.made(def('bar', { label: 'Disparue' }))];
      const rowsOf = async (scope, record) => GristAPI.withReadPass(async () => (await ChartSource.rows(made, scope, PAGE_TABLE, record)));
      const all = await rowsOf('all', recordOf(1));
      const one = await rowsOf('linked', recordOf(1));
      const two = await rowsOf('linked', recordOf(3));
      const none = await rowsOf('linked', NO_SALE);
      const series = await GristAPI.withReadPass(() => ChartSource.series(made, all));
      return {
        pass: !!made && made.type === 'bar' && made.fields.length === 3 && made.table === SALES && gone.every(r => r === null)
          && same(all.map(r => r.id), [1, 2, 3, 4, 5]) && same(one.map(r => r.id), [1, 2]) && same(two.map(r => r.id), [5]) && none.length === 0
          && series.length === 3 && same(series.map(s => s.label), ['Mois', 'Montant', 'Cout']) && same(series[0].values, ['Mars', 'Janvier', 'Février', 'Avril', 'Mai']) && same(series[1].values, [300, 100, 200, 50, 75]) && same(series[2].values, [120, 60, 90, 20, 30]),
        notes: JSON.stringify({ all: all.map(r => r.id), one: one.map(r => r.id), two: two.map(r => r.id), none: none.length, series: series.map(s => [s.label, s.values]) }),
      };
    },
  });

  cases.push({
    id: 'chart_make_source_series_carry_the_identifier_of_their_column_so_a_color_follows_its_column',
    description: 'Les séries que ChartSource rend portent l\'identifiant de leur colonne (la couleur et le type d\'une série s\'y accrochent) ; une colonne qui n\'est plus un nombre n\'est pas tracée et ne passe pas sa couleur à sa voisine : la couleur choisie d\'une colonne reste sur elle, celle du jeu suit le rang de la colonne dans la définition',
    run: async (h) => {
      await seed(h);
      const definition = def('bar', { label: 'Client', values: ['Montant', 'Note', 'Cout'], colors: { Cout: '#112233' } });
      const made = await ChartSource.made(definition);
      const rows = await GristAPI.withReadPass(() => ChartSource.rows(made, 'all', PAGE_TABLE, recordOf(1)));
      const series = await GristAPI.withReadPass(() => ChartSource.series(made, rows));
      const option = ChartMake.option(definition, series, { width: 480, height: 300 });
      const uncolored = ChartMake.option(def('bar', { label: 'Client', values: ['Montant', 'Note', 'Cout'] }), series, { width: 480, height: 300 });
      return {
        pass: same(series.map(s => s.colId), ['Client', 'Montant', 'Cout']) && same(series.map(s => s.label), ['Client', 'Montant', 'Cout']) && same(option.color, [STANDARD[0], '#112233']) && same(uncolored.color, [STANDARD[0], STANDARD[2]]),
        notes: JSON.stringify({ series: series.map(s => [s.colId, s.label]), colors: option.color, uncolored: uncolored.color }),
      };
    },
  });

  cases.push({
    id: 'chart_make_draw_returns_the_png_of_the_row_says_why_when_a_table_or_a_column_is_gone_and_has_no_image_for_a_row_without_rows',
    description: 'ChartBlock.drawMade rend le PNG (480 x 300 : 1 440 x 900) de la ligne affichée, la même image pour toute la table, rien (`empty`) pour un client sans vente ; une table ou une colonne qui n\'existe plus lève l\'erreur « chart » (pour que le cadre et la Lecture le disent) ; une définition illisible aussi ; secteurs sans colonne de valeurs compte les familles',
    run: async (h) => {
      await seed(h);
      const draw = (definition, scope, record) => GristAPI.withReadPass(() => ChartBlock.drawMade(definition, scope, PAGE_TABLE, record, 480, 300));
      const one = await draw(def('bar'), 'linked', recordOf(1));
      const two = await draw(def('bar'), 'linked', recordOf(2));
      const allOne = await draw(def('bar'), 'all', recordOf(1));
      const allTwo = await draw(def('bar'), 'all', recordOf(2));
      const none = await draw(def('bar'), 'linked', NO_SALE);
      const picture = await pixelsOf(one.uri);
      const pie = await draw(def('pie', { label: 'Famille', values: [] }), 'all', recordOf(1));
      const errors = {};
      for (const [name, definition] of [['table', def('bar', { table: 'Nulle part' })], ['column', def('bar', { values: ['Disparue'] })], ['null', null]]) {
        try { await draw(definition, 'all', recordOf(1)); errors[name] = 'aucune'; } catch (e) { errors[name] = e.kind; }
      }
      return {
        pass: one.uri.startsWith('data:image/png;base64,') && picture.width === 1440 && picture.height === 900 && inkOf(picture) > 3000 && one.uri !== two.uri && allOne.uri === allTwo.uri && allOne.uri !== one.uri
          && none.empty === true && !none.uri && !!pie.uri && same(errors, { table: 'chart', column: 'chart', null: 'chart' }),
        notes: JSON.stringify({ picture: [picture.width, picture.height], differs: one.uri !== two.uri, allSame: allOne.uri === allTwo.uri, none, errors }),
      };
    },
  });

  cases.push({
    id: 'chart_make_draw_keeps_the_picture_of_the_same_definition_values_and_size_and_draws_again_as_soon_as_one_of_them_changes',
    description: 'ChartBlock.drawMade garde le dessin tant que la définition, les valeurs tracées, la taille et la langue de l\'interface sont les mêmes (l\'éditeur, la Lecture, le diaporama, le retour en édition et les exports le redemandent : ECharts et le PNG à 3 pixels par pixel coûtent plus de 100 ms par graphique) : un second appel identique rend la même image sans repasser par ECharts, avec sa propre copie de la réponse ; une autre ligne, une autre taille, une autre forme, une autre langue, une valeur de la table qui change redessinent (les données d\'aujourd\'hui sont toujours relues), et revenir aux premières valeurs retrouve le premier dessin ; un dessin raté n\'est pas gardé',
    run: async (h) => {
      await seed(h);
      ChartBlock.forgetDrawings();   // les essais d'avant ont pu dessiner la même chose : on repart d'une mémoire vide
      const real = ChartMake.toImage;
      let calls = 0;
      let fail = false;
      ChartMake.toImage = function (...args) { calls += 1; if (fail) return Promise.reject(new Error('dessin raté')); return real.apply(this, args); };
      const sales = window.__chartFixture.sales;
      try {
        const draw = (definition, scope, record, width, height) => GristAPI.withReadPass(() => ChartBlock.drawMade(definition, scope, PAGE_TABLE, record, width || 480, height || 300));
        const first = await draw(def('bar'), 'linked', recordOf(1));
        const afterFirst = calls;
        const again = await draw(def('bar'), 'linked', recordOf(1));
        const afterAgain = calls;
        again.uri = 'modifiée par celui qui l\'a reçue';
        const third = await draw(def('bar'), 'linked', recordOf(1));
        const afterThird = calls;
        // La langue de l'interface écrit les nombres et les noms des marches : une autre langue est un autre dessin, et le retour à la première retrouve le sien.
        const lang = I18n.getLang();
        I18n.setLang(lang === 'en' ? 'fr' : 'en');
        try { await draw(def('bar'), 'linked', recordOf(1)); } finally { I18n.setLang(lang); }
        const afterLang = calls;
        const backInLang = await draw(def('bar'), 'linked', recordOf(1));
        const afterBack = calls;
        const otherRow = await draw(def('bar'), 'linked', recordOf(2));
        const afterRow = calls;
        const wider = await draw(def('bar'), 'linked', recordOf(1), 600, 300);
        const afterSize = calls;
        const otherKind = await draw(def('line'), 'linked', recordOf(1));
        const afterKind = calls;
        window.__gristStub.setRows(SALES, sales.map(r => (r.id === 1 ? Object.assign({}, r, { Montant: 480 }) : r)));
        const edited = await draw(def('bar'), 'linked', recordOf(1));
        const afterEdit = calls;
        window.__gristStub.setRows(SALES, sales);
        const restored = await draw(def('bar'), 'linked', recordOf(1));
        const afterRestore = calls;
        fail = true;
        let failed = '';
        try { await draw(def('bar'), 'linked', recordOf(3)); } catch (e) { failed = e.message; }
        fail = false;
        const retried = await draw(def('bar'), 'linked', recordOf(3));
        return {
          pass: first.uri.startsWith('data:image/png;base64,') && afterFirst === 1 && afterAgain === 1 && again !== first && third.uri === first.uri && afterThird === 1 && afterLang === 2 && afterBack === 2 && backInLang.uri === first.uri && JSON.stringify(third.office) === JSON.stringify(first.office) && !!first.office
            && otherRow.uri !== first.uri && afterRow === 3 && wider.uri !== first.uri && afterSize === 4 && otherKind.uri !== first.uri && afterKind === 5
            && edited.uri !== first.uri && afterEdit === 6 && restored.uri === first.uri && afterRestore === 6
            && failed === 'dessin raté' && !!retried.uri && calls === 8,
          notes: JSON.stringify({ calls: [afterFirst, afterAgain, afterThird, afterLang, afterBack, afterRow, afterSize, afterKind, afterEdit, afterRestore, calls], failed }),
        };
      } finally {
        ChartMake.toImage = real;
        window.__gristStub.setRows(SALES, sales);
      }
    },
  });

  cases.push({
    id: 'chart_make_draw_keeps_at_most_64_pictures_and_a_bounded_weight_and_the_last_asked_always_stays',
    description: 'ChartBlock.drawMade ne garde pas tout : au plus 64 dessins (le plus ancien s\'en va le premier ; un dessin redemandé repasse en dernier), et pas plus de ~40 millions de caractères d\'adresses `data:` (deux dessins de 25 millions : le plus ancien s\'en va, le dernier demandé reste toujours)',
    run: async (h) => {
      await seed(h);
      ChartBlock.forgetDrawings();   // les essais d'avant ont pu remplir la mémoire : on repart d'une mémoire vide
      const real = ChartMake.toImage;
      let calls = 0;
      let huge = false;
      ChartMake.toImage = function (...args) {
        calls += 1;
        // Un faux dessin (l'adresse change à chaque appel) : ce qui se compte ici est ce que le cache garde, pas ECharts.
        return Promise.resolve('data:image/png;base64,' + 'A'.repeat(huge ? 25000000 : 100) + calls);
      };
      try {
        const draw = (width) => GristAPI.withReadPass(() => ChartBlock.drawMade(def('bar'), 'linked', PAGE_TABLE, recordOf(1), width, 300));
        for (let w = 200; w < 266; w++) await draw(w);          // 66 tailles : 66 dessins
        const afterFill = calls;
        await draw(265);                                         // le dernier : gardé
        const afterLast = calls;
        await draw(200);                                         // le premier : parti (66 > 64), refait
        const afterFirst = calls;
        await draw(201);                                         // le deuxième : parti aussi quand le premier est revenu
        const afterSecond = calls;
        await draw(264);                                         // l'avant-dernier : toujours là
        const afterNear = calls;
        huge = true;
        await draw(900);                                         // 25 millions de caractères : les petits partent d'abord, celui-ci reste
        await draw(901);                                         // un second : 50 millions en tout, le plus ancien (900) part
        const afterHuge = calls;
        await draw(901);                                         // le dernier demandé : toujours là
        const afterKept = calls;
        await draw(900);                                         // le plus ancien : refait
        const afterOld = calls;
        return {
          pass: afterFill === 66 && afterLast === 66 && afterFirst === 67 && afterSecond === 68 && afterNear === 68 && afterHuge === 70 && afterKept === 70 && afterOld === 71,
          notes: JSON.stringify({ calls: [afterFill, afterLast, afterFirst, afterSecond, afterNear, afterHuge, afterKept, afterOld] }),
        };
      } finally {
        ChartMake.toImage = real;
      }
    },
  });

  // === 3) L'éditeur ==========================================================================================================================================
  const modal = () => document.getElementById('pp-chartmake-modal');
  const modalOpen = () => { const m = modal(); return !!m && m.style.display !== 'none'; };
  const okButton = () => document.querySelector('#pp-chartmake-modal .var-modal-primary');
  const cancelButton = () => document.querySelector('#pp-chartmake-modal .var-modal-actions button:not(.var-modal-primary)');
  const kindInput = kind => document.querySelector('#pp-chartmake-modal input[name="pp-chartmake-kind"][value="' + kind + '"]');
  const rowsInput = value => document.querySelector('#pp-chartmake-modal input[name="pp-chartmake-rows"][value="' + value + '"]');
  const optionInput = name => document.querySelector('#pp-chartmake-modal input[name="pp-chartmake-' + name + '"]');
  const valueInputs = () => Array.from(document.querySelectorAll('#pp-chartmake-modal .pp-chartmake-value input'));
  const tableSelect = () => document.getElementById('pp-chartmake-table');
  const labelSelect = () => document.getElementById('pp-chartmake-label');
  const paper = () => document.querySelector('#pp-chartmake-modal .pp-chart-paper');
  const paperState = () => (paper() || {}).dataset && paper().dataset.state;
  const previewImage = () => document.querySelector('#pp-chartmake-modal .pp-chart-image');
  const text = sel => (document.querySelector(sel) || {}).textContent;
  const row = () => document.getElementById('v2-btn-chart-make');
  const pageRow = () => document.getElementById('v2-btn-chart');
  const isLocked = id => document.getElementById(id).classList.contains('v2-hf-locked');
  const visible = el => !!el && !el.hidden && el.getClientRects().length > 0;

  const change = async (el, setup) => { setup(el); el.dispatchEvent(new Event('change', { bubbles: true })); await sleep(80); };
  const pickTable = name => change(tableSelect(), (el) => { el.value = name; });
  const pickLabel = name => change(labelSelect(), (el) => { el.value = name; });
  const pickKind = kind => change(kindInput(kind), (el) => { el.checked = true; });
  const pickRows = value => change(rowsInput(value), (el) => { el.checked = true; });
  const tick = (name, on) => change(valueInputs().find(i => i.value === name), (el) => { el.checked = on; });
  // L'aperçu se redessine après une courte pause (120 ms) : on la laisse passer avant d'attendre la fin du dessin.
  async function settle() { await sleep(220); await waitFor(() => paperState() !== 'loading', 25000); await sleep(40); }
  async function openWindow() {
    row().click();
    await waitFor(() => modalOpen() && !!tableSelect() && tableSelect().options.length > 1, 6000);
    await sleep(60);
    await settle();
  }
  async function closeWindowIfOpen() { if (modalOpen()) cancelButton().click(); await sleep(60); }
  async function confirm() { okButton().click(); await waitFor(() => !modalOpen(), 6000); await sleep(160); }
  async function setDoc(h, html) { await h.resetEditor(); Editor.setHTML(html); await sleep(150); }
  async function placeCursorAtEnd() { EditorCore.getEditor().commands.focus('end'); await sleep(100); }
  // Le HTML d'un graphique créé tel que l'éditeur l'écrit : jamais d'image, sa définition, sa taille.
  const madeHtml = (definition, scope, name, style) => '<img class="editor-image" alt="Graphique" style="' + (style || 'width: 480px; height: 300px') + '" data-layer="normal" data-wrap="inline" data-chart-spec="'
    + ChartMake.stringify(definition).replace(/"/g, '&quot;') + '" data-chart-scope="' + (scope || 'linked') + '" data-chart-name="' + (name || ChartMake.nameOf(definition)) + '">';
  const madeNodes = () => Array.from(parse(Editor.getHTML()).querySelectorAll('img[data-chart-spec]'));
  function madePos() {
    let found = null;
    EditorCore.getEditor().state.doc.descendants((node, pos) => { if (node.type.name === 'editorImage' && node.attrs.chartSpec && found === null) found = pos; });
    return found;
  }
  const madeAttrs = () => { const pos = madePos(); return pos === null ? null : EditorCore.getEditor().state.doc.nodeAt(pos).attrs; };
  async function selectMade() { EditorCore.getEditor().commands.setNodeSelection(madePos()); await sleep(160); }
  const frameView = () => tiptap().querySelector('.editor-image-view.editor-image-chart-placeholder');
  const frameImg = () => { const view = frameView(); return view ? view.querySelector('img.editor-image') : null; };
  const drawnSrc = () => { const view = frameView(); const img = frameImg(); return view && img && view.classList.contains('editor-image-chart-drawn') ? (img.getAttribute('src') || '') : ''; };

  cases.push({
    id: 'chart_make_row_is_in_the_image_menu_with_its_icon_and_the_blocks_menu_keeps_its_nine_rows',
    description: 'La ligne « Créer un graphique… » est dans le menu de l\'Image (« Ajouter une image »), sous « Image depuis une variable… », avec une icône ; c\'est un vrai bouton, active avec l\'extension, et elle ouvre la fenêtre ; le menu « Lien et blocs de contenu » garde ses neuf lignes (il n\'en tient pas une de plus dans un panneau de 400 px) et la ligne « Graphique de la page… » reste la sienne ; aucune nouvelle icône dans la barre',
    run: async (h) => {
      await seed(h);
      await setDoc(h, '<p>Texte</p>');
      MainToolbar.syncToolbarState();
      const flyout = document.getElementById('v2-image-flyout');
      const rows = Array.from(flyout.children).map(c => c.id || c.className);
      const icon = row().querySelector('.v2-menu-row-icon svg');
      const blocks = Array.from(document.querySelectorAll('#v2-blocks-flyout .v2-menu-row')).map(b => b.id);
      const buttons = document.querySelectorAll('#v2-toolbar > button, #v2-toolbar button').length;
      const first = { label: row().textContent.trim(), aria: row().getAttribute('aria-label'), tag: row().tagName, greyed: row().classList.contains('v2-hover-row-disabled'), disabled: row().getAttribute('aria-disabled') };
      await openWindow();
      const opened = modalOpen();
      const title = text('#pp-chartmake-title');
      await closeWindowIfOpen();
      return {
        pass: first.label === 'Créer un graphique…' && first.aria === 'Créer un graphique' && first.tag === 'BUTTON' && !first.greyed && first.disabled === 'false' && flyout.contains(row()) && !document.getElementById('v2-blocks-flyout').contains(row())
          && same(rows.slice(1), ['v2-btn-image-from-variable', 'v2-btn-chart-make']) && !!icon && icon.querySelectorAll('path').length > 0
          && blocks.length === 9 && blocks.indexOf('v2-btn-chart') === 7 && blocks[8] === 'v2-btn-slide-text' && !blocks.includes('v2-btn-chart-make') && opened && title === 'Créer un graphique' && buttons > 0,
        notes: JSON.stringify({ first, rows, blocks, opened, title }),
      };
    },
  });

  cases.push({
    id: 'chart_make_row_is_greyed_in_header_email_and_macro_modes_never_removed_and_stays_active_in_a_grid',
    description: 'En-tête/pied et e-mail : la ligne se grise (jamais retirée) comme « Graphique de la page… » (une image que la Lecture ne résout pas dans une zone ; pas d\'image dans un e-mail) ; e-mail et macro-modèle : le menu de l\'Image se grise en entier avec elle ; grille : elle reste active (l\'image se pose sur sa case)',
    run: async (h) => {
      await seed(h);
      await setDoc(h, '<p>Texte</p>');
      MainToolbar.syncToolbarState();
      const free = !isLocked('v2-btn-chart-make') && !isLocked('v2-image-group');
      const realGetHfMode = HeaderFooterPreview.getHfMode;
      let inHf; let afterHf;
      try {
        HeaderFooterPreview.getHfMode = () => 'header';
        MainToolbar.syncToolbarState();
        inHf = isLocked('v2-btn-chart-make') && isLocked('v2-btn-chart') && !isLocked('v2-image-group');
      } finally {
        HeaderFooterPreview.getHfMode = realGetHfMode;
        MainToolbar.syncToolbarState();
        afterHf = !isLocked('v2-btn-chart-make');
      }
      MainToolbar.setEmailMode(true);
      MainToolbar.syncToolbarState();
      const inEmail = isLocked('v2-btn-chart-make') && isLocked('v2-image-group');
      MainToolbar.setEmailMode(false);
      MainToolbar.syncToolbarState();
      const afterEmail = !isLocked('v2-btn-chart-make') && !isLocked('v2-image-group');
      MainToolbar.setMacroMode(true);
      MainToolbar.syncToolbarState();
      const inMacro = isLocked('v2-image-group');
      MainToolbar.setMacroMode(false);
      MainToolbar.syncToolbarState();
      const afterMacro = !isLocked('v2-image-group') && !isLocked('v2-btn-chart-make');
      MainToolbar.setGridMode(true);
      MainToolbar.syncToolbarState();
      const inGrid = !isLocked('v2-btn-chart-make') && isLocked('v2-btn-callout');
      MainToolbar.setGridMode(false);
      MainToolbar.syncToolbarState();
      return { pass: free && inHf && afterHf && inEmail && afterEmail && inMacro && afterMacro && inGrid && !!row(), notes: JSON.stringify({ free, inHf, afterHf, inEmail, afterEmail, inMacro, afterMacro, inGrid }) };
    },
  });

  cases.push({
    id: 'chart_make_window_starts_on_the_page_table_with_bars_chosen_and_insert_disabled_and_lists_the_ten_shapes',
    description: 'La fenêtre s\'ouvre sur « Créer un graphique » : les dix formes en vrais boutons radio (Barres choisie), la table du document choisie d\'office (c\'est celle qu\'on a sous les yeux), sa première colonne de texte en étiquettes ; les clients n\'ont aucune colonne de nombres : la fenêtre le dit, « Insérer » est grisé et l\'aperçu dit quoi choisir ; « Empilées » et « Horizontales » ne se montrent que pour les barres',
    run: async (h) => {
      await seed(h);
      await setDoc(h, '<p>Avant</p>');
      await placeCursorAtEnd();
      await openWindow();
      const kinds = Array.from(document.querySelectorAll('#pp-chartmake-modal input[name="pp-chartmake-kind"]'));
      const first = {
        title: text('#pp-chartmake-title'), kinds: kinds.map(i => i.value), names: kinds.map(i => i.parentElement.textContent.trim()), checked: kinds.filter(i => i.checked).map(i => i.value), types: kinds.map(i => i.type),
        table: tableSelect().value, label: labelSelect().value, values: valueInputs().length, note: text('#pp-chartmake-modal .pp-chartmake-values .pp-chart-note'), ok: okButton().disabled, okText: okButton().textContent, state: paperState(),
        message: text('#pp-chartmake-modal .pp-chart-message'), stack: visible(optionInput('stack')), horizontal: visible(optionInput('horizontal')),
      };
      await pickKind('line');
      const onLine = { stack: visible(optionInput('stack')), horizontal: visible(optionInput('horizontal')) };
      await pickKind('area');
      const onArea = { stack: visible(optionInput('stack')), horizontal: visible(optionInput('horizontal')) };
      await closeWindowIfOpen();
      return {
        pass: first.title === 'Créer un graphique' && same(first.kinds, ['bar', 'line', 'area', 'scatter', 'pie', 'donut', 'radar', 'funnel', 'waterfall', 'gauge']) && same(first.names, ['Barres', 'Courbe', 'Aire', 'Nuage', 'Secteurs', 'Anneau', 'Radar', 'Entonnoir', 'Cascade', 'Jauge']) && same(first.checked, ['bar']) && first.types.every(t => t === 'radio')
          && first.table === PAGE_TABLE && first.label === 'Nom' && first.values === 0 && first.note === 'Cette table n’a pas de colonne de nombres à tracer.' && first.ok === true && first.okText === 'Insérer'
          && first.state === 'empty' && first.message === 'Choisissez la table, les étiquettes et les valeurs.' && first.stack && first.horizontal
          && !onLine.stack && !onLine.horizontal && onArea.stack && !onArea.horizontal && !modalOpen(),
        notes: JSON.stringify({ first, onLine, onArea }),
      };
    },
  });

  cases.push({
    id: 'chart_make_window_chooses_the_columns_by_default_and_follows_the_rules_of_each_shape',
    description: 'Une table choisie : la première colonne de texte donne les étiquettes, la première colonne de nombres la valeur ; seules les colonnes de nombres sont proposées (jamais les étiquettes), « Insérer » est dégrisé et l\'aperçu est dessiné ; on coche une seconde colonne ; secteurs et anneau n\'en gardent qu\'une (la première cochée), sans valeur chaque ligne compte pour un et le dit ; changer de table repart de ses colonnes',
    run: async (h) => {
      await seed(h);
      await setDoc(h, '<p>Avant</p>');
      await placeCursorAtEnd();
      await openWindow();
      await pickTable(SALES);
      await settle();
      const chosen = { label: labelSelect().value, values: valueInputs().map(i => [i.value, i.checked]), ok: okButton().disabled, state: paperState(), src: previewImage().getAttribute('src') || '' };
      await tick('Cout', true);
      await settle();
      const two = valueInputs().filter(i => i.checked).map(i => i.value);
      await pickKind('pie');
      const pie = { checked: valueInputs().filter(i => i.checked).map(i => i.value), legend: text('#pp-chartmake-modal .pp-chartmake-values legend') };
      await tick('Montant', false);
      await tick('Cout', false);
      const counted = { note: text('#pp-chartmake-modal .pp-chartmake-values .pp-chart-note'), ok: okButton().disabled };
      await pickKind('radar');
      const radarNeeds = { ok: okButton().disabled, checked: valueInputs().filter(i => i.checked).length };
      await pickTable(PAGE_TABLE);
      const back = { label: labelSelect().value, values: valueInputs().length };
      await closeWindowIfOpen();
      return {
        pass: chosen.label === 'Client' && same(chosen.values, [['Montant', true], ['Cout', false]]) && chosen.ok === false && chosen.state === 'chart' && chosen.src.startsWith('data:image/png;base64,')
          && same(two, ['Montant', 'Cout']) && same(pie.checked, ['Montant']) && pie.legend === 'Valeur à tracer (une seule)'
          && counted.note === 'Sans valeur, chaque ligne compte pour une part.' && counted.ok === false && radarNeeds.ok === true && radarNeeds.checked === 0
          && back.label === 'Nom' && back.values === 0,
        notes: JSON.stringify({ chosen: Object.assign({}, chosen, { src: chosen.src.slice(0, 22) }), two, pie, counted, radarNeeds, back }),
      };
    },
  });

  cases.push({
    id: 'chart_make_window_offers_the_total_of_a_waterfall_and_the_maximum_of_gauges_and_the_node_keeps_them',
    description: 'Entonnoir, cascade, jauge dans la fenêtre : la cascade propose « Afficher le total » (coché d\'office, ni « Empilées » ni « Horizontales »), la jauge un champ « Maximum » (vide : 100, qui n\'est pas un nombre : rien) et, sur la même rangée, la note « Une jauge par ligne, les douze premières. » (la fenêtre garde sa hauteur), l\'entonnoir compte les lignes de chaque étiquette sans valeur cochée ; les trois ne tracent qu\'une colonne (la première cochée reste) ; le maximum change l\'aperçu et se perd en quittant la jauge ; valider une jauge garde `max` sur le nœud et sa fenêtre le relit, une cascade sans total ne garde pas `total` et sa fenêtre le relit décoché',
    run: async (h) => {
      await seed(h);
      await setDoc(h, '<p>Avant</p>');
      await placeCursorAtEnd();
      await openWindow();
      await pickTable(SALES);
      await settle();
      const options = () => visible(document.querySelector('#pp-chartmake-modal .pp-chartmake-options'));
      const ui = () => ({
        total: visible(optionInput('total')), totalOn: optionInput('total').checked, stack: visible(optionInput('stack')), horizontal: visible(optionInput('horizontal')), max: visible(optionInput('max')), maxValue: optionInput('max').value, options: options(),
        values: valueInputs().filter(i => i.checked).map(i => i.value), legend: text('#pp-chartmake-modal .pp-chartmake-values legend'), note: visible(document.querySelector('#pp-chartmake-modal .pp-chartmake-values .pp-chart-note')) ? text('#pp-chartmake-modal .pp-chartmake-values .pp-chart-note') : '',
        ok: !okButton().disabled, state: paperState(), maxNote: visible(document.getElementById('pp-chartmake-max-note')) ? text('#pp-chartmake-max-note') : '', height: Math.round(document.querySelector('#pp-chartmake-modal .pp-modal-box').getBoundingClientRect().height),
      });
      const src = () => previewImage().getAttribute('src') || '';
      const typeMax = async (value) => { const input = optionInput('max'); input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); await settle(); };
      await tick('Cout', true);
      const bars = ui();
      await pickKind('waterfall');
      await settle();
      const fall = ui();
      const fallSrc = src();
      await pickKind('gauge');
      await settle();
      const gauge = ui();
      const placeholder = optionInput('max').placeholder;
      const gaugeSrc = src();
      await typeMax('250');
      const gauge250 = src();
      await typeMax('abc');
      const gaugeAbc = src();
      await typeMax('250');
      await pickKind('funnel');
      await tick('Montant', false);
      await settle();
      const funnel = ui();
      await pickKind('gauge');
      const goneMax = ui().maxValue;
      await tick('Montant', true);
      await typeMax('250');
      await confirm();
      const drawn = await waitFor(() => drawnSrc() !== '', 12000);
      const gaugeSpec = JSON.parse(madeNodes()[0].getAttribute('data-chart-spec'));
      const gaugeName = madeNodes()[0].getAttribute('data-chart-name');
      await selectMade();
      await openWindow();
      const reopened = { gauge: kindInput('gauge').checked, max: ui().maxValue, shown: ui().max, values: ui().values, total: ui().total };
      await pickKind('waterfall');
      const fresh = ui();
      await change(optionInput('total'), (el) => { el.checked = false; });
      await settle();
      await confirm();
      const fallSpec = JSON.parse(madeNodes()[0].getAttribute('data-chart-spec'));
      await selectMade();
      await openWindow();
      const again = { fall: kindInput('waterfall').checked, total: ui().total, totalOn: ui().totalOn, max: ui().max };
      await closeWindowIfOpen();
      return {
        pass: !bars.total && !bars.max && bars.stack && bars.horizontal && bars.values.join() === 'Montant,Cout'
          && fall.total && fall.totalOn && !fall.stack && !fall.horizontal && !fall.max && fall.options && fall.values.join() === 'Montant' && fall.legend === 'Valeur à tracer (une seule)' && fall.note === '' && fall.ok && fall.state === 'chart'
          && !gauge.total && gauge.max && gauge.maxValue === '' && placeholder === '100' && gauge.maxNote === 'Une jauge par ligne, les douze premières.' && gauge.note === '' && fall.maxNote === '' && funnel.maxNote === '' && Math.abs(gauge.height - fall.height) <= 1 && Math.abs(gauge.height - funnel.height) <= 1 && gauge.ok && gauge.values.join() === 'Montant' && gaugeSrc !== fallSrc
          && gauge250 !== gaugeSrc && gaugeAbc === gaugeSrc
          && !funnel.max && !funnel.total && funnel.values.length === 0 && funnel.note === 'Sans valeur, on compte les lignes de chaque étiquette.' && funnel.ok && funnel.state === 'chart' && !funnel.options
          && goneMax === '' && drawn && same(gaugeSpec, { v: 1, kind: 'gauge', table: SALES, label: 'Client', values: ['Montant'], max: 250 }) && gaugeName === 'Jauge · GfVentes'
          && reopened.gauge && reopened.max === '250' && reopened.shown && same(reopened.values, ['Montant']) && !reopened.total
          && fresh.total && fresh.totalOn && !fresh.max && same(fallSpec, { v: 1, kind: 'waterfall', table: SALES, label: 'Client', values: ['Montant'] })
          && again.fall && again.total && !again.totalOn && !again.max && !modalOpen(),
        notes: JSON.stringify({ bars, fall, gauge, placeholder, srcs: [gauge250 !== gaugeSrc, gaugeAbc === gaugeSrc], funnel, goneMax, drawn, gaugeSpec, gaugeName, reopened, fresh, fallSpec, again }),
      };
    },
  });

  cases.push({
    id: 'chart_make_window_rows_follow_the_link_rule_and_the_page_table_and_the_preview_follows_the_choice',
    description: 'Une table liée à celle du document (la règle de liaison existe) trace d\'abord « les lignes liées » (le graphique de la ligne affichée, avec sa légende « Pour la ligne sélectionnée. ») ; « toute la table » trace tout le tableau et change l\'image ; la table du document ne peut tracer que « toute la table » : « liées » est grisée et dit pourquoi',
    run: async (h) => {
      await seed(h);
      await setDoc(h, '<p>Avant</p>');
      await placeCursorAtEnd();
      await openWindow();
      const onPage = { linked: rowsInput('linked').checked, all: rowsInput('all').checked, off: rowsInput('linked').disabled, note: text('#pp-chartmake-modal .pp-chartmake-rows + .pp-chart-note') };
      await pickTable(SALES);
      await settle();
      const linked = { state: paperState(), message: text('#pp-chartmake-modal .pp-chart-message'), record: (GristAPI.getCurrentRecord() || {}).id, linked: rowsInput('linked').checked, all: rowsInput('all').checked, off: rowsInput('linked').disabled, caption: visible(document.querySelector('#pp-chartmake-modal .pp-chart-caption')) ? text('#pp-chartmake-modal .pp-chart-caption') : '', src: previewImage().getAttribute('src') };
      await pickRows('all');
      await settle();
      const all = { linked: rowsInput('linked').checked, all: rowsInput('all').checked, caption: visible(document.querySelector('#pp-chartmake-modal .pp-chart-caption')), src: previewImage().getAttribute('src') };
      await closeWindowIfOpen();
      return {
        pass: !onPage.linked && onPage.all && onPage.off === true && onPage.note === 'Indisponible sur la table de la page.'
          && linked.linked && !linked.all && linked.off === false && linked.caption === 'Pour la ligne sélectionnée.' && linked.src.startsWith('data:image/png') && all.all && !all.linked && !all.caption && all.src.startsWith('data:image/png') && all.src !== linked.src,
        notes: JSON.stringify({ onPage, linked: Object.assign({}, linked, { src: (linked.src || '').length }), all: Object.assign({}, all, { src: (all.src || '').length }) }),
      };
    },
  });

  cases.push({
    id: 'chart_make_insert_makes_a_node_with_its_definition_and_no_image_of_the_default_size_and_one_undo_removes_it',
    description: 'Insérer pose, à la place du curseur, une image de 480 x 300 px sans `src` : le nœud porte la définition (`data-chart-spec`, lisible), les lignes (`data-chart-scope`) et le nom (« Barres · GfVentes »), pas de numéro de section ; le modèle ne contient aucune image ; un seul Annuler le retire, Rétablir le rend ; le curseur revient dans l\'éditeur',
    run: async (h) => {
      await seed(h);
      await setDoc(h, '<p>Avant</p>');
      await placeCursorAtEnd();
      await openWindow();
      await pickTable(SALES);
      await settle();
      await tick('Cout', true);
      await settle();
      await confirm();
      const node = madeNodes()[0];
      const attrs = madeAttrs();
      const specText = node && node.getAttribute('data-chart-spec');
      const written = specText && JSON.parse(specText);
      const focused = document.activeElement && document.activeElement.closest('.tiptap') !== null;
      const html = Editor.getHTML();
      await h.clickButton('v2-btn-undo');
      await sleep(150);
      const afterUndo = madeNodes().length;
      await h.clickButton('v2-btn-redo');
      await sleep(150);
      return {
        pass: !!node && !node.hasAttribute('src') && !node.hasAttribute('data-chart-section') && same(written, { v: 1, kind: 'bar', table: SALES, label: 'Client', values: ['Montant', 'Cout'] }) && node.getAttribute('data-chart-scope') === 'linked'
          && node.getAttribute('data-chart-name') === 'Barres · GfVentes' && node.style.width === '480px' && node.style.height === '300px' && attrs.src === null && !attrs.chartSection && attrs.alt === 'Graphique : Barres · GfVentes'
          && !html.includes('data:image/png') && focused && afterUndo === 0 && madeNodes().length === 1 && !modalOpen(),
        notes: JSON.stringify({ node: node && node.outerHTML.slice(0, 320), focused, afterUndo }),
      };
    },
  });

  cases.push({
    id: 'chart_make_editor_draws_the_chart_in_its_frame_at_the_size_set_and_the_model_stays_without_image',
    description: 'Dans l\'éditeur, le dessin prend la place du cadre dès qu\'il est prêt : l\'image PNG qu\'ECharts trace pour la ligne affichée (300 x 180 px : 900 x 540), aux proportions réglées, identique à celle de la Lecture ; le modèle ne gagne ni `src` ni image ; un graphique sans valeur à tracer (client sans vente) garde son cadre',
    run: async (h) => {
      await seed(h);
      const definition = def('bar', { values: ['Montant'] });
      const style = 'width: 300px; height: 180px';
      await setDoc(h, '<p>Avant</p><p>' + madeHtml(definition, 'linked', undefined, style) + '</p>');
      const ready = await waitFor(() => drawnSrc() !== '', 12000);
      const view = frameView();
      const rect = view.getBoundingClientRect();
      const src = drawnSrc();
      const picture = ready ? await pixelsOf(src) : { width: 0, height: 0, data: [] };
      const html = Editor.getHTML();
      const reader = document.getElementById('reader-container');
      reader.style.display = 'block';
      await ReaderMode.render('<p>Avant</p><p>' + madeHtml(definition, 'linked', undefined, style) + '</p>', PAGE_TABLE, recordOf(1), NO_HF);
      const readerSrc = (reader.querySelector('.reader-content img') || { getAttribute: () => '' }).getAttribute('src');
      reader.style.display = 'none';
      return {
        pass: ready && src.startsWith('data:image/png;base64,') && picture.width === 900 && picture.height === 540 && inkOf(picture) > 3000 && rect.width >= 299.5 && rect.width <= 300.5 && rect.height >= 179.5 && rect.height <= 180.5
          && frameImg().style.aspectRatio === '300 / 180' && madeAttrs().src === null && madeNodes().every(n => !n.hasAttribute('src')) && !html.includes('data:image/png') && src === readerSrc,
        notes: JSON.stringify({ ready, rect: [rect.width, rect.height], picture: [picture.width, picture.height, inkOf(picture)], sameAsReader: src === readerSrc }),
      };
    },
  });

  cases.push({
    id: 'chart_make_row_reads_edit_when_a_made_chart_is_selected_and_editing_keeps_size_place_and_wrapping_in_one_undo',
    description: 'La ligne devient « Modifier le graphique… » (et son nom accessible) quand un graphique créé est sélectionné, pas pour une image ordinaire, et « Graphique de la page… » garde son nom ; la fenêtre s\'ouvre sur ses réglages (forme, table, étiquettes, colonnes, lignes, empilé) ; changer de forme et de colonnes garde la taille, la place et l\'habillage du cadre ; un seul Annuler rend l\'ancienne définition',
    run: async (h) => {
      await seed(h);
      const definition = def('bar', { stack: true });
      await setDoc(h, '<p>Avant</p><p><img class="editor-image" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="Image" style="width: 40px"></p><p>' + madeHtml(definition, 'all', undefined, 'width: 300px; height: 180px') + '</p>');
      let plain;
      EditorCore.getEditor().state.doc.descendants((node, pos) => { if (node.type.name === 'editorImage' && !node.attrs.chartSpec && plain === undefined) plain = pos; });
      EditorCore.getEditor().commands.setNodeSelection(plain);
      await sleep(150);
      const onPlain = { label: row().textContent.trim(), active: row().classList.contains('is-active') };
      await selectMade();
      const onMade = { label: row().textContent.trim(), aria: row().getAttribute('aria-label'), active: row().classList.contains('is-active'), page: pageRow().textContent.trim() };
      await openWindow();
      const opened = { title: text('#pp-chartmake-title'), ok: okButton().textContent, kind: kindInput('bar').checked, table: tableSelect().value, label: labelSelect().value, values: valueInputs().filter(i => i.checked).map(i => i.value), all: rowsInput('all').checked, stack: optionInput('stack').checked, enabled: !okButton().disabled };
      await pickKind('line');
      await tick('Cout', false);
      await settle();
      await confirm();
      const after = madeAttrs();
      const written = JSON.parse(after.chartSpec);
      const nodes = madeNodes();
      await h.clickButton('v2-btn-undo');
      await sleep(150);
      const undone = madeAttrs();
      return {
        pass: onPlain.label === 'Créer un graphique…' && !onPlain.active && onMade.label === 'Modifier le graphique…' && onMade.aria === 'Modifier le graphique' && onMade.active && onMade.page === 'Graphique de la page…'
          && opened.title === 'Modifier le graphique' && opened.ok === 'Valider' && opened.kind && opened.table === SALES && opened.label === 'Mois' && same(opened.values, ['Montant', 'Cout']) && opened.all && opened.stack && opened.enabled
          && nodes.length === 1 && same(written, { v: 1, kind: 'line', table: SALES, label: 'Mois', values: ['Montant'] }) && after.chartScope === 'all' && after.chartName === 'Courbe · GfVentes' && after.width === '300px' && after.height === '180px' && after.layer === 'normal' && after.wrap === 'inline'
          && JSON.parse(undone.chartSpec).kind === 'bar' && JSON.parse(undone.chartSpec).stack === true && same(JSON.parse(undone.chartSpec).values, ['Montant', 'Cout']),
        notes: JSON.stringify({ onPlain, onMade, opened, after: after && { spec: after.chartSpec, scope: after.chartScope, name: after.chartName, w: after.width, h: after.height }, undone: undone && undone.chartSpec }),
      };
    },
  });

  // L'onglet « Aspect » de la fenêtre (lot 2).
  const tab = name => document.getElementById('pp-chartmake-tab-' + name);
  const panel = name => document.getElementById('pp-chartmake-panel-' + name);
  const tabInfo = name => ({ selected: tab(name).getAttribute('aria-selected'), stop: tab(name).tabIndex, shown: visible(panel(name)) });
  const titleInput = () => document.getElementById('pp-chartmake-title-input');
  const paletteInput = id => document.querySelector('#pp-chartmake-modal input[name="pp-chartmake-palette"][value="' + id + '"]');
  const labelsInput = () => optionInput('labels');
  const seriesRows = () => Array.from(document.querySelectorAll('#pp-chartmake-modal .pp-chartmake-serie')).map((line) => {
    const swatch = line.querySelector('.pp-chartmake-swatch');
    const type = line.querySelector('.pp-chartmake-serie-type');
    return { column: swatch.dataset.column, color: swatch.style.getPropertyValue('--swatch').trim(), name: line.querySelector('.pp-chartmake-serie-name').textContent, type: type ? type.value : null, off: type ? type.disabled : null };
  });
  const swatchOf = column => Array.from(document.querySelectorAll('#pp-chartmake-modal .pp-chartmake-swatch')).find(button => button.dataset.column === column);
  const typeSelect = column => Array.from(document.querySelectorAll('#pp-chartmake-modal .pp-chartmake-serie-type')).find(select => select.dataset.column === column);
  const colorsView = () => document.querySelector('#pp-chartmake-modal .pp-chartmake-colors');
  const gridSwatch = color => document.querySelector('#pp-chartmake-modal .pp-chartmake-colors .cp-grid .cp-swatch[data-color="' + color + '"]');
  const showTab = async (name) => { tab(name).click(); await sleep(120); };
  const typeTitle = async (value) => { titleInput().value = value; titleInput().dispatchEvent(new Event('input', { bubbles: true })); await sleep(80); };
  const pressEscape = async () => { document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await sleep(120); };

  cases.push({
    id: 'chart_make_window_aspect_tab_sets_title_palette_color_type_and_values_and_the_node_keeps_them_in_one_undo',
    description: 'La fenêtre a deux onglets (Données, Aspect : de vrais onglets, un seul visible) ; « Aspect » a le titre, les cinq jeux de couleurs, une ligne par série (la pastille de sa couleur, son nom, son type barres ou courbe) et les valeurs affichées ; l\'aperçu suit chaque réglage ; la pastille ouvre le choix de la couleur à la place des onglets (Échap le referme sans fermer la fenêtre), une pastille de la palette le valide ; « Insérer » écrit tout sur le nœud (le nom du graphique est son titre) ; rouvert, le graphique montre les mêmes réglages ; barres horizontales : le type des séries se grise et la note dit pourquoi, un autre type d\'aperçu le rend ; secteurs : plus de séries, la note des parts ; un seul Annuler rend l\'ancienne définition',
    run: async (h) => {
      await seed(h);
      await setDoc(h, '<p>Avant</p>');
      await placeCursorAtEnd();
      await openWindow();
      await pickTable(SALES);
      await pickLabel('Mois');
      await tick('Cout', true);
      await settle();
      const start = { data: tabInfo('data'), aspect: tabInfo('aspect') };
      const plainSrc = previewImage().getAttribute('src');
      await showTab('aspect');
      const opened = { data: tabInfo('data'), aspect: tabInfo('aspect'), rows: seriesRows(), title: titleInput().value, palette: ChartMake.PALETTE_IDS.filter(id => paletteInput(id).checked), labels: labelsInput().checked, names: Array.from(document.querySelectorAll('#pp-chartmake-modal .pp-chartmake-palette-name')).map(n => n.textContent), legend: text('#pp-chartmake-modal .pp-chartmake-series legend') };
      await typeTitle('  Ventes   et coûts ');
      await settle();
      const titledSrc = previewImage().getAttribute('src');
      await change(paletteInput('warm'), (el) => { el.checked = true; });
      await settle();
      const warm = seriesRows();
      swatchOf('Montant').click();
      await sleep(150);
      const picking = { colors: visible(colorsView()), aspect: visible(panel('aspect')), tabs: getComputedStyle(tab('data').parentElement).visibility, grid: document.querySelectorAll('#pp-chartmake-modal .pp-chartmake-colors .cp-grid .cp-swatch').length, auto: document.querySelector('#pp-chartmake-modal .pp-chartmake-tool:not(.cp-custom)').getAttribute('aria-pressed'), title: text('#pp-chartmake-modal .pp-chartmake-colors-title'), inside: !!document.activeElement.closest('.pp-chartmake-colors') };
      await pressEscape();
      const escaped = { colors: visible(colorsView()), aspect: visible(panel('aspect')), open: modalOpen(), focus: document.activeElement === swatchOf('Montant') };
      swatchOf('Montant').click();
      await sleep(150);
      gridSwatch('#0369a1').click();
      await sleep(200);
      const chosen = { colors: visible(colorsView()), aspect: visible(panel('aspect')), rows: seriesRows(), focus: document.activeElement === swatchOf('Montant') };
      await change(typeSelect('Cout'), (el) => { el.value = 'line'; });
      await change(labelsInput(), (el) => { el.checked = true; });
      await settle();
      const mixedSrc = previewImage().getAttribute('src');
      await showTab('data');
      const back = { data: tabInfo('data'), aspect: tabInfo('aspect') };
      await showTab('aspect');
      const kept = { title: titleInput().value, palette: paletteInput('warm').checked, rows: seriesRows(), labels: labelsInput().checked };
      await confirm();
      const attrs = madeAttrs();
      const spec = attrs && JSON.parse(attrs.chartSpec);
      await waitFor(() => !!drawnSrc(), 25000);
      const firstWrite = attrs && attrs.chartSpec;

      await selectMade();
      await openWindow();
      const reopened = { title: text('#pp-chartmake-title'), kind: kindInput('bar').checked, titleField: titleInput().value, tabs: tabInfo('data').selected };
      await showTab('aspect');
      const again = { palette: paletteInput('warm').checked, rows: seriesRows(), labels: labelsInput().checked };
      await showTab('data');
      await change(optionInput('horizontal'), (el) => { el.checked = true; });
      await showTab('aspect');
      const lying = { rows: seriesRows(), note: text('#pp-chartmake-modal .pp-chartmake-series .pp-chart-note'), noteShown: visible(document.querySelector('#pp-chartmake-modal .pp-chartmake-series .pp-chart-note')) };
      await showTab('data');
      await change(optionInput('horizontal'), (el) => { el.checked = false; });
      await showTab('aspect');
      const upright = { rows: seriesRows(), noteShown: visible(document.querySelector('#pp-chartmake-modal .pp-chartmake-series .pp-chart-note')) };
      await showTab('data');
      await pickKind('pie');
      await showTab('aspect');
      const pie = { series: visible(document.querySelector('#pp-chartmake-modal .pp-chartmake-series')), note: text('#pp-chartmake-panel-aspect > .pp-chart-note'), noteShown: visible(document.querySelector('#pp-chartmake-panel-aspect > .pp-chart-note')), palette: visible(document.querySelector('#pp-chartmake-modal .pp-chartmake-palettes')), labels: visible(labelsInput()) };
      await showTab('data');
      await pickKind('scatter');
      await showTab('aspect');
      const scatter = { rows: seriesRows(), types: document.querySelectorAll('#pp-chartmake-modal .pp-chartmake-serie-type').length };
      await showTab('data');
      await tick('Cout', true);
      await pickKind('line');
      await showTab('aspect');
      const line = seriesRows();
      await showTab('data');
      await pickKind('bar');
      await showTab('aspect');
      const rebar = seriesRows();
      await change(typeSelect('Cout'), (el) => { el.value = 'line'; });
      await typeTitle('Ventes 2026');
      await settle();
      await confirm();
      const second = madeAttrs();
      await h.clickButton('v2-btn-undo');
      await sleep(150);
      const undone = madeAttrs();
      const WARM = ChartMake.PALETTES.warm;
      return {
        pass: start.data.selected === 'true' && start.data.stop === 0 && start.data.shown && start.aspect.selected === 'false' && start.aspect.stop === -1 && !start.aspect.shown
          && opened.data.selected === 'false' && !opened.data.shown && opened.aspect.selected === 'true' && opened.aspect.shown && same(opened.rows, [{ column: 'Montant', color: STANDARD[0], name: 'Montant', type: 'bar', off: false }, { column: 'Cout', color: STANDARD[1], name: 'Cout', type: 'bar', off: false }])
          && opened.title === '' && same(opened.palette, ['standard']) && !opened.labels && same(opened.names, ['Standard', 'Bleus', 'Chaudes', 'Froides', 'Gris']) && opened.legend === 'Séries'
          && titledSrc.startsWith('data:image/png') && titledSrc !== plainSrc && same(warm.map(r => r.color), [WARM[0], WARM[1]])
          && picking.colors && !picking.aspect && picking.tabs === 'hidden' && picking.grid === 50 && picking.auto === 'true' && picking.title === 'Couleur de « Montant »' && picking.inside
          && !escaped.colors && escaped.aspect && escaped.open && escaped.focus
          && !chosen.colors && chosen.aspect && chosen.rows[0].color === '#0369a1' && chosen.rows[1].color === WARM[1] && chosen.focus && mixedSrc.startsWith('data:image/png') && mixedSrc !== titledSrc
          && back.data.selected === 'true' && back.data.shown && !back.aspect.shown && kept.title === '  Ventes   et coûts ' && kept.palette && kept.labels && kept.rows[1].type === 'line'
          && same(spec, { v: 1, kind: 'bar', table: SALES, label: 'Mois', values: ['Montant', 'Cout'], title: 'Ventes et coûts', palette: 'warm', colors: { Montant: '#0369a1' }, labels: true, mix: { Cout: 'line' } })
          && attrs.chartName === 'Ventes et coûts' && attrs.alt === 'Graphique : Ventes et coûts' && !modalOpen()
          && reopened.title === 'Modifier le graphique' && reopened.kind && reopened.titleField === 'Ventes et coûts' && reopened.tabs === 'true'
          && again.palette && again.labels && same(again.rows.map(r => [r.color, r.type]), [['#0369a1', 'bar'], [WARM[1], 'line']])
          && same(lying.rows.map(r => [r.type, r.off]), [['bar', true], ['bar', true]]) && lying.noteShown && lying.note === 'Des barres horizontales ne se mêlent pas à une courbe.'
          && same(upright.rows.map(r => [r.type, r.off]), [['bar', false], ['line', false]]) && !upright.noteShown
          && !pie.series && pie.noteShown && pie.note === 'Chaque secteur prend une couleur du jeu choisi.' && pie.palette && pie.labels
          && scatter.types === 0 && scatter.rows.length === 1 && scatter.rows[0].color === '#0369a1'
          && same(line.map(r => r.type), ['line', 'line']) && same(rebar.map(r => r.type), ['bar', 'bar']) && rebar[0].color === '#0369a1'
          && JSON.parse(second.chartSpec).title === 'Ventes 2026' && JSON.parse(second.chartSpec).mix.Cout === 'line' && JSON.parse(undone.chartSpec).title === 'Ventes et coûts' && undone.chartSpec === firstWrite,
        notes: JSON.stringify({ start, opened, warm: warm.map(r => r.color), picking, escaped, chosen, back, kept, spec, name: attrs && attrs.chartName, reopened, again, lying, upright, pie, scatter, line: line.map(r => r.type), rebar: rebar.map(r => r.type), undone: undone && undone.chartSpec }),
      };
    },
  });

  // Le thème de la présentation (js/slide-theme.js) : sa rangée de couleurs est en tête de tous les menus de couleur, celui de la série aussi.
  const THEME = { name: 'Océan', colors: { bg: '#ffffff', text: '#1e2a35', title: '#0b3c5d', accent1: '#1d70b8', accent2: '#00a3a3', accent3: '#5aa9e6', accent4: '#f2a541', accent5: '#6c8ead', accent6: '#3bb273' }, fonts: { title: 'Georgia', body: 'Calibri' } };
  const colorRows = () => Array.from(document.querySelectorAll('#pp-chartmake-modal .pp-chartmake-colors .cp-row')).map((row) => {
    const swatches = Array.from(row.querySelectorAll('.cp-swatch'));
    return { label: row.getAttribute('aria-label'), colors: swatches.map(s => s.dataset.color), titles: swatches.map(s => s.title), forgets: row.querySelectorAll('.cp-forget').length };
  });

  cases.push({
    id: 'chart_make_series_color_view_offers_the_presentation_theme_row_first_with_the_name_of_each_setting_and_keeps_the_chosen_accent',
    description: 'Quand la présentation a un thème, le choix de la couleur d\'une série montre en tête la rangée « Couleurs du thème » (le fond, le texte, les titres, les six accents : sans croix, chaque pastille porte le nom de son réglage dans son infobulle), comme tous les menus de couleur ; sans thème la rangée n\'y est pas ; l\'accent choisi est gardé dans la définition',
    run: async (h) => {
      await seed(h);
      await setDoc(h, '<p>Avant</p>');
      await placeCursorAtEnd();
      PageLayout.setTheme(null);
      try {
        await openWindow();
        await pickTable(SALES);
        await pickLabel('Mois');
        await settle();
        await showTab('aspect');
        swatchOf('Montant').click();
        await sleep(150);
        const bare = colorRows();
        await pressEscape();
        PageLayout.setTheme(THEME);
        await sleep(80);
        swatchOf('Montant').click();
        await sleep(150);
        const themed = colorRows();
        const accent = Array.from(document.querySelectorAll('#pp-chartmake-modal .pp-chartmake-colors .cp-row .cp-swatch')).find(s => s.dataset.color === THEME.colors.accent2);
        accent.click();
        await sleep(200);
        const chosen = seriesRows()[0];
        swatchOf('Montant').click();
        await sleep(150);
        const marked = Array.from(document.querySelectorAll('#pp-chartmake-modal .pp-chartmake-colors .cp-swatch[aria-pressed="true"]')).map(s => s.dataset.color);
        await pressEscape();
        await confirm();
        const spec = JSON.parse(madeAttrs().chartSpec);
        const slots = ['bg', 'text', 'title', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'];
        const names = ['Fond', 'Texte', 'Titres', 'Accent 1', 'Accent 2', 'Accent 3', 'Accent 4', 'Accent 5', 'Accent 6'];
        return {
          pass: bare.every(row => row.label !== 'Couleurs du thème')
            && themed.length >= 1 && themed[0].label === 'Couleurs du thème' && same(themed[0].colors, slots.map(slot => THEME.colors[slot])) && themed[0].forgets === 0
            && same(themed[0].titles, slots.map((slot, at) => names[at] + ' · ' + THEME.colors[slot].toUpperCase()))
            && same(marked, [THEME.colors.accent2])
            && chosen.color === THEME.colors.accent2 && spec.colors && spec.colors.Montant === THEME.colors.accent2 && !modalOpen(),
          notes: JSON.stringify({ bare, themed, marked, chosen, spec }),
        };
      } finally {
        PageLayout.setTheme(null);
      }
    },
  });

  cases.push({
    id: 'chart_make_node_attributes_survive_the_html_round_trip_and_two_charts_are_never_merged_or_given_an_image',
    description: 'La définition (`data-chart-spec`), les lignes et le nom survivent à l\'enregistrement du modèle et à sa relecture, sans jamais recevoir de src ; deux graphiques côte à côte restent deux nœuds (même s\'ils diffèrent d\'une colonne) ; un graphique créé et un graphique de la page voisins aussi ; une image ordinaire à côté n\'est pas prise pour un graphique',
    run: async (h) => {
      const a = def('bar', { values: ['Montant'] });
      const b = def('bar', { values: ['Montant', 'Cout'] });
      await setDoc(h, '<p>' + madeHtml(a, 'linked') + madeHtml(b, 'all', 'Deux colonnes') + '</p><p><img class="editor-image" alt="Graphique" style="width: 480px; height: 300px" data-chart-section="101" data-chart-scope="all" data-chart-name="Page"></p><p><img class="editor-image" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="Image" style="width: 40px"></p>');
      const html = Editor.getHTML();
      const nodes = madeNodes();
      Editor.setHTML(html);
      await sleep(150);
      const again = madeNodes();
      const view = tiptap().querySelectorAll('.editor-image-view');
      return {
        pass: nodes.length === 2 && again.length === 2 && same(again.map(n => [n.getAttribute('data-chart-spec'), n.getAttribute('data-chart-scope'), n.getAttribute('data-chart-name')]), [[ChartMake.stringify(a), 'linked', 'Barres · GfVentes'], [ChartMake.stringify(b), 'all', 'Deux colonnes']])
          && again.every(n => !n.hasAttribute('src')) && parse(html).querySelectorAll('img').length === 4 && view.length === 4 && !html.includes('data:image/png') && parse(html).querySelectorAll('img[data-chart-section]').length === 1,
        notes: JSON.stringify({ nodes: nodes.length, again: again.map(n => n.outerHTML.slice(0, 260)) }),
      };
    },
  });

  cases.push({
    id: 'chart_make_unreadable_definition_keeps_the_frame_without_image_and_without_error_and_the_reader_leaves_a_note',
    description: 'Un nœud dont la définition est illisible (texte cassé, forme d\'une version à venir) ou dont la table n\'existe plus garde son cadre dans l\'éditeur sans dessin ni exception ; la Lecture n\'a pas d\'image et laisse la note « graphique indisponible » dans la langue de l\'interface ; le modèle garde la définition telle quelle (une autre version du widget la lira)',
    run: async (h) => {
      await seed(h);
      const gone = def('bar', { table: 'Nulle part' });
      const broken = '<img class="editor-image" alt="Graphique" style="width: 480px; height: 300px" data-layer="normal" data-wrap="inline" data-chart-spec="{bad" data-chart-scope="all" data-chart-name="Cassé">';
      const future = '<img class="editor-image" alt="Graphique" style="width: 480px; height: 300px" data-layer="normal" data-wrap="inline" data-chart-spec="{&quot;v&quot;:2,&quot;kind&quot;:&quot;treemap&quot;,&quot;table&quot;:&quot;GfVentes&quot;,&quot;label&quot;:&quot;Mois&quot;}" data-chart-scope="all" data-chart-name="Treemap">';
      const errors = [];
      const onError = e => errors.push(e.message || String(e));
      window.addEventListener('error', onError);
      try {
        await setDoc(h, '<p>Avant</p><p>' + broken + '</p><p>' + future + '</p><p>' + madeHtml(gone, 'all') + '</p>');
        await sleep(2500);
        const frames = Array.from(tiptap().querySelectorAll('.editor-image-view.editor-image-chart-placeholder'));
        const drawn = frames.filter(f => f.classList.contains('editor-image-chart-drawn')).length;
        const html = Editor.getHTML();
        const reader = document.getElementById('reader-container');
        reader.style.display = 'block';
        await ReaderMode.render(html, PAGE_TABLE, recordOf(1), NO_HF);
        const content = reader.querySelector('.reader-content');
        const images = content.querySelectorAll('img').length;
        const notes = content.textContent;
        reader.style.display = 'none';
        return {
          pass: frames.length === 3 && drawn === 0 && html.includes('data-chart-spec="{bad"') && html.includes('&quot;kind&quot;:&quot;treemap&quot;') && madeNodes().length === 3 && images === 0 && (notes.match(/Graphique indisponible|graphique est indisponible|indisponible/g) || []).length >= 3 && errors.length === 0,
          notes: JSON.stringify({ frames: frames.length, drawn, images, errors, text: notes.slice(0, 200) }),
        };
      } finally {
        window.removeEventListener('error', onError);
      }
    },
  });

  cases.push({
    id: 'chart_make_window_does_not_open_when_the_editor_is_read_only',
    description: 'Dans un éditeur en lecture seule la fenêtre ne s\'ouvre pas (ChartEntry.openMake rend faux) ; elle s\'ouvre dès que l\'éditeur est modifiable',
    run: async (h) => {
      await seed(h);
      await setDoc(h, '<p>Texte</p>');
      const ed = EditorCore.getEditor();
      ed.setEditable(false);
      let opened;
      try { opened = await ChartEntry.openMake(); await sleep(150); } finally { ed.setEditable(true); }
      const shown = modalOpen();
      await closeWindowIfOpen();
      const normal = await ChartEntry.openMake();
      await sleep(200);
      const shownAfter = modalOpen();
      await closeWindowIfOpen();
      return { pass: opened === false && !shown && normal !== false && shownAfter, notes: JSON.stringify({ opened, shown, normal, shownAfter }) };
    },
  });

  cases.push({
    id: 'chart_make_window_and_row_follow_the_interface_language',
    lang: 'en',
    description: 'Page qui démarre en anglais : la ligne du menu, la fenêtre (insertion puis modification), les formes, les champs, les notes et les noms des graphiques sont en anglais (le français est vérifié par les cas plus haut)',
    run: async (h) => {
      await seed(h);
      await setDoc(h, '<p>Avant</p><p>' + madeHtml(def('bar')) + '</p>');
      await placeCursorAtEnd();
      const en = {};
      try {
        en.row = row().textContent.trim();
        en.aria = row().getAttribute('aria-label');
        await openWindow();
        Object.assign(en, {
          title: text('#pp-chartmake-title'), kinds: Array.from(document.querySelectorAll('#pp-chartmake-modal input[name="pp-chartmake-kind"]')).map(i => i.parentElement.textContent.trim()),
          legend: text('#pp-chartmake-modal .pp-chartmake-kinds legend'), note: text('#pp-chartmake-modal .pp-chartmake-values .pp-chart-note'), message: text('#pp-chartmake-modal .pp-chart-message'), ok: okButton().textContent, cancel: cancelButton().textContent,
          rows: text('#pp-chartmake-modal .pp-chartmake-rows legend'), same: text('#pp-chartmake-modal .pp-chartmake-rows + .pp-chart-note'), stack: text('#pp-chartmake-modal .pp-chartmake-option span'),
        });
        await pickTable(SALES);
        await settle();
        en.caption = text('#pp-chartmake-modal .pp-chart-caption');
        en.linked = rowsInput('linked').parentElement.textContent.trim();
        en.all = rowsInput('all').parentElement.textContent.trim();
        en.values = text('#pp-chartmake-modal .pp-chartmake-values legend');
        // Les trois formes du lot 6 : leurs réglages et leurs notes.
        await pickKind('waterfall');
        const totalLabel = optionInput('total').closest('label');
        en.totalShown = visible(totalLabel) && totalLabel.textContent.trim();
        await pickKind('gauge');
        en.max = text('#pp-chartmake-modal .pp-chartmake-max span');
        en.maxLabel = optionInput('max').getAttribute('aria-label');
        en.gaugeNote = text('#pp-chartmake-max-note');
        await pickKind('funnel');
        await tick('Montant', false);
        en.funnelNote = text('#pp-chartmake-modal .pp-chartmake-values .pp-chart-note');
        en.waterfallName = ChartMake.nameOf({ kind: 'waterfall', table: SALES });
        await pickKind('bar');
        await closeWindowIfOpen();
        await selectMade();
        en.rowEdit = row().textContent.trim();
        en.ariaEdit = row().getAttribute('aria-label');
        await openWindow();
        en.titleEdit = text('#pp-chartmake-title');
        en.okEdit = okButton().textContent;
        en.name = madeAttrs().chartName;
        await closeWindowIfOpen();
      } finally {
        await closeWindowIfOpen();
      }
      return {
        pass: I18n.getLang() === 'en' && en.row === 'Create a chart…' && en.aria === 'Create a chart' && en.title === 'Create a chart' && same(en.kinds, ['Bars', 'Line', 'Area', 'Scatter', 'Pie', 'Donut', 'Radar', 'Funnel', 'Waterfall', 'Gauge']) && en.legend === 'Shape'
          && en.totalShown === 'Show total' && en.max === 'Maximum' && en.maxLabel === 'Maximum' && en.gaugeNote === 'One gauge per row, the first twelve.' && en.funnelNote === 'Without a value, the rows of each label are counted.' && en.waterfallName === 'Waterfall · GfVentes'
          && en.note === 'This table has no numeric column to plot.' && en.message === 'Choose the table, the labels and the values.' && en.ok === 'Insert' && en.cancel === 'Cancel' && en.rows === 'Rows to plot' && en.same === 'Unavailable on the page’s table.' && en.stack === 'Stacked'
          && en.caption === 'For the selected row.' && en.linked === 'Linked rows' && en.all === 'Whole table' && en.values === 'Values to plot'
          && en.rowEdit === 'Edit chart…' && en.ariaEdit === 'Edit the chart' && en.titleEdit === 'Edit the chart' && en.okEdit === 'Confirm' && en.name === 'Bars · GfVentes',
        notes: JSON.stringify({ en }),
      };
    },
  });

  // === 4) Les rendus : Lecture, PDF ==========================================================================================================================
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

  cases.push({
    id: 'chart_make_reader_draws_the_chart_of_the_displayed_row_as_a_png_of_the_size_set_in_the_editor_and_the_exports_preview_too',
    description: 'Lecture : le graphique créé est une image PNG tracée pour la ligne affichée (client 1, 2 puis 3 : trois images différentes), à la taille réglée dans l\'éditeur (480 x 300 px, image de 1 440 x 900) ; « toute la table » donne la même image pour toutes les lignes ; l\'aperçu des exports (ReaderMode.preview) contient le même PNG, et rien pour une ligne sans vente',
    run: async (h) => {
      await seed(h);
      const linked = docOf(madeHtml(def('bar'), 'linked'));
      const all = docOf(madeHtml(def('bar'), 'all'));
      const srcFor = async (html, id) => { const content = await renderReader(html, recordOf(id)); const img = content.querySelector('img'); return img ? { src: img.getAttribute('src'), width: img.style.width, height: img.style.height, ratio: img.style.aspectRatio, count: content.querySelectorAll('img').length } : null; };
      const one = await srcFor(linked, 1);
      const two = await srcFor(linked, 2);
      const three = await srcFor(linked, 3);
      const allOne = await srcFor(all, 1);
      const allTwo = await srcFor(all, 2);
      const picture = one && await pixelsOf(one.src);
      const preview = (await previewOf(linked, recordOf(1))).querySelector('img');
      const none = (await previewOf(linked, NO_SALE)).querySelectorAll('img').length;
      document.getElementById('reader-container').style.display = 'none';
      return {
        pass: !!one && !!two && !!three && one.src.startsWith('data:image/png;base64,') && picture.width === 1440 && picture.height === 900 && one.width === '480px' && one.height === '' && one.ratio === '480 / 300' && one.count === 1
          && one.src !== two.src && two.src !== three.src && one.src !== three.src && allOne.src === allTwo.src && allOne.src !== one.src && !madeNodes().length && !!preview && preview.getAttribute('src') === one.src && none === 0,
        notes: JSON.stringify({ one: one && { w: one.width, h: one.height, r: one.ratio }, picture: picture && [picture.width, picture.height], differs: [one && two && one.src !== two.src, two && three && two.src !== three.src], all: allOne && allTwo && allOne.src === allTwo.src, preview: !!preview && preview.getAttribute('src') === one.src, none }),
      };
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
    return { canvas, data: canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data };
  }

  cases.push({
    id: 'chart_make_pdf_embeds_the_same_png_as_the_reader_at_the_size_set_and_a_row_without_rows_has_no_image',
    description: 'PDF : le graphique créé est une image PNG de 360 pt de large (480 px) et de 225 pt de haut, la MÊME image que la Lecture pour la ligne ; le PDF rendu par pdf.js contient les barres bleues ; une ligne sans vente n\'a aucune image ; deux clients, deux PDF différents',
    run: async (h) => {
      await seed(h);
      const html = docOf(madeHtml(def('bar', { values: ['Montant'] }), 'linked'));
      const out = [];
      for (const id of [1, 3]) {
        const result = await h.exportPdfContent(html, null, null, { tableId: PAGE_TABLE, record: recordOf(id) });
        out.push({ images: h.findImages(result.content), result });
      }
      const noRows = await h.exportPdfContent(html, null, null, { tableId: PAGE_TABLE, record: NO_SALE });
      const one = out[0].images[0];
      const reader = (await renderReader(html, recordOf(1))).querySelector('img').getAttribute('src');
      document.getElementById('reader-container').style.display = 'none';
      const rendered = await pdfCanvas(out[0].result.base64);
      let blue = 0;
      for (let i = 0; i < rendered.data.length; i += 4) if (Math.abs(rendered.data[i] - BAR_BLUE[0]) <= 14 && Math.abs(rendered.data[i + 1] - BAR_BLUE[1]) <= 14 && Math.abs(rendered.data[i + 2] - BAR_BLUE[2]) <= 14) blue += 1;
      const srcOf = (entry, result) => (typeof entry.image === 'string' && entry.image.startsWith('data:') ? entry.image : (result.docDefinition.images || {})[entry.image]);
      return {
        pass: out[0].images.length === 1 && out[1].images.length === 1 && !!one && Math.abs(one.width - 360) < 0.6 && (one.height === undefined || Math.abs(one.height - 225) < 0.6) && srcOf(one, out[0].result) === reader && blue > 2500
          && h.findImages(noRows.content).length === 0 && srcOf(out[1].images[0], out[1].result) !== srcOf(one, out[0].result),
        notes: JSON.stringify({ images: out.map(o => o.images.map(i => [i.width, i.height, i.fit])), sameAsReader: !!one && srcOf(one, out[0].result) === reader, blue, noRows: h.findImages(noRows.content).length }),
      };
    },
  });

  async function docxFor(html, record) {
    await ExportCommon.ensureJsZipLoaded();
    await DocxExport.ensureDocxLibLoaded();
    const { blob } = await DocxExport.getDocxBlobForRecord(html, PAGE_TABLE, record, '', null, null);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const names = Object.keys(zip.files).filter(n => !zip.files[n].dir);
    const document = new DOMParser().parseFromString(await zip.file('word/document.xml').async('string'), 'application/xml');
    return { document, media: names.filter(n => n.startsWith('word/media/')), charts: names.filter(n => /^word\/charts\/chart\d+\.xml$/.test(n)), workbooks: names.filter(n => n.startsWith('word/embeddings/')) };
  }

  cases.push({
    id: 'chart_make_docx_has_the_chart_as_a_native_chart_inline_at_the_size_set_and_a_row_without_rows_has_nothing',
    description: 'Word : le graphique créé est un graphique NATIF de Word (modifiable : un classeur embarqué) dans le flux du texte de 360 x 225 pt, et non l\'image PNG de la Lecture ; une ligne sans vente n\'a rien (le détail de chaque forme est dans la suite « chartOffice »)',
    run: async (h) => {
      await seed(h);
      const html = docOf(madeHtml(def('bar', { values: ['Montant'] }), 'linked'));
      const filled = await docxFor(html, recordOf(1));
      const empty = await docxFor(html, NO_SALE);
      const drawings = h.docxDrawings(filled.document);
      return {
        pass: filled.charts.length === 1 && filled.workbooks.length === 1 && filled.media.length === 0 && drawings.length === 1 && drawings[0].kind === 'inline' && Math.abs(drawings[0].widthPt - 360) < 0.6 && Math.abs(drawings[0].heightPt - 225) < 0.6
          && empty.charts.length === 0 && empty.media.length === 0 && h.docxDrawings(empty.document).length === 0,
        notes: JSON.stringify({ drawings: drawings.map(d => [d.kind, d.widthPt, d.heightPt]), charts: filled.charts, workbooks: filled.workbooks, media: filled.media, empty: [empty.charts.length, empty.media.length] }),
      };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.chartMake = cases;
})();
