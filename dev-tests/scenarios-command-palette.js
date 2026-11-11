// Suite "commandPalette" - la palette de commandes (js/command-palette.js, css/command-palette.css) et ce qu'elle demande à js/shortcuts.js : l'action `commandPalette` (Alt+/ ⌥/ sur Mac, la touche de
// « Rechercher dans les menus » de Google Docs ; Ctrl+K reste « Lien… »), la lecture d'Option+/ sur un clavier Mac (« ÷ »), `Shortcuts.state` (une commande est-elle faisable ici, et sinon pourquoi), puis la
// palette elle-même : ses commandes, la recherche (accents, ordre des mots, groupe, mots en plus), l'ordre, le grisé, ce qu'elle lance. Trois moitiés :
//  1) le REGISTRE : la touche d'origine, sa place dans Réglages > Raccourcis, les refus (Ctrl+K est celle du lien), le choix de la personne ;
//  2) `Shortcuts.state` : faisable, grisé avec sa raison, sans contrôle (toujours proposée) ;
//  3) la PALETTE : toutes les commandes sauf elle-même, la recherche, l'ordre, le grisé, le lancement, aucune trace dans le stockage.
// La vraie frappe (Alt+/ pris avant l'éditeur), le focus et la sélection rendus, la fenêtre de 700x400, les contrastes et le mode Mac sont dans dev-tests/verify-command-palette-keyboard.mjs.
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // Un KeyboardEvent « keydown » tel que le navigateur le fabrique pour cette touche (comme dev-tests/scenarios-shortcuts.js).
  function keydown(init) {
    return new KeyboardEvent('keydown', Object.assign({ bubbles: true, cancelable: true, composed: true }, init));
  }
  const paletteOpen = () => { const o = document.getElementById('pp-palette-modal'); return !!o && getComputedStyle(o).display !== 'none'; };
  const rows = () => Array.from(document.querySelectorAll('#pp-palette-list .pp-palette-row')).map(row => ({
    id: row.dataset.command, name: row.querySelector('.pp-palette-name').textContent, key: (row.querySelector('.pp-palette-key') || {}).textContent || '', off: row.classList.contains('is-off'),
  }));
  const typeQuery = query => { const input = document.querySelector('.pp-palette-input'); input.value = query; input.dispatchEvent(new Event('input', { bubbles: true })); };
  const ids = () => rows().map(r => r.id);

  async function reset(h, lang) {
    if (typeof CommandPalette !== 'undefined' && CommandPalette.isOpen()) CommandPalette.close();
    Shortcuts.setPlatform(null);
    Shortcuts.resetAll();
    try { localStorage.removeItem('pp_shortcuts'); } catch (e) { /* stockage indisponible */ }
    if (I18n.getLang() !== (lang || 'fr')) I18n.setLang(lang || 'fr');
    document.documentElement.removeAttribute('data-theme');
    const modal = document.getElementById('settings-modal');
    if (modal && modal.style.display !== 'none') document.getElementById('settings-close').click();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    await h.resetEditor();
  }

  // === 1. Le registre =====================================================================================================================================

  cases.push({
    id: 'cp_the_palette_is_an_action_with_alt_slash_as_its_starting_key',
    description: 'La palette est une action du registre (groupe Affichage, valable partout), sa touche d\'origine est Alt+/ ; elle s\'écrit « Alt+/ » (« ⌥/ » sur Mac), sa ligne est dans Réglages > Raccourcis, et Ctrl+K reste à « Lien… »',
    run: async (h) => {
      await reset(h);
      const action = Shortcuts.action('commandPalette');
      const out = {
        exists: !!action, group: action && action.group, scope: action && action.scope, key: Shortcuts.keyFor('commandPalette'), native: !!(action && action.native),
        label: Shortcuts.label('commandPalette'), name: I18n.t(action.label), link: Shortcuts.keyFor('link'),
      };
      Shortcuts.setPlatform('mac');
      out.macLabel = Shortcuts.label('commandPalette');
      Shortcuts.setPlatform(null);
      const rowsInSettings = (() => {
        document.getElementById('v2-btn-settings').click();
        document.querySelector('.settings-tab[data-settings-tab="shortcuts"]').click();
        ShortcutsPanel.showView('keys');
        const row = document.querySelector('.settings-key-row[data-action="commandPalette"]');
        const found = row ? { name: row.querySelector('.settings-key-name').textContent, key: row.querySelector('.settings-key-btn').textContent } : null;
        document.getElementById('settings-close').click();
        return found;
      })();
      out.settingsRow = rowsInSettings;
      const expected = {
        exists: true, group: 'view', scope: 'app', key: 'Alt+/', native: false, label: 'Alt+/', name: 'Palette de commandes', link: 'Mod+k',
        macLabel: '⌥/', settingsRow: { name: 'Palette de commandes', key: 'Alt+/' },
      };
      await reset(h);
      return { pass: JSON.stringify(out) === JSON.stringify(expected), notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'cp_ctrl_k_is_refused_for_the_palette_and_alt_slash_for_anything_else',
    description: 'Donner Ctrl+K à la palette est refusé (« déjà la touche de Lien… ») ; donner Alt+/ à une autre commande aussi (« déjà la touche de Palette de commandes ») ; une touche libre est acceptée, retirée la palette n\'a plus de touche, « Par défaut » rend Alt+/',
    run: async (h) => {
      await reset(h);
      const out = {};
      const ctrlK = Shortcuts.check('commandPalette', 'Mod+k');
      out.ctrlK = ctrlK.problem + ' / ' + (ctrlK.other && ctrlK.other.id);
      const slash = Shortcuts.check('bold', 'Alt+/');
      out.slash = slash.problem + ' / ' + (slash.other && slash.other.id);
      out.free = Shortcuts.check('commandPalette', 'Alt+q').problem === '';
      Shortcuts.setKey('commandPalette', 'Alt+q');
      out.moved = Shortcuts.keyFor('commandPalette') + ' ' + Shortcuts.isChanged('commandPalette');
      out.slashFreed = Shortcuts.check('bold', 'Alt+/').problem === '';
      Shortcuts.setKey('commandPalette', '');
      out.removed = JSON.stringify(Shortcuts.keyFor('commandPalette'));
      Shortcuts.resetKey('commandPalette');
      out.back = Shortcuts.keyFor('commandPalette') + ' ' + Shortcuts.isChanged('commandPalette');
      await reset(h);
      const expected = { ctrlK: 'duplicate / link', slash: 'duplicate / commandPalette', free: true, moved: 'Alt+q true', slashFreed: true, removed: '""', back: 'Alt+/ false' };
      return { pass: JSON.stringify(out) === JSON.stringify(expected), notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'cp_alt_slash_is_read_from_the_key_and_on_a_mac_from_the_physical_code',
    description: 'Alt+/ se lit sur la touche « / » ; sur un clavier Mac, Option+/ écrit « ÷ » et se lit sur le code physique (Slash) ; hors Mac « ÷ » avec Alt n\'est pas Alt+/ ; Maj ne compte pas pour la barre oblique, Ctrl+Alt reste de l\'AltGr',
    run: async (h) => {
      await reset(h);
      const combo = init => Shortcuts.fromEvent(keydown(init)).combo;
      const out = {
        plain: combo({ key: '/', code: 'Slash', altKey: true }),
        azertyShift: combo({ key: '/', code: 'Period', altKey: true, shiftKey: true }),
        ctrl: combo({ key: '/', code: 'Slash', ctrlKey: true }),
        notMac: combo({ key: '÷', code: 'Slash', altKey: true }),
        ctrlAlt: Shortcuts.fromEvent(keydown({ key: '/', code: 'Slash', altKey: true, ctrlKey: true })).altGr,
      };
      Shortcuts.setPlatform('mac');
      out.mac = combo({ key: '÷', code: 'Slash', altKey: true });
      out.macMeta = combo({ key: '/', code: 'Slash', metaKey: true });
      Shortcuts.setPlatform(null);
      await reset(h);
      const expected = { plain: 'Alt+/', azertyShift: 'Alt+/', ctrl: 'Mod+/', notMac: null, ctrlAlt: true, mac: 'Alt+/', macMeta: 'Mod+/' };
      return { pass: JSON.stringify(out) === JSON.stringify(expected), notes: JSON.stringify(out) };
    },
  });

  // === 2. Shortcuts.state ==================================================================================================================================

  cases.push({
    id: 'cp_state_says_whether_an_action_can_start_here_and_why_not',
    description: 'Shortcuts.state(id) : { available, reason } sans rien lancer - Gras est faisable avec le curseur dans le document ; en Lecture il est grisé AVEC la raison que dit le bouton ; « Rechercher » (sans bouton) est toujours faisable ; une action inconnue ne l\'est pas ; appeler state ne change pas le document',
    run: async (h) => {
      await reset(h);
      Editor.setHTML('<p>Bonjour monde</p>');
      await sleep(200);
      await h.focusAtEnd();
      const html = Editor.getHTML();
      const out = {};
      out.bold = JSON.stringify(Shortcuts.state('bold'));
      out.find = JSON.stringify(Shortcuts.state('find'));
      out.unknown = JSON.stringify(Shortcuts.state('nope'));
      const acceptAll = Shortcuts.state('acceptAll');
      out.acceptAll = acceptAll.available + ' ' + (acceptAll.reason.length > 5);
      document.getElementById('btn-mode-read').click();
      await sleep(300);
      const bold = Shortcuts.state('bold');
      out.boldRead = bold.available + ' ' + (bold.reason.length > 5);
      out.reasonIsTheButtons = bold.reason === LockReasons.reasonOf(document.getElementById('v2-btn-bold').closest('[' + LockReasons.REASON + ']'));
      out.findRead = Shortcuts.state('find').available;
      document.getElementById('btn-mode-edit').click();
      await sleep(300);
      out.sameDocument = Editor.getHTML() === html;
      await reset(h);
      const expected = {
        bold: '{"available":true,"reason":""}', find: '{"available":true,"reason":""}', unknown: '{"available":false,"reason":""}', acceptAll: 'false true',
        boldRead: 'false true', reasonIsTheButtons: true, findRead: true, sameDocument: true,
      };
      return { pass: JSON.stringify(out) === JSON.stringify(expected), notes: JSON.stringify(out) };
    },
  });

  // === 3. La palette ======================================================================================================================================

  cases.push({
    id: 'cp_palette_lists_every_command_but_itself_with_its_name_and_current_key',
    description: 'La palette ouvre une fenêtre (role=dialog) avec toutes les commandes de Réglages > Raccourcis sauf elle-même, dans l\'ordre de Réglages, le nom de chacune et sa touche actuelle (la touche choisie, pas celle d\'origine) ; cinq titres de groupe ; rien n\'est écrit dans le stockage',
    run: async (h) => {
      await reset(h);
      const storageBefore = JSON.stringify(Object.keys(localStorage).filter(k => k !== 'pp_shortcuts').sort());
      Shortcuts.setKey('bold', 'Alt+b');
      CommandPalette.open();
      await sleep(150);
      const list = rows();
      const expectedIds = Shortcuts.ACTIONS.filter(a => a.id !== 'commandPalette').map(a => a.id);
      const names = list.every(r => r.name === I18n.t(Shortcuts.action(r.id).label));
      const box = document.querySelector('#pp-palette-modal .pp-modal-box');
      const out = {
        open: paletteOpen(), dialog: box.getAttribute('role') + ' ' + box.getAttribute('aria-modal'), labelled: document.getElementById(box.getAttribute('aria-labelledby')).textContent,
        sameIds: JSON.stringify(ids()) === JSON.stringify(expectedIds), names,
        boldKey: list.find(r => r.id === 'bold').key, italicKey: list.find(r => r.id === 'italic').key, tableKey: JSON.stringify(list.find(r => r.id === 'table').key),
        groups: Array.from(document.querySelectorAll('.pp-palette-group')).map(g => g.textContent).join('|'),
        focusInInput: document.activeElement === document.querySelector('.pp-palette-input'),
      };
      CommandPalette.close();
      await sleep(80);
      out.closed = !paletteOpen();
      out.storage = JSON.stringify(Object.keys(localStorage).filter(k => k !== 'pp_shortcuts').sort()) === storageBefore && !Object.keys(localStorage).some(k => /palette/i.test(k));
      await reset(h);
      const expected = {
        open: true, dialog: 'dialog true', labelled: 'Palette de commandes', sameIds: true, names: true, boldKey: 'Alt+B', italicKey: 'Ctrl+I', tableKey: '""',
        groups: 'Modèles|Affichage|Mise en forme|Insertion|Historique et suivi', focusInInput: true, closed: true, storage: true,
      };
      return { pass: JSON.stringify(out) === JSON.stringify(expected), notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'cp_palette_search_ignores_accents_and_word_order_and_finds_by_group_or_keyword',
    description: 'Recherche : « pdf » trouve Exporter (mot en plus), « souligne » Souligné (sans accent), « tableau inserer » Insérer un tableau (mots en désordre), « mise en forme » toutes les commandes du groupe, « zzzz » rien ; une saisie sans lettre (« ... ») garde tout ; les majuscules ne comptent pas',
    run: async (h) => {
      await reset(h);
      CommandPalette.open();
      await sleep(100);
      const total = rows().length;
      const first = query => { typeQuery(query); return ids()[0]; };
      const formatIds = Shortcuts.ACTIONS.filter(a => a.group === 'format').map(a => a.id);
      const out = {
        pdf: first('pdf'), accent: first('souligne'), capital: first('SOULIGNÉ'), order: first('tableau inserer'), punctuation: first('Lien'),
        group: formatIds.every(id => { typeQuery('mise en forme'); return ids().indexOf(id) !== -1; }),
        none: (() => { typeQuery('zzzz'); return rows().length + ' ' + (document.querySelector('.pp-palette-empty').hidden ? 'caché' : document.querySelector('.pp-palette-empty').textContent); })(),
        noWords: (() => { typeQuery(' ... '); return rows().length === total; })(),
        cleared: (() => { typeQuery(''); return rows().length === total; })(),
      };
      CommandPalette.close();
      await reset(h);
      const expected = { pdf: 'exportPdf', accent: 'underline', capital: 'underline', order: 'table', punctuation: 'link', group: true, none: '0 Aucune commande ne correspond à « zzzz ».', noWords: true, cleared: true };
      return { pass: JSON.stringify(out) === JSON.stringify(expected), notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'cp_palette_ranks_names_that_start_with_the_word_before_the_rest',
    description: 'Ordre : le nom qui commence par le premier mot (rang 0), puis le nom qui le contient (1), puis le groupe ou les mots en plus (2) ; à rang égal, l\'ordre de Réglages. « titre » : Titre 1, 2, 3 d\'abord ; « liste » : les noms qui commencent par « Liste » dans l\'ordre de Réglages (Liste des modèles, Liste des raccourcis, Liste à puces, Liste numérotée…) ; « mise » : Appliquer la mise en forme avant les commandes qui n\'ont que le groupe',
    run: async (h) => {
      await reset(h);
      CommandPalette.open();
      await sleep(100);
      const order = query => { typeQuery(query); return ids(); };
      const names = query => { typeQuery(query); return rows().map(r => r.name); };
      const titre = order('titre');
      const liste = names('liste');
      const mise = order('mise en forme');
      const rankOf = (list, id) => list.indexOf(id);
      const out = {
        titre: titre.slice(0, 3).join(','),
        titreThen: titre.length > 3,
        listeStarts: liste.slice(0, 4).join(' | '),
        miseNameFirst: rankOf(mise, 'formatPaste') < rankOf(mise, 'bold'),
        miseAll: mise.length >= Shortcuts.ACTIONS.filter(a => a.group === 'format').length,
      };
      CommandPalette.close();
      await reset(h);
      const expected = {
        titre: 'heading1,heading2,heading3', titreThen: true,
        listeStarts: 'Liste des modèles | Liste des raccourcis | Liste à puces | Liste numérotée',
        miseNameFirst: true, miseAll: true,
      };
      return { pass: JSON.stringify(out) === JSON.stringify(expected), notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'cp_palette_runs_the_command_the_button_would_and_greys_what_it_would_not',
    description: 'Lancer une commande fait ce que fait son bouton (Gras sur la sélection) ; la palette se ferme avant ; une commande grisée en Lecture reste dans la liste, grisée, avec sa raison ; la lancer ne fait rien et laisse la fenêtre ouverte ; une commande sans contrôle qui n\'a rien fait le dit dans le coin d\'état',
    run: async (h) => {
      await reset(h);
      Editor.setHTML('<p>Bonjour monde</p>');
      await sleep(200);
      await h.focusAtEnd();
      const ed = EditorCore.getEditor();
      ed.chain().setTextSelection({ from: 9, to: 14 }).run();
      const out = { selected: ed.state.doc.textBetween(ed.state.selection.from, ed.state.selection.to) };
      CommandPalette.open();
      await sleep(150);
      typeQuery('gras');
      document.querySelector('.pp-palette-input').dispatchEvent(keydown({ key: 'Enter' }));
      await sleep(300);
      out.closedAfterRun = !paletteOpen();
      out.bold = /<strong>monde<\/strong>/.test(Editor.getHTML());
      // Lecture : Gras grisé, avec la raison du bouton
      document.getElementById('btn-mode-read').click();
      await sleep(300);
      const before = Editor.getHTML();
      CommandPalette.open();
      await sleep(150);
      typeQuery('gras');
      const bold = rows().find(r => r.id === 'bold');
      const row = document.querySelector('#pp-palette-list .pp-palette-row[data-command="bold"]');
      out.greyed = !!bold && bold.off && row.getAttribute('aria-disabled') === 'true' && row.title.length > 5;
      out.hintShowsReason = document.querySelector('.pp-palette-hint').textContent === row.title;
      document.querySelector('.pp-palette-input').dispatchEvent(keydown({ key: 'Enter' }));
      await sleep(200);
      out.stillOpen = paletteOpen();
      out.unchanged = Editor.getHTML() === before;
      out.liveSaysWhy = document.querySelector('.pp-palette-live').textContent.indexOf(I18n.t('palette.unavailable')) !== -1 || document.querySelector('.pp-palette-live').textContent.indexOf(row.title) !== -1;
      CommandPalette.close();
      document.getElementById('btn-mode-edit').click();
      await sleep(300);
      // Une commande sans contrôle qui ne fait rien : le coin d'état le dit.
      const status = [];
      CommandPalette.wire({ setStatus: message => status.push(message) });
      const realFind = FindReplace.open;
      FindReplace.open = () => false;
      CommandPalette.open();
      await sleep(150);
      typeQuery('rechercher');
      const findRow = rows().find(r => r.id === 'find');
      out.findListed = !!findRow && !findRow.off;
      document.querySelector('.pp-palette-input').dispatchEvent(keydown({ key: 'Enter' }));
      await sleep(250);
      FindReplace.open = realFind;
      out.status = status.join('|');
      CommandPalette.wire({ setStatus: () => {} });
      await reset(h);
      const expected = {
        selected: 'monde', closedAfterRun: true, bold: true, greyed: true, hintShowsReason: true, stillOpen: true, unchanged: true, liveSaysWhy: true, findListed: true, status: '« Rechercher » n’a rien fait ici.',
      };
      return { pass: JSON.stringify(out) === JSON.stringify(expected), notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'cp_palette_texts_are_english_on_a_page_that_starts_in_english',
    description: 'Page en anglais : le titre, l\'invite, la ligne du bas, le bouton, le message sans résultat, les noms des commandes et leurs mots en plus (« pdf » trouve Export, « bold » Bold) sont en anglais ; chaque commande a ses mots en plus dans les deux langues',
    lang: 'en',
    run: async (h) => {
      await reset(h, 'en');
      CommandPalette.open();
      await sleep(150);
      const out = {
        title: document.getElementById('pp-palette-title').textContent,
        label: document.querySelector('.pp-palette-input').getAttribute('aria-label'),
        placeholder: document.querySelector('.pp-palette-input').placeholder,
        hint: document.querySelector('.pp-palette-hint').textContent,
        close: document.querySelector('#pp-palette-modal .pp-palette-actions button').textContent,
        listLabel: document.getElementById('pp-palette-list').getAttribute('aria-label'),
        groups: Array.from(document.querySelectorAll('.pp-palette-group')).map(g => g.textContent).join('|'),
      };
      typeQuery('pdf');
      out.pdf = rows()[0].name;
      typeQuery('bold');
      out.bold = rows()[0].name;
      typeQuery('zzzz');
      out.none = document.querySelector('.pp-palette-empty').textContent;
      typeQuery('heading');
      out.heading = rows().slice(0, 3).map(r => r.name).join(', ');
      CommandPalette.close();
      // Les mots en plus existent dans les deux langues pour chaque action nommée.
      const keywordIds = Shortcuts.ACTIONS.map(a => a.id).filter(id => I18n.has('palette.kw.' + id));
      I18n.setLang('fr');
      const frOk = keywordIds.every(id => I18n.t('palette.kw.' + id).length > 2);
      I18n.setLang('en');
      const enOk = keywordIds.every(id => I18n.t('palette.kw.' + id).length > 2);
      out.keywords = keywordIds.length > 30 && frOk && enOk;
      await reset(h, 'en');
      const expected = {
        title: 'Command palette', label: 'Search for a command', placeholder: 'A command: pdf, table, bold…', hint: '↑ ↓ to choose · Enter to run · Esc to close', close: 'Close', listLabel: 'Commands',
        groups: 'Templates|View|Formatting|Insert|History and tracking', pdf: 'Export', bold: 'Bold', none: 'No command matches “zzzz”.', heading: 'Heading 1, Heading 2, Heading 3', keywords: true,
      };
      return { pass: JSON.stringify(out) === JSON.stringify(expected), notes: JSON.stringify(out) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.commandPalette = cases;
})();
