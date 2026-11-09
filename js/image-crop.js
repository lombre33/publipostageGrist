// La fenêtre « Rogner l'image » (le bouton « Rogner… » de la barre de l'image, js/floating-toolbars.js) : l'image sélectionnée s'y montre en entier, avec un cadre que la personne tire à la souris par
// ses huit poignées (ou déplace d'un bloc) pour choisir la partie à garder ; « Rogner » redessine l'image sur cette partie (ImageReshape.run, js/image-reshape.js : un canvas, UN pas d'historique,
// Annuler rend l'image d'avant ; l'image rognée garde l'échelle de la partie gardée et tous les exports la reprennent comme une image ordinaire). Une fenêtre plutôt qu'un cadre posé sur la page :
// l'image y est montrée plus grande que dans un panneau de 700 px, rien ne suit le défilement ni le zoom de la feuille, et la fenêtre a déjà son clavier (js/modal-base.js).
// Le cadre se règle aussi au clavier : Tab atteint les quatre poignées de bord (bord du haut, de droite, du bas, de gauche), les flèches déplacent le bord d'un centième de l'image (Maj : cinq),
// Entrée rogne, Échap annule. Le cadre est gardé en PARTS de l'image (de 0 à 1, ôtées de chaque bord) : il ne dépend ni de la taille de l'aperçu ni du zoom.
//   ImageCrop.open() -> vrai quand la fenêtre s'est ouverte ; faux sans image sélectionnée, hors modification (Lecture), ou pour une image qui ne se rogne pas (ImageReshape.unavailableKey)
//   ImageCrop.current() -> { l, t, r, b } le cadre de la fenêtre ouverte (une copie), ou null
const ImageCrop = (function () {
  const MIN_SHARE = 0.05;   // ce qui reste du cadre, dans chaque sens, n'est jamais sous un vingtième de l'image...
  const MIN_PX = 16;        // ...ni sous 16 pixels d'aperçu (une petite image garde donc un cadre qu'on peut tenir à la souris)
  const STEP = 0.01;        // un appui de flèche : un centième de l'image
  const STEP_BIG = 0.05;    // avec Maj : cinq centièmes
  // Les poignées : quatre bords, puis quatre coins (après, donc au-dessus quand un petit cadre les rapproche). Seuls les bords se prennent au clavier (Tab).
  const EDGES = ['n', 'e', 's', 'w'];
  const CORNERS = ['nw', 'ne', 'se', 'sw'];
  // Les clés s'écrivent en toutes lettres, pour que la recherche des clés sans usage (dev-tests/verify-code-hygiene.mjs) les voie.
  const HANDLE_TEXT = {
    n: 'crop.handle.n', e: 'crop.handle.e', s: 'crop.handle.s', w: 'crop.handle.w',
    nw: 'crop.handle.nw', ne: 'crop.handle.ne', se: 'crop.handle.se', sw: 'crop.handle.sw',
  };
  const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

  let win = null;
  let refs = null;
  let state = null;   // { pos, src, crop: { l, t, r, b } }

  const clamp = (value, low, high) => Math.min(Math.max(value, low), Math.max(low, high));
  const minShare = size => Math.min(0.5, Math.max(MIN_SHARE, MIN_PX / Math.max(1, size)));
  const whole = crop => crop.l + crop.t + crop.r + crop.b < 0.0005;

  // Le cadre après un déplacement de `dx`, `dy` (en parts de l'image, vers la droite et vers le bas) de la poignée `handle` à partir du cadre `base` ; `move` : le cadre entier.
  // Un bord ne passe pas le bord d'en face (il reste `minW` ou `minH` entre eux) ni le bord de l'image.
  function dragged(base, handle, dx, dy, minW, minH) {
    const crop = Object.assign({}, base);
    if (handle === 'move') {
      const shiftX = clamp(dx, -base.l, base.r);
      const shiftY = clamp(dy, -base.t, base.b);
      crop.l = base.l + shiftX; crop.r = base.r - shiftX;
      crop.t = base.t + shiftY; crop.b = base.b - shiftY;
      return crop;
    }
    if (handle.indexOf('w') !== -1) crop.l = clamp(base.l + dx, 0, 1 - base.r - minW);
    if (handle.indexOf('e') !== -1) crop.r = clamp(base.r - dx, 0, 1 - base.l - minW);
    if (handle.indexOf('n') !== -1) crop.t = clamp(base.t + dy, 0, 1 - base.b - minH);
    if (handle.indexOf('s') !== -1) crop.b = clamp(base.b - dy, 0, 1 - base.t - minH);
    return crop;
  }
  function limits() {
    const box = refs.stage.getBoundingClientRect();
    return { box, minW: minShare(box.width), minH: minShare(box.height) };
  }

  function render() {
    if (!win || !state) return;
    const crop = state.crop;
    const share = value => (Math.round(value * 10000) / 100) + '%';
    [refs.frame, refs.hole].forEach((el) => {
      el.style.left = share(crop.l);
      el.style.top = share(crop.t);
      el.style.width = share(1 - crop.l - crop.r);
      el.style.height = share(1 - crop.t - crop.b);
    });
    const naturalW = refs.preview.naturalWidth || 0;
    const naturalH = refs.preview.naturalHeight || 0;
    const empty = whole(crop);
    refs.ok.disabled = empty;
    if (empty) refs.size.textContent = I18n.t('crop.nothing');
    else {
      const w = Math.max(1, Math.round(naturalW * (1 - crop.l - crop.r)));
      const h = Math.max(1, Math.round(naturalH * (1 - crop.t - crop.b)));
      const pct = Math.round((1 - crop.l - crop.r) * (1 - crop.t - crop.b) * 100);
      refs.size.textContent = I18n.t('crop.size', { w, h, pct });
    }
  }

  // Un glissé à la souris : la poignée (ou le cadre, `move`) suit le pointeur tant que le bouton est enfoncé. Les écouteurs sont sur le document, pas sur la poignée : le pointeur qui la quitte
  // en route (un petit cadre, un bord rattrapé) ne perd pas le geste.
  function startDrag(event, handle) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    const { box, minW, minH } = limits();
    if (!box.width || !box.height) return;
    const base = Object.assign({}, state.crop);
    const from = { x: event.clientX, y: event.clientY };
    const onMove = (e) => {
      state.crop = dragged(base, handle, (e.clientX - from.x) / box.width, (e.clientY - from.y) / box.height, minW, minH);
      render();
    };
    const end = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', end);
      document.removeEventListener('pointercancel', end);
      refs.frame.classList.remove('is-dragging');
    };
    refs.frame.classList.add('is-dragging');
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
    if (handle !== 'move' && typeof event.currentTarget.focus === 'function') event.currentTarget.focus({ preventScroll: true });
  }

  // Une flèche sur une poignée : le bord qu'elle tient avance dans le sens de la flèche (un coin suit les deux sens). Entrée rogne (comme dans la fenêtre du texte alternatif).
  function onHandleKey(event, handle) {
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      if (!refs.ok.disabled) refs.ok.click();
      return;
    }
    const arrow = ARROWS[event.key];
    if (!arrow) return;
    event.preventDefault();
    const step = event.shiftKey ? STEP_BIG : STEP;
    const { minW, minH } = limits();
    state.crop = dragged(state.crop, handle, arrow[0] * step, arrow[1] * step, minW, minH);
    render();
  }

  function addHandle(handle, corner) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pp-crop-handle pp-crop-handle-' + handle;
    button.dataset.handle = handle;
    // Les coins se prennent à la souris ; Tab ne s'arrête que sur les quatre bords (neuf arrêts de plus rendraient la fenêtre pénible au clavier).
    if (corner) button.tabIndex = -1;
    button.addEventListener('pointerdown', event => startDrag(event, handle));
    button.addEventListener('keydown', event => onHandleKey(event, handle));
    refs.frame.appendChild(button);
    return button;
  }

  function ensure() {
    if (win) return;
    // restoreFocus: false : le focus revient à l'éditeur (closeWindow), pas au bouton de la barre - l'image y est restée sélectionnée.
    win = ModalBase.create({ id: 'pp-crop-modal', titleId: 'pp-crop-title', size: 'md', boxClass: 'pp-crop-box', actionsClass: 'var-modal-actions', onEscape: () => closeWindow(), restoreFocus: false });
    const stage = document.createElement('div');
    stage.className = 'pp-crop-stage';
    const preview = document.createElement('img');
    preview.className = 'pp-crop-preview';
    preview.alt = '';
    preview.draggable = false;
    const shade = document.createElement('div');
    shade.className = 'pp-crop-shade';
    const hole = document.createElement('div');
    hole.className = 'pp-crop-hole';
    shade.appendChild(hole);
    const frame = document.createElement('div');
    frame.className = 'pp-crop-frame';
    frame.setAttribute('role', 'group');
    stage.append(preview, shade, frame);
    const wrap = document.createElement('div');
    wrap.className = 'pp-crop-wrap';
    wrap.appendChild(stage);
    const size = document.createElement('p');
    size.className = 'pp-crop-size';
    size.setAttribute('aria-live', 'polite');
    const hint = document.createElement('p');
    hint.className = 'pp-crop-hint';
    win.body.append(wrap, size, hint);
    const { cancel, ok } = win.addButtons();
    refs = { stage, preview, shade, hole, frame, wrap, size, hint, cancel, ok, handles: {} };
    frame.addEventListener('pointerdown', (event) => { if (event.target === frame) startDrag(event, 'move'); });
    EDGES.forEach((handle) => { refs.handles[handle] = addHandle(handle, false); });
    CORNERS.forEach((handle) => { refs.handles[handle] = addHandle(handle, true); });
    cancel.addEventListener('click', () => closeWindow());
    ok.addEventListener('click', apply);
    // Le panneau change de taille (le cadre de GFS, la fenêtre du navigateur) : la hauteur permise à l'aperçu suit, le cadre reste en parts de l'image.
    window.addEventListener('resize', () => { if (win.isOpen()) fit(); });
    // La barre de GFS change de bord ou de profondeur, fenêtre ouverte : les marges du voile ont déjà bougé quand on le dit.
    GfsBar.onChange(() => { if (win.isOpen()) fit(); });
    preview.addEventListener('load', () => { fit(); render(); });
    preview.addEventListener('error', () => {
      closeWindow();
      Dialogs.notice({ title: I18n.t('imgToolbar.reshapeFailed.title'), message: I18n.t('imgToolbar.reshapeFailed.message'), closeLabel: I18n.t('common.close') });
    });
  }

  // La hauteur permise à l'aperçu : ce qui reste du panneau sous le titre, les deux lignes de texte et les boutons (css/image-crop.css la lit dans --pp-crop-max-h). La barre de GFS en haut ou en bas
  // (js/gfs-bar.js) prend sa profondeur au voile de la fenêtre en marge intérieure (css/modal-base.css, --gfs-bar-inset-*) : le cadre de la fenêtre se mesure dans ce qui reste, l'aperçu aussi ;
  // sans quoi le contenu défilait de la profondeur de la barre (35 px) dès qu'elle était là.
  function fit() {
    const overlay = getComputedStyle(win.overlay);
    const barDepth = (parseFloat(overlay.paddingTop) || 0) + (parseFloat(overlay.paddingBottom) || 0);
    const room = Math.max(96, Math.min(360, window.innerHeight - barDepth - 240));
    refs.stage.style.setProperty('--pp-crop-max-h', room + 'px');
  }

  function closeWindow() {
    if (win) win.hide();
    state = null;
    EditorCore.focusEditor();
  }

  // Ouvre la fenêtre sur l'image sélectionnée. Faux quand aucune image n'est sélectionnée, que l'éditeur n'est pas modifiable (la Lecture, un document en lecture seule) ou que l'image ne se rogne
  // pas (une image de colonne, un SVG, une image d'un autre site : le bouton de la barre est grisé avec la raison).
  function open() {
    const ed = EditorCore.getEditor();
    const found = ed && ed.isEditable ? ImageReshape.selected(ed) : null;
    if (!found || ImageReshape.unavailableKey(found.node.attrs)) return false;
    ensure();
    state = { pos: found.pos, src: found.node.attrs.src, crop: { l: 0, t: 0, r: 0, b: 0 } };
    win.title.textContent = I18n.t('crop.title');
    refs.hint.textContent = I18n.t('crop.hint');
    refs.frame.setAttribute('aria-label', I18n.t('crop.frame'));
    Object.keys(refs.handles).forEach((handle) => {
      const label = I18n.t(HANDLE_TEXT[handle]);
      refs.handles[handle].title = label;
      refs.handles[handle].setAttribute('aria-label', label);
    });
    refs.cancel.textContent = I18n.t('common.cancel');
    refs.ok.textContent = I18n.t('crop.apply');
    refs.ok.disabled = true;
    fit();
    refs.preview.src = state.src;
    // La même image que la fois d'avant, déjà décodée : le navigateur ne redit pas toujours « load », le cadre se dessine ici.
    if (refs.preview.complete && refs.preview.naturalWidth) render();
    win.show(() => refs.handles.n);
    return true;
  }

  // Rogne : l'image est redessinée sur la partie gardée, d'UN pas d'historique. Une image qui a changé pendant que la fenêtre était ouverte (un autre poste, Annuler) n'est pas touchée.
  async function apply() {
    const ed = EditorCore.getEditor();
    const job = state;
    if (!ed || !job || whole(job.crop)) return;
    const crop = Object.assign({}, job.crop);
    closeWindow();
    await ImageReshape.run(ed, 'crop', { crop, pos: job.pos, src: job.src });
  }

  return { open, current: () => (state ? Object.assign({}, state.crop) : null) };
})();
