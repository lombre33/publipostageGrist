// Suite "blockAnim" - l'ANIMATION d'un élément du texte d'une diapositive (js/block-anim.js, js/frame-anim.js, js/pptx-export.js ; demande d'Antoine du 13/11 : « chaque élément de la page, hors éléments
// de fond, doit pouvoir avoir une animation », « un paragraphe à la fois » fidèle à PowerPoint) :
//  1) le MODÈLE : le réglage `data-ff-anim` d'un paragraphe, d'un titre, d'un point de liste, d'une case à cocher, d'une image et d'un tableau fait l'aller-retour du HTML ; Entrée n'en copie rien au
//     paragraphe qu'elle ouvre ; l'élément du curseur (le point, non son paragraphe ; le tableau, non sa case) est visé ; un décor (image derrière le texte) n'est jamais visé ;
//  2) l'EXPORT POWERPOINT : chaque paragraphe ou point de liste devient une plage de paragraphes de sa forme (`txEl/pRg`), une image et un tableau leur propre effet, dans l'ordre du texte (les cadres
//     d'abord, puis le texte).
// Le diaporama, la fenêtre « Animation… » et le menu « Objets » sont à la souris, dans dev-tests/verify-frame-anim.mjs ; l'import d'un « paragraphe à la fois » dans scenarios-pptx-import.js.
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const editor = () => EditorCore.getEditor();
  const DATA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const table = anim => `<table${anim ? ` data-ff-anim="${anim}"` : ''}><tbody><tr><td colwidth="160"><p>A</p></td><td colwidth="160"><p>B</p></td></tr></tbody></table>`;

  cases.push({
    id: 'blockanim_the_setting_of_each_element_round_trips_the_html_and_enter_does_not_copy_it',
    description: 'Le réglage d\'animation d\'un paragraphe, d\'un titre, d\'un point de liste, d\'une case à cocher, d\'une image et d\'un tableau est écrit sur l\'élément lui-même et relu ; Entrée à la fin d\'un élément animé ouvre un élément qui ne l\'est pas ; un seul Ctrl+Z défait un réglage',
    run: async (h) => {
      await h.resetEditor();
      const html = '<h2 data-ff-anim="appear">Titre</h2><p data-ff-anim="fade">Texte</p><ul><li data-ff-anim="fly:l"><p>Un</p><ul><li><p>Sous</p></li></ul></li></ul>'
        + '<ul data-type="taskList"><li data-type="taskItem" data-checked="false" data-ff-anim="wipe:b"><p>Case</p></li></ul>' + table('zoom') + `<p><img class="editor-image" src="${DATA}" style="width: 60px" data-ff-anim="fade with"></p><p>Libre</p>`;
      Editor.setHTML(html);
      await sleep(300);
      const saved = new DOMParser().parseFromString('<body>' + Editor.getHTML() + '</body>', 'text/html').body;
      const seen = Array.from(saved.querySelectorAll('[data-ff-anim]')).map(el => el.tagName + (el.getAttribute('data-type') ? '[' + el.getAttribute('data-type') + ']' : '') + '=' + el.getAttribute('data-ff-anim'));
      const wanted = ['H2=appear', 'P=fade', 'LI=fly:l', 'LI[taskItem]=wipe:b', 'TABLE=zoom', 'IMG=fade with'];
      const free = Array.from(saved.querySelectorAll('p')).find(p => p.textContent === 'Libre');
      // Entrée à la fin de « Texte » : le nouveau paragraphe n'est pas animé.
      let at = -1;
      editor().state.doc.descendants((node, pos) => { if (at < 0 && node.type.name === 'paragraph' && node.textContent === 'Texte') at = pos + node.nodeSize - 1; });
      editor().chain().focus().setTextSelection(at).run();
      editor().commands.splitBlock();
      await sleep(100);
      const after = [];
      editor().state.doc.descendants((node) => { if (node.type.name === 'paragraph' && /^(Texte|)$/.test(node.textContent) && node.attrs.anim !== undefined) after.push(node.textContent + '=' + node.attrs.anim); });
      // Un réglage posé par patch : un seul pas d'historique.
      let first = -1;
      editor().state.doc.descendants((node, pos) => { if (first < 0 && node.type.name === 'paragraph' && node.textContent === 'Libre') first = pos; });
      const patched = BlockAnim.patch(editor(), first, 'zoom');
      const set = editor().state.doc.nodeAt(first).attrs.anim;
      editor().commands.undo();
      const undone = editor().state.doc.nodeAt(first).attrs.anim;
      const pass = wanted.every(item => seen.includes(item)) && seen.length === wanted.length && !free.hasAttribute('data-ff-anim')
        && after.join('|').startsWith('Texte=fade|=') && !/=fade\|=fade/.test(after.join('|')) && patched === true && set === 'zoom' && undone === '';
      return { pass, notes: JSON.stringify({ seen, after, patched, set, undone }) };
    },
  });

  cases.push({
    id: 'blockanim_the_cursor_aims_at_the_point_not_its_paragraph_the_table_not_its_cell_and_never_at_a_decor',
    description: 'L\'élément visé par le curseur est le point de liste (non son paragraphe), le sous-point (non son parent), le tableau (non sa case), le titre ou le paragraphe ; une image sélectionnée l\'est elle-même, sauf derrière le texte (un décor) ; hors de tout élément, rien',
    run: async (h) => {
      await h.resetEditor();
      Editor.setHTML('<h2>Titre</h2><p>Texte</p><ul><li><p>Un</p><ul><li><p>Sous</p></li></ul></li></ul>' + table('') + `<p><img class="editor-image" src="${DATA}" style="width: 60px"></p><p><img class="editor-image" src="${DATA}" style="width: 60px" data-layer="behind"></p>`);
      await sleep(300);
      const place = (text) => { let at = -1; editor().state.doc.descendants((node, pos) => { if (at < 0 && node.isText && node.text === text) at = pos + 1; }); editor().chain().focus().setTextSelection(at).run(); };
      const aim = (text) => { place(text); const unit = BlockAnim.unitAt(editor().state); return unit ? unit.node.type.name + ':' + unit.node.textContent.slice(0, 8) : 'rien'; };
      const aimed = { title: aim('Titre'), text: aim('Texte'), point: aim('Un'), sub: aim('Sous'), cell: aim('A') };
      const images = [];
      editor().state.doc.descendants((node, pos) => { if (node.type.name === 'editorImage') images.push({ pos, layer: node.attrs.layer }); });
      const pick = (index) => { editor().chain().focus().setNodeSelection(images[index].pos).run(); const unit = BlockAnim.unitAt(editor().state); return unit ? unit.node.type.name : 'rien'; };
      const aimedImages = { front: pick(0), behind: pick(1), decor: images[1] && images[1].layer };
      const pass = aimed.title === 'heading:Titre' && aimed.text === 'paragraph:Texte' && aimed.point.startsWith('listItem:Un') && aimed.sub === 'listItem:Sous' && aimed.cell === 'table:AB'
        && aimedImages.front === 'editorImage' && (aimedImages.decor !== 'behind' || aimedImages.behind === 'rien');
      return { pass, notes: JSON.stringify({ aimed, aimedImages }) };
    },
  });

  cases.push({
    id: 'blockanim_powerpoint_export_writes_each_paragraph_point_image_and_table_as_an_effect_frames_first_then_the_text',
    description: 'L\'export PowerPoint écrit un effet par élément animé : un paragraphe ou un point de liste (avec ses sous-points) est une plage `txEl/pRg` de sa forme, une image et un tableau sont leur propre objet ; le départ (clic, avec) est gardé ; les éléments d\'un cadre passent avant ceux du texte ; « un paragraphe à la fois » est au bloc de construction',
    run: async () => {
      await ExportEngines.ensure('pptx');
      const frame = FreeFrame.html({ x: 40, y: 40, w: 330, h: 190 }, '<p data-ff-anim="fade">Cadre un</p><p data-ff-anim="fade with">Cadre deux</p>' + table('zoom'));
      const body = '<h2 data-ff-anim="appear">Titre</h2><p data-ff-anim="fade">Intro</p><ul><li data-ff-anim="fly:l"><p>Un</p><ul><li><p>Sous</p></li></ul></li><li><p>Deux</p></li></ul>'
        + table('wipe:b') + `<p><img src="${DATA}" width="60" height="60" data-ff-anim="zoom"></p>`;
      const blob = await PptxExport.fromHtml(frame + body, { title: 'Essai' });
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const doc = new DOMParser().parseFromString(await zip.file('ppt/slides/slide1.xml').async('string'), 'application/xml');
      const effects = Array.from(doc.getElementsByTagNameNS('*', 'cTn')).filter(node => node.getAttribute('presetID'));
      const target = node => node.getElementsByTagNameNS('*', 'spTgt')[0];
      const rangeOf = (node) => { const range = node.getElementsByTagNameNS('*', 'pRg')[0]; return range ? range.getAttribute('st') + '-' + range.getAttribute('end') : ''; };
      const ids = effects.map(node => target(node).getAttribute('spid'));
      const kinds = effects.map(node => node.getAttribute('presetID')).join(',');
      const starts = effects.map(node => node.getAttribute('nodeType').replace('Effect', '')).join(',');
      const ranges = effects.map(rangeOf).join(',');
      const builds = Array.from(doc.getElementsByTagNameNS('*', 'bldP')).map(node => node.getAttribute('build') || '-');
      const pass = !doc.querySelector('parsererror') && kinds === '10,10,53,1,10,2,22,53' && starts === 'click,with,click,click,click,click,click,click' && ranges === '0-0,1-1,,0-0,0-0,1-2,,'
        && ids[0] === ids[1] && ids[2] !== ids[0] && ids[3] !== ids[4] && ids[4] === ids[5] && new Set(ids).size === 6
        && builds.filter(item => item === 'p').length === 3;
      return { pass, notes: JSON.stringify({ kinds, starts, ranges, ids, builds }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.blockAnim = cases;
})();
