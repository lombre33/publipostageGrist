// La raison d'un grisé. Un bouton, un groupe ou une ligne grisé dit pourquoi : au survol (son `title`) et, quand le clic est arrêté, dans le coin d'état - comme la lecture d'un PDF (js/main.js:applyPdfLocks).
// Audit UI/UX du 04/11, carte « Faire dire pourquoi un bouton ou une ligne est grisé ? » : « Oui, au survol et au clic ». Jamais retiré, jamais caché : le grisé reste, il parle en plus.
//
// Un contrôle peut être grisé pour plusieurs causes à la fois (le document est en lecture seule ET le modèle est un email) : chaque partie du code pose ou retire SA cause, et la plus générale parle.
//   LockReasons.set(el, cause, texte)   pose la cause de `el`, ou la retire quand `texte` est vide
//   LockReasons.reasonOf(el)            la phrase que le contrôle dit (« » sans cause)
//   LockReasons.wire(dire)              un clic sur un contrôle dont une cause ARRÊTE le clic est arrêté en capture, avant tout gestionnaire, et `dire(phrase)` l'affiche
//
// Les causes, de la plus générale à la plus précise (l'ordre de priorité) :
//   access  les droits de la personne, le mode lecture, l'accès du widget      (arrête le clic)
//   pdf     la lecture d'un PDF dans GFS                                       (arrête le clic)
//   mode    le type du modèle (email, macro-modèle, grille), l'en-tête ou le pied de page, la sélection (arrête le clic)
//   grid    une grille                                                         (arrête le clic)
//   linked  le curseur dans un tableau lié à un modèle Grille                  (arrête le clic)
//   explain une ligne grisée dont le clic explique déjà (`data-explains`)      (dit seulement)
//   state   un bouton `disabled` du navigateur, qui ne reçoit aucun clic       (dit seulement)
//
// Posé sur l'élément : `data-pp-lock-reason` (la phrase, pour toute cause ; les feuilles de style y lisent aussi qu'une info-bulle `data-tip`, que l'estompage rendrait illisible, laisse la place au `title`) et
// `data-pp-lock-blocks` (quand une cause arrête le clic : l'élément reçoit la souris, ses enfants non - l'info-bulle et le clic sont les siens -, son menu au survol ne s'ouvre pas ; css/toolbar-v2.css). Le `title`
// que l'élément avait avant le premier grisé lui est rendu au dernier dégrisé.
const LockReasons = (function () {
  const REASON = 'data-pp-lock-reason';
  const BLOCKS = 'data-pp-lock-blocks';
  const KEPT_TITLE = 'data-pp-lock-kept-title';
  const ORDER = ['access', 'pdf', 'mode', 'grid', 'linked', 'explain', 'state'];
  const BLOCKING = ['access', 'pdf', 'mode', 'grid', 'linked'];
  const causesOf = new WeakMap();

  function refresh(el, causes) {
    const cause = ORDER.find(name => causes[name]);
    const reason = cause ? causes[cause] : '';
    if (!reason) {
      el.removeAttribute(REASON);
      el.removeAttribute(BLOCKS);
      if (el.hasAttribute(KEPT_TITLE)) {
        const before = el.getAttribute(KEPT_TITLE);
        el.removeAttribute(KEPT_TITLE);
        if (before) el.setAttribute('title', before); else el.removeAttribute('title');
      }
      return;
    }
    if (!el.hasAttribute(KEPT_TITLE)) el.setAttribute(KEPT_TITLE, el.getAttribute('title') || '');
    if (el.getAttribute('title') !== reason) el.setAttribute('title', reason);
    if (el.getAttribute(REASON) !== reason) el.setAttribute(REASON, reason);
    el.toggleAttribute(BLOCKS, BLOCKING.some(name => causes[name]));
  }

  function set(el, cause, reason) {
    if (!el) return;
    let causes = causesOf.get(el);
    if (!causes) {
      if (!reason) return;
      causes = {};
      causesOf.set(el, causes);
    }
    if (reason) causes[cause] = reason; else delete causes[cause];
    refresh(el, causes);
  }

  const reasonOf = el => (el && el.getAttribute(REASON)) || '';

  // Le clic (souris, clavier, ou .click() d'un autre module) sur un contrôle qu'une cause arrête : arrêté avant tout gestionnaire, la phrase dite. Seul le clic est arrêté ici : l'appui de la souris suit son chemin ordinaire
  // (il fait perdre son focus à l'éditeur, comme avant le grisé, où l'appui tombait sur le fond de la barre ; le garder empêchait la barre flottante d'un tableau de revenir au clic suivant dans la même case). Un bouton qui
  // s'ouvre à l'appui (la police, EditorCore.wireDropdownButton) sait de lui-même qu'il est arrêté et ne s'ouvre pas.
  function wire(say) {
    document.addEventListener('click', event => {
      const locked = event.target && event.target.closest ? event.target.closest('[' + BLOCKS + ']') : null;
      if (!locked) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const reason = reasonOf(locked);
      if (reason) say(reason);
    }, true);
  }

  return { set, reasonOf, wire, REASON, BLOCKS };
})();
