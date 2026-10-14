// Suite "mention" - la pastille « @ » (js/mention.js, css/mention.css, js/suggestion-list.js), demande d'Antoine du 2026-10-13 : « un déclencheur de type "@" en plus de # quand
// on veut taguer une info précise, pas une variable, par exemple faire référence à une personne ». Quatre moitiés :
//  1) la LISTE : toutes les tables à la fois, la table de la page d'abord, le nom de la table cherchable et lisible, 50 lignes au plus, les lectures partagées ;
//  2) l'ÉDITEUR : « @ » en début de mot seulement, le choix pose la pastille (table, ligne, colonne, nom), le HTML enregistré la rend à l'identique, une pastille dont la
//     fiche a disparu rougit, son nom suit celui de Grist sans toucher au document ;
//  3) la LECTURE et les EXPORTS : le nom d'aujourd'hui dans Grist (Lecture, aperçu des exports, PDF, Word, Markdown, e-mail), « [Fiche introuvable] » quand la ligne n'existe
//     plus, indépendant de la ligne affichée ;
//  4) les renommages de tables et de colonnes, les touches partagées avec « # » et « § », les contrastes.
// La frappe réelle (page.keyboard : flèches, Entrée, Tab, Échap, case de tableau, liste à puces), la vraie souris et le panneau de 700x400 sont dans dev-tests/verify-mention-keyboard.mjs.
(function () {
  const cases = [];
  const stub = () => window.__gristStub;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const PEOPLE = 'MnPersonnes';
  const FILES = 'MnDossiers';
  const PLACES = 'MnLieux';
  const people = [
    { id: 1, Email: 'jean.dupont@example.fr', NomComplet: 'Jean Dupont', Poste: 'Maire' },
    { id: 2, Email: 'marie.martin@example.fr', NomComplet: 'Marie Martin', Poste: 'Adjointe' },
    { id: 3, Email: 'marc.armand@example.fr', NomComplet: 'Marc Armand', Poste: 'Trésorier' },
    { id: 4, Email: 'zoe.durand@example.fr', NomComplet: 'Zoé Durand', Poste: 'Secrétaire' },
  ];
  const places = [{ id: 1, Ville: 'Marseille' }, { id: 2, Ville: 'Marmande' }, { id: 3, Ville: 'Lyon' }];
  const files = [
    { id: 1, Titre: 'Dossier Alpha', Responsable: 2, gristHelper_Display: 'Marie Martin' },
    { id: 2, Titre: 'Dossier Bêta', Responsable: 1, gristHelper_Display: 'Jean Dupont' },
  ];

  // Une pastille telle que l'éditeur l'enregistre.
  const chip = (table, row, column, label) => '<span class="mention-chip" contenteditable="false" data-mention-table="' + table + '" data-mention-row="' + row
    + '" data-mention-column="' + column + '">' + label + '</span>';
  const dom = html => { const t = document.createElement('template'); t.innerHTML = html; return t.content; };
  const names = list => list.map(item => item.table + ':' + item.label).join(' | ');
  const labels = list => list.map(item => item.label).join(',');
  const inLang = async (lang, fn) => { const before = I18n.getLang(); I18n.setLang(lang); try { return await fn(); } finally { I18n.setLang(before); } };
  const boxOf = () => document.getElementById('mention-box');
  const isOpen = () => { const box = boxOf(); return !!box && box.style.display !== 'none'; };
  const rowsShown = () => Array.from(boxOf().querySelectorAll('.ex-item')).map(row => row.querySelector('.mention-name').textContent);

  // Un document neuf : ses trois tables, la page sur les dossiers, rien lu, les touches par défaut.
  function purge() {
    stub().state.tables.filter(t => /^Mn[A-Z]/.test(t)).forEach(t => stub().dropTable(t));
    try { localStorage.removeItem('pp_trigger_char'); localStorage.removeItem('pp_expansion_char'); } catch (e) { /* stockage indisponible */ }
    Mention.reset();
  }
  async function seed(options) {
    const opts = Object.assign({ ref: true, people, places, files }, options);
    purge();
    stub().setVariables(PEOPLE, { Email: 'Text', NomComplet: 'Text', Poste: 'Text' });
    stub().setRows(PEOPLE, opts.people);
    stub().setVariables(PLACES, { Ville: 'Text' });
    stub().setRows(PLACES, opts.places);
    stub().setVariables(FILES, { Titre: 'Text', Responsable: 'Ref:' + PEOPLE, gristHelper_Display: 'Text' }, null,
      opts.ref ? { Responsable: 'gristHelper_Display' } : {}, opts.ref ? { Responsable: 'NomComplet' } : {});
    stub().setRows(FILES, opts.files);
    await GristAPI.refreshSchema();
    stub().fireRecord({ id: 1, Titre: 'Dossier Alpha', Responsable: 2 }, FILES);
    await sleep(40);
  }
  // Compte les lectures de table que Mention demande à Grist ; `failing` : les tables dont la lecture échoue.
  function spyReads(failing) {
    const original = grist.docApi.fetchTable;
    const calls = [];
    grist.docApi.fetchTable = function (table) {
      calls.push(table);
      if (failing && failing.indexOf(table) !== -1) return Promise.reject(new Error('lecture impossible (essai) : ' + table));
      return original.apply(this, arguments);
    };
    return { calls, restore: () => { grist.docApi.fetchTable = original; } };
  }

  // === 1) La liste ==========================================================================================================================================

  cases.push({
    id: 'mention_names_a_fiche_by_the_column_a_reference_shows_else_the_first_text_column',
    description: 'Le nom d\'une fiche est la colonne que Grist montre quand une Référence désigne sa table (« Colonne à afficher »), à défaut la première colonne de texte',
    run: async () => {
      await seed({ ref: true });
      const withReference = { people: Mention.labelColumnOf(PEOPLE), files: Mention.labelColumnOf(FILES), places: Mention.labelColumnOf(PLACES) };
      await seed({ ref: false });
      const withoutReference = Mention.labelColumnOf(PEOPLE);
      return {
        pass: withReference.people === 'NomComplet' && withReference.files === 'Titre' && withReference.places === 'Ville' && withoutReference === 'Email',
        notes: JSON.stringify({ withReference, withoutReference }),
      };
    },
  });

  cases.push({
    id: 'mention_list_searches_every_table_page_table_first_and_says_which_table',
    description: 'La liste montre les fiches de toutes les tables, celles de la table de la page d\'abord, puis les autres dans l\'ordre du document, chacune avec sa table tant que le document a plusieurs tables à fiches',
    run: async () => {
      await seed();
      const all = await Mention.items('');
      const expected = [FILES + ':Dossier Alpha', FILES + ':Dossier Bêta', PEOPLE + ':Jean Dupont', PEOPLE + ':Marc Armand', PEOPLE + ':Marie Martin', PEOPLE + ':Zoé Durand',
        PLACES + ':Lyon', PLACES + ':Marmande', PLACES + ':Marseille'].join(' | ');
      const hints = all.map(item => item.hint === item.table).every(Boolean);
      // La page change de table : ses fiches passent en tête.
      stub().fireRecord({ id: 1, Ville: 'Marseille' }, PLACES);
      await sleep(40);
      const pageMoved = names(await Mention.items('')).split(' | ').slice(0, 3).join(' | ');
      stub().fireRecord({ id: 1, Titre: 'Dossier Alpha', Responsable: 2 }, FILES);
      await sleep(40);
      return {
        pass: names(all) === expected && hints && all.more === 0 && pageMoved === PLACES + ':Lyon | ' + PLACES + ':Marmande | ' + PLACES + ':Marseille',
        notes: JSON.stringify({ all: names(all), hints, more: all.more, pageMoved }),
      };
    },
  });

  cases.push({
    id: 'mention_list_finds_words_in_any_order_without_accents_or_case_and_the_table_name',
    description: 'Les mots tapés se retrouvent dans le nom de la fiche ou dans celui de sa table, dans n\'importe quel ordre, sans accents ni casse ; les noms qui commencent par la saisie passent avant ceux qui la contiennent',
    run: async () => {
      await seed();
      const got = {
        start: names(await Mention.items('mar')),
        inside: names(await Mention.items('arm')),
        reversed: names(await Mention.items('MARTIN marie')),
        accents: names(await Mention.items('zoe')) + ' / ' + names(await Mention.items('BETA')),
        table: names(await Mention.items('mnlieux mar')),
        tableAlone: labels(await Mention.items('mnlieux')),
        nothing: names(await Mention.items('zzz')),
        dashed: labels(await Mention.items('jean-dup')),
        punctuation: labels(await Mention.items('...')),
      };
      const wanted = {
        start: [PEOPLE + ':Marc Armand', PEOPLE + ':Marie Martin', PLACES + ':Marmande', PLACES + ':Marseille'].join(' | '),
        inside: PEOPLE + ':Marc Armand | ' + PLACES + ':Marmande',
        reversed: PEOPLE + ':Marie Martin',
        accents: PEOPLE + ':Zoé Durand / ' + FILES + ':Dossier Bêta',
        table: PLACES + ':Marmande | ' + PLACES + ':Marseille',
        tableAlone: 'Lyon,Marmande,Marseille',
        nothing: '',
        dashed: 'Jean Dupont',
        punctuation: 'Dossier Alpha,Dossier Bêta,Jean Dupont,Marc Armand,Marie Martin,Zoé Durand,Lyon,Marmande,Marseille',
      };
      const bad = Object.keys(wanted).filter(key => got[key] !== wanted[key]);
      return { pass: bad.length === 0, notes: JSON.stringify({ bad, got }) };
    },
  });

  cases.push({
    id: 'mention_list_hides_the_table_when_only_one_table_has_fiches_and_skips_unnamed_rows',
    description: 'Une seule table a des fiches : son nom n\'est pas répété sur chaque ligne ; une fiche sans nom n\'est pas proposée',
    run: async () => {
      await seed({ places: [], files: [], people: people.concat([{ id: 5, Email: '', NomComplet: '', Poste: 'Anonyme' }, { id: 6, Email: '', NomComplet: '   ', Poste: 'Blanc' }]) });
      const got = await Mention.items('');
      return {
        pass: got.length === 4 && got.every(item => item.hint === '') && labels(got) === 'Jean Dupont,Marc Armand,Marie Martin,Zoé Durand',
        notes: JSON.stringify({ got: got.map(item => [item.label, item.hint]) }),
      };
    },
  });

  cases.push({
    id: 'mention_list_keeps_fifty_rows_and_counts_the_others',
    description: 'Plus de 50 fiches répondent à la saisie : la liste en garde 50 et dit combien d\'autres répondent encore ; taper plus de lettres resserre la liste',
    run: async () => {
      const many = Array.from({ length: 60 }, (_, i) => ({ id: i + 1, Email: '', NomComplet: 'Fiche ' + (i + 1), Poste: '' }));
      await seed({ places: [], files: [], people: many });
      const all = await Mention.items('');
      const narrowed = await Mention.items('fiche 5');
      const exact = await Mention.items('fiche 60');
      return {
        pass: all.length === 50 && all.more === 10 && narrowed.length === 15 && narrowed.more === 0 && exact.length === 1 && exact.more === 0 && labels(exact) === 'Fiche 60',
        notes: JSON.stringify({ all: all.length, more: all.more, narrowed: narrowed.length, narrowedMore: narrowed.more, exact: labels(exact) }),
      };
    },
  });

  cases.push({
    id: 'mention_tables_are_read_once_for_a_whole_typing_and_a_table_that_fails_is_not_asked_again',
    description: 'Chaque table n\'est lue qu\'une fois pour toute une saisie (une lecture par table, pas une par lettre) ; une table illisible est laissée de côté sans cacher les autres et n\'est pas redemandée à chaque lettre',
    run: async () => {
      await seed();
      const spy = spyReads();
      let sharedReads;
      try {
        await Mention.items('m');
        await Mention.items('ma');
        await Mention.items('mar');
        await Mention.resolve({ table: PEOPLE, row: 2, column: 'NomComplet', label: 'Marie Martin' });
        sharedReads = spy.calls.slice().sort().join(',');
      } finally { spy.restore(); }
      Mention.reset();
      const failing = spyReads([PLACES]);
      let kept;
      let askedAgain;
      try {
        kept = names(await Mention.items('mar'));
        await Mention.items('mar');
        await Mention.items('marm');
        askedAgain = failing.calls.filter(table => table === PLACES).length;
      } finally { failing.restore(); }
      return {
        pass: sharedReads === [FILES, PEOPLE, PLACES].sort().join(',') && kept === PEOPLE + ':Marc Armand | ' + PEOPLE + ':Marie Martin' && askedAgain === 1,
        notes: JSON.stringify({ sharedReads, kept, askedAgain }),
      };
    },
  });

  // === 2) L'éditeur ========================================================================================================================================

  cases.push({
    id: 'mention_extension_has_its_own_plugin_key_and_first_priority_and_the_node_is_in_the_schema',
    description: 'L\'extension est dans l\'éditeur avec la priorité qui lui donne les touches avant les listes et les colonnes, une clé de plugin distincte de celles de « # » et de « § », et le nœud « mention » est un atome en ligne sélectionnable',
    run: async () => {
      const editor = EditorCore.getEditor();
      const extension = editor.extensionManager.extensions.find(e => e.name === 'mentionSuggestion');
      const keys = editor.state.plugins.map(p => p.key);
      const own = keys.filter(k => /^mentionSuggestion/.test(k)).length;
      const node = editor.schema.nodes.mention;
      return {
        pass: !!extension && extension.config.priority === 1000 && own === 1 && !!node && node.isInline && node.isAtom && node.spec.selectable !== false,
        notes: JSON.stringify({ found: !!extension, priority: extension && extension.config.priority, own, node: !!node }),
      };
    },
  });

  cases.push({
    id: 'mention_at_sign_opens_the_list_at_the_start_of_a_word_only',
    description: '« @ » ouvre la liste au début d\'un paragraphe, après une espace, une parenthèse ou une ponctuation ; pas collé à une lettre ou un chiffre (marie@exemple.fr), pas deux fois de suite, pas dans un bloc de code, pas suivi d\'une espace',
    run: async (h) => {
      await seed();
      // Le curseur à la fin du dernier bloc de code (un paragraphe de fin que l'éditeur ajoute après lui n'est pas le bloc), sinon à la fin du document.
      const cursorInCode = async () => {
        const editor = EditorCore.getEditor();
        let end = null;
        editor.state.doc.descendants((node, pos) => { if (node.type.spec.code) end = pos + node.nodeSize - 1; });
        editor.commands.focus();
        if (end !== null) editor.commands.setTextSelection(end);
        await h.sleep(60);
        return end !== null;
      };
      const attempt = async (typed, setup, inCode) => {
        await h.resetEditor();
        if (setup) Editor.setHTML(setup);
        if (inCode) { if (!await cursorInCode()) return 'pas de bloc de code'; } else await h.focusAtEnd();
        for (const part of typed) await h.typeText(part);
        await h.sleep(150);
        return isOpen();
      };
      const got = {
        start: await attempt(['@']),
        afterSpace: await attempt(['Bonjour ', '@']),
        afterParenthesis: await attempt(['Voir (', '@']),
        afterColon: await attempt(['Contact :', ' @']),
        withQuery: await attempt(['Bonjour ', '@mar']),
        withWords: await attempt(['Bonjour ', '@marie mar']),
        withApostrophe: await attempt(['Bonjour ', "@d'a"]),
        emailAddress: await attempt(['marie', '@']),
        emailTyped: await attempt(['marie', '@', 'exemple.fr']),
        afterDigit: await attempt(['12', '@']),
        doubled: await attempt(['@', '@']),
        spaceAfter: await attempt(['Bonjour ', '@', ' ']),
        punctuationEnds: await attempt(['Bonjour ', '@mar', ',']),
        codeBlock: await attempt(['@'], '<pre><code>x </code></pre>', true),
      };
      const wanted = {
        start: true, afterSpace: true, afterParenthesis: true, afterColon: true, withQuery: true, withWords: true, withApostrophe: true,
        emailAddress: false, emailTyped: false, afterDigit: false, doubled: false, spaceAfter: false, punctuationEnds: false, codeBlock: false,
      };
      const bad = Object.keys(wanted).filter(key => got[key] !== wanted[key]);
      await h.resetEditor();
      return { pass: bad.length === 0, notes: JSON.stringify({ bad, got }) };
    },
  });

  cases.push({
    id: 'mention_list_filters_while_typing_and_says_why_when_empty',
    description: '« @ » montre les fiches, chaque lettre resserre la liste ; sans réponse elle le dit (« Aucune fiche ne correspond. ») au lieu de se fermer, et dit aussi quand les tables sont vides, en français et en anglais',
    run: async (h) => {
      await seed();
      await h.resetEditor();
      await h.focusAtEnd();
      await h.typeText('Bonjour ');
      await h.typeText('@');
      await h.sleep(150);
      const first = { open: isOpen(), count: rowsShown().length, hint: boxOf().querySelector('.mention-table') && boxOf().querySelector('.mention-table').textContent };
      await h.typeText('mar');
      await h.sleep(150);
      const narrowed = rowsShown();
      await h.typeText('zzz');
      await h.sleep(150);
      const none = { open: isOpen(), rows: boxOf().querySelectorAll('.ex-item').length, status: (boxOf().querySelector('.ex-status') || {}).textContent };
      I18n.setLang('en');
      await h.typeText('z');
      await h.sleep(150);
      const noneEn = (boxOf().querySelector('.ex-status') || {}).textContent;
      I18n.setLang('fr');
      // Les tables sont vides.
      await seed({ people: [], places: [], files: [] });
      await h.resetEditor();
      await h.focusAtEnd();
      await h.typeText('@');
      await h.sleep(150);
      const empty = (boxOf().querySelector('.ex-status') || {}).textContent;
      const emptyEn = await inLang('en', async () => { await h.typeText(' '); await h.typeText('@'); await h.sleep(150); return (boxOf().querySelector('.ex-status') || {}).textContent; });
      await h.resetEditor();
      return {
        pass: first.open && first.count === 9 && first.hint === FILES && JSON.stringify(narrowed) === JSON.stringify(['Marc Armand', 'Marie Martin', 'Marmande', 'Marseille'])
          && none.open && none.rows === 0 && none.status === 'Aucune fiche ne correspond.' && noneEn === 'No record matches.'
          && empty === 'Aucune fiche à citer : les tables du document sont vides.' && emptyEn === 'Nothing to mention: the document’s tables are empty.',
        notes: JSON.stringify({ first, narrowed, none, noneEn, empty, emptyEn }),
      };
    },
  });

  cases.push({
    id: 'mention_picking_a_row_with_the_mouse_puts_the_chip_and_closes_the_list',
    description: 'Un clic sur une ligne remplace « @mar… » par la pastille de CETTE fiche (table, numéro de ligne, colonne lue, nom), referme la liste et laisse le curseur après la pastille ; le HTML enregistré se relit à l\'identique',
    run: async (h) => {
      await seed();
      await h.resetEditor();
      await h.focusAtEnd();
      await h.typeText('Rédigé par ');
      await h.typeText('@marie');
      await h.sleep(150);
      const row = Array.from(boxOf().querySelectorAll('.ex-item')).find(r => r.querySelector('.mention-name').textContent === 'Marie Martin');
      if (!row) return { pass: false, notes: 'ligne introuvable : ' + rowsShown().join(',') };
      row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      await h.sleep(120);
      await h.typeText(' et plus.');
      const editor = EditorCore.getEditor();
      const html = Editor.getHTML();
      const node = dom(html).querySelector('.mention-chip');
      const nodes = [];
      editor.state.doc.descendants(n => { if (n.type.name === 'mention') nodes.push(n.attrs); });
      Editor.setHTML(html);
      await h.sleep(120);
      const again = Editor.getHTML();
      await h.resetEditor();
      const text = dom(html).firstElementChild.textContent;
      return {
        pass: !isOpen() && !!node && node.getAttribute('data-mention-table') === PEOPLE && node.getAttribute('data-mention-row') === '2' && node.getAttribute('data-mention-column') === 'NomComplet'
          && node.textContent === 'Marie Martin' && node.getAttribute('contenteditable') === 'false' && text === 'Rédigé par Marie Martin et plus.'
          && nodes.length === 1 && JSON.stringify(nodes[0]) === JSON.stringify({ table: PEOPLE, row: 2, column: 'NomComplet', label: 'Marie Martin' }) && again === html,
        notes: JSON.stringify({ html, nodes, again }),
      };
    },
  });

  cases.push({
    id: 'mention_chip_in_a_saved_template_loads_as_a_node_and_pastes_as_one',
    description: 'Une pastille écrite dans le HTML d\'un modèle enregistré se charge comme nœud (ses attributs et son nom), se supprime d\'un seul geste comme une bulle et se recolle comme pastille',
    run: async (h) => {
      await seed();
      await h.resetEditor();
      Editor.setHTML('<p>Pour ' + chip(PEOPLE, 3, 'NomComplet', 'Marc Armand') + ' !</p>');
      await h.sleep(120);
      const editor = EditorCore.getEditor();
      const found = [];
      editor.state.doc.descendants(n => { if (n.type.name === 'mention') found.push(n.attrs); });
      // Copier-coller : le HTML de la sélection, relu par l'éditeur.
      const copied = editor.getHTML();
      Editor.setHTML('<p></p>');
      editor.commands.insertContent(copied);
      await h.sleep(80);
      const pasted = [];
      editor.state.doc.descendants(n => { if (n.type.name === 'mention') pasted.push(n.attrs); });
      // Suppression : la pastille est un atome, un Retour arrière juste après l'emporte entière.
      let pos = null;
      editor.state.doc.descendants((n, p) => { if (n.type.name === 'mention') pos = p; });
      editor.commands.setTextSelection(pos + 1);
      editor.commands.deleteRange({ from: pos, to: pos + 1 });
      await h.sleep(60);
      const left = Editor.getHTML();
      await h.resetEditor();
      return {
        pass: found.length === 1 && JSON.stringify(found[0]) === JSON.stringify({ table: PEOPLE, row: 3, column: 'NomComplet', label: 'Marc Armand' }) && pasted.length === 1
          && JSON.stringify(pasted[0]) === JSON.stringify(found[0]) && left.indexOf('mention-chip') === -1,
        notes: JSON.stringify({ found, pasted, left }),
      };
    },
  });

  // La pastille repeinte dans l'éditeur : classe et info-bulle, jamais le document.
  cases.push({
    id: 'mention_chip_turns_red_when_its_fiche_is_gone_and_follows_the_name_without_touching_the_document',
    description: 'Dans l\'éditeur, une pastille dont la ligne, la colonne ou la table n\'existe plus rougit avec son message en info-bulle ; une pastille valable porte sa table en info-bulle et le nom d\'aujourd\'hui dans Grist, sans qu\'aucune modification du document ne parte',
    run: async (h) => {
      await seed();
      await h.resetEditor();
      const html = '<p>' + [chip(PEOPLE, 2, 'NomComplet', 'Marie Martin'), chip(PEOPLE, 99, 'NomComplet', 'Disparu'), chip(PEOPLE, 1, 'Inconnue', 'Sans colonne'),
        chip('MnAbsente', 1, 'Nom', 'Sans table'), chip(PEOPLE, 3, 'NomComplet', 'Marc Armand (ancien nom)')].join(' ') + '</p>';
      Editor.setHTML(html);
      const before = Editor.getHTML();
      let updates = 0;
      const count = () => { updates++; };
      EditorCore.getEditor().on('update', count);
      await h.sleep(500);
      EditorCore.getEditor().off('update', count);
      const chips = Array.from(document.querySelectorAll('.tiptap .mention-chip'));
      const state = chips.map(c => ({ text: c.textContent, broken: c.classList.contains('mention-chip-broken'), title: c.title }));
      const wanted = [
        { text: 'Marie Martin', broken: false, title: 'Fiche de la table « ' + PEOPLE + ' »' },
        { text: 'Disparu', broken: true, title: 'Cette fiche n’existe plus dans la table « ' + PEOPLE + ' ».' },
        { text: 'Sans colonne', broken: true, title: 'La colonne « Inconnue » n’existe plus dans la table « ' + PEOPLE + ' ».' },
        { text: 'Sans table', broken: true, title: 'La table « MnAbsente » de cette fiche n’existe plus dans ce document.' },
        { text: 'Marc Armand', broken: false, title: 'Fiche de la table « ' + PEOPLE + ' »' },
      ];
      const after = Editor.getHTML();
      // L'anglais : les messages suivent la langue.
      const english = await inLang('en', async () => {
        EditorCore.getEditor().commands.focus();
        Editor.markBadgeValidity(document.querySelector('.tiptap'));
        return Array.from(document.querySelectorAll('.tiptap .mention-chip')).map(c => c.title);
      });
      await h.resetEditor();
      return {
        pass: JSON.stringify(state) === JSON.stringify(wanted) && updates === 0 && after === before
          && english[1] === 'This record no longer exists in table “' + PEOPLE + '”.' && english[3] === 'This record’s table “MnAbsente” no longer exists in this document.',
        notes: JSON.stringify({ state, updates, same: after === before, english }),
      };
    },
  });

  cases.push({
    id: 'mention_chip_name_in_the_editor_is_read_again_after_the_refresh_delay_only',
    description: 'Le nom d\'une pastille dans l\'éditeur est relu dans Grist au plus toutes les deux minutes par table : frapper dans le document ne relit pas la table à chaque lettre',
    run: async (h) => {
      await seed();
      await h.resetEditor();
      Editor.setHTML('<p>' + chip(PEOPLE, 2, 'NomComplet', 'Marie Martin') + ' ' + chip(PEOPLE, 1, 'NomComplet', 'Jean Dupont') + '</p>');
      await h.sleep(300);
      const spy = spyReads();
      try {
        await h.focusAtEnd();
        for (const letter of 'Bonjour à tous') { await h.typeText(letter); }
        await h.sleep(300);
        return { pass: spy.calls.length === 0, notes: JSON.stringify({ reads: spy.calls }) };
      } finally { spy.restore(); await h.resetEditor(); }
    },
  });

  // === 3) La Lecture et les exports ========================================================================================================================

  const document1 = '<p>Rédigé par ' + chip(PEOPLE, 2, 'NomComplet', 'Marie Martin') + ' pour ' + chip(PLACES, 1, 'Ville', 'Marseille') + '.</p>';
  const resolvedIn = async (html, tableId, record) => {
    const box = document.createElement('div');
    box.innerHTML = await ReaderMode.preview(html, tableId, record);
    return { box, values: Array.from(box.querySelectorAll('.resolved-var')).map(el => ({ text: el.textContent, flagged: el.classList.contains('error-msg') })), text: box.textContent, leftover: box.querySelectorAll('.mention-chip').length };
  };

  cases.push({
    id: 'mention_reader_and_exports_write_the_name_of_the_fiche_whatever_row_the_page_shows',
    description: 'La Lecture et l\'aperçu des exports écrivent le nom de la fiche citée, le même quelle que soit la ligne affichée ; plus aucune pastille ne reste ; la position d\'un commentaire (data-pp-atom) passe sur le nom',
    run: async () => {
      await seed();
      const first = await resolvedIn(document1, FILES, { id: 1, Titre: 'Dossier Alpha' });
      const second = await resolvedIn(document1, FILES, { id: 2, Titre: 'Dossier Bêta' });
      const otherPage = await resolvedIn(document1, PLACES, { id: 3, Ville: 'Lyon' });
      await ReaderMode.render(document1, FILES, { id: 1, Titre: 'Dossier Alpha' });
      const reader = Array.from(document.querySelectorAll('#reader-container .resolved-var')).map(el => el.textContent);
      const marked = await resolvedIn('<p>A ' + chip(PEOPLE, 2, 'NomComplet', 'Marie Martin').replace('<span', '<span data-pp-atom="5:1"') + '</p>', FILES, { id: 1 });
      document.getElementById('btn-mode-edit').click();
      await sleep(60);
      const wanted = [{ text: 'Marie Martin', flagged: false }, { text: 'Marseille', flagged: false }];
      const same = JSON.stringify(first.values) === JSON.stringify(wanted) && JSON.stringify(second.values) === JSON.stringify(wanted) && JSON.stringify(otherPage.values) === JSON.stringify(wanted);
      return {
        pass: same && first.text === 'Rédigé par Marie Martin pour Marseille.' && first.leftover === 0 && JSON.stringify(reader) === JSON.stringify(['Marie Martin', 'Marseille'])
          && marked.box.querySelector('.resolved-var').getAttribute('data-pp-atom') === '5:1',
        notes: JSON.stringify({ first: first.values, second: second.values, otherPage: otherPage.values, reader, text: first.text }),
      };
    },
  });

  cases.push({
    id: 'mention_reader_follows_a_rename_made_in_grist',
    description: 'La fiche renommée dans Grist est renommée dans le document : la Lecture écrit le nom d\'aujourd\'hui, pas celui que la pastille portait quand on l\'a posée',
    run: async () => {
      await seed();
      const before = (await resolvedIn(document1, FILES, { id: 1 })).text;
      stub().setRows(PEOPLE, people.map(p => (p.id === 2 ? Object.assign({}, p, { NomComplet: 'Marie Martin-Lefèvre' }) : p)));
      Mention.reset();
      const after = (await resolvedIn(document1, FILES, { id: 1 })).text;
      return { pass: before === 'Rédigé par Marie Martin pour Marseille.' && after === 'Rédigé par Marie Martin-Lefèvre pour Marseille.', notes: JSON.stringify({ before, after }) };
    },
  });

  cases.push({
    id: 'mention_missing_fiche_is_written_in_red_in_the_language_of_the_interface',
    description: 'Une fiche dont la ligne, la colonne ou la table n\'existe plus s\'écrit « [Fiche introuvable] » en rouge (« [Record not found] » en anglais), en Lecture comme dans les exports ; une table illisible garde le nom que la pastille portait',
    run: async () => {
      await seed();
      const html = '<p>' + [chip(PEOPLE, 99, 'NomComplet', 'Disparu'), chip(PEOPLE, 1, 'Inconnue', 'Sans colonne'), chip('MnAbsente', 1, 'Nom', 'Sans table')].join(' / ') + '</p>';
      const fr = await resolvedIn(html, FILES, { id: 1 });
      const en = await inLang('en', () => resolvedIn(html, FILES, { id: 1 }));
      // La table existe mais ne se lit pas (réseau, droits) : le nom d'origine, sans alerte.
      Mention.reset();
      const failing = spyReads([PEOPLE]);
      let unreadable;
      try { unreadable = await resolvedIn(document1, FILES, { id: 1 }); } finally { failing.restore(); }
      const flagged = result => result.values.every(v => v.flagged);
      return {
        pass: fr.text === '[Fiche introuvable] / [Fiche introuvable] / [Fiche introuvable]' && flagged(fr) && en.text === '[Record not found] / [Record not found] / [Record not found]' && flagged(en)
          && unreadable.text === 'Rédigé par Marie Martin pour Marseille.' && unreadable.values.every(v => !v.flagged),
        notes: JSON.stringify({ fr: fr.text, en: en.text, unreadable: unreadable.text }),
      };
    },
  });

  cases.push({
    id: 'mention_name_reaches_the_pdf_the_word_file_the_markdown_and_the_email_text',
    description: 'Le nom de la fiche citée se retrouve dans le PDF (relu par pdf.js), le Word, le Markdown et le texte de l\'e-mail, avec la ligne affichée qui n\'y change rien',
    run: async (h) => {
      await seed();
      const record = { id: 1, Titre: 'Dossier Alpha', Responsable: 2 };
      const pdf = await h.exportPdfContent(document1, null, null, { tableId: FILES, record });
      const truth = await h.extractPdfGroundTruth(pdf.base64);
      const pdfText = truth.pages.map(page => page.textItems.map(item => item.str).join(' ')).join(' ');
      await ExportCommon.ensureJsZipLoaded();
      await DocxExport.ensureDocxLibLoaded();
      const noHeaderFooter = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
      const { blob } = await DocxExport.getDocxBlobForRecord(document1, FILES, record, '', noHeaderFooter, null);
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const docxText = new DOMParser().parseFromString(await zip.file('word/document.xml').async('string'), 'application/xml').documentElement.textContent;
      const markdown = (await h.exportMarkdown(document1, null, record, FILES)).text;
      const mail = MailtoExport.plainTextFromHtml(await ReaderMode.preview(document1, FILES, record));
      const has = text => text.indexOf('Marie Martin') !== -1 && text.indexOf('Marseille') !== -1 && text.indexOf('introuvable') === -1;
      return {
        pass: has(pdfText) && has(docxText) && has(markdown) && has(mail),
        notes: JSON.stringify({ pdf: pdfText.slice(0, 120), docx: docxText.slice(0, 120), markdown: markdown.slice(0, 120), mail: mail.slice(0, 120) }),
      };
    },
  });

  cases.push({
    id: 'mention_gap_around_the_name_is_kept_like_around_any_text',
    description: 'Les espaces tapés autour d\'une pastille sont gardés comme autour d\'un texte : le nom de la fiche n\'est jamais traité comme une valeur vide dont on absorberait l\'espace',
    run: async () => {
      await seed();
      const html = '<p>Cher ' + chip(PEOPLE, 1, 'NomComplet', 'Jean Dupont') + ', ' + chip(PEOPLE, 2, 'NomComplet', 'Marie Martin') + ' ' + chip(PEOPLE, 3, 'NomComplet', 'Marc Armand') + '</p>';
      const out = await resolvedIn(html, FILES, { id: 1 });
      const matchesAtoms = SpaceGap && out.text === 'Cher Jean Dupont, Marie Martin Marc Armand';
      return { pass: matchesAtoms, notes: JSON.stringify({ text: out.text }) };
    },
  });

  // === 4) Renommages, touches partagées, contrastes ==========================================================================================================

  cases.push({
    id: 'mention_follows_a_table_or_column_renamed_in_grist',
    description: 'Une table ou une colonne renommée dans Grist suit dans la pastille (js/schema-renames.js) : sa table et sa colonne sont réécrites, son numéro de ligne et son nom restent ; une pastille qui n\'est pas touchée reste telle quelle',
    run: async () => {
      // Hier : MnPersonnes (Email, NomComplet) ; aujourd'hui : MnAnnuaire (Email, NomPrenom).
      const m = SchemaRenames.createMapper(
        { f: 1, t: { 1: [PEOPLE, { 1: 'Email', 2: 'NomComplet' }], 2: [PLACES, { 3: 'Ville' }] } },
        { f: 1, t: { 1: ['MnAnnuaire', { 1: 'Email', 2: 'NomPrenom' }], 2: [PLACES, { 3: 'Ville' }] } },
        {}
      );
      const ctx = { page: null, trigger: Variables.triggerChar() };
      const html = '<p>' + chip(PEOPLE, 2, 'NomComplet', 'Marie Martin') + ' ' + chip(PLACES, 1, 'Ville', 'Marseille') + '</p>';
      const out = SchemaRenames.rewriteHtml(html, m, ctx);
      const chips = Array.from(dom(out.html).querySelectorAll('.mention-chip')).map(c => [c.getAttribute('data-mention-table'), c.getAttribute('data-mention-row'), c.getAttribute('data-mention-column'), c.textContent]);
      const untouched = SchemaRenames.rewriteHtml('<p>' + chip(PLACES, 1, 'Ville', 'Marseille') + '</p>', m, ctx);
      return {
        pass: out.count === 1 && JSON.stringify(chips) === JSON.stringify([['MnAnnuaire', '2', 'NomPrenom', 'Marie Martin'], [PLACES, '1', 'Ville', 'Marseille']]) && untouched.count === 0,
        notes: JSON.stringify({ count: out.count, chips, untouched: untouched.count }),
      };
    },
  });

  cases.push({
    id: 'mention_gives_way_to_the_key_chosen_for_variables_or_for_abbreviations',
    description: 'Quand Réglages a donné « @ » au panneau des variables ou aux abréviations, la liste des fiches s\'efface (comme « § » devant « # ») ; sinon « @ » est sa touche',
    run: async (h) => {
      await seed();
      const free = Mention.triggerChar();
      localStorage.setItem('pp_trigger_char', '@');
      const variables = Mention.triggerChar();
      await h.resetEditor();
      await h.focusAtEnd();
      await h.typeText('Bonjour ');
      await h.typeText('@');
      await h.sleep(150);
      const variablesOpen = isOpen();
      localStorage.removeItem('pp_trigger_char');
      localStorage.setItem('pp_expansion_char', '@');
      const abbreviations = Mention.triggerChar();
      localStorage.removeItem('pp_expansion_char');
      await h.resetEditor();
      return { pass: free === '@' && variables === null && !variablesOpen && abbreviations === null, notes: JSON.stringify({ free, variables, variablesOpen, abbreviations }) };
    },
  });

  // Mesures de contraste, mêmes formules que dev-tests/scenarios-contrast.js (rapport de luminance WCAG sur la couleur calculée et le vrai fond).
  const root = document.documentElement;
  function parseColor(str) {
    const srgb = String(str).match(/^color\(srgb\s+([^)]+)\)/);
    if (srgb) { const q = srgb[1].split(/[\s\/]+/).filter(Boolean).map(Number); return { r: q[0] * 255, g: q[1] * 255, b: q[2] * 255, a: q.length > 3 ? q[3] : 1 }; }
    const m = String(str).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = c => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const ratio = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
  function backgroundOf(el) {
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
      const c = parseColor(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return base;
  }
  const textRatio = (el, pseudo) => {
    const c = parseColor(getComputedStyle(el, pseudo || null).color);
    const bg = backgroundOf(el);
    return Math.round(ratio(over(c, bg), bg) * 100) / 100;
  };

  cases.push({
    id: 'mention_contrast_chip_and_list_reach_4_5_in_light_and_dark',
    description: 'La pastille (normale, sélectionnée, rouge, rouge sélectionnée) et la liste (ligne choisie ou non, nom, table, message) atteignent 4,5:1 au moins sur leur vrai fond, en clair et en sombre',
    run: async (h) => {
      await seed();
      await h.resetEditor();
      Editor.setHTML('<p>' + chip(PEOPLE, 2, 'NomComplet', 'Marie Martin') + ' ' + chip(PEOPLE, 99, 'NomComplet', 'Disparu') + '</p>');
      await h.sleep(400);
      await h.focusAtEnd();
      await h.typeText(' ');
      await h.typeText('@');
      await h.sleep(200);
      const box = boxOf();
      const opened = isOpen() && box.querySelectorAll('.ex-item').length === 9;
      const [ok, broken] = Array.from(document.querySelectorAll('.tiptap .mention-chip'));
      const before = root.getAttribute('data-theme');
      const noMotion = document.createElement('style');
      noMotion.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
      document.head.appendChild(noMotion);
      const byTheme = {};
      try {
        for (const theme of ['light', 'dark']) {
          root.setAttribute('data-theme', theme);
          const selected = box.querySelector('.ex-item.selected');
          const plain = Array.from(box.querySelectorAll('.ex-item')).find(r => r !== selected);
          const out = {};
          out['pastille'] = textRatio(ok);
          out['pastille : @'] = textRatio(ok, '::before');
          ok.classList.add('ProseMirror-selectednode');
          out['pastille sélectionnée'] = textRatio(ok);
          ok.classList.remove('ProseMirror-selectednode');
          out['pastille rouge'] = textRatio(broken);
          broken.classList.add('ProseMirror-selectednode');
          out['pastille rouge sélectionnée'] = textRatio(broken);
          broken.classList.remove('ProseMirror-selectednode');
          out['liste : nom (ligne choisie)'] = textRatio(selected.querySelector('.mention-name'));
          out['liste : table (ligne choisie)'] = textRatio(selected.querySelector('.mention-table'));
          out['liste : nom'] = textRatio(plain.querySelector('.mention-name'));
          out['liste : table'] = textRatio(plain.querySelector('.mention-table'));
          byTheme[theme] = out;
        }
        // Le message d'une liste sans ligne.
        root.setAttribute('data-theme', 'light');
        await h.typeText('zzz');
        await h.sleep(200);
        const status = box.querySelector('.ex-status');
        for (const theme of ['light', 'dark']) {
          root.setAttribute('data-theme', theme);
          if (status) byTheme[theme]['liste : message'] = textRatio(status);
        }
      } finally {
        if (before === null) root.removeAttribute('data-theme'); else root.setAttribute('data-theme', before);
        noMotion.remove();
        await h.resetEditor();
      }
      const bad = [];
      Object.keys(byTheme).forEach(theme => Object.entries(byTheme[theme]).forEach(([name, value]) => { if (!(value >= 4.5)) bad.push(theme + ' ' + name + ' ' + value); }));
      return { pass: opened && Object.keys(byTheme.light).length === 10 && bad.length === 0, notes: JSON.stringify({ opened, bad, byTheme }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.mention = cases;
})();
