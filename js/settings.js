// Panneau Réglages : Langue (rechargement de la page, I18n.storeLang), Thème (js/person-store.js + data-theme sur <html>, et le choix « Par défaut » / « Mise en forme » des bulles et des puces de l'éditeur,
// data-bubble-marks sur <html>), Touche de déclenchement (js/person-store.js, relue par
// Variables.triggerChar), Email (la messagerie qui ouvre le lien du mode Email, gardée par MailtoExport.setMailClient), Marges de page (par modèle, avec quatre préréglages, la chaîne qui lie les quatre marges et la
// mention d'un macro-modèle) et Crédits (statique). Même convention d'ouverture et de fermeture que les autres fenêtres (style.display, pas de fermeture au
// clic sur le fond). Langue et Touche de déclenchement rechargent la page, qui rouvre le modèle où la personne était (reloadKeepingTemplate, takeReopenId). Hébergée par GFS, la langue est celle de GFS
// (consigne 019) : les cases de Réglages sont grisées avec la raison (applyLanguageLock) et la page suit un changement fait dans GFS de la même façon (followGfsLanguage).
const Settings = (function () {
  const TRIGGER_KEY_STORAGE = 'pp_trigger_char';
  const THEME_STORAGE = 'pp_theme';
  const THEMES = ['system', 'light', 'dark'];

  function getTheme() {
    const v = PersonStore.get(THEME_STORAGE);
    return THEMES.indexOf(v) !== -1 ? v : 'system';
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
    PersonStore.set(THEME_STORAGE, value); // non retenu (stockage indisponible) : le choix ne survivra pas au rechargement
    applyTheme(value);
  }

  // Appliqué dès le chargement de ce fichier, pas seulement à l'ouverture des Réglages : sinon l'app s'affiche en clair puis bascule, ce qui se voit. Hébergé par GFS, le thème vient de l'espace de l'app, qui
  // arrive avec le contexte (js/person-store.js) : il est repris à ce moment-là si le contexte n'était pas encore là au chargement de ce fichier.
  applyTheme(getTheme());
  PersonStore.onLoaded(() => applyTheme(getTheme()));

  // Les bulles de variable, les bulles « Calcul », les puces (date, heure, email, nom, numéro de ligne) et les fiches « @ » de l'éditeur : « Par défaut » elles gardent leur aspect pâle, toujours facile à repérer ;
  // « Mise en forme » elles montrent la couleur, le surlignage, le souligné et le barré qu'on leur a donnés (js/editor-nodes.js:showTextMarks les relève dans la vue, css/variable-actions.css les montre sous
  // l'attribut). Un seul choix pour tous, propre à la personne (demande du 22/10). Comme le thème, il s'applique à l'instant (un attribut sur <html>, rien à redessiner) et dès le chargement de ce fichier ;
  // « Par défaut » retire l'attribut. Il ne touche ni l'enregistrement, ni la Lecture, ni les exports : ils écrivent déjà la mise en forme.
  const BUBBLE_MARKS_STORAGE = 'pp_bubble_marks';

  const getBubbleMarks = () => (PersonStore.get(BUBBLE_MARKS_STORAGE) === 'marks' ? 'marks' : 'default');

  function applyBubbleMarks(value) {
    if (value === 'marks') document.documentElement.setAttribute('data-bubble-marks', 'marks');
    else document.documentElement.removeAttribute('data-bubble-marks');
  }

  function setBubbleMarks(value) {
    const next = value === 'marks' ? 'marks' : 'default';
    PersonStore.set(BUBBLE_MARKS_STORAGE, next); // non retenu (stockage indisponible) : le choix ne survivra pas au rechargement
    applyBubbleMarks(next);
  }

  applyBubbleMarks(getBubbleMarks());
  PersonStore.onLoaded(() => applyBubbleMarks(getBubbleMarks()));

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

  // Les préréglages de l'onglet Marges (mm) : ceux de Word. « Classiques » est son « Normal » (2,54 cm, aussi le réglage de Google Docs), « Étroites » 1,27 cm, « Larges » 2,54 cm en haut et en bas et 5,08 cm de chaque côté ;
  // « Aucune » n'en laisse pas. PageLayout les borne pour la page (une petite page ne garde pas 50,8 mm de chaque côté) : celui qui est « en place » est celui que PageLayout poserait à l'identique
  // (boundedMarginsMm), pas celui dont les nombres sont écrits ici. Les nombres de l'info-bulle de chacun sont dans js/i18n.js (settings.pageMargins.presetTip.*).
  const MARGIN_SIDES = ['top', 'right', 'bottom', 'left'];
  const MARGIN_PRESETS = [
    { id: 'none', margins: { top: 0, right: 0, bottom: 0, left: 0 } },
    { id: 'narrow', margins: { top: 12.7, right: 12.7, bottom: 12.7, left: 12.7 } },
    { id: 'classic', margins: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 } },
    { id: 'wide', margins: { top: 25.4, right: 50.8, bottom: 25.4, left: 50.8 } },
  ];
  // Les champs montrent le dixième de millimètre : deux marges qui s'écrivent pareil sont les mêmes.
  const MARGIN_SAME_MM = 0.05;

  // « Lier les quatre marges » : un réglage de la personne tant que la page est ouverte, pas du modèle (rien n'est enregistré, rien n'est gardé d'un chargement à l'autre). Éteint au départ : les quatre champs
  // restent indépendants, comme avant. Allumé, la valeur saisie dans l'un s'applique aux quatre (wireMarginInputs) ; il ne change rien tant qu'on ne saisit pas.
  let marginsLinked = false;

  const marginPresetButtons = () => all('.settings-margins-presets button');
  const presetOf = button => MARGIN_PRESETS.find(preset => preset.id === button.dataset.marginPreset);

  // Le préréglage est en place quand les marges d'à présent sont celles que PageLayout poserait pour lui.
  function presetInPlace(preset) {
    const margins = PageLayout.getMarginsMm();
    const bounded = PageLayout.boundedMarginsMm(preset.margins);
    return MARGIN_SIDES.every(side => Math.abs(bounded[side] - margins[side]) < MARGIN_SAME_MM);
  }

  // Le préréglage en place est enfoncé (aria-pressed, `.active` du commutateur) ; aucun quand les marges sont à la main.
  function syncMarginPresets() {
    marginPresetButtons().forEach(button => {
      const on = presetInPlace(presetOf(button));
      button.classList.toggle('active', on);
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  // Le bouton à deux états (aria-pressed, `.is-on`) dont l'icône dit l'état : chaîne accrochée quand les marges sont liées, écartée sinon.
  function syncMarginLink() {
    const button = byId('settings-margins-link');
    if (!button) return;
    button.classList.toggle('is-on', marginsLinked);
    button.setAttribute('aria-pressed', marginsLinked ? 'true' : 'false');
    Dom.setMarkup(button, Icons.svg(marginsLinked ? 'marginsLinked' : 'marginsUnlinked'));
  }

  // Recopie l'état réel de PageLayout dans les 4 champs. PageLayout borne les marges (cf. MIN_CONTENT_MM) : sans cette recopie, un champ pouvait
  // afficher 150 alors que la mise en page appliquait 137.4, et l'utilisateur n'avait aucun moyen de le savoir. Un champ dont l'affichage
  // correspond déjà à la valeur retenue n'est pas réécrit - réécrire pendant la frappe déplacerait le curseur.
  function syncMarginInputs(marginInputs) {
    const margins = PageLayout.getMarginsMm();
    // Plafond de chaque champ = dimension de la page dans son sens, moins la surface imprimable minimale (index.html garde les valeurs du portrait
    // : 277 en haut/bas, 190 à gauche/droite). En paysage les deux paires s'échangent - sans cela le sélecteur plafonnait à 190 un côté qui peut
    // aller à 277. Un macro-modèle « Selon chaque modèle » plafonne les quatre sur le côté court du format (PageLayout.getMarginLimitsMm) : ses marges doivent tenir dans la page
    // de chaque modèle, portrait ou paysage.
    const maxBySide = PageLayout.getMarginLimitsMm();
    Object.keys(marginInputs).forEach(side => {
      const input = marginInputs[side];
      if (!input) return;
      input.max = Math.floor(maxBySide[side] - PageLayout.MIN_CONTENT_MM);
      const rounded = Math.round(margins[side] * 10) / 10;
      if (parseFloat(input.value) !== rounded) input.value = rounded;
    });
    syncMarginPresets();
  }

  // Pose ces marges (mm) sur la page : PageLayout les borne, les champs et les préréglages montrent ce qui est retenu, l'éditeur se remet en page et le modèle est marqué modifié. Une saisie et un préréglage passent par là.
  function applyMargins(marginInputs, sides) {
    PageLayout.setMarginsMm(Object.assign({}, PageLayout.getMarginsMm(), sides));
    syncMarginInputs(marginInputs);
    Editor.refreshLayout();
    // Événement DOM plutôt qu'un appel direct : ce module n'a aucune raison de connaître js/main.js (auto-save). main.js écoute cet événement
    // pour marquer le brouillon "modifié" - sans ça, changer uniquement les marges sans toucher au texte ne déclenchait jamais d'auto-save.
    document.dispatchEvent(new CustomEvent('pp:marginsChanged'));
  }

  function wireMarginInputs(marginInputs) {
    Object.keys(marginInputs).forEach(side => {
      const input = marginInputs[side];
      if (!input) return;
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        if (!Number.isFinite(v) || v < 0) return;
        // Liées, les quatre marges prennent la valeur saisie ; PageLayout borne ensuite chaque paire (un grand nombre ne laisse pas le même à la largeur et à la hauteur).
        applyMargins(marginInputs, marginsLinked ? { top: v, right: v, bottom: v, left: v } : { [side]: v });
      });
    });
  }

  // Un préréglage pose ses quatre marges d'un clic. Celui qui est déjà en place ne change rien (et ne marque pas le modèle modifié). Quatre marges qui ne sont plus égales (« Larges ») ne sont plus « liées » : la
  // chaîne se relâche, sinon la saisie suivante les écraserait toutes d'un coup.
  function wireMarginPresets(marginInputs) {
    marginPresetButtons().forEach(button => {
      const preset = presetOf(button);
      if (!preset) return;
      button.title = I18n.t('settings.pageMargins.presetTip.' + preset.id);
      button.addEventListener('click', () => {
        if (marginsLinked && MARGIN_SIDES.some(side => preset.margins[side] !== preset.margins.top)) {
          marginsLinked = false;
          syncMarginLink();
        }
        if (!presetInPlace(preset)) applyMargins(marginInputs, preset.margins);
      });
    });
  }

  function wireMarginLink() {
    const button = byId('settings-margins-link');
    if (!button) return;
    button.title = I18n.t('settings.pageMargins.linkTip');
    syncMarginLink();
    button.addEventListener('click', () => {
      marginsLinked = !marginsLinked;
      syncMarginLink();
    });
  }

  // La case cochée est la langue de la page (à l'ouverture de Réglages, et quand « Annuler » laisse la langue d'avant).
  function checkLangRadios() {
    all('input[name="settings-lang"]').forEach(r => { r.checked = (r.value === I18n.getLang()); });
  }

  // Hébergée par une GFS qui donne la langue (consigne 019), le choix de langue est celui de GFS, un seul pour toutes ses apps : les deux cases sont grisées, jamais masquées, et une phrase dit où la choisir.
  // Seule, ou avec une GFS qui ne la donne pas, rien ne change. Posé à chaque ouverture de Réglages, et quand la langue de GFS change pendant qu'ils sont ouverts.
  function applyLanguageLock() {
    const locked = GfsLink.language() !== null;
    all('input[name="settings-lang"]').forEach((radio) => {
      radio.disabled = locked;
      if (locked) radio.setAttribute('aria-describedby', 'settings-language-gfs-note'); else radio.removeAttribute('aria-describedby');
      if (radio.parentElement) radio.parentElement.classList.toggle('is-disabled', locked);
    });
    const note = byId('settings-language-gfs-note');
    if (note) note.hidden = !locked;
  }

  // Ouverture : les choix affichés sont ceux en vigueur (langue, thème, bulles et puces, touche de déclenchement, messagerie, marges) ; fermeture : un simple masquage.
  function wireOpenAndClose(modal, openBtn, closeBtn, marginInputs) {
    const themeRadios = all('input[name="settings-theme"]');
    const bubbleMarksRadios = all('input[name="settings-bubble-marks"]');
    const mailClientRadios = all('input[name="settings-mail-client"]');
    const triggerSelect = byId('settings-trigger-char');
    const reloadNotice = byId('settings-trigger-reload-notice');
    openBtn.addEventListener('click', () => {
      checkLangRadios();
      applyLanguageLock();
      themeRadios.forEach(r => { r.checked = (r.value === getTheme()); });
      bubbleMarksRadios.forEach(r => { r.checked = (r.value === getBubbleMarks()); });
      mailClientRadios.forEach(r => { r.checked = (r.value === MailtoExport.getMailClient()); });
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

  // Un rechargement que l'app veut elle-même (changer de langue, changer la touche de déclenchement) ramène la personne sur le modèle où elle était (demande du 20/10, seule comme dans GFS).
  // L'identifiant passe par le fragment de l'adresse du cadre (`#pp-open=<id>`), jamais par le stockage du navigateur : le cadre isolé de GFS (origine nulle) le refuse, et `history.replaceState` y
  // change le fragment sans changer l'origine ni ajouter une entrée à l'historique. Un modèle pas encore enregistré n'a pas d'identifiant : le rechargement ouvre alors le modèle habituel. Au
  // démarrage, js/main.js lit puis efface ce fragment (takeReopenId) : un rechargement qui ne vient pas d'ici (F5, Grist, GFS) ne le rejoue pas ; tout autre fragment reste tel quel.
  // Suivre un changement de langue fait dans GFS ajoute la langue au fragment (`#pp-open=<id>&pp-lang=fr|en`, ou `#pp-lang=fr|en` sans modèle ouvert) : l'adresse du cadre garde la langue de sa création,
  // GFS ne le recharge jamais, et js/i18n.js (gfsLang) lit ce fragment avant le paramètre `language`.
  const REOPEN_HASH = /^#(?:pp-open=(\d+)(?:&pp-lang=(?:fr|en))?|pp-lang=(?:fr|en))$/;

  // `language` ('fr' | 'en') : la langue que la page rechargée doit prendre ; `openId` : le modèle à rouvrir quand ce n'est pas celui d'à présent (au démarrage, le modèle n'est pas encore ouvert). Rend faux, sans
  // recharger, quand cette langue ne peut pas passer par l'adresse (non modifiable) : la page repartirait dans l'ancienne et s'y reprendrait sans fin. Sans langue donnée (la touche de déclenchement : le
  // clic d'un bouton), hébergée par une GFS qui donne la sienne, la page rechargée garde celle de GFS : l'adresse du cadre porte la langue de sa création, qui peut ne plus être la bonne, et la page
  // se rechargerait deux fois ; avec une adresse non modifiable elle ne retient alors que le modèle, et le rattrapage du démarrage (followGfsLanguage) ne recharge pas.
  function reloadKeepingTemplate(language, openId) {
    const id = openId != null ? openId : Templates.getCurrentId();
    const asked = language === 'fr' || language === 'en';
    const carried = asked ? language : GfsLink.language();
    const parts = [];
    if (id != null) parts.push('pp-open=' + encodeURIComponent(id));
    if (carried) parts.push('pp-lang=' + carried);
    if (parts.length) {
      try { history.replaceState(history.state, '', location.pathname + location.search + '#' + parts.join('&')); } catch (e) { if (asked) return false; }
    }
    location.reload();
    return true;
  }

  // L'identifiant que le rechargement précédent a laissé dans l'adresse, ou null ; le fragment est effacé aussitôt (la langue qu'il portait a déjà été lue par js/i18n.js).
  function takeReopenId() {
    const found = REOPEN_HASH.exec(location.hash);
    if (!found) return null;
    try { history.replaceState(history.state, '', location.pathname + location.search); } catch (e) { /* adresse non modifiable : le fragment reste, sans effet */ }
    return found[1] || null;
  }

  // GFS garde un seul choix de langue pour lui et toutes ses apps (consigne 019, contrats 5.2 point 6) : la page prend celle que `contexte.langue` dit (js/i18n.js la lit dans l'adresse du cadre au départ), puis
  // suit chaque événement `langue`. Comme pour un changement fait ici (changeLanguage) : la question « Enregistrer / Abandonner / Annuler » d'abord s'il y a des modifications en attente, puis le rechargement qui
  // rouvre le modèle où la personne était ; « Annuler » laisse la langue d'avant jusqu'au prochain démarrage (GFS ne le voit pas). Au départ, après l'ouverture du modèle, elle rattrape une langue changée
  // pendant le rechargement (GFS n'envoie rien à un cadre qui n'est pas encore là). Rend vrai quand une page se recharge. Seule, ou avec une GFS qui ne donne pas la langue : rien.
  let leaveHooks = null;      // { hasEditsToConfirmBeforeLeaving, askBeforeLeaving } de js/main.js, donnés à wireSettingsModal
  let followAsking = false;   // la question est posée : un second changement de GFS se règle sur ce que sera la langue de GFS à la réponse
  async function followGfsLanguage() {
    const wanted = GfsLink.language();
    if (!wanted || wanted === I18n.getLang() || followAsking) return false;
    followAsking = true;
    try {
      if (leaveHooks && leaveHooks.hasEditsToConfirmBeforeLeaving() && !(await leaveHooks.askBeforeLeaving())) return false;
    } catch (e) {
      console.warn('[Settings] langue de GFS non suivie', e);
      return false;
    } finally { followAsking = false; }
    const next = GfsLink.language();
    return !!next && next !== I18n.getLang() && reloadKeepingTemplate(next);
  }

  // Un groupe de boutons radio : le choix coché s'applique à l'instant.
  function wireRadios(name, apply) {
    all('input[name="' + name + '"]').forEach(radio => {
      radio.addEventListener('change', () => { if (radio.checked) apply(radio.value); });
    });
  }

  // Changer de langue recharge la page, rien d'autre (demande du 14/10) : aucun libellé n'est retraduit à chaud, la langue choisie est relue au démarrage
  // (I18n.storeLang). Ce qui attendait d'être enregistré passe d'abord par la question « Enregistrer / Abandonner / Annuler » de js/main.js, comme pour tout
  // ce qui remplace le contenu de l'éditeur ; « Annuler » laisse la langue d'avant. Stockage refusé (la langue ne survivrait pas au rechargement) : la case
  // revient sur la langue de la page, rien ne change. La page rechargée rouvre le modèle où la personne était (reloadKeepingTemplate, demande du 20/10).
  async function changeLanguage(next, leave) {
    if (leave && leave.hasEditsToConfirmBeforeLeaving() && !(await leave.askBeforeLeaving())) { checkLangRadios(); return; }
    if (!I18n.storeLang(next)) { checkLangRadios(); return; }
    reloadKeepingTemplate();
  }

  function wireTriggerChar() {
    const triggerSelect = byId('settings-trigger-char');
    const reloadNotice = byId('settings-trigger-reload-notice');
    const reloadBtn = byId('settings-trigger-reload-btn');
    if (!triggerSelect || !reloadNotice || !reloadBtn) return;
    triggerSelect.addEventListener('change', () => {
      // Stockage indisponible : le choix ne survivra pas au rechargement.
      PersonStore.set(TRIGGER_KEY_STORAGE, triggerSelect.value);
      // Pas de reconfiguration à chaud du plugin Suggestion (son `char` est un littéral capturé une fois à la construction de l'éditeur) - un
      // rechargement est plus simple pour un réglage qui change rarement.
      reloadNotice.hidden = false;
    });
    reloadBtn.addEventListener('click', reloadKeepingTemplate);
  }

  function wireSettingsModal(leave) {
    const openBtn = byId('v2-btn-settings');
    const modal = byId('settings-modal');
    const closeBtn = byId('settings-close');
    if (!openBtn || !modal || !closeBtn) return;
    const marginInputs = marginInputsOfPage();

    // Le numéro de version vient de js/version.js, jamais du HTML : une seule définition à tenir à jour.
    const versionCell = byId('settings-credits-version');
    if (versionCell) versionCell.textContent = PP_VERSION;
    // « Nouveautés », sous la version : rouvre la fenêtre des nouveautés (js/whats-new.js), sans rien noter.
    const newsButton = byId('settings-credits-news');
    if (newsButton) newsButton.addEventListener('click', () => WhatsNew.open());

    wireOpenAndClose(modal, openBtn, closeBtn, marginInputs);
    wireMarginInputs(marginInputs);
    wireMarginPresets(marginInputs);
    wireMarginLink();
    wireTabs();
    wireRadios('settings-lang', value => changeLanguage(value, leave));
    wireRadios('settings-theme', setTheme);
    wireRadios('settings-bubble-marks', setBubbleMarks);
    wireRadios('settings-mail-client', MailtoExport.setMailClient);
    wireTriggerChar();
    // Hébergée, un changement de langue fait dans GFS est suivi ici (followGfsLanguage) ; js/main.js le rappelle une fois le modèle de départ ouvert.
    leaveHooks = leave;
    GfsLink.onLanguage(() => { applyLanguageLock(); followGfsLanguage(); });
  }

  // Macro-modèle chargé (demande du 09/10 : « préciser que ça prend le pas sur les marges des modèles assemblés ») : l'onglet Marges le dit. Les marges du macro-modèle valent pour tous les modèles
  // qu'il assemble (Lecture, PDF, Word, impression) ; celles d'un modèle ne servent que lorsqu'on l'ouvre seul. Posée par js/main.js à chaque changement de type de modèle : la mention est cachée, pas
  // retirée, hors macro-modèle.
  function setMacroMode(on) {
    const note = byId('settings-margins-macro-note');
    if (note) note.hidden = !on;
  }

  return { setTheme, setBubbleMarks, getBubbleMarks, setMacroMode, wireSettingsModal, takeReopenId, followGfsLanguage };
})();
