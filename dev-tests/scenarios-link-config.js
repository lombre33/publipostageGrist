// Suite "linkConfig" - fenêtre de choix de la clé entre deux tables (#link-config-modal, Variables.showLinkConfigModal), retour d'Antoine du 2026-09-29 :
// 1) listes de colonnes avec recherche « en tapant du texte », mises à jour au fil de la frappe (js/search-select.js, par-dessus les deux <select> qui
// restent la source des valeurs) ; 2) le nom de la table où est la donnée réelle de chaque colonne, entre parenthèses (js/variables.js:columnHint).
// Les gestes clavier sont envoyés comme des KeyboardEvent sur les vrais champs ; les clics à la souris réelle à 700x400 sont dans le script Node
// verify-var-toolbar-mouse.mjs (groupe varToolbarMouse).
(function () {
  const cases = [];

  // La page est sur LcDossiers (Responsable = Référence vers LcAnnuaire, affichée par une colonne d'aide comme dans un vrai document Grist) ; LcContacts,
  // pas encore liée, référence LcDossiers par Dossier : ouvrir sa fenêtre pré-remplit source = « Identifiant de ligne », cible = Dossier.
  async function seed(h) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables('LcAnnuaire', { NomPrenom: 'Text', Telephone: 'Text' });
    stub.setVariables('LcDossiers', { Titre: 'Text', Statut: 'Text', Responsable: 'Ref:LcAnnuaire', Montant: 'Numeric', gristHelper_Display: 'Any' },
      null, { Responsable: 'gristHelper_Display' });
    stub.setVariables('LcContacts', { Dossier: 'Ref:LcDossiers', Role: 'Text', Nom: 'Text', gristHelper_Display: 'Any' }, null, { Dossier: 'gristHelper_Display' });
    stub.setRows('LcAnnuaire', [{ id: 7, NomPrenom: 'Dupont Jean', Telephone: '06 11 22 33 44' }]);
    stub.setRows('LcDossiers', [{ id: 1, Titre: 'Dossier A', Statut: 'Urgent', Responsable: 7, Montant: 1200, gristHelper_Display: 'Dupont Jean' }]);
    stub.setRows('LcContacts', [{ id: 1, Dossier: 1, Role: 'Client', Nom: 'Xavier', gristHelper_Display: 'Dossier A' }]);
    await GristAPI.refreshSchema();
    await GristAPI.deleteLinkRule('LcContacts');
    stub.fireRecord({ id: 1, Titre: 'Dossier A', Statut: 'Urgent', Responsable: 'Dupont Jean', Montant: 1200 }, 'LcDossiers');
    await h.sleep(50);
  }

  const modal = () => document.getElementById('link-config-modal');
  const select = which => document.getElementById(which === 'source' ? 'link-config-col-source' : 'link-config-col-cible');
  const trigger = which => select(which).parentNode.querySelector('.ss-trigger');
  const panel = which => select(which).parentNode.querySelector('.ss-panel');
  const searchInput = which => panel(which).querySelector('.ss-input');
  const preview = () => document.getElementById('link-config-preview').textContent;
  const isOpen = which => !panel(which).hidden;
  // « nom (indice) » comme on le lit à l'écran : le nom et l'indice sont deux éléments, séparés par une marge.
  const label = node => {
    const hint = node.querySelector('.ss-hint');
    return node.querySelector('.ss-name').textContent + (hint ? ' ' + hint.textContent : '');
  };
  const rows = which => Array.from(panel(which).querySelectorAll('.ss-option')).map(label);
  const setInput = (input, value) => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); };
  const press = (el, key) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    el.dispatchEvent(event);
    return event;
  };
  const refHint = table => I18n.t('linkConfig.refHint', { table });
  // La promesse de la fenêtre ne se règle qu'à sa fermeture : sans borne, une fenêtre qui ne se ferme pas ferait attendre toute la suite pour toujours.
  const settled = (promise) => Promise.race([promise, new Promise(resolve => setTimeout(() => resolve('timeout'), 2000))]);
  const closeWindow = async (h) => { document.getElementById('link-config-cancel').click(); await h.sleep(30); };
  // ensureLinkConfigured rend une promesse réglée à la fermeture de la fenêtre ; elle s'ouvre après un aller-retour asynchrone (colonnes Référence).
  // Rendue dans un objet : une fonction async qui rendrait la promesse elle-même l'attendrait, donc attendrait la fermeture d'une fenêtre encore ouverte.
  async function openKeyWindow(h) {
    const closed = Variables.ensureLinkConfigured({ table: 'LcContacts' });
    await h.sleep(150);
    return { closed };
  }

  const SOURCE_LABELS = ['Identifiant de ligne (LcDossiers)', 'Titre (LcDossiers)', 'Statut (LcDossiers)', 'Responsable (' + refHint('LcAnnuaire') + ')',
    'Montant (LcDossiers)', 'gristHelper_Display (LcAnnuaire)'];
  const CIBLE_LABELS = ['Identifiant de ligne (LcContacts)', 'Dossier (' + refHint('LcDossiers') + ')', 'Role (LcContacts)', 'Nom (LcContacts)',
    'gristHelper_Display (LcDossiers)'];

  cases.push({
    id: 'linkcfg_options_name_the_table_holding_the_data',
    description: 'Chaque colonne des deux listes porte, entre parenthèses, la table où est sa donnée réelle : la table visée pour une Référence, celle de la Référence pour la colonne d’aide de Grist, sinon sa propre table',
    run: async (h) => {
      await seed(h);
      const { closed } = await openKeyWindow(h);
      const nativeLabels = sel => Array.from(select(sel).options).filter(o => !o.disabled).map(o => o.textContent);
      const nativeSource = nativeLabels('source'), nativeCible = nativeLabels('cible');
      trigger('source').click();
      await h.sleep(30);
      const listedSource = rows('source');
      await closeWindow(h);
      await settled(closed);
      const pass = JSON.stringify(nativeSource) === JSON.stringify(SOURCE_LABELS) && JSON.stringify(nativeCible) === JSON.stringify(CIBLE_LABELS)
        && JSON.stringify(listedSource) === JSON.stringify(SOURCE_LABELS);
      return { pass, notes: JSON.stringify({ nativeSource, nativeCible, listedSource }) };
    },
  });

  cases.push({
    id: 'linkcfg_search_filters_the_list_while_typing',
    description: 'La zone de recherche filtre la liste à chaque frappe : accents et casse ignorés, tous les mots requis, la table entre parenthèses cherchée aussi, message si rien ne correspond',
    run: async (h) => {
      await seed(h);
      const { closed } = await openKeyWindow(h);
      trigger('source').click();
      await h.sleep(30);
      const input = searchInput('source');
      const steps = {};
      steps.all = rows('source');
      const typed = async (text) => { setInput(input, text); await h.sleep(10); return rows('source'); };
      steps.res = await typed('res');
      steps.accents = await typed('RÉFÉ');
      steps.table = await typed('annuaire');
      steps.words = await typed('ref annuaire');
      steps.none = await typed('zzz');
      const emptyShown = !panel('source').querySelector('.ss-empty').hidden && panel('source').querySelector('.ss-empty').textContent === I18n.t('linkConfig.noColumnMatch');
      steps.cleared = await typed('');
      const emptyGone = panel('source').querySelector('.ss-empty').hidden;
      await closeWindow(h);
      await settled(closed);
      const pass = JSON.stringify(steps.all) === JSON.stringify(SOURCE_LABELS)
        && JSON.stringify(steps.res) === JSON.stringify(['Responsable (' + refHint('LcAnnuaire') + ')'])
        && JSON.stringify(steps.accents) === JSON.stringify(['Responsable (' + refHint('LcAnnuaire') + ')'])
        && JSON.stringify(steps.table) === JSON.stringify(['Responsable (' + refHint('LcAnnuaire') + ')', 'gristHelper_Display (LcAnnuaire)'])
        && JSON.stringify(steps.words) === JSON.stringify(['Responsable (' + refHint('LcAnnuaire') + ')'])
        && steps.none.length === 0 && emptyShown && emptyGone && JSON.stringify(steps.cleared) === JSON.stringify(SOURCE_LABELS);
      return { pass, notes: JSON.stringify({ steps, emptyShown, emptyGone }) };
    },
  });

  cases.push({
    id: 'linkcfg_choosing_a_result_sets_the_value_and_refreshes_the_preview',
    description: 'Choisir un résultat (clic, puis Entrée) met la valeur du <select>, l’affiche dans le champ, rafraîchit l’aperçu et Valider enregistre ces deux colonnes',
    run: async (h) => {
      await seed(h);
      const { closed } = await openKeyWindow(h);
      const initial = { source: select('source').value, cible: select('cible').value, preview: preview() };
      // Source : recherche « resp », clic sur le résultat.
      trigger('source').click();
      await h.sleep(30);
      setInput(searchInput('source'), 'resp');
      await h.sleep(10);
      panel('source').querySelector('.ss-option').click();
      await h.sleep(60);
      const sourceValue = select('source').value;
      const sourceShown = trigger('source').textContent;
      const sourceClosed = !isOpen('source');
      const previewAfterSource = preview();
      // Cible : une lettre sur le champ fermé ouvre la recherche, on affine puis Entrée.
      press(trigger('cible'), 'r');
      await h.sleep(30);
      const seeded = searchInput('cible').value;
      setInput(searchInput('cible'), 'role');
      await h.sleep(10);
      press(searchInput('cible'), 'Enter');
      await h.sleep(60);
      const cibleValue = select('cible').value;
      document.getElementById('link-config-confirm').click();
      const confirmed = await settled(closed);
      const rule = GristAPI.getLinkRule('LcContacts');
      const pass = initial.source === 'id' && initial.cible === 'Dossier'
        && sourceValue === 'Responsable' && sourceShown.indexOf('Responsable') === 0 && sourceClosed && previewAfterSource !== initial.preview
        && seeded === 'r' && cibleValue === 'Role' && confirmed === true
        && !!rule && rule.mode === 'match' && rule.colonneSource === 'Responsable' && rule.colonneCible === 'Role';
      return { pass, notes: JSON.stringify({ initial, sourceValue, sourceShown, sourceClosed, previewAfterSource, seeded, cibleValue, confirmed, rule }) };
    },
  });

  cases.push({
    id: 'linkcfg_keyboard_only_flow',
    description: 'Au clavier : ↓ ouvre la liste et donne le focus à la recherche, la 1re ligne est active, ↓ passe à la suivante, Entrée choisit et rend le focus au champ',
    run: async (h) => {
      await seed(h);
      const { closed } = await openKeyWindow(h);
      trigger('source').focus();
      press(trigger('source'), 'ArrowDown');
      await h.sleep(30);
      const opened = isOpen('source') && trigger('source').getAttribute('aria-expanded') === 'true' && document.activeElement === searchInput('source');
      setInput(searchInput('source'), 'ti');
      await h.sleep(10);
      const matches = rows('source');
      const activeAfterTyping = panel('source').querySelector('.ss-option.is-active');
      const firstActive = !!activeAfterTyping && label(activeAfterTyping) === matches[0]
        && searchInput('source').getAttribute('aria-activedescendant') === activeAfterTyping.id;
      press(searchInput('source'), 'ArrowDown');
      const secondActive = label(panel('source').querySelector('.ss-option.is-active')) === matches[1];
      press(searchInput('source'), 'Enter');
      await h.sleep(30);
      const value = select('source').value;
      const backOnTrigger = !isOpen('source') && document.activeElement === trigger('source');
      await closeWindow(h);
      await settled(closed);
      const pass = opened && JSON.stringify(matches) === JSON.stringify(['Identifiant de ligne (LcDossiers)', 'Titre (LcDossiers)']) && firstActive && secondActive
        && value === 'Titre' && backOnTrigger;
      return { pass, notes: JSON.stringify({ opened, matches, firstActive, secondActive, value, backOnTrigger }) };
    },
  });

  cases.push({
    id: 'linkcfg_escape_closes_the_list_then_the_window',
    description: 'Échap referme d’abord la liste seule (la fenêtre reste ouverte, focus rendu au champ) ; un second Échap ferme la fenêtre comme avant, sans rien enregistrer',
    run: async (h) => {
      await seed(h);
      const { closed } = await openKeyWindow(h);
      trigger('cible').click();
      await h.sleep(30);
      setInput(searchInput('cible'), 'nom');
      press(searchInput('cible'), 'Escape');
      await h.sleep(30);
      const listClosed = !isOpen('cible');
      const windowStillOpen = modal().style.display !== 'none';
      const focusOnTrigger = document.activeElement === trigger('cible');
      const searchCleared = searchInput('cible').value === '';
      const unchanged = select('cible').value === 'Dossier';
      press(trigger('cible'), 'Escape');
      await h.sleep(30);
      const windowClosed = modal().style.display === 'none';
      const result = await settled(closed);
      const pass = listClosed && windowStillOpen && focusOnTrigger && searchCleared && unchanged && windowClosed && result === false && !GristAPI.getLinkRule('LcContacts');
      return { pass, notes: JSON.stringify({ listClosed, windowStillOpen, focusOnTrigger, searchCleared, unchanged, windowClosed, result }) };
    },
  });

  cases.push({
    id: 'linkcfg_editing_an_existing_rule_prefills_both_fields',
    description: 'Modifier un lien existant : les deux champs affichent les colonnes de la règle (avec leur table), le changement choisi dans la liste est enregistré',
    run: async (h) => {
      await seed(h);
      await GristAPI.saveLinkRule('LcContacts', { mode: 'match', colonneCible: 'Dossier', colonneSource: 'id' });
      const edited = Variables.editLinkRule('LcContacts');
      await h.sleep(150);
      const shown = { source: trigger('source').textContent, cible: trigger('cible').textContent };
      trigger('cible').click();
      await h.sleep(30);
      const selectedRow = label(panel('cible').querySelector('.ss-option[aria-selected="true"]'));
      setInput(searchInput('cible'), 'nom');
      await h.sleep(10);
      panel('cible').querySelector('.ss-option').click();
      await h.sleep(30);
      document.getElementById('link-config-confirm').click();
      const saved = await settled(edited);
      const rule = GristAPI.getLinkRule('LcContacts');
      const pass = shown.source.indexOf('Identifiant de ligne') === 0 && shown.cible.indexOf('Dossier') === 0 && selectedRow === 'Dossier (' + refHint('LcDossiers') + ')'
        && saved === true && !!rule && rule.colonneCible === 'Nom' && rule.colonneSource === 'id';
      return { pass, notes: JSON.stringify({ shown, selectedRow, saved, rule }) };
    },
  });

  cases.push({
    id: 'linkcfg_native_lists_come_back_on_close_and_when_the_component_fails',
    description: 'À la fermeture les <select> natifs sont rendus tels quels ; si le composant de recherche échoue, la fenêtre marche avec les <select> natifs',
    run: async (h) => {
      await seed(h);
      let { closed } = await openKeyWindow(h);
      const wrapped = modal().querySelectorAll('.ss-wrap').length === 2 && select('source').style.display === 'none';
      await closeWindow(h);
      await settled(closed);
      const restored = modal().querySelectorAll('.ss-wrap').length === 0 && select('source').style.display !== 'none' && select('cible').style.display !== 'none';
      const realAttach = SearchSelect.attach;
      let fallback;
      const warn = console.warn;
      console.warn = () => {};
      SearchSelect.attach = () => { throw new Error('composant indisponible'); };
      try {
        ({ closed } = await openKeyWindow(h));
        const nativeVisible = select('source').style.display !== 'none' && !modal().querySelector('.ss-trigger');
        select('source').value = 'Statut';
        select('source').dispatchEvent(new Event('change', { bubbles: true }));
        select('cible').value = 'Nom';
        select('cible').dispatchEvent(new Event('change', { bubbles: true }));
        document.getElementById('link-config-confirm').click();
        await settled(closed);
        fallback = { nativeVisible, rule: GristAPI.getLinkRule('LcContacts') };
      } finally {
        SearchSelect.attach = realAttach;
        console.warn = warn;
      }
      const pass = wrapped && restored && fallback.nativeVisible && !!fallback.rule && fallback.rule.colonneSource === 'Statut' && fallback.rule.colonneCible === 'Nom';
      return { pass, notes: JSON.stringify({ wrapped, restored, fallback }) };
    },
  });

  cases.push({
    id: 'linkcfg_title_modes_preview_and_answers_of_the_window',
    description: 'La fenêtre dit « table de la page → table liée », bascule entre « correspondance » et « ligne fixe » (champs et boutons-liens), dit dans l’aperçu chaque issue (colonnes à choisir, aucune ligne, lecture en cours ou impossible, correspondances, ligne fixe, table vide), refuse Valider sans les deux colonnes, enregistre ce qu’elle affiche et, une fois fermée, n’écoute plus rien',
    run: async (h) => {
      await seed(h);
      const $ = id => document.getElementById('link-config-' + id);
      const fire = el => el.dispatchEvent(new Event('change', { bubbles: true }));
      const parts = () => ({ fields: !$('match-fields').hidden, toSingleton: !$('toggle-singleton').hidden, toMatch: !$('toggle-match').hidden });
      const good = () => $('preview').classList.contains('is-good');
      const pick = async (which, value) => { select(which).value = value; fire(select(which)); await h.sleep(30); };
      const warn = console.warn;
      const realFetch = GristAPI.fetchTableRows;
      const realRecord = GristAPI.getCurrentRecord;
      const stub = window.__gristStub;
      const notes = {};
      const checks = [];
      const same = (name, actual, expected) => { const ok = JSON.stringify(actual) === JSON.stringify(expected); checks.push(ok); if (!ok) notes[name] = { actual, expected }; };
      const saved = () => { const rule = GristAPI.getLinkRule('LcContacts'); return rule && [rule.mode, rule.colonneCible, rule.colonneSource]; };
      // Écouteurs de clic en cours sur les quatre boutons de la fenêtre (posés moins retirés) : à la fermeture, il n'en reste aucun.
      const listening = {};
      const spies = ['confirm', 'cancel', 'toggle-singleton', 'toggle-match'].map(name => {
        const el = $(name);
        const add = el.addEventListener, remove = el.removeEventListener;
        listening[name] = 0;
        el.addEventListener = function (type, ...rest) { if (type === 'click') listening[name]++; return add.call(this, type, ...rest); };
        el.removeEventListener = function (type, ...rest) { if (type === 'click') listening[name]--; return remove.call(this, type, ...rest); };
        return el;
      });
      const box = modal();
      let closed;
      console.warn = () => {};
      try {
        ({ closed } = await openKeyWindow(h));
        same('listenersWhileOpen', { ...listening }, { confirm: 1, cancel: 1, 'toggle-singleton': 1, 'toggle-match': 1 });
        same('titles',[$('title').textContent, $('table-cible-name').textContent, $('table-source-name').textContent, modal().style.display], ['LcDossiers → LcContacts', 'LcContacts', 'LcDossiers', 'flex']);
        same('initialValues', [select('source').value, select('cible').value], ['id', 'Dossier']);
        same('initialParts', parts(), { fields: true, toSingleton: true, toMatch: false });
        same('initialPreview', [preview(), good()], [I18n.t('linkConfig.previewMatches', { count: 1, table: 'LcContacts', ids: '1' }), true]);

        $('toggle-singleton').click();
        await h.sleep(30);
        same('singletonParts', parts(), { fields: false, toSingleton: false, toMatch: true });
        same('singletonPreview', [preview(), good()], [I18n.t('linkConfig.previewSingleton', { id: 1, table: 'LcContacts' }), true]);
        stub.setRows('LcContacts', []);
        $('toggle-match').click();
        await h.sleep(30);
        same('matchAgainParts', parts(), { fields: true, toSingleton: true, toMatch: false });
        same('emptyTableMatch', [preview(), good()], [I18n.t('linkConfig.previewNoMatch', { table: 'LcContacts', value: 1 }), false]);
        $('toggle-singleton').click();
        await h.sleep(30);
        same('emptyTableSingleton', [preview(), good()], [I18n.t('linkConfig.previewTableEmpty', { table: 'LcContacts' }), false]);
        stub.setRows('LcContacts', [{ id: 1, Dossier: 1, Role: 'Client', Nom: 'Xavier', gristHelper_Display: 'Dossier A' }]);
        $('toggle-match').click();
        await h.sleep(30);
        await pick('source', 'Titre');
        same('noMatch', [preview(), good()], [I18n.t('linkConfig.previewNoMatch', { table: 'LcContacts', value: 'Dossier A' }), false]);

        await pick('source', '');
        same('chooseColumns', [preview(), good()], [I18n.t('linkConfig.previewChooseColumns'), false]);
        $('confirm').click();
        await h.sleep(30);
        same('refusedConfirm', [preview(), box.style.display, await Promise.race([closed, Promise.resolve('open')])], [I18n.t('linkConfig.chooseBeforeConfirm'), 'flex', 'open']);

        await pick('source', 'id');
        GristAPI.fetchTableRows = () => new Promise(() => {});
        await pick('cible', 'Role');
        same('computing', [preview(), good()], [I18n.t('linkConfig.previewComputing'), false]);
        GristAPI.fetchTableRows = () => Promise.reject(new Error('lecture impossible'));
        await pick('cible', 'Dossier');
        same('unavailable', [preview(), good()], [I18n.t('linkConfig.previewUnavailable'), false]);
        GristAPI.fetchTableRows = realFetch;
        GristAPI.getCurrentRecord = () => null;
        await pick('cible', 'Role');
        same('noRecord', [preview(), good()], [I18n.t('linkConfig.previewNoRecord'), false]);
        GristAPI.getCurrentRecord = realRecord;
        await pick('cible', 'Dossier');
        same('backToMatches', [preview(), good()], [I18n.t('linkConfig.previewMatches', { count: 1, table: 'LcContacts', ids: '1' }), true]);

        $('confirm').click();
        same('answer', [await settled(closed), saved(), box.style.display], [true, ['match', 'Dossier', 'id'], 'none']);
        same('listenersAfterClose', { ...listening }, { confirm: 0, cancel: 0, 'toggle-singleton': 0, 'toggle-match': 0 });
        const afterClose = { preview: preview(), parts: parts() };
        $('toggle-singleton').click();
        await pick('source', 'Titre');
        same('deafAfterClose', { preview: preview(), parts: parts() }, afterClose);

        const edited = Variables.editLinkRule('LcContacts');
        await h.sleep(150);
        $('toggle-singleton').click();
        await h.sleep(30);
        $('confirm').click();
        same('singletonAnswer', [await settled(edited), saved()], [true, ['singleton', '', '']]);

        const cancelled = Variables.editLinkRule('LcContacts');
        await h.sleep(150);
        same('reopenedAsSingleton', parts(), { fields: false, toSingleton: false, toMatch: true });
        $('cancel').click();
        same('cancelAnswer', [await settled(cancelled), saved(), box.style.display, { ...listening }], [false, ['singleton', '', ''], 'none', { confirm: 0, cancel: 0, 'toggle-singleton': 0, 'toggle-match': 0 }]);

        box.id = 'link-config-modal-absent';
        const noWindow = await settled(Variables.editLinkRule('LcContacts'));
        box.id = 'link-config-modal';
        same('noWindow', noWindow, false);
      } finally {
        console.warn = warn;
        GristAPI.fetchTableRows = realFetch;
        GristAPI.getCurrentRecord = realRecord;
        box.id = 'link-config-modal';
        spies.forEach(el => { delete el.addEventListener; delete el.removeEventListener; });
        stub.setRows('LcContacts', [{ id: 1, Dossier: 1, Role: 'Client', Nom: 'Xavier', gristHelper_Display: 'Dossier A' }]);
        await GristAPI.deleteLinkRule('LcContacts');
      }
      return { pass: checks.length === 24 && checks.every(Boolean), notes: JSON.stringify({ checks: checks.length, failed: notes }) };
    },
  });

  cases.push({
    id: 'searchselect_filter_ignores_case_accents_and_word_order',
    description: 'SearchSelect.filterItems : sans accents ni casse, tous les mots requis dans n’importe quel ordre, ordre d’origine conservé, recherche vide = tout',
    run: async () => {
      const item = (name, hint) => ({ name, hint, haystack: SearchSelect.normalize(name + ' ' + hint) });
      const items = [item('Téléphone', 'Annuaire'), item('Nom', 'Annuaire'), item('Titre', 'Dossiers')];
      const names = query => SearchSelect.filterItems(items, query).map(i => i.name).join(',');
      const pass = names('TELEPHONE') === 'Téléphone' && names('annuaire nom') === 'Nom' && names('nom annuaire') === 'Nom' && names('annuaire') === 'Téléphone,Nom'
        && names('') === 'Téléphone,Nom,Titre' && names('   ') === 'Téléphone,Nom,Titre' && names('xyz') === '';
      return { pass, notes: JSON.stringify({ a: names('TELEPHONE'), b: names('annuaire nom'), c: names('annuaire'), d: names('') }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.linkConfig = cases;
})();
