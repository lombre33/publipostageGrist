// Suite "varCondition" - variables conditionnelles et autres attributs d'une bulle #Variable (maquette validée par Antoine le 2026-09-28) :
// attribut `condition` du nœud varBadge (js/editor-nodes.js), bulle masquée en lecture/export (js/reader-mode.js), évaluation partagée
// (js/condition-rules.js, une règle sur une autre table vraie si UNE des lignes liées la remplit), barre flottante sur toutes les variables
// (js/floating-toolbars.js), fenêtres de condition (js/variable-condition.js) et des autres attributs (js/variable-linked-attrs.js).
// Ligne courante livrée comme par le vrai grist.onRecord : une colonne Référence y arrive avec la valeur AFFICHÉE ("Dupont Jean"), jamais l'id (vérifié
// à la source grist-core le 2026-09-28, cf. js/variables.js:ruleSourceValue) - c'est ce qui cachait la ligne liée par une colonne Référence en lecture.
(function () {
  const cases = [];

  const COND_URGENT = { mode: 'all', rules: [{ column: 'Statut', operator: '=', value: 'Urgent' }] };
  const COND_NORMAL = { mode: 'all', rules: [{ column: 'Statut', operator: '=', value: 'Normal' }] };
  const RECORD_1 = { id: 1, Titre: 'Dossier A', Statut: 'Urgent', Responsable: 'Dupont Jean', Montant: 1200 };
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };

  function badgeHtml(table, column, condition) {
    const cond = condition ? ` data-condition="${JSON.stringify(condition).replace(/"/g, '&quot;')}"` : '';
    return `<span class="var-badge" data-table="${table}" data-column="${column}" data-key="${table}.${column}"${cond}></span>`;
  }

  // Trois tables : la page est sur VcDossiers ; VcAnnuaire est liée par la colonne Référence Responsable (identifiant de ligne = Responsable) ; VcContacts
  // par sa colonne Dossier (plusieurs contacts par dossier).
  async function seed(h, opts) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables('VcAnnuaire', { NomPrenom: 'Text', Telephone: 'Text', Naissance: 'Date' });
    stub.setVariables('VcDossiers', { Titre: 'Text', Statut: 'Text', Responsable: 'Ref:VcAnnuaire', Montant: 'Numeric' });
    stub.setVariables('VcContacts', { Dossier: 'Ref:VcDossiers', Role: 'Text', Nom: 'Text' });
    stub.setRows('VcAnnuaire', [
      { id: 7, NomPrenom: 'Dupont Jean', Telephone: '06 11 22 33 44', Naissance: 631152000 }, // 1990-01-01 UTC, en secondes comme fetchTable
      { id: 8, NomPrenom: 'Martin Anne', Telephone: '06 55 66 77 88', Naissance: 662688000 },
    ]);
    stub.setRows('VcDossiers', [
      { id: 1, Titre: 'Dossier A', Statut: 'Urgent', Responsable: 7, Montant: 1200 },
      { id: 2, Titre: 'Dossier B', Statut: 'Normal', Responsable: 8, Montant: 50 },
      { id: 3, Titre: 'Dossier C', Statut: 'Urgent', Responsable: 0, Montant: 10 },
    ]);
    stub.setRows('VcContacts', [
      { id: 1, Dossier: 1, Role: 'Client', Nom: 'Xavier' },
      { id: 2, Dossier: 1, Role: 'Avocat', Nom: 'Yvonne' },
      { id: 3, Dossier: 2, Role: 'Client', Nom: 'Zoé' },
    ]);
    await GristAPI.refreshSchema();
    for (const t of ['VcAnnuaire', 'VcContacts']) await GristAPI.deleteLinkRule(t);
    if (!(opts && opts.noLinks)) {
      await GristAPI.saveLinkRule('VcAnnuaire', { mode: 'match', colonneCible: 'id', colonneSource: 'Responsable' });
      await GristAPI.saveLinkRule('VcContacts', { mode: 'match', colonneCible: 'Dossier', colonneSource: 'id' });
    }
    stub.fireRecord(Object.assign({}, RECORD_1), 'VcDossiers');
    await h.sleep(50);
  }

  async function renderReader(html, hf) {
    const reader = document.getElementById('reader-container');
    reader.style.display = 'block';
    await ReaderMode.render(html, 'VcDossiers', GristAPI.getCurrentRecord(), hf || NO_HF);
    return reader;
  }

  function badgeNodes(ed) {
    const out = [];
    ed.state.doc.descendants((node, pos) => { if (node.type.name === 'varBadge') out.push({ node, pos }); });
    return out;
  }
  // Sélection de la bulle comme un clic : .focus() DOM direct puis NodeSelection (même contournement que scenarios-varformat.js:selectFirstVarBadge).
  async function selectBadge(h, column) {
    const ed = EditorCore.getEditor();
    document.querySelector('.tiptap').focus();
    const found = badgeNodes(ed).find(b => b.node.attrs.column === column);
    if (!found) return null;
    ed.commands.setNodeSelection(found.pos);
    await h.sleep(120);
    return ed;
  }
  function toolbar() { return document.querySelector('.v2-varfmt-toolbar'); }
  function toolbarButton(action) { return toolbar().querySelector(`button[data-action="${action}"]`); }
  // Le panneau flottant réagit au mousedown (js/editor-core.js:createFloatingPanel), comme au vrai clic.
  function pressToolbarButton(action) {
    toolbarButton(action).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  }
  function visible(el) { return !!el && el.style.display !== 'none' && el.getClientRects().length > 0; }
  function setSelect(select, value) { select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); }
  function setInput(input, value) { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); }

  cases.push({
    id: 'varcond_condition_attr_roundtrip',
    description: 'La condition d’une bulle survit à l’aller-retour HTML (data-condition), sans toucher une bulle sans condition',
    run: async (h) => {
      await seed(h);
      Editor.setHTML(`<p>${badgeHtml('VcDossiers', 'Titre', COND_URGENT)} et ${badgeHtml('VcDossiers', 'Statut')}</p>`);
      const ed = EditorCore.getEditor();
      const nodes = badgeNodes(ed);
      const html = Editor.getHTML();
      const box = document.createElement('div');
      box.innerHTML = html;
      const spans = box.querySelectorAll('span.var-badge');
      let parsed = null;
      try { parsed = JSON.parse(spans[0].getAttribute('data-condition')); } catch (e) { /* verdict ci-dessous */ }
      const pass = nodes.length === 2 && JSON.stringify(nodes[0].node.attrs.condition) === JSON.stringify(COND_URGENT)
        && nodes[1].node.attrs.condition == null && JSON.stringify(parsed) === JSON.stringify(COND_URGENT) && !spans[1].hasAttribute('data-condition');
      return { pass, notes: JSON.stringify({ attrs: nodes.map(n => n.node.attrs.condition), html }) };
    },
  });

  cases.push({
    id: 'varcond_reader_hides_unmet_keeps_surrounding_text',
    description: 'Mode Lecture : une bulle dont la condition n’est pas remplie disparaît (texte autour conservé), en corps comme en en-tête ; une condition remplie affiche la valeur',
    run: async (h) => {
      await seed(h);
      h.setA4Preview(true);
      const hf = {
        enabled: true, differentFirstPage: false,
        header: { default: `<p>En-tête [${badgeHtml('VcDossiers', 'Titre', COND_NORMAL)}] [${badgeHtml('VcDossiers', 'Titre', COND_URGENT)}]</p>`, first: '' },
        footer: { default: '', first: '' },
      };
      const reader = await renderReader(
        `<p>Avant ${badgeHtml('VcDossiers', 'Titre', COND_NORMAL)}après.</p><p>Visible : ${badgeHtml('VcDossiers', 'Titre', COND_URGENT)}.</p>`, hf);
      const body = reader.querySelector('.reader-content');
      const bodyText = body ? body.textContent : '';
      const header = reader.querySelector('.v2-page-edge-top');
      const headerText = header ? header.textContent : '';
      h.setA4Preview(false);
      const pass = bodyText.includes('Avant après.') && bodyText.includes('Visible : Dossier A.') && (bodyText.match(/Dossier A/g) || []).length === 1
        && headerText.includes('En-tête [] [Dossier A]');
      return { pass, notes: JSON.stringify({ bodyText, headerText }) };
    },
  });

  cases.push({
    id: 'varcond_export_preview_hides_unmet',
    description: 'Export (ReaderMode.preview, commun au PDF, au DOCX et à leurs en-têtes/pieds) : même règle que le mode Lecture',
    run: async (h) => {
      await seed(h);
      const html = await ReaderMode.preview(
        `<p>A${badgeHtml('VcDossiers', 'Titre', COND_NORMAL)}B ${badgeHtml('VcDossiers', 'Titre', COND_URGENT)}</p>`, 'VcDossiers', GristAPI.getCurrentRecord());
      const box = document.createElement('div');
      box.innerHTML = html;
      const text = box.textContent;
      return { pass: text === 'AB Dossier A', notes: JSON.stringify({ text }) };
    },
  });

  cases.push({
    id: 'varcond_other_table_rule_true_if_any_linked_row',
    description: 'Condition sur une autre table : vraie si UNE des lignes liées la remplit (deux contacts, dont un Avocat), fausse sinon',
    run: async (h) => {
      await seed(h);
      const avocat = { mode: 'all', rules: [{ column: 'VcContacts.Role', operator: '=', value: 'Avocat' }] };
      const notaire = { mode: 'all', rules: [{ column: 'VcContacts.Role', operator: '=', value: 'Notaire' }] };
      const anyOf = { mode: 'any', rules: [{ column: 'VcContacts.Role', operator: '=', value: 'Notaire' }, { column: 'Statut', operator: '=', value: 'Urgent' }] };
      const reader = await renderReader(
        `<p>[${badgeHtml('VcDossiers', 'Titre', avocat)}][${badgeHtml('VcDossiers', 'Titre', notaire)}][${badgeHtml('VcDossiers', 'Titre', anyOf)}]</p>`);
      const text = reader.querySelector('.reader-content').textContent;
      return { pass: text.includes('[Dossier A][][Dossier A]'), notes: JSON.stringify({ text }) };
    },
  });

  cases.push({
    id: 'varcond_reference_link_finds_row_from_displayed_value',
    description: 'Table liée par une colonne Référence : la bulle trouve la ligne référencée alors que grist.onRecord livre la valeur affichée ("Dupont Jean"), pas l’id',
    run: async (h) => {
      await seed(h);
      const reader = await renderReader(`<p>Tél. ${badgeHtml('VcAnnuaire', 'Telephone')}</p>`);
      const text = reader.querySelector('.reader-content').textContent;
      return { pass: text.includes('Tél. 06 11 22 33 44'), notes: JSON.stringify({ text, record: GristAPI.getCurrentRecord() }) };
    },
  });

  cases.push({
    id: 'varcond_linked_date_attribute_is_formatted',
    description: 'Une date d’une autre table liée s’affiche formatée en lecture, plus en secondes brutes',
    run: async (h) => {
      await seed(h);
      const reader = await renderReader(`<p>Né le ${badgeHtml('VcAnnuaire', 'Naissance')}</p>`);
      const text = reader.querySelector('.reader-content').textContent;
      return { pass: text.includes('1990') && !text.includes('631152000'), notes: JSON.stringify({ text }) };
    },
  });

  cases.push({
    id: 'varcond_toolbar_on_every_variable',
    description: 'Barre flottante sur une variable Texte (actions seules), « Autres attributs » grisé pour une colonne ordinaire de la page, actif pour une autre table ou une Référence',
    run: async (h) => {
      await seed(h);
      Editor.setHTML(`<p>${badgeHtml('VcDossiers', 'Titre')} ${badgeHtml('VcAnnuaire', 'NomPrenom')} ${badgeHtml('VcDossiers', 'Responsable')} ${badgeHtml('VcDossiers', 'Montant')}</p>`);
      const states = {};
      for (const col of ['Titre', 'NomPrenom', 'Responsable', 'Montant']) {
        await selectBadge(h, col);
        const bar = toolbar();
        states[col] = {
          visible: bar.classList.contains('visible'),
          linkedDisabled: toolbarButton('var-linked').getAttribute('aria-disabled'),
          numberPanel: !bar.querySelector('[data-var-panel="number"]').hidden,
          sep: !bar.querySelector('[data-var-sep]').hidden,
        };
      }
      const pass = states.Titre.visible && states.Titre.linkedDisabled === 'true' && !states.Titre.numberPanel && !states.Titre.sep
        && states.NomPrenom.visible && states.NomPrenom.linkedDisabled === 'false'
        && states.Responsable.visible && states.Responsable.linkedDisabled === 'false'
        && states.Montant.visible && states.Montant.numberPanel && states.Montant.sep && states.Montant.linkedDisabled === 'true';
      return { pass, notes: JSON.stringify(states) };
    },
  });

  cases.push({
    id: 'varcond_window_saves_and_removes_condition',
    description: 'Fenêtre de condition : Enregistrer pose la condition sur la bulle (aperçu : ligne sélectionnée, 2 lignes sur 3), Retirer l’enlève',
    run: async (h) => {
      await seed(h);
      Editor.setHTML(`<p>Objet : ${badgeHtml('VcDossiers', 'Titre')}</p>`);
      let ed = await selectBadge(h, 'Titre');
      pressToolbarButton('var-condition');
      await h.sleep(50);
      const modal = document.getElementById('var-condition-modal');
      const opened = visible(modal) && !toolbar().classList.contains('visible');
      const row = modal.querySelector('.macro-rule-row');
      setSelect(row.querySelector('select.macro-rule-column'), 'Statut');
      await h.sleep(30);
      setInput(row.querySelector('.macro-rule-value'), 'Urgent');
      await h.sleep(700);
      const debug = Array.from(modal.querySelectorAll('.var-condition-debug-line')).map(l => l.textContent);
      Array.from(modal.querySelectorAll('.var-modal-actions button')).find(b => b.textContent === I18n.t('common.save')).click();
      await h.sleep(80);
      const saved = badgeNodes(ed)[0].node.attrs.condition;
      const closed = !visible(modal);
      const html = Editor.getHTML();
      ed = await selectBadge(h, 'Titre');
      const activeAfterSave = toolbarButton('var-condition').classList.contains('is-active');
      pressToolbarButton('var-condition');
      await h.sleep(50);
      const removeBtn = modal.querySelector('.var-modal-danger');
      const removeShown = !removeBtn.hidden;
      removeBtn.click();
      await h.sleep(80);
      const afterRemove = badgeNodes(ed)[0].node.attrs.condition;
      const pass = opened && closed && JSON.stringify(saved) === JSON.stringify(COND_URGENT) && html.includes('data-condition') && activeAfterSave
        && removeShown && afterRemove == null
        && debug[0].includes(I18n.t('varCond.debug.currentMet', { id: 1, value: 'Dossier A' }))
        && debug[1].includes(I18n.t('varCond.debug.count', { table: 'VcDossiers', count: 2, total: 3 }));
      return { pass, notes: JSON.stringify({ opened, closed, saved, activeAfterSave, removeShown, afterRemove, debug }) };
    },
  });

  cases.push({
    id: 'varcond_unlinked_table_column_asks_for_key',
    description: 'Fenêtre de condition : une colonne d’une table pas encore liée ouvre le choix de la clé ; Annuler remet la colonne précédente, Valider enregistre le lien',
    run: async (h) => {
      await seed(h, { noLinks: true });
      Editor.setHTML(`<p>Objet : ${badgeHtml('VcDossiers', 'Titre')}</p>`);
      await selectBadge(h, 'Titre');
      pressToolbarButton('var-condition');
      await h.sleep(50);
      const modal = document.getElementById('var-condition-modal');
      const linkModal = document.getElementById('link-config-modal');
      let select = modal.querySelector('select.macro-rule-column');
      setSelect(select, 'Statut');
      await h.sleep(30);
      setSelect(select, 'VcContacts.Role');
      await h.sleep(150);
      const askedFirst = visible(linkModal);
      document.getElementById('link-config-cancel').click();
      await h.sleep(80);
      const revertedTo = select.value;
      const ruleAfterCancel = GristAPI.getLinkRule('VcContacts');
      setSelect(select, 'VcContacts.Role');
      await h.sleep(150);
      const askedAgain = visible(linkModal);
      document.getElementById('link-config-confirm').click();
      await h.sleep(150);
      select = modal.querySelector('select.macro-rule-column');
      const kept = select.value;
      const rule = GristAPI.getLinkRule('VcContacts');
      const hint = modal.querySelector('.var-condition-link-hint');
      const hintText = hint && !hint.hidden ? hint.textContent : '';
      modal.querySelector('.var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)').click();
      await h.sleep(50);
      const pass = askedFirst && revertedTo === 'Statut' && !ruleAfterCancel && askedAgain && kept === 'VcContacts.Role'
        && !!rule && rule.mode === 'match' && rule.colonneCible === 'Dossier' && rule.colonneSource === 'id' && hintText.includes('VcContacts.Dossier');
      return { pass, notes: JSON.stringify({ askedFirst, revertedTo, ruleAfterCancel, askedAgain, kept, rule, hintText }) };
    },
  });

  cases.push({
    id: 'varlinked_inserts_checked_attributes_after_badge',
    description: 'Autres attributs : liste les colonnes de la table liée avec leurs valeurs, la variable elle-même grisée, et insère les cochées juste après la bulle',
    run: async (h) => {
      await seed(h);
      Editor.setHTML(`<p>Responsable : ${badgeHtml('VcAnnuaire', 'NomPrenom')} fin</p>`);
      const ed = await selectBadge(h, 'NomPrenom');
      pressToolbarButton('var-linked');
      await h.sleep(250);
      const modal = document.getElementById('var-linked-modal');
      const opened = visible(modal);
      const rows = Array.from(modal.querySelectorAll('.var-linked-row')).map(r => ({
        col: r.dataset.col, disabled: r.querySelector('input').disabled, value: r.querySelector('.var-linked-value').textContent,
      }));
      const insertBtn = modal.querySelector('.var-modal-primary');
      const disabledAtZero = insertBtn.disabled;
      ['Naissance', 'Telephone'].forEach(col => {
        const input = modal.querySelector(`.var-linked-row[data-col="${col}"] input`);
        input.checked = true;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
      const label = insertBtn.textContent;
      insertBtn.click();
      await h.sleep(80);
      const para = ed.state.doc.firstChild;
      const seq = [];
      para.forEach(n => seq.push(n.type.name === 'varBadge' ? '#' + n.attrs.key : n.text));
      const tel = rows.find(r => r.col === 'Telephone');
      const self = rows.find(r => r.col === 'NomPrenom');
      const pass = opened && !visible(modal) && disabledAtZero && label === I18n.t('varLinked.insert', { count: 2 })
        && self && self.disabled && tel && !tel.disabled && tel.value === '06 11 22 33 44'
        && JSON.stringify(seq) === JSON.stringify(['Responsable : ', '#VcAnnuaire.NomPrenom', ' ', '#VcAnnuaire.Telephone', ' ', '#VcAnnuaire.Naissance', ' fin']);
      return { pass, notes: JSON.stringify({ opened, rows, disabledAtZero, label, seq }) };
    },
  });

  cases.push({
    id: 'varlinked_reference_column_links_its_table',
    description: 'Autres attributs depuis une colonne Référence de la page : la table référencée est liée par cette colonne, et l’attribut inséré se résout en lecture',
    run: async (h) => {
      await seed(h, { noLinks: true });
      Editor.setHTML(`<p>${badgeHtml('VcDossiers', 'Responsable')}</p>`);
      const ed = await selectBadge(h, 'Responsable');
      pressToolbarButton('var-linked');
      await h.sleep(250);
      const modal = document.getElementById('var-linked-modal');
      const rule = GristAPI.getLinkRule('VcAnnuaire');
      const cols = Array.from(modal.querySelectorAll('.var-linked-row')).map(r => r.dataset.col + (r.querySelector('input').disabled ? '(grisée)' : ''));
      const input = modal.querySelector('.var-linked-row[data-col="Telephone"] input');
      input.checked = true;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      modal.querySelector('.var-modal-primary').click();
      await h.sleep(80);
      const keys = badgeNodes(ed).map(b => b.node.attrs.key);
      const reader = await renderReader(Editor.getHTML());
      const text = reader.querySelector('.reader-content').textContent;
      const pass = !!rule && rule.mode === 'match' && rule.colonneCible === 'id' && rule.colonneSource === 'Responsable'
        && JSON.stringify(cols) === JSON.stringify(['NomPrenom', 'Telephone', 'Naissance'])
        && JSON.stringify(keys) === JSON.stringify(['VcDossiers.Responsable', 'VcAnnuaire.Telephone']) && text.includes('06 11 22 33 44');
      return { pass, notes: JSON.stringify({ rule, cols, keys, text }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.varCondition = cases;
})();
