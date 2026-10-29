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
  // Ctrl + Z (js/settings-history.js) : chaque écriture du réglage qui le change est UN pas, sauf la saisie d'un champ de texte, qui n'en fait qu'un de la première frappe à la sortie du champ, même si la
  // pause entre deux frappes fait écrire plusieurs fois. `typing` est le champ en cours de saisie, `runBefore` le réglage tel qu'il était avant la première écriture de la série.
  let typing = null;
  let runBefore = null;

  const el = id => document.getElementById(id);

  // Un champ de texte (la valeur d'une règle, la recherche d'une liste) : ses frappes se suivent sans que chacune compte. Une liste, une case ou un bouton est un geste à lui seul.
  const isTyped = field => field.tagName === 'INPUT' && ['checkbox', 'radio', 'button'].indexOf(field.type) === -1;

  function isReadOnly() { return typeof AccessRights !== 'undefined' && AccessRights.get().readOnly; }

  // Tous les modèles : un modèle email ou un macro-modèle s'ouvre comme un autre ; ceux d'un type inconnu sont listés grisés (markUnavailable).
  function templates() { return Templates.getCached(); }

  function searchable(select, opts) {
    try { return SearchSelect.attachTemplates(select, opts); }
    catch (e) { console.warn('[RowTemplatePanel] recherche de modèle indisponible, liste native conservée', e); return null; }
  }

  // Un modèle d'un type que le widget ne sait pas ouvrir (js/templates.js, isOpenableType) se liste grisé, avec sa raison sous son nom, et ne se choisit pas (data-unavailable, js/search-select.js) :
  // une règle qui le désignerait ne s'appliquerait jamais.
  function markUnavailable(select) {
    Array.prototype.forEach.call(select.options, opt => {
      const tpl = opt.value ? Templates.byId(opt.value) : null;
      if (tpl && !Templates.isOpenableType(tpl.typeModele)) opt.dataset.unavailable = Templates.unavailableText(tpl.typeModele);
    });
  }

  // La règle d'une ligne : les champs et la mise en page sont ceux de ConditionFields.buildTemplateRule, partagés avec les macro-modèles.
  function buildRuleRow(rule, ruleIndex) {
    const connector = I18n.t(ruleIndex === 0 ? 'macro.modal.ruleIf' : 'settings.rowTemplate.ruleElseIf');
    const onRemove = () => {
      endTyping();
      touched = true;
      draft.rules.splice(ruleIndex, 1);
      render();
      schedulePersist();
    };
    const { row, modeleSelect } = ConditionFields.buildTemplateRule(rule, { connector, templates: templates(), onRemove });
    markUnavailable(modeleSelect);
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
    markUnavailable(select);
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

  // Écrit le réglage. Ce qu'il a changé devient un pas de Ctrl + Z dès que la série de saisies en cours est finie : un geste seul (liste, case, croix) l'est aussitôt écrit, la saisie d'un champ de texte attend
  // d'en sortir (endTyping). Les options du widget sont à jour dès que `save` est appelé (GristAPI.setWidgetOption les recopie avant son premier `await`) : le pas se pose sans attendre Grist.
  function flush() {
    clearTimeout(persistTimer);
    persistTimer = null;
    if (!draft) return Promise.resolve();
    let saving = Promise.resolve();
    if (!isReadOnly()) {
      if (runBefore === null) runBefore = RowTemplate.readRaw();
      saving = RowTemplate.save(draft).catch(e => console.error('[RowTemplatePanel] réglage non enregistré', e));
    }
    if (!typing) closeRun();
    return saving;
  }

  function closeRun() {
    if (runBefore === null) return;
    SettingsHistory.record(RowTemplate.setting, runBefore, RowTemplate.readRaw());
    runBefore = null;
  }

  // La série de frappes finit - le champ est quitté, un autre geste commence, les Réglages se ferment : ce qui attend est écrit et la série devient UN pas.
  function endTyping() {
    if (!typing) return Promise.resolve();
    typing = null;
    return flush();
  }

  function wire() {
    const enabled = el('settings-rowtemplate-enabled');
    const addBtn = el('settings-rowtemplate-add');
    const rules = el('settings-rowtemplate-rules');
    const otherwise = el('settings-rowtemplate-otherwise');
    if (!enabled || !addBtn || !rules || !otherwise) return;

    enabled.addEventListener('change', () => {
      endTyping();
      touched = true;
      draft.enabled = enabled.checked;
      // Premier réglage : une règle vide est là, prête à remplir, plutôt qu'un cadre vide.
      if (draft.enabled && !draft.rules.length) draft.rules.push({ column: '', operator: '=', value: '', modeleId: null });
      render();
      schedulePersist();
    });
    // Une règle vide n'est pas un réglage : elle n'est écrite que complète (RowTemplate.save), donc ce bouton ne laisse aucun pas de Ctrl + Z. Sans brouillon (Réglages jamais ouverts), rien à faire.
    addBtn.addEventListener('click', () => {
      if (!draft) return;
      endTyping();
      touched = true;
      draft.rules.push({ column: '', operator: '=', value: '', modeleId: null });
      render();
    });
    otherwise.addEventListener('change', () => {
      endTyping();
      touched = true;
      draft.otherwise = otherwise.value || RowTemplate.DEFAULT;
      schedulePersist();
    });
    // Les champs d'une règle (colonne, opérateur, valeur, modèle) modifient la règle sur place puis laissent l'évènement remonter : on n'enregistre
    // qu'ensuite. En capture, avant que le champ ne change le brouillon : la série de frappes d'un champ de texte se ferme sur son état à elle quand un autre champ prend la suite, pour que chacun ait son pas.
    ['change', 'input'].forEach(type => {
      rules.addEventListener(type, event => {
        if (!isTyped(event.target)) endTyping();
        else if (typing !== event.target) { endTyping(); typing = event.target; }
      }, true);
      rules.addEventListener(type, () => { touched = true; schedulePersist(); });
    });
    // Le champ de texte est quitté (souris, Tab) : sa série de frappes est finie.
    rules.addEventListener('focusout', event => { if (event.target === typing) endTyping(); });

    const openBtn = el('v2-btn-settings');
    if (openBtn) openBtn.addEventListener('click', () => {
      draft = RowTemplate.readRaw();
      touched = false;
      typing = null;
      runBefore = null;
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
        if (wasOpen && !open) {
          typing = null;
          flush().then(() => RowTemplate.refresh()).catch(e => console.error('[RowTemplatePanel] réglage non appliqué', e));
        }
        wasOpen = open;
      }).observe(modal, { attributes: true, attributeFilter: ['style'] });
    }
    // « Retour » de Grist (js/save-reminder.js) : Grist rend les options enregistrées, l'onglet les reprend. Sans cela il gardait le réglage annulé (case
    // encore cochée) et la fermeture des Réglages l'écrivait de nouveau, ce qui refaisait apparaître « Enregistrer » pour un changement qu'on venait d'annuler.
    // Une écriture en attente (250 ms) du réglage annulé est abandonnée avec lui. Sans brouillon (Réglages jamais ouverts), rien à faire : l'ouverture relit.
    if (typeof SaveReminder !== 'undefined') SaveReminder.onRevert(() => {
      clearTimeout(persistTimer);
      persistTimer = null;
      typing = null;
      runBefore = null;
      if (!draft) return;
      draft = RowTemplate.readRaw();
      touched = false;
      render();
    });
    // Droits changés pendant que les Réglages sont ouverts : le verrou suit tout de suite. Sans brouillon (Réglages jamais ouverts), rien à faire :
    // l'ouverture dessine l'onglet.
    if (typeof AccessRights !== 'undefined') AccessRights.onChange(applyLock);
  }

  return { wire };
})();
