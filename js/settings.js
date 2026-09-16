// Panneau Réglages - 3 onglets : Langue (I18n.setLang), Touche de déclenchement (localStorage, lu directement par variables.js/editor.js), Crédits
// (statique). Même convention d'ouverture/fermeture que les autres modales (style.display, pas de fermeture au clic sur le fond).
const Settings = (function () {
  const TRIGGER_KEY_STORAGE = 'pp_trigger_char';
  const DEFAULT_TRIGGER_CHAR = '#';

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
      if (triggerSelect) triggerSelect.value = getTriggerChar();
      if (reloadNotice) reloadNotice.hidden = true;
      const margins = PageLayout.getMarginsMm();
      Object.keys(marginInputs).forEach(side => { if (marginInputs[side]) marginInputs[side].value = Math.round(margins[side] * 10) / 10; });
      modal.style.display = 'flex';
    });
    closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });

    Object.keys(marginInputs).forEach(side => {
      const input = marginInputs[side];
      if (!input) return;
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        if (!Number.isFinite(v) || v < 0) return;
        PageLayout.setMarginsMm(Object.assign({}, PageLayout.getMarginsMm(), { [side]: v }));
        Editor.refreshLayout();
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

  return { getTriggerChar, wireSettingsModal };
})();
