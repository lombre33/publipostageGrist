// Suite "typingCost" - ce que coûte UNE LETTRE tapée dans un long texte en mode document (carte du porteur, 10/11 : « sur un gros document, quand je tape j'ai un délai d'affichage des caractères, ça doit rester
// instantané »). Mesuré dans un texte de 117 pages (1 084 blocs, sommaire de 234 titres), à 1× puis à 4× plus lent : 264 ms par lettre (1 040 ms à 4×) avant, 16 ms (56 ms) après. Ce qui s'y passait à chaque lettre :
//  - le sommaire redessinait ses 234 lignes et cherchait la page de chacune par un `indexOf` sur tous les blocs, pour chaque coupure (195 ms) ;
//  - huit parcours du document entier qui ne trouvaient rien (les puces de liste, les repères de page, les signets, les largeurs de tableaux, les marques de suivi deux fois, les cadres derrière le texte) ;
//  - la barre d'outils relue deux fois pour le même état, et les noms des objets réécrits (50 attributs) ;
//  - la pagination (0,2 s) relancée à chaque pause de 200 ms, même quand la lettre ne changeait la hauteur d'aucun bloc.
// Les cas ci-dessous comptent des opérations (écritures de la feuille des marges, redessins du sommaire, rappels de parcours du document, relectures de la barre), jamais des millisecondes : une machine plus lente ne
// les fait pas échouer. Ceux qui disent « rien ne se refait » échouent sur l'ancien code ; ceux qui disent « la même chose qu'un calcul complet » (la pagination après une lettre qui ajoute une ligne, les pages du
// sommaire, les puces) passent sur les deux : ils gardent ce que les économies ne doivent pas changer.
(function () {
  const cases = [];
  const EMPTY_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const lines = n => Array.from({ length: n }, (_, i) => '<p>Ligne ' + (i + 1) + ' du corps du document.</p>').join('');
  const LONG_WORDS = 'un texte assez long pour passer à la ligne ' .repeat(10);
  // Un texte à sommaire : 60 articles (un titre et six lignes), plus de dix pages A4.
  const articles = n => Array.from({ length: n }, (_, i) => '<h2>Article ' + (i + 1) + '</h2>' + lines(6).replace(/Ligne (\d+)/g, 'Article ' + (i + 1) + ' ligne $1')).join('');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  async function setup(h, html) {
    await h.resetEditor();
    PageLayout.setMarginsMm(null);
    h.setA4Preview(true);
    Editor.setHeaderFooterData(JSON.parse(JSON.stringify(EMPTY_HF)));
    Editor.setHTML(html);
    Editor.refreshLayout();
    await sleep(900);
  }
  const blocks = () => Array.from(document.querySelector('.tiptap').children);
  // Les écritures de la feuille des marges de l'éditeur : une par pagination aboutie.
  function watchMarginsSheet() {
    const desc = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
    const writes = [];
    Object.defineProperty(Node.prototype, 'textContent', {
      configurable: true, enumerable: desc.enumerable, get: desc.get,
      set(value) {
        if (this instanceof HTMLStyleElement && this.id === 'v2-pagination-margins-style') writes.push(String(value));
        desc.set.call(this, value);
      },
    });
    return { writes, stop() { Object.defineProperty(Node.prototype, 'textContent', desc); } };
  }
  // Les rappels de `descendants` et de `nodesBetween` sur le document entier (le nœud racine) : un parcours qui visite tout le texte, le coût qui grandit avec lui.
  function watchDocWalks() {
    const proto = Object.getPrototypeOf(EditorCore.getEditor().state.doc);
    const original = { descendants: proto.descendants, nodesBetween: proto.nodesBetween };
    const count = { visits: 0, walks: 0, from: new Map() };
    ['descendants', 'nodesBetween'].forEach((name) => {
      proto[name] = function (...args) {
        if (this.type.name !== 'doc') return original[name].apply(this, args);
        count.walks++;
        const callbackAt = name === 'descendants' ? 0 : 2;
        const callback = args[callbackAt];
        // Qui parcourt : la première ligne de la pile hors de ce wrapper (le fichier et la ligne), avec ses visites, pour que l'échec dise où chercher.
        const caller = (new Error().stack.split('\n')[2] || '').replace(/^\s*at\s+/, '').replace(/https?:\/\/[^/]+\//, '');
        args[callbackAt] = function (...inner) { count.visits++; count.from.set(caller, (count.from.get(caller) || 0) + 1); return callback.apply(this, inner); };
        return original[name].apply(this, args);
      };
    });
    return { count, stop() { proto.descendants = original.descendants; proto.nodesBetween = original.nodesBetween; } };
  }
  async function typeAtEndOf(h, el, text) {
    await h.focusInElement(el);
    await h.typeText(text);
  }
  const tops = () => (HeaderFooterPreview.pageBodyTops() || []).map(top => Math.round(top * 10) / 10);
  // Ce que la pagination a posé : le bloc qui termine chaque page et la feuille des marges (les réserves sous chaque coupure, au dixième de pixel près).
  const layoutOf = () => {
    const all = blocks();
    const sheet = document.getElementById('v2-pagination-margins-style');
    return { tops: tops().join(), breaks: HeaderFooterPreview.pageBreaks().map(b => all.indexOf(b.afterEl)).join(), sheet: sheet ? sheet.textContent : '' };
  };
  const sameLayout = (a, b) => a.tops === b.tops && a.breaks === b.breaks && a.sheet === b.sheet;

  // --- isTextOnlyEdit : ce qui compte pour une « lettre » ------------------------------------------------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'typing_is_text_only_edit_accepts_letters_and_refuses_everything_else',
    description: 'EditorCore.isTextOnlyEdit : du texte tapé, effacé ou remplacé dans UN bloc de texte oui ; une coupure de bloc, deux blocs joints, un bloc inséré, une marque posée, une transaction suivie d\'une autre qui change le texte, ou sans changement : non',
    run: async (h) => {
      await h.resetEditor();
      Editor.setHTML('<p>Bonjour tout le monde</p><p>Deuxième ligne</p><ul><li><p>Point un</p></li></ul>');
      await sleep(120);
      const editor = EditorCore.getEditor();
      const { state } = editor;
      const first = 1;
      const secondStart = state.doc.child(0).nodeSize + 1;
      const is = (tr, appended) => EditorCore.isTextOnlyEdit(tr, appended);
      const checks = {
        typed: is(state.tr.insertText('x', first + 3)),
        erased: is(state.tr.delete(first + 2, first + 5)),
        replaced: is(state.tr.insertText('YY', first + 1, first + 4)),
        inListItem: is(state.tr.insertText('z', state.doc.child(0).nodeSize + state.doc.child(1).nodeSize + 4)),
        split: !is(state.tr.split(first + 3)),
        joined: !is(state.tr.delete(state.doc.child(0).nodeSize - 3, secondStart + 3)),
        insertedBlock: !is(state.tr.insert(0, state.schema.nodes.paragraph.create(null, state.schema.text('Nouveau')))),
        mark: !is(state.tr.addMark(first, first + 5, state.schema.marks.bold.create())),
        noChange: !is(state.tr),
        none: !is(null),
      };
      const typed = state.tr.insertText('x', first + 3);
      checks.followedByAnother = !is(typed, [{ docChanged: true }]) && is(typed, [{ docChanged: false }]);
      return { pass: Object.keys(checks).every(k => checks[k]), notes: JSON.stringify(checks) };
    },
  });

  // --- la pagination -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'typing_letter_that_changes_no_block_height_does_not_repaginate',
    description: 'Une lettre tapée au milieu d\'un long texte (plus de dix pages) qui ne change la hauteur d\'aucun bloc ne refait pas la pagination : la feuille des marges n\'est pas réécrite',
    run: async (h) => {
      await setup(h, lines(700));
      const pages = tops().length;
      if (pages < 10) return { pass: false, notes: 'texte trop court : ' + pages + ' pages' };
      const target = blocks()[350];
      const watch = watchMarginsSheet();
      try {
        await typeAtEndOf(h, target, 'x');
        await typeAtEndOf(h, target, 'y');
        await sleep(1500);
      } finally { watch.stop(); }
      const typed = target.textContent.endsWith('xy');
      return { pass: typed && watch.writes.length === 0, notes: 'pages=' + pages + ', texte tapé=' + typed + ', écritures de la feuille des marges=' + watch.writes.length + ' (attendu 0)' };
    },
  });

  cases.push({
    id: 'typing_letters_that_add_a_line_repaginate_to_the_same_result_as_a_full_calculation',
    description: 'Un texte tapé qui ajoute des lignes à un paragraphe, une ligne vide (Entrée), une suppression : la pagination se refait et donne au chiffre près celle d\'un calcul complet',
    run: async (h) => {
      await setup(h, lines(700));
      const before = layoutOf();
      const target = blocks()[40];
      const checks = {};
      const sameAsFull = async () => {
        await sleep(1500);
        const got = layoutOf();
        HeaderFooterPreview.renderPaginationOverlay();
        return sameLayout(got, layoutOf());
      };
      await typeAtEndOf(h, target, LONG_WORDS);
      const grew = blocks()[40].getBoundingClientRect().height > 40;
      checks.grew = grew;
      checks.afterWrap = await sameAsFull();
      checks.moved = !sameLayout(layoutOf(), before);
      await typeAtEndOf(h, blocks()[41], 'x');
      document.execCommand('insertParagraph');
      await sleep(40);
      await h.typeText('Nouvelle ligne');
      checks.afterEnter = await sameAsFull();
      document.execCommand('delete');
      for (let i = 0; i < 60; i++) document.execCommand('delete');
      await sleep(40);
      checks.afterDelete = await sameAsFull();
      return { pass: Object.keys(checks).every(k => checks[k]), notes: JSON.stringify(checks) };
    },
  });

  cases.push({
    id: 'typing_pagination_after_a_wrap_that_gets_back_to_the_same_height_still_matches_a_full_calculation',
    description: 'Une lettre tapée dans un paragraphe qui, entre deux pauses, passe à la ligne puis revient à sa hauteur d\'avant : la pagination reste celle d\'un calcul complet',
    run: async (h) => {
      await setup(h, lines(300));
      const target = blocks()[100];
      await typeAtEndOf(h, target, LONG_WORDS);
      await sleep(1500);
      for (let i = 0; i < LONG_WORDS.length; i++) document.execCommand('delete');
      await sleep(1500);
      const got = layoutOf();
      HeaderFooterPreview.renderPaginationOverlay();
      return { pass: sameLayout(got, layoutOf()) && target.getBoundingClientRect().height < 40, notes: tops().length + ' pages' };
    },
  });

  cases.push({
    id: 'typing_inside_a_table_still_repaginates_when_a_row_grows',
    description: 'Dans un tableau (un bloc que le calcul abrégé ne traite pas) : une ligne qui grandit refait la pagination, comme avant',
    run: async (h) => {
      const rows = Array.from({ length: 160 }, (_, r) => '<tr>' + [1, 2, 3].map(c => '<td><p>Ligne ' + (r + 1) + ' case ' + c + '</p></td>').join('') + '</tr>').join('');
      await setup(h, '<p>Avant</p><table><tbody>' + rows + '</tbody></table>');
      const cell = document.querySelectorAll('.tiptap td p')[3 * 20 + 1];
      await typeAtEndOf(h, cell, ' ' + LONG_WORDS);
      await sleep(1500);
      const got = layoutOf();
      HeaderFooterPreview.renderPaginationOverlay();
      return { pass: sameLayout(got, layoutOf()), notes: tops().length + ' pages' };
    },
  });

  cases.push({
    id: 'typing_letter_after_a_style_moved_blocks_without_changing_any_height_still_repaginates',
    description: 'Un style arrivé après coup tire des blocs vers le haut sans changer ni une hauteur ni la taille du texte (une marge de -24 px, compensée plus loin) : la lettre tapée ensuite refait la pagination, la réserve de chaque page se corrige comme dans un calcul complet (slidesPages)',
    run: async (h) => {
      await setup(h, lines(700));
      // Les vérifications différées d'une pagination (300 et 1 500 ms après elle : observeBlocks) relisent les réserves d'elles-mêmes : on les laisse passer avant de poser le style, pour que seule la lettre tapée demande le calcul.
      HeaderFooterPreview.renderPaginationOverlay();
      await sleep(1900);
      const tiptap = document.querySelector('.tiptap');
      const base = layoutOf();
      const gap = parseFloat(getComputedStyle(blocks()[300]).marginTop) || 0;
      const sizeBefore = tiptap.offsetWidth + 'x' + tiptap.offsetHeight;
      const style = document.createElement('style');
      style.id = 'pp-typing-test-shift';
      // Les blocs 300 à 449 remontent de 24 px, ceux d'après retrouvent leur place : la taille de `.tiptap` ne change pas (les marges voisines se confondent : +24 - gap au bloc 450).
      style.textContent = '#editor-container .tiptap > p:nth-child(300) { margin-top: -24px !important; } #editor-container .tiptap > p:nth-child(450) { margin-top: ' + (gap + 24) + 'px !important; }';
      document.head.appendChild(style);
      try {
        await sleep(300);
        const sizeAfter = tiptap.offsetWidth + 'x' + tiptap.offsetHeight;
        // Une transaction, sans le défilement d'une vraie frappe (qui ferait relire les réserves au défilement : checkDrift) : seule la modification du texte demande le calcul.
        const editor = EditorCore.getEditor();
        const block = blocks()[10];
        editor.view.dispatch(editor.state.tr.insertText('z', editor.view.posAtDOM(block, block.childNodes.length)));
        await sleep(1200);
        const got = layoutOf();
        HeaderFooterPreview.renderPaginationOverlay();
        const full = layoutOf();
        const moved = full.sheet !== base.sheet;
        return {
          pass: sizeBefore === sizeAfter && moved && sameLayout(got, full),
          notes: 'taille avant=' + sizeBefore + ' après=' + sizeAfter + ', la feuille a bougé=' + moved + ', pagination = calcul complet=' + sameLayout(got, full),
        };
      } finally { style.remove(); }
    },
  });

  cases.push({
    id: 'typing_requested_full_calculation_is_not_skipped',
    description: 'Un calcul COMPLET demandé (schedulePaginationRecompute : redimensionnement, marges, images arrivées) se fait même si la dernière modification n\'a touché que du texte sans changer de hauteur',
    run: async (h) => {
      await setup(h, lines(500));
      await typeAtEndOf(h, blocks()[200], 'x');
      const watch = watchMarginsSheet();
      try {
        HeaderFooterPreview.schedulePaginationRecompute();
        await sleep(1500);
      } finally { watch.stop(); }
      return { pass: watch.writes.length >= 1, notes: 'écritures=' + watch.writes.length };
    },
  });

  // --- le sommaire ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'typing_letter_in_a_paragraph_leaves_the_toc_alone_and_a_letter_in_a_heading_updates_it',
    description: 'Le sommaire d\'un long texte n\'est pas redessiné par une lettre tapée dans un paragraphe ; il l\'est par une lettre dans un titre (le titre tapé y est), par un titre ajouté et par un niveau changé',
    run: async (h) => {
      await setup(h, '<div class="toc-marker"></div>' + articles(60));
      const toc = document.querySelector('.tiptap .toc-marker');
      if (!toc || toc.querySelectorAll('.toc-entry-preview').length < 60) return { pass: false, notes: 'sommaire absent ou court : ' + (toc && toc.querySelectorAll('.toc-entry-preview').length) };
      let mutations = 0;
      const observer = new MutationObserver((list) => { mutations += list.length; });
      observer.observe(toc, { childList: true, subtree: true, attributes: true, characterData: true });
      const checks = {};
      try {
        const paragraph = blocks().find(el => el.tagName === 'P' && el.textContent.startsWith('Article 30 ligne 3'));
        await typeAtEndOf(h, paragraph, 'abc');
        await sleep(1200);
        checks.paragraphLeavesToc = mutations === 0;
        const heading = blocks().find(el => el.tagName === 'H2' && el.textContent === 'Article 30');
        await typeAtEndOf(h, heading, ' bis');
        await sleep(300);
        checks.headingUpdatesToc = Array.from(toc.querySelectorAll('.toc-entry-preview')).some(line => line.textContent.includes('Article 30 bis'));
        checks.headingRedraws = mutations > 0;
        const lines = toc.querySelectorAll('.toc-entry-preview').length;
        EditorCore.getEditor().chain().focus().setTextSelection(EditorCore.getEditor().view.posAtDOM(paragraph, 0)).setHeading({ level: 2 }).run();
        await sleep(300);
        checks.newHeadingAddsLine = toc.querySelectorAll('.toc-entry-preview').length === lines + 1;
      } finally { observer.disconnect(); }
      return { pass: Object.keys(checks).every(k => checks[k]), notes: JSON.stringify(checks) };
    },
  });

  cases.push({
    id: 'typing_toc_page_numbers_follow_the_pagination_and_the_page_lookup_reads_the_blocks_once',
    description: 'Les numéros de page du sommaire sont ceux de la pagination (le haut du corps de chaque page) ; la recherche de la page de plusieurs titres à la suite lit les blocs de l\'éditeur une seule fois, pas une fois par titre',
    run: async (h) => {
      await setup(h, '<div class="toc-marker"></div>' + articles(60));
      const bodyTops = HeaderFooterPreview.pageBodyTops();
      const tiptap = document.querySelector('.tiptap');
      const zoom = tiptap.getBoundingClientRect().width / tiptap.offsetWidth || 1;
      const baseTop = tiptap.getBoundingClientRect().top;
      const expected = el => { const top = (el.getBoundingClientRect().top - baseTop) / zoom; let page = 0; bodyTops.forEach((bodyTop, i) => { if (top >= bodyTop - 2) page = i; }); return page; };
      const headings = Array.from(tiptap.querySelectorAll(':scope > h2'));
      const lines = Array.from(document.querySelectorAll('.tiptap .toc-entry-preview[data-heading]'));
      const wrong = [];
      headings.forEach((heading, i) => {
        const shown = lines[i] && lines[i].dataset.page;
        if (String(expected(heading) + 1) !== shown) wrong.push(i + ':' + (expected(heading) + 1) + '/' + shown);
      });
      const collectionReads = (() => {
        const originalFrom = Array.from;
        let reads = 0;
        Array.from = function (source, ...rest) { if (source instanceof HTMLCollection && source.length > 100) reads++; return originalFrom.call(this, source, ...rest); };
        try {
          const pageOf = HeaderFooterPreview.pageIndexResolver ? HeaderFooterPreview.pageIndexResolver() : HeaderFooterPreview.pageIndexOf;
          headings.forEach(heading => pageOf(heading));
        } finally { Array.from = originalFrom; }
        return reads;
      })();
      return {
        pass: bodyTops.length >= 10 && wrong.length === 0 && collectionReads <= 1,
        notes: 'pages=' + bodyTops.length + ', titres=' + headings.length + ', numéros faux=' + wrong.slice(0, 5).join(' ') + ', lectures de la liste des blocs=' + collectionReads + ' (attendu au plus 1)',
      };
    },
  });

  cases.push({
    id: 'typing_toc_page_numbers_come_back_after_the_pagination_moves_them',
    description: 'Une ligne vide ajoutée dans un long texte repousse les titres d\'après sur la page suivante : le sommaire garde les numéros de la nouvelle pagination (le calcul abrégé ne les gèle pas)',
    run: async (h) => {
      await setup(h, '<div class="toc-marker"></div>' + articles(60));
      const read = () => Array.from(document.querySelectorAll('.tiptap .toc-entry-preview[data-heading]')).map(line => line.dataset.page).join(',');
      const before = read();
      const first = blocks().find(el => el.tagName === 'P');
      await typeAtEndOf(h, first, LONG_WORDS + LONG_WORDS + LONG_WORDS);
      for (let i = 0; i < 12; i++) { document.execCommand('insertParagraph'); await sleep(20); }
      await sleep(2000);
      const after = read();
      const lines = Array.from(document.querySelectorAll('.tiptap .toc-entry-preview[data-heading]'));
      const lastPage = lines[lines.length - 1].dataset.page;
      return { pass: after !== before && Number(lastPage) === HeaderFooterPreview.pageBodyTops().length, notes: 'avant ' + before.slice(0, 40) + ' / après ' + after.slice(0, 40) + ', dernière page ' + lastPage + ' sur ' + HeaderFooterPreview.pageBodyTops().length };
    },
  });

  // --- les parcours du document entier -------------------------------------------------------------------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'typing_letter_walks_the_whole_document_a_bounded_number_of_times',
    description: 'Une lettre tapée dans un long texte (700 blocs) ne visite pas tous ses nœuds : moins de 200 visites des parcours du document entier (descendants, nodesBetween), contre plus de 3 000 avant',
    run: async (h) => {
      await setup(h, '<ul><li><p><span style="color: #ff0000; font-size: 20pt">Rouge</span></p></li></ul>' + lines(700));
      const target = blocks()[350];
      await h.focusInElement(target);
      const watch = watchDocWalks();
      try {
        for (const letter of 'abcde') { await h.typeText(letter); }
        await sleep(1500);
      } finally { watch.stop(); }
      const perLetter = Math.round(watch.count.visits / 5);
      const top = Array.from(watch.count.from.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([where, n]) => Math.round(n / 5) + ' ' + where).join(' ; ');
      return { pass: target.textContent.endsWith('abcde') && perLetter < 200, notes: 'visites par lettre=' + perLetter + ' (attendu moins de 200), parcours=' + watch.count.walks + ' — ' + top };
    },
  });

  cases.push({
    id: 'typing_list_markers_keep_their_style_while_text_is_typed_around_them',
    description: 'Les ronds d\'une liste gardent leur couleur et leur taille quand on tape avant la liste, dans un point et après elle (les points réglés se relisent par bloc)',
    run: async (h) => {
      const LIST = '<ul><li><p><span style="color: #ff0000; font-size: 28pt">Rouge</span></p></li><li><p>Normal</p></li></ul>';
      await setup(h, '<p>Avant</p>' + LIST + '<p>Milieu</p>' + LIST + '<p>Après</p>');
      const marks = () => Array.from(document.querySelectorAll('.tiptap li')).map(li => getComputedStyle(li, '::marker').color + '/' + getComputedStyle(li, '::marker').fontSize);
      const before = marks();
      await typeAtEndOf(h, blocks()[0], 'zz');
      const afterFirst = marks();
      await typeAtEndOf(h, blocks()[3].querySelectorAll('li p')[1], 'yy');
      const afterItem = marks();
      await typeAtEndOf(h, blocks()[4], 'xx');
      const afterLast = marks();
      const typed = blocks()[0].textContent === 'Avantzz';
      const same = [afterFirst, afterItem, afterLast].every(m => m.join() === before.join());
      const redFirst = before[0].startsWith('rgb(255, 0, 0)') && before[2].startsWith('rgb(255, 0, 0)') && !before[1].startsWith('rgb(255, 0, 0)');
      return { pass: typed && same && redFirst, notes: JSON.stringify({ typed, same, redFirst, before }) };
    },
  });

  // --- la barre d'outils -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'typing_letters_do_not_reread_the_toolbar_each_time_but_it_catches_up',
    description: 'Cinq lettres tapées dans le même paragraphe ne relisent pas la barre d\'outils cinq fois (deux fois chacune avant) ; une relecture complète suit la dernière lettre, et la barre montre le gras d\'un mot dès que le curseur y entre',
    run: async (h) => {
      await setup(h, '<p>Un début</p><p><strong>Gras</strong> puis normal</p>' + lines(50));
      // Chaque relecture de la barre (MainToolbar.syncToolbarState) passe par ObjectsMenu.sync : c'est lui qu'on compte (la barre est branchée sur l'éditeur par référence, pas par nom).
      const original = ObjectsMenu.sync;
      let calls = 0;
      ObjectsMenu.sync = function (...args) { calls++; return original.apply(this, args); };
      let during = 0, late = 0;
      try {
        await h.focusInElement(blocks()[0]);
        calls = 0;
        for (const letter of 'abcde') document.execCommand('insertText', false, letter);
        await sleep(60);
        during = calls;
        await sleep(900);
        late = calls - during;
      } finally { ObjectsMenu.sync = original; }
      const bold = document.getElementById('v2-btn-bold');
      const strong = blocks()[1].querySelector('strong');
      const range = document.createRange();
      range.setStart(strong.firstChild, 2);
      range.collapse(true);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
      await sleep(300);
      const boldOn = bold.classList.contains('is-active') || bold.getAttribute('aria-pressed') === 'true';
      return { pass: during <= 1 && late === 1 && boldOn, notes: 'relectures pendant la frappe=' + during + ' (attendu 1 au plus), après=' + late + ' (attendu 1), gras actif=' + boldOn };
    },
  });

  // --- les noms des objets -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'typing_letters_do_not_rewrite_the_objects_menu_names',
    description: 'Le menu des objets ne réécrit pas ses info-bulles à chaque lettre tapée dans un texte (la ligne « Tableau d\'un modèle Grille » à part, qui reprend la sienne selon l\'état) : zéro écriture de data-tip pendant la frappe, et les noms restent ceux de la diapositive',
    run: async (h) => {
      await setup(h, lines(60));
      const names = () => Array.from(document.querySelectorAll('#v2-objects-group [data-tip]')).map(el => el.getAttribute('data-tip')).join('|');
      ObjectsMenu.sync();
      const before = names();
      const original = Element.prototype.setAttribute;
      let writes = 0;
      Element.prototype.setAttribute = function (name, value) {
        if (name === 'data-tip' && this.closest && this.closest('#v2-objects-group') && this.dataset.action !== 'linkedTable') writes++;
        return original.call(this, name, value);
      };
      try {
        await h.focusInElement(blocks()[30]);
        for (const letter of 'abcde') document.execCommand('insertText', false, letter);
        await sleep(900);
      } finally { Element.prototype.setAttribute = original; }
      return { pass: writes === 0 && before.length > 0 && names() === before, notes: 'écritures de data-tip dans le menu des objets=' + writes + ' (attendu 0), noms gardés=' + (names() === before) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.typingCost = cases;
})();
