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

  // La fenêtre de condition ouverte sur la bulle « Titre » d'une page sur VcDossiers : sa ligne de règle et ses deux lignes d'aperçu.
  async function openPreviewWindow(h, condition, readLatencyMs) {
    await seed(h);
    Editor.setHTML(`<p>Objet : ${badgeHtml('VcDossiers', 'Titre', condition)}</p>`);
    await selectBadge(h, 'Titre');
    if (readLatencyMs) window.__gristStub.setLatency({ fetchTable: readLatencyMs });
    pressToolbarButton('var-condition');
    await h.sleep(50);
    const modal = document.getElementById('var-condition-modal');
    // Les champs se relisent à chaque fois : choisir une colonne reconstruit celui de la valeur.
    return {
      modal,
      column: () => modal.querySelector('.macro-rule-row select.macro-rule-column'),
      value: () => modal.querySelector('.macro-rule-row .macro-rule-value'),
      lines: () => Array.from(modal.querySelectorAll('.var-condition-debug-line')).map(l => l.textContent),
    };
  }

  cases.push({
    id: 'varcond_preview_lines_say_each_outcome',
    description: 'Aperçu de la fenêtre de condition : sans colonne choisie, aucune ligne qui remplisse la condition, sans ligne sélectionnée, table vide, grande table (la première ligne qui la remplit est citée avec son repère), deux lignes sur trois (la première de la table est citée, pas la dernière) et lecture qui échoue ; la valeur n\'est lue que pour une ligne qui remplit la condition',
    run: async (h) => {
      const w = await openPreviewWindow(h);
      const results = {};
      const stub = window.__gristStub;
      const realRecord = GristAPI.getCurrentRecord;
      const realContext = LoopRules.createContext;
      const realWarn = console.warn;
      // La valeur ne se lit que pour une ligne qui remplit la condition : sans cela chaque aperçu relirait une valeur dont il n'affiche rien.
      const realResolve = Variables.resolveVariable;
      let valueReads = 0;
      Variables.resolveVariable = function () { valueReads += 1; return realResolve.apply(this, arguments); };
      try {
        await h.sleep(400);
        results.noColumn = w.lines();
        setSelect(w.column(), 'Statut');
        await h.sleep(30);
        valueReads = 0;
        setInput(w.value(), 'Zzz');
        await h.sleep(700);
        results.noMatch = w.lines();
        results.noMatchValueReads = valueReads;
        // Deux lignes sur trois remplissent la condition : la première citée est la première de la table, pas la dernière trouvée.
        valueReads = 0;
        setInput(w.value(), 'Urgent');
        await h.sleep(700);
        results.twoMatches = w.lines();
        results.twoMatchesValueReads = valueReads;
        GristAPI.getCurrentRecord = () => null;
        setInput(w.value(), 'Urgent');
        await h.sleep(700);
        results.noRecord = w.lines();
        GristAPI.getCurrentRecord = realRecord;
        stub.setRows('VcDossiers', []);
        setInput(w.value(), 'Normal');
        await h.sleep(700);
        results.emptyTable = w.lines();
        // 600 lignes : le parcours rend la main au navigateur deux fois (toutes les 250 lignes) ; la seule ligne « Urgent » est la dernière.
        stub.setRows('VcDossiers', Array.from({ length: 600 }, (_, i) => ({ id: i + 1, Titre: 'Dossier ' + (i + 1), Statut: i === 599 ? 'Urgent' : 'Normal', Responsable: 0, Montant: i })));
        valueReads = 0;
        setInput(w.value(), 'Urgent');
        await h.sleep(1200);
        results.bigTable = w.lines();
        results.bigTableValueReads = valueReads;
        console.warn = () => {};
        LoopRules.createContext = () => { throw new Error('lecture impossible (simulée)'); };
        setInput(w.value(), 'Normal');
        await h.sleep(700);
        results.unavailable = w.lines();
      } finally {
        GristAPI.getCurrentRecord = realRecord;
        LoopRules.createContext = realContext;
        console.warn = realWarn;
        Variables.resolveVariable = realResolve;
      }
      const tr = (key, vars) => I18n.t(key, vars);
      const met = tr('varCond.debug.currentMet', { id: 1, value: 'Dossier A' });
      const notMet = tr('varCond.debug.currentNotMet', { id: 1 });
      const expected = {
        noColumn: [tr('varCond.debug.chooseColumn'), ''],
        noMatch: [notMet, tr('varCond.debug.none', { table: 'VcDossiers', total: 3 })],
        noMatchValueReads: 0,
        twoMatches: [met, tr('varCond.debug.count', { table: 'VcDossiers', count: 2, total: 3 }) + ' ' + tr('varCond.debug.first', { id: 1, label: ' (Dossier A)', value: 'Dossier A' })],
        twoMatchesValueReads: 2,
        noRecord: [tr('varCond.debug.noRecord'), ''],
        emptyTable: [notMet, tr('linkConfig.previewTableEmpty', { table: 'VcDossiers' })],
        bigTable: [met, tr('varCond.debug.count', { table: 'VcDossiers', count: 1, total: 600 }) + ' ' + tr('varCond.debug.first', { id: 600, label: ' (Dossier 600)', value: 'Dossier 600' })],
        bigTableValueReads: 2,
        unavailable: [tr('linkConfig.previewUnavailable'), ''],
      };
      const pass = JSON.stringify(results) === JSON.stringify(expected) && results.noMatch[1] === 'Dans « VcDossiers » : aucune des 3 lignes ne remplit la condition.'
        && results.bigTable[1].indexOf('1 ligne sur 600 remplit la condition. Première : n° 600 (Dossier 600)') !== -1 && results.emptyTable[1] === '« VcDossiers » est vide.';
      return { pass, notes: JSON.stringify(results) };
    },
  });

  cases.push({
    id: 'varcond_preview_of_a_condition_changed_meanwhile_is_dropped',
    description: 'Aperçu de la fenêtre de condition : quand la colonne est retirée pendant qu\'une lecture lente est en cours - celle de la table de la page (pleine ou vide) ou celle d\'une table liée -, le résultat de cette lecture n\'est jamais affiché',
    run: async (h) => {
      const w = await openPreviewWindow(h);
      const results = {};
      const stub = window.__gristStub;
      try {
        setSelect(w.column(), 'Statut');
        await h.sleep(30);
        setInput(w.value(), 'Urgent');
        await h.sleep(700);
        results.computed = w.lines();
        stub.setLatency({ fetchTable: 600 });
        setInput(w.value(), 'Normal');
        // L'aperçu se lance 250 ms après la saisie : à 450 ms, la lecture de la table est en cours.
        await h.sleep(450);
        setSelect(w.column(), '');
        await h.sleep(300);
        results.cleared = w.lines();
        await h.sleep(900);
        results.later = w.lines();
        // Même chose quand c'est la ligne sélectionnée qui attend : sa règle lit une autre table (lente) au moment où la colonne est retirée.
        stub.setLatency(0);
        const linked = { mode: 'all', rules: [{ column: 'VcAnnuaire.NomPrenom', operator: '=', value: 'Dupont Jean' }] };
        const v = await openPreviewWindow(h, linked, 600);
        await h.sleep(150);
        setSelect(v.column(), '');
        await h.sleep(300);
        results.linkedCleared = v.lines();
        await h.sleep(900);
        results.linkedLater = v.lines();
        // Table de la page vide (lecture lente) : « est vide » d'une lecture dépassée ne s'affiche pas non plus.
        const e = await openPreviewWindow(h, undefined, 600);
        stub.setRows('VcDossiers', []);
        setSelect(e.column(), 'Statut');
        await h.sleep(30);
        setInput(e.value(), 'Normal');
        await h.sleep(450);
        setSelect(e.column(), '');
        await h.sleep(300);
        results.emptyCleared = e.lines();
        await h.sleep(900);
        results.emptyLater = e.lines();
      } finally {
        stub.setLatency(0);
      }
      const chooseColumn = [I18n.t('varCond.debug.chooseColumn'), ''];
      const pass = results.computed.length === 2 && results.computed[0] === I18n.t('varCond.debug.currentMet', { id: 1, value: 'Dossier A' })
        && results.computed[1].indexOf(I18n.t('varCond.debug.count', { table: 'VcDossiers', count: 2, total: 3 })) === 0
        && JSON.stringify(results.cleared) === JSON.stringify(chooseColumn) && JSON.stringify(results.later) === JSON.stringify(chooseColumn)
        && JSON.stringify(results.linkedCleared) === JSON.stringify(chooseColumn) && JSON.stringify(results.linkedLater) === JSON.stringify(chooseColumn)
        && JSON.stringify(results.emptyCleared) === JSON.stringify(chooseColumn) && JSON.stringify(results.emptyLater) === JSON.stringify(chooseColumn);
      return { pass, notes: JSON.stringify(results) };
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
    id: 'varlinked_replace_keeps_the_yes_no_style_for_another_boolean_column',
    description: 'Autres attributs : « Remplacer » garde le style Oui / Non (case) de la bulle quand la nouvelle colonne est aussi un Oui / Non, comme « Colonne… », et l’enlève pour une colonne d’un autre genre ; une bulle sans style n’en prend pas',
    run: async (h) => {
      await seed(h);
      const stub = window.__gristStub;
      stub.setVariables('VcAnnuaire', { NomPrenom: 'Text', Actif: 'Bool', Valide: 'Bool', Age: 'Int' });
      stub.setRows('VcAnnuaire', [
        { id: 7, NomPrenom: 'Dupont Jean', Actif: true, Valide: false, Age: 36 },
        { id: 8, NomPrenom: 'Martin Anne', Actif: false, Valide: true, Age: 35 },
      ]);
      await GristAPI.refreshSchema();
      stub.fireRecord(Object.assign({}, RECORD_1), 'VcDossiers');
      await h.sleep(50);
      const ed = EditorCore.getEditor();
      const style = { type: 'bool', style: 'classic' };
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
        boolToBool: await replaceWith('Actif', style, 'Valide'),
        boolToNumber: await replaceWith('Actif', style, 'Age'),
        boolToText: await replaceWith('Actif', style, 'NomPrenom'),
        plainBoolStaysPlain: await replaceWith('Actif', null, 'Valide'),
      };
      if (Object.values(got).some(v => !v)) return NO_REPLACE_BUTTON;
      const pass = got.boolToBool.key === 'VcAnnuaire.Valide' && JSON.stringify(got.boolToBool.format) === JSON.stringify(style)
        && got.boolToNumber.key === 'VcAnnuaire.Age' && got.boolToNumber.format == null
        && got.boolToText.key === 'VcAnnuaire.NomPrenom' && got.boolToText.format == null
        && got.plainBoolStaysPlain.key === 'VcAnnuaire.Valide' && got.plainBoolStaysPlain.format == null;
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

  // === Texte « Avant » / « Après » d'une bulle (demande d'Antoine, 2026-10-08) ===
  // « Mettre une virgule que si la variable est activée par sa condition » : deux champs de la fenêtre de condition (js/variable-condition.js), attributs `before` et
  // `after` du nœud (data-before / data-after, js/editor-nodes.js), écrits par js/reader-mode.js:withAffixes seulement quand la bulle montre une valeur - la Lecture, le
  // PDF, le Word, l'Excel et les en-têtes passent tous par cette résolution. Aides communes : js/variable-format.js (affix, affixes, withAffixes).
  const attrText = text => String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  function affixBadge(column, o) {
    const opts = o || {};
    const table = opts.table || 'VcDossiers';
    const condition = opts.condition ? ` data-condition="${attrText(JSON.stringify(opts.condition))}"` : '';
    const before = opts.before == null ? '' : ` data-before="${attrText(opts.before)}"`;
    const after = opts.after == null ? '' : ` data-after="${attrText(opts.after)}"`;
    return `<span class="var-badge" data-table="${table}" data-column="${column}" data-key="${table}.${column}"${condition}${before}${after}${opts.extra || ''}></span>`;
  }
  function paragraphTexts(html) {
    const box = document.createElement('div');
    box.innerHTML = html;
    return Array.from(box.querySelectorAll('p')).map(p => p.textContent);
  }
  const affixOf = node => [node.attrs.before || null, node.attrs.after || null];
  const AFFIX_LOOP = { repeat: 'inline', table: 'VcContacts', empty: 'hide', separator: ', ', lastSeparator: ' et ' };

  cases.push({
    id: 'varcond_affix_attrs_roundtrip',
    description: 'Le texte « Avant » / « Après » d’une bulle survit à l’aller-retour HTML (data-before, data-after) avec ses espaces ; borné à 40 signes, sans saut de ligne ; une bulle qui n’en a pas ne porte rien ; l’éditeur le montre dans la bulle sans l’ajouter à son texte',
    run: async (h) => {
      await seed(h);
      const long = 'x'.repeat(60);
      Editor.setHTML(`<p>${affixBadge('Titre', { before: '(', after: ', ' })} ${affixBadge('Statut')} ${affixBadge('Montant', { after: '' })} ${affixBadge('Responsable', { before: 'a\tb\nc', after: long })}</p>`);
      const ed = EditorCore.getEditor();
      const attrs = badgeNodes(ed).map(n => affixOf(n.node));
      const box = document.createElement('div');
      box.innerHTML = Editor.getHTML();
      const saved = Array.from(box.querySelectorAll('span.var-badge')).map(s => [s.getAttribute('data-before'), s.getAttribute('data-after')]);
      const chips = Array.from(document.querySelectorAll('.tiptap .var-badge .var-badge-affix'));
      const expected = [['(', ', '], [null, null], [null, null], ['a b c', 'x'.repeat(40)]];
      const pass = JSON.stringify(attrs) === JSON.stringify(expected) && JSON.stringify(saved) === JSON.stringify(expected)
        && JSON.stringify(chips.map(c => c.getAttribute('data-text'))) === JSON.stringify(['(', ', ', 'a b c', 'x'.repeat(40)]) && chips.every(c => c.textContent === '');
      return { pass, notes: JSON.stringify({ attrs, saved, chips: chips.map(c => c.getAttribute('data-text')) }) };
    },
  });

  cases.push({
    id: 'varcond_affix_helpers_keep_spaces_and_skip_blank_values',
    description: 'VariableFormat.affix / affixes / withAffixes : espaces gardées (une espace seule compte), 40 signes au plus, caractères de contrôle remplacés, entrée qui n’est pas du texte ignorée ; rien n’entoure une valeur vide ou faite d’espaces',
    run: async () => {
      const VF = VariableFormat;
      const around = VF.affixes('(', ')');
      const checks = {
        spaceKept: VF.affix(' ') === ' ' && VF.affix(', ') === ', ',
        empty: VF.affix('') === null && VF.affix(null) === null && VF.affix(undefined) === null && VF.affix(5) === null && VF.affix({}) === null,
        control: VF.affix('a\r\nb\u0000') === 'a  b ',
        max: VF.affix('y'.repeat(41)) === 'y'.repeat(40) && VF.AFFIX_MAX === 40,
        pair: JSON.stringify(VF.affixes('(', null)) === '{"before":"(","after":null}' && VF.affixes('', undefined) === null && VF.affixes(null, ' ') !== null,
        around: VF.withAffixes('Dossier A', around) === '(Dossier A)' && VF.withAffixes('x', null) === 'x',
        blank: VF.withAffixes('', around) === '' && VF.withAffixes('  ', around) === '  ' && VF.withAffixes(null, around) === null,
      };
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify(checks) };
    },
  });

  cases.push({
    id: 'varcond_affix_reader_and_export_write_only_with_a_value',
    description: 'Lecture et export (ReaderMode.preview, commun au PDF, au Word et à l’email) : le texte « Avant » / « Après » s’écrit avec la valeur - sans condition comme avec une condition remplie -, disparaît avec la bulle quand la condition est fausse et ne s’écrit pas autour d’une valeur vide',
    run: async (h) => {
      await seed(h);
      const html = [
        `<p>A ${affixBadge('Titre', { before: '(', after: ')' })} B</p>`,
        `<p>C${affixBadge('Titre', { condition: COND_NORMAL, before: '[', after: ', ' })}D</p>`,
        `<p>E${affixBadge('Titre', { condition: COND_URGENT, after: ', ' })}F</p>`,
        `<p>G${affixBadge('Titre', { before: ' - ' })}H</p>`,
      ].join('');
      const results = {};
      const readerParagraphs = async () => Array.from((await renderReader(html)).querySelectorAll('.reader-content p')).map(p => p.textContent);
      results.reader = await readerParagraphs();
      results.preview = paragraphTexts(await ReaderMode.preview(html, 'VcDossiers', GristAPI.getCurrentRecord()));
      // Valeur vide : ni parenthèses ni virgule autour de rien.
      window.__gristStub.fireRecord(Object.assign({}, RECORD_1, { Titre: '' }), 'VcDossiers');
      await h.sleep(50);
      results.readerEmpty = await readerParagraphs();
      results.previewEmpty = paragraphTexts(await ReaderMode.preview(html, 'VcDossiers', GristAPI.getCurrentRecord()));
      const written = ['A (Dossier A) B', 'CD', 'EDossier A, F', 'G - Dossier AH'];
      const blank = ['A  B', 'CD', 'EF', 'GH'];
      const pass = JSON.stringify(results.reader) === JSON.stringify(written) && JSON.stringify(results.preview) === JSON.stringify(written)
        && JSON.stringify(results.readerEmpty) === JSON.stringify(blank) && JSON.stringify(results.previewEmpty) === JSON.stringify(blank);
      return { pass, notes: JSON.stringify(results) };
    },
  });

  cases.push({
    id: 'varcond_affix_header_and_footer_follow_the_same_rule',
    description: 'En-tête et pied de page (aperçu paginé de la Lecture, même résolution que le PDF et le Word) : le texte « Avant » / « Après » suit la valeur, que la bulle soit seule, en boucle dans la phrase ou conditionnelle',
    run: async (h) => {
      await seed(h);
      h.setA4Preview(true);
      const results = {};
      try {
        const loopAttrs = ` data-loop="${attrText(JSON.stringify(AFFIX_LOOP))}" data-loop-repeat="inline"`;
        const hf = {
          enabled: true, differentFirstPage: false,
          header: { default: `<p>En-tête [${affixBadge('Titre', { condition: COND_NORMAL, before: '(', after: ')' })}] [${affixBadge('Titre', { condition: COND_URGENT, before: '(', after: ')' })}]</p>`, first: '' },
          footer: { default: `<p>Pied ${affixBadge('Statut', { before: '/ ', after: ' !' })} ${affixBadge('Nom', { table: 'VcContacts', before: '<', after: '>', extra: loopAttrs })}</p>`, first: '' },
        };
        const read = async () => {
          const reader = await renderReader('<p>Corps</p>', hf);
          return { header: reader.querySelector('.v2-page-edge-top').textContent, footer: reader.querySelector('.v2-page-edge-bottom').textContent };
        };
        results.shown = await read();
        window.__gristStub.fireRecord(Object.assign({}, RECORD_1, { Titre: '', Statut: '' }), 'VcDossiers');
        await h.sleep(50);
        results.empty = await read();
      } finally {
        h.setA4Preview(false);
      }
      const pass = results.shown.header.includes('En-tête [] [(Dossier A)]') && results.shown.footer.includes('Pied / Urgent ! <Xavier et Yvonne>')
        && results.empty.header.includes('En-tête [] []') && results.empty.footer.includes('Pied  <Xavier et Yvonne>') && !results.empty.footer.includes('/');
      return { pass, notes: JSON.stringify(results) };
    },
  });

  cases.push({
    id: 'varcond_affix_wraps_a_loop_an_image_and_stays_in_the_value_style',
    description: 'Le texte « Avant » / « Après » entoure une fois la suite d’une boucle dans la phrase et une image de colonne Pièces jointes, et se range dans la même balise que la valeur (gras, taille et couleur de la bulle)',
    run: async (h) => {
      await seed(h);
      const stub = window.__gristStub;
      stub.setVariables('VcDossiers', { Titre: 'Text', Statut: 'Text', Responsable: 'Ref:VcAnnuaire', Montant: 'Numeric', Photo: 'Attachments' });
      stub.setRows('VcDossiers', [{ id: 1, Titre: 'Dossier A', Statut: 'Urgent', Responsable: 7, Montant: 1200, Photo: ['L', 11] }]);
      await GristAPI.refreshSchema();
      stub.fireRecord(Object.assign({}, RECORD_1, { Photo: ['L', 11] }), 'VcDossiers');
      await h.sleep(60);
      const loopAttrs = ` data-loop="${attrText(JSON.stringify(AFFIX_LOOP))}" data-loop-repeat="inline"`;
      const html = `<p>${affixBadge('Nom', { table: 'VcContacts', before: '(', after: ')', extra: loopAttrs })}</p>`
        + `<p>${affixBadge('Photo', { before: '[', after: ']' })}</p>`
        + `<p><strong>${affixBadge('Titre', { after: ',' })}</strong> suite</p>`;
      const box = document.createElement('div');
      box.innerHTML = await ReaderMode.preview(html, 'VcDossiers', GristAPI.getCurrentRecord());
      const [loop, photo, bold] = Array.from(box.querySelectorAll('p'));
      const photoNodes = Array.from(photo.childNodes).map(n => (n.nodeType === Node.TEXT_NODE ? n.textContent : n.nodeName.toLowerCase()));
      const boldValue = bold.querySelector('strong > .resolved-var');
      const pass = loop.textContent === '(Xavier et Yvonne)' && JSON.stringify(photoNodes) === JSON.stringify(['[', 'img', ']'])
        && !!boldValue && boldValue.textContent === 'Dossier A,' && bold.textContent === 'Dossier A, suite';
      return { pass, notes: JSON.stringify({ loop: loop.textContent, photoNodes, bold: bold.innerHTML }) };
    },
  });

  cases.push({
    id: 'varcond_affix_window_saves_keeps_and_clears_the_text',
    description: 'Fenêtre de condition d’une bulle : deux champs « Avant » et « Après » (40 signes, espaces compris) sous les règles ; Enregistrer pose la condition et le texte en un seul pas d’annulation, l’aperçu cite la valeur avec son texte, Retirer la condition garde le texte, vider les deux champs le retire du HTML',
    run: async (h) => {
      await seed(h);
      Editor.setHTML(`<p>Objet : ${badgeHtml('VcDossiers', 'Titre')}</p>`);
      const ed = EditorCore.getEditor();
      let modal = await openWindow(h, 'Titre');
      const before = () => modal.querySelector('#var-condition-before');
      const after = () => modal.querySelector('#var-condition-after');
      const row = modal.querySelector('.var-condition-affix');
      const opened = {
        shown: visible(modal) && !!row && !row.hidden && row.getClientRects().length > 0,
        labels: [modal.querySelector('label[for="var-condition-before"]').textContent, modal.querySelector('label[for="var-condition-after"]').textContent],
        empty: before().value === '' && after().value === '', max: [before().maxLength, after().maxLength],
        hint: modal.querySelector('.var-condition-affix .var-loop-hint').textContent,
      };
      const rule = modal.querySelector('.macro-rule-row');
      setSelect(rule.querySelector('select.macro-rule-column'), 'Statut');
      await h.sleep(30);
      setInput(rule.querySelector('.macro-rule-value'), 'Urgent');
      setInput(before(), '(');
      setInput(after(), '), ');
      await h.sleep(700);
      const debug = Array.from(modal.querySelectorAll('.var-condition-debug-line')).map(l => l.textContent);
      saveWindow(modal);
      await h.sleep(80);
      const saved = { condition: badgeNodes(ed)[0].node.attrs.condition, around: affixOf(badgeNodes(ed)[0].node), html: Editor.getHTML(), closed: !visible(conditionModal()) };
      // Un seul Annuler rend la bulle d'avant, condition et texte ensemble ; Rétablir les remet.
      ed.commands.undo();
      await h.sleep(80);
      const undone = { condition: badgeNodes(ed)[0].node.attrs.condition || null, around: affixOf(badgeNodes(ed)[0].node) };
      ed.commands.redo();
      await h.sleep(80);
      const redone = { condition: badgeNodes(ed)[0].node.attrs.condition, around: affixOf(badgeNodes(ed)[0].node) };
      modal = await openWindow(h, 'Titre');
      const reopened = { values: [before().value, after().value], removeShown: !modal.querySelector('.var-modal-danger').hidden };
      modal.querySelector('.var-modal-danger').click();
      await h.sleep(80);
      const removed = { condition: badgeNodes(ed)[0].node.attrs.condition || null, around: affixOf(badgeNodes(ed)[0].node) };
      modal = await openWindow(h, 'Titre');
      const kept = [before().value, after().value];
      setInput(before(), '');
      setInput(after(), '');
      saveWindow(modal);
      await h.sleep(80);
      const cleared = { around: affixOf(badgeNodes(ed)[0].node), html: Editor.getHTML() };
      const around = ['(', '), '];
      const pass = opened.shown && opened.labels.join('|') === 'Avant|Après' && opened.empty && opened.max.join() === '40,40' && opened.hint === 'Écrits seulement si la variable s’affiche avec une valeur.'
        && debug[0] === I18n.t('varCond.debug.currentMet', { id: 1, value: '(Dossier A), ' }) && debug[1].includes('2 lignes sur 3 remplissent la condition')
        && saved.closed && JSON.stringify(saved.condition) === JSON.stringify(COND_URGENT) && JSON.stringify(saved.around) === JSON.stringify(around)
        && saved.html.includes('data-before="("') && saved.html.includes('data-after="), "') && saved.html.includes('data-condition')
        && undone.condition === null && JSON.stringify(undone.around) === '[null,null]'
        && JSON.stringify(redone.condition) === JSON.stringify(COND_URGENT) && JSON.stringify(redone.around) === JSON.stringify(around)
        && JSON.stringify(reopened.values) === JSON.stringify(around) && reopened.removeShown
        && removed.condition === null && JSON.stringify(removed.around) === JSON.stringify(around) && JSON.stringify(kept) === JSON.stringify(around)
        && JSON.stringify(cleared.around) === '[null,null]' && !cleared.html.includes('data-before') && !cleared.html.includes('data-after');
      return { pass, notes: JSON.stringify({ opened, debug, saved, undone, redone, reopened, removed, kept, cleared }) };
    },
  });

  cases.push({
    id: 'varcond_affix_window_cancel_leaves_the_bubble_alone',
    description: 'Fenêtre de condition : Annuler ne touche pas à la bulle, et la fenêtre rouverte reprend le texte « Avant » / « Après » enregistré, pas celui qui a été tapé puis abandonné',
    run: async (h) => {
      await seed(h);
      Editor.setHTML(`<p>Objet : ${affixBadge('Titre', { condition: COND_URGENT, before: '(', after: ')' })}</p>`);
      const htmlBefore = Editor.getHTML();
      let modal = await openWindow(h, 'Titre');
      const values = () => [modal.querySelector('#var-condition-before').value, modal.querySelector('#var-condition-after').value];
      const opened = values();
      setInput(modal.querySelector('#var-condition-before'), 'XX');
      setInput(modal.querySelector('#var-condition-after'), '');
      cancelWindow(modal);
      await h.sleep(60);
      const unchanged = Editor.getHTML() === htmlBefore && !visible(conditionModal());
      modal = await openWindow(h, 'Titre');
      const reopened = values();
      cancelWindow(modal);
      const pass = JSON.stringify(opened) === '["(",")"]' && unchanged && JSON.stringify(reopened) === '["(",")"]';
      return { pass, notes: JSON.stringify({ opened, unchanged, reopened }) };
    },
  });

  cases.push({
    id: 'varcond_affix_fields_are_only_for_variables',
    description: 'Les champs « Avant » / « Après » ne sont que dans la fenêtre d’une bulle : celle d’un bloc, d’une valeur ou d’une case conditionnels ne les montre pas, et la fenêtre les remontre pour la bulle suivante',
    run: async (h) => {
      await seed(h);
      Editor.setHTML(`<p>${affixBadge('Titre', { before: '(' })}</p><div class="conditional-text"><p>Bloc</p></div><p>Début <span class="conditional-value">valeur</span> fin</p><p><span class="conditional-checkbox">☐</span> case</p>`);
      const ed = EditorCore.getEditor();
      const found = [];
      ed.state.doc.descendants((node, pos) => {
        if (['varBadge', 'conditionalText', 'conditionalValue', 'conditionalCheckbox'].includes(node.type.name)) found.push({ type: node.type.name, pos });
      });
      const order = ['varBadge', 'conditionalText', 'conditionalValue', 'conditionalCheckbox', 'varBadge'];
      const states = [];
      for (const type of order) {
        const target = found.find(f => f.type === type);
        if (!target) { states.push({ type, missing: true }); continue; }
        VariableCondition.open(ed, target.pos);
        await h.sleep(60);
        const modal = conditionModal();
        const row = modal.querySelector('.var-condition-affix');
        states.push({ type, shown: visible(modal) && !row.hidden && row.getClientRects().length > 0 });
        cancelWindow(modal);
        await h.sleep(30);
      }
      const pass = JSON.stringify(states.map(s => s.shown)) === '[true,false,false,false,true]';
      return { pass, notes: JSON.stringify(states) };
    },
  });

  cases.push({
    id: 'varcond_affix_preview_shows_the_value_as_it_will_be_written',
    description: 'Aperçu de la fenêtre de condition : sans règle mais avec du texte « Avant » / « Après » la variable s’affiche toujours (une ligne, sans compte de lignes) ; avec une règle, la valeur est citée avec son texte quand la condition est remplie et sans quand elle ne l’est pas',
    run: async (h) => {
      await seed(h);
      Editor.setHTML(`<p>Objet : ${badgeHtml('VcDossiers', 'Titre')}</p>`);
      const modal = await openWindow(h, 'Titre');
      const lines = () => Array.from(modal.querySelectorAll('.var-condition-debug-line')).map(l => l.textContent);
      const results = {};
      await h.sleep(400);
      results.empty = lines();
      setInput(modal.querySelector('#var-condition-after'), ',');
      await h.sleep(700);
      results.alwaysShown = lines();
      setInput(modal.querySelector('#var-condition-after'), '');
      await h.sleep(700);
      results.cleared = lines();
      setInput(modal.querySelector('#var-condition-after'), ',');
      const rule = modal.querySelector('.macro-rule-row');
      setSelect(rule.querySelector('select.macro-rule-column'), 'Statut');
      await h.sleep(30);
      setInput(modal.querySelector('.macro-rule-row .macro-rule-value'), 'Normal');
      await h.sleep(700);
      results.unmet = lines();
      setInput(modal.querySelector('.macro-rule-row .macro-rule-value'), 'Urgent');
      await h.sleep(700);
      results.met = lines();
      cancelWindow(modal);
      const chooseColumn = [I18n.t('varCond.debug.chooseColumn'), ''];
      const pass = JSON.stringify(results.empty) === JSON.stringify(chooseColumn) && JSON.stringify(results.cleared) === JSON.stringify(chooseColumn)
        && JSON.stringify(results.alwaysShown) === JSON.stringify([I18n.t('varCond.debug.currentShown', { id: 1, value: 'Dossier A,' }), ''])
        && results.alwaysShown[0] === 'Ligne sélectionnée (n° 1) : la variable affiche « Dossier A, ».'
        && results.unmet[0] === I18n.t('varCond.debug.currentNotMet', { id: 1 }) && !results.unmet[0].includes('Dossier A')
        && results.met[0] === I18n.t('varCond.debug.currentMet', { id: 1, value: 'Dossier A,' }) && results.met[1].includes('2 lignes sur 3 remplissent la condition');
      return { pass, notes: JSON.stringify(results) };
    },
  });

  cases.push({
    id: 'varcond_affix_lights_the_condition_button',
    description: 'L’icône de condition de la barre flottante est allumée pour une bulle qui a du texte « Avant » / « Après », même sans condition, et éteinte pour une bulle qui n’a rien',
    run: async (h) => {
      await seed(h);
      Editor.setHTML(`<p>${affixBadge('Titre', { after: ',' })} ${badgeHtml('VcDossiers', 'Statut')} ${affixBadge('Montant', { condition: COND_URGENT })}</p>`);
      const active = {};
      for (const column of ['Titre', 'Statut', 'Montant']) {
        await selectBadge(h, column);
        active[column] = toolbarButton('var-condition').classList.contains('is-active');
      }
      return { pass: active.Titre === true && active.Statut === false && active.Montant === true, notes: JSON.stringify(active) };
    },
  });

  cases.push({
    id: 'varcond_affix_speaks_english',
    description: 'Interface en anglais : « Before » / « After », leur info-bulle, l’indication sous les champs et la ligne d’aperçu ; chaque phrase du texte « Avant » / « Après » est traduite',
    run: async (h) => {
      await seed(h);
      Editor.setHTML(`<p>Objet : ${affixBadge('Titre', { before: '(', after: ')' })}</p>`);
      const keys = ['varCond.affixBefore', 'varCond.affixAfter', 'varCond.affixBeforeTitle', 'varCond.affixAfterTitle', 'varCond.affixHint', 'varCond.debug.currentShown'];
      const lang = I18n.getLang();
      let english = null;
      let untranslated = null;
      try {
        I18n.setLang('fr');
        const fr = keys.map(k => I18n.t(k, { id: 1, value: 'V' }));
        I18n.setLang('en');
        const en = keys.map(k => I18n.t(k, { id: 1, value: 'V' }));
        untranslated = keys.filter((k, i) => en[i] === fr[i] || en[i] === k);
        const modal = await openWindow(h, 'Titre');
        await h.sleep(700);
        english = {
          labels: [modal.querySelector('label[for="var-condition-before"]').textContent, modal.querySelector('label[for="var-condition-after"]').textContent],
          titles: [modal.querySelector('#var-condition-before').title, modal.querySelector('#var-condition-after').title],
          hint: modal.querySelector('.var-condition-affix .var-loop-hint').textContent,
          line: modal.querySelector('.var-condition-debug-line').textContent,
        };
        cancelWindow(modal);
      } finally {
        I18n.setLang(lang);
      }
      const pass = untranslated.length === 0 && english.labels.join('|') === 'Before|After'
        && english.titles[0] === 'Text written right before the value, for example a comma or a parenthesis. Spaces count.'
        && english.titles[1] === 'Text written right after the value, for example a comma or a parenthesis. Spaces count.'
        && english.hint === 'Only written if the variable is shown with a value.' && english.line === 'Selected row (#1): the variable shows “(Dossier A)”.';
      return { pass, notes: JSON.stringify({ untranslated, english }) };
    },
  });

  cases.push({
    id: 'varcond_affix_word_and_pdf_keep_the_text_and_its_spaces',
    description: 'Export Word et PDF : le texte « Avant » / « Après » s’écrit avec la valeur, espaces comprises, et disparaît avec une bulle dont la condition est fausse',
    run: async (h) => {
      await seed(h);
      const html = `<p>Voir ${affixBadge('Titre', { condition: COND_URGENT, before: '(', after: ') ' })}puis ${affixBadge('Titre', { condition: COND_NORMAL, after: ', ' })}fin.</p>`;
      const resolved = await ReaderMode.preview(html, 'VcDossiers', GristAPI.getCurrentRecord());
      const parts = await h.exportDocxParts(resolved);
      const docx = h.docxParagraphs(parts.doc).map(p => p.text).filter(t => t.trim());
      const pdf = await h.exportPdfContent(resolved);
      const pdfTexts = h.findTextBlocks(pdf.content, b => h.blockPlainText(b).includes('Voir')).map(b => h.blockPlainText(b));
      const expected = 'Voir (Dossier A) puis fin.';
      const pass = docx.length === 1 && docx[0] === expected && pdfTexts.includes(expected);
      return { pass, notes: JSON.stringify({ resolved, docx, pdfTexts }) };
    },
  });

  cases.push({
    id: 'varcond_affix_stays_on_its_variable_when_attributes_are_inserted_or_replaced',
    description: 'Autres attributs : « Insérer » laisse le texte « Avant » / « Après » à la bulle d’origine (la virgule n’est pas recopiée sur les attributs ajoutés) ; « Remplacer » et le changement de colonne le gardent sur la bulle qui change de colonne',
    run: async (h) => {
      await seed(h);
      const original = affixBadge('NomPrenom', { table: 'VcAnnuaire', before: '(', after: ')' });
      const state = ed => badgeNodes(ed).map(b => ({ key: b.node.attrs.key, around: affixOf(b.node) }));
      Editor.setHTML(`<p>Responsable : ${original} fin</p>`);
      const ed = EditorCore.getEditor();
      let modal = await openLinked(h, 'NomPrenom');
      tickLinked(modal, ['Telephone']);
      modal.querySelector('.var-modal-primary').click();
      await h.sleep(100);
      const inserted = state(ed);
      Editor.setHTML(`<p>Responsable : ${original} fin</p>`);
      modal = await openLinked(h, 'NomPrenom');
      const replaceBtn = replaceButton(modal);
      if (!replaceBtn) { cancelLinked(modal); return NO_REPLACE_BUTTON; }
      tickLinked(modal, ['Telephone']);
      replaceBtn.click();
      await h.sleep(150);
      const replaced = state(ed);
      const node = badgeNodes(ed)[0].node;
      const moved = VariableColumn.replacementAttrs(node, { table: 'VcAnnuaire', column: 'NomPrenom', key: 'VcAnnuaire.NomPrenom' });
      const pass = JSON.stringify(inserted) === JSON.stringify([{ key: 'VcAnnuaire.NomPrenom', around: ['(', ')'] }, { key: 'VcAnnuaire.Telephone', around: [null, null] }])
        && JSON.stringify(replaced) === JSON.stringify([{ key: 'VcAnnuaire.Telephone', around: ['(', ')'] }])
        && moved.before === '(' && moved.after === ')';
      return { pass, notes: JSON.stringify({ inserted, replaced, moved: [moved.before, moved.after] }) };
    },
  });

  // === Une règle qui compare la colonne à UNE AUTRE COLONNE de la même ligne (demande d'Antoine, 2026-10-08) ===
  // La table de la page reçoit trois colonnes de plus : Paye (nombre, égal à Montant sur les lignes 1 et 3), Libelle (texte, égal à Titre sur les lignes 1 et 3) et
  // Priorite (choix : le champ Valeur doit rester la liste de ses choix). Un bouton du champ Valeur (`.macro-rule-compare`) passe de « une valeur saisie » à « une autre
  // colonne » (`valueColumn` dans la règle, js/condition-rules.js:compareOperands).
  const ROW_1 = { id: 1, Titre: 'Dossier A', Statut: 'Urgent', Responsable: 'Dupont Jean', Montant: 1200, Paye: 1200, Libelle: 'Dossier A', Priorite: 'Haute' };
  const ROW_2 = { id: 2, Titre: 'Dossier B', Statut: 'Normal', Responsable: 'Martin Anne', Montant: 50, Paye: 20, Libelle: 'Autre', Priorite: 'Basse' };
  const PAID = { mode: 'all', rules: [{ column: 'Montant', operator: '=', value: '', valueColumn: 'Paye' }] };
  const UNPAID = { mode: 'all', rules: [{ column: 'Montant', operator: '≠', value: '', valueColumn: 'Paye' }] };
  const NO_COMPARE_BUTTON = { pass: false, notes: 'bouton « autre colonne » absent de la fenêtre de condition' };

  async function seedCompare(h, opts) {
    await seed(h, opts);
    const stub = window.__gristStub;
    stub.setVariables('VcDossiers', { Titre: 'Text', Statut: 'Text', Responsable: 'Ref:VcAnnuaire', Montant: 'Numeric', Paye: 'Numeric', Libelle: 'Text', Priorite: 'Choice' },
      { Priorite: ['Haute', 'Basse'] });
    stub.setRows('VcDossiers', [
      { id: 1, Titre: 'Dossier A', Statut: 'Urgent', Responsable: 7, Montant: 1200, Paye: 1200, Libelle: 'Dossier A', Priorite: 'Haute' },
      { id: 2, Titre: 'Dossier B', Statut: 'Normal', Responsable: 8, Montant: 50, Paye: 20, Libelle: 'Autre', Priorite: 'Basse' },
      { id: 3, Titre: 'Dossier C', Statut: 'Urgent', Responsable: 0, Montant: 10, Paye: 10, Libelle: 'Dossier C', Priorite: 'Haute' },
    ]);
    await GristAPI.refreshSchema();
    stub.fireRecord(Object.assign({}, ROW_1), 'VcDossiers');
    await h.sleep(50);
  }
  // Une règle de la fenêtre telle qu'à l'écran, en mode valeur comme en mode « autre colonne » : colonne, opérateur, valeur saisie (null en mode « autre colonne »),
  // autre colonne (null en mode valeur) et état du bouton.
  function ruleView(row) {
    const toggle = row.querySelector('.macro-rule-compare');
    const other = row.querySelector('select.macro-rule-value-column');
    const value = row.querySelector('.macro-rule-value');
    return {
      column: row.querySelector('select.macro-rule-column').value,
      operator: row.querySelector(':scope > select').value,
      value: value ? value.value : null,
      other: other ? other.value : null,
      pressed: toggle ? toggle.getAttribute('aria-pressed') : null,
    };
  }
  // Choisit l'autre colonne comme une personne, dans le champ avec recherche du champ Valeur (comme pickColumn pour la colonne de la règle).
  async function pickOtherColumn(h, row, name) {
    const wrap = row.querySelector('.macro-rule-value-slot .macro-rule-column-wrap');
    wrap.querySelector('.ss-trigger').click();
    await h.sleep(30);
    const panel = wrap.querySelector('.ss-panel');
    if (name === '') panel.querySelector('.ss-option.is-empty').click();
    else {
      const input = panel.querySelector('.ss-input');
      setInput(input, name);
      await h.sleep(10);
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    }
    await h.sleep(40);
  }
  const previewLines = modal => Array.from(modal.querySelectorAll('.var-condition-debug-line')).map(l => l.textContent);

  cases.push({
    id: 'varcond_column_rule_compares_two_columns_in_reader_and_export',
    description: 'Une règle « colonne = autre colonne » (valueColumn) : la Lecture et l’export (ReaderMode.preview) gardent la bulle quand les deux colonnes de la ligne s’accordent et la retirent sinon, « ≠ » fait l’inverse, une condition enregistrée sans valueColumn se lit comme avant',
    run: async (h) => {
      await seedCompare(h);
      const sameTitle = { mode: 'all', rules: [{ column: 'Titre', operator: '=', value: '', valueColumn: 'Libelle' }] };
      const html = `<p>[${badgeHtml('VcDossiers', 'Titre', PAID)}][${badgeHtml('VcDossiers', 'Titre', UNPAID)}][${badgeHtml('VcDossiers', 'Titre', COND_URGENT)}][${badgeHtml('VcDossiers', 'Titre', sameTitle)}]</p>`;
      const readerText = async () => (await renderReader(html)).querySelector('.reader-content').textContent;
      const exportText = async () => { const box = document.createElement('div'); box.innerHTML = await ReaderMode.preview(html, 'VcDossiers', GristAPI.getCurrentRecord()); return box.textContent; };
      const results = { row1: await readerText(), export1: await exportText() };
      window.__gristStub.fireRecord(Object.assign({}, ROW_2), 'VcDossiers');
      await h.sleep(50);
      results.row2 = await readerText();
      results.export2 = await exportText();
      const pass = results.row1.includes('[Dossier A][][Dossier A][Dossier A]') && results.export1 === '[Dossier A][][Dossier A][Dossier A]'
        && results.row2.includes('[][Dossier B][][]') && results.export2 === '[][Dossier B][][]';
      return { pass, notes: JSON.stringify(results) };
    },
  });

  cases.push({
    id: 'varcond_column_toggle_swaps_the_value_field_and_keeps_what_was_typed',
    description: 'Le bouton « autre colonne » du champ Valeur : enfoncé, le champ est la liste des colonnes à la place de la valeur saisie (liste avec recherche, info-bulle et nom accessible, aria-pressed) ; relâché, la valeur tapée avant est toujours là ; renfoncé, l’autre colonne choisie aussi ; le bouton garde le focus',
    run: async (h) => {
      await seedCompare(h);
      Editor.setHTML(`<p>Objet : ${badgeHtml('VcDossiers', 'Titre')}</p>`);
      const modal = await openWindow(h, 'Titre');
      const row = modal.querySelector('.macro-rule-row');
      await pickColumn(h, row, 'Montant');
      await h.sleep(30);
      const toggle = row.querySelector('.macro-rule-compare');
      if (!toggle) { cancelWindow(modal); return NO_COMPARE_BUTTON; }
      setInput(row.querySelector('.macro-rule-value'), '5');
      const valueMode = ruleView(row);
      toggle.click();
      await h.sleep(60);
      const columnMode = ruleView(row);
      const focusKept = document.activeElement === toggle;
      const slot = row.querySelector('.macro-rule-value-slot');
      const shown = slot.querySelector('.ss-trigger');
      const placeholder = shown ? shown.textContent : null;
      const noTypedFieldInColumnMode = !slot.querySelector('input.macro-rule-value');
      const preview = previewLines(modal);
      toggle.click();
      await h.sleep(60);
      const backToValue = ruleView(row);
      // Comme la valeur saisie, l'autre colonne choisie se retrouve en revenant : valeur, colonne « Paye », valeur (toujours 5), colonne (toujours « Paye »).
      toggle.click();
      await h.sleep(40);
      await pickOtherColumn(h, row, 'Paye');
      toggle.click();
      await h.sleep(40);
      const valueAgain = ruleView(row);
      toggle.click();
      await h.sleep(40);
      const columnAgain = ruleView(row);
      const label = I18n.t('macro.modal.compareToColumn');
      cancelWindow(modal);
      const pass = valueMode.pressed === 'false' && valueMode.value === '5' && valueMode.other === null
        && valueAgain.pressed === 'false' && valueAgain.value === '5' && valueAgain.other === null
        && columnAgain.pressed === 'true' && columnAgain.other === 'Paye' && columnAgain.value === null
        && columnMode.pressed === 'true' && columnMode.other === '' && columnMode.value === null && noTypedFieldInColumnMode && focusKept && placeholder === I18n.t('macro.modal.columnChoosePlaceholder')
        && preview[0] === I18n.t('varCond.debug.chooseColumn')
        && backToValue.pressed === 'false' && backToValue.value === '5' && backToValue.other === null
        && toggle.title === label && toggle.getAttribute('aria-label') === label && toggle.tagName === 'BUTTON';
      return { pass, notes: JSON.stringify({ valueMode, columnMode, focusKept, placeholder, noTypedFieldInColumnMode, preview, backToValue, valueAgain, columnAgain }) };
    },
  });

  cases.push({
    id: 'varcond_column_window_saves_previews_and_reopens_on_the_other_column',
    description: 'Fenêtre de condition : Montant = Paye (autre colonne) - l’aperçu compte 2 lignes sur 3 et dit que la ligne choisie la remplit, Enregistrer pose { column, operator, value: "", valueColumn } sur la bulle, la fenêtre se rouvre bouton enfoncé sur « Paye », Retirer l’enlève',
    run: async (h) => {
      await seedCompare(h);
      Editor.setHTML(`<p>Objet : ${badgeHtml('VcDossiers', 'Titre')}</p>`);
      const ed = EditorCore.getEditor();
      let modal = await openWindow(h, 'Titre');
      let row = modal.querySelector('.macro-rule-row');
      await pickColumn(h, row, 'Montant');
      const toggle = row.querySelector('.macro-rule-compare');
      if (!toggle) { cancelWindow(modal); return NO_COMPARE_BUTTON; }
      setInput(row.querySelector('.macro-rule-value'), 'brouillon');
      toggle.click();
      await h.sleep(40);
      await pickOtherColumn(h, row, 'Paye');
      await h.sleep(700);
      const during = { rule: ruleView(row), lines: previewLines(modal), shownOther: row.querySelector('.macro-rule-value-slot .ss-trigger').textContent };
      saveWindow(modal);
      await h.sleep(80);
      const saved = conditionOf(ed, 'Titre');
      const html = Editor.getHTML();
      await selectBadge(h, 'Titre');
      const active = toolbarButton('var-condition').classList.contains('is-active');
      pressToolbarButton('var-condition');
      await h.sleep(700);
      modal = conditionModal();
      row = modal.querySelector('.macro-rule-row');
      const reopened = { rule: ruleView(row), lines: previewLines(modal), shownOther: row.querySelector('.macro-rule-value-slot .ss-trigger').textContent };
      modal.querySelector('.var-modal-danger').click();
      await h.sleep(80);
      const afterRemove = conditionOf(ed, 'Titre');
      const expected = { mode: 'all', rules: [{ column: 'Montant', operator: '=', value: '', valueColumn: 'Paye' }] };
      const met = I18n.t('varCond.debug.currentMet', { id: 1, value: 'Dossier A' });
      const count = I18n.t('varCond.debug.count', { table: 'VcDossiers', count: 2, total: 3 });
      const pass = JSON.stringify(during.rule) === JSON.stringify({ column: 'Montant', operator: '=', value: null, other: 'Paye', pressed: 'true' })
        && during.shownOther === 'Paye' && during.lines[0].includes(met) && during.lines[1].includes(count)
        && JSON.stringify(saved) === JSON.stringify(expected) && html.includes('valueColumn') && !html.includes('brouillon') && active
        && JSON.stringify(reopened.rule) === JSON.stringify(during.rule) && reopened.shownOther === 'Paye' && reopened.lines[0].includes(met) && reopened.lines[1].includes(count)
        && afterRemove == null;
      return { pass, notes: JSON.stringify({ during, saved, active, reopened, afterRemove }) };
    },
  });

  cases.push({
    id: 'varcond_column_choice_not_made_is_not_saved_and_cancel_changes_nothing',
    description: 'Mode « autre colonne » sans la colonne choisie : la règle est incomplète, Enregistrer ne pose aucune condition (comme une règle sans colonne) ; Annuler après un vrai choix laisse la bulle telle quelle',
    run: async (h) => {
      await seedCompare(h);
      Editor.setHTML(`<p>Objet : ${badgeHtml('VcDossiers', 'Titre')}</p>`);
      const ed = EditorCore.getEditor();
      let modal = await openWindow(h, 'Titre');
      let row = modal.querySelector('.macro-rule-row');
      await pickColumn(h, row, 'Montant');
      const toggle = row.querySelector('.macro-rule-compare');
      if (!toggle) { cancelWindow(modal); return NO_COMPARE_BUTTON; }
      toggle.click();
      await h.sleep(40);
      const copyDisabled = clipButtons(modal).copy ? clipButtons(modal).copy.getAttribute('aria-disabled') : null;
      saveWindow(modal);
      await h.sleep(80);
      const incompleteSaved = conditionOf(ed, 'Titre');
      const htmlAfterIncomplete = Editor.getHTML();
      // Un vrai choix puis Annuler : rien n'est écrit.
      modal = await openWindow(h, 'Titre');
      row = modal.querySelector('.macro-rule-row');
      await pickColumn(h, row, 'Montant');
      row.querySelector('.macro-rule-compare').click();
      await h.sleep(40);
      await pickOtherColumn(h, row, 'Paye');
      await h.sleep(300);
      cancelWindow(modal);
      await h.sleep(60);
      const afterCancel = conditionOf(ed, 'Titre');
      const pass = copyDisabled === 'true' && incompleteSaved == null && !htmlAfterIncomplete.includes('data-condition') && afterCancel == null;
      return { pass, notes: JSON.stringify({ copyDisabled, incompleteSaved, htmlAfterIncomplete, afterCancel }) };
    },
  });

  cases.push({
    id: 'varcond_column_empty_operators_grey_the_button_and_need_no_other_column',
    description: '« vide » / « non vide » grisent le bouton et le champ de l’autre colonne avec le champ Valeur (rien n’est retiré) ; en mode « autre colonne » sans colonne choisie, « vide » reste une règle complète et s’enregistre sans valueColumn',
    run: async (h) => {
      await seedCompare(h);
      Editor.setHTML(`<p>Objet : ${badgeHtml('VcDossiers', 'Titre')} ${badgeHtml('VcDossiers', 'Montant')}</p>`);
      const ed = EditorCore.getEditor();
      let modal = await openWindow(h, 'Titre');
      let row = modal.querySelector('.macro-rule-row');
      await pickColumn(h, row, 'Montant');
      const toggle = row.querySelector('.macro-rule-compare');
      if (!toggle) { cancelWindow(modal); return NO_COMPARE_BUTTON; }
      const operator = row.querySelector(':scope > select');
      const slot = row.querySelector('.macro-rule-value-slot');
      const states = {};
      const snap = () => ({ disabled: toggle.disabled, greyed: slot.classList.contains('is-disabled'), pressed: toggle.getAttribute('aria-pressed') });
      states.initial = snap();
      setSelect(operator, 'vide');
      await h.sleep(40);
      states.vide = snap();
      toggle.click(); // grisé : sans effet
      await h.sleep(30);
      states.videClick = snap();
      setSelect(operator, '=');
      await h.sleep(40);
      states.back = snap();
      toggle.click();
      await h.sleep(40);
      await pickOtherColumn(h, row, 'Paye');
      setSelect(operator, 'non vide');
      await h.sleep(40);
      states.nonVideColumnMode = Object.assign(snap(), { otherDisabled: row.querySelector('select.macro-rule-value-column').disabled, otherKept: row.querySelector('select.macro-rule-value-column').value });
      cancelWindow(modal);
      // Mode « autre colonne » sans colonne, « vide » : règle complète.
      modal = await openWindow(h, 'Montant');
      row = modal.querySelector('.macro-rule-row');
      await pickColumn(h, row, 'Montant');
      row.querySelector('.macro-rule-compare').click();
      await h.sleep(40);
      setSelect(row.querySelector(':scope > select'), 'vide');
      await h.sleep(40);
      saveWindow(modal);
      await h.sleep(80);
      const savedVide = conditionOf(ed, 'Montant');
      const pass = !states.initial.disabled && !states.initial.greyed && states.initial.pressed === 'false'
        && states.vide.disabled && states.vide.greyed && states.vide.pressed === 'false' && states.videClick.pressed === 'false'
        && !states.back.disabled && !states.back.greyed
        && states.nonVideColumnMode.pressed === 'true' && states.nonVideColumnMode.disabled && states.nonVideColumnMode.greyed
        && states.nonVideColumnMode.otherDisabled && states.nonVideColumnMode.otherKept === 'Paye'
        && JSON.stringify(savedVide) === JSON.stringify({ mode: 'all', rules: [{ column: 'Montant', operator: 'vide', value: '' }] });
      return { pass, notes: JSON.stringify({ states, savedVide }) };
    },
  });

  cases.push({
    id: 'varcond_column_value_field_keeps_listing_the_values_of_the_column',
    description: 'Le comportement par défaut du champ Valeur ne change pas : une colonne à choix liste ses choix (plus « Autre valeur… »), une colonne Oui / Non liste Oui / Non, une colonne de texte reste un champ libre ; passer en « autre colonne » puis revenir rend la même liste',
    run: async (h) => {
      await seedCompare(h);
      Editor.setHTML(`<p>Objet : ${badgeHtml('VcDossiers', 'Titre')}</p>`);
      const modal = await openWindow(h, 'Titre');
      const row = modal.querySelector('.macro-rule-row');
      const slot = row.querySelector('.macro-rule-value-slot');
      const options = () => Array.from(slot.querySelectorAll('select.macro-rule-value option')).map(o => o.value).filter(Boolean);
      const results = {};
      await pickColumn(h, row, 'Priorite');
      await h.sleep(40);
      if (!row.querySelector('.macro-rule-compare')) { cancelWindow(modal); return NO_COMPARE_BUTTON; }
      results.choice = options();
      row.querySelector('.macro-rule-compare').click();
      await h.sleep(40);
      results.choiceInColumnMode = { values: options().length, other: ruleView(row).other };
      row.querySelector('.macro-rule-compare').click();
      await h.sleep(40);
      results.choiceAgain = options();
      await pickColumn(h, row, 'Titre');
      await h.sleep(40);
      results.text = { field: !!slot.querySelector('input.macro-rule-value'), list: slot.querySelectorAll('select.macro-rule-value').length };
      cancelWindow(modal);
      const pass = results.choice.includes('Haute') && results.choice.includes('Basse') && JSON.stringify(results.choiceAgain) === JSON.stringify(results.choice)
        && results.choiceInColumnMode.values === 0 && results.choiceInColumnMode.other === '' && results.text.field && results.text.list === 0;
      return { pass, notes: JSON.stringify(results) };
    },
  });

  cases.push({
    id: 'varcond_column_other_table_asks_for_the_key_and_says_how_it_is_linked',
    description: 'Autre colonne d’une table pas encore liée : le choix de la clé s’ouvre comme pour la colonne de la règle, Annuler laisse le champ sans colonne, Valider enregistre le lien, garde la colonne et affiche le lien sous la règle (la colonne de la règle n’en affiche pas)',
    run: async (h) => {
      await seedCompare(h, { noLinks: true });
      Editor.setHTML(`<p>Objet : ${badgeHtml('VcDossiers', 'Titre')}</p>`);
      const modal = await openWindow(h, 'Titre');
      const linkModal = document.getElementById('link-config-modal');
      let row = modal.querySelector('.macro-rule-row');
      await pickColumn(h, row, 'Statut');
      if (!row.querySelector('.macro-rule-compare')) { cancelWindow(modal); return NO_COMPARE_BUTTON; }
      row.querySelector('.macro-rule-compare').click();
      await h.sleep(40);
      let other = row.querySelector('select.macro-rule-value-column');
      setSelect(other, 'Montant');
      await h.sleep(30);
      setSelect(other, 'VcContacts.Role');
      await h.sleep(150);
      const askedFirst = visible(linkModal);
      document.getElementById('link-config-cancel').click();
      await h.sleep(80);
      const afterCancel = { other: other.value, rule: GristAPI.getLinkRule('VcContacts') };
      setSelect(other, 'VcContacts.Role');
      await h.sleep(150);
      const askedAgain = visible(linkModal);
      document.getElementById('link-config-confirm').click();
      await h.sleep(150);
      row = modal.querySelector('.macro-rule-row');
      other = row.querySelector('select.macro-rule-value-column');
      const hints = Array.from(row.querySelectorAll('.var-condition-link-hint')).map(hint => (hint.hidden ? '' : hint.textContent));
      const view = ruleView(row);
      const rule = GristAPI.getLinkRule('VcContacts');
      cancelWindow(modal);
      const pass = askedFirst && afterCancel.other === 'Montant' && !afterCancel.rule && askedAgain
        && view.column === 'Statut' && view.other === 'VcContacts.Role' && view.pressed === 'true'
        && !!rule && rule.mode === 'match' && rule.colonneCible === 'Dossier' && rule.colonneSource === 'id'
        && hints.length === 2 && hints[0] === '' && hints[1].includes('VcContacts.Dossier');
      return { pass, notes: JSON.stringify({ askedFirst, afterCancel, askedAgain, view, rule, hints }) };
    },
  });

  cases.push({
    id: 'varcond_column_summary_copy_paste_and_inherited_condition_keep_the_other_column',
    description: 'Le résumé d’une règle « autre colonne » nomme la colonne entre accolades (Montant = {Paye}) pour ne pas la lire comme la valeur « Paye » ; Copier / Coller la reprend, Enregistrer aussi ; les attributs insérés depuis une variable qui a cette condition la reprennent avec sa valueColumn',
    run: async (h) => {
      await seedCompare(h);
      VariableCondition.clearClipboard();
      const mixed = { mode: 'any', rules: [PAID.rules[0], { column: 'Statut', operator: '=', value: 'Urgent' }, { column: 'Montant', operator: 'vide', value: '', valueColumn: 'Paye' }] };
      const described = { column: VariableCondition.describe(PAID), mixed: VariableCondition.describe(mixed) };
      Editor.setHTML(`<p>${badgeHtml('VcDossiers', 'Titre', PAID)} ${badgeHtml('VcDossiers', 'Montant')} ${badgeHtml('VcAnnuaire', 'NomPrenom', PAID)}</p>`);
      const ed = EditorCore.getEditor();
      let modal = await openWindow(h, 'Titre');
      let { copy, paste } = clipButtons(modal);
      if (!copy || !paste) { if (modal) cancelWindow(modal); return NO_CLIP_BUTTONS; }
      copy.click();
      cancelWindow(modal);
      await h.sleep(30);
      modal = await openWindow(h, 'Montant');
      ({ copy, paste } = clipButtons(modal));
      const pasteTitle = paste.title;
      paste.click();
      await h.sleep(700);
      const pasted = { rule: ruleView(modal.querySelector('.macro-rule-row')), lines: previewLines(modal) };
      saveWindow(modal);
      await h.sleep(80);
      const savedOnMontant = conditionOf(ed, 'Montant');
      // Attributs insérés depuis la bulle NomPrenom, qui porte la condition.
      const linked = await openLinked(h, 'NomPrenom');
      const option = inheritInfo(linked);
      if (!option) { cancelLinked(linked); return NO_INHERIT_ROW; }
      tickLinked(linked, ['Telephone']);
      linked.querySelector('.var-modal-primary').click();
      await h.sleep(80);
      const inserted = badgeNodes(ed).filter(b => b.node.attrs.column === 'Telephone').map(b => b.node.attrs.condition);
      const pass = described.column === 'Montant = {Paye}' && described.mixed === 'Montant = {Paye} ' + I18n.t('varCond.ruleOr').toLowerCase() + ' Statut = Urgent ' + I18n.t('varCond.ruleOr').toLowerCase() + ' Montant vide'
        && pasteTitle === I18n.t('varCond.clip.pasteTitle', { summary: 'Montant = {Paye}' })
        && JSON.stringify(pasted.rule) === JSON.stringify({ column: 'Montant', operator: '=', value: null, other: 'Paye', pressed: 'true' }) && pasted.lines[0].includes('condition remplie') && pasted.lines[1].includes(I18n.t('varCond.debug.count', { table: 'VcDossiers', count: 2, total: 3 }))
        && JSON.stringify(savedOnMontant) === JSON.stringify(PAID) && JSON.stringify(conditionOf(ed, 'Titre')) === JSON.stringify(PAID)
        && option.summary === '· Montant = {Paye}' && inserted.length === 1 && JSON.stringify(inserted[0]) === JSON.stringify(PAID);
      return { pass, notes: JSON.stringify({ described, pasteTitle, pasted, savedOnMontant, option, inserted }) };
    },
  });

  cases.push({
    id: 'varcond_column_speaks_english',
    description: 'En anglais : info-bulle et nom accessible du bouton « Compare with another column », liste « — Choose a column — », résumé dans le texte du bouton Coller',
    run: async (h) => {
      await seedCompare(h);
      VariableCondition.clearClipboard();
      Editor.setHTML(`<p>${badgeHtml('VcDossiers', 'Titre', PAID)} ${badgeHtml('VcDossiers', 'Montant')}</p>`);
      const lang = I18n.getLang();
      const result = {};
      try {
        I18n.setLang('en');
        const modal = await openWindow(h, 'Titre');
        const toggle = modal.querySelector('.macro-rule-compare');
        if (!toggle) { cancelWindow(modal); return NO_COMPARE_BUTTON; }
        result.title = toggle.title;
        result.aria = toggle.getAttribute('aria-label');
        result.shownOther = modal.querySelector('.macro-rule-value-slot .ss-trigger').textContent;
        cancelWindow(modal);
        // Une bulle sans condition : la colonne de la règle choisie, puis l'autre colonne pas encore choisie.
        const fresh = await openWindow(h, 'Montant');
        const freshRow = fresh.querySelector('.macro-rule-row');
        await pickColumn(h, freshRow, 'Montant');
        freshRow.querySelector('.macro-rule-compare').click();
        await h.sleep(40);
        result.placeholder = freshRow.querySelector('.macro-rule-value-slot .ss-trigger').textContent;
        cancelWindow(fresh);
      } finally {
        I18n.setLang(lang);
      }
      const pass = result.title === 'Compare with another column' && result.aria === 'Compare with another column' && result.shownOther === 'Paye' && result.placeholder === '— Choose a column —';
      return { pass, notes: JSON.stringify(result) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.varCondition = cases;
})();
