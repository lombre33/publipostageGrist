// Suite "findReplace" - Rechercher / Remplacer dans l'éditeur (demande d'Antoine, 2026-10-01 : « Rechercher/Remplacer » ; roadmap A20 ; js/find-replace.js, css/find-replace.css,
// la loupe de la barre). Trois moitiés :
//  1) le MOTEUR (FindReplace.findMatches) sur de vrais documents ProseMirror : à travers les marques, jamais à travers deux blocs, casse, mot entier, espaces et apostrophes
//     typographiques, bulles et suppressions suivies ignorées, sans chevauchement ;
//  2) le PANNEAU : ouverture (Ctrl+F, Ctrl+H, la loupe), mot repris de la sélection, compteur, résultat courant, précédent / suivant avec retour au bout, défilement jusqu'au résultat,
//     fermeture (Échap, la sélection reste), fermeture seule quand l'éditeur est masqué, textes français et anglais ;
//  3) le REMPLACEMENT : « Remplacer » puis le suivant, « Tout remplacer », UNE étape d'annulation chacun, mise en forme gardée (gras, couleur, lien), remplacement vide, mode suivi
//     (suppression + insertion suggérées, Tout accepter / Tout refuser), cases de tableau et listes, aucune modification du modèle tant qu'on ne fait que chercher.
//  4) BEAUCOUP DE RÉSULTATS : jusqu'à 500 tous sont surlignés ; au-delà, seuls ceux de l'écran et de ses abords le sont (le courant toujours), la fenêtre suit le défilement et les
//     sauts d'un résultat à l'autre, et le compteur comme « Tout remplacer » gardent tous les résultats.
// La frappe réelle (vrai clavier, vraie souris, 700x400, clair et sombre, anglais) est dans dev-tests/verify-find-replace-mouse.mjs : un KeyboardEvent synthétique n'est pas un geste
// « trusted ». Aucun caractère spécial n'est écrit en séquence d'échappement dans ce fichier (String.fromCharCode) : un outil d'édition les remplace par le caractère lui-même.
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const NBSP = String.fromCharCode(0xA0);
  const NARROW_NBSP = String.fromCharCode(0x202F);
  const ed = () => EditorCore.getEditor();
  const tiptap = () => document.querySelector('.tiptap');
  const bar = () => document.getElementById('pp-find-bar');
  const findInput = () => document.getElementById('pp-find-input');
  const replacementInput = () => document.getElementById('pp-find-replacement');
  const replaceRow = () => document.getElementById('pp-find-replace-row');
  const countText = () => document.getElementById('pp-find-count').textContent;
  const barOpen = () => !!bar() && !bar().hidden;
  const textOf = m => ed().state.doc.textBetween(m.from, m.to);
  const find = (query, options) => FindReplace.findMatches(ed().state.doc, query, options || {});
  const texts = (query, options) => find(query, options).map(textOf);
  const spansText = selector => Array.from(tiptap().querySelectorAll(selector)).map(s => s.textContent).join('|');
  const selectionText = () => { const s = ed().state.selection; return ed().state.doc.textBetween(s.from, s.to); };
  const isDisabled = id => document.getElementById(id).getAttribute('aria-disabled') === 'true';
  const parse = html => new DOMParser().parseFromString(html, 'text/html').body;

  async function begin(h, html) {
    await h.resetEditor();
    Editor.setHTML(html);
    await sleep(80);
  }
  // Remet tout ce qu'un scénario a pu laisser (panneau, requête, options, suivi) : la recherche vit dans un module, elle survit d'un scénario à l'autre.
  async function cleanup() {
    FindReplace.close({ focus: false });
    FindReplace.setReplacement('');
    FindReplace.setOptions({ matchCase: false, wholeWord: false });
    FindReplace.setQuery('');
    if (Editor.isTrackChangesOn()) Editor.setTrackChanges(false);
    I18n.setLang('fr');
    await sleep(40);
  }
  // Le test passe son corps ; le nettoyage a lieu quoi qu'il arrive.
  function scenario(id, description, body) {
    cases.push({
      id, description,
      run: async h => {
        try { return await body(h); } finally { await cleanup(); }
      },
    });
  }
  function key(target, init) {
    const ev = new KeyboardEvent('keydown', Object.assign({ bubbles: true, cancelable: true }, init));
    target.dispatchEvent(ev);
    return ev.defaultPrevented;
  }
  function selectRange(from, to) {
    const TextSelection = EditorCore.getTextSelectionClass();
    ed().view.dispatch(ed().state.tr.setSelection(TextSelection.create(ed().state.doc, from, to)));
  }
  const bold = text => '<strong>' + text + '</strong>';

  // === 1) Le moteur =========================================================================================================================================================

  scenario('fr_engine_finds_across_marks_but_never_across_blocks',
    'Moteur : « foo » se trouve dans un paragraphe, une case de tableau, une liste et à cheval sur du gras (« fo » + « o ») ; « fo » en fin de paragraphe et « o » au début du suivant ne font pas « foo »',
    async h => {
      await begin(h, '<p>Un foo ici, ' + bold('fo') + 'o là.</p><table><tbody><tr><td><p>cellule foo</p></td><td><p>autre</p></td></tr></tbody></table><ul><li><p>item foo</p></li></ul><p>fo</p><p>o seul</p>');
      const found = texts('foo');
      const ranges = find('foo').map(m => [m.from, m.to]);
      const increasing = ranges.every((r, i) => i === 0 || r[0] >= ranges[i - 1][1]);
      return { pass: found.length === 4 && found.every(t => t === 'foo') && increasing, notes: JSON.stringify({ found, ranges }) };
    });

  scenario('fr_engine_case_and_accents',
    'Moteur : la casse est ignorée (É et é se valent), les accents non (e et é), « Respecter la casse » ne garde que la graphie exacte',
    async h => {
      await begin(h, '<p>École ÉCOLE école ecole</p>');
      const loose = texts('école');
      const exact = texts('école', { matchCase: true });
      const plain = texts('ecole');
      const pass = loose.join('|') === 'École|ÉCOLE|école' && exact.join('|') === 'école' && plain.join('|') === 'ecole';
      return { pass, notes: JSON.stringify({ loose, exact, plain }) };
    });

  scenario('fr_engine_whole_word',
    'Moteur : « Mot entier » écarte « ana » dans « banana » et « anaconda », garde « ana, » ; chiffres, lettres accentuées et « _ » comptent dans un mot, le tiret non',
    async h => {
      await begin(h, '<p>banana ana anaconda ana, café foo_bar foo-bar a12 12</p>');
      const loose = find('ana').length;
      const whole = find('ana', { wholeWord: true });
      const cafe = find('caf', { wholeWord: true }).length;
      const underscore = find('foo', { wholeWord: true }).length; // foo_bar : non ; foo-bar : oui
      const digits = find('12', { wholeWord: true }).length; // a12 : non ; « 12 » seul : oui
      const pass = loose === 4 && whole.length === 2 && cafe === 0 && underscore === 1 && digits === 1;
      return { pass, notes: JSON.stringify({ loose, whole: whole.length, cafe, underscore, digits }) };
    });

  scenario('fr_engine_spaces_and_quotes_are_equivalent',
    'Moteur : espace insécable et espace fine insécable valent une espace, apostrophe et guillemets courbes valent les droits (un texte français les mêle)',
    async h => {
      await begin(h, '<p>Bonjour' + NBSP + '! Quoi' + NARROW_NBSP + '? l’affaire de l\'équipe, “mot” et "autre".</p>');
      const a = texts('Bonjour !').length;
      const b = texts('Quoi ?').length;
      const c = texts("l'affaire").length;
      const d = texts('l’équipe').length;
      const e = texts('"mot"').length;
      const f = texts('“autre”').length;
      return { pass: [a, b, c, d, e, f].every(n => n === 1), notes: JSON.stringify({ a, b, c, d, e, f }) };
    });

  scenario('fr_engine_ignores_atoms_and_deleted_text',
    'Moteur : une bulle ou un saut de ligne coupe un mot (« fo », bulle, « o » ne fait pas « foo »), le texte d\'une suppression suivie n\'est pas trouvé',
    async h => {
      const badge = '<span class="var-badge" data-table="T" data-column="C" data-key="T.C"></span>';
      await begin(h, '<p>fo' + badge + 'o</p><p>fo<br>o</p><p>aa <del data-id="1">foo</del> foo</p>');
      const found = find('foo');
      return { pass: found.length === 1 && textOf(found[0]) === 'foo', notes: JSON.stringify({ n: found.length, html: Editor.getHTML() }) };
    });

  scenario('fr_engine_no_overlap_and_empty_query',
    'Moteur : « aa » dans « aaaa » vaut deux résultats qui ne se chevauchent pas ; une requête vide ou réduite au caractère « objet » n\'en trouve aucun',
    async h => {
      await begin(h, '<p>aaaa</p>');
      const two = find('aa');
      const none = find('').length + find(String.fromCharCode(0xFFFC)).length + find(null).length;
      return { pass: two.length === 2 && two[0].to === two[1].from && none === 0, notes: JSON.stringify({ two, none }) };
    });

  // === 2) Le panneau ========================================================================================================================================================

  scenario('fr_panel_opens_with_ctrl_f_ctrl_h_and_prefills_the_selection',
    'Panneau : Ctrl+F l\'ouvre sans laisser la frappe au navigateur, le mot sélectionné entre dans le champ, Ctrl+H montre aussi « Remplacer par » et y met le clavier',
    async h => {
      await begin(h, '<p>Bonjour tout le monde</p><p>Deuxième ligne</p>');
      ed().commands.focus();
      await sleep(50);
      const consumed = key(tiptap(), { key: 'f', code: 'KeyF', ctrlKey: true });
      await sleep(60);
      const afterF = { open: barOpen(), focus: document.activeElement && document.activeElement.id, replaceHidden: replaceRow().hidden };
      FindReplace.close({ focus: false });
      selectRange(9, 13); // « tout »
      const consumedH = key(tiptap(), { key: 'h', code: 'KeyH', ctrlKey: true });
      await sleep(60);
      const afterH = { open: barOpen(), value: findInput().value, replaceHidden: replaceRow().hidden, focus: document.activeElement && document.activeElement.id };
      FindReplace.close({ focus: false });
      // Une sélection sur deux paragraphes n'est pas un mot : le champ garde sa requête précédente.
      selectRange(3, 30);
      key(tiptap(), { key: 'f', code: 'KeyF', ctrlKey: true });
      await sleep(40);
      const afterBlocks = findInput().value;
      const pass = consumed && consumedH && afterF.open && afterF.focus === 'pp-find-input' && afterF.replaceHidden
        && afterH.open && afterH.value === 'tout' && !afterH.replaceHidden && afterH.focus === 'pp-find-replacement' && afterBlocks === 'tout';
      return { pass, notes: JSON.stringify({ consumed, consumedH, afterF, afterH, afterBlocks }) };
    });

  scenario('fr_panel_ctrl_f_works_from_the_toolbar_but_not_over_a_window',
    'Panneau : Ctrl+F ouvre le panneau même quand le clavier est resté sur un bouton de la barre d\'outils ; une fenêtre ouverte garde le clavier, l\'éditeur masqué (Lecture, macro-modèle) laisse la recherche du navigateur, Ctrl+Maj+F et Ctrl+Alt+F ne sont pas les nôtres',
    async h => {
      await begin(h, '<p>foo bar</p>');
      const button = document.getElementById('v2-btn-bold');
      button.focus();
      const fromToolbar = key(button, { key: 'f', code: 'KeyF', ctrlKey: true });
      await sleep(50);
      const opened = { open: barOpen(), focus: document.activeElement && document.activeElement.id };
      FindReplace.close({ focus: false });
      const overlay = document.createElement('div');
      overlay.className = 'pp-modal';
      overlay.style.display = 'flex';
      document.body.appendChild(overlay);
      const overWindow = key(button, { key: 'f', code: 'KeyF', ctrlKey: true });
      const openedOverWindow = barOpen();
      overlay.remove();
      const container = document.getElementById('editor-container');
      container.style.display = 'none';
      const whileHidden = key(button, { key: 'f', code: 'KeyF', ctrlKey: true });
      const openedWhileHidden = barOpen();
      container.style.display = '';
      const withShift = key(button, { key: 'f', code: 'KeyF', ctrlKey: true, shiftKey: true });
      const withAlt = key(button, { key: 'f', code: 'KeyF', ctrlKey: true, altKey: true });
      const withoutCtrl = key(button, { key: 'f', code: 'KeyF' });
      await sleep(30);
      const pass = fromToolbar && opened.open && opened.focus === 'pp-find-input'
        && !overWindow && !openedOverWindow && !whileHidden && !openedWhileHidden && !withShift && !withAlt && !withoutCtrl && !barOpen();
      return { pass, notes: JSON.stringify({ fromToolbar, opened, overWindow, openedOverWindow, whileHidden, openedWhileHidden, withShift, withAlt, withoutCtrl }) };
    });

  scenario('fr_panel_highlights_counts_and_walks_the_results',
    'Panneau : tous les résultats surlignés, le courant en plus (« 1 sur 4 »), suivant et précédent reviennent au bout, « Aucun résultat » désactive les flèches',
    async h => {
      await begin(h, '<p>foo un</p><p>deux Foo</p><p>trois ' + bold('fo') + 'o</p><p>quatre FOO</p>');
      FindReplace.open({ replace: false });
      FindReplace.setQuery('foo');
      await sleep(60);
      const first = { count: countText(), current: spansText('.pp-find-current'), all: spansText('.pp-find-match') };
      const steps = [];
      for (let i = 0; i < 4; i++) { FindReplace.next(); await sleep(30); steps.push(countText()); }
      FindReplace.prev(); await sleep(30);
      const back = countText();
      FindReplace.setQuery('introuvable');
      await sleep(40);
      const none = { count: countText(), marks: tiptap().querySelectorAll('.pp-find-match').length, prev: isDisabled('pp-find-prev'), next: isDisabled('pp-find-next') };
      const pass = first.count === '1 sur 4' && first.current === 'foo' && first.all.split('|').length >= 4
        && steps.join(',') === '2 sur 4,3 sur 4,4 sur 4,1 sur 4' && back === '4 sur 4'
        && none.count === 'Aucun résultat' && none.marks === 0 && none.prev && none.next;
      return { pass, notes: JSON.stringify({ first, steps, back, none }) };
    });

  scenario('fr_panel_options_case_and_whole_word',
    'Panneau : « Respecter la casse » et « Mot entier » (boutons du panneau, aria-pressed) changent les résultats tout de suite',
    async h => {
      await begin(h, '<p>Foo foo FOO football</p>');
      FindReplace.open({ replace: false });
      FindReplace.setQuery('foo');
      await sleep(40);
      const loose = countText();
      document.getElementById('pp-find-match-case').click();
      await sleep(40);
      const exact = { count: countText(), pressed: document.getElementById('pp-find-match-case').getAttribute('aria-pressed') };
      document.getElementById('pp-find-match-case').click();
      document.getElementById('pp-find-whole-word').click();
      await sleep(40);
      const whole = { count: countText(), pressed: document.getElementById('pp-find-whole-word').getAttribute('aria-pressed') };
      const pass = loose === '1 sur 4' && exact.count === '1 sur 2' && exact.pressed === 'true' && whole.count.endsWith('sur 3') && whole.pressed === 'true';
      return { pass, notes: JSON.stringify({ loose, exact, whole }) };
    });

  scenario('fr_panel_brings_the_result_into_view',
    'Panneau : un résultat au bas d\'un long document est amené dans la zone visible de l\'éditeur',
    async h => {
      await begin(h, Array.from({ length: 90 }, (_, i) => '<p>Ligne ' + i + '</p>').join('') + '<p>la cible est ici</p>');
      const scroller = document.getElementById('editor-container');
      scroller.scrollTop = 0;
      FindReplace.open({ replace: false });
      FindReplace.setQuery('cible');
      await sleep(120);
      const target = tiptap().querySelector('.pp-find-current');
      const box = scroller.getBoundingClientRect();
      const rect = target && target.getBoundingClientRect();
      const visible = !!rect && rect.top >= box.top && rect.bottom <= box.bottom;
      return { pass: scroller.scrollTop > 0 && visible, notes: JSON.stringify({ scrollTop: scroller.scrollTop, rect: rect && [rect.top, rect.bottom], box: [box.top, box.bottom] }) };
    });

  scenario('fr_panel_closing_keeps_the_last_result_selected',
    'Panneau : Échap ferme le panneau, efface le surlignage et rend le clavier à l\'éditeur, le dernier résultat reste sélectionné',
    async h => {
      await begin(h, '<p>un foo deux foo trois</p>');
      FindReplace.open({ replace: false });
      FindReplace.setQuery('foo');
      FindReplace.next();
      await sleep(40);
      const before = selectionText();
      const consumed = key(findInput(), { key: 'Escape', code: 'Escape' });
      await sleep(80);
      const inEditor = !!document.activeElement && !!document.activeElement.closest && !!document.activeElement.closest('.tiptap');
      const pass = consumed && !barOpen() && !FindReplace.isOpen() && tiptap().querySelectorAll('.pp-find-match').length === 0 && before === 'foo' && selectionText() === 'foo' && inEditor;
      return { pass, notes: JSON.stringify({ consumed, open: barOpen(), marks: tiptap().querySelectorAll('.pp-find-match').length, selection: selectionText(), inEditor }) };
    });

  scenario('fr_panel_never_touches_the_template_while_searching',
    'Panneau : ouvrir, chercher, parcourir et fermer ne modifie pas le modèle (aucune mise à jour de l\'éditeur, donc ni enregistrement ni « à enregistrer »), et le HTML enregistré ne porte pas de surlignage',
    async h => {
      await begin(h, '<p>un foo deux foo trois foo</p>');
      const before = Editor.getHTML();
      let updates = 0;
      const count = () => { updates++; };
      ed().on('update', count);
      try {
        FindReplace.open({ replace: true });
        FindReplace.setQuery('foo');
        FindReplace.next(); FindReplace.next(); FindReplace.prev();
        const during = Editor.getHTML();
        FindReplace.close({ focus: false });
        await sleep(60);
        return { pass: updates === 0 && before === during && Editor.getHTML() === before && !/pp-find/.test(during), notes: JSON.stringify({ updates, during }) };
      } finally { ed().off('update', count); }
    });

  scenario('fr_panel_survives_a_template_change',
    'Panneau : charger un autre modèle (même avec le suivi allumé) garde le panneau ouvert et la requête, les résultats sont ceux du nouveau modèle',
    async h => {
      await begin(h, '<p>foo foo foo</p>');
      FindReplace.open({ replace: false });
      FindReplace.setQuery('foo');
      await sleep(40);
      const first = countText();
      Editor.setTrackChanges(true);
      Editor.setHTML('<p>autre foo</p><p>et encore foo</p>');
      await sleep(120);
      const second = { count: countText(), value: findInput().value, open: barOpen(), marks: spansText('.pp-find-match') };
      return { pass: first === '1 sur 3' && second.count === '2 résultats' && second.value === 'foo' && second.open && second.marks === 'foo|foo', notes: JSON.stringify({ first, second }) };
    });

  scenario('fr_panel_loupe_button_toggles_and_shows_its_shortcut',
    'Loupe de la barre : un clic ouvre le panneau (bouton allumé), un second le ferme ; son infobulle et son nom accessible donnent le raccourci',
    async h => {
      await begin(h, '<p>un foo</p>');
      const button = document.getElementById('v2-btn-find');
      button.click();
      await sleep(60);
      const opened = { open: barOpen(), active: button.classList.contains('is-active'), pressed: button.getAttribute('aria-pressed'), focus: document.activeElement && document.activeElement.id };
      button.click();
      await sleep(60);
      const closed = { open: barOpen(), active: button.classList.contains('is-active') };
      const tip = button.getAttribute('data-tip');
      const aria = button.getAttribute('aria-label');
      const pass = opened.open && opened.active && opened.pressed === 'true' && opened.focus === 'pp-find-input' && !closed.open && !closed.active
        && /Rechercher \/ Remplacer \((Ctrl\+F|⌘F)\)/.test(tip) && /\((Ctrl\+F|⌘F)\)$/.test(aria) && !!button.querySelector('svg');
      return { pass, notes: JSON.stringify({ opened, closed, tip, aria }) };
    });

  scenario('fr_panel_closes_when_the_editor_is_hidden',
    'Panneau : passer en Mode lecture le ferme sans rendre le clavier à l\'éditeur masqué, la loupe est alors grisée ; en Mode édition elle est de nouveau active',
    async h => {
      await begin(h, '<p>un foo</p>');
      FindReplace.open({ replace: false });
      FindReplace.setQuery('foo');
      document.getElementById('btn-mode-read').click();
      await sleep(400);
      const read = { open: barOpen(), api: FindReplace.isOpen(), locked: document.getElementById('v2-btn-find').getAttribute('aria-disabled') };
      const refused = FindReplace.open({ replace: false }); // l'éditeur est masqué : rien ne s'ouvre
      document.getElementById('btn-mode-edit').click();
      await sleep(400);
      const edit = { locked: document.getElementById('v2-btn-find').getAttribute('aria-disabled'), opens: FindReplace.open({ replace: false }) };
      const pass = !read.open && !read.api && read.locked === 'true' && refused === false && edit.locked === null && edit.opens === true;
      return { pass, notes: JSON.stringify({ read, refused, edit }) };
    });

  scenario('fr_panel_texts_in_french_and_english',
    'Panneau : libellés, infobulles et compteur (singulier et pluriel) en français puis en anglais',
    async h => {
      await begin(h, '<p>foo bar foo</p>');
      FindReplace.open({ replace: true });
      FindReplace.setQuery('foo');
      await sleep(40);
      const fr = {
        find: findInput().getAttribute('aria-label'), placeholder: findInput().placeholder, next: document.getElementById('pp-find-next').title,
        one: document.getElementById('pp-find-replace-one').textContent, all: document.getElementById('pp-find-replace-all').textContent, count: countText(),
      };
      FindReplace.setQuery('bar'); await sleep(30);
      const frOne = countText();
      I18n.setLang('en');
      await sleep(60);
      // La recherche se place sur le résultat le plus proche du curseur : on remet le curseur au début pour retrouver « 1 of 2 ».
      selectRange(1, 1);
      FindReplace.setQuery('foo'); await sleep(30);
      const en = {
        find: findInput().getAttribute('aria-label'), placeholder: findInput().placeholder, next: document.getElementById('pp-find-next').title,
        one: document.getElementById('pp-find-replace-one').textContent, all: document.getElementById('pp-find-replace-all').textContent, count: countText(),
        tip: document.getElementById('v2-btn-find').getAttribute('data-tip'),
      };
      FindReplace.setQuery('introuvable'); await sleep(30);
      const enNone = countText();
      const pass = fr.find === 'Rechercher' && fr.placeholder === 'Rechercher dans le modèle' && fr.next === 'Résultat suivant (Entrée)' && fr.one === 'Remplacer' && fr.all === 'Tout remplacer'
        && fr.count === '1 sur 2' && frOne === '1 sur 1'
        && en.find === 'Find' && en.placeholder === 'Find in the template' && en.next === 'Next result (Enter)' && en.one === 'Replace' && en.all === 'Replace all'
        && en.count === '1 of 2' && /^Find \/ Replace \(/.test(en.tip) && enNone === 'No results';
      return { pass, notes: JSON.stringify({ fr, frOne, en, enNone }) };
    });

  // === 3) Le remplacement ===================================================================================================================================================

  const undoOnce = () => ed().commands.undo();
  const redoOnce = () => ed().commands.redo();

  scenario('fr_replace_current_then_next_in_one_undo_step_each',
    'Remplacement : « Remplacer » met le texte du résultat courant puis se place sur le suivant ; chaque remplacement est UNE étape d\'annulation, le rétablir le refait',
    async h => {
      await begin(h, '<p>un foo deux foo trois foo</p>');
      FindReplace.open({ replace: true });
      FindReplace.setReplacement('bar');
      FindReplace.setQuery('foo');
      await sleep(50);
      const start = Editor.getHTML();
      const first = FindReplace.replaceCurrent();
      await sleep(40);
      const afterOne = { html: Editor.getHTML(), selection: selectionText(), count: countText() };
      await sleep(600); // deux remplacements voisins dans la même demi-seconde se confondraient en un seul événement de l'historique
      FindReplace.replaceCurrent();
      await sleep(40);
      const afterTwo = Editor.getHTML();
      undoOnce(); await sleep(40);
      const undoTwo = Editor.getHTML();
      undoOnce(); await sleep(40);
      const undoOne = Editor.getHTML();
      redoOnce(); await sleep(40);
      const redone = Editor.getHTML();
      const pass = first === true && afterOne.html === '<p>un bar deux foo trois foo</p>' && afterOne.selection === 'foo' && afterOne.count === '1 sur 2'
        && afterTwo === '<p>un bar deux bar trois foo</p>' && undoTwo === afterOne.html && undoOne === start && redone === afterOne.html;
      return { pass, notes: JSON.stringify({ afterOne, afterTwo, undoTwo, undoOne, redone }) };
    });

  scenario('fr_panel_undo_from_a_panel_button_undoes_the_replacement',
    'Panneau : après un clic sur « Remplacer » (le clavier reste sur le bouton), Ctrl+Z défait le remplacement dans le modèle, Ctrl+Maj+Z ou Ctrl+Y le refait ; depuis un champ, Ctrl+Z reste celui du champ',
    async h => {
      await begin(h, '<p>un foo deux foo</p>');
      FindReplace.open({ replace: true });
      FindReplace.setReplacement('bar');
      FindReplace.setQuery('foo');
      await sleep(50);
      const start = Editor.getHTML();
      const one = document.getElementById('pp-find-replace-one');
      one.focus();
      one.click();
      await sleep(40);
      const replaced = Editor.getHTML();
      const undoKey = key(one, { key: 'z', ctrlKey: true });
      await sleep(40);
      const undone = Editor.getHTML();
      const redoKey = key(one, { key: 'z', ctrlKey: true, shiftKey: true });
      await sleep(40);
      const redone = Editor.getHTML();
      key(one, { key: 'z', ctrlKey: true });
      await sleep(40);
      const redoY = key(one, { key: 'y', ctrlKey: true });
      await sleep(40);
      const redoneY = Editor.getHTML();
      const inField = key(findInput(), { key: 'z', ctrlKey: true });
      await sleep(30);
      const pass = replaced === '<p>un bar deux foo</p>' && undoKey && undone === start && redoKey && redone === replaced && redoY && redoneY === replaced
        && !inField && Editor.getHTML() === replaced && document.activeElement === one;
      return { pass, notes: JSON.stringify({ replaced, undoKey, undone: undone === start, redoKey, redone, redoY, redoneY, inField, focusStaysOnButton: document.activeElement === one }) };
    });

  scenario('fr_replace_current_without_a_current_result_only_moves',
    'Remplacement : quand la sélection n\'est pas sur un résultat, « Remplacer » se contente de se placer sur le prochain (on voit ce qui sera remplacé)',
    async h => {
      await begin(h, '<p>un foo deux foo</p>');
      FindReplace.open({ replace: true });
      FindReplace.setReplacement('bar');
      FindReplace.setQuery('foo');
      selectRange(1, 1); // le curseur au début, hors de tout résultat
      await sleep(30);
      const before = Editor.getHTML();
      FindReplace.replaceCurrent();
      await sleep(30);
      return { pass: Editor.getHTML() === before && selectionText() === 'foo', notes: JSON.stringify({ html: Editor.getHTML(), selection: selectionText() }) };
    });

  scenario('fr_replace_all_is_one_undo_step',
    'Remplacement : « Tout remplacer » remplace tous les résultats (paragraphes, case, liste) en une seule transaction - une annulation les rend tous, le rétablir les refait - et dit combien',
    async h => {
      await begin(h, '<p>foo a foo</p><table><tbody><tr><td><p>cellule foo</p></td><td><p>deux</p></td></tr></tbody></table><ul><li><p>item foo</p></li></ul>');
      FindReplace.open({ replace: true });
      FindReplace.setReplacement('barre');
      FindReplace.setQuery('foo');
      await sleep(50);
      const start = Editor.getHTML();
      const replaced = FindReplace.replaceAll();
      await sleep(40);
      const after = Editor.getHTML();
      const message = countText();
      const cells = parse(after).querySelectorAll('td').length;
      undoOnce(); await sleep(40);
      const undone = Editor.getHTML();
      redoOnce(); await sleep(40);
      const redone = Editor.getHTML();
      const pass = replaced === 4 && !/foo/.test(after) && (after.match(/barre/g) || []).length === 4 && message === '4 remplacements' && cells === 2
        && undone === start && redone === after;
      return { pass, notes: JSON.stringify({ replaced, message, cells, after, undone: undone === start }) };
    });

  scenario('fr_replace_with_nothing_deletes_the_results',
    'Remplacement : un remplacement vide supprime les résultats, en une seule étape d\'annulation',
    async h => {
      await begin(h, '<p>foo un foo deux</p>');
      FindReplace.open({ replace: true });
      FindReplace.setReplacement('');
      FindReplace.setQuery('foo');
      await sleep(40);
      const start = Editor.getHTML();
      FindReplace.replaceAll();
      await sleep(40);
      const after = Editor.getHTML();
      undoOnce(); await sleep(40);
      return { pass: after === '<p> un  deux</p>' && Editor.getHTML() === start, notes: JSON.stringify({ after }) };
    });

  scenario('fr_replace_keeps_bold_color_and_link',
    'Remplacement : le nouveau texte garde la mise en forme du texte remplacé (gras, couleur, lien dont tout le texte est remplacé) ; à cheval sur du gras il prend celle du premier caractère',
    async h => {
      await begin(h, '<p>a ' + bold('foo') + ' b <a href="https://exemple.fr">foo</a> c <span style="color: rgb(255, 0, 0)">foo</span> d fo' + bold('o') + ' e</p>');
      FindReplace.open({ replace: true });
      FindReplace.setReplacement('bar');
      FindReplace.setQuery('foo');
      await sleep(40);
      FindReplace.replaceAll();
      await sleep(40);
      const body = parse(Editor.getHTML());
      const strong = Array.from(body.querySelectorAll('strong')).map(n => n.textContent);
      const link = body.querySelector('a[href="https://exemple.fr"]');
      const colored = body.querySelector('span[style*="color"]');
      const pass = strong.join('|') === 'bar' && !!link && link.textContent === 'bar' && !!colored && colored.textContent === 'bar'
        && body.textContent === 'a bar b bar c bar d bar e';
      return { pass, notes: JSON.stringify({ strong, link: link && link.textContent, colored: colored && colored.textContent, text: body.textContent }) };
    });

  scenario('fr_replace_with_track_changes_makes_suggestions',
    'Remplacement en mode suivi : l\'ancien texte devient une suppression suggérée, le nouveau une insertion suggérée ; les résultats suivants se retrouvent sans compter la suppression ; chaque remplacement s\'annule d\'un coup',
    async h => {
      await begin(h, '<p>un foo deux foo trois foo</p>');
      Editor.setTrackChanges(true);
      await sleep(60);
      FindReplace.open({ replace: true });
      FindReplace.setReplacement('bar');
      FindReplace.setQuery('foo');
      await sleep(50);
      const start = Editor.getHTML();
      FindReplace.replaceCurrent();
      await sleep(50);
      const one = parse(Editor.getHTML());
      const oneOk = one.querySelectorAll('del').length === 1 && one.querySelector('del').textContent === 'foo' && one.querySelectorAll('ins').length === 1 && one.querySelector('ins').textContent === 'bar';
      const nextSelected = selectionText();
      const remaining = countText();
      await sleep(600);
      const replaced = FindReplace.replaceAll(); // les deux « foo » restants
      await sleep(60);
      const all = parse(Editor.getHTML());
      const allOk = replaced === 2 && all.querySelectorAll('del').length === 3 && all.querySelectorAll('ins').length === 3
        && Array.from(all.querySelectorAll('ins')).every(n => n.textContent === 'bar') && Array.from(all.querySelectorAll('del')).every(n => n.textContent === 'foo');
      const noMoreResults = find('foo').length;
      undoOnce(); await sleep(50);
      const afterUndo = parse(Editor.getHTML());
      const undoAllOk = afterUndo.querySelectorAll('del').length === 1 && afterUndo.querySelectorAll('ins').length === 1;
      undoOnce(); await sleep(50);
      const undoOneOk = Editor.getHTML() === start;
      const pass = oneOk && nextSelected === 'foo' && remaining === '1 sur 2' && allOk && noMoreResults === 0 && undoAllOk && undoOneOk;
      return { pass, notes: JSON.stringify({ oneOk, nextSelected, remaining, allOk, noMoreResults, undoAllOk, undoOneOk, html: Editor.getHTML() }) };
    });

  scenario('fr_replace_with_track_changes_accept_and_reject',
    'Remplacement en mode suivi : Tout accepter garde le nouveau texte, Tout refuser rend l\'ancien',
    async h => {
      const build = async () => {
        await begin(h, '<p>un foo deux foo trois</p>');
        Editor.setTrackChanges(true);
        await sleep(60);
        FindReplace.open({ replace: true });
        FindReplace.setReplacement('bar');
        FindReplace.setQuery('foo');
        await sleep(50);
        FindReplace.replaceAll();
        await sleep(60);
      };
      await build();
      ed().commands.acceptAllSuggestions();
      await sleep(80);
      const accepted = { text: parse(Editor.getHTML()).textContent, marks: parse(Editor.getHTML()).querySelectorAll('ins, del').length };
      await cleanup();
      await build();
      ed().commands.rejectAllSuggestions();
      await sleep(80);
      const rejected = { text: parse(Editor.getHTML()).textContent, marks: parse(Editor.getHTML()).querySelectorAll('ins, del').length };
      return { pass: accepted.text === 'un bar deux bar trois' && accepted.marks === 0 && rejected.text === 'un foo deux foo trois' && rejected.marks === 0, notes: JSON.stringify({ accepted, rejected }) };
    });

  scenario('fr_replace_all_many_results_in_track_changes_stays_fast',
    'Remplacement en mode suivi : 150 résultats remplacés d\'un coup en moins de quelques secondes, une seule étape d\'annulation',
    async h => {
      await begin(h, Array.from({ length: 150 }, (_, i) => '<p>ligne ' + i + ' foo fin</p>').join(''));
      Editor.setTrackChanges(true);
      await sleep(60);
      FindReplace.open({ replace: true });
      FindReplace.setReplacement('bar');
      FindReplace.setQuery('foo');
      await sleep(80);
      const t0 = performance.now();
      const replaced = FindReplace.replaceAll();
      const ms = Math.round(performance.now() - t0);
      await sleep(80);
      const html = parse(Editor.getHTML());
      const pairs = html.querySelectorAll('ins').length;
      undoOnce(); await sleep(80);
      const left = parse(Editor.getHTML()).querySelectorAll('ins').length;
      return { pass: replaced === 150 && pairs === 150 && left === 0 && ms < 8000, notes: JSON.stringify({ replaced, pairs, left, ms }) };
    });

  // === 4) Beaucoup de résultats ============================================================================================================================================
  // Un <span> par résultat se paie à chaque lettre tapée : au-delà de ALL_BELOW (500) résultats, js/find-replace.js ne surligne que l'écran et ses abords.
  const scroller = () => document.getElementById('editor-container');
  const frames = async () => { for (let i = 0; i < 2; i++) await new Promise(r => requestAnimationFrame(() => r())); await sleep(30); };
  // `lines` paragraphes d'une ligne chacun, `perLine` « foo » par ligne (ou aucun : un passage sans résultat).
  const lines = (count, perLine, from) => Array.from({ length: count }, (_, i) => '<p>Ligne ' + ((from || 0) + i) + (perLine ? ' : ' + Array.from({ length: perLine }, () => 'foo').join(' ') : ' sans rien à trouver') + '.</p>').join('');
  // 3 500 résultats : 2 000 en haut, un long passage sans rien, 1 500 en bas.
  const bigDoc = () => lines(400, 5) + lines(300, 0, 400) + lines(300, 5, 700);
  const marksIn = () => tiptap().querySelectorAll('.pp-find-match').length;
  // Les résultats dont la ligne tient entièrement dans la zone de texte visible : combien le document en met là (`expected`), combien le DOM en surligne (`marked`).
  function onScreen(query) {
    const box = scroller().getBoundingClientRect();
    const inside = r => r.top >= box.top + 3 && r.bottom <= box.bottom - 3;
    const expected = find(query).filter(m => inside(ed().view.coordsAtPos(m.from))).length;
    const marked = Array.from(tiptap().querySelectorAll('.pp-find-match')).filter(e => inside(e.getBoundingClientRect())).length;
    return { expected, marked, all: marksIn() };
  }
  const currentOnScreen = () => {
    const cur = tiptap().querySelector('.pp-find-current');
    if (!cur) return false;
    const box = scroller().getBoundingClientRect();
    const r = cur.getBoundingClientRect();
    return r.top >= box.top && r.bottom <= box.bottom;
  };
  const scrollToFraction = async fraction => {
    const s = scroller();
    s.scrollTop = (s.scrollHeight - s.clientHeight) * fraction;
    await frames();
  };
  const BOUND = 1000; // bien moins que les 3 500 résultats : ce que l'écran montre, plus de quoi défiler un peu

  scenario('fr_many_results_highlight_the_screen_and_its_surroundings_only',
    'Beaucoup de résultats : 3 500 « foo » sont comptés, mais seuls ceux de l\'écran et de ses abords sont surlignés (moins de 1 000, tous ceux de l\'écran, le courant en orange)',
    async h => {
      await begin(h, bigDoc());
      scroller().scrollTop = 0;
      FindReplace.open({ replace: false });
      FindReplace.setQuery('foo');
      await frames();
      const shown = onScreen('foo');
      const current = tiptap().querySelectorAll('.pp-find-current').length;
      const pass = countText() === '1 sur 3500' && shown.expected >= 5 && shown.marked >= shown.expected && shown.all >= shown.marked && shown.all < BOUND && current === 1;
      return { pass, notes: JSON.stringify({ count: countText(), shown, current }) };
    });

  scenario('fr_many_results_follow_the_screen_when_scrolling_and_jumping',
    'Beaucoup de résultats : en défilant (quart du modèle, long passage sans résultat, bas), puis en sautant au dernier résultat et au premier, ceux de l\'écran restent tous surlignés et le surlignage reste borné',
    async h => {
      await begin(h, bigDoc());
      scroller().scrollTop = 0;
      FindReplace.open({ replace: false });
      FindReplace.setQuery('foo');
      await frames();
      const steps = [];
      for (const [label, fraction] of [['quart', 0.2], ['passage vide', 0.55], ['bas', 0.97], ['haut', 0.02]]) {
        await scrollToFraction(fraction);
        steps.push(Object.assign({ label }, onScreen('foo')));
      }
      // Le passage sans résultat ne montre rien ; les autres endroits montrent des résultats, tous surlignés.
      const stepsOk = steps.every(s => s.marked >= s.expected && s.all < BOUND) && steps[1].expected === 0 && steps.filter(s => s.label !== 'passage vide').every(s => s.expected >= 5);
      // Depuis le premier résultat, « précédent » saute au dernier (tout en bas), « suivant » revient au premier (tout en haut) : le courant est surligné et à l'écran.
      selectRange(1, 1);
      FindReplace.setQuery('foo');
      await frames();
      FindReplace.prev();
      await frames();
      const last = Object.assign({ count: countText(), current: currentOnScreen() }, onScreen('foo'));
      FindReplace.next();
      await frames();
      const first = Object.assign({ count: countText(), current: currentOnScreen() }, onScreen('foo'));
      const jumpsOk = last.count === '3500 sur 3500' && last.current && last.marked >= last.expected && last.all < BOUND
        && first.count === '1 sur 3500' && first.current && first.marked >= first.expected && first.all < BOUND;
      return { pass: stepsOk && jumpsOk, notes: JSON.stringify({ steps, last, first }) };
    });

  scenario('fr_many_results_follow_an_edit_in_the_text',
    'Beaucoup de résultats : une lettre tapée dans le texte, panneau ouvert, laisse les résultats de l\'écran surlignés (sur le bon texte) et le compteur à jour',
    async h => {
      await begin(h, bigDoc());
      scroller().scrollTop = 0;
      FindReplace.open({ replace: false });
      FindReplace.setQuery('foo');
      await scrollToFraction(0.8);
      const box = scroller().getBoundingClientRect();
      const visible = find('foo').filter(m => { const r = ed().view.coordsAtPos(m.from); return r.top >= box.top + 3 && r.bottom <= box.bottom - 3; });
      // Un « foo » de plus devant le premier de l'écran : tout ce qui suit se décale de quatre positions, la fenêtre de surlignage avec.
      ed().view.dispatch(ed().state.tr.insertText('foo ', visible[0].from));
      await frames();
      const after = onScreen('foo');
      const texts = Array.from(tiptap().querySelectorAll('.pp-find-match')).map(e => e.textContent.toLowerCase());
      const pass = after.marked >= after.expected && after.expected >= 5 && after.all < BOUND && texts.every(t => t === 'foo') && countText() === '1 sur 3501';
      return { pass, notes: JSON.stringify({ after, count: countText(), odd: texts.filter(t => t !== 'foo').slice(0, 5) }) };
    });

  scenario('fr_many_results_follow_a_template_change',
    'Beaucoup de résultats : charger un autre modèle, panneau ouvert, surligne ce qui est à l\'écran même quand les mêmes positions du document tombent ailleurs (lignes plus courtes)',
    async h => {
      await begin(h, lines(1000, 5));
      scroller().scrollTop = 0;
      FindReplace.open({ replace: false });
      FindReplace.setQuery('foo');
      await scrollToFraction(0.5);
      const before = onScreen('foo');
      // 1 000 lignes encore, mais bien plus courtes : la fenêtre de surlignage, en positions du document, tombe maintenant sur d'autres lignes que celles de l'écran.
      Editor.setHTML(lines(1000, 1));
      await frames();
      const after = onScreen('foo');
      const pass = before.expected >= 5 && before.marked >= before.expected && before.all < BOUND && after.expected >= 5 && after.marked >= after.expected && after.all < BOUND && /1000/.test(countText()) && barOpen();
      return { pass, notes: JSON.stringify({ before, after, count: countText(), scrollTop: scroller().scrollTop }) };
    });

  scenario('fr_many_results_are_all_replaced_not_only_the_highlighted',
    'Beaucoup de résultats : « Remplacer » passe au suivant, « Tout remplacer » remplace les 3 499 autres (pas seulement ceux qui sont surlignés) en une étape d\'annulation que « Annuler » défait',
    async h => {
      await begin(h, bigDoc());
      scroller().scrollTop = 0;
      selectRange(1, 1);
      FindReplace.open({ replace: true });
      FindReplace.setReplacement('bar');
      FindReplace.setQuery('foo');
      await frames();
      FindReplace.replaceCurrent();
      await frames();
      const afterOne = { count: countText(), foo: find('foo').length };
      await sleep(600); // plus de 500 ms entre les deux : l'historique ne les groupe pas en une seule étape d'annulation
      const replaced = FindReplace.replaceAll();
      await frames();
      const afterAll = { replaced, foo: find('foo').length, bar: find('bar').length, marks: marksIn(), count: countText() };
      undoOnce();
      await frames();
      const undone = { foo: find('foo').length, bar: find('bar').length };
      const pass = afterOne.count === '1 sur 3499' && afterOne.foo === 3499 && afterAll.replaced === 3499 && afterAll.foo === 0 && afterAll.bar === 3500 && afterAll.marks === 0 && afterAll.count === '3499 remplacements'
        && undone.foo === 3499 && undone.bar === 1;
      return { pass, notes: JSON.stringify({ afterOne, afterAll, undone }) };
    });

  scenario('fr_results_up_to_500_are_all_highlighted_even_off_screen',
    'Peu de résultats : jusqu\'à 500, tous sont surlignés (même hors de l\'écran) ; à 501, seuls l\'écran et ses abords le sont',
    async h => {
      await begin(h, lines(500, 1));
      scroller().scrollTop = 0;
      FindReplace.open({ replace: false });
      FindReplace.setQuery('foo');
      await frames();
      const five = { count: countText(), marks: marksIn() };
      await begin(h, lines(501, 1));
      scroller().scrollTop = 0;
      FindReplace.setQuery('foo');
      await frames();
      const more = { count: countText(), marks: marksIn(), shown: onScreen('foo') };
      const pass = five.marks === 500 && five.count === '1 sur 500' && more.count === '1 sur 501' && more.marks > 0 && more.marks < 501 && more.shown.marked >= more.shown.expected && more.shown.expected >= 5;
      return { pass, notes: JSON.stringify({ five, more }) };
    });

  // === Contrastes du panneau et du surlignage (F5 : 4,5:1 au moins, clair et sombre) ==========================================================================================
  function parseColor(str) {
    const m = String(str).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = c => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

  scenario('fr_contrast_panel_and_highlight_light_and_dark',
    'Contrastes : compteur, champs, boutons du panneau et texte surligné atteignent 4,5:1 en thème clair comme en sombre (la page reste blanche dans les deux)',
    async h => {
      await begin(h, '<p>un foo deux foo</p>');
      const html = document.documentElement;
      const before = html.getAttribute('data-theme');
      const noMotion = document.createElement('style');
      noMotion.textContent = '*, *::before, *::after { transition: none !important; }';
      document.head.appendChild(noMotion);
      const results = {};
      try {
        FindReplace.open({ replace: true });
        FindReplace.setQuery('foo');
        await sleep(60);
        for (const theme of ['light', 'dark']) {
          html.setAttribute('data-theme', theme);
          await sleep(60);
          const surface = parseColor(getComputedStyle(bar()).backgroundColor);
          const rows = {};
          const ofText = (id, bgOverride) => {
            const cs = getComputedStyle(document.getElementById(id));
            const own = parseColor(cs.backgroundColor);
            const bg = bgOverride || (own && own.a > 0 ? own : surface);
            return Math.round(ratio(parseColor(cs.color), bg) * 100) / 100;
          };
          rows.count = ofText('pp-find-count', surface);
          rows.input = ofText('pp-find-input');
          rows.replacement = ofText('pp-find-replacement');
          rows.replaceOne = ofText('pp-find-replace-one');
          rows.prev = ofText('pp-find-prev', surface);
          const matchEl = tiptap().querySelector('.pp-find-match:not(.pp-find-current)');
          const currentEl = tiptap().querySelector('.pp-find-current');
          rows.match = Math.round(ratio(parseColor(getComputedStyle(matchEl).color), parseColor(getComputedStyle(matchEl).backgroundColor)) * 100) / 100;
          rows.current = Math.round(ratio(parseColor(getComputedStyle(currentEl).color), parseColor(getComputedStyle(currentEl).backgroundColor)) * 100) / 100;
          results[theme] = rows;
        }
      } finally {
        if (before === null) html.removeAttribute('data-theme'); else html.setAttribute('data-theme', before);
        noMotion.remove();
      }
      const all = Object.values(results).flatMap(r => Object.values(r));
      return { pass: all.length === 14 && all.every(v => v >= 4.5), notes: JSON.stringify(results) };
    });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.findReplace = cases;
})();
