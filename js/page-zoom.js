// Zoom de la page, en Édition comme en Lecture : agrandir ou réduire la feuille à l'écran. Un petit document aux dimensions personnalisées (un badge)
// apparaissait tout petit au milieu du gris (retour d'Antoine du 2026-10-04). Affichage seulement : la page, le PDF, le Word et les exports gardent
// leurs dimensions réelles.
//  - Un seul mécanisme, celui d'avant : le facteur `--pp-fit-zoom` (zoom CSS de la feuille, css/editor-v2.css), posé par js/main.js:applyPageFitZoom, qui
//    demande ici sa valeur (factorFor). Tout ce qui se mesure sur la feuille le divise déjà par ce facteur (EditorCore.layoutZoom). Trois états :
//    « auto » (l'affichage d'origine : la feuille réduite pour tenir dans le panneau quand elle est plus large, jamais agrandie), « fit » (« Ajuster » :
//    la feuille prend toute la largeur du panneau et la suit quand il change de taille) et « manual » (un niveau choisi, de 25 à 400 %, qui ne bouge
//    plus avec le panneau).
//  - Commandes : la pastille du coin bas droit du document (moins, pourcentage, plus, Ajuster - la barre d'outils reste gelée), Ctrl (⌘) + molette ou
//    pincement, Ctrl (⌘) + plus, moins ou 0 (0 rend l'affichage d'origine, comme un clic sur le pourcentage). Le point sous le pointeur ne bouge pas
//    (le centre du panneau pour les boutons et le clavier).
//  - Indisponible - grisé, jamais retiré - quand rien ne s'affiche en page : aperçu de la page décoché, grille, résumé d'un macro-modèle. Les touches et
//    la molette laissent alors le navigateur faire ce qu'il faisait.
//  - Le niveau est gardé par modèle, dans ce navigateur (localStorage, comme la langue) ; un modèle jamais zoomé repart de l'affichage d'origine.
// Script classique (pas type="module"), même convention de portée globale que CleanReading ; js/main.js le câble (wire) et lui annonce chaque modèle
// chargé (useTemplate).
const PageZoom = (function () {
  const STORAGE = 'pp_page_zoom';
  const EDITOR_ID = 'editor-container';
  const READER_ID = 'reader-container';
  const MIN = 0.25;
  const MAX = 4;
  // Plancher de l'ajustement automatique : en dessous, le texte devient illisible et le défilement horizontal reprend la main. Un niveau choisi, lui, peut
  // descendre jusqu'à MIN.
  const AUTO_FLOOR = 0.5;
  const STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
  // Molette et pincement : un cran de 100 px de molette vaut +16 %, un pincement (quelques pixels par évènement) se suit en continu.
  const WHEEL_SPEED = 0.0015;
  const WHEEL_MAX_PX = 120;
  // Pause après le dernier changement avant de garder le niveau et de refaire la pagination, qui se mesure sur le rendu réel.
  const SETTLE_MS = 150;
  const KEPT_TEMPLATES = 60;

  let host = null;       // { apply, refresh, template } : ce que js/main.js fournit
  let mode = 'auto';     // 'auto' | 'fit' | 'manual'
  let level = 1;         // le niveau du mode 'manual'
  let changes = 0;       // compte les changements, pour qu'une repagination en retard ne ramène pas un défilement périmé
  let unsaved = false;   // un changement attend d'être gardé
  let settleTimer = 0;
  let needsRefresh = false;
  let pill = null;
  let outButton = null;
  let valueButton = null;
  let inButton = null;
  let fitButton = null;

  const clamp = z => Math.min(MAX, Math.max(MIN, z));
  const rounded = (z, scale) => Math.round(z * scale) / scale;

  // Garde du niveau par modèle

  function readStore() {
    try {
      const list = JSON.parse(localStorage.getItem(STORAGE) || '[]');
      if (!Array.isArray(list)) return [];
      return list.filter(e => e && e.i != null && typeof e.n === 'string' && (e.m === 'fit' || (e.m === 'manual' && e.z >= MIN && e.z <= MAX)));
    } catch (e) { return []; }
  }
  function writeStore(list) {
    try {
      if (list.length) localStorage.setItem(STORAGE, JSON.stringify(list.slice(-KEPT_TEMPLATES)));
      else localStorage.removeItem(STORAGE);
    } catch (e) { /* stockage indisponible : le niveau ne survivra pas au rechargement, sans plus de conséquence */ }
  }
  // Le même identifiant et le même nom : le stockage du navigateur est partagé par tous les documents Grist qui ouvrent ce widget, dont les numéros de
  // ligne se recoupent.
  const sameTemplate = (entry, id, name) => String(entry.i) === String(id) && entry.n === name;

  function persist() {
    unsaved = false;
    const current = host && host.template ? host.template() : null;
    if (!current || current.id == null || current.id === '') return; // modèle pas encore enregistré : le niveau vaut pour cette session
    const others = readStore().filter(e => String(e.i) !== String(current.id));
    if (mode === 'fit') others.push({ i: current.id, n: current.name, m: 'fit' });
    else if (mode === 'manual') others.push({ i: current.id, n: current.name, m: 'manual', z: rounded(level, 10000) });
    writeStore(others);
  }

  // Annoncé par js/main.js à chaque modèle chargé (nouveau, existant ou macro-modèle), avant que le facteur ne soit recalculé : le niveau gardé pour ce
  // modèle, ou l'affichage d'origine.
  function useTemplate(tpl) {
    if (unsaved) { clearTimeout(settleTimer); persist(); } // le niveau qu'on vient de choisir reste à celui qu'on quitte
    const id = tpl ? tpl.id : null;
    const name = tpl ? String(tpl.nom || '').trim() : '';
    const entry = id == null ? null : readStore().find(e => sameTemplate(e, id, name));
    mode = entry ? entry.m : 'auto';
    level = entry && entry.m === 'manual' ? entry.z : 1;
  }

  // Le facteur à poser

  // La largeur que prend la barre de défilement verticale d'un conteneur (0 avec les barres qui se superposent au contenu), mesurée une fois.
  let scrollbarPx = null;
  function scrollbarWidth() {
    if (scrollbarPx != null) return scrollbarPx;
    const probe = Dom.el('div');
    probe.style.cssText = 'position:absolute;top:-9999px;left:0;width:100px;height:100px;overflow:scroll;visibility:hidden';
    document.body.appendChild(probe);
    scrollbarPx = probe.offsetWidth - probe.clientWidth;
    probe.remove();
    return scrollbarPx;
  }

  // Le facteur à poser sur `container` (js/main.js:applyPageFitZoom), ou null quand il ne se mesure pas : conteneur masqué (la Lecture quand on édite, et
  // l'inverse) en 'auto' et 'fit' - le facteur d'avant est gardé, le redimensionnement qui accompagne son retour le recalcule.
  function factorFor(container) {
    if (mode === 'manual') return clamp(level);
    const cs = getComputedStyle(container);
    const padding = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    // clientWidth exclut déjà la barre de défilement verticale ; le padding du conteneur, lui, encadre la feuille et doit être retiré à la main.
    const available = container.clientWidth - padding;
    if (!(available > 0)) return null;
    // Largeur de la feuille = celle de .v2-page-sheet / .reader-content en Aperçu A4 (--pp-page-width, css/editor-v2.css) : 793.71px en A4 portrait,
    // 1122.52px en A4 paysage, 559.37px en A5 portrait... Lue à chaque calcul, elle change avec le sens et le format du modèle.
    const sheetWidth = PageLayout.getSheetWidthPx();
    if (mode === 'fit') {
      // La barre de défilement verticale est comptée comme toujours présente : si la page agrandie dépasse en hauteur, elle apparaît, et la largeur utile
      // ne doit pas changer pour autant - sinon la page rétrécirait, la barre disparaîtrait, la page regrandirait, sans fin. Arrondi vers le bas : un
      // millième de trop ferait déborder la feuille d'un demi-pixel et apparaître la barre du bas.
      const stable = container.offsetWidth - 2 * container.clientLeft - scrollbarWidth() - padding;
      return Math.floor(clamp(stable / sheetWidth) * 1000) / 1000;
    }
    const raw = available / sheetWidth;
    return raw >= 1 ? 1 : Math.max(AUTO_FLOOR, raw);
  }

  // Ce qui est à l'écran

  const containerOf = id => document.getElementById(id);
  // Le conteneur du document qu'on voit : l'éditeur ou la Lecture, jamais le résumé d'un macro-modèle (l'éditeur est alors masqué, la Lecture aussi).
  function visibleContainer() {
    return [containerOf(EDITOR_ID), containerOf(READER_ID)].find(c => c && c.getClientRects().length > 0) || null;
  }
  // Celui qui montre une feuille : sans l'aperçu de la page (case décochée, grille), il n'y a rien à zoomer.
  function zoomable() {
    const c = visibleContainer();
    return c && c.classList.contains('a4-preview') ? c : null;
  }
  function sheetOf(c) {
    return c.querySelector(c.id === EDITOR_ID ? '.v2-page-sheet' : '.reader-content');
  }
  function appliedFactor(c) {
    const z = parseFloat(c.style.getPropertyValue('--pp-fit-zoom'));
    return z > 0 ? z : 1;
  }
  // Une fenêtre (js/modal-base.js) ouverte : ses champs gardent leurs touches, le zoom du navigateur reste ce qu'il était.
  function windowOpen() {
    return Array.from(document.querySelectorAll('.pp-modal')).some(m => m.isConnected && getComputedStyle(m).display !== 'none');
  }

  // Changer le niveau

  // Le point de la feuille qui est sous (x, y) - en pixels de mise en page de la feuille - avant le changement, pour le remettre au même endroit de
  // l'écran après. Sans pointeur, le centre de la zone visible.
  function hold(c, anchor) {
    const sheet = sheetOf(c);
    if (!sheet) return null;
    const z = appliedFactor(c);
    const box = c.getBoundingClientRect();
    const x = anchor ? anchor.x : box.left + c.clientWidth / 2;
    const y = anchor ? anchor.y : box.top + c.clientHeight / 2;
    const r = sheet.getBoundingClientRect();
    return { sheet, x, y, u: (x - r.left) / z, v: (y - r.top) / z };
  }
  function release(c, held) {
    const z = appliedFactor(c);
    const r = held.sheet.getBoundingClientRect();
    c.scrollLeft += r.left - (held.x - held.u * z);
    c.scrollTop += r.top - (held.y - held.v * z);
  }

  function change(update, anchor) {
    const c = zoomable();
    if (!c || !host) return;
    const held = hold(c, anchor);
    update();
    changes++;
    unsaved = true;
    const moved = host.apply();
    if (held) release(c, held);
    updatePill();
    clearTimeout(settleTimer);
    needsRefresh = needsRefresh || !!moved;
    settleTimer = setTimeout(settle, SETTLE_MS);
  }

  // Le calme est revenu : le niveau est gardé, et la pagination refaite sur le rendu réel (les bandes de pages se mesurent à l'écran, elles sont
  // périmées dès que le facteur a changé). La Lecture se redessine : le défilement qu'on avait est rendu s'il n'a pas bougé entre-temps.
  async function settle() {
    persist();
    if (!needsRefresh || !host) return;
    needsRefresh = false;
    const c = visibleContainer();
    const seen = changes;
    const kept = c ? { top: c.scrollTop, left: c.scrollLeft } : null;
    try { await host.refresh(); } catch (e) { console.error('[PageZoom] repagination impossible', e); }
    if (c && kept && seen === changes && c.isConnected) { c.scrollTop = kept.top; c.scrollLeft = kept.left; }
  }

  function nextStep(from, direction) {
    if (direction > 0) return STEPS.find(s => s > from + 0.005) || MAX;
    for (let i = STEPS.length - 1; i >= 0; i--) if (STEPS[i] < from - 0.005) return STEPS[i];
    return MIN;
  }
  function stepBy(direction) {
    const c = zoomable();
    if (!c) return;
    const from = appliedFactor(c);
    const target = nextStep(from, direction);
    if (Math.abs(target - from) < 0.0005) return;
    change(() => { mode = 'manual'; level = target; });
  }
  function fit() { if (mode !== 'fit') change(() => { mode = 'fit'; }); }
  function reset() { if (mode !== 'auto') change(() => { mode = 'auto'; }); }

  // Commandes

  function wheelPixels(event, c) {
    const px = event.deltaMode === 1 ? event.deltaY * 33 : event.deltaMode === 2 ? event.deltaY * c.clientHeight : event.deltaY;
    return Math.max(-WHEEL_MAX_PX, Math.min(WHEEL_MAX_PX, px));
  }
  function onWheel(event) {
    if (!(event.ctrlKey || event.metaKey) || !event.deltaY) return;
    const c = zoomable();
    if (!c) return;
    event.preventDefault();
    const from = mode === 'manual' ? level : appliedFactor(c);
    const target = clamp(from * Math.exp(-wheelPixels(event, c) * WHEEL_SPEED));
    if (mode === 'manual' && Math.abs(target - level) < 1e-6) return;
    change(() => { mode = 'manual'; level = target; }, { x: event.clientX, y: event.clientY });
  }

  // La touche d'une commande : plus (« + » ou « = », qui porte le plus sur un clavier QWERTY), moins, zéro (la touche physique du chiffre : sur un
  // clavier AZERTY il faut Maj pour taper « 0 », et le navigateur zoome pourtant sur Ctrl+0).
  function keyAction(event) {
    const key = event.key;
    if (key === '+' || key === '=') return 'in';
    if (key === '-' || key === '_') return 'out';
    if (key === '0' || event.code === 'Digit0') return 'reset';
    return null;
  }
  function onKeydown(event) {
    if (event.defaultPrevented || event.isComposing || event.altKey || !(event.ctrlKey || event.metaKey)) return;
    const action = keyAction(event);
    if (!action || !zoomable() || windowOpen()) return;
    event.preventDefault();
    event.stopPropagation();
    if (action === 'in') stepBy(1);
    else if (action === 'out') stepBy(-1);
    else reset();
  }

  // Glisser la bordure d'une colonne de tableau (prosemirror-tables) : la bibliothèque ajoute le déplacement de la souris, en pixels de l'écran, à une
  // largeur en pixels de mise en page. Sous un zoom la bordure ne suit plus le pointeur (deux fois trop vite à 200 %, deux fois trop lentement à 50 %).
  // Pendant le glisser, la position de la souris que la bibliothèque lit est donc ramenée à l'échelle de la feuille : départ + déplacement / zoom. Sans
  // zoom (facteur 1) rien n'est touché. La poignée est « prise » quand l'éditeur porte la classe resize-cursor au moment de l'appui.
  function onColumnDragStart(event) {
    if (event.button !== 0 || !event.target || !event.target.closest) return;
    const editorDom = event.target.closest('.tiptap');
    if (!editorDom || !editorDom.classList.contains('resize-cursor')) return;
    const z = EditorCore.layoutZoom(editorDom);
    if (Math.abs(z - 1) < 0.001) return;
    const startX = event.clientX;
    const rescale = e => Object.defineProperty(e, 'clientX', { configurable: true, value: startX + (e.clientX - startX) / z });
    const release = e => {
      rescale(e);
      window.removeEventListener('mousemove', rescale, true);
      window.removeEventListener('mouseup', release, true);
    };
    window.addEventListener('mousemove', rescale, true);
    window.addEventListener('mouseup', release, true);
  }

  function onPillClick(event) {
    const button = event.target.closest ? event.target.closest('button') : null;
    if (!button || !pill.contains(button) || button.getAttribute('aria-disabled') === 'true') return;
    if (button === outButton) stepBy(-1);
    else if (button === inButton) stepBy(1);
    else if (button === valueButton) reset();
    else if (button === fitButton) fit();
  }

  // La pastille

  // « Ctrl » ou « ⌘ » selon la plateforme, comme les autres raccourcis (Shortcuts.format).
  function modName() { return Shortcuts.format('Mod+x').replace(/X$/, '').replace(/\+$/, ''); }

  // Pourquoi il n'y a rien à zoomer : l'aperçu de la page est décoché, ou il n'y a pas de page (grille : sa case est alors grisée, résumé d'un
  // macro-modèle).
  function unavailableText() {
    const c = visibleContainer();
    const toggle = document.getElementById('v2-toggle-a4-preview');
    if (c && toggle && !toggle.disabled && !toggle.checked) return I18n.t('pageZoom.unavailable.preview', { format: PageLayout.getFormatLabel() });
    return I18n.t('pageZoom.unavailable.none');
  }

  function applyTexts(available) {
    const mod = modName();
    const off = available ? '' : unavailableText();
    const label = (button, text) => { button.title = available ? text : off; button.setAttribute('aria-label', available ? text : off); };
    pill.setAttribute('aria-label', I18n.t('pageZoom.group'));
    label(outButton, I18n.t('pageZoom.out', { keys: mod + ' −' }));
    label(inButton, I18n.t('pageZoom.in', { keys: mod + ' +' }));
    valueButton.title = available ? I18n.t('pageZoom.reset', { keys: mod + ' 0' }) : off;
    fitButton.title = available ? I18n.t('pageZoom.fit.tip') : off;
    fitButton.textContent = I18n.t('pageZoom.fit');
  }

  function updatePill() {
    if (!pill) return;
    const c = zoomable();
    const z = c ? appliedFactor(c) : 1;
    valueButton.textContent = I18n.t('pageZoom.value', { n: Math.round(z * 100) });
    const grey = (button, off) => { if (off) button.setAttribute('aria-disabled', 'true'); else button.removeAttribute('aria-disabled'); };
    grey(outButton, !c || z <= MIN + 0.001);
    grey(inButton, !c || z >= MAX - 0.001);
    grey(valueButton, !c);
    grey(fitButton, !c);
    fitButton.setAttribute('aria-pressed', c && mode === 'fit' ? 'true' : 'false');
    applyTexts(!!c);
  }

  function build() {
    pill = Dom.el('div', 'pp-page-zoom');
    pill.id = 'pp-page-zoom';
    pill.setAttribute('role', 'region'); // un repère nommé (l'étiquette est posée par applyTexts) : une pastille hors repère est du contenu hors repère pour un lecteur d'écran et pour l'audit (axe, règle region)
    outButton = Dom.button('pp-page-zoom-step', '−');
    outButton.id = 'pp-page-zoom-out';
    valueButton = Dom.button('pp-page-zoom-value');
    valueButton.id = 'pp-page-zoom-value';
    inButton = Dom.button('pp-page-zoom-step', '+');
    inButton.id = 'pp-page-zoom-in';
    const separator = Dom.el('span', 'pp-page-zoom-sep');
    separator.setAttribute('aria-hidden', 'true');
    fitButton = Dom.button('pp-page-zoom-fit');
    fitButton.id = 'pp-page-zoom-fit';
    pill.append(outButton, valueButton, inButton, separator, fitButton);
    // Un appui sur la pastille ne prend pas le focus : le curseur et la sélection restent où ils sont (même geste que les barres flottantes). Au
    // clavier, Tab puis Entrée ou Espace font ce que fait le clic.
    pill.addEventListener('mousedown', event => event.preventDefault());
    pill.addEventListener('click', onPillClick);
    document.body.appendChild(pill);
  }

  // `options` : { apply, refresh, template }. apply() pose le facteur sur les deux conteneurs et dit si l'un a changé (js/main.js:applyPageFitZoomToBoth) ;
  // refresh() refait ce qui se mesure sur le rendu (pagination de l'éditeur, Lecture) ; template() donne { id, name } du modèle affiché.
  function wire(options) {
    if (pill) return;
    host = options;
    build();
    // La molette est écoutée sur les deux conteneurs et la pastille seulement (pas sur le document) : un écouteur qui peut annuler la molette fait
    // attendre le défilement du thread principal, il ne doit pas peser sur la barre d'outils ni sur les fenêtres.
    [containerOf(EDITOR_ID), containerOf(READER_ID), pill].forEach(target => { if (target) target.addEventListener('wheel', onWheel, { passive: false }); });
    document.addEventListener('keydown', onKeydown, true);
    document.addEventListener('mousedown', onColumnDragStart, true);
    // Le pourcentage et le grisé suivent tout ce qui change le facteur ou ce qu'on voit : redimensionnement, orientation, mode, case d'aperçu, modèle.
    if (typeof MutationObserver === 'function') {
      const observer = new MutationObserver(updatePill);
      [containerOf(EDITOR_ID), containerOf(READER_ID)].forEach(c => { if (c) observer.observe(c, { attributes: true, attributeFilter: ['class', 'style'] }); });
    }
    I18n.onChange(updatePill);
    updatePill();
  }

  return { wire, useTemplate, factorFor };
})();
