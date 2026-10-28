// Boîte à outils bas niveau de l'éditeur : les utilitaires utilisés par plusieurs modules sans propriétaire naturel (patchNodeAndReselect, le kit de
// panneaux flottants, createSelectionPreserver, les commandes sur une sélection de cases). Aucune logique métier, que des primitives. Script
// classique (pas type="module"), même partage de portée globale que GristAPI, Editor et Variables.
const EditorCore = (function () {
  let editor = null;
  let floatingUi = null;
  let NodeSelectionClass = null;
  let TextSelectionClass = null;
  function setEditor(ed) { editor = ed; }
  function getEditor() { return editor; }
  // Rend le clavier à l'éditeur quand une fenêtre se referme ; sans éditeur, rien.
  function focusEditor() { if (editor) editor.commands.focus(); }
  function setFloatingUi(lib) { floatingUi = lib; }
  function setNodeSelectionClass(cls) { NodeSelectionClass = cls; }
  function getTextSelectionClass() { return TextSelectionClass; }
  function setTextSelectionClass(cls) { TextSelectionClass = cls; }

  function patchNodeAndReselect(ed, pos, newAttrs) {
    // Partagé par updateAttrs/updateSelectedImage/updateSelectedBadge : setNodeMarkup() remplace le nœud, donc la NodeSelection doit être recréée
    // explicitement dessus (sinon retombe en curseur texte).
    const { state, view } = ed;
    const tr = state.tr.setNodeMarkup(pos, undefined, newAttrs);
    if (NodeSelectionClass) tr.setSelection(NodeSelectionClass.create(tr.doc, pos));
    view.dispatch(tr);
  }

  // En Aperçu A4 la feuille a la largeur de la page, quel que soit le panneau (`--pp-page-width`, ou la plus large de ses pages quand elles ne sont pas toutes du même sens), et
  // `.tiptap` la remplit moins les marges : la largeur du texte se lit sur ces variables (PageLayout.applyToPreviewCss, que la règle CSS lit de même) plutôt qu'à la mesure. `clientWidth`
  // est un entier, que le moteur arrondit autrement à chaque échelle de la feuille (719 ou 720 px selon le panneau) : une largeur utile qui bouge d'un pixel avec le panneau fait bouger
  // ce qu'on en écrit dans le document. 0 : variables absentes ou illisibles, l'appelant mesure.
  function pageContentWidthPx(container) {
    const cs = getComputedStyle(container);
    const sheet = parseFloat(cs.getPropertyValue(container.classList.contains('pp-mixed-pages') ? '--pp-mixed-sheet-width' : '--pp-page-width'));
    const left = parseFloat(cs.getPropertyValue('--pp-margin-left'));
    const right = parseFloat(cs.getPropertyValue('--pp-margin-right'));
    return sheet > 0 && left >= 0 && right >= 0 && sheet > left + right ? sheet - left - right : 0;
  }

  function editorContentWidthPx(currentEditor) {
    // clientWidth inclut son propre padding (la marge de page de l'Aperçu A4) ; partagé entre clampOverflowingTables et l'alignement des images en
    // calque. Jamais négative : un éditeur masqué (Lecture, macro-modèle) a un clientWidth de 0 mais garde son padding calculé, et la soustraction
    // donnerait une largeur négative que clampOverflowingTables prendrait pour une vraie mesure, ramenant toutes les colonnes d'un tableau à 25 px. 0
    // veut dire « pas de mise en page, rien à mesurer ». En Aperçu A4, la largeur de la page elle-même (pageContentWidthPx) : la même à toutes les tailles de panneau.
    const rootEl = currentEditor.view.dom;
    const rootCs = getComputedStyle(rootEl);
    const measured = Math.max(0, rootEl.clientWidth - (parseFloat(rootCs.paddingLeft) || 0) - (parseFloat(rootCs.paddingRight) || 0));
    const container = measured && rootEl.closest ? rootEl.closest('#editor-container.a4-preview') : null;
    return (container && pageContentWidthPx(container)) || measured;
  }

  // --- Les mesures qui s'écrivent dans le document ---
  // La taille du panneau ne doit jamais changer ce qu'un modèle enregistre. Or tout ce que le DOM mesure dépend de l'échelle de la feuille (le zoom d'ajustement à la largeur du panneau,
  // que chaque moteur arrondit à sa façon : des entiers pour `clientWidth` et `offsetLeft`, des soixante-quatrièmes de pixel pour `getBoundingClientRect`) et, sans Aperçu A4, de la
  // largeur du panneau même. `pageScale` ouvre donc, le temps d'une mesure, la page telle que l'export la voit : la feuille à l'échelle 1 (`--pp-fit-zoom` et `--pp-content-fix` à 1) et,
  // sans aperçu, à la largeur d'une page A4 (la classe `a4-preview` posée le temps de la mesure). Ouverte à la première mesure seulement (`measure`) : un document sans colonne à geler
  // ni image à placer ne paie rien. Le tout dans le même tour de boucle : rien ne s'affiche entre l'ouverture et la fermeture, et les observateurs (ResizeObserver, MutationObserver)
  // ne voient que l'état d'avant et celui d'après, identiques. Aucune transaction ne doit partir pendant que la fenêtre est ouverte (la mise à jour d'une feuille de pages mêlées y
  // poserait son propre zoom, que la fermeture écraserait) : l'appelant mesure, ferme, puis écrit. Un éditeur masqué n'a rien à mesurer : la fenêtre ne s'ouvre pas.
  const PAGE_SCALE_VARS = ['--pp-fit-zoom', '--pp-content-fix'];
  function openPageScale(container) {
    const wasA4 = container.classList.contains('a4-preview');
    const was = PAGE_SCALE_VARS.map(name => container.style.getPropertyValue(name));
    if (wasA4 && was.every(value => !value || parseFloat(value) === 1)) return null;
    const { scrollTop, scrollLeft } = container;
    PAGE_SCALE_VARS.forEach(name => container.style.setProperty(name, '1'));
    if (!wasA4) container.classList.add('a4-preview');
    return () => {
      PAGE_SCALE_VARS.forEach((name, i) => { if (was[i]) container.style.setProperty(name, was[i]); else container.style.removeProperty(name); });
      if (!wasA4) container.classList.remove('a4-preview');
      // Le défilement reste là où il était : l'ancrage du défilement du moteur a pu le déplacer pendant que la feuille changeait de hauteur.
      if (container.scrollTop !== scrollTop) container.scrollTop = scrollTop;
      if (container.scrollLeft !== scrollLeft) container.scrollLeft = scrollLeft;
    };
  }
  function pageScale(currentEditor) {
    const tiptapEl = currentEditor && currentEditor.view ? currentEditor.view.dom : null;
    const container = tiptapEl && tiptapEl.closest ? tiptapEl.closest('#editor-container') : null;
    let opened = false;
    let restore = null;
    return {
      measure(read) {
        if (!opened && container && tiptapEl.getClientRects().length) { opened = true; restore = openPageScale(container); }
        return read();
      },
      // Rend true quand la page a vraiment changé d'échelle le temps de la mesure : ce que l'écran affiche (la pagination) est alors à refaire à son échelle.
      close() {
        const changed = !!restore;
        if (restore) restore();
        restore = null;
        opened = false;
        return changed;
      },
    };
  }
  // Le cas courant d'une mesure unique : `fn` s'exécute sur la page à l'échelle 1, qui se referme avant le retour (même si `fn` lève).
  function atPageScale(currentEditor, fn) {
    const scale = pageScale(currentEditor);
    try { return scale.measure(fn); } finally { scale.close(); }
  }

  function layoutZoom(el) {
    // Facteur de réduction de la feuille A4 (`zoom: var(--pp-fit-zoom)` sur .v2-page-sheet et .reader-content, posé par applyPageFitZoom de js/main.js)
    // : à ~700 px de panneau il vaut ~0,85. Les rectangles de getBoundingClientRect et les déplacements de la souris sont en pixels écran, alors que
    // `left`, `top` et `width` d'une image s'écrivent en pixels de mise en page : tout geste qui passe de l'un à l'autre divise par ce facteur
    // (redimensionner, déplacer, aligner, passer en calque). Repli sur 1 : feuille non réduite (grand panneau, Aperçu A4 décoché). La Lecture
    // (js/reader-mode.js) mesure de même sa feuille `.reader-content`.
    const sheet = el && el.closest ? el.closest('.v2-page-sheet, .reader-content') : null;
    const z = sheet ? parseFloat(getComputedStyle(sheet).zoom) : NaN;
    return (isFinite(z) && z > 0) ? z : 1;
  }

  // Le zoom que le moteur applique vraiment au texte et aux marges de la page, que la feuille doit lui avoir donné (`zoom` de .v2-page-sheet, lu par layoutZoom). Chez une personne,
  // sous Firefox (capture du 21/10), le contenu se dessinait au carré du zoom de la feuille (63 % quand la feuille est à 79 %) : le texte et la marge de gauche plus petits que
  // ceux de la page, et chaque réserve posée sous le dernier bloc d'une page, en pixels du contenu, trop courte du rapport : la copie d'une diapositive tombait au bas de la page
  // d'avant. Aucun moteur d'ici (Chromium, Firefox 136, Gecko 158) ne le fait ; la mesure, elle, le dit : la largeur dessinée de `.tiptap` sur sa largeur de mise en page. Quand
  // elle s'écarte du zoom de la feuille, `--pp-content-fix` (sur le conteneur ; css/editor-v2.css en fait le `zoom` de `.tiptap`) prend le rapport qui manque, jusqu'à ce que
  // le contenu soit au zoom de la feuille. Sans écart, la variable n'existe pas et rien ne change.
  // Deux seuils : le rapport se corrige dès 0,3 % d'écart (l'arrondi de `offsetWidth` en laisse moins de 0,2 %), et une correction qui laisse 1,5 % d'écart est retirée.
  // Le rapport se corrige comme si le zoom dessiné suivait `--pp-content-fix` à la puissance un (le double zoom de la feuille). Si la première correction ne suffit pas, c'est
  // que le moteur le combine autrement : la puissance se tire alors des deux dernières mesures, et la passe suivante vise juste (sinon une correction trop forte, puis trop faible,
  // finissait retirée et le contenu restait à la mauvaise échelle).
  const CONTENT_ZOOM_SETTLE = 0.003;
  const CONTENT_ZOOM_REJECT = 0.015;
  function contentZoom(tiptapEl) {
    const layoutWidth = tiptapEl.offsetWidth;
    const drawnWidth = tiptapEl.getBoundingClientRect().width;
    return (layoutWidth >= 300 && drawnWidth > 0) ? drawnWidth / layoutWidth : null;
  }
  function adjustContentZoom(container, tiptapEl) {
    const sheet = tiptapEl.parentElement;
    if (!sheet || !sheet.classList.contains('v2-page-sheet')) return;
    const wanted = layoutZoom(tiptapEl);
    const offBy = (got, limit) => got !== null && Math.abs(got / wanted - 1) >= limit;
    let fix = parseFloat(container.style.getPropertyValue('--pp-content-fix')) || 1;
    let previous = null;
    for (let k = 0; k < 3; k++) {
      const got = contentZoom(tiptapEl);
      if (!offBy(got, CONTENT_ZOOM_SETTLE)) return;
      let power = 1;
      if (previous && Math.abs(fix / previous.fix - 1) > 0.01) {
        const measured = Math.log(got / previous.got) / Math.log(fix / previous.fix);
        if (measured > 0.3 && measured < 3) power = measured;
      }
      const next = Math.round(fix * Math.pow(wanted / got, 1 / power) * 10000) / 10000;
      if (!(next > 0.1 && next < 10)) break;
      previous = { fix, got };
      fix = next;
      container.style.setProperty('--pp-content-fix', String(fix));
    }
    if (offBy(contentZoom(tiptapEl), CONTENT_ZOOM_REJECT)) container.style.removeProperty('--pp-content-fix');
  }
  // Rend true si `--pp-content-fix` a changé : la pagination, mesurée avec l'ancien rapport, est alors à refaire.
  function settleContentZoom(container, tiptapEl) {
    const before = container.style.getPropertyValue('--pp-content-fix');
    adjustContentZoom(container, tiptapEl);
    return container.style.getPropertyValue('--pp-content-fix') !== before;
  }

  function createStepSheets(anchor, className) {
    // Règles posées une à une pendant le calcul d'une pagination (js/header-footer-preview.js, js/reader-mode.js) : la coupure suivante mesure le
    // document avec les réserves déjà posées, donc chaque règle agit avant la mesure d'après. Réécrire la feuille entière à chaque coupure refait le
    // style de tout le document (86 ms par page pour un tableau de 1 000 lignes : un calcul quadratique en nombre de pages) alors qu'une feuille
    // ajoutée n'invalide que ce qu'elle vise (8 ms). Chaque règle va donc dans sa feuille <style>, posée à la suite de `anchor` et des précédentes :
    // même ordre, même cascade que dans la feuille unique, que l'appelant remplit d'un coup à la fin du calcul avant `clear()`. `className` est repris
    // par chaque feuille posée. `add` rend la feuille posée : un calcul qui pose plusieurs règles d'un coup peut en retirer une partie.
    const sheets = [];
    return {
      add(rule) {
        const sheet = document.createElement('style');
        if (className) sheet.className = className;
        sheet.textContent = rule;
        (sheets.length ? sheets[sheets.length - 1] : anchor).after(sheet);
        sheets.push(sheet);
        return sheet;
      },
      clear() {
        sheets.forEach(sheet => sheet.remove());
        sheets.length = 0;
      },
    };
  }

  // L'écart toléré entre le haut d'un bloc qui ouvre une page et le haut du corps de cette page (pixels de mise en page) : les arrondis du moteur (1/64 de pixel écran) en
  // restent loin.
  const RESERVE_TOLERANCE_PX = 0.5;
  function opensPageAt(topRel, bodyTopRel) { return Math.abs(topRel - bodyTopRel) < RESERVE_TOLERANCE_PX; }
  function fitReserve(sheet, ruleFor, margin, topOf, bodyTopRel) {
    // La réserve d'une coupure entre deux blocs (js/header-footer-preview.js, js/reader-mode.js) : `sheet` porte déjà la règle `ruleFor(margin)` (pixels de mise en page) sous le
    // bloc qui finit la page, et `topOf()` lit le haut du bloc qui ouvre la page suivante, qui doit commencer au haut du corps de cette page (`bodyTopRel`, même repère). Il n'y
    // est pas toujours (sous Firefox, chez une personne, la diapositive dupliquée commençait au bas de la page 1, au-dessus de la couture) : la règle se corrige alors de l'écart,
    // puis, si le bloc n'a pas bougé d'autant, de ce que la dernière correction a vraiment fait (trois essais au plus). Une correction qui ne le rapproche pas (sa propre marge
    // l'emporte) est retirée. Vrai si le bloc est au rendez-vous.
    let off = topOf() - bodyTopRel;
    let moves = 1;
    for (let k = 0; k < 3 && !opensPageAt(off + bodyTopRel, bodyTopRel); k++) {
      const tried = margin - off / moves;
      if (tried < 0) break;
      sheet.textContent = ruleFor(tried);
      const after = topOf() - bodyTopRel;
      const slope = (after - off) / (tried - margin);
      if (!(slope > 0.1) || Math.abs(after) >= Math.abs(off)) { sheet.textContent = ruleFor(margin); break; }
      margin = tried; off = after; moves = slope;
    }
    return opensPageAt(topOf(), bodyTopRel);
  }

  function nextInFlow(el) {
    // Le bloc qui ouvre la page après `el`, la réserve d'une coupure posée sous lui (js/header-footer-preview.js, js/reader-mode.js) : son premier frère dans le flux. Un
    // bloc en position absolue (un cadre posé sur sa diapositive) ne prend pas de place dans la page et n'en ouvre aucune.
    let next = el.nextElementSibling;
    while (next && /^(absolute|fixed)$/.test(getComputedStyle(next).position)) next = next.nextElementSibling;
    return next;
  }

  function previousInFlow(el) {
    // Le bloc qui précède `el` dans le flux : son premier frère d'avant qui prend de la place (ni en position absolue, ni caché : une feuille de style posée dans la page n'est pas un bloc).
    let previous = el.previousElementSibling;
    while (previous) {
      const style = getComputedStyle(previous);
      if (!/^(absolute|fixed)$/.test(style.position) && style.display !== 'none') break;
      previous = previous.previousElementSibling;
    }
    return previous;
  }

  function gapAbove(el, root, zoom) {
    // L'écart naturel (pixels de mise en page) entre le bord haut de `el`, un bloc de premier niveau de `root`, et ce qui le précède : le bord bas du bloc d'avant ou, pour le premier, le haut du
    // contenu de `root` (sous son remplissage). C'est la marge d'un bloc que la hauteur d'aucun des deux ne porte - un tableau (6 px), une citation ou un bloc de code (4 px) : elle sort de la boîte
    // de l'enveloppe du tableau (`overflow-x: visible` en Aperçu A4) et se confond avec celle du voisin. La pagination (js/header-footer-preview.js:computePageBreaks, js/reader-mode.js:
    // computePageBreakOffsets) l'ajoute à la place que la page prend ; à lire avant qu'elle pose ses réserves, qui écartent les blocs.
    const previous = previousInFlow(el);
    const edge = previous ? previous.getBoundingClientRect().bottom : root.getBoundingClientRect().top + (parseFloat(getComputedStyle(root).paddingTop) || 0) * zoom;
    return Math.max(0, (el.getBoundingClientRect().top - edge) / zoom);
  }

  // Barre contextuelle flottante, positionnée par @floating-ui/dom et ancrée dans document.body (aucun contexte d'empilement d'un ancêtre ne la
  // gêne).
  function createFloatingPanel(className, innerHTML, onAction, onInput) {
    const el = document.createElement('div');
    el.className = className;
    Dom.setMarkup(el, innerHTML);
    // mousedown+preventDefault : évite de perdre le focus/la sélection ProseMirror avant que l'action ne s'exécute.
    let pressedBtn = null;
    el.addEventListener('mousedown', (event) => {
      const btn = event.target.closest('button[data-action]');
      if (!btn) return;
      event.preventDefault();
      pressedBtn = btn;
      // Le bouton n'est « appuyé » que jusqu'au relâchement, où qu'il ait lieu (le clic qui suit, s'il y en a un, passe avant la minuterie).
      document.addEventListener('mouseup', () => { setTimeout(() => { pressedBtn = null; }, 0); }, { once: true, capture: true });
      onAction(btn.dataset.action);
    });
    if (onInput) el.addEventListener('input', (event) => {
      const input = event.target.closest('[data-role]');
      if (input) onInput(input.dataset.role, input.value);
    });
    // Un bouton de la barre se déclenche aussi au clavier (Tab puis Entrée ou Espace) : ce clic-là n'est précédé d'aucun mousedown ; celui de la
    // souris est déjà passé par le mousedown ci-dessus.
    el.addEventListener('click', (event) => {
      const btn = event.target.closest('button[data-action]');
      if (!btn) return;
      if (pressedBtn === btn) { pressedBtn = null; return; }
      onAction(btn.dataset.action);
    });
    document.body.appendChild(el);
    let stopAutoUpdate = null;
    let docked = false;
    // Le calcul de position de la barre affichée, à refaire quand la barre de GFS bouge ou que le cadre change de taille (la zone est alors autre).
    let relayout = null;
    GfsBar.onChange(() => { if (relayout && !docked && el.classList.contains('visible')) relayout(); });
    function undock() {
      if (!docked) return;
      docked = false;
      el.classList.remove('docked', 'visible');
      el.style.left = '0px';
      el.style.top = '0px';
      document.body.appendChild(el);
    }
    return {
      el,
      // Fixée dans `slot` (une bande de la page, hors du défilement) au lieu de flotter : dans une grille, la barre de la case posée sur la case
      // courante recouvrirait les cases voisines, et un appui dessus tomberait sur ses boutons (js/grid-editor.js, css/grid.css). Une barre fixée
      // reste visible : hide() n'y fait plus rien, c'est la bande qui se montre ou se cache.
      dock(slot) {
        relayout = null;
        ViewportFit.releaseBar(el);
        if (stopAutoUpdate) { stopAutoUpdate(); stopAutoUpdate = null; }
        if (el.parentElement !== slot) slot.appendChild(el);
        docked = true;
        el.classList.add('docked', 'visible');
      },
      undock,
      isDocked() { return docked; },
      // `options` (facultatif, valeur ou fonction relue à chaque calcul) : { flip, shift } passés tels quels aux intergiciels de floating-ui (la
      // grille s'en sert pour que la barre ne recouvre pas ses bandeaux, js/grid-editor.js:floatingOptions), { offset } (l'écart avec l'ancre, 8 px par
      // défaut : la barre d'un tableau de document laisse la place aux lettres de ses bandeaux) et { placement } (au-dessus par défaut :
      // le menu d'une barre fixée en haut de la page, comme celle de la case d'une grille, s'ouvre dessous plutôt que sur la barre d'outils). Sans
      // `options`, rien ne change.
      show(referenceEl, options) {
        undock();
        // À l'ouverture seulement : show est rappelé à chaque transaction, panneau déjà affiché. Un menu (couleur, police) passe au-dessus de ceux
        // déjà ouverts et de toute barre flottante ; une barre flottante garde l'ordre du DOM (celle d'une bulle ou d'une image reste au-dessus de
        // celle du tableau que le même clic ouvre : Layers.raise la laisse, js/layers.js).
        const opening = !el.classList.contains('visible');
        el.classList.add('visible');
        if (opening) Layers.raise(el);
        const update = () => {
          const opts = (typeof options === 'function' ? options() : options) || {};
          ViewportFit.releaseBar(el); // la taille entière, pour que floating-ui la mesure (le plafond que la barre de GFS a pu imposer est rendu)
          floatingUi.computePosition(referenceEl, el, {
            placement: opts.placement || 'top',
            middleware: [floatingUi.offset(opts.offset == null ? 8 : opts.offset), floatingUi.flip(opts.flip), floatingUi.shift(Object.assign({ padding: 8 }, opts.shift))],
          }).then(({ x, y }) => {
            el.style.left = `${x}px`;
            el.style.top = `${y}px`;
            // La barre de GFS (js/gfs-bar.js) : la barre ou le menu qui en recouvre la zone glisse, ou se plafonne et défile sous une barre en bas, sans quitter son ancre.
            ViewportFit.avoidBar(el, referenceEl.getBoundingClientRect());
          });
        };
        relayout = update;
        if (stopAutoUpdate) stopAutoUpdate();
        stopAutoUpdate = floatingUi.autoUpdate(referenceEl, el, update);
      },
      hide() {
        if (docked) return;
        el.classList.remove('visible');
        relayout = null;
        if (stopAutoUpdate) { stopAutoUpdate(); stopAutoUpdate = null; }
      },
    };
  }

  // Filet de sécurité : les barres contextuelles (tableau, image, variable) ne se ferment normalement que sur un vrai changement de sélection
  // ProseMirror ; un clic hors de `.tiptap` et hors de `.v2-floating-toolbar` les referme toutes, pour les cas sans évènement ProseMirror (ex. clic
  // sur "Mode lecture"). La pastille du zoom de la page (js/page-zoom.js) n'en fait pas partie : un appui dessus ne prend pas le focus et ne change ni la
  // sélection ni le contexte, la barre de l'image ou du tableau reste ouverte et suit la feuille qui change d'échelle. Le menu qu'une de ces barres a
  // ouvert (les bordures du tableau, setOpenDropdownPanel avec son bouton) n'en fait pas partie non plus, ni les bandeaux d'un tableau de document
  // (`.pp-doc-strips`, js/grid-editor.js) : un appui sur une lettre ou un numéro garde le focus de l'éditeur et choisit une colonne ou une ligne du
  // tableau dont la barre est ouverte.
  // `ownerEl` (facultatif) : le champ texte à bulles (js/field-editor.js) dont `panel` est la barre ; sans lui, c'est une barre de l'éditeur du
  // document. Un clic dans l'un laisse ouvertes les barres de CET éditeur et referme celles des autres : le curseur d'un champ ne bouge pas quand on
  // clique dans le document, et inversement.
  const floatingContextPanels = [];
  function registerFloatingPanel(panel, ownerEl) { floatingContextPanels.push({ panel, ownerEl: ownerEl || null }); }
  function hideFloatingContextToolbars() { floatingContextPanels.forEach(entry => entry.panel.hide()); }
  // Un appui dans le menu qu'une barre flottante a ouvert fait partie de cette barre : choisir la couleur d'un trait ou cocher le quadrillage ne la referme pas, sinon son bouton
  // disparaît et le menu, resté ouvert, perd son ancre et saute dans un coin. Il est jugé à la phase de capture, avant l'action de la ligne : quand elle referme le menu (un
  // réglage de bordures, « Mettre à jour depuis le modèle », « Détacher »), le menu n'est plus ouvert pour la suite de l'évènement et l'appui passerait pour un appui hors de la
  // barre, qui disparaîtrait alors que le curseur est toujours dans le tableau.
  let pressInBarMenu = false;
  document.addEventListener('mousedown', (event) => {
    pressInBarMenu = !!(openDropdownPanel && openDropdownButton && openDropdownButton.closest('.v2-floating-toolbar') && openDropdownPanel.el.contains(event.target));
  }, true);
  document.addEventListener('mousedown', (event) => {
    const target = event.target;
    if (target.closest('.v2-floating-toolbar') || target.closest('.pp-page-zoom') || target.closest('.pp-doc-strips')) return;
    if (pressInBarMenu) return;
    const inDocument = !!target.closest('.tiptap');
    floatingContextPanels.forEach(({ panel, ownerEl }) => {
      if (!(ownerEl ? ownerEl.contains(target) : inDocument)) panel.hide();
    });
  });

  // Un seul menu déroulant à la fois (couleur/police/taille), fermé au clic ailleurs.
  let openDropdownPanel = null;
  let openDropdownButton = null;
  function getOpenDropdownPanel() { return openDropdownPanel; }
  function setOpenDropdownPanel(panel, button) {
    // `button` (facultatif) : le bouton qui a ouvert `panel` - il annonce son état ouvert (aria-expanded) jusqu'à ce que closeDropdownPanel referme le
    // menu, comme ceux de wireDropdownButton.
    openDropdownPanel = panel;
    openDropdownButton = button || null;
    if (openDropdownButton) openDropdownButton.setAttribute('aria-expanded', 'true');
  }
  document.addEventListener('mousedown', (event) => {
    if (!openDropdownPanel) return;
    if (event.target.closest('.v2-color-dropdown') || event.target.closest('.v2-color-split')
      || event.target.closest('.v2-format-panel') || event.target.closest('.v2-format-chip')
      || event.target.closest('.v2-stepper') || event.target.closest('.v2-fill-chip')) return;
    closeDropdownPanel();
  });
  function closeDropdownPanel() {
    // aria-expanded est posé sur le bouton déclencheur tant que son panneau est ouvert, comme dans TemplateTreeSelect (js/template-tree-select.js) :
    // c'est aussi le signal que lit la règle CSS qui masque l'info-bulle [data-tip] d'un bouton à menu ouvert (css/toolbar-v2.css). Le pendant pour le
    // survol d'un .v2-hover-group est la délégation mouseover/mouseout/focusin/focusout plus bas, câblée une fois au chargement de ce script.
    if (!openDropdownPanel) return;
    openDropdownPanel.hide();
    openDropdownPanel = null;
    if (openDropdownButton) { openDropdownButton.setAttribute('aria-expanded', 'false'); openDropdownButton = null; }
  }
  function wireDropdownButton(btn, panel, captureSelection) {
    // Ouvre ou ferme `panel` au clic sur `btn`, sur mousedown + preventDefault (pas click) comme les barres du tableau et de l'image, pour ne pas
    // perdre la sélection avant l'ouverture. `captureSelection` mémorise la sélection au moment du clic, que `withSavedSelection` rétablit quand une
    // couleur est vraiment choisie.
    if (!btn) return;
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('mousedown', (event) => {
      event.preventDefault();
      captureSelection();
      if (openDropdownPanel === panel) { closeDropdownPanel(); return; }
      closeDropdownPanel();
      panel.show(btn);
      openDropdownPanel = panel;
      openDropdownButton = btn;
      btn.setAttribute('aria-expanded', 'true');
    });
  }
  function groupOf(target) { return target.closest && target.closest('.v2-hover-group'); }
  // Classe d'un groupe dont le menu vient d'être refermé par un clic de souris sur son bouton (plus bas) : css/editor-v2.css le garde fermé, souris dessus.
  const CLOSED_BY_CLICK = 'v2-hover-closed';
  // Posée avec la précédente quand la souris n'était PAS sur le groupe à la fermeture (Échap, un choix au clavier) : la fermeture ne vaut que pour le clavier, la prochaine entrée de la souris rouvre le menu.
  const CLOSED_AWAY = 'v2-hover-closed-away';
  // Une vraie entrée ou sortie du groupe : ignore un simple passage entre deux de ses descendants (relatedTarget encore ou déjà dans le groupe).
  function realCrossing(event, group) { return !event.relatedTarget || !group.contains(event.relatedTarget); }
  function positionFlyout(group, opening) {
    // positionFlyout : même principe que positionPopup() de TemplateTreeSelect (js/template-tree-select.js). Un flyout `.v2-hover-flyout`
    // (position:absolute; top:100%; left:0, CSS) suppose une barre d'outils toujours à peu près à la même hauteur et largeur, ce qui est faux dans un
    // petit panneau Grist : le mode email (avec Cci déplié) ajoute deux lignes au-dessus de la barre (#v2-email-fields-row), qui finit alors à 311-387
    // px selon la taille, et aucune constante CSS ne suit toutes ces variantes. La position est donc calculée depuis celle du groupe à chaque ouverture
    // (délégation déjà en place pour tous les groupes, y compris ceux créés après coup, ex. #v2-hf-pagenum-group) ; entre deux ouvertures le flyout est
    // en display:none (cf. le commentaire CSS de .v2-hover-flyout), ce qui rend inutile une correction proactive (redimensionnement, bascule email) :
    // un flyout en display:none se mesure à zéro.
    // La correction horizontale (left) s'applique à tous les flyouts : un left ne change que leur position, jamais le clipping de leur contenu. Le
    // max-height et le scrollTop ne touchent que .v2-hover-flyout-scrollable (#v2-heading-flyout) et, chez GFS, un menu que sa barre posée en bas
    // empêcherait de tenir (.v2-hover-flyout-capped, qui défile alors aussi) : un max-height sur un flyout resté en
    // overflow:visible ne ferait que rétrécir sa boîte, son contenu continuerait de déborder par-dessus, hors de la boîte. scrollTop est remis à 0 à
    // chaque ouverture : sans cela, le défilement interne mémorisé à la fermeture rouvrirait le menu sur une portion qui cache « Normal » et « Titre
    // 1 » (comportement de Chromium, déjà rencontré avec TemplateTreeSelect). Il n'est remis à 0 qu'à l'ouverture, jamais pendant que le menu est
    // ouvert : dans un panneau de 400 px les boutons de numérotation sont sous le pli, la personne fait défiler le menu puis clique, et le focus que
    // son appui donne au bouton (focusin, plus bas) rappelle cette fonction, menu déjà ouvert ; remonté à ce moment-là, le menu éloignait le bouton
    // avant le relâchement et le clic était perdu.
    const flyout = group.querySelector(':scope > .v2-hover-flyout');
    if (!flyout) return;
    // À l'ouverture seulement (js/layers.js) : le menu passe au-dessus de l'existant, barre flottante de tableau ou autre menu. Le navigateur renvoie
    // un `mouseover` au groupe déjà ouvert dès que l'icône de son bouton est redessinée sous une souris au repos (l'alignement, à chaque frappe) : il
    // ne doit pas repasser devant la liste # ouverte après lui.
    if (opening) Layers.raise(flyout);
    const scrollable = flyout.classList.contains('v2-hover-flyout-scrollable');
    // Lu avant de vider max-height : la mise en page forcée plus bas ramène scrollTop à 0 dès que la boîte, sans max-height, n'a plus rien à défiler.
    const keptScroll = flyout.scrollTop;
    // Le recalage part de zéro à chaque appel (ouverture, focus d'une ligne, barre de GFS qui change menu ouvert) : ce que le passage d'avant a posé est
    // rendu avant de mesurer.
    flyout.style.left = '';
    group.style.removeProperty('--v2-flyout-gap');
    flyout.classList.remove('v2-hover-flyout-capped');
    if (!scrollable) flyout.style.maxHeight = '';
    const overflowRight = flyout.getBoundingClientRect().right - (window.innerWidth - 8);
    if (overflowRight > 0) flyout.style.left = (-overflowRight) + 'px';
    // La barre de GFS (js/gfs-bar.js, consigne GFS 025) passe par-dessus le cadre : le menu ne s'ouvre pas sous elle. Tout se lit de sa zone, aucun chiffre ici.
    // À sa droite ou à sa gauche, le menu glisse de côté sans quitter le dessous de son bouton (le pont de survol déborde de 8 px de chaque côté du groupe :
    // au-delà, le pointeur n'irait plus du bouton au menu sans perdre le survol) ; sous une barre en haut, il s'ouvre plus bas du même écart, que le pont
    // reprend aussi ; au-dessus d'une barre en bas, il défile dans la place qui reste, comme le menu « Titre ». Sans barre, ou hors de sa zone : rien de tout cela.
    const groupRect = group.getBoundingClientRect();
    let rect = flyout.getBoundingClientRect();
    let room = GfsBar.limits(rect);
    // Deux passes au plus : la mise en page arrondit au 64e de pixel, un reste de cet ordre se rattrape à la seconde.
    for (let pass = 0; pass < 2; pass += 1) {
      let slide = 0;
      if (rect.left < room.left) slide = Math.ceil(Math.min(room.left - rect.left, groupRect.right + 8 - rect.left));
      else if (rect.right > room.right) slide = -Math.ceil(Math.min(rect.right - room.right, rect.right - groupRect.left + 8));
      if (!slide) break;
      flyout.style.left = ((parseFloat(flyout.style.left) || 0) + slide) + 'px';
      rect = flyout.getBoundingClientRect();
      room = GfsBar.limits(rect);
    }
    const gap = parseFloat(getComputedStyle(group).getPropertyValue('--v2-flyout-gap')) || 0;
    let dropped = 0;
    if (room.top > 0 && rect.top < room.top) {
      dropped = Math.ceil(room.top - rect.top);
      group.style.setProperty('--v2-flyout-gap', (gap + dropped) + 'px');
      rect = flyout.getBoundingClientRect();
    }
    // Le menu qui sortirait du cadre ou entrerait dans la zone d'une barre en bas défile : ce que la barre en haut fait passer à la ligne d'en dessous (le vide de la barre
    // d'outils) ouvre ses menus plus bas. Sans barre, les menus restent ce qu'ils étaient.
    const cappedByBar = !scrollable && GfsBar.edge() !== null && rect.bottom > Math.min(window.innerHeight, room.bottom - 4);
    if (!scrollable && !cappedByBar) return;
    if (cappedByBar) flyout.classList.add('v2-hover-flyout-capped');
    flyout.style.maxHeight = '';
    // -10 : max-height cible la boîte de contenu du flyout (bordure 1px + padding 4px de chaque côté,
    // css/editor-v2.css), pas border-box - même piège que positionPopup(). Le bas : 12 px avant celui du cadre, 4 px avant la zone de la barre ; `dropped`, l'écart
    // dont la barre en haut a descendu le menu, est pris sur sa hauteur.
    const available = Math.min(window.innerHeight - 12, room.bottom - 4 - gap) - groupRect.bottom - 10 - dropped;
    flyout.style.maxHeight = Math.max(60, available) + 'px';
    flyout.scrollTop = opening ? 0 : keptScroll;
  }
  function setGroupExpanded(group, expanded) {
    // Un bouton qui ouvre un `.v2-hover-flyout` au survol (css/editor-v2.css, `.v2-hover-group:hover .v2-hover-flyout`) afficherait aussi sa propre
    // info-bulle [data-tip] (css/toolbar-v2.css) : les deux apparaîtraient sous le bouton et se chevaucheraient. Mécanisme commun plutôt qu'un
    // correctif par bouton : aria-expanded="true"/"false" est posé sur le déclencheur du `.v2-hover-group` pendant que son flyout est visible, et la
    // même règle CSS ([data-tip][aria-expanded="true"]::after) masque alors l'info-bulle, comme pour wireDropdownButton, closeDropdownPanel et
    // TemplateTreeSelect.
    // Par délégation sur document (comme mousedown plus haut) plutôt qu'en balayant les .v2-hover-group au chargement : un groupe créé après ce script
    // (ex. #v2-hf-pagenum-group, injecté à la demande par ensureHfPill(), js/header-footer-preview.js) a le même défaut et doit être couvert sans
    // qu'aucun autre fichier rappelle une fonction de câblage ici.
    // mouseover/mouseout (pas mouseenter/mouseleave, qui ne remontent pas et ne se délèguent donc pas sur document), avec vérification de relatedTarget
    // : c'est l'émulation usuelle d'une vraie entrée ou sortie du groupe (un simple passage entre deux de ses descendants est ignoré). focusin/focusout
    // remontent nativement. Ce sont de vrais évènements DOM, jamais les pseudo-classes :hover/:focus-within qui pilotent déjà l'ouverture du flyout :
    // dispatchEvent() ne peut pas déclencher :hover dans le banc de test (openFlyout, dev-tests/helpers.js), et un mécanisme fondé sur :hover seul n'y
    // serait pas vérifiable.
    const trigger = group.querySelector(':scope > button');
    if (!trigger) return;
    // Un menu refermé par un clic de souris le reste, souris dessus : un mouseover venu d'ailleurs (l'icône du bouton redessinée sous une souris au repos)
    // ne le rouvre pas, et aria-expanded dit ce que la personne voit.
    const open = expanded && !group.classList.contains(CLOSED_BY_CLICK);
    if (open) { trigger.setAttribute('aria-haspopup', 'true'); positionFlyout(group, trigger.getAttribute('aria-expanded') !== 'true'); }
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  document.addEventListener('mouseover', (event) => {
    const group = groupOf(event.target);
    if (!group || !realCrossing(event, group)) return;
    if (group.classList.contains(CLOSED_AWAY)) group.classList.remove(CLOSED_BY_CLICK, CLOSED_AWAY);
    setGroupExpanded(group, true);
  });
  document.addEventListener('mouseout', (event) => {
    const group = groupOf(event.target);
    if (group && realCrossing(event, group)) setGroupExpanded(group, false);
  });
  document.addEventListener('focusin', (event) => {
    const group = groupOf(event.target);
    if (!group) return;
    group.classList.remove(CLOSED_BY_CLICK, CLOSED_AWAY); // le clavier retrouve toujours son menu
    setGroupExpanded(group, true);
  });
  document.addEventListener('focusout', (event) => {
    const group = groupOf(event.target);
    if (group && realCrossing(event, group)) setGroupExpanded(group, false);
  });
  // La barre de GFS qui change pendant qu'un menu est ouvert (au clavier, le focus le garde ouvert ; à la souris, la personne a quitté le cadre pour l'atteindre) :
  // il se recale sur la nouvelle zone, sans toucher au défilement de son contenu. Une fois tout de suite, une fois à l'image suivante : la barre d'outils peut encore
  // y déplacer le bouton du menu (js/toolbar-gap.js, retour à la ligne), et le menu suit son bouton.
  function repositionOpenFlyouts() {
    document.querySelectorAll('.v2-hover-group > button[aria-expanded="true"]').forEach(trigger => positionFlyout(trigger.parentElement, false));
  }
  GfsBar.onChange(() => { repositionOpenFlyouts(); requestAnimationFrame(repositionOpenFlyouts); });
  function menuTriggerOf(target) {
    // Un clic de souris sur le bouton d'un menu au survol ne lui donne pas le focus : le menu s'ouvre et se referme avec le survol, le focus est pour
    // le clavier. Sinon le bouton cliqué le garde, son menu avec lui (:focus-within, css/editor-v2.css), et le curseur quitte le texte en cours : rien
    // ne se tape plus tant qu'on n'a pas recliqué dans l'éditeur. Tab, Entrée et Espace ne changent pas.
    // Un champ de saisie qui avait le focus (nom du modèle en renommage, nom du PDF, objet de l'email...) le perd à ce clic et se valide à la perte du
    // focus : il le perd donc au clic, avant le gestionnaire du bouton (phase de capture), et non à l'appui. Le nom validé peut être plus large, la
    // barre se redessine et le bouton quitterait la souris avant le relâchement : le clic serait perdu. Seul l'éditeur garde son focus. Mécanisme
    // commun, par délégation, pour la même raison que ci-dessus : tout groupe à menu, y compris créé après ce script, en hérite.
    const group = groupOf(target);
    const trigger = group && group.querySelector(':scope > button');
    return trigger && trigger.contains(target) ? trigger : null;
  }
  // Le champ de saisie, autre que l'éditeur du document, qui a le focus : un <input>, un <textarea> ou un <select> de la page, ou un champ texte à
  // bulles (js/field-editor.js, un éditeur lui aussi, mais dont la saisie se valide à la perte du focus comme celle d'un <input>). Un clic sur un menu
  // ou sur une ligne de menu le lui retire (ici, js/main.js:wireSaveMenu et js/orientation-toggle.js:wireRow).
  function isFormFieldFocus(active) {
    if (!active || active === document.body) return false;
    if (active.closest('.pp-field-editor')) return true;
    return !active.closest('.ProseMirror') && active.matches('input, textarea, select');
  }
  document.addEventListener('mousedown', (event) => { if (menuTriggerOf(event.target)) event.preventDefault(); });
  document.addEventListener('click', (event) => {
    if (!menuTriggerOf(event.target)) return;
    const active = document.activeElement;
    if (isFormFieldFocus(active)) active.blur();
  }, true);
  // Un groupe marqué `data-close-on-click` (Enregistrer, « + », « Mode lecture », « Type d'export ») referme son menu au clic de la souris sur son bouton et le
  // garde fermé, souris encore dessus, jusqu'à ce qu'elle sorte du groupe : le clic est le geste, et le menu resté ouvert sous la souris recouvrait ce qu'on vise
  // juste après (« À » et la fin d'« Objet » d'un email, à 700×400, pour Enregistrer), où le clic suivant tombait sur une de ses lignes (« Historique des
  // versions… »). Une sortie puis un retour de la souris le rouvrent comme avant. Ni le clavier (Entrée et Espace : `detail` à 0, et le focus rend toujours son
  // menu au groupe, plus haut) ni le doigt (le survol y colle : le menu y reste atteignable) ne sont touchés. Marque par groupe, pas pour tous : les autres menus
  // (« Exporter », « Titre », l'alignement, les listes) gardent leur comportement.
  document.addEventListener('click', (event) => {
    if (!event.detail || event.pointerType === 'touch' || event.pointerType === 'pen') return;
    const trigger = menuTriggerOf(event.target);
    const group = trigger && groupOf(trigger);
    if (!group || !group.hasAttribute('data-close-on-click')) return;
    closeHoverMenu(group, true);
  });
  // Referme le menu d'un groupe au survol et le garde fermé, souris encore dessus, jusqu'à ce qu'elle sorte du groupe : le geste de la souris est fait (un clic sur le bouton d'un groupe marqué
  // `data-close-on-click`, ou le choix d'une ligne du menu « Objets », js/objects-menu.js), le menu resté ouvert recouvrirait ce qu'on vise ensuite. Le clavier lui rend toujours son menu (`focusin`).
  // Fermé au clavier (Échap sur le menu « Objets », une ligne choisie par Entrée) la souris étant ailleurs, il n'y a pas de sortie à attendre : sans cela le premier survol qui suivrait ne
  // l'ouvrirait pas (`mouseleave` ne vient qu'après être entré) ; c'est la prochaine entrée de la souris qui rouvre le menu (plus haut, `mouseover`).
  // `mouseIsOver` : la souris est sur le groupe (le clic ci-dessus vient d'elle) ; absent, il se lit sur le groupe (`:hover`), le choix d'une ligne de « Objets » pouvant venir du clavier.
  function closeHoverMenu(group, mouseIsOver) {
    if (group.classList.contains(CLOSED_BY_CLICK)) return;
    group.classList.add(CLOSED_BY_CLICK);
    if (mouseIsOver === undefined ? group.matches(':hover') : mouseIsOver) group.addEventListener('mouseleave', () => group.classList.remove(CLOSED_BY_CLICK), { once: true });
    else group.classList.add(CLOSED_AWAY);
    setGroupExpanded(group, false);
  }
  function setColorBar(id, color) {
    const el = document.getElementById(id);
    if (el) el.style.background = color || 'transparent';
  }
  function setColorIcon(id, color) {
    const el = document.getElementById(id);
    if (el) el.style.color = color || '';
  }

  // Une sélection de cases (CellSelection de prosemirror-tables) se reconnaît à `forEachCell` et à sa case d'ancrage, sans importer la classe : même
  // convention que setCellsBackground de js/floating-toolbars.js. Ses deux cases d'angle suffisent à la refaire ; son `from` / `to` n'est que le
  // texte de la case de tête.
  function isCellSelection(selection) { return !!selection && typeof selection.forEachCell === 'function' && !!selection.$anchorCell; }
  const cellEnds = selection => ({ anchorCell: selection.$anchorCell.pos, headCell: selection.$headCell.pos });

  function createSelectionPreserver() {
    // Un menu ou panneau flottant vole le focus au clic : sans mémoriser la sélection avant de l'ouvrir, `editor.chain().focus()` retomberait sur la
    // position du curseur, pas sur la sélection visée. Une sélection de cases est mémorisée par ses deux cases d'angle : rétablie en simple texte, elle
    // ne mettrait en forme que la case de tête (police, taille, couleur, surlignage) et éteindrait la sélection de cases.
    let savedSelection = null;
    const captureSelection = () => {
      const { selection } = editor.state;
      savedSelection = { from: selection.from, to: selection.to, cells: isCellSelection(selection) ? cellEnds(selection) : null };
    };
    const withSavedSelection = (fn) => {
      const chain = editor.chain().focus();
      if (savedSelection) chain.command(({ commands }) => restoreSelection(commands, savedSelection));
      fn(chain);
      chain.run();
    };
    return { captureSelection, withSavedSelection };
  }
  function restoreSelection(commands, saved) {
    // Les cases ont pu disparaître depuis (document remplacé) : le texte de la case de tête reprend alors la place de la sélection de cases.
    if (saved.cells) { try { return commands.setCellSelection(saved.cells); } catch (e) { /* repli ci-dessous */ } }
    return commands.setTextSelection({ from: saved.from, to: saved.to });
  }

  function cellTextRange(node, pos) {
    // Plage de texte d'une case (de son premier à son dernier bloc de texte), `pos` étant la position avant la case ; null pour une case sans bloc de
    // texte.
    let from = null, to = null;
    node.descendants((child, offset) => {
      if (!child.isTextblock) return true;
      const start = pos + 1 + offset;
      if (from === null) from = start + 1;
      to = start + child.nodeSize - 1;
      return false;
    });
    return from === null ? null : { from, to };
  }

  function runOnSelectedCells(ordinary, perCell) {
    // Une commande de bloc (liste...) se calcule sur le bloc commun à `$from.blockRange($to)`, qui pour une sélection de cases est celui de la seule
    // case de tête : le gras, l'italique ou l'alignement, eux, parcourent les `ranges` de la sélection. Ici la commande est rejouée dans chaque case,
    // de la dernière à la première (envelopper le contenu d'une case décale tout ce qui la suit), en une seule transaction (un seul Annuler) : pour
    // chaque case, son texte devient la sélection puis `perCell(chain)` ajoute ses commandes à la chaîne, avant que la sélection de cases soit
    // rétablie. Chaque commande de la chaîne s'exécute tout de suite, sur l'état que la case précédente a laissé : une seconde commande ou une
    // condition qui dépend de la première (poser une liste, puis régler son style) est donc une commande de plus dans la chaîne
    // (`chain.command(({ state, commands }) => ...)`), pas la suite d'un même rappel, qui lirait encore l'état d'avant. Hors sélection de cases,
    // `ordinary()` fait ce qu'on faisait sans cases sélectionnées.
    const selection = editor.state.selection;
    if (!isCellSelection(selection)) return ordinary();
    const chain = editor.chain().focus();
    selectedCells(selection).reverse().forEach(({ node, pos }) => {
      const range = cellTextRange(node, pos);
      if (!range) return;
      chain.setTextSelection(range);
      perCell(chain);
    });
    return keepCellSelection(chain, cellEnds(selection)).run();
  }
  function selectedCells(selection) {
    // Les cases d'une sélection de cases, dans l'ordre du document : { node, pos }, `pos` étant la position avant la case.
    const cells = [];
    selection.forEachCell((node, pos) => cells.push({ node, pos }));
    return cells.sort((a, b) => a.pos - b.pos);
  }
  function keepCellSelection(chain, ends) {
    // Dernière commande d'une chaîne qui a déplacé le curseur de case en case : les deux cases d'angle, suivies à travers les changements, redeviennent
    // la sélection de cases.
    return chain.command(({ tr, commands }) => commands.setCellSelection({ anchorCell: tr.mapping.map(ends.anchorCell, -1), headCell: tr.mapping.map(ends.headCell, -1) }));
  }
  function isInsideNode($pos, typeName) {
    // Le curseur est-il dans un nœud de ce type ? (une liste, une citation...) - lu sur l'état d'une commande en chaîne, qui voit les cases déjà
    // traitées.
    for (let depth = $pos.depth; depth > 0; depth--) if ($pos.node(depth).type.name === typeName) return true;
    return false;
  }
  function toggleList(name, command) {
    // Pose la liste `name` (bulletList, orderedList...) avec la commande `command` de TipTap, ou la retire : ce que font le bouton « Liste à puces » et
    // les touches Ctrl+Maj+8 et Ctrl+Maj+7 (js/shortcuts.js). Sur une sélection de cases, dans toutes les cases, l'état voulu étant l'inverse de celui
    // que montre la case de tête : enfoncé, un appui retire la liste de chaque case, sinon il la pose dans chacune. Hors sélection de cases, c'est la
    // bascule de TipTap.
    const wanted = !editor.isActive(name);
    return runOnSelectedCells(
      () => editor.chain().focus()[command]().run(),
      chain => chain.command(({ state, commands }) => { if (isInsideNode(state.selection.$from, name) !== wanted) commands[command](); return true; }));
  }

  // Citation et retrait sur une sélection de cases : `toggleBlockquote`, `sinkListItem` et `liftListItem` partent de `$from.blockRange($to)`, donc de
  // la seule case de tête, et les boutons du retrait se grisent (`can()` faux : le début d'une sélection de cases est avant la liste, pas dedans).
  // Ici chaque case est traitée pour elle-même.

  const hasQuote = cell => { let found = false; cell.forEach(child => { if (child.type.name === 'blockquote') found = true; }); return found; };
  function isQuotedCell(cell) {
    // Une case « en citation » : tout ce qu'elle contient est dans une citation (c'est ce que fait le bouton : il entoure le contenu entier de la
    // case). Le bouton la montre enfoncée pour la case de tête d'une sélection de cases.
    let quoted = cell.childCount > 0;
    cell.forEach(child => { if (child.type.name !== 'blockquote') quoted = false; });
    return quoted;
  }
  function isQuoteActive() {
    const selection = editor.state.selection;
    return isCellSelection(selection) ? isQuotedCell(selection.$headCell.nodeAfter) : editor.isActive('blockquote');
  }
  function unquoteCell(tr, pos) {
    // Sort de leur citation les blocs d'une case (d'un niveau), de la dernière citation à la première : les positions des précédentes restent valables.
    const quotes = [];
    tr.doc.nodeAt(pos).forEach((child, offset) => { if (child.type.name === 'blockquote') quotes.push({ child, at: pos + 1 + offset }); });
    quotes.reverse().forEach(({ child, at }) => {
      const range = tr.doc.resolve(at + 1).blockRange(tr.doc.resolve(at + 1 + child.content.size));
      if (range) tr.lift(range, tr.doc.resolve(at).depth);
    });
  }
  function quoteCell(tr, pos) {
    // Entoure le contenu entier d'une case d'une seule citation (le `blockRange` du contenu de la case).
    const quote = tr.doc.type.schema.nodes.blockquote;
    const cell = tr.doc.nodeAt(pos);
    const range = tr.doc.resolve(pos + 1).blockRange(tr.doc.resolve(pos + 1 + cell.content.size));
    if (range && quote.validContent(cell.content)) tr.wrap(range, [{ type: quote }]);
  }
  function quoteSelectedCells(wanted) {
    // Met chaque case de la sélection en citation (`wanted` vrai : celles qui ne le sont pas encore, une citation partielle est d'abord défaite pour
    // qu'il n'y en ait qu'une) ou l'en sort (faux), en une seule transaction (un seul Annuler) ; la sélection de cases suit d'elle-même (les cases ne
    // bougent pas, leur contenu seul change). Faux si ce n'est pas une sélection de cases.
    const selection = editor.state.selection;
    if (!isCellSelection(selection)) return false;
    const cells = selectedCells(selection).reverse();
    editor.chain().focus().command(({ tr }) => {
      cells.forEach(({ node, pos }) => {
        if (wanted ? isQuotedCell(node) : !hasQuote(node)) return;
        unquoteCell(tr, pos);
        if (wanted) quoteCell(tr, pos);
      });
      return true;
    }).run();
    return true;
  }

  function listRangesInCells(cells, direction) {
    // Les listes de plus haut niveau (à puces ou numérotées) des cases, une plage de texte chacune, dans l'ordre du document : ce que le retrait décale
    // d'un niveau, leurs sous-listes suivent leur élément. Le retrait va du deuxième élément au dernier (le premier n'a aucun frère avant lui où
    // s'emboîter, comme dans une case seule : une liste d'un seul élément n'a rien à décaler) ; le retrait inverse prend la liste entière, qui sort de
    // la liste (ses éléments deviennent des paragraphes, ses sous-listes d'un niveau de moins).
    const ranges = [];
    cells.forEach(({ node, pos }) => {
      node.descendants((child, offset) => {
        if (child.type.name !== 'bulletList' && child.type.name !== 'orderedList') return true;
        const items = [];
        child.forEach((item, itemOffset) => { if (item.type.name === 'listItem') items.push({ item, pos: pos + 1 + offset + 1 + itemOffset }); });
        const first = items[direction === 'in' ? 1 : 0], last = items[items.length - 1];
        const from = first && cellTextRange(first.item, first.pos), to = last && cellTextRange(last.item, last.pos);
        if (from && to) ranges.push({ from: from.from, to: to.to });
        return false;
      });
    });
    return ranges;
  }
  function canShiftListsInSelectedCells(direction) {
    // Le bouton de retrait (`direction` 'in') ou de retrait inverse ('out') a-t-il quelque chose à faire dans la sélection de cases ? (sinon il reste
    // grisé)
    const selection = editor.state.selection;
    return isCellSelection(selection) && listRangesInCells(selectedCells(selection), direction).length > 0;
  }
  function shiftListsInSelectedCells(direction) {
    // Décale chaque liste des cases sélectionnées : une commande par liste, de la dernière à la première (les positions des précédentes ne bougent
    // pas), la plage de la liste étant le texte sélectionné comme le ferait la souris dans une case seule. Faux si ce n'est pas une sélection de cases.
    const selection = editor.state.selection;
    if (!isCellSelection(selection)) return false;
    const command = direction === 'in' ? 'sinkListItem' : 'liftListItem';
    const chain = editor.chain().focus();
    listRangesInCells(selectedCells(selection), direction).reverse().forEach(range => chain.setTextSelection(range)[command]('listItem'));
    keepCellSelection(chain, cellEnds(selection)).run();
    return true;
  }

  return {
    setEditor, getEditor, focusEditor, setFloatingUi, setNodeSelectionClass, getTextSelectionClass, setTextSelectionClass,
    patchNodeAndReselect, editorContentWidthPx, pageScale, atPageScale, layoutZoom, contentZoom, settleContentZoom, createStepSheets, nextInFlow, gapAbove, opensPageAt, fitReserve, createFloatingPanel,
    registerFloatingPanel, hideFloatingContextToolbars, isFormFieldFocus, closeHoverMenu,
    getOpenDropdownPanel, setOpenDropdownPanel, closeDropdownPanel, wireDropdownButton,
    setColorBar, setColorIcon, createSelectionPreserver, isCellSelection, runOnSelectedCells, isInsideNode,
    toggleList, isQuoteActive, quoteSelectedCells, canShiftListsInSelectedCells, shiftListsInSelectedCells,
  };
})();
