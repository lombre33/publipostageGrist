// Suite "pivotZone" - le tableau croisé de la grille, côté lecture (étude d'Antoine du 12/11, lot 2 ; moteur : js/pivot.js, testé à part par `pivotUnit`) : une LIGNE de la grille porte la définition (`data-pivot`) et
// js/pivot-zones.js la remplace, à la Lecture et à tout export (js/reader-mode.js : resolveReaderBody), par un tableau de textes déjà écrits.
// Jeu de données : des produits (catégorie = choix, emplacement = référence vers une zone d'entrepôt, stock, prix d'achat), comme les 48 d'Atlas en plus petit ; les nombres attendus sont recalculés ICI, à part du code testé.
//  1) la valeur est un Calcul (Stock × PrixAchat) : cases, totaux de ligne et de colonne, total général, ordre des choix de Grist, en-tête, une seule ligne source remplacée ;
//  2) la zone qui lit son chemin par une référence (Emplacement ▸ Zone) et la valeur-colonne, deux niveaux en lignes ;
//  3) les sources : toute la table, la vue Grist (son filtre), les lignes liées à la page ; 4) le reste de la grille : titre fusionné étendu, lignes complétées, largeurs reprises ;
//  5) ce qui ne se lit pas : une table disparue, une définition illisible, aucune ligne, un Calcul en erreur - dit dans le tableau, jamais un tableau faux ni une page vide.
(function () {
  const cases = [];

  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const CATEGORIES = ['Visserie', 'Électricité', 'Plomberie'];
  const ZONES = ['Réserve', 'Picking', 'Quai'];
  // Les produits du jeu : [id, catégorie, id de l'emplacement, stock, prix d'achat].
  const PRODUCTS = [
    [1, 'Plomberie', 1, 10, 2.5], [2, 'Visserie', 2, 100, 0.12], [3, 'Visserie', 1, 40, 0.3], [4, 'Électricité', 3, 8, 12.99], [5, 'Plomberie', 3, 3, 40],
    [6, 'Visserie', 1, 5, 1], [7, 'Électricité', 1, 20, 3.1], [8, 'Électricité', 3, 2, 70.5], [9, 'Plomberie', 2, 6, 9.9], [10, null, 2, 4, 5],
  ];
  const PRODUCT_ROWS = PRODUCTS.map(([id, Categorie, Emplacement, Stock, PrixAchat]) => ({ id, Categorie: Categorie || '', Emplacement, Stock, PrixAchat, manualSort: id }));
  const ZONE_BY_LOCATION = { 1: 'Réserve', 2: 'Picking', 3: 'Quai' };
  const VALUE = { kind: 'formula', formula: '{PvProduits.Stock} * {PvProduits.PrixAchat}' };
  const DEF = { v: 1, source: { table: 'PvProduits', scope: 'table' }, rows: ['Categorie'], cols: ['Emplacement.Zone'], value: VALUE, agg: 'sum' };

  const attr = def => ` data-pivot="${JSON.stringify(def).replace(/"/g, '&quot;')}"`;
  const cell = (text, tag, extra) => `<${tag || 'td'}${extra || ''}><p>${text}</p></${tag || 'td'}>`;
  // Une grille de quatre colonnes : un titre fusionné, la ligne du tableau croisé (dont le texte n'est jamais lu), une note.
  function gridHtml(def, widths) {
    const w = widths || [120, 90, 90, 90];
    return '<table><tbody>'
      + `<tr><th colspan="4" colwidth="${w.join(',')}"><p><strong>Titre</strong></p></th></tr>`
      + `<tr${attr(def)}>${w.map((width, i) => `<td colwidth="${width}"><p>${i === 0 ? 'texte jamais lu' : ''}</p></td>`).join('')}</tr>`
      + `<tr>${cell('Note du bas')}${cell('')}${cell('')}${cell('')}</tr>`
      + '</tbody></table>';
  }

  async function seed(h) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setViewRows(null);
    stub.setViewFailure(null);
    stub.setVariables('PvEmplacements', { Zone: 'Choice' }, { Zone: ZONES });
    stub.setVariables('PvAtlas', { Nom: 'Text' });
    stub.setVariables('PvProduits', { Categorie: 'Choice', Emplacement: 'Ref:PvEmplacements', Stock: 'Numeric', PrixAchat: 'Numeric', Atlas: 'Ref:PvAtlas', manualSort: 'ManualSortPos' }, { Categorie: CATEGORIES });
    stub.setRows('PvEmplacements', [{ id: 1, Zone: 'Réserve' }, { id: 2, Zone: 'Picking' }, { id: 3, Zone: 'Quai' }]);
    stub.setRows('PvAtlas', [{ id: 1, Nom: 'Atlas Nord' }, { id: 2, Nom: 'Atlas Sud' }]);
    // Les produits d'id pair sont liés à « Atlas Sud », les autres à « Atlas Nord » (la source « liées à la page »).
    stub.setRows('PvProduits', PRODUCT_ROWS.map(r => Object.assign({}, r, { Atlas: r.id % 2 ? 1 : 2 })));
    await GristAPI.refreshSchema();
    await GristAPI.deleteLinkRule('PvProduits');
    await GristAPI.saveLinkRule('PvProduits', { mode: 'match', colonneCible: 'Atlas', colonneSource: 'id' });
    await GristAPI.refreshSchema();
    stub.fireRecord({ id: 1, Nom: 'Atlas Nord' }, 'PvAtlas');
    await h.sleep(50);
  }

  async function preview(html, tableId, record) {
    const box = document.createElement('div');
    box.innerHTML = await ReaderMode.preview(html, tableId || 'PvAtlas', record || GristAPI.getCurrentRecord());
    return box;
  }
  const rowTexts = box => Array.from(box.querySelectorAll('tr')).map(tr => Array.from(tr.children).map(c => c.textContent.trim()));
  // « 1 234,56 € » (espaces insécables, virgule) lu comme un nombre ; null pour un texte vide.
  function toNumber(text) {
    const clean = String(text).replace(/[\s  ]/g, '').replace(/[^0-9,.\-−]/g, '').replace('−', '-').replace(',', '.');
    return clean === '' ? null : Number(clean);
  }
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const near = (a, b) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 0.005;
  const nearAll = (list, expected) => list.length === expected.length && list.every((v, i) => (expected[i] === null ? v === null : near(v, expected[i])));

  // Le tableau attendu, recalculé à part du moteur : { [catégorie]: { [zone]: valeur } } pour les lignes de `products`.
  function expectedTable(products, rowOf) {
    const out = {};
    products.forEach(([, category, location, stock, price]) => {
      const row = (out[category || '(vide)'] = out[category || '(vide)'] || {});
      const zone = ZONE_BY_LOCATION[location];
      row[zone] = (row[zone] || 0) + rowOf(stock, price);
    });
    return out;
  }
  const value = (stock, price) => stock * price;

  cases.push({
    id: 'pivot_formula_cells_and_totals',
    description: 'La valeur est un Calcul (Stock × PrixAchat) : les cases, les totaux de ligne et de colonne et le total général sont ceux d’un calcul fait à part, rangés dans l’ordre des choix de Grist, avec « (vide) » en dernier',
    run: async (h) => {
      await seed(h);
      const box = await preview(gridHtml(DEF));
      const rows = rowTexts(box);
      const expected = expectedTable(PRODUCTS, value);
      const order = CATEGORIES.concat('(vide)');
      const body = rows.slice(2, 2 + order.length);
      const cellsOk = body.every((row, i) => {
        const wanted = ZONES.map(z => (expected[order[i]] && expected[order[i]][z] !== undefined ? expected[order[i]][z] : null));
        return row[0] === order[i] && nearAll(row.slice(1, 4).map(toNumber), wanted.map(v => (v === 0 ? null : v)));
      });
      const rowTotals = body.map(row => toNumber(row[4]));
      const wantedTotals = order.map(c => Object.values(expected[c]).reduce((a, b) => a + b, 0));
      const totalRow = rows[2 + order.length];
      const colTotals = ZONES.map((z, j) => PRODUCTS.reduce((sum, [, , location, stock, price]) => sum + (ZONE_BY_LOCATION[location] === z ? stock * price : 0), 0));
      const grand = PRODUCTS.reduce((sum, [, , , stock, price]) => sum + stock * price, 0);
      const pass = same(rows[1], ['Categorie', 'Réserve', 'Picking', 'Quai', 'Total'])
        && cellsOk && nearAll(rowTotals, wantedTotals)
        && totalRow[0] === 'Total' && nearAll(totalRow.slice(1, 4).map(toNumber), colTotals) && near(toNumber(totalRow[4]), grand);
      return { pass, notes: JSON.stringify(rows) };
    },
  });

  cases.push({
    id: 'pivot_replaces_only_its_row',
    description: 'La ligne du tableau croisé est remplacée (son texte « jamais lu » disparaît), le reste de la grille reste : un seul <tr data-pivot> de moins, aucune marque de la zone dans le HTML résolu, le titre fusionné s’étend à la largeur du tableau, la note du bas descend',
    run: async (h) => {
      await seed(h);
      const box = await preview(gridHtml(DEF));
      const rows = rowTexts(box);
      const widthOf = tr => Array.from(tr.children).reduce((sum, c) => sum + (parseInt(c.getAttribute('colspan'), 10) || 1), 0);
      const widths = Array.from(box.querySelectorAll('tr')).map(widthOf);
      const lastRow = box.querySelectorAll('tr')[box.querySelectorAll('tr').length - 1];
      const heads = Array.from(box.querySelectorAll('tr')[1].children).map(c => c.tagName);
      const pass = rows.length === 1 + 1 + CATEGORIES.length + 1 + 1 + 1 && rows[0][0] === 'Titre' && rows[rows.length - 1][0] === 'Note du bas'
        && !box.querySelector('[data-pivot]') && !/texte jamais lu/.test(box.textContent)
        && new Set(widths).size === 1 && widths[0] === 5 && widthOf(lastRow) === 5
        && box.querySelector('th[colspan]').getAttribute('colspan') === '5'
        && heads.every(t => t === 'TH');
      return { pass, notes: JSON.stringify({ widths, rows: rows.length, heads }) };
    },
  });

  cases.push({
    id: 'pivot_first_widths_kept',
    description: 'Les largeurs de colonne de la grille sont reprises case par case par les lignes du tableau (la grille exportée garde ses colonnes)',
    run: async (h) => {
      await seed(h);
      const box = await preview(gridHtml(DEF, [120, 90, 60, 70]));
      const body = box.querySelectorAll('tr')[2];
      const widths = Array.from(body.children).map(c => c.getAttribute('colwidth'));
      return { pass: same(widths.slice(0, 4), ['120', '90', '60', '70']) && widths[4] === null, notes: JSON.stringify(widths) };
    },
  });

  cases.push({
    id: 'pivot_reference_path_and_two_levels',
    description: 'Une colonne qui se lit par une référence (Emplacement ▸ Zone) et deux colonnes en lignes (catégorie, zone) : une rangée par couple, la catégorie écrite une seule fois, les zones dans l’ordre des choix, sans colonne en colonnes',
    run: async (h) => {
      await seed(h);
      const def = { v: 1, source: { table: 'PvProduits', scope: 'table' }, rows: ['Categorie', 'Emplacement.Zone'], cols: [], value: { kind: 'column', path: 'Stock' }, agg: 'sum' };
      const box = await preview(gridHtml(def));
      const rows = rowTexts(box);
      const body = rows.slice(2, rows.length - 2);
      const pairs = {};
      PRODUCTS.forEach(([, category, location, stock]) => { const k = (category || '(vide)') + '|' + ZONE_BY_LOCATION[location]; pairs[k] = (pairs[k] || 0) + stock; });
      const keys = Object.keys(pairs);
      const wantedOrder = CATEGORIES.concat('(vide)').flatMap(c => ZONES.map(z => c + '|' + z)).filter(k => keys.includes(k));
      let lastCategory = null;
      const seen = body.map(row => {
        const category = row[0] === '' ? lastCategory : row[0];
        const firstOfCategory = row[0] !== '';
        if (firstOfCategory) lastCategory = row[0];
        return { key: category + '|' + row[1], firstOfCategory, stock: toNumber(row[2]) };
      });
      const firsts = seen.filter(s => s.firstOfCategory).length;
      const pass = same(rows[1].slice(0, 2), ['Categorie', 'Emplacement ▸ Zone']) && same(seen.map(s => s.key), wantedOrder)
        && seen.every(s => near(s.stock, pairs[s.key])) && firsts === new Set(seen.map(s => s.key.split('|')[0])).size
        && same(rows[1].slice(2), ['Somme de Stock', '']) && rows[rows.length - 2][0] === 'Total';
      return { pass, notes: JSON.stringify(rows) };
    },
  });

  cases.push({
    id: 'pivot_sources',
    description: 'Les trois sources comme celles de la Boucle : toute la table, les lignes liées à la ligne de la page (ici « Atlas Nord »), la vue Grist du widget (son filtre : seuls les produits 1, 2, 3 quand la page est la table des produits)',
    run: async (h) => {
      await seed(h);
      const grandOf = box => { const rows = rowTexts(box); return toNumber(rows[rows.length - 2][rows[rows.length - 2].length - 1]); };
      const total = products => products.reduce((sum, [, , , stock, price]) => sum + stock * price, 0);
      const table = grandOf(await preview(gridHtml(DEF)));
      const linked = grandOf(await preview(gridHtml(Object.assign({}, DEF, { source: { table: 'PvProduits', scope: 'linked' } }))));
      window.__gristStub.setViewRows([1, 2, 3]);
      window.__gristStub.fireRecord({ id: 1, Categorie: 'Plomberie' }, 'PvProduits');
      await h.sleep(50);
      const view = grandOf(await preview(gridHtml(Object.assign({}, DEF, { source: { table: 'PvProduits', scope: 'view' } })), 'PvProduits', { id: 1, Categorie: 'Plomberie' }));
      window.__gristStub.setViewRows(null);
      const nord = PRODUCTS.filter(p => p[0] % 2);
      const pass = near(table, total(PRODUCTS)) && near(linked, total(nord)) && near(view, total(PRODUCTS.filter(p => [1, 2, 3].includes(p[0]))));
      return { pass, notes: JSON.stringify({ table, linked, view, wanted: [total(PRODUCTS), total(nord)] }) };
    },
  });

  cases.push({
    id: 'pivot_error_messages',
    description: 'Ce qui ne se lit pas est dit dans le tableau, entre « [ERREUR : … ] » comme une bulle : une table disparue, une définition illisible, une source sans lignes, une colonne qui n’existe plus, un Calcul illisible ; la grille autour reste',
    run: async (h) => {
      await seed(h);
      const messageOf = async def => {
        const box = await preview(typeof def === 'string' ? gridHtml({}).replace(/ data-pivot="[^"]*"/, ` data-pivot="${def}"`) : gridHtml(def));
        const rows = rowTexts(box);
        return { rows: rows.length, text: rows[1][0], around: rows[0][0] === 'Titre' && rows[rows.length - 1][0] === 'Note du bas' };
      };
      const out = {
        noTable: await messageOf(Object.assign({}, DEF, { source: { table: 'PvDisparue', scope: 'table' } })),
        bad: await messageOf('pas du json'),
        noSource: await messageOf({ v: 1, rows: ['Categorie'], cols: [], value: null }),
        noColumn: await messageOf(Object.assign({}, DEF, { rows: ['Disparue'] })),
        badCalc: await messageOf(Object.assign({}, DEF, { value: { kind: 'formula', formula: '({PvProduits.Stock} * ' } })),
      };
      // Une source qui n'a aucune ligne : la table de la page n'est liée à aucune ligne de produits.
      window.__gristStub.fireRecord({ id: 2, Nom: 'Atlas Sud' }, 'PvAtlas');
      await h.sleep(50);
      window.__gristStub.setRows('PvProduits', PRODUCT_ROWS.map(r => Object.assign({}, r, { Atlas: 1 })));
      const record = { id: 2, Nom: 'Atlas Sud' };
      const emptyBox = await preview(gridHtml(Object.assign({}, DEF, { source: { table: 'PvProduits', scope: 'linked' } })), 'PvAtlas', record);
      out.noRows = { rows: rowTexts(emptyBox).length, text: rowTexts(emptyBox)[1][0] };
      const wrapped = text => /^\[(ERREUR|ERROR)\s*:/.test(text);
      const pass = ['noTable', 'bad', 'noSource', 'noColumn', 'badCalc'].every(k => out[k].rows === 3 && out[k].around && wrapped(out[k].text))
        && /PvDisparue/.test(out.noTable.text) && /Disparue/.test(out.noColumn.text)
        && out.noRows.rows === 3 && wrapped(out.noRows.text);
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'pivot_error_in_one_row',
    description: 'Un produit dont le Stock n’est pas un nombre fait dire son erreur à sa case et aux totaux qui la contiennent, les autres cases restent justes (jamais une somme fausse sans que personne ne le voie)',
    run: async (h) => {
      await seed(h);
      const rowsWith = PRODUCT_ROWS.map(r => (r.id === 4 ? Object.assign({}, r, { Stock: 'beaucoup' }) : r));
      window.__gristStub.setRows('PvProduits', rowsWith.map(r => Object.assign({}, r, { Atlas: r.id % 2 ? 1 : 2 })));
      const box = await preview(gridHtml(DEF));
      const rows = rowTexts(box);
      const electricity = rows[3];
      const wrapped = text => /^\[(ERREUR|ERROR)\s*:/.test(text);
      const total = rows[rows.length - 2];
      // Électricité × Quai contient le produit 4 : case, total de la rangée, total de la colonne Quai et total général disent l'erreur.
      const pass = electricity[0] === 'Électricité' && wrapped(electricity[3]) && wrapped(electricity[4]) && wrapped(total[3]) && wrapped(total[4])
        && !wrapped(electricity[1]) && !wrapped(rows[2][1]) && !wrapped(total[1]);
      return { pass, notes: JSON.stringify(rows) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.pivotZone = cases;
})();
