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

  function editorContentWidthPx(currentEditor) {
    // clientWidth inclut son propre padding (la marge de page de l'Aperçu A4) ; partagé entre clampOverflowingTables et l'alignement des images en
    // calque. Jamais négative : un éditeur masqué (Lecture, macro-modèle) a un clientWidth de 0 mais garde son padding calculé, et la soustraction
    // donnerait une largeur négative que clampOverflowingTables prendrait pour une vraie mesure, ramenant toutes les colonnes d'un tableau à 25 px. 0
    // veut dire « pas de mise en page, rien à mesurer ».
    const rootEl = currentEditor.view.dom;
    const rootCs = getComputedStyle(rootEl);
    return Math.max(0, rootEl.clientWidth - (parseFloat(rootCs.paddingLeft) || 0) - (parseFloat(rootCs.paddingRight) || 0));
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

  function createStepSheets(anchor, className) {
    // Règles posées une à une pendant le calcul d'une pagination (js/header-footer-preview.js, js/reader-mode.js) : la coupure suivante mesure le
    // document avec les réserves déjà posées, donc chaque règle agit avant la mesure d'après. Réécrire la feuille entière à chaque coupure refait le
    // style de tout le document (86 ms par page pour un tableau de 1 000 lignes : un calcul quadratique en nombre de pages) alors qu'une feuille
    // ajoutée n'invalide que ce qu'elle vise (8 ms). Chaque règle va donc dans sa feuille <style>, posée à la suite de `anchor` et des précédentes :
    // même ordre, même cascade que dans la feuille unique, que l'appelant remplit d'un coup à la fin du calcul avant `clear()`. `className` est repris
    // par chaque feuille posée.
    const sheets = [];
    return {
      add(rule) {
        const sheet = document.createElement('style');
        if (className) sheet.className = className;
        sheet.textContent = rule;
        (sheets.length ? sheets[sheets.length - 1] : anchor).after(sheet);
        sheets.push(sheet);
      },
      clear() {
        sheets.forEach(sheet => sheet.remove());
        sheets.length = 0;
      },
    };
  }

  // Barre contextuelle flottante, positionnée par @floating-ui/dom et ancrée dans document.body (aucun contexte d'empilement d'un ancêtre ne la
  // gêne).
  function createFloatingPanel(className, innerHTML, onAction, onInput) {
    const el = document.createElement('div');
    el.className = className;
    el.innerHTML = innerHTML;
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
        if (stopAutoUpdate) { stopAutoUpdate(); stopAutoUpdate = null; }
        if (el.parentElement !== slot) slot.appendChild(el);
        docked = true;
        el.classList.add('docked', 'visible');
      },
      undock,
      isDocked() { return docked; },
      // `options` (facultatif, valeur ou fonction relue à chaque calcul) : { flip, shift } passés tels quels aux intergiciels de floating-ui (la
      // grille s'en sert pour que la barre ne recouvre pas ses bandeaux, js/grid-editor.js:floatingOptions) et { placement } (au-dessus par défaut :
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
          floatingUi.computePosition(referenceEl, el, {
            placement: opts.placement || 'top',
            middleware: [floatingUi.offset(8), floatingUi.flip(opts.flip), floatingUi.shift(Object.assign({ padding: 8 }, opts.shift))],
          }).then(({ x, y }) => { el.style.left = `${x}px`; el.style.top = `${y}px`; });
        };
        if (stopAutoUpdate) stopAutoUpdate();
        stopAutoUpdate = floatingUi.autoUpdate(referenceEl, el, update);
      },
      hide() {
        if (docked) return;
        el.classList.remove('visible');
        if (stopAutoUpdate) { stopAutoUpdate(); stopAutoUpdate = null; }
      },
    };
  }

  // Filet de sécurité : les barres contextuelles (tableau, image, variable) ne se ferment normalement que sur un vrai changement de sélection
  // ProseMirror ; un clic hors de `.tiptap` et hors de `.v2-floating-toolbar` les referme toutes, pour les cas sans évènement ProseMirror (ex. clic
  // sur "Mode lecture"). La pastille du zoom de la page (js/page-zoom.js) n'en fait pas partie : un appui dessus ne prend pas le focus et ne change ni la
  // sélection ni le contexte, la barre de l'image ou du tableau reste ouverte et suit la feuille qui change d'échelle. Le menu qu'une de ces barres a
  // ouvert (les bordures du tableau, setOpenDropdownPanel avec son bouton) n'en fait pas partie non plus.
  // `ownerEl` (facultatif) : le champ texte à bulles (js/field-editor.js) dont `panel` est la barre ; sans lui, c'est une barre de l'éditeur du
  // document. Un clic dans l'un laisse ouvertes les barres de CET éditeur et referme celles des autres : le curseur d'un champ ne bouge pas quand on
  // clique dans le document, et inversement.
  const floatingContextPanels = [];
  function registerFloatingPanel(panel, ownerEl) { floatingContextPanels.push({ panel, ownerEl: ownerEl || null }); }
  function hideFloatingContextToolbars() { floatingContextPanels.forEach(entry => entry.panel.hide()); }
  document.addEventListener('mousedown', (event) => {
    const target = event.target;
    if (target.closest('.v2-floating-toolbar') || target.closest('.pp-page-zoom')) return;
    // Le menu qu'une barre flottante a ouvert (les bordures d'un tableau de document) fait partie de cette barre : choisir la couleur d'un trait ou
    // cocher le quadrillage ne la referme pas, sinon son bouton disparaît et le menu, resté ouvert, perd son ancre et saute dans un coin.
    if (openDropdownPanel && openDropdownButton && openDropdownButton.closest('.v2-floating-toolbar') && openDropdownPanel.el.contains(target)) return;
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
    // max-height et le scrollTop ne touchent que .v2-hover-flyout-scrollable (#v2-heading-flyout) : un max-height sur un flyout resté en
    // overflow:visible ne ferait que rétrécir sa boîte, son contenu continuerait de déborder par-dessus, hors de la boîte. scrollTop est remis à 0 à
    // chaque ouverture : sans cela, le défilement interne mémorisé à la fermeture rouvrirait le menu sur une portion qui cache « Normal » et « Titre
    // 1 » (comportement de Chromium, déjà rencontré avec TemplateTreeSelect).
    const flyout = group.querySelector(':scope > .v2-hover-flyout');
    if (!flyout) return;
    // À l'ouverture seulement (js/layers.js) : le menu passe au-dessus de l'existant, barre flottante de tableau ou autre menu. Le navigateur renvoie
    // un `mouseover` au groupe déjà ouvert dès que l'icône de son bouton est redessinée sous une souris au repos (l'alignement, à chaque frappe) : il
    // ne doit pas repasser devant la liste # ouverte après lui.
    if (opening) Layers.raise(flyout);
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
    if (expanded) { trigger.setAttribute('aria-haspopup', 'true'); positionFlyout(group, trigger.getAttribute('aria-expanded') !== 'true'); }
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
    patchNodeAndReselect, editorContentWidthPx, layoutZoom, createStepSheets, createFloatingPanel,
    registerFloatingPanel, hideFloatingContextToolbars, isFormFieldFocus,
    getOpenDropdownPanel, setOpenDropdownPanel, closeDropdownPanel, wireDropdownButton,
    setColorBar, setColorIcon, createSelectionPreserver, isCellSelection, runOnSelectedCells, isInsideNode,
    toggleList, isQuoteActive, quoteSelectedCells, canShiftListsInSelectedCells, shiftListsInSelectedCells,
  };
})();
