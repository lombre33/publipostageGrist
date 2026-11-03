// Suite "chartOffice" - le graphique CRÉÉ (« Créer un graphique… ») en graphique NATIF de Word, de PowerPoint et d'Excel (lots 3 à 5 du module de graphiques, demande du 02/11 : « modifiable dans Word, PowerPoint et Excel »),
// extensions/graphique/chart-office.js (le modèle d'Office : les séries, leurs couleurs et leurs types, que les exports lisent sans rien savoir d'ECharts), extensions/graphique/chart-block.js (le modèle posé dans
// l'attribut `data-chart-office` de l'image, à la Lecture et à l'export) et js/docx-export.js (la `ChartRun` de docx/charts, chargée à la demande). Joué hébergé comme les suites « chart » et « chartMake » : un GFS simulé
// donne l'extension « graphique » et la source d'ECharts (cf. HOSTED_GROUPS de run-headless.mjs) ; le document de Grist est celui de dev-tests/scenarios-chart-block.js (`window.__chartFixture`). Trois parties :
//  1) le MODÈLE : ce que ChartOffice.model garde de chacune des sept premières formes (étiquettes, séries, couleurs, types, empilé, couché, valeurs affichées, titre, axes, échelle d'un radar, abscisses en dates), et ce qu'il refuse ;
//  2) le TRANSPORT : l'attribut de l'image à la Lecture (et pas sur un graphique de la page), absent du HTML, du Markdown et du PDF ;
//  3) le WORD, lu dans le .docx GÉNÉRÉ (dézippé : word/charts/chartN.xml, le classeur embarqué, word/document.xml), jamais dans les objets de docx.js : chaque forme a son élément d'Office, un graphique mêlé a ses deux
//     éléments, aucune image PNG pour un graphique natif, la taille réglée, des identifiants de dessin tous différents, et le repli sur l'image PNG quand Word ne saurait pas lire le graphique.
//  4) le POWERPOINT (lot 4) : le .pptx généré, dézippé (ppt/charts/chartN.xml, le classeur embarqué, la diapositive et ses relations), la place et la taille de l'image, un cadre de diapositive, le repli sur l'image PNG (lien, rotation, modèle refusé),
//     le moteur Word demandé seulement pour un graphique créé, et la limite de l'import (« graphique non repris »).
//  5) l'EXCEL (lot 5) : le .xlsx généré, relu (dézippé et par ExcelJS) : le graphique natif ancré sur la case de l'image, à sa taille, ses formules vers la feuille « Données des graphiques » (la dernière) dont les cellules disent ce que le
//     graphique a en cache, le dessin partagé avec des images, un classeur de plusieurs enregistrements (un bloc de données par graphique, la feuille renommée si un enregistrement a son nom, un enregistrement en échec qui n'en laisse rien),
//     et le repli sur l'image PNG (modèle illisible, archive qui refuse).
//  6) l'ENTONNOIR et la JAUGE (lot 6) : Office n'a pas ces formes, l'image PNG reste dans les trois exports et un graphique en barres posé à côté reste natif.
//  7) la CASCADE (lot 7, décision d'Antoine du 03/11 : « seulement la cascade ») : Office n'a pas la sienne que les bibliothèques savent écrire, elle sort en COLONNES EMPILÉES dont la série « Base » est invisible et dont
//     toutes les colonnes se calculent, par formules, d'une seule colonne de montants que la personne modifie : le modèle, les formules (évaluées ici, avant et après la modification d'un montant, contre le tracé que doit
//     avoir la cascade), les options de la ChartRun, le Word, le PowerPoint et l'Excel lus dans l'archive (base sans remplissage, aucune marque, classeur et cache qui disent la même chose), et les replis sur l'image.
// Le rendu réel (LibreOffice) est vérifié à part.
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
        pass: ChartOffice.model({ kind: 'treemap' }, [MONTHS, AMOUNT]) === null && ChartOffice.model(null, [MONTHS, AMOUNT]) === null && ChartOffice.model(def('bar'), []) === null
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
    const chartNames = all.filter(n => /^word\/charts\/chart\d+\.xml$/.test(n)).sort((a, b) => parseInt(a.replace(/\D/g, ''), 10) - parseInt(b.replace(/\D/g, ''), 10));
    const charts = chartNames.map(n => parseXml(parts[n]));
    return {
      zip, parts, charts, chartNames, doc: parseXml(parts['word/document.xml']),
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

  // === 4) Le PowerPoint =======================================================================================================================================
  // Le .pptx généré, dézippé : { zip, parts, slides (ppt/slides/slideN.xml parsés), charts (ppt/charts/chartN.xml parsés), media, workbooks (ppt/embeddings/*.xlsx) }. Avec `record`, l'export de la vraie chaîne
  // (les images de graphique sont résolues pour la ligne, comme à l'export de la personne) ; sans, le HTML donné tel quel (une image déjà dessinée, avec son modèle : `drawnHtml`).
  async function pptxOf(html, record) {
    await ExportEngines.ensure('pptx');
    await ExportCommon.ensureJsZipLoaded();
    const blob = record ? (await PptxExport.getPptxBlobForRecord(html, PAGE_TABLE, record, '', null, null)).blob : await PptxExport.fromHtml(html, { title: 'essai' });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const all = Object.keys(zip.files).filter(name => !zip.files[name].dir);
    const parts = {};
    for (const name of all.filter(n => /\.(xml|rels)$/.test(n))) parts[name] = await zip.file(name).async('string');
    const numbered = (pattern) => all.filter(n => pattern.test(n)).sort((a, b) => parseInt(a.replace(/\D/g, ''), 10) - parseInt(b.replace(/\D/g, ''), 10));
    const chartNames = numbered(/^ppt\/charts\/chart\d+\.xml$/);
    return {
      zip, parts, slides: numbered(/^ppt\/slides\/slide\d+\.xml$/).map(n => parseXml(parts[n])), charts: chartNames.map(n => parseXml(parts[n])), chartNames,
      media: all.filter(n => n.startsWith('ppt/media/')), workbooks: all.filter(n => /^ppt\/embeddings\/.+\.xlsx$/.test(n)),
    };
  }
  // Les objets « graphique » d'une diapositive : leur boîte en points, leur nom, leur texte alternatif, la relation qu'ils nomment.
  const chartFrames = slide => tagsOf(slide, 'p:graphicFrame').filter(frame => /\/chart$/.test((frame.getElementsByTagName('a:graphicData')[0] || { getAttribute: () => '' }).getAttribute('uri') || '')).map((frame) => {
    const box = frame.getElementsByTagName('p:xfrm')[0];
    const off = box.getElementsByTagName('a:off')[0];
    const ext = box.getElementsByTagName('a:ext')[0];
    const props = frame.getElementsByTagName('p:cNvPr')[0];
    return { x: off.getAttribute('x') / 12700, y: off.getAttribute('y') / 12700, w: ext.getAttribute('cx') / 12700, h: ext.getAttribute('cy') / 12700, name: props.getAttribute('name'), alt: props.getAttribute('descr'), rel: frame.getElementsByTagName('c:chart')[0].getAttribute('r:id'), id: props.getAttribute('id') };
  });
  const relOf = (parts, path, id) => { const doc = parseXml(parts[path] || '<x/>'); return tagsOf(doc, 'Relationship').find(rel => rel.getAttribute('Id') === id); };

  cases.push({
    id: 'chart_office_pptx_bar_is_a_native_chart_with_its_workbook_at_the_place_of_the_picture_and_no_picture',
    description: 'PowerPoint : le graphique créé (barres) est un graphique de PowerPoint (un objet « graphique » de la diapositive, sa partie ppt/charts/chart1.xml, le classeur embarqué que « Modifier les données » ouvre dans Excel, leurs types de contenu et leurs relations) à la place et à la taille de l\'image (360 x 225 pt), avec son texte alternatif, ses deux séries (nom, couleur, étiquettes, valeurs) ; aucune image PNG dans le fichier',
    run: async () => {
      const out = await pptxOf('<h1>Ventes</h1>' + drawnHtml(BAR_MODEL));
      const frames = chartFrames(out.slides[0]);
      const frame = frames[0];
      const series = out.charts[0] ? seriesOf(out.charts[0]) : [];
      const sheetRel = out.charts[0] ? relOf(out.parts, 'ppt/charts/_rels/chart1.xml.rels', tagsOf(out.charts[0], 'c:externalData')[0].getAttribute('r:id')) : null;
      const slideRel = frame ? relOf(out.parts, 'ppt/slides/_rels/slide1.xml.rels', frame.rel) : null;
      const types = parseXml(out.parts['[Content_Types].xml'] || '<x/>');
      const hasChartType = tagsOf(types, 'Override').some(o => o.getAttribute('PartName') === '/ppt/charts/chart1.xml' && /drawingml\.chart\+xml$/.test(o.getAttribute('ContentType')));
      const hasSheetType = tagsOf(types, 'Default').some(d => d.getAttribute('Extension') === 'xlsx' && /spreadsheetml\.sheet$/.test(d.getAttribute('ContentType')));
      const book = out.workbooks.length ? await JSZip.loadAsync(await out.zip.file(out.workbooks[0]).async('uint8array')) : null;
      const strings = book && book.file('xl/sharedStrings.xml') ? await book.file('xl/sharedStrings.xml').async('string') : '';
      return {
        pass: out.charts.length === 1 && frames.length === 1 && tagsOf(out.slides[0], 'p:pic').length === 0 && out.media.length === 0 && Math.abs(frame.w - 360) < 0.6 && Math.abs(frame.h - 225) < 0.6 && frame.alt === 'Mon graphique' && frame.name.indexOf(I18n.t('pptx.name.chart')) === 0
          && same(plotsOf(out.charts[0]), ['c:barChart']) && same(series.map(s => s.name), ['Paris', 'Lyon']) && same(series.map(s => s.color), ['2B78AE', 'FE945B']) && same(series[0].cats, months) && same(series[0].vals, [12, 19, 8]) && same(series[1].vals, [7, 11, 14])
          && !!slideRel && /relationships\/chart$/.test(slideRel.getAttribute('Type')) && slideRel.getAttribute('Target') === '../charts/chart1.xml'
          && !!sheetRel && /relationships\/package$/.test(sheetRel.getAttribute('Type')) && sheetRel.getAttribute('Target') === '../embeddings/Microsoft_Excel_Worksheet1.xlsx' && same(out.workbooks, ['ppt/embeddings/Microsoft_Excel_Worksheet1.xlsx'])
          && hasChartType && hasSheetType && /Paris/.test(strings) && /Lyon/.test(strings) && /Janvier/.test(strings),
        notes: JSON.stringify({ charts: out.charts.length, frames, pics: tagsOf(out.slides[0], 'p:pic').length, media: out.media, series, slideRel: slideRel && slideRel.getAttribute('Target'), sheetRel: sheetRel && sheetRel.getAttribute('Target'), workbooks: out.workbooks, hasChartType, hasSheetType, strings: strings.slice(0, 120) }),
      };
    },
  });

  cases.push({
    id: 'chart_office_pptx_every_shape_has_its_native_chart_of_office',
    description: 'PowerPoint : chacune des sept formes de la vraie chaîne (la ligne 1 du client) devient son graphique d\'Office - barres, barres couchées, courbe, aire, nuage, secteurs, anneau, radar - seul objet de la diapositive de son espèce, sans image PNG',
    run: async (h) => {
      await seed(h);
      const shapes = [
        ['bar', { values: ['Montant'] }, 'c:barChart'], ['bar', { values: ['Montant'], horizontal: true }, 'c:barChart'], ['line', { values: ['Montant'] }, 'c:lineChart'], ['area', { values: ['Montant'] }, 'c:areaChart'],
        ['scatter', { label: 'Cout', values: ['Montant'] }, 'c:scatterChart'], ['pie', { label: 'Famille', values: ['Montant'] }, 'c:pieChart'], ['donut', { label: 'Famille', values: ['Montant'] }, 'c:doughnutChart'], ['radar', { values: ['Montant', 'Cout'] }, 'c:radarChart'],
      ];
      const out = [];
      for (const [kind, extra, tag] of shapes) {
        const result = await pptxOf(docOf(madeHtml(def(kind, extra), 'linked')), recordOf(1));
        const dir = result.charts[0] && tagsOf(result.charts[0], 'c:barDir')[0];
        out.push({ kind: kind + (extra.horizontal ? ' couché' : ''), tag, plots: result.charts[0] ? plotsOf(result.charts[0]) : [], charts: result.charts.length, frames: chartFrames(result.slides[0]).length, pics: tagsOf(result.slides[0], 'p:pic').length, media: result.media.length, dir: dir ? dir.getAttribute('val') : null });
      }
      return {
        pass: out.every(o => o.charts === 1 && o.frames === 1 && o.pics === 0 && o.media === 0 && same(o.plots, [o.tag])) && out[0].dir === 'col' && out[1].dir === 'bar',
        notes: JSON.stringify(out),
      };
    },
  });

  cases.push({
    id: 'chart_office_pptx_chart_in_a_slide_frame_keeps_its_place_in_the_frame_and_each_chart_has_its_own_part',
    description: 'PowerPoint : le graphique d\'un cadre de diapositive est un graphique de PowerPoint DANS le cadre (entre ses bords), deux graphiques (l\'un dans le texte, l\'autre dans un cadre) ont chacun leur partie, leur classeur et leur identifiant d\'objet, et une diapositive sans graphique créé n\'a rien de tout cela',
    run: async () => {
      const small = drawnHtml(BAR_MODEL).replace('width: 480px; height: 300px', 'width: 240px; height: 150px');
      const html = '<h1>Texte</h1>' + drawnHtml(BAR_MODEL) + '<div class="page-break-marker"></div><h2>Cadre</h2>' + FreeFrame.html({ x: 60, y: 120, w: 340, h: 230 }, small) + '<div class="page-break-marker"></div><h2>Rien</h2><p>Un texte seul.</p>';
      const out = await pptxOf(html);
      const first = chartFrames(out.slides[0]);
      const second = chartFrames(out.slides[1]);
      const frame = second[0];
      const names = Object.keys(out.parts).filter(n => /^ppt\/charts\/chart\d+\.xml$/.test(n)).sort();
      const sheets = Object.keys(out.parts).filter(n => /^ppt\/charts\/_rels\//.test(n)).map(n => /Target="([^"]+)"/.exec(out.parts[n])[1]).sort();
      return {
        pass: out.charts.length === 2 && first.length === 1 && second.length === 1 && chartFrames(out.slides[2]).length === 0 && out.media.length === 0 && out.workbooks.length === 2
          && Math.abs(frame.w - 180) < 0.6 && Math.abs(frame.h - 112.5) < 0.6 && frame.x >= 60 - 0.5 && frame.x + frame.w <= 400.5 && frame.y >= 120 - 0.5 && frame.y + frame.h <= 350.5
          && same(names, ['ppt/charts/chart1.xml', 'ppt/charts/chart2.xml']) && same(sheets, ['../embeddings/Microsoft_Excel_Worksheet1.xlsx', '../embeddings/Microsoft_Excel_Worksheet2.xlsx'])
          && relOf(out.parts, 'ppt/slides/_rels/slide1.xml.rels', first[0].rel).getAttribute('Target') !== relOf(out.parts, 'ppt/slides/_rels/slide2.xml.rels', second[0].rel).getAttribute('Target'),
        notes: JSON.stringify({ first, second, names, sheets, media: out.media, workbooks: out.workbooks }),
      };
    },
  });

  cases.push({
    id: 'chart_office_pptx_keeps_the_png_for_a_link_a_turn_a_bad_model_and_an_image_without_model',
    description: 'PowerPoint : l\'image PNG sort telle qu\'avant quand PowerPoint ne saurait pas garder le graphique - une image à lien (PowerPoint n\'en accepte pas sur un graphique), l\'image d\'un cadre qui mène quelque part, un cadre tourné (il ne tourne pas un graphique), un modèle illisible, d\'une autre version ou refusé (une part négative) - et pour une image sans modèle',
    run: async () => {
      const warn = console.warn;
      console.warn = () => {};
      const out = [];
      try {
        const linked = drawnHtml(BAR_MODEL).replace('<p>', '<p><a href="https://example.org/">').replace('</p>', '</a></p>');
        const small = drawnHtml(BAR_MODEL).replace('width: 480px; height: 300px', 'width: 240px; height: 150px');
        const negative = { v: 1, kind: 'pie', categories: ['a', 'b'], series: [{ name: 'Parts', color: '#2b78ae', values: [-1, 2], colors: ['#2b78ae', '#fe945b'] }] };
        const cases4 = [
          ['lien', linked], ['cadre à lien', FreeFrame.html({ x: 60, y: 120, w: 340, h: 230, link: 'https://example.org/' }, small)], ['cadre tourné', FreeFrame.html({ x: 60, y: 120, w: 340, h: 230, rot: 30 }, small)],
          ['texte illisible', drawnHtml('{bad')], ['autre version', drawnHtml(Object.assign({}, BAR_MODEL, { v: 2 }))], ['part négative', drawnHtml(negative)], ['sans modèle', drawnHtml(undefined)],
        ];
        for (const [why, html] of cases4) {
          const result = await pptxOf(html);
          out.push({ why, charts: result.charts.length, frames: chartFrames(result.slides[0]).length, pics: tagsOf(result.slides[0], 'p:pic').length, media: result.media.length });
        }
      } finally { console.warn = warn; }
      return {
        pass: out.length === 7 && out.every(o => o.charts === 0 && o.frames === 0 && o.pics === 1 && o.media === 1),
        notes: JSON.stringify(out),
      };
    },
  });

  cases.push({
    id: 'chart_office_pptx_asks_for_the_word_engine_only_for_a_presentation_with_a_created_chart',
    description: 'PowerPoint : le moteur Word (qui fabrique le graphique) n\'est demandé que pour une présentation qui porte un graphique créé : du texte, une image ordinaire ou un graphique de la page n\'en veulent pas ; un graphique créé le demande, pour un deuxième aussi sans rien de plus',
    run: async () => {
      const asked = [];
      const original = ExportEngines.ensure;
      ExportEngines.ensure = function (...engines) { asked.push(...engines.flat()); return original.apply(this, arguments); };
      try {
        await pptxOf('<h1>Texte</h1><p>Un paragraphe.</p>' + drawnHtml(undefined));
        const plain = asked.filter(name => name === 'docx').length;
        const one = await pptxOf(drawnHtml(BAR_MODEL));
        const afterOne = asked.filter(name => name === 'docx').length;
        return {
          pass: plain === 0 && afterOne >= 1 && one.charts.length === 1,
          notes: JSON.stringify({ plain, afterOne, asked }),
        };
      } finally { ExportEngines.ensure = original; }
    },
  });

  cases.push({
    id: 'chart_office_pptx_reimport_reports_the_exported_chart_as_not_imported',
    description: 'PowerPoint : réimporté, un graphique exporté est compté « graphique non repris » par le rapport de l\'import (l\'import ne lit pas encore les graphiques de PowerPoint : une limite dite, pas une perte silencieuse), et la diapositive garde son titre',
    run: async () => {
      await ExportEngines.ensure('pptxImport');
      const exported = await PptxExport.fromHtml('<h1>Ventes</h1>' + drawnHtml(BAR_MODEL), { title: 'essai' });
      const r = await PptxImport.fromBuffer(await exported.arrayBuffer());
      return {
        pass: r.report.some(line => line.key === 'charts' && line.n === 1) && /Ventes/.test(r.html),
        notes: JSON.stringify({ report: r.report, html: String(r.html).slice(0, 160) }),
      };
    },
  });

  // === 5) L'Excel ==============================================================================================================================================
  // Le .xlsx généré, relu : { zip, parts (les textes XML par nom), book (ExcelJS : les cellules, comme le lira Excel), sheets (les noms des feuilles, dans l'ordre), charts (xl/charts/chartN.xml, parsés), media (xl/media/*),
  // drawings (xl/drawings/drawingN.xml, parsés) }.
  const byNumber = (a, b) => parseInt(a.replace(/\D/g, ''), 10) - parseInt(b.replace(/\D/g, ''), 10);
  async function readXlsx(blob) {
    await ExportCommon.ensureJsZipLoaded();
    const buffer = await blob.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);
    const all = Object.keys(zip.files).filter(name => !zip.files[name].dir);
    const parts = {};
    for (const name of all.filter(n => /\.(xml|rels)$/.test(n))) parts[name] = await zip.file(name).async('string');
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(buffer);
    const numbered = pattern => all.filter(n => pattern.test(n)).sort(byNumber);
    return {
      zip, parts, book, sheets: book.worksheets.map(sheet => sheet.name),
      charts: numbered(/^xl\/charts\/chart\d+\.xml$/).map(n => parseXml(parts[n])), media: all.filter(n => n.startsWith('xl/media/')),
      drawings: numbered(/^xl\/drawings\/drawing\d+\.xml$/).map(n => parseXml(parts[n])),
    };
  }
  async function xlsxOf(html, record, filenameTemplate) {
    await ExportEngines.ensure('xlsx');
    await XlsxExport.ensureExcelLibLoaded();
    const { blob } = await XlsxExport.getXlsxBlobForRecord(html, record ? PAGE_TABLE : null, record || {}, filenameTemplate || '', {});
    return readXlsx(blob);
  }
  // Une ligne de tableau de grille, une case de 150 x 140 px par bloc : le graphique de la case B se pose sur la colonne B, ligne 1.
  const gridHtml = (...cells) => '<table style="width: ' + cells.length * 150 + 'px;"><colgroup>' + cells.map(() => '<col style="width: 150px;">').join('') + '</colgroup><tbody><tr data-row-height="140" style="height: 140px">'
    + cells.map(cell => '<td colwidth="150"><p>' + cell + '</p></td>').join('') + '</tr></tbody></table>';
  const SMALL = 'width: 140px; height: 90px';
  const smallChart = model => drawnHtml(model).replace(/^<p>|<\/p>$/g, '').replace('width: 480px; height: 300px', SMALL);
  const plainPicture = '<img class="editor-image" alt="Une image" src="' + 'DATA' + '" style="width: 60px; height: 40px" data-layer="normal" data-wrap="inline">';
  // Les graphiques posés dans le dessin d'une feuille : la boîte en px, l'ancre (colonne et ligne, depuis 0), le nom, le texte alternatif, la relation qu'ils nomment.
  const sheetCharts = drawing => tagsOf(drawing, 'xdr:oneCellAnchor').filter(a => a.getElementsByTagName('xdr:graphicFrame').length).map((anchor) => {
    const props = anchor.getElementsByTagName('xdr:cNvPr')[0];
    const ext = anchor.getElementsByTagName('xdr:ext')[0];
    return {
      col: Number(anchor.getElementsByTagName('xdr:col')[0].textContent), row: Number(anchor.getElementsByTagName('xdr:row')[0].textContent), w: ext.getAttribute('cx') / 9525, h: ext.getAttribute('cy') / 9525,
      name: props.getAttribute('name'), alt: props.getAttribute('descr'), id: props.getAttribute('id'), rel: anchor.getElementsByTagName('c:chart')[0].getAttribute('r:id'),
    };
  });
  const letterNumber = letters => letters.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  // Les cellules qu'une formule `c:f` vise dans le classeur relu (une colonne, ou une seule cellule) : « 'Données des graphiques'!$B$2:$B$4 » -> les trois valeurs ; null si la formule ne vise pas une feuille du classeur.
  function cellsOf(book, formula) {
    const m = /^'((?:[^']|'')+)'!\$([A-Z]+)\$(\d+)(?::\$([A-Z]+)\$(\d+))?$/.exec(formula);
    const sheet = m && book.getWorksheet(m[1].replace(/''/g, '\''));
    if (!sheet || (m[4] && m[4] !== m[2])) return null;
    const out = [];
    for (let row = Number(m[3]); row <= Number(m[5] || m[3]); row++) out.push(sheet.getCell(row, letterNumber(m[2])).value);
    return out;
  }
  // Les formules d'un graphique qui ne tiennent pas : celles qui ne visent aucune feuille du classeur, ou dont les cellules ne disent pas ce que le graphique a en cache (nom, étiquettes, valeurs).
  function brokenFormulas(book, chart) {
    return tagsOf(chart, 'c:f').filter((f) => {
      const cache = Array.from(f.parentNode.children).find(child => /Cache$/.test(child.nodeName));
      if (!cache) return true;
      const cached = new Map(tagsOf(cache, 'c:pt').map(pt => [Number(pt.getAttribute('idx')), pt.getElementsByTagName('c:v')[0].textContent]));
      const cells = cellsOf(book, f.textContent);
      return !cells || cells.some((value, i) => (cached.has(i) ? String(value) !== cached.get(i) : (value !== null && value !== undefined && value !== '')));
    }).map(f => f.textContent);
  }
  // Les lignes de titre (« Graphique 1 », « Graphique 2 - Ventes ») de la feuille des données.
  const chartHeads = (sheet) => { const out = []; sheet.eachRow({ includeEmpty: false }, (row, n) => { if (String(sheet.getCell(n, 1).value).indexOf(I18n.t('xlsx.chart.name') + ' ') === 0) out.push(n); }); return out; };

  cases.push({
    id: 'chart_office_xlsx_bar_is_a_native_chart_on_its_cell_and_its_data_are_in_the_last_sheet',
    description: 'Excel (grille) : le graphique créé de la case B1 (140 x 90 px) est un graphique natif d\'Excel posé sur cette case, à cette taille, sans image PNG ; ses formules visent la feuille « Données des graphiques », la dernière du classeur, dont les cellules disent ce que le graphique a en cache ; une ligne sans vente n\'a ni graphique ni feuille de données',
    run: async (h) => {
      await seed(h);
      const html = gridHtml('Avant', madeHtml(def('bar', { values: ['Montant', 'Cout'] }), 'linked', SMALL));
      const filled = await xlsxOf(html, recordOf(1));
      const empty = await xlsxOf(html, NO_SALE);
      const found = filled.drawings[0] ? sheetCharts(filled.drawings[0]) : [];
      const chart = filled.charts[0];
      const series = chart ? seriesOf(chart) : [];
      const data = filled.book.worksheets[filled.book.worksheets.length - 1];
      const types = parseXml(filled.parts['[Content_Types].xml'] || '<x/>');
      const overrides = tagsOf(types, 'Override').map(o => o.getAttribute('PartName') + ' ' + o.getAttribute('ContentType'));
      const sheetRel = /<drawing r:id="([^"]+)"/.exec(filled.parts['xl/worksheets/sheet1.xml'] || '');
      const toDrawing = sheetRel && relOf(filled.parts, 'xl/worksheets/_rels/sheet1.xml.rels', sheetRel[1]);
      const toChart = found[0] && relOf(filled.parts, 'xl/drawings/_rels/drawing1.xml.rels', found[0].rel);
      return {
        pass: filled.charts.length === 1 && filled.media.length === 0 && filled.drawings.length === 1 && found.length === 1 && found[0].col === 1 && found[0].row === 0 && Math.abs(found[0].w - 140) < 0.6 && Math.abs(found[0].h - 90) < 0.6
          && found[0].name === I18n.t('xlsx.chart.name') + ' 1' && found[0].alt === 'Graphique'
          && same(plotsOf(chart), ['c:barChart']) && same(series.map(s => s.name), ['Montant', 'Cout']) && same(series.map(s => s.color), ['2B78AE', 'FE945B']) && same(series[0].cats, ['Mars', 'Janvier']) && same(series[0].vals, [300, 100]) && same(series[1].vals, [120, 60])
          && tagsOf(chart, 'c:externalData').length === 0 && same(brokenFormulas(filled.book, chart), [])
          && filled.sheets.length === 2 && filled.sheets[1] === I18n.t('xlsx.chart.sheet') && data.getCell(1, 1).value === I18n.t('xlsx.chart.name') + ' 1' && data.getCell(2, 2).value === 'Montant'
          && overrides.indexOf('/xl/charts/chart1.xml application/vnd.openxmlformats-officedocument.drawingml.chart+xml') >= 0 && overrides.indexOf('/xl/drawings/drawing1.xml application/vnd.openxmlformats-officedocument.drawing+xml') >= 0
          && !!toDrawing && toDrawing.getAttribute('Target') === '../drawings/drawing1.xml' && /relationships\/drawing$/.test(toDrawing.getAttribute('Type'))
          && !!toChart && toChart.getAttribute('Target') === '../charts/chart1.xml' && /relationships\/chart$/.test(toChart.getAttribute('Type'))
          && empty.charts.length === 0 && empty.media.length === 0 && empty.drawings.length === 0 && empty.sheets.length === 1 && empty.sheets[0] !== I18n.t('xlsx.chart.sheet'),
        notes: JSON.stringify({ charts: filled.charts.length, media: filled.media, found, series, sheets: filled.sheets, broken: chart && brokenFormulas(filled.book, chart), head: [data.getCell(1, 1).value, data.getCell(2, 2).value], overrides, toDrawing: toDrawing && toDrawing.getAttribute('Target'), toChart: toChart && toChart.getAttribute('Target'), empty: [empty.charts.length, empty.media.length, empty.drawings.length, empty.sheets] }),
      };
    },
  });

  cases.push({
    id: 'chart_office_xlsx_every_shape_has_its_native_chart_of_office_with_formulas_that_hold',
    description: 'Excel : chacune des sept formes de la vraie chaîne (la ligne 1 du client) devient son graphique d\'Office dans le classeur - barres, barres couchées, courbe, aire, nuage, secteurs, anneau, radar - sans image PNG, et les cellules que visent ses formules disent ce que le graphique a en cache',
    run: async (h) => {
      await seed(h);
      const shapes = [
        ['bar', { values: ['Montant'] }, 'c:barChart'], ['bar', { values: ['Montant'], horizontal: true }, 'c:barChart'], ['line', { values: ['Montant'] }, 'c:lineChart'], ['area', { values: ['Montant'] }, 'c:areaChart'],
        ['scatter', { label: 'Cout', values: ['Montant'] }, 'c:scatterChart'], ['pie', { label: 'Famille', values: ['Montant'] }, 'c:pieChart'], ['donut', { label: 'Famille', values: ['Montant'] }, 'c:doughnutChart'], ['radar', { values: ['Montant', 'Cout'] }, 'c:radarChart'],
      ];
      const out = [];
      for (const [kind, extra, tag] of shapes) {
        const result = await xlsxOf(gridHtml(madeHtml(def(kind, extra), 'linked', SMALL)), recordOf(1));
        const dir = result.charts[0] && tagsOf(result.charts[0], 'c:barDir')[0];
        out.push({ kind: kind + (extra.horizontal ? ' couché' : ''), tag, plots: result.charts[0] ? plotsOf(result.charts[0]) : [], charts: result.charts.length, media: result.media.length, sheets: result.sheets.length, dir: dir && dir.getAttribute('val'), broken: result.charts[0] ? brokenFormulas(result.book, result.charts[0]) : ['aucun graphique'] });
      }
      return {
        pass: out.every(o => o.charts === 1 && o.media === 0 && o.sheets === 2 && same(o.plots, [o.tag]) && o.broken.length === 0) && out[0].dir === 'col' && out[1].dir === 'bar',
        notes: JSON.stringify(out),
      };
    },
  });

  cases.push({
    id: 'chart_office_xlsx_a_chart_and_pictures_share_the_drawing_of_a_sheet_without_clashing',
    description: 'Excel : une feuille qui porte des images ET un graphique créé garde ses images (celles d\'ExcelJS) et reçoit le graphique dans le même dessin : une ancre par objet, des identifiants et des relations tous différents, la partie du graphique à côté de ses deux images',
    run: async () => {
      const picture = plainPicture.replace('DATA', PNG());
      const out = await xlsxOf(gridHtml(picture, smallChart(BAR_MODEL), picture));
      const drawing = out.drawings[0];
      const anchors = drawing ? tagsOf(drawing, 'xdr:oneCellAnchor') : [];
      const ids = anchors.map(a => a.getElementsByTagName('xdr:cNvPr')[0].getAttribute('id'));
      const rels = parseXml(out.parts['xl/drawings/_rels/drawing1.xml.rels'] || '<x/>');
      const relIds = tagsOf(rels, 'Relationship').map(r => r.getAttribute('Id'));
      const targets = tagsOf(rels, 'Relationship').map(r => r.getAttribute('Target'));
      const found = drawing ? sheetCharts(drawing) : [];
      return {
        pass: out.drawings.length === 1 && out.charts.length === 1 && out.media.length === 2 && anchors.length === 3 && tagsOf(drawing, 'xdr:pic').length === 2 && found.length === 1 && found[0].col === 1
          && new Set(ids).size === 3 && new Set(relIds).size === 3 && targets.filter(t => /charts\/chart1\.xml$/.test(t)).length === 1 && targets.filter(t => /media\//.test(t)).length === 2 && out.sheets.length === 2,
        notes: JSON.stringify({ drawings: out.drawings.length, charts: out.charts.length, media: out.media, anchors: anchors.length, ids, relIds, targets, found, sheets: out.sheets }),
      };
    },
  });

  // Un classeur de plusieurs enregistrements (« les valeurs de la table dans un seul classeur ») : `list` : les [enregistrement, nom de sa feuille] ; `again` écrit le fichier une seconde fois.
  async function workbookOf(html, list) {
    await ExportEngines.ensure('xlsx');
    await XlsxExport.ensureExcelLibLoaded();
    const book = await XlsxExport.createSingleWorkbook({});
    const failures = [];
    for (const [record, name] of list) {
      try { await book.appendRecord(html, PAGE_TABLE, record, name || '', null, null); } catch (e) { failures.push(String(e && e.message || e)); }
    }
    const blob = await book.toBlob();
    return Object.assign(await readXlsx(blob), { failures, again: async () => readXlsx(await book.toBlob()) });
  }

  cases.push({
    id: 'chart_office_xlsx_one_workbook_for_several_records_has_one_data_sheet_with_a_block_per_chart_and_renames_it_if_a_record_has_its_name',
    description: 'Excel (un seul classeur) : deux enregistrements, deux feuilles, chacune son graphique ; une seule feuille de données, la dernière, avec un bloc par graphique (« Graphique 1 », « Graphique 2 ») dont les lignes ne se recouvrent pas ; un enregistrement qui porte déjà le nom de cette feuille la laisse devenir « … (2) » ; écrit deux fois, le classeur donne deux fichiers pareils',
    run: async (h) => {
      await seed(h);
      const html = gridHtml('Avant', madeHtml(def('bar', { values: ['Montant', 'Cout'] }), 'linked', SMALL));
      const two = await workbookOf(html, [[recordOf(1), 'Fiche un'], [recordOf(2), 'Fiche deux']]);
      const clash = await workbookOf(html, [[recordOf(1), I18n.t('xlsx.chart.sheet')], [recordOf(2), 'Fiche deux']]);
      const dataSheet = two.book.worksheets[two.book.worksheets.length - 1];
      const heads = chartHeads(dataSheet);
      const refs = chart => tagsOf(chart, 'c:f').map(f => /\$(\d+)(?::\$[A-Z]+\$(\d+))?$/.exec(f.textContent)).map(m => [Number(m[1]), Number(m[2] || m[1])]);
      const rangesOf = chart => { const all = refs(chart); return [Math.min(...all.map(r => r[0])), Math.max(...all.map(r => r[1]))]; };
      const [first, second] = [rangesOf(two.charts[0]), rangesOf(two.charts[1])];
      const sheetNames = clash.sheets;
      const again = await two.again();
      return {
        pass: two.failures.length === 0 && same(two.sheets.slice(0, 2), ['Fiche un', 'Fiche deux']) && two.sheets.length === 3 && two.sheets[2] === I18n.t('xlsx.chart.sheet') && two.charts.length === 2 && two.media.length === 0 && two.drawings.length === 2
          && heads.length === 2 && dataSheet.getCell(heads[0], 1).value === I18n.t('xlsx.chart.name') + ' 1' && dataSheet.getCell(heads[1], 1).value === I18n.t('xlsx.chart.name') + ' 2' && first[1] < heads[1] && second[0] > heads[1] && first[1] < second[0]
          && two.charts.every(chart => brokenFormulas(two.book, chart).length === 0)
          && same(sheetNames, [I18n.t('xlsx.chart.sheet'), 'Fiche deux', I18n.t('xlsx.chart.sheet') + ' (2)']) && clash.charts.every(chart => brokenFormulas(clash.book, chart).length === 0)
          && again.charts.length === 2 && again.sheets.length === 3 && again.media.length === 0,
        notes: JSON.stringify({ failures: two.failures, sheets: two.sheets, charts: two.charts.length, heads, first, second, clash: sheetNames, again: [again.charts.length, again.sheets] }),
      };
    },
  });

  cases.push({
    id: 'chart_office_xlsx_a_record_that_fails_leaves_no_chart_and_no_data_behind',
    description: 'Excel (un seul classeur) : un enregistrement qui échoue en route (son image suivante ne s\'écrit pas) ne laisse ni sa feuille, ni son graphique, ni ses cellules de données dans le classeur ; le suivant garde le sien (un seul bloc dans la feuille de données), sans image dans son classeur',
    run: async (h) => {
      await seed(h);
      const picture = plainPicture.replace('DATA', PNG());
      const bad = gridHtml(madeHtml(def('bar', { values: ['Montant'] }), 'linked', SMALL), picture);
      const good = gridHtml(madeHtml(def('line', { values: ['Montant'] }), 'linked', SMALL));
      const original = ExcelJS.Workbook.prototype.addImage;
      const warn = console.warn;
      console.warn = () => {};
      let out;
      try {
        // Toute image qui se pose sur une feuille échoue : l'enregistrement « bad » casse sur la sienne, après son graphique ; « good » n'a que son graphique, qui ne demande aucune image.
        ExcelJS.Workbook.prototype.addImage = function () { throw new Error('essai : image refusée'); };
        await ExportEngines.ensure('xlsx');
        await XlsxExport.ensureExcelLibLoaded();
        const book = await XlsxExport.createSingleWorkbook({});
        const failures = [];
        for (const [html, record, name] of [[bad, recordOf(1), 'Cassée'], [good, recordOf(2), 'Bonne']]) {
          try { await book.appendRecord(html, PAGE_TABLE, record, name, null, null); } catch (e) { failures.push(String(e && e.message || e)); }
        }
        out = Object.assign(await readXlsx(await book.toBlob()), { failures });
      } finally { ExcelJS.Workbook.prototype.addImage = original; console.warn = warn; }
      const dataSheet = out.book.worksheets[out.book.worksheets.length - 1];
      const heads = chartHeads(dataSheet);
      return {
        pass: out.failures.length === 1 && /image refusée/.test(out.failures[0]) && same(out.sheets, ['Bonne', I18n.t('xlsx.chart.sheet')]) && out.charts.length === 1 && same(plotsOf(out.charts[0]), ['c:lineChart']) && out.media.length === 0
          && heads.length === 1 && dataSheet.getCell(heads[0], 1).value === I18n.t('xlsx.chart.name') + ' 1' && heads[0] === 1 && brokenFormulas(out.book, out.charts[0]).length === 0,
        notes: JSON.stringify({ failures: out.failures, sheets: out.sheets, charts: out.charts.length, media: out.media, heads }),
      };
    },
  });

  cases.push({
    id: 'chart_office_xlsx_keeps_the_png_when_excel_could_not_read_the_chart_and_when_the_archive_refuses_it',
    description: 'Excel : l\'image PNG reste (aucune partie de graphique, aucune feuille de données) quand le graphique n\'a pas de modèle lisible - texte illisible, autre version, part négative, image sans modèle - et quand l\'archive refuse d\'écrire les parties du graphique (la feuille des données s\'en va, les images prennent la place)',
    run: async () => {
      const warn = console.warn;
      console.warn = () => {};
      const out = [];
      try {
        const negative = { v: 1, kind: 'pie', categories: ['a', 'b'], series: [{ name: 'Parts', color: '#2b78ae', values: [-1, 2], colors: ['#2b78ae', '#fe945b'] }] };
        const cases5 = [['texte illisible', drawnHtml('{bad')], ['autre version', drawnHtml(Object.assign({}, BAR_MODEL, { v: 2 }))], ['part négative', drawnHtml(negative)], ['sans modèle', drawnHtml(undefined)]];
        for (const [why, html] of cases5) {
          const result = await xlsxOf(gridHtml(html.replace(/^<p>|<\/p>$/g, '').replace('width: 480px; height: 300px', SMALL)));
          out.push({ why, charts: result.charts.length, media: result.media.length, sheets: result.sheets.length, pics: result.drawings[0] ? tagsOf(result.drawings[0], 'xdr:pic').length : 0 });
        }
        // L'archive refuse : le seul `generateAsync` du JSZip de la page est celui de l'écriture des graphiques (ExcelJS et docx ont leur JSZip).
        const original = JSZip.prototype.generateAsync;
        let refused = 0;
        JSZip.prototype.generateAsync = function () { refused++; return Promise.reject(new Error('essai : archive refusée')); };
        try {
          const result = await xlsxOf(gridHtml(smallChart(BAR_MODEL)));
          out.push({ why: 'archive refusée', charts: result.charts.length, media: result.media.length, sheets: result.sheets.length, pics: result.drawings[0] ? tagsOf(result.drawings[0], 'xdr:pic').length : 0, refused });
        } finally { JSZip.prototype.generateAsync = original; }
      } finally { console.warn = warn; }
      return {
        pass: out.length === 5 && out.every(o => o.charts === 0 && o.media === 1 && o.sheets === 1 && o.pics === 1) && out[4].refused === 1,
        notes: JSON.stringify(out),
      };
    },
  });

  cases.push({
    id: 'chart_office_xlsx_asks_for_the_word_engine_only_for_a_workbook_with_a_created_chart',
    description: 'Excel : le moteur Word (qui fabrique le graphique) n\'est demandé que pour un classeur qui porte un graphique créé : du texte, un tableau, une image ordinaire n\'en veulent pas (et n\'ont pas de feuille de données) ; un graphique créé le demande',
    run: async () => {
      const asked = [];
      const original = ExportEngines.ensure;
      ExportEngines.ensure = function (...engines) { asked.push(...engines.flat()); return original.apply(this, arguments); };
      try {
        const picture = plainPicture.replace('DATA', PNG());
        const plain = await xlsxOf(gridHtml('Du texte', picture));
        const wordForPlain = asked.filter(name => name === 'docx').length;
        const one = await xlsxOf(gridHtml(smallChart(BAR_MODEL)));
        const wordForOne = asked.filter(name => name === 'docx').length;
        return {
          pass: wordForPlain === 0 && plain.charts.length === 0 && plain.sheets.length === 1 && plain.media.length === 1 && wordForOne >= 1 && one.charts.length === 1 && one.sheets.length === 2,
          notes: JSON.stringify({ wordForPlain, wordForOne, plain: [plain.charts.length, plain.sheets, plain.media], one: [one.charts.length, one.sheets] }),
        };
      } finally { ExportEngines.ensure = original; }
    },
  });

  cases.push({
    id: 'chart_office_xlsx_special_characters_in_a_sheet_name_and_a_title_keep_the_file_well_formed',
    description: 'Excel : une feuille dont le nom porte & \' " et un graphique dont le titre porte & < > « » donnent un classeur bien formé : le graphique est sur la bonne feuille, le titre est dans la feuille des données, les formules tiennent',
    run: async () => {
      const model = Object.assign({}, BAR_MODEL, { title: 'Ventes & « Q1 » <essai>' });
      const out = await xlsxOf(gridHtml(smallChart(model)), null, 'R&D l\'été "un"');
      const data = out.book.worksheets[out.book.worksheets.length - 1];
      const found = out.drawings[0] ? sheetCharts(out.drawings[0]) : [];
      return {
        pass: out.charts.length === 1 && found.length === 1 && out.sheets.length === 2 && out.sheets[0].indexOf('R&D l\'été') === 0 && data.getCell(1, 1).value === I18n.t('xlsx.chart.name') + ' 1 - Ventes & « Q1 » <essai>' && brokenFormulas(out.book, out.charts[0]).length === 0,
        notes: JSON.stringify({ sheets: out.sheets, found, head: data.getCell(1, 1).value }),
      };
    },
  });

  // === 6) L'entonnoir et la jauge (lot 6) =====================================================================================================================
  // Office n'a pas ces deux formes : ChartOffice.model dit « pas de modèle » (null), l'image ne porte pas `data-chart-office` et Word, PowerPoint et Excel gardent l'image PNG, telle qu'avant ; un graphique en barres
  // posé à côté reste un graphique natif (le moteur de Word ne se charge que pour lui, mais l'image de l'autre est gardée). La cascade, elle, a son modèle depuis le lot 7 (section 7).
  const LOT6 = [['funnel', { values: ['Montant'] }], ['gauge', { values: ['Montant'], max: 500 }]];

  cases.push({
    id: 'chart_office_funnel_and_gauge_have_no_office_model_and_stay_a_picture_in_word_powerpoint_and_excel',
    description: 'Entonnoir, jauge : ChartOffice.model ne les connaît pas (null), l\'image de la Lecture ne porte pas `data-chart-office` et reste un PNG ; le .docx, le .pptx et le classeur n\'ont aucun graphique natif (ni pièce de graphique, ni classeur embarqué, ni feuille de données) mais UNE image PNG chacun',
    run: async (h) => {
      await seed(h);
      const out = [];
      for (const [kind, extra] of LOT6) {
        const html = docOf(madeHtml(def(kind, extra), 'linked'));
        const content = await renderReader(html, recordOf(1));
        const img = content.querySelector('img');
        const word = await docxOf(html, recordOf(1));
        const slides = await pptxOf(html, recordOf(1));
        const book = await xlsxOf(gridHtml(madeHtml(def(kind, extra), 'linked', SMALL)), recordOf(1));
        out.push({
          kind, model: ChartOffice.model(def(kind, extra), [MONTHS, AMOUNT]), office: img ? img.getAttribute('data-chart-office') : 'aucune image', png: !!img && (img.getAttribute('src') || '').startsWith('data:image/png;base64,'),
          word: [word.charts.length, word.workbooks.length, word.media.length], pptx: [slides.charts.length, slides.workbooks.length, slides.media.length], xlsx: [book.charts.length, book.sheets.length, book.media.length],
        });
      }
      hideReader();
      return {
        pass: out.length === 2 && out.every(o => o.model === null && o.office === null && o.png && same(o.word, [0, 0, 1]) && same(o.pptx, [0, 0, 1]) && same(o.xlsx, [0, 1, 1])),
        notes: JSON.stringify(out),
      };
    },
  });

  cases.push({
    id: 'chart_office_a_bar_chart_beside_a_funnel_stays_native_while_the_funnel_keeps_its_picture',
    description: 'Un entonnoir et un graphique en barres dans le même document : Word, PowerPoint et Excel ont UN graphique natif (les barres, avec son classeur) et UNE image PNG (l\'entonnoir) ; le classeur a sa feuille de données',
    run: async (h) => {
      await seed(h);
      const funnel = madeHtml(def('funnel', { values: ['Montant'] }), 'linked');
      const bars = madeHtml(def('bar', { values: ['Montant'] }), 'linked');
      const html = docOf(funnel, bars);
      const word = await docxOf(html, recordOf(1));
      const slides = await pptxOf(html, recordOf(1));
      const book = await xlsxOf(gridHtml(madeHtml(def('funnel', { values: ['Montant'] }), 'linked', SMALL), madeHtml(def('bar', { values: ['Montant'] }), 'linked', SMALL)), recordOf(1));
      return {
        pass: word.charts.length === 1 && word.media.length === 1 && same(plotsOf(word.charts[0]), ['c:barChart']) && word.workbooks.length === 1
          && slides.charts.length === 1 && slides.media.length === 1 && slides.workbooks.length === 1
          && book.charts.length === 1 && book.media.length === 1 && book.sheets.length === 2,
        notes: JSON.stringify({ word: [word.charts.length, word.media.length, word.workbooks.length], pptx: [slides.charts.length, slides.media.length, slides.workbooks.length], xlsx: [book.charts.length, book.media.length, book.sheets] }),
      };
    },
  });

  // === 7) La cascade (lot 7) ===================================================================================================================================
  // Office n'a pas de cascade que les bibliothèques sachent écrire : elle sort en colonnes empilées (une série « Base » sans remplissage porte chaque marche à sa hauteur) et toutes les colonnes se calculent, par formules,
  // de la seule colonne des montants du classeur (« Modifier les données » : changer un montant redessine la cascade). Les essais lisent l'archive générée, jamais les objets des bibliothèques, et ÉVALUENT les formules
  // (un petit évaluateur ci-dessous) : ce qu'Excel dessinera du classeur est comparé au tracé que doit avoir la cascade, avant et après la modification d'un montant.
  const NAMES = ['Chiffre d\'affaires', 'Remises', 'Coûts de production', 'Frais généraux', 'Autres frais', 'Divers'];
  // Le modèle d'une cascade de ces montants (avec sa marche « Total » sauf `total: false`), `names` : le nom des marches.
  const cascade = (amounts, extra, names) => modelOf('waterfall', [xs('Poste', names || NAMES.slice(0, amounts.length)), ys('Montant', amounts)], Object.assign({ values: ['Montant'], total: true }, extra || {}));
  const WF_MARGIN = cascade([1000, -150, -600, -120], { title: 'Marge', labels: true });                                          // le cumul reste positif, avec son total
  const WF_CASH = cascade([50, -120, 60, -5], { title: 'Trésorerie', labels: true }, ['Solde initial', 'Achats', 'Ventes', 'Intérêts']); // le cumul passe sous zéro à la 2e marche, qui passe zéro
  const WF_CROSS = cascade([30, -80, 100, -90], { labels: true, palette: 'cool' }, ['Départ', 'Perte', 'Gain', 'Perte 2']);         // trois marches passent zéro
  const WF_UPS = cascade([10, 20, 5], { total: false }, ['A', 'B', 'C']);                                                          // des hausses seules, sans total
  const WF_DECIMALS = cascade([10.5, -2.25, 1.75], { labels: true }, ['Recettes', 'Dépenses', 'Subvention']);
  const r6 = n => Math.round(n * 1e6) / 1e6;
  const letters = (n) => { let name = ''; for (let rest = n; rest > 0; rest = Math.floor((rest - 1) / 26)) name = String.fromCharCode(65 + ((rest - 1) % 26)) + name; return name; };
  const stepCount = model => model.categories.length - (model.waterfall.total ? 1 : 0);

  // Ce que la cascade doit dessiner, marche par marche : [bas, haut] ; « Total » va de zéro au cumul. Du calcul simple, sans rien des formules.
  function cascadeRanges(model) {
    let sum = 0;
    return model.categories.map((name, at) => {
      const last = !!model.waterfall.total && at === model.categories.length - 1;
      const amount = last ? sum : model.series[0].values[at];
      const from = last ? 0 : sum;
      const to = last ? sum : sum + amount;
      if (!last) sum = to;
      return [r6(Math.min(from, to)), r6(Math.max(from, to))];
    });
  }
  // La grille de DocxExport.waterfallOf (lignes, colonnes depuis 0) en cellules : Map « B3 » -> { number } | { text } | { f, v }.
  function gridCells(grid) {
    const cells = new Map();
    grid.forEach((line, row) => line.forEach((one, col) => { if (one) cells.set(letters(col + 1) + (row + 1), one); }));
    return cells;
  }
  // Les cellules d'une feuille lue dans l'archive (xl/worksheets/sheetN.xml et sa table de chaînes) : les mêmes cellules ; `v` est la valeur en cache d'une formule (undefined quand le fichier n'en dit pas).
  function sheetCells(sheetXml, stringsXml) {
    const strings = stringsXml ? tagsOf(parseXml(stringsXml), 'si').map(si => textsOf(si, 't').join('')) : [];
    const cells = new Map();
    tagsOf(parseXml(sheetXml), 'c').forEach((cell) => {
      const type = cell.getAttribute('t');
      const formula = cell.getElementsByTagName('f')[0];
      const value = cell.getElementsByTagName('v')[0];
      let text = null;
      if (type === 'inlineStr') text = textsOf(cell, 't').join('');
      else if (type === 's' && value) text = strings[Number(value.textContent)];
      else if (type === 'str' && value) text = value.textContent;
      const shown = text !== null ? text : (value ? Number(value.textContent) : undefined);
      if (formula) cells.set(cell.getAttribute('r'), { f: formula.textContent, v: shown });
      else if (text !== null) cells.set(cell.getAttribute('r'), { text });
      else if (value) cells.set(cell.getAttribute('r'), { number: Number(value.textContent) });
    });
    return cells;
  }
  // Un petit évaluateur des formules d'une cascade (IF, AND, SUM, MAX, MIN, les comparaisons, + et -), pour ce qu'Excel en tirera : rend la fonction « B3 » -> valeur ; `edits` : { 'I3': le montant mis à la place }.
  function calculator(cells, edits) {
    const memo = new Map();
    const functions = { IF: (test, yes, no) => (test ? yes : no), AND: (...all) => all.every(Boolean), SUM: (...all) => all.flat().reduce((n, v) => n + v, 0), MAX: (...all) => Math.max(...all.flat()), MIN: (...all) => Math.min(...all.flat()) };
    const range = (column, from, to) => { const list = []; for (let row = from; row <= to; row++) list.push(value(column + row)); return list; };
    function value(ref) {
      if (edits && Object.prototype.hasOwnProperty.call(edits, ref)) return edits[ref];
      if (memo.has(ref)) return memo.get(ref);
      const one = cells.get(ref);
      let out = 0;
      if (one && typeof one.number === 'number') out = one.number;
      else if (one && typeof one.f === 'string') {
        const code = one.f.replace(/\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)/g, (all, column, top, other, bottom) => 'RANGE("' + column + '",' + top + ',' + bottom + ')').replace(/\b([A-Z]{1,3}\d+)\b/g, 'REF("$1")');
        out = new Function('IF', 'AND', 'SUM', 'MAX', 'MIN', 'REF', 'RANGE', 'return (' + code + ');')(functions.IF, functions.AND, functions.SUM, functions.MAX, functions.MIN, value, range);
      }
      memo.set(ref, out);
      return out;
    }
    return value;
  }
  // Ce que les colonnes empilées dessinent, marche par marche, d'après les cellules calculées : les valeurs positives s'empilent au-dessus de zéro, les négatives au-dessous, dans l'ordre des séries ; la première, « Base »,
  // ne se voit pas. Rend [bas, haut] de ce qui se voit. `firstRow` : la ligne de la première marche dans le classeur.
  function drawnRanges(made, value, firstRow) {
    return made.categories.map((name, at) => {
      let up = 0;
      let down = 0;
      let low = Infinity;
      let high = -Infinity;
      made.series.forEach((one, k) => {
        const number = value(letters(k + 2) + (firstRow + at));
        if (!number) return;
        const from = number > 0 ? up : down;
        const to = from + number;
        if (number > 0) up = to; else down = to;
        if (one.id !== 'base') { low = Math.min(low, from, to); high = Math.max(high, from, to); }
      });
      return [r6(low), r6(high)];
    });
  }
  // Les formules d'un graphique dont les cellules ne disent pas ce que le graphique a en cache (nom, étiquettes, valeurs), ou qui ne visent pas la feuille `sheetName` ; `cells` : celles de cette feuille (sheetCells).
  function cacheMismatches(chart, cells, sheetName) {
    return tagsOf(chart, 'c:f').filter((f) => {
      const m = /^(?:'((?:[^']|'')+)'|([^'!]+))!\$([A-Z]+)\$(\d+)(?::\$([A-Z]+)\$(\d+))?$/.exec(f.textContent);
      const cache = Array.from(f.parentNode.children).find(child => /Cache$/.test(child.nodeName));
      if (!m || !cache || (m[1] || m[2]).replace(/''/g, '\'') !== sheetName || (m[5] && m[5] !== m[3])) return true;
      const cached = new Map(tagsOf(cache, 'c:pt').map(pt => [Number(pt.getAttribute('idx')), pt.getElementsByTagName('c:v')[0].textContent]));
      for (let row = Number(m[4]); row <= Number(m[6] || m[4]); row++) {
        const cell = cells.get(m[3] + row);
        const shown = cell ? (cell.f !== undefined ? cell.v : (cell.text !== undefined ? cell.text : cell.number)) : undefined;
        const at = row - Number(m[4]);
        if (cached.has(at) ? String(shown) !== cached.get(at) : shown !== undefined) return true;
      }
      return false;
    }).map(f => f.textContent);
  }
  // Le classeur embarqué d'un graphique de Word ou de PowerPoint (`folder` : 'word/' ou 'ppt/'), trouvé par la relation de la partie du graphique : ses cellules.
  async function embeddedCells(out, chartName, folder) {
    const rels = out.parts[chartName.replace(/charts\/(chart\d+\.xml)$/, 'charts/_rels/$1.rels')] || '';
    const target = (/Target="([^"]+)"/.exec(rels) || [])[1];
    const path = target ? folder + target.replace(/^\.\.\//, '') : null;
    if (!path || !out.zip.file(path)) return null;
    const book = await JSZip.loadAsync(await out.zip.file(path).async('uint8array'));
    return sheetCells(await book.file('xl/worksheets/sheet1.xml').async('string'), book.file('xl/sharedStrings.xml') ? await book.file('xl/sharedStrings.xml').async('string') : '');
  }
  // Ce que la partie d'une cascade (le graphique `at` de `out`, sa feuille `cells` de première marche `firstRow`) dit de juste : séries, base sans remplissage, cache = cellules, formules = valeurs en cache, montants, tracé.
  function waterfallReport(chart, cells, sheetName, firstRow, model) {
    const made = DocxExport.waterfallOf(model);
    const value = calculator(cells);
    const formulas = Array.from(cells.entries()).filter(([ref, one]) => typeof one.f === 'string');
    const base = tagsOf(chart, 'c:ser')[0];
    const own = Array.from(base.children).find(child => child.nodeName === 'c:spPr');
    const amountAt = at => cells.get(made.amountColumn + (firstRow + at));
    return {
      names: seriesOf(chart).map(s => s.name),
      stacked: tagsOf(chart, 'c:grouping')[0].getAttribute('val') === 'stacked',
      invisibleBase: !!own && own.getElementsByTagName('a:noFill').length >= 1 && own.getElementsByTagName('a:solidFill').length === 0,
      mismatches: cacheMismatches(chart, cells, sheetName),
      formulas: formulas.length,
      withoutValue: formulas.filter(([ref, one]) => typeof one.v !== 'number').length,
      recalculated: formulas.every(([ref, one]) => Math.abs(value(ref) - one.v) < 1e-9),
      amounts: Array.from({ length: stepCount(model) }, (v, at) => (amountAt(at) || {}).number),
      drawn: drawnRanges(made, value, firstRow),
      clean: JSON.stringify(Array.from(cells.values())).indexOf('pp-wf') < 0,
    };
  }
  const amountsOf = model => model.series[0].values.slice(0, stepCount(model));
  const goodReport = (report, model, names) => same(report.names, names) && report.stacked && report.invisibleBase && report.mismatches.length === 0 && report.formulas > 0 && report.withoutValue === 0 && report.recalculated
    && same(report.amounts, amountsOf(model)) && same(report.drawn, cascadeRanges(model)) && report.clean;
  const nameOfSeries = model => DocxExport.waterfallOf(model).series.map(s => s.name);

  cases.push({
    id: 'chart_office_model_waterfall_keeps_the_steps_the_amounts_the_three_colors_and_the_texts_of_the_workbook',
    description: 'Cascade : le modèle garde le nom de chaque marche (« Total » à la fin avec « Afficher le total »), une seule série dont `values` donne le montant de chaque marche (null pour « Total », la somme des autres), les trois couleurs du jeu (hausse, baisse, total) et les neuf textes du classeur dans la langue de la personne ; une ligne sans montant n\'est pas une marche ; sans marche ni colonne de montants, pas de modèle (l\'image reste) ; le texte du modèle se relit à l\'identique',
    run: async () => {
      const keys = ['base', 'up', 'down', 'total', 'upBelow', 'downBelow', 'low', 'high', 'note'];
      const firstThree = name => { const palette = ChartMake.paletteOf(def('waterfall', name ? { palette: name } : {})); return [0, 1, 2].map(at => palette[at % palette.length]); };
      const gap = modelOf('waterfall', [xs('Poste', ['A', 'B', 'C']), ys('Montant', [5, null, -2])], { values: ['Montant'] });
      const warm = cascade([1, 2], { palette: 'warm' }, ['A', 'B']);
      const noColumn = ChartOffice.model(def('waterfall', { values: [] }), [xs('Poste', ['A', 'B'])]);
      const noStep = modelOf('waterfall', [xs('Poste', ['A', 'B']), ys('Montant', [null, null])], { values: ['Montant'], total: true });
      return {
        pass: WF_MARGIN.v === 1 && WF_MARGIN.kind === 'waterfall' && WF_MARGIN.title === 'Marge' && WF_MARGIN.labels === true && same(WF_MARGIN.categories, NAMES.slice(0, 4).concat([I18n.t('chart.waterfall.total')]))
          && WF_MARGIN.series.length === 1 && WF_MARGIN.series[0].name === 'Montant' && same(WF_MARGIN.series[0].values, [1000, -150, -600, -120, null]) && same(WF_MARGIN.axes, { category: 'Poste', value: 'Montant' })
          && WF_MARGIN.waterfall.total === true && same(WF_MARGIN.waterfall.colors, firstThree()) && same(Object.keys(WF_MARGIN.waterfall.texts), keys)
          && keys.every(key => WF_MARGIN.waterfall.texts[key] === I18n.t('chart.waterfall.' + key) && WF_MARGIN.waterfall.texts[key].length > 0)
          && same(WF_UPS.categories, ['A', 'B', 'C']) && WF_UPS.waterfall.total === undefined && same(WF_UPS.series[0].values, [10, 20, 5])
          && same(gap.categories, ['A', 'C']) && same(gap.series[0].values, [5, -2]) && same(warm.waterfall.colors, firstThree('warm')) && warm.waterfall.colors[0] !== WF_MARGIN.waterfall.colors[0]
          && noColumn === null && noStep === null && same(JSON.parse(JSON.stringify(WF_MARGIN)), WF_MARGIN),
        notes: JSON.stringify({ margin: [WF_MARGIN.categories, WF_MARGIN.series[0].values, WF_MARGIN.waterfall.colors, Object.keys(WF_MARGIN.waterfall.texts)], gap: [gap.categories, gap.series[0].values], noColumn, noStep }),
      };
    },
  });

  cases.push({
    id: 'chart_office_waterfall_sheet_has_one_column_of_amounts_and_formulas_that_redraw_it_when_an_amount_is_edited',
    description: 'Cascade : la feuille du classeur n\'a qu\'une colonne de saisie (les montants des marches) ; Base, Hausse, Baisse, Total, les deux « sous zéro » et le bas et le haut de chaque marche sont des FORMULES, de valeur en cache exacte ; évaluées, les colonnes empilées dessinent le tracé de la cascade (cumul positif, cumul négatif, marches qui passent zéro, hausses seules, décimales) et le redessinent après la modification de montants (une hausse devenue baisse, un cumul qui passe sous zéro)',
    run: async () => {
      const scenarios = [
        ['marge', WF_MARGIN, [1000, 300, -600, -120]], ['trésorerie', WF_CASH, [10, 20, 30, 40]], ['passage de zéro', WF_CROSS, [-30, 80, -100, 90]],
        ['hausses seules', WF_UPS, [10, -50, 5]], ['décimales', WF_DECIMALS, [10.5, 2.25, -20.75]],
      ];
      const out = scenarios.map(([why, model, edited]) => {
        const made = DocxExport.waterfallOf(model);
        const cells = gridCells(made.grid);
        const steps = stepCount(model);
        const entries = Array.from(cells.entries());
        const inputs = entries.filter(([ref, one]) => typeof one.number === 'number').map(([ref]) => ref).sort();
        const formulas = entries.filter(([ref, one]) => typeof one.f === 'string');
        const value = calculator(cells);
        const amountRefs = Array.from({ length: steps }, (v, at) => made.amountColumn + (2 + at));
        const edits = Object.fromEntries(amountRefs.map((ref, at) => [ref, edited[at]]));
        const editedModel = cascade(edited, { total: !!model.waterfall.total }, model.categories.slice(0, steps));
        return {
          why, inputs: same(inputs, amountRefs.slice().sort()), formulas: formulas.length, cached: formulas.every(([ref, one]) => Math.abs(value(ref) - one.v) < 1e-9),
          before: same(drawnRanges(made, value, 2), cascadeRanges(model)), after: same(drawnRanges(made, calculator(cells, edits), 2), cascadeRanges(editedModel)),
          series: made.series.map(one => one.name), amountColumn: made.amountColumn,
        };
      });
      const margin = DocxExport.waterfallOf(WF_MARGIN);
      const ups = DocxExport.waterfallOf(WF_UPS);
      const names = ['Base', 'Hausse', 'Baisse', 'Total', 'Hausse (sous zéro)', 'Baisse (sous zéro)'];
      const head = margin.grid[0].map(one => (one ? one.text : null));
      return {
        pass: out.every(o => o.inputs && o.formulas > 0 && o.cached && o.before && o.after)
          && same(out[0].series, names) && same(out[3].series, names.filter(name => name !== 'Total')) && out[0].amountColumn === 'I' && out[3].amountColumn === 'H'
          && same(head, [null, 'Base', 'Hausse', 'Baisse', 'Total', 'Hausse (sous zéro)', 'Baisse (sous zéro)', null, 'Montant', 'Bas de la marche', 'Haut de la marche'])
          && margin.grid[margin.grid.length - 1][0].text === I18n.t('chart.waterfall.note').split('{name}').join('Montant').split('{col}').join('I') && ups.grid[0][7] && ups.grid[0][7].text === 'Montant',
        notes: JSON.stringify(out),
      };
    },
  });

  cases.push({
    id: 'chart_office_docx_waterfall_options_are_stacked_columns_with_an_invisible_base_signed_labels_and_a_legend_of_the_roles_shown',
    description: 'Les options de la ChartRun d\'une cascade (DocxExport.chartOptionsFromModel) : colonnes empilées serrées, la « Base » blanche et, pour Word seulement, marquée du rang de la cascade ; Hausse, Baisse, Total aux trois couleurs du jeu (les deux « sous zéro » reprennent celles de la hausse et de la baisse) ; valeurs affichées au centre avec leur signe (« +120 », « -50 », total sans signe), deux décimales dès qu\'un montant en a, aucune sur la base ni sur les « sous zéro », aucune sans « Afficher les valeurs », celles d\'une marche qui passe zéro retirées ; légende des seuls rôles présents (ni base, ni « sous zéro »), absente d\'un seul rôle ; noms des deux axes',
    run: async () => {
      const options = (model, tag) => DocxExport.chartOptionsFromModel(model, tag);
      const hex = color => color.slice(1).toUpperCase();
      const margin = options(WF_MARGIN, 3);
      const bare = options(WF_MARGIN);
      const cash = options(WF_CASH);
      const cross = options(WF_CROSS);
      const ups = options(WF_UPS);
      const decimals = options(WF_DECIMALS);
      const quiet = options(cascade([40, -15, 25, -10], { total: false }));
      const colors = WF_MARGIN.waterfall.colors.map(hex);
      const formats = o => o.series.map(s => (s.dataLabels ? s.dataLabels.numberFormat : null));
      const hidden = o => (o.legend ? o.legend.hiddenEntries : null);
      return {
        pass: margin.type === 'column' && margin.stacking === 'stacked' && margin.gapWidth === 67 && same(margin.categories, WF_MARGIN.categories) && margin.title === 'Marge'
          && same(margin.series.map(s => s.name), ['Base [pp-wf-3]', 'Hausse', 'Baisse', 'Total', 'Hausse (sous zéro)', 'Baisse (sous zéro)']) && bare.series[0].name === 'Base'
          && same(margin.series.map(s => s.color), ['FFFFFF', colors[0], colors[1], colors[2], colors[0], colors[1]])
          && same(margin.series[0].values, [0, 850, 250, 130, 0]) && same(margin.series[1].values, [1000, 0, 0, 0, null]) && same(margin.series[2].values, [0, 150, 600, 120, null]) && same(margin.series[3].values, [null, null, null, null, 130]) && same(margin.series[4].values, [0, 0, 0, 0, null])
          && same(formats(margin), [null, '+#,##0;+#,##0;', '-#,##0;-#,##0;', '#,##0;-#,##0;', null, null]) && margin.series[1].dataLabels.position === 'center' && margin.series[1].dataLabels.value === true
          && margin.series[1].dataLabels.font.color === 'FFFFFF' && margin.series[2].dataLabels.font.color === '000000' && margin.series[1].pointLabels === undefined
          && margin.legend.position === 'top' && same(hidden(margin), ['Base [pp-wf-3]', 'Hausse (sous zéro)', 'Baisse (sous zéro)']) && same(hidden(bare), ['Base', 'Hausse (sous zéro)', 'Baisse (sous zéro)'])
          && same(margin.categoryAxis, { title: 'Poste' }) && same(margin.valueAxis, { title: 'Montant' })
          && same(cash.series[1].pointLabels.map(p => p === false), [false, true, false, false, false]) && same(cash.series[2].pointLabels.map(p => p === false), [false, true, false, false, false]) && same(cash.series[3].pointLabels.map(p => p === false), [false, true, false, false, false])
          && cash.series[4].dataLabels === undefined && cash.series[0].dataLabels === undefined
          && same(cross.series[1].pointLabels.map(p => p === false), [false, true, true, true, false]) && cross.series.length === 6
          && ups.legend === false && same(ups.series.map(s => s.name), ['Base', 'Hausse', 'Baisse', 'Hausse (sous zéro)', 'Baisse (sous zéro)']) && ups.series.every(s => s.dataLabels === undefined)
          && same(formats(decimals), [null, '+#,##0.00;+#,##0.00;', '-#,##0.00;-#,##0.00;', '#,##0.00;-#,##0.00;', null, null])
          && same(hidden(options(cascade([5, 7], { total: false }, ['A', 'B']))), null) && quiet.series.every(s => s.dataLabels === undefined) && quiet.legend.position === 'top' && same(hidden(quiet), ['Base', 'Hausse (sous zéro)', 'Baisse (sous zéro)']),
        notes: JSON.stringify({ margin: margin.series.map(s => [s.name, s.color, s.values]), formats: formats(margin), hidden: hidden(margin), cash: cash.series[1].pointLabels, cross: cross.series[1].pointLabels, ups: [ups.legend, ups.series.map(s => s.name)], decimals: formats(decimals), quiet: [quiet.legend, hidden(quiet)] }),
      };
    },
  });

  cases.push({
    id: 'chart_office_docx_waterfall_is_a_native_stacked_chart_with_an_invisible_base_formulas_and_no_mark_left',
    description: 'Word : quatre graphiques créés d\'un même .docx (deux cascades, des barres entre elles, une cascade sans texte alternatif) sont quatre graphiques natifs, sans image PNG, la cascade sans texte alternatif décrite « Graphique : Cascade » (pas par ses colonnes de calcul) ; chaque cascade est en colonnes empilées dont la série « Base » est sans remplissage, avec son classeur embarqué propre (ses montants, ses formules, ses valeurs en cache qui disent ce que le graphique a en cache, le tracé de la cascade une fois les formules évaluées) ; aucune marque de travail (`[pp-wf-N]`) nulle part, les barres gardent leur remplissage',
    run: async () => {
      const noAlt = '<p><img class="editor-image" alt="" src="' + PNG() + '" style="width: 480px; height: 300px" data-layer="normal" data-wrap="inline" data-chart-office="' + JSON.stringify(WF_UPS).replace(/"/g, '&quot;') + '"></p>';
      const out = await docxOf(drawnHtml(WF_MARGIN) + drawnHtml(BAR_MODEL) + drawnHtml(WF_CROSS) + noAlt);
      const find = categories => out.charts.findIndex(chart => same(seriesOf(chart)[0].cats, categories));
      const at = { margin: find(WF_MARGIN.categories), bar: find(months), cross: find(WF_CROSS.categories), ups: find(WF_UPS.categories) };
      const report = async (name, model) => { const cells = await embeddedCells(out, out.chartNames[at[name]], 'word/'); return cells ? waterfallReport(out.charts[at[name]], cells, 'Sheet1', 2, model) : null; };
      const margin = await report('margin', WF_MARGIN);
      const cross = await report('cross', WF_CROSS);
      const ups = await report('ups', WF_UPS);
      const bar = at.bar >= 0 ? seriesOf(out.charts[at.bar]) : [];
      const legendEntries = chart => tagsOf(chart, 'c:legendEntry').map(entry => entry.getElementsByTagName('c:idx')[0].getAttribute('val'));
      const deleted = chart => tagsOf(chart, 'c:dLbl').filter(label => label.getElementsByTagName('c:delete')[0]).length;
      // Les formats des valeurs affichées (ceux des étiquettes de données, pas ceux des axes, « General »).
      const formatsOf = chart => tagsOf(chart, 'c:dLbls').reduce((all, labels) => all.concat(Array.from(labels.children).filter(child => child.nodeName === 'c:numFmt').map(node => node.getAttribute('formatCode'))), []);
      const leaks = Object.keys(out.parts).filter(name => out.parts[name].indexOf('pp-wf') >= 0);
      const described = tagsOf(out.doc, 'wp:docPr').map(props => props.getAttribute('descr'));
      return {
        pass: out.charts.length === 4 && out.media.length === 0 && out.workbooks.length === 4 && Object.values(at).every(n => n >= 0) && new Set(Object.values(at)).size === 4
          && !!margin && goodReport(margin, WF_MARGIN, nameOfSeries(WF_MARGIN)) && !!cross && goodReport(cross, WF_CROSS, nameOfSeries(WF_CROSS)) && !!ups && goodReport(ups, WF_UPS, nameOfSeries(WF_UPS))
          && same(margin.names, ['Base', 'Hausse', 'Baisse', 'Total', 'Hausse (sous zéro)', 'Baisse (sous zéro)']) && same(ups.names, ['Base', 'Hausse', 'Baisse', 'Hausse (sous zéro)', 'Baisse (sous zéro)'])
          && same(bar.map(s => s.name), ['Paris', 'Lyon']) && same(bar.map(s => s.color), ['2B78AE', 'FE945B']) && same(plotsOf(out.charts[at.bar]), ['c:barChart']) && tagsOf(out.charts[at.bar], 'c:grouping')[0].getAttribute('val') === 'clustered'
          && same(legendEntries(out.charts[at.margin]), ['0', '4', '5']) && tagsOf(out.charts[at.ups], 'c:legend').length === 0
          && deleted(out.charts[at.margin]) === 0 && deleted(out.charts[at.cross]) === 9
          && same(formatsOf(out.charts[at.margin]).filter((format, i, all) => all.indexOf(format) === i).sort(), ['#,##0;-#,##0;', '+#,##0;+#,##0;', '-#,##0;-#,##0;']) && formatsOf(out.charts[at.ups]).length === 0
          && tagsOf(out.charts[at.margin], 'c:gapWidth')[0].getAttribute('val') === '67' && same(tagsOf(out.charts[at.margin], 'c:tickLblPos').map(n => n.getAttribute('val')).slice(0, 1), ['low'])
          && leaks.length === 0 && described.filter(text => text === 'Mon graphique').length === 3 && described.filter(text => text === I18n.t('chart.alt', { name: I18n.t('chart.make.kind.waterfall') })).length === 1,
        notes: JSON.stringify({ at, described, margin, cross, ups, bar, leaks, legend: legendEntries(out.charts[at.margin]), deleted: [deleted(out.charts[at.margin]), deleted(out.charts[at.cross])], formats: formatsOf(out.charts[at.margin]) }),
      };
    },
  });

  cases.push({
    id: 'chart_office_pptx_waterfall_is_a_native_stacked_chart_with_its_own_formulas_on_each_slide',
    description: 'PowerPoint : deux cascades sur deux diapositives sont deux graphiques natifs (un objet « graphique » chacune, aucune image PNG), en colonnes empilées à la « Base » sans remplissage, chacune avec son classeur embarqué : ses montants, ses formules, ses valeurs en cache qui disent ce que le graphique a en cache, et le tracé de la cascade une fois les formules évaluées ; aucune marque de travail',
    run: async () => {
      const out = await pptxOf('<h1>Marge</h1>' + drawnHtml(WF_MARGIN) + '<div class="page-break-marker"></div><h2>Trésorerie</h2>' + drawnHtml(WF_CASH));
      const reports = [];
      for (const [at, model] of [[0, WF_MARGIN], [1, WF_CASH]]) {
        const cells = await embeddedCells(out, out.chartNames[at], 'ppt/');
        reports.push(cells ? waterfallReport(out.charts[at], cells, 'Sheet1', 2, model) : null);
      }
      const frames = out.slides.map(slide => chartFrames(slide).length);
      const leaks = Object.keys(out.parts).filter(name => out.parts[name].indexOf('pp-wf') >= 0);
      return {
        pass: out.charts.length === 2 && same(frames, [1, 1]) && out.slides.every(slide => tagsOf(slide, 'p:pic').length === 0) && out.media.length === 0 && out.workbooks.length === 2
          && same(seriesOf(out.charts[0])[0].cats, WF_MARGIN.categories) && same(seriesOf(out.charts[1])[0].cats, WF_CASH.categories)
          && !!reports[0] && goodReport(reports[0], WF_MARGIN, nameOfSeries(WF_MARGIN)) && !!reports[1] && goodReport(reports[1], WF_CASH, nameOfSeries(WF_CASH)) && leaks.length === 0
          && same(tagsOf(out.charts[1], 'c:dLbl').filter(label => label.getElementsByTagName('c:delete')[0]).length, 3),
        notes: JSON.stringify({ charts: out.charts.length, frames, media: out.media, reports, leaks }),
      };
    },
  });

  cases.push({
    id: 'chart_office_xlsx_waterfall_blocks_have_their_formulas_shifted_to_their_own_rows_and_keep_their_zero_results',
    description: 'Excel : deux cascades d\'une feuille sont deux graphiques natifs dont les formules visent la feuille « Données des graphiques » ; chaque bloc de cette feuille a ses formules à ses propres lignes (le second ne lit pas le premier : un montant modifié ne redessine que sa cascade), chaque formule garde sa valeur en cache - les ZÉROS aussi, qu\'ExcelJS perdait à la copie - et ces valeurs disent ce que le graphique a en cache ; le tracé de la cascade, les formules évaluées, est le bon avant et après la modification des montants de son bloc',
    run: async () => {
      const out = await xlsxOf(gridHtml(smallChart(WF_MARGIN), smallChart(WF_CROSS)));
      const sheetName = I18n.t('xlsx.chart.sheet');
      const cells = sheetCells(out.parts['xl/worksheets/sheet' + out.sheets.length + '.xml'], out.parts['xl/sharedStrings.xml']);
      const rows = [];
      for (const [model, chart] of [[WF_MARGIN, out.charts[0]], [WF_CROSS, out.charts[1]]]) {
        const made = DocxExport.waterfallOf(model);
        const firstRow = Number(/\$(\d+)(?::\$[A-Z]+\$\d+)?$/.exec(tagsOf(tagsOf(chart, 'c:ser')[0], 'c:cat')[0].getElementsByTagName('c:f')[0].textContent)[1]);
        const report = waterfallReport(chart, cells, sheetName, firstRow, model);
        // Les montants de CE bloc changent : si ses formules lisaient les lignes d'un autre bloc (décalage faux), sa cascade ne se redessinerait pas comme elle doit.
        const edited = amountsOf(model).map((amount, at) => (at % 2 ? amount * -1 - 7 : amount + 11));
        const edits = Object.fromEntries(edited.map((amount, at) => [made.amountColumn + (firstRow + at), amount]));
        const editedModel = cascade(edited, { total: !!model.waterfall.total }, model.categories.slice(0, stepCount(model)));
        rows.push({ firstRow, report, after: same(drawnRanges(made, calculator(cells, edits), firstRow), cascadeRanges(editedModel)) });
      }
      const another = rows.length === 2 && rows[1].firstRow > rows[0].firstRow + WF_MARGIN.categories.length;
      return {
        pass: out.charts.length === 2 && out.media.length === 0 && out.sheets.length === 2 && out.sheets[1] === sheetName && same(seriesOf(out.charts[0])[0].cats, WF_MARGIN.categories) && same(seriesOf(out.charts[1])[0].cats, WF_CROSS.categories)
          && rows.length === 2 && another && rows.every(row => row.report.recalculated && row.report.withoutValue === 0 && row.report.mismatches.length === 0 && row.report.invisibleBase && row.report.stacked && row.after)
          && goodReport(rows[0].report, WF_MARGIN, nameOfSeries(WF_MARGIN)) && goodReport(rows[1].report, WF_CROSS, nameOfSeries(WF_CROSS))
          && out.charts.every(chart => tagsOf(chart, 'c:f').every(f => /^'Données des graphiques'!/.test(f.textContent))),
        notes: JSON.stringify({ sheets: out.sheets, rows, head: [cells.get('A1'), cells.get('A2')] }),
      };
    },
  });

  cases.push({
    id: 'chart_office_waterfall_keeps_the_png_when_its_model_is_unreadable_and_a_failed_finish_still_exports_a_chart',
    description: 'Cascade : un modèle dont un montant n\'est pas un nombre, ou dont les montants ne vont pas avec les marches, laisse l\'image PNG dans le .docx, le .pptx et le classeur (aucun graphique, aucune feuille de données), sans rien bloquer ; quand la fin du Word échoue (l\'archive refuse de s\'écrire), le .docx sort quand même avec son graphique natif, modifiable, dont la base reste blanche',
    run: async () => {
      const warn = console.warn;
      const warned = [];
      console.warn = (...args) => { warned.push(String(args[0])); };
      const first = WF_MARGIN.series[0];
      const out = [];
      let unfinished;
      let refused = 0;
      try {
        for (const [why, values] of [['montant illisible', [1000, 'x', -600, -120, null]], ['montants en trop ou en moins', [1000, -150]]]) {
          const model = Object.assign({}, WF_MARGIN, { series: [Object.assign({}, first, { values })] });
          const word = await docxOf(drawnHtml(model));
          const slides = await pptxOf(drawnHtml(model));
          const book = await xlsxOf(gridHtml(smallChart(model)));
          out.push({ why, word: [word.charts.length, word.media.length], pptx: [slides.charts.length, slides.media.length, tagsOf(slides.slides[0], 'p:pic').length], xlsx: [book.charts.length, book.sheets.length, book.media.length] });
        }
        const original = JSZip.prototype.generateAsync;
        JSZip.prototype.generateAsync = function () { refused++; return Promise.reject(new Error('essai : archive refusée')); };
        try { unfinished = await docxOf(drawnHtml(WF_MARGIN)); } finally { JSZip.prototype.generateAsync = original; }
      } finally { console.warn = warn; }
      const series = unfinished && unfinished.charts[0] ? seriesOf(unfinished.charts[0]) : [];
      return {
        pass: out.length === 2 && out.every(o => same(o.word, [0, 1]) && same(o.pptx, [0, 1, 1]) && same(o.xlsx, [0, 1, 1]))
          && !!unfinished && refused >= 1 && unfinished.charts.length === 1 && unfinished.media.length === 0 && unfinished.workbooks.length === 1 && series.length === 6 && series[0].color === 'FFFFFF' && /^Base/.test(series[0].name)
          && warned.some(text => /cascade|graphique natif/.test(text)),
        notes: JSON.stringify({ out, refused, unfinished: unfinished && [unfinished.charts.length, unfinished.media.length, series.map(s => [s.name, s.color])], warned: warned.length }),
      };
    },
  });

  cases.push({
    id: 'chart_office_waterfall_of_the_real_chain_is_native_in_word_powerpoint_and_excel',
    description: 'Cascade de la vraie chaîne (le client 1, « Afficher le total » et les valeurs) : la Lecture pose `data-chart-office` (modèle « waterfall » : Mars, Janvier et « Total ») sur l\'image PNG ; le .docx, le .pptx et le classeur ont chacun UN graphique natif en colonnes empilées et son classeur, aucune image PNG, la feuille de données dans l\'Excel ; une ligne sans vente n\'a rien',
    run: async (h) => {
      await seed(h);
      const extra = { values: ['Montant'], total: true, labels: true };
      const html = docOf(madeHtml(def('waterfall', extra), 'linked'));
      const content = await renderReader(html, recordOf(1));
      const img = content.querySelector('img');
      const model = img && JSON.parse(img.getAttribute('data-chart-office') || 'null');
      const png = !!img && (img.getAttribute('src') || '').startsWith('data:image/png;base64,');
      hideReader();
      const word = await docxOf(html, recordOf(1));
      const slides = await pptxOf(html, recordOf(1));
      const book = await xlsxOf(gridHtml(madeHtml(def('waterfall', extra), 'linked', SMALL)), recordOf(1));
      const empty = await docxOf(html, NO_SALE);
      const names = ['Base', 'Hausse', 'Baisse', 'Total', 'Hausse (sous zéro)', 'Baisse (sous zéro)'];
      const stacked = chart => !!chart && same(plotsOf(chart), ['c:barChart']) && tagsOf(chart, 'c:grouping')[0].getAttribute('val') === 'stacked' && same(seriesOf(chart).map(s => s.name), names);
      return {
        pass: !!model && model.kind === 'waterfall' && same(model.categories, ['Mars', 'Janvier', I18n.t('chart.waterfall.total')]) && same(model.series[0].values, [300, 100, null]) && model.waterfall.total === true && png
          && word.charts.length === 1 && word.media.length === 0 && word.workbooks.length === 1 && stacked(word.charts[0])
          && slides.charts.length === 1 && slides.media.length === 0 && slides.workbooks.length === 1 && stacked(slides.charts[0])
          && book.charts.length === 1 && book.media.length === 0 && book.sheets.length === 2 && book.sheets[1] === I18n.t('xlsx.chart.sheet') && stacked(book.charts[0])
          && empty.charts.length === 0 && empty.media.length === 0,
        notes: JSON.stringify({ model: model && [model.kind, model.categories, model.series[0].values], png, word: [word.charts.length, word.media.length, word.workbooks.length], pptx: [slides.charts.length, slides.media.length, slides.workbooks.length], xlsx: [book.charts.length, book.media.length, book.sheets], empty: [empty.charts.length, empty.media.length] }),
      };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.chartOffice = cases;
})();
