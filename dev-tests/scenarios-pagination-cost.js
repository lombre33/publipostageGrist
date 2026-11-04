// Suite "paginationCost" - ce que coûte l'affichage d'un long document : la pagination de l'éditeur (js/header-footer-preview.js, renderPaginationOverlay), celle de la Lecture
// (js/reader-mode.js, renderPaginationPreview), l'affichage d'un modèle (js/editor.js, setHTML) et la lecture des largeurs de colonnes (js/editor-nodes.js, withFastColwidth). Lot
// « Gros tableaux » de « Tests de charge » (04/10).
//
// Mesuré à 1 000 lignes (tableau de 6 colonnes) : 5,6 s pour afficher le tableau dans l'éditeur, dont 3,1 s de style recalculé de force, un par saut de page (chaque coupure
// réécrivait la feuille de style entière : tout le style du document refait, 86 ms par page, donc un calcul quadratique en nombre de pages) ; 1,3 s à lire le HTML (la bibliothèque
// de tableaux cherche les <col> du tableau entier pour chaque case) ; et la pagination se faisait deux fois par affichage. Les cas ci-dessous comptent ces opérations, pas des
// millisecondes (une machine plus lente ne les fait pas échouer) : une feuille complète écrite une seule fois par calcul, une pagination par affichage, une recherche de <col> par tableau.
// Chacun échoue sur l'ancien code ; les cas « résultat inchangé » (feuille entière, hauteur des pages, largeurs lues, coupures au chiffre près du calcul une à une) passent sur les
// deux. Carte « Accélérer » (21/10) : les coupures simples se posent d'un coup, vérifiées une à une (js/header-footer-preview.js et js/reader-mode.js:placeSimpleSeamsAtOnce).
(function () {
  const cases = [];
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const EMPTY_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const lines = n => Array.from({ length: n }, (_, i) => '<p>Ligne ' + (i + 1) + ' du corps du document.</p>').join('');
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  const rulesIn = text => (String(text).match(/\{/g) || []).length;

  async function setup(h, html) {
    await h.resetEditor();
    PageLayout.setMarginsMm(null);
    h.setA4Preview(true);
    Editor.setHeaderFooterData(JSON.parse(JSON.stringify(EMPTY_HF)));
    Editor.setHTML(html);
    Editor.refreshLayout();
    await h.sleep(300);
  }
  function restoreReader() {
    const container = document.getElementById('reader-container');
    if (container) container.style.display = '';
    document.getElementById('editor-container').style.display = '';
    document.getElementById('btn-mode-edit').click();
  }

  // Les écritures de texte dans une feuille de pagination (la feuille des marges de l'éditeur, celle de la Lecture et ses feuilles posées une à une) : { el, id, valeur }.
  function watchPaginationSheets() {
    const desc = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
    const writes = [];
    Object.defineProperty(Node.prototype, 'textContent', {
      configurable: true, enumerable: desc.enumerable, get: desc.get,
      set(value) {
        if (this instanceof HTMLStyleElement && (this.id === 'v2-pagination-margins-style' || this.classList.contains('v2-pagination-style'))) writes.push({ el: this, id: this.id, value: String(value) });
        desc.set.call(this, value);
      },
    });
    return { writes, stop() { Object.defineProperty(Node.prototype, 'textContent', desc); } };
  }
  // Une feuille de pagination n'est écrite en entier qu'une fois par calcul : au plus une écriture qui porte plusieurs règles, la dernière, par feuille (la Lecture
  // pose une feuille neuve à chaque calcul et en fait plus d'un par affichage : on compte par feuille, pas au total).
  const multiRuleWrites = writes => {
    const perSheet = new Map();
    writes.filter(w => rulesIn(w.value) >= 2).forEach(w => perSheet.set(w.el, (perSheet.get(w.el) || 0) + 1));
    return Math.max(0, ...perSheet.values());
  };
  const breaksInEditor = () => document.querySelectorAll('#editor-container .v2-pagination-overlay .v2-page-band').length;

  cases.push({
    id: 'pagination_editor_writes_the_whole_margins_sheet_once_per_calculation_not_once_per_page_break',
    description: "La pagination de l'éditeur (douze pages et plus) ne réécrit pas la feuille de style entière à chaque saut de page : une écriture qui porte toutes les règles, la dernière, et aucune feuille posée en route ne reste",
    run: async (h) => {
      await setup(h, lines(700));
      const breaks = breaksInEditor();
      if (breaks < 10) return { pass: false, notes: 'document trop court : ' + breaks + ' saut(s) de page seulement' };
      const headStyles = document.head.querySelectorAll('style').length;
      const watch = watchPaginationSheets();
      try {
        HeaderFooterPreview.renderPaginationOverlay();
      } finally { watch.stop(); }
      const sheet = document.getElementById('v2-pagination-margins-style');
      const marginRules = (sheet.textContent.match(/margin-bottom:/g) || []).length;
      const multi = multiRuleWrites(watch.writes);
      const leftover = document.head.querySelectorAll('style').length - headStyles;
      const same = breaksInEditor() === breaks;
      return {
        pass: multi <= 1 && marginRules === breaks && leftover === 0 && same,
        notes: breaks + ' sauts de page, écritures de la feuille portant plusieurs règles=' + multi + ' (attendu au plus 1), règles de réserve=' + marginRules + ' (attendu ' + breaks + '), feuilles <style> laissées=' + leftover + ' (attendu 0), sauts après=' + breaksInEditor(),
      };
    },
  });

  cases.push({
    id: 'pagination_editor_table_cut_over_pages_keeps_whole_sheets_and_one_pad_rule_per_cut',
    description: "Un tableau coupé entre deux lignes sur plusieurs pages : une règle de rembourrage par coupure, une seule règle de rognage, la même feuille quand le calcul est refait, sans réécriture en route",
    run: async (h) => {
      const rows = Array.from({ length: 220 }, (_, r) => '<tr>' + [1, 2, 3].map(c => '<td><p>Ligne ' + (r + 1) + ' case ' + c + '</p></td>').join('') + '</tr>').join('');
      await setup(h, '<table><tbody>' + rows + '</tbody></table>');
      const breaks = breaksInEditor();
      if (breaks < 4) return { pass: false, notes: 'tableau trop court : ' + breaks + ' saut(s) de page seulement' };
      const before = document.getElementById('v2-pagination-margins-style').textContent;
      const watch = watchPaginationSheets();
      try {
        HeaderFooterPreview.renderPaginationOverlay();
      } finally { watch.stop(); }
      const text = document.getElementById('v2-pagination-margins-style').textContent;
      const pads = (text.match(/padding-top:/g) || []).length;
      const clips = (text.match(/clip-path:/g) || []).length;
      const multi = multiRuleWrites(watch.writes);
      // Un calcul refait sur le même document rend exactement la même feuille : aucune réserve d'un calcul précédent ne reste, aucune n'est faussée par l'ordre des écritures.
      return {
        pass: pads === breaks && clips === 1 && text === before && multi <= 1,
        notes: breaks + ' coupures, règles de rembourrage=' + pads + ', règles de rognage=' + clips + ', même feuille que le calcul d\'avant=' + (text === before) + ', écritures à plusieurs règles=' + multi,
      };
    },
  });

  cases.push({
    id: 'pagination_reader_writes_the_whole_sheet_once_per_calculation_not_once_per_page_break',
    description: "La pagination de la Lecture (douze pages et plus) ne réécrit pas non plus sa feuille de style à chaque saut de page : par feuille posée, une seule écriture à plusieurs règles, une réserve par saut, et une seule feuille de pagination restante dans le texte",
    run: async (h) => {
      await setup(h, lines(700));
      const watch = watchPaginationSheets();
      let breaks = 0; let marginRules = 0; let sheets = 0; let multi = 0;
      try {
        await h.renderReaderMode(Editor.getHTML(), Editor.getHeaderFooterData());
        await h.sleep(250);
        const rc = document.getElementById('reader-container');
        breaks = rc.querySelectorAll('.v2-pagination-overlay .v2-page-band').length;
        sheets = rc.querySelectorAll('.reader-content > style.v2-pagination-style').length;
        marginRules = Array.from(rc.querySelectorAll('.reader-content > style.v2-pagination-style')).reduce((sum, el) => sum + (el.textContent.match(/margin-bottom:/g) || []).length, 0);
        multi = multiRuleWrites(watch.writes);
      } finally {
        watch.stop();
        restoreReader();
      }
      if (breaks < 10) return { pass: false, notes: 'document trop court : ' + breaks + ' saut(s) de page seulement' };
      return {
        pass: multi <= 1 && marginRules === breaks && sheets === 1,
        notes: breaks + ' sauts de page, écritures à plusieurs règles par feuille=' + multi + ' (attendu au plus 1), règles de réserve=' + marginRules + ' (attendu ' + breaks + '), feuilles de pagination=' + sheets + ' (attendu 1)',
      };
    },
  });

  // Un document qui mêle titres, paragraphes et listes (leurs marges se fondent entre deux blocs) sur une quinzaine de pages, avec un saut de page posé à la main.
  const mixed = () => Array.from({ length: 360 }, (_, i) => (i % 9 === 0 ? '<h2>Partie ' + (i / 9 + 1) + '</h2>' : '')
    + '<p>Paragraphe ' + (i + 1) + ' : ' + 'du texte pour remplir la ligne et en ouvrir une autre. '.repeat(1 + (i % 3)) + '</p>'
    + (i % 13 === 4 ? '<ul><li><p>Point A</p></li><li><p>Point B</p></li></ul>' : '') + (i === 180 ? '<div class="page-break-marker" contenteditable="false">Saut de page</div>' : '')).join('');
  // Les feuilles <style> posées dans `root` pendant `fn()` (les feuilles posées une à une d'une pagination, EditorCore.createStepSheets) : relevées sans attendre.
  function stylesAddedDuring(root, fn) {
    const observer = new MutationObserver(() => {});
    observer.observe(root, { childList: true, subtree: true });
    let records = [];
    try { fn(); } finally { records = observer.takeRecords(); observer.disconnect(); }
    return records.reduce((sum, r) => sum + Array.from(r.addedNodes).filter(n => n.nodeName === 'STYLE').length, 0);
  }
  // Le bloc que vise la règle de réserve d'une coupure (js/header-footer-preview.js:seamSubject) : le repère d'un saut de page par sa classe, tout autre bloc par `*`.
  const subjectOf = el => (el.classList.contains('page-break-marker') ? '.page-break-marker' : '*');
  // Refait, sur le document tel que la pagination l'a laissé, le calcul d'une coupure après l'autre (js/header-footer-preview.js:placePaginationSeam, sans en-tête ni pied) : la
  // réserve et le haut de chaque couture que ce calcul pose, comparés à ce qui est posé, au chiffre près. Rend les écarts.
  function oneByOneGaps() {
    const tip = document.querySelector('#editor-container .tiptap');
    const container = document.getElementById('editor-container');
    const zoom = EditorCore.layoutZoom(tip);
    const m = PageLayout.getMarginsPx();
    const pageContentHeightPx = Math.max(50, PageLayout.getPageSizePx().height - m.top - m.bottom);
    const children = Array.from(tip.children);
    const tipTop = tip.getBoundingClientRect().top;
    const box = container.getBoundingClientRect();
    const toLayoutY = v => (v - box.top - container.clientTop + container.scrollTop) / zoom;
    const seams = Array.from(container.querySelectorAll('.v2-pagination-overlay > .v2-page-band'));
    const sheet = document.getElementById('v2-pagination-margins-style').textContent;
    const gaps = [];
    const probe = document.createElement('div');
    let bodyTopRel = parseFloat(getComputedStyle(tip).paddingTop) || 0;
    HeaderFooterPreview.pageBreaks().forEach((brk, i) => {
      const afterBottomScreen = brk.afterEl.getBoundingClientRect().bottom;
      const afterBottomRel = (afterBottomScreen - tipTop) / zoom;
      const remaining = Math.max(0, pageContentHeightPx - (afterBottomRel - bodyTopRel));
      const seamHeight = seams[i].getBoundingClientRect().height / zoom;
      const rule = '#editor-container .tiptap > ' + subjectOf(brk.afterEl) + ':nth-child(' + (children.indexOf(brk.afterEl) + 1) + ') { margin-bottom: ' + (seamHeight + remaining) + 'px; }';
      // Le haut relu tel que le navigateur l'écrit (style.top arrondit l'écriture) : le même nombre posé de la même façon.
      probe.style.top = (toLayoutY(afterBottomScreen) + remaining) + 'px';
      if (!sheet.includes(rule) || seams[i].style.top !== probe.style.top) gaps.push({ page: i + 1, rule, top: probe.style.top, posed: seams[i].style.top });
      bodyTopRel = afterBottomRel + remaining + seamHeight;
    });
    return { gaps, breaks: seams.length };
  }

  cases.push({
    id: 'pagination_editor_places_plain_page_breaks_at_once_exactly_where_the_one_by_one_calculation_puts_them',
    description: "Carte « Accélérer » (21/10) : la pagination de l'éditeur pose les coupures simples d'un coup (une feuille posée en route, pas une par coupure, donc pas une mise en page par page), et chaque réserve et chaque couture est exactement celle du calcul une coupure après l'autre, refait sur le document",
    run: async (h) => {
      await setup(h, mixed());
      const added = stylesAddedDuring(document.head, () => HeaderFooterPreview.renderPaginationOverlay());
      const { gaps, breaks } = oneByOneGaps();
      if (breaks < 10) return { pass: false, notes: 'document trop court : ' + breaks + ' saut(s) de page seulement' };
      return {
        pass: added <= 1 && gaps.length === 0,
        notes: breaks + ' coupures, feuilles posées en route=' + added + ' (attendu 1 ; le calcul une à une en pose une par coupure), écarts au calcul une à une=' + gaps.length + (gaps.length ? ' ' + JSON.stringify(gaps.slice(0, 2)) : ''),
      };
    },
  });

  // Une présentation : douze diapositives courtes, chacune finie par son repère de saut de page (`div.page-break-marker`), comme « Présentation commerciale ».
  const deck = n => Array.from({ length: n }, (_, i) => '<p>Diapositive ' + (i + 1) + '</p><p>Un peu de texte pour la remplir.</p>' + (i < n - 1 ? '<div class="page-break-marker" contenteditable="false">Saut de page</div>' : '')).join('');
  cases.push({
    id: 'pagination_editor_seam_rules_name_the_page_break_marker_so_a_sheet_does_not_restyle_every_block',
    description: "Demande du 04/11 (« quand on doit supprimer ou déplacer une diapo il y a un freeze de quelques secondes ») : à chaque pagination, trois feuilles de règles « marge sous le bloc qui finit la page » sont posées ou retirées, et une règle `*:nth-child(N)` peut viser n'importe lequel des blocs : le navigateur refaisait le style de tous les blocs de la présentation (629 à 39 diapositives : 16 ms la feuille de 38 règles, de plus en plus avec sa longueur) ; la règle d'une coupure qui tombe sur le repère d'un saut de page (ce par quoi finit chaque diapositive) vise maintenant `.page-break-marker:nth-child(N)` (4 ms la feuille), toute autre coupure garde `*`. Mêmes blocs visés, mêmes réserves et mêmes coutures au chiffre près que le calcul une coupure après l'autre.",
    run: async (h) => {
      await setup(h, deck(12));
      HeaderFooterPreview.renderPaginationOverlay();
      const tip = document.querySelector('#editor-container .tiptap');
      const sheet = document.getElementById('v2-pagination-margins-style').textContent;
      const children = Array.from(tip.children);
      const onMarker = HeaderFooterPreview.pageBreaks().filter(brk => brk.afterEl.classList.contains('page-break-marker'));
      if (onMarker.length < 8) return { pass: false, notes: 'présentation trop courte : ' + onMarker.length + ' coupure(s) sur un repère seulement' };
      const ruleFor = (brk, subject) => new RegExp('#editor-container \\.tiptap > ' + subject + ':nth-child\\(' + (children.indexOf(brk.afterEl) + 1) + '\\) \\{ margin-bottom: [0-9.]+px; \\}');
      const named = onMarker.filter(brk => ruleFor(brk, '\\.page-break-marker').test(sheet)).length;
      const generic = onMarker.filter(brk => ruleFor(brk, '\\*').test(sheet)).length;
      const { gaps, breaks } = oneByOneGaps();
      return {
        pass: named === onMarker.length && generic === 0 && gaps.length === 0 && breaks >= onMarker.length,
        notes: onMarker.length + ' coupures sur un repère, règles qui nomment `.page-break-marker`=' + named + ' (attendu ' + onMarker.length + '), règles `*:nth-child` sur un repère=' + generic + ' (attendu 0), écarts au calcul une à une=' + gaps.length + (gaps.length ? ' ' + JSON.stringify(gaps.slice(0, 2)) : ''),
      };
    },
  });

  // Un long texte qui mêle des paragraphes et de grands tableaux, chacun coupé entre deux lignes sur deux pages ou plus : des suites de coupures simples entre des coupures dans un tableau.
  const textWithTables = () => {
    const para = i => '<p>Paragraphe ' + i + ' : ' + 'du texte pour remplir la ligne et en ouvrir une autre. '.repeat(1 + (i % 3)) + '</p>';
    const table = n => '<table><tbody>' + Array.from({ length: 60 }, (_, r) => '<tr><td><p>Ligne ' + (n * 100 + r + 1) + ' case 1</p></td><td><p>case 2</p></td></tr>').join('') + '</tbody></table>';
    let html = '';
    for (let block = 0; block < 4; block++) {
      for (let i = 0; i < 70; i++) html += para(block * 100 + i);
      html += table(block);
    }
    for (let i = 0; i < 60; i++) html += para(500 + i);
    return html;
  };
  // Les feuilles <style> posées dans `root` pendant `fn()`, elles-mêmes (leur texte se relit après, une fois retirées).
  function sheetsAddedDuring(root, fn) {
    const observer = new MutationObserver(() => {});
    observer.observe(root, { childList: true, subtree: true });
    let records = [];
    try { fn(); } finally { records = observer.takeRecords(); observer.disconnect(); }
    return records.reduce((all, r) => all.concat(Array.from(r.addedNodes).filter(n => n.nodeName === 'STYLE')), []);
  }
  // Comme oneByOneGaps, pour un texte qui a aussi des coupures dans un tableau : la couture de chaque coupure est au haut que le calcul une à une lui donne (pour un tableau, depuis le bas de
  // la ligne qui précède la coupure : celle dont la suivante porte le rembourrage de la coupure), et la réserve de chaque coupure simple est sa règle. Rend les écarts et le nombre de coupures de chaque genre.
  function oneByOneGapsWithTables() {
    const tip = document.querySelector('#editor-container .tiptap');
    const container = document.getElementById('editor-container');
    const zoom = EditorCore.layoutZoom(tip);
    const m = PageLayout.getMarginsPx();
    const pageContentHeightPx = Math.max(50, PageLayout.getPageSizePx().height - m.top - m.bottom);
    const children = Array.from(tip.children);
    const tipTop = tip.getBoundingClientRect().top;
    const box = container.getBoundingClientRect();
    const toLayoutY = v => (v - box.top - container.clientTop + container.scrollTop) / zoom;
    const seams = Array.from(container.querySelectorAll('.v2-pagination-overlay > .v2-page-band'));
    const sheet = document.getElementById('v2-pagination-margins-style').textContent;
    const gaps = [];
    const probe = document.createElement('div');
    const cutsSeen = new Map();
    let simple = 0; let inner = 0;
    let bodyTopRel = parseFloat(getComputedStyle(tip).paddingTop) || 0;
    HeaderFooterPreview.pageBreaks().forEach((brk, i) => {
      let bottomEl = brk.afterEl;
      if (brk.inner) {
        const rows = TablePageCut.rowsOf(brk.afterEl.querySelector(':scope > table')) || [];
        const opening = rows.filter(row => HeaderFooterPreview.rowPadOf(row) > 0);
        const k = cutsSeen.get(brk.afterEl) || 0;
        cutsSeen.set(brk.afterEl, k + 1);
        bottomEl = rows[rows.indexOf(opening[k]) - 1] || brk.afterEl;
        inner++;
      } else simple++;
      const afterBottomScreen = bottomEl.getBoundingClientRect().bottom;
      const afterBottomRel = (afterBottomScreen - tipTop) / zoom;
      const remaining = Math.max(0, pageContentHeightPx - (afterBottomRel - bodyTopRel));
      const seamHeight = seams[i].getBoundingClientRect().height / zoom;
      const rule = '#editor-container .tiptap > ' + subjectOf(brk.afterEl) + ':nth-child(' + (children.indexOf(brk.afterEl) + 1) + ') { margin-bottom: ' + (seamHeight + remaining) + 'px; }';
      probe.style.top = (toLayoutY(afterBottomScreen) + remaining) + 'px';
      if ((!brk.inner && !sheet.includes(rule)) || seams[i].style.top !== probe.style.top) gaps.push({ page: i + 1, inner: !!brk.inner, rule: brk.inner ? undefined : rule, top: probe.style.top, posed: seams[i].style.top });
      bodyTopRel = afterBottomRel + remaining + seamHeight;
    });
    return { gaps, breaks: seams.length, simple, inner };
  }

  cases.push({
    id: 'pagination_editor_places_every_run_of_plain_page_breaks_at_once_even_after_a_table_cut',
    description: "Un long texte qui coupe un tableau toutes les quelques pages : les coupures simples d'entre deux tableaux se posent elles aussi d'un coup (la première coupure dans un tableau renvoyait toutes les suivantes au calcul une à une, une mise en page par page : 0,5 s à 117 pages, à chaque pause de frappe), et chaque couture est exactement à la place du calcul une coupure après l'autre",
    run: async (h) => {
      await setup(h, textWithTables());
      const sheets = sheetsAddedDuring(document.head, () => HeaderFooterPreview.renderPaginationOverlay());
      const { gaps, breaks, simple, inner } = oneByOneGapsWithTables();
      if (simple < 10 || inner < 3) return { pass: false, notes: 'document sans assez de coupures de chaque genre : ' + simple + ' simples, ' + inner + ' dans un tableau (' + breaks + ' en tout)' };
      // Une coupure simple posée seule a sa propre feuille d'une seule règle (placeReserve) ; une suite posée d'un coup, une feuille de toutes ses règles.
      const alone = sheets.filter(el => rulesIn(el.textContent) === 1 && /margin-bottom:/.test(el.textContent) && !/padding-top|clip-path/.test(el.textContent)).length;
      return {
        pass: alone <= 2 && gaps.length === 0,
        notes: breaks + ' coupures (' + simple + ' simples, ' + inner + ' dans un tableau), feuilles de coupure simple posée seule=' + alone + ' (attendu au plus 2 ; le calcul une à une en pose une par coupure d\'après le premier tableau coupé), écarts au calcul une à une=' + gaps.length + (gaps.length ? ' ' + JSON.stringify(gaps.slice(0, 2)) : ''),
      };
    },
  });

  cases.push({
    id: 'pagination_reader_places_plain_page_breaks_at_once',
    description: "Carte « Accélérer » (21/10) : la Lecture pose elle aussi les coupures simples d'un coup : aucune feuille posée en route pour une seule règle (le calcul une à une en pose une par coupure, à chaque calcul), et la même réserve par saut",
    run: async (h) => {
      await setup(h, mixed());
      const watch = watchPaginationSheets();
      let breaks = 0; let marginRules = 0; let oneByOne = 0;
      try {
        await h.renderReaderMode(Editor.getHTML(), Editor.getHeaderFooterData());
        await h.sleep(250);
        const rc = document.getElementById('reader-container');
        breaks = rc.querySelectorAll('.v2-pagination-overlay .v2-page-band').length;
        marginRules = Array.from(rc.querySelectorAll('.reader-content > style.v2-pagination-style')).reduce((sum, el) => sum + (el.textContent.match(/margin-bottom:/g) || []).length, 0);
        // Une feuille dont toutes les écritures portent une seule règle : celle d'une coupure posée seule (EditorCore.createStepSheets.add).
        const perSheet = new Map();
        watch.writes.forEach(w => perSheet.set(w.el, (perSheet.get(w.el) || true) && rulesIn(w.value) === 1));
        oneByOne = Array.from(perSheet.values()).filter(Boolean).length;
      } finally {
        watch.stop();
        restoreReader();
      }
      if (breaks < 10) return { pass: false, notes: 'document trop court : ' + breaks + ' saut(s) de page seulement' };
      return {
        pass: oneByOne === 0 && marginRules === breaks,
        notes: breaks + ' coupures, feuilles posées pour une seule coupure=' + oneByOne + ' (attendu 0 ; avant, une par coupure et par calcul), règles de réserve=' + marginRules + ' (attendu ' + breaks + ')',
      };
    },
  });

  cases.push({
    id: 'pagination_reader_places_every_run_of_plain_page_breaks_at_once_even_after_a_table_cut',
    description: "La Lecture d'un long texte qui coupe un tableau toutes les quelques pages pose, comme l'éditeur, chaque suite de coupures simples d'un coup (la première coupure dans un tableau renvoyait toutes les suivantes au calcul une à une, une mise en page par coupure, à chaque entrée en Lecture) : au plus deux feuilles posées pour une seule coupure simple, une réserve par coupure simple et une seule, et des coupures dans un tableau comme avant",
    run: async (h) => {
      await setup(h, textWithTables());
      const watch = watchPaginationSheets();
      let seams = 0; let inner = 0; let reserves = 0; let alone = 0;
      try {
        await h.renderReaderMode(Editor.getHTML(), Editor.getHeaderFooterData());
        await h.sleep(250);
        const rc = document.getElementById('reader-container');
        const bands = Array.from(rc.querySelectorAll('.v2-pagination-overlay .v2-page-band'));
        seams = bands.length;
        // Une coupure dans un tableau porte le chapeau qui coiffe la ligne coupée (`v2-page-seam-cap`).
        inner = bands.filter(band => band.querySelector('.v2-page-seam-cap')).length;
        reserves = Array.from(rc.querySelectorAll('.reader-content > style.v2-pagination-style')).reduce((sum, el) => sum + (el.textContent.match(/margin-bottom:/g) || []).length, 0);
        // Une coupure simple posée seule a sa propre feuille d'une seule règle de réserve (EditorCore.createStepSheets.add) ; une suite posée d'un coup, une feuille de toutes ses règles.
        const perSheet = new Map();
        watch.writes.forEach(w => {
          const sheet = perSheet.get(w.el) || { single: true, reserve: false };
          sheet.single = sheet.single && rulesIn(w.value) === 1;
          sheet.reserve = sheet.reserve || (/margin-bottom:/.test(w.value) && !/padding-top|clip-path/.test(w.value));
          perSheet.set(w.el, sheet);
        });
        alone = Array.from(perSheet.values()).filter(sheet => sheet.single && sheet.reserve).length;
      } finally {
        watch.stop();
        restoreReader();
      }
      const simple = seams - inner;
      if (simple < 10 || inner < 3) return { pass: false, notes: 'document sans assez de coupures de chaque genre : ' + simple + ' simples, ' + inner + ' dans un tableau (' + seams + ' en tout)' };
      return {
        pass: alone <= 2 && reserves === simple,
        notes: seams + ' coupures (' + simple + ' simples, ' + inner + ' dans un tableau), feuilles de coupure simple posée seule=' + alone + ' (attendu au plus 2 ; le calcul une à une en pose une par coupure d\'après le premier tableau coupé), règles de réserve=' + reserves + ' (attendu ' + simple + ')',
      };
    },
  });

  cases.push({
    id: 'pagination_reader_footer_page_numbers_follow_the_seams_of_a_batch_resumed_after_a_table_cut',
    description: "Le numéro de page du pied d'une couture est le rang de sa coupure, même pour les coupures d'un lot repris après un tableau coupé : le lot reprend à la coupure `start`, ses numéros ne repartent pas de 1",
    run: async (h) => {
      await setup(h, textWithTables());
      const badge = '<span class="page-number-badge" contenteditable="false" data-format="n">#</span>';
      Editor.setHeaderFooterData({ enabled: true, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '<p>— ' + badge + ' —</p>', first: '' } });
      let numbers = []; let inner = 0;
      try {
        await h.renderReaderMode(Editor.getHTML(), Editor.getHeaderFooterData());
        await h.sleep(250);
        const bands = Array.from(document.querySelectorAll('#reader-container .v2-pagination-overlay .v2-page-band'));
        numbers = bands.map(band => { const m = (band.textContent || '').match(/—\s*(\d+)\s*—/); return m ? Number(m[1]) : null; });
        inner = bands.filter(band => band.querySelector('.v2-page-seam-cap')).length;
      } finally {
        restoreReader();
      }
      if (numbers.length < 10 || inner < 3) return { pass: false, notes: 'document sans assez de coupures : ' + numbers.length + ' en tout, ' + inner + ' dans un tableau' };
      const expected = numbers.map((_, i) => i + 1);
      return {
        pass: JSON.stringify(numbers) === JSON.stringify(expected),
        notes: numbers.length + ' coupures (' + inner + ' dans un tableau), numéros du pied=' + numbers.join(',') + ' (attendu 1 à ' + numbers.length + ' dans l\'ordre)',
      };
    },
  });

  // Le réglage de numérotation des titres (`heading-numbering-config`, que porte tout document aux titres numérotés ou au style de titres, la présentation « Présentation commerciale » comprise) : un
  // bloc de premier niveau que le style cache (`display: none`), qui n'a aucune place et dont le rectangle est nul à l'origine de l'ÉCRAN. Demande d'Antoine du 03/11 (« slides+ est assez laggy »).
  const HIDDEN_CONFIG = '<div class="heading-numbering-config" data-style="numeric"></div>';
  const numbersOf = text => (String(text).match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  const sameNumbers = (a, b, tol) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= tol);
  // La pagination de l'éditeur telle qu'elle est posée : nombre de coupures, réserves (les nombres seuls : les rangs `nth-child` suivent le bloc caché), haut du corps des pages, hauteur du document.
  function editorPagination() {
    const sheet = document.getElementById('v2-pagination-margins-style').textContent;
    return {
      breaks: HeaderFooterPreview.pageBreaks().length,
      margins: numbersOf((sheet.match(/margin-bottom: [0-9.]+px/g) || []).join(' ')),
      tops: (HeaderFooterPreview.pageBodyTops() || []).map(v => Math.round(v * 100) / 100),
      height: document.getElementById('editor-container').scrollHeight,
    };
  }

  cases.push({
    id: 'pagination_editor_ignores_a_hidden_block_wherever_the_container_is_scrolled',
    description: "Un bloc non rendu (le réglage de numérotation des titres, display: none) ne compte pas dans la pagination de l'éditeur : mêmes coupures, mêmes réserves, même haut de page et même hauteur de document à n'importe quel défilement du conteneur, d'un calcul au suivant, et ceux du même texte sans ce bloc. Avant : un calcul fait plus bas que le haut du document ouvrait un blanc de plusieurs pages (le bloc caché était pris pour un bloc dont l'écart avec le précédent grandit avec le défilement), le document s'allongeait à chaque pause de frappe et la vue sautait",
    run: async (h) => {
      await setup(h, HIDDEN_CONFIG + lines(500));
      const container = document.getElementById('editor-container');
      const config = document.querySelector('#editor-container .tiptap > .heading-numbering-config');
      if (!config || getComputedStyle(config).display !== 'none') return { pass: false, notes: 'le bloc caché est absent ou visible : ' + (config ? getComputedStyle(config).display : 'absent') };
      const lower = Math.min(1500, Math.floor((container.scrollHeight - container.clientHeight) / 2));
      if (lower < 300) return { pass: false, notes: 'conteneur trop peu défilable : ' + (container.scrollHeight - container.clientHeight) + ' px' };
      container.scrollTop = 0;
      HeaderFooterPreview.renderPaginationOverlay();
      const atTop = editorPagination();
      container.scrollTop = lower;
      const reached = container.scrollTop;
      HeaderFooterPreview.renderPaginationOverlay();
      const scrolled = editorPagination();
      HeaderFooterPreview.renderPaginationOverlay();
      const again = editorPagination();
      await setup(h, lines(500));
      HeaderFooterPreview.renderPaginationOverlay();
      const without = editorPagination();
      if (atTop.breaks < 8) return { pass: false, notes: 'document trop court : ' + atTop.breaks + ' coupure(s) seulement' };
      const same = (a, b) => a.breaks === b.breaks && sameNumbers(a.margins, b.margins, 0.01) && sameNumbers(a.tops, b.tops, 0.01) && Math.abs(a.height - b.height) <= 1;
      return {
        pass: Math.abs(reached - lower) <= 1 && same(scrolled, atTop) && same(again, scrolled) && without.breaks === atTop.breaks && sameNumbers(without.tops, atTop.tops, 0.01) && Math.abs(without.height - atTop.height) <= 1,
        notes: 'en haut : ' + atTop.breaks + ' coupures, page 2 à ' + atTop.tops[1] + ', hauteur ' + atTop.height + ' ; défilé à ' + reached + ' : ' + scrolled.breaks + ' coupures, page 2 à ' + scrolled.tops[1] + ', hauteur ' + scrolled.height
          + ' (attendu les mêmes) ; recalcul au même défilement : hauteur ' + again.height + ' ; sans le bloc caché : ' + without.breaks + ' coupures, page 2 à ' + without.tops[1] + ', hauteur ' + without.height,
      };
    },
  });

  cases.push({
    id: 'pagination_editor_zone_after_a_hidden_block_opens_the_same_pages_as_without_it',
    description: "Une zone à deux colonnes juste après le bloc caché se coupe où elle se couperait sans lui : l'écart avec ce qui la précède se mesure sur le bloc d'avant qui a une place, jamais sur le bloc caché (rectangle nul à l'origine de l'écran)",
    run: async (h) => {
      const zone = '<div class="two-columns-zone" style="--layout-left: 50%"><div class="two-columns-column">' + lines(70) + '</div><div class="two-columns-column">' + lines(40) + '</div></div>';
      const body = zone + lines(320);
      await setup(h, HIDDEN_CONFIG + body);
      const config = document.querySelector('#editor-container .tiptap > .heading-numbering-config');
      if (!config || getComputedStyle(config).display !== 'none') return { pass: false, notes: 'le bloc caché est absent ou visible : ' + (config ? getComputedStyle(config).display : 'absent') };
      document.getElementById('editor-container').scrollTop = 0;
      HeaderFooterPreview.renderPaginationOverlay();
      const withConfig = editorPagination();
      await setup(h, body);
      HeaderFooterPreview.renderPaginationOverlay();
      const without = editorPagination();
      if (without.breaks < 4) return { pass: false, notes: 'document trop court : ' + without.breaks + ' coupure(s) seulement' };
      return {
        pass: withConfig.breaks === without.breaks && sameNumbers(withConfig.tops, without.tops, 0.01) && Math.abs(withConfig.height - without.height) <= 1,
        notes: 'avec le bloc caché : ' + withConfig.breaks + ' coupures, page 2 à ' + withConfig.tops[1] + ', hauteur ' + withConfig.height + ' ; sans : ' + without.breaks + ' coupures, page 2 à ' + without.tops[1] + ', hauteur ' + without.height,
      };
    },
  });

  cases.push({
    id: 'pagination_reader_ignores_a_hidden_block_wherever_the_reader_is_scrolled',
    description: "La Lecture compte de même un bloc non rendu pour rien : mêmes coupures et même hauteur de feuille quand elle est mesurée de nouveau avec le conteneur défilé (un autre enregistrement ouvert pendant la lecture, une image ou une police qui change de taille). Avant : un blanc de plusieurs pages s'ouvrait en haut de la feuille",
    run: async (h) => {
      await setup(h, HIDDEN_CONFIG + lines(500));
      const html = Editor.getHTML();
      const hf = Editor.getHeaderFooterData();
      const read = () => {
        const rc = document.getElementById('reader-container');
        return { breaks: rc.querySelectorAll('.v2-pagination-overlay .v2-page-band').length, height: rc.scrollHeight };
      };
      try {
        await h.renderReaderMode(html, hf);
        await h.sleep(250);
        const rc = document.getElementById('reader-container');
        const config = rc.querySelector('.reader-content > .heading-numbering-config');
        if (!config || getComputedStyle(config).display !== 'none') return { pass: false, notes: 'le bloc caché est absent ou visible dans la Lecture : ' + (config ? getComputedStyle(config).display : 'absent') };
        const atTop = read();
        const lower = Math.min(1500, Math.floor((rc.scrollHeight - rc.clientHeight) / 2));
        if (lower < 300 || atTop.breaks < 8) return { pass: false, notes: 'Lecture trop courte ou peu défilable : ' + atTop.breaks + ' coupures, ' + (rc.scrollHeight - rc.clientHeight) + ' px défilables' };
        rc.scrollTop = lower;
        const reached = rc.scrollTop;
        await h.renderReaderMode(html, hf);
        await h.sleep(250);
        const scrolled = read();
        return {
          pass: Math.abs(reached - lower) <= 1 && scrolled.breaks === atTop.breaks && Math.abs(scrolled.height - atTop.height) <= 1,
          notes: 'en haut : ' + atTop.breaks + ' coupures, hauteur ' + atTop.height + ' ; mesurée avec le conteneur à ' + reached + ' (demandé ' + lower + ') : ' + scrolled.breaks + ' coupures, hauteur ' + scrolled.height + ' (attendu les mêmes)',
        };
      } finally { restoreReader(); }
    },
  });

  // Les réserves de bas de page de la Lecture (les `margin-bottom` des feuilles de pagination, `.reader-content > style.v2-pagination-style`) : leurs nombres seuls, dans l'ordre du document.
  const readerReserves = () => numbersOf(Array.from(document.querySelectorAll('#reader-container .reader-content > style.v2-pagination-style')).map(s => (s.textContent.match(/margin-bottom: [0-9.]+px/g) || []).join(' ')).join(' '));

  cases.push({
    id: 'pagination_reader_measures_the_same_reserves_wherever_the_reader_is_scrolled',
    description: "La Lecture qui se mesure de nouveau alors qu'on lit plus bas dans le document, d'elle-même (une police qui arrive, une image qui change de taille : watchGeometry) ou par un rendu complet (un autre enregistrement), pose les mêmes réserves de bas de page qu'au haut et garde son défilement : le navigateur ne décale plus le défilement entre deux lectures de rectangles du calcul (l'ancrage de défilement est suspendu pendant la mise en page, puis rendu). Avant : une réserve plus grande d'une centaine de pixels (un blanc de trois centimètres à un saut de page), et le rendu complet faisait sauter la vue de la même hauteur",
    run: async (h) => {
      await setup(h, HIDDEN_CONFIG + lines(500));
      const html = Editor.getHTML();
      const hf = Editor.getHeaderFooterData();
      const gapsOf = (reserves, base) => reserves.map((v, i) => Math.round((v - base[i]) * 100) / 100).filter(d => d !== 0);
      try {
        const rc = document.getElementById('reader-container');
        // La mesure de départ se fait en haut : un défilement laissé par un autre essai fausserait déjà celle-ci.
        rc.scrollTop = 0;
        await h.renderReaderMode(html, hf);
        await h.sleep(250);
        const atTop = readerReserves();
        const lower = Math.min(1500, Math.floor((rc.scrollHeight - rc.clientHeight) / 2));
        if (lower < 300 || atTop.length < 8) return { pass: false, notes: 'Lecture trop courte ou peu défilable : ' + atTop.length + ' réserves, ' + (rc.scrollHeight - rc.clientHeight) + ' px défilables' };
        rc.scrollTop = lower;
        // Le temps d'une image à l'écran : le navigateur retient alors le bloc qu'on lit pour ancre.
        await h.sleep(150);
        const reached = rc.scrollTop;
        // Une police qui finit de charger : la Lecture refait sa mise en page à sa place (watchGeometry) et rend le défilement qu'elle avait.
        document.fonts.dispatchEvent(new Event('loadingdone'));
        await h.sleep(400);
        const refit = readerReserves();
        const refitScroll = rc.scrollTop;
        // Un rendu complet, la Lecture défilée (un autre enregistrement) : la vue reste où elle était.
        await h.renderReaderMode(html, hf);
        await h.sleep(250);
        const rendered = readerReserves();
        const renderedScroll = rc.scrollTop;
        const refitGaps = gapsOf(refit, atTop);
        const renderedGaps = gapsOf(rendered, atTop);
        // L'ancrage est rendu après le calcul : la Lecture le garde le reste du temps.
        const anchoring = getComputedStyle(rc).overflowAnchor;
        return {
          pass: Math.abs(reached - lower) <= 1 && sameNumbers(refit, atTop, 0.01) && Math.abs(refitScroll - reached) <= 1 && sameNumbers(rendered, atTop, 0.01) && Math.abs(renderedScroll - reached) <= 1 && anchoring === 'auto',
          notes: atTop.length + ' réserves en haut ; défilé à ' + reached + ' (demandé ' + lower + ') ; mesurée de nouveau par la police : ' + refit.length + ' réserves, écarts ' + (refitGaps.length ? JSON.stringify(refitGaps) : 'aucun') + ', défilement ' + Math.round(refitScroll)
            + ' ; par un rendu complet : ' + rendered.length + ' réserves, écarts ' + (renderedGaps.length ? JSON.stringify(renderedGaps) : 'aucun') + ', défilement ' + Math.round(renderedScroll) + ' (attendu aucun écart, défilement ' + Math.round(reached) + ') ; ancrage après le calcul : ' + anchoring + ' (attendu auto)',
        };
      } finally { restoreReader(); }
    },
  });

  // Les cadres libres d'une présentation (`FreeFrame`, js/free-frame.js) : chacun est une ancre de hauteur nulle (css/free-frame.css) que la pagination ne compte pas, et ce qu'il porte (son texte, ses
  // mesures, son aspect) ne change la place d'aucune page. Demande d'Antoine du 03/11 (« slides+ est assez laggy ») : une frappe, un déplacement ou un réglage qui ne touche qu'un cadre refaisait pourtant
  // toute la pagination à la pause qui suit (0,12 s dans « Présentation commerciale »), pour retrouver au chiffre près la même.
  const frameHtml = (x, inner) => FreeFrame.html({ x, y: 80, w: 240, h: 120 }, inner);
  const topBlocks = () => { const out = []; EditorCore.getEditor().state.doc.forEach((node, pos) => out.push({ node, pos })); return out; };
  const frameStarting = text => topBlocks().find(({ node }) => node.type.name === 'freeFrame' && node.textContent.startsWith(text));
  const marginSheet = () => document.getElementById('v2-pagination-margins-style').textContent;
  // Les paginations que posent `act`, puis la pause que le calcul attend (200 ms après la dernière transaction) et de quoi le laisser finir.
  async function paginationsAfter(h, act) {
    let count = 0;
    const stop = HeaderFooterPreview.onPaginated(() => { count++; });
    try { act(); await h.sleep(450); } finally { stop(); }
    return count;
  }

  cases.push({
    id: 'pagination_editor_is_not_recalculated_after_an_edit_that_only_touches_free_frames',
    description: "Une frappe dans un cadre libre, son déplacement, son agrandissement (ce que les gestes écrivent) et un Annuler ne refont pas la pagination de l'éditeur : un cadre est une ancre de hauteur nulle, rien de ce qu'il porte ne change la place d'une page, et le calcul retrouvait au chiffre près la même. Mêmes règles de marge, mêmes coupures, même haut de page et même hauteur de document qu'un calcul neuf ; une frappe dans le texte, elle, refait la pagination (le nombre de pages suit). Avant : un calcul de 0,12 s à chaque pause, dans « Présentation commerciale »",
    run: async (h) => {
      await setup(h, frameHtml(100, '<p>Texte A</p>') + frameHtml(400, '<p>Texte B</p>') + lines(500));
      const editor = EditorCore.getEditor();
      HeaderFooterPreview.renderPaginationOverlay();
      await h.sleep(100);
      const start = editorPagination();
      const startRules = marginSheet();
      if (start.breaks < 8) return { pass: false, notes: 'document trop court : ' + start.breaks + ' coupure(s) seulement' };
      if (!frameStarting('Texte A') || !frameStarting('Texte B')) return { pass: false, notes: 'les deux cadres ne sont pas dans le texte : ' + topBlocks().slice(0, 4).map(b => b.node.type.name).join(',') };
      const steps = {};
      const patchFrame = (text, change) => { const { node, pos } = frameStarting(text); editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, Object.assign({}, node.attrs, change(node.attrs)))); };
      const typeInFrame = (text, typed) => { const { pos } = frameStarting(text); editor.view.dispatch(editor.state.tr.insertText(typed, pos + 2)); };
      steps.typed = await paginationsAfter(h, () => typeInFrame('Texte A', 'abc'));
      const typedIn = !!frameStarting('abcTexte A');
      steps.typedAgain = await paginationsAfter(h, () => typeInFrame('abcTexte A', 'def'));
      steps.moved = await paginationsAfter(h, () => patchFrame('defabcTexte A', a => ({ x: a.x + 30, y: a.y + 12 })));
      steps.resized = await paginationsAfter(h, () => patchFrame('defabcTexte A', a => ({ w: a.w + 40, h: a.h + 20 })));
      const docBeforeUndo = editor.state.doc;
      steps.undone = await paginationsAfter(h, () => { editor.commands.undo(); });
      const undone = editor.state.doc !== docBeforeUndo;
      const kept = editorPagination();
      const keptRules = marginSheet();
      HeaderFooterPreview.renderPaginationOverlay();
      await h.sleep(100);
      const fresh = editorPagination();
      const freshRules = marginSheet();
      const same = (a, b) => a.breaks === b.breaks && sameNumbers(a.margins, b.margins, 0.01) && sameNumbers(a.tops, b.tops, 0.01) && Math.abs(a.height - b.height) <= 1;
      // Une frappe dans le texte : la pagination se refait, et suit le texte qui s'allonge de quelques pages.
      steps.text = await paginationsAfter(h, () => editor.commands.insertContentAt(editor.state.doc.content.size, lines(120)));
      const longer = HeaderFooterPreview.pageBreaks().length;
      const counts = JSON.stringify(steps);
      return {
        pass: typedIn && undone && steps.typed === 0 && steps.typedAgain === 0 && steps.moved === 0 && steps.resized === 0 && steps.undone === 0 && same(kept, start) && same(fresh, kept) && keptRules === startRules && freshRules === startRules
          && steps.text >= 1 && longer > start.breaks,
        notes: 'paginations après chaque geste ' + counts + ' (attendu 0 pour les cinq premiers, au moins 1 pour le texte) ; frappe prise par le cadre=' + typedIn + ', Annuler a défait=' + undone + ' ; pagination en place : ' + kept.breaks + ' coupures, page 2 à ' + kept.tops[1] + ', hauteur ' + kept.height
          + ' (au départ ' + start.breaks + ', ' + start.tops[1] + ', ' + start.height + ' ; calcul neuf ' + fresh.breaks + ', ' + fresh.tops[1] + ', ' + fresh.height + ') ; règles de marge identiques=' + (keptRules === startRules && freshRules === startRules) + ' ; coupures après 120 lignes de plus : ' + longer + ' (attendu plus de ' + start.breaks + ')',
      };
    },
  });

  cases.push({
    id: 'pagination_editor_is_recalculated_when_a_frame_comes_goes_or_carries_a_layered_image',
    description: "Garde-fous du cas précédent (ils passent aussi sur l'ancien code) : un cadre posé ou retiré du texte décale le rang de tous les blocs d'après (les règles de marge visent des rangs, `:nth-child`), un cadre qui porte une image en calque « Sur toutes les pages » est déplacé avec ses copies que la pagination peint : la pagination se refait dans ces trois cas, et la feuille de marges posée est celle d'un calcul neuf.",
    run: async (h) => {
      const layered = '<p><img class="editor-image" src="' + PNG + '" alt="" style="width: 60px; height: 60px; position: absolute; left: 20px; top: 20px; z-index: -1;" data-layer="behind" data-wrap="inline" data-page-index="0" data-page-left-pt="40" data-page-top-pt="40" data-repeat="true"></p>';
      await setup(h, frameHtml(100, '<p>Texte A</p>') + frameHtml(400, layered) + lines(300));
      const editor = EditorCore.getEditor();
      HeaderFooterPreview.renderPaginationOverlay();
      await h.sleep(100);
      const carrier = () => topBlocks().find(({ node }) => { let found = false; node.descendants(child => { if (child.type.name === 'editorImage' && child.attrs.layer === 'behind' && child.attrs.repeat) found = true; return !found; }); return node.type.name === 'freeFrame' && found; });
      if (!carrier()) return { pass: false, notes: "le cadre qui porte l'image en calque répétée n'est pas dans le texte : " + topBlocks().slice(0, 4).map(b => b.node.type.name).join(',') };
      const results = {};
      // Le décompte, puis la feuille de marges telle qu'elle est posée contre celle d'un calcul neuf.
      const measure = async (name, act) => {
        const before = marginSheet();
        const passes = await paginationsAfter(h, act);
        const placed = marginSheet();
        HeaderFooterPreview.renderPaginationOverlay();
        await h.sleep(100);
        results[name] = { passes, shifted: before !== placed, fresh: placed === marginSheet() };
      };
      const frameJson = text => ({ type: 'freeFrame', attrs: { x: 10, y: 10, w: 100, h: 50 }, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
      await measure('inserted', () => editor.view.dispatch(editor.state.tr.insert(0, editor.schema.nodeFromJSON(frameJson('Neuf')))));
      await measure('removed', () => { const { node, pos } = frameStarting('Neuf'); editor.view.dispatch(editor.state.tr.delete(pos, pos + node.nodeSize)); });
      await measure('layeredMoved', () => { const { node, pos } = carrier(); editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, Object.assign({}, node.attrs, { x: node.attrs.x + 30 }))); });
      return {
        pass: results.inserted.passes >= 1 && results.inserted.shifted && results.inserted.fresh && results.removed.passes >= 1 && results.removed.shifted && results.removed.fresh && results.layeredMoved.passes >= 1 && results.layeredMoved.fresh,
        notes: 'paginations et feuille de marges : ' + JSON.stringify(results) + ' (attendu au moins 1 calcul chaque fois, règles décalées par la pose et le retrait, feuille identique à un calcul neuf)',
      };
    },
  });

  cases.push({
    id: 'pagination_editor_holds_only_while_the_text_is_the_one_it_paginated',
    description: "HeaderFooterPreview.paginationHolds dit si la dernière pagination vaut encore pour le texte : vrai une fois le calcul fait, vrai encore après un changement de cadre seul, faux dès qu'un bloc du texte change (avant même le calcul que la frappe attend), faux tant qu'un calcul attend sa minuterie et sans aperçu de la page, de nouveau vrai quand le calcul est refait. Avant : la fonction n'existait pas, chaque transaction faisait refaire la pagination",
    run: async (h) => {
      await setup(h, frameHtml(100, '<p>Texte A</p>') + lines(120));
      const editor = EditorCore.getEditor();
      HeaderFooterPreview.renderPaginationOverlay();
      await h.sleep(100);
      const holds = () => HeaderFooterPreview.paginationHolds();
      const seen = { settled: holds() };
      const { pos: framePos } = frameStarting('Texte A');
      editor.view.dispatch(editor.state.tr.insertText('abc', framePos + 2));
      seen.afterFrameEdit = holds();
      let paragraphPos = null;
      editor.state.doc.forEach((node, pos) => { if (paragraphPos === null && node.type.name === 'paragraph') paragraphPos = pos; });
      editor.view.dispatch(editor.state.tr.insertText('xyz', paragraphPos + 1));
      seen.afterTextEdit = holds();
      HeaderFooterPreview.schedulePaginationRecompute();
      seen.whileTimerPending = holds();
      await h.sleep(450);
      seen.afterRecalculation = holds();
      h.setA4Preview(false);
      HeaderFooterPreview.renderPaginationOverlay();
      seen.withoutPreview = holds();
      h.setA4Preview(true);
      HeaderFooterPreview.renderPaginationOverlay();
      await h.sleep(100);
      seen.previewBack = holds();
      const want = { settled: true, afterFrameEdit: true, afterTextEdit: false, whileTimerPending: false, afterRecalculation: true, withoutPreview: false, previewBack: true };
      return { pass: Object.keys(want).every(k => seen[k] === want[k]), notes: 'paginationHolds : ' + JSON.stringify(seen) + ' (attendu ' + JSON.stringify(want) + ')' };
    },
  });

  // Les paginations posées pendant un affichage : chaque calcul commence par vider la feuille des marges (une écriture de texte vide).
  async function paginationsDuring(h, html) {
    await setup(h, lines(30));
    const watch = watchPaginationSheets();
    try {
      Editor.setHTML(html);
    } finally { watch.stop(); }
    return watch.writes.filter(w => w.id === 'v2-pagination-margins-style' && w.value === '').length;
  }

  cases.push({
    id: 'set_html_paginates_once_when_no_image_needs_a_new_page_grid',
    description: "Afficher un modèle sans image en calque pagine une seule fois : la deuxième pagination, celle de l'ajustement des images, refaisait exactement la même sur un document inchangé",
    run: async (h) => {
      const count = await paginationsDuring(h, lines(300));
      return { pass: count === 1, notes: 'paginations pendant setHTML=' + count + ' (attendu 1)' };
    },
  });

  cases.push({
    id: 'set_html_paginates_again_when_a_legacy_layered_image_gets_its_page_grid',
    description: "Un ancien modèle dont une image en calque n'a pas de grille de page : elle la reçoit à l'affichage (la grille s'écrit dans le HTML) et la page est reposée après, comme avant",
    run: async (h) => {
      const image = '<p><img class="editor-image" src="' + PNG + '" alt="" style="width: 80px; height: 80px; position: absolute; left: 120px; top: 90px; z-index: -1;" data-layer="behind" data-wrap="inline"></p>';
      const count = await paginationsDuring(h, image + lines(60));
      const html = Editor.getHTML();
      const gridWritten = /data-page-index="0"/.test(html);
      return { pass: count >= 2 && gridWritten, notes: 'paginations pendant setHTML=' + count + ' (attendu 2 ou plus), grille de page écrite=' + gridWritten };
    },
  });

  // Les recherches des <col> d'un tableau pendant la lecture d'un HTML.
  function watchColLookups() {
    const original = Element.prototype.querySelectorAll;
    const state = { calls: 0, stop: () => { Element.prototype.querySelectorAll = original; } };
    Element.prototype.querySelectorAll = function (selector) {
      if (selector === 'colgroup > col') state.calls++;
      return original.apply(this, arguments);
    };
    return state;
  }
  const table = (widths, rows) => '<table><colgroup>' + widths.map(w => '<col width="' + w + '">').join('') + '</colgroup><tbody>'
    + Array.from({ length: rows }, (_, r) => '<tr>' + widths.map((_, c) => '<td><p>L' + (r + 1) + 'C' + (c + 1) + '</p></td>').join('') + '</tr>').join('') + '</tbody></table>';
  const widthsOfRow = (doc, tableRank, rowIndex) => {
    let found = null; let rank = -1;
    doc.descendants(node => {
      if (node.type.name === 'table') { rank++; if (rank === tableRank) { const cells = []; node.child(rowIndex).forEach(cell => cells.push(cell.attrs.colwidth)); found = cells; } return false; }
      return true;
    });
    return found;
  };

  cases.push({
    id: 'table_column_widths_are_looked_up_once_per_table_not_once_per_cell',
    description: "Lire un HTML dont les cases n'ont pas d'attribut colwidth cherche les <col> du tableau une fois par tableau (avant : une fois par case, un parcours du tableau entier chaque fois), et chaque case garde la largeur de sa colonne",
    run: async (h) => {
      await h.resetEditor();
      const html = table([120, 80, 60], 150) + '<p>Entre deux tableaux</p>' + table([50, 70, 90], 150) + '<p>Fin</p>';
      const watch = watchColLookups();
      try {
        Editor.setHTML(html);
      } finally { watch.stop(); }
      await h.sleep(150);
      const doc = EditorCore.getEditor().state.doc;
      const first = widthsOfRow(doc, 0, 0); const firstLast = widthsOfRow(doc, 0, 149);
      const second = widthsOfRow(doc, 1, 0); const secondLast = widthsOfRow(doc, 1, 149);
      const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      const ok = same(first, [[120], [80], [60]]) && same(firstLast, [[120], [80], [60]]) && same(second, [[50], [70], [90]]) && same(secondLast, [[50], [70], [90]]);
      return {
        pass: watch.calls <= 4 && ok,
        notes: 'recherches des <col>=' + watch.calls + ' pour 2 tableaux de 450 cases (attendu au plus 4), largeurs ligne 1 du premier=' + JSON.stringify(first) + ', dernière ligne=' + JSON.stringify(firstLast)
          + ', second tableau=' + JSON.stringify(second) + ', dernière ligne=' + JSON.stringify(secondLast),
      };
    },
  });

  cases.push({
    id: 'table_without_colgroup_keeps_automatic_columns',
    description: "Un tableau sans <colgroup> et sans colwidth garde ses colonnes automatiques (aucune largeur inventée), un tableau lu juste après un autre ne reprend pas les colonnes du précédent",
    run: async (h) => {
      await h.resetEditor();
      const plain = '<table><tbody>' + Array.from({ length: 30 }, (_, r) => '<tr><td><p>a' + r + '</p></td><td><p>b' + r + '</p></td></tr>').join('') + '</tbody></table>';
      Editor.setHTML(table([111, 222], 30) + '<p>x</p>' + plain);
      await h.sleep(150);
      const doc = EditorCore.getEditor().state.doc;
      const withGroup = widthsOfRow(doc, 0, 3);
      const without = widthsOfRow(doc, 1, 3);
      const ok = JSON.stringify(withGroup) === JSON.stringify([[111], [222]]) && JSON.stringify(without) === JSON.stringify([null, null]);
      return { pass: ok, notes: 'tableau avec colgroup, ligne 4=' + JSON.stringify(withGroup) + ' (attendu [[111],[222]]), tableau sans colgroup, ligne 4=' + JSON.stringify(without) + ' (attendu [null,null])' };
    },
  });

  cases.push({
    id: 'table_cell_width_parse_prefers_the_cell_attribute_then_the_colgroup_and_forgets_between_tasks',
    description: "La largeur d'une case lue dans un HTML : l'attribut colwidth de la case l'emporte (même avec un <colgroup>), sinon la largeur de sa colonne dans le <colgroup>, sinon rien ; les <col> retenus pour un tableau ne survivent pas à la tâche (un <colgroup> changé ensuite est relu)",
    run: async (h) => {
      const host = document.createElement('div');
      host.innerHTML = '<table><colgroup><col width="100"><col width="200"><col></colgroup><tbody><tr><td colwidth="33,44">a</td><td>b</td><td>c</td></tr><tr><td>d</td><td>e</td></tr></tbody></table>'
        + '<table><tbody><tr><td>f</td></tr></tbody></table>';
      const [withGroup, without] = host.querySelectorAll('table');
      const cell = (tableEl, row, col) => tableEl.rows[row].cells[col];
      const parse = el => JSON.stringify(EditorNodes.parseColwidthOnce(el));
      const got = {
        attribute: parse(cell(withGroup, 0, 0)), second: parse(cell(withGroup, 0, 1)), colWithoutWidth: parse(cell(withGroup, 0, 2)),
        secondRowFirst: parse(cell(withGroup, 1, 0)), noGroup: parse(cell(without, 0, 0)),
      };
      const sameTask = (() => { withGroup.querySelector('col').setAttribute('width', '150'); return parse(cell(withGroup, 1, 0)); })();
      await Promise.resolve();
      const nextTask = parse(cell(withGroup, 1, 0));
      const ok = got.attribute === '[33,44]' && got.second === '[200]' && got.colWithoutWidth === 'null' && got.secondRowFirst === '[100]' && got.noGroup === 'null' && nextTask === '[150]';
      return { pass: ok, notes: JSON.stringify(got) + ', <col> changé dans la même tâche=' + sameTask + ' (la mémoire de la tâche répond encore), à la tâche suivante=' + nextTask + ' (attendu [150])' };
    },
  });

  // Le HTML de l'enregistrement automatique (js/editor.js : documentHtml). Toutes les 2,5 s tant qu'on écrit, l'éditeur relisait tout le document pour n'en changer qu'un bloc (90 ms dans
  // « Présentation commerciale », 590 blocs) : il garde maintenant le HTML de chaque bloc de premier niveau tant que le nœud est le même. Le cas qui compte les appels de rendu d'un nœud échoue sur
  // l'ancien code (tout se refaisait à chaque lecture) ; celui qui suit garde le contrat : le texte écrit reste, octet pour octet, celui de TipTap quand la langue ou la touche de déclenchement change.
  cases.push({
    id: 'autosave_html_serializes_only_the_blocks_an_edit_changed_and_writes_the_same_bytes',
    description: "Lire le HTML du document deux fois de suite ne rend aucun bloc la seconde fois, une lettre tapée dans un paragraphe n'en fait rendre qu'un, et le texte reste celui de TipTap (editor.getHTML) octet pour octet à chaque lecture",
    run: async (h) => {
      await setup(h, lines(60));
      const editor = EditorCore.getEditor();
      const serializer = editor.schema.cached.domSerializer;
      const real = serializer.nodes.paragraph;
      let calls = 0;
      serializer.nodes.paragraph = function () { calls++; return real.apply(this, arguments); };
      try {
        const counted = fn => { calls = 0; const value = fn(); return { value, calls }; };
        const fullBefore = counted(() => editor.getHTML());
        const first = counted(() => Editor.getHTML());
        const unchanged = counted(() => Editor.getHTML());
        let pos = -1;
        let seen = 0;
        editor.state.doc.forEach((node, offset) => { if (node.type.name === 'paragraph' && ++seen === 30) pos = offset + 1; });
        editor.view.dispatch(editor.state.tr.insertText('x', pos));
        const edited = counted(() => Editor.getHTML());
        const fullAfter = counted(() => editor.getHTML());
        const same = first.value === fullBefore.value && unchanged.value === first.value && edited.value === fullAfter.value;
        const shown = edited.value !== unchanged.value && edited.value.indexOf('<p>xLigne 30 ') >= 0;
        return {
          pass: fullBefore.calls >= 60 && unchanged.calls === 0 && edited.calls === 1 && same && shown,
          notes: 'blocs rendus : TipTap ' + fullBefore.calls + ', 1re lecture ' + first.calls + ', 2e lecture ' + unchanged.calls + ' (attendu 0), après une lettre ' + edited.calls + ' (attendu 1) ; mêmes octets=' + same + ' (' + edited.value.length + ' caractères), lettre dans le texte=' + shown,
        };
      } finally { serializer.nodes.paragraph = real; }
    },
  });

  cases.push({
    id: 'autosave_html_follows_the_interface_language_and_the_trigger_key_like_the_full_serialization',
    description: "Quand la langue de l'interface ou la touche de déclenchement du panneau « # » change sans que le texte change, le HTML lu reste celui de TipTap octet pour octet (puce d'une date, sommaire, bulle d'une variable, bulle d'un calcul) : la mémoire des blocs repart à neuf",
    run: async (h) => {
      await setup(h, lines(3));
      const editor = EditorCore.getEditor();
      const lang = I18n.getLang();
      const triggerBefore = localStorage.getItem('pp_trigger_char');
      try {
        editor.commands.setContent({
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Client ' }, { type: 'varBadge', attrs: { table: 'Clients', column: 'Nom', key: 'Clients.Nom' } }, { type: 'text', text: ' le ' }, { type: 'smartChip', attrs: { kind: 'date' } }] },
            { type: 'paragraph', content: [{ type: 'calcBadge', attrs: { formula: '{Clients.Total} * 2' } }] },
            { type: 'toc' },
            { type: 'paragraph', content: [{ type: 'text', text: 'Fin' }] },
          ],
        });
        const same = () => Editor.getHTML() === editor.getHTML();
        const start = Editor.getHTML();
        const checks = { start: same(), badge: start.indexOf('#Clients.Nom') >= 0, again: Editor.getHTML() === start };
        localStorage.setItem('pp_trigger_char', '@');
        const at = Editor.getHTML();
        checks.triggerSame = same();
        checks.triggerShown = at.indexOf('@Clients.Nom') >= 0 && at.indexOf('#Clients.Nom') < 0 && at !== start;
        if (triggerBefore === null) localStorage.removeItem('pp_trigger_char'); else localStorage.setItem('pp_trigger_char', triggerBefore);
        checks.triggerBack = Editor.getHTML() === start;
        I18n.setLang(lang === 'fr' ? 'en' : 'fr');
        const other = Editor.getHTML();
        checks.langSame = same();
        checks.langShown = other !== start;
        I18n.setLang(lang);
        checks.langBack = Editor.getHTML() === start && same();
        return { pass: Object.keys(checks).every(k => checks[k]), notes: JSON.stringify(checks) };
      } finally {
        if (triggerBefore === null) localStorage.removeItem('pp_trigger_char'); else localStorage.setItem('pp_trigger_char', triggerBefore);
        I18n.setLang(lang);
      }
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.paginationCost = cases;
})();
