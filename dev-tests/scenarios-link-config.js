// Suite "linkConfig" - fenêtre de choix de la clé entre deux tables (#link-config-modal, Variables.showLinkConfigModal), retour d'Antoine du 2026-09-29 :
// 1) listes de colonnes avec recherche « en tapant du texte », mises à jour au fil de la frappe (js/search-select.js, par-dessus les deux <select> qui
// restent la source des valeurs) ; 2) le nom de la table où est la donnée réelle de chaque colonne, entre parenthèses (js/variables.js:columnHint).
// Les gestes clavier sont envoyés comme des KeyboardEvent sur les vrais champs ; les clics à la souris réelle à 700x400 sont dans le script Node
// verify-var-toolbar-mouse.mjs (groupe varToolbarMouse).
(function () {
  const cases = [];

  // La page est sur LcDossiers (Responsable = Référence vers LcAnnuaire, affichée par une colonne d'aide comme dans un vrai document Grist) ; LcContacts,
  // pas encore liée, référence LcDossiers par Dossier : ouvrir sa fenêtre pré-remplit source = « Auto » (l'identifiant de ligne), cible = Dossier.
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

  const SOURCE_LABELS = ['Auto (LcDossiers)', 'Titre (LcDossiers)', 'Statut (LcDossiers)', 'Responsable (' + refHint('LcAnnuaire') + ')',
    'Montant (LcDossiers)', 'gristHelper_Display (LcAnnuaire)'];
  const CIBLE_LABELS = ['Auto (LcContacts)', 'Dossier (' + refHint('LcDossiers') + ')', 'Role (LcContacts)', 'Nom (LcContacts)',
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
      const pass = opened && JSON.stringify(matches) === JSON.stringify(['Auto (LcDossiers)', 'Titre (LcDossiers)']) && firstActive && secondActive
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
      const pass = shown.source.indexOf('Auto') === 0 && shown.cible.indexOf('Dossier') === 0 && selectedRow === 'Dossier (' + refHint('LcDossiers') + ')'
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
        await pick('source', 'Statut');
        same('noMatch', [preview(), good()], [I18n.t('linkConfig.previewNoMatch', { table: 'LcContacts', value: 'Urgent' }), false]);

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
    id: 'linkcfg_text_of_a_reference_finds_the_rows_it_shows',
    description: 'Retour d’Antoine du 22/10 : « Titre = Dossier » (une colonne de la table de la page contre une colonne Référence de la table liée) trouve les lignes dont la Référence MONTRE ce texte, dans l’aperçu comme à la résolution, comme « Auto = Dossier » (l’identifiant de ligne) trouve celles qu’elle désigne ; le numéro compte toujours, et un autre texte ou un texte vide ne trouve rien',
    run: async (h) => {
      await seed(h);
      const stub = window.__gristStub;
      const records = [
        { id: 1, Titre: 'Dossier A', Statut: 'Urgent', Responsable: 'Dupont Jean', Montant: 2 },
        { id: 2, Titre: 'Dossier B', Statut: '', Responsable: 'Dupont Jean', Montant: 300 },
      ];
      // Deux dossiers ; quatre contacts : deux sur le dossier A, un sur le B, un sans dossier (Référence vide : 0, et le texte vide que Grist calcule pour elle).
      stub.setRows('LcDossiers', records.map(r => ({ ...r, Responsable: 7, gristHelper_Display: 'Dupont Jean' })));
      stub.setRows('LcContacts', [
        { id: 1, Dossier: 1, Role: 'Client', Nom: 'Xavier', gristHelper_Display: 'Dossier A' },
        { id: 2, Dossier: 2, Role: 'Client', Nom: 'Yvonne', gristHelper_Display: 'Dossier B' },
        { id: 3, Dossier: 1, Role: 'Conseil', Nom: 'Zoé', gristHelper_Display: 'Dossier A' },
        { id: 4, Dossier: 0, Role: 'Client', Nom: 'Wilfried', gristHelper_Display: '' },
      ]);
      stub.fireRecord(records[0], 'LcDossiers');
      await h.sleep(30);
      const { closed } = await openKeyWindow(h);
      const pick = async (which, value) => { select(which).value = value; select(which).dispatchEvent(new Event('change', { bubbles: true })); await h.sleep(30); };
      const found = (count, ids) => I18n.t('linkConfig.previewMatches', { count, table: 'LcContacts', ids });
      const none = value => I18n.t('linkConfig.previewNoMatch', { table: 'LcContacts', value });
      const seen = {};
      await pick('source', 'Titre');
      seen.byTitle = preview();
      await pick('source', 'id');
      seen.byId = preview();
      await pick('source', 'Statut');
      seen.byOtherText = preview();
      await pick('source', 'Montant');
      seen.byNumber = preview();
      stub.fireRecord(records[1], 'LcDossiers');
      await h.sleep(30);
      await pick('source', 'Statut');
      seen.byEmptyText = preview();
      await pick('source', 'Titre');
      seen.secondDossier = preview();
      stub.fireRecord(records[0], 'LcDossiers');
      await h.sleep(30);
      await pick('source', 'Titre');
      document.getElementById('link-config-confirm').click();
      const confirmed = await settled(closed);
      const rule = GristAPI.getLinkRule('LcContacts');
      const resolved = (await Variables.resolveLinkedRows('LcContacts', rule, GristAPI.getCurrentRecord(), 'LcDossiers')).map(r => r.id);
      await GristAPI.deleteLinkRule('LcContacts');
      const pass = seen.byTitle === found(2, '1, 3') && seen.byId === found(2, '1, 3') && seen.byOtherText === none('Urgent') && seen.byNumber === found(1, '2')
        && seen.byEmptyText === none('') && seen.secondDossier === found(1, '2')
        && confirmed === true && !!rule && rule.colonneSource === 'Titre' && rule.colonneCible === 'Dossier' && JSON.stringify(resolved) === '[1,3]';
      return { pass, notes: JSON.stringify({ seen, confirmed, rule, resolved }) };
    },
  });

  cases.push({
    id: 'linkcfg_a_list_of_references_matches_on_each_of_its_elements',
    description: 'Choix d’Antoine du 22/10 (« Oui, sous chaque instance ») : une colonne Liste de références de la table liée comme lien trouve une ligne dès que l’UN de ses éléments correspond - par « Auto » (le numéro de la ligne) comme par une colonne de la page (le texte que la liste montre) -, pas seulement par le premier ; une liste vide ou un autre texte ne trouve rien',
    run: async (h) => {
      await seed(h);
      const stub = window.__gristStub;
      const records = [
        { id: 1, Titre: 'Dossier A', Statut: 'Urgent', Responsable: 'Dupont Jean', Montant: 1200 },
        { id: 3, Titre: 'Dossier C', Statut: '', Responsable: 'Dupont Jean', Montant: 300 },
      ];
      // LcSuivis : « Premier » est sur les dossiers A puis B, « Deuxième » sur B puis A (A en second), « Troisième » sur C seul, « Vide » sur aucun.
      stub.setVariables('LcSuivis', { Libelle: 'Text', Dossiers: 'RefList:LcDossiers', gristHelper_Display: 'Any' }, null, { Dossiers: 'gristHelper_Display' });
      stub.setRows('LcSuivis', [
        { id: 1, Libelle: 'Premier', Dossiers: ['L', 1, 2], gristHelper_Display: ['L', 'Dossier A', 'Dossier B'] },
        { id: 2, Libelle: 'Deuxième', Dossiers: ['L', 2, 1], gristHelper_Display: ['L', 'Dossier B', 'Dossier A'] },
        { id: 3, Libelle: 'Troisième', Dossiers: ['L', 3], gristHelper_Display: ['L', 'Dossier C'] },
        { id: 4, Libelle: 'Vide', Dossiers: null, gristHelper_Display: ['L'] },
      ]);
      await GristAPI.refreshSchema();
      await GristAPI.deleteLinkRule('LcSuivis');
      const closed = Variables.ensureLinkConfigured({ table: 'LcSuivis' });
      await h.sleep(150);
      const pick = async (which, value) => { select(which).value = value; select(which).dispatchEvent(new Event('change', { bubbles: true })); await h.sleep(30); };
      const found = (count, ids) => I18n.t('linkConfig.previewMatches', { count, table: 'LcSuivis', ids });
      const none = value => I18n.t('linkConfig.previewNoMatch', { table: 'LcSuivis', value });
      const seen = {};
      await pick('cible', 'Dossiers');
      await pick('source', 'id');
      seen.byId = preview();
      await pick('source', 'Titre');
      seen.byTitle = preview();
      await pick('source', 'Statut');
      seen.byOtherText = preview();
      stub.fireRecord(records[1], 'LcDossiers');
      await h.sleep(30);
      await pick('source', 'id');
      seen.lastOneById = preview();
      await pick('source', 'Titre');
      seen.lastOneByTitle = preview();
      await pick('source', 'Statut');
      seen.byEmptyText = preview();
      stub.fireRecord(records[0], 'LcDossiers');
      await h.sleep(30);
      await pick('source', 'Titre');
      document.getElementById('link-config-confirm').click();
      const confirmed = await settled(closed);
      const rule = GristAPI.getLinkRule('LcSuivis');
      const resolved = (await Variables.resolveLinkedRows('LcSuivis', rule, GristAPI.getCurrentRecord(), 'LcDossiers')).map(r => r.id);
      await GristAPI.deleteLinkRule('LcSuivis');
      const pass = seen.byId === found(2, '1, 2') && seen.byTitle === found(2, '1, 2') && seen.byOtherText === none('Urgent')
        && seen.lastOneById === found(1, '3') && seen.lastOneByTitle === found(1, '3') && seen.byEmptyText === none('')
        && confirmed === true && !!rule && rule.colonneSource === 'Titre' && rule.colonneCible === 'Dossiers' && JSON.stringify(resolved) === '[1,2]';
      return { pass, notes: JSON.stringify({ seen, confirmed, rule, resolved }) };
    },
  });

  cases.push({
    id: 'linkcfg_the_row_id_option_is_named_auto',
    description: 'Retour d’Antoine du 22/10 : l’option « identifiant de ligne » des deux listes de la fenêtre de liaison et la ligne du panneau « Tables liées » se nomment « Auto » (en français comme en anglais) ; sa valeur enregistrée reste « id » (les règles déjà écrites marchent) et ses anciens noms (« identifiant de ligne », « row ID ») la retrouvent toujours dans la zone de recherche',
    run: async (h) => {
      await seed(h);
      const wrong = [];
      const check = (name, got, expected) => { if (JSON.stringify(got) !== JSON.stringify(expected)) wrong.push(name + ' : ' + JSON.stringify(got) + ' au lieu de ' + JSON.stringify(expected)); };
      const ask = async (words) => {
        trigger('source').click();
        await h.sleep(30);
        setInput(searchInput('source'), words);
        await h.sleep(10);
        const found = rows('source');
        press(searchInput('source'), 'Escape');
        await h.sleep(30);
        return found;
      };
      const inWindow = async (lang, oldName, expectedLine) => {
        const before = I18n.getLang();
        I18n.setLang(lang);
        try {
          const { closed } = await openKeyWindow(h);
          const first = sel => Array.from(select(sel).options).find(o => !o.disabled);
          check(lang + ' : liste de gauche', [first('source').textContent, first('source').value], ['Auto (LcDossiers)', 'id']);
          check(lang + ' : liste de droite', [first('cible').textContent, first('cible').value], ['Auto (LcContacts)', 'id']);
          check(lang + ' : champ de gauche', trigger('source').textContent.indexOf('Auto') === 0, true);
          check(lang + ' : ancien nom cherché', await ask(oldName), ['Auto (LcDossiers)']);
          check(lang + ' : le nom cherché', await ask('auto'), ['Auto (LcDossiers)']);
          await closeWindow(h);
          await settled(closed);
          // Le panneau « Tables liées » : la règle qui compare le numéro de la ligne l'écrit « Auto », des deux côtés du « = ».
          await GristAPI.saveLinkRule('LcContacts', { mode: 'match', colonneCible: 'Dossier', colonneSource: 'id' });
          await GristAPI.saveLinkRule('LcAnnuaire', { mode: 'match', colonneCible: 'id', colonneSource: 'Responsable' });
          Variables.refreshLinkRulesPanel();
          const lines = Array.from(document.querySelectorAll('#link-rules-list .link-rule-label')).map(n => n.textContent).filter(t => /→ Lc(Contacts|Annuaire) :/.test(t)).sort();
          check(lang + ' : panneau « Tables liées »', lines, expectedLine);
        } finally {
          I18n.setLang(before);
          await GristAPI.deleteLinkRule('LcAnnuaire');
          await GristAPI.deleteLinkRule('LcContacts');
        }
      };
      // Des liens posés sans table de page (ceux d'avant les liens par table) : la ligne dit qu'ils valent pour toutes les tables.
      await inWindow('fr', 'identifiant de ligne', ['Toutes les tables → LcAnnuaire : Auto = Responsable', 'Toutes les tables → LcContacts : Dossier = Auto']);
      await inWindow('en', 'row ID', ['All tables → LcAnnuaire : Auto = Responsable', 'All tables → LcContacts : Dossier = Auto']);
      return { pass: wrong.length === 0, notes: wrong.join(' | ') || 'ok' };
    },
  });

  // ---- Un lien par table de la page (retour d'Antoine du 23/10 : le lien de « Projets » vers deux tables de page se défaisait) ----
  // LcNotifs est une seconde table de page qui désigne le même LcAnnuaire que LcDossiers, par une autre colonne (Contact, quand LcDossiers passe par Responsable).
  const DOSSIER_ROW = { id: 1, Titre: 'Dossier A', Statut: 'Urgent', Responsable: 'Dupont Jean', Montant: 1200 };
  const NOTIF_ROW = { id: 1, Objet: 'Relance', Contact: 'Martin Claire' };
  async function goToPage(h, table) {
    window.__gristStub.fireRecord(table === 'LcNotifs' ? NOTIF_ROW : DOSSIER_ROW, table);
    await h.sleep(40);
  }
  async function seedTwoPages(h) {
    await seed(h);
    const stub = window.__gristStub;
    stub.setVariables('LcNotifs', { Objet: 'Text', Contact: 'Ref:LcAnnuaire', gristHelper_Display: 'Any' }, null, { Contact: 'gristHelper_Display' });
    stub.setRows('LcAnnuaire', [
      { id: 7, NomPrenom: 'Dupont Jean', Telephone: '06 11 22 33 44' },
      { id: 8, NomPrenom: 'Martin Claire', Telephone: '06 55 66 77 88' },
    ]);
    stub.setRows('LcNotifs', [{ id: 1, Objet: 'Relance', Contact: 8, gristHelper_Display: 'Martin Claire' }]);
    await GristAPI.refreshSchema();
    await GristAPI.deleteLinkRule('LcAnnuaire');
    await goToPage(h, 'LcDossiers');
  }
  const choose = async (h, which, value) => { select(which).value = value; select(which).dispatchEvent(new Event('change', { bubbles: true })); await h.sleep(30); };
  // Ouvre la fenêtre de la clé comme la personne (par `open`), choisit les deux colonnes et valide. Rend si elle s'est ouverte, ce qu'elle disait de sa portée
  // et la réponse de l'appel ; une fenêtre qui ne s'ouvre pas (le lien existe déjà) rend `opened: false` sans rien choisir.
  async function linkThroughWindow(h, open, source, cible) {
    const closed = open();
    await h.sleep(150);
    const opened = modal().style.display !== 'none';
    const scope = document.getElementById('link-config-scope').textContent;
    if (opened) {
      await choose(h, 'source', source);
      await choose(h, 'cible', cible);
      document.getElementById('link-config-confirm').click();
    }
    return { opened, scope, answer: await settled(closed) };
  }
  const ruleOf = (target, page) => { const rule = GristAPI.getLinkRule(target, page); return rule && [rule.colonneSource, rule.colonneCible]; };
  const storedRows = () => {
    const table = window.__gristStub.state.rows.Publipostage_LiensTables;
    return table.id.map((id, i) => ({ target: table.TableCible[i], page: table.TableSource ? table.TableSource[i] : null, source: table.ColonneSource[i], cible: table.ColonneCible[i] }));
  };

  cases.push({
    id: 'linkcfg_each_page_table_keeps_its_own_link_to_the_same_table',
    description: 'Retour d’Antoine du 23/10 : une table lue depuis deux tables de page (ici LcAnnuaire depuis LcDossiers par Responsable, depuis LcNotifs par Contact) a un lien pour CHAQUE table de page - la fenêtre s’ouvre pour la seconde au lieu de croire le lien déjà posé, dit pour quelle table elle règle le lien, et refaire le lien depuis une table ne touche pas celui de l’autre',
    run: async (h) => {
      await seedTwoPages(h);
      const open = () => Variables.ensureLinkConfigured({ table: 'LcAnnuaire' });
      let first, second, edited;
      try {
        first = await linkThroughWindow(h, open, 'Responsable', 'id');
        await goToPage(h, 'LcNotifs');
        second = await linkThroughWindow(h, open, 'Contact', 'id');
        const both = { dossiers: ruleOf('LcAnnuaire', 'LcDossiers'), notifs: ruleOf('LcAnnuaire', 'LcNotifs') };
        const stored = storedRows().filter(r => r.target === 'LcAnnuaire');
        // Refaire le lien depuis LcNotifs : celui de LcDossiers ne bouge pas.
        edited = await linkThroughWindow(h, () => Variables.editLinkRule('LcAnnuaire'), 'Objet', 'NomPrenom');
        const after = { dossiers: ruleOf('LcAnnuaire', 'LcDossiers'), notifs: ruleOf('LcAnnuaire', 'LcNotifs') };
        const pass = first.opened && first.answer === true && second.opened && second.answer === true
          && first.scope === I18n.t('linkConfig.scope', { table: 'LcDossiers' }) && second.scope === I18n.t('linkConfig.scope', { table: 'LcNotifs' })
          && JSON.stringify(both) === JSON.stringify({ dossiers: ['Responsable', 'id'], notifs: ['Contact', 'id'] })
          && JSON.stringify(stored.map(r => r.page).sort()) === JSON.stringify(['LcDossiers', 'LcNotifs'])
          && edited.opened && edited.answer === true
          && JSON.stringify(after) === JSON.stringify({ dossiers: ['Responsable', 'id'], notifs: ['Objet', 'NomPrenom'] })
          && storedRows().filter(r => r.target === 'LcAnnuaire').length === 2;
        return { pass, notes: JSON.stringify({ first, second, edited, both, stored, after }) };
      } finally {
        await GristAPI.deleteLinkRule('LcAnnuaire');
        await goToPage(h, 'LcDossiers');
      }
    },
  });

  cases.push({
    id: 'linkcfg_the_variable_reads_its_row_through_the_link_of_its_own_page_table',
    description: 'Une variable d’une autre table se lit par le lien de la table de SA page : #LcAnnuaire.NomPrenom donne Dupont Jean sur une ligne de LcDossiers (lien par Responsable) et Martin Claire sur une ligne de LcNotifs (lien par Contact), les deux liens existant en même temps',
    run: async (h) => {
      await seedTwoPages(h);
      try {
        await GristAPI.saveLinkRule('LcAnnuaire', { mode: 'match', colonneCible: 'id', colonneSource: 'Responsable', tableSource: 'LcDossiers' });
        await GristAPI.saveLinkRule('LcAnnuaire', { mode: 'match', colonneCible: 'id', colonneSource: 'Contact', tableSource: 'LcNotifs' });
        const fromDossier = await Variables.resolveVariable('LcAnnuaire', 'NomPrenom', 'LcDossiers', DOSSIER_ROW);
        const fromNotif = await Variables.resolveVariable('LcAnnuaire', 'NomPrenom', 'LcNotifs', NOTIF_ROW);
        return { pass: fromDossier === 'Dupont Jean' && fromNotif === 'Martin Claire', notes: JSON.stringify({ fromDossier, fromNotif }) };
      } finally {
        await GristAPI.deleteLinkRule('LcAnnuaire');
      }
    },
  });

  cases.push({
    id: 'linkcfg_a_link_from_before_still_serves_every_page_table_until_one_sets_its_own',
    description: 'Un lien d’avant les liens par table (sans table de page) reste le repli de toutes les tables : il lit la variable sur LcDossiers comme sur LcNotifs, un lien propre à LcNotifs prend alors le pas sur lui pour cette table seulement, et le supprimer rend à LcNotifs le lien commun',
    run: async (h) => {
      await seedTwoPages(h);
      try {
        await GristAPI.saveLinkRule('LcAnnuaire', { mode: 'match', colonneCible: 'id', colonneSource: 'Responsable' });
        const common = { dossiers: ruleOf('LcAnnuaire', 'LcDossiers'), notifs: ruleOf('LcAnnuaire', 'LcNotifs'), exactNotifs: GristAPI.findLinkRule('LcAnnuaire', 'LcNotifs') };
        await GristAPI.saveLinkRule('LcAnnuaire', { mode: 'match', colonneCible: 'id', colonneSource: 'Contact', tableSource: 'LcNotifs' });
        const own = { dossiers: ruleOf('LcAnnuaire', 'LcDossiers'), notifs: ruleOf('LcAnnuaire', 'LcNotifs') };
        const resolved = { dossier: await Variables.resolveVariable('LcAnnuaire', 'NomPrenom', 'LcDossiers', DOSSIER_ROW), notif: await Variables.resolveVariable('LcAnnuaire', 'NomPrenom', 'LcNotifs', NOTIF_ROW) };
        await GristAPI.deleteLinkRule('LcAnnuaire', 'LcNotifs');
        const back = ruleOf('LcAnnuaire', 'LcNotifs');
        const pass = JSON.stringify(common.dossiers) === JSON.stringify(['Responsable', 'id']) && JSON.stringify(common.notifs) === JSON.stringify(['Responsable', 'id']) && common.exactNotifs === null
          && JSON.stringify(own) === JSON.stringify({ dossiers: ['Responsable', 'id'], notifs: ['Contact', 'id'] })
          && resolved.dossier === 'Dupont Jean' && resolved.notif === 'Martin Claire'
          && JSON.stringify(back) === JSON.stringify(['Responsable', 'id']);
        return { pass, notes: JSON.stringify({ common, own, resolved, back }) };
      } finally {
        await GristAPI.deleteLinkRule('LcAnnuaire');
      }
    },
  });

  cases.push({
    id: 'linkcfg_the_linked_tables_panel_names_the_page_table_and_edits_a_link_only_from_its_own_table',
    description: 'Le panneau « Tables liées » dit « table de la page → table liée : clé » (« Toutes les tables » pour un lien d’avant), grise le crayon d’un lien réglé pour une autre table - en disant laquelle ouvrir, ou que la table n’existe plus -, laisse celui d’un lien commun et de la table ouverte ; supprimer retire le seul lien nommé, avec une confirmation qui nomme les deux tables',
    run: async (h) => {
      await seedTwoPages(h);
      const dialogs = h.stubDialogs({ confirm: true });
      const rowsOf = () => Array.from(document.querySelectorAll('#link-rules-list .link-rule-row')).map(row => ({
        label: row.querySelector('.link-rule-label').textContent,
        editDisabled: row.querySelector('.link-rule-btn-edit').disabled,
        editTitle: row.querySelector('.link-rule-btn-edit').title,
        row,
      })).filter(r => /→ Lc(Annuaire|Contacts) :/.test(r.label));
      const plain = list => list.map(({ row, ...rest }) => rest);
      try {
        await GristAPI.saveLinkRule('LcAnnuaire', { mode: 'match', colonneCible: 'id', colonneSource: 'Responsable', tableSource: 'LcDossiers' });
        await GristAPI.saveLinkRule('LcAnnuaire', { mode: 'match', colonneCible: 'id', colonneSource: 'Contact', tableSource: 'LcNotifs' });
        await GristAPI.saveLinkRule('LcAnnuaire', { mode: 'match', colonneCible: 'id', colonneSource: 'Ancienne', tableSource: 'LcFantome' });
        await GristAPI.saveLinkRule('LcContacts', { mode: 'match', colonneCible: 'Dossier', colonneSource: 'id' });
        Variables.refreshLinkRulesPanel();
        const listed = rowsOf();
        const expected = [
          { label: 'LcDossiers → LcAnnuaire : Auto = Responsable', editDisabled: false, editTitle: I18n.t('linkRules.edit') },
          { label: 'LcFantome → LcAnnuaire : Auto = Ancienne (' + I18n.t('linkRules.tableGone') + ')', editDisabled: true, editTitle: I18n.t('linkRules.editGone', { table: 'LcFantome' }) },
          { label: 'LcNotifs → LcAnnuaire : Auto = Contact', editDisabled: true, editTitle: I18n.t('linkRules.editElsewhere', { table: 'LcNotifs' }) },
          { label: 'Toutes les tables → LcContacts : Dossier = Auto', editDisabled: false, editTitle: I18n.t('linkRules.edit') },
        ];
        // Le crayon du lien commun règle un lien pour la table ouverte, à partir de ce lien : le commun reste le repli des autres.
        listed[3].row.querySelector('.link-rule-btn-edit').click();
        await h.sleep(150);
        const editOpened = modal().style.display !== 'none';
        const scope = document.getElementById('link-config-scope').textContent;
        const prefilled = [select('source').value, select('cible').value];
        document.getElementById('link-config-confirm').click();
        await h.sleep(60);
        const ownContacts = GristAPI.findLinkRule('LcContacts', 'LcDossiers');
        const commonContacts = GristAPI.findLinkRule('LcContacts', '');
        // Supprimer le lien de LcNotifs : la confirmation nomme les deux tables, LcDossiers garde le sien.
        Variables.refreshLinkRulesPanel();
        rowsOf().find(r => r.label.startsWith('LcNotifs →')).row.querySelector('.link-rule-btn-delete').click();
        await h.sleep(80);
        const asked = dialogs.asked.filter(a => a.kind === 'confirm').map(a => a.title);
        const afterDelete = { notifs: GristAPI.findLinkRule('LcAnnuaire', 'LcNotifs'), dossiers: ruleOf('LcAnnuaire', 'LcDossiers'), stored: storedRows().filter(r => r.target === 'LcAnnuaire').map(r => r.page).sort() };
        // Le lien commun : la confirmation d’avant, qui ne nomme que la table liée.
        Variables.refreshLinkRulesPanel();
        rowsOf().find(r => r.label.startsWith('Toutes les tables →')).row.querySelector('.link-rule-btn-delete').click();
        await h.sleep(80);
        const askedCommon = dialogs.asked.filter(a => a.kind === 'confirm').map(a => a.title)[1];
        const pass = JSON.stringify(plain(listed)) === JSON.stringify(expected)
          && editOpened && scope === I18n.t('linkConfig.scope', { table: 'LcDossiers' }) && JSON.stringify(prefilled) === JSON.stringify(['id', 'Dossier'])
          && !!ownContacts && ownContacts.colonneCible === 'Dossier' && !!commonContacts
          && JSON.stringify(asked) === JSON.stringify([I18n.t('linkRules.confirmDeletePair', { source: 'LcNotifs', table: 'LcAnnuaire' })])
          && afterDelete.notifs === null && JSON.stringify(afterDelete.dossiers) === JSON.stringify(['Responsable', 'id']) && JSON.stringify(afterDelete.stored) === JSON.stringify(['LcDossiers', 'LcFantome'])
          && askedCommon === I18n.t('linkRules.confirmDelete', { table: 'LcContacts' }) && GristAPI.findLinkRule('LcContacts', '') === null && !!GristAPI.findLinkRule('LcContacts', 'LcDossiers');
        return { pass, notes: JSON.stringify({ listed: plain(listed), editOpened, scope, prefilled, ownContacts, commonContacts: !!commonContacts, asked, afterDelete, askedCommon }) };
      } finally {
        dialogs.restore();
        await GristAPI.deleteLinkRule('LcAnnuaire');
        await GristAPI.deleteLinkRule('LcContacts');
        Variables.refreshLinkRulesPanel();
      }
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
