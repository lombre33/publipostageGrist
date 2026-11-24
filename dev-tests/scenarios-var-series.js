// Suite "varSeries" - la ligne suivante ou précédente d'une série (demande du 24/11 : des instances qui s'enchaînent, avec un numéro et une date ; dans un email,
// une variable donne la ligne choisie et une autre la ligne d'après). Un maillon « +1(Date;Cycle) » dans le chemin d'une variable (GristAPI.stepOf,
// Variables.resolveRows) passe à la ligne qui suit, quand les lignes de la table sont rangées selon Date, parmi celles qui ont la même valeur dans Cycle ; « -2(Date) »
// la deuxième d'avant, dans toute la table. Cinq choix tranchés : le rang se règle à chaque maillon, rien ne s'écrit quand il n'y a pas de ligne voisine, le décalage est un
// nombre (±n), le groupe est une colonne, l'ordre est celui de la colonne choisie - jamais celui de l'écran - et, à égalité, celui de la table. Ligne courante livrée comme
// par le vrai grist.onRecord.
(function () {
  const cases = [];

  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const PAGE = 'VsInstances';
  // 2025-01-01 en secondes, plus n jours : ce que Grist range dans une colonne Date.
  const DAY = n => 1735689600 + n * 86400;
  // Cycle A : 2 (jour 0) → 4 (jour 15) → 7 (jour 15, même date : l'ordre de la table décide) → 1 (jour 30) ; la ligne 6 n'a pas de date. Cycle B : 5 (jour 5) → 3 (jour 10).
  const ROWS = [
    { id: 1, Titre: 'Séance 3', Cycle: 'A', Date: DAY(30), Numero: 3, Responsable: 1, gristHelper_Display: 'Jean' },
    { id: 2, Titre: 'Séance 1', Cycle: 'A', Date: DAY(0), Numero: 1, Responsable: 2, gristHelper_Display: 'Anne' },
    { id: 3, Titre: 'Séance B2', Cycle: 'B', Date: DAY(10), Numero: 2, Responsable: 1, gristHelper_Display: 'Jean' },
    { id: 4, Titre: 'Séance 2', Cycle: 'A', Date: DAY(15), Numero: 2, Responsable: 2, gristHelper_Display: 'Anne' },
    { id: 5, Titre: 'Séance B1', Cycle: 'B', Date: DAY(5), Numero: 1, Responsable: 0, gristHelper_Display: '' },
    { id: 6, Titre: 'Sans date', Cycle: 'A', Date: null, Numero: 4, Responsable: 0, gristHelper_Display: '' },
    { id: 7, Titre: 'Séance 2 bis', Cycle: 'A', Date: DAY(15), Numero: 22, Responsable: 1, gristHelper_Display: 'Jean' },
  ];

  const badgeHtml = (table, column) => `<span class="var-badge" data-table="${table}" data-column="${column}" data-key="${table}.${column}"></span>`;

  async function seed(h) {
    VariableLinkedAttrs.close({ keepFocus: true });
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables('VsPersonnes', { Nom: 'Text', Email: 'Text' });
    stub.setRows('VsPersonnes', [{ id: 1, Nom: 'Jean', Email: 'jean@ex.fr' }, { id: 2, Nom: 'Anne', Email: 'anne@ex.fr' }]);
    stub.setVariables(PAGE, { Titre: 'Text', Cycle: 'Text', Date: 'Date', Numero: 'Int', Responsable: 'Ref:VsPersonnes', gristHelper_Display: 'Text' }, null, { Responsable: 'gristHelper_Display' });
    stub.setRows(PAGE, ROWS.map(r => Object.assign({}, r)));
    await GristAPI.refreshSchema();
    await GristAPI.deleteLinkRule('VsPersonnes');
    await at(h, 2);
  }
  // La ligne affichée par la page : celle d'identifiant `id`, comme grist.onRecord la livre (la Référence en valeur affichée).
  async function at(h, id) {
    const row = ROWS.find(r => r.id === id);
    window.__gristStub.fireRecord({ id, Titre: row.Titre, Cycle: row.Cycle, Date: row.Date, Numero: row.Numero, Responsable: row.gristHelper_Display }, PAGE);
    await h.sleep(50);
  }
  async function readerText(html) {
    const reader = document.getElementById('reader-container');
    reader.style.display = 'block';
    await ReaderMode.render(html, PAGE, GristAPI.getCurrentRecord(), NO_HF);
    return reader.querySelector('.reader-content').textContent;
  }
  // Ce que la bulle de ce chemin écrit sur la ligne `id` de la page.
  async function read(h, id, path) {
    await at(h, id);
    return readerText(`<p>${badgeHtml(PAGE, path)}</p>`);
  }
  async function previewText(html, row) {
    const box = document.createElement('div');
    box.innerHTML = await ReaderMode.preview(html, PAGE, row);
    return box.textContent;
  }

  cases.push({
    id: 'varseries_next_and_previous_follow_the_order_of_the_column_inside_the_group',
    description: '« +1(Date;Cycle) » écrit le titre de la ligne qui suit dans l’ordre des dates parmi celles du même cycle, « -1 » celle qui précède, « +2 » / « -2 » la deuxième : dans le cycle A, 2 → 4 → 7 → 1 (la ligne 6 n’a pas de date : hors série), dans le cycle B, 5 → 3 ; les lignes ne sont pas dans l’ordre des dates dans la table',
    run: async (h) => {
      await seed(h);
      const got = {
        from2: [await read(h, 2, '+1(Date;Cycle).Titre'), await read(h, 2, '+2(Date;Cycle).Titre'), await read(h, 2, '+3(Date;Cycle).Titre'), await read(h, 2, '+4(Date;Cycle).Titre')],
        before2: await read(h, 2, '-1(Date;Cycle).Titre'),
        from1: [await read(h, 1, '-1(Date;Cycle).Titre'), await read(h, 1, '-2(Date;Cycle).Titre'), await read(h, 1, '-3(Date;Cycle).Titre'), await read(h, 1, '-4(Date;Cycle).Titre')],
        after1: await read(h, 1, '+1(Date;Cycle).Titre'),
        b: [await read(h, 5, '+1(Date;Cycle).Titre'), await read(h, 3, '-1(Date;Cycle).Titre'), await read(h, 3, '+1(Date;Cycle).Titre')],
      };
      const pass = JSON.stringify(got) === JSON.stringify({
        from2: ['Séance 2', 'Séance 2 bis', 'Séance 3', ''], before2: '',
        from1: ['Séance 2 bis', 'Séance 2', 'Séance 1', ''], after1: '',
        b: ['Séance B2', 'Séance B1', ''],
      });
      return { pass, notes: JSON.stringify(got) };
    },
  });

  cases.push({
    id: 'varseries_without_a_group_the_whole_table_is_one_series',
    description: 'Sans colonne de groupe (« +1(Date) »), toute la table est une série : après la ligne 5 (cycle B, jour 5) vient la 3 (jour 10), puis la 4 (jour 15), qui est du cycle A',
    run: async (h) => {
      await seed(h);
      const got = [await read(h, 2, '+1(Date).Titre'), await read(h, 5, '+1(Date).Titre'), await read(h, 3, '+1(Date).Titre'), await read(h, 1, '+1(Date).Titre'), await read(h, 3, '-1(Date).Titre')];
      const pass = JSON.stringify(got) === JSON.stringify(['Séance B1', 'Séance B2', 'Séance 2', '', 'Séance B1']);
      return { pass, notes: JSON.stringify(got) };
    },
  });

  cases.push({
    id: 'varseries_ties_follow_the_order_of_the_table_and_empty_cells_are_out_of_the_series',
    description: 'Deux lignes à la même date (4 et 7, jour 15) se suivent dans l’ordre de la table, dans les deux sens ; une ligne sans date (6) n’a ni précédente ni suivante et n’est la voisine d’aucune autre',
    run: async (h) => {
      await seed(h);
      const got = {
        tieAfter: await read(h, 4, '+1(Date;Cycle).Titre'),
        tieBefore: await read(h, 7, '-1(Date;Cycle).Titre'),
        noDateAfter: await read(h, 6, '+1(Date;Cycle).Titre'),
        noDateBefore: await read(h, 6, '-1(Date;Cycle).Titre'),
        lastBeforeIt: await read(h, 1, '+1(Date;Cycle).Titre'),
      };
      const pass = JSON.stringify(got) === JSON.stringify({ tieAfter: 'Séance 2 bis', tieBefore: 'Séance 2', noDateAfter: '', noDateBefore: '', lastBeforeIt: '' });
      return { pass, notes: JSON.stringify(got) };
    },
  });

  cases.push({
    id: 'varseries_the_chosen_column_decides_and_numbers_sort_as_numbers',
    description: 'Rangées selon Numero (un entier), les lignes du cycle A vont 1 (ligne 2), 2 (ligne 4), 3 (ligne 1), 4 (ligne 6, sans date mais avec un numéro), 22 (ligne 7) : 22 vient après 4, pas avant 3 comme un texte',
    run: async (h) => {
      await seed(h);
      const got = [await read(h, 2, '+1(Numero;Cycle).Titre'), await read(h, 2, '+2(Numero;Cycle).Titre'), await read(h, 2, '+3(Numero;Cycle).Titre'), await read(h, 2, '+4(Numero;Cycle).Titre'), await read(h, 6, '+1(Numero;Cycle).Titre')];
      const pass = JSON.stringify(got) === JSON.stringify(['Séance 2', 'Séance 3', 'Sans date', 'Séance 2 bis', 'Séance 2 bis']);
      return { pass, notes: JSON.stringify(got) };
    },
  });

  cases.push({
    id: 'varseries_no_neighbor_writes_nothing_and_no_error',
    description: 'Au bout de la série, la bulle n’écrit rien et ne signale aucune erreur ; la bulle de la ligne voisine garde son format de date, et se lit comme la bulle ordinaire de cette ligne-là',
    run: async (h) => {
      await seed(h);
      const end = await read(h, 1, '+1(Date;Cycle).Titre');
      const neighborDate = await read(h, 2, '+2(Date;Cycle).Date');
      const sameRowDate = await read(h, 7, 'Date');
      const pass = end === '' && neighborDate !== '' && /\d/.test(neighborDate) && neighborDate === sameRowDate && !/ERREUR|ERROR/.test(end + neighborDate);
      return { pass, notes: JSON.stringify({ end, neighborDate, sameRowDate }) };
    },
  });

  cases.push({
    id: 'varseries_goes_on_through_references_in_both_directions',
    description: 'Après la ligne voisine on descend de référence en référence : « +1(Date;Cycle).Responsable.Email » est l’email du responsable de la ligne suivante ; et le maillon peut venir après une référence : « Responsable.+1(Nom).Email » est l’email de la personne qui suit celle de la ligne dans l’annuaire',
    run: async (h) => {
      await seed(h);
      const got = [await read(h, 2, '+1(Date;Cycle).Responsable.Email'), await read(h, 4, '+1(Date;Cycle).Responsable.Email'), await read(h, 2, 'Responsable.+1(Nom).Email'), await read(h, 4, 'Responsable.-1(Nom).Email'), await read(h, 1, 'Responsable.+1(Nom).Email')];
      const pass = JSON.stringify(got) === JSON.stringify(['anne@ex.fr', 'jean@ex.fr', 'jean@ex.fr', '', '']);
      return { pass, notes: JSON.stringify(got) };
    },
  });

  cases.push({
    id: 'varseries_batch_rows_read_the_same_series',
    description: 'Une ligne lue par fetchTable (export en lot) donne la même ligne voisine que la ligne affichée : pour chaque ligne, « +1(Date;Cycle).Titre » est le titre de la suivante de son cycle',
    run: async (h) => {
      await seed(h);
      const html = `<p>${badgeHtml(PAGE, '+1(Date;Cycle).Titre')}</p>`;
      const rows = await GristAPI.fetchTableRows(PAGE);
      const got = {};
      for (const row of rows) got[row.id] = await previewText(html, row);
      const pass = JSON.stringify(got) === JSON.stringify({ 1: '', 2: 'Séance 2', 3: '', 4: 'Séance 2 bis', 5: 'Séance B2', 6: '', 7: 'Séance 3' });
      return { pass, notes: JSON.stringify(got) };
    },
  });

  cases.push({
    id: 'varseries_the_token_is_read_and_checked_like_a_path',
    description: 'stepOf lit le maillon (sens, rang, colonne d’ordre, groupe), refuse un décalage nul ou une forme qui n’en est pas une, stepToken l’écrit à l’identique ; le chemin garde le type de sa dernière colonne ; une colonne d’ordre ou de groupe disparue rend la bulle rouge (« path »), une bulle intacte non',
    run: async (h) => {
      await seed(h);
      const parsed = [GristAPI.stepOf('+1(Date;Cycle)'), GristAPI.stepOf('-12(Date)'), GristAPI.stepOf('+0(Date)'), GristAPI.stepOf('1(Date)'), GristAPI.stepOf('+1(Date;)'), GristAPI.stepOf('Date'), GristAPI.stepOf('+1()'), GristAPI.stepOf('+1(A.B)')];
      const tokens = [GristAPI.stepToken(1, 'Date', 'Cycle'), GristAPI.stepToken(-2, 'Date', ''), GristAPI.stepToken(3, 'Numero')];
      const roundTrip = GristAPI.stepOf(GristAPI.stepToken(-7, 'Date', 'Cycle'));
      const types = [GristAPI.getColumnType(PAGE, '+1(Date;Cycle).Date'), GristAPI.getColumnType(PAGE, '+1(Date;Cycle).Titre'), GristAPI.getColumnType(PAGE, 'Responsable.+1(Nom).Email')];
      const problems = [
        Variables.badgeProblem(PAGE, '+1(Date;Cycle).Titre'),
        Variables.badgeProblem(PAGE, '+1(Disparue;Cycle).Titre'),
        Variables.badgeProblem(PAGE, '+1(Date;Disparue).Titre'),
        Variables.badgeProblem(PAGE, '+1(Date;Cycle).Disparue'),
      ];
      const pass = JSON.stringify(parsed) === JSON.stringify([{ offset: 1, order: 'Date', group: 'Cycle' }, { offset: -12, order: 'Date', group: '' }, null, null, { offset: 1, order: 'Date', group: '' }, null, null, null])
        && JSON.stringify(tokens) === JSON.stringify(['+1(Date;Cycle)', '-2(Date)', '+3(Numero)']) && roundTrip.offset === -7 && roundTrip.order === 'Date' && roundTrip.group === 'Cycle'
        && JSON.stringify(types) === JSON.stringify(['Date', 'Text', 'Text']) && JSON.stringify(problems) === JSON.stringify([null, 'path', 'path', 'path']);
      return { pass, notes: JSON.stringify({ parsed, tokens, roundTrip, types, problems }) };
    },
  });

  cases.push({
    id: 'varseries_a_renamed_column_is_followed_in_the_token',
    description: 'La colonne d’ordre et la colonne de groupe renommées dans Grist sont réécrites dans le maillon de la bulle (« +1(Date;Cycle).Titre » devient « +1(Quand;Serie).Titre »), clé comprise ; la colonne finale renommée l’est aussi, une bulle dont le maillon est à jour n’est pas touchée',
    run: async (h) => {
      await seed(h);
      const OLD = { f: 1, t: { 1: [PAGE, { 1: 'Titre', 2: 'Date', 3: 'Cycle' }] } };
      const NEW = { f: 1, t: { 1: [PAGE, { 1: 'Intitule', 2: 'Quand', 3: 'Serie' }] } };
      const m = SchemaRenames.createMapper(OLD, NEW, {});
      const ctx = { page: m.tableContext(PAGE), trigger: Variables.triggerChar() };
      const out = SchemaRenames.rewriteHtml(`<p>${badgeHtml(PAGE, '+1(Date;Cycle).Titre')}</p>`, m, ctx);
      const tpl = document.createElement('template');
      tpl.innerHTML = out.html;
      const badge = tpl.content.querySelector('.var-badge');
      const found = badge ? { column: badge.getAttribute('data-column'), key: badge.getAttribute('data-key') } : null;
      const same = SchemaRenames.createMapper(OLD, OLD, {});
      const untouched = SchemaRenames.rewriteHtml(`<p>${badgeHtml(PAGE, '+1(Date;Cycle).Titre')}</p>`, same, { page: same.tableContext(PAGE), trigger: Variables.triggerChar() });
      const pass = !!found && found.column === '+1(Quand;Serie).Intitule' && found.key === `${PAGE}.+1(Quand;Serie).Intitule` && untouched.count === 0;
      return { pass, notes: JSON.stringify({ count: out.count, found, untouched: untouched.count }) };
    },
  });

  // --- La fenêtre « Autres colonnes de la même ligne » : le volet « Ligne suivante ou précédente » ---
  const toolbar = () => document.querySelector('.v2-varfmt-toolbar');
  const pressToolbarButton = action => toolbar().querySelector(`button[data-action="${action}"]`).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  const modal = () => document.getElementById('var-linked-modal');
  const step = sel => modal().querySelector('.var-linked-step' + (sel ? '-' + sel : ''));
  const rowOf = col => modal().querySelector(`.var-linked-row[data-col="${col}"]`);
  const valueOf = col => rowOf(col).querySelector('.var-linked-value').textContent;
  const crumbs = () => Array.from(modal().querySelectorAll('.var-linked-path .var-linked-crumb')).map(c => c.textContent);
  const keysAfter = ed => {
    const seq = [];
    ed.state.doc.firstChild.forEach(n => seq.push(n.type.name === 'varBadge' ? '#' + n.attrs.key : n.text));
    return seq;
  };
  async function selectBadge(h, table, column) {
    const ed = EditorCore.getEditor();
    document.querySelector('.tiptap').focus();
    let found = null;
    ed.state.doc.descendants((node, pos) => { if (!found && node.type.name === 'varBadge' && node.attrs.table === table && node.attrs.column === column) found = pos; });
    if (found === null) return null;
    ed.commands.setNodeSelection(found);
    await h.sleep(120);
    return ed;
  }
  async function openWindow(h, table, column) {
    const ed = await selectBadge(h, table, column);
    pressToolbarButton('var-linked');
    await h.sleep(300);
    return ed;
  }
  // Règle un champ de la fenêtre comme la personne le fait : la valeur, puis « change ».
  const choose = (name, value) => {
    const field = step(name);
    field.value = value;
    field.dispatchEvent(new Event('change', { bubbles: true }));
  };

  cases.push({
    id: 'varseries_window_opens_for_an_ordinary_column_with_the_panel_open_and_goes_to_the_next_row',
    description: 'La fenêtre « Autres colonnes de la même ligne » s’ouvre aussi pour une colonne ordinaire de la page (#VsInstances.Titre) : son volet « Ligne suivante ou précédente » est ouvert d’emblée, « Aller à cette ligne » grisé tant que la colonne d’ordre n’est pas choisie ; avec Date et Cycle, le fil d’Ariane dit le maillon et la liste montre les valeurs de la ligne suivante (n° 4)',
    run: async (h) => {
      await seed(h);
      Editor.setHTML(`<p>${badgeHtml(PAGE, 'Titre')}</p>`);
      const available = VariableLinkedAttrs.isAvailable({ table: PAGE, column: 'Titre' });
      await openWindow(h, PAGE, 'Titre');
      const opened = { available, open: !!modal() && modal().getClientRects().length > 0, panelOpen: step().open, goDisabled: step('go').disabled };
      const crumbsBefore = crumbs();
      choose('order', 'Date');
      const goEnabled = !step('go').disabled;
      choose('group', 'Cycle');
      step('go').click();
      await h.sleep(300);
      const after = { crumbs: crumbs(), titre: valueOf('Titre'), cycle: valueOf('Cycle'), numero: valueOf('Numero'), panelClosed: !step().open };
      const pass = available && opened.open && opened.panelOpen && opened.goDisabled && goEnabled && crumbsBefore.length === 0
        && JSON.stringify(after.crumbs) === JSON.stringify([PAGE, '+1(Date;Cycle)']) && after.titre === 'Séance 2' && after.cycle === 'A' && after.numero === '2' && after.panelClosed;
      return { pass, notes: JSON.stringify({ opened, crumbsBefore, goEnabled, after }) };
    },
  });

  cases.push({
    id: 'varseries_window_replace_puts_the_path_in_the_bubble_and_one_undo_gives_it_back',
    description: 'Dans le niveau de la ligne suivante, cocher Titre puis « Remplacer » met #VsInstances.+1(Date;Cycle).Titre à la place de la bulle (une seule bulle, qui écrit le titre de la ligne d’après) ; un seul Annuler rend #VsInstances.Titre ; « Insérer » la pose à la suite de la bulle, avec une espace',
    run: async (h) => {
      await seed(h);
      Editor.setHTML(`<p>${badgeHtml(PAGE, 'Titre')}</p>`);
      let ed = await openWindow(h, PAGE, 'Titre');
      choose('order', 'Date');
      choose('group', 'Cycle');
      step('go').click();
      await h.sleep(250);
      const box = rowOf('Titre').querySelector('input');
      box.checked = true;
      box.dispatchEvent(new Event('change', { bubbles: true }));
      modal().querySelector('button.var-linked-replace').click();
      await h.sleep(150);
      const replaced = keysAfter(ed);
      await at(h, 2);
      const text = await readerText(Editor.getHTML());
      ed.commands.undo();
      await h.sleep(100);
      const undone = keysAfter(ed);

      Editor.setHTML(`<p>${badgeHtml(PAGE, 'Titre')}</p>`);
      ed = await openWindow(h, PAGE, 'Titre');
      choose('order', 'Date');
      choose('group', '');
      step('go').click();
      await h.sleep(250);
      const box2 = rowOf('Titre').querySelector('input');
      box2.checked = true;
      box2.dispatchEvent(new Event('change', { bubbles: true }));
      modal().querySelector('.var-modal-primary').click();
      await h.sleep(150);
      const inserted = keysAfter(ed);
      const pass = JSON.stringify(replaced) === JSON.stringify([`#${PAGE}.+1(Date;Cycle).Titre`]) && text === 'Séance 2'
        && JSON.stringify(undone) === JSON.stringify([`#${PAGE}.Titre`]) && JSON.stringify(inserted) === JSON.stringify([`#${PAGE}.Titre`, ' ', `#${PAGE}.+1(Date).Titre`]);
      return { pass, notes: JSON.stringify({ replaced, text, undone, inserted }) };
    },
  });

  cases.push({
    id: 'varseries_window_says_when_there_is_no_row_and_remembers_the_columns_chosen_for_the_table',
    description: 'Sur la dernière ligne de la série, la fenêtre dit qu’il n’y a aucune ligne à montrer ; rouverte sur la même table, elle propose d’emblée les colonnes d’ordre et de groupe choisies la fois d’avant, et rang et sens repartent de « suivante, 1 » ; rang 2 et « précédente » donnent « -2(Date;Cycle) »',
    run: async (h) => {
      await seed(h);
      await at(h, 1);
      Editor.setHTML(`<p>${badgeHtml(PAGE, 'Titre')}</p>`);
      await openWindow(h, PAGE, 'Titre');
      choose('order', 'Date');
      choose('group', 'Cycle');
      step('go').click();
      await h.sleep(300);
      const note = modal().querySelector('.var-linked-note').textContent;
      VariableLinkedAttrs.close({ keepFocus: true });
      await h.sleep(100);
      await at(h, 1);
      Editor.setHTML(`<p>${badgeHtml(PAGE, 'Titre')}</p>`);
      await openWindow(h, PAGE, 'Titre');
      const remembered = { order: step('order').value, group: step('group').value, direction: step('direction').value, rank: step('rank').value, goEnabled: !step('go').disabled };
      choose('direction', 'before');
      step('rank').value = '2';
      step('go').click();
      await h.sleep(300);
      const after = { crumbs: crumbs(), titre: valueOf('Titre') };
      const pass = /vide|empty/.test(note) && /\+1\(Date;Cycle\)/.test(note)
        && remembered.order === 'Date' && remembered.group === 'Cycle' && remembered.direction === 'after' && remembered.rank === '1' && remembered.goEnabled
        && JSON.stringify(after.crumbs) === JSON.stringify([PAGE, '-2(Date;Cycle)']) && after.titre === 'Séance 2';
      return { pass, notes: JSON.stringify({ note, remembered, after }) };
    },
  });

  cases.push({
    id: 'varseries_panel_is_closed_on_a_variable_from_a_reference_and_offers_the_columns_of_its_level',
    description: 'Sur une variable qui descend d’une référence (#VsInstances.Responsable.Email) la fenêtre garde son volet replié ; au niveau de la table de l’annuaire, il propose les colonnes de cette table (Nom, Email), pas celles des instances',
    run: async (h) => {
      await seed(h);
      Editor.setHTML(`<p>${badgeHtml(PAGE, 'Responsable.Email')}</p>`);
      await openWindow(h, PAGE, 'Responsable.Email');
      const closed = !step().open;
      const orderOptions = Array.from(step('order').options).map(o => o.value);
      const crumbsNow = crumbs();
      const pass = closed && JSON.stringify(orderOptions) === JSON.stringify(['', 'Nom', 'Email']) && JSON.stringify(crumbsNow) === JSON.stringify([PAGE, 'Responsable']);
      return { pass, notes: JSON.stringify({ closed, orderOptions, crumbsNow }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.varSeries = cases;
})();
