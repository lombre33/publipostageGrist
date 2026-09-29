// Suite "columnSearch" - liste avec recherche dans CHAQUE choix de colonne de l'interface (demande d'Antoine du 2026-09-29, capture de la fenêtre « Condition
// d'affichage » : « harmoniser l'ui dès que l'on propose un choix de colonne ... et proposer un champ de recherche dynamique », comme pour le choix de la clé
// entre deux tables, groupe linkConfig). Composant : js/search-select.js, ici pour ses évolutions (intitulés de groupes de tables, ligne de saisie avancée
// épinglée, choix « rien », état grisé, focus) et pour les fenêtres qui l'emploient : règles Colonne / Opérateur / Valeur (js/condition-fields.js : condition
// d'affichage d'une bulle, filtre d'une boucle, macro-modèles), colonne de tri d'une boucle, colonnes de Réglages > Accès. Les gestes à la vraie souris et au
// vrai clavier à 700x400 sont dans le script Node verify-column-search-mouse.mjs (groupe columnSearchMouse).
(function () {
  const cases = [];

  // Page sur CsDossiers ; CsAnnuaire liée par la colonne Référence Responsable ; CsContacts PAS encore liée (son choix de clé s'ouvre) ; CsLignes liée par sa
  // colonne Facture vers CsFactures (plusieurs lignes par facture : la fenêtre Boucle s'ouvre sur ses variables).
  async function seed(h) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables('CsAnnuaire', { NomPrenom: 'Text', Telephone: 'Text', Naissance: 'Date' });
    stub.setVariables('CsDossiers', { Titre: 'Text', Statut: 'Text', Responsable: 'Ref:CsAnnuaire', Montant: 'Numeric', Echeance: 'Date', Actif: 'Bool' });
    stub.setVariables('CsContacts', { Dossier: 'Ref:CsDossiers', Role: 'Text', Nom: 'Text' });
    stub.setVariables('CsFactures', { Numero: 'Text', Client: 'Text' });
    stub.setVariables('CsLignes', { Facture: 'Ref:CsFactures', Designation: 'Text', Qte: 'Numeric', Montant: 'Numeric', Presence: 'Choice' }, { Presence: ['Présent', 'Absent'] });
    stub.setRows('CsAnnuaire', [{ id: 7, NomPrenom: 'Dupont Jean', Telephone: '06 11 22 33 44', Naissance: 631152000 }]);
    stub.setRows('CsDossiers', [{ id: 1, Titre: 'Dossier A', Statut: 'Urgent', Responsable: 7, Montant: 1200, Echeance: 631152000, Actif: true }]);
    stub.setRows('CsContacts', [{ id: 1, Dossier: 1, Role: 'Client', Nom: 'Xavier' }]);
    stub.setRows('CsFactures', [{ id: 1, Numero: 'F-1', Client: 'Atelier Durand' }]);
    stub.setRows('CsLignes', [{ id: 1, Facture: 1, Designation: 'Audit', Qte: 1, Montant: 800, Presence: 'Présent' }, { id: 2, Facture: 1, Designation: 'Suivi', Qte: 2, Montant: 90, Presence: 'Absent' }]);
    await GristAPI.refreshSchema();
    for (const t of ['CsAnnuaire', 'CsContacts', 'CsLignes']) await GristAPI.deleteLinkRule(t);
    await GristAPI.saveLinkRule('CsAnnuaire', { mode: 'match', colonneCible: 'id', colonneSource: 'Responsable' });
    await GristAPI.saveLinkRule('CsLignes', { mode: 'match', colonneCible: 'Facture', colonneSource: 'id' });
    await GristAPI.refreshSchema();
    stub.fireRecord({ id: 1, Titre: 'Dossier A', Statut: 'Urgent', Responsable: 'Dupont Jean', Montant: 1200, Echeance: 631152000, Actif: true }, 'CsDossiers');
    await h.sleep(50);
  }

  function badgeHtml(table, column, extra) {
    return `<span class="var-badge" data-table="${table}" data-column="${column}" data-key="${table}.${column}"${extra || ''}></span>`;
  }
  function badgeNodes(ed) {
    const out = [];
    ed.state.doc.descendants((node, pos) => { if (node.type.name === 'varBadge') out.push({ node, pos }); });
    return out;
  }
  // Sélection de la bulle comme un clic (même contournement que scenarios-var-condition.js:selectBadge).
  async function selectBadge(h, key) {
    const ed = EditorCore.getEditor();
    document.querySelector('.tiptap').focus();
    const found = badgeNodes(ed).find(b => b.node.attrs.key === key);
    if (!found) return null;
    ed.commands.setNodeSelection(found.pos);
    await h.sleep(120);
    return ed;
  }
  function toolbarButton(action) { return document.querySelector('.v2-varfmt-toolbar').querySelector(`button[data-action="${action}"]`); }
  function pressToolbarButton(action) {
    toolbarButton(action).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  }
  function visible(el) { return !!el && el.style.display !== 'none' && el.getClientRects().length > 0; }
  function setInput(input, value) { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); }
  function press(el, key) {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    el.dispatchEvent(event);
    return event;
  }
  const conditionModal = () => document.getElementById('var-condition-modal');
  const loopModal = () => document.getElementById('var-loop-modal');

  async function openConditionWindow(h) {
    Editor.setHTML(`<p>Objet : ${badgeHtml('CsDossiers', 'Titre')}</p>`);
    await selectBadge(h, 'CsDossiers.Titre');
    pressToolbarButton('var-condition');
    await h.sleep(60);
    return conditionModal();
  }
  async function openLoopWindow(h) {
    Editor.setHTML(`<p>Lignes : ${badgeHtml('CsLignes', 'Designation')}.</p>`);
    await selectBadge(h, 'CsLignes.Designation');
    pressToolbarButton('var-loop');
    await h.sleep(100);
    return loopModal();
  }

  // Le champ visible d'un choix de colonne, son <select> masqué et son panneau.
  const triggerIn = root => root.querySelector('.ss-trigger');
  const panelOf = trigger => trigger.parentNode.querySelector('.ss-panel');
  const selectOf = trigger => trigger.parentNode.previousElementSibling;
  // « nom (indice) » comme on le lit à l'écran.
  const label = node => {
    const hint = node.querySelector('.ss-hint');
    return node.querySelector('.ss-name').textContent + (hint ? ' ' + hint.textContent : '');
  };
  const rowsOf = panel => Array.from(panel.querySelectorAll('.ss-option')).map(label);
  const headersOf = panel => Array.from(panel.querySelectorAll('.ss-group')).map(node => node.textContent);
  const inputOf = panel => panel.querySelector('.ss-input');
  const hintOf = type => ' (' + I18n.t(type) + ')';
  const cancelButton = modal => modal.querySelector('.var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)');
  const saveButton = modal => modal.querySelector('.var-modal-actions .var-modal-primary');
  // Fermeture sans rien enregistrer, même si la fenêtre a été laissée à demi remplie.
  function dismiss(modal) { if (visible(modal)) cancelButton(modal).click(); }

  cases.push({
    id: 'colsearch_condition_column_is_a_searchable_list_with_groups_and_types',
    description: 'Fenêtre de condition : le choix de colonne est un champ visible (le <select> est masqué), sa liste garde le choix « rien » en tête, un intitulé par table (page, liée, pas encore liée), le type derrière chaque colonne, et la saisie avancée en dernier',
    run: async (h) => {
      await seed(h);
      const modal = await openConditionWindow(h);
      const trigger = triggerIn(modal);
      const select = selectOf(trigger);
      const fieldWidth = trigger.getBoundingClientRect().width;
      const selectWidth = select.getBoundingClientRect().width;
      const closedText = trigger.textContent;
      trigger.click();
      await h.sleep(30);
      const panel = panelOf(trigger);
      const rows = rowsOf(panel);
      const heads = headersOf(panel);
      const opened = !panel.hidden && trigger.getAttribute('aria-expanded') === 'true';
      dismiss(modal);
      const linkedHead = heads.find(t => t.indexOf('CsAnnuaire') === 0);
      const contactsHead = heads.find(t => t.indexOf('CsContacts') === 0);
      const pass = fieldWidth > 80 && selectWidth === 0 && closedText === I18n.t('macro.modal.columnChoosePlaceholder') && opened
        && rows[0] === I18n.t('macro.modal.columnChoosePlaceholder') && rows[rows.length - 1] === I18n.t('macro.modal.columnAdvanced')
        && heads[0] === I18n.t('varCond.group.current', { table: 'CsDossiers' })
        && !!linkedHead && linkedHead.indexOf('CsDossiers.Responsable') !== -1 && contactsHead === I18n.t('varCond.group.notLinked', { table: 'CsContacts' })
        && rows.includes('Titre') && rows.includes('Responsable' + hintOf('macro.modal.typeRef')) && rows.includes('Montant' + hintOf('macro.modal.typeNumeric'))
        && rows.includes('Echeance' + hintOf('macro.modal.typeDate')) && rows.includes('Actif' + hintOf('macro.modal.typeBool'))
        && rows.includes('CsAnnuaire.Naissance' + hintOf('macro.modal.typeDate')) && rows.includes('CsContacts.Role');
      return { pass, notes: JSON.stringify({ fieldWidth, selectWidth, closedText, opened, heads, rows }) };
    },
  });

  cases.push({
    id: 'colsearch_condition_search_filters_rows_groups_and_keeps_advanced_entry',
    description: 'Recherche au fil de la frappe dans la fenêtre de condition : les intitulés des tables sans résultat disparaissent, le type se cherche aussi, « rien » ne se propose pas pendant une recherche, la saisie avancée reste toujours en bas, et Entrée sans résultat ne la choisit pas',
    run: async (h) => {
      await seed(h);
      const modal = await openConditionWindow(h);
      const trigger = triggerIn(modal);
      const select = selectOf(trigger);
      trigger.click();
      await h.sleep(30);
      const panel = panelOf(trigger);
      const input = inputOf(panel);
      const steps = {};
      const typed = async (text) => { setInput(input, text); await h.sleep(10); return { rows: rowsOf(panel), heads: headersOf(panel) }; };
      steps.annuaire = await typed('ann');
      steps.date = await typed('DATE');
      steps.words = await typed('cs role');
      steps.none = await typed('zzz');
      const emptyNode = panel.querySelector('.ss-empty');
      const emptyShown = !emptyNode.hidden && emptyNode.textContent === I18n.t('linkConfig.noColumnMatch');
      const emptyAbovePinned = !!emptyNode.nextElementSibling && emptyNode.nextElementSibling.classList.contains('is-pinned');
      const noActive = !panel.querySelector('.ss-option.is-active');
      press(input, 'Enter');
      await h.sleep(20);
      const stillOpen = !panel.hidden && select.value === '';
      steps.cleared = await typed('');
      const emptyGone = panel.querySelector('.ss-empty').hidden;
      const advanced = I18n.t('macro.modal.columnAdvanced');
      dismiss(modal);
      const pass = steps.annuaire.heads.length === 1 && steps.annuaire.heads[0].indexOf('CsAnnuaire') === 0
        && steps.annuaire.rows.slice(0, -1).every(r => r.indexOf('CsAnnuaire.') === 0) && steps.annuaire.rows[steps.annuaire.rows.length - 1] === advanced
        && !steps.annuaire.rows.includes(I18n.t('macro.modal.columnChoosePlaceholder'))
        && JSON.stringify(steps.date.rows) === JSON.stringify(['Echeance' + hintOf('macro.modal.typeDate'), 'CsAnnuaire.Naissance' + hintOf('macro.modal.typeDate'), advanced])
        && steps.date.heads.length === 2
        && JSON.stringify(steps.words.rows) === JSON.stringify(['CsContacts.Role', advanced]) && steps.words.heads.length === 1
        && JSON.stringify(steps.none.rows) === JSON.stringify([advanced]) && steps.none.heads.length === 0
        && emptyShown && emptyAbovePinned && noActive && stillOpen && emptyGone
        && steps.cleared.rows[0] === I18n.t('macro.modal.columnChoosePlaceholder') && steps.cleared.heads.length === 5; // les cinq tables du jeu de données
      return { pass, notes: JSON.stringify({ steps, emptyShown, emptyAbovePinned, noActive, stillOpen, emptyGone }) };
    },
  });

  cases.push({
    id: 'colsearch_condition_choosing_updates_rule_type_hint_value_field_and_saved_condition',
    description: 'Choisir une colonne dans la liste (Entrée sur le premier résultat, puis clic) met la valeur du <select>, le champ visible, l’indication de type sous le champ et le champ Valeur ; Enregistrer pose la condition sur la bulle',
    run: async (h) => {
      await seed(h);
      const modal = await openConditionWindow(h);
      const ed = EditorCore.getEditor();
      const trigger = triggerIn(modal);
      const select = selectOf(trigger);
      const typeHint = () => modal.querySelector('.macro-rule-column-type').textContent;
      // Clavier : une lettre ouvre avec elle comme début de recherche, Entrée prend le premier résultat.
      press(trigger, 'r');
      await h.sleep(30);
      const input = inputOf(panelOf(trigger));
      const seeded = input.value;
      setInput(input, 'respon');
      await h.sleep(10);
      press(input, 'Enter');
      await h.sleep(40);
      const afterEnter = { value: select.value, shown: trigger.textContent, typeHint: typeHint(), closed: panelOf(trigger).hidden, focusBack: document.activeElement === trigger };
      // Souris : un clic sur une ligne de la liste.
      trigger.click();
      await h.sleep(30);
      const boolRow = Array.from(panelOf(trigger).querySelectorAll('.ss-option')).find(r => label(r) === 'Actif' + hintOf('macro.modal.typeBool'));
      boolRow.click();
      await h.sleep(40);
      const afterClick = {
        value: select.value, shown: trigger.textContent, typeHint: typeHint(),
        valuePlaceholder: modal.querySelector('.macro-rule-value').placeholder, ruleRow: modal.querySelectorAll('.macro-rule-row').length,
      };
      setInput(modal.querySelector('.macro-rule-value'), 'Oui');
      await h.sleep(20);
      saveButton(modal).click();
      await h.sleep(80);
      const saved = badgeNodes(ed)[0].node.attrs.condition;
      const pass = seeded === 'r' && afterEnter.value === 'Responsable' && afterEnter.shown === 'Responsable' && afterEnter.typeHint === I18n.t('macro.modal.typeRef')
        && afterEnter.closed && afterEnter.focusBack
        && afterClick.value === 'Actif' && afterClick.shown === 'Actif' && afterClick.typeHint === I18n.t('macro.modal.typeBool')
        && afterClick.valuePlaceholder === I18n.t('macro.modal.valuePlaceholderBool')
        && !visible(modal) && !!saved && saved.rules.length === 1 && saved.rules[0].column === 'Actif' && saved.rules[0].value === 'Oui';
      return { pass, notes: JSON.stringify({ seeded, afterEnter, afterClick, saved }) };
    },
  });

  cases.push({
    id: 'colsearch_condition_advanced_entry_reveals_the_free_field_and_reopens_on_unknown_column',
    description: 'La saisie avancée de la liste montre le champ libre (avec le focus), sa frappe est la colonne de la règle ; une condition enregistrée sur une colonne inconnue rouvre la fenêtre sur la saisie avancée, jamais effacée',
    run: async (h) => {
      await seed(h);
      let modal = await openConditionWindow(h);
      const ed = EditorCore.getEditor();
      const trigger = triggerIn(modal);
      trigger.click();
      await h.sleep(30);
      panelOf(trigger).querySelector('.ss-option.is-pinned').click();
      await h.sleep(40);
      const free = modal.querySelector('.macro-rule-column-advanced');
      const revealed = !free.hidden && document.activeElement === free && trigger.textContent === I18n.t('macro.modal.columnAdvanced');
      setInput(free, 'CsInconnue.Colonne');
      setInput(modal.querySelector('.macro-rule-value'), 'x');
      await h.sleep(20);
      saveButton(modal).click();
      await h.sleep(80);
      const saved = badgeNodes(ed)[0].node.attrs.condition;
      await selectBadge(h, 'CsDossiers.Titre');
      pressToolbarButton('var-condition');
      await h.sleep(60);
      modal = conditionModal();
      const again = triggerIn(modal);
      const reopened = {
        shown: again.textContent, free: modal.querySelector('.macro-rule-column-advanced').value, freeVisible: !modal.querySelector('.macro-rule-column-advanced').hidden,
        selectValue: selectOf(again).value,
      };
      dismiss(modal);
      const pass = revealed && !!saved && saved.rules[0].column === 'CsInconnue.Colonne'
        && reopened.shown === I18n.t('macro.modal.columnAdvanced') && reopened.free === 'CsInconnue.Colonne' && reopened.freeVisible && reopened.selectValue === '__advanced__';
      return { pass, notes: JSON.stringify({ revealed, saved, reopened }) };
    },
  });

  cases.push({
    id: 'colsearch_condition_unlinked_table_cancel_puts_the_previous_column_back_in_the_field',
    description: 'Colonne d’une table pas encore liée choisie dans la liste : le choix de la clé s’ouvre ; Annuler remet la colonne précédente dans le <select> ET dans le champ visible, Valider garde la nouvelle',
    run: async (h) => {
      await seed(h);
      const modal = await openConditionWindow(h);
      const linkModal = document.getElementById('link-config-modal');
      const pick = async (rowName) => {
        const trigger = triggerIn(modal);
        trigger.click();
        await h.sleep(30);
        const row = Array.from(panelOf(trigger).querySelectorAll('.ss-option')).find(r => label(r) === rowName);
        row.click();
        await h.sleep(150);
      };
      await pick('Statut');
      await pick('CsContacts.Role');
      const askedFirst = visible(linkModal);
      document.getElementById('link-config-cancel').click();
      await h.sleep(80);
      const trigger = triggerIn(modal);
      const afterCancel = { select: selectOf(trigger).value, shown: trigger.textContent, rule: GristAPI.getLinkRule('CsContacts') };
      await pick('CsContacts.Role');
      const askedAgain = visible(linkModal);
      document.getElementById('link-config-confirm').click();
      await h.sleep(150);
      const kept = triggerIn(modal);
      const afterConfirm = { select: selectOf(kept).value, shown: kept.textContent, rule: GristAPI.getLinkRule('CsContacts') };
      dismiss(modal);
      const pass = askedFirst && afterCancel.select === 'Statut' && afterCancel.shown === 'Statut' && !afterCancel.rule
        && askedAgain && afterConfirm.select === 'CsContacts.Role' && afterConfirm.shown === 'CsContacts.Role' && !!afterConfirm.rule;
      return { pass, notes: JSON.stringify({ askedFirst, afterCancel, askedAgain, afterConfirm }) };
    },
  });

  cases.push({
    id: 'colsearch_focus_goes_to_the_visible_field',
    description: 'Ce qui donnait le focus au <select> (ouverture de la fenêtre, « + Ajouter une condition ») le donne au champ visible : le <select> masqué ne peut pas le prendre',
    run: async (h) => {
      await seed(h);
      const modal = await openConditionWindow(h);
      const first = triggerIn(modal);
      const openFocus = document.activeElement === first;
      modal.querySelector('.var-condition-add').click();
      await h.sleep(40);
      const fields = modal.querySelectorAll('.macro-rule-column-wrap .ss-trigger');
      const addFocus = fields.length === 2 && document.activeElement === fields[1];
      dismiss(modal);
      const pass = openFocus && addFocus;
      return { pass, notes: JSON.stringify({ openFocus, addFocus, fields: fields.length }) };
    },
  });

  cases.push({
    id: 'colsearch_loop_filter_and_macro_rules_use_the_same_list',
    description: 'Le filtre d’une boucle (colonnes de la table parcourue, sans groupes) et les règles d’un macro-modèle (colonnes de la page) proposent la même liste avec recherche, avec la saisie avancée en dernier',
    run: async (h) => {
      await seed(h);
      const loop = await openLoopWindow(h);
      loop.querySelector('.var-loop-filter .var-condition-add').click();
      await h.sleep(50);
      const loopTrigger = triggerIn(loop.querySelector('.var-loop-filter'));
      loopTrigger.click();
      await h.sleep(30);
      const loopPanel = panelOf(loopTrigger);
      const loopRows = rowsOf(loopPanel);
      const loopHeads = headersOf(loopPanel);
      setInput(inputOf(loopPanel), 'pres');
      await h.sleep(10);
      const loopFiltered = rowsOf(loopPanel);
      press(inputOf(loopPanel), 'Enter');
      await h.sleep(40);
      const loopChosen = { value: selectOf(loopTrigger).value, valueField: !!loop.querySelector('.var-loop-filter select.macro-rule-value') };
      dismiss(loop);

      MacroEditor.openModal(null);
      document.getElementById('macro-editor-add-slot').click();
      await h.sleep(50);
      const macroTrigger = triggerIn(document.querySelector('#macro-editor-modal .macro-rule-row'));
      macroTrigger.click();
      await h.sleep(30);
      const macroPanel = panelOf(macroTrigger);
      const macroRows = rowsOf(macroPanel);
      const macroHeads = headersOf(macroPanel);
      setInput(inputOf(macroPanel), 'stat');
      await h.sleep(10);
      press(inputOf(macroPanel), 'Enter');
      await h.sleep(40);
      const macroChosen = selectOf(macroTrigger).value;
      document.getElementById('macro-editor-cancel').click();
      await h.sleep(30);
      const advanced = I18n.t('macro.modal.columnAdvanced');
      const pass = loopHeads.length === 0 && loopRows[0] === I18n.t('macro.modal.columnChoosePlaceholder') && loopRows[loopRows.length - 1] === advanced
        && ['Facture' + hintOf('macro.modal.typeRef'), 'Designation', 'Qte' + hintOf('macro.modal.typeNumeric'), 'Presence' + hintOf('macro.modal.typeChoice')].every(r => loopRows.includes(r))
        && !loopRows.some(r => r.indexOf('CsFactures') !== -1)
        && JSON.stringify(loopFiltered) === JSON.stringify(['Presence' + hintOf('macro.modal.typeChoice'), advanced])
        && loopChosen.value === 'Presence' && loopChosen.valueField
        && macroHeads.length === 0 && macroRows[0] === I18n.t('macro.modal.columnChoosePlaceholder') && macroRows[macroRows.length - 1] === advanced
        && macroRows.includes('Titre') && macroRows.includes('Responsable' + hintOf('macro.modal.typeRef')) && !macroRows.some(r => r.indexOf('CsAnnuaire') !== -1)
        && macroChosen === 'Statut';
      return { pass, notes: JSON.stringify({ loopRows, loopHeads, loopFiltered, loopChosen, macroRows, macroHeads, macroChosen }) };
    },
  });

  cases.push({
    id: 'colsearch_native_lists_stay_when_the_component_fails',
    description: 'Si le composant de recherche est indisponible, la règle garde le <select> natif (visible, mêmes options) et marche comme avant',
    run: async (h) => {
      await seed(h);
      const realAttach = SearchSelect.attachColumns;
      const warn = console.warn;
      console.warn = () => {};
      let result;
      try {
        SearchSelect.attachColumns = () => { throw new Error('composant indisponible'); };
        const modal = await openConditionWindow(h);
        const ed = EditorCore.getEditor();
        const select = modal.querySelector('select.macro-rule-column');
        const nativeVisible = visible(select) && !modal.querySelector('.ss-trigger') && select.getBoundingClientRect().width > 80;
        const labels = Array.from(select.options).map(o => o.textContent);
        select.value = 'Montant';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        await h.sleep(20);
        modal.querySelector('.macro-rule-value').value = '5';
        modal.querySelector('.macro-rule-value').dispatchEvent(new Event('input', { bubbles: true }));
        saveButton(modal).click();
        await h.sleep(80);
        result = { nativeVisible, labels, saved: badgeNodes(ed)[0].node.attrs.condition };
      } finally {
        SearchSelect.attachColumns = realAttach;
        console.warn = warn;
      }
      const pass = result.nativeVisible && result.labels.includes('Montant' + hintOf('macro.modal.typeNumeric')) && result.labels.includes('Titre')
        && !!result.saved && result.saved.rules[0].column === 'Montant' && result.saved.rules[0].value === '5';
      return { pass, notes: JSON.stringify(result) };
    },
  });

  cases.push({
    id: 'searchselect_filter_pinned_and_empty_items',
    description: 'SearchSelect.filterItems : une ligne épinglée reste toujours, le choix « rien » n’est proposé que sans recherche ; readItems lit les groupes, les lignes épinglées et le choix « rien » dans le <select>',
    run: async () => {
      const select = document.createElement('select');
      select.innerHTML = '<option value="">-- rien --</option><option disabled>départ</option><optgroup label="Page"><option value="a">Alpha</option><option value="b" data-hint="date">Bêta</option></optgroup>'
        + '<optgroup label="Autre"><option value="Autre.c">Autre.Gamma</option></optgroup><option value="__adv__" data-pinned="true">Saisie avancée</option>';
      const items = SearchSelect.readItems(select);
      const names = query => SearchSelect.filterItems(items, query).map(i => i.name).join(',');
      const shape = items.map(i => [i.name, i.group, i.pinned, i.empty].join('|'));
      const expectedShape = ['-- rien --||false|true', 'Alpha|Page|false|false', 'Bêta|Page|false|false', 'Autre.Gamma|Autre|false|false', 'Saisie avancée||true|false'];
      const pass = JSON.stringify(shape) === JSON.stringify(expectedShape) && items[2].hint === 'date'
        && names('') === '-- rien --,Alpha,Bêta,Autre.Gamma,Saisie avancée'
        && names('alpha') === 'Alpha,Saisie avancée' && names('DATE') === 'Bêta,Saisie avancée' && names('zzz') === 'Saisie avancée';
      return { pass, notes: JSON.stringify({ shape, a: names('alpha'), b: names('zzz'), c: names('') }) };
    },
  });

  cases.push({
    id: 'searchselect_detached_select_untouched_and_destroy_restores_focus_and_labels',
    description: 'attach() sur un <select> hors de la page lève sans rien modifier (ni masqué, ni écouteur, ni focus détourné) ; destroy() rend le <select> natif, son focus et ses libellés',
    run: async () => {
      const loose = document.createElement('select');
      loose.innerHTML = '<option value="a">A</option>';
      let threw = false;
      try { SearchSelect.attach(loose); } catch (e) { threw = true; }
      const untouched = loose.style.display === '' && !Object.prototype.hasOwnProperty.call(loose, 'focus');

      const box = document.createElement('div');
      box.innerHTML = '<label id="cs-lab" for="cs-sel">Colonne email</label><select id="cs-sel"><option value="">-- Aucune --</option><option value="Mail">Mail</option></select>';
      document.body.appendChild(box);
      const select = box.querySelector('select');
      const controller = SearchSelect.attach(select);
      const trigger = box.querySelector('.ss-trigger');
      const named = trigger.getAttribute('aria-labelledby').split(' ').includes('cs-lab');
      box.querySelector('label').click();
      const labelFocuses = document.activeElement === trigger;
      select.focus();
      const selectFocusRedirected = document.activeElement === trigger;
      controller.destroy();
      const restored = !box.querySelector('.ss-wrap') && select.style.display === '' && !Object.prototype.hasOwnProperty.call(select, 'focus');
      box.querySelector('label').click();
      const labelInert = document.activeElement !== trigger;
      box.remove();
      const pass = threw && untouched && named && labelFocuses && selectFocusRedirected && restored && labelInert;
      return { pass, notes: JSON.stringify({ threw, untouched, named, labelFocuses, selectFocusRedirected, restored, labelInert }) };
    },
  });

  cases.push({
    id: 'searchselect_disabled_select_disables_the_field_and_empty_choice_reads_as_placeholder',
    description: 'Un <select> grisé grise le champ visible (il ne s’ouvre pas) après sync() ; le choix « rien » s’affiche en grisé, un vrai choix non',
    run: async () => {
      const box = document.createElement('div');
      box.innerHTML = '<select id="cs-sel2"><option value="">— Aucune —</option><option value="Mail">Mail</option></select>';
      document.body.appendChild(box);
      const select = box.querySelector('select');
      const controller = SearchSelect.attach(select);
      const trigger = box.querySelector('.ss-trigger');
      const emptyIsPlaceholder = trigger.classList.contains('is-placeholder') && trigger.textContent === '— Aucune —';
      select.value = 'Mail';
      controller.sync();
      const choiceIsNot = !trigger.classList.contains('is-placeholder') && trigger.textContent === 'Mail';
      select.disabled = true;
      controller.sync();
      trigger.click();
      const disabled = trigger.disabled && !controller.isOpen();
      select.disabled = false;
      controller.sync();
      trigger.click();
      const reopens = controller.isOpen();
      controller.destroy();
      box.remove();
      const pass = emptyIsPlaceholder && choiceIsNot && disabled && reopens;
      return { pass, notes: JSON.stringify({ emptyIsPlaceholder, choiceIsNot, disabled, reopens }) };
    },
  });

  cases.push({
    id: 'searchselect_field_removed_while_open_closes_the_panel_on_next_resize',
    description: 'Un champ retiré de la page pendant que son panneau est ouvert (règles redessinées) referme le panneau au prochain redimensionnement, sans laisser d’écouteur sur la fenêtre',
    run: async () => {
      const box = document.createElement('div');
      box.innerHTML = '<select id="cs-sel3"><option value="a">Alpha</option><option value="b">Bêta</option></select>';
      document.body.appendChild(box);
      const controller = SearchSelect.attach(box.querySelector('select'));
      controller.open();
      const wasOpen = controller.isOpen();
      // Le champ seul est retiré, la zone de recherche garde son focus : aucun `blur` ne referme le panneau (Chrome en envoie un quand tout le bloc disparaît,
      // Firefox non) - c'est la garde de place() qui doit le faire.
      controller.trigger.remove();
      window.dispatchEvent(new Event('resize'));
      const closed = !controller.isOpen();
      box.remove();
      return { pass: wasOpen && closed, notes: JSON.stringify({ wasOpen, closed }) };
    },
  });

  cases.push({
    id: 'colsearch_long_grouped_list_scrolls_keeps_group_header_with_first_row',
    description: 'Liste longue avec plusieurs tables : la liste défile dans son panneau, PageBas / ↑ gardent la ligne active à l’écran, et remonter sur la première ligne d’un groupe montre aussi son intitulé',
    run: async (h) => {
      await seed(h);
      const stub = window.__gristStub;
      const many = {};
      for (let i = 1; i <= 40; i++) many['Champ' + (i < 10 ? '0' + i : i)] = 'Text';
      stub.setVariables('CsLarge', many);
      await GristAPI.refreshSchema();
      const modal = await openConditionWindow(h);
      const trigger = triggerIn(modal);
      trigger.click();
      await h.sleep(30);
      const panel = panelOf(trigger);
      const input = inputOf(panel);
      const list = panel.querySelector('.ss-list');
      const scrollable = list.scrollHeight > list.clientHeight;
      const visibleRow = () => {
        const row = panel.querySelector('.ss-option.is-active');
        if (!row) return false;
        const r = row.getBoundingClientRect(), l = list.getBoundingClientRect();
        return r.top >= l.top - 1 && r.bottom <= l.bottom + 1;
      };
      let allVisible = true;
      for (let i = 0; i < 30; i++) { press(input, i % 6 === 5 ? 'PageDown' : 'ArrowDown'); await h.sleep(5); allVisible = allVisible && visibleRow(); }
      const activeText = panel.querySelector('.ss-option.is-active').textContent;
      // Remonter jusqu'à la première ligne du groupe de CsLarge : son intitulé doit se voir avec elle.
      setInput(input, 'cslarge.champ01');
      await h.sleep(10);
      list.scrollTop = list.scrollHeight;
      const firstRow = panel.querySelector('.ss-option');
      const header = panel.querySelector('.ss-group');
      const headerSeen = !!header && header.getBoundingClientRect().top >= list.getBoundingClientRect().top - 1;
      dismiss(modal);
      const pass = scrollable && allVisible && !!activeText && !!firstRow && headerSeen;
      return { pass, notes: JSON.stringify({ scrollable, allVisible, activeText, headerSeen }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.columnSearch = cases;
})();
