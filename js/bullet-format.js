// « Puce… » (menu Liste) : le signe de la puce d'une liste à puces, comme dans PowerPoint et dans Word. Demande du 24/10 (import PowerPoint sans perte, chantier 9 « caractères et puces », lot 9d) :
// un fichier PowerPoint met presque toujours une puce de son choix (un tiret, une flèche, une coche, un losange), et l'éditeur n'en connaissait que trois (le rond, le rond creux, le carré).
//
// Le signe est un attribut de la liste, `bulletChar`, comme son style (`bulletStyle`, js/editor-nodes.js:createBulletStyleExtension) : écrit `data-bullet-char="➢"` et, pour que la Lecture, l'impression
// et tout lecteur du HTML le dessinent sans connaître l'extension, en variable CSS sur la liste (`--pp-bullet-char: '➢ '`, que `li::marker` lit : css/editor-v2.css). Un seul caractère visible, ni
// guillemet, ni barre oblique inverse, ni espace, ni caractère de commande : le HTML d'une autre personne passe dans une variable CSS et dans un attribut. Le rond d'origine (« • ») n'est pas un
// réglage. Un des trois boutons de style de la liste (disque, cercle, carré) retire le signe choisi : un seul des deux dit la puce.
//
// La fenêtre : un champ « Signe » (un seul caractère, tapé ou collé), une rangée de signes courants à un clic, « Par défaut » (le style de la liste), « Valider » (un pas d'historique). La ligne
// du menu est grisée, avec sa raison, hors d'une liste à puces. Le PDF (js/pdf-export.js), le Word (js/docx-export.js), le PowerPoint (js/pptx-export.js), le texte des courriels (js/mailto-export.js)
// et le HTML exporté (js/html-export.js) le lisent par `markerOf` ; l'import PowerPoint (js/pptx-import.js) l'écrit par `markup`.
const BulletFormat = (function () {
  const el = Dom.el;
  const ATTR = 'data-bullet-char';
  const VAR = '--pp-bullet-char';
  const DEFAULT_CHAR = '•';
  // Les signes courants de la fenêtre : un tiret, des flèches, des coches, des formes, une étoile.
  const PRESETS = ['–', '—', '➢', '➔', '►', '✓', '✔', '■', '◆', '★', '✦', '❖'];

  // Un signe permis : un seul caractère visible (un emoji et ses jonctions comptent pour un), ni guillemet, ni barre oblique inverse, ni caractère de commande ou d'espacement. Le rond d'origine n'est pas un réglage.
  function normalized(raw) {
    const text = typeof raw === 'string' ? raw.trim() : '';
    if (!text || Array.from(text).length !== 1 || /[\s'"`\\<>&\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/.test(text)) return null;
    return text === DEFAULT_CHAR ? null : text;
  }
  // Le signe suivi de l'espace que la puce du navigateur met après lui (« ➢ »), pour qui écrit la puce à la main (les exports en texte).
  const markerOf = listEl => { const char = normalized(listEl && listEl.getAttribute ? listEl.getAttribute(ATTR) : null); return char ? char + ' ' : null; };
  // Les attributs d'une liste écrite à la main (l'import PowerPoint) : ` data-bullet-char="➢" style="--pp-bullet-char: '➢ '"`, vide quand il n'y a pas de signe.
  function markup(raw) {
    const char = normalized(raw);
    return char ? ' ' + ATTR + '="' + char + '" style="' + VAR + ": '" + char + " '\"" : '';
  }

  function createExtension(Extension) {
    return Extension.create({
      name: 'bulletFormat',
      addGlobalAttributes() {
        return [{
          types: ['bulletList'],
          attributes: {
            bulletChar: {
              default: null,
              parseHTML: node => normalized(node.getAttribute(ATTR)),
              renderHTML: attrs => (normalized(attrs.bulletChar) ? { [ATTR]: attrs.bulletChar, style: VAR + ": '" + attrs.bulletChar + " '" } : {}),
            },
          },
        }];
      },
    });
  }

  // La ligne du menu : grisée, avec sa raison, hors d'une liste à puces.
  const locked = editor => (editor && editor.isActive('bulletList') ? null : 'bulletFormat.notHere');
  function syncRow(row, editor) {
    if (!row || !editor) return;
    const reason = locked(editor);
    row.setAttribute('aria-disabled', reason ? 'true' : 'false');
    row.classList.toggle('v2-hover-row-disabled', !!reason);
    row.tabIndex = reason ? -1 : 0;
    if (reason) row.title = I18n.t(reason); else row.removeAttribute('title');
  }
  // Le signe de la liste du curseur : celui de la liste la plus proche, null pour le style de la liste.
  const currentChar = editor => normalized(editor.getAttributes('bulletList').bulletChar);
  // Pose le signe `raw` (null : retire le signe, la liste reprend son style) sur la liste du curseur, en un pas d'historique. Faux sans rien changer quand le curseur n'est pas dans une liste à puces.
  function apply(editor, raw) {
    if (!editor || !editor.isEditable || locked(editor)) return false;
    return editor.chain().focus().updateAttributes('bulletList', { bulletChar: normalized(raw) }).run();
  }

  // La fenêtre
  let win = null;
  let refs = null;
  let target = null;
  let initial = '';

  function ensure() {
    if (win) return;
    win = ModalBase.create({ id: 'pp-bulletfmt-modal', titleId: 'pp-bulletfmt-title', size: 'md', boxClass: 'pp-parafmt-box', actionsClass: 'var-modal-actions' });
    const grid = el('div', 'pp-parafmt-grid');
    const label = el('label', 'pp-parafmt-label');
    label.htmlFor = 'pp-bulletfmt-char';
    const input = el('input', 'pp-dialog-input pp-bulletfmt-input');
    input.id = 'pp-bulletfmt-char';
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-describedby', 'pp-bulletfmt-hint pp-bulletfmt-error');
    const cell = el('div', 'pp-parafmt-field');
    cell.append(input);
    const presetsLabel = el('span', 'pp-parafmt-label');
    const presets = el('div', 'pp-bulletfmt-presets');
    presets.setAttribute('role', 'group');
    const buttons = PRESETS.map((char) => {
      const button = el('button', 'pp-bulletfmt-preset', char);
      button.type = 'button';
      button.addEventListener('click', () => { input.value = char; render(); input.focus(); });
      presets.appendChild(button);
      return button;
    });
    grid.append(label, cell, presetsLabel, presets);
    const notes = el('div', 'pp-parafmt-notes');
    const hint = el('p', 'pp-parafmt-note'); hint.id = 'pp-bulletfmt-hint';
    const error = el('p', 'pp-parafmt-note pp-parafmt-error'); error.id = 'pp-bulletfmt-error';
    error.setAttribute('role', 'alert');
    error.hidden = true;
    notes.append(hint, error);
    grid.append(notes);
    win.body.appendChild(grid);
    const { first: reset, cancel, ok } = win.addButtons('pp-bulletfmt-reset');
    refs = { label, input, presetsLabel, buttons, hint, error, reset, cancel, ok };
    input.addEventListener('input', render);
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.isComposing) return;
      event.preventDefault();
      submit();
    });
    reset.addEventListener('click', () => { input.value = ''; render(); input.focus(); });
    cancel.addEventListener('click', () => win.hide());
    ok.addEventListener('click', submit);
  }

  // L'état du champ : { value } (le signe, ou null pour « le style de la liste »), { error } sinon.
  function readField() {
    const text = refs.input.value.trim();
    if (!text) return { value: null };
    const value = normalized(text);
    if (value === null && text === DEFAULT_CHAR) return { value: null };
    return value === null ? { error: true } : { value };
  }
  function render() {
    const state = readField();
    if (state.error) refs.input.setAttribute('aria-invalid', 'true'); else refs.input.removeAttribute('aria-invalid');
    refs.error.hidden = !state.error;
    refs.error.textContent = state.error ? I18n.t('bulletFormat.error') : '';
    refs.ok.disabled = !!state.error;
    refs.buttons.forEach((button) => { button.setAttribute('aria-pressed', button.textContent === refs.input.value.trim() ? 'true' : 'false'); });
  }

  function open(editor) {
    if (typeof ModalBase === 'undefined' || !editor || !editor.isEditable || locked(editor)) return false;
    ensure();
    target = editor;
    const { label, input, presetsLabel, buttons, hint, reset, cancel, ok } = refs;
    win.title.textContent = I18n.t('bulletFormat.title');
    label.textContent = I18n.t('bulletFormat.char.label');
    presetsLabel.textContent = I18n.t('bulletFormat.presets.label');
    input.setAttribute('aria-label', I18n.t('bulletFormat.char.aria'));
    buttons.forEach((button) => { button.setAttribute('aria-label', I18n.t('bulletFormat.preset.aria', { char: button.textContent })); });
    hint.textContent = I18n.t('bulletFormat.hint');
    reset.textContent = I18n.t('bulletFormat.reset');
    cancel.textContent = I18n.t('common.cancel');
    ok.textContent = I18n.t('common.confirm');
    initial = currentChar(editor) || '';
    input.value = initial;
    render();
    win.show(input);
    input.select();
    return true;
  }
  function submit() {
    const state = readField();
    if (state.error) { refs.input.focus(); return; }
    win.hide();
    if ((state.value || '') !== initial) apply(target, state.value);
  }

  return { createExtension, normalized, markerOf, markup, syncRow, currentChar, apply, open, PRESETS, DEFAULT_CHAR, ATTR, VAR };
})();
