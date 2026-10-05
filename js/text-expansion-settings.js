// Réglages > Raccourcis > Abréviations : le caractère déclencheur et la liste des abréviations de la personne, avec le formulaire qui les ajoute, les
// modifie et les supprime. js/text-expansion.js garde les données, la règle de saisie et la liste « § » de l'éditeur ; ici, seulement l'onglet, qui
// s'appuie sur son interface publique. Les éléments de l'onglet sont dans index.html (`#settings-expansion-*`).
(function () {
  const { storedChar, charProblem, setTriggerChar, load, list, add, update, remove } = TextExpansion;
  // Erreurs de saisie que l'onglet sait écrire (clés `settings.expansion.error.<code>`) ; toute autre erreur est un échec d'écriture dans Grist.
  const VALIDATION_CODES = ['empty', 'tooLong', 'chars', 'duplicate', 'textEmpty', 'textTooLong'];

  // Les éléments de l'onglet et la ligne qu'on modifie (`editingRowId`, null pour un ajout) ; null quand la page n'a pas le formulaire.
  function elements() {
    const byId = id => document.getElementById(id);
    const ui = {
      panel: document.querySelector('.settings-panel[data-settings-panel="shortcuts"]'),
      intro: byId('settings-expansion-intro'),
      charInput: byId('settings-expansion-char'),
      charStatus: byId('settings-expansion-char-status'),
      form: byId('settings-expansion-form'),
      abbreviationInput: byId('settings-expansion-abbr'),
      textInput: byId('settings-expansion-text'),
      submitButton: byId('settings-expansion-submit'),
      cancelButton: byId('settings-expansion-cancel'),
      status: byId('settings-expansion-status'),
      listEl: byId('settings-expansion-list'),
      emptyEl: byId('settings-expansion-empty'),
      editingRowId: null,
    };
    return ui.panel && ui.charInput && ui.form && ui.listEl ? ui : null;
  }

  function showMessage(el, message) {
    el.hidden = !message;
    el.textContent = message || '';
  }
  function showCharProblem(ui, problem) { showMessage(ui.charStatus, problem ? I18n.t('settings.expansion.char.' + problem) : ''); }
  function setFormStatus(ui, code) {
    if (!code) { showMessage(ui.status, ''); return; }
    showMessage(ui.status, I18n.t('settings.expansion.error.' + (VALIDATION_CODES.indexOf(code) !== -1 ? code : 'saveFailed')));
  }

  // Le texte d'explication cite le caractère réglé (« §ub ») : il se recompose, aucun data-i18n ne peut le porter.
  function renderIntro(ui) { ui.intro.textContent = I18n.t('settings.expansion.intro', { example: storedChar() + 'ub' }); }

  function resetForm(ui) {
    ui.editingRowId = null;
    ui.abbreviationInput.value = '';
    ui.textInput.value = '';
    ui.submitButton.textContent = I18n.t('settings.expansion.add');
    ui.cancelButton.hidden = true;
  }

  function startEditing(ui, entry) {
    ui.editingRowId = entry.rowId;
    ui.abbreviationInput.value = entry.abbreviation;
    ui.textInput.value = entry.text;
    ui.submitButton.textContent = I18n.t('common.save');
    ui.cancelButton.hidden = false;
    setFormStatus(ui, '');
    ui.abbreviationInput.focus();
    ui.abbreviationInput.select();
  }

  async function deleteEntry(ui, entry, char) {
    if (!(await Dialogs.confirm({ title: I18n.t('settings.expansion.confirmDelete', { abbreviation: char + entry.abbreviation }), confirmLabel: I18n.t('common.delete'), danger: true }))) return;
    try {
      await remove(entry.rowId);
      if (ui.editingRowId === entry.rowId) resetForm(ui);
      setFormStatus(ui, '');
    } catch (error) {
      console.warn('[text-expansion] suppression impossible', error);
      setFormStatus(ui, 'saveFailed');
    }
    renderList(ui);
    ui.abbreviationInput.focus();
  }

  // Une ligne de la liste : l'abréviation précédée du déclencheur, son texte, Modifier et Supprimer.
  function entryRow(ui, entry, char) {
    const row = document.createElement('li');
    row.className = 'settings-expansion-row';
    const abbreviation = document.createElement('span');
    abbreviation.className = 'settings-expansion-abbr';
    abbreviation.textContent = char + entry.abbreviation;
    const text = document.createElement('span');
    text.className = 'settings-expansion-text';
    text.textContent = entry.text;
    text.title = entry.text;
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.textContent = I18n.t('settings.expansion.edit');
    edit.setAttribute('aria-label', I18n.t('settings.expansion.editAria', { abbreviation: char + entry.abbreviation }));
    edit.addEventListener('click', () => startEditing(ui, entry));
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'settings-expansion-delete';
    del.textContent = I18n.t('common.delete');
    del.setAttribute('aria-label', I18n.t('settings.expansion.deleteAria', { abbreviation: char + entry.abbreviation }));
    del.addEventListener('click', () => deleteEntry(ui, entry, char));
    row.append(abbreviation, text, edit, del);
    return row;
  }

  function renderList(ui) {
    const items = list();
    const char = storedChar();
    ui.listEl.textContent = '';
    ui.emptyEl.hidden = items.length > 0;
    items.forEach(entry => ui.listEl.appendChild(entryRow(ui, entry, char)));
  }

  function syncChar(ui) {
    ui.charInput.value = storedChar();
    showCharProblem(ui, charProblem(storedChar()) === 'sameAsVariables' ? 'sameAsVariables' : '');
    renderIntro(ui);
  }

  function refresh(ui) {
    syncChar(ui);
    setFormStatus(ui, '');
    renderList(ui); // ce qui est déjà lu s'affiche tout de suite, la relecture complète ensuite
    load(true).then(() => renderList(ui), () => renderList(ui));
  }

  function wireCharField(ui) {
    ui.charInput.addEventListener('input', () => {
      const problem = ui.charInput.value ? setTriggerChar(ui.charInput.value) : 'invalid';
      showCharProblem(ui, problem);
      if (!problem) { renderIntro(ui); renderList(ui); }
    });
    // Un caractère refusé ne reste pas affiché comme s'il était retenu : à la sortie du champ, il retrouve celui qui est réellement en vigueur.
    ui.charInput.addEventListener('blur', () => {
      if (ui.charInput.value !== storedChar()) syncChar(ui);
    });
  }

  async function submitEntry(ui, event) {
    event.preventDefault();
    setFormStatus(ui, '');
    ui.submitButton.disabled = true;
    try {
      if (ui.editingRowId != null) await update(ui.editingRowId, ui.abbreviationInput.value, ui.textInput.value);
      else await add(ui.abbreviationInput.value, ui.textInput.value);
      resetForm(ui);
      renderList(ui);
      ui.abbreviationInput.focus();
    } catch (error) {
      const code = error && error.code;
      if (VALIDATION_CODES.indexOf(code) === -1) console.warn('[text-expansion] enregistrement impossible', error);
      // Une erreur sans code (une écriture que Grist refuse) est un échec d'enregistrement comme les autres.
      setFormStatus(ui, code || 'saveFailed');
      (code === 'textEmpty' || code === 'textTooLong' ? ui.textInput : ui.abbreviationInput).focus();
    } finally {
      ui.submitButton.disabled = false;
    }
  }

  function wireEntryForm(ui) {
    ui.form.addEventListener('submit', event => submitEntry(ui, event));
    ui.cancelButton.addEventListener('click', () => { resetForm(ui); setFormStatus(ui, ''); ui.abbreviationInput.focus(); });
    // Ctrl/Cmd+Entrée enregistre depuis le champ de texte, où Entrée seule passe à la ligne (un texte peut en compter plusieurs).
    ui.textInput.addEventListener('keydown', event => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); ui.form.requestSubmit(); }
    });
  }

  function wire() {
    const ui = elements();
    if (!ui) return;
    wireCharField(ui);
    wireEntryForm(ui);
    const tab = document.querySelector('.settings-tab[data-settings-tab="shortcuts"]');
    if (tab) tab.addEventListener('click', () => refresh(ui));
    const openButton = document.getElementById('v2-btn-settings');
    // L'onglet reste celui qu'on avait laissé à la fermeture : rouvrir Réglages dessus doit aussi relire.
    if (openButton) openButton.addEventListener('click', () => { if (!ui.panel.hidden) refresh(ui); });
    I18n.onChange(() => { renderIntro(ui); renderList(ui); resetForm(ui); setFormStatus(ui, ''); });
    resetForm(ui);
    syncChar(ui);
  }

  wire();
})();
