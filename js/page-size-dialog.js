// Fenêtre « Format libre… » du menu Page (js/orientation-toggle.js) : la taille de la page du modèle saisie en centimètres, largeur et hauteur, avec une feuille d'aperçu
// à l'échelle. Elle ne pose rien elle-même : « Valider » passe la taille à OrientationToggle.selectPageSize (mêmes gardes que les autres gestes de la page : type de
// modèle suivi, export en cours, lecture seule). PageLayout.setPageSize borne la page et annonce pp:pageLayoutChanged, d'où l'éditeur, la Lecture, le PDF, le Word et
// l'assemblage avant impression la suivent ; pp:marginsChanged prévient l'enregistrement automatique, et la taille voyage avec le modèle (clé `format` de sa colonne Margins).
// Les nombres s'écrivent avec la virgule ou le point (« 10,5 », « 10.5 », « 10,5 cm »). Une valeur hors de PageLayout.CUSTOM_MIN_MM … CUSTOM_MAX_MM est refusée sous le
// champ au lieu d'être corrigée en silence, et « Valider » reste grisé tant que l'un des deux champs n'est pas bon. La fenêtre ne demande pas le sens : plus large que
// haute, la page est en paysage (la ligne « Paysage » du menu se coche d'elle-même).
const PageSizeDialog = (function () {
  const PREVIEW_PX = 96; // côté du carré où la feuille d'aperçu tient, quel que soit son sens

  let win = null;
  let refs = null;
  let shown = null; // { widthMm, heightMm } : la dernière page valide, celle que l'aperçu dessine

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

    const widthLabel = el('label', 'pp-pagesize-label'); widthLabel.htmlFor = 'pp-pagesize-width';
    const width = field('pp-pagesize-width');
    const heightLabel = el('label', 'pp-pagesize-label'); heightLabel.htmlFor = 'pp-pagesize-height';
    const height = field('pp-pagesize-height');

    // L'indication et l'erreur commencent sous les champs, pas sous leur libellé.
    const notes = el('div', 'pp-pagesize-notes');
    const hint = el('p', 'pp-pagesize-note'); hint.id = 'pp-pagesize-hint';
    const error = el('p', 'pp-pagesize-note pp-pagesize-error'); error.id = 'pp-pagesize-error';
    error.setAttribute('role', 'alert');
    error.hidden = true;
    notes.append(hint, error);

    // La feuille d'aperçu : la page à l'échelle d'un carré, sa taille et son sens dessous. Le papier est blanc dans les deux thèmes, comme celui du document.
    const preview = el('div', 'pp-pagesize-preview');
    preview.setAttribute('aria-hidden', 'true');
    const stage = el('div', 'pp-pagesize-stage');
    const sheet = el('div', 'pp-pagesize-sheet');
    stage.appendChild(sheet);
    const caption = el('div', 'pp-pagesize-caption');
    const orientation = el('div', 'pp-pagesize-orientation');
    preview.append(stage, caption, orientation);

    grid.append(widthLabel, width.cell, heightLabel, height.cell, notes, preview);
    win.body.appendChild(grid);

    const spacer = el('span', 'var-modal-spacer');
    const cancel = el('button');
    cancel.type = 'button';
    const ok = el('button', 'var-modal-primary');
    ok.type = 'button';
    win.actions.append(spacer, cancel, ok);
    refs = { widthLabel, width: width.input, heightLabel, height: height.input, hint, error, sheet, caption, orientation, cancel, ok };

    // Entrée valide, sauf pendant une composition (accent mort, saisie asiatique) : elle ne fait alors que choisir le caractère.
    const submitOnEnter = event => {
      if (event.key !== 'Enter' || event.isComposing) return;
      event.preventDefault();
      apply();
    };
    [width.input, height.input].forEach(input => {
      input.addEventListener('input', render);
      input.addEventListener('keydown', submitOnEnter);
    });
    cancel.addEventListener('click', () => win.hide());
    ok.addEventListener('click', apply);
  }

  // Les bornes en centimètres, écrites comme la langue de la page écrit un nombre (« 55,88 » / « 55.88 »).
  function bounds() {
    return { min: PageLayout.cmText(PageLayout.CUSTOM_MIN_MM), max: PageLayout.cmText(PageLayout.CUSTOM_MAX_MM) };
  }

  function renderPreview() {
    const { sheet, caption, orientation } = refs;
    const scale = Math.min(PREVIEW_PX / shown.widthMm, PREVIEW_PX / shown.heightMm);
    sheet.style.width = Math.max(2, Math.round(shown.widthMm * scale)) + 'px';
    sheet.style.height = Math.max(2, Math.round(shown.heightMm * scale)) + 'px';
    caption.textContent = PageLayout.cmText(shown.widthMm) + ' × ' + PageLayout.cmText(shown.heightMm) + ' cm';
    orientation.textContent = shown.widthMm > shown.heightMm ? I18n.t('toolbar.page.landscape') : shown.widthMm < shown.heightMm ? I18n.t('toolbar.page.portrait') : '';
  }

  function render() {
    const { width, height, error, ok } = refs;
    const states = [readField(width), readField(height)];
    [width, height].forEach((input, i) => {
      if (states[i].error) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    });
    const failed = states.find(state => state.error);
    error.hidden = !failed;
    error.textContent = failed ? I18n.t('pageSize.error.' + failed.error, bounds()) : '';
    const valid = states.every(state => state.mm !== undefined);
    ok.disabled = !valid;
    if (valid) {
      shown = { widthMm: states[0].mm, heightMm: states[1].mm };
      renderPreview();
    }
  }

  // Ouvre la fenêtre sur la page du modèle (sa largeur et sa hauteur telles qu'on la voit, sens compris). Faux si la fenêtre ne peut pas s'ouvrir.
  function open() {
    if (typeof PageLayout === 'undefined' || typeof ModalBase === 'undefined') return false;
    ensure();
    const { widthLabel, width, heightLabel, height, hint, cancel, ok } = refs;
    const size = PageLayout.getPageSizeMm();
    shown = { widthMm: size.width, heightMm: size.height };
    win.title.textContent = I18n.t('pageSize.title');
    widthLabel.textContent = I18n.t('pageSize.width.label');
    heightLabel.textContent = I18n.t('pageSize.height.label');
    width.setAttribute('aria-label', I18n.t('pageSize.width.aria'));
    height.setAttribute('aria-label', I18n.t('pageSize.height.aria'));
    hint.textContent = I18n.t('pageSize.hint', bounds());
    cancel.textContent = I18n.t('common.cancel');
    ok.textContent = I18n.t('common.confirm');
    width.value = PageLayout.cmText(size.width);
    height.value = PageLayout.cmText(size.height);
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

  return { open, parseCm };
})();
