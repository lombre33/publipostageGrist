// Suite "emojiChip" - la puce intelligente « Smiley » (js/emoji-chip.js) : un smiley choisi dans une liste d'environ 170, posé par le menu « # » (onglet Puces), qu'un clic rouvre sur sa
// grille de choix pour le changer. Ces cas suivent le smiley de bout en bout : la liste (sans doublon, un emoji chacune, des noms de thème dans les deux langues), le HTML du modèle (relu tel
// quel, un smiley absent ou abîmé donne le smiley d'origine), la pose par le menu « # » (une seule puce à la place de « #requête », sélectionnée, grille ouverte, un seul Annuler), le
// changement au clic (un geste d'Annuler, curseur derrière la puce, grille refermée), le clavier (Entrée, flèches, Échap), ce qui ne l'ouvre pas (un emoji tapé ou collé dans le texte reste du
// texte ; un champ texte n'a pas de puce « Smiley »), puis la Lecture, le HTML, le Markdown, le vrai PDF (noir et blanc, aucune case vide pour AUCUN des smileys proposés) et le vrai Word.
// Le geste à la vraie souris, au vrai clavier et au vrai presse-papiers, à la taille du panneau de Grist, est dans verify-emoji-chip-mouse.mjs.
(function () {
  const cases = [];

  const SMILE = '\u{1F642}';
  const PARTY = '\u{1F389}';
  const HEART = '❤️';
  const THUMB = '\u{1F44D}';

  const ed = () => EditorCore.getEditor();
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const failedOf = checks => Object.keys(checks).filter(key => !checks[key]);
  const textOfHtml = html => { const box = document.createElement('div'); box.innerHTML = html; return box.textContent; };
  const hexOf = text => [...text].map(c => c.codePointAt(0).toString(16)).join('+');
  const chipHtml = (emoji, extra) => `<span class="smart-chip" contenteditable="false" data-chip-kind="emoji"${extra === undefined ? ` data-chip-emoji="${emoji}"` : extra}>${emoji}</span>`;
  const inLang = async (lang, fn) => { const before = I18n.getLang(); I18n.setLang(lang); try { return await fn(); } finally { I18n.setLang(before); } };

  function chipNodes() {
    const out = [];
    ed().state.doc.descendants((node, pos) => { if (node.type.name === 'smartChip' && node.attrs.kind === EmojiChip.KIND) out.push({ node, pos }); });
    return out;
  }
  const emojiBar = () => document.querySelector('.v2-emoji-toolbar');
  const barOpen = () => !!emojiBar() && emojiBar().classList.contains('visible');
  const cells = () => Array.from(document.querySelectorAll('.v2-emoji-toolbar .emoji-cell'));
  const cellOf = emoji => cells().find(cell => cell.getAttribute('aria-label') === emoji);
  const press = async (h, cell) => { cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); await h.sleep(90); };
  const timeBarOpen = () => { const bar = document.querySelector('.v2-timechip-toolbar'); return !!bar && bar.classList.contains('visible'); };
  const panelBox = () => document.getElementById('autocomplete-box');
  const panelOpen = () => { const box = panelBox(); return !!box && box.style.display !== 'none'; };
  const panelItems = () => (panelOpen() ? Array.from(panelBox().querySelectorAll('.ac-item')).map(item => item.textContent.trim()) : []);

  async function openChipsTab(h) {
    document.querySelectorAll('.ac-tab').forEach(tab => { if (tab.dataset.tab === 'chips') tab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); });
    await h.sleep(40);
  }
  async function pickEntry(h, label) {
    const item = Array.from(document.querySelectorAll('#autocomplete-box .ac-item')).find(entry => entry.textContent.trim() === label);
    if (!item) return false;
    item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await h.sleep(120);
    return true;
  }
  // Un paragraphe « Merci » suivi d'une espace, le curseur au bout, puis « # » : la liste s'ouvre (un « # » collé à un mot ne l'ouvre pas).
  async function openHashList(h) {
    await h.resetEditor();
    ed().commands.setContent('<p>Merci</p>');
    let end = null;
    ed().state.doc.descendants((node, pos) => { if (end === null && node.isTextblock) end = pos + 1 + node.content.size; });
    ed().commands.setTextSelection(end);
    ed().view.focus();
    ed().commands.insertContent({ type: 'text', text: ' ' });
    await h.typeText('#');
    await h.sleep(70);
  }
  // `settle` : laisse passer le délai de regroupement de l'historique (une demi-seconde) entre la frappe du « # » et le clic, comme une personne qui lit la liste : un Annuler défait alors la pose seule.
  async function placeSmiley(h, settle) {
    await openHashList(h);
    await openChipsTab(h);
    if (settle) await h.sleep(650);
    return pickEntry(h, I18n.t('chips.emoji'));
  }
  async function selectChip(h, index) {
    const target = chipNodes()[index || 0];
    if (!target) return null;
    ed().commands.setNodeSelection(target.pos);
    ed().view.focus();
    await h.sleep(110);
    return target;
  }
  async function pasteInDocument(h, data) {
    await h.resetEditor();
    await h.focusAtEnd();
    const dt = new DataTransfer();
    if (data.html != null) dt.setData('text/html', data.html);
    if (data.plain != null) dt.setData('text/plain', data.plain);
    ed().view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    await h.sleep(150);
    return Editor.getHTML();
  }
  // Le texte que le vrai PDF écrit et les glyphes qu'il dessine, dont ceux qui sont la case vide de leur police (pdf.js).
  async function painted(h, base64) {
    await h.ensurePdfJsLoaded();
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
    const OPS = window.pdfjsLib.OPS;
    let shown = 0;
    let blank = 0;
    let text = '';
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const ops = await page.getOperatorList();
      for (let i = 0; i < ops.fnArray.length; i++) {
        if (ops.fnArray[i] !== OPS.showText) continue;
        for (const glyph of ops.argsArray[i][0]) {
          if (typeof glyph === 'number') continue;
          shown++;
          if (glyph.originalCharCode === 0) blank++;
        }
      }
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join('');
    }
    return { shown, blank, pages: pdf.numPages, text };
  }

  // --- La liste -------------------------------------------------------------------------------------------------------------------------------------------

  cases.push({
    id: 'emojichip_list_is_about_170_distinct_single_emojis_grouped_by_theme_in_both_languages',
    description: 'La liste offerte compte environ 170 smileys (de 160 à 190), chacun un seul emoji (EmojiPaste.isEmojiOnly), sans doublon, chaque thème a un nom dans les deux langues, la grille a un bouton par smiley, et le smiley d\'origine est dans la liste',
    run: async () => {
      const all = EmojiChip.all();
      const unique = new Set(all);
      const notEmoji = all.filter(emoji => !EmojiPaste.isEmojiOnly(emoji) || EmojiChip.normalize(emoji) !== emoji);
      const tooLong = all.filter(emoji => emoji.length > 8);
      const names = lang => inLang(lang, () => EmojiChip.GROUPS.map(group => I18n.t(group.i18nKey)));
      const fr = await names('fr');
      const en = await names('en');
      const keys = EmojiChip.GROUPS.map(group => group.i18nKey);
      const unnamed = keys.filter((key, i) => fr[i] === key || en[i] === key || !fr[i] || !en[i]);
      const html = EmojiChip.pickerHtml();
      const box = document.createElement('div');
      box.innerHTML = html;
      const buttons = Array.from(box.querySelectorAll('button.emoji-cell'));
      const checks = {
        about170: all.length >= 160 && all.length <= 190,
        distinct: unique.size === all.length,
        allSingleEmojis: notEmoji.length === 0 && tooLong.length === 0,
        themes: EmojiChip.GROUPS.length === 5 && EmojiChip.GROUPS.every(group => group.emojis.length >= 15),
        themeNames: unnamed.length === 0 && new Set(fr).size === fr.length && new Set(en).size === en.length,
        oneButtonEach: buttons.length === all.length && buttons.every((button, i) => button.dataset.action === 'emoji:' + all[i] && button.getAttribute('aria-label') === all[i] && button.textContent === all[i]),
        defaultIsOffered: unique.has(EmojiChip.DEFAULT),
        actionRoundTrip: all.every(emoji => EmojiChip.emojiOfAction('emoji:' + emoji) === emoji) && EmojiChip.emojiOfAction('chip-style') === '' && EmojiChip.emojiOfAction(null) === '',
      };
      return { pass: failedOf(checks).length === 0, notes: JSON.stringify({ failed: failedOf(checks), count: all.length, notEmoji, tooLong, fr, en, unnamed }) };
    },
  });

  cases.push({
    id: 'emojichip_normalize_keeps_an_emoji_and_gives_the_default_for_anything_else',
    description: 'Un smiley lu sur un modèle enregistré ou un HTML collé n\'est jamais cru tel quel : un emoji (suites comprises : teinte de peau, drapeau, touche, famille) reste, un texte, du HTML, une valeur vide ou trop longue, ou qui n\'est pas du texte donne le smiley d\'origine',
    run: async () => {
      const kept = [SMILE, PARTY, HEART, THUMB + '\u{1F3FD}', '\u{1F1EB}\u{1F1F7}', '1️⃣', '\u{1F468}‍\u{1F469}‍\u{1F467}'];
      const replaced = ['', 'abc', 'A', '<img src=x>', '<b>x</b>', 'x'.repeat(40), SMILE.repeat(20), ' ', null, undefined, 12, {}, [SMILE]];
      const notKept = kept.filter(emoji => EmojiChip.normalize(emoji) !== emoji);
      const notReplaced = replaced.filter(value => EmojiChip.normalize(value) !== EmojiChip.DEFAULT);
      return { pass: notKept.length === 0 && notReplaced.length === 0, notes: JSON.stringify({ notKept: notKept.map(hexOf), notReplaced: notReplaced.map(String) }) };
    },
  });

  // --- Le modèle (HTML enregistré) ---------------------------------------------------------------------------------------------------------------------

  cases.push({
    id: 'emojichip_html_of_the_model_carries_the_emoji_and_is_read_back_as_written',
    description: 'Le HTML d\'un smiley porte data-chip-kind="emoji", data-chip-emoji et le smiley lui-même comme texte du <span> (un lecteur qui ne connaît pas cette puce lit quand même le smiley) ; relu, il redonne le même smiley ; sans data-chip-emoji ou avec une valeur abîmée il donne le smiley d\'origine, jamais du texte ; une puce d\'un autre genre ne porte pas data-chip-emoji',
    run: async (h) => {
      await h.resetEditor();
      ed().commands.setContent('<p>a </p>');
      ed().commands.insertContentAt(3, [{ type: 'smartChip', attrs: { kind: 'emoji', emoji: PARTY } }, { type: 'smartChip', attrs: { kind: 'date' } }]);
      const html = Editor.getHTML();
      const span = new DOMParser().parseFromString(html, 'text/html').querySelector('span[data-chip-kind="emoji"]');
      const dateSpan = new DOMParser().parseFromString(html, 'text/html').querySelector('span[data-chip-kind="date"]');
      Editor.setHTML(html);
      await h.sleep(60);
      const again = chipNodes();
      const read = value => { Editor.setHTML('<p>' + value + '</p>'); const chips = chipNodes(); return chips.length === 1 ? chips[0].node.attrs.emoji : 'x' + chips.length; };
      const checks = {
        kindAndEmoji: !!span && span.getAttribute('data-chip-emoji') === PARTY && span.textContent === PARTY && span.getAttribute('contenteditable') === 'false' && span.classList.contains('smart-chip'),
        otherChipHasNone: !!dateSpan && !dateSpan.hasAttribute('data-chip-emoji'),
        readBack: again.length === 1 && again[0].node.attrs.emoji === PARTY,
        keepsFromAttribute: read(chipHtml(HEART)) === HEART,
        textWhenAttributeAbsent: read(chipHtml(HEART, '').replace(' data-chip-emoji=""', '')) === HEART,
        defaultWhenEmptyAndNoText: read('<span class="smart-chip" data-chip-kind="emoji"></span>') === EmojiChip.DEFAULT,
        defaultWhenNotAnEmoji: read(chipHtml('x', ' data-chip-emoji="Bonjour"')) === EmojiChip.DEFAULT,
        defaultWhenMarkup: read('<span class="smart-chip" data-chip-kind="emoji" data-chip-emoji="&lt;img src=x onerror=alert(1)&gt;">x</span>') === EmojiChip.DEFAULT,
      };
      return { pass: failedOf(checks).length === 0, notes: JSON.stringify({ failed: failedOf(checks), html }) };
    },
  });

  // --- La pose par le menu « # » ---------------------------------------------------------------------------------------------------------------------------

  cases.push({
    id: 'emojichip_hash_menu_lists_smiley_after_row_number_and_search_finds_it_by_either_name',
    description: 'Le menu « # », onglet Puces, a une ligne « Smiley » juste après « N° de ligne » (« Emoji » en anglais) ; la recherche la trouve par « smiley », « emoji » et « émoji » dans les deux langues, et pas pour une requête sans rapport',
    run: async (h) => {
      const seen = {};
      for (const lang of ['fr', 'en']) {
        await inLang(lang, async () => {
          await openHashList(h);
          await openChipsTab(h);
          const items = panelItems();
          seen[lang] = items;
          const row = I18n.t('chips.rowNumber');
          seen[lang + 'Right'] = items.indexOf(I18n.t('chips.emoji')) === items.indexOf(row) + 1 && items.indexOf(row) >= 0;
          const found = {};
          for (const query of ['smiley', 'emoji', 'émoji', 'smil', 'zzzz']) {
            await openHashList(h);
            await h.typeText(query);
            await h.sleep(70);
            await openChipsTab(h);
            found[query] = panelItems().includes(I18n.t('chips.emoji'));
          }
          seen[lang + 'Found'] = found;
        });
      }
      const checks = {
        frRow: seen.frRight === true && seen.fr.includes('Smiley'),
        enRow: seen.enRight === true && seen.en.includes('Emoji'),
        frFound: seen.frFound.smiley && seen.frFound.emoji && seen.frFound['émoji'] && seen.frFound.smil && !seen.frFound.zzzz,
        enFound: seen.enFound.smiley && seen.enFound.emoji && seen.enFound['émoji'] && seen.enFound.smil && !seen.enFound.zzzz,
      };
      return { pass: failedOf(checks).length === 0, notes: JSON.stringify({ failed: failedOf(checks), seen }) };
    },
  });

  cases.push({
    id: 'emojichip_hash_menu_places_one_selected_smiley_with_its_grid_open_and_one_undo_takes_it_back',
    description: 'Un clic sur « Smiley » dans le menu « # » remplace « # » par UNE puce au smiley d\'origine, sélectionnée, sa grille ouverte (le smiley en cours marqué), la liste refermée ; un seul Annuler enlève la puce et rend le texte d\'avant',
    run: async (h) => {
      const picked = await placeSmiley(h, true);
      const nodes = chipNodes();
      const text = ed().state.doc.textContent;
      const selected = ed().state.selection.node;
      const marked = cells().filter(cell => cell.getAttribute('aria-pressed') === 'true').map(cell => cell.getAttribute('aria-label'));
      const checks = {
        picked,
        oneChip: nodes.length === 1 && nodes[0].node.attrs.emoji === EmojiChip.DEFAULT,
        hashGone: !text.includes('#') && text.startsWith('Merci'),
        listClosed: !panelOpen(),
        selectedChip: !!selected && selected.type.name === 'smartChip' && selected.attrs.kind === EmojiChip.KIND,
        gridOpen: barOpen(),
        currentMarked: same(marked, [EmojiChip.DEFAULT]),
        chipShowsEmoji: !!document.querySelector('.tiptap .smart-chip[data-chip-kind="emoji"]') && document.querySelector('.tiptap .smart-chip[data-chip-kind="emoji"]').textContent === EmojiChip.DEFAULT,
      };
      ed().commands.undo();
      await h.sleep(80);
      const afterUndo = { chips: chipNodes().length, text: ed().state.doc.textContent, bar: barOpen() };
      checks.oneUndo = afterUndo.chips === 0 && afterUndo.text.startsWith('Merci') && !afterUndo.bar;
      return { pass: failedOf(checks).length === 0, notes: JSON.stringify({ failed: failedOf(checks), text, marked, afterUndo, bar: emojiBar() && emojiBar().className }) };
    },
  });

  // --- Le changement au clic ----------------------------------------------------------------------------------------------------------------------------------

  cases.push({
    id: 'emojichip_choosing_another_smiley_replaces_it_in_one_undo_step_and_puts_the_cursor_behind',
    description: 'Un clic sur un smiley de la grille remplace celui de la puce (la puce reste UNE puce, à sa place), rend le curseur derrière elle et referme la grille ; un seul Annuler rend l\'ancien smiley, un seul Rétablir le nouveau ; choisir le même smiley ne change rien et referme aussi',
    run: async (h) => {
      await placeSmiley(h, true);
      await h.sleep(650);
      const target = cellOf(PARTY);
      await press(h, target);
      let nodes = chipNodes();
      const selection = ed().state.selection;
      const afterPick = {
        smiley: nodes.length === 1 ? nodes[0].node.attrs.emoji : null,
        chipText: document.querySelector('.tiptap .smart-chip[data-chip-kind="emoji"]') && document.querySelector('.tiptap .smart-chip[data-chip-kind="emoji"]').textContent,
        cursorBehind: selection.empty && nodes.length === 1 && selection.from === nodes[0].pos + nodes[0].node.nodeSize,
        barClosed: !barOpen(),
      };
      ed().commands.undo();
      await h.sleep(80);
      nodes = chipNodes();
      const undone = nodes.length === 1 ? nodes[0].node.attrs.emoji : 'x' + nodes.length;
      ed().commands.redo();
      await h.sleep(80);
      nodes = chipNodes();
      const redone = nodes.length === 1 ? nodes[0].node.attrs.emoji : 'x' + nodes.length;
      // Le même smiley : rien n'est écrit dans l'historique, la grille se referme.
      await selectChip(h);
      const depthBefore = ed().state.doc.toJSON();
      const open = barOpen();
      await press(h, cellOf(PARTY));
      const sameDoc = JSON.stringify(ed().state.doc.toJSON()) === JSON.stringify(depthBefore);
      const checks = {
        replaced: afterPick.smiley === PARTY && afterPick.chipText === PARTY,
        cursorBehind: afterPick.cursorBehind,
        barClosed: afterPick.barClosed,
        undoneOnce: undone === EmojiChip.DEFAULT,
        redoneOnce: redone === PARTY,
        sameSmileyKeepsDocument: open && sameDoc && !barOpen(),
      };
      return { pass: failedOf(checks).length === 0, notes: JSON.stringify({ failed: failedOf(checks), afterPick, undone, redone, sameDoc }) };
    },
  });

  cases.push({
    id: 'emojichip_selecting_a_placed_smiley_opens_the_grid_and_marks_the_current_one',
    description: 'Sélectionner un smiley déjà posé (un clic sur lui) ouvre sa grille avec lui marqué (aria-pressed) ; la barre « Heure » des puces n\'est jamais ouverte sur un smiley ; la grille se referme quand la sélection quitte le smiley et ne s\'ouvre pas sur une autre puce',
    run: async (h) => {
      await h.resetEditor();
      ed().commands.setContent('<p>Fin ' + chipHtml(HEART) + ' et ' + '<span class="smart-chip" contenteditable="false" data-chip-kind="time">Heure actuelle</span> !</p>');
      await h.sleep(60);
      await selectChip(h);
      const marked = cells().filter(cell => cell.getAttribute('aria-pressed') === 'true').map(cell => cell.getAttribute('aria-label'));
      const opened = { grid: barOpen(), time: timeBarOpen(), marked };
      // Une autre puce (l'heure) : sa barre, pas la grille.
      let timePos = null;
      ed().state.doc.descendants((node, pos) => { if (node.type.name === 'smartChip' && node.attrs.kind === 'time') timePos = pos; });
      ed().commands.setNodeSelection(timePos);
      await h.sleep(110);
      const onTime = { grid: barOpen(), time: timeBarOpen() };
      // Le curseur dans le texte : rien.
      ed().commands.setTextSelection(2);
      await h.sleep(90);
      const inText = { grid: barOpen(), time: timeBarOpen() };
      await selectChip(h);
      const reopened = barOpen();
      ed().commands.setTextSelection(2);
      await h.sleep(90);
      const checks = {
        opens: opened.grid && !opened.time && same(opened.marked, [HEART]),
        timeChipGetsItsOwnBar: !onTime.grid && onTime.time,
        textGetsNone: !inText.grid && !inText.time,
        reopens: reopened,
        closesOnLeaving: !barOpen(),
      };
      return { pass: failedOf(checks).length === 0, notes: JSON.stringify({ failed: failedOf(checks), opened, onTime, inText }) };
    },
  });

  cases.push({
    id: 'emojichip_keyboard_enter_enters_the_grid_arrows_move_escape_leaves_enter_picks',
    description: 'Au clavier : Entrée sur le smiley sélectionné met le focus sur son smiley dans la grille (sans couper le paragraphe), les flèches déplacent le focus d\'un smiley à l\'autre (Début et Fin aux deux bouts), Entrée ou Espace sur un bouton choisit, Échap referme sans rien changer et rend le focus à l\'éditeur',
    run: async (h) => {
      await h.resetEditor();
      ed().commands.setContent('<p>Fin ' + chipHtml(SMILE) + ' !</p>');
      await h.sleep(60);
      await selectChip(h);
      const paragraphsBefore = ed().state.doc.childCount;
      const enter = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true });
      ed().view.dom.dispatchEvent(enter);
      await h.sleep(60);
      const all = cells();
      const focused = () => document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('emoji-cell') ? document.activeElement.getAttribute('aria-label') : null;
      const entered = { focus: focused(), paragraphs: ed().state.doc.childCount, defaultPrevented: enter.defaultPrevented };
      const key = async (name, element) => {
        (element || document.activeElement).dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
        await h.sleep(30);
        return focused();
      };
      const first = all[0].getAttribute('aria-label');
      const second = all[1].getAttribute('aria-label');
      const last = all[all.length - 1].getAttribute('aria-label');
      const atHome = await key('Home');
      const right = await key('ArrowRight');
      const left = await key('ArrowLeft');
      const atEnd = await key('End');
      const down = await key('ArrowDown');
      await key('Home');
      const downFromFirst = await key('ArrowDown');
      const upAgain = await key('ArrowUp');
      // Entrée sur un bouton du clavier ne passe pas par la souris : le clic du navigateur le choisit.
      await key('ArrowRight');
      const chosen = document.activeElement;
      const chosenEmoji = chosen.getAttribute('aria-label');
      chosen.click();
      await h.sleep(90);
      const afterChoice = { smiley: chipNodes().length === 1 ? chipNodes()[0].node.attrs.emoji : null, barClosed: !barOpen() };
      // Échap : referme sans rien changer.
      await selectChip(h);
      ed().view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
      await h.sleep(50);
      await key('ArrowRight');
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await h.sleep(90);
      const afterEscape = { smiley: chipNodes()[0].node.attrs.emoji, barClosed: !barOpen(), inEditor: ed().view.hasFocus() || document.activeElement === ed().view.dom };
      const checks = {
        enterEntersGrid: entered.focus === SMILE && entered.paragraphs === paragraphsBefore && entered.defaultPrevented,
        home: atHome === first,
        right: right === second,
        left: left === first,
        end: atEnd === last,
        downMovesRow: !!down || down === null,
        arrowsAreInverse: !!downFromFirst && downFromFirst !== first && upAgain === first,
        picksWithEnter: afterChoice.smiley === chosenEmoji && afterChoice.barClosed,
        escapeKeepsAndCloses: afterEscape.smiley === chosenEmoji && afterEscape.barClosed && afterEscape.inEditor,
      };
      return { pass: failedOf(checks).length === 0, notes: JSON.stringify({ failed: failedOf(checks), entered, atHome, right, left, atEnd, down, downFromFirst, upAgain, afterChoice, afterEscape }) };
    },
  });

  // --- Ce qui reste du texte ------------------------------------------------------------------------------------------------------------------------------------

  cases.push({
    id: 'emojichip_an_emoji_typed_or_pasted_in_the_text_stays_text_and_is_not_clickable',
    description: 'Un emoji tapé ou collé dans le texte (texte brut, HTML, image de messagerie) reste du texte : aucune puce « Smiley », aucune grille quand on le sélectionne ou qu\'on met le curseur à côté ; seul le smiley du menu « # » est une puce',
    run: async (h) => {
      const sources = {
        plain: { plain: 'Bravo ' + PARTY + ' fin' },
        html: { html: '<p>Bravo ' + PARTY + ' fin</p>', plain: 'Bravo ' + PARTY + ' fin' },
        teams: { html: '<p>Bravo <img alt="' + PARTY + '" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" itemscope itemtype="http://schema.skype.com/Emoji"> fin</p>' },
      };
      const bad = [];
      for (const [name, data] of Object.entries(sources)) {
        await pasteInDocument(h, data);
        ed().commands.setTextSelection(8);
        await h.sleep(90);
        const text = ed().state.doc.textContent;
        if (chipNodes().length || barOpen() || text !== 'Bravo ' + PARTY + ' fin') bad.push(name + ' -> ' + JSON.stringify({ chips: chipNodes().length, bar: barOpen(), text }));
      }
      await h.resetEditor();
      await h.focusAtEnd();
      await h.typeText('Bravo ' + PARTY);
      const typed = { chips: chipNodes().length, text: ed().state.doc.textContent, bar: barOpen() };
      if (typed.chips || typed.bar || typed.text !== 'Bravo ' + PARTY) bad.push('typed -> ' + JSON.stringify(typed));
      return { pass: bad.length === 0, notes: bad.join(' ; ') || 'quatre façons de mettre un emoji dans le texte' };
    },
  });

  cases.push({
    id: 'emojichip_copy_and_paste_of_the_smiley_inside_the_editor_keeps_the_chip_and_the_text_form_is_the_emoji',
    description: 'Copier un smiley posé et le coller dans le document redonne une puce au même smiley (le HTML du presse-papiers porte data-chip-emoji) ; le texte brut copié est le smiley lui-même ; le texte du document (textContent) ne le contient pas',
    run: async (h) => {
      const html = await pasteInDocument(h, { html: '<p>x ' + chipHtml(PARTY) + ' y</p>' });
      const nodes = chipNodes();
      await selectChip(h);
      const selection = ed().state.selection;
      const slice = selection.content();
      const serialized = ed().view.serializeForClipboard(slice);
      const plain = ed().view.someProp('clipboardTextSerializer', f => f(slice, ed().view)) || '';
      const holder = document.createElement('div');
      holder.appendChild(serialized.dom.cloneNode(true));
      const checks = {
        pastedAsChip: nodes.length === 1 && nodes[0].node.attrs.emoji === PARTY,
        htmlHasAttribute: html.includes('data-chip-emoji="' + PARTY + '"'),
        clipboardHtmlHasChip: !!holder.querySelector('[data-chip-kind="emoji"]') && holder.querySelector('[data-chip-kind="emoji"]').getAttribute('data-chip-emoji') === PARTY,
        plainTextIsTheEmoji: plain === PARTY,
        notInTextContent: !ed().state.doc.textContent.includes(PARTY),
      };
      return { pass: failedOf(checks).length === 0, notes: JSON.stringify({ failed: failedOf(checks), html, plain }) };
    },
  });

  cases.push({
    id: 'emojichip_no_smiley_chip_in_text_fields_and_a_pasted_one_becomes_plain_text',
    description: 'Les champs texte (Objet, À, Cc, Cci, nom du PDF) n\'offrent pas la puce « Smiley » dans leur liste « # » ; un smiley du document collé dans un champ y devient le caractère, jamais une puce ni un mot « Smiley »',
    run: async (h) => {
      const ids = ['v2-email-subject', 'v2-email-to', 'v2-email-cc', 'v2-email-cci', 'pdf-filename-template'].filter(id => document.getElementById(id));
      const bad = [];
      for (const id of ids) {
        const field = FieldEditor.of(document.getElementById(id));
        field.view.pasteHTML('<p>Merci ' + chipHtml(PARTY) + ' !</p>');
        const text = field.state.doc.textContent;
        const html = field.getHTML();
        if (text !== 'Merci ' + PARTY + ' !' || /smart-chip|data-chip-kind="emoji"/.test(html)) bad.push(id + ' -> ' + JSON.stringify({ text, html }));
        field.commands.clearContent(true);
      }
      return { pass: bad.length === 0 && ids.length === 5, notes: bad.join(' ; ') || ids.join(',') };
    },
  });

  // --- Les sorties -------------------------------------------------------------------------------------------------------------------------------------------

  cases.push({
    id: 'emojichip_reaches_reader_html_markdown_pdf_and_word_as_its_character',
    description: 'Le smiley arrive dans la Lecture, le HTML, le Markdown, le vrai PDF et le vrai Word comme son caractère, entre ses mots, sans puce ni mot « Smiley » ni image ; un document qui n\'en porte aucun est inchangé',
    run: async (h) => {
      await h.resetEditor();
      ed().commands.setContent('<p>Merci ' + chipHtml(PARTY) + ' à tous ' + chipHtml(HEART) + '</p>');
      await h.sleep(60);
      const html = Editor.getHTML();
      const reader = await ReaderMode.preview(html, null, {});
      const asHtml = await HtmlExport.htmlToDocument(reader, null, { fragment: true });
      const asMarkdown = await MarkdownExport.htmlToMarkdown(reader, null);
      const pdf = await h.exportPdfContent(html, null);
      const pdfText = h.findTextBlocks(pdf.content, () => true).map(b => h.blockPlainText(b)).join(' | ');
      const real = await painted(h, pdf.base64);
      const docx = await h.exportDocxParts(html, null);
      const wordText = docx.doc.documentElement.textContent;
      const want = 'Merci ' + PARTY + ' à tous ' + HEART;
      const noChip = text => !/smart-chip|data-chip|Smiley|Emoji/.test(text);
      const checks = {
        reader: textOfHtml(reader).trim() === want && noChip(reader) && !/<img/i.test(reader),
        html: asHtml.includes(PARTY) && asHtml.includes(HEART) && noChip(asHtml) && !/<img/i.test(asHtml),
        markdown: asMarkdown.trim() === want,
        pdfContent: pdfText.includes(PARTY) && pdfText.includes('à tous') && noChip(pdfText),
        realPdfNoBlankBox: real.blank === 0 && real.shown >= 'Merci à tous '.length + 2,
        word: wordText === want,
      };
      return { pass: failedOf(checks).length === 0, notes: JSON.stringify({ failed: failedOf(checks), md: asMarkdown, word: wordText, pdf: pdfText, real }) };
    },
  });

  cases.push({
    id: 'emojichip_every_offered_smiley_is_painted_in_the_pdf_and_written_in_word_and_markdown',
    description: 'Chacun des smileys proposés, posé comme puce, sort dans le vrai PDF avec un glyphe (aucune case vide : la police PPSymbols les a tous), dans le vrai Word et dans le Markdown, à la même place et dans l\'ordre',
    run: async (h) => {
      await PdfExport.ensurePdfLibsLoaded();
      const all = EmojiChip.all();
      await h.resetEditor();
      ed().commands.setContent('<p>' + all.map(emoji => chipHtml(emoji)).join(' ') + '</p>');
      await h.sleep(80);
      const html = Editor.getHTML();
      const reader = await ReaderMode.preview(html, null, {});
      const asMarkdown = await MarkdownExport.htmlToMarkdown(reader, null);
      const pdf = await h.exportPdfContent(html, null);
      const real = await painted(h, pdf.base64);
      const docx = await h.exportDocxParts(html, null);
      const wordText = docx.doc.documentElement.textContent;
      const want = all.join(' ');
      // Le glyphe de chaque smiley, dans l'une des polices du PDF (sans le sélecteur de variante, que le PDF retire).
      const uncovered = all.filter(emoji => [...emoji].filter(c => c.codePointAt(0) !== 0xFE0F).some(c => !PdfGlyphFallback.covers('PPSymbols', false, false, c.codePointAt(0)) && !PdfGlyphFallback.covers('Roboto', false, false, c.codePointAt(0))));
      const checks = {
        readerHasThem: textOfHtml(reader).trim() === want,
        markdown: asMarkdown.trim() === want,
        word: wordText === want,
        noBlankGlyph: real.blank === 0,
        everyGlyphDrawn: real.shown >= all.length,
        everyCodePointCovered: uncovered.length === 0,
      };
      return { pass: failedOf(checks).length === 0, notes: JSON.stringify({ failed: failedOf(checks), uncovered, real: { shown: real.shown, blank: real.blank, pages: real.pages }, count: all.length }) };
    },
  });

  cases.push({
    id: 'emojichip_in_header_footer_table_cell_and_list_the_smiley_is_still_its_character',
    description: 'Un smiley dans un tableau, une liste et le pied de page s\'écrit comme son caractère dans la Lecture et dans le Word (aucun mot « Smiley » : la puce n\'est lue nulle part comme un libellé)',
    run: async (h) => {
      await h.resetEditor();
      const html = '<table><tbody><tr><td><p>Statut ' + chipHtml(THUMB) + '</p></td></tr></tbody></table><ul><li><p>Point ' + chipHtml(PARTY) + '</p></li></ul>';
      ed().commands.setContent(html);
      await h.sleep(60);
      const model = Editor.getHTML();
      const reader = await ReaderMode.preview(model, null, {});
      const footer = { enabled: true, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '<p>Pied ' + chipHtml(HEART) + '</p>', first: '' } };
      const docx = await h.exportDocxParts(model, footer);
      const word = docx.doc.documentElement.textContent;
      const footerPart = docx.part('word/footer1.xml');
      const footerText = footerPart ? footerPart.documentElement.textContent : '';
      const checks = {
        readerTable: textOfHtml(reader).includes('Statut ' + THUMB) && textOfHtml(reader).includes('Point ' + PARTY),
        noLabel: !/Smiley|smart-chip/.test(reader) && !/Smiley/.test(word),
        wordBody: word.includes('Statut ' + THUMB) && word.includes('Point ' + PARTY),
        wordFooter: footerText === 'Pied ' + HEART,
      };
      return { pass: failedOf(checks).length === 0, notes: JSON.stringify({ failed: failedOf(checks), reader: reader.slice(0, 300), word, footerText }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.emojiChip = cases;
})();
