// Palette de commandes : Alt+/ (⌥/ sur Mac), la touche de « Rechercher dans les menus » de Google Docs, ouvre une fenêtre avec un champ ; on tape quelques lettres (« pdf », « tableau », « gras »)
// et la liste ne garde que les commandes qui les portent, Entrée lance celle qui est surlignée. La touche se change dans Réglages > Raccourcis comme les autres (action `commandPalette`) ; Ctrl+K reste « Lien… ».
//
// Les commandes sont les actions de js/shortcuts.js (celles de Réglages > Raccourcis), avec leur touche actuelle à droite : la palette sert aussi à apprendre les touches. Lancer une commande fait ce
// que fait son bouton de la barre d'outils (`Shortcuts.run`) : mêmes gardes que la souris et que la touche. Une commande que ce geste ne ferait pas ici (grisée, masquée, droits, Lecture) reste dans la liste, grisée :
// rien ne disparaît ; la surligner dit pourquoi (la raison du grisé, js/lock-reasons.js, sinon « Indisponible ici »), Entrée sur elle ne lance rien et la fenêtre reste ouverte.
//
// La recherche est celle des autres listes (SearchSelect.searchWords / foundIn : accents et casse ignorés, mots dans n'importe quel ordre) sur le nom de la commande, le nom de son groupe (« Mise en forme »)
// et des mots en plus (`palette.kw.<action>` : « pdf » pour « Exporter »). L'ordre : le nom qui commence par le premier mot, puis le nom qui le contient, puis le reste ; à rang égal, l'ordre de Réglages.
// Sans saisie, toutes les commandes, rangées par groupe.
//
// La fenêtre est une ModalBase (js/modal-base.js) : Tab tourne dedans, Échap la ferme, le focus revient à l'élément qui l'avait. Elle s'ouvre par-dessus le document sans rien lui faire : la
// sélection de l'éditeur reste celle d'avant, et la commande lancée la trouve. Aucun stockage : rien n'est retenu d'une ouverture à l'autre.
const CommandPalette = (function () {
  const el = Dom.el;
  const t = (key, vars) => I18n.t(key, vars);

  const ID = 'commandPalette'; // l'action de js/shortcuts.js qui l'ouvre : elle ne se propose pas à elle-même

  // Ce que la page prête au module (js/main.js) : la ligne d'état (`setStatus`). Sans elle (ce module seul, en test), un message ne va nulle part.
  let host = { setStatus() {} };
  function wire(callbacks) { host = Object.assign({}, host, callbacks); }

  let win = null;
  let refs = null;
  let commands = []; // toutes les commandes, dans l'ordre de Réglages : { id, name, group, groupLabel, key, available, reason, nameKey, haystack }
  let shown = [];    // les commandes que la saisie retient, dans l'ordre affiché
  let active = -1;   // rang, dans `shown`, de la commande surlignée
  let opener = null;         // l'élément qui avait le focus à l'ouverture
  let openerInEditor = false; // ... et c'était le document : le focus lui revient par l'éditeur, qui remet sa sélection

  // Les mots à taper en plus du nom : ceux de `palette.kw.<action>` quand le texte existe.
  const keywordsOf = id => (I18n.has('palette.kw.' + id) ? t('palette.kw.' + id) : '');

  function readCommands() {
    commands = Shortcuts.ACTIONS.filter(action => action.id !== ID).map(action => {
      const name = t(action.label);
      const groupLabel = t('settings.keys.group.' + action.group);
      const { available, reason } = Shortcuts.state(action.id);
      return {
        id: action.id, name, group: action.group, groupLabel, key: Shortcuts.label(action.id), available, reason,
        nameKey: SearchSelect.searchKey(name), haystack: SearchSelect.searchKey(name, groupLabel, keywordsOf(action.id)),
      };
    });
  }

  // Les commandes que `query` retient, la mieux placée d'abord. Rang 0 : le nom commence par le premier mot ; 1 : le nom contient tous les mots ; 2 : seuls le groupe ou les mots en plus les portent.
  function filter(query) {
    const words = SearchSelect.searchWords(query);
    if (!words.length) return commands.slice();
    const ranked = [];
    commands.forEach((command, order) => {
      if (!SearchSelect.foundIn(words, command.haystack)) return;
      const rank = command.nameKey.indexOf(words[0]) === 0 && SearchSelect.foundIn(words, command.nameKey) ? 0 : SearchSelect.foundIn(words, command.nameKey) ? 1 : 2;
      ranked.push({ command, rank, order });
    });
    return ranked.sort((a, b) => a.rank - b.rank || a.order - b.order).map(entry => entry.command);
  }

  const optionId = command => 'pp-palette-option-' + command.id;

  // La liste : un titre de groupe avant chaque groupe quand rien n'est tapé, une liste à plat sinon.
  function renderList(query) {
    const { list, input } = refs;
    const flat = SearchSelect.searchWords(query).length > 0;
    list.textContent = '';
    let group = '';
    shown.forEach((command, index) => {
      if (!flat && command.group !== group) {
        group = command.group;
        const heading = el('li', 'pp-palette-group', command.groupLabel);
        heading.setAttribute('role', 'presentation');
        list.appendChild(heading);
      }
      const row = el('li', 'pp-palette-row' + (command.available ? '' : ' is-off'));
      row.id = optionId(command);
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', 'false');
      if (!command.available) {
        row.setAttribute('aria-disabled', 'true');
        row.title = command.reason || t('palette.unavailable');
      }
      row.dataset.command = command.id;
      row.appendChild(el('span', 'pp-palette-name', command.name));
      if (command.key) row.appendChild(el('kbd', 'pp-palette-key', command.key));
      // La souris surligne en bougeant (pas au défilement de la liste sous un pointeur immobile) et lance au clic.
      row.addEventListener('mousemove', () => { if (active !== index) setActive(index, false); });
      row.addEventListener('click', () => runCommand(command));
      list.appendChild(row);
    });
    list.hidden = shown.length === 0;
    refs.empty.hidden = shown.length > 0;
    refs.empty.textContent = shown.length ? '' : t('palette.none', { query: query.trim() });
    input.setAttribute('aria-expanded', shown.length ? 'true' : 'false');
    announce(shown.length === 0 ? refs.empty.textContent : shown.length === 1 ? t('palette.count.one') : t('palette.count.many', { count: shown.length }));
    setActive(shown.length ? 0 : -1, true);
  }

  // Dit une phrase aux lecteurs d'écran sans l'afficher.
  function announce(text) {
    refs.live.textContent = '';
    refs.live.textContent = text;
  }

  // Surligne la commande de rang `index` ; `scroll` : la ramener dans la zone visible (clavier), pas quand c'est la souris qui la désigne.
  function setActive(index, scroll) {
    const { list, input } = refs;
    active = index;
    const command = shown[index];
    if (command) input.setAttribute('aria-activedescendant', optionId(command)); else input.removeAttribute('aria-activedescendant');
    // Le bas de la fenêtre d'abord : s'il change de hauteur (une raison sur trois lignes), la zone visible de la liste change avec lui.
    showHint(command && !command.available ? (command.reason || t('palette.unavailable')) : '');
    let current = null;
    Array.from(list.querySelectorAll('.pp-palette-row')).forEach((row, rank) => {
      const on = rank === index;
      row.classList.toggle('is-active', on);
      row.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on) current = row;
    });
    if (!current || !scroll) return;
    current.scrollIntoView({ block: 'nearest' });
    // La première commande d'un groupe ramène aussi son titre, sinon il resterait coupé au-dessus d'elle.
    const heading = current.previousElementSibling;
    if (heading && heading.classList.contains('pp-palette-group')) heading.scrollIntoView({ block: 'nearest' });
  }

  // Le bas de la fenêtre : les touches de la liste, ou la raison du grisé de la commande surlignée.
  function showHint(reason) {
    refs.hint.textContent = reason || t('palette.hint');
    refs.hint.classList.toggle('is-reason', !!reason);
  }

  function move(delta) {
    if (!shown.length) return;
    setActive((active + delta + shown.length) % shown.length, true);
  }

  function runCommand(command) {
    if (!command) return;
    if (!command.available) {
      // Elle ne part pas, la fenêtre reste ouverte : la raison est dite, au bas de la fenêtre et aux lecteurs d'écran.
      const text = command.reason ? t('palette.unavailableWhy', { name: command.name, reason: command.reason }) : t('palette.unavailableNow', { name: command.name });
      showHint(command.reason || t('palette.unavailable'));
      announce(text);
      return;
    }
    // La fenêtre se ferme d'abord, puis la commande part comme si on avait pressé sa touche : lancée avant, une commande qui ouvre une fenêtre la verrait refermée sous elle. Le focus n'est pas rendu avant la commande :
    // la sélection de l'éditeur n'a pas bougé (c'est celle de son état, que le champ de la palette ne touche pas), et un `focus()` de TipTap, différé d'une image d'écran, reprendrait le focus à la fenêtre que la commande ouvre.
    const wasInEditor = openerInEditor;
    const back = opener;
    closeWindow(false);
    let done = false;
    try { done = !!Shortcuts.run(command.id); } catch (e) { console.warn('[palette] la commande « ' + command.id + ' » a échoué', e); }
    if (!done) host.setStatus(t('palette.didNothing', { name: command.name }), false);
    // Le focus revient à l'image d'écran suivante, et seulement s'il n'est allé nulle part : une commande qui ouvre une fenêtre l'a prise.
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (!active || active === document.body) giveFocusBack(wasInEditor, back);
    });
  }

  // Le focus revient là où il était : au document par l'éditeur (`focusEditor` remet sa sélection), sinon à l'élément qui l'avait.
  function giveFocusBack(inEditor, back) {
    if (inEditor && typeof EditorCore !== 'undefined') EditorCore.focusEditor();
    else if (back && back.isConnected && back !== document.body && typeof back.focus === 'function') back.focus();
  }

  function onInputKeydown(event) {
    if (event.isComposing || event.keyCode === 229) return;
    // La touche de la palette referme la palette (Shortcuts, qui se tait sous une fenêtre ouverte, ne la voit pas).
    const { combo } = Shortcuts.fromEvent(event);
    if (combo && combo === Shortcuts.keyFor(ID)) { event.preventDefault(); closeWindow(true); return; }
    switch (event.key) {
      case 'ArrowDown': event.preventDefault(); move(1); break;
      case 'ArrowUp': event.preventDefault(); move(-1); break;
      case 'PageDown': event.preventDefault(); move(Math.min(6, Math.max(1, shown.length - 1 - active))); break;
      case 'PageUp': event.preventDefault(); move(-Math.min(6, Math.max(1, active))); break;
      case 'Enter': event.preventDefault(); runCommand(shown[active]); break;
      default: break;
    }
  }

  function build() {
    win = ModalBase.create({ id: 'pp-palette-modal', titleId: 'pp-palette-title', size: 'md', boxClass: 'pp-palette-box', actionsClass: 'var-modal-actions pp-palette-actions', onEscape: () => closeWindow(true), restoreFocus: false });
    const input = el('input', 'pp-dialog-input pp-palette-input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', 'pp-palette-list');
    input.setAttribute('aria-expanded', 'true');
    // Le champ est dans l'en-tête, sous le titre : seule la liste défile, le champ reste en vue.
    win.title.parentElement.appendChild(input);
    const list = el('ul', 'pp-palette-list');
    list.id = 'pp-palette-list';
    list.setAttribute('role', 'listbox');
    const empty = el('p', 'pp-palette-empty');
    empty.hidden = true;
    const live = el('div', 'pp-palette-live');
    live.setAttribute('role', 'status');
    win.body.append(list, empty, live);
    const hint = el('span', 'pp-palette-hint');
    const closeButton = Dom.button('var-modal-primary');
    win.actions.append(hint, closeButton);
    refs = { input, list, empty, live, hint, closeButton };
    input.addEventListener('input', () => { shown = filter(input.value); renderList(input.value); });
    input.addEventListener('keydown', onInputKeydown);
    closeButton.addEventListener('click', () => closeWindow(true));
  }

  // Ferme la fenêtre ; `giveBack` : rendre le focus (Échap, « Fermer », la touche de la palette) - la commande lancée s'en charge elle-même (runCommand).
  function closeWindow(giveBack) {
    if (!win || !win.isOpen()) return;
    const back = opener;
    const inEditor = openerInEditor;
    win.hide();
    if (giveBack) giveFocusBack(inEditor, back);
  }

  function open() {
    if (!win) build();
    if (win.isOpen()) return true;
    win.title.textContent = t('palette.title');
    refs.input.setAttribute('aria-label', t('palette.search.label'));
    refs.input.placeholder = t('palette.search.placeholder');
    refs.list.setAttribute('aria-label', t('palette.list.label'));
    refs.closeButton.textContent = t('palette.close');
    refs.input.value = '';
    opener = document.activeElement;
    openerInEditor = !!(opener && opener.closest && opener.closest('.ProseMirror') && !opener.closest('.pp-field-editor'));
    readCommands();
    shown = filter('');
    renderList('');
    win.show(refs.input);
    refs.input.select();
    return true;
  }

  function close() { closeWindow(true); }
  function isOpen() { return !!win && win.isOpen(); }
  function toggle() { return isOpen() ? (close(), true) : open(); }

  return { open, close, toggle, isOpen, wire };
})();
