// Suite "loopSection" - la Boucle répète une SECTION : le titre qui porte la bulle et tout ce qui le suit, jusqu'au prochain titre de même niveau ou plus haut, ou jusqu'à la
// marque « Fin de la section » (js/loop-rules.js : sectionRanges, attachSections, expandZone ; nœud `loopEnd` de js/editor-nodes.js ; fenêtre js/variable-loop.js). Demande d'Antoine
// du 12/11 : un ordre du jour, une ligne par point rattachée à une instance, des vrais titres et de la place pour écrire entre eux ; ses sous-points sont des lignes de la même table,
// avec une colonne qui désigne leur point parent.
// Jeu de données fictif : instances (table de la page), points (LsPoints : Instance, Parent, Titre, Rapporteur), sous-points d'une autre table (LsSous : Point).
(function () {
  const cases = [];

  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const RECORD = { id: 1, Nom: 'Comité de pilotage du 12 novembre' };
  const TOP_ONLY = { mode: 'all', rules: [{ column: 'Parent', operator: 'vide', value: '' }] };
  const SECTION = { repeat: 'section', table: 'LsPoints', empty: 'hide', filter: TOP_ONLY };
  const SUB_SECTION = { repeat: 'section', table: 'LsPoints', within: 'LsPoints', by: 'Parent', empty: 'hide' };

  function attr(name, value) { return ` ${name}="${JSON.stringify(value).replace(/"/g, '&quot;')}"`; }
  function badge(table, column, loop) {
    const loopAttrs = loop ? attr('data-loop', loop) + ` data-loop-repeat="${loop.repeat || 'inline'}"` : '';
    return `<span class="var-badge" data-table="${table}" data-column="${column}" data-key="${table}.${column}"${loopAttrs}></span>`;
  }
  const END = '<div class="loop-end-marker" data-loop-end="true"></div>';

  async function seed(h) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setViewRows(null);
    stub.setViewFailure(null);
    stub.setVariables('LsInstances', { Nom: 'Text' });
    stub.setVariables('LsPoints', { Instance: 'Ref:LsInstances', Parent: 'Ref:LsPoints', Titre: 'Text', Rapporteur: 'Text', manualSort: 'ManualSortPos' });
    stub.setVariables('LsSous', { Point: 'Ref:LsPoints', Libelle: 'Text', manualSort: 'ManualSortPos' });
    stub.setRows('LsInstances', [{ id: 1, Nom: 'Comité de pilotage du 12 novembre' }, { id: 2, Nom: 'Conseil du 3 décembre' }, { id: 3, Nom: 'Instance sans point' }]);
    stub.setRows('LsPoints', [
      { id: 1, Instance: 1, Parent: 0, Titre: 'Approbation du compte rendu', Rapporteur: 'M. Durand', manualSort: 1 },
      { id: 2, Instance: 1, Parent: 0, Titre: 'Budget 2027', Rapporteur: 'Mme Lefèvre', manualSort: 2 },
      { id: 3, Instance: 1, Parent: 2, Titre: 'Crédits de formation', Rapporteur: '', manualSort: 3 },
      { id: 4, Instance: 1, Parent: 2, Titre: 'Reports de crédits', Rapporteur: '', manualSort: 4 },
      { id: 5, Instance: 1, Parent: 0, Titre: 'Questions diverses', Rapporteur: 'M. Durand', manualSort: 5 },
      { id: 6, Instance: 2, Parent: 0, Titre: 'Point du conseil', Rapporteur: 'Mme Roy', manualSort: 6 },
    ]);
    stub.setRows('LsSous', [
      { id: 1, Point: 2, Libelle: 'Lecture du texte', manualSort: 1 },
      { id: 2, Point: 2, Libelle: 'Corrections', manualSort: 2 },
      { id: 3, Point: 5, Libelle: 'Date du prochain comité', manualSort: 3 },
    ]);
    await GristAPI.refreshSchema();
    for (const t of ['LsPoints', 'LsSous']) await GristAPI.deleteLinkRule(t);
    await GristAPI.saveLinkRule('LsPoints', { mode: 'match', colonneCible: 'Instance', colonneSource: 'id' });
    await GristAPI.refreshSchema();
    stub.fireRecord(Object.assign({}, RECORD), 'LsInstances');
    await h.sleep(50);
  }

  async function read(html, record) {
    const box = document.createElement('div');
    box.innerHTML = await ReaderMode.preview(html, 'LsInstances', record || RECORD);
    return box;
  }
  // La suite des blocs du document lu : « h2 Titre », « p Texte »…
  function blocks(box) {
    return Array.from(box.children).map(el => el.tagName.toLowerCase() + ' ' + el.textContent.trim());
  }
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  cases.push({
    id: 'loop_section_repeats_the_heading_and_the_text_under_it_for_each_row',
    description: 'La section d’un titre : le titre ET le texte tapé dessous (sans aucune variable) sont répétés pour chaque point ; ce qui vient après un titre de niveau plus haut n’est écrit qu’une fois',
    run: async (h) => {
      await seed(h);
      const html = `<h2>${badge('LsPoints', 'Titre', SECTION)}</h2><p>Rapporteur : ${badge('LsPoints', 'Rapporteur')}</p><p>Décision :</p><h1>Fin du compte rendu</h1><p>Signature</p>`;
      const got = blocks(await read(html));
      const expected = [
        'h2 Approbation du compte rendu', 'p Rapporteur : M. Durand', 'p Décision :',
        'h2 Budget 2027', 'p Rapporteur : Mme Lefèvre', 'p Décision :',
        'h2 Questions diverses', 'p Rapporteur : M. Durand', 'p Décision :',
        'h1 Fin du compte rendu', 'p Signature',
      ];
      return { pass: same(got, expected), notes: JSON.stringify(got) };
    },
  });

  cases.push({
    id: 'loop_section_stops_at_the_end_marker_and_the_marker_is_never_written',
    description: 'La marque « Fin de la section » arrête la section : le texte qui la suit n’est écrit qu’une fois, après tous les points, et la marque ne se lit nulle part',
    run: async (h) => {
      await seed(h);
      const html = `<h2>${badge('LsPoints', 'Titre', SECTION)}</h2><p>Décision :</p>${END}<p>Prochaine réunion le 3 décembre.</p>`;
      const box = await read(html);
      const got = blocks(box);
      const expected = ['h2 Approbation du compte rendu', 'p Décision :', 'h2 Budget 2027', 'p Décision :', 'h2 Questions diverses', 'p Décision :', 'p Prochaine réunion le 3 décembre.'];
      return { pass: same(got, expected) && !box.querySelector('[data-loop-end]'), notes: JSON.stringify(got) };
    },
  });

  cases.push({
    id: 'loop_section_without_a_stop_runs_to_the_end_of_the_document',
    description: 'Sans titre ni marque derrière elle, la section va jusqu’au bout du document : tout le texte du dessous est répété avec chaque point (c’est ce que la marque sert à éviter)',
    run: async (h) => {
      await seed(h);
      const html = `<h2>${badge('LsPoints', 'Titre', SECTION)}</h2><p>Décision :</p><p>Prochaine réunion le 3 décembre.</p>`;
      const got = blocks(await read(html));
      const one = ['h2 X', 'p Décision :', 'p Prochaine réunion le 3 décembre.'];
      const titles = ['Approbation du compte rendu', 'Budget 2027', 'Questions diverses'];
      const expected = titles.flatMap(t => one.map(b => b.replace('X', t)));
      return { pass: same(got, expected), notes: JSON.stringify(got) };
    },
  });

  cases.push({
    id: 'loop_section_without_row_hides_the_whole_section_or_writes_the_text',
    description: 'Aucun point retenu : « Masquer la section » retire le titre et tout ce qui le suit jusqu’à la marque (le texte de fin reste), « Écrire un texte » ne laisse que ce texte à la place du titre',
    run: async (h) => {
      await seed(h);
      const empty = { id: 3, Nom: 'Instance sans point' };
      const hide = `<h2>${badge('LsPoints', 'Titre', SECTION)}</h2><p>Décision :</p>${END}<p>Prochaine réunion le 3 décembre.</p>`;
      const text = `<h2>${badge('LsPoints', 'Titre', Object.assign({}, SECTION, { empty: 'text', emptyText: 'Aucun point inscrit.' }))}</h2><p>Décision :</p>${END}<p>Prochaine réunion le 3 décembre.</p>`;
      const gotHide = blocks(await read(hide, empty));
      const gotText = blocks(await read(text, empty));
      const pass = same(gotHide, ['p Prochaine réunion le 3 décembre.']) && same(gotText, ['p Aucun point inscrit.', 'p Prochaine réunion le 3 décembre.']);
      return { pass, notes: JSON.stringify({ gotHide, gotText }) };
    },
  });

  cases.push({
    id: 'loop_section_sub_points_of_the_same_table_nest_under_each_point',
    description: 'Les sous-points sont des lignes de la même table, rattachées par une colonne « Parent » : la section d’un titre 2 est dans celle d’un titre 1, chaque point a ses sous-points seulement, un point sans sous-point perd sa section 2',
    run: async (h) => {
      await seed(h);
      const html = `<h1>${badge('LsPoints', 'Titre', SECTION)}</h1><p>Rapporteur : ${badge('LsPoints', 'Rapporteur')}</p>`
        + `<h2>${badge('LsPoints', 'Titre', SUB_SECTION)}</h2><p>Compte rendu :</p>`;
      const got = blocks(await read(html));
      const expected = [
        'h1 Approbation du compte rendu', 'p Rapporteur : M. Durand',
        'h1 Budget 2027', 'p Rapporteur : Mme Lefèvre', 'h2 Crédits de formation', 'p Compte rendu :', 'h2 Reports de crédits', 'p Compte rendu :',
        'h1 Questions diverses', 'p Rapporteur : M. Durand',
      ];
      return { pass: same(got, expected), notes: JSON.stringify(got) };
    },
  });

  cases.push({
    id: 'loop_section_sub_points_in_another_table_nest_the_same_way',
    description: 'Des sous-points rangés dans une AUTRE table (colonne Référence vers le point) s’emboîtent de la même façon : la section 2 lit les sous-points de ce point-là, et la marque ferme la plus proche',
    run: async (h) => {
      await seed(h);
      const sous = { repeat: 'section', table: 'LsSous', within: 'LsPoints', by: 'Point', empty: 'hide' };
      const html = `<h1>${badge('LsPoints', 'Titre', SECTION)}</h1>`
        + `<h2>${badge('LsSous', 'Libelle', sous)}</h2><p>Avis :</p>${END}<p>Fin du point.</p>`;
      const got = blocks(await read(html));
      const expected = [
        'h1 Approbation du compte rendu', 'p Fin du point.',
        'h1 Budget 2027', 'h2 Lecture du texte', 'p Avis :', 'h2 Corrections', 'p Avis :', 'p Fin du point.',
        'h1 Questions diverses', 'h2 Date du prochain comité', 'p Avis :', 'p Fin du point.',
      ];
      return { pass: same(got, expected), notes: JSON.stringify(got) };
    },
  });

  cases.push({
    id: 'loop_section_the_parent_of_a_sub_point_is_read_through_its_parent_column',
    description: 'Dans la section d’un sous-point (même table), la variable lit le sous-point ; le titre de son point se lit par la colonne « Parent » (Parent.Titre), sans rien de plus',
    run: async (h) => {
      await seed(h);
      const html = `<h1>${badge('LsPoints', 'Titre', SECTION)}</h1>`
        + `<h2>${badge('LsPoints', 'Titre', SUB_SECTION)}</h2><p>Sous le point : ${badge('LsPoints', 'Parent.Titre')}</p>`;
      const got = blocks(await read(html));
      const expected = [
        'h1 Approbation du compte rendu',
        'h1 Budget 2027', 'h2 Crédits de formation', 'p Sous le point : Budget 2027', 'h2 Reports de crédits', 'p Sous le point : Budget 2027',
        'h1 Questions diverses',
      ];
      return { pass: same(got, expected), notes: JSON.stringify(got) };
    },
  });

  cases.push({
    id: 'loop_section_in_a_table_cell_stays_in_its_cell_and_a_stray_marker_is_removed',
    description: 'Une section ne traverse pas sa cellule : dans une case de tableau elle s’arrête à la fin de la case ; une marque qui ne ferme aucune section, ou lue sans ligne affichée, ne s’écrit jamais',
    run: async (h) => {
      await seed(h);
      const html = `<table><tbody><tr><td><h3>${badge('LsPoints', 'Titre', SECTION)}</h3><p>Avis :</p></td><td><p>Autre case</p></td></tr></tbody></table>${END}<p>Fin.</p>`;
      const box = await read(html);
      const cells = Array.from(box.querySelectorAll('td')).map(td => Array.from(td.children).map(c => c.tagName.toLowerCase() + ' ' + c.textContent.trim()));
      const first = cells[0] || [];
      const root = document.createElement('div');
      root.innerHTML = `<p>A</p>${END}<p>B</p>`;
      await LoopRules.expandZones(root, 'LsInstances', null, null);
      const pass = first.length === 6 && first[0] === 'h3 Approbation du compte rendu' && first[1] === 'p Avis :' && first[2] === 'h3 Budget 2027'
        && cells[1] && same(cells[1], ['p Autre case']) && !box.querySelector('[data-loop-end]') && root.querySelectorAll('[data-loop-end]').length === 0 && root.children.length === 2;
      return { pass, notes: JSON.stringify({ cells, left: root.innerHTML }) };
    },
  });

  // === L'éditeur : le repère des sections, la marque, la fenêtre de la Boucle ===
  function badgeNodes(ed) {
    const out = [];
    ed.state.doc.descendants((node, pos) => { if (node.type.name === 'varBadge') out.push({ node, pos }); });
    return out;
  }
  async function selectBadge(h, key, nth) {
    const ed = EditorCore.getEditor();
    document.querySelector('.tiptap').focus();
    const found = badgeNodes(ed).filter(b => b.node.attrs.key === key)[nth || 0];
    if (!found) return null;
    ed.commands.setNodeSelection(found.pos);
    await h.sleep(120);
    return found;
  }
  function pressToolbarButton(action) {
    document.querySelector('.v2-varfmt-toolbar').querySelector(`button[data-action="${action}"]`).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  }
  const modal = () => document.getElementById('var-loop-modal');
  async function openOn(h, key, nth) {
    const found = await selectBadge(h, key, nth);
    if (!found) return null;
    pressToolbarButton('var-loop');
    await h.sleep(500);
    return found;
  }
  const repeats = () => Array.from(modal().querySelectorAll('.var-loop-seg button')).map(b => b.dataset.repeat + (b.getAttribute('aria-pressed') === 'true' ? '*' : ''));
  async function choose(h, repeat) {
    Array.from(modal().querySelectorAll('.var-loop-seg button')).find(b => b.dataset.repeat === repeat).click();
    await h.sleep(80);
  }
  const button = label => Array.from(modal().querySelectorAll('.var-modal-actions button')).find(b => b.textContent === label);
  async function save(h) { button(I18n.t('common.save')).click(); await h.sleep(150); }
  async function cancel(h) { button(I18n.t('common.cancel')).click(); await h.sleep(100); }
  // Les classes de décoration de chaque enfant de `.tiptap`, dans l'ordre : « h1 first d1 », « p d1 »…
  function marks() {
    return Array.from(document.querySelector('.tiptap').children).filter(el => !el.classList.contains('ProseMirror-trailingBreak')).map((el) => {
      const kinds = ['first', 'last', 'd1', 'd2', 'd3'].filter(k => el.classList.contains('pp-loop-section' + (k === 'first' || k === 'last' ? '-' + k : '-' + k)));
      return el.tagName.toLowerCase() + (el.classList.contains('pp-loop-section') ? ' in' : ' out') + (kinds.length ? ' ' + kinds.join(' ') : '');
    });
  }

  cases.push({
    id: 'loop_section_editor_tints_the_heading_and_the_blocks_up_to_the_end',
    description: 'Dans l’éditeur, le titre qui répète une section et les blocs jusqu’au prochain titre de même niveau, ou jusqu’à la marque, portent le repère de la section ; le texte d’après la marque et le titre suivant n’en ont pas',
    run: async (h) => {
      await seed(h);
      Editor.setHTML(`<h1>${badge('LsPoints', 'Titre', SECTION)}</h1><p>Rapporteur</p><h2>Sous-titre</h2><p>x</p>${END}<p>Après</p><h1>Autre</h1><p>Fin</p>`);
      await h.sleep(250);
      const got = marks();
      const expected = ['h1 in first d1', 'p in d1', 'h2 in d1', 'p in last d1', 'div out', 'p out', 'h1 out', 'p out'];
      Editor.setHTML('<h1>Sans boucle</h1><p>texte</p>');
      await h.sleep(200);
      const plain = document.querySelectorAll('.tiptap .pp-loop-section').length;
      return { pass: JSON.stringify(got) === JSON.stringify(expected) && plain === 0, notes: JSON.stringify({ got, plain }) };
    },
  });

  cases.push({
    id: 'loop_section_editor_nested_sections_get_a_second_bar_and_the_first_block_gets_the_tab',
    description: 'Un titre 2 qui répète sa section dans celle d’un titre 1 : ses blocs portent les deux niveaux (d1 et d2), le titre qui ouvre chaque section porte l’onglet',
    run: async (h) => {
      await seed(h);
      Editor.setHTML(`<h1>${badge('LsPoints', 'Titre', SECTION)}</h1><h2>${badge('LsPoints', 'Titre', SUB_SECTION)}</h2><p>Compte rendu</p><h1>Suivant</h1>`);
      await h.sleep(250);
      const got = marks();
      const expected = ['h1 in first d1', 'h2 in first d1 d2', 'p in last d1 d2', 'h1 out', 'p out'];
      const tab = getComputedStyle(document.querySelector('.tiptap h2'), '::after').content;
      return { pass: JSON.stringify(got) === JSON.stringify(expected) && tab === '""', notes: JSON.stringify({ got, tab }) };
    },
  });

  cases.push({
    id: 'loop_section_editor_text_under_the_heading_reads_the_row_of_the_loop',
    description: 'Une variable écrite sous un titre répété lit la ligne du tour : sa zone est la section (autocomplétion # et couleur de la bulle), celle d’un sous-titre donne ses deux sections, plus proche d’abord ; la marque ferme la plus proche seulement',
    run: async (h) => {
      await seed(h);
      Editor.setHTML(`<h1>${badge('LsPoints', 'Titre', SECTION)}</h1><p>Rapporteur : ${badge('LsPoints', 'Rapporteur')}</p><h2>${badge('LsPoints', 'Titre', SUB_SECTION)}</h2><p>Avis ${badge('LsPoints', 'Libelle')}</p>${END}<p>Fin ${badge('LsPoints', 'Titre')}</p>`);
      await h.sleep(250);
      const ed = EditorCore.getEditor();
      const bubbles = badgeNodes(ed);
      const zonesOf = pos => VariableLoop.zonesAt(ed.state, pos).map(z => z.repeat + ':' + (z.owner.node.attrs.loop.within ? 'sous-points' : 'points'));
      const under = zonesOf(bubbles[1].pos);
      const sub = zonesOf(bubbles[2].pos);
      const inSub = zonesOf(bubbles[3].pos);
      const after = zonesOf(bubbles[4].pos);
      const tables = VariableLoop.loopTablesAt(ed.state, bubbles[1].pos);
      // La marque ferme la section ouverte la plus proche (celle du sous-titre) : le texte d'après reste dans celle du titre 1, qui court jusqu'au prochain titre ou à la fin.
      const pass = same(under, ['section:points']) && same(sub, ['section:sous-points', 'section:points'])
        && same(inSub, ['section:sous-points', 'section:points']) && same(after, ['section:points']) && same(tables, ['LsPoints']);
      return { pass, notes: JSON.stringify({ under, sub, inSub, after, tables }) };
    },
  });

  cases.push({
    id: 'loop_section_editor_window_offers_the_section_on_a_heading_only',
    description: 'Fenêtre Boucle : « Le titre et ce qui le suit » n’est proposé que sur la bulle d’un titre ; le choisir change la note et les choix « Si aucune ligne », « Enregistrer » écrit la boucle de section',
    run: async (h) => {
      await seed(h);
      Editor.setHTML(`<h2>${badge('LsPoints', 'Titre')}</h2><p>${badge('LsPoints', 'Rapporteur')}</p>`);
      await h.sleep(150);
      const out = {};
      await openOn(h, 'LsPoints.Rapporteur');
      out.paragraph = repeats();
      await cancel(h);
      await openOn(h, 'LsPoints.Titre');
      out.heading = repeats();
      await choose(h, 'section');
      out.label = modal().querySelector('.var-loop-seg button[data-repeat="section"]').textContent;
      out.note = modal().querySelector('.var-loop-row-note').textContent;
      out.noteShown = !modal().querySelector('.var-loop-row-note').hidden;
      out.empty = Array.from(modal().querySelectorAll('#var-loop-empty option')).map(o => o.textContent);
      await save(h);
      const loop = badgeNodes(EditorCore.getEditor()).find(b => b.node.attrs.key === 'LsPoints.Titre').node.attrs.loop;
      out.saved = loop && { repeat: loop.repeat, table: loop.table, empty: loop.empty };
      await openOn(h, 'LsPoints.Titre');
      out.reopened = repeats();
      await cancel(h);
      const pass = same(out.paragraph, ['inline*', 'paragraph']) && same(out.heading, ['inline*', 'paragraph', 'section']) && out.label === I18n.t('varLoop.repeat.section')
        && out.noteShown && out.note === I18n.t('varLoop.repeat.sectionNote')
        && same(out.empty, [I18n.t('varLoop.empty.hideSection'), I18n.t('varLoop.empty.sectionText')])
        && same(out.saved, { repeat: 'section', table: 'LsPoints', empty: 'hide' }) && same(out.reopened, ['inline', 'paragraph', 'section*']);
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'loop_section_editor_sub_points_in_the_same_table_open_a_loop_through_the_parent_column',
    description: 'Un titre 2 qui lit la MÊME table que la section qui l’entoure : le bouton Boucle est actif, la fenêtre dit « qui ont pour parent la ligne de la zone, par LsPoints.Parent », l’enregistrement écrit within et by, et la lecture range les sous-points sous leur point',
    run: async (h) => {
      await seed(h);
      Editor.setHTML(`<h1>${badge('LsPoints', 'Titre', SECTION)}</h1><h2>${badge('LsPoints', 'Titre')}</h2><p>Compte rendu</p>`);
      await h.sleep(250);
      const ed = EditorCore.getEditor();
      const sub = badgeNodes(ed)[1];
      const status = VariableLoop.status(ed, sub.pos, sub.node);
      const out = { status: { active: status.active, enabled: status.enabled } };
      await openOn(h, 'LsPoints.Titre', 1);
      out.source = modal().querySelector('.var-loop-source').textContent;
      out.noParent = !!modal().querySelector('.var-loop-no-parent');
      await choose(h, 'section');
      await save(h);
      const loop = badgeNodes(ed).find(b => b.node.attrs.key === 'LsPoints.Titre' && b.node.attrs.loop && b.node.attrs.loop.within).node.attrs.loop;
      out.saved = { repeat: loop.repeat, table: loop.table, within: loop.within, by: loop.by };
      const top = badgeNodes(ed)[0];
      ed.chain().setNodeSelection(top.pos).command(({ tr }) => { tr.setNodeMarkup(top.pos, undefined, Object.assign({}, top.node.attrs, { loop: SECTION })); return true; }).run();
      const read = blocks(await read_(Editor.getHTML()));
      const expected = [
        'h1 Approbation du compte rendu',
        'h1 Budget 2027', 'h2 Crédits de formation', 'p Compte rendu', 'h2 Reports de crédits', 'p Compte rendu',
        'h1 Questions diverses',
      ];
      out.read = read;
      const pass = out.status.enabled && out.source.indexOf('LsPoints.Parent') !== -1 && out.source.indexOf(I18n.t('varLoop.source.parent', { table: 'LsPoints', via: 'LsPoints.Parent' })) !== -1
        && !out.noParent && same(out.saved, { repeat: 'section', table: 'LsPoints', within: 'LsPoints', by: 'Parent' }) && same(read, expected);
      return { pass, notes: JSON.stringify(out) };
    },
  });
  async function read_(html) { return read(html); }

  cases.push({
    id: 'loop_section_editor_no_parent_link_adds_the_condition_for_the_top_level_loop',
    description: 'Boucle de premier niveau sur une table qui se rattache à elle-même : le lien « Seulement les lignes sans parent » ajoute la condition « Parent vide » ; absent sur une table sans parent et sur la boucle des sous-points',
    run: async (h) => {
      await seed(h);
      Editor.setHTML(`<h1>${badge('LsPoints', 'Titre')}</h1><p>${badge('LsSous', 'Libelle')}</p>`);
      await h.sleep(150);
      const out = {};
      await openOn(h, 'LsPoints.Titre');
      const link = () => modal().querySelector('.var-loop-no-parent');
      out.shown = !!link();
      out.text = link() && link().textContent;
      link().click();
      await h.sleep(120);
      out.rules = modal().querySelectorAll('.var-condition-rules .macro-rule, .var-condition-rules [data-rule-path]').length;
      out.linkAfter = !!link();
      await choose(h, 'paragraph');
      await save(h);
      const loop = badgeNodes(EditorCore.getEditor()).find(b => b.node.attrs.key === 'LsPoints.Titre').node.attrs.loop;
      out.filter = loop && loop.filter && { mode: loop.filter.mode, rules: loop.filter.rules.map(r => r.column + ' ' + r.operator) };
      const sous = await openOn(h, 'LsSous.Libelle');
      out.noSelfRef = !!sous && !link();
      await cancel(h);
      const pass = out.shown && out.text === I18n.t('varLoop.filter.noParent', { column: 'Parent' }) && out.rules >= 1 && !out.linkAfter
        && same(out.filter, { mode: 'all', rules: ['Parent vide'] }) && out.noSelfRef;
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'loop_section_editor_end_marker_command_places_the_marker_and_the_reading_drops_it',
    description: 'La commande « Fin de la section » (palette Alt+/) pose la marque sous le curseur, avec une ligne à écrire dessous ; le repère dit son nom dans la langue de l’interface ; le HTML enregistré la garde, la Lecture ne l’écrit pas',
    run: async (h) => {
      await seed(h);
      Editor.setHTML(`<h2>${badge('LsPoints', 'Titre', SECTION)}</h2><p>Décision :</p><p>Suite</p>`);
      await h.sleep(200);
      const ed = EditorCore.getEditor();
      let at = 0;
      ed.state.doc.descendants((node, pos) => { if (node.type.name === 'paragraph' && node.textContent === 'Décision :') at = pos + node.nodeSize - 1; });
      ed.commands.setTextSelection(at);
      document.querySelector('.tiptap').focus();
      const ran = Shortcuts.run('loopEnd') === true;
      await h.sleep(250);
      const names = [];
      ed.state.doc.forEach(node => names.push(node.type.name));
      const marker = document.querySelector('.tiptap .loop-end-marker');
      const html = Editor.getHTML();
      const kept = /class="loop-end-marker"[^>]*data-loop-end="true"/.test(html) || /data-loop-end="true"[^>]*class="loop-end-marker"/.test(html);
      const got = blocks(await read(html));
      const expected = ['h2 Approbation du compte rendu', 'p Décision :', 'h2 Budget 2027', 'p Décision :', 'h2 Questions diverses', 'p Décision :', 'p Suite'];
      const action = Shortcuts.action('loopEnd');
      const inList = !!action && action.group === 'insert' && Shortcuts.ACTIONS.some(a => a.id === 'loopEnd');
      const pass = ran && same(names, ['heading', 'paragraph', 'loopEnd', 'paragraph']) && !!marker && marker.textContent === I18n.t('loopEnd.marker') && kept && same(got, expected) && inList;
      return { pass, notes: JSON.stringify({ ran, names, text: marker && marker.textContent, kept, got, inList }) };
    },
  });

  cases.push({
    id: 'loop_section_editor_end_marker_never_replaces_the_selected_bubble_or_its_heading',
    description: 'La marque « Fin de la section » posée alors que la bulle du titre est encore sélectionnée (juste après « Enregistrer ») ou qu’un mot est sélectionné : rien n’est remplacé, la marque se pose sous la ligne',
    run: async (h) => {
      await seed(h);
      Editor.setHTML(`<h2>${badge('LsPoints', 'Titre', SECTION)}</h2><p>Décision aujourd’hui</p>`);
      await h.sleep(200);
      const ed = EditorCore.getEditor();
      const out = {};
      const names = () => { const list = []; ed.state.doc.forEach(node => list.push(node.type.name + (node.textContent ? ':' + node.textContent : ''))); return list; };
      await selectBadge(h, 'LsPoints.Titre');
      out.ranBubble = Shortcuts.run('loopEnd') === true;
      await h.sleep(150);
      out.afterBubble = names();
      let word = 0;
      ed.state.doc.descendants((node, pos) => { if (node.isText && node.text === 'Décision aujourd’hui') word = pos; });
      ed.commands.setTextSelection({ from: word, to: word + 8 });
      document.querySelector('.tiptap').focus();
      out.ranWord = Shortcuts.run('loopEnd') === true;
      await h.sleep(150);
      out.afterWord = names();
      const pass = out.ranBubble && out.ranWord
        && same(out.afterBubble, ['heading', 'loopEnd', 'paragraph:Décision aujourd’hui'])
        && same(out.afterWord, ['heading', 'loopEnd', 'paragraph:Décision aujourd’hui', 'loopEnd', 'paragraph']);
      return { pass, notes: JSON.stringify(out) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.loopSection = cases;
})();
