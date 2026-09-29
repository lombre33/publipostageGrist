// Suite "varPath" - descente de référence en référence (retour d'Antoine du 2026-09-29 : le widget est sur Notifications, dont chaque ligne pointe un projet ;
// il faut l'email de l'accompagnateur du projet - une Référence vers l'annuaire, où l'email est un champ texte - et celui du porteur, autre Référence vers
// le même annuaire, sans règle de liaison générale entre l'annuaire et Notifications). La colonne d'une bulle est alors un chemin « Accompagnateur.Email »
// (GristAPI.resolveColumnPath) résolu par Variables.resolveRows, et la fenêtre « Autres attributs » (js/variable-linked-attrs.js) descend d'un niveau à
// l'autre. Ligne courante livrée comme par le vrai grist.onRecord : une colonne Référence y arrive avec la valeur AFFICHÉE, jamais l'id.
(function () {
  const cases = [];

  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const RECORD_1 = { id: 1, Titre: 'Notif 1', Projet: 'Projet Alpha' };

  function badgeHtml(table, column) {
    return `<span class="var-badge" data-table="${table}" data-column="${column}" data-key="${table}.${column}"></span>`;
  }

  // La page est sur VpNotifications, dont Projet est une Référence vers VpProjet (liée par sa règle, seule règle du document). VpProjet a DEUX Références vers
  // le même annuaire (Accompagnateur, Porteur) et une liste de références (Membres) ; VpAnnuaire a elle-même une Référence (Service). VpLignes : plusieurs
  // lignes par notification, avec une Référence vers l'annuaire. Aucune règle pour VpAnnuaire, VpServices ni VpLignes (sauf demande : `withLignes`).
  async function seed(h, opts) {
    // Une fenêtre restée ouverte par un scénario précédent empêcherait la suivante de s'ouvrir.
    VariableLinkedAttrs.close({ keepFocus: true });
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables('VpServices', { Nom: 'Text' });
    stub.setRows('VpServices', [{ id: 3, Nom: 'Juridique' }, { id: 4, Nom: 'Fiscal' }]);
    stub.setVariables('VpAnnuaire', { NomPrenom: 'Text', Email: 'Text', Naissance: 'Date', Service: 'Ref:VpServices', gristHelper_Display: 'Text' },
      null, { Service: 'gristHelper_Display' });
    stub.setRows('VpAnnuaire', [
      { id: 7, NomPrenom: 'Dupont Jean', Email: 'jean.dupont@ex.fr', Naissance: 631152000, Service: 3, gristHelper_Display: 'Juridique' },
      { id: 8, NomPrenom: 'Martin Anne', Email: 'anne.martin@ex.fr', Naissance: 662688000, Service: 0, gristHelper_Display: '' },
      { id: 9, NomPrenom: 'Durand Paul', Email: 'paul.durand@ex.fr', Naissance: 694224000, Service: 4, gristHelper_Display: 'Fiscal' },
    ]);
    stub.setVariables('VpProjet', {
      Nom: 'Text', Statut: 'Text', Accompagnateur: 'Ref:VpAnnuaire', Porteur: 'Ref:VpAnnuaire', Membres: 'RefList:VpAnnuaire',
      gristHelper_Display: 'Text', gristHelper_Display2: 'Text', gristHelper_Display3: 'Any',
    }, null, { Accompagnateur: 'gristHelper_Display', Porteur: 'gristHelper_Display2', Membres: 'gristHelper_Display3' });
    stub.setRows('VpProjet', [
      { id: 1, Nom: 'Projet Alpha', Statut: 'En cours', Accompagnateur: 7, Porteur: 8, Membres: ['L', 7, 8],
        gristHelper_Display: 'Dupont Jean', gristHelper_Display2: 'Martin Anne', gristHelper_Display3: ['L', 'Dupont Jean', 'Martin Anne'] },
      { id: 2, Nom: 'Projet Beta', Statut: 'Clos', Accompagnateur: 0, Porteur: 8, Membres: null,
        gristHelper_Display: '', gristHelper_Display2: 'Martin Anne', gristHelper_Display3: null },
      // Accompagnateur 99 : la ligne référencée n'existe plus.
      { id: 3, Nom: 'Projet Gamma', Statut: 'En cours', Accompagnateur: 99, Porteur: 9, Membres: ['L', 9],
        gristHelper_Display: '', gristHelper_Display2: 'Durand Paul', gristHelper_Display3: ['L', 'Durand Paul'] },
    ]);
    stub.setVariables('VpNotifications', { Titre: 'Text', Projet: 'Ref:VpProjet', gristHelper_Display: 'Text' }, null, { Projet: 'gristHelper_Display' });
    stub.setRows('VpNotifications', [
      { id: 1, Titre: 'Notif 1', Projet: 1, gristHelper_Display: 'Projet Alpha' },
      { id: 2, Titre: 'Notif 2', Projet: 2, gristHelper_Display: 'Projet Beta' },
      { id: 3, Titre: 'Notif 3', Projet: 3, gristHelper_Display: 'Projet Gamma' },
    ]);
    stub.setVariables('VpLignes', { Notification: 'Ref:VpNotifications', Auteur: 'Ref:VpAnnuaire', gristHelper_Display: 'Text' }, null, { Auteur: 'gristHelper_Display' });
    stub.setRows('VpLignes', [
      { id: 1, Notification: 1, Auteur: 7, gristHelper_Display: 'Dupont Jean' },
      { id: 2, Notification: 1, Auteur: 8, gristHelper_Display: 'Martin Anne' },
      { id: 3, Notification: 2, Auteur: 9, gristHelper_Display: 'Durand Paul' },
    ]);
    await GristAPI.refreshSchema();
    for (const t of ['VpProjet', 'VpAnnuaire', 'VpServices', 'VpLignes']) await GristAPI.deleteLinkRule(t);
    if (!(opts && opts.noProjetRule)) await GristAPI.saveLinkRule('VpProjet', { mode: 'match', colonneCible: 'id', colonneSource: 'Projet' });
    if (opts && opts.withLignes) await GristAPI.saveLinkRule('VpLignes', { mode: 'match', colonneCible: 'Notification', colonneSource: 'id' });
    stub.fireRecord(Object.assign({}, RECORD_1), 'VpNotifications');
    await h.sleep(50);
  }

  async function renderReader(html) {
    const reader = document.getElementById('reader-container');
    reader.style.display = 'block';
    await ReaderMode.render(html, 'VpNotifications', GristAPI.getCurrentRecord(), NO_HF);
    return reader;
  }
  async function readerText(html) { return (await renderReader(html)).querySelector('.reader-content').textContent; }
  // Même modèle pour une ligne lue par fetchTable, comme l'export en lot.
  async function previewText(html, row) {
    const box = document.createElement('div');
    box.innerHTML = await ReaderMode.preview(html, 'VpNotifications', row);
    return box.textContent;
  }

  function badgeNodes(ed) {
    const out = [];
    ed.state.doc.descendants((node, pos) => { if (node.type.name === 'varBadge') out.push({ node, pos }); });
    return out;
  }
  // Sélection de la bulle comme un clic : .focus() DOM direct puis NodeSelection (même contournement que scenarios-varformat.js:selectFirstVarBadge).
  async function selectBadge(h, table, column) {
    const ed = EditorCore.getEditor();
    document.querySelector('.tiptap').focus();
    const found = badgeNodes(ed).find(b => b.node.attrs.table === table && b.node.attrs.column === column);
    if (!found) return null;
    ed.commands.setNodeSelection(found.pos);
    await h.sleep(120);
    return ed;
  }
  const toolbar = () => document.querySelector('.v2-varfmt-toolbar');
  // Le panneau flottant réagit au mousedown (js/editor-core.js:createFloatingPanel), comme au vrai clic.
  const pressToolbarButton = action => toolbar().querySelector(`button[data-action="${action}"]`).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  const visible = el => !!el && el.style.display !== 'none' && el.getClientRects().length > 0;

  const modal = () => document.getElementById('var-linked-modal');
  const rowOf = col => modal().querySelector(`.var-linked-row[data-col="${col}"]`);
  const columns = () => Array.from(modal().querySelectorAll('.var-linked-row')).map(r => r.dataset.col);
  const valueOf = col => rowOf(col).querySelector('.var-linked-value').textContent;
  const hasDescend = col => !!rowOf(col).querySelector('.var-linked-descend');
  const crumbs = () => {
    const nav = modal().querySelector('.var-linked-path');
    return { hidden: nav.hidden, texts: Array.from(nav.querySelectorAll('.var-linked-crumb')).map(c => c.textContent),
      buttons: Array.from(nav.querySelectorAll('button.var-linked-crumb')).map(c => c.textContent) };
  };
  const title = () => modal().querySelector('h3').textContent;
  const insertButton = () => modal().querySelector('.var-modal-primary');
  const tick = col => {
    const input = rowOf(col).querySelector('input');
    input.checked = !input.checked;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  // Un élément absent fait échouer le scénario en disant ce que la fenêtre montrait, au lieu d'une TypeError muette.
  const shown = () => (modal() ? modal().innerText.replace(/\s+/g, ' ').slice(0, 300) : '(fenêtre absente)');
  const descend = async (h, col) => {
    const arrow = rowOf(col) && rowOf(col).querySelector('.var-linked-descend');
    if (!arrow) throw new Error(`pas de flèche sur « ${col} » - la fenêtre montre : ${shown()}`);
    arrow.click();
    await h.sleep(250);
  };
  const goUp = async (h, label) => {
    const crumb = modal() && Array.from(modal().querySelectorAll('button.var-linked-crumb')).find(b => b.textContent === label);
    if (!crumb) throw new Error(`pas de bouton « ${label} » dans le fil d'Ariane - la fenêtre montre : ${shown()}`);
    crumb.click();
    await h.sleep(250);
  };
  const openWindow = async (h, table, column) => {
    const ed = await selectBadge(h, table, column);
    pressToolbarButton('var-linked');
    await h.sleep(300);
    return ed;
  };
  const keysAfter = ed => {
    const seq = [];
    ed.state.doc.firstChild.forEach(n => seq.push(n.type.name === 'varBadge' ? '#' + n.attrs.key : n.text));
    return seq;
  };
  const DATE_1990 = () => VariableFormat.formatDate(631152000, { type: 'date', preset: VariableFormat.DATE_PRESETS[0].key });

  cases.push({
    id: 'varpath_reads_the_email_of_each_referenced_row_without_a_link',
    description: 'Une bulle #VpProjet.Accompagnateur.Email lit l’email de la ligne de l’annuaire que désigne l’accompagnateur du projet, et #VpProjet.Porteur.Email celui du porteur (autre Référence vers la même table) - sans règle de liaison pour l’annuaire',
    run: async (h) => {
      await seed(h);
      const text = await readerText(`<p>A=${badgeHtml('VpProjet', 'Accompagnateur.Email')}|P=${badgeHtml('VpProjet', 'Porteur.Email')}|N=${badgeHtml('VpProjet', 'Accompagnateur.NomPrenom')}</p>`);
      const rules = ['VpAnnuaire', 'VpServices'].map(t => GristAPI.getLinkRule(t));
      const pass = text === 'A=jean.dupont@ex.fr|P=anne.martin@ex.fr|N=Dupont Jean' && rules.every(r => !r);
      return { pass, notes: JSON.stringify({ text, rules }) };
    },
  });

  cases.push({
    id: 'varpath_batch_rows_follow_references_and_tolerate_empty_ones',
    description: 'Ligne lue par fetchTable (export en lot) : même chemin ; une référence vide ou vers une ligne disparue donne une valeur vide, sans message d’erreur',
    run: async (h) => {
      await seed(h);
      const html = `<p>A=${badgeHtml('VpProjet', 'Accompagnateur.Email')}|P=${badgeHtml('VpProjet', 'Porteur.Email')}</p>`;
      const rows = await GristAPI.fetchTableRows('VpNotifications');
      const texts = [];
      for (const row of rows) texts.push(await previewText(html, row));
      const pass = JSON.stringify(texts) === JSON.stringify(['A=jean.dupont@ex.fr|P=anne.martin@ex.fr', 'A=|P=anne.martin@ex.fr', 'A=|P=paul.durand@ex.fr']);
      return { pass, notes: JSON.stringify(texts) };
    },
  });

  cases.push({
    id: 'varpath_from_the_page_table_needs_no_rule',
    description: 'Un chemin qui part de la table de la page (#VpNotifications.Projet.Accompagnateur.Email) se résout sans aucune règle de liaison, en lecture (ligne de grist.onRecord, Référence affichée) comme à l’export',
    run: async (h) => {
      await seed(h, { noProjetRule: true });
      const html = `<p>${badgeHtml('VpNotifications', 'Projet.Accompagnateur.Email')}|${badgeHtml('VpNotifications', 'Projet.Porteur.NomPrenom')}</p>`;
      const reading = await readerText(html);
      const rows = await GristAPI.fetchTableRows('VpNotifications');
      const batch = [await previewText(html, rows[0]), await previewText(html, rows[2])];
      const pass = reading === 'jean.dupont@ex.fr|Martin Anne' && JSON.stringify(batch) === JSON.stringify(['jean.dupont@ex.fr|Martin Anne', '|Durand Paul']);
      return { pass, notes: JSON.stringify({ reading, batch }) };
    },
  });

  cases.push({
    id: 'varpath_rule_with_several_rows_gives_one_value_per_row',
    description: 'Table liée par une règle « plusieurs lignes » : le chemin part de chacune des lignes liées (une valeur par ligne, jointes par une virgule)',
    run: async (h) => {
      await seed(h, { withLignes: true });
      const text = await readerText(`<p>${badgeHtml('VpLignes', 'Auteur.Email')}</p>`);
      const raw = await Variables.resolveRawValue('VpLignes', 'Auteur.Email', 'VpNotifications', GristAPI.getCurrentRecord());
      const pass = text === 'jean.dupont@ex.fr, anne.martin@ex.fr' && raw.multi === true && JSON.stringify(raw.value) === JSON.stringify(['jean.dupont@ex.fr', 'anne.martin@ex.fr']);
      return { pass, notes: JSON.stringify({ text, raw }) };
    },
  });

  cases.push({
    id: 'varpath_row_of_a_repeated_zone_is_the_starting_row',
    description: 'Dans une zone répétée, une variable de la table parcourue part de la ligne du tour, puis suit ses références',
    run: async (h) => {
      await seed(h);
      const rows = await GristAPI.fetchTableRows('VpProjet');
      const at = async (row, column) => (await Variables.resolveRawValue('VpProjet', column, 'VpNotifications', GristAPI.getCurrentRecord(), { loop: { rows: { VpProjet: row } } })).value;
      const got = [await at(rows[0], 'Accompagnateur.Email'), await at(rows[1], 'Accompagnateur.Email'), await at(rows[1], 'Porteur.Email'), await at(rows[2], 'Porteur.Email')];
      const pass = JSON.stringify(got) === JSON.stringify(['jean.dupont@ex.fr', null, 'anne.martin@ex.fr', 'paul.durand@ex.fr']);
      return { pass, notes: JSON.stringify(got) };
    },
  });

  cases.push({
    id: 'varpath_last_column_gives_type_format_and_displayed_reference',
    description: 'Le type de la dernière colonne du chemin décide du format (date) et une Référence au bout du chemin montre sa valeur affichée, jamais son id ; deux références de suite se suivent',
    run: async (h) => {
      await seed(h);
      const types = ['Accompagnateur.Naissance', 'Accompagnateur.Service', 'Accompagnateur.Service.Nom', 'Membres.Email', 'Nom.Email', 'Accompagnateur.Inconnue']
        .map(c => GristAPI.getColumnType('VpProjet', c));
      const text = await readerText(`<p>${badgeHtml('VpProjet', 'Accompagnateur.Naissance')}|${badgeHtml('VpProjet', 'Accompagnateur.Service')}|${badgeHtml('VpProjet', 'Accompagnateur.Service.Nom')}</p>`);
      const pass = JSON.stringify(types) === JSON.stringify(['Date', 'Ref:VpServices', 'Text', null, null, null]) && text === `${DATE_1990()}|Juridique|Juridique`;
      return { pass, notes: JSON.stringify({ types, text, expectedDate: DATE_1990() }) };
    },
  });

  cases.push({
    id: 'varpath_broken_path_is_flagged_and_valid_one_is_not',
    description: 'Une bulle dont un maillon du chemin a disparu (ou n’est plus une Référence) est signalée comme cassée ; un chemin valide ne l’est pas',
    run: async (h) => {
      await seed(h);
      Editor.setHTML(`<p>${badgeHtml('VpProjet', 'Accompagnateur.Email')} ${badgeHtml('VpProjet', 'Accompagnateur.Inconnue')} ${badgeHtml('VpProjet', 'Nom.Email')} ${badgeHtml('VpProjet', 'Statut')}</p>`);
      await h.sleep(300);
      const states = Array.from(document.querySelectorAll('.tiptap span.var-badge')).map(s => ({ column: s.dataset.column, broken: s.classList.contains('var-badge-broken'), title: s.title }));
      const broken = Object.fromEntries(states.map(s => [s.column, s.broken]));
      const pass = states.length === 4 && broken['Accompagnateur.Email'] === false && broken['Accompagnateur.Inconnue'] === true && broken['Nom.Email'] === true
        && broken.Statut === false && states.find(s => s.column === 'Nom.Email').title.indexOf('Nom.Email') !== -1;
      return { pass, notes: JSON.stringify(states) };
    },
  });

  cases.push({
    id: 'varpath_reference_variable_opens_on_the_row_it_points_to',
    description: 'Autres attributs sur une variable elle-même Référence d’une table liée (#VpProjet.Accompagnateur) : la fenêtre s’ouvre sur les colonnes de la ligne désignée (annuaire), avec ses valeurs, une flèche sur les seules Références et un fil d’Ariane pour remonter',
    run: async (h) => {
      await seed(h);
      Editor.setHTML(`<p>${badgeHtml('VpProjet', 'Accompagnateur')}</p>`);
      await openWindow(h, 'VpProjet', 'Accompagnateur');
      const opened = visible(modal());
      const info = {
        title: title(), cols: columns(), crumbs: crumbs(),
        values: { NomPrenom: valueOf('NomPrenom'), Email: valueOf('Email'), Naissance: valueOf('Naissance'), Service: valueOf('Service') },
        arrows: columns().filter(hasDescend),
      };
      modal().querySelector('.var-modal-actions button:not(.var-modal-primary)').click();
      const pass = opened && info.title === I18n.t('varLinked.title', { table: 'VpAnnuaire' })
        && JSON.stringify(info.cols) === JSON.stringify(['NomPrenom', 'Email', 'Naissance', 'Service'])
        && info.values.NomPrenom === 'Dupont Jean' && info.values.Email === 'jean.dupont@ex.fr' && info.values.Naissance === DATE_1990() && info.values.Service === 'Juridique'
        && JSON.stringify(info.arrows) === JSON.stringify(['Service'])
        && !info.crumbs.hidden && JSON.stringify(info.crumbs.texts) === JSON.stringify(['VpProjet', 'Accompagnateur']) && JSON.stringify(info.crumbs.buttons) === JSON.stringify(['VpProjet']);
      return { pass, notes: JSON.stringify({ opened, info }) };
    },
  });

  cases.push({
    id: 'varpath_descend_pick_at_each_level_and_insert_paths',
    description: 'Depuis #VpProjet.Nom : flèche sur les seules Références simples, descente dans l’accompagnateur puis le porteur, cases gardées d’un niveau à l’autre, bulles insérées en chemin (VpProjet.Accompagnateur.Email…) sans règle pour l’annuaire, lues en lecture',
    run: async (h) => {
      await seed(h);
      Editor.setHTML(`<p>${badgeHtml('VpProjet', 'Nom')}</p>`);
      const ed = await openWindow(h, 'VpProjet', 'Nom');
      const start = { title: title(), cols: columns(), crumbsHidden: crumbs().hidden, arrows: columns().filter(hasDescend) };
      await descend(h, 'Accompagnateur');
      const level1 = { title: title(), crumbs: crumbs(), cols: columns(), arrows: columns().filter(hasDescend), email: valueOf('Email') };
      tick('Email');
      await goUp(h, 'VpProjet');
      const back = { title: title(), crumbsHidden: crumbs().hidden };
      await descend(h, 'Porteur');
      const level1b = { crumbs: crumbs().texts, email: valueOf('Email'), emailChecked: rowOf('Email').querySelector('input').checked };
      tick('Email');
      tick('NomPrenom');
      const count = insertButton().textContent;
      insertButton().click();
      await h.sleep(100);
      const seq = keysAfter(ed);
      const text = await readerText(Editor.getHTML());
      const rules = ['VpAnnuaire', 'VpServices'].map(t => GristAPI.getLinkRule(t));
      const pass = start.title === I18n.t('varLinked.title', { table: 'VpProjet' }) && start.crumbsHidden
        && JSON.stringify(start.cols) === JSON.stringify(['Nom', 'Statut', 'Accompagnateur', 'Porteur', 'Membres'])
        && JSON.stringify(start.arrows) === JSON.stringify(['Accompagnateur', 'Porteur'])
        && level1.title === I18n.t('varLinked.title', { table: 'VpAnnuaire' }) && JSON.stringify(level1.crumbs.texts) === JSON.stringify(['VpProjet', 'Accompagnateur'])
        && JSON.stringify(level1.arrows) === JSON.stringify(['Service']) && level1.email === 'jean.dupont@ex.fr'
        && back.title === start.title && back.crumbsHidden
        && JSON.stringify(level1b.crumbs) === JSON.stringify(['VpProjet', 'Porteur']) && level1b.email === 'anne.martin@ex.fr' && level1b.emailChecked === false
        && count === I18n.t('varLinked.insert', { count: 3 }) && count === 'Insérer 3 attributs' && !visible(modal())
        && JSON.stringify(seq) === JSON.stringify(['#VpProjet.Nom', ' ', '#VpProjet.Accompagnateur.Email', ' ', '#VpProjet.Porteur.NomPrenom', ' ', '#VpProjet.Porteur.Email'])
        && text === 'Projet Alpha jean.dupont@ex.fr Martin Anne anne.martin@ex.fr' && rules.every(r => !r);
      return { pass, notes: JSON.stringify({ start, level1, back, level1b, count, seq, text, rules }) };
    },
  });

  cases.push({
    id: 'varpath_picks_survive_navigation_filter_resets_escape_closes',
    description: 'Une case cochée reste cochée en revenant sur son niveau et compte dans « Insérer » ; le filtre est vidé à chaque changement de niveau ; Échap ferme sans rien insérer',
    run: async (h) => {
      await seed(h);
      Editor.setHTML(`<p>${badgeHtml('VpProjet', 'Nom')}</p>`);
      const ed = await openWindow(h, 'VpProjet', 'Nom');
      const filter = modal().querySelector('.var-linked-filter');
      await descend(h, 'Accompagnateur');
      tick('Email');
      filter.value = 'mail';
      filter.dispatchEvent(new Event('input', { bubbles: true }));
      const filtered = columns().filter(c => !rowOf(c).hidden);
      await goUp(h, 'VpProjet');
      const clearedUp = filter.value === '' && columns().filter(c => !rowOf(c).hidden).length === 5;
      await descend(h, 'Accompagnateur');
      const stillChecked = rowOf('Email').querySelector('input').checked;
      const count = insertButton().textContent;
      const focused = document.activeElement === filter;
      modal().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await h.sleep(60);
      const nodes = badgeNodes(ed).length;
      const pass = JSON.stringify(filtered) === JSON.stringify(['Email']) && clearedUp && stillChecked && count === I18n.t('varLinked.insert', { count: 1 }) && count === 'Insérer 1 attribut' && focused
        && !visible(modal()) && nodes === 1;
      return { pass, notes: JSON.stringify({ filtered, clearedUp, stillChecked, count, focused, nodes }) };
    },
  });

  cases.push({
    id: 'varpath_page_reference_links_its_table_then_descends',
    description: 'Depuis une colonne Référence de la page sans règle pour sa table (#VpNotifications.Projet) : la table est liée par cette colonne, comme avant, et l’on descend jusqu’à l’email de l’accompagnateur (bulle #VpProjet.Accompagnateur.Email)',
    run: async (h) => {
      await seed(h, { noProjetRule: true });
      Editor.setHTML(`<p>${badgeHtml('VpNotifications', 'Projet')}</p>`);
      const ed = await openWindow(h, 'VpNotifications', 'Projet');
      const rule = GristAPI.getLinkRule('VpProjet');
      const start = { title: title(), cols: columns(), arrows: columns().filter(hasDescend), crumbsHidden: crumbs().hidden };
      await descend(h, 'Accompagnateur');
      tick('Email');
      insertButton().click();
      await h.sleep(100);
      const seq = keysAfter(ed);
      const text = await readerText(Editor.getHTML());
      const pass = !!rule && rule.mode === 'match' && rule.colonneCible === 'id' && rule.colonneSource === 'Projet'
        && start.title === I18n.t('varLinked.title', { table: 'VpProjet' }) && JSON.stringify(start.arrows) === JSON.stringify(['Accompagnateur', 'Porteur']) && start.crumbsHidden
        && JSON.stringify(seq) === JSON.stringify(['#VpNotifications.Projet', ' ', '#VpProjet.Accompagnateur.Email']) && text === 'Projet Alpha jean.dupont@ex.fr';
      return { pass, notes: JSON.stringify({ rule, start, seq, text }) };
    },
  });

  cases.push({
    id: 'varpath_page_table_path_badge_climbs_no_higher_than_its_path',
    description: 'Une bulle en chemin sur la table de la page (#VpNotifications.Projet.Accompagnateur) ouvre la fenêtre sans règle de liaison et sans remonter aux colonnes ordinaires de la page ; les bulles insérées gardent la page pour table',
    run: async (h) => {
      await seed(h, { noProjetRule: true });
      Editor.setHTML(`<p>${badgeHtml('VpNotifications', 'Projet.Accompagnateur')}</p>`);
      const ed = await openWindow(h, 'VpNotifications', 'Projet.Accompagnateur');
      const info = { title: title(), crumbs: crumbs(), rule: GristAPI.getLinkRule('VpProjet'), email: valueOf('Email') };
      tick('Email');
      await goUp(h, 'Projet');
      const up = { title: title(), cols: columns(), crumbs: crumbs() };
      await descend(h, 'Porteur');
      tick('NomPrenom');
      insertButton().click();
      await h.sleep(100);
      const seq = keysAfter(ed);
      const text = await readerText(Editor.getHTML());
      const pass = info.title === I18n.t('varLinked.title', { table: 'VpAnnuaire' }) && JSON.stringify(info.crumbs.texts) === JSON.stringify(['VpNotifications', 'Projet', 'Accompagnateur'])
        && JSON.stringify(info.crumbs.buttons) === JSON.stringify(['Projet']) && !info.rule && info.email === 'jean.dupont@ex.fr'
        && up.title === I18n.t('varLinked.title', { table: 'VpProjet' }) && JSON.stringify(up.crumbs.texts) === JSON.stringify(['VpNotifications', 'Projet']) && up.crumbs.buttons.length === 0
        && JSON.stringify(seq) === JSON.stringify(['#VpNotifications.Projet.Accompagnateur', ' ', '#VpNotifications.Projet.Accompagnateur.Email', ' ', '#VpNotifications.Projet.Porteur.NomPrenom'])
        && text === 'Dupont Jean jean.dupont@ex.fr Martin Anne';
      return { pass, notes: JSON.stringify({ info, up, seq, text }) };
    },
  });

  cases.push({
    id: 'varpath_availability_and_loop_source_of_paths',
    description: 'Autres attributs reste grisé pour une colonne ordinaire de la page ou un chemin dont un maillon n’est pas une Référence ; la boucle sur une liste de références refuse un chemin de la table de la page',
    run: async (h) => {
      await seed(h);
      const avail = attrs => VariableLinkedAttrs.isAvailable(attrs);
      const got = {
        pageColumn: avail({ table: 'VpNotifications', column: 'Titre' }),
        pageReference: avail({ table: 'VpNotifications', column: 'Projet' }),
        otherPlain: avail({ table: 'VpProjet', column: 'Nom' }),
        otherReference: avail({ table: 'VpProjet', column: 'Accompagnateur' }),
        otherPath: avail({ table: 'VpProjet', column: 'Accompagnateur.Email' }),
        pagePath: avail({ table: 'VpNotifications', column: 'Projet.Accompagnateur.Email' }),
        notAReferenceHop: avail({ table: 'VpProjet', column: 'Nom.Email' }),
        missingHop: avail({ table: 'VpProjet', column: 'Inconnue.Email' }),
      };
      const loopOfPagePath = LoopRules.sourceFor({ table: 'VpNotifications', column: 'Projet.Membres' }, 'VpNotifications');
      const loopOfPageList = LoopRules.sourceFor({ table: 'VpProjet', column: 'Membres' }, 'VpProjet');
      const pass = JSON.stringify(got) === JSON.stringify({ pageColumn: false, pageReference: true, otherPlain: true, otherReference: true, otherPath: true, pagePath: true,
        notAReferenceHop: false, missingHop: false }) && loopOfPagePath === null && !!loopOfPageList && loopOfPageList.table === 'VpAnnuaire';
      return { pass, notes: JSON.stringify({ got, loopOfPagePath, loopOfPageList }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.varPath = cases;
})();
