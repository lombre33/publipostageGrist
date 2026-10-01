// Boîte à outils bas niveau partagée par editor-nodes.js/header-footer-preview.js/floating-toolbars.js/main-toolbar.js/editor.js - extrait de editor.js
// (découpage 2026) pour les quelques utilitaires utilisés par 2+ de ces fichiers sans propriétaire naturel unique (patchNodeAndReselect, le kit de
// panneaux flottants, createSelectionPreserver). Aucune logique métier propre : que des primitives. Script classique (pas type="module"), même convention
// de partage de portée globale que GristAPI/Editor/Variables.
const EditorCore = (function () {
  let editor = null;
  let floatingUi = null;
  let NodeSelectionClass = null;
  let TextSelectionClass = null;
  function setEditor(ed) { editor = ed; }
  function getEditor() { return editor; }
  function setFloatingUi(lib) { floatingUi = lib; }
  function setNodeSelectionClass(cls) { NodeSelectionClass = cls; }
  function getTextSelectionClass() { return TextSelectionClass; }
  function setTextSelectionClass(cls) { TextSelectionClass = cls; }

  // Partagé par updateAttrs/updateSelectedImage/updateSelectedBadge : setNodeMarkup() remplace le nœud, donc la NodeSelection doit être recréée
  // explicitement dessus (sinon retombe en curseur texte).
  function patchNodeAndReselect(ed, pos, newAttrs) {
    const { state, view } = ed;
    const tr = state.tr.setNodeMarkup(pos, undefined, newAttrs);
    if (NodeSelectionClass) tr.setSelection(NodeSelectionClass.create(tr.doc, pos));
    view.dispatch(tr);
  }

  // clientWidth inclut SON PROPRE padding (marge de page en Aperçu A4) ; partagé entre clampOverflowingTables et l'alignement des images en calque.
  // Jamais négative : un éditeur masqué (Lecture, macro-modèle) a un clientWidth de 0 mais garde son padding calculé, la soustraction rendait donc une
  // largeur négative que clampOverflowingTables prenait pour une vraie mesure et ramenait toutes les colonnes d'un tableau à 25 px. 0 veut dire « pas de
  // mise en page, rien à mesurer ».
  function editorContentWidthPx(currentEditor) {
    const rootEl = currentEditor.view.dom;
    const rootCs = getComputedStyle(rootEl);
    return Math.max(0, rootEl.clientWidth - (parseFloat(rootCs.paddingLeft) || 0) - (parseFloat(rootCs.paddingRight) || 0));
  }

  // Toolbar contextuelle flottante, positionnée par @floating-ui/dom, ancrée dans document.body (évite tout souci de contexte d'empilement avec un ancêtre).
  function createFloatingPanel(className, innerHTML, onAction, onInput) {
    const el = document.createElement('div');
    el.className = className;
    el.innerHTML = innerHTML;
    // mousedown+preventDefault : évite de perdre le focus/la sélection ProseMirror avant que l'action ne s'exécute.
    el.addEventListener('mousedown', (event) => {
      const btn = event.target.closest('button[data-action]');
      if (!btn) return;
      event.preventDefault();
      onAction(btn.dataset.action);
    });
    if (onInput) el.addEventListener('input', (event) => {
      const input = event.target.closest('[data-role]');
      if (input) onInput(input.dataset.role, input.value);
    });
    document.body.appendChild(el);
    let stopAutoUpdate = null;
    return {
      el,
      // `options` (facultatif, valeur ou fonction relue à chaque calcul) : { flip, shift } passés tels quels aux intergiciels de floating-ui - la grille s'en sert pour que
      // la barre ne recouvre pas ses bandeaux (js/grid-editor.js:floatingOptions). Sans lui, rien ne change.
      show(referenceEl, options) {
        el.classList.add('visible');
        const update = () => {
          const opts = (typeof options === 'function' ? options() : options) || {};
          floatingUi.computePosition(referenceEl, el, {
            placement: 'top',
            middleware: [floatingUi.offset(8), floatingUi.flip(opts.flip), floatingUi.shift(Object.assign({ padding: 8 }, opts.shift))],
          }).then(({ x, y }) => { el.style.left = `${x}px`; el.style.top = `${y}px`; });
        };
        if (stopAutoUpdate) stopAutoUpdate();
        stopAutoUpdate = floatingUi.autoUpdate(referenceEl, el, update);
      },
      hide() {
        el.classList.remove('visible');
        if (stopAutoUpdate) { stopAutoUpdate(); stopAutoUpdate = null; }
      },
    };
  }

  // Filet de sécurité : les toolbars contextuelles (tableau/image/variable) ne se ferment normalement que sur un changement réel de sélection ProseMirror -
  // un clic hors de `.tiptap` ET hors `.v2-floating-toolbar` les referme toutes, pour les cas sans évènement ProseMirror (ex. clic sur "Mode lecture").
  const floatingContextPanels = [];
  function registerFloatingPanel(panel) { floatingContextPanels.push(panel); }
  function hideFloatingContextToolbars() { floatingContextPanels.forEach(p => p.hide()); }
  document.addEventListener('mousedown', (event) => {
    if (event.target.closest('.tiptap') || event.target.closest('.v2-floating-toolbar')) return;
    hideFloatingContextToolbars();
  });

  // Un seul menu déroulant à la fois (couleur/police/taille), fermé au clic ailleurs.
  let openDropdownPanel = null;
  let openDropdownButton = null;
  function getOpenDropdownPanel() { return openDropdownPanel; }
  function setOpenDropdownPanel(panel) { openDropdownPanel = panel; }
  document.addEventListener('mousedown', (event) => {
    if (!openDropdownPanel) return;
    if (event.target.closest('.v2-color-dropdown') || event.target.closest('.v2-color-split')
      || event.target.closest('.v2-format-panel') || event.target.closest('.v2-format-chip')
      || event.target.closest('.v2-stepper') || event.target.closest('.v2-fill-chip')) return;
    closeDropdownPanel();
  });
  // aria-expanded posé/retiré sur le bouton déclencheur pendant que son panneau est ouvert - même convention que TemplateTreeSelect
  // (js/template-tree-select.js, trigger.setAttribute('aria-expanded', ...)) et signal générique lu par la règle CSS qui masque l'info-bulle [data-tip]
  // d'un bouton à menu tant que celui-ci est ouvert (css/toolbar-v2.css) - cf. la délégation mouseover/mouseout/focusin/focusout plus bas pour le pendant
  // "survol d'un .v2-hover-group", câblée une fois pour toutes au chargement de ce script, jamais à rappeler depuis un autre fichier.
  function closeDropdownPanel() {
    if (!openDropdownPanel) return;
    openDropdownPanel.hide();
    openDropdownPanel = null;
    if (openDropdownButton) { openDropdownButton.setAttribute('aria-expanded', 'false'); openDropdownButton = null; }
  }
  // Ouvre/ferme `panel` au clic sur `btn` - mousedown+preventDefault (pas click), comme la toolbar tableau/image, pour ne pas perdre la sélection avant
  // l'ouverture. `getSelection` capture la sélection AU MOMENT du clic, restaurée par `withSavedSelection` quand une couleur est vraiment choisie.
  function wireDropdownButton(btn, panel, captureSelection) {
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
  // Bug récurrent (retour Antoine, bouton "image" 2026-09-28 - déjà corrigé une fois au cas par cas pour #v2-btn-quality/#btn-export-pdf en leur retirant
  // purement et simplement data-tip, cf. commentaire .v2-hover-flyout-label dans editor-v2.css) : un bouton qui ouvre un `.v2-hover-flyout` au survol
  // (css/editor-v2.css, `.v2-hover-group:hover .v2-hover-flyout`) affiche AUSSI sa propre info-bulle [data-tip] au survol (css/toolbar-v2.css) - les deux
  // apparaissent juste sous le bouton et se chevauchent. Mécanisme commun plutôt qu'un correctif par bouton : pose aria-expanded="true"/"false" sur le
  // déclencheur du `.v2-hover-group` pendant que son flyout est visible - la même règle CSS ([data-tip][aria-expanded="true"]::after, css/toolbar-v2.css)
  // masque alors son info-bulle, exactement comme pour wireDropdownButton/closeDropdownPanel ci-dessus et TemplateTreeSelect.
  //
  // PAR DÉLÉGATION sur document (mousedown ci-dessus l'est déjà) plutôt qu'un scan ponctuel des .v2-hover-group au chargement : un groupe créé APRÈS ce
  // script - ex. #v2-hf-pagenum-group, injecté à la demande par ensureHfPill() (js/header-footer-preview.js) - a exactement le même bug et doit être
  // couvert sans qu'aucun autre fichier n'ait à rappeler une fonction de câblage ici. Un scan ponctuel avait exactement raté ce cas.
  //
  // mouseover/mouseout (pas mouseenter/mouseleave, qui ne remontent pas et ne peuvent donc pas être délégués sur document) avec vérification de
  // relatedTarget : émulation standard d'une VRAIE entrée/sortie du groupe (ignore un simple passage entre deux de ses descendants). focusin/focusout
  // remontent nativement, la délégation est directe. Que des évènements DOM RÉELS (jamais les pseudo-classes :hover/:focus-within elles-mêmes, qui
  // pilotent déjà l'ouverture du flyout, inchangée) : :hover ne peut pas être déclenché par dispatchEvent() dans le harnais de test automatisé (cf.
  // openFlyout, dev-tests/helpers.js) - un mécanisme basé uniquement sur :hover n'aurait donc jamais été vérifiable par un test exécutable.
  function groupOf(target) { return target.closest && target.closest('.v2-hover-group'); }
  // Une VRAIE entrée/sortie du groupe : ignore un simple passage entre deux de ses propres descendants (relatedTarget encore/déjà dans le groupe).
  function realCrossing(event, group) { return !event.relatedTarget || !group.contains(event.relatedTarget); }
  // positionFlyout : même principe que positionPopup() de TemplateTreeSelect (js/template-tree-select.js)
  // - un flyout `.v2-hover-flyout` (position:absolute; top:100%; left:0, CSS) suppose une barre d'outils
  // toujours à peu près à la même hauteur/largeur, faux dans un petit panneau Grist réel (~700x400) : le
  // mode email (avec Cci déplié) ajoute deux lignes AU-DESSUS de la barre (#v2-email-fields-row), qui finit
  // alors à 311-387px selon la taille (mesure indépendante du coordinateur, 2026-09-28) - aucune constante
  // CSS ne peut suivre toutes ces variantes. Calculé ici depuis la position RÉELLE du groupe à CHAQUE
  // ouverture (délégation déjà en place pour les 8 groupes existants ET tout futur groupe créé après coup,
  // ex. #v2-hf-pagenum-group), display:none entre-temps (cf. commentaire CSS .v2-hover-flyout) rendant une
  // correction proactive (redimensionnement, bascule email) inutile - measurer un flyout display:none donne
  // un rect à zéro, sans intérêt.
  // La correction horizontale (left) s'applique à tous les flyouts - un left ne change que leur position,
  // jamais le clipping de leur contenu. Le max-height/scrollTop ne touchent QUE .v2-hover-flyout-scrollable
  // (aujourd'hui #v2-heading-flyout) : un max-height sur un flyout resté overflow:visible ne fait que
  // rétrécir sa BOÎTE, son contenu continue de déborder par-dessus, visible mais désormais hors d'une boîte
  // trop courte - inutile sur les 7 flyouts qui tiennent déjà naturellement, risque de les rendre moches
  // sans rien régler. scrollTop remis à 0 à chaque ouverture : sans ça, un défilement interne resterait
  // mémorisé à la fermeture (constaté par le coordinateur, comportement Chromium déjà rencontré pour
  // TemplateTreeSelect) et rouvrirait sur une portion du menu qui cache "Normal"/"Titre 1".
  function positionFlyout(group) {
    const flyout = group.querySelector(':scope > .v2-hover-flyout');
    if (!flyout) return;
    flyout.style.left = '';
    const overflowRight = flyout.getBoundingClientRect().right - (window.innerWidth - 8);
    if (overflowRight > 0) flyout.style.left = (-overflowRight) + 'px';
    if (!flyout.classList.contains('v2-hover-flyout-scrollable')) return;
    flyout.style.maxHeight = '';
    // -10 : max-height cible la boîte de contenu du flyout (bordure 1px + padding 4px de chaque côté,
    // css/editor-v2.css), pas border-box - même piège que positionPopup().
    const available = window.innerHeight - group.getBoundingClientRect().bottom - 12 - 10;
    flyout.style.maxHeight = Math.max(60, available) + 'px';
    flyout.scrollTop = 0;
  }
  function setGroupExpanded(group, expanded) {
    const trigger = group.querySelector(':scope > button');
    if (!trigger) return;
    if (expanded) { trigger.setAttribute('aria-haspopup', 'true'); positionFlyout(group); }
    trigger.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  }
  document.addEventListener('mouseover', (event) => {
    const group = groupOf(event.target);
    if (group && realCrossing(event, group)) setGroupExpanded(group, true);
  });
  document.addEventListener('mouseout', (event) => {
    const group = groupOf(event.target);
    if (group && realCrossing(event, group)) setGroupExpanded(group, false);
  });
  document.addEventListener('focusin', (event) => {
    const group = groupOf(event.target);
    if (group) setGroupExpanded(group, true);
  });
  document.addEventListener('focusout', (event) => {
    const group = groupOf(event.target);
    if (group && realCrossing(event, group)) setGroupExpanded(group, false);
  });
  function setColorBar(id, color) {
    const el = document.getElementById(id);
    if (el) el.style.background = color || 'transparent';
  }
  function setColorIcon(id, color) {
    const el = document.getElementById(id);
    if (el) el.style.color = color || '';
  }

  // Un menu/panneau flottant vole le focus au clic - sans mémoriser la sélection avant de l'ouvrir, `editor.chain().focus()` retomberait sur la position du
  // curseur, pas la sélection réellement visée par l'utilisateur.
  function createSelectionPreserver() {
    let savedSelection = null;
    const captureSelection = () => { const { from, to } = editor.state.selection; savedSelection = { from, to }; };
    const withSavedSelection = (fn) => {
      const chain = editor.chain().focus();
      if (savedSelection) chain.setTextSelection(savedSelection);
      fn(chain);
      chain.run();
    };
    return { captureSelection, withSavedSelection };
  }

  return {
    setEditor, getEditor, setFloatingUi, setNodeSelectionClass, getTextSelectionClass, setTextSelectionClass,
    patchNodeAndReselect, editorContentWidthPx, createFloatingPanel,
    registerFloatingPanel, hideFloatingContextToolbars,
    getOpenDropdownPanel, setOpenDropdownPanel, closeDropdownPanel, wireDropdownButton,
    setColorBar, setColorIcon, createSelectionPreserver,
  };
})();
