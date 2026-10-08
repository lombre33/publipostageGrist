// Suite "columnDescend" - descendre dans une colonne Référence depuis une liste de colonnes (demande d'Antoine du 2026-10-08 : « dans la modale de condition
// d'affichage, mais plus globalement dans les champs de recherche de colonne partout, [avoir] la même facilité à naviguer dans les attributs [qu'avec] la super modale
// dédiée, [...] si c'est un objet, avoir l'icône comme pour les variables et pouvoir naviguer »). Composant : js/search-select.js (option `expand`, `data-expand`, fil
// d'Ariane, lignes posées par addDynamicOption) ; colonnes proposées : Variables.referencedTable / columnsBelow (js/variables.js) ; listes qui s'en servent : les
// règles Colonne / Opérateur / Valeur (js/condition-fields.js, dont « Comparer à une autre colonne »), « Insérer une colonne… » du QR code (js/qr-code.js) et
// « Colonne… » d'une bulle (js/variable-column.js). Ce qui se choisit est la clé d'un chemin « Table.Référence.Colonne » (js/condition-rules.js:parseColumnRef puis
// Variables.resolveRawValue, GristAPI.resolveColumnPath), jamais une règle de liaison de plus. Les gestes à la vraie souris et au vrai clavier à 700x400 sont dans la
// section descend de verify-column-search-mouse.mjs (groupe columnSearchMouse).
(function () {
  const cases = [];

  const TABLES = ['CdProjets', 'CdAnnuaire', 'CdServices', 'CdOutils'];
  const RECORD_1 = { id: 1, Titre: 'Projet A', Statut: 'En cours', Accompagnateur: 'Dupont Jean', Porteur: 'Martin Anne', Etiquettes: 'Juridique' };
  const RECORD_2 = { id: 2, Titre: 'Projet B', Statut: 'Clos', Accompagnateur: 'Martin Anne', Porteur: 'Dupont Jean', Etiquettes: '' };

  // La page est sur CdProjets (Accompagnateur et Porteur : deux Références vers CdAnnuaire ; Etiquettes : liste de références, qu'on n'ouvre pas) ; CdAnnuaire a une
  // Référence vers CdServices (dont Chef revient vers CdAnnuaire : trois niveaux), une liste de références, un choix (Fonction) et une colonne d'aide ; CdOutils (pas
  // liée) a une Référence vers CdAnnuaire. Le libellé Grist de CdAnnuaire.Email est « Courriel professionnel ».
  async function seed(h) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables('CdServices', { Libelle: 'Text', Chef: 'Ref:CdAnnuaire', Budget: 'Numeric' });
    stub.setVariables('CdAnnuaire', { Nom: 'Text', Email: 'Text', Fonction: 'Choice', Service: 'Ref:CdServices', Competences: 'RefList:CdServices', Photo: 'Attachments', gristHelper_Display: 'Text' },
      { Fonction: ['Directeur', 'Chef de service'] }, null, { Service: 'Libelle' });
    stub.setVariables('CdProjets', { Titre: 'Text', Statut: 'Text', Accompagnateur: 'Ref:CdAnnuaire', Porteur: 'Ref:CdAnnuaire', Etiquettes: 'RefList:CdServices' });
    stub.setVariables('CdOutils', { Nom: 'Text', Responsable: 'Ref:CdAnnuaire' });
    stub.setColumnLabels('CdAnnuaire', { Email: 'Courriel professionnel' });
    stub.setRows('CdServices', [{ id: 3, Libelle: 'Juridique', Chef: 8, Budget: 500 }, { id: 4, Libelle: 'Fiscal', Chef: 7, Budget: 900 }]);
    stub.setRows('CdAnnuaire', [
      { id: 7, Nom: 'Dupont Jean', Email: 'dupont@exemple.fr', Fonction: 'Directeur', Service: 3, Competences: ['L', 3, 4], Photo: null, gristHelper_Display: '' },
      { id: 8, Nom: 'Martin Anne', Email: 'martin@exemple.fr', Fonction: 'Chef de service', Service: 4, Competences: null, Photo: null, gristHelper_Display: '' },
    ]);
    stub.setRows('CdProjets', [
      { id: 1, Titre: 'Projet A', Statut: 'En cours', Accompagnateur: 7, Porteur: 8, Etiquettes: ['L', 3] },
      { id: 2, Titre: 'Projet B', Statut: 'Clos', Accompagnateur: 8, Porteur: 7, Etiquettes: null },
    ]);
    stub.setRows('CdOutils', [{ id: 1, Nom: 'Perceuse', Responsable: 7 }]);
    await GristAPI.refreshSchema();
    for (const t of ['CdAnnuaire', 'CdServices', 'CdOutils']) await GristAPI.deleteLinkRule(t);
    await GristAPI.refreshSchema();
    stub.fireRecord(Object.assign({}, RECORD_1), 'CdProjets');
    await h.sleep(50);
  }
  // Les tables de plus retirées, la page rendue à ce qu'elle était : le scénario suivant (ou la suite suivante) ne les connaît pas.
  async function withSeed(h, run) {
    const before = GristAPI.getCurrentRecord();
    const lang = I18n.getLang();
    await seed(h);
    try { return await run(); } finally {
      I18n.setLang(lang);
      document.querySelectorAll('.cd-host').forEach(node => node.remove());
      const stub = window.__gristStub;
      for (const t of TABLES) { await GristAPI.deleteLinkRule(t); stub.dropTable(t); }
      await GristAPI.refreshSchema();
      if (before && before.tableId && stub.state.tables.indexOf(before.tableId) !== -1) stub.fireRecord(before.record, before.tableId);
      await h.sleep(30);
    }
  }

  const same = (got, expected) => JSON.stringify(got) === JSON.stringify(expected);
  const setInput = (input, value) => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); };
  const press = (el, key) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    el.dispatchEvent(event);
    return event;
  };

  // Une ligne de règle telle que la fenêtre de condition d'une bulle la construit (js/variable-condition.js:renderRules), posée dans la page. `calls` garde les
  // tables dont le lien est dit sous la règle (onColumnResolved) et sous l'autre colonne (onValueColumnResolved).
  function buildRow(rule, extra) {
    const calls = { resolved: [], valueResolved: [], chosen: [] };
    const row = ConditionFields.buildRuleRow(rule, 0, {
      mode: 'all',
      options: Object.assign({
        allTables: true,
        compareColumn: true,
        onColumnChosen: ref => { calls.chosen.push(ref.table + '|' + ref.column); return true; },
        onColumnResolved: table => calls.resolved.push(table),
        onValueColumnResolved: table => calls.valueResolved.push(table),
      }, extra),
      onRemove: () => {},
    });
    const host = document.createElement('div');
    host.className = 'cd-host';
    host.appendChild(row);
    document.body.appendChild(host);
    return { row, calls };
  }
  const columnWrap = row => row.querySelector('.macro-rule-column-wrap');
  const otherWrap = row => row.querySelector('.macro-rule-value-slot .macro-rule-column-wrap');
  const triggerOf = wrap => wrap.querySelector('.ss-trigger');
  const panelOf = wrap => wrap.querySelector('.ss-panel');
  const inputOf = wrap => wrap.querySelector('.ss-input');
  const optionRows = wrap => Array.from(panelOf(wrap).querySelectorAll('.ss-option'));
  const nameOf = li => li.querySelector('.ss-name').textContent;
  const names = wrap => optionRows(wrap).map(nameOf);
  const rowNamed = (wrap, name) => optionRows(wrap).find(li => nameOf(li) === name);
  const arrowOf = (wrap, name) => { const li = rowNamed(wrap, name); return li ? li.querySelector('.ss-descend') : null; };
  const crumbs = wrap => { const path = panelOf(wrap).querySelector('.ss-path'); return path.hidden ? null : Array.from(path.querySelectorAll('.ss-crumb')).map(c => c.textContent); };
  const hereCrumb = wrap => { const here = panelOf(wrap).querySelector('.ss-crumb.is-here'); return here ? here.textContent : null; };
  const activeName = wrap => { const li = panelOf(wrap).querySelector('.ss-option.is-active'); return li ? nameOf(li) : null; };
  const checkedNames = wrap => optionRows(wrap).filter(li => li.getAttribute('aria-selected') === 'true').map(nameOf);
  const selectOf = wrap => wrap.querySelector('select');
  const shown = wrap => triggerOf(wrap).textContent;

  async function open(h, wrap) {
    triggerOf(wrap).click();
    await h.sleep(30);
  }
  async function pickRoot(h, wrap, name) {
    await open(h, wrap);
    rowNamed(wrap, name).click();
    await h.sleep(30);
  }
  // Descend par la flèche de la ligne `name` de la liste ouverte.
  async function descend(h, wrap, name) {
    const arrow = arrowOf(wrap, name);
    if (arrow) arrow.click();
    await h.sleep(20);
    return !!arrow;
  }
  // Choisit la ligne `name` du niveau affiché de la liste ouverte.
  async function pickHere(h, wrap, name) {
    rowNamed(wrap, name).click();
    await h.sleep(30);
  }
  async function evaluate(rule, record) {
    return ConditionRules.matches(rule, 'CdProjets', record);
  }
  // La fenêtre de condition d'une bulle, comme la personne l'ouvre : la bulle sélectionnée, l'icône « Condition » de la barre (js/variable-condition.js).
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const badgeHtml = (table, column) => `<span class="var-badge" data-table="${table}" data-column="${column}" data-key="${table}.${column}"></span>`;
  async function selectBadge(h, column) {
    const ed = EditorCore.getEditor();
    document.querySelector('.tiptap').focus();
    let found = null;
    ed.state.doc.descendants((node, pos) => { if (!found && node.type.name === 'varBadge' && node.attrs.column === column) found = pos; });
    if (found === null) return null;
    ed.commands.setNodeSelection(found);
    await h.sleep(120);
    return ed;
  }
  async function openConditionWindow(h, column) {
    await selectBadge(h, column);
    document.querySelector('.v2-varfmt-toolbar').querySelector('button[data-action="var-condition"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await h.sleep(700);
    return document.getElementById('var-condition-modal');
  }
  const conditionOf = (ed, column) => {
    let found;
    ed.state.doc.descendants(node => { if (node.type.name === 'varBadge' && node.attrs.column === column) found = node.attrs.condition; });
    return found;
  };
  const previewLines = modal => Array.from(modal.querySelectorAll('.var-condition-debug-line')).map(l => l.textContent);

  cases.push({
    id: 'coldesc_arrow_only_on_simple_reference_columns',
    description: 'Liste des colonnes d’une règle : une flèche « › » à droite des colonnes Référence simple (Accompagnateur, Porteur, CdAnnuaire.Service), avec son info-bulle « Voir les colonnes de « CdAnnuaire » (via Accompagnateur) » ; aucune sur une liste de références, une colonne de texte ni la ligne de saisie avancée',
    run: (h) => withSeed(h, async () => {
      const { row } = buildRow({ column: '', operator: '=', value: '' });
      const wrap = columnWrap(row);
      await open(h, wrap);
      const result = {
        accompagnateur: arrowOf(wrap, 'Accompagnateur') ? arrowOf(wrap, 'Accompagnateur').title : null,
        porteur: !!arrowOf(wrap, 'Porteur'),
        service: arrowOf(wrap, 'CdAnnuaire.Service') ? arrowOf(wrap, 'CdAnnuaire.Service').title : null,
        chef: !!arrowOf(wrap, 'CdServices.Chef'),
        responsable: !!arrowOf(wrap, 'CdOutils.Responsable'),
        etiquettes: !!arrowOf(wrap, 'Etiquettes'),
        competences: !!arrowOf(wrap, 'CdAnnuaire.Competences'),
        titre: !!arrowOf(wrap, 'Titre'),
        pinned: !!panelOf(wrap).querySelector('.ss-option.is-pinned .ss-descend'),
        rowsWithArrow: optionRows(wrap).filter(li => li.classList.contains('has-children')).map(nameOf),
      };
      const pass = result.accompagnateur === 'Voir les colonnes de « CdAnnuaire » (via Accompagnateur)' && result.porteur
        && result.service === 'Voir les colonnes de « CdServices » (via CdAnnuaire.Service)' && result.chef && result.responsable
        && !result.etiquettes && !result.competences && !result.titre && !result.pinned
        && same(result.rowsWithArrow.slice().sort(), ['Accompagnateur', 'CdAnnuaire.Service', 'CdOutils.Responsable', 'CdServices.Chef', 'Porteur']);
      return { pass, notes: JSON.stringify(result) };
    }),
  });

  cases.push({
    id: 'coldesc_click_on_arrow_opens_the_columns_of_the_referenced_table_under_a_breadcrumb',
    description: 'Un clic sur la flèche d’Accompagnateur ouvre les colonnes de CdAnnuaire (noms seuls, type en indice, colonne d’aide écartée, flèche sur Service seulement), la saisie repart vide, le fil d’Ariane dit « Colonnes › Accompagnateur » ; un clic sur « Colonnes » revient à toute la liste, Accompagnateur surligné ; un clic sur la ligne elle-même (pas la flèche) choisit la Référence',
    run: (h) => withSeed(h, async () => {
      const { row } = buildRow({ column: '', operator: '=', value: '' });
      const wrap = columnWrap(row);
      await open(h, wrap);
      const rootBefore = names(wrap);
      const rootCrumbs = crumbs(wrap);
      setInput(inputOf(wrap), 'accomp');
      await h.sleep(10);
      const typed = inputOf(wrap).value;
      await descend(h, wrap, 'Accompagnateur');
      const below = {
        crumbs: crumbs(wrap), here: hereCrumb(wrap), names: names(wrap), arrows: optionRows(wrap).filter(li => li.classList.contains('has-children')).map(nameOf),
        input: inputOf(wrap).value, hints: optionRows(wrap).map(li => (li.querySelector('.ss-hint') || {}).textContent || ''),
        status: panelOf(wrap).querySelector('.ss-status').textContent, closed: panelOf(wrap).hidden,
        groups: panelOf(wrap).querySelectorAll('.ss-group').length,
      };
      const upButton = panelOf(wrap).querySelector('.ss-crumb[data-depth="0"]');
      const upTitle = upButton ? upButton.title : null;
      if (upButton) upButton.click();
      await h.sleep(20);
      const back = { crumbs: crumbs(wrap), names: names(wrap), active: activeName(wrap), input: inputOf(wrap).value };
      // Un clic sur le nom de la ligne choisit la Référence elle-même, comme avant.
      rowNamed(wrap, 'Accompagnateur').querySelector('.ss-name').click();
      await h.sleep(30);
      const chosen = { value: selectOf(wrap).value, rule: row.querySelector('select').value, shown: shown(wrap), closed: panelOf(wrap).hidden };
      const pass = rootBefore.indexOf('Accompagnateur') !== -1 && rootCrumbs === null && typed === 'accomp'
        && same(below.crumbs, ['Colonnes', 'Accompagnateur']) && below.here === 'Accompagnateur'
        && same(below.names, ['Nom', 'Email', 'Fonction', 'Service', 'Competences', 'Photo']) && same(below.arrows, ['Service'])
        && below.input === '' && !below.closed && below.groups === 0 && below.hints[1] === '' && below.hints[2] === '(choix)' && below.hints[3] === '(référence)'
        && below.status === 'Colonnes de « CdAnnuaire »'
        && upTitle === 'Revenir à toutes les colonnes'
        && back.crumbs === null && same(back.names, rootBefore) && back.active === 'Accompagnateur' && back.input === ''
        && chosen.value === 'Accompagnateur' && chosen.shown === 'Accompagnateur' && chosen.closed;
      return { pass, notes: JSON.stringify({ rootBefore, rootCrumbs, typed, below, upTitle, back, chosen }) };
    }),
  });

  cases.push({
    id: 'coldesc_choosing_below_sets_the_path_and_the_rule_reads_it',
    description: 'Descendre dans Accompagnateur puis choisir Email : la règle porte « CdProjets.Accompagnateur.Email » (clé complète, la table de la page devant), le champ le dit, l’évaluation lit l’e-mail de la personne désignée par CETTE colonne — vraie sur le projet A (Dupont), fausse sur le B (Martin) — sans aucune règle de liaison de plus',
    run: (h) => withSeed(h, async () => {
      const rule = { column: '', operator: '=', value: '' };
      const { row, calls } = buildRow(rule);
      const wrap = columnWrap(row);
      await open(h, wrap);
      await descend(h, wrap, 'Accompagnateur');
      await pickHere(h, wrap, 'Email');
      const afterChoice = { value: selectOf(wrap).value, rule: rule.column, shown: shown(wrap), closed: panelOf(wrap).hidden, chosen: calls.chosen.slice() };
      const valueInput = row.querySelector('.macro-rule-value');
      if (valueInput) setInput(valueInput, 'dupont@exemple.fr');
      const onA = await evaluate(rule, RECORD_1);
      const onB = await evaluate(rule, RECORD_2);
      const noLink = GristAPI.getLinkRule('CdAnnuaire') == null;
      const pass = afterChoice.value === 'CdProjets.Accompagnateur.Email' && afterChoice.rule === 'CdProjets.Accompagnateur.Email'
        && afterChoice.shown === 'CdProjets.Accompagnateur.Email' && afterChoice.closed && same(afterChoice.chosen, ['CdProjets|Accompagnateur.Email'])
        && !!valueInput && onA === true && onB === false && noLink;
      return { pass, notes: JSON.stringify({ afterChoice, hasValueInput: !!valueInput, onA, onB, noLink }) };
    }),
  });

  cases.push({
    id: 'coldesc_two_references_to_the_same_table_each_read_their_own_row',
    description: 'Accompagnateur.Email et Porteur.Email (deux Références vers CdAnnuaire) lisent chacune sa personne sur la même ligne : sur le projet A, l’accompagnateur est Dupont et le porteur Martin',
    run: (h) => withSeed(h, async () => {
      const rule1 = { column: '', operator: '=', value: 'martin@exemple.fr' };
      const rule2 = { column: '', operator: '=', value: 'martin@exemple.fr' };
      const first = buildRow(rule1);
      const second = buildRow(rule2);
      for (const [built, name] of [[first, 'Accompagnateur'], [second, 'Porteur']]) {
        const wrap = columnWrap(built.row);
        await open(h, wrap);
        await descend(h, wrap, name);
        await pickHere(h, wrap, 'Email');
      }
      const viaAccompagnateur = await evaluate(rule1, RECORD_1);
      const viaPorteur = await evaluate(rule2, RECORD_1);
      const pass = rule1.column === 'CdProjets.Accompagnateur.Email' && rule2.column === 'CdProjets.Porteur.Email' && viaAccompagnateur === false && viaPorteur === true;
      return { pass, notes: JSON.stringify({ rule1: rule1.column, rule2: rule2.column, viaAccompagnateur, viaPorteur }) };
    }),
  });

  cases.push({
    id: 'coldesc_keyboard_goes_down_and_up_and_three_levels_deep',
    description: 'Au clavier : « accomp » puis → (curseur à la fin) descend dans Accompagnateur, ↓ puis → sur Service descend encore (Colonnes › Accompagnateur › Service), ← (saisie vide) et Retour arrière remontent d’un niveau chacun, ← au premier niveau ne fait rien ; Entrée sur CdServices.Libelle choisit « CdProjets.Accompagnateur.Service.Libelle », que la règle lit (Juridique pour le projet A)',
    run: (h) => withSeed(h, async () => {
      const rule = { column: '', operator: '=', value: 'Juridique' };
      const { row } = buildRow(rule);
      const wrap = columnWrap(row);
      await open(h, wrap);
      const input = inputOf(wrap);
      setInput(input, 'accomp');
      await h.sleep(10);
      const activeBefore = activeName(wrap);
      const right = press(input, 'ArrowRight');
      await h.sleep(20);
      const level1 = { crumbs: crumbs(wrap), names: names(wrap), prevented: right.defaultPrevented, active: activeName(wrap) };
      for (let i = 0; i < 4; i++) press(input, 'ArrowDown');
      press(input, 'ArrowRight');
      await h.sleep(20);
      const level2 = { crumbs: crumbs(wrap), names: names(wrap), arrows: optionRows(wrap).filter(li => li.classList.contains('has-children')).map(nameOf) };
      const left = press(input, 'ArrowLeft');
      await h.sleep(20);
      const afterLeft = { crumbs: crumbs(wrap), active: activeName(wrap), prevented: left.defaultPrevented };
      press(input, 'Backspace');
      await h.sleep(20);
      const afterBackspace = { crumbs: crumbs(wrap), active: activeName(wrap), names: names(wrap).slice(0, 3) };
      const atRoot = press(input, 'ArrowLeft');
      await h.sleep(10);
      const rootStays = { crumbs: crumbs(wrap), open: !panelOf(wrap).hidden, prevented: atRoot.defaultPrevented };
      // Retour dans Service pour choisir Libelle au clavier.
      press(input, 'ArrowRight');
      await h.sleep(20);
      for (let i = 0; i < 4; i++) press(input, 'ArrowDown');
      press(input, 'ArrowRight');
      await h.sleep(20);
      setInput(input, 'libel');
      await h.sleep(10);
      press(input, 'Enter');
      await h.sleep(40);
      const matched = await evaluate(rule, RECORD_1);
      const matchedB = await evaluate(rule, RECORD_2);
      const pass = activeBefore === 'Accompagnateur'
        && same(level1.crumbs, ['Colonnes', 'Accompagnateur']) && level1.prevented && level1.active === null && level1.names.indexOf('Service') !== -1
        && same(level2.crumbs, ['Colonnes', 'Accompagnateur', 'Service']) && same(level2.names, ['Libelle', 'Chef', 'Budget']) && same(level2.arrows, ['Chef'])
        && same(afterLeft.crumbs, ['Colonnes', 'Accompagnateur']) && afterLeft.active === 'Service' && afterLeft.prevented
        && afterBackspace.crumbs === null && afterBackspace.active === 'Accompagnateur'
        && rootStays.crumbs === null && rootStays.open && !rootStays.prevented
        && rule.column === 'CdProjets.Accompagnateur.Service.Libelle' && selectOf(wrap).value === rule.column && matched === true && matchedB === false;
      return { pass, notes: JSON.stringify({ activeBefore, level1, level2, afterLeft, afterBackspace, rootStays, column: rule.column, matched, matchedB }) };
    }),
  });

  cases.push({
    id: 'coldesc_right_arrow_inside_typed_text_keeps_moving_the_caret',
    description: '→ ne descend que si le curseur est à la fin de la saisie (ailleurs il se déplace dans le texte), et ni avec Maj ni sur une ligne sans flèche',
    run: (h) => withSeed(h, async () => {
      const { row } = buildRow({ column: '', operator: '=', value: '' });
      const wrap = columnWrap(row);
      await open(h, wrap);
      const input = inputOf(wrap);
      setInput(input, 'accomp');
      await h.sleep(10);
      input.setSelectionRange(2, 2);
      const middle = press(input, 'ArrowRight');
      await h.sleep(10);
      const stillRoot = crumbs(wrap) === null;
      input.setSelectionRange(6, 6);
      const shift = new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true, cancelable: true });
      input.dispatchEvent(shift);
      await h.sleep(10);
      const stillRootAfterShift = crumbs(wrap) === null;
      setInput(input, 'titre');
      await h.sleep(10);
      const plain = press(input, 'ArrowRight');
      await h.sleep(10);
      const stillRootOnPlainRow = crumbs(wrap) === null;
      const pass = !middle.defaultPrevented && stillRoot && !shift.defaultPrevented && stillRootAfterShift && !plain.defaultPrevented && stillRootOnPlainRow;
      return { pass, notes: JSON.stringify({ middle: middle.defaultPrevented, stillRoot, shift: shift.defaultPrevented, stillRootAfterShift, plain: plain.defaultPrevented, stillRootOnPlainRow }) };
    }),
  });

  cases.push({
    id: 'coldesc_search_below_looks_only_at_the_columns_of_that_level',
    description: 'Dans les colonnes de CdAnnuaire : « courriel » (libellé Grist) retrouve Email, « annuaire nom » la table et la colonne, plusieurs mots dans l’autre ordre aussi ; « accompagnateur » (la colonne par où l’on est descendu) ne retient rien, au lieu de toutes les lignes ; vider la saisie rend les six colonnes',
    run: (h) => withSeed(h, async () => {
      const { row } = buildRow({ column: '', operator: '=', value: '' });
      const wrap = columnWrap(row);
      await open(h, wrap);
      await descend(h, wrap, 'Accompagnateur');
      const input = inputOf(wrap);
      const found = async (query) => { setInput(input, query); await h.sleep(10); return names(wrap); };
      const result = {
        label: await found('courriel'),
        reversed: await found('professionnel courriel'),
        table: await found('annuaire nom'),
        service: await found('serv'),
        pathColumn: await found('accompagnateur'),
        cleared: await found(''),
      };
      const pass = same(result.label, ['Email']) && same(result.reversed, ['Email']) && same(result.table, ['Nom']) && same(result.service, ['Service'])
        && same(result.pathColumn, []) && same(result.cleared, ['Nom', 'Email', 'Fonction', 'Service', 'Competences', 'Photo']);
      return { pass, notes: JSON.stringify(result) };
    }),
  });

  cases.push({
    id: 'coldesc_saved_path_reopens_as_a_choice_of_the_list_not_as_advanced_input',
    description: 'Une règle enregistrée sur « CdProjets.Accompagnateur.Email » se rouvre comme un choix de la liste (le champ dit le chemin, pas la saisie avancée), sa ligne est juste sous Accompagnateur avec la coche, elle se cherche par le libellé Grist de chaque colonne du chemin, et un chemin dont un maillon a disparu reste en saisie avancée',
    run: (h) => withSeed(h, async () => {
      const { row } = buildRow({ column: 'CdProjets.Accompagnateur.Email', operator: '=', value: 'dupont@exemple.fr' });
      const wrap = columnWrap(row);
      const advancedHidden = wrap.querySelector('.macro-rule-column-advanced').hidden;
      const closedText = shown(wrap);
      await open(h, wrap);
      const all = names(wrap);
      const dynamic = rowNamed(wrap, 'CdProjets.Accompagnateur.Email');
      const result = {
        advancedHidden, closedText, value: selectOf(wrap).value,
        order: all.slice(all.indexOf('Accompagnateur'), all.indexOf('Accompagnateur') + 3),
        checked: checkedNames(wrap), hint: dynamic ? (dynamic.querySelector('.ss-hint') || {}).textContent : null, active: activeName(wrap),
      };
      setInput(inputOf(wrap), 'courriel');
      await h.sleep(10);
      result.byLabel = names(wrap);
      setInput(inputOf(wrap), 'accompagnateur');
      await h.sleep(10);
      result.byHop = names(wrap);
      triggerOf(wrap).click();
      await h.sleep(20);
      const broken = buildRow({ column: 'CdProjets.Disparue.Email', operator: '=', value: 'x' });
      const brokenWrap = columnWrap(broken.row);
      const brokenInput = brokenWrap.querySelector('.macro-rule-column-advanced');
      result.broken = { advancedShown: !brokenInput.hidden, text: brokenInput.value, select: selectOf(brokenWrap).value };
      const pass = result.advancedHidden && result.closedText === 'CdProjets.Accompagnateur.Email' && result.value === 'CdProjets.Accompagnateur.Email'
        && same(result.order, ['Accompagnateur', 'CdProjets.Accompagnateur.Email', 'Porteur']) && same(result.checked, ['CdProjets.Accompagnateur.Email'])
        && result.active === 'CdProjets.Accompagnateur.Email'
        && result.byLabel.indexOf('CdProjets.Accompagnateur.Email') !== -1 && result.byHop.indexOf('CdProjets.Accompagnateur.Email') !== -1
        && result.broken.advancedShown && result.broken.text === 'CdProjets.Disparue.Email';
      return { pass, notes: JSON.stringify(result) };
    }),
  });

  cases.push({
    id: 'coldesc_path_end_decides_the_value_field_and_the_type_hint',
    description: 'La colonne où le chemin aboutit décide du champ Valeur : Accompagnateur.Fonction (un choix) propose Directeur et Chef de service ; Accompagnateur.Service (une Référence) propose les libellés de CdServices ; aucun avertissement « absente de la ligne affichée » pour un chemin',
    run: (h) => withSeed(h, async () => {
      const rule1 = { column: '', operator: '=', value: '' };
      const rule2 = { column: '', operator: '=', value: '' };
      const choice = buildRow(rule1);
      const reference = buildRow(rule2);
      const wrap1 = columnWrap(choice.row);
      await open(h, wrap1);
      await descend(h, wrap1, 'Accompagnateur');
      await pickHere(h, wrap1, 'Fonction');
      const wrap2 = columnWrap(reference.row);
      await open(h, wrap2);
      await descend(h, wrap2, 'Accompagnateur');
      await pickHere(h, wrap2, 'Service');
      await h.sleep(60);
      const valueOptions = built => Array.from(built.row.querySelectorAll('.macro-rule-value-slot select.macro-rule-value option')).map(o => o.value).filter(Boolean);
      const hintOf = built => built.row.querySelector('.macro-rule-column-type');
      const result = {
        choices: valueOptions(choice), references: valueOptions(reference),
        hint1: hintOf(choice).textContent, hint2: hintOf(reference).textContent, warn1: hintOf(choice).classList.contains('is-warning'),
        rule1: rule1.column, rule2: rule2.column,
      };
      const pass = result.rule1 === 'CdProjets.Accompagnateur.Fonction' && same(result.choices.slice(0, 2), ['Directeur', 'Chef de service'])
        && result.rule2 === 'CdProjets.Accompagnateur.Service' && result.references.indexOf('Juridique') !== -1 && result.references.indexOf('Fiscal') !== -1
        && !result.warn1 && result.hint1 === 'choix' && result.hint2 === 'référence';
      return { pass, notes: JSON.stringify(result) };
    }),
  });

  cases.push({
    id: 'coldesc_new_choice_replaces_the_previous_path_row',
    description: 'Une ligne posée par un chemin ne reste dans la liste que tant qu’elle est choisie : après Accompagnateur.Email puis Porteur.Email puis Titre, la liste rouverte n’a plus aucune des deux lignes de chemin ; avec Porteur.Email choisi, elle n’a que celle-là, juste sous Porteur',
    run: (h) => withSeed(h, async () => {
      const rule = { column: '', operator: '=', value: '' };
      const { row } = buildRow(rule);
      const wrap = columnWrap(row);
      const dynamicCount = () => Array.from(selectOf(wrap).options).filter(o => o.dataset.dynamic === 'true').map(o => o.value);
      await open(h, wrap);
      await descend(h, wrap, 'Accompagnateur');
      await pickHere(h, wrap, 'Email');
      const first = dynamicCount();
      await open(h, wrap);
      const reopenedFirst = names(wrap).filter(n => n.indexOf('.Email') !== -1 && n.indexOf('CdProjets.') === 0);
      await descend(h, wrap, 'Porteur');
      await pickHere(h, wrap, 'Email');
      await open(h, wrap);
      const all = names(wrap);
      const second = { rows: all.filter(n => n.indexOf('CdProjets.') === 0), underPorteur: all.slice(all.indexOf('Porteur'), all.indexOf('Porteur') + 2), options: dynamicCount() };
      await pickHere(h, wrap, 'Titre');
      await open(h, wrap);
      const third = { rows: names(wrap).filter(n => n.indexOf('CdProjets.') === 0), options: dynamicCount(), column: rule.column };
      triggerOf(wrap).click();
      const pass = same(first, ['CdProjets.Accompagnateur.Email']) && same(reopenedFirst, ['CdProjets.Accompagnateur.Email'])
        && same(second.rows, ['CdProjets.Porteur.Email']) && same(second.underPorteur, ['Porteur', 'CdProjets.Porteur.Email']) && same(second.options, ['CdProjets.Porteur.Email'])
        && same(third.rows, []) && same(third.options, []) && third.column === 'Titre';
      return { pass, notes: JSON.stringify({ first, reopenedFirst, second, third }) };
    }),
  });

  cases.push({
    id: 'coldesc_refused_choice_puts_the_previous_column_back',
    description: 'Quand la fenêtre de la clé de liaison est annulée (onColumnChosen répond non) pour une colonne de chemin, la colonne d’avant revient — dans la règle, dans le champ — et la ligne du chemin refusé ne reste pas dans la liste rouverte',
    run: (h) => withSeed(h, async () => {
      const rule = { column: 'CdProjets.Accompagnateur.Email', operator: '=', value: 'x' };
      let answer = false;
      const { row } = buildRow(rule, { onColumnChosen: () => Promise.resolve(answer) });
      const wrap = columnWrap(row);
      await open(h, wrap);
      await descend(h, wrap, 'CdOutils.Responsable');
      await pickHere(h, wrap, 'Nom');
      await h.sleep(60);
      const refused = { column: rule.column, value: selectOf(wrap).value, shown: shown(wrap) };
      await open(h, wrap);
      const dynamicRows = names(wrap).filter(n => n.indexOf('CdOutils.Responsable.') === 0);
      answer = true;
      await descend(h, wrap, 'CdOutils.Responsable');
      await pickHere(h, wrap, 'Nom');
      await h.sleep(60);
      const accepted = { column: rule.column, value: selectOf(wrap).value, shown: shown(wrap) };
      const pass = refused.column === 'CdProjets.Accompagnateur.Email' && refused.value === 'CdProjets.Accompagnateur.Email' && refused.shown === 'CdProjets.Accompagnateur.Email'
        && same(dynamicRows, []) && accepted.column === 'CdOutils.Responsable.Nom' && accepted.value === 'CdOutils.Responsable.Nom' && accepted.shown === 'CdOutils.Responsable.Nom';
      return { pass, notes: JSON.stringify({ refused, dynamicRows, accepted }) };
    }),
  });

  cases.push({
    id: 'coldesc_link_follows_the_table_where_the_path_starts',
    description: 'Le lien dit sous la règle est celui de la table d’où part la colonne : un chemin qui part de la page (Accompagnateur.Email) n’en dit aucun, même si CdAnnuaire a une règle de liaison ; un chemin d’une autre table (CdOutils.Responsable.Email) dit CdOutils ; la colonne ordinaire d’une autre table dit la sienne, comme avant',
    run: (h) => withSeed(h, async () => {
      await GristAPI.saveLinkRule('CdAnnuaire', { mode: 'match', colonneCible: 'id', colonneSource: 'Accompagnateur' });
      await GristAPI.saveLinkRule('CdOutils', { mode: 'singleton' });
      await GristAPI.refreshSchema();
      const { row, calls } = buildRow({ column: '', operator: '=', value: '' });
      const wrap = columnWrap(row);
      calls.resolved.length = 0;
      await open(h, wrap);
      await descend(h, wrap, 'Accompagnateur');
      await pickHere(h, wrap, 'Email');
      const fromPage = calls.resolved.slice();
      calls.resolved.length = 0;
      await open(h, wrap);
      await descend(h, wrap, 'CdOutils.Responsable');
      await pickHere(h, wrap, 'Email');
      const fromOther = calls.resolved.slice();
      calls.resolved.length = 0;
      await pickRoot(h, wrap, 'CdAnnuaire.Email');
      const plain = calls.resolved.slice();
      const pass = same(fromPage, ['CdProjets']) && same(fromOther, ['CdOutils']) && same(plain, ['CdAnnuaire']);
      return { pass, notes: JSON.stringify({ fromPage, fromOther, plain }) };
    }),
  });

  cases.push({
    id: 'coldesc_compare_to_another_column_gets_the_same_arrows',
    description: '« Comparer à une autre colonne » : la liste de l’autre colonne a les mêmes flèches et le même fil d’Ariane ; Accompagnateur.Email ≠ Porteur.Email vaut vrai sur une ligne où les deux personnes diffèrent, « = » faux ; l’autre colonne enregistrée se rouvre comme un choix',
    run: (h) => withSeed(h, async () => {
      const rule = { column: '', operator: '≠', value: '' };
      const { row } = buildRow(rule);
      const wrap = columnWrap(row);
      await open(h, wrap);
      await descend(h, wrap, 'Accompagnateur');
      await pickHere(h, wrap, 'Email');
      row.querySelector('.macro-rule-compare').click();
      await h.sleep(40);
      const other = otherWrap(row);
      await open(h, other);
      const hasArrows = optionRows(other).filter(li => li.classList.contains('has-children')).map(nameOf);
      await descend(h, other, 'Porteur');
      const level = { crumbs: crumbs(other), names: names(other) };
      await pickHere(h, other, 'Email');
      const different = await evaluate(rule, RECORD_1);
      rule.operator = '=';
      const equal = await evaluate(rule, RECORD_1);
      const again = buildRow({ column: 'CdProjets.Accompagnateur.Email', operator: '≠', value: '', valueColumn: 'CdProjets.Porteur.Email' });
      const reopened = { shown: shown(otherWrap(again.row)), advancedHidden: otherWrap(again.row).querySelector('.macro-rule-column-advanced').hidden };
      const pass = hasArrows.indexOf('Accompagnateur') !== -1 && hasArrows.indexOf('Porteur') !== -1 && same(level.crumbs, ['Colonnes', 'Porteur'])
        && rule.valueColumn === 'CdProjets.Porteur.Email' && different === true && equal === false
        && reopened.shown === 'CdProjets.Porteur.Email' && reopened.advancedHidden;
      return { pass, notes: JSON.stringify({ hasArrows, level, valueColumn: rule.valueColumn, different, equal, reopened }) };
    }),
  });

  cases.push({
    id: 'coldesc_lists_that_read_the_looped_table_only_have_no_arrow',
    description: 'Le filtre d’une boucle ({ table }) lit la ligne parcourue seule : sa liste de colonnes n’a aucune flèche, et le tri d’une boucle (appendColumnOption sans « descend ») non plus',
    run: (h) => withSeed(h, async () => {
      const { row } = buildRow({ column: '', operator: '=', value: '' }, { table: 'CdAnnuaire', allTables: false, compareColumn: false });
      const wrap = columnWrap(row);
      await open(h, wrap);
      const filter = { names: names(wrap), arrows: panelOf(wrap).querySelectorAll('.ss-descend').length, expandable: Array.from(selectOf(wrap).options).filter(o => o.dataset.expand).length };
      triggerOf(wrap).click();
      const select = document.createElement('select');
      GristAPI.getVisibleColumns('CdAnnuaire').forEach(c => ConditionFields.appendColumnOption(select, c, 'CdAnnuaire', c));
      const sort = { expandable: Array.from(select.options).filter(o => o.dataset.expand).length, count: select.options.length };
      const pass = filter.names.indexOf('Service') !== -1 && filter.arrows === 0 && filter.expandable === 0 && sort.expandable === 0 && sort.count === 6;
      return { pass, notes: JSON.stringify({ filter, sort }) };
    }),
  });

  cases.push({
    id: 'coldesc_condition_window_saves_a_path_and_the_reader_follows_it',
    description: 'Fenêtre de condition d’une bulle : descendre dans Accompagnateur, choisir Email, saisir la valeur, Enregistrer — la bulle porte « CdProjets.Accompagnateur.Email = … », l’aperçu la compte (1 ligne sur 2) et dit que la ligne courante la remplit, aucun lien de CdAnnuaire n’est dit sous la règle (le chemin ne s’en sert pas) ; la fenêtre rouverte montre le chemin comme un choix ; la Lecture garde la bulle sur le projet A et la retire sur le B',
    run: (h) => withSeed(h, async () => {
      await GristAPI.saveLinkRule('CdAnnuaire', { mode: 'match', colonneCible: 'id', colonneSource: 'Accompagnateur' });
      await GristAPI.refreshSchema();
      Editor.setHTML(`<p>Objet : ${badgeHtml('CdProjets', 'Titre')}</p>`);
      const ed = EditorCore.getEditor();
      let modal = await openConditionWindow(h, 'Titre');
      let row = modal.querySelector('.macro-rule-row');
      const wrap = columnWrap(row);
      await open(h, wrap);
      await descend(h, wrap, 'Accompagnateur');
      await pickHere(h, wrap, 'Email');
      setInput(row.querySelector('.macro-rule-value'), 'dupont@exemple.fr');
      await h.sleep(800);
      const during = { lines: previewLines(modal), linkHintHidden: row.querySelector('.var-condition-link-hint').hidden, shown: shown(wrap) };
      modal.querySelector('.var-modal-actions .var-modal-primary').click();
      await h.sleep(100);
      const saved = conditionOf(ed, 'Titre');
      const html = Editor.getHTML();
      const reader = document.getElementById('reader-container');
      reader.style.display = 'block';
      await ReaderMode.render(html, 'CdProjets', Object.assign({}, RECORD_1), NO_HF);
      const textA = reader.querySelector('.reader-content').textContent;
      await ReaderMode.render(html, 'CdProjets', Object.assign({}, RECORD_2), NO_HF);
      const textB = reader.querySelector('.reader-content').textContent;
      reader.style.display = 'none';
      modal = await openConditionWindow(h, 'Titre');
      row = modal.querySelector('.macro-rule-row');
      const reopened = { shown: shown(columnWrap(row)), advancedHidden: row.querySelector('.macro-rule-column-advanced').hidden, value: row.querySelector('.macro-rule-value').value };
      modal.querySelector('.var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)').click();
      await h.sleep(60);
      const met = I18n.t('varCond.debug.currentMet', { id: 1, value: 'Projet A' });
      const count = I18n.t('varCond.debug.count', { table: 'CdProjets', count: 1, total: 2 });
      const pass = during.lines[0].includes(met) && during.lines[1].includes(count) && during.linkHintHidden && during.shown === 'CdProjets.Accompagnateur.Email'
        && same(saved, { mode: 'all', rules: [{ column: 'CdProjets.Accompagnateur.Email', operator: '=', value: 'dupont@exemple.fr' }] })
        && textA.includes('Objet : Projet A') && textB.includes('Objet :') && !textB.includes('Projet B') && !textB.includes('Projet A')
        && reopened.shown === 'CdProjets.Accompagnateur.Email' && reopened.advancedHidden && reopened.value === 'dupont@exemple.fr';
      return { pass, notes: JSON.stringify({ during, saved, textA, textB, reopened }) };
    }),
  });

  // Le macro-modèle (js/macro-editor.js, ConditionFields.buildTemplateRule) : ses modèles viennent de Templates.getCached(), remplacé le temps du cas ; l'enregistrement
  // est saisi au passage de Templates.save, qui échoue exprès (le vrai enregistrement recharge l'application sur le nouveau macro-modèle).
  const MACRO_TEMPLATES = [
    { id: 11, nom: 'Notification_base', typeModele: 'document' },
    { id: 12, nom: 'Notification_bureau', typeModele: 'document' },
  ];
  cases.push({
    id: 'coldesc_macro_rule_has_the_arrows_and_the_rule_picks_its_model_by_the_path',
    description: 'Macro-modèle : la colonne d’une règle a les mêmes flèches ; descendre dans Accompagnateur, choisir Email et saisir la valeur enregistre une règle sur « CdProjets.Accompagnateur.Email », qui choisit son modèle pour le projet A et le modèle par défaut pour le B ; la fenêtre rouverte montre le chemin comme un choix de la liste',
    run: (h) => withSeed(h, async () => {
      const realCached = Templates.getCached;
      const realSave = Templates.save;
      const realAlert = window.alert;
      const realError = console.error;
      const modal = () => document.getElementById('macro-editor-modal');
      const close = async () => { document.getElementById('macro-editor-cancel').click(); await h.sleep(30); };
      let out;
      try {
        Templates.getCached = () => MACRO_TEMPLATES;
        MacroEditor.openModal(null);
        document.getElementById('macro-editor-add-slot').click();
        await h.sleep(60);
        let row = modal().querySelector('.macro-rule-row');
        let wrap = columnWrap(row);
        await open(h, wrap);
        const arrow = !!arrowOf(wrap, 'Accompagnateur');
        const noArrowOnText = !arrowOf(wrap, 'Titre');
        await descend(h, wrap, 'Accompagnateur');
        await pickHere(h, wrap, 'Email');
        const chosen = { value: selectOf(wrap).value, shown: shown(wrap), advancedHidden: row.querySelector('.macro-rule-column-advanced').hidden };
        setInput(row.querySelector('.macro-rule-value'), 'dupont@exemple.fr');
        const model = row.querySelector('select.macro-rule-modele');
        model.value = '12';
        model.dispatchEvent(new Event('change', { bubbles: true }));
        const byDefault = modal().querySelector('select.macro-slot-default-select');
        byDefault.value = '11';
        byDefault.dispatchEvent(new Event('change', { bubbles: true }));
        let captured = null;
        Templates.save = async (...args) => { captured = args; throw new Error('enregistrement simulé (test)'); };
        window.alert = () => {};
        console.error = () => {};
        document.getElementById('macro-editor-name').value = 'Macro de test';
        document.getElementById('macro-editor-save').click();
        await h.sleep(80);
        const slot = JSON.parse(captured[2]).slots[0];
        const pickedA = await MacroTemplates.pickModeleId(slot, 'CdProjets', Object.assign({}, RECORD_1));
        const pickedB = await MacroTemplates.pickModeleId(slot, 'CdProjets', Object.assign({}, RECORD_2));
        await close();
        // Rouverte avec cette règle : le chemin est une ligne de la liste, pas une saisie avancée.
        MacroEditor.openModal({ id: 901, nom: 'Macro de test', macroSlots: { slots: [slot] } });
        await h.sleep(60);
        row = modal().querySelector('.macro-rule-row');
        wrap = columnWrap(row);
        const reopened = { value: selectOf(wrap).value, shown: shown(wrap), advancedHidden: row.querySelector('.macro-rule-column-advanced').hidden };
        out = { arrow, noArrowOnText, chosen, rules: slot.rules, pickedA, pickedB, reopened };
      } finally {
        Templates.getCached = realCached;
        Templates.save = realSave;
        window.alert = realAlert;
        console.error = realError;
        await close();
      }
      const path = 'CdProjets.Accompagnateur.Email';
      const pass = out.arrow && out.noArrowOnText
        && out.chosen.value === path && out.chosen.shown === path && out.chosen.advancedHidden
        && same(out.rules.map(r => [r.column, r.operator, r.value, r.modeleId]), [[path, '=', 'dupont@exemple.fr', '12']])
        && out.pickedA === '12' && out.pickedB === '11'
        && out.reopened.value === path && out.reopened.shown === path && out.reopened.advancedHidden;
      return { pass, notes: JSON.stringify(out) };
    }),
  });

  cases.push({
    id: 'coldesc_qr_insert_column_list_has_the_arrows_and_writes_the_path',
    description: '« Insérer une colonne… » du QR code : la même flèche sur les colonnes Référence simple (Table.Colonne), les colonnes où elle mène sans les pièces jointes ; le choix s’écrit « #CdProjets.Accompagnateur.Email » à la place de la sélection du champ et l’aperçu lit l’e-mail de la personne',
    run: (h) => withSeed(h, async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      document.getElementById('v2-btn-qr').click();
      await sleep(250);
      const field = document.getElementById('pp-qr-text');
      field.value = 'https://suivi.exemple/';
      field.setSelectionRange(field.value.length, field.value.length);
      field.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(300);
      document.querySelector('#pp-qr-modal .pp-qr-column').click();
      await sleep(250);
      const wrap = document.querySelector('#pp-qr-modal .ss-wrap');
      const rootArrows = optionRows(wrap).filter(li => li.classList.contains('has-children')).map(nameOf).sort();
      await descend(h, wrap, 'CdProjets.Accompagnateur');
      const below = { crumbs: crumbs(wrap), names: names(wrap) };
      await pickHere(h, wrap, 'Email');
      await sleep(500);
      const value = field.value;
      const image = document.querySelector('#pp-qr-modal .pp-qr-image');
      const message = document.querySelector('#pp-qr-modal .pp-qr-message');
      const preview = { image: !!image && !image.hidden, message: message ? message.textContent : null };
      const listClosed = !document.querySelector('#pp-qr-modal .ss-panel:not([hidden])');
      document.querySelector('#pp-qr-modal .var-modal-actions button:not(.var-modal-primary)').click();
      await sleep(80);
      const pass = same(rootArrows, ['CdProjets.Accompagnateur', 'CdProjets.Porteur', 'CdServices.Chef', 'CdAnnuaire.Service', 'CdOutils.Responsable'].sort())
        && same(below.crumbs, ['Colonnes', 'CdProjets.Accompagnateur']) && same(below.names, ['Nom', 'Email', 'Fonction', 'Service', 'Competences'])
        && value === 'https://suivi.exemple/#CdProjets.Accompagnateur.Email' && listClosed && preview.image;
      return { pass, notes: JSON.stringify({ rootArrows, below, value, listClosed, preview }) };
    }),
  });

  cases.push({
    id: 'coldesc_replace_column_list_has_the_arrows_and_the_bubble_takes_the_path',
    description: '« Colonne… » d’une bulle : la même flèche ; descendre dans CdProjets.Accompagnateur puis choisir Email donne à la bulle la colonne « Accompagnateur.Email » (clé « CdProjets.Accompagnateur.Email »), son format et sa condition gardés quand ils valent encore',
    run: (h) => withSeed(h, async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const condition = { mode: 'all', rules: [{ column: 'Titre', operator: '=', value: 'Projet A' }] };
      const attr = (name, value) => ` ${name}="${JSON.stringify(value).replace(/"/g, '&quot;')}"`;
      Editor.setHTML('<p><span class="var-badge" data-table="CdProjets" data-column="Titre" data-key="CdProjets.Titre"' + attr('data-condition', condition) + '></span></p>');
      await sleep(120);
      const ed = EditorCore.getEditor();
      let pos = -1;
      ed.state.doc.descendants((node, at) => { if (node.type.name === 'varBadge' && pos < 0) pos = at; });
      const opened = VariableColumn.open(ed, pos);
      await sleep(150);
      const panel = Array.from(document.querySelectorAll('.ss-panel')).find(p => !p.hidden);
      const wrap = panel && panel.closest('.ss-wrap');
      if (!wrap) return { pass: false, notes: JSON.stringify({ opened, panel: !!panel }) };
      const rootArrows = optionRows(wrap).filter(li => li.classList.contains('has-children')).map(nameOf).sort();
      await descend(h, wrap, 'CdProjets.Accompagnateur');
      const below = { crumbs: crumbs(wrap), names: names(wrap) };
      await pickHere(h, wrap, 'Email');
      await sleep(250);
      let attrs = null;
      ed.state.doc.descendants(node => { if (node.type.name === 'varBadge' && !attrs) attrs = node.attrs; });
      const hostGone = !document.getElementById('v2-var-column-search');
      const pass = opened === true && same(rootArrows, ['CdProjets.Accompagnateur', 'CdProjets.Porteur', 'CdServices.Chef', 'CdAnnuaire.Service', 'CdOutils.Responsable'].sort())
        && same(below.crumbs, ['Colonnes', 'CdProjets.Accompagnateur']) && !!attrs && attrs.table === 'CdProjets' && attrs.column === 'Accompagnateur.Email'
        && attrs.key === 'CdProjets.Accompagnateur.Email' && same(attrs.condition, condition) && hostGone
        && Variables.badgeProblem(attrs.table, attrs.column) === null;
      return { pass, notes: JSON.stringify({ opened, rootArrows, below, attrs: attrs && { table: attrs.table, column: attrs.column, key: attrs.key, condition: attrs.condition }, hostGone }) };
    }),
  });

  cases.push({
    id: 'coldesc_descend_texts_speak_english',
    description: 'En anglais : « Show the columns of “CdAnnuaire” (via Accompagnateur) » sur la flèche, « Columns › Accompagnateur » au fil d’Ariane, « Go back up to » / « Back to all columns » sur ses boutons, « Columns of “CdAnnuaire” » annoncé aux lecteurs d’écran',
    run: (h) => withSeed(h, async () => {
      I18n.setLang('en');
      const { row } = buildRow({ column: '', operator: '=', value: '' });
      const wrap = columnWrap(row);
      await open(h, wrap);
      const arrowTitle = arrowOf(wrap, 'Accompagnateur') ? arrowOf(wrap, 'Accompagnateur').title : null;
      await descend(h, wrap, 'Accompagnateur');
      const result = { arrowTitle, crumbs: crumbs(wrap), status: panelOf(wrap).querySelector('.ss-status').textContent, root: panelOf(wrap).querySelector('.ss-crumb[data-depth="0"]').title, path: panelOf(wrap).querySelector('.ss-path').getAttribute('aria-label') };
      await descend(h, wrap, 'Service');
      result.up = panelOf(wrap).querySelector('.ss-crumb[data-depth="1"]').title;
      const pass = arrowTitle === 'Show the columns of “CdAnnuaire” (via Accompagnateur)' && same(result.crumbs, ['Columns', 'Accompagnateur'])
        && result.status === 'Columns of “CdAnnuaire”' && result.root === 'Back to all columns' && result.path === 'Reference path' && result.up === 'Go back up to “CdAnnuaire”';
      return { pass, notes: JSON.stringify(result) };
    }),
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.columnDescend = cases;
})();
