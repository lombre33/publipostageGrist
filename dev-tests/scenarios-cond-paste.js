// Suite "condPaste" - copier la condition seule d'une pastille ou d'un bloc et la coller sur un autre (demande d'Antoine du 2026-11-26 : « sur un bloc de texte conditionnel, ou plus globalement sur une condition,
// quand on clique sur la bulle bleue de la condition, si on la copie et qu'on va ailleurs sur une autre bulle de condition et qu'on colle, ça prend les éléments de condition » ; puis « il faudrait pouvoir sélectionner le
// bloc entier, la puce, au premier clic, et après sélection la bulle de la condition - on garde l'option de copier-coller condition et contenu, ou juste condition »).
// Deux niveaux (js/condition-pick.js) : le premier clic choisit l'objet ENTIER (Ctrl+C le copie avec son contenu, Ctrl+V sur un objet choisi le remplace, comme toujours) ; un deuxième clic sur sa bulle bleue ne choisit que sa
// CONDITION (une décoration de la vue) : Ctrl+C la copie seule, Ctrl+V la colle sur un objet choisi - ses règles et sa combinaison remplacées en entier, son contenu, son « Sinon afficher » et son « Avant » / « Après » gardés.
// Ici les vrais gestionnaires de copie et de collage de ProseMirror, avec un presse-papiers factice (`DataTransfer`) ; le vrai clavier, la vraie souris et le vrai presse-papiers du système sont dans
// verify-cond-paste-mouse.mjs (script condPasteMouse).
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
  // Le premier clic : l'objet choisi en entier.
  function select(type, index) {
    const found = nodesOf(type)[index || 0];
    if (!found) return null;
    ed().chain().focus().setNodeSelection(found.pos).run();
    return found;
  }
  // Le deuxième clic : la condition seule de l'objet choisi.
  function pick(type, index) {
    const found = select(type, index);
    if (found) ConditionPick.toggle(ed().view, found.pos);
    return found;
  }
  const pickedPos = () => ConditionPick.pickedPos(ed().state);
  // Ctrl+C : le vrai gestionnaire de copie, qui écrit dans le presse-papiers factice ce que le navigateur donnerait.
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
  const payloadHtml = condition => `<span data-pp-condition="${escapeAttr(JSON.stringify(condition))}">${STATUS}</span>`;
  const tick = h => h.sleep(50);

  // === Le geste complet : la condition seule d'un bloc copiée, collée sur un autre bloc ===
  cases.push({
    id: 'condpaste_block_condition_copied_alone_goes_to_another_block_and_keeps_its_content',
    description: 'Deux blocs « Si Statut = Urgent » et « Si Statut = Normal » : un clic choisit le premier en entier, un deuxième clic sa condition seule, Ctrl+C ; un clic sur le second, Ctrl+V - le second a la condition du premier et garde son texte, son sinon et sa place ; le premier ne bouge pas ; le bloc reste choisi.',
    run: async (h) => {
      await seed(h, html.block('<p>Texte A</p>', COND_URGENT) + html.block('<p>Texte B</p>', COND_NORMAL, 'ailleurs'));
      pick('conditionalText', 0);
      const data = copy();
      const sourcePicked = pickedPos() === nodesOf('conditionalText')[0].pos;
      select('conditionalText', 1);
      const prevented = paste(data);
      await h.sleep(80);
      const blocks = nodesOf('conditionalText');
      const second = blocks[1] && blocks[1].node;
      const checks = {
        copy_wrote_the_condition_alone: /data-pp-condition/.test(data.getData('text/html')) && data.getData('text/plain') === STATUS && !/conditional-text/.test(data.getData('text/html')),
        source_was_picked_when_copied: sourcePicked,
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

  cases.push({
    id: 'condpaste_bubble_condition_copied_alone_goes_to_another_bubble_and_keeps_its_column',
    description: 'Une pastille sans condition devient conditionnelle en recevant la condition seule d\'une autre pastille ; sa colonne, son « Avant » / « Après » et la pastille copiée restent ce qu\'ils étaient.',
    run: async (h) => {
      await seed(h, `<p>Un ${html.badge('Titre', COND_URGENT, ' data-before="("')} et ${html.badge('Responsable', null, ' data-before="« " data-after=" »"')} fin</p>`);
      pick('varBadge', 0);
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
        target_was_not_picked_so_it_is_not_now: pickedPos() == null,
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, attrs: second && second.attrs }) };
    },
  });

  // === D'un type à l'autre : les six nœuds à condition se donnent la leur ===
  function kindsMatrix() {
    const sources = {
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
    // La copie et la cible dans deux paragraphes (ou deux blocs), jamais l'une dans l'autre.
    const wrap = (kind, markup) => (kind === 'block' ? markup : `<p>${markup}</p>`);
    return { sources, targets, wrap };
  }
  const matrixCase = (id, description, gesture) => ({
    id, description,
    run: async (h) => {
      const { sources, targets, wrap } = kindsMatrix();
      const failures = [];
      let pairs = 0;
      for (const from of Object.keys(sources)) {
        for (const to of Object.keys(targets)) {
          if (from === to) continue;
          pairs++;
          await seed(h, wrap(from, sources[from]()) + wrap(to, targets[to]()));
          const target = nodesOf(TYPE[to])[0];
          const before = target && target.node.attrs;
          const done = gesture(from, to);
          if (!done || !target) { failures.push(from + '>' + to + ':missing'); continue; }
          await h.sleep(40);
          const after = nodesOf(TYPE[to])[0];
          const kept = after && Object.keys(before).every(key => key === 'condition' || same(after.node.attrs[key], before[key]));
          if (!after || !same(condOf(after.node), COND_URGENT) || !kept || after.node.type.name !== TYPE[to] || countOf(TYPE[from]) !== 1) failures.push(from + '>' + to);
        }
      }
      return { pass: pairs === 30 && failures.length === 0, notes: JSON.stringify({ pairs, failures }) };
    },
  });
  cases.push(matrixCase(
    'condpaste_every_kind_of_conditional_item_gives_its_condition_alone_to_every_other_kind',
    'Bloc, pastille de variable, case, valeur dans la phrase, calcul et image : la condition seule du premier, copiée, se colle sur chacun des cinq autres choisis en entier, qui garde ce qu\'il est (son type, son texte ou sa colonne) - les trente couples.',
    (from, to) => {
      if (!pick(TYPE[from], 0)) return false;
      const data = copy();
      if (!select(TYPE[to], 0)) return false;
      return paste(data);
    }
  ));
  cases.push(matrixCase(
    'condpaste_a_whole_item_copied_gives_its_condition_to_a_target_whose_condition_alone_is_chosen',
    'L\'objet copié en entier (Ctrl+C du premier clic) se colle sur un objet dont la condition seule est choisie : la cible en prend la condition et garde le reste - les trente couples.',
    (from, to) => {
      if (!select(TYPE[from], 0)) return false;
      const data = copy();
      if (!pick(TYPE[to], 0)) return false;
      return paste(data);
    }
  ));

  // === Le collage d'avant : l'objet entier remplace l'objet choisi en entier ===
  cases.push({
    id: 'condpaste_whole_item_copied_still_replaces_a_target_chosen_whole',
    description: 'Sans deuxième clic, rien ne change : un bloc copié en entier, collé sur un bloc choisi en entier, le remplace par sa copie (texte compris) ; une pastille copiée en entier remplace de même une pastille choisie.',
    run: async (h) => {
      await seed(h, html.block('<p>Texte A</p>', COND_URGENT) + html.block('<p>Texte B</p>', COND_NORMAL, 'ailleurs') + `<p>Un ${html.badge('Titre', COND_URGENT)} et ${html.badge('Responsable', COND_NORMAL)}</p>`);
      select('conditionalText', 0);
      const wholeBlock = copy();
      select('conditionalText', 1);
      paste(wholeBlock);
      await tick(h);
      const blocks = nodesOf('conditionalText').map(f => f.node);
      select('varBadge', 0);
      const wholeBubble = copy();
      select('varBadge', 1);
      paste(wholeBubble);
      await tick(h);
      const bubbles = nodesOf('varBadge').map(f => f.node);
      const checks = {
        block_is_replaced_by_the_copy: blocks.length === 2 && blocks[1].textContent === 'Texte A' && same(condOf(blocks[1]), COND_URGENT),
        the_old_otherwise_is_gone: blocks.length === 2 && blocks[1].attrs.otherwise == null,
        bubble_is_replaced_by_the_copy: bubbles.length === 2 && bubbles[1].attrs.column === 'Titre' && same(condOf(bubbles[1]), COND_URGENT),
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, texts: blocks.map(b => b.textContent), columns: bubbles.map(b => b.attrs.column) }) };
    },
  });

  // === Remplacé en entier, groupes compris ===
  cases.push({
    id: 'condpaste_the_rules_and_the_combination_of_the_target_are_replaced_not_merged',
    description: 'La cible a deux règles « au moins une » ; la condition copiée une règle « toutes » : la cible n\'a plus que la règle de la copie, avec sa combinaison. Une condition à groupe (« A ou (B et C) ») arrive telle quelle, groupe compris.',
    run: async (h) => {
      await seed(h, html.block('<p>Source</p>', COND_URGENT) + html.block('<p>Cible</p>', COND_TWO) + html.block('<p>Groupe</p>', COND_GROUP) + html.block('<p>Autre</p>', COND_NORMAL));
      pick('conditionalText', 0);
      const urgent = copy();
      select('conditionalText', 1);
      paste(urgent);
      await h.sleep(60);
      const afterFirst = conditions('conditionalText');
      pick('conditionalText', 2);
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
    description: 'Un seul Annuler rend à la cible sa condition d\'avant ; Rétablir la lui redonne : le collage est une seule étape de l\'historique. Choisir la condition seule n\'en ajoute aucune.',
    run: async (h) => {
      await seed(h, html.block('<p>Texte A</p>', COND_URGENT) + html.block('<p>Texte B</p>', COND_NORMAL));
      ed().commands.clearHistory && ed().commands.clearHistory();
      pick('conditionalText', 0);
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

  // === Choisir la condition seule : une décoration de la vue, relâchée par tout autre geste ===
  cases.push({
    id: 'condpaste_picking_the_condition_is_a_view_state_released_by_any_other_gesture',
    description: 'Un deuxième clic choisit la condition seule (classe pp-condition-picked sur l\'objet, rien dans le HTML enregistré), un troisième la relâche ; un autre choix de sélection, une frappe dans le document, Échap la relâchent aussi ; Retour arrière et une lettre tapée ne remplacent PAS l\'objet entier.',
    run: async (h) => {
      await seed(h, html.block('<p>Texte A</p>', COND_URGENT) + `<p>Un ${html.badge('Titre', COND_URGENT)} fin</p>`);
      const checks = {};
      const picked = () => document.querySelectorAll('.tiptap .pp-condition-picked').length;
      const block = select('conditionalText', 0);
      checks.whole_chosen_is_not_picked = pickedPos() == null && picked() === 0;
      ConditionPick.toggle(ed().view, block.pos);
      await tick(h);
      checks.second_click_picks = pickedPos() === block.pos && picked() === 1 && document.querySelector('.tiptap .conditional-text').classList.contains('pp-condition-picked');
      checks.still_a_node_selection = selectedType() === 'conditionalText';
      checks.nothing_in_the_saved_html = Editor.getHTML().indexOf('pp-condition-picked') === -1;
      checks.status_says_it = status() === I18n.t('varCond.pick.on');
      ConditionPick.toggle(ed().view, block.pos);
      await tick(h);
      checks.third_click_releases = pickedPos() == null && picked() === 0;
      // Un autre choix de sélection la relâche.
      ConditionPick.toggle(ed().view, block.pos);
      select('varBadge', 0);
      await tick(h);
      checks.another_selection_releases = pickedPos() == null && picked() === 0;
      // Une frappe dans le document la relâche.
      pick('varBadge', 0);
      checks.bubble_picked = picked() === 1;
      ed().commands.insertContentAt(1, 'x');
      await tick(h);
      checks.a_document_change_releases = pickedPos() == null && picked() === 0;
      // Échap la relâche, sans rien prendre aux autres touches.
      pick('varBadge', 0);
      ed().view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await tick(h);
      checks.escape_releases = pickedPos() == null;
      // Retour arrière, Suppr et une lettre : l'objet entier n'est PAS effacé ni remplacé.
      for (const key of ['Backspace', 'Delete', 'a']) {
        pick('varBadge', 0);
        const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
        ed().view.dom.dispatchEvent(event);
        await tick(h);
        checks['key_' + key + '_keeps_the_object_and_releases'] = countOf('varBadge') === 1 && pickedPos() == null && event.defaultPrevented;
      }
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed }) };
    },
  });

  cases.push({
    id: 'condpaste_second_click_on_the_block_label_picks_the_condition_and_a_third_releases_it',
    description: 'La vue du bloc : un premier appui sur l\'étiquette « Si … » choisit le bloc entier, le deuxième ne choisit que sa condition (étiquette pleine, anneau de l\'objet entier retiré), le troisième la relâche ; l\'appui sur l\'étiquette d\'un autre bloc choisit celui-là.',
    run: async (h) => {
      await seed(h, html.block('<p>Texte A</p>', COND_URGENT) + html.block('<p>Texte B</p>', COND_NORMAL));
      const press = index => document.querySelectorAll('.tiptap .conditional-text-tag')[index].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      const blocks = () => Array.from(document.querySelectorAll('.tiptap .conditional-text'));
      const log = {};
      document.querySelector('.tiptap').focus();
      press(0); await h.sleep(80);
      log.first = { type: selectedType(), picked: pickedPos() };
      press(0); await h.sleep(80);
      log.second = { picked: pickedPos(), cls: blocks()[0].classList.contains('pp-condition-picked'), selected: blocks()[0].classList.contains('conditional-text-selected') };
      const tag = document.querySelectorAll('.tiptap .conditional-text-tag')[0];
      const style = getComputedStyle(tag);
      log.fill = { background: style.backgroundColor, color: style.color };
      press(0); await h.sleep(80);
      log.third = { picked: pickedPos(), cls: blocks()[0].classList.contains('pp-condition-picked') };
      press(0); await h.sleep(80);
      press(1); await h.sleep(80);
      log.other = { picked: pickedPos(), from: ed().state.selection.from, second: nodesOf('conditionalText')[1].pos };
      const checks = {
        first_chooses_the_whole_block: log.first.type === 'conditionalText' && log.first.picked == null,
        second_picks_the_condition: log.second.picked === nodesOf('conditionalText')[0].pos && log.second.cls && log.second.selected,
        label_is_filled_with_the_accent: log.fill.background === 'rgb(47, 111, 237)' && log.fill.color === 'rgb(255, 255, 255)',
        third_releases: log.third.picked == null && !log.third.cls,
        another_block_label_chooses_that_block: log.other.picked == null && log.other.from === log.other.second,
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, log }) };
    },
  });

  // === Ctrl+C sur la condition choisie : le presse-papiers, sans rien retirer ===
  cases.push({
    id: 'condpaste_copy_and_cut_on_a_picked_condition_write_it_alone_and_remove_nothing',
    description: 'Ctrl+C sur une condition choisie écrit « Statut = Urgent » en texte et un span data-pp-condition en HTML (jamais l\'objet), Ctrl+X fait de même sans rien retirer ; sans condition, rien n\'est copié et le coin d\'état le dit ; l\'objet choisi en entier se copie comme toujours (son HTML).',
    run: async (h) => {
      await seed(h, `<p>Un ${html.badge('Titre', COND_URGENT)} et ${html.badge('Responsable', null)}</p>`);
      pick('varBadge', 0);
      const copied = copy();
      const copiedStatus = status();
      const cut = new DataTransfer();
      ed().view.dom.dispatchEvent(new ClipboardEvent('cut', { clipboardData: cut, bubbles: true, cancelable: true }));
      const holder = new DOMParser().parseFromString(copied.getData('text/html'), 'text/html').querySelector('[data-pp-condition]');
      pick('varBadge', 1);
      const empty = copy();
      const emptyStatus = status();
      select('varBadge', 0);
      const whole = copy();
      const checks = {
        text_is_the_summary: copied.getData('text/plain') === STATUS,
        html_carries_the_condition: !!holder && same(JSON.parse(holder.getAttribute('data-pp-condition')), COND_URGENT),
        html_is_not_the_object: copied.getData('text/html').indexOf('var-badge') === -1,
        copy_status: copiedStatus === I18n.t('varCond.pick.copied', { summary: STATUS }),
        cut_writes_the_same_and_removes_nothing: cut.getData('text/plain') === STATUS && countOf('varBadge') === 2 && same(conditions('varBadge')[0], COND_URGENT),
        nothing_to_copy_without_condition: empty.getData('text/html') === '' && empty.getData('text/plain') === '' && emptyStatus === I18n.t('varCond.pick.none'),
        whole_object_copies_as_always: /var-badge/.test(whole.getData('text/html')) && !/data-pp-condition/.test(whole.getData('text/html')),
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, copiedStatus, emptyStatus }) };
    },
  });

  // === Dit ce qui s'est passé ===
  const statusCase = {
    id: 'condpaste_status_names_the_pasted_condition_and_a_same_condition_changes_nothing',
    description: 'Le coin d\'état dit « Condition collée : Statut = Urgent. Ctrl+Z pour revenir. » ; coller une condition que la cible a déjà ne change rien (même document, pas d\'étape d\'historique en plus) et le dit ; « Condition seule choisie… » et « Condition copiée : … » aussi.',
    run: async (h) => {
      await seed(h, html.block('<p>Texte A</p>', COND_URGENT) + html.block('<p>Texte B</p>', COND_NORMAL));
      const english = I18n.getLang() === 'en';
      pick('conditionalText', 0);
      const pickedSaid = status();
      const data = copy();
      const copiedSaid = status();
      select('conditionalText', 1);
      paste(data);
      await h.sleep(60);
      const done = status();
      const keys = ['varCond.paste.done', 'varCond.paste.same', 'varCond.pick.on', 'varCond.pick.copied', 'varCond.pick.none'];
      const missing = keys.filter(k => I18n.t(k) === k);
      const before = ed().state.doc.toJSON();
      paste(data);
      await h.sleep(60);
      const sameSaid = status();
      const unchanged = same(ed().state.doc.toJSON(), before);
      // Un Annuler après le second collage rend la condition d'avant le PREMIER : le second n'a rien ajouté à l'historique.
      ed().commands.undo();
      await h.sleep(60);
      const undone = conditions('conditionalText')[1];
      const want = english
        ? { done: 'Condition pasted: Statut = Urgent. Ctrl+Z to undo.', same: 'The condition is already the same: nothing changed.', picked: 'Condition only selected. Ctrl+C copies it, Ctrl+V pastes another. One more click releases it.', copied: 'Condition copied: Statut = Urgent. Ctrl+V pastes it onto another item.' }
        : { done: 'Condition collée : Statut = Urgent. Ctrl+Z pour revenir.', same: 'La condition est déjà la même : rien n’a changé.', picked: 'Condition seule choisie. Ctrl+C la copie, Ctrl+V en colle une autre. Un clic de plus la relâche.', copied: 'Condition copiée : Statut = Urgent. Ctrl+V la colle sur une autre pastille ou un autre bloc.' };
      const checks = {
        done: done === want.done, same_said: sameSaid === want.same, picked_said: pickedSaid === want.picked, copied_said: copiedSaid === want.copied,
        unchanged, one_undo_step: same(undone, COND_NORMAL), no_missing_key: missing.length === 0,
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, done, sameSaid, pickedSaid, copiedSaid, missing }) };
    },
  };
  cases.push(statusCase, Object.assign({}, statusCase, {
    id: 'condpaste_status_english_interface',
    lang: 'en',
    description: 'Page qui démarre en anglais : les cinq phrases du coin d\'état (« Condition pasted: … », « Condition copied: … », « Condition only selected… », « The condition is already the same… », « This item has no condition to copy. ») sont en anglais - sans clé manquante.',
  }));

  // === Le presse-papiers de Windows, et un HTML venu d'ailleurs ===
  cases.push({
    id: 'condpaste_windows_clipboard_wrapping_and_a_bare_condition_span_give_the_same_result',
    description: 'La condition copiée seule, telle que Windows rend le HTML (repères StartFragment / EndFragment et retours à la ligne autour), se colle comme sur Linux ; un span data-pp-condition venu d\'un autre document, sans rien de l\'éditeur, aussi - sur une pastille et sur un bloc choisis ; aucun saut de ligne ajouté.',
    run: async (h) => {
      await seed(h, `<p>Un ${html.badge('Titre', COND_URGENT)} puis ${html.badge('Responsable', COND_NORMAL)}</p>` + html.block('<p>Texte B</p>', COND_NORMAL));
      pick('varBadge', 0);
      const copied = copy();
      select('varBadge', 1);
      paste(copied, true);
      await h.sleep(60);
      const viaWindows = conditions('varBadge')[1];
      select('varBadge', 1);
      pasteRaw(payloadHtml(COND_GROUP), STATUS);
      await h.sleep(60);
      const onBubble = conditions('varBadge')[1];
      select('conditionalText', 0);
      pasteRaw(WINDOWS_START + payloadHtml(COND_URGENT) + WINDOWS_END, STATUS);
      await h.sleep(60);
      const onBlock = conditions('conditionalText')[0];
      const checks = {
        windows_wrapping: same(viaWindows, COND_URGENT),
        bare_span_on_a_bubble: same(onBubble, COND_GROUP),
        windows_span_on_a_block: same(onBlock, COND_URGENT),
        no_line_break_added: countOf('hardBreak') === 0,
        nothing_replaced: countOf('varBadge') === 2 && countOf('conditionalText') === 1,
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, viaWindows, onBubble, onBlock }) };
    },
  });

  // === Ce qui ne change pas ===
  cases.push({
    id: 'condpaste_a_picked_target_takes_a_condition_less_object_as_before_and_keeps_being_picked_after_a_paste',
    description: 'Sur une condition choisie, un objet copié SANS condition (ou à condition incomplète) se colle comme avant (il remplace l\'objet) ; coller une condition sur une condition choisie la laisse choisie, pour en coller une autre.',
    run: async (h) => {
      const empty = { mode: 'all', rules: [{ column: '', operator: '=', value: '' }] };
      await seed(h, `<p>Un ${html.badge('Titre', null)} et ${html.badge('Responsable', COND_NORMAL)} puis ${html.badge('Montant', empty)} fin</p>`);
      select('varBadge', 0);
      const plain = copy();
      pick('varBadge', 1);
      paste(plain);
      await h.sleep(60);
      const afterPlain = nodesOf('varBadge').map(f => f.node.attrs.column);
      await seed(h, `<p>Un ${html.badge('Titre', COND_URGENT)} et ${html.badge('Responsable', COND_NORMAL)} et ${html.badge('Montant', COND_NORMAL)}</p>`);
      pick('varBadge', 0);
      const urgent = copy();
      const second = pick('varBadge', 1);
      paste(urgent);
      await h.sleep(60);
      const stillPicked = pickedPos() === second.pos && document.querySelectorAll('.tiptap .pp-condition-picked').length === 1;
      const third = pick('varBadge', 2);
      paste(urgent);
      await h.sleep(60);
      const checks = {
        condition_less_copy_replaces_the_picked_target: same(afterPlain, ['Titre', 'Titre', 'Montant']),
        paste_keeps_the_target_picked: stillPicked,
        and_the_next_one_gets_it_too: same(conditions('varBadge'), [COND_URGENT, COND_URGENT, COND_URGENT]) && !!third,
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, afterPlain }) };
    },
  });

  cases.push({
    id: 'condpaste_a_copied_condition_is_not_taken_when_the_cursor_is_in_the_text',
    description: 'Un curseur dans le texte (pas un objet choisi) : coller une condition copiée seule insère son texte (« Statut = Urgent »), sans toucher la condition d\'aucun objet ; coller une pastille entière l\'insère comme avant.',
    run: async (h) => {
      await seed(h, `<p>Un ${html.badge('Titre', COND_URGENT)} et ${html.badge('Responsable', COND_NORMAL)}</p>` + html.block('<p>Texte B</p>', COND_NORMAL) + '<p>Fin</p>');
      pick('varBadge', 0);
      const conditionAlone = copy();
      select('varBadge', 0);
      const whole = copy();
      ed().chain().focus('end').run();
      paste(conditionAlone);
      await h.sleep(60);
      const textAfter = ed().state.doc.textContent.indexOf(STATUS) !== -1;
      paste(whole);
      await h.sleep(60);
      const checks = {
        condition_alone_pastes_its_text: textAfter,
        no_object_condition_changed: same(conditions('varBadge').slice(0, 2), [COND_URGENT, COND_NORMAL]) && same(conditions('conditionalText')[0], COND_NORMAL),
        whole_bubble_is_inserted_as_before: countOf('varBadge') === 3,
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, bubbles: countOf('varBadge') }) };
    },
  });

  cases.push({
    id: 'condpaste_plain_text_still_replaces_the_chosen_object',
    description: 'Du texte collé sur un objet choisi en entier le remplace comme avant ; la condition seule choisie n\'y change rien (le texte ne porte pas de condition).',
    run: async (h) => {
      await seed(h, `<p>Un ${html.badge('Titre', COND_URGENT)} et ${html.badge('Responsable', COND_NORMAL)} fin</p>`);
      select('varBadge', 1);
      const text = new DataTransfer();
      text.setData('text/plain', 'du texte');
      paste(text);
      await h.sleep(60);
      const checks = { replaced: countOf('varBadge') === 1 && ed().state.doc.textContent.indexOf('du texte') !== -1 };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.condPaste = cases;
})();
