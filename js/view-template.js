// Modèle par défaut de la vue. Les options d'un widget appartiennent à SA vue (section) dans Grist : un widget posé sur deux pages a deux réglages,
// et il n'a pas besoin de savoir sur quelle page il est. Le choix vit dans l'option `modeleDeLaVue` (id du modèle), même mécanique que
// js/access-rights.js et js/row-template.js : lue avec le widget, partagée par tout le monde seulement une fois la vue enregistrée côté Grist
// (grist.setOption ne pose qu'un brouillon).
// À l'ouverture : la ligne qui désigne un modèle (js/row-template.js) l'emporte, puis le modèle de la vue, puis le modèle par défaut du document (★,
// js/templates.js). Le modèle de la vue peut être de n'importe quel type, un email ou un macro-modèle compris : c'est un choix explicite pour cette
// vue (demande du 08/10). Le ★ du document reste réservé aux modèles ordinaires (Templates.canBeDocumentDefault). Un choix enregistré dont le modèle
// n'existe plus est ignoré, comme celui d'un modèle d'un type que le widget ne sait pas ouvrir (l'écran le dit).
// Écran : section « Modèle par défaut de cette vue » de Réglages > Vue (état, « Utiliser le modèle ouvert », « Retirer »).
// Un des deux boutons grisé DIT POURQUOI (consigne 088 de GFS, demande du porteur du 19/11 : « indiquer pourquoi à chaque fois qu'une option est grisée »), trois fois : au survol (`title`), à
// l'écran quand la raison est un modèle pas encore enregistré (la phrase sous l'état, là où la personne ne sait pas quoi faire) et au lecteur d'écran (`aria-describedby` vers cette phrase). Il est grisé
// par `aria-disabled="true"`, jamais par `disabled` (comme js/floating-toolbars.js, setDisabled : un bouton `disabled` ne reçoit ni le survol ni le focus, sa raison ne se lirait pas) ; son clic ne
// fait rien. Une raison par état : modèle ouvert pas enregistré, déjà celui de la vue, lecture seule (la phrase du verrou), « Retirer » sans choix. Un bouton actif n'a pas de `title`.
//   ViewTemplate.init() -> lit l'option et s'abonne à ses changements (après GristAPI.init)
//   ViewTemplate.usableId() -> id du modèle de la vue s'il existe encore et s'ouvre ici, sinon null
//   ViewTemplate.set(id) -> choisit ce modèle pour la vue ; clear() retire le choix ; l'un et l'autre se défont par Ctrl + Z (js/settings-history.js)
//   ViewTemplate.wirePanel() -> branche la section de Réglages (redessinée à l'ouverture et à chaque changement de droits ; grisée en lecture seule)
// Le MODE d'ouverture de la vue (demande du 24/11 : « comment définir qu'un modèle par défaut d'une page s'ouvre en mode lecture et pas écriture ? », choix « un réglage par page ») : une seconde option du widget, `ouvertureDeLaVue`
// (`read` | `edit`, absente = « le dernier mode choisi »), même mécanique que le modèle de la vue (écho, brouillon de Grist jusqu'à « Enregistrer », Ctrl + Z, grisé en lecture seule). Elle l'emporte sur le dernier mode de la personne
// (`pp_last_mode`, js/main.js:startMode) quand un modèle ordinaire s'ouvre de lui-même ; un modèle vierge, un import, un macro-modèle ou l'absence de modèle ouvrent l'Édition comme avant, et la personne garde le bouton Édition ou
// Lecture (sauf en lecture seule). Écran : section « Mode d'ouverture de cette vue » de Réglages > Vue, juste sous « Modèle par défaut de cette vue ».
//   ViewTemplate.openMode() -> 'read' | 'edit' | null (null : le dernier mode choisi par la personne)
//   ViewTemplate.setOpenMode(mode) -> choisit le mode (null ou 'last' : le dernier mode choisi) ; se défait par Ctrl + Z comme le modèle de la vue
const ViewTemplate = (function () {
  const OPTION_KEY = 'modeleDeLaVue';
  const OPEN_KEY = 'ouvertureDeLaVue';

  let currentId = null;      // id choisi (texte) ou null
  let currentOpen = null;    // 'read' | 'edit' ou null (le dernier mode choisi)
  // Ce que cet écran vient d'écrire dans les options : Grist le renvoie par onOptions, parfois après un choix plus récent (même garde que
  // js/row-template.js). Une garde par option : leurs valeurs n'ont rien à voir.
  const echoes = GristAPI.createEchoGuard();
  const openEchoes = GristAPI.createEchoGuard();

  const normalize = value => (value != null && value !== '' ? String(value) : null);
  // Seuls `read` et `edit` sont un choix ; tout le reste (absent, « last », une valeur d'un autre widget) est « le dernier mode choisi ».
  const normalizeOpen = value => (value === 'read' || value === 'edit' ? value : null);
  const find = Templates.byId;

  function getId() { return currentId; }
  function openMode() { return currentOpen; }

  // Un modèle d'un type que le widget ne sait pas ouvrir (js/templates.js, isOpenableType) n'est pas utilisable : la vue s'ouvre comme sans choix.
  function usableId() {
    const tpl = currentId != null ? Templates.openableById(currentId) : null;
    return tpl ? String(tpl.id) : null;
  }

  function isReadOnly() { return typeof AccessRights !== 'undefined' && AccessRights.get().readOnly; }

  async function write(id) {
    const next = normalize(id);
    echoes.remember(JSON.stringify(next));
    currentId = next;
    try { await GristAPI.setWidgetOption(OPTION_KEY, next); }
    catch (e) { console.error('[ViewTemplate] enregistrement de l’option du widget impossible', e); }
    renderPanel();
  }

  // Le choix, tel que Ctrl + Z le défait (js/settings-history.js) : défaire ou rétablir l'écrit par la même écriture que le geste, et le coin d'état dit ce que la vue ouvre désormais (la phrase de l'écran).
  const SETTING = { read: getId, write, say: () => statusText(), locked: isReadOnly };

  const set = id => SettingsHistory.track(SETTING, () => write(id));
  const clear = () => SettingsHistory.track(SETTING, () => write(null));

  async function writeOpen(mode) {
    const next = normalizeOpen(mode);
    openEchoes.remember(JSON.stringify(next));
    currentOpen = next;
    try { await GristAPI.setWidgetOption(OPEN_KEY, next); }
    catch (e) { console.error('[ViewTemplate] enregistrement de l’option du mode d’ouverture impossible', e); }
    renderPanel();
  }
  // Le mode d'ouverture, tel que Ctrl + Z le défait : la même écriture que le geste, et le coin d'état dit ce que la vue ouvre désormais.
  const OPEN_SETTING = {
    read: openMode,
    write: writeOpen,
    say: value => I18n.t('status.settingSet', { setting: I18n.t('settings.viewOpen.title'), value: I18n.t('settings.viewOpen.value.' + (value || 'last')) }),
    locked: isReadOnly,
  };
  const setOpenMode = mode => SettingsHistory.track(OPEN_SETTING, () => writeOpen(mode));

  function init() {
    const options = GristAPI.getWidgetOptions() || {};
    currentId = normalize(options[OPTION_KEY]);
    currentOpen = normalizeOpen(options[OPEN_KEY]);
    GristAPI.onWidgetOptionsChange(incomingOptions => {
      // Les options changent pour mille raisons (les autres réglages du widget) : chacune des deux se lit seule, et rien n'est redessiné quand elle est celle qu'on a.
      const incoming = normalize(incomingOptions && incomingOptions[OPTION_KEY]);
      const incomingOpen = normalizeOpen(incomingOptions && incomingOptions[OPEN_KEY]);
      if (!echoes.isEcho(JSON.stringify(incoming))) { currentId = incoming; renderPanel(); }
      if (!openEchoes.isEcho(JSON.stringify(incomingOpen)) && incomingOpen !== currentOpen) { currentOpen = incomingOpen; renderPanel(); }
    });
  }

  // Réglages > Vue > Modèle par défaut de cette vue
  const el = id => document.getElementById(id);

  // Le modèle ouvert, tel que le montre js/main.js (liste des modèles) : null pour un nouveau modèle jamais enregistré.
  function openTemplate() {
    const id = Templates.getCurrentId();
    return id != null ? find(id) || null : null;
  }

  function statusText() {
    const chosen = currentId != null ? find(currentId) : null;
    if (chosen && !Templates.isOpenableType(chosen.typeModele)) {
      return I18n.t('settings.viewTemplate.status.unavailable', { name: chosen.nom, reason: Templates.unavailableText(chosen.typeModele) });
    }
    if (chosen) return I18n.t('settings.viewTemplate.status.set', { name: chosen.nom });
    // Choix enregistré mais le modèle n'existe plus : dit tel quel, le modèle par défaut du document s'ouvre.
    if (currentId != null) return I18n.t('settings.viewTemplate.status.missing');
    const defaultId = Templates.getDefaultId();
    const fallback = defaultId != null ? find(defaultId) : null;
    return fallback
      ? I18n.t('settings.viewTemplate.status.noneWithDefault', { name: fallback.nom })
      : I18n.t('settings.viewTemplate.status.none');
  }

  // Pourquoi chacun des deux boutons est grisé : sa phrase, ou '' quand il est actif. Une seule lecture de l'état, que le `title`, l'`aria-disabled`, la phrase visible et le clic partagent (un clic ne
  // doit jamais agir là où le bouton dit qu'il ne peut pas). La lecture seule l'emporte sur le reste : c'est la phrase du verrou, que l'écran affiche déjà.
  function greyedReasons() {
    const locked = isReadOnly();
    const open = openTemplate();
    const unsaved = !locked && !open;
    const already = !locked && !!open && String(open.id) === String(currentId);
    const lockedText = I18n.t('settings.viewTemplate.locked');
    return {
      locked, open, unsaved,
      set: locked ? lockedText
        : unsaved ? I18n.t('settings.viewTemplate.reason.unsaved')
        : already ? I18n.t('settings.viewTemplate.reason.already') : '',
      clear: locked ? lockedText
        : currentId == null ? I18n.t('settings.viewTemplate.reason.nothingToRemove') : '',
    };
  }

  // Grisé par aria-disabled (le bouton garde le survol et le focus) avec sa raison : en `title`, et en `aria-describedby` vers la phrase visible qui la dit quand il y en a une. Actif : ni l'un ni l'autre.
  function setGreyed(button, reason, describedBy) {
    if (reason) { button.setAttribute('aria-disabled', 'true'); button.title = reason; } else { button.removeAttribute('aria-disabled'); button.removeAttribute('title'); }
    if (reason && describedBy) button.setAttribute('aria-describedby', describedBy); else button.removeAttribute('aria-describedby');
  }

  function renderPanel() {
    const status = el('settings-viewtemplate-status');
    if (!status) return;
    status.textContent = statusText();
    const why = greyedReasons();
    const setBtn = el('settings-viewtemplate-set');
    const clearBtn = el('settings-viewtemplate-clear');
    // Grisés, jamais retirés : aucun modèle enregistré ouvert (un nouveau modèle n'a pas encore d'id), déjà celui de la vue, ou lecture seule. Tous les
    // types de modèle se choisissent : document, grille, email et macro-modèle. Le bouton grisé garde son libellé.
    if (setBtn) {
      setGreyed(setBtn, why.set, why.locked ? 'settings-viewtemplate-locked' : why.unsaved ? 'settings-viewtemplate-unsaved' : '');
      setBtn.textContent = why.open
        ? I18n.t('settings.viewTemplate.useNamed', { name: why.open.nom })
        : I18n.t('settings.viewTemplate.use');
    }
    if (clearBtn) setGreyed(clearBtn, why.clear, why.locked ? 'settings-viewtemplate-locked' : '');
    // La phrase visible : seulement quand la raison est un modèle pas encore enregistré. En lecture seule, la phrase du verrou parle seule.
    const unsavedHint = el('settings-viewtemplate-unsaved');
    if (unsavedHint) unsavedHint.hidden = !why.unsaved;
    const lockedHint = el('settings-viewtemplate-locked');
    if (lockedHint) lockedHint.hidden = !why.locked;
    renderOpenMode(why.locked);
  }

  // Section « Mode d'ouverture de cette vue » : la liste montre le choix en vigueur, la phrase dessous dit ce qu'il fait. Verrouillée en lecture seule : la liste est grisée ET la phrase du verrou la décrit (aria-describedby).
  function renderOpenMode(locked) {
    const select = el('settings-viewopen-mode');
    if (!select) return;
    select.value = currentOpen || 'last';
    select.disabled = locked;
    // La raison du grisé, dite trois fois comme celle des boutons du dessus : la phrase visible, l'info-bulle (de la liste et de son libellé, que le survol atteint même quand la liste est inerte) et la description lue par le lecteur d'écran.
    const reason = locked ? I18n.t('settings.viewOpen.locked') : '';
    [select, el('settings-viewopen-mode-label')].forEach(node => { if (!node) return; if (reason) node.title = reason; else node.removeAttribute('title'); });
    if (locked) select.setAttribute('aria-describedby', 'settings-viewopen-locked'); else select.removeAttribute('aria-describedby');
    const status = el('settings-viewopen-status');
    if (status) status.textContent = I18n.t('settings.viewOpen.status.' + (currentOpen || 'last'));
    const lockedHint = el('settings-viewopen-locked');
    if (lockedHint) lockedHint.hidden = !locked;
  }

  function wirePanel() {
    const setBtn = el('settings-viewtemplate-set');
    const clearBtn = el('settings-viewtemplate-clear');
    if (!setBtn || !clearBtn) return;
    // Un bouton grisé par aria-disabled reçoit encore le clic : il ne fait rien (rien d'écrit, aucun pas dans l'historique de Ctrl + Z).
    setBtn.addEventListener('click', () => {
      const why = greyedReasons();
      if (why.set) return;
      set(why.open.id);
    });
    clearBtn.addEventListener('click', () => { if (!greyedReasons().clear) clear(); });
    const openSelect = el('settings-viewopen-mode');
    if (openSelect) openSelect.addEventListener('change', () => {
      if (isReadOnly()) { renderPanel(); return; }
      setOpenMode(openSelect.value);
    });
    // Relu à chaque ouverture des Réglages : le modèle ouvert, la liste des modèles et les droits ont pu changer depuis.
    const openBtn = el('v2-btn-settings');
    if (openBtn) openBtn.addEventListener('click', renderPanel);
    // Les droits changent aussi Réglages ouverts (onglet Accès, case cochée dans la table des droits, relecture de 10 s) : les boutons se grisent ou
    // se dégrisent sans rouvrir. Rien à préserver ici : l'écran n'a aucune saisie.
    if (typeof AccessRights !== 'undefined') AccessRights.onChange(renderPanel);
    renderPanel();
  }

  return { init, getId, usableId, set, clear, openMode, setOpenMode, wirePanel };
})();
