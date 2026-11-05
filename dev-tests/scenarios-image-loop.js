// Suite "imageLoop" - la boucle d'une image liée à une colonne Pièces jointes (retour d'Antoine du 05/11 : « on manque des outils de gestion d'une variable quand c'est une image (conditions,
// changement d'attribut...) » ; sa réponse à la carte : « Condition, boucle, ligne liée », la boucle après la condition). L'attribut `loop` du nœud editorImage (js/editor-nodes.js : écrit en
// data-loop sur l'<img> d'une image de variable seulement), le moteur (js/loop-rules.js : les zones que l'image répète - ligne de tableau, élément de liste, paragraphe - et l'image copiée
// « dans la phrase », expandInlineImages), le bouton « Boucle » de sa barre (js/floating-toolbars.js : grisé avec sa raison, allumé quand elle est posée), la fenêtre « Boucle » partagée avec les
// bulles (js/variable-loop.js : sans séparateurs pour une image), les repères de la zone répétée dans l'éditeur (css/variable-actions.css) et la ligne du cadre (css/editor-v2.css), le
// changement de colonne qui garde ou retire la boucle (js/variable-column.js), le renommage d'une table (js/schema-renames.js). La souris réelle à 700x400 est dans verify-var-toolbar-mouse.mjs.
(function () {
  const cases = [];
  const PAGE = 'IlDossiers';
  const LINKED = 'IlPartenaires';
  const OTHER = 'IlEmblemes';
  const LOOP_INLINE = { repeat: 'inline', table: LINKED };
  const LOOP_PARAGRAPH = { repeat: 'paragraph', table: LINKED };
  const LOOP_ROW = { repeat: 'row', table: LINKED };
  const LOOP_ITEM = { repeat: 'item', table: LINKED };
  const NO_PARTNER = { id: 3, Titre: 'Dossier C', Logo: ['L', 13] };
  const RECORDS = [{ id: 1, Titre: 'Dossier A', Logo: ['L', 11] }, { id: 2, Titre: 'Dossier B', Logo: ['L', 12] }, NO_PARTNER];

  const attr = (name, value) => ` ${name}="${JSON.stringify(value).replace(/"/g, '&quot;')}"`;
  const imageHtml = (table, column, loop, extra) => `<img class="editor-image" data-var-table="${table}" data-var-column="${column}" data-var-key="${table}.${column}" style="width: 200px; height: 150px"${loop ? attr('data-loop', loop) : ''}${extra || ''}>`;
  const nameBadge = `<span class="var-badge" data-table="${LINKED}" data-column="Nom" data-key="${LINKED}.Nom"></span>`;
  const ed = () => EditorCore.getEditor();
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const failedOf = checks => Object.keys(checks).filter(k => !checks[k]);
  const inLang = async (lang, fn) => { const before = I18n.getLang(); I18n.setLang(lang); try { return await fn(); } finally { I18n.setLang(before); } };
  const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  // La page est sur IlDossiers (une pièce jointe Logo) ; IlPartenaires y est liée par sa colonne Dossier (deux partenaires pour le dossier 1, un pour le 2, aucun pour le 3) ; IlEmblemes
  // n'est reliée à rien (une autre table à pièces jointes, pour changer de colonne).
  async function seed(h, html) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables(PAGE, { Titre: 'Text', Logo: 'Attachments' });
    stub.setVariables(LINKED, { Dossier: 'Ref:' + PAGE, Nom: 'Text', Logo: 'Attachments', Ordre: 'Numeric' });
    stub.setVariables(OTHER, { Nom: 'Text', Emblem: 'Attachments' });
    stub.setRows(PAGE, RECORDS);
    stub.setRows(LINKED, [
      { id: 1, Dossier: 1, Nom: 'Alpha', Logo: ['L', 31], Ordre: 2 }, { id: 2, Dossier: 1, Nom: 'Beta', Logo: ['L', 32], Ordre: 1 }, { id: 3, Dossier: 2, Nom: 'Gamma', Logo: ['L', 33], Ordre: 1 },
    ]);
    stub.setRows(OTHER, [{ id: 1, Nom: 'Emb', Emblem: ['L', 41] }]);
    await GristAPI.refreshSchema();
    await GristAPI.deleteLinkRule(LINKED);
    await GristAPI.deleteLinkRule(OTHER);
    await GristAPI.saveLinkRule(LINKED, { mode: 'match', colonneCible: 'Dossier', colonneSource: 'id' });
    stub.fireRecord(Object.assign({}, RECORDS[0]), PAGE);
    await h.sleep(60);
    Editor.setHTML(html || '<p></p>');
    await h.sleep(150);
  }
  async function setRecord(h, record) {
    window.__gristStub.fireRecord(Object.assign({}, record), PAGE);
    await h.sleep(60);
  }
  async function readBox(html) {
    const box = document.createElement('div');
    box.innerHTML = await ReaderMode.preview(html, PAGE, GristAPI.getCurrentRecord());
    return box;
  }
  const attachmentsOf = box => Array.from(box.querySelectorAll('img')).map(i => i.getAttribute('data-attachment-id'));
  const textOf = box => box.textContent.replace(/\s+/g, ' ').trim();
  const imageNodes = () => { const out = []; ed().state.doc.descendants((node, pos) => { if (node.type.name === 'editorImage') out.push({ node, pos }); }); return out; };
  const attrsOf = index => { const f = imageNodes()[index || 0]; return f ? f.node.attrs : null; };
  const imageViews = () => Array.from(document.querySelectorAll('.tiptap .editor-image-view'));
  async function selectImage(h, index) {
    document.querySelector('.tiptap').focus();
    const found = imageNodes()[index || 0];
    if (!found) throw new Error('pas d’image n° ' + (index || 0));
    ed().commands.setNodeSelection(found.pos);
    await h.sleep(150);
    return found;
  }
  const imageBar = () => Array.from(document.querySelectorAll('.v2-floating-toolbar')).find(el => el.querySelector('button[data-action="layer-front"]'));
  const loopButton = () => { const bar = imageBar(); return bar ? bar.querySelector('button[data-action="var-loop"]') : null; };
  const buttonState = () => {
    const bar = imageBar();
    const b = loopButton();
    return {
      shown: !!b && !!bar && bar.classList.contains('visible') && b.getClientRects().length > 0,
      disabled: !!b && b.getAttribute('aria-disabled') === 'true', active: !!b && b.classList.contains('is-active'), title: b ? b.title : null, label: b ? b.getAttribute('aria-label') : null,
    };
  };
  const pressLoop = () => loopButton().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  const loopModal = () => document.getElementById('var-loop-modal');
  const windowShown = () => { const m = loopModal(); return !!m && m.style.display !== 'none' && m.getClientRects().length > 0; };

  cases.push({
    id: 'imageloop_reader_inline_copies_the_image_for_each_linked_row',
    description: 'Une image de colonne en boucle « dans la phrase » est copiée pour chaque ligne rattachée, les copies côte à côte, chacune avec la pièce jointe de sa ligne, dans l’ordre du tri réglé ; le texte autour reste ; une ligne de page sans partenaire écrit « Si aucune ligne » (masquer le paragraphe, laisser vide, ou un texte) ; une image sans boucle ne change pas',
    run: async (h) => {
      const sentence = loop => '<p>Avant ' + imageHtml(LINKED, 'Logo', loop) + ' après</p>';
      await seed(h, '<p></p>');
      const first = await readBox(sentence(LOOP_INLINE));
      const sorted = await readBox(sentence(Object.assign({ sort: { column: 'Ordre', direction: 'asc' } }, LOOP_INLINE)));
      const filtered = await readBox(sentence(Object.assign({ filter: { mode: 'all', rules: [{ column: 'Nom', operator: '=', value: 'Beta' }] } }, LOOP_INLINE)));
      const plain = await readBox('<p>Avant ' + imageHtml(LINKED, 'Logo') + ' après</p>');
      await setRecord(h, RECORDS[1]);
      const second = await readBox(sentence(LOOP_INLINE));
      await setRecord(h, NO_PARTNER);
      const hidden = await readBox(sentence(Object.assign({ empty: 'hide' }, LOOP_INLINE)) + '<p>Suite</p>');
      const blank = await readBox(sentence(Object.assign({ empty: 'blank' }, LOOP_INLINE)));
      const textual = await readBox(sentence(Object.assign({ empty: 'text', emptyText: 'Aucun partenaire' }, LOOP_INLINE)));
      await setRecord(h, RECORDS[0]);
      const checks = {
        copiesInRowOrder: same(attachmentsOf(first), ['31', '32']) && first.querySelectorAll('p').length === 1,
        textStays: textOf(first).indexOf('Avant') === 0 && /après$/.test(textOf(first)),
        sortFollowsTheColumn: same(attachmentsOf(sorted), ['32', '31']),
        filterKeepsOneRow: same(attachmentsOf(filtered), ['32']),
        aSingleRowGivesOneImage: same(attachmentsOf(second), ['33']),
        hideRemovesTheParagraph: attachmentsOf(hidden).length === 0 && textOf(hidden) === 'Suite',
        blankKeepsTheParagraph: attachmentsOf(blank).length === 0 && /Avant\s+après/.test(textOf(blank)),
        textWritesItsText: attachmentsOf(textual).length === 0 && /Aucun partenaire/.test(textOf(textual)),
        withoutLoopOneImageOfTheLinkedRow: attachmentsOf(plain).length >= 1,
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: failed.length ? JSON.stringify({ failed, first: first.innerHTML, sorted: attachmentsOf(sorted), hidden: hidden.innerHTML }) : 'ok' };
    },
  });

  cases.push({
    id: 'imageloop_reader_zone_repeats_the_paragraph_the_row_and_the_item_of_the_image',
    description: 'L’image qui porte la boucle répète son paragraphe, sa ligne de tableau ou son élément de liste pour chaque ligne rattachée, avec les autres variables de la zone qui lisent la même ligne (le nom du partenaire à côté de son logo) ; la boucle de l’image ne se déroule qu’une fois par zone',
    run: async (h) => {
      await seed(h, '<p></p>');
      const paragraphs = await readBox('<p>Partenaire ' + nameBadge + ' : ' + imageHtml(LINKED, 'Logo', LOOP_PARAGRAPH) + '</p>');
      const rows = await readBox('<table><tbody><tr><td>' + nameBadge + '</td><td>' + imageHtml(LINKED, 'Logo', LOOP_ROW) + '</td></tr></tbody></table>');
      const items = await readBox('<ul><li><p>' + nameBadge + ' ' + imageHtml(LINKED, 'Logo', LOOP_ITEM) + '</p></li></ul>');
      const twice = await readBox('<p>' + imageHtml(LINKED, 'Logo', LOOP_PARAGRAPH) + imageHtml(LINKED, 'Logo', LOOP_PARAGRAPH) + '</p>');
      const checks = {
        paragraphPerRow: Array.from(paragraphs.querySelectorAll('p')).map(p => p.textContent.trim()).join('|') === 'Partenaire Alpha :|Partenaire Beta :' && same(attachmentsOf(paragraphs), ['31', '32']),
        rowPerRow: rows.querySelectorAll('tr').length === 2 && Array.from(rows.querySelectorAll('tr')).map(r => r.cells[0].textContent.trim() + ':' + attachmentsOf(r).join(',')).join('|') === 'Alpha:31|Beta:32',
        itemPerRow: items.querySelectorAll('li').length === 2 && Array.from(items.querySelectorAll('li')).map(li => li.textContent.trim() + ':' + attachmentsOf(li).join(',')).join('|') === 'Alpha:31|Beta:32',
        onlyOneLoopPerZone: twice.querySelectorAll('p').length === 2 && attachmentsOf(twice).length === 4,
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: failed.length ? JSON.stringify({ failed, paragraphs: paragraphs.innerHTML, rows: rows.innerHTML, items: items.innerHTML, twice: twice.innerHTML }) : 'ok' };
    },
  });

  cases.push({
    id: 'imageloop_loop_round_trips_through_html_and_only_an_image_of_a_column_writes_it',
    description: 'La boucle d’une image de colonne s’écrit en data-loop sur son <img> et se relit à l’identique (enregistrement, collage) ; une image ordinaire n’en écrit jamais, même si le nœud en porte une ; le cadre de l’éditeur n’écrit ni son repère ni son libellé dans le modèle',
    run: async (h) => {
      await seed(h, '<p>' + imageHtml(LINKED, 'Logo', LOOP_PARAGRAPH) + '</p>');
      const first = attrsOf(0);
      const saved = Editor.getHTML();
      const written = Array.from(new DOMParser().parseFromString(saved, 'text/html').querySelectorAll('img.editor-image')).map(i => i.getAttribute('data-loop'));
      Editor.setHTML(saved);
      await h.sleep(120);
      const second = attrsOf(0);
      const found = imageNodes()[0];
      ed().view.dispatch(ed().state.tr.setNodeMarkup(found.pos, undefined, Object.assign({}, found.node.attrs, { varTable: null, varColumn: null, varKey: null, src: PIXEL })));
      await h.sleep(100);
      const ordinary = Editor.getHTML();
      const checks = {
        parsed: first.loop && first.loop.repeat === 'paragraph' && first.loop.table === LINKED,
        written: written.length === 1 && JSON.parse(written[0]).repeat === 'paragraph',
        reparsed: !!second && same(second.loop, first.loop),
        noFrameMarkInModel: saved.indexOf('editor-image-looped') === -1 && saved.indexOf('data-loop-repeat') === -1 && saved.indexOf('data-note') === -1,
        ordinaryImageWritesNone: ordinary.indexOf('data-loop') === -1,
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: failed.length ? JSON.stringify({ failed, saved, ordinary }) : 'ok' };
    },
  });

  cases.push({
    id: 'imageloop_bar_button_is_for_column_images_and_lights_up_with_a_loop',
    description: 'Le bouton « Boucle » est dans la barre de toute image : actif sur une image de colonne dont les lignes se parcourent, éteint tant qu’il n’y a pas de boucle et allumé quand elle est posée ; grisé avec sa raison (français et anglais) sur une image ordinaire, un clic dessus n’ouvre rien',
    run: async (h) => {
      await seed(h, '<p>' + imageHtml(LINKED, 'Logo') + ' ' + imageHtml(LINKED, 'Logo', LOOP_INLINE) + ' <img class="editor-image" src="' + PIXEL + '" style="width: 40px"></p>');
      const states = {};
      const REASON = { fr: 'La boucle est réservée à une image liée à une colonne de pièces jointes', en: 'A loop is only for an image linked to an attachments column' };
      for (const lang of ['fr', 'en']) {
        await inLang(lang, async () => {
          for (const [i, kind] of ['plain_column', 'with_loop', 'ordinary'].entries()) {
            await selectImage(h, i);
            states[lang + '_' + kind] = buttonState();
          }
        });
      }
      await selectImage(h, 2);
      pressLoop();
      await h.sleep(150);
      const openedOnOrdinary = windowShown();
      const s = states;
      const checks = {
        enabledOnColumnImage: ['fr', 'en'].every(l => s[l + '_plain_column'].shown && !s[l + '_plain_column'].disabled && !s[l + '_plain_column'].active),
        litWithLoop: ['fr', 'en'].every(l => s[l + '_with_loop'].shown && !s[l + '_with_loop'].disabled && s[l + '_with_loop'].active),
        greyOnOrdinary: ['fr', 'en'].every(l => s[l + '_ordinary'].shown && s[l + '_ordinary'].disabled && !s[l + '_ordinary'].active && s[l + '_ordinary'].title === REASON[l] && s[l + '_ordinary'].label === REASON[l]),
        clickOnOrdinaryOpensNothing: !openedOnOrdinary,
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: failed.length ? JSON.stringify({ failed, states, openedOnOrdinary }) : 'ok' };
    },
  });

  cases.push({
    id: 'imageloop_window_sets_and_removes_the_loop_with_one_undo_each',
    description: 'Le bouton ouvre la fenêtre « Boucle » avec le nom de l’image, les choix de ce qui se répète pour l’endroit où elle est, sans séparateurs, un aperçu qui parle d’images ; « Enregistrer » pose la boucle en un seul Annuler en gardant la taille de l’image et sa condition ; « Retirer la boucle » la retire en un seul Annuler',
    run: async (h) => {
      const condition = { mode: 'all', rules: [{ column: 'Titre', operator: '=', value: 'Dossier A' }] };
      await seed(h, '<p>Logos : ' + imageHtml(LINKED, 'Logo', null, attr('data-condition', condition)) + '</p>');
      const before = attrsOf(0);
      await selectImage(h, 0);
      pressLoop();
      await h.sleep(400);
      const modal = loopModal();
      const opened = windowShown();
      const shape = opened ? {
        title: document.getElementById('var-loop-title').textContent,
        intro: modal.querySelector('.var-modal-intro').textContent,
        choices: Array.from(modal.querySelectorAll('.var-loop-seg button')).map(b => b.dataset.repeat + ':' + b.textContent),
        selected: Array.from(modal.querySelectorAll('.var-loop-seg button[aria-pressed="true"]')).map(b => b.dataset.repeat),
        separatorsShown: Array.from(modal.querySelectorAll('.var-loop-separators, .var-loop-sep')).some(r => !r.hidden && r.getClientRects().length > 0),
        preview: Array.from(modal.querySelectorAll('.var-condition-debug-line')).map(l => l.textContent),
      } : null;
      if (opened) modal.querySelector('.var-modal-primary').click();
      await h.sleep(150);
      const saved = attrsOf(0);
      const frame = { looped: imageViews()[0].classList.contains('editor-image-looped'), repeat: imageViews()[0].dataset.loopRepeat };
      ed().commands.undo();
      await h.sleep(100);
      const undone = attrsOf(0);
      ed().commands.redo();
      await h.sleep(100);
      await selectImage(h, 0);
      pressLoop();
      await h.sleep(400);
      const removeBtn = windowShown() ? loopModal().querySelector('.var-modal-actions .var-modal-danger:not([hidden])') : null;
      if (removeBtn) removeBtn.click();
      await h.sleep(150);
      const removed = attrsOf(0);
      ed().commands.undo();
      await h.sleep(100);
      const restored = attrsOf(0);
      const checks = {
        opened,
        titleNamesTheTable: !!shape && shape.title.indexOf(LINKED) !== -1,
        introIsAboutTheImage: !!shape && shape.intro.indexOf('#' + LINKED + '.Logo') !== -1 && /copiée pour chaque ligne/.test(shape.intro),
        choicesForAParagraph: !!shape && same(shape.choices.map(c => c.split(':')[0]), ['inline', 'paragraph']) && /L’image, dans la phrase/.test(shape.choices[0]),
        inlineByDefault: !!shape && same(shape.selected, ['inline']),
        noSeparators: !!shape && !shape.separatorsShown,
        previewTalksAboutImages: !!shape && shape.preview.some(l => /image/.test(l)),
        savedLoop: !!saved && saved.loop && saved.loop.repeat === 'inline' && saved.loop.table === LINKED && saved.loop.separator === undefined
          && saved.width === before.width && same(saved.condition, condition) && saved.varColumn === 'Logo',
        frameIsMarked: frame.looped && frame.repeat === 'inline',
        oneUndoRemovesIt: !!undone && undone.loop == null && same(undone.condition, condition),
        removed: !!removed && removed.loop == null && removed.varColumn === 'Logo',
        oneUndoRestoresIt: !!restored && !!restored.loop && restored.loop.repeat === 'inline',
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: failed.length ? JSON.stringify({ failed, shape, saved, undone, removed, restored }) : 'ok' };
    },
  });

  cases.push({
    id: 'imageloop_window_offers_the_paragraph_the_row_and_the_item_of_where_the_image_is',
    description: 'Dans une cellule de tableau la fenêtre offre « La ligne du tableau » et l’image dans sa case, dans une liste « L’élément de liste », dans un paragraphe « Le paragraphe » ; le choix de la zone se garde à l’enregistrement et le cadre en porte le repère',
    run: async (h) => {
      const html = '<table><tbody><tr><td>' + nameBadge + '</td><td>' + imageHtml(LINKED, 'Logo') + '</td></tr></tbody></table><ul><li><p>' + imageHtml(LINKED, 'Logo') + '</p></li></ul><p>' + imageHtml(LINKED, 'Logo') + '</p>';
      await seed(h, html);
      const kinds = ['table', 'list', 'paragraph'];
      const offered = {};
      for (let i = 0; i < 3; i++) {
        await selectImage(h, i);
        pressLoop();
        await h.sleep(300);
        offered[kinds[i]] = windowShown() ? Array.from(loopModal().querySelectorAll('.var-loop-seg button')).map(b => b.dataset.repeat + ':' + b.textContent) : null;
        if (windowShown()) loopModal().querySelector('.var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)').click();
        await h.sleep(100);
      }
      // La ligne du tableau choisie et enregistrée.
      await selectImage(h, 0);
      pressLoop();
      await h.sleep(300);
      const rowChoice = windowShown() ? loopModal().querySelector('.var-loop-seg button[data-repeat="row"]') : null;
      if (rowChoice) rowChoice.click();
      await h.sleep(100);
      if (windowShown()) loopModal().querySelector('.var-modal-primary').click();
      await h.sleep(200);
      const rowLoop = attrsOf(0).loop;
      const tint = getComputedStyle(document.querySelector('.tiptap tr > td')).backgroundColor;
      const checks = {
        table: !!offered.table && same(offered.table.map(c => c.split(':')[0]), ['row', 'inline']) && /La ligne du tableau/.test(offered.table[0]) && /L’image, dans sa case/.test(offered.table[1]),
        list: !!offered.list && same(offered.list.map(c => c.split(':')[0]), ['item', 'inline']) && /L’élément de liste/.test(offered.list[0]),
        paragraph: !!offered.paragraph && same(offered.paragraph.map(c => c.split(':')[0]), ['inline', 'paragraph']) && /Le paragraphe/.test(offered.paragraph[1]),
        rowSaved: !!rowLoop && rowLoop.repeat === 'row' && rowLoop.table === LINKED,
        rowZoneTinted: tint === 'rgb(245, 249, 255)',
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: failed.length ? JSON.stringify({ failed, offered, rowLoop, tint }) : 'ok' };
    },
  });

  cases.push({
    id: 'imageloop_frame_says_what_the_loop_repeats_in_both_languages_next_to_the_condition',
    description: 'Une image de colonne en boucle garde son cadre visible en édition et le libellé a une ligne de plus qui dit ce que la boucle répète (« Une image par ligne de … » / « One image per … row », la ligne du tableau, l’élément, le paragraphe), sous la ligne « Si … » quand l’image a aussi une condition',
    run: async (h) => {
      const condition = { mode: 'all', rules: [{ column: 'Titre', operator: '=', value: 'Dossier A' }] };
      const html = '<p>' + imageHtml(LINKED, 'Logo', LOOP_INLINE) + ' ' + imageHtml(LINKED, 'Logo', LOOP_INLINE, attr('data-condition', condition)) + ' ' + imageHtml(LINKED, 'Logo') + '</p>';
      const notes = {};
      for (const lang of ['fr', 'en']) {
        await inLang(lang, async () => {
          await seed(h, '<p></p>');
          Editor.setHTML(html);
          await h.sleep(250);
          notes[lang] = imageViews().map(v => { const label = v.querySelector('.editor-image-var-label'); return { note: label.dataset.note || null, after: getComputedStyle(label, '::after').content, looped: v.classList.contains('editor-image-looped') }; });
        });
      }
      const checks = {
        loopLine: notes.fr[0].note === 'Une image par ligne de « ' + LINKED + ' »' && notes.en[0].note === 'One image per “' + LINKED + '” row' && notes.fr[0].looped,
        loopLineIsDrawn: notes.fr[0].after.indexOf('Une image par ligne') !== -1,
        conditionThenLoop: notes.fr[1].note === 'Si Titre = Dossier A\nUne image par ligne de « ' + LINKED + ' »' && notes.en[1].note === 'If Titre = Dossier A\nOne image per “' + LINKED + '” row',
        plainHasNoNote: notes.fr[2].note == null && !notes.fr[2].looped && notes.fr[2].after === 'none',
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: failed.length ? JSON.stringify({ failed, notes }) : 'ok' };
    },
  });

  cases.push({
    id: 'imageloop_changing_the_column_keeps_the_loop_on_the_same_table_and_drops_it_on_another',
    description: 'Changer la colonne Pièces jointes d’une image en boucle garde la boucle tant que la nouvelle colonne est de la table parcourue (taille, condition gardées), et la retire quand la colonne vient d’une autre table dont les lignes ne se parcourent pas de la même façon',
    run: async (h) => {
      await seed(h, '<p>' + imageHtml(LINKED, 'Logo', LOOP_INLINE) + '</p>');
      const node = imageNodes()[0].node;
      const sameTable = VariableColumn.replacementImageAttrs(node, { table: LINKED, column: 'Logo', key: LINKED + '.Logo' });
      const otherTable = VariableColumn.replacementImageAttrs(node, { table: OTHER, column: 'Emblem', key: OTHER + '.Emblem' });
      const checks = {
        keptOnTheSameTable: !!sameTable.loop && sameTable.loop.table === LINKED && sameTable.width === node.attrs.width,
        droppedOnAnotherTable: otherTable.loop == null && otherTable.varTable === OTHER && otherTable.width === node.attrs.width,
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: failed.length ? JSON.stringify({ failed, sameTable, otherTable }) : 'ok' };
    },
  });

  cases.push({
    id: 'imageloop_table_renames_follow_into_the_loop_of_an_image',
    description: 'Quand la table parcourue ou une colonne de son filtre est renommée dans Grist, la boucle d’une image de colonne la suit (data-loop réécrit), comme celle d’une bulle',
    run: async (h) => {
      await seed(h, '<p></p>');
      const m = SchemaRenames.createMapper(
        { f: 1, t: { 1: [PAGE, { 1: 'Titre' }], 2: [LINKED, { 1: 'Nom', 2: 'Logo' }] } },
        { f: 1, t: { 1: [PAGE, { 1: 'Titre' }], 2: ['IlPartenairesNeufs', { 1: 'Appellation', 2: 'Logo' }] } },
        {}
      );
      const ctx = { page: m.tableContext(PAGE), trigger: Variables.triggerChar() };
      const loop = { repeat: 'inline', table: LINKED, filter: { mode: 'all', rules: [{ column: 'Nom', operator: '=', value: 'Beta' }] } };
      const renamed = SchemaRenames.rewriteHtml('<p>' + imageHtml(LINKED, 'Logo', loop) + '</p>', m, ctx);
      const box = document.createElement('div');
      box.innerHTML = renamed.html;
      const img = box.querySelector('img');
      const out = img ? JSON.parse(img.getAttribute('data-loop')) : null;
      const checks = {
        counted: renamed.count >= 1,
        tableFollows: !!out && out.table === 'IlPartenairesNeufs' && img.getAttribute('data-var-table') === 'IlPartenairesNeufs',
        filterColumnFollows: !!out && !!out.filter && out.filter.rules[0].column === 'Appellation',
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: failed.length ? JSON.stringify({ failed, html: renamed.html }) : 'ok' };
    },
  });

  cases.push({
    id: 'imageloop_pick_one_row_keeps_the_first_or_the_last_after_the_filter_and_the_sort',
    description: 'Le choix « Une seule ligne » de la boucle d’une image garde la première ou la dernière ligne APRÈS le filtre et le tri (sans tri : l’ordre des lignes liées), en Lecture : une seule image dans la phrase, une seule copie du paragraphe ; « Si aucune ligne » vaut toujours quand rien n’est retenu ; une boucle sans ce choix, ou avec un choix inconnu, garde toutes les lignes',
    run: async (h) => {
      await seed(h, '<p></p>');
      const sentence = loop => '<p>Avant ' + imageHtml(LINKED, 'Logo', loop) + ' après</p>';
      const sortedAsc = { column: 'Ordre', direction: 'asc' };
      const firstRaw = await readBox(sentence(Object.assign({ pick: 'first' }, LOOP_INLINE)));
      const lastRaw = await readBox(sentence(Object.assign({ pick: 'last' }, LOOP_INLINE)));
      const firstSorted = await readBox(sentence(Object.assign({ pick: 'first', sort: sortedAsc }, LOOP_INLINE)));
      const lastSorted = await readBox(sentence(Object.assign({ pick: 'last', sort: sortedAsc }, LOOP_INLINE)));
      const filtered = await readBox(sentence(Object.assign({ pick: 'first', filter: { mode: 'all', rules: [{ column: 'Nom', operator: '=', value: 'Alpha' }] } }, LOOP_INLINE)));
      const unknown = await readBox(sentence(Object.assign({ pick: 'middle' }, LOOP_INLINE)));
      const all = await readBox(sentence(Object.assign({ pick: 'all' }, LOOP_INLINE)));
      const zone = await readBox('<p>Partenaire ' + nameBadge + ' : ' + imageHtml(LINKED, 'Logo', Object.assign({ pick: 'last', sort: sortedAsc }, LOOP_PARAGRAPH)) + '</p>');
      await setRecord(h, NO_PARTNER);
      const none = await readBox(sentence(Object.assign({ pick: 'first', empty: 'hide' }, LOOP_INLINE)) + '<p>Suite</p>');
      await setRecord(h, RECORDS[0]);
      const stored = LoopRules.normalizeLoop({ repeat: 'inline', table: LINKED, pick: 'last' });
      const checks = {
        firstWithoutSort: same(attachmentsOf(firstRaw), ['31']),
        lastWithoutSort: same(attachmentsOf(lastRaw), ['32']),
        sortFirst: same(attachmentsOf(firstSorted), ['32']),
        sortLast: same(attachmentsOf(lastSorted), ['31']),
        filterThenPick: same(attachmentsOf(filtered), ['31']),
        unknownKeepsAll: same(attachmentsOf(unknown), ['31', '32']) && same(attachmentsOf(all), ['31', '32']),
        oneCopyOfTheParagraph: Array.from(zone.querySelectorAll('p')).map(p => p.textContent.trim()).join('|') === 'Partenaire Alpha :' && same(attachmentsOf(zone), ['31']),
        emptyStillApplies: attachmentsOf(none).length === 0 && textOf(none) === 'Suite',
        readBack: stored.pick === 'last' && !('pick' in LoopRules.normalizeLoop({ repeat: 'inline', table: LINKED })) && !('pick' in LoopRules.normalizeLoop({ repeat: 'inline', table: LINKED, pick: 'all' })),
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: failed.length ? JSON.stringify({ failed, firstRaw: attachmentsOf(firstRaw), lastRaw: attachmentsOf(lastRaw), zone: zone.innerHTML }) : 'ok' };
    },
  });

  cases.push({
    id: 'imageloop_window_has_the_rows_shown_choice_for_an_image_only_and_saves_it_in_one_undo',
    description: 'La fenêtre Boucle d’une image a le champ « Lignes affichées » (toutes, la première, la dernière ; toutes par défaut) ; choisir « la première » puis Enregistrer le pose en un seul Annuler, l’aperçu compte une seule image, le cadre dit « Seulement la première ligne de … » (français et anglais) ; la fenêtre d’une bulle n’a pas ce champ',
    run: async (h) => {
      await seed(h, '<p>Logos : ' + imageHtml(LINKED, 'Logo', LOOP_INLINE) + '</p><p>' + nameBadge + '</p>');
      await selectImage(h, 0);
      pressLoop();
      await h.sleep(400);
      const row = document.querySelector('#var-loop-modal .var-loop-pick');
      const select = document.getElementById('var-loop-pick');
      const shown = windowShown() && !!row && !row.hidden && row.getClientRects().length > 0;
      const choices = select ? Array.from(select.options).map(o => o.value) : [];
      const before = select ? select.value : null;
      if (select) { select.value = 'first'; select.dispatchEvent(new Event('change', { bubbles: true })); }
      await h.sleep(700);
      const preview = Array.from(document.querySelectorAll('#var-loop-modal .var-condition-debug-line')).filter(l => !l.hidden).map(l => l.textContent);
      if (windowShown()) loopModal().querySelector('.var-modal-primary').click();
      await h.sleep(200);
      const saved = attrsOf(0);
      const notes = {};
      for (const lang of ['fr', 'en']) {
        await inLang(lang, async () => { Editor.setHTML('<p></p>'); await h.sleep(100); Editor.setHTML('<p>' + imageHtml(LINKED, 'Logo', Object.assign({ pick: 'first' }, LOOP_INLINE)) + '</p>'); await h.sleep(250); notes[lang] = imageViews()[0].querySelector('.editor-image-var-label').dataset.note; });
      }
      Editor.setHTML('<p>Logos : ' + imageHtml(LINKED, 'Logo', Object.assign({ pick: 'last' }, LOOP_INLINE)) + '</p><p>' + nameBadge + '</p>');
      await h.sleep(250);
      const kept = attrsOf(0).loop.pick;
      await selectImage(h, 0);
      ed().commands.undo();
      await h.sleep(100);
      // La fenêtre d'une bulle : pas de champ « Lignes affichées ».
      let badgePos = -1;
      ed().state.doc.descendants((node, pos) => { if (node.type.name === 'varBadge' && badgePos < 0) badgePos = pos; });
      VariableLoop.openAt(ed(), badgePos);
      await h.sleep(400);
      const badgeRow = document.querySelector('#var-loop-modal .var-loop-pick');
      const badgeHidden = !badgeRow || badgeRow.hidden || badgeRow.getClientRects().length === 0;
      const checks = {
        shown, threeChoices: same(choices, ['all', 'first', 'last']), allByDefault: before === 'all',
        previewOneImage: preview.some(l => /1 image/.test(l)),
        savedFirst: !!saved && !!saved.loop && saved.loop.pick === 'first' && saved.loop.repeat === 'inline',
        frameFr: notes.fr === 'Seulement la première ligne de « ' + LINKED + ' »', frameEn: notes.en === 'Only the first “' + LINKED + '” row',
        existingPickIsOffered: kept === 'last', badgeWindowHasNoPickField: badgeHidden,
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: failed.length ? JSON.stringify({ failed, choices, before, preview, saved: saved && saved.loop, notes }) : 'ok' };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.imageLoop = cases;
})();
