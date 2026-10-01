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
// DISPARAÎTRE avec dontBreakRows), des cases fusionnées sur plusieurs lignes, un tableau dans une colonne, une grille.
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
  const intro = n => Array.from({ length: n }, (_, i) => '<p>Introduction ' + i + '</p>').join('');
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
    description: 'rowsOf() : un tableau simple donne ses lignes ; une ligne seule, un en-tête, des cases fusionnées sur plusieurs lignes, une ligne de grille ou une ligne en suggestion donnent null',
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
      const pass = got.plain === 3 && got.oneRow === null && got.withHead === null && got.merged === null && got.grid === null && got.none === null;
      return { pass, notes: JSON.stringify(Object.assign(got, { suggestedRows: (TablePageCut.rowsOf(suggested) || []).length })) };
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

  cases.push({
    id: 'table_page_cut_editor_merged_cells_keep_the_old_rule',
    description: 'Éditeur : un tableau dont une case occupe deux lignes n\'est pas coupé entre ses lignes (la coupure couperait la case) - il garde son comportement d\'avant',
    run: async (h) => {
      try {
        const merged = '<table><tbody><tr><td rowspan="2"><p>A</p></td><td><p>B</p></td></tr><tr><td><p>C</p></td></tr>' + rowsHtml(2, 24, 1) + '</tbody></table>';
        await loadEditor(h, intro(1) + merged);
        setPageContentHeight(400);
        Editor.refreshPaginationPreview();
        await h.sleep(400);
        const table = h.tiptap().querySelector('table');
        const spans = Array.from(table.querySelectorAll('td')).some(td => td.rowSpan > 1);
        const pass = spans && TablePageCut.rowsOf(table) === null && !hasRowRule();
        return { pass, notes: JSON.stringify({ spans, rowsOf: TablePageCut.rowsOf(table) === null ? null : 'rows', rowRule: hasRowRule() }) };
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
    id: 'table_page_cut_pdf_keeps_every_row_whole_flag_only_on_tables_that_can_take_it',
    description: 'PDF : dontBreakRows est posé sur le tableau du flux principal, et seulement là - pas sur une ligne trop haute pour une page, des cases fusionnées sur plusieurs lignes, ni un tableau dans une colonne',
    run: async (h) => {
      try {
        await h.resetEditor();
        PageLayout.setMarginsMm(null);
        const flagOf = async html => {
          const { result } = await pdfOf(h, html);
          const tables = findTables(result.content);
          return tables.length ? tables.map(t => !!t.table.dontBreakRows) : null;
        };
        const merged = '<table><tbody><tr><td rowspan="2"><p>A</p></td><td><p>B</p></td></tr><tr><td><p>C</p></td></tr>' + rowsHtml(2, 8, 1) + '</tbody></table>';
        const tall = '<table><tbody>' + rowsHtml(0, 2, 1) + rowHtml(2, 90) + rowsHtml(3, 5, 1) + '</tbody></table>';
        const inColumn = '<div class="two-columns-zone" style="--layout-left: 50%"><div class="two-columns-column">' + tableHtml(6, 1) + '</div><div class="two-columns-column"><p>Texte à côté</p></div></div>';
        const got = { plain: await flagOf(tableHtml(8, 1)), merged: await flagOf(merged), tall: await flagOf(tall), inColumn: await flagOf(inColumn) };
        const pass = JSON.stringify(got.plain) === '[true]' && JSON.stringify(got.merged) === '[false]' && JSON.stringify(got.tall) === '[false]' && !!got.inColumn && got.inColumn.every(f => f === false);
        return { pass, notes: JSON.stringify(got) };
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

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.tablePageCut = cases;
})();
