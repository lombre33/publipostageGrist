// Réglages > Raccourcis > Touches (js/shortcuts.js) : la liste de toutes les actions, rangées par groupe, avec leur touche actuelle. Un clic sur la touche écoute la combinaison
// suivante ; Échap abandonne, Retour arrière retire la touche, « Par défaut » rend celle d'origine. Une combinaison refusée dit pourquoi, sous la touche concernée, et la liste
// continue d'écouter. Pendant l'écoute, Shortcuts envoie toutes les touches ici : aucune action ne part et Échap ne ferme pas la fenêtre.
//
// L'onglet réunit deux choses, un commutateur les montre l'une après l'autre : « Touches » (ici) et « Abréviations » (js/text-expansion.js). Le choix est gardé par navigateur.
const ShortcutsPanel = (function () {
  const VIEW_STORAGE = 'pp_shortcuts_view';
  const VIEWS = ['keys', 'expansion'];

  const byId = id => document.getElementById(id);
  const t = (key, vars) => I18n.t(key, vars);

  let listEl = null;
  let resetAllButton = null;
  let rows = {};           // id d'action -> { id, li, nameEl, keyButton, resetButton, errorEl }
  let recordingId = null;

  function storedView() {
    try { const v = localStorage.getItem(VIEW_STORAGE); return VIEWS.indexOf(v) !== -1 ? v : 'keys'; } catch (e) { return 'keys'; }
  }

  function showView(view) {
    if (VIEWS.indexOf(view) === -1) view = 'keys';
    try { localStorage.setItem(VIEW_STORAGE, view); } catch (e) { /* le choix ne survivra pas au rechargement */ }
    VIEWS.forEach(name => {
      const tab = byId('settings-switch-' + name);
      const section = byId('settings-' + name + '-section');
      const on = name === view;
      if (tab) { tab.classList.toggle('active', on); tab.setAttribute('aria-selected', on ? 'true' : 'false'); tab.tabIndex = on ? 0 : -1; }
      if (section) section.hidden = !on;
    });
    if (view !== 'keys') stopRecording();
  }

  function showKeys() {
    showView('keys');
    const first = listEl && listEl.querySelector('.settings-key-btn');
    if (first) first.focus();
  }

  // === Écoute d'une combinaison ==============================================================================================================================

  function showError(id, message) {
    const row = rows[id];
    if (!row) return;
    row.errorEl.hidden = !message;
    row.errorEl.textContent = message || '';
    row.keyButton.setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  function problemText(combo, result) {
    return t('settings.keys.problem.' + result.problem, { key: Shortcuts.format(combo), action: result.other ? t(result.other.label) : '' });
  }

  function stopRecording() {
    if (recordingId == null) return;
    const row = rows[recordingId];
    recordingId = null;
    Shortcuts.setRecorder(null);
    if (row) { row.keyButton.classList.remove('is-recording'); showError(row.id, ''); renderRow(row.id); }
  }

  function startRecording(id) {
    if (recordingId === id) return;
    stopRecording();
    recordingId = id;
    Shortcuts.setRecorder(onRecordedKey);
    const row = rows[id];
    row.keyButton.focus();
    row.keyButton.classList.add('is-recording');
    row.keyButton.textContent = t('settings.keys.recording');
    row.keyButton.setAttribute('aria-label', t('settings.keys.recordingAria', { action: t(Shortcuts.action(id).label) }));
    showError(id, '');
  }

  // Une touche pressée pendant l'écoute (Shortcuts a déjà arrêté l'événement : ni la fenêtre ni l'éditeur n'en voient rien).
  function onRecordedKey(event) {
    const id = recordingId;
    if (id == null || event.repeat) return;
    const plain = !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey;
    if (plain && event.key === 'Escape') { stopRecording(); return; }
    if (plain && (event.key === 'Backspace' || event.key === 'Delete')) { Shortcuts.setKey(id, ''); stopRecording(); return; }
    const { combo, altGr } = Shortcuts.fromEvent(event);
    if (!combo) return; // un modificateur seul : on attend la suite
    if (altGr) { showError(id, t('settings.keys.problem.altGr')); return; }
    const result = Shortcuts.setKey(id, combo);
    if (result.problem) { showError(id, problemText(combo, result)); return; }
    stopRecording();
  }

  // === Lignes ================================================================================================================================================

  function renderRow(id) {
    const row = rows[id];
    if (!row || recordingId === id) return;
    const action = Shortcuts.action(id);
    const key = Shortcuts.label(id);
    const name = t(action.label);
    row.nameEl.textContent = name;
    row.keyButton.textContent = key || t('settings.keys.none');
    row.keyButton.classList.toggle('is-none', !key);
    row.keyButton.setAttribute('aria-label', key ? t('settings.keys.keyAria', { action: name, key }) : t('settings.keys.keyAriaNone', { action: name }));
    row.resetButton.disabled = !Shortcuts.isChanged(id);
    row.resetButton.setAttribute('aria-label', t('settings.keys.resetAria', { action: name }));
  }

  function build() {
    listEl.textContent = '';
    rows = {};
    Shortcuts.GROUPS.forEach(group => {
      const actions = Shortcuts.ACTIONS.filter(a => a.group === group);
      if (!actions.length) return;
      const heading = document.createElement('h5');
      heading.className = 'settings-keys-group';
      heading.id = 'settings-keys-group-' + group;
      heading.textContent = t('settings.keys.group.' + group);
      const ul = document.createElement('ul');
      ul.className = 'settings-keys-rows';
      ul.setAttribute('aria-labelledby', heading.id);
      actions.forEach(action => {
        const li = document.createElement('li');
        li.className = 'settings-key-row';
        li.dataset.action = action.id;
        const nameEl = document.createElement('span');
        nameEl.className = 'settings-key-name';
        const keyButton = document.createElement('button');
        keyButton.type = 'button';
        keyButton.className = 'settings-key-btn';
        keyButton.addEventListener('click', () => startRecording(action.id));
        keyButton.addEventListener('blur', () => { if (recordingId === action.id) stopRecording(); });
        const resetButton = document.createElement('button');
        resetButton.type = 'button';
        resetButton.className = 'settings-key-reset';
        resetButton.textContent = t('settings.keys.reset');
        resetButton.addEventListener('click', () => { Shortcuts.resetKey(action.id); showError(action.id, ''); });
        const errorEl = document.createElement('p');
        errorEl.className = 'settings-key-error';
        errorEl.setAttribute('role', 'alert');
        errorEl.hidden = true;
        li.append(nameEl, keyButton, resetButton, errorEl);
        ul.appendChild(li);
        rows[action.id] = { id: action.id, li, nameEl, keyButton, resetButton, errorEl };
      });
      listEl.append(heading, ul);
    });
    renderAll();
  }

  function renderAll() {
    Object.keys(rows).forEach(renderRow);
    if (resetAllButton) resetAllButton.disabled = !Shortcuts.ACTIONS.some(a => Shortcuts.isChanged(a.id));
  }

  function wire() {
    listEl = byId('settings-keys-list');
    resetAllButton = byId('settings-keys-reset-all');
    if (!listEl) return;
    build();
    Shortcuts.onChange(renderAll);
    I18n.onChange(() => { stopRecording(); build(); });
    VIEWS.forEach(name => { const tab = byId('settings-switch-' + name); if (tab) tab.addEventListener('click', () => showView(name)); });
    if (resetAllButton) {
      resetAllButton.addEventListener('click', async () => {
        if (!(await Dialogs.confirm({ title: t('settings.keys.confirmResetAll'), confirmLabel: t('settings.keys.resetAll'), danger: true }))) return;
        Shortcuts.resetAll();
        Object.keys(rows).forEach(id => showError(id, ''));
        resetAllButton.focus();
      });
    }
    // Changer d'onglet ou fermer la fenêtre arrête l'écoute en cours.
    document.querySelectorAll('.settings-tab').forEach(tab => tab.addEventListener('click', stopRecording));
    const close = byId('settings-close');
    if (close) close.addEventListener('click', stopRecording);
    showView(storedView());
  }

  wire();

  return { showKeys, showView, stopRecording };
})();
