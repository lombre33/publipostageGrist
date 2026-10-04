// Suite "floatingKeys" - Retour arrière et Suppr n'emportent plus une image en calque (demande d'Antoine du 04/10 : « des fois je veux supprimer une ligne et ça me supprime l'image à proximité »,
// puis « important ! l'image est une image importée via une colonne PJ »). Une image devant ou derrière le texte se place par sa grille de page : le paragraphe qui la porte n'est qu'une ancre sans
// largeur, que l'écran ne montre pas. Avant, la touche qui effaçait la ligne d'à côté effaçait aussi l'ancre - donc l'image : Retour arrière dans la ligne qui ne porte qu'elle (elle semble vide),
// Retour arrière ou Suppr juste après ou avant une ancre déjà jointe à une ligne, et un texte sélectionné qui la contient (triple clic sur la ligne). Maintenant (createFloatingImageKeysExtension de
// js/editor-nodes.js) : curseur seul, la touche passe par-dessus l'ancre et suit son cours (la ligne vide se joint à la précédente, l'image avec elle) ; texte sélectionné, le texte part et l'image est
// reposée là où la sélection se referme. Une image sélectionnée, tout le document sélectionné et le suivi des modifications gardent leur comportement.
// Une frappe synthétique ne déclenche pas l'effacement natif du navigateur (un caractère, un mot) : les scénarios lisent donc ce que ProseMirror fait lui-même (joindre deux lignes, passer par-dessus
// une ancre, supprimer une sélection). Le vrai clavier et la vraie souris à 700x400, image d'un fichier et image PJ, devant et derrière, en clair et en sombre : dev-tests/verify-floating-image-keys-mouse.mjs.
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const ed = () => EditorCore.getEditor();
  const DATA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const PJ_ATTRS = ' data-var-table="Clients" data-var-column="Photo" data-var-key="Clients.Photo"';
  // Les quatre images en calque d'Antoine : d'un fichier ou d'une colonne PJ, devant ou derrière le texte. La grille de page (data-page-*) est celle d'une image posée à la souris.
  const KINDS = [
    { label: 'image d\'un fichier, devant le texte', layer: 'front', pj: false },
    { label: 'image d\'un fichier, derrière le texte', layer: 'behind', pj: false },
    { label: 'image PJ, devant le texte', layer: 'front', pj: true },
    { label: 'image PJ, derrière le texte', layer: 'behind', pj: true },
  ];
  function floating(kind, left) {
    const x = left == null ? 380 : left;
    return '<img class="editor-image" src="' + (kind.pj ? '' : DATA) + '" alt="" style="width: 120px; ' + (kind.pj ? 'height: 90px; ' : '') + 'position: absolute; left: ' + x + 'px; top: 120px; z-index: '
      + (kind.layer === 'front' ? 5 : -1) + ';" data-layer="' + kind.layer + '" data-wrap="inline" data-page-index="0" data-page-left-pt="' + Math.round(x * 0.75) + '" data-page-top-pt="90"' + (kind.pj ? PJ_ATTRS : '') + '>';
  }
  const classic = '<img class="editor-image" src="' + DATA + '" alt="" style="width: 60px" data-layer="normal" data-wrap="inline">';

  function isFloating(node) { return node.type.name === 'editorImage' && node.attrs.layer !== 'normal'; }
  function tokenOf(node) {
    if (node.isText) return node.text;
    if (node.type.name === 'editorImage') return '⟨' + (node.attrs.layer === 'normal' ? 'classique' : (node.attrs.varTable ? 'PJ' : 'image') + ':' + node.attrs.layer) + '⟩';
    return '⟨' + node.type.name + '⟩';
  }
  // Le document en une ligne par paragraphe, chaque image à sa place dans la ligne : « Titre⟨image:front⟩ | Ligne A ».
  function summary() {
    const lines = [];
    ed().state.doc.forEach(block => {
      if (block.type.name !== 'paragraph') { lines.push('<' + block.type.name + '>'); return; }
      let line = '';
      block.forEach(child => { line += tokenOf(child); });
      lines.push(line);
    });
    return lines.join(' | ');
  }
  function floatingImages() {
    const found = [];
    ed().state.doc.descendants((node, pos) => { if (isFloating(node)) found.push({ pos, attrs: Object.assign({}, node.attrs) }); });
    return found;
  }
  const imageCount = () => { let n = 0; ed().state.doc.descendants(node => { if (node.type.name === 'editorImage') n++; }); return n; };
  // Le contenu du paragraphe de rang i (de 0) : sa position de début et de fin.
  function paragraphRange(i) {
    let found = null;
    ed().state.doc.forEach((block, offset, index) => { if (index === i) found = { start: offset + 1, end: offset + 1 + block.content.size }; });
    return found;
  }
  // La position juste avant (ou juste après) la première image en calque du paragraphe de rang i.
  function anchorEdge(i, side) {
    const range = paragraphRange(i);
    let found = null;
    ed().state.doc.nodesBetween(range.start, range.end, (node, pos) => { if (found == null && isFloating(node)) found = side === 'before' ? pos : pos + node.nodeSize; });
    return found;
  }
  function caretAt(pos) {
    ed().commands.setTextSelection(pos);
    ed().view.focus();
  }
  function selectText(from, to) {
    ed().commands.setTextSelection({ from, to });
    ed().view.focus();
  }
  function press(key, mods) {
    document.querySelector('.tiptap').dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key, bubbles: true, cancelable: true }, mods || {})));
  }
  async function setDoc(h, html) {
    await h.resetEditor();
    Editor.setHTML(html);
    await sleep(120);
  }
  // Les attributs d'une image en calque qui la placent sur la page : ils ne changent jamais quand son ancre change de ligne.
  const placement = image => JSON.stringify([image.attrs.layer, image.attrs.left, image.attrs.top, image.attrs.pageIndex, image.attrs.pageLeftPt, image.attrs.pageTopPt, image.attrs.varKey, image.attrs.width]);

  cases.push({
    id: 'floating_keys_backspace_in_a_line_holding_only_an_image_joins_it_to_the_line_above_and_keeps_the_image',
    description: 'Retour arrière dans la ligne qui ne porte qu\'une image en calque (elle semble vide) la joint à la ligne d\'avant, l\'image avec elle et à la même place sur la page : elle ne part plus avec la ligne (image d\'un fichier ou PJ, devant ou derrière)',
    run: async (h) => {
      const problems = [];
      for (const kind of KINDS) {
        await setDoc(h, '<p>Titre</p><p>' + floating(kind) + '</p><p>Ligne A</p>');
        const before = floatingImages()[0];
        caretAt(anchorEdge(1, 'after'));
        press('Backspace');
        await sleep(60);
        const after = floatingImages();
        const sum = summary();
        const wanted = 'Titre⟨' + (kind.pj ? 'PJ' : 'image') + ':' + kind.layer + '⟩ | Ligne A';
        if (sum !== wanted) problems.push(kind.label + ' : ' + sum + ' (attendu ' + wanted + ')');
        if (after.length !== 1 || placement(after[0]) !== placement(before)) problems.push(kind.label + ' : l\'image a changé de place ou n\'est plus là (' + after.length + ' image(s))');
        if (document.querySelectorAll('.tiptap .editor-image-view').length !== 1) problems.push(kind.label + ' : ' + document.querySelectorAll('.tiptap .editor-image-view').length + ' vue(s) d\'image dans l\'éditeur (1 attendue)');
      }
      return { pass: problems.length === 0, notes: JSON.stringify(problems) };
    },
  });

  cases.push({
    id: 'floating_keys_delete_before_a_line_holding_only_an_image_joins_the_next_line_and_keeps_the_image',
    description: 'Suppr au début de la ligne qui ne porte qu\'une image en calque (avant l\'ancre) passe par-dessus et joint la ligne d\'après : l\'image reste, comme tout le texte',
    run: async (h) => {
      const problems = [];
      for (const kind of KINDS) {
        await setDoc(h, '<p>Titre</p><p>' + floating(kind) + '</p><p>Ligne A</p>');
        const before = floatingImages()[0];
        caretAt(anchorEdge(1, 'before'));
        press('Delete');
        await sleep(60);
        const after = floatingImages();
        const sum = summary();
        const wanted = 'Titre | ⟨' + (kind.pj ? 'PJ' : 'image') + ':' + kind.layer + '⟩Ligne A';
        if (sum !== wanted) problems.push(kind.label + ' : ' + sum + ' (attendu ' + wanted + ')');
        if (after.length !== 1 || placement(after[0]) !== placement(before)) problems.push(kind.label + ' : l\'image a changé de place ou n\'est plus là (' + after.length + ' image(s))');
      }
      return { pass: problems.length === 0, notes: JSON.stringify(problems) };
    },
  });

  // Les bords de la première et de la dernière image en calque du paragraphe de rang i.
  function edgesOf(i) {
    const range = paragraphRange(i);
    const edges = {};
    ed().state.doc.nodesBetween(range.start, range.end, (node, pos) => {
      if (!isFloating(node)) return;
      if (!edges.first) edges.first = { before: pos, after: pos + node.nodeSize };
      edges.last = { before: pos, after: pos + node.nodeSize };
    });
    return edges;
  }

  cases.push({
    id: 'floating_keys_a_caret_next_to_an_image_in_a_line_of_text_steps_over_it',
    description: 'Retour arrière juste après une ancre (ou Suppr juste avant) dans une ligne de texte : le curseur passe de l\'autre côté de l\'ancre et la touche suit son cours (c\'est alors le caractère voisin que le navigateur efface) ; deux ancres collées sont toutes deux enjambées, avec ou sans Ctrl',
    run: async (h) => {
      const problems = [];
      const front = KINDS[0];
      const behindPj = KINDS[3];
      // `caret` et `wanted` lisent les bords des ancres du paragraphe 1 : le curseur part de `caret`, il doit arriver en `wanted` ; aucune image ne disparaît.
      const check = async (label, html, key, mods, caret, wanted) => {
        await setDoc(h, html);
        const edges = edgesOf(1);
        caretAt(caret(edges));
        press(key, mods);
        await sleep(40);
        const at = ed().state.selection.from;
        if (at !== wanted(edges)) problems.push(label + ' : curseur en ' + at + ' (' + wanted(edges) + ' attendu)');
        if (imageCount() !== html.split('<img').length - 1) problems.push(label + ' : une image a disparu (' + imageCount() + ')');
      };
      const afterLast = e => e.last.after;
      const beforeFirst = e => e.first.before;
      await check('Retour arrière après une ancre en fin de ligne', '<p>Titre</p><p>Ligne A' + floating(front) + '</p><p>Ligne B</p>', 'Backspace', null, afterLast, beforeFirst);
      await check('Retour arrière après une ancre au milieu du texte', '<p>Titre</p><p>Ligne ' + floating(front) + 'A</p><p>Ligne B</p>', 'Backspace', null, afterLast, beforeFirst);
      await check('Suppr avant une ancre au milieu du texte', '<p>Titre</p><p>Ligne ' + floating(front) + 'A</p><p>Ligne B</p>', 'Delete', null, beforeFirst, afterLast);
      await check('Retour arrière après deux ancres collées', '<p>Titre</p><p>Ligne A' + floating(front) + floating(behindPj, 200) + 'B</p>', 'Backspace', null, e => e.last.after, beforeFirst);
      await check('Suppr avant deux ancres collées', '<p>Titre</p><p>Ligne A' + floating(front) + floating(behindPj, 200) + 'B</p>', 'Delete', null, beforeFirst, afterLast);
      await check('Ctrl + Retour arrière après une ancre', '<p>Titre</p><p>Ligne A' + floating(front) + 'B</p>', 'Backspace', { ctrlKey: true }, afterLast, beforeFirst);
      await check('Ctrl + Suppr avant une ancre', '<p>Titre</p><p>Ligne A' + floating(front) + 'B</p>', 'Delete', { ctrlKey: true }, beforeFirst, afterLast);
      return { pass: problems.length === 0, notes: JSON.stringify(problems) };
    },
  });

  cases.push({
    id: 'floating_keys_deleting_selected_text_that_holds_an_image_keeps_the_image',
    description: 'Un texte sélectionné qui contient l\'ancre d\'une image en calque (triple clic sur la ligne, Maj + flèches sur plusieurs lignes) : Retour arrière et Suppr effacent le texte, l\'image reste là où la sélection se referme, à la même place sur la page ; Annuler rend tout le texte en une étape',
    run: async (h) => {
      const problems = [];
      for (const kind of KINDS) {
        for (const key of ['Backspace', 'Delete']) {
          const label = kind.label + ', ' + key;
          // Une ligne et son ancre (triple clic).
          await setDoc(h, '<p>Titre</p><p>Ligne A' + floating(kind) + '</p><p>Ligne B</p>');
          const before = floatingImages()[0];
          const range = paragraphRange(1);
          selectText(range.start, range.end);
          press(key);
          await sleep(60);
          let after = floatingImages();
          let sum = summary();
          const token = '⟨' + (kind.pj ? 'PJ' : 'image') + ':' + kind.layer + '⟩';
          if (sum !== 'Titre | ' + token + ' | Ligne B') problems.push(label + ', une ligne : ' + sum);
          if (after.length !== 1 || placement(after[0]) !== placement(before)) problems.push(label + ', une ligne : l\'image a changé de place ou n\'est plus là (' + after.length + ')');
          // Sans texte devant lui, le curseur passe derrière l'ancre : devant elle, le navigateur enverrait la frappe au bout de la ligne du dessus (verify-floating-image-keys-mouse.mjs le joue au vrai clavier).
          if (ed().state.selection.from !== paragraphRange(1).end) problems.push(label + ', une ligne : le curseur n\'est pas derrière l\'ancre, au bout de la ligne (' + ed().state.selection.from + ')');
          // Plusieurs lignes, de la fin du titre au début de « Ligne B » : le titre et la ligne B se joignent, l'image est reposée au point de jonction.
          await setDoc(h, '<p>Titre</p><p>Ligne A' + floating(kind) + '</p><p>Ligne B</p>');
          selectText(paragraphRange(0).end, paragraphRange(2).start);
          press(key);
          await sleep(60);
          after = floatingImages();
          sum = summary();
          if (sum !== 'Titre' + token + 'Ligne B') problems.push(label + ', plusieurs lignes : ' + sum);
          if (after.length !== 1) problems.push(label + ', plusieurs lignes : ' + after.length + ' image(s)');
          // Annuler : tout le texte, une seule image, une seule étape.
          ed().commands.undo();
          await sleep(60);
          if (summary() !== 'Titre | Ligne A' + token + ' | Ligne B') problems.push(label + ', Annuler : ' + summary());
          if (imageCount() !== 1) problems.push(label + ', Annuler : ' + imageCount() + ' image(s)');
        }
      }
      return { pass: problems.length === 0, notes: JSON.stringify(problems) };
    },
  });

  cases.push({
    id: 'floating_keys_two_images_in_a_selected_line_both_stay_in_order',
    description: 'Deux images en calque dans le texte sélectionné : elles sont reposées toutes deux, dans leur ordre, l\'une derrière l\'autre',
    run: async (h) => {
      await setDoc(h, '<p>Titre</p><p>Ligne ' + floating(KINDS[0], 100) + 'A' + floating(KINDS[3], 300) + '</p><p>Ligne B</p>');
      const before = floatingImages().map(i => placement(i));
      const range = paragraphRange(1);
      selectText(range.start, range.end);
      press('Backspace');
      await sleep(60);
      const after = floatingImages().map(i => placement(i));
      const sum = summary();
      const pass = sum === 'Titre | ⟨image:front⟩⟨PJ:behind⟩ | Ligne B' && JSON.stringify(after) === JSON.stringify(before);
      return { pass, notes: JSON.stringify({ sum, before, after }) };
    },
  });

  cases.push({
    id: 'floating_keys_an_image_selected_on_its_own_and_the_whole_document_still_go',
    description: 'Ce qui doit partir part : l\'image sélectionnée (clic ou poignée) s\'efface par Retour arrière comme par Suppr sans toucher au texte ; Ctrl + A puis Suppr vide tout le document ; un texte qui couvre tout le contenu aussi',
    run: async (h) => {
      const problems = [];
      for (const kind of KINDS) {
        for (const key of ['Backspace', 'Delete']) {
          await setDoc(h, '<p>Titre</p><p>Ligne A' + floating(kind) + '</p><p>Ligne B</p>');
          ed().commands.setNodeSelection(anchorEdge(1, 'before'));
          ed().view.focus();
          press(key);
          await sleep(60);
          if (summary() !== 'Titre | Ligne A | Ligne B') problems.push(kind.label + ', ' + key + ' sur l\'image sélectionnée : ' + summary());
        }
        await setDoc(h, '<p>Titre</p><p>Ligne A' + floating(kind) + '</p><p>Ligne B</p>');
        ed().commands.selectAll();
        ed().view.focus();
        press('Backspace');
        await sleep(60);
        if (imageCount() !== 0 || ed().state.doc.textContent !== '') problems.push(kind.label + ', Ctrl + A puis Retour arrière : ' + summary());
        await setDoc(h, '<p>Titre</p><p>Ligne A' + floating(kind) + '</p><p>Ligne B</p>');
        const first = paragraphRange(0).start;
        const last = paragraphRange(2).end;
        selectText(first, last);
        press('Delete');
        await sleep(60);
        if (imageCount() !== 0 || ed().state.doc.textContent !== '') problems.push(kind.label + ', tout le texte puis Suppr : ' + summary());
      }
      return { pass: problems.length === 0, notes: JSON.stringify(problems) };
    },
  });

  cases.push({
    id: 'floating_keys_images_in_the_flow_and_other_selections_keep_their_behaviour',
    description: 'Une image au fil du texte (classique) n\'est pas concernée : la touche ne déplace pas le curseur ; sans ancre, un texte sélectionné s\'efface comme avant ; le suivi des modifications actif garde la gestion de la bibliothèque (le curseur ne bouge pas)',
    run: async (h) => {
      const problems = [];
      await setDoc(h, '<p>Titre</p><p>Ligne A' + classic + '</p><p>Ligne B</p>');
      const range = paragraphRange(1);
      caretAt(range.end);
      press('Backspace');
      await sleep(40);
      if (ed().state.selection.from !== range.end) problems.push('image classique : le curseur a bougé (' + ed().state.selection.from + ' au lieu de ' + range.end + ')');
      selectText(range.start, range.start + 4);
      press('Backspace');
      await sleep(40);
      if (summary() !== 'Titre | e A⟨classique⟩ | Ligne B') problems.push('texte sélectionné sans ancre : ' + summary());
      if (imageCount() !== 1) problems.push('texte sélectionné sans ancre : ' + imageCount() + ' image(s)');
      await setDoc(h, '<p>Titre</p><p>' + floating(KINDS[0]) + '</p><p>Ligne A</p>');
      Editor.setTrackChanges(true);
      await sleep(80);
      const edge = anchorEdge(1, 'after');
      caretAt(edge);
      press('Backspace');
      await sleep(60);
      if (ed().state.selection.from !== edge) problems.push('suivi des modifications : le curseur a bougé (' + ed().state.selection.from + ' au lieu de ' + edge + ')');
      Editor.setTrackChanges(false);
      await sleep(60);
      return { pass: problems.length === 0, notes: JSON.stringify(problems) };
    },
  });

  // --- Texte tapé, Entrée, collé ou effacé d'un coup sur un texte qui porte l'ancre (troisième envoi du même sujet) ---
  const tokenFor = kind => '⟨' + (kind.pj ? 'PJ' : 'image') + ':' + kind.layer + '⟩';
  // Une lettre tapée sur la sélection : ce que ProseMirror fait lui-même (handleTextInput), sans que le navigateur lise le DOM. Le vrai clavier est joué par verify-floating-image-keys-mouse.mjs.
  const typeOver = text => { const { from, to } = ed().state.selection; ed().view.dispatch(ed().state.tr.insertText(text, from, to)); };
  const selectLine = i => { const range = paragraphRange(i); selectText(range.start, range.end); };

  cases.push({
    id: 'floating_keys_text_typed_over_a_selected_line_that_holds_an_image_keeps_the_image',
    description: 'Une lettre tapée sur une ligne sélectionnée (triple clic) qui porte l\'ancre d\'une image en calque, ou sur plusieurs lignes : le texte est remplacé, l\'image reste à la même place sur la page, derrière le texte tapé ; la lettre suivante se joint à la première ; Annuler rend tout en une étape, Rétablir aussi',
    run: async (h) => {
      const problems = [];
      for (const kind of KINDS) {
        const token = tokenFor(kind);
        await setDoc(h, '<p>Titre</p><p>Ligne A' + floating(kind) + '</p><p>Ligne B</p>');
        const before = floatingImages()[0];
        selectLine(1);
        typeOver('x');
        await sleep(60);
        let after = floatingImages();
        if (summary() !== 'Titre | x' + token + ' | Ligne B') problems.push(kind.label + ', une ligne : ' + summary());
        if (after.length !== 1 || placement(after[0]) !== placement(before)) problems.push(kind.label + ', une ligne : l\'image a changé de place ou n\'est plus là (' + after.length + ')');
        const caret = ed().state.selection;
        if (!caret.empty || caret.from !== paragraphRange(1).start + 1) problems.push(kind.label + ', une ligne : le curseur n\'est pas juste après la lettre tapée, devant l\'ancre (' + caret.from + '-' + caret.to + ')');
        typeOver('y');
        if (summary() !== 'Titre | xy' + token + ' | Ligne B') problems.push(kind.label + ', une seconde lettre : ' + summary());
        // Annuler et Rétablir : une étape chacun (la lettre tapée et l'image reposée sont une seule étape).
        await setDoc(h, '<p>Titre</p><p>Ligne A' + floating(kind) + '</p><p>Ligne B</p>');
        selectLine(1);
        typeOver('x');
        ed().commands.undo();
        await sleep(60);
        if (summary() !== 'Titre | Ligne A' + token + ' | Ligne B' || imageCount() !== 1) problems.push(kind.label + ', Annuler : ' + summary() + ' (' + imageCount() + ' image)');
        ed().commands.redo();
        await sleep(60);
        if (summary() !== 'Titre | x' + token + ' | Ligne B' || imageCount() !== 1) problems.push(kind.label + ', Rétablir : ' + summary() + ' (' + imageCount() + ' image)');
        // Plusieurs lignes, de la fin du titre au début de « Ligne B » : le titre et la ligne B se joignent autour de la lettre, l'image est reposée juste derrière elle.
        await setDoc(h, '<p>Titre</p><p>Ligne A' + floating(kind) + '</p><p>Ligne B</p>');
        selectText(paragraphRange(0).end, paragraphRange(2).start);
        typeOver('x');
        await sleep(60);
        after = floatingImages();
        if (summary() !== 'Titrex' + token + 'Ligne B' || after.length !== 1 || placement(after[0]) !== placement(before)) problems.push(kind.label + ', plusieurs lignes : ' + summary() + ' (' + after.length + ' image)');
      }
      return { pass: problems.length === 0, notes: JSON.stringify(problems) };
    },
  });

  cases.push({
    id: 'floating_keys_enter_and_paste_over_a_selected_line_that_holds_an_image_keep_the_image',
    description: 'Entrée, un texte collé, des paragraphes collés sur une ligne sélectionnée qui porte l\'ancre d\'une image en calque : l\'image reste ; après Entrée le curseur est dans la nouvelle ligne, derrière l\'ancre (devant elle, le navigateur enverrait la frappe à la ligne du dessus)',
    run: async (h) => {
      const problems = [];
      for (const kind of KINDS) {
        const token = tokenFor(kind);
        await setDoc(h, '<p>Titre</p><p>Ligne A' + floating(kind) + '</p><p>Ligne B</p>');
        const before = floatingImages()[0];
        selectLine(1);
        press('Enter');
        await sleep(60);
        let after = floatingImages();
        if (summary() !== 'Titre |  | ' + token + ' | Ligne B') problems.push(kind.label + ', Entrée : ' + summary());
        if (after.length !== 1 || placement(after[0]) !== placement(before)) problems.push(kind.label + ', Entrée : l\'image a changé de place ou n\'est plus là (' + after.length + ')');
        const caret = ed().state.selection;
        if (!caret.empty || caret.from !== paragraphRange(2).end) problems.push(kind.label + ', Entrée : le curseur n\'est pas derrière l\'ancre, dans la nouvelle ligne (' + caret.from + '-' + caret.to + ')');
        ed().commands.undo();
        await sleep(60);
        if (summary() !== 'Titre | Ligne A' + token + ' | Ligne B' || imageCount() !== 1) problems.push(kind.label + ', Entrée puis Annuler : ' + summary() + ' (' + imageCount() + ' image)');
        await setDoc(h, '<p>Titre</p><p>Ligne A' + floating(kind) + '</p><p>Ligne B</p>');
        selectLine(1);
        ed().view.pasteText('Collé');
        await sleep(60);
        after = floatingImages();
        if (summary() !== 'Titre | Collé' + token + ' | Ligne B' || after.length !== 1 || placement(after[0]) !== placement(before)) problems.push(kind.label + ', texte collé : ' + summary());
        await setDoc(h, '<p>Titre</p><p>Ligne A' + floating(kind) + '</p><p>Ligne B</p>');
        selectLine(1);
        ed().view.pasteHTML('<p>un</p><p>deux</p>');
        await sleep(60);
        after = floatingImages();
        if (summary() !== 'Titre | un | deux' + token + ' | Ligne B' || after.length !== 1 || placement(after[0]) !== placement(before)) problems.push(kind.label + ', paragraphes collés : ' + summary());
      }
      return { pass: problems.length === 0, notes: JSON.stringify(problems) };
    },
  });

  cases.push({
    id: 'floating_keys_two_images_in_replaced_text_both_come_back_in_order',
    description: 'Deux images en calque dans le texte remplacé : elles reviennent toutes deux, dans leur ordre, derrière le texte tapé ; une image classique dans le même texte part avec lui, comme avant',
    run: async (h) => {
      const problems = [];
      await setDoc(h, '<p>Titre</p><p>Ligne ' + floating(KINDS[0], 100) + 'A' + floating(KINDS[3], 300) + '</p><p>Ligne B</p>');
      const before = floatingImages().map(i => placement(i));
      selectLine(1);
      typeOver('x');
      await sleep(60);
      const after = floatingImages().map(i => placement(i));
      if (summary() !== 'Titre | x⟨image:front⟩⟨PJ:behind⟩ | Ligne B' || JSON.stringify(after) !== JSON.stringify(before)) problems.push('deux images : ' + summary() + ' ' + JSON.stringify({ before, after }));
      await setDoc(h, '<p>Titre</p><p>Ligne ' + classic + 'A' + floating(KINDS[0]) + '</p><p>Ligne B</p>');
      selectLine(1);
      typeOver('x');
      await sleep(60);
      if (summary() !== 'Titre | x⟨image:front⟩ | Ligne B' || imageCount() !== 1) problems.push('une image classique et une en calque : ' + summary() + ' (' + imageCount() + ' image)');
      return { pass: problems.length === 0, notes: JSON.stringify(problems) };
    },
  });

  cases.push({
    id: 'floating_keys_a_word_deleted_in_one_step_keeps_the_image_in_the_middle_of_it',
    description: 'Un mot effacé d\'un coup, curseur seul (Ctrl + Suppr, le navigateur efface « foo » et l\'ancre qui le suit) : l\'image reste au point d\'effacement, à la même place sur la page, et le curseur est derrière elle quand rien ne la précède ; une suppression qui sort de la ligne (un tableau supprimé) emporte ses images, comme avant',
    run: async (h) => {
      const problems = [];
      for (const kind of KINDS) {
        const token = tokenFor(kind);
        await setDoc(h, '<p>Titre</p><p>foo' + floating(kind) + 'bar baz</p>');
        const before = floatingImages()[0];
        const range = paragraphRange(1);
        caretAt(range.start);
        ed().view.dispatch(ed().state.tr.delete(range.start, range.start + 4));
        await sleep(60);
        const after = floatingImages();
        if (summary() !== 'Titre | ' + token + 'bar baz' || after.length !== 1 || placement(after[0]) !== placement(before)) problems.push(kind.label + ', mot et ancre effacés : ' + summary() + ' (' + after.length + ' image)');
        if (ed().state.selection.from !== range.start + 1) problems.push(kind.label + ', mot effacé : le curseur n\'est pas derrière l\'ancre (' + ed().state.selection.from + ')');
        // Le même effacement au milieu du texte : le curseur reste devant l'ancre, le texte d'avant le garde.
        await setDoc(h, '<p>Titre</p><p>un foo' + floating(kind) + 'bar</p>');
        const start = paragraphRange(1).start;
        caretAt(start + 3);
        ed().view.dispatch(ed().state.tr.delete(start + 3, start + 7));
        await sleep(60);
        if (summary() !== 'Titre | un ' + token + 'bar' || imageCount() !== 1) problems.push(kind.label + ', mot effacé au milieu : ' + summary());
        if (ed().state.selection.from !== start + 3) problems.push(kind.label + ', mot effacé au milieu : le curseur n\'est pas resté derrière le texte d\'avant, devant l\'ancre (' + ed().state.selection.from + ')');
      }
      // Un tableau supprimé, la sélection ou le curseur dans une case qui porte l'image : rien où poser l'ancre, elle part avec le tableau.
      for (const selecting of [false, true]) {
        await setDoc(h, '<p>Titre</p><table><tbody><tr><td><p>Case' + floating(KINDS[0]) + '</p></td></tr></tbody></table><p>Fin</p>');
        let tablePos = null;
        let tableSize = 0;
        let cell = null;
        ed().state.doc.descendants((node, pos) => {
          if (node.type.name === 'table') { tablePos = pos; tableSize = node.nodeSize; }
          if (node.type.name === 'paragraph' && cell == null && tablePos != null && pos > tablePos) cell = { start: pos + 1, end: pos + 1 + node.content.size };
        });
        if (selecting) selectText(cell.start, cell.end); else caretAt(cell.start);
        ed().view.dispatch(ed().state.tr.delete(tablePos, tablePos + tableSize));
        await sleep(60);
        if (imageCount() !== 0) problems.push('tableau supprimé' + (selecting ? ' (texte de la case sélectionné)' : '') + ' : ' + imageCount() + ' image(s) restent');
      }
      return { pass: problems.length === 0, notes: JSON.stringify(problems) };
    },
  });

  cases.push({
    id: 'floating_keys_what_is_meant_to_remove_the_image_still_removes_it',
    description: 'Ce qui doit emporter l\'image l\'emporte : Couper le texte (l\'image part dans le presse-papiers avec lui), l\'image sélectionnée remplacée par du texte, Ctrl + A puis du texte, tout le texte remplacé, un modèle chargé par-dessus une sélection qui porte l\'ancre, une transaction hors historique, la résolution d\'une suggestion (« Tout accepter »), le suivi des modifications actif (la bibliothèque marque, rien n\'est reposé en double)',
    run: async (h) => {
      const problems = [];
      const html = () => '<p>Titre</p><p>Ligne A' + floating(KINDS[0]) + '</p><p>Ligne B</p>';
      await setDoc(h, html());
      selectLine(1);
      ed().view.dispatch(ed().state.tr.deleteSelection().setMeta('uiEvent', 'cut'));
      if (imageCount() !== 0 || summary() !== 'Titre |  | Ligne B') problems.push('Couper : ' + summary() + ' (' + imageCount() + ' image)');
      await setDoc(h, html());
      ed().commands.setNodeSelection(anchorEdge(1, 'before'));
      ed().commands.insertContent('x');
      if (imageCount() !== 0 || summary() !== 'Titre | Ligne Ax | Ligne B') problems.push('image sélectionnée remplacée par une lettre : ' + summary() + ' (' + imageCount() + ' image)');
      await setDoc(h, html());
      ed().commands.selectAll();
      ed().commands.insertContent('x');
      if (imageCount() !== 0) problems.push('Ctrl + A puis une lettre : ' + summary() + ' (' + imageCount() + ' image)');
      await setDoc(h, html());
      selectText(paragraphRange(0).start, paragraphRange(2).end);
      typeOver('x');
      if (imageCount() !== 0) problems.push('tout le texte remplacé : ' + summary() + ' (' + imageCount() + ' image)');
      await setDoc(h, html());
      selectLine(1);
      ed().commands.setContent('<p>Autre</p>');
      await sleep(60);
      if (imageCount() !== 0 || summary() !== 'Autre') problems.push('modèle chargé par-dessus la sélection : ' + summary() + ' (' + imageCount() + ' image)');
      await setDoc(h, html());
      selectLine(1);
      ed().view.dispatch(ed().state.tr.deleteSelection().setMeta('addToHistory', false));
      if (imageCount() !== 0) problems.push('transaction hors historique : ' + summary() + ' (' + imageCount() + ' image)');
      await setDoc(h, html());
      selectLine(1);
      ed().view.dispatch(TrackChanges.skipTracking(ed().state.tr.deleteSelection()));
      if (imageCount() !== 0) problems.push('résolution d\'une suggestion (« Tout accepter », la marque du suivi) : ' + summary() + ' (' + imageCount() + ' image)');
      await setDoc(h, html());
      Editor.setTrackChanges(true);
      await sleep(80);
      selectLine(1);
      typeOver('x');
      await sleep(60);
      if (imageCount() !== 1) problems.push('suivi des modifications : ' + imageCount() + ' image(s) (1 attendue, la bibliothèque la marque)');
      Editor.setTrackChanges(false);
      await sleep(60);
      return { pass: problems.length === 0, notes: JSON.stringify(problems) };
    },
  });

  cases.push({
    id: 'floating_keys_moving_or_resizing_the_image_with_the_text_selected_adds_no_copy',
    description: 'Déplacer ou redimensionner l\'image (moveImageNode, le glisser et les flèches) alors qu\'un texte qui porte son ancre est sélectionné, ou changer son calque : une seule image reste, à sa nouvelle place ; aucune copie de l\'ancienne n\'est reposée',
    run: async (h) => {
      const problems = [];
      for (const kind of KINDS) {
        await setDoc(h, '<p>Titre</p><p>Ligne A' + floating(kind) + '</p><p>Ligne B</p>');
        selectLine(1);
        EditorNodes.moveImageNode(ed(), anchorEdge(1, 'before'), { left: 120, top: 150, pageIndex: 0, pageLeftPt: 90, pageTopPt: 112 });
        await sleep(60);
        let images = floatingImages();
        if (images.length !== 1 || imageCount() !== 1 || images[0].attrs.left !== 120) problems.push(kind.label + ', déplacée : ' + imageCount() + ' image(s), left ' + (images[0] && images[0].attrs.left));
        selectLine(1);
        ed().view.dispatch(ed().state.tr.setNodeMarkup(anchorEdge(1, 'before'), null, Object.assign({}, images[0].attrs, { width: '200px', opacity: 0.5 })));
        await sleep(60);
        images = floatingImages();
        if (images.length !== 1 || imageCount() !== 1 || images[0].attrs.width !== '200px') problems.push(kind.label + ', redimensionnée : ' + imageCount() + ' image(s)');
      }
      return { pass: problems.length === 0, notes: JSON.stringify(problems) };
    },
  });

  cases.push({
    id: 'floating_keys_a_classic_image_in_replaced_text_goes_with_it_as_before',
    description: 'Une image au fil du texte (classique) n\'est pas concernée : le texte tapé sur une ligne sélectionnée qui la porte l\'emporte, comme avant (le choix du comportement est posé à la personne)',
    run: async (h) => {
      await setDoc(h, '<p>Titre</p><p>Ligne A' + classic + '</p><p>Ligne B</p>');
      selectLine(1);
      typeOver('x');
      await sleep(60);
      return { pass: summary() === 'Titre | x | Ligne B' && imageCount() === 0, notes: summary() + ' (' + imageCount() + ' image)' };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.floatingKeys = cases;
})();
