// Suite "columnSearch" - liste avec recherche dans CHAQUE choix de colonne de l'interface (demande d'Antoine du 2026-09-29, capture de la fenêtre « Condition
// d'affichage » : « harmoniser l'ui dès que l'on propose un choix de colonne ... et proposer un champ de recherche dynamique », comme pour le choix de la clé
// entre deux tables, groupe linkConfig). Composant : js/search-select.js, ici pour ses évolutions (intitulés de groupes de tables, ligne de saisie avancée
// épinglée, choix « rien », état grisé, focus) et pour les fenêtres qui l'emploient : règles Colonne / Opérateur / Valeur (js/condition-fields.js : condition
// d'affichage d'une bulle, filtre d'une boucle, macro-modèles), colonne de tri d'une boucle, colonnes de Réglages > Accès, menu « Image depuis une variable »
// de la barre (js/main-toolbar.js, le composant en mode menu : `popup`), table des droits de Réglages > Accès et listes de modèles du macro-modèle
// (js/macro-editor.js : SearchSelect.attachTables / attachTemplates). Les gestes à la vraie souris et au vrai clavier à 700x400 sont dans le script Node
// verify-column-search-mouse.mjs (groupe columnSearchMouse).
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
    id: 'colsearch_condition_column_is_a_searchable_flat_list_with_types',
    description: 'Fenêtre de condition : le choix de colonne est un champ visible (le <select> est masqué), sa liste garde le choix « rien » en tête, puis les colonnes de la page en nom nu et celles des autres tables en « Table.Colonne », à la suite et SANS intitulé de groupe (ni <optgroup>, ni titre de table : l’état du lien n’y est plus), le type derrière chaque colonne, et la saisie avancée en dernier (choix « À plat » d’Antoine, 01/10)',
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
      const optgroups = select.querySelectorAll('optgroup').length;
      const opened = !panel.hidden && trigger.getAttribute('aria-expanded') === 'true';
      dismiss(modal);
      const placeholder = I18n.t('macro.modal.columnChoosePlaceholder');
      const columns = rows.slice(1, -1);
      const firstOther = columns.findIndex(r => r.indexOf('.') !== -1);
      const pageColumns = firstOther === -1 ? columns : columns.slice(0, firstOther);
      const otherColumns = firstOther === -1 ? [] : columns.slice(firstOther);
      const pass = fieldWidth > 80 && selectWidth === 0 && closedText === placeholder && opened
        && rows[0] === placeholder && rows[rows.length - 1] === I18n.t('macro.modal.columnAdvanced')
        && heads.length === 0 && optgroups === 0
        && pageColumns.length > 0 && pageColumns.every(r => r.indexOf('.') === -1) && otherColumns.length > 0 && otherColumns.every(r => r.indexOf('Cs') === 0 && r.indexOf('.') !== -1)
        && rows.includes('Titre') && rows.includes('Responsable' + hintOf('macro.modal.typeRef')) && rows.includes('Montant' + hintOf('macro.modal.typeNumeric'))
        && rows.includes('Echeance' + hintOf('macro.modal.typeDate')) && rows.includes('Actif' + hintOf('macro.modal.typeBool'))
        && rows.includes('CsAnnuaire.Naissance' + hintOf('macro.modal.typeDate')) && rows.includes('CsContacts.Role');
      return { pass, notes: JSON.stringify({ fieldWidth, selectWidth, closedText, opened, heads, optgroups, rows }) };
    },
  });

  cases.push({
    id: 'colsearch_condition_search_filters_rows_and_keeps_advanced_entry',
    description: 'Recherche au fil de la frappe dans la fenêtre de condition (liste à plat) : la table se cherche avec la colonne (« ann » retrouve les colonnes de CsAnnuaire), le type se cherche aussi, « rien » ne se propose pas pendant une recherche, aucun intitulé de groupe n’apparaît à aucun moment, la saisie avancée reste toujours en bas, et Entrée sans résultat ne la choisit pas',
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
      const noHeads = Object.values(steps).every(step => step.heads.length === 0);
      const pass = noHeads
        && steps.annuaire.rows.length >= 3 && steps.annuaire.rows.slice(0, -1).every(r => r.indexOf('CsAnnuaire.') === 0) && steps.annuaire.rows[steps.annuaire.rows.length - 1] === advanced
        && !steps.annuaire.rows.includes(I18n.t('macro.modal.columnChoosePlaceholder'))
        && JSON.stringify(steps.date.rows) === JSON.stringify(['Echeance' + hintOf('macro.modal.typeDate'), 'CsAnnuaire.Naissance' + hintOf('macro.modal.typeDate'), advanced])
        && JSON.stringify(steps.words.rows) === JSON.stringify(['CsContacts.Role', advanced])
        && JSON.stringify(steps.none.rows) === JSON.stringify([advanced])
        && emptyShown && emptyAbovePinned && noActive && stillOpen && emptyGone
        && steps.cleared.rows[0] === I18n.t('macro.modal.columnChoosePlaceholder') && steps.cleared.rows.length > 20;
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
      const valueField = () => modal.querySelector('.macro-rule-value-wrap .ss-trigger');
      const afterClick = {
        value: select.value, shown: trigger.textContent, typeHint: typeHint(),
        valueField: valueField().textContent, ruleRow: modal.querySelectorAll('.macro-rule-row').length,
      };
      // Colonne Oui / Non : le champ Valeur est la liste « Oui » / « Non » (js/condition-fields.js:buildBoolList), le mot se prend dans la liste.
      valueField().click();
      await h.sleep(30);
      Array.from(panelOf(valueField()).querySelectorAll('.ss-option')).find(r => label(r) === I18n.t('macro.modal.valueBoolYes')).click();
      await h.sleep(30);
      saveButton(modal).click();
      await h.sleep(80);
      const saved = badgeNodes(ed)[0].node.attrs.condition;
      const pass = seeded === 'r' && afterEnter.value === 'Responsable' && afterEnter.shown === 'Responsable' && afterEnter.typeHint === I18n.t('macro.modal.typeRef')
        && afterEnter.closed && afterEnter.focusBack
        && afterClick.value === 'Actif' && afterClick.shown === 'Actif' && afterClick.typeHint === I18n.t('macro.modal.typeBool')
        && afterClick.valueField === I18n.t('macro.modal.valueChoosePlaceholder')
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
    description: 'Le filtre d’une boucle (colonnes de la table parcourue) et les règles d’un macro-modèle (colonnes de toutes les tables) proposent la même liste avec recherche, sans groupes, avec la saisie avancée en dernier',
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
        && macroRows.includes('Titre') && macroRows.includes('Responsable' + hintOf('macro.modal.typeRef')) && macroRows.includes('CsAnnuaire.NomPrenom')
        && macroChosen === 'Statut';
      return { pass, notes: JSON.stringify({ loopRows, loopHeads, loopFiltered, loopChosen, macroRows, macroHeads, macroChosen }) };
    },
  });

  // « Trier par » de la fenêtre Boucle : une ligne [colonne | sens], la colonne étant le champ avec recherche.
  const sortRowOf = loop => loop.querySelector('.var-loop-sort-row');
  const previewLines = modal => Array.from(modal.querySelectorAll('.var-condition-debug-line')).map(line => (line.hidden ? '' : line.textContent));
  // Ce que dit le champ fermé : « nom (indice) » comme dans la liste (le texte brut du bouton colle le nom et son indice).
  const shownIn = trigger => label(trigger).trim();
  // Une bulle à boucle « dans la phrase » (attribut data-loop, comme le pose la fenêtre à l'enregistrement).
  function loopBadgeHtml(table, column, loop) {
    return badgeHtml(table, column, ` data-loop="${JSON.stringify(loop).replace(/"/g, '&quot;')}" data-loop-repeat="${loop.repeat}"`);
  }
  const savedLoop = (ed, key) => badgeNodes(ed).find(b => b.node.attrs.key === key).node.attrs.loop;

  cases.push({
    id: 'colsearch_loop_sort_column_is_a_searchable_list_that_saves_and_reopens_on_its_choice',
    description: 'Colonne de tri d’une boucle (« Trier par ») : le même champ avec recherche que le filtre ; « Ordre » (celui de la table) est un vrai choix (proposé, cherché, pas grisé), le type suit chaque colonne dans la liste, pas dans le champ fermé ; un choix relance l’aperçu et le sens du tri, s’enregistre, et la fenêtre rouverte sur une autre bulle repart de « Ordre »',
    run: async (h) => {
      await seed(h);
      const tableOrder = I18n.t('varLoop.sort.tableOrder');
      Editor.setHTML(`<p>Lignes : ${badgeHtml('CsLignes', 'Designation')}.</p><p>Quantités : ${badgeHtml('CsLignes', 'Qte')}.</p>`);
      const ed = await selectBadge(h, 'CsLignes.Designation');
      pressToolbarButton('var-loop');
      await h.sleep(700);
      const loop = loopModal();
      const trigger = triggerIn(sortRowOf(loop));
      const select = selectOf(trigger);
      const direction = sortRowOf(loop).lastElementChild;
      const t = trigger.getBoundingClientRect();
      const d = direction.getBoundingClientRect();
      const closed = {
        text: shownIn(trigger), placeholder: trigger.classList.contains('is-placeholder'), selectId: select.id, selectWidth: select.getBoundingClientRect().width,
        sameLine: Math.abs(t.top - d.top) < 1 && Math.abs(t.height - d.height) < 1 && t.right <= d.left + 0.5 && t.width > 60, directionIsSelect: direction.tagName === 'SELECT',
      };
      const orderBefore = previewLines(loop)[0];
      loop.querySelector('label[for="var-loop-sort"]').click();
      const labelFocuses = document.activeElement === trigger;
      trigger.click();
      await h.sleep(30);
      const panel = panelOf(trigger);
      const input = inputOf(panel);
      const rows = rowsOf(panel);
      const first = panel.querySelector('.ss-option');
      const shape = { heads: headersOf(panel), firstSelected: first.getAttribute('aria-selected') === 'true', firstFaint: first.classList.contains('is-empty'), pinned: !!panel.querySelector('.is-pinned') };
      const typed = async (text) => { setInput(input, text); await h.sleep(10); return rowsOf(panel); };
      const steps = { mont: await typed('mont'), ordre: await typed('ordre'), nombre: await typed('nombre'), none: await typed('zzz') };
      const emptyShown = !panel.querySelector('.ss-empty').hidden;
      const choose = async (text) => {
        trigger.click();
        await h.sleep(30);
        const box = inputOf(panelOf(trigger));
        setInput(box, text);
        await h.sleep(10);
        press(box, 'Enter');
        await h.sleep(40);
        return { value: select.value, shown: shownIn(trigger), directions: Array.from(direction.options).map(o => o.textContent), closed: panelOf(trigger).hidden };
      };
      setInput(input, 'mont');
      await h.sleep(10);
      press(input, 'Enter');
      await h.sleep(700);
      const numeric = { value: select.value, shown: shownIn(trigger), directions: Array.from(direction.options).map(o => o.textContent), closed: panel.hidden };
      const orderAfter = previewLines(loop)[0];
      const textual = await choose('designation');
      const back = await choose('mont');
      saveButton(loop).click();
      await h.sleep(100);
      const saved = savedLoop(ed, 'CsLignes.Designation');
      await selectBadge(h, 'CsLignes.Designation');
      pressToolbarButton('var-loop');
      await h.sleep(100);
      const reopenedTrigger = triggerIn(sortRowOf(loopModal()));
      const reopened = { shown: shownIn(reopenedTrigger), value: selectOf(reopenedTrigger).value };
      dismiss(loopModal());
      await selectBadge(h, 'CsLignes.Qte');
      pressToolbarButton('var-loop');
      await h.sleep(100);
      const otherTrigger = triggerIn(sortRowOf(loopModal()));
      const other = { shown: shownIn(otherTrigger), value: selectOf(otherTrigger).value };
      dismiss(loopModal());
      const asc = I18n.t('varLoop.sort.asc'), desc = I18n.t('varLoop.sort.desc'), az = I18n.t('varLoop.sort.az'), za = I18n.t('varLoop.sort.za');
      const pass = closed.text === tableOrder && !closed.placeholder && closed.selectId === 'var-loop-sort' && closed.selectWidth === 0 && closed.sameLine && closed.directionIsSelect && labelFocuses
        && JSON.stringify(rows) === JSON.stringify([tableOrder, 'Facture' + hintOf('macro.modal.typeRef'), 'Designation', 'Qte' + hintOf('macro.modal.typeNumeric'), 'Montant' + hintOf('macro.modal.typeNumeric'), 'Presence' + hintOf('macro.modal.typeChoice')])
        && shape.heads.length === 0 && shape.firstSelected && !shape.firstFaint && !shape.pinned
        && JSON.stringify(steps.mont) === JSON.stringify(['Montant' + hintOf('macro.modal.typeNumeric')]) && JSON.stringify(steps.ordre) === JSON.stringify([tableOrder])
        && JSON.stringify(steps.nombre) === JSON.stringify(['Qte' + hintOf('macro.modal.typeNumeric'), 'Montant' + hintOf('macro.modal.typeNumeric')])
        && steps.none.length === 0 && emptyShown
        && numeric.value === 'Montant' && numeric.shown === 'Montant' && numeric.closed && JSON.stringify(numeric.directions) === JSON.stringify([asc, desc])
        && /Audit.*Suivi/.test(orderBefore) && /Suivi.*Audit/.test(orderAfter)
        && textual.value === 'Designation' && JSON.stringify(textual.directions) === JSON.stringify([az, za]) && textual.closed
        && back.value === 'Montant' && JSON.stringify(back.directions) === JSON.stringify([asc, desc])
        && !!saved && JSON.stringify(saved.sort) === JSON.stringify({ column: 'Montant', direction: 'asc' })
        && reopened.value === 'Montant' && reopened.shown === 'Montant'
        && other.value === '' && other.shown === tableOrder;
      return { pass, notes: JSON.stringify({ closed, labelFocuses, rows, shape, steps, emptyShown, numeric, orderBefore, orderAfter, textual, back, saved, reopened, other }) };
    },
  });

  cases.push({
    id: 'colsearch_loop_sort_keeps_a_column_removed_from_the_table',
    description: 'Une boucle triée sur une colonne qui n’existe plus dans la table : la fenêtre la garde dans la liste avec recherche (champ et liste), et Enregistrer sans y toucher ne la remplace pas par l’ordre de la table',
    run: async (h) => {
      await seed(h);
      const gone = { repeat: 'inline', table: 'CsLignes', sort: { column: 'Ancienne', direction: 'desc' }, empty: 'hide', separator: ', ', lastSeparator: ' et ' };
      Editor.setHTML(`<p>Lignes : ${loopBadgeHtml('CsLignes', 'Designation', gone)}.</p>`);
      const ed = await selectBadge(h, 'CsLignes.Designation');
      pressToolbarButton('var-loop');
      await h.sleep(100);
      const loop = loopModal();
      const trigger = triggerIn(sortRowOf(loop));
      const shown = { text: shownIn(trigger), value: selectOf(trigger).value, direction: sortRowOf(loop).lastElementChild.value };
      trigger.click();
      await h.sleep(30);
      const rows = rowsOf(panelOf(trigger));
      const active = panelOf(trigger).querySelector('.ss-option.is-active');
      const activeName = active ? label(active) : '';
      press(inputOf(panelOf(trigger)), 'Escape');
      await h.sleep(20);
      saveButton(loop).click();
      await h.sleep(100);
      const saved = savedLoop(ed, 'CsLignes.Designation');
      const pass = shown.text === 'Ancienne' && shown.value === 'Ancienne' && shown.direction === 'desc' && rows[rows.length - 1] === 'Ancienne' && rows[0] === I18n.t('varLoop.sort.tableOrder')
        && activeName === 'Ancienne' && !!saved && JSON.stringify(saved.sort) === JSON.stringify({ column: 'Ancienne', direction: 'desc' });
      return { pass, notes: JSON.stringify({ shown, rows, activeName, saved }) };
    },
  });

  cases.push({
    id: 'colsearch_loop_sort_native_list_stays_when_the_component_fails',
    description: 'Si le composant est indisponible à l’ouverture de la fenêtre Boucle, « Trier par » garde la liste native (visible, mêmes colonnes) et enregistre son choix ; à l’ouverture suivante, la liste avec recherche revient',
    run: async (h) => {
      await seed(h);
      const realAttach = SearchSelect.attachColumns;
      const warn = console.warn;
      let result;
      try {
        // La fenêtre est construite une fois pour toutes : celle des cas précédents a déjà son champ, qu'on retire pour rejouer l'ouverture sans composant.
        const first = await openLoopWindow(h);
        SearchSelect.attach(first.querySelector('#var-loop-sort')).destroy();
        dismiss(first);
        console.warn = () => {};
        SearchSelect.attachColumns = () => { throw new Error('composant indisponible'); };
        const modal = await openLoopWindow(h);
        const ed = EditorCore.getEditor();
        const select = modal.querySelector('#var-loop-sort');
        const nativeVisible = visible(select) && !sortRowOf(modal).querySelector('.ss-trigger') && select.getBoundingClientRect().width > 40;
        const labels = Array.from(select.options).map(o => o.textContent);
        select.value = 'Qte';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        await h.sleep(20);
        saveButton(modal).click();
        await h.sleep(100);
        const saved = savedLoop(ed, 'CsLignes.Designation');
        SearchSelect.attachColumns = realAttach;
        console.warn = warn;
        const again = await openLoopWindow(h);
        const trigger = sortRowOf(again).querySelector('.ss-trigger');
        const searchBack = !!trigger && selectOf(trigger).id === 'var-loop-sort' && !visible(selectOf(trigger));
        dismiss(again);
        result = { nativeVisible, labels, saved: saved && saved.sort, searchBack };
      } finally {
        SearchSelect.attachColumns = realAttach;
        console.warn = warn;
      }
      const pass = result.nativeVisible && result.labels.includes('Qte' + hintOf('macro.modal.typeNumeric')) && result.labels.includes(I18n.t('varLoop.sort.tableOrder'))
        && !!result.saved && result.saved.column === 'Qte' && result.searchBack;
      return { pass, notes: JSON.stringify(result) };
    },
  });

  // Réglages > Accès : la table des droits, puis quatre choix de colonne (email, lecture seule, export, commentaires) - cinq listes avec recherche.
  const ACCESS = { table: 'settings-access-table', email: 'settings-access-email', readOnly: 'settings-access-readonly', exportCol: 'settings-access-export', comments: 'settings-access-comments' };
  const accessSelect = id => document.getElementById(id);
  const accessField = id => accessSelect(id).nextElementSibling.querySelector('.ss-trigger');
  async function openAccessTab(h) {
    document.getElementById('v2-btn-settings').click();
    await h.sleep(300);
    document.querySelector('#settings-tabs [data-settings-tab="access"]').click();
    await h.sleep(60);
  }
  async function closeSettings(h) {
    document.getElementById('settings-close').click();
    await h.sleep(60);
  }
  async function pickInAccessList(h, id, text) {
    const trigger = accessField(id);
    trigger.click();
    await h.sleep(30);
    const input = inputOf(panelOf(trigger));
    setInput(input, text);
    await h.sleep(10);
    press(input, 'Enter');
    await h.sleep(350);
  }

  cases.push({
    id: 'colsearch_access_settings_column_choices_are_searchable_lists',
    description: 'Réglages > Accès : la table, l’email, la lecture seule, l’export et les commentaires sont des listes avec recherche (« — Aucune — » en tête, les tables cherchées par leur nom, seulement les colonnes du bon type, celle qui a disparu gardée) ; un choix écrit l’option du widget, le champ le montre et le montre encore quand on rouvre les Réglages',
    run: async (h) => {
      await h.resetEditor();
      const stub = window.__gristStub;
      stub.setVariables('CsAnnuaire', { NomPrenom: 'Text' });
      stub.setVariables('CsDroits', { Email: 'Text', Nom: 'Text', Service: 'Ref:CsAnnuaire', LectureSeule: 'Bool', Export: 'Bool', Commentaires: 'Bool' });
      stub.setRows('CsDroits', [{ id: 1, Email: 'a@exemple.fr', Nom: 'A', Service: 7, LectureSeule: false, Export: true, Commentaires: true }]);
      await GristAPI.refreshSchema();
      stub.setWidgetOptions(null);
      await h.sleep(100);
      await openAccessTab(h);
      const none = I18n.t('settings.access.none');
      const tableSelect = accessSelect(ACCESS.table);
      const tableTrigger = accessField(ACCESS.table);
      const tableField = { hidden: tableSelect.getBoundingClientRect().width === 0, width: tableTrigger.getBoundingClientRect().width, text: shownIn(tableTrigger), placeholder: tableTrigger.classList.contains('is-placeholder') };
      const fields = [ACCESS.email, ACCESS.readOnly, ACCESS.exportCol, ACCESS.comments].map(id => {
        const trigger = accessField(id);
        const rect = trigger.getBoundingClientRect();
        return { id, hidden: accessSelect(id).getBoundingClientRect().width === 0, width: rect.width, height: rect.height, text: shownIn(trigger) };
      });
      const tableRect = tableTrigger.getBoundingClientRect();
      const sameHeight = fields.every(f => Math.abs(f.height - tableRect.height) < 1);
      const labelFocuses = (() => { document.querySelector('label[for="' + ACCESS.email + '"]').click(); return document.activeElement === accessField(ACCESS.email); })();
      const openRows = async id => { const trigger = accessField(id); trigger.click(); await h.sleep(30); const rows = rowsOf(panelOf(trigger)); const placeholder = inputOf(panelOf(trigger)).placeholder; trigger.click(); await h.sleep(20); return { rows, placeholder }; };
      const beforeTable = await openRows(ACCESS.email);
      // La table : liste des tables (« — Aucune — » en tête), cherchée par son nom, choisie par Entrée.
      const tableList = await openRows(ACCESS.table);
      await pickInAccessList(h, ACCESS.table, 'droits');
      const tableChosen = { value: tableSelect.value, shown: shownIn(tableTrigger), placeholder: tableTrigger.classList.contains('is-placeholder') };
      const afterTable = { email: shownIn(accessField(ACCESS.email)), value: accessSelect(ACCESS.email).value };
      const emailList = await openRows(ACCESS.email);
      const boolList = await openRows(ACCESS.readOnly);
      // Recherche puis Entrée dans la liste des colonnes de droit : « exp » ne garde qu'Export ; le choix s'écrit dans l'option du widget.
      const trigger = accessField(ACCESS.readOnly);
      trigger.click();
      await h.sleep(30);
      const input = inputOf(panelOf(trigger));
      setInput(input, 'exp');
      await h.sleep(10);
      const searched = rowsOf(panelOf(trigger));
      press(input, 'Enter');
      await h.sleep(350);
      const option = stub.state.options && stub.state.options.droitsAcces;
      const chosen = { value: accessSelect(ACCESS.readOnly).value, shown: shownIn(accessField(ACCESS.readOnly)), closed: panelOf(accessField(ACCESS.readOnly)).hidden };
      await pickInAccessList(h, ACCESS.comments, 'commentaires');
      await closeSettings(h);
      // Réouverture : les champs montrent le réglage enregistré, y compris une colonne qui n'existe plus dans la table.
      stub.setWidgetOptions({ droitsAcces: { table: 'CsDroits', emailColumn: 'Ancienne', readOnlyColumn: 'LectureSeule', exportColumn: '', commentsColumn: '' } });
      await h.sleep(400);
      await openAccessTab(h);
      const reopened = { email: shownIn(accessField(ACCESS.email)), readOnly: shownIn(accessField(ACCESS.readOnly)), exportCol: shownIn(accessField(ACCESS.exportCol)), emailPlaceholder: accessField(ACCESS.email).classList.contains('is-placeholder'), exportPlaceholder: accessField(ACCESS.exportCol).classList.contains('is-placeholder') };
      const keptList = await openRows(ACCESS.email);
      await closeSettings(h);
      stub.setWidgetOptions(null);
      await h.sleep(200);
      const pass = tableField.hidden && tableField.width > 100 && tableField.text === none && tableField.placeholder
        && tableList.rows[0] === none && tableList.rows.includes('CsDroits') && tableList.rows.includes('CsAnnuaire') && tableList.placeholder === I18n.t('searchSelect.searchTables')
        && tableChosen.value === 'CsDroits' && tableChosen.shown === 'CsDroits' && !tableChosen.placeholder
        && fields.length === 4 && fields.every(f => f.hidden && f.width > 100) && sameHeight && labelFocuses
        && fields.every(f => f.text === none) && JSON.stringify(beforeTable.rows) === JSON.stringify([none])
        && afterTable.value === 'Email' && afterTable.email === 'Email'
        && JSON.stringify(emailList.rows) === JSON.stringify([none, 'Email', 'Nom'])
        && JSON.stringify(boolList.rows) === JSON.stringify([none, 'LectureSeule', 'Export', 'Commentaires']) && boolList.placeholder === I18n.t('linkConfig.searchColumns')
        && JSON.stringify(searched) === JSON.stringify(['Export'])
        && chosen.value === 'Export' && chosen.shown === 'Export' && chosen.closed
        && !!option && option.table === 'CsDroits' && option.emailColumn === 'Email' && option.readOnlyColumn === 'Export' && option.exportColumn === '' && option.commentsColumn === ''
        && reopened.email === 'Ancienne' && reopened.readOnly === 'LectureSeule' && reopened.exportCol === none && !reopened.emailPlaceholder && reopened.exportPlaceholder
        && JSON.stringify(keptList.rows) === JSON.stringify([none, 'Email', 'Nom', 'Ancienne']);
      return { pass, notes: JSON.stringify({ tableField, tableList: { first: tableList.rows[0], count: tableList.rows.length, placeholder: tableList.placeholder }, tableChosen, fields, sameHeight, labelFocuses, beforeTable, afterTable, emailList, boolList, searched, chosen, option, reopened, keptList }) };
    },
  });

  cases.push({
    id: 'searchselect_texts_follow_the_language_at_each_opening',
    description: 'Une liste posée une fois (Réglages, « Trier par ») relit à chaque ouverture ses textes (zone de recherche, « Aucune colonne ne correspond. ») : changer la langue de l’interface les change sans recharger la page',
    run: async () => {
      const box = document.createElement('div');
      box.innerHTML = '<select id="cs-sel4"><option value="">— Aucune —</option><option value="a">Alpha</option></select>';
      document.body.appendChild(box);
      const controller = SearchSelect.attachColumns(box.querySelector('select'));
      const panel = box.querySelector('.ss-panel');
      const read = () => ({ placeholder: panel.querySelector('.ss-input').placeholder, aria: panel.querySelector('.ss-input').getAttribute('aria-label'), empty: panel.querySelector('.ss-empty').textContent });
      const reading = (lang) => {
        I18n.setLang(lang);
        controller.open();
        const out = read();
        controller.close(false);
        return out;
      };
      let fr, en, back;
      try {
        fr = reading('fr');
        en = reading('en');
        back = reading('fr');
      } finally {
        I18n.setLang('fr');
        controller.destroy();
        box.remove();
      }
      const pass = fr.placeholder === 'Rechercher une colonne…' && fr.aria === fr.placeholder && fr.empty === 'Aucune colonne ne correspond.'
        && en.placeholder === 'Search for a column…' && en.aria === en.placeholder && en.empty === 'No column matches.'
        && JSON.stringify(back) === JSON.stringify(fr);
      return { pass, notes: JSON.stringify({ fr, en, back }) };
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
    id: 'colsearch_long_flat_list_scrolls_and_keeps_the_active_row_visible',
    description: 'Liste longue (40 colonnes d’une autre table, en plus des autres tables) dans la fenêtre de condition : la liste défile dans son panneau, PageBas / ↓ gardent la ligne active à l’écran, aucun intitulé de groupe, et la colonne d’une autre table se retrouve par son nom',
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
      const headersWhileScrolling = headersOf(panel).length;
      setInput(input, 'cslarge.champ01');
      await h.sleep(10);
      const found = rowsOf(panel);
      dismiss(modal);
      const pass = scrollable && allVisible && !!activeText && headersWhileScrolling === 0
        && found.length === 2 && found[0] === 'CsLarge.Champ01' && found[1] === I18n.t('macro.modal.columnAdvanced');
      return { pass, notes: JSON.stringify({ scrollable, allVisible, activeText, headersWhileScrolling, found }) };
    },
  });

  // Le composant garde les groupes (<optgroup>) - plus aucun choix de colonne n'en utilise depuis le choix « À plat » d'Antoine du 01/10 (fenêtre de condition,
  // macro-modèle) - : sa règle « la première ligne d'un groupe se montre avec son intitulé » reste vérifiée sur une liste fabriquée ici.
  cases.push({
    id: 'searchselect_group_header_comes_into_view_with_its_first_row',
    description: 'Composant : dans une liste à groupes (<optgroup>), atteindre au clavier la première ligne d’un groupe montre aussi son intitulé, en descendant comme en remontant',
    run: async (h) => {
      const box = document.createElement('div');
      box.style.cssText = 'position:fixed;left:16px;top:16px;width:300px;z-index:5000';
      const groups = ['Alpha', 'Bêta', 'Gamma'];
      box.innerHTML = '<select>' + groups.map(g => '<optgroup label="' + g + '">'
        + Array.from({ length: 12 }, (_, i) => '<option value="' + g + '.c' + i + '">' + g + '.c' + i + '</option>').join('') + '</optgroup>').join('') + '</select>';
      document.body.appendChild(box);
      const controller = SearchSelect.attach(box.querySelector('select'));
      const out = {};
      try {
        controller.open();
        await h.sleep(30);
        const panel = controller.trigger.parentNode.querySelector('.ss-panel');
        const input = inputOf(panel);
        const list = panel.querySelector('.ss-list');
        const activeName = () => { const row = panel.querySelector('.ss-option.is-active'); return row ? row.querySelector('.ss-name').textContent : null; };
        const headerVisible = group => {
          const node = Array.from(panel.querySelectorAll('.ss-group')).find(n => n.textContent === group);
          if (!node) return false;
          const r = node.getBoundingClientRect(), l = list.getBoundingClientRect();
          return r.top >= l.top - 1 && r.bottom <= l.bottom + 1;
        };
        const goTo = async (target, key) => {
          for (let i = 0; i < 60 && activeName() !== target; i++) { press(input, key); await h.sleep(5); }
          return activeName() === target;
        };
        out.scrollable = list.scrollHeight > list.clientHeight;
        out.headers = panel.querySelectorAll('.ss-group').length;
        out.reachedBeta = await goTo('Bêta.c0', 'ArrowDown');
        out.betaHeaderDown = headerVisible('Bêta');
        out.reachedGamma = await goTo('Gamma.c0', 'ArrowDown');
        out.gammaHeaderDown = headerVisible('Gamma');
        out.backInBeta = await goTo('Bêta.c11', 'ArrowUp');
        out.reachedBetaUp = await goTo('Bêta.c0', 'ArrowUp');
        out.betaHeaderUp = headerVisible('Bêta');
        out.reachedAlpha = await goTo('Alpha.c0', 'ArrowUp');
        out.alphaHeaderUp = headerVisible('Alpha');
      } finally {
        controller.destroy();
        box.remove();
      }
      const pass = out.scrollable && out.headers === 3 && out.reachedBeta && out.betaHeaderDown && out.reachedGamma && out.gammaHeaderDown
        && out.backInBeta && out.reachedBetaUp && out.betaHeaderUp && out.reachedAlpha && out.alphaHeaderUp;
      return { pass, notes: JSON.stringify(out) };
    },
  });

  // === Menu « Image depuis une variable » de la barre (js/main-toolbar.js:openImageVariablePicker) : la liste des colonnes Pièces jointes est la même liste à
  // recherche que tous les choix de colonne, ouverte par le code à côté de la ligne du menu (SearchSelect en mode `popup`) ; la liste simple d'avant reste pour le
  // message « aucune colonne » et si le composant échoue. Ici les évènements sont émis par le script ; les vrais gestes sont dans verify-column-search-mouse.mjs.
  async function seedImages(h) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables('CsPieces', { Titre: 'Text', Photo: 'Attachments', Plan: 'Attachments' });
    stub.setVariables('CsSites', { Nom: 'Text', Logo: 'Attachments' });
    await GristAPI.refreshSchema();
    Editor.setHTML('<p>Bonjour Marie</p><p>Fin</p>');
    await h.sleep(60);
    const ed = EditorCore.getEditor();
    document.querySelector('.tiptap').focus();
    ed.commands.setTextSelection(9); // entre « Bonjour » et « Marie »
    await h.sleep(30);
    return ed;
  }
  const imageNodes = ed => {
    const out = [];
    ed.state.doc.descendants((node, pos) => { if (node.type.name === 'editorImage') out.push({ attrs: node.attrs, pos }); });
    return out;
  };
  const imageHost = () => document.getElementById('v2-image-var-search');
  const oldImageBox = () => document.getElementById('v2-image-var-picker');
  const oldBoxShown = () => { const box = oldImageBox(); return !!box && box.style.display !== 'none'; };
  const IMAGE_ROW = 'v2-btn-image-from-variable';
  // Clic sur la ligne du menu, puis attente de son ouverture (la lecture du schéma précède l'affichage) : le panneau de la liste avec recherche, sinon null.
  async function openImagePicker(h) {
    document.getElementById(IMAGE_ROW).click();
    for (let i = 0; i < 80; i++) {
      await h.sleep(25);
      const panel = document.querySelector('#v2-image-var-search .ss-panel:not([hidden])');
      if (panel) return panel;
    }
    return null;
  }
  const KEYS = ['CsPieces.Photo', 'CsPieces.Plan', 'CsSites.Logo'];

  cases.push({
    id: 'colsearch_image_menu_lists_attachment_columns_in_a_searchable_menu_and_inserts_the_image',
    description: 'Menu « Image depuis une variable » : la ligne ouvre une liste avec recherche des seules colonnes Pièces jointes (Table.Colonne, sans intitulés de groupe), champ de recherche au focus, la frappe filtre, Entrée insère l’image liée à la variable au curseur, ferme le menu et rend le focus à l’éditeur',
    run: async (h) => {
      const ed = await seedImages(h);
      const panel = await openImagePicker(h);
      if (!panel) return { pass: false, notes: 'panneau jamais ouvert' };
      const host = imageHost();
      const input = inputOf(panel);
      const rect = panel.getBoundingClientRect();
      const opened = {
        rows: rowsOf(panel).slice().sort(), headers: headersOf(panel).length,
        selectHidden: host.querySelector('select').getBoundingClientRect().width === 0, triggerHidden: getComputedStyle(host.querySelector('.ss-trigger')).display === 'none',
        focused: document.activeElement === input, placeholder: input.placeholder === I18n.t('linkConfig.searchColumns'),
        inside: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight, oldBox: oldBoxShown(),
        nothingHighlighted: !panel.querySelector('.ss-option.is-active'),
      };
      setInput(input, 'LOGO');
      await h.sleep(20);
      const searched = { rows: rowsOf(panel), active: panel.querySelector('.ss-option.is-active') ? label(panel.querySelector('.ss-option.is-active')) : null };
      press(input, 'Enter');
      await h.sleep(120);
      const images = imageNodes(ed);
      const at = images.length ? images[0].pos : -1;
      const doc = ed.state.doc;
      const inserted = {
        count: images.length,
        attrs: images.length ? { table: images[0].attrs.varTable, column: images[0].attrs.varColumn, key: images[0].attrs.varKey } : null,
        before: at >= 0 ? doc.textBetween(0, at) : null, after: at >= 0 ? doc.textBetween(at + 1, doc.content.size, '|') : null,
        hostGone: !imageHost(), focusInEditor: !!document.activeElement.closest('.tiptap'),
      };
      const pass = JSON.stringify(opened.rows) === JSON.stringify(KEYS) && opened.headers === 0 && opened.selectHidden && opened.triggerHidden && opened.focused && opened.placeholder
        && opened.inside && !opened.oldBox && opened.nothingHighlighted
        && JSON.stringify(searched.rows) === JSON.stringify(['CsSites.Logo']) && searched.active === 'CsSites.Logo'
        && inserted.count === 1 && JSON.stringify(inserted.attrs) === JSON.stringify({ table: 'CsSites', column: 'Logo', key: 'CsSites.Logo' })
        && inserted.before === 'Bonjour ' && inserted.after === 'Marie|Fin' && inserted.hostGone && inserted.focusInEditor;
      return { pass, notes: JSON.stringify({ opened, searched, inserted }) };
    },
  });

  cases.push({
    id: 'colsearch_image_menu_escape_and_click_elsewhere_close_it_without_inserting_and_it_reopens_once',
    description: 'Menu « Image depuis une variable » : Échap le ferme (focus rendu à l’éditeur), un clic ailleurs aussi, sans rien insérer ; rouvert deux fois de suite il n’y a qu’un seul menu, et l’image est insérée par un clic sur une ligne',
    run: async (h) => {
      const ed = await seedImages(h);
      const first = await openImagePicker(h);
      if (!first) return { pass: false, notes: 'panneau jamais ouvert' };
      const escape = press(inputOf(first), 'Escape');
      await h.sleep(120);
      const byEscape = { hostGone: !imageHost(), prevented: escape.defaultPrevented, focusInEditor: !!document.activeElement.closest('.tiptap') };
      const second = await openImagePicker(h);
      // Clic ailleurs : la zone de recherche perd le focus sans que ce soit pour une ligne du panneau.
      inputOf(second).blur();
      await h.sleep(120);
      const byBlur = { hostGone: !imageHost() };
      const third = await openImagePicker(h);
      document.getElementById(IMAGE_ROW).click();
      await h.sleep(300);
      const fourth = document.querySelector('#v2-image-var-search .ss-panel:not([hidden])');
      const hostsWhileReopened = document.querySelectorAll('#v2-image-var-search').length;
      const noneInserted = imageNodes(ed).length === 0;
      // Clic sur une ligne (la souris envoie mousedown puis click ; le panneau garde le focus de la zone de recherche pendant le mousedown).
      const row = Array.from(fourth.querySelectorAll('.ss-option')).find(r => label(r) === 'CsPieces.Plan');
      row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      row.click();
      await h.sleep(120);
      const images = imageNodes(ed);
      const pass = byEscape.hostGone && byEscape.prevented && byEscape.focusInEditor && byBlur.hostGone && !!third && !!fourth && hostsWhileReopened === 1 && noneInserted
        && images.length === 1 && images[0].attrs.varKey === 'CsPieces.Plan' && !imageHost();
      return { pass, notes: JSON.stringify({ byEscape, byBlur, hostsWhileReopened, noneInserted, images: images.map(i => i.attrs.varKey), hostAfter: !!imageHost() }) };
    },
  });

  cases.push({
    id: 'colsearch_image_menu_without_attachment_column_keeps_the_simple_message',
    description: 'Menu « Image depuis une variable » sans aucune colonne Pièces jointes : le message d’avant (« Aucune colonne Pièce jointe trouvée… ») s’affiche dans l’ancienne fenêtre, sans liste avec recherche',
    run: async (h) => {
      await seedImages(h);
      const original = GristAPI.getAllVariables;
      GristAPI.getAllVariables = () => [];
      let out;
      try {
        document.getElementById(IMAGE_ROW).click();
        for (let i = 0; i < 80 && !oldBoxShown(); i++) await h.sleep(25);
        const box = oldImageBox();
        out = { shown: oldBoxShown(), text: box ? box.textContent : null, items: box ? box.querySelectorAll('.v2-image-var-picker-item').length : -1, hostAbsent: !imageHost() };
      } finally {
        GristAPI.getAllVariables = original;
        if (oldImageBox()) oldImageBox().style.display = 'none';
      }
      const pass = out.shown && out.text === I18n.t('imageVarPicker.empty') && out.items === 0 && out.hostAbsent;
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'colsearch_image_menu_falls_back_to_the_simple_list_when_the_component_fails',
    description: 'Menu « Image depuis une variable » : si le composant de recherche lève, la liste simple d’avant s’affiche (une ligne par colonne Pièces jointes), sans reste de la liste avec recherche dans la page, et un mousedown sur une ligne insère toujours l’image',
    run: async (h) => {
      const ed = await seedImages(h);
      const original = SearchSelect.attachColumns;
      SearchSelect.attachColumns = () => { throw new Error('composant indisponible (test)'); };
      let out;
      try {
        document.getElementById(IMAGE_ROW).click();
        for (let i = 0; i < 80 && !oldBoxShown(); i++) await h.sleep(25);
        const box = oldImageBox();
        const items = box ? Array.from(box.querySelectorAll('.v2-image-var-picker-item')) : [];
        const texts = items.map(item => item.textContent);
        const hostAbsent = !imageHost();
        const target = items.find(item => item.textContent === 'CsSites.Logo');
        if (target) target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        await h.sleep(120);
        const images = imageNodes(ed);
        out = { texts, hostAbsent, boxClosed: !oldBoxShown(), images: images.map(i => i.attrs.varKey) };
      } finally {
        SearchSelect.attachColumns = original;
        if (oldImageBox()) oldImageBox().style.display = 'none';
      }
      const pass = JSON.stringify(out.texts) === JSON.stringify(KEYS) && out.hostAbsent && out.boxClosed && JSON.stringify(out.images) === JSON.stringify(['CsSites.Logo']);
      return { pass, notes: JSON.stringify(out) };
    },
  });

  // === Listes de modèles du macro-modèle (js/macro-editor.js) : la page de garde, le modèle de chaque règle et « Si aucune règle ne correspond » sont la même
  // liste avec recherche (SearchSelect.attachTemplates). Les modèles viennent de Templates.getCached() (seuls ceux de type document sont proposés), remplacé le
  // temps d'un cas. L'enregistrement est saisi au passage de Templates.save, qui échoue exprès : le vrai enregistrement recharge l'application sur le nouveau
  // macro-modèle et laisserait les cas suivants sur un autre type de modèle. Les gestes à la vraie souris sont dans verify-column-search-mouse.mjs.
  const MACRO_TEMPLATES = [
    { id: 11, nom: 'Notification_base', typeModele: 'document' },
    { id: 12, nom: 'Notification_bureau', typeModele: 'document' },
    { id: 13, nom: 'Notification_projet', typeModele: 'document' },
    { id: 14, nom: 'Relance par email', typeModele: 'email' },
    { id: 15, nom: 'Macro déjà composé', typeModele: 'macro' },
  ];
  const macroModal = () => document.getElementById('macro-editor-modal');
  const coverList = () => document.getElementById('macro-editor-cover');
  const ruleModelList = () => macroModal().querySelector('select.macro-rule-modele');
  const defaultModelList = () => macroModal().querySelector('select.macro-slot-default-select');
  const hasField = select => !!select.nextElementSibling && select.nextElementSibling.classList.contains('ss-wrap');
  const fieldOf = select => select.nextElementSibling.querySelector('.ss-trigger');
  async function openMacroWindow(h) {
    MacroEditor.openModal(null);
    document.getElementById('macro-editor-add-slot').click();
    await h.sleep(60);
  }
  async function closeMacroWindow(h) {
    document.getElementById('macro-editor-cancel').click();
    await h.sleep(30);
  }
  // Ouvre la liste, lit ses lignes, puis la referme (un deuxième clic sur le champ).
  async function readList(h, trigger) {
    trigger.click();
    await h.sleep(30);
    const panel = panelOf(trigger);
    const out = { rows: rowsOf(panel), headers: headersOf(panel).length, searchPlaceholder: inputOf(panel).placeholder };
    trigger.click();
    await h.sleep(20);
    return out;
  }
  // Tape dans la zone de recherche : rend les lignes qui restent, puis la touche demandée (Entrée choisit la première, Échap ferme).
  async function searchList(h, trigger, text, key) {
    trigger.click();
    await h.sleep(30);
    const input = inputOf(panelOf(trigger));
    setInput(input, text);
    await h.sleep(10);
    const rows = rowsOf(panelOf(trigger));
    press(input, key);
    await h.sleep(40);
    return rows;
  }
  const changed = (select, value) => { select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); };

  cases.push({
    id: 'colsearch_macro_editor_template_lists_are_searchable_and_the_choice_is_saved',
    description: 'Macro-modèle : la page de garde, le modèle d’une règle et « Si aucune règle ne correspond » sont des listes avec recherche (seuls les modèles de type document ; « Ne rien inclure » reste un vrai choix, cherchable) ; la frappe filtre, Entrée choisit, le choix survit à l’ajout d’une condition et s’enregistre',
    run: async (h) => {
      await seed(h);
      const realCached = Templates.getCached;
      const realSave = Templates.save;
      const realAlert = window.alert;
      const realError = console.error;
      let out;
      try {
        Templates.getCached = () => MACRO_TEMPLATES;
        await openMacroWindow(h);
        const lists = [coverList(), ruleModelList(), defaultModelList()];
        const fields = lists.map(select => {
          const trigger = fieldOf(select);
          return { hidden: select.getBoundingClientRect().width === 0, width: trigger.getBoundingClientRect().width, text: shownIn(trigger), placeholder: trigger.classList.contains('is-placeholder') };
        });
        const opened = [];
        for (const select of lists) opened.push(await readList(h, fieldOf(select)));
        // « Ne rien inclure » est un vrai choix (cherchable, pas grisé) ; le « -- Choisir un modèle -- » des deux autres listes n'est qu'un « rien » : absent d'une recherche.
        const skipFound = await searchList(h, fieldOf(lists[2]), 'inclure', 'Escape');
        const chooseFound = await searchList(h, fieldOf(lists[0]), 'choisir', 'Escape');
        const searched = {
          cover: await searchList(h, fieldOf(lists[0]), 'base', 'Enter'),
          rule: await searchList(h, fieldOf(lists[1]), 'bu', 'Enter'),
          dflt: await searchList(h, fieldOf(lists[2]), 'projet', 'Enter'),
        };
        const values = { cover: lists[0].value, rule: lists[1].value, dflt: lists[2].value, shown: lists.map(select => shownIn(fieldOf(select))) };
        // La colonne et la valeur de la règle, pour que l'enregistrement la garde.
        await searchList(h, triggerIn(macroModal().querySelector('.macro-rule-row')), 'stat', 'Enter');
        setInput(macroModal().querySelector('.macro-rule-row .macro-rule-value'), 'Urgent');
        // Une condition de plus redessine toutes les annexes : les listes redessinées montrent les choix gardés en mémoire.
        macroModal().querySelector('.macro-rule-add').click();
        await h.sleep(60);
        const ruleLists = macroModal().querySelectorAll('select.macro-rule-modele');
        const redrawn = { rules: macroModal().querySelectorAll('.macro-rule-row').length, first: shownIn(fieldOf(ruleLists[0])), firstValue: ruleLists[0].value, second: shownIn(fieldOf(ruleLists[1])), secondPlaceholder: fieldOf(ruleLists[1]).classList.contains('is-placeholder'), dflt: shownIn(fieldOf(defaultModelList())), cover: shownIn(fieldOf(coverList())) };
        let captured = null;
        Templates.save = async (...args) => { captured = args; throw new Error('enregistrement simulé (test)'); };
        window.alert = () => {};
        console.error = () => {};
        document.getElementById('macro-editor-name').value = 'Macro de test';
        document.getElementById('macro-editor-save').click();
        await h.sleep(80);
        const slots = captured ? JSON.parse(captured[2]).slots : null;
        const saved = slots && slots.map(s => s.type === 'fixed'
          ? { type: s.type, modeleId: s.modeleId }
          : { type: s.type, rules: s.rules.map(r => ({ column: r.column, operator: r.operator, value: r.value, modeleId: r.modeleId })), defaultModeleId: s.defaultModeleId });
        out = { fields, opened, skipFound, chooseFound, searched, values, redrawn, saved };
      } finally {
        Templates.getCached = realCached;
        Templates.save = realSave;
        window.alert = realAlert;
        console.error = realError;
        await closeMacroWindow(h);
      }
      const choose = I18n.t('macro.modal.choosePlaceholder');
      const skip = I18n.t('macro.modal.defaultSkip');
      const use = nom => I18n.t('macro.modal.defaultUse', { name: nom });
      const documents = ['Notification_base', 'Notification_bureau', 'Notification_projet'];
      const pass = out.fields.every(f => f.hidden && f.width > 40)
        && out.fields[0].text === choose && out.fields[0].placeholder && out.fields[1].text === choose && out.fields[1].placeholder
        && out.fields[2].text === skip && !out.fields[2].placeholder
        && JSON.stringify(out.opened[0].rows) === JSON.stringify([choose].concat(documents)) && JSON.stringify(out.opened[1].rows) === JSON.stringify([choose].concat(documents))
        && JSON.stringify(out.opened[2].rows) === JSON.stringify([skip].concat(documents.map(use)))
        && out.opened.every(o => o.headers === 0 && o.searchPlaceholder === I18n.t('searchSelect.searchTemplates'))
        && JSON.stringify(out.skipFound) === JSON.stringify([skip]) && out.chooseFound.length === 0
        && JSON.stringify(out.searched.cover) === JSON.stringify(['Notification_base']) && JSON.stringify(out.searched.rule) === JSON.stringify(['Notification_bureau'])
        && JSON.stringify(out.searched.dflt) === JSON.stringify([use('Notification_projet')])
        && out.values.cover === '11' && out.values.rule === '12' && out.values.dflt === '13'
        && JSON.stringify(out.values.shown) === JSON.stringify(['Notification_base', 'Notification_bureau', use('Notification_projet')])
        && out.redrawn.rules === 2 && out.redrawn.first === 'Notification_bureau' && out.redrawn.firstValue === '12' && out.redrawn.second === choose && out.redrawn.secondPlaceholder
        && out.redrawn.dflt === use('Notification_projet') && out.redrawn.cover === 'Notification_base'
        && JSON.stringify(out.saved) === JSON.stringify([
          { type: 'fixed', modeleId: '11' },
          { type: 'conditional', rules: [{ column: 'Statut', operator: '=', value: 'Urgent', modeleId: '12' }], defaultModeleId: '13' },
        ]);
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'colsearch_macro_editor_cover_list_follows_the_macro_model_at_each_opening',
    description: 'Macro-modèle : la liste de la page de garde, posée une seule fois dans la page, montre à chaque ouverture le modèle du macro-modèle édité (rien pour un nouveau) sans se dédoubler, comme les listes redessinées de ses annexes',
    run: async (h) => {
      await seed(h);
      const realCached = Templates.getCached;
      let out;
      try {
        Templates.getCached = () => MACRO_TEMPLATES;
        const wraps = () => coverList().parentNode.querySelectorAll(':scope > .ss-wrap').length;
        const existing = { id: 900, nom: 'Notification_classique', macroSlots: { slots: [
          { type: 'fixed', modeleId: '11' },
          { type: 'conditional', rules: [{ column: 'Statut', operator: '=', value: 'projet', modeleId: '13' }], defaultModeleId: '12' },
        ] } };
        MacroEditor.openModal(existing);
        await h.sleep(60);
        const edited = { cover: shownIn(fieldOf(coverList())), coverValue: coverList().value, coverPlaceholder: fieldOf(coverList()).classList.contains('is-placeholder'), rule: shownIn(fieldOf(ruleModelList())), dflt: shownIn(fieldOf(defaultModelList())), wraps: wraps() };
        await closeMacroWindow(h);
        MacroEditor.openModal(null);
        await h.sleep(60);
        const fresh = { cover: shownIn(fieldOf(coverList())), coverValue: coverList().value, coverPlaceholder: fieldOf(coverList()).classList.contains('is-placeholder'), cards: macroModal().querySelectorAll('.macro-slot-card').length, wraps: wraps() };
        await closeMacroWindow(h);
        MacroEditor.openModal(existing);
        await h.sleep(60);
        const again = { cover: shownIn(fieldOf(coverList())), coverValue: coverList().value, wraps: wraps() };
        await closeMacroWindow(h);
        out = { edited, fresh, again };
      } finally {
        Templates.getCached = realCached;
        if (macroModal().style.display !== 'none') await closeMacroWindow(h);
      }
      const choose = I18n.t('macro.modal.choosePlaceholder');
      const pass = out.edited.cover === 'Notification_base' && out.edited.coverValue === '11' && !out.edited.coverPlaceholder && out.edited.rule === 'Notification_projet'
        && out.edited.dflt === I18n.t('macro.modal.defaultUse', { name: 'Notification_bureau' }) && out.edited.wraps === 1
        && out.fresh.cover === choose && out.fresh.coverValue === '' && out.fresh.coverPlaceholder && out.fresh.cards === 0 && out.fresh.wraps === 1
        && out.again.cover === 'Notification_base' && out.again.coverValue === '11' && out.again.wraps === 1;
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'colsearch_macro_editor_native_lists_stay_when_the_component_fails',
    description: 'Macro-modèle : si le composant de recherche est indisponible, les trois listes de modèles gardent le <select> natif (visible, mêmes modèles), le choix se garde après l’ajout d’une condition ; à l’ouverture suivante, les listes avec recherche reviennent',
    run: async (h) => {
      await seed(h);
      const realAttach = SearchSelect.attachTemplates;
      const realCached = Templates.getCached;
      const warn = console.warn;
      let result;
      try {
        Templates.getCached = () => MACRO_TEMPLATES;
        // La page de garde est équipée depuis une ouverture précédente : on la rend au <select> natif pour rejouer sa toute première ouverture sans composant.
        SearchSelect.attach(coverList()).destroy();
        console.warn = () => {};
        SearchSelect.attachTemplates = () => { throw new Error('composant indisponible (test)'); };
        await openMacroWindow(h);
        const lists = [coverList(), ruleModelList(), defaultModelList()];
        const native = lists.map(select => ({ visible: visible(select) && select.getBoundingClientRect().width > 40, field: hasField(select), options: select.options.length }));
        changed(lists[0], '11');
        changed(lists[1], '12');
        changed(lists[2], '13');
        macroModal().querySelector('.macro-rule-add').click();
        await h.sleep(60);
        const kept = { cover: coverList().value, rule: ruleModelList().value, dflt: defaultModelList().value, ruleField: hasField(ruleModelList()) };
        await closeMacroWindow(h);
        SearchSelect.attachTemplates = realAttach;
        console.warn = warn;
        await openMacroWindow(h);
        const back = [coverList(), ruleModelList(), defaultModelList()].map(select => ({ field: hasField(select), hidden: !visible(select) }));
        await closeMacroWindow(h);
        result = { native, kept, back };
      } finally {
        SearchSelect.attachTemplates = realAttach;
        Templates.getCached = realCached;
        console.warn = warn;
        if (macroModal().style.display !== 'none') await closeMacroWindow(h);
      }
      const pass = result.native.every(n => n.visible && !n.field && n.options === 4)
        && result.kept.cover === '11' && result.kept.rule === '12' && result.kept.dflt === '13' && !result.kept.ruleField
        && result.back.every(b => b.field && b.hidden);
      return { pass, notes: JSON.stringify(result) };
    },
  });

  // === Colonne d'une règle du macro-modèle (Antoine, 2026-10-01 : « dans la modale pour les macro modèle lorsque je veux ajouter une colonne d'une autre table je ne
  // peux pas la rechercher, je dois mettre à la main table.colonne … pas besoin de séparer les colonnes de la table en cours et les autres, une seule dropdown avec
  // recherche dynamique. Et si jamais le lien entre les deux tables n'est pas déjà fait … ouvrir la modale pour le choix ») : UNE liste avec recherche pour les colonnes de
  // TOUTES les tables, sans groupes, et la fenêtre de choix de la clé pour une table pas encore liée (js/macro-editor.js, js/condition-fields.js:ensureTableLinked). ===
  const linkConfigModal = () => document.getElementById('link-config-modal');
  const macroColumnTrigger = () => triggerIn(macroModal().querySelector('.macro-rule-row'));
  // Ce qui se trouve réellement au premier plan au centre de la fenêtre de la clé : une fenêtre recouverte par le macro-modèle ne recevrait aucun clic.
  function onTopAtCenter(modal) {
    const box = modal.querySelector('.modal-content').getBoundingClientRect();
    const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return !!top && modal.contains(top);
  }
  const pressEscape = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

  cases.push({
    id: 'colsearch_macro_rule_lists_the_columns_of_every_table_in_one_flat_list_found_by_name',
    description: 'Macro-modèle : la colonne d’une règle se choisit dans UNE liste avec recherche qui réunit les colonnes de toutes les tables, sans groupes (celles de la page en nom nu, les autres en « Table.Colonne ») ; la frappe retrouve une colonne d’une autre table par son nom, sans saisir « Table.Colonne » à la main',
    run: async (h) => {
      await seed(h);
      let out;
      try {
        await openMacroWindow(h);
        const trigger = macroColumnTrigger();
        const select = selectOf(trigger);
        const listed = await readList(h, trigger);
        const found = {
          role: await searchList(h, trigger, 'role', 'Escape'),
          table: await searchList(h, trigger, 'annuaire telephone', 'Escape'),
          name: await searchList(h, trigger, 'nom', 'Escape'),
          date: await searchList(h, trigger, 'date', 'Escape'),
        };
        // Entrée sur le premier résultat : la colonne d'une table déjà liée est adoptée sans rien demander, celle de la page garde son nom nu.
        await searchList(h, trigger, 'telephone', 'Enter');
        const other = { value: select.value, shown: shownIn(trigger), asked: visible(linkConfigModal()), advancedHidden: macroModal().querySelector('.macro-rule-column-advanced').hidden };
        await searchList(h, trigger, 'statut', 'Enter');
        const own = { value: select.value, shown: shownIn(trigger) };
        out = { listed, found, other, own, groups: select.querySelectorAll('optgroup').length };
      } finally {
        await closeMacroWindow(h);
      }
      const advanced = I18n.t('macro.modal.columnAdvanced');
      const page = ['Titre', 'Statut', 'Responsable' + hintOf('macro.modal.typeRef'), 'Montant' + hintOf('macro.modal.typeNumeric'), 'Echeance' + hintOf('macro.modal.typeDate'), 'Actif' + hintOf('macro.modal.typeBool')];
      const rows = out.listed.rows;
      const pass = out.listed.headers === 0 && out.groups === 0
        && rows[0] === I18n.t('macro.modal.columnChoosePlaceholder') && rows[rows.length - 1] === advanced
        && JSON.stringify(rows.slice(1, 1 + page.length)) === JSON.stringify(page)
        && ['CsAnnuaire.NomPrenom', 'CsAnnuaire.Telephone', 'CsAnnuaire.Naissance' + hintOf('macro.modal.typeDate'), 'CsContacts.Role', 'CsContacts.Dossier' + hintOf('macro.modal.typeRef'),
          'CsFactures.Client', 'CsLignes.Presence' + hintOf('macro.modal.typeChoice')].every(r => rows.includes(r))
        && rows.slice(1 + page.length, -1).every(r => r.indexOf('.') !== -1) && !rows.some(r => r.indexOf('gristHelper_') !== -1)
        && out.found.role.includes('CsContacts.Role') && !out.found.role.includes('Titre')
        && JSON.stringify(out.found.table) === JSON.stringify(['CsAnnuaire.Telephone', advanced])
        && out.found.name.includes('CsAnnuaire.NomPrenom') && out.found.name.includes('CsContacts.Nom') && !out.found.name.includes('Titre')
        && out.found.date.includes('Echeance' + hintOf('macro.modal.typeDate')) && out.found.date.includes('CsAnnuaire.Naissance' + hintOf('macro.modal.typeDate'))
        && out.other.value === 'CsAnnuaire.Telephone' && out.other.shown === 'CsAnnuaire.Telephone' && !out.other.asked && out.other.advancedHidden
        && out.own.value === 'Statut' && out.own.shown === 'Statut';
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'colsearch_condition_and_macro_rules_list_the_same_columns_in_the_same_order',
    description: 'La colonne d’une règle se choisit dans la MÊME liste à plat dans la fenêtre de condition d’une bulle et dans celle du macro-modèle (mêmes lignes, même ordre, mêmes indices de type) : une seule façon de chercher une colonne, une seule liste à maintenir',
    run: async (h) => {
      await seed(h);
      const condition = await (async () => {
        const modal = await openConditionWindow(h);
        const list = await readList(h, triggerIn(modal));
        dismiss(modal);
        await h.sleep(30);
        return list;
      })();
      let macro;
      try {
        await openMacroWindow(h);
        macro = await readList(h, macroColumnTrigger());
      } finally {
        await closeMacroWindow(h);
      }
      const pass = condition.headers === 0 && macro.headers === 0 && condition.rows.length > 20
        && JSON.stringify(condition.rows) === JSON.stringify(macro.rows);
      return { pass, notes: JSON.stringify({ condition: condition.rows.length, macro: macro.rows.length, onlyCondition: condition.rows.filter(r => !macro.rows.includes(r)), onlyMacro: macro.rows.filter(r => !condition.rows.includes(r)) }) };
    },
  });

  cases.push({
    id: 'colsearch_macro_rule_unlinked_table_column_asks_for_the_key_above_the_macro_window',
    description: 'Macro-modèle : une colonne d’une table pas encore liée ouvre la fenêtre de choix de la clé PAR-DESSUS le macro-modèle ; Échap ou Annuler remet la colonne précédente dans le <select> et le champ visible (le macro-modèle reste ouvert, le focus revient au champ), Valider enregistre le lien et garde la colonne',
    run: async (h) => {
      await seed(h);
      let out;
      try {
        await openMacroWindow(h);
        const trigger = macroColumnTrigger();
        const select = selectOf(trigger);
        await searchList(h, trigger, 'statut', 'Enter');
        // Par Échap : la fenêtre du dessus (la clé) se ferme, pas le macro-modèle.
        await searchList(h, trigger, 'role', 'Enter');
        await h.sleep(150);
        const asked = { visible: visible(linkConfigModal()), onTop: onTopAtCenter(linkConfigModal()), title: document.getElementById('link-config-title').textContent };
        pressEscape();
        await h.sleep(80);
        const escaped = {
          linkOpen: visible(linkConfigModal()), macroOpen: visible(macroModal()), value: select.value, shown: shownIn(trigger),
          rule: GristAPI.getLinkRule('CsContacts'), focusBack: document.activeElement === trigger,
        };
        // Par le bouton Annuler, puis Valider.
        await searchList(h, trigger, 'role', 'Enter');
        await h.sleep(150);
        const askedAgain = visible(linkConfigModal());
        document.getElementById('link-config-cancel').click();
        await h.sleep(80);
        const cancelled = { linkOpen: visible(linkConfigModal()), macroOpen: visible(macroModal()), value: select.value, shown: shownIn(trigger), rule: GristAPI.getLinkRule('CsContacts') };
        await searchList(h, trigger, 'role', 'Enter');
        await h.sleep(150);
        document.getElementById('link-config-confirm').click();
        await h.sleep(150);
        const confirmed = {
          linkOpen: visible(linkConfigModal()), macroOpen: visible(macroModal()), value: select.value, shown: shownIn(trigger), rule: GristAPI.getLinkRule('CsContacts'),
          typeHint: macroModal().querySelector('.macro-rule-column-type').textContent, focusBack: document.activeElement === trigger,
        };
        // Une fois liée, une autre colonne de la même table ne demande plus rien.
        await searchList(h, trigger, 'contacts nom', 'Enter');
        await h.sleep(60);
        const sameTable = { value: select.value, asked: visible(linkConfigModal()) };
        out = { asked, escaped, askedAgain, cancelled, confirmed, sameTable };
      } finally {
        if (visible(linkConfigModal())) document.getElementById('link-config-cancel').click();
        await closeMacroWindow(h);
      }
      const pass = out.asked.visible && out.asked.onTop && out.asked.title.indexOf('CsContacts') !== -1
        && !out.escaped.linkOpen && out.escaped.macroOpen && out.escaped.value === 'Statut' && out.escaped.shown === 'Statut' && !out.escaped.rule && out.escaped.focusBack
        && out.askedAgain && !out.cancelled.linkOpen && out.cancelled.macroOpen && out.cancelled.value === 'Statut' && out.cancelled.shown === 'Statut' && !out.cancelled.rule
        && !out.confirmed.linkOpen && out.confirmed.macroOpen && out.confirmed.value === 'CsContacts.Role' && out.confirmed.shown === 'CsContacts.Role'
        && !!out.confirmed.rule && out.confirmed.rule.mode === 'match' && out.confirmed.rule.colonneCible === 'Dossier' && out.confirmed.rule.colonneSource === 'id'
        && out.confirmed.typeHint === '' && out.confirmed.focusBack
        && out.sameTable.value === 'CsContacts.Nom' && !out.sameTable.asked;
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'colsearch_macro_rule_saved_table_column_shows_in_the_list_and_the_rule_picks_its_model',
    description: 'Macro-modèle : une règle déjà enregistrée sur « Table.Colonne » (saisie à la main jusqu’ici) s’affiche choisie dans la liste, une colonne inconnue reste dans la saisie avancée ; la colonne choisie dans la liste est celle que lit le macro-modèle : la règle sur la table liée retient son modèle pour la ligne qui la remplit, et le modèle par défaut pour les autres',
    run: async (h) => {
      await seed(h);
      const realCached = Templates.getCached;
      const realSave = Templates.save;
      const realAlert = window.alert;
      const realError = console.error;
      let out;
      try {
        Templates.getCached = () => MACRO_TEMPLATES;
        MacroEditor.openModal({ id: 900, nom: 'Notification_classique', macroSlots: { slots: [
          { type: 'conditional', rules: [
            { column: 'CsAnnuaire.NomPrenom', operator: '=', value: 'Dupont Jean', modeleId: '12' },
            { column: 'CsInconnue.Colonne', operator: '=', value: 'x', modeleId: '13' },
          ], defaultModeleId: '11' },
        ] } });
        await h.sleep(60);
        const rows = Array.from(macroModal().querySelectorAll('.macro-rule-row'));
        const shown = rows.map(row => ({
          value: row.querySelector('select.macro-rule-column').value, shown: shownIn(triggerIn(row)),
          free: row.querySelector('.macro-rule-column-advanced').value, freeVisible: !row.querySelector('.macro-rule-column-advanced').hidden,
        }));
        let captured = null;
        Templates.save = async (...args) => { captured = args; throw new Error('enregistrement simulé (test)'); };
        window.alert = () => {};
        console.error = () => {};
        const slotsOf = () => JSON.parse(captured[2]).slots;
        const record = GristAPI.getCurrentRecord();
        document.getElementById('macro-editor-name').value = 'Notification_classique';
        document.getElementById('macro-editor-save').click();
        await h.sleep(80);
        const savedFirst = slotsOf()[0];
        const pickedFilled = await MacroTemplates.pickModeleId(savedFirst, 'CsDossiers', record);
        // La même règle avec une valeur que la ligne ne remplit pas : le modèle par défaut.
        setInput(rows[0].querySelector('.macro-rule-value'), 'Martin Anne');
        document.getElementById('macro-editor-save').click();
        await h.sleep(80);
        const pickedOther = await MacroTemplates.pickModeleId(slotsOf()[0], 'CsDossiers', record);
        out = { shown, savedColumns: savedFirst.rules.map(r => r.column), pickedFilled, pickedOther };
      } finally {
        Templates.getCached = realCached;
        Templates.save = realSave;
        window.alert = realAlert;
        console.error = realError;
        await closeMacroWindow(h);
      }
      const pass = out.shown.length === 2
        && out.shown[0].value === 'CsAnnuaire.NomPrenom' && out.shown[0].shown === 'CsAnnuaire.NomPrenom' && !out.shown[0].freeVisible
        && out.shown[1].value === '__advanced__' && out.shown[1].shown === I18n.t('macro.modal.columnAdvanced') && out.shown[1].freeVisible && out.shown[1].free === 'CsInconnue.Colonne'
        && JSON.stringify(out.savedColumns) === JSON.stringify(['CsAnnuaire.NomPrenom', 'CsInconnue.Colonne'])
        && out.pickedFilled === '12' && out.pickedOther === '11';
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'colsearch_macro_rule_native_column_list_stays_when_the_component_fails',
    description: 'Macro-modèle : si le composant de recherche est indisponible, la colonne d’une règle garde le <select> natif (visible, toutes les tables à la suite) et le choix d’une table pas encore liée ouvre toujours la fenêtre de la clé, dont Annuler remet la colonne précédente',
    run: async (h) => {
      await seed(h);
      const realAttach = SearchSelect.attachColumns;
      const warn = console.warn;
      let out;
      try {
        console.warn = () => {};
        SearchSelect.attachColumns = () => { throw new Error('composant indisponible (test)'); };
        await openMacroWindow(h);
        const select = macroModal().querySelector('select.macro-rule-column');
        const native = { visible: visible(select) && select.getBoundingClientRect().width > 40, field: hasField(select), groups: select.querySelectorAll('optgroup').length, values: Array.from(select.options).map(o => o.value) };
        changed(select, 'Statut');
        await h.sleep(30);
        changed(select, 'CsContacts.Role');
        await h.sleep(150);
        const asked = visible(linkConfigModal());
        document.getElementById('link-config-cancel').click();
        await h.sleep(80);
        const cancelled = { value: select.value, macroOpen: visible(macroModal()), rule: GristAPI.getLinkRule('CsContacts') };
        changed(select, 'CsAnnuaire.Telephone');
        await h.sleep(60);
        const linked = { value: select.value, asked: visible(linkConfigModal()) };
        out = { native, asked, cancelled, linked };
      } finally {
        SearchSelect.attachColumns = realAttach;
        console.warn = warn;
        if (visible(linkConfigModal())) document.getElementById('link-config-cancel').click();
        await closeMacroWindow(h);
      }
      const pass = out.native.visible && !out.native.field && out.native.groups === 0 && out.native.values.includes('CsAnnuaire.Telephone') && out.native.values.includes('CsContacts.Role')
        && out.asked && out.cancelled.value === 'Statut' && out.cancelled.macroOpen && !out.cancelled.rule
        && out.linked.value === 'CsAnnuaire.Telephone' && !out.linked.asked;
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'searchselect_table_and_template_lists_have_their_own_texts_and_follow_the_language',
    description: 'attachTables et attachTemplates posent leurs textes (« Rechercher une table… » / « Rechercher un modèle… », « Aucune table ne correspond. » / « Aucun modèle ne correspond. »), relus à chaque ouverture comme ceux des colonnes ; un texte passé en option l’emporte',
    run: async () => {
      const box = document.createElement('div');
      const options = '<option value="">— Aucune —</option><option value="a">Alpha</option>';
      box.innerHTML = ['tables', 'templates', 'columns', 'custom'].map(kind => `<select id="cs-kind-${kind}">${options}</select>`).join('');
      document.body.appendChild(box);
      const pick = kind => box.querySelector('#cs-kind-' + kind);
      const controllers = [
        SearchSelect.attachTables(pick('tables')),
        SearchSelect.attachTemplates(pick('templates')),
        SearchSelect.attachColumns(pick('columns')),
        SearchSelect.attachTemplates(pick('custom'), { searchPlaceholder: () => 'Chercher un gabarit' }),
      ];
      const read = kind => {
        const panel = pick(kind).nextElementSibling.querySelector('.ss-panel');
        return { placeholder: panel.querySelector('.ss-input').placeholder, aria: panel.querySelector('.ss-input').getAttribute('aria-label'), empty: panel.querySelector('.ss-empty').textContent };
      };
      const reading = lang => {
        I18n.setLang(lang);
        const out = {};
        ['tables', 'templates', 'columns', 'custom'].forEach((kind, i) => { controllers[i].open(); out[kind] = read(kind); controllers[i].close(false); });
        return out;
      };
      let fr, en, back;
      try {
        fr = reading('fr');
        en = reading('en');
        back = reading('fr');
      } finally {
        I18n.setLang('fr');
        controllers.forEach(controller => controller.destroy());
        box.remove();
      }
      const pass = fr.tables.placeholder === 'Rechercher une table…' && fr.tables.aria === fr.tables.placeholder && fr.tables.empty === 'Aucune table ne correspond.'
        && fr.templates.placeholder === 'Rechercher un modèle…' && fr.templates.aria === fr.templates.placeholder && fr.templates.empty === 'Aucun modèle ne correspond.'
        && fr.columns.placeholder === 'Rechercher une colonne…' && fr.columns.empty === 'Aucune colonne ne correspond.'
        && en.tables.placeholder === 'Search for a table…' && en.tables.empty === 'No table matches.'
        && en.templates.placeholder === 'Search for a template…' && en.templates.empty === 'No template matches.'
        && en.columns.placeholder === 'Search for a column…' && en.columns.empty === 'No column matches.'
        && fr.custom.placeholder === 'Chercher un gabarit' && en.custom.placeholder === 'Chercher un gabarit' && en.custom.empty === 'No template matches.'
        && JSON.stringify(back) === JSON.stringify(fr);
      return { pass, notes: JSON.stringify({ fr, en, back }) };
    },
  });

  // === Valeurs possibles du champ Valeur d'une règle (Antoine, 2026-09-29 : « quand on indique une colonne à choix ou à référence, mettre de l'autocompletion ou
  // un dropdown des valeurs possibles ») - js/condition-fields.js:buildValueField, GristAPI.getReferenceValues. Placés en dernier : ils ajoutent la table CsSuivi. ===
  // Page sur CsSuivi : une colonne à choix (Priorite), à choix multiples (Etiquettes), trois Références vers CsAnnuaire dont la « colonne à afficher » est le nom
  // (Responsable), l'id de la ligne (Interlocuteur : rien à proposer) ou une date (Anniversaire : rien non plus), une liste de références (Equipe), un texte.
  async function seedValues(h) {
    await seed(h);
    const stub = window.__gristStub;
    stub.setVariables('CsSuivi', {
      Titre: 'Text', Priorite: 'Choice', Etiquettes: 'ChoiceList', Responsable: 'Ref:CsAnnuaire', Equipe: 'RefList:CsAnnuaire', Interlocuteur: 'Ref:CsAnnuaire', Anniversaire: 'Ref:CsAnnuaire',
    }, { Priorite: ['Haute', 'Normale', 'Basse'], Etiquettes: ['Projet', 'Urgent', 'Interne'] }, undefined, { Responsable: 'NomPrenom', Equipe: 'NomPrenom', Anniversaire: 'Naissance' });
    stub.setRows('CsAnnuaire', [
      { id: 7, NomPrenom: 'Dupont Jean', Telephone: '06 11 22 33 44', Naissance: 631152000 },
      { id: 8, NomPrenom: 'Martin Paul', Telephone: '', Naissance: null },
      { id: 9, NomPrenom: 'Zola Émile', Telephone: '', Naissance: null },
      { id: 10, NomPrenom: 'Bernard Léa', Telephone: '', Naissance: null },
      { id: 11, NomPrenom: 'Dupont Jean ', Telephone: '', Naissance: null },
    ]);
    stub.setRows('CsSuivi', [{ id: 1, Titre: 'Suivi A', Priorite: 'Haute', Etiquettes: ['L', 'Projet', 'Urgent'], Responsable: 7, Equipe: ['L', 7, 8], Interlocuteur: 8, Anniversaire: 7 }]);
    await GristAPI.refreshSchema();
    stub.fireRecord({ id: 1, Titre: 'Suivi A', Priorite: 'Haute', Etiquettes: ['Projet', 'Urgent'], Responsable: 'Dupont Jean', Equipe: ['Dupont Jean', 'Martin Paul'], Interlocuteur: 'Martin Paul', Anniversaire: 631152000 }, 'CsSuivi');
    await h.sleep(50);
  }
  async function openSuiviWindow(h) {
    Editor.setHTML(`<p>Objet : ${badgeHtml('CsSuivi', 'Titre')}</p>`);
    await selectBadge(h, 'CsSuivi.Titre');
    pressToolbarButton('var-condition');
    await h.sleep(60);
    return conditionModal();
  }
  // Choisit la colonne de la première règle (le <select> masqué, source de la valeur, reçoit `change` comme après un choix dans la liste), puis laisse la lecture
  // des valeurs d'une Référence se terminer.
  async function chooseColumn(h, modal, column, wait) {
    const select = modal.querySelector('select.macro-rule-column');
    select.value = column;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await h.sleep(wait === undefined ? 40 : wait);
  }
  // Ce que montre le champ Valeur de la première règle : le champ visible (liste avec recherche), le <select> masqué, le champ de « Autre valeur… », ou le texte libre.
  function valueParts(modal) {
    const wrap = modal.querySelector('.macro-rule-row .macro-rule-value-wrap');
    return {
      wrap, trigger: wrap.querySelector('.ss-trigger'), panel: wrap.querySelector('.ss-panel'), select: wrap.querySelector('select.macro-rule-value'),
      advanced: wrap.querySelector('.macro-rule-value-advanced'), text: wrap.querySelector('input.macro-rule-value'),
    };
  }
  const valueRows = parts => rowsOf(parts.panel);
  const VALUE_CHOOSE = () => I18n.t('macro.modal.valueChoosePlaceholder');
  const VALUE_OTHER = () => I18n.t('macro.modal.valueAdvanced');
  // Lecture de la table liée retardée à la main : `release()` la laisse aboutir (ou échouer, si `failing` est posé) ; `reads` compte les lectures de CsAnnuaire.
  function holdAnnuaireReads() {
    const realFetch = grist.docApi.fetchTable;
    const hold = { reads: 0, failing: false };
    let open;
    const opened = new Promise(resolve => { open = resolve; });
    grist.docApi.fetchTable = async (tableId) => {
      if (tableId !== 'CsAnnuaire') return realFetch(tableId);
      hold.reads++;
      await opened;
      if (hold.failing) throw new Error('lecture impossible (test)');
      return realFetch(tableId);
    };
    hold.release = () => open();
    hold.restore = () => { grist.docApi.fetchTable = realFetch; };
    return hold;
  }
  function countAnnuaireReads() {
    const realFetch = grist.docApi.fetchTable;
    const counter = { reads: 0, restore: () => { grist.docApi.fetchTable = realFetch; } };
    grist.docApi.fetchTable = async (tableId) => { if (tableId === 'CsAnnuaire') counter.reads++; return realFetch(tableId); };
    return counter;
  }

  cases.push({
    id: 'colsearch_value_choice_column_lists_its_choices_with_search_and_saves_the_choice',
    description: 'Colonne à choix : le champ Valeur est une liste avec recherche des choix de la colonne (le <select> est masqué), « Autre valeur… » toujours en bas ; un choix se cherche, se prend à la souris ou à Entrée, et s’enregistre ; une valeur libre aussi, et se retrouve à la réouverture',
    run: async (h) => {
      await seedValues(h);
      let modal = await openSuiviWindow(h);
      const ed = EditorCore.getEditor();
      await chooseColumn(h, modal, 'Priorite');
      let parts = valueParts(modal);
      const closed = { shown: parts.trigger.textContent, width: parts.trigger.getBoundingClientRect().width, nativeWidth: parts.select.getBoundingClientRect().width, placeholder: parts.trigger.classList.contains('is-placeholder') };
      parts.trigger.click();
      await h.sleep(30);
      const all = valueRows(parts);
      const searchPlaceholder = inputOf(parts.panel).placeholder;
      setInput(inputOf(parts.panel), 'no');
      await h.sleep(10);
      const filtered = valueRows(parts);
      setInput(inputOf(parts.panel), 'zzz');
      await h.sleep(10);
      const none = { rows: valueRows(parts), message: parts.panel.querySelector('.ss-empty').textContent, shown: !parts.panel.querySelector('.ss-empty').hidden };
      setInput(inputOf(parts.panel), 'bas');
      await h.sleep(10);
      press(inputOf(parts.panel), 'Enter');
      await h.sleep(40);
      const byKeyboard = { value: parts.select.value, shown: parts.trigger.textContent, closed: parts.panel.hidden };
      parts.trigger.click();
      await h.sleep(30);
      Array.from(parts.panel.querySelectorAll('.ss-option')).find(r => label(r) === 'Normale').click();
      await h.sleep(40);
      const byMouse = { value: parts.select.value, shown: parts.trigger.textContent };
      saveButton(modal).click();
      await h.sleep(80);
      const savedChoice = badgeNodes(ed)[0].node.attrs.condition;
      // « Autre valeur… » : le champ libre apparaît avec le focus, sa frappe est la valeur de la règle.
      await selectBadge(h, 'CsSuivi.Titre');
      pressToolbarButton('var-condition');
      await h.sleep(60);
      modal = conditionModal();
      parts = valueParts(modal);
      const reopenedChoice = { shown: parts.trigger.textContent, value: parts.select.value, advancedHidden: parts.advanced.hidden };
      parts.trigger.click();
      await h.sleep(30);
      parts.panel.querySelector('.ss-option.is-pinned').click();
      await h.sleep(40);
      const other = { visible: !parts.advanced.hidden, focused: document.activeElement === parts.advanced, shown: parts.trigger.textContent };
      setInput(parts.advanced, 'Critique');
      await h.sleep(20);
      saveButton(modal).click();
      await h.sleep(80);
      const savedOther = badgeNodes(ed)[0].node.attrs.condition;
      await selectBadge(h, 'CsSuivi.Titre');
      pressToolbarButton('var-condition');
      await h.sleep(60);
      modal = conditionModal();
      parts = valueParts(modal);
      const reopenedOther = { select: parts.select.value, advancedValue: parts.advanced.value, advancedHidden: parts.advanced.hidden, shown: parts.trigger.textContent };
      dismiss(modal);
      const pass = closed.shown === VALUE_CHOOSE() && closed.width > 80 && closed.nativeWidth === 0 && closed.placeholder
        && JSON.stringify(all) === JSON.stringify([VALUE_CHOOSE(), 'Haute', 'Normale', 'Basse', VALUE_OTHER()])
        && searchPlaceholder === I18n.t('searchSelect.searchValues')
        && JSON.stringify(filtered) === JSON.stringify(['Normale', VALUE_OTHER()])
        && JSON.stringify(none.rows) === JSON.stringify([VALUE_OTHER()]) && none.shown && none.message === I18n.t('searchSelect.noValueMatch')
        && byKeyboard.value === 'Basse' && byKeyboard.shown === 'Basse' && byKeyboard.closed
        && byMouse.value === 'Normale' && byMouse.shown === 'Normale'
        && !!savedChoice && savedChoice.rules.length === 1 && savedChoice.rules[0].column === 'Priorite' && savedChoice.rules[0].value === 'Normale'
        && reopenedChoice.shown === 'Normale' && reopenedChoice.value === 'Normale' && reopenedChoice.advancedHidden
        && other.visible && other.focused && other.shown === VALUE_OTHER()
        && !!savedOther && savedOther.rules[0].value === 'Critique'
        && reopenedOther.select === '__advanced_value__' && reopenedOther.advancedValue === 'Critique' && !reopenedOther.advancedHidden && reopenedOther.shown === VALUE_OTHER();
      return { pass, notes: JSON.stringify({ closed, all, searchPlaceholder, filtered, none, byKeyboard, byMouse, savedChoice, reopenedChoice, other, savedOther, reopenedOther }) };
    },
  });

  cases.push({
    id: 'colsearch_value_reference_column_lists_the_displayed_values_of_the_linked_table',
    description: 'Colonne Référence (ou liste de références) dont la colonne à afficher est un texte : le champ Valeur liste ces valeurs affichées de la table liée, triées, sans doublon, et enregistre le texte choisi (jamais l’id de la ligne) ; une Référence qui montre l’id ou une date, une colonne texte : champ libre, sans lecture de la table liée',
    run: async (h) => {
      await seedValues(h);
      const modal = await openSuiviWindow(h);
      const ed = EditorCore.getEditor();
      await chooseColumn(h, modal, 'Responsable');
      let parts = valueParts(modal);
      parts.trigger.click();
      await h.sleep(30);
      const responsable = valueRows(parts);
      Array.from(parts.panel.querySelectorAll('.ss-option')).find(r => label(r) === 'Martin Paul').click();
      await h.sleep(40);
      const chosen = { value: parts.select.value, shown: parts.trigger.textContent };
      await chooseColumn(h, modal, 'Equipe');
      parts = valueParts(modal);
      parts.trigger.click();
      await h.sleep(30);
      const equipe = valueRows(parts);
      parts.trigger.click();
      await h.sleep(10);
      // Rien à proposer : champ libre (le placeholder du type), et la table liée n'est même pas lue.
      const counter = countAnnuaireReads();
      let free;
      try {
        free = [];
        for (const column of ['Interlocuteur', 'Anniversaire', 'Titre']) {
          await chooseColumn(h, modal, column);
          const p = valueParts(modal);
          free.push({ column, text: !!p.text, list: !!p.trigger, placeholder: p.text && p.text.placeholder });
        }
      } finally { counter.restore(); }
      await chooseColumn(h, modal, 'Responsable');
      valueParts(modal).trigger.click();
      await h.sleep(30);
      Array.from(valueParts(modal).panel.querySelectorAll('.ss-option')).find(r => label(r) === 'Bernard Léa').click();
      await h.sleep(40);
      saveButton(modal).click();
      await h.sleep(80);
      const saved = badgeNodes(ed)[0].node.attrs.condition;
      const names = [VALUE_CHOOSE(), 'Bernard Léa', 'Dupont Jean', 'Martin Paul', 'Zola Émile', VALUE_OTHER()];
      const pass = JSON.stringify(responsable) === JSON.stringify(names) && chosen.value === 'Martin Paul' && chosen.shown === 'Martin Paul'
        && JSON.stringify(equipe) === JSON.stringify(names)
        && free.length === 3 && free.every(f => f.text && !f.list && f.placeholder === I18n.t('macro.modal.valuePlaceholder')) && counter.reads === 0
        && !!saved && saved.rules[0].column === 'Responsable' && saved.rules[0].value === 'Bernard Léa';
      return { pass, notes: JSON.stringify({ responsable, chosen, equipe, free, reads: counter.reads, saved }) };
    },
  });

  cases.push({
    id: 'colsearch_value_reference_says_loading_then_lists_and_keeps_the_saved_value_or_falls_back_to_free_text',
    description: 'Colonne Référence : « Chargement… » (liste grisée d’attente, un seul champ) le temps de lire la table liée, puis la liste ; la valeur déjà enregistrée reste choisie, ou reste visible dans « Autre valeur… » si la table ne la contient plus ; une table illisible ou vide laisse le champ libre avec la valeur enregistrée ; changer de colonne pendant la lecture ne laisse rien derrière',
    run: async (h) => {
      await seedValues(h);
      const ed = EditorCore.getEditor();
      let modal = await openSuiviWindow(h);
      // Une valeur enregistrée : Martin Paul.
      await chooseColumn(h, modal, 'Responsable');
      let parts = valueParts(modal);
      parts.trigger.click();
      await h.sleep(30);
      Array.from(parts.panel.querySelectorAll('.ss-option')).find(r => label(r) === 'Martin Paul').click();
      await h.sleep(40);
      saveButton(modal).click();
      await h.sleep(80);
      const reopen = async () => {
        await selectBadge(h, 'CsSuivi.Titre');
        pressToolbarButton('var-condition');
        await h.sleep(30);
        return conditionModal();
      };
      const hold = holdAnnuaireReads();
      let loading, loaded, gone, failed, empty, changed;
      try {
        // 1. Attente, puis liste avec la valeur enregistrée choisie.
        modal = await reopen();
        parts = valueParts(modal);
        loading = {
          shown: parts.trigger.textContent, options: Array.from(parts.select.options).map(o => o.textContent), lists: modal.querySelectorAll('.macro-rule-row .macro-rule-value-wrap .ss-trigger').length,
          placeholder: parts.trigger.classList.contains('is-placeholder'), text: !!parts.text,
        };
        hold.release();
        await h.sleep(40);
        parts = valueParts(modal);
        loaded = { shown: parts.trigger.textContent, value: parts.select.value, advancedHidden: parts.advanced.hidden, options: Array.from(parts.select.options).map(o => o.value) };
        dismiss(modal);
      } finally { hold.restore(); }
      // 2. La table ne contient plus la valeur enregistrée : elle reste visible dans « Autre valeur… », jamais effacée.
      window.__gristStub.setRows('CsAnnuaire', [{ id: 7, NomPrenom: 'Dupont Jean', Telephone: '', Naissance: null }]);
      modal = await reopen();
      await h.sleep(40);
      parts = valueParts(modal);
      gone = { select: parts.select.value, advancedValue: parts.advanced.value, advancedHidden: parts.advanced.hidden, shown: parts.trigger.textContent };
      dismiss(modal);
      // 3. Table liée illisible : champ libre avec la valeur enregistrée, la règle marche comme avant.
      const failing = holdAnnuaireReads();
      const warn = console.warn;
      console.warn = () => {};
      try {
        failing.failing = true;
        modal = await reopen();
        failing.release();
        await h.sleep(40);
        parts = valueParts(modal);
        failed = { text: !!parts.text, value: parts.text && parts.text.value, list: !!parts.trigger, native: !!parts.select, advanced: !!parts.advanced };
        setInput(parts.text, 'Autre Nom');
        saveButton(modal).click();
        await h.sleep(80);
        failed.saved = badgeNodes(ed)[0].node.attrs.condition.rules[0].value;
      } finally { failing.restore(); console.warn = warn; }
      // 4. Table liée sans aucune valeur : champ libre aussi.
      window.__gristStub.setRows('CsAnnuaire', []);
      modal = await reopen();
      await h.sleep(40);
      parts = valueParts(modal);
      empty = { text: !!parts.text, value: parts.text && parts.text.value, list: !!parts.trigger };
      // 5. Colonne changée pendant la lecture : le champ de la nouvelle colonne, sans reste de l'ancien, et rien ne casse quand la lecture aboutit.
      window.__gristStub.setRows('CsAnnuaire', [{ id: 7, NomPrenom: 'Dupont Jean', Telephone: '', Naissance: null }, { id: 8, NomPrenom: 'Martin Paul', Telephone: '', Naissance: null }]);
      const late = holdAnnuaireReads();
      try {
        await chooseColumn(h, modal, 'Responsable', 20);
        const duringLoad = valueParts(modal).trigger.textContent;
        await chooseColumn(h, modal, 'Titre', 20);
        late.release();
        await h.sleep(40);
        parts = valueParts(modal);
        changed = { duringLoad, text: !!parts.text, lists: modal.querySelectorAll('.macro-rule-row .macro-rule-value-wrap .ss-trigger').length, wraps: modal.querySelectorAll('.macro-rule-row .macro-rule-value-wrap').length };
      } finally { late.restore(); dismiss(modal); }
      const pass = loading.shown === I18n.t('macro.modal.valueLoading') && JSON.stringify(loading.options) === JSON.stringify([I18n.t('macro.modal.valueLoading')]) && loading.lists === 1 && loading.placeholder && !loading.text
        && loaded.shown === 'Martin Paul' && loaded.value === 'Martin Paul' && loaded.advancedHidden && JSON.stringify(loaded.options) === JSON.stringify(['', 'Bernard Léa', 'Dupont Jean', 'Martin Paul', 'Zola Émile', '__advanced_value__'])
        && gone.select === '__advanced_value__' && gone.advancedValue === 'Martin Paul' && !gone.advancedHidden && gone.shown === VALUE_OTHER()
        && failed.text && failed.value === 'Martin Paul' && !failed.list && !failed.native && !failed.advanced && failed.saved === 'Autre Nom'
        && empty.text && empty.value === 'Autre Nom' && !empty.list
        && changed.duringLoad === I18n.t('macro.modal.valueLoading') && changed.text && changed.lists === 0 && changed.wraps === 1;
      return { pass, notes: JSON.stringify({ loading, loaded, gone, failed, empty, changed }) };
    },
  });

  cases.push({
    id: 'colsearch_value_list_is_greyed_by_the_empty_operators_including_while_it_loads',
    description: '« vide » et « non vide » grisent la liste des valeurs (le champ visible, pas seulement le <select> masqué) et elle ne s’ouvre plus ; « = » la rend ; une lecture de Référence qui aboutit après coup ne la dégrise pas, et un texte libre de repli reste grisé',
    run: async (h) => {
      await seedValues(h);
      const modal = await openSuiviWindow(h);
      const operator = () => modal.querySelector('.macro-rule-row > select');
      const setOperator = async value => { operator().value = value; operator().dispatchEvent(new Event('change', { bubbles: true })); await h.sleep(20); };
      const state = () => {
        const p = valueParts(modal);
        const slot = modal.querySelector('.macro-rule-value-slot');
        return { greyed: slot.classList.contains('is-disabled'), trigger: p.trigger ? p.trigger.disabled : null, select: p.select ? p.select.disabled : null, text: p.text ? p.text.disabled : null };
      };
      await chooseColumn(h, modal, 'Priorite');
      const enabled = state();
      await setOperator('vide');
      const greyed = state();
      valueParts(modal).trigger.click();
      await h.sleep(30);
      const opensWhenGreyed = !valueParts(modal).panel.hidden;
      await setOperator('=');
      const back = state();
      // Référence : opérateur « non vide » posé AVANT que la lecture n'aboutisse.
      await setOperator('non vide');
      const hold = holdAnnuaireReads();
      let whileLoading, afterLoad, fallback;
      try {
        await chooseColumn(h, modal, 'Responsable', 20);
        whileLoading = state();
        hold.release();
        await h.sleep(40);
        afterLoad = state();
        await setOperator('=');
        afterLoad.backEnabled = state();
      } finally { hold.restore(); }
      // Table liée illisible, opérateur grisé : le champ libre de repli l'est aussi.
      const failing = holdAnnuaireReads();
      const warn = console.warn;
      console.warn = () => {};
      try {
        failing.failing = true;
        await setOperator('vide');
        await chooseColumn(h, modal, 'Titre', 20);
        await chooseColumn(h, modal, 'Equipe', 20);
        failing.release();
        await h.sleep(40);
        fallback = state();
      } finally { failing.restore(); console.warn = warn; dismiss(modal); }
      const pass = !enabled.greyed && enabled.trigger === false && enabled.select === false
        && greyed.greyed && greyed.trigger === true && greyed.select === true && !opensWhenGreyed
        && !back.greyed && back.trigger === false && back.select === false
        && whileLoading.greyed && whileLoading.trigger === true
        && afterLoad.greyed && afterLoad.trigger === true && afterLoad.select === true && afterLoad.backEnabled.trigger === false && afterLoad.backEnabled.select === false
        && fallback.greyed && fallback.text === true && fallback.trigger === null;
      return { pass, notes: JSON.stringify({ enabled, greyed, opensWhenGreyed, back, whileLoading, afterLoad, fallback }) };
    },
  });

  cases.push({
    id: 'colsearch_value_native_list_stays_when_the_component_fails',
    description: 'Si le composant de recherche est indisponible, le champ Valeur garde le <select> natif (visible, mêmes valeurs) pour une colonne à choix comme pour une Référence, et la règle marche comme avant',
    run: async (h) => {
      await seedValues(h);
      const realAttach = SearchSelect.attachValues;
      const warn = console.warn;
      let result;
      try {
        console.warn = () => {};
        SearchSelect.attachValues = () => { throw new Error('composant indisponible (test)'); };
        const modal = await openSuiviWindow(h);
        const ed = EditorCore.getEditor();
        await chooseColumn(h, modal, 'Priorite');
        let parts = valueParts(modal);
        const choice = { native: visible(parts.select) && parts.select.getBoundingClientRect().width > 60, field: !!parts.trigger, options: Array.from(parts.select.options).map(o => o.value) };
        parts.select.value = 'Basse';
        parts.select.dispatchEvent(new Event('change', { bubbles: true }));
        await chooseColumn(h, modal, 'Responsable');
        parts = valueParts(modal);
        const reference = { native: visible(parts.select) && parts.select.getBoundingClientRect().width > 60, field: !!parts.trigger, options: Array.from(parts.select.options).map(o => o.value) };
        parts.select.value = 'Zola Émile';
        parts.select.dispatchEvent(new Event('change', { bubbles: true }));
        saveButton(modal).click();
        await h.sleep(80);
        result = { choice, reference, saved: badgeNodes(ed)[0].node.attrs.condition };
      } finally {
        SearchSelect.attachValues = realAttach;
        console.warn = warn;
      }
      const pass = result.choice.native && !result.choice.field && result.choice.options.join('|') === '|Haute|Normale|Basse|__advanced_value__'
        && result.reference.native && !result.reference.field && result.reference.options.join('|') === '|Bernard Léa|Dupont Jean|Martin Paul|Zola Émile|__advanced_value__'
        && !!result.saved && result.saved.rules[0].column === 'Responsable' && result.saved.rules[0].value === 'Zola Émile';
      return { pass, notes: JSON.stringify(result) };
    },
  });

  cases.push({
    id: 'colsearch_value_list_texts_follow_the_language',
    description: 'Les textes de la liste des valeurs (zone de recherche, « Aucune valeur ne correspond. », « Choisir une valeur », « Autre valeur… », « Chargement… ») sont traduits en anglais et reviennent en français',
    run: async (h) => {
      await seedValues(h);
      const readTexts = async lang => {
        I18n.setLang(lang);
        const modal = await openSuiviWindow(h);
        await chooseColumn(h, modal, 'Priorite');
        const parts = valueParts(modal);
        parts.trigger.click();
        await h.sleep(30);
        setInput(inputOf(parts.panel), 'zzz');
        await h.sleep(10);
        const texts = { search: inputOf(parts.panel).placeholder, empty: parts.panel.querySelector('.ss-empty').textContent, other: valueRows(parts)[0], choose: null, loading: null };
        setInput(inputOf(parts.panel), '');
        await h.sleep(10);
        texts.choose = valueRows(parts)[0];
        parts.trigger.click();
        await h.sleep(10);
        const hold = holdAnnuaireReads();
        try {
          await chooseColumn(h, modal, 'Responsable', 20);
          texts.loading = valueParts(modal).trigger.textContent;
          hold.release();
          await h.sleep(30);
        } finally { hold.restore(); dismiss(modal); }
        return texts;
      };
      let fr, en, back;
      try {
        fr = await readTexts('fr');
        en = await readTexts('en');
        back = await readTexts('fr');
      } finally { I18n.setLang('fr'); }
      const pass = fr.search === 'Rechercher une valeur…' && fr.empty === 'Aucune valeur ne correspond.' && fr.choose === '— Choisir une valeur —' && fr.other === 'Autre valeur…' && fr.loading === '— Chargement… —'
        && en.search === 'Search for a value…' && en.empty === 'No value matches.' && en.choose === '— Choose a value —' && en.other === 'Other value…' && en.loading === '— Loading… —'
        && JSON.stringify(back) === JSON.stringify(fr);
      return { pass, notes: JSON.stringify({ fr, en, back }) };
    },
  });

  cases.push({
    id: 'colsearch_value_very_long_list_puts_500_rows_in_the_page_says_how_many_more_and_the_search_reaches_all',
    description: 'Référence vers une très grande table (1 201 valeurs) : 500 lignes seulement dans la page, une ligne « Encore 701 résultats : précisez la recherche. » avant « Autre valeur… » (toujours en dernier) ; la recherche porte sur toutes les valeurs, le nombre annoncé est le total, la ligne disparaît quand les résultats tiennent, et une valeur au-delà des 500 premières se choisit, s’enregistre et se retrouve',
    run: async (h) => {
      await seedValues(h);
      const stub = window.__gristStub;
      const people = [{ id: 5000, NomPrenom: 'Zola Émile', Telephone: '', Naissance: null }];
      for (let i = 1; i <= 1200; i++) people.push({ id: 100 + i, NomPrenom: 'Personne ' + String(i).padStart(4, '0'), Telephone: '', Naissance: null });
      stub.setRows('CsAnnuaire', people);
      let result;
      try {
        let modal = await openSuiviWindow(h);
        const ed = EditorCore.getEditor();
        await chooseColumn(h, modal, 'Responsable', 120);
        let parts = valueParts(modal);
        const more = () => parts.panel.querySelector('.ss-more');
        const status = () => parts.panel.querySelector('.ss-status').textContent;
        const state = () => {
          const rows = valueRows(parts);
          const line = more();
          return {
            rows: rows.length, head: rows[0], second: rows[1], beforeLast: rows[rows.length - 2], last: rows[rows.length - 1],
            more: line ? line.textContent : null,
            moreBetween: line ? (line.previousElementSibling.classList.contains('ss-option') && label(line.previousElementSibling) === rows[rows.length - 2] && line.nextElementSibling === parts.panel.querySelector('.ss-option.is-pinned')) : null,
            status: status(),
          };
        };
        parts.trigger.click();
        await h.sleep(60);
        const opened = state();
        setInput(inputOf(parts.panel), 'personne');
        await h.sleep(30);
        const allPeople = state();
        setInput(inputOf(parts.panel), 'personne 110');
        await h.sleep(30);
        const narrow = state();
        setInput(inputOf(parts.panel), 'zola');
        await h.sleep(30);
        const beyond = state();
        press(inputOf(parts.panel), 'Enter');
        await h.sleep(40);
        const picked = { value: parts.select.value, shown: parts.trigger.textContent, closed: parts.panel.hidden };
        saveButton(modal).click();
        await h.sleep(80);
        const saved = badgeNodes(ed)[0].node.attrs.condition;
        await selectBadge(h, 'CsSuivi.Titre');
        pressToolbarButton('var-condition');
        await h.sleep(60);
        modal = conditionModal();
        await h.sleep(120);
        parts = valueParts(modal);
        const reopened = { shown: parts.trigger.textContent, value: parts.select.value };
        parts.trigger.click();
        await h.sleep(60);
        const reopenedPanel = state();
        dismiss(modal);
        // Les textes de la ligne, dans les deux langues (singulier et pluriel).
        const sentences = {};
        ['fr', 'en'].forEach(lang => {
          I18n.setLang(lang);
          sentences[lang] = [1, 2, 701].map(count => I18n.t('searchSelect.more', { count }));
        });
        I18n.setLang('en');
        modal = await openSuiviWindow(h);
        await chooseColumn(h, modal, 'Responsable', 120);
        parts = valueParts(modal);
        parts.trigger.click();
        await h.sleep(60);
        const english = { more: more() ? more().textContent : null };
        dismiss(modal);
        result = { opened, allPeople, narrow, beyond, picked, saved: saved && saved.rules[0], reopened, reopenedPanel, sentences, english };
      } finally {
        I18n.setLang('fr');
        stub.setRows('CsAnnuaire', [
          { id: 7, NomPrenom: 'Dupont Jean', Telephone: '06 11 22 33 44', Naissance: 631152000 },
          { id: 8, NomPrenom: 'Martin Paul', Telephone: '', Naissance: null },
          { id: 9, NomPrenom: 'Zola Émile', Telephone: '', Naissance: null },
          { id: 10, NomPrenom: 'Bernard Léa', Telephone: '', Naissance: null },
          { id: 11, NomPrenom: 'Dupont Jean ', Telephone: '', Naissance: null },
        ]);
      }
      const r = result;
      // Les mots de la recherche se cherchent n'importe où dans la valeur : « personne 110 » retient tout nom dont le numéro contient 110.
      const expectedNarrow = people.filter(person => person.NomPrenom.indexOf('110') !== -1).length;
      const pass = r.opened.rows === 502 && r.opened.head === VALUE_CHOOSE() && r.opened.second === 'Personne 0001' && r.opened.beforeLast === 'Personne 0500' && r.opened.last === VALUE_OTHER()
        && r.opened.more === 'Encore 701 résultats : précisez la recherche.' && r.opened.moreBetween === true && r.opened.status === ''
        // Tout ce qui correspond compte, pas seulement les lignes posées : 1 200 personnes, 700 de plus que les 500 lignes (la ligne « Choisir » n'existe plus pendant une recherche).
        && r.allPeople.rows === 501 && r.allPeople.head === 'Personne 0001' && r.allPeople.beforeLast === 'Personne 0500' && r.allPeople.last === VALUE_OTHER()
        && r.allPeople.more === 'Encore 700 résultats : précisez la recherche.' && r.allPeople.moreBetween === true && r.allPeople.status === '1200 résultats'
        // Assez de résultats pour tenir sans la ligne : elle disparaît, « Autre valeur… » reste la dernière ligne.
        && expectedNarrow > 1 && expectedNarrow < 500 && r.narrow.rows === expectedNarrow + 1 && r.narrow.more === null && r.narrow.status === expectedNarrow + ' résultats' && r.narrow.last === VALUE_OTHER()
        // Une valeur qui n'était pas dans les 500 premières lignes s'atteint par la recherche.
        && r.beyond.rows === 2 && r.beyond.head === 'Zola Émile' && r.beyond.last === VALUE_OTHER() && r.beyond.more === null && r.beyond.status === '1 résultat'
        && r.picked.value === 'Zola Émile' && r.picked.shown === 'Zola Émile' && r.picked.closed
        && !!r.saved && r.saved.column === 'Responsable' && r.saved.value === 'Zola Émile'
        // À la réouverture, la valeur enregistrée (hors des 500 premières lignes) reste celle du champ, et la liste garde ses 500 lignes.
        && r.reopened.shown === 'Zola Émile' && r.reopened.value === 'Zola Émile' && r.reopenedPanel.rows === 502 && r.reopenedPanel.more === 'Encore 701 résultats : précisez la recherche.'
        && JSON.stringify(r.sentences.fr) === JSON.stringify(['Encore 1 résultat : précisez la recherche.', 'Encore 2 résultats : précisez la recherche.', 'Encore 701 résultats : précisez la recherche.'])
        && JSON.stringify(r.sentences.en) === JSON.stringify(['1 more result: refine your search.', '2 more results: refine your search.', '701 more results: refine your search.'])
        && r.english.more === '701 more results: refine your search.';
      return { pass, notes: JSON.stringify(result) };
    },
  });

  // === Valeur d'une colonne Oui / Non (Antoine, 2026-10-01 : « si la colonne est une boolean, proposer la liste déroulante oui/non avec les mots qui vont exactement
  // correspondre à la valeur stockée sur Grist (ou traduite). il faut limiter les entrées manuelles de l'utilisateur pour éviter les erreurs ») -
  // js/condition-fields.js:buildBoolList. Page sur CsDossiers, colonne Actif (Bool). ===
  const BOOL_YES = () => I18n.t('macro.modal.valueBoolYes');
  const BOOL_NO = () => I18n.t('macro.modal.valueBoolNo');
  const BOOL_UNKNOWN = () => I18n.t('macro.modal.valueUnrecognized');
  const optionValues = select => Array.from(select.options).map(o => o.value);
  // Fenêtre de condition ouverte sur une bulle dont la condition « Actif = valeur » est déjà enregistrée (une valeur écrite avant la liste, ou à la main) ;
  // `operator` : un autre opérateur que « = » (une règle écrite avant que les opérateurs sans sens soient grisés).
  async function openBoolWindow(h, value, operator) {
    const condition = { mode: 'all', rules: [{ column: 'Actif', operator: operator || '=', value }] };
    Editor.setHTML(`<p>Objet : ${badgeHtml('CsDossiers', 'Titre', ` data-condition="${JSON.stringify(condition).replace(/"/g, '&quot;')}"`)}</p>`);
    await selectBadge(h, 'CsDossiers.Titre');
    pressToolbarButton('var-condition');
    await h.sleep(60);
    return conditionModal();
  }
  // Ouvre la liste du champ Valeur et prend la ligne qui porte ce texte.
  async function pickValue(h, parts, text) {
    parts.trigger.click();
    await h.sleep(30);
    Array.from(parts.panel.querySelectorAll('.ss-option')).find(r => label(r) === text).click();
    await h.sleep(40);
  }

  cases.push({
    id: 'colsearch_value_bool_column_lists_yes_no_without_free_text_and_saves_the_word_the_comparison_reads',
    description: 'Colonne Oui / Non : le champ Valeur est la liste « Oui » / « Non » (le <select> est masqué), sans « Autre valeur… » ni champ libre ; le mot se cherche, se prend à Entrée ou au clic et s’enregistre, la comparaison le lit (Oui : ligne cochée, Non : ligne non cochée) et la réouverture montre le mot enregistré',
    run: async (h) => {
      await seed(h);
      let modal = await openConditionWindow(h);
      const ed = EditorCore.getEditor();
      await chooseColumn(h, modal, 'Actif');
      let parts = valueParts(modal);
      const yes = BOOL_YES(), no = BOOL_NO();
      const closed = {
        shown: parts.trigger.textContent, width: parts.trigger.getBoundingClientRect().width, nativeWidth: parts.select.getBoundingClientRect().width,
        placeholder: parts.trigger.classList.contains('is-placeholder'), free: !!parts.text, advanced: !!parts.advanced, options: optionValues(parts.select),
      };
      parts.trigger.click();
      await h.sleep(30);
      const all = { rows: valueRows(parts), pinned: parts.panel.querySelectorAll('.ss-option.is-pinned').length, search: inputOf(parts.panel).placeholder };
      setInput(inputOf(parts.panel), 'no');
      await h.sleep(10);
      const filtered = valueRows(parts);
      press(inputOf(parts.panel), 'Enter');
      await h.sleep(40);
      const byKeyboard = { value: parts.select.value, shown: parts.trigger.textContent, closed: parts.panel.hidden };
      const noReads = { onChecked: ConditionRules.compareValues(true, '=', parts.select.value, 'Bool'), onUnchecked: ConditionRules.compareValues(false, '=', parts.select.value, 'Bool') };
      await pickValue(h, parts, yes);
      const byMouse = { value: parts.select.value, shown: parts.trigger.textContent };
      saveButton(modal).click();
      await h.sleep(80);
      const saved = badgeNodes(ed)[0].node.attrs.condition;
      // La condition enregistrée, évaluée sur la ligne de la page (Actif coché) : « = Oui » la retient, « = Non » non, « ≠ Non » oui.
      const record = GristAPI.getCurrentRecord();
      const holds = {};
      for (const [name, rule] of [['saved', saved.rules[0]], ['no', { column: 'Actif', operator: '=', value: no }], ['notNo', { column: 'Actif', operator: '≠', value: no }]]) {
        holds[name] = await ConditionRules.conditionHolds({ mode: 'all', rules: [rule] }, 'CsDossiers', record);
      }
      await selectBadge(h, 'CsDossiers.Titre');
      pressToolbarButton('var-condition');
      await h.sleep(60);
      modal = conditionModal();
      parts = valueParts(modal);
      const reopened = { shown: parts.trigger.textContent, value: parts.select.value, options: optionValues(parts.select) };
      dismiss(modal);
      const pass = closed.shown === VALUE_CHOOSE() && closed.width > 80 && closed.nativeWidth === 0 && closed.placeholder && !closed.free && !closed.advanced
        && JSON.stringify(closed.options) === JSON.stringify(['', yes, no])
        && JSON.stringify(all.rows) === JSON.stringify([VALUE_CHOOSE(), yes, no]) && all.pinned === 0 && all.search === I18n.t('searchSelect.searchValues')
        && JSON.stringify(filtered) === JSON.stringify([no])
        && byKeyboard.value === no && byKeyboard.shown === no && byKeyboard.closed && noReads.onUnchecked === true && noReads.onChecked === false
        && byMouse.value === yes && byMouse.shown === yes
        && !!saved && saved.rules.length === 1 && saved.rules[0].column === 'Actif' && saved.rules[0].operator === '=' && saved.rules[0].value === yes
        && holds.saved === true && holds.no === false && holds.notNo === true
        && reopened.shown === yes && reopened.value === yes && JSON.stringify(reopened.options) === JSON.stringify(['', yes, no]);
      return { pass, notes: JSON.stringify({ closed, all, filtered, byKeyboard, noReads, byMouse, saved, holds, reopened }) };
    },
  });

  cases.push({
    id: 'colsearch_value_bool_keeps_a_saved_value_in_any_spelling_and_shows_one_the_comparison_cannot_read',
    description: 'Colonne Oui / Non : une valeur déjà enregistrée dans une autre graphie que la comparaison lit (« vrai », « TRUE », « 1 », « yes », « faux », « False », « 0 », « no ») s’affiche « Oui » / « Non » et reste telle quelle à l’enregistrement tant qu’on n’y touche pas ; une valeur qu’elle ne lit pas (« x ») reste visible en dernière ligne avec « valeur non reconnue », jamais effacée, et quitte la liste dès qu’on choisit Oui ou Non',
    run: async (h) => {
      await seed(h);
      const ed = EditorCore.getEditor();
      const yes = BOOL_YES(), no = BOOL_NO(), hint = BOOL_UNKNOWN();
      const savedValue = () => badgeNodes(ed)[0].node.attrs.condition.rules[0].value;
      // 1. Les graphies que la comparaison lit : le mot de la liste, et rien d'autre dans la liste.
      const spellings = [];
      for (const [value, word] of [['vrai', yes], ['TRUE', yes], ['1', yes], ['yes', yes], [' oui ', yes], ['faux', no], ['False', no], ['0', no], ['no', no]]) {
        const modal = await openBoolWindow(h, value);
        const parts = valueParts(modal);
        spellings.push({ value, word, shown: shownIn(parts.trigger), selected: parts.select.value, options: optionValues(parts.select).join('|') });
        dismiss(modal);
      }
      // 2. Enregistrée sans y toucher, la règle garde sa graphie ; en choisissant l'autre mot, elle prend le mot choisi.
      let modal = await openBoolWindow(h, 'vrai');
      saveButton(modal).click();
      await h.sleep(80);
      const untouched = savedValue();
      modal = await openBoolWindow(h, 'vrai');
      await pickValue(h, valueParts(modal), no);
      saveButton(modal).click();
      await h.sleep(80);
      const changedWord = savedValue();
      // 3. Une valeur que la comparaison ne lit pas : visible avec sa mention, en dernière ligne, jamais effacée.
      modal = await openBoolWindow(h, 'x');
      let parts = valueParts(modal);
      parts.trigger.click();
      await h.sleep(30);
      const unknown = { shown: shownIn(parts.trigger), selected: parts.select.value, rows: valueRows(parts), options: optionValues(parts.select).join('|') };
      parts.trigger.click();
      await h.sleep(10);
      saveButton(modal).click();
      await h.sleep(80);
      unknown.savedUntouched = savedValue();
      // 4. Oui choisi à la place : la valeur inconnue quitte la liste.
      modal = await openBoolWindow(h, 'x');
      parts = valueParts(modal);
      await pickValue(h, parts, yes);
      parts.trigger.click();
      await h.sleep(30);
      unknown.after = { value: parts.select.value, shown: shownIn(parts.trigger), rows: valueRows(parts), options: optionValues(parts.select).join('|') };
      parts.trigger.click();
      await h.sleep(10);
      saveButton(modal).click();
      await h.sleep(80);
      unknown.savedChosen = savedValue();
      // 5. Une valeur vide : le texte de départ ; le reste d'une autre colonne (un choix) : une valeur inconnue comme « x ».
      modal = await openBoolWindow(h, '');
      parts = valueParts(modal);
      const empty = { shown: shownIn(parts.trigger), placeholder: parts.trigger.classList.contains('is-placeholder'), options: optionValues(parts.select).join('|') };
      dismiss(modal);
      modal = await openBoolWindow(h, 'Urgent');
      parts = valueParts(modal);
      const leftover = { shown: shownIn(parts.trigger), selected: parts.select.value };
      dismiss(modal);
      const pass = spellings.every(s => s.shown === s.word && s.selected === s.word && s.options === ['', yes, no].join('|'))
        && untouched === 'vrai' && changedWord === no
        && unknown.shown === 'x (' + hint + ')' && unknown.selected === 'x' && JSON.stringify(unknown.rows) === JSON.stringify([VALUE_CHOOSE(), yes, no, 'x (' + hint + ')'])
        && unknown.options === ['', yes, no, 'x'].join('|') && unknown.savedUntouched === 'x'
        && unknown.after.value === yes && unknown.after.shown === yes && JSON.stringify(unknown.after.rows) === JSON.stringify([VALUE_CHOOSE(), yes, no])
        && unknown.after.options === ['', yes, no].join('|') && unknown.savedChosen === yes
        && empty.shown === VALUE_CHOOSE() && empty.placeholder && empty.options === ['', yes, no].join('|')
        && leftover.shown === 'Urgent (' + hint + ')' && leftover.selected === 'Urgent';
      return { pass, notes: JSON.stringify({ spellings: spellings.filter(s => !(s.shown === s.word && s.selected === s.word)), untouched, changedWord, unknown, empty, leftover }) };
    },
  });

  cases.push({
    id: 'colsearch_value_bool_list_is_greyed_by_the_empty_operators_and_is_the_same_list_in_the_macro_model',
    description: '« vide » et « non vide » grisent la liste Oui / Non (le champ visible, pas seulement le <select> masqué) et elle ne s’ouvre plus, « = » la rend, une liste reconstruite pendant « vide » reste grisée ; la règle d’un macro-modèle sur une colonne Oui / Non a la même liste (sans champ libre) et Enregistrer garde le mot choisi',
    run: async (h) => {
      await seed(h);
      const modal = await openConditionWindow(h);
      const operator = () => modal.querySelector('.macro-rule-row > select');
      const setOperator = async value => { operator().value = value; operator().dispatchEvent(new Event('change', { bubbles: true })); await h.sleep(20); };
      const state = () => {
        const p = valueParts(modal);
        return { greyed: modal.querySelector('.macro-rule-value-slot').classList.contains('is-disabled'), trigger: p.trigger.disabled, select: p.select.disabled };
      };
      await chooseColumn(h, modal, 'Actif');
      const enabled = state();
      await setOperator('vide');
      const greyed = state();
      valueParts(modal).trigger.click();
      await h.sleep(30);
      const opensWhenGreyed = !valueParts(modal).panel.hidden;
      await setOperator('non vide');
      const greyedNonEmpty = state();
      await setOperator('=');
      const back = state();
      // Colonne changée puis revenue sur Actif pendant « vide » : la liste reconstruite est grisée aussi.
      await setOperator('vide');
      await chooseColumn(h, modal, 'Titre', 20);
      await chooseColumn(h, modal, 'Actif', 20);
      const rebuilt = state();
      dismiss(modal);

      const realCached = Templates.getCached;
      const realSave = Templates.save;
      const realAlert = window.alert;
      const realError = console.error;
      let macro;
      try {
        Templates.getCached = () => MACRO_TEMPLATES;
        await openMacroWindow(h);
        changed(macroModal().querySelector('select.macro-rule-column'), 'Actif');
        await h.sleep(40);
        const parts = valueParts(macroModal());
        const closed = { shown: parts.trigger.textContent, free: !!parts.text, advanced: !!parts.advanced };
        parts.trigger.click();
        await h.sleep(30);
        const rows = valueRows(parts);
        parts.trigger.click();
        await h.sleep(10);
        await pickValue(h, parts, BOOL_NO());
        changed(ruleModelList(), '12');
        let captured = null;
        Templates.save = async (...args) => { captured = args; throw new Error('enregistrement simulé (test)'); };
        window.alert = () => {};
        console.error = () => {};
        document.getElementById('macro-editor-name').value = 'Macro de test';
        document.getElementById('macro-editor-save').click();
        await h.sleep(80);
        const slots = captured ? JSON.parse(captured[2]).slots : [];
        const conditional = slots.find(s => s.type === 'conditional');
        macro = { closed, rows, saved: conditional ? conditional.rules.map(r => ({ column: r.column, operator: r.operator, value: r.value })) : null };
      } finally {
        Templates.getCached = realCached;
        Templates.save = realSave;
        window.alert = realAlert;
        console.error = realError;
        await closeMacroWindow(h);
      }
      const pass = !enabled.greyed && enabled.trigger === false && enabled.select === false
        && greyed.greyed && greyed.trigger === true && greyed.select === true && !opensWhenGreyed
        && greyedNonEmpty.greyed && greyedNonEmpty.trigger === true && greyedNonEmpty.select === true
        && !back.greyed && back.trigger === false && back.select === false
        && rebuilt.greyed && rebuilt.trigger === true && rebuilt.select === true
        && macro.closed.shown === VALUE_CHOOSE() && !macro.closed.free && !macro.closed.advanced
        && JSON.stringify(macro.rows) === JSON.stringify([VALUE_CHOOSE(), BOOL_YES(), BOOL_NO()])
        && JSON.stringify(macro.saved) === JSON.stringify([{ column: 'Actif', operator: '=', value: BOOL_NO() }]);
      return { pass, notes: JSON.stringify({ enabled, greyed, opensWhenGreyed, greyedNonEmpty, back, rebuilt, macro }) };
    },
  });

  cases.push({
    id: 'colsearch_value_bool_words_follow_the_language_and_the_comparison_reads_them_and_the_native_list_stays_when_the_component_fails',
    description: 'Les mots de la liste Oui / Non suivent la langue de l’interface (Oui / Non, Yes / No) et sont ceux que la comparaison lit (une valeur enregistrée en français s’affiche « Yes » en anglais, le mot choisi s’enregistre dans la langue courante) ; si le composant de recherche est indisponible, le <select> natif reste (visible, mêmes mots) et la règle marche pareil',
    run: async (h) => {
      await seed(h);
      const ed = EditorCore.getEditor();
      const readWords = async lang => {
        I18n.setLang(lang);
        const modal = await openConditionWindow(h);
        await chooseColumn(h, modal, 'Actif');
        const parts = valueParts(modal);
        parts.trigger.click();
        await h.sleep(30);
        const out = { rows: valueRows(parts), choose: parts.trigger.textContent };
        parts.trigger.click();
        await h.sleep(10);
        await pickValue(h, parts, BOOL_NO());
        out.chosen = parts.select.value;
        out.reads = { yes: ConditionRules.parseBoolExpected(BOOL_YES()), no: ConditionRules.parseBoolExpected(BOOL_NO()) };
        dismiss(modal);
        return out;
      };
      let fr, en, back, french, native;
      try {
        fr = await readWords('fr');
        en = await readWords('en');
        // Enregistrée en français, la règle s'affiche dans la langue courante ; le mot choisi s'enregistre dans cette langue, et la comparaison le lit.
        const modal = await openBoolWindow(h, 'Oui');
        const parts = valueParts(modal);
        french = { shown: shownIn(parts.trigger) };
        await pickValue(h, parts, BOOL_NO());
        saveButton(modal).click();
        await h.sleep(80);
        french.saved = badgeNodes(ed)[0].node.attrs.condition.rules[0].value;
        french.readsOnUnchecked = ConditionRules.compareValues(false, '=', french.saved, 'Bool');
        back = await readWords('fr');
      } finally { I18n.setLang('fr'); }
      const realAttach = SearchSelect.attachValues;
      const warn = console.warn;
      try {
        console.warn = () => {};
        SearchSelect.attachValues = () => { throw new Error('composant indisponible (test)'); };
        const modal = await openConditionWindow(h);
        await chooseColumn(h, modal, 'Actif');
        const parts = valueParts(modal);
        const field = { native: visible(parts.select) && parts.select.getBoundingClientRect().width > 60, list: !!parts.trigger, options: optionValues(parts.select) };
        changed(parts.select, BOOL_NO());
        saveButton(modal).click();
        await h.sleep(80);
        native = { field, saved: badgeNodes(ed)[0].node.attrs.condition };
      } finally {
        SearchSelect.attachValues = realAttach;
        console.warn = warn;
      }
      const pass = JSON.stringify(fr.rows) === JSON.stringify(['— Choisir une valeur —', 'Oui', 'Non']) && fr.chosen === 'Non' && fr.reads.yes === true && fr.reads.no === false
        && JSON.stringify(en.rows) === JSON.stringify(['— Choose a value —', 'Yes', 'No']) && en.chosen === 'No' && en.reads.yes === true && en.reads.no === false
        && JSON.stringify(back) === JSON.stringify(fr)
        && french.shown === 'Yes' && french.saved === 'No' && french.readsOnUnchecked === true
        && native.field.native && !native.field.list && JSON.stringify(native.field.options) === JSON.stringify(['', 'Oui', 'Non'])
        && !!native.saved && native.saved.rules[0].column === 'Actif' && native.saved.rules[0].value === 'Non';
      return { pass, notes: JSON.stringify({ fr, en, back, french, native }) };
    },
  });

  // === Opérateurs d'une colonne Oui / Non (Antoine, 2026-10-01, carte « Griser les opérateurs sans sens d'une colonne Oui / Non ? » : « Griser ») -
  // js/condition-fields.js:syncOperatorOptions. « > » et « ≥ » retiennent TOUTES les lignes, « < », « ≤ » et « contient » aucune : ils sont grisés, jamais retirés. ===
  const OPERATORS_ALL = ['=', '≠', '>', '<', '≥', '≤', 'contient', 'vide', 'non vide'];
  const OPERATORS_WITHOUT_MEANING = ['>', '<', '≥', '≤', 'contient'];
  const OPERATORS_WITH_MEANING = ['=', '≠', 'vide', 'non vide'];
  // Le <select> des opérateurs d'une fenêtre : le seul sans classe qui propose « contient » (la fenêtre a aussi son choix « toutes / au moins une »).
  const operatorSelectOf = root => Array.from(root.querySelectorAll('select')).find(s => !s.className && Array.from(s.options).some(o => o.value === 'contient'));
  const operatorState = select => ({
    all: Array.from(select.options).map(o => o.value),
    greyed: Array.from(select.options).filter(o => o.disabled).map(o => o.value),
    value: select.value,
    shownGreyed: !!select.selectedOptions[0] && select.selectedOptions[0].disabled,
  });
  const sameList = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const operatorsAsExpected = (state, greyed) => sameList(state.all, OPERATORS_ALL) && sameList(state.greyed, greyed);

  cases.push({
    id: 'colsearch_value_bool_operators_without_meaning_are_greyed_never_removed_and_a_chosen_or_saved_one_stays',
    description: 'Colonne Oui / Non : « > », « < », « ≥ », « ≤ » et « contient » sont grisés dans la liste des opérateurs (jamais retirés : mêmes neuf lignes, même ordre), « = », « ≠ », « vide » et « non vide » restent actifs ; une autre colonne les rend tous, y compris quand on y revient ; un opérateur choisi avant de passer à une colonne Oui / Non, ou déjà enregistré, reste affiché et choisi, jamais réécrit (Enregistrer le garde) ; choisir « = » le remplace et le reste demeure grisé',
    run: async (h) => {
      await seed(h);
      const ed = EditorCore.getEditor();
      const savedRule = () => badgeNodes(ed)[0].node.attrs.condition.rules[0];
      let modal = await openConditionWindow(h);
      const operator = () => operatorSelectOf(modal);
      // 1. Colonnes : aucune, Oui / Non, texte, numérique, puis retour sur Oui / Non.
      const none = operatorState(operator());
      await chooseColumn(h, modal, 'Actif');
      const bool = operatorState(operator());
      await chooseColumn(h, modal, 'Titre');
      const text = operatorState(operator());
      await chooseColumn(h, modal, 'Montant');
      const numeric = operatorState(operator());
      await chooseColumn(h, modal, 'Actif');
      const backToBool = operatorState(operator());
      // 2. « > » choisi sur une colonne numérique reste choisi sur Oui / Non, affiché grisé ; Enregistrer le garde tel quel.
      await chooseColumn(h, modal, 'Montant');
      changed(operator(), '>');
      await h.sleep(20);
      await chooseColumn(h, modal, 'Actif');
      const kept = operatorState(operator());
      await pickValue(h, valueParts(modal), BOOL_YES());
      saveButton(modal).click();
      await h.sleep(80);
      const savedKept = savedRule();
      // 3. Une règle « Actif > Oui » enregistrée avant : la fenêtre la montre telle quelle, Enregistrer sans y toucher la garde.
      modal = await openBoolWindow(h, 'Oui', '>');
      const reopened = operatorState(operator());
      saveButton(modal).click();
      await h.sleep(80);
      const untouched = savedRule();
      // 4. « = » à la place : la règle le prend, et les cinq restent grisés.
      modal = await openBoolWindow(h, 'Oui', '>');
      changed(operator(), '=');
      await h.sleep(20);
      const replaced = operatorState(operator());
      saveButton(modal).click();
      await h.sleep(80);
      const savedReplaced = savedRule();
      // 5. Les opérateurs enregistrés qui ont un sens ne bougent pas : « ≠ » et « vide » restent choisis, jamais grisés.
      modal = await openBoolWindow(h, 'Non', '≠');
      const notEqual = operatorState(operator());
      dismiss(modal);
      modal = await openBoolWindow(h, '', 'vide');
      const empty = operatorState(operator());
      const emptyGreyedValue = modal.querySelector('.macro-rule-value-slot').classList.contains('is-disabled');
      dismiss(modal);
      const pass = operatorsAsExpected(none, []) && none.value === '='
        && operatorsAsExpected(bool, OPERATORS_WITHOUT_MEANING) && bool.value === '=' && !bool.shownGreyed && sameList(bool.all.filter(op => !bool.greyed.includes(op)), OPERATORS_WITH_MEANING)
        && operatorsAsExpected(text, []) && operatorsAsExpected(numeric, []) && operatorsAsExpected(backToBool, OPERATORS_WITHOUT_MEANING)
        && operatorsAsExpected(kept, OPERATORS_WITHOUT_MEANING) && kept.value === '>' && kept.shownGreyed
        && !!savedKept && savedKept.column === 'Actif' && savedKept.operator === '>' && savedKept.value === BOOL_YES()
        && operatorsAsExpected(reopened, OPERATORS_WITHOUT_MEANING) && reopened.value === '>' && reopened.shownGreyed
        && !!untouched && untouched.operator === '>' && untouched.value === 'Oui'
        && operatorsAsExpected(replaced, OPERATORS_WITHOUT_MEANING) && replaced.value === '=' && !replaced.shownGreyed
        && !!savedReplaced && savedReplaced.operator === '=' && savedReplaced.value === 'Oui'
        && operatorsAsExpected(notEqual, OPERATORS_WITHOUT_MEANING) && notEqual.value === '≠' && !notEqual.shownGreyed
        && operatorsAsExpected(empty, OPERATORS_WITHOUT_MEANING) && empty.value === 'vide' && !empty.shownGreyed && emptyGreyedValue;
      return { pass, notes: JSON.stringify({ none, bool, text, numeric, backToBool, kept, savedKept, reopened, untouched, replaced, savedReplaced, notEqual, empty, emptyGreyedValue }) };
    },
  });

  cases.push({
    id: 'colsearch_value_bool_operators_are_greyed_the_same_way_in_the_loop_filter_and_the_macro_model',
    description: 'Le filtre d’une boucle et la règle d’un macro-modèle (même champ que la condition d’une bulle) grisent aussi « > », « < », « ≥ », « ≤ » et « contient » sur une colonne Oui / Non, sans rien retirer ; l’opérateur déjà enregistré d’un filtre de boucle reste affiché et choisi, les autres colonnes les rendent tous',
    run: async (h) => {
      await seed(h);
      // Une colonne Oui / Non sur la table parcourue par la boucle (le seed d'un cas suivant la remet comme avant) : les colonnes d'une table viennent de ses lignes.
      window.__gristStub.setVariables('CsLignes', { Facture: 'Ref:CsFactures', Designation: 'Text', Qte: 'Numeric', Montant: 'Numeric', Presence: 'Choice', Paye: 'Bool' }, { Presence: ['Présent', 'Absent'] });
      window.__gristStub.setRows('CsLignes', [
        { id: 1, Facture: 1, Designation: 'Audit', Qte: 1, Montant: 800, Presence: 'Présent', Paye: true },
        { id: 2, Facture: 1, Designation: 'Suivi', Qte: 2, Montant: 90, Presence: 'Absent', Paye: false },
      ]);
      await GristAPI.refreshSchema();
      const loopAttrs = { repeat: 'inline', table: 'CsLignes', filter: { mode: 'all', rules: [{ column: 'Paye', operator: '>', value: 'Oui' }] }, empty: 'hide', separator: ', ', lastSeparator: ' et ' };
      Editor.setHTML(`<p>Lignes : ${loopBadgeHtml('CsLignes', 'Designation', loopAttrs)}.</p>`);
      const ed = await selectBadge(h, 'CsLignes.Designation');
      pressToolbarButton('var-loop');
      await h.sleep(100);
      const loop = loopModal();
      const loopOperator = () => operatorSelectOf(loop);
      const loopSaved = operatorState(loopOperator());
      await chooseColumn(h, loop, 'Qte');
      const loopNumeric = operatorState(loopOperator());
      await chooseColumn(h, loop, 'Paye');
      const loopBack = operatorState(loopOperator());
      saveButton(loop).click();
      await h.sleep(100);
      const loopSavedAttrs = savedLoop(ed, 'CsLignes.Designation');
      const loopRule = loopSavedAttrs && loopSavedAttrs.filter && loopSavedAttrs.filter.rules[0];

      const realCached = Templates.getCached;
      let macro;
      try {
        Templates.getCached = () => MACRO_TEMPLATES;
        await openMacroWindow(h);
        const macroOperator = () => operatorSelectOf(macroModal());
        const macroColumn = macroModal().querySelector('select.macro-rule-column');
        const macroNone = operatorState(macroOperator());
        changed(macroColumn, 'Actif');
        await h.sleep(40);
        const macroBool = operatorState(macroOperator());
        changed(macroColumn, 'Titre');
        await h.sleep(40);
        const macroText = operatorState(macroOperator());
        macro = { macroNone, macroBool, macroText };
      } finally {
        Templates.getCached = realCached;
        await closeMacroWindow(h);
      }
      const pass = operatorsAsExpected(loopSaved, OPERATORS_WITHOUT_MEANING) && loopSaved.value === '>' && loopSaved.shownGreyed
        && operatorsAsExpected(loopNumeric, []) && loopNumeric.value === '>'
        && operatorsAsExpected(loopBack, OPERATORS_WITHOUT_MEANING) && loopBack.value === '>' && loopBack.shownGreyed
        && !!loopRule && loopRule.column === 'Paye' && loopRule.operator === '>'
        && operatorsAsExpected(macro.macroNone, []) && operatorsAsExpected(macro.macroBool, OPERATORS_WITHOUT_MEANING) && macro.macroBool.value === '='
        && operatorsAsExpected(macro.macroText, []);
      return { pass, notes: JSON.stringify({ loopSaved, loopNumeric, loopBack, loopRule, macro }) };
    },
  });

  // === Les colonnes de la table en cours en tête d'une recherche de colonne (Antoine, 2026-10-01 : « prioriser dans la recherche dynamique les noms qui sont dans la
  // table en cours (et qui correspondent aux caractères tapés bien sûr) »). Les listes qui réunissent les colonnes de PLUSIEURS tables : la liste « # » du corps et des
  // champs texte (js/variables.js:currentTables / prioritizeTables), le menu « Image depuis une variable » de la barre (js/main-toolbar.js) et la liste à plat de la
  // colonne d'une règle (js/condition-fields.js:appendAllTablesOptions, déjà classée ainsi : verrouillée ici). « Table en cours » = la table de la page ; dans une zone
  // répétée par une boucle, la table parcourue passe avant elle. Chaque table garde l'ordre de ses colonnes, les autres tables celui du schéma. ===
  const acBox = () => document.getElementById('autocomplete-box');
  const acListed = () => (acBox() && acBox().style.display !== 'none' ? Array.from(acBox().querySelectorAll('.ac-item')).map(item => item.textContent) : null);
  // Tape `text` dans le paragraphe `target` du corps et rend les clés que propose la liste « # » (null = fermée), puis la ferme.
  async function hashList(h, target, text) {
    await h.focusInElement(target);
    await h.typeText(text);
    await h.sleep(70);
    const items = acListed();
    document.querySelector('.tiptap').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await h.sleep(40);
    return items;
  }
  async function emptyParagraph(h) { Editor.setHTML('<p></p>'); await h.sleep(40); return document.querySelector('.tiptap p'); }
  const keysOf = (table, columns) => columns.map(column => table + '.' + column);
  const DOSSIERS_KEYS = keysOf('CsDossiers', ['Titre', 'Statut', 'Responsable', 'Montant', 'Echeance', 'Actif']);
  const LIGNES_KEYS = keysOf('CsLignes', ['Facture', 'Designation', 'Qte', 'Montant', 'Presence']);
  const sameKeys = (got, expected) => JSON.stringify(got) === JSON.stringify(expected);
  // Ce que doit rendre la liste « # » pour `query`, par la règle écrite à part : les clés des tables de `firstTables` (dans cet ordre), puis celles de toutes les autres
  // tables dans l'ordre du schéma, chaque table gardant l'ordre de ses colonnes, sans les colonnes d'aide « gristHelper_… » et SANS limite de longueur. Les cas précédents du groupe laissent leurs tables dans le document factice : les
  // attentes littérales portent sur le début de la liste, cette règle sur tout le reste.
  function rankedKeys(query, firstTables) {
    const wanted = query.toLowerCase();
    const rank = variable => { const at = firstTables.indexOf(variable.table); return at === -1 ? firstTables.length : at; };
    return GristAPI.getAllVariables().filter(variable => variable.column.indexOf('gristHelper_') !== 0 && variable.key.toLowerCase().includes(wanted))
      .map((variable, index) => ({ key: variable.key, index, rank: rank(variable) })).sort((a, b) => a.rank - b.rank || a.index - b.index).map(entry => entry.key);
  }
  const startsWith = (got, expected) => !!got && sameKeys(got.slice(0, expected.length), expected);
  // Tables de plus, retirées ensuite (le seed d'un autre cas ne les connaît pas) ; la page revient sur CsDossiers.
  async function dropTables(h, tables) {
    const stub = window.__gristStub;
    tables.forEach(table => { stub.state.tables.splice(stub.state.tables.indexOf(table), 1); delete stub.state.columns[table]; delete stub.state.rows[table]; });
    stub.fireRecord({ id: 1, Titre: 'Dossier A', Statut: 'Urgent', Responsable: 'Dupont Jean', Montant: 1200, Echeance: 631152000, Actif: true }, 'CsDossiers');
    await GristAPI.refreshSchema();
    await h.sleep(50);
  }
  // CsGrande (60 colonnes « Zz01 »…) puis CsFin (« Zz1 » à « Zz3 »), la table de la page : la dernière du schéma, derrière plus de 50 clés d'une autre table. Aucune autre
  // colonne du document factice ne contient « zz » : la frappe « zz » ne retient que ces deux tables.
  async function withPageAtTheEnd(h, run) {
    const stub = window.__gristStub;
    const many = {};
    for (let i = 1; i <= 60; i++) many['Zz' + String(i).padStart(2, '0')] = 'Text';
    stub.setVariables('CsGrande', many);
    stub.setVariables('CsFin', { Zz1: 'Text', Zz2: 'Text', Zz3: 'Text', Statut: 'Text' });
    await GristAPI.refreshSchema();
    stub.fireRecord({ id: 1, Zz1: 'a', Zz2: 'b', Zz3: 'c', Statut: 's' }, 'CsFin');
    await h.sleep(50);
    try { return await run(); } finally { await dropTables(h, ['CsGrande', 'CsFin']); }
  }

  // Les champs texte qui ont la liste « # » : comme le navigateur à chaque frappe, la valeur posée, le curseur à la fin, l'évènement input ; la liste lue puis refermée.
  async function textFieldList(h, id, value) {
    const input = document.getElementById(id);
    input.value = value;
    input.setSelectionRange(value.length, value.length);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await h.sleep(40);
    const items = acListed();
    press(input, 'Escape');
    input.value = '';
    await h.sleep(20);
    return items;
  }
  // CsAssist : une Référence affichée par une colonne d'aide « gristHelper_DisplayParent », que Grist range dans la même table que la Référence ; retirée ensuite.
  async function withHelperTable(h, run) {
    const stub = window.__gristStub;
    stub.setVariables('CsAssist', { Nom: 'Text', Parent: 'Ref:CsAnnuaire', gristHelper_DisplayParent: 'Any' }, undefined, { Parent: 'gristHelper_DisplayParent' });
    stub.setRows('CsAssist', [{ id: 1, Nom: 'Aide A', Parent: 7, gristHelper_DisplayParent: 'Dupont Jean' }]);
    await GristAPI.refreshSchema();
    stub.fireRecord({ id: 1, Titre: 'Dossier A', Statut: 'Urgent', Responsable: 'Dupont Jean', Montant: 1200, Echeance: 631152000, Actif: true }, 'CsDossiers');
    await h.sleep(50);
    try { return await run(); } finally { await dropTables(h, ['CsAssist']); }
  }

  cases.push({
    id: 'colsearch_hash_list_puts_the_columns_of_the_page_table_first_and_never_cuts_the_list',
    description: 'Liste « # » du corps : les colonnes de la table de la page viennent en tête (sa table n’est pourtant pas la première du schéma), puis celles des autres tables dans l’ordre du schéma, avec ce qui est tapé comme sans ; la liste n’a aucune limite (la table de la page, dernière du schéma derrière 60 colonnes d’une autre table, ouvre la liste et les 63 clés y sont toutes : un document de beaucoup de tables et de colonnes se retrouve en tapant le nom)',
    run: async (h) => {
      await seed(h);
      const schema = GristAPI.getTables().slice();
      const page = GristAPI.getCurrentTableId();
      const all = await hashList(h, await emptyParagraph(h), '#');
      const typed = await hashList(h, await emptyParagraph(h), '#re');
      const capped = await withPageAtTheEnd(h, async () => hashList(h, await emptyParagraph(h), '#zz'));
      const pass = page === 'CsDossiers' && schema.indexOf(page) > 0
        && startsWith(all, DOSSIERS_KEYS.concat('CsAnnuaire.NomPrenom')) && sameKeys(all, rankedKeys('', [page]))
        && startsWith(typed, ['CsDossiers.Titre', 'CsDossiers.Responsable', 'CsAnnuaire.NomPrenom']) && sameKeys(typed, rankedKeys('re', [page]))
        && !!capped && capped.length === 63 && startsWith(capped, ['CsFin.Zz1', 'CsFin.Zz2', 'CsFin.Zz3', 'CsGrande.Zz01']) && capped[62] === 'CsGrande.Zz60';
      return { pass, notes: JSON.stringify({ page, schema, all: all && all.length, typed, expectedAll: rankedKeys('', [page]).length, expectedTyped: rankedKeys('re', [page]), capped: capped && capped.slice(0, 5).concat(['…', capped[capped.length - 1], capped.length]) }) };
    },
  });

  cases.push({
    id: 'colsearch_hash_list_in_a_repeated_zone_puts_the_looped_table_then_the_page_table_then_the_others',
    description: 'Liste « # » dans une zone répétée par une boucle (une ligne de tableau sur CsLignes) : les colonnes de la table parcourue d’abord, puis celles de la table de la page, puis les autres tables dans l’ordre du schéma, avec ce qui est tapé comme sans ; hors de la zone, la table de la page ouvre la liste',
    run: async (h) => {
      await seed(h);
      const zone = async () => {
        Editor.setHTML('<table><tbody>'
          + '<tr><th><p>Désignation</p></th><th><p>Qté</p></th></tr>'
          + `<tr><td><p>${loopBadgeHtml('CsLignes', 'Designation', { repeat: 'row', table: 'CsLignes', empty: 'header' })}</p></td><td><p></p></td></tr>`
          + '</tbody></table><p>Fin</p>');
        await h.sleep(60);
        return document.querySelectorAll('.tiptap tr')[1].children[1].querySelector('p');
      };
      const inRow = await hashList(h, await zone(), '#');
      const inRowTyped = await hashList(h, await zone(), '#re');
      // Espace avant # : @tiptap/suggestion n'ouvre la liste qu'en début de ligne ou après une espace.
      await zone();
      const outside = await hashList(h, document.querySelector('.tiptap > p:last-child'), ' #');
      const pass = startsWith(inRow, LIGNES_KEYS.concat(DOSSIERS_KEYS, 'CsAnnuaire.NomPrenom')) && sameKeys(inRow, rankedKeys('', ['CsLignes', 'CsDossiers']))
        && startsWith(inRowTyped, ['CsLignes.Facture', 'CsLignes.Presence', 'CsDossiers.Titre', 'CsDossiers.Responsable', 'CsAnnuaire.NomPrenom']) && sameKeys(inRowTyped, rankedKeys('re', ['CsLignes', 'CsDossiers']))
        && startsWith(outside, DOSSIERS_KEYS.concat('CsAnnuaire.NomPrenom')) && sameKeys(outside, rankedKeys('', ['CsDossiers']));
      return { pass, notes: JSON.stringify({ inRow, inRowTyped, outside, expected: rankedKeys('re', ['CsLignes', 'CsDossiers']) }) };
    },
  });

  cases.push({
    id: 'colsearch_text_fields_hash_list_puts_the_columns_of_the_page_table_first_and_never_cuts_the_list',
    description: 'Les champs texte qui ont la liste « # » (Nom de fichier PDF, À du mode email) : même classement que le corps — la table de la page d’abord, les autres dans l’ordre du schéma, et aucune limite de longueur ; une saisie « Table.Colonne. » (colonnes de la ligne qu’une Référence désigne) reste la liste de cette seule table',
    run: async (h) => {
      await seed(h);
      const textList = (id, value) => textFieldList(h, id, value);
      const pdf = await textList('pdf-filename-template', 'Suivi_#');
      const to = await textList('v2-email-to', '#re');
      const path = await textList('pdf-filename-template', '#CsDossiers.Responsable.');
      const capped = await withPageAtTheEnd(h, () => textList('pdf-filename-template', '#zz'));
      const pass = startsWith(pdf, DOSSIERS_KEYS.concat('CsAnnuaire.NomPrenom')) && sameKeys(pdf, rankedKeys('', ['CsDossiers']))
        && startsWith(to, ['CsDossiers.Titre', 'CsDossiers.Responsable', 'CsAnnuaire.NomPrenom']) && sameKeys(to, rankedKeys('re', ['CsDossiers']))
        && sameKeys(path, keysOf('CsDossiers', ['Responsable.NomPrenom', 'Responsable.Telephone', 'Responsable.Naissance']))
        && !!capped && capped.length === 63 && startsWith(capped, ['CsFin.Zz1', 'CsFin.Zz2', 'CsFin.Zz3', 'CsGrande.Zz01']) && capped[62] === 'CsGrande.Zz60';
      return { pass, notes: JSON.stringify({ pdf: pdf && pdf.length, to, path, capped: capped && capped.slice(0, 5).concat(['…', capped[capped.length - 1], capped.length]) }) };
    },
  });

  cases.push({
    id: 'colsearch_hash_list_leaves_out_the_helper_columns',
    description: 'Liste « # » du corps et des champs texte : les colonnes d’aide « gristHelper_… » que Grist crée derrière chaque Référence (le texte affiché, rangé dans la même table) ne sont jamais proposées, quelle que soit la saisie - comme dans tous les autres choix de colonne - alors que les autres colonnes de leur table le sont ; une clé tapée à la main se résout encore',
    run: async (h) => {
      await seed(h);
      const found = await withHelperTable(h, async () => ({
        inSchema: GristAPI.getColumns('CsAssist').slice(),
        all: await hashList(h, await emptyParagraph(h), '#'),
        typed: await hashList(h, await emptyParagraph(h), '#assist'),
        helperOnly: await hashList(h, await emptyParagraph(h), '#gristhelper'),
        pdf: await textFieldList(h, 'pdf-filename-template', '#assist'),
        pdfHelper: await textFieldList(h, 'pdf-filename-template', '#DisplayParent'),
        resolved: Variables.findTextVariables('Nom : #CsAssist.gristHelper_DisplayParent').length,
      }));
      const helpers = list => (list || []).filter(key => key.indexOf('gristHelper_') !== -1);
      const pass = found.inSchema.indexOf('gristHelper_DisplayParent') !== -1
        && !!found.all && helpers(found.all).length === 0 && found.all.indexOf('CsAssist.Nom') !== -1 && found.all.indexOf('CsAssist.Parent') !== -1
        && sameKeys(found.typed, ['CsAssist.Nom', 'CsAssist.Parent']) && found.helperOnly === null
        && sameKeys(found.pdf, ['CsAssist.Nom', 'CsAssist.Parent']) && found.pdfHelper === null && found.resolved === 1;
      return { pass, notes: JSON.stringify({ inSchema: found.inSchema, helpersInAll: helpers(found.all), typed: found.typed, helperOnly: found.helperOnly, pdf: found.pdf, pdfHelper: found.pdfHelper, resolved: found.resolved }) };
    },
  });

  cases.push({
    id: 'colsearch_hash_list_search_ignores_accents_and_case',
    description: 'Liste « # » du corps et des champs texte : la recherche par nom ne tient compte ni des accents ni de la casse (« télé », « TÉLÉ » et « tele » retrouvent Telephone ; « échéance » retrouve Echeance - les identifiants de Grist n’ont jamais d’accent), après le point d’une Référence comme avant',
    run: async (h) => {
      await seed(h);
      const page = GristAPI.getCurrentTableId();
      const plain = await hashList(h, await emptyParagraph(h), '#tele');
      const accented = await hashList(h, await emptyParagraph(h), '#télé');
      const upper = await hashList(h, await emptyParagraph(h), '#TÉLÉ');
      const echeance = await hashList(h, await emptyParagraph(h), '#échéance');
      const field = await textFieldList(h, 'pdf-filename-template', '#télé');
      const path = await textFieldList(h, 'pdf-filename-template', '#CsDossiers.Responsable.télé');
      const pass = !!plain && plain.indexOf('CsAnnuaire.Telephone') !== -1 && sameKeys(plain, rankedKeys('tele', [page]))
        && sameKeys(accented, plain) && sameKeys(upper, plain)
        && sameKeys(echeance, rankedKeys('echeance', [page])) && echeance.indexOf('CsDossiers.Echeance') !== -1
        && sameKeys(field, rankedKeys('tele', ['CsDossiers'])) && sameKeys(path, ['CsDossiers.Responsable.Telephone']);
      return { pass, notes: JSON.stringify({ plain, accented, upper, echeance, field, path }) };
    },
  });

  cases.push({
    id: 'colsearch_a_table_that_cannot_be_read_keeps_its_columns_in_every_list',
    description: 'Les colonnes exactes viennent d’un fetchTable par table (js/grist-api.js:exactColumnsByTable) : quand la lecture d’UNE table échoue (accès, délai, très gros document), elle garde les colonnes déjà connues au lieu de disparaître de la liste « # » et de tous les choix de colonne - seul un avertissement part dans la console',
    run: async (h) => {
      await seed(h);
      const before = GristAPI.getColumns('CsAnnuaire').slice();
      const tablesBefore = GristAPI.getAllVariables().length;
      const original = grist.docApi.fetchTable;
      let after, tablesAfter, listed;
      grist.docApi.fetchTable = async tableId => {
        if (tableId === 'CsAnnuaire') throw new Error('lecture impossible (simulée)');
        return original.call(grist.docApi, tableId);
      };
      try {
        await GristAPI.refreshSchema();
        after = GristAPI.getColumns('CsAnnuaire').slice();
        tablesAfter = GristAPI.getAllVariables().length;
        listed = await hashList(h, await emptyParagraph(h), '#annuaire');
      } finally {
        grist.docApi.fetchTable = original;
        await GristAPI.refreshSchema();
      }
      const pass = before.length === 3 && sameKeys(after, before) && tablesAfter === tablesBefore && sameKeys(listed, keysOf('CsAnnuaire', before));
      return { pass, notes: JSON.stringify({ before, after, tablesBefore, tablesAfter, listed }) };
    },
  });

  cases.push({
    id: 'colsearch_image_menu_puts_the_attachment_columns_of_the_page_table_first_and_those_of_the_repeated_zone_before_them',
    description: 'Menu « Image depuis une variable » : les colonnes Pièces jointes de la table de la page en tête (sa table vient pourtant après CsPieces dans le schéma), les autres dans l’ordre du schéma, avec ce qui est tapé comme sans ; dans une zone répétée par une boucle, celles de la table parcourue passent avant elles',
    run: async (h) => {
      const stub = window.__gristStub;
      const ed = await seedImages(h);
      stub.setVariables('CsAlbums', { Titre: 'Text', Couverture: 'Attachments' });
      await GristAPI.refreshSchema();
      stub.fireRecord({ id: 1, Nom: 'Siège', Logo: null }, 'CsSites');
      await h.sleep(50);
      let out;
      try {
        const rowsAfterOpening = async (typed) => {
          const panel = await openImagePicker(h);
          if (!panel) return null;
          if (typed) { setInput(inputOf(panel), typed); await h.sleep(20); }
          const rows = rowsOf(panel);
          press(inputOf(panel), 'Escape');
          await h.sleep(60);
          return rows;
        };
        const inText = await rowsAfterOpening();
        const inTextTyped = await rowsAfterOpening('o');
        // Le curseur dans la zone : une ligne de tableau répétée sur CsAlbums.
        Editor.setHTML('<table><tbody>'
          + '<tr><th><p>Titre</p></th><th><p>Image</p></th></tr>'
          + `<tr><td><p>${loopBadgeHtml('CsAlbums', 'Titre', { repeat: 'row', table: 'CsAlbums', empty: 'header' })}</p></td><td><p></p></td></tr>`
          + '</tbody></table><p>Fin</p>');
        await h.sleep(60);
        await h.focusInElement(document.querySelectorAll('.tiptap tr')[1].children[1].querySelector('p'));
        const inZone = await rowsAfterOpening();
        out = { page: GristAPI.getCurrentTableId(), schema: GristAPI.getTables().slice(-3), inText, inTextTyped, inZone, images: imageNodes(ed).length };
      } finally { await dropTables(h, ['CsAlbums']); }
      const pass = out.page === 'CsSites'
        && sameKeys(out.inText, ['CsSites.Logo', 'CsPieces.Photo', 'CsPieces.Plan', 'CsAlbums.Couverture'])
        && sameKeys(out.inTextTyped, ['CsSites.Logo', 'CsPieces.Photo', 'CsAlbums.Couverture'])
        && sameKeys(out.inZone, ['CsAlbums.Couverture', 'CsSites.Logo', 'CsPieces.Photo', 'CsPieces.Plan']) && out.images === 0;
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'colsearch_rule_column_search_keeps_the_columns_of_the_page_table_first_in_the_condition_and_the_macro_model',
    description: 'La liste à plat de la colonne d’une règle (condition d’une bulle, macro-modèle) garde les colonnes de la table de la page (nom nu) avant celles des autres tables (« Table.Colonne ») quand on tape : « date » trouve Echeance (la page) avant CsAnnuaire.Naissance, dont la table est pourtant la première du schéma',
    run: async (h) => {
      await seed(h);
      const advanced = I18n.t('macro.modal.columnAdvanced');
      const date = hintOf('macro.modal.typeDate');
      const found = async trigger => ({
        date: (await searchList(h, trigger, 'date', 'Escape')).filter(row => row !== advanced),
        mont: (await searchList(h, trigger, 'mont', 'Escape')).filter(row => row !== advanced),
      });
      const modal = await openConditionWindow(h);
      const condition = await found(triggerIn(modal));
      dismiss(modal);
      await h.sleep(30);
      let macro;
      try {
        await openMacroWindow(h);
        macro = await found(macroColumnTrigger());
      } finally {
        await closeMacroWindow(h);
      }
      const expected = {
        date: ['Echeance' + date, 'CsAnnuaire.Naissance' + date],
        mont: ['Montant' + hintOf('macro.modal.typeNumeric'), 'CsLignes.Montant' + hintOf('macro.modal.typeNumeric')],
      };
      const pass = sameKeys(condition, expected) && sameKeys(macro, expected) && GristAPI.getTables().indexOf('CsAnnuaire') < GristAPI.getTables().indexOf('CsDossiers');
      return { pass, notes: JSON.stringify({ condition, macro }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.columnSearch = cases;
})();
