// Suite "linkedTable" - un tableau de document LIÉ à un modèle Grille (09/10, lot 6a sur 6 du tableau de document, « En direct » ; Antoine : « comme sur un Gdocs, intégrer un tableau qui
// soit en fait un modèle grille »). Le tableau porte le numéro du modèle (`data-linked-template`) et ses cases sont celles du modèle au moment de la pose (js/linked-table.js). Cette
// étape pose le lien ; la mise à jour (lots 6b et 6c) vient après. Ici, sans la souris (la ligne du menu du bouton Tableau, la liste, le repère et la barre à 700x400, clair et sombre,
// sont à dev-tests/verify-linked-table-mouse.mjs, groupe linkedTableMouse) :
//  1) l'attribut : l'aller-retour du HTML, un numéro qui n'en est pas un, un modèle qui n'existe plus ;
//  2) la pose : la copie des cases, le curseur dans la première, un seul Annuler, ce qui la refuse, la liste avec recherche (ordre, lignes grisées avec leur raison, deux langues) ;
//  3) les règles du contenu : ce qu'une grille refuse (commandes, collage) l'est aussi dans un tableau lié, alors que le même tableau SANS lien l'accepte (le test prouve le garde-fou),
//     ce qu'une grille accepte (texte, lignes, colonnes, fusion, saut de page) reste libre ;
//  4) un seul lien par modèle et par document : une copie du tableau perd son lien, l'original garde le sien ; un lien mort est sans effet ; une grille n'a jamais de lien ;
//  5) le suivi des modifications verrouille le tableau lié ;
//  6) le repère (une décoration de l'éditeur, rien dans le HTML ni dans les sorties), le groupe de la barre du tableau, « Détacher », les boutons et la ligne du menu qui se grisent ;
//  7) les sorties : la Lecture, le PDF et le Word ne savent rien du lien.
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const ed = () => EditorCore.getEditor();
  // Plus de 500 ms entre deux gestes : prosemirror-history groupe sinon les transactions rapprochées en UN seul évènement (un Annuler défait alors les deux).
  const GROUP_GAP_MS = 700;
  const ATTR = 'data-linked-template';

  const gridHtml = (label, rows, cols) => '<table><tbody>' + Array.from({ length: rows }, (_, r) => '<tr>' + Array.from({ length: cols }, (_, c) => `<td><p>${label}${'ABC'[c]}${r + 1}</p></td>`).join('') + '</tr>').join('') + '</tbody></table>';
  const linkedHtml = (id, label, rows, cols) => gridHtml(label, rows, cols).replace('<table>', `<table ${ATTR}="${id}">`);
  const DOC = '<p>avant</p><p>après</p>';

  // Les modèles que le cas crée sont retirés à sa fin : la liste des modèles est celle des autres suites.
  const made = [];
  let counter = 0;
  async function model(name, html, type) {
    const saved = await Templates.save(null, name + ' ' + (++counter), html, '', null, null, type || 'grille', null);
    made.push(saved.id);
    await Templates.loadAll();
    return Templates.byId(saved.id);
  }
  async function dropModels() {
    for (const id of made.splice(0)) { try { await Templates.remove(id); } catch (e) { /* déjà retiré */ } }
    try { await Templates.loadAll(); } catch (e) { /* le cache d'avant sert */ }
  }
  async function withDoc(h, html, body) {
    await h.resetEditor();
    Editor.setHTML(html);
    await sleep(200);
    ed().commands.focus();
    try { return await body(); } finally {
      Editor.setTrackChanges(false);
      closePicker();
      if (GridEditor.isActive()) GridEditor.setActive(false);
      await dropModels();
      await sleep(30);
    }
  }

  const doc = () => ed().state.doc;
  const docJson = () => JSON.stringify(doc().toJSON());
  const linkedList = () => LinkedTable.linkedTables(doc());
  const linkedIds = () => linkedList().map(({ node }) => node.attrs.linkedTemplate);
  // Les tableaux du document dans l'ordre de lecture, ceux des cases compris.
  function tablesOf() {
    const list = [];
    doc().descendants((node, pos) => { if (node.type.name === 'table') list.push({ node, pos }); return true; });
    return list;
  }
  // La position du premier texte de la case (ligne, colonne) du tableau de rang `t`.
  function cellText(t, row, col) {
    const table = tablesOf()[t];
    let pos = table.pos + 1;
    for (let r = 0; r < row; r++) pos += table.node.child(r).nodeSize;
    pos += 1;
    for (let c = 0; c < col; c++) pos += table.node.child(row).child(c).nodeSize;
    return pos + 2;
  }
  async function cursorIn(t, row, col) {
    ed().commands.setTextSelection(cellText(t, row, col));
    await sleep(120);
  }
  async function cursorAt(text) {
    let found = null;
    doc().descendants((node, pos) => { if (found == null && node.isText && node.text.indexOf(text) !== -1) found = pos; });
    ed().commands.setTextSelection(found + 1);
    await sleep(120);
  }
  const textsOf = node => { const out = []; node.descendants(n => { if (n.type.name === 'tableCell' || n.type.name === 'tableHeader') out.push(n.textContent); return true; }); return out.join('|'); };
  const rowSpec = () => document.getElementById('v2-btn-linked-table');
  const isLocked = id => document.getElementById(id).classList.contains('v2-hf-locked');
  const markClass = () => Array.from(document.querySelectorAll('.tiptap .tableWrapper')).map(w => w.className.split(/\s+/).filter(c => /^pp-linked/.test(c)).join('+') || '-').join(',');
  const panel = () => document.querySelector('.v2-table-toolbar');
  const linkedParts = () => Array.from(document.querySelectorAll('.v2-table-toolbar [data-linked-only]'));
  const barButton = () => document.getElementById('v2-table-linked-btn');
  const menu = () => document.querySelector('.v2-linked-menu');
  const menuOpen = () => !!menu() && menu().classList.contains('visible');
  const detachRow = () => menu() && menu().querySelector('[data-action="linked-detach"]');
  // Appuyer sur un bouton d'une barre flottante comme la souris : mousedown (l'action part là), puis le clic qui suit et que la barre ignore.
  function press(button) {
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    button.click();
  }
  const visible = el => !!el && !el.hidden && getComputedStyle(el).display !== 'none';
  const picker = () => document.getElementById('v2-linked-table-search');
  function closePicker() {
    const box = picker();
    if (!box) return;
    const input = box.querySelector('.ss-input');
    if (input) input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    const left = picker();
    if (left) left.remove();
  }
  async function openPicker() {
    const opened = await LinkedTable.openPicker(ed(), rowSpec());
    await sleep(80);
    return opened;
  }
  const pickerRows = () => Array.from(document.querySelectorAll('#v2-linked-table-search .ss-option')).map(li => ({
    name: (li.querySelector('.ss-name') || li).textContent.trim(),
    reason: (li.querySelector('.ss-reason') || { textContent: '' }).textContent.trim(),
    disabled: li.getAttribute('aria-disabled') === 'true',
  }));
  // Choisit une ligne comme la liste le fait : la valeur du <select> caché change, `change` part.
  function pick(id) {
    const select = document.querySelector('#v2-linked-table-search select');
    select.value = String(id);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const clipboardOf = html => { const dt = new DataTransfer(); dt.setData('text/html', html); dt.setData('text/plain', 'x'); return dt; };
  function pasteHtml(html) {
    ed().view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: clipboardOf(html), bubbles: true, cancelable: true }));
  }
  const undo = async () => { ed().commands.undo(); await sleep(120); };
  // Dans un document que le cas écrit, le tableau est le second bloc : « avant », le tableau, « après ».
  const WITH_TABLE = id => '<p>avant</p>' + linkedHtml(id, 'T', 3, 3) + '<p>après</p>';

  // === 1) L'attribut ====================================================================================================================================================

  cases.push({
    id: 'linked_attribute_survives_the_html_round_trip_and_a_number_that_is_not_one_is_dropped',
    description: 'Le tableau lié porte `data-linked-template` : relu depuis le HTML enregistré, réécrit tel quel (un entier propre : « 03 » devient « 3 ») ; un tableau sans lien n\'en écrit pas ; un numéro qui n\'en est pas un (« abc », 0, négatif, décimal, vide) est perdu au chargement ; un lien dont le modèle n\'existe plus est gardé dans le HTML (il est sans effet, rien ne l\'efface)',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await model('Grille lien', gridHtml('A', 2, 2));
      Editor.setHTML('<p>x</p>' + linkedHtml(m.id, 'A', 2, 2) + '<p>y</p>' + gridHtml('B', 1, 1));
      await sleep(150);
      const html = Editor.getHTML();
      const written = (html.match(/data-linked-template="[^"]*"/g) || []);
      if (written.length !== 1 || written[0] !== `${ATTR}="${m.id}"`) bad.push('aller-retour : ' + JSON.stringify(written));
      if (linkedIds().join() !== String(m.id) || tablesOf().length !== 2 || tablesOf()[1].node.attrs.linkedTemplate) bad.push('le tableau sans lien en porte un');
      Editor.setHTML('<p>x</p>' + linkedHtml('0' + m.id, 'A', 1, 1));
      await sleep(100);
      if (linkedIds().join() !== String(m.id) || !new RegExp(`${ATTR}="${m.id}"`).test(Editor.getHTML())) bad.push('« 0' + m.id + ' » : ' + Editor.getHTML().slice(0, 120));
      for (const value of ['abc', '0', '-2', '1.5', '']) {
        Editor.setHTML('<p>x</p>' + gridHtml('A', 1, 1).replace('<table>', `<table ${ATTR}="${value}">`));
        await sleep(80);
        if (linkedList().length || /data-linked-template/.test(Editor.getHTML())) bad.push('« ' + value + ' » gardé : ' + Editor.getHTML().slice(0, 100));
      }
      Editor.setHTML('<p>x</p>' + linkedHtml(98765, 'A', 1, 1));
      await sleep(100);
      if (!/data-linked-template="98765"/.test(Editor.getHTML())) bad.push('un lien mort est effacé du HTML');
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  // === 2) La pose ======================================================================================================================================================

  cases.push({
    id: 'linked_insert_places_a_copy_of_the_model_table_cursor_in_its_first_cell_one_undo',
    description: 'Poser un modèle Grille : le tableau du modèle arrive (mêmes cases), porte son numéro, le curseur est dans sa première case ; le document garde le texte d\'avant et d\'après ; un seul Annuler le retire en entier',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await model('Tarifs', gridHtml('G', 3, 2));
      const before = docJson();
      await cursorAt('avant');
      ed().commands.setTextSelection(ed().state.selection.from + 5);
      const done = LinkedTable.insert(ed(), m);
      await sleep(150);
      const list = linkedList();
      if (!done || list.length !== 1 || list[0].node.attrs.linkedTemplate !== m.id) bad.push('pose : ' + JSON.stringify({ done, ids: linkedIds() }));
      if (list.length) {
        const node = list[0].node;
        if (node.childCount !== 3 || node.firstChild.childCount !== 2 || textsOf(node) !== 'GA1|GB1|GA2|GB2|GA3|GB3') bad.push('cases : ' + node.childCount + ' lignes, ' + textsOf(node));
        const { $from } = ed().state.selection;
        if ($from.parent.textContent !== 'GA1' || $from.parentOffset !== 0) bad.push('curseur : ' + $from.parent.textContent + ' @' + $from.parentOffset);
        if (!/^avant/.test(doc().textContent) || !/après$/.test(doc().textContent)) bad.push('texte autour : ' + doc().textContent);
      }
      await sleep(GROUP_GAP_MS);
      await undo();
      if (docJson() !== before) bad.push('un Annuler ne ramène pas le document : ' + doc().childCount + ' blocs, ' + linkedIds().join());
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_insert_refuses_what_does_not_fit_and_changes_nothing',
    description: 'Poser est refusé, sans rien changer au document, quand : le modèle est déjà lié dans le document, n\'a pas de tableau, n\'est pas une grille, n\'existe pas ; le curseur est dans un tableau (un tableau lié se pose hors de tout tableau) ou sur un tableau choisi ; le suivi des modifications est allumé ; le mode grille est actif',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const grid = await model('Grille', gridHtml('G', 2, 2));
      const empty = await model('Sans tableau', '<p>rien</p>');
      const letter = await model('Lettre', gridHtml('L', 2, 2), 'document');
      await cursorAt('avant');
      const refused = [];
      const tryInsert = (label, target) => { const was = docJson(); const done = LinkedTable.insert(ed(), target); if (done || docJson() !== was) refused.push(label + (done ? ' : accepté' : ' : document changé')); };
      if (!LinkedTable.insert(ed(), grid)) bad.push('la première pose est refusée');
      await sleep(150);
      tryInsert('déjà lié', grid);
      await cursorAt('après');
      tryInsert('sans tableau', empty);
      tryInsert('pas une grille', letter);
      tryInsert('inconnu', { id: 424242 });
      tryInsert('sans modèle', null);
      await cursorIn(0, 0, 0);
      const other = await model('Autre', gridHtml('O', 2, 2));
      tryInsert('curseur dans un tableau', other);
      ed().commands.setNodeSelection(linkedList()[0].pos);
      await sleep(100);
      tryInsert('tableau choisi', other);
      await cursorAt('après');
      Editor.setTrackChanges(true);
      await sleep(100);
      tryInsert('suivi allumé', other);
      Editor.setTrackChanges(false);
      await sleep(100);
      const control = LinkedTable.insert(ed(), other);
      await sleep(100);
      if (!control || linkedIds().length !== 2) bad.push('témoin : un autre modèle se pose bien, ici ' + JSON.stringify({ control, ids: linkedIds() }));
      if (refused.length) bad.push(refused.join(', '));
      // Le mode grille : un seul tableau, jamais de lien.
      Editor.setHTML(gridHtml('Z', 2, 2));
      await sleep(100);
      GridEditor.setActive(true);
      await sleep(100);
      const was = docJson();
      const inGrid = LinkedTable.insert(ed(), other);
      if (inGrid || docJson() !== was) bad.push('mode grille : accepté');
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_picker_lists_grid_models_by_name_greys_the_ones_that_cannot_be_placed_and_places_the_choice',
    description: 'La liste avec recherche : seuls les modèles Grille, par ordre alphabétique ; un modèle déjà lié dans le document et un modèle sans tableau sont proposés mais grisés, avec leur raison (deux langues) ; le choix d\'une ligne pose le tableau ; elle ne s\'ouvre ni sous le suivi, ni dans un tableau',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const b = await model('Grille b', gridHtml('B', 2, 2));
      const a = await model('Grille a', gridHtml('A', 2, 2));
      const none = await model('Grille vide', '<p>rien</p>');
      await model('Lettre', gridHtml('L', 2, 2), 'document');
      await cursorAt('avant');
      const opened = await openPicker();
      const rows = pickerRows();
      const names = rows.map(r => r.name.replace(/ \d+$/, ''));
      if (!opened || names.join() !== 'Grille a,Grille b,Grille vide') bad.push('ordre et choix : ' + JSON.stringify({ opened, names }));
      const emptyRow = rows.find(r => /vide/.test(r.name));
      if (!emptyRow || !emptyRow.disabled || emptyRow.reason !== I18n.t('linkedTable.pickEmpty')) bad.push('ligne sans tableau : ' + JSON.stringify(emptyRow));
      if (rows.filter(r => r.disabled).length !== 1) bad.push('lignes grisées : ' + JSON.stringify(rows.filter(r => r.disabled).map(r => r.name)));
      pick(a.id);
      await sleep(150);
      if (linkedIds().join() !== String(a.id)) bad.push('le choix ne pose pas le tableau : ' + linkedIds().join());
      await sleep(80);
      closePicker();
      // Un modèle déjà lié se grise, dans les deux langues.
      await cursorAt('après');
      const lang = I18n.getLang();
      try {
        for (const code of ['fr', 'en']) {
          I18n.setLang(code);
          await sleep(60);
          await openPicker();
          const used = pickerRows().find(r => r.name.indexOf('Grille a') === 0);
          if (!used || !used.disabled || used.reason !== I18n.t('linkedTable.pickUsed')) bad.push(code + ' : ligne déjà liée ' + JSON.stringify(used));
          const emptyIn = pickerRows().find(r => /vide|empty/i.test(r.name));
          if (!emptyIn || emptyIn.reason !== I18n.t('linkedTable.pickEmpty')) bad.push(code + ' : ligne sans tableau ' + JSON.stringify(emptyIn));
          closePicker();
          await sleep(60);
        }
      } finally { I18n.setLang(lang); }
      // La même liste, fermée : rien ne reste dans la page.
      if (picker()) bad.push('la liste reste dans la page après Échap');
      // Sous le suivi des modifications et dans un tableau : elle ne s'ouvre pas.
      Editor.setTrackChanges(true);
      await sleep(80);
      const tracked = await openPicker();
      Editor.setTrackChanges(false);
      await sleep(80);
      await cursorIn(0, 0, 0);
      const inside = await openPicker();
      if (tracked || inside || picker()) bad.push('ouverte sous le suivi (' + tracked + ') ou dans un tableau (' + inside + ')');
      void b; void none;
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_picker_says_so_when_there_is_no_grid_model_or_no_match',
    description: 'Aucun modèle Grille : la liste dit « Aucun modèle Grille… » et n\'a aucune ligne ; une recherche qui ne trouve rien dit « Aucun modèle Grille ne correspond » ; les deux textes existent dans les deux langues',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      await cursorAt('avant');
      // Les modèles Grille déjà présents (d'un autre cas) sont mis de côté : seule la liste vide se lit ici.
      const existing = Templates.getCached().filter(t => t.typeModele === GridEditor.TYPE);
      if (existing.length) { await dropModels(); }
      const emptyList = Templates.getCached().filter(t => t.typeModele === GridEditor.TYPE).length === 0;
      if (emptyList) {
        await openPicker();
        const shown = document.querySelector('#v2-linked-table-search .ss-empty');
        if (!shown || shown.hidden || shown.textContent.trim() !== I18n.t('linkedTable.none') || pickerRows().length) bad.push('liste vide : ' + (shown ? shown.textContent + ' hidden=' + shown.hidden : 'aucun message'));
        closePicker();
        await sleep(60);
      }
      await model('Grille un', gridHtml('U', 2, 2));
      await openPicker();
      const input = document.querySelector('#v2-linked-table-search .ss-input');
      input.value = 'zzzz';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(120);
      const none = document.querySelector('#v2-linked-table-search .ss-empty');
      if (!none || none.hidden || none.textContent.trim() !== I18n.t('linkedTable.noMatch')) bad.push('aucune correspondance : ' + (none ? none.textContent + ' hidden=' + none.hidden : 'aucun message'));
      closePicker();
      for (const key of ['linkedTable.none', 'linkedTable.noMatch', 'linkedTable.search']) {
        const lang = I18n.getLang();
        try {
          I18n.setLang('fr'); const fr = I18n.t(key);
          I18n.setLang('en'); const en = I18n.t(key);
          if (!fr || !en || fr === key || en === key || fr === en) bad.push(key + ' : ' + JSON.stringify({ fr, en }));
        } finally { I18n.setLang(lang); }
      }
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  // === 3) Les règles du contenu ========================================================================================================================================

  // Les commandes qu'une grille refuse (js/grid-editor.js:isForbiddenNode), celles du cas `grid_guard_refuses_whatever_would_stop_it_being_one_table` de la suite grid, sauf le bloc de signature :
  // il se pose sous le tableau, au premier niveau du document (Callout.insertSignature), donc hors de la case.
  const FORBIDDEN_COMMANDS = {
    insertTable: () => ed().chain().focus().insertTable({ rows: 2, cols: 2 }).run(),
    insertTwoColumns: () => ed().chain().focus().insertTwoColumns().run(),
    insertToc: () => ed().chain().focus().insertToc().run(),
    insertPageBreak: () => ed().chain().focus().insertPageBreak().run(),
    toggleBlockquote: () => ed().chain().focus().toggleBlockquote().run(),
    wrapCallout: () => Callout.wrapSelection(ed(), {}),
    toggleCodeBlock: () => ed().chain().focus().toggleCodeBlock().run(),
    horizontalRule: () => ed().chain().focus().insertContent({ type: 'horizontalRule' }).run(),
  };

  cases.push({
    id: 'linked_guard_refuses_what_a_grid_refuses_and_the_same_table_without_a_link_takes_it',
    description: 'Dans un tableau lié, un second tableau, deux colonnes, sommaire, saut de page, citation, encadré, bloc de code et trait horizontal sont refusés (document inchangé) ; le MÊME tableau sans lien les prend (le test ne prouverait rien sinon) ; hors du tableau lié, dans le même document, ces commandes agissent ; le bloc de signature, qui se pose SOUS le tableau, passe et ne touche pas au tableau lié',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await model('Garde', gridHtml('G', 3, 3));
      const html = WITH_TABLE(m.id);
      const freeHtml = html.replace(` ${ATTR}="${m.id}"`, '');
      const load = async source => { Editor.setHTML(source); await sleep(120); await cursorIn(0, 1, 1); };
      for (const name of Object.keys(FORBIDDEN_COMMANDS)) {
        await load(freeHtml);
        const reference = docJson();
        FORBIDDEN_COMMANDS[name]();
        await sleep(40);
        if (docJson() === reference) { bad.push(name + ' : sans effet même sans lien (le test ne prouverait rien)'); continue; }
        await load(html);
        const linkedBefore = docJson();
        FORBIDDEN_COMMANDS[name]();
        await sleep(40);
        if (docJson() !== linkedBefore) bad.push(name + ' : document modifié dans le tableau lié');
        // Hors du tableau lié (le paragraphe d'après), la commande agit comme partout.
        await load(html);
        await cursorAt('après');
        const outside = docJson();
        FORBIDDEN_COMMANDS[name]();
        await sleep(40);
        if (docJson() === outside) bad.push(name + ' : refusée hors du tableau lié');
      }
      // Le bloc de signature se pose sous le tableau lié : il arrive, le tableau ne bouge pas.
      await load(html);
      const tableBefore = JSON.stringify(tablesOf()[0].node.toJSON());
      Callout.insertSignature(ed());
      await sleep(80);
      const zones = []; doc().forEach(node => zones.push(node.type.name));
      if (zones.indexOf('twoColumnsZone') < zones.indexOf('table') || zones.indexOf('twoColumnsZone') === -1) bad.push('signature : ' + zones.join());
      if (JSON.stringify(tablesOf()[0].node.toJSON()) !== tableBefore || linkedIds().join() !== String(m.id)) bad.push('signature : le tableau lié a changé');
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_guard_refuses_pasted_forbidden_content_and_takes_plain_paste',
    description: 'Un collage de citation, de code, de tableau ou d\'encadré dans une case d\'un tableau lié est refusé (document inchangé) ; un collage de texte, de gras, de liste ou de lien y passe ; le même collage dans le tableau sans lien passe',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await model('Collage', gridHtml('P', 3, 3));
      const html = WITH_TABLE(m.id);
      const freeHtml = html.replace(` ${ATTR}="${m.id}"`, '');
      const refused = {
        citation: '<blockquote><p>citation</p></blockquote>',
        code: '<pre><code>let a = 1;</code></pre>',
        table: '<table><tbody><tr><td><p>x</p></td><td><p>y</p></td></tr></tbody></table><p>fin</p>',
        callout: '<div class="callout"><p>encadré</p></div>',
        rule: '<p>a</p><hr><p>b</p>',
      };
      for (const name of Object.keys(refused)) {
        Editor.setHTML(freeHtml); await sleep(120); await cursorIn(0, 1, 1);
        const reference = docJson();
        pasteHtml(refused[name]);
        await sleep(120);
        const takenWithout = docJson() !== reference;
        Editor.setHTML(html); await sleep(120); await cursorIn(0, 1, 1);
        const before = docJson();
        pasteHtml(refused[name]);
        await sleep(120);
        if (docJson() !== before) bad.push(name + ' : collé dans le tableau lié');
        if (!takenWithout && name !== 'callout' && name !== 'table') bad.push(name + ' : le témoin sans lien ne prend pas non plus ce collage');
      }
      const accepted = {
        texte: ['<p>du texte collé</p>', 'du texte collé'],
        gras: ['<p>un <strong>mot</strong> gras</p>', 'mot'],
        liste: ['<ul><li><p>un</p></li><li><p>deux</p></li></ul>', 'deux'],
        lien: ['<p><a href="https://example.org/">site</a></p>', 'site'],
      };
      for (const name of Object.keys(accepted)) {
        Editor.setHTML(html); await sleep(120); await cursorIn(0, 1, 1);
        pasteHtml(accepted[name][0]);
        await sleep(120);
        if (!textsOf(tablesOf()[0].node).includes(accepted[name][1])) bad.push(name + ' : refusé dans le tableau lié');
      }
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_table_keeps_every_edit_a_grid_has',
    description: 'Dans un tableau lié on écrit, on met en forme, on ajoute et retire des lignes et des colonnes, on fusionne et scinde des cases, on règle l\'alignement vertical et les bords, on pose le saut de page avant une ligne : rien de cela n\'est refusé, et le lien reste',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await model('Libre', gridHtml('L', 3, 3));
      Editor.setHTML(WITH_TABLE(m.id));
      await sleep(150);
      const step = async (label, run, check) => {
        await sleep(GROUP_GAP_MS);
        const was = docJson();
        let outcome;
        try { outcome = run(); } catch (e) { bad.push(label + ' : ' + e.message); return; }
        await sleep(100);
        if (docJson() === was) { bad.push(label + ' : sans effet'); return; }
        if (check && !check(outcome)) bad.push(label + ' : résultat inattendu');
        if (linkedIds().join() !== String(m.id)) bad.push(label + ' : le lien est perdu');
      };
      await cursorIn(0, 1, 1);
      await step('texte', () => ed().chain().focus().insertContent('ajout').run(), () => textsOf(tablesOf()[0].node).includes('ajout'));
      await step('gras', () => { ed().chain().focus().selectAll().run(); return ed().chain().focus().toggleBold().run(); });
      await cursorIn(0, 1, 1);
      await step('ligne après', () => ed().chain().focus().addRowAfter().run(), () => tablesOf()[0].node.childCount === 4);
      await step('colonne après', () => ed().chain().focus().addColumnAfter().run(), () => tablesOf()[0].node.firstChild.childCount === 4);
      await step('supprimer la ligne', () => ed().chain().focus().deleteRow().run(), () => tablesOf()[0].node.childCount === 3);
      await step('supprimer la colonne', () => ed().chain().focus().deleteColumn().run(), () => tablesOf()[0].node.firstChild.childCount === 3);
      await cursorIn(0, 0, 0);
      await step('fusion', () => { ed().commands.setCellSelection({ anchorCell: cellText(0, 0, 0) - 2, headCell: cellText(0, 0, 1) - 2 }); return TableMerge.mergeSelected ? TableMerge.mergeSelected(ed()) : ed().chain().focus().mergeCells().run(); });
      await cursorIn(0, 1, 1);
      await step('alignement vertical', () => GridEditor.setVerticalAlign(ed(), 'bottom'));
      await step('bords', () => GridEditor.applyBorders(ed(), 'outer', '#ff0000'));
      await step('saut de page avant la ligne', () => GridEditor.togglePageBreak(ed()));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  // === 4) Un seul lien par modèle et par document ======================================================================================================================

  cases.push({
    id: 'linked_a_pasted_copy_loses_its_link_the_original_keeps_it_wherever_it_is',
    description: 'Copier le tableau lié et le coller (après lui, avant lui, dans une case d\'un autre tableau) : la copie garde ses cases et perd son lien, l\'original garde le sien, un seul Annuler retire la copie ; le tableau d\'un AUTRE modèle collé garde le sien',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await model('Copie', gridHtml('C', 2, 2));
      const o = await model('Autre', gridHtml('O', 2, 2));
      const original = linkedHtml(m.id, 'T', 2, 2);
      const base = '<p>avant</p>' + original + '<p>après</p>';
      const where = { après: () => cursorAt('après'), avant: () => cursorAt('avant') };
      for (const name of Object.keys(where)) {
        Editor.setHTML(base); await sleep(150);
        const reference = docJson();
        await where[name]();
        pasteHtml(original);
        await sleep(200);
        const after = linkedList();
        if (tablesOf().length !== 2 || after.length !== 1 || after[0].node.attrs.linkedTemplate !== m.id) bad.push(name + ' : ' + tablesOf().length + ' tableaux, liens ' + linkedIds().join());
        // Le tableau lié qui reste est celui d'avant : ses cases sont les « T » du départ.
        else if (!/^TA1/.test(textsOf(after[0].node))) bad.push(name + ' : le lien est resté sur la copie');
        await sleep(GROUP_GAP_MS);
        await undo();
        if (docJson() !== reference) bad.push(name + ' : un Annuler ne retire pas la copie');
      }
      // Un autre modèle collé : son lien reste (un par modèle, pas un par document).
      Editor.setHTML(base); await sleep(150);
      await cursorAt('après');
      pasteHtml(linkedHtml(o.id, 'U', 2, 2));
      await sleep(200);
      if (linkedIds().sort().join() !== [m.id, o.id].sort().join()) bad.push('autre modèle : ' + linkedIds().join());
      // Une copie sans le moindre tableau d'origine, avec un modèle qui n'est pas encore lié : elle garde son lien.
      Editor.setHTML('<p>avant</p><p>après</p>'); await sleep(120);
      await cursorAt('avant');
      pasteHtml(linkedHtml(m.id, 'T', 2, 2));
      await sleep(200);
      if (linkedIds().join() !== String(m.id)) bad.push('première copie : ' + linkedIds().join());
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_a_link_to_a_model_that_is_gone_or_changed_type_does_nothing',
    description: 'Un lien dont le modèle a été supprimé, ou n\'est plus une grille : ni repère, ni groupe dans la barre, ni grisé de bouton, ni garde-fou (un second tableau s\'y pose), un tableau ordinaire ; le HTML garde le numéro ; un tableau collé qui porte un tel lien le perd',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await model('Disparu', gridHtml('D', 2, 2));
      Editor.setHTML(WITH_TABLE(m.id));
      await sleep(150);
      await cursorIn(0, 0, 0);
      if (markClass() !== '-' && markClass() !== 'pp-linked-table') bad.push('repère avant : ' + markClass());
      const live = LinkedTable.status(ed().state);
      if (!live || live.name !== m.nom) bad.push('lien vivant : ' + JSON.stringify(live && live.name));
      await Templates.remove(m.id);
      made.splice(made.indexOf(m.id), 1);
      await Templates.loadAll();
      // Un nouvel état de l'éditeur relit la liste des modèles.
      ed().commands.setTextSelection(cellText(0, 1, 1));
      await sleep(150);
      if (markClass() !== '-' || LinkedTable.status(ed().state) || LinkedTable.cursorIn(ed().state)) bad.push('lien mort : repère ' + markClass() + ', état ' + JSON.stringify(LinkedTable.status(ed().state)));
      if (linkedParts().some(visible)) bad.push('lien mort : le groupe de la barre est visible');
      if (isLocked('v2-btn-table') || isLocked('v2-btn-callout')) bad.push('lien mort : un bouton est grisé');
      if (!new RegExp(`${ATTR}="${m.id}"`).test(Editor.getHTML())) bad.push('lien mort : le HTML a perdu le numéro');
      const was = docJson();
      FORBIDDEN_COMMANDS.insertTable();
      await sleep(60);
      if (docJson() === was) bad.push('lien mort : un tableau ne se pose pas dans les cases');
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_a_grid_has_no_link_and_a_linked_table_pasted_into_one_loses_it',
    description: 'En mode grille (ouvert comme une personne le fait : « + », « Nouvelle grille ») : le tableau n\'a ni repère, ni groupe de lien, le bouton Tableau est grisé, la pose est refusée ; un tableau lié collé dans une grille perd son lien, ses cases restent ; hors de la grille, le lien se pose de nouveau',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await model('Dans une grille', gridHtml('G', 2, 2));
      h.openFlyout('#v2-new-template-group');
      await h.clickButton('v2-btn-new-grid');
      await sleep(300);
      try {
        if (!GridEditor.isActive()) bad.push('la grille ne s\'ouvre pas');
        ed().commands.setTextSelection(cellText(0, 1, 1));
        await sleep(150);
        MainToolbar.syncToolbarState();
        if (markClass() !== '-' || LinkedTable.status(ed().state) || LinkedTable.cursorIn(ed().state)) bad.push('grille : repère ' + markClass());
        if (linkedParts().some(visible)) bad.push('grille : le groupe est visible');
        if (!isLocked('v2-btn-table') || !isLocked('v2-btn-linked-table')) bad.push('grille : le bouton Tableau ou la ligne ne sont pas grisés');
        const was = docJson();
        if (LinkedTable.insert(ed(), m) || docJson() !== was) bad.push('grille : la pose est acceptée');
        if (await LinkedTable.openPicker(ed(), rowSpec()) || picker()) bad.push('grille : la liste s\'ouvre');
        // Une grille ne peut pas être liée : la copie collée dans une case perd son lien, ses cases restent.
        pasteHtml(linkedHtml(m.id, 'Q', 1, 1));
        await sleep(200);
        if (linkedList().length || /data-linked-template/.test(Editor.getHTML())) bad.push('grille : un lien est apparu ' + linkedIds().join());
        // Un tableau lié qui prend la place de celui de la grille (appliqué sur un état à part : la grille refuse de toute façon un second tableau) perd son lien.
        const gridTable = tablesOf()[0];
        const linkedCopy = gridTable.node.type.create(Object.assign({}, gridTable.node.attrs, { linkedTemplate: m.id }), gridTable.node.content, gridTable.node.marks);
        const replaced = ed().state.applyTransaction(ed().state.tr.replaceWith(gridTable.pos, gridTable.pos + gridTable.node.nodeSize, linkedCopy)).state;
        if (LinkedTable.linkedTables(replaced.doc).length) bad.push('grille : un tableau lié qui prend la place de celui de la grille garde son lien');
      } finally {
        h.openFlyout('#v2-new-template-group');
        await h.clickButton('v2-btn-new-document');
        await sleep(200);
      }
      // Hors de la grille, rien n'est resté : le lien se pose.
      await h.resetEditor();
      Editor.setHTML(DOC);
      await sleep(150);
      await cursorAt('avant');
      MainToolbar.syncToolbarState();
      if (isLocked('v2-btn-table') || isLocked('v2-btn-linked-table')) bad.push('après la grille : un bouton reste grisé');
      if (!LinkedTable.insert(ed(), m)) bad.push('après la grille : la pose est refusée');
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_a_header_or_footer_zone_has_no_link',
    description: 'Dans l\'édition d\'un en-tête ou d\'un pied de page (le même éditeur, un autre contenu) : la pose est refusée, la ligne du menu est grisée avec sa raison (deux langues), la liste ne s\'ouvre pas, un tableau lié collé perd son lien ; le tableau lié du corps, lui, est intact au retour',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await model('Zone', gridHtml('Z', 2, 2));
      const o = await model('Zone bis', gridHtml('Y', 2, 2));
      Editor.setHTML(WITH_TABLE(m.id));
      await sleep(150);
      const before = linkedIds().join();
      HeaderFooterPreview.enterHeaderFooterMode('header', 'default');
      await sleep(300);
      const lang = I18n.getLang();
      try {
        if (!HeaderFooterPreview.getHfMode()) bad.push('la zone ne s\'ouvre pas');
        else {
          ed().commands.focus();
          for (const code of ['fr', 'en']) {
            I18n.setLang(code); await sleep(60);
            MainToolbar.syncToolbarState();
            const row = rowSpec();
            if (row.getAttribute('aria-disabled') !== 'true' || !row.classList.contains('v2-hover-row-disabled') || row.title !== I18n.t('linkedTable.rowZone')) bad.push(code + ' ligne : ' + row.title);
          }
          const was = docJson();
          if (LinkedTable.insert(ed(), o) || docJson() !== was) bad.push('pose acceptée dans la zone');
          if (await LinkedTable.openPicker(ed(), rowSpec()) || picker()) bad.push('liste ouverte dans la zone');
          // Un tableau lié qui arrive dans la zone (appliqué sur un état à part : la zone refuse de toute façon ce que sa hauteur ne tient pas) perd son lien.
          const arrives = () => {
            const node = ed().schema.nodeFromJSON({ type: 'table', attrs: { linkedTemplate: o.id }, content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph' }] }] }] });
            return ed().state.applyTransaction(ed().state.tr.insert(0, node)).state;
          };
          const countTables = state => { let n = 0; state.doc.descendants((node) => { if (node.type.name === 'table') n++; return true; }); return n; };
          const inZone = arrives();
          if (countTables(inZone) !== 1) bad.push('le tableau n\'arrive pas dans la zone : ' + countTables(inZone));
          else if (LinkedTable.linkedTables(inZone.doc).length) bad.push('le lien d\'un tableau arrivé dans la zone est gardé');
        }
      } finally {
        I18n.setLang(lang);
        HeaderFooterPreview.exitHeaderFooterModeIfActive();
        await sleep(300);
      }
      if (linkedIds().join() !== before) bad.push('au retour dans le corps : ' + linkedIds().join());
      // Le même tableau arrivé dans le corps (témoin) : son lien reste, le modèle n'y étant pas encore lié.
      const node = ed().schema.nodeFromJSON({ type: 'table', attrs: { linkedTemplate: o.id }, content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph' }] }] }] });
      const body = ed().state.applyTransaction(ed().state.tr.insert(0, node)).state;
      if (LinkedTable.linkedTables(body.doc).map(({ node: n }) => n.attrs.linkedTemplate).sort().join() !== [m.id, o.id].sort().join()) bad.push('témoin dans le corps : le lien est perdu');
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  // === 5) Le suivi des modifications ===================================================================================================================================

  cases.push({
    id: 'linked_track_changes_locks_the_table_and_the_link_and_gives_them_back',
    description: 'Suivi des modifications allumé : écrire, supprimer, ajouter une ligne dans un tableau lié est refusé (document inchangé) alors que le même geste dans un tableau sans lien se suit ; « Détacher » et la pose ne font rien ; le repère et le bouton du lien se verrouillent, son menu dit pourquoi (ligne « Détacher » grisée avec la raison) ; éteint, tout revient ; Annuler et Rétablir passent',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await model('Suivi', gridHtml('S', 3, 3));
      Editor.setHTML(WITH_TABLE(m.id) + gridHtml('F', 2, 2));
      await sleep(150);
      await cursorIn(0, 1, 1);
      await sleep(GROUP_GAP_MS);
      ed().chain().focus().insertContent('avant suivi').run();
      await sleep(100);
      Editor.setTrackChanges(true);
      await sleep(150);
      const status = LinkedTable.status(ed().state);
      if (!status || status.locked !== 'linkedTable.lockedTracked') bad.push('statut sous le suivi : ' + JSON.stringify(status && status.locked));
      if (!/pp-linked-locked/.test(markClass())) bad.push('repère non verrouillé : ' + markClass());
      const acts = {
        écrire: () => ed().chain().focus().insertContent('zz').run(),
        supprimer: () => ed().chain().focus().deleteSelection().run(),
        'ligne après': () => ed().chain().focus().addRowAfter().run(),
        'colonne avant': () => ed().chain().focus().addColumnBefore().run(),
        'supprimer la ligne': () => ed().chain().focus().deleteRow().run(),
      };
      await cursorIn(0, 1, 1);
      ed().commands.setTextSelection({ from: cellText(0, 1, 1), to: cellText(0, 1, 1) + 3 });
      for (const name of Object.keys(acts)) {
        const was = docJson();
        acts[name]();
        await sleep(60);
        if (docJson() !== was) bad.push(name + ' : le tableau lié a bougé sous le suivi');
      }
      // Le témoin : le tableau sans lien, lui, se suit.
      await cursorIn(1, 0, 0);
      const free = docJson();
      ed().chain().focus().insertContent('suivi').run();
      await sleep(80);
      if (docJson() === free) bad.push('témoin : le tableau sans lien n\'accepte plus rien sous le suivi');
      await cursorIn(0, 1, 1);
      const detached = LinkedTable.detach(ed());
      const placed = LinkedTable.insert(ed(), m);
      if (detached || placed || linkedIds().join() !== String(m.id)) bad.push('détacher : ' + JSON.stringify({ detached, placed, ids: linkedIds() }));
      // Le bouton du lien reste ouvert : son menu dit pourquoi (la ligne « Détacher » grisée avec la raison, jamais retirée) et un appui dessus ne fait rien.
      const lockedWhy = I18n.t('linkedTable.lockedTracked', { name: m.nom });
      if (!barButton() || barButton().title !== lockedWhy || !barButton().classList.contains('is-locked')) bad.push('bouton du lien sous le suivi : ' + (barButton() && barButton().title));
      press(barButton());
      await sleep(150);
      if (!menuOpen() || !detachRow() || detachRow().getAttribute('aria-disabled') !== 'true' || detachRow().title !== lockedWhy || menu().querySelector('.v2-linked-menu-hint').textContent !== I18n.t('linkedTable.menuLocked')) {
        bad.push('menu sous le suivi : ' + JSON.stringify([menuOpen(), detachRow() && detachRow().getAttribute('aria-disabled'), detachRow() && detachRow().title, menu() && menu().querySelector('.v2-linked-menu-hint').textContent]));
      } else {
        press(detachRow());
        await sleep(120);
        if (linkedIds().join() !== String(m.id) || !menuOpen()) bad.push('« Détacher » a agi (ou fermé le menu) sous le suivi : ' + linkedIds().join() + ' ' + menuOpen());
      }
      if (menuOpen()) { press(barButton()); await sleep(80); }
      Editor.setTrackChanges(false);
      await sleep(150);
      const back = LinkedTable.status(ed().state);
      if (!back || back.locked || /pp-linked-locked/.test(markClass())) bad.push('rien n\'est rendu après le suivi : ' + JSON.stringify(back && back.locked) + ' ' + markClass());
      const typed = docJson();
      await sleep(GROUP_GAP_MS);
      ed().chain().focus().insertContent('libre').run();
      await sleep(80);
      if (docJson() === typed) bad.push('écrire est refusé après le suivi');
      await undo();
      if (docJson() !== typed) bad.push('Annuler ne rend pas l\'état d\'avant');
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  // === 6) Le repère, la barre et les boutons ===========================================================================================================================

  cases.push({
    id: 'linked_marker_is_a_decoration_of_the_editor_only',
    description: 'Le repère est une classe `pp-linked-table` sur l\'enveloppe du tableau lié et sur celui-là seul, avec le nom du modèle pour les lecteurs d\'écran (deux langues) ; rien n\'en reste dans le HTML enregistré ni dans la Lecture',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await model('Repère', gridHtml('R', 2, 2));
      const free = gridHtml('F', 2, 2);
      Editor.setHTML('<p>avant</p>' + free + linkedHtml(m.id, 'R', 2, 2) + '<p>après</p>');
      await sleep(200);
      if (markClass() !== '-,pp-linked-table') bad.push('classes : ' + markClass());
      const wrapper = document.querySelectorAll('.tiptap .tableWrapper')[1];
      const lang = I18n.getLang();
      const labels = {};
      try {
        for (const code of ['fr', 'en']) {
          I18n.setLang(code); await sleep(60);
          ed().commands.setTextSelection(code === 'fr' ? 2 : 3); await sleep(120);
          const el = document.querySelectorAll('.tiptap .tableWrapper')[1];
          labels[code] = el && el.getAttribute('aria-label');
          if (!el || labels[code] !== I18n.t('linkedTable.aria', { name: m.nom }) || el.getAttribute('role') !== 'group') bad.push('étiquette ' + code + ' : ' + labels[code]);
        }
      } finally { I18n.setLang(lang); }
      if (!labels.fr || labels.fr === labels.en) bad.push('les deux langues disent la même chose : ' + JSON.stringify(labels));
      void wrapper;
      const html = Editor.getHTML();
      if (/pp-linked|aria-label="Tableau lié|role="group"/.test(html)) bad.push('le HTML enregistré porte le repère : ' + html.slice(0, 160));
      const reader = await h.renderReaderMode(html);
      if (reader && /pp-linked/.test(reader.innerHTML)) bad.push('la Lecture porte le repère');
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_bar_shows_one_menu_button_for_a_linked_table_only',
    description: 'La barre du tableau montre, pour le tableau lié seul, un bouton à menu (l\'icône du lien et un chevron, le nom du modèle dans son info-bulle) ; son menu dit le nom du modèle (coupé par « … » s\'il est long, info-bulle en entier), ce que le lien veut dire pour les cases (deux langues) et propose « Détacher » ; un second appui le ferme ; un tableau sans lien, une cellule d\'un autre tableau, rien du tout : bouton et menu restent cachés (jamais retirés de la barre)',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const long = 'Un nom de modèle Grille vraiment très long pour la barre du tableau';
      const m = await model(long, gridHtml('B', 2, 2));
      Editor.setHTML('<p>avant</p>' + gridHtml('F', 2, 2) + linkedHtml(m.id, 'B', 2, 2) + '<p>après</p>');
      await sleep(200);
      await cursorIn(0, 0, 0);
      if (!panel() || linkedParts().length !== 2 || linkedParts().some(visible)) bad.push('tableau sans lien : ' + linkedParts().filter(visible).length + ' parties visibles sur ' + linkedParts().length);
      await cursorIn(1, 0, 0);
      await sleep(100);
      if (linkedParts().some(el => !visible(el))) bad.push('tableau lié : ' + linkedParts().filter(el => !visible(el)).length + ' parties cachées');
      const button = barButton();
      if (!button || button.title !== I18n.t('linkedTable.barTip', { name: m.nom }) || button.querySelectorAll('svg').length !== 2 || button.getAttribute('aria-haspopup') !== 'true' || button.getAttribute('aria-expanded') !== 'false') {
        bad.push('bouton : ' + (button && JSON.stringify([button.title, button.querySelectorAll('svg').length, button.getAttribute('aria-expanded')])));
      }
      if (button && button.getBoundingClientRect().width > 32) bad.push('le bouton est trop large pour la barre : ' + button.getBoundingClientRect().width);
      if (menuOpen()) bad.push('le menu est ouvert avant l\'appui');
      press(button);
      await sleep(150);
      const lang = I18n.getLang();
      try {
        if (!menuOpen() || button.getAttribute('aria-expanded') !== 'true') bad.push('le menu ne s\'ouvre pas : ' + menuOpen() + ' ' + button.getAttribute('aria-expanded'));
        else {
          const name = menu().querySelector('.v2-linked-menu-name');
          if (name.textContent !== m.nom || menu().querySelector('.v2-linked-menu-head').title !== m.nom || getComputedStyle(name).textOverflow !== 'ellipsis') bad.push('nom du modèle : ' + name.textContent);
          const reach = menu().getBoundingClientRect();
          if (reach.width <= 0 || reach.left < 0 || reach.right > innerWidth + 0.5 || reach.top < -0.5 || reach.bottom > innerHeight + 0.5) bad.push('le menu sort de la fenêtre : ' + JSON.stringify([reach.left, reach.top, reach.right, reach.bottom]));
          const row = detachRow();
          if (!row || row.getAttribute('aria-disabled') !== 'false' || row.title !== I18n.t('linkedTable.detach') || row.textContent.trim() !== I18n.t('linkedTable.detachRow') || !row.querySelector('svg')) bad.push('« Détacher » : ' + (row && JSON.stringify([row.title, row.textContent.trim(), row.getAttribute('aria-disabled')])));
          if (menu().querySelector('.v2-linked-menu-hint').textContent !== I18n.t('linkedTable.menuHint')) bad.push('texte du lien : ' + menu().querySelector('.v2-linked-menu-hint').textContent);
          // Le nom du modèle n'est jamais lu comme du HTML.
          if (menu().querySelector('.v2-linked-menu-head').children.length !== 2) bad.push('le menu a des éléments en trop dans l\'en-tête');
          const texts = {};
          for (const code of ['fr', 'en']) {
            I18n.setLang(code); await sleep(60);
            press(button); await sleep(60); press(button); await sleep(120);
            texts[code] = [menu().querySelector('.v2-linked-menu-hint').textContent, detachRow().textContent.trim(), detachRow().title, button.title].join(' | ');
          }
          if (texts.fr === texts.en || !/Detach/.test(texts.en) || !/Détacher/.test(texts.fr)) bad.push('les deux langues : ' + JSON.stringify(texts));
        }
      } finally { I18n.setLang(lang); await sleep(60); }
      if (menuOpen()) { press(button); await sleep(100); }
      if (menuOpen() || button.getAttribute('aria-expanded') !== 'false') bad.push('un second appui ne ferme pas le menu');
      // Ouvert, le menu suit le curseur : il se referme quand le curseur sort du tableau (la barre se cache avec lui) ...
      press(button);
      await sleep(100);
      if (!menuOpen()) bad.push('le menu ne se rouvre pas');
      ed().commands.setTextSelection(2);
      await sleep(150);
      if (menuOpen() || button.getAttribute('aria-expanded') !== 'false') bad.push('le menu reste ouvert quand le curseur sort du tableau');
      // ... et quand il passe dans un tableau sans lien (la barre reste, le bouton et le menu disparaissent).
      await cursorIn(1, 0, 0);
      await sleep(100);
      press(barButton());
      await sleep(100);
      if (!menuOpen()) bad.push('le menu ne se rouvre pas (2)');
      await cursorIn(0, 0, 0);
      await sleep(100);
      if (menuOpen() || linkedParts().some(visible)) bad.push('revenu dans un tableau sans lien : le menu ou le bouton reste visible');
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_detach_keeps_the_cells_removes_the_link_and_is_one_undo',
    description: '« Détacher » (la ligne du menu de la barre, la fonction) : le tableau garde ses cases, perd son numéro (le HTML n\'en écrit plus, le repère, le bouton et le menu disparaissent, les boutons se dégrisent) ; un seul Annuler rend le lien ; le modèle peut ensuite se lier de nouveau',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await model('Détacher', gridHtml('D', 2, 2));
      Editor.setHTML(WITH_TABLE(m.id));
      await sleep(200);
      await cursorIn(0, 1, 1);
      const cells = textsOf(tablesOf()[0].node);
      const reference = docJson();
      await sleep(GROUP_GAP_MS);
      press(barButton());
      await sleep(150);
      if (!menuOpen() || !detachRow()) { bad.push('le menu ne s\'ouvre pas'); return { pass: false, notes: bad.join(' | ') }; }
      press(detachRow());
      await sleep(150);
      if (linkedList().length || /data-linked-template/.test(Editor.getHTML())) bad.push('le lien est resté : ' + linkedIds().join());
      if (textsOf(tablesOf()[0].node) !== cells) bad.push('les cases ont changé');
      if (markClass() !== '-' || linkedParts().some(visible)) bad.push('repère ' + markClass() + ' ou bouton encore là');
      if (menuOpen() || barButton().getAttribute('aria-expanded') !== 'false') bad.push('le menu reste ouvert après Détacher');
      if (isLocked('v2-btn-table') || isLocked('v2-btn-code-block')) bad.push('un bouton reste grisé après Détacher');
      await sleep(GROUP_GAP_MS);
      await undo();
      if (docJson() !== reference || linkedIds().join() !== String(m.id)) bad.push('un Annuler ne rend pas le lien : ' + linkedIds().join());
      await sleep(GROUP_GAP_MS);
      if (!LinkedTable.detach(ed())) bad.push('detach() refuse alors que le curseur est dans le tableau lié');
      await sleep(100);
      await cursorAt('après');
      const again = LinkedTable.insert(ed(), m);
      await sleep(100);
      if (!again || linkedIds().join() !== String(m.id)) bad.push('le modèle ne se lie pas de nouveau après Détacher');
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  const BLOCK_BUTTONS = ['v2-btn-table', 'v2-btn-two-columns', 'v2-btn-toc', 'v2-btn-citation', 'v2-btn-code-block', 'v2-btn-callout'];

  cases.push({
    id: 'linked_cursor_in_greys_the_block_buttons_and_gives_them_back',
    description: 'Le curseur dans un tableau lié grise (jamais retire) Tableau, Deux colonnes, Sommaire, Citation, Bloc de code et Encadré, comme dans une grille ; le bloc de signature, qui se pose sous le tableau, reste actif ; hors du tableau, ou dans un tableau sans lien, ils sont rendus ; un bouton grisé ne fait rien même au clavier',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await model('Boutons', gridHtml('B', 2, 2));
      Editor.setHTML('<p>avant</p>' + gridHtml('F', 2, 2) + linkedHtml(m.id, 'B', 2, 2) + '<p>après</p>');
      await sleep(200);
      await cursorIn(1, 0, 0);
      MainToolbar.syncToolbarState();
      const greyed = BLOCK_BUTTONS.filter(id => !isLocked(id));
      if (greyed.length || !BLOCK_BUTTONS.every(id => document.getElementById(id))) bad.push('pas grisés dans le tableau lié : ' + greyed.join());
      // Un clic qui arrive quand même (clavier) ne fait rien.
      const was = docJson();
      BLOCK_BUTTONS.forEach((id) => { const el = document.getElementById(id); el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); el.click(); });
      await sleep(80);
      if (docJson() !== was) bad.push('un bouton grisé a agi');
      await cursorIn(0, 0, 0);
      MainToolbar.syncToolbarState();
      const stuck = BLOCK_BUTTONS.filter(id => isLocked(id));
      if (stuck.length) bad.push('toujours grisés dans le tableau sans lien : ' + stuck.join());
      ed().commands.setTextSelection(2);
      await sleep(120);
      MainToolbar.syncToolbarState();
      const stuckOutside = BLOCK_BUTTONS.filter(id => isLocked(id));
      if (stuckOutside.length) bad.push('toujours grisés hors du tableau : ' + stuckOutside.join());
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_menu_row_is_greyed_with_its_reason_and_never_removed',
    description: 'La ligne « Tableau d\'un modèle Grille… » du menu du bouton Tableau : active dans le texte, grisée avec sa raison en info-bulle (deux langues) quand le curseur est dans un tableau ou que le suivi est allumé ; grisée avec le bouton Tableau en grille ; le bouton Tableau ne perd pas sa fonction (un clic pose toujours un tableau ordinaire)',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await model('Ligne', gridHtml('L', 2, 2));
      const state = () => { const r = rowSpec(); return { disabled: r.getAttribute('aria-disabled') === 'true', greyed: r.classList.contains('v2-hover-row-disabled'), title: r.title }; };
      await cursorAt('avant');
      MainToolbar.syncToolbarState();
      const free = state();
      if (free.disabled || free.greyed || free.title) bad.push('dans le texte : ' + JSON.stringify(free));
      const lang = I18n.getLang();
      try {
        Editor.setTrackChanges(true);
        await sleep(120);
        MainToolbar.syncToolbarState();
        for (const code of ['fr', 'en']) {
          I18n.setLang(code); await sleep(60); MainToolbar.syncToolbarState();
          const tracked = state();
          if (!tracked.disabled || !tracked.greyed || tracked.title !== I18n.t('linkedTable.rowTracked')) bad.push(code + ' sous le suivi : ' + JSON.stringify(tracked));
        }
        Editor.setTrackChanges(false);
        await sleep(120);
        Editor.setHTML(WITH_TABLE(m.id)); await sleep(150);
        await cursorIn(0, 0, 0);
        MainToolbar.syncToolbarState();
        for (const code of ['fr', 'en']) {
          I18n.setLang(code); await sleep(60); MainToolbar.syncToolbarState();
          const inTable = state();
          if (!inTable.disabled || !inTable.greyed || inTable.title !== I18n.t('linkedTable.rowInTable')) bad.push(code + ' dans un tableau : ' + JSON.stringify(inTable));
        }
      } finally { I18n.setLang(lang); }
      // Un clic sur une ligne grisée ne pose rien.
      const was = docJson();
      rowSpec().click();
      await sleep(250);
      if (docJson() !== was || picker()) bad.push('la ligne grisée a agi');
      closePicker();
      // Le bouton Tableau garde sa fonction : un clic, hors du tableau, pose un tableau ordinaire de deux lignes et deux colonnes, sans lien.
      Editor.setHTML(DOC); await sleep(150);
      await cursorAt('avant');
      document.getElementById('v2-btn-table').click();
      await sleep(150);
      const plain = tablesOf();
      if (plain.length !== 1 || plain[0].node.childCount !== 2 || plain[0].node.attrs.linkedTemplate) bad.push('le bouton Tableau : ' + plain.length + ' tableaux');
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_table_button_is_named_by_its_menu_title_and_its_key_is_written_there',
    description: 'Le bouton Tableau, devenu un bouton à menu au survol (comme Image, Enregistrer et Exporter), n\'a pas d\'info-bulle propre : elle se retirerait dès l\'ouverture du menu. Il se nomme par son aria-label et par le titre de son menu (« Insérer un tableau », « Insert a table »), et la touche qu\'on lui donne s\'écrit sur ce titre (dans la langue en cours) et se dit aux lecteurs d\'écran sur le bouton ; la rendre la retire des deux',
    run: async (h) => {
      await h.resetEditor();
      const bad = [];
      const button = document.getElementById('v2-btn-table');
      const title = document.querySelector('#v2-table-flyout .v2-hover-flyout-label');
      const lang = I18n.getLang();
      const shown = () => getComputedStyle(title, '::after').content.replace(/^"|"$/g, '');
      const aria = () => button.getAttribute('aria-keyshortcuts');
      try {
        if (button.hasAttribute('data-tip')) bad.push('le bouton garde une info-bulle propre : ' + button.getAttribute('data-tip'));
        for (const code of ['fr', 'en']) {
          I18n.setLang(code); await sleep(60);
          const name = I18n.t('insert.table');
          if (button.getAttribute('aria-label') !== name || title.textContent.trim() !== name) bad.push(code + ' : ' + JSON.stringify([button.getAttribute('aria-label'), title.textContent.trim()]) + ' au lieu de « ' + name + ' »');
        }
        I18n.setLang('fr'); await sleep(60);
        if (title.getAttribute('data-keytip') || aria()) bad.push('une touche que personne n\'a donnée : ' + JSON.stringify([title.getAttribute('data-keytip'), aria()]));
        const given = Shortcuts.setKey('table', 'Alt+Shift+t');
        if (given.problem) bad.push('la touche est refusée : ' + given.problem);
        const french = [shown(), aria()];
        const onButton = [button.getAttribute('data-keytip'), button.getAttribute('data-keyhint')];
        I18n.setLang('en');
        const english = [shown(), aria()];
        I18n.setLang('fr');
        if (french.join('|') !== ' (Alt+Maj+T)|Alt+Shift+T') bad.push('en français : ' + JSON.stringify(french));
        if (english.join('|') !== ' (Alt+Shift+T)|Alt+Shift+T') bad.push('en anglais : ' + JSON.stringify(english));
        Shortcuts.resetKey('table');
        if (onButton.some(Boolean)) bad.push('la touche s\'écrit sur le bouton, qui n\'a pas d\'info-bulle pour la porter : ' + JSON.stringify(onButton));
        if (title.getAttribute('data-keytip') || aria()) bad.push('la touche rendue reste écrite : ' + JSON.stringify([title.getAttribute('data-keytip'), aria()]));
      } finally {
        Shortcuts.resetKey('table');
        I18n.setLang(lang);
      }
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    },
  });

  // === 7) Les sorties ==================================================================================================================================================

  cases.push({
    id: 'linked_reading_pdf_and_word_do_not_know_about_the_link',
    description: 'La Lecture, le PDF et le Word d\'un document qui porte un tableau lié sont ceux du même document SANS lien : un attribut que les sorties ne connaissent pas est ignoré (le lien est un fait de l\'éditeur)',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await model('Sorties', gridHtml('X', 3, 3));
      const linked = WITH_TABLE(m.id);
      const free = linked.replace(` ${ATTR}="${m.id}"`, '');
      const strip = html => html.replace(/ data-linked-template="[^"]*"/g, '');
      const readerLinked = await h.renderReaderMode(linked);
      const linkedReader = readerLinked.innerHTML;
      const readerFree = await h.renderReaderMode(free);
      if (strip(linkedReader) !== readerFree.innerHTML) bad.push('la Lecture diffère : ' + linkedReader.length + ' / ' + readerFree.innerHTML.length);
      const pdfLinked = JSON.stringify((await h.exportPdfContent(linked)).content || null);
      const pdfFree = JSON.stringify((await h.exportPdfContent(free)).content || null);
      if (!pdfLinked || pdfLinked === 'null' || pdfLinked !== pdfFree) bad.push('le PDF diffère');
      const wordLinked = (await h.exportDocxParts(linked)).parts['word/document.xml'];
      const wordFree = (await h.exportDocxParts(free)).parts['word/document.xml'];
      if (!wordLinked || wordLinked !== wordFree) bad.push('le Word diffère');
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.linkedTable = cases;
})();
