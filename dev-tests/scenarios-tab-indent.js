// Suite "tabIndent" - la touche Tab écrit une tabulation, Maj+Tab la retire (js/tab-indent.js, css/tab-indent.css ; demande d'Antoine du 14/10 : « petite correction dans l'éditeur et partout où
// on peut taper du texte, tab doit créer une indentation pour décaller le curseur et shift tab revenir »). Une vraie tabulation (U+0009), au cran de 12,7 mm, écrite comme un petit nœud en ligne `tabStop` pour que le HTML du
// modèle la garde jusqu'en fin de bloc (<span class="pp-tab" style="white-space: pre-wrap">) ; le même cran dans l'éditeur, la Lecture, l'impression par le navigateur, le PDF, le Word et le Markdown.
//  1) l'ÉDITEUR : la tabulation au curseur et la frappe qui suit, le gras, Maj+Tab (avant le curseur, en tête de ligne, après un saut de ligne, rien à retirer), une sélection (jamais remplacée),
//     ce que Tab faisait déjà et garde (liste, case de tableau, zone à deux colonnes, liste ouverte « # »), Échap puis Tab pour sortir, Annuler, le nœud rendu à toute tabulation arrivée brute,
//     le HTML relu, le bloc de code, le suivi des modifications, l'en-tête, les champs d'une ligne, le modèle email, la phrase lue par un lecteur d'écran ;
//  2) les RENDUS : le cran de 12,7 mm (48 px) dans le CSS de chaque endroit où le texte du modèle s'affiche, dans les zones et coutures d'en-tête et de pied, la Lecture et les feuilles de
//     l'impression par le navigateur ;
//  3) les EXPORTS, lus sur la sortie réelle : les positions PEINTES du PDF décodé par pdf.js (comparées à celles de l'éditeur), le XML du .docx dézippé (`w:tab`, `w:defaultTabStop`), le texte du .md.
// La vraie frappe (le focus qui reste dans l'éditeur, Échap puis Tab qui en sort) à 700x400 est dans dev-tests/verify-tab-indent-keyboard.mjs : un KeyboardEvent envoyé par dispatchEvent ne déplace
// jamais le focus du navigateur.
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const tiptap = () => document.querySelector('.tiptap');
  const editor = () => EditorCore.getEditor();
  const byId = id => document.getElementById(id);
  const near = (a, b, tolerance) => a != null && b != null && Math.abs(a - b) <= tolerance;
  const round = n => Math.round(n * 100) / 100;
  const TAB = '\t';
  // La tabulation telle que le modèle l'écrit.
  const SPAN = '<span class="pp-tab" style="white-space: pre-wrap">' + TAB + '</span>';
  const tabCount = html => (html.match(/class="pp-tab"/g) || []).length;

  // Une frappe telle que ProseMirror la reçoit ; vrai quand elle est consommée (le navigateur ne déplace alors pas le focus).
  function press(init) {
    const event = new KeyboardEvent('keydown', Object.assign({ bubbles: true, cancelable: true }, init));
    tiptap().dispatchEvent(event);
    return event.defaultPrevented;
  }
  const tab = () => press({ key: 'Tab' });
  const shiftTab = () => press({ key: 'Tab', shiftKey: true });
  async function load(html) {
    Editor.setHTML(html);
    await sleep(120);
  }
  async function caret(pos) {
    editor().chain().focus().setTextSelection(pos).run();
    await sleep(30);
  }
  async function select(from, to) {
    editor().chain().focus().setTextSelection({ from, to }).run();
    await sleep(30);
  }
  // La position, dans le document, du caractère `offset` du premier texte qui contient `needle` (le curseur se place à cette position : devant ce caractère).
  function posOf(needle, offset) {
    let found = null;
    editor().state.doc.descendants((node, pos) => {
      if (found !== null || !node.isText) return;
      const at = node.text.indexOf(needle);
      if (at !== -1) found = pos + at + (offset || 0);
    });
    if (found === null) throw new Error('texte introuvable dans l\'éditeur : ' + needle);
    return found;
  }
  // Le texte du document tel que l'éditeur le donne en texte brut (copier, chercher) : un « | » entre deux blocs, un saut de ligne pour Maj+Entrée, la tabulation pour son nœud.
  const textOf = () => editor().getText({ blockSeparator: '|' });
  // Le type et les marques du nœud ou du caractère à `pos` : « tabStop », « tabStop+bold »...
  function describeAt(pos) {
    const node = editor().state.doc.nodeAt(pos);
    if (!node) return null;
    return [node.isText ? 'text' : node.type.name].concat(node.marks.map(mark => mark.type.name).sort()).join('+');
  }
  const html = () => Editor.getHTML();
  // Un scénario à part : le suivi des modifications est global, il ne doit jamais fuir sur le suivant.
  async function trackChangesOff(h) {
    if (Editor.isTrackChangesOn()) await h.clickButton('v2-btn-track-changes');
  }

  cases.push({
    id: 'ti_tab_writes_one_tab_at_the_caret_and_the_caret_goes_after_it',
    description: 'Tab au curseur écrit une seule tabulation (<span class="pp-tab">), consomme la touche (le focus ne bouge pas) et pose le curseur derrière elle ; le texte qui suit reste intact',
    run: async (h) => {
      await h.resetEditor();
      await load('<p>Bonjour</p>');
      await caret(4);
      const taken = tab();
      const after = html();
      const pos = editor().state.selection.from;
      const pass = taken && textOf() === 'Bon' + TAB + 'jour' && tabCount(after) === 1 && describeAt(4) === 'tabStop' && pos === 5 && editor().state.selection.empty;
      return { pass, notes: JSON.stringify({ taken, after, pos }) };
    },
  });

  cases.push({
    id: 'ti_the_text_typed_after_a_tab_stays_outside_its_span',
    description: 'Le texte qu\'on tape après une tabulation n\'entre pas dans son <span class="pp-tab"> (le HTML garde un <span> par tabulation) ; un saut de paragraphe ne la reporte pas non plus',
    run: async (h) => {
      await h.resetEditor();
      await load('<p>Bonjour</p>');
      await caret(4);
      tab();
      editor().commands.insertContent('XY');
      const typed = html();
      editor().commands.splitBlock();
      editor().commands.insertContent('Z');
      const split = html();
      const pass = /<span class="pp-tab"[^>]*>\t<\/span>XYjour/.test(typed) && tabCount(typed) === 1 && !/pp-tab[^>]*>[^<]*Z/.test(split) && tabCount(split) === 1;
      return { pass, notes: JSON.stringify({ typed, split }) };
    },
  });

  cases.push({
    id: 'ti_the_tab_takes_the_bold_of_its_text_and_a_style_chosen_before_it_goes_on',
    description: 'Dans un texte en gras la tabulation est en gras aussi (une tabulation grasse n\'est pas plus large, mais elle ne coupe pas le gras en deux) ; un style choisi avant la tabulation (gras activé sans rien taper) suit le texte tapé ensuite',
    run: async (h) => {
      await h.resetEditor();
      await load('<p><strong>Gras</strong></p>');
      await caret(5);
      tab();
      const inBold = { tab: describeAt(5), html: html() };
      await load('<p>Bonjour</p>');
      await caret(4);
      editor().commands.setBold();
      tab();
      editor().commands.insertContent('X');
      const chosen = { tab: describeAt(4), typed: describeAt(5), html: html() };
      editor().commands.unsetBold();
      const pass = inBold.tab === 'tabStop+bold' && /<strong>Gras<span class="pp-tab"[^>]*>\t<\/span><\/strong>/.test(inBold.html)
        && chosen.tab === 'tabStop+bold' && chosen.typed === 'text+bold' && tabCount(chosen.html) === 1;
      return { pass, notes: JSON.stringify({ inBold, chosen }) };
    },
  });

  cases.push({
    id: 'ti_shift_tab_removes_the_tab_before_the_caret_else_the_one_that_opens_the_line',
    description: 'Maj+Tab retire la tabulation qui précède le curseur ; à défaut, celle qui ouvre la ligne, où que soit le curseur ; une tabulation du milieu du texte, derrière le curseur, reste',
    run: async (h) => {
      await h.resetEditor();
      await load('<p>Bon' + SPAN + 'jour</p>');
      await caret(5);
      const before = { taken: shiftTab(), text: textOf(), pos: editor().state.selection.from };
      await load('<p>' + SPAN + 'Bonjour</p>');
      await caret(4);
      const head = { taken: shiftTab(), text: textOf() };
      await load('<p>' + SPAN + 'Bon' + SPAN + 'jour</p>');
      await caret(3);
      const first = { taken: shiftTab(), text: textOf() };
      const pass = before.taken && before.text === 'Bonjour' && before.pos === 4 && head.taken && head.text === 'Bonjour' && first.taken && first.text === 'Bon' + TAB + 'jour';
      return { pass, notes: JSON.stringify({ before, head, first }) };
    },
  });

  cases.push({
    id: 'ti_shift_tab_works_on_the_line_after_a_soft_break_only',
    description: 'Après un saut de ligne forcé (Maj+Entrée), la ligne du curseur est celle qui compte : Maj+Tab retire la tabulation qui ouvre cette ligne, pas celle de la ligne du dessus',
    run: async (h) => {
      await h.resetEditor();
      await load('<p>' + SPAN + 'un<br>' + SPAN + 'deux</p>');
      await caret(posOf('deux', 2));
      const taken = shiftTab();
      const text = textOf();
      const pass = taken && text === TAB + 'un\ndeux';
      return { pass, notes: JSON.stringify({ taken, text }) };
    },
  });

  cases.push({
    id: 'ti_shift_tab_with_nothing_to_remove_is_taken_and_changes_nothing',
    description: 'Maj+Tab sur une ligne sans tabulation est consommé (le focus reste dans l\'éditeur) et ne change rien : ni le document, ni l\'historique',
    run: async (h) => {
      await h.resetEditor();
      await load('<p>Bonjour</p>');
      await caret(3);
      const docBefore = editor().state.doc;
      const taken = shiftTab();
      const unchanged = editor().state.doc.eq(docBefore) && editor().state.selection.from === 3;
      const undoable = editor().can().undo();
      return { pass: taken && unchanged && !undoable, notes: JSON.stringify({ taken, unchanged, undoable }) };
    },
  });

  cases.push({
    id: 'ti_a_selection_gets_a_tab_at_the_head_of_each_block_and_is_never_replaced',
    description: 'Sur du texte choisi, Tab ajoute une tabulation en tête de chaque bloc touché (jamais à la place du texte choisi) et Maj+Tab retire celle de tête : le HTML d\'avant revient exactement ; la sélection garde le même texte',
    run: async (h) => {
      await h.resetEditor();
      const original = '<p>Un</p><p>Deux</p><p>Trois</p>';
      await load(original);
      await select(2, 9);
      const chosenText = () => editor().state.doc.textBetween(editor().state.selection.from, editor().state.selection.to, '|');
      const startText = chosenText();
      const indented = { taken: tab(), html: html(), text: chosenText() };
      const outdented = { taken: shiftTab(), html: html(), text: chosenText() };
      await load('<p>Bonjour</p>');
      await select(3, 6); // « njo » : du texte choisi dans un seul bloc
      const word = { taken: tab(), text: textOf(), selected: chosenText() };
      const pass = indented.taken && tabCount(indented.html) === 2 && /^<p><span class="pp-tab"[^>]*>\t<\/span>Un<\/p><p><span class="pp-tab"[^>]*>\t<\/span>Deux<\/p><p>Trois<\/p>/.test(indented.html)
        && indented.text.replace(/\t/g, '') === startText && outdented.taken && outdented.html === original && outdented.text === startText
        && word.taken && word.text === TAB + 'Bonjour' && word.selected === 'njo';
      return { pass, notes: JSON.stringify({ startText, indented, outdented, word }) };
    },
  });


  // --- Ce que Tab faisait déjà garde la main ---
  cases.push({
    id: 'ti_a_bullet_list_keeps_tab_for_its_level',
    description: 'Dans une liste à puces, Tab change le niveau de l\'item (comme avant) et Maj+Tab le remonte : aucune tabulation n\'est écrite',
    run: async (h) => {
      await h.resetEditor();
      await load('<ul><li><p>A</p></li><li><p>B</p></li></ul>');
      await caret(posOf('B', 1));
      const sunk = { taken: tab(), html: html() };
      const lifted = { taken: shiftTab(), html: html() };
      const pass = sunk.taken && /<li><p>A<\/p><ul><li><p>B<\/p><\/li><\/ul><\/li>/.test(sunk.html) && lifted.taken && /<li><p>A<\/p><\/li><li><p>B<\/p><\/li>/.test(lifted.html) && !tabCount(sunk.html) && !tabCount(lifted.html);
      return { pass, notes: JSON.stringify({ sunk, lifted }) };
    },
  });

  cases.push({
    id: 'ti_a_table_cell_keeps_tab_for_the_next_cell',
    description: 'Dans une case de tableau, Tab passe à la case suivante et Maj+Tab à la précédente (comme dans Word) : aucune tabulation n\'est écrite, pour un curseur comme pour une sélection de cases',
    run: async (h) => {
      await h.resetEditor();
      await load('<table><tbody><tr><td><p>c1</p></td><td><p>c2</p></td></tr></tbody></table>');
      await caret(posOf('c1', 1));
      const parentText = () => editor().state.selection.$from.parent.textContent;
      const next = { taken: tab(), in: parentText() };
      const back = { taken: shiftTab(), in: parentText() };
      const out = html();
      const pass = next.taken && next.in === 'c2' && back.taken && back.in === 'c1' && !tabCount(out);
      return { pass, notes: JSON.stringify({ next, back, out }) };
    },
  });

  cases.push({
    id: 'ti_a_two_columns_zone_keeps_tab_for_the_other_column',
    description: 'Dans une zone à deux colonnes, Tab passe de la colonne de gauche à celle de droite puis sort de la zone, Maj+Tab fait le chemin inverse (comme avant) : aucune tabulation n\'est écrite',
    run: async (h) => {
      await h.resetEditor();
      await load('<div class="two-columns-zone" style="--layout-left: 50%"><div class="two-columns-column"><p>Gauche</p></div><div class="two-columns-column"><p>Droite</p></div></div><p>Apres</p>');
      await caret(posOf('Gauche', 2));
      const parentText = () => editor().state.selection.$from.parent.textContent;
      const steps = [];
      steps.push([tab(), parentText()]);
      steps.push([tab(), parentText()]);
      await caret(posOf('Droite', 2));
      steps.push([shiftTab(), parentText()]);
      const pass = steps.every(step => step[0]) && steps.map(step => step[1]).join() === 'Droite,Apres,Gauche' && !tabCount(html());
      return { pass, notes: JSON.stringify({ steps, out: html() }) };
    },
  });

  cases.push({
    id: 'ti_an_open_list_keeps_tab_to_choose',
    description: 'La liste ouverte par « # » (qui montre des lignes) garde Tab pour choisir la ligne en surbrillance, comme avant : la puce est posée et aucune tabulation n\'est écrite ; sans ligne à choisir, rien n\'est ouvert et Tab écrit',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.typeText('#');
      await sleep(100);
      const chips = Array.from(document.querySelectorAll('.ac-tab')).find(t => t.dataset.tab === 'chips');
      if (!chips) return { pass: false, notes: 'onglet des puces introuvable' };
      chips.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await sleep(60);
      const arrow = press({ key: 'ArrowDown' });
      const chosen = (document.querySelector('.ac-item.selected') || {}).textContent;
      const taken = tab();
      await sleep(100);
      const out = html();
      const pass = arrow && taken && chosen === 'Date du jour' && /data-chip-kind="date"/.test(out) && !tabCount(out) && out.indexOf('#') === -1;
      return { pass, notes: JSON.stringify({ arrow, chosen, taken, out }) };
    },
  });

  cases.push({
    id: 'ti_a_hash_typed_right_after_a_tab_opens_the_list_like_after_a_space',
    description: 'Un « # » tapé juste derrière une tabulation (« Nom : », tabulation, variable : la mise en page de toutes les lettres) ouvre la liste comme derrière une espace : la puce choisie prend sa place derrière la tabulation, qui reste, sans « # » en trop',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.typeText('Nom :');
      const first = tab();
      await h.typeText('#');
      await sleep(120);
      const chips = Array.from(document.querySelectorAll('.ac-tab')).find(t => t.dataset.tab === 'chips');
      if (!chips) return { pass: false, notes: 'la liste ne s\'est pas ouverte derrière la tabulation' };
      chips.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await sleep(60);
      press({ key: 'ArrowDown' });
      const taken = tab();
      await sleep(100);
      const out = html();
      const pass = first && taken && tabCount(out) === 1 && /^<p>Nom :<span class="pp-tab"[^>]*>\t<\/span><span[^>]*data-chip-kind="date"/.test(out) && out.indexOf('#') === -1;
      return { pass, notes: JSON.stringify({ first, taken, out }) };
    },
  });

  // --- Échap puis Tab : la sortie ---
  cases.push({
    id: 'ti_escape_then_tab_leaves_the_zone_and_writes_nothing',
    description: 'Échap (que personne ne prend) arme la sortie : le Tab qui suit, comme Maj+Tab, n\'est pas consommé (le navigateur déplace le focus) et n\'écrit rien ; toute autre touche ou un clic désarme, le Tab suivant écrit',
    run: async (h) => {
      await h.resetEditor();
      await load('<p>Bonjour</p>');
      await caret(3);
      const out = {};
      out.escape = press({ key: 'Escape' });
      out.tabLeaves = !tab();
      out.nothingWritten = html() === '<p>Bonjour</p>';
      out.afterwards = tab(); // la sortie est consommée : le Tab d'après écrit
      out.written = tabCount(html()) === 1;
      await load('<p>Bonjour</p>');
      await caret(3);
      press({ key: 'Escape' });
      out.shiftLeaves = !shiftTab();
      press({ key: 'Escape' });
      press({ key: 'a' });
      out.otherKeyDisarms = tab() && tabCount(html()) === 1;
      await load('<p>Bonjour</p>');
      await caret(3);
      press({ key: 'Escape' });
      tiptap().dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      out.clickDisarms = tab() && tabCount(html()) === 1;
      await load('<p>Bonjour</p>');
      await caret(3);
      press({ key: 'Escape' });
      press({ key: 'Shift' });
      out.modifierAloneKeepsIt = !tab();
      const pass = !out.escape && out.tabLeaves && out.nothingWritten && out.afterwards && out.written && out.shiftLeaves && out.otherKeyDisarms && out.clickDisarms && out.modifierAloneKeepsIt;
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'ti_an_escape_that_closes_the_open_list_does_not_arm_the_exit',
    description: 'L\'Échap qui ferme la liste ouverte par « # » n\'est pas celui de la sortie : le Tab qui suit écrit une tabulation',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.typeText('#');
      await sleep(100);
      const chips = Array.from(document.querySelectorAll('.ac-tab')).find(t => t.dataset.tab === 'chips');
      if (!chips) return { pass: false, notes: 'onglet des puces introuvable' };
      chips.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await sleep(60);
      const escape = press({ key: 'Escape' });
      const taken = tab();
      const out = html();
      return { pass: escape && taken && tabCount(out) === 1, notes: JSON.stringify({ escape, taken, out }) };
    },
  });

  // --- Annuler, tabulations arrivées sans marque, HTML relu ---
  cases.push({
    id: 'ti_one_undo_removes_the_tab',
    description: 'Un seul Annuler retire la tabulation écrite par Tab, Rétablir la remet ; Maj+Tab aussi s\'annule en un pas',
    run: async (h) => {
      await h.resetEditor();
      await load('<p>Bonjour</p>');
      await caret(4);
      tab();
      const written = html();
      editor().commands.undo();
      const undone = html();
      editor().commands.redo();
      const redone = html();
      shiftTab();
      const removed = html();
      editor().commands.undo();
      const restored = html();
      const pass = tabCount(written) === 1 && undone === '<p>Bonjour</p>' && redone === written && removed === '<p>Bonjour</p>' && restored === written;
      return { pass, notes: JSON.stringify({ written, undone, redone, removed, restored }) };
    },
  });

  cases.push({
    id: 'ti_a_raw_tab_that_arrives_in_the_text_becomes_a_tab_in_the_same_undo_step',
    description: 'Une tabulation qui arrive brute dans le texte (texte brut collé, texte inséré, abréviation développée) devient tout de suite une tabulation du modèle, dans le même pas d\'historique : le HTML l\'enregistre en <span class="pp-tab"> et un Annuler retire tout',
    run: async (h) => {
      await h.resetEditor();
      await load('<p>Bonjour</p>');
      await caret(3);
      editor().view.dispatch(editor().state.tr.insertText('a' + TAB + 'b'));
      const inserted = html();
      editor().commands.undo();
      const undone = html();
      await load('<p>Bonjour</p>');
      await caret(3);
      editor().commands.insertContent('c' + TAB + 'd');
      const content = html();
      await load('<p>Bonjour</p>');
      await caret(3);
      const pasted = typeof editor().view.pasteText === 'function';
      if (pasted) editor().view.pasteText('e' + TAB + 'f');
      await sleep(60);
      const pastedHtml = html();
      const pass = tabCount(inserted) === 1 && /a<span class="pp-tab"[^>]*>\t<\/span>b/.test(inserted) && undone === '<p>Bonjour</p>' && tabCount(content) === 1 && (!pasted || (tabCount(pastedHtml) === 1 && /e<span class="pp-tab"[^>]*>\t<\/span>f/.test(pastedHtml)));
      return { pass, notes: JSON.stringify({ inserted, undone, content, pasted, pastedHtml }) };
    },
  });

  cases.push({
    id: 'ti_the_html_keeps_the_tab_when_the_model_is_loaded_again',
    description: 'Le HTML d\'un modèle qui porte des tabulations les garde quand il est relu (ProseMirror écrase les blancs qu\'il lit, et efface ceux qui terminent un bloc : un nœud n\'en est pas un) : le texte, le nombre de tabulations et le HTML relu sont les mêmes, au début, au milieu, doublées, en fin de bloc, dans une liste et une citation',
    run: async (h) => {
      await h.resetEditor();
      const source = '<p>' + SPAN + 'Début</p><p>ab' + SPAN + 'cd' + SPAN + SPAN + 'ef</p><p><strong>gras' + SPAN + 'suite</strong>' + SPAN + '</p><ul><li><p>' + SPAN + 'item</p></li></ul><blockquote><p>' + SPAN + 'cité</p></blockquote>';
      await load(source);
      const first = html();
      const firstText = textOf();
      await load(first);
      const second = html();
      const pass = tabCount(first) === 8 && textOf() === firstText && firstText.split(TAB).length - 1 === 8 && second === first && !/\t/.test(first.replace(/<span class="pp-tab"[^>]*>\t<\/span>/g, ''))
        && /<strong>gras<span class="pp-tab"[^>]*>\t<\/span>suite<\/strong><span class="pp-tab"[^>]*>\t<\/span><\/p>/.test(first);
      return { pass, notes: JSON.stringify({ first, second, firstText }) };
    },
  });

  cases.push({
    id: 'ti_a_code_block_keeps_a_bare_tab',
    description: 'Dans un bloc de code (aucune marque admise) Tab écrit une tabulation nue, et le HTML la garde dans le <code>',
    run: async (h) => {
      await h.resetEditor();
      await load('<pre><code>abc</code></pre>');
      await caret(3);
      const taken = tab();
      const out = html();
      return { pass: taken && /<pre><code>ab\tc<\/code><\/pre>/.test(out) && !tabCount(out), notes: JSON.stringify({ taken, out }) };
    },
  });

  // --- Le bloc de code : « Bloc de code » garde les tabulations d'un paragraphe et les rend en revenant au paragraphe ---
  cases.push({
    id: 'ti_the_code_block_row_stays_active_and_keeps_the_tab_of_a_paragraph',
    description: 'Un paragraphe qui porte une tabulation n\'éteint pas la ligne « Bloc de code » (elle ne se grise que pour ce qu\'un bloc de code effacerait : une variable, une image) et sa tabulation n\'est pas effacée en silence : le bloc de code garde une tabulation nue, et le paragraphe retrouve son nœud-tabulation quand on revient au paragraphe',
    run: async (h) => {
      await h.resetEditor();
      await load('<p>Un' + SPAN + 'deux</p>');
      await caret(2);
      await sleep(150);
      const lockedBefore = byId('v2-btn-code-block').classList.contains('v2-hf-locked');
      await h.clickButton('v2-btn-code-block');
      await sleep(80);
      const asCode = html();
      await h.clickButton('v2-btn-code-block');
      await sleep(80);
      const back = html();
      const pass = !lockedBefore && /^<pre><code>Un\tdeux<\/code><\/pre>(<p><\/p>)?$/.test(asCode) && /^<p>Un<span class="pp-tab"[^>]*>\t<\/span>deux<\/p>(<p><\/p>)?$/.test(back);
      return { pass, notes: JSON.stringify({ lockedBefore, asCode, back }) };
    },
  });

  cases.push({
    id: 'ti_several_paragraphs_with_tabs_become_one_code_block_that_keeps_every_tab',
    description: 'Plusieurs paragraphes choisis, tabulations comprises, deviennent un seul bloc de code, une ligne par paragraphe, chaque tabulation restant une tabulation (et non un saut de ligne) ; le paragraphe d\'après n\'est pas touché',
    run: async (h) => {
      await h.resetEditor();
      await load('<p>' + SPAN + 'a</p><p>' + SPAN + SPAN + 'b</p><p>c</p>');
      await select(3, 8);
      await sleep(150);
      const lockedBefore = byId('v2-btn-code-block').classList.contains('v2-hf-locked');
      await h.clickButton('v2-btn-code-block');
      await sleep(80);
      const out = html();
      const pass = !lockedBefore && /^<pre><code>\ta\n\t\tb<\/code><\/pre><p>c<\/p>$/.test(out);
      return { pass, notes: JSON.stringify({ lockedBefore, out }) };
    },
  });

  cases.push({
    id: 'ti_the_native_code_block_command_keeps_the_tab_too',
    description: 'Le raccourci de TipTap (Ctrl+Alt+C), qui n\'appelle pas le bouton mais la commande `toggleCodeBlock`, garde aussi la tabulation du paragraphe',
    run: async (h) => {
      await h.resetEditor();
      await load('<p>Un' + SPAN + 'deux</p><p>Trois</p>');
      await caret(2);
      editor().commands.toggleCodeBlock();
      const asCode = html();
      const pass = /^<pre><code>Un\tdeux<\/code><\/pre><p>Trois<\/p>$/.test(asCode);
      return { pass, notes: JSON.stringify({ asCode }) };
    },
  });

  cases.push({
    id: 'ti_a_code_block_changed_back_to_paragraphs_reads_the_whole_block_for_bare_tabs',
    description: 'Un bloc de code qui redevient paragraphe (ou titre) donne ses tabulations nues, au milieu du texte comme en fin de ligne, en nœuds-tabulation : changer le type d\'un bloc n\'en touche que les bords, le plugin relit tout le bloc',
    run: async (h) => {
      await h.resetEditor();
      await load('<pre><code>a\tb\t</code></pre>');
      await caret(2);
      editor().commands.setNode('paragraph');
      const asParagraph = html();
      await load('<pre><code>\tc</code></pre>');
      await caret(2);
      editor().commands.setNode('heading', { level: 2 });
      const asHeading = html();
      const pass = tabCount(asParagraph) === 2 && /^<p>a<span class="pp-tab"[^>]*>\t<\/span>b<span class="pp-tab"[^>]*>\t<\/span><\/p>(<p><\/p>)?$/.test(asParagraph)
        && /^<h2[^>]*><span class="pp-tab"[^>]*>\t<\/span>c<\/h2>(<p><\/p>)?$/.test(asHeading);
      return { pass, notes: JSON.stringify({ asParagraph, asHeading }) };
    },
  });

  // --- Le suivi des modifications, l'en-tête, les champs d'une ligne, le modèle email ---
  cases.push({
    id: 'ti_track_changes_records_the_tab_as_a_suggestion_and_takes_back_its_own',
    description: 'Avec le suivi des modifications, Tab écrit une tabulation proposée (<ins>) et Maj+Tab sur sa propre proposition l\'efface sans trace ; sur une tabulation déjà acceptée, Maj+Tab la propose en suppression (<del>)',
    run: async (h) => {
      await h.resetEditor();
      try {
        await load('<p>Bonjour</p>');
        if (!Editor.isTrackChangesOn()) await h.clickButton('v2-btn-track-changes');
        await caret(4);
        const written = { taken: tab(), html: html() };
        const taken = { taken: shiftTab(), html: html() };
        await h.clickButton('v2-btn-track-changes');
        await load('<p>Bon' + SPAN + 'jour</p>');
        await h.clickButton('v2-btn-track-changes');
        await caret(5);
        const removed = { taken: shiftTab(), html: html() };
        const pass = written.taken && /<ins[^>]*><span class="pp-tab"[^>]*>\t<\/span><\/ins>/.test(written.html) && taken.taken && taken.html === '<p>Bonjour</p>'
          && removed.taken && /<del[^>]*><span class="pp-tab"[^>]*>\t<\/span><\/del>/.test(removed.html);
        return { pass, notes: JSON.stringify({ written, taken, removed }) };
      } finally {
        await trackChangesOff(h);
      }
    },
  });

  cases.push({
    id: 'ti_the_header_zone_takes_tabs_and_the_data_keep_them',
    description: 'En modifiant l\'en-tête (le même éditeur), Tab écrit une tabulation et les données de l\'en-tête, relues après « Terminer », la gardent à sa place',
    run: async (h) => {
      await h.resetEditor();
      h.setA4Preview(true);
      Editor.setHeaderFooterData({ enabled: true, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } });
      await sleep(80);
      const zone = document.querySelector('#editor-container .v2-page-edge-header, #editor-container .v2-hf-zone');
      if (!zone) return { pass: false, notes: 'aucune zone de marge trouvée dans le DOM' };
      zone.click();
      await sleep(120);
      const editing = Editor.isEditingHeaderFooter();
      await h.focusAtEnd();
      await h.typeText('Titre');
      const taken = tab();
      await h.typeText('suite');
      byId('v2-hf-btn-done').click();
      await sleep(120);
      const header = Editor.getHeaderFooterData().header.default;
      const pass = editing && taken && /^<p>Titre<span class="pp-tab"[^>]*>\t<\/span>suite<\/p>$/.test(header);
      return { pass, notes: JSON.stringify({ editing, taken, header }) };
    },
  });

  cases.push({
    id: 'ti_single_line_fields_keep_tab_for_the_next_field',
    description: 'Les champs d\'une ligne (l\'objet du mail, le nom du fichier PDF) gardent Tab pour passer au champ suivant : la touche n\'est pas consommée et rien n\'est écrit',
    run: async (h) => {
      const out = {};
      for (const id of ['v2-email-subject', 'pdf-filename-template']) {
        await h.fieldType(id, 'Objet');
        out[id] = { taken: h.fieldKey(id, 'Tab'), shift: h.fieldKey(id, 'Tab', { shiftKey: true }), text: h.fieldEditor(id).state.doc.textContent };
      }
      const pass = Object.values(out).every(field => !field.taken && !field.shift && field.text === 'Objet');
      return { pass, notes: JSON.stringify(out) };
    },
  });

  async function newEmail(h) { h.openFlyout('#v2-new-template-group'); await h.clickButton('v2-btn-new-email'); await sleep(300); }
  async function newDocument(h) { h.openFlyout('#v2-new-template-group'); await h.clickButton('v2-btn-new-document'); await sleep(300); }

  cases.push({
    id: 'ti_a_new_email_keeps_the_tab_in_the_text_of_its_link',
    description: 'Dans un modèle email, Tab écrit une tabulation (le texte brut du lien mailto: la garde, au début d\'une ligne comme au milieu) ; Maj+Tab la retire',
    run: async (h) => {
      await h.resetEditor();
      try {
        await newEmail(h);
        await load('<p>Bonjour</p><p>Merci</p>');
        await caret(4);
        const taken = tab();
        await caret(posOf('Merci', 0));
        const second = tab();
        const text = MailtoExport.plainTextFromHtml(html());
        await caret(posOf('Merci', 0) + 1);
        const back = shiftTab();
        const after = MailtoExport.plainTextFromHtml(html());
        const pass = taken && second && text === 'Bon' + TAB + 'jour\n' + TAB + 'Merci' && back && after === 'Bon' + TAB + 'jour\nMerci';
        return { pass, notes: JSON.stringify({ taken, second, text, back, after }) };
      } finally {
        await newDocument(h);
        await h.resetEditor();
      }
    },
  });

  // --- La phrase lue par un lecteur d'écran : la sortie au clavier s'annonce ---
  const hintCase = {
    id: 'ti_the_editor_announces_how_to_leave_it_with_the_keyboard',
    description: 'La zone d\'écriture du document dit, dans la langue de la page, que Tab écrit une tabulation et que la sortie au clavier est Échap puis Tab (aria-description) ; la phrase reste dans l\'en-tête et le pied',
    run: async (h) => {
      await h.resetEditor();
      const read = () => { const node = document.querySelector('#editor-container .ProseMirror'); return node ? node.getAttribute('aria-description') : null; };
      const fr = I18n.getLang() !== 'en';
      const want = fr ? /Tab.*tabulation.*Échap.*Tab/ : /Tab.*tab.*Escape.*Tab/;
      const page = read();
      h.setA4Preview(true);
      HeaderFooterPreview.enterHeaderFooterMode('header', 'default');
      await sleep(250);
      const header = read();
      HeaderFooterPreview.exitHeaderFooterModeIfActive();
      await sleep(250);
      const pass = !!page && want.test(page) && page === I18n.t('editor.ariaTabHint') && header === page;
      return { pass, notes: JSON.stringify({ lang: I18n.getLang(), page, header }) };
    },
  };
  cases.push(hintCase, Object.assign({}, hintCase, {
    id: 'ti_the_editor_announces_how_to_leave_it_in_english_in_an_english_page',
    lang: 'en',
    description: 'Page qui démarre en anglais : la zone d\'écriture annonce « Tab writes a tab, Shift+Tab removes it. To leave the field with the keyboard: Escape, then Tab. »',
  }));

  // --- Les rendus : le même cran de 12,7 mm (48 px) partout où le texte du modèle s'affiche ---
  // Le cran, écrit ici en dur : c'est la demande (le demi-pouce des tabulations par défaut de Word), que le CSS, le PDF et le Word doivent tous tenir.
  const STOP_MM = 12.7;
  const STOP_PT = 36;
  const STOP_TWIPS = 720;
  const STOP_PX = STOP_MM * 96 / 25.4;
  // Un hôte de mesure à part, sans toucher à l'éditeur : un <div> hors de la page porte la même classe que le contexte étudié (l'éditeur, la Lecture, une bande d'en-tête...), donc les
  // mêmes règles CSS - comme l'hôte de mesure du PDF, qui porte la classe .tiptap.
  const hosts = [];
  function measureHost(markup, className) {
    const host = document.createElement('div');
    host.className = className;
    host.style.cssText = 'position: absolute; left: 0; top: 0; width: 600px; visibility: hidden; font-size: 14px;';
    host.innerHTML = markup;
    document.body.appendChild(host);
    hosts.push(host);
    return host;
  }
  const clearHosts = () => { while (hosts.length) hosts.pop().remove(); };
  // La place, en px depuis le bord gauche de la boîte de son paragraphe, de la première lettre du premier texte de `scope` qui contient `word` (null si introuvable).
  function stopOf(scope, word) {
    if (!scope) return null;
    const doc = scope.ownerDocument;
    const walker = doc.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.nodeValue.indexOf(word);
      if (at < 0) continue;
      const block = node.parentElement.closest('p');
      const style = doc.defaultView.getComputedStyle(block);
      const range = doc.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + 1);
      const left = block.getBoundingClientRect().left + parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth);
      return round(range.getBoundingClientRect().left - left);
    }
    return null;
  }
  // Une tabulation en tête de ligne, une après un mot court et deux de suite : les mots posés aux crans de 48 et 96 px.
  const STOPS_HTML = '<p>' + SPAN + 'AAAA</p><p>ab' + SPAN + 'BBBB</p><p>' + SPAN + SPAN + 'CCCC</p>';
  const stopsIn = scope => ({ a: stopOf(scope, 'AAAA'), b: stopOf(scope, 'BBBB'), c: stopOf(scope, 'CCCC') });
  const goodStops = found => !!found && near(found.a, STOP_PX, 0.6) && near(found.b, STOP_PX, 0.6) && near(found.c, 2 * STOP_PX, 0.6);

  cases.push({
    id: 'ti_css_sets_the_tab_stop_wherever_the_model_text_is_shown',
    description: 'Le cran de 12,7 mm (48 px) est le même dans l\'éditeur (et l\'hôte de mesure du PDF), la Lecture, les zones et les bandes d\'en-tête et de pied et les espaceurs de la Lecture : une tabulation en tête de ligne et une après un mot court tombent à 48 px, deux de suite à 96 px',
    run: async (h) => {
      await h.resetEditor();
      const contexts = ['tiptap', 'reader-content', 'v2-hf-zone-body', 'v2-page-band-header', 'v2-page-band-footer', 'v2-page-edge-spacer'];
      const found = {};
      contexts.forEach(className => { found[className] = stopsIn(measureHost(STOPS_HTML, className)); });
      clearHosts();
      const bad = contexts.filter(className => !goodStops(found[className]));
      return { pass: !bad.length, notes: JSON.stringify({ stopPx: STOP_PX, bad, found }) };
    },
  });

  const HF_DATA = () => ({ enabled: true, differentFirstPage: false, header: { default: '<p>' + SPAN + 'AAAA</p><p>ab' + SPAN + 'BBBB</p><p>' + SPAN + SPAN + 'CCCC</p>', first: '' }, footer: { default: '<p>' + SPAN + 'AAAA</p><p>ab' + SPAN + 'BBBB</p><p>' + SPAN + SPAN + 'CCCC</p>', first: '' } });
  const BODY = '<p>Un</p><div class="page-break-marker">Saut de page</div>' + STOPS_HTML;

  cases.push({
    id: 'ti_header_and_footer_zones_and_seams_of_the_editor_use_the_same_stop',
    description: 'Les tabulations d\'un en-tête ou d\'un pied de page tombent aux mêmes crans que celles du corps, dans les zones du haut et du bas de la feuille de l\'éditeur, dans leurs bandes de couture et dans le corps',
    run: async (h) => {
      await h.resetEditor();
      h.setA4Preview(true);
      PageLayout.setMarginsMm(null);
      Editor.setHeaderFooterData(HF_DATA());
      Editor.setHTML(BODY);
      Editor.refreshLayout();
      await sleep(300);
      const root = byId('editor-container');
      const places = { body: '.tiptap', top: '.v2-page-edge-top .v2-hf-zone-body', bottom: '.v2-page-edge-bottom .v2-hf-zone-body', seamHeader: '.v2-page-band-header', seamFooter: '.v2-page-band-footer' };
      const found = {};
      Object.entries(places).forEach(([name, selector]) => { found[name] = stopsIn(root.querySelector(selector)); });
      const bad = Object.keys(found).filter(name => !goodStops(found[name]));
      return { pass: !bad.length, notes: JSON.stringify({ bad, found }) };
    },
  });

  cases.push({
    id: 'ti_reading_and_browser_print_sheets_use_the_same_stop_in_the_body_and_the_edges',
    description: 'La Lecture (corps, bandes du haut et du bas, coutures) et les feuilles de l\'impression par le navigateur (PrintExport : la Lecture rendue dans un cadre caché) posent les tabulations aux mêmes crans de 12,7 mm que l\'éditeur ; le HTML relu y garde chaque <span class="pp-tab">',
    run: async (h) => {
      await h.resetEditor();
      h.setA4Preview(true); // la Lecture ne pose ses bandes que sous a4-preview
      PageLayout.setMarginsMm(null);
      let out;
      let job = null;
      try {
        const reader = await h.renderReaderMode(BODY, HF_DATA());
        await sleep(300);
        const container = byId('reader-container');
        const places = { body: '.reader-content', top: '.v2-page-edge-top', bottom: '.v2-page-edge-bottom', seamHeader: '.v2-page-band-header', seamFooter: '.v2-page-band-footer' };
        const found = {};
        Object.entries(places).forEach(([name, selector]) => { found['reader ' + name] = stopsIn(container.querySelector(selector)); });
        const tabs = reader.querySelectorAll('.reader-content .pp-tab').length;
        job = await PrintExport.prepare(BODY, null, { id: 1 }, HF_DATA(), 'essai');
        const sheet = job.frame.contentDocument.querySelector('.pp-print-sheet');
        const printed = { body: '.reader-content', top: '.v2-page-edge-top', bottom: '.v2-page-edge-bottom' };
        Object.entries(printed).forEach(([name, selector]) => { found['print ' + name] = stopsIn(sheet.querySelector(selector)); });
        out = { found, tabs };
      } finally {
        if (job) job.dispose();
        // renderReaderMode montre les deux conteneurs à la fois (jamais le cas en usage réel) : retour au Mode édition pour les scénarios suivants.
        byId('reader-container').style.display = '';
        byId('editor-container').style.display = '';
        byId('btn-mode-edit').click();
        await sleep(60);
      }
      const bad = Object.keys(out.found).filter(name => !goodStops(out.found[name]));
      return { pass: !bad.length && out.tabs === 4, notes: JSON.stringify({ bad, tabs: out.tabs, found: out.found }) };
    },
  });

  cases.push({
    id: 'ti_the_editor_draws_what_the_tab_key_wrote_on_the_same_stops',
    description: 'Dans l\'éditeur, ce que la touche Tab vient d\'écrire se pose aux crans : une tabulation écrite en tête de ligne, après un mot et doublée place le texte qui suit à 48 px, 48 px et 96 px',
    run: async (h) => {
      await h.resetEditor();
      await load('<p>AAAA</p><p>ab</p><p>CCCC</p>');
      await caret(1);
      tab();
      await caret(posOf('ab', 2));
      tab();
      await caret(posOf('CCCC', 0));
      tab();
      tab();
      await sleep(60);
      const root = tiptap();
      const found = { a: stopOf(root, 'AAAA'), c: stopOf(root, 'CCCC') };
      // « ab » suivi de la tabulation, puis de rien : la tabulation de fin tombe au cran suivant le mot.
      const tabs = Array.from(root.querySelectorAll('.pp-tab'));
      const second = tabs[1].getBoundingClientRect();
      const block = tabs[1].closest('p').getBoundingClientRect();
      const reaches = round(second.right - block.left - parseFloat(getComputedStyle(tabs[1].closest('p')).paddingLeft));
      const pass = near(found.a, STOP_PX, 0.6) && near(found.c, 2 * STOP_PX, 0.6) && tabs.length === 4 && near(reaches, STOP_PX, 0.6);
      return { pass, notes: JSON.stringify({ found, tabs: tabs.length, reaches }) };
    },
  });

  // --- Le PDF : les positions PEINTES, lues dans le fichier décodé par pdf.js, comparées à celles de l'éditeur ---
  const LONG = ' texte assez long pour passer sur plusieurs lignes dans la page et voir comment la tabulation se comporte.'.repeat(3);
  // Des mots de repère en capitales (4 lettres au moins) : leur place dans l'éditeur (en pt depuis le bord gauche de la feuille) et dans le PDF.
  const PDF_CASES = [
    { name: 'tête de ligne', html: '<p>' + SPAN + 'ALPHA fin</p>', tolerance: 0.3 },
    { name: 'au milieu et doublée', html: '<p>aa' + SPAN + 'BRAVO' + SPAN + 'CHARLIE fin</p><p>' + SPAN + SPAN + 'DELTA fin</p>', tolerance: 0.3 },
    { name: 'après un saut de ligne', html: '<p>ligne un<br>' + SPAN + 'ECHO fin</p>', tolerance: 0.3 },
    { name: 'titre', html: '<h2>' + SPAN + 'LIMA titre</h2>', tolerance: 0.3 },
    { name: 'citation', html: '<blockquote><p>' + SPAN + 'MIKE cité</p></blockquote>', tolerance: 0.3 },
    { name: 'puce', html: '<ul><li><p>' + SPAN + 'NOVEMBER item</p></li></ul>', tolerance: 0.3 },
    { name: 'gras', html: '<p><strong>gras' + SPAN + 'OSCAR</strong> fin</p>', tolerance: 0.3 },
    { name: 'grosse taille', html: '<p><span style="font-size: 20px">gros' + SPAN + 'PAPA</span> fin</p>', tolerance: 0.3 },
    { name: 'souligné', html: '<p><u>sou' + SPAN + 'QUEBEC</u> fin</p>', tolerance: 0.3 },
    { name: 'tabulation de fin et ligne vide', html: '<p>ROMEO fin' + SPAN + '</p><p>' + SPAN + '</p><p>SIERRA suite</p>', tolerance: 0.3 },
    { name: 'texte long, indenté seulement à la première ligne', html: '<p>' + SPAN + 'JULIET' + LONG + SPAN + 'KILO' + LONG + '</p>', tolerance: 0.3 },
    // Le centré et l'aligné à droite portent déjà, sans tabulation, un écart de 1 à 2 pt entre l'éditeur et pdfmake ; le justifié étire les blancs d'une ligne.
    { name: 'centré', html: '<p style="text-align:center">' + SPAN + 'FOXTROT fin</p>', tolerance: 2.5 },
    { name: 'à droite', html: '<p style="text-align:right">ab' + SPAN + 'GOLF fin</p>', tolerance: 2.5 },
    { name: 'justifié', html: '<p style="text-align:justify">' + SPAN + 'HOTEL' + LONG + SPAN + 'INDIA' + LONG + '</p>', tolerance: 2.5 },
  ];

  // Pour chaque mot de repère du HTML : sa place peinte dans l'éditeur (pt) et dans le PDF (pt), et leur écart.
  async function pdfAgainstEditor(h, markup) {
    await h.resetEditor();
    h.setA4Preview(true);
    Editor.setHTML(markup);
    await sleep(150);
    const root = tiptap();
    const rootRect = root.getBoundingClientRect();
    const targets = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const pattern = /[A-Z]{4,}/g;
      for (let found = pattern.exec(node.nodeValue); found; found = pattern.exec(node.nodeValue)) {
        const range = document.createRange();
        range.setStart(node, found.index);
        range.setEnd(node, found.index + found[0].length);
        targets.push({ word: found[0], editorPt: round((range.getBoundingClientRect().left - rootRect.left) * 0.75) });
      }
    }
    const result = await h.exportPdfContent(Editor.getHTML());
    const truth = await h.extractPdfGroundTruth(result.base64);
    const items = truth.pages[0].textItems;
    return { items, words: targets.map(target => { const item = items.find(it => it.str.startsWith(target.word)); return Object.assign(target, { pdfPt: item ? round(item.x) : null, y: item ? round(item.y) : null }); }) };
  }

  cases.push({
    id: 'ti_pdf_paints_each_tab_where_the_editor_puts_it',
    description: 'Vérité terrain : dans le PDF décodé par pdf.js, le mot qui suit une tabulation est peint à la place où l\'éditeur le met (à 0,3 pt près, 2,5 pt pour le centré, l\'aligné à droite et le justifié) : en tête de ligne, au milieu, doublée, après un saut de ligne, dans un titre, une citation, une puce, en gras, en grosse taille, soulignée, en fin de ligne ; pdfmake seul en aurait fait quatre espaces',
    run: async (h) => {
      const bad = [];
      const rows = [];
      for (const one of PDF_CASES) {
        const { words } = await pdfAgainstEditor(h, one.html);
        const diffs = words.map(word => (word.pdfPt == null ? null : round(word.pdfPt - word.editorPt)));
        rows.push(one.name + ' : ' + words.map((word, i) => word.word + ' ' + word.editorPt + '/' + word.pdfPt + ' (' + diffs[i] + ')').join(' ; '));
        if (!words.length || words.some((word, i) => diffs[i] == null || Math.abs(diffs[i]) > one.tolerance)) bad.push(one.name);
      }
      return { pass: !bad.length, notes: bad.length ? 'écarts : ' + bad.join(' | ') + ' -- ' + rows.join(' || ') : rows.length + ' cas ; ' + rows.join(' || ') };
    },
  });

  cases.push({
    id: 'ti_pdf_a_tab_is_a_stop_not_four_spaces',
    description: 'Dans le PDF, une tabulation en tête de ligne décale le texte d\'un cran entier de 12,7 mm (36 pt), deux d\'un double cran, une tabulation après un mot le pose au cran suivant : jamais les quatre espaces que pdfmake écrit pour une tabulation',
    run: async (h) => {
      await h.resetEditor();
      const result = await h.exportPdfContent('<p>PLAIN fin</p><p>' + SPAN + 'ONE fin</p><p>' + SPAN + SPAN + 'TWO fin</p><p>ab' + SPAN + 'MID fin</p>');
      const truth = await h.extractPdfGroundTruth(result.base64);
      const x = word => { const item = truth.pages[0].textItems.find(it => it.str.startsWith(word)); return item ? item.x : null; };
      const plain = x('PLAIN');
      const found = { one: x('ONE') - plain, two: x('TWO') - plain, mid: x('MID') - plain };
      const pass = near(found.one, STOP_PT, 0.3) && near(found.two, 2 * STOP_PT, 0.3) && near(found.mid, STOP_PT, 0.3);
      return { pass, notes: JSON.stringify({ stopPt: STOP_PT, found }) };
    },
  });

  cases.push({
    id: 'ti_pdf_a_paragraph_starting_with_a_tab_is_indented_on_its_first_line_only',
    description: 'Dans le PDF, un long paragraphe qui commence par une tabulation n\'est décalé que sur sa première ligne (un retrait de première ligne, comme dans l\'éditeur) : les lignes suivantes reprennent la marge',
    run: async (h) => {
      const { items } = await pdfAgainstEditor(h, '<p>' + SPAN + 'JULIET' + LONG + '</p>');
      const lines = [];
      items.forEach(item => {
        let line = lines.find(l => Math.abs(l.y - item.y) < 1);
        if (!line) { line = { y: item.y, x: item.x }; lines.push(line); }
        line.x = Math.min(line.x, item.x);
      });
      lines.sort((a, b) => a.y - b.y);
      const pass = lines.length >= 3 && near(lines[0].x, 28 + STOP_PT, 0.3) && lines.slice(1).every(line => near(line.x, 28, 0.3));
      return { pass, notes: JSON.stringify(lines) };
    },
  });

  cases.push({
    id: 'ti_pdf_a_tab_at_the_end_of_a_line_does_not_push_the_text_to_another_line',
    description: 'Dans le PDF, une tabulation qui termine un paragraphe, ou qui est seule sur une ligne, ne fait pas passer le texte à la ligne ni n\'en ajoute : les paragraphes se suivent comme dans l\'éditeur',
    run: async (h) => {
      const withTabs = '<p>ROMEO fin' + SPAN + '</p><p>' + SPAN + '</p><p>SIERRA suite</p>';
      const without = '<p>ROMEO fin</p><p></p><p>SIERRA suite</p>';
      const a = await h.extractPdfGroundTruth((await h.exportPdfContent(withTabs)).base64);
      const b = await h.extractPdfGroundTruth((await h.exportPdfContent(without)).base64);
      const ys = truth => truth.pages[0].textItems.map(it => round(it.y));
      const pass = JSON.stringify(ys(a)) === JSON.stringify(ys(b)) && a.pages.length === 1 && a.pages[0].textItems.length === b.pages[0].textItems.length;
      return { pass, notes: JSON.stringify({ withTabs: ys(a), without: ys(b), pages: a.pages.length }) };
    },
  });

  cases.push({
    id: 'ti_pdf_a_tab_ending_a_centered_or_right_line_shifts_it_like_the_editor',
    description: 'Dans le PDF, une tabulation qui termine une ligne centrée ou alignée à droite la décale comme dans l\'éditeur (et dans Word : le blanc compte dans la ligne) ; dans un texte aligné à gauche elle ne se voit pas, ni dans l\'éditeur ni dans le PDF',
    run: async (h) => {
      const plain = await pdfAgainstEditor(h, '<p style="text-align:center">FOXTROT fin</p><p style="text-align:right">GOLFES fin</p><p>HOTELS fin</p>');
      const tabbed = await pdfAgainstEditor(h, '<p style="text-align:center">FOXTROT fin' + SPAN + '</p><p style="text-align:right">GOLFES fin' + SPAN + '</p><p>HOTELS fin' + SPAN + '</p>');
      const shifts = plain.words.map((word, i) => ({
        word: word.word, editor: round(word.editorPt - tabbed.words[i].editorPt), pdf: round(word.pdfPt - tabbed.words[i].pdfPt),
      }));
      const [centered, right, left] = shifts;
      const pass = shifts.length === 3 && centered.editor > 4 && near(centered.pdf, centered.editor, 1.5) && right.editor > 10 && near(right.pdf, right.editor, 1.5) && near(left.editor, 0, 0.05) && near(left.pdf, 0, 0.05);
      return { pass, notes: JSON.stringify(shifts) };
    },
  });

  // --- Word et Markdown : lus dans le fichier produit ---
  const EXPORT_HTML = '<p>' + SPAN + 'Début</p><p>ab' + SPAN + 'cd' + SPAN + SPAN + 'ef</p><p><strong>gras' + SPAN + 'suite</strong>' + SPAN + '</p><ul><li><p>' + SPAN + 'item</p></li></ul>'
    + '<blockquote><p>' + SPAN + 'cité</p></blockquote><h2>' + SPAN + 'Titre</h2>';

  cases.push({
    id: 'ti_docx_has_real_word_tabs_and_the_default_tab_stop_of_half_an_inch',
    description: 'Word : chaque tabulation est une vraie tabulation du fichier (`w:tab`, à sa place entre les deux textes, en tête, doublée, en fin de ligne, dans une puce, une citation et un titre), jamais une U+0009 écrite dans `w:t` (Word la lit comme une espace) ; le cran par défaut du document est de 720 twips (12,7 mm) comme celui du navigateur',
    run: async (h) => {
      await h.resetEditor();
      const parts = await h.exportDocxParts(EXPORT_HTML);
      const tokens = Array.from(parts.doc.getElementsByTagName('w:p')).map(paragraph => Array.from(paragraph.getElementsByTagName('w:r'))
        .map(run => (run.getElementsByTagName('w:tab').length ? 'TAB' : (run.getElementsByTagName('w:t')[0] || { textContent: '' }).textContent)).join('|'));
      const xml = parts.parts['word/document.xml'];
      const settings = parts.parts['word/settings.xml'] || '';
      const stop = (settings.match(/<w:defaultTabStop[^>]*w:val="(\d+)"/) || [])[1];
      const wanted = ['TAB|Début', 'ab|TAB|cd|TAB|TAB|ef', 'gras|TAB|suite|TAB', 'TAB|item', 'TAB|cité', 'TAB|Titre'];
      const pass = JSON.stringify(tokens) === JSON.stringify(wanted) && (xml.match(/<w:tab\/>/g) || []).length === 9 && !/<w:t[^>]*>[^<]*\t[^<]*<\/w:t>/.test(xml) && Number(stop) === STOP_TWIPS;
      return { pass, notes: JSON.stringify({ tokens, tabs: (xml.match(/<w:tab\/>/g) || []).length, stop }) };
    },
  });

  cases.push({
    id: 'ti_markdown_writes_each_tab_as_an_em_space_entity',
    description: 'Markdown : chaque tabulation s\'écrit en entité du cadratin (`&emsp;`), jamais en caractère de tabulation (une tabulation ou quatre espaces en tête d\'un paragraphe ouvriraient un bloc de code) : en tête, au milieu, doublée, dans le gras, une puce, une citation et un titre',
    run: async (h) => {
      await h.resetEditor();
      const { text } = await h.exportMarkdown(EXPORT_HTML, null, {}, null, '');
      const lines = text.split('\n').filter(Boolean);
      const wanted = ['&emsp;Début', 'ab&emsp;cd&emsp;&emsp;ef', '**gras&emsp;suite**&emsp;', '- &emsp;item', '> &emsp;cité', '## &emsp;Titre'];
      const pass = JSON.stringify(lines) === JSON.stringify(wanted) && !/\t/.test(text);
      return { pass, notes: JSON.stringify({ lines }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.tabIndent = cases;
})();
