// Suivi des modifications : le volet « Modifications » - la liste de toutes les modifications en attente à droite du texte (qui, quand, un extrait), un clic pour aller à l'une, « Accepter » et
// « Refuser » sur sa ligne, « Précédent » et « Suivant » pour les parcourir. Ouvert par la ligne « Liste des modifications » du menu « Édition collaborative » (js/main-toolbar.js). Le contenu
// vient de Editor.getSuggestionEntries (js/track-changes-list.js) ; le volet ne change jamais le document par lui-même, seules ses boutons résolvent une modification. Façade : TrackChangesPane.
// Styles : css/track-changes-pane.css.
const TrackChangesPane = (function () {
  const el = Dom.el;
  const PAGE_SIZE = 200;          // lignes montrées d'un coup ; « Afficher la suite » en ajoute autant
  const REFRESH_MS = 150;         // la liste se redessine une fois la frappe calmée
  // `filter` : null pour tout le monde, sinon la clé d'une personne (TrackChangesList.personKey ; '' pour les modifications sans auteur connu).
  const state = { open: false, entries: [], people: [], filter: null, current: -1, shown: PAGE_SIZE };
  let editor = null;
  let pane = null;
  let refs = null;
  let timer = 0;
  let observer = null;

  const t = (key, params) => I18n.t(key, params);
  const container = () => document.getElementById('editor-container');
  const matchesFilter = entry => state.filter === null || (entry.personKey || '') === state.filter;
  const visibleEntries = () => state.entries.filter(matchesFilter);
  const filteredPerson = () => state.people.find(person => person.key === state.filter) || null;
  const personName = person => person.key === '' ? t('trackList.author.unknown') : person.name;

  // Ce que fait une modification, en mots : « Ajout », « Suppression », « Remplacement », « Colonne ajoutée »... ; pour un réglage, son nom quand on le connaît (l'alignement, l'interligne...).
  const SETTING_KEYS = {
    textAlign: 'align', lineHeight: 'lineHeight', spaceBefore: 'spacing', spaceAfter: 'spacing', indentLeft: 'indent', indentFirst: 'indent', keepNext: 'keepNext',
    backgroundColor: 'cellBackground', colwidth: 'columnWidth', colspan: 'merged', rowspan: 'merged',
  };
  function whatOf(entry) {
    const { action, subject } = entry;
    if (action === 'format') {
      if (subject === 'text') return t('trackList.what.formatText');
      if (entry.settings[0] === 'nodeType') return entry.nodeType === 'heading' ? t('trackList.what.heading', { n: entry.level || 1 }) : t('trackList.what.blockType');
      const key = SETTING_KEYS[entry.settings[0]];
      return t(key ? 'trackList.setting.' + key : 'trackList.what.format');
    }
    return t('trackList.what.' + action + '.' + subject);
  }

  // L'extrait sous le titre de la ligne : ce qui est ajouté (+), retiré (−), ou les deux. Rien pour un réglage, une colonne, une ligne.
  function extractNodes(entry) {
    const nodes = [];
    const part = (sign, className, text) => {
      const line = el('span', 'pp-trackpane-extract ' + className);
      line.append(el('span', 'pp-trackpane-sign', sign), el('span', 'pp-trackpane-text', text));
      nodes.push(line);
    };
    if (entry.action === 'format' && entry.subject === 'text') part('', 'is-kept', entry.inserted);
    else {
      if (entry.deleted) part('−', 'is-deleted', entry.deleted);
      if (entry.inserted) part('+', 'is-inserted', entry.inserted);
    }
    return nodes;
  }

  // La personne et la date de la ligne : « Marie Curie · 9 nov., 14:32 ». Une modification sans auteur connu ne nomme personne ; une modification tapée depuis l'ouverture, sans date
  // encore, se dit « À l'instant ».
  function whoOf(entry) {
    if (entry.author) return entry.author.name || entry.author.email;
    return entry.authorPending ? '' : t('trackList.author.unknown');
  }
  function whenOf(entry) {
    if (!entry.createdAt) return entry.fresh ? t('trackList.when.now') : '';
    const date = new Date(entry.createdAt);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString(I18n.getLang(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function iconButton(icon, className, label) {
    const button = Dom.button('pp-trackpane-btn' + (className ? ' ' + className : ''));
    Dom.setMarkup(button, Icons.svg(icon));
    button.setAttribute('aria-label', label);
    button.title = label;
    return button;
  }

  // Une ligne : le bouton qui mène à la modification (auteur, date, ce qu'elle fait, extrait) et les deux boutons qui la résolvent.
  function renderItem(entry, index) {
    const item = el('li', 'pp-trackpane-item');
    item.dataset.id = entry.id;
    const go = Dom.button('pp-trackpane-go');
    if (index === state.current) { item.classList.add('is-current'); go.setAttribute('aria-current', 'true'); }
    const head = el('span', 'pp-trackpane-head');
    const person = el('span', 'pp-trackpane-person');
    const dot = el('span', 'pp-trackpane-dot' + (entry.color ? '' : ' is-unknown'));
    if (entry.color) dot.style.background = entry.color;
    dot.setAttribute('aria-hidden', 'true');
    person.append(dot, el('span', 'pp-trackpane-who', whoOf(entry)));
    head.append(person, el('span', 'pp-trackpane-when', whenOf(entry)));
    go.append(head, el('span', 'pp-trackpane-what', whatOf(entry)), ...extractNodes(entry));
    if (entry.author && entry.author.name && entry.author.email) go.title = entry.author.name + ' (' + entry.author.email + ')';
    go.addEventListener('click', () => goTo(entry));
    const actions = el('span', 'pp-trackpane-actions');
    const accept = iconButton('acceptAll', 'pp-trackpane-accept', t('trackList.accept', { what: whatOf(entry) }));
    const reject = iconButton('rejectAll', 'pp-trackpane-reject', t('trackList.reject', { what: whatOf(entry) }));
    accept.addEventListener('click', () => resolve(entry, true, index));
    reject.addEventListener('click', () => resolve(entry, false, index));
    actions.append(accept, reject);
    item.append(go, actions);
    return item;
  }

  // La phrase au-dessus de la liste : « 3 sur 12 » quand le curseur est dans une modification, « 12 modifications » sinon (celles de la personne choisie, quand on filtre).
  function countLabel(total) {
    if (!total) return '';
    return state.current >= 0 ? t('trackList.position', { i: state.current + 1, n: total }) : t('trackList.count', { n: total });
  }
  function renderEmpty() {
    refs.list.hidden = true;
    refs.empty.hidden = false;
    refs.empty.textContent = t(Editor.isTrackChangesOn() ? 'trackList.empty' : 'trackList.emptyOff');
  }
  // Le choix de la personne : montré à partir de deux personnes (une seule n'a rien à départager) ou tant qu'un filtre est posé ; « Accepter » et « Refuser » toutes les modifications de la personne choisie.
  function renderFilter() {
    const needed = state.people.length >= 2 || state.filter !== null;
    refs.filterRow.hidden = !needed;
    refs.filter.replaceChildren();
    refs.bulk.hidden = true;
    if (!needed) return;
    refs.filter.append(Dom.option('', t('trackList.filter.all')));
    state.people.forEach((person) => refs.filter.append(Dom.option(person.key === '' ? '*' : person.key, personName(person) + ' (' + person.count + ')')));
    refs.filter.value = state.filter === null ? '' : (state.filter === '' ? '*' : state.filter);
    const person = filteredPerson();
    refs.bulk.hidden = !person;
    if (!person) return;
    // Le texte des boutons reste court (« Accepter (3) », la personne est celle du choix juste au-dessus) ; la phrase entière, avec le nom, est celle que lit un lecteur d'écran et que montre l'infobulle.
    refs.acceptPerson.textContent = t('trackList.acceptPerson.short', { n: person.count });
    refs.rejectPerson.textContent = t('trackList.rejectPerson.short', { n: person.count });
    refs.acceptPerson.setAttribute('aria-label', t('trackList.acceptPerson', { name: personName(person) }));
    refs.rejectPerson.setAttribute('aria-label', t('trackList.rejectPerson', { name: personName(person) }));
    refs.acceptPerson.title = refs.acceptPerson.getAttribute('aria-label');
    refs.rejectPerson.title = refs.rejectPerson.getAttribute('aria-label');
  }
  function render() {
    if (!refs) return;
    const shown = visibleEntries();
    const total = shown.length;
    refs.count.textContent = countLabel(total);
    refs.prev.setAttribute('aria-disabled', total ? 'false' : 'true');
    refs.next.setAttribute('aria-disabled', total ? 'false' : 'true');
    renderFilter();
    const focused = pane.contains(document.activeElement) && document.activeElement.closest('.pp-trackpane-item');
    const focusedId = focused ? focused.dataset.id : null;
    refs.list.replaceChildren();
    if (!total) { renderEmpty(); refs.more.hidden = true; return; }
    refs.empty.hidden = true;
    refs.list.hidden = false;
    shown.slice(0, state.shown).forEach((entry, index) => refs.list.append(renderItem(entry, index)));
    refs.more.hidden = total <= state.shown;
    refs.more.textContent = t('trackList.more', { n: total - state.shown });
    if (focusedId !== null) {
      const again = Array.from(refs.list.children).find(item => item.dataset.id === focusedId);
      if (again) again.querySelector('.pp-trackpane-go').focus();
    }
    const current = refs.list.querySelector('.is-current');
    if (current) current.scrollIntoView({ block: 'nearest' });
  }

  // Place le volet à droite du texte : sous la barre, sur la hauteur de #editor-container, qui laisse sa place (marge à droite). Le document ne change pas : la page garde sa largeur, c'est
  // la fenêtre sur elle qui se réduit. Appelé à chaque changement de taille du conteneur (le panneau, la barre de recherche qui s'ouvre, une barre d'outils qui passe sur deux lignes).
  function layout() {
    const box = container();
    if (!pane || !box) return;
    const visible = state.open && box.offsetParent !== null;
    pane.hidden = !visible;
    box.style.marginRight = visible ? pane.offsetWidth + 'px' : '';
    if (!visible) return;
    const rect = box.getBoundingClientRect();
    pane.style.top = rect.top + 'px';
    pane.style.height = rect.height + 'px';
  }

  function refresh() {
    timer = 0;
    if (!state.open || !editor) return;
    state.entries = Editor.getSuggestionEntries();
    state.people = TrackChanges.entryPeople(state.entries);
    if (state.filter !== null && !filteredPerson()) state.filter = null;   // plus rien de cette personne : tout le monde
    state.current = TrackChanges.entryIndexAt(visibleEntries(), editor.state.selection.from);
    layout();
    render();
  }
  const schedule = () => { if (state.open && !timer) timer = setTimeout(refresh, REFRESH_MS); };

  // Le curseur se déplace sans que le texte change : seule la ligne courante bouge.
  function followSelection() {
    if (!state.open || timer) return;
    const index = TrackChanges.entryIndexAt(visibleEntries(), editor.state.selection.from);
    if (index === state.current) return;
    state.current = index;
    render();
  }

  function goTo(entry) {
    Editor.revealSuggestion(entry);
    refresh();
  }
  function step(direction) {
    if (Editor.goToSuggestion(direction, matchesFilter)) refresh();
  }
  // Accepte ou refuse la modification de la ligne `index`, puis donne le focus à la ligne qui prend sa place (la liste se redessine, le bouton cliqué disparaît).
  function resolve(entry, accept, index) {
    if (!Editor.resolveSuggestionEntry(entry, accept)) return;
    refresh();
    const items = refs.list.children;
    const next = items[Math.min(index, items.length - 1)];
    if (next) next.querySelector('.pp-trackpane-go').focus(); else refs.close.focus();
  }

  // « Accepter » ou « Refuser » toutes les modifications de la personne choisie : toutes ses modifications, en une transaction (un seul Annuler).
  function resolveShown(accept) {
    if (!Editor.resolveSuggestionEntries(visibleEntries(), accept)) return;
    refresh();
    refs.filter.focus();
  }

  function ensure() {
    if (pane) return;
    pane = el('aside', 'pp-trackpane');
    pane.id = 'pp-track-pane';
    pane.setAttribute('aria-label', t('trackList.title'));
    // Ses boutons gardent le focus : le raccourci d'Annuler de js/shortcuts.js ne prend pas la touche ici.
    pane.setAttribute('data-own-undo', '');
    pane.hidden = true;
    // En-tête sur deux lignes de texte (le titre, puis « 3 sur 12 ») et trois boutons : dans un panneau de 400 px de haut, chaque ligne de moins laisse une modification de plus à la vue.
    const header = el('div', 'pp-trackpane-header');
    const heading = el('div', 'pp-trackpane-heading');
    const title = el('h2', 'pp-trackpane-title', t('trackList.title'));
    const count = el('span', 'pp-trackpane-count');
    count.setAttribute('role', 'status');
    heading.append(title, count);
    const prev = iconButton('chevronUp', 'pp-trackpane-prev', t('trackList.prev'));
    const next = iconButton('chevronDown', 'pp-trackpane-next', t('trackList.next'));
    const close = iconButton('closeFind', 'pp-trackpane-close', t('trackList.close'));
    prev.addEventListener('click', () => step(-1));
    next.addEventListener('click', () => step(1));
    close.addEventListener('click', () => closePane());
    header.append(heading, prev, next, close);
    const filterRow = el('div', 'pp-trackpane-filterrow');
    const filter = el('select', 'pp-trackpane-filter');
    filter.setAttribute('aria-label', t('trackList.filter.label'));
    filter.addEventListener('change', () => {
      state.filter = filter.value === '' ? null : (filter.value === '*' ? '' : filter.value);
      state.shown = PAGE_SIZE;
      state.current = TrackChanges.entryIndexAt(visibleEntries(), editor.state.selection.from);
      render();
    });
    filterRow.append(filter);
    filterRow.hidden = true;
    const list = el('ul', 'pp-trackpane-list');
    list.setAttribute('aria-label', t('trackList.title'));
    const empty = el('p', 'pp-trackpane-empty');
    const more = Dom.button('pp-trackpane-more');
    more.addEventListener('click', () => { state.shown += PAGE_SIZE; render(); });
    const bulk = el('div', 'pp-trackpane-bulk');
    const acceptPerson = Dom.button('pp-trackpane-bulkbtn');
    const rejectPerson = Dom.button('pp-trackpane-bulkbtn');
    acceptPerson.addEventListener('click', () => resolveShown(true));
    rejectPerson.addEventListener('click', () => resolveShown(false));
    bulk.append(acceptPerson, rejectPerson);
    bulk.hidden = true;
    pane.append(header, filterRow, list, empty, more, bulk);
    pane.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); closePane(); }
    });
    document.body.append(pane);
    refs = { header, title, close, prev, next, count, filterRow, filter, list, empty, more, bulk, acceptPerson, rejectPerson };
  }

  function syncToolbarRow() {
    const row = document.getElementById('v2-btn-track-pane');
    if (!row) return;
    row.classList.toggle('is-active', state.open);
    row.setAttribute('aria-pressed', state.open ? 'true' : 'false');
  }
  // Ouvre le volet. Faux, sans rien ouvrir, quand l'éditeur n'est pas à l'écran (Lecture, macro-modèle, grille).
  function open() {
    const box = container();
    if (!editor || !box || box.offsetParent === null) return false;
    ensure();
    state.open = true;
    state.shown = PAGE_SIZE;
    syncToolbarRow();
    refresh();
    if (!observer && typeof ResizeObserver === 'function') { observer = new ResizeObserver(layout); observer.observe(box); }
    refs.next.focus();
    return true;
  }
  function closePane(options) {
    if (!state.open) return;
    state.open = false;
    clearTimeout(timer);
    timer = 0;
    layout();
    syncToolbarRow();
    if (!options || options.focus !== false) editor.commands.focus();
  }
  function toggle() { if (state.open) closePane(); else open(); }

  function wireEditor(ed, hooks) {
    editor = ed;
    ed.on('transaction', ({ transaction }) => {
      if (!state.open) return;
      if (transaction && transaction.docChanged) schedule(); else followSelection();
    });
    if (hooks && hooks.onAuthorsChange) hooks.onAuthorsChange(schedule);
    window.addEventListener('resize', () => { if (state.open) layout(); });
  }

  return { wireEditor, open, closePane, toggle, isOpen: () => state.open, refreshNow: refresh };
})();
