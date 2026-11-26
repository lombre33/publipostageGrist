// Suite "condPaste" - coller la condition d'une pastille sur une autre (demande d'Antoine du 2026-11-26 : « sur un bloc de texte conditionnel, ou plus globalement sur une condition,
// quand on clique sur la bulle bleue de la condition, si on la copie et qu'on va ailleurs sur une autre bulle de condition et qu'on colle, ça prend les éléments de condition »).
// Ctrl+C sur une pastille ou un bloc à condition (sélection de nœud : un clic sur la bulle, sur l'étiquette « Si … » du bloc, sur la case ou sur l'image), puis Ctrl+V sur un autre
// choisi de même : il prend la condition de la copie (ses règles et sa combinaison, en entier) et garde le reste - son texte, sa colonne, son « Sinon afficher », son « Avant » / « Après ».
// Le code : VariableConditionClipboard.pasteOver (js/variable-condition-clipboard.js), appelé par `handlePaste` de js/editor.js. Ici les vrais gestionnaires de copie et de collage de
// ProseMirror, avec un presse-papiers factice (`DataTransfer`) ; le vrai clavier, la vraie souris et le vrai presse-papiers du système sont dans verify-cond-paste-mouse.mjs (script condPasteMouse).
(function () {
  const cases = [];
  const TABLE = 'CpDossiers';
  const COND_URGENT = { mode: 'all', rules: [{ column: 'Statut', operator: '=', value: 'Urgent' }] };
  const COND_NORMAL = { mode: 'all', rules: [{ column: 'Statut', operator: '=', value: 'Normal' }] };
  // Deux règles, « au moins une » : la cible d'avant, qui doit être remplacée en entier et non fusionnée avec la copie.
  const COND_TWO = { mode: 'any', rules: [{ column: 'Titre', operator: '=', value: 'Dossier A' }, { column: 'Montant', operator: '>', value: '100' }] };
  // Un groupe, « A ou (B et C) » : une condition à deux niveaux, qui doit arriver telle quelle.
  const COND_GROUP = {
    mode: 'any',
    rules: [{ column: 'Statut', operator: '=', value: 'Urgent' }, { mode: 'all', rules: [{ column: 'Montant', operator: '>', value: '100' }, { column: 'Titre', operator: '=', value: 'Dossier A' }] }],
  };
  const STATUS = 'Statut = Urgent';
  const WINDOWS_START = '<html>\r\n<body>\r\n<!--StartFragment-->';
  const WINDOWS_END = '<!--EndFragment-->\r\n</body>\r\n</html>';

  const attr = (name, value) => ` ${name}="${JSON.stringify(value).replace(/"/g, '&quot;')}"`;
  const escapeAttr = text => String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const failedOf = checks => Object.keys(checks).filter(k => !checks[k]);
  const ed = () => EditorCore.getEditor();
  const condOf = node => ConditionRules.plainCondition(node.attrs.condition);

  // Le HTML enregistré de chaque nœud à condition, comme renderHTML l'écrit.
  const html = {
    badge: (column, condition, extra) => `<span class="var-badge" data-table="${TABLE}" data-column="${column}" data-key="${TABLE}.${column}"${condition ? attr('data-condition', condition) : ''}${extra || ''}></span>`,
    block: (inner, condition, otherwise) => `<div class="conditional-text"${condition ? attr('data-condition', condition) : ''}${otherwise != null ? ` data-otherwise="${escapeAttr(otherwise)}"` : ''}>${inner}</div>`,
    checkbox: condition => `<span class="conditional-checkbox"${condition ? attr('data-condition', condition) : ''}>☐</span>`,
    value: (inner, condition, otherwise) => `<span class="conditional-value"${condition ? attr('data-condition', condition) : ''}${otherwise != null ? ` data-otherwise="${escapeAttr(otherwise)}"` : ''}>${inner}</span>`,
    calc: (formula, condition) => `<span class="calc-badge" data-formula="${escapeAttr(formula)}"${condition ? attr('data-condition', condition) : ''}></span>`,
    image: (column, condition) => `<img class="editor-image" data-var-table="${TABLE}" data-var-column="${column}" data-var-key="${TABLE}.${column}" style="width: 200px; height: 150px"${condition ? attr('data-condition', condition) : ''}>`,
  };
  // Le type de nœud de chaque forme, pour les retrouver dans le document.
  const TYPE = { badge: 'varBadge', block: 'conditionalText', checkbox: 'conditionalCheckbox', value: 'conditionalValue', calc: 'calcBadge', image: 'editorImage' };

  async function seed(h, content) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables(TABLE, { Titre: 'Text', Statut: 'Text', Responsable: 'Text', Montant: 'Numeric', Logo: 'Attachments' });
    stub.setRows(TABLE, [{ id: 1, Titre: 'Dossier A', Statut: 'Urgent', Responsable: 'Dupont Jean', Montant: 1200, Logo: ['L', 11] }]);
    await GristAPI.refreshSchema();
    stub.fireRecord({ id: 1, Titre: 'Dossier A', Statut: 'Urgent', Responsable: 'Dupont Jean', Montant: 1200, Logo: ['L', 11] }, TABLE);
    await h.sleep(60);
    Editor.setHTML(content);
    await h.sleep(150);
  }

  function nodesOf(type) {
    const out = [];
    ed().state.doc.descendants((node, pos) => { if (node.type.name === type) out.push({ node, pos }); });
    return out;
  }
  const countOf = type => nodesOf(type).length;
  function select(type, index) {
    const found = nodesOf(type)[index || 0];
    if (!found) return null;
    ed().chain().focus().setNodeSelection(found.pos).run();
    return found;
  }
  // Ctrl+C : le vrai gestionnaire de copie de ProseMirror, qui écrit dans le presse-papiers factice ce que le navigateur donnerait.
  function copy() {
    const data = new DataTransfer();
    ed().view.dom.dispatchEvent(new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }));
    return data;
  }
  // Ctrl+V : le vrai gestionnaire de collage, avec le presse-papiers d'une copie (`wrap` : tel que Windows le rend) ou celui qu'on lui donne.
  function paste(data, wrap) {
    let source = data;
    if (wrap) {
      source = new DataTransfer();
      source.setData('text/html', WINDOWS_START + data.getData('text/html') + WINDOWS_END);
      source.setData('text/plain', data.getData('text/plain'));
    }
    const event = new ClipboardEvent('paste', { clipboardData: source, bubbles: true, cancelable: true });
    ed().view.dom.dispatchEvent(event);
    return event.defaultPrevented;
  }
  function pasteRaw(htmlText, text) {
    const data = new DataTransfer();
    data.setData('text/html', htmlText);
    data.setData('text/plain', text || '');
    return paste(data);
  }
  // La condition de chaque nœud de ce type, dans l'ordre du document.
  const conditions = type => nodesOf(type).map(f => condOf(f.node));
  const status = () => document.getElementById('status-msg').textContent;
  const selectedType = () => (ed().state.selection.node ? ed().state.selection.node.type.name : null);

  // === Un bloc prend la condition d'un autre bloc ===
  cases.push({
    id: 'condpaste_block_takes_the_condition_of_the_copied_block_and_keeps_its_own_text',
    description: 'Deux blocs « Si Statut = Urgent » et « Si Statut = Normal » : on choisit le premier, on copie, on choisit le second, on colle - le second a la condition du premier et garde son texte, son sinon et sa place ; le premier ne bouge pas ; le bloc reste choisi.',
    run: async (h) => {
      await seed(h, html.block('<p>Texte A</p>', COND_URGENT) + html.block('<p>Texte B</p>', COND_NORMAL, 'ailleurs'));
      select('conditionalText', 0);
      const data = copy();
      select('conditionalText', 1);
      const prevented = paste(data);
      await h.sleep(80);
      const blocks = nodesOf('conditionalText');
      const second = blocks[1] && blocks[1].node;
      const checks = {
        prevented,
        two_blocks_left: blocks.length === 2,
        second_has_the_copied_condition: !!second && same(condOf(second), COND_URGENT),
        first_is_unchanged: !!blocks[0] && same(condOf(blocks[0].node), COND_URGENT) && blocks[0].node.textContent === 'Texte A',
        second_keeps_its_text: !!second && second.textContent === 'Texte B',
        second_keeps_its_otherwise: !!second && second.attrs.otherwise === 'ailleurs',
        block_is_still_chosen: selectedType() === 'conditionalText' && !!blocks[1] && ed().state.selection.from === blocks[1].pos,
        tag_shows_the_new_condition: (document.querySelectorAll('.tiptap .conditional-text-tag')[1] || {}).textContent === I18n.t('condText.tag.ifOtherwise', { condition: STATUS }),
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, conditions: conditions('conditionalText') }) };
    },
  });

  // === Une pastille de variable prend la condition d'une autre, et garde sa colonne, son « Avant » / « Après » ===
  cases.push({
    id: 'condpaste_variable_bubble_takes_the_condition_of_another_bubble_and_keeps_its_column',
    description: 'Une pastille sans condition devient conditionnelle en recevant celle d\'une autre pastille ; sa colonne, son « Avant » / « Après » et la pastille copiée restent ce qu\'ils étaient.',
    run: async (h) => {
      await seed(h, `<p>Un ${html.badge('Titre', COND_URGENT, ' data-before="("')} et ${html.badge('Responsable', null, ' data-before="« " data-after=" »"')} fin</p>`);
      select('varBadge', 0);
      const data = copy();
      select('varBadge', 1);
      paste(data);
      await h.sleep(80);
      const bubbles = nodesOf('varBadge');
      const [first, second] = bubbles.map(f => f.node);
      const checks = {
        two_bubbles_left: bubbles.length === 2,
        second_has_the_copied_condition: !!second && same(condOf(second), COND_URGENT),
        second_keeps_its_column: !!second && second.attrs.column === 'Responsable',
        second_keeps_its_around_text: !!second && second.attrs.before === '« ' && second.attrs.after === ' »',
        first_is_unchanged: !!first && first.attrs.column === 'Titre' && same(condOf(first), COND_URGENT) && first.attrs.before === '(',
        bubble_is_still_chosen: selectedType() === 'varBadge' && !!bubbles[1] && ed().state.selection.from === bubbles[1].pos,
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, attrs: second && second.attrs }) };
    },
  });

  // === D'un type à l'autre : les six nœuds à condition se donnent la leur ===
  cases.push({
    id: 'condpaste_every_kind_of_conditional_item_gives_its_condition_to_every_other_kind',
    description: 'Bloc, pastille de variable, case, valeur dans la phrase, calcul et image : la condition copiée de l\'un se colle sur chacun des cinq autres, qui garde ce qu\'il est (son type, son texte ou sa colonne) - les trente couples.',
    run: async (h) => {
      const kinds = {
        badge: () => html.badge('Titre', COND_URGENT),
        block: () => html.block('<p>Texte du bloc</p>', COND_URGENT),
        checkbox: () => html.checkbox(COND_URGENT),
        value: () => html.value('valeur', COND_URGENT),
        calc: () => html.calc('{' + TABLE + '.Montant} + 1', COND_URGENT),
        image: () => html.image('Logo', COND_URGENT),
      };
      const targets = {
        badge: () => html.badge('Responsable', COND_NORMAL),
        block: () => html.block('<p>Autre bloc</p>', COND_NORMAL),
        checkbox: () => html.checkbox(COND_NORMAL),
        value: () => html.value('autre', COND_NORMAL),
        calc: () => html.calc('{' + TABLE + '.Montant} + 2', COND_NORMAL),
        image: () => html.image('Logo', COND_NORMAL),
      };
      const wrap = (kind, markup) => (kind === 'block' ? markup : `<p>${markup}</p>`);
      const failures = [];
      let pairs = 0;
      for (const from of Object.keys(kinds)) {
        for (const to of Object.keys(targets)) {
          if (from === to) continue;
          pairs++;
          // La copie et la cible dans deux paragraphes (ou deux blocs), jamais l'une dans l'autre.
          await seed(h, wrap(from, kinds[from]()) + wrap(to, targets[to]()));
          const source = select(TYPE[from], 0);
          const data = copy();
          const target = select(TYPE[to], 0);
          if (!source || !target) { failures.push(from + '>' + to + ':missing'); continue; }
          const before = target.node.attrs;
          paste(data);
          await h.sleep(40);
          const after = nodesOf(TYPE[to])[0];
          const kept = after && Object.keys(before).every(key => key === 'condition' || same(after.node.attrs[key], before[key]));
          if (!after || !same(condOf(after.node), COND_URGENT) || !kept || after.node.type.name !== TYPE[to] || countOf(TYPE[from]) !== 1) failures.push(from + '>' + to);
        }
      }
      return { pass: pairs === 30 && failures.length === 0, notes: JSON.stringify({ pairs, failures }) };
    },
  });

  // === Remplacé en entier, groupes compris ===
  cases.push({
    id: 'condpaste_the_rules_and_the_combination_of_the_target_are_replaced_not_merged',
    description: 'La cible a deux règles « au moins une » ; la copie une règle « toutes » : la cible n\'a plus que la règle de la copie, avec sa combinaison. Une copie à groupe (« A ou (B et C) ») arrive telle quelle, groupe compris.',
    run: async (h) => {
      await seed(h, html.block('<p>Source</p>', COND_URGENT) + html.block('<p>Cible</p>', COND_TWO) + html.block('<p>Groupe</p>', COND_GROUP) + html.block('<p>Autre</p>', COND_NORMAL));
      select('conditionalText', 0);
      const urgent = copy();
      select('conditionalText', 1);
      paste(urgent);
      await h.sleep(60);
      const afterFirst = conditions('conditionalText');
      select('conditionalText', 2);
      const groupData = copy();
      select('conditionalText', 3);
      paste(groupData);
      await h.sleep(60);
      const afterGroup = conditions('conditionalText');
      const checks = {
        two_rules_became_the_copied_one: same(afterFirst[1], COND_URGENT),
        combination_follows_the_copy: afterFirst[1] && afterFirst[1].mode === 'all',
        group_arrives_whole: same(afterGroup[3], COND_GROUP),
        group_source_is_unchanged: same(afterGroup[2], COND_GROUP),
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, afterFirst, afterGroup }) };
    },
  });

  // === Annuler ===
  cases.push({
    id: 'condpaste_one_undo_gives_back_the_old_condition_and_redo_gives_the_new_one',
    description: 'Un seul Annuler rend à la cible sa condition d\'avant (et son bloc choisi) ; Rétablir la lui redonne : le collage est une seule étape de l\'historique.',
    run: async (h) => {
      await seed(h, html.block('<p>Texte A</p>', COND_URGENT) + html.block('<p>Texte B</p>', COND_NORMAL));
      select('conditionalText', 0);
      const data = copy();
      select('conditionalText', 1);
      paste(data);
      await h.sleep(60);
      const pasted = conditions('conditionalText')[1];
      ed().commands.undo();
      await h.sleep(60);
      const undone = conditions('conditionalText')[1];
      ed().commands.redo();
      await h.sleep(60);
      const redone = conditions('conditionalText')[1];
      const checks = { pasted: same(pasted, COND_URGENT), undone: same(undone, COND_NORMAL), redone: same(redone, COND_URGENT) };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, pasted, undone, redone }) };
    },
  });

  // === Dit ce qui s'est passé ===
  const statusCase = {
    id: 'condpaste_status_names_the_pasted_condition_and_a_same_condition_changes_nothing',
    description: 'Le coin d\'état dit « Condition collée : Statut = Urgent. Ctrl+Z pour revenir. » ; coller une condition que la cible a déjà ne change rien (même document, pas d\'étape d\'historique en plus) et le dit.',
    run: async (h) => {
      await seed(h, html.block('<p>Texte A</p>', COND_URGENT) + html.block('<p>Texte B</p>', COND_NORMAL));
      const english = I18n.getLang() === 'en';
      select('conditionalText', 0);
      const data = copy();
      select('conditionalText', 1);
      paste(data);
      await h.sleep(60);
      const done = status();
      const missing = ['varCond.paste.done', 'varCond.paste.same'].filter(k => I18n.t(k) === k);
      const depthBefore = ed().state.doc.toJSON();
      paste(data);
      await h.sleep(60);
      const sameSaid = status();
      const unchanged = same(ed().state.doc.toJSON(), depthBefore);
      // Un Annuler après le second collage rend la condition d'avant le PREMIER : le second n'a rien ajouté à l'historique.
      ed().commands.undo();
      await h.sleep(60);
      const undone = conditions('conditionalText')[1];
      const want = english
        ? { done: 'Condition pasted: Statut = Urgent. Ctrl+Z to undo.', same: 'The condition is already the same: nothing changed.' }
        : { done: 'Condition collée : Statut = Urgent. Ctrl+Z pour revenir.', same: 'La condition est déjà la même : rien n’a changé.' };
      const checks = { done: done === want.done, same_said: sameSaid === want.same, unchanged, one_undo_step: same(undone, COND_NORMAL), no_missing_key: missing.length === 0 };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, done, sameSaid, missing }) };
    },
  };
  cases.push(statusCase, Object.assign({}, statusCase, {
    id: 'condpaste_status_english_interface',
    lang: 'en',
    description: 'Page qui démarre en anglais : les deux phrases du coin d\'état (« Condition pasted: … », « The condition is already the same… ») sont en anglais - sans clé manquante.',
  }));

  // === Le presse-papiers de Windows ===
  cases.push({
    id: 'condpaste_windows_clipboard_wrapping_and_html_without_editor_marks_give_the_same_result',
    description: 'Le HTML copié tel que Windows le rend (repères StartFragment / EndFragment et retours à la ligne autour) donne le même résultat ; un HTML venu d\'ailleurs, sans les repères de l\'éditeur, aussi - dans les deux sens (pastille vers bloc, bloc vers pastille).',
    run: async (h) => {
      await seed(h, `<p>Un ${html.badge('Titre', COND_URGENT)} puis ${html.badge('Responsable', COND_NORMAL)}</p>` + html.block('<p>Texte B</p>', COND_NORMAL));
      select('varBadge', 0);
      const copied = copy();
      select('varBadge', 1);
      paste(copied, true);
      await h.sleep(60);
      const viaWindows = conditions('varBadge')[1];
      const breaksAfterWindows = countOf('hardBreak');
      // Un bloc collé tel qu'un autre logiciel le donnerait : son HTML nu, sans `data-pm-slice`, sur une pastille choisie.
      select('varBadge', 1);
      pasteRaw(html.block('<p>Copié ailleurs</p>', COND_GROUP), 'Copié ailleurs');
      await h.sleep(60);
      const fromElsewhere = conditions('varBadge')[1];
      // Et une pastille nue sur un bloc choisi.
      select('conditionalText', 0);
      pasteRaw(html.badge('Titre', COND_URGENT), '#Titre');
      await h.sleep(60);
      const onBlock = conditions('conditionalText')[0];
      const checks = {
        windows_wrapping: same(viaWindows, COND_URGENT),
        no_line_break_added: breaksAfterWindows === 0 && countOf('hardBreak') === 0,
        block_html_from_elsewhere_on_a_bubble: same(fromElsewhere, COND_GROUP),
        bare_bubble_on_a_block: same(onBlock, COND_URGENT),
        nothing_replaced: countOf('varBadge') === 2 && countOf('conditionalText') === 1,
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, viaWindows, fromElsewhere, onBlock }) };
    },
  });

  // === Ce qui ne change pas ===
  cases.push({
    id: 'condpaste_a_copy_without_condition_still_replaces_the_chosen_bubble',
    description: 'Copier une pastille SANS condition puis la coller sur une pastille choisie fait ce que Ctrl+V faisait : la cible est remplacée par la copie (sa colonne), rien ne change de condition.',
    run: async (h) => {
      await seed(h, `<p>Un ${html.badge('Titre', null)} et ${html.badge('Responsable', COND_NORMAL)} fin</p>`);
      select('varBadge', 0);
      const data = copy();
      select('varBadge', 1);
      paste(data);
      await h.sleep(80);
      const bubbles = nodesOf('varBadge').map(f => f.node);
      const checks = {
        two_bubbles: bubbles.length === 2,
        target_is_replaced_by_the_copy: bubbles.length === 2 && bubbles[1].attrs.column === 'Titre',
        the_copy_has_no_condition: bubbles.length === 2 && bubbles[1].attrs.condition == null,
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, columns: bubbles.map(b => b.attrs.column) }) };
    },
  });

  cases.push({
    id: 'condpaste_a_copied_condition_is_not_taken_when_the_cursor_is_in_the_text',
    description: 'Un curseur dans le texte (pas une pastille choisie) : coller une pastille conditionnelle l\'insère comme avant, sans toucher la condition d\'aucune autre pastille ni d\'aucun bloc.',
    run: async (h) => {
      await seed(h, `<p>Un ${html.badge('Titre', COND_URGENT)} et ${html.badge('Responsable', COND_NORMAL)}</p>` + html.block('<p>Texte B</p>', COND_NORMAL) + '<p>Fin</p>');
      select('varBadge', 0);
      const data = copy();
      // Curseur au bout du dernier paragraphe, puis dans le texte du bloc.
      ed().chain().focus('end').run();
      paste(data);
      await h.sleep(60);
      const afterEnd = nodesOf('varBadge').length;
      let inBlock = null;
      ed().state.doc.descendants((node, pos) => { if (!inBlock && node.type.name === 'paragraph' && node.textContent === 'Texte B') inBlock = pos + 1; });
      ed().commands.setTextSelection(inBlock + 2);
      paste(data);
      await h.sleep(60);
      const checks = {
        inserted_at_the_end: afterEnd === 3,
        inserted_in_the_block: nodesOf('varBadge').length === 4,
        block_condition_unchanged: same(conditions('conditionalText')[0], COND_NORMAL),
        second_bubble_unchanged: same(conditions('varBadge')[1], COND_NORMAL),
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, afterEnd, bubbles: nodesOf('varBadge').length }) };
    },
  });

  cases.push({
    id: 'condpaste_an_incomplete_condition_is_not_carried_and_plain_text_still_replaces_the_chosen_bubble',
    description: 'Une condition sans règle complète (colonne vide) ne se colle pas comme condition : le collage reste celui d\'avant ; du texte collé sur une pastille choisie la remplace comme avant.',
    run: async (h) => {
      const empty = { mode: 'all', rules: [{ column: '', operator: '=', value: '' }] };
      await seed(h, `<p>Un ${html.badge('Titre', empty)} et ${html.badge('Responsable', COND_NORMAL)} fin</p>`);
      select('varBadge', 0);
      const data = copy();
      select('varBadge', 1);
      paste(data);
      await h.sleep(60);
      const afterEmpty = nodesOf('varBadge').map(f => f.node.attrs.column);
      select('varBadge', 1);
      const text = new DataTransfer();
      text.setData('text/plain', 'du texte');
      paste(text);
      await h.sleep(60);
      const checks = {
        incomplete_condition_replaces_as_before: same(afterEmpty, ['Titre', 'Titre']),
        text_replaces_the_chosen_bubble: countOf('varBadge') === 1 && ed().state.doc.textContent.indexOf('du texte') !== -1,
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, afterEmpty }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.condPaste = cases;
})();
