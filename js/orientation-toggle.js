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
// Le menu d'un macro-modèle a une ligne de plus, la première : « Selon chaque modèle » (PageLayout.setOrientationAuto), où chaque modèle assemblé garde le sens de sa page ;
// « Portrait » et « Paysage » l'imposent à tous, comme avant. Les autres types n'ont pas cette ligne : leur menu reste celui d'avant.
// Le menu d'une présentation parle de « Diapositive » (le bouton, le titre du menu, la case Aperçu) et a, sous le titre, les rapports de la diapositive en un contrôle segmenté : 16:9, 4:3, 16:10 et 1:1 (PageLayout.getSlideRatios,
// tous de la même hauteur : le texte garde sa taille). Les formats de papier et « Format libre… » restent dessous ; « Format libre… » n'est cochée que pour une page qui n'est aucun des quatre rapports.
// Le menu d'un document a un choix de plus, sous le titre : « Tout le document » (le sens de toutes les pages, comme avant) ou « Cette page » (la page du curseur, ou les pages que la sélection touche : les autres
// gardent leur sens ; js/page-sense-edit.js écrit les sauts de page qui le disent). Le clic sur le bouton lui-même tourne toujours le document entier. « Cette page » est grisée, avec sa raison, quand le menu ne peut pas
// désigner de page (sans l'Aperçu de la page, en Lecture, en écriture d'en-tête ou de pied, curseur dans une zone à deux colonnes coupée) ; le sens qui demanderait un saut de page au milieu d'un tableau l'est aussi.
// Le menu repart de « Tout le document » à chaque ouverture : « Cette page » vaut le temps du survol. Remettre dans le même sens un document aux pages tournées une à une demande une confirmation (c'est défaire un travail page
// par page). Chaque geste du menu entre dans l'historique d'Annuler / Rétablir (js/history-markers.js) : Ctrl + Z rend le sens, le format et la taille d'avant, et avec eux les sauts de page qu'un « Cette page » avait écrits.
const OrientationToggle = (function () {
  const BUTTON_ID = 'btn-page-orientation';
  const FLYOUT_ID = 'v2-page-flyout';
  const A4_TOGGLE_ID = 'v2-a4-toggle';
  const WATERMARK_ROW_ID = 'v2-btn-watermark';
  const THEME_ROW_ID = 'v2-btn-slide-theme';
  const CUSTOM_ROW_ID = 'v2-btn-page-custom';
  // La clé (data-page-format) de la ligne « Format libre… » : pas un format de la liste, la ligne se coche quand la page n'en est aucun.
  const CUSTOM_KEY = 'custom';
  // La clé (data-page-orientation) de la ligne « Selon chaque modèle » : le troisième choix du sens, propre au macro-modèle.
  const AUTO_KEY = 'auto';
  const MACRO_TYPE = 'macro';
  const DOCUMENT_TYPE = 'document';
  const PRESENTATION_TYPE = 'presentation';
  const GROUP_ID = 'v2-page-group';
  const SCOPE_ID = 'v2-page-scope';
  const RATIOS_ID = 'v2-page-ratios';
  // Ce à quoi s'applique le sens choisi dans le menu d'un document (data-page-scope).
  const SCOPE_DOCUMENT = 'document';
  const SCOPE_PAGE = 'page';
  // Types de modèle (colonne TypeModele) dont les moteurs suivent le sens et le format de PageLayout. Le bouton et son menu sont grisés pour tous les
  // autres : un réglage qui ne change rien à ce qu'on voit ni à ce qu'on exporte ne doit pas se laisser tourner. Un type s'ajoute ici quand ses
  // moteurs suivent, sans toucher js/main.js.
  // Un macro-modèle porte sa propre page (colonne Margins de sa ligne, comme ses marges) et l'impose aux modèles qu'il assemble : l'assemblage ne
  // reprend que leur contenu (js/macro-templates.js), jamais leur page, donc la Lecture, le PDF et le Word d'un macro-modèle suivent la sienne. Une
  // grille n'a pas de page à l'écran : le sens et le format règlent la page de son PDF et la feuille de son Excel
  // (js/xlsx-export.js:pageOptionsFromLayout). Une présentation est un document dont la page est une diapositive 16:9 (js/slides-entry.js) : elle part de ce format, et son menu le change
  // comme celui d'un document.
  const TYPES = ['document', 'macro', 'grille', 'presentation'];
  let currentType = 'document';
  let isReadOnly = () => false;
  let busy = false;
  let menuBuilt = false;
  // « Tout le document » ou « Cette page », et le document tel que le menu le voit (PageSenseEdit.inspect, relu à chaque sync) ; nul hors du type Document.
  let scope = SCOPE_DOCUMENT;
  let docState = null;

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

  // Le document tel que le menu le voit : ses pages tournées une à une, et la page du curseur (js/page-sense-edit.js). Nul hors du type Document, et quand l'éditeur ne peut pas le dire.
  function readDocState() {
    if (currentType !== DOCUMENT_TYPE) return null;
    try {
      return PageSenseEdit.inspect(EditorCore.getEditor());
    } catch (error) {
      console.warn('[OrientationToggle] le document ne se laisse pas lire', error);
      return null;
    }
  }

  // Le sens choisi dans le menu : celui de la page du curseur en « Cette page », celui de tout le document sinon.
  function selectOrientation(orientation) {
    if (!canChange()) return undefined;
    if (scope === SCOPE_PAGE && currentType === DOCUMENT_TYPE) return selectPageOrientation(orientation);
    return selectDocumentOrientation(orientation);
  }

  // Tout le document. Sans page tournée une à une, c'est le sens des marges, comme toujours ; avec, les sauts de page ne tournent plus rien (PageSenseEdit.turnDocument) et le sens des marges est celui choisi.
  function selectDocumentOrientation(orientation) {
    if (!canChange()) return undefined;
    const info = readDocState();
    if (!info || !info.turned) {
      // Un macro-modèle « Selon chaque modèle » est en portrait pour PageLayout : choisir « Portrait » l'impose quand même.
      if (PageLayout.getOrientation() === orientation && !PageLayout.isOrientationAuto()) return undefined;
      HistoryMarkers.track('page', () => PageLayout.setOrientation(orientation));
      afterChange();
      return undefined;
    }
    // L'éditeur montre l'en-tête ou le pied, le document attend à côté : ses sauts de page ne se changent pas d'ici (le menu le dit).
    if (info.hf) return undefined;
    return turnWholeDocument(orientation, info);
  }

  // Remettre dans le même sens un document dont des pages sont tournées une à une défait ce travail : la personne le confirme d'abord. Sans page de l'autre sens (des sauts qui ne tournent plus rien), rien à confirmer.
  async function turnWholeDocument(orientation, info) {
    if (info.mixed) {
      const landscape = orientation === PageLayout.LANDSCAPE;
      const confirmed = await Dialogs.confirm({
        title: I18n.t(landscape ? 'toolbar.page.confirm.landscape.title' : 'toolbar.page.confirm.portrait.title'),
        message: I18n.t('toolbar.page.confirm.message'),
        confirmLabel: I18n.t(landscape ? 'toolbar.page.confirm.landscape.ok' : 'toolbar.page.confirm.portrait.ok'),
      });
      // Pendant la question, un export a pu partir : mêmes gardes qu'au clic.
      if (!confirmed || !canChange()) return false;
    }
    // Les sauts de page et le sens des marges sont un seul geste : un seul Ctrl + Z les rend ensemble.
    HistoryMarkers.track('page', () => {
      PageSenseEdit.turnDocument(EditorCore.getEditor());
      if (PageLayout.getOrientation() !== orientation || PageLayout.isOrientationAuto()) PageLayout.setOrientation(orientation);
    });
    afterChange();
    return true;
  }

  // Cette page : la page du curseur (ou les pages que la sélection touche) prend le sens, les autres gardent le leur. Le sens des marges ne change que si c'est la première page qui tourne.
  function selectPageOrientation(orientation) {
    const editor = EditorCore.getEditor();
    // Les sauts de page écrits dans le texte et le sens des marges sont un seul geste : un seul Ctrl + Z les rend ensemble.
    const gesture = HistoryMarkers.begin('page');
    const turned = PageSenseEdit.turnPages(editor, orientation);
    if (!turned.ok || !turned.changed) { sync(); return turned.ok; }
    const marginsChanged = turned.base !== PageLayout.getOrientation();
    if (marginsChanged) PageLayout.setOrientation(turned.base);
    gesture.commit();
    // Les sauts posés ou retirés (et le sens des marges) déplacent les pages : la pagination les suit tout de suite, sans attendre la sienne (200 ms), pour que le menu relise les bonnes pages.
    Editor.refreshPaginationPreview();
    // Le zoom de la feuille change quand la première page paysage apparaît (ou disparaît) : le curseur reste dans le panneau.
    editor.view.dispatch(editor.state.tr.scrollIntoView());
    // Un saut posé ou retiré a changé le texte : l'enregistrement automatique le sait par l'éditeur ; le sens des marges, lui, le dit par pp:marginsChanged.
    if (marginsChanged) afterChange(); else sync();
    return true;
  }

  // Le choix « Tout le document / Cette page » du menu. « Cette page » ne se choisit que quand le menu peut désigner une page.
  function selectScope(value) {
    if (!canChange() || currentType !== DOCUMENT_TYPE) return false;
    docState = readDocState();
    if (value === SCOPE_PAGE && (!docState || docState.pages.reason)) return false;
    scope = value === SCOPE_PAGE ? SCOPE_PAGE : SCOPE_DOCUMENT;
    sync();
    return true;
  }

  // Le menu repart de « Tout le document » : « Cette page » ne vaut que le temps du survol.
  function resetScope() {
    if (scope === SCOPE_DOCUMENT) return;
    scope = SCOPE_DOCUMENT;
    sync();
  }

  // « Selon chaque modèle » : chaque modèle du macro-modèle garde le sens de sa page. Réservé au macro-modèle ; les mêmes gardes que les autres gestes.
  function selectAuto() {
    if (!canChange() || currentType !== MACRO_TYPE || PageLayout.isOrientationAuto()) return;
    HistoryMarkers.track('page', () => PageLayout.setOrientationAuto(true));
    afterChange();
  }

  function selectFormat(format) {
    if (!canChange() || PageLayout.getFormat() === PageLayout.normalizeFormat(format)) return;
    HistoryMarkers.track('page', () => PageLayout.setFormat(format));
    afterChange();
  }

  // La page saisie dans la fenêtre « Format libre… » (largeur et hauteur en mm, dans le sens où on la voit). Même garde que les autres gestes : un
  // type non suivi, un export en cours ou la lecture seule la refusent, même si la fenêtre était déjà ouverte. Rend vrai si la page a changé.
  function selectPageSize(widthMm, heightMm) {
    if (!canChange() || !HistoryMarkers.track('page', () => PageLayout.setPageSize(widthMm, heightMm))) return false;
    afterChange();
    return true;
  }

  // Le bouton lui-même tourne toujours le document entier, quel que soit le choix du menu (qui repart alors de « Tout le document »).
  function toggle() {
    resetScope();
    return selectDocumentOrientation(PageLayout.isLandscape() ? PageLayout.PORTRAIT : PageLayout.LANDSCAPE);
  }

  function openPageSize() {
    if (!canChange() || typeof PageSizeDialog === 'undefined') return;
    PageSizeDialog.open();
  }

  function openWatermark() {
    if (!canChange() || typeof WatermarkDialog === 'undefined') return;
    WatermarkDialog.open();
  }
  // « Thème… » : la fenêtre du thème de la présentation (SlidesEntry.openTheme : sans l'extension, elle explique ; avec elle, le code se charge d'abord).
  function openTheme() {
    if (!canChange() || currentType !== PRESENTATION_TYPE) return;
    SlidesEntry.openTheme();
  }

  // Une ligne du menu : un <span> atteignable au clavier (tabindex), comme celles du menu Enregistrer (js/main.js:wireSaveMenu). mousedown ne prend
  // pas le focus (le curseur reste dans le texte), le clic fait perdre le sien à un champ de saisie (nom du modèle en renommage...) avant d'agir,
  // Entrée et Espace font comme le clic.
  function wireRow(row, action) {
    row.addEventListener('mousedown', (event) => event.preventDefault());
    row.addEventListener('click', () => {
      const active = document.activeElement;
      if (EditorCore.isFormFieldFocus(active)) active.blur();
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

  // Un contrôle segmenté dans un bloc de groupe caché jusqu'à sa synchronisation (« Tout le document / Cette page », les rapports d'une diapositive) : ses choix sont des <span>, comme les lignes du menu.
  function makeSegmentedBlock(className, id, choices) {
    const block = document.createElement('div');
    block.className = className;
    block.id = id;
    block.setAttribute('role', 'group');
    block.hidden = true;
    const control = document.createElement('span');
    control.className = 'v2-segmented';
    choices.forEach(({ attribute, value, text, action }) => {
      const choice = document.createElement('span');
      choice.className = 'v2-segmented-btn';
      choice.setAttribute('role', 'menuitemradio');
      choice.setAttribute('aria-checked', 'false');
      choice.setAttribute(attribute, value);
      choice.tabIndex = 0;
      if (text !== undefined) choice.textContent = text;
      wireRow(choice, action);
      control.appendChild(choice);
    });
    block.appendChild(control);
    return block;
  }
  // Un filet entre deux groupes de lignes du menu.
  function makeSeparator() {
    const separator = document.createElement('span');
    separator.className = 'v2-hover-hsep';
    separator.setAttribute('role', 'separator');
    return separator;
  }
  // Une action (une fenêtre), pas un choix à cocher : une ligne de menu avec son nom et le texte en cours à droite (le filigrane, le thème).
  function makeActionRow(id, action) {
    const row = document.createElement('span');
    row.className = 'v2-hover-row v2-page-watermark-row';
    row.id = id;
    row.setAttribute('role', 'menuitem');
    row.tabIndex = 0;
    const name = document.createElement('span');
    name.className = 'v2-page-row-name';
    const value = document.createElement('span');
    value.className = 'v2-page-row-size';
    row.append(name, value);
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
    // « Tout le document / Cette page » : deux choix d'un même groupe, posés sous le titre ; syncMenu les montre dans le menu d'un document seulement. Des <span>, comme les lignes : un <button> prendrait les
    // dimensions et l'icône de ceux de la barre (#toolbar-top button).
    host.appendChild(makeSegmentedBlock('v2-page-scope-block', SCOPE_ID,
      [SCOPE_DOCUMENT, SCOPE_PAGE].map(value => ({ attribute: 'data-page-scope', value, action: () => selectScope(value) }))));
    // Les rapports de la diapositive : le même contrôle segmenté, sous le titre du menu d'une présentation seulement (syncRatios). Le texte de chaque choix est le rapport lui-même, qu'aucune langue ne traduit.
    host.appendChild(makeSegmentedBlock('v2-page-scope-block v2-page-ratio-block', RATIOS_ID,
      PageLayout.getSlideRatios().map(slide => ({ attribute: 'data-page-ratio', value: slide.id, text: slide.ratio, action: () => selectFormat(slide.id) }))));
    [PageLayout.PORTRAIT, PageLayout.LANDSCAPE].forEach(orientation => {
      host.appendChild(makeRow('data-page-orientation', orientation, () => selectOrientation(orientation)));
    });
    host.appendChild(makeSeparator());
    PageLayout.getFormats().forEach(format => {
      const row = makeRow('data-page-format', format.id, () => selectFormat(format.id));
      row.querySelector('.v2-page-row-name').textContent = format.id;
      const size = document.createElement('span');
      size.className = 'v2-page-row-size';
      size.textContent = format.widthMm + ' × ' + format.heightMm + ' mm';
      row.appendChild(size);
      host.appendChild(row);
    });
    // Le format libre : une ligne cochée quand la page n'est pas un des formats ci-dessus, qui ouvre la fenêtre de la taille en cm ; la taille en
    // cours reste discrète à droite.
    const custom = makeRow('data-page-format', CUSTOM_KEY, openPageSize);
    custom.id = CUSTOM_ROW_ID;
    custom.classList.add('v2-page-custom-row');
    const customSize = document.createElement('span');
    customSize.className = 'v2-page-row-size';
    custom.appendChild(customSize);
    host.appendChild(custom);
    // Le filigrane : une action (une fenêtre), pas un choix à cocher - une ligne de menu comme « Enregistrer sous… », avec le texte en cours à
    // droite.
    host.appendChild(makeSeparator());
    host.appendChild(makeActionRow(WATERMARK_ROW_ID, openWatermark));
  }

  // La ligne « Thème… » (js/slide-theme.js) : une action (une fenêtre) comme le filigrane, avec le nom du thème en cours à droite. Posée avant le filigrane (qui reste la dernière ligne) dans le menu d'une présentation,
  // retirée des autres types : leur menu reste celui d'avant.
  function makeThemeRow() { return makeActionRow(THEME_ROW_ID, openTheme); }
  function syncThemeRow(host, presentation) {
    let row = document.getElementById(THEME_ROW_ID);
    if (presentation && !row) {
      row = makeThemeRow();
      host.insertBefore(row, document.getElementById(WATERMARK_ROW_ID));
    } else if (!presentation && row) {
      row.remove();
      row = null;
    }
    return row;
  }

  // La ligne « Selon chaque modèle » : posée en tête du menu d'un macro-modèle, retirée des autres types (leur menu reste celui d'avant).
  function syncAutoRow(host, macro) {
    let row = host.querySelector('[data-page-orientation="' + AUTO_KEY + '"]');
    if (macro && !row) {
      row = makeRow('data-page-orientation', AUTO_KEY, selectAuto);
      host.insertBefore(row, host.querySelector('[data-page-orientation="' + PageLayout.PORTRAIT + '"]'));
    } else if (!macro && row) {
      row.remove();
    }
  }

  // Le choix « Tout le document / Cette page » : dans le menu d'un document seulement. « Cette page » est grisée, avec sa raison en info-bulle, quand le menu ne peut pas désigner de page ; elle devient « Ces pages »
  // quand la sélection en touche plusieurs. `formatName` : le nom du format dans la phrase (comme « Aperçu {format} »).
  function syncScope(host, scoped, enabled, formatName) {
    host.classList.toggle('v2-page-flyout-scoped', scoped);
    const block = document.getElementById(SCOPE_ID);
    if (!block) return;
    block.hidden = !scoped;
    if (!scoped) return;
    const pages = docState ? docState.pages : null;
    const reason = !pages ? '' : pages.reason ? I18n.t('toolbar.page.scope.' + pages.reason, { format: formatName }) : '';
    block.setAttribute('aria-label', I18n.t('toolbar.page.scope.aria'));
    block.querySelectorAll('[data-page-scope]').forEach(choice => {
      const page = choice.getAttribute('data-page-scope') === SCOPE_PAGE;
      const off = !enabled || (page && (!pages || !!pages.reason));
      const checked = choice.getAttribute('data-page-scope') === scope;
      choice.textContent = I18n.t(page ? (pages && pages.count > 1 ? 'toolbar.page.scope.pages' : 'toolbar.page.scope.page') : 'toolbar.page.scope.document');
      choice.setAttribute('aria-checked', checked ? 'true' : 'false');
      choice.setAttribute('aria-disabled', off ? 'true' : 'false');
      choice.classList.toggle('active', checked);
      choice.classList.toggle('is-disabled', off);
      if (page && off && reason) choice.title = reason; else choice.removeAttribute('title');
    });
  }

  // Les rapports de la diapositive (16:9, 4:3, 16:10, 1:1) : dans le menu d'une présentation seulement. Celui de la page est coché, dans l'un ou l'autre sens (le format s'écrit côté court d'abord) ; chacun a son nom en info-bulle
  // (« Standard (4:3) »), que lit aussi un lecteur d'écran. `format` : l'identifiant du format de la page (PageLayout.getFormat).
  function syncRatios(host, on, enabled, format) {
    host.classList.toggle('v2-page-flyout-ratios', on);
    const block = document.getElementById(RATIOS_ID);
    if (!block) return;
    block.hidden = !on;
    if (!on) return;
    block.setAttribute('aria-label', I18n.t('toolbar.page.ratio.aria'));
    block.querySelectorAll('[data-page-ratio]').forEach(choice => {
      const slide = PageLayout.getSlideRatios().find(r => r.id === choice.getAttribute('data-page-ratio'));
      const checked = !!slide && slide.id === format;
      const name = slide ? I18n.t('toolbar.page.ratio.' + slide.ratio.replace(':', '-')) : '';
      choice.setAttribute('aria-checked', checked ? 'true' : 'false');
      choice.setAttribute('aria-disabled', enabled ? 'false' : 'true');
      choice.setAttribute('aria-label', name);
      choice.title = name;
      choice.classList.toggle('active', checked);
      choice.classList.toggle('is-disabled', !enabled);
    });
  }

  // Ce que le menu d'un document coche pour un sens : le sens des marges d'ordinaire ; en « Cette page », celui de la page du curseur (rien si la sélection touche des pages de deux sens) ; en « Tout le document » d'un
  // document aux pages mêlées, rien (aucun sens n'est celui de tout le document).
  function senseChecked(orientation, landscape, scoped) {
    if (scoped && docState) {
      if (scope === SCOPE_PAGE) return docState.pages.sense === orientation;
      if (docState.mixed) return false;
    }
    return (orientation === PageLayout.LANDSCAPE) === landscape;
  }

  // Pourquoi un sens ne se choisit pas ici (l'info-bulle de sa ligne grisée), ou '' : en écriture d'en-tête ou de pied, le document attend à côté ; en « Cette page », le menu ne peut pas désigner de page (le curseur a changé de zone, l'Aperçu
  // s'est éteint : le choix reste, grisé, jusqu'à ce qu'on en prenne un autre) ou un saut devrait se poser au milieu d'un tableau ou d'une zone.
  function senseReason(orientation, scoped) {
    if (!scoped || !docState) return '';
    if (scope === SCOPE_PAGE) {
      const pages = docState.pages;
      if (pages.reason) return I18n.t('toolbar.page.scope.' + pages.reason, { format: PageLayout.getFormatLabel() });
      return pages.blocked[orientation] ? I18n.t('toolbar.page.scope.' + pages.blocked[orientation]) : '';
    }
    return docState.hf && docState.turned ? I18n.t('toolbar.page.docHf') : '';
  }

  function syncMenu(supported, landscape, format, auto, formatName) {
    const host = menu();
    if (!host) return;
    buildMenu();
    syncAutoRow(host, supported && currentType === MACRO_TYPE);
    const title = document.getElementById('v2-page-flyout-label');
    const slide = supported && currentType === PRESENTATION_TYPE;
    const titleText = I18n.t(!supported ? 'toolbar.page.unavailable' : slide ? 'toolbar.page.label.slide' : 'toolbar.page.label');
    if (title) title.textContent = titleText;
    host.setAttribute('aria-label', titleText);
    const enabled = supported && !busy;
    // Pourquoi tout le menu est grisé : un email n'a pas de page ; pendant un export, le sens et le format sont lus au départ.
    const offReason = !supported ? I18n.t('lock.email') : busy ? I18n.t('lock.pageBusy') : '';
    const scoped = supported && currentType === DOCUMENT_TYPE;
    syncScope(host, scoped, enabled, formatName);
    syncRatios(host, slide, enabled, format);
    host.querySelectorAll('.v2-hover-row-check').forEach(row => {
      const orientation = row.getAttribute('data-page-orientation');
      const custom = row.getAttribute('data-page-format') === CUSTOM_KEY;
      // Un sens imposé n'est coché que sans « Selon chaque modèle » ; celui-ci l'est seul quand il est posé.
      // « Format libre… » est cochée pour une page qui n'est aucun format de la liste ; dans une présentation, un des quatre rapports de la diapositive est un choix du contrôle du haut, pas un format libre.
      const checked = orientation === AUTO_KEY ? auto : orientation ? !auto && senseChecked(orientation, landscape, scoped) : custom ? PageLayout.isCustomFormat(format) && !(slide && PageLayout.isSlideFormat(format)) : row.getAttribute('data-page-format') === format;
      if (orientation) row.querySelector('.v2-page-row-name').textContent = I18n.t(orientation === AUTO_KEY ? 'toolbar.page.auto' : orientation === PageLayout.LANDSCAPE ? 'toolbar.page.landscape' : 'toolbar.page.portrait');
      if (custom) {
        row.querySelector('.v2-page-row-name').textContent = I18n.t('toolbar.page.custom');
        row.querySelector('.v2-page-row-size').textContent = checked ? PageLayout.getFormatLabel() : '';
      }
      const reason = orientation && orientation !== AUTO_KEY ? senseReason(orientation, scoped) : '';
      const rowEnabled = enabled && !reason;
      row.setAttribute('aria-checked', checked ? 'true' : 'false');
      row.setAttribute('aria-disabled', rowEnabled ? 'false' : 'true');
      row.classList.toggle('v2-hover-row-disabled', !rowEnabled);
      row.tabIndex = rowEnabled ? 0 : -1;
      // Grisée, la ligne dit pourquoi (js/lock-reasons.js, cause « mode » : le clic ne fait rien, le coin d'état dit pourquoi) : la raison de son sens, sinon celle du menu entier.
      LockReasons.set(row, 'mode', rowEnabled ? '' : reason || offReason);
    });
    const watermarkRow = document.getElementById(WATERMARK_ROW_ID);
    if (watermarkRow) {
      const watermark = PageLayout.getWatermark();
      watermarkRow.querySelector('.v2-page-row-name').textContent = I18n.t('toolbar.page.watermark');
      watermarkRow.querySelector('.v2-page-row-size').textContent = watermark ? watermark.text : '';
      watermarkRow.setAttribute('aria-disabled', enabled ? 'false' : 'true');
      watermarkRow.classList.toggle('v2-hover-row-disabled', !enabled);
      watermarkRow.tabIndex = enabled ? 0 : -1;
      LockReasons.set(watermarkRow, 'mode', enabled ? '' : offReason);
    }
    // La ligne du thème : dans le menu d'une présentation seulement ; grisée avec sa raison quand l'extension est éteinte (son clic explique).
    const presentation = supported && currentType === PRESENTATION_TYPE;
    const themeRow = syncThemeRow(host, presentation);
    if (themeRow) {
      const off = !SlidesEntry.isAvailable();
      const themeEnabled = enabled && !off;
      themeRow.querySelector('.v2-page-row-name').textContent = I18n.t('toolbar.page.theme');
      const theme = PageLayout.getTheme();
      themeRow.querySelector('.v2-page-row-size').textContent = theme ? SlideTheme.displayName(theme) : '';
      themeRow.setAttribute('aria-disabled', themeEnabled ? 'false' : 'true');
      themeRow.classList.toggle('v2-hover-row-disabled', !themeEnabled);
      themeRow.tabIndex = themeEnabled ? 0 : -1;
      if (off) themeRow.title = SlidesEntry.reason(); else themeRow.removeAttribute('title');
    }
  }

  // « Aperçu A4 » devient « Aperçu A5 » (ou « Aperçu 7 × 3,7 cm ») : la case limite l'éditeur à la largeur de la page du modèle, pas d'un A4.
  // `format` : le nom du format dans la phrase (PageLayout.getFormatLabel).
  function syncPreviewToggle(format, slide) {
    const label = document.getElementById(A4_TOGGLE_ID);
    if (!label) return;
    label.setAttribute('data-tip', I18n.t('toolbar.a4.tip', { format }));
    label.setAttribute('aria-label', I18n.t(slide ? 'toolbar.a4.slide.aria' : 'toolbar.a4.aria', { format }));
  }

  // Recopie l'état réel (sens et format de PageLayout, type du modèle chargé, droits) dans le bouton et son menu : rappelée après chaque chargement
  // de modèle, chaque changement, jamais mise à jour « à la main » ailleurs.
  function sync(typeModele) {
    // Un autre modèle (le rappel de js/main.js à chaque chargement) : le menu repart de « Tout le document ».
    if (typeModele !== undefined) { currentType = typeModele || 'document'; scope = SCOPE_DOCUMENT; }
    const btn = button();
    if (!btn) return;
    const supported = isEnabledForType(currentType);
    docState = supported ? readDocState() : null;
    const landscape = PageLayout.isLandscape();
    // « Selon chaque modèle » : le bouton n'est pas allumé (aucun sens n'est imposé), son icône reste la page haute, un clic impose le paysage.
    const auto = supported && currentType === MACRO_TYPE && PageLayout.isOrientationAuto();
    const format = PageLayout.getFormat();
    const formatName = PageLayout.getFormatLabel();
    // Des pages tournées une à une : le bouton le dit (il tourne alors tout le document, après confirmation) ; en écriture d'en-tête ou de pied, il est grisé avec sa raison.
    const waiting = !!docState && docState.hf && docState.turned;
    const mixed = !!docState && docState.mixed;
    // Dans une présentation, la page est une diapositive : le bouton le dit (« Diapositive 16:9 en paysage... »).
    const slide = supported && currentType === PRESENTATION_TYPE;
    const sense = (slide ? 'toolbar.orientation.slide.' : 'toolbar.orientation.') + (landscape ? 'landscape' : 'portrait');
    const label = !supported ? I18n.t('toolbar.orientation.unavailable')
      : waiting ? I18n.t('toolbar.orientation.docHf')
      : mixed ? I18n.t(landscape ? 'toolbar.orientation.mixedToPortrait' : 'toolbar.orientation.mixedToLandscape', { format: formatName })
      : I18n.t(auto ? 'toolbar.orientation.auto' : sense, { format: formatName });
    btn.dataset.orientation = auto ? AUTO_KEY : landscape ? 'landscape' : 'portrait';
    btn.setAttribute('aria-pressed', landscape ? 'true' : 'false');
    btn.setAttribute('aria-label', label);
    btn.classList.toggle('active', supported && landscape);
    btn.disabled = !supported || busy || waiting;
    // Grisé, il dit pourquoi en info-bulle (cause « state » de js/lock-reasons.js : un bouton `disabled` ne reçoit pas le clic) : un email n'a pas de page, un export lit le sens et le format au départ, des pages tournées une à une attendent l'en-tête.
    LockReasons.set(btn, 'state', !supported ? I18n.t('lock.email') : busy ? I18n.t('lock.pageBusy') : waiting ? I18n.t('lock.pageDocHf') : '');
    syncPreviewToggle(formatName, slide);
    syncMenu(supported, landscape, format, auto, formatName);
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
    wireScope();
    // Le filigrane change depuis sa fenêtre : la ligne du menu en montre le texte.
    document.addEventListener('pp:watermarkChanged', () => sync());
    // Le thème change depuis sa fenêtre, ou à un Ctrl+Z : la ligne du menu en montre le nom.
    document.addEventListener('pp:themeChanged', () => sync());
    // La page change de taille depuis la fenêtre « Format libre… » (ou d'un autre module) : le bouton, la case Aperçu et le menu la relisent.
    document.addEventListener('pp:pageLayoutChanged', () => sync());
    sync();
  }

  // « Cette page » est celle où est le curseur AU MOMENT où le menu s'ouvre (le curseur ne bouge plus tant que la souris ou le focus est dans le menu) : le survol, ou le focus au clavier, relit le document. Le menu repart de
  // « Tout le document » dès que la souris et le focus l'ont quitté.
  function wireScope() {
    const group = document.getElementById(GROUP_ID);
    if (!group) return;
    group.addEventListener('mouseenter', () => sync());
    group.addEventListener('focusin', () => sync());
    group.addEventListener('mouseleave', () => { if (!group.contains(document.activeElement)) resetScope(); });
    group.addEventListener('focusout', (event) => {
      if ((event.relatedTarget && group.contains(event.relatedTarget)) || group.matches(':hover')) return;
      resetScope();
    });
  }

  return { TYPES, wire, sync, toggle, selectOrientation, selectAuto, selectFormat, selectPageSize, selectScope, getScope: () => scope, setBusy };
})();
