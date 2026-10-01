// Suite "varCondition" - variables conditionnelles et autres attributs d'une bulle #Variable (maquette validée par Antoine le 2026-09-28) :
// attribut `condition` du nœud varBadge (js/editor-nodes.js), bulle masquée en lecture/export (js/reader-mode.js), évaluation partagée
// (js/condition-rules.js, une règle sur une autre table vraie si UNE des lignes liées la remplit), barre flottante sur toutes les variables
// (js/floating-toolbars.js), fenêtres de condition (js/variable-condition.js) et des autres attributs (js/variable-linked-attrs.js). Copier / Coller la
// condition d'une variable sur une autre (demande d'Antoine, 2026-09-29) : cas `varcond_clip_*`, qui pilotent les vrais boutons de la fenêtre.
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
    if (opts && opts.refAttrs) seedReferenceAttributes(stub);
    await GristAPI.refreshSchema();
    stub.fireRecord(Object.assign({}, RECORD_1), 'VcDossiers');
    await h.sleep(50);
  }

  // Attributs eux-mêmes Référence / liste de références / choix multiples, sous la forme que le vrai fetchTable leur donne : l'id référencé (0 si vide),
  // ["L", …] pour une liste, et la valeur affichée dans la colonne d'aide « gristHelper_Display… » de la MÊME table, pointée par displayCol (retour
  // d'Antoine du 2026-09-28 : « Autres attributs » affichait l'id d'un attribut lui-même Référence).
  function seedReferenceAttributes(stub) {
    stub.setVariables('VcServices', { Nom: 'Text' });
    stub.setRows('VcServices', [{ id: 3, Nom: 'Juridique' }, { id: 4, Nom: 'Fiscal' }]);
    stub.setVariables('VcAnnuaire', {
      NomPrenom: 'Text', Telephone: 'Text', Naissance: 'Date', Service: 'Ref:VcServices', Competences: 'RefList:VcServices', Langues: 'ChoiceList',
      gristHelper_Display: 'Text', gristHelper_Display2: 'Any',
    }, null, { Service: 'gristHelper_Display', Competences: 'gristHelper_Display2' });
    stub.setRows('VcAnnuaire', [
      { id: 7, NomPrenom: 'Dupont Jean', Telephone: '06 11 22 33 44', Naissance: 631152000, Service: 3, Competences: ['L', 3, 4], Langues: ['L', 'fr', 'en'],
        gristHelper_Display: 'Juridique', gristHelper_Display2: ['L', 'Juridique', 'Fiscal'] },
      { id: 8, NomPrenom: 'Martin Anne', Telephone: '06 55 66 77 88', Naissance: 662688000, Service: 0, Competences: null, Langues: null,
        gristHelper_Display: '', gristHelper_Display2: null },
    ]);
    // La Référence Responsable de la page, affichée par Annuaire.NomPrenom : même colonne d'aide dans VcDossiers.
    stub.setVariables('VcDossiers', { Titre: 'Text', Statut: 'Text', Responsable: 'Ref:VcAnnuaire', Montant: 'Numeric', gristHelper_Display: 'Text' },
      null, { Responsable: 'gristHelper_Display' });
    stub.setRows('VcDossiers', [
      { id: 1, Titre: 'Dossier A', Statut: 'Urgent', Responsable: 7, Montant: 1200, gristHelper_Display: 'Dupont Jean' },
      { id: 2, Titre: 'Dossier B', Statut: 'Normal', Responsable: 8, Montant: 50, gristHelper_Display: 'Martin Anne' },
      { id: 3, Titre: 'Dossier C', Statut: 'Urgent', Responsable: 0, Montant: 10, gristHelper_Display: '' },
    ]);
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
        && debug[1].includes(I18n.t('varCond.debug.count', { table: 'VcDossiers', count: 2, total: 3 })) && debug[1].includes('2 lignes sur 3 remplissent la condition');
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
      const pass = opened && !visible(modal) && disabledAtZero && label === I18n.t('varLinked.insert', { count: 2 }) && label === 'Insérer 2 attributs'
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

  cases.push({
    id: 'varlinked_reference_attribute_shows_displayed_value',
    description: 'Autres attributs : un attribut lui-même Référence (ou liste de références, choix multiples) montre sa valeur affichée, pas son id, dans la fenêtre comme en lecture',
    run: async (h) => {
      await seed(h, { refAttrs: true });
      Editor.setHTML(`<p>${badgeHtml('VcAnnuaire', 'NomPrenom')}</p>`);
      const ed = await selectBadge(h, 'NomPrenom');
      pressToolbarButton('var-linked');
      await h.sleep(250);
      const modal = document.getElementById('var-linked-modal');
      const values = {};
      modal.querySelectorAll('.var-linked-row').forEach(r => { values[r.dataset.col] = r.querySelector('.var-linked-value').textContent; });
      ['Service', 'Competences', 'Langues'].forEach(col => {
        const input = modal.querySelector(`.var-linked-row[data-col="${col}"] input`);
        input.checked = true;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
      modal.querySelector('.var-modal-primary').click();
      await h.sleep(80);
      const keys = badgeNodes(ed).map(b => b.node.attrs.key);
      const reader = await renderReader(Editor.getHTML());
      const text = reader.querySelector('.reader-content').textContent;
      const pass = values.Service === 'Juridique' && values.Competences === 'Juridique, Fiscal' && values.Langues === 'fr, en'
        && !Object.keys(values).some(c => c.indexOf('gristHelper_') === 0)
        && keys.length === 4 && text === 'Dupont Jean Juridique Juridique, Fiscal fr, en';
      return { pass, notes: JSON.stringify({ values, keys, text }) };
    },
  });

  cases.push({
    id: 'varcond_raw_rows_use_displayed_value',
    description: 'Lignes lues par fetchTable (export en lot, aperçu de la fenêtre de condition) : une Référence vaut sa valeur affichée, comme en lecture, pour la bulle comme pour la condition',
    run: async (h) => {
      await seed(h, { refAttrs: true });
      const rows = await GristAPI.fetchTableRows('VcDossiers');
      const onResponsable = { mode: 'all', rules: [{ column: 'Responsable', operator: '=', value: 'Dupont Jean' }] };
      const onService = { mode: 'all', rules: [{ column: 'VcAnnuaire.Service', operator: '=', value: 'Juridique' }] };
      const html = `<p>${badgeHtml('VcDossiers', 'Responsable')}|${badgeHtml('VcAnnuaire', 'Service')}|${badgeHtml('VcDossiers', 'Titre', onService)}</p>`;
      const box = document.createElement('div');
      box.innerHTML = await ReaderMode.preview(html, 'VcDossiers', rows[0]);
      const batchRow1 = box.textContent;
      box.innerHTML = await ReaderMode.preview(html, 'VcDossiers', rows[1]);
      const batchRow2 = box.textContent;
      const holds = [
        await ConditionRules.conditionHolds(onResponsable, 'VcDossiers', rows[0]),
        await ConditionRules.conditionHolds(onResponsable, 'VcDossiers', rows[1]),
        await ConditionRules.conditionHolds(onService, 'VcDossiers', GristAPI.getCurrentRecord()),
      ];
      // Même règle dans la fenêtre de condition : la ligne sélectionnée et le décompte sur toutes les lignes doivent dire la même chose.
      Editor.setHTML(`<p>${badgeHtml('VcDossiers', 'Responsable')}</p>`);
      await selectBadge(h, 'Responsable');
      pressToolbarButton('var-condition');
      await h.sleep(50);
      const modal = document.getElementById('var-condition-modal');
      const row = modal.querySelector('.macro-rule-row');
      const columnOptions = Array.from(row.querySelectorAll('select.macro-rule-column option')).map(o => o.value);
      setSelect(row.querySelector('select.macro-rule-column'), 'Responsable');
      await h.sleep(30);
      setInput(row.querySelector('.macro-rule-value'), 'Dupont Jean');
      await h.sleep(700);
      const debug = Array.from(modal.querySelectorAll('.var-condition-debug-line')).map(l => l.textContent);
      modal.querySelector('.var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)').click();
      await h.sleep(50);
      const pass = batchRow1 === 'Dupont Jean|Juridique|Dossier A' && batchRow2 === 'Martin Anne||' && JSON.stringify(holds) === '[true,false,true]'
        && !columnOptions.some(v => v.indexOf('gristHelper_') !== -1)
        && debug[1].startsWith('Dans « VcDossiers » : 1 ligne sur 3 remplit la condition.')
        && debug[1] === I18n.t('varCond.debug.count', { table: 'VcDossiers', count: 1, total: 3 }) + ' '
          + I18n.t('varCond.debug.first', { id: 1, label: ' (Dossier A)', value: 'Dupont Jean' });
      return { pass, notes: JSON.stringify({ batchRow1, batchRow2, holds, debug, helperOptions: columnOptions.filter(v => v.indexOf('gristHelper_') !== -1) }) };
    },
  });

  // Colonne à choix multiples et liste de références (Antoine, 2026-09-29, carte « Sur une colonne à choix multiples, que doit tester « = » dans une règle ? » :
  // « Contient ce choix ») : « = Français » retient la ligne qui coche Français ET Anglais, « ≠ Français » l'exclut. Lignes lues par fetchTable, sous leur forme
  // brute (["L", …]) : celles de l'aperçu de la fenêtre de condition et de l'export en lot ; la bulle suit dans le texte lu.
  cases.push({
    id: 'varcond_list_column_equals_means_contains',
    description: 'Colonne à choix multiples et liste de références : « = » retient la ligne dont la liste contient la valeur et « ≠ » l’exclut (lignes lues par fetchTable) ; la bulle conditionnée apparaît ou disparaît en conséquence',
    run: async (h) => {
      await seed(h, { refAttrs: true });
      const rows = await GristAPI.fetchTableRows('VcAnnuaire');
      const holds = (column, operator, value, row) => ConditionRules.conditionHolds({ mode: 'all', rules: [{ column, operator, value }] }, 'VcAnnuaire', row);
      const dupont = rows.find(r => r.id === 7);
      const martin = rows.find(r => r.id === 8);
      const results = {
        langues: [await holds('Langues', '=', 'fr', dupont), await holds('Langues', '=', 'en', dupont), await holds('Langues', '=', 'de', dupont), await holds('Langues', '=', 'fr', martin)],
        languesDiffer: [await holds('Langues', '≠', 'fr', dupont), await holds('Langues', '≠', 'de', dupont), await holds('Langues', '≠', 'fr', martin)],
        competences: [await holds('Competences', '=', 'Fiscal', dupont), await holds('Competences', '=', 'Juridique', dupont), await holds('Competences', '≠', 'Fiscal', dupont), await holds('Competences', '=', 'Fiscal', martin)],
      };
      const onFr = { mode: 'all', rules: [{ column: 'Langues', operator: '=', value: 'fr' }] };
      const notFr = { mode: 'all', rules: [{ column: 'Langues', operator: '≠', value: 'fr' }] };
      const html = `<p>[${badgeHtml('VcAnnuaire', 'NomPrenom', onFr)}][${badgeHtml('VcAnnuaire', 'Telephone', notFr)}]</p>`;
      const box = document.createElement('div');
      box.innerHTML = await ReaderMode.preview(html, 'VcAnnuaire', dupont);
      const readDupont = box.textContent;
      box.innerHTML = await ReaderMode.preview(html, 'VcAnnuaire', martin);
      const readMartin = box.textContent;
      const pass = JSON.stringify(results.langues) === '[true,true,false,false]' && JSON.stringify(results.languesDiffer) === '[false,true,true]'
        && JSON.stringify(results.competences) === '[true,true,false,false]'
        && readDupont === '[Dupont Jean][]' && readMartin === '[][06 55 66 77 88]';
      return { pass, notes: JSON.stringify({ results, readDupont, readMartin }) };
    },
  });

  // === Copier / Coller la condition d'une variable (demande d'Antoine, 2026-09-29) ===
  function conditionModal() { return document.getElementById('var-condition-modal'); }
  function clipButtons(modal) {
    const buttons = Array.from(modal.querySelectorAll('.var-condition-clip button'));
    return { copy: buttons[0], paste: buttons[1] };
  }
  function clipInfo(btn) {
    return btn ? { text: btn.textContent, disabled: btn.getAttribute('aria-disabled'), title: btn.title, done: btn.classList.contains('is-done') } : null;
  }
  async function openWindow(h, column) {
    await selectBadge(h, column);
    pressToolbarButton('var-condition');
    await h.sleep(60);
    return conditionModal();
  }
  function cancelWindow(modal) { modal.querySelector('.var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)').click(); }
  function saveWindow(modal) { modal.querySelector('.var-modal-actions .var-modal-primary').click(); }
  // Les règles telles qu'affichées : colonne, opérateur (seul <select> enfant direct de la ligne) et valeur.
  function windowRules(modal) {
    return Array.from(modal.querySelectorAll('.macro-rule-row')).map(row => ({
      column: row.querySelector('select.macro-rule-column').value,
      operator: row.querySelector(':scope > select').value,
      value: row.querySelector('.macro-rule-value').value,
    }));
  }
  // Ce que dit le champ fermé de la colonne de chaque règle (liste avec recherche, js/search-select.js) : le nom seul, comme à l'écran.
  function shownColumns(modal) {
    return Array.from(modal.querySelectorAll('.macro-rule-row')).map(row => { const field = row.querySelector('.macro-rule-column-wrap .ss-trigger'); return field ? field.textContent : null; });
  }
  // Choisit une colonne comme une personne, dans le champ avec recherche : clic sur le champ visible, frappe du nom puis Entrée sur le premier résultat ; un nom
  // vide prend le choix « rien » de la liste. Le <select> masqué, source de la valeur, reçoit `change` comme avant.
  async function pickColumn(h, row, name) {
    row.querySelector('.macro-rule-column-wrap .ss-trigger').click();
    await h.sleep(30);
    const panel = row.querySelector('.macro-rule-column-wrap .ss-panel');
    if (name === '') panel.querySelector('.ss-option.is-empty').click();
    else {
      const input = panel.querySelector('.ss-input');
      setInput(input, name);
      await h.sleep(10);
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    }
    await h.sleep(40);
  }
  function windowMode(modal) {
    const row = modal.querySelector('.var-condition-mode');
    return { shown: !row.hidden, value: row.querySelector('select').value };
  }
  function conditionOf(ed, column) {
    const found = badgeNodes(ed).find(b => b.node.attrs.column === column);
    return found ? found.node.attrs.condition : undefined;
  }
  const NO_CLIP_BUTTONS = { pass: false, notes: 'boutons Copier / Coller absents de la fenêtre de condition' };

  cases.push({
    id: 'varcond_clip_copy_paste_between_variables',
    description: 'Copier / Coller : la condition à l’écran dans la fenêtre d’une variable (deux règles, « au moins une », pas enregistrée) se recolle dans celle d’une autre ; rien n’est écrit avant Enregistrer, Annuler abandonne, et modifier la copie collée ne change pas le presse-papier',
    run: async (h) => {
      await seed(h);
      VariableCondition.clearClipboard();
      Editor.setHTML(`<p>${badgeHtml('VcDossiers', 'Titre')} ${badgeHtml('VcDossiers', 'Montant')}</p>`);
      const ed = EditorCore.getEditor();
      // 1) Fenêtre encore vide : ni Copier ni Coller ne servent, et un clic dessus ne fait rien.
      let modal = await openWindow(h, 'Titre');
      let { copy, paste } = clipButtons(modal);
      if (!copy || !paste) { if (modal) cancelWindow(modal); return NO_CLIP_BUTTONS; }
      const emptyState = { copy: clipInfo(copy), paste: clipInfo(paste) };
      copy.click();
      paste.click();
      await h.sleep(30);
      const afterEmptyClicks = { rules: windowRules(modal), paste: clipInfo(paste) };
      // 2) Deux règles saisies à l'écran, sans enregistrer : Copier s'active et emporte ce qui est affiché.
      await pickColumn(h, modal.querySelector('.macro-rule-row'), 'Statut');
      await h.sleep(30);
      setInput(modal.querySelector('.macro-rule-value'), 'Urgent');
      modal.querySelector('.var-condition-add').click();
      await h.sleep(30);
      await pickColumn(h, modal.querySelectorAll('.macro-rule-row')[1], 'VcContacts.Role');
      await h.sleep(60);
      setInput(modal.querySelectorAll('.macro-rule-row')[1].querySelector('.macro-rule-value'), 'Avocat');
      setSelect(modal.querySelector('.var-condition-mode select'), 'any');
      await h.sleep(400);
      const beforeCopy = { copy: clipInfo(copy), paste: clipInfo(paste) };
      copy.click();
      const afterCopy = { copy: clipInfo(copy), paste: clipInfo(paste) };
      cancelWindow(modal);
      await h.sleep(30);
      const titreAfterCancel = conditionOf(ed, 'Titre');
      // 3) Fenêtre d'une autre variable, sans condition : Coller est proposé, « Copier » n'affiche plus « Copiée », rien n'est écrit avant Enregistrer.
      modal = await openWindow(h, 'Montant');
      ({ copy, paste } = clipButtons(modal));
      const otherWindow = { copy: clipInfo(copy), paste: clipInfo(paste) };
      paste.click();
      await h.sleep(60);
      const pasted = { rules: windowRules(modal), shown: shownColumns(modal), mode: windowMode(modal), bubble: conditionOf(ed, 'Montant') };
      // Modifier la copie collée puis Annuler : la bulle reste sans condition et le presse-papier garde « Urgent ».
      setInput(modal.querySelector('.macro-rule-value'), 'Normal');
      cancelWindow(modal);
      await h.sleep(30);
      const afterCancel = conditionOf(ed, 'Montant');
      modal = await openWindow(h, 'Montant');
      clipButtons(modal).paste.click();
      await h.sleep(700);
      const secondPaste = { rules: windowRules(modal), holds: !!modal.querySelector('.var-condition-debug-line.is-good') };
      saveWindow(modal);
      await h.sleep(80);
      const saved = conditionOf(ed, 'Montant');
      const html = Editor.getHTML();
      const expected = {
        mode: 'any',
        rules: [{ column: 'Statut', operator: '=', value: 'Urgent' }, { column: 'VcContacts.Role', operator: '=', value: 'Avocat' }],
      };
      const summary = 'Statut = Urgent ' + I18n.t('varCond.ruleOr').toLowerCase() + ' VcContacts.Role = Avocat';
      const pass = emptyState.copy.disabled === 'true' && emptyState.paste.disabled === 'true' && emptyState.paste.title === I18n.t('varCond.clip.pasteEmpty')
        && afterEmptyClicks.rules.length === 1 && afterEmptyClicks.rules[0].column === '' && afterEmptyClicks.paste.disabled === 'true'
        && beforeCopy.copy.disabled === 'false' && beforeCopy.copy.text === I18n.t('varCond.clip.copy') && beforeCopy.paste.disabled === 'true'
        && afterCopy.copy.text === I18n.t('varCond.clip.copied') && afterCopy.copy.done && afterCopy.paste.disabled === 'false'
        && afterCopy.paste.title === I18n.t('varCond.clip.pasteTitle', { summary })
        && titreAfterCancel == null
        && otherWindow.copy.text === I18n.t('varCond.clip.copy') && !otherWindow.copy.done && otherWindow.copy.disabled === 'true' && otherWindow.paste.disabled === 'false'
        && JSON.stringify(pasted.rules) === JSON.stringify(expected.rules) && JSON.stringify(pasted.shown) === JSON.stringify(['Statut', 'VcContacts.Role'])
        && pasted.mode.shown && pasted.mode.value === 'any' && pasted.bubble == null
        && afterCancel == null
        && JSON.stringify(secondPaste.rules) === JSON.stringify(expected.rules) && secondPaste.holds
        && JSON.stringify(saved) === JSON.stringify(expected) && conditionOf(ed, 'Titre') == null && (html.match(/data-condition=/g) || []).length === 1;
      return { pass, notes: JSON.stringify({ emptyState, afterEmptyClicks, beforeCopy, afterCopy, titreAfterCancel, otherWindow, pasted, afterCancel, secondPaste, saved }) };
    },
  });

  cases.push({
    id: 'varcond_clip_copy_needs_a_column_and_paste_replaces_saved_condition',
    description: 'Copier reste grisé tant qu’aucune colonne n’est choisie ; Coller remplace la condition déjà enregistrée sur la variable (Retirer reste proposé) et son info-bulle résume la copie (« vide » sans valeur)',
    run: async (h) => {
      await seed(h);
      VariableCondition.clearClipboard();
      const onTitre = { mode: 'all', rules: [{ column: 'Statut', operator: 'vide', value: 'zzz' }, { column: 'Montant', operator: '≥', value: '100' }] };
      Editor.setHTML(`<p>${badgeHtml('VcDossiers', 'Titre', onTitre)} ${badgeHtml('VcDossiers', 'Montant', COND_NORMAL)} ${badgeHtml('VcDossiers', 'Statut')}</p>`);
      const ed = EditorCore.getEditor();
      // Variable sans condition : Copier n'est proposé qu'une fois une colonne choisie, et se regrise si on la retire.
      let modal = await openWindow(h, 'Statut');
      let { copy, paste } = clipButtons(modal);
      if (!copy || !paste) { if (modal) cancelWindow(modal); return NO_CLIP_BUTTONS; }
      const noColumn = clipInfo(copy);
      await pickColumn(h, modal.querySelector('.macro-rule-row'), 'Titre');
      await h.sleep(400);
      const withColumn = clipInfo(copy);
      await pickColumn(h, modal.querySelector('.macro-rule-row'), '');
      await h.sleep(400);
      const columnRemoved = clipInfo(copy);
      cancelWindow(modal);
      // Variable qui a déjà une condition enregistrée : Copier est proposé d'emblée.
      modal = await openWindow(h, 'Titre');
      ({ copy, paste } = clipButtons(modal));
      const saved = clipInfo(copy);
      copy.click();
      cancelWindow(modal);
      await h.sleep(30);
      // Coller remplace la condition enregistrée sur Montant (Statut = Normal) ; Retirer la condition reste proposé.
      modal = await openWindow(h, 'Montant');
      ({ copy, paste } = clipButtons(modal));
      const before = { rules: windowRules(modal), paste: clipInfo(paste) };
      paste.click();
      await h.sleep(60);
      const after = { rules: windowRules(modal), shown: shownColumns(modal), mode: windowMode(modal), removeShown: !modal.querySelector('.var-modal-danger').hidden };
      saveWindow(modal);
      await h.sleep(80);
      const summary = 'Statut vide ' + I18n.t('varCond.ruleAnd').toLowerCase() + ' Montant ≥ 100';
      const pass = noColumn.disabled === 'true' && noColumn.title === I18n.t('varCond.clip.copyEmpty')
        && withColumn.disabled === 'false' && withColumn.title === I18n.t('varCond.clip.copyTitle') && columnRemoved.disabled === 'true'
        && saved.disabled === 'false'
        && JSON.stringify(before.rules) === JSON.stringify(COND_NORMAL.rules) && before.paste.disabled === 'false'
        && before.paste.title === I18n.t('varCond.clip.pasteTitle', { summary })
        && JSON.stringify(after.rules) === JSON.stringify(onTitre.rules) && JSON.stringify(after.shown) === JSON.stringify(['Statut', 'Montant'])
        && after.removeShown && after.mode.shown && after.mode.value === 'all'
        && JSON.stringify(conditionOf(ed, 'Montant')) === JSON.stringify(onTitre) && JSON.stringify(conditionOf(ed, 'Titre')) === JSON.stringify(onTitre);
      return { pass, notes: JSON.stringify({ noColumn, withColumn, columnRemoved, saved, before, after, montant: conditionOf(ed, 'Montant') }) };
    },
  });

  cases.push({
    id: 'varcond_clip_survives_template_switch_and_speaks_english',
    description: 'Le presse-papier reste quand un autre contenu est chargé dans l’éditeur (autre modèle) ; en anglais les deux boutons, leurs info-bulles et les messages sont traduits',
    run: async (h) => {
      await seed(h);
      VariableCondition.clearClipboard();
      Editor.setHTML(`<p>${badgeHtml('VcDossiers', 'Titre', COND_URGENT)}</p>`);
      let modal = await openWindow(h, 'Titre');
      let { copy, paste } = clipButtons(modal);
      if (!copy || !paste) { if (modal) cancelWindow(modal); return NO_CLIP_BUTTONS; }
      copy.click();
      cancelWindow(modal);
      await h.sleep(30);
      // Un autre modèle prend la place dans l'éditeur : la copie reste disponible.
      Editor.setHTML(`<p>${badgeHtml('VcDossiers', 'Montant')}</p>`);
      const lang = I18n.getLang();
      const keys = ['copy', 'paste', 'copied', 'copyTitle', 'copyEmpty', 'pasteTitle', 'pasteEmpty', 'copiedStatus', 'pastedStatus'].map(k => 'varCond.clip.' + k);
      let english = null;
      let translations = null;
      try {
        I18n.setLang('fr');
        const fr = keys.map(k => I18n.t(k, { summary: 'S' }));
        I18n.setLang('en');
        const en = keys.map(k => I18n.t(k, { summary: 'S' }));
        translations = keys.map((k, i) => ({ key: k, fr: fr[i], en: en[i] })).filter(t => t.en === t.fr || t.en === t.key);
        modal = await openWindow(h, 'Montant');
        ({ copy, paste } = clipButtons(modal));
        const before = { copy: clipInfo(copy), paste: clipInfo(paste) };
        paste.click();
        await h.sleep(60);
        english = { before, rules: windowRules(modal), status: modal.querySelector('.var-condition-clip-status').textContent };
        cancelWindow(modal);
      } finally {
        I18n.setLang(lang);
      }
      const pass = translations.length === 0
        && english.before.copy.text === 'Copy' && english.before.paste.text === 'Paste' && english.before.paste.disabled === 'false'
        && english.before.paste.title === 'Paste the copied condition in place of this one: Statut = Urgent'
        && JSON.stringify(english.rules) === JSON.stringify(COND_URGENT.rules) && english.status === 'Condition pasted. Save to apply it to the variable.';
      return { pass, notes: JSON.stringify({ untranslated: translations, english }) };
    },
  });

  // === Attributs insérés : ils reprennent la condition de la variable d'origine (demande d'Antoine, 2026-09-29) ===
  function linkedModal() { return document.getElementById('var-linked-modal'); }
  async function openLinked(h, column) {
    await selectBadge(h, column);
    pressToolbarButton('var-linked');
    await h.sleep(250);
    return linkedModal();
  }
  function inheritRow(modal) { return modal.querySelector('.var-linked-inherit'); }
  function inheritInfo(modal) {
    const row = inheritRow(modal);
    return row ? {
      shown: !row.hidden, checked: row.querySelector('input').checked,
      text: row.querySelector('.var-linked-inherit-text').textContent, summary: row.querySelector('.var-linked-inherit-summary').textContent, title: row.title,
    } : null;
  }
  function tickLinked(modal, cols) {
    cols.forEach(col => {
      const input = modal.querySelector(`.var-linked-row[data-col="${col}"] input`);
      input.checked = true;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
  function cancelLinked(modal) { modal.querySelector('.var-modal-actions button:not(.var-modal-primary)').click(); }
  const NO_INHERIT_ROW = { pass: false, notes: 'ligne « Reprendre la condition d’affichage » absente de la fenêtre Autres attributs' };

  cases.push({
    id: 'varlinked_inserted_attributes_inherit_the_condition_by_default',
    description: 'Autres attributs depuis une variable qui a une condition : « Reprendre la condition d’affichage » est cochée d’office (résumé de la condition à côté), chaque attribut inséré reçoit une copie de la condition, et tous disparaissent ensemble en lecture quand elle n’est pas remplie',
    run: async (h) => {
      await seed(h);
      Editor.setHTML(`<p>Responsable : ${badgeHtml('VcAnnuaire', 'NomPrenom', COND_URGENT)} fin</p>`);
      const ed = EditorCore.getEditor();
      const modal = await openLinked(h, 'NomPrenom');
      const option = inheritInfo(modal);
      if (!option) { cancelLinked(modal); return NO_INHERIT_ROW; }
      tickLinked(modal, ['Telephone', 'Naissance']);
      modal.querySelector('.var-modal-primary').click();
      await h.sleep(80);
      const badges = badgeNodes(ed).map(b => ({ key: b.node.attrs.key, condition: b.node.attrs.condition }));
      const html = Editor.getHTML();
      // Ligne courante « Urgent » : la condition est remplie, les trois valeurs s'affichent ; ligne courante « Normal » : les trois disparaissent avec elle.
      const shownBox = document.createElement('div');
      shownBox.innerHTML = await ReaderMode.preview(html, 'VcDossiers', GristAPI.getCurrentRecord());
      window.__gristStub.fireRecord(Object.assign({}, RECORD_1, { Statut: 'Normal' }), 'VcDossiers');
      await h.sleep(50);
      const hiddenBox = document.createElement('div');
      hiddenBox.innerHTML = await ReaderMode.preview(html, 'VcDossiers', GristAPI.getCurrentRecord());
      const conditions = badges.map(b => JSON.stringify(b.condition));
      const pass = option.shown && option.checked && option.text === I18n.t('varLinked.inherit') && option.summary === '· Statut = Urgent'
        && option.title === I18n.t('varLinked.inheritTitle', { badge: '#VcAnnuaire.NomPrenom', summary: 'Statut = Urgent' })
        && JSON.stringify(badges.map(b => b.key)) === JSON.stringify(['VcAnnuaire.NomPrenom', 'VcAnnuaire.Telephone', 'VcAnnuaire.Naissance'])
        && conditions.every(c => c === JSON.stringify(COND_URGENT)) && (html.match(/data-condition=/g) || []).length === 3
        && ['Dupont Jean', '06 11 22 33 44', '1990'].every(part => shownBox.textContent.includes(part))
        && !/Dupont|06 11|1990/.test(hiddenBox.textContent);
      return { pass, notes: JSON.stringify({ option, badges, shown: shownBox.textContent, hidden: hiddenBox.textContent }) };
    },
  });

  cases.push({
    id: 'varlinked_inherit_can_be_unticked_and_is_checked_again_on_each_opening',
    description: 'Décochée, « Reprendre la condition d’affichage » insère les attributs sans condition (la variable d’origine garde la sienne) ; elle est de nouveau cochée à l’ouverture suivante ; traduite en anglais',
    run: async (h) => {
      await seed(h);
      Editor.setHTML(`<p>Responsable : ${badgeHtml('VcAnnuaire', 'NomPrenom', COND_URGENT)} fin</p>`);
      const ed = EditorCore.getEditor();
      let modal = await openLinked(h, 'NomPrenom');
      const row = inheritRow(modal);
      if (!row) { cancelLinked(modal); return NO_INHERIT_ROW; }
      const box = row.querySelector('input');
      box.checked = false;
      box.dispatchEvent(new Event('change', { bubbles: true }));
      tickLinked(modal, ['Telephone']);
      modal.querySelector('.var-modal-primary').click();
      await h.sleep(80);
      const inserted = badgeNodes(ed).map(b => ({ key: b.node.attrs.key, condition: b.node.attrs.condition }));
      // Deuxième ouverture, sur la même variable : cochée de nouveau.
      modal = await openLinked(h, 'NomPrenom');
      const reopened = inheritInfo(modal);
      cancelLinked(modal);
      // Anglais : la case et son info-bulle ont leur traduction (ni la clé, ni le texte français).
      const lang = I18n.getLang();
      let english = null;
      try {
        I18n.setLang('fr');
        const fr = [I18n.t('varLinked.inherit'), I18n.t('varLinked.inheritTitle', { badge: 'B', summary: 'S' })];
        I18n.setLang('en');
        modal = await openLinked(h, 'NomPrenom');
        english = { fr, info: inheritInfo(modal) };
        cancelLinked(modal);
      } finally {
        I18n.setLang(lang);
      }
      const pass = inserted.length === 2 && inserted[0].key === 'VcAnnuaire.NomPrenom' && JSON.stringify(inserted[0].condition) === JSON.stringify(COND_URGENT)
        && inserted[1].key === 'VcAnnuaire.Telephone' && inserted[1].condition == null
        && reopened.shown && reopened.checked
        && english.info.text === 'Reuse the display condition' && english.info.text !== english.fr[0]
        && english.info.title === 'Each variable inserted, or put in place of #VcAnnuaire.NomPrenom, gets the same display condition as #VcAnnuaire.NomPrenom: Statut = Urgent. Untick to place them without a condition.';
      return { pass, notes: JSON.stringify({ inserted, reopened, english }) };
    },
  });

  cases.push({
    id: 'varlinked_no_inherit_option_and_no_condition_when_origin_has_none',
    description: 'Une variable sans condition : la ligne « Reprendre la condition d’affichage » reste masquée et les attributs insérés n’en reçoivent aucune (comportement d’avant)',
    run: async (h) => {
      await seed(h);
      Editor.setHTML(`<p>Responsable : ${badgeHtml('VcAnnuaire', 'NomPrenom')} fin</p>`);
      const ed = EditorCore.getEditor();
      const modal = await openLinked(h, 'NomPrenom');
      const row = inheritRow(modal);
      if (!row) { cancelLinked(modal); return NO_INHERIT_ROW; }
      const hiddenRow = row.hidden;
      tickLinked(modal, ['Telephone', 'Naissance']);
      modal.querySelector('.var-modal-primary').click();
      await h.sleep(80);
      const html = Editor.getHTML();
      const conditions = badgeNodes(ed).map(b => b.node.attrs.condition);
      const pass = hiddenRow && conditions.length === 3 && conditions.every(c => c == null) && !html.includes('data-condition');
      return { pass, notes: JSON.stringify({ hiddenRow, conditions }) };
    },
  });

  // === « Remplacer » : les attributs cochés se mettent à la place de la bulle (demande d'Antoine, 2026-10-01) ===
  function replaceButton(modal) { return modal.querySelector('button.var-linked-replace'); }
  const NO_REPLACE_BUTTON = { pass: false, notes: 'bouton « Remplacer » absent de la fenêtre Autres attributs' };
  // Contenu du premier paragraphe : « #clé » pour une bulle, le texte sinon.
  function sequence(ed) {
    const seq = [];
    ed.state.doc.firstChild.forEach(n => seq.push(n.type.name === 'varBadge' ? '#' + n.attrs.key : n.text));
    return seq;
  }
  function selectedBadgeKey(ed) {
    const node = ed.state.selection.node;
    return node && node.type.name === 'varBadge' ? node.attrs.key : null;
  }
  // Bulle avec les réglages qu'une copie neuve n'aurait pas : condition, format, boucle.
  function configuredBadgeHtml(table, column, attrs) {
    const attr = (name, value) => ` ${name}="${JSON.stringify(value).replace(/"/g, '&quot;')}"`;
    let extra = '';
    if (attrs.condition) extra += attr('data-condition', attrs.condition);
    if (attrs.format) extra += attr('data-format', attrs.format);
    return `<span class="var-badge" data-table="${table}" data-column="${column}" data-key="${table}.${column}"${extra}></span>`;
  }

  cases.push({
    id: 'varlinked_replace_puts_the_checked_attribute_in_place_of_the_badge',
    description: 'Autres attributs : « Remplacer », entre « Annuler » et « Insérer », grisé tant que rien n’est coché, met l’attribut coché à la place de la bulle au lieu de l’ajouter après elle : le gras de la bulle reste, la bulle reste sélectionnée et l’éditeur reprend le focus, la lecture écrit le nouvel attribut, un seul Annuler rend l’ancienne bulle',
    run: async (h) => {
      await seed(h);
      Editor.setHTML(`<p>Responsable : <strong>${badgeHtml('VcAnnuaire', 'NomPrenom')}</strong> fin</p>`);
      const ed = EditorCore.getEditor();
      const original = sequence(ed);
      const modal = await openLinked(h, 'NomPrenom');
      const replaceBtn = replaceButton(modal);
      if (!replaceBtn) { cancelLinked(modal); return NO_REPLACE_BUTTON; }
      const order = Array.from(modal.querySelectorAll('.var-modal-actions button')).map(b => (b === replaceBtn ? 'replace' : b.classList.contains('var-modal-primary') ? 'insert' : 'cancel'));
      const disabledAtZero = replaceBtn.disabled;
      tickLinked(modal, ['Telephone']);
      const enabledAfterTick = !replaceBtn.disabled;
      const label = replaceBtn.textContent;
      const title = replaceBtn.title;
      replaceBtn.click();
      await h.sleep(150);
      const seq = sequence(ed);
      const marks = badgeNodes(ed)[0].node.marks.map(m => m.type.name);
      const selected = selectedBadgeKey(ed);
      const focused = document.querySelector('.tiptap').contains(document.activeElement);
      const closed = !visible(modal);
      const undone = ed.commands.undo();
      await h.sleep(100);
      const afterUndo = sequence(ed);
      const marksAfterUndo = badgeNodes(ed)[0].node.marks.map(m => m.type.name);
      ed.commands.redo();
      await h.sleep(100);
      const text = (await renderReader(Editor.getHTML())).querySelector('.reader-content').textContent;
      const pass = JSON.stringify(order) === JSON.stringify(['cancel', 'replace', 'insert']) && disabledAtZero && enabledAfterTick
        && label === I18n.t('varLinked.replace') && label === 'Remplacer' && title === I18n.t('varLinked.replaceTitle', { badge: '#VcAnnuaire.NomPrenom' })
        && closed && JSON.stringify(seq) === JSON.stringify(['Responsable : ', '#VcAnnuaire.Telephone', ' fin']) && marks.includes('bold')
        && selected === 'VcAnnuaire.Telephone' && focused
        && undone && JSON.stringify(afterUndo) === JSON.stringify(original) && marksAfterUndo.includes('bold')
        && text.includes('06 11 22 33 44') && !text.includes('Dupont Jean');
      return { pass, notes: JSON.stringify({ order, disabledAtZero, enabledAfterTick, label, title, closed, seq, marks, selected, focused, undone, afterUndo, marksAfterUndo, text }) };
    },
  });

  cases.push({
    id: 'varlinked_replace_with_several_attributes_is_one_undo_step',
    description: 'Autres attributs : plusieurs attributs cochés puis « Remplacer » - le premier prend la place de la bulle (même bulle), les autres suivent séparés par une espace, dans l’ordre de la table ; un seul Annuler rend la bulle d’origine',
    run: async (h) => {
      await seed(h);
      Editor.setHTML(`<p>Responsable : ${badgeHtml('VcAnnuaire', 'NomPrenom')} fin</p>`);
      const ed = EditorCore.getEditor();
      const original = sequence(ed);
      const modal = await openLinked(h, 'NomPrenom');
      const replaceBtn = replaceButton(modal);
      if (!replaceBtn) { cancelLinked(modal); return NO_REPLACE_BUTTON; }
      tickLinked(modal, ['Naissance', 'Telephone']);
      replaceBtn.click();
      await h.sleep(150);
      const seq = sequence(ed);
      const selected = selectedBadgeKey(ed);
      const undone = ed.commands.undo();
      await h.sleep(100);
      const afterOneUndo = sequence(ed);
      const pass = JSON.stringify(seq) === JSON.stringify(['Responsable : ', '#VcAnnuaire.Telephone', ' ', '#VcAnnuaire.Naissance', ' fin'])
        && selected === 'VcAnnuaire.Telephone' && undone && JSON.stringify(afterOneUndo) === JSON.stringify(original);
      return { pass, notes: JSON.stringify({ seq, selected, undone, afterOneUndo }) };
    },
  });

  cases.push({
    id: 'varlinked_replace_keeps_the_condition_unless_the_reuse_box_is_unticked',
    description: 'Autres attributs : la bulle qui remplace garde la condition d’affichage de l’ancienne (case « Reprendre la condition d’affichage » cochée d’office, la bulle reste masquée en lecture quand elle n’est pas remplie) ; décochée, elle n’en a plus',
    run: async (h) => {
      await seed(h);
      const ed = EditorCore.getEditor();
      Editor.setHTML(`<p>Responsable : ${badgeHtml('VcAnnuaire', 'NomPrenom', COND_URGENT)} fin</p>`);
      let modal = await openLinked(h, 'NomPrenom');
      if (!replaceButton(modal)) { cancelLinked(modal); return NO_REPLACE_BUTTON; }
      tickLinked(modal, ['Telephone']);
      replaceButton(modal).click();
      await h.sleep(150);
      const kept = badgeNodes(ed).map(b => ({ key: b.node.attrs.key, condition: b.node.attrs.condition }));
      const html = Editor.getHTML();
      const shownBox = document.createElement('div');
      shownBox.innerHTML = await ReaderMode.preview(html, 'VcDossiers', GristAPI.getCurrentRecord());
      window.__gristStub.fireRecord(Object.assign({}, RECORD_1, { Statut: 'Normal' }), 'VcDossiers');
      await h.sleep(50);
      const hiddenBox = document.createElement('div');
      hiddenBox.innerHTML = await ReaderMode.preview(html, 'VcDossiers', GristAPI.getCurrentRecord());
      window.__gristStub.fireRecord(Object.assign({}, RECORD_1), 'VcDossiers');
      await h.sleep(50);
      // Case décochée : la bulle qui remplace n'a plus de condition.
      Editor.setHTML(`<p>Responsable : ${badgeHtml('VcAnnuaire', 'NomPrenom', COND_URGENT)} fin</p>`);
      modal = await openLinked(h, 'NomPrenom');
      const box = inheritRow(modal).querySelector('input');
      box.checked = false;
      box.dispatchEvent(new Event('change', { bubbles: true }));
      tickLinked(modal, ['Telephone']);
      replaceButton(modal).click();
      await h.sleep(150);
      const dropped = badgeNodes(ed).map(b => ({ key: b.node.attrs.key, condition: b.node.attrs.condition }));
      const pass = kept.length === 1 && kept[0].key === 'VcAnnuaire.Telephone' && JSON.stringify(kept[0].condition) === JSON.stringify(COND_URGENT)
        && shownBox.textContent.includes('06 11 22 33 44') && !/06 11|Dupont/.test(hiddenBox.textContent)
        && dropped.length === 1 && dropped[0].key === 'VcAnnuaire.Telephone' && dropped[0].condition == null;
      return { pass, notes: JSON.stringify({ kept, shown: shownBox.textContent, hidden: hiddenBox.textContent, dropped }) };
    },
  });

  cases.push({
    id: 'varlinked_replace_keeps_the_format_only_for_a_column_of_the_same_kind',
    description: 'Autres attributs : « Remplacer » garde le format nombre (ou date) de la bulle quand la nouvelle colonne est aussi un nombre (ou une date), et l’enlève pour une colonne d’un autre genre - un format date sur un texte écrirait n’importe quoi',
    run: async (h) => {
      await seed(h);
      const stub = window.__gristStub;
      stub.setVariables('VcAnnuaire', { NomPrenom: 'Text', Telephone: 'Text', Naissance: 'Date', Embauche: 'Date', Age: 'Int', Salaire: 'Numeric' });
      stub.setRows('VcAnnuaire', [
        { id: 7, NomPrenom: 'Dupont Jean', Telephone: '06 11 22 33 44', Naissance: 631152000, Embauche: 1262304000, Age: 36, Salaire: 3200.5 },
        { id: 8, NomPrenom: 'Martin Anne', Telephone: '06 55 66 77 88', Naissance: 662688000, Embauche: 1293840000, Age: 35, Salaire: 2800 },
      ]);
      await GristAPI.refreshSchema();
      stub.fireRecord(Object.assign({}, RECORD_1), 'VcDossiers');
      await h.sleep(50);
      const ed = EditorCore.getEditor();
      const money = { type: 'number', style: 'fr', decimals: 2, currency: '€' };
      const longDate = { type: 'date', preset: VariableFormat.DATE_PRESETS[0].key, words: true };
      async function replaceWith(from, format, to) {
        Editor.setHTML(`<p>${configuredBadgeHtml('VcAnnuaire', from, { format })}</p>`);
        const modal = await openLinked(h, from);
        if (!replaceButton(modal)) { cancelLinked(modal); return null; }
        tickLinked(modal, [to]);
        replaceButton(modal).click();
        await h.sleep(120);
        const node = badgeNodes(ed)[0].node;
        return { key: node.attrs.key, format: node.attrs.format };
      }
      const got = {
        numberToInt: await replaceWith('Salaire', money, 'Age'),
        numberToText: await replaceWith('Salaire', money, 'Telephone'),
        numberToDate: await replaceWith('Salaire', money, 'Naissance'),
        dateToDate: await replaceWith('Naissance', longDate, 'Embauche'),
        dateToNumber: await replaceWith('Naissance', longDate, 'Salaire'),
        textStaysPlain: await replaceWith('Telephone', null, 'Salaire'),
      };
      if (Object.values(got).some(v => !v)) return NO_REPLACE_BUTTON;
      const pass = got.numberToInt.key === 'VcAnnuaire.Age' && JSON.stringify(got.numberToInt.format) === JSON.stringify(money)
        && got.numberToText.key === 'VcAnnuaire.Telephone' && got.numberToText.format == null
        && got.numberToDate.key === 'VcAnnuaire.Naissance' && got.numberToDate.format == null
        && got.dateToDate.key === 'VcAnnuaire.Embauche' && JSON.stringify(got.dateToDate.format) === JSON.stringify(longDate)
        && got.dateToNumber.key === 'VcAnnuaire.Salaire' && got.dateToNumber.format == null
        && got.textStaysPlain.key === 'VcAnnuaire.Salaire' && got.textStaysPlain.format == null;
      return { pass, notes: JSON.stringify(got) };
    },
  });

  cases.push({
    id: 'varlinked_replace_drops_a_loop_that_belongs_to_another_table',
    description: 'Autres attributs : une boucle ne suit que la table de sa bulle - une bulle d’une colonne Référence de la page qui porte encore une boucle (colonne devenue Référence depuis) la perd en passant à une colonne de la table référencée, au lieu de garder une boucle qui ne veut plus rien dire',
    run: async (h) => {
      await seed(h);
      const loop = { repeat: 'inline', table: 'VcAnnuaire', via: { table: 'VcDossiers', column: 'Responsable' }, empty: 'blank' };
      const html = badgeHtml('VcDossiers', 'Responsable').replace('<span ', `<span data-loop="${JSON.stringify(loop).replace(/"/g, '&quot;')}" data-loop-repeat="inline" `);
      Editor.setHTML(`<p>${html}</p>`);
      const ed = EditorCore.getEditor();
      const before = badgeNodes(ed)[0].node.attrs.loop;
      const modal = await openLinked(h, 'Responsable');
      if (!replaceButton(modal)) { cancelLinked(modal); return NO_REPLACE_BUTTON; }
      tickLinked(modal, ['Telephone']);
      replaceButton(modal).click();
      await h.sleep(150);
      const node = badgeNodes(ed)[0].node;
      const pass = !!before && node.attrs.key === 'VcAnnuaire.Telephone' && node.attrs.table === 'VcAnnuaire' && node.attrs.loop == null;
      return { pass, notes: JSON.stringify({ before, attrs: node.attrs }) };
    },
  });

  cases.push({
    id: 'varlinked_insert_and_replace_do_nothing_when_the_badge_is_gone',
    description: 'Autres attributs : si la bulle d’origine a été supprimée pendant le choix, ni « Insérer » ni « Remplacer » ne touchent au document - l’alerte le dit (rien inséré ni remplacé) et la fenêtre se ferme',
    run: async (h) => {
      await seed(h);
      const ed = EditorCore.getEditor();
      const realAlert = window.alert;
      const alerts = [];
      window.alert = message => { alerts.push(String(message)); };
      const outcomes = {};
      try {
        for (const which of ['insert', 'replace']) {
          Editor.setHTML(`<p>Responsable : ${badgeHtml('VcAnnuaire', 'NomPrenom')} fin</p>`);
          const modal = await openLinked(h, 'NomPrenom');
          if (!replaceButton(modal)) { cancelLinked(modal); return NO_REPLACE_BUTTON; }
          tickLinked(modal, ['Telephone']);
          // La bulle disparaît pendant que la fenêtre est ouverte (elle garde sa position d'ouverture).
          const found = badgeNodes(ed)[0];
          ed.view.dispatch(ed.state.tr.delete(found.pos, found.pos + found.node.nodeSize));
          (which === 'insert' ? modal.querySelector('.var-modal-primary') : replaceButton(modal)).click();
          await h.sleep(100);
          outcomes[which] = { text: ed.state.doc.textContent, badges: badgeNodes(ed).length, closed: !visible(modal) };
        }
      } finally {
        window.alert = realAlert;
      }
      const pass = alerts.length === 2 && alerts.every(a => a === I18n.t('varLinked.insertLost') && a === 'La variable a été déplacée ou supprimée pendant le choix : rien n’a été inséré ni remplacé.')
        && ['insert', 'replace'].every(k => outcomes[k] && outcomes[k].badges === 0 && outcomes[k].closed && outcomes[k].text === 'Responsable :  fin');
      return { pass, notes: JSON.stringify({ alerts, outcomes }) };
    },
  });

  cases.push({
    id: 'varlinked_replace_in_track_changes_mode_is_a_tracked_replacement',
    description: 'Suivi des modifications actif : « Remplacer » ne déclenche aucun refus de transaction ; l’ancienne bulle reste sous <del>, la nouvelle est sous <ins>, et « Tout refuser » rend la bulle d’origine',
    run: async (h) => {
      await seed(h);
      Editor.setHTML(`<p>Responsable : ${badgeHtml('VcAnnuaire', 'NomPrenom')} fin</p>`);
      const ed = EditorCore.getEditor();
      const warnings = [];
      const realWarn = console.warn;
      console.warn = (...args) => { warnings.push(args.map(String).join(' ')); realWarn.apply(console, args); };
      let result = null;
      try {
        if (!Editor.isTrackChangesOn()) await h.clickButton('v2-btn-track-changes');
        const modal = await openLinked(h, 'NomPrenom');
        if (!replaceButton(modal)) { cancelLinked(modal); return NO_REPLACE_BUTTON; }
        tickLinked(modal, ['Telephone']);
        replaceButton(modal).click();
        await h.sleep(200);
        const html = Editor.getHTML();
        // La bibliothèque de suivi remplace la sélection de la bulle par un curseur : la barre ne doit surtout pas rester ouverte sur la bulle barrée.
        const selectedNode = ed.state.selection.node;
        result = {
          onDeletedBadge: !!selectedNode && selectedNode.marks.some(m => m.type.name === 'deletion'),
          bar: toolbar().classList.contains('visible'),
          pending: Editor.hasPendingTrackedChanges(),
          keys: badgeNodes(ed).map(b => b.node.attrs.key),
          hasDel: /<del[^>]*>(?:(?!<\/del>).)*NomPrenom/s.test(html),
          hasIns: /<ins[^>]*>(?:(?!<\/ins>).)*Telephone/s.test(html),
          html,
        };
        await h.clickButton('v2-btn-reject-all');
        await h.sleep(200);
        result.afterReject = badgeNodes(ed).map(b => b.node.attrs.key);
      } finally {
        console.warn = realWarn;
        if (Editor.isTrackChangesOn()) await h.clickButton('v2-btn-track-changes');
      }
      const refused = warnings.filter(w => w.indexOf('transaction refusée') !== -1);
      const pass = refused.length === 0 && !!result && result.pending && result.hasDel && result.hasIns && !result.onDeletedBadge
        && JSON.stringify(result.afterReject) === JSON.stringify(['VcAnnuaire.NomPrenom']);
      return { pass, notes: JSON.stringify({ refused, result }) };
    },
  });

  cases.push({
    id: 'varlinked_replace_speaks_english',
    description: 'Interface en anglais : « Replace » avec son info-bulle, et la note sous la liste explique « Insert » et « Replace »',
    run: async (h) => {
      await seed(h);
      Editor.setHTML(`<p>${badgeHtml('VcAnnuaire', 'NomPrenom')}</p>`);
      const lang = I18n.getLang();
      let english = null;
      try {
        I18n.setLang('en');
        const modal = await openLinked(h, 'NomPrenom');
        const replaceBtn = replaceButton(modal);
        if (!replaceBtn) { cancelLinked(modal); return NO_REPLACE_BUTTON; }
        english = { label: replaceBtn.textContent, title: replaceBtn.title, note: modal.querySelector('.var-linked-note').textContent };
        cancelLinked(modal);
      } finally {
        I18n.setLang(lang);
      }
      const pass = english.label === 'Replace' && english.title === 'Replaces #VcAnnuaire.NomPrenom with the checked attributes instead of inserting them after it.'
        && english.note.includes('“Insert” adds the checked attributes right after the variable, separated by a space; “Replace” puts them in its place.');
      return { pass, notes: JSON.stringify(english) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.varCondition = cases;
})();
