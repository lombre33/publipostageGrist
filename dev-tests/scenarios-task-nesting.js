// Suite "taskNesting" - Tab et Maj+Tab sur une case à cocher (liste de tâches), comme sur une puce : Tab glisse la case sous celle qui la précède (une sous-case), Maj+Tab la ramène, les boutons de retrait de la
// barre font de même (js/editor-core.js : shiftListItem, js/editor-nodes.js : createTabNavigationExtension, js/editor.js : `TaskItem` imbriquable). Demande d'Antoine du 16/11 : « les cases à cocher ne suivent pas
// l'indentation quand on fait tab » - Tab écrivait une tabulation dans le TEXTE de la case (le texte partait à droite, la case restait à gauche) et Maj+Tab sortait la ligne de sa liste.
//  1) l'ÉDITEUR : la sous-case (son état coché gardé), Maj+Tab, le premier point (touche prise, rien d'écrit), le style et le sens d'écriture de la liste repris par la sous-liste, une liste de cases dans un point de puce,
//     les boutons de retrait de la barre, Annuler en un pas, la case qui ne reçoit toujours pas de tableau ;
//  2) les IMPORTS : une liste à cases imbriquée de Markdown ou d'un HTML d'export reste imbriquée (elle sortait à plat) ;
//  3) les EXPORTS, lus sur la sortie réelle : le .docx dézippé (un paragraphe et un retrait par niveau), les positions PEINTES du PDF décodé par pdf.js, le texte du .md, le HTML exporté, le texte d'une case Excel.
// La vraie frappe et la vraie souris à 700x400 sont dans dev-tests/verify-task-nesting-keyboard.mjs.
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const tiptap = () => document.querySelector('.tiptap');
  const editor = () => EditorCore.getEditor();
  const TAB_SPAN = 'class="pp-tab"';

  // Une case telle que le modèle l'écrit (<li><label><input><span/></label><div>contenu</div></li>), et une liste de cases.
  const box = (checked, inner) => `<li data-checked="${checked}" data-type="taskItem"><label><input type="checkbox"${checked ? ' checked="checked"' : ''}><span></span></label><div>${inner}</div></li>`;
  const tasks = (items, attrs) => `<ul data-type="taskList"${attrs || ''}>${items}</ul>`;
  const FLAT = tasks(box(false, '<p>Premier</p>') + box(true, '<p>Deuxième</p>') + box(false, '<p>Troisième</p>'));

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
    await sleep(150);
  }
  // Le curseur dans le texte `needle`, comme un clic y met : la sélection de ProseMirror, pas celle du navigateur.
  async function caretIn(needle) {
    let found = null;
    editor().state.doc.descendants((node, pos) => {
      if (found !== null || !node.isText) return;
      const at = node.text.indexOf(needle);
      if (at !== -1) found = pos + at + needle.length;
    });
    if (found === null) throw new Error('texte introuvable dans l\'éditeur : ' + needle);
    editor().chain().focus().setTextSelection(found).run();
    await sleep(40);
  }
  // L'arbre des cases tel que le DOM de l'éditeur le montre : « Premier(Deuxième)Troisième » pour Deuxième sous Premier, avec un « ✓ » devant une case cochée.
  function shape(list) {
    const root = list || tiptap().querySelector('ul[data-type="taskList"]');
    return Array.from(root.children).filter(li => li.tagName === 'LI').map(li => {
      const body = li.querySelector(':scope > div');
      const text = body.querySelector(':scope > p').textContent;
      const sub = body.querySelector(':scope > ul[data-type="taskList"]');
      return (li.getAttribute('data-checked') === 'true' ? '✓' : '') + text + (sub ? '(' + shape(sub) + ')' : '');
    }).join(',');
  }
  const tabsIn = () => (Editor.getHTML().match(new RegExp(TAB_SPAN, 'g')) || []).length;

  // === 1) L'éditeur =============================================================================================================================================================================

  cases.push({
    id: 'tasknest_tab_slides_the_task_under_the_one_before',
    description: 'Tab dans une case la glisse sous la case qui la précède (une sous-case, son état coché gardé) : la case et son texte vont ensemble, aucune tabulation n\'est écrite dans le texte',
    run: async (h) => {
      await h.resetEditor();
      await load(FLAT);
      await caretIn('Deuxième');
      const consumed = tab();
      await sleep(80);
      const got = shape();
      return { pass: consumed && got === 'Premier(✓Deuxième),Troisième' && tabsIn() === 0, notes: JSON.stringify({ consumed, got, tabs: tabsIn() }) };
    },
  });

  cases.push({
    id: 'tasknest_a_second_tab_goes_down_one_more_level_and_joins_the_sublist',
    description: 'Une deuxième case glissée sous la même case rejoint la sous-liste qui existe déjà (une seule sous-liste), et Tab sur la sous-case la descend d\'un niveau de plus',
    run: async (h) => {
      await h.resetEditor();
      await load(FLAT);
      await caretIn('Deuxième');
      tab();
      await sleep(60);
      await caretIn('Troisième');
      tab();
      await sleep(60);
      const sameLevel = shape();
      const lists = tiptap().querySelectorAll('ul[data-type="taskList"] ul[data-type="taskList"]').length;
      await caretIn('Troisième');
      tab();
      await sleep(60);
      const deeper = shape();
      return { pass: sameLevel === 'Premier(✓Deuxième,Troisième)' && lists === 1 && deeper === 'Premier(✓Deuxième(Troisième))', notes: JSON.stringify({ sameLevel, lists, deeper }) };
    },
  });

  cases.push({
    id: 'tasknest_shift_tab_brings_the_subtask_back_to_the_list',
    description: 'Maj+Tab dans une sous-case la remonte d\'un niveau, à sa place, son état coché gardé',
    run: async (h) => {
      await h.resetEditor();
      await load(FLAT);
      await caretIn('Deuxième');
      tab();
      await sleep(60);
      const consumed = shiftTab();
      await sleep(80);
      const got = shape();
      return { pass: consumed && got === 'Premier,✓Deuxième,Troisième' && tabsIn() === 0, notes: JSON.stringify({ consumed, got }) };
    },
  });

  cases.push({
    id: 'tasknest_tab_on_the_first_task_is_taken_and_writes_nothing',
    description: 'Le premier point d\'une liste n\'a aucune case avant lui où s\'emboîter : Tab est pris quand même (comme sur une puce), le document ne change pas et aucune tabulation n\'est écrite dans son texte',
    run: async (h) => {
      await h.resetEditor();
      await load(FLAT);
      await caretIn('Premier');
      const before = Editor.getHTML();
      const consumed = tab();
      await sleep(80);
      return { pass: consumed && Editor.getHTML() === before && tabsIn() === 0, notes: JSON.stringify({ consumed, tabs: tabsIn(), html: Editor.getHTML() }) };
    },
  });

  cases.push({
    id: 'tasknest_the_sublist_takes_the_style_and_the_direction_of_its_list',
    description: 'La sous-liste que Tab ouvre garde le style des cases (classique) et le sens d\'écriture (droite à gauche) de la liste qui la porte, au lieu de repartir au style par défaut',
    run: async (h) => {
      await h.resetEditor();
      await load(tasks(box(false, '<p>Premier</p>') + box(false, '<p>Deuxième</p>'), ' data-tasklist-style="classic" dir="rtl" data-dir="rtl"'));
      await caretIn('Deuxième');
      tab();
      await sleep(80);
      const sub = tiptap().querySelector('ul[data-type="taskList"] ul[data-type="taskList"]');
      const got = sub ? { style: sub.getAttribute('data-tasklist-style'), dir: sub.getAttribute('data-dir') } : null;
      return { pass: !!got && got.style === 'classic' && got.dir === 'rtl', notes: JSON.stringify(got) };
    },
  });

  cases.push({
    id: 'tasknest_a_task_list_inside_a_bullet_moves_the_task_not_the_bullet',
    description: 'Une liste de cases posée dans un point de puce : Tab glisse la case (le point le plus proche), pas la puce qui la porte',
    run: async (h) => {
      await h.resetEditor();
      await load('<ul><li><p>Puce</p>' + tasks(box(false, '<p>Alpha</p>') + box(false, '<p>Bravo</p>')) + '</li></ul>');
      await caretIn('Bravo');
      tab();
      await sleep(80);
      const inner = tiptap().querySelector('ul[data-type="taskList"]');
      const got = inner ? shape(inner) : null;
      const bullets = tiptap().querySelectorAll('ul:not([data-type="taskList"]) ul:not([data-type="taskList"])').length;
      return { pass: got === 'Alpha(Bravo)' && bullets === 0, notes: JSON.stringify({ got, bullets, html: Editor.getHTML() }) };
    },
  });

  cases.push({
    id: 'tasknest_the_indent_buttons_of_the_bar_work_on_tasks',
    description: 'Les boutons « Augmenter le retrait » et « Diminuer le retrait » de la barre agissent sur une case : grisé au premier point (rien où s\'emboîter), vif ailleurs ; un clic sur l\'un glisse la case, sur l\'autre la ramène',
    run: async (h) => {
      await h.resetEditor();
      await load(FLAT);
      const indent = document.getElementById('v2-btn-indent');
      const outdent = document.getElementById('v2-btn-outdent');
      await caretIn('Premier');
      await sleep(80);
      const first = { indent: !indent.disabled, outdent: !outdent.disabled };
      await caretIn('Deuxième');
      await sleep(80);
      const second = { indent: !indent.disabled, outdent: !outdent.disabled };
      await h.clickButton('v2-btn-indent');
      await sleep(80);
      const nested = shape();
      await sleep(40);
      await h.clickButton('v2-btn-outdent');
      await sleep(80);
      const back = shape();
      const pass = first.indent === false && second.indent === true && nested === 'Premier(✓Deuxième),Troisième' && back === 'Premier,✓Deuxième,Troisième';
      return { pass, notes: JSON.stringify({ first, second, nested, back }) };
    },
  });

  cases.push({
    id: 'tasknest_undo_brings_the_flat_list_back_in_one_step',
    description: 'Annuler défait une case glissée en un seul pas (le style repris par la sous-liste est dans la même transaction)',
    run: async (h) => {
      await h.resetEditor();
      await load(tasks(box(false, '<p>Premier</p>') + box(false, '<p>Deuxième</p>'), ' data-tasklist-style="classic"'));
      await caretIn('Deuxième');
      await sleep(600);
      tab();
      await sleep(80);
      const nested = shape();
      editor().commands.undo();
      await sleep(80);
      return { pass: nested === 'Premier(Deuxième)' && shape() === 'Premier,Deuxième', notes: JSON.stringify({ nested, undone: shape() }) };
    },
  });

  cases.push({
    id: 'tasknest_a_task_holds_only_text_and_subtasks',
    description: 'Une case ne reçoit toujours que du texte et ses sous-cases : le schéma de la case n\'est pas ouvert à n\'importe quel bloc (un tableau n\'y entre pas, cf. nest_checklist_item_no_nested_block)',
    run: async (h) => {
      await h.resetEditor();
      const item = editor().schema.nodes.taskItem;
      const blocks = ['table', 'bulletList', 'blockquote', 'codeBlock', 'heading'].filter(name => item.contentMatch.matchType(editor().schema.nodes.paragraph).matchType(editor().schema.nodes[name]));
      const subtasks = !!item.contentMatch.matchType(editor().schema.nodes.paragraph).matchType(editor().schema.nodes.taskList);
      return { pass: subtasks && blocks.length === 0, notes: JSON.stringify({ subtasks, blocks }) };
    },
  });

  // === 2) Les imports ===========================================================================================================================================================================

  cases.push({
    id: 'tasknest_markdown_import_keeps_nested_checklists_nested',
    description: 'Un Markdown dont les cases à cocher sont imbriquées (« - [ ] » puis deux espaces et « - [x] ») ouvre dans l\'éditeur une sous-liste de cases, et non une liste à plat',
    run: async (h) => {
      await MarkdownImport.ensureLibLoaded();
      const doc = await MarkdownImport.toDocument('- [ ] Parent\n  - [x] Enfant\n  - [ ] Autre\n- [ ] Suivant\n');
      await h.resetEditor();
      await load(doc.html);
      return { pass: shape() === 'Parent(✓Enfant,Autre),Suivant', notes: JSON.stringify({ got: shape(), html: doc.html }) };
    },
  });

  cases.push({
    id: 'tasknest_html_import_keeps_nested_checklists_nested',
    description: 'Un HTML d\'export (liste « pp-tasks » dont une case porte une sous-liste) ouvre dans l\'éditeur une sous-liste de cases, et non une liste à plat',
    run: async (h) => {
      const exported = '<div class="pp-doc"><ul class="pp-tasks"><li class="pp-task pp-done"><span class="pp-checkbox pp-checked">☑</span><div class="pp-task-body"><p>Parent</p><ul class="pp-tasks"><li class="pp-task"><span class="pp-checkbox">☐</span><div class="pp-task-body"><p>Enfant</p></div></li></ul></div></li><li class="pp-task"><span class="pp-checkbox">☐</span><div class="pp-task-body"><p>Suivant</p></div></li></ul></div>';
      const imported = HtmlImport.toDocument(exported);
      await h.resetEditor();
      await load(imported.html);
      return { pass: shape() === '✓Parent(Enfant),Suivant', notes: JSON.stringify({ got: shape(), html: imported.html }) };
    },
  });

  // === 3) Les exports ===========================================================================================================================================================================

  // Un document de quatre cases sur trois niveaux, chaque case un mot de repère en capitales.
  const NESTED = tasks(box(true, '<p>ALPHA parent</p>' + tasks(box(false, '<p>BRAVO enfant</p>' + tasks(box(false, '<p>CHARLIE petit</p>'))) + box(true, '<p>DELTA enfant</p>'))) + box(false, '<p>ECHO suivant</p>'));

  async function nestedFromEditor(h) {
    await h.resetEditor();
    h.setA4Preview(true);
    await load(NESTED);
    return Editor.getHTML();
  }

  cases.push({
    id: 'tasknest_word_writes_each_subtask_in_its_own_paragraph_one_level_further',
    description: 'Word : chaque sous-case est son propre paragraphe (« ☐ texte »), indenté d\'un cran de plus que sa case ; elle n\'est plus collée à la suite du texte de la case qui la porte',
    run: async (h) => {
      const html = await nestedFromEditor(h);
      const parts = await h.exportDocxParts(html);
      const ps = h.docxParagraphs(parts.doc).filter(p => p.text && p.text.trim());
      const got = ps.map(p => p.text + '@' + p.indentLeft);
      const want = ['☑ ALPHA parent@360', '☐ BRAVO enfant@720', '☐ CHARLIE petit@1080', '☑ DELTA enfant@720', '☐ ECHO suivant@360'];
      return { pass: JSON.stringify(got) === JSON.stringify(want), notes: JSON.stringify(got) };
    },
  });

  cases.push({
    id: 'tasknest_pdf_paints_each_subtask_on_its_own_line_one_level_further',
    description: 'PDF : dans le fichier décodé par pdf.js, chaque sous-case est sur sa propre ligne, dans l\'ordre du document, plus à droite que la case qui la porte (le texte d\'une sous-case n\'est plus collé à la suite de celui de la case) et à la place où l\'éditeur la met',
    run: async (h) => {
      const html = await nestedFromEditor(h);
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
      const at = word => items.find(item => item.str.startsWith(word));
      const words = ['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA', 'ECHO'];
      const found = words.map(at);
      if (found.some(item => !item)) return { pass: false, notes: 'mot absent du PDF : ' + JSON.stringify(items.map(item => item.str)) };
      const ys = found.map(item => Math.round(item.y * 10) / 10);
      const xs = found.map(item => Math.round(item.x * 10) / 10);
      const ordered = ys.every((y, i) => i === 0 || y > ys[i - 1] + 5);
      const levels = xs[1] > xs[0] + 10 && xs[2] > xs[1] + 10 && Math.abs(xs[3] - xs[1]) < 1 && Math.abs(xs[4] - xs[0]) < 1;
      const gaps = words.map((word, i) => Math.round((found[i].x - left.get(word)) * 10) / 10);
      const sameAsEditor = gaps.every(gap => Math.abs(gap - gaps[0]) < 1.5);
      return { pass: ordered && levels && sameAsEditor, notes: JSON.stringify({ ys, xs, gaps, texts: items.map(item => item.str) }) };
    },
  });

  cases.push({
    id: 'tasknest_markdown_nests_the_subtasks',
    description: 'Markdown : une sous-case s\'écrit sous sa case, en retrait, avec sa propre case « [ ] » ou « [x] »',
    run: async (h) => {
      const html = await nestedFromEditor(h);
      const { text } = await h.exportMarkdown(html);
      const want = '- [x] ALPHA parent\n  - [ ] BRAVO enfant\n    - [ ] CHARLIE petit\n  - [x] DELTA enfant\n- [ ] ECHO suivant\n';
      return { pass: text.trim() === want.trim(), notes: JSON.stringify(text) };
    },
  });

  cases.push({
    id: 'tasknest_html_export_keeps_the_subtasks_inside_their_task',
    description: 'HTML exporté : une sous-case reste dans le corps de sa case (une sous-liste « pp-tasks » dans « pp-task-body »), à tous les niveaux',
    run: async (h) => {
      const html = await nestedFromEditor(h);
      const { text } = await h.exportHtml(html, null, {}, null, '', { fragment: true });
      const doc = new DOMParser().parseFromString(text, 'text/html');
      const levels = Array.from(doc.querySelectorAll('li.pp-task')).map(li => {
        let depth = 0;
        for (let up = li.parentElement; up; up = up.parentElement) if (up.matches('ul.pp-tasks')) depth += 1;
        return li.querySelector('.pp-task-body > p').textContent + '@' + depth;
      });
      const want = ['ALPHA parent@1', 'BRAVO enfant@2', 'CHARLIE petit@3', 'DELTA enfant@2', 'ECHO suivant@1'];
      return { pass: JSON.stringify(levels) === JSON.stringify(want), notes: JSON.stringify(levels) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.taskNesting = cases;
})();
