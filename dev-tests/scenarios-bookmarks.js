// Suite "bookmarks" - les signets et les liens qui y mènent (demande d'Antoine, 2026-10-19 : « feature d'ajout de signet cliquable et référençable »). Un signet est un nom posé sur un
// paragraphe ou un titre du premier niveau (js/anchors.js) ; un lien « Dans ce document » (js/link-dialog.js) y mène depuis n'importe quel texte. Quatre moitiés :
//  1) le MODÈLE : l'adresse tirée du nom, un signet posé, renommé (les liens suivent), retiré ; la normalisation (un signet qui n'a pas de place, un doublon) ; le drapeau de l'éditeur,
//     qui n'est pas du contenu et ne décale rien ;
//  2) les FENÊTRES : la ligne « Signet… » du menu (grisée avec sa raison, jamais retirée), la fenêtre du signet, le choix « Dans ce document » de la fenêtre « Lien… » (titres et signets) ;
//  3) la LECTURE et l'impression par le navigateur ;
//  4) les EXPORTS, lus sur la sortie réelle : PDF (destinations nommées et annotations lues par pdf.js), Word (OOXML dézippé), HTML, Markdown (et sa relecture), e-mail (texte seul).
// Le vrai geste (survol, clic, Ctrl+clic, 700x400, clair et sombre) est dans dev-tests/verify-bookmarks-mouse.mjs : une page.evaluate ne déclenche ni un survol ni un geste « trusted ».
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const ed = () => EditorCore.getEditor();
  const byId = id => document.getElementById(id);
  const parse = html => new DOMParser().parseFromString(html, 'text/html').body;
  const BREAK = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };

  // --- L'éditeur : positions, sélection, fenêtres ---
  const blockPos = index => { let found = -1; ed().state.doc.forEach((node, pos, i) => { if (i === index) found = pos; }); return found; };
  // La première occurrence de `text` : { from, to }, ou une erreur claire.
  function rangeOf(text) {
    let found = null;
    ed().state.doc.descendants((node, pos) => {
      if (found || !node.isText) return;
      const i = node.text.indexOf(text);
      if (i >= 0) found = { from: pos + i, to: pos + i + text.length };
    });
    if (!found) throw new Error('texte introuvable dans l\'éditeur : ' + text);
    return found;
  }
  async function selectText(text) {
    ed().chain().focus().setTextSelection(rangeOf(text)).run();
    await sleep(120);
  }
  async function caretIn(text) {
    ed().chain().focus().setTextSelection(rangeOf(text).from + 1).run();
    await sleep(120);
  }
  async function setDoc(html) {
    Editor.setHTML(html);
    await sleep(150);
  }
  const blocks = () => Array.from(parse(Editor.getHTML()).children);
  const windowOpen = id => { const m = byId(id); return !!m && m.style.display !== 'none'; };
  async function closeWindows() {
    ['pp-bookmark-modal', 'pp-link-modal'].forEach(id => {
      if (!windowOpen(id)) return;
      Array.from(byId(id).querySelectorAll('.var-modal-actions button')).find(b => !b.classList.contains('var-modal-primary') && !b.classList.contains('var-modal-danger')).click();
    });
    await sleep(80);
  }
  const buttons = id => Array.from(byId(id).querySelectorAll('.var-modal-actions button'));
  const okOf = id => buttons(id).find(b => b.classList.contains('var-modal-primary'));
  const removeOf = id => buttons(id).find(b => b.classList.contains('var-modal-danger'));
  const typeInto = (input, value) => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); };
  const pressCtrlK = () => { const ev = new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', ctrlKey: true, bubbles: true, cancelable: true }); ed().view.dom.dispatchEvent(ev); return ev.defaultPrevented; };
  const row = () => byId('v2-row-bookmark');
  const syncRow = async () => { MainToolbar.syncToolbarState(); await sleep(60); };

  // === 1) Le modèle ===========================================================================================================================================================

  cases.push({
    id: 'bm_address_comes_from_the_name_without_accents_or_spaces',
    description: 'L\'adresse d\'un signet est tirée de son nom : sans accents, en minuscules, un tiret entre deux mots (« Été 2024 » -> « ete-2024 », « œuvre » -> « oeuvre »), jamais vide (« 日本 » -> « signet »), au plus 60 signes ; un doublon prend « -2 », « -3 »...',
    run: async () => {
      const got = {
        accents: Anchors.slugify('Conditions générales'), year: Anchors.slugify('Été 2024'), ligature: Anchors.slugify('Œuvre & Æther'), symbols: Anchors.slugify('  -- Prix (€) --  '),
        empty: Anchors.slugify('日本'), blank: Anchors.slugify(''), long: Anchors.slugify('a'.repeat(100)).length,
        second: Anchors.uniqueId('x', id => id === 'x'), third: Anchors.uniqueId('x', id => id === 'x' || id === 'x-2'),
        longSuffix: Anchors.uniqueId('b'.repeat(60), id => id === 'b'.repeat(60)).length,
        name: Anchors.cleanName('  Un   nom  \n long '), nameMax: Anchors.cleanName('x'.repeat(200)).length,
        ids: [Anchors.isId('abc'), Anchors.isId('a-b_c9'), Anchors.isId('-abc'), Anchors.isId('a b'), Anchors.isId('é'), Anchors.isId(''), Anchors.isId(null)],
        hrefs: [Anchors.hrefOf('abc'), Anchors.idOfHref('#abc'), Anchors.idOfHref('https://x.fr/#abc'), Anchors.idOfHref('#'), Anchors.idOfHref('#a b')],
      };
      const pass = got.accents === 'conditions-generales' && got.year === 'ete-2024' && got.ligature === 'oeuvre-aether' && got.symbols === 'prix' && got.empty === 'signet' && got.blank === 'signet' && got.long === 60
        && got.second === 'x-2' && got.third === 'x-3' && got.longSuffix <= 60 && got.name === 'Un nom long' && got.nameMax === 80
        && JSON.stringify(got.ids) === JSON.stringify([true, true, false, false, false, false, false]) && JSON.stringify(got.hrefs) === JSON.stringify(['#abc', 'abc', null, null, null]);
      return { pass, notes: JSON.stringify(got) };
    },
  });

  cases.push({
    id: 'bm_save_places_renames_and_removes_in_one_undoable_step',
    description: 'Poser un signet écrit son nom et son adresse sur le paragraphe ; le renommer change l\'adresse (sauf pour la casse ou les accents) et les liens qui y menaient la suivent ; le retirer enlève le signet et laisse les liens (sans cible) ; chaque geste se défait d\'un seul Annuler',
    run: async (h) => {
      await h.resetEditor();
      await setDoc('<p>Un</p><p>Deux</p><p>Voir <a href="#conditions-generales">ici</a> et <a href="#conditions-generales">là</a></p>');
      const pos = blockPos(1);
      const placed = Anchors.save(ed(), pos, 'Conditions générales');
      const attrsAfterPlace = { id: blocks()[1].getAttribute('data-anchor'), name: blocks()[1].getAttribute('data-anchor-name') };
      const renamed = Anchors.save(ed(), pos, 'Mentions légales');
      const hrefsAfterRename = Array.from(blocks()[2].querySelectorAll('a')).map(a => a.getAttribute('href'));
      const idAfterRename = blocks()[1].getAttribute('data-anchor');
      const recased = Anchors.save(ed(), pos, 'MENTIONS LEGALES');
      const idAfterRecase = blocks()[1].getAttribute('data-anchor');
      const removed = Anchors.save(ed(), pos, '');
      const afterRemove = { id: blocks()[1].getAttribute('data-anchor'), name: blocks()[1].getAttribute('data-anchor-name'), links: blocks()[2].querySelectorAll('a').length };
      ed().commands.undo();
      await sleep(80);
      const afterUndo = blocks()[1].getAttribute('data-anchor');
      ed().commands.undo();
      await sleep(80);
      const afterUndoRecase = blocks()[1].getAttribute('data-name') || blocks()[1].getAttribute('data-anchor-name');
      const pass = placed && placed.id === 'conditions-generales' && placed.name === 'Conditions générales' && attrsAfterPlace.id === 'conditions-generales' && attrsAfterPlace.name === 'Conditions générales'
        && renamed.id === 'mentions-legales' && idAfterRename === 'mentions-legales' && JSON.stringify(hrefsAfterRename) === JSON.stringify(['#mentions-legales', '#mentions-legales'])
        && recased.id === 'mentions-legales' && idAfterRecase === 'mentions-legales'
        && removed.id === null && afterRemove.id === null && afterRemove.name === null && afterRemove.links === 2
        && afterUndo === 'mentions-legales' && afterUndoRecase === 'Mentions légales';
      return { pass, notes: JSON.stringify({ placed, attrsAfterPlace, renamed, hrefsAfterRename, recased, idAfterRecase, removed, afterRemove, afterUndo, afterUndoRecase }) };
    },
  });

  cases.push({
    id: 'bm_two_blocks_never_share_an_address',
    description: 'Un nom que l\'adresse d\'un autre signet a déjà prise reçoit « -2 » ; un signet copié (un doublon d\'adresse) perd la sienne, le premier du document la garde',
    run: async (h) => {
      await h.resetEditor();
      await setDoc('<p>Un</p><p>Deux</p>');
      Anchors.save(ed(), blockPos(0), 'Prix');
      const second = Anchors.save(ed(), blockPos(1), 'prix !');
      await setDoc('<p data-anchor="a" data-anchor-name="A">Un</p><p data-anchor="a" data-anchor-name="A bis">Deux</p><p data-anchor="b" data-anchor-name="B">Trois</p>');
      const got = blocks().map(b => [b.getAttribute('data-anchor'), b.getAttribute('data-anchor-name')]);
      const pass = second && second.id === 'prix-2' && JSON.stringify(got) === JSON.stringify([['a', 'A'], [null, null], ['b', 'B']]);
      return { pass, notes: JSON.stringify({ second, got }) };
    },
  });

  cases.push({
    id: 'bm_a_misplaced_or_unreadable_anchor_is_dropped_and_a_name_alone_gets_an_address',
    description: 'Un signet qui n\'a pas de place (dans une liste, une case de tableau, une légende) ou dont l\'adresse n\'est pas lisible (« a b ») est retiré ; un nom sans adresse (un HTML écrit à la main) en reçoit une, tirée du nom',
    run: async (h) => {
      await h.resetEditor();
      await setDoc('<ul><li><p data-anchor="liste" data-anchor-name="Liste">Dans une liste</p></li></ul>'
        + '<table><tbody><tr><td><p data-anchor="case" data-anchor-name="Case">Dans une case</p></td></tr></tbody></table>'
        + '<p data-anchor="a b" data-anchor-name="">Illisible</p>'
        + '<p data-anchor-name="Sans adresse">Un nom seul</p>'
        + '<h2 data-anchor="titre" data-anchor-name="Un titre">Titre</h2>');
      const tree = Array.from(ed().view.dom.querySelectorAll('[data-anchor], [data-anchor-name]')).map(n => [n.tagName.toLowerCase(), n.getAttribute('data-anchor'), n.getAttribute('data-anchor-name')]);
      const pass = JSON.stringify(tree) === JSON.stringify([['p', 'sans-adresse', 'Sans adresse'], ['h2', 'titre', 'Un titre']]);
      return { pass, notes: JSON.stringify(tree) };
    },
  });

  cases.push({
    id: 'bm_enter_in_an_anchored_block_does_not_copy_the_bookmark',
    description: 'Entrée au milieu d\'un paragraphe qui porte un signet ouvre un bloc sans signet : un signet est un endroit, il ne se propage pas à ce qu\'on écrit ensuite',
    run: async (h) => {
      await h.resetEditor();
      await setDoc('<p data-anchor="a" data-anchor-name="A">Bonjour le monde</p>');
      await caretIn('le monde');
      ed().commands.splitBlock();
      await sleep(100);
      const got = blocks().map(b => [b.textContent, b.getAttribute('data-anchor')]);
      const pass = got.length === 2 && got[0][1] === 'a' && got[1][1] === null && got[0][0] + got[1][0] === 'Bonjour le monde';
      return { pass, notes: JSON.stringify(got) };
    },
  });

  cases.push({
    id: 'bm_the_flag_is_an_editor_mark_only_and_moves_nothing',
    description: 'Le drapeau d\'un signet est un repère de l\'éditeur seulement (une décoration : rien dans le HTML du document, la Lecture ni les exports) qui ne décale rien (le bloc a la même hauteur et le suivant la même place qu\'avec un paragraphe sans signet) ; sa bulle donne le nom ; le drapeau est caché des lecteurs d\'écran',
    run: async (h) => {
      await h.resetEditor();
      await setDoc('<p data-anchor="a" data-anchor-name="Mon signet">Une ligne de texte</p><p>Une ligne de texte</p><p>Suite</p>');
      const flags = Array.from(ed().view.dom.querySelectorAll('.pp-anchor-flag'));
      const [a, b, c] = Array.from(ed().view.dom.children).map(n => n.getBoundingClientRect());
      const flag = flags[0];
      const flagBox = flag && flag.getBoundingClientRect();
      const got = {
        count: flags.length, inFirst: !!flag && flag.parentElement === ed().view.dom.children[0], title: flag && flag.title, hidden: flag && flag.getAttribute('aria-hidden'),
        html: Editor.getHTML().includes('pp-anchor-flag'), sameHeight: Math.abs(a.height - b.height) < 0.5, nextAt: Math.abs((b.top - a.top) - a.height) < 0.5 && Math.abs((c.top - b.top) - b.height) < 0.5,
        outside: !!flagBox && flagBox.right <= a.left + 0.5, visible: !!flagBox && flagBox.width > 4 && flagBox.height > 4,
      };
      const pass = got.count === 1 && got.inFirst && got.title === (I18n.getLang() === 'en' ? 'Bookmark: Mon signet' : 'Signet : Mon signet') && got.hidden === 'true' && !got.html && got.sameHeight && got.nextAt && got.outside && got.visible;
      return { pass, notes: JSON.stringify(got) };
    },
  });

  // === 2) Les fenêtres ========================================================================================================================================================

  const rowCase = {
    id: 'bm_menu_row_follows_the_selection_and_is_greyed_not_removed',
    description: 'La ligne « Signet… » est la deuxième du menu chaîne, avec son icône ; elle se lit « Modifier le signet… » et s\'allume dans un bloc qui porte un signet ; elle est grisée (aria-disabled, classe des lignes grisées, raison en info-bulle, hors de l\'ordre du clavier) dans un tableau, une liste, un encadré et un en-tête, jamais retirée',
    run: async (h) => {
      const en = I18n.getLang() === 'en';
      await h.resetEditor();
      await setDoc('<p>Un paragraphe</p><p data-anchor="ici" data-anchor-name="Ici">Avec signet</p><table><tbody><tr><td><p>Case</p></td></tr></tbody></table><ul><li><p>Puce</p></li></ul>');
      const flyoutRows = Array.from(byId('v2-blocks-flyout').querySelectorAll('.v2-menu-row')).map(r => r.id);
      const state = () => ({ label: row().textContent.trim(), disabled: row().getAttribute('aria-disabled'), grey: row().classList.contains('v2-hover-row-disabled'), active: row().classList.contains('is-active'), title: row().title, tab: row().tabIndex, aria: row().getAttribute('aria-label') });
      await caretIn('Un paragraphe');
      await syncRow();
      const plain = state();
      await caretIn('Avec signet');
      await syncRow();
      const named = state();
      await caretIn('Case');
      await syncRow();
      const inTable = state();
      await caretIn('Puce');
      await syncRow();
      const inList = state();
      await setDoc('<p>Un paragraphe</p>');
      await caretIn('Un paragraphe');
      await syncRow();
      const back = state();
      const icon = !!row().querySelector('.v2-menu-row-icon svg');
      const want = en
        ? { row: 'Bookmark…', edit: 'Edit bookmark…', aria: 'Place a bookmark on this paragraph or heading', ariaEdit: 'Edit the bookmark of this paragraph or heading' }
        : { row: 'Signet…', edit: 'Modifier le signet…', aria: 'Poser un signet sur ce paragraphe ou ce titre', ariaEdit: 'Modifier le signet de ce paragraphe ou de ce titre' };
      const reason = I18n.t('bookmark.notHere');
      const pass = flyoutRows[0] === 'v2-row-link' && flyoutRows[1] === 'v2-row-bookmark' && icon
        && plain.label === want.row && plain.disabled === 'false' && !plain.grey && !plain.active && plain.title === '' && plain.tab === 0 && plain.aria === want.aria
        && named.label === want.edit && named.active && named.disabled === 'false' && named.aria === want.ariaEdit
        && [inTable, inList].every(s => s.disabled === 'true' && s.grey && s.title === reason && s.tab === -1 && !s.active) && reason.length > 20
        && back.label === want.row && back.disabled === 'false';
      return { pass, notes: JSON.stringify({ flyoutRows, plain, named, inTable, inList, back, icon, reason }) };
    },
  };
  cases.push(rowCase);
  cases.push(Object.assign({}, rowCase, {
    id: 'bm_menu_row_follows_the_selection_and_is_greyed_not_removed_in_english',
    lang: 'en',
    description: 'Page qui démarre en anglais : la ligne « Bookmark… » du menu se lit « Edit bookmark… » sur un signet et se grise dans un tableau ou une liste avec sa raison en anglais',
  }));

  cases.push({
    id: 'bm_menu_row_is_greyed_in_a_header_or_footer_and_in_an_email_template',
    description: 'Dans un en-tête ou un pied de page et dans un modèle d\'e-mail (du texte brut), la ligne « Signet… » est grisée avec sa raison, et la fenêtre ne s\'ouvre pas',
    run: async (h) => {
      await h.resetEditor();
      await setDoc('<p>Un paragraphe</p>');
      await caretIn('Un paragraphe');
      const orig = HeaderFooterPreview.getHfMode;
      let inHf;
      try {
        HeaderFooterPreview.getHfMode = () => 'header';
        await syncRow();
        inHf = { disabled: row().getAttribute('aria-disabled'), grey: row().classList.contains('v2-hover-row-disabled'), opens: BookmarkDialog.open() };
      } finally { HeaderFooterPreview.getHfMode = orig; }
      await closeWindows();
      await syncRow();
      const back = row().getAttribute('aria-disabled');
      const pass = inHf.disabled === 'true' && inHf.grey && inHf.opens === false && !windowOpen('pp-bookmark-modal') && back === 'false';
      return { pass, notes: JSON.stringify({ inHf, back }) };
    },
  });

  const dialogCase = {
    id: 'bm_window_adds_checks_renames_and_removes_a_bookmark',
    description: 'La ligne « Signet… » ouvre la fenêtre sur le bloc du curseur : un paragraphe y est vide, un titre propose son texte ; un nom vide ou déjà pris (sans compter la casse ni les accents) est refusé avec sa raison ; l\'adresse tirée du nom se lit sous le champ ; Valider pose le signet ; la fenêtre rouverte le montre (« Retirer le signet », liens qui y mènent comptés) ; Retirer l\'enlève',
    run: async (h) => {
      const en = I18n.getLang() === 'en';
      const T = en
        ? { addTitle: 'Add a bookmark', editTitle: 'Edit the bookmark', label: 'Bookmark name', empty: 'Give the bookmark a name.', taken: 'Another bookmark already has this name.', add: 'Add', confirm: 'Confirm', remove: 'Remove bookmark', cancel: 'Cancel', address: id => 'Bookmark address: ' + id, links: '1 link points to this bookmark: removing it leaves it without a target.' }
        : { addTitle: 'Ajouter un signet', editTitle: 'Modifier le signet', label: 'Nom du signet', empty: 'Donnez un nom au signet.', taken: 'Un autre signet porte déjà ce nom.', add: 'Ajouter', confirm: 'Valider', remove: 'Retirer le signet', cancel: 'Annuler', address: id => 'Adresse du signet : ' + id, links: '1 lien mène à ce signet : le retirer les laisse sans cible.' };
      await h.resetEditor();
      await setDoc('<p>Premier</p><h2>Titre de section</h2><p>Voir <a href="#intro">l\'intro</a></p>');
      const seen = {};
      const name = () => byId('pp-bookmark-name');
      const read = () => ({ title: byId('pp-bookmark-title').textContent, value: name().value, label: byId('pp-bookmark-modal').querySelector('label[for="pp-bookmark-name"]').textContent,
        address: byId('pp-bookmark-address').textContent, error: byId('pp-bookmark-error').hidden ? '' : byId('pp-bookmark-error').textContent, invalid: name().getAttribute('aria-invalid'),
        links: byId('pp-bookmark-links').hidden ? '' : byId('pp-bookmark-links').textContent, buttons: buttons('pp-bookmark-modal').filter(b => !b.hidden).map(b => b.textContent), open: windowOpen('pp-bookmark-modal') });
      // Un paragraphe : vide.
      await caretIn('Premier');
      await syncRow();
      row().click();
      await sleep(150);
      seen.fresh = read();
      okOf('pp-bookmark-modal').click();
      await sleep(80);
      seen.empty = read();
      typeInto(name(), 'Intro');
      seen.typed = read();
      okOf('pp-bookmark-modal').click();
      await sleep(150);
      seen.afterAdd = { open: windowOpen('pp-bookmark-modal'), attrs: [blocks()[0].getAttribute('data-anchor'), blocks()[0].getAttribute('data-anchor-name')] };
      // Un titre : son texte est proposé ; un nom déjà pris est refusé.
      await caretIn('Titre de section');
      await syncRow();
      row().click();
      await sleep(150);
      seen.heading = read();
      typeInto(name(), 'INTRO');
      okOf('pp-bookmark-modal').click();
      await sleep(80);
      seen.taken = read();
      typeInto(name(), 'Section');
      okOf('pp-bookmark-modal').click();
      await sleep(150);
      seen.headingAttrs = [blocks()[1].getAttribute('data-anchor'), blocks()[1].getAttribute('data-anchor-name')];
      // Rouverte sur le premier signet : modifier, retirer.
      await caretIn('Premier');
      await syncRow();
      row().click();
      await sleep(150);
      seen.reopened = read();
      removeOf('pp-bookmark-modal').click();
      await sleep(150);
      seen.removed = { open: windowOpen('pp-bookmark-modal'), attrs: [blocks()[0].getAttribute('data-anchor'), blocks()[0].getAttribute('data-anchor-name')], links: blocks()[2].querySelectorAll('a').length };
      await closeWindows();
      const pass = seen.fresh.open && seen.fresh.title === T.addTitle && seen.fresh.value === '' && seen.fresh.label === T.label && JSON.stringify(seen.fresh.buttons) === JSON.stringify([T.cancel, T.add]) && seen.fresh.address === I18n.t('bookmark.hint')
        && seen.empty.open && seen.empty.error === T.empty && seen.empty.invalid === 'true'
        && seen.typed.address === T.address('intro') && seen.typed.error === '' && !seen.typed.invalid
        && !seen.afterAdd.open && JSON.stringify(seen.afterAdd.attrs) === JSON.stringify(['intro', 'Intro'])
        && seen.heading.value === 'Titre de section' && seen.heading.title === T.addTitle
        && seen.taken.open && seen.taken.error === T.taken
        && JSON.stringify(seen.headingAttrs) === JSON.stringify(['section', 'Section'])
        && seen.reopened.title === T.editTitle && seen.reopened.value === 'Intro' && JSON.stringify(seen.reopened.buttons) === JSON.stringify([T.remove, T.cancel, T.confirm]) && seen.reopened.links === T.links
        && !seen.removed.open && JSON.stringify(seen.removed.attrs) === JSON.stringify([null, null]) && seen.removed.links === 1;
      return { pass, notes: JSON.stringify(seen) };
    },
  };
  cases.push(dialogCase);
  cases.push(Object.assign({}, dialogCase, {
    id: 'bm_window_adds_checks_renames_and_removes_a_bookmark_in_english',
    lang: 'en',
    description: 'Page qui démarre en anglais : la fenêtre du signet, ses erreurs, ses boutons et la note de ses liens sont en anglais',
  }));

  cases.push({
    id: 'bm_window_keeps_the_keyboard_enter_validates_escape_cancels',
    description: 'Dans la fenêtre du signet, Entrée valide et Échap annule en rendant le clavier à l\'éditeur (une lettre tapée ensuite entre dans le texte)',
    run: async (h) => {
      await h.resetEditor();
      await setDoc('<p>Premier</p>');
      await caretIn('Premier');
      await syncRow();
      row().click();
      await sleep(150);
      const input = byId('pp-bookmark-name');
      typeInto(input, 'Clavier');
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await sleep(150);
      const byEnter = { open: windowOpen('pp-bookmark-modal'), id: blocks()[0].getAttribute('data-anchor') };
      row().click();
      await sleep(150);
      typeInto(byId('pp-bookmark-name'), 'Autre nom');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      byId('pp-bookmark-modal').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await sleep(150);
      const byEscape = { open: windowOpen('pp-bookmark-modal'), id: blocks()[0].getAttribute('data-anchor'), name: blocks()[0].getAttribute('data-anchor-name'), focused: ed().view.hasFocus() };
      const pass = !byEnter.open && byEnter.id === 'clavier' && !byEscape.open && byEscape.id === 'clavier' && byEscape.name === 'Clavier' && byEscape.focused;
      return { pass, notes: JSON.stringify({ byEnter, byEscape }) };
    },
  });

  const linkCase = {
    id: 'bm_link_window_leads_to_a_heading_or_a_bookmark_of_the_document',
    description: 'La fenêtre « Lien… » propose « Dans ce document » : la liste des titres (leur texte, leur niveau) et des signets, dans l\'ordre du document ; un signet choisi donne un lien « #adresse » sur le texte sélectionné ; un titre sans signet reçoit son adresse dans la MÊME étape que le lien (un seul Annuler défait les deux) ; la fenêtre rouverte sur ce lien montre « Dans ce document » et sa cible',
    run: async (h) => {
      const en = I18n.getLang() === 'en';
      const T = en ? { headings: 'Headings', bookmarks: 'Bookmarks', web: 'An address', doc: 'In this document', level: n => 'Level ' + n } : { headings: 'Titres', bookmarks: 'Signets', web: 'Une adresse', doc: 'Dans ce document', level: n => 'Niveau ' + n };
      await h.resetEditor();
      await setDoc('<h1>Introduction</h1><p>Texte</p><h2>Détail</h2><p data-anchor="conditions" data-anchor-name="Conditions">Les conditions</p><p>Renvoi ici et là</p>');
      const seen = {};
      const target = () => byId('pp-link-target');
      const pick = value => { target().value = value; target().dispatchEvent(new Event('change', { bubbles: true })); };
      const modes = () => Array.from(byId('pp-link-modal').querySelectorAll('input[name="pp-link-mode"]')).map(i => ({ value: i.value, checked: i.checked, text: i.parentElement.textContent.trim(), disabled: i.disabled }));
      await selectText('Renvoi');
      seen.consumed = pressCtrlK();
      await sleep(150);
      seen.modes = modes();
      seen.webFirst = !byId('pp-link-url').closest('.pp-link-field').hidden && byId('pp-link-target').closest('.pp-link-field').hidden;
      byId('pp-link-modal').querySelector('input[value="document"]').click();
      await sleep(100);
      seen.docShown = byId('pp-link-target').closest('.pp-link-field').hidden === false && byId('pp-link-url').closest('.pp-link-field').hidden === true;
      seen.groups = Array.from(target().querySelectorAll('optgroup')).map(g => [g.label, Array.from(g.querySelectorAll('option')).map(o => [o.value, o.textContent, o.dataset.hint || ''])]);
      // Aucun choix : refusé.
      okOf('pp-link-modal').click();
      await sleep(80);
      seen.noChoice = { open: windowOpen('pp-link-modal'), error: byId('pp-link-target-error').hidden ? '' : byId('pp-link-target-error').textContent, invalid: target().getAttribute('aria-invalid') };
      // Un signet : un lien sur le texte choisi.
      pick('a:conditions');
      okOf('pp-link-modal').click();
      await sleep(150);
      const link = blocks()[4].querySelector('a');
      seen.bookmarkLink = { open: windowOpen('pp-link-modal'), href: link && link.getAttribute('href'), text: link && link.textContent };
      // Un titre qui n'a pas de signet : son adresse est posée avec le lien.
      await selectText('là');
      pressCtrlK();
      await sleep(150);
      byId('pp-link-modal').querySelector('input[value="document"]').click();
      await sleep(100);
      pick('h:1');
      okOf('pp-link-modal').click();
      await sleep(150);
      const heading = blocks()[2];
      seen.headingLink = { href: blocks()[4].querySelectorAll('a')[1] && blocks()[4].querySelectorAll('a')[1].getAttribute('href'), anchor: heading.getAttribute('data-anchor'), name: heading.getAttribute('data-anchor-name') };
      ed().commands.undo();
      await sleep(100);
      seen.undone = { links: blocks()[4].querySelectorAll('a').length, anchor: blocks()[2].getAttribute('data-anchor') };
      // Rouverte sur le lien du signet : le mode et la cible sont ceux du lien.
      await caretIn('Renvoi');
      pressCtrlK();
      await sleep(150);
      seen.reopened = { title: byId('pp-link-title').textContent, modes: modes().filter(m => m.checked).map(m => m.value), target: target().value, remove: !removeOf('pp-link-modal').hidden, url: byId('pp-link-url').value };
      await closeWindows();
      const heads = seen.groups[0], marks = seen.groups[1];
      const pass = seen.consumed === true && JSON.stringify(seen.modes.map(m => [m.value, m.text, m.checked, m.disabled])) === JSON.stringify([['web', T.web, true, false], ['document', T.doc, false, false]]) && seen.webFirst && seen.docShown
        && heads && heads[0] === T.headings && JSON.stringify(heads[1]) === JSON.stringify([['h:0', 'Introduction', T.level(1)], ['h:1', 'Détail', T.level(2)]])
        && marks && marks[0] === T.bookmarks && marks[1].length === 1 && marks[1][0][0] === 'a:conditions' && marks[1][0][1] === 'Conditions'
        && seen.noChoice.open && seen.noChoice.error === I18n.t('hyperlink.error.noTarget') && seen.noChoice.invalid === 'true'
        && !seen.bookmarkLink.open && seen.bookmarkLink.href === '#conditions' && seen.bookmarkLink.text === 'Renvoi'
        && seen.headingLink.href === '#detail' && seen.headingLink.anchor === 'detail' && seen.headingLink.name === null
        && seen.undone.links === 1 && seen.undone.anchor === null
        && seen.reopened.title === I18n.t('hyperlink.title.edit') && JSON.stringify(seen.reopened.modes) === JSON.stringify(['document']) && seen.reopened.target === 'a:conditions' && seen.reopened.remove && seen.reopened.url === '';
      return { pass, notes: JSON.stringify(seen) };
    },
  };
  cases.push(linkCase);
  cases.push(Object.assign({}, linkCase, {
    id: 'bm_link_window_leads_to_a_heading_or_a_bookmark_of_the_document_in_english',
    lang: 'en',
    description: 'Page qui démarre en anglais : les groupes « Headings » et « Bookmarks », les choix « An address » et « In this document » de la fenêtre « Lien… »',
  }));

  cases.push({
    id: 'bm_link_window_says_when_the_target_is_gone_and_when_there_is_none',
    description: 'Un lien dont la cible a disparu rouvre la fenêtre sur « Dans ce document » avec « n\'existe plus », sans rien choisi, et Valider le refuse ; un document sans titre ni signet le dit (et renvoie vers « Signet… ») avec la liste grisée ; « Dans ce document » est grisé dans un en-tête ou un pied de page, avec sa raison, jamais retiré',
    run: async (h) => {
      await h.resetEditor();
      const modeOf = () => Array.from(byId('pp-link-modal').querySelectorAll('input[name="pp-link-mode"]')).filter(i => i.checked).map(i => i.value);
      const target = () => byId('pp-link-target');
      const hint = () => byId('pp-link-target-hint').textContent;
      await setDoc('<h1>Un titre</h1><p>Voir <a href="#disparu">ce passage</a></p>');
      await caretIn('ce passage');
      pressCtrlK();
      await sleep(150);
      const gone = { mode: modeOf(), target: target().value, hint: hint(), disabled: target().disabled };
      okOf('pp-link-modal').click();
      await sleep(80);
      const refused = { open: windowOpen('pp-link-modal'), error: byId('pp-link-target-error').textContent };
      await closeWindows();
      await setDoc('<p>Voir <a href="#disparu">ce passage</a></p>');
      await caretIn('ce passage');
      pressCtrlK();
      await sleep(150);
      const bare = { mode: modeOf(), hint: hint(), disabled: target().disabled };
      await closeWindows();
      await setDoc('<p>Rien à viser ici</p>');
      await selectText('Rien');
      pressCtrlK();
      await sleep(150);
      byId('pp-link-modal').querySelector('input[value="document"]').click();
      await sleep(80);
      const none = { hint: hint(), disabled: target().disabled };
      await closeWindows();
      const orig = HeaderFooterPreview.getHfMode;
      let hf;
      try {
        HeaderFooterPreview.getHfMode = () => 'footer';
        pressCtrlK();
        await sleep(150);
        const box = byId('pp-link-modal').querySelector('input[value="document"]');
        hf = { disabled: box.disabled, title: box.parentElement.title, present: !!box };
      } finally { HeaderFooterPreview.getHfMode = orig; }
      await closeWindows();
      const pass = JSON.stringify(gone.mode) === JSON.stringify(['document']) && gone.target === '' && gone.hint === I18n.t('hyperlink.target.missing') && !gone.disabled
        && refused.open && refused.error === I18n.t('hyperlink.error.noTarget')
        && JSON.stringify(bare.mode) === JSON.stringify(['document']) && bare.hint === I18n.t('hyperlink.target.none') && bare.disabled === true
        && none.hint === I18n.t('hyperlink.target.none') && none.disabled === true
        && hf.present && hf.disabled === true && hf.title === I18n.t('hyperlink.mode.documentLocked');
      return { pass, notes: JSON.stringify({ gone, refused, bare, none, hf }) };
    },
  });

  cases.push({
    id: 'bm_ctrl_click_on_an_internal_link_goes_to_its_target_and_a_plain_click_does_nothing',
    description: 'Dans l\'éditeur, Ctrl/⌘+clic sur un lien vers un signet amène la cible en haut de la zone qui défile et y pose le curseur (comme un lien web, un clic simple place seulement le curseur) ; sur un lien dont la cible n\'existe plus, rien ne bouge ; aucun onglet ne s\'ouvre',
    run: async (h) => {
      await h.resetEditor();
      const filler = Array.from({ length: 60 }, (_, i) => '<p>Ligne ' + (i + 1) + ' qui allonge le document.</p>').join('');
      await setDoc('<p>Aller à <a href="#fin">la fin</a> ou <a href="#perdu">nulle part</a></p>' + filler + '<p data-anchor="fin" data-anchor-name="Fin">Paragraphe final</p>' + filler);
      const scroller = byId('editor-container');
      scroller.scrollTop = 0;
      await sleep(150);
      const link = ed().view.dom.querySelector('a[href="#fin"]');
      const dead = ed().view.dom.querySelector('a[href="#perdu"]');
      const opened = [];
      const origOpen = window.open;
      window.open = (...args) => { opened.push(args[0]); return null; };
      try {
        const plain = new MouseEvent('click', { bubbles: true, cancelable: true });
        link.dispatchEvent(plain);
        await sleep(150);
        const afterPlain = scroller.scrollTop;
        const deadEvent = new MouseEvent('click', { ctrlKey: true, bubbles: true, cancelable: true });
        dead.dispatchEvent(deadEvent);
        await sleep(150);
        const afterDead = scroller.scrollTop;
        const ctrl = new MouseEvent('click', { ctrlKey: true, bubbles: true, cancelable: true });
        link.dispatchEvent(ctrl);
        await sleep(300);
        const target = ed().view.dom.querySelector('[data-anchor="fin"]');
        const offset = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
        const caret = ed().state.selection.$from.parent.textContent;
        const pass = afterPlain === 0 && afterDead === 0 && ctrl.defaultPrevented && deadEvent.defaultPrevented && scroller.scrollTop > 500 && Math.abs(offset - 12) <= 3 && caret === 'Paragraphe final' && opened.length === 0 && location.hash === '';
        return { pass, notes: JSON.stringify({ afterPlain, afterDead, scrollTop: scroller.scrollTop, offset, caret, opened, hash: location.hash }) };
      } finally { window.open = origOpen; }
    },
  });

  cases.push({
    id: 'bm_hovering_an_internal_link_names_its_target_in_the_tip',
    description: 'Le survol d\'un lien vers un signet montre son NOM dans l\'info-bulle (« Dans ce document : Conditions ») et l\'invite « Ctrl+clic pour y aller » ; sur un lien sans cible : « Titre ou signet introuvable » sans invite',
    run: async (h) => {
      await h.resetEditor();
      await setDoc('<p data-anchor="conditions" data-anchor-name="Conditions">Cible</p><p>Voir <a href="#conditions">ici</a> et <a href="#perdu">là</a></p>');
      const tipOf = async selector => {
        const link = ed().view.dom.querySelector(selector);
        link.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
        await sleep(900);
        const tip = document.querySelector('.pp-link-tip');
        return tip && !tip.hidden ? Array.from(tip.children).map(c => c.textContent) : null;
      };
      const good = await tipOf('a[href="#conditions"]');
      const lost = await tipOf('a[href="#perdu"]');
      const en = I18n.getLang() === 'en';
      const key = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '') ? '⌘' : 'Ctrl';
      const want = en ? [['In this document: Conditions', key + '+click to go there'], ['Heading or bookmark not found']] : [['Dans ce document : Conditions', key + '+clic pour y aller'], ['Titre ou signet introuvable']];
      const pass = JSON.stringify(good) === JSON.stringify(want[0]) && JSON.stringify(lost) === JSON.stringify(want[1]);
      return { pass, notes: JSON.stringify({ good, lost }) };
    },
  });

  // === 3) La Lecture et l'impression par le navigateur ========================================================================================================================

  cases.push({
    id: 'bm_reader_keeps_links_in_the_page_and_follows_them_to_the_target',
    description: 'Dans la Lecture, un lien vers un signet n\'ouvre pas d\'onglet (ni target ni rel) et un clic amène la cible en haut de la zone qui défile sans changer l\'adresse de la page ; un lien dont la cible n\'existe plus ne fait rien (le clic est quand même retenu : l\'adresse de la page ne change pas) ; les liens du web gardent leur nouvel onglet',
    run: async (h) => {
      await h.resetEditor();
      const reader = await h.renderReaderMode('<p>Aller à <a href="#fin" target="_blank" rel="noopener noreferrer nofollow">la fin</a>, <a href="#perdu">nulle part</a> ou <a href="https://exemple.fr">le web</a></p><p data-anchor="fin" data-anchor-name="Fin">Paragraphe final</p>', null);
      const link = reader.querySelector('a[href="#fin"]');
      const dead = reader.querySelector('a[href="#perdu"]');
      const web = reader.querySelector('a[href="https://exemple.fr"]');
      const revealed = [];
      const orig = TocLinks.reveal;
      TocLinks.reveal = el => { revealed.push(el.textContent); };
      let clicks;
      try {
        const good = new MouseEvent('click', { bubbles: true, cancelable: true });
        link.dispatchEvent(good);
        const lost = new MouseEvent('click', { bubbles: true, cancelable: true });
        dead.dispatchEvent(lost);
        clicks = { good: good.defaultPrevented, lost: lost.defaultPrevented };
      } finally { TocLinks.reveal = orig; }
      const pass = !link.hasAttribute('target') && !link.hasAttribute('rel') && !dead.hasAttribute('target') && web.getAttribute('target') === '_blank'
        && clicks.good && clicks.lost && JSON.stringify(revealed) === JSON.stringify(['Paragraphe final']) && location.hash === ''
        && !!reader.querySelector('[data-anchor="fin"]');
      return { pass, notes: JSON.stringify({ target: link.getAttribute('target'), rel: link.getAttribute('rel'), clicks, revealed, hash: location.hash }) };
    },
  });

  cases.push({
    id: 'bm_browser_print_gives_an_internal_link_the_id_of_its_target_in_the_page_and_never_a_dead_address',
    description: 'L\'impression par le navigateur rend la Lecture dans un arbre ombre où `#adresse` ne trouverait pas sa cible : un lien dont la cible existe prend l\'`id` d\'un élément sans hauteur posé dans la page et projeté dans la feuille de la cible (un lien caché de la page le nomme), un lien dont la cible manque garde son texte sans adresse (jamais un lien mort), les liens du web restent des liens ; tout est retiré avec l\'impression',
    run: async (h) => {
      await h.resetEditor();
      const job = await PrintExport.prepare('<p>Voir <a href="#fin">la fin</a>, <a href="#absent">rien</a> et <a href="https://exemple.fr">le web</a></p><p data-anchor="fin" data-anchor-name="Fin">Paragraphe final</p>', null, { id: 1 }, JSON.parse(JSON.stringify(NO_HF)), 'essai');
      try {
        const text = job.root.textContent;
        const internal = Array.from(job.root.querySelectorAll('a[href^="#"]'));
        const web = job.root.querySelectorAll('a[href^="https://exemple.fr"]').length;
        const dead = job.root.querySelectorAll('a[data-link-anchor="absent"][href]').length;
        const ids = Array.from(new Set(internal.map(a => a.getAttribute('href').slice(1))));
        const target = ids.length === 1 ? document.getElementById(ids[0]) : null;
        const hidden = ids.length === 1 ? document.querySelectorAll('#pp-print-host > a[href="#' + ids[0] + '"]').length : 0;
        const slotted = !!target && job.root.querySelectorAll('slot[name="' + ids[0] + '"]').length === 1 && target.assignedSlot !== null;
        const pass = ids.length === 1 && /^pp-print-target-\d+$/.test(ids[0]) && !!target && target.parentNode === job.host && hidden === 1 && slotted && dead === 0 && web === 1 && text.includes('la fin') && text.includes('Paragraphe final');
        return { pass, notes: JSON.stringify({ ids, internal: internal.length, web, dead, hidden, slotted }) };
      } finally { job.dispose(); }
    },
  });
  cases.push({
    id: 'bm_browser_print_leaves_no_target_behind',
    description: 'Les cibles et les liens cachés que l\'impression pose dans la page partent avec elle',
    run: async (h) => {
      await h.resetEditor();
      const job = await PrintExport.prepare('<p><a href="#fin">la fin</a></p><p data-anchor="fin" data-anchor-name="Fin">Paragraphe final</p>', null, { id: 1 }, JSON.parse(JSON.stringify(NO_HF)), 'essai');
      const during = document.querySelectorAll('[id^="pp-print-target-"]').length;
      job.dispose();
      const after = document.querySelectorAll('[id^="pp-print-target-"]').length + document.querySelectorAll('a[href^="#pp-print-target-"]').length;
      return { pass: during === 1 && after === 0, notes: JSON.stringify({ during, after }) };
    },
  });

  // === 4) Les exports =========================================================================================================================================================

  // --- PDF : lu par pdf.js ---
  const allLinks = links => links.pages.flatMap((p, i) => p.links.map(l => Object.assign({ on: i + 1 }, l)));
  const itemsOf = (truth, page, str) => truth.pages[page - 1].textItems.filter(it => it.str === str);

  cases.push({
    id: 'bm_pdf_link_to_a_bookmark_leads_to_its_page_and_line',
    description: 'PDF (lu par pdf.js) : le signet est une destination nommée `pp-a-<adresse>` posée juste au-dessus de la ligne du bloc, et le texte du lien (chacun de ses mots) mène à elle, sur la page où le titre est peint ; un lien dont la cible n\'existe pas n\'écrit aucune annotation ; le PDF d\'un document sans signet n\'écrit aucune destination',
    run: async (h) => {
      await h.resetEditor();
      const html = '<p>Voir <a href="#conditions">les conditions</a> et <a href="#absent">rien</a>.</p>' + BREAK + '<h1 data-anchor="conditions" data-anchor-name="Conditions">Conditions</h1><p>Texte des conditions.</p>';
      const result = await h.exportPdfContent(html, null);
      const links = await h.extractPdfLinks(result.base64);
      const truth = await h.extractPdfGroundTruth(result.base64);
      const all = allLinks(links);
      const toTarget = all.filter(l => l.name === 'pp-a-conditions');
      const heading = itemsOf(truth, 2, 'Conditions')[0];
      const onWords = ['les', 'conditions'].map(word => toTarget.filter(l => itemsOf(truth, 1, word).some(it => it.y >= l.y - 1 && it.y <= l.y + l.height + 1 && it.x >= l.x - 1 && it.x <= l.x + l.width)).length);
      const plain = await h.exportPdfContent('<h1>Alpha</h1><p>Texte.</p>', null);
      const plainLinks = await h.extractPdfLinks(plain.base64);
      const pass = links.pages.length === 2 && JSON.stringify(links.destinations) === JSON.stringify(['pp-a-conditions']) && all.length === toTarget.length && toTarget.length >= 2
        && toTarget.every(l => l.on === 1 && l.page === 2 && !!heading && heading.y - l.top > 0 && heading.y - l.top < 40) && onWords.every(n => n >= 1)
        && !JSON.stringify(result.content).includes('pp-a-absent') && plainLinks.destinations.length === 0;
      return { pass, notes: JSON.stringify({ pages: links.pages.length, destinations: links.destinations, links: all.length, toTarget: toTarget.length, onWords, headingY: heading && heading.y, tops: toTarget.map(l => l.top) }) };
    },
  });

  cases.push({
    id: 'bm_pdf_every_form_of_link_text_leads_to_the_bookmark',
    description: 'PDF : le lien reste cliquable dans un paragraphe justifié, avec un caractère que la police n\'a pas (le texte se coupe en plusieurs passages), en gras, dans une case de tableau et dans un titre : chaque passage mène à la même destination',
    run: async (h) => {
      await h.resetEditor();
      const html = '<p style="text-align: justify">Un paragraphe justifié avec un <a href="#cible">lien ☑ vers la cible</a> assez long pour passer sur plusieurs lignes et être étiré par la justification du PDF.</p>'
        + '<p>Du <a href="#cible"><strong>gras</strong> et du texte</a>.</p>'
        + '<table><tbody><tr><td><p>Case <a href="#cible">ma case liée</a></p></td><td><p>autre</p></td></tr></tbody></table>'
        + '<h2>Titre <a href="#cible">lié</a></h2>'
        + BREAK + '<p data-anchor="cible" data-anchor-name="Cible">La cible</p>';
      const result = await h.exportPdfContent(html, null);
      const links = await h.extractPdfLinks(result.base64);
      const all = allLinks(links);
      const truth = await h.extractPdfGroundTruth(result.base64);
      const words = ['lien', 'vers', 'cible', 'gras', 'texte', 'liée', 'lié', '☑'];
      const covered = words.map(word => truth.pages[0].textItems.filter(it => it.str.includes(word)).some(it => all.some(l => it.y >= l.y - 1 && it.y <= l.y + l.height + 1 && it.x + 0.5 >= l.x - 1 && it.x <= l.x + l.width)));
      const pass = links.pages.length === 2 && JSON.stringify(links.destinations) === JSON.stringify(['pp-a-cible']) && all.length >= 12 && all.every(l => l.name === 'pp-a-cible' && l.page === 2)
        && ['lien', 'vers', 'gras', 'texte', 'liée', 'lié'].every(w => covered[words.indexOf(w)]);
      return { pass, notes: JSON.stringify({ destinations: links.destinations, links: all.length, covered: words.map((w, i) => w + ':' + covered[i]) }) };
    },
  });

  cases.push({
    id: 'bm_pdf_a_signet_without_any_link_still_writes_its_destination',
    description: 'PDF : un signet sans aucun lien écrit quand même sa destination nommée (`pp-a-` et son adresse : elle est dans le fichier pour qui la vise), une seule par signet même si le document en pose plusieurs avec la même adresse (macro-modèle) ; aucune erreur de nom en double',
    run: async (h) => {
      await h.resetEditor();
      const html = '<p data-anchor="un" data-anchor-name="Un">Premier</p><p>Texte</p><p data-anchor="un" data-anchor-name="Un">Doublon d\'un autre modèle</p><h2 data-anchor="deux" data-anchor-name="Deux">Deux</h2>';
      const result = await h.exportPdfContent(html, null);
      const links = await h.extractPdfLinks(result.base64);
      const ids = (JSON.stringify(result.content, (key, value) => (key === 'positions' || key.charAt(0) === '_' ? undefined : value)).match(/"id":"pp-a-[^"]+"/g) || []);
      const pass = JSON.stringify(links.destinations.slice().sort()) === JSON.stringify(['pp-a-deux', 'pp-a-un']) && ids.length === 2 && allLinks(links).length === 0;
      return { pass, notes: JSON.stringify({ destinations: links.destinations, ids }) };
    },
  });

  cases.push({
    id: 'bm_pdf_a_bookmark_on_an_image_only_paragraph_has_no_destination_and_its_links_stay_text',
    description: 'PDF : un paragraphe qui ne contient qu\'une image n\'a aucun texte où poser une destination : son signet n\'écrit rien et le lien qui y mène reste du texte (jamais un lien mort, jamais une erreur) ; le mot d\'un paragraphe voisin qui a du texte, lui, reste lié',
    run: async (h) => {
      await h.resetEditor();
      const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
      const html = '<p>Voir <a href="#image">l\'image</a> et <a href="#texte">le texte</a>.</p>'
        + '<p data-anchor="image" data-anchor-name="Image"><img src="' + png + '" width="40" height="40"></p>'
        + '<p data-anchor="texte" data-anchor-name="Texte">Un paragraphe avec du texte</p>';
      const result = await h.exportPdfContent(html, null);
      const links = await h.extractPdfLinks(result.base64);
      const truth = await h.extractPdfGroundTruth(result.base64);
      const all = allLinks(links);
      const words = truth.pages[0].textItems.map(it => it.str).join(' ');
      const pass = JSON.stringify(links.destinations) === JSON.stringify(['pp-a-texte']) && all.length >= 1 && all.every(l => l.name === 'pp-a-texte')
        && words.includes('image') && words.includes('texte') && !JSON.stringify(result.content).includes('pp-a-image');
      return { pass, notes: JSON.stringify({ destinations: links.destinations, links: all.map(l => l.name), words }) };
    },
  });

  cases.push({
    id: 'bm_pdf_a_heading_the_toc_cites_and_a_bookmark_share_one_destination',
    description: 'PDF : un titre que le sommaire cite ET qui porte un signet n\'a qu\'une destination (pdfmake refuse deux `id` égaux, un nœud n\'en porte qu\'un) : les lignes du sommaire et les liens du texte mènent à la même, sur la page du titre ; le titre suivant garde la destination de son sommaire',
    run: async (h) => {
      await h.resetEditor();
      const html = '<div class="toc-marker"></div><h1 data-anchor="alpha" data-anchor-name="Alpha">Alpha</h1><p>Voir <a href="#alpha">le début</a>.</p>' + BREAK + '<h1>Beta</h1><p>Voir <a href="#alpha">encore</a>.</p>';
      const result = await h.exportPdfContent(html, null);
      const links = await h.extractPdfLinks(result.base64);
      const all = allLinks(links);
      const alpha = all.filter(l => l.name === 'pp-a-alpha');
      const beta = all.filter(l => l.name !== 'pp-a-alpha');
      // Alpha : sa ligne du sommaire (texte et numéro de page), « le début » (page 1) et « encore » (page 2), tous vers la page 1 ; Beta : sa ligne du sommaire seulement, vers la page 2.
      const pass = links.pages.length === 2 && links.destinations.length === 2 && links.destinations.includes('pp-a-alpha')
        && alpha.length >= 4 && alpha.every(l => l.page === 1) && alpha.filter(l => l.on === 1).length >= 3 && alpha.filter(l => l.on === 2).length === 1
        && beta.length >= 2 && beta.every(l => l.on === 1 && l.page === 2) && new Set(beta.map(l => l.name)).size === 1;
      return { pass, notes: JSON.stringify({ pages: links.pages.length, destinations: links.destinations, alpha: alpha.map(l => [l.on, l.page]), beta: beta.map(l => [l.on, l.page, l.name]) }) };
    },
  });

  // Les paragraphes « Garder avec le suivant » (js/keep-with-next.js) : leur page est lue par l'`id` du bloc de tête (pdf-export.js:claimKeepId) ; un signet posé sur ce bloc ne doit ni perdre
  // sa destination ni faire perdre la règle. Même balayage que dev-tests/scenarios-keep-next.js : la marge du bas varie de 2 pt en 2 pt, de l'endroit où la dernière ligne ne tient plus sur
  // la page 1 à celui où même la première de la suite n'y tient plus, de sorte que la coupure de page tombe sur chaque cas.
  const PDF_MARGIN_PT = 28;
  const KEPT = (text, anchor) => '<p data-keep-next="true"' + (anchor ? ' data-anchor="' + anchor + '" data-anchor-name="' + anchor + '"' : '') + '>' + text + '</p>';
  const introLines = n => Array.from({ length: n }, (_, i) => '<p>INTRO' + String(i).padStart(2, '0') + '</p>').join('');
  const pageOf = (truth, str) => { let found = -1; truth.pages.forEach((page, p) => page.textItems.forEach(it => { if (found < 0 && it.str === str) found = p; })); return found; };
  const yOf = (truth, str) => { let found = null; truth.pages.forEach(page => page.textItems.forEach(it => { if (found == null && it.str === str) found = it.y; })); return found; };
  async function pdfAt(h, html, bottomPt) {
    const result = await h.exportPdfContent(html, null, { top: PDF_MARGIN_PT, right: PDF_MARGIN_PT, bottom: bottomPt, left: PDF_MARGIN_PT });
    return { result, truth: await h.extractPdfGroundTruth(result.base64) };
  }
  cases.push({
    id: 'bm_pdf_a_kept_with_next_paragraph_with_a_bookmark_keeps_its_destination_and_its_rule',
    description: 'PDF : un paragraphe « Garder avec le suivant » qui porte un signet reste avec le bloc qui le suit, comme sans signet, quelle que soit la marge du bas (le même balayage que « Garder avec le suivant » : la coupure de page tombe sur chaque cas), ET garde sa destination (la page où il est peint) : avant, la règle de page lisait l\'`id` du bloc, que la destination du signet prenait, ou l\'inverse',
    run: async (h) => {
      await h.resetEditor();
      // Le même document avec et sans le signet : le lien vers lui n'est qu'un texte tant que la cible manque, la mise en page ne change pas.
      const make = anchor => n => introLines(n) + KEPT('TOT1', anchor) + KEPT('TOT2') + '<p>ARRETE</p><p>Après</p><p>Voir <a href="#tot">le total</a></p>';
      const plainDoc = make(null);
      const anchoredDoc = make('tot');
      // Le nombre de lignes d'introduction qui amène « Après » au bas de la page 1.
      const probe = await pdfAt(h, plainDoc(10), PDF_MARGIN_PT);
      const introY = i => yOf(probe.truth, 'INTRO' + String(i).padStart(2, '0'));
      const pitch = (introY(9) - introY(0)) / 9;
      const pageHeight = probe.truth.pages[0].height;
      let n = 10 + Math.max(0, Math.floor((pageHeight - PDF_MARGIN_PT - 6 - yOf(probe.truth, 'Après')) / pitch));
      let packed = null;
      for (let tries = 0; tries < 6 && !packed; tries++) {
        const attempt = await pdfAt(h, plainDoc(n), PDF_MARGIN_PT);
        if (pageOf(attempt.truth, 'Après') === 0) packed = { n, tailY: yOf(attempt.truth, 'Après'), headY: yOf(attempt.truth, 'TOT1') };
        else n--;
      }
      if (!packed) throw new Error('La dernière ligne repérée ne tient pas sur la page 1, même avec moins d\'introduction');
      const from = Math.floor(pageHeight - packed.tailY - 16);
      const to = Math.ceil(pageHeight - packed.headY + 4);
      const rows = [];
      for (let bottom = from; bottom <= to; bottom += 2) {
        const plain = await pdfAt(h, plainDoc(packed.n), bottom);
        const anchored = await pdfAt(h, anchoredDoc(packed.n), bottom);
        const links = await h.extractPdfLinks(anchored.result.base64);
        const tokens = t => ['TOT1', 'TOT2', 'ARRETE'].map(name => pageOf(t.truth, name));
        const mine = allLinks(links).filter(l => l.name === 'pp-a-tot');
        rows.push({ bottom, plain: tokens(plain), anchored: tokens(anchored), destinations: links.destinations, linkPages: mine.map(l => l.page - 1) });
      }
      // Même page que sans signet, tout le bloc de totaux ensemble, la destination nommée présente et menant à la page où « TOT1 » est peint ; les deux cas (suite sur la page 1, puis sur la page 2) sont vus.
      const same = rows.every(r => JSON.stringify(r.plain) === JSON.stringify(r.anchored));
      const together = rows.every(r => r.anchored.every(p => p === r.anchored[0] && p >= 0));
      const sides = [rows.filter(r => r.anchored[0] === 0).length, rows.filter(r => r.anchored[0] === 1).length];
      const resolved = rows.every(r => r.destinations.includes('pp-a-tot') && r.linkPages.length >= 1 && r.linkPages.every(p => p === r.anchored[0]));
      const pass = rows.length >= 5 && same && together && sides[0] >= 2 && sides[1] >= 3 && resolved;
      return { pass, notes: JSON.stringify({ packed, same, together, sides, resolved, rows: rows.map(r => [r.bottom, r.plain.join(''), r.anchored.join(''), r.linkPages.join('')]) }) };
    },
  });

  cases.push({
    id: 'bm_pdf_merged_batch_keeps_the_links_to_bookmarks_of_each_row',
    description: 'PDF unique (toutes les lignes en un fichier) : le lien vers un signet de chaque ligne mène à la page de SON signet dans le document réuni (pdf-lib ne recopie pas l\'arbre des noms : chaque lien reprend l\'adresse que son nom désignait)',
    run: async (h) => {
      await h.resetEditor();
      await PdfExport.ensurePdfLibsLoaded();
      const build = async label => (await PdfExport.getNativePdfBlobForRecord('<p>Ligne ' + label + ' : <a href="#fin">vers la fin</a></p>' + BREAK + '<p data-anchor="fin" data-anchor-name="Fin">Fin de la ligne ' + label + '</p>', null, {}, '', null)).blob;
      const merged = await PdfMerge.create('essai');
      await merged.append(await build('A'));
      await merged.append(await build('B'));
      const blob = await merged.toBlob();
      const links = await h.extractPdfLinks(blob);
      const truth = await h.extractPdfGroundTruth(await new Promise(resolve => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1]); r.readAsDataURL(blob); }));
      const all = allLinks(links);
      const perRow = [[1, 2], [3, 4]].map(([from, to]) => all.filter(l => l.on === from && l.page === to).length);
      const pass = links.pages.length === 4 && perRow.every(n => n >= 2) && all.every(l => l.page === l.on + 1) && pageOf(truth, 'ligne') >= -1;
      return { pass, notes: JSON.stringify({ pages: links.pages.length, perRow, links: all.map(l => [l.on, l.page]) }) };
    },
  });

  // --- Word : OOXML dézippé ---
  const wDoc = parts => parts.doc;
  const wAll = (doc, tag) => Array.from(doc.getElementsByTagNameNS('*', tag));
  const wAttr = (el, name) => el.getAttribute('w:' + name);

  cases.push({
    id: 'bm_docx_bookmarks_and_internal_hyperlinks_point_at_each_other',
    description: 'Word (OOXML dézippé) : chaque signet est un signet Word (nom que la boîte « Insérer > Signet » montre : lettres, chiffres et « _ », une lettre en premier, 40 signes au plus, unique sans compter la casse ; identifiant unique, début et fin appariés) ; chaque lien est un lien interne (w:hyperlink w:anchor) vers un signet qui existe, dans la couleur et le soulignement des liens ; un lien sans cible n\'écrit pas de lien',
    run: async (h) => {
      await h.resetEditor();
      const html = '<p>Voir <a href="#conditions-generales">les conditions</a>, <a href="#fin-1">la fin</a>, <a href="#2024-bilan">le bilan</a> et <a href="#absent">rien</a>.</p>'
        + '<table><tbody><tr><td><p>Case <a href="#fin-1">vers la fin</a></p></td><td><p>x</p></td></tr></tbody></table>'
        + '<h1 data-anchor="conditions-generales" data-anchor-name="Conditions générales">Conditions générales</h1><p>Texte.</p>'
        + '<p data-anchor="fin-1" data-anchor-name="Fin">Dernier paragraphe</p><p data-anchor="2024-bilan" data-anchor-name="2024 bilan">Bilan</p><p data-anchor="fin_1" data-anchor-name="Fin bis">Même nom Word</p><p data-anchor="' + 'long-'.repeat(11) + 'fin" data-anchor-name="Long">Un nom très long</p>';
      const parts = await h.exportDocxParts(html, null);
      const doc = wDoc(parts);
      const starts = wAll(doc, 'bookmarkStart').map(b => ({ name: wAttr(b, 'name'), id: wAttr(b, 'id') }));
      const ends = wAll(doc, 'bookmarkEnd').map(b => wAttr(b, 'id'));
      const mine = starts.filter(s => !/^_Toc/.test(s.name));
      const links = wAll(doc, 'hyperlink').map(l => wAttr(l, 'anchor')).filter(Boolean);
      const lower = mine.map(s => s.name.toLowerCase());
      const linkRuns = wAll(doc, 'hyperlink').map(l => ({ color: (l.getElementsByTagNameNS('*', 'color')[0] || { getAttribute: () => null }).getAttribute('w:val'), underline: l.getElementsByTagNameNS('*', 'u').length }));
      const pass = mine.length === 5 && mine.every(s => /^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(s.name)) && new Set(lower).size === lower.length && new Set(starts.map(s => s.id)).size === starts.length
        && JSON.stringify(starts.map(s => s.id).sort()) === JSON.stringify(ends.slice().sort())
        && links.length === 4 && links.every(a => mine.some(s => s.name === a)) && !links.includes('absent')
        && linkRuns.every(r => r.color === '0563C1' && r.underline >= 1)
        && mine.some(s => s.name === 'conditions_generales') && mine.some(s => s.name === 'S_2024_bilan');
      return { pass, notes: JSON.stringify({ starts, ends, links, linkRuns }) };
    },
  });

  cases.push({
    id: 'bm_docx_a_heading_in_the_toc_and_with_a_bookmark_carries_both_bookmarks',
    description: 'Word : un titre que le sommaire cite et qui porte un signet porte les DEUX signets, imbriqués (jamais croisés) et d\'identifiants distincts : la ligne du sommaire et le lien du texte mènent chacun au leur',
    run: async (h) => {
      await h.resetEditor();
      const html = '<div class="toc-marker"></div><h1 data-anchor="alpha" data-anchor-name="Alpha">Alpha</h1><p>Voir <a href="#alpha">le début</a>.</p>';
      const parts = await h.exportDocxParts(html, null);
      const heading = wAll(parts.doc, 'p').find(p => p.textContent === 'Alpha' && p.getElementsByTagNameNS('*', 'bookmarkStart').length);
      const order = heading ? Array.from(heading.children).filter(c => /^bookmark(Start|End)$/.test(c.localName)).map(c => c.localName + ':' + (wAttr(c, 'name') || wAttr(c, 'id'))) : [];
      const ids = heading ? Array.from(heading.getElementsByTagNameNS('*', 'bookmarkStart')).map(b => wAttr(b, 'id')) : [];
      const tocLinks = wAll(parts.doc, 'hyperlink').map(l => wAttr(l, 'anchor'));
      const pass = !!heading && ids.length === 2 && new Set(ids).size === 2 && order.length === 4 && /^bookmarkStart:/.test(order[0]) && /^bookmarkStart:/.test(order[1]) && order[2].startsWith('bookmarkEnd') && order[3].startsWith('bookmarkEnd')
        && order[2].split(':')[1] === ids[1] && order[3].split(':')[1] === ids[0] && tocLinks.includes('alpha') && tocLinks.some(a => /^_Toc/.test(a));
      return { pass, notes: JSON.stringify({ order, ids, tocLinks }) };
    },
  });

  // --- HTML ---
  cases.push({
    id: 'bm_html_export_writes_targets_and_links_that_stay_in_the_page',
    description: 'HTML : un signet est l\'`id` de son bloc (l\'adresse elle-même dans le fichier complet : une autre page peut la citer), le lien est un `#adresse` sans target ni rel ; un lien dont la cible n\'existe pas, ou que la fin du document ne laisse pas écrire, n\'est que du texte ; le premier d\'un doublon garde l\'adresse ; un titre cité par le sommaire garde son identifiant et reçoit un repère vide pour l\'adresse',
    run: async (h) => {
      await h.resetEditor();
      const html = '<div class="toc-marker"></div><p>Voir <a href="#conditions" target="_blank" rel="noopener">les conditions</a>, <a href="#absent">rien</a>, <a href="#pp-x">un nom réservé</a>.</p>'
        + '<h1 data-anchor="conditions" data-anchor-name="Conditions">Conditions</h1><p data-anchor="pp-x" data-anchor-name="X">Nom réservé</p><p data-anchor="conditions" data-anchor-name="Autre">Doublon</p>';
      const full = parse((await h.exportHtml(html, null, {}, null, '')).text);
      const links = Array.from(full.querySelectorAll('.pp-doc a[href^="#"]')).filter(a => !a.closest('.pp-toc, nav'));
      const heading = full.querySelector('h1');
      const marks = Array.from(full.querySelectorAll('[id]')).map(n => n.id);
      const dups = marks.filter((id, i) => marks.indexOf(id) !== i);
      const text = full.querySelector('.pp-doc').textContent;
      const hrefs = links.map(a => a.getAttribute('href'));
      const pass = hrefs.includes('#conditions') && hrefs.includes('#pp-a-pp-x') && !hrefs.includes('#absent') && text.includes('rien') && links.every(a => !a.hasAttribute('target') && !a.hasAttribute('rel'))
        && !!heading && !!full.querySelector('#conditions') && marks.filter(id => id === 'conditions').length === 1 && !!full.querySelector('#pp-a-pp-x') && dups.length === 0
        && full.querySelectorAll('p[id="conditions"]').length === 0;
      return { pass, notes: JSON.stringify({ hrefs, marks, dups, headingId: heading && heading.id }) };
    },
  });

  cases.push({
    id: 'bm_html_fragment_targets_carry_the_token_of_the_document',
    description: 'HTML à coller (fragment) : la cible d\'un signet porte le jeton du document, comme celle des titres et des notes (deux documents collés dans une même page ne se disputent pas une adresse) ; le lien y mène',
    run: async (h) => {
      await h.resetEditor();
      const html = '<p>Voir <a href="#fin">la fin</a></p><p data-anchor="fin" data-anchor-name="Fin">Fin</p>';
      const a = parse((await h.exportHtml(html, null, {}, null, '', { fragment: true })).text);
      const b = parse((await h.exportHtml(html.replace('Fin', 'Fin du second'), null, {}, null, '', { fragment: true })).text);
      const idA = (a.querySelector('[id]') || {}).id;
      const idB = (b.querySelector('[id]') || {}).id;
      const hrefA = (a.querySelector('a[href^="#"]') || { getAttribute: () => null }).getAttribute('href');
      const pass = !!idA && !!idB && idA !== idB && idA.includes('fin') && hrefA === '#' + idA;
      return { pass, notes: JSON.stringify({ idA, idB, hrefA }) };
    },
  });

  // --- Une diapositive que vise un lien (SlideProps.forOutput, option `anchors`) : un bloc d'adresse vide, de hauteur nulle, au début de la diapositive ---
  const SLIDE_STYLE = 'display:block;height:0;margin:0;padding:0;border:0;overflow:hidden';
  const slideAnchor = n => '<div class="pp-slide-anchor" data-anchor="slide-' + n + '" data-anchor-name="Diapositive ' + n + '" aria-hidden="true" style="' + SLIDE_STYLE + '"></div>';
  const slideFrame = text => FreeFrame.html({ x: 100, y: 80, w: 300, h: 100 }, '<p>' + text + '</p>');
  const slidesHtml = (withAnchors) => {
    const a = n => (withAnchors ? slideAnchor(n) : '');
    return '<p>Voir <a href="#slide-2">la deux</a>, <a href="#slide-3">la trois</a>, <a href="#slide-4">la quatre</a> et <a href="#slide-5">la cinq</a>.</p>'
      + BREAK + a(2) + '<p>Texte de la deux</p>'
      + BREAK + a(3) + BREAK + a(4) + slideFrame('Objet de la quatre') + BREAK + a(5) + '<table><tbody><tr><td><p>Case</p></td></tr></tbody></table><p>Après le tableau</p>';
  };

  cases.push({
    id: 'bm_pdf_a_slide_anchor_is_a_destination_on_the_page_of_its_slide_without_taking_room',
    description: 'PDF : une diapositive que vise un lien reçoit sa destination `pp-a-slide-N` sur la page que le saut de page ouvre - qu\'elle commence par un paragraphe, par un objet libre ou qu\'elle soit vide (sa page blanche) - et les liens y mènent ; le bloc d\'adresse n\'ajoute ni page ni hauteur (le PDF a les mêmes pages sans lui)',
    run: async (h) => {
      await h.resetEditor();
      const result = await h.exportPdfContent(slidesHtml(true), null);
      const plain = await h.exportPdfContent(slidesHtml(false), null);
      const links = await h.extractPdfLinks(result.base64);
      const plainLinks = await h.extractPdfLinks(plain.base64);
      const all = allLinks(links);
      const pageOf = name => { const found = all.filter(l => l.name === name); return found.length ? found[0].page : 0; };
      const truth = await h.extractPdfGroundTruth(result.base64);
      const plainTruth = await h.extractPdfGroundTruth(plain.base64);
      const yOf = (t, page, str) => { const it = t.pages[page - 1].textItems.find(item => item.str === str); return it ? it.y : null; };
      const sameY = [[2, 'Texte'], [5, 'Après']].every(([page, word]) => { const a = truth.pages[page - 1].textItems.map(i => i.y.toFixed(1)).join(); const b = plainTruth.pages[page - 1].textItems.map(i => i.y.toFixed(1)).join(); return a === b && a.length > 0; });
      const pass = links.pages.length === plainLinks.pages.length && links.pages.length === 5
        && JSON.stringify(links.destinations.slice().sort()) === JSON.stringify(['pp-a-slide-2', 'pp-a-slide-3', 'pp-a-slide-4', 'pp-a-slide-5'])
        && sameY && pageOf('pp-a-slide-2') === 2 && pageOf('pp-a-slide-3') === 3 && pageOf('pp-a-slide-4') === 4 && pageOf('pp-a-slide-5') === 5 && all.every(l => l.on === 1);
      return { pass, notes: JSON.stringify({ pages: links.pages.length, plainPages: plainLinks.pages.length, destinations: links.destinations, pages_of: ['pp-a-slide-2', 'pp-a-slide-3', 'pp-a-slide-4', 'pp-a-slide-5'].map(pageOf), links: all.length, sameY }) };
    },
  });

  cases.push({
    id: 'bm_docx_a_slide_anchor_is_a_bookmark_on_the_first_paragraph_of_its_slide_without_a_paragraph_of_its_own',
    description: 'Word : une diapositive que vise un lien reçoit son signet Word sur le premier paragraphe (ou le premier objet libre, ou la page blanche d\'une diapositive vide) de sa diapositive, apparié début et fin, et les liens y mènent ; le bloc d\'adresse n\'écrit aucun paragraphe de plus',
    run: async (h) => {
      await h.resetEditor();
      const parts = await h.exportDocxParts(slidesHtml(true), null);
      const plain = await h.exportDocxParts(slidesHtml(false), null);
      const doc = wDoc(parts);
      const starts = wAll(doc, 'bookmarkStart').filter(b => !/^_Toc/.test(wAttr(b, 'name')));
      const names = starts.map(b => wAttr(b, 'name'));
      const ends = wAll(doc, 'bookmarkEnd').map(b => wAttr(b, 'id'));
      const links = wAll(doc, 'hyperlink').map(l => wAttr(l, 'anchor')).filter(Boolean);
      const paragraphOf = name => { const start = starts.find(b => wAttr(b, 'name') === name); return start && start.parentNode; };
      const breaksBefore = p => !!p && p.getElementsByTagNameNS('*', 'pageBreakBefore').length > 0;
      const paragraphs = d => wAll(wDoc(d), 'p').length;
      const ok = names.length === 4 && ['slide_2', 'slide_3', 'slide_4', 'slide_5'].every(n => names.includes(n)) && starts.every(b => ends.includes(wAttr(b, 'id'))) && links.length === 4 && links.every(a => names.includes(a))
        && !!paragraphOf('slide_2') && paragraphOf('slide_2').textContent === 'Texte de la deux' && breaksBefore(paragraphOf('slide_2'))
        && !!paragraphOf('slide_3') && breaksBefore(paragraphOf('slide_3')) && paragraphOf('slide_3').textContent === ''
        && !!paragraphOf('slide_4') && breaksBefore(paragraphOf('slide_4')) && paragraphOf('slide_4').getElementsByTagNameNS('*', 'drawing').length > 0 && /Objet de la quatre/.test(doc.documentElement.textContent)
        && paragraphs(parts) === paragraphs(plain);
      return { pass: !!ok, notes: JSON.stringify({ names, links, paragraphs: paragraphs(parts), plainParagraphs: paragraphs(plain), p2: paragraphOf('slide_2') && paragraphOf('slide_2').textContent, breaks: ['slide_2', 'slide_3', 'slide_4', 'slide_5'].map(n => n + ':' + breaksBefore(paragraphOf(n)) + ':' + (paragraphOf(n) ? paragraphOf(n).textContent.length : -1)), frame: /Objet de la quatre/.test(doc.documentElement.textContent) }) };
    },
  });

  // Des diapositives qui ne commencent pas par du texte : une liste, un bloc de code, un trait, une image seule, un tableau seul (rien d'autre dans la diapositive : une adresse qui traînerait
  // jusqu'au bloc suivant tomberait sur la diapositive d'après ou se perdrait au saut de page).
  const SLIDE_IMAGE = '<p><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==" width="120" height="80"></p>';
  const oddSlidesHtml = () => '<p>Voir <a href="#slide-2">la deux</a>, <a href="#slide-3">la trois</a>, <a href="#slide-4">la quatre</a>, <a href="#slide-5">la cinq</a> et <a href="#slide-6">la six</a>.</p>'
    + BREAK + slideAnchor(2) + '<ul><li><p>Premier point</p></li><li><p>Second point</p></li></ul>'
    + BREAK + slideAnchor(3) + '<pre><code>let x = 1;</code></pre>'
    + BREAK + slideAnchor(4) + '<hr>'
    + BREAK + slideAnchor(5) + SLIDE_IMAGE
    + BREAK + slideAnchor(6) + '<table><tbody><tr><td><p>Case seule</p></td></tr></tbody></table>';
  const ODD_NAMES = ['pp-a-slide-2', 'pp-a-slide-3', 'pp-a-slide-4', 'pp-a-slide-5', 'pp-a-slide-6'];

  cases.push({
    id: 'bm_pdf_a_slide_anchor_reaches_a_slide_that_starts_with_a_list_code_rule_image_or_table',
    description: 'PDF : la destination d\'une diapositive qui commence par une liste, un bloc de code, un trait, une image seule ou un tableau seul est sur la page que le saut de page ouvre (et non sur la suivante ni perdue) ; les liens y mènent ; le PDF a les mêmes pages sans les blocs d\'adresse',
    run: async (h) => {
      await h.resetEditor();
      const result = await h.exportPdfContent(oddSlidesHtml(), null);
      const plain = await h.exportPdfContent(oddSlidesHtml().replace(/<div class="pp-slide-anchor"[^>]*><\/div>/g, ''), null);
      const links = await h.extractPdfLinks(result.base64);
      const plainLinks = await h.extractPdfLinks(plain.base64);
      const all = allLinks(links);
      const pageOf = name => { const found = all.filter(l => l.name === name); return found.length ? found[0].page : 0; };
      const pass = links.pages.length === plainLinks.pages.length && links.pages.length === 6
        && JSON.stringify(links.destinations.slice().sort()) === JSON.stringify(ODD_NAMES)
        && ODD_NAMES.every((name, k) => pageOf(name) === k + 2) && all.every(l => l.on === 1);
      return { pass, notes: JSON.stringify({ pages: links.pages.length, plainPages: plainLinks.pages.length, destinations: links.destinations, pages_of: ODD_NAMES.map(pageOf), links: all.length }) };
    },
  });

  cases.push({
    id: 'bm_docx_a_slide_anchor_reaches_a_slide_that_starts_with_a_list_code_rule_image_or_table',
    description: 'Word : le signet d\'une diapositive qui commence par une liste, un bloc de code, un trait, une image seule ou un tableau seul est sur un paragraphe qui ouvre sa page (un point de haut, devant le bloc), apparié début et fin, et les liens y mènent ; le bloc d\'adresse ne laisse aucune page blanche de plus',
    run: async (h) => {
      await h.resetEditor();
      const parts = await h.exportDocxParts(oddSlidesHtml(), null);
      const doc = wDoc(parts);
      const starts = wAll(doc, 'bookmarkStart').filter(b => !/^_Toc/.test(wAttr(b, 'name')));
      const names = starts.map(b => wAttr(b, 'name'));
      const ends = wAll(doc, 'bookmarkEnd').map(b => wAttr(b, 'id'));
      const links = wAll(doc, 'hyperlink').map(l => wAttr(l, 'anchor')).filter(Boolean);
      const paragraphOf = name => { const start = starts.find(b => wAttr(b, 'name') === name); return start && start.parentNode; };
      const breaksBefore = p => !!p && p.getElementsByTagNameNS('*', 'pageBreakBefore').length > 0;
      const wanted = ['slide_2', 'slide_3', 'slide_4', 'slide_5', 'slide_6'];
      const pagesOpened = wAll(doc, 'pageBreakBefore').length;
      const ok = names.length === 5 && wanted.every(n => names.includes(n)) && starts.every(b => ends.includes(wAttr(b, 'id'))) && links.length === 5 && links.every(a => names.includes(a))
        && wanted.every(n => breaksBefore(paragraphOf(n))) && pagesOpened === 5;
      return { pass: !!ok, notes: JSON.stringify({ names, links, breaks: wanted.map(n => n + ':' + breaksBefore(paragraphOf(n))), pagesOpened }) };
    },
  });

  cases.push({
    id: 'bm_html_a_slide_anchor_is_an_empty_hidden_block_with_the_id_of_its_slide',
    description: 'HTML : une diapositive que vise un lien reçoit un bloc vide et caché, sans hauteur, qui porte son `id` (l\'adresse elle-même dans le fichier complet, le jeton du document dans le contenu à coller) ; les liens y mènent',
    run: async (h) => {
      await h.resetEditor();
      const html = '<p>Voir <a href="#slide-2">la deux</a></p>' + BREAK + slideAnchor(2) + '<p>Texte de la deux</p>';
      const full = parse((await h.exportHtml(html, null, {}, null, '')).text);
      const mark = full.querySelector('#slide-2');
      const href = (full.querySelector('.pp-doc a[href^="#"]') || { getAttribute: () => null }).getAttribute('href');
      const frag = parse((await h.exportHtml(html, null, {}, null, '', { fragment: true })).text);
      const fragMark = frag.querySelector('[id*="slide-2"]');
      const fragHref = (frag.querySelector('a[href^="#"]') || { getAttribute: () => null }).getAttribute('href');
      const pass = !!mark && mark.localName === 'div' && mark.textContent === '' && mark.getAttribute('aria-hidden') === 'true' && href === '#slide-2'
        && !!fragMark && fragHref === '#' + fragMark.id && full.querySelectorAll('[id="slide-2"]').length === 1;
      return { pass, notes: JSON.stringify({ mark: mark && mark.outerHTML, href, fragMark: fragMark && fragMark.id, fragHref }) };
    },
  });

  // --- Markdown ---
  cases.push({
    id: 'bm_markdown_export_writes_an_anchor_and_a_link_that_resolves',
    description: 'Markdown : un signet est une ancre vide `<a id="adresse"></a>` au début de son bloc (la mise en page du texte ne change pas), le lien est `[texte](#adresse)` ; un lien dont la cible n\'existe pas n\'est que du texte ; l\'adresse suit la règle des titres de GitHub quand le bloc est un titre sans signet nommé',
    run: async (h) => {
      await h.resetEditor();
      const html = '<p>Voir <a href="#conditions">les conditions</a>, <a href="#fin">la fin</a> et <a href="#absent">rien</a>.</p>'
        + '<h1 data-anchor="conditions" data-anchor-name="Conditions générales">Conditions générales</h1><p>Texte.</p><p data-anchor="fin" data-anchor-name="Fin">Dernier paragraphe</p>';
      const md = (await h.exportMarkdown(html, null, {}, null, '')).text;
      const lines = md.split('\n');
      const pass = lines[0] === 'Voir [les conditions](#conditions), [la fin](#fin) et rien.' && lines.includes('# <a id="conditions"></a>Conditions générales') && lines.includes('<a id="fin"></a>Dernier paragraphe')
        && !md.includes('absent') && !md.includes('data-anchor');
      return { pass, notes: JSON.stringify(lines) };
    },
  });

  cases.push({
    id: 'bm_markdown_template_round_trips_bookmarks_and_links',
    description: 'Markdown (modèle) puis import : le signet revient sur son bloc avec son nom, le lien vers lui reste un lien ; un lien `#...` qui ne mène à aucun signet du fichier (le sommaire d\'un autre outil) reste du texte, comme avant ; l\'ancre vide d\'un paragraphe vide est gardée',
    run: async (h) => {
      await h.resetEditor();
      await MarkdownImport.ensureLibLoaded();
      const html = '<p>Voir <a href="#conditions">les conditions</a>.</p><h2 data-anchor="conditions" data-anchor-name="Conditions générales">Conditions générales</h2><p data-anchor="vide" data-anchor-name="Ligne vide"></p><p>Fin</p>';
      const md = await MarkdownExport.htmlToMarkdown(html, null, { template: true });
      const back = parse(MarkdownImport.toDocument(md).html || MarkdownImport.toDocument(md));
      const kids = Array.from(back.children);
      const heading = kids.find(k => k.tagName === 'H2');
      const empty = kids.find(k => k.getAttribute('data-anchor') === 'vide');
      const foreign = parse(MarkdownImport.toDocument('[sommaire](#plus-loin) et [ailleurs](#nulle-part)\n\n## Plus loin\n').html || MarkdownImport.toDocument('[sommaire](#plus-loin) et [ailleurs](#nulle-part)\n\n## Plus loin\n'));
      const pass = !!heading && heading.getAttribute('data-anchor') === 'conditions' && heading.getAttribute('data-anchor-name') === 'Conditions générales'
        && kids[0].querySelector('a') && kids[0].querySelector('a').getAttribute('href') === '#conditions'
        && !!empty && empty.getAttribute('data-anchor-name') === 'Ligne vide'
        && foreign.querySelectorAll('a').length === 0 && foreign.textContent.includes('sommaire') && foreign.textContent.includes('ailleurs');
      return { pass, notes: JSON.stringify({ md, back: back.innerHTML, foreign: foreign.innerHTML }) };
    },
  });

  // --- E-mail et Excel : du texte seul ---
  cases.push({
    id: 'bm_email_text_and_excel_keep_only_the_text_of_an_internal_link',
    description: 'E-mail (texte brut) et Excel : un lien vers un signet n\'écrit que son texte (ni « (#adresse) » dans l\'e-mail, ni lien dans la cellule) ; un lien du web garde son adresse',
    run: async (h) => {
      await h.resetEditor();
      const text = MailtoExport.plainTextFromHtml('<p>Voir <a href="#conditions">les conditions</a> et <a href="https://exemple.fr">le site</a>.</p><p data-anchor="conditions" data-anchor-name="Conditions">Cible</p>');
      const pass = text === 'Voir les conditions et le site (https://exemple.fr).\n\nCible' || text.replace(/\s+/g, ' ').trim() === 'Voir les conditions et le site (https://exemple.fr). Cible';
      return { pass, notes: JSON.stringify(text) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.bookmarks = cases;
})();
