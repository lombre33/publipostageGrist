// Rechercher / Remplacer, le panneau : la barre fine sous la barre d'outils (champs, options, compteur, précédent / suivant, remplacer), son ouverture et sa fermeture, le message
// « N remplacés ». Les éléments du panneau (`refs`) ne vivent que dans ce fichier. Façade : js/find-replace.js. Styles : css/find-replace.css.
const FindReplacePanel = (function () {
  const el = Dom.el;
  let findBar = null;
  let refs = null;

  const { META, state, editor, allStories, indexOfSelection, refresh, scheduleWindow, placeWindow } = FindReplaceView;
  const { compile, escapeRegex, OBJECT } = FindReplaceEngine;
  const { go, applyQuery, replaceCurrent, replaceAll, reopenForUndo, forgetReplacement } = FindReplaceActions;

  const MAX_PREFILL = 120; // une sélection plus longue n'est pas un mot à chercher
  const isMac = () => /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');

  function iconButton(icon, className) {
    const button = el('button', 'pp-find-btn' + (className ? ' ' + className : ''));
    button.type = 'button';
    Dom.setMarkup(button, Icons.svg(icon));
    return button;
  }
  function field(id) {
    const input = el('input', 'pp-find-input');
    input.id = id;
    input.type = 'text';
    input.autocomplete = 'off';
    input.autocapitalize = 'off';
    input.spellcheck = false;
    return input;
  }

  function setFlash(text) {
    state.flash = text;
    state.flashDoc = editor() ? editor().state.doc : null;
    updateCount();
  }

  function ensure() {
    if (findBar) return;
    const container = document.getElementById('editor-container');
    findBar = el('div', 'pp-find-bar');
    findBar.id = 'pp-find-bar';
    findBar.setAttribute('role', 'search');
    // Ses boutons gardent le focus et le panneau défait lui-même (wirePanel) : le raccourci d'Annuler de js/shortcuts.js ne prend pas la touche ici.
    findBar.setAttribute('data-own-undo', '');
    findBar.hidden = true;

    const findRow = el('div', 'pp-find-row');
    const toggle = iconButton('chevronRight', 'pp-find-toggle');
    toggle.id = 'pp-find-toggle-replace';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'pp-find-replace-row');
    const find = field('pp-find-input');
    const count = el('span', 'pp-find-count');
    count.id = 'pp-find-count';
    count.setAttribute('role', 'status');
    count.setAttribute('aria-live', 'polite');
    const prev = iconButton('chevronUp');
    prev.id = 'pp-find-prev';
    const next = iconButton('chevronDown');
    next.id = 'pp-find-next';
    const matchCase = iconButton('matchCase', 'pp-find-option');
    matchCase.id = 'pp-find-match-case';
    matchCase.setAttribute('aria-pressed', 'false');
    const wholeWord = iconButton('wholeWord', 'pp-find-option');
    wholeWord.id = 'pp-find-whole-word';
    wholeWord.setAttribute('aria-pressed', 'false');
    const regex = iconButton('regex', 'pp-find-option');
    regex.id = 'pp-find-regex';
    regex.setAttribute('aria-pressed', 'false');
    const close = iconButton('closeFind', 'pp-find-close');
    close.id = 'pp-find-close';
    findRow.append(toggle, find, count, prev, next, matchCase, wholeWord, regex, close);

    const replaceRow = el('div', 'pp-find-row');
    replaceRow.id = 'pp-find-replace-row';
    replaceRow.hidden = true;
    const spacer = el('span', 'pp-find-spacer');
    const replacement = field('pp-find-replacement');
    const one = el('button', 'pp-find-text-btn');
    one.type = 'button';
    one.id = 'pp-find-replace-one';
    const all = el('button', 'pp-find-text-btn');
    all.type = 'button';
    all.id = 'pp-find-replace-all';
    replaceRow.append(spacer, replacement, one, all);

    findBar.append(findRow, replaceRow);
    container.parentNode.insertBefore(findBar, container);
    container.addEventListener('scroll', placeWindow, { passive: true });
    refs = { toggle, find, count, prev, next, matchCase, wholeWord, regex, close, replaceRow, replacement, one, all };
    wirePanel();
    applyTexts();
  }

  // Textes du panneau, écrits quand il se bâtit. Info-bulle native (title) : le panneau vit hors de #toolbar-top, où s'applique le
  // [data-tip] de la barre.
  function applyTexts() {
    const t = key => I18n.t(key);
    findBar.setAttribute('aria-label', t('find.aria'));
    const label = (button, key) => { button.setAttribute('aria-label', t(key)); button.title = t(key); };
    label(refs.toggle, 'find.toggleReplace');
    label(refs.prev, 'find.prev');
    label(refs.next, 'find.next');
    label(refs.matchCase, 'find.matchCase');
    label(refs.wholeWord, 'find.wholeWord');
    label(refs.regex, 'find.regex');
    label(refs.close, 'find.close');
    refs.find.setAttribute('aria-label', t('find.find.label'));
    refs.find.placeholder = t('find.find.placeholder');
    refs.replacement.setAttribute('aria-label', t('find.replacement.label'));
    refs.replacement.placeholder = t(state.regex ? 'find.replacement.placeholderRegex' : 'find.replacement.placeholder');
    refs.one.textContent = t('find.replaceOne');
    refs.all.textContent = t('find.replaceAll');
  }

  function setReplaceVisible(visible) {
    state.replaceVisible = visible;
    refs.replaceRow.hidden = !visible;
    refs.toggle.setAttribute('aria-expanded', visible ? 'true' : 'false');
  }

  function setDisabled(button, disabled) {
    // aria-disabled plutôt que disabled : le bouton garde le focus quand le dernier résultat vient d'être remplacé (un bouton désactivé le perdrait
    // au profit de <body>).
    if (disabled) button.setAttribute('aria-disabled', 'true'); else button.removeAttribute('aria-disabled');
  }

  // L'erreur de l'expression régulière en cours de frappe, null quand le motif est bon, vide, ou que l'option n'est pas allumée.
  function queryError() {
    return state.regex && state.query ? compile(state.query, state).error || null : null;
  }
  // Le champ dit que son motif est faux (lecteur d'écran : aria-invalid), et l'info-bulle du compteur donne la raison du navigateur, en anglais
  // dans la plupart d'entre eux : « 3 sur 12 » ne dit pas où est la parenthèse oubliée.
  function syncRegexError() {
    const error = queryError();
    if (error) { refs.find.setAttribute('aria-invalid', 'true'); refs.count.title = error.message; } else { refs.find.removeAttribute('aria-invalid'); refs.count.removeAttribute('title'); }
  }
  // Les trois options reflètent l'état de la recherche (il survit à la fermeture du panneau, et `setOptions` peut le changer avant que le panneau n'existe) ;
  // le champ de remplacement dit ce qu'il comprend selon l'option « Expression régulière ».
  function syncOptions() {
    if (!refs) return;
    for (const key of ['matchCase', 'wholeWord', 'regex']) refs[key].setAttribute('aria-pressed', state[key] ? 'true' : 'false');
    refs.replacement.placeholder = I18n.t(state.regex ? 'find.replacement.placeholderRegex' : 'find.replacement.placeholder');
  }

  // « 3 sur 12 » quand la sélection est sur un résultat, « 12 résultats » sinon, « Aucun résultat » ; après « Tout remplacer », le nombre de
  // remplacements jusqu'à la prochaine action.
  // `total` : les résultats de tous les textes du modèle (le corps, l'en-tête, le pied) ; `index` : le rang du résultat courant parmi eux.
  function countLabel(total, index) {
    if (queryError()) return { text: I18n.t('find.regexInvalid'), kind: 'error' };
    if (state.flash) return { text: state.flash, kind: 'flash' };
    if (state.query && !total) return { text: I18n.t('find.count.none'), kind: 'none' };
    if (!total) return { text: '', kind: 'idle' };
    return { text: index >= 0 ? I18n.t('find.count.index', { index: index + 1, count: total }) : I18n.t('find.count.total', { count: total }), kind: 'some' };
  }
  function updateCount() {
    if (!findBar || !refs) return;
    const ed = editor();
    if (state.flash && ed && ed.state.doc !== state.flashDoc) state.flash = '';
    const stories = ed ? allStories(ed.state) : [];
    const at = stories.findIndex(story => story.live);
    const total = stories.reduce((sum, story) => sum + story.matches.length, 0);
    const own = at >= 0 ? indexOfSelection(stories[at].matches, ed.state.selection) : -1;
    const before = stories.slice(0, Math.max(at, 0)).reduce((sum, story) => sum + story.matches.length, 0);
    const label = countLabel(total, own >= 0 ? before + own : -1);
    if (refs.count.textContent !== label.text) refs.count.textContent = label.text;
    refs.count.dataset.kind = label.kind;
    syncRegexError();
    const none = !total;
    setDisabled(refs.prev, none);
    setDisabled(refs.next, none);
    // « Remplacer » va aussi au résultat d'un autre texte ; « Tout remplacer » agit sur le texte ouvert.
    const canReplace = !none && !!ed && ed.isEditable;
    setDisabled(refs.one, !canReplace);
    setDisabled(refs.all, !canReplace || !stories[at].matches.length);
  }

  const isDisabled = button => button.getAttribute('aria-disabled') === 'true';

  function wirePanel() {
    const { toggle, find, prev, next, matchCase, wholeWord, regex, close, replacement, one, all } = refs;
    find.addEventListener('input', () => { state.query = find.value; applyQuery(); });
    replacement.addEventListener('input', () => { state.replacement = replacement.value; });
    find.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.isComposing) return;
      event.preventDefault();
      go(event.shiftKey);
    });
    // Entrée dans le champ de remplacement remplace, comme le bouton.
    replacement.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.isComposing) return;
      event.preventDefault();
      replaceCurrent();
    });
    // Échap ferme depuis n'importe quel contrôle du panneau ; Ctrl+F et Ctrl+H y servent à aller au champ voulu (jamais à la recherche du
    // navigateur).
    findBar.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closePanel(); return; }
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'f') { event.preventDefault(); find.focus(); find.select(); }
      else if (key === 'h') { event.preventDefault(); showReplace(); }
      else if ((key === 'z' || key === 'y') && event.target.tagName !== 'INPUT') {
        // Un clic sur « Remplacer » laisse le clavier sur ce bouton, qui n'a pas d'historique : Ctrl+Z y défait le remplacement dans le modèle
        // (Ctrl+Maj+Z ou Ctrl+Y le refait). Dans un champ, Ctrl+Z reste celui du champ.
        event.preventDefault();
        const ed = editor();
        if (!ed || !ed.isEditable) return;
        if (key === 'y' || event.shiftKey) ed.commands.redo(); else { reopenForUndo(); ed.commands.undo(); }
      }
    });
    toggle.addEventListener('click', () => setReplaceVisible(!state.replaceVisible));
    prev.addEventListener('click', () => { if (!isDisabled(prev)) go(true); });
    next.addEventListener('click', () => { if (!isDisabled(next)) go(false); });
    const toggleOption = key => {
      state[key] = !state[key];
      syncOptions();
      applyQuery();
    };
    matchCase.addEventListener('click', () => toggleOption('matchCase'));
    wholeWord.addEventListener('click', () => toggleOption('wholeWord'));
    regex.addEventListener('click', () => toggleOption('regex'));
    close.addEventListener('click', () => closePanel());
    one.addEventListener('click', () => { if (!isDisabled(one)) replaceCurrent(); });
    all.addEventListener('click', () => { if (!isDisabled(all)) replaceAll(); });
  }

  function showReplace() {
    if (!editor() || !editor().isEditable) return;
    setReplaceVisible(true);
    refs.replacement.focus();
    refs.replacement.select();
  }

  // Le mot sélectionné dans le texte, s'il y en a un à reprendre dans le champ (une seule ligne, courte, sans bulle).
  function selectedQuery(ed) {
    const { from, to, empty } = ed.state.selection;
    if (empty || to - from > MAX_PREFILL) return null;
    const text = ed.state.doc.textBetween(from, to, '\n', OBJECT);
    return text && !/[\n\uFFFC]/.test(text) ? text : null;
  }

  function updateToolbarButton(isOpen) {
    const button = document.getElementById('v2-btn-find');
    if (!button) return;
    button.classList.toggle('is-active', isOpen);
    button.setAttribute('aria-pressed', isOpen ? 'true' : 'false');
  }

  // Ouvre le panneau (ou rend le clavier à son champ s'il l'est déjà). `replace` : montre aussi la ligne « Remplacer par ». Faux sans rien ouvrir
  // quand l'éditeur n'est pas à l'écran (Lecture, macro-modèle).
  function open(options) {
    const ed = editor();
    const container = document.getElementById('editor-container');
    if (!ed || !container || container.offsetParent === null) return false;
    ensure();
    const wantReplace = !!(options && options.replace) && ed.isEditable;
    const prefill = selectedQuery(ed);
    if (prefill !== null) state.query = state.regex ? escapeRegex(prefill) : prefill; // en expression régulière, le mot repris se cherche tel quel
    refs.find.value = state.query;
    refs.replacement.value = state.replacement;
    syncOptions();
    state.open = true;
    findBar.hidden = false;
    setReplaceVisible(ed.isEditable && (wantReplace || state.replaceVisible));
    state.flash = '';
    updateToolbarButton(true);
    refresh();
    // Un mot repris de la sélection + « remplacer » : le champ utile est celui du remplacement.
    if (wantReplace && state.query) { refs.replacement.focus(); refs.replacement.select(); } else { refs.find.focus(); refs.find.select(); }
    return true;
  }

  // Ferme le panneau et efface le surlignage. `focus: false` quand l'éditeur n'est plus à l'écran (js/main.js, Mode lecture) : lui rendre le clavier
  // n'aurait pas de sens.
  function closePanel(options) {
    if (!state.open) return;
    state.open = false;
    forgetReplacement();
    state.win = null;
    if (findBar) findBar.hidden = true;
    updateToolbarButton(false);
    const ed = editor();
    if (!ed) return;
    refresh();
    if (!options || options.focus !== false) ed.commands.focus();
  }

  // Ctrl+F et Ctrl+H sur le document, pas sur l'éditeur : après un clic sur un bouton de la barre d'outils le focus n'est plus dans le texte, et la
  // recherche du navigateur s'ouvrirait à la place. Ils laissent la main à qui les a déjà pris (le champ du panneau), à une fenêtre ouverte, et au
  // navigateur quand l'éditeur n'est pas à l'écran (Mode lecture, macro-modèle).
  const anyWindowOpen = () => Array.from(document.querySelectorAll('.pp-modal')).some(overlay => getComputedStyle(overlay).display !== 'none');
  function onDocumentKeydown(event) {
    if (event.defaultPrevented || event.altKey || event.isComposing || !(isMac() ? event.metaKey : event.ctrlKey)) return;
    const key = event.key.toLowerCase();
    if (!(key === 'f' && !event.shiftKey) && key !== 'h') return;
    if (anyWindowOpen()) return;
    if (open({ replace: key === 'h' })) event.preventDefault();
  }

  // Annuler (Ctrl+Z dans le texte, bouton Annuler de la barre) juste après un « Remplacer » qui a changé de texte : on rouvre d'abord le texte du remplacement (reopenForUndo), et
  // l'Annuler habituel, celui de l'éditeur ou du bouton, le défait. En capture, pour passer avant l'éditeur et avant le bouton, sans rien leur retirer ni les remplacer. Le panneau
  // fait de même pour ses propres boutons (wirePanel) ; un champ (celui du panneau, une fenêtre) défait sa frappe, il n'est pas concerné.
  function onUndoKeydown(event) {
    if (event.defaultPrevented || event.altKey || event.shiftKey || event.isComposing || !(isMac() ? event.metaKey : event.ctrlKey)) return;
    if ((event.key || '').toLowerCase() !== 'z') return;
    const ed = editor();
    if (ed && ed.view.dom.contains(event.target)) reopenForUndo();
  }
  function onUndoClick(event) {
    if (event.target.closest && event.target.closest('#v2-btn-undo')) reopenForUndo();
  }

  function wireEditor(ed) {
    ed.on('transaction', ({ transaction }) => {
      if (!state.open) return;
      updateCount();
      if (!transaction || transaction.getMeta(META) !== 'window') scheduleWindow();
    });
    document.addEventListener('keydown', onDocumentKeydown);
    document.addEventListener('keydown', onUndoKeydown, true);
    document.addEventListener('click', onUndoClick, true);
    // Le compteur compte aussi l'en-tête et le pied : il suit « Première page différente » et le chargement d'un modèle, qui ne passent par aucune transaction. Un autre modèle, ou
    // d'autres textes, ne sont plus ceux du dernier remplacement : Annuler ne le rouvre plus.
    HeaderFooterPreview.onStoriesChange(() => { forgetReplacement(); if (state.open) updateCount(); });
  }

  // La loupe de la barre : ouvre le panneau, ou le ferme quand il est déjà ouvert.
  function toggleOpen() {
    if (state.open) closePanel(); else open({ replace: false });
  }

  // Les deux champs, remis au texte de l'état quand la façade pose une requête ou un remplacement (setQuery, setReplacement).
  const showQuery = () => { if (refs) refs.find.value = state.query; };
  const showReplacement = () => { if (refs) refs.replacement.value = state.replacement; };

  return { setFlash, open, closePanel, toggleOpen, wireEditor, syncOptions, queryError, showQuery, showReplacement };
})();
