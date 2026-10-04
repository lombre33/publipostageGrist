// Rechercher / Remplacer dans l'éditeur : un panneau fin entre la barre d'outils et le texte, jamais une fenêtre, pour que le modèle reste visible et
// modifiable pendant qu'on cherche.
//  - Rechercher : tous les résultats surlignés, le courant plus marqué, « 3 sur 12 », précédent / suivant (Entrée, Maj+Entrée), « Respecter la casse
//    » et « Mot entier » ;
//  - Remplacer : « Remplacer » remplace le résultat courant puis passe au suivant, « Tout remplacer » les remplace tous. Un remplacement est une
//    transaction ProseMirror (une seule étape d'annulation, « Tout remplacer » compris) qui garde la mise en forme du texte remplacé et passe par le
//    mode suivi quand il est actif : l'ancien texte devient une suppression suggérée, le nouveau une insertion suggérée (js/track-changes.js ;
//    skipTracking est l'inverse, pour ce que le widget écrit seul) ;
//  - ouverture : Ctrl+F / ⌘F (rechercher) et Ctrl+H / ⌘⇧H (remplacer), même quand le clavier est resté sur un bouton de la barre d'outils, tant que
//    l'éditeur est à l'écran et qu'aucune fenêtre n'est ouverte (sinon la recherche du navigateur reprend la main) ; la loupe de la barre fait de
//    même. Échap ferme et rend le clavier à l'éditeur, le dernier résultat reste sélectionné (on peut taper par-dessus).
// Le moteur (findMatches) ne dépend que d'un document ProseMirror : il se teste sans interface. L'état de la recherche vit dans ce module, pas dans
// le plugin ProseMirror : un changement de modèle reconstruit l'état de l'éditeur (Editor.setHTML) et remettrait sinon la recherche à zéro sous le
// panneau resté ouvert. Styles : css/find-replace.css.
const FindReplace = (function () {
  const el = Dom.el;

  const isMac = () => /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');

  // Le moteur : un document ProseMirror, une requête, des options
  // Le texte d'un bloc est lu caractère pour caractère comme le document compte ses positions : un nœud qui n'est pas du texte (bulle, image,
  // pastille) vaut autant d'OBJECT que sa taille, qu'aucune requête ne trouve et qui coupe un mot ; un saut de ligne vaut « \n ». Le texte d'une
  // suppression suivie (marque `deletion`, encore dans le document tant qu'on ne l'a pas acceptée) vaut aussi des OBJECT : pour qui lit, il n'existe
  // déjà plus, et le retrouver ferait remplacer deux fois le même mot.
  const OBJECT = '\uFFFC';
  const SPACES = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g;
  const SINGLE_QUOTES = /[\u2018\u2019\u201A\u201B\u02BC]/g;
  const DOUBLE_QUOTES = /[\u201C\u201D\u201E]/g;
  const WORD_CHAR = /[\p{L}\p{N}_]/u;
  // Espace insécable, apostrophe et guillemet droits ou typographiques se valent (un texte français a des « mot ! » avec espace fine insécable, des
  // l’apostrophe courbes) ; la substitution est de un caractère pour un caractère, donc les positions trouvées dans le texte normalisé sont celles du
  // texte d'origine.
  const normalize = text => text.replace(SPACES, ' ').replace(SINGLE_QUOTES, "'").replace(DOUBLE_QUOTES, '"');
  const isDeletion = mark => mark.type.name === 'deletion';
  const TRACK_MARKS = new Set(['insertion', 'deletion', 'modification']);

  function textOfBlock(block, blockPos) {
    let text = '';
    const spans = []; // { at: indice dans `text`, pos: position dans le document }, un par enfant
    block.forEach((child, offset) => {
      spans.push({ at: text.length, pos: blockPos + 1 + offset });
      if (child.isText) text += child.marks.some(isDeletion) ? OBJECT.repeat(child.text.length) : child.text;
      else if (child.type.name === 'hardBreak') text += '\n';
      else text += OBJECT.repeat(child.nodeSize);
    });
    return { text, spans };
  }

  // Position dans le document de l'indice `index` du texte du bloc : le dernier enfant qui commence au plus tard à cet indice.
  function positionAt(spans, index) {
    let lo = 0;
    let hi = spans.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (spans[mid].at <= index) lo = mid; else hi = mid - 1;
    }
    return spans[lo].pos + (index - spans[lo].at);
  }

  // Le caractère à `index` (hors du texte : non) est-il une lettre, un chiffre ou « _ » ? Une paire de substitution (lettre hors du plan de base) se
  // lit en entier.
  function isWordCharAt(text, index) {
    if (index < 0 || index >= text.length) return false;
    let codePoint = text.codePointAt(index);
    if (index > 0 && codePoint >= 0xDC00 && codePoint <= 0xDFFF && text.codePointAt(index - 1) > 0xFFFF) codePoint = text.codePointAt(index - 1);
    return WORD_CHAR.test(String.fromCodePoint(codePoint));
  }

  // Les correspondances de `query` dans `doc`, dans l'ordre du document : [{ from, to }]. Chaque bloc de texte se cherche à part (une correspondance
  // ne traverse jamais deux paragraphes ni deux cases), à travers les changements de mise en forme dans le bloc (« bon<b>jour</b> » se trouve). Sans
  // chevauchement : « aa » dans « aaaa » vaut deux. options : { matchCase, wholeWord }. Casse ignorée par défaut (`i` + `u` : « É » et « é » se
  // valent, « e » et « é » non).
  function findMatches(doc, query, options) {
    const opts = options || {};
    const needle = normalize(String(query == null ? '' : query).split(OBJECT).join(''));
    if (!needle) return [];
    const matcher = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), opts.matchCase ? 'gu' : 'giu');
    const matches = [];
    doc.descendants((node, pos) => {
      if (!node.isTextblock) return true;
      const { text, spans } = textOfBlock(node, pos);
      if (!spans.length) return false;
      const haystack = normalize(text);
      matcher.lastIndex = 0;
      let found;
      while ((found = matcher.exec(haystack))) {
        const start = found.index;
        const end = start + found[0].length;
        // « Mot entier » : un mot collé à la correspondance la disqualifie ; la recherche reprend à l'indice suivant (« ana » dans « banana ana »).
        if (opts.wholeWord && (isWordCharAt(haystack, start - 1) || isWordCharAt(haystack, end))) { matcher.lastIndex = start + 1; continue; }
        matches.push({ from: positionAt(spans, start), to: positionAt(spans, end - 1) + 1 });
      }
      return false;
    });
    return matches;
  }

  // L'état de la recherche
  const META = 'ppFindReplace';
  const MAX_PREFILL = 120; // une sélection plus longue n'est pas un mot à chercher
  const state = { open: false, query: '', replacement: '', matchCase: false, wholeWord: false, replaceVisible: false, flash: '', flashDoc: null };
  let cache = null; // { doc, query, matchCase, wholeWord, matches } : les résultats d'un même document ne se recalculent pas à chaque transaction
  let pm = null; // { Plugin, PluginKey, Decoration, DecorationSet } de ProseMirror, fournis par js/editor.js

  const editor = () => EditorCore.getEditor();

  function currentMatches(pmState) {
    if (!state.query) return [];
    if (!cache || cache.doc !== pmState.doc || cache.query !== state.query || cache.matchCase !== state.matchCase || cache.wholeWord !== state.wholeWord) {
      cache = { doc: pmState.doc, query: state.query, matchCase: state.matchCase, wholeWord: state.wholeWord, matches: findMatches(pmState.doc, state.query, state) };
    }
    return cache.matches;
  }

  // Indice du résultat que la sélection de l'éditeur recouvre exactement (le « résultat courant »), -1 sinon.
  function indexOfSelection(matches, selection) {
    return matches.findIndex(m => m.from === selection.from && m.to === selection.to);
  }

  // Surlignage et raccourcis (une extension TipTap)
  function decorationsFor(pmState) {
    if (!state.open || !state.query) return null;
    const matches = currentMatches(pmState);
    if (!matches.length) return null;
    const { from, to } = pmState.selection;
    return pm.DecorationSet.create(pmState.doc, matches.map(m => pm.Decoration.inline(m.from, m.to, { class: m.from === from && m.to === to ? 'pp-find-match pp-find-current' : 'pp-find-match' })));
  }

  // pmClasses : { Plugin, PluginKey, Decoration, DecorationSet } (js/editor.js les importe déjà).
  function createExtension(Extension, pmClasses) {
    pm = pmClasses;
    return Extension.create({
      name: 'findReplace',
      addProseMirrorPlugins() {
        return [new pm.Plugin({ key: new pm.PluginKey('ppFindReplace'), props: { decorations: decorationsFor } })];
      },
    });
  }

  // Redessine le surlignage et le compteur sans toucher au document : une transaction vide, comme partout ailleurs dans l'éditeur (cf. Editor.init,
  // I18n.onChange).
  function refresh() {
    const ed = editor();
    if (ed) ed.view.dispatch(ed.state.tr.setMeta(META, true));
  }

  // Se placer sur un résultat
  // Le résultat devient la sélection de l'éditeur (le panneau garde le focus : ProseMirror ne touche pas à la sélection du navigateur quand il ne l'a
  // pas) ; son surlignage vient des décorations, la sélection du navigateur étant alors dans le champ de recherche. La zone de défilement amène le
  // résultat au milieu quand il est hors de vue.
  function select(match) {
    const ed = editor();
    const TextSelection = EditorCore.getTextSelectionClass();
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, match.from, match.to)).setMeta(META, true));
    reveal(match);
  }

  function reveal(match) {
    const ed = editor();
    const scroller = document.getElementById('editor-container');
    if (!ed || !scroller) return;
    let rect;
    try { rect = ed.view.coordsAtPos(match.from); } catch (e) { return; }
    const box = scroller.getBoundingClientRect();
    const margin = 24;
    if (rect.top >= box.top + margin && rect.bottom <= box.bottom - margin) return;
    scroller.scrollTop += (rect.top + rect.bottom) / 2 - (box.top + box.bottom) / 2;
  }

  // Suivant (ou précédent) à partir de la sélection, en repartant de l'autre bout du document quand il n'y en a plus.
  function go(backwards) {
    const ed = editor();
    if (!ed || !state.query) return false;
    const matches = currentMatches(ed.state);
    if (!matches.length) return false;
    const { from, to } = ed.state.selection;
    let target;
    if (backwards) {
      for (let i = matches.length - 1; i >= 0 && !target; i--) if (matches[i].to <= from) target = matches[i];
      if (!target) target = matches[matches.length - 1];
    } else {
      target = matches.find(m => m.from >= to) || matches[0];
    }
    state.flash = '';
    select(target);
    return true;
  }

  // La requête ou une option vient de changer : on se place sur le premier résultat à partir du début de la sélection (la frappe d'un mot qui
  // s'allonge reste donc sur place).
  function applyQuery() {
    const ed = editor();
    if (!ed) return;
    state.flash = '';
    const matches = state.query ? currentMatches(ed.state) : [];
    const { from, to } = ed.state.selection;
    const target = matches.find(m => m.from >= from) || matches[0];
    if (target && !(target.from === from && target.to === to)) select(target); else refresh();
  }

  // Remplacer
  // Le texte qui remplace garde la mise en forme du premier caractère remplacé (gras, couleur, lien : une marque de lien n'est pas « inclusive »,
  // insertText la perdrait en fin de lien). En mode suivi, les marques de suivi héritées sont retirées : c'est le mode qui pose celles de
  // l'insertion.
  function replacementMarks(doc, pos, suggest) {
    const $pos = doc.resolve(pos);
    const after = $pos.nodeAfter;
    let marks = after && after.isText ? after.marks : [];
    marks = marks.filter(mark => mark.type.name !== 'deletion' && !(suggest && TRACK_MARKS.has(mark.type.name)));
    return $pos.parent.type.allowedMarks(marks);
  }

  function replaceInTransaction(tr, doc, match, text, suggest) {
    if (text) tr.replaceWith(match.from, match.to, doc.type.schema.text(text, replacementMarks(doc, match.from, suggest)));
    else tr.delete(match.from, match.to);
  }

  // Envoie `tr` et rend la transaction réellement appliquée (celle que le pont du suivi a transformée en suggestions, le cas échéant), ou null si
  // elle a été refusée.
  function dispatchAndCapture(tr) {
    const ed = editor();
    let applied = null;
    const grab = ({ transaction }) => { if (transaction.docChanged) applied = transaction; };
    ed.on('transaction', grab);
    try { ed.view.dispatch(tr); } finally { ed.off('transaction', grab); }
    return applied;
  }

  // Remplace le résultat courant, puis se place sur le suivant. Sans résultat courant (la sélection n'est pas sur un résultat), « Remplacer » ne fait
  // que se placer sur le prochain : on voit ce qui va être remplacé avant de le remplacer.
  function replaceCurrent() {
    const ed = editor();
    if (!ed || !ed.isEditable || !state.query) return false;
    const matches = currentMatches(ed.state);
    const index = indexOfSelection(matches, ed.state.selection);
    if (index < 0) return go(false);
    const match = matches[index];
    const tr = ed.state.tr;
    replaceInTransaction(tr, ed.state.doc, match, state.replacement, Editor.isTrackChangesOn());
    const applied = dispatchAndCapture(tr);
    if (!applied) { setFlash(I18n.t('find.replaceFailed')); return false; }
    // Ce qui suit le texte qui vient d'être mis : la fin du remplacement dans le document final (en mode suivi, après l'insertion qui suit la
    // suppression).
    const end = applied.mapping.map(match.to, 1);
    const rest = currentMatches(ed.state);
    const next = rest.find(m => m.from >= end) || rest[0];
    state.flash = '';
    if (next) select(next);
    else {
      const TextSelection = EditorCore.getTextSelectionClass();
      ed.view.dispatch(ed.state.tr.setSelection(TextSelection.near(ed.state.doc.resolve(Math.min(end, ed.state.doc.content.size)))).setMeta(META, true));
    }
    return true;
  }

  // Tous les résultats en une transaction (donc une seule annulation), du dernier au premier : les positions des résultats d'avant ne bougent pas.
  function replaceAll() {
    const ed = editor();
    if (!ed || !ed.isEditable || !state.query) return 0;
    const matches = currentMatches(ed.state);
    if (!matches.length) return 0;
    const suggest = Editor.isTrackChangesOn();
    const doc = ed.state.doc;
    const tr = ed.state.tr;
    for (let i = matches.length - 1; i >= 0; i--) replaceInTransaction(tr, doc, matches[i], state.replacement, suggest);
    const applied = dispatchAndCapture(tr);
    if (!applied) { setFlash(I18n.t('find.replaceFailed')); return 0; }
    setFlash(I18n.t('find.replaced', { count: matches.length }));
    return matches.length;
  }

  // Le panneau
  let bar = null;
  let refs = null;

  function iconButton(icon, className) {
    const b = el('button', 'pp-find-btn' + (className ? ' ' + className : ''));
    b.type = 'button';
    b.innerHTML = Icons.svg(icon);
    return b;
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
    if (bar) return;
    const container = document.getElementById('editor-container');
    bar = el('div', 'pp-find-bar');
    bar.id = 'pp-find-bar';
    bar.setAttribute('role', 'search');
    bar.hidden = true;

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
    const close = iconButton('closeFind', 'pp-find-close');
    close.id = 'pp-find-close';
    findRow.append(toggle, find, count, prev, next, matchCase, wholeWord, close);

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

    bar.append(findRow, replaceRow);
    container.parentNode.insertBefore(bar, container);
    refs = { toggle, find, count, prev, next, matchCase, wholeWord, close, replaceRow, replacement, one, all };
    wirePanel();
    applyTexts();
    I18n.onChange(() => { if (bar) { applyTexts(); updateCount(); } });
  }

  // Textes du panneau, relus à chaque changement de langue. Info-bulle native (title) : le panneau vit hors de #toolbar-top, où s'applique le
  // [data-tip] de la barre.
  function applyTexts() {
    const t = key => I18n.t(key);
    bar.setAttribute('aria-label', t('find.aria'));
    const label = (button, key) => { button.setAttribute('aria-label', t(key)); button.title = t(key); };
    label(refs.toggle, 'find.toggleReplace');
    label(refs.prev, 'find.prev');
    label(refs.next, 'find.next');
    label(refs.matchCase, 'find.matchCase');
    label(refs.wholeWord, 'find.wholeWord');
    label(refs.close, 'find.close');
    refs.find.setAttribute('aria-label', t('find.find.label'));
    refs.find.placeholder = t('find.find.placeholder');
    refs.replacement.setAttribute('aria-label', t('find.replacement.label'));
    refs.replacement.placeholder = t('find.replacement.placeholder');
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

  // « 3 sur 12 » quand la sélection est sur un résultat, « 12 résultats » sinon, « Aucun résultat » ; après « Tout remplacer », le nombre de
  // remplacements jusqu'à la prochaine action.
  function updateCount() {
    if (!bar || !refs) return;
    const ed = editor();
    if (state.flash && ed && ed.state.doc !== state.flashDoc) state.flash = '';
    const matches = ed ? currentMatches(ed.state) : [];
    const index = ed ? indexOfSelection(matches, ed.state.selection) : -1;
    let text = '';
    let kind = 'idle';
    if (state.flash) { text = state.flash; kind = 'flash'; }
    else if (state.query && !matches.length) { text = I18n.t('find.count.none'); kind = 'none'; }
    else if (matches.length) { text = index >= 0 ? I18n.t('find.count.index', { index: index + 1, count: matches.length }) : I18n.t('find.count.total', { count: matches.length }); kind = 'some'; }
    if (refs.count.textContent !== text) refs.count.textContent = text;
    refs.count.dataset.kind = kind;
    const none = !matches.length;
    setDisabled(refs.prev, none);
    setDisabled(refs.next, none);
    const canReplace = !none && !!ed && ed.isEditable;
    setDisabled(refs.one, !canReplace);
    setDisabled(refs.all, !canReplace);
  }

  const isDisabled = button => button.getAttribute('aria-disabled') === 'true';

  function wirePanel() {
    const { toggle, find, prev, next, matchCase, wholeWord, close, replacement, one, all } = refs;
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
    bar.addEventListener('keydown', event => {
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
        if (key === 'y' || event.shiftKey) ed.commands.redo(); else ed.commands.undo();
      }
    });
    toggle.addEventListener('click', () => setReplaceVisible(!state.replaceVisible));
    prev.addEventListener('click', () => { if (!isDisabled(prev)) go(true); });
    next.addEventListener('click', () => { if (!isDisabled(next)) go(false); });
    const toggleOption = (button, key) => {
      state[key] = !state[key];
      button.setAttribute('aria-pressed', state[key] ? 'true' : 'false');
      applyQuery();
    };
    matchCase.addEventListener('click', () => toggleOption(matchCase, 'matchCase'));
    wholeWord.addEventListener('click', () => toggleOption(wholeWord, 'wholeWord'));
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
    if (prefill !== null) state.query = prefill;
    refs.find.value = state.query;
    refs.replacement.value = state.replacement;
    state.open = true;
    bar.hidden = false;
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
    if (bar) bar.hidden = true;
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

  function wireEditor(ed) {
    ed.on('transaction', () => { if (state.open) updateCount(); });
    document.addEventListener('keydown', onDocumentKeydown);
  }

  // La loupe de la barre : ouvre le panneau, ou le ferme quand il est déjà ouvert.
  function toggleOpen() {
    if (state.open) closePanel(); else open({ replace: false });
  }

  return {
    findMatches, createExtension, wireEditor, open, close: closePanel, toggle: toggleOpen,
    isOpen: () => state.open,
    next: () => go(false), prev: () => go(true), replaceCurrent, replaceAll,
    setQuery(query) { state.query = String(query == null ? '' : query); if (refs) refs.find.value = state.query; applyQuery(); },
    setOptions(options) {
      if (options && options.matchCase !== undefined) state.matchCase = !!options.matchCase;
      if (options && options.wholeWord !== undefined) state.wholeWord = !!options.wholeWord;
      if (refs) { refs.matchCase.setAttribute('aria-pressed', state.matchCase ? 'true' : 'false'); refs.wholeWord.setAttribute('aria-pressed', state.wholeWord ? 'true' : 'false'); }
      applyQuery();
    },
    setReplacement(text) { state.replacement = String(text == null ? '' : text); if (refs) refs.replacement.value = state.replacement; },
  };
})();
