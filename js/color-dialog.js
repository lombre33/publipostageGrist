// Fenêtre « Couleur personnalisée » du menu de couleur (js/color-palette.js) : un carré saturation-luminosité et un curseur de teinte pour choisir
// à la souris, un code hexadécimal et trois champs rouge-vert-bleu pour taper la couleur qu'on a déjà, un aperçu face à la couleur de départ, et les
// cases « garder » qui rangent la couleur dans les rangées de js/color-store.js. Elle ne pose rien dans le document : « Appliquer » rend la couleur
// et les rangées cochées à celui qui l'a ouverte (`onApply`), qui la pose comme un clic sur une pastille. Le calcul des couleurs est à ColorMath.
const ColorDialog = (function () {
  const el = Dom.el;
  const clamp = (n, low, high) => Math.min(high, Math.max(low, n));

  // La couleur de départ quand le menu n'en a aucune à proposer (aucune couleur posée sur la sélection) : le bleu d'accent de l'interface.
  const START_COLOR = '#2f6fed';
  const CHANNELS = [['r', 'red'], ['g', 'green'], ['b', 'blue']];

  let win = null;
  let refs = null;
  // La couleur en cours de composition : teinte (degrés), saturation et valeur (0 à 1) pour le carré et le curseur, et `hex` pour la couleur exacte.
  // La teinte est gardée tant que la couleur est un gris ou un noir (sans teinte propre), sinon le curseur sauterait au rouge à chaque saisie.
  let state = null;
  let session = null;       // { initial, onApply, onClose } de l'ouverture en cours
  // Les rangées cochées à la dernière ouverture, reprises à la suivante : qui compose plusieurs couleurs de suite ne recoche pas à chaque fois. Le
  // modèle est coché d'office, la première fois.
  const kept = { model: true };

  function ensure() {
    if (win) return;
    win = ModalBase.create({ id: 'pp-color-modal', titleId: 'pp-color-title', size: 'md', boxClass: 'pp-color-box', actionsClass: 'var-modal-actions', onEscape: () => finish(false) });
    const picker = el('div', 'pp-color-picker');

    // À gauche, le carré (saturation de gauche à droite, luminosité de bas en haut) et le curseur de teinte.
    const left = el('div', 'pp-color-left');
    const area = el('div', 'pp-color-area');
    area.tabIndex = 0;
    area.setAttribute('role', 'slider');
    area.setAttribute('aria-valuemin', '0');
    area.setAttribute('aria-valuemax', '100');
    const thumb = el('div', 'pp-color-thumb');
    area.appendChild(thumb);
    const hue = el('input', 'pp-color-hue');
    hue.type = 'range';
    hue.min = '0';
    hue.max = '360';
    hue.step = '1';
    left.append(area, hue);

    // À droite, l'aperçu face à la couleur de départ, le code hexadécimal et les trois champs.
    const right = el('div', 'pp-color-right');
    const compare = el('div', 'pp-color-compare');
    const cell = (chipClass) => {
      const wrap = el('div', 'pp-color-compare-cell');
      const chip = el('div', 'pp-color-chip ' + chipClass);
      const caption = el('span', 'pp-color-caption');
      wrap.append(chip, caption);
      compare.appendChild(wrap);
      return { wrap, chip, caption };
    };
    const before = cell('pp-color-chip-before');
    const after = cell('pp-color-chip-after');

    const hexLabel = el('label', 'pp-color-label');
    hexLabel.htmlFor = 'pp-color-hex';
    const hex = el('input', 'pp-dialog-input pp-color-hex');
    hex.id = 'pp-color-hex';
    hex.type = 'text';
    hex.autocomplete = 'off';
    hex.spellcheck = false;
    hex.maxLength = 12;
    hex.setAttribute('aria-describedby', 'pp-color-hint');
    const hint = el('p', 'pp-color-hint');
    hint.id = 'pp-color-hint';
    hint.setAttribute('aria-live', 'polite');

    const channels = el('div', 'pp-color-channels');
    const channelFields = CHANNELS.map(([key, name]) => {
      const wrap = el('label', 'pp-color-channel');
      const short = el('span', 'pp-color-channel-name');
      const input = el('input', 'pp-dialog-input pp-color-number');
      input.type = 'number';
      input.min = '0';
      input.max = '255';
      input.step = '1';
      input.inputMode = 'numeric';
      wrap.append(short, input);
      channels.appendChild(wrap);
      return { key, name, short, input };
    });
    right.append(compare, hexLabel, hex, hint, channels);
    picker.append(left, right);

    // Sous le tout, les rangées où garder la couleur : posées à l'ouverture (leurs noms suivent la langue et les rangées existantes).
    const keep = el('fieldset', 'pp-color-keep');
    const keepLegend = el('legend', 'pp-color-keep-legend');
    keep.appendChild(keepLegend);
    win.body.append(picker, keep);

    const { cancel, ok } = win.addButtons();
    refs = { area, thumb, hue, before, after, hexLabel, hex, hint, channelFields, keep, keepLegend, cancel, ok };

    // Le carré : un appui, un glissement, ou les flèches (1 %, 10 % avec Maj).
    area.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      area.focus();
      area.setPointerCapture(event.pointerId);
      moveTo(event);
    });
    area.addEventListener('pointermove', (event) => { if (area.hasPointerCapture(event.pointerId)) moveTo(event); });
    area.addEventListener('keydown', (event) => {
      const step = event.shiftKey ? 0.1 : 0.01;
      const move = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[event.key];
      if (event.key === 'Enter') { event.preventDefault(); apply(); return; }
      if (!move) return;
      event.preventDefault();
      setHsv({ s: clamp(state.s + move[0], 0, 1), v: clamp(state.v + move[1], 0, 1) });
    });
    hue.addEventListener('input', () => setHsv({ h: Number(hue.value) }));
    hue.addEventListener('keydown', submitOnEnter);

    // Le code et les trois champs : une valeur lisible change la couleur sans réécrire le champ en cours de frappe (« #1e8 » reste ce qu'on tape) ;
    // une valeur illisible le marque et grise « Appliquer », l'aperçu garde la couleur d'avant. À la sortie d'un champ lisible, tout reprend la forme
    // de la couleur ; un champ illisible reste marqué (un clic sur « Appliquer » grisé ne pose donc pas en silence la couleur d'avant).
    hex.addEventListener('input', () => {
      const color = ColorMath.parseHex(hex.value);
      if (color) setColor(color, 'hex');
      else invalidate(hex, true);
    });
    hex.addEventListener('change', () => { if (!hex.hasAttribute('aria-invalid')) render(); });
    hex.addEventListener('keydown', submitOnEnter);
    channelFields.forEach(({ key, input }) => {
      input.addEventListener('input', () => {
        const value = Number(input.value);
        if (input.value.trim() === '' || !Number.isInteger(value) || value < 0 || value > 255) { invalidate(input, false); return; }
        const rgb = ColorMath.toRgb(state.hex);
        rgb[key] = value;
        setColor(ColorMath.toHex(rgb), 'channel');
      });
      input.addEventListener('change', () => { if (!input.hasAttribute('aria-invalid')) render(); });
      input.addEventListener('keydown', submitOnEnter);
    });
    cancel.addEventListener('click', () => finish(false));
    ok.addEventListener('click', apply);
  }

  // Entrée valide la fenêtre, sauf pendant une composition (accent mort) ou quand un champ est marqué illisible.
  function submitOnEnter(event) {
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    apply();
  }

  function moveTo(event) {
    const box = refs.area.getBoundingClientRect();
    setHsv({ s: clamp((event.clientX - box.left) / box.width, 0, 1), v: 1 - clamp((event.clientY - box.top) / box.height, 0, 1) });
  }

  function setHsv(change) {
    state = Object.assign({}, state, change);
    state.hex = ColorMath.toHex(ColorMath.hsvToRgb(state));
    render();
  }
  // Une couleur exacte (code, champ ou couleur de départ) ; `source` est le champ à ne pas réécrire pendant qu'on le tape.
  function setColor(color, source) {
    const hsv = ColorMath.rgbToHsv(ColorMath.toRgb(color));
    const grey = hsv.s === 0 || hsv.v === 0;
    state = { h: grey && state ? state.h : hsv.h, s: hsv.s, v: hsv.v, hex: color };
    render(source);
  }

  // Marque un champ illisible : « Appliquer » attend qu'il le redevienne (ou qu'on en change la couleur au carré, à la teinte ou dans un autre champ).
  function invalidate(field, withHint) {
    field.setAttribute('aria-invalid', 'true');
    if (withHint) refs.hint.textContent = I18n.t('color.dialog.hexHint');
    refs.ok.disabled = true;
  }

  // Tout redessiner d'après `state`, sauf le champ `source` que la personne est en train de taper.
  function render(source) {
    const { area, thumb, hue, after, hex, hint, channelFields, ok } = refs;
    const percent = n => Math.round(n * 100);
    area.style.setProperty('--hue', 'hsl(' + state.h + ', 100%, 50%)');
    thumb.style.left = (state.s * 100) + '%';
    thumb.style.top = ((1 - state.v) * 100) + '%';
    area.setAttribute('aria-valuenow', String(percent(state.s)));
    area.setAttribute('aria-valuetext', I18n.t('color.dialog.areaValue', { s: percent(state.s), v: percent(state.v) }));
    hue.value = String(Math.round(state.h));
    hue.setAttribute('aria-valuetext', Math.round(state.h) + '°');
    after.chip.style.background = state.hex;
    const rgb = ColorMath.toRgb(state.hex);
    if (source !== 'hex') hex.value = state.hex.toUpperCase();
    channelFields.forEach(({ key, input }) => { if (source !== 'channel') input.value = String(rgb[key]); });
    [hex].concat(channelFields.map(field => field.input)).forEach(field => field.removeAttribute('aria-invalid'));
    hint.textContent = '';
    ok.disabled = false;
  }

  // Les cases « garder » : une par rangée de couleurs, cochées comme à la dernière ouverture.
  function renderKeep() {
    const { keep, keepLegend } = refs;
    keepLegend.textContent = I18n.t('color.dialog.keep');
    keep.querySelectorAll('label').forEach(label => label.remove());
    ColorStore.scopes().forEach(scope => {
      const label = el('label', 'pp-color-keep-row');
      label.title = scope.hint;
      const box = el('input');
      box.type = 'checkbox';
      box.value = scope.id;
      box.checked = !!kept[scope.id];
      box.addEventListener('change', () => { kept[scope.id] = box.checked; });
      label.append(box, el('span', null, scope.label));
      keep.appendChild(label);
    });
  }

  function checkedScopes() {
    return Array.from(refs.keep.querySelectorAll('input:checked')).map(box => box.value);
  }

  // Ouvre la fenêtre. `initial` : la couleur de départ (#rrggbb), montrée face à la nouvelle ; sans elle, le bleu d'accent et pas de « Actuelle ».
  // `onApply({ color, scopes })` : « Appliquer » (`color` en #rrggbb, `scopes` les rangées cochées). `onClose()` : la fenêtre s'est fermée, quelle que
  // soit la sortie, après `onApply`. Faux si la fenêtre ne peut pas s'ouvrir.
  function open(options) {
    if (typeof ModalBase === 'undefined') return false;
    ensure();
    session = options;
    const { before, after, hexLabel, hex, channelFields, area, hue, cancel, ok } = refs;
    win.title.textContent = I18n.t('colorDropdown.custom');
    area.setAttribute('aria-label', I18n.t('color.dialog.area'));
    hue.setAttribute('aria-label', I18n.t('color.dialog.hue'));
    hexLabel.textContent = I18n.t('color.dialog.hex');
    channelFields.forEach(({ key, name, short, input }) => {
      short.textContent = I18n.t('color.dialog.' + key);
      input.setAttribute('aria-label', I18n.t('color.dialog.' + name));
    });
    before.caption.textContent = I18n.t('color.dialog.current');
    after.caption.textContent = I18n.t('color.dialog.new');
    cancel.textContent = I18n.t('common.cancel');
    ok.textContent = I18n.t('color.dialog.apply');
    before.wrap.hidden = !options.initial;
    if (options.initial) before.chip.style.background = options.initial;
    state = null;
    setColor(options.initial || START_COLOR);
    renderKeep();
    win.show(hex);
    hex.select();
    return true;
  }

  function apply() {
    if (refs.ok.disabled) return;
    finish(true);
  }

  function finish(applied) {
    if (!session) return;
    const done = session;
    session = null;
    const result = { color: state.hex, scopes: checkedScopes() };
    win.hide();
    if (applied && done.onApply) done.onApply(result);
    if (done.onClose) done.onClose();
  }

  return { open };
})();
