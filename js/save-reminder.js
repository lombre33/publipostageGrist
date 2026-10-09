// Rappel « Enregistrer » des réglages du widget (Réglages > Vue et Accès).
// Ces réglages vivent dans les options du widget (js/grist-api.js:setWidgetOption, grist.setOption), qui ne posent qu'un brouillon de la section :
// Grist montre alors « Enregistrer » et « Retour » en haut du bloc du widget, hors du cadre, et les autres personnes ne reçoivent le réglage qu'après
// le clic. Tant qu'un réglage a changé depuis l'ouverture des Réglages, une ligne le rappelle à gauche de « Fermer », sur ces deux onglets seulement.
// Ce que Grist dit au widget, mesuré dans un vrai Grist le 09/10 (labo-grist-reel/probe-messages.mjs) :
//  - un réglage qui change vraiment est renvoyé aussitôt (onOptions), comme un écho ; un réglage qui ne change rien n'est pas renvoyé ;
//  - « Retour » renvoie les options enregistrées ;
//  - « Enregistrer » ne renvoie RIEN : aucun message n'arrive au widget, qui ne peut pas savoir qu'on a enregistré.
// D'où deux choix. La ligne s'éteint au « Retour » de Grist (le suivi le reconnaît : un message qui n'est pas l'écho d'une écriture du widget rend les
// options enregistrées) et à la prochaine ouverture des Réglages, qui repartent de zéro ; elle ne dit jamais « pas encore enregistré », qui serait faux
// juste après un clic sur « Enregistrer » : c'est une consigne, vraie avant comme après.
// Un message qui apporte aussi un changement du lien « Sélectionner par » ou du niveau d'accès n'est pas un « Retour ».
// `null` vaut « absent » (setOption(clé, null) retire un réglage) : un réglage incomplet, que le widget retire, ne rappelle rien.
// Limite : un brouillon posé avant l'ouverture du widget (page quittée puis retrouvée, cadre reconstruit par Grist) est pris pour l'état enregistré ;
// la ligne ne parle que des changements faits depuis l'ouverture des Réglages.
// Script classique (pas type="module"), même convention de portée globale que AccessRights ; js/main.js appelle init() une fois GristAPI.init() faite.
const SaveReminder = (function () {
  const BOX_ID = 'settings-save-reminder';
  // Les onglets des Réglages dont le contenu est une option du widget (Vue : modèle de la vue et modèle selon la ligne ; Accès : droits).
  const TABS = ['rowTemplate', 'access'];
  // Un écho attendu qui n'est pas revenu dans ce délai ne reviendra pas (il vient en quelques dizaines de millisecondes) : il ne cache pas un
  // « Enregistrer » cliqué ensuite.
  const ECHO_WAIT_MS = 1500;

  // Écriture canonique d'une valeur JSON : les clés triées, pour comparer deux jeux d'options sans dépendre de l'ordre de leurs clés.
  function canon(value) {
    if (Array.isArray(value)) return '[' + value.map(canon).join(',') + ']';
    if (value && typeof value === 'object') {
      return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canon(value[k])).join(',') + '}';
    }
    return JSON.stringify(value === undefined ? null : value);
  }

  // Les options sans leurs réglages retirés (`null`) : retirer un réglage qui n'existe pas ne change rien à ce qu'il y a à enregistrer.
  function compact(options) {
    const out = {};
    Object.keys(options || {}).forEach(key => { if (options[key] != null) out[key] = options[key]; });
    return out;
  }

  const same = (a, b) => canon(compact(a)) === canon(compact(b));
  // La comparaison de Grist : `null` n'y vaut pas « absent » (la clé est écrite), donc l'écho vient dès que la clé apparaît.
  const strictSame = (a, b) => canon(a || {}) === canon(b || {});

  // Le suivi du brouillon, sans DOM ni Grist : `now` donne l'heure en millisecondes.
  //   start(options)                     -> les options à l'ouverture des Réglages sont tenues pour enregistrées
  //   wrote(before, after)               -> le widget vient d'écrire une option
  //   received(options, settingsChanged) -> Grist renvoie les options ; `settingsChanged` vrai : le même message porte un changement de lien ou d'accès
  //   isUnsaved()                        -> ce que le widget tient n'est pas ce qu'il tient pour enregistré
  function createTracker(now) {
    let saved = {};
    let current = {};
    let awaiting = [];  // l'heure de chaque écriture dont l'écho n'est pas encore revenu

    return {
      start(options) {
        saved = current = compact(options);
        awaiting = [];
      },
      wrote(before, after) {
        current = compact(after);
        if (!strictSame(before, after)) awaiting.push(now());
      },
      received(options, settingsChanged) {
        if (settingsChanged) return;
        const at = now();
        awaiting = awaiting.filter(sentAt => at - sentAt <= ECHO_WAIT_MS);
        if (awaiting.length) { awaiting.shift(); return; } // l'écho d'une de nos écritures
        // Pas un écho : ces options viennent de Grist, qui rend celles qui sont enregistrées (« Retour »).
        saved = current = compact(options);
      },
      isUnsaved() { return !same(current, saved); },
    };
  }

  let tracker = null;

  function activeTab() {
    const tab = document.querySelector('#settings-tabs .settings-tab.active');
    return tab ? tab.getAttribute('data-settings-tab') : null;
  }

  // Le texte n'est posé qu'à l'apparition de la ligne : une zone `role="status"` qui change de texte est lue, une zone que l'on dévoile ne l'est pas
  // toujours.
  function render() {
    const box = document.getElementById(BOX_ID);
    if (!box) return;
    const show = !!tracker && tracker.isUnsaved() && TABS.indexOf(activeTab()) !== -1;
    box.textContent = show ? I18n.t('settings.saveReminder') : '';
    box.hidden = !show;
  }

  function isUnsaved() { return !!tracker && tracker.isUnsaved(); }

  function init() {
    tracker = createTracker(Date.now);
    tracker.start(GristAPI.getWidgetOptions());
    GristAPI.onWidgetOptionWrite(change => { tracker.wrote(change.before, change.after); render(); });
    GristAPI.onWidgetOptionsChange((options, meta) => { tracker.received(options, !!(meta && meta.settingsChanged)); render(); });
    // Chaque ouverture des Réglages repart de zéro : on ne sait pas si l'on a cliqué sur « Enregistrer » entre-temps (aucun message), et une consigne
    // restée affichée après coup serait fausse à chaque ouverture.
    const openBtn = document.getElementById('v2-btn-settings');
    if (openBtn) openBtn.addEventListener('click', () => { tracker.start(GristAPI.getWidgetOptions()); render(); });
    // js/settings.js change d'onglet en déplaçant la classe `active` : la ligne suit l'onglet affiché.
    const tabs = document.getElementById('settings-tabs');
    if (tabs && typeof MutationObserver === 'function') {
      new MutationObserver(render).observe(tabs, { attributes: true, attributeFilter: ['class'], subtree: true });
    }
    I18n.onChange(render);
    render();
  }

  return { init, isUnsaved, createTracker, ECHO_WAIT_MS };
})();
