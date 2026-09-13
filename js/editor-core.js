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
  function editorContentWidthPx(currentEditor) {
    const rootEl = currentEditor.view.dom;
    const rootCs = getComputedStyle(rootEl);
    return rootEl.clientWidth - (parseFloat(rootCs.paddingLeft) || 0) - (parseFloat(rootCs.paddingRight) || 0);
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
      show(referenceEl) {
        el.classList.add('visible');
        const update = () => {
          floatingUi.computePosition(referenceEl, el, {
            placement: 'top',
            middleware: [floatingUi.offset(8), floatingUi.flip(), floatingUi.shift({ padding: 8 })],
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
  function getOpenDropdownPanel() { return openDropdownPanel; }
  function setOpenDropdownPanel(panel) { openDropdownPanel = panel; }
  document.addEventListener('mousedown', (event) => {
    if (!openDropdownPanel) return;
    if (event.target.closest('.v2-color-dropdown') || event.target.closest('.v2-color-split')
      || event.target.closest('.v2-format-panel') || event.target.closest('.v2-format-chip')
      || event.target.closest('.v2-stepper') || event.target.closest('.v2-fill-chip')) return;
    openDropdownPanel.hide();
    openDropdownPanel = null;
  });
  function closeDropdownPanel() { if (openDropdownPanel) { openDropdownPanel.hide(); openDropdownPanel = null; } }
  // Ouvre/ferme `panel` au clic sur `btn` - mousedown+preventDefault (pas click), comme la toolbar tableau/image, pour ne pas perdre la sélection avant
  // l'ouverture. `getSelection` capture la sélection AU MOMENT du clic, restaurée par `withSavedSelection` quand une couleur est vraiment choisie.
  function wireDropdownButton(btn, panel, captureSelection) {
    if (!btn) return;
    btn.addEventListener('mousedown', (event) => {
      event.preventDefault();
      captureSelection();
      if (openDropdownPanel === panel) { closeDropdownPanel(); return; }
      closeDropdownPanel();
      panel.show(btn);
      openDropdownPanel = panel;
    });
  }
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
