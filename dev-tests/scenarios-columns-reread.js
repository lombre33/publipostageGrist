// Suite "columnsReread" - consigne 093 de GFS (retour du porteur du 19/11 : « la liste des colonnes ne liste pas une colonne booléenne, pourtant dans la table », et sur une autre « ça devrait par
// défaut proposer vrai/faux ») : l'app reste ouverte à côté de Grist, la personne y ajoute une colonne ou passe une colonne vide en case à cocher, puis revient à sa condition. Les fenêtres qui listent
// des colonnes (js/condition-fields.js : buildRuleRow, buildTemplateRule, appendColumnOption) relisent donc les colonnes et leurs types à l'ouverture, par une relecture LÉGÈRE des métadonnées
// (js/grist-api.js:refreshColumnMeta : listTables, _grist_Tables, _grist_Tables_column, _grist_DocInfo - jamais les tables de la personne) ; la fenêtre s'ouvre tout de suite et se retrace
// (ConditionFields.refreshColumnsOnOpen) quand la relecture finit si quelque chose a changé - sans toucher à ce que la personne a déjà choisi, ni au focus, et sans rien faire quand rien n'a changé.
//  1) « Condition de la case » liste la colonne ajoutée et la colonne retypée avec « (case à cocher) », leur champ Valeur propose Oui / Non, aucune table de la personne n'est relue ;
//  2) un document inchangé : la fenêtre n'est pas retracée (aucune mutation de sa liste), aucune table relue ; 3) Grist lent : la fenêtre s'ouvre à l'heure, puis se retrace sans perdre la colonne
//  choisie, la valeur tapée, le focus ni le curseur ; 4) une colonne qu'une règle d'accès cache n'est pas ajoutée, une colonne retirée part, la colonne ajoutée prend sa place ;
//  5) les autres fenêtres (mise en forme conditionnelle, boucle, tableau croisé, macro-modèle) listent aussi la colonne ajoutée.
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const ed = () => EditorCore.getEditor();

  const TABLE = 'RcDossiers';
  const LINES = 'RcLignes';
  const BASE = { Titre: 'Text', Statut: 'Text', Montant: 'Numeric', Urgent: 'Bool', Ancienne_vide: 'Any' };
  // Ce que Grist a après les gestes de la personne : une colonne vide passée en case à cocher, une colonne case à cocher ajoutée.
  const AFTER = Object.assign({}, BASE, { Ancienne_vide: 'Bool', Signature_tardive: 'Bool' });
  const RECORD = { id: 1, Titre: 'Dossier A', Statut: 'Urgent', Montant: 1200, Urgent: true, Ancienne_vide: null };
  const BOX = '<span class="conditional-checkbox" data-checkbox-style="classic">☐</span>';
  const badge = (table, column) => `<span class="var-badge" data-table="${table}" data-column="${column}" data-key="${table}.${column}"></span>`;

  async function seed(h, extra) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setLatency(0);
    stub.setVariables(TABLE, Object.assign({}, BASE, extra));
    stub.setVariables(LINES, { Dossier: 'Ref:' + TABLE, Designation: 'Text', Qte: 'Numeric' });
    stub.setRows(TABLE, [Object.assign({}, RECORD)]);
    stub.setRows(LINES, [{ id: 1, Dossier: 1, Designation: 'Audit', Qte: 1 }]);
    await GristAPI.refreshSchema();
    await GristAPI.deleteLinkRule(LINES);
    await GristAPI.saveLinkRule(LINES, { mode: 'match', colonneCible: 'Dossier', colonneSource: 'id' });
    await GristAPI.refreshSchema();
    stub.fireRecord(Object.assign({}, RECORD), TABLE);
    await h.sleep(50);
  }
  // Ce que la personne fait dans Grist pendant que l'app reste ouverte : les métadonnées changent, l'app n'en sait rien (aucun refreshSchema ici).
  const changeInGrist = columns => window.__gristStub.setVariables(TABLE, Object.assign({}, columns));
  async function waitFor(test, limit) {
    const end = Date.now() + (limit || 2500);
    while (Date.now() < end) { if (test()) return true; await sleep(20); }
    return !!test();
  }
  // Les lectures de tables que l'app demande à Grist : seules celles de la personne (« Rc… ») disent qu'une table a été relue en entier.
  function trackReads() {
    const reads = [];
    const original = grist.docApi.fetchTable;
    grist.docApi.fetchTable = function (tableId) { reads.push(String(tableId)); return original.apply(this, arguments); };
    return { reads, stop: () => { grist.docApi.fetchTable = original; }, tables: () => reads.filter(name => name.indexOf('Rc') === 0), meta: () => reads.filter(name => name.indexOf('_grist_') === 0) };
  }
  const optionsOf = select => Array.from(select.options).filter(o => o.value).map(o => ({ value: o.value, hint: o.dataset.hint || '' }));
  const hintOf = (select, name) => { const found = optionsOf(select).find(o => o.value === name); return found ? found.hint : null; };
  const visible = el => !!el && el.style.display !== 'none' && !el.hidden && el.getClientRects().length > 0;
  function setInput(input, value) { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); }
  const failedOf = checks => Object.keys(checks).filter(k => !checks[k]);

  function toolbar() { return document.querySelector('.v2-varfmt-toolbar'); }
  function pressToolbarButton(action) { toolbar().querySelector(`button[data-action="${action}"]`).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); }
  function nodePos(name, index) {
    const found = [];
    ed().state.doc.descendants((node, pos) => { if (node.type.name === name) found.push(pos); });
    return found[index || 0];
  }
  async function selectNode(h, name) {
    document.querySelector('.tiptap').focus();
    ed().commands.setNodeSelection(nodePos(name));
    await h.sleep(140);
  }
  // Colonne choisie comme une personne, dans le champ avec recherche (cf. suite varCondition).
  async function pickColumn(h, row, name) {
    row.querySelector('.macro-rule-column-wrap .ss-trigger').click();
    await h.sleep(30);
    const input = row.querySelector('.macro-rule-column-wrap .ss-panel .ss-input');
    setInput(input, name);
    await h.sleep(10);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await h.sleep(40);
  }
  // Ferme ce qui est ouvert, sans rien enregistrer.
  function closeWindows() {
    document.querySelectorAll('.pp-modal').forEach(overlay => {
      if (overlay.style.display === 'none') return;
      const cancel = overlay.querySelector('.var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)');
      if (cancel) cancel.click();
    });
    const macro = document.getElementById('macro-editor-modal');
    if (macro) macro.style.display = 'none';
  }

  const conditionModal = () => document.getElementById('var-condition-modal');
  async function openCheckboxWindow(h) {
    ed().commands.setContent(`<p>Pièce ${BOX} fournie</p>`);
    await h.sleep(60);
    await selectNode(h, 'conditionalCheckbox');
    pressToolbarButton('var-condition');
    await h.sleep(80);
    return conditionModal();
  }
  const firstColumnSelect = modal => modal.querySelector('.macro-rule-row select.macro-rule-column');
  // Le champ Valeur de la ligne : Oui / Non (une liste) ou une saisie libre (un champ texte).
  function valueFieldOf(row) {
    const field = row.querySelector('.macro-rule-value');
    return field ? { tag: field.tagName, words: field.tagName === 'SELECT' ? Array.from(field.options).map(o => o.value) : [] } : null;
  }

  cases.push({
    id: 'colsreread_checkbox_window_lists_a_column_added_and_a_column_retyped_in_grist_after_the_app_opened',
    description: 'Le cas de la consigne 093 : dans Grist, une colonne vide passe en case à cocher et une colonne case à cocher est ajoutée pendant que l\'app est ouverte ; « Condition de la case », ouverte ensuite, les liste toutes les deux (et « Urgent » déjà connue) avec « (case à cocher) » et le champ Valeur de chacune propose Oui / Non ; aucune table de la personne n\'est relue, seules les métadonnées le sont',
    run: async (h) => {
      await seed(h);
      const spy = trackReads();
      try {
        changeInGrist(AFTER);
        // Grist renvoie la fiche courante avec les colonnes d'aujourd'hui (la colonne ajoutée y figure) : sans cela, la ligne d'indication dirait « pas transmise au widget » pour elle
        // (js/condition-fields.js:columnFacts, un texte qui existait avant la 093 et ne dépend pas de la liste des colonnes).
        window.__gristStub.fireRecord(Object.assign({}, RECORD, { Ancienne_vide: false, Signature_tardive: false }), TABLE);
        await h.sleep(30);
        const modal = await openCheckboxWindow(h);
        const settled = await waitFor(() => !!firstColumnSelect(modal) && hintOf(firstColumnSelect(modal), 'Signature_tardive') !== null);
        const select = firstColumnSelect(modal);
        const typeBool = I18n.t('macro.modal.typeBool');
        const listed = { Urgent: hintOf(select, 'Urgent'), Ancienne_vide: hintOf(select, 'Ancienne_vide'), Signature_tardive: hintOf(select, 'Signature_tardive'), Statut: hintOf(select, 'Statut') };
        const values = {};
        for (const column of ['Signature_tardive', 'Ancienne_vide', 'Urgent']) {
          await pickColumn(h, modal.querySelector('.macro-rule-row'), column);
          const row = modal.querySelector('.macro-rule-row');
          values[column] = { chosen: row.querySelector('select.macro-rule-column').value, field: valueFieldOf(row), hint: row.querySelector('.macro-rule-column-type').textContent };
        }
        const yesNo = ['', I18n.t('macro.modal.valueBoolYes'), I18n.t('macro.modal.valueBoolNo')];
        const checks = {
          listedAfterOpen: settled,
          addedColumnHasHint: listed.Signature_tardive === typeBool,
          retypedColumnHasHint: listed.Ancienne_vide === typeBool,
          alreadyBoolColumnKeepsItsHint: listed.Urgent === typeBool,
          textColumnHasNone: listed.Statut === '',
          addedValueIsYesNo: values.Signature_tardive.chosen === 'Signature_tardive' && values.Signature_tardive.field && values.Signature_tardive.field.tag === 'SELECT' && JSON.stringify(values.Signature_tardive.field.words) === JSON.stringify(yesNo),
          retypedValueIsYesNo: values.Ancienne_vide.chosen === 'Ancienne_vide' && values.Ancienne_vide.field && values.Ancienne_vide.field.tag === 'SELECT' && JSON.stringify(values.Ancienne_vide.field.words) === JSON.stringify(yesNo),
          typeLineSaysBool: values.Signature_tardive.hint === typeBool && values.Ancienne_vide.hint === typeBool,
          metadataRead: spy.meta().length > 0,
          noTableOfThePersonRead: spy.tables().length === 0,
        };
        const failed = failedOf(checks);
        return { pass: failed.length === 0, notes: JSON.stringify({ failed, listed, values, reads: spy.reads.slice(0, 12) }) };
      } finally {
        spy.stop();
        closeWindows();
      }
    },
  });

  cases.push({
    id: 'colsreread_unchanged_document_opens_without_a_redraw_and_without_reading_any_table',
    description: 'Un document dont les colonnes n\'ont pas changé : « Condition de la case » ne se retrace pas après l\'ouverture (aucune mutation de la liste des règles, la ligne et son champ restent les mêmes éléments : rien ne clignote) et aucune table de la personne n\'est relue',
    run: async (h) => {
      await seed(h);
      const spy = trackReads();
      let observer = null;
      try {
        const modal = await openCheckboxWindow(h);
        const rulesBox = modal.querySelector('.var-condition-rules');
        const rowBefore = modal.querySelector('.macro-rule-row');
        const selectBefore = firstColumnSelect(modal);
        let mutations = 0;
        observer = new MutationObserver(list => { mutations += list.length; });
        observer.observe(rulesBox, { childList: true, subtree: true });
        await sleep(400);
        const checks = {
          windowOpen: visible(modal),
          noMutation: mutations === 0,
          sameRow: modal.querySelector('.macro-rule-row') === rowBefore,
          sameColumnField: firstColumnSelect(modal) === selectBefore,
          columnsListed: optionsOf(selectBefore).length >= 5,
          noTableOfThePersonRead: spy.tables().length === 0,
        };
        const failed = failedOf(checks);
        return { pass: failed.length === 0, notes: JSON.stringify({ failed, mutations, reads: spy.reads.slice(0, 12) }) };
      } finally {
        if (observer) observer.disconnect();
        spy.stop();
        closeWindows();
      }
    },
  });

  cases.push({
    id: 'colsreread_slow_grist_rebuilds_the_window_when_the_reread_ends_and_keeps_what_was_chosen',
    description: 'Grist lent (une relecture de 240 ms) : la fenêtre s\'ouvre sans attendre, la personne y choisit une colonne et tape une valeur ; quand la relecture finit, la liste montre la colonne ajoutée, la règle garde sa colonne et sa valeur, et le focus et le curseur restent dans le champ de la valeur',
    run: async (h) => {
      await seed(h);
      const stub = window.__gristStub;
      try {
        changeInGrist(AFTER);
        stub.setLatency({ fetchTable: 240, applyUserActions: 0 });
        const opened = Date.now();
        const modal = await openCheckboxWindow(h);
        const openedInTime = Date.now() - opened < 600 && visible(modal);
        const beforeEnd = firstColumnSelect(modal) && hintOf(firstColumnSelect(modal), 'Signature_tardive') === null;
        await pickColumn(h, modal.querySelector('.macro-rule-row'), 'Statut');
        const oldInput = modal.querySelector('.macro-rule-row .macro-rule-value');
        setInput(oldInput, 'Urgent');
        oldInput.focus();
        oldInput.setSelectionRange(2, 4);
        const rebuilt = await waitFor(() => !!firstColumnSelect(modal) && hintOf(firstColumnSelect(modal), 'Signature_tardive') !== null, 4000);
        await sleep(60);
        const row = modal.querySelector('.macro-rule-row');
        const input = row.querySelector('.macro-rule-value');
        const kept = { column: row.querySelector('select.macro-rule-column').value, value: input ? input.value : null, count: modal.querySelectorAll('.macro-rule-row').length };
        const checks = {
          openedWithoutWaiting: openedInTime,
          notYetListedBeforeTheEnd: !!beforeEnd,
          listedAfterTheEnd: rebuilt,
          rowWasRebuilt: !!oldInput && !oldInput.isConnected && !!input && input !== oldInput,
          columnKept: kept.column === 'Statut',
          valueKept: kept.value === 'Urgent' && kept.count === 1,
          focusKept: document.activeElement === input,
          caretKept: !!input && input.selectionStart === 2 && input.selectionEnd === 4,
        };
        const failed = failedOf(checks);
        return { pass: failed.length === 0, notes: JSON.stringify({ failed, kept, openMs: Date.now() - opened }) };
      } finally {
        stub.setLatency(0);
        closeWindows();
      }
    },
  });

  cases.push({
    id: 'colsreread_a_column_hidden_by_an_access_rule_is_not_added_a_removed_column_goes_and_the_new_one_takes_its_place',
    description: 'La relecture légère ne remplace pas par du provisoire les listes que fetchTable a rendues : une colonne qu\'une règle d\'accès cache (dans les métadonnées, pas dans fetchTable) n\'est jamais ajoutée, une colonne que Grist a retirée disparaît, la colonne ajoutée prend sa place dans l\'ordre de Grist ; une seconde relecture, sans rien de nouveau, rend faux',
    run: async (h) => {
      await seed(h, { Secret: 'Text' });
      const stub = window.__gristStub;
      // Grist rend Secret aux métadonnées mais pas à fetchTable (règle d'accès sur la colonne) : la passe complète ne la liste pas.
      delete stub.state.rows[TABLE].Secret;
      await GristAPI.refreshSchema();
      const before = GristAPI.getVisibleColumns(TABLE).slice();
      const hiddenBefore = GristAPI.getColumnType(TABLE, 'Secret');
      // Dans Grist : Montant retirée, Signature_tardive ajoutée juste après Statut.
      stub.setVariables(TABLE, { Titre: 'Text', Statut: 'Text', Signature_tardive: 'Bool', Urgent: 'Bool', Ancienne_vide: 'Bool', Secret: 'Text' });
      const changed = await GristAPI.refreshColumnMeta();
      const after = GristAPI.getVisibleColumns(TABLE).slice();
      const again = await GristAPI.refreshColumnMeta();
      const checks = {
        hiddenColumnWasNotListed: before.indexOf('Secret') === -1 && hiddenBefore === 'Text',
        changedSaysTrue: changed === true,
        newColumnListed: after.indexOf('Signature_tardive') !== -1,
        newColumnTypeKnown: GristAPI.getColumnType(TABLE, 'Signature_tardive') === 'Bool',
        newColumnAfterItsPredecessor: after.indexOf('Signature_tardive') === after.indexOf('Statut') + 1,
        retypedColumnKnown: GristAPI.getColumnType(TABLE, 'Ancienne_vide') === 'Bool',
        hiddenColumnStillNotListed: after.indexOf('Secret') === -1,
        removedColumnGone: after.indexOf('Montant') === -1,
        otherColumnsKept: ['Titre', 'Statut', 'Urgent', 'Ancienne_vide'].every(c => after.indexOf(c) !== -1),
        nothingNewSaysFalse: again === false,
        tablesStillListed: GristAPI.getTables().indexOf(TABLE) !== -1 && GristAPI.getTables().indexOf(LINES) !== -1,
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, before, after }) };
    },
  });

  cases.push({
    id: 'colsreread_a_table_added_in_grist_is_known_with_its_columns_after_the_reread',
    description: 'Une table ajoutée dans Grist pendant que l\'app est ouverte est connue, avec ses colonnes et leurs types, après la relecture légère ; ses lignes ne sont pas lues',
    run: async (h) => {
      await seed(h);
      const spy = trackReads();
      try {
        window.__gristStub.setVariables('RcNouvelle', { Nom: 'Text', Actif: 'Bool' });
        const changed = await GristAPI.refreshColumnMeta();
        const checks = {
          changedSaysTrue: changed === true,
          tableListed: GristAPI.getTables().indexOf('RcNouvelle') !== -1,
          columnsListed: JSON.stringify(GristAPI.getVisibleColumns('RcNouvelle')) === JSON.stringify(['Nom', 'Actif']),
          typesKnown: GristAPI.getColumnType('RcNouvelle', 'Actif') === 'Bool',
          rowsNotRead: spy.tables().length === 0,
        };
        const failed = failedOf(checks);
        return { pass: failed.length === 0, notes: JSON.stringify({ failed, tables: GristAPI.getTables() }) };
      } finally {
        spy.stop();
      }
    },
  });

  // === Les autres fenêtres qui listent des colonnes ===
  cases.push({
    id: 'colsreread_conditional_style_window_lists_the_added_column',
    description: 'La fenêtre de mise en forme conditionnelle (js/conditional-style-window.js), ouverte après l\'ajout d\'une colonne dans Grist, la liste avec « (case à cocher) » dans la condition de sa carte ouverte',
    run: async (h) => {
      await seed(h);
      try {
        Editor.setHTML(`<p>${badge(TABLE, 'Montant')}</p>`);
        await h.sleep(60);
        changeInGrist(AFTER);
        await selectNode(h, 'varBadge');
        pressToolbarButton('var-style');
        await h.sleep(150);
        const modal = document.getElementById('cond-style-modal');
        const select = () => modal.querySelector('.cond-style-card.is-open select.macro-rule-column');
        const settled = await waitFor(() => !!select() && hintOf(select(), 'Signature_tardive') !== null);
        const checks = { opened: visible(modal), listed: settled, hint: !!select() && hintOf(select(), 'Signature_tardive') === I18n.t('macro.modal.typeBool'), retyped: !!select() && hintOf(select(), 'Ancienne_vide') === I18n.t('macro.modal.typeBool') };
        const failed = failedOf(checks);
        return { pass: failed.length === 0, notes: JSON.stringify({ failed }) };
      } finally {
        closeWindows();
      }
    },
  });

  cases.push({
    id: 'colsreread_loop_window_lists_the_added_column_in_its_sort_list',
    description: 'La fenêtre Boucle (js/variable-loop.js), ouverte après l\'ajout d\'une colonne dans Grist, la propose dans la liste du tri avec son type',
    run: async (h) => {
      await seed(h);
      try {
        Editor.setHTML('<table><tbody><tr><th><p>Dossier</p></th></tr><tr><td><p>' + badge(TABLE, 'Titre') + '</p></td></tr></tbody></table>');
        await h.sleep(60);
        changeInGrist(AFTER);
        await selectNode(h, 'varBadge');
        pressToolbarButton('var-loop');
        await h.sleep(700);
        const modal = document.getElementById('var-loop-modal');
        const select = () => modal.querySelector('#var-loop-sort');
        const settled = await waitFor(() => !!select() && hintOf(select(), 'Signature_tardive') !== null);
        const checks = { opened: visible(modal), listed: settled, hint: !!select() && hintOf(select(), 'Signature_tardive') === I18n.t('macro.modal.typeBool'), retyped: !!select() && hintOf(select(), 'Ancienne_vide') === I18n.t('macro.modal.typeBool') };
        const failed = failedOf(checks);
        return { pass: failed.length === 0, notes: JSON.stringify({ failed }) };
      } finally {
        closeWindows();
      }
    },
  });

  cases.push({
    id: 'colsreread_pivot_window_lists_the_added_column',
    description: 'La fenêtre du tableau croisé (js/pivot-window.js), ouverte après l\'ajout d\'une colonne dans Grist, la propose dans la liste des lignes, sans toucher à la table ni aux choix déjà faits',
    run: async (h) => {
      await seed(h);
      try {
        // Sans table liée à la page, un tableau croisé neuf s'ouvre sur la table de la page (js/pivot-window.js:defaultTable) : celle où la colonne a été ajoutée.
        await GristAPI.deleteLinkRule(LINES);
        Editor.setHTML('<table><tbody><tr><td><p>a</p></td><td><p>b</p></td></tr></tbody></table>');
        await h.sleep(120);
        changeInGrist(AFTER);
        PivotWindow.open(ed(), 1);
        await h.sleep(150);
        const modal = document.getElementById('pp-pivot-modal');
        const rows = () => modal.querySelector('#pp-pivot-row1');
        const tableBefore = modal.querySelector('#pp-pivot-table').value;
        const settled = await waitFor(() => !!rows() && hintOf(rows(), 'Signature_tardive') !== null);
        const checks = {
          opened: visible(modal),
          onThePageTable: tableBefore === TABLE && modal.querySelector('#pp-pivot-table').value === TABLE,
          listed: settled,
          hint: !!rows() && hintOf(rows(), 'Signature_tardive') === I18n.t('macro.modal.typeBool'),
        };
        const failed = failedOf(checks);
        return { pass: failed.length === 0, notes: JSON.stringify({ failed, table: tableBefore }) };
      } finally {
        closeWindows();
      }
    },
  });

  cases.push({
    id: 'colsreread_macro_template_window_lists_the_added_column',
    description: 'La fenêtre du macro-modèle (js/macro-editor.js : ConditionFields.buildTemplateRule), ouverte après l\'ajout d\'une colonne dans Grist, la propose dans la liste de ses règles - et garde la règle déjà saisie',
    run: async (h) => {
      await seed(h);
      try {
        changeInGrist(AFTER);
        MacroEditor.openModal({ id: null, nom: 'x', macroSlots: { slots: [
          { type: 'conditional', rules: [{ column: 'Statut', operator: '=', value: 'Urgent', modeleId: null }], defaultModeleId: null },
        ] } });
        await sleep(20);
        const modal = document.getElementById('macro-editor-modal');
        const select = () => modal.querySelector('.macro-rule-row select.macro-rule-column');
        const settled = await waitFor(() => !!select() && hintOf(select(), 'Signature_tardive') !== null);
        const row = modal.querySelector('.macro-rule-row');
        const checks = {
          listed: settled,
          hint: !!select() && hintOf(select(), 'Signature_tardive') === I18n.t('macro.modal.typeBool'),
          ruleKept: !!row && row.querySelector('select.macro-rule-column').value === 'Statut' && row.querySelector('.macro-rule-value').value === 'Urgent',
        };
        const failed = failedOf(checks);
        return { pass: failed.length === 0, notes: JSON.stringify({ failed }) };
      } finally {
        closeWindows();
      }
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.columnsReread = cases;
})();
