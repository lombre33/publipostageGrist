// Page du modèle : bouton de la barre du haut, à côté d'Aperçu A4. Un clic tourne la page (portrait / paysage), son menu au survol donne le sens et
// le format (A3, A4, A5, A6 ; js/page-layout.js : FORMATS). Il ne fait que poser PageLayout.setOrientation / setFormat et prévenir l'enregistrement
// automatique (pp:marginsChanged, comme l'onglet Marges des Réglages) : chaque moteur qui montre ou produit une page (aperçu, pagination, Lecture,
// PDF, Word, Excel) relit le sens et le format à PageLayout, et PageLayout annonce le changement (pp:pageLayoutChanged), que js/main.js écoute pour
// réajuster l'éditeur, la pagination, la grille des images en calque et la Lecture : rien n'est rafraîchi d'ici.
// Une icône = une fonction : l'icône montre la page telle qu'elle est (haute en portrait, large en paysage), le bouton est allumé en paysage. Le menu
// répète le sens en toutes lettres (ligne cochée) et porte le format, qu'aucune icône ne dit ; il n'ajoute rien à la barre, qui reste gelée. Après
// les formats, « Format libre… » (cochée, avec la taille en centimètres, quand la page n'est pas un format de la liste) ouvre la fenêtre de la taille
// saisie (js/page-size-dialog.js), qui pose PageLayout.setPageSize par selectPageSize d'ici. Sa dernière ligne, « Filigrane… », ouvre la fenêtre du
// filigrane de la page (js/watermark-dialog.js), un réglage de la page qui suit les mêmes règles (types suivis, lecture seule, export en cours).
const OrientationToggle = (function () {
  const BUTTON_ID = 'btn-page-orientation';
  const FLYOUT_ID = 'v2-page-flyout';
  const A4_TOGGLE_ID = 'v2-a4-toggle';
  const WATERMARK_ROW_ID = 'v2-btn-watermark';
  const CUSTOM_ROW_ID = 'v2-btn-page-custom';
  // La clé (data-page-format) de la ligne « Format libre… » : pas un format de la liste, la ligne se coche quand la page n'en est aucun.
  const CUSTOM_KEY = 'custom';
  // Types de modèle (colonne TypeModele) dont les moteurs suivent le sens et le format de PageLayout. Le bouton et son menu sont grisés pour tous les
  // autres : un réglage qui ne change rien à ce qu'on voit ni à ce qu'on exporte ne doit pas se laisser tourner. Un type s'ajoute ici quand ses
  // moteurs suivent, sans toucher js/main.js.
  // Un macro-modèle porte sa propre page (colonne Margins de sa ligne, comme ses marges) et l'impose aux modèles qu'il assemble : l'assemblage ne
  // reprend que leur contenu (js/macro-templates.js), jamais leur page, donc la Lecture, le PDF et le Word d'un macro-modèle suivent la sienne. Une
  // grille n'a pas de page à l'écran : le sens et le format règlent la page de son PDF et la feuille de son Excel
  // (js/xlsx-export.js:pageOptionsFromLayout).
  const TYPES = ['document', 'macro', 'grille'];
  let currentType = 'document';
  let isReadOnly = () => false;
  let busy = false;
  let menuBuilt = false;

  function button() { return document.getElementById(BUTTON_ID); }
  function menu() { return document.getElementById(FLYOUT_ID); }

  function isEnabledForType(type) { return TYPES.indexOf(type) !== -1; }

  // Un geste de la personne est accepté pour un type suivi, hors export en cours et hors lecture seule (le grisé visuel de la lecture seule vient de
  // js/main.js : READ_ONLY_LOCKED_IDS).
  function canChange() { return isEnabledForType(currentType) && !busy && !isReadOnly(); }

  // Même geste que l'onglet Marges (js/settings.js) : js/main.js écoute cet événement pour marquer le brouillon « modifié » - sans lui, changer
  // seulement le sens ou le format ne déclenchait jamais d'enregistrement automatique.
  function afterChange() {
    sync();
    document.dispatchEvent(new CustomEvent('pp:marginsChanged'));
  }

  function selectOrientation(orientation) {
    if (!canChange() || PageLayout.getOrientation() === orientation) return;
    PageLayout.setOrientation(orientation);
    afterChange();
  }

  function selectFormat(format) {
    if (!canChange() || PageLayout.getFormat() === PageLayout.normalizeFormat(format)) return;
    PageLayout.setFormat(format);
    afterChange();
  }

  // La page saisie dans la fenêtre « Format libre… » (largeur et hauteur en mm, dans le sens où on la voit). Même garde que les autres gestes : un type non suivi, un export
  // en cours ou la lecture seule la refusent, même si la fenêtre était déjà ouverte. Rend vrai si la page a changé.
  function selectPageSize(widthMm, heightMm) {
    if (!canChange() || !PageLayout.setPageSize(widthMm, heightMm)) return false;
    afterChange();
    return true;
  }

  function toggle() {
    selectOrientation(PageLayout.isLandscape() ? PageLayout.PORTRAIT : PageLayout.LANDSCAPE);
  }

  function openPageSize() {
    if (!canChange() || typeof PageSizeDialog === 'undefined') return;
    PageSizeDialog.open();
  }

  function openWatermark() {
    if (!canChange() || typeof WatermarkDialog === 'undefined') return;
    WatermarkDialog.open();
  }

  // Une ligne du menu : un <span> atteignable au clavier (tabindex), comme celles du menu Enregistrer (js/main.js:wireSaveMenu). mousedown ne prend
  // pas le focus (le curseur reste dans le texte), le clic fait perdre le sien à un champ de saisie (nom du modèle en renommage...) avant d'agir,
  // Entrée et Espace font comme le clic.
  function wireRow(row, action) {
    row.addEventListener('mousedown', (event) => event.preventDefault());
    row.addEventListener('click', () => {
      const active = document.activeElement;
      if (active && active !== document.body && !active.closest('.ProseMirror') && active.matches('input, textarea, select')) active.blur();
      action();
    });
    row.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      action();
    });
  }

  function makeRow(attribute, value, action) {
    const row = document.createElement('span');
    row.className = 'v2-hover-row v2-hover-row-check';
    row.setAttribute('role', 'menuitemradio');
    row.setAttribute('aria-checked', 'false');
    row.tabIndex = 0;
    row.setAttribute(attribute, value);
    const name = document.createElement('span');
    name.className = 'v2-page-row-name';
    row.appendChild(name);
    wireRow(row, action);
    return row;
  }

  // Titre, les deux sens, un filet, les formats (lus à PageLayout : un format de plus s'ajoute là-bas et apparaît ici sans autre changement).
  function buildMenu() {
    const host = menu();
    if (!host || menuBuilt) return;
    menuBuilt = true;
    host.textContent = '';
    const title = document.createElement('span');
    title.className = 'v2-hover-flyout-label';
    title.id = 'v2-page-flyout-label';
    host.appendChild(title);
    [PageLayout.PORTRAIT, PageLayout.LANDSCAPE].forEach(orientation => {
      host.appendChild(makeRow('data-page-orientation', orientation, () => selectOrientation(orientation)));
    });
    const separator = document.createElement('span');
    separator.className = 'v2-hover-hsep';
    separator.setAttribute('role', 'separator');
    host.appendChild(separator);
    PageLayout.getFormats().forEach(format => {
      const row = makeRow('data-page-format', format.id, () => selectFormat(format.id));
      row.querySelector('.v2-page-row-name').textContent = format.id;
      const size = document.createElement('span');
      size.className = 'v2-page-row-size';
      size.textContent = format.widthMm + ' × ' + format.heightMm + ' mm';
      row.appendChild(size);
      host.appendChild(row);
    });
    // Le format libre : une ligne cochée quand la page n'est pas un des formats ci-dessus, qui ouvre la fenêtre de la taille en cm ; la taille en cours reste discrète à droite.
    const custom = makeRow('data-page-format', CUSTOM_KEY, openPageSize);
    custom.id = CUSTOM_ROW_ID;
    custom.classList.add('v2-page-custom-row');
    const customSize = document.createElement('span');
    customSize.className = 'v2-page-row-size';
    custom.appendChild(customSize);
    host.appendChild(custom);
    // Le filigrane : une action (une fenêtre), pas un choix à cocher - une ligne de menu comme « Enregistrer sous… », avec le texte en cours à
    // droite.
    const separatorBeforeWatermark = document.createElement('span');
    separatorBeforeWatermark.className = 'v2-hover-hsep';
    separatorBeforeWatermark.setAttribute('role', 'separator');
    host.appendChild(separatorBeforeWatermark);
    const watermark = document.createElement('span');
    watermark.className = 'v2-hover-row v2-page-watermark-row';
    watermark.id = WATERMARK_ROW_ID;
    watermark.setAttribute('role', 'menuitem');
    watermark.tabIndex = 0;
    const watermarkName = document.createElement('span');
    watermarkName.className = 'v2-page-row-name';
    const watermarkText = document.createElement('span');
    watermarkText.className = 'v2-page-row-size';
    watermark.append(watermarkName, watermarkText);
    wireRow(watermark, openWatermark);
    host.appendChild(watermark);
  }

  function syncMenu(supported, landscape, format) {
    const host = menu();
    if (!host) return;
    buildMenu();
    const title = document.getElementById('v2-page-flyout-label');
    if (title) title.textContent = I18n.t(supported ? 'toolbar.page.label' : 'toolbar.page.unavailable');
    const enabled = supported && !busy;
    host.querySelectorAll('.v2-hover-row-check').forEach(row => {
      const orientation = row.getAttribute('data-page-orientation');
      const custom = row.getAttribute('data-page-format') === CUSTOM_KEY;
      const checked = orientation ? (orientation === PageLayout.LANDSCAPE) === landscape : custom ? PageLayout.isCustomFormat(format) : row.getAttribute('data-page-format') === format;
      if (orientation) row.querySelector('.v2-page-row-name').textContent = I18n.t(orientation === PageLayout.LANDSCAPE ? 'toolbar.page.landscape' : 'toolbar.page.portrait');
      if (custom) {
        row.querySelector('.v2-page-row-name').textContent = I18n.t('toolbar.page.custom');
        row.querySelector('.v2-page-row-size').textContent = checked ? PageLayout.getFormatLabel() : '';
      }
      row.setAttribute('aria-checked', checked ? 'true' : 'false');
      row.setAttribute('aria-disabled', enabled ? 'false' : 'true');
      row.classList.toggle('v2-hover-row-disabled', !enabled);
      row.tabIndex = enabled ? 0 : -1;
    });
    const watermarkRow = document.getElementById(WATERMARK_ROW_ID);
    if (watermarkRow) {
      const watermark = PageLayout.getWatermark();
      watermarkRow.querySelector('.v2-page-row-name').textContent = I18n.t('toolbar.page.watermark');
      watermarkRow.querySelector('.v2-page-row-size').textContent = watermark ? watermark.text : '';
      watermarkRow.setAttribute('aria-disabled', enabled ? 'false' : 'true');
      watermarkRow.classList.toggle('v2-hover-row-disabled', !enabled);
      watermarkRow.tabIndex = enabled ? 0 : -1;
    }
  }

  // « Aperçu A4 » devient « Aperçu A5 » (ou « Aperçu 7 × 3,7 cm ») : la case limite l'éditeur à la largeur de la page du modèle, pas d'un A4. `format` : le nom du format
  // dans la phrase (PageLayout.getFormatLabel).
  function syncPreviewToggle(format) {
    const label = document.getElementById(A4_TOGGLE_ID);
    if (!label) return;
    label.setAttribute('data-tip', I18n.t('toolbar.a4.tip', { format }));
    label.setAttribute('aria-label', I18n.t('toolbar.a4.aria', { format }));
  }

  // Recopie l'état réel (sens et format de PageLayout, type du modèle chargé, droits) dans le bouton et son menu : rappelée après chaque chargement
  // de modèle, chaque changement et chaque changement de langue, jamais mise à jour « à la main » ailleurs.
  function sync(typeModele) {
    if (typeModele !== undefined) currentType = typeModele || 'document';
    const btn = button();
    if (!btn) return;
    const supported = isEnabledForType(currentType);
    const landscape = PageLayout.isLandscape();
    const format = PageLayout.getFormat();
    const formatName = PageLayout.getFormatLabel();
    const label = !supported ? I18n.t('toolbar.orientation.unavailable')
      : I18n.t(landscape ? 'toolbar.orientation.landscape' : 'toolbar.orientation.portrait', { format: formatName });
    btn.dataset.orientation = landscape ? 'landscape' : 'portrait';
    btn.setAttribute('aria-pressed', landscape ? 'true' : 'false');
    btn.setAttribute('aria-label', label);
    btn.classList.toggle('active', supported && landscape);
    btn.disabled = !supported || busy;
    syncPreviewToggle(formatName);
    syncMenu(supported, landscape, format);
  }

  // Pendant un export : le sens et le format lus au départ d'un lot ne doivent pas changer sous lui (js/main.js:withExportLock).
  function setBusy(value) { busy = !!value; sync(); }

  // isReadOnlyFn : droits (js/main.js) - le geste lui-même est refusé en lecture seule, le grisé visuel vient de js/main.js (READ_ONLY_LOCKED_IDS).
  function wire(options) {
    if (options && typeof options.isReadOnly === 'function') isReadOnly = options.isReadOnly;
    const btn = button();
    if (!btn) return;
    buildMenu();
    btn.addEventListener('click', toggle);
    I18n.onChange(() => sync());
    // Le filigrane change depuis sa fenêtre : la ligne du menu en montre le texte.
    document.addEventListener('pp:watermarkChanged', () => sync());
    // La page change de taille depuis la fenêtre « Format libre… » (ou d'un autre module) : le bouton, la case Aperçu et le menu la relisent.
    document.addEventListener('pp:pageLayoutChanged', () => sync());
    sync();
  }

  return { TYPES, wire, sync, toggle, selectOrientation, selectFormat, selectPageSize, setBusy };
})();
