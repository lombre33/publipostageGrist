// Base commune des fenêtres du widget (audit UX/UI du 2026-09-29, choix d'Antoine « une base pour les dix fenêtres », en deux lots : d'abord Condition d'affichage,
// Autres attributs et Boucle, qui refaisaient chacune l'ouverture, Échap, les boutons et le focus ; ensuite les sept fenêtres écrites dans index.html).
// Une fenêtre = un voile (`.pp-modal`), un cadre (`.pp-modal-box`, aussi `.modal-content`) et trois zones : le TITRE, le CONTENU et la ligne de BOUTONS.
// Seul le contenu défile : le titre et les boutons restent toujours visibles, même dans le panneau de 700x400 de Grist (règle d'Antoine, 2026-09-29).
// Le clavier est tenu ici, une fois pour toutes :
//  - Tab et Maj+Tab tournent DANS la fenêtre, y compris quand le focus est tombé sur <body> (un champ redessiné, un bouton retiré) ;
//  - Échap ferme la fenêtre où que soit le focus, sauf si un composant l'a déjà pris (la liste avec recherche referme son seul panneau, cf. js/search-select.js)
//    ou si une fenêtre d'un autre module est ouverte par-dessus (le choix de la clé de correspondance, `#link-config-modal`, garde son propre Annuler).
// L'écouteur est posé sur le document, pas sur la fenêtre : posé sur elle, il ne voyait plus rien dès que le focus en sortait, et Échap ne fermait plus rien.
// Un clic sur le voile ne ferme rien, à dessein : il protège une saisie en cours. Aucun texte ici (les fenêtres portent les leurs, en français et en anglais).
const ModalBase = (function () {
  const stack = [];          // fenêtres ouvertes, la dernière est au-dessus : c'est elle qui reçoit le clavier
  const overlays = new Set(); // voiles créés ici : les fenêtres ouvertes des autres modules (ex. #link-config-modal) sont celles qui n'y figurent pas
  const FOCUSABLE = 'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex]';

  function el(tag, className) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    return e;
  }

  // Éléments atteignables à Tab dans `root`, dans l'ordre du document : ni désactivés, ni cachés (hidden, display:none d'un ancêtre), ni retirés de l'ordre
  // de tabulation (tabindex="-1", comme les lignes d'une liste avec recherche).
  function focusables(root) {
    return Array.from(root.querySelectorAll(FOCUSABLE)).filter(e =>
      !e.disabled && e.tabIndex >= 0 && !e.closest('[hidden]') && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden');
  }

  // Une fenêtre modale d'un AUTRE module est visible (le voile de #link-config-modal, ouvert par-dessus la condition d'affichage) : le clavier est à elle.
  function foreignModalVisible() {
    return Array.from(document.querySelectorAll('[aria-modal="true"]')).some(m => {
      for (const overlay of overlays) if (overlay.contains(m)) return false;
      return m.getClientRects().length > 0;
    });
  }

  function trapTab(win, event) {
    const list = focusables(win.box);
    if (!list.length) { event.preventDefault(); win.box.focus(); return; }
    const first = list[0];
    const last = list[list.length - 1];
    const active = document.activeElement;
    // Focus hors du cadre (sur <body>, sur le voile après un clic à côté) : on y rentre par le bon bout, au lieu de laisser Tab partir dans la barre d'outils.
    if (!win.box.contains(active)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); return; }
    if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
  }

  function onKeydown(event) {
    const win = stack[stack.length - 1];
    if (!win || event.defaultPrevented || (event.key !== 'Escape' && event.key !== 'Tab')) return;
    if (foreignModalVisible()) return;
    if (event.key === 'Escape') { event.preventDefault(); win.onEscape(); }
    else trapTab(win, event);
  }

  // Le cadre de la fenêtre, sans rien dedans : à remplir par `win.title`, `win.body` (le contenu) et `win.actions` (les boutons), puis à ouvrir par
  // `win.show()`. Options : id (du voile - les styles et les tests s'y accrochent), titleId (du <h3> ; aria-labelledby de la fenêtre), boxClass et actionsClass
  // (classes propres à la fenêtre), size ('sm' 400 px, 'md' 480 px, 'lg' 684 px ; 'md' par défaut), onEscape (défaut : fermer), restoreFocus (rendre le focus à
  // l'élément qui l'avait à l'ouverture ; vrai par défaut - les fenêtres de variable le rendent à l'éditeur elles-mêmes, pour que la barre flottante revienne).
  function create(opts) {
    const overlay = el('div', 'pp-modal');
    overlay.id = opts.id;
    overlay.style.display = 'none';
    overlay.tabIndex = -1;
    const box = el('div', 'pp-modal-box modal-content' + (opts.boxClass ? ' ' + opts.boxClass : ''));
    box.tabIndex = -1;
    box.dataset.size = opts.size || 'md';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', opts.titleId);
    const header = el('div', 'pp-modal-header');
    const title = el('h3');
    title.id = opts.titleId;
    header.appendChild(title);
    const body = el('div', 'pp-modal-body');
    const actions = el('div', 'pp-modal-actions' + (opts.actionsClass ? ' ' + opts.actionsClass : ''));
    box.append(header, body, actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    overlays.add(overlay);

    let opener = null;
    const win = {
      overlay, box, title, body, actions,
      isOpen: () => stack.includes(win),
      onEscape: () => (opts.onEscape ? opts.onEscape() : win.hide()),
      // `target` : l'élément (ou la fonction qui le donne) à mettre au premier plan du clavier ; par défaut le premier champ du contenu.
      show(target) {
        if (!win.isOpen()) {
          opener = document.activeElement;
          stack.push(win);
          overlay.style.display = 'flex';
          if (stack.length === 1) document.addEventListener('keydown', onKeydown);
        }
        const focusTarget = (typeof target === 'function' ? target() : target) || focusables(body)[0] || focusables(box)[0] || box;
        focusTarget.focus();
      },
      hide() {
        if (!win.isOpen()) return;
        stack.splice(stack.indexOf(win), 1);
        overlay.style.display = 'none';
        if (!stack.length) document.removeEventListener('keydown', onKeydown);
        const back = opener;
        opener = null;
        if (opts.restoreFocus !== false && back && back.isConnected && typeof back.focus === 'function') back.focus();
      },
    };
    return win;
  }

  return { create };
})();
