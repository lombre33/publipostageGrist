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

  // --- Lot 2 : les endroits où la variable se lit sans bulle de corps de modèle : champs texte, conditions, calculs, renommages, exports ---
  // La ligne telle que grist.onRecord la livre (la Référence en valeur affichée).
  const recordOf = id => {
    const row = ROWS.find(r => r.id === id);
    return { id, Titre: row.Titre, Cycle: row.Cycle, Date: row.Date, Numero: row.Numero, Responsable: row.gristHelper_Display };
  };
  const NEXT = '+1(Date;Cycle)';
  const SCHEMA_OLD = { f: 1, t: { 1: [PAGE, { 1: 'Titre', 2: 'Date', 3: 'Cycle', 4: 'Numero' }] } };
  const SCHEMA_NEW = { f: 1, t: { 1: [PAGE, { 1: 'Intitule', 2: 'Quand', 3: 'Serie', 4: 'Numero' }] } };

  cases.push({
    id: 'varseries_text_fields_read_the_hop_straight_after_the_table',
    description: 'Dans un champ texte (Objet, À, Cc, Cci, nom du PDF), « #VsInstances.+1(Date;Cycle).Titre » est la variable de la ligne suivante, même sans colonne avant le maillon : deux dans la même phrase, le point de fin de phrase reste du texte, rien d’écrit au bout de la série, « -1 » la ligne d’avant ; un maillon sans colonne finale, ou dont la colonne d’ordre n’existe pas, reste du texte',
    run: async (h) => {
      await seed(h);
      const sentence = `Prochaine : #${PAGE}.${NEXT}.Titre, puis #${PAGE}.+2(Date;Cycle).Titre.`;
      const found = Variables.findTextVariables(sentence).map(v => [v.table, v.column, sentence.slice(v.start, v.end)]);
      const resolved = {
        row2: await Variables.resolveTextVariables(sentence, PAGE, recordOf(2)),
        row1: await Variables.resolveTextVariables(sentence, PAGE, recordOf(1)),
        before: await Variables.resolveTextVariables(`avant : #${PAGE}.-1(Date;Cycle).Titre|`, PAGE, recordOf(4)),
        noColumn: await Variables.resolveTextVariables(`#${PAGE}.${NEXT} fin`, PAGE, recordOf(2)),
        unknownOrder: await Variables.resolveTextVariables(`#${PAGE}.+1(Inconnue).Titre`, PAGE, recordOf(2)),
        ordinary: await Variables.resolveTextVariables(`#${PAGE}.Titre et #${PAGE}.Cycle`, PAGE, recordOf(2)),
      };
      const fileOfNext = await ReaderMode.resolveFilename(`Suite_#${PAGE}.${NEXT}.Titre`, PAGE, recordOf(2));
      const fileOfRow = await ReaderMode.resolveFilename(`Suite_#${PAGE}.Titre`, PAGE, recordOf(4));
      const expectedFound = [[PAGE, `${NEXT}.Titre`, `#${PAGE}.${NEXT}.Titre`], [PAGE, '+2(Date;Cycle).Titre', `#${PAGE}.+2(Date;Cycle).Titre`]];
      const pass = JSON.stringify(found) === JSON.stringify(expectedFound)
        && resolved.row2 === 'Prochaine : Séance 2, puis Séance 2 bis.' && resolved.row1 === 'Prochaine : , puis .' && resolved.before === 'avant : Séance 1|'
        && resolved.noColumn === `#${PAGE}.${NEXT} fin` && resolved.unknownOrder === `#${PAGE}.+1(Inconnue).Titre` && resolved.ordinary === 'Séance 1 et A'
        && fileOfNext === fileOfRow && /Suite_/.test(fileOfNext) && /Séance 2/.test(fileOfNext);
      return { pass, notes: JSON.stringify({ found, resolved, fileOfNext, fileOfRow }) };
    },
  });

  cases.push({
    id: 'varseries_a_text_field_keeps_the_hop_as_a_bubble_and_as_text',
    description: 'Le champ À enregistré en texte « #VsInstances.+1(Date;Cycle).Titre » se relit en UNE bulle dont la colonne est le chemin entier (maillon compris), se réécrit à l’identique, et se résout sur la ligne suivante ; avec du texte autour (virgule, mot après) la bulle ne mange rien et le texte revient tel quel',
    run: async (h) => {
      await seed(h);
      const to = document.getElementById('v2-email-to');
      const read = () => {
        const badges = [];
        FieldEditor.of(to).state.doc.descendants(node => { if (node.type.name === 'varBadge') badges.push([node.attrs.table, node.attrs.column, node.attrs.key]); });
        return badges;
      };
      const plain = `#${PAGE}.${NEXT}.Titre`;
      to.value = plain;
      await h.sleep(40);
      const alone = { badges: read(), stored: to.value };
      const around = `Suite : #${PAGE}.-1(Date;Cycle).Titre, merci`;
      to.value = around;
      await h.sleep(40);
      const inText = { badges: read(), stored: to.value };
      const resolved = await Variables.resolveTextVariables(alone.stored, PAGE, recordOf(2));
      to.value = '';
      await h.sleep(20);
      const pass = JSON.stringify(alone.badges) === JSON.stringify([[PAGE, `${NEXT}.Titre`, `${PAGE}.${NEXT}.Titre`]]) && alone.stored === plain
        && JSON.stringify(inText.badges) === JSON.stringify([[PAGE, '-1(Date;Cycle).Titre', `${PAGE}.-1(Date;Cycle).Titre`]]) && inText.stored === around && resolved === 'Séance 2';
      return { pass, notes: JSON.stringify({ alone, inText, resolved }) };
    },
  });

  cases.push({
    id: 'varseries_a_condition_reads_the_neighbor_row',
    description: 'Une règle de condition sur « VsInstances.+1(Date;Cycle).Titre » lit la ligne suivante : « = Séance 2 » vaut sur la ligne 2 (dont la suivante est la 4) et pas sur la 4 ; « non vide » dit qu’il y a une suivante, « vide » qu’il n’y en a pas (la ligne 1 finit sa série, la 6 est hors série) ; la règle se compose avec une règle de la ligne courante',
    run: async (h) => {
      await seed(h);
      const rule = (operator, value) => ({ column: `${PAGE}.${NEXT}.Titre`, operator, value });
      const holds = (id, r) => ConditionRules.matches(r, PAGE, recordOf(id));
      const got = {
        equal2: await holds(2, rule('=', 'Séance 2')),
        equal4: await holds(4, rule('=', 'Séance 2')),
        hasNext: [await holds(2, rule('non vide', '')), await holds(1, rule('non vide', '')), await holds(6, rule('non vide', ''))],
        noNext: [await holds(2, rule('vide', '')), await holds(1, rule('vide', '')), await holds(6, rule('vide', ''))],
        both: await ConditionRules.conditionHolds({ mode: 'all', rules: [rule('non vide', ''), { column: 'Cycle', operator: '=', value: 'A' }] }, PAGE, recordOf(2)),
        bothOther: await ConditionRules.conditionHolds({ mode: 'all', rules: [rule('non vide', ''), { column: 'Cycle', operator: '=', value: 'B' }] }, PAGE, recordOf(2)),
      };
      const type = GristAPI.getColumnType(PAGE, `${NEXT}.Date`);
      const pass = got.equal2 === true && got.equal4 === false && JSON.stringify(got.hasNext) === JSON.stringify([true, false, false]) && JSON.stringify(got.noNext) === JSON.stringify([false, true, true])
        && got.both === true && got.bothOther === false && type === 'Date';
      return { pass, notes: JSON.stringify({ got, type }) };
    },
  });

  cases.push({
    id: 'varseries_a_condition_rule_picks_a_column_of_the_neighbor_row',
    description: 'Le choix d’une colonne d’une règle de condition (bouton « Choisir dans la fenêtre des colonnes ») propose aussi le volet « Ligne suivante ou précédente » : après « Aller à cette ligne » et le choix de Titre, la règle porte « VsInstances.+1(Date;Cycle).Titre », la liste de la règle la montre comme choix, et la règle se lit sur la ligne suivante (« = Séance 2 » vaut sur la ligne 2)',
    run: async (h) => {
      await seed(h);
      const rule = { column: '', operator: '=', value: 'Séance 2' };
      const row = ConditionFields.buildRuleRow(rule, 0, {
        mode: 'all',
        options: { allTables: true, compareColumn: true, attributesWindow: true, onColumnChosen: () => true, onColumnResolved: () => {}, onValueColumnResolved: () => {} },
        onRemove: () => {},
      });
      const holder = document.createElement('div');
      holder.className = 'cd-host';
      holder.appendChild(row);
      document.body.appendChild(holder);
      const wrap = row.querySelector('.macro-rule-column-wrap');
      wrap.querySelector('.ss-trigger').click();
      await h.sleep(30);
      wrap.querySelector('.ss-browse').click();
      await h.sleep(200);
      const offered = !!modal() && !step().hidden && modal().style.display !== 'none';
      choose('order', 'Date');
      choose('group', 'Cycle');
      step('go').click();
      await h.sleep(150);
      const crumbsAfter = crumbs();
      const box = rowOf('Titre').querySelector('input');
      box.checked = true;
      box.dispatchEvent(new Event('change', { bubbles: true }));
      modal().querySelector('.var-modal-primary').click();
      await h.sleep(200);
      const column = rule.column;
      const options = Array.from(wrap.querySelector('select').options).map(o => o.value).filter(v => v.indexOf('+1(') !== -1);
      const holdsOn2 = await ConditionRules.matches(rule, PAGE, recordOf(2));
      const holdsOn4 = await ConditionRules.matches(rule, PAGE, recordOf(4));
      VariableLinkedAttrs.close({ keepFocus: true });
      holder.remove();
      const pass = offered && JSON.stringify(crumbsAfter) === JSON.stringify([PAGE, NEXT]) && column === `${PAGE}.${NEXT}.Titre` && options.length === 1 && holdsOn2 === true && holdsOn4 === false;
      return { pass, notes: JSON.stringify({ offered, crumbsAfter, column, options, holdsOn2, holdsOn4 }) };
    },
  });

  cases.push({
    id: 'varseries_the_exists_button_of_a_condition_rule_picks_the_order_column_with_not_empty',
    description: 'Dans le choix de colonne d’une règle de condition, le volet « Ligne suivante ou précédente » a un bouton « Y a-t-il une suivante ? » : grisé tant que la colonne d’ordre n’est pas choisie et pour « première » / « dernière », il devient « Y a-t-il une précédente ? » avec le sens « précédente » ; un clic choisit d’un coup la colonne d’ordre de la ligne voisine (« VsInstances.+1(Date;Cycle).Date ») ET l’opérateur « non vide » de la règle, qui vaut sur la 2 (elle a une suivante) et pas sur la 1 (dernière du cycle) ni la 6 (hors série) ; il n’est jamais proposé pour une bulle ni sans règle à régler',
    run: async (h) => {
      await seed(h);
      const rule = { column: '', operator: '=', value: 'x' };
      const row = ConditionFields.buildRuleRow(rule, 0, {
        mode: 'all',
        options: { allTables: true, compareColumn: true, attributesWindow: true, onColumnChosen: () => true, onColumnResolved: () => {}, onValueColumnResolved: () => {} },
        onRemove: () => {},
      });
      const holder = document.createElement('div');
      holder.className = 'cd-host';
      holder.appendChild(row);
      document.body.appendChild(holder);
      const wrap = row.querySelector('.macro-rule-column-wrap');
      wrap.querySelector('.ss-trigger').click();
      await h.sleep(30);
      wrap.querySelector('.ss-browse').click();
      await h.sleep(200);
      const exists = () => step('exists');
      // La colonne d'ordre réglée pour cette table par une fenêtre d'avant est reprise : on la vide pour voir le bouton grisé sans elle.
      choose('order', '');
      const before = { shown: !exists().hidden, disabled: exists().disabled, label: exists().textContent };
      choose('order', 'Date');
      choose('group', 'Cycle');
      const ready = { disabled: exists().disabled, label: exists().textContent };
      choose('direction', 'before');
      const beforeLabel = exists().textContent;
      choose('direction', 'first');
      const edgeDisabled = exists().disabled;
      choose('direction', 'after');
      exists().click();
      await h.sleep(250);
      const chosen = { column: rule.column, operator: rule.operator, closed: !modal() || modal().style.display === 'none' || modal().getClientRects().length === 0 };
      const operatorShown = row.querySelector('select:not(.macro-rule-column)') ? row.querySelector('select:not(.macro-rule-column)').value : null;
      const holds = [await ConditionRules.matches(rule, PAGE, recordOf(2)), await ConditionRules.matches(rule, PAGE, recordOf(1)), await ConditionRules.matches(rule, PAGE, recordOf(6))];
      holder.remove();
      // Sans règle à régler (aucune demande « canTest ») ou depuis une bulle, le bouton reste caché.
      const asked = VariableLinkedAttrs.pickColumn({ base: PAGE, hops: [], column: '' });
      await h.sleep(150);
      const plainPick = { hidden: exists().hidden };
      VariableLinkedAttrs.close({ keepFocus: true });
      await asked;
      Editor.setHTML(`<p>${badgeHtml(PAGE, 'Titre')}</p>`);
      await openWindow(h, PAGE, 'Titre');
      const onBubble = { hidden: exists().hidden };
      VariableLinkedAttrs.close({ keepFocus: true });
      const pass = before.shown && before.disabled === true && before.label === 'Y a-t-il une suivante ?' && ready.disabled === false && beforeLabel === 'Y a-t-il une précédente ?' && edgeDisabled === true
        && chosen.column === `${PAGE}.${NEXT}.Date` && chosen.operator === 'non vide' && chosen.closed && operatorShown === 'non vide'
        && JSON.stringify(holds) === JSON.stringify([true, false, false]) && plainPick.hidden === true && onBubble.hidden === true;
      return { pass, notes: JSON.stringify({ before, ready, beforeLabel, edgeDisabled, chosen, operatorShown, holds, plainPick, onBubble }) };
    },
  });

  cases.push({
    id: 'varseries_a_calculation_reads_the_neighbor_row',
    description: 'Un calcul peut citer la ligne voisine : {VsInstances.+1(Date;Cycle).Numero}-{VsInstances.Numero} donne 22 − 2 = 20 sur la ligne 4 ; il se relit dans la saisie (« #… ») et s’y réécrit à l’identique ; une colonne d’ordre disparue est dite par calcProblem',
    run: async (h) => {
      await seed(h);
      const stored = `{${PAGE}.${NEXT}.Numero}-{${PAGE}.Numero}`;
      const result = await Variables.resolveCalc(stored, PAGE, recordOf(4), null);
      const typed = Formula.toDisplay(stored, { trigger: Variables.triggerChar(), lang: 'fr' });
      const back = Formula.fromDisplay(typed, Variables.findTextVariables(typed), { lang: 'fr' });
      const problems = [Variables.calcProblem(stored), Variables.calcProblem(`{${PAGE}.+1(Inconnue;Cycle).Numero}`)];
      const pass = String(result).trim() === '20' && back.replace(/\s+/g, '') === stored && problems[0] === '' && problems[1] !== '';
      return { pass, notes: JSON.stringify({ result, typed, back, problems }) };
    },
  });

  cases.push({
    id: 'varseries_a_renamed_column_is_followed_in_text_fields_and_calculations',
    description: 'Les colonnes d’ordre et de groupe renommées sont réécrites dans le maillon d’une variable de champ texte (« #VsInstances.+1(Date;Cycle).Titre » devient « #VsInstances.+1(Quand;Serie).Intitule ») comme dans une formule, sans toucher au texte autour ni à un maillon déjà à jour',
    run: async (h) => {
      await seed(h);
      const m = SchemaRenames.createMapper(SCHEMA_OLD, SCHEMA_NEW, {});
      const trigger = Variables.triggerChar();
      const text = SchemaRenames.rewriteText(`Après : #${PAGE}.${NEXT}.Titre, et #${PAGE}.Titre.`, m, trigger);
      const formula = SchemaRenames.rewriteFormula(`{${PAGE}.${NEXT}.Numero}*2`, m);
      const same = SchemaRenames.createMapper(SCHEMA_OLD, SCHEMA_OLD, {});
      const untouched = SchemaRenames.rewriteText(`Après : #${PAGE}.${NEXT}.Titre`, same, trigger);
      const pass = text.text === `Après : #${PAGE}.+1(Quand;Serie).Intitule, et #${PAGE}.Intitule.` && formula.text === `{${PAGE}.+1(Quand;Serie).Numero}*2` && untouched.count === 0;
      return { pass, notes: JSON.stringify({ text, formula, untouched }) };
    },
  });

  cases.push({
    id: 'varseries_every_export_writes_the_neighbor_row',
    description: 'Le Word, l’OpenDocument, le Markdown et le HTML d’une ligne écrivent la ligne suivante de la série pour « +1(Date;Cycle).Titre » (« Séance 2 » pour la ligne 2), et rien de plus au bout de la série (la variable est vide, la phrase finit sur « Prochaine :. »)',
    run: async (h) => {
      await seed(h);
      await ExportCommon.ensureJsZipLoaded();
      await DocxExport.ensureDocxLibLoaded();
      const html = `<p>Prochaine : ${badgeHtml(PAGE, `${NEXT}.Titre`)}.</p>`;
      const noHeaderFooter = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
      const docxText = async id => {
        const { blob } = await DocxExport.getDocxBlobForRecord(html, PAGE, recordOf(id), '', noHeaderFooter, null);
        const zip = await JSZip.loadAsync(await blob.arrayBuffer());
        return new DOMParser().parseFromString(await zip.file('word/document.xml').async('string'), 'application/xml').documentElement.textContent;
      };
      const odtText = async id => {
        const made = await OdtExport.getOdtBlobForRecord(html, PAGE, recordOf(id), '', noHeaderFooter, null);
        const zip = await JSZip.loadAsync(await (made.blob || made).arrayBuffer());
        return new DOMParser().parseFromString(await zip.file('content.xml').async('string'), 'application/xml').documentElement.textContent;
      };
      const markdownText = async id => (await MarkdownExport.getMarkdownBlobForRecord(html, PAGE, recordOf(id), '', noHeaderFooter)).blob.text();
      const htmlText = async id => (await HtmlExport.getHtmlBlobForRecord(html, PAGE, recordOf(id), '', noHeaderFooter, {})).blob.text();
      const got = {
        docx: [await docxText(2), await docxText(1)],
        odt: [await odtText(2), await odtText(1)],
        markdown: [await markdownText(2), await markdownText(1)],
        html: [await htmlText(2), await htmlText(1)],
      };
      const has = (text, expected) => text.indexOf(expected) !== -1;
      // Au bout de la série la variable est vide : l'espace qui la précédait tombe comme pour toute variable vide, la phrase finit sur « Prochaine :. ».
      const empty = text => /Prochaine :\s?\./.test(text) && !/Séance/.test(text);
      const pass = has(got.docx[0], 'Prochaine : Séance 2.') && empty(got.docx[1]) && has(got.odt[0], 'Prochaine : Séance 2.') && empty(got.odt[1])
        && has(got.markdown[0], 'Prochaine : Séance 2.') && empty(got.markdown[1]) && has(got.html[0], 'Prochaine : Séance 2.') && empty(got.html[1].replace(/[\s\S]*<body>/, ''));
      return { pass, notes: JSON.stringify({ docx: got.docx.map(t => t.slice(0, 80)), odt: got.odt.map(t => t.slice(0, 80)), markdown: got.markdown, html: got.html.map(t => t.slice(-120)) }) };
    },
  });

  // --- Lot 2b : la pastille « @ » qui cite la fiche voisine ---
  const chipHtml = (row, step, column, label) => `<span class="mention-chip" contenteditable="false" data-mention-table="${PAGE}" data-mention-row="${row}" data-mention-column="${column || 'Titre'}"`
    + `${step ? ` data-mention-step="${step}"` : ''}>${label || 'x'}</span>`;
  const mentionNodes = ed => {
    const out = [];
    ed.state.doc.descendants((node, pos) => { if (node.type.name === 'mention') out.push({ node, pos }); });
    return out;
  };
  const attrsOfChip = node => ({ row: node.attrs.row, step: node.attrs.step, column: node.attrs.column, label: node.attrs.label });
  async function openChipWindow(h, index) {
    const ed = EditorCore.getEditor();
    document.querySelector('.tiptap').focus();
    const found = mentionNodes(ed)[index || 0];
    ed.commands.setNodeSelection(found.pos);
    await h.sleep(150);
    document.querySelector('.v2-mention-toolbar button[data-action="mention-linked"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await h.sleep(350);
    return ed;
  }
  const tickColumn = col => {
    const input = rowOf(col).querySelector('input');
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };

  cases.push({
    id: 'varseries_a_chip_cites_the_neighbor_fiche_and_writes_nothing_at_the_end',
    description: 'Une pastille « @ » de la ligne 2 avec le maillon « +1(Date;Cycle) » écrit le titre de la fiche d’après (« Séance 2 ») au lieu du sien (« Séance 1 »), « -1 » celle d’avant ; au bout de la série ou pour une fiche hors série elle n’écrit rien, sans erreur ; sa fiche disparue ou sa colonne d’ordre disparue : « [Fiche introuvable] » ; son HTML garde le maillon et écrit le signe « +1 », une pastille ordinaire garde le HTML d’avant',
    run: async (h) => {
      await seed(h);
      Mention.reset();
      const text = async (row, step) => Mention.resolve({ table: PAGE, row, column: 'Titre', step, label: 'x' });
      const got = {
        own: (await text(2, null)).text,
        next: (await text(2, NEXT)).text,
        nextOfNext: (await text(2, '+2(Date;Cycle)')).text,
        before: (await text(4, '-1(Date;Cycle)')).text,
        end: await text(1, NEXT),
        outOfSeries: await text(6, NEXT),
        goneRow: await text(99, NEXT),
        brokenOrder: await text(2, '+1(Inconnue;Cycle)'),
      };
      const withStep = Mention.html({ table: PAGE, row: 2, column: 'Titre', step: NEXT, label: 'Séance 2' });
      const plain = Mention.html({ table: PAGE, row: 2, column: 'Titre', label: 'Séance 1' });
      const parsed = Mention.fieldAttrsOf(dom(withStep));
      const parsedPlain = Mention.fieldAttrsOf(dom(plain));
      const pass = got.own === 'Séance 1' && got.next === 'Séance 2' && got.nextOfNext === 'Séance 2 bis' && got.before === 'Séance 1'
        && got.end.text === '' && got.end.isError === false && got.outOfSeries.text === '' && got.outOfSeries.isError === false && got.goneRow.isError === true && got.brokenOrder.isError === true
        && withStep.indexOf('data-mention-step="+1(Date;Cycle)"') !== -1 && withStep.indexOf('data-mention-sign="+1"') !== -1
        && plain.indexOf('data-mention-step') === -1 && plain.indexOf('data-mention-sign') === -1
        && parsed.step === NEXT && parsed.row === 2 && parsed.column === 'Titre' && !('step' in parsedPlain);
      return { pass, notes: JSON.stringify({ got, withStep, plain, parsed, parsedPlain }) };
    },
  });
  function dom(html) { const t = document.createElement('template'); t.innerHTML = html; return t.content.firstElementChild; }

  cases.push({
    id: 'varseries_a_chip_shows_the_sign_and_the_neighbor_name_in_the_editor',
    description: 'Dans l’éditeur, la pastille de la fiche voisine montre le nom de la voisine d’aujourd’hui (« Séance 2 », pas « x ») avec son signe « +1 » (attribut data-mention-sign, dessiné par le CSS), une info-bulle qui dit le sens, le rang et la colonne d’ordre ; au bout de la série elle est « seule » (liseré en tirets, info-bulle « n’écrit rien ») sans être rouge ; une colonne d’ordre disparue la rend rouge avec le nom de cette colonne',
    run: async (h) => {
      await seed(h);
      Mention.reset();
      await h.resetEditor();
      Editor.setHTML('<p>' + [chipHtml(2, NEXT), chipHtml(1, NEXT), chipHtml(7, '-2(Date;Cycle)'), chipHtml(2, '+1(Inconnue;Cycle)'), chipHtml(2, null, 'Titre', 'Séance 1')].join(' ') + '</p>');
      await h.sleep(700);
      const chips = Array.from(document.querySelectorAll('.tiptap span.mention-chip'));
      const info = chips.map(c => ({
        text: c.textContent, sign: c.getAttribute('data-mention-sign'), broken: c.classList.contains('mention-chip-broken'), alone: c.classList.contains('mention-chip-alone'), title: c.title,
      }));
      const signDrawn = chips[0] ? getComputedStyle(chips[0], '::after').content : '';
      const pass = info.length === 5 && info[0].text === 'Séance 2' && info[0].sign === '+1' && !info[0].broken && !info[0].alone && /suivante/.test(info[0].title) && /Date/.test(info[0].title)
        && info[1].alone === true && !info[1].broken && /n’écrit rien/.test(info[1].title)
        && info[2].sign === '−2' && !info[2].alone && info[2].text === 'Séance 1';
      const rest = info[3] && info[3].broken === true && /Inconnue/.test(info[3].title) && info[4] && info[4].sign === null && !info[4].alone && !info[4].broken;
      return { pass: pass && !!rest && /\+1/.test(signDrawn), notes: JSON.stringify({ info, signDrawn }) };
    },
  });

  cases.push({
    id: 'varseries_the_window_of_a_chip_goes_to_the_neighbor_fiche_and_replaces_one_chip',
    description: 'La fenêtre d’une pastille a aussi le volet « Ligne suivante ou précédente » : « Aller à cette ligne » montre les valeurs de la fiche voisine (le fil d’Ariane dit le maillon, la liste montre « Séance 2 »), cocher Titre puis « Remplacer » met le maillon dans la même pastille (une seule, avec le nom de la voisine) et un seul Annuler rend l’ancienne ; « Insérer » cite la voisine à la suite avec une espace',
    run: async (h) => {
      await seed(h);
      Mention.reset();
      await h.resetEditor();
      Editor.setHTML('<p>' + chipHtml(2, null, 'Titre', 'Séance 1') + '</p>');
      await h.sleep(500);
      const ed = await openChipWindow(h, 0);
      const offered = !!modal() && !step().hidden && !step().open;
      choose('order', 'Date');
      choose('group', 'Cycle');
      step('go').click();
      await h.sleep(300);
      const level = { crumbs: crumbs(), titre: valueOf('Titre'), numero: valueOf('Numero'), subtitle: modal().querySelector('.var-linked-subtitle, .var-modal-intro') ? modal().querySelector('.var-linked-subtitle, .var-modal-intro').textContent : '' };
      tickColumn('Titre');
      modal().querySelector('button.var-linked-replace').click();
      await h.sleep(250);
      const replaced = mentionNodes(ed).map(n => attrsOfChip(n.node));
      ed.commands.undo();
      await h.sleep(200);
      const undone = mentionNodes(ed).map(n => attrsOfChip(n.node));
      // Insérer : la voisine à la suite, la pastille d'origine intacte.
      const again = await openChipWindow(h, 0);
      choose('order', 'Date');
      choose('group', 'Cycle');
      step('go').click();
      await h.sleep(300);
      tickColumn('Titre');
      modal().querySelector('.var-modal-primary').click();
      await h.sleep(250);
      const inserted = mentionNodes(again).map(n => attrsOfChip(n.node));
      const spaced = again.state.doc.textBetween(0, again.state.doc.content.size, '|', '|');
      const pass = offered && JSON.stringify(level.crumbs) === JSON.stringify([PAGE, NEXT]) && level.titre === 'Séance 2' && level.numero === '2'
        && replaced.length === 1 && replaced[0].step === NEXT && replaced[0].column === 'Titre' && replaced[0].label === 'Séance 2' && replaced[0].row === 2
        && undone.length === 1 && !undone[0].step && undone[0].label === 'Séance 1'
        && inserted.length === 2 && !inserted[0].step && inserted[1].step === NEXT && inserted[1].label === 'Séance 2' && inserted[1].row === 2 && /\s/.test(spaced.replace(/\|/g, ' '));
      return { pass, notes: JSON.stringify({ offered, level, replaced, undone, inserted, spaced }) };
    },
  });

  cases.push({
    id: 'varseries_the_window_of_a_chip_with_a_step_opens_on_its_level_and_says_when_there_is_no_neighbor',
    description: 'Une pastille qui cite déjà la fiche voisine rouvre la fenêtre sur ce niveau (fil d’Ariane « VsInstances › +1(Date;Cycle) », sens, rang et colonnes du volet repris, sa colonne marquée « cette pastille ») ; revenir au niveau de la table puis cocher une colonne ôte le maillon ; au bout de la série la fenêtre dit qu’aucune fiche ne répond et grise toutes les cases',
    run: async (h) => {
      await seed(h);
      Mention.reset();
      await h.resetEditor();
      Editor.setHTML('<p>' + chipHtml(4, '-1(Date;Cycle)', 'Titre', 'Séance 1') + '</p>');
      await h.sleep(500);
      const ed = await openChipWindow(h, 0);
      const opened = { crumbs: crumbs(), direction: step('direction').value, rank: step('rank').value, order: step('order').value, group: step('group').value, current: rowOf('Titre').classList.contains('is-current'), titre: valueOf('Titre') };
      // Remonter au niveau de la table : plus de maillon dans la pastille remplacée.
      modal().querySelector('.var-linked-path button.var-linked-crumb').click();
      await h.sleep(250);
      tickColumn('Titre');
      modal().querySelector('button.var-linked-replace').click();
      await h.sleep(250);
      const cleared = mentionNodes(ed).map(n => attrsOfChip(n.node));
      Editor.setHTML('<p>' + chipHtml(1, null, 'Titre', 'Séance 3') + '</p>');
      await h.sleep(500);
      await openChipWindow(h, 0);
      choose('order', 'Date');
      choose('group', 'Cycle');
      step('go').click();
      await h.sleep(300);
      const end = { note: modal().querySelector('.var-linked-note').textContent, enabled: Array.from(modal().querySelectorAll('.var-linked-row input')).filter(i => !i.disabled).length };
      VariableLinkedAttrs.close({ keepFocus: true });
      const pass = JSON.stringify(opened.crumbs) === JSON.stringify([PAGE, '-1(Date;Cycle)']) && opened.direction === 'before' && opened.rank === '1' && opened.order === 'Date' && opened.group === 'Cycle'
        && opened.current === true && opened.titre === 'Séance 1'
        && cleared.length === 1 && !cleared[0].step && cleared[0].label === 'Séance 2'
        && /Aucune fiche à ce rang/.test(end.note) && end.enabled === 0;
      return { pass, notes: JSON.stringify({ opened, cleared, end }) };
    },
  });

  cases.push({
    id: 'varseries_a_renamed_order_column_is_followed_in_a_chip_and_every_export_writes_its_neighbor',
    description: 'Les colonnes d’ordre et de groupe renommées sont réécrites dans le maillon d’une pastille (data-mention-step « +1(Date;Cycle) » devient « +1(Quand;Serie) »), la colonne lue aussi ; la Lecture et le Word écrivent le nom de la fiche voisine, quelle que soit la ligne affichée',
    run: async (h) => {
      await seed(h);
      Mention.reset();
      const m = SchemaRenames.createMapper(SCHEMA_OLD, SCHEMA_NEW, {});
      const out = SchemaRenames.rewriteHtml(`<p>${chipHtml(2, NEXT, 'Titre', 'Séance 2')}</p>`, m, { page: m.tableContext(PAGE), trigger: Variables.triggerChar() });
      const renamed = dom(out.html.indexOf('<p>') === 0 ? out.html.replace(/^<p>|<\/p>$/g, '') : out.html);
      const found = { step: renamed.getAttribute('data-mention-step'), column: renamed.getAttribute('data-mention-column'), count: out.count };
      const same = SchemaRenames.createMapper(SCHEMA_OLD, SCHEMA_OLD, {});
      const untouched = SchemaRenames.rewriteHtml(`<p>${chipHtml(2, NEXT, 'Titre', 'Séance 2')}</p>`, same, { page: same.tableContext(PAGE), trigger: Variables.triggerChar() });
      await at(h, 5);
      const body = `<p>Prochaine : ${chipHtml(2, NEXT)}, fin : ${chipHtml(1, NEXT)}.</p>`;
      const readerOut = await readerText(body);
      await ExportCommon.ensureJsZipLoaded();
      await DocxExport.ensureDocxLibLoaded();
      const noHeaderFooter = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
      const { blob } = await DocxExport.getDocxBlobForRecord(body, PAGE, recordOf(5), '', noHeaderFooter, null);
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const docx = new DOMParser().parseFromString(await zip.file('word/document.xml').async('string'), 'application/xml').documentElement.textContent;
      const pass = found.step === '+1(Quand;Serie)' && found.column === 'Intitule' && found.count === 1 && untouched.count === 0
        && /Prochaine : Séance 2, fin : \.?/.test(readerOut) && !/introuvable|Fiche/i.test(readerOut) && docx.indexOf('Prochaine : Séance 2, fin :') !== -1 && !/introuvable/i.test(docx);
      return { pass, notes: JSON.stringify({ found, untouched: untouched.count, readerOut, docx: docx.slice(0, 120) }) };
    },
  });

  // --- La première et la dernière de la série (lot 3) : « first(Date;Cycle) » et « last(Date;Cycle) » ---
  const FIRST = 'first(Date;Cycle)';
  const LAST = 'last(Date;Cycle)';

  cases.push({
    id: 'varseries_first_and_last_of_the_series_are_read_like_a_neighbor',
    description: 'Le maillon « first(Date;Cycle) » est la première ligne de la série (rangée selon Date, dans le même Cycle), « last(Date;Cycle) » la dernière ; la ligne qui est elle-même la première (ou la dernière) se cite elle-même ; une ligne sans date est hors série (rien) ; sans groupe, la série est toute la table ; on peut descendre ensuite de référence en référence ; stepOf / stepToken / stepAt les lisent et les écrivent, et refusent ce qui n’en est pas un',
    run: async (h) => {
      await seed(h);
      const parsed = [GristAPI.stepOf(FIRST), GristAPI.stepOf('last(Date)'), GristAPI.stepOf('first()'), GristAPI.stepOf('First(Date)'), GristAPI.stepOf('firstly(Date)'), GristAPI.stepOf('first(A.B)'), GristAPI.stepOf('+1(Date)')];
      const tokens = [GristAPI.stepToken(5, 'Date', 'Cycle', 'first'), GristAPI.stepToken(-2, 'Date', '', 'last'), GristAPI.stepToken(-2, 'Date', 'Cycle', '')];
      const inText = [GristAPI.stepAt(`x.${LAST}.Titre`, 2), GristAPI.stepAt('x.first(Date).Titre', 2), GristAPI.stepAt('x.firstly(Date).Titre', 2)];
      const got = {
        row2: [await read(h, 2, `${FIRST}.Titre`), await read(h, 2, `${LAST}.Titre`)],
        row4: [await read(h, 4, `${FIRST}.Titre`), await read(h, 4, `${LAST}.Titre`)],
        row1: [await read(h, 1, `${FIRST}.Titre`), await read(h, 1, `${LAST}.Titre`)],
        b: [await read(h, 3, `${FIRST}.Titre`), await read(h, 3, `${LAST}.Titre`), await read(h, 5, `${FIRST}.Titre`)],
        outOfSeries: [await read(h, 6, `${FIRST}.Titre`), await read(h, 6, `${LAST}.Titre`)],
        wholeTable: [await read(h, 3, 'first(Date).Titre'), await read(h, 3, 'last(Date).Titre')],
        viaReference: [await read(h, 4, `${FIRST}.Responsable.Email`), await read(h, 4, `${LAST}.Responsable.Email`)],
        date: await read(h, 4, `${FIRST}.Date`),
        own: await read(h, 4, 'Date'),
      };
      const types = [GristAPI.getColumnType(PAGE, `${FIRST}.Date`), GristAPI.getColumnType(PAGE, `${LAST}.Titre`)];
      const problems = [Variables.badgeProblem(PAGE, `${FIRST}.Titre`), Variables.badgeProblem(PAGE, 'last(Disparue;Cycle).Titre'), Variables.badgeProblem(PAGE, 'first(Date;Disparue).Titre')];
      const pass = JSON.stringify(parsed) === JSON.stringify([{ offset: 0, edge: 'first', order: 'Date', group: 'Cycle' }, { offset: 0, edge: 'last', order: 'Date', group: '' }, null, null, null, null, { offset: 1, order: 'Date', group: '' }])
        && JSON.stringify(tokens) === JSON.stringify([FIRST, 'last(Date)', '-2(Date;Cycle)']) && JSON.stringify(inText) === JSON.stringify([LAST, 'first(Date)', null])
        && JSON.stringify(got.row2) === JSON.stringify(['Séance 1', 'Séance 3']) && JSON.stringify(got.row4) === JSON.stringify(['Séance 1', 'Séance 3']) && JSON.stringify(got.row1) === JSON.stringify(['Séance 1', 'Séance 3'])
        && JSON.stringify(got.b) === JSON.stringify(['Séance B1', 'Séance B2', 'Séance B1']) && JSON.stringify(got.outOfSeries) === JSON.stringify(['', ''])
        && JSON.stringify(got.wholeTable) === JSON.stringify(['Séance 1', 'Séance 3']) && JSON.stringify(got.viaReference) === JSON.stringify(['anne@ex.fr', 'jean@ex.fr'])
        && got.date !== '' && got.date === await read(h, 2, 'Date') && got.own !== got.date
        && JSON.stringify(types) === JSON.stringify(['Date', 'Text']) && JSON.stringify(problems) === JSON.stringify([null, 'path', 'path']);
      return { pass, notes: JSON.stringify({ parsed, tokens, inText, got, types, problems }) };
    },
  });

  cases.push({
    id: 'varseries_first_and_last_work_in_text_fields_calculations_conditions_and_renames',
    description: 'La première et la dernière de la série se lisent dans un champ texte (« #VsInstances.first(Date;Cycle).Titre », le point de fin de phrase reste du texte), un calcul, une règle de condition (« last(Date;Cycle).Numero = 3 » ; « première » = elle-même vrai seulement sur la première) et suivent le renommage des colonnes d’ordre et de groupe ; un export en lot lit la même ligne',
    run: async (h) => {
      await seed(h);
      const sentence = `Début : #${PAGE}.${FIRST}.Titre, fin : #${PAGE}.${LAST}.Titre.`;
      const found = Variables.findTextVariables(sentence).map(v => [v.column, sentence.slice(v.start, v.end)]);
      const resolved = await Variables.resolveTextVariables(sentence, PAGE, recordOf(4));
      const stored = `{${PAGE}.${LAST}.Numero}-{${PAGE}.Numero}`;
      const calc = await Variables.resolveCalc(stored, PAGE, recordOf(4), null);
      const lastIs3 = { column: `${PAGE}.${LAST}.Numero`, operator: '=', value: '3' };
      const holds = (id, rule) => ConditionRules.matches(rule, PAGE, recordOf(id));
      const lastOk = [await holds(2, lastIs3), await holds(4, lastIs3), await holds(3, lastIs3), await holds(6, lastIs3)];
      const m = SchemaRenames.createMapper(SCHEMA_OLD, SCHEMA_NEW, {});
      const text = SchemaRenames.rewriteText(`#${PAGE}.${FIRST}.Titre et #${PAGE}.${LAST}.Titre`, m, Variables.triggerChar());
      const formula = SchemaRenames.rewriteFormula(`{${PAGE}.${LAST}.Numero}*2`, m);
      const html = `<p>${badgeHtml(PAGE, `${FIRST}.Titre`)}|${badgeHtml(PAGE, `${LAST}.Titre`)}</p>`;
      const rows = await GristAPI.fetchTableRows(PAGE);
      const batch = {};
      for (const row of rows) batch[row.id] = await previewText(html, row);
      const pass = JSON.stringify(found) === JSON.stringify([[`${FIRST}.Titre`, `#${PAGE}.${FIRST}.Titre`], [`${LAST}.Titre`, `#${PAGE}.${LAST}.Titre`]])
        && resolved === 'Début : Séance 1, fin : Séance 3.' && String(calc).trim() === '1' && Variables.calcProblem(stored) === ''
        && JSON.stringify(lastOk) === JSON.stringify([true, true, false, false])
        && text.text === `#${PAGE}.first(Quand;Serie).Intitule et #${PAGE}.last(Quand;Serie).Intitule` && formula.text === `{${PAGE}.last(Quand;Serie).Numero}*2`
        && batch[4] === 'Séance 1|Séance 3' && batch[3] === 'Séance B1|Séance B2' && batch[6] === '|';
      return { pass, notes: JSON.stringify({ found, resolved, calc, lastOk, text, formula, batch }) };
    },
  });

  cases.push({
    id: 'varseries_the_window_offers_first_and_last_and_a_chip_shows_them',
    description: 'Dans le volet « Ligne suivante ou précédente » le sens a quatre choix (suivante, précédente, première et dernière de la série) ; « première » ou « dernière » grise le rang ; « Aller à cette ligne » donne un fil d’Ariane « VsInstances › last(Date;Cycle) » et les valeurs de la dernière ligne du cycle ; « Remplacer » met le maillon dans une pastille « @ », qui montre son signe (« début », « fin »), une info-bulle qui le dit, la fiche citée, et rouvre la fenêtre sur « dernière » avec le rang grisé',
    run: async (h) => {
      await seed(h);
      Mention.reset();
      await h.resetEditor();
      Editor.setHTML('<p>' + chipHtml(2, null, 'Titre', 'Séance 1') + '</p>');
      await h.sleep(500);
      let ed = await openChipWindow(h, 0);
      const offered = Array.from(step('direction').options).map(o => o.value);
      choose('direction', 'last');
      const rankOff = step('rank').disabled;
      choose('order', 'Date');
      choose('group', 'Cycle');
      step('go').click();
      await h.sleep(300);
      const level = { crumbs: crumbs(), titre: valueOf('Titre'), numero: valueOf('Numero'), subtitle: modal().querySelector('.var-linked-subtitle, .var-modal-intro') ? modal().querySelector('.var-linked-subtitle, .var-modal-intro').textContent : '' };
      tickColumn('Titre');
      modal().querySelector('button.var-linked-replace').click();
      await h.sleep(300);
      const replaced = mentionNodes(ed).map(n => attrsOfChip(n.node));
      await h.sleep(500);
      const chip = document.querySelector('.tiptap span.mention-chip');
      const shown = chip ? { text: chip.textContent, sign: chip.getAttribute('data-mention-sign'), title: chip.title, alone: chip.classList.contains('mention-chip-alone'), broken: chip.classList.contains('mention-chip-broken'), drawn: getComputedStyle(chip, '::after').content } : null;
      ed = await openChipWindow(h, 0);
      const reopened = { crumbs: crumbs(), direction: step('direction').value, rankOff: step('rank').disabled, order: step('order').value, group: step('group').value };
      choose('direction', 'first');
      step('go').click();
      await h.sleep(300);
      tickColumn('Titre');
      modal().querySelector('button.var-linked-replace').click();
      await h.sleep(300);
      await h.sleep(500);
      const first = mentionNodes(ed).map(n => attrsOfChip(n.node));
      const firstSign = (document.querySelector('.tiptap span.mention-chip') || {}).getAttribute ? document.querySelector('.tiptap span.mention-chip').getAttribute('data-mention-sign') : null;
      const withEdge = [Mention.html({ table: PAGE, row: 2, column: 'Titre', step: FIRST, label: 'Séance 1' }), Mention.html({ table: PAGE, row: 2, column: 'Titre', step: LAST, label: 'Séance 3' })];
      const pass = JSON.stringify(offered) === JSON.stringify(['after', 'before', 'first', 'last']) && rankOff === true
        && JSON.stringify(level.crumbs) === JSON.stringify([PAGE, LAST]) && level.titre === 'Séance 3' && level.numero === '3' && /dernière fiche/.test(level.subtitle)
        && replaced.length === 1 && replaced[0].step === LAST && replaced[0].column === 'Titre' && replaced[0].label === 'Séance 3' && replaced[0].row === 2
        && !!shown && shown.text === 'Séance 3' && shown.sign === 'fin' && /dernière fiche/.test(shown.title) && /Date/.test(shown.title) && !shown.alone && !shown.broken && /fin/.test(shown.drawn)
        && JSON.stringify(reopened.crumbs) === JSON.stringify([PAGE, LAST]) && reopened.direction === 'last' && reopened.rankOff === true && reopened.order === 'Date' && reopened.group === 'Cycle'
        && first.length === 1 && first[0].step === FIRST && first[0].label === 'Séance 1' && firstSign === 'début'
        && withEdge[0].indexOf(`data-mention-step="${FIRST}"`) !== -1 && withEdge[0].indexOf('data-mention-sign="début"') !== -1 && withEdge[1].indexOf('data-mention-sign="fin"') !== -1;
      return { pass, notes: JSON.stringify({ offered, rankOff, level, replaced, shown, reopened, first, firstSign, withEdge }) };
    },
  });

  cases.push({
    id: 'varseries_a_chip_with_first_or_last_follows_the_data_and_the_renames_and_every_export_writes_it',
    description: 'Une pastille « première » ou « dernière » relit la table à l’affichage (la dernière change quand une date plus tardive arrive), « seule » pour une fiche hors série, rouge si la colonne d’ordre disparaît, suit le renommage des colonnes d’ordre et de groupe, et la Lecture, le Word et le HTML écrivent la même fiche',
    run: async (h) => {
      await seed(h);
      Mention.reset();
      const text = async (row, stepToken) => (await Mention.resolve({ table: PAGE, row, column: 'Titre', step: stepToken, label: 'x' })).text;
      const got = { first: await text(4, FIRST), last: await text(4, LAST), outOfSeries: await text(6, LAST), brokenOrder: await Mention.resolve({ table: PAGE, row: 2, column: 'Titre', step: 'last(Inconnue;Cycle)', label: 'x' }) };
      const m = SchemaRenames.createMapper(SCHEMA_OLD, SCHEMA_NEW, {});
      const out = SchemaRenames.rewriteHtml(`<p>${chipHtml(2, LAST, 'Titre', 'Séance 3')}</p>`, m, { page: m.tableContext(PAGE), trigger: Variables.triggerChar() });
      const renamed = dom(out.html.indexOf('<p>') === 0 ? out.html.replace(/^<p>|<\/p>$/g, '') : out.html);
      await at(h, 5);
      const body = `<p>Début : ${chipHtml(4, FIRST)}, fin : ${chipHtml(4, LAST)}.</p>`;
      const readerOut = await readerText(body);
      await ExportCommon.ensureJsZipLoaded();
      await DocxExport.ensureDocxLibLoaded();
      const noHeaderFooter = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
      const { blob } = await DocxExport.getDocxBlobForRecord(body, PAGE, recordOf(5), '', noHeaderFooter, null);
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const docx = new DOMParser().parseFromString(await zip.file('word/document.xml').async('string'), 'application/xml').documentElement.textContent;
      const pass = got.first === 'Séance 1' && got.last === 'Séance 3' && got.outOfSeries === '' && got.brokenOrder.isError === true
        && !!renamed && renamed.getAttribute('data-mention-step') === 'last(Quand;Serie)' && renamed.getAttribute('data-mention-column') === 'Intitule' && out.count === 1
        && /Début : Séance 1, fin : Séance 3\./.test(readerOut) && docx.indexOf('Début : Séance 1, fin : Séance 3') !== -1;
      return { pass, notes: JSON.stringify({ got: { first: got.first, last: got.last, outOfSeries: got.outOfSeries, broken: got.brokenOrder.isError }, renamed: renamed && renamed.outerHTML, readerOut, docx: docx.slice(0, 100) }) };
    },
  });

  cases.push({
    id: 'varseries_a_big_table_is_ordered_once_and_neighbors_are_read_fast',
    description: 'Sur une table de 30 000 lignes (50 cycles, dates mêlées), la série est rangée UNE fois (le premier appel, tri compris, tient dans quelques secondes), puis chaque ligne voisine se lit sans retrier (5 000 lectures de suivante, précédente, première et dernière en moins d’une demi-seconde) ; les voisines sont les bonnes, et une variable lue par la Lecture sur cette table reste vite',
    run: async (h) => {
      await seed(h);
      const stub = window.__gristStub;
      const N = 30000;
      const big = [];
      for (let i = 1; i <= N; i++) big.push({ id: i, Titre: 'L' + i, Cycle: 'C' + (i % 50), Date: DAY((i * 7919) % 3650), Numero: i, Responsable: 0, gristHelper_Display: '' });
      stub.setRows(PAGE, big);
      const rows = await GristAPI.fetchTableRows(PAGE);
      const jump = GristAPI.stepOf('+1(Date;Cycle)');
      const t0 = performance.now();
      const first = Variables.stepNeighbor(PAGE, rows, 50, jump);
      const sortMs = performance.now() - t0;
      const t1 = performance.now();
      let found = 0;
      const jumps = ['+1(Date;Cycle)', '-1(Date;Cycle)', 'first(Date;Cycle)', 'last(Date;Cycle)'].map(GristAPI.stepOf);
      for (let i = 0; i < 5000; i++) if (Variables.stepNeighbor(PAGE, rows, 1 + ((i * 37) % N), jumps[i % 4])) found++;
      const readMs = performance.now() - t1;
      // La bonne voisine : la suivante de la ligne 50 est, dans son cycle, la ligne de la date juste après (ou, à égalité, de rang d'après).
      const sameCycle = big.filter(r => r.Cycle === big[49].Cycle && r.Date !== null).sort((a, b) => (a.Date - b.Date) || (a.id - b.id));
      const at = sameCycle.findIndex(r => r.id === 50);
      const expected = sameCycle[at + 1] ? sameCycle[at + 1].id : null;
      const t2 = performance.now();
      stub.fireRecord({ id: 50, Titre: 'L50', Cycle: big[49].Cycle, Date: big[49].Date, Numero: 50, Responsable: '' }, PAGE);
      await h.sleep(50);
      const reading = await readerText(`<p>${badgeHtml(PAGE, '+1(Date;Cycle).Titre')}</p>`);
      const readerMs = performance.now() - t2;
      stub.setRows(PAGE, ROWS.map(r => Object.assign({}, r)));
      await GristAPI.refreshSchema();
      const pass = !!first && first.id === expected && found > 4000 && sortMs < 5000 && readMs < 500 && reading === 'L' + expected;
      return { pass, notes: JSON.stringify({ sortMs: Math.round(sortMs), readMs: Math.round(readMs), readerMs: Math.round(readerMs), found, firstId: first && first.id, expected, reading }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.varSeries = cases;
})();
