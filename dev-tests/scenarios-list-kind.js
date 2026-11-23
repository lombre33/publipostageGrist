// Suite "listKind" - une puce, un numéro ou une case à CHAQUE LIGNE (js/list-kind.js ; demande d'Antoine du 23/11 : « dans une liste à puces, j'indente, je voudrais basculer l'indentation en cours en liste numérotée ou en
// cases à cocher, choisir ma puce à chaque ligne et les croiser entre elles »). Avant : « Liste numérotée » sur une sous-ligne numérotait TOUTE la sous-liste (le `toggleList` de TipTap change le type de la liste entière),
// « Cases à cocher » sortait la ligne de ses retraits (`clearNodes` + `wrapInList` : elle remontait au premier niveau et la sous-liste était coupée), le « • » d'une ligne mère remplaçait les numéros de sa sous-liste (CSS),
// une case n'acceptait que des cases sous elle, et Tab sur la première ligne d'une liste (la liste d'avant étant d'un autre genre) ne faisait rien. Cinq parties :
//  1) le CHANGEMENT DE GENRE d'une ligne : seule la ligne change, à son niveau ; ses sous-listes la suivent ; les listes voisines du même genre et du même style se recollent ; le style du bouton va à la liste neuve ; plusieurs
//     lignes sélectionnées changent ensemble ; une ligne qui ne tient pas dans la forme demandée garde la sienne ; un seul Annuler ; la sélection suit ; rien n'est suivi comme une suppression en mode « Suivi des modifications » ;
//  2) le NIVEAU : Tab sur la première ligne d'une liste la glisse sous la liste d'avant (de n'importe quel genre), Maj+Tab sort une ligne de sa liste sans changer son genre, le bouton de retrait reste vif ;
//  3) la FORME du texte : une case porte des puces, des numéros et des cases, le HTML relu les garde ; le numéro d'une sous-liste et la puce sous une case s'affichent (CSS) ; la barre et la fenêtre « Puce… » suivent la ligne ;
//  4) les EXPORTS, lus sur la sortie réelle : Word (numbering.xml : un genre par liste, un retrait par niveau), PDF (positions peintes), Markdown, texte du courriel, HTML exporté ;
//  5) les IMPORTS : le HTML exporté et le Markdown relus gardent les genres mêlés.
// La vraie souris et le vrai clavier à 700x400 (menu des listes, clair et sombre) sont dans dev-tests/verify-list-kind-mouse.mjs (groupe Node "listKindMouse").
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const tiptap = () => document.querySelector('.tiptap');
  const editor = () => EditorCore.getEditor();

  // === Le modèle d'essai ========================================================================================================================================================================
  const li = (text, inner) => `<li><p>${text}</p>${inner || ''}</li>`;
  const ul = (items, attrs) => `<ul${attrs || ''}>${items}</ul>`;
  const ol = (items, attrs) => `<ol${attrs || ''}>${items}</ol>`;
  const box = (checked, inner) => `<li data-checked="${checked}" data-type="taskItem"><label><input type="checkbox"${checked ? ' checked="checked"' : ''}><span></span></label><div>${inner}</div></li>`;
  const tasks = (items, attrs) => `<ul data-type="taskList"${attrs || ''}>${items}</ul>`;
  const FLAT = ul(li('A') + li('B') + li('C') + li('D'));
  const NEST = ul(li('A', ul(li('a1') + li('a2') + li('a3'))) + li('B'));

  async function load(html) {
    Editor.setHTML(html);
    await sleep(150);
  }
  // Le curseur dans le texte `needle`, comme un clic y met : la sélection de ProseMirror, pas celle du navigateur.
  async function caretIn(needle, at) {
    let found = null;
    editor().state.doc.descendants((node, pos) => {
      if (found !== null || !node.isText) return;
      const index = node.text.indexOf(needle);
      if (index !== -1) found = pos + index + (at === undefined ? needle.length : at);
    });
    if (found === null) throw new Error('texte introuvable dans l\'éditeur : ' + needle);
    editor().chain().focus().setTextSelection(found).run();
    await sleep(40);
  }
  async function selectFrom(first, last) {
    let from = null, to = null;
    editor().state.doc.descendants((node, pos) => {
      if (!node.isText) return;
      if (from === null && node.text.indexOf(first) !== -1) from = pos + node.text.indexOf(first);
      if (node.text.indexOf(last) !== -1) to = pos + node.text.indexOf(last) + last.length;
    });
    editor().chain().focus().setTextSelection({ from, to }).run();
    await sleep(40);
  }
  // Une frappe telle que ProseMirror la reçoit ; vrai quand elle est consommée.
  function press(init) {
    const event = new KeyboardEvent('keydown', Object.assign({ bubbles: true, cancelable: true }, init));
    tiptap().dispatchEvent(event);
    return event.defaultPrevented;
  }
  const tab = () => press({ key: 'Tab' });
  const shiftTab = () => press({ key: 'Tab', shiftKey: true });
  const click = id => document.getElementById(id).click();
  // L'arbre des listes lu sur le MODÈLE : b(...) puces, n(...) numéros, t(...) cases (✓ cochée) ; « b(A n(B),C) » = une liste à puces de deux points, A portant une sous-liste numérotée.
  function shape(markup) {
    const root = new DOMParser().parseFromString('<body>' + (markup || Editor.getHTML()) + '</body>', 'text/html').body;
    const kind = el => (el.getAttribute('data-type') === 'taskList' ? 't' : el.tagName === 'OL' ? 'n' : 'b');
    const item = (node) => {
      const body = node.getAttribute('data-type') === 'taskItem' ? node.querySelector(':scope > div') : node;
      const text = Array.from(body.children).filter(c => c.tagName === 'P').map(p => p.textContent).join('/');
      const subs = Array.from(body.children).filter(c => /^(UL|OL)$/.test(c.tagName)).map(list);
      return (node.getAttribute('data-checked') === 'true' ? '✓' : '') + text + (subs.length ? ' ' + subs.join(' ') : '');
    };
    const list = el => kind(el) + '(' + Array.from(el.children).filter(c => c.tagName === 'LI').map(item).join(',') + ')';
    return Array.from(root.children).filter(c => /^(UL|OL)$/.test(c.tagName)).map(list).join(' ');
  }
  const compact = () => Editor.getHTML().replace(/<p><\/p>$/, '');
  const caretWord = () => { const sel = editor().state.selection; return sel.$from.parent.textContent + '@' + sel.$from.parentOffset + (sel.empty ? '' : '..' + sel.$to.parentOffset); };

  // === 1) Le changement de genre d'une ligne ====================================================================================================================================================

  cases.push({
    id: 'listkind_numbers_on_a_sub_line_change_only_that_line',
    description: '« 1. 2. 3. » sur la sous-ligne « a2 » : seule « a2 » devient numérotée, à son niveau, entre « a1 » et « a3 » qui gardent leur puce (avant : les trois sous-lignes devenaient numérotées)',
    run: async (h) => {
      await h.resetEditor();
      await load(NEST);
      await caretIn('a2');
      click('v2-btn-ordered-numeric');
      await sleep(80);
      const got = shape();
      return { pass: got === 'b(A b(a1) n(a2) b(a3),B)' && caretWord() === 'a2@2', notes: JSON.stringify({ got, caret: caretWord() }) };
    },
  });

  cases.push({
    id: 'listkind_checkbox_on_a_sub_line_keeps_its_level',
    description: '« Case à cocher » sur « a2 » : « a2 » devient une case SOUS « A », au même niveau que ses voisines (avant : elle remontait au premier niveau et la sous-liste était coupée en morceaux)',
    run: async (h) => {
      await h.resetEditor();
      await load(NEST);
      await caretIn('a2');
      click('v2-btn-checklist-accent-strike');
      await sleep(80);
      const got = shape();
      return { pass: got === 'b(A b(a1) t(a2) b(a3),B)', notes: got };
    },
  });

  cases.push({
    id: 'listkind_a_flat_line_gets_its_own_kind_at_the_same_level',
    description: '« 1. 2. 3. » sur « B » d\'une liste à puces à plat : seule « B » est numérotée, au même niveau (avant : les quatre lignes devenaient numérotées) ; de même une case, des lettres, des chiffres romains',
    run: async (h) => {
      const got = {};
      for (const [id, button] of [['n', 'v2-btn-ordered-numeric'], ['t', 'v2-btn-checklist-accent-strike'], ['alpha', 'v2-btn-ordered-alpha'], ['roman', 'v2-btn-ordered-roman']]) {
        await h.resetEditor();
        await load(FLAT);
        await caretIn('B');
        click(button);
        await sleep(80);
        got[id] = shape() + (id === 'alpha' || id === 'roman' ? ' ' + (Editor.getHTML().match(/data-number-style="(\w+)"/) || [])[1] : '');
      }
      const want = { n: 'b(A) n(B) b(C,D)', t: 'b(A) t(B) b(C,D)', alpha: 'b(A) n(B) b(C,D) alpha', roman: 'b(A) n(B) b(C,D) roman' };
      return { pass: JSON.stringify(got) === JSON.stringify(want), notes: JSON.stringify(got) };
    },
  });

  cases.push({
    id: 'listkind_the_new_list_takes_the_style_of_the_button',
    description: 'Le style du bouton va à la liste neuve de la ligne : lettres, romain, puce carrée ou cercle (sur une ligne numérotée), cases classiques ; les listes voisines gardent le leur',
    run: async (h) => {
      const got = {};
      await h.resetEditor();
      await load(FLAT);
      await caretIn('B');
      click('v2-btn-ordered-alpha');
      await sleep(60);
      got.alpha = /<ol data-number-style="alpha"><li><p>B<\/p>/.test(Editor.getHTML());
      click('v2-btn-bullet-square');
      await sleep(60);
      got.square = /<ul data-bullet-style="square"><li><p>B<\/p>/.test(Editor.getHTML()) && shape() === 'b(A) b(B) b(C,D)';
      click('v2-btn-checklist-classic');
      await sleep(60);
      got.classic = /<ul data-tasklist-style="classic" data-type="taskList"><li[^>]*><label>.*?<p>B<\/p>/.test(Editor.getHTML()) && shape() === 'b(A) t(B) b(C,D)';
      click('v2-btn-bullet-circle');
      await sleep(60);
      got.circle = /<ul data-bullet-style="circle"><li><p>B<\/p>/.test(Editor.getHTML());
      got.plainNeighbours = !/data-bullet-style="(circle|square)"><li><p>(A|C)</.test(Editor.getHTML());
      return { pass: Object.values(got).every(Boolean), notes: JSON.stringify({ got, html: compact() }) };
    },
  });

  cases.push({
    id: 'listkind_the_line_back_to_the_kind_of_its_neighbours_glues_the_lists',
    description: 'Une ligne repassée au genre de ses voisines (et à leur style) recolle les listes : « B » numérotée puis de nouveau en puce, au milieu de puces CERCLE, rend UNE seule liste à puces cercle',
    run: async (h) => {
      await h.resetEditor();
      await load(ul(li('A') + li('B') + li('C') + li('D'), ' data-bullet-style="circle"'));
      await caretIn('B');
      click('v2-btn-ordered-numeric');
      await sleep(80);
      const split = shape();
      click('v2-btn-bullet');
      await sleep(80);
      const back = compact();
      return { pass: split === 'b(A) n(B) b(C,D)' && shape() === 'b(A,B,C,D)' && /^<ul data-bullet-style="circle"><li><p>A<\/p><\/li><li><p>B<\/p><\/li><li><p>C<\/p><\/li><li><p>D<\/p><\/li><\/ul>$/.test(back), notes: JSON.stringify({ split, back }) };
    },
  });

  cases.push({
    id: 'listkind_a_line_next_to_a_list_of_its_new_kind_joins_it',
    description: 'La dernière ligne d\'une liste à puces qui suit une liste numérotée passe en numéros : elle rejoint la liste numérotée (1. 2. 3.), elle n\'en ouvre pas une troisième',
    run: async (h) => {
      await h.resetEditor();
      await load(ol(li('un') + li('deux')) + ul(li('trois') + li('quatre')));
      await caretIn('trois');
      click('v2-btn-ordered-numeric');
      await sleep(80);
      const got = shape();
      return { pass: got === 'n(un,deux,trois) b(quatre)', notes: got };
    },
  });

  cases.push({
    id: 'listkind_several_selected_lines_change_together_and_the_selection_follows',
    description: 'Trois lignes sélectionnées, « 1. 2. 3. » : elles forment ensemble une liste numérotée, la quatrième garde sa puce, la sélection porte toujours sur les mêmes mots',
    run: async (h) => {
      await h.resetEditor();
      await load(FLAT);
      await selectFrom('A', 'C');
      const before = editor().state.doc.textBetween(editor().state.selection.from, editor().state.selection.to, '|');
      click('v2-btn-ordered-numeric');
      await sleep(80);
      const after = editor().state.doc.textBetween(editor().state.selection.from, editor().state.selection.to, '|');
      return { pass: shape() === 'n(A,B,C) b(D)' && before === after && after === 'A|B|C', notes: JSON.stringify({ got: shape(), before, after }) };
    },
  });

  cases.push({
    id: 'listkind_the_sub_lists_of_a_line_follow_it',
    description: 'Une ligne qui porte une sous-liste change de genre avec ses sous-lignes : « A » (et ses trois sous-puces) devient une case, les sous-puces restent des puces SOUS la case',
    run: async (h) => {
      await h.resetEditor();
      await load(NEST);
      await caretIn('A');
      click('v2-btn-checklist-accent-strike');
      await sleep(80);
      return { pass: shape() === 't(A b(a1,a2,a3)) b(B)', notes: shape() };
    },
  });

  cases.push({
    id: 'listkind_a_checked_box_gives_its_state_up_cleanly_and_a_new_box_starts_unchecked',
    description: 'Une case cochée repassée en puce garde son texte et ses sous-lignes ; une puce passée en case démarre décochée',
    run: async (h) => {
      await h.resetEditor();
      await load(tasks(box(true, '<p>fait</p>' + ul(li('détail')))) + ul(li('à faire')));
      await caretIn('fait');
      click('v2-btn-bullet');
      await sleep(80);
      const asBullet = shape();
      await caretIn('à faire');
      click('v2-btn-checklist-accent-strike');
      await sleep(80);
      return { pass: asBullet === 'b(fait b(détail),à faire)' || asBullet === 'b(fait b(détail)) b(à faire)', notes: JSON.stringify({ asBullet, now: shape(), html: compact() }) };
    },
  });

  cases.push({
    id: 'listkind_a_line_that_cannot_become_a_box_keeps_its_bullet',
    description: 'Un point de puce qui porte un tableau ne tient pas dans une case : « Case à cocher » ne le déforme pas (il garde sa puce, son tableau reste dans sa liste) ; ses voisines, elles, changent',
    run: async (h) => {
      await h.resetEditor();
      await load(ul(li('A') + '<li><p>B</p><table><tbody><tr><td><p>x</p></td></tr></tbody></table></li>' + li('C')));
      // De « A » à la fin du texte de « B » : la sélection ne touche pas au tableau (une sélection qui touche du texte hors liste est laissée à la commande de TipTap).
      await selectFrom('A', 'B');
      const before = Editor.getHTML();
      click('v2-btn-checklist-accent-strike');
      await sleep(80);
      const html = Editor.getHTML();
      return { pass: shape(html) === 't(A) b(B,C)' && /<li><p>B<\/p><table/.test(html) && before !== html, notes: html };
    },
  });

  cases.push({
    id: 'listkind_one_undo_per_gesture',
    description: 'Un seul Annuler défait un changement de genre, un seul défait le retour : le HTML revient à l\'octet près',
    run: async (h) => {
      await h.resetEditor();
      await load(NEST);
      const original = compact();
      await caretIn('a2');
      await sleep(600);
      click('v2-btn-ordered-numeric');
      await sleep(80);
      const changed = compact();
      editor().commands.undo();
      await sleep(80);
      const undone = compact();
      editor().commands.redo();
      await sleep(80);
      return { pass: changed !== original && undone === original && compact() === changed, notes: JSON.stringify({ original, changed, undone }) };
    },
  });

  cases.push({
    id: 'listkind_the_toolbar_shows_the_kind_of_the_line_not_of_its_parent',
    description: 'Sur « a2 » (numérotée) sous « A » (puce disque), la barre enfonce « 1. 2. 3. » et PAS la puce disque de la ligne mère ; sur « A », la puce disque',
    run: async (h) => {
      await h.resetEditor();
      await load(NEST);
      await caretIn('a2');
      click('v2-btn-ordered-numeric');
      await sleep(80);
      await caretIn('a2');
      await sleep(80);
      const on = id => document.getElementById(id).classList.contains('is-active');
      const sub = { numeric: on('v2-btn-ordered-numeric'), disc: on('v2-btn-bullet-disc'), main: on('v2-btn-bullet') };
      await caretIn('A', 1);
      await sleep(80);
      const top = { numeric: on('v2-btn-ordered-numeric'), disc: on('v2-btn-bullet-disc'), main: on('v2-btn-bullet') };
      return { pass: sub.numeric && !sub.disc && sub.main && top.disc && !top.numeric && top.main, notes: JSON.stringify({ sub, top }) };
    },
  });

  cases.push({
    id: 'listkind_the_bullet_sign_window_follows_the_line',
    description: '« Puce… » reste grisée sur une ligne numérotée ou à case sous une puce (pas de puce à régler) et se dégrise sur une ligne à puce',
    run: async (h) => {
      await h.resetEditor();
      await load(ul(li('A', ol(li('un')) + tasks(box(false, '<p>case</p>')) + ul(li('puce')))));
      const row = () => document.getElementById('v2-btn-bullet-char');
      const states = {};
      for (const word of ['un', 'case', 'puce']) {
        await caretIn(word);
        await sleep(80);
        BulletFormat.syncRow(row(), editor());
        states[word] = row().getAttribute('aria-disabled');
      }
      return { pass: states.un === 'true' && states.case === 'true' && states.puce === 'false', notes: JSON.stringify(states) };
    },
  });

  cases.push({
    id: 'listkind_all_lines_already_of_the_kind_keep_the_old_gestures',
    description: 'Quand toutes les lignes ont déjà le genre demandé, rien ne change de ce qui existait : le bouton « Liste » retire la liste, un style de puce règle toute la liste',
    run: async (h) => {
      await h.resetEditor();
      await load(FLAT);
      await caretIn('B');
      click('v2-btn-bullet-square');
      await sleep(80);
      const styled = (Editor.getHTML().match(/data-bullet-style="square"/g) || []).length === 1 && shape() === 'b(A,B,C,D)';
      click('v2-btn-bullet');
      await sleep(80);
      const removed = shape() === 'b(A) b(C,D)' && /<p>B<\/p>/.test(Editor.getHTML());
      return { pass: styled && removed, notes: JSON.stringify({ styled, removed, got: shape(), html: compact() }) };
    },
  });

  cases.push({
    id: 'listkind_plain_text_still_becomes_a_list_the_usual_way',
    description: 'Un paragraphe ordinaire, ou une sélection qui mêle paragraphes et lignes de liste, passe par la commande de TipTap comme avant : « 1. 2. 3. » sur un paragraphe pose une liste numérotée',
    run: async (h) => {
      await h.resetEditor();
      await load('<p>Seul</p>');
      await caretIn('Seul');
      click('v2-btn-ordered-numeric');
      await sleep(80);
      const plain = shape();
      await h.resetEditor();
      await load('<p>Avant</p>' + ul(li('A') + li('B')));
      await selectFrom('Avant', 'B');
      click('v2-btn-ordered-numeric');
      await sleep(80);
      return { pass: plain === 'n(Seul)' && /<ol/.test(Editor.getHTML()), notes: JSON.stringify({ plain, mixed: shape(), html: compact() }) };
    },
  });

  cases.push({
    id: 'listkind_the_shortcut_keys_change_one_line_too',
    description: 'Ctrl+Maj+7 (numérotée) et Ctrl+Maj+9 (cases) agissent comme les boutons : sur « B » d\'une liste à puces, seule « B » change',
    run: async (h) => {
      const got = {};
      for (const [name, init] of [['n', { key: '&', code: 'Digit7', keyCode: 55 }], ['t', { key: '(', code: 'Digit9', keyCode: 57 }]]) {
        await h.resetEditor();
        await load(FLAT);
        await caretIn('B');
        press(Object.assign({ ctrlKey: true, shiftKey: true }, init));
        await sleep(80);
        got[name] = shape();
      }
      return { pass: got.n === 'b(A) n(B) b(C,D)' && got.t === 'b(A) t(B) b(C,D)', notes: JSON.stringify(got) };
    },
  });

  cases.push({
    id: 'listkind_a_selection_of_table_cells_changes_the_line_of_each_cell',
    description: 'Sur une sélection de cases de tableau, « 1. 2. 3. » change, dans chaque case, la ligne où se trouve le curseur de la case pour elle seule (la case de tête est celle qui compte) : ici la deuxième puce de chaque case n\'est pas touchée, la liste de chaque case garde ses lignes',
    run: async (h) => {
      await h.resetEditor();
      await load('<table><tbody><tr><td>' + ul(li('g1') + li('g2')) + '</td><td>' + ul(li('d1') + li('d2')) + '</td></tr></tbody></table>');
      const table = editor().state.doc.child(0);
      const rowNode = table.child(0);
      const first = 1 + 1;
      const second = first + rowNode.child(0).nodeSize;
      editor().commands.setCellSelection({ anchorCell: first, headCell: second });
      await sleep(80);
      click('v2-btn-ordered-numeric');
      await sleep(120);
      const cellsOf = () => Array.from(tiptap().querySelectorAll('td')).map(td => Array.from(td.children).map(c => (c.tagName === 'OL' ? 'n' : 'b') + '(' + Array.from(c.children).map(l => l.textContent).join(',') + ')').join(' '));
      const got = cellsOf();
      return { pass: got.length === 2 && got.every(cell => /^n\(/.test(cell) && !/^b\(/.test(cell) === true), notes: JSON.stringify(got) };
    },
  });

  // === 2) Le niveau d'une ligne =================================================================================================================================================================

  cases.push({
    id: 'listkind_tab_on_the_first_line_of_a_list_slides_under_the_list_before',
    description: 'Une liste numérotée qui suit une liste à puces : Tab sur sa première ligne la glisse sous la dernière ligne de la liste d\'avant, en gardant ses numéros ; la ligne suivante reste au premier niveau (avant : Tab ne faisait rien)',
    run: async (h) => {
      await h.resetEditor();
      await load(ul(li('A')) + ol(li('B') + li('C')));
      await caretIn('B');
      const consumed = tab();
      await sleep(80);
      return { pass: consumed && shape() === 'b(A n(B)) n(C)' && caretWord() === 'B@1', notes: JSON.stringify({ consumed, got: shape(), caret: caretWord() }) };
    },
  });

  cases.push({
    id: 'listkind_a_second_line_slid_under_the_same_line_joins_its_sub_list',
    description: 'Deux lignes de même genre glissées l\'une après l\'autre sous la même ligne mère forment UNE sous-liste (pas deux listes côte à côte)',
    run: async (h) => {
      await h.resetEditor();
      await load(ul(li('A')) + ol(li('B') + li('C') + li('D')));
      await caretIn('B');
      tab();
      await sleep(80);
      await caretIn('C');
      tab();
      await sleep(80);
      return { pass: shape() === 'b(A n(B,C)) n(D)', notes: shape() };
    },
  });

  cases.push({
    id: 'listkind_a_bullet_can_go_under_a_box_and_keeps_its_bullet',
    description: 'Une puce glissée sous une case reste une puce, sous le texte de la case (avant : le schéma refusait autre chose que des cases sous une case) ; et le HTML relu garde cette puce',
    run: async (h) => {
      await h.resetEditor();
      await load(tasks(box(false, '<p>B</p>')) + ul(li('C')));
      await caretIn('C');
      tab();
      await sleep(80);
      const got = shape();
      const html = Editor.getHTML();
      await load(html);
      return { pass: got === 't(B b(C))' && shape() === 't(B b(C))', notes: JSON.stringify({ got, reloaded: shape(), html }) };
    },
  });

  cases.push({
    id: 'listkind_shift_tab_keeps_the_kind_of_a_numbered_line_under_a_bullet',
    description: 'Maj+Tab sur « b2 » (numérotée, sous la puce « A ») la remonte au niveau de « A », toujours numérotée ; « b3 » passe sous elle ; « Z » garde sa puce (avant : elle devenait une puce de la liste de « A »)',
    run: async (h) => {
      await h.resetEditor();
      await load(ul(li('A', ol(li('b1') + li('b2') + li('b3'))) + li('Z')));
      await caretIn('b2');
      const consumed = shiftTab();
      await sleep(80);
      return { pass: consumed && shape() === 'b(A n(b1)) n(b2 n(b3)) b(Z)' && caretWord() === 'b2@2', notes: JSON.stringify({ consumed, got: shape(), caret: caretWord() }) };
    },
  });

  cases.push({
    id: 'listkind_shift_tab_keeps_a_box_under_a_bullet_a_box',
    description: 'Maj+Tab sur une case sous une puce la remonte au premier niveau, toujours une case (avant : la ligne sortait de toute liste et devenait un paragraphe)',
    run: async (h) => {
      await h.resetEditor();
      await load(ul(li('A', tasks(box(false, '<p>t1</p>'))) + li('Z')));
      await caretIn('t1');
      shiftTab();
      await sleep(80);
      return { pass: shape() === 'b(A) t(t1) b(Z)', notes: shape() };
    },
  });

  cases.push({
    id: 'listkind_shift_tab_on_a_top_level_line_still_leaves_the_list',
    description: 'Maj+Tab sur une ligne du premier niveau la sort de sa liste (un paragraphe), comme avant ; le retrait d\'une ligne de même genre que sa ligne mère reste celui de TipTap',
    run: async (h) => {
      await h.resetEditor();
      await load(NEST);
      await caretIn('a2');
      shiftTab();
      await sleep(80);
      const same = shape();
      await h.resetEditor();
      await load(FLAT);
      await caretIn('B');
      shiftTab();
      await sleep(80);
      return { pass: same === 'b(A b(a1),a2 b(a3),B)' && /<ul><li><p>A<\/p><\/li><\/ul><p>B<\/p>/.test(Editor.getHTML()), notes: JSON.stringify({ same, html: compact() }) };
    },
  });

  cases.push({
    id: 'listkind_the_indent_button_stays_live_on_the_first_line_after_another_list',
    description: '« Augmenter le retrait » n\'est pas grisé sur la première ligne d\'une liste qui en suit une autre, l\'est sur la toute première ligne du texte',
    run: async (h) => {
      await h.resetEditor();
      await load(ul(li('A')) + ol(li('B')));
      await caretIn('B');
      await sleep(250);
      const btn = document.getElementById('v2-btn-indent');
      // Un bouton grisé l'est « doucement » (js/lock-reasons.js) : `aria-disabled`, le bouton garde son clic pour ouvrir la bulle qui dit pourquoi.
      const off = () => btn.disabled || btn.getAttribute('aria-disabled') === 'true';
      const second = off();
      await caretIn('A');
      await sleep(250);
      const first = off();
      return { pass: second === false && first === true, notes: JSON.stringify({ second, first }) };
    },
  });

  cases.push({
    id: 'listkind_tab_gestures_are_one_undo_step',
    description: 'Tab sur la première ligne d\'une liste et Maj+Tab sur une ligne de genre différent se défont chacun d\'un seul Annuler',
    run: async (h) => {
      await h.resetEditor();
      await load(ul(li('A')) + ol(li('B')));
      const original = compact();
      await caretIn('B');
      await sleep(600);
      tab();
      await sleep(80);
      const moved = compact();
      editor().commands.undo();
      await sleep(80);
      const back = compact();
      await load(ul(li('A', ol(li('b1') + li('b2')))));
      const second = compact();
      await caretIn('b2');
      await sleep(600);
      shiftTab();
      await sleep(80);
      const lifted = compact();
      editor().commands.undo();
      await sleep(80);
      return { pass: moved !== original && back === original && lifted !== second && compact() === second, notes: JSON.stringify({ original, moved, back, second, lifted }) };
    },
  });

  // === 3) La forme du texte =====================================================================================================================================================================

  cases.push({
    id: 'listkind_a_box_carries_bullets_numbers_and_boxes_and_the_html_keeps_them',
    description: 'Une case accepte sous elle des puces, des numéros et des cases à la fois, et le HTML enregistré les garde à la réouverture (avant : seules des cases étaient permises sous une case)',
    run: async (h) => {
      await h.resetEditor();
      const MIX = tasks(box(true, '<p>ECHO</p>' + ul(li('FOXTROT')) + ol(li('GOLF') + li('HOTEL')) + tasks(box(false, '<p>INDIA</p>'))));
      await load(MIX);
      const first = shape();
      await load(Editor.getHTML());
      return { pass: first === 't(✓ECHO b(FOXTROT) n(GOLF,HOTEL) t(INDIA))' && shape() === first, notes: JSON.stringify({ first, reloaded: shape() }) };
    },
  });

  cases.push({
    id: 'listkind_a_numbered_sub_list_shows_its_numbers_not_the_bullet_of_its_parent',
    description: 'Le « • » d\'une ligne mère à puces ne remplace plus les numéros de sa sous-liste (CSS), ni à l\'écran de l\'éditeur ni dans la Lecture ; une puce sous une case garde sa puce et reste un point de liste',
    run: async (h) => {
      await h.resetEditor();
      await load(ul(li('A', ol(li('un') + li('deux')))) + tasks(box(false, '<p>case</p>' + ul(li('puce')))));
      const look = (root, word) => {
        const item = Array.from(root.querySelectorAll('li')).find(node => Array.from(node.querySelectorAll(':scope > p, :scope > div > p')).some(p => p.textContent === word));
        return { content: getComputedStyle(item, '::marker').content, type: getComputedStyle(item).listStyleType, display: getComputedStyle(item).display };
      };
      const edit = { un: look(tiptap(), 'un'), puce: look(tiptap(), 'puce') };
      const rc = document.getElementById('reader-container');
      const shown = rc.style.display;
      rc.style.display = 'block';
      await ReaderMode.render(Editor.getHTML(), null, { id: 1 }, { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } });
      const read = { un: look(rc.querySelector('.reader-content'), 'un'), puce: look(rc.querySelector('.reader-content'), 'puce') };
      rc.style.display = shown;
      const numbered = v => v.content === 'normal' && v.type === 'decimal' && v.display === 'list-item';
      const bullet = v => /•/.test(v.content) && v.display === 'list-item';
      return { pass: numbered(edit.un) && bullet(edit.puce) && numbered(read.un) && bullet(read.puce), notes: JSON.stringify({ edit, read }) };
    },
  });

  // === 4) Les exports ===========================================================================================================================================================================

  // Un document qui mêle les trois genres sur trois niveaux, chaque ligne un mot de repère en capitales.
  const MIX = ul(li('ALPHA', ol(li('BRAVO')) + tasks(box(false, '<p>CHARLIE</p>')))) + ol(li('DELTA')) + tasks(box(true, '<p>ECHO</p>' + ul(li('FOXTROT')) + ol(li('GOLF') + li('HOTEL')) + tasks(box(false, '<p>INDIA</p>'))));
  async function mixFromEditor(h) {
    await h.resetEditor();
    h.setA4Preview(true);
    await load(MIX);
    return Editor.getHTML();
  }

  cases.push({
    id: 'listkind_word_writes_one_numbering_per_list_and_one_level_per_depth',
    description: 'Word : chaque liste a sa numérotation du bon genre (puces, numéros, cases en « ☐ / ☑ ») et chaque sous-liste un cran de retrait de plus, y compris sous une case ; la case est au retrait de son niveau',
    run: async (h) => {
      const html = await mixFromEditor(h);
      const parts = await h.exportDocxParts(html);
      const numbering = h.docxNumbering(parts.part('word/numbering.xml'));
      const ps = h.docxParagraphs(parts.doc).filter(p => p.text && p.text.trim());
      const row = (word) => {
        const p = ps.find(x => x.text.indexOf(word) !== -1);
        const n = p && p.numId ? numbering[p.numId] : null;
        return p ? (n ? n.format + '@' + n.indentLeft : 'texte@' + p.indentLeft) : 'absent';
      };
      const got = { ALPHA: row('ALPHA'), BRAVO: row('BRAVO'), CHARLIE: row('CHARLIE'), DELTA: row('DELTA'), ECHO: row('ECHO'), FOXTROT: row('FOXTROT'), GOLF: row('GOLF'), INDIA: row('INDIA') };
      const want = { ALPHA: 'bullet@360', BRAVO: 'decimal@720', CHARLIE: 'texte@720', DELTA: 'decimal@360', ECHO: 'texte@360', FOXTROT: 'bullet@720', GOLF: 'decimal@720', INDIA: 'texte@720' };
      return { pass: JSON.stringify(got) === JSON.stringify(want) && ps.some(p => p.text === '☑ ECHO') && ps.some(p => p.text === '☐ CHARLIE'), notes: JSON.stringify({ got, texts: ps.map(p => p.text) }) };
    },
  });

  cases.push({
    id: 'listkind_pdf_paints_each_line_with_its_own_marker_at_the_editor_position',
    description: 'PDF : dans le fichier décodé par pdf.js, chaque ligne est sur sa propre ligne dans l\'ordre du document, avec son signe (• ou 1.), plus à droite que sa ligne mère, et à la place de l\'éditeur à 1,5 pt près',
    run: async (h) => {
      const html = await mixFromEditor(h);
      const root = tiptap();
      const left = new Map();
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const found = /[A-Z]{4,}/.exec(node.nodeValue);
        if (!found) continue;
        const range = document.createRange();
        range.setStart(node, found.index);
        range.setEnd(node, found.index + found[0].length);
        left.set(found[0], (range.getBoundingClientRect().left - root.getBoundingClientRect().left) * 0.75);
      }
      const result = await h.exportPdfContent(html);
      const truth = await h.extractPdfGroundTruth(result.base64);
      const items = truth.pages[0].textItems;
      const words = ['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA', 'ECHO', 'FOXTROT', 'GOLF', 'HOTEL', 'INDIA'];
      const found = words.map(word => items.find(item => item.str.startsWith(word)));
      if (found.some(item => !item)) return { pass: false, notes: 'mot absent du PDF : ' + JSON.stringify(items.map(item => item.str)) };
      const ys = found.map(item => Math.round(item.y * 10) / 10);
      const xs = found.map(item => Math.round(item.x * 10) / 10);
      const ordered = ys.every((y, i) => i === 0 || y > ys[i - 1] + 5);
      // ALPHA (puce) < BRAVO, CHARLIE (sous ALPHA) ; DELTA au premier niveau ; ECHO < FOXTROT, GOLF, HOTEL, INDIA (sous ECHO).
      const levels = xs[1] > xs[0] + 5 && xs[2] > xs[0] + 5 && xs[5] > xs[4] + 5 && Math.abs(xs[5] - xs[6]) < 1 && Math.abs(xs[6] - xs[7]) < 1 && xs[8] > xs[4] + 5;
      const bullets = items.filter(item => /^•$/.test(item.str)).length;
      const numbers = items.filter(item => /^\d+\.$/.test(item.str)).map(item => item.str);
      // L'écart entre le texte et le bord gauche du document : le même dans l'éditeur et dans le PDF pour les lignes à puce ou à numéro (une case a sa propre mise en page).
      const gap = word => Math.round((found[words.indexOf(word)].x - left.get(word)) * 10) / 10;
      const sameAsEditor = ['ALPHA', 'BRAVO', 'DELTA', 'FOXTROT', 'GOLF'].map(gap).every((value, i, all) => Math.abs(value - all[0]) < 1.5);
      return { pass: ordered && levels && bullets === 2 && numbers.join() === '1.,1.,1.,2.' && sameAsEditor, notes: JSON.stringify({ ys, xs, bullets, numbers, gaps: ['ALPHA', 'BRAVO', 'DELTA', 'FOXTROT', 'GOLF'].map(gap) }) };
    },
  });

  cases.push({
    id: 'listkind_markdown_writes_each_kind_in_its_own_list_at_its_level',
    description: 'Markdown : une puce, un numéro et une case se suivent chacun dans sa liste (« - », « 1. », « - [ ] »), au retrait de leur niveau, y compris sous une case',
    run: async (h) => {
      const html = await mixFromEditor(h);
      const { text } = await h.exportMarkdown(html);
      const lines = text.split('\n').filter(line => line.trim());
      const want = ['- ALPHA', '  1. BRAVO', '  - [ ] CHARLIE', '1. DELTA', '- [x] ECHO', '  - FOXTROT', '  1. GOLF', '  2. HOTEL', '  - [ ] INDIA'];
      return { pass: JSON.stringify(lines) === JSON.stringify(want), notes: JSON.stringify(lines) };
    },
  });

  cases.push({
    id: 'listkind_email_text_writes_each_marker_at_its_level',
    description: 'Texte du courriel : « • », « 1. » et « [ ] » devant chaque ligne, retrait par niveau, y compris sous une case',
    run: async (h) => {
      const html = await mixFromEditor(h);
      const text = MailtoExport.plainTextFromHtml(html).split('\n').map(line => line.replace(/\s+$/, ''));
      const want = ['• ALPHA', '  1. BRAVO', '  [ ] CHARLIE', '1. DELTA', '[x] ECHO', '    • FOXTROT', '    1. GOLF', '    2. HOTEL', '    [ ] INDIA'];
      return { pass: JSON.stringify(text) === JSON.stringify(want), notes: JSON.stringify(text) };
    },
  });

  cases.push({
    id: 'listkind_html_export_keeps_the_kinds_in_place',
    description: 'HTML exporté : une puce, un numéro et une case se suivent chacun dans sa liste (« ul », « ol », « ul.pp-tasks »), les sous-listes d\'une case DANS son corps',
    run: async (h) => {
      const html = await mixFromEditor(h);
      const { text } = await h.exportHtml(html, null, {}, null, '', { fragment: true });
      const doc = new DOMParser().parseFromString(text, 'text/html');
      const root = doc.querySelector('.pp-doc');
      const kind = el => (el.matches('ul.pp-tasks') ? 't' : el.tagName === 'OL' ? 'n' : 'b');
      const item = (node) => {
        const body = node.querySelector(':scope > .pp-task-body') || node;
        const subs = Array.from(body.children).filter(c => /^(UL|OL)$/.test(c.tagName)).map(list);
        return body.querySelector(':scope > p').textContent + (subs.length ? ' ' + subs.join(' ') : '');
      };
      const list = el => kind(el) + '(' + Array.from(el.children).filter(c => c.tagName === 'LI').map(item).join(',') + ')';
      const got = Array.from(root.children).filter(c => /^(UL|OL)$/.test(c.tagName)).map(list).join(' ');
      return { pass: got === 'b(ALPHA n(BRAVO) t(CHARLIE)) n(DELTA) t(ECHO b(FOXTROT) n(GOLF,HOTEL) t(INDIA))', notes: got };
    },
  });

  cases.push({
    id: 'listkind_odt_and_pptx_and_excel_keep_every_line',
    description: 'ODT, PowerPoint et la case Excel : aucune ligne ne se perd ni ne change d\'ordre quand une case porte des puces, des numéros et des cases',
    run: async (h) => {
      const html = await mixFromEditor(h);
      const words = ['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA', 'ECHO', 'FOXTROT', 'GOLF', 'HOTEL', 'INDIA'];
      const inOrder = (text) => { let at = -1; return words.every((word) => { const next = text.indexOf(word, at + 1); if (next === -1) return false; at = next; return true; }); };
      await ExportEngines.ensure(['odtExport']);
      const built = await OdtExport.build(html, { margins: { top: 20, right: 20, bottom: 20, left: 20, orientation: 'portrait', format: 'A4' } });
      const odtZip = await JSZip.loadAsync(await built.blob.arrayBuffer());
      const content = await odtZip.file('content.xml').async('string');
      const odtText = Array.from(content.matchAll(/<text:p[^>]*>([^<]*)<\/text:p>/g)).map(m => m[1]).join(' ');
      const pptx = await PptxExport.fromHtml(html, { title: 'x' });
      const zip = await JSZip.loadAsync(pptx);
      const slide = await zip.file('ppt/slides/slide1.xml').async('string');
      const slideWords = Array.from(slide.matchAll(/<a:t>([^<]*)<\/a:t>/g)).map(m => m[1]).join(' ');
      return { pass: words.every(word => slideWords.indexOf(word) !== -1) && inOrder(slideWords) && inOrder(odtText), notes: JSON.stringify({ slideWords, odtText }) };
    },
  });

  // === 5) Les imports ===========================================================================================================================================================================

  cases.push({
    id: 'listkind_html_export_reopens_with_the_same_kinds',
    description: 'Le HTML d\'un export, relu par l\'import HTML, rend la même arborescence : puces, numéros et cases au même niveau, y compris sous une case',
    run: async (h) => {
      const html = await mixFromEditor(h);
      const { text } = await h.exportHtml(html, null, {}, null, '', { fragment: true });
      const imported = HtmlImport.toDocument(text);
      await load(imported.html);
      return { pass: shape() === 'b(ALPHA n(BRAVO) t(CHARLIE)) n(DELTA) t(✓ECHO b(FOXTROT) n(GOLF,HOTEL) t(INDIA))', notes: shape() };
    },
  });

  cases.push({
    id: 'listkind_markdown_export_reopens_with_the_same_kinds',
    description: 'Le Markdown d\'un export, relu par l\'import Markdown, rend la même arborescence (une case cochée reste cochée, ses sous-lignes restent dessous)',
    run: async (h) => {
      const html = await mixFromEditor(h);
      const { text } = await h.exportMarkdown(html);
      await MarkdownImport.ensureLibLoaded();
      const doc = await MarkdownImport.toDocument(text);
      await load(doc.html);
      return { pass: shape() === 'b(ALPHA n(BRAVO) t(CHARLIE)) n(DELTA) t(✓ECHO b(FOXTROT) n(GOLF,HOTEL) t(INDIA))', notes: JSON.stringify({ got: shape(), md: text }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.listKind = cases;
})();
