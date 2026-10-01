// Bascule portrait / paysage de la page - bouton de la barre du haut, à côté d'Aperçu A4. Ne fait que poser PageLayout.setOrientation (js/page-layout.js) et
// prévenir l'enregistrement automatique (pp:marginsChanged, comme l'onglet Marges des Réglages) : chaque moteur qui montre ou produit une page (aperçu,
// pagination, Lecture, PDF, Word, Excel) relit l'orientation à PageLayout, rien n'est rafraîchi d'ici : le changement d'orientation est annoncé par
// PageLayout (pp:pageLayoutChanged), que js/main.js écoute pour réajuster l'éditeur, la pagination, la grille des images en calque et la Lecture.
// Une icône = une fonction : l'icône montre la page telle qu'elle est (haute en portrait, large en paysage), le bouton est allumé en paysage.
const OrientationToggle = (function () {
  const BUTTON_ID = 'btn-page-orientation';
  // Types de modèle (colonne TypeModele) dont les moteurs suivent l'orientation de PageLayout. Le bouton est grisé pour tous les autres : un réglage qui
  // ne change rien à ce qu'on voit ni à ce qu'on exporte ne doit pas se laisser tourner. Un type s'ajoute ICI, quand ses moteurs suivent - sans toucher
  // js/main.js.
  const TYPES = ['document'];
  let currentType = 'document';
  let isReadOnly = () => false;
  let busy = false;

  function button() { return document.getElementById(BUTTON_ID); }

  function isEnabledForType(type) { return TYPES.indexOf(type) !== -1; }

  // Recopie l'état RÉEL (orientation de PageLayout, type du modèle chargé, droits) dans le bouton : rappelée après chaque chargement de modèle, chaque
  // bascule et chaque changement de langue, jamais mise à jour « à la main » ailleurs.
  function sync(typeModele) {
    if (typeModele !== undefined) currentType = typeModele || 'document';
    const btn = button();
    if (!btn) return;
    const supported = isEnabledForType(currentType);
    const landscape = PageLayout.isLandscape();
    const label = !supported ? I18n.t('toolbar.orientation.unavailable')
      : landscape ? I18n.t('toolbar.orientation.landscape') : I18n.t('toolbar.orientation.portrait');
    btn.dataset.orientation = landscape ? 'landscape' : 'portrait';
    btn.setAttribute('aria-pressed', landscape ? 'true' : 'false');
    btn.setAttribute('aria-label', label);
    btn.setAttribute('data-tip', label);
    btn.classList.toggle('active', supported && landscape);
    btn.disabled = !supported || busy;
  }

  function toggle() {
    if (!isEnabledForType(currentType) || busy || isReadOnly()) return;
    PageLayout.setOrientation(PageLayout.isLandscape() ? PageLayout.PORTRAIT : PageLayout.LANDSCAPE);
    sync();
    // Même signal que l'onglet Marges (js/settings.js) : js/main.js l'écoute pour marquer le brouillon « modifié » - sans lui, changer seulement l'orientation
    // ne déclenchait jamais d'enregistrement automatique.
    document.dispatchEvent(new CustomEvent('pp:marginsChanged'));
  }

  // Pendant un export : l'orientation lue au départ d'un lot ne doit pas changer sous lui (js/main.js:withExportLock).
  function setBusy(value) { busy = !!value; sync(); }

  // isReadOnlyFn : droits (js/main.js) - le geste lui-même est refusé en lecture seule, le grisé visuel vient de js/main.js (READ_ONLY_LOCKED_IDS).
  function wire(options) {
    if (options && typeof options.isReadOnly === 'function') isReadOnly = options.isReadOnly;
    const btn = button();
    if (!btn) return;
    btn.addEventListener('click', toggle);
    I18n.onChange(() => sync());
    sync();
  }

  return { BUTTON_ID, TYPES, wire, sync, toggle, setBusy };
})();
