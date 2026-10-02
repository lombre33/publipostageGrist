// Modèle selon la ligne (retour d'Antoine, 2026-10-02, point 16 : « plutôt qu'un choix de modèle manuel, pouvoir relier un modèle à une condition dans la table où est
// le widget pour qu'il ouvre le bon modèle en fonction de la ligne, y compris en mode édition, sans alourdir l'ouverture quand l'option n'est pas activée »).
//
// Réglage dans les options du widget (clé OPTION_KEY, Réglages > Selon la ligne : js/row-template-panel.js), même mécanique que js/access-rights.js : les options arrivent
// avec le widget (aucune lecture de plus), et ne sont partagées qu'une fois la vue enregistrée côté Grist (setOption ne pose qu'un brouillon). Forme :
//   { enabled: true, rules: [{ column, operator, value, modeleId }], otherwise: 'default' | 'keep' | <id d'un modèle> }
// Les règles sont celles des macro-modèles (ConditionRules.matches : mêmes opérateurs, colonnes de toutes les tables, clé de correspondance) et se lisent dans l'ordre : la
// première qui correspond choisit le modèle. Aucune ne correspond : le modèle par défaut (★) ou, au choix, celui qui est déjà ouvert (« keep ») ou un modèle précis.
//
// Réglage absent ou coupé : `follow()` rend false tout de suite, sans toucher à Grist ni au document, donc l'ouverture n'a pas un appel de plus. Activé : une règle est
// évaluée à chaque CHANGEMENT de ligne (ou quand le résultat de la ligne change), jamais à chaque mise à jour de la même ligne : un modèle ouvert à la main sur une ligne y
// reste tant que la ligne et la règle ne changent pas. Changer de modèle passe par le chemin ordinaire de la liste des modèles (js/main.js:openTemplateForRow), donc par sa
// question « Enregistrer / Abandonner / Annuler » quand des modifications attendent : « Annuler » garde le modèle ouvert, sans reposer la question pour la même ligne.
//   RowTemplate.init(hooks)            -> lit les options, s'abonne à leurs changements ; hooks = { openTemplate(id) -> Promise<bool>, currentId(), currentRecord() -> { record, tableId } }
//   RowTemplate.start()                -> à appeler une fois les modèles chargés et le premier modèle ouvert : les lignes reçues avant sont alors prises en compte
//   RowTemplate.isActive()             -> un réglage complet est en vigueur
//   RowTemplate.pick(record, tableId)  -> id du modèle que cette ligne ouvre, ou null (ne rien changer)
//   RowTemplate.follow(record, tableId)-> Promise<bool> : le modèle a changé (js/main.js:loadTemplateIntoEditor a alors déjà redessiné la Lecture)
//   RowTemplate.readRaw() / save(raw)  -> le réglage tel qu'enregistré / l'écrire sans rien ouvrir (l'onglet Réglages) ; refresh() l'applique à la ligne courante
const RowTemplate = (function () {
  const OPTION_KEY = 'modeleSelonLigne';
  const DEFAULT = 'default';
  const KEEP = 'keep';

  let config = null;       // réglage normalisé (règles complètes seulement), null tant qu'aucun n'est actif
  let hooks = null;
  let started = false;
  let lastHandled = null;  // { key, id } : dernière ligne traitée et ce qu'elle a donné ; la même ligne avec le même résultat ne rouvre rien
  let pending = null;      // la ligne la plus récente reçue pendant qu'un changement de modèle (ou sa question) était en cours
  let running = false;
  // Ce que cet écran vient d'écrire dans les options : Grist le renvoie par onOptions, parfois après une saisie plus récente - l'écho d'une valeur déjà remplacée
  // ne doit pas défaire le réglage en cours.
  const expectedEchoes = [];

  const isComplete = r => !!(r && r.column && r.modeleId != null && r.modeleId !== '');

  function normalizeRule(r) {
    return { column: String(r.column), operator: r.operator ? String(r.operator) : '=', value: r.value == null ? '' : r.value, modeleId: String(r.modeleId) };
  }

  function normalizeOtherwise(value) {
    if (value === KEEP) return KEEP;
    return value != null && value !== '' && value !== DEFAULT ? String(value) : DEFAULT;
  }

  // Le réglage en vigueur : activé ET au moins une règle complète (colonne et modèle). Sinon null : rien à évaluer.
  function normalizeConfig(raw) {
    if (!raw || typeof raw !== 'object' || raw.enabled !== true) return null;
    const rules = (Array.isArray(raw.rules) ? raw.rules : []).filter(isComplete).map(normalizeRule);
    if (!rules.length) return null;
    return { enabled: true, rules, otherwise: normalizeOtherwise(raw.otherwise) };
  }

  // Ce qui s'enregistre : l'état coché ET les règles complètes, même coupé (recocher retrouve ses règles) ; rien du tout quand il n'y a plus rien à garder.
  function normalizeRaw(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const rules = (Array.isArray(raw.rules) ? raw.rules : []).filter(isComplete).map(normalizeRule);
    if (!raw.enabled && !rules.length) return null;
    return { enabled: !!raw.enabled, rules, otherwise: normalizeOtherwise(raw.otherwise) };
  }

  function readRaw() {
    const raw = normalizeRaw((GristAPI.getWidgetOptions() || {})[OPTION_KEY]);
    return raw ? JSON.parse(JSON.stringify(raw)) : { enabled: false, rules: [], otherwise: DEFAULT };
  }

  function isActive() { return !!config; }

  const templateExists = id => Templates.getCached().some(t => String(t.id) === String(id));

  // Même garde qu'au démarrage (js/main.js) : un modèle email ou macro n'est jamais « le modèle par défaut » qu'on ouvre tout seul.
  function defaultTemplateId() {
    const id = Templates.getDefaultId();
    if (id == null) return null;
    const tpl = Templates.getCached().find(t => String(t.id) === String(id));
    return tpl && tpl.typeModele !== 'email' && tpl.typeModele !== 'macro' ? String(tpl.id) : null;
  }

  async function pick(record, tableId) {
    if (!config || !record) return null;
    for (const rule of config.rules) {
      if (!templateExists(rule.modeleId)) continue; // un modèle supprimé depuis : la règle est sautée, la suivante est lue
      if (await ConditionRules.matches(rule, tableId, record)) return String(rule.modeleId);
    }
    if (config.otherwise === KEEP) return null;
    if (config.otherwise === DEFAULT) return defaultTemplateId();
    return templateExists(config.otherwise) ? String(config.otherwise) : null;
  }

  function rowKey(record, tableId) { return String(tableId || '') + ':' + (record && record.id != null ? record.id : ''); }

  // Une seule boucle à la fois : une ligne reçue pendant qu'une question « Enregistrer / Abandonner / Annuler » attend sa réponse est gardée, et c'est la plus récente
  // qui est traitée ensuite - jamais deux changements de modèle en même temps.
  async function run() {
    running = true;
    let switched = false;
    try {
      while (pending) {
        const { record, tableId } = pending;
        pending = null;
        let id;
        try { id = await pick(record, tableId); }
        catch (e) { console.error('[RowTemplate] choix du modèle impossible pour cette ligne', e); continue; }
        const key = rowKey(record, tableId);
        if (lastHandled && lastHandled.key === key && lastHandled.id === id) continue;
        lastHandled = { key, id };
        if (id == null || String(hooks.currentId()) === String(id)) continue;
        try { if (await hooks.openTemplate(id)) switched = true; }
        catch (e) { console.error('[RowTemplate] ouverture du modèle de la ligne impossible', e); }
      }
    } finally { running = false; }
    return switched;
  }

  function follow(record, tableId) {
    if (!config || !started || !hooks || !record) return Promise.resolve(false);
    pending = { record, tableId };
    if (running) return Promise.resolve(false);
    return run();
  }

  // Applique le réglage à la ligne courante : le modèle de cette ligne s'ouvre (ou la question « Enregistrer / Abandonner / Annuler » se pose) si ce n'est pas déjà lui.
  function refresh() {
    const current = hooks && hooks.currentRecord();
    return config && started && current && current.record ? follow(current.record, current.tableId) : Promise.resolve(false);
  }

  // `apply` faux : le réglage change sans rien ouvrir (l'onglet Réglages l'écrit à chaque saisie, la ligne courante n'est relue qu'à sa fermeture : `refresh`).
  function setConfig(next, apply) {
    if (JSON.stringify(next) === JSON.stringify(config)) return Promise.resolve(false);
    config = next;
    lastHandled = null; // un autre réglage s'applique de nouveau à la ligne courante
    return apply === false ? Promise.resolve(false) : refresh();
  }

  function start() {
    started = true;
    return refresh();
  }

  function init(h) {
    hooks = h;
    config = normalizeConfig((GristAPI.getWidgetOptions() || {})[OPTION_KEY]);
    GristAPI.onWidgetOptionsChange(options => {
      const incoming = JSON.stringify(normalizeRaw(options && options[OPTION_KEY]));
      const echo = expectedEchoes.indexOf(incoming);
      if (echo !== -1) { expectedEchoes.splice(0, echo + 1); return; }
      expectedEchoes.length = 0;
      setConfig(normalizeConfig(options && options[OPTION_KEY])).catch(e => console.error('[RowTemplate] réglage non appliqué', e));
    });
  }

  async function save(raw) {
    const clean = normalizeRaw(raw);
    // Brouillon de Grist : visible par tous une fois la vue enregistrée (bouton Enregistrer en haut du widget). Un échec n'empêche pas de l'appliquer ici.
    expectedEchoes.push(JSON.stringify(clean));
    if (expectedEchoes.length > 20) expectedEchoes.shift();
    try { await GristAPI.setWidgetOption(OPTION_KEY, clean); }
    catch (e) { console.error('[RowTemplate] enregistrement de l’option du widget impossible', e); }
    return setConfig(normalizeConfig(clean), false);
  }

  return { OPTION_KEY, DEFAULT, KEEP, init, start, isActive, pick, follow, refresh, readRaw, save, normalizeConfig, normalizeRaw };
})();
