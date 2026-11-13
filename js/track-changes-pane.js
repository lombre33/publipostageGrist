// Le volet de relecture, à droite du texte, en deux onglets. « Modifications » : la liste de toutes les modifications en attente (qui, quand, un extrait), un clic pour aller à l'une, « Accepter » et
// « Refuser » sur sa ligne, « Précédent » et « Suivant » pour les parcourir. « Commentaires » : un commentaire par ligne (qui, quand, le passage commenté, le dernier mot), un clic pour aller au
// passage et ouvrir son fil, « Résoudre » ou « Rouvrir » sur la ligne, « Précédent » et « Suivant » aussi. Ouvert par les lignes « Liste des modifications » et « Liste des commentaires » du menu « Édition
// collaborative » (js/main-toolbar.js). Les modifications viennent de Editor.getSuggestionEntries (js/track-changes-list.js), les commentaires de Comments.listThreads (js/comments-list.js) ; le volet ne
// change jamais le document par lui-même, seuls ses boutons résolvent une modification ou un commentaire. Il choisit aussi l'affichage du texte suivi (VIEWS : toutes les marques, marques simples, sans
// marque, original) : les trois derniers ne servent qu'à relire, le texte n'y est plus modifiable. Façade : TrackChangesPane.
// Styles : css/track-changes-pane.css (le volet) et css/track-changes.css (les affichages, par l'attribut data-track-view de l'éditeur). Hébergé par GFS, le volet cède ce que la barre de GFS en recouvre
// (GfsBar.bite, comme la bande des diapositives et le volet « Importer » de extensions/diapositives) : la largeur de la barre à droite, la hauteur d'une barre en haut ou en bas qui passe devant lui, et le texte lui laisse la même place.
const TrackChangesPane = (function () {
  const el = Dom.el;
  const PAGE_SIZE = 200;          // lignes montrées d'un coup ; « Afficher la suite » en ajoute autant
  const REFRESH_MS = 150;         // la liste se redessine une fois la frappe calmée
  // Les affichages du texte suivi : « all » (tout est marqué, le texte se modifie), « simple » (le résultat final, un trait à gauche de ce qui a changé), « final » (le résultat final sans
  // marque), « original » (le texte d'avant, sans les ajouts). Seul « all » laisse taper : un texte supprimé caché ne se laisse pas effacer ni retaper sans qu'on le voie.
  const VIEWS = ['all', 'simple', 'final', 'original'];
  // Les onglets du volet et la ligne du menu « Édition collaborative » qui ouvre chacun.
  const TABS = ['changes', 'comments'];
  const MENU_ROWS = { changes: 'v2-btn-track-pane', comments: 'v2-btn-comment-pane' };
  const THREAD_FILTERS = ['open', 'resolved', 'all'];
  // `filter` : null pour tout le monde, sinon la clé d'une personne (TrackChangesList.personKey ; '' pour les modifications sans auteur connu). `tab` : l'onglet montré. `threads` : les commentaires du
  // modèle (Comments.listThreads), `threadFilter` ceux qu'on montre (ouverts d'abord : ce sont ceux qui attendent quelque chose), `threadColors` la couleur de chaque personne qui a ouvert un fil.
  const state = {
    open: false, tab: 'changes', entries: [], people: [], filter: null, view: 'all', current: -1, shown: PAGE_SIZE,
    threads: [], threadFilter: 'open', threadColors: new Map(), threadCurrent: -1, threadShown: PAGE_SIZE,
  };
  let editor = null;
  let pane = null;
  let refs = null;
  let timer = 0;
  let observer = null;
  let stopBar = null;             // l'abonnement aux changements de la barre de GFS (le volet ouvert seulement)
  let editableBefore = true;      // l'éditeur se laissait modifier avant qu'un affichage en lecture seule ne le fige

  const t = (key, params) => I18n.t(key, params);
  const container = () => document.getElementById('editor-container');
  const matchesFilter = entry => state.filter === null || (entry.personKey || '') === state.filter;
  const visibleEntries = () => state.entries.filter(matchesFilter);
  const threadMatches = thread => state.threadFilter === 'all' || (state.threadFilter === 'resolved') === thread.resolved;
  const visibleThreads = () => state.threads.filter(threadMatches);
  const onComments = () => state.tab === 'comments';
  const filteredPerson = () => state.people.find(person => person.key === state.filter) || null;
  const personName = person => person.key === '' ? t('trackList.author.unknown') : person.name;

  // Pose l'affichage : l'attribut que lit css/track-changes.css, et l'éditeur figé (ni frappe ni collage) hors « Toutes les marques ». Sans émettre de mise à jour : rien n'a changé dans le document.
  function applyView(view) {
    if (!editor || !VIEWS.includes(view)) return;
    if (state.view === 'all' && view !== 'all') editableBefore = editor.isEditable;
    state.view = view;
    if (view === 'all') delete editor.view.dom.dataset.trackView; else editor.view.dom.dataset.trackView = view;
    editor.setEditable(view === 'all' ? editableBefore : false, false);
  }

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

  // La phrase au-dessus de la liste : « 3 sur 12 » quand le curseur est dans une modification (un commentaire), « 12 modifications » (« 5 commentaires ») sinon - celles de la personne choisie, quand on
  // filtre ; celles que le filtre garde, pour les commentaires.
  function countLabel(total, current) {
    if (!total) return '';
    return current >= 0 ? t('trackList.position', { i: current + 1, n: total }) : t(onComments() ? 'commentList.count' : 'trackList.count', { n: total });
  }
  // La ligne du haut, commune aux deux onglets : la phrase, et « Précédent » et « Suivant » (grisés sans rien à parcourir, jamais retirés) qui disent ce qu'ils parcourent.
  function renderNav(total, current) {
    refs.count.textContent = countLabel(total, current);
    refs.prev.setAttribute('aria-disabled', total ? 'false' : 'true');
    refs.next.setAttribute('aria-disabled', total ? 'false' : 'true');
    const [prev, next] = onComments() ? ['commentList.prev', 'commentList.next'] : ['trackList.prev', 'trackList.next'];
    [[refs.prev, prev], [refs.next, next]].forEach(([button, key]) => { button.setAttribute('aria-label', t(key)); button.title = t(key); });
  }
  // Les deux onglets : celui qui est montré est le seul dans l'ordre de tabulation (flèches gauche et droite passent de l'un à l'autre), et seul son contenu est à l'écran.
  function renderTabs() {
    TABS.forEach((tab) => {
      const on = state.tab === tab;
      const button = refs.tabs[tab];
      button.setAttribute('aria-selected', on ? 'true' : 'false');
      button.tabIndex = on ? 0 : -1;
      button.classList.toggle('is-active', on);
      refs.panels[tab].hidden = !on;
    });
  }
  function renderEmpty() {
    refs.list.hidden = true;
    refs.empty.hidden = false;
    refs.empty.textContent = t(Editor.isTrackChangesOn() ? 'trackList.empty' : 'trackList.emptyOff');
  }
  // L'affichage : la liste déroulante dit celui en vigueur, la ligne dessous dit ce qu'il montre et que le texte ne s'y modifie plus (vide pour « Toutes les marques »).
  function renderView() {
    refs.view.value = state.view;
    refs.viewNote.hidden = state.view === 'all';
    refs.viewNote.textContent = state.view === 'all' ? '' : t('trackList.view.note.' + state.view);
    refs.view.title = t('trackList.view.label');
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
    renderTabs();
    if (onComments()) renderComments(); else renderChanges();
  }
  function renderChanges() {
    const shown = visibleEntries();
    const total = shown.length;
    renderNav(total, state.current);
    renderView();
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

  // ---- L'onglet « Commentaires » ----
  const flatText = text => String(text || '').replace(/\s+/g, ' ').trim();
  const nameOfMessage = message => (message && message.auteur) || t('comments.anonymous');
  const personKeyOfMessage = message => String((message && message.auteur) || '').toLowerCase();
  function whenOfMessage(message) {
    if (!message || !message.creeLe) return '';
    const date = new Date(message.creeLe);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString(I18n.getLang(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  const canResolve = () => !!(Comments.kit && Comments.kit.canComment());

  // Une ligne : le bouton qui mène au passage (qui a ouvert le fil, quand, le passage cité, le dernier mot, le nombre de réponses, « Résolu ») et le bouton qui résout ou rouvre le fil. Le dernier mot
  // porte le nom de son auteur quand le fil a des réponses : c'est lui qui dit où en est la discussion.
  function renderThread(thread, index) {
    const item = el('li', 'pp-trackpane-item pp-trackpane-thread' + (thread.resolved ? ' is-resolved' : ''));
    item.dataset.id = thread.id;
    const go = Dom.button('pp-trackpane-go');
    if (index === state.threadCurrent) { item.classList.add('is-current'); go.setAttribute('aria-current', 'true'); }
    const head = el('span', 'pp-trackpane-head');
    const person = el('span', 'pp-trackpane-person');
    const color = thread.first && thread.first.auteur ? state.threadColors.get(personKeyOfMessage(thread.first)) : null;
    const dot = el('span', 'pp-trackpane-dot' + (color ? '' : ' is-unknown'));
    if (color) dot.style.background = color;
    dot.setAttribute('aria-hidden', 'true');
    person.append(dot, el('span', 'pp-trackpane-who', thread.first ? nameOfMessage(thread.first) : ''));
    head.append(person, el('span', 'pp-trackpane-when', whenOfMessage(thread.first)));
    go.append(head);
    const quote = thread.quote || (thread.objects.length ? t('commentList.noText') : '');
    if (quote) go.append(el('span', 'pp-trackpane-quote', quote));
    if (thread.last) {
      const text = flatText(thread.last.texte).slice(0, 400);
      go.append(el('span', 'pp-trackpane-excerpt', thread.count > 1 ? nameOfMessage(thread.last) + ' : ' + text : text));
    } else go.append(el('span', 'pp-trackpane-what', t('commentList.noMessages')));
    const meta = [];
    if (thread.count > 1) meta.push(t('commentList.replies', { n: thread.count - 1 }));
    if (thread.resolved) meta.push(t('comments.resolvedBadge'));
    if (meta.length) go.append(el('span', 'pp-trackpane-meta', meta.join(' · ')));
    go.addEventListener('click', () => goToThread(thread));
    const actions = el('span', 'pp-trackpane-actions');
    const who = thread.first ? nameOfMessage(thread.first) : '';
    const label = t(thread.resolved ? 'commentList.reopen' : 'commentList.resolve', { name: who });
    const toggle = iconButton(thread.resolved ? 'commentReopen' : 'commentResolve', 'pp-trackpane-resolve', label);
    // Grisé, jamais retiré, pour qui ne peut pas commenter dans ce document (comme les boutons de la fenêtre du fil) : le bouton reste atteignable et dit pourquoi.
    if (!canResolve()) { toggle.setAttribute('aria-disabled', 'true'); toggle.title = t('lock.noComment'); }
    toggle.addEventListener('click', () => toggleThread(thread, index));
    actions.append(toggle);
    item.append(go, actions);
    return item;
  }

  // Le choix « Ouverts / Résolus / Tous », avec le nombre de chaque : montré dès qu'il y a un commentaire.
  function renderThreadFilter() {
    const open = state.threads.filter(thread => !thread.resolved).length;
    const counts = { open, resolved: state.threads.length - open, all: state.threads.length };
    refs.threadFilterRow.hidden = !state.threads.length;
    refs.threadFilter.replaceChildren();
    THREAD_FILTERS.forEach(name => refs.threadFilter.append(Dom.option(name, t('commentList.filter.' + name, { n: counts[name] }))));
    refs.threadFilter.value = state.threadFilter;
    return counts;
  }
  function renderComments() {
    const shown = visibleThreads();
    const total = shown.length;
    renderNav(total, state.threadCurrent);
    const counts = renderThreadFilter();
    refs.threadNote.hidden = state.view === 'all';
    refs.threadNote.textContent = state.view === 'all' ? '' : t('commentList.viewNote', { view: t('trackList.view.' + state.view) });
    const focused = pane.contains(document.activeElement) && document.activeElement.closest('.pp-trackpane-thread');
    const focusedId = focused ? focused.dataset.id : null;
    refs.threadList.replaceChildren();
    if (!total) {
      refs.threadList.hidden = true;
      refs.threadEmpty.hidden = false;
      refs.threadEmpty.textContent = !state.threads.length ? t('commentList.empty')
        : state.threadFilter === 'resolved' ? t('commentList.emptyResolved')
        : counts.resolved ? t('commentList.emptyOpenMore', { n: counts.resolved }) : t('commentList.emptyOpen');
      refs.threadMore.hidden = true;
      return;
    }
    refs.threadEmpty.hidden = true;
    refs.threadList.hidden = false;
    shown.slice(0, state.threadShown).forEach((thread, index) => refs.threadList.append(renderThread(thread, index)));
    refs.threadMore.hidden = total <= state.threadShown;
    refs.threadMore.textContent = t('trackList.more', { n: total - state.threadShown });
    if (focusedId !== null) {
      const again = Array.from(refs.threadList.children).find(item => item.dataset.id === focusedId);
      if (again) again.querySelector('.pp-trackpane-go').focus();
    }
    const current = refs.threadList.querySelector('.is-current');
    if (current) current.scrollIntoView({ block: 'nearest' });
  }

  // Va au passage du commentaire : le curseur à son début, le texte défilé jusque-là, la fenêtre du fil ouverte (Comments.revealThread).
  function goToThread(thread) {
    Comments.revealThread(thread.id);
    refresh();
  }
  function stepThread(direction) {
    const list = visibleThreads();
    const index = TrackChanges.entryNeighbor(list, editor.state.selection.from, direction);
    if (index < 0) return;
    Comments.revealThread(list[index].id);
    refresh();
  }
  // Résout ou rouvre le commentaire de la ligne `index`, puis donne le focus à la ligne qui prend sa place (dans « Ouverts », la ligne résolue part de la liste).
  async function toggleThread(thread, index) {
    if (!canResolve()) return;
    if (!(await Comments.setThreadResolved(thread.id, !thread.resolved))) return;
    refresh();
    const items = refs.threadList.children;
    const next = items[Math.min(index, items.length - 1)];
    if (next) next.querySelector('.pp-trackpane-go').focus(); else refs.threadFilter.focus();
  }

  // Place le volet à droite du texte : sous la barre, sur la hauteur de #editor-container, qui laisse sa place (marge à droite). Le document ne change pas : la page garde sa largeur, c'est
  // la fenêtre sur elle qui se réduit. Appelé à chaque changement de taille du conteneur (le panneau, la barre de recherche qui s'ouvre, une barre d'outils qui passe sur deux lignes) et à chaque
  // changement de la barre de GFS. Cette barre est posée par-dessus le cadre, au bord que la personne a choisi : le volet, collé au bord droit, lui cède ce qu'elle en recouvre (`GfsBar.bite`,
  // calculé sur le volet sans cette cession, pour ne pas tourner en rond) : à droite il recule de sa profondeur, et le texte avec lui ; en haut ou en bas il se raccourcit. Sans barre, ou quand elle ne
  // le recouvre pas, il n'y a rien à céder.
  function layout() {
    const box = container();
    if (!pane || !box) return;
    const visible = state.open && box.offsetParent !== null;
    pane.hidden = !visible;
    if (!visible) {
      box.style.marginRight = '';
      pane.style.right = '';
      return;
    }
    const rect = box.getBoundingClientRect();
    const width = pane.offsetWidth;
    const edge = document.documentElement.clientWidth;
    const bite = GfsBar.bite({ left: edge - width, top: rect.top, right: edge, bottom: rect.top + rect.height });
    const gutter = Math.max(0, Math.ceil(bite.right));
    box.style.marginRight = (width + gutter) + 'px';
    pane.style.right = gutter ? gutter + 'px' : '';
    pane.style.top = (rect.top + Math.ceil(bite.top)) + 'px';
    pane.style.height = Math.max(0, rect.height - Math.ceil(bite.top) - Math.ceil(bite.bottom)) + 'px';
  }

  // Relit ce que l'onglet montré liste (l'autre se relit quand on y passe) et redessine.
  function refresh() {
    timer = 0;
    if (!state.open || !editor) return;
    if (onComments()) {
      state.threads = Comments.listThreads();
      // Une couleur par personne qui a ouvert un fil, la même pour une même personne d'un onglet à l'autre tant qu'aucune couleur n'est en conflit (TrackChangesList.assignColors).
      state.threadColors = TrackChangesList.assignColors(state.threads.map(thread => personKeyOfMessage(thread.first)));
      state.threadCurrent = TrackChanges.entryIndexAt(visibleThreads(), editor.state.selection.from);
    } else {
      state.entries = Editor.getSuggestionEntries();
      state.people = TrackChanges.entryPeople(state.entries);
      if (state.filter !== null && !filteredPerson()) state.filter = null;   // plus rien de cette personne : tout le monde
      state.current = TrackChanges.entryIndexAt(visibleEntries(), editor.state.selection.from);
    }
    layout();
    render();
  }
  const schedule = () => { if (state.open && !timer) timer = setTimeout(refresh, REFRESH_MS); };

  // Le curseur se déplace sans que le texte change : seule la ligne courante bouge.
  function followSelection() {
    if (!state.open || timer) return;
    const index = TrackChanges.entryIndexAt(onComments() ? visibleThreads() : visibleEntries(), editor.state.selection.from);
    if (index === (onComments() ? state.threadCurrent : state.current)) return;
    if (onComments()) state.threadCurrent = index; else state.current = index;
    render();
  }

  function goTo(entry) {
    Editor.revealSuggestion(entry);
    refresh();
  }
  function step(direction) {
    if (onComments()) { stepThread(direction); return; }
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
    pane.setAttribute('aria-label', t('trackList.paneLabel'));
    // Ses boutons gardent le focus : le raccourci d'Annuler de js/shortcuts.js ne prend pas la touche ici.
    pane.setAttribute('data-own-undo', '');
    pane.hidden = true;
    // En-tête sur deux lignes, chacune de la hauteur d'un bouton : les onglets et « Fermer » ; la phrase (« 3 sur 12 ») et « Précédent » et « Suivant ». Dans un panneau de 400 px de haut, chaque ligne de
    // moins laisse un élément de plus à la vue.
    const header = el('div', 'pp-trackpane-header');
    const tabRow = el('div', 'pp-trackpane-tabrow');
    const tablist = el('div', 'pp-trackpane-tabs');
    tablist.setAttribute('role', 'tablist');
    tablist.setAttribute('aria-label', t('trackList.tabs.label'));
    const tabs = {};
    const panels = {};
    TABS.forEach((tab) => {
      const button = Dom.button('pp-trackpane-tab', t(tab === 'comments' ? 'commentList.tab' : 'trackList.title'));
      button.id = 'pp-track-tab-' + tab;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', 'pp-track-panel-' + tab);
      button.addEventListener('click', () => setTab(tab));
      tabs[tab] = button;
      const panel = el('div', 'pp-trackpane-panel');
      panel.id = 'pp-track-panel-' + tab;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', button.id);
      panels[tab] = panel;
      tablist.append(button);
    });
    // Flèches gauche et droite, début et fin : on passe d'un onglet à l'autre, le focus suit (onglets à activation automatique).
    tablist.addEventListener('keydown', (event) => {
      const at = TABS.indexOf(state.tab);
      const to = event.key === 'ArrowRight' ? TABS[(at + 1) % TABS.length] : event.key === 'ArrowLeft' ? TABS[(at + TABS.length - 1) % TABS.length]
        : event.key === 'Home' ? TABS[0] : event.key === 'End' ? TABS[TABS.length - 1] : null;
      if (!to) return;
      event.preventDefault();
      setTab(to);
      tabs[to].focus();
    });
    const close = iconButton('closeFind', 'pp-trackpane-close', t('trackList.close'));
    close.addEventListener('click', () => closePane());
    tabRow.append(tablist, close);
    const navRow = el('div', 'pp-trackpane-navrow');
    const count = el('span', 'pp-trackpane-count');
    count.setAttribute('role', 'status');
    const prev = iconButton('chevronUp', 'pp-trackpane-prev', t('trackList.prev'));
    const next = iconButton('chevronDown', 'pp-trackpane-next', t('trackList.next'));
    prev.addEventListener('click', () => step(-1));
    next.addEventListener('click', () => step(1));
    navRow.append(count, prev, next);
    header.append(tabRow, navRow);
    // L'onglet « Modifications » : l'affichage du texte suivi, le choix de la personne, la liste, « Accepter » et « Refuser » de la personne choisie.
    const viewRow = el('div', 'pp-trackpane-viewrow');
    const view = el('select', 'pp-trackpane-view');
    view.setAttribute('aria-label', t('trackList.view.label'));
    VIEWS.forEach((name) => view.append(Dom.option(name, t('trackList.view.' + name))));
    const viewNote = el('p', 'pp-trackpane-viewnote');
    viewNote.id = 'pp-track-view-note';
    viewNote.hidden = true;
    view.setAttribute('aria-describedby', viewNote.id);
    view.addEventListener('change', () => { applyView(view.value); render(); });
    viewRow.append(view, viewNote);
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
    panels.changes.append(viewRow, filterRow, list, empty, more, bulk);
    // L'onglet « Commentaires » : le rappel de l'affichage en lecture seule, le choix Ouverts / Résolus / Tous, la liste.
    const threadNote = el('p', 'pp-trackpane-viewnote pp-trackpane-threadnote');
    threadNote.hidden = true;
    const threadFilterRow = el('div', 'pp-trackpane-filterrow');
    const threadFilter = el('select', 'pp-trackpane-filter pp-trackpane-threadfilter');
    threadFilter.setAttribute('aria-label', t('commentList.filter.label'));
    threadFilter.addEventListener('change', () => {
      state.threadFilter = THREAD_FILTERS.includes(threadFilter.value) ? threadFilter.value : 'open';
      state.threadShown = PAGE_SIZE;
      state.threadCurrent = TrackChanges.entryIndexAt(visibleThreads(), editor.state.selection.from);
      render();
    });
    threadFilterRow.append(threadFilter);
    threadFilterRow.hidden = true;
    const threadList = el('ul', 'pp-trackpane-list pp-trackpane-threads');
    threadList.setAttribute('aria-label', t('commentList.tab'));
    const threadEmpty = el('p', 'pp-trackpane-empty');
    const threadMore = Dom.button('pp-trackpane-more');
    threadMore.addEventListener('click', () => { state.threadShown += PAGE_SIZE; render(); });
    panels.comments.append(threadNote, threadFilterRow, threadList, threadEmpty, threadMore);
    pane.append(header, panels.changes, panels.comments);
    pane.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); closePane(); }
    });
    document.body.append(pane);
    refs = {
      header, tabs, panels, close, prev, next, count, viewRow, view, viewNote, filterRow, filter, list, empty, more, bulk, acceptPerson, rejectPerson,
      threadNote, threadFilterRow, threadFilter, threadList, threadEmpty, threadMore,
    };
  }

  // Les deux lignes du menu « Édition collaborative » : celle de l'onglet montré est allumée tant que le volet est ouvert.
  function syncToolbarRow() {
    TABS.forEach((tab) => {
      const row = document.getElementById(MENU_ROWS[tab]);
      if (!row) return;
      const on = state.open && state.tab === tab;
      row.classList.toggle('is-active', on);
      row.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  // Passe à l'autre onglet : la liste de celui-ci se relit à l'instant.
  function setTab(tab) {
    if (!TABS.includes(tab) || state.tab === tab) return;
    state.tab = tab;
    state.shown = PAGE_SIZE;
    state.threadShown = PAGE_SIZE;
    syncToolbarRow();
    if (state.open) refresh();
  }
  // Ouvre le volet sur l'onglet `tab` (« changes » par défaut). Faux, sans rien ouvrir, quand l'éditeur n'est pas à l'écran (Lecture, macro-modèle, grille).
  function open(tab) {
    const box = container();
    if (!editor || !box || box.offsetParent === null) return false;
    ensure();
    state.open = true;
    state.tab = TABS.includes(tab) ? tab : 'changes';
    state.shown = PAGE_SIZE;
    state.threadShown = PAGE_SIZE;
    syncToolbarRow();
    refresh();
    if (!observer && typeof ResizeObserver === 'function') { observer = new ResizeObserver(layout); observer.observe(box); }
    if (!stopBar) stopBar = GfsBar.onChange(() => layout());
    refs.next.focus();
    return true;
  }
  function closePane(options) {
    if (!state.open) return;
    state.open = false;
    clearTimeout(timer);
    timer = 0;
    if (stopBar) { stopBar(); stopBar = null; }
    applyView('all');   // sans le volet, plus rien ne ramène à « Toutes les marques » : le texte redevient modifiable
    layout();
    syncToolbarRow();
    if (!options || options.focus !== false) editor.commands.focus();
  }
  // La ligne d'un onglet du menu : ouvre le volet sur cet onglet ; déjà ouvert sur l'autre onglet, y passe ; déjà sur celui-ci, ferme.
  function toggle(tab) {
    const target = TABS.includes(tab) ? tab : 'changes';
    if (!state.open) { open(target); return; }
    if (state.tab !== target) { setTab(target); refs.next.focus(); return; }
    closePane();
  }

  function wireEditor(ed, hooks) {
    editor = ed;
    ed.on('transaction', ({ transaction }) => {
      if (!state.open) return;
      if (transaction && transaction.docChanged) schedule(); else followSelection();
    });
    if (hooks && hooks.onAuthorsChange) hooks.onAuthorsChange(schedule);
    // Un message publié, un fil retiré, un autre modèle ouvert : la liste des commentaires se relit (sans effet volet fermé ou sur l'autre onglet : refresh ne lit que l'onglet montré).
    Comments.onChange(schedule);
    window.addEventListener('resize', () => { if (state.open) layout(); });
  }

  return { wireEditor, open, closePane, toggle, setTab, isOpen: () => state.open, tab: () => state.tab };
})();
