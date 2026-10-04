// Fenêtre « Filigrane… » du menu Page (js/orientation-toggle.js) : le texte écrit en grand, en travers de chaque page du modèle (son texte, son sens
// en diagonale ou à l'horizontale, sa couleur et son opacité), avec une feuille d'aperçu. Elle ne fait que lire et poser PageLayout.setWatermark (qui
// borne le réglage et le garde dans la colonne Margins du modèle), puis prévenir l'enregistrement automatique (pp:marginsChanged, comme le sens et le
// format de la page). Le repeint de l'éditeur et de la Lecture vient de pp:watermarkChanged (js/main.js), le PDF et le Word relisent le réglage à
// PageLayout à l'export. La géométrie et le dessin sont à PageLayer, les mêmes pour les quatre rendus : la feuille d'aperçu les réutilise à
// l'échelle, donc ce qu'elle montre est ce que la page portera.
const WatermarkDialog = (function () {
  const el = Dom.el;

  // Six couleurs, le gris d'abord (PageLayout.WATERMARK_DEFAULT) : celles d'un filigrane qui ne gêne pas la lecture une fois éclaircies par
  // l'opacité. Un réglage enregistré avec une autre couleur (JSON écrit à la main, version plus récente) est gardé tel quel tant qu'on n'en choisit
  // pas une de la liste.
  const COLORS = { gray: '#808080', black: '#000000', red: '#c62828', blue: '#1565c0', green: '#2e7d32', orange: '#ef6c00' };
  const COLOR_ORDER = ['gray', 'black', 'red', 'blue', 'green', 'orange'];
  const OPACITY_MIN = 5;
  const OPACITY_MAX = 100;
  const OPACITY_STEP = 5;
  const PREVIEW_PX = 112; // côté du carré où la feuille d'aperçu tient, quel que soit son sens

  let win = null;
  let refs = null;
  let state = null; // { text, angle, color, opacity } - l'opacité en pour cent entier

  // Les groupes de choix de la fenêtre : Entrée la valide (Dom.radioGroup).
  const radioGroup = (labelId, options, onPick) => Dom.radioGroup({ className: 'pp-watermark-options', labelId, options, onPick, onEnter: apply });

  function ensure() {
    if (win) return;
    win = ModalBase.create({ id: 'pp-watermark-modal', titleId: 'pp-watermark-title', size: 'md', boxClass: 'pp-watermark-box', actionsClass: 'var-modal-actions' });
    const grid = el('div', 'pp-watermark-grid');

    const textLabel = el('label', 'pp-watermark-label pp-watermark-label-field'); textLabel.htmlFor = 'pp-watermark-text';
    const text = el('input', 'pp-dialog-input');
    text.id = 'pp-watermark-text';
    text.type = 'text';
    text.autocomplete = 'off';
    text.spellcheck = false;
    text.setAttribute('aria-describedby', 'pp-watermark-hint');
    // L'indication commence sous le champ, pas sous son libellé.
    const hint = el('p', 'pp-watermark-note'); hint.id = 'pp-watermark-hint';
    const textCell = el('div', 'pp-watermark-cell');
    textCell.append(text, hint);

    const angleLabel = el('span', 'pp-watermark-label'); angleLabel.id = 'pp-watermark-angle-label';
    const angles = radioGroup('pp-watermark-angle-label', ['diagonal', 'horizontal'].map(value => ({ value, className: 'pp-watermark-choice' })), value => pick({ angle: value }));

    const colorLabel = el('span', 'pp-watermark-label'); colorLabel.id = 'pp-watermark-color-label';
    const colors = radioGroup('pp-watermark-color-label', COLOR_ORDER.map(key => ({
      value: COLORS[key],
      className: 'pp-watermark-swatch',
      fill(button) { button.dataset.color = key; button.style.setProperty('--swatch', COLORS[key]); },
    })), value => pick({ color: value }));

    const opacityLabel = el('label', 'pp-watermark-label'); opacityLabel.htmlFor = 'pp-watermark-opacity';
    const range = el('input', 'pp-watermark-range');
    range.id = 'pp-watermark-opacity';
    range.type = 'range';
    range.min = String(OPACITY_MIN);
    range.max = String(OPACITY_MAX);
    range.step = String(OPACITY_STEP);
    const percent = el('output', 'pp-watermark-percent');
    percent.htmlFor = 'pp-watermark-opacity';
    const opacityCell = el('div', 'pp-watermark-opacity-cell');
    opacityCell.append(range, percent);

    // La feuille d'aperçu occupe la dernière colonne des trois lignes de réglage. Le papier est blanc dans les deux thèmes, comme celui du document.
    const preview = el('div', 'pp-watermark-preview');
    preview.setAttribute('aria-hidden', 'true');
    const sheet = el('div', 'pp-watermark-sheet');
    const page = el('div', 'pp-watermark-page');
    sheet.appendChild(page);
    preview.appendChild(sheet);

    grid.append(textLabel, textCell, angleLabel, angles.group, colorLabel, colors.group, opacityLabel, opacityCell, preview);
    win.body.appendChild(grid);

    const { first: remove, cancel, ok } = win.addButtons('var-modal-danger');
    refs = { textLabel, text, hint, angleLabel, angles, colorLabel, colors, opacityLabel, range, percent, sheet, page, remove, cancel, ok };

    text.addEventListener('input', () => pick({ text: text.value }));
    // Entrée valide, sauf pendant une composition (accent mort, saisie asiatique) : elle ne fait alors que choisir le caractère.
    const submitOnEnter = event => {
      if (event.key !== 'Enter' || event.isComposing) return;
      event.preventDefault();
      apply();
    };
    text.addEventListener('keydown', submitOnEnter);
    range.addEventListener('keydown', submitOnEnter);
    range.addEventListener('input', () => pick({ opacity: Number(range.value) }));
    cancel.addEventListener('click', () => win.hide());
    ok.addEventListener('click', apply);
    remove.addEventListener('click', removeWatermark);
  }

  function pick(change) {
    Object.assign(state, change);
    render();
  }

  // Le réglage que la fenêtre décrit en ce moment, borné par PageLayout (null sans texte).
  function described() {
    return PageLayout.normalizeWatermark({ text: state.text, angle: state.angle, color: state.color, opacity: state.opacity / 100 });
  }

  // La feuille d'aperçu : la page du modèle (son sens, son format) à l'échelle du carré de PREVIEW_PX, le filigrane dessiné par PageLayer comme sur
  // une vraie page.
  function renderPreview() {
    const { sheet, page } = refs;
    page.textContent = '';
    const size = PageLayout.getPageSizePt();
    const widthPx = size.width * PageLayer.PT_TO_PX;
    const heightPx = size.height * PageLayer.PT_TO_PX;
    const scale = Math.min(PREVIEW_PX / widthPx, PREVIEW_PX / heightPx);
    sheet.style.width = Math.round(widthPx * scale) + 'px';
    sheet.style.height = Math.round(heightPx * scale) + 'px';
    page.style.width = widthPx + 'px';
    page.style.height = heightPx + 'px';
    page.style.transform = 'scale(' + scale + ')';
    const layout = PageLayer.watermarkLayout(described(), size.width, size.height);
    if (layout) page.appendChild(PageLayer.watermarkElement(layout));
  }

  function render() {
    const { angles, colors, range, percent } = refs;
    angles.check(state.angle);
    colors.check(state.color);
    // L'opacité de l'état n'est pas relue du curseur : un réglage à 23 % (JSON écrit à la main) que le curseur arrondirait à 25 % reste à 23 % tant
    // qu'on n'y touche pas.
    range.value = String(state.opacity);
    range.setAttribute('aria-valuetext', I18n.t('watermark.opacity.value', { n: state.opacity }));
    percent.textContent = I18n.t('watermark.opacity.value', { n: state.opacity });
    renderPreview();
  }

  // Ouvre la fenêtre sur le filigrane du modèle (ou sur les réglages par défaut s'il n'en a pas). Faux si la fenêtre ne peut pas s'ouvrir.
  function open() {
    if (typeof PageLayout === 'undefined' || typeof ModalBase === 'undefined') return false;
    ensure();
    const set = PageLayout.getWatermark();
    const base = PageLayout.WATERMARK_DEFAULT;
    state = set ? { text: set.text, angle: set.angle, color: set.color, opacity: Math.round(set.opacity * 100), had: true }
      : { text: '', angle: base.angle, color: base.color, opacity: Math.round(base.opacity * 100), had: false };
    const { textLabel, text, hint, angleLabel, angles, colorLabel, colors, opacityLabel, remove, cancel, ok } = refs;
    win.title.textContent = I18n.t('watermark.title');
    textLabel.textContent = I18n.t('watermark.text.label');
    text.placeholder = I18n.t('watermark.text.placeholder');
    text.maxLength = PageLayout.WATERMARK_MAX_CHARS;
    text.value = state.text;
    hint.textContent = I18n.t('watermark.text.hint', { format: PageLayout.getFormatLabel() });
    angleLabel.textContent = I18n.t('watermark.direction.label');
    angles.buttons.forEach(b => { b.textContent = I18n.t('watermark.direction.' + b.dataset.value); });
    colorLabel.textContent = I18n.t('watermark.color.label');
    colors.buttons.forEach(b => { const name = I18n.t('watermark.color.' + b.dataset.color); b.setAttribute('aria-label', name); b.title = name; });
    opacityLabel.textContent = I18n.t('watermark.opacity.label');
    remove.textContent = I18n.t('watermark.remove');
    remove.hidden = !state.had;
    cancel.textContent = I18n.t('common.cancel');
    ok.textContent = I18n.t('common.confirm');
    render();
    win.show(text);
    text.select();
    return true;
  }

  // Une fenêtre validée sans texte retire le filigrane (le seul résultat qui ait un sens) ; sans changement, rien n'est annoncé ni enregistré.
  function commit(next) {
    const changed = PageLayout.setWatermark(next);
    win.hide();
    if (changed) document.dispatchEvent(new CustomEvent('pp:marginsChanged'));
  }
  function apply() { commit(described()); }
  function removeWatermark() { commit(null); }

  return { open };
})();
