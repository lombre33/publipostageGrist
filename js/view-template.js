// Modèle par défaut de la vue (retour d'Antoine, 2026-10-02, « 16 bis » : « un bouton qui permette de mettre ce modèle par défaut pour la vue dans laquelle il est, comme ça à
// chaque fois que l'on arrive dans la vue/page on a le même modèle qui s'affiche »).
// Le widget n'a pas besoin de savoir sur quelle page il est : les options d'un widget appartiennent à SA vue (section) dans Grist, donc un widget posé sur deux pages a deux
// réglages. Le choix vit dans l'option `modeleDeLaVue` (l'id du modèle), même mécanique que js/access-rights.js et js/row-template.js : lue avec le widget, sans lecture de plus,
// et partagée par tout le monde seulement une fois la vue enregistrée côté Grist (grist.setOption ne pose qu'un brouillon : bouton Enregistrer en haut du widget).
// À l'ouverture : la ligne qui désigne un modèle (js/row-template.js) l'emporte, puis le modèle de la vue, puis le modèle par défaut du document (★, js/templates.js). Comme pour
// l'étoile, un modèle email ou un macro-modèle ne peut pas être ce modèle de départ (le bouton est grisé, et un choix déjà enregistré qui l'est devenu est ignoré).
// L'écran est la section « Modèle par défaut de cette vue » de Réglages > Vue : l'état, un bouton « Utiliser le modèle ouvert » et « Retirer ».
//   ViewTemplate.init()      -> lit l'option, s'abonne à ses changements ; à appeler une fois les options connues (après GristAPI.init)
//   ViewTemplate.usableId()  -> id du modèle de la vue s'il existe encore et peut servir de modèle de départ, sinon null
//   ViewTemplate.set(id)     -> choisit ce modèle pour la vue ; clear() retire le choix
//   ViewTemplate.wirePanel() -> branche la section de Réglages (redessinée à l'ouverture et à chaque changement de droits : en lecture seule, ses boutons sont grisés)
const ViewTemplate = (function () {
  const OPTION_KEY = 'modeleDeLaVue';

  let currentId = null;      // id choisi (texte) ou null
  // Ce que cet écran vient d'écrire dans les options : Grist le renvoie par onOptions, parfois après un choix plus récent (même garde que js/row-template.js).
  const expectedEchoes = [];

  const normalize = value => (value != null && value !== '' ? String(value) : null);
  const find = id => Templates.getCached().find(t => String(t.id) === String(id));
  // Un modèle email ou macro ne démarre jamais le widget (cf. js/main.js:syncDefaultTemplateButton).
  const canStart = tpl => !!tpl && tpl.typeModele !== 'email' && tpl.typeModele !== 'macro';

  function getId() { return currentId; }

  function usableId() {
    const tpl = currentId != null ? find(currentId) : null;
    return canStart(tpl) ? String(tpl.id) : null;
  }

  function isReadOnly() { return typeof AccessRights !== 'undefined' && AccessRights.get().readOnly; }

  async function write(id) {
    const next = normalize(id);
    expectedEchoes.push(JSON.stringify(next));
    if (expectedEchoes.length > 20) expectedEchoes.shift();
    currentId = next;
    try { await GristAPI.setWidgetOption(OPTION_KEY, next); }
    catch (e) { console.error('[ViewTemplate] enregistrement de l’option du widget impossible', e); }
    renderPanel();
  }

  const set = id => write(id);
  const clear = () => write(null);

  function init() {
    currentId = normalize((GristAPI.getWidgetOptions() || {})[OPTION_KEY]);
    GristAPI.onWidgetOptionsChange(options => {
      const incoming = normalize(options && options[OPTION_KEY]);
      const echo = expectedEchoes.indexOf(JSON.stringify(incoming));
      if (echo !== -1) { expectedEchoes.splice(0, echo + 1); return; }
      expectedEchoes.length = 0;
      currentId = incoming;
      renderPanel();
    });
  }

  // === Réglages > Vue > Modèle par défaut de cette vue ===
  const el = id => document.getElementById(id);

  // Le modèle ouvert, tel que le montre js/main.js (liste des modèles) : null pour un nouveau modèle jamais enregistré.
  function openTemplate() {
    const id = Templates.getCurrentId();
    return id != null ? find(id) || null : null;
  }

  function statusText() {
    const chosen = currentId != null ? find(currentId) : null;
    if (chosen && canStart(chosen)) return I18n.t('settings.viewTemplate.status.set', { name: chosen.nom });
    // Choix enregistré mais le modèle n'existe plus (ou n'est plus un modèle de départ) : dit tel quel, le modèle par défaut du document s'ouvre.
    if (currentId != null) return I18n.t('settings.viewTemplate.status.missing');
    const defaultId = Templates.getDefaultId();
    const fallback = defaultId != null ? find(defaultId) : null;
    return canStart(fallback)
      ? I18n.t('settings.viewTemplate.status.noneWithDefault', { name: fallback.nom })
      : I18n.t('settings.viewTemplate.status.none');
  }

  function renderPanel() {
    const status = el('settings-viewtemplate-status');
    if (!status) return;
    status.textContent = statusText();
    const locked = isReadOnly();
    const open = openTemplate();
    const setBtn = el('settings-viewtemplate-set');
    const clearBtn = el('settings-viewtemplate-clear');
    // Grisés, jamais retirés : aucun modèle ouvert, email ou macro (comme l'étoile), déjà celui de la vue, ou lecture seule.
    if (setBtn) {
      setBtn.disabled = locked || !canStart(open) || String(open && open.id) === String(currentId);
      setBtn.textContent = open && canStart(open)
        ? I18n.t('settings.viewTemplate.useNamed', { name: open.nom })
        : I18n.t('settings.viewTemplate.use');
      setBtn.title = open && !canStart(open) ? I18n.t('settings.viewTemplate.cannotStart') : '';
    }
    if (clearBtn) clearBtn.disabled = locked || currentId == null;
    const lockedHint = el('settings-viewtemplate-locked');
    if (lockedHint) lockedHint.hidden = !locked;
  }

  function wirePanel() {
    const setBtn = el('settings-viewtemplate-set');
    const clearBtn = el('settings-viewtemplate-clear');
    if (!setBtn || !clearBtn) return;
    setBtn.addEventListener('click', () => {
      const open = openTemplate();
      if (!canStart(open) || isReadOnly()) return;
      set(open.id);
    });
    clearBtn.addEventListener('click', () => { if (!isReadOnly()) clear(); });
    // Relu à chaque ouverture des Réglages : le modèle ouvert, la liste des modèles et les droits ont pu changer depuis.
    const openBtn = el('v2-btn-settings');
    if (openBtn) openBtn.addEventListener('click', renderPanel);
    I18n.onChange(renderPanel);
    // Et dès que les droits changent Réglages ouverts (choix dans l'onglet Accès, case cochée dans la table des droits, relecture de 10 s) : les boutons se grisent ou se dégrisent sans qu'on
    // les rouvre (choix d'Antoine du 2026-10-02). Rien à préserver ici : l'écran ne contient aucune saisie, que des boutons et un texte d'état.
    if (typeof AccessRights !== 'undefined') AccessRights.onChange(renderPanel);
    renderPanel();
  }

  return { OPTION_KEY, init, getId, usableId, set, clear, wirePanel };
})();
