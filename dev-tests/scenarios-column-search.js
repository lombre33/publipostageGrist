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

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.columnSearch = cases;
})();
