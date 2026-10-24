// « Puce… » (menu Liste) : le signe de la puce d'une liste à puces, comme dans PowerPoint et dans Word. Demande du 24/10 (import PowerPoint sans perte, chantier 9 « caractères et puces », lot 9d) :
// un fichier PowerPoint met presque toujours une puce de son choix (un tiret, une flèche, une coche, un losange), et l'éditeur n'en connaissait que trois (le rond, le rond creux, le carré).
//
// Le signe est un attribut de la liste, `bulletChar`, comme son style (`bulletStyle`, js/editor-nodes.js:createBulletStyleExtension) : écrit `data-bullet-char="➢"` et, pour que la Lecture, l'impression
// et tout lecteur du HTML le dessinent sans connaître l'extension, en variable CSS sur la liste (`--pp-bullet-char: '➢ '`, que `li::marker` lit : css/editor-v2.css). Un seul caractère visible, ni
// guillemet, ni barre oblique inverse, ni espace, ni caractère de commande : le HTML d'une autre personne passe dans une variable CSS et dans un attribut. Le rond d'origine (« • ») n'est pas un
// réglage. Un des trois boutons de style de la liste (disque, cercle, carré) retire le signe choisi : un seul des deux dit la puce.
//
// La fenêtre : un champ « Signe » (un seul caractère, tapé ou collé), une rangée de signes courants à un clic, « Par défaut » (le style de la liste), « Valider » (un pas d'historique). La ligne
// du menu est grisée, avec sa raison, hors d'une liste à puces.
//
// Lot 9e (demande du 24/10, « Import PowerPoint sans perte ») : deux champs de plus, « Couleur » (un code #rrggbb et une rangée de teintes à un clic, pas de sélecteur natif caché) et « Taille » (en points),
// qui se posent sur les points choisis (les points de la sélection, ou celui du curseur) et non sur toute la liste : chaque point a sa couleur et sa taille de puce (`bulletColor`, `bulletSize`, js/list-markers.js).
// Vides, la puce suit son texte. « Par défaut » les vide aussi. Le PDF (js/pdf-export.js), le Word (js/docx-export.js), le PowerPoint (js/pptx-export.js), le texte des courriels (js/mailto-export.js)
// et le HTML exporté (js/html-export.js) le lisent par `markerOf` ; l'import PowerPoint (js/pptx-import.js) l'écrit par `markup`.
const BulletFormat = (function () {
  const el = Dom.el;
  const ATTR = 'data-bullet-char';
  const VAR = '--pp-bullet-char';
  const DEFAULT_CHAR = '•';
  // Les signes courants de la fenêtre : un tiret, des flèches, des coches, des formes, une étoile.
  const PRESETS = ['–', '—', '➢', '➔', '►', '✓', '✔', '■', '◆', '★', '✦', '❖'];
  // Les teintes proposées pour la couleur : le noir, puis les dix teintes foncées de la palette de l'éditeur (js/color-palette.js, lisibles sur la page blanche).
  const SWATCHES = () => [ColorPalette.ROWS[0][0]].concat(ColorPalette.ROWS[1]);
  const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
  // Une couleur permise : « #rgb » ou « #rrggbb » (le dièse peut manquer), rendue en « #rrggbb » minuscule ; null sinon.
  function colorNormalized(raw) {
    const match = HEX.exec(typeof raw === 'string' ? raw.trim() : '');
    if (!match) return null;
    const digits = match[1].length === 3 ? match[1].replace(/./g, '$&$&') : match[1];
    return '#' + digits.toLowerCase();
  }
  // Une taille permise, en points : un nombre de 4 à 400 (jusqu'à deux décimales), rendue en « 12pt » ; null sinon.
  function sizeNormalized(raw) {
    const text = typeof raw === 'string' ? raw.trim().replace(',', '.') : '';
    if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(text)) return null;
    const value = parseFloat(text);
    return value >= 4 && value <= 400 ? String(value) + 'pt' : null;
  }

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

  // Les points d'une liste à puces que la sélection touche (celui du curseur quand elle est vide) : { node, pos }.
  function itemsOf(editor) {
    const { doc, selection } = editor.state;
    const found = [];
    if (selection.empty) {
      const $from = selection.$from;
      for (let depth = $from.depth; depth > 0; depth -= 1) {
        const node = $from.node(depth);
        if (node.type.name === 'listItem' && $from.node(depth - 1).type.name === 'bulletList') { found.push({ node, pos: $from.before(depth) }); break; }
      }
      return found;
    }
    doc.nodesBetween(selection.from, selection.to, (node, pos, parent) => {
      if (node.type.name === 'listItem' && parent && parent.type.name === 'bulletList') found.push({ node, pos });
      return true;
    });
    return found;
  }
  // La couleur et la taille de puce propres du premier point choisi : { color, size } (chacun null quand la puce suit son texte).
  function currentLook(editor) {
    const first = itemsOf(editor)[0];
    return { color: first ? ListMarkers.colorOf(first.node.attrs.bulletColor) : null, size: first ? ListMarkers.sizeOf(first.node.attrs.bulletSize) : null };
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
  // Pose le signe `raw` (null : retire le signe, la liste reprend son style) sur la liste du curseur, en un pas d'historique. `look` : { color, size } à poser sur les points choisis (une couleur « #rrggbb » et une
  // taille « 12pt », null pour que la puce suive son texte, absent pour ne pas y toucher) dans le même pas. Faux sans rien changer quand le curseur n'est pas dans une liste à puces.
  function apply(editor, raw, look) {
    if (!editor || !editor.isEditable || locked(editor)) return false;
    const chain = editor.chain().focus().updateAttributes('bulletList', { bulletChar: normalized(raw) });
    if (look) {
      const targets = itemsOf(editor);
      chain.command(({ tr }) => {
        targets.forEach(({ node, pos }) => {
          const attrs = Object.assign({}, node.attrs);
          if ('color' in look) attrs.bulletColor = ListMarkers.colorOf(look.color);
          if ('size' in look) attrs.bulletSize = ListMarkers.sizeOf(look.size);
          tr.setNodeMarkup(pos, undefined, attrs);
        });
        return true;
      });
    }
    return chain.run();
  }

  // La fenêtre
  let win = null;
  let refs = null;
  let target = null;
  let initial = '';
  let initialLook = { color: null, size: null };

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
    // Lot 9e : la couleur (un code et ses teintes) et la taille de la puce des points choisis.
    const colorLabel = el('label', 'pp-parafmt-label');
    colorLabel.htmlFor = 'pp-bulletfmt-color';
    const colorInput = el('input', 'pp-dialog-input pp-bulletfmt-color');
    colorInput.id = 'pp-bulletfmt-color';
    colorInput.type = 'text';
    colorInput.autocomplete = 'off';
    colorInput.spellcheck = false;
    colorInput.setAttribute('aria-describedby', 'pp-bulletfmt-hint pp-bulletfmt-error');
    const swatches = el('div', 'pp-bulletfmt-presets pp-bulletfmt-swatches');
    swatches.setAttribute('role', 'group');
    const swatchButtons = SWATCHES().map((color) => {
      const button = el('button', 'pp-bulletfmt-swatch');
      button.type = 'button';
      button.style.backgroundColor = color;
      button.dataset.color = color;
      button.addEventListener('click', () => { colorInput.value = color; render(); colorInput.focus(); });
      swatches.appendChild(button);
      return button;
    });
    const colorCell = el('div', 'pp-parafmt-field');
    colorCell.append(colorInput, swatches);
    const sizeLabel = el('label', 'pp-parafmt-label');
    sizeLabel.htmlFor = 'pp-bulletfmt-size';
    const sizeInput = el('input', 'pp-dialog-input pp-bulletfmt-size');
    sizeInput.id = 'pp-bulletfmt-size';
    sizeInput.type = 'text';
    sizeInput.inputMode = 'decimal';
    sizeInput.autocomplete = 'off';
    sizeInput.setAttribute('aria-describedby', 'pp-bulletfmt-hint pp-bulletfmt-error');
    const sizeCell = el('div', 'pp-parafmt-field');
    sizeCell.append(sizeInput);
    grid.append(colorLabel, colorCell, sizeLabel, sizeCell);
    const notes = el('div', 'pp-parafmt-notes');
    const hint = el('p', 'pp-parafmt-note'); hint.id = 'pp-bulletfmt-hint';
    const error = el('p', 'pp-parafmt-note pp-parafmt-error'); error.id = 'pp-bulletfmt-error';
    error.setAttribute('role', 'alert');
    error.hidden = true;
    notes.append(hint, error);
    grid.append(notes);
    win.body.appendChild(grid);
    const { first: reset, cancel, ok } = win.addButtons('pp-bulletfmt-reset');
    refs = { label, input, presetsLabel, buttons, colorLabel, colorInput, swatchButtons, sizeLabel, sizeInput, hint, error, reset, cancel, ok };
    [input, colorInput, sizeInput].forEach((field) => {
      field.addEventListener('input', render);
      field.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' || event.isComposing) return;
        event.preventDefault();
        submit();
      });
    });
    reset.addEventListener('click', () => { input.value = ''; colorInput.value = ''; sizeInput.value = ''; render(); input.focus(); });
    cancel.addEventListener('click', () => win.hide());
    ok.addEventListener('click', submit);
  }

  // L'état des champs : { value, color, size } (le signe, la couleur et la taille, chacun null pour « comme le style de la liste » ou « comme le texte »), { error: 'char' | 'color' | 'size' } sinon.
  function readField() {
    const text = refs.input.value.trim();
    const value = normalized(text);
    if (text && value === null && text !== DEFAULT_CHAR) return { error: 'char' };
    const colorText = refs.colorInput.value.trim();
    const color = colorNormalized(colorText);
    if (colorText && color === null) return { error: 'color' };
    const sizeText = refs.sizeInput.value.trim();
    const size = sizeNormalized(sizeText);
    if (sizeText && size === null) return { error: 'size' };
    return { value, color, size };
  }
  function render() {
    const state = readField();
    const bad = { char: refs.input, color: refs.colorInput, size: refs.sizeInput };
    Object.keys(bad).forEach((key) => { if (state.error === key) bad[key].setAttribute('aria-invalid', 'true'); else bad[key].removeAttribute('aria-invalid'); });
    refs.error.hidden = !state.error;
    refs.error.textContent = state.error ? I18n.t('bulletFormat.error.' + state.error) : '';
    refs.ok.disabled = !!state.error;
    refs.buttons.forEach((button) => { button.setAttribute('aria-pressed', button.textContent === refs.input.value.trim() ? 'true' : 'false'); });
    const color = colorNormalized(refs.colorInput.value);
    refs.swatchButtons.forEach((button) => { button.setAttribute('aria-pressed', button.dataset.color === color ? 'true' : 'false'); });
  }

  function open(editor) {
    if (typeof ModalBase === 'undefined' || !editor || !editor.isEditable || locked(editor)) return false;
    ensure();
    target = editor;
    const { label, input, presetsLabel, buttons, colorLabel, colorInput, swatchButtons, sizeLabel, sizeInput, hint, reset, cancel, ok } = refs;
    win.title.textContent = I18n.t('bulletFormat.title');
    label.textContent = I18n.t('bulletFormat.char.label');
    presetsLabel.textContent = I18n.t('bulletFormat.presets.label');
    input.setAttribute('aria-label', I18n.t('bulletFormat.char.aria'));
    buttons.forEach((button) => { button.setAttribute('aria-label', I18n.t('bulletFormat.preset.aria', { char: button.textContent })); });
    colorLabel.textContent = I18n.t('bulletFormat.color.label');
    colorInput.setAttribute('aria-label', I18n.t('bulletFormat.color.aria'));
    colorInput.placeholder = I18n.t('bulletFormat.same');
    swatchButtons.forEach((button) => { button.setAttribute('aria-label', I18n.t('bulletFormat.swatch.aria', { color: button.dataset.color })); button.title = button.dataset.color; });
    sizeLabel.textContent = I18n.t('bulletFormat.size.label');
    sizeInput.setAttribute('aria-label', I18n.t('bulletFormat.size.aria'));
    sizeInput.placeholder = I18n.t('bulletFormat.same');
    hint.textContent = I18n.t('bulletFormat.hint');
    reset.textContent = I18n.t('bulletFormat.reset');
    cancel.textContent = I18n.t('common.cancel');
    ok.textContent = I18n.t('common.confirm');
    initial = currentChar(editor) || '';
    input.value = initial;
    initialLook = currentLook(editor);
    colorInput.value = initialLook.color || '';
    sizeInput.value = initialLook.size ? initialLook.size.replace(/pt$/, '') : '';
    render();
    win.show(input);
    input.select();
    return true;
  }
  function submit() {
    const state = readField();
    if (state.error) { refs.input.focus(); return; }
    win.hide();
    const look = {};
    if (state.color !== initialLook.color) look.color = state.color;
    if (state.size !== initialLook.size) look.size = state.size;
    const changed = (state.value || '') !== initial;
    if (changed || Object.keys(look).length) apply(target, changed ? state.value : currentChar(target), Object.keys(look).length ? look : undefined);
  }

  return { createExtension, normalized, colorNormalized, sizeNormalized, markerOf, markup, syncRow, currentChar, currentLook, apply, open, PRESETS, DEFAULT_CHAR, ATTR, VAR };
})();
