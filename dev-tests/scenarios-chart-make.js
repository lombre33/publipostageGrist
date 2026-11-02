// Suite "chartMake" - « Créer un graphique… » (lot 1 du module de graphiques, demande du 02/11 : un graphique réglé dans le modèle, en plus de celui qu'on importe de Grist, pour le document, la grille et
// la présentation), extensions/graphique/chart-make.js (la définition et le dessin d'ECharts), chart-make-ui.js (la fenêtre), chart-source.js (`made`), chart-block.js (`drawMade`, le cadre de l'éditeur, la Lecture
// et les exports) et js/chart-entry.js. Joué hébergé comme la suite « chart » : un GFS simulé donne l'extension « graphique » et les sources de ses deux bibliothèques (cf. HOSTED_GROUPS de run-headless.mjs) ;
// le document de Grist est celui de dev-tests/scenarios-chart-block.js (`window.__chartFixture` : les clients, leurs ventes, la règle de liaison). Quatre moitiés :
//  1) la DÉFINITION et le DESSIN : ce que le widget garde d'un graphique créé, l'option d'ECharts de chaque forme (barres, courbe, aire, nuage, secteurs, anneau, radar), l'image PNG réellement tracée ;
//  2) les LIGNES : les colonnes lues par leur identifiant dans l'ordre de la table, les lignes liées, la table ou la colonne disparue, une ligne sans valeur ;
//  3) l'ÉDITEUR : la ligne du menu « Ajouter une image » (celui des blocs garde ses neuf lignes), son grisé, la fenêtre (formes, table, colonnes, lignes, aperçu), le nœud (`data-chart-spec`, jamais d'image),
//     le cadre dessiné, la modification, la relecture du modèle, la définition illisible, l'anglais, le mode lecture seule ;
//  4) les RENDUS : Lecture, PDF, Word et Excel (grille) montrent la même image que l'éditeur.
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
  const bytesOf = uri => Uint8Array.from(atob(uri.slice(uri.indexOf(',') + 1)), c => c.charCodeAt(0));
  const sameBytes = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

  // === 1) La définition et le dessin ========================================================================================================================
  cases.push({
    id: 'chart_make_definition_keeps_what_the_widget_can_draw_and_refuses_the_rest',
    description: 'La définition gardée sur le nœud : la forme, la table, la colonne des étiquettes et jusqu\'à huit colonnes à tracer ; « empilé » seulement pour barres et aire, « horizontal » seulement pour barres ; une forme inconnue (celle d\'une version à venir), une table ou des étiquettes absentes ne deviennent jamais un graphique ; le texte écrit (`v` : 1) se relit à l\'identique ; un texte illisible ou trop long est refusé ; secteurs et anneau se passent de colonne de valeurs, les autres non ; le nom du cadre dit la forme et la table',
    run: async () => {
      const full = ChartMake.normalize({ kind: 'bar', table: SALES, label: 'Mois', values: ['Montant', 'Cout'], stack: true, horizontal: true });
      const line = ChartMake.normalize({ kind: 'line', table: SALES, label: 'Mois', values: ['Montant'], stack: true, horizontal: true });
      const area = ChartMake.normalize({ kind: 'area', table: SALES, label: 'Mois', values: ['Montant'], stack: true, horizontal: true });
      const many = ChartMake.normalize({ kind: 'bar', table: SALES, label: 'Mois', values: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 3, '', null] });
      const refused = [{ kind: 'gauge', table: 'T', label: 'L', values: [] }, { kind: 'bar', label: 'L', values: [] }, { kind: 'bar', table: 'T', values: [] }, { kind: 'bar', table: 'x'.repeat(201), label: 'L' }, null, 'bar', 42].map(raw => ChartMake.normalize(raw));
      const written = ChartMake.stringify(full);
      const back = ChartMake.parse(written);
      const bad = [ChartMake.parse('{bad'), ChartMake.parse(''), ChartMake.parse(null), ChartMake.parse('x'.repeat(4001)), ChartMake.parse('{"v":1,"kind":"gauge","table":"T","label":"L"}')];
      return {
        pass: same(full, { kind: 'bar', table: SALES, label: 'Mois', values: ['Montant', 'Cout'], stack: true, horizontal: true })
          && same(line, { kind: 'line', table: SALES, label: 'Mois', values: ['Montant'] }) && same(area, { kind: 'area', table: SALES, label: 'Mois', values: ['Montant'], stack: true })
          && many.values.length === 8 && many.values.join('') === 'abcdefgh' && refused.every(r => r === null)
          && written.startsWith('{"v":1,"kind":"bar"') && same(back, full) && bad.every(r => r === null)
          && ChartMake.needsValues('bar') && ChartMake.needsValues('radar') && ChartMake.needsValues('scatter') && !ChartMake.needsValues('pie') && !ChartMake.needsValues('donut')
          && ChartMake.nameOf(full) === 'Barres · GfVentes' && ChartMake.nameOf(line) === 'Courbe · GfVentes' && same(ChartMake.KINDS, ['bar', 'line', 'area', 'scatter', 'pie', 'donut', 'radar'])
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
      try { ChartMake.option({ kind: 'gauge', table: 'T', label: 'L', values: [] }, [MONTHS], {}); } catch (e) { unknown = String(e.message); }
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
    description: 'L\'image de chaque forme est un vrai PNG de 3 pixels par pixel de mise en page (480 x 300 : 1 440 x 900), sur fond blanc, avec de l\'encre ; les barres ont la première couleur de la palette ; un graphique de 300 x 180 fait 900 x 540 ; les sept formes se tracent sans erreur',
    run: async () => {
      const picture = async (kind, series, extra, size) => {
        const option = optionOf(kind, series, extra, size);
        const uri = await ChartMake.toImage(option, (size || { width: 480 }).width, (size || { height: 300 }).height);
        return Object.assign({ uri }, await pixelsOf(uri));
      };
      const results = {};
      const shapes = { bar: [MONTHS, AMOUNT, COST], line: [MONTHS, AMOUNT, COST], area: [MONTHS, AMOUNT, COST], scatter: [xs('Heures', [1, 2, 3], 'Numeric'), AMOUNT], pie: [MONTHS, AMOUNT], donut: [MONTHS, AMOUNT], radar: [MONTHS, AMOUNT, COST] };
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
    id: 'chart_make_window_starts_on_the_page_table_with_bars_chosen_and_insert_disabled_and_lists_the_seven_shapes',
    description: 'La fenêtre s\'ouvre sur « Créer un graphique » : les sept formes en vrais boutons radio (Barres choisie), la table du document choisie d\'office (c\'est celle qu\'on a sous les yeux), sa première colonne de texte en étiquettes ; les clients n\'ont aucune colonne de nombres : la fenêtre le dit, « Insérer » est grisé et l\'aperçu dit quoi choisir ; « Empilées » et « Horizontales » ne se montrent que pour les barres',
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
        pass: first.title === 'Créer un graphique' && same(first.kinds, ['bar', 'line', 'area', 'scatter', 'pie', 'donut', 'radar']) && same(first.names, ['Barres', 'Courbe', 'Aire', 'Nuage', 'Secteurs', 'Anneau', 'Radar']) && same(first.checked, ['bar']) && first.types.every(t => t === 'radio')
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
      const future = '<img class="editor-image" alt="Graphique" style="width: 480px; height: 300px" data-layer="normal" data-wrap="inline" data-chart-spec="{&quot;v&quot;:2,&quot;kind&quot;:&quot;gauge&quot;,&quot;table&quot;:&quot;GfVentes&quot;,&quot;label&quot;:&quot;Mois&quot;}" data-chart-scope="all" data-chart-name="Jauge">';
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
          pass: frames.length === 3 && drawn === 0 && html.includes('data-chart-spec="{bad"') && html.includes('&quot;kind&quot;:&quot;gauge&quot;') && madeNodes().length === 3 && images === 0 && (notes.match(/Graphique indisponible|graphique est indisponible|indisponible/g) || []).length >= 3 && errors.length === 0,
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
        pass: I18n.getLang() === 'en' && en.row === 'Create a chart…' && en.aria === 'Create a chart' && en.title === 'Create a chart' && same(en.kinds, ['Bars', 'Line', 'Area', 'Scatter', 'Pie', 'Donut', 'Radar']) && en.legend === 'Shape'
          && en.note === 'This table has no numeric column to plot.' && en.message === 'Choose the table, the labels and the values.' && en.ok === 'Insert' && en.cancel === 'Cancel' && en.rows === 'Rows to plot' && en.same === 'Unavailable on the page’s table.' && en.stack === 'Stacked'
          && en.caption === 'For the selected row.' && en.linked === 'Linked rows' && en.all === 'Whole table' && en.values === 'Values to plot'
          && en.rowEdit === 'Edit chart…' && en.ariaEdit === 'Edit the chart' && en.titleEdit === 'Edit the chart' && en.okEdit === 'Confirm' && en.name === 'Bars · GfVentes',
        notes: JSON.stringify({ en }),
      };
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
    const names = Object.keys(zip.files).filter(n => n.startsWith('word/media/') && !zip.files[n].dir);
    const document = new DOMParser().parseFromString(await zip.file('word/document.xml').async('string'), 'application/xml');
    const media = [];
    for (const name of names) media.push({ name, bytes: await zip.file(name).async('uint8array') });
    return { document, media };
  }

  cases.push({
    id: 'chart_make_docx_embeds_the_same_png_as_the_reader_inline_at_the_size_set_and_a_row_without_rows_has_no_image',
    description: 'Word : le graphique créé est une image PNG dans le flux du texte de 360 x 225 pt (la MÊME image que la Lecture, 1 440 x 900) ; une ligne sans vente n\'a aucune image',
    run: async (h) => {
      await seed(h);
      const html = docOf(madeHtml(def('bar', { values: ['Montant'] }), 'linked'));
      const filled = await docxFor(html, recordOf(1));
      const empty = await docxFor(html, NO_SALE);
      const drawings = h.docxDrawings(filled.document);
      const reader = (await renderReader(html, recordOf(1))).querySelector('img').getAttribute('src');
      document.getElementById('reader-container').style.display = 'none';
      const picture = filled.media[0] && await pixelsOf(URL.createObjectURL(new Blob([filled.media[0].bytes], { type: 'image/png' })));
      return {
        pass: filled.media.length === 1 && drawings.length === 1 && drawings[0].kind === 'inline' && Math.abs(drawings[0].widthPt - 360) < 0.6 && Math.abs(drawings[0].heightPt - 225) < 0.6
          && picture.width === 1440 && picture.height === 900 && sameBytes(filled.media[0].bytes, bytesOf(reader)) && empty.media.length === 0 && h.docxDrawings(empty.document).length === 0,
        notes: JSON.stringify({ drawings: drawings.map(d => [d.kind, d.widthPt, d.heightPt]), media: filled.media.map(m => m.name), picture: picture && [picture.width, picture.height], empty: empty.media.length }),
      };
    },
  });

  cases.push({
    id: 'chart_make_xlsx_puts_the_chart_of_a_grid_cell_on_its_cell_and_a_row_without_rows_has_no_image',
    description: 'Excel (grille) : le graphique créé d\'une case est une image PNG du classeur posée sur sa case (colonne B, ligne 1), aux proportions réglées (140 x 90 px, image de 420 x 270) ; une ligne sans vente n\'a aucune image',
    run: async (h) => {
      await seed(h);
      const frame = madeHtml(def('bar', { values: ['Montant'] }), 'linked', undefined, 'width: 140px; height: 90px');
      const xlsxOf = async (record) => {
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
      };
      const filled = await xlsxOf(recordOf(1));
      const empty = await xlsxOf(NO_SALE);
      const ratio = filled.ext && Number(filled.ext[1]) / Number(filled.ext[2]);
      return {
        pass: filled.media === 1 && filled.pictures[0].width === 420 && filled.pictures[0].height === 270 && !!filled.anchor && filled.anchor[1] === '1' && filled.anchor[2] === '0' && Math.abs(ratio - 140 / 90) < 0.02 && empty.media === 0,
        notes: JSON.stringify({ media: filled.media, picture: filled.pictures[0] && [filled.pictures[0].width, filled.pictures[0].height], anchor: filled.anchor && filled.anchor.slice(1, 3), ext: filled.ext && filled.ext.slice(1, 3), empty: empty.media }),
      };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.chartMake = cases;
})();
