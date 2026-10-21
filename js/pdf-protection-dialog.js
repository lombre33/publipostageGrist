// Fenêtre « PDF protégé » (js/main.js:exportRecordAs et confirmBatch, type « PDF protégé » du menu Type d'export, demande du 12/10) : pose le mot de passe pour ouvrir le PDF,
// ce que la personne qui l'ouvre peut en faire (imprimer, copier, modifier) et les propriétés du fichier (auteur, sujet, mots-clés), puis rend ces réglages à l'export. Elle ne
// fait que choisir : le chiffrement est celui de pdfmake (js/pdf-protection.js). Pour un lot (une archive ZIP), elle tient lieu de confirmation et dit combien de PDF partent.
// `open` rend une promesse : les réglages de PdfProtection.normalize (mode, mot de passe, passwordColumn, allowPrint, allowCopy, allowModify, author, subject, keywords) ou null
// (Annuler, Échap).
// D'où vient le mot de passe, trois choix (demande du 12/10, « laisser 3 choix à l'utilisateur ») :
//  - « Saisi à chaque export » (le conseillé, celui de départ) : tapé ici, gardé NULLE PART - ni dans le navigateur, ni dans le document, ni d'une ouverture de la fenêtre à la
//    suivante (le champ repart vide, masqué) ;
//  - « Le même pour tous, enregistré dans le document » : un mot de passe commun, écrit en clair dans la table des modèles (Templates.PDF_PASSWORD_LOCATION : la colonne
//    MotDePassePdf de la ligne « Réglages du document »). La fenêtre dit où et le risque - toute personne qui ouvre le document le lit, sauf permissions avancées de Grist -, le
//    relit à l'ouverture (champ grisé le temps de la lecture) et ne l'écrit que s'il change, AVANT d'exporter : écriture refusée, l'export ne part pas. Un compte en lecture seule
//    s'en sert sans pouvoir le changer ;
//  - « Un par ligne, lu dans une colonne » : la colonne de la table (liste avec recherche) dont la cellule de chaque ligne est le mot de passe de son PDF, avec le même
//    avertissement (en clair dans Grist). Les cellules ne sont lues qu'à l'export (js/main.js, PdfProtection.settingsForRow) : une ligne sans mot de passe utilisable n'est pas
//    exportée et la fin du lot le dit.
// Ce qui se garde par navigateur (js/person-store.js : le navigateur, ou GFS quand elle héberge le widget) : le choix du mode, les trois droits, l'auteur et la colonne choisie (avec sa table) - jamais un mot de passe.
// Le sujet et les mots-clés repartent vides : ils dépendent du document. Sans rien de protégé (aucun mot de passe et les trois droits permis ; ou, par ligne, aucune colonne),
// le PDF serait un PDF ordinaire : « Exporter » reste grisé, et la phrase sous les droits dit quoi faire.
const PdfProtectionDialog = (function () {
  const STORAGE = 'pp_pdf_protection';
  const el = Dom.el;

  let win = null;
  let refs = null;
  let current = null; // { finish(valeur) } : de quoi refermer la fenêtre en rendant sa réponse
  let context = {};   // ce que l'appelant a dit de cet export (open)
  let columnSearch = null; // la liste avec recherche des colonnes (SearchSelect), absente quand le composant ne s'est pas attaché
  // Le mot de passe enregistré dans le document, tel que la fenêtre le connaît : state 'idle' (pas lu), 'loading', 'ready', 'unreadable' (la table n'a pas pu être lue),
  // 'tooLong' (plus de 127 octets : écrit à la main dans Grist) ; value : ce qui est dans le document, ce que la fenêtre n'écrit que si le champ en diffère.
  let stored = { state: 'idle', value: '' };
  let readToken = 0;      // une lecture (mot de passe, schéma) qui revient après la fermeture ou la réouverture de la fenêtre est ignorée
  let saving = false;
  let errorKey = '';

  function readSaved() {
    try { const raw = JSON.parse(PersonStore.get(STORAGE) || 'null'); return raw && typeof raw === 'object' ? raw : null; } catch (e) { return null; }
  }
  // Jamais un mot de passe : le mode, les droits, l'auteur et la colonne des mots de passe (avec la table dont elle est) se retrouvent à l'export suivant.
  function writeSaved(settings) {
    try {
      PersonStore.set(STORAGE, JSON.stringify({
        mode: settings.mode, allowPrint: settings.allowPrint, allowCopy: settings.allowCopy, allowModify: settings.allowModify, author: settings.author,
        passwordTable: context.table || '', passwordColumn: refs.column.select.value || '',
      }));
    } catch (e) { /* rien à garder : le choix ne survivra pas au rechargement */ }
  }

  // Un champ de texte nommé par son libellé, posé sous lui.
  function field(id, type) {
    const label = el('label', 'pp-protect-label');
    label.htmlFor = id;
    const input = el('input', 'pp-protect-input');
    input.id = id;
    input.type = type;
    input.autocomplete = type === 'password' ? 'new-password' : 'off';
    input.spellcheck = false;
    return { label, input };
  }
  // Une case à cocher (ou un bouton radio) et son texte.
  function check(id, type, name) {
    const wrap = el('label', 'pp-protect-check');
    const input = el('input');
    input.type = type || 'checkbox';
    input.id = id;
    if (name) input.name = name;
    const text = el('span');
    wrap.append(input, text);
    return { wrap, input, text };
  }
  // Un mot de passe masqué et la case qui le montre, à sa droite sur la même ligne (`row`).
  function secret(id, showId) {
    const f = field(id, 'password');
    f.input.maxLength = PdfProtection.MAX_PASSWORD_BYTES;
    const show = check(showId);
    show.input.addEventListener('change', () => { f.input.type = show.input.checked ? 'text' : 'password'; });
    const row = el('div', 'pp-protect-secret');
    row.append(f.input, show.wrap);
    return Object.assign(f, { show, row });
  }
  // Un avertissement de risque : « Risque : » en tête, puis la phrase.
  function risk(id) {
    const wrap = el('p', 'pp-protect-risk');
    wrap.id = id;
    const lead = el('strong');
    const text = el('span');
    wrap.append(lead, document.createTextNode(' '), text);
    return { wrap, lead, text };
  }

  function ensure() {
    if (win) return;
    win = ModalBase.create({
      id: 'pp-protect-modal', titleId: 'pp-protect-title', size: 'md', boxClass: 'pp-protect-box', actionsClass: 'var-modal-actions',
      onEscape: () => { if (current) current.finish(null); else win.hide(); },
    });
    const intro = el('p', 'pp-protect-intro');
    intro.id = 'pp-protect-intro';

    // Le choix de la provenance du mot de passe.
    const modes = el('fieldset', 'pp-protect-modes');
    const modesLegend = el('legend', 'pp-protect-label');
    const radios = {};
    PdfProtection.MODES.forEach(mode => { radios[mode] = check('pp-protect-mode-' + mode, 'radio', 'pp-protect-mode'); radios[mode].input.value = mode; });
    const modeList = el('div', 'pp-protect-mode-list');
    modeList.append(radios.typed.wrap, radios.stored.wrap, radios.column.wrap);
    modes.append(modesLegend, modeList);

    // 1. Saisi à chaque export.
    const password = secret('pp-protect-password', 'pp-protect-show');
    const hint = el('p', 'pp-protect-hint');
    hint.id = 'pp-protect-password-hint';
    password.input.setAttribute('aria-describedby', hint.id);
    const typedPanel = el('div', 'pp-protect-panel');
    typedPanel.id = 'pp-protect-panel-typed';
    typedPanel.append(password.label, password.row, hint);

    // 2. Enregistré dans le document.
    const storedField = secret('pp-protect-stored', 'pp-protect-show-stored');
    const storedStatus = el('p', 'pp-protect-hint pp-protect-stored-status');
    storedStatus.id = 'pp-protect-stored-status';
    storedStatus.setAttribute('role', 'status');
    const where = el('p', 'pp-protect-hint pp-protect-where');
    where.id = 'pp-protect-where';
    const storedRisk = risk('pp-protect-stored-risk');
    storedField.input.setAttribute('aria-describedby', [storedStatus.id, where.id, storedRisk.wrap.id].join(' '));
    const storedPanel = el('div', 'pp-protect-panel');
    storedPanel.id = 'pp-protect-panel-stored';
    storedPanel.append(storedField.label, storedField.row, storedStatus, where, storedRisk.wrap);

    // 3. Un par ligne, lu dans une colonne.
    const columnLabel = el('label', 'pp-protect-label');
    columnLabel.htmlFor = 'pp-protect-column';
    const columnSelect = document.createElement('select');
    columnSelect.id = 'pp-protect-column';
    columnSelect.className = 'pp-protect-select';
    const columnHint = el('p', 'pp-protect-hint pp-protect-column-hint');
    columnHint.id = 'pp-protect-column-hint';
    const columnRisk = risk('pp-protect-column-risk');
    columnSelect.setAttribute('aria-describedby', columnHint.id + ' ' + columnRisk.wrap.id);
    const columnPanel = el('div', 'pp-protect-panel');
    columnPanel.id = 'pp-protect-panel-column';
    columnPanel.append(columnLabel, columnSelect, columnHint, columnRisk.wrap);
    try { columnSearch = SearchSelect.attachColumns(columnSelect); } catch (e) { columnSearch = null; console.warn('[PdfProtectionDialog] recherche de colonne indisponible, liste native conservée', e); }

    const error = el('p', 'pp-protect-error');
    error.id = 'pp-protect-error';
    error.setAttribute('role', 'alert');
    error.hidden = true;

    const rights = el('fieldset', 'pp-protect-rights');
    const legend = el('legend', 'pp-protect-label');
    const print = check('pp-protect-print');
    const copy = check('pp-protect-copy');
    const modify = check('pp-protect-modify');
    const note = el('p', 'pp-protect-hint pp-protect-note');
    note.id = 'pp-protect-rights-note';
    const nothing = el('p', 'pp-protect-warning');
    nothing.id = 'pp-protect-nothing';
    nothing.setAttribute('role', 'status');
    const checks = el('div', 'pp-protect-checks');
    checks.append(print.wrap, copy.wrap, modify.wrap);
    rights.append(legend, checks, note);
    rights.setAttribute('aria-describedby', note.id + ' ' + nothing.id);

    const props = el('details', 'pp-protect-props');
    const summary = el('summary', 'pp-protect-summary');
    const author = field('pp-protect-author', 'text');
    const subject = field('pp-protect-subject', 'text');
    const keywords = field('pp-protect-keywords', 'text');
    [author, subject, keywords].forEach(f => { f.input.maxLength = PdfProtection.MAX_PROPERTY; });
    props.append(summary, author.label, author.input, subject.label, subject.input, keywords.label, keywords.input);

    // « Rien n'est protégé » se pose au-dessus des droits, pas sous eux : le contenu défile, et la raison d'un « Exporter » grisé doit rester sous les yeux.
    win.body.append(intro, modes, typedPanel, storedPanel, columnPanel, error, nothing, rights, props);
    const { cancel, ok } = win.addButtons();
    refs = {
      intro, modesLegend, radios, panels: { typed: typedPanel, stored: storedPanel, column: columnPanel }, props,
      password, hint, stored: storedField, storedStatus, where, storedRisk, column: { label: columnLabel, select: columnSelect, hint: columnHint, risk: columnRisk },
      error, legend, print, copy, modify, note, nothing, summary, author, subject, keywords, cancel, ok,
    };

    // Les cases et les champs disent aussitôt si la protection tient ; Entrée valide depuis un champ ou une case, sauf pendant une composition de texte (le titre « Propriétés »
    // garde son Entrée : il ouvre ou ferme le groupe) et sauf dans la zone de recherche de la liste des colonnes, où elle choisit la colonne. Un mot de passe tient dans 127 octets :
    // au-delà, le champ refuse la frappe comme avec un maxlength (ce que la personne voit est ce qui ouvre le fichier - jamais un mot de passe coupé en silence), sans couper un
    // caractère en deux.
    win.body.addEventListener('input', event => {
      if (event.target === password.input || event.target === storedField.input) {
        const kept = PdfProtection.normalize({ password: event.target.value }).password;
        if (kept !== event.target.value) event.target.value = kept;
      }
      clearError();
      render();
    });
    win.body.addEventListener('change', event => {
      if (event.target && event.target.name === 'pp-protect-mode') onModeChange();
      clearError();
      render();
    });
    win.body.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.isComposing || event.defaultPrevented || !(event.target instanceof HTMLInputElement)) return;
      if (event.target.closest('.ss-wrap')) return;
      event.preventDefault();
      apply();
    });
    ok.addEventListener('click', apply);
  }

  const readMode = () => PdfProtection.MODES.find(mode => refs.radios[mode].input.checked) || 'typed';
  const isLocked = () => (typeof AccessRights !== 'undefined' && AccessRights.get().readOnly) || GristAPI.isDocumentReadOnly();

  // Ce que la fenêtre porte en ce moment, tel que PdfProtection le lit.
  function readState() {
    const { password, stored: storedField, print, copy, modify, author, subject, keywords, column } = refs;
    const mode = readMode();
    return PdfProtection.normalize({
      mode, password: mode === 'stored' ? storedField.input.value : password.input.value, passwordColumn: column.select.value,
      allowPrint: print.input.checked, allowCopy: copy.input.checked, allowModify: modify.input.checked,
      author: author.input.value, subject: subject.input.value, keywords: keywords.input.value,
    });
  }

  function clearError() {
    errorKey = '';
    refs.error.hidden = true;
    refs.error.textContent = '';
  }
  function showError(key) {
    errorKey = key;
    refs.error.textContent = I18n.t(key);
    refs.error.hidden = false;
  }

  // Le texte d'accueil d'un lot : combien de PDF, de quelle table, avec quel mot de passe (le même pour tous, ou celui de leur ligne).
  function introText(mode) {
    if (!context.batch) return '';
    const key = mode === 'column' ? (context.grid ? 'pdfProtect.batchColumnGrid' : 'pdfProtect.batchColumn') : (context.grid ? 'pdfProtect.batchGrid' : 'pdfProtect.batch');
    return I18n.t(key, { count: Math.max(0, Number(context.count) || 0), table: context.table || '' });
  }

  // Les colonnes de la table qui peuvent donner un mot de passe (PdfProtection.isPasswordColumnType), dans l'ordre de la table.
  function passwordColumns(table) {
    if (!table) return [];
    return GristAPI.getVisibleColumns(table).filter(col => PdfProtection.isPasswordColumnType(GristAPI.getColumnType(table, col)));
  }
  function fillColumns(wanted) {
    const { select } = refs.column;
    const table = context.table;
    select.innerHTML = '';
    select.appendChild(Dom.option('', I18n.t('macro.modal.columnChoosePlaceholder')));
    const choices = passwordColumns(table);
    choices.forEach(col => {
      if (typeof ConditionFields !== 'undefined') ConditionFields.appendColumnOption(select, col, table, col);
      else select.appendChild(Dom.option(col, col));
    });
    select.value = choices.indexOf(wanted) !== -1 ? wanted : '';
    if (columnSearch) columnSearch.sync();
    return choices;
  }
  // Une colonne ajoutée dans Grist depuis la dernière lecture du schéma n'est pas encore dans la liste : elle se relit à l'arrivée sur ce mode (pas plus d'une fois par
  // 20 s), sans faire attendre la fenêtre, et ce qui était choisi le reste.
  function refreshColumns() {
    const token = readToken;
    const wanted = refs.column.select.value;
    Promise.resolve(GristAPI.refreshSchema({ maxAgeMs: 20000 })).then(() => {
      if (token !== readToken || !current) return;
      fillColumns(wanted);
      render();
    }).catch(() => {});
  }

  // Le mot de passe enregistré dans le document : relu à l'arrivée sur ce mode (une fois par ouverture de la fenêtre), champ grisé le temps de la lecture.
  function loadStored() {
    if (stored.state !== 'idle') return;
    stored = { state: 'loading', value: '' };
    const token = readToken;
    const input = refs.stored.input;
    input.value = '';
    const settle = (state, value) => {
      if (token !== readToken || !current) return;
      stored = { state, value: state === 'ready' ? value : '' };
      input.value = state === 'ready' ? value : '';
      render();
    };
    if (typeof Templates === 'undefined' || typeof Templates.readPdfPassword !== 'function') { settle('unreadable', ''); return; }
    Templates.readPdfPassword().then(result => {
      if (!result || !result.ok) { settle('unreadable', ''); return; }
      // Écrit à la main dans Grist au-delà de 127 octets : jamais coupé en silence, la personne en tape un nouveau.
      const kept = PdfProtection.normalize({ password: result.password }).password;
      settle(kept === result.password ? 'ready' : 'tooLong', kept === result.password ? result.password : '');
    }, () => settle('unreadable', ''));
  }

  function onModeChange() {
    const mode = readMode();
    if (mode === 'stored') loadStored();
    if (mode === 'column') refreshColumns();
  }

  // Le mot de passe du mode « enregistré » diffère-t-il de celui du document ? Un champ vide sur un document illisible n'efface rien (on ne sait pas ce qu'il y a), et un compte en
  // lecture seule ne change rien.
  function storedChanged(settings) {
    if (isLocked() || stored.state === 'loading') return false;
    if (stored.state === 'unreadable' && settings.password === '') return false;
    return settings.password !== stored.value;
  }

  // « Exporter » n'est permis que si quelque chose est protégé et que la fenêtre n'attend rien de Grist ; sinon la phrase sous les droits dit quoi faire.
  function render() {
    const mode = readMode();
    const { panels, intro, ok, nothing } = refs;
    PdfProtection.MODES.forEach(m => { panels[m].hidden = m !== mode; });
    const batchText = introText(mode);
    intro.hidden = !batchText;
    intro.textContent = batchText;
    win.box.setAttribute('aria-describedby', batchText ? intro.id : (mode === 'typed' ? refs.hint.id : mode === 'stored' ? refs.where.id : refs.column.hint.id));

    // Enregistré dans le document : l'état de la lecture, le champ grisé pendant qu'elle dure ou en lecture seule pour un compte qui ne peut pas écrire.
    const locked = isLocked();
    const storedInput = refs.stored.input;
    storedInput.disabled = stored.state === 'loading' || saving;
    storedInput.readOnly = locked;
    const statusKey = stored.state === 'loading' ? 'pdfProtect.stored.loading' : stored.state === 'unreadable' ? 'pdfProtect.stored.unreadable'
      : stored.state === 'tooLong' ? 'pdfProtect.stored.tooLong' : (locked ? 'pdfProtect.stored.readOnly' : '');
    refs.storedStatus.textContent = statusKey ? I18n.t(statusKey) : '';
    refs.storedStatus.hidden = !statusKey;

    // Un par ligne : la colonne, ou la raison pour laquelle il n'y en a pas à choisir.
    const choices = mode === 'column' ? passwordColumns(context.table) : [];
    const noColumn = mode === 'column' && !choices.length;
    if (refs.column.select.disabled !== noColumn && mode === 'column') {
      refs.column.select.disabled = noColumn;
      if (columnSearch) columnSearch.sync();
    }
    refs.column.hint.textContent = noColumn ? I18n.t('pdfProtect.column.none', { table: context.table || '' }) : I18n.t('pdfProtect.column.hint');

    const state = readState();
    const protects = PdfProtection.protects(state);
    ok.disabled = !protects || saving || (mode === 'stored' && stored.state === 'loading');
    nothing.textContent = protects ? '' : I18n.t(mode === 'column' ? 'pdfProtect.column.pick' : 'pdfProtect.nothing');
    nothing.hidden = protects;
    ok.textContent = saving ? I18n.t('pdfProtect.stored.saving') : I18n.t(context.batch ? 'common.generate' : 'toolbar.export');
    if (errorKey) { refs.error.textContent = I18n.t(errorKey); refs.error.hidden = false; }
  }

  async function apply() {
    if (!current || refs.ok.disabled) return;
    const run = current;
    const settings = readState();
    // Le mot de passe commun change : il s'écrit dans le document AVANT l'export. Refusé (droit absent, colonne que les règles d'accès cachent, Grist injoignable) : la fenêtre
    // reste ouverte et le dit - un PDF ne part jamais avec un mot de passe que le document n'a pas gardé.
    if (settings.mode === 'stored' && storedChanged(settings)) {
      saving = true;
      render();
      let wrote = false;
      try { wrote = typeof Templates !== 'undefined' && (await Templates.writePdfPassword(settings.password)) === true; } catch (e) { wrote = false; }
      saving = false;
      if (current !== run) return; // fermée (ou rouverte) pendant l'écriture : plus rien à rendre
      if (!wrote) { showError('pdfProtect.stored.saveFailed'); render(); return; }
      stored = { state: 'ready', value: settings.password };
    }
    writeSaved(settings);
    run.finish(settings);
  }

  // Ouvre la fenêtre. `table` : la table de l'export (la colonne des mots de passe en est une) ; `batch` : un lot (archive ZIP) de `count` PDF, dont elle tient lieu de
  // confirmation (`grid` : un modèle de grille, dont les lignes sont des « valeurs ») ; sans `batch`, c'est le PDF de la ligne affichée. Une demande qui arrive pendant qu'une
  // autre est ouverte annule la première (résolue comme Annuler).
  function open(opts) {
    if (typeof ModalBase === 'undefined' || typeof PdfProtection === 'undefined') return Promise.resolve(null);
    ensure();
    if (current) current.finish(null);
    context = opts || {};
    return new Promise(resolve => {
      let done = false;
      const finish = value => {
        if (done) return;
        done = true;
        current = null;
        readToken++;
        refs.password.input.value = '';
        refs.stored.input.value = '';
        win.hide();
        resolve(value);
      };
      current = { finish };
      readToken++;
      stored = { state: 'idle', value: '' };
      saving = false;
      clearError();
      const rawSaved = readSaved();
      const saved = PdfProtection.normalize(rawSaved);
      const { modesLegend, radios, password, hint, legend, print, copy, modify, note, summary, author, subject, keywords, cancel } = refs;
      win.title.textContent = I18n.t('pdfProtect.title');
      modesLegend.textContent = I18n.t('pdfProtect.mode.label');
      PdfProtection.MODES.forEach(mode => { radios[mode].text.textContent = I18n.t('pdfProtect.mode.' + mode); radios[mode].input.checked = mode === saved.mode; });
      password.label.textContent = I18n.t('pdfProtect.password.label');
      password.input.value = '';
      password.input.type = 'password';
      password.show.input.checked = false;
      password.show.text.textContent = I18n.t('pdfProtect.show');
      hint.textContent = I18n.t('pdfProtect.password.hint');
      const storedField = refs.stored;
      storedField.label.textContent = I18n.t('pdfProtect.stored.label');
      storedField.input.value = '';
      storedField.input.type = 'password';
      storedField.show.input.checked = false;
      storedField.show.text.textContent = I18n.t('pdfProtect.show');
      const place = typeof Templates !== 'undefined' && Templates.PDF_PASSWORD_LOCATION;
      refs.where.textContent = place ? I18n.t('pdfProtect.stored.where', { table: place.table, column: place.column, label: place.label, row: place.row }) : '';
      refs.storedRisk.lead.textContent = I18n.t('pdfProtect.risk.lead');
      refs.storedRisk.text.textContent = I18n.t('pdfProtect.stored.risk');
      refs.column.label.textContent = I18n.t('pdfProtect.column.label');
      refs.column.risk.lead.textContent = I18n.t('pdfProtect.risk.lead');
      refs.column.risk.text.textContent = I18n.t('pdfProtect.column.risk', { table: context.table || '' });
      // La colonne choisie la dernière fois ne revient que pour la même table.
      fillColumns(rawSaved && rawSaved.passwordTable === context.table ? saved.passwordColumn : '');
      legend.textContent = I18n.t('pdfProtect.rights.label');
      print.text.textContent = I18n.t('pdfProtect.rights.print');
      copy.text.textContent = I18n.t('pdfProtect.rights.copy');
      modify.text.textContent = I18n.t('pdfProtect.rights.modify');
      note.textContent = I18n.t('pdfProtect.rights.note');
      print.input.checked = saved.allowPrint;
      copy.input.checked = saved.allowCopy;
      modify.input.checked = saved.allowModify;
      summary.textContent = I18n.t('pdfProtect.props.label');
      author.label.textContent = I18n.t('pdfProtect.props.author');
      subject.label.textContent = I18n.t('pdfProtect.props.subject');
      keywords.label.textContent = I18n.t('pdfProtect.props.keywords');
      author.input.value = saved.author;
      subject.input.value = '';
      keywords.input.value = '';
      // La fenêtre est la même d'une fois à l'autre : les propriétés se replient et le contenu revient en haut (une fois la fenêtre affichée : masquée, elle n'a pas de défilement
      // à remettre), sinon la fois suivante s'ouvre là où la précédente a fini, les trois façons de donner le mot de passe hors de vue.
      refs.props.open = false;
      cancel.textContent = I18n.t('common.cancel');
      cancel.onclick = () => finish(null);
      render();
      onModeChange();
      render();
      const first = saved.mode === 'typed' ? password.input : saved.mode === 'stored' ? radios.stored.input : refs.column.select;
      win.show(() => { win.body.scrollTop = 0; return first; });
    });
  }

  return { STORAGE, open };
})();
