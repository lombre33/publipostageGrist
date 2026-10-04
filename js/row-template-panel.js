// Onglet Réglages > Selon la ligne : relier un modèle à une condition sur la ligne de la table du widget. Le réglage et son évaluation sont dans
// js/row-template.js ; ici seulement l'écran. Les règles sont celles des macro-modèles (ConditionFields.buildTemplateRule : mêmes champs Colonne /
// Opérateur / Valeur, colonnes de toutes les tables, clé de correspondance ouverte si la table n'est pas liée). Les modèles se cherchent dans la
// liste avec recherche (js/search-select.js).
//
// Chaque saisie enregistre le réglage (brouillon de la vue, cf. js/row-template.js:save) mais n'ouvre rien : la ligne courante n'est relue qu'à la
// fermeture des Réglages, pour ne pas voir surgir la question « Enregistrer / Abandonner / Annuler » en pleine saisie. Décoché, l'écran reste visible
// mais grisé (rien ne disparaît) ; en lecture seule il est verrouillé, comme l'onglet Accès, et suit les droits en direct : dès qu'ils changent
// Réglages ouverts (choix dans l'onglet Accès, case cochée dans la table des droits, relecture de 10 s), il se grise ou se dégrise sans qu'on le
// rouvre. Seul le verrou est rejoué (applyLock) : les règles et le brouillon ne sont pas redessinés, la saisie en cours garde son champ, son curseur
// et sa valeur.
const RowTemplatePanel = (function () {
  const PERSIST_DELAY_MS = 250;

  let draft = null;           // { enabled, rules, otherwise } en cours d'édition ; recopié des options à chaque ouverture des Réglages
  let persistTimer = null;
  let touched = false;        // la personne a agi depuis l'ouverture : le rendu qui suit la relecture du schéma ne doit pas lui défaire sa saisie
  let otherwiseSearch = null;

  const el = id => document.getElementById(id);

  function isReadOnly() { return typeof AccessRights !== 'undefined' && AccessRights.get().readOnly; }

  // Tous les modèles : un modèle email ou un macro-modèle s'ouvre comme un autre.
  function templates() { return Templates.getCached(); }

  function searchable(select, opts) {
    try { return SearchSelect.attachTemplates(select, opts); }
    catch (e) { console.warn('[RowTemplatePanel] recherche de modèle indisponible, liste native conservée', e); return null; }
  }

  // La règle d'une ligne : les champs et la mise en page sont ceux de ConditionFields.buildTemplateRule, partagés avec les macro-modèles.
  function buildRuleRow(rule, ruleIndex) {
    const connector = I18n.t(ruleIndex === 0 ? 'macro.modal.ruleIf' : 'settings.rowTemplate.ruleElseIf');
    const onRemove = () => {
      touched = true;
      draft.rules.splice(ruleIndex, 1);
      render();
      schedulePersist();
    };
    const { row, modeleSelect } = ConditionFields.buildTemplateRule(rule, { connector, templates: templates(), onRemove });
    searchable(modeleSelect, { inline: true });
    return row;
  }

  function fillOtherwise(select) {
    select.innerHTML = '';
    const add = (value, text) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = text;
      select.appendChild(opt);
    };
    add(RowTemplate.DEFAULT, I18n.t('settings.rowTemplate.otherwise.default'));
    add(RowTemplate.KEEP, I18n.t('settings.rowTemplate.otherwise.keep'));
    templates().forEach(t => add(String(t.id), t.nom));
    const known = Array.prototype.some.call(select.options, o => o.value === draft.otherwise);
    if (!known) draft.otherwise = RowTemplate.DEFAULT; // modèle supprimé depuis : retour au modèle par défaut, dit à l'écran
    select.value = draft.otherwise;
  }

  function render() {
    const container = el('settings-rowtemplate-rules');
    if (!container || !draft) return;
    container.innerHTML = '';
    if (!draft.rules.length) {
      const empty = document.createElement('div');
      empty.className = 'macro-slots-empty';
      empty.textContent = I18n.t('settings.rowTemplate.empty');
      container.appendChild(empty);
    }
    draft.rules.forEach((rule, i) => container.appendChild(buildRuleRow(rule, i)));
    const enabled = el('settings-rowtemplate-enabled');
    if (enabled) enabled.checked = !!draft.enabled;
    const otherwise = el('settings-rowtemplate-otherwise');
    if (otherwise) {
      fillOtherwise(otherwise);
      if (!otherwiseSearch) otherwiseSearch = searchable(otherwise);
      if (otherwiseSearch) otherwiseSearch.sync();
    }
    applyLock();
  }

  // Grisé, jamais retiré : décoché, ou verrouillé pour qui est en lecture seule (sans quoi l'onglet suffirait à contourner le verrou de l'onglet
  // Accès). Ne touche ni aux règles ni au brouillon : rappelé seul quand les droits changent Réglages ouverts, pour ne pas redessiner une saisie en
  // cours (ni son focus, ni son curseur).
  function applyLock() {
    if (!draft) return;
    const locked = isReadOnly();
    const body = el('settings-rowtemplate-body');
    if (body) {
      const off = !draft.enabled || locked;
      body.classList.toggle('is-off', off);
      body.inert = off;
      if (off) body.setAttribute('aria-disabled', 'true'); else body.removeAttribute('aria-disabled');
    }
    const enabled = el('settings-rowtemplate-enabled');
    if (enabled) enabled.disabled = locked;
    const lockedHint = el('settings-rowtemplate-locked');
    if (lockedHint) lockedHint.hidden = !locked;
  }

  function schedulePersist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(flush, PERSIST_DELAY_MS);
  }

  function flush() {
    clearTimeout(persistTimer);
    persistTimer = null;
    if (!draft || isReadOnly()) return Promise.resolve();
    return RowTemplate.save(draft).catch(e => console.error('[RowTemplatePanel] réglage non enregistré', e));
  }

  function wire() {
    const enabled = el('settings-rowtemplate-enabled');
    const addBtn = el('settings-rowtemplate-add');
    const rules = el('settings-rowtemplate-rules');
    const otherwise = el('settings-rowtemplate-otherwise');
    if (!enabled || !addBtn || !rules || !otherwise) return;

    enabled.addEventListener('change', () => {
      touched = true;
      draft.enabled = enabled.checked;
      // Premier réglage : une règle vide est là, prête à remplir, plutôt qu'un cadre vide.
      if (draft.enabled && !draft.rules.length) draft.rules.push({ column: '', operator: '=', value: '', modeleId: null });
      render();
      schedulePersist();
    });
    addBtn.addEventListener('click', () => {
      touched = true;
      draft.rules.push({ column: '', operator: '=', value: '', modeleId: null });
      render();
    });
    otherwise.addEventListener('change', () => { touched = true; draft.otherwise = otherwise.value || RowTemplate.DEFAULT; schedulePersist(); });
    // Les champs d'une règle (colonne, opérateur, valeur, modèle) modifient la règle sur place puis laissent l'évènement remonter : on n'enregistre
    // qu'ensuite.
    ['change', 'input'].forEach(type => rules.addEventListener(type, () => { touched = true; schedulePersist(); }));

    const openBtn = el('v2-btn-settings');
    if (openBtn) openBtn.addEventListener('click', () => {
      draft = RowTemplate.readRaw();
      touched = false;
      render();
      // Schéma relu à chaque ouverture (une colonne a pu être ajoutée depuis), comme l'onglet Accès.
      GristAPI.refreshSchema().then(() => { if (!touched) render(); }).catch(() => {});
    });
    // Fermeture des Réglages (bouton ou autre chemin : on regarde la fenêtre, pas le bouton) : le réglage est écrit, puis la ligne courante est
    // relue.
    const modal = el('settings-modal');
    if (modal && typeof MutationObserver === 'function') {
      let wasOpen = modal.style.display === 'flex';
      new MutationObserver(() => {
        const open = modal.style.display !== 'none' && modal.style.display !== '';
        if (wasOpen && !open) flush().then(() => RowTemplate.refresh()).catch(e => console.error('[RowTemplatePanel] réglage non appliqué', e));
        wasOpen = open;
      }).observe(modal, { attributes: true, attributeFilter: ['style'] });
    }
    I18n.onChange(() => { if (draft) render(); });
    // Droits changés pendant que les Réglages sont ouverts : le verrou suit tout de suite. Sans brouillon (Réglages jamais ouverts), rien à faire :
    // l'ouverture dessine l'onglet.
    if (typeof AccessRights !== 'undefined') AccessRights.onChange(applyLock);
  }

  return { wire };
})();
