// Lecture épurée (retours d'Antoine du 2026-10-02, point 19 : « un mode Lecture épuré qui enlève la toolbar etc. pour juste avoir la lecture clean et épurée d'un document ») : le
// mode Lecture sans la barre du haut ni le reste de l'interface, le document seul dans tout le panneau.
// - Ce n'est PAS un troisième mode : c'est le mode Lecture (js/main.js:switchMode, qui ne change pas) dans un état de plus, la classe `pp-clean-reading` sur <body>. css/clean-reading.css masque
//   alors #toolbar-top (barre, champs de l'email, barre de mise en forme) et le bandeau « Revenir au macro-modèle », et montre le bouton de sortie. La Lecture se dessine, se met en page, se commente et se suit d'une ligne à l'autre
//   de la table exactement comme sans lui : seule la place change. Rien ne s'écrit : c'est une façon de regarder, la personne en lecture seule y a droit comme les autres.
// - Entrée : la ligne « Lecture épurée » du menu au survol du bouton Mode lecture - la barre d'outils reste gelée, aucune icône de plus. Depuis l'Édition, le mode Lecture est affiché d'abord.
// - Sortie : le bouton du coin haut droit, ou Échap (sauf sous une fenêtre ou un fil de commentaire ouvert : ils prennent leur Échap d'abord). Elle rend le mode d'où l'on venait (Édition ou
//   Lecture) ; de retour en Édition, le curseur est dans le document. Revenu en Lecture, le focus va au bouton Mode lecture seulement si l'on était entré au clavier : à la souris, un menu
//   au survol dont le bouton reprend le focus s'ouvre et reste ouvert (js/editor-core.js).
// - Ouverture d'emblée pour les personnes en lecture seule (choix d'Antoine du 2026-10-02 sur une carte, « Un réglage ») : la case de Réglages > Accès (js/access-rights.js, clé cleanReading,
//   décochée au départ) fait ouvrir le widget sur la Lecture épurée à qui la table des droits dit « lecture seule ». Décidé UNE fois par session, à la première réponse confirmée des droits
//   (js/main.js : fin d'init(), puis onAccessRightsChange si la réponse tarde ou si la table illisible finit par être lue) : sortie par le bouton ou Échap, la personne n'y est pas ramenée avant le prochain chargement.
// - Exception assumée à « le changement de mode ne masque jamais la barre d'outils » (charte UX/UI, §3) : c'est la demande d'Antoine, et elle ne vaut que pour cet état, que rien n'allume sans
//   un geste et que rien ne garde d'une ouverture du widget à l'autre.
// Script classique (pas type="module"), même convention de portée globale que OrientationToggle ; js/main.js le câble (CleanReading.wire) et le prévient d'un changement de mode.
const CleanReading = (function () {
  const BODY_CLASS = 'pp-clean-reading';
  const ROW_ID = 'v2-btn-clean-reading';
  const EXIT_ID = 'btn-exit-clean-reading';
  const READ_BUTTON_ID = 'btn-mode-read';
  let host = null;       // { getMode, switchMode, focusEditor } : ce que js/main.js fournit
  let active = false;
  let returnMode = 'read'; // le mode d'où l'on est venu, rendu à la sortie
  let focusBack = null;  // le bouton Mode lecture, quand on est entré au clavier
  let busy = false;

  function isActive() { return active; }

  function show() { document.body.classList.add(BODY_CLASS); }
  function hide() { document.body.classList.remove(BODY_CLASS); }

  async function enter(viaKeyboard) {
    if (!host || active || busy) return;
    busy = true;
    try {
      const from = host.getMode();
      if (from !== 'read') await host.switchMode('read');
      // Le mode Lecture n'a pas pu s'afficher (un autre geste a repris la main pendant ce temps) : on ne cache rien.
      if (host.getMode() !== 'read') return;
      returnMode = from;
      focusBack = viaKeyboard ? document.getElementById(READ_BUTTON_ID) : null;
      active = true;
      show();
    } finally { busy = false; }
  }

  async function exit() {
    if (!host || !active) return;
    active = false;
    hide();
    const back = focusBack;
    focusBack = null;
    if (host.getMode() !== returnMode) await host.switchMode(returnMode);
    // De retour en Édition, le curseur revient dans le document (comme Alt+E, js/shortcuts.js) : le bouton de sortie qui l'avait vient de disparaître, rien ne se taperait.
    if (returnMode === 'edit') { host.focusEditor(); return; }
    if (back && back.isConnected) back.focus({ preventScroll: true });
  }

  // `state` = AccessRights.getStatus().state. L'attente (pending : le calcul tourne, Grist lent) et la table des droits illisible (error : droits verrouillés par précaution, mais AccessRights relit
  // toutes les 10 s et la lecture peut encore aboutir) ne sont pas une réponse : elles ne décident rien. Les autres états (found, notFound, noEmail, off) en sont une.
  function isAnswered(state) {
    return !!state && state !== 'pending' && state !== 'error';
  }

  // Faut-il ouvrir d'emblée ? `access` = { state, readOnly, enabled } : l'état des droits, ce que dit AccessRights.get().readOnly (vrai aussi pour le verrou par précaution), la case cochée. Seule la personne
  // trouvée dans la table des droits (found) dont la ligne dit « lecture seule » ouvre : une personne absente de la table, sans identité ou sans réglage, une table illisible ou une réponse qui n'est
  // pas encore là n'ouvrent rien.
  function wouldOpenForReadOnly(access) {
    return !!access && access.state === 'found' && !!access.readOnly && !!access.enabled;
  }

  let startupDecided = false;
  // Décide une fois, à la première réponse confirmée des droits : appelée au démarrage puis à chaque changement de droits, elle ne fait rien tant que cette réponse n'est pas là, et plus rien une fois décidée.
  function openForReadOnly(access) {
    if (startupDecided || !access || !isAnswered(access.state)) return false;
    startupDecided = true;
    if (!wouldOpenForReadOnly(access)) return false;
    enter(false).catch(e => console.error('[CleanReading] ouverture d’emblée impossible', e));
    return true;
  }

  // js/main.js:switchMode l'appelle avant de changer de mode : un mode autre que la Lecture sort de l'état épuré, sans rien rendre de plus (le mode demandé s'affiche déjà).
  function onModeChange(mode) {
    if (!active || mode === 'read') return;
    active = false;
    focusBack = null;
    hide();
  }

  // Une fenêtre (js/modal-base.js) et le fil de commentaire du mode Lecture (js/comments.js) ont leur propre Échap : ils le prennent avant la sortie, qui attend le suivant.
  function windowOpen() {
    return Array.from(document.querySelectorAll('.pp-modal')).some(m => m.isConnected && getComputedStyle(m).display !== 'none');
  }
  function commentThreadOpen() {
    const popup = document.getElementById('v2-comment-popup');
    return !!popup && popup.style.display !== 'none';
  }
  function onKeydown(event) {
    if (!active || event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
    if (windowOpen() || commentThreadOpen()) return;
    event.preventDefault();
    exit();
  }

  // Le bouton de sortie n'est pas dans #toolbar-top : le [data-tip] de la barre ne s'y applique pas, l'info-bulle est un title natif (même choix que js/find-replace.js), relu à chaque
  // changement de langue ; son aria-label vient de data-i18n-aria (index.html).
  function applyTexts() {
    const exitButton = document.getElementById(EXIT_ID);
    if (exitButton) exitButton.title = I18n.t('cleanReading.exit');
  }

  function wire(options) {
    host = options;
    const row = document.getElementById(ROW_ID);
    if (row) {
      // Une ligne de menu est un <span tabindex="0"> : la souris la focaliserait, et son menu (:focus-within) resterait ouvert une fois la souris partie - même geste que les lignes du
      // menu Enregistrer (js/main.js:wireSaveMenu). Entrée et Espace font ce que fait le clic.
      row.addEventListener('mousedown', event => event.preventDefault());
      row.addEventListener('click', () => enter(false));
      row.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        enter(true);
      });
    }
    const exitButton = document.getElementById(EXIT_ID);
    if (exitButton) exitButton.addEventListener('click', exit);
    document.addEventListener('keydown', onKeydown);
    applyTexts();
    I18n.onChange(applyTexts);
  }

  return { BODY_CLASS, ROW_ID, EXIT_ID, wire, enter, exit, isActive, onModeChange, isAnswered, wouldOpenForReadOnly, openForReadOnly };
})();
