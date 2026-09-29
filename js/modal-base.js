// Base commune des fenêtres du widget (audit UX/UI du 2026-09-29, choix d'Antoine « une base pour les dix fenêtres », en deux lots : d'abord Condition d'affichage,
// Autres attributs et Boucle, qui refaisaient chacune l'ouverture, Échap, les boutons et le focus ; ensuite les sept fenêtres écrites dans index.html).
// Une fenêtre = un voile (`.pp-modal`), un cadre (`.pp-modal-box`, aussi `.modal-content`) et trois zones : le TITRE, le CONTENU et la ligne de BOUTONS.
// Seul le contenu défile : le titre et les boutons restent toujours visibles, même dans le panneau de 700x400 de Grist (règle d'Antoine, 2026-09-29).
// Le clavier est tenu ici, une fois pour toutes, pour la fenêtre du dessus (la dernière ouverte) :
//  - Tab et Maj+Tab tournent DANS la fenêtre, y compris quand le focus est tombé sur <body> (un champ redessiné, un bouton retiré) ;
//  - Échap ferme la fenêtre où que soit le focus, sauf si un composant l'a déjà pris (la liste avec recherche referme son seul panneau, cf. js/search-select.js).
// L'écouteur est posé sur le document, pas sur la fenêtre : posé sur elle, il ne voyait plus rien dès que le focus en sortait, et Échap ne fermait plus rien.
// Deux façons d'avoir une fenêtre :
//  - `create` bâtit le cadre en JavaScript (fenêtres de variable, saisies et confirmations) : le code appelle `show()` et `hide()` ;
//  - `adopt` reprend une fenêtre écrite dans index.html (Réglages, Tables liées, macro-modèle, Organiser, galerie, aperçu, clé de correspondance) : son module
//    l'ouvre et la ferme comme avant, par `style.display`, et la base le constate pour lui donner le clavier et le focus. Échap y passe par le bouton qui la ferme,
//    donc par la même sortie que la souris.
// Un clic sur le voile ne ferme rien, à dessein : il protège une saisie en cours. Aucun texte ici (les fenêtres portent les leurs, en français et en anglais).
const ModalBase = (function () {
  const stack = [];          // fenêtres ouvertes, la dernière est au-dessus : c'est elle qui reçoit le clavier
  const pages = new Set();   // fenêtres reprises d'index.html : leur module les ouvre et les ferme, la base le constate (MutationObserver)
  const FOCUSABLE = 'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex]';
  let lastOutside = null;    // dernier élément à avoir eu le focus HORS d'une fenêtre reprise : l'ouvreur quand le module a déjà mis le focus dans la fenêtre

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
    if (event.key === 'Escape') { event.preventDefault(); win.onEscape(); }
    else trapTab(win, event);
  }

  // Entrée et sortie de la pile : le clavier n'est écouté que tant qu'une fenêtre est ouverte. `detach` rend l'élément à qui rendre le focus.
  function attach(win, opener) {
    win.opener = opener;
    stack.push(win);
    if (stack.length === 1) document.addEventListener('keydown', onKeydown);
  }
  function detach(win) {
    stack.splice(stack.indexOf(win), 1);
    if (!stack.length) document.removeEventListener('keydown', onKeydown);
    const back = win.opener;
    win.opener = null;
    return back;
  }
  function giveFocusBack(win, back) {
    if (win.restoreFocus !== false && back && back.isConnected && typeof back.focus === 'function') back.focus();
  }

  // --- Fenêtres reprises d'index.html ---

  const isShown = win => getComputedStyle(win.overlay).display !== 'none';
  const insidePage = node => Array.from(pages).some(win => win.box.contains(node));

  // L'élément qui a ouvert `win` : celui qui a le focus, sauf si le module a déjà mis le focus dans la fenêtre (le champ de nom du macro-modèle, la recherche
  // d'Organiser) - alors le dernier qui l'avait avant, hors des fenêtres reprises.
  function openerOf(win) {
    const active = document.activeElement;
    return active && active !== document.body && !win.box.contains(active) ? active : lastOutside;
  }

  // Compare ce que montre chaque fenêtre reprise à la pile, dans l'ordre : d'abord celles qui se ferment, puis celles qui s'ouvrent. Une fenêtre qui en
  // remplace une autre dans la foulée (galerie -> aperçu, et « Retour à la galerie ») garde l'ouvreur de la première : à la fin de la chaîne, le focus
  // revient au bouton qui a ouvert la galerie, pas à un bouton de la fenêtre qu'on vient de cacher.
  function syncPages() {
    const opened = [], closed = [];
    pages.forEach(win => {
      const shown = isShown(win);
      if (shown && !stack.includes(win)) opened.push(win);
      else if (!shown && stack.includes(win)) closed.push(win);
    });
    const backs = closed.map(detach);
    if (opened.length) {
      opened.forEach(win => attach(win, backs.length ? backs[0] : openerOf(win)));
      const top = stack[stack.length - 1];
      if (!top.box.contains(document.activeElement)) (focusables(top.box)[0] || top.box).focus();
    } else if (closed.length) {
      giveFocusBack(closed[closed.length - 1], backs[backs.length - 1]);
    }
  }
  const observer = new MutationObserver(syncPages);

  // Le cadre de la fenêtre, sans rien dedans : à remplir par `win.title`, `win.body` (le contenu) et `win.actions` (les boutons), puis à ouvrir par
  // `win.show()`. Options : id (du voile - les styles et les tests s'y accrochent), titleId (du <h3> ; aria-labelledby de la fenêtre), boxClass et actionsClass
  // (classes propres à la fenêtre), size ('sm' 400 px, 'md' 480 px, 'lg' 960 px, plafonné à la largeur du panneau ; 'md' par défaut), onEscape (défaut : fermer),
  // restoreFocus (rendre le focus à l'élément qui l'avait à l'ouverture ; vrai par défaut - les fenêtres de variable le rendent à l'éditeur elles-mêmes, pour
  // que la barre flottante revienne).
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

    const win = {
      overlay, box, title, body, actions, opener: null, restoreFocus: opts.restoreFocus,
      isOpen: () => stack.includes(win),
      onEscape: () => (opts.onEscape ? opts.onEscape() : win.hide()),
      // `target` : l'élément (ou la fonction qui le donne) à mettre au premier plan du clavier ; par défaut le premier champ du contenu.
      show(target) {
        if (!win.isOpen()) {
          attach(win, document.activeElement);
          overlay.style.display = 'flex';
        }
        const focusTarget = (typeof target === 'function' ? target() : target) || focusables(body)[0] || focusables(box)[0] || box;
        focusTarget.focus();
      },
      hide() {
        if (!win.isOpen()) return;
        overlay.style.display = 'none';
        giveFocusBack(win, detach(win));
      },
    };
    return win;
  }

  // Reprend la fenêtre `#id` d'index.html, déjà écrite en voile `.pp-modal` > cadre `.pp-modal-box` (role, aria-modal, aria-labelledby) > titre, contenu, boutons.
  // Options : closeId (le bouton qui la ferme : Échap le clique, donc passe par le code de fermeture du module - libérer une promesse, effacer un brouillon).
  function adopt(id, opts) {
    const overlay = document.getElementById(id);
    const box = overlay && overlay.querySelector('.pp-modal-box');
    if (!box) return null;
    const closeButton = opts && opts.closeId ? document.getElementById(opts.closeId) : null;
    const win = {
      overlay, box, opener: null,
      isOpen: () => stack.includes(win),
      onEscape: () => { if (closeButton) closeButton.click(); },
    };
    if (!pages.size) document.addEventListener('focusin', (event) => { if (!insidePage(event.target)) lastOutside = event.target; });
    pages.add(win);
    observer.observe(overlay, { attributes: true, attributeFilter: ['style'] });
    syncPages();
    return win;
  }

  return { create, adopt };
})();
