// Suite "bottomAnchor" - « En bas de la page » (demande d'Antoine du 26/11 : « aligner une sélection au bas de la page, car compliqué de le placer correctement en publipostage : les valeurs
// des variables prennent plus ou moins de place que leur nom » ; son choix : « Réglage sur la sélection », js/bottom-anchor.js). Trois parties :
//  1) le RÉGLAGE : l'attribut `data-bottom-anchor` des blocs de premier niveau et son aller-retour HTML, la ligne à cocher du menu Alignement (pose, retrait, tableau entier, légendes qui suivent,
//     grisage et sa raison, les deux langues, Annuler), Entrée ;
//  2) l'ÉDITEUR et la LECTURE : la suite de blocs calés se pose au bas de la page où elle tombe (quelle que soit la longueur du texte au-dessus), passe en bas de la page suivante quand elle ne
//     tient pas, ce qui la suit repart sur la page d'après, un saut de page posé à la main ne fait pas de page blanche, une suite plus haute qu'une page se range comme le reste ;
//  3) les EXPORTS : le PDF (lu par pdf.js), le Word et l'ODT (XML dézippé).
// La vraie souris et le vrai clavier à 700x400 (clair, sombre, anglais) sont dans dev-tests/verify-bottom-anchor-mouse.mjs : une page.evaluate ne déclenche ni un survol ni une frappe de confiance.
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const ed = () => EditorCore.getEditor();
  const ANCHOR = text => '<p data-bottom-anchor="true">' + text + '</p>';
  const PAGE_BREAK = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
  const row = () => document.getElementById('v2-btn-bottom-anchor');
  const written = () => Editor.getHTML().replace(/<p><\/p>$/, '');

  async function setDoc(h, html) {
    await h.resetEditor();
    Editor.setHTML(html);
    await sleep(150);
  }
  // Les blocs de premier niveau du document, un par un : « Aa* » quand le réglage est posé, « Aa » sinon.
  function anchorList() {
    const out = [];
    ed().state.doc.forEach((node) => { if (node.textContent || node.type.name !== 'paragraph') out.push(node.type.name + ':' + node.textContent.slice(0, 12) + (node.attrs.bottomAnchor ? '*' : '')); });
    return out.join('|');
  }
  function positionOf(predicate) {
    let found = null;
    ed().state.doc.descendants((node, pos) => { if (found == null && predicate(node)) found = pos; });
    return found;
  }
  const textPos = text => positionOf(n => n.isText && n.text.indexOf(text) !== -1);
  async function cursorIn(text) {
    ed().commands.setTextSelection(textPos(text) + 1);
    await sleep(150);
  }
  async function selectRange(fromText, toText) {
    ed().commands.setTextSelection({ from: textPos(fromText) + 1, to: textPos(toText) + 1 });
    await sleep(150);
  }
  const rowState = () => ({ checked: row().getAttribute('aria-checked') === 'true', disabled: row().getAttribute('aria-disabled') === 'true', greyed: row().classList.contains('v2-hover-row-disabled'), title: row().title, tab: row().tabIndex });
  // Un clic comme la souris le donne : la ligne ne prend pas le focus (mousedown retenu), l'éditeur garde sa sélection.
  async function press() {
    row().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    row().click();
    await sleep(150);
  }

  // === 1) Le réglage ===================================================================================================================================================
  const ZONE = '<div class="two-columns-zone"><div class="two-columns-column"><p>Nom et signature</p></div><div class="two-columns-column"><p>Date</p></div></div>';
  const TABLE = '<table><tbody><tr><td><p>Total</p></td><td><p>10</p></td></tr></tbody></table>';
  const CALLOUT = '<div class="callout" data-color="blue" data-icon="info" role="note"><p>Note</p></div>';
  const withAnchor = html => html.replace(/^<(\w+)/, '<$1 data-bottom-anchor="true"');

  cases.push({
    id: 'bottomanchor_attribute_survives_the_html_round_trip_on_every_kind_of_top_level_block_and_never_appears_otherwise',
    description: 'Le réglage est l\'attribut `data-bottom-anchor` d\'un bloc de premier niveau (paragraphe, titre, listes, citation, tableau, encadré, bloc de signature) : lu depuis le HTML (« false » compte pour rien), réécrit seulement quand il est posé ; un texte qui ne s\'en sert pas n\'en porte aucun ; Entrée à la fin d\'un paragraphe calé ouvre un paragraphe ordinaire',
    run: async (h) => {
      const kinds = {
        p: '<p>Aa</p>', h: '<h2>Titre</h2>', ul: '<ul><li><p>Puce</p></li></ul>', ol: '<ol><li><p>Un</p></li></ol>', q: '<blockquote><p>Cité</p></blockquote>',
        table: TABLE, callout: CALLOUT, zone: ZONE,
      };
      const out = {};
      for (const [name, html] of Object.entries(kinds)) {
        await setDoc(h, withAnchor(html));
        const marked = ed().state.doc.child(0).attrs.bottomAnchor === true;
        const html1 = written();
        const first = new DOMParser().parseFromString(html1, 'text/html').body.firstElementChild;
        await setDoc(h, html);
        const plain = written();
        out[name] = { marked, written: first && first.getAttribute('data-bottom-anchor') === 'true', plainClean: plain.indexOf('data-bottom-anchor') === -1 };
      }
      await setDoc(h, '<p data-bottom-anchor="false">Aa</p><p>Bb</p>');
      out.falseIsNothing = anchorList() === 'paragraph:Aa|paragraph:Bb' && written().indexOf('data-bottom-anchor') === -1;
      await setDoc(h, ANCHOR('Dd'));
      ed().commands.setTextSelection(textPos('Dd') + 2);
      ed().commands.splitBlock();
      await sleep(100);
      out.enterAtEnd = anchorList().replace(/paragraph:\|?$/, '');
      const pass = Object.entries(kinds).every(([name]) => out[name].marked && out[name].written && out[name].plainClean) && out.falseIsNothing && out.enterAtEnd === 'paragraph:Dd*';
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'bottomanchor_menu_row_sets_and_clears_the_setting_on_the_selected_blocks_with_one_undo',
    description: 'La ligne « En bas de la page » du menu Alignement : décochée sur un paragraphe ordinaire, un clic pose le réglage (coche) et le suivant le retire ; sur plusieurs blocs, un clic les règle tous et un seul Annuler les défait ; état mixte : un clic pose à tous',
    run: async (h) => {
      const out = {};
      await setDoc(h, '<p>Aa</p><p>Bb</p><p>Cc</p>');
      out.where = { inAlignMenu: !!document.querySelector('#v2-align-group .v2-hover-flyout #v2-btn-bottom-anchor'), role: row().getAttribute('role'), label: row().textContent.trim(), tabbable: row().tabIndex === 0 };
      await cursorIn('Bb');
      out.start = rowState();
      await press();
      out.set = { list: anchorList(), html: written(), state: rowState() };
      await press();
      out.cleared = { list: anchorList(), state: rowState() };
      await selectRange('Aa', 'Cc');
      await press();
      out.many = { list: anchorList(), state: rowState() };
      ed().commands.undo();
      await sleep(150);
      out.undone = anchorList();
      ed().commands.redo();
      await sleep(150);
      out.redone = anchorList();
      await setDoc(h, ANCHOR('Aa') + '<p>Bb</p><p>Cc</p>');
      await selectRange('Aa', 'Cc');
      out.mixedStart = rowState();
      await press();
      out.mixedSet = anchorList();
      await press();
      out.mixedCleared = anchorList();
      const pass = out.where.inAlignMenu && out.where.role === 'menuitemcheckbox' && out.where.label === 'En bas de la page' && out.where.tabbable
        && !out.start.checked && !out.start.disabled && !out.start.greyed && out.start.title === ''
        && out.set.list === 'paragraph:Aa|paragraph:Bb*|paragraph:Cc' && out.set.html === '<p>Aa</p><p data-bottom-anchor="true">Bb</p><p>Cc</p>' && out.set.state.checked
        && out.cleared.list === 'paragraph:Aa|paragraph:Bb|paragraph:Cc' && !out.cleared.state.checked
        && out.many.list === 'paragraph:Aa*|paragraph:Bb*|paragraph:Cc*' && out.many.state.checked && out.undone === 'paragraph:Aa|paragraph:Bb|paragraph:Cc' && out.redone === out.many.list
        && !out.mixedStart.checked && !out.mixedStart.disabled && out.mixedSet === out.many.list && out.mixedCleared === out.undone;
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'bottomanchor_menu_row_takes_the_whole_table_around_the_cursor_and_the_captions_that_follow',
    description: 'Le curseur dans une case de tableau : la ligne règle le tableau de premier niveau entier ; une légende qui suit l\'image ou le tableau reçoit le réglage avec lui, et le perd avec lui',
    run: async (h) => {
      const out = {};
      await setDoc(h, '<p>Avant</p>' + TABLE + '<p data-caption="true">Légende du tableau</p><p>Après</p>');
      await cursorIn('Total');
      await press();
      out.table = anchorList();
      await press();
      out.tableOff = anchorList();
      const pass = out.table === 'paragraph:Avant|table:Total10*|paragraph:Légende du t*|paragraph:Après' && out.tableOff === 'paragraph:Avant|table:Total10|paragraph:Légende du t|paragraph:Après';
      return { pass, notes: JSON.stringify(out) };
    },
  });

  // Bug du 27/11 (Antoine : « c'est un module 2 colonnes, et sur les 4 lignes de la fin de la colonne de gauche j'ai mis l'option et ça crée ce bug-là ») : la ligne, posée depuis une colonne, réglait la ZONE ENTIÈRE ;
  // la lettre (une zone presque haute d'une page) partait en page 2 et la page 1 ne gardait que les logos en calque. Désormais la ligne est grisée, avec sa raison, dans une colonne, tant que le calage des seules
  // lignes choisies n'existe pas ; la zone entière se règle en la sélectionnant en entier.
  const LETTER = '<div class="two-columns-zone"><div class="two-columns-column"><p>Vice-presidece</p><p></p><p>Adresse postale</p><p>Talence cedex</p></div><div class="two-columns-column"><p>Madame, Monsieur</p><p>Corps du courrier</p></div></div>';
  cases.push({
    id: 'bottomanchor_in_a_column_of_a_zone_the_row_is_greyed_with_its_reason_and_the_zone_is_not_anchored',
    description: 'Le curseur, ou des lignes choisies, dans une colonne d\'une zone à deux colonnes (la colonne de gauche ou celle de droite) : la ligne « En bas de la page » est grisée, avec sa raison dans les deux langues, et un clic ne règle rien (avant, il réglait la zone entière : la lettre d\'Antoine partait en page 2) ; une sélection qui sort de la zone, ou la zone prise en entier, la règle toujours, comme un tableau',
    run: async (h) => {
      const out = {};
      await setDoc(h, '<p>Avant</p>' + LETTER + '<p>Après</p>');
      const reasonFr = I18n.t('bottomAnchor.inColumn');
      I18n.setLang('en');
      const reasonEn = I18n.t('bottomAnchor.inColumn');
      I18n.setLang('fr');
      const greyed = s => s.disabled && s.greyed && s.title === reasonFr && s.tab === -1 && !s.checked;
      await cursorIn('Talence');
      out.cursorLeft = rowState();
      await press();
      out.afterCursorLeft = anchorList();
      await selectRange('Adresse', 'Talence');
      out.linesLeft = rowState();
      await press();
      out.afterLinesLeft = anchorList();
      await cursorIn('Corps');
      out.cursorRight = rowState();
      await press();
      out.afterCursorRight = anchorList();
      const untouched = 'paragraph:Avant|twoColumnsZone:Vice-preside|paragraph:Après';
      // Une sélection qui va d'avant la zone à après elle : la zone est visée en entier, avec les blocs qu'elle traverse.
      await selectRange('Avant', 'Après');
      out.spanning = rowState();
      await press();
      out.afterSpanning = anchorList();
      await press();
      out.cleared = anchorList();
      // La zone prise en entier (sélection d'objet).
      ed().commands.setNodeSelection(positionOf(n => n.type.name === 'twoColumnsZone'));
      await sleep(150);
      out.whole = rowState();
      await press();
      out.afterWhole = anchorList();
      out.texts = { reasonFr, reasonEn };
      const pass = greyed(out.cursorLeft) && greyed(out.linesLeft) && greyed(out.cursorRight)
        && out.afterCursorLeft === untouched && out.afterLinesLeft === untouched && out.afterCursorRight === untouched
        && !out.spanning.disabled && out.afterSpanning === 'paragraph:Avant*|twoColumnsZone:Vice-preside*|paragraph:Après*' && out.cleared === untouched
        && !out.whole.disabled && out.afterWhole === 'paragraph:Avant|twoColumnsZone:Vice-preside*|paragraph:Après'
        && reasonFr !== reasonEn && /^Inside a column/.test(reasonEn) && /^Dans une colonne/.test(reasonFr);
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'bottomanchor_a_zone_already_anchored_keeps_its_row_checked_and_a_click_from_a_column_removes_the_setting',
    description: 'Une zone déjà calée (un document d\'avant le grisage dans une colonne) : le curseur dans l\'une de ses colonnes montre la ligne cochée et active, et un clic retire le réglage de la zone (la personne n\'est jamais coincée avec un réglage qu\'elle ne peut plus défaire)',
    run: async (h) => {
      const out = {};
      await setDoc(h, '<p>Avant</p>' + withAnchor(LETTER) + '<p>Après</p>');
      out.start = anchorList();
      await cursorIn('Talence');
      out.state = rowState();
      await press();
      out.after = anchorList();
      out.stateAfter = rowState();
      const pass = out.start === 'paragraph:Avant|twoColumnsZone:Vice-preside*|paragraph:Après' && out.state.checked && !out.state.disabled && !out.state.greyed
        && out.after === 'paragraph:Avant|twoColumnsZone:Vice-preside|paragraph:Après' && !out.stateAfter.checked && out.stateAfter.disabled && out.stateAfter.greyed;
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'bottomanchor_menu_row_is_greyed_with_its_reason_in_a_conditional_block_a_header_and_a_page_break',
    description: 'Grisée, avec sa raison en info-bulle et sans rien changer au clic : dans un bloc de texte conditionnel, sur un repère de saut de page, pendant l\'écriture d\'un en-tête ; la raison existe dans les deux langues',
    run: async (h) => {
      const out = {};
      await setDoc(h, '<div class="conditional-text"><p>Xx</p></div><p>Yy</p>');
      await cursorIn('Xx');
      out.cond = rowState();
      await press();
      out.condAfter = anchorList();
      await setDoc(h, '<p>Aa</p>' + PAGE_BREAK + '<p>Bb</p>');
      await selectRange('Aa', 'Bb');
      out.marker = rowState();
      await setDoc(h, '<p>Aa</p>');
      await cursorIn('Aa');
      HeaderFooterPreview.enterHeaderFooterMode('header', 'default');
      await sleep(250);
      ed().commands.focus('end');
      out.header = rowState();
      HeaderFooterPreview.exitHeaderFooterModeIfActive();
      await sleep(250);
      out.back = rowState();
      const reasonFr = I18n.t('bottomAnchor.notHere');
      I18n.setLang('en');
      const reasonEn = I18n.t('bottomAnchor.notHere');
      const labelEn = I18n.t('bottomAnchor.row');
      I18n.setLang('fr');
      out.texts = { reasonFr, reasonEn, labelEn };
      const greyed = s => s.disabled && s.greyed && s.title === reasonFr && s.tab === -1;
      const pass = greyed(out.cond) && out.condAfter === 'conditionalText:Xx|paragraph:Yy' && greyed(out.marker) && greyed(out.header) && !out.back.disabled
        && reasonFr !== reasonEn && /^Only for blocks/.test(reasonEn) && labelEn === 'At the bottom of the page';
      return { pass, notes: JSON.stringify(out) };
    },
  });

  // === 2) L'éditeur et la Lecture : le bloc se pose au bas de la page ==========================================================================================================
  const intro = n => Array.from({ length: n }, (_, i) => '<p>Introduction ' + i + '</p>').join('');
  const H = 400; // la hauteur utile de la page des essais : vingt lignes de 20 px
  const zoomOf = el => {
    const sheet = el.closest('.v2-page-sheet, .reader-content');
    const z = sheet ? parseFloat(getComputedStyle(sheet).zoom) : NaN;
    return (isFinite(z) && z > 0) ? z : 1;
  };
  function setPageContentHeight(contentPx) {
    const halfMm = (PageLayout.getPageSizePx().height - contentPx) / 2 / PageLayout.MM_TO_PX;
    PageLayout.setMarginsMm({ top: halfMm, bottom: halfMm, left: PageLayout.DEFAULT_MARGIN_MM, right: PageLayout.DEFAULT_MARGIN_MM });
  }
  function restoreLayout() {
    PageLayout.setMarginsMm(null);
    ['editor-container', 'reader-container'].forEach(id => document.getElementById(id).style.removeProperty('--pp-fit-zoom'));
    document.getElementById('reader-container').style.display = '';
    document.getElementById('editor-container').style.display = '';
  }
  // Ce que la page montre : les blocs de premier niveau (texte, haut et bas en pixels de mise en page depuis le haut de la feuille, décalage `transform`), les bandes de saut de page (haut) et le
  // nombre de pages.
  function readPage(root, containerSelector) {
    const z = zoomOf(root);
    const rect = root.getBoundingClientRect();
    const px = v => Math.round(v / z * 100) / 100;
    const blocks = Array.from(root.children).filter(k => k.tagName !== 'STYLE').map(k => {
      const r = k.getBoundingClientRect();
      const m = /matrix\([^)]*,\s*([-\d.]+)\)$/.exec(getComputedStyle(k).transform);
      return { text: k.textContent.trim().slice(0, 16), top: px(r.top - rect.top), bottom: px(r.bottom - rect.top), shift: m ? parseFloat(m[1]) : 0 };
    });
    const bands = Array.from(document.querySelectorAll(containerSelector + ' .v2-page-band')).map(b => px(b.getBoundingClientRect().top - rect.top));
    return { blocks, bands };
  }
  const blockOf = (page, text) => page.blocks.find(b => b.text.indexOf(text) === 0);
  // Charge `html` dans l'éditeur paginé à la hauteur utile `H`, lit l'éditeur puis la Lecture du même HTML.
  async function bothPages(h, html) {
    await h.resetEditor();
    h.setA4Preview(true);
    PageLayout.setMarginsMm(null);
    Editor.setHTML(html);
    await sleep(450);
    const saved = Editor.getHTML();
    setPageContentHeight(H);
    Editor.refreshPaginationPreview();
    await sleep(450);
    const editor = readPage(h.tiptap(), '#editor-container');
    editor.bodyTops = HeaderFooterPreview.pageBodyTops();
    const wrapper = await h.renderReaderMode(saved);
    await sleep(450);
    const reader = readPage(wrapper, '#reader-container');
    return { editor, reader, unchanged: Editor.getHTML() === saved };
  }
  // Le bas du bloc `text` est-il au bas du corps de la page `k` (rang depuis 0), à un pixel près ? Éditeur : le haut du corps lu sur la pagination ; Lecture : la bande qui suit la page (sa dernière : la
  // même place que l'éditeur, les deux se lisent l'un l'autre).
  const atBottom = (res, text, k) => {
    const want = res.editor.bodyTops[k] + H;
    const e = blockOf(res.editor, text);
    const r = blockOf(res.reader, text);
    return Math.abs(e.bottom - want) <= 1 && Math.abs(r.bottom - want) <= 1;
  };

  // Deux blocs de la même suite se touchent (le bas du premier est le haut du second, à un pixel près) : elle se cale d'un seul tenant.
  const stacked = (res, first, second) => ['editor', 'reader'].every(k => Math.abs(blockOf(res[k], first).bottom - blockOf(res[k], second).top) <= 1);

  cases.push({
    id: 'bottomanchor_editor_and_reader_put_the_block_at_the_foot_of_the_page_whatever_the_length_of_the_text_above',
    description: 'Éditeur et Lecture : une signature calée tombe au bas du corps de la page, que le texte au-dessus fasse deux, huit ou quinze lignes ; une seule page (aucune coupure) ; le HTML enregistré ne change pas',
    run: async (h) => {
      try {
        const out = {};
        for (const n of [2, 8, 15]) {
          const res = await bothPages(h, intro(n) + ANCHOR('Signature'));
          out['n' + n] = { editorBands: res.editor.bands.length, readerBands: res.reader.bands.length, bottom: atBottom(res, 'Signature', 0), shift: blockOf(res.editor, 'Signature').shift, unchanged: res.unchanged };
        }
        const pass = [2, 8, 15].every(n => out['n' + n].editorBands === 0 && out['n' + n].readerBands === 0 && out['n' + n].bottom && out['n' + n].shift > 0 && out['n' + n].unchanged);
        return { pass, notes: JSON.stringify(out) };
      } finally { restoreLayout(); }
    },
  });

  cases.push({
    id: 'bottomanchor_editor_and_reader_move_a_run_that_does_not_fit_to_the_foot_of_the_next_page',
    description: 'Éditeur et Lecture : le texte remplit la page à une ligne près et la suite calée (deux paragraphes) ne tient pas dans la place restante : elle ouvre la page 2 et s\'y cale au bas, la page 1 s\'arrête sur la dernière ligne du texte ; quand elle tient, elle reste sur la page 1',
    run: async (h) => {
      try {
        const tight = await bothPages(h, intro(19) + ANCHOR('Fait à X') + ANCHOR('Signature'));
        const fits = await bothPages(h, intro(18) + ANCHOR('Fait à X') + ANCHOR('Signature'));
        const out = {
          tight: { bands: [tight.editor.bands.length, tight.reader.bands.length], atBottom: atBottom(tight, 'Signature', 1) && stacked(tight, 'Fait à X', 'Signature'), lastIntroOnPage1: blockOf(tight.editor, 'Introduction 18').bottom <= tight.editor.bands[0] },
          fits: { bands: [fits.editor.bands.length, fits.reader.bands.length], atBottom: atBottom(fits, 'Signature', 0) && stacked(fits, 'Fait à X', 'Signature') },
        };
        const pass = out.tight.bands[0] === 1 && out.tight.bands[1] === 1 && out.tight.atBottom && out.tight.lastIntroOnPage1 && out.fits.bands[0] === 0 && out.fits.bands[1] === 0 && out.fits.atBottom;
        return { pass, notes: JSON.stringify(out) };
      } finally { restoreLayout(); }
    },
  });

  cases.push({
    id: 'bottomanchor_editor_and_reader_start_what_follows_the_run_on_the_next_page',
    description: 'Éditeur et Lecture : le texte qui suit une suite calée repart en haut de la page d\'après (l\'ordre de lecture ne change pas) ; avec un saut de page posé à la main derrière la suite, il referme la page lui-même : pas de page blanche',
    run: async (h) => {
      try {
        const plain = await bothPages(h, intro(4) + ANCHOR('Signature') + '<p>Après</p>');
        const manual = await bothPages(h, intro(4) + ANCHOR('Signature') + PAGE_BREAK + '<p>Suite</p>');
        const out = {
          plain: { bands: [plain.editor.bands.length, plain.reader.bands.length], atBottom: atBottom(plain, 'Signature', 0), apresOnPage2: blockOf(plain.editor, 'Après').top >= plain.editor.bands[0] && blockOf(plain.reader, 'Après').top >= plain.reader.bands[0] },
          manual: { bands: [manual.editor.bands.length, manual.reader.bands.length], atBottom: atBottom(manual, 'Signature', 0), suiteOnPage2: blockOf(manual.editor, 'Suite').top >= manual.editor.bands[0] && blockOf(manual.reader, 'Suite').top >= manual.reader.bands[0] },
        };
        const pass = out.plain.bands[0] === 1 && out.plain.bands[1] === 1 && out.plain.atBottom && out.plain.apresOnPage2
          && out.manual.bands[0] === 1 && out.manual.bands[1] === 1 && out.manual.atBottom && out.manual.suiteOnPage2;
        return { pass, notes: JSON.stringify(out) };
      } finally { restoreLayout(); }
    },
  });

  cases.push({
    id: 'bottomanchor_editor_and_reader_lay_a_run_taller_than_a_page_out_like_the_rest_of_the_text_and_change_nothing_without_the_setting',
    description: 'Éditeur et Lecture : une suite plus haute qu\'une page ne se cale pas (aucun décalage, elle se range comme le texte) ; le même texte sans le réglage n\'a aucun décalage, aucune marque dans le DOM et les mêmes pages que sans la fonction',
    run: async (h) => {
      try {
        const tall = Array.from({ length: 24 }, (_, i) => ANCHOR('Ligne ' + i)).join('');
        const tallRes = await bothPages(h, '<p>Avant</p>' + tall);
        const base = intro(8) + '<p>Signature</p>';
        const without = await bothPages(h, base);
        const marks = document.querySelectorAll('#editor-container [data-bottom-anchor], #reader-container [data-bottom-anchor]').length;
        const natural = blockOf(without.editor, 'Signature');
        const out = {
          tall: { shifts: tallRes.editor.blocks.concat(tallRes.reader.blocks).filter(b => b.shift !== 0).length, bands: [tallRes.editor.bands.length, tallRes.reader.bands.length] },
          without: { shifts: without.editor.blocks.concat(without.reader.blocks).filter(b => b.shift !== 0).length, marks, bands: without.editor.bands.length, naturalBottom: natural.bottom, wantNatural: without.editor.bodyTops[0] + 9 * 20 },
        };
        const pass = out.tall.shifts === 0 && out.tall.bands[0] >= 1 && out.tall.bands[0] === out.tall.bands[1] && out.without.shifts === 0 && out.without.marks === 0 && out.without.bands === 0 && Math.abs(out.without.naturalBottom - out.without.wantNatural) <= 2;
        return { pass, notes: JSON.stringify(out) };
      } finally { restoreLayout(); }
    },
  });

  cases.push({
    id: 'bottomanchor_editor_and_reader_put_a_signature_zone_a_table_and_a_callout_at_the_foot_of_the_page',
    description: 'Éditeur et Lecture : le bloc de signature (zone 2 colonnes), un tableau et un encadré calés tombent au bas de la page, comme un paragraphe ; une suite faite d\'un paragraphe puis d\'une zone se cale d\'un seul tenant',
    run: async (h) => {
      try {
        const out = {};
        const zone = await bothPages(h, intro(3) + ANCHOR('Fait à X') + withAnchor(ZONE));
        out.zone = { bands: [zone.editor.bands.length, zone.reader.bands.length], bottom: zone.editor.blocks.find(b => b.text.indexOf('Nom et signa') === 0).bottom + 0, want: zone.editor.bodyTops[0] + H, reader: zone.reader.blocks.find(b => b.text.indexOf('Nom et signa') === 0).bottom };
        const table = await bothPages(h, intro(3) + withAnchor(TABLE));
        out.table = { bottom: blockOf(table.editor, 'Total').bottom, reader: blockOf(table.reader, 'Total').bottom, want: table.editor.bodyTops[0] + H };
        const callout = await bothPages(h, intro(3) + withAnchor(CALLOUT));
        out.callout = { bottom: blockOf(callout.editor, 'Note').bottom, reader: blockOf(callout.reader, 'Note').bottom, want: callout.editor.bodyTops[0] + H };
        const near = (a, b) => Math.abs(a - b) <= 1;
        const pass = out.zone.bands[0] === 0 && out.zone.bands[1] === 0 && near(out.zone.bottom, out.zone.want) && near(out.zone.reader, out.zone.want)
          && near(out.table.bottom, out.table.want) && near(out.table.reader, out.table.want) && near(out.callout.bottom, out.callout.want) && near(out.callout.reader, out.callout.want);
        return { pass, notes: JSON.stringify(out) };
      } finally { restoreLayout(); }
    },
  });

  // === 3) Les exports ===================================================================================================================================================
  // --- PDF : lu par pdf.js (pdfmake est déterministe : la place du bas se lit à la base des lignes) ---
  const PDF_MARGIN_PT = 28;
  async function pdfOf(h, html) {
    const result = await h.exportPdfContent(html, null, { top: PDF_MARGIN_PT, right: PDF_MARGIN_PT, bottom: PDF_MARGIN_PT, left: PDF_MARGIN_PT });
    return h.extractPdfGroundTruth(result.base64);
  }
  const introPdf = n => Array.from({ length: n }, (_, i) => '<p>INTRO' + String(i).padStart(2, '0') + '</p>').join('');
  const pageOfStr = (gt, str) => { let found = -1; gt.pages.forEach((page, p) => page.textItems.forEach((it) => { if (found < 0 && it.str === str) found = p; })); return found; };
  const yOfStr = (gt, str) => { let found = null; gt.pages.forEach((page) => page.textItems.forEach((it) => { if (found == null && it.str === str) found = it.y; })); return found; };
  const blankPages = gt => gt.pages.filter(pg => !pg.textItems.length && !pg.images.length).length;
  // Le bas du corps de la page, en pt depuis le haut : la base d'une ligne y est au plus ce bas, et à quelques points seulement quand elle est calée en bas.
  const pdfBottom = gt => gt.pages[0].height - PDF_MARGIN_PT;
  async function pdfLinePitch(h) {
    const gt = await pdfOf(h, introPdf(10));
    return { pitch: (yOfStr(gt, 'INTRO09') - yOfStr(gt, 'INTRO00')) / 9, first: yOfStr(gt, 'INTRO00'), bottom: pdfBottom(gt) };
  }

  cases.push({
    id: 'bottomanchor_pdf_puts_the_block_at_the_foot_of_the_page_whatever_the_length_of_the_text_above',
    description: 'PDF (lu par pdf.js) : une signature calée tombe au bas du corps de la page, à la même place, que le texte au-dessus fasse deux, huit ou vingt lignes ; une seule page, aucune page blanche ; sans le réglage, la même signature suit le texte',
    run: async (h) => {
      await h.resetEditor();
      const out = {};
      let bottom = null;
      for (const n of [2, 8, 20]) {
        const gt = await pdfOf(h, introPdf(n) + ANCHOR('SIGNATURE'));
        bottom = pdfBottom(gt);
        out['n' + n] = { pages: gt.pages.length, blank: blankPages(gt), y: yOfStr(gt, 'SIGNATURE') };
      }
      const plain = await pdfOf(h, introPdf(8) + '<p>SIGNATURE</p>');
      out.plainY = yOfStr(plain, 'SIGNATURE');
      out.bottom = bottom;
      const ys = [2, 8, 20].map(n => out['n' + n].y);
      const pass = [2, 8, 20].every(n => out['n' + n].pages === 1 && out['n' + n].blank === 0) && Math.max.apply(null, ys) - Math.min.apply(null, ys) <= 1
        && ys[0] <= bottom && bottom - ys[0] <= 6 && out.plainY < bottom - 100;
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'bottomanchor_pdf_moves_a_run_that_does_not_fit_to_the_foot_of_the_next_page',
    description: 'PDF (lu par pdf.js) : quand la suite calée (deux paragraphes) ne tient pas dans la place restante, elle ouvre la page 2 et s\'y cale au bas ; quand elle tient, elle reste sur la page 1 ; les deux paragraphes ne se séparent jamais ; aucune page blanche, aucune ligne perdue',
    run: async (h) => {
      await h.resetEditor();
      const { pitch, bottom } = await pdfLinePitch(h);
      const capacity = Math.floor((bottom - PDF_MARGIN_PT) / pitch);
      const out = [];
      for (let n = capacity - 6; n <= capacity; n++) {
        const gt = await pdfOf(h, introPdf(n) + ANCHOR('FAIT1') + ANCHOR('SIGNATURE'));
        out.push({ n, pages: gt.pages.length, blank: blankPages(gt), pageFait: pageOfStr(gt, 'FAIT1'), pageSig: pageOfStr(gt, 'SIGNATURE'), y: yOfStr(gt, 'SIGNATURE'), lastIntro: pageOfStr(gt, 'INTRO' + String(n - 1).padStart(2, '0')) });
      }
      const together = out.every(o => o.pageFait === o.pageSig && o.pageSig >= 0);
      const atBottom = out.every(o => o.y <= bottom && bottom - o.y <= 6);
      const onFirst = out.filter(o => o.pageSig === 0).length;
      const onSecond = out.filter(o => o.pageSig === 1).length;
      const clean = out.every(o => o.blank === 0 && o.pages <= 2);
      const keepsText = out.every(o => o.lastIntro >= 0);
      return { pass: together && atBottom && onFirst >= 1 && onSecond >= 1 && clean && keepsText, notes: JSON.stringify({ pitch, bottom, capacity, together, atBottom, onFirst, onSecond, clean, keepsText, out }) };
    },
  });

  cases.push({
    id: 'bottomanchor_pdf_starts_what_follows_the_run_on_the_next_page_and_makes_no_blank_page_before_a_manual_page_break',
    description: 'PDF (lu par pdf.js) : le texte qui suit une suite calée repart en haut de la page 2 ; avec un saut de page posé à la main derrière la suite, il referme la page lui-même : deux pages, pas de page blanche ; une suite à la fin du texte ne crée pas de page de plus',
    run: async (h) => {
      await h.resetEditor();
      const plain = await pdfOf(h, introPdf(4) + ANCHOR('SIGNATURE') + '<p>APRES</p>');
      const manual = await pdfOf(h, introPdf(4) + ANCHOR('SIGNATURE') + PAGE_BREAK + '<p>SUITE</p>');
      const tail = await pdfOf(h, introPdf(4) + ANCHOR('SIGNATURE'));
      const out = {
        plain: { pages: plain.pages.length, blank: blankPages(plain), sig: pageOfStr(plain, 'SIGNATURE'), apres: pageOfStr(plain, 'APRES'), apresY: yOfStr(plain, 'APRES'), sigY: yOfStr(plain, 'SIGNATURE') },
        manual: { pages: manual.pages.length, blank: blankPages(manual), sig: pageOfStr(manual, 'SIGNATURE'), suite: pageOfStr(manual, 'SUITE') },
        tail: { pages: tail.pages.length },
      };
      const pass = out.plain.pages === 2 && out.plain.blank === 0 && out.plain.sig === 0 && out.plain.apres === 1 && out.plain.apresY < PDF_MARGIN_PT + 40
        && out.manual.pages === 2 && out.manual.blank === 0 && out.manual.sig === 0 && out.manual.suite === 1 && out.tail.pages === 1;
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'bottomanchor_pdf_lays_a_run_taller_than_a_page_out_like_the_rest_of_the_text',
    description: 'PDF (lu par pdf.js) : une suite plus haute qu\'une page ne se cale pas : elle suit « AVANT » sans trou, passe d\'une page à l\'autre comme le texte, et ce qui la suit n\'ouvre pas de page de plus ; aucune ligne perdue',
    run: async (h) => {
      await h.resetEditor();
      const lines = Array.from({ length: 70 }, (_, i) => ANCHOR('LIGNE' + String(i).padStart(2, '0'))).join('');
      const gt = await pdfOf(h, '<p>AVANT</p>' + lines + '<p>APRES</p>');
      const yAvant = yOfStr(gt, 'AVANT');
      const yFirst = yOfStr(gt, 'LIGNE00');
      const out = { pages: gt.pages.length, blank: blankPages(gt), gap: yFirst - yAvant, last: pageOfStr(gt, 'LIGNE69'), apres: pageOfStr(gt, 'APRES'), lost: lines.length && Array.from({ length: 70 }, (_, i) => pageOfStr(gt, 'LIGNE' + String(i).padStart(2, '0'))).filter(p => p < 0).length };
      const pass = out.pages >= 2 && out.blank === 0 && out.gap > 5 && out.gap < 40 && out.apres === out.last && out.lost === 0;
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'bottomanchor_pdf_puts_a_signature_zone_and_a_table_at_the_foot_of_the_page',
    description: 'PDF (lu par pdf.js) : le bloc de signature (zone 2 colonnes) et un tableau calés tombent au bas du corps de la page, comme un paragraphe ; une seule page',
    run: async (h) => {
      await h.resetEditor();
      const { bottom } = await pdfLinePitch(h);
      const zone = await pdfOf(h, introPdf(3) + withAnchor(ZONE.replace('Nom et signature', 'SIGZONE')));
      const table = await pdfOf(h, introPdf(3) + withAnchor(TABLE));
      const out = { zone: { pages: zone.pages.length, y: yOfStr(zone, 'SIGZONE') }, table: { pages: table.pages.length, y: yOfStr(table, 'Total') }, bottom };
      const near = y => y != null && y <= bottom && bottom - y <= 14;
      const pass = out.zone.pages === 1 && out.table.pages === 1 && near(out.zone.y) && near(out.table.y);
      return { pass, notes: JSON.stringify(out) };
    },
  });

  // --- Word : l'OOXML du .docx généré ---
  const wordTextOf = el => Array.from(el.getElementsByTagName('w:t')).map(t => t.textContent).join('');
  // Les tableaux flottants calés au bas de la zone de texte : leur texte, leurs réglages de position, et les tableaux qu'ils contiennent.
  function floatingTables(doc) {
    return Array.from(doc.getElementsByTagName('w:tbl')).filter(t => t.getElementsByTagName('w:tblpPr').length && t.parentNode.nodeName === 'w:body').map((t) => {
      const pr = t.getElementsByTagName('w:tblpPr')[0];
      return { text: wordTextOf(t), vertAnchor: pr.getAttribute('w:vertAnchor'), ySpec: pr.getAttribute('w:tblpYSpec'), horzAnchor: pr.getAttribute('w:horzAnchor'), nested: t.getElementsByTagName('w:tbl').length, rows: t.getElementsByTagName('w:tr').length };
    });
  }
  // Les enfants directs du corps, un par un : « tbl:texte » pour un tableau, « p:texte » pour un paragraphe (« + » quand il ouvre une page).
  function bodyOutline(doc) {
    return Array.from(doc.getElementsByTagName('w:body')[0].children).filter(n => n.nodeName !== 'w:sectPr').map((n) => {
      const breaks = n.nodeName === 'w:p' && n.getElementsByTagName('w:pageBreakBefore').length > 0;
      return (n.nodeName === 'w:tbl' ? 'tbl:' : 'p:') + wordTextOf(n).slice(0, 12) + (breaks ? '+' : '');
    });
  }

  cases.push({
    id: 'bottomanchor_docx_writes_the_run_as_a_floating_table_at_the_bottom_of_the_text_area_and_opens_the_next_page_after_it',
    description: 'Word (OOXML dézippé) : la suite calée devient un tableau flottant d\'une case (ancré à la marge, au bas, vers la gauche) suivi d\'un paragraphe d\'un point de haut ; le bloc suivant ouvre la page d\'après ; sans le réglage, aucun tableau flottant ni saut',
    run: async (h) => {
      await h.resetEditor();
      const one = await h.exportDocxParts(introPdf(3) + ANCHOR('SIGNATURE') + '<p>APRES</p>');
      const two = await h.exportDocxParts(introPdf(3) + ANCHOR('FAIT1') + ANCHOR('SIGNATURE') + '<p>APRES</p>');
      const last = await h.exportDocxParts(introPdf(3) + ANCHOR('SIGNATURE'));
      const plain = await h.exportDocxParts(introPdf(3) + '<p>SIGNATURE</p><p>APRES</p>');
      const out = { one: floatingTables(one.doc), oneOutline: bodyOutline(one.doc).slice(3), two: floatingTables(two.doc), twoOutline: bodyOutline(two.doc).slice(3), lastOutline: bodyOutline(last.doc).slice(3), plain: floatingTables(plain.doc).length, plainBreaks: bodyOutline(plain.doc).filter(o => /\+$/.test(o)).length };
      const pass = out.one.length === 1 && out.one[0].text === 'SIGNATURE' && out.one[0].vertAnchor === 'margin' && out.one[0].ySpec === 'bottom' && out.one[0].horzAnchor === 'margin' && out.one[0].rows === 1
        && JSON.stringify(out.oneOutline) === JSON.stringify(['tbl:SIGNATURE', 'p:', 'p:APRES+'])
        && out.two.length === 1 && out.two[0].text === 'FAIT1SIGNATURE' && JSON.stringify(out.twoOutline) === JSON.stringify(['tbl:FAIT1SIGNATU', 'p:', 'p:APRES+'])
        && JSON.stringify(out.lastOutline) === JSON.stringify(['tbl:SIGNATURE', 'p:']) && out.plain === 0 && out.plainBreaks === 0;
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'bottomanchor_docx_makes_no_blank_page_before_a_manual_page_break_and_keeps_a_zone_and_a_table_in_the_floating_table',
    description: 'Word (OOXML dézippé) : avec un saut de page posé à la main derrière la suite, une seule coupure (le bloc suivant ouvre la page, pas de page blanche de plus) ; un saut de page AVANT la suite ouvre sa page ; le bloc de signature (zone 2 colonnes) et un tableau calés restent entiers dans la case (tableaux emboîtés), la case ne finit pas par un tableau',
    run: async (h) => {
      await h.resetEditor();
      const manual = await h.exportDocxParts(introPdf(2) + ANCHOR('SIGNATURE') + PAGE_BREAK + '<p>SUITE</p>');
      const before = await h.exportDocxParts(introPdf(2) + PAGE_BREAK + ANCHOR('SIGNATURE') + '<p>APRES</p>');
      const zone = await h.exportDocxParts(introPdf(2) + ANCHOR('Fait à X') + withAnchor(ZONE.replace('Nom et signature', 'SIGZONE')));
      const table = await h.exportDocxParts(introPdf(2) + withAnchor(TABLE));
      const lastIsParagraph = doc => { const cell = doc.getElementsByTagName('w:tbl')[0]; const tc = cell.getElementsByTagName('w:tc')[0]; return tc.lastElementChild.nodeName === 'w:p'; };
      const out = {
        manualOutline: bodyOutline(manual.doc).slice(2), beforeOutline: bodyOutline(before.doc).slice(2),
        zone: floatingTables(zone.doc), zoneEnd: bodyOutline(zone.doc).slice(2),
        table: floatingTables(table.doc), tableEnd: bodyOutline(table.doc).slice(2),
      };
      const floating = doc => Array.from(doc.getElementsByTagName('w:tbl')).filter(t => t.getElementsByTagName('w:tblpPr').length);
      const cellsEndWithParagraph = [zone, table].every(x => floating(x.doc).every(t => t.getElementsByTagName('w:tc')[0].lastElementChild.nodeName === 'w:p'));
      out.cellsEndWithParagraph = cellsEndWithParagraph;
      const pass = JSON.stringify(out.manualOutline.slice(0, 3)) === JSON.stringify(['tbl:SIGNATURE', 'p:', 'p:SUITE+']) && out.manualOutline.length === 3
        && out.beforeOutline.some(o => /^p:\+$/.test(o)) && out.beforeOutline.filter(o => /\+$/.test(o)).length === 2
        && out.zone.length === 1 && out.zone[0].nested === 1 && out.zone[0].text.indexOf('SIGZONE') !== -1 && out.zone[0].text.indexOf('Fait à X') !== -1
        && out.table.length === 1 && out.table[0].nested === 1 && cellsEndWithParagraph;
      return { pass, notes: JSON.stringify(out) };
    },
  });

  // --- ODT : le content.xml du .odt généré ---
  async function odtContent(html) {
    await ExportEngines.ensure(['odtExport']);
    const built = await OdtExport.build(html, { margins: { top: 20, right: 20, bottom: 20, left: 20, orientation: 'portrait', format: 'A4' } });
    const zip = await JSZip.loadAsync(await built.blob.arrayBuffer());
    const xml = new DOMParser().parseFromString(await zip.file('content.xml').async('string'), 'application/xml');
    return xml;
  }
  const odtBody = xml => Array.from(xml.getElementsByTagName('office:text')[0].children);
  const odtText = el => Array.from(el.getElementsByTagName('text:p')).concat(el.nodeName === 'text:p' ? [el] : []).map(p => p.textContent).join('');
  // Le style automatique d'un nom donné (paragraphe ou cadre) : ses réglages en une ligne.
  const odtStyle = (xml, name) => { const el = Array.from(xml.getElementsByTagName('style:style')).find(st => st.getAttribute('style:name') === name); return el ? Array.from(el.children).map(c => Array.from(c.attributes).map(a => a.name + '=' + a.value).join(' ')).join(' | ') : ''; };
  const odtOutline = xml => odtBody(xml).filter(n => n.nodeName !== 'text:sequence-decls').map((n) => {
    const frame = n.getElementsByTagName('draw:frame')[0];
    const own = n.nodeName === 'text:p' ? odtStyle(xml, n.getAttribute('text:style-name')) : '';
    return (frame ? 'frame:' + frame.textContent.slice(0, 14) : 'p:' + n.textContent.slice(0, 8)) + (/fo:break-before=page/.test(own) ? '+' : '');
  });

  cases.push({
    id: 'bottomanchor_odt_writes_the_run_as_a_text_frame_at_the_bottom_of_the_text_area_and_opens_the_next_page_after_it',
    description: 'ODT (content.xml dézippé) : la suite calée devient un cadre de texte ancré au paragraphe (calé en bas de la zone de texte, sans texte à côté, de la largeur du texte) ; le bloc suivant ouvre la page d\'après ; un saut posé à la main derrière la suite ne fait pas de coupure de plus ; un saut avant la suite est porté par le paragraphe d\'ancrage ; sans le réglage, aucun cadre',
    run: async (h) => {
      await h.resetEditor();
      const one = await odtContent(introPdf(3) + ANCHOR('SIGNATURE') + '<p>APRES</p>');
      const two = await odtContent(introPdf(3) + ANCHOR('FAIT1') + ANCHOR('SIGNATURE') + '<p>APRES</p>');
      const last = await odtContent(introPdf(3) + ANCHOR('SIGNATURE'));
      const manual = await odtContent(introPdf(2) + ANCHOR('SIGNATURE') + PAGE_BREAK + '<p>SUITE</p>');
      const before = await odtContent(introPdf(2) + PAGE_BREAK + ANCHOR('SIGNATURE') + '<p>APRES</p>');
      const zone = await odtContent(introPdf(2) + withAnchor(ZONE.replace('Nom et signature', 'SIGZONE')));
      const table = await odtContent(introPdf(2) + withAnchor(TABLE));
      const plain = await odtContent(introPdf(3) + '<p>SIGNATURE</p><p>APRES</p>');
      const frameOf = xml => { const f = xml.getElementsByTagName('draw:frame')[0]; return f ? { anchor: f.getAttribute('text:anchor-type'), width: f.getAttribute('svg:width'), style: odtStyle(xml, f.getAttribute('draw:style-name')), hasBox: f.getElementsByTagName('draw:text-box').length === 1 } : null; };
      const out = {
        one: odtOutline(one).slice(3), two: odtOutline(two).slice(3), last: odtOutline(last).slice(3), manual: odtOutline(manual).slice(2), before: odtOutline(before).slice(2),
        frame: frameOf(one), plain: plain.getElementsByTagName('draw:frame').length, plainBreaks: odtOutline(plain).filter(o => /\+$/.test(o)).length,
        zoneInFrame: odtText(zone.getElementsByTagName('draw:frame')[0] || zone.documentElement).indexOf('SIGZONE') !== -1,
        tableInFrame: !!table.getElementsByTagName('draw:frame')[0] && table.getElementsByTagName('draw:frame')[0].getElementsByTagName('table:table').length === 1,
      };
      const f = out.frame || {};
      const pass = JSON.stringify(out.one) === JSON.stringify(['frame:SIGNATURE', 'p:APRES+']) && JSON.stringify(out.two) === JSON.stringify(['frame:FAIT1SIGNATURE', 'p:APRES+']) && JSON.stringify(out.last) === JSON.stringify(['frame:SIGNATURE'])
        && JSON.stringify(out.manual) === JSON.stringify(['frame:SIGNATURE', 'p:SUITE+']) && JSON.stringify(out.before) === JSON.stringify(['frame:SIGNATURE+', 'p:APRES+'])
        && f.anchor === 'paragraph' && f.hasBox && /vertical-pos=bottom/.test(f.style) && /vertical-rel=page-content/.test(f.style) && /wrap=none/.test(f.style) && /^[\d.]+cm$/.test(f.width)
        && out.plain === 0 && out.plainBreaks === 0 && out.zoneInFrame && out.tableInFrame;
      return { pass, notes: JSON.stringify(out) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.bottomAnchor = cases;
})();
