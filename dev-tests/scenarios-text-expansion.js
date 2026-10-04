// Suite "textExpansion" - expansion de texte « §ub » (js/text-expansion.js, css/text-expansion.css, onglet Réglages > Raccourcis), demande d'Antoine du 2026-10-01 :
// « si le caractère choisi est « § », « §ub » devient « université de Bordeaux » », abréviations propres à chaque personne. Trois moitiés :
//  1) les DONNÉES : table Publipostage_Abreviations du document (une ligne par abréviation, Utilisateur = email Grist, repli '' sans identité), créée à la première
//     abréviation ajoutée seulement, cachée des listes #Variable ; contrôles de saisie (doublon, caractères, longueur) ; caractère déclencheur et ses refus ;
//  2) l'ÉDITEUR : la règle de saisie (remplacement à l'espace), son extension (clé de plugin distincte de celle du panneau #, priorité), après une bulle, en suivi des modifications ;
//  3) l'ÉCRAN Réglages > Raccourcis : sept onglets, textes français et anglais, contrastes en clair et en sombre.
// La frappe réelle (page.keyboard : Tab, Entrée, flèches, Échap, Retour arrière, listes à puces, bloc de code), la vraie souris dans Réglages et le panneau de 700x400 sont dans
// dev-tests/verify-text-expansion-keyboard.mjs : un execCommand('insertText') ne rejoue ni les évènements clavier ni l'ordre des plugins qu'ils traversent.
// L'identification est celle de dev-tests/grist-stub.js : sans email (personne anonyme) tant qu'un scénario n'a pas appelé setUserEmail ; GristAPI garde ensuite l'email en
// cache pour toute la suite (comme en vrai), les scénarios « anonymes » passent donc EN PREMIER. Chaque scénario repart d'un document sans table ni abréviation.
(function () {
  const cases = [];
  const stub = () => window.__gristStub;
  const TABLE = 'Publipostage_Abreviations';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const COLUMNS = [{ id: 'Utilisateur', type: 'Text' }, { id: 'Abreviation', type: 'Text' }, { id: 'Texte', type: 'Text' }];

  const rowsOf = () => {
    const t = stub().state.rows[TABLE];
    return t ? t.id.map((id, i) => ({ id, user: t.Utilisateur[i], abbr: t.Abreviation[i], text: t.Texte[i] })) : [];
  };
  // Document sans table ni abréviation, module vide, caractère déclencheur par défaut, journal d'actions remis à zéro.
  function wipe() {
    const s = stub().state;
    s.tables = s.tables.filter(t => t !== TABLE);
    delete s.rows[TABLE];
    delete s.nextRowId[TABLE];
    try { localStorage.removeItem('pp_expansion_char'); localStorage.removeItem('pp_trigger_char'); } catch (e) { /* stockage indisponible */ }
    TextExpansion.reset();
    stub().clearActionLog();
  }
  // Table déjà là, comme dans un document où une personne en a créé : [[email, abréviation, texte], ...].
  async function seed(rows) {
    const actions = [['AddTable', TABLE, COLUMNS]];
    rows.forEach(([user, abbr, text]) => actions.push(['AddRecord', TABLE, null, { Utilisateur: user, Abreviation: abbr, Texte: text }]));
    await stub().applyUserActions(actions);
    stub().clearActionLog();
  }
  async function rejection(promise) {
    try { await promise; return null; } catch (e) { return e && e.code ? e.code : 'autre : ' + (e && e.message); }
  }
  const names = list => list.map(e => e.abbreviation).join(',');
  // L'onglet ouvert en dernier reste celui de la fenêtre à sa réouverture : un scénario qui ouvre Raccourcis la rend sur Langue, comme à l'ouverture du widget.
  const closeSettings = () => {
    document.getElementById('settings-close').click();
    document.querySelector('.settings-tab[data-settings-tab="language"]').click();
  };

  // === 1) Les données ======================================================================================================================================

  cases.push({
    id: 'te_anonymous_person_reads_and_writes_blank_user_rows',
    description: 'Sans identité Grist (lecteur, document sans formule déclenchée), la personne lit et écrit les lignes à Utilisateur vide - et ne voit jamais celles d\'un email',
    run: async () => {
      wipe();
      await seed([['bob@example.fr', 'bob', 'texte de Bob'], ['', 'anon', 'texte anonyme']]);
      await TextExpansion.load(true);
      const before = names(TextExpansion.list());
      await TextExpansion.add('zz', 'z texte');
      const written = rowsOf().find(r => r.abbr === 'zz');
      return {
        pass: before === 'anon' && !!written && written.user === '' && names(TextExpansion.list()) === 'anon,zz',
        notes: JSON.stringify({ before, written, after: names(TextExpansion.list()) }),
      };
    },
  });

  cases.push({
    id: 'te_identified_person_sees_and_writes_only_own_rows',
    description: 'Une personne identifiée lit ses seules abréviations ; ajout, modification et suppression ne touchent jamais la ligne d\'une autre personne',
    run: async () => {
      wipe();
      stub().setUserEmail('alice@example.fr');
      await seed([['alice@example.fr', 'a1', 'texte A1'], ['bob@example.fr', 'b1', 'texte B1'], ['', 'anon', 'texte anonyme'], ['alice@example.fr', 'a2', 'texte A2']]);
      await TextExpansion.load(true);
      const seen = names(TextExpansion.list());
      const added = await TextExpansion.add('a3', 'texte A3');
      const rowAdded = rowsOf().find(r => r.abbr === 'a3');
      const first = TextExpansion.list().find(e => e.abbreviation === 'a1');
      await TextExpansion.update(first.rowId, 'a1', 'texte A1 modifié');
      const second = TextExpansion.list().find(e => e.abbreviation === 'a2');
      await TextExpansion.remove(second.rowId);
      const rows = rowsOf();
      const bobStill = rows.find(r => r.abbr === 'b1' && r.user === 'bob@example.fr' && r.text === 'texte B1');
      const anonStill = rows.find(r => r.abbr === 'anon' && r.user === '');
      const a1 = rows.find(r => r.abbr === 'a1');
      return {
        pass: seen === 'a1,a2' && !!rowAdded && rowAdded.user === 'alice@example.fr' && added.rowId === rowAdded.id && !!bobStill && !!anonStill && a1.text === 'texte A1 modifié' && !rows.some(r => r.abbr === 'a2'),
        notes: JSON.stringify({ seen, rowAdded, rows }),
      };
    },
  });

  cases.push({
    id: 'te_table_is_created_only_by_the_first_add_and_hidden_from_variables',
    description: 'La table Publipostage_Abreviations n\'est ni créée ni lue à vide au démarrage ni à l\'ouverture de l\'onglet : seul le premier ajout la crée (une seule fois), et elle n\'est jamais offerte comme table de #Variable',
    run: async (h) => {
      wipe();
      await TextExpansion.load(true);
      const afterLoad = stub().countActions('AddTable', TABLE);
      document.getElementById('v2-btn-settings').click();
      document.querySelector('.settings-tab[data-settings-tab="shortcuts"]').click();
      if (window.ShortcutsPanel) ShortcutsPanel.showView('expansion'); // l'onglet s'ouvre sur les touches du clavier depuis js/shortcuts-panel.js
      await sleep(300);
      const afterTab = stub().countActions('AddTable', TABLE);
      closeSettings();
      await TextExpansion.add('un', 'premier');
      const afterFirst = stub().countActions('AddTable', TABLE);
      await TextExpansion.add('deux', 'second');
      const afterSecond = stub().countActions('AddTable', TABLE);
      const records = stub().countActions('AddRecord', TABLE);
      // La table du document existe bel et bien (listTables la rend, comme le vrai Grist rend toutes les tables) mais GristAPI ne l'offre pas.
      stub().setVariables('PpAutreTable', { Nom: 'Text' });
      await GristAPI.refreshSchema();
      const tables = GristAPI.getTables();
      const listed = stub().state.tables.indexOf(TABLE) !== -1;
      return {
        pass: afterLoad === 0 && afterTab === 0 && afterFirst === 1 && afterSecond === 1 && records === 2 && listed && tables.indexOf('PpAutreTable') !== -1 && tables.indexOf(TABLE) === -1,
        notes: JSON.stringify({ afterLoad, afterTab, afterFirst, afterSecond, records, listed, tables }),
      };
    },
  });

  cases.push({
    id: 'te_entry_validation_codes',
    description: 'Une abréviation vide, trop longue, avec un espace ou un caractère interdit, déjà prise (casse ignorée), ou sans texte est refusée avec son code ; « § » collé en tête est retiré ; accents, chiffres, tiret et tiret bas passent',
    run: async () => {
      wipe();
      const long = 'a'.repeat(31);
      const results = {
        empty: await rejection(TextExpansion.add('  ', 'x')),
        onlyChar: await rejection(TextExpansion.add('§', 'x')),
        tooLong: await rejection(TextExpansion.add(long, 'x')),
        space: await rejection(TextExpansion.add('a b', 'x')),
        punctuation: await rejection(TextExpansion.add('a.b', 'x')),
        insideChar: await rejection(TextExpansion.add('a§b', 'x')),
        textEmpty: await rejection(TextExpansion.add('ok', '  \n ')),
        textTooLong: await rejection(TextExpansion.add('ok', 'x'.repeat(2001))),
      };
      const first = await TextExpansion.add('§Été_2-x', '  la saison\r\nchaude  ');
      results.duplicate = await rejection(TextExpansion.add('été_2-X', 'autre'));
      const accepted = { abbreviation: first.abbreviation, text: first.text, row: rowsOf()[0] };
      const wanted = { empty: 'empty', onlyChar: 'empty', tooLong: 'tooLong', space: 'chars', punctuation: 'chars', insideChar: 'chars', textEmpty: 'textEmpty', textTooLong: 'textTooLong', duplicate: 'duplicate' };
      const wrong = Object.keys(wanted).filter(k => results[k] !== wanted[k]);
      return {
        pass: wrong.length === 0 && accepted.abbreviation === 'Été_2-x' && accepted.text === 'la saison\nchaude' && rowsOf().length === 1 && accepted.row.abbr === 'Été_2-x',
        notes: JSON.stringify({ wrong, results, accepted }),
      };
    },
  });

  cases.push({
    id: 'te_update_and_remove_roundtrip',
    description: 'Modifier une abréviation met la même ligne à jour (pas de doublon, elle ne fait pas doublon avec elle-même, mais avec une autre) ; supprimer retire la ligne ; supprimer deux fois ne casse rien',
    run: async () => {
      wipe();
      const a = await TextExpansion.add('a', 'texte a');
      await TextExpansion.add('b', 'texte b');
      const sameName = await TextExpansion.update(a.rowId, 'A', 'texte a2');
      const sameNameSeen = sameName && sameName.abbreviation + '/' + sameName.text;
      const clash = await rejection(TextExpansion.update(a.rowId, 'b', 'x'));
      const renamed = await TextExpansion.update(a.rowId, 'c', 'texte c');
      const rows = rowsOf();
      const removed = await TextExpansion.remove(a.rowId);
      const removedAgain = await TextExpansion.remove(a.rowId);
      const updatedGone = await TextExpansion.update(a.rowId, 'z', 'x');
      return {
        pass: sameNameSeen === 'A/texte a2' && clash === 'duplicate' && renamed.abbreviation === 'c' && rows.length === 2 && rows[0].abbr === 'c' && rows[0].text === 'texte c'
          && removed === true && removedAgain === false && updatedGone === null && rowsOf().length === 1 && rowsOf()[0].abbr === 'b',
        notes: JSON.stringify({ sameNameSeen, clash, renamed, rows, removed, removedAgain, updatedGone, after: rowsOf() }),
      };
    },
  });

  cases.push({
    id: 'te_trigger_char_rules_and_storage',
    description: 'Caractère déclencheur : « § » par défaut ; refusés : lettre, chiffre, espace, tiret, tiret bas, ponctuation de fin d\'abréviation, plusieurs caractères, vide, moitié d\'emoji ; « # » (panneau des variables) refusé ; retenu, il est gardé dans localStorage ; s\'il rejoint celui du panneau #, l\'expansion s\'efface',
    run: async () => {
      wipe();
      const invalid = ['a', 'Z', 'é', '5', ' ', ' ', '-', '_', '.', ',', ';', ':', '!', '?', ')', ']', '}', '»', '', '§§', 'ab', '\ud83d'];
      const wrongInvalid = invalid.filter(c => TextExpansion.charProblem(c) !== 'invalid');
      const valid = ['§', '$', '£', '¤', '^', '|', '~', '@', '%', '&', '*', '+', '='];
      const wrongValid = valid.filter(c => TextExpansion.charProblem(c) !== '');
      const hash = TextExpansion.charProblem('#');
      const defaults = TextExpansion.storedChar() === '§' && TextExpansion.triggerChar() === '§';
      const refused = TextExpansion.setTriggerChar('a');
      const stayed = TextExpansion.storedChar() === '§';
      const accepted = TextExpansion.setTriggerChar('$');
      const kept = TextExpansion.storedChar() === '$' && localStorage.getItem('pp_expansion_char') === '$' && TextExpansion.triggerChar() === '$';
      // Le panneau # passe sur « $ » : deux listes sur la même touche - l'expansion s'efface, la sienne est ailleurs.
      localStorage.setItem('pp_trigger_char', '$');
      const cleared = TextExpansion.triggerChar() === null && TextExpansion.charProblem('$') === 'sameAsVariables';
      wipe();
      return {
        pass: wrongInvalid.length === 0 && wrongValid.length === 0 && hash === 'sameAsVariables' && defaults && refused === 'invalid' && stayed && accepted === '' && kept && cleared,
        notes: JSON.stringify({ wrongInvalid, wrongValid, hash, defaults, refused, stayed, accepted, kept, cleared }),
      };
    },
  });

  cases.push({
    id: 'te_list_filter_ranking',
    description: 'La liste « § » classe : abréviation entière, puis commence par, puis contient, puis mot du texte qui commence ainsi (« bord » retrouve « ub », « u » ne remonte pas « rue » ni « Bonjour ») ; casse ignorée ; 50 lignes au plus',
    run: async () => {
      wipe();
      await TextExpansion.add('ub', 'université de Bordeaux');
      await TextExpansion.add('adr', '12 rue des Lilas, 33000 Bordeaux');
      await TextExpansion.add('bj', 'Bonjour,');
      await TextExpansion.add('sig', 'Cordialement, Antoine');
      await TextExpansion.add('club', 'le club de lecture');
      await TextExpansion.add('u', 'un texte');
      const f = q => names(TextExpansion.filterEntries(q));
      const results = {
        all: f(''),
        exactFirst: f('u'),
        startsThenContains: f('ub'),
        textWord: f('bord'),
        textWordCase: f('BORD'),
        notInsideWord: f('jour'),
        nothing: f('zzz'),
      };
      for (let i = 0; i < 60; i++) await TextExpansion.add('n' + i, 'texte ' + i);
      const capped = TextExpansion.filterEntries('n').length;
      const wanted = {
        exactFirst: 'u,ub,club',
        startsThenContains: 'ub,club',
        textWord: 'adr,ub',
        textWordCase: 'adr,ub',
        notInsideWord: '',
        nothing: '',
      };
      return {
        pass: results.exactFirst === wanted.exactFirst && results.startsThenContains === wanted.startsThenContains && results.textWord === wanted.textWord && results.textWordCase === wanted.textWordCase
          && results.notInsideWord === wanted.notInsideWord && results.nothing === wanted.nothing && results.all.split(',').length === 6 && capped === 50,
        notes: JSON.stringify({ results, capped }),
      };
    },
  });

  // === 2) L'éditeur ========================================================================================================================================

  cases.push({
    id: 'te_extension_plugins_are_installed_with_their_own_key_and_first_priority',
    description: 'L\'extension est dans l\'éditeur avec la priorité qui lui donne les touches avant les listes et les colonnes ; son plugin de liste a une clé distincte de celle du panneau # (deux plugins ne partagent pas une clé)',
    run: async () => {
      const editor = EditorCore.getEditor();
      const extension = editor.extensionManager.extensions.find(e => e.name === 'textExpansion');
      const keys = editor.state.plugins.map(p => p.key);
      const own = keys.filter(k => /^textExpansionSuggestion/.test(k)).length;
      const variables = keys.filter(k => /^suggestion\$/.test(k)).length;
      const inputRules = editor.state.plugins.filter(p => p.spec && p.spec.isInputRules).length;
      return {
        pass: !!extension && extension.config.priority === 1000 && own === 1 && variables === 1 && inputRules >= 1,
        notes: JSON.stringify({ found: !!extension, priority: extension && extension.config.priority, own, variables, inputRules, keys: keys.filter(k => /suggestion/i.test(k)) }),
      };
    },
  });

  cases.push({
    id: 'te_typed_abbreviation_is_replaced_at_space_and_punctuation',
    description: '« §ub » puis un espace (ou une ponctuation) devient « université de Bordeaux » suivi du caractère tapé ; inconnue, collée à une lettre ou en majuscules : inconnue reste telle quelle, collée n\'étend rien, la casse ne compte pas',
    run: async (h) => {
      wipe();
      await TextExpansion.add('ub', 'université de Bordeaux');
      const attempt = async typed => {
        await h.resetEditor();
        await h.focusAtEnd();
        for (const part of typed) await h.typeText(part);
        await h.sleep(60);
        return document.querySelector('.tiptap').textContent;
      };
      const results = {
        space: await attempt(['§ub', ' ']),
        dot: await attempt(['§ub', '.']),
        comma: await attempt(['Voir §ub', ',']),
        upper: await attempt(['§UB', ' ']),
        unknown: await attempt(['§zz', ' ']),
        afterLetter: await attempt(['a§ub', ' ']),
        noDelimiter: await attempt(['§ub', 'x']),
      };
      const wanted = {
        space: 'université de Bordeaux ', dot: 'université de Bordeaux.', comma: 'Voir université de Bordeaux,', upper: 'université de Bordeaux ',
        unknown: '§zz ', afterLetter: 'a§ub ', noDelimiter: '§ubx',
      };
      const wrong = Object.keys(wanted).filter(k => results[k] !== wanted[k]);
      return { pass: wrong.length === 0, notes: JSON.stringify({ wrong, results }) };
    },
  });

  cases.push({
    id: 'te_expansion_right_after_a_variable_badge',
    description: 'Une bulle de variable juste avant « §ub » n\'empêche pas l\'expansion (la bulle compte pour un caractère qui n\'est ni lettre ni chiffre), et la bulle reste en place',
    run: async (h) => {
      wipe();
      await TextExpansion.add('ub', 'université de Bordeaux');
      await h.resetEditor();
      Editor.setHTML('<p><span class="var-badge" data-table="Clients" data-column="Nom" data-key="Clients.Nom"></span></p>');
      await h.sleep(200);
      await h.focusAtEnd();
      await h.typeText('§ub');
      await h.typeText(' ');
      await h.sleep(60);
      const html = Editor.getHTML();
      return { pass: /var-badge/.test(html) && html.indexOf('université de Bordeaux ') !== -1 && html.indexOf('§') === -1, notes: html };
    },
  });

  cases.push({
    id: 'te_expansion_with_track_changes_is_a_single_insertion',
    description: 'Suivi des modifications actif : « §ub » + espace laisse une seule insertion « université de Bordeaux », sans reste de « §ub » ni suppression',
    run: async (h) => {
      wipe();
      await TextExpansion.add('ub', 'université de Bordeaux');
      await h.resetEditor();
      Editor.setHTML('<p>Début</p>');
      await h.sleep(200);
      if (!Editor.isTrackChangesOn()) await h.clickButton('v2-btn-track-changes');
      await h.focusAtEnd();
      await h.typeText(' §ub');
      await h.typeText(' ');
      await h.sleep(80);
      const html = Editor.getHTML();
      if (Editor.isTrackChangesOn()) await h.clickButton('v2-btn-track-changes');
      const insertions = (html.match(/<ins\b/g) || []).length;
      return {
        pass: /<ins[^>]*>[^<]*université de Bordeaux [^<]*<\/ins>/.test(html) && insertions === 1 && html.indexOf('<del') === -1 && html.indexOf('§') === -1,
        notes: html,
      };
    },
  });

  // Règle d'Antoine du 01/10 (« le dernier menu qui s'ouvre doit toujours être au-dessus de l'existant », js/layers.js) : la liste « § » est un menu. Elle prend le jeton --z-menu de
  // css/style.css (au-dessus de la barre flottante d'un tableau, qui garde son --z-floating-toolbar) et ViewportFit.placePopup la remonte (Layers.raise) devant un menu déjà ouvert.
  // Le NAVIGATEUR répond (elementFromPoint au centre de chaque ligne), jamais un z-index lu dans une feuille de style.
  const overlapPoint = (a, b) => {
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    const left = Math.max(ra.left, rb.left);
    const right = Math.min(ra.right, rb.right);
    const top = Math.max(ra.top, rb.top);
    const bottom = Math.min(ra.bottom, rb.bottom);
    return right - left < 4 || bottom - top < 4 ? null : { x: (left + right) / 2, y: (top + bottom) / 2 };
  };
  // true : `upper` est le premier élément atteint au centre du recouvrement ; false : autre chose y gagne ; null : ils ne se recouvrent pas (mise en place ratée, jamais un succès).
  const isOver = (upper, lower) => {
    const point = overlapPoint(upper, lower);
    if (!point) return null;
    const hit = document.elementFromPoint(point.x, point.y);
    return !!hit && upper.contains(hit);
  };
  const moveTo = (el, x, y) => {
    el.style.left = '0px';
    el.style.top = '0px';
    const r = el.getBoundingClientRect();
    el.style.left = (x - r.left) + 'px';
    el.style.top = (y - r.top) + 'px';
  };

  cases.push({
    id: 'te_expansion_list_opens_above_the_table_toolbar_and_open_menus',
    description: 'Dans une cellule de tableau, la barre du tableau reste affichée et la liste « § » s\'ouvre PAR-DESSUS (aucune de ses lignes ne passe dessous), et elle repasse devant un menu déjà ouvert',
    run: async (h) => {
      wipe();
      await TextExpansion.add('ub', 'université de Bordeaux');
      await TextExpansion.add('ue', 'université de l\'Europe');
      await h.resetEditor();
      window.scrollTo(0, 0);
      Editor.setHTML('<table><tbody><tr><td><p>a1</p></td><td><p>b1</p></td></tr><tr><td><p>a2</p></td><td><p>b2</p></td></tr></tbody></table><p>Après</p>');
      await h.sleep(300);
      const cellText = Array.from(document.querySelectorAll('.tiptap td p')).find(p => p.textContent === 'b1');
      if (!cellText) return { pass: false, notes: 'cellule introuvable' };
      await h.focusInElement(cellText);
      await sleep(200);
      const tableBar = () => {
        const button = document.querySelector('.v2-floating-toolbar.visible button[data-action="table-del"]');
        return button ? button.closest('.v2-floating-toolbar') : null;
      };
      const bar = tableBar();
      if (!bar) return { pass: false, notes: 'barre du tableau masquée ou absente' };
      EditorCore.getEditor().commands.insertContent({ type: 'text', text: ' ' });
      await h.typeText('§');
      await sleep(120);
      const box = document.getElementById('expansion-box');
      if (!box || box.style.display === 'none') return { pass: false, notes: 'liste « § » non ouverte' };
      if (!tableBar()) return { pass: false, notes: 'la barre du tableau a disparu à la frappe' };
      // La liste tombe sur la barre, comme à 700x400 quand la barre est repoussée sous le tableau : le coin de la liste sur celui de la barre.
      const barRect = bar.getBoundingClientRect();
      moveTo(box, barRect.left - 14, barRect.top - 8);
      const rows = Array.from(box.querySelectorAll('.ex-item')).filter(row => overlapPoint(row, bar));
      const coveredByBar = rows.filter(row => isOver(row, bar) !== true).map(row => row.textContent.slice(0, 20));
      const levels = { listZ: getComputedStyle(box).zIndex, barZ: getComputedStyle(bar).zIndex };
      // Un menu déjà ouvert : grand, au niveau des menus, posé APRÈS la liste dans la page et remonté avant elle - à niveau égal il gagnerait. La liste se replace à la frappe suivante.
      const earlier = document.createElement('div');
      earlier.style.cssText = 'position:absolute;z-index:var(--z-menu);left:40px;top:60px;width:560px;height:440px;background:#fff;border:2px solid #c00;box-sizing:border-box;';
      document.body.appendChild(earlier);
      Layers.raise(earlier);
      await h.typeText('u');
      await sleep(120);
      let overEarlier = null;
      if (box.style.display !== 'none') {
        moveTo(box, 120, 120);
        overEarlier = isOver(box, earlier);
      }
      earlier.remove();
      await h.resetEditor();
      return {
        pass: rows.length > 0 && coveredByBar.length === 0 && overEarlier === true,
        notes: JSON.stringify({ rows: rows.length, coveredByBar, overEarlier, ...levels }),
      };
    },
  });

  // === 3) L'écran Réglages > Raccourcis ====================================================================================================================

  cases.push({
    id: 'te_settings_tab_is_listed_and_translated',
    description: 'Réglages compte huit onglets dont « Raccourcis » (« Shortcuts » en anglais), son panneau est masqué tant qu\'on ne l\'ouvre pas, et tous ses textes - titre, libellés, boutons, message vide, notes - suivent la langue',
    run: async () => {
      wipe();
      const tabs = Array.from(document.querySelectorAll('.settings-tab')).map(t => t.getAttribute('data-settings-tab'));
      const panel = document.querySelector('.settings-panel[data-settings-panel="shortcuts"]');
      const hiddenAtStart = !!panel && panel.hidden && Array.from(document.querySelectorAll('.settings-panel')).filter(p => !p.hidden).length === 1;
      const snapshot = () => ({
        tab: document.querySelector('.settings-tab[data-settings-tab="shortcuts"]').textContent,
        title: document.getElementById('settings-expansion-title').textContent,
        intro: document.getElementById('settings-expansion-intro').textContent,
        char: document.querySelector('label[for="settings-expansion-char"]').textContent,
        abbr: document.querySelector('label[for="settings-expansion-abbr"]').textContent,
        text: document.querySelector('label[for="settings-expansion-text"]').textContent,
        placeholder: document.getElementById('settings-expansion-text').getAttribute('placeholder'),
        add: document.getElementById('settings-expansion-submit').textContent,
        cancel: document.getElementById('settings-expansion-cancel').textContent,
        empty: document.getElementById('settings-expansion-empty').textContent,
        note: document.getElementById('settings-expansion-empty').nextElementSibling.textContent,
      });
      const fr = snapshot();
      I18n.setLang('en');
      await sleep(80);
      const en = snapshot();
      I18n.setLang('fr');
      await sleep(80);
      const back = snapshot();
      const same = Object.keys(fr).filter(k => fr[k] === en[k]);
      return {
        pass: tabs.length === 8 && tabs[3] === 'shortcuts' && hiddenAtStart && fr.tab === 'Raccourcis' && en.tab === 'Shortcuts' && en.title === 'Abbreviations' && en.add === 'Add'
          && fr.add === 'Ajouter' && fr.intro.indexOf('§ub') !== -1 && en.intro.indexOf('§ub') !== -1 && same.length === 0 && JSON.stringify(back) === JSON.stringify(fr),
        notes: JSON.stringify({ tabs, hiddenAtStart, same, fr, en }),
      };
    },
  });

  // Mesures de contraste, mêmes formules que dev-tests/scenarios-contrast.js (rapport de luminance WCAG sur la couleur calculée et le vrai fond).
  const html = document.documentElement;
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
    id: 'te_contrast_popup_and_settings_reach_4_5_in_light_and_dark',
    description: 'Liste « § » (ligne choisie ou non) et onglet Raccourcis (liste, boutons, champs, texte d\'aide, message d\'erreur) : 4,5:1 au moins sur leur vrai fond, en clair et en sombre',
    run: async (h) => {
      wipe();
      await TextExpansion.add('ub', 'université de Bordeaux');
      await TextExpansion.add('adr', '12 rue des Lilas, 33000 Bordeaux');
      await h.resetEditor();
      await h.focusAtEnd();
      await h.typeText('§');
      await h.sleep(250);
      const box = document.getElementById('expansion-box');
      const opened = !!box && box.style.display !== 'none' && box.querySelectorAll('.ex-item').length === 2;
      document.getElementById('v2-btn-settings').click();
      document.querySelector('.settings-tab[data-settings-tab="shortcuts"]').click();
      if (window.ShortcutsPanel) ShortcutsPanel.showView('expansion'); // l'onglet s'ouvre sur les touches du clavier depuis js/shortcuts-panel.js
      await sleep(300);
      // Un message d'erreur à l'écran : un doublon.
      document.getElementById('settings-expansion-abbr').value = 'ub';
      document.getElementById('settings-expansion-text').value = 'x';
      document.getElementById('settings-expansion-form').requestSubmit();
      await sleep(250);
      const errorShown = !document.getElementById('settings-expansion-status').hidden;
      const before = html.getAttribute('data-theme');
      const noMotion = document.createElement('style');
      noMotion.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
      document.head.appendChild(noMotion);
      const byTheme = {};
      try {
        for (const theme of ['light', 'dark']) {
          html.setAttribute('data-theme', theme);
          const rows = box.querySelectorAll('.ex-item');
          const selected = box.querySelector('.ex-item.selected');
          const plain = Array.from(rows).find(r => r !== selected);
          const settingsRow = document.querySelector('.settings-expansion-row');
          const out = {
            'liste : abréviation (ligne choisie)': textRatio(selected.querySelector('.ex-abbr')),
            'liste : texte (ligne choisie)': textRatio(selected.querySelector('.ex-text')),
            'liste : abréviation': textRatio(plain.querySelector('.ex-abbr')),
            'liste : texte': textRatio(plain.querySelector('.ex-text')),
            'Réglages : abréviation de la liste': textRatio(settingsRow.querySelector('.settings-expansion-abbr')),
            'Réglages : texte de la liste': textRatio(settingsRow.querySelector('.settings-expansion-text')),
            'Réglages : bouton Modifier': textRatio(settingsRow.querySelector('button')),
            'Réglages : titre de section': textRatio(document.getElementById('settings-expansion-title')),
            'Réglages : explication': textRatio(document.getElementById('settings-expansion-intro')),
            'Réglages : libellé': textRatio(document.querySelector('label[for="settings-expansion-abbr"]')),
            'Réglages : saisie': textRatio(document.getElementById('settings-expansion-abbr')),
            'Réglages : saisie du texte': textRatio(document.getElementById('settings-expansion-text')),
            'Réglages : texte indicatif du champ': textRatio(document.getElementById('settings-expansion-abbr'), '::placeholder'),
            'Réglages : caractère déclencheur': textRatio(document.getElementById('settings-expansion-char')),
            'Réglages : message d\'erreur': textRatio(document.getElementById('settings-expansion-status')),
            'Réglages : note de bas': textRatio(document.getElementById('settings-expansion-empty').nextElementSibling),
          };
          const submit = document.getElementById('settings-expansion-submit');
          const text = parseColor(getComputedStyle(submit).color);
          const bg = parseColor(getComputedStyle(submit).backgroundColor);
          out['Réglages : bouton Ajouter (blanc sur bleu)'] = Math.round(ratio(text, over(bg, { r: 255, g: 255, b: 255, a: 1 })) * 100) / 100;
          byTheme[theme] = out;
        }
      } finally {
        if (before === null) html.removeAttribute('data-theme'); else html.setAttribute('data-theme', before);
        noMotion.remove();
        closeSettings();
        await h.sleep(60);
      }
      const bad = [];
      Object.keys(byTheme).forEach(theme => Object.entries(byTheme[theme]).forEach(([name, value]) => { if (!(value >= 4.5)) bad.push(theme + ' ' + name + ' ' + value); }));
      return { pass: opened && errorShown && bad.length === 0, notes: JSON.stringify({ opened, errorShown, bad, byTheme }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.textExpansion = cases;
})();
