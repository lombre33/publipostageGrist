// Lecture épurée : le mode Lecture sans la barre du haut ni le reste de l'interface, le document seul dans tout le panneau.
//  - Ce n'est pas un troisième mode : c'est le mode Lecture (js/main.js:switchMode, inchangé) dans un état de plus, la classe `pp-clean-reading` sur
//    <body>. css/clean-reading.css masque alors #toolbar-top (barre, champs de l'email, barre de mise en forme) et le bandeau « Revenir au
//    macro-modèle », et montre le bouton de sortie. La Lecture se dessine, se met en page, se commente et se suit d'une ligne à l'autre de la table
//    exactement comme sans lui : seule la place change. Rien ne s'écrit, la personne en lecture seule y a donc droit comme les autres ;
//  - entrée : le menu au survol du bouton Mode lecture a deux lignes à cocher, « Lecture simple » (cochée au départ) et « Lecture épurée », comme le menu du
//    bouton Exporter : la ligne cochée dicte l'action du bouton. Cocher une ligne ne fait rien d'autre que la cocher ; c'est le bouton Mode lecture - et Alt+L,
//    qui le clique - qui fait ce que la ligne cochée dit : la Lecture comme toujours, ou la Lecture épurée. La barre d'outils reste gelée, aucune icône de
//    plus. Depuis l'Édition, le mode Lecture est affiché d'abord. Le choix est celui de la session (un état d'affichage, comme le zoom : ni gardé d'une
//    ouverture du widget à l'autre, ni dans Annuler) et repart de « Lecture simple » ;
//  - sortie : le bouton du coin haut droit, ou Échap (sauf sous une fenêtre ou un fil de commentaire ouvert : ils prennent leur Échap d'abord). Elle
//    rend le mode d'où l'on venait ; de retour en Édition, le curseur est dans le document. Revenu en Lecture, le focus va au bouton Mode lecture
//    seulement si l'on était entré au clavier : à la souris, un menu au survol dont le bouton reprend le focus s'ouvre et reste ouvert
//    (js/editor-core.js) ;
//  - ouverture d'emblée pour les personnes en lecture seule : la case de Réglages > Accès (js/access-rights.js, clé cleanReading, décochée au départ)
//    fait ouvrir le widget sur la Lecture épurée à qui la table des droits dit « lecture seule », et aux comptes Lecteur de Grist (lecture seule d'office,
//    js/access-rights.js). Décidé une fois par session, à la première réponse confirmée des droits (js/main.js : fin d'init(), puis
//    onAccessRightsChange si la réponse tarde ou si la table illisible finit par être lue) : la personne qui sort n'y est pas ramenée avant le prochain
//    chargement ;
//  - exception assumée à « le changement de mode ne masque jamais la barre d'outils » (charte UX/UI, §3) : elle ne vaut que pour cet état, que rien
//    n'allume sans un geste et que rien ne garde d'une ouverture du widget à l'autre.
// Script classique (pas type="module"), même convention de portée globale que OrientationToggle ; js/main.js le câble (CleanReading.wire) et le
// prévient d'un changement de mode.
const CleanReading = (function () {
  const BODY_CLASS = 'pp-clean-reading';
  const ROWS = '#v2-read-flyout .v2-hover-row[data-read-choice]'; // les deux lignes à cocher du menu du bouton Mode lecture (index.html)
  const EXIT_ID = 'btn-exit-clean-reading';
  const READ_BUTTON_ID = 'btn-mode-read';
  const CHOICES = ['simple', 'clean']; // « Lecture simple », « Lecture épurée » : la première est cochée au départ
  let host = null;       // { getMode, switchMode, focusEditor } : ce que js/main.js fournit
  let active = false;
  let returnMode = 'read'; // le mode d'où l'on est venu, rendu à la sortie
  let focusBack = null;  // le bouton Mode lecture, quand on est entré au clavier
  let busy = false;
  let choice = CHOICES[0]; // la ligne cochée : ce que fait le bouton Mode lecture

  function isActive() { return active; }

  // La ligne cochée du menu du bouton Mode lecture, `aria-checked` de chaque ligne (la coche devant le libellé est celle du menu Exporter,
  // css/editor-v2.css : `v2-hover-row-check-start`).
  function getChoice() { return choice; }
  function syncRows() {
    document.querySelectorAll(ROWS).forEach(row => row.setAttribute('aria-checked', row.dataset.readChoice === choice ? 'true' : 'false'));
  }
  // Coche une ligne, sans rien faire d'autre : ni changer de mode, ni entrer dans l'état épuré, rien d'écrit. Rend faux pour un choix inconnu.
  function choose(value) {
    if (CHOICES.indexOf(value) === -1) return false;
    choice = value;
    syncRows();
    return true;
  }

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
    // De retour en Édition, le curseur revient dans le document (comme Alt+E, js/shortcuts.js) : le bouton de sortie qui l'avait vient de
    // disparaître, rien ne se taperait.
    if (returnMode === 'edit') { host.focusEditor(); return; }
    if (back && back.isConnected) back.focus({ preventScroll: true });
  }

  // Le clic du bouton Mode lecture (js/main.js) et Alt+L, qui le clique : ce que dit la ligne cochée du menu, comme le bouton Exporter lance l'option cochée du sien.
  // « Lecture simple » : le mode Lecture, comme toujours ; « Lecture épurée » : la Lecture sans la barre, depuis le mode où l'on est (l'Édition ou la Lecture).
  // `viaKeyboard` : le geste vient du clavier (`detail` à 0), le focus est rendu au bouton à la sortie.
  function readButton(viaKeyboard) {
    if (!host) return Promise.resolve();
    return choice === 'clean' ? enter(!!viaKeyboard) : host.switchMode('read');
  }

  // `state` = AccessRights.getStatus().state. L'attente (pending : le calcul tourne, Grist lent) et la table des droits illisible (error : droits
  // verrouillés par précaution, mais AccessRights relit toutes les 10 s et la lecture peut encore aboutir) ne sont pas une réponse : elles ne
  // décident rien. Les autres états (found, notFound, noEmail, off) en sont une.
  function isAnswered(state) {
    return !!state && state !== 'pending' && state !== 'error';
  }

  // Faut-il ouvrir d'emblée ? `access` = { state, readOnly, enabled } : l'état des droits, ce que dit AccessRights.get().readOnly (vrai aussi pour le
  // verrou par précaution), la case cochée. Ouvrent la personne trouvée dans la table des droits (found) dont la ligne dit « lecture seule », et le
  // compte Lecteur de Grist (viewer : lecture seule d'office, sans ligne à chercher) ; une personne absente de la table, sans identité ou sans réglage,
  // une table illisible ou une réponse qui n'est pas encore là n'ouvrent rien.
  function wouldOpenForReadOnly(access) {
    return !!access && (access.state === 'found' || access.state === 'viewer') && !!access.readOnly && !!access.enabled;
  }

  let startupDecided = false;
  // Décide une fois, à la première réponse confirmée des droits : appelée au démarrage puis à chaque changement de droits, elle ne fait rien tant que
  // cette réponse n'est pas là, et plus rien une fois décidée.
  function openForReadOnly(access) {
    if (startupDecided || !access || !isAnswered(access.state)) return false;
    startupDecided = true;
    if (!wouldOpenForReadOnly(access)) return false;
    enter(false).catch(e => console.error('[CleanReading] ouverture d’emblée impossible', e));
    return true;
  }

  // js/main.js:switchMode l'appelle avant de changer de mode : un mode autre que la Lecture sort de l'état épuré, sans rien rendre de plus (le mode
  // demandé s'affiche déjà).
  function onModeChange(mode) {
    if (!active || mode === 'read') return;
    active = false;
    focusBack = null;
    hide();
  }

  // Une fenêtre (js/modal-base.js) et le fil de commentaire du mode Lecture (js/comments.js) ont leur propre Échap : ils le prennent avant la sortie,
  // qui attend le suivant.
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

  // Le bouton de sortie n'est pas dans #toolbar-top : le [data-tip] de la barre ne s'y applique pas, l'info-bulle est un title natif (même choix que
  // js/find-replace.js), écrit au câblage ; son aria-label vient de data-i18n-aria (index.html).
  function applyTexts() {
    const exitButton = document.getElementById(EXIT_ID);
    if (exitButton) exitButton.title = I18n.t('cleanReading.exit');
  }

  function wire(options) {
    host = options;
    document.querySelectorAll(ROWS).forEach(row => {
      // Une ligne de menu est un <span tabindex="0"> : la souris la focaliserait, et son menu (:focus-within) resterait ouvert une fois la souris
      // partie - même geste que les lignes du menu Enregistrer (js/main.js:wireSaveMenu). Entrée et Espace font ce que fait le clic : cocher la ligne,
      // comme dans le menu Exporter (js/main.js:wireExportMenus) ; c'est le bouton Mode lecture qui agit.
      row.addEventListener('mousedown', event => event.preventDefault());
      row.addEventListener('click', () => choose(row.dataset.readChoice));
      row.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        choose(row.dataset.readChoice);
      });
    });
    syncRows();
    const exitButton = document.getElementById(EXIT_ID);
    if (exitButton) {
      exitButton.addEventListener('click', exit);
      GfsBar.keepClear(exitButton); // la barre de GFS (js/gfs-bar.js) : à droite, dans un cadre bas, le bouton se glisse à sa gauche
    }
    document.addEventListener('keydown', onKeydown);
    applyTexts();
  }

  return { wire, exit, isActive, getChoice, choose, readButton, onModeChange, isAnswered, wouldOpenForReadOnly, openForReadOnly };
})();
