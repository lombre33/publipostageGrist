// Panneau Réglages : Langue (I18n.setLang), Thème (localStorage + data-theme sur <html>), Touche de déclenchement (localStorage, relue par
// Variables.triggerChar), Marges de page (par modèle, avec la mention d'un macro-modèle) et Crédits (statique). Même convention d'ouverture et de fermeture que les autres fenêtres
// (style.display, pas de fermeture au clic sur le fond).
const Settings = (function () {
  const TRIGGER_KEY_STORAGE = 'pp_trigger_char';
  const THEME_STORAGE = 'pp_theme';
  const THEMES = ['system', 'light', 'dark'];

  function getTheme() {
    try {
      const v = localStorage.getItem(THEME_STORAGE);
      return THEMES.indexOf(v) !== -1 ? v : 'system';
    } catch (e) { return 'system'; }
  }

  // `system` retire l'attribut plutôt que d'y écrire quoi que ce soit : la palette sombre bascule alors sur la seule requête média
  // `prefers-color-scheme` (cf. css/style.css), sans qu'aucun code n'ait à observer le thème du système.
  function applyTheme(theme) {
    const value = THEMES.indexOf(theme) !== -1 ? theme : 'system';
    if (value === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', value);
  }

  function setTheme(theme) {
    const value = THEMES.indexOf(theme) !== -1 ? theme : 'system';
    try { localStorage.setItem(THEME_STORAGE, value); } catch (e) { /* stockage indisponible - le choix ne survivra pas au rechargement */ }
    applyTheme(value);
  }

  // Appliqué dès le chargement de ce fichier, pas seulement à l'ouverture des Réglages : sinon l'app s'affiche en clair puis bascule, ce qui se voit.
  applyTheme(getTheme());

  const byId = id => document.getElementById(id);
  const all = selector => Array.from(document.querySelectorAll(selector));

  // Réglage par modèle (pas global comme langue/touche ci-dessus) : brouillon dans PageLayout, persisté seulement au prochain "Enregistrer" - même
  // philosophie que l'en-tête/pied de page (js/header-footer-preview.js).
  const marginInputsOfPage = () => ({
    top: byId('settings-margin-top'),
    right: byId('settings-margin-right'),
    bottom: byId('settings-margin-bottom'),
    left: byId('settings-margin-left'),
  });

  // Recopie l'état réel de PageLayout dans les 4 champs. PageLayout borne les marges (cf. MIN_CONTENT_MM) : sans cette recopie, un champ pouvait
  // afficher 150 alors que la mise en page appliquait 137.4, et l'utilisateur n'avait aucun moyen de le savoir. Un champ dont l'affichage
  // correspond déjà à la valeur retenue n'est pas réécrit - réécrire pendant la frappe déplacerait le curseur.
  function syncMarginInputs(marginInputs) {
    const margins = PageLayout.getMarginsMm();
    // Plafond de chaque champ = dimension de la page dans son sens, moins la surface imprimable minimale (index.html garde les valeurs du portrait
    // : 277 en haut/bas, 190 à gauche/droite). En paysage les deux paires s'échangent - sans cela le sélecteur plafonnait à 190 un côté qui peut
    // aller à 277.
    const page = PageLayout.getPageSizeMm();
    const maxBySide = { top: page.height, bottom: page.height, left: page.width, right: page.width };
    Object.keys(marginInputs).forEach(side => {
      const input = marginInputs[side];
      if (!input) return;
      input.max = Math.floor(maxBySide[side] - PageLayout.MIN_CONTENT_MM);
      const rounded = Math.round(margins[side] * 10) / 10;
      if (parseFloat(input.value) !== rounded) input.value = rounded;
    });
  }

  function wireMarginInputs(marginInputs) {
    Object.keys(marginInputs).forEach(side => {
      const input = marginInputs[side];
      if (!input) return;
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        if (!Number.isFinite(v) || v < 0) return;
        PageLayout.setMarginsMm(Object.assign({}, PageLayout.getMarginsMm(), { [side]: v }));
        syncMarginInputs(marginInputs);
        Editor.refreshLayout();
        // Événement DOM plutôt qu'un appel direct : ce module n'a aucune raison de connaître js/main.js (auto-save). main.js écoute cet événement
        // pour marquer le brouillon "modifié" - sans ça, changer uniquement les marges sans toucher au texte ne déclenchait jamais d'auto-save.
        document.dispatchEvent(new CustomEvent('pp:marginsChanged'));
      });
    });
  }

  // Ouverture : les choix affichés sont ceux en vigueur (langue, thème, touche de déclenchement, marges) ; fermeture : un simple masquage.
  function wireOpenAndClose(modal, openBtn, closeBtn, marginInputs) {
    const langRadios = all('input[name="settings-lang"]');
    const themeRadios = all('input[name="settings-theme"]');
    const triggerSelect = byId('settings-trigger-char');
    const reloadNotice = byId('settings-trigger-reload-notice');
    openBtn.addEventListener('click', () => {
      langRadios.forEach(r => { r.checked = (r.value === I18n.getLang()); });
      themeRadios.forEach(r => { r.checked = (r.value === getTheme()); });
      if (triggerSelect) triggerSelect.value = Variables.triggerChar();
      if (reloadNotice) reloadNotice.hidden = true;
      syncMarginInputs(marginInputs);
      modal.style.display = 'flex';
    });
    closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });
  }

  function wireTabs() {
    const tabs = all('.settings-tab');
    const panels = all('.settings-panel');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const name = tab.getAttribute('data-settings-tab');
        tabs.forEach(t => t.classList.toggle('active', t === tab));
        panels.forEach(p => { p.hidden = (p.getAttribute('data-settings-panel') !== name); });
      });
    });
  }

  // Un groupe de boutons radio : le choix coché s'applique à l'instant.
  function wireRadios(name, apply) {
    all('input[name="' + name + '"]').forEach(radio => {
      radio.addEventListener('change', () => { if (radio.checked) apply(radio.value); });
    });
  }

  function wireTriggerChar() {
    const triggerSelect = byId('settings-trigger-char');
    const reloadNotice = byId('settings-trigger-reload-notice');
    const reloadBtn = byId('settings-trigger-reload-btn');
    if (!triggerSelect || !reloadNotice || !reloadBtn) return;
    triggerSelect.addEventListener('change', () => {
      // Stockage indisponible : le choix ne survivra pas au rechargement.
      try { localStorage.setItem(TRIGGER_KEY_STORAGE, triggerSelect.value); } catch (e) { /* ignoré */ }
      // Pas de reconfiguration à chaud du plugin Suggestion (son `char` est un littéral capturé une fois à la construction de l'éditeur) - un
      // rechargement est plus simple pour un réglage qui change rarement.
      reloadNotice.hidden = false;
    });
    reloadBtn.addEventListener('click', () => location.reload());
  }

  function wireSettingsModal() {
    const openBtn = byId('v2-btn-settings');
    const modal = byId('settings-modal');
    const closeBtn = byId('settings-close');
    if (!openBtn || !modal || !closeBtn) return;
    const marginInputs = marginInputsOfPage();

    // Le numéro de version vient de js/version.js, jamais du HTML : une seule définition à tenir à jour.
    const versionCell = byId('settings-credits-version');
    if (versionCell) versionCell.textContent = PP_VERSION;

    wireOpenAndClose(modal, openBtn, closeBtn, marginInputs);
    wireMarginInputs(marginInputs);
    wireTabs();
    wireRadios('settings-lang', value => I18n.setLang(value));
    wireRadios('settings-theme', setTheme);
    wireTriggerChar();
  }

  // Macro-modèle chargé (demande du 09/10 : « préciser que ça prend le pas sur les marges des modèles assemblés ») : l'onglet Marges le dit. Les marges du macro-modèle valent pour tous les modèles
  // qu'il assemble (Lecture, PDF, Word, impression) ; celles d'un modèle ne servent que lorsqu'on l'ouvre seul. Posée par js/main.js à chaque changement de type de modèle : la mention est cachée, pas
  // retirée, hors macro-modèle.
  function setMacroMode(on) {
    const note = byId('settings-margins-macro-note');
    if (note) note.hidden = !on;
  }

  return { setTheme, setMacroMode, wireSettingsModal };
})();
