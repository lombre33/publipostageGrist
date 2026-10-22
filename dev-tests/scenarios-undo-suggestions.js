// Suite "undoSuggestions" - Ctrl + Z, Ctrl + Y et les boutons Annuler / Rétablir défont « Tout accepter » et « Tout refuser » D'UN SEUL pas, quel que soit le nombre de modifications en attente (suite de
// scenarios-undo-display.js : demande d'Antoine du 22/10, « Il doit prendre en compte 100% des actions faites dans le widget »). « Tout accepter » et « Tout refuser » découpaient le travail en tranches de
// 200 modifications (js/track-changes-commands.js, pour ne pas payer un coût qui grandit avec le carré du nombre de modifications), chaque tranche était sa propre transaction et son propre pas d'historique :
// avec 450 modifications en attente, il fallait trois Ctrl + Z pour tout défaire, et les deux premiers laissaient un document à moitié accepté ou à moitié refusé.
//
// Les attendus sont ceux de la personne qui défait : UN Ctrl + Z (ou le bouton Annuler) rend toutes les modifications, UN Ctrl + Y les résout de nouveau, et ce qui a été fait avant, ou tapé juste après, reste un
// pas à part. Les modifications sont posées par le document chargé (ajouts et suppressions) ou par la barre du tableau (une colonne ajoutée avec le suivi) ; la commande est celle du bouton de la barre.
// Le même parcours à la vraie souris et au vrai clavier, dans le panneau de 700x400 : verify-undo-suggestions-mouse.mjs (undoSuggestionsMouse).
window.EditorTestSuites = window.EditorTestSuites || {};
window.EditorTestSuites.undoSuggestions = (function () {
  const cases = [];
  const ed = () => EditorCore.getEditor();
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const verdict = (problems, summary) => ({ pass: problems.length === 0, notes: JSON.stringify({ summary, problems }) });
  function check(problems, label, got, want) { if (!same(got, want)) problems.push(label + ' : ' + JSON.stringify(got) + ' au lieu de ' + JSON.stringify(want)); }

  // Ctrl + Z et Ctrl + Y au vrai clavier de l'éditeur (la touche passe par le raccourci de TipTap, comme sous les doigts).
  function press(key) {
    const event = new KeyboardEvent('keydown', { key, code: 'Key' + key.toUpperCase(), ctrlKey: true, bubbles: true, cancelable: true });
    ed().view.dom.dispatchEvent(event);
    return event.defaultPrevented;
  }
  const undo = () => press('z');
  const redo = () => press('y');
  const acceptAll = () => ed().chain().focus().acceptAllSuggestionsChunked().run();
  const rejectAll = () => ed().chain().focus().rejectAllSuggestionsChunked().run();

  const count = (html, tag) => (html.match(new RegExp('<' + tag + ' ', 'g')) || []).length;
  const insertions = () => count(Editor.getHTML(), 'ins');
  const deletions = () => count(Editor.getHTML(), 'del');
  const modifications = () => (Editor.getHTML().match(/data-type="modification"/g) || []).length;
  // Quatre cent cinquante paragraphes qui portent chacun un ajout : trois tranches de 200, 200 et 50.
  const ADDS = n => Array.from({ length: n }, (_, i) => '<p>L' + i + '<ins data-id="' + (i + 1) + '">+</ins></p>').join('');
  // Le même texte une fois les ajouts refusés (le texte d'origine), et une fois acceptés (le « + » reste, sans sa marque).
  const REFUSED_ADDS = n => Array.from({ length: n }, (_, i) => '<p>L' + i + '</p>').join('');
  const ACCEPTED_ADDS = n => Array.from({ length: n }, (_, i) => '<p>L' + i + '+</p>').join('');
  // Trois cents suppressions et trois cents ajouts, mêlés : le travail d'une tranche touche les deux.
  const MIXED = n => Array.from({ length: n }, (_, i) => '<p>D' + i + '<del data-id="' + (2 * i + 1) + '">x</del>E' + i + '<ins data-id="' + (2 * i + 2) + '">y</ins></p>').join('');

  async function fresh(h, html) {
    await h.resetEditor();
    if (Editor.isTrackChangesOn()) Editor.setTrackChanges(false);
    Editor.setHTML(html);
    await h.sleep(300);
  }
  async function leave(h) {
    if (Editor.isTrackChangesOn()) Editor.setTrackChanges(false);
    await h.resetEditor();
  }
  // Position du `offset`-ième caractère du premier texte qui contient `text` ; le curseur posé comme le fait un clic (le focus d'abord : les barres se mettent à jour sur la transaction de sélection).
  function textPos(text, offset) {
    let pos = -1;
    ed().state.doc.descendants((node, p) => { if (pos < 0 && node.isText && node.text.includes(text)) pos = p + node.text.indexOf(text) + offset; });
    if (pos < 0) throw new Error('texte « ' + text + ' » introuvable');
    return pos;
  }
  async function caretIn(h, text, offset) {
    ed().view.focus();
    ed().view.dispatch(ed().state.tr.setSelection(EditorCore.getTextSelectionClass().create(ed().state.doc, textPos(text, offset))));
    await h.sleep(150);
  }

  cases.push({
    id: 'undo_suggestions_accept_all_over_several_slices_is_one_undo_step',
    description: 'Quatre cent cinquante ajouts en attente (trois tranches de « Tout accepter ») : UN Ctrl + Z les rend tous, UN Ctrl + Y les accepte tous, et Annuler n\'a plus rien derrière',
    run: async (h) => {
      const problems = [];
      const start = ACCEPTED_ADDS(450);
      await fresh(h, ADDS(450));
      const before = Editor.getHTML();
      check(problems, 'au départ, ajouts en attente', insertions(), 450);
      check(problems, 'au départ, rien à défaire', ed().can().undo(), false);
      acceptAll();
      await h.sleep(400);
      check(problems, 'après « Tout accepter », plus aucun ajout en attente', insertions(), 0);
      check(problems, 'après « Tout accepter », le texte est gardé', Editor.getHTML(), start);
      undo();
      await h.sleep(400);
      check(problems, 'UN Ctrl + Z rend les 450 ajouts', insertions(), 450);
      check(problems, 'UN Ctrl + Z rend le document d\'avant', Editor.getHTML(), before);
      check(problems, 'il ne reste rien à défaire derrière', ed().can().undo(), false);
      redo();
      await h.sleep(400);
      check(problems, 'UN Ctrl + Y les accepte tous', insertions(), 0);
      check(problems, 'UN Ctrl + Y, le texte', Editor.getHTML(), start);
      check(problems, 'il ne reste rien à rétablir derrière', ed().can().redo(), false);
      await leave(h);
      return verdict(problems, 'Tout accepter sur trois tranches = un pas');
    },
  });

  cases.push({
    id: 'undo_suggestions_reject_all_over_several_slices_is_one_undo_step',
    description: 'Quatre cent cinquante ajouts en attente (trois tranches de « Tout refuser ») : UN Ctrl + Z les rend tous, UN Ctrl + Y les refuse tous',
    run: async (h) => {
      const problems = [];
      const start = REFUSED_ADDS(450);
      await fresh(h, ADDS(450));
      const before = Editor.getHTML();
      rejectAll();
      await h.sleep(400);
      check(problems, 'après « Tout refuser », plus aucun ajout', insertions(), 0);
      check(problems, 'après « Tout refuser », le texte d\'origine', Editor.getHTML(), start);
      undo();
      await h.sleep(400);
      check(problems, 'UN Ctrl + Z rend les 450 ajouts', insertions(), 450);
      check(problems, 'UN Ctrl + Z rend le document d\'avant', Editor.getHTML(), before);
      check(problems, 'il ne reste rien à défaire derrière', ed().can().undo(), false);
      redo();
      await h.sleep(400);
      check(problems, 'UN Ctrl + Y les refuse tous', insertions(), 0);
      check(problems, 'UN Ctrl + Y, le texte', Editor.getHTML(), start);
      await leave(h);
      return verdict(problems, 'Tout refuser sur trois tranches = un pas');
    },
  });

  cases.push({
    id: 'undo_suggestions_deletions_and_additions_mixed_across_slices_come_back_whole',
    description: 'Trois cents suppressions et trois cents ajouts mêlés : « Tout accepter » puis un Ctrl + Z, « Tout refuser » puis un Ctrl + Z rendent chaque fois exactement le document d\'avant',
    run: async (h) => {
      const problems = [];
      await fresh(h, MIXED(300));
      const before = Editor.getHTML();
      check(problems, 'au départ', [deletions(), insertions()], [300, 300]);
      acceptAll();
      await h.sleep(400);
      check(problems, 'après « Tout accepter », rien en attente', [deletions(), insertions()], [0, 0]);
      check(problems, 'après « Tout accepter », les suppressions sont faites et les ajouts gardés', Editor.getHTML().includes('<p>D0E0y</p>'), true);
      undo();
      await h.sleep(400);
      check(problems, 'UN Ctrl + Z après « Tout accepter » rend le document d\'avant', Editor.getHTML() === before, true);
      check(problems, 'rien à défaire derrière', ed().can().undo(), false);
      rejectAll();
      await h.sleep(400);
      check(problems, 'après « Tout refuser », rien en attente', [deletions(), insertions()], [0, 0]);
      check(problems, 'après « Tout refuser », les suppressions sont gardées et les ajouts retirés', Editor.getHTML().includes('<p>D0xE0</p>'), true);
      undo();
      await h.sleep(400);
      check(problems, 'UN Ctrl + Z après « Tout refuser » rend le document d\'avant', Editor.getHTML() === before, true);
      check(problems, 'rien à défaire derrière', ed().can().undo(), false);
      await leave(h);
      return verdict(problems, 'suppressions et ajouts mêlés : le document d\'avant revient en un pas');
    },
  });

  cases.push({
    id: 'undo_suggestions_reject_all_with_paragraph_settings_after_a_full_slice_is_one_undo_step',
    description: 'Deux cents ajouts (la première tranche est pleine), puis deux paragraphes alignés à droite : « Tout refuser » défait le texte puis les réglages ; UN Ctrl + Z rend les deux ensemble',
    run: async (h) => {
      const problems = [];
      const tail = '<p>Un</p>' + Array.from({ length: 25 }, () => '<p>' + 'x'.repeat(100) + '</p>').join('') + '<p>Deux</p>';
      await fresh(h, ADDS(200) + tail);
      Editor.setTrackChanges(true);
      await h.sleep(100);
      for (const text of ['Un', 'Deux']) {
        await caretIn(h, text, 2);
        ed().chain().focus().setTextAlign('right').run();
        await h.sleep(120);
      }
      const before = Editor.getHTML();
      check(problems, 'au départ', [insertions(), modifications()], [200, 2]);
      rejectAll();
      await h.sleep(400);
      check(problems, 'après « Tout refuser », le texte et les alignements d\'origine', [Editor.getHTML() === REFUSED_ADDS(200) + tail, Editor.hasPendingTrackedChanges()], [true, false]);
      undo();
      await h.sleep(400);
      check(problems, 'UN Ctrl + Z rend les 200 ajouts ET les deux réglages', [insertions(), modifications()], [200, 2]);
      check(problems, 'UN Ctrl + Z rend le document d\'avant', Editor.getHTML() === before, true);
      redo();
      await h.sleep(400);
      check(problems, 'UN Ctrl + Y les refuse tous', [Editor.getHTML() === REFUSED_ADDS(200) + tail, Editor.hasPendingTrackedChanges()], [true, false]);
      await leave(h);
      return verdict(problems, 'tranches puis réglages = un pas');
    },
  });

  cases.push({
    id: 'undo_suggestions_the_menu_rows_and_the_undo_button_do_the_same',
    description: 'Les lignes « Tout accepter » et « Tout refuser » du menu d\'édition collaborative, puis le bouton Annuler de la barre : un seul pas pour 450 modifications',
    run: async (h) => {
      const problems = [];
      await fresh(h, ADDS(450));
      const before = Editor.getHTML();
      for (const [row, label] of [['v2-btn-accept-all', 'Tout accepter'], ['v2-btn-reject-all', 'Tout refuser']]) {
        await h.clickButton(row);
        await h.sleep(500);
        check(problems, label + ', plus aucun ajout en attente', insertions(), 0);
        check(problems, label + ', il y a un pas à défaire', ed().can().undo(), true);
        await h.clickButton('v2-btn-undo');
        await h.sleep(500);
        check(problems, label + ', le bouton Annuler rend les 450 ajouts', insertions(), 450);
        check(problems, label + ', le bouton Annuler rend le document d\'avant', Editor.getHTML() === before, true);
        check(problems, label + ', rien à défaire derrière', ed().can().undo(), false);
        check(problems, label + ', il y a un pas à rétablir', ed().can().redo(), true);
        await h.clickButton('v2-btn-redo');
        await h.sleep(500);
        check(problems, label + ', le bouton Rétablir les résout tous', insertions(), 0);
        await h.clickButton('v2-btn-undo');
        await h.sleep(500);
      }
      await leave(h);
      return verdict(problems, 'menu et boutons : un pas');
    },
  });

  cases.push({
    id: 'undo_suggestions_a_column_added_over_two_hundred_rows_is_resolved_whole_and_undone_whole',
    description: 'Un tableau de 250 lignes, une colonne ajoutée avec le suivi (250 cases en attente, plus qu\'une tranche) : « Tout refuser » rend les deux colonnes d\'avant sans case vide ajoutée, « Tout accepter » garde les trois, un Ctrl + Z rend chaque fois la colonne en attente',
    run: async (h) => {
      const problems = [];
      const rows = Array.from({ length: 250 }, (_, i) => '<tr><td><p>a' + i + '</p></td><td><p>b' + i + '</p></td></tr>').join('');
      const cellsPerRow = () => Array.from(document.querySelectorAll('.tiptap tr')).map(tr => tr.querySelectorAll('td, th').length);
      const shape = () => { const c = cellsPerRow(); return [c.length, Math.min(...c), Math.max(...c)]; };
      const empties = () => Array.from(document.querySelectorAll('.tiptap td, .tiptap th')).filter(td => !td.textContent.trim()).length;
      await fresh(h, '<table><tbody>' + rows + '</tbody></table><p>Après</p>');
      await caretIn(h, 'b0', 1);
      Editor.setTrackChanges(true);
      await h.sleep(150);
      const button = document.querySelector('.v2-floating-toolbar button[data-action="col-before"]');
      if (!button) throw new Error('la barre du tableau n\'est pas là');
      button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      await h.sleep(500);
      const pending = Editor.getHTML();
      check(problems, 'au départ, une colonne en attente : 250 lignes de trois cases', shape(), [250, 3, 3]);
      check(problems, 'au départ, des modifications en attente', Editor.hasPendingTrackedChanges(), true);
      rejectAll();
      await h.sleep(600);
      check(problems, 'après « Tout refuser », 250 lignes de deux cases, aucune case vide ajoutée', [shape(), empties(), Editor.hasPendingTrackedChanges()], [[250, 2, 2], 0, false]);
      undo();
      await h.sleep(600);
      check(problems, 'UN Ctrl + Z après « Tout refuser » rend la colonne en attente', [shape(), Editor.getHTML() === pending], [[250, 3, 3], true]);
      acceptAll();
      await h.sleep(600);
      check(problems, 'après « Tout accepter », 250 lignes de trois cases, aucune case vide', [shape(), empties(), Editor.hasPendingTrackedChanges()], [[250, 3, 3], 250, false]);
      undo();
      await h.sleep(600);
      check(problems, 'UN Ctrl + Z après « Tout accepter » rend la colonne en attente', [shape(), Editor.getHTML() === pending], [[250, 3, 3], true]);
      await leave(h);
      return verdict(problems, 'un tableau plus grand qu\'une tranche se résout et se défait d\'un bloc');
    },
  });

  cases.push({
    id: 'undo_suggestions_what_is_typed_right_after_stays_its_own_step',
    description: 'Après « Tout accepter » (trois tranches), un mot tapé reste un pas à part : un premier Ctrl + Z le retire, un second rend les 450 ajouts',
    run: async (h) => {
      const problems = [];
      await fresh(h, ADDS(450));
      const before = Editor.getHTML();
      acceptAll();
      await h.sleep(900);
      await caretIn(h, 'L0', 2);
      await h.typeText('motajoute');
      await h.sleep(300);
      check(problems, 'le mot est tapé', ed().state.doc.textContent.includes('motajoute'), true);
      undo();
      await h.sleep(400);
      check(problems, 'un premier Ctrl + Z retire le mot et laisse les ajouts acceptés', [ed().state.doc.textContent.includes('motajoute'), insertions()], [false, 0]);
      undo();
      await h.sleep(400);
      check(problems, 'un second Ctrl + Z rend les 450 ajouts', [insertions(), Editor.getHTML() === before], [450, true]);
      await leave(h);
      return verdict(problems, 'la frappe après la commande est un pas à part');
    },
  });

  cases.push({
    id: 'undo_suggestions_resolving_all_keeps_the_automatic_links_and_leaves_the_tiptap_delete_event_out',
    description: 'Ni « Tout accepter » ni « Tout refuser » ne font partir l\'événement `delete` de Tiptap (que rien n\'écoute, et que Tiptap calcule au carré du nombre d\'étapes de leur transaction unique) ; ils gardent la création automatique de liens d\'avant (une adresse qu\'ils laissent suivie d\'une espace devient un lien, sur toutes les tranches), et UN Ctrl + Z rend les 450 ajouts ; ailleurs, retirer une marque fait toujours partir l\'événement',
    run: async (h) => {
      const problems = [];
      const links = () => (Editor.getHTML().match(/<a /g) || []).length;
      const seen = [];
      const onDelete = event => seen.push(event.type);
      // L'événement part dans une tâche qui suit la transaction : on l'attend avant de compter.
      async function countDeletes(run) {
        seen.length = 0;
        ed().on('delete', onDelete);
        run();
        await h.sleep(300);
        ed().off('delete', onDelete);
        return seen.length;
      }
      const page = '<p>voir <ins data-id="1">www.exemple.fr </ins>fin</p><p>L<ins data-id="2">+</ins></p>';
      await fresh(h, page);
      check(problems, 'au départ, deux ajouts en attente et aucun lien', [insertions(), links()], [2, 0]);
      check(problems, '« Tout accepter » : aucun événement `delete`', await countDeletes(acceptAll), 0);
      check(problems, '« Tout accepter » : plus d\'ajout en attente, et l\'adresse suivie d\'une espace est devenue un lien (comme avant)', [insertions(), links()], [0, 1]);
      await fresh(h, page);
      check(problems, '« Tout refuser » : aucun événement `delete`', await countDeletes(rejectAll), 0);
      check(problems, '« Tout refuser » : plus d\'ajout en attente', insertions(), 0);
      // Une suppression refusée rend son texte : l'adresse redevient un lien.
      await fresh(h, '<p>avant <del data-id="1">www.exemple.fr </del>après</p>');
      rejectAll();
      await h.sleep(300);
      check(problems, '« Tout refuser » rend l\'adresse supprimée, et son lien', [deletions(), links()], [0, 1]);
      // Quatre cent cinquante adresses, trois tranches : un lien chacune, et UN Ctrl + Z rend les ajouts (les liens, eux, sont ceux que le plugin de liens de Tiptap refait sur le texte que l'annulation rend : il lit toute transaction).
      const addresses = Array.from({ length: 450 }, (_, i) => '<p>t' + i + ' <ins data-id="' + (i + 1) + '">site' + i + '.fr </ins>x</p>').join('');
      await fresh(h, addresses);
      acceptAll();
      await h.sleep(500);
      check(problems, '450 adresses acceptées : un lien chacune, aucun ajout en attente', [links(), insertions()], [450, 0]);
      undo();
      await h.sleep(400);
      check(problems, 'UN Ctrl + Z rend les 450 ajouts en attente, et Annuler n\'a plus rien derrière', [TrackChanges.collectPendingIds(ed().state).size, ed().can().undo()], [450, false]);
      // Le filtre ne vise que ces commandes : retirer le gras d'un mot fait toujours partir l'événement.
      await fresh(h, '<p><strong>gras</strong> et le reste</p>');
      const bold = ed().schema.marks.bold;
      if (!bold) throw new Error('la marque « gras » est introuvable');
      check(problems, 'retirer le gras fait toujours partir l\'événement `delete` (type « mark »)', (await countDeletes(() => ed().view.dispatch(ed().state.tr.removeMark(1, 5, bold)))) > 0 && seen.includes('mark'), true);
      await leave(h);
      return verdict(problems, 'liens gardés, pas d\'événement `delete` pour la résolution en bloc, l\'événement part ailleurs');
    },
  });

  return cases;
})();
