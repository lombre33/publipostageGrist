// Suite "chartOffice" - le graphique CRÉÉ (« Créer un graphique… ») en graphique NATIF de Word (lot 3 du module de graphiques, demande du 02/11 : « modifiable dans Word, PowerPoint et Excel »),
// extensions/graphique/chart-office.js (le modèle d'Office : les séries, leurs couleurs et leurs types, que les exports lisent sans rien savoir d'ECharts), extensions/graphique/chart-block.js (le modèle posé dans
// l'attribut `data-chart-office` de l'image, à la Lecture et à l'export) et js/docx-export.js (la `ChartRun` de docx/charts, chargée à la demande). Joué hébergé comme les suites « chart » et « chartMake » : un GFS simulé
// donne l'extension « graphique » et la source d'ECharts (cf. HOSTED_GROUPS de run-headless.mjs) ; le document de Grist est celui de dev-tests/scenarios-chart-block.js (`window.__chartFixture`). Trois parties :
//  1) le MODÈLE : ce que ChartOffice.model garde de chacune des sept formes (étiquettes, séries, couleurs, types, empilé, couché, valeurs affichées, titre, axes, échelle d'un radar, abscisses en dates), et ce qu'il refuse ;
//  2) le TRANSPORT : l'attribut de l'image à la Lecture (et pas sur un graphique de la page), absent du HTML, du Markdown et du PDF ;
//  3) le WORD, lu dans le .docx GÉNÉRÉ (dézippé : word/charts/chartN.xml, le classeur embarqué, word/document.xml), jamais dans les objets de docx.js : chaque forme a son élément d'Office, un graphique mêlé a ses deux
//     éléments, aucune image PNG pour un graphique natif, la taille réglée, des identifiants de dessin tous différents, et le repli sur l'image PNG quand Word ne saurait pas lire le graphique.
// Le rendu réel (LibreOffice) et les graphiques de PowerPoint et d'Excel sont vérifiés à part (lots 4 et 5).
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const parseXml = text => new DOMParser().parseFromString(text, 'application/xml');
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const PAGE_TABLE = 'GfClients';
  const SALES = 'GfVentes';

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

  // === Les séries des essais du modèle ========================================================================================================================
  const xs = (label, values, pureType) => ({ label, values, pureType: pureType || 'Text' });
  const ys = (colId, values, label) => ({ colId, label: label || colId, values, pureType: 'Numeric' });
  const MONTHS = xs('Mois', ['Mars', 'Janvier', 'Février']);
  const AMOUNT = ys('Montant', [300, 100, 200]);
  const COST = ys('Cout', [120, 60, 90]);
  const def = (kind, extra) => ChartMake.normalize(Object.assign({ kind, table: SALES, label: 'Mois', values: ['Montant', 'Cout'] }, extra || {}));
  const modelOf = (kind, series, extra) => ChartOffice.model(def(kind, extra), series);
  const names = model => model.series.map(s => s.name);

  // === 1) Le modèle ===========================================================================================================================================
  cases.push({
    id: 'chart_office_model_bar_keeps_the_table_order_the_colors_the_types_and_what_the_drawing_shows',
    description: 'Barres : les étiquettes dans l\'ordre de la table (des mois ne sont pas triés), une série par colonne avec son nom, sa couleur du jeu (ou la sienne) et son type « column » ; le titre, « empilé », « couché », les valeurs affichées ; le nom de l\'axe des étiquettes, celui de l\'axe des valeurs seulement pour une série seule ; une colonne mêlée à une courbe a le type « line » ; le texte du modèle se relit à l\'identique en JSON',
    run: async () => {
      const two = modelOf('bar', [MONTHS, AMOUNT, COST]);
      const one = modelOf('bar', [MONTHS, AMOUNT], { values: ['Montant'] });
      const dressed = modelOf('bar', [MONTHS, AMOUNT, COST], { title: 'Ventes', stack: true, labels: true, palette: 'warm', colors: { Cout: '#00a3a3' } });
      const lying = modelOf('bar', [MONTHS, AMOUNT], { values: ['Montant'], horizontal: true });
      const mixed = modelOf('bar', [MONTHS, AMOUNT, COST], { mix: { Cout: 'line' } });
      return {
        pass: two.v === 1 && two.kind === 'bar' && same(two.categories, ['Mars', 'Janvier', 'Février']) && same(names(two), ['Montant', 'Cout']) && same(two.series[0].values, [300, 100, 200]) && same(two.series[1].values, [120, 60, 90])
          && same(two.series.map(s => s.type), ['column', 'column']) && same(two.series.map(s => s.color), ['#2b78ae', '#fe945b']) && same(two.axes, { category: 'Mois', value: '' }) && !two.stacked && !two.horizontal && !two.labels && !two.title
          && one.axes.value === 'Montant' && same(one.axes, { category: 'Mois', value: 'Montant' })
          && dressed.title === 'Ventes' && dressed.stacked === true && dressed.labels === true && dressed.series[0].color === '#a32a1f' && dressed.series[1].color === '#00a3a3'
          && lying.horizontal === true && same(mixed.series.map(s => s.type), ['column', 'line']) && same(JSON.parse(JSON.stringify(dressed)), dressed),
        notes: JSON.stringify({ two, dressed: [dressed.title, dressed.stacked, dressed.labels, dressed.series.map(s => s.color)], mixed: mixed.series.map(s => s.type) }),
      };
    },
  });

  cases.push({
    id: 'chart_office_model_line_and_area_follow_the_order_of_the_drawing_and_an_area_is_a_filled_line',
    description: 'Courbe et aire : des étiquettes de texte gardent l\'ordre de la table, des nombres ou des dates sont rangés dans l\'ordre de l\'axe en emportant les valeurs de chaque série (comme le dessin) ; la série d\'une aire est du type « area », une colonne mêlée à des barres « column » ; une série sans valeur à un endroit y laisse un vide (null)',
    run: async () => {
      const text = modelOf('line', [MONTHS, AMOUNT]);
      const numbers = modelOf('line', [xs('Quantité', [30, 10, 20], 'Numeric'), ys('Montant', [3, 1, 2])], { label: 'Quantité', values: ['Montant'] });
      const dates = modelOf('area', [xs('Jour', ['2026-03-10', '2026-01-05', '2026-02-20'], 'Date'), ys('Montant', [3, 1, 2])], { label: 'Jour', values: ['Montant'] });
      const areaMixed = modelOf('area', [MONTHS, AMOUNT, COST], { mix: { Cout: 'bar' } });
      const gap = modelOf('line', [MONTHS, ys('Montant', [300, null, 200])], { values: ['Montant'] });
      return {
        pass: same(text.categories, ['Mars', 'Janvier', 'Février']) && same(text.series[0].values, [300, 100, 200]) && text.series[0].type === 'line'
          && same(numbers.categories, ['10', '20', '30']) && same(numbers.series[0].values, [1, 2, 3])
          && same(dates.categories, ['2026-01-05', '2026-02-20', '2026-03-10']) && same(dates.series[0].values, [1, 2, 3]) && dates.series[0].type === 'area'
          && same(areaMixed.series.map(s => s.type), ['area', 'column']) && same(gap.series[0].values, [300, null, 200]),
        notes: JSON.stringify({ text: text.categories, numbers: [numbers.categories, numbers.series[0].values], dates: [dates.categories, dates.series[0].values], areaMixed: areaMixed.series.map(s => s.type), gap: gap.series[0].values }),
      };
    },
  });

  cases.push({
    id: 'chart_office_model_pie_and_donut_add_up_the_parts_like_the_drawing_with_the_colors_of_the_set',
    description: 'Secteurs et anneau : une part par étiquette (deux lignes de même étiquette n\'en font qu\'une, les valeurs s\'additionnent), les parts sans valeur positive sont laissées, une seule série dont `colors` donne la couleur de chaque part dans l\'ordre du jeu choisi ; sans colonne de valeurs chaque ligne compte pour un ; l\'anneau est de la forme « donut »',
    run: async () => {
      const family = xs('Famille', ['Pain', 'Gâteau', 'Pain', 'Autre', 'Vide']);
      const pie = modelOf('pie', [family, ys('Montant', [300, 100, 50, 0, null])], { label: 'Famille', values: ['Montant'] });
      const donut = modelOf('donut', [family, ys('Montant', [300, 100, 50, 0, null])], { label: 'Famille', values: ['Montant'], palette: 'cool', labels: true });
      const counted = modelOf('pie', [xs('Famille', ['Pain', 'Gâteau', 'Pain'])], { label: 'Famille', values: [] });
      return {
        pass: pie.kind === 'pie' && same(pie.categories, ['Pain', 'Gâteau']) && pie.series.length === 1 && same(pie.series[0].values, [350, 100]) && pie.series[0].name === 'Montant'
          && same(pie.series[0].colors, ['#2b78ae', '#fe945b']) && donut.kind === 'donut' && donut.labels === true && same(donut.series[0].colors, ['#1d6b73', '#2f6fb0'])
          && same(counted.categories, ['Pain', 'Gâteau']) && same(counted.series[0].values, [2, 1]),
        notes: JSON.stringify({ pie: [pie.categories, pie.series[0].values, pie.series[0].colors], donut: donut.series[0].colors, counted: counted.series[0].values }),
      };
    },
  });

  cases.push({
    id: 'chart_office_model_radar_has_the_scale_of_the_drawing_and_a_gap_is_the_bottom_of_the_scale',
    description: 'Radar : une branche par étiquette, un polygone par colonne (type « line »), l\'échelle du dessin (de zéro, ou du plus petit négatif, au plus grand « beau » nombre : 300 donne 500) ; une valeur absente est le bas de l\'échelle',
    run: async () => {
      const plain = modelOf('radar', [MONTHS, AMOUNT, COST]);
      const negative = modelOf('radar', [MONTHS, ys('Montant', [30, -8, null])], { values: ['Montant'] });
      return {
        pass: plain.kind === 'radar' && same(plain.categories, ['Mars', 'Janvier', 'Février']) && same(plain.scale, { min: 0, max: 500 }) && same(names(plain), ['Montant', 'Cout']) && plain.series.every(s => s.type === 'line')
          && same(negative.scale, { min: -10, max: 50 }) && same(negative.series[0].values, [30, -8, -10]),
        notes: JSON.stringify({ plain: [plain.scale, plain.categories], negative: [negative.scale, negative.series[0].values] }),
      };
    },
  });

  cases.push({
    id: 'chart_office_model_scatter_keeps_numbers_and_dates_on_the_x_axis_and_has_no_model_for_text',
    description: 'Nuage : les points (abscisse, valeur) de chaque colonne, ceux qui n\'ont pas de valeur ou d\'abscisse laissés ; des dates sont des numéros de série d\'Excel (le 10/03/2026 est 46 091) et `xDates` le dit ; une abscisse de texte n\'a pas de place dans un nuage d\'Office : pas de modèle (le graphique reste l\'image)',
    run: async () => {
      const numeric = modelOf('scatter', [xs('Cout', [120, 60, null, 90], 'Numeric'), ys('Montant', [300, 100, 5, null])], { label: 'Cout', values: ['Montant'] });
      const dated = modelOf('scatter', [xs('Jour', ['2026-03-10', '2026-01-05T12:00:00.000+01:00'], 'Date'), ys('Montant', [3, 1])], { label: 'Jour', values: ['Montant'] });
      const text = modelOf('scatter', [MONTHS, AMOUNT], { values: ['Montant'] });
      return {
        pass: same(numeric.series[0].points, [[120, 300], [60, 100]]) && !numeric.xDates && numeric.series[0].values === undefined && same(numeric.axes, { category: 'Cout', value: 'Montant' })
          && dated.xDates === true && same(dated.series[0].points, [[46091, 3], [46027.5, 1]]) && text === null,
        notes: JSON.stringify({ numeric: numeric.series[0].points, dated: dated.series[0].points, text }),
      };
    },
  });

  cases.push({
    id: 'chart_office_model_is_none_for_what_the_shape_cannot_say_and_never_changes_the_series',
    description: 'Pas de modèle (null) pour une forme inconnue, une définition absente, aucune série, plus de 2 000 étiquettes ; les séries données ne sont jamais modifiées (le dessin les relit) ; une courbe n\'a pas son ordre rangé sur place',
    run: async () => {
      const many = xs('Mois', Array.from({ length: ChartOffice.MAX_CATEGORIES + 1 }, (v, i) => 'M' + i));
      const limit = xs('Mois', Array.from({ length: ChartOffice.MAX_CATEGORIES }, (v, i) => 'M' + i));
      const values = n => ys('Montant', Array.from({ length: n }, (v, i) => i));
      const before = JSON.stringify([xs('Quantité', [30, 10, 20], 'Numeric'), ys('Montant', [3, 1, 2])]);
      const series = [xs('Quantité', [30, 10, 20], 'Numeric'), ys('Montant', [3, 1, 2])];
      modelOf('line', series, { label: 'Quantité', values: ['Montant'] });
      return {
        pass: ChartOffice.model({ kind: 'gauge' }, [MONTHS, AMOUNT]) === null && ChartOffice.model(null, [MONTHS, AMOUNT]) === null && ChartOffice.model(def('bar'), []) === null
          && modelOf('bar', [many, values(many.values.length)], { values: ['Montant'] }) === null && !!modelOf('bar', [limit, values(limit.values.length)], { values: ['Montant'] })
          && JSON.stringify(series) === before && ChartOffice.VERSION === 1,
        notes: JSON.stringify({ limit: ChartOffice.MAX_CATEGORIES, unchanged: JSON.stringify(series) === before }),
      };
    },
  });

  // === 2) Le transport : l'attribut de l'image ===============================================================================================================
  const madeHtml = (definition, scope, style) => '<img class="editor-image" alt="Graphique" style="' + (style || 'width: 480px; height: 300px') + '" data-layer="normal" data-wrap="inline" data-chart-spec="'
    + ChartMake.stringify(definition).replace(/"/g, '&quot;') + '" data-chart-scope="' + (scope || 'linked') + '" data-chart-name="' + ChartMake.nameOf(definition) + '">';
  const docOf = (...blocks) => '<p>Avant</p>' + blocks.map(block => '<p>' + block + '</p>').join('') + '<p>Après</p>';
  async function renderReader(html, record) {
    const reader = document.getElementById('reader-container');
    reader.style.display = 'block';
    await ReaderMode.render(html, PAGE_TABLE, record || GristAPI.getCurrentRecord(), NO_HF);
    return reader.querySelector('.reader-content');
  }
  const hideReader = () => { document.getElementById('reader-container').style.display = 'none'; };

  cases.push({
    id: 'chart_office_reader_carries_the_model_of_the_row_on_the_image_and_a_page_chart_has_none',
    description: 'Lecture : l\'image d\'un graphique créé porte `data-chart-office` (le modèle de la ligne affichée : client 1 a deux ventes, Mars et Janvier ; client 2, Février et Avril), lisible en JSON, de la forme du graphique ; le graphique de la page (importé de Grist) n\'en porte pas ; une ligne sans vente n\'a pas d\'image ; l\'aperçu des exports (ReaderMode.preview) le porte aussi',
    run: async (h) => {
      await seed(h);
      const html = docOf(madeHtml(def('bar', { values: ['Montant'], title: 'Ventes' }), 'linked'));
      const pageChart = docOf('<img class="editor-image" alt="Graphique" style="width: 480px; height: 300px" data-layer="normal" data-wrap="inline" data-chart-section="101" data-chart-scope="all" data-chart-name="Ventes par mois">');
      const read = async (source, record) => { const content = await renderReader(source, record); const img = content.querySelector('img'); return img ? { raw: img.getAttribute('data-chart-office'), src: img.getAttribute('src') } : null; };
      const one = await read(html, recordOf(1));
      const two = await read(html, recordOf(2));
      const none = await read(html, NO_SALE);
      const page = await read(pageChart, recordOf(1));
      hideReader();
      const box = document.createElement('div');
      box.innerHTML = await ReaderMode.preview(html, PAGE_TABLE, recordOf(1));
      const previewed = box.querySelector('img');
      const first = one && JSON.parse(one.raw);
      const second = two && JSON.parse(two.raw);
      return {
        pass: !!first && first.v === 1 && first.kind === 'bar' && first.title === 'Ventes' && same(first.categories, ['Mars', 'Janvier']) && same(first.series[0].values, [300, 100]) && first.series[0].name === 'Montant'
          && !!second && same(second.categories, ['Février', 'Avril']) && same(second.series[0].values, [200, 50])
          && one.src.startsWith('data:image/png;base64,') && none === null && !!page && page.raw === null && page.src.startsWith('data:image/png') && !!previewed && previewed.getAttribute('data-chart-office') === one.raw,
        notes: JSON.stringify({ first: first && [first.kind, first.categories, first.series[0].values], second: second && second.categories, none, page: page && page.raw, previewed: !!previewed }),
      };
    },
  });

  cases.push({
    id: 'chart_office_html_markdown_and_pdf_exports_do_not_carry_the_model',
    description: 'Le HTML, le Markdown et le PDF exportés d\'un graphique créé gardent l\'image seule : ni l\'attribut `data-chart-office`, ni le texte de son modèle',
    run: async (h) => {
      await seed(h);
      const html = docOf(madeHtml(def('bar', { values: ['Montant'] }), 'linked'));
      const record = recordOf(1);
      const page = await h.exportHtml(html, null, record, PAGE_TABLE, '');
      const fragment = await h.exportHtml(html, null, record, PAGE_TABLE, '', { fragment: true });
      const markdown = await h.exportMarkdown(html, null, record, PAGE_TABLE, '');
      const pdf = await h.exportPdfContent(html, null, null, { tableId: PAGE_TABLE, record });
      const leaks = text => /data-chart-office|"kind":"bar"|chart-office/.test(text);
      return {
        pass: /<img/.test(page.text) && !leaks(page.text) && !leaks(fragment.text) && !leaks(markdown.text) && !leaks(JSON.stringify(pdf.docDefinition)) && h.findImages(pdf.content).length === 1,
        notes: JSON.stringify({ html: [/<img/.test(page.text), leaks(page.text)], fragment: leaks(fragment.text), markdown: leaks(markdown.text), pdf: leaks(JSON.stringify(pdf.docDefinition)) }),
      };
    },
  });

  // === 3) Le Word =============================================================================================================================================
  // Le .docx généré, dézippé : { zip, doc, parts (les textes XML par nom), media (word/media/*), charts (word/charts/chartN.xml, parsés), workbooks (word/embeddings/*) }.
  async function docxOf(html, record) {
    await ExportCommon.ensureJsZipLoaded();
    await DocxExport.ensureDocxLibLoaded();
    const { blob } = await DocxExport.getDocxBlobForRecord(html, record ? PAGE_TABLE : null, record || {}, '', null, null);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const all = Object.keys(zip.files).filter(name => !zip.files[name].dir);
    const parts = {};
    for (const name of all.filter(n => /\.(xml|rels)$/.test(n))) parts[name] = await zip.file(name).async('string');
    const charts = all.filter(n => /^word\/charts\/chart\d+\.xml$/.test(n)).sort((a, b) => parseInt(a.replace(/\D/g, ''), 10) - parseInt(b.replace(/\D/g, ''), 10)).map(n => parseXml(parts[n]));
    return {
      zip, parts, charts, doc: parseXml(parts['word/document.xml']),
      media: all.filter(n => n.startsWith('word/media/')), workbooks: all.filter(n => /^word\/embeddings\/.+\.xlsx$/.test(n)),
    };
  }
  const tagsOf = (node, tag) => Array.from(node.getElementsByTagName(tag));
  const textsOf = (node, tag) => tagsOf(node, tag).map(n => n.textContent);
  // Les séries d'un graphique d'Office, dans l'ordre : { name, color, cats, vals }, la couleur étant celle de la barre (`c:spPr`) ou du trait.
  function seriesOf(chart) {
    return tagsOf(chart, 'c:ser').map((ser) => {
      const own = Array.from(ser.children).find(child => child.nodeName === 'c:spPr');
      const colorNode = own && own.getElementsByTagName('a:srgbClr')[0];
      const cat = Array.from(ser.children).find(child => child.nodeName === 'c:cat' || child.nodeName === 'c:xVal');
      const val = Array.from(ser.children).find(child => child.nodeName === 'c:val' || child.nodeName === 'c:yVal');
      return { name: textsOf(Array.from(ser.children).find(child => child.nodeName === 'c:tx'), 'c:v')[0], color: colorNode && colorNode.getAttribute('val'), cats: cat ? textsOf(cat, 'c:v') : [], vals: val ? textsOf(val, 'c:v').map(Number) : [] };
    });
  }
  const PLOTS = ['c:barChart', 'c:lineChart', 'c:areaChart', 'c:scatterChart', 'c:pieChart', 'c:doughnutChart', 'c:radarChart'];
  const plotsOf = chart => PLOTS.filter(tag => tagsOf(chart, tag).length);
  const chartDrawings = doc => tagsOf(doc, 'wp:inline').concat(tagsOf(doc, 'wp:anchor')).filter(box => /\/chart$/.test((box.getElementsByTagName('a:graphicData')[0] || { getAttribute: () => '' }).getAttribute('uri') || ''));
  const PNG = (() => { let uri = ''; return () => { if (!uri) { const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = 300; canvas.getContext('2d').fillRect(0, 0, 480, 300); uri = canvas.toDataURL('image/png'); } return uri; }; })();
  // Une image de graphique déjà dessinée, avec le modèle (comme la Lecture la donne aux exports) : de quoi essayer le Word sans les données de Grist. `attrs` : les attributs de l'image à la place de ceux d'une image en ligne.
  const drawnHtml = (model, attrs) => '<p><img class="editor-image" alt="Mon graphique" src="' + PNG() + '" style="width: 480px; height: 300px"' + (attrs === undefined ? ' data-layer="normal" data-wrap="inline"' : attrs)
    + (model === undefined ? '' : ' data-chart-office="' + (typeof model === 'string' ? model : JSON.stringify(model)).replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"') + '></p>';
  const months = ['Janvier', 'Février', 'Mars'];
  const column = (name, color, values, type) => ({ name, color, type: type || 'column', values });
  const BAR_MODEL = { v: 1, kind: 'bar', title: 'Ventes', axes: { category: 'Mois', value: '' }, categories: months, series: [column('Paris', '#2b78ae', [12, 19, 8]), column('Lyon', '#fe945b', [7, 11, 14])] };

  // Doit rester AVANT tout cas qui exporte un graphique : la bibliothèque des graphiques de Word ne se décharge pas, ce cas lit « pas encore chargée » dans la page toute neuve de la suite.
  cases.push({
    id: 'chart_office_docx_loads_the_charts_library_only_for_a_document_with_a_created_chart_and_once_for_two',
    description: 'Word : la bibliothèque des graphiques natifs (charts.iife.js) ne se charge que pour un document qui porte un graphique créé : un document de texte, de tableau ou d\'image ordinaire ne la demande pas (ni ne change de taille) ; deux graphiques créés la demandent une seule fois',
    run: async () => {
      const asked = [];
      const original = ExportCommon.loadScriptOnce;
      ExportCommon.loadScriptOnce = function (spec) { asked.push(String(spec && spec.src)); return original.apply(this, arguments); };
      const libraries = () => asked.filter(src => /charts\.iife\.js/.test(src)).length;
      try {
        const fresh = typeof window.docxCharts === 'undefined';
        const plain = await docxOf('<p>Du texte</p>' + drawnHtml(undefined) + '<table><tbody><tr><td><p>Une case</p></td></tr></tbody></table>');
        const afterPlain = { asked: libraries(), loaded: typeof window.docxCharts !== 'undefined' };
        const two = await docxOf(drawnHtml(BAR_MODEL) + drawnHtml(BAR_MODEL));
        const afterTwo = { asked: libraries(), loaded: typeof window.docxCharts !== 'undefined' };
        const again = await docxOf(drawnHtml(BAR_MODEL));
        return {
          pass: fresh && plain.charts.length === 0 && plain.media.length === 1 && afterPlain.asked === 0 && !afterPlain.loaded
            && two.charts.length === 2 && two.media.length === 0 && afterTwo.asked === 1 && afterTwo.loaded && again.charts.length === 1 && libraries() === 1,
          notes: JSON.stringify({ fresh, plain: [plain.charts.length, plain.media.length], afterPlain, two: [two.charts.length, two.media.length], afterTwo, again: again.charts.length, total: libraries() }),
        };
      } finally {
        ExportCommon.loadScriptOnce = original;
      }
    },
  });

  cases.push({
    id: 'chart_office_docx_bar_is_a_native_chart_with_its_data_and_workbook_inline_at_the_size_set_and_no_picture',
    description: 'Word : le graphique créé (barres, client 1) est un graphique natif de Word dans le flux du texte, de 360 x 225 pt, avec ses deux séries (nom, couleur du jeu, étiquettes dans l\'ordre de la table, valeurs), un classeur embarqué que « Modifier les données » ouvre dans Excel, son type de contenu et sa relation déclarés, et aucune image PNG ; une ligne sans vente n\'a rien',
    run: async (h) => {
      await seed(h);
      const html = docOf(madeHtml(def('bar', { values: ['Montant', 'Cout'] }), 'linked'));
      const filled = await docxOf(html, recordOf(1));
      const empty = await docxOf(html, NO_SALE);
      const drawings = chartDrawings(filled.doc);
      const box = drawings[0];
      const extent = box && box.getElementsByTagName('wp:extent')[0];
      const series = filled.charts[0] ? seriesOf(filled.charts[0]) : [];
      const types = parseXml(filled.parts['[Content_Types].xml'] || '<x/>');
      const hasOverride = tagsOf(types, 'Override').some(o => o.getAttribute('PartName') === '/word/charts/chart1.xml' && /drawingml\.chart\+xml$/.test(o.getAttribute('ContentType')));
      const rels = filled.parts['word/charts/_rels/chart1.xml.rels'] || '';
      return {
        pass: filled.charts.length === 1 && drawings.length === 1 && box.nodeName === 'wp:inline' && Math.abs(Number(extent.getAttribute('cx')) / 12700 - 360) < 0.6 && Math.abs(Number(extent.getAttribute('cy')) / 12700 - 225) < 0.6
          && same(plotsOf(filled.charts[0]), ['c:barChart']) && tagsOf(filled.charts[0], 'c:barDir')[0].getAttribute('val') === 'col' && series.length === 2
          && same(series.map(s => s.name), ['Montant', 'Cout']) && same(series.map(s => s.color), ['2B78AE', 'FE945B']) && same(series[0].cats, ['Mars', 'Janvier']) && same(series[0].vals, [300, 100]) && same(series[1].vals, [120, 60])
          && filled.media.length === 0 && filled.workbooks.length === 1 && /Target="\.\.\/embeddings\/[^"]+\.xlsx"/.test(rels) && hasOverride
          && empty.charts.length === 0 && empty.media.length === 0 && chartDrawings(empty.doc).length === 0,
        notes: JSON.stringify({ charts: filled.charts.length, drawings: drawings.map(d => d.nodeName), size: extent && [extent.getAttribute('cx') / 12700, extent.getAttribute('cy') / 12700], series, media: filled.media, workbooks: filled.workbooks, rels, hasOverride, empty: [empty.charts.length, empty.media.length] }),
      };
    },
  });

  cases.push({
    id: 'chart_office_docx_every_shape_has_its_native_chart_of_office',
    description: 'Word : chacune des sept formes devient son graphique d\'Office - barres (colonnes), barres couchées (barDir « bar »), courbe, aire, nuage, secteurs, anneau, radar ; chacune est le seul graphique du .docx, sans image PNG',
    run: async (h) => {
      await seed(h);
      const shapes = [
        ['bar', { values: ['Montant'] }, 'c:barChart'], ['bar', { values: ['Montant'], horizontal: true }, 'c:barChart'], ['line', { values: ['Montant'] }, 'c:lineChart'], ['area', { values: ['Montant'] }, 'c:areaChart'],
        ['scatter', { label: 'Cout', values: ['Montant'] }, 'c:scatterChart'], ['pie', { label: 'Famille', values: ['Montant'] }, 'c:pieChart'], ['donut', { label: 'Famille', values: ['Montant'] }, 'c:doughnutChart'], ['radar', { values: ['Montant', 'Cout'] }, 'c:radarChart'],
      ];
      const out = [];
      for (const [kind, extra, tag] of shapes) {
        const result = await docxOf(docOf(madeHtml(def(kind, extra), 'linked')), recordOf(1));
        out.push({ kind: kind + (extra.horizontal ? ' couché' : ''), tag, plots: result.charts[0] ? plotsOf(result.charts[0]) : [], charts: result.charts.length, media: result.media.length, dir: result.charts[0] && tagsOf(result.charts[0], 'c:barDir')[0] ? tagsOf(result.charts[0], 'c:barDir')[0].getAttribute('val') : null });
      }
      return {
        pass: out.every(o => o.charts === 1 && o.media === 0 && same(o.plots, [o.tag])) && out[0].dir === 'col' && out[1].dir === 'bar',
        notes: JSON.stringify(out),
      };
    },
  });

  cases.push({
    id: 'chart_office_docx_bars_and_a_line_stacked_with_values_title_and_axis_names',
    description: 'Word : des barres mêlées à une courbe sont un graphique à deux éléments sur les mêmes axes (barres empilées, courbe par-dessus), avec le titre, le nom de l\'axe des étiquettes (« Mois »), les valeurs affichées de chaque série, la couleur choisie d\'une série et celle des jeux pour l\'autre',
    run: async (h) => {
      await seed(h);
      const html = docOf(madeHtml(def('bar', { values: ['Montant', 'Cout'], mix: { Cout: 'line' }, stack: true, labels: true, title: 'Ventes du client', colors: { Cout: '#00a3a3' } }), 'linked'));
      const result = await docxOf(html, recordOf(1));
      const chart = result.charts[0];
      const bar = chart && tagsOf(chart, 'c:barChart')[0];
      const line = chart && tagsOf(chart, 'c:lineChart')[0];
      const titles = chart ? textsOf(chart, 'a:t') : [];
      const series = chart ? seriesOf(chart) : [];
      return {
        pass: !!chart && same(plotsOf(chart), ['c:barChart', 'c:lineChart']) && tagsOf(bar, 'c:grouping')[0].getAttribute('val') === 'stacked' && tagsOf(bar, 'c:ser').length === 1 && tagsOf(line, 'c:ser').length === 1
          && titles.includes('Ventes du client') && titles.includes('Mois') && tagsOf(chart, 'c:showVal').some(n => n.getAttribute('val') === '1') && same(series.map(s => s.name), ['Montant', 'Cout']) && series[0].color === '2B78AE' && series[1].color === '00A3A3'
          && result.media.length === 0,
        notes: JSON.stringify({ plots: chart && plotsOf(chart), grouping: bar && tagsOf(bar, 'c:grouping')[0].getAttribute('val'), titles, series }),
      };
    },
  });

  cases.push({
    id: 'chart_office_docx_options_follow_the_model_shape_by_shape',
    description: 'Les options de la ChartRun (fonction pure DocxExport.chartOptionsFromModel) : types d\'Office de chaque forme, couleurs sans « # », légende en haut pour plusieurs séries, en bas pour les secteurs et l\'anneau, aucune pour une seule série, noms des axes, valeurs affichées (format entier ou à deux décimales, position selon le type, encre lisible sur des barres empilées), barres couchées lues de haut en bas avec l\'axe des valeurs en bas, échelle d\'un radar, dates d\'un nuage, trou de l\'anneau, parts d\'un anneau lisibles sur leur couleur',
    run: async () => {
      const options = model => DocxExport.chartOptionsFromModel(model);
      const bar = options(BAR_MODEL);
      const one = options({ v: 1, kind: 'bar', axes: { category: 'Mois', value: 'Ventes' }, categories: months, series: [column('Ventes', '#2b78ae', [1, 2, 3])] });
      const dressed = options({ v: 1, kind: 'bar', labels: true, stacked: true, categories: months, series: [column('A', '#12385c', [1.5, 2, 3]), column('Cible', '#d34141', [3, 3, 3], 'line')] });
      const whole = options({ v: 1, kind: 'bar', labels: true, categories: months, series: [column('A', '#2b78ae', [1, 2, 3])] });
      const lying = options(Object.assign({}, BAR_MODEL, { horizontal: true }));
      const areas = options({ v: 1, kind: 'area', labels: true, categories: months, series: [column('A', '#8563cc', [1, 2, 3], 'area')] });
      const pie = options({ v: 1, kind: 'pie', labels: true, categories: ['a', 'b'], series: [{ name: 'Parts', color: '#2b78ae', values: [1, 2], colors: ['#2b78ae', '#fe945b'] }] });
      const donut = options({ v: 1, kind: 'donut', categories: ['a', 'b'], series: [{ name: 'Parts', color: '#12385c', values: [1, 2], colors: ['#12385c', '#a9cbe6'] }] });
      const radar = options({ v: 1, kind: 'radar', categories: ['a', 'b', 'c'], scale: { min: 0, max: 20 }, series: [column('L', '#2b78ae', [1, 2, 3], 'line')] });
      const dates = options({ v: 1, kind: 'scatter', xDates: true, axes: { category: 'Jour', value: '' }, series: [{ name: 'A', color: '#2b78ae', points: [[46091, 3], [46027, 1]] }] });
      const times = options({ v: 1, kind: 'scatter', xDates: true, series: [{ name: 'A', color: '#2b78ae', points: [[46091.5, 3]] }] });
      const line = options({ v: 1, kind: 'line', categories: months, series: [column('A', '#2b78ae', [1, 2, 3], 'line'), column('B', '#fe945b', [3, 2, 1], 'line')] });
      return {
        pass: bar.type === 'column' && bar.title === 'Ventes' && bar.legend.position === 'top' && same(bar.series.map(s => s.color), ['2B78AE', 'FE945B']) && same(bar.series.map(s => s.type), ['column', 'column']) && bar.stacking === 'none'
          && same(bar.categoryAxis, { title: 'Mois' }) && same(bar.valueAxis, {}) && same(bar.categories, months) && bar.chartArea.border === 'none'
          && one.legend === false && one.valueAxis.title === 'Ventes'
          && dressed.stacking === 'stacked' && dressed.series[0].dataLabels.position === 'center' && dressed.series[0].dataLabels.numberFormat === '#,##0.00' && dressed.series[0].dataLabels.font.color === 'FFFFFF'
          && dressed.series[1].dataLabels.position === 'above' && dressed.series[1].type === 'line' && !!dressed.series[1].markers
          && whole.series[0].dataLabels.position === 'outsideEnd' && whole.series[0].dataLabels.numberFormat === '#,##0'
          && lying.type === 'bar' && lying.categoryAxis.reverseOrder === true && lying.valueAxis.crossesAt === 'maximum' && lying.series.every(s => s.type === undefined)
          && areas.series[0].type === 'area' && areas.series[0].dataLabels.position === undefined && areas.series[0].dataLabels.value === true
          && pie.type === 'pie' && pie.legend.position === 'bottom' && same(pie.series[0].colors, ['2B78AE', 'FE945B']) && pie.dataLabels.percentage === true && pie.dataLabels.value === true && pie.dataLabels.position === 'outsideEnd' && pie.holeSize === undefined
          && donut.type === 'doughnut' && donut.holeSize === 60 && donut.dataLabels.position === undefined && donut.dataLabels.value === undefined && donut.series[0].pointLabels[0].font.color === 'FFFFFF' && donut.series[0].pointLabels[1].font.color === '000000'
          && radar.type === 'radar' && radar.filled === false && same(radar.valueAxis, { minimum: 0, maximum: 20 }) && radar.legend === false
          && dates.type === 'scatter' && dates.lines === 'none' && dates.xAxis.numberFormat === 'yyyy-mm-dd' && dates.xAxis.title === 'Jour' && same(dates.series[0].points, [{ x: 46091, y: 3 }, { x: 46027, y: 1 }]) && times.xAxis.numberFormat === 'yyyy-mm-dd hh:mm'
          && line.type === 'line' && line.legend.position === 'top',
        notes: JSON.stringify({ bar: [bar.type, bar.legend, bar.categoryAxis], dressed: dressed.series.map(s => s.dataLabels), lying: [lying.categoryAxis, lying.valueAxis], pie: pie.dataLabels, donut: [donut.holeSize, donut.series[0].pointLabels], radar: radar.valueAxis, dates: dates.xAxis }),
      };
    },
  });

  cases.push({
    id: 'chart_office_docx_every_drawing_has_its_own_id_with_two_charts_and_a_picture_and_the_alt_text_is_kept',
    description: 'Word : deux graphiques natifs et une image du même .docx ont chacun son identifiant de dessin (wp:docPr id : Word refuse un fichier où deux se répètent) ; le texte alternatif de l\'image (« Mon graphique ») devient celui du graphique, et un graphique sans texte alternatif est décrit d\'après ses données par la bibliothèque',
    run: async () => {
      const second = Object.assign({}, BAR_MODEL, { title: '', kind: 'line', series: BAR_MODEL.series.map(s => Object.assign({}, s, { type: 'line' })) });
      const noAlt = '<p><img class="editor-image" alt="" src="' + PNG() + '" style="width: 480px; height: 300px" data-layer="normal" data-wrap="inline" data-chart-office="' + JSON.stringify(second).replace(/"/g, '&quot;') + '"></p>';
      const html = drawnHtml(BAR_MODEL) + noAlt + '<p><img class="editor-image" alt="Image" src="' + PNG() + '" style="width: 120px" data-layer="normal" data-wrap="inline"></p>';
      const result = await docxOf(html);
      const props = tagsOf(result.doc, 'wp:docPr');
      const ids = props.map(p => p.getAttribute('id'));
      const described = props.map(p => p.getAttribute('descr') || '');
      return {
        pass: result.charts.length === 2 && result.media.length === 1 && props.length === 3 && new Set(ids).size === 3 && described[0] === 'Mon graphique' && described[1].length > 10 && described[1] !== 'Mon graphique',
        notes: JSON.stringify({ charts: result.charts.length, media: result.media, ids, described }),
      };
    },
  });

  cases.push({
    id: 'chart_office_docx_keeps_the_place_of_the_image_centered_in_its_own_paragraph_and_floating_beside_the_text',
    description: 'Word : un graphique centré (data-align) est seul dans son paragraphe centré, comme une image ; aligné à droite il flotte à côté du texte (wp:anchor, habillage carré) ; en calque devant le texte il est ancré à la page ; chacun reste un graphique natif',
    run: async () => {
      const centered = await docxOf(drawnHtml(BAR_MODEL, ' data-align="center"'));
      const right = await docxOf('<p>Du texte avant. ' + drawnHtml(BAR_MODEL, ' data-align="right"').replace(/^<p>|<\/p>$/g, '') + ' Du texte après.</p>');
      const layered = await docxOf(drawnHtml(BAR_MODEL, ' data-layer="front" data-page-index="0" data-page-left-pt="100" data-page-top-pt="200"'));
      const paragraphOf = (result) => { const box = chartDrawings(result.doc)[0]; let node = box; while (node && node.nodeName !== 'w:p') node = node.parentNode; return node; };
      const centeredParagraph = paragraphOf(centered);
      const jc = centeredParagraph && tagsOf(centeredParagraph, 'w:jc')[0];
      const rightBox = chartDrawings(right.doc)[0];
      const layeredBox = chartDrawings(layered.doc)[0];
      return {
        pass: centered.charts.length === 1 && !!jc && jc.getAttribute('w:val') === 'center' && tagsOf(centeredParagraph, 'w:t').length === 0
          && right.charts.length === 1 && !!rightBox && rightBox.nodeName === 'wp:anchor' && tagsOf(rightBox, 'wp:wrapSquare').length === 1
          && layered.charts.length === 1 && !!layeredBox && layeredBox.nodeName === 'wp:anchor' && layered.media.length === 0,
        notes: JSON.stringify({ centered: [centered.charts.length, jc && jc.getAttribute('w:val')], right: [right.charts.length, rightBox && rightBox.nodeName], layered: [layered.charts.length, layeredBox && layeredBox.nodeName] }),
      };
    },
  });

  cases.push({
    id: 'chart_office_docx_falls_back_to_the_png_when_word_could_not_read_the_chart',
    description: 'Word : un modèle illisible, d\'une autre version, vide, ou dont une donnée serait refusée (une part négative de secteurs) laisse l\'image PNG, telle qu\'avant ; une image sans modèle (le graphique de la page, une image ordinaire) aussi ; un graphique d\'une diapositive (dans un cadre) reste une image ; rien ne bloque l\'export',
    run: async () => {
      const bad = [
        ['texte illisible', '{bad'], ['autre version', Object.assign({}, BAR_MODEL, { v: 2 })], ['sans série', Object.assign({}, BAR_MODEL, { series: [] })],
        ['part négative', { v: 1, kind: 'pie', categories: ['a', 'b'], series: [{ name: 'Parts', color: '#2b78ae', values: [-1, 2], colors: ['#2b78ae', '#fe945b'] }] }],
        ['plus de valeurs que d\'étiquettes', { v: 1, kind: 'bar', categories: months, series: [column('A', '#2b78ae', [1, 2, 3, 4])] }],
      ];
      const warn = console.warn;
      const warned = [];
      console.warn = (...args) => { warned.push(String(args[0])); };
      const out = [];
      try {
        for (const [why, model] of bad) {
          const result = await docxOf(drawnHtml(model));
          out.push({ why, charts: result.charts.length, media: result.media.length, drawings: tagsOf(result.doc, 'w:drawing').length });
        }
        const plain = await docxOf(drawnHtml(undefined));
        out.push({ why: 'sans modèle', charts: plain.charts.length, media: plain.media.length, drawings: tagsOf(plain.doc, 'w:drawing').length });
        const framed = await docxOf(FreeFrame.html({ x: 100, y: 80, w: 300, h: 200 }, drawnHtml(BAR_MODEL)));
        out.push({ why: 'dans un cadre de diapositive', charts: framed.charts.length, media: framed.media.length, drawings: tagsOf(framed.doc, 'w:drawing').length });
      } finally { console.warn = warn; }
      return {
        pass: out.every(o => o.charts === 0 && o.media === 1 && o.drawings >= 1) && out[6].drawings === 2 && out.slice(0, 6).every(o => o.drawings === 1) && out.length === 7,
        notes: JSON.stringify({ out, warned: warned.length }),
      };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.chartOffice = cases;
})();
