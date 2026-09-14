// Panneau Réglages - Langue (I18n.setLang), Thème (localStorage + data-theme sur <html>), Touche de déclenchement (localStorage, lu directement par
// variables.js/editor.js), Marges de page (par modèle) et Crédits (statique). Même convention d'ouverture/fermeture que les autres modales (style.display, pas de fermeture au clic sur le fond).
const Settings = (function () {
  const TRIGGER_KEY_STORAGE = 'pp_trigger_char';
  const DEFAULT_TRIGGER_CHAR = '#';
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

  // js/variables.js et js/editor.js relisent la même clé indépendamment - exposé ici pour que ce fichier reste la référence documentée de la valeur par
  // défaut/nom de clé.
  function getTriggerChar() {
    try {
      const v = localStorage.getItem(TRIGGER_KEY_STORAGE);
      return (v && v.length === 1) ? v : DEFAULT_TRIGGER_CHAR;
    } catch (e) { return DEFAULT_TRIGGER_CHAR; }
  }

  function wireSettingsModal() {
    const openBtn = document.getElementById('v2-btn-settings');
    const modal = document.getElementById('settings-modal');
    const closeBtn = document.getElementById('settings-close');
    const tabs = Array.from(document.querySelectorAll('.settings-tab'));
    const panels = Array.from(document.querySelectorAll('.settings-panel'));
    const langRadios = Array.from(document.querySelectorAll('input[name="settings-lang"]'));
    const themeRadios = Array.from(document.querySelectorAll('input[name="settings-theme"]'));
    const triggerSelect = document.getElementById('settings-trigger-char');
    const reloadNotice = document.getElementById('settings-trigger-reload-notice');
    const reloadBtn = document.getElementById('settings-trigger-reload-btn');
    // Réglage PAR MODÈLE (pas global comme langue/touche ci-dessus) : brouillon dans PageLayout, persisté seulement au prochain "Enregistrer" - même
    // philosophie que l'en-tête/pied de page (js/header-footer-preview.js).
    const marginInputs = {
      top: document.getElementById('settings-margin-top'),
      right: document.getElementById('settings-margin-right'),
      bottom: document.getElementById('settings-margin-bottom'),
      left: document.getElementById('settings-margin-left'),
    };
    if (!openBtn || !modal || !closeBtn) return;

    openBtn.addEventListener('click', () => {
      langRadios.forEach(r => { r.checked = (r.value === I18n.getLang()); });
      themeRadios.forEach(r => { r.checked = (r.value === getTheme()); });
      if (triggerSelect) triggerSelect.value = getTriggerChar();
      if (reloadNotice) reloadNotice.hidden = true;
      syncMarginInputs();
      modal.style.display = 'flex';
    });
    closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });

    // Recopie l'état RÉEL de PageLayout dans les 4 champs. PageLayout borne les marges (cf. MIN_CONTENT_MM) : sans cette recopie, un champ pouvait
    // afficher 150 alors que la mise en page appliquait 137.4, et l'utilisateur n'avait aucun moyen de le savoir. Un champ dont l'affichage correspond
    // déjà à la valeur retenue n'est pas réécrit - réécrire pendant la frappe déplacerait le curseur.
    function syncMarginInputs() {
      const margins = PageLayout.getMarginsMm();
      Object.keys(marginInputs).forEach(side => {
        const input = marginInputs[side];
        if (!input) return;
        const rounded = Math.round(margins[side] * 10) / 10;
        if (parseFloat(input.value) !== rounded) input.value = rounded;
      });
    }

    Object.keys(marginInputs).forEach(side => {
      const input = marginInputs[side];
      if (!input) return;
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        if (!Number.isFinite(v) || v < 0) return;
        PageLayout.setMarginsMm(Object.assign({}, PageLayout.getMarginsMm(), { [side]: v }));
        syncMarginInputs();
        Editor.refreshLayout();
        // Événement DOM plutôt qu'un appel direct : ce module n'a aucune raison de connaître js/main.js (auto-save). main.js écoute cet événement pour
        // marquer le brouillon "modifié" - sans ça, changer uniquement les marges sans toucher au texte ne déclenchait jamais d'auto-save.
        document.dispatchEvent(new CustomEvent('pp:marginsChanged'));
      });
    });

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const name = tab.getAttribute('data-settings-tab');
        tabs.forEach(t => t.classList.toggle('active', t === tab));
        panels.forEach(p => { p.hidden = (p.getAttribute('data-settings-panel') !== name); });
      });
    });

    langRadios.forEach(radio => {
      radio.addEventListener('change', () => { if (radio.checked) I18n.setLang(radio.value); });
    });

    themeRadios.forEach(radio => {
      radio.addEventListener('change', () => { if (radio.checked) setTheme(radio.value); });
    });

    if (triggerSelect && reloadNotice && reloadBtn) {
      triggerSelect.addEventListener('change', () => {
        try { localStorage.setItem(TRIGGER_KEY_STORAGE, triggerSelect.value); } catch (e) { /* stockage indisponible - le choix ne survivra pas au rechargement */ }
        // Pas de reconfiguration à chaud du plugin Suggestion (son `char` est un littéral capturé une fois à la construction de l'éditeur) - un rechargement
        // est plus simple pour un réglage qui change rarement.
        reloadNotice.hidden = false;
      });
      reloadBtn.addEventListener('click', () => location.reload());
    }
  }

  return { getTriggerChar, getTheme, setTheme, wireSettingsModal };
})();
