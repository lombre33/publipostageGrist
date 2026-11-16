// La raison d'un grisé. Un bouton, un groupe ou une ligne grisé dit pourquoi : au survol (son `title`) et, quand le clic est arrêté, dans le coin d'état - comme la lecture d'un PDF (js/main.js:applyPdfLocks).
// Audit UI/UX du 04/11, carte « Faire dire pourquoi un bouton ou une ligne est grisé ? » : « Oui, au survol et au clic ». Jamais retiré, jamais caché : le grisé reste, il parle en plus.
//
// Un contrôle peut être grisé pour plusieurs causes à la fois (le document est en lecture seule ET le modèle est un email) : chaque partie du code pose ou retire SA cause, et la plus générale parle.
//   LockReasons.set(el, cause, texte, genre)   pose la cause de `el`, ou la retire quand `texte` est vide ; `genre` (facultatif) dit de quel grisé il s'agit dans la cause (« email », « macro », « zone », la clé d'un droit...) : le constat de la bulle
//                                       (js/lock-diagnostic.js) en choisit ses vérifications
//   LockReasons.reasonOf(el)            la phrase que le contrôle dit (« » sans cause)
//   LockReasons.detailOf(el)            { cause, kind, reason } de la cause qui parle, null sans cause
//   LockReasons.wire(dire)              un clic sur un contrôle dont une cause ARRÊTE le clic est arrêté en capture, avant tout gestionnaire, et `dire(phrase, contrôle, évènement)` l'affiche (la bulle, js/lock-bubble.js)
//
// Les causes, de la plus générale à la plus précise (l'ordre de priorité) :
//   access  les droits de la personne, le mode lecture, l'accès du widget      (arrête le clic)
//   pdf     la lecture d'un PDF dans GFS                                       (arrête le clic)
//   mode    le type du modèle (email, macro-modèle, grille), l'en-tête ou le pied de page, la sélection (arrête le clic)
//   grid    une grille                                                         (arrête le clic)
//   linked  le curseur dans un tableau lié à un modèle Grille                  (arrête le clic)
//   explain une ligne grisée dont le clic explique déjà (`data-explains`)      (dit seulement)
//   state   un bouton `disabled` du navigateur, qui ne reçoit aucun clic       (le bouton devient « grisé doux » : voir plus bas ; il arrête le clic et ouvre la bulle comme les autres)
//
// Le grisé doux (demande du 12/11, lot 4) : un bouton que son module grise avec `disabled` ne reçoit ni clic ni info-bulle fiable (Firefox ne lui donne aucun évènement), donc rien ne pouvait dire pourquoi au clic. Quand la cause « state »
// parle sur un <button> `disabled`, `set` lui retire `disabled` et le grise autrement : `aria-disabled="true"`, `data-pp-lock-soft`, hors de l'ordre des tabulations (`tabindex="-1"`, rendu au dégrisé), et `data-pp-lock-blocks` (il reçoit la
// souris, son clic est arrêté et ouvre la bulle). Les feuilles de style grisent `[data-pp-lock-soft]` comme leur `:disabled`. Le module appelle `set` à chaque fois qu'il (re)pose `disabled`, après lui : `set(bouton, 'state', '')` dégrise.
//
// Posé sur l'élément : `data-pp-lock-cause` et `data-pp-lock-kind` (la cause qui parle et son genre), `data-pp-lock-reason` (la phrase, pour toute cause ; les feuilles de style y lisent aussi qu'une info-bulle `data-tip`, que l'estompage rendrait illisible, laisse la place au `title`) et
// `data-pp-lock-blocks` (quand une cause arrête le clic : l'élément reçoit la souris, ses enfants non - l'info-bulle et le clic sont les siens -, son menu au survol ne s'ouvre pas ; css/toolbar-v2.css). Le `title`
// que l'élément avait avant le premier grisé lui est rendu au dernier dégrisé.
const LockReasons = (function () {
  const REASON = 'data-pp-lock-reason';
  const BLOCKS = 'data-pp-lock-blocks';
  const KEPT_TITLE = 'data-pp-lock-kept-title';
  const CAUSE = 'data-pp-lock-cause';
  const KIND = 'data-pp-lock-kind';
  const SOFT = 'data-pp-lock-soft';
  const SOFT_TAB = 'data-pp-lock-soft-tab';
  const SOFT_ARIA = 'data-pp-lock-soft-aria'; // `aria-disabled` posé par le grisé doux lui-même (celui que posent les droits ou le PDF n'est pas à lui)
  const ORDER = ['access', 'pdf', 'mode', 'grid', 'linked', 'explain', 'state'];
  const BLOCKING = ['access', 'pdf', 'mode', 'grid', 'linked'];
  const causesOf = new WeakMap();
  const kindsOf = new WeakMap(); // élément -> { cause: genre }

  // Le grisé doux d'un bouton `disabled` dont la cause « state » parle (voir plus haut) ; `on` faux le rend au bouton.
  function soften(el, on, causes) {
    if (on) {
      if (el.disabled) el.disabled = false;
      el.setAttribute(SOFT, '');
      if (!el.hasAttribute('aria-disabled')) { el.setAttribute('aria-disabled', 'true'); el.setAttribute(SOFT_ARIA, ''); }
      if (!el.hasAttribute(SOFT_TAB)) el.setAttribute(SOFT_TAB, el.hasAttribute('tabindex') ? el.getAttribute('tabindex') : '-');
      el.setAttribute('tabindex', '-1');
    } else if (el.hasAttribute(SOFT)) {
      el.removeAttribute(SOFT);
      // Un autre grisé (les droits, le PDF, le mode) a besoin de l'`aria-disabled` : il le garde, il le retirera lui-même.
      if (el.hasAttribute(SOFT_ARIA)) {
        el.removeAttribute(SOFT_ARIA);
        if (!Object.keys(causes || {}).some(name => name !== 'state' && causes[name])) el.removeAttribute('aria-disabled');
      }
      const before = el.getAttribute(SOFT_TAB);
      el.removeAttribute(SOFT_TAB);
      if (before === '-' || before === null) el.removeAttribute('tabindex'); else el.setAttribute('tabindex', before);
    }
  }

  function refresh(el, causes) {
    const cause = ORDER.find(name => causes[name]);
    const reason = cause ? causes[cause] : '';
    if (!reason) {
      soften(el, false, causes);
      el.removeAttribute(REASON);
      el.removeAttribute(BLOCKS);
      el.removeAttribute(CAUSE);
      el.removeAttribute(KIND);
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
    const soft = cause === 'state' && el.tagName === 'BUTTON' && (el.disabled || el.hasAttribute(SOFT));
    soften(el, soft, causes);
    el.toggleAttribute(BLOCKS, soft || BLOCKING.some(name => causes[name]));
    if (el.getAttribute(CAUSE) !== cause) el.setAttribute(CAUSE, cause);
    const kind = (kindsOf.get(el) || {})[cause] || '';
    if (kind) { if (el.getAttribute(KIND) !== kind) el.setAttribute(KIND, kind); } else el.removeAttribute(KIND);
  }

  function set(el, cause, reason, kind) {
    if (!el) return;
    let causes = causesOf.get(el);
    if (!causes) {
      if (!reason) return;
      causes = {};
      causesOf.set(el, causes);
    }
    const kinds = kindsOf.get(el) || {};
    if (reason) { causes[cause] = reason; kinds[cause] = kind || ''; } else { delete causes[cause]; delete kinds[cause]; }
    kindsOf.set(el, kinds);
    refresh(el, causes);
  }

  const reasonOf = el => (el && el.getAttribute(REASON)) || '';
  const detailOf = el => (el && el.getAttribute(CAUSE) ? { cause: el.getAttribute(CAUSE), kind: el.getAttribute(KIND) || '', reason: reasonOf(el) } : null);

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
      if (reason) say(reason, locked, event);
    }, true);
  }

  return { set, reasonOf, detailOf, wire, REASON, BLOCKS, CAUSE, KIND };
})();
