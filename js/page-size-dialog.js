// Fenêtre « Format libre… » du menu Page (js/orientation-toggle.js) : la taille de la page du modèle saisie en centimètres, largeur et hauteur, avec une feuille d'aperçu
// à l'échelle. Elle ne pose rien elle-même : « Valider » passe la taille à OrientationToggle.selectPageSize (mêmes gardes que les autres gestes de la page : type de
// modèle suivi, export en cours, lecture seule). PageLayout.setPageSize borne la page et annonce pp:pageLayoutChanged, d'où l'éditeur, la Lecture, le PDF, le Word et
// l'assemblage avant impression la suivent ; pp:marginsChanged prévient l'enregistrement automatique, et la taille voyage avec le modèle (clé `format` de sa colonne Margins).
// Les nombres s'écrivent avec la virgule ou le point (« 10,5 », « 10.5 », « 10,5 cm »). Une valeur hors de PageLayout.CUSTOM_MIN_MM … CUSTOM_MAX_MM est refusée sous le
// champ au lieu d'être corrigée en silence, et « Valider » reste grisé tant que l'un des deux champs n'est pas bon. La fenêtre ne demande pas le sens : plus large que
// haute, la page est en paysage (la ligne « Paysage » du menu se coche d'elle-même).
//
// Formats enregistrés (js/saved-page-formats.js, table Publipostage_FormatsPage du document) : une liste avec recherche en tête de fenêtre remplit les deux champs - la taille ne
// s'applique toujours qu'à « Valider » - ; « Enregistrer ce format… » donne un nom à la taille des champs ; la corbeille retire de la liste le format choisi. Modifier un champ après
// avoir choisi un format remet la liste à « — Choisir un format — » : le format choisi n'est plus celui qu'on voit. Le modèle garde sa taille, pas le nom du format : une copie.
const PageSizeDialog = (function () {
  const PREVIEW_PX = 96; // côté du carré où la feuille d'aperçu tient, quel que soit son sens

  let win = null;
  let refs = null;
  let shown = null; // { widthMm, heightMm } : la dernière page valide, celle que l'aperçu dessine
  let notice = '';  // l'échec d'une écriture dans le document ('write' | 'delete'), dit sous les champs jusqu'au prochain geste
  let busy = false; // une écriture est en cours : « Enregistrer ce format… » et la corbeille attendent

  function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // « 7,5 », « 7.5 » ou « 7,5 cm » -> millimètres, au dixième ; null si ce n'est pas un nombre. Le point ou la virgule seule (« 7. », « ,5 ») passe : on tape un nombre.
  function parseCm(text) {
    const match = /^\s*(\d+(?:[.,]\d*)?|[.,]\d+)\s*(?:cm)?\s*$/i.exec(String(text));
    return match ? Math.round(Number(match[1].replace(',', '.')) * 100) / 10 : null;
  }

  // L'état d'un champ : { mm } quand il est bon, { error: 'number' | 'range' } sinon, { empty: true } tant qu'il est vide (rien à reprocher encore).
  function readField(input) {
    if (!input.value.trim()) return { empty: true };
    const mm = parseCm(input.value);
    if (mm === null) return { error: 'number' };
    if (mm < PageLayout.CUSTOM_MIN_MM || mm > PageLayout.CUSTOM_MAX_MM) return { error: 'range' };
    return { mm };
  }

  // « 7 × 3,7 cm » : une taille en toutes lettres, avec la virgule ou le point de la langue.
  function sizeText(widthMm, heightMm) { return PageLayout.cmText(widthMm) + ' × ' + PageLayout.cmText(heightMm) + ' cm'; }

  function field(id) {
    const input = el('input', 'pp-dialog-input');
    input.id = id;
    input.type = 'text';
    input.inputMode = 'decimal';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-describedby', 'pp-pagesize-hint pp-pagesize-error');
    const unit = el('span', 'pp-pagesize-unit', 'cm');
    unit.setAttribute('aria-hidden', 'true');
    const cell = el('div', 'pp-pagesize-field');
    cell.append(input, unit);
    return { input, cell };
  }

  function ensure() {
    if (win) return;
    win = ModalBase.create({ id: 'pp-pagesize-modal', titleId: 'pp-pagesize-title', size: 'md', boxClass: 'pp-pagesize-box', actionsClass: 'var-modal-actions' });
    const grid = el('div', 'pp-pagesize-grid');

    // Les formats enregistrés : la liste avec recherche et, à côté, la corbeille du format choisi (grisée tant qu'aucun n'est choisi).
    const savedLabel = el('label', 'pp-pagesize-label'); savedLabel.htmlFor = 'pp-pagesize-saved';
    const saved = el('select'); saved.id = 'pp-pagesize-saved';
    const remove = el('button', 'pp-pagesize-remove');
    remove.type = 'button';
    remove.innerHTML = Icons.svg('trash');
    remove.firstElementChild.setAttribute('aria-hidden', 'true');
    const savedCell = el('div', 'pp-pagesize-saved');
    savedCell.append(saved, remove);

    const widthLabel = el('label', 'pp-pagesize-label'); widthLabel.htmlFor = 'pp-pagesize-width';
    const width = field('pp-pagesize-width');
    const heightLabel = el('label', 'pp-pagesize-label'); heightLabel.htmlFor = 'pp-pagesize-height';
    const height = field('pp-pagesize-height');

    // L'indication et l'erreur commencent sous les champs, pas sous leur libellé. L'état (« Format enregistré ») n'est dit qu'aux lecteurs d'écran : la liste, qui montre
    // alors le nouveau format, est son témoin à l'écran.
    const notes = el('div', 'pp-pagesize-notes');
    const hint = el('p', 'pp-pagesize-note'); hint.id = 'pp-pagesize-hint';
    const error = el('p', 'pp-pagesize-note pp-pagesize-error'); error.id = 'pp-pagesize-error';
    error.setAttribute('role', 'alert');
    error.hidden = true;
    const status = el('p', 'pp-pagesize-status'); status.id = 'pp-pagesize-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    notes.append(hint, error, status);

    // La feuille d'aperçu : la page à l'échelle d'un carré, sa taille et son sens dessous. Le papier est blanc dans les deux thèmes, comme celui du document.
    const preview = el('div', 'pp-pagesize-preview');
    preview.setAttribute('aria-hidden', 'true');
    const stage = el('div', 'pp-pagesize-stage');
    const sheet = el('div', 'pp-pagesize-sheet');
    stage.appendChild(sheet);
    const caption = el('div', 'pp-pagesize-caption');
    const orientation = el('div', 'pp-pagesize-orientation');
    preview.append(stage, caption, orientation);

    grid.append(savedLabel, savedCell, widthLabel, width.cell, heightLabel, height.cell, notes, preview);
    win.body.appendChild(grid);

    const save = el('button', 'pp-pagesize-save');
    save.type = 'button';
    const spacer = el('span', 'var-modal-spacer');
    const cancel = el('button');
    cancel.type = 'button';
    const ok = el('button', 'var-modal-primary');
    ok.type = 'button';
    win.actions.append(save, spacer, cancel, ok);
    refs = { savedLabel, saved, savedControl: null, remove, widthLabel, width: width.input, heightLabel, height: height.input, hint, error, status, sheet, caption, orientation, save, cancel, ok };

    // La liste avec recherche reprend le <select> (qui reste la source de vérité) ; si le composant manque, la liste native fait le même travail. Le nom seul dans le champ fermé :
    // la taille est dans les champs juste dessous, et dans la liste ouverte à côté de chaque nom.
    try {
      refs.savedControl = SearchSelect.attach(saved, {
        hintInTrigger: false,
        searchPlaceholder: () => I18n.t('pageSize.saved.search'),
        emptyText: () => I18n.t(SavedPageFormats.list().length ? 'pageSize.saved.noMatch' : 'pageSize.saved.none'),
      });
    } catch (e) { refs.savedControl = null; }
    saved.addEventListener('change', onSavedChange);

    // Entrée valide, sauf pendant une composition (accent mort, saisie asiatique) : elle ne fait alors que choisir le caractère.
    const submitOnEnter = event => {
      if (event.key !== 'Enter' || event.isComposing) return;
      event.preventDefault();
      apply();
    };
    [width.input, height.input].forEach(input => {
      input.addEventListener('input', () => { notice = ''; render(); });
      input.addEventListener('keydown', submitOnEnter);
    });
    cancel.addEventListener('click', () => win.hide());
    ok.addEventListener('click', apply);
    save.addEventListener('click', saveCurrent);
    remove.addEventListener('click', removeSelected);
  }

  // Les bornes en centimètres, écrites comme la langue de la page écrit un nombre (« 55,88 » / « 55.88 »).
  function bounds() {
    return { min: PageLayout.cmText(PageLayout.CUSTOM_MIN_MM), max: PageLayout.cmText(PageLayout.CUSTOM_MAX_MM) };
  }

  // === Formats enregistrés ===================================================================================================================================

  // Le format enregistré que la liste montre (null : « — Choisir un format — »).
  function selectedFormat() { return refs.saved.value ? SavedPageFormats.find(refs.saved.value) : null; }

  function syncSavedList() { if (refs.savedControl) refs.savedControl.sync(); }

  // Un bouton grisé le temps d'une écriture perd le focus, que le navigateur rend au document : l'écriture finie, il le retrouve (sauf si la personne l'a déjà posé ailleurs).
  function restoreFocus(button) {
    if (win.isOpen() && !button.disabled && (!document.activeElement || document.activeElement === document.body)) button.focus();
  }

  // Refait les lignes de la liste d'après le document ; `selectedId` : le format à montrer choisi (aucun par défaut). Le nom est ce que la liste cherche et affiche, la taille son indice.
  function rebuildFormats(selectedId) {
    const { saved } = refs;
    saved.textContent = '';
    const none = new Option(I18n.t('pageSize.saved.placeholder'), '');
    none.disabled = true;
    saved.add(none);
    SavedPageFormats.list().forEach(entry => {
      const size = sizeText(entry.widthMm, entry.heightMm);
      const option = new Option(entry.name + ' (' + size + ')', String(entry.rowId));
      option.dataset.name = entry.name;
      option.dataset.hint = size;
      saved.add(option);
    });
    saved.value = selectedId == null ? '' : String(selectedId);
    syncSavedList();
  }

  // Choisir un format de la liste remplit les deux champs ; la page du modèle ne change qu'à « Valider ».
  function onSavedChange() {
    const entry = selectedFormat();
    notice = '';
    refs.status.textContent = '';
    if (entry) {
      refs.width.value = PageLayout.cmText(entry.widthMm);
      refs.height.value = PageLayout.cmText(entry.heightMm);
    }
    render();
  }

  // « Enregistrer ce format… » : le nom est demandé (la taille en toutes lettres, sous le premier nom libre, par défaut : Entrée suffit) puis la taille des champs entre dans la liste, choisie.
  async function saveCurrent() {
    const { width, height, status } = refs;
    const w = readField(width);
    const h = readField(height);
    if (busy || w.mm === undefined || h.mm === undefined || typeof Dialogs === 'undefined') return;
    const proposal = sizeText(w.mm, h.mm);
    const asked = await Dialogs.prompt({
      title: I18n.t('pageSize.saved.saveTitle'),
      label: I18n.t('pageSize.saved.nameLabel'),
      value: SavedPageFormats.uniqueName(proposal),
      confirmLabel: I18n.t('common.save'),
    });
    if (asked === null) return;
    busy = true;
    notice = '';
    render();
    let entry = null;
    try {
      entry = await SavedPageFormats.add(asked.trim() ? asked : proposal, w.mm, h.mm);
    } catch (e) {
      console.warn('[page-size] format non enregistré', e);
      notice = 'write';
    }
    busy = false;
    if (entry) {
      rebuildFormats(entry.rowId);
      status.textContent = I18n.t('pageSize.saved.saved', { name: entry.name });
    }
    render();
    restoreFocus(refs.save);
  }

  // La corbeille : après confirmation, le format choisi quitte la liste. Les modèles qui l'ont utilisé gardent leur taille (le format n'était qu'une façon de la saisir).
  async function removeSelected() {
    const entry = selectedFormat();
    if (busy || !entry || typeof Dialogs === 'undefined') return;
    const sure = await Dialogs.confirm({
      title: I18n.t('pageSize.saved.deleteTitle'),
      message: I18n.t('pageSize.saved.deleteMessage', { name: entry.name, size: sizeText(entry.widthMm, entry.heightMm) }),
      confirmLabel: I18n.t('common.delete'),
      danger: true,
    });
    if (!sure) return;
    busy = true;
    notice = '';
    render();
    let gone = false;
    try {
      gone = await SavedPageFormats.remove(entry.rowId);
    } catch (e) {
      console.warn('[page-size] format non supprimé', e);
      notice = 'delete';
    }
    busy = false;
    if (gone) {
      rebuildFormats(null);
      refs.status.textContent = I18n.t('pageSize.saved.deleted', { name: entry.name });
    }
    render();
    // La corbeille vient de se griser : le focus retourne à la liste plutôt que de tomber sur le document (le <select> masqué passe le focus à son champ visible).
    if (gone && win.isOpen()) refs.saved.focus();
    else restoreFocus(refs.remove);
  }

  // === La fenêtre ============================================================================================================================================

  function renderPreview() {
    const { sheet, caption, orientation } = refs;
    const scale = Math.min(PREVIEW_PX / shown.widthMm, PREVIEW_PX / shown.heightMm);
    sheet.style.width = Math.max(2, Math.round(shown.widthMm * scale)) + 'px';
    sheet.style.height = Math.max(2, Math.round(shown.heightMm * scale)) + 'px';
    caption.textContent = sizeText(shown.widthMm, shown.heightMm);
    orientation.textContent = shown.widthMm > shown.heightMm ? I18n.t('toolbar.page.landscape') : shown.widthMm < shown.heightMm ? I18n.t('toolbar.page.portrait') : '';
  }

  function render() {
    const { width, height, error, ok, save, remove, saved } = refs;
    const states = [readField(width), readField(height)];
    [width, height].forEach((input, i) => {
      if (states[i].error) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    });
    const failed = states.find(state => state.error);
    const message = failed ? I18n.t('pageSize.error.' + failed.error, bounds()) : notice ? I18n.t('pageSize.saved.error.' + notice) : '';
    error.hidden = !message;
    error.textContent = message;
    const valid = states.every(state => state.mm !== undefined);
    ok.disabled = !valid;
    save.disabled = !valid || busy;
    // Un champ retouché après le choix d'un format ne correspond plus à lui : la liste revient à son invite.
    const entry = selectedFormat();
    if (entry && !(states[0].mm === entry.widthMm && states[1].mm === entry.heightMm)) {
      saved.value = '';
      syncSavedList();
    }
    remove.disabled = !selectedFormat() || busy;
    if (valid) {
      shown = { widthMm: states[0].mm, heightMm: states[1].mm };
      renderPreview();
    }
  }

  // Ouvre la fenêtre sur la page du modèle (sa largeur et sa hauteur telles qu'on la voit, sens compris). Faux si la fenêtre ne peut pas s'ouvrir.
  function open() {
    if (typeof PageLayout === 'undefined' || typeof ModalBase === 'undefined') return false;
    ensure();
    const { savedLabel, saved, remove, widthLabel, width, heightLabel, height, hint, save, cancel, ok, status } = refs;
    const size = PageLayout.getPageSizeMm();
    shown = { widthMm: size.width, heightMm: size.height };
    notice = '';
    busy = false;
    win.title.textContent = I18n.t('pageSize.title');
    savedLabel.textContent = I18n.t('pageSize.saved.label');
    widthLabel.textContent = I18n.t('pageSize.width.label');
    heightLabel.textContent = I18n.t('pageSize.height.label');
    width.setAttribute('aria-label', I18n.t('pageSize.width.aria'));
    height.setAttribute('aria-label', I18n.t('pageSize.height.aria'));
    remove.title = I18n.t('pageSize.saved.delete');
    remove.setAttribute('aria-label', I18n.t('pageSize.saved.delete'));
    hint.textContent = I18n.t('pageSize.hint', bounds());
    save.textContent = I18n.t('pageSize.saved.save');
    cancel.textContent = I18n.t('common.cancel');
    ok.textContent = I18n.t('common.confirm');
    status.textContent = '';
    width.value = PageLayout.cmText(size.width);
    height.value = PageLayout.cmText(size.height);
    // Les formats enregistrés sont relus du document à chaque ouverture (un format ajouté depuis un autre onglet ou à la main dans Grist y figure) ; la liste attend leur arrivée, grisée.
    rebuildFormats(null);
    saved.disabled = true;
    syncSavedList();
    SavedPageFormats.load(true).catch(() => {}).then(() => {
      saved.disabled = false;
      rebuildFormats(saved.value || null);
    });
    render();
    win.show(width);
    width.select();
    return true;
  }

  // « Valider » : la page change par OrientationToggle (qui refuse hors des gardes) ; un champ qui n'est pas bon garde la fenêtre ouverte et reprend le focus.
  function apply() {
    const { width, height } = refs;
    const w = readField(width);
    const h = readField(height);
    if (w.mm === undefined || h.mm === undefined) { (w.mm === undefined ? width : height).focus(); return; }
    if (typeof OrientationToggle !== 'undefined') OrientationToggle.selectPageSize(w.mm, h.mm);
    win.hide();
  }

  return { open };
})();
