// Suite "caption" - la légende sous une image ou un tableau (demande d'Antoine du 2026-10-01 : « la légende sous une image ou un tableau »). Un paragraphe ordinaire qui porte
// l'attribut `caption` (`<p data-caption="true">`, js/caption.js), en petit, italique et gris ; le bouton « Légende » des barres flottantes de l'image et du tableau
// (js/floating-toolbars.js) la pose sous le bloc ou y ramène le curseur. Deux moitiés, comme calloutSignature :
//  1) l'ÉDITEUR : l'attribut et son aller-retour HTML, Entrée, le bouton (pose, retour, grisage et sa raison), l'alignement hérité, le tableau, une case ou une colonne, le texte
//     d'attente, Annuler, Retour arrière, le suivi des modifications ;
//  2) les RENDUS : style de l'éditeur et de la Lecture, PDF (docDefinition), Word (OOXML dézippé), e-mail (texte du mailto).
// La vraie souris et le vrai clavier à 700x400 (clair, sombre, anglais) sont dans dev-tests/verify-caption-mouse.mjs : une page.evaluate ne déclenche ni un survol ni une frappe de confiance.
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const ed = () => EditorCore.getEditor();
  const DATA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const image = extra => `<img class="editor-image" src="${DATA}" style="width: 120px"${extra || ''}>`;
  const TABLE = '<table><tbody><tr><td><p>Case A</p></td><td><p>Case B</p></td></tr></tbody></table>';
  const parse = html => new DOMParser().parseFromString(html, 'text/html').body;
  // TipTap (StarterKit) garde toujours un paragraphe vide à la fin du document quand le dernier bloc n'en est pas un : on le retire pour lire le document tel qu'on l'a écrit.
  const written = () => Editor.getHTML().replace(/<p><\/p>$/, '');

  async function setDoc(h, html) {
    await h.resetEditor();
    Editor.setHTML(html);
    await sleep(150);
  }
  // Les formes du document, lisibles d'un coup d'œil : « p:Avant | p:img | p*: | table[row[cell[p:A], cell[p:B]]] | p:Après » (« * » : légende ; texte du paragraphe, ou « img » quand l'image y est).
  const SHORT = { tableRow: 'row', tableCell: 'cell', twoColumnsZone: 'zone', twoColumnsColumn: 'col' };
  function outline(parent, sep) {
    const parts = [];
    parent.forEach(child => {
      const name = child.type.name;
      if (name === 'paragraph') {
        let hasImage = false;
        child.descendants(n => { if (n.type.name === 'editorImage') hasImage = true; });
        parts.push('p' + (child.attrs.caption ? '*' : '') + ':' + (hasImage ? 'img' : child.textContent));
      } else if (child.childCount && !child.isTextblock) parts.push((SHORT[name] || name) + '[' + outline(child, ', ') + ']');
      else parts.push(name);
    });
    return parts.join(sep || ' | ');
  }
  const docOutline = () => outline(ed().state.doc);
  const TABLE_OUTLINE = 'table[row[cell[p:Case A], cell[p:Case B]]]';
  function positionOf(predicate) {
    let found = null;
    ed().state.doc.descendants((node, pos) => { if (found == null && predicate(node)) found = pos; });
    return found;
  }
  const imagePos = () => positionOf(n => n.type.name === 'editorImage');
  function captions() {
    const out = [];
    ed().state.doc.descendants((node, pos) => { if (node.type.name === 'paragraph' && node.attrs.caption) out.push({ node, pos }); });
    return out;
  }
  async function selectImage() {
    ed().commands.setNodeSelection(imagePos());
    await sleep(150);
  }
  async function cursorIn(text, offset) {
    const pos = positionOf(n => n.isText && n.text.indexOf(text) !== -1);
    ed().commands.setTextSelection(pos + (offset == null ? 1 : offset));
    await sleep(150);
  }
  // La barre flottante ouverte d'une image (elle seule a « layer-front ») ou d'un tableau (« table-del ») et son bouton « Légende » : une image dans une case ouvre la barre de
  // l'image, un curseur dans la case celle du tableau, et chacune a son propre bouton.
  const BAR_MARKER = { image: 'layer-front', table: 'table-del' };
  const visibleBar = kind => Array.from(document.querySelectorAll('.v2-floating-toolbar.visible')).find(bar => bar.querySelector(`button[data-action="${BAR_MARKER[kind]}"]`)) || null;
  const captionButton = kind => { const bar = visibleBar(kind); return bar ? bar.querySelector('button[data-action="caption"]') : null; };
  // Une légende suit-elle immédiatement un tableau du document ?
  function captionAfterTable() {
    const doc = ed().state.doc;
    for (let i = 0; i + 1 < doc.childCount; i++) if (doc.child(i).type.name === 'table' && doc.child(i + 1).attrs.caption === true) return true;
    return false;
  }
  // Un clic comme la barre le reçoit : mousedown sur le bouton (js/editor-core.js:createFloatingPanel).
  async function press(button) {
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await sleep(150);
  }
  const buttonState = button => (button ? { title: button.title, label: button.getAttribute('aria-label'), active: button.classList.contains('is-active'), disabled: button.classList.contains('is-disabled'), aria: button.getAttribute('aria-disabled') } : null);
  const selectionParent = () => { const { $from } = ed().state.selection; return { name: $from.parent.type.name, caption: !!$from.parent.attrs.caption, empty: $from.parent.content.size === 0 }; };

  // === 1) L'attribut ===================================================================================================================================================
  cases.push({
    id: 'caption_is_a_paragraph_attribute_that_survives_the_html_round_trip',
    description: 'Une légende est un paragraphe ordinaire marqué `data-caption="true"` : l\'éditeur la relit et la réécrit telle quelle (alignement et texte formaté compris), un paragraphe ordinaire n\'a aucun attribut',
    run: async (h) => {
      const html = '<p>Avant</p><p data-caption="true" style="text-align: center">Une <strong>légende</strong> en <em>gras</em></p><p data-caption="false">Pas une légende</p><p>Après</p>';
      await setDoc(h, html);
      const list = captions();
      const out = written();
      const paragraphs = parse(out).querySelectorAll('p');
      const pass = list.length === 1 && list[0].node.textContent === 'Une légende en gras' && list[0].node.attrs.textAlign === 'center'
        && paragraphs[1].getAttribute('data-caption') === 'true' && paragraphs[1].style.textAlign === 'center' && paragraphs[1].querySelector('strong') && paragraphs[1].querySelector('em')
        && !paragraphs[0].hasAttribute('data-caption') && !paragraphs[2].hasAttribute('data-caption') && !paragraphs[3].hasAttribute('data-caption');
      return { pass: !!pass, notes: JSON.stringify({ captions: list.length, out }) };
    },
  });

  cases.push({
    id: 'caption_enter_at_the_end_opens_a_plain_paragraph_and_in_the_middle_splits_it_into_two_captions',
    description: 'Entrée à la fin d\'une légende ouvre un paragraphe ordinaire (comme dans Word) ; au milieu, la légende est coupée en deux légendes, comme un titre',
    run: async (h) => {
      await setDoc(h, '<p>Avant</p><p data-caption="true">Figure un</p><p>Après</p>');
      ed().commands.setTextSelection(positionOf(n => n.isText && n.text === 'Figure un') + 'Figure un'.length);
      await sleep(80);
      ed().commands.splitBlock();
      await sleep(80);
      const atEnd = docOutline();
      await setDoc(h, '<p>Avant</p><p data-caption="true">Figure deux</p><p>Après</p>');
      ed().commands.setTextSelection(positionOf(n => n.isText && n.text === 'Figure deux') + 'Figure'.length);
      await sleep(80);
      ed().commands.splitBlock();
      await sleep(80);
      const inMiddle = docOutline();
      return { pass: atEnd === 'p:Avant | p*:Figure un | p: | p:Après' && inMiddle === 'p:Avant | p*:Figure | p*: deux | p:Après', notes: JSON.stringify({ atEnd, inMiddle }) };
    },
  });

  // === 2) Le bouton de la barre de l'image =============================================================================================================================
  cases.push({
    id: 'caption_image_button_adds_an_empty_caption_under_the_image_with_the_cursor_inside_and_one_undo_removes_it',
    description: 'Image sélectionnée : le bouton « Légende » pose un paragraphe de légende vide juste sous le paragraphe de l\'image, y met le curseur, ne touche pas au paragraphe suivant ; un Annuler la retire',
    run: async (h) => {
      await setDoc(h, '<p>Avant</p><p>' + image() + '</p><p>Après</p>');
      await selectImage();
      const before = buttonState(captionButton('image'));
      await press(captionButton('image'));
      const after = docOutline();
      const cursor = selectionParent();
      const focused = !!document.activeElement && !!document.activeElement.closest('.tiptap');
      await h.clickButton('v2-btn-undo');
      await sleep(150);
      const undone = docOutline();
      await h.clickButton('v2-btn-redo');
      await sleep(150);
      const redone = docOutline();
      const pass = !!before && before.title === I18n.t('caption.addImage') && before.label === before.title && !before.active && !before.disabled && before.aria === 'false'
        && after === 'p:Avant | p:img | p*: | p:Après' && cursor.name === 'paragraph' && cursor.caption && cursor.empty && focused
        && undone === 'p:Avant | p:img | p:Après' && redone === after;
      return { pass, notes: JSON.stringify({ before, after, cursor, focused, undone, redone }) };
    },
  });

  cases.push({
    id: 'caption_image_button_with_a_caption_already_there_is_active_and_goes_to_it_without_adding_another',
    description: 'Une légende suit déjà l\'image : le bouton est actif (« Aller à la légende »), un clic ramène le curseur à la fin de son texte sans rien ajouter ni retirer',
    run: async (h) => {
      await setDoc(h, '<p>Avant</p><p>' + image() + '</p><p data-caption="true">Figure un</p><p>Après</p>');
      await selectImage();
      const state = buttonState(captionButton('image'));
      const htmlBefore = Editor.getHTML();
      await press(captionButton('image'));
      const sel = ed().state.selection;
      const cursor = selectionParent();
      const atEnd = sel.empty && sel.$from.parentOffset === 'Figure un'.length && sel.$from.parent.textContent === 'Figure un';
      const pass = !!state && state.active && !state.disabled && state.title === I18n.t('caption.goTo') && cursor.caption && atEnd && Editor.getHTML() === htmlBefore;
      return { pass, notes: JSON.stringify({ state, cursor, atEnd, same: Editor.getHTML() === htmlBefore }) };
    },
  });

  cases.push({
    id: 'caption_under_a_centered_image_or_an_aligned_paragraph_takes_the_same_alignment',
    description: 'Sous une image centrée, la légende est centrée ; sous une image dans un paragraphe aligné à droite, elle est alignée à droite ; sous une image ordinaire, elle n\'est pas alignée',
    run: async (h) => {
      const results = {};
      await setDoc(h, '<p>' + image(' data-align="center"') + '</p>');
      await selectImage();
      await press(captionButton('image'));
      results.centered = captions()[0] && captions()[0].node.attrs.textAlign;
      await setDoc(h, '<p style="text-align: right">' + image() + '</p>');
      await selectImage();
      await press(captionButton('image'));
      results.paragraphRight = captions()[0] && captions()[0].node.attrs.textAlign;
      await setDoc(h, '<p>' + image() + '</p>');
      await selectImage();
      await press(captionButton('image'));
      results.plain = captions()[0] ? captions()[0].node.attrs.textAlign : 'aucune légende';
      return { pass: results.centered === 'center' && results.paragraphRight === 'right' && !results.plain, notes: JSON.stringify(results) };
    },
  });

  cases.push({
    id: 'caption_button_is_greyed_with_its_reason_for_a_layered_or_wrapped_image_and_in_a_grid_and_a_click_changes_nothing',
    description: 'Image devant ou derrière le texte, image à gauche ou à droite (habillée), image dans une grille : le bouton est grisé (aria-disabled, jamais retiré) avec sa raison en info-bulle, et un clic ne change rien',
    run: async (h) => {
      const results = {};
      const locked = [
        ['front', ' data-layer="front"', 'caption.imageLayer'],
        ['behind', ' data-layer="behind"', 'caption.imageLayer'],
        ['left', ' data-align="left"', 'caption.imageFloat'],
        ['right', ' data-align="right"', 'caption.imageFloat'],
      ];
      for (const [name, extra, key] of locked) {
        await setDoc(h, '<p>Avant</p><p>' + image(extra) + '</p><p>Après</p>');
        await selectImage();
        const state = buttonState(captionButton('image'));
        const htmlBefore = Editor.getHTML();
        await press(captionButton('image'));
        results[name] = { state, unchanged: Editor.getHTML() === htmlBefore, ok: !!state && state.disabled && state.aria === 'true' && !state.active && state.title === I18n.t(key) && state.label === state.title };
      }
      const real = GridEditor.isActive;
      GridEditor.isActive = () => true;
      try {
        await setDoc(h, '<p>' + image() + '</p>');
        await selectImage();
        const state = buttonState(captionButton('image'));
        const htmlBefore = Editor.getHTML();
        await press(captionButton('image'));
        results.grid = { state, unchanged: Editor.getHTML() === htmlBefore, ok: !!state && state.disabled && state.aria === 'true' && state.title === I18n.t('caption.gridLocked') };
      } finally { GridEditor.isActive = real; }
      const pass = Object.values(results).every(r => r.ok && r.unchanged);
      return { pass, notes: JSON.stringify(results) };
    },
  });

  // === 3) Le bouton de la barre du tableau =============================================================================================================================
  cases.push({
    id: 'caption_table_button_adds_a_caption_right_after_the_table_before_the_next_paragraph_and_goes_to_it_the_second_time',
    description: 'Curseur dans une case : le bouton « Légende » de la barre du tableau pose la légende juste sous le tableau, avant le paragraphe suivant, curseur dedans ; le second clic (bouton actif) y ramène le curseur sans en ajouter une autre',
    run: async (h) => {
      await setDoc(h, '<p>Avant</p>' + TABLE + '<p>Après</p>');
      await cursorIn('Case B');
      const before = buttonState(captionButton('table'));
      await press(captionButton('table'));
      const after = docOutline();
      const cursor = selectionParent();
      await cursorIn('Case A');
      const again = buttonState(captionButton('table'));
      await press(captionButton('table'));
      const second = docOutline();
      const cursor2 = selectionParent();
      const pass = !!before && before.title === I18n.t('caption.addTable') && !before.active && !before.disabled
        && after === 'p:Avant | ' + TABLE_OUTLINE + ' | p*: | p:Après'
        && cursor.caption && cursor.empty && !!again && again.active && again.title === I18n.t('caption.goTo') && second === after && cursor2.caption;
      return { pass, notes: JSON.stringify({ before, after, cursor, again, second, cursor2 }) };
    },
  });

  cases.push({
    id: 'caption_after_a_table_at_the_end_of_the_document_and_for_an_image_in_a_cell_or_a_column',
    description: 'Un tableau en dernier bloc reçoit sa légende juste après lui (avant le paragraphe final que TipTap ajoute) ; une image dans une case de tableau ou dans une colonne reçoit la sienne dans la même case ou la même colonne',
    run: async (h) => {
      const results = {};
      await setDoc(h, '<p>Avant</p>' + TABLE);
      await cursorIn('Case A');
      await press(captionButton('table'));
      results.tableLast = captions().length === 1 && captionAfterTable();
      await setDoc(h, '<table><tbody><tr><td><p>' + image() + '</p></td><td><p>Case B</p></td></tr></tbody></table><p>Après</p>');
      await selectImage();
      await press(captionButton('image'));
      const cellNode = ed().state.doc.nodeAt(positionOf(n => n.type.name === 'tableCell'));
      results.cell = cellNode.childCount === 2 && cellNode.child(1).attrs.caption === true && ed().state.doc.lastChild.textContent === 'Après' && !captionAfterTable();
      await setDoc(h, '<div class="two-columns-zone"><div class="two-columns-column"><p>Un</p><p>' + image() + '</p></div><div class="two-columns-column"><p>Deux</p></div></div><p>Après</p>');
      await selectImage();
      await press(captionButton('image'));
      const column = ed().state.doc.nodeAt(positionOf(n => n.type.name === 'twoColumnsColumn'));
      results.column = column.childCount === 3 && column.child(2).attrs.caption === true;
      return { pass: results.tableLast === true && results.cell === true && results.column === true, notes: JSON.stringify(results) };
    },
  });

  // === 4) Le texte d'attente, Retour arrière, le suivi =================================================================================================================
  cases.push({
    id: 'caption_placeholder_shows_in_the_empty_caption_under_the_cursor_only_in_both_languages_and_is_not_saved',
    description: 'Le texte d\'attente « Légende… » (« Caption… » en anglais) se lit dans la légende vide où se trouve le curseur, à toute profondeur ; il disparaît à la frappe et quand le curseur part, et il n\'est jamais écrit dans le HTML',
    run: async (h) => {
      const lang = I18n.getLang();
      const results = {};
      try {
        for (const code of ['fr', 'en']) {
          I18n.setLang(code);
          await setDoc(h, '<p>Avant</p><p data-caption="true"></p>' + '<table><tbody><tr><td><p>Case</p><p data-caption="true"></p></td></tr></tbody></table>');
          const pos = captions()[0].pos + 1;
          ed().commands.setTextSelection(pos);
          await sleep(120);
          const first = ed().view.dom.querySelectorAll('p[data-caption]');
          const shown = first[0].getAttribute('data-caption-placeholder');
          const content = getComputedStyle(first[0], '::before').content;
          const hasClass = first[0].classList.contains('caption-empty');
          const elsewhere = !first[1].classList.contains('caption-empty');
          ed().commands.setTextSelection(captions()[1].pos + 1);
          await sleep(120);
          const inCell = ed().view.dom.querySelectorAll('p[data-caption]')[1].getAttribute('data-caption-placeholder');
          ed().commands.setTextSelection(1);
          await sleep(120);
          const gone = !ed().view.dom.querySelector('p.caption-empty');
          ed().commands.setTextSelection(captions()[0].pos + 1);
          await sleep(80);
          ed().commands.insertContent('x');
          await sleep(80);
          const typed = !ed().view.dom.querySelector('p.caption-empty');
          results[code] = { shown, content, hasClass, elsewhere, inCell, gone, typed, saved: /placeholder|caption-empty|Légende…|Caption…/.test(Editor.getHTML()) };
        }
      } finally { I18n.setLang(lang); }
      const ok = (r, text) => r.shown === text && r.content === '"' + text + '"' && r.hasClass && r.elsewhere && r.inCell === text && r.gone && r.typed && !r.saved;
      return { pass: ok(results.fr, 'Légende…') && ok(results.en, 'Caption…'), notes: JSON.stringify(results) };
    },
  });

  cases.push({
    id: 'caption_backspace_in_the_empty_caption_removes_it_after_an_image_and_after_a_table',
    description: 'Retour arrière dans une légende vide la retire, sous une image comme sous un tableau (où va le curseur, et ce que la touche efface dans une légende qui a du texte : à la vraie touche, dans verify-caption-mouse.mjs)',
    run: async (h) => {
      const results = {};
      await setDoc(h, '<p>Avant</p><p>' + image() + '</p><p data-caption="true"></p><p>Après</p>');
      ed().commands.setTextSelection(captions()[0].pos + 1);
      await sleep(80);
      ed().commands.keyboardShortcut('Backspace');
      await sleep(120);
      results.image = { outline: docOutline(), count: captions().length };
      await setDoc(h, '<p>Avant</p>' + TABLE + '<p data-caption="true"></p><p>Après</p>');
      ed().commands.setTextSelection(captions()[0].pos + 1);
      await sleep(80);
      ed().commands.keyboardShortcut('Backspace');
      await sleep(120);
      results.table = { outline: docOutline(), count: captions().length };
      const pass = results.image.outline === 'p:Avant | p:img | p:Après' && results.image.count === 0
        && results.table.outline === 'p:Avant | ' + TABLE_OUTLINE + ' | p:Après' && results.table.count === 0;
      return { pass, notes: JSON.stringify(results) };
    },
  });

  cases.push({
    id: 'caption_in_track_changes_is_a_tracked_insertion_accept_all_keeps_it_reject_all_removes_it',
    description: 'Suivi des modifications actif : poser une légende est une insertion suivie, le curseur arrive dans la légende (pas au début du paragraphe suivant) ; « Tout accepter » garde la légende et son texte, « Tout refuser » rend le document d\'origine, sans erreur',
    run: async (h) => {
      const errors = [];
      const onError = e => errors.push(String(e.message || e));
      window.addEventListener('error', onError);
      const results = {};
      try {
        for (const verdict of ['accept', 'reject']) {
          await setDoc(h, '<p>Avant</p><p>' + image() + '</p><p>Après</p>');
          const original = Editor.getHTML();
          if (!Editor.isTrackChangesOn()) await h.clickButton('v2-btn-track-changes');
          await selectImage();
          await press(captionButton('image'));
          const cursor = selectionParent();
          ed().commands.insertContent('Figure un');
          await sleep(120);
          const tracked = Editor.getHTML();
          await h.clickButton(verdict === 'accept' ? 'v2-btn-accept-all' : 'v2-btn-reject-all');
          await sleep(300);
          results[verdict] = { original, tracked, cursor, outline: docOutline(), html: Editor.getHTML() };
          if (Editor.isTrackChangesOn()) await h.clickButton('v2-btn-track-changes');
        }
      } finally {
        window.removeEventListener('error', onError);
        if (Editor.isTrackChangesOn()) await h.clickButton('v2-btn-track-changes');
      }
      const tracked = !!parse(results.accept.tracked).querySelector('ins');
      const inCaption = results.accept.cursor.caption && results.accept.cursor.empty;
      const pass = tracked && inCaption && results.accept.outline === 'p:Avant | p:img | p*:Figure un | p:Après' && !/<ins|<del/.test(results.accept.html)
        && results.reject.html === results.reject.original && errors.length === 0;
      return { pass, notes: JSON.stringify({ tracked, inCaption, accepted: results.accept.outline, rejected: results.reject.outline, acceptHtml: results.accept.html, errors }) };
    },
  });

  // === 5) Les rendus : éditeur, Lecture, PDF, Word, e-mail ===============================================================================================================
  const GREY = 'rgb(89, 89, 89)';
  const styleOf = el => { const cs = getComputedStyle(el); return { size: cs.fontSize, italic: cs.fontStyle, color: cs.color, line: cs.lineHeight, marginTop: cs.marginTop, marginBottom: cs.marginBottom }; };
  const isCaptionLook = st => st.size === '12px' && st.italic === 'italic' && st.color === GREY && st.marginTop === '0px' && st.marginBottom === '0px';

  cases.push({
    id: 'caption_is_small_italic_and_grey_in_the_editor_and_the_reader_with_the_same_line_height',
    description: 'La légende est en 12 px, italique, gris #595959, sans marge, dans l\'éditeur comme dans la Lecture, avec la même hauteur de ligne et le paragraphe d\'après au même endroit ; un texte qui porte sa propre taille ou sa propre couleur la garde ; un paragraphe ordinaire garde le style ordinaire',
    run: async (h) => {
      await setDoc(h, '<p>Avant</p><p data-caption="true">Figure un</p><p data-caption="true"><span style="font-size: 18pt; color: rgb(200, 0, 0)">Grande</span> suite</p><p>Après</p>');
      const grab = root => {
        const ps = Array.from(root.querySelectorAll('p'));
        return { plain: styleOf(ps[0]), caption: styleOf(ps[1]), own: styleOf(ps[2].querySelector('span')), rest: styleOf(ps[2]) };
      };
      const editor = grab(ed().view.dom);
      const reader = grab(await h.renderReaderMode(Editor.getHTML()));
      const position = h.compareEditorReaderPosition('Après');
      const ok = side => isCaptionLook(side.caption) && isCaptionLook(side.rest) && side.own.size === '24px' && side.own.color === 'rgb(200, 0, 0)' && side.own.italic === 'italic'
        && side.plain.size === '14px' && side.plain.italic === 'normal' && side.plain.color !== GREY;
      const pass = ok(editor) && ok(reader) && editor.caption.line === reader.caption.line && editor.caption.line !== editor.plain.line && position.found && Math.abs(position.deltaTop) <= 1 && Math.abs(position.deltaLeft) <= 1;
      return { pass, notes: JSON.stringify({ editor, reader, position }) };
    },
  });

  // Le style effectif (taille, italique, couleur) du premier run qui porte `text` : les propriétés d'un bloc valent pour ses runs tant qu'un run ne les redéfinit pas, comme pdfmake.
  function pdfRunStyle(node, text, inherited) {
    if (!node || typeof node !== 'object') return null;
    if (Array.isArray(node)) {
      for (const child of node) { const found = pdfRunStyle(child, text, inherited); if (found) return found; }
      return null;
    }
    const own = { fontSize: node.fontSize != null ? node.fontSize : inherited.fontSize, italics: node.italics != null ? node.italics : inherited.italics, color: node.color != null ? node.color : inherited.color };
    if (typeof node.text === 'string' && node.text.includes(text)) return own;
    for (const key of ['text', 'stack', 'columns']) {
      if (Array.isArray(node[key])) { const found = pdfRunStyle(node[key], text, own); if (found) return found; }
    }
    if (node.table && node.table.body) return pdfRunStyle(node.table.body, text, own);
    return null;
  }

  cases.push({
    id: 'caption_pdf_text_is_9pt_italic_grey_in_the_body_a_cell_and_a_column_and_an_explicit_size_wins',
    description: 'PDF : le texte d\'une légende est en 9 pt, italique, #595959 - dans le corps, dans une case de tableau et dans une colonne - ; un paragraphe ordinaire garde son style ; la taille ou la couleur posée sur un texte de la légende l\'emporte ; une légende vide a la hauteur d\'une ligne de 9 pt',
    run: async (h) => {
      await h.resetEditor();
      const html = '<p>Avant</p><p data-caption="true">Figure un</p>'
        + '<table><tbody><tr><td><p>Case</p><p data-caption="true">Légende de case</p></td></tr></tbody></table>'
        + '<div class="two-columns-zone" style="--layout-left: 50%;"><div class="two-columns-column"><p data-caption="true">Légende de colonne</p></div><div class="two-columns-column"><p>Droite</p></div></div>'
        + '<p data-caption="true"><span style="font-size: 18pt; color: #c80000">Grande</span> petite</p><p data-caption="true"></p><p>Après</p>';
      const out = await h.exportPdfContent(html);
      const none = { fontSize: null, italics: null, color: null };
      const style = text => pdfRunStyle(out.content, text, none);
      const found = { plain: style('Avant'), body: style('Figure un'), cell: style('Légende de case'), column: style('Légende de colonne'), big: style('Grande'), small: style('petite'), after: style('Après') };
      const isCaption = st => st && st.fontSize === 9 && st.italics === true && st.color === '#595959';
      const empties = h.flattenPdfContent(out.content).filter(b => b && typeof b.text === 'string' && b.text.trim() === '' && b.fontSize === 9);
      const pass = isCaption(found.body) && isCaption(found.cell) && isCaption(found.column) && isCaption(found.small)
        && found.big && found.big.fontSize === 18 && found.big.color === '#c80000' && found.big.italics === true
        && found.plain && found.plain.italics !== true && found.plain.color !== '#595959' && found.after && found.after.italics !== true && found.after.fontSize !== 9
        && empties.length >= 1;
      return { pass: !!pass, notes: JSON.stringify({ found, empties: empties.length, content: JSON.stringify(out.content).slice(0, 1200) }) };
    },
  });

  cases.push({
    id: 'caption_pdf_paints_the_caption_smaller_than_the_body_text',
    description: 'PDF lu sur ses pixels : le même mot est peint plus petit dans la légende que dans le corps (9 pt contre 10,5 pt, soit 0,86 à la police italique près), à la même marge de gauche',
    run: async (h) => {
      await h.resetEditor();
      const out = await h.exportPdfContent('<p>Légende</p><p data-caption="true">Légende</p>');
      const truth = await h.extractPdfGroundTruth(out.base64);
      const items = truth.pages[0].textItems.filter(i => i.str.trim() === 'Légende');
      const [body, cap] = items;
      const ratio = body && cap ? cap.width / body.width : null;
      return { pass: items.length === 2 && ratio > 0.78 && ratio < 0.95 && Math.abs(body.x - cap.x) < 1.5 && cap.y > body.y, notes: JSON.stringify({ items, ratio }) };
    },
  });

  cases.push({
    id: 'caption_docx_runs_are_9pt_italic_grey_and_an_explicit_size_wins',
    description: 'Word : les runs d\'une légende sont en 9 pt (18 demi-points), italique, couleur 595959 - dans le corps et dans une case - ; un paragraphe ordinaire garde son style ; une taille posée sur un texte de la légende l\'emporte',
    run: async (h) => {
      await h.resetEditor();
      const out = await h.exportDocxParts('<p>Avant</p><p data-caption="true">Figure un</p><table><tbody><tr><td><p data-caption="true">Légende de case</p></td></tr></tbody></table><p data-caption="true"><span style="font-size: 18pt">Grande</span> petite</p><p>Après</p>');
      const paragraphs = h.docxParagraphs(out.doc);
      const runOf = (text) => { for (const p of paragraphs) { const r = p.runs.find(run => run.text.includes(text)); if (r) return r; } return null; };
      const found = { plain: runOf('Avant'), body: runOf('Figure un'), cell: runOf('Légende de case'), big: runOf('Grande'), small: runOf('petite'), after: runOf('Après') };
      const isCaption = r => r && r.italics === true && r.sizeHalfPt === 18 && String(r.color).toUpperCase() === '595959';
      const pass = isCaption(found.body) && isCaption(found.cell) && isCaption(found.small) && found.big && found.big.sizeHalfPt === 36 && found.big.italics === true
        && found.plain && found.plain.italics === false && found.plain.sizeHalfPt !== 18 && found.after && found.after.italics === false;
      return { pass: !!pass, notes: JSON.stringify(found) };
    },
  });

  cases.push({
    id: 'caption_mailto_text_writes_the_caption_as_a_line_like_any_paragraph',
    description: 'E-mail (texte brut) : la légende est une ligne comme un paragraphe ordinaire, sans mot ni signe ajouté',
    run: async (h) => {
      const text = MailtoExport.plainTextFromHtml('<p>Avant</p><p data-caption="true">Figure un : le schéma</p><p>Après</p>');
      return { pass: text === 'Avant\n\nFigure un : le schéma\n\nAprès', notes: JSON.stringify({ text }) };
    },
  });

  // === 6) Au saut de page : la légende reste avec son image ou son tableau ==============================================================================================
  // Choix d'Antoine du 02/10 (« Rester ensemble ») : « au saut de page, la légende reste avec son image ou son tableau : jamais seule en haut de la page suivante (éditeur, PDF et Word) ».
  // L'éditeur et la Lecture comptent le bloc et ses légendes pour un seul bloc (js/header-footer-preview.js:computePageBreaks, js/reader-mode.js:computePageBreakOffsets) ; pour un tableau qui
  // se coupe entre deux lignes, la dernière ligne et la légende (js/table-page-cut.js) ; le PDF passe le premier bloc de la paire à la page suivante par le rappel `pageBreakBefore` de pdfmake
  // (js/pdf-export.js:captionKeepRule) et rend la dernière ligne du tableau à part ; le Word met « Conserver avec le suivant » sur le paragraphe de l'image et sur la dernière ligne du tableau.
  // Pour que les verdicts ne dépendent pas des polices de la machine, l'éditeur et la Lecture sont CALIBRÉS sur des mesures (la page est réglée pour que la coupure tombe à la moitié de
  // la légende) ; le PDF se juge à ce que pdf.js y lit, sur des marges du bas balayées de 2 pt en 2 pt à travers l'endroit où la légende ne tient plus (pdfmake est déterministe : ses polices
  // sont dans la page).
  const intro = n => Array.from({ length: n }, (_, i) => '<p>Introduction ' + i + '</p>').join('');
  const CAP = text => '<p data-caption="true">' + text + '</p>';
  const token = (row, line) => 'R' + String(row).padStart(2, '0') + 'L' + line;
  const tableOf = rows => '<table><tbody>' + Array.from({ length: rows }, (_, i) => '<tr><td><p>' + token(i, 0) + '</p></td><td><p>Valeur ' + i + '</p></td></tr>').join('') + '</tbody></table>';
  // Un tableau qu'on ne sait pas couper entre deux lignes (une case fusionnée sur toutes ses lignes : elles forment un seul groupe, js/table-page-cut.js:unitsOf) : il reste d'une pièce.
  const MERGED_TABLE = '<table><tbody><tr><td rowspan="3"><p>Fusion</p></td><td><p>B1</p></td></tr><tr><td><p>B2</p></td></tr><tr><td><p>C2</p></td></tr></tbody></table>';
  const PAGE_BREAK = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';

  const zoomOf = el => {
    const sheet = el.closest('.v2-page-sheet, .reader-content');
    const z = sheet ? parseFloat(getComputedStyle(sheet).zoom) : NaN;
    return (isFinite(z) && z > 0) ? z : 1;
  };
  const layoutHeight = el => el.getBoundingClientRect().height / zoomOf(el);
  const topLevel = root => Array.from(root.children).filter(k => k.tagName !== 'STYLE');
  const pageHeightPx = () => PageLayout.getPageSizePx().height;
  function setPageContentHeight(contentPx) {
    const halfMm = (pageHeightPx() - contentPx) / 2 / PageLayout.MM_TO_PX;
    PageLayout.setMarginsMm({ top: halfMm, bottom: halfMm, left: PageLayout.DEFAULT_MARGIN_MM, right: PageLayout.DEFAULT_MARGIN_MM });
  }
  function restoreLayout() {
    PageLayout.setMarginsMm(null);
    ['editor-container', 'reader-container'].forEach(id => document.getElementById(id).style.removeProperty('--pp-fit-zoom'));
    document.getElementById('reader-container').style.display = '';
    document.getElementById('editor-container').style.display = '';
  }
  const labelOf = el => (el.querySelector('img') ? 'IMG' : (el.hasAttribute('data-caption') ? 'CAPTION:' + el.textContent.trim() : el.textContent.trim()));
  // Ce qui ouvre la page 2 : le premier bloc (ou la première ligne d'un tableau, « ROW:R07L0 ») dont le texte est sous la première bande de saut de page.
  function firstOnPage2(containerSelector, root) {
    const bands = Array.from(document.querySelectorAll(containerSelector + ' .v2-page-band'));
    if (!bands.length) return { bands: 0, first: null, next: null };
    const bandBottom = bands[0].getBoundingClientRect().bottom;
    const items = [];
    topLevel(root).forEach(el => {
      if (el.classList.contains('tableWrapper') || el.tagName === 'TABLE') {
        Array.from(el.querySelectorAll('tbody > tr')).forEach(tr => items.push({ target: tr.querySelector('p'), label: 'ROW:' + tr.querySelector('p').textContent.trim() }));
      } else {
        items.push({ target: el, label: labelOf(el) });
      }
    });
    const at = items.findIndex(it => it.target.getBoundingClientRect().top >= bandBottom - 1);
    return { bands: bands.length, first: at >= 0 ? items[at].label : null, next: at >= 0 && items[at + 1] ? items[at + 1].label : null };
  }
  async function loadPaged(h, html) {
    await h.resetEditor();
    h.setA4Preview(true);
    PageLayout.setMarginsMm(null);
    Editor.setHTML(html);
    await sleep(450);
  }
  // Charge `html`, règle la page à la hauteur que `contentHeight(kids)` calcule sur les blocs mesurés (marges par défaut), puis lit ce qui ouvre la page 2 dans l'éditeur et dans la Lecture
  // réglée sur la MÊME hauteur : les deux doivent s'accorder.
  async function pagedEditorAndReader(h, html, contentHeight) {
    await loadPaged(h, html);
    const kids = topLevel(h.tiptap());
    const contentPx = contentHeight(kids);
    const savedHtml = Editor.getHTML();
    setPageContentHeight(contentPx);
    Editor.refreshPaginationPreview();
    await sleep(450);
    const editor = firstOnPage2('#editor-container', h.tiptap());
    const unchanged = Editor.getHTML() === savedHtml;
    const wrapper = await h.renderReaderMode(savedHtml);
    await sleep(450);
    const reader = firstOnPage2('#reader-container', wrapper);
    return { contentPx: Math.round(contentPx), editor, reader, unchanged };
  }
  const sumHeights = kids => kids.reduce((sum, el) => sum + layoutHeight(el), 0);
  const indexOfImage = kids => kids.findIndex(k => k.querySelector('img'));

  cases.push({
    id: 'caption_keep_an_image_goes_to_the_next_page_with_its_caption_in_the_editor_and_the_reader',
    description: 'Éditeur et Lecture : quand l\'image tient dans la page mais pas sa légende, l\'image passe à la page suivante AVEC sa légende (avant : la légende ouvrait la page 2 toute seule, l\'image restait seule en bas de la page 1) ; le document enregistré n\'est pas modifié',
    run: async (h) => {
      try {
        const html = intro(8) + '<p>' + image() + '</p>' + CAP('Figure un') + '<p>Après</p>';
        const got = await pagedEditorAndReader(h, html, kids => {
          const at = indexOfImage(kids);
          return sumHeights(kids.slice(0, at + 1)) + layoutHeight(kids[at + 1]) / 2;
        });
        // L'image et sa légende tiennent, c'est le paragraphe d'après qui ne tient plus : la couture est derrière la légende, qu'elle ne recouvre pas.
        const after = await pagedEditorAndReader(h, html, kids => {
          const at = indexOfImage(kids);
          return sumHeights(kids.slice(0, at + 2)) + layoutHeight(kids[at + 2]) / 2;
        });
        const caption = h.tiptap().querySelector('p[data-caption]');
        const band = document.querySelector('#editor-container .v2-page-band');
        const clear = !!caption && !!band && caption.getBoundingClientRect().bottom <= band.getBoundingClientRect().top + 0.5;
        const pass = got.editor.bands === 1 && got.editor.first === 'IMG' && got.editor.next === 'CAPTION:Figure un'
          && got.reader.bands === 1 && got.reader.first === 'IMG' && got.reader.next === 'CAPTION:Figure un' && got.unchanged
          && after.editor.bands === 1 && after.editor.first === 'Après' && after.reader.bands === 1 && after.reader.first === 'Après' && clear;
        return { pass, notes: JSON.stringify({ got, after, clear }) };
      } finally { restoreLayout(); }
    },
  });

  cases.push({
    id: 'caption_keep_the_last_row_of_a_table_goes_to_the_next_page_with_its_caption_in_the_editor_and_the_reader',
    description: 'Éditeur et Lecture : quand la dernière ligne d\'un tableau tient dans la page mais pas sa légende, la dernière ligne passe à la page suivante avec sa légende (le reste du tableau se coupe comme avant, entre deux lignes) ; avant, la légende ouvrait la page 2 toute seule',
    run: async (h) => {
      try {
        const html = intro(6) + tableOf(8) + CAP('Tableau un') + '<p>Après</p>';
        const got = await pagedEditorAndReader(h, html, kids => {
          const wrapper = kids.find(k => k.classList.contains('tableWrapper'));
          const at = kids.indexOf(wrapper);
          return sumHeights(kids.slice(0, at + 1)) + layoutHeight(kids[at + 1]) / 2;
        });
        const pass = got.editor.bands === 1 && got.editor.first === 'ROW:' + token(7, 0) && got.editor.next === 'CAPTION:Tableau un'
          && got.reader.bands === 1 && got.reader.first === 'ROW:' + token(7, 0) && got.reader.next === 'CAPTION:Tableau un' && got.unchanged;
        return { pass, notes: JSON.stringify(got) };
      } finally { restoreLayout(); }
    },
  });

  cases.push({
    id: 'caption_keep_the_last_group_of_merged_rows_goes_to_the_next_page_with_its_caption_in_the_editor_and_the_reader',
    description: 'Éditeur et Lecture : quand les dernières lignes d\'un tableau, liées par une case fusionnée, tiennent dans la page mais pas la légende, tout le groupe passe à la page suivante avec sa légende (comme la dernière ligne d\'un tableau simple) ; avant, la légende ouvrait la page 2 toute seule',
    run: async (h) => {
      try {
        const group = '<tr><td rowspan="2"><p>' + token(6, 0) + '</p></td><td><p>Valeur 6</p></td></tr><tr><td><p>' + token(7, 0) + '</p></td></tr>';
        const html = intro(6) + tableOf(6).replace('</tbody></table>', group + '</tbody></table>') + CAP('Tableau un') + '<p>Après</p>';
        const got = await pagedEditorAndReader(h, html, kids => {
          const wrapper = kids.find(k => k.classList.contains('tableWrapper'));
          const at = kids.indexOf(wrapper);
          return sumHeights(kids.slice(0, at + 1)) + layoutHeight(kids[at + 1]) / 2;
        });
        // La page 2 s'ouvre sur la première ligne du groupe (celle dont le texte est sous la bande), la ligne liée à elle la suit.
        const pass = got.editor.bands === 1 && got.editor.first === 'ROW:' + token(6, 0) && got.editor.next === 'ROW:' + token(7, 0)
          && got.reader.bands === 1 && got.reader.first === 'ROW:' + token(6, 0) && got.reader.next === 'ROW:' + token(7, 0) && got.unchanged;
        return { pass, notes: JSON.stringify(got) };
      } finally { restoreLayout(); }
    },
  });

  cases.push({
    id: 'caption_keep_a_table_that_cannot_be_cut_goes_whole_to_the_next_page_with_its_caption',
    description: 'Éditeur et Lecture : un tableau qu\'on ne coupe pas entre deux lignes (case fusionnée) qui tient dans la page sans sa légende passe entier à la page suivante avec elle (avant : il restait en bas de la page 1, la légende seule en haut de la page 2)',
    run: async (h) => {
      try {
        const html = intro(6) + MERGED_TABLE + CAP('Tableau fusionné') + '<p>Après</p>';
        const got = await pagedEditorAndReader(h, html, kids => {
          const wrapper = kids.find(k => k.classList.contains('tableWrapper'));
          const at = kids.indexOf(wrapper);
          return sumHeights(kids.slice(0, at + 1)) + layoutHeight(kids[at + 1]) / 2;
        });
        const pass = got.editor.bands === 1 && got.editor.first === 'ROW:Fusion' && got.reader.bands === 1 && got.reader.first === 'ROW:Fusion' && got.unchanged;
        return { pass, notes: JSON.stringify(got) };
      } finally { restoreLayout(); }
    },
  });

  cases.push({
    id: 'caption_keep_changes_nothing_when_the_caption_fits_or_belongs_to_nothing',
    description: 'Éditeur et Lecture : rien ne change quand l\'image et sa légende tiennent dans la page (aucune coupure), pour une légende qui suit un simple paragraphe (elle ouvre la page 2 seule, comme avant), pour une image et sa légende plus hautes que 90 % d\'une page (rien à garder : le PDF ne le pourrait pas), pour une légende vide en fin de document (elle n\'ouvre pas de page) et quand un saut de page sépare l\'image de sa légende',
    run: async (h) => {
      try {
        const out = {};
        const imageAndCaption = intro(8) + '<p>' + image() + '</p>' + CAP('Figure un');
        // 1) tout tient, à 6 px près (moins que la hauteur d'une légende : une légende comptée deux fois ferait passer le dernier paragraphe à la page suivante), éditeur et Lecture
        const fits = await pagedEditorAndReader(h, imageAndCaption + '<p>Après</p>', kids => sumHeights(kids) + 6);
        out.fits = [fits.editor.bands, fits.reader.bands];
        // 2) une légende sous un paragraphe de texte : jamais liée à lui, elle ouvre la page 2 comme avant
        const orphan = await pagedEditorAndReader(h, intro(8) + '<p>Texte</p>' + CAP('Légende orpheline') + '<p>Après</p>', kids => {
          const at = kids.findIndex(k => k.textContent === 'Texte');
          return sumHeights(kids.slice(0, at + 1)) + layoutHeight(kids[at + 1]) / 2;
        });
        out.orphan = { editor: orphan.editor.first, reader: orphan.reader.first };
        // 3) une image presque aussi haute que la page (la page est réglée juste sous l'image et la moitié de sa légende : le bloc et sa légende dépassent 90 % de la page) : la légende
        // ouvre la page 2 comme avant
        const tall = await pagedEditorAndReader(h, '<p>Avant</p><p>' + image(' style="width: 100px; height: 200px"').replace('style="width: 120px"', '') + '</p>' + CAP('Figure haute') + '<p>Après</p>', kids => {
          const at = indexOfImage(kids);
          return sumHeights(kids.slice(0, at + 1)) + layoutHeight(kids[at + 1]) / 2;
        });
        out.tall = { editor: tall.editor.first, reader: tall.reader.first };
        // 4) légende vide en fin de document : elle n'ouvre pas de page, l'image reste sur la page 1
        const blank = await pagedEditorAndReader(h, intro(8) + '<p>' + image() + '</p>' + CAP(''), kids => {
          const at = indexOfImage(kids);
          return sumHeights(kids.slice(0, at + 1)) + 4;
        });
        out.blankTail = blank.editor.bands + blank.reader.bands;
        // 5) un saut de page entre l'image et sa légende : la paire n'existe pas, l'image reste sur la page 1
        const broken = await pagedEditorAndReader(h, intro(8) + '<p>' + image() + '</p>' + PAGE_BREAK + CAP('Figure un'), kids => sumHeights(kids) + 400);
        out.broken = { bands: broken.editor.bands, first: broken.editor.first };
        const pass = out.fits[0] === 0 && out.fits[1] === 0 && out.orphan.editor === 'CAPTION:Légende orpheline' && out.orphan.reader === 'CAPTION:Légende orpheline'
          && out.tall.editor === 'CAPTION:Figure haute' && out.tall.reader === 'CAPTION:Figure haute'
          && out.blankTail === 0 && out.broken.bands === 1 && out.broken.first === 'CAPTION:Figure un';
        return { pass, notes: JSON.stringify(out) };
      } finally { restoreLayout(); }
    },
  });

  // --- PDF : lu par pdf.js ---
  const PDF_MARGIN_PT = 28;
  async function pdfAt(h, html, bottomPt) {
    const result = await h.exportPdfContent(html, null, { top: PDF_MARGIN_PT, right: PDF_MARGIN_PT, bottom: bottomPt, left: PDF_MARGIN_PT });
    return { result, gt: await h.extractPdfGroundTruth(result.base64) };
  }
  const pdfText = (gt, re) => { const found = []; gt.pages.forEach((page, p) => page.textItems.forEach(it => { if (re.test(it.str)) found.push({ page: p, y: it.y, str: it.str }); })); return found; };
  const introLine = i => '<p>INTRO' + String(i).padStart(2, '0') + '</p>';
  const introLines = n => Array.from({ length: n }, (_, i) => introLine(i)).join('');
  // Le nombre de lignes d'introduction qui amène la légende juste au-dessus du bas de la page 1 (tout tient encore) et ce que le PDF y mesure : la page, l'écart entre deux lignes, le bas
  // de l'image ou de la dernière ligne (`anchorY`) et la base de la légende (`capY`).
  async function packedNearBottom(h, makeHtml, anchorOf) {
    const probe = await pdfAt(h, makeHtml(10), PDF_MARGIN_PT);
    const lines = pdfText(probe.gt, /^INTRO\d\d$/);
    const pitch = (lines[lines.length - 1].y - lines[0].y) / (lines.length - 1);
    const pageHeight = probe.gt.pages[0].height;
    const capY0 = pdfText(probe.gt, /LEGENDEX/)[0].y;
    let n = 10 + Math.max(0, Math.floor((pageHeight - PDF_MARGIN_PT - 6 - capY0) / pitch));
    for (let tries = 0; tries < 6; tries++) {
      const packed = await pdfAt(h, makeHtml(n), PDF_MARGIN_PT);
      const cap = pdfText(packed.gt, /LEGENDEX/)[0];
      if (packed.gt.pages.length === 1) return { n, pitch, pageHeight, capY: cap.y, anchorY: anchorOf(packed.gt) };
      n--;
    }
    throw new Error('Le document ne tient pas sur une page, même raccourci');
  }
  // Balaie la marge du bas de 2 pt en 2 pt à travers l'endroit où la légende ne tient plus sur la page 1 et rend ce que le PDF dit de chaque marge.
  async function sweepBottomMargin(h, makeHtml, packed, pageOf) {
    const from = Math.floor(packed.pageHeight - packed.capY - 16);
    const to = Math.ceil(packed.pageHeight - packed.anchorY + 4);
    const samples = [];
    for (let bottom = from; bottom <= to; bottom += 2) {
      const { gt } = await pdfAt(h, makeHtml(packed.n), bottom);
      const sample = Object.assign({ bottom, pages: gt.pages.length, empty: gt.pages.filter(pg => !pg.textItems.length && !pg.images.length).length, lost: pdfText(gt, /^Après$/).length === 1 ? 0 : 1 }, pageOf(gt));
      samples.push(sample);
    }
    return samples;
  }
  const imageHtml = n => introLines(n) + '<p>' + image() + '</p>' + CAP('LEGENDEX') + '<p>Après</p>';

  cases.push({
    id: 'caption_keep_pdf_an_image_never_leaves_its_caption_alone_at_the_top_of_a_page',
    description: 'PDF (lu par pdf.js) : quelle que soit la marge du bas, l\'image et sa légende sont sur la même page ; quand la légende ne tient plus en bas de la page 1, l\'image passe à la page 2 avec elle (avant : la légende ouvrait la page 2 toute seule) ; aucune page blanche, rien de perdu',
    run: async (h) => {
      await h.resetEditor();
      const packed = await packedNearBottom(h, imageHtml, gt => { const img = gt.pages[0].images[0]; return img.y + img.height; });
      const samples = await sweepBottomMargin(h, imageHtml, packed, gt => ({
        imagePage: gt.pages.findIndex(pg => pg.images.length > 0),
        captionPage: (pdfText(gt, /LEGENDEX/)[0] || { page: -1 }).page,
      }));
      const together = samples.every(s => s.imagePage === s.captionPage);
      const moved = samples.filter(s => s.imagePage === 1).length;
      const clean = samples.every(s => s.empty === 0 && s.lost === 0 && s.pages <= 3);
      const pass = samples.length >= 5 && together && moved >= 3 && samples.some(s => s.imagePage === 0) && clean;
      return { pass, notes: JSON.stringify({ packed, together, moved, clean, samples: samples.map(s => [s.bottom, s.imagePage, s.captionPage]) }) };
    },
  });

  const tableHtml = n => introLines(n) + tableOf(6) + CAP('LEGENDEX') + '<p>Après</p>';
  cases.push({
    id: 'caption_keep_pdf_the_last_row_of_a_table_never_leaves_its_caption_alone_at_the_top_of_a_page',
    description: 'PDF (lu par pdf.js) : quelle que soit la marge du bas, la dernière ligne du tableau et sa légende sont sur la même page ; quand la légende ne tient plus, la dernière ligne la suit à la page 2 (le tableau se coupe entre deux lignes, aucune ligne coupée en deux) ; avant, la légende ouvrait la page 2 toute seule',
    run: async (h) => {
      await h.resetEditor();
      const lastRow = new RegExp('^' + token(5, 0) + '$');
      const packed = await packedNearBottom(h, tableHtml, gt => pdfText(gt, lastRow)[0].y);
      const samples = await sweepBottomMargin(h, tableHtml, packed, gt => {
        const rows = [0, 1, 2, 3, 4, 5].map(i => (pdfText(gt, new RegExp('^' + token(i, 0) + '$'))[0] || { page: -1 }).page);
        return { rows, lastRowPage: rows[5], captionPage: (pdfText(gt, /LEGENDEX/)[0] || { page: -1 }).page };
      });
      const together = samples.every(s => s.lastRowPage === s.captionPage);
      const cutBeforeLast = samples.filter(s => s.rows[4] === 0 && s.rows[5] === 1).length;
      const clean = samples.every(s => s.empty === 0 && s.lost === 0 && s.pages <= 3 && s.rows.every(r => r >= 0));
      const pass = samples.length >= 5 && together && cutBeforeLast >= 2 && samples.some(s => s.lastRowPage === 0) && clean;
      return { pass, notes: JSON.stringify({ packed, together, cutBeforeLast, clean, samples: samples.map(s => [s.bottom, s.rows.join(''), s.captionPage]) }) };
    },
  });

  cases.push({
    id: 'caption_keep_pdf_only_pairs_that_fit_in_a_page_are_kept_and_nothing_changes_without_a_caption',
    description: 'PDF : le rappel pageBreakBefore n\'existe que s\'il y a une image ou un tableau suivi d\'une légende qui tiennent ensemble dans une page ; un tableau sans légende reste un seul tableau, avec une légende il est rendu en deux morceaux (la dernière ligne seule) dont le second garde son trait du haut quand il ouvre une page ; une image presque aussi haute que la page n\'est pas gardée',
    run: async (h) => {
      await h.resetEditor();
      const lead = 'Avant';
      const plain = await h.exportPdfContent('<p>' + lead + '</p>' + tableOf(6) + '<p>Après</p>');
      const withCaption = await h.exportPdfContent('<p>' + lead + '</p>' + tableOf(6) + CAP('Légende') + '<p>Après</p>');
      const imageOnly = await h.exportPdfContent('<p>' + lead + '</p><p>' + image() + '</p><p>Après</p>');
      const imageCaption = await h.exportPdfContent('<p>' + lead + '</p><p>' + image() + '</p>' + CAP('Légende') + '<p>Après</p>');
      const tallImage = '<p>' + image(' style="width: 100px; height: 1000px"').replace('style="width: 120px"', '') + '</p>';
      const tall = await h.exportPdfContent('<p>' + lead + '</p>' + tallImage + CAP('Légende') + '<p>Après</p>');
      const tablesOf = out => { const found = []; const walk = n => { if (!n || typeof n !== 'object') return; if (Array.isArray(n)) { n.forEach(walk); return; } if (n.table) found.push(n); ['stack', 'columns'].forEach(k => n[k] && walk(n[k])); }; walk(out.content); return found; };
      const plainTables = tablesOf(plain);
      const keptTables = tablesOf(withCaption);
      const tail = keptTables[1];
      const tailLine = tail && tail.layout ? { top: tail.layout.hLineWidth(0, { pageBreak: undefined }), moved: tail.layout.hLineWidth(0, { pageBreak: 'before' }), bottom: tail.layout.hLineWidth(1, {}) } : null;
      const got = {
        plainTables: plainTables.length, plainHook: typeof plain.docDefinition.pageBreakBefore,
        keptTables: keptTables.map(t => t.table.body.length), keptHook: typeof withCaption.docDefinition.pageBreakBefore,
        imageHook: typeof imageOnly.docDefinition.pageBreakBefore, imageCaptionHook: typeof imageCaption.docDefinition.pageBreakBefore, tallHook: typeof tall.docDefinition.pageBreakBefore,
        tailLine, tailFlag: !!(tail && tail.table.dontBreakRows),
      };
      const pass = got.plainTables === 1 && got.plainHook === 'undefined' && JSON.stringify(got.keptTables) === '[5,1]' && got.keptHook === 'function' && got.tailFlag
        && got.imageHook === 'undefined' && got.imageCaptionHook === 'function' && got.tallHook === 'undefined'
        && !!tailLine && tailLine.top === 0 && tailLine.moved === 0.5 && tailLine.bottom === 0.5;
      return { pass, notes: JSON.stringify(got) };
    },
  });

  // --- Word ---
  cases.push({
    id: 'caption_keep_docx_the_image_and_the_last_row_keep_with_next_so_the_caption_stays_with_them',
    description: 'Word (OOXML dézippé) : « Conserver avec le suivant » (w:keepNext) sur le paragraphe de l\'image que suit une légende, sur la dernière ligne d\'un tableau qui se coupe entre deux lignes, sur toutes les lignes d\'un tableau qu\'on ne coupe pas, et sur chaque légende que suit une autre légende ; jamais sur la dernière légende, un paragraphe ordinaire, une image ou un tableau sans légende',
    run: async (h) => {
      await h.resetEditor();
      const html = '<p>Avant</p>'
        + '<p>' + image() + '</p>' + CAP('Figure un')
        + tableOf(3).replace(/R0/g, 'A0') + CAP('Tableau un')
        + MERGED_TABLE.replace(/Fusion|B1|B2|C1|C2/g, m => 'M' + m) + CAP('Tableau fusionné')
        + '<p>Texte seul</p>' + CAP('Légende orpheline')
        + '<p>' + image() + '</p>' + CAP('Double un') + CAP('Double deux')
        + '<p>' + image() + '</p><p>Image sans légende</p>'
        + tableOf(2).replace(/R0/g, 'S0') + '<p>Après</p>';
      const out = await h.exportDocxParts(html);
      const keepNext = p => !!p.getElementsByTagName('w:pPr')[0] && p.getElementsByTagName('w:pPr')[0].getElementsByTagName('w:keepNext').length > 0;
      const textOf = p => Array.from(p.getElementsByTagName('w:t')).map(t => t.textContent).join('');
      const paragraphs = Array.from(out.doc.getElementsByTagName('w:p')).map(p => ({ text: textOf(p), drawing: p.getElementsByTagName('w:drawing').length > 0, keep: keepNext(p) }));
      const named = text => paragraphs.find(p => p.text.includes(text));
      const images = paragraphs.filter(p => p.drawing);
      const got = {
        before: named('Avant').keep, imageWithCaption: images[0].keep, caption: named('Figure un').keep,
        cutRows: ['A00L0', 'A01L0', 'A02L0'].map(t => named(t).keep), tableCaption: named('Tableau un').keep,
        mergedRows: ['MFusion', 'MB1', 'MB2', 'MC2'].map(t => named(t).keep), mergedCaption: named('Tableau fusionné').keep,
        text: named('Texte seul').keep, orphanCaption: named('Légende orpheline').keep,
        doubleImage: images[1].keep, doubleOne: named('Double un').keep, doubleTwo: named('Double deux').keep,
        lonelyImage: images[2].keep, lonelyText: named('Image sans légende').keep, plainRows: ['S00L0', 'S01L0'].map(t => named(t).keep), after: named('Après').keep,
      };
      const pass = got.before === false && got.imageWithCaption === true && got.caption === false
        && JSON.stringify(got.cutRows) === '[false,false,true]' && got.tableCaption === false
        && got.mergedRows.every(k => k === true) && got.mergedCaption === false
        && got.text === false && got.orphanCaption === false
        && got.doubleImage === true && got.doubleOne === true && got.doubleTwo === false
        && got.lonelyImage === false && got.lonelyText === false && got.plainRows.every(k => k === false) && got.after === false;
      return { pass, notes: JSON.stringify(got) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.caption = cases;
})();
