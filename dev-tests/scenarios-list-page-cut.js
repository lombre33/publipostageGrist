// Suite "listPageCut" - une liste (à puces, numérotée, de tâches) se coupe ENTRE deux éléments au saut de page : aperçu de l'éditeur, Lecture et PDF au même endroit
// (demande d'Antoine, 27/11 : « je veux harmoniser pour n'avoir aucune différence entre éditeur, lecture et pdf, et avoir une coupure la plus naturelle »).
//
// Ce que montrait le balayage de la limite de page (dev-tests/verify-page-limit-sweep.mjs) : une liste qui chevauche le bas de la page restait d'une pièce dans l'éditeur et la Lecture dès que
// plus de la moitié y tenait (elle dépassait dans la marge du bas) ; sinon elle passait entière à la page suivante. Le PDF (pdfmake) la coupe entre deux éléments au pixel, là où le suivant ne tient
// plus. Une liste de six éléments dont la page ne laisse la place qu'à trois : six sur la page 1 dans la Lecture, trois et trois dans le PDF.
//
// La règle (js/table-page-cut.js : listItemsOf, measureList, listPadRule), la même que pour un tableau : l'élément qui ne tient pas dans la place restante ouvre la page suivante avec tout ce qui le suit ;
// un élément ne se coupe jamais en deux ; aucun minimum d'éléments de chaque côté. L'éditeur et la Lecture posent la couture sous le dernier élément de la page et descendent l'élément qui ouvre la page
// de la réserve et de la couture (sa marge haute, par une feuille de style : le document enregistré n'en sait rien).
//
// Pour que les verdicts ne dépendent pas des polices de la machine, la coupure est CALIBRÉE sur des mesures : la hauteur de la page est réglée pour que la coupure tombe à la moitié de la tranche d'un
// élément choisi. Le PDF se juge à ce que pdf.js y lit : chaque élément porte un jeton « I07 ».
(function () {
  const cases = [];

  // --- Fixtures ---
  const token = i => 'I' + String(i).padStart(2, '0');
  const itemHtml = i => '<li><p>' + token(i) + '</p></li>';
  const taskItemHtml = i => '<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>' + token(i) + '</p></div></li>';
  const listHtml = (n, tag) => '<' + (tag || 'ul') + '>' + Array.from({ length: n }, (_, i) => itemHtml(i)).join('') + '</' + (tag || 'ul') + '>';
  const taskListHtml = n => '<ul data-type="taskList">' + Array.from({ length: n }, (_, i) => taskItemHtml(i)).join('') + '</ul>';
  // Une liste à `groups` éléments de premier niveau portant chacun `subs` sous-éléments : les jetons suivent l'ordre du document (l'élément, puis ses sous-éléments), comme les rangs de listItemsOf.
  const nestedListHtml = (groups, subs) => {
    let n = 0;
    return '<ul>' + Array.from({ length: groups }, () => {
      const parent = token(n++);
      const kids = Array.from({ length: subs }, () => '<li><p>' + token(n++) + '</p></li>').join('');
      return '<li><p>' + parent + '</p><ul>' + kids + '</ul></li>';
    }).join('') + '</ul>';
  };
  // Des éléments de deux paragraphes (le même jeton dans les deux) ; des éléments espacés (10 pt après le paragraphe, écrit en `padding-bottom` comme ParagraphFormat).
  const multiListHtml = n => '<ul>' + Array.from({ length: n }, (_, i) => '<li><p>' + token(i) + ' premier paragraphe de l\'élément</p><p>' + token(i) + ' second paragraphe de l\'élément</p></li>').join('') + '</ul>';
  const spacedListHtml = n => '<ul>' + Array.from({ length: n }, (_, i) => '<li><p data-space-after="10" style="padding-bottom: 10pt">' + token(i) + ' élément espacé</p></li>').join('') + '</ul>';
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
  const contentTopOf = (root, zoom) => root.getBoundingClientRect().top + (parseFloat(getComputedStyle(root).paddingTop) || 0) * zoom;
  const sum = (a, b) => a + b;
  const round = v => Math.round(v * 10) / 10;
  // Les éléments de la liste de premier niveau (la première) de l'éditeur ou de la Lecture.
  const editorList = () => document.querySelector('#editor-container .tiptap > :is(ul, ol)');
  const readerList = () => document.querySelector('#reader-container .reader-content > :is(ul, ol)');
  // Les éléments dans l'ordre du document, ceux des sous-listes compris (le grain de la coupure : TablePageCut.listItemsOf).
  const itemsIn = list => TablePageCut.listItemsOf(list) || Array.from(list.children).filter(child => child.tagName === 'LI');
  const labelOf = item => (item.querySelector('p') || item).textContent;

  // Ce que la personne voit d'une page coupée : les bandes de saut de page, et pour chaque élément le haut de son texte et le bas. `aligned[i]` : rang du premier élément dont le texte est sous la
  // bande i (-1 : aucun) ; `overlaps` : éléments dont le texte est recouvert par une bande ; `textBelow` : le texte de l'élément qui ouvre la page commence juste sous sa bande (à moins de 14 px) et
  // l'élément d'avant finit au-dessus ; `reserve[i]` : la place libre entre le bas de cet élément d'avant et la bande ; `lastBottoms[i]` : le bas du dernier élément de la page i, `bandTops[i]` : le haut de sa bande.
  function seamReport(containerSelector, items) {
    const bands = Array.from(document.querySelectorAll(containerSelector + ' .v2-page-band'));
    const rects = bands.map(b => b.getBoundingClientRect());
    const rows = items.map((item) => {
      const para = item.querySelector('p');
      return { textTop: para.getBoundingClientRect().top, textBottom: para.getBoundingClientRect().bottom, label: para.textContent };
    });
    const aligned = rects.map(r => rows.findIndex(row => row.textTop >= r.bottom - 1));
    const overlaps = rects.reduce((n, r) => n + rows.filter(row => row.textTop < r.bottom - 0.5 && row.textBottom > r.top + 0.5).length, 0);
    const textBelow = rects.every((r, i) => aligned[i] > 0 && rows[aligned[i]].textTop - r.bottom < 14 && rows[aligned[i] - 1].textBottom <= r.top + 0.5);
    const reserve = rects.map((r, i) => aligned[i] > 0 ? round(r.top - rows[aligned[i] - 1].textBottom) : null);
    return { bands: bands.length, aligned, overlaps, textBelow, reserve, firstOfPage2: aligned.length && aligned[0] >= 0 ? rows[aligned[0]].label : null };
  }
  const editorReport = () => seamReport('#editor-container', itemsIn(editorList()));
  const readerReport = () => seamReport('#reader-container', itemsIn(readerList()));
  const paginationStyle = () => { const s = document.getElementById('v2-pagination-margins-style'); return s ? s.textContent : ''; };
  const paginationReaderStyle = () => Array.from(document.querySelectorAll('#reader-container .reader-content > style')).map(el => el.textContent).join('\n');
  const hasItemRule = css => /> :nth-child\(\d+\)( > :nth-child\(\d+\))* \{ margin-top: [\d.]+px !important; \}/.test(css);

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
    ['editor-container', 'reader-container'].forEach((id) => {
      const box = document.getElementById(id);
      ['--pp-fit-zoom', '--pp-row-grow', 'max-width'].forEach(name => box.style.removeProperty(name));
    });
    document.getElementById('reader-container').style.display = '';
    document.getElementById('editor-container').style.display = '';
  };
  // Les tranches de hauteur de la liste (cf. TablePageCut.measureList) SANS l'effet des coupures déjà posées : la marge que la couture a ajoutée au haut d'un élément est retranchée.
  function slicesOf(list) {
    const items = itemsIn(list);
    const resting = parseFloat(getComputedStyle(items[0]).marginTop) || 0;
    return TablePageCut.measureList(list, list, zoomOf(list), 1e6, item => Math.max(0, (parseFloat(getComputedStyle(item).marginTop) || 0) - resting));
  }
  // Hauteur de page pour que l'élément `k` soit le premier de la page 2 : `before` (ce qui précède la liste) + les éléments 0 à k-1 + la moitié de la tranche de k.
  const pageHeightForCutBefore = (beforePx, segs, k, fraction) => beforePx + segs.slice(0, k).reduce(sum, 0) + segs[k] * (fraction || 0.5);
  // Charge `html` dans l'éditeur et règle la page pour que l'élément `k` ouvre la page 2.
  async function editorCutBefore(h, html, k, opts) {
    await loadEditor(h, html, opts);
    const tip = h.tiptap();
    const list = editorList();
    const before = (list.getBoundingClientRect().top - contentTopOf(tip, zoomOf(tip))) / zoomOf(tip);
    const m = slicesOf(list);
    const savedHtml = Editor.getHTML();
    const contentPx = pageHeightForCutBefore(before, m.segs, k, opts && opts.fraction);
    setPageContentHeight(contentPx);
    Editor.refreshPaginationPreview();
    await h.sleep(400);
    return { before, segs: m.segs, savedHtml, contentPx };
  }
  async function readerCutBefore(h, html, k, pageContentPx) {
    await h.resetEditor();
    h.setA4Preview(true);
    PageLayout.setMarginsMm(null);
    let wrapper = await h.renderReaderMode(html);
    await h.sleep(250);
    const list = wrapper.querySelector(':scope > :is(ul, ol)');
    const before = (list.getBoundingClientRect().top - contentTopOf(wrapper, zoomOf(wrapper))) / zoomOf(wrapper);
    const m = slicesOf(list);
    const contentPx = pageContentPx != null ? pageContentPx : pageHeightForCutBefore(before, m.segs, k);
    setPageContentHeight(contentPx);
    await h.renderReaderMode(html);
    await h.sleep(400);
    return { before, segs: m.segs, contentPx };
  }
  // Les jetons « I07 » que pdf.js lit sur chaque page : { page, item }.
  function pdfTokens(gt) {
    const found = [];
    gt.pages.forEach((page, p) => page.textItems.forEach((item) => {
      const re = /I(\d\d)/g;
      let m;
      while ((m = re.exec(item.str))) found.push({ page: p, item: Number(m[1]) });
    }));
    return found;
  }
  async function pdfOf(h, html) {
    const result = await h.exportPdfContent(html, null, PageLayout.getMarginsPt());
    const gt = await h.extractPdfGroundTruth(result.base64);
    return { result, gt, tokens: pdfTokens(gt) };
  }
  // Le rang du premier élément de la page 2 du PDF, -1 s'il n'y a pas de page 2.
  const pdfFirstOfPage2 = tokens => { const two = tokens.filter(t => t.page === 1).map(t => t.item); return two.length ? Math.min(...two) : -1; };

  // --- Module : TablePageCut, les listes (pur, sans page) ---
  cases.push({
    id: 'list_page_cut_module_reads_the_items_and_their_slices',
    description: 'TablePageCut.listItemsOf rend les éléments d\'une liste d\'au moins deux éléments (puces, numérotée, de tâches), rien pour un seul élément, pour un élément enveloppé (suivi) ou pour un autre bloc ; measureList rend des tranches dont la somme est la hauteur du bloc',
    run: async (h) => {
      try {
        await loadEditor(h, listHtml(5) + listHtml(3, 'ol') + listHtml(1));
        const lists = Array.from(h.tiptap().querySelectorAll(':scope > :is(ul, ol)'));
        const [bullets, ordered, single] = lists;
        const counts = [TablePageCut.listItemsOf(bullets), TablePageCut.listItemsOf(ordered), TablePageCut.listItemsOf(single), TablePageCut.listItemsOf(document.createElement('div')), TablePageCut.listItemsOf(null)]
          .map(items => (items ? items.length : null));
        const wrapped = document.createElement('ul');
        wrapped.innerHTML = '<li>a</li><ins><li>b</li></ins>';
        const m = TablePageCut.measureList(bullets, bullets, zoomOf(bullets), 1e6, null);
        const total = bullets.getBoundingClientRect().height / zoomOf(bullets);
        const sliced = m && Math.abs(m.segs.reduce(sum, 0) - total) < 0.01 && m.segs.length === 5 && m.starts.join() === '0,1,2,3,4';
        // Un élément plus haut que 90 % de la page : la liste ne se coupe pas entre ses éléments.
        const tall = TablePageCut.measureList(bullets, bullets, zoomOf(bullets), m ? m.heights[0] / 0.95 : 1, null);
        const roomy = TablePageCut.measureList(bullets, bullets, zoomOf(bullets), 1e6, item => (item === bullets.children[2] ? 7 : 0));
        const padded = roomy && Math.abs(roomy.segs[1] - (m.segs[1] - 7)) < 0.01;
        const pass = counts.join() === '5,3,,,' && TablePageCut.listItemsOf(wrapped) === null && sliced && tall === null && padded;
        return { pass, notes: JSON.stringify({ counts, sliced, tall: tall === null, padded, segs: m && m.segs.map(round) }) };
      } finally { restoreEditor(); }
    },
  });

  cases.push({
    id: 'list_page_cut_pad_rule_writes_the_margin_of_the_item_that_opens_the_page',
    description: 'TablePageCut.listPadRule écrit la marge haute de l\'élément, visé par son chemin parmi les enfants (un élément de premier niveau, un élément de sous-liste), avec !important',
    run: async () => {
      const host = document.createElement('div');
      host.innerHTML = '<ul><li><p>a</p></li><li><p>b</p></li><li><p>c</p></li><li><p>d</p></li><li><p>e</p><ul><li><p>f</p></li><li><p>g</p></li></ul></li></ul>';
      const list = host.firstElementChild;
      const top = list.children[4];
      const sub = top.querySelector('ul').children[1];
      const flat = TablePageCut.listPadRule('#a > *:nth-child(3)', list, top, 31.25);
      const nested = TablePageCut.listPadRule('#a > *:nth-child(3)', list, sub, 12);
      const pass = flat === '#a > *:nth-child(3) > :nth-child(5) { margin-top: 31.25px !important; }'
        && nested === '#a > *:nth-child(3) > :nth-child(5) > :nth-child(2) > :nth-child(2) { margin-top: 12px !important; }';
      return { pass, notes: JSON.stringify({ flat, nested }) };
    },
  });

  cases.push({
    id: 'list_page_cut_module_nested_items_are_units_of_their_own',
    description: 'TablePageCut.listItemsOf rend les éléments à toute profondeur dans l\'ordre du document (un seul élément de premier niveau qui porte une sous-liste suffit) ; measureList mesure le texte de chaque élément (jusqu\'à sa première sous-liste), la somme des tranches est la hauteur du bloc ; itemBottom rend le haut de la sous-liste',
    run: async (h) => {
      try {
        await loadEditor(h, nestedListHtml(3, 3));
        const list = editorList();
        const items = TablePageCut.listItemsOf(list);
        const m = TablePageCut.measureList(list, list, zoomOf(list), 1e6, null);
        const total = list.getBoundingClientRect().height / zoomOf(list);
        const parent = items[0];
        const parentText = parent.querySelector(':scope > p').getBoundingClientRect();
        const bottomOk = Math.abs(TablePageCut.itemBottom(parent) - parentText.bottom) < 0.01;
        const leaf = items[1];
        const leafOk = Math.abs(TablePageCut.itemBottom(leaf) - leaf.getBoundingClientRect().bottom) < 0.01;
        const sliced = m && Math.abs(m.segs.reduce(sum, 0) - total) < 0.01 && m.segs.length === 12;
        const heightOk = m && Math.abs(m.heights[0] - parentText.height / zoomOf(list)) < 0.01 && m.heights[0] < parent.getBoundingClientRect().height / zoomOf(list) / 2;
        await loadEditor(h, '<ul><li><p>seul</p><ul><li><p>sous</p></li></ul></li></ul>');
        const two = (TablePageCut.listItemsOf(editorList()) || []).length;
        await loadEditor(h, '<ul><li><p>seul</p></li></ul>');
        const one = TablePageCut.listItemsOf(editorList());
        const pass = items && items.length === 12 && bottomOk && leafOk && sliced && heightOk && two === 2 && one === null;
        return { pass, notes: JSON.stringify({ n: items && items.length, bottomOk, leafOk, sliced, heightOk, two, one: one === null }) };
      } finally { restoreEditor(); }
    },
  });

  // --- Éditeur : la couture tombe ENTRE deux éléments ---
  cases.push({
    id: 'list_page_cut_editor_seam_falls_between_two_items',
    description: 'Éditeur : une liste à puces qui chevauche le saut de page se coupe entre deux éléments - la bande est posée sous le dernier élément de la page 1, aucun texte d\'élément dessous, document enregistré inchangé, aucun élément ne dépasse dans la marge du bas',
    run: async (h) => {
      try {
        const k = 12;
        const cut = await editorCutBefore(h, intro(2) + listHtml(20), k);
        const rep = editorReport();
        const html = Editor.getHTML();
        const pass = rep.bands === 1 && rep.aligned[0] === k && rep.overlaps === 0 && rep.textBelow && hasItemRule(paginationStyle())
          && html === cut.savedHtml && !/margin-top/.test(html);
        return { pass, notes: JSON.stringify(Object.assign({ k, htmlUnchanged: html === cut.savedHtml, rule: hasItemRule(paginationStyle()) }, rep)) };
      } finally { restoreEditor(); }
    },
  });

  cases.push({
    id: 'list_page_cut_editor_numbered_and_task_lists_are_cut_between_items_too',
    description: 'Éditeur : une liste numérotée et une liste de tâches se coupent entre deux éléments, comme une liste à puces ; la numérotation continue sur la page 2',
    run: async (h) => {
      try {
        const k = 9;
        await editorCutBefore(h, intro(1) + listHtml(16, 'ol'), k);
        const ordered = editorReport();
        await editorCutBefore(h, intro(1) + taskListHtml(16), k);
        const tasks = editorReport();
        const pass = [ordered, tasks].every(rep => rep.bands === 1 && rep.aligned[0] === k && rep.overlaps === 0 && rep.textBelow);
        return { pass, notes: JSON.stringify({ ordered, tasks }) };
      } finally { restoreEditor(); }
    },
  });

  cases.push({
    id: 'list_page_cut_editor_each_page_of_a_long_list_is_cut_between_items',
    description: 'Éditeur : une liste de trois pages a deux coupures, chacune entre deux éléments et sans texte recouvert',
    run: async (h) => {
      try {
        await editorCutBefore(h, intro(1) + listHtml(50), 20);
        const rep = editorReport();
        const pass = rep.bands === 2 && rep.aligned[0] === 20 && rep.aligned[1] > 20 && rep.overlaps === 0 && rep.textBelow;
        return { pass, notes: JSON.stringify(rep) };
      } finally { restoreEditor(); }
    },
  });

  cases.push({
    id: 'list_page_cut_editor_the_list_never_runs_into_the_bottom_margin',
    description: 'Éditeur : plus de la moitié de la liste tient dans la place restante, et le dernier élément de la page 1 finit pourtant au-dessus de la bande (avant, la liste restait entière et dépassait dans la marge du bas)',
    run: async (h) => {
      try {
        // La coupure à 40 % de la liste : avant, plus de la moitié tenait donc la liste restait entière sur la page 1.
        await loadEditor(h, intro(2) + listHtml(10));
        const k = 6;
        await editorCutBefore(h, intro(2) + listHtml(10), k);
        const rep = editorReport();
        const items = itemsIn(editorList());
        const band = document.querySelector('#editor-container .v2-page-band').getBoundingClientRect();
        const lastOfPage1 = items[k - 1].getBoundingClientRect();
        const pass = rep.bands === 1 && rep.aligned[0] === k && lastOfPage1.bottom <= band.top + 0.5;
        return { pass, notes: JSON.stringify(Object.assign({ lastBottom: round(lastOfPage1.bottom), bandTop: round(band.top) }, rep)) };
      } finally { restoreEditor(); }
    },
  });

  cases.push({
    id: 'list_page_cut_editor_a_list_of_one_item_or_a_tall_item_stays_whole',
    description: 'Éditeur : une liste d\'un seul élément, ou dont un élément dépasse 90 % de la page, garde l\'ancienne règle (un bloc d\'une pièce, aucune coupure entre ses éléments)',
    run: async (h) => {
      try {
        await loadEditor(h, intro(2) + listHtml(1));
        setPageContentHeight(60);
        Editor.refreshPaginationPreview();
        await h.sleep(400);
        const single = HeaderFooterPreview.pageBreaks().filter(brk => brk.inner).length;
        const tallItem = '<ul><li><p>' + Array.from({ length: 80 }, (_, i) => 'Un élément très long ' + i).join(' ') + '</p></li><li><p>Suivant</p></li></ul>';
        await loadEditor(h, intro(1) + tallItem);
        // La page est réglée sur la hauteur du premier élément (plus de 90 % d'elle) : la liste ne se coupe pas entre ses éléments.
        setPageContentHeight(editorList().firstElementChild.getBoundingClientRect().height / zoomOf(editorList()) / 0.95);
        Editor.refreshPaginationPreview();
        await h.sleep(400);
        const tall = HeaderFooterPreview.pageBreaks().filter(brk => brk.inner).length;
        return { pass: single === 0 && tall === 0, notes: JSON.stringify({ single, tall }) };
      } finally { restoreEditor(); }
    },
  });

  // --- Lecture : la couture tombe ENTRE deux éléments ---
  cases.push({
    id: 'list_page_cut_reader_seam_falls_between_two_items',
    description: 'Lecture : une liste qui chevauche le saut de page se coupe entre deux éléments - bande sous le dernier élément de la page 1, aucun texte recouvert, la règle de coupure dans la feuille de la Lecture',
    run: async (h) => {
      try {
        const k = 12;
        await readerCutBefore(h, intro(2) + listHtml(20), k);
        const rep = readerReport();
        const pass = rep.bands === 1 && rep.aligned[0] === k && rep.overlaps === 0 && rep.textBelow && hasItemRule(paginationReaderStyle());
        return { pass, notes: JSON.stringify(Object.assign({ k, rule: hasItemRule(paginationReaderStyle()) }, rep)) };
      } finally { restoreEditor(); }
    },
  });

  cases.push({
    id: 'list_page_cut_reader_numbered_and_task_lists_and_many_pages',
    description: 'Lecture : liste numérotée, liste de tâches et liste de trois pages se coupent entre deux éléments, sans texte recouvert',
    run: async (h) => {
      try {
        const k = 9;
        await readerCutBefore(h, intro(1) + listHtml(16, 'ol'), k);
        const ordered = readerReport();
        await readerCutBefore(h, intro(1) + taskListHtml(16), k);
        const tasks = readerReport();
        await readerCutBefore(h, intro(1) + listHtml(50), 20);
        const long = readerReport();
        const pass = [ordered, tasks].every(rep => rep.bands === 1 && rep.aligned[0] === k && rep.overlaps === 0 && rep.textBelow)
          && long.bands === 2 && long.aligned[0] === 20 && long.aligned[1] > 20 && long.overlaps === 0 && long.textBelow;
        return { pass, notes: JSON.stringify({ ordered, tasks, long }) };
      } finally { restoreEditor(); }
    },
  });

  // --- PDF : au même endroit que l'éditeur et la Lecture ---
  cases.push({
    id: 'list_page_cut_gap_editor_reader_and_pdf_cut_the_list_at_the_same_item',
    description: 'Éditeur, Lecture et PDF (relu par pdf.js) : l\'élément qui ouvre la page 2 est le même, pour une liste à puces, une liste numérotée et une liste de tâches, à trois endroits de coupure',
    run: async (h) => {
      try {
        const seen = [];
        for (const [name, html] of [['puces', intro(2) + listHtml(40)], ['numérotée', intro(2) + listHtml(40, 'ol')], ['tâches', intro(2) + taskListHtml(40)]]) {
          for (const k of [4, 13, 24]) {
            const cut = await editorCutBefore(h, html, k);
            const editor = editorReport().aligned[0];
            await readerCutBefore(h, html, k, cut.contentPx);
            const reader = readerReport().aligned[0];
            const { tokens } = await pdfOf(h, html);
            seen.push({ name, k, editor, reader, pdf: pdfFirstOfPage2(tokens) });
          }
        }
        const pass = seen.every(s => s.editor === s.k && s.reader === s.k && s.pdf === s.k);
        return { pass, notes: JSON.stringify(seen) };
      } finally { restoreEditor(); }
    },
  });

  cases.push({
    id: 'list_page_cut_gap_the_item_that_does_not_fit_by_a_pixel_opens_the_page_in_all_three',
    description: 'Éditeur, Lecture et PDF : avec 2 px de place en moins que la tranche de l\'élément, il ouvre la page 2 ; avec 10 px de plus, il reste sur la page 1 - du même côté dans les trois',
    run: async (h) => {
      try {
        const k = 11;
        const seen = [];
        for (const slack of [-2, 10]) {
          const html = intro(8) + listHtml(40);
          await loadEditor(h, html);
          const tip = h.tiptap();
          const list = editorList();
          const before = (list.getBoundingClientRect().top - contentTopOf(tip, zoomOf(tip))) / zoomOf(tip);
          const m = slicesOf(list);
          // Les éléments 0 à k posés, plus `slack` : élément k tient (slack ≥ 0) ou non.
          const contentPx = before + m.segs.slice(0, k + 1).reduce(sum, 0) + slack;
          setPageContentHeight(contentPx);
          Editor.refreshPaginationPreview();
          await h.sleep(400);
          const editor = editorReport().aligned[0];
          await readerCutBefore(h, html, k, contentPx);
          const reader = readerReport().aligned[0];
          const { tokens } = await pdfOf(h, html);
          seen.push({ slack, editor, reader, pdf: pdfFirstOfPage2(tokens) });
        }
        const pass = seen[0].editor === k && seen[0].reader === k && seen[0].pdf === k
          && seen[1].editor === k + 1 && seen[1].reader === k + 1 && seen[1].pdf === k + 1;
        return { pass, notes: JSON.stringify(seen) };
      } finally { restoreEditor(); }
    },
  });

  // --- Sous-listes, éléments de plusieurs paragraphes, éléments espacés : le même grain partout ---
  // Le grain est le TEXTE d'un élément à toute profondeur : un élément qui porte une sous-liste ne passe pas d'une pièce avec elle (la page se coupe entre un élément et son premier sous-élément, ou entre
  // deux sous-éléments, comme dans le PDF), et le texte d'un élément - ses paragraphes, ses lignes - ne se coupe nulle part (le PDF le gardait d'une pièce à partir de la même mesure).
  cases.push({
    id: 'list_page_cut_gap_nested_items_cut_at_the_same_item_in_all_three',
    description: 'Éditeur, Lecture et PDF (relu par pdf.js) : une liste à sous-listes se coupe au même élément - devant un sous-élément ou devant un élément de premier niveau - aux trois endroits de coupure',
    run: async (h) => {
      try {
        const html = intro(2) + nestedListHtml(4, 4);
        const seen = [];
        for (const k of [2, 5, 8, 13]) {
          const cut = await editorCutBefore(h, html, k);
          const editor = editorReport().aligned[0];
          await readerCutBefore(h, html, k, cut.contentPx);
          const reader = readerReport().aligned[0];
          const { tokens } = await pdfOf(h, html);
          seen.push({ k, editor, reader, pdf: pdfFirstOfPage2(tokens) });
        }
        const pass = seen.every(s => s.editor === s.k && s.reader === s.k && s.pdf === s.k);
        return { pass, notes: JSON.stringify(seen) };
      } finally { restoreEditor(); }
    },
  });

  cases.push({
    id: 'list_page_cut_gap_nested_numbered_list_is_cut_between_sub_items_too',
    description: 'Éditeur et Lecture : une liste numérotée à sous-listes numérotées coupée au milieu d\'une sous-liste - bande sous le dernier élément de la page, aucun texte recouvert, la règle de coupure vise l\'élément de la sous-liste',
    run: async (h) => {
      try {
        const html = intro(1) + nestedListHtml(4, 4).replace(/<ul>/g, '<ol>').replace(/<\/ul>/g, '</ol>');
        const k = 7;
        const cut = await editorCutBefore(h, html, k);
        const editor = editorReport();
        const nestedRule = css => /> :nth-child\(\d+\) > :nth-child\(\d+\) > :nth-child\(\d+\) \{ margin-top: [\d.]+px !important; \}/.test(css);
        const editorRule = nestedRule(paginationStyle());
        await readerCutBefore(h, html, k, cut.contentPx);
        const reader = readerReport();
        const readerRule = nestedRule(paginationReaderStyle());
        const pass = [editor, reader].every(rep => rep.bands >= 1 && rep.aligned[0] === k && rep.overlaps === 0 && rep.textBelow) && editorRule && readerRule;
        return { pass, notes: JSON.stringify({ editor, reader, editorRule, readerRule }) };
      } finally { restoreEditor(); }
    },
  });

  // Aucun paragraphe d'élément n'est recouvert par une bande (le texte d'un élément de plusieurs paragraphes se garde d'une pièce).
  const paragraphOverlaps = (containerSelector) => {
    const bands = Array.from(document.querySelectorAll(containerSelector + ' .v2-page-band')).map(b => b.getBoundingClientRect());
    const paragraphs = Array.from(document.querySelectorAll(containerSelector + ' :is(ul, ol) p')).map(p => p.getBoundingClientRect());
    return bands.reduce((n, r) => n + paragraphs.filter(p => p.top < r.bottom - 0.5 && p.bottom > r.top + 0.5).length, 0);
  };
  cases.push({
    id: 'list_page_cut_gap_an_item_of_two_paragraphs_is_never_cut_in_two',
    description: 'Éditeur, Lecture et PDF : la coupure tombe au milieu d\'un élément de deux paragraphes - l\'élément passe en entier à la page 2 dans les trois (avant, le PDF coupait entre ses deux paragraphes)',
    run: async (h) => {
      try {
        const html = intro(2) + multiListHtml(16);
        const seen = [];
        for (const k of [5, 9]) {
          // La page finit aux trois quarts de la tranche de l'élément : sa première ligne tient, la seconde non.
          const cut = await editorCutBefore(h, html, k, { fraction: 0.75 });
          const editor = editorReport().aligned[0];
          const editorOverlaps = paragraphOverlaps('#editor-container');
          await readerCutBefore(h, html, k, cut.contentPx);
          const reader = readerReport().aligned[0];
          const readerOverlaps = paragraphOverlaps('#reader-container');
          const { tokens } = await pdfOf(h, html);
          const split = [...new Set(tokens.map(t => t.item))].filter(item => new Set(tokens.filter(t => t.item === item).map(t => t.page)).size > 1);
          seen.push({ k, editor, reader, pdf: pdfFirstOfPage2(tokens), editorOverlaps, readerOverlaps, split });
        }
        const pass = seen.every(s => s.editor === s.k && s.reader === s.k && s.pdf === s.k && s.editorOverlaps === 0 && s.readerOverlaps === 0 && s.split.length === 0);
        return { pass, notes: JSON.stringify(seen) };
      } finally { restoreEditor(); }
    },
  });

  cases.push({
    id: 'list_page_cut_gap_the_space_after_an_item_does_not_count_to_keep_it_on_the_page',
    description: 'Éditeur, Lecture et PDF : un élément dont les lignes tiennent mais pas l\'espacement qui les suit (10 pt après le paragraphe) reste sur la page 1 dans les trois - le PDF et Word ne demandent pas cette place vide',
    run: async (h) => {
      try {
        const k = 11;
        const html = intro(2) + spacedListHtml(30);
        await loadEditor(h, html);
        const tip = h.tiptap();
        const list = editorList();
        const before = (list.getBoundingClientRect().top - contentTopOf(tip, zoomOf(tip))) / zoomOf(tip);
        const m = slicesOf(list);
        // Les éléments 0 à k-1 posés, puis le texte de k et 3 px : l'espacement de k (13,3 px) n'y tient pas.
        const contentPx = before + m.segs.slice(0, k).reduce(sum, 0) + m.heights[k] - m.trails[k] + 3;
        setPageContentHeight(contentPx);
        Editor.refreshPaginationPreview();
        await h.sleep(400);
        const editor = editorReport().aligned[0];
        await readerCutBefore(h, html, k, contentPx);
        const reader = readerReport().aligned[0];
        const { tokens } = await pdfOf(h, html);
        const seen = { trail: round(m.trails[k]), editor, reader, pdf: pdfFirstOfPage2(tokens) };
        return { pass: m.trails[k] > 10 && seen.editor === k + 1 && seen.reader === k + 1 && seen.pdf === k + 1, notes: JSON.stringify(seen) };
      } finally { restoreEditor(); }
    },
  });

  // --- Une page de document en diapositives (extensions/diapositives/page-slides.js) coupe la liste là où l'éditeur la coupe ---
  async function pageSlides() {
    if (typeof PageSlides === 'undefined') {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'extensions/diapositives/page-slides.js';
        script.onload = resolve;
        script.onerror = () => reject(new Error('page-slides.js'));
        document.head.appendChild(script);
      });
    }
    return PageSlides;
  }
  cases.push({
    id: 'list_page_cut_slides_split_a_nested_numbered_list_between_its_items_and_keep_the_numbering',
    description: 'Une page de document en diapositives : une liste numérotée à sous-listes se coupe entre ses éléments, à toute profondeur ; chaque élément garde le numéro qu\'il avait dans le document (la suite d\'une sous-liste reprend ses éléments parents, vides et sans puce, et la numérotation `start` continue)',
    run: async (h) => {
      try {
        const slides = await pageSlides();
        const html = intro(1) + nestedListHtml(4, 4).replace(/<ul>/g, '<ol>').replace(/<\/ul>/g, '</ol>');
        // La page est réglée pour que l'éditeur coupe en plusieurs endroits ; ce qui compte ici est ce que les diapositives en font, quelle que soit leur géométrie.
        await editorCutBefore(h, html, 7);
        // Le numéro qu'affiche chaque élément : la numérotation de départ de sa liste, plus son rang parmi ses frères (un élément de reprise, sans puce, compte comme les autres).
        const numberOf = (p) => {
          const item = p.closest('li');
          const list = item.parentElement;
          return (parseInt(list.getAttribute('start') || '1', 10) || 1) + Array.from(list.children).filter(child => child.tagName === 'LI').indexOf(item);
        };
        const tokenNumbers = (root) => Array.from(root.querySelectorAll('li > p')).filter(p => /^I\d\d$/.test(p.textContent)).map(p => p.textContent + ':' + numberOf(p));
        const original = document.createElement('div');
        original.innerHTML = html;
        const expected = tokenNumbers(original);
        const holder = document.createElement('div');
        holder.innerHTML = html;
        const result = slides.fromPage(holder, {});
        const out = document.createElement('div');
        out.innerHTML = result.html;
        const seen = tokenNumbers(out);
        const parts = Array.from(out.children).filter(el => el.tagName === 'OL');
        const continuations = parts.slice(1).map(part => part.querySelector(':scope > li'));
        // Au moins une coupure tombe dans une sous-liste : sa suite reprend l'élément parent, vide et sans puce.
        const continues = continuations.some(item => item && item.style.listStyle === 'none' && !!item.querySelector(':scope > ol') && !item.querySelector(':scope > p'));
        const pass = result.slides >= 3 && seen.join() === expected.join() && continues;
        return { pass, notes: JSON.stringify({ slides: result.slides, parts: parts.length, continues, same: seen.join() === expected.join(), seen: seen.slice(0, 12) }) };
      } finally { restoreEditor(); }
    },
  });

  // --- Les numéros de page et les numéros d'élément suivent la coupure ---
  cases.push({
    id: 'list_page_cut_editor_page_index_of_an_item_follows_the_cut',
    description: 'Éditeur : la page d\'un élément coupé est celle de sa place (HeaderFooterPreview.pageIndexOf) - les éléments avant la coupure sont en page 1, ceux d\'après en page 2 ; la coupure est « inner »',
    run: async (h) => {
      try {
        const k = 12;
        await editorCutBefore(h, intro(2) + listHtml(40), k);
        const items = itemsIn(editorList());
        const pages = items.map(item => HeaderFooterPreview.pageIndexOf(item.querySelector('p')));
        const inner = HeaderFooterPreview.pageBreaks().map(brk => brk.inner);
        const pass = pages.slice(0, k).every(p => p === 0) && pages.slice(k, k + 5).every(p => p === 1) && inner[0] === true;
        return { pass, notes: JSON.stringify({ pages: pages.slice(0, k + 3), inner }) };
      } finally { restoreEditor(); }
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.listPageCut = cases;
})();
