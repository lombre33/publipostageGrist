// Suite "varList" - les listes dans les attributs d'une variable (demande d'Antoine du 2026-10-04 : « dans l'interface pour le choix des attributs d'une variable, j'aimerais que l'on trouve
// une UI simple et efficace pour gérer les listes [...] tout afficher et choisir le séparateur (comme les boucles), afficher le n-ième et laisser choisir n, avec premier et dernier déjà
// prêts »). Une colonne Liste de choix (ChoiceList) ou Liste de références (RefList) livre plusieurs valeurs ; la bulle les écrivait toutes, séparées par « , ». Le `format.list` de la bulle
// (js/variable-format.js : pick, index, separator, lastSeparator ; réglé par la fenêtre « Liste » de js/variable-list.js) choisit : toutes (séparateur, séparateur avant la dernière), la première,
// la dernière ou la n-ième. Sans réglage une bulle s'écrit EXACTEMENT comme avant. js/variables.js:formatValue lit la règle pour TOUS les chemins de rendu (Lecture, en-têtes et pieds, aperçu
// commun au PDF, au DOCX et à l'email, export en lot : lignes brutes de fetchTable, boucles) ; les champs texte (Objet, À, Cc, Cci, nom du PDF) n'ont pas de format et gardent la virgule.
(function () {
  const cases = [];

  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const PAGE = 'VlProjets';
  const PEOPLE = 'VlPersonnes';
  // Lignes de la page telles que grist.onRecord les livre : listes décodées, Références déjà montrées par leur colonne d'affichage.
  const RECORD_1 = { id: 1, Titre: 'Alpha', Montant: 1200, Themes: ['Santé', 'Social', 'Culture'], Membres: ['Dupont Jean', 'Martin Anne', 'Durand Paul'], Responsable: 'Dupont Jean' };
  const RECORD_2 = { id: 2, Titre: 'Beta', Montant: 50, Themes: ['Sport'], Membres: ['Martin Anne'], Responsable: 'Martin Anne' };
  const RECORD_3 = { id: 3, Titre: 'Gamma', Montant: 0, Themes: null, Membres: null, Responsable: '' };
  const THEMES = RECORD_1.Themes;

  const attr = (name, value) => ` ${name}="${JSON.stringify(value).replace(/"/g, '&quot;')}"`;
  const badge = (column, format, table) => `<span class="var-badge" data-table="${table || PAGE}" data-column="${column}" data-key="${table || PAGE}.${column}"${format ? attr('data-format', format) : ''}></span>`;
  const list = (pick, extra) => ({ list: Object.assign({ pick }, extra || {}) });
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  async function seed(h) {
    await h.resetEditor();
    const stub = window.__gristStub;
    // Une autre table, liée à la page par sa colonne Référence Responsable : ses colonnes Liste de choix se lisent en « autre table » (une liste par ligne liée).
    stub.setVariables(PEOPLE, { Nom: 'Text', Competences: 'ChoiceList', Langues: 'ChoiceList' });
    stub.setRows(PEOPLE, [
      { id: 1, Nom: 'Dupont Jean', Competences: ['L', 'Droit', 'Fiscal'], Langues: ['L', 'fr', 'en'] },
      { id: 2, Nom: 'Martin Anne', Competences: ['L', 'Social'], Langues: ['L', 'fr'] },
      { id: 3, Nom: 'Durand Paul', Competences: null, Langues: null },
    ]);
    stub.setVariables(PAGE, { Titre: 'Text', Montant: 'Numeric', Themes: 'ChoiceList', Membres: 'RefList:' + PEOPLE, Responsable: 'Ref:' + PEOPLE, gristHelper_Display: 'Any', gristHelper_Display2: 'Text' }, null,
      { Membres: 'gristHelper_Display', Responsable: 'gristHelper_Display2' });
    // Les lignes comme fetchTable les donne (export en lot, aperçu des fenêtres) : ["L", …] pour une liste, l'id des lignes référencées et la colonne d'aide qui porte leurs noms.
    stub.setRows(PAGE, [
      { id: 1, Titre: 'Alpha', Montant: 1200, Themes: ['L', 'Santé', 'Social', 'Culture'], Membres: ['L', 1, 2, 3], Responsable: 1, gristHelper_Display: ['L', 'Dupont Jean', 'Martin Anne', 'Durand Paul'], gristHelper_Display2: 'Dupont Jean' },
      { id: 2, Titre: 'Beta', Montant: 50, Themes: ['L', 'Sport'], Membres: ['L', 2], Responsable: 2, gristHelper_Display: ['L', 'Martin Anne'], gristHelper_Display2: 'Martin Anne' },
      { id: 3, Titre: 'Gamma', Montant: 0, Themes: null, Membres: null, Responsable: 0, gristHelper_Display: null, gristHelper_Display2: '' },
    ]);
    await GristAPI.refreshSchema();
    await GristAPI.deleteLinkRule(PEOPLE);
    await GristAPI.saveLinkRule(PEOPLE, { mode: 'match', colonneCible: 'id', colonneSource: 'Responsable' });
    await GristAPI.refreshSchema();
    stub.fireRecord(Object.assign({}, RECORD_1), PAGE);
    await h.sleep(30);
  }

  async function renderReader(html, record, hf) {
    const reader = document.getElementById('reader-container');
    reader.style.display = 'block';
    await ReaderMode.render(html, PAGE, record, hf || NO_HF);
    return reader;
  }
  const resolvedTexts = reader => Array.from(reader.querySelectorAll('.reader-content .resolved-var')).map(e => e.textContent);

  // --- Le moteur pur : réglages, stockage minimal, texte d'une liste ---
  cases.push({
    id: 'varlist_settings_normalized_and_stored_minimal',
    description: 'VariableFormat : un réglage absent, illisible ou incomplet vaut « toutes, séparées par une virgule » ; le numéro est borné de 1 à 999 ; seules les clés utiles sont enregistrées (le numéro seulement pour « n-ième », les séparateurs seulement pour « toutes »), et rien du tout quand tout est par défaut',
    run: async () => {
      const VF = VariableFormat;
      const defaults = { pick: 'all', index: 1, separator: ', ', lastSeparator: '', perValue: false };
      const checks = {
        defaultsFromNothing: same(VF.normalizeList(undefined), defaults) && same(VF.normalizeList(null), defaults) && same(VF.normalizeList({}), defaults) && same(VF.normalizeList('texte'), defaults),
        garbage: same(VF.normalizeList({ pick: 'deuxième', index: -4, separator: 5, lastSeparator: null, perValue: 'oui' }), defaults),
        indexBounds: [[0, 1], [-3, 1], [2.9, 2], ['3', 3], [99999, 999], [NaN, 1], [undefined, 1], [999, 999]].every(([given, kept]) => VF.normalizeList({ pick: 'nth', index: given }).index === kept),
        kept: same(VF.normalizeList({ pick: 'last', separator: ' / ', lastSeparator: ' et ', perValue: true }), { pick: 'last', index: 1, separator: ' / ', lastSeparator: ' et ', perValue: true }),
        isDefault: VF.isDefaultList(null) && VF.isDefaultList({}) && VF.isDefaultList({ pick: 'all', separator: ', ' }) && VF.isDefaultList({ pick: 'zzz' })
          && !VF.isDefaultList({ pick: 'first' }) && !VF.isDefaultList({ separator: ' / ' }) && !VF.isDefaultList({ lastSeparator: ' et ' }) && !VF.isDefaultList({ perValue: true }),
        storedNothing: VF.storedList(null) === null && VF.storedList({}) === null && VF.storedList({ pick: 'all', separator: ', ', lastSeparator: '' }) === null,
        storedFirst: same(VF.storedList({ pick: 'first', index: 5, separator: ' / ', lastSeparator: ' et ' }), { pick: 'first' }),
        storedLast: same(VF.storedList({ pick: 'last', index: 5 }), { pick: 'last' }),
        storedNth: same(VF.storedList({ pick: 'nth', index: 3, separator: ' / ' }), { pick: 'nth', index: 3 }),
        storedAll: same(VF.storedList({ pick: 'all', separator: ' / ', lastSeparator: ' et ', index: 4 }), { separator: ' / ', lastSeparator: ' et ' })
          && same(VF.storedList({ separator: ' ; ' }), { separator: ' ; ' }) && same(VF.storedList({ lastSeparator: ' et ' }), { lastSeparator: ' et ' }),
        storedPerValue: same(VF.storedList({ perValue: true }), { perValue: true }) && same(VF.storedList({ pick: 'first', perValue: true }), { pick: 'first', perValue: true }),
        styleNone: VF.listStyle(null) === null && VF.listStyle({}) === null && VF.listStyle({ list: null }) === null && VF.listStyle({ list: { pick: 'all' } }) === null && VF.listStyle({ list: { perValue: true } }) === null,
        styleSet: VF.listStyle(list('last')).pick === 'last' && VF.listStyle({ list: { separator: ' / ' } }).separator === ' / ' && VF.listStyle({ list: { lastSeparator: ' et ' } }).lastSeparator === ' et ',
        listTypes: ['ChoiceList', 'RefList:Personnes'].every(t => VF.isListType(t)) && ['Choice', 'Ref:Personnes', 'Text', 'Numeric', 'Attachments', '', null, undefined].every(t => !VF.isListType(t)),
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed }) };
    },
  });

  cases.push({
    id: 'varlist_text_all_with_separators_and_first_last_nth',
    description: 'VariableFormat.listText : « toutes » avec son séparateur et le séparateur avant la dernière (vide : le même), une valeur seule sans séparateur, la première, la dernière, la n-ième (au-delà de la liste : rien), les valeurs vides sautées, une liste vide sans rien ; flattenList met à plat une liste de listes',
    run: async () => {
      const VF = VariableFormat;
      const t = (texts, raw) => VF.listText(texts, raw);
      const checks = {
        allDefault: t(THEMES, { pick: 'all' }) === 'Santé, Social, Culture',
        allSlash: t(THEMES, { separator: ' / ' }) === 'Santé / Social / Culture',
        allWithLast: t(THEMES, { lastSeparator: ' et ' }) === 'Santé, Social et Culture',
        allBoth: t(THEMES, { separator: ' ; ', lastSeparator: ' ou ' }) === 'Santé ; Social ou Culture',
        allTwo: t(['Santé', 'Social'], { lastSeparator: ' et ' }) === 'Santé et Social',
        allTwoNoLast: t(['Santé', 'Social'], { separator: ' / ' }) === 'Santé / Social',
        allOne: t(['Santé'], { separator: ' / ', lastSeparator: ' et ' }) === 'Santé',
        allNone: t([], { separator: ' / ', lastSeparator: ' et ' }) === '',
        first: t(THEMES, { pick: 'first' }) === 'Santé',
        last: t(THEMES, { pick: 'last' }) === 'Culture',
        nth: t(THEMES, { pick: 'nth', index: 2 }) === 'Social' && t(THEMES, { pick: 'nth', index: 1 }) === 'Santé' && t(THEMES, { pick: 'nth', index: 3 }) === 'Culture',
        nthBeyond: t(THEMES, { pick: 'nth', index: 4 }) === '' && t(THEMES, { pick: 'nth', index: 999 }) === '',
        single: t(['Sport'], { pick: 'first' }) === 'Sport' && t(['Sport'], { pick: 'last' }) === 'Sport' && t(['Sport'], { pick: 'nth', index: 1 }) === 'Sport' && t(['Sport'], { pick: 'nth', index: 2 }) === '',
        empty: ['first', 'last', 'nth'].every(pick => t([], { pick, index: 1 }) === ''),
        // Une valeur vide (une cellule sans nom) ne compte ni comme première ni comme dernière, et ne laisse pas de trou entre deux séparateurs.
        skipsEmpty: t(['', 'Santé', null, 'Culture', ''], { pick: 'first' }) === 'Santé' && t(['', 'Santé', null, 'Culture', ''], { pick: 'last' }) === 'Culture'
          && t(['', 'Santé', null, 'Culture', ''], { pick: 'nth', index: 2 }) === 'Culture' && t(['', 'Santé', null, 'Culture'], { lastSeparator: ' et ' }) === 'Santé et Culture',
        flatten: same(VF.flattenList([['a', 'b'], ['c'], 'd', [['e']]]), ['a', 'b', 'c', 'd', 'e']) && same(VF.flattenList('seul'), ['seul']) && same(VF.flattenList([]), []),
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed }) };
    },
  });

  // --- Variables.formatValue : sans réglage rien ne change, avec réglage la liste suit ---
  cases.push({
    id: 'varlist_format_value_without_setting_is_unchanged_and_with_setting_follows_it',
    description: 'formatValue : une liste de choix ou de références sans réglage s’écrit comme avant (toutes les valeurs, « , »), un réglage « tout / par défaut » ou « un document par valeur » aussi ; première, dernière, n-ième, séparateurs et dernier séparateur suivent le réglage ; une cellule vide, une liste vide ou trop courte n’écrivent rien ; une liste de listes est mise à plat ; une valeur seule (le tour d’une boucle) s’écrit telle quelle',
    run: async (h) => {
      await seed(h);
      const fv = (v, f, col) => Variables.formatValue(v, f, PAGE, col || 'Themes');
      const members = RECORD_1.Membres;
      const got = {
        none: fv(THEMES, null), emptyFormat: fv(THEMES, {}), allDefault: fv(THEMES, list('all')), perValueOnly: fv(THEMES, { list: { perValue: true } }), otherFormat: fv(THEMES, { zero: 'show' }),
        refNone: fv(members, null, 'Membres'), refAllDefault: fv(members, list('all'), 'Membres'),
        first: fv(THEMES, list('first')), last: fv(THEMES, list('last')), nth2: fv(THEMES, list('nth', { index: 2 })), nth9: fv(THEMES, list('nth', { index: 9 })),
        slash: fv(THEMES, list('all', { separator: ' / ' })), withLast: fv(THEMES, list('all', { lastSeparator: ' et ' })), both: fv(THEMES, list('all', { separator: ' ; ', lastSeparator: ' ou ' })),
        refFirst: fv(members, list('first'), 'Membres'), refLast: fv(members, list('last'), 'Membres'), refWithLast: fv(members, list('all', { lastSeparator: ' et ' }), 'Membres'),
        nullCell: fv(null, list('first')), emptyList: fv([], list('last')), emptyListDefault: fv([], null), nullDefault: fv(null, null),
        nested: fv([['Santé', 'Social'], ['Culture']], list('last')), nestedAll: fv([['Santé', 'Social'], ['Culture']], list('all', { lastSeparator: ' et ' })), nestedDefault: fv([['Santé', 'Social'], ['Culture']], null),
        scalar: fv('Santé', list('nth', { index: 2 })), scalarLast: fv('Santé', list('last')),
        // Les champs texte (Objet, À, Cc, Cci, nom du PDF) n'ont pas de format : la virgule d'avant.
        subjectLike: Variables.formatValue(THEMES, null, PAGE, 'Themes', { rawNumbers: true }),
      };
      const expected = {
        none: 'Santé, Social, Culture', emptyFormat: 'Santé, Social, Culture', allDefault: 'Santé, Social, Culture', perValueOnly: 'Santé, Social, Culture', otherFormat: 'Santé, Social, Culture',
        refNone: 'Dupont Jean, Martin Anne, Durand Paul', refAllDefault: 'Dupont Jean, Martin Anne, Durand Paul',
        first: 'Santé', last: 'Culture', nth2: 'Social', nth9: '',
        slash: 'Santé / Social / Culture', withLast: 'Santé, Social et Culture', both: 'Santé ; Social ou Culture',
        refFirst: 'Dupont Jean', refLast: 'Durand Paul', refWithLast: 'Dupont Jean, Martin Anne et Durand Paul',
        nullCell: '', emptyList: '', emptyListDefault: '', nullDefault: '',
        nested: 'Culture', nestedAll: 'Santé, Social et Culture', nestedDefault: 'Santé, Social, Culture',
        scalar: 'Santé', scalarLast: 'Santé',
        subjectLike: 'Santé, Social, Culture',
      };
      const wrong = Object.keys(expected).filter(k => got[k] !== expected[k]);
      return { pass: wrong.length === 0, notes: JSON.stringify({ wrong: wrong.map(k => [k, got[k], expected[k]]) }) };
    },
  });

  // --- Lecture : les deux colonnes liste, trois lignes de la page ---
  cases.push({
    id: 'varlist_reading_mode_follows_each_setting_for_each_row',
    description: 'Mode Lecture : sur une liste de choix et une liste de références, la bulle sans réglage écrit toutes les valeurs, les autres écrivent la première, la dernière, la n-ième, ou toutes avec un séparateur et « et » avant la dernière ; une ligne à une seule valeur, une ligne sans valeur et une n-ième absente se lisent sans séparateur ni texte parasite ; le texte autour de la bulle reste en place',
    run: async (h) => {
      await seed(h);
      const variants = [null, list('first'), list('last'), list('nth', { index: 2 }), list('all', { separator: ' / ', lastSeparator: ' et ' }), list('nth', { index: 5 })];
      const html = column => `<p>${variants.map(f => `[${badge(column, f)}]`).join(' ')}</p>`;
      const read = async (column, record) => {
        const reader = await renderReader(html(column), record);
        return { texts: resolvedTexts(reader), line: reader.querySelector('.reader-content p').textContent.replace(/\s+/g, ' ').trim() };
      };
      const t1 = await read('Themes', RECORD_1);
      const t2 = await read('Themes', RECORD_2);
      const t3 = await read('Themes', RECORD_3);
      const m1 = await read('Membres', RECORD_1);
      const m2 = await read('Membres', RECORD_2);
      const expected = {
        t1: ['Santé, Social, Culture', 'Santé', 'Culture', 'Social', 'Santé / Social et Culture', ''],
        t2: ['Sport', 'Sport', 'Sport', '', 'Sport', ''],
        t3: ['', '', '', '', '', ''],
        m1: ['Dupont Jean, Martin Anne, Durand Paul', 'Dupont Jean', 'Durand Paul', 'Martin Anne', 'Dupont Jean / Martin Anne et Durand Paul', ''],
        m2: ['Martin Anne', 'Martin Anne', 'Martin Anne', '', 'Martin Anne', ''],
      };
      const got = { t1: t1.texts, t2: t2.texts, t3: t3.texts, m1: m1.texts, m2: m2.texts };
      const wrong = Object.keys(expected).filter(k => !same(got[k], expected[k]));
      const line = t1.line === '[Santé, Social, Culture] [Santé] [Culture] [Social] [Santé / Social et Culture] []';
      return { pass: wrong.length === 0 && line, notes: JSON.stringify({ wrong: wrong.map(k => [k, got[k], expected[k]]), line: t1.line }) };
    },
  });

  // --- Export en lot : les lignes brutes de fetchTable ---
  cases.push({
    id: 'varlist_batch_raw_rows_follow_the_setting_like_the_current_row',
    description: 'Export en lot (lignes lues par fetchTable : ["L", …], id des lignes référencées, colonne d’aide pour les noms) : mêmes valeurs qu’en Lecture pour une liste de choix et une liste de références, sans réglage comme avec ; une ligne sans valeur n’écrit rien',
    run: async (h) => {
      await seed(h);
      const rows = await GristAPI.fetchTableRows(PAGE);
      const rowOf = id => rows.find(r => r.id === id);
      const rv = (column, id, format) => Variables.resolveVariable(PAGE, column, PAGE, rowOf(id), format);
      const rawOk = GristAPI.isRawRow(rowOf(1));
      const got = {
        themesDefault: await rv('Themes', 1, null), themesLast: await rv('Themes', 1, list('last')), themesNth: await rv('Themes', 1, list('nth', { index: 2 })),
        themesWithLast: await rv('Themes', 1, list('all', { lastSeparator: ' et ' })), themesOne: await rv('Themes', 2, list('first')), themesEmpty: await rv('Themes', 3, list('first')), themesEmptyDefault: await rv('Themes', 3, null),
        membersDefault: await rv('Membres', 1, null), membersFirst: await rv('Membres', 1, list('first')), membersLast: await rv('Membres', 1, list('last')),
        membersSlash: await rv('Membres', 1, list('all', { separator: ' / ' })), membersEmpty: await rv('Membres', 3, list('last')),
      };
      const expected = {
        themesDefault: 'Santé, Social, Culture', themesLast: 'Culture', themesNth: 'Social', themesWithLast: 'Santé, Social et Culture', themesOne: 'Sport', themesEmpty: '', themesEmptyDefault: '',
        membersDefault: 'Dupont Jean, Martin Anne, Durand Paul', membersFirst: 'Dupont Jean', membersLast: 'Durand Paul', membersSlash: 'Dupont Jean / Martin Anne / Durand Paul', membersEmpty: '',
      };
      const wrong = Object.keys(expected).filter(k => got[k] !== expected[k]);
      return { pass: rawOk && wrong.length === 0, notes: JSON.stringify({ rawOk, wrong: wrong.map(k => [k, got[k], expected[k]]) }) };
    },
  });

  // --- Le réglage vit dans la bulle : il survit à l'enregistrement du modèle ---
  cases.push({
    id: 'varlist_setting_survives_the_html_round_trip',
    description: 'Le réglage d’une bulle liste (data-format, clé « list ») survit à l’aller-retour HTML, avec ses séparateurs (espaces comprises) ; une bulle sans réglage n’a pas de data-format',
    run: async (h) => {
      await seed(h);
      const setting = { list: { separator: ' / ', lastSeparator: ' et ' } };
      const nth = { list: { pick: 'nth', index: 3 } };
      Editor.setHTML(`<p>${badge('Themes', setting)} ${badge('Membres', nth)} ${badge('Titre')}</p>`);
      const ed = EditorCore.getEditor();
      const formats = [];
      ed.state.doc.descendants(n => { if (n.type.name === 'varBadge') formats.push(n.attrs.format); });
      const html = Editor.getHTML();
      const box = document.createElement('div');
      box.innerHTML = html;
      const spans = Array.from(box.querySelectorAll('span.var-badge'));
      const serialized = spans.map(s => s.getAttribute('data-format'));
      Editor.setHTML(html);
      const again = [];
      ed.state.doc.descendants(n => { if (n.type.name === 'varBadge') again.push(n.attrs.format); });
      const pass = same(formats, [setting, nth, null]) && same(again, [setting, nth, null]) && same(JSON.parse(serialized[0]), setting) && same(JSON.parse(serialized[1]), nth) && serialized[2] === null;
      return { pass, notes: JSON.stringify({ formats, serialized, again }) };
    },
  });


  // --- Lecture, autre table : la liste de choix d'une table liée (une liste par ligne liée) ---
  cases.push({
    id: 'varlist_reading_mode_list_column_of_a_linked_table',
    description: 'Mode Lecture : une colonne Liste de choix d’une AUTRE table, lue par la règle de liaison (une liste par ligne liée), suit le réglage comme celle de la page - sans réglage « , », dernière, séparateur - et une ligne de la page sans ligne liée n’écrit rien',
    run: async (h) => {
      await seed(h);
      const html = `<p>${[null, list('last'), list('first'), list('all', { separator: ' / ' })].map(f => `[${badge('Competences', f, PEOPLE)}]`).join(' ')}</p>`;
      const one = resolvedTexts(await renderReader(html, RECORD_1));
      const two = resolvedTexts(await renderReader(html, RECORD_2));
      const none = resolvedTexts(await renderReader(html, RECORD_3));
      const expected = { one: ['Droit, Fiscal', 'Fiscal', 'Droit', 'Droit / Fiscal'], two: ['Social', 'Social', 'Social', 'Social'], none: ['', '', '', ''] };
      const got = { one, two, none };
      const wrong = Object.keys(expected).filter(k => !same(got[k], expected[k]));
      return { pass: wrong.length === 0, notes: JSON.stringify({ wrong: wrong.map(k => [k, got[k], expected[k]]) }) };
    },
  });

  // === La barre flottante et la fenêtre « Liste » ===
  const ed = () => EditorCore.getEditor();
  function badgeNodes() {
    const out = [];
    ed().state.doc.descendants((node, pos) => { if (node.type.name === 'varBadge') out.push({ node, pos }); });
    return out;
  }
  const formatOf = column => { const found = badgeNodes().find(b => b.node.attrs.column === column); return found ? found.node.attrs.format : 'absente'; };
  // Sélection de la bulle comme un clic : .focus() DOM direct puis NodeSelection.
  async function selectBadge(h, column) {
    document.querySelector('.tiptap').focus();
    const found = badgeNodes().find(b => b.node.attrs.column === column);
    if (!found) return false;
    ed().commands.setNodeSelection(found.pos);
    await h.sleep(150);
    return true;
  }
  async function selectNode(h, typeName) {
    document.querySelector('.tiptap').focus();
    let pos = -1;
    ed().state.doc.descendants((node, p) => { if (pos === -1 && node.type.name === typeName) pos = p; });
    if (pos === -1) return false;
    ed().commands.setNodeSelection(pos);
    await h.sleep(150);
    return true;
  }
  const toolbar = () => document.querySelector('.v2-varfmt-toolbar');
  const listButton = () => toolbar().querySelector('button[data-action="var-list"]');
  // Le panneau flottant réagit au mousedown (js/editor-core.js:createFloatingPanel), comme au vrai clic.
  const press = button => button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  const buttonState = () => {
    const b = listButton();
    return { visible: toolbar().classList.contains('visible'), disabled: b.getAttribute('aria-disabled') === 'true' && b.classList.contains('is-disabled'), enabled: b.getAttribute('aria-disabled') === 'false' && !b.classList.contains('is-disabled'), active: b.classList.contains('is-active'), title: b.title, aria: b.getAttribute('aria-label') };
  };
  const modal = () => document.getElementById('var-list-modal');
  const shown = () => !!modal() && modal().style.display !== 'none' && modal().getClientRects().length > 0;
  const fields = () => {
    const m = modal();
    return {
      title: m.querySelector('#var-list-title').textContent,
      intro: m.querySelector('.var-modal-intro').textContent,
      picks: Array.from(m.querySelectorAll('.var-loop-seg button')).map(b => [b.dataset.pick, b.textContent, b.getAttribute('aria-pressed')]),
      sepRow: !m.querySelector('.var-list-seps').hidden,
      numRow: !m.querySelector('.var-list-number').hidden,
      sepLabel: m.querySelector('label[for="var-list-sep"]').textContent, lastLabel: m.querySelector('label[for="var-list-last"]').textContent, numberLabel: m.querySelector('label[for="var-list-index"]').textContent,
      placeholder: m.querySelector('#var-list-last').placeholder,
      hints: Array.from(m.querySelectorAll('.var-loop-hint')).map(e => e.textContent),
      sep: m.querySelector('#var-list-sep').value, last: m.querySelector('#var-list-last').value, index: m.querySelector('#var-list-index').value,
      reset: !m.querySelector('.var-modal-danger').hidden, resetText: m.querySelector('.var-modal-danger').textContent,
      cancelText: m.querySelector('.var-modal-actions button:not(.var-modal-danger):not(.var-modal-primary)').textContent, saveText: m.querySelector('.var-modal-primary').textContent,
      preview: m.querySelector('.var-condition-debug-line').textContent,
      splitLabel: m.querySelector('label[for="var-list-split"]').textContent, splitChecked: m.querySelector('#var-list-split').checked,
    };
  };
  const pickButton = pick => modal().querySelector(`.var-loop-seg button[data-pick="${pick}"]`);
  function typeIn(selector, value) {
    const input = modal().querySelector(selector);
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  const saveButton = () => modal().querySelector('.var-modal-primary');
  const cancelButton = () => modal().querySelector('.var-modal-actions button:not(.var-modal-danger):not(.var-modal-primary)');
  const resetButton = () => modal().querySelector('.var-modal-danger');
  async function openList(h, column) {
    if (!(await selectBadge(h, column))) return false;
    press(listButton());
    await h.sleep(300);
    return shown();
  }

  cases.push({
    id: 'varlist_toolbar_button_enabled_active_and_greyed_with_reasons',
    description: 'Barre d’une bulle : le bouton « Liste » se place entre « Boucle » et « Colonne », actif pour une colonne Liste de choix ou Liste de références, bleu quand un réglage s’écarte du défaut, grisé (jamais retiré, raison en info-bulle) pour un texte, une liste en boucle, un calcul, un bloc de texte, une valeur et une case conditionnelle ; un clic sur le bouton grisé n’ouvre rien',
    run: async (h) => {
      await seed(h);
      const loop = { repeat: 'inline', table: PEOPLE, via: { table: PAGE, column: 'Membres' }, separator: ', ', lastSeparator: ' et ' };
      Editor.setHTML(`<p>${badge('Themes')} ${badge('Membres', list('first'))} ${badge('Titre')} ${badge('Competences', null, PEOPLE)} ${badge('Montant')}</p>`);
      const got = {};
      await selectBadge(h, 'Themes');
      const order = Array.from(toolbar().querySelectorAll('.v2-varbadge-actions button')).map(b => b.getAttribute('data-action'));
      got.choice = buttonState();
      got.icon = !!listButton().querySelector('svg');
      await selectBadge(h, 'Membres');
      got.refSet = buttonState();
      await selectBadge(h, 'Competences');
      got.linkedChoice = buttonState();
      await selectBadge(h, 'Titre');
      got.text = buttonState();
      press(listButton());
      await h.sleep(150);
      got.textClickOpens = shown() || VariableList.isOpen();
      await selectBadge(h, 'Montant');
      got.number = buttonState();
      // Une liste de références en boucle : la bulle ne porte plus qu'une valeur à chaque tour, le réglage de liste ne servirait à rien.
      Editor.setHTML(`<p>${badge('Membres', { list: { pick: 'last' } })}</p>`);
      let pos = badgeNodes()[0].pos;
      ed().chain().command(({ tr }) => { tr.setNodeMarkup(pos, undefined, Object.assign({}, badgeNodes()[0].node.attrs, { loop })); return true; }).run();
      await selectBadge(h, 'Membres');
      got.inLoop = buttonState();
      press(listButton());
      await h.sleep(150);
      got.loopClickOpens = shown() || VariableList.isOpen();
      // Un calcul, un bloc de texte, une valeur conditionnelle, une case conditionnelle : même barre, bouton grisé avec leur raison.
      Editor.setHTML('<p><span class="calc-badge" data-formula="1+1"></span></p>');
      await selectNode(h, 'calcBadge');
      got.calc = buttonState();
      Editor.setHTML('<div class="conditional-text"><p>Texte</p></div>');
      await selectNode(h, 'conditionalText');
      got.block = buttonState();
      Editor.setHTML('<p>Avant <span class="conditional-value">dedans</span> après</p>');
      let valuePos = -1;
      ed().state.doc.descendants((node, p) => { if (valuePos === -1 && node.type.name === 'conditionalValue') valuePos = p; });
      document.querySelector('.tiptap').focus();
      ed().commands.setTextSelection(valuePos + 2);
      await h.sleep(150);
      got.value = buttonState();
      Editor.setHTML('<p>Avant <span class="conditional-checkbox">☐</span> après</p>');
      await selectNode(h, 'conditionalCheckbox');
      got.checkbox = buttonState();
      // De retour sur une variable : le bouton reprend son état de variable.
      Editor.setHTML(`<p>${badge('Themes')}</p>`);
      await selectBadge(h, 'Themes');
      got.back = buttonState();
      const T = key => I18n.t(key);
      const checks = {
        order: JSON.stringify(order) === JSON.stringify(['calc-edit', 'var-condition', 'var-linked', 'var-loop', 'var-list', 'var-column']),
        choiceEnabled: got.choice.visible && got.choice.enabled && !got.choice.active && got.choice.title === 'Liste : quelles valeurs écrire' && got.choice.aria === got.choice.title && got.icon,
        refSetActive: got.refSet.visible && got.refSet.enabled && got.refSet.active,
        linkedChoiceEnabled: got.linkedChoice.visible && got.linkedChoice.enabled && !got.linkedChoice.active,
        textGreyed: got.text.visible && got.text.disabled && !got.text.active && got.text.title === 'Disponible pour une colonne Liste de choix ou Liste de références' && got.text.aria === got.text.title && !got.textClickOpens,
        numberGreyed: got.number.visible && got.number.disabled && got.number.title === T('varToolbar.listDisabled'),
        loopGreyed: got.inLoop.visible && got.inLoop.disabled && !got.inLoop.active && got.inLoop.title === T('varToolbar.listLoop') && !got.loopClickOpens,
        calcGreyed: got.calc.visible && got.calc.disabled && got.calc.title === T('varToolbar.notForCalc'),
        blockGreyed: got.block.visible && got.block.disabled && got.block.title === T('varToolbar.listBlock'),
        valueGreyed: got.value.visible && got.value.disabled && got.value.title === T('varToolbar.notForValue'),
        checkboxGreyed: got.checkbox.visible && got.checkbox.disabled && got.checkbox.title === T('varToolbar.listCheckbox'),
        backToVariable: got.back.visible && got.back.enabled && !got.back.active && got.back.title === 'Liste : quelles valeurs écrire',
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, order, got }) };
    },
  });

  cases.push({
    id: 'varlist_window_choices_preview_save_reset_cancel_and_escape',
    description: 'Fenêtre « Liste » : ouverte par le bouton (barre masquée tant qu’elle l’est), « Toutes les valeurs » enfoncé avec « , » et l’aperçu de la ligne sélectionnée ; première, dernière, n-ième et séparateurs changent l’aperçu à vue (numéro borné de 1 à 999, « pas de valeur n° 5 ») ; Enregistrer écrit le réglage minimal dans la bulle (la barre revient, bouton bleu, Lecture), la rouvrir montre le réglage, « Remettre par défaut » retire tout (plus de data-format) ; Annuler, Échap et Enregistrer sans changement ne touchent à rien',
    run: async (h) => {
      await seed(h);
      Editor.setHTML(`<p>Thèmes : ${badge('Themes')}</p>`);
      const got = {};
      got.opened = await openList(h, 'Themes');
      got.barHidden = !toolbar().classList.contains('visible');
      got.initial = fields();
      pickButton('first').click();
      await h.sleep(120);
      got.first = fields();
      pickButton('last').click();
      await h.sleep(120);
      got.last = fields();
      pickButton('nth').click();
      await h.sleep(120);
      got.nthOpen = fields();
      typeIn('#var-list-index', '2');
      await h.sleep(400);
      got.nth2 = fields();
      typeIn('#var-list-index', '5');
      await h.sleep(400);
      got.nth5 = fields();
      typeIn('#var-list-index', '');
      await h.sleep(400);
      got.nthEmpty = fields();
      modal().querySelector('#var-list-index').dispatchEvent(new Event('change', { bubbles: true }));
      await h.sleep(60);
      got.nthEmptyAfterChange = modal().querySelector('#var-list-index').value;
      typeIn('#var-list-index', '0');
      modal().querySelector('#var-list-index').dispatchEvent(new Event('change', { bubbles: true }));
      got.nthZero = modal().querySelector('#var-list-index').value;
      typeIn('#var-list-index', '5000');
      modal().querySelector('#var-list-index').dispatchEvent(new Event('change', { bubbles: true }));
      got.nthHuge = modal().querySelector('#var-list-index').value;
      typeIn('#var-list-index', '3');
      pickButton('all').click();
      await h.sleep(120);
      typeIn('#var-list-sep', ' / ');
      typeIn('#var-list-last', ' et ');
      await h.sleep(400);
      got.all = fields();
      saveButton().click();
      await h.sleep(250);
      got.saved = { closed: !shown(), open: VariableList.isOpen(), format: formatOf('Themes'), bar: buttonState(), focus: document.querySelector('.tiptap').contains(document.activeElement) };
      const reader = await renderReader(Editor.getHTML(), RECORD_1);
      got.reading = resolvedTexts(reader);
      const box = document.createElement('div');
      box.innerHTML = Editor.getHTML();
      got.serialized = box.querySelector('span.var-badge').getAttribute('data-format');
      // Rouverte : le réglage enregistré, et « Remettre par défaut » proposé.
      got.reopened = (await openList(h, 'Themes')) ? fields() : null;
      resetButton().click();
      await h.sleep(250);
      got.reset = { closed: !shown(), format: formatOf('Themes'), bar: buttonState() };
      box.innerHTML = Editor.getHTML();
      got.resetSerialized = box.querySelector('span.var-badge').hasAttribute('data-format');
      // n-ième enregistrée : seul le numéro est gardé.
      await openList(h, 'Themes');
      pickButton('nth').click();
      typeIn('#var-list-index', '3');
      saveButton().click();
      await h.sleep(250);
      got.nthSaved = { format: formatOf('Themes'), reading: resolvedTexts(await renderReader(Editor.getHTML(), RECORD_1)) };
      // Annuler et Échap : rien ne change.
      await openList(h, 'Themes');
      pickButton('last').click();
      cancelButton().click();
      await h.sleep(200);
      got.cancelled = { closed: !shown(), format: formatOf('Themes') };
      await openList(h, 'Themes');
      pickButton('first').click();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await h.sleep(200);
      got.escaped = { closed: !shown(), format: formatOf('Themes') };
      // Enregistrer sans rien changer : aucune transaction, le document est le même objet.
      await openList(h, 'Themes');
      const docBefore = ed().state.doc;
      saveButton().click();
      await h.sleep(200);
      got.noChange = { closed: !shown(), sameDoc: ed().state.doc === docBefore, format: formatOf('Themes') };
      const prev = 'Ligne sélectionnée (n° 1) : 3 valeurs (Santé, Social, Culture). Le document écrit « ';
      const checks = {
        opened: got.opened && got.barHidden,
        initial: got.initial.title === 'Liste' && got.initial.intro === '#VlProjets.Themes contient plusieurs choix. Réglez ce que le document en écrit.'
          && same(got.initial.picks, [['all', 'Toutes les valeurs', 'true'], ['first', 'La première', 'false'], ['last', 'La dernière', 'false'], ['nth', 'La n-ième', 'false']])
          && got.initial.sepRow && !got.initial.numRow && got.initial.sep === ', ' && got.initial.last === '' && got.initial.index === '1' && !got.initial.reset
          && got.initial.sepLabel === 'Séparateur' && got.initial.lastLabel === 'Avant la dernière' && got.initial.numberLabel === 'Numéro' && got.initial.placeholder === 'comme le séparateur'
          && got.initial.cancelText === 'Annuler' && got.initial.saveText === 'Enregistrer' && got.initial.preview === prev + 'Santé, Social, Culture ».',
        first: got.first.picks[1][2] === 'true' && got.first.picks[0][2] === 'false' && !got.first.sepRow && !got.first.numRow && got.first.preview === prev + 'Santé ».',
        last: got.last.picks[2][2] === 'true' && !got.last.sepRow && !got.last.numRow && got.last.preview === prev + 'Culture ».',
        nthOpen: got.nthOpen.picks[3][2] === 'true' && got.nthOpen.numRow && !got.nthOpen.sepRow && got.nthOpen.index === '1',
        nth2: got.nth2.preview === prev + 'Social ».',
        nth5: got.nth5.preview === 'Ligne sélectionnée (n° 1) : 3 valeurs (Santé, Social, Culture), mais pas de valeur n° 5 : le document n’écrit rien.',
        nthEmpty: got.nthEmpty.preview === prev + 'Santé ».' && got.nthEmptyAfterChange === '1',
        nthBounds: got.nthZero === '1' && got.nthHuge === '999',
        all: got.all.picks[0][2] === 'true' && got.all.sepRow && !got.all.numRow && got.all.sep === ' / ' && got.all.last === ' et ' && got.all.preview === prev + 'Santé / Social et Culture ».',
        saved: got.saved.closed && !got.saved.open && same(got.saved.format, { list: { separator: ' / ', lastSeparator: ' et ' } }) && got.saved.bar.visible && got.saved.bar.active && got.saved.bar.enabled && got.saved.focus,
        reading: same(got.reading, ['Santé / Social et Culture']) && !!got.serialized && same(JSON.parse(got.serialized), { list: { separator: ' / ', lastSeparator: ' et ' } }),
        reopened: !!got.reopened && got.reopened.picks[0][2] === 'true' && got.reopened.sep === ' / ' && got.reopened.last === ' et ' && got.reopened.reset && got.reopened.resetText === 'Remettre par défaut'
          && got.reopened.preview === prev + 'Santé / Social et Culture ».',
        reset: got.reset.closed && got.reset.format === null && !got.resetSerialized && got.reset.bar.visible && !got.reset.bar.active,
        nthSaved: same(got.nthSaved.format, { list: { pick: 'nth', index: 3 } }) && same(got.nthSaved.reading, ['Culture']),
        cancelled: got.cancelled.closed && same(got.cancelled.format, { list: { pick: 'nth', index: 3 } }),
        escaped: got.escaped.closed && same(got.escaped.format, { list: { pick: 'nth', index: 3 } }),
        noChange: got.noChange.closed && got.noChange.sameDoc && same(got.noChange.format, { list: { pick: 'nth', index: 3 } }),
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, got }) };
    },
  });

  cases.push({
    id: 'varlist_window_keeps_the_other_format_keys_and_works_for_references',
    description: 'Fenêtre « Liste » : les autres clés du format de la bulle restent quand le réglage change ou est remis par défaut (la bulle garde alors son format) ; une liste de références dit « contient plusieurs lignes de « table » » et se règle de la même façon (première, dernière)',
    run: async (h) => {
      await seed(h);
      Editor.setHTML(`<p>${badge('Themes', { zero: 'show', list: { pick: 'first' } })} ${badge('Membres')}</p>`);
      const got = {};
      await openList(h, 'Themes');
      got.themesOpen = fields();
      pickButton('last').click();
      saveButton().click();
      await h.sleep(250);
      got.themesLast = formatOf('Themes');
      await openList(h, 'Themes');
      resetButton().click();
      await h.sleep(250);
      got.themesReset = formatOf('Themes');
      await openList(h, 'Membres');
      got.refOpen = fields();
      pickButton('last').click();
      await h.sleep(150);
      got.refLast = fields();
      saveButton().click();
      await h.sleep(250);
      got.refSaved = { format: formatOf('Membres'), reading: resolvedTexts(await renderReader(`<p>${badge('Membres', formatOf('Membres'))}</p>`, RECORD_1)) };
      const checks = {
        themesOpen: got.themesOpen.picks[1][2] === 'true' && got.themesOpen.reset,
        themesLast: same(got.themesLast, { zero: 'show', list: { pick: 'last' } }),
        themesReset: same(got.themesReset, { zero: 'show' }),
        refIntro: got.refOpen.intro === '#VlProjets.Membres contient plusieurs lignes de « VlPersonnes ». Réglez ce que le document en écrit.' && got.refOpen.picks[0][2] === 'true'
          && got.refOpen.preview === 'Ligne sélectionnée (n° 1) : 3 valeurs (Dupont Jean, Martin Anne, Durand Paul). Le document écrit « Dupont Jean, Martin Anne, Durand Paul ».',
        refLast: got.refLast.preview === 'Ligne sélectionnée (n° 1) : 3 valeurs (Dupont Jean, Martin Anne, Durand Paul). Le document écrit « Durand Paul ».',
        refSaved: same(got.refSaved.format, { list: { pick: 'last' } }) && same(got.refSaved.reading, ['Durand Paul']),
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, got }) };
    },
  });

  cases.push({
    id: 'varlist_window_texts_in_english_and_empty_or_missing_values',
    description: 'Fenêtre « Liste » en anglais (titre, introduction, choix, séparateurs, numéro, aperçu, boutons, info-bulles de la barre) puis, en français, l’aperçu d’une ligne à liste vide (« la liste est vide ») et d’une page sans ligne sélectionnée',
    run: async (h) => {
      await seed(h);
      Editor.setHTML(`<p>${badge('Themes', { list: { pick: 'last' } })} ${badge('Titre')}</p>`);
      const got = {};
      const lang = I18n.getLang();
      try {
        I18n.setLang('en');
        await h.sleep(100);
        got.enBar = (await selectBadge(h, 'Themes'), buttonState());
        await selectBadge(h, 'Titre');
        got.enBarText = buttonState();
        got.enOpen = (await openList(h, 'Themes')) ? fields() : null;
        cancelButton().click();
        await h.sleep(150);
      } finally {
        I18n.setLang(lang);
      }
      await h.sleep(100);
      // Ligne sans valeur : liste vide. Puis aucune ligne sélectionnée.
      window.__gristStub.fireRecord(Object.assign({}, RECORD_3), PAGE);
      await h.sleep(60);
      got.emptyRow = (await openList(h, 'Themes')) ? fields().preview : null;
      cancelButton().click();
      await h.sleep(150);
      const gone = GristAPI.getCurrentRecord;
      GristAPI.getCurrentRecord = () => null;
      try {
        got.noRecord = (await openList(h, 'Themes')) ? fields().preview : null;
        cancelButton().click();
        await h.sleep(150);
      } finally {
        GristAPI.getCurrentRecord = gone;
      }
      const en = got.enOpen;
      const checks = {
        enBar: got.enBar.enabled && got.enBar.active && got.enBar.title === 'List: which values to write' && got.enBarText.disabled && got.enBarText.title === 'Available for a Choice List or Reference List column',
        enWindow: !!en && en.title === 'List' && en.intro === '#VlProjets.Themes holds several choices. Set what the document writes from it.'
          && same(en.picks.map(p => p[1]), ['All values', 'The first', 'The last', 'The nth']) && en.picks[2][2] === 'true'
          && en.sepLabel === 'Separator' && en.lastLabel === 'Before the last' && en.numberLabel === 'Number' && en.placeholder === 'same as separator'
          && same(en.hints, ['spaces included', '1 = the first value. With no value at that position, nothing is written.',
            'PDF, Word and Excel exports only.'])
          && en.splitLabel === 'One document per value' && !en.splitChecked
          && en.resetText === 'Reset to default' && en.cancelText === 'Cancel' && en.saveText === 'Save'
          && en.preview === 'Selected row (#1): 3 values (Santé, Social, Culture). The document writes “Culture”.',
        emptyRow: got.emptyRow === 'Ligne sélectionnée (n° 3) : la liste est vide, le document n’écrit rien.',
        noRecord: got.noRecord === 'Aucune ligne sélectionnée dans Grist : sélectionnez-en une pour voir l’aperçu.',
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, got }) };
    },
  });

  // --- « Un document par valeur » : la case de la fenêtre et l'icône de la bulle ---
  cases.push({
    id: 'varlist_window_one_document_per_value_checkbox_preview_save_and_reset',
    description: 'Fenêtre « Liste » : la case « Un document par valeur » (décochée au départ, son indication à côté) ajoute une seconde ligne d’aperçu - « 3 documents, un par valeur », « un seul document » pour une ligne à une seule valeur ou à liste vide - sans toucher à la première ; elle va avec n’importe quel choix (« La première »…) ; Enregistrer l’écrit dans le format de la bulle (perValue, le reste du réglage gardé), la barre est bleue même sans autre réglage, la Lecture écrit toujours la liste comme réglée, la fenêtre rouverte la montre cochée, la décocher retire la clé et « Remettre par défaut » tout',
    run: async (h) => {
      await seed(h);
      Editor.setHTML(`<p>${badge('Themes')} ${badge('Titre')}</p>`);
      const got = {};
      const box = () => modal().querySelector('#var-list-split');
      const splitLine = () => { const line = modal().querySelectorAll('.var-condition-debug-line')[1]; return { text: line.textContent, hidden: line.hidden }; };
      const tick = async on => { box().checked = on; box().dispatchEvent(new Event('change', { bubbles: true })); await h.sleep(400); };
      got.opened = await openList(h, 'Themes');
      got.initial = { checked: box().checked, label: fields().splitLabel, hint: modal().querySelector('.var-list-split .var-loop-hint').textContent, line: splitLine(), first: fields().preview };
      await tick(true);
      got.ticked = { line: splitLine(), first: fields().preview };
      pickButton('first').click();
      await h.sleep(300);
      got.withFirst = { checked: box().checked, line: splitLine(), first: fields().preview };
      saveButton().click();
      await h.sleep(250);
      got.saved = { format: formatOf('Themes'), bar: buttonState() };
      got.reading = resolvedTexts(await renderReader(Editor.getHTML(), RECORD_1));
      const serialized = document.createElement('div');
      serialized.innerHTML = Editor.getHTML();
      got.serialized = JSON.parse(serialized.querySelector('span.var-badge').getAttribute('data-format'));
      got.reopened = (await openList(h, 'Themes')) ? { checked: box().checked, reset: !modal().querySelector('.var-modal-danger').hidden, line: splitLine() } : null;
      await tick(false);
      got.unticked = splitLine();
      saveButton().click();
      await h.sleep(250);
      got.afterUntick = formatOf('Themes');
      // Cochée seule, avec « Toutes les valeurs » : un réglage à elle seule.
      await openList(h, 'Themes');
      pickButton('all').click();
      await tick(true);
      saveButton().click();
      await h.sleep(250);
      got.onlyPerValue = { format: formatOf('Themes'), bar: buttonState() };
      await openList(h, 'Themes');
      resetButton().click();
      await h.sleep(250);
      got.reset = { format: formatOf('Themes'), bar: buttonState() };
      // Annuler après avoir coché : rien n'est écrit.
      await openList(h, 'Themes');
      await tick(true);
      cancelButton().click();
      await h.sleep(200);
      got.cancelled = formatOf('Themes');
      // Une ligne à une seule valeur, puis une liste vide : un seul document.
      window.__gristStub.fireRecord(Object.assign({}, RECORD_2), PAGE);
      await h.sleep(60);
      await openList(h, 'Themes');
      await tick(true);
      got.oneValue = splitLine();
      cancelButton().click();
      await h.sleep(150);
      window.__gristStub.fireRecord(Object.assign({}, RECORD_3), PAGE);
      await h.sleep(60);
      await openList(h, 'Themes');
      await tick(true);
      got.emptyList = { line: splitLine(), first: fields().preview };
      cancelButton().click();
      await h.sleep(150);
      const prev = 'Ligne sélectionnée (n° 1) : 3 valeurs (Santé, Social, Culture). Le document écrit « ';
      const export3 = 'Export : 3 documents, un par valeur (Santé, Social, Culture).';
      const checks = {
        opened: got.opened,
        initial: !got.initial.checked && got.initial.label === 'Un document par valeur' && got.initial.line.hidden && got.initial.line.text === '' && got.initial.first === prev + 'Santé, Social, Culture ».'
          && got.initial.hint === 'Exports PDF, Word et Excel seulement.',
        ticked: !got.ticked.line.hidden && got.ticked.line.text === export3 && got.ticked.first === prev + 'Santé, Social, Culture ».',
        withFirst: got.withFirst.checked && !got.withFirst.line.hidden && got.withFirst.line.text === export3 && got.withFirst.first === prev + 'Santé ».',
        saved: same(got.saved.format, { list: { pick: 'first', perValue: true } }) && got.saved.bar.active && got.saved.bar.enabled && same(got.serialized, { list: { pick: 'first', perValue: true } }),
        readingUnchanged: same(got.reading, ['Santé', 'Alpha']),
        reopened: !!got.reopened && got.reopened.checked && got.reopened.reset && !got.reopened.line.hidden && got.reopened.line.text === export3,
        unticked: got.unticked.hidden && got.unticked.text === '' && same(got.afterUntick, { list: { pick: 'first' } }),
        onlyPerValue: same(got.onlyPerValue.format, { list: { perValue: true } }) && got.onlyPerValue.bar.active && got.onlyPerValue.bar.enabled,
        reset: got.reset.format === null && !got.reset.bar.active,
        cancelled: got.cancelled === null,
        oneValue: !got.oneValue.hidden && got.oneValue.text === 'Export : un seul document, cette ligne n’a qu’une valeur.',
        emptyList: !got.emptyList.line.hidden && got.emptyList.line.text === 'Export : un seul document, la liste de cette ligne est vide.' && got.emptyList.first === 'Ligne sélectionnée (n° 3) : la liste est vide, le document n’écrit rien.',
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, got }) };
    },
  });

  cases.push({
    id: 'varlist_split_bubble_shows_a_small_icon_in_the_editor_except_in_a_loop',
    description: 'Éditeur : une bulle réglée « Un document par valeur » porte une petite icône à droite (marge et image de fond de css/variable-list.css, le point bleu des bulles réglées gardé en ::after) ; une bulle sans ce réglage non, une bulle en boucle « dans la phrase » non plus (le réglage n’y servirait à rien)',
    run: async (h) => {
      await seed(h);
      const loop = { repeat: 'inline', table: PEOPLE, via: { table: PAGE, column: 'Membres' }, separator: ', ', lastSeparator: ' et ' };
      Editor.setHTML(`<p>${badge('Themes', { list: { perValue: true } })} ${badge('Titre')} ${badge('Membres', { list: { pick: 'last' } })} ${badge('Responsable', { list: { perValue: true } })}</p>`);
      const loopNode = badgeNodes().find(b => b.node.attrs.column === 'Responsable');
      ed().chain().command(({ tr }) => { tr.setNodeMarkup(loopNode.pos, undefined, Object.assign({}, loopNode.node.attrs, { loop })); return true; }).run();
      await h.sleep(150);
      const look = column => {
        const el = Array.from(document.querySelectorAll('.tiptap .var-badge')).find(e => e.getAttribute('data-column') === column);
        const style = getComputedStyle(el);
        return { padding: style.paddingRight, image: style.backgroundImage, dot: getComputedStyle(el, '::after').content };
      };
      const got = { perValue: look('Themes'), plain: look('Titre'), otherSetting: look('Membres'), inLoop: look('Responsable') };
      const hasIcon = l => l.padding === '17px' && l.image.indexOf('data:image/svg+xml') !== -1;
      const checks = {
        perValueIcon: hasIcon(got.perValue), perValueKeepsDot: got.perValue.dot !== 'none' && got.perValue.dot !== 'normal',
        plainNone: !hasIcon(got.plain), otherSettingNone: !hasIcon(got.otherSetting),
        // La bulle en boucle garde l'icône de la boucle : une autre image que celle de « Un document par valeur ».
        loopNone: got.inLoop.image !== got.perValue.image,
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, got }) };
    },
  });

  // --- Changer la colonne d'une bulle : le réglage suit une autre liste, pas une colonne qui n'en est pas une ---
  cases.push({
    id: 'varlist_setting_follows_a_replaced_column_only_to_another_list',
    description: 'Changer la colonne (« Colonne… » et « Remplacer » d’Autres attributs) : le réglage de liste suit vers une autre liste (de choix vers références, d’une table liée vers une autre) et disparaît vers une colonne qui n’en est pas une ; le réglage d’un nombre ne suit toujours pas vers une liste',
    run: async (h) => {
      await seed(h);
      const nodeWith = (column, format, table) => ({ attrs: { table: table || PAGE, column, key: (table || PAGE) + '.' + column, format, loop: null, condition: null } });
      const item = (column, table) => ({ table: table || PAGE, column, key: (table || PAGE) + '.' + column });
      const setting = { list: { pick: 'last' } };
      const got = {
        toRefs: VariableColumn.replacementAttrs(nodeWith('Themes', setting), item('Membres')).format,
        toText: VariableColumn.replacementAttrs(nodeWith('Themes', setting), item('Titre')).format,
        toNumber: VariableColumn.replacementAttrs(nodeWith('Themes', setting), item('Montant')).format,
        toOtherTableList: VariableColumn.replacementAttrs(nodeWith('Themes', setting), item('Competences', PEOPLE)).format,
        numberToList: VariableColumn.replacementAttrs(nodeWith('Montant', { zero: 'show' }), item('Themes')).format,
        noSetting: VariableColumn.replacementAttrs(nodeWith('Themes', null), item('Membres')).format,
      };
      // « Remplacer » d'Autres attributs : de Competences (liste d'une table liée) vers Langues (une autre liste), puis vers Nom (un texte).
      Editor.setHTML(`<p>${badge('Competences', setting, PEOPLE)}</p>`);
      const tick = (modal, col) => {
        const input = modal.querySelector(`.var-linked-row[data-col="${col}"] input`);
        input.checked = true;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const replaceWith = async column => {
        await selectBadge(h, badgeNodes()[0].node.attrs.column);
        press(toolbar().querySelector('button[data-action="var-linked"]'));
        await h.sleep(300);
        const linked = document.getElementById('var-linked-modal');
        if (!linked || !linked.querySelector(`.var-linked-row[data-col="${column}"]`)) return false;
        tick(linked, column);
        linked.querySelector('button.var-linked-replace').click();
        await h.sleep(250);
        return true;
      };
      got.replacedToList = await replaceWith('Langues');
      got.afterList = { column: badgeNodes()[0].node.attrs.column, format: formatOf('Langues') };
      got.replacedToText = await replaceWith('Nom');
      got.afterText = { column: badgeNodes()[0].node.attrs.column, format: badgeNodes()[0].node.attrs.format };
      const checks = {
        toRefs: same(got.toRefs, setting), toText: got.toText === null, toNumber: got.toNumber === null, toOtherTableList: same(got.toOtherTableList, setting),
        numberToList: got.numberToList === null, noSetting: got.noSetting === null,
        replacedToList: got.replacedToList && got.afterList.column === 'Langues' && same(got.afterList.format, setting),
        replacedToText: got.replacedToText && got.afterText.column === 'Nom' && got.afterText.format === null,
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, got }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.varList = cases;
})();
