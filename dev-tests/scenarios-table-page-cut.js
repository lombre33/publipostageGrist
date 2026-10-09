// Suite "tablePageCut" - un tableau se coupe ENTRE deux lignes au saut de page, jamais au milieu d'une ligne : aperçu de l'éditeur, Lecture, PDF et Word
// (demande d'Antoine, 2026-10-01 : « bug d'affichage cf screen un tableau ne se coupe pas au moment du saut de page », modèle « Annexe 7 : Fiche mission »).
//
// Ce que montrait la capture : la bande de saut de page de l'éditeur recouvrait trois lignes du tableau. L'aperçu ne savait couper qu'ENTRE deux blocs, et un tableau en est un :
// il restait sur la page où sa plus grande partie tient et la couture tombait derrière lui ; celle d'avant (calculée avant qu'une police, une bulle de variable ou une image ne
// change la taille du contenu) ne suivait pas non plus. Le PDF coupait une ligne en deux (pdfmake coupe au pixel) et le Word aussi (une ligne peut s'étendre sur deux pages).
//
// La règle (js/table-page-cut.js), la même partout : la ligne qui ne tient pas dans la place restante ouvre la page suivante avec tout ce qui la suit. L'éditeur et la Lecture posent
// la couture sur le haut de cette ligne et la descendent d'autant (rembourrage haut de ses cases, par une feuille de style : le document enregistré n'en sait rien) ; le PDF passe
// dontBreakRows à pdfmake ; le Word met cantSplit sur chaque ligne. Hors règle, le tableau garde son ancien comportement : une ligne plus haute que 90 % de la page (pdfmake la ferait
// DISPARAÎTRE avec dontBreakRows), un tableau dans une colonne, une grille.
//
// Cases fusionnées sur plusieurs lignes (Antoine, 04/10, « Complète » : « une case fusionnée en hauteur reste sur une page, ses lignes passent ensemble ») : les lignes qu'une case lie forment un
// GROUPE que la page ne sépare jamais, il ouvre la page suivante en entier quand il ne tient pas. L'éditeur et la Lecture le comptent comme une seule ligne (TablePageCut.unitsOf) ; le PDF en fait
// UNE ligne de son tableau, dont un tableau imbriqué porte les cases fusionnées (pdfmake perd le texte d'une case fusionnée avec dontBreakRows) ; le Word garde chaque ligne du groupe, sauf la
// dernière, avec la suivante (keepNext). Un groupe plus haut que 90 % de la page garde l'ancien comportement.
//
// Pour que les verdicts ne dépendent pas des polices de la machine, la coupure est CALIBRÉE sur des mesures : la hauteur de la page est réglée pour que la coupure tombe à la moitié de
// la tranche d'une ligne choisie (à une demi-ligne de toute arête, ni l'arrondi ni une police un peu différente ne la déplacent d'une ligne). Le PDF, lui, se juge à ce que pdf.js
// y lit : chaque ligne de texte porte un jeton « R07L1 » (ligne 07, ligne de texte 1) et une ligne de tableau coupée en deux a des jetons sur deux pages.
(function () {
  const cases = [];

  // --- Fixtures ---
  const token = (row, line) => 'R' + String(row).padStart(2, '0') + 'L' + line;
  // Une ligne : `lines` paragraphes « R07L0 », « R07L1 »... dans la première case, une valeur dans la seconde.
  function rowHtml(i, lines) {
    const first = Array.from({ length: lines }, (_, l) => '<p>' + token(i, l) + '</p>').join('');
    return '<tr><td>' + first + '</td><td><p>Valeur ' + i + '</p></td></tr>';
  }
  const rowsHtml = (from, to, lines) => Array.from({ length: to - from }, (_, i) => rowHtml(from + i, lines || 1)).join('');
  const tableHtml = (rows, lines) => '<table><tbody>' + rowsHtml(0, rows, lines) + '</tbody></table>';
  // Le même tableau précédé de `titles` lignes de titres (cases <th>) : « TITREA0 », « TITREB0 »... (B2 du rapport du 04/10 : les titres de colonnes ne revenaient pas sur les pages suivantes).
  const titleRowsHtml = titles => Array.from({ length: titles }, (_, i) => '<tr><th><p>TITREA' + i + '</p></th><th><p>TITREB' + i + '</p></th></tr>').join('');
  const titledTableHtml = (rows, lines, titles) => '<table><tbody>' + titleRowsHtml(titles === undefined ? 1 : titles) + rowsHtml(0, rows, lines) + '</tbody></table>';
  const intro = n => Array.from({ length: n }, (_, i) => '<p>Introduction ' + i + '</p>').join('');
  // Des lignes liées par une case fusionnée : une ligne sur `every` (la première hors celle de rang 0) ouvre un groupe de `span` lignes, dont la première case, fusionnée, porte les jetons de
  // la ligne qui l'ouvre ; dans les lignes qu'elle recouvre, la case d'à côté porte ceux de sa ligne. Chaque ligne a `lines` paragraphes à jeton : la hauteur d'une ligne ne change guère.
  const tokenParas = (row, lines) => Array.from({ length: lines }, (_, l) => '<p>' + token(row, l) + '</p>').join('');
  const groupOpeners = (total, every, span) => { const opens = []; for (let r = 1; r + span <= total; r += every) opens.push(r); return opens; };
  function mergedRowsHtml(total, every, span, lines) {
    const opens = groupOpeners(total, every, span);
    return Array.from({ length: total }, (_, i) => {
      const open = opens.find(o => i >= o && i < o + span);
      if (open === i) return '<tr><td rowspan="' + span + '">' + tokenParas(i, lines) + '</td><td><p>Valeur ' + i + '</p></td></tr>';
      if (open !== undefined) return '<tr><td>' + tokenParas(i, lines) + '</td></tr>';
      return rowHtml(i, lines);
    }).join('');
  }
  const mergedTableHtml = (total, every, span, lines) => '<table><tbody>' + mergedRowsHtml(total, every, span, lines) + '</tbody></table>';
  // Des lignes à hauteur réglée (`data-row-height`, la barre de la case ou la grille) : un minimum, plus haut que le texte (deux lignes de texte font ~50 px, la ligne en prend 70 : le reste de la
  // ligne est de la place libre sous son texte).
  const SET_ROW_PX = 70;
  const setRowHtml = (i, lines) => '<tr data-row-height="' + SET_ROW_PX + '" style="height: ' + SET_ROW_PX + 'px">' + rowHtml(i, lines).replace(/^<tr>/, '').replace(/<\/tr>$/, '') + '</tr>';
  const setHeightTableHtml = (rows, lines) => '<table><tbody>' + Array.from({ length: rows }, (_, i) => setRowHtml(i, lines)).join('') + '</tbody></table>';
  const HEADER_FOOTER = { enabled: true, differentFirstPage: false, header: { default: '<p>EN-TETE</p>', first: '' }, footer: { default: '<p>PIED DE PAGE</p>', first: '' } };
  const NO_HEADER_FOOTER = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };

  // --- Mesures ---
  const pageHeightPx = () => PageLayout.getPageSizePx().height;
  // Règle la hauteur utile d'une page (marges haut/bas seulement : la largeur des blocs, donc leur hauteur, ne bouge pas).
  function setPageContentHeight(contentPx) {
    const halfMm = (pageHeightPx() - contentPx) / 2 / PageLayout.MM_TO_PX;
    PageLayout.setMarginsMm({ top: halfMm, bottom: halfMm, left: PageLayout.DEFAULT_MARGIN_MM, right: PageLayout.DEFAULT_MARGIN_MM });
  }
  const zoomOf = el => {
    const sheet = el.closest('.v2-page-sheet, .reader-content');
    const z = sheet ? parseFloat(getComputedStyle(sheet).zoom) : NaN;
    return (isFinite(z) && z > 0) ? z : 1;
  };
  const layoutHeight = el => el.getBoundingClientRect().height / zoomOf(el);
  const topLevel = root => Array.from(root.children).filter(k => k.tagName !== 'STYLE');
  // Les tranches de hauteur du tableau (cf. TablePageCut.measure) SANS l'effet des coupures déjà posées : le rembourrage que la couture a ajouté au haut d'une ligne est retranché.
  function slicesOf(blockEl, table) {
    const rows = TablePageCut.rowsOf(table);
    const padTop = row => parseFloat(getComputedStyle(row.querySelector('td, th')).paddingTop) || 0;
    const resting = padTop(rows[0]);
    return TablePageCut.measure(blockEl, table, zoomOf(blockEl), 1e6, row => Math.max(0, padTop(row) - resting));
  }
  // Hauteur de page pour que la ligne `k` du tableau soit la première de la page 2 : `before` (ce qui précède le tableau) + les lignes 0 à k-1 + la moitié de la tranche de k.
  const pageHeightForCutBefore = (beforePx, segs, k) => beforePx + segs.slice(0, k).reduce((s, v) => s + v, 0) + segs[k] / 2;

  // Ce que la personne voit d'une page coupée : les bandes de saut de page, et pour chaque ligne le haut de son texte et le bas. Chaque page est une feuille entière (« Pages entières »)
  // : la page qui finit garde une RÉSERVE sous sa dernière ligne, puis la bande (marge du bas, gouttière, marge du haut), puis la ligne qui ouvre la page. `aligned[i]` : rang de la
  // première ligne dont le texte est sous la bande i (-1 : aucune) ; `overlaps` : lignes dont le texte est recouvert par une bande ; `textBelow` : le texte de la ligne qui ouvre la
  // page commence juste sous sa bande (à moins de 14 px : le rembourrage de la case) et la ligne d'avant finit au-dessus ; `reserve[i]` : la place libre entre le bas de cette
  // ligne d'avant et la bande ; `caps[i]` : le liseré qui redessine le trait du haut de la ligne qui ouvre la page (un par bande).
  function seamReport(containerSelector, rowEls) {
    const bands = Array.from(document.querySelectorAll(containerSelector + ' .v2-page-band'));
    const rects = bands.map(b => b.getBoundingClientRect());
    const rows = rowEls.map(row => {
      const paras = Array.from(row.querySelectorAll('p'));
      return { top: row.getBoundingClientRect().top, textTop: paras[0].getBoundingClientRect().top, textBottom: paras[paras.length - 1].getBoundingClientRect().bottom, label: paras[0].textContent };
    });
    const aligned = rects.map(r => rows.findIndex(row => row.textTop >= r.bottom - 1));
    const overlaps = rects.reduce((n, r) => n + rows.filter(row => row.textTop < r.bottom - 0.5 && row.textBottom > r.top + 0.5).length, 0);
    const textBelow = rects.every((r, i) => aligned[i] > 0 && rows[aligned[i]].textTop - r.bottom < 14 && rows[aligned[i] - 1].textBottom <= r.top + 0.5);
    const reserve = rects.map((r, i) => aligned[i] > 0 ? Math.round((r.top - rows[aligned[i] - 1].textBottom) * 10) / 10 : null);
    const caps = bands.map(b => b.querySelectorAll('.v2-page-seam-cap').length);
    return { bands: bands.length, aligned, overlaps, textBelow, reserve, caps, firstOfPage2: aligned.length && aligned[0] >= 0 ? rows[aligned[0]].label : null };
  }
  const editorRows = () => Array.from(document.querySelectorAll('#editor-container .tiptap > .tableWrapper > table > tbody > tr'));
  const readerRows = () => Array.from(document.querySelectorAll('#reader-container .reader-content > table > tbody > tr'));
  const editorReport = () => seamReport('#editor-container', editorRows());
  const readerReport = () => seamReport('#reader-container', readerRows());
  const paginationStyle = () => { const s = document.getElementById('v2-pagination-margins-style'); return s ? s.textContent : ''; };
  // La feuille de la Lecture : une balise <style> posée en dernier enfant de `.reader-content` (js/reader-mode.js:renderPaginationPreview).
  const paginationReaderStyle = () => Array.from(document.querySelectorAll('#reader-container .reader-content > style')).map(el => el.textContent).join('\n');
  const hasRowRule = () => /> tbody > tr:nth-child/.test(paginationStyle());

  async function loadEditor(h, html, opts) {
    opts = opts || {};
    await h.resetEditor();
    h.setA4Preview(true);
    PageLayout.setMarginsMm(null);
    if (opts.headerFooter) Editor.setHeaderFooterData(HEADER_FOOTER);
    Editor.setHTML(html);
    await h.sleep(500);
  }
  const restoreEditor = () => {
    PageLayout.setMarginsMm(null);
    Editor.setHeaderFooterData(NO_HEADER_FOOTER);
    ['editor-container', 'reader-container'].forEach(id => document.getElementById(id).style.removeProperty('--pp-fit-zoom'));
    document.getElementById('reader-container').style.display = '';
    document.getElementById('editor-container').style.display = '';
  };
  // Charge `html` (un tableau précédé de `introLines` paragraphes) dans l'éditeur et règle la page pour que la ligne `k` ouvre la page 2.
  async function editorCutBefore(h, html, k, wrapperIndex) {
    await loadEditor(h, html);
    const kids = Array.from(h.tiptap().children);
    const wrappers = kids.filter(el => el.classList.contains('tableWrapper'));
    const wrapper = wrappers[wrapperIndex || 0];
    const before = kids.slice(0, kids.indexOf(wrapper)).reduce((sum, el) => sum + layoutHeight(el), 0);
    const m = slicesOf(wrapper, wrapper.querySelector('table'));
    const savedHtml = Editor.getHTML();
    setPageContentHeight(pageHeightForCutBefore(before, m.segs, k));
    Editor.refreshPaginationPreview();
    await h.sleep(400);
    return { before, segs: m.segs, savedHtml };
  }
  async function readerCutBefore(h, html, k, pageContentPx) {
    // Mesure d'abord à marges par défaut, comme l'éditeur ; `pageContentPx` (la hauteur réglée pour l'éditeur) est repris tel quel s'il est donné.
    await h.resetEditor();
    h.setA4Preview(true);
    PageLayout.setMarginsMm(null);
    let wrapper = await h.renderReaderMode(html);
    await h.sleep(250);
    const table = wrapper.querySelector(':scope > table');
    const kids = topLevel(wrapper);
    const before = kids.slice(0, kids.indexOf(table)).reduce((sum, el) => sum + layoutHeight(el), 0);
    const m = slicesOf(table, table);
    setPageContentHeight(pageContentPx != null ? pageContentPx : pageHeightForCutBefore(before, m.segs, k));
    await h.renderReaderMode(html);
    await h.sleep(400);
    return { before, segs: m.segs };
  }

  // --- Module : TablePageCut (pur, sans page) ---
  cases.push({
    id: 'table_page_cut_plan_cuts_before_the_first_row_that_does_not_fit',
    description: 'plan() : les lignes tiennent tant que la page a de la place, la première qui ne tient pas ouvre la page suivante (et le total de la page recommence à elle)',
    run: async () => {
      const allFit = TablePageCut.plan(0, [20, 20, 20], 100);
      const oneCut = TablePageCut.plan(0, [40, 40, 40, 40], 100);
      const afterContent = TablePageCut.plan(30, [40, 40, 40], 100);
      const pass = allFit.cuts.length === 0 && !allFit.blockBreakBefore && allFit.consumedAfter === 60
        && JSON.stringify(oneCut.cuts) === '[2]' && oneCut.consumedAfter === 80
        && JSON.stringify(afterContent.cuts) === '[1]' && afterContent.consumedAfter === 80;
      return { pass, notes: JSON.stringify({ allFit, oneCut, afterContent }) };
    },
  });

  cases.push({
    id: 'table_page_cut_plan_first_row_that_does_not_fit_moves_the_whole_table',
    description: 'plan() : si même la première ligne ne tient pas dans la place restante, tout le tableau passe à la page suivante ; en haut de page, une ligne trop haute reste là',
    run: async () => {
      const moved = TablePageCut.plan(80, [40, 40], 100);
      const atTop = TablePageCut.plan(0, [150, 40], 100);
      const pass = moved.blockBreakBefore && moved.cuts.length === 0 && moved.consumedAfter === 80
        && !atTop.blockBreakBefore && JSON.stringify(atTop.cuts) === '[1]' && atTop.consumedAfter === 40;
      return { pass, notes: JSON.stringify({ moved, atTop }) };
    },
  });

  cases.push({
    id: 'table_page_cut_plan_many_pages',
    description: 'plan() : un tableau de plusieurs pages se coupe à chaque page pleine, et le reste de la dernière page est rendu pour le bloc suivant',
    run: async () => {
      const r = TablePageCut.plan(0, Array.from({ length: 10 }, () => 30), 100);
      return { pass: JSON.stringify(r.cuts) === '[3,6,9]' && r.consumedAfter === 30 && !r.blockBreakBefore, notes: JSON.stringify(r) };
    },
  });

  cases.push({
    id: 'table_page_cut_rows_that_fit_guard',
    description: 'rowsFit() : une ligne qui dépasse 90 % de la page sort de la règle (pdfmake, avec dontBreakRows, la ferait disparaître du PDF) ; 90 % tout juste, non',
    run: async () => {
      const pass = TablePageCut.rowsFit([50, 60], 100) && TablePageCut.rowsFit([90], 100) && !TablePageCut.rowsFit([50, 95], 100) && !TablePageCut.rowsFit([101], 100);
      return { pass, notes: 'MAX_ROW_RATIO=' + TablePageCut.MAX_ROW_RATIO };
    },
  });

  cases.push({
    id: 'table_page_cut_rows_of_only_tables_that_can_be_cut',
    description: 'rowsOf() : un tableau simple, ou dont des cases occupent plusieurs lignes, ou dont des lignes ont une hauteur réglée (grille), donne ses lignes ; une ligne seule, un en-tête ou aucun tableau donnent null',
    run: async () => {
      const make = html => { const host = document.createElement('div'); host.innerHTML = html; return host.querySelector('table'); };
      const cells = n => '<td>a</td>'.repeat(n);
      const plain = make('<table><tbody><tr>' + cells(2) + '</tr><tr>' + cells(2) + '</tr><tr>' + cells(2) + '</tr></tbody></table>');
      const oneRow = make('<table><tbody><tr>' + cells(2) + '</tr></tbody></table>');
      const withHead = make('<table><thead><tr><th>t</th></tr></thead><tbody><tr>' + cells(1) + '</tr><tr>' + cells(1) + '</tr></tbody></table>');
      const merged = make('<table><tbody><tr><td rowspan="2">a</td><td>b</td></tr><tr><td>c</td></tr><tr>' + cells(2) + '</tr></tbody></table>');
      const grid = make('<table><tbody><tr data-row-height="30">' + cells(2) + '</tr><tr data-row-height="30">' + cells(2) + '</tr></tbody></table>');
      const suggested = make('<table><tbody><tr>' + cells(2) + '</tr><ins><tr>' + cells(2) + '</tr></ins><tr>' + cells(2) + '</tr></tbody></table>');
      const got = { plain: (TablePageCut.rowsOf(plain) || []).length, oneRow: TablePageCut.rowsOf(oneRow), withHead: TablePageCut.rowsOf(withHead), merged: TablePageCut.rowsOf(merged), grid: TablePageCut.rowsOf(grid), none: TablePageCut.rowsOf(null) };
      // Les lignes à hauteur réglée se coupent comme les autres (leur hauteur est gardée par padRule) : elles ne sortent plus de la règle.
      const pass = got.plain === 3 && got.oneRow === null && got.withHead === null && got.merged.length === 3 && got.grid.length === 2 && got.none === null;
      return { pass, notes: JSON.stringify(Object.assign(got, { merged: (got.merged || []).length, grid: (got.grid || []).length, suggestedRows: (TablePageCut.rowsOf(suggested) || []).length })) };
    },
  });

  cases.push({
    id: 'table_page_cut_units_group_the_rows_a_merged_cell_links',
    description: 'unitsOf() : une ligne par groupe sans case fusionnée ; une case qui occupe plusieurs lignes lie les siennes ; deux fusions qui se chevauchent n\'en font qu\'un ; un rowspan qui dépasse le bas est ramené au tableau ; une case d\'un tableau imbriqué ou une case en suggestion (<ins>) ne se confondent pas',
    run: async () => {
      const make = html => { const host = document.createElement('div'); host.innerHTML = html; return host.querySelector('table'); };
      const describe = tableEl => TablePageCut.unitsOf(TablePageCut.rowsOf(tableEl)).map(u => u.from + '-' + u.to).join(' ');
      const unitsOf = html => describe(make(html));
      const cell = (extra) => '<td' + (extra || '') + '>a</td>';
      const row = (...cells) => '<tr>' + cells.join('') + '</tr>';
      const table = (...rows) => '<table><tbody>' + rows.join('') + '</tbody></table>';
      const got = {
        plain: unitsOf(table(row(cell(), cell()), row(cell(), cell()), row(cell(), cell()))),
        top: unitsOf(table(row(cell(' rowspan="2"'), cell()), row(cell()), row(cell(), cell()))),
        middle: unitsOf(table(row(cell(), cell()), row(cell(' rowspan="3"'), cell()), row(cell()), row(cell()), row(cell(), cell()))),
        chained: unitsOf(table(row(cell(' rowspan="2"'), cell()), row(cell(' rowspan="2"')), row(cell()), row(cell(), cell()))),
        pastTheBottom: unitsOf(table(row(cell(), cell()), row(cell(' rowspan="9"'), cell()), row(cell()))),
        wholeTable: unitsOf(table(row(cell(' rowspan="3"'), cell(' rowspan="3"')), row(), row())),
        nested: unitsOf(table(row('<td><table><tbody><tr><td rowspan="2">x</td></tr><tr><td>y</td></tr></tbody></table></td>'), row(cell()), row(cell()))),
      };
      // Une colonne proposée en suivi des modifications enveloppe ses cases dans un <ins> (le DOM de l'éditeur ; le HTML écrit à la main le sortirait du tableau).
      const suggestedTable = make(table(row(cell(), cell()), row(cell(' rowspan="2"'), cell()), row(cell()), row(cell(), cell())));
      const spanning = suggestedTable.querySelector('td[rowspan]');
      const wrapper = document.createElement('ins');
      spanning.replaceWith(wrapper);
      wrapper.appendChild(spanning);
      got.suggested = describe(suggestedTable);
      const pass = got.plain === '0-1 1-2 2-3' && got.top === '0-2 2-3' && got.middle === '0-1 1-4 4-5' && got.chained === '0-3 3-4' && got.pastTheBottom === '0-1 1-3'
        && got.wholeTable === '0-3' && got.nested === '0-1 1-2 2-3' && got.suggested === '0-1 1-3 3-4';
      return { pass, notes: JSON.stringify(got) };
    },
  });

  cases.push({
    id: 'table_page_cut_plan_maps_the_cuts_to_the_rows_that_open_a_page',
    description: 'plan() avec `starts` : une coupure devant une tranche qui groupe plusieurs lignes ouvre la page sur la première ligne du groupe (`cuts` en rangs de ligne, `ranks` en rangs de tranche) ; sans `starts`, une tranche est une ligne',
    run: async () => {
      // Six lignes, les lignes 2 à 4 liées : quatre tranches, de 40 + 40 + 60 + 50.
      const starts = [0, 1, 2, 5];
      const withGroup = TablePageCut.plan(0, [40, 40, 60, 50], 100, starts);
      const alone = TablePageCut.plan(0, [40, 40, 60, 50], 100);
      const pass = JSON.stringify(withGroup.cuts) === '[2,5]' && JSON.stringify(withGroup.ranks) === '[2,3]' && withGroup.consumedAfter === 50 && !withGroup.blockBreakBefore
        && JSON.stringify(alone.cuts) === '[2,3]' && JSON.stringify(alone.ranks) === '[2,3]';
      return { pass, notes: JSON.stringify({ withGroup, alone }) };
    },
  });

  cases.push({
    id: 'table_page_cut_pad_rule_reaches_cells_wrapped_for_suggestions',
    description: 'padRule() : la règle descend la ligne visée, qu\'elle porte ses cases directement ou dans un <ins>/<del>/<span> (colonne proposée en suivi), et laisse les autres lignes',
    run: async () => {
      const host = document.createElement('div');
      host.id = 'pcut-pad-host';
      host.innerHTML = '<table><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><ins><td>d</td></ins></tr><tr><td>e</td><td>f</td></tr></tbody></table>';
      const style = document.createElement('style');
      style.textContent = TablePageCut.padRule('#pcut-pad-host table', 1, 33);
      document.body.append(host, style);
      try {
        const pad = el => Math.round(parseFloat(getComputedStyle(el).paddingTop));
        const cells = Array.from(host.querySelectorAll('td'));
        const got = cells.map(pad);
        // Les cases de la ligne 2 (rang 1) : c et d ; les autres gardent leur rembourrage au repos (même valeur que a).
        const pass = got[2] === 33 && got[3] === 33 && got[0] === got[4] && got[1] === got[5] && got[0] !== 33;
        return { pass, notes: JSON.stringify(got) };
      } finally { host.remove(); style.remove(); }
    },
  });

  cases.push({
    id: 'table_page_cut_pad_rule_grows_a_row_of_a_set_height_by_the_same_amount',
    description: 'padRule() avec la hauteur réglée de la ligne : la ligne grandit de la descente (sa hauteur réglée en plus du rembourrage), sinon le reste de sa hauteur absorbe le rembourrage et ce qui la suit ne descend pas ; sans hauteur réglée la règle ne touche pas à la hauteur ; fixedHeightPx() lit `data-row-height` (rien si la marque manque, vaut 0 ou n\'est pas un nombre)',
    run: async () => {
      const host = document.createElement('div');
      host.id = 'pcut-height-host';
      host.innerHTML = '<table><tbody><tr><td>a</td></tr><tr data-row-height="80" style="height: 80px"><td>b</td></tr><tr><td>c</td></tr></tbody></table>';
      const style = document.createElement('style');
      document.body.append(host, style);
      try {
        const rows = Array.from(host.querySelectorAll('tr'));
        // La place que prennent les deux premières lignes : le bas de la page, où le champ de test est posé, ne tient pas le haut du tableau en place.
        const nextTop = () => rows[2].getBoundingClientRect().top - rows[0].getBoundingClientRect().top;
        const rest = { height: rows[1].getBoundingClientRect().height, nextTop: nextTop() };
        const fixed = TablePageCut.fixedHeightPx(rows[1]);
        // Avant : le rembourrage de 60 px tient dans les 80 px de la ligne, qui ne grandit pas (c'est la défaillance que la hauteur réglée corrige).
        style.textContent = TablePageCut.padRule('#pcut-height-host table', 1, 60);
        const padded = { height: rows[1].getBoundingClientRect().height, nextTop: nextTop() };
        style.textContent = TablePageCut.padRule('#pcut-height-host table', 1, 60, fixed, 40);
        const grown = { height: rows[1].getBoundingClientRect().height, nextTop: nextTop() };
        const marks = [null, '0', 'abc', '45'].map((value) => {
          const tr = document.createElement('tr');
          if (value !== null) tr.setAttribute('data-row-height', value);
          return TablePageCut.fixedHeightPx(tr);
        });
        const pass = fixed === 80 && Math.abs(rest.height - 80) <= 1.5
          && Math.abs(padded.nextTop - rest.nextTop) <= 1.5
          && Math.abs(grown.height - (rest.height + 40)) <= 1.5 && Math.abs(grown.nextTop - (rest.nextTop + 40)) <= 1.5
          && JSON.stringify(marks) === '[null,null,null,45]' && TablePageCut.fixedHeightPx(null) === null;
        return { pass, notes: JSON.stringify({ fixed, rest, padded, grown, marks }) };
      } finally { host.remove(); style.remove(); }
    },
  });

  cases.push({
    id: 'table_page_cut_clip_rule_leaves_a_hole_per_strip',
    description: 'clipRule() : un grand rectangle moins une bande par coupure (path evenodd), la règle vise le bloc donné',
    run: async () => {
      const none = TablePageCut.clipRule('.x', []);
      const two = TablePageCut.clipRule('#a > *:nth-child(3)', [{ top: 10.5, bottom: 20 }, { top: 40, bottom: 52.25 }]);
      const holes = (two.match(/M-100000 /g) || []).length;
      const pass = /^\.x \{ clip-path: path\(evenodd, "M-100000 -100000H100000V100000H-100000Z"\); \}$/.test(none)
        && two.indexOf('#a > *:nth-child(3) { clip-path: path(evenodd, "') === 0 && holes === 3
        && two.includes('M-100000 10.5H100000V20H-100000Z') && two.includes('M-100000 40H100000V52.25H-100000Z');
      return { pass, notes: JSON.stringify({ none, two }) };
    },
  });

  // --- Éditeur : la couture tombe ENTRE deux lignes ---
  cases.push({
    id: 'table_page_cut_editor_seam_falls_between_two_rows',
    description: 'Éditeur : un tableau qui chevauche le saut de page se coupe entre deux lignes - la bande est posée sur le haut de la ligne qui ouvre la page 2, aucun texte de ligne dessous, deux liserés de tableau, document enregistré inchangé',
    run: async (h) => {
      try {
        const k = 12;
        const cut = await editorCutBefore(h, intro(2) + tableHtml(24, 2), k);
        const rep = editorReport();
        const html = Editor.getHTML();
        const pass = rep.bands === 1 && rep.aligned[0] === k && rep.overlaps === 0 && rep.textBelow && rep.caps[0] === 1 && hasRowRule()
          && html === cut.savedHtml && !/padding-top/.test(html);
        return { pass, notes: JSON.stringify(Object.assign({ k, htmlUnchanged: html === cut.savedHtml, rowRule: hasRowRule() }, rep)) };
      } finally { restoreEditor(); }
    },
  });

  cases.push({
    id: 'table_page_cut_editor_each_page_of_a_long_table_is_cut_between_rows',
    description: 'Éditeur : un tableau de trois pages a deux coupures, chacune entre deux lignes et sans texte recouvert',
    run: async (h) => {
      try {
        await editorCutBefore(h, intro(1) + tableHtml(60, 1), 20);
        const rep = editorReport();
        const pass = rep.bands === 2 && rep.aligned[0] === 20 && rep.aligned[1] > 20 && rep.overlaps === 0 && rep.textBelow;
        return { pass, notes: JSON.stringify(rep) };
      } finally { restoreEditor(); }
    },
  });

  // Feuilles entières (« Pages entières ») : la page qui finit garde une réserve sous sa dernière LIGNE (non sous le tableau), pour que chaque page vaille exactement la hauteur
  // utile B. Lue à la bande : de la bande 1 au haut du corps de la page 1, B ; entre la bande 1 (son bas, le haut du corps de la page 2) et la bande 2, B encore.
  cases.push({
    id: 'table_page_cut_editor_each_page_is_a_whole_sheet',
    description: 'Éditeur : chaque page d\'un tableau coupé vaut exactement la hauteur utile - la bande vient une page après le haut du corps, la réserve sous la dernière ligne comprise, et la ligne qui ouvre la page recommence juste sous la bande',
    run: async (h) => {
      try {
        await editorCutBefore(h, intro(1) + tableHtml(60, 1), 20);
        const tip = h.tiptap();
        const z = zoomOf(tip);
        const padTop = parseFloat(getComputedStyle(tip).paddingTop) || 0;
        const margins = PageLayout.getMarginsPx();
        const bodyPx = PageLayout.getPageSizePx().height - margins.top - margins.bottom;
        const rects = Array.from(document.querySelectorAll('#editor-container .v2-page-band')).map(b => b.getBoundingClientRect());
        const rep = editorReport();
        const firstPage = rects.length ? (rects[0].top - tip.getBoundingClientRect().top) / z - padTop : NaN;
        const secondPage = rects.length > 1 ? (rects[1].top - rects[0].bottom) / z : NaN;
        const pass = rects.length === 2 && Math.abs(firstPage - bodyPx) <= 1.5 && Math.abs(secondPage - bodyPx) <= 1.5 && rep.reserve.every(r => r != null && r >= 0) && rep.textBelow && rep.overlaps === 0;
        return { pass, notes: JSON.stringify({ bodyPx: Math.round(bodyPx * 10) / 10, firstPage: Math.round(firstPage * 10) / 10, secondPage: Math.round(secondPage * 10) / 10, reserve: rep.reserve }) };
      } finally { restoreEditor(); }
    },
  });

  // Une ligne à hauteur réglée (barre de la case, grille) a de la place libre sous son texte : le rembourrage de la couture y tiendrait sans descendre la ligne suivante, et la page d'après
  // commencerait trop haut. La ligne grandit donc de la descente (padRule, `fixedHeightPx`), et le tableau se coupe comme un autre.
  cases.push({
    id: 'table_page_cut_editor_rows_of_a_set_height_are_cut_between_rows_and_each_page_is_a_whole_sheet',
    description: 'Éditeur : un tableau dont les lignes ont une hauteur réglée se coupe entre deux lignes comme un autre - la bande est sur le haut de la ligne qui ouvre la page, le texte juste dessous, rien de recouvert - et chaque page vaut la hauteur utile (la ligne descendue grandit de la descente, sa hauteur réglée comprise) ; document enregistré inchangé',
    run: async (h) => {
      try {
        const k = 12;
        const cut = await editorCutBefore(h, intro(1) + setHeightTableHtml(30, 2), k);
        const tip = h.tiptap();
        const z = zoomOf(tip);
        const padTop = parseFloat(getComputedStyle(tip).paddingTop) || 0;
        const margins = PageLayout.getMarginsPx();
        const bodyPx = PageLayout.getPageSizePx().height - margins.top - margins.bottom;
        const rects = Array.from(document.querySelectorAll('#editor-container .v2-page-band')).map(b => b.getBoundingClientRect());
        const rep = editorReport();
        const firstPage = rects.length ? (rects[0].top - tip.getBoundingClientRect().top) / z - padTop : NaN;
        const secondPage = rects.length > 1 ? (rects[1].top - rects[0].bottom) / z : NaN;
        const html = Editor.getHTML();
        const heightRule = /tr:nth-child\(\d+\) \{ height: [\d.]+px !important; \}/.test(paginationStyle());
        const pass = rects.length === 2 && rep.aligned[0] === k && rep.aligned[1] > k && rep.overlaps === 0 && rep.textBelow && rep.caps.every(n => n === 1) && hasRowRule() && heightRule
          && Math.abs(firstPage - bodyPx) <= 1.5 && Math.abs(secondPage - bodyPx) <= 1.5 && rep.reserve.every(r => r != null && r >= 0)
          && html === cut.savedHtml && !/padding-top/.test(html);
        return { pass, notes: JSON.stringify({ bodyPx: Math.round(bodyPx * 10) / 10, firstPage: Math.round(firstPage * 10) / 10, secondPage: Math.round(secondPage * 10) / 10, heightRule, htmlUnchanged: html === cut.savedHtml, rep }) };
      } finally { restoreEditor(); }
    },
  });

  // La ligne descendue sous la couture est peinte avec son rembourrage (fond et traits verticaux des cases) : sans rognage, ces traits traverseraient la réserve et les marges de la
  // couture, qui sont transparentes (c'est la feuille qui est blanche). Le tableau est rogné de juste sous le trait du bas de la dernière ligne de la page jusqu'au bas de la bande.
  cases.push({
    id: 'table_page_cut_editor_table_is_clipped_between_the_last_row_and_the_band_bottom',
    description: 'Éditeur : le tableau est rogné (clip-path) du dessous de la dernière ligne de la page qui finit jusqu\'au bas de la bande de saut de page, et pas plus',
    run: async (h) => {
      try {
        const k = 12;
        await editorCutBefore(h, intro(2) + tableHtml(24, 2), k);
        const wrapper = h.tiptap().querySelector(':scope > .tableWrapper');
        const rows = editorRows();
        const band = document.querySelector('#editor-container .v2-page-band').getBoundingClientRect();
        const z = zoomOf(wrapper);
        const wrapperTop = wrapper.getBoundingClientRect().top;
        const m = /clip-path: path\(evenodd, "M-100000 -100000H100000V100000H-100000ZM-100000 (-?[\d.]+)H100000V(-?[\d.]+)H-100000Z"\)/.exec(paginationStyle());
        const stripTop = m ? parseFloat(m[1]) : NaN;
        const stripBottom = m ? parseFloat(m[2]) : NaN;
        const expectedTop = (rows[k - 1].getBoundingClientRect().bottom - wrapperTop) / z + 1;
        const expectedBottom = (band.bottom - wrapperTop) / z;
        const pass = !!m && getComputedStyle(wrapper).clipPath !== 'none' && Math.abs(stripTop - expectedTop) <= 1 && Math.abs(stripBottom - expectedBottom) <= 1 && stripBottom > stripTop;
        return { pass, notes: JSON.stringify({ stripTop, expectedTop, stripBottom, expectedBottom, clipPath: getComputedStyle(wrapper).clipPath.slice(0, 40) }) };
      } finally { restoreEditor(); }
    },
  });

  cases.push({
    id: 'table_page_cut_editor_second_table_after_text_and_a_first_table',
    description: 'Éditeur : ce que la page porte déjà (un texte, un premier tableau) est compté avant la coupure d\'un second tableau',
    run: async (h) => {
      try {
        // 15 lignes dans le premier tableau, la coupure au rang 5 du second : rang 20 parmi les lignes des deux tableaux.
        await editorCutBefore(h, intro(1) + tableHtml(15, 1) + '<p>Entre les deux tableaux</p>' + tableHtml(15, 1), 5, 1);
        const rep = editorReport();
        const pass = rep.bands === 1 && rep.aligned[0] === 20 && rep.overlaps === 0 && rep.textBelow;
        return { pass, notes: JSON.stringify(rep) };
      } finally { restoreEditor(); }
    },
  });

  cases.push({
    id: 'table_page_cut_editor_first_row_that_does_not_fit_moves_the_table',
    description: 'Éditeur : quand même la première ligne ne tient pas dans la place restante, le tableau entier passe à la page suivante (la bande est avant lui, aucune ligne n\'est descendue)',
    run: async (h) => {
      try {
        await loadEditor(h, intro(30) + tableHtml(6, 1));
        const kids = Array.from(h.tiptap().children);
        const wrapper = kids.find(el => el.classList.contains('tableWrapper'));
        const before = kids.slice(0, kids.indexOf(wrapper)).reduce((sum, el) => sum + layoutHeight(el), 0);
        const m = slicesOf(wrapper, wrapper.querySelector('table'));
        setPageContentHeight(before + m.segs[0] / 2);
        Editor.refreshPaginationPreview();
        await h.sleep(400);
        const band = document.querySelector('#editor-container .v2-page-band');
        const rows = editorRows();
        const bandRect = band && band.getBoundingClientRect();
        const firstText = rows[0].querySelector('p').getBoundingClientRect();
        const pass = document.querySelectorAll('#editor-container .v2-page-band').length === 1 && !!bandRect && !hasRowRule()
          && bandRect.bottom <= wrapper.getBoundingClientRect().top + 1.5 && firstText.top >= bandRect.bottom - 1;
        return { pass, notes: JSON.stringify({ bandBottom: bandRect && Math.round(bandRect.bottom), tableTop: Math.round(wrapper.getBoundingClientRect().top), rowRule: hasRowRule() }) };
      } finally { restoreEditor(); }
    },
  });

  cases.push({
    id: 'table_page_cut_editor_page_grid_follows_the_cut',
    description: 'Éditeur : la grille de page (computePageGridPosition, qui place les images en calque) met une ligne d\'avant la coupure en page 1 et une ligne d\'après en page 2, à la hauteur de sa ligne',
    run: async (h) => {
      try {
        const k = 12;
        await editorCutBefore(h, intro(2) + tableHtml(24, 2), k);
        const rows = editorRows();
        const para = (i, l) => rows[i].querySelectorAll('p')[l];
        const above = HeaderFooterPreview.computePageGridPosition(para(k - 1, 1));
        const first = HeaderFooterPreview.computePageGridPosition(para(k, 0));
        const second = HeaderFooterPreview.computePageGridPosition(para(k + 1, 0));
        const lastRowAfter = HeaderFooterPreview.computePageGridPosition(para(23, 1));
        // Le premier paragraphe de la page 2 est tout en haut : un rembourrage de case (3 pt) et quelques points, jamais la hauteur d'une couture (28 px d'espace + les zones).
        const pass = above.pageIndex === 0 && first.pageIndex === 1 && second.pageIndex === 1 && lastRowAfter.pageIndex === 1
          && first.pageTopPt >= 0 && first.pageTopPt < 12 && second.pageTopPt > first.pageTopPt;
        return { pass, notes: JSON.stringify({ above, first, second, lastRowAfter }) };
      } finally { restoreEditor(); }
    },
  });

  cases.push({
    id: 'table_page_cut_editor_with_header_and_footer',
    description: 'Éditeur : avec un en-tête et un pied de page (la couture est alors la grande bande à deux zones), chaque coupure de tableau tombe entre deux lignes, sans texte recouvert',
    run: async (h) => {
      try {
        await loadEditor(h, tableHtml(48, 1), { headerFooter: true });
        Editor.refreshPaginationPreview();
        await h.sleep(400);
        const rep = editorReport();
        const seamWithZones = !!document.querySelector('#editor-container .v2-page-seam');
        const pass = seamWithZones && rep.bands >= 1 && rep.aligned.every(i => i > 0) && rep.overlaps === 0 && rep.textBelow && rep.caps.every(n => n === 1);
        return { pass, notes: JSON.stringify(Object.assign({ seamWithZones }, rep)) };
      } finally { restoreEditor(); }
    },
  });

  cases.push({
    id: 'table_page_cut_editor_sheet_reduced_by_the_fit_zoom',
    description: 'Éditeur : la feuille réduite pour tenir dans le panneau (facteur d\'ajustement) coupe au même rang, la bande toujours entre deux lignes',
    run: async (h) => {
      try {
        const k = 12;
        document.getElementById('editor-container').style.setProperty('--pp-fit-zoom', '0.8');
        await editorCutBefore(h, intro(2) + tableHtml(24, 2), k);
        const rep = editorReport();
        const zoom = zoomOf(h.tiptap());
        const pass = Math.abs(zoom - 0.8) < 0.001 && rep.bands === 1 && rep.aligned[0] === k && rep.overlaps === 0 && rep.textBelow;
        return { pass, notes: JSON.stringify(Object.assign({ zoom }, rep)) };
      } finally { restoreEditor(); }
    },
  });

  cases.push({
    id: 'table_page_cut_editor_seam_follows_content_that_grows_without_a_keystroke',
    description: 'Éditeur : le contenu qui grossit sans qu\'une touche soit frappée (police qui finit de charger, bulle de variable, image) fait recalculer la couture, qui reste entre deux lignes au lieu de rester à son ancienne place',
    run: async (h) => {
      const style = document.createElement('style');
      style.id = 'pcut-test-grow';
      try {
        await editorCutBefore(h, intro(2) + tableHtml(24, 1), 12);
        const before = editorReport();
        style.textContent = '#editor-container .tiptap td p { font-size: 15pt !important; }';
        document.head.appendChild(style);
        await h.sleep(1300);
        const after = editorReport();
        const pass = before.bands === 1 && before.aligned[0] === 12 && after.bands >= 1 && after.aligned.every(i => i > 0) && after.aligned[0] < 12 && after.overlaps === 0 && after.textBelow;
        return { pass, notes: JSON.stringify({ before, after }) };
      } finally { style.remove(); restoreEditor(); }
    },
  });

  cases.push({
    id: 'table_page_cut_editor_row_taller_than_the_page_keeps_the_old_rule',
    description: 'Éditeur : une ligne plus haute que 90 % de la page sort de la règle - aucune ligne n\'est descendue, le tableau garde son comportement d\'avant (comme le PDF, qui ne peut pas la ranger sans la perdre)',
    run: async (h) => {
      try {
        await loadEditor(h, intro(1) + '<table><tbody>' + rowsHtml(0, 2, 1) + rowHtml(2, 22) + rowsHtml(3, 6, 1) + '</tbody></table>');
        setPageContentHeight(300);
        Editor.refreshPaginationPreview();
        await h.sleep(400);
        const table = h.tiptap().querySelector('table');
        const row = TablePageCut.rowsOf(table)[2];
        const tall = row.getBoundingClientRect().height / zoomOf(row);
        const pass = tall > 0.9 * 300 && !hasRowRule();
        return { pass, notes: JSON.stringify({ tallRowPx: Math.round(tall), pageContentPx: 300, rowRule: hasRowRule() }) };
      } finally { restoreEditor(); }
    },
  });

  // Cases fusionnées sur plusieurs lignes : les lignes liées forment un groupe, il passe en entier à la page suivante. Les groupes de ces tableaux : une ligne sur 7 (à partir de la ligne 1)
  // en ouvre un de 4 lignes - lignes 1 à 4, 8 à 11, 15 à 18 (mergedRowsHtml). Une coupure se vise par le rang de la tranche (un groupe est une tranche : editorCutBefore), la ligne
  // d'ouverture se lit à la bande.
  const MERGED_EVERY = 7;
  const MERGED_SPAN = 4;
  // Rang de tranche (groupe ou ligne) d'une ligne, et ligne qui ouvre la tranche de rang `rank` : pour viser une coupure par son rang de tranche et la lire à son rang de ligne.
  const sliceRankOfRow = (rows, row) => TablePageCut.unitsOf(rows).findIndex(unit => row >= unit.from && row < unit.to);
  // La bande de saut de page et les lignes du groupe de lignes `from` à `to - 1`, telles que la personne les voit : le groupe est-il tout entier sous la bande ou tout entier au-dessus ?
  function groupSide(containerSelector, rowEls, from, to) {
    const band = document.querySelector(containerSelector + ' .v2-page-band').getBoundingClientRect();
    const texts = rowEls.slice(from, to).flatMap(row => Array.from(row.querySelectorAll('p')).map(p => p.getBoundingClientRect()));
    return { below: texts.every(t => t.top >= band.bottom - 1), above: texts.every(t => t.bottom <= band.top + 0.5) };
  }

  cases.push({
    id: 'table_page_cut_editor_merged_rows_pass_together_to_the_next_page',
    description: 'Éditeur : quand la coupure tomberait au milieu des lignes qu\'une case fusionnée lie, ces lignes passent toutes à la page suivante - la bande est posée sur la première ligne du groupe, aucune de ses lignes au-dessus, aucun texte recouvert, document enregistré inchangé',
    run: async (h) => {
      try {
        const html = intro(2) + mergedTableHtml(24, MERGED_EVERY, MERGED_SPAN, 2);
        // Le groupe des lignes 8 à 11 : la page est réglée pour que la coupure tombe à la moitié de sa tranche.
        await loadEditor(h, html);
        const rows0 = TablePageCut.rowsOf(h.tiptap().querySelector('table'));
        const rank = sliceRankOfRow(rows0, 1 + MERGED_EVERY);
        const cut = await editorCutBefore(h, html, rank);
        const rep = editorReport();
        const saved = Editor.getHTML();
        const group = groupSide('#editor-container', editorRows(), 1 + MERGED_EVERY, 1 + MERGED_EVERY + MERGED_SPAN);
        const pass = rep.bands >= 1 && rep.aligned[0] === 1 + MERGED_EVERY && rep.overlaps === 0 && rep.textBelow && rep.caps.every(n => n === 1) && hasRowRule() && group.below
          && saved === cut.savedHtml && !/padding-top/.test(saved);
        return { pass, notes: JSON.stringify(Object.assign({ rank, group, htmlUnchanged: saved === cut.savedHtml }, rep)) };
      } finally { restoreEditor(); }
    },
  });

  cases.push({
    id: 'table_page_cut_editor_merged_rows_that_fit_stay_on_their_page',
    description: 'Éditeur : un groupe de lignes liées qui tient dans la page reste sur sa page - la coupure d\'après tombe juste après lui, sur la ligne qui le suit, et tout le groupe est au-dessus de la bande',
    run: async (h) => {
      try {
        const html = intro(2) + mergedTableHtml(24, MERGED_EVERY, MERGED_SPAN, 2);
        await loadEditor(h, html);
        const rows0 = TablePageCut.rowsOf(h.tiptap().querySelector('table'));
        // La coupure à la moitié de la tranche qui suit le groupe des lignes 8 à 11 : le groupe tient, la ligne 12 ouvre la page.
        const rank = sliceRankOfRow(rows0, 1 + MERGED_EVERY + MERGED_SPAN);
        await editorCutBefore(h, html, rank);
        const rep = editorReport();
        const group = groupSide('#editor-container', editorRows(), 1 + MERGED_EVERY, 1 + MERGED_EVERY + MERGED_SPAN);
        const pass = rep.bands === 1 && rep.aligned[0] === 1 + MERGED_EVERY + MERGED_SPAN && rep.overlaps === 0 && rep.textBelow && group.above;
        return { pass, notes: JSON.stringify(Object.assign({ rank, group }, rep)) };
      } finally { restoreEditor(); }
    },
  });

  cases.push({
    id: 'table_page_cut_editor_each_page_of_a_merged_table_is_cut_between_groups',
    description: 'Éditeur : un tableau à cases fusionnées de plusieurs pages a plusieurs coupures, chacune entre deux groupes de lignes - jamais au milieu d\'un groupe, aucun texte recouvert',
    run: async (h) => {
      try {
        await editorCutBefore(h, intro(1) + mergedTableHtml(60, MERGED_EVERY, MERGED_SPAN, 1), 8);
        const rep = editorReport();
        const rows = editorRows();
        const units = TablePageCut.unitsOf(TablePageCut.rowsOf(h.tiptap().querySelector('table')));
        const startsAGroup = row => units.some(unit => unit.from === row);
        const pass = rep.bands >= 2 && rep.aligned.every(startsAGroup) && rep.overlaps === 0 && rep.textBelow && rows.length === 60;
        return { pass, notes: JSON.stringify(Object.assign({ groups: units.filter(u => u.to - u.from > 1).map(u => u.from + '-' + u.to).join(' ') }, rep)) };
      } finally { restoreEditor(); }
    },
  });

  cases.push({
    id: 'table_page_cut_editor_table_made_of_one_merged_group_moves_whole',
    description: 'Éditeur : un tableau dont une case fusionnée lie toutes les lignes passe en entier à la page suivante quand il ne tient pas dans la place restante, même si plus de la moitié tient (la bande est avant lui, aucune ligne n\'est descendue)',
    run: async (h) => {
      try {
        const whole = '<table><tbody><tr><td rowspan="3"><p>R00L0</p><p>R00L1</p></td><td><p>Valeur 0</p></td></tr><tr><td><p>R01L0</p></td></tr><tr><td><p>R02L0</p></td></tr></tbody></table>';
        await loadEditor(h, intro(30) + whole);
        const kids = Array.from(h.tiptap().children);
        const wrapper = kids.find(el => el.classList.contains('tableWrapper'));
        const before = kids.slice(0, kids.indexOf(wrapper)).reduce((sum, el) => sum + layoutHeight(el), 0);
        const m = slicesOf(wrapper, wrapper.querySelector('table'));
        // 70 % du tableau tient dans la place restante : l'ancienne règle (un bloc que l'export coupe reste où sa plus grande partie tient) le laissait là.
        setPageContentHeight(before + 0.7 * m.segs[0]);
        Editor.refreshPaginationPreview();
        await h.sleep(400);
        const bandRect = document.querySelector('#editor-container .v2-page-band').getBoundingClientRect();
        const firstText = editorRows()[0].querySelector('p').getBoundingClientRect();
        const pass = m.segs.length === 1 && document.querySelectorAll('#editor-container .v2-page-band').length === 1 && !hasRowRule()
          && bandRect.bottom <= wrapper.getBoundingClientRect().top + 1.5 && firstText.top >= bandRect.bottom - 1;
        return { pass, notes: JSON.stringify({ slices: m.segs.length, bandBottom: Math.round(bandRect.bottom), tableTop: Math.round(wrapper.getBoundingClientRect().top), rowRule: hasRowRule() }) };
      } finally { restoreEditor(); }
    },
  });

  cases.push({
    id: 'table_page_cut_editor_merged_rows_taller_than_the_page_keep_the_old_rule',
    description: 'Éditeur : des lignes liées plus hautes que 90 % de la page ne se rangent pas (pdfmake les ferait DISPARAÎTRE) - aucune ligne n\'est descendue, le tableau garde son comportement d\'avant',
    run: async (h) => {
      try {
        const tall = '<table><tbody>' + rowsHtml(0, 2, 1) + '<tr><td rowspan="4"><p>R02L0</p></td><td><p>Valeur 2</p></td></tr>' + [3, 4, 5].map(i => '<tr><td>' + tokenParas(i, 8) + '</td></tr>').join('') + rowsHtml(6, 9, 1) + '</tbody></table>';
        await loadEditor(h, intro(1) + tall);
        setPageContentHeight(300);
        Editor.refreshPaginationPreview();
        await h.sleep(400);
        const rows = TablePageCut.rowsOf(h.tiptap().querySelector('table'));
        const group = TablePageCut.unitsOf(rows)[2];
        const groupPx = (rows[group.to - 1].getBoundingClientRect().bottom - rows[group.from].getBoundingClientRect().top) / zoomOf(rows[0]);
        const pass = group.to - group.from === 4 && groupPx > 0.9 * 300 && !hasRowRule();
        return { pass, notes: JSON.stringify({ groupRows: group.to - group.from, groupPx: Math.round(groupPx), pageContentPx: 300, rowRule: hasRowRule() }) };
      } finally { restoreEditor(); }
    },
  });

  cases.push({
    id: 'table_page_cut_editor_without_a4_preview_no_cut',
    description: 'Éditeur : sans l\'aperçu A4 il n\'y a pas de pages, donc ni bande ni ligne descendue',
    run: async (h) => {
      try {
        await loadEditor(h, intro(2) + tableHtml(60, 1));
        h.setA4Preview(false);
        Editor.refreshPaginationPreview();
        await h.sleep(400);
        const pass = document.querySelectorAll('#editor-container .v2-page-band').length === 0 && !hasRowRule();
        return { pass, notes: JSON.stringify({ bands: document.querySelectorAll('#editor-container .v2-page-band').length, rowRule: hasRowRule() }) };
      } finally { restoreEditor(); }
    },
  });

  // --- Lecture ---
  cases.push({
    id: 'table_page_cut_reader_seam_falls_between_two_rows',
    description: 'Lecture : même règle que l\'éditeur - la bande est posée sur le haut de la ligne qui ouvre la page 2, aucun texte de ligne dessous, deux liserés de tableau',
    run: async (h) => {
      try {
        const k = 12;
        await readerCutBefore(h, intro(2) + tableHtml(24, 2), k);
        const rep = readerReport();
        const pass = rep.bands === 1 && rep.aligned[0] === k && rep.overlaps === 0 && rep.textBelow && rep.caps[0] === 1;
        return { pass, notes: JSON.stringify(rep) };
      } finally { restoreEditor(); }
    },
  });

  cases.push({
    id: 'table_page_cut_reader_each_page_of_a_long_table_is_cut_between_rows',
    description: 'Lecture : un tableau de trois pages a deux coupures, chacune entre deux lignes et sans texte recouvert',
    run: async (h) => {
      try {
        await readerCutBefore(h, intro(1) + tableHtml(60, 1), 20);
        const rep = readerReport();
        const pass = rep.bands === 2 && rep.aligned[0] === 20 && rep.aligned[1] > 20 && rep.overlaps === 0 && rep.textBelow;
        return { pass, notes: JSON.stringify(rep) };
      } finally { restoreEditor(); }
    },
  });

  cases.push({
    id: 'table_page_cut_reader_each_page_is_a_whole_sheet_and_the_table_is_clipped',
    description: 'Lecture : chaque page d\'un tableau coupé vaut exactement la hauteur utile, et le tableau est rogné du dessous de la dernière ligne de la page jusqu\'au bas de la bande',
    run: async (h) => {
      try {
        await readerCutBefore(h, intro(1) + tableHtml(60, 1), 20);
        const content = document.querySelector('#reader-container .reader-content');
        const table = content.querySelector(':scope > table');
        const z = zoomOf(content);
        const padTop = parseFloat(getComputedStyle(content).paddingTop) || 0;
        const margins = PageLayout.getMarginsPx();
        const bodyPx = PageLayout.getPageSizePx().height - margins.top - margins.bottom;
        const rects = Array.from(document.querySelectorAll('#reader-container .v2-page-band')).map(b => b.getBoundingClientRect());
        const rep = readerReport();
        const rows = readerRows();
        const firstPage = rects.length ? (rects[0].top - content.getBoundingClientRect().top) / z - padTop : NaN;
        const secondPage = rects.length > 1 ? (rects[1].top - rects[0].bottom) / z : NaN;
        const strips = Array.from(paginationReaderStyle().matchAll(/M-100000 (-?[\d.]+)H100000V(-?[\d.]+)H-100000Z/g)).map(m => ({ top: parseFloat(m[1]), bottom: parseFloat(m[2]) })).filter(t => t.bottom - t.top < 1e5 - 1);
        const tableTop = table.getBoundingClientRect().top;
        const expected = rects.map((r, i) => ({ top: (rows[rep.aligned[i] - 1].getBoundingClientRect().bottom - tableTop) / z + 1, bottom: (r.bottom - tableTop) / z }));
        const clipped = strips.length === 2 && strips.every((t, i) => Math.abs(t.top - expected[i].top) <= 1 && Math.abs(t.bottom - expected[i].bottom) <= 1) && getComputedStyle(table).clipPath !== 'none';
        const pass = rects.length === 2 && Math.abs(firstPage - bodyPx) <= 1.5 && Math.abs(secondPage - bodyPx) <= 1.5 && rep.reserve.every(r => r != null && r >= 0) && rep.textBelow && clipped;
        return { pass, notes: JSON.stringify({ bodyPx: Math.round(bodyPx * 10) / 10, firstPage: Math.round(firstPage * 10) / 10, secondPage: Math.round(secondPage * 10) / 10, reserve: rep.reserve, strips, expected }) };
      } finally { restoreEditor(); }
    },
  });

  cases.push({
    id: 'table_page_cut_reader_rows_of_a_set_height_are_cut_between_rows_and_each_page_is_a_whole_sheet',
    description: 'Lecture : même règle que l\'éditeur pour un tableau dont les lignes ont une hauteur réglée - coupé entre deux lignes, le texte juste sous la bande, rien de recouvert, chaque page vaut la hauteur utile (la ligne descendue grandit de la descente, sa hauteur réglée comprise)',
    run: async (h) => {
      try {
        const k = 12;
        await readerCutBefore(h, intro(1) + setHeightTableHtml(30, 2), k);
        const content = document.querySelector('#reader-container .reader-content');
        const z = zoomOf(content);
        const padTop = parseFloat(getComputedStyle(content).paddingTop) || 0;
        const margins = PageLayout.getMarginsPx();
        const bodyPx = PageLayout.getPageSizePx().height - margins.top - margins.bottom;
        const rects = Array.from(document.querySelectorAll('#reader-container .v2-page-band')).map(b => b.getBoundingClientRect());
        const rep = readerReport();
        const firstPage = rects.length ? (rects[0].top - content.getBoundingClientRect().top) / z - padTop : NaN;
        const secondPage = rects.length > 1 ? (rects[1].top - rects[0].bottom) / z : NaN;
        const heightRule = /tr:nth-child\(\d+\) \{ height: [\d.]+px !important; \}/.test(paginationReaderStyle());
        const pass = rects.length === 2 && rep.aligned[0] === k && rep.aligned[1] > k && rep.overlaps === 0 && rep.textBelow && rep.caps.every(n => n === 1) && heightRule
          && Math.abs(firstPage - bodyPx) <= 1.5 && Math.abs(secondPage - bodyPx) <= 1.5 && rep.reserve.every(r => r != null && r >= 0);
        return { pass, notes: JSON.stringify({ bodyPx: Math.round(bodyPx * 10) / 10, firstPage: Math.round(firstPage * 10) / 10, secondPage: Math.round(secondPage * 10) / 10, heightRule, rep }) };
      } finally { restoreEditor(); }
    },
  });

  cases.push({
    id: 'table_page_cut_reader_with_header_and_footer',
    description: 'Lecture : avec un en-tête et un pied de page, chaque coupure de tableau tombe entre deux lignes, sans texte recouvert',
    run: async (h) => {
      try {
        await h.resetEditor();
        h.setA4Preview(true);
        PageLayout.setMarginsMm(null);
        await h.renderReaderMode(tableHtml(48, 1), HEADER_FOOTER);
        await h.sleep(400);
        const rep = readerReport();
        const seamWithZones = !!document.querySelector('#reader-container .v2-page-seam');
        const pass = seamWithZones && rep.bands >= 1 && rep.aligned.every(i => i > 0) && rep.overlaps === 0 && rep.textBelow && rep.caps.every(n => n === 1);
        return { pass, notes: JSON.stringify(Object.assign({ seamWithZones }, rep)) };
      } finally { restoreEditor(); }
    },
  });

  cases.push({
    id: 'table_page_cut_reader_row_taller_than_the_page_keeps_the_old_rule',
    description: 'Lecture : une ligne plus haute que 90 % de la page sort de la règle, aucune ligne n\'est descendue',
    run: async (h) => {
      try {
        await h.resetEditor();
        h.setA4Preview(true);
        setPageContentHeight(300);
        const wrapper = await h.renderReaderMode(intro(1) + '<table><tbody>' + rowsHtml(0, 2, 1) + rowHtml(2, 22) + rowsHtml(3, 6, 1) + '</tbody></table>');
        await h.sleep(400);
        const rows = readerRows();
        const tall = rows[2].getBoundingClientRect().height / zoomOf(rows[2]);
        const style = wrapper.querySelector(':scope > style');
        const pass = tall > 0.9 * 300 && !(style && /> tbody > tr:nth-child/.test(style.textContent));
        return { pass, notes: JSON.stringify({ tallRowPx: Math.round(tall), styleHasRowRule: !!(style && /> tbody > tr:nth-child/.test(style.textContent)) }) };
      } finally { restoreEditor(); }
    },
  });

  cases.push({
    id: 'table_page_cut_editor_and_reader_cut_at_the_same_row',
    description: 'L\'éditeur et la Lecture (même texte, même CSS) ouvrent la page 2 sur la même ligne du tableau',
    run: async (h) => {
      try {
        const k = 12;
        const html = intro(2) + tableHtml(24, 2);
        await editorCutBefore(h, html, k);
        const editor = editorReport();
        // La même page dans la Lecture : les marges réglées pour l'éditeur sont gardées telles quelles.
        await h.renderReaderMode(html);
        await h.sleep(500);
        const reader = readerReport();
        const pass = editor.bands === 1 && reader.bands === 1 && editor.aligned[0] === k && reader.aligned[0] === k && editor.firstOfPage2 === reader.firstOfPage2;
        return { pass, notes: JSON.stringify({ editor, reader }) };
      } finally { restoreEditor(); }
    },
  });

  cases.push({
    id: 'table_page_cut_reader_merged_rows_pass_together_to_the_next_page',
    description: 'Lecture : même règle que l\'éditeur pour des lignes qu\'une case fusionnée lie - elles passent toutes à la page suivante, la bande est posée sur la première ligne du groupe, aucun texte recouvert',
    run: async (h) => {
      try {
        const html = intro(2) + mergedTableHtml(24, MERGED_EVERY, MERGED_SPAN, 2);
        await h.resetEditor();
        h.setA4Preview(true);
        PageLayout.setMarginsMm(null);
        const wrapper = await h.renderReaderMode(html);
        const rank = sliceRankOfRow(TablePageCut.rowsOf(wrapper.querySelector(':scope > table')), 1 + MERGED_EVERY);
        await readerCutBefore(h, html, rank);
        const rep = readerReport();
        const group = groupSide('#reader-container', readerRows(), 1 + MERGED_EVERY, 1 + MERGED_EVERY + MERGED_SPAN);
        const pass = rep.bands >= 1 && rep.aligned[0] === 1 + MERGED_EVERY && rep.overlaps === 0 && rep.textBelow && rep.caps.every(n => n === 1) && group.below;
        return { pass, notes: JSON.stringify(Object.assign({ rank, group }, rep)) };
      } finally { restoreEditor(); }
    },
  });

  cases.push({
    id: 'table_page_cut_editor_and_reader_cut_at_the_same_row_with_merged_cells',
    description: 'L\'éditeur et la Lecture (même texte, même CSS) ouvrent la page 2 sur la même ligne d\'un tableau à cases fusionnées, la première du groupe qu\'une coupure aurait traversé',
    run: async (h) => {
      try {
        const html = intro(2) + mergedTableHtml(24, MERGED_EVERY, MERGED_SPAN, 2);
        await loadEditor(h, html);
        const rank = sliceRankOfRow(TablePageCut.rowsOf(h.tiptap().querySelector('table')), 1 + MERGED_EVERY);
        await editorCutBefore(h, html, rank);
        const editor = editorReport();
        await h.renderReaderMode(html);
        await h.sleep(500);
        const reader = readerReport();
        const pass = editor.bands >= 1 && editor.bands === reader.bands && editor.aligned[0] === 1 + MERGED_EVERY && JSON.stringify(editor.aligned) === JSON.stringify(reader.aligned) && editor.firstOfPage2 === reader.firstOfPage2;
        return { pass, notes: JSON.stringify({ editor, reader }) };
      } finally { restoreEditor(); }
    },
  });

  cases.push({
    id: 'table_page_cut_reader_merged_rows_taller_than_the_page_keep_the_old_rule',
    description: 'Lecture : des lignes liées plus hautes que 90 % de la page ne se rangent pas - aucune ligne n\'est descendue',
    run: async (h) => {
      try {
        await h.resetEditor();
        h.setA4Preview(true);
        setPageContentHeight(300);
        const tall = '<table><tbody>' + rowsHtml(0, 2, 1) + '<tr><td rowspan="4"><p>R02L0</p></td><td><p>Valeur 2</p></td></tr>' + [3, 4, 5].map(i => '<tr><td>' + tokenParas(i, 8) + '</td></tr>').join('') + rowsHtml(6, 9, 1) + '</tbody></table>';
        const wrapper = await h.renderReaderMode(intro(1) + tall);
        await h.sleep(400);
        const rows = readerRows();
        const group = TablePageCut.unitsOf(TablePageCut.rowsOf(wrapper.querySelector(':scope > table')))[2];
        const groupPx = (rows[group.to - 1].getBoundingClientRect().bottom - rows[group.from].getBoundingClientRect().top) / zoomOf(rows[0]);
        const style = wrapper.querySelector(':scope > style');
        const pass = group.to - group.from === 4 && groupPx > 0.9 * 300 && !(style && /> tbody > tr:nth-child/.test(style.textContent));
        return { pass, notes: JSON.stringify({ groupPx: Math.round(groupPx), styleHasRowRule: !!(style && /> tbody > tr:nth-child/.test(style.textContent)) }) };
      } finally { restoreEditor(); }
    },
  });

  // --- PDF ---
  // Les tableaux d'un docDefinition pdfmake (le nœud qui porte `table`), à n'importe quelle profondeur.
  function findTables(node, out) {
    out = out || [];
    if (!node || typeof node !== 'object') return out;
    if (node.table && typeof node.table === 'object') out.push(node);
    ['content', 'stack', 'columns', 'ul', 'ol'].forEach(key => { if (node[key]) findTables(node[key], out); });
    if (Array.isArray(node)) node.forEach(child => findTables(child, out));
    if (node.table && Array.isArray(node.table.body)) node.table.body.forEach(row => row.forEach(cell => findTables(cell, out)));
    return out;
  }
  // Les tableaux du document, sans les tableaux imbriqués que tableFrom pose à la place des lignes d'un groupe lié par une case fusionnée (`_unitTable`), et ces derniers seuls.
  const outerTablesOf = content => findTables(content).filter(t => !t._unitTable);
  const unitTablesOf = content => findTables(content).filter(t => t._unitTable);
  // Les jetons « R07L1 » que pdf.js lit sur chaque page : { page, row, line }.
  function pdfTokens(gt) {
    const found = [];
    gt.pages.forEach((page, p) => page.textItems.forEach(item => {
      const re = /R(\d+)L(\d+)/g;
      let m;
      while ((m = re.exec(item.str))) found.push({ page: p, row: Number(m[1]), line: Number(m[2]) });
    }));
    return found;
  }
  // Rangs des lignes dont le texte est sur deux pages (ou plus).
  function splitRows(tokens) {
    const pagesOf = {};
    tokens.forEach(t => { (pagesOf[t.row] = pagesOf[t.row] || new Set()).add(t.page); });
    return Object.keys(pagesOf).filter(r => pagesOf[r].size > 1).map(Number);
  }
  async function pdfOf(h, html) {
    const result = await h.exportPdfContent(html, null, PageLayout.getMarginsPt());
    const gt = await h.extractPdfGroundTruth(result.base64);
    return { result, gt, tokens: pdfTokens(gt) };
  }

  cases.push({
    id: 'table_page_cut_pdf_no_row_is_split_across_two_pages',
    description: 'PDF (relu par pdf.js) : aucune ligne de tableau n\'a son texte sur deux pages, quel que soit l\'endroit où tombe le saut - le texte d\'introduction est allongé d\'une ligne à la fois pour faire passer le saut par tous les endroits d\'une ligne',
    run: async (h) => {
      try {
        await h.resetEditor();
        PageLayout.setMarginsMm(null);
        const runs = [];
        let somePageHasRoomLeft = false;
        for (let lines = 0; lines <= 4; lines++) {
          const { gt, tokens } = await pdfOf(h, intro(lines) + tableHtml(40, 3));
          const rowsOnPages = {};
          tokens.forEach(t => { rowsOnPages[t.row] = t.page; });
          const rowsPerPage = gt.pages.map((_, p) => Object.keys(rowsOnPages).filter(r => rowsOnPages[r] === p).length);
          // Une page sans son dernier ligne de tableau complète : le saut est tombé dans une ligne, que la règle a passée en entier à la page suivante.
          const lastOnFirst = Math.max(...tokens.filter(t => t.page === 0).map(t => t.row));
          const lowest = Math.max(...gt.pages[0].textItems.map(it => it.y));
          if (gt.pages[0].height - lowest > 60) somePageHasRoomLeft = true;
          runs.push({ introLines: lines, pages: gt.pages.length, rowsPerPage, split: splitRows(tokens), tokens: tokens.length, lastOnFirst });
        }
        const pass = runs.every(r => r.split.length === 0 && r.pages >= 2 && r.tokens === 40 * 3) && somePageHasRoomLeft;
        return { pass, notes: JSON.stringify({ somePageHasRoomLeft, runs }) };
      } finally { restoreEditor(); }
    },
  });

  cases.push({
    id: 'table_page_cut_pdf_rows_of_a_set_height_are_kept_whole_and_keep_their_height',
    description: 'PDF (relu par pdf.js) : un tableau de document dont les lignes ont une hauteur réglée se range comme un autre - dontBreakRows posé, aucune ligne n\'a son texte sur deux pages quel que soit l\'endroit du saut (le texte d\'introduction est allongé d\'une ligne à la fois), tout le texte est là - et chaque ligne garde sa hauteur réglée (`heights`)',
    run: async (h) => {
      try {
        await h.resetEditor();
        PageLayout.setMarginsMm(null);
        const total = 30;
        const runs = [];
        for (let introLines = 0; introLines <= 4; introLines++) {
          const { result, gt, tokens } = await pdfOf(h, intro(introLines) + setHeightTableHtml(total, 2));
          const outer = outerTablesOf(result.content)[0];
          const heights = outer.table.heights || [];
          runs.push({ introLines, pages: gt.pages.length, seen: new Set(tokens.map(t => t.row + ':' + t.line)).size, split: splitRows(tokens), dontBreakRows: !!outer.table.dontBreakRows, heights: heights.length, numeric: heights.every(v => typeof v === 'number') });
        }
        const pass = runs.every(r => r.pages >= 2 && r.seen === total * 2 && r.split.length === 0 && r.dontBreakRows && r.heights === total && r.numeric);
        return { pass, notes: JSON.stringify({ runs }) };
      } finally { restoreEditor(); }
    },
  });

  cases.push({
    id: 'table_page_cut_pdf_keeps_every_row_whole_flag_only_on_tables_that_can_take_it',
    description: 'PDF : dontBreakRows est posé sur le tableau du flux principal - des cases fusionnées sur plusieurs lignes comprises : leurs lignes sont alors UNE ligne du tableau, qui porte un tableau imbriqué - et seulement là : pas sur une ligne trop haute pour une page, ni un tableau dans une colonne',
    run: async (h) => {
      try {
        await h.resetEditor();
        PageLayout.setMarginsMm(null);
        const flagOf = async html => {
          const { result } = await pdfOf(h, html);
          const tables = outerTablesOf(result.content);
          return tables.length ? tables.map(t => !!t.table.dontBreakRows) : null;
        };
        const merged = '<table><tbody><tr><td rowspan="2"><p>A</p></td><td><p>B</p></td></tr><tr><td><p>C</p></td></tr>' + rowsHtml(2, 8, 1) + '</tbody></table>';
        const tall = '<table><tbody>' + rowsHtml(0, 2, 1) + rowHtml(2, 90) + rowsHtml(3, 5, 1) + '</tbody></table>';
        const inColumn = '<div class="two-columns-zone" style="--layout-left: 50%"><div class="two-columns-column">' + tableHtml(6, 1) + '</div><div class="two-columns-column"><p>Texte à côté</p></div></div>';
        const got = { plain: await flagOf(tableHtml(8, 1)), merged: await flagOf(merged), tall: await flagOf(tall), inColumn: await flagOf(inColumn) };
        const mergedPdf = await pdfOf(h, merged);
        const mergedBody = outerTablesOf(mergedPdf.result.content)[0].table.body;
        const groups = unitTablesOf(mergedPdf.result.content);
        const pass = JSON.stringify(got.plain) === '[true]' && JSON.stringify(got.merged) === '[true]' && JSON.stringify(got.tall) === '[false]' && !!got.inColumn && got.inColumn.every(f => f === false)
          && mergedBody.length === 7 && groups.length === 1 && groups[0].table.body.length === 2 && !groups[0].table.dontBreakRows;
        return { pass, notes: JSON.stringify(Object.assign(got, { mergedRows: mergedBody.length, groupTables: groups.length })) };
      } finally { restoreEditor(); }
    },
  });

  cases.push({
    id: 'table_page_cut_pdf_row_taller_than_a_page_is_never_lost',
    description: 'PDF : une ligne plus haute que la page ne disparaît pas (pdfmake avec dontBreakRows la ferait disparaître : ni sur la page 1, ni sur la page 2) - tout son texte est dans le PDF',
    run: async (h) => {
      try {
        await h.resetEditor();
        PageLayout.setMarginsMm(null);
        const html = '<table><tbody>' + rowsHtml(0, 2, 1) + rowHtml(2, 90) + rowsHtml(3, 5, 1) + '</tbody></table>';
        const { tokens, gt } = await pdfOf(h, html);
        const expected = 2 * 1 + 90 + 2 * 1;
        const seen = new Set(tokens.map(t => t.row + ':' + t.line));
        const pass = seen.size === expected;
        return { pass, notes: JSON.stringify({ expected, found: seen.size, pages: gt.pages.length }) };
      } finally { restoreEditor(); }
    },
  });

  cases.push({
    id: 'table_page_cut_pdf_table_with_a_layered_image_keeps_the_old_rule',
    description: 'PDF : un tableau qui porte une image en calque (ancienne, sans grille de page) garde l\'ancien rangement des lignes - avec dontBreakRows, pdfmake note le texte de ses cases sans le décalage de la colonne et l\'image partait à gauche de la page',
    run: async (h) => {
      try {
        await h.resetEditor();
        h.setA4Preview(true);
        PageLayout.setMarginsMm(null);
        const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
        const img = '<img class="editor-image" src="' + png + '" alt="Image" style="width: 60px; position: absolute; left: 40px; top: 6px; z-index: 5;" data-layer="front" data-wrap="inline">';
        const cell = t => '<td><p>' + t + '</p></td>';
        const html = '<p>Avant</p><table><tbody><tr>' + cell('A1') + cell('B1') + cell('C1') + '</tr><tr>' + cell('A2') + cell('B2') + '<td><p>C2 ancre ' + img + '</p></td></tr></tbody></table><p>Après</p>';
        const { result, gt } = await pdfOf(h, html);
        const flags = findTables(result.content).map(t => !!t.table.dontBreakRows);
        const anchor = gt.pages[0].textItems.find(item => item.str.startsWith('C2'));
        const image = gt.pages[0].images[0];
        // L'image est dans la troisième colonne, à côté du texte de sa case (mesuré : 409 pt pour un texte à 384 pt ; partie à 81 pt avec dontBreakRows).
        const pass = JSON.stringify(flags) === '[false]' && !!anchor && !!image && Math.abs(image.x - anchor.x) < 60;
        return { pass, notes: JSON.stringify({ flags, anchorX: anchor && Math.round(anchor.x), imageX: image && Math.round(image.x) }) };
      } finally { restoreEditor(); }
    },
  });

  // --- PDF : des cases fusionnées sur plusieurs lignes ---
  // Les lignes d'un groupe lié par une case fusionnée, les jetons de leurs lignes, sur quelle(s) page(s) pdf.js les lit : `groups` = les rangs de la première ligne de chaque groupe, `span` leur taille.
  const groupPages = (tokens, groups, span) => groups.map((open) => {
    const pages = new Set();
    tokens.forEach(t => { if (t.row >= open && t.row < open + span) pages.add(t.page); });
    return pages.size;
  });

  cases.push({
    id: 'table_page_cut_pdf_merged_rows_stay_on_one_page',
    description: 'PDF (relu par pdf.js) : les lignes qu\'une case fusionnée lie ne sont jamais sur deux pages, quel que soit l\'endroit où tombe le saut - le texte d\'introduction est allongé d\'une ligne à la fois pour le faire passer par tous les endroits d\'un groupe ; tout le texte est là (pdfmake, avec dontBreakRows, perd le texte d\'une case fusionnée)',
    run: async (h) => {
      try {
        await h.resetEditor();
        PageLayout.setMarginsMm(null);
        const total = 40;
        const lines = 3;
        const opens = groupOpeners(total, MERGED_EVERY, MERGED_SPAN);
        const runs = [];
        let somePageHasRoomLeft = false;
        for (let introLines = 0; introLines <= 4; introLines++) {
          const { result, gt, tokens } = await pdfOf(h, intro(introLines) + mergedTableHtml(total, MERGED_EVERY, MERGED_SPAN, lines));
          const lowest = Math.max(...gt.pages[0].textItems.map(it => it.y));
          if (gt.pages[0].height - lowest > 60) somePageHasRoomLeft = true;
          const seen = new Set(tokens.map(t => t.row + ':' + t.line));
          runs.push({ introLines, pages: gt.pages.length, seen: seen.size, split: splitRows(tokens), groupPages: groupPages(tokens, opens, MERGED_SPAN), groupTables: unitTablesOf(result.content).length });
        }
        const pass = somePageHasRoomLeft && runs.every(r => r.pages >= 2 && r.seen === total * lines && r.split.length === 0 && r.groupPages.every(n => n === 1) && r.groupTables === opens.length);
        return { pass, notes: JSON.stringify({ somePageHasRoomLeft, groups: opens.length, runs }) };
      } finally { restoreEditor(); }
    },
  });

  cases.push({
    id: 'table_page_cut_pdf_merged_title_cell_comes_back_with_its_rows_on_every_page',
    description: 'PDF (relu par pdf.js) : un titre fusionné sur les deux lignes de titres revient avec elles, une fois, tout en haut de chaque page où le tableau se poursuit ; les lignes de données, groupes de lignes liées compris, restent entières',
    run: async (h) => {
      try {
        await h.resetEditor();
        PageLayout.setMarginsMm(null);
        const total = 40;
        const titles = '<tr><th rowspan="2"><p>TITREA0</p></th><th><p>TITREB0</p></th></tr><tr><th><p>TITREB1</p></th></tr>';
        const { result, gt, tokens } = await pdfOf(h, '<table><tbody>' + titles + mergedRowsHtml(total, MERGED_EVERY, MERGED_SPAN, 3) + '</tbody></table>');
        const perPage = gt.pages.map(page => {
          const top = Math.min(...page.textItems.map(it => it.y));
          const at = name => page.textItems.filter(it => it.str.includes(name));
          const a = at('TITREA0'), b = at('TITREB0'), c = at('TITREB1');
          return { a: a.length, b: b.length, c: c.length, atTop: a.length === 1 && b.length === 1 && Math.abs(a[0].y - top) < 1 && Math.abs(b[0].y - top) < 1 && c.length === 1 && c[0].y > a[0].y };
        });
        const outer = outerTablesOf(result.content)[0];
        const groups = groupPages(tokens, groupOpeners(total, MERGED_EVERY, MERGED_SPAN), MERGED_SPAN);
        const pass = gt.pages.length >= 3 && perPage.every(p => p.a === 1 && p.b === 1 && p.c === 1 && p.atTop) && outer.table.headerRows === 1 && tokens.length === total * 3 && splitRows(tokens).length === 0 && groups.every(n => n === 1);
        return { pass, notes: JSON.stringify({ pages: gt.pages.length, perPage, headerRows: outer.table.headerRows, tokens: tokens.length, groups }) };
      } finally { restoreEditor(); }
    },
  });

  cases.push({
    id: 'table_page_cut_pdf_merged_rows_taller_than_the_page_keep_the_old_rule',
    description: 'PDF : des lignes liées plus hautes que 90 % de la page gardent l\'ancien rangement (pdfmake perdrait leur texte avec dontBreakRows) - pas de dontBreakRows, pas de tableau imbriqué, et tout le texte est dans le PDF',
    run: async (h) => {
      try {
        await h.resetEditor();
        PageLayout.setMarginsMm(null);
        const tall = '<table><tbody>' + rowsHtml(0, 2, 1) + '<tr><td rowspan="4"><p>R02L0</p></td><td><p>Valeur 2</p></td></tr>' + [3, 4, 5].map(i => '<tr><td>' + tokenParas(i, 20) + '</td></tr>').join('') + rowsHtml(6, 9, 1) + '</tbody></table>';
        const { result, tokens, gt } = await pdfOf(h, tall);
        const expected = 2 + 1 + 3 * 20 + 3;
        const seen = new Set(tokens.map(t => t.row + ':' + t.line));
        const outer = outerTablesOf(result.content);
        const pass = outer.length === 1 && !outer[0].table.dontBreakRows && unitTablesOf(result.content).length === 0 && seen.size === expected;
        return { pass, notes: JSON.stringify({ expected, found: seen.size, pages: gt.pages.length, dontBreakRows: outer.length ? !!outer[0].table.dontBreakRows : null, groupTables: unitTablesOf(result.content).length }) };
      } finally { restoreEditor(); }
    },
  });

  cases.push({
    id: 'table_page_cut_pdf_table_made_of_one_merged_group_moves_whole',
    description: 'PDF (relu par pdf.js) : un tableau dont une case fusionnée lie toutes les lignes ne se coupe jamais - il passe en entier à la page suivante quand il ne tient pas dans la place restante, le texte d\'introduction étant allongé d\'un paragraphe à la fois',
    run: async (h) => {
      try {
        await h.resetEditor();
        PageLayout.setMarginsMm(null);
        const whole = '<table><tbody><tr><td rowspan="3"><p>R00L0</p><p>R00L1</p></td><td><p>Valeur 0</p></td></tr><tr><td><p>R01L0</p><p>R01L1</p></td></tr><tr><td><p>R02L0</p><p>R02L1</p></td></tr></tbody></table>';
        const runs = [];
        // Un paragraphe d'introduction fait 14,9 pt, une page 786 pt utiles, le tableau (trois lignes de deux lignes de texte) une centaine : il change de page entre 46 et 53 paragraphes.
        for (let introLines = 44; introLines <= 54; introLines++) {
          const { result, gt, tokens } = await pdfOf(h, intro(introLines) + whole);
          const introPages = new Set();
          gt.pages.forEach((page, p) => page.textItems.forEach(it => { if (it.str.includes('Introduction')) introPages.add(p); }));
          runs.push({ introLines, tablePages: Array.from(new Set(tokens.map(t => t.page))), introPages: Array.from(introPages), found: tokens.length, groupTables: unitTablesOf(result.content).length, dont: !!outerTablesOf(result.content)[0].table.dontBreakRows });
        }
        // Dans tous les cas le tableau est sur une seule page, tout son texte est là ; et pour certains il est passé à la page 2 alors que l'introduction tient en entier sur la page 1.
        const oneSidedOnly = runs.every(r => r.tablePages.length === 1 && r.found === 6 && r.groupTables === 1 && r.dont);
        const moved = runs.some(r => r.tablePages[0] === 1 && r.introPages.length === 1 && r.introPages[0] === 0);
        return { pass: oneSidedOnly && moved, notes: JSON.stringify({ moved, runs: runs.map(r => r.introLines + ':table p' + r.tablePages.join('+') + ', intro p' + r.introPages.join('+')) }) };
      } finally { restoreEditor(); }
    },
  });

  cases.push({
    id: 'table_page_cut_pdf_caption_follows_the_last_group_of_merged_rows',
    description: 'PDF : un tableau dont les dernières lignes sont liées, suivi d\'une légende (« Rester ensemble »), est rendu en deux morceaux - tout sauf le dernier groupe, puis ce groupe seul, une ligne du tableau qui porte un tableau imbriqué',
    run: async (h) => {
      try {
        await h.resetEditor();
        PageLayout.setMarginsMm(null);
        const html = '<table><tbody>' + rowsHtml(0, 5, 1) + '<tr><td rowspan="2"><p>R05L0</p></td><td><p>Valeur 5</p></td></tr><tr><td><p>R06L0</p></td></tr></tbody></table><p data-caption="true">Tableau un</p>';
        const { result } = await pdfOf(h, html);
        const tables = outerTablesOf(result.content);
        const tail = tables[1];
        const pass = tables.length === 2 && tables[0].table.body.length === 5 && tail.table.body.length === 1 && !!tail._keepTail && !!tail.table.body[0][0]._unitTable && unitTablesOf(result.content).length === 1;
        return { pass, notes: JSON.stringify({ tables: tables.map(t => t.table.body.length), keepTail: tail ? !!tail._keepTail : null, groupTables: unitTablesOf(result.content).length }) };
      } finally { restoreEditor(); }
    },
  });

  // Le tableau imbriqué d'un groupe reprend exactement les colonnes, les traits et les marges du tableau à plat (marges négatives = le rembourrage de la ligne qui le porte ; traits du contour à
  // zéro) : le même document, à plat (les lignes du groupe dans le tableau, comme avant) et en groupes, se lit pareil dans pdf.js. Sans fond de case : le fond d'une ligne rangée par dontBreakRows est
  // peint après les traits qui le touchent, avec ou sans groupe (ce n'est pas ce qui se mesure ici).
  cases.push({
    id: 'table_page_cut_pdf_merged_group_is_drawn_like_the_flat_table',
    description: 'PDF (relu par pdf.js) : le tableau imbriqué d\'un groupe de lignes liées est peint comme le même tableau à plat - les textes aux mêmes positions (0,05 pt près), et à peine un pixel de trait qui diffère (les jonctions de deux traits qui se touchent)',
    run: async (h) => {
      try {
        await h.resetEditor();
        PageLayout.setMarginsMm(null);
        const html = '<p>Avant</p><table><tbody><tr><td rowspan="2"><p>A1</p><p>A2</p><p>A3</p></td><td><p>B0</p></td><td><p>C0</p></td></tr><tr><td><p>B1</p><p>B1b</p></td><td><p>C1</p></td></tr>'
          + '<tr><td><p>A-solo</p></td><td><p>B-solo</p></td><td><p>C-solo</p></td></tr><tr><td><p>A3</p></td><td rowspan="2"><p>B3x</p><p>B3y</p><p>B3z</p></td><td rowspan="2"><p>C3</p></td></tr><tr><td><p>A4</p></td></tr></tbody></table><p>Après</p>';
        const grouped = await h.exportPdfContent(html, null, PageLayout.getMarginsPt());
        const flat = await h.exportPdfContent(html, null, PageLayout.getMarginsPt());
        const flatTable = outerTablesOf(flat.content)[0];
        const groupTables = unitTablesOf(grouped.content).length;
        flatTable.table.body = [].concat(...flatTable.table.body.map(row => (row[0] && row[0]._unitTable ? row[0].table.body : [row])));
        flatTable.table.dontBreakRows = false;
        const flatBase64 = await new Promise(resolve => window.pdfMake.createPdf(flat.docDefinition).getBase64(resolve));
        const [truthGrouped, truthFlat] = await Promise.all([h.extractPdfGroundTruth(grouped.base64), h.extractPdfGroundTruth(flatBase64)]);
        const items = truth => truth.pages.flatMap((page, p) => page.textItems.map(it => ({ str: it.str, p, x: it.x, y: it.y })));
        const [a, b] = [items(truthGrouped), items(truthFlat)];
        const sameText = a.length === b.length && a.every((it, i) => it.str === b[i].str && it.p === b[i].p && Math.abs(it.x - b[i].x) < 0.05 && Math.abs(it.y - b[i].y) < 0.05);
        // Les deux fichiers peints sur un canevas, pixel contre pixel (trois fois leur taille).
        await h.ensurePdfJsLoaded();
        const raster = async (base64) => {
          const bin = atob(base64);
          const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
          const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
          const pages = [];
          for (let n = 1; n <= pdf.numPages; n++) {
            const page = await pdf.getPage(n);
            const viewport = page.getViewport({ scale: 3 });
            const canvas = document.createElement('canvas');
            canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({ canvasContext: ctx, viewport }).promise;
            pages.push(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
          }
          return pages;
        };
        const [pixelsGrouped, pixelsFlat] = [await raster(grouped.base64), await raster(flatBase64)];
        let strong = 0;
        pixelsGrouped.forEach((data, p) => { for (let k = 0; k < data.length; k += 4) { if (Math.abs(data[k] - pixelsFlat[p][k]) + Math.abs(data[k + 1] - pixelsFlat[p][k + 1]) + Math.abs(data[k + 2] - pixelsFlat[p][k + 2]) > 60) strong++; } });
        const pass = groupTables === 2 && sameText && pixelsGrouped.length === pixelsFlat.length && strong <= 40;
        return { pass, notes: JSON.stringify({ groupTables, sameText, items: a.length, strongPixels: strong }) };
      } finally { restoreEditor(); }
    },
  });

  // --- Word ---
  cases.push({
    id: 'table_page_cut_docx_every_row_cannot_split',
    description: 'Word : chaque ligne de tableau porte cantSplit (lu dans le .docx généré) - Word passe la ligne entière à la page suivante au lieu de la couper',
    run: async (h) => {
      try {
        await h.resetEditor();
        const parts = await h.exportDocxParts(intro(1) + tableHtml(9, 2), null, null);
        const rows = Array.from(parts.doc.getElementsByTagName('w:tr'));
        const flagged = rows.filter(tr => tr.getElementsByTagName('w:cantSplit').length === 1);
        return { pass: rows.length === 9 && flagged.length === 9, notes: JSON.stringify({ rows: rows.length, flagged: flagged.length }) };
      } finally { restoreEditor(); }
    },
  });

  // Une ligne de la table Word dont CHAQUE paragraphe (celui de la case de continuation d'une case fusionnée compris) garde avec le suivant (<w:keepNext/>), ou aucun.
  const keepsWithNext = tr => { const paras = Array.from(tr.getElementsByTagName('w:p')); return paras.length > 0 && paras.every(p => p.getElementsByTagName('w:keepNext').length === 1); };
  const keepsNothing = tr => Array.from(tr.getElementsByTagName('w:p')).every(p => p.getElementsByTagName('w:keepNext').length === 0);
  const mergeOf = tr => Array.from(tr.getElementsByTagName('w:vMerge')).map(el => el.getAttribute('w:val') || 'continue').join(',');

  cases.push({
    id: 'table_page_cut_docx_merged_rows_keep_with_the_next_row',
    description: 'Word : toutes les lignes qu\'une case fusionnée lie, sauf la dernière, gardent leurs paragraphes avec le suivant (keepNext, case de continuation comprise) - Word ne les sépare pas ; les autres lignes n\'en portent pas, et chaque ligne garde cantSplit',
    run: async (h) => {
      try {
        await h.resetEditor();
        // Six lignes, les lignes 1 à 3 liées.
        const parts = await h.exportDocxParts(mergedTableHtml(6, 4, 3, 1), null, null);
        const rows = Array.from(parts.doc.getElementsByTagName('w:tr'));
        const kept = rows.map(tr => (keepsWithNext(tr) ? 'K' : keepsNothing(tr) ? '-' : '?')).join('');
        const merges = rows.map(mergeOf);
        const cantSplit = rows.every(tr => tr.getElementsByTagName('w:cantSplit').length === 1);
        const pass = rows.length === 6 && kept === '-KK---' && merges.join('|') === '|restart|continue|continue||' && cantSplit;
        return { pass, notes: JSON.stringify({ kept, merges, cantSplit }) };
      } finally { restoreEditor(); }
    },
  });

  cases.push({
    id: 'table_page_cut_docx_caption_keeps_with_the_last_group_of_merged_rows',
    description: 'Word : une légende qui suit un tableau (« Rester ensemble ») garde avec elle toutes les lignes du dernier groupe de lignes liées - et seulement elles, comme la dernière ligne d\'un tableau sans case fusionnée',
    run: async (h) => {
      try {
        await h.resetEditor();
        const html = '<table><tbody>' + rowsHtml(0, 4, 1) + '<tr><td rowspan="2"><p>R04L0</p></td><td><p>Valeur 4</p></td></tr><tr><td><p>R05L0</p></td></tr></tbody></table><p data-caption="true">Tableau un</p>';
        const parts = await h.exportDocxParts(html, null, null);
        const rows = Array.from(parts.doc.getElementsByTagName('w:tr'));
        const kept = rows.map(tr => (keepsWithNext(tr) ? 'K' : keepsNothing(tr) ? '-' : '?')).join('');
        const plain = await h.exportDocxParts('<table><tbody>' + rowsHtml(0, 6, 1) + '</tbody></table><p data-caption="true">Tableau un</p>', null, null);
        const plainKept = Array.from(plain.doc.getElementsByTagName('w:tr')).map(tr => (keepsWithNext(tr) ? 'K' : keepsNothing(tr) ? '-' : '?')).join('');
        return { pass: rows.length === 6 && kept === '----KK' && plainKept === '-----K', notes: JSON.stringify({ kept, plainKept }) };
      } finally { restoreEditor(); }
    },
  });

  // --- Lignes de titres : elles reviennent en haut de chaque page où le tableau se poursuit (PDF : headerRows de pdfmake ; Word : tblHeader). L'aperçu de l'éditeur et la Lecture coupent le
  // tableau au même endroit qu'avant et ne montrent pas ce rappel : la règle ne vaut que pour les deux fichiers. ---
  cases.push({
    id: 'table_page_cut_pdf_title_rows_come_back_at_the_top_of_every_page',
    description: 'PDF (relu par pdf.js) : un tableau dont la première ligne est faite de cases de titre (<th>) répète ces titres en haut de CHAQUE page où il se poursuit, tout en haut de la page ; chaque ligne de données reste une fois, entière',
    run: async (h) => {
      try {
        await h.resetEditor();
        PageLayout.setMarginsMm(null);
        const { gt, tokens } = await pdfOf(h, titledTableHtml(40, 3, 1));
        const perPage = gt.pages.map(page => {
          const titles = page.textItems.filter(it => it.str.includes('TITREA0'));
          const topY = Math.min(...page.textItems.map(it => it.y));
          return { titles: titles.length, atTop: titles.length === 1 && Math.abs(titles[0].y - topY) < 1 };
        });
        const pass = gt.pages.length >= 3 && perPage.every(p => p.titles === 1 && p.atTop) && tokens.length === 40 * 3 && splitRows(tokens).length === 0;
        return { pass, notes: JSON.stringify({ pages: gt.pages.length, perPage, tokens: tokens.length, split: splitRows(tokens) }) };
      } finally { restoreEditor(); }
    },
  });

  cases.push({
    id: 'table_page_cut_pdf_two_title_rows_both_come_back',
    description: 'PDF : deux lignes de titres en tête reviennent toutes les deux, dans l\'ordre, en haut de chaque page',
    run: async (h) => {
      try {
        await h.resetEditor();
        PageLayout.setMarginsMm(null);
        const { gt } = await pdfOf(h, titledTableHtml(40, 3, 2));
        const perPage = gt.pages.map(page => {
          const sorted = page.textItems.slice().sort((a, b) => a.y - b.y || a.x - b.x).map(it => it.str.trim()).filter(Boolean);
          return sorted.slice(0, 4).join('|');
        });
        const expected = 'TITREA0|TITREB0|TITREA1|TITREB1';
        const pass = gt.pages.length >= 3 && perPage.every(top => top === expected);
        return { pass, notes: JSON.stringify({ pages: gt.pages.length, perPage }) };
      } finally { restoreEditor(); }
    },
  });

  cases.push({
    id: 'table_page_cut_pdf_title_rows_flag_follows_the_cells',
    description: 'PDF : headerRows vaut le nombre de lignes du début dont TOUTES les cases sont des cases de titre (un titre fusionné sur deux lignes de titres : un seul groupe, donc une ligne du tableau) ; zéro sans cases de titre, avec une ligne mêlant titres et données, quand une case de titre fusionnée déborde sur une ligne de données, quand tout le tableau est fait de titres, dans une colonne, dans un tableau de document dont les lignes ont une hauteur réglée (même règle que les autres) et dans le modèle Grille (aucune ligne de titres)',
    run: async (h) => {
      const realActive = GridEditor.isActive;
      try {
        await h.resetEditor();
        PageLayout.setMarginsMm(null);
        const flagOf = async html => {
          const { result } = await pdfOf(h, html);
          const tables = outerTablesOf(result.content);
          return tables.length ? tables.map(t => t.table.headerRows) : null;
        };
        const mixed = '<table><tbody><tr><th><p>T</p></th><td><p>D</p></td></tr>' + rowsHtml(0, 5, 1) + '</tbody></table>';
        const spanning = '<table><tbody><tr><th rowspan="2"><p>T</p></th><th><p>U</p></th></tr><tr><td><p>D</p></td></tr>' + rowsHtml(0, 5, 1) + '</tbody></table>';
        const spanningTitles = '<table><tbody><tr><th rowspan="2"><p>T</p></th><th><p>U</p></th></tr><tr><th><p>V</p></th></tr>' + rowsHtml(0, 5, 1) + '</tbody></table>';
        const allTitles = '<table><tbody>' + titleRowsHtml(4) + '</tbody></table>';
        const inColumn = '<div class="two-columns-zone" style="--layout-left: 50%"><div class="two-columns-column">' + titledTableHtml(6, 1, 1) + '</div><div class="two-columns-column"><p>Texte à côté</p></div></div>';
        const grid = '<table><tbody><tr data-row-height="30"><th><p>T</p></th><th><p>U</p></th></tr><tr data-row-height="30"><td><p>1</p></td><td><p>2</p></td></tr><tr data-row-height="30"><td><p>3</p></td><td><p>4</p></td></tr></tbody></table>';
        const got = {
          plain: await flagOf(tableHtml(8, 1)), one: await flagOf(titledTableHtml(8, 1, 1)), two: await flagOf(titledTableHtml(8, 1, 2)),
          mixed: await flagOf(mixed), spanning: await flagOf(spanning), spanningTitles: await flagOf(spanningTitles), allTitles: await flagOf(allTitles), inColumn: await flagOf(inColumn),
          heights: await flagOf(grid),
        };
        // Le même HTML dans le modèle Grille : la grille n'a pas de ligne de titres (ses lignes ne se répètent pas), la discipline est celle du modèle ouvert.
        GridEditor.isActive = () => true;
        try { got.grid = await flagOf(grid); } finally { GridEditor.isActive = realActive; }
        // Un titre fusionné sur les deux lignes de titres : les deux lignes sont un seul groupe, donc UNE ligne du tableau.
        const pass = JSON.stringify(got.plain) === '[0]' && JSON.stringify(got.one) === '[1]' && JSON.stringify(got.two) === '[2]' && JSON.stringify(got.mixed) === '[0]'
          && JSON.stringify(got.spanning) === '[0]' && JSON.stringify(got.spanningTitles) === '[1]' && JSON.stringify(got.allTitles) === '[0]' && !!got.inColumn && got.inColumn.every(n => n === 0)
          && JSON.stringify(got.heights) === '[1]' && JSON.stringify(got.grid) === '[0]';
        return { pass, notes: JSON.stringify(got) };
      } finally { GridEditor.isActive = realActive; restoreEditor(); }
    },
  });

  cases.push({
    id: 'table_page_cut_pdf_title_rows_stay_with_the_first_piece_when_a_caption_follows',
    description: 'PDF : un tableau suivi d\'une légende (« Rester ensemble ») est rendu en deux morceaux ; les lignes de titres restent au premier, la dernière ligne seule n\'en reprend pas',
    run: async (h) => {
      try {
        await h.resetEditor();
        PageLayout.setMarginsMm(null);
        const { result } = await pdfOf(h, titledTableHtml(6, 1, 1) + '<p data-caption="true">Tableau un</p>');
        const tables = findTables(result.content);
        const pass = tables.length === 2 && tables[0].table.headerRows === 1 && tables[1].table.headerRows === 0 && tables[0].table.body.length === 6 && tables[1].table.body.length === 1;
        return { pass, notes: JSON.stringify({ tables: tables.map(t => ({ headerRows: t.table.headerRows, rows: t.table.body.length })) }) };
      } finally { restoreEditor(); }
    },
  });

  // Une ligne que Word reprend en haut de chaque page : <w:tblHeader/> dans ses propriétés, sauf valeur « false » ou « 0 ».
  const isTitleRow = tr => Array.from(tr.getElementsByTagName('w:tblHeader')).some(el => !/^(false|0|off)$/i.test(el.getAttribute('w:val') || 'true'));
  cases.push({
    id: 'table_page_cut_docx_title_rows_repeat_on_every_page',
    description: 'Word : la ligne de cases de titre porte tblHeader (lu dans le .docx généré) - Word la reprend en haut de chaque page - et elle seule ; chaque ligne garde cantSplit',
    run: async (h) => {
      try {
        await h.resetEditor();
        const parts = await h.exportDocxParts(intro(1) + titledTableHtml(9, 2, 1), null, null);
        const rows = Array.from(parts.doc.getElementsByTagName('w:tr'));
        const headed = rows.map(tr => isTitleRow(tr));
        const cantSplit = rows.every(tr => tr.getElementsByTagName('w:cantSplit').length === 1);
        const pass = rows.length === 10 && headed[0] === true && headed.slice(1).every(f => f === false) && cantSplit;
        return { pass, notes: JSON.stringify({ rows: rows.length, headed, cantSplit }) };
      } finally { restoreEditor(); }
    },
  });

  cases.push({
    id: 'table_page_cut_docx_title_rows_flag_follows_the_cells',
    description: 'Word : tblHeader sur les lignes du début dont TOUTES les cases sont des cases de titre (deux lignes : les deux) ; aucune sans cases de titre, avec une ligne mêlant titres et données, quand une case de titre fusionnée déborde sur une ligne de données, ni quand tout le tableau est fait de titres',
    run: async (h) => {
      try {
        await h.resetEditor();
        const headedOf = async html => {
          const parts = await h.exportDocxParts(html, null, null);
          return Array.from(parts.doc.getElementsByTagName('w:tr')).map(tr => (isTitleRow(tr) ? 1 : 0)).join('');
        };
        const mixed = '<table><tbody><tr><th><p>T</p></th><td><p>D</p></td></tr>' + rowsHtml(0, 3, 1) + '</tbody></table>';
        const spanning = '<table><tbody><tr><th rowspan="2"><p>T</p></th><th><p>U</p></th></tr><tr><td><p>D</p></td></tr>' + rowsHtml(0, 3, 1) + '</tbody></table>';
        const got = {
          plain: await headedOf(tableHtml(4, 1)), one: await headedOf(titledTableHtml(4, 1, 1)), two: await headedOf(titledTableHtml(4, 1, 2)),
          mixed: await headedOf(mixed), spanning: await headedOf(spanning), allTitles: await headedOf('<table><tbody>' + titleRowsHtml(3) + '</tbody></table>'),
        };
        const pass = got.plain === '0000' && got.one === '10000' && got.two === '110000' && got.mixed === '0000' && got.spanning === '00000' && got.allTitles === '000';
        return { pass, notes: JSON.stringify(got) };
      } finally { restoreEditor(); }
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.tablePageCut = cases;
})();
