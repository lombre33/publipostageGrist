// Suite "shortcuts" - raccourcis clavier personnalisables (js/shortcuts.js, js/shortcuts-panel.js, css/shortcuts.css, onglet Réglages > Raccourcis > Touches), demande d'Antoine du
// 2026-10-01 : « pouvoir définir des raccourcis personnalisés (navigations, etc.) », choix de la carte « Tout, par personne ». Trois moitiés :
//  1) le NOYAU : une combinaison lue d'un évènement clavier (chiffres par le code physique, AltGr, ⌘ sur Mac) et écrite pour l'écran (Ctrl+Maj+K, ⌥⇧⌘K, Control+Shift+K) ;
//  2) les ACTIONS : chacune fait ce que fait son bouton (mêmes gardes : grisé, droits, Lecture), les touches de départ proposées, une touche changée libère l'ancienne,
//     les refus (doublon, touche gardée par le navigateur ou l'éditeur) et leurs raisons, le choix gardé par navigateur, les infobulles et les lignes de menu qui montrent la touche ;
//  3) l'ÉCRAN Réglages > Raccourcis : la liste des touches, l'écoute d'une combinaison, « Par défaut », textes français et anglais, contrastes en clair et en sombre.
// La vraie frappe (page.keyboard), la vraie souris dans Réglages et le panneau de 700x400 sont dans dev-tests/verify-shortcuts-keyboard.mjs : un KeyboardEvent construit ici ne dit
// ni l'ordre des écouteurs d'une vraie touche, ni ce que le navigateur en ferait.
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const html = document.documentElement;

  // « Alt+Shift+h », « Ctrl+b », « Meta+k », « F2 », « Alt+Enter », « Ctrl+/ », « Alt+Shift+1 » : un KeyboardEvent « keydown » tel que le navigateur le fabrique pour cette touche.
  function eventInit(combo) {
    const parts = combo.split('+');
    const key = parts.pop();
    const init = { bubbles: true, cancelable: true, composed: true, ctrlKey: parts.indexOf('Ctrl') !== -1, altKey: parts.indexOf('Alt') !== -1, shiftKey: parts.indexOf('Shift') !== -1, metaKey: parts.indexOf('Meta') !== -1 };
    if (/^[a-z]$/i.test(key)) { init.key = init.shiftKey ? key.toUpperCase() : key.toLowerCase(); init.code = 'Key' + key.toUpperCase(); }
    else if (/^\d$/.test(key)) { init.key = key; init.code = 'Digit' + key; }
    else if (key === '/') { init.key = '/'; init.code = 'Slash'; }
    else { init.key = key; init.code = key; }
    return init;
  }
  // La touche est « prise » (preventDefault) quand une action ou une touche rendue l'a arrêtée. `extra` : repeat, isComposing...
  function press(combo, target, extra) {
    const event = new KeyboardEvent('keydown', Object.assign(eventInit(combo), extra || {}));
    (target || document.activeElement || document.body).dispatchEvent(event);
    return event;
  }
  const inEditor = () => document.querySelector('.tiptap');

  // Remet tout à zéro : touches d'origine, plateforme, langue, thème, fenêtre Réglages fermée sur l'onglet Langue, éditeur vide.
  async function reset(h) {
    Shortcuts.setPlatform(null);
    Shortcuts.resetAll();
    try { localStorage.removeItem('pp_shortcuts'); localStorage.removeItem('pp_shortcuts_view'); } catch (e) { /* stockage indisponible */ }
    if (I18n.getLang() !== 'fr') I18n.setLang('fr');
    html.removeAttribute('data-theme');
    const modal = document.getElementById('settings-modal');
    if (modal && modal.style.display !== 'none') {
      ShortcutsPanel.stopRecording();
      document.getElementById('settings-close').click();
    }
    document.querySelector('.settings-tab[data-settings-tab="language"]').click();
    ShortcutsPanel.showView('keys');
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    await h.resetEditor();
  }
  // Document « Bonjour monde » avec le curseur à la fin.
  async function withText(h, text) {
    Editor.setHTML('<p>' + (text || 'Bonjour monde') + '</p>');
    await sleep(200);
    await h.focusAtEnd();
  }
  // Compte les appuis (clic ou mousedown : quelques boutons de la barre sont câblés sur mousedown) sur ces boutons sans les laisser aller au bout (un export, une suppression, un
  // nouveau modèle ne sont pas ce qu'on mesure ici).
  function spyPresses(ids) {
    const seen = [];
    const listener = event => {
      const el = event.target && event.target.closest && event.target.closest(ids.map(id => '#' + id).join(','));
      if (!el) return;
      seen.push(el.id);
      event.stopImmediatePropagation();
      event.preventDefault();
    };
    document.addEventListener('click', listener, true);
    document.addEventListener('mousedown', listener, true);
    return { seen, stop: () => { document.removeEventListener('click', listener, true); document.removeEventListener('mousedown', listener, true); } };
  }
  // Un champ de saisie visible hors de l'éditeur, qui a vraiment le focus (le champ « Objet » de l'e-mail est masqué hors du mode e-mail : un focus() n'y prendrait rien et le test
  // passerait avec le curseur resté dans le document).
  function textField() {
    const input = document.createElement('input');
    input.type = 'text';
    input.style.cssText = 'position:fixed;left:0;top:0;width:120px;height:20px;z-index:99999';
    document.body.appendChild(input);
    input.focus();
    if (document.activeElement !== input) { input.remove(); throw new Error('le champ de saisie de test n\'a pas pris le focus'); }
    return input;
  }
  const label = id => Shortcuts.label(id);
  const afterContent = (el, pseudo) => getComputedStyle(el, pseudo || '::after').content.replace(/^"|"$/g, '');
  const settingsOpen = () => getComputedStyle(document.getElementById('settings-modal')).display !== 'none';
  function openKeysPanel() {
    document.getElementById('v2-btn-settings').click();
    document.querySelector('.settings-tab[data-settings-tab="shortcuts"]').click();
    ShortcutsPanel.showView('keys');
  }

  // === 1) Le noyau ==========================================================================================================================================

  cases.push({
    id: 'sc_combos_are_read_from_events_and_written_for_the_screen',
    description: 'Une combinaison se lit d\'un évènement clavier (chiffres par le code physique, Maj retiré pour un signe, AltGr = Ctrl+Alt ignoré, ⌘ sur Mac) et s\'écrit pour l\'écran (Ctrl+Maj+K, Ctrl+Alt+Shift+K, ⌥⇧⌘K) et pour les lecteurs d\'écran (Control+Shift+K)',
    run: async (h) => {
      await reset(h);
      const read = (init, platform) => { Shortcuts.setPlatform(platform || 'other'); const r = Shortcuts.fromEvent(init); Shortcuts.setPlatform(null); return r; };
      const out = {
        altL: read({ key: 'l', code: 'KeyL', altKey: true }).combo,
        ctrlB: read({ key: 'b', code: 'KeyB', ctrlKey: true }).combo,
        shiftLetter: read({ key: 'H', code: 'KeyH', altKey: true, shiftKey: true }).combo,
        azertyDigit: read({ key: '&', code: 'Digit1', altKey: true }).combo,
        azertyShiftDigit: read({ key: '1', code: 'Digit1', altKey: true, shiftKey: true }).combo,
        slash: read({ key: '/', code: 'Slash', ctrlKey: true }).combo,
        shiftedSign: read({ key: '?', code: 'Slash', ctrlKey: true, shiftKey: true }).combo,
        enter: read({ key: 'Enter', code: 'Enter', altKey: true }).combo,
        f2: read({ key: 'F2', code: 'F2' }).combo,
        space: read({ key: ' ', code: 'Space', ctrlKey: true }).combo,
        macOptionLetter: read({ key: '¬', code: 'KeyL', altKey: true }, 'mac').combo,
        macCommand: read({ key: 'b', code: 'KeyB', metaKey: true }, 'mac').combo,
        macControl: read({ key: 'a', code: 'KeyA', ctrlKey: true }, 'mac').combo,
        winKey: read({ key: 'b', code: 'KeyB', metaKey: true }).combo,
        onlyShift: read({ key: 'Shift', code: 'ShiftLeft', shiftKey: true }).combo,
        onlyAlt: read({ key: 'Alt', code: 'AltLeft', altKey: true }).combo,
        plus: read({ key: '+', code: 'Equal', ctrlKey: true, shiftKey: true }).combo,
      };
      const altGr = read({ key: '@', code: 'Digit0', ctrlKey: true, altKey: true });
      const macAltCtrl = read({ key: 'k', code: 'KeyK', ctrlKey: true, altKey: true }, 'mac');
      const fmt = (combo, lang, platform) => { Shortcuts.setPlatform(platform || 'other'); if (I18n.getLang() !== lang) I18n.setLang(lang); const t = Shortcuts.format(combo); Shortcuts.setPlatform(null); return t; };
      const written = {
        fr: fmt('Mod+Alt+Shift+k', 'fr'), en: fmt('Mod+Alt+Shift+k', 'en'), mac: fmt('Mod+Alt+Shift+k', 'en', 'mac'),
        enterFr: fmt('Alt+Enter', 'fr'), enterEn: fmt('Alt+Enter', 'en'), enterMac: fmt('Alt+Enter', 'en', 'mac'),
        f2: fmt('F2', 'fr'), slash: fmt('Mod+/', 'fr'), none: fmt('', 'fr'), bad: fmt('Foo+k', 'fr'),
      };
      I18n.setLang('fr');
      const aria = { other: (Shortcuts.setPlatform('other'), Shortcuts.ariaKeys('Mod+Alt+Shift+k')), mac: (Shortcuts.setPlatform('mac'), Shortcuts.ariaKeys('Mod+b')), named: (Shortcuts.setPlatform('other'), Shortcuts.ariaKeys('Alt+Enter')) };
      Shortcuts.setPlatform(null);
      const pass = out.altL === 'Alt+l' && out.ctrlB === 'Mod+b' && out.shiftLetter === 'Alt+Shift+h' && out.azertyDigit === 'Alt+1' && out.azertyShiftDigit === 'Alt+Shift+1'
        && out.slash === 'Mod+/' && out.shiftedSign === 'Mod+?' && out.enter === 'Alt+Enter' && out.f2 === 'F2' && out.space === 'Mod+Space'
        && out.macOptionLetter === 'Alt+l' && out.macCommand === 'Mod+b' && out.macControl === 'Ctrl+a'
        && out.winKey === null && out.onlyShift === null && out.onlyAlt === null && out.plus === null
        && altGr.altGr === true && macAltCtrl.altGr === false && macAltCtrl.combo === 'Ctrl+Alt+k'
        && written.fr === 'Ctrl+Alt+Maj+K' && written.en === 'Ctrl+Alt+Shift+K' && written.mac === '⌥⇧⌘K'
        && written.enterFr === 'Alt+Entrée' && written.enterEn === 'Alt+Enter' && written.enterMac === '⌥↩' && written.f2 === 'F2' && written.slash === 'Ctrl+/' && written.none === '' && written.bad === ''
        && aria.other === 'Control+Alt+Shift+K' && aria.mac === 'Meta+B' && aria.named === 'Alt+Enter';
      return { pass, notes: JSON.stringify({ out, altGr, macAltCtrl, written, aria }) };
    },
  });

  cases.push({
    id: 'sc_form_problems_and_stored_combos',
    description: 'Une touche seule, une combinaison illisible, Ctrl+lettre sur Mac sont refusées avec leur code ; un choix abîmé dans le navigateur (JSON cassé, action disparue, combinaison illisible, touche seule) est ignoré sans casser le reste',
    run: async (h) => {
      await reset(h);
      const problem = (combo, platform) => { Shortcuts.setPlatform(platform || 'other'); const p = Shortcuts.formProblem(combo); Shortcuts.setPlatform(null); return p; };
      const out = {
        alone: problem('a'), shiftOnly: problem('Shift+a'), ok: problem('Alt+a'), f: problem('F2'), garbage: problem('Foo+a'), empty: problem(''),
        macCtrl: problem('Ctrl+a', 'mac'), macCtrlAlt: problem('Ctrl+Alt+a', 'mac'), macMod: problem('Mod+a', 'mac'), otherCtrl: problem('Ctrl+a'),
      };
      // Stockage abîmé : seules les entrées lisibles survivent.
      const stored = {};
      localStorage.setItem('pp_shortcuts', '{ pas du json');
      Shortcuts.reload();
      stored.brokenJson = Shortcuts.keyFor('bold');
      localStorage.setItem('pp_shortcuts', JSON.stringify({ bold: 'Alt+b', italic: 'a', underline: 'Foo+u', gone: 'Alt+z', strike: 12, highlight: '' }));
      Shortcuts.reload();
      stored.bold = Shortcuts.keyFor('bold');
      stored.italic = Shortcuts.keyFor('italic');
      stored.underline = Shortcuts.keyFor('underline');
      stored.strike = Shortcuts.keyFor('strike');
      stored.highlightNone = Shortcuts.keyFor('highlight');
      stored.highlightChanged = Shortcuts.isChanged('highlight');
      const pass = out.alone === 'needsModifier' && out.shiftOnly === 'needsModifier' && out.ok === '' && out.f === '' && out.garbage === 'invalid' && out.empty === 'invalid'
        && out.macCtrl === 'macCtrl' && out.macCtrlAlt === '' && out.macMod === '' && out.otherCtrl === ''
        && stored.brokenJson === 'Mod+b' && stored.bold === 'Alt+b' && stored.italic === 'Mod+i' && stored.underline === 'Mod+u' && stored.strike === 'Mod+Shift+s'
        && stored.highlightNone === '' && stored.highlightChanged === true;
      await reset(h);
      return { pass, notes: JSON.stringify({ out, stored }) };
    },
  });

  // === 2) Les actions =======================================================================================================================================

  cases.push({
    id: 'sc_every_action_is_wired_to_a_real_control_and_named_in_both_languages',
    description: 'Chacune des actions pointe un vrai bouton ou une vraie ligne de menu de index.html, porte un nom français et anglais, appartient à un groupe de la liste, et les éléments qui montrent sa touche existent',
    run: async (h) => {
      await reset(h);
      const problems = [];
      const ids = {};
      const needsControl = { templates: '#v2-title-cluster .tts-trigger', keysList: '#v2-btn-settings', today: '#v2-btn-insert-variable', heading1: '#v2-heading-flyout .v2-hover-row[data-level="1"]', heading2: '#v2-heading-flyout .v2-hover-row[data-level="2"]', heading3: '#v2-heading-flyout .v2-hover-row[data-level="3"]' };
      const names = { fr: {}, en: {} };
      ['fr', 'en'].forEach(lang => {
        I18n.setLang(lang);
        Shortcuts.ACTIONS.forEach(action => { names[lang][action.id] = I18n.t(action.label); });
      });
      I18n.setLang('fr');
      Shortcuts.ACTIONS.forEach(action => {
        if (ids[action.id]) problems.push('identifiant en double : ' + action.id);
        ids[action.id] = true;
        if (Shortcuts.GROUPS.indexOf(action.group) === -1) problems.push(action.id + ' : groupe inconnu ' + action.group);
        ['fr', 'en'].forEach(lang => {
          const text = names[lang][action.id];
          if (!text || text === action.label) problems.push(action.id + ' : pas de nom ' + lang + ' (' + action.label + ')');
        });
        [action.hint, action.aria].filter(Boolean).forEach(selector => { if (!document.querySelector(selector)) problems.push(action.id + ' : rien ne correspond à ' + selector); });
        if (needsControl[action.id] && !document.querySelector(needsControl[action.id])) problems.push(action.id + ' : contrôle introuvable ' + needsControl[action.id]);
      });
      // Chaque action est lancée une fois, tous les clics avalés (ni suppression, ni export, ni nouveau modèle) : les contrôles qu'elle va chercher par leur identifiant existent
      // (un identifiant renommé dans index.html ferait une touche qui ne fait plus rien, sans une ligne d'erreur), et celles qui n'ont pas pu partir sont connues d'avance.
      const swallowed = [];
      const swallow = event => { swallowed.push(event.target && (event.target.id || event.target.className)); event.stopImmediatePropagation(); event.preventDefault(); };
      const requested = {};
      const realGet = document.getElementById;
      let current = '';
      document.getElementById = function (id) { (requested[current] = requested[current] || []).push(id); return realGet.call(document, id); };
      document.addEventListener('click', swallow, true);
      document.addEventListener('mousedown', swallow, true);
      const ran = {};
      try {
        await withText(h);
        for (const action of Shortcuts.ACTIONS) { current = action.id; ran[action.id] = Shortcuts.run(action.id) === true; }
        // Les retraits ne se pressent que dans une liste (grisés ailleurs, comme leur bouton) : la deuxième puce peut descendre d'un niveau, une puce imbriquée peut remonter.
        const inList = async (markup, id) => {
          Editor.setHTML(markup);
          await sleep(200);
          const editor = EditorCore.getEditor();
          let at = null;
          editor.state.doc.descendants((node, pos) => { if (node.isText && node.text === 'b') at = pos + node.nodeSize; });
          editor.chain().setTextSelection(at).focus().run();
          await sleep(250);
          current = id;
          ran[id] = Shortcuts.run(id) === true;
        };
        await inList('<ul><li><p>a</p></li><li><p>b</p></li></ul>', 'indent');
        await inList('<ul><li><p>a</p><ul><li><p>b</p></li></ul></li></ul>', 'outdent');
      } finally {
        document.removeEventListener('click', swallow, true);
        document.removeEventListener('mousedown', swallow, true);
        document.getElementById = realGet;
        if (FindReplace.isOpen()) FindReplace.close(); // « Rechercher » et « Remplacer » ont ouvert la barre de recherche
      }
      Object.keys(requested).forEach(id => requested[id].forEach(target => { if (!realGet.call(document, target)) problems.push(id + ' : #' + target + ' n\'existe pas dans index.html'); }));
      const notRun = Object.keys(ran).filter(id => !ran[id]).sort();
      // Rien à presser dans l'état de départ : pas de modèle à marquer par défaut, ni de modifications suivies à accepter ou refuser.
      const expectedNotRun = ['acceptAll', 'rejectAll', 'setDefault'].sort();
      const unexpected = notRun.filter(id => expectedNotRun.indexOf(id) === -1);
      const groupsWithoutAction = Shortcuts.GROUPS.filter(g => !Shortcuts.ACTIONS.some(a => a.group === g));
      const count = Shortcuts.ACTIONS.length;
      await reset(h);
      return { pass: problems.length === 0 && groupsWithoutAction.length === 0 && count >= 40 && unexpected.length === 0 && swallowed.length >= 30, notes: JSON.stringify({ count, problems, groupsWithoutAction, notRun, unexpected, clicks: swallowed.length }) };
    },
  });

  cases.push({
    id: 'sc_default_keys_are_the_ones_proposed_to_antoine_and_never_clash',
    description: 'Les touches de départ sont celles de la carte (Alt+L Lecture, Alt+E Édition, Alt+M modèles, F2 renommer, Alt+P export PDF, Ctrl+/ liste, Alt+Maj+1 2 3 titres, Alt+Maj+H surligner, Alt+Entrée saut de page, Alt+Maj+M commentaire, Alt+Maj+D date du jour) ; les touches déjà liées (Ctrl+S, Ctrl+K, Ctrl+B...) y figurent ; aucune touche n\'est prise deux fois, aucune n\'est gardée par le navigateur',
    run: async (h) => {
      await reset(h);
      const expected = {
        modeRead: 'Alt+l', modeEdit: 'Alt+e', templates: 'Alt+m', rename: 'F2', exportPdf: 'Alt+p', keysList: 'Mod+/',
        heading1: 'Alt+Shift+1', heading2: 'Alt+Shift+2', heading3: 'Alt+Shift+3', highlight: 'Alt+Shift+h', pageBreak: 'Alt+Enter', comment: 'Alt+Shift+m', today: 'Alt+Shift+d',
        save: 'Mod+s', link: 'Mod+k', bold: 'Mod+b', italic: 'Mod+i', underline: 'Mod+u', undo: 'Mod+z', redo: 'Mod+y', find: 'Mod+f', replace: 'Mod+h',
      };
      const wrong = Object.keys(expected).filter(id => Shortcuts.keyFor(id) !== expected[id]).map(id => id + ' = ' + Shortcuts.keyFor(id));
      const without = ['sizeUp', 'sizeDown', 'table', 'image', 'twoColumns', 'toc', 'textColor', 'delete', 'new'].filter(id => Shortcuts.keyFor(id) !== '');
      const seen = {};
      const clashes = [];
      Shortcuts.ACTIONS.forEach(a => {
        [a.key].concat(a.aliases || []).filter(Boolean).forEach(combo => {
          if (seen[combo]) clashes.push(combo + ' : ' + seen[combo] + ' et ' + a.id);
          seen[combo] = a.id;
        });
      });
      // Aucune touche de départ n'est refusée par la liste elle-même (« gardée par le navigateur », une touche seule...).
      const refused = Shortcuts.ACTIONS.filter(a => a.key && a.key !== 'Mod+Alt+c' && (Shortcuts.formProblem(a.key) || ['Mod+n', 'Mod+t', 'Mod+w'].indexOf(a.key) !== -1)).map(a => a.id + ' : ' + a.key);
      const labels = ['modeRead', 'heading1', 'pageBreak', 'save', 'keysList'].map(id => label(id));
      const pass = wrong.length === 0 && without.length === 0 && clashes.length === 0 && refused.length === 0
        && labels.join(' | ') === 'Alt+L | Alt+Maj+1 | Alt+Entrée | Ctrl+S | Ctrl+/';
      return { pass, notes: JSON.stringify({ wrong, without, clashes, refused, labels }) };
    },
  });

  cases.push({
    id: 'sc_buttons_tooltips_menu_rows_and_screen_readers_show_the_key',
    description: 'La touche s\'affiche dans l\'infobulle des boutons (« Gras (Ctrl+B) »), à droite des lignes de menu (Citation, Titre 1), après le titre des menus (« Exporter en PDF (Alt+P) ») et se dit aux lecteurs d\'écran (aria-keyshortcuts) ; elle suit une touche changée, la langue et une touche retirée',
    run: async (h) => {
      await reset(h);
      const bold = document.getElementById('v2-btn-bold');
      const read = () => ({
        tip: afterContent(bold), keytip: bold.getAttribute('data-keytip'), aria: bold.getAttribute('aria-keyshortcuts'),
        row: document.getElementById('v2-btn-citation').getAttribute('data-keyhint'), rowShown: afterContent(document.getElementById('v2-btn-citation')),
        heading: document.querySelector('#v2-heading-flyout .v2-hover-row[data-level="2"]').getAttribute('data-keyhint'),
        menuTitle: afterContent(document.querySelector('#v2-export-pdf-flyout .v2-hover-flyout-label')),
        pdfAria: document.getElementById('btn-export-pdf').getAttribute('aria-keyshortcuts'),
        listAria: document.getElementById('v2-btn-bullet').getAttribute('aria-keyshortcuts'),
        linkAria: document.getElementById('v2-btn-link').getAttribute('aria-keyshortcuts'),
      });
      const start = read();
      Shortcuts.setKey('bold', 'Alt+b');
      const moved = read();
      I18n.setLang('en');
      const english = read();
      I18n.setLang('fr');
      const afterLang = read();
      Shortcuts.setKey('bold', '');
      const removed = read();
      Shortcuts.resetKey('bold');
      const back = read();
      const pass = start.tip === 'Gras (Ctrl+B)' && start.keytip === ' (Ctrl+B)' && start.aria === 'Control+B' && start.row === 'Ctrl+Maj+B' && start.rowShown === 'Ctrl+Maj+B'
        && start.heading === 'Alt+Maj+2' && start.menuTitle === ' (Alt+P)' && start.pdfAria === 'Alt+P' && start.listAria === 'Control+Shift+8' && start.linkAria === 'Control+K'
        && moved.tip === 'Gras (Alt+B)' && moved.aria === 'Alt+B'
        && english.tip === 'Bold (Alt+B)' && english.row === 'Ctrl+Shift+B' && english.heading === 'Alt+Shift+2'
        && afterLang.tip === 'Gras (Alt+B)'
        && removed.tip === 'Gras' && removed.keytip === null && removed.aria === null
        && back.tip === 'Gras (Ctrl+B)' && back.aria === 'Control+B';
      await reset(h);
      return { pass, notes: JSON.stringify({ start, moved, english, afterLang, removed, back }) };
    },
  });

  cases.push({
    id: 'sc_starter_keys_do_what_their_buttons_do',
    description: 'Alt+L passe en Lecture, Alt+E en Édition (curseur rendu au document), Alt+Maj+1 met un titre 1 et une seconde fois rend le paragraphe, Alt+Entrée insère un saut de page, Alt+Maj+D la bulle « Date du jour », Alt+Maj+H surligne la sélection, Ctrl+/ ouvre Réglages sur les touches ; un Alt+P et un F2 cliquent les boutons Exporter en PDF et Renommer',
    run: async (h) => {
      await reset(h);
      const mode = () => (document.getElementById('btn-mode-read').classList.contains('active') ? 'read' : 'edit');
      const out = {};
      await withText(h);
      out.altL = press('Alt+l', inEditor()).defaultPrevented; await sleep(200);
      out.modeAfterAltL = mode();
      out.altE = press('Alt+e', document.body).defaultPrevented; await sleep(200);
      out.modeAfterAltE = mode();
      out.focusAfterAltE = !!document.activeElement.closest && !!document.activeElement.closest('.ProseMirror');
      await withText(h);
      press('Alt+Shift+1', inEditor()); await sleep(150);
      out.h1 = Editor.getHTML().indexOf('<h1>Bonjour monde</h1>') !== -1;
      press('Alt+Shift+1', inEditor()); await sleep(150);
      out.h1Off = Editor.getHTML().indexOf('<h1') === -1 && Editor.getHTML().indexOf('<p>Bonjour monde</p>') !== -1;
      press('Alt+Shift+2', inEditor()); await sleep(150);
      out.h2 = Editor.getHTML().indexOf('<h2>Bonjour monde</h2>') !== -1;
      press('Alt+Shift+3', inEditor()); await sleep(150);
      out.h3 = Editor.getHTML().indexOf('<h3>Bonjour monde</h3>') !== -1;
      await withText(h);
      press('Alt+Enter', inEditor()); await sleep(150);
      out.pageBreak = Editor.getHTML().indexOf('page-break-marker') !== -1;
      await withText(h);
      press('Alt+Shift+d', inEditor()); await sleep(150);
      out.today = Editor.getHTML().indexOf('data-chip-kind="date"') !== -1;
      await withText(h, 'surligné');
      await h.selectAllInEditor();
      press('Alt+Shift+h', inEditor()); await sleep(150);
      out.highlight = /<span style="background-color: rgb\(255, 242, 168\);">surligné<\/span>/.test(Editor.getHTML());
      // Exporter et Renommer : le clic part, le reste est l'affaire des boutons.
      const spy = spyPresses(['btn-export-pdf', 'btn-rename-template', 'btn-new', 'btn-delete', 'btn-mode-edit-never']);
      press('Alt+p', document.body); press('F2', document.body);
      out.buttonsClicked = spy.seen.join(',');
      spy.stop();
      // Ctrl+/ : Réglages sur l'onglet Raccourcis, au tableau des touches, premier bouton de touche au focus.
      press('Ctrl+/', document.body); await sleep(250);
      out.settings = settingsOpen() && !document.querySelector('.settings-panel[data-settings-panel="shortcuts"]').hidden && !document.getElementById('settings-keys-section').hidden;
      out.firstKeyFocused = document.activeElement && document.activeElement.classList.contains('settings-key-btn');
      const pass = out.altL === true && out.modeAfterAltL === 'read' && out.altE === true && out.modeAfterAltE === 'edit' && out.focusAfterAltE === true
        && out.h1 && out.h1Off && out.h2 && out.h3 && out.pageBreak && out.today && out.highlight
        && out.buttonsClicked === 'btn-export-pdf,btn-rename-template' && out.settings && out.firstKeyFocused;
      await reset(h);
      return { pass, notes: JSON.stringify(out) };
    },
  });

  // === Chaque action fait ce que fait son bouton ============================================================================================================
  // Le geste de la souris sur un bouton : les évènements que le navigateur envoie dans l'ordre. Les boutons de la barre sont câblés, selon le cas, sur click (la plupart), sur
  // mousedown (couleur de police, surlignage, taille de police) ou sur pointerdown : le geste complet les atteint tous.
  function mouseGesture(el) {
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
      const Ctor = type.indexOf('pointer') === 0 ? PointerEvent : MouseEvent;
      el.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true, composed: true, button: 0, view: window }));
    });
  }
  // Tout ce qu'une action peut changer : le document (identifiants aléatoires gommés), les fenêtres et menus ouverts, l'état des boutons de la barre.
  function effectOf() {
    const html = Editor.getHTML().replace(/(data-[a-z-]*id|id)="[^"]{6,}"/g, '$1="#"');
    const overlays = Array.from(document.querySelectorAll('.pp-modal, [class*="popup"], [class*="dropdown"], [class*="floating"], [class*="picker"]'))
      .filter(el => el.isConnected && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden' && el.getClientRects().length > 0)
      .map(el => el.id || el.className).sort();
    const toolbar = Array.from(document.querySelectorAll('#v2-toolbar button, .bar-row button')).map(b => b.id + ':' + (b.classList.contains('active') || b.classList.contains('is-active') ? 'on' : '') + (b.disabled ? ':off' : '') + (b.getAttribute('aria-pressed') || '')).join(',');
    return JSON.stringify({ html, overlays, toolbar, tracking: Editor.isTrackChangesOn(), alerts: (window.__shortcutAlerts || []).join('|') });
  }
  // Referme ce qu'une action a ouvert (menu de nuances, fenêtre, fil de commentaire) pour que la seconde manche parte du même état que la première.
  async function closeOverlays() {
    for (let i = 0; i < 3; i++) {
      if (typeof EditorCore !== 'undefined' && EditorCore.closeDropdownPanel) EditorCore.closeDropdownPanel();
      const target = document.activeElement || document.body;
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
      await sleep(80);
    }
  }

  const PARA = '<p>Bonjour monde</p>';
  const MOUSE_BUTTON = {
    bold: '#v2-btn-bold', italic: '#v2-btn-italic', underline: '#v2-btn-underline', strike: '#v2-btn-strike',
    alignLeft: '#v2-btn-align-left', alignCenter: '#v2-btn-align-center', alignRight: '#v2-btn-align-right', alignJustify: '#v2-btn-align-justify',
    bulletList: '#v2-btn-bullet', orderedList: '#v2-btn-ordered-numeric', indent: '#v2-btn-indent', outdent: '#v2-btn-outdent',
    sizeUp: '#v2-size-plus', sizeDown: '#v2-size-minus', textColor: '#v2-btn-text-color', highlight: '#v2-btn-highlight',
    heading1: '#v2-heading-flyout .v2-hover-row[data-level="1"]', heading2: '#v2-heading-flyout .v2-hover-row[data-level="2"]', heading3: '#v2-heading-flyout .v2-hover-row[data-level="3"]',
    pageBreak: '#v2-btn-page-break', toc: '#v2-btn-toc', twoColumns: '#v2-btn-two-columns', citation: '#v2-btn-citation', codeBlock: '#v2-btn-code-block', callout: '#v2-btn-callout',
    signature: '#v2-btn-signature', qrCode: '#v2-btn-qr', table: '#v2-btn-table', link: '#v2-btn-link', comment: '#v2-btn-comment', variable: '#v2-btn-insert-variable',
    undo: '#v2-btn-undo', redo: '#v2-btn-redo', trackChanges: '#v2-btn-track-changes', find: '#v2-btn-find',
  };
  // Le document de départ de chaque action : { markup, sel: 'all' (tout sélectionné) | 'end' | 'inB' (curseur à la fin de « b »), pre (ce qu'il faut avoir fait avant) }.
  const START = {
    alignLeft: { markup: '<p style="text-align: center">Bonjour monde</p>', sel: 'all' },
    indent: { markup: '<ul><li><p>a</p></li><li><p>b</p></li></ul>', sel: 'inB' },
    outdent: { markup: '<ul><li><p>a</p><ul><li><p>b</p></li></ul></li></ul>', sel: 'inB' },
    bulletList: { sel: 'end' }, orderedList: { sel: 'end' }, heading1: { sel: 'end' }, heading2: { sel: 'end' }, heading3: { sel: 'end' },
    pageBreak: { sel: 'end' }, toc: { sel: 'end' }, twoColumns: { sel: 'end' }, citation: { sel: 'end' }, codeBlock: { sel: 'end' }, callout: { sel: 'end' }, signature: { sel: 'end' }, qrCode: { sel: 'end' },
    table: { sel: 'end' }, variable: { sel: 'end' }, trackChanges: { sel: 'end' },
    undo: { sel: 'all', pre: editor => editor.chain().focus().toggleBold().run() },
    redo: { sel: 'all', pre: editor => { editor.chain().focus().toggleBold().run(); editor.commands.undo(); } },
  };
  async function startFor(h, id) {
    const spec = Object.assign({ markup: PARA, sel: 'all' }, START[id] || {});
    await h.resetEditor();
    await closeOverlays();
    window.__shortcutAlerts = [];
    if (Editor.isTrackChangesOn()) document.getElementById('v2-btn-track-changes').click();
    Editor.setHTML(spec.markup);
    await sleep(200);
    const editor = EditorCore.getEditor();
    if (spec.sel === 'all') editor.chain().focus().selectAll().run();
    else if (spec.sel === 'end') editor.chain().focus('end').run();
    else {
      let at = null;
      editor.state.doc.descendants((node, pos) => { if (node.isText && node.text === 'b') at = pos + node.nodeSize; });
      editor.chain().setTextSelection(at).focus().run();
    }
    if (spec.pre) spec.pre(editor);
    await sleep(250);
  }

  cases.push({
    id: 'sc_each_action_does_what_the_mouse_does_on_its_button',
    description: 'Pour chacune des actions de mise en forme, d\'insertion et d\'historique : la touche laisse exactement le même résultat (document, fenêtres et menus ouverts, état des boutons) que le geste complet de la souris sur son bouton, depuis le même départ - quel que soit l\'évènement sur lequel le bouton est câblé (click, mousedown, pointerdown)',
    run: async (h) => {
      await reset(h);
      const problems = [];
      const detail = {};
      // « Commenter » veut un modèle enregistré et le dit par alert() : le message fait partie de ce que la touche et la souris doivent laisser pareil.
      const realAlert = window.alert;
      window.alert = message => { (window.__shortcutAlerts = window.__shortcutAlerts || []).push(String(message)); };
      for (const id of Object.keys(MOUSE_BUTTON)) {
        const button = document.querySelector(MOUSE_BUTTON[id]);
        if (!button) { problems.push(id + ' : bouton introuvable ' + MOUSE_BUTTON[id]); continue; }
        await startFor(h, id);
        const before = effectOf();
        mouseGesture(button);
        await sleep(250);
        const byMouse = effectOf();
        await closeOverlays();
        await startFor(h, id);
        const ran = Shortcuts.run(id);
        await sleep(250);
        const byKey = effectOf();
        await closeOverlays();
        if (byMouse === before) problems.push(id + ' : la souris ne change rien depuis le départ choisi');
        else if (!ran) problems.push(id + ' : la touche n\'est pas partie');
        else if (byKey !== byMouse) { problems.push(id + ' : la touche et la souris ne laissent pas le même résultat'); detail[id] = { mouse: byMouse.slice(0, 400), key: byKey.slice(0, 400) }; }
      }
      window.alert = realAlert;
      if (Editor.isTrackChangesOn()) document.getElementById('v2-btn-track-changes').click();
      await reset(h);
      return { pass: problems.length === 0, notes: JSON.stringify({ checked: Object.keys(MOUSE_BUTTON).length, problems, detail }) };
    },
  });

  // Rechercher (Ctrl+F) et Rechercher et remplacer (Ctrl+H, ⌘⇧H sur Mac) sont ceux de js/find-replace.js : natifs, ils restent à la barre de recherche tant qu'on n'y touche pas. Changés, ils
  // ouvrent la même barre - le clavier dans son champ, la ligne « Remplacer par » pour le remplacement -, mais jamais comme la loupe, qui referme la barre déjà ouverte : une touche qui la
  // fermerait ne chercherait plus. L'ancienne touche ne fait plus rien, et la loupe dit la touche choisie.
  cases.push({
    id: 'sc_find_and_replace_keys_open_the_bar_follow_the_choice_and_the_loupe_tooltip',
    description: 'Rechercher et Rechercher et remplacer : Ctrl+F et Ctrl+H (⌘F et ⇧⌘H sur Mac) restent à la barre de recherche ; changés, la nouvelle touche l\'ouvre (avec la ligne « Remplacer par » pour le remplacement, sans la refermer si elle est déjà ouverte), l\'ancienne ne fait plus rien, une touche d\'une autre action est refusée ; l\'infobulle de la loupe et son aria-keyshortcuts suivent la touche, la langue et une touche retirée',
    run: async (h) => {
      await reset(h);
      const out = {};
      const bar = () => document.getElementById('pp-find-bar');
      const barOpen = () => FindReplace.isOpen() && !!bar() && !bar().hidden;
      const replaceRowShown = () => { const row = document.getElementById('pp-find-replace-row'); return !!row && !row.hidden; };
      const closeBar = async () => { if (FindReplace.isOpen()) FindReplace.close(); await sleep(60); };
      const loupe = () => document.getElementById('v2-btn-find');
      // La ligne « Remplacer par » reste affichée d'une ouverture à l'autre (js/find-replace.js) : on la masque avant de mesurer ce que chaque touche ouvre.
      const hideReplaceRow = async () => {
        FindReplace.open({ replace: false });
        if (replaceRowShown()) document.getElementById('pp-find-toggle-replace').click();
        await closeBar();
      };
      await withText(h);
      out.defaults = [Shortcuts.keyFor('find'), Shortcuts.keyFor('replace'), label('find'), label('replace')].join('|');
      Shortcuts.setPlatform('mac');
      out.mac = [Shortcuts.defaultKeyFor('replace'), label('find'), label('replace'), loupe().getAttribute('aria-keyshortcuts')].join('|');
      Shortcuts.setPlatform(null);
      // D'origine : rien de ce module n'intervient, la barre s'ouvre par ses propres écouteurs.
      await hideReplaceRow();
      const nativeFind = press('Ctrl+f', inEditor()); await sleep(80);
      out.nativeFind = { open: barOpen(), replaceRow: replaceRowShown(), isOurs: Shortcuts.isChanged('find') };
      void nativeFind;
      await closeBar();
      await hideReplaceRow();
      press('Ctrl+h', inEditor()); await sleep(80);
      out.nativeReplace = { open: barOpen(), replaceRow: replaceRowShown() };
      await closeBar();
      // L'infobulle de la loupe : la touche d'origine, puis celle qu'on a choisie, la langue, puis plus de touche.
      const tip = () => loupe().getAttribute('data-tip');
      const aria = () => loupe().getAttribute('aria-label');
      out.tipDefault = tip() + ' | ' + loupe().getAttribute('aria-keyshortcuts');
      const refused = Shortcuts.setKey('bold', 'Mod+f');
      out.dupe = refused.problem + ':' + (refused.other && refused.other.id);
      const refusedReplace = Shortcuts.setKey('bold', 'Mod+Shift+h');
      out.dupeAlias = refusedReplace.problem + ':' + (refusedReplace.other && refusedReplace.other.id);
      Shortcuts.setKey('find', 'Alt+f');
      Shortcuts.setKey('replace', 'Alt+h');
      out.tipChosen = tip() + ' | ' + loupe().getAttribute('aria-keyshortcuts');
      I18n.setLang('en'); await sleep(80);
      out.tipEnglish = tip() + ' | ' + /\(Alt\+F\)$/.test(aria());
      I18n.setLang('fr'); await sleep(80);
      // La nouvelle touche ouvre la barre (le clavier dans son champ) ; une seconde fois, elle ne la referme pas ; l'ancienne ne fait plus rien et arrive à personne.
      await withText(h);
      await hideReplaceRow();
      const chosen = press('Alt+f', inEditor()); await sleep(80);
      out.chosenFind = { open: barOpen(), replaceRow: replaceRowShown(), focus: document.activeElement && document.activeElement.id, taken: chosen.defaultPrevented };
      press('Alt+f', document.activeElement); await sleep(80);
      out.chosenFindTwice = barOpen();
      await closeBar();
      const old = press('Ctrl+f', inEditor()); await sleep(80);
      out.oldFind = { open: barOpen(), taken: old.defaultPrevented };
      await hideReplaceRow();
      const chosenReplace = press('Alt+h', inEditor()); await sleep(80);
      out.chosenReplace = { open: barOpen(), replaceRow: replaceRowShown(), taken: chosenReplace.defaultPrevented };
      await closeBar();
      const oldReplace = press('Ctrl+h', inEditor()); await sleep(80);
      const oldReplaceAlias = press('Ctrl+Shift+h', inEditor()); await sleep(80);
      out.oldReplace = { open: barOpen(), taken: oldReplace.defaultPrevented, aliasTaken: oldReplaceAlias.defaultPrevented };
      // Une touche retirée : l'infobulle n'a plus de parenthèses, ni l'aria-keyshortcuts.
      Shortcuts.setKey('find', '');
      out.tipRemoved = tip() + ' | ' + loupe().hasAttribute('aria-keyshortcuts') + ' | ' + aria();
      // Mode lecture : l'éditeur n'est pas à l'écran, la touche n'ouvre rien (la barre de recherche ne s'ouvre que sur le texte).
      Shortcuts.setKey('find', 'Alt+f');
      document.getElementById('btn-mode-read').click(); await sleep(300);
      press('Alt+f', document.body); await sleep(80);
      out.reading = barOpen();
      document.getElementById('btn-mode-edit').click(); await sleep(300);
      await closeBar();
      await reset(h);
      const pass = out.defaults === 'Mod+f|Mod+h|Ctrl+F|Ctrl+H' && out.mac === 'Mod+Shift+h|⌘F|⇧⌘H|Meta+F'
        && out.nativeFind.open && !out.nativeFind.replaceRow && !out.nativeFind.isOurs && out.nativeReplace.open && out.nativeReplace.replaceRow
        && out.tipDefault === 'Rechercher / Remplacer (Ctrl+F) | Control+F' && out.dupe === 'duplicate:find' && out.dupeAlias === 'duplicate:replace'
        && out.tipChosen === 'Rechercher / Remplacer (Alt+F) | Alt+F' && out.tipEnglish === 'Find / Replace (Alt+F) | true'
        && out.chosenFind.open && !out.chosenFind.replaceRow && out.chosenFind.focus === 'pp-find-input' && out.chosenFind.taken === true && out.chosenFindTwice === true
        && out.oldFind.open === false && out.oldFind.taken === true
        && out.chosenReplace.open && out.chosenReplace.replaceRow && out.chosenReplace.taken === true
        && out.oldReplace.open === false && out.oldReplace.taken === true && out.oldReplace.aliasTaken === true
        && out.tipRemoved === 'Rechercher / Remplacer | false | Rechercher et remplacer dans le modèle' && out.reading === false;
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'sc_changing_a_key_frees_the_old_one_and_the_new_one_works',
    description: 'Gras mis sur Alt+B : Alt+B met en gras, Ctrl+B (que l\'éditeur traitait seul) ne fait plus rien et n\'arrive plus à l\'éditeur ; « Par défaut » rend Ctrl+B ; la touche d\'Enregistrer retirée laisse Ctrl+S sans effet ; une touche d\'origine reprise par une autre action fait celle de la nouvelle',
    run: async (h) => {
      await reset(h);
      const bolded = () => /<strong>|<b>/.test(Editor.getHTML());
      const toggleOff = async () => { Editor.setHTML('<p>Bonjour monde</p>'); await sleep(150); await h.focusAtEnd(); await h.selectAllInEditor(); };
      const out = {};
      // Avant : Ctrl+B est celui de l'éditeur (le mécanisme du test est donc valable), Alt+B ne fait rien.
      await toggleOff();
      const before = press('Ctrl+b', inEditor()); await sleep(150);
      out.nativeBefore = bolded();
      out.nativePrevented = before.defaultPrevented;
      await toggleOff();
      press('Alt+b', inEditor()); await sleep(150);
      out.altBBefore = bolded();
      Shortcuts.setKey('bold', 'Alt+b');
      await toggleOff();
      press('Alt+b', inEditor()); await sleep(150);
      out.altBAfter = bolded();
      await toggleOff();
      let reached = false;
      const spy = () => { reached = true; };
      inEditor().addEventListener('keydown', spy);
      const old = press('Ctrl+b', inEditor()); await sleep(150);
      inEditor().removeEventListener('keydown', spy);
      out.oldDoesNothing = !bolded();
      out.oldStopped = old.defaultPrevented && !reached;
      // Dans un champ de saisie autre que l'éditeur, la touche d'origine garde son sens de texte (Ctrl+Z y défait la frappe).
      const input = textField();
      const inField = press('Ctrl+b', input);
      out.oldKeptInTextField = !inField.defaultPrevented;
      input.remove();
      Shortcuts.resetKey('bold');
      await toggleOff();
      press('Ctrl+b', inEditor()); await sleep(150);
      out.restored = bolded();
      // Une touche d'origine reprise par une autre action : l'italique prend Ctrl+B.
      Shortcuts.setKey('bold', 'Alt+b');
      const taken = Shortcuts.setKey('italic', 'Mod+b');
      await toggleOff();
      press('Ctrl+b', inEditor()); await sleep(150);
      out.ctrlBMakesItalic = /<em>|<i>/.test(Editor.getHTML()) && !bolded();
      out.takenResult = taken.problem;
      Shortcuts.resetAll();
      // Enregistrer sans touche : Ctrl+S ne fait plus rien (ni enregistrement ni boîte du navigateur).
      Shortcuts.setKey('save', '');
      const save = press('Ctrl+s', document.body);
      out.saveFreedStopped = save.defaultPrevented;
      Shortcuts.resetKey('save');
      const saveBack = press('Ctrl+s', document.body);
      out.saveBackHandledByMain = saveBack.defaultPrevented;
      const pass = out.nativeBefore === true && out.altBBefore === false && out.altBAfter === true && out.oldDoesNothing && out.oldStopped && out.oldKeptInTextField && out.restored
        && out.ctrlBMakesItalic && out.takenResult === '' && out.saveFreedStopped && out.saveBackHandledByMain;
      await reset(h);
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'sc_refusals_say_why_and_nothing_is_stored',
    description: 'Une touche déjà prise (même une d\'origine d\'une action qu\'on n\'a pas touchée), une touche que le navigateur ou l\'éditeur gardent (Ctrl+R, Ctrl+E, Ctrl+Alt+4), une touche seule ou illisible sont refusées avec leur code et l\'action concernée, sans rien enregistrer ; changer ou retirer une touche à l\'identique n\'écrit rien de plus',
    run: async (h) => {
      await reset(h);
      const out = {};
      const dupe = Shortcuts.setKey('bold', 'Alt+l');
      out.dupe = dupe.problem + ':' + (dupe.other && dupe.other.id);
      const nativeOther = Shortcuts.setKey('modeRead', 'Mod+i');
      out.nativeOther = nativeOther.problem + ':' + (nativeOther.other && nativeOther.other.id);
      out.reserved = ['Mod+r', 'Mod+e', 'Mod+Alt+4', 'Mod+Shift+9', 'Mod+n', 'F5', 'Mod+Enter'].map(c => Shortcuts.setKey('modeRead', c).problem).join(',');
      out.alone = Shortcuts.setKey('modeRead', 'a').problem;
      out.garbage = Shortcuts.setKey('modeRead', 'Foo+a').problem;
      out.unknownAction = Shortcuts.setKey('nope', 'Alt+x').problem;
      out.stored = localStorage.getItem('pp_shortcuts');
      out.changedAfterRefusals = Shortcuts.ACTIONS.filter(a => Shortcuts.isChanged(a.id)).length;
      // Une touche d'origine libérée devient disponible.
      Shortcuts.setKey('italic', 'Alt+i');
      out.freedNowFree = Shortcuts.check('modeRead', 'Mod+i').problem;
      // Remettre l'action sur sa touche d'origine = la rétablir (rien de stocké pour elle).
      Shortcuts.setKey('italic', 'Mod+i');
      out.backToDefault = Shortcuts.isChanged('italic') === false && localStorage.getItem('pp_shortcuts') === null;
      const pass = out.dupe === 'duplicate:modeRead' && out.nativeOther === 'duplicate:italic' && out.reserved === 'reserved,reserved,reserved,reserved,reserved,reserved,reserved'
        && out.alone === 'needsModifier' && out.garbage === 'invalid' && out.unknownAction === 'invalid' && out.stored === null && out.changedAfterRefusals === 0
        && out.freedNowFree === '' && out.backToDefault;
      await reset(h);
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'sc_choices_are_kept_per_browser_and_follow_other_tabs',
    description: 'Les touches choisies sont écrites dans le navigateur (pp_shortcuts, seules les actions changées, « aucune touche » comprise), relues au rechargement, suivent un autre onglet du même navigateur (évènement storage) et « Tout remettre par défaut » efface tout',
    run: async (h) => {
      await reset(h);
      Shortcuts.setKey('bold', 'Alt+b');
      Shortcuts.setKey('modeRead', '');
      const stored = JSON.parse(localStorage.getItem('pp_shortcuts'));
      const keys = Object.keys(stored).sort().join(',');
      // « Rechargement » : le module relit le stockage.
      Shortcuts.reload();
      const reloaded = Shortcuts.keyFor('bold') + '|' + Shortcuts.keyFor('modeRead') + '|' + Shortcuts.keyFor('modeEdit');
      // Un autre onglet écrit : l'évènement `storage` met la liste à jour.
      let notified = 0;
      Shortcuts.onChange(() => { notified++; });
      localStorage.setItem('pp_shortcuts', JSON.stringify({ italic: 'Alt+i' }));
      window.dispatchEvent(new StorageEvent('storage', { key: 'pp_shortcuts', newValue: localStorage.getItem('pp_shortcuts') }));
      const other = Shortcuts.keyFor('italic') + '|' + Shortcuts.keyFor('bold') + '|' + notified;
      Shortcuts.resetAll();
      const cleared = localStorage.getItem('pp_shortcuts') === null && Shortcuts.ACTIONS.every(a => !Shortcuts.isChanged(a.id));
      const pass = keys === 'bold,modeRead' && stored.bold === 'Alt+b' && stored.modeRead === '' && reloaded === 'Alt+b||Alt+e' && other === 'Alt+i|Mod+b|1' && cleared;
      await reset(h);
      return { pass, notes: JSON.stringify({ keys, stored, reloaded, other, cleared }) };
    },
  });

  cases.push({
    id: 'sc_locked_hidden_or_disabled_controls_are_never_run_by_a_key',
    description: 'Une touche ne fait pas ce qu\'un clic de souris ne peut pas : bouton grisé par les droits (pp-access-locked), grisé par le mode (v2-hf-locked, simple pointer-events: none), désactivé, masqué ou en Lecture - rien n\'est cliqué, rien ne change dans le document',
    run: async (h) => {
      await reset(h);
      const out = {};
      const bold = document.getElementById('v2-btn-bold');
      const clicks = spyPresses(['v2-btn-bold']);
      await withText(h);
      await h.selectAllInEditor();
      out.free = Shortcuts.run('bold') === true;
      bold.classList.add('v2-hf-locked');
      out.hfLocked = Shortcuts.run('bold');
      bold.classList.remove('v2-hf-locked');
      bold.classList.add('pp-access-locked');
      out.accessLocked = Shortcuts.run('bold');
      bold.classList.remove('pp-access-locked');
      const group = document.getElementById('v2-toolbar');
      group.classList.add('v2-hf-locked');
      out.ancestorLocked = Shortcuts.run('bold');
      group.classList.remove('v2-hf-locked');
      bold.disabled = true;
      out.disabled = Shortcuts.run('bold');
      bold.disabled = false;
      bold.hidden = true;
      out.hidden = Shortcuts.run('bold');
      bold.hidden = false;
      out.freeAgain = Shortcuts.run('bold') === true;
      out.clicksSeen = clicks.seen.length;
      clicks.stop();
      // Une ligne de menu grisée (aria-disabled) et un titre dans un menu verrouillé (le menu Titre entier grisé).
      const heading = document.getElementById('v2-heading-group');
      heading.classList.add('v2-hf-locked');
      out.headingLocked = Shortcuts.run('heading1');
      heading.classList.remove('v2-hf-locked');
      out.headingFree = Shortcuts.run('heading1') === true;
      // Mode Lecture : la barre de mise en forme est grisée par les droits (applyFormattingBarLock), la touche n'y change rien.
      document.getElementById('btn-mode-read').click();
      await sleep(250);
      Editor.setHTML('<p>Lecture</p>');
      const readBold = Shortcuts.run('bold');
      const readHeading = Shortcuts.run('heading1');
      const readToday = Shortcuts.run('today');
      out.reading = { bold: readBold, heading: readHeading, today: readToday, doc: Editor.getHTML() };
      document.getElementById('btn-mode-edit').click();
      await sleep(250);
      const pass = out.free && out.hfLocked === false && out.accessLocked === false && out.ancestorLocked === false && out.disabled === false && out.hidden === false && out.freeAgain
        && out.clicksSeen === 2 && out.headingLocked === false && out.headingFree
        && out.reading.bold === false && out.reading.heading === false && out.reading.today === false && out.reading.doc === '<p>Lecture</p>';
      await reset(h);
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'sc_keys_wait_for_windows_and_stay_out_of_text_fields',
    description: 'Pendant qu\'une fenêtre est ouverte aucune touche d\'action ne part ; dans un champ de saisie autre que l\'éditeur les actions « éditeur » (Alt+Maj+H) ne partent pas et laissent la frappe tranquille, les actions « widget » (F2, Alt+L) partent ; une touche qui se répète ne relance pas une action qui bascule (mais la taille de police si) ; une saisie en cours (IME) est laissée',
    run: async (h) => {
      await reset(h);
      const out = {};
      const spy = spyPresses(['v2-btn-highlight', 'btn-rename-template', 'btn-mode-read', 'v2-size-plus']);
      await withText(h);
      // Un champ de saisie hors de l'éditeur.
      const input = textField();
      const editorKey = press('Alt+Shift+h', input);
      const appKey = press('F2', input);
      out.inField = { editorKeyTaken: editorKey.defaultPrevented, appKeyTaken: appKey.defaultPrevented, clicks: spy.seen.join(',') };
      input.remove();
      await withText(h);
      spy.seen.length = 0;
      // Répétition : Alt+L enfoncée ne bascule qu'une fois (la répétition est avalée sans agir), Alt+Maj+H de même ; une taille de police se répète.
      press('Alt+l', document.body);
      press('Alt+l', document.body, { repeat: true });
      press('Alt+l', document.body, { repeat: true });
      out.repeatToggles = spy.seen.join(',');
      spy.seen.length = 0;
      Shortcuts.setKey('sizeUp', 'Alt+Shift+p');
      press('Alt+Shift+p', inEditor()); press('Alt+Shift+p', inEditor(), { repeat: true }); press('Alt+Shift+p', inEditor(), { repeat: true });
      out.repeatSize = spy.seen.join(',');
      Shortcuts.resetKey('sizeUp');
      spy.seen.length = 0;
      // Saisie en cours (IME) : ni action ni blocage.
      const ime = press('Alt+l', document.body, { isComposing: true });
      out.ime = { taken: ime.defaultPrevented, clicks: spy.seen.length };
      // Une fenêtre ouverte (ici Réglages) : plus rien ne part, la touche n'est pas prise.
      document.getElementById('v2-btn-settings').click();
      await sleep(250);
      const inModal = press('Alt+l', document.activeElement || document.body);
      out.modal = { taken: inModal.defaultPrevented, clicks: spy.seen.length };
      document.getElementById('settings-close').click();
      await sleep(200);
      spy.stop();
      const pass = out.inField.editorKeyTaken === false && out.inField.appKeyTaken === true && out.inField.clicks === 'btn-rename-template'
        && out.repeatToggles === 'btn-mode-read' && out.repeatSize === 'v2-size-plus,v2-size-plus,v2-size-plus'
        && out.ime.taken === false && out.ime.clicks === 0 && out.modal.taken === false && out.modal.clicks === 0;
      await reset(h);
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'sc_save_and_link_labels_follow_the_keys',
    description: 'La touche d\'Enregistrer (titre du menu et nom accessible du bouton) et celle du lien (nom du bouton, ligne « Lien… ») viennent des Réglages : écrites ⌘ sur Mac, changées avec la touche, sans parenthèses quand elle est retirée, gardées au changement de langue',
    run: async (h) => {
      await reset(h);
      const save = document.getElementById('btn-save');
      const saveTitle = document.getElementById('v2-save-flyout-label');
      const link = document.getElementById('v2-btn-link');
      const kbd = document.getElementById('v2-row-link-kbd');
      const read = () => ({ saveAria: save.getAttribute('aria-label'), saveTitle: saveTitle.textContent, linkAria: link.getAttribute('aria-label'), kbd: kbd.textContent, dialog: LinkDialog.shortcutLabel() });
      const out = { start: read() };
      Shortcuts.setKey('save', 'Alt+s');
      Shortcuts.setKey('link', 'Alt+k');
      out.moved = read();
      I18n.setLang('en');
      out.english = read();
      I18n.setLang('fr');
      Shortcuts.setKey('save', '');
      Shortcuts.setKey('link', '');
      out.removed = read();
      Shortcuts.resetAll();
      Shortcuts.setPlatform('mac');
      out.mac = read();
      Shortcuts.setPlatform(null);
      out.back = read();
      const pass = out.start.saveAria === 'Enregistrer (Ctrl+S)' && out.start.saveTitle === 'Enregistrer (Ctrl+S)' && out.start.linkAria.endsWith('(Ctrl+K)') && out.start.kbd === 'Ctrl+K' && out.start.dialog === 'Ctrl+K'
        && out.moved.saveAria === 'Enregistrer (Alt+S)' && out.moved.saveTitle === 'Enregistrer (Alt+S)' && out.moved.linkAria.endsWith('(Alt+K)') && out.moved.kbd === 'Alt+K'
        && out.english.saveAria === 'Save (Alt+S)' && out.english.saveTitle === 'Save (Alt+S)' && out.english.kbd === 'Alt+K'
        && out.removed.saveAria === 'Enregistrer' && out.removed.saveTitle === 'Enregistrer' && !/\(/.test(out.removed.linkAria) && out.removed.kbd === '' && out.removed.dialog === ''
        && out.mac.saveAria === 'Enregistrer (⌘S)' && out.mac.kbd === '⌘K'
        && out.back.saveAria === 'Enregistrer (Ctrl+S)' && out.back.kbd === 'Ctrl+K';
      await reset(h);
      return { pass, notes: JSON.stringify(out) };
    },
  });

  // === 3) L'écran Réglages > Raccourcis ======================================================================================================================

  cases.push({
    id: 'sc_panel_lists_every_action_by_group_with_its_key_and_a_switch_to_abbreviations',
    description: 'L\'onglet Raccourcis s\'ouvre sur les touches : une ligne par action, rangées en cinq groupes, avec leur touche actuelle (« Aucune » en italique quand il n\'y en a pas) ; « Par défaut » grisé tant que rien n\'est changé ; le commutateur Touches / Abréviations montre l\'une ou l\'autre section et garde son choix',
    run: async (h) => {
      await reset(h);
      openKeysPanel();
      await sleep(200);
      const rows = Array.from(document.querySelectorAll('#settings-keys-list .settings-key-row'));
      const groups = Array.from(document.querySelectorAll('#settings-keys-list .settings-keys-group')).map(g => g.textContent);
      const byAction = id => document.querySelector('.settings-key-row[data-action="' + id + '"]');
      const text = (id, sel) => byAction(id).querySelector(sel).textContent;
      const out = {
        rows: rows.length, groups: groups.join('|'),
        modeRead: text('modeRead', '.settings-key-name') + '=' + text('modeRead', '.settings-key-btn'),
        none: text('table', '.settings-key-btn') + (byAction('table').querySelector('.settings-key-btn').classList.contains('is-none') ? ' (italique)' : ''),
        resetDisabled: rows.every(r => r.querySelector('.settings-key-reset').disabled), resetAllDisabled: document.getElementById('settings-keys-reset-all').disabled,
        keysShown: !document.getElementById('settings-keys-section').hidden, expansionShown: !document.getElementById('settings-expansion-section').hidden,
        labelled: Array.from(document.querySelectorAll('#settings-keys-list .settings-keys-rows')).filter(ul => { const h = document.getElementById(ul.getAttribute('aria-labelledby')); return !!h && h.classList.contains('settings-keys-group'); }).length,
      };
      document.getElementById('settings-switch-expansion').click();
      out.afterSwitch = { keys: !document.getElementById('settings-keys-section').hidden, expansion: !document.getElementById('settings-expansion-section').hidden, selected: document.getElementById('settings-switch-expansion').getAttribute('aria-selected'), stored: localStorage.getItem('pp_shortcuts_view') };
      document.getElementById('settings-switch-keys').click();
      out.backToKeys = { keys: !document.getElementById('settings-keys-section').hidden, expansion: !document.getElementById('settings-expansion-section').hidden, selected: document.getElementById('settings-switch-keys').getAttribute('aria-selected') };
      Shortcuts.setKey('modeRead', 'Alt+r');
      out.afterChange = { key: text('modeRead', '.settings-key-btn'), resetEnabled: !byAction('modeRead').querySelector('.settings-key-reset').disabled, resetAllEnabled: !document.getElementById('settings-keys-reset-all').disabled };
      const pass = out.rows === Shortcuts.ACTIONS.length && out.labelled === 5 && out.groups === 'Modèles|Affichage|Mise en forme|Insertion|Historique et suivi'
        && out.modeRead === 'Mode lecture=Alt+L' && out.none === 'Aucune (italique)' && out.resetDisabled && out.resetAllDisabled && out.keysShown && !out.expansionShown
        && !out.afterSwitch.keys && out.afterSwitch.expansion && out.afterSwitch.selected === 'true' && out.afterSwitch.stored === 'expansion'
        && out.backToKeys.keys && !out.backToKeys.expansion && out.backToKeys.selected === 'true'
        && out.afterChange.key === 'Alt+R' && out.afterChange.resetEnabled && out.afterChange.resetAllEnabled;
      await reset(h);
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'sc_panel_records_a_combination_refuses_with_a_reason_and_resets',
    description: 'Un clic sur la touche d\'une ligne écoute la combinaison suivante : elle est prise (et aucune action ne part pendant l\'écoute), un doublon, une touche seule, une touche gardée et AltGr sont refusés avec leur raison sous la touche et l\'écoute continue ; Échap abandonne sans fermer la fenêtre, Retour arrière retire la touche, « Par défaut » et « Tout remettre par défaut » (avec confirmation) rétablissent',
    run: async (h) => {
      await reset(h);
      openKeysPanel();
      await sleep(200);
      const row = id => document.querySelector('.settings-key-row[data-action="' + id + '"]');
      const keyButton = id => row(id).querySelector('.settings-key-btn');
      const errorOf = id => { const e = row(id).querySelector('.settings-key-error'); return e.hidden ? '' : e.textContent; };
      const clicks = spyPresses(['btn-mode-read', 'btn-mode-edit']);
      const out = {};
      keyButton('modeEdit').click();
      out.recording = keyButton('modeEdit').classList.contains('is-recording') && Shortcuts.isRecording() && keyButton('modeEdit').textContent === 'Tapez la touche…';
      out.recordingAria = keyButton('modeEdit').getAttribute('aria-label');
      // Alt+L est la touche de « Mode lecture » : refusée, et l'action ne part pas.
      const dupe = press('Alt+l', keyButton('modeEdit'));
      out.dupe = { error: errorOf('modeEdit'), taken: dupe.defaultPrevented, stillRecording: Shortcuts.isRecording(), clicks: clicks.seen.length, invalid: keyButton('modeEdit').getAttribute('aria-invalid') };
      press('a', keyButton('modeEdit'));
      out.alone = errorOf('modeEdit');
      press('Ctrl+r', keyButton('modeEdit'));
      out.reserved = errorOf('modeEdit');
      press('Ctrl+Alt+c', keyButton('modeEdit'));
      out.altGr = errorOf('modeEdit');
      press('Shift', keyButton('modeEdit'));
      out.loneModifierKeepsError = errorOf('modeEdit') === out.altGr;
      press('Alt+q', keyButton('modeEdit'));
      out.taken = { key: Shortcuts.keyFor('modeEdit'), error: errorOf('modeEdit'), recording: Shortcuts.isRecording(), shown: keyButton('modeEdit').textContent, resetEnabled: !row('modeEdit').querySelector('.settings-key-reset').disabled };
      // Échap : abandonne, la fenêtre reste ouverte.
      keyButton('modeRead').click();
      const esc = press('Escape', keyButton('modeRead'));
      out.escape = { recording: Shortcuts.isRecording(), settingsStillOpen: settingsOpen(), taken: esc.defaultPrevented, key: Shortcuts.keyFor('modeRead') };
      // Retour arrière : retire la touche.
      keyButton('modeRead').click();
      press('Backspace', keyButton('modeRead'));
      out.removed = { key: Shortcuts.keyFor('modeRead'), shown: keyButton('modeRead').textContent, none: keyButton('modeRead').classList.contains('is-none') };
      // « Par défaut » d'une ligne.
      row('modeEdit').querySelector('.settings-key-reset').click();
      out.rowReset = { key: Shortcuts.keyFor('modeEdit'), disabled: row('modeEdit').querySelector('.settings-key-reset').disabled };
      // « Tout remettre par défaut » : une confirmation, puis tout est rendu.
      Shortcuts.setKey('italic', 'Alt+i');
      const answers = [false, true];
      const asked = [];
      const realConfirm = Dialogs.confirm;
      Dialogs.confirm = async opts => { asked.push(opts.title); return answers.shift(); };
      try {
        document.getElementById('settings-keys-reset-all').click();
        await sleep(100);
        out.cancelled = Shortcuts.isChanged('italic') && Shortcuts.isChanged('modeRead');
        document.getElementById('settings-keys-reset-all').click();
        await sleep(100);
      } finally { Dialogs.confirm = realConfirm; }
      out.resetAll = { changed: Shortcuts.ACTIONS.filter(a => Shortcuts.isChanged(a.id)).length, asked: asked.join('|'), allDisabled: document.getElementById('settings-keys-reset-all').disabled };
      clicks.stop();
      // Fermer la fenêtre pendant une écoute l'arrête.
      keyButton('bold').click();
      document.getElementById('settings-close').click();
      out.closeStops = !Shortcuts.isRecording();
      const pass = out.recording && out.recordingAria === 'Mode édition : tapez la combinaison voulue' && out.dupe.error === 'Alt+L est déjà la touche de «\u00a0Mode lecture\u00a0».' && out.dupe.taken === true && out.dupe.stillRecording && out.dupe.clicks === 0 && out.dupe.invalid === 'true'
        && out.alone === 'Ajoutez Ctrl (⌘ sur Mac) ou Alt : une touche seule s’écrirait dans le texte.'
        && out.reserved === 'Ctrl+R est gardée par le navigateur ou l’éditeur : choisissez-en une autre.'
        && out.altGr.indexOf('AltGr') !== -1 && out.loneModifierKeepsError
        && out.taken.key === 'Alt+q' && out.taken.error === '' && out.taken.recording === false && out.taken.shown === 'Alt+Q' && out.taken.resetEnabled
        && out.escape.recording === false && out.escape.settingsStillOpen && out.escape.taken === true && out.escape.key === 'Alt+l'
        && out.removed.key === '' && out.removed.shown === 'Aucune' && out.removed.none
        && out.rowReset.key === 'Alt+e' && out.rowReset.disabled
        && out.cancelled && out.resetAll.changed === 0 && out.resetAll.asked === 'Remettre toutes les touches par défaut ?|Remettre toutes les touches par défaut ?' && out.resetAll.allDisabled
        && out.closeStops;
      await reset(h);
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'sc_panel_texts_follow_the_language_and_the_platform',
    description: 'L\'onglet, le commutateur, la liste, les groupes, les noms d\'action, les refus et les infobulles sont traduits en anglais (« Shift », « Esc ») et la liste suit la plateforme (⌥L, ⌘B sur Mac) sans recharger',
    run: async (h) => {
      await reset(h);
      const snapshot = () => {
        const row = id => document.querySelector('.settings-key-row[data-action="' + id + '"]');
        return {
          tab: document.querySelector('.settings-tab[data-settings-tab="shortcuts"]').textContent,
          switchKeys: document.getElementById('settings-switch-keys').textContent, switchExpansion: document.getElementById('settings-switch-expansion').textContent,
          switchAria: document.querySelector('.settings-switch').getAttribute('aria-label'),
          title: document.getElementById('settings-keys-title').textContent, intro: document.querySelector('#settings-keys-section .settings-panel-intro').textContent,
          resetAll: document.getElementById('settings-keys-reset-all').textContent, reset: row('bold').querySelector('.settings-key-reset').textContent,
          group: document.querySelector('.settings-keys-group').textContent, groups: document.querySelectorAll('.settings-keys-group').length,
          name: row('modeRead').querySelector('.settings-key-name').textContent, key: row('heading1').querySelector('.settings-key-btn').textContent,
          keyAria: row('modeRead').querySelector('.settings-key-btn').getAttribute('aria-label'), noneAria: row('table').querySelector('.settings-key-btn').getAttribute('aria-label'),
          resetAria: row('bold').querySelector('.settings-key-reset').getAttribute('aria-label'),
        };
      };
      openKeysPanel();
      await sleep(200);
      const fr = snapshot();
      I18n.setLang('en');
      await sleep(150);
      const en = snapshot();
      // Refus en anglais.
      document.querySelector('.settings-key-row[data-action="bold"] .settings-key-btn').click();
      press('Alt+l', document.activeElement);
      const enError = document.querySelector('.settings-key-row[data-action="bold"] .settings-key-error').textContent;
      press('a', document.activeElement);
      const enAlone = document.querySelector('.settings-key-row[data-action="bold"] .settings-key-error').textContent;
      ShortcutsPanel.stopRecording();
      Shortcuts.setPlatform('mac');
      const mac = { modeRead: document.querySelector('.settings-key-row[data-action="modeRead"] .settings-key-btn').textContent, bold: document.querySelector('.settings-key-row[data-action="bold"] .settings-key-btn').textContent, heading: document.querySelector('.settings-key-row[data-action="heading1"] .settings-key-btn').textContent };
      Shortcuts.setPlatform(null);
      const pass = fr.tab === 'Raccourcis' && fr.switchKeys === 'Touches' && fr.switchExpansion === 'Abréviations' && fr.switchAria === 'Sections des raccourcis' && fr.title === 'Touches du clavier'
        && fr.resetAll === 'Tout remettre par défaut' && fr.reset === 'Par défaut' && fr.group === 'Modèles' && fr.groups === 5 && fr.name === 'Mode lecture' && fr.key === 'Alt+Maj+1'
        && fr.keyAria === 'Mode lecture : touche Alt+L. Appuyer pour la changer' && fr.noneAria === 'Insérer un tableau : aucune touche. Appuyer pour en choisir une' && fr.resetAria === 'Remettre la touche d’origine de « Gras »'
        && en.tab === 'Shortcuts' && en.switchKeys === 'Keys' && en.switchExpansion === 'Abbreviations' && en.switchAria === 'Shortcut sections' && en.title === 'Keyboard keys'
        && en.resetAll === 'Reset all to default' && en.reset === 'Default' && en.group === 'Templates' && en.name === 'Read mode' && en.key === 'Alt+Shift+1'
        && en.keyAria === 'Read mode: key Alt+L. Press to change it' && en.resetAria === 'Restore the default key for “Bold”'
        && enError === 'Alt+L is already the key for “Read mode”.' && enAlone === 'Add Ctrl (⌘ on Mac) or Alt: a key on its own would be typed into the text.'
        && mac.modeRead === '⌥L' && mac.bold === '⌘B' && mac.heading === '⌥⇧1';
      await reset(h);
      return { pass, notes: JSON.stringify({ fr, en, enError, enAlone, mac }) };
    },
  });

  // Contrastes : calcul sur le vrai fond (couleurs composées), comme le groupe `contrast` et le groupe `textExpansion`.
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
  const textRatio = (el, pseudo, bgOverride) => {
    const c = parseColor(getComputedStyle(el, pseudo || null).color);
    const bg = bgOverride || backgroundOf(el);
    return Math.round(ratio(over(c, bg), bg) * 100) / 100;
  };

  cases.push({
    id: 'sc_contrast_keys_panel_switch_and_hints_reach_4_5_in_light_and_dark',
    description: 'Le commutateur, la liste des touches (nom, touche, « Aucune », « Par défaut », groupes, erreur, notes), la touche en cours d\'écoute et les touches affichées dans les menus (sur la ligne survolée) : 4,5:1 au moins sur leur vrai fond, en clair et en sombre',
    run: async (h) => {
      await reset(h);
      const noMotion = document.createElement('style');
      noMotion.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
      document.head.appendChild(noMotion);
      const before = html.getAttribute('data-theme');
      const byTheme = {};
      try {
        openKeysPanel();
        Shortcuts.setKey('italic', 'Alt+i');
        await sleep(200);
        const row = id => document.querySelector('.settings-key-row[data-action="' + id + '"]');
        document.querySelector('.settings-key-row[data-action="bold"] .settings-key-btn').click();
        press('Alt+l', document.activeElement); // erreur sous « Gras », écoute en cours
        for (const theme of ['light', 'dark']) {
          html.setAttribute('data-theme', theme);
          await sleep(120);
          const out = {};
          out['commutateur : onglet choisi (blanc sur bleu)'] = textRatio(document.getElementById('settings-switch-keys'));
          out['commutateur : onglet non choisi'] = textRatio(document.getElementById('settings-switch-expansion'));
          out['titre de la section'] = textRatio(document.getElementById('settings-keys-title'));
          out['explication'] = textRatio(document.querySelector('#settings-keys-section .settings-panel-intro'));
          out['groupe'] = textRatio(document.querySelector('.settings-keys-group'));
          out['nom de l\'action'] = textRatio(row('modeEdit').querySelector('.settings-key-name'));
          out['touche'] = textRatio(row('modeEdit').querySelector('.settings-key-btn'));
          out['« Aucune »'] = textRatio(row('table').querySelector('.settings-key-btn'));
          out['touche en cours d\'écoute'] = textRatio(row('bold').querySelector('.settings-key-btn'));
          out['« Par défaut » (actif)'] = textRatio(row('italic').querySelector('.settings-key-reset'));
          out['« Tout remettre par défaut » (actif)'] = textRatio(document.getElementById('settings-keys-reset-all'));
          out['erreur sous la touche'] = textRatio(row('bold').querySelector('.settings-key-error'));
          out['note du bas'] = textRatio(document.querySelector('#settings-keys-section .settings-access-hint'));
          // Touches affichées dans les menus : sur le fond de la ligne survolée (--surface-sunken), le plus clair des deux cas.
          const hover = parseColor(getComputedStyle(document.body).getPropertyValue('--surface-sunken') || '') || backgroundOf(document.body);
          const sunken = getComputedStyle(html).getPropertyValue('--surface-sunken').trim();
          const probe = document.createElement('div'); probe.style.background = sunken; document.body.appendChild(probe);
          const sunkenColor = parseColor(getComputedStyle(probe).backgroundColor); probe.remove();
          const citation = document.getElementById('v2-btn-citation');
          const headingRow = document.querySelector('#v2-heading-flyout .v2-hover-row[data-level="1"]');
          out['menu : touche d\'une ligne (Citation)'] = textRatio(citation, '::after');
          out['menu : touche d\'une ligne survolée (Citation)'] = textRatio(citation, '::after', sunkenColor || hover);
          out['menu : touche d\'une ligne Titre'] = textRatio(headingRow, '::after');
          out['menu : touche d\'une ligne Titre survolée'] = textRatio(headingRow, '::after', sunkenColor || hover);
          byTheme[theme] = out;
        }
      } finally {
        ShortcutsPanel.stopRecording();
        if (before === null) html.removeAttribute('data-theme'); else html.setAttribute('data-theme', before);
        noMotion.remove();
      }
      const bad = [];
      Object.keys(byTheme).forEach(theme => Object.entries(byTheme[theme]).forEach(([name, value]) => { if (!(value >= 4.5)) bad.push(theme + ' ' + name + ' ' + value); }));
      await reset(h);
      return { pass: bad.length === 0, notes: JSON.stringify({ bad, byTheme }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.shortcuts = cases;
})();
