// Panneau du haut replié : une languette sous la barre replie d'un clic tout le panneau (la barre du haut, les champs de l'email, la barre de mise en forme),
// pour n'avoir que le texte et gagner de la hauteur (demande du 10/11 : « pouvoir, y compris en mode éditeur, replier le panneau d'en haut »).
//  - Ce n'est pas un mode : c'est un état d'affichage du panneau, la classe `pp-bar-folded` sur <body>. Il vaut pour l'Édition comme pour la Lecture (la barre
//    n'est ni dans l'une ni dans l'autre) ; la Lecture épurée (js/clean-reading.js) reste un état à part qui cache aussi la languette, et rend à la sortie
//    l'état d'avant. Rien n'est écrit : ni dans Grist, ni dans le stockage, ni dans Annuler (une ligne `view` au registre) - comme la Lecture épurée, il
//    repart déplié à chaque ouverture du widget ;
//  - la languette (#v2-bar-fold-tab) est HORS de la barre : la barre d'outils reste gelée, aucune icône de plus. Dans le flux elle suit les bandeaux
//    juste avant le document (css/bar-fold.css : une ligne de hauteur nulle, la languette y est accrochée), donc au même endroit par rapport au texte, que le
//    panneau soit ouvert (elle pend sous lui) ou replié (elle pend du haut du panneau de Grist). Un clic, Entrée ou Espace la bascule ; Ctrl+Maj+F aussi
//    (la touche de Google Docs, action `barFold` de js/shortcuts.js, qui clique la languette) ;
//  - replié, le panneau n'est PAS retiré de la page (`visibility: hidden`, hors du flux) : ses boutons gardent leur boîte, donc les touches de js/shortcuts.js,
//    qui cliquent les boutons de la barre (Alt+Maj+H, Ctrl+Alt+M, Alt+Entrée...), continuent d'agir sur le texte ; seuls l'écran, la souris et la tabulation ne
//    le voient plus. Un `display: none` les aurait tous rendus inutilisables ;
//  - ce que la barre dit ne se perd pas : le coin d'état (#status-msg) porte des alertes (Grist a refusé d'écrire, modifications non enregistrées quand
//    l'enregistrement automatique est coupé, modèle jamais enregistré). Replié, un message d'erreur ou « non enregistré » s'écrit dans la languette elle-même
//    (en rouge pour une erreur) et dans son nom accessible ; les autres messages, passagers, ne s'affichent pas ;
//  - si le focus était dans le panneau au moment de le replier (un champ de l'email, un bouton cliqué), il revient au texte (ou à la languette quand le texte
//    n'est pas à l'écran) : un focus sur un élément invisible ne laisserait plus rien se taper ;
//  - la barre de GFS (js/gfs-bar.js) : en haut, elle tombe sur le milieu du bord, là où se trouve la languette une fois le panneau replié ; GfsBar.keepClear
//    la glisse de côté (une propriété `translate`), refait à chaque bascule puisque la languette change de hauteur.
// Script classique (pas type="module"), même convention de portée globale que CleanReading ; js/main.js le câble (BarFold.wire).
const BarFold = (function () {
  const BODY_CLASS = 'pp-bar-folded';
  const TAB_ID = 'v2-bar-fold-tab';
  const NOTE_ID = 'v2-bar-fold-note';
  const PANEL_ID = 'toolbar-top';
  const STATUS_ID = 'status-msg';
  let folded = false;
  let tab = null;
  let note = null;
  let release = null; // rend la languette à sa place d'origine (GfsBar.keepClear)

  function isFolded() { return folded; }

  // Le message du coin d'état que le panneau replié ne doit pas cacher : une erreur, ou « modifications non enregistrées ». Une chaîne vide quand il n'y en a pas.
  function urgentStatus() {
    const status = document.getElementById(STATUS_ID);
    if (!status || !(status.classList.contains('error-msg') || status.classList.contains('is-unsaved'))) return { text: '', error: false };
    return { text: status.textContent.trim(), error: status.classList.contains('error-msg') };
  }

  // Le nom de la languette : l'action à faire, la touche qui la fait (choisie dans Réglages > Raccourcis, '' quand elle a été retirée) et, panneau replié,
  // l'alerte du coin d'état.
  function syncTab() {
    if (!tab) return;
    const key = typeof Shortcuts !== 'undefined' ? Shortcuts.label('barFold') : '';
    const action = I18n.t(folded ? 'barFold.unfold' : 'barFold.fold');
    const urgent = folded ? urgentStatus() : { text: '', error: false };
    const name = (key ? action + ' (' + key + ')' : action) + (urgent.text ? ' - ' + urgent.text : '');
    tab.setAttribute('aria-label', name);
    tab.title = name;
    tab.setAttribute('aria-expanded', folded ? 'false' : 'true');
    if (note) { note.hidden = !urgent.text; note.textContent = urgent.text; }
    tab.classList.toggle('has-note', !!urgent.text);
    tab.classList.toggle('is-error', !!urgent.text && urgent.error);
  }

  // GfsBar.keepClear mesure la languette à l'instant où il est appelé, puis à chaque changement de la barre de GFS : on le refait quand la languette a changé de
  // place ou de largeur (panneau replié ou déplié, alerte écrite ou effacée).
  function keepClear() {
    if (release) release();
    release = typeof GfsBar !== 'undefined' && tab ? GfsBar.keepClear(tab) : null;
  }

  function focusAfterFold() {
    const editor = typeof EditorCore !== 'undefined' && EditorCore.getEditor();
    if (editor && editor.isEditable && editor.view && editor.view.dom.getClientRects().length > 0) editor.commands.focus(null, { scrollIntoView: false });
    else if (tab) tab.focus({ preventScroll: true });
  }

  // Replie (true) ou déplie (false) le panneau. Rend faux quand rien ne change.
  function set(value) {
    const next = !!value;
    if (next === folded) return false;
    const panel = document.getElementById(PANEL_ID);
    const focusInside = !!panel && panel.contains(document.activeElement);
    folded = next;
    document.body.classList.toggle(BODY_CLASS, folded);
    syncTab();
    keepClear();
    if (folded && focusInside) focusAfterFold();
    return true;
  }

  function toggle() { return set(!folded); }

  function wire() {
    tab = document.getElementById(TAB_ID);
    if (!tab) return;
    note = document.getElementById(NOTE_ID);
    // Une souris qui appuie sur la languette ne prend pas le focus : le curseur reste dans le texte (comme les lignes de menu de la barre, js/clean-reading.js). Entrée et
    // Espace au clavier passent par le même `click`.
    tab.addEventListener('mousedown', event => event.preventDefault());
    tab.addEventListener('click', toggle);
    const status = document.getElementById(STATUS_ID);
    if (status && typeof MutationObserver === 'function') {
      new MutationObserver(() => { if (folded) { syncTab(); keepClear(); } }).observe(status, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    }
    if (typeof Shortcuts !== 'undefined') Shortcuts.onChange(syncTab);
    syncTab();
    keepClear();
  }

  return { wire, isFolded, set, toggle };
})();
