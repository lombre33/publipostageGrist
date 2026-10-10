// Suite "linkedTable" - un tableau de document LIÉ à un modèle Grille (09/10, lot 6a sur 6 du tableau de document, « En direct » ; Antoine : « comme sur un Gdocs, intégrer un tableau qui
// soit en fait un modèle grille »). Le tableau porte le numéro du modèle (`data-linked-template`) et ses cases sont celles du modèle au moment de la pose (js/linked-table.js). Le lot 6a
// pose le lien, le 6b y met les deux sens à la main (« Mettre à jour depuis le modèle », « Envoyer au modèle ») et l'ouverture du modèle, le 6c-1 l'identité du lien (le jeton du modèle) ; l'automatique (6c-2) : le document suit le modèle (2a) et le modèle suit le document (2b). Ici, sans la souris (la ligne du menu du bouton Tableau, la liste, le repère et la barre à 700x400, clair et sombre,
// sont à dev-tests/verify-linked-table-mouse.mjs, groupe linkedTableMouse) :
//  1) l'attribut : l'aller-retour du HTML, un numéro qui n'en est pas un, un modèle qui n'existe plus ;
//  2) la pose : la copie des cases, le curseur dans la première, un seul Annuler, ce qui la refuse, la liste avec recherche (ordre, lignes grisées avec leur raison, deux langues) ;
//  3) les règles du contenu : ce qu'une grille refuse (commandes, collage) l'est aussi dans un tableau lié, alors que le même tableau SANS lien l'accepte (le test prouve le garde-fou),
//     ce qu'une grille accepte (texte, lignes, colonnes, fusion, saut de page) reste libre ;
//  4) un seul lien par modèle et par document : une copie du tableau perd son lien, l'original garde le sien ; un lien mort est sans effet ; une grille n'a jamais de lien ;
//  5) le suivi des modifications verrouille le tableau lié ;
//  6) le repère (une décoration de l'éditeur, rien dans le HTML ni dans les sorties), le groupe de la barre du tableau, « Détacher », les boutons et la ligne du menu qui se grisent ;
//  7) les sorties : la Lecture, le PDF et le Word ne savent rien du lien ;
//  8) les deux sens (lot 6b) : mettre à jour depuis le modèle (cases, curseur, un Annuler, modèle relu, tableau déjà identique, modèle introuvable), envoyer au modèle (seules les
//     deux colonnes écrites, ni lien ni commentaires, la confirmation et son compte, annulée = rien d'écrit, déjà identique = rien à écrire, tableau riche stable à l'aller-retour,
//     échec d'écriture), ce qui les refuse (suivi, une action en cours, éditeur en lecture) et les lignes du menu du lien ;
//  9) « Ouvrir le modèle » (lot 6b-2) : le modèle à l'écran, le bandeau de retour, le retour dans la même case, la confirmation à la suppression d'un modèle posé ailleurs ;
// 10) l'identité du lien (lot 6c-1) : le jeton du modèle (créé une fois, dans sa colonne, jamais par un enregistrement), l'attribut `data-linked-key`, un numéro repris par un autre
//     modèle ou un tableau d'un autre document qui n'est pas un lien, les actions à la main arrêtées quand l'identité change, un lien ancien (sans jeton) qui reçoit le sien, le décompte ;
// 11) le document suit le modèle (lot 6c-2a) : la base du lien, la synchro à l'ouverture et à chaque passage de l'enregistrement automatique, les écarts, les sorties hors de l'éditeur ;
// 12) le modèle suit le document (lot 6c-2b) : le tableau que le document a changé part dans le MÊME lot que sa ligne (à la main, à chaque passage, pour un document neuf, « Enregistrer sous… »),
//     la base n'avance qu'une fois Grist d'accord, un lot refusé ne laisse rien de changé, un modèle changé ailleurs n'est jamais écrasé, les pauses de la synchro valent pour l'envoi.
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const ed = () => EditorCore.getEditor();
  // Plus de 500 ms entre deux gestes : prosemirror-history groupe sinon les transactions rapprochées en UN seul évènement (un Annuler défait alors les deux).
  const GROUP_GAP_MS = 700;
  const ATTR = 'data-linked-template';
  const KEY_ATTR = 'data-linked-key';

  const gridHtml = (label, rows, cols) => '<table><tbody>' + Array.from({ length: rows }, (_, r) => '<tr>' + Array.from({ length: cols }, (_, c) => `<td><p>${label}${'ABC'[c]}${r + 1}</p></td>`).join('') + '</tr>').join('') + '</tbody></table>';
  // Le jeton de chaque modèle que `model()` crée (Templates.ensureToken, que la liste avec recherche appelle à la pose) : un tableau lié que les cas écrivent à la main le porte, comme tout lien
  // posé depuis le lot 6c-1. `legacyHtml` : un lien d'avant ce lot, le numéro seul.
  const tokens = new Map();
  const keyAttr = id => (tokens.has(id) ? ` ${KEY_ATTR}="${tokens.get(id)}"` : '');
  const linkedHtml = (id, label, rows, cols) => gridHtml(label, rows, cols).replace('<table>', `<table ${ATTR}="${id}"${keyAttr(id)}>`);
  const legacyHtml = (id, label, rows, cols) => gridHtml(label, rows, cols).replace('<table>', `<table ${ATTR}="${id}">`);
  const unlinked = html => html.replace(/ data-linked-(?:template|key)="[^"]*"/g, '');
  const DOC = '<p>avant</p><p>après</p>';

  // La confirmation de l'envoi est une vraie fenêtre : les cas la remplacent le temps d'une réponse (withDoc la rend).
  const realConfirm = Dialogs.confirm;
  // Les modèles que le cas crée sont retirés à sa fin : la liste des modèles est celle des autres suites.
  const made = [];
  let counter = 0;
  // `bare` : un modèle Grille que personne n'a encore lié, sans jeton.
  async function model(name, html, type, bare) {
    const saved = await Templates.save(null, name + ' ' + (++counter), html, '', null, null, type || 'grille', null);
    made.push(saved.id);
    if ((!type || type === 'grille') && !bare) tokens.set(saved.id, await Templates.ensureToken(saved.id));
    await Templates.loadAll();
    return Templates.byId(saved.id);
  }
  async function dropModels() {
    tokens.clear();
    for (const id of made.splice(0)) { try { await Templates.remove(id); } catch (e) { /* déjà retiré */ } }
    try { await Templates.loadAll(); } catch (e) { /* le cache d'avant sert */ }
  }
  async function withDoc(h, html, body) {
    // Aucun passage de l'enregistrement automatique pendant le cas : depuis le lot 6c-2a il relit les modèles et fait suivre les tableaux liés du document, ce qui changerait le document sous
    // les pieds d'un cas qui le prépare (ceux de withApp, eux, le veulent).
    setAutosave(false);
    await h.resetEditor();
    Editor.setHTML(html);
    await sleep(200);
    ed().commands.focus();
    try { return await body(); } finally {
      Dialogs.confirm = realConfirm;
      say('');
      Editor.setTrackChanges(false);
      closePicker();
      if (GridEditor.isActive()) GridEditor.setActive(false);
      await dropModels();
      setAutosave(true);
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
  // La barre du tableau est affichée (le curseur est dans un tableau, l'éditeur a le focus) : sa classe `visible`.
  const barShown = () => !!panel() && panel().classList.contains('visible');
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
      const freeHtml = unlinked(html);
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
      const freeHtml = unlinked(html);
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
    description: '« Détacher » (la ligne du menu de la barre, la fonction) : le tableau garde ses cases, perd son numéro (le HTML n\'en écrit plus, le repère, le bouton et le menu disparaissent, les boutons se dégrisent) ; un seul Annuler rend le lien ; la barre du tableau reste affichée (le curseur est toujours dans le tableau) ; le modèle peut ensuite se lier de nouveau',
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
      // Un appui dans le menu d'une barre n'est pas un appui hors de la barre, même quand son action referme le menu : le curseur est toujours dans le tableau, la barre reste.
      if (!barShown()) bad.push('la barre du tableau se referme après Détacher alors que le curseur est toujours dans le tableau');
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
      const free = unlinked(linked);
      const strip = unlinked;
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

  // === 8) Les deux sens du lien (lot 6b) ===============================================================================================================================

  const stub = () => window.__gristStub;
  const rowOf = id => stub().getRow(Templates.TABLE_NAME, id);
  // Les écritures de ce cas dans la table des modèles : une action par ligne, avec les colonnes qu'elle touche.
  const modelWrites = () => stub().getActionLog().filter(a => (a[0] === 'UpdateRecord' || a[0] === 'AddRecord') && a[1] === Templates.TABLE_NAME);
  const statusLine = () => { const el = document.getElementById('status-msg'); return { text: el.textContent, error: el.classList.contains('error-msg') }; };
  function say(text) { const el = document.getElementById('status-msg'); if (el) { el.textContent = text; el.className = ''; } }
  const pullRow = () => menu() && menu().querySelector('[data-action="linked-pull"]');
  const pushRow = () => menu() && menu().querySelector('[data-action="linked-push"]');
  const openRow = () => menu() && menu().querySelector('[data-action="linked-open"]');
  // Le texte des cases d'une grille de `rows` x `cols` faite par gridHtml, dans l'ordre de lecture.
  const labels = (label, rows, cols) => Array.from({ length: rows * cols }, (_, i) => label + 'ABC'[i % cols] + (Math.floor(i / cols) + 1)).join('|');
  // Remplace la confirmation de l'envoi : répond `answer` (une valeur, ou une fonction du rang de la demande) et garde ce qu'on lui a demandé.
  function answerWith(answer) {
    const asked = [];
    Dialogs.confirm = async (options) => { asked.push(options); return typeof answer === 'function' ? answer(asked.length) : answer; };
    return asked;
  }
  // La case du curseur : [ligne, colonne] dans son tableau, ou null.
  function cursorCell() {
    const $head = ed().state.selection.$head;
    for (let depth = 1; depth < $head.depth; depth++) if ($head.node(depth).type.name === 'table') return [$head.index(depth), $head.index(depth + 1)];
    return null;
  }
  // Le document d'un cas : « avant », un tableau lié au modèle `id` (de `rows` x `cols` cases étiquetées `label`), « après ».
  const linkedDoc = (id, label, rows, cols) => '<p>avant</p>' + linkedHtml(id, label, rows, cols) + '<p>après</p>';
  // Un modèle Grille avec les colonnes que « Envoyer » ne doit pas toucher (nom du fichier PDF) ; rend sa ligne du cache.
  async function modelWithFile(name, html, file) {
    const saved = await Templates.save(null, name + ' ' + (++counter), html, file, null, null, 'grille', null);
    made.push(saved.id);
    tokens.set(saved.id, await Templates.ensureToken(saved.id));
    await Templates.loadAll();
    return Templates.byId(saved.id);
  }
  // Un modèle de document (ou d'e-mail) qui pose le tableau lié au modèle `id`.
  async function placing(id, type) {
    const saved = await Templates.save(null, 'Pose ' + (++counter), '<p>x</p>' + linkedHtml(id, 'P', 1, 1), '', null, null, type || 'document', null);
    made.push(saved.id);
    return saved.id;
  }

  cases.push({
    id: 'linked_pull_replaces_the_cells_with_the_models_keeps_the_cursor_cell_and_is_one_undo',
    description: '« Mettre à jour depuis le modèle » : les cases du tableau lié deviennent celles du modèle (ce qui y avait été écrit s\'en va), le lien reste, le texte autour ne bouge pas, le curseur reste dans la même case (ligne 2, colonne 3), la ligne d\'état le dit, rien n\'est écrit dans Grist, et un seul Annuler rend le tableau d\'avant',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await model('Mise à jour', gridHtml('M', 3, 3));
      Editor.setHTML(WITH_TABLE(m.id));
      await sleep(200);
      await cursorIn(0, 1, 2);
      await sleep(GROUP_GAP_MS);
      ed().chain().focus().insertContent('local').run();
      await sleep(GROUP_GAP_MS);
      const edited = docJson();
      stub().clearActionLog();
      say('');
      const done = await LinkedTable.pull(ed());
      await sleep(80);
      if (done !== true) bad.push('pull() a répondu ' + done);
      if (textsOf(tablesOf()[0].node) !== labels('M', 3, 3)) bad.push('les cases ne sont pas celles du modèle : ' + textsOf(tablesOf()[0].node));
      if (linkedIds().join() !== String(m.id)) bad.push('le lien est parti : ' + linkedIds().join());
      const html = Editor.getHTML();
      if (!html.startsWith('<p>avant</p><table') || html.indexOf('</table><p>après</p>') === -1) bad.push('le texte autour a bougé');
      if (JSON.stringify(cursorCell()) !== '[1,2]') bad.push('le curseur n\'est plus dans la case (ligne 2, colonne 3) : ' + JSON.stringify(cursorCell()));
      if (!LinkedTable.status(ed().state)) bad.push('la barre du tableau ne voit plus de lien sous le curseur');
      const line = statusLine();
      if (line.text !== I18n.t('linkedTable.pulled', { name: m.nom }) || line.error) bad.push('ligne d\'état : ' + JSON.stringify(line));
      if (modelWrites().length) bad.push('mettre à jour a écrit dans Grist : ' + JSON.stringify(modelWrites()));
      await undo();
      if (docJson() !== edited) bad.push('un Annuler ne rend pas le tableau d\'avant');
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_pull_reads_the_model_again_so_a_change_made_elsewhere_arrives',
    description: 'Le modèle est relu dans Grist avant de remplacer les cases : ce qu\'une autre personne (ou un autre document) y a écrit depuis la pose arrive, alors que le cache du widget a l\'ancien contenu',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await model('Ailleurs', gridHtml('A', 2, 2));
      Editor.setHTML(linkedDoc(m.id, 'A', 2, 2));
      await sleep(200);
      await cursorIn(0, 0, 0);
      stub().remoteWrite(Templates.TABLE_NAME, m.id, { Contenu: gridHtml('N', 2, 2), DateModif: new Date().toISOString() });
      if (Templates.byId(m.id).contenu.indexOf('NA1') !== -1) bad.push('le cache aurait déjà dû être périmé');
      await sleep(GROUP_GAP_MS);
      const done = await LinkedTable.pull(ed());
      await sleep(80);
      if (done !== true || textsOf(tablesOf()[0].node) !== labels('N', 2, 2)) bad.push('le changement fait ailleurs n\'est pas arrivé : ' + done + ' ' + textsOf(tablesOf()[0].node));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_pull_of_an_identical_table_changes_nothing_and_keeps_its_comments',
    description: 'Un tableau déjà identique à celui du modèle n\'est pas touché : ses cases ne changent pas (seule sa base s\'écrit : il est à jour), la marque de commentaire d\'une case reste, la ligne d\'état dit qu\'il est identique ; remplacer les cases la ferait disparaître',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await model('Identique', gridHtml('I', 2, 2));
      Editor.setHTML(linkedDoc(m.id, 'I', 2, 2));
      await sleep(200);
      const at = cellText(0, 1, 1);
      ed().chain().focus().setTextSelection({ from: at, to: at + 2 }).setMark('commentMark', { id: 'pull-test', resolved: false }).run();
      await sleep(100);
      const before = doc();
      say('');
      const done = await LinkedTable.pull(ed());
      await sleep(80);
      if (done !== true) bad.push('pull() a répondu ' + done);
      if (stripBase(JSON.stringify(doc().toJSON())) !== stripBase(JSON.stringify(before.toJSON()))) bad.push('le document a changé alors que le tableau est identique');
      if (!BASE_FORM.test(String(tableAttrs().linkedBase)) || planNow() !== 'none') bad.push('la base n\'est pas posée : ' + tableAttrs().linkedBase + ' ' + planNow());
      if (Editor.getHTML().indexOf('comment-mark') === -1) bad.push('la marque de commentaire a disparu');
      const line = statusLine();
      if (line.text !== I18n.t('linkedTable.upToDate', { name: m.nom }) || line.error) bad.push('ligne d\'état : ' + JSON.stringify(line));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_pull_says_when_the_model_is_gone_or_has_no_table_and_touches_nothing',
    description: 'Un modèle supprimé ou devenu sans tableau : « Mettre à jour » ne change ni le document ni Grist, rend faux et le dit dans la ligne d\'état (en erreur) ; le tableau reste lié ou non selon que le modèle existe encore (le lien d\'un modèle supprimé est sans effet)',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await model('Sans tableau', gridHtml('E', 2, 2));
      Editor.setHTML(WITH_TABLE(m.id));
      await sleep(200);
      await cursorIn(0, 0, 0);
      stub().remoteWrite(Templates.TABLE_NAME, m.id, { Contenu: '<p>plus de tableau</p>' });
      const reference = docJson();
      stub().clearActionLog();
      say('');
      const first = await LinkedTable.pull(ed());
      const lineA = statusLine();
      if (first !== false || docJson() !== reference) bad.push('modèle sans tableau : ' + first + ' ' + (docJson() === reference));
      if (lineA.text !== I18n.t('linkedTable.noTable', { name: m.nom }) || !lineA.error) bad.push('ligne d\'état (sans tableau) : ' + JSON.stringify(lineA));
      // Le modèle supprimé : le lien n'a plus d'effet, le curseur n'est plus dans un tableau lié, rien ne part.
      await Templates.remove(m.id);
      made.splice(made.indexOf(m.id), 1);
      await Templates.loadAll();
      say('');
      const second = await LinkedTable.pull(ed());
      if (second !== false || docJson() !== reference) bad.push('modèle supprimé : ' + second + ' ' + (docJson() === reference));
      if (modelWrites().length) bad.push('une écriture est partie : ' + JSON.stringify(modelWrites()));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_push_writes_the_table_into_the_model_alone_without_link_or_comments_after_asking',
    description: '« Envoyer au modèle » : après une confirmation (le titre dit le nom du modèle, le bouton « Envoyer »), le tableau du document est écrit dans le modèle par UNE écriture qui ne touche que Contenu et DateModif (le nom, le nom du fichier PDF, le type, l\'en-tête, les marges restent) ; le HTML écrit n\'a ni le numéro du lien ni les marques de commentaire ; le cache du widget a le nouveau contenu ; les cases du document ne bougent pas (sa base suit l\'envoi : plus rien à envoyer) ; la ligne d\'état le dit',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await modelWithFile('Envoi', gridHtml('G', 2, 2), 'mon-fichier');
      Editor.setHTML(linkedDoc(m.id, 'G', 2, 2));
      await sleep(200);
      await cursorIn(0, 0, 0);
      await sleep(GROUP_GAP_MS);
      ed().chain().focus().insertContent('X').run();
      const at = cellText(0, 1, 1);
      ed().chain().focus().setTextSelection({ from: at, to: at + 2 }).setMark('commentMark', { id: 'push-test', resolved: false }).run();
      await sleep(100);
      const reference = docJson();
      const before = rowOf(m.id);
      await sleep(1100);
      const asked = answerWith(true);
      stub().clearActionLog();
      say('');
      const done = await LinkedTable.push(ed());
      await sleep(80);
      if (done !== true) bad.push('push() a répondu ' + done);
      if (asked.length !== 1 || asked[0].title !== I18n.t('linkedTable.pushTitle') || asked[0].confirmLabel !== I18n.t('linkedTable.pushConfirm') || asked[0].message !== I18n.t('linkedTable.pushMessage', { name: m.nom })) {
        bad.push('la confirmation : ' + JSON.stringify(asked));
      }
      const writes = modelWrites();
      if (writes.length !== 1 || writes[0][0] !== 'UpdateRecord' || writes[0][2] !== m.id || Object.keys(writes[0][3]).sort().join() !== 'Contenu,DateModif') bad.push('les écritures : ' + JSON.stringify(writes.map(a => [a[0], a[2], Object.keys(a[3] || {})])));
      const after = rowOf(m.id);
      const changed = Object.keys(after).filter(k => JSON.stringify(after[k]) !== JSON.stringify(before[k])).sort().join();
      if (changed !== 'Contenu,DateModif') bad.push('colonnes changées : ' + changed);
      if (/data-linked-template/.test(after.Contenu) || /comment-mark|data-comment-id/.test(after.Contenu)) bad.push('le lien ou les commentaires sont partis dans le modèle');
      if (after.Contenu.indexOf('XGA1') === -1 || after.Contenu.indexOf('GB2') === -1 || !/^<table[ >]/.test(after.Contenu) || /<\/table><p>/.test(after.Contenu)) bad.push('contenu écrit : ' + after.Contenu.slice(0, 200));
      if (Templates.byId(m.id).contenu !== after.Contenu) bad.push('le cache n\'a pas le nouveau contenu');
      if (stripBase(docJson()) !== stripBase(reference)) bad.push('le document a bougé');
      if (!BASE_FORM.test(String(tableAttrs().linkedBase)) || planNow() !== 'none') bad.push('la base ne suit pas l\'envoi : ' + tableAttrs().linkedBase + ' ' + planNow());
      const line = statusLine();
      if (line.text !== I18n.t('linkedTable.pushed', { name: m.nom }) || line.error) bad.push('ligne d\'état : ' + JSON.stringify(line));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_push_refused_writes_nothing_and_the_confirmation_counts_the_other_models',
    description: 'Une confirmation refusée n\'écrit rien (document et modèle inchangés). Le message dit dans combien d\'AUTRES modèles le tableau est posé : aucun (rien de plus), un (singulier), deux (pluriel) - ni le modèle ouvert, ni une grille, ni un autre numéro qui commence par le même chiffre ; en anglais aussi',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await model('Compte', gridHtml('C', 2, 2));
      // Le tableau du document diffère de celui du modèle (« D » au lieu de « C ») : l'envoi demande.
      Editor.setHTML(linkedDoc(m.id, 'D', 2, 2));
      await sleep(200);
      await cursorIn(0, 0, 0);
      const reference = docJson();
      const asked = answerWith(false);
      const messageFor = n => [I18n.t('linkedTable.pushMessage', { name: m.nom }), n ? I18n.t('linkedTable.pushOthers', { n }) : ''].filter(Boolean).join(' ');
      const lang = I18n.getLang();
      const ask = async (n, label) => {
        stub().clearActionLog();
        const before = asked.length;
        const done = await LinkedTable.push(ed());
        if (done !== false || asked.length !== before + 1) bad.push(label + ' : push() ' + done + ', demandes ' + (asked.length - before));
        else if (asked[asked.length - 1].message !== messageFor(n)) bad.push(label + ' : message « ' + asked[asked.length - 1].message + ' » au lieu de « ' + messageFor(n) + ' »');
        if (modelWrites().length || docJson() !== reference) bad.push(label + ' : une confirmation refusée a écrit ou changé le document');
      };
      try {
        await ask(0, 'aucun autre modèle');
        // Ne comptent pas : une grille, le modèle ouvert, un autre numéro (« 10 » n'est pas « 1 »), un modèle qui ne pose rien.
        const cnt = await Templates.save(null, 'Grille avec marque ' + (++counter), linkedHtml(m.id, 'Q', 1, 1), '', null, null, 'grille', null);
        made.push(cnt.id);
        const open = await placing(m.id);
        const other = await Templates.save(null, 'Autre numéro ' + (++counter), '<p>x</p>' + linkedHtml(m.id + '0', 'Q', 1, 1), '', null, null, 'document', null);
        made.push(other.id);
        // Enregistrer un modèle neuf le rend courant : le modèle ouvert se désigne après.
        Templates.setCurrentId(open);
        await ask(0, 'un modèle ouvert, une grille, un autre numéro');
        Templates.setCurrentId(null);
        const one = await placing(m.id);
        await ask(1, 'un autre modèle');
        const two = await placing(m.id, 'email');
        await ask(2, 'deux autres modèles');
        if (one === two) bad.push('les deux modèles sont le même');
        I18n.setLang('en'); await sleep(60);
        await ask(2, 'deux autres modèles, en anglais');
        if (!/2 other templates/.test(asked[asked.length - 1].message)) bad.push('anglais : ' + asked[asked.length - 1].message);
        if (I18n.t('linkedTable.pushOthers', { n: 2 }) !== 'It is also placed in 2 other templates, which will get it when opened or with “Update from the template”.') bad.push('phrase anglaise : ' + I18n.t('linkedTable.pushOthers', { n: 2 }));
        I18n.setLang('fr'); await sleep(60);
        if (I18n.t('linkedTable.pushOthers', { n: 2 }) !== 'Il est aussi posé dans 2 autres modèles, qui le recevront à leur ouverture ou avec « Mettre à jour depuis le modèle ».') bad.push('phrase française : ' + I18n.t('linkedTable.pushOthers', { n: 2 }));
        if (!/2 autres modèles/.test(messageFor(2))) bad.push('français : ' + messageFor(2));
        if (!/ 1 autre modèle,/.test(' ' + I18n.t('linkedTable.pushOthers', { n: 1 }))) bad.push('singulier : ' + I18n.t('linkedTable.pushOthers', { n: 1 }));
      } finally { Templates.setCurrentId(null); I18n.setLang(lang); await sleep(60); }
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_push_of_an_identical_table_asks_nothing_and_writes_nothing',
    description: 'Un tableau déjà identique à celui du modèle (posé, jamais touché) : « Envoyer au modèle » ne demande rien, n\'écrit rien et le dit ; dès qu\'une case change, il demande',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await model('Déjà pareil', gridHtml('P', 2, 2));
      await cursorAt('après');
      if (!LinkedTable.insert(ed(), m)) bad.push('la pose a échoué');
      await sleep(150);
      const asked = answerWith(true);
      stub().clearActionLog();
      say('');
      const first = await LinkedTable.push(ed());
      if (first !== true || asked.length || modelWrites().length) bad.push('tableau identique : ' + JSON.stringify([first, asked.length, modelWrites().length]));
      const line = statusLine();
      if (line.text !== I18n.t('linkedTable.upToDate', { name: m.nom }) || line.error) bad.push('ligne d\'état : ' + JSON.stringify(line));
      await cursorIn(0, 0, 0);
      await sleep(GROUP_GAP_MS);
      ed().chain().focus().insertContent('!').run();
      await sleep(100);
      const second = await LinkedTable.push(ed());
      if (second !== true || asked.length !== 1 || modelWrites().length !== 1) bad.push('tableau modifié : ' + JSON.stringify([second, asked.length, modelWrites().length]));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_push_then_pull_leaves_a_rich_table_as_it_is',
    description: 'Un tableau riche (cases fusionnées, fond, bordures, gras, alignement, hauteur et largeur) envoyé au modèle puis relu par « Mettre à jour » est reconnu identique : le HTML que le modèle garde se relit en ce même tableau (ni transaction, ni perte), condition de la mise à jour automatique',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await model('Riche', gridHtml('R', 3, 3));
      await cursorAt('après');
      LinkedTable.insert(ed(), m);
      await sleep(150);
      await cursorIn(0, 0, 0);
      await sleep(GROUP_GAP_MS);
      ed().chain().focus().insertContent('Titre').run();
      ed().commands.setTextSelection({ from: cellText(0, 0, 0), to: cellText(0, 0, 0) + 5 });
      ed().chain().focus().toggleBold().run();
      await cursorIn(0, 1, 1);
      const first = tablesOf()[0];
      const cellPos = cellText(0, 1, 1) - 2;
      ed().chain().focus().setCellSelection({ anchorCell: cellPos, headCell: cellPos + first.node.child(1).child(1).nodeSize }).run();
      ed().chain().focus().mergeCells().run();
      await cursorIn(0, 1, 1);
      ed().chain().focus().updateAttributes('tableCell', { backgroundColor: '#ffe599' }).run();
      GridEditor.applyBorders(ed(), TableBorders.PRESETS[0], '#cc0000');
      await sleep(150);
      const rich = docJson();
      // Le navigateur écrit le fond en rgb() dans le HTML : c'est ce texte-là que le modèle garde, et que sa relecture redonne.
      const markers = [/colspan="2"/, /background-color: *(rgb\(255, 229, 153\)|#ffe599)/, /<strong>Titr/, /data-border-/];
      const html = Editor.getHTML();
      const missing = markers.filter(re => !re.test(html)).map(String);
      if (missing.length) bad.push('le tableau de départ n\'est pas assez riche : ' + missing.join(' '));
      answerWith(true);
      const pushed = await LinkedTable.push(ed());
      if (pushed !== true || !/data-border-/.test(rowOf(m.id).Contenu) || !/colspan="2"/.test(rowOf(m.id).Contenu)) bad.push('l\'envoi : ' + pushed);
      const before = doc();
      stub().clearActionLog();
      say('');
      const pulled = await LinkedTable.pull(ed());
      if (pulled !== true || (doc() !== before && !doc().eq(before)) || stripBase(docJson()) !== stripBase(rich)) bad.push('le tableau n\'est pas relu à l\'identique : ' + pulled);
      if (planNow() !== 'none') bad.push('plan après l\'envoi puis la mise à jour : ' + planNow());
      const line = statusLine();
      if (line.text !== I18n.t('linkedTable.upToDate', { name: m.nom })) bad.push('ligne d\'état : ' + JSON.stringify(line));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_push_that_fails_says_so_releases_the_action_and_leaves_the_model',
    description: 'Une écriture refusée par Grist : le modèle et le document sont inchangés, la ligne d\'état le dit en erreur, rien ne reste bloqué (l\'envoi suivant, une fois Grist revenu, passe)',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await model('Échec', gridHtml('F', 2, 2));
      Editor.setHTML(linkedDoc(m.id, 'F', 2, 2));
      await sleep(200);
      await cursorIn(0, 0, 0);
      await sleep(GROUP_GAP_MS);
      ed().chain().focus().insertContent('X').run();
      await sleep(100);
      const reference = docJson();
      const cached = Templates.byId(m.id).contenu;
      answerWith(true);
      const real = grist.docApi.applyUserActions;
      grist.docApi.applyUserActions = async (actions) => {
        if (actions.some(a => a[0] === 'UpdateRecord' && a[1] === Templates.TABLE_NAME)) throw new Error('refusé par les règles d\'accès');
        return real.call(grist.docApi, actions);
      };
      let failed;
      try {
        say('');
        failed = await LinkedTable.push(ed());
      } finally { grist.docApi.applyUserActions = real; }
      const line = statusLine();
      if (failed !== false || line.text !== I18n.t('linkedTable.pushFailed', { name: m.nom }) || !line.error) bad.push('échec : ' + JSON.stringify([failed, line]));
      if (/XFA1/.test(rowOf(m.id).Contenu) || Templates.byId(m.id).contenu !== cached || docJson() !== reference) bad.push('le modèle, son cache ou le document ont changé malgré l\'échec');
      const retry = await LinkedTable.push(ed());
      if (retry !== true || !/XFA1/.test(rowOf(m.id).Contenu)) bad.push('l\'envoi suivant ne passe pas : ' + retry);
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_actions_are_refused_under_track_changes_while_busy_and_for_a_read_only_editor',
    description: 'Les deux sens ne font rien (rendent faux, ne lisent même pas les modèles, ne demandent rien, n\'écrivent rien, laissent le document) sous le suivi des modifications et dans un éditeur en lecture ; un suivi allumé PENDANT la lecture des modèles ou pendant la fenêtre de confirmation les arrête aussi ; une seconde action lancée pendant la première est ignorée (une seule mise à jour), puis l\'action suivante passe',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await model('Refus', gridHtml('Z', 2, 2));
      Editor.setHTML(WITH_TABLE(m.id));
      await sleep(200);
      await cursorIn(0, 0, 0);
      const reference = docJson();
      const asked = answerWith(true);
      // Les lectures des modèles que le lien demande : une action refusée d'emblée n'en fait aucune. La sauvegarde automatique relit la table toutes les ~2,5 s, à un instant que le cas
      // ne maîtrise pas : seules comptent les lectures dont la pile d'appels passe par js/linked-table.js.
      const realLoad = Templates.loadAll;
      let reads = 0;
      Templates.loadAll = function () { if (/\/linked-table\.js/.test(new Error().stack || '')) reads++; return realLoad.apply(this, arguments); };
      try {
        stub().clearActionLog();
        Editor.setTrackChanges(true);
        await sleep(150);
        const tracked = [await LinkedTable.pull(ed()), await LinkedTable.push(ed())];
        Editor.setTrackChanges(false);
        await sleep(150);
        if (tracked.some(v => v !== false) || docJson() !== reference || asked.length || modelWrites().length) bad.push('suivi allumé : ' + JSON.stringify([tracked, docJson() === reference, asked.length, modelWrites().length]));
        await cursorIn(0, 0, 0);
        ed().setEditable(false);
        let locked;
        try { locked = [await LinkedTable.pull(ed()), await LinkedTable.push(ed())]; } finally { ed().setEditable(true); }
        await sleep(100);
        if (locked.some(v => v !== false) || docJson() !== reference || asked.length || modelWrites().length) bad.push('éditeur en lecture : ' + JSON.stringify([locked, docJson() === reference, asked.length, modelWrites().length]));
        if (reads) bad.push('une action refusée d\'emblée a quand même relu les modèles (' + reads + ' lectures)');
      } finally { Templates.loadAll = realLoad; }
      // Le suivi allumé pendant que les modèles se relisent (la lecture est retenue le temps du geste), puis pendant que la fenêtre de confirmation est ouverte.
      await cursorIn(0, 0, 0);
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      Templates.loadAll = async function () { await gate; return realLoad.apply(this, arguments); };
      try {
        const waiting = [LinkedTable.pull(ed())];
        await sleep(50);
        Editor.setTrackChanges(true);
        await sleep(150);
        release();
        const results = [await waiting[0]];
        if (results[0] !== false || docJson() !== reference) bad.push('suivi allumé pendant la lecture des modèles : le tableau a bougé ou l\'action a répondu ' + results[0]);
      } finally { Templates.loadAll = realLoad; Editor.setTrackChanges(false); await sleep(150); }
      await cursorIn(0, 0, 0);
      await sleep(GROUP_GAP_MS);
      const during = answerWith(() => { Editor.setTrackChanges(true); return true; });
      stub().clearActionLog();
      const sentUnderTrack = await LinkedTable.push(ed());
      Editor.setTrackChanges(false);
      await sleep(150);
      if (sentUnderTrack !== false || during.length !== 1 || modelWrites().length) bad.push('suivi allumé pendant la fenêtre : ' + JSON.stringify([sentUnderTrack, during.length, modelWrites().length]));
      await cursorIn(0, 0, 0);
      const both = await Promise.all([LinkedTable.pull(ed()), LinkedTable.pull(ed())]);
      if (both.join() !== 'true,false') bad.push('deux actions à la fois : ' + both.join());
      const next = await LinkedTable.pull(ed());
      if (next !== true) bad.push('l\'action suivante ne passe pas : ' + next);
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_menu_has_the_two_way_rows_that_start_the_actions_and_grey_under_track_changes',
    description: 'Le menu du lien a, dans l\'ordre, « Mettre à jour depuis le modèle », « Envoyer au modèle », « Ouvrir le modèle » et « Détacher », chacune avec son icône (quatre différentes), son libellé et son info-bulle en deux langues ; un appui sur la première referme le menu et met à jour le tableau, un appui sur la seconde referme le menu et demande confirmation, la barre du tableau reste affichée dans les deux cas ; sous le suivi des modifications, celles qui écrivent dans le document sont grisées avec la raison et un appui ne fait rien (le menu reste ouvert), « Ouvrir le modèle » reste libre',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await model('Menu', gridHtml('U', 2, 2));
      Editor.setHTML(WITH_TABLE(m.id));
      await sleep(200);
      await cursorIn(0, 0, 0);
      await sleep(100);
      press(barButton());
      await sleep(150);
      if (!menuOpen()) { return { pass: false, notes: 'le menu ne s\'ouvre pas' }; }
      const order = Array.from(menu().querySelectorAll('.v2-linked-menu-row')).map(el => el.getAttribute('data-action')).join();
      if (order !== 'linked-pull,linked-push,linked-open,linked-detach') bad.push('lignes : ' + order);
      const icons = Array.from(menu().querySelectorAll('.v2-linked-menu-row svg')).map(el => el.innerHTML);
      if (icons.length !== 4 || new Set(icons).size !== 4 || icons.some(markup => !markup)) bad.push('icônes : ' + icons.length + ' dont ' + new Set(icons).size + ' différentes');
      const lang = I18n.getLang();
      try {
        const texts = {};
        for (const code of ['fr', 'en']) {
          I18n.setLang(code); await sleep(60);
          press(barButton()); await sleep(60); press(barButton()); await sleep(120);
          texts[code] = [pullRow(), pushRow(), openRow(), detachRow()].map(row => row.textContent.trim() + ' / ' + row.title).join(' | ');
        }
        if (texts.fr === texts.en || !/Update from the template/.test(texts.en) || !/Send to the template/.test(texts.en) || !/Mettre à jour depuis le modèle/.test(texts.fr) || !/Envoyer au modèle/.test(texts.fr)
          || !/Open the template \/ Open the Grid template/.test(texts.en) || !/Ouvrir le modèle \/ Ouvre le modèle Grille/.test(texts.fr)) bad.push('deux langues : ' + JSON.stringify(texts));
        if (pullRow().title !== I18n.t('linkedTable.pull', { name: m.nom }) || pushRow().title !== I18n.t('linkedTable.push', { name: m.nom }) || openRow().title !== I18n.t('linkedTable.open', { name: m.nom })) bad.push('info-bulles : ' + pullRow().title + ' | ' + pushRow().title + ' | ' + openRow().title);
      } finally { I18n.setLang(lang); await sleep(60); }
      if ([pullRow(), pushRow(), openRow(), detachRow()].some(row => row.getAttribute('aria-disabled') !== 'false')) bad.push('une ligne est grisée sans raison');
      // « Mettre à jour » : le menu se referme, le tableau devient celui du modèle.
      if (!menuOpen()) { press(barButton()); await sleep(120); }
      await sleep(GROUP_GAP_MS);
      stub().clearActionLog();
      press(pullRow());
      await sleep(250);
      if (menuOpen()) bad.push('le menu reste ouvert après « Mettre à jour »');
      if (!barShown()) bad.push('la barre du tableau se referme après « Mettre à jour »');
      if (textsOf(tablesOf()[0].node) !== labels('U', 2, 2)) bad.push('« Mettre à jour » n\'a rien fait : ' + textsOf(tablesOf()[0].node));
      // « Envoyer » : le menu se referme, la confirmation est demandée (le tableau est maintenant identique : on le change d'abord).
      await cursorIn(0, 0, 0);
      await sleep(GROUP_GAP_MS);
      ed().chain().focus().insertContent('+').run();
      await sleep(100);
      const asked = answerWith(true);
      press(barButton());
      await sleep(150);
      press(pushRow());
      await sleep(300);
      if (menuOpen()) bad.push('le menu reste ouvert après « Envoyer »');
      if (!barShown()) bad.push('la barre du tableau se referme après « Envoyer »');
      if (asked.length !== 1 || modelWrites().length !== 1) bad.push('« Envoyer » : ' + JSON.stringify([asked.length, modelWrites().length]));
      // Sous le suivi : grisées avec la raison, un appui ne fait rien et le menu reste ouvert.
      Editor.setTrackChanges(true);
      await sleep(150);
      await cursorIn(0, 0, 0);
      press(barButton());
      await sleep(150);
      const why = I18n.t('linkedTable.lockedTracked', { name: m.nom });
      const rows = [pullRow(), pushRow(), detachRow()];
      const greyed = menuOpen() && rows.every(row => row && row.getAttribute('aria-disabled') === 'true' && row.title === why);
      if (!greyed) bad.push('sous le suivi : ' + JSON.stringify(rows.map(row => row && [row.getAttribute('aria-disabled'), row.title])));
      // « Ouvrir le modèle » n'écrit rien dans le document : ni grisée ni sans son info-bulle sous le suivi.
      if (!openRow() || openRow().getAttribute('aria-disabled') !== 'false' || openRow().title !== I18n.t('linkedTable.open', { name: m.nom })) bad.push('« Ouvrir le modèle » sous le suivi : ' + (openRow() && [openRow().getAttribute('aria-disabled'), openRow().title]));
      if (greyed) {
        stub().clearActionLog();
        const was = docJson();
        const askedBefore = asked.length;
        press(pullRow()); press(pushRow());
        await sleep(250);
        if (!menuOpen() || docJson() !== was || asked.length !== askedBefore || modelWrites().length) bad.push('un appui sous le suivi a agi : ' + JSON.stringify([menuOpen(), docJson() === was, asked.length - askedBefore, modelWrites().length]));
      }
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  // === 9) Ouvrir le modèle, revenir au document (lot 6b, suite) ========================================================================================================
  // « Ouvrir le modèle » (menu du lien) met le modèle Grille à l'écran par le chemin de la liste (js/main.js:openLinkedModel) ; le bandeau « Revenir au document » (#linked-return-bar) ramène au
  // document, le curseur dans la même case (LinkedTable.reveal). Ces cas passent par les vrais gestes : des documents ENREGISTRÉS ouverts par la liste, la ligne du menu, le vrai bouton du bandeau, les
  // vraies fenêtres « Modifications non enregistrées ». La mesure à la souris à 700x400 est dans le script Node linkedTableMouse.
  const AUTOSAVE_KEY = 'pp_autosave_enabled';
  function setAutosave(enabled) { try { if (enabled) localStorage.removeItem(AUTOSAVE_KEY); else localStorage.setItem(AUTOSAVE_KEY, 'false'); } catch (e) { /* stockage indisponible */ } }
  const barVisible = id => { const el = document.getElementById(id); return !!el && !el.hidden && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0; };
  const dialogButtons = () => Array.from(document.querySelectorAll('#pp-dialog-modal .pp-modal-actions button')).filter(b => !b.hidden);
  const dialogOpen = () => !!document.getElementById('pp-dialog-modal') && getComputedStyle(document.getElementById('pp-dialog-modal')).display !== 'none';
  async function answerDialog(label) {
    const button = dialogButtons().find(b => b.textContent === label);
    if (!button) throw new Error('bouton « ' + label + ' » absent de la fenêtre : ' + JSON.stringify(dialogButtons().map(b => b.textContent)));
    button.click();
    await sleep(600);
  }
  const screenOf = () => ({
    current: String(Templates.getCurrentId()), list: String(document.getElementById('template-select').value), name: document.getElementById('template-name').value,
    grid: GridEditor.isActive(), bar: barVisible('linked-return-bar'), macroBar: barVisible('macro-return-bar'),
    barText: document.getElementById('linked-return-text').textContent, barButton: document.getElementById('btn-linked-return').textContent,
  });
  // Ouvre un modèle par la liste des modèles, comme la personne (l'option est posée à la main quand la liste ne l'a pas encore relue), puis attend qu'il soit chargé.
  async function openByList(id, nom) {
    const select = document.getElementById('template-select');
    if (!Array.from(select.options).some(o => o.value === String(id))) { const option = document.createElement('option'); option.value = String(id); option.textContent = nom; select.appendChild(option); }
    select.value = String(id);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(800);
  }
  // Un document ENREGISTRÉ qui pose le tableau lié au modèle `m` (`rows` x `cols` cases étiquetées `label`), ouvert par la liste : modèle courant, nom, liste et éditeur le montrent. Rend { id, nom }.
  async function openedDoc(m, label, rows, cols, type) {
    const nom = 'Doc ' + (++counter);
    const saved = await Templates.save(null, nom, linkedDoc(m.id, label, rows, cols), '', null, null, type || 'document', null);
    made.push(saved.id);
    await Templates.loadAll();
    await openByList(saved.id, nom);
    ed().commands.focus();
    return { id: saved.id, nom };
  }
  // Les gestes de la personne jusqu'au modèle : le curseur dans la case (row, col) du tableau lié, le bouton du lien, la ligne « Ouvrir le modèle ».
  async function openFromMenu(row, col) {
    await cursorIn(0, row, col);
    await sleep(100);
    press(barButton());
    await sleep(150);
    if (!menuOpen() || !openRow()) return false;
    press(openRow());
    await sleep(900);
    return true;
  }
  // Repart d'un document vierge (le vrai bouton « + » ; la réponse toute faite à la question d'avant de quitter est « Abandonner »), enregistrement automatique allumé, et remet tout en place à la fin.
  async function withApp(h, body) {
    setAutosave(true);
    await h.clickButton('btn-new');
    await sleep(300);
    try { return await body(); } finally {
      Dialogs.confirm = realConfirm;
      for (const label of ['Abandonner', 'Annuler']) if (dialogOpen() && dialogButtons().some(b => b.textContent === label)) await answerDialog(label).catch(() => {});
      Editor.setTrackChanges(false);
      setAutosave(true);
      say('');
      await h.clickButton('btn-new');
      await sleep(300);
      await dropModels();
    }
  }

  cases.push({
    id: 'linked_open_puts_the_model_on_screen_with_a_return_bar_and_the_bar_brings_back_to_the_same_cell',
    description: '« Ouvrir le modèle » (ligne du menu du lien) referme le menu et met le modèle Grille à l\'écran par le chemin de la liste (modèle courant, nom, liste, grille active) avec le bandeau « Revenir au document » (texte et bouton dans la langue de l\'interface, rien d\'écrit dans Grist) ; « Revenir au document » remet le document, sans bandeau, le curseur dans la case où il était, la barre du tableau affichée et le tableau intact, sans message d\'écart quand il est celui du modèle',
    run: async (h) => withApp(h, async () => {
      const bad = [];
      const m = await model('Ouvrir', gridHtml('O', 3, 2));
      const d = await openedDoc(m, 'O', 3, 2);
      stub().clearActionLog();
      const was = textsOf(tablesOf()[0].node);
      if (!(await openFromMenu(1, 1))) return { pass: false, notes: 'la ligne « Ouvrir le modèle » est introuvable' };
      const on = screenOf();
      if (on.current !== String(m.id) || on.list !== String(m.id) || on.name !== m.nom || !on.grid) bad.push('le modèle n\'est pas à l\'écran : ' + JSON.stringify(on));
      if (!on.bar || on.barText !== 'Modèle Grille ouvert depuis le document « ' + d.nom + ' ».' || on.barButton !== 'Revenir au document' || on.macroBar) bad.push('bandeau : ' + JSON.stringify(on));
      if (menuOpen()) bad.push('le menu reste ouvert');
      if (modelWrites().length) bad.push('ouvrir a écrit dans Grist : ' + JSON.stringify(modelWrites()));
      if (textsOf(tablesOf()[0].node) !== labels('O', 3, 2)) bad.push('la grille ne montre pas les cases du modèle : ' + textsOf(tablesOf()[0].node));
      // Le texte du bandeau suit la langue de l'interface.
      const lang = I18n.getLang();
      try {
        I18n.setLang('en'); await sleep(80);
        const en = screenOf();
        if (en.barText !== 'Grid template opened from the document “' + d.nom + '”.' || en.barButton !== 'Back to the document' || document.getElementById('linked-return-bar').getAttribute('aria-label') !== 'Back to the document') bad.push('anglais : ' + JSON.stringify(en));
      } finally { I18n.setLang(lang); await sleep(80); }
      say('');
      // Un clic de souris donne d'abord le focus au bouton : le clavier doit revenir dans le document.
      document.getElementById('btn-linked-return').focus();
      document.getElementById('btn-linked-return').click();
      await sleep(900);
      const back = screenOf();
      if (back.current !== String(d.id) || back.list !== String(d.id) || back.name !== d.nom || back.grid || back.bar) bad.push('le document n\'est pas revenu : ' + JSON.stringify(back));
      if (textsOf(tablesOf()[0].node) !== was) bad.push('le tableau du document a changé : ' + textsOf(tablesOf()[0].node));
      if (JSON.stringify(cursorCell()) !== '[1,1]' || ed().state.selection.$head.parent.textContent !== 'OB2') bad.push('le curseur n\'est pas dans la même case : ' + JSON.stringify(cursorCell()));
      if (!ed().view.hasFocus() || !barShown()) bad.push('focus ou barre du tableau : ' + JSON.stringify([ed().view.hasFocus(), barShown()]));
      if (/diffère|differs/.test(statusLine().text)) bad.push('message d\'écart alors que le tableau est celui du modèle : ' + statusLine().text);
      if (modelWrites().length) bad.push('revenir a écrit dans Grist : ' + JSON.stringify(modelWrites()));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_open_and_return_ask_about_pending_edits_and_cancel_keeps_the_screen_and_the_bar',
    description: 'Avec des modifications en attente, « Ouvrir le modèle » pose la question « Modifications non enregistrées » (rien d\'écrit tant qu\'on n\'a pas répondu) : Annuler garde le document, son texte, le menu fermé et pas de bandeau ; Enregistrer écrit le document (et, depuis le lot 6c-2b, la frappe de son tableau lié dans le modèle, dans le même lot) puis ouvre le modèle, qui montre cette frappe. De même « Revenir au document » depuis une grille modifiée : Annuler garde le modèle et le bandeau, Abandonner rend le document sans rien écrire de plus dans le modèle (la frappe faite dans la grille n\'y est pas)',
    run: async (h) => withApp(h, async () => h.withRealChoose(async () => {
      setAutosave(false); // aucun passage du minuteur : seul un enregistrement de ce geste pourrait écrire
      const bad = [];
      const m = await model('Question', gridHtml('Q', 2, 2));
      const d = await openedDoc(m, 'Q', 2, 2);
      const modelBefore = String(rowOf(m.id).Contenu);
      await cursorIn(0, 0, 0);
      await sleep(GROUP_GAP_MS);
      ed().chain().focus().insertContent('+').run();
      await sleep(150);
      stub().clearActionLog();
      // Aller vers le modèle : la question, rien d'écrit, « Annuler » garde tout.
      await cursorIn(0, 1, 1);
      press(barButton()); await sleep(150);
      press(openRow()); await sleep(500);
      const asked = { open: dialogOpen(), labels: dialogButtons().map(b => b.textContent), message: dialogOpen() ? document.getElementById('pp-dialog-message').textContent : '', writes: modelWrites().length };
      if (!asked.open || JSON.stringify(asked.labels) !== JSON.stringify(['Annuler', 'Abandonner', 'Enregistrer']) || !asked.message.includes(d.nom) || asked.writes !== 0) bad.push('question : ' + JSON.stringify(asked));
      if (dialogOpen()) await answerDialog('Annuler');
      const kept = screenOf();
      if (dialogOpen() || menuOpen() || kept.current !== String(d.id) || kept.grid || kept.bar || !docJson().includes('+') || modelWrites().length) bad.push('après Annuler : ' + JSON.stringify({ kept, menu: menuOpen(), typed: docJson().includes('+'), writes: modelWrites().length }));
      // « Enregistrer » : le document est écrit avec la frappe, puis le modèle s'ouvre avec son bandeau.
      await cursorIn(0, 1, 1);
      press(barButton()); await sleep(150);
      press(openRow()); await sleep(500);
      if (dialogOpen()) await answerDialog('Enregistrer');
      await sleep(600);
      const stored = String(rowOf(d.id).Contenu);
      const opened = screenOf();
      if (dialogOpen() || opened.current !== String(m.id) || !opened.grid || !opened.bar || !stored.includes('+')) bad.push('après Enregistrer : ' + JSON.stringify({ opened, stored: stored.includes('+') }));
      // Le tableau lié que le document a changé est parti avec son enregistrement (lot 6c-2b) : le modèle ouvert a la frappe du document.
      const modelSent = String(rowOf(m.id).Contenu);
      if (modelSent === modelBefore || !modelSent.includes('+') || textsOf(tablesOf()[0].node).indexOf('+') === -1) bad.push('le modèle n\'a pas reçu la frappe du document : ' + modelSent.slice(0, 80) + ' / ' + textsOf(tablesOf()[0].node));
      // Dans la grille : une modification en attente, puis « Revenir au document ».
      await sleep(GROUP_GAP_MS);
      ed().chain().focus().insertContent('!').run();
      await sleep(150);
      stub().clearActionLog();
      document.getElementById('btn-linked-return').click();
      await sleep(500);
      const back = { open: dialogOpen(), labels: dialogButtons().map(b => b.textContent), message: dialogOpen() ? document.getElementById('pp-dialog-message').textContent : '', writes: modelWrites().length };
      if (!back.open || JSON.stringify(back.labels) !== JSON.stringify(['Annuler', 'Abandonner', 'Enregistrer']) || !back.message.includes(m.nom) || back.writes !== 0) bad.push('question au retour : ' + JSON.stringify(back));
      if (dialogOpen()) await answerDialog('Annuler');
      const stay = screenOf();
      if (dialogOpen() || stay.current !== String(m.id) || !stay.grid || !stay.bar || modelWrites().length) bad.push('après Annuler au retour : ' + JSON.stringify({ stay, writes: modelWrites().length }));
      document.getElementById('btn-linked-return').click();
      await sleep(500);
      if (dialogOpen()) await answerDialog('Abandonner');
      const home = screenOf();
      if (dialogOpen() || home.current !== String(d.id) || home.grid || home.bar || String(rowOf(m.id).Contenu) !== modelSent) bad.push('après Abandonner : ' + JSON.stringify({ home, modelKept: String(rowOf(m.id).Contenu) === modelSent }));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    })),
  });

  cases.push({
    id: 'linked_return_says_when_the_table_differs_from_the_model_and_replaces_nothing',
    description: 'Une grille modifiée puis enregistrée au retour (« Enregistrer ») : le document, dont le tableau a été posé sans base (avant le lot 6c-2a), revient avec son tableau tel qu\'il était (rien ne se remplace faute de savoir lequel des deux a changé), le curseur dans la même case, et la ligne d\'état dit que le tableau diffère du modèle, avec le nom du modèle et les deux actions du menu du lien, dans la langue de l\'interface',
    run: async (h) => withApp(h, async () => h.withRealChoose(async () => {
      setAutosave(false);
      const bad = [];
      const m = await model('Ecart', gridHtml('E', 2, 2));
      const d = await openedDoc(m, 'E', 2, 2);
      const was = textsOf(tablesOf()[0].node);
      if (!(await openFromMenu(0, 1))) return { pass: false, notes: 'la ligne « Ouvrir le modèle » est introuvable' };
      ed().chain().focus().insertContent('!').run();
      await sleep(150);
      document.getElementById('btn-linked-return').click();
      await sleep(500);
      if (dialogOpen()) await answerDialog('Enregistrer');
      await sleep(700);
      const home = screenOf();
      if (home.current !== String(d.id) || home.grid || home.bar) bad.push('le document n\'est pas revenu : ' + JSON.stringify(home));
      if (!String(rowOf(m.id).Contenu).includes('!')) bad.push('le modèle n\'a pas reçu la frappe');
      if (textsOf(tablesOf()[0].node) !== was) bad.push('le tableau du document a été remplacé : ' + textsOf(tablesOf()[0].node));
      const line = statusLine();
      if (line.text !== 'Ce tableau diffère du modèle « ' + m.nom + ' » : « Mettre à jour depuis le modèle » ou « Envoyer au modèle » (menu du lien).' || line.error) bad.push('ligne d\'état : ' + JSON.stringify(line));
      if (JSON.stringify(cursorCell()) !== '[0,1]') bad.push('curseur : ' + JSON.stringify(cursorCell()));
      // Le même retour en anglais.
      const lang = I18n.getLang();
      try {
        I18n.setLang('en'); await sleep(80);
        if (!(await openFromMenu(0, 1))) bad.push('« Open the template » introuvable');
        else {
          document.getElementById('btn-linked-return').click();
          await sleep(900);
          if (statusLine().text !== 'This table differs from the template “' + m.nom + '”: “Update from the template” or “Send to the template” (link menu).') bad.push('anglais : ' + statusLine().text);
        }
      } finally { I18n.setLang(lang); await sleep(80); }
      // Le tableau remis d'accord (« Mettre à jour ») : plus d'écart au prochain retour.
      press(barButton()); await sleep(150);
      press(pullRow()); await sleep(500);
      say('');
      if (!(await openFromMenu(0, 1))) bad.push('ligne introuvable (3)');
      else {
        document.getElementById('btn-linked-return').click();
        await sleep(900);
        if (/diffère|differs/.test(statusLine().text)) bad.push('écart annoncé alors que le tableau est celui du modèle : ' + statusLine().text);
      }
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    })),
  });

  cases.push({
    id: 'linked_return_bar_goes_away_with_any_other_template_but_stays_when_the_same_one_is_chosen_again',
    description: 'Le bandeau « Revenir au document » disparaît dès qu\'un autre modèle se charge (la liste, « + ») et reste quand le même modèle est choisi de nouveau (comme le rechargement d\'un conflit d\'enregistrement automatique)',
    run: async (h) => withApp(h, async () => {
      const bad = [];
      const m = await model('Bandeau', gridHtml('B', 2, 2));
      const d = await openedDoc(m, 'B', 2, 2);
      if (!(await openFromMenu(0, 0))) return { pass: false, notes: 'la ligne « Ouvrir le modèle » est introuvable' };
      if (!screenOf().bar) bad.push('bandeau absent après « Ouvrir le modèle »');
      await openByList(m.id, m.nom);
      if (!screenOf().bar || screenOf().current !== String(m.id)) bad.push('le même modèle rechargé doit garder le bandeau : ' + JSON.stringify(screenOf()));
      await openByList(d.id, d.nom);
      if (screenOf().bar || screenOf().current !== String(d.id)) bad.push('un autre modèle choisi dans la liste doit effacer le bandeau : ' + JSON.stringify(screenOf()));
      // Retour par « + » : un document vierge n'a pas de bandeau non plus.
      if (!(await openFromMenu(0, 0))) bad.push('la ligne « Ouvrir le modèle » est introuvable (2)');
      else {
        if (!screenOf().bar) bad.push('bandeau absent (2)');
        await h.clickButton('btn-new');
        await sleep(400);
        if (screenOf().bar) bad.push('« + » doit effacer le bandeau : ' + JSON.stringify(screenOf()));
      }
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_return_bar_goes_away_when_save_as_puts_a_copy_on_screen',
    description: '« Enregistrer sous… » depuis le modèle ouvert par « Ouvrir le modèle » met une copie à l\'écran : ce n\'est pas le modèle que le tableau du document désigne, le bandeau « Revenir au document » s\'efface',
    run: async (h) => withApp(h, async () => {
      const dialogs = h.stubDialogs({ prompt: 'Copie de la grille' });
      try {
        const bad = [];
        const m = await model('Copie', gridHtml('C', 2, 2));
        await openedDoc(m, 'C', 2, 2);
        if (!(await openFromMenu(0, 0))) return { pass: false, notes: 'la ligne « Ouvrir le modèle » est introuvable' };
        if (!screenOf().bar) bad.push('bandeau absent après « Ouvrir le modèle »');
        document.getElementById('v2-btn-save-as').click();
        await sleep(900);
        const after = screenOf();
        if (after.current === String(m.id) || after.name !== 'Copie de la grille') bad.push('la copie n\'est pas à l\'écran : ' + JSON.stringify(after));
        if (after.bar) bad.push('bandeau resté sur une copie : ' + JSON.stringify(after));
        if (after.current && after.current !== 'null' && after.current !== String(m.id)) made.push(Number(after.current));
        return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
      } finally { dialogs.restore(); }
    }),
  });

  cases.push({
    id: 'linked_return_gives_the_document_back_its_macro_return_bar',
    description: 'Un document ouvert par le stylo d\'un macro-modèle, puis son modèle Grille par « Ouvrir le modèle » (seul le bandeau « Revenir au document » est à l\'écran) : « Revenir au document » rend le document avec son bandeau « Revenir au macro-modèle », qui ramène au macro-modèle ; un retour annulé (modifications en attente dans la grille) laisse le modèle et son seul bandeau',
    run: async (h) => withApp(h, async () => h.withRealChoose(async () => {
      setAutosave(false);
      const bad = [];
      const m = await model('Macro', gridHtml('M', 2, 2));
      const d = await openedDoc(m, 'M', 2, 2);
      const macroName = 'Macro ' + (++counter);
      const macro = await Templates.save(null, macroName, JSON.stringify({ slots: [{ type: 'fixed', modeleId: d.id }] }), '', null, null, 'macro', null);
      made.push(macro.id);
      await Templates.loadAll();
      await openByList(macro.id, macroName);
      const pencil = document.querySelector('.macro-summary-edit[data-template-id="' + d.id + '"]');
      if (!pencil) return { pass: false, notes: 'le stylo du document est introuvable dans le résumé du macro-modèle' };
      pencil.click();
      await sleep(900);
      if (screenOf().current !== String(d.id) || !screenOf().macroBar) bad.push('le document n\'est pas ouvert par le stylo : ' + JSON.stringify(screenOf()));
      ed().commands.focus();
      if (!(await openFromMenu(1, 0))) return { pass: false, notes: 'la ligne « Ouvrir le modèle » est introuvable : ' + bad.join(' | ') };
      const on = screenOf();
      if (on.current !== String(m.id) || !on.bar || on.macroBar) bad.push('sur le modèle, seul le bandeau du modèle doit s\'afficher : ' + JSON.stringify(on));
      // Un retour annulé : le modèle reste, avec son seul bandeau (celui du macro-modèle ne revient pas tant que le document n'est pas là).
      ed().chain().focus().insertContent('!').run();
      await sleep(150);
      document.getElementById('btn-linked-return').click();
      await sleep(500);
      if (!dialogOpen()) bad.push('la question « Modifications non enregistrées » n\'est pas posée au retour');
      else await answerDialog('Annuler');
      const stay = screenOf();
      if (stay.current !== String(m.id) || !stay.grid || !stay.bar || stay.macroBar) bad.push('après Annuler : ' + JSON.stringify(stay));
      document.getElementById('btn-linked-return').click();
      await sleep(500);
      if (dialogOpen()) await answerDialog('Abandonner');
      await sleep(400);
      const back = screenOf();
      if (back.current !== String(d.id) || back.bar || !back.macroBar) bad.push('de retour, le bandeau du macro-modèle doit revenir : ' + JSON.stringify(back));
      if (document.getElementById('macro-return-text').textContent !== 'Modèle ouvert depuis le macro-modèle « ' + macroName + ' ».') bad.push('texte du bandeau du macro-modèle : ' + document.getElementById('macro-return-text').textContent);
      document.getElementById('btn-macro-return').click();
      await sleep(900);
      const home = screenOf();
      if (home.current !== String(macro.id) || home.bar || home.macroBar) bad.push('« Revenir au macro-modèle » : ' + JSON.stringify(home));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    })),
  });

  cases.push({
    id: 'linked_open_of_a_model_that_is_gone_says_so_and_keeps_the_document',
    description: 'Le modèle a été supprimé par quelqu\'un d\'autre juste avant « Ouvrir le modèle » (ou son numéro repris par un modèle qui n\'est pas une grille) : la ligne d\'état dit qu\'il est introuvable, le document reste à l\'écran (pas de grille vide, pas de bandeau) ; sans lien vivant (tableau ordinaire, curseur hors d\'un tableau), « Ouvrir » ne fait rien',
    run: async (h) => withApp(h, async () => {
      const bad = [];
      const m = await model('Perdu', gridHtml('L', 2, 2));
      const d = await openedDoc(m, 'L', 2, 2);
      await cursorIn(0, 0, 0);
      await sleep(100);
      press(barButton()); await sleep(150);
      if (!menuOpen() || !openRow()) return { pass: false, notes: 'la ligne « Ouvrir le modèle » est introuvable' };
      // Le modèle disparaît de Grist ; le cache ne le sait pas encore (l'appui relit la liste avant d'ouvrir).
      await stub().applyUserActions([['RemoveRecord', Templates.TABLE_NAME, m.id]]);
      press(openRow());
      await sleep(900);
      const line = statusLine();
      const after = screenOf();
      if (!line.error || line.text !== 'Le modèle « ' + m.nom + ' » est introuvable.') bad.push('ligne d\'état : ' + JSON.stringify(line));
      if (after.current !== String(d.id) || after.grid || after.bar) bad.push('le document doit rester à l\'écran : ' + JSON.stringify(after));
      if (menuOpen()) bad.push('le menu reste ouvert alors que le modèle n\'a pas pu s\'ouvrir');
      // Le numéro est repris par un modèle qui n'est pas une grille (Grist peut réutiliser le dernier numéro supprimé) : même réponse, le document reste, rien d'un autre type ne s'ouvre.
      say('');
      const m2 = await model('Repris', gridHtml('R', 2, 2));
      const d2 = await openedDoc(m2, 'R', 2, 2);
      await cursorIn(0, 0, 0);
      await sleep(100);
      press(barButton()); await sleep(150);
      if (!menuOpen() || !openRow()) { bad.push('la ligne « Ouvrir le modèle » est introuvable (numéro repris)'); return { pass: false, notes: bad.join(' | ') }; }
      await stub().applyUserActions([['UpdateRecord', Templates.TABLE_NAME, m2.id, { TypeModele: 'document' }]]);
      press(openRow());
      await sleep(900);
      const line2 = statusLine();
      const after2 = screenOf();
      if (!line2.error || line2.text !== 'Le modèle « ' + m2.nom + ' » est introuvable.') bad.push('numéro repris par un document, ligne d\'état : ' + JSON.stringify(line2));
      if (after2.current !== String(d2.id) || after2.grid || after2.bar) bad.push('numéro repris par un document, le document doit rester à l\'écran : ' + JSON.stringify(after2));
      // Sans lien vivant : rien ne se passe, ni changement d'écran ni message.
      say('');
      const was = screenOf();
      const opened = LinkedTable.open(ed());
      await sleep(300);
      if (opened || JSON.stringify(screenOf()) !== JSON.stringify(was) || statusLine().text !== '') bad.push('« Ouvrir » sans lien vivant a agi : ' + JSON.stringify([opened, statusLine().text]));
      Editor.setHTML('<p>avant</p>' + gridHtml('P', 2, 2) + '<p>après</p>');
      await sleep(200);
      await cursorIn(0, 0, 0);
      if (LinkedTable.open(ed())) bad.push('un tableau ordinaire ne s\'ouvre pas comme un modèle');
      await cursorAt('avant');
      if (LinkedTable.open(ed())) bad.push('le curseur hors d\'un tableau n\'ouvre rien');
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_open_is_free_under_track_changes_and_refused_while_another_action_runs',
    description: '« Ouvrir le modèle » n\'écrit rien dans le document : le suivi des modifications allumé ne l\'empêche pas (le modèle s\'ouvre, avec son bandeau) ; pendant qu\'une autre action du lien tourne (relecture des modèles), « Ouvrir » ne fait rien et l\'action en cours va à son terme',
    run: async (h) => withApp(h, async () => {
      const bad = [];
      const m = await model('Libre', gridHtml('F', 2, 2));
      const d = await openedDoc(m, 'F', 2, 2);
      // Une action en cours : « Ouvrir » ne part pas, la mise à jour se termine.
      const realLoad = Templates.loadAll;
      const held = []; // toutes les relectures retenues (le passage de l'enregistrement automatique en fait aussi) : elles partent ensemble
      Templates.loadAll = () => new Promise(resolve => { held.push(() => resolve(realLoad.call(Templates))); });
      try {
        await cursorIn(0, 0, 0);
        const pulling = LinkedTable.pull(ed());
        await sleep(80);
        if (LinkedTable.open(ed())) bad.push('« Ouvrir » part pendant une autre action');
        if (!held.length) bad.push('la relecture des modèles n\'a pas commencé');
        Templates.loadAll = realLoad;
        held.splice(0).forEach(release => release());
        await pulling;
      } finally { Templates.loadAll = realLoad; held.splice(0).forEach(release => release()); }
      await sleep(200);
      if (screenOf().current !== String(d.id) || screenOf().bar) bad.push('l\'écran a changé pendant l\'action : ' + JSON.stringify(screenOf()));
      // Sous le suivi des modifications, le modèle s'ouvre.
      Editor.setTrackChanges(true);
      await sleep(150);
      if (!(await openFromMenu(0, 0))) return { pass: false, notes: 'la ligne « Ouvrir le modèle » est introuvable sous le suivi : ' + bad.join(' | ') };
      const on = screenOf();
      if (on.current !== String(m.id) || !on.grid || !on.bar) bad.push('sous le suivi, le modèle ne s\'ouvre pas : ' + JSON.stringify(on));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_return_with_the_document_deleted_elsewhere_keeps_the_model_and_drops_the_bar',
    description: 'Le document a été supprimé par quelqu\'un d\'autre pendant qu\'on modifie le modèle : « Revenir au document » laisse le modèle à l\'écran (pas de document vierge à sa place) et le bandeau s\'efface',
    run: async (h) => withApp(h, async () => {
      const bad = [];
      const m = await model('Doc perdu', gridHtml('G', 2, 2));
      const d = await openedDoc(m, 'G', 2, 2);
      if (!(await openFromMenu(0, 0))) return { pass: false, notes: 'la ligne « Ouvrir le modèle » est introuvable' };
      await stub().applyUserActions([['RemoveRecord', Templates.TABLE_NAME, d.id]]);
      const before = screenOf();
      document.getElementById('btn-linked-return').click();
      await sleep(900);
      const after = screenOf();
      if (after.current !== String(m.id) || !after.grid || after.name !== before.name) bad.push('le modèle doit rester à l\'écran : ' + JSON.stringify({ before, after }));
      if (after.bar) bad.push('bandeau resté alors que le document n\'existe plus : ' + JSON.stringify(after));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_open_gives_way_to_a_template_chosen_while_the_models_are_read',
    description: 'Pendant la relecture des modèles qui précède l\'ouverture (Grist lent), la personne choisit un autre modèle dans la liste : celui-là gagne, le modèle du lien ne se met pas à l\'écran par-dessus et il n\'y a pas de bandeau',
    run: async (h) => withApp(h, async () => {
      const bad = [];
      const m = await model('Course', gridHtml('K', 2, 2));
      const d = await openedDoc(m, 'K', 2, 2);
      const other = await Templates.save(null, 'Autre ' + (++counter), '<p>autre texte</p>', '', null, null, 'document', null);
      made.push(other.id);
      await Templates.loadAll();
      await cursorIn(0, 0, 0);
      await sleep(100);
      press(barButton()); await sleep(150);
      const realLoad = Templates.loadAll;
      const held = [];
      Templates.loadAll = () => new Promise(resolve => { held.push(() => resolve(realLoad.call(Templates))); });
      try {
        press(openRow());
        await sleep(100);
        if (!held.length) bad.push('la relecture des modèles n\'a pas commencé');
        await openByList(other.id, 'Autre');
        Templates.loadAll = realLoad;
        held.splice(0).forEach(release => release());
        await sleep(900);
      } finally { Templates.loadAll = realLoad; held.splice(0).forEach(release => release()); }
      const after = screenOf();
      if (after.current !== String(other.id) || after.grid || after.bar) bad.push('l\'autre modèle doit rester à l\'écran : ' + JSON.stringify(after));
      if (!ed().state.doc.textContent.includes('autre texte')) bad.push('le texte de l\'autre modèle n\'est plus là');
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_delete_confirmation_counts_the_templates_that_place_the_model_and_leaves_their_tables',
    description: 'Supprimer un modèle Grille posé comme tableau lié dans d\'autres modèles : la fenêtre le dit (« … posé comme tableau lié dans 2 modèles : ces tableaux resteront, détachés », singulier pour un seul, deux langues) ; sans autre modèle qui le pose, ou pour un modèle qui n\'est pas une grille (un numéro réutilisé), la fenêtre ne dit rien de plus ; confirmée, seule la ligne du modèle est supprimée, les documents gardent leurs cases sans lien',
    run: async (h) => withApp(h, async () => {
      const bad = [];
      const m = await model('Supprime', gridHtml('S', 2, 2));
      const asked = answerWith(false);
      // Personne ne le pose : la fenêtre habituelle, sans message.
      await openByList(m.id, m.nom);
      await h.clickButton('btn-delete'); await sleep(200);
      if (asked.length !== 1 || asked[0].message || asked[0].title !== I18n.t('confirm.deleteTemplate')) bad.push('sans autre modèle : ' + JSON.stringify(asked.map(a => [a.title, a.message])));
      // Deux documents le posent : chacun compte une fois.
      const first = await placing(m.id, 'document');
      const second = await placing(m.id, 'document');
      await Templates.loadAll();
      await openByList(m.id, m.nom);
      await h.clickButton('btn-delete'); await sleep(200);
      const two = asked[asked.length - 1];
      if (asked.length !== 2 || two.message !== 'Ce modèle Grille est posé comme tableau lié dans 2 modèles : ces tableaux resteront, détachés.' || two.danger !== true) bad.push('deux modèles : ' + JSON.stringify(asked.slice(1).map(a => [a.title, a.message, a.danger])));
      const lang = I18n.getLang();
      try {
        I18n.setLang('en'); await sleep(80);
        await h.clickButton('btn-delete'); await sleep(200);
        const en = asked[asked.length - 1];
        if (en.message !== 'This Grid template is placed as a linked table in 2 templates: those tables will stay, detached.') bad.push('anglais : ' + en.message);
      } finally { I18n.setLang(lang); await sleep(80); }
      // Le singulier : un seul modèle le pose.
      await Templates.remove(second); made.splice(made.indexOf(second), 1);
      await Templates.loadAll();
      await openByList(m.id, m.nom);
      await h.clickButton('btn-delete'); await sleep(200);
      const one = asked[asked.length - 1];
      if (one.message !== 'Ce modèle Grille est posé comme tableau lié dans 1 modèle : ces tableaux resteront, détachés.') bad.push('singulier : ' + one.message);
      // Un modèle qui n'est pas une grille n'a pas de tableaux liés : un numéro réutilisé ne doit rien annoncer.
      const plain = await Templates.save(null, 'Simple ' + (++counter), '<p>texte</p>', '', null, null, 'document', null);
      made.push(plain.id);
      await Templates.loadAll();
      const reused = await Templates.save(null, 'Marque ' + (++counter), '<p>x</p>' + linkedHtml(plain.id, 'R', 1, 1), '', null, null, 'document', null);
      made.push(reused.id);
      await Templates.loadAll();
      await openByList(plain.id, plain.nom);
      const before = asked.length;
      await h.clickButton('btn-delete'); await sleep(200);
      if (asked.length !== before + 1 || asked[asked.length - 1].message) bad.push('un modèle qui n\'est pas une grille : ' + JSON.stringify(asked[asked.length - 1]));
      // Confirmée : seule la ligne du modèle part ; les documents gardent leurs cases et n'ont plus de lien.
      const docHtml = String(rowOf(first).Contenu);
      asked.length = 0;
      Dialogs.confirm = async (options) => { asked.push(options); return true; };
      await openByList(m.id, m.nom);
      stub().clearActionLog();
      await h.clickButton('btn-delete');
      await sleep(900);
      const writes = stub().getActionLog().filter(a => a[1] === Templates.TABLE_NAME).map(a => a[0] + ':' + (a[0] === 'RemoveRecord' ? a[2] : ''));
      if (stub().getRow(Templates.TABLE_NAME, m.id)) bad.push('le modèle n\'est pas supprimé');
      if (writes.some(w => !/^RemoveRecord:/.test(w))) bad.push('autre chose que la suppression a été écrit : ' + JSON.stringify(writes));
      if (String(rowOf(first).Contenu) !== docHtml) bad.push('le contenu d\'un document a été touché');
      made.splice(made.indexOf(m.id), 1);
      await Templates.loadAll();
      await openByList(first, 'Pose');
      await cursorIn(0, 0, 0);
      await sleep(150);
      if (!tablesOf().length || LinkedTable.status(ed().state) || markClass() !== '-') bad.push('le tableau du document garde un lien vivant : ' + JSON.stringify([tablesOf().length, markClass()]));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  // === 10) L'identité du lien (lot 6c-1) ===============================================================================================================================
  //
  // Le numéro d'un modèle ne dit pas de quel modèle il s'agit : Grist peut le redonner à un autre une fois la ligne supprimée, et un tableau copié d'un autre document en porte un qui
  // désigne ici un modèle sans rapport. Le tableau porte donc aussi le jeton du modèle (`data-linked-key`, colonne `Jeton` de la table des modèles) et le lien ne compte que si les deux
  // sont égaux. Dans ces cas, « le numéro repris par un autre modèle » s'écrit en donnant à la ligne du modèle un autre jeton (le stub ne reprend jamais un numéro).

  // Un modèle Grille que personne n'a encore lié (sans jeton) ; le document de ces cas le pose avec `legacyHtml`, comme avant le lot 6c-1.
  const bareModel = (name, html) => model(name, html, 'grille', true);
  const columnsWritten = write => Object.keys(write[3] || {}).sort().join();
  const NEW_TOKEN = 'abcdefgh12345678';
  const TOKEN_FORM = /^[a-z0-9]{24}$/;
  // La fin du texte `text` : le curseur y pose un bloc sans couper le paragraphe.
  async function cursorEnd(text) {
    let found = null;
    doc().descendants((node, pos) => { if (found == null && node.isText && node.text.indexOf(text) !== -1) found = pos + node.nodeSize; });
    ed().commands.setTextSelection(found);
    await sleep(120);
  }
  // Le nœud du tableau `t` du document, ses deux attributs de lien.
  const linkAttrs = t => { const attrs = tablesOf()[t].node.attrs; return { id: attrs.linkedTemplate, key: attrs.linkedKey }; };

  cases.push({
    id: 'linked_token_is_made_once_in_its_own_column_and_a_saved_model_keeps_it',
    description: 'Templates.ensureToken : le premier appel crée la colonne « Jeton » au besoin et écrit un jeton de 24 lettres et chiffres dans cette seule colonne (ni Contenu ni DateModif) ; les suivants rendent le même sans rien écrire ; la liste des modèles le connaît tout de suite et après une relecture ; enregistrer le modèle ne le change pas ; deux modèles ont deux jetons, une copie « Enregistrer sous » n\'en a pas ; un modèle qui n\'existe plus rend vide, sans rien écrire',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const a = await bareModel('Jeton a', gridHtml('A', 2, 2));
      const b = await bareModel('Jeton b', gridHtml('B', 2, 2));
      if (a.jeton !== '' || rowOf(a.id).Jeton) bad.push('un modèle neuf a déjà un jeton : ' + JSON.stringify([a.jeton, rowOf(a.id).Jeton]));
      stub().clearActionLog();
      const first = await Templates.ensureToken(a.id);
      if (!TOKEN_FORM.test(first)) bad.push('forme du jeton : ' + first);
      const writes = modelWrites();
      if (writes.length !== 1 || writes[0][0] !== 'UpdateRecord' || writes[0][2] !== a.id || columnsWritten(writes[0]) !== 'Jeton') bad.push('les écritures : ' + JSON.stringify(writes.map(w => [w[0], w[2], columnsWritten(w)])));
      if (rowOf(a.id).Jeton !== first || Templates.byId(a.id).jeton !== first) bad.push('le jeton n\'est pas dans la ligne ou dans la liste des modèles');
      if (stub().getActionLog().filter(w => w[0] === 'AddVisibleColumn' && w[2] === 'Jeton').length > 1) bad.push('la colonne est créée plusieurs fois');
      stub().clearActionLog();
      const again = await Templates.ensureToken(a.id);
      if (again !== first || stub().getActionLog().length) bad.push('un second appel écrit ou change le jeton : ' + again + ' ' + JSON.stringify(stub().getActionLog()));
      await Templates.loadAll();
      if (Templates.byId(a.id).jeton !== first) bad.push('la relecture perd le jeton');
      // Enregistrer le modèle (toutes ses colonnes) ne touche pas au jeton.
      stub().clearActionLog();
      await Templates.save(a.id, a.nom, gridHtml('Z', 2, 2), '', null, null, 'grille', null);
      await Templates.loadAll();
      const saved = modelWrites();
      if (!saved.length || saved.some(w => 'Jeton' in (w[3] || {})) || Templates.byId(a.id).jeton !== first || rowOf(a.id).Jeton !== first) bad.push('Enregistrer touche au jeton : ' + JSON.stringify(saved.map(columnsWritten)));
      const second = await Templates.ensureToken(b.id);
      if (!TOKEN_FORM.test(second) || second === first) bad.push('deux modèles, un même jeton : ' + first + ' / ' + second);
      const copy = await Templates.save(null, 'Copie ' + (++counter), gridHtml('A', 2, 2), '', null, null, 'grille', null);
      made.push(copy.id);
      await Templates.loadAll();
      if (Templates.byId(copy.id).jeton !== '') bad.push('une copie reprend le jeton : ' + Templates.byId(copy.id).jeton);
      stub().clearActionLog();
      const gone = await Templates.ensureToken(987654);
      if (gone !== '' || modelWrites().length) bad.push('modèle qui n\'existe pas : ' + JSON.stringify([gone, modelWrites().length]));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_key_attribute_survives_the_html_round_trip_and_never_stands_alone',
    description: 'Le tableau lié porte `data-linked-key` à côté de `data-linked-template` : relu depuis le HTML enregistré, réécrit tel quel (relu une seconde fois, le même HTML) ; un jeton qui n\'en est pas un (trop court ou trop long, espace, tiret, balise, vide) est perdu au chargement et le lien reste (un lien ancien) ; un jeton sans numéro de modèle valable ne reste pas seul ; un tableau sans lien n\'en écrit pas',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await model('Jeton html', gridHtml('A', 2, 2));
      const key = m.jeton;
      if (!TOKEN_FORM.test(key)) bad.push('le modèle du cas n\'a pas de jeton : ' + key);
      Editor.setHTML('<p>x</p>' + linkedHtml(m.id, 'A', 2, 2) + '<p>y</p>' + gridHtml('B', 1, 1));
      await sleep(150);
      const html = Editor.getHTML();
      const tag = (html.match(/<table[^>]*>/) || [''])[0];
      if (!new RegExp(`${ATTR}="${m.id}"`).test(tag) || !new RegExp(`${KEY_ATTR}="${key}"`).test(tag)) bad.push('aller-retour : ' + tag);
      if (linkAttrs(0).key !== key || linkAttrs(1).key || (html.match(/data-linked-key/g) || []).length !== 1) bad.push('le jeton ne suit pas le seul tableau lié : ' + JSON.stringify([linkAttrs(0), linkAttrs(1)]));
      Editor.setHTML(html);
      await sleep(120);
      if (Editor.getHTML() !== html) bad.push('une seconde lecture change le HTML');
      for (const value of ['', 'abc', 'x'.repeat(65), 'a b c d e f g h', 'abcdefgh-ijkl', '<b>abcdefgh</b>']) {
        Editor.setHTML('<p>x</p>' + gridHtml('A', 1, 1).replace('<table>', `<table ${ATTR}="${m.id}" ${KEY_ATTR}="${value.replace(/"/g, '')}">`));
        await sleep(80);
        const attrs = tablesOf()[0] && tablesOf()[0].node.attrs;
        if (!attrs || attrs.linkedTemplate !== m.id || attrs.linkedKey !== null || /data-linked-key/.test(Editor.getHTML())) bad.push('« ' + value + ' » : ' + JSON.stringify(attrs) + ' ' + Editor.getHTML().slice(0, 120));
      }
      for (const lone of ['', ` ${ATTR}="0"`, ` ${ATTR}="abc"`]) {
        Editor.setHTML('<p>x</p>' + gridHtml('A', 1, 1).replace('<table>', `<table${lone} ${KEY_ATTR}="${key}">`));
        await sleep(80);
        if (linkedList().length || /data-linked-/.test(Editor.getHTML()) || tablesOf()[0].node.attrs.linkedKey) bad.push('jeton seul (« ' + lone.trim() + ' ») : ' + Editor.getHTML().slice(0, 120));
      }
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_picker_makes_the_token_before_placing_and_without_one_places_an_old_style_link',
    description: 'Choisir un modèle dans la liste : le jeton du modèle est créé avant la pose (une écriture de la seule colonne Jeton, aucune pour un modèle qui en a déjà un) et le tableau posé le porte, dans l\'éditeur et dans le HTML ; si Grist ne l\'écrit pas, le tableau se pose quand même, sans jeton (un lien ancien, à la main) ; la pose directe (insert) prend le jeton que la liste des modèles connaît',
    run: async (h) => withDoc(h, '<p>un</p><p>deux</p><p>trois</p><p>quatre</p><p>cinq</p>', async () => {
      const bad = [];
      const a = await bareModel('Liste jeton a', gridHtml('A', 2, 2));
      const b = await model('Liste jeton b', gridHtml('B', 2, 2));
      const c = await bareModel('Liste jeton c', gridHtml('C', 2, 2));
      const d = await model('Liste jeton d', gridHtml('D', 2, 2));
      const e = await model('Liste jeton e', gridHtml('E', 2, 2));
      await cursorEnd('un');
      await openPicker();
      stub().clearActionLog();
      pick(a.id);
      await sleep(500);
      const key = Templates.byId(a.id).jeton;
      const placedA = linkedList().find(({ node }) => node.attrs.linkedTemplate === a.id);
      if (!TOKEN_FORM.test(key) || !placedA || placedA.node.attrs.linkedKey !== key) bad.push('le tableau ne porte pas le jeton créé : ' + JSON.stringify([key, placedA && placedA.node.attrs.linkedKey]));
      const writes = modelWrites();
      if (writes.length !== 1 || columnsWritten(writes[0]) !== 'Jeton' || writes[0][2] !== a.id) bad.push('écritures à la pose : ' + JSON.stringify(writes.map(columnsWritten)));
      if (!new RegExp(`${KEY_ATTR}="${key}"`).test(Editor.getHTML())) bad.push('le HTML n\'a pas le jeton');
      if (!LinkedTable.status(ed().state)) bad.push('le tableau posé n\'est pas un lien vivant');
      closePicker();
      // Un modèle qui a déjà son jeton : rien à écrire.
      await cursorEnd('deux');
      await openPicker();
      stub().clearActionLog();
      pick(b.id);
      await sleep(500);
      const placedB = linkedList().find(({ node }) => node.attrs.linkedTemplate === b.id);
      if (!placedB || placedB.node.attrs.linkedKey !== b.jeton || modelWrites().length) bad.push('modèle qui a déjà son jeton : ' + JSON.stringify([placedB && placedB.node.attrs.linkedKey, modelWrites().length]));
      closePicker();
      // Grist n'écrit pas le jeton : le tableau se pose quand même, sans jeton.
      const realEnsure = Templates.ensureToken;
      Templates.ensureToken = async () => { throw new Error('écriture refusée'); };
      try {
        await cursorEnd('trois');
        await openPicker();
        stub().clearActionLog();
        pick(c.id);
        await sleep(400);
      } finally { Templates.ensureToken = realEnsure; }
      const placedC = linkedList().find(({ node }) => node.attrs.linkedTemplate === c.id);
      if (!placedC || placedC.node.attrs.linkedKey !== null || !LinkedTable.modelFor(placedC.node) || modelWrites().length) bad.push('jeton impossible : ' + JSON.stringify([placedC && placedC.node.attrs.linkedKey, modelWrites().length]));
      closePicker();
      // La pose directe prend le jeton de la liste des modèles.
      await cursorEnd('quatre');
      if (!LinkedTable.insert(ed(), d)) bad.push('la pose directe a échoué');
      await sleep(120);
      const placedD = linkedList().find(({ node }) => node.attrs.linkedTemplate === d.id);
      if (!placedD || placedD.node.attrs.linkedKey !== d.jeton) bad.push('pose directe : ' + JSON.stringify(placedD && placedD.node.attrs.linkedKey));
      closePicker();
      // La liste des modèles est relue entre la création du jeton et la pose (elle n'a pas encore le jeton) : le tableau porte celui que la création a rendu, et redevient un lien dès que la liste le connaît.
      const realEnsureAgain = Templates.ensureToken;
      const eKey = e.jeton;
      Templates.ensureToken = async (id) => { const token = await realEnsureAgain(id); Templates.byId(id).jeton = ''; return token; };
      try {
        await cursorEnd('cinq');
        await openPicker();
        pick(e.id);
        await sleep(400);
      } finally { Templates.ensureToken = realEnsureAgain; }
      const placedE = linkedList().find(({ node }) => node.attrs.linkedTemplate === e.id);
      if (!placedE || placedE.node.attrs.linkedKey !== eKey) bad.push('liste périmée : ' + JSON.stringify(placedE && placedE.node.attrs.linkedKey));
      await Templates.loadAll();
      if (!placedE || !LinkedTable.modelFor(placedE.node)) bad.push('liste relue : le tableau posé n\'est pas un lien vivant');
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_a_number_taken_over_by_another_model_is_not_a_link',
    description: 'Un tableau dont le numéro désigne un modèle Grille qui n\'a pas son jeton (le numéro repris par un autre modèle) n\'est pas un lien : ni repère, ni groupe dans la barre du tableau, ni règles de la grille (le garde-fou n\'y refuse rien, les boutons ne se grisent pas), ses cases et son HTML restent ; il ne compte pas dans la liste (le modèle n\'est pas « déjà lié ») ; poser le modèle ajoute un tableau lié bien à lui, et seul celui-là compte',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await model('Repris', gridHtml('R', 2, 2));
      const oldKey = m.jeton;
      Editor.setHTML(WITH_TABLE(m.id));
      await sleep(200);
      await cursorIn(0, 1, 1);
      // Vivant d'abord : le cas prouve ce qu'il retire.
      if (!LinkedTable.status(ed().state) || markClass() === '-' || !linkedParts().some(visible)) bad.push('le lien vivant manque au départ : ' + JSON.stringify([!!LinkedTable.status(ed().state), markClass()]));
      // Le numéro désigne maintenant un autre modèle : sa ligne porte un autre jeton.
      stub().remoteWrite(Templates.TABLE_NAME, m.id, { Jeton: NEW_TOKEN });
      await Templates.loadAll();
      ed().commands.setTextSelection(cellText(0, 0, 1));
      await sleep(150);
      if (LinkedTable.status(ed().state) || LinkedTable.cursorIn(ed().state) || LinkedTable.modelFor(tablesOf()[0].node)) bad.push('le numéro repris compte encore : ' + JSON.stringify(LinkedTable.status(ed().state) && LinkedTable.status(ed().state).name));
      if (markClass() !== '-') bad.push('repère : ' + markClass());
      if (linkedParts().some(visible)) bad.push('le groupe de la barre est visible');
      if (isLocked('v2-btn-table') || isLocked('v2-btn-callout')) bad.push('un bouton est grisé');
      const html = Editor.getHTML();
      if (!new RegExp(`${ATTR}="${m.id}"`).test(html) || !new RegExp(`${KEY_ATTR}="${oldKey}"`).test(html)) bad.push('le HTML a perdu un attribut : ' + html.slice(0, 160));
      const was = docJson();
      FORBIDDEN_COMMANDS.toggleBlockquote();
      await sleep(80);
      if (docJson() === was) bad.push('le garde-fou refuse encore une citation dans ses cases');
      // Poser le modèle : il n'est pas « déjà lié » et le nouveau tableau porte son vrai jeton.
      await cursorEnd('après');
      await openPicker();
      const row = pickerRows().find(r => r.name.indexOf('Repris') === 0);
      if (!row || row.disabled) bad.push('le modèle est grisé : ' + JSON.stringify(row));
      pick(m.id);
      await sleep(500);
      const sameNumber = tablesOf().filter(t => t.node.attrs.linkedTemplate === m.id);
      const live = LinkedTable.liveTables(doc());
      if (sameNumber.length !== 2 || live.length !== 1 || live[0].node.attrs.linkedKey !== NEW_TOKEN || sameNumber.filter(t => t.node.attrs.linkedKey === oldKey).length !== 1) bad.push('les deux tableaux : ' + JSON.stringify(sameNumber.map(t => t.node.attrs.linkedKey)));
      if (markClass().split(',').filter(c => /pp-linked-table/.test(c)).length !== 1) bad.push('repères : ' + markClass());
      const here = LinkedTable.status(ed().state);
      if (!here || here.at.node.attrs.linkedKey !== NEW_TOKEN) bad.push('le curseur n\'est pas dans le tableau posé : ' + JSON.stringify(here && here.at.node.attrs.linkedKey));
      closePicker();
      // « Mettre à jour » agit sur le tableau lié bien à ce modèle, pas sur celui qui est resté : le modèle a changé, seul le premier tableau est remplacé.
      stub().remoteWrite(Templates.TABLE_NAME, m.id, { Contenu: gridHtml('N', 2, 2), DateModif: new Date().toISOString() });
      const liveIndex = tablesOf().findIndex(t => t.node.attrs.linkedKey === NEW_TOKEN);
      await cursorIn(liveIndex, 0, 0);
      const pulled = await LinkedTable.pull(ed());
      await sleep(80);
      if (pulled !== true || textsOf(tablesOf()[liveIndex].node) !== labels('N', 2, 2) || textsOf(tablesOf()[1 - liveIndex].node) !== labels('T', 3, 3)) bad.push('mettre à jour : ' + JSON.stringify([pulled, tablesOf().map(t => textsOf(t.node).slice(0, 12))]));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_a_table_pasted_from_another_document_loses_a_link_that_is_not_its_models',
    description: 'Un tableau collé qui porte un numéro et un jeton qui ne sont pas ceux d\'un modèle d\'ici (un tableau venu d\'un autre document Grist) perd le lien ET le jeton, ses cases restent ; avec le bon jeton (un modèle de ce document, pas encore lié ici) il garde son lien ; la seconde copie du même lien perd les deux, l\'original garde les siens',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await model('Venu d\'ailleurs', gridHtml('V', 2, 2));
      const foreign = gridHtml('F', 2, 2).replace('<table>', `<table ${ATTR}="${m.id}" ${KEY_ATTR}="${NEW_TOKEN}">`);
      await cursorEnd('avant');
      pasteHtml(foreign);
      await sleep(250);
      if (tablesOf().length !== 1 || linkedList().length || linkAttrs(0).key !== null || linkAttrs(0).id !== null || !/^FA1/.test(textsOf(tablesOf()[0].node))) bad.push('jeton d\'un autre document : ' + JSON.stringify([tablesOf().length, linkedList().length, tablesOf().length && linkAttrs(0)]));
      // Le bon jeton : un lien de ce document, pas encore posé ici.
      Editor.setHTML(DOC);
      await sleep(120);
      await cursorEnd('avant');
      pasteHtml(linkedHtml(m.id, 'V', 2, 2));
      await sleep(250);
      if (linkedList().length !== 1 || linkAttrs(0).key !== m.jeton) bad.push('le bon jeton perd son lien : ' + JSON.stringify(tablesOf().length && linkAttrs(0)));
      // Une seconde copie du même lien : elle perd le numéro et le jeton, l'original garde les siens.
      await cursorEnd('après');
      pasteHtml(linkedHtml(m.id, 'V', 2, 2));
      await sleep(250);
      if (tablesOf().length !== 2 || linkedList().length !== 1 || linkAttrs(0).key !== m.jeton || linkAttrs(1).key !== null || linkAttrs(1).id !== null) bad.push('seconde copie : ' + JSON.stringify(tablesOf().map((t, i) => linkAttrs(i))));
      // Un tableau resté d'un autre modèle (même numéro, autre jeton) ne change pas lequel garde le lien : l'original, ici après la copie collée.
      const stale = gridHtml('S', 1, 1).replace('<table>', `<table ${ATTR}="${m.id}" ${KEY_ATTR}="${NEW_TOKEN}">`);
      Editor.setHTML('<p>avant</p>' + linkedHtml(m.id, 'V', 2, 2) + stale + '<p>après</p>');
      await sleep(150);
      await cursorEnd('avant');
      pasteHtml(linkedHtml(m.id, 'V', 2, 2));
      await sleep(250);
      const lives = LinkedTable.liveTables(doc());
      if (tablesOf().length !== 3 || lives.length !== 1 || lives[0].pos !== tablesOf()[1].pos || linkAttrs(0).id !== null) bad.push('l\'original perd son lien : ' + JSON.stringify(tablesOf().map((t, i) => linkAttrs(i))));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_hand_actions_stop_when_the_model_changes_identity_while_they_run',
    description: 'Pendant « Mettre à jour » (lecture des modèles) ou « Envoyer » (fenêtre de confirmation), le numéro passe à un autre modèle (son jeton change) : l\'action s\'arrête avec « modèle introuvable » en erreur, sans toucher au document ni écrire dans Grist (envoyer écraserait un modèle sans rapport) ; un jeton qui disparaît pendant la lecture n\'est pas remplacé par un neuf, et « Envoyer » ne pose même pas sa question quand le jeton change pendant la lecture',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await model('Change', gridHtml('M', 2, 2));
      const realToken = m.jeton;
      Editor.setHTML(linkedDoc(m.id, 'D', 2, 2));
      await sleep(200);
      await cursorIn(0, 0, 0);
      const reference = docJson();
      // Mettre à jour : le jeton change pendant la lecture des modèles.
      const realLoadAll = Templates.loadAll;
      Templates.loadAll = function () { stub().remoteWrite(Templates.TABLE_NAME, m.id, { Jeton: NEW_TOKEN }); return realLoadAll.apply(this, arguments); };
      stub().clearActionLog();
      say('');
      let pulled;
      try { pulled = await LinkedTable.pull(ed()); } finally { Templates.loadAll = realLoadAll; }
      const lineA = statusLine();
      if (pulled !== false || docJson() !== reference || modelWrites().length) bad.push('mise à jour : ' + JSON.stringify([pulled, docJson() === reference, modelWrites().length]));
      if (lineA.text !== I18n.t('linkedTable.gone', { name: m.nom }) || !lineA.error) bad.push('mise à jour, ligne d\'état : ' + JSON.stringify(lineA));
      // Envoyer : le jeton change pendant la fenêtre de confirmation.
      stub().remoteWrite(Templates.TABLE_NAME, m.id, { Jeton: realToken });
      await Templates.loadAll();
      ed().commands.setTextSelection(cellText(0, 1, 1));
      await sleep(150);
      const asked = [];
      Dialogs.confirm = async (options) => { asked.push(options); stub().remoteWrite(Templates.TABLE_NAME, m.id, { Jeton: NEW_TOKEN }); await Templates.loadAll(); return true; };
      stub().clearActionLog();
      say('');
      const sent = await LinkedTable.push(ed());
      const lineB = statusLine();
      if (sent !== false || asked.length !== 1 || modelWrites().length || docJson() !== reference) bad.push('envoi : ' + JSON.stringify([sent, asked.length, modelWrites().length, docJson() === reference]));
      if (lineB.text !== I18n.t('linkedTable.gone', { name: m.nom }) || !lineB.error) bad.push('envoi, ligne d\'état : ' + JSON.stringify(lineB));
      if (rowOf(m.id).Contenu.indexOf('MA1') === -1) bad.push('le modèle a été écrasé : ' + rowOf(m.id).Contenu.slice(0, 80));
      // Le jeton qui disparaît pendant la lecture des modèles (« Mettre à jour ») : l'action s'arrête sur le jeton qu'elle a lu, elle n'en écrit pas un neuf à la place.
      stub().remoteWrite(Templates.TABLE_NAME, m.id, { Jeton: realToken });
      await Templates.loadAll();
      await cursorIn(0, 0, 0);
      Templates.loadAll = function () { stub().remoteWrite(Templates.TABLE_NAME, m.id, { Jeton: '' }); return realLoadAll.apply(this, arguments); };
      stub().clearActionLog();
      say('');
      let pulledBare;
      try { pulledBare = await LinkedTable.pull(ed()); } finally { Templates.loadAll = realLoadAll; }
      if (pulledBare !== false || modelWrites().length || docJson() !== reference || Templates.byId(m.id).jeton !== '') bad.push('mise à jour, jeton disparu : ' + JSON.stringify([pulledBare, modelWrites().map(columnsWritten), docJson() === reference, Templates.byId(m.id).jeton]));
      // Le jeton qui change pendant la lecture des modèles (« Envoyer ») : la fenêtre de confirmation ne s'ouvre même pas.
      stub().remoteWrite(Templates.TABLE_NAME, m.id, { Jeton: realToken });
      await Templates.loadAll();
      await cursorIn(0, 1, 1);
      const askedEarly = [];
      Dialogs.confirm = async (options) => { askedEarly.push(options); return true; };
      Templates.loadAll = function () { stub().remoteWrite(Templates.TABLE_NAME, m.id, { Jeton: NEW_TOKEN }); return realLoadAll.apply(this, arguments); };
      stub().clearActionLog();
      say('');
      let sentEarly;
      try { sentEarly = await LinkedTable.push(ed()); } finally { Templates.loadAll = realLoadAll; }
      if (sentEarly !== false || askedEarly.length || modelWrites().length || docJson() !== reference) bad.push('envoi, jeton changé pendant la lecture : ' + JSON.stringify([sentEarly, askedEarly.length, modelWrites().length, docJson() === reference]));
      if (statusLine().text !== I18n.t('linkedTable.gone', { name: m.nom }) || !statusLine().error) bad.push('envoi, jeton changé pendant la lecture, ligne d\'état : ' + JSON.stringify(statusLine()));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_pull_gives_a_link_without_token_its_models_token_with_the_cells_in_one_undo',
    description: 'Un lien d\'avant le lot 6c-1 (le numéro seul) compte, à la main : « Mettre à jour » remplace les cases, crée le jeton du modèle (une écriture de la seule colonne Jeton) et le tableau le porte ; un seul Annuler rend les cases et le tableau sans jeton ; refaire la mise à jour n\'écrit plus rien',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await bareModel('Ancien', gridHtml('M', 3, 3));
      Editor.setHTML('<p>avant</p>' + legacyHtml(m.id, 'T', 3, 3) + '<p>après</p>');
      await sleep(200);
      await cursorIn(0, 1, 2);
      if (!LinkedTable.status(ed().state) || markClass() === '-') bad.push('un lien ancien doit compter, à la main');
      await sleep(GROUP_GAP_MS);
      ed().chain().focus().insertContent('local').run();
      await sleep(GROUP_GAP_MS);
      const edited = docJson();
      stub().clearActionLog();
      say('');
      const done = await LinkedTable.pull(ed());
      await sleep(80);
      const key = Templates.byId(m.id).jeton;
      const writes = modelWrites();
      if (done !== true || !TOKEN_FORM.test(key) || linkAttrs(0).key !== key || linkAttrs(0).id !== m.id) bad.push('le tableau n\'a pas reçu le jeton : ' + JSON.stringify([done, key, linkAttrs(0)]));
      if (writes.length !== 1 || columnsWritten(writes[0]) !== 'Jeton' || writes[0][2] !== m.id) bad.push('écritures : ' + JSON.stringify(writes.map(columnsWritten)));
      if (textsOf(tablesOf()[0].node) !== labels('M', 3, 3)) bad.push('les cases ne sont pas celles du modèle');
      await undo();
      if (docJson() !== edited || linkAttrs(0).key !== null) bad.push('un Annuler ne rend pas le tableau d\'avant : ' + JSON.stringify(linkAttrs(0)));
      // De nouveau : le jeton est connu, rien de plus à écrire.
      await cursorIn(0, 0, 0);
      stub().clearActionLog();
      await sleep(GROUP_GAP_MS);
      const again = await LinkedTable.pull(ed());
      await sleep(80);
      if (again !== true || modelWrites().length || linkAttrs(0).key !== key) bad.push('seconde mise à jour : ' + JSON.stringify([again, modelWrites().length, linkAttrs(0)]));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_identical_pull_and_push_give_a_link_without_token_its_models_token_and_a_failure_changes_nothing',
    description: 'Un lien ancien reçoit aussi son jeton quand la mise à jour trouve le tableau identique (cases et commentaires intacts, une écriture de la seule colonne Jeton) et quand « Envoyer » trouve le tableau identique ; « Envoyer » avec une confirmation refusée n\'écrit rien, pas même le jeton, et laisse le tableau tel quel ; confirmé, il écrit le jeton puis le contenu et le tableau porte le jeton ; si Grist n\'écrit pas le jeton, la mise à jour réussit quand même (sans jeton, sans erreur)',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      // 1) mise à jour d'un tableau identique
      const a = await bareModel('Ancien identique', gridHtml('I', 2, 2));
      Editor.setHTML('<p>avant</p>' + legacyHtml(a.id, 'I', 2, 2) + '<p>après</p>');
      await sleep(200);
      const at = cellText(0, 1, 1);
      ed().chain().focus().setTextSelection({ from: at, to: at + 2 }).setMark('commentMark', { id: 'adopt-test', resolved: false }).run();
      await sleep(100);
      await cursorIn(0, 0, 0);
      const cells = textsOf(tablesOf()[0].node);
      stub().clearActionLog();
      say('');
      const done = await LinkedTable.pull(ed());
      await sleep(80);
      const keyA = Templates.byId(a.id).jeton;
      if (done !== true || !TOKEN_FORM.test(keyA) || linkAttrs(0).key !== keyA) bad.push('identique : le tableau n\'a pas reçu le jeton ' + JSON.stringify([done, keyA, linkAttrs(0)]));
      if (modelWrites().length !== 1 || columnsWritten(modelWrites()[0]) !== 'Jeton') bad.push('identique : écritures ' + JSON.stringify(modelWrites().map(columnsWritten)));
      if (textsOf(tablesOf()[0].node) !== cells || Editor.getHTML().indexOf('comment-mark') === -1) bad.push('identique : les cases ou le commentaire ont changé');
      const line = statusLine();
      if (line.text !== I18n.t('linkedTable.upToDate', { name: a.nom }) || line.error) bad.push('identique, ligne d\'état : ' + JSON.stringify(line));
      // 2) envoi refusé : rien n'est écrit, pas même le jeton
      const b = await bareModel('Ancien envoi', gridHtml('E', 2, 2));
      Editor.setHTML('<p>avant</p>' + legacyHtml(b.id, 'D', 2, 2) + '<p>après</p>');
      await sleep(200);
      await cursorIn(0, 0, 0);
      const reference = docJson();
      const asked = answerWith(false);
      stub().clearActionLog();
      const refused = await LinkedTable.push(ed());
      if (refused !== false || asked.length !== 1 || modelWrites().length || docJson() !== reference || rowOf(b.id).Jeton) bad.push('envoi refusé : ' + JSON.stringify([refused, asked.length, modelWrites().length, docJson() === reference, rowOf(b.id).Jeton]));
      // 3) envoi confirmé : le jeton, puis le contenu
      asked.length = 0;
      Dialogs.confirm = async (options) => { asked.push(options); return true; };
      stub().clearActionLog();
      const sent = await LinkedTable.push(ed());
      await sleep(80);
      const keyB = Templates.byId(b.id).jeton;
      const writes = modelWrites().map(w => [w[2], columnsWritten(w)]);
      if (sent !== true || JSON.stringify(writes) !== JSON.stringify([[b.id, 'Jeton'], [b.id, 'Contenu,DateModif']]) || !TOKEN_FORM.test(keyB) || linkAttrs(0).key !== keyB) bad.push('envoi confirmé : ' + JSON.stringify([sent, writes, keyB, linkAttrs(0)]));
      if (!/DA1/.test(rowOf(b.id).Contenu) || /data-linked-/.test(rowOf(b.id).Contenu)) bad.push('envoi confirmé : contenu du modèle ' + rowOf(b.id).Contenu.slice(0, 100));
      // 4) envoi d'un tableau identique : seul le jeton est écrit, rien n'est demandé
      const c = await bareModel('Ancien envoi identique', gridHtml('S', 2, 2));
      Editor.setHTML('<p>avant</p>' + legacyHtml(c.id, 'S', 2, 2) + '<p>après</p>');
      await sleep(200);
      await cursorIn(0, 0, 0);
      asked.length = 0;
      stub().clearActionLog();
      const same = await LinkedTable.push(ed());
      await sleep(80);
      if (same !== true || asked.length || modelWrites().length !== 1 || columnsWritten(modelWrites()[0]) !== 'Jeton' || linkAttrs(0).key !== Templates.byId(c.id).jeton || !linkAttrs(0).key) bad.push('envoi identique : ' + JSON.stringify([same, asked.length, modelWrites().map(columnsWritten), linkAttrs(0)]));
      // 5) Grist n'écrit pas le jeton : la mise à jour réussit, le tableau reste sans jeton, aucune erreur
      const d = await bareModel('Ancien sans jeton', gridHtml('N', 2, 2));
      Editor.setHTML('<p>avant</p>' + legacyHtml(d.id, 'Z', 2, 2) + '<p>après</p>');
      await sleep(200);
      await cursorIn(0, 0, 0);
      const realEnsure = Templates.ensureToken;
      Templates.ensureToken = async () => { throw new Error('écriture refusée'); };
      stub().clearActionLog();
      say('');
      let failed;
      try { failed = await LinkedTable.pull(ed()); } finally { Templates.ensureToken = realEnsure; }
      await sleep(80);
      const lineD = statusLine();
      if (failed !== true || textsOf(tablesOf()[0].node) !== labels('N', 2, 2) || linkAttrs(0).key !== null || modelWrites().length || lineD.error || lineD.text !== I18n.t('linkedTable.pulled', { name: d.nom })) bad.push('sans jeton : ' + JSON.stringify([failed, linkAttrs(0), modelWrites().length, lineD]));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_detach_takes_the_token_with_the_link_and_one_undo_gives_both_back',
    description: 'Détacher retire le numéro et le jeton du tableau (le HTML n\'a plus ni l\'un ni l\'autre), les cases restent ; un seul Annuler rend les deux',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await model('Détache jeton', gridHtml('D', 2, 2));
      Editor.setHTML(WITH_TABLE(m.id));
      await sleep(200);
      await cursorIn(0, 0, 0);
      if (linkAttrs(0).key !== m.jeton || !m.jeton) bad.push('le tableau n\'a pas son jeton au départ : ' + JSON.stringify(linkAttrs(0)));
      const reference = docJson();
      await sleep(GROUP_GAP_MS);
      if (!LinkedTable.detach(ed())) bad.push('detach() a refusé');
      await sleep(100);
      if (linkAttrs(0).id !== null || linkAttrs(0).key !== null || /data-linked-/.test(Editor.getHTML())) bad.push('après Détacher : ' + JSON.stringify(linkAttrs(0)) + ' ' + Editor.getHTML().slice(0, 120));
      await sleep(GROUP_GAP_MS);
      await undo();
      if (docJson() !== reference || linkAttrs(0).key !== m.jeton) bad.push('un Annuler ne rend pas le numéro et le jeton : ' + JSON.stringify(linkAttrs(0)));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_used_by_counts_only_the_tables_that_are_this_models',
    description: 'Les modèles « qui posent ce tableau » (la confirmation d\'envoi, celle de la suppression) sont ceux dont une balise <table> porte le numéro ET le jeton du modèle, ou le numéro seul (un lien ancien) ; un tableau qui porte le numéro avec un autre jeton, ou le jeton d\'un autre modèle, ou un autre numéro, ne compte pas',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await model('Compté', gridHtml('C', 2, 2));
      const o = await model('Autre compté', gridHtml('O', 2, 2));
      const post = async (html) => {
        const saved = await Templates.save(null, 'Pose ' + (++counter), '<p>x</p>' + html, '', null, null, 'document', null);
        made.push(saved.id);
        return saved.id;
      };
      const mine = await post(linkedHtml(m.id, 'P', 1, 1));
      const old = await post(legacyHtml(m.id, 'P', 1, 1));
      await post(gridHtml('P', 1, 1).replace('<table>', `<table ${ATTR}="${m.id}" ${KEY_ATTR}="${NEW_TOKEN}">`));
      await post(gridHtml('P', 1, 1).replace('<table>', `<table ${ATTR}="${m.id}" ${KEY_ATTR}="${o.jeton}">`));
      await post(linkedHtml(o.id, 'P', 1, 1));
      const alsoMine = await post(linkedHtml(o.id, 'P', 1, 1) + linkedHtml(m.id, 'Q', 1, 1));
      // Enregistrer un modèle neuf le rend courant, et le modèle ouvert ne compte pas : aucun ne l'est ici.
      Templates.setCurrentId(null);
      await Templates.loadAll();
      const counted = LinkedTable.usedBy(m.id).map(t => t.id).sort((x, y) => x - y).join();
      const expected = [mine, old, alsoMine].sort((x, y) => x - y).join();
      if (counted !== expected) bad.push('compte : ' + counted + ' au lieu de ' + expected);
      // La confirmation d'envoi le dit.
      Editor.setHTML(linkedDoc(m.id, 'D', 2, 2));
      await sleep(200);
      await cursorIn(0, 0, 0);
      const asked = answerWith(false);
      await LinkedTable.push(ed());
      if (asked.length !== 1 || !/3 autres modèles/.test(asked[0].message)) bad.push('confirmation : ' + JSON.stringify(asked.map(a => a.message)));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  // === 11) Le document suit le modèle (lot 6c-2a) ======================================================================================================================
  // Un tableau posé par la liste porte sa base (`data-linked-base`) : deux empreintes prises à la dernière synchro. À l'ouverture du document et à chaque lecture de l'enregistrement automatique,
  // chaque tableau à jeton est comparé à sa base et à son modèle (LinkedTable.planOf, syncOpen) : le modèle a changé et pas le tableau, il prend celui du modèle ; le tableau a changé et pas le
  // modèle, il part avec l'enregistrement du document (section 12) ; les deux ont changé, ou la base manque et ils diffèrent, rien ne bouge et la ligne d'état le dit. Les premiers cas appellent la synchro à la main
  // (syncOpen, syncOnLoad) ; les suivants passent par l'application : un document enregistré ouvert par la liste, les vrais minuteurs de l'enregistrement automatique, la Lecture d'un macro-modèle,
  // l'export en lot.
  const BASE_ATTR = 'data-linked-base';
  const BASE_FORM = /^[a-z0-9]{11}\.[a-z0-9]{11}$/;
  const stripBase = text => text.replace(/"linkedBase":"[^"]*"/g, '"linkedBase":null').replace(/ data-linked-base="[^"]*"/g, '');
  const tableAttrs = (t = 0) => tablesOf()[t].node.attrs;
  // Ce que la synchro ferait du tableau de rang `t`, d'après son modèle.
  const planNow = (t = 0) => {
    const node = tablesOf()[t].node;
    const owner = LinkedTable.modelFor(node);
    return owner ? LinkedTable.planOf(ed(), node, owner).action : 'mort';
  };
  // Un tableau posé comme la personne le pose (LinkedTable.insert : numéro, jeton et base écrits), à la fin de « avant ».
  async function placed(m) {
    await cursorAt('avant');
    ed().commands.setTextSelection(ed().state.selection.from + 4);
    LinkedTable.insert(ed(), m);
    await sleep(150);
  }
  // Le modèle change ailleurs (une autre personne l'enregistre) et le cache des modèles le relit, comme un passage de l'enregistrement automatique.
  async function modelBecomes(m, html) {
    stub().remoteWrite(Templates.TABLE_NAME, m.id, { Contenu: html });
    await Templates.loadAll();
  }
  // Les largeurs de colonnes que la page pose d'elle-même (js/editor.js:clampOverflowingTables) : toutes les cases du tableau de rang `t` à `px`, hors de l'historique.
  function setWidths(t, px) {
    const { node, pos } = tablesOf()[t];
    const tr = ed().state.tr;
    node.forEach((row, rowOffset) => row.forEach((cell, cellOffset) => { tr.setNodeMarkup(pos + 2 + rowOffset + cellOffset, undefined, Object.assign({}, cell.attrs, { colwidth: px == null ? null : [px] })); }));
    ed().view.dispatch(tr.setMeta('addToHistory', false));
  }
  const widthsOf = (t = 0) => { const out = []; tablesOf()[t].node.descendants(n => { if (n.type.name === 'tableCell' || n.type.name === 'tableHeader') out.push(n.attrs.colwidth ? n.attrs.colwidth.join('+') : '-'); return true; }); return out.join(','); };
  const withWidths = (html, px) => html.replace(/<td>/g, `<td colwidth="${px}">`);
  const NAMES_OF = done => (done ? done.pulled.join() : 'null');

  cases.push({
    id: 'linked_base_is_stamped_with_the_table_round_trips_and_never_stands_alone',
    description: 'Le tableau posé par la liste porte sa base (`data-linked-base` : deux empreintes de 11 lettres et chiffres séparées par un point) à côté de son numéro et de son jeton ; relue depuis le HTML enregistré, réécrite telle quelle ; une base mal formée, ou sans numéro de modèle ni jeton, ne reste pas (le lien, lui, reste) ; un tableau sans lien n\'en écrit pas ; un nœud qui perd son numéro, son jeton ou dont la base n\'est plus bien formée ne l\'écrit plus non plus',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await model('Base', gridHtml('B', 2, 2));
      await placed(m);
      const base = tableAttrs().linkedBase;
      if (!BASE_FORM.test(String(base))) bad.push('base posée : ' + base);
      const html = Editor.getHTML();
      const written = html.match(/data-linked-base="[^"]*"/g) || [];
      if (written.length !== 1 || written[0] !== `${BASE_ATTR}="${base}"`) bad.push('HTML : ' + JSON.stringify(written));
      Editor.setHTML(html);
      await sleep(150);
      if (tableAttrs().linkedBase !== base || Editor.getHTML() !== html) bad.push('aller-retour : ' + tableAttrs().linkedBase);
      for (const value of ['', 'abc', 'ABCDEFGHIJK.ABCDEFGHIJK', 'abcdefg.abcdefgh', 'abcdefgh.abcdefghijklm', 'abcdefgh.abcdefgh.abcdefgh', 'abcdefgh abcdefgh', 'abcdefgh-abcdefgh', '<b>x</b>.abcdefgh']) {
        Editor.setHTML('<p>x</p>' + linkedHtml(m.id, 'A', 1, 1).replace('<table ', `<table ${BASE_ATTR}="${value}" `));
        await sleep(80);
        const attrs = tableAttrs();
        if (attrs.linkedBase || attrs.linkedTemplate !== m.id || attrs.linkedKey !== tokens.get(m.id) || /data-linked-base/.test(Editor.getHTML())) bad.push('« ' + value + ' » : ' + JSON.stringify(attrs));
      }
      Editor.setHTML('<p>x</p>' + gridHtml('A', 1, 1).replace('<table>', `<table ${BASE_ATTR}="${base}">`));
      await sleep(80);
      if (tableAttrs().linkedBase || /data-linked-base/.test(Editor.getHTML())) bad.push('une base sans lien est gardée');
      Editor.setHTML('<p>x</p>' + legacyHtml(m.id, 'A', 1, 1).replace('<table ', `<table ${BASE_ATTR}="${base}" `));
      await sleep(80);
      if (tableAttrs().linkedBase || tableAttrs().linkedTemplate !== m.id || /data-linked-base/.test(Editor.getHTML())) bad.push('une base sans jeton est gardée : ' + JSON.stringify(tableAttrs()));
      // Le rendu a sa propre garde : un nœud qui a perdu son numéro, son jeton ou dont la base n'est plus bien formée n'écrit pas la base.
      for (const [label, patch] of [['sans numéro', { linkedTemplate: null }], ['sans jeton', { linkedKey: null }], ['mal formée', { linkedBase: 'zz' }]]) {
        Editor.setHTML(html);
        await sleep(80);
        const { node, pos } = tablesOf()[0];
        ed().view.dispatch(ed().state.tr.setNodeMarkup(pos, undefined, Object.assign({}, node.attrs, patch)).setMeta('addToHistory', false));
        if (/data-linked-base/.test(Editor.getHTML())) bad.push('rendu d\'une base ' + label + ' : ' + Editor.getHTML().slice(0, 140));
      }
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_sync_takes_a_changed_model_into_an_untouched_table_cursor_kept_nothing_written_out_of_history',
    description: 'Le modèle a changé ailleurs et pas le tableau du document : la synchro le remplace par celui du modèle (ses cases, son numéro, son jeton, sa base refaite), le curseur reste dans la même case, la ligne d\'état dit « Tableau mis à jour depuis le modèle… », rien n\'est écrit dans Grist, et la mise à jour n\'entre pas dans l\'historique (un seul Annuler retire le tableau posé, il ne rend pas l\'ancien contenu)',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const before = docJson();
      const m = await model('Suit', gridHtml('S', 3, 2));
      await placed(m);
      const baseBefore = tableAttrs().linkedBase;
      await cursorIn(0, 1, 1);
      await sleep(GROUP_GAP_MS);
      await modelBecomes(m, gridHtml('N', 3, 2));
      if (planNow() !== 'pull') bad.push('plan avant : ' + planNow());
      stub().clearActionLog();
      say('');
      const done = LinkedTable.syncOpen(ed());
      await sleep(150);
      if (NAMES_OF(done) !== m.nom || done.differs.length || done.rebased) bad.push('synchro : ' + JSON.stringify(done));
      if (textsOf(tablesOf()[0].node) !== labels('N', 3, 2)) bad.push('cases : ' + textsOf(tablesOf()[0].node));
      if (JSON.stringify(cursorCell()) !== '[1,1]') bad.push('curseur : ' + JSON.stringify(cursorCell()));
      const attrs = tableAttrs();
      if (attrs.linkedTemplate !== m.id || attrs.linkedKey !== tokens.get(m.id) || !BASE_FORM.test(String(attrs.linkedBase)) || attrs.linkedBase === baseBefore) bad.push('attributs : ' + JSON.stringify(attrs));
      if (planNow() !== 'none') bad.push('plan après : ' + planNow());
      const line = statusLine();
      if (line.text !== I18n.t('linkedTable.pulled', { name: m.nom }) || line.error) bad.push('ligne d\'état : ' + JSON.stringify(line));
      if (stub().getActionLog().length) bad.push('une écriture est partie : ' + JSON.stringify(stub().getActionLog()));
      const again = LinkedTable.syncOpen(ed());
      if (!again || again.pulled.length || again.rebased || again.differs.length) bad.push('seconde synchro : ' + JSON.stringify(again));
      await undo();
      if (docJson() !== before) bad.push('un Annuler ne retire pas le tableau posé : ' + linkedIds().join() + ' ' + textsOf(tablesOf()[0] ? tablesOf()[0].node : doc()));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_sync_never_overwrites_a_table_the_document_changed_says_so_once_and_follows_again_when_it_is_back',
    description: 'Le tableau du document a changé et pas le modèle : rien ne bouge, rien n\'est dit (il part avec l\'enregistrement du document : section 12). Les deux ont changé : rien n\'est remplacé et la ligne d\'état dit « diffère du modèle » une fois par désaccord (pas à chaque passage, pas à chaque frappe qui continue dans le tableau, de nouveau à l\'ouverture d\'un document). La frappe annulée, le tableau est redevenu celui de sa base : il suit le modèle',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await model('Garde', gridHtml('P', 2, 2));
      await placed(m);
      await cursorIn(0, 0, 0);
      await sleep(GROUP_GAP_MS);
      ed().chain().focus().insertContent('X').run();
      await sleep(100);
      const typed = textsOf(tablesOf()[0].node);
      if (typed !== 'XPA1|PB1|PA2|PB2') bad.push('frappe : ' + typed);
      say('');
      if (planNow() !== 'push') bad.push('plan (document changé) : ' + planNow());
      const quiet = LinkedTable.syncOpen(ed());
      await sleep(100);
      if (!quiet || quiet.pulled.length || quiet.differs.length || quiet.rebased || textsOf(tablesOf()[0].node) !== typed || statusLine().text !== '') bad.push('document changé seul : ' + JSON.stringify(quiet) + ' ' + JSON.stringify(statusLine()));
      await modelBecomes(m, gridHtml('N', 2, 2));
      if (planNow() !== 'differs') bad.push('plan (les deux ont changé) : ' + planNow());
      say('');
      const first = LinkedTable.syncOpen(ed());
      await sleep(100);
      const said = statusLine();
      if (!first || first.differs.join() !== m.nom || first.pulled.length || textsOf(tablesOf()[0].node) !== typed) bad.push('désaccord : ' + JSON.stringify(first) + ' ' + textsOf(tablesOf()[0].node));
      if (said.text !== I18n.t('linkedTable.differs', { name: m.nom }) || said.error) bad.push('ligne d\'état : ' + JSON.stringify(said));
      say('');
      const second = LinkedTable.syncOpen(ed());
      if (!second || second.differs.length || statusLine().text !== '') bad.push('le désaccord est redit à chaque passage : ' + JSON.stringify(second) + ' ' + statusLine().text);
      const reopened = LinkedTable.syncOnLoad(ed());
      if (!reopened || reopened.differs.join() !== m.nom || statusLine().text !== I18n.t('linkedTable.differs', { name: m.nom })) bad.push('à l\'ouverture : ' + JSON.stringify(reopened) + ' ' + statusLine().text);
      await sleep(GROUP_GAP_MS);
      await undo();
      if (textsOf(tablesOf()[0].node) !== labels('P', 2, 2)) bad.push('Annuler : ' + textsOf(tablesOf()[0].node));
      if (planNow() !== 'pull') bad.push('plan (frappe annulée) : ' + planNow());
      const back = LinkedTable.syncOpen(ed());
      await sleep(100);
      if (NAMES_OF(back) !== m.nom || textsOf(tablesOf()[0].node) !== labels('N', 2, 2)) bad.push('le tableau ne suit pas le modèle : ' + JSON.stringify(back) + ' ' + textsOf(tablesOf()[0].node));
      // Un nouveau désaccord (une frappe, puis le modèle change encore) est dit une fois ; la frappe qui continue dans le tableau ne le redit pas.
      await cursorIn(0, 0, 0);
      await sleep(GROUP_GAP_MS);
      ed().chain().focus().insertContent('Z').run();
      await sleep(100);
      await modelBecomes(m, gridHtml('M', 2, 2));
      say('');
      const again = LinkedTable.syncOpen(ed());
      if (!again || again.differs.join() !== m.nom || statusLine().text !== I18n.t('linkedTable.differs', { name: m.nom })) bad.push('le nouveau désaccord n\'est pas dit : ' + JSON.stringify(again) + ' ' + statusLine().text);
      ed().chain().focus().insertContent('W').run();
      await sleep(100);
      say('');
      const typing = LinkedTable.syncOpen(ed());
      if (!typing || typing.differs.length || statusLine().text !== '') bad.push('le désaccord est redit à chaque frappe : ' + JSON.stringify(typing) + ' ' + statusLine().text);
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_sync_adopts_a_table_without_base_when_it_says_the_same_and_leaves_it_alone_when_it_differs',
    description: 'Un tableau à jeton sans base (posé au lot 6c-1, ou collé) : identique au modèle, seule sa base s\'écrit (ses cases ne bougent pas, rien n\'est dit) puis il suit le modèle ; différent, il n\'est jamais remplacé (« diffère du modèle » sur la ligne d\'état). Un lien d\'avant le jeton, un lien mort et un tableau dont le jeton n\'est pas celui du modèle sont laissés tels quels, sans rien dire',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await model('Adopte', gridHtml('L', 2, 2));
      Editor.setHTML(linkedDoc(m.id, 'L', 2, 2));
      await sleep(200);
      if (planNow() !== 'rebase') bad.push('plan (identique, sans base) : ' + planNow());
      const was = docJson();
      say('');
      const adopted = LinkedTable.syncOpen(ed());
      await sleep(100);
      if (!adopted || adopted.rebased !== 1 || adopted.pulled.length || adopted.differs.length) bad.push('adoption : ' + JSON.stringify(adopted));
      if (stripBase(docJson()) !== stripBase(was) || !BASE_FORM.test(String(tableAttrs().linkedBase)) || statusLine().text !== '') bad.push('adoption : ' + JSON.stringify({ cells: stripBase(docJson()) === stripBase(was), base: tableAttrs().linkedBase, status: statusLine().text }));
      if (planNow() !== 'none') bad.push('plan (adopté) : ' + planNow());
      await modelBecomes(m, gridHtml('M', 2, 2));
      const followed = LinkedTable.syncOpen(ed());
      await sleep(100);
      if (NAMES_OF(followed) !== m.nom || textsOf(tablesOf()[0].node) !== labels('M', 2, 2)) bad.push('suivi après adoption : ' + JSON.stringify(followed));
      // Différent et sans base : jamais remplacé.
      Editor.setHTML(linkedDoc(m.id, 'D', 2, 2));
      await sleep(200);
      const keep = docJson();
      say('');
      const apart = LinkedTable.syncOpen(ed());
      await sleep(100);
      if (planNow() !== 'differs' || !apart || apart.differs.join() !== m.nom || docJson() !== keep || statusLine().text !== I18n.t('linkedTable.differs', { name: m.nom })) bad.push('différent sans base : ' + planNow() + ' ' + JSON.stringify(apart) + ' ' + statusLine().text);
      // Lien d'avant le jeton : à la main seulement.
      Editor.setHTML('<p>avant</p>' + legacyHtml(m.id, 'D', 2, 2));
      await sleep(200);
      const legacyDoc = docJson();
      say('');
      const legacy = LinkedTable.syncOpen(ed());
      if (legacy !== null || docJson() !== legacyDoc || statusLine().text !== '' || planNow() !== 'manual') bad.push('lien d\'avant le jeton : ' + JSON.stringify(legacy) + ' ' + planNow());
      // Lien mort, jeton d'un autre modèle.
      const o = await model('Autre', gridHtml('O', 2, 2));
      Editor.setHTML('<p>avant</p>' + linkedHtml(98765, 'D', 2, 2) + gridHtml('Z', 1, 1).replace('<table>', `<table ${ATTR}="${m.id}" ${KEY_ATTR}="${tokens.get(o.id)}">`));
      await sleep(200);
      const deadDoc = docJson();
      const dead = LinkedTable.syncOpen(ed());
      if (dead !== null || docJson() !== deadDoc || statusLine().text !== '') bad.push('lien mort ou jeton étranger : ' + JSON.stringify(dead));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_sync_ignores_the_column_widths_the_page_sets_and_brings_the_ones_the_model_changes',
    description: 'La page fige et rogne les largeurs de colonnes d\'un tableau (ce n\'est pas la personne) : ces largeurs ne comptent pas comme un changement du document (le tableau suit le modèle et n\'est pas « à envoyer »), et un modèle qui ne change que de largeurs les fait arriver. Un tableau dont le seul écart avec le modèle est une largeur ne diffère de rien (rien n\'est remplacé, rien n\'est dit, et au retour du modèle il n\'est pas dit « diffère »)',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await model('Largeurs', gridHtml('W', 2, 2));
      await placed(m);
      setWidths(0, 120);
      await sleep(100);
      if (widthsOf() !== '120,120,120,120') bad.push('largeurs posées : ' + widthsOf());
      if (planNow() !== 'none') bad.push('plan (largeurs de la page) : ' + planNow());
      // Au retour du modèle, un tableau dont le seul écart est une largeur de la page ne « diffère » pas du modèle.
      const shown = LinkedTable.reveal(ed(), m.id, { row: 0, col: 0 });
      if (!shown || shown.differs !== false) bad.push('retour du modèle, largeurs de la page : ' + JSON.stringify(shown));
      say('');
      const quiet = LinkedTable.syncOpen(ed());
      if (!quiet || quiet.pulled.length || quiet.rebased || quiet.differs.length || widthsOf() !== '120,120,120,120' || statusLine().text !== '') bad.push('largeurs seules : ' + JSON.stringify(quiet) + ' ' + widthsOf());
      // Le contenu du modèle change : le tableau le suit malgré ses largeurs (qui sont celles du modèle ensuite).
      await modelBecomes(m, gridHtml('V', 2, 2));
      if (planNow() !== 'pull') bad.push('plan (modèle changé, largeurs de la page) : ' + planNow());
      const followed = LinkedTable.syncOpen(ed());
      await sleep(100);
      if (NAMES_OF(followed) !== m.nom || textsOf(tablesOf()[0].node) !== labels('V', 2, 2)) bad.push('suivi : ' + JSON.stringify(followed));
      // Le modèle ne change que de largeurs : elles arrivent.
      await modelBecomes(m, withWidths(gridHtml('V', 2, 2), 150));
      say('');
      const widened = LinkedTable.syncOpen(ed());
      await sleep(100);
      if (NAMES_OF(widened) !== m.nom || widthsOf() !== '150,150,150,150' || textsOf(tablesOf()[0].node) !== labels('V', 2, 2)) bad.push('largeurs du modèle : ' + JSON.stringify(widened) + ' ' + widthsOf());
      if (planNow() !== 'none') bad.push('plan (après) : ' + planNow());
      // Les largeurs du document changent encore (la page) : rien ne part, rien ne se remplace.
      setWidths(0, 90);
      await sleep(100);
      say('');
      const again = LinkedTable.syncOpen(ed());
      if (!again || again.pulled.length || again.rebased || widthsOf() !== '90,90,90,90' || planNow() !== 'none') bad.push('largeurs de la page après coup : ' + JSON.stringify(again) + ' ' + widthsOf() + ' ' + planNow());
      // Un tableau sans base dont le seul écart est une largeur : identique, sa base s'écrit.
      Editor.setHTML(linkedDoc(m.id, 'V', 2, 2));
      await sleep(200);
      if (planNow() !== 'rebase') bad.push('plan (écart de largeur, sans base) : ' + planNow());
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_sync_only_rewrites_the_base_when_the_table_already_says_what_the_model_says_or_the_model_has_no_table',
    description: 'Le modèle a changé mais le tableau dit déjà la même chose : seule la base s\'écrit, aucun remplacement, aucun message « mis à jour ». (a) Le document n\'a pas bougé et le modèle ne change que des largeurs que le tableau a déjà ; (b) la personne a tapé exactement ce que le modèle dit ensuite, avec d\'autres largeurs : ses largeurs restent ; (c) un modèle qui n\'a plus de tableau ne fait rien dire (rien à suivre, pas de désaccord)',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await model('Déjà dit', gridHtml('W', 2, 2));
      await placed(m);
      // (a) Les largeurs que la page a posées sont aussi celles que le modèle reçoit.
      setWidths(0, 100);
      await sleep(100);
      await modelBecomes(m, withWidths(gridHtml('W', 2, 2), 100));
      if (planNow() !== 'rebase') bad.push('plan (a) : ' + planNow());
      say('');
      const a = LinkedTable.syncOpen(ed());
      await sleep(100);
      if (!a || a.pulled.length || a.rebased !== 1 || a.differs.length || statusLine().text !== '' || textsOf(tablesOf()[0].node) !== labels('W', 2, 2) || widthsOf() !== '100,100,100,100' || planNow() !== 'none') bad.push('(a) : ' + JSON.stringify(a) + ' « ' + statusLine().text + ' » ' + widthsOf() + ' ' + planNow());
      // (b) La personne tape ce que le modèle va dire, le modèle le dit (avec des largeurs de lui) : le tableau garde ses largeurs.
      await cursorIn(0, 0, 0);
      await sleep(GROUP_GAP_MS);
      ed().chain().focus().insertContent('X').run();
      await sleep(100);
      await modelBecomes(m, withWidths(gridHtml('W', 2, 2).replace('WA1', 'XWA1'), 120));
      if (planNow() !== 'rebase') bad.push('plan (b) : ' + planNow());
      say('');
      const b = LinkedTable.syncOpen(ed());
      await sleep(100);
      if (!b || b.pulled.length || b.rebased !== 1 || b.differs.length || statusLine().text !== '' || textsOf(tablesOf()[0].node).split('|')[0] !== 'XWA1' || widthsOf() !== '100,100,100,100' || planNow() !== 'none') bad.push('(b) : ' + JSON.stringify(b) + ' « ' + statusLine().text + ' » ' + widthsOf() + ' ' + planNow());
      // (c) Le modèle n'a plus de tableau : rien à suivre, rien n'est dit.
      await modelBecomes(m, '<p>plus de tableau</p>');
      if (planNow() !== 'none') bad.push('plan (c) : ' + planNow());
      say('');
      const c = LinkedTable.syncOpen(ed());
      await sleep(100);
      if (!c || c.pulled.length || c.rebased || c.differs.length || statusLine().text !== '' || textsOf(tablesOf()[0].node).split('|')[0] !== 'XWA1') bad.push('(c) : ' + JSON.stringify(c) + ' « ' + statusLine().text + ' »');
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_sync_follows_several_tables_in_one_pass_and_says_how_many',
    description: 'Deux tableaux liés à deux modèles qui ont changé (le premier a grandi) : une seule passe les remplace tous les deux, chacun par le sien, sans que le premier déplace le second ; la ligne d\'état dit leur nombre (« 2 tableaux mis à jour depuis leur modèle. », en anglais « 2 tables updated from their templates. ») ; le curseur reste dans la case du second',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const a = await model('Premier', gridHtml('P', 2, 2));
      const b = await model('Second', gridHtml('S', 2, 2));
      Editor.setHTML('<p>avant</p>' + linkedHtml(a.id, 'P', 2, 2) + '<p>entre</p>' + linkedHtml(b.id, 'S', 2, 2) + '<p>après</p>');
      await sleep(200);
      const first = LinkedTable.syncOpen(ed());
      await sleep(80);
      if (!first || first.rebased !== 2 || planNow(0) !== 'none' || planNow(1) !== 'none') bad.push('bases posées : ' + JSON.stringify(first) + ' ' + planNow(0) + ' ' + planNow(1));
      await modelBecomes(a, gridHtml('P', 3, 3).replace(/P/g, 'Q'));
      await modelBecomes(b, gridHtml('T', 2, 2));
      await cursorIn(1, 0, 1);
      say('');
      const done = LinkedTable.syncOpen(ed());
      await sleep(100);
      const texts = tablesOf().map(t => textsOf(t.node));
      if (!done || done.pulled.join() !== a.nom + ',' + b.nom || texts.length !== 2 || texts[0] !== labels('Q', 3, 3) || texts[1] !== labels('T', 2, 2)) bad.push('deux tableaux : ' + JSON.stringify(done) + ' ' + texts.join(' // '));
      if (JSON.stringify(cursorCell()) !== '[0,1]' || ed().state.selection.$head.node(1).type.name !== 'table') bad.push('curseur : ' + JSON.stringify(cursorCell()));
      if (planNow(0) !== 'none' || planNow(1) !== 'none') bad.push('plans après : ' + planNow(0) + ' ' + planNow(1));
      if (statusLine().text !== '2 tableaux mis à jour depuis leur modèle.' || statusLine().error) bad.push('ligne d\'état : ' + JSON.stringify(statusLine()));
      // La phrase de plusieurs tableaux sait aussi le singulier (la page ne l'appelle qu'à partir de deux).
      if (I18n.t('linkedTable.pulledMany', { n: 1 }) !== '1 tableau mis à jour depuis son modèle.') bad.push('singulier français : ' + I18n.t('linkedTable.pulledMany', { n: 1 }));
      I18n.setLang('en');
      try {
        if (I18n.t('linkedTable.pulledMany', { n: 1 }) !== '1 table updated from its template.') bad.push('singulier anglais : ' + I18n.t('linkedTable.pulledMany', { n: 1 }));
        await modelBecomes(a, gridHtml('P', 2, 2));
        await modelBecomes(b, gridHtml('S', 2, 2));
        say('');
        const again = LinkedTable.syncOpen(ed());
        await sleep(100);
        if (!again || again.pulled.length !== 2 || statusLine().text !== '2 tables updated from their templates.') bad.push('anglais : ' + JSON.stringify(again) + ' ' + statusLine().text);
        // Un seul : la phrase du singulier.
        await modelBecomes(a, gridHtml('R', 2, 2));
        say('');
        LinkedTable.syncOpen(ed());
        await sleep(100);
        if (statusLine().text !== 'Table updated from the template “' + a.nom + '”.') bad.push('un seul tableau : ' + statusLine().text);
      } finally { I18n.setLang('fr'); }
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_sync_waits_while_tracking_a_zone_a_composition_or_a_hand_action_is_on',
    description: 'La synchro laisse le document tranquille (rien ne change, rien n\'est rendu) tant que le suivi des modifications est allumé, qu\'un en-tête ou un pied de page est ouvert, que l\'éditeur montre une grille, qu\'une composition de texte est en cours, que l\'éditeur est détruit ou qu\'« Envoyer » / « Mettre à jour » à la main attend sa fin ; levé, le tableau suit le modèle',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await model('Pause', gridHtml('Q', 2, 2));
      await placed(m);
      await modelBecomes(m, gridHtml('N', 2, 2));
      let reference = docJson();
      const attempt = (label) => {
        const done = LinkedTable.syncOpen(ed());
        if (done !== null || docJson() !== reference) bad.push(label + ' : ' + JSON.stringify(done));
      };
      Editor.setTrackChanges(true);
      attempt('suivi des modifications');
      Editor.setTrackChanges(false);
      const realMode = HeaderFooterPreview.getHfMode;
      HeaderFooterPreview.getHfMode = () => 'header';
      try { attempt('en-tête ouvert'); } finally { HeaderFooterPreview.getHfMode = realMode; }
      const view = ed().view;
      const own = Object.getOwnPropertyDescriptor(view, 'composing');
      Object.defineProperty(view, 'composing', { configurable: true, get: () => true });
      try { attempt('composition en cours'); } finally { if (own) Object.defineProperty(view, 'composing', own); else delete view.composing; }
      const realActive = GridEditor.isActive;
      GridEditor.isActive = () => true;
      try { attempt('éditeur de grille à l\'écran'); } finally { GridEditor.isActive = realActive; }
      // Un éditeur déjà détruit (la page change de modèle pendant la lecture des modèles) : rien n'est dispatché.
      const gone = LinkedTable.syncOpen(Object.create(ed(), { isDestroyed: { value: true } }));
      if (gone !== null || docJson() !== reference) bad.push('éditeur détruit : ' + JSON.stringify(gone));
      const lifted = LinkedTable.syncOpen(ed());
      await sleep(100);
      if (NAMES_OF(lifted) !== m.nom || textsOf(tablesOf()[0].node) !== labels('N', 2, 2)) bad.push('une fois levé : ' + JSON.stringify(lifted) + ' ' + textsOf(tablesOf()[0].node));
      // Une action à la main qui attend la relecture des modèles.
      await modelBecomes(m, gridHtml('R', 2, 2));
      reference = docJson();
      await cursorIn(0, 0, 0);
      const holding = LinkedTable.pull(ed());
      attempt('action à la main en cours');
      await holding;
      const after = LinkedTable.syncOpen(ed());
      if (!after || after.pulled.length || textsOf(tablesOf()[0].node) !== labels('R', 2, 2)) bad.push('après l\'action à la main : ' + JSON.stringify(after) + ' ' + textsOf(tablesOf()[0].node));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_base_goes_with_the_link_on_detach_and_on_a_second_copy_and_one_undo_gives_it_back',
    description: '« Détacher » retire le numéro, le jeton ET la base (le HTML n\'a plus aucun des trois, les cases restent) et un seul Annuler rend les trois ; la copie collée d\'un tableau lié perd les trois, l\'original garde les siens ; un tableau collé d\'un autre document (numéro, jeton étranger et base) les perd aussi',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await model('Retire', gridHtml('D', 2, 2));
      await placed(m);
      const trio = a => JSON.stringify([a.linkedTemplate, a.linkedKey, a.linkedBase]);
      const all = tableAttrs();
      const was = trio(all);
      if (!BASE_FORM.test(String(all.linkedBase))) bad.push('base posée : ' + all.linkedBase);
      await cursorIn(0, 0, 0);
      await sleep(GROUP_GAP_MS);
      LinkedTable.detach(ed());
      await sleep(100);
      if (trio(tableAttrs()) !== '[null,null,null]' || /data-linked-/.test(Editor.getHTML()) || textsOf(tablesOf()[0].node) !== labels('D', 2, 2)) bad.push('Détacher : ' + trio(tableAttrs()));
      await undo();
      if (trio(tableAttrs()) !== was) bad.push('Annuler : ' + trio(tableAttrs()));
      const copy = Editor.getHTML().match(/<table[\s\S]*<\/table>/)[0];
      await cursorAt('après');
      pasteHtml(copy);
      await sleep(200);
      const tables = tablesOf();
      if (tables.length !== 2 || trio(tables[0].node.attrs) !== was || trio(tables[1].node.attrs) !== '[null,null,null]') bad.push('copie : ' + tables.map(t => trio(t.node.attrs)).join(' '));
      Editor.setHTML('<p>avant</p><p>après</p>');
      await sleep(120);
      await cursorAt('avant');
      pasteHtml(gridHtml('F', 1, 1).replace('<table>', `<table ${ATTR}="${m.id}" ${KEY_ATTR}="${NEW_TOKEN}" ${BASE_ATTR}="${all.linkedBase}">`));
      await sleep(200);
      if (tablesOf().length !== 1 || trio(tableAttrs()) !== '[null,null,null]') bad.push('jeton étranger : ' + trio(tableAttrs()));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_hand_actions_stamp_the_base_and_the_automatic_sync_agrees_with_them',
    description: '« Mettre à jour depuis le modèle » (cases remplacées) et « Envoyer au modèle » posent la base du tableau, y compris sur un lien d\'avant le jeton (le jeton avec elle) : juste après, le plan est « rien à faire » dans les deux sens, un tableau identique reçoit sa base sans changer de cases, et envoyer puis changer le modèle ailleurs fait suivre le tableau',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await model('Gestes', gridHtml('G', 2, 2));
      // Un lien d'avant le jeton, identique : « Mettre à jour » lui donne jeton et base.
      Editor.setHTML('<p>avant</p>' + legacyHtml(m.id, 'G', 2, 2));
      await sleep(200);
      await cursorIn(0, 0, 0);
      const pulledSame = await LinkedTable.pull(ed());
      await sleep(100);
      if (pulledSame !== true || tableAttrs().linkedKey !== tokens.get(m.id) || !BASE_FORM.test(String(tableAttrs().linkedBase)) || planNow() !== 'none') bad.push('identique : ' + pulledSame + ' ' + JSON.stringify(tableAttrs()) + ' ' + planNow());
      // Le modèle change : « Mettre à jour » remplace les cases et refait la base.
      await modelBecomes(m, gridHtml('H', 2, 2));
      const baseOld = tableAttrs().linkedBase;
      await cursorIn(0, 0, 0);
      const pulled = await LinkedTable.pull(ed());
      await sleep(100);
      if (pulled !== true || textsOf(tablesOf()[0].node) !== labels('H', 2, 2) || tableAttrs().linkedBase === baseOld || planNow() !== 'none') bad.push('remplacé : ' + pulled + ' ' + JSON.stringify(tableAttrs()) + ' ' + planNow());
      // « Envoyer » : le tableau modifié part, la base le suit, rien n'est « à envoyer » ensuite.
      await cursorIn(0, 0, 0);
      await sleep(GROUP_GAP_MS);
      ed().chain().focus().insertContent('X').run();
      await sleep(100);
      if (planNow() !== 'push') bad.push('plan (modifié ici) : ' + planNow());
      answerWith(true);
      const pushed = await LinkedTable.push(ed());
      await sleep(100);
      if (pushed !== true || planNow() !== 'none' || !/XHA1/.test(Templates.byId(m.id).contenu)) bad.push('envoyé : ' + pushed + ' ' + planNow());
      // Le modèle change ailleurs ensuite : le tableau suit.
      await modelBecomes(m, gridHtml('K', 2, 2));
      say('');
      const followed = LinkedTable.syncOpen(ed());
      await sleep(100);
      if (NAMES_OF(followed) !== m.nom || textsOf(tablesOf()[0].node) !== labels('K', 2, 2)) bad.push('suivi : ' + JSON.stringify(followed));
      // « Envoyer » trouve un tableau identique (un lien d'avant le jeton) : jeton et base sans changer les cases.
      Editor.setHTML('<p>avant</p>' + legacyHtml(m.id, 'K', 2, 2));
      await sleep(200);
      await cursorIn(0, 0, 0);
      const cells = textsOf(tablesOf()[0].node);
      const same = await LinkedTable.push(ed());
      await sleep(100);
      if (same !== true || textsOf(tablesOf()[0].node) !== cells || tableAttrs().linkedKey !== tokens.get(m.id) || !BASE_FORM.test(String(tableAttrs().linkedBase)) || planNow() !== 'none') bad.push('envoi identique : ' + same + ' ' + JSON.stringify(tableAttrs()));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_push_base_is_the_table_that_left_so_text_typed_while_it_writes_stays_to_send',
    description: '« Envoyer au modèle » pose pour base le tableau qui est PARTI, pas celui du moment où l\'écriture se termine : un texte tapé pendant l\'écriture dans le modèle reste « à envoyer » (le plan est « envoyer », pas « rien à faire »), et quand le modèle change ensuite la synchro ne l\'écrase pas, elle dit que le tableau diffère',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await model('Frappe en vol', gridHtml('V', 2, 2));
      await placed(m);
      await cursorIn(0, 0, 0);
      await sleep(GROUP_GAP_MS);
      ed().chain().focus().insertContent('X').run();
      await sleep(100);
      if (planNow() !== 'push') bad.push('plan (modifié ici) : ' + planNow());
      // Pendant l'écriture dans le modèle, la personne tape encore.
      const realSave = Templates.saveContent;
      Templates.saveContent = async (...args) => {
        const out = await realSave.apply(Templates, args);
        ed().chain().focus().insertContent('Y').run();
        return out;
      };
      try {
        answerWith(true);
        const pushed = await LinkedTable.push(ed());
        await sleep(100);
        if (pushed !== true) bad.push('envoi : ' + pushed);
      } finally { Templates.saveContent = realSave; }
      const sent = Templates.byId(m.id).contenu;
      if (!/XVA1/.test(sent) || /XYVA1/.test(sent)) bad.push('le modèle n\'a pas reçu le tableau qui est parti : ' + sent.slice(0, 160));
      if (textsOf(tablesOf()[0].node).split('|')[0] !== 'XYVA1') bad.push('la frappe en vol n\'est pas dans le document : ' + textsOf(tablesOf()[0].node));
      if (planNow() !== 'push') bad.push('plan (frappe en vol) : ' + planNow());
      // Le modèle change ailleurs : le tableau a changé des deux côtés, il n'est pas remplacé.
      await modelBecomes(m, gridHtml('K', 2, 2));
      say('');
      const followed = LinkedTable.syncOpen(ed());
      await sleep(100);
      if (NAMES_OF(followed) !== '' || textsOf(tablesOf()[0].node).split('|')[0] !== 'XYVA1' || !/diffère/.test(statusLine().text)) bad.push('écrasé ou muet : ' + JSON.stringify(followed) + ' ' + textsOf(tablesOf()[0].node) + ' ' + statusLine().text);
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_sync_and_pull_keep_the_comments_of_the_cells_the_model_did_not_change',
    description: 'Le tableau qui prend celui du modèle - à l\'ouverture ou au passage de l\'enregistrement automatique (rien ne la rend ensuite : elle n\'est pas dans l\'historique) comme par « Mettre à jour depuis le modèle » - garde les fils de commentaires des cases dont le texte n\'a pas changé, même quand le modèle change leurs largeurs ; une case dont le texte change perd le sien (le fil n\'a plus de texte où se poser)',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await model('Fils', gridHtml('K', 2, 2));
      await placed(m);
      const mark = (row, col, id) => { const at = cellText(0, row, col); ed().chain().focus().setTextSelection({ from: at, to: at + 2 }).setMark('commentMark', { id, resolved: false }).run(); };
      const ids = () => (Editor.getHTML().match(/data-comment-id="[^"]*"/g) || []).map(s => s.slice(17, -1)).sort().join(',');
      mark(0, 1, 'keep-me');
      mark(1, 0, 'lose-me');
      await sleep(100);
      if (ids() !== 'keep-me,lose-me') bad.push('marques posées : ' + ids());
      if (planNow() !== 'none') bad.push('plan avant (une marque de commentaire n\'est pas une modification du tableau) : ' + planNow());
      // Le modèle change le texte de la case (1, 0) et rien d'autre : la relève automatique.
      await modelBecomes(m, gridHtml('K', 2, 2).replace('<p>KA2</p>', '<p>Autre</p>'));
      const followed = LinkedTable.syncOpen(ed());
      await sleep(100);
      if (NAMES_OF(followed) !== m.nom || textsOf(tablesOf()[0].node) !== 'KA1|KB1|Autre|KB2') bad.push('suivi : ' + JSON.stringify(followed) + ' ' + textsOf(tablesOf()[0].node));
      if (ids() !== 'keep-me') bad.push('fils après la relève : ' + ids());
      if (planNow() !== 'none') bad.push('plan après la relève : ' + planNow());
      // « Mettre à jour » à la main : même règle.
      mark(1, 1, 'again-keep');
      mark(0, 0, 'again-lose');
      await sleep(100);
      await modelBecomes(m, gridHtml('K', 2, 2).replace('<p>KA2</p>', '<p>Autre</p>').replace('<p>KA1</p>', '<p>Premier</p>'));
      await cursorIn(0, 1, 1);
      const pulled = await LinkedTable.pull(ed());
      await sleep(100);
      if (pulled !== true || textsOf(tablesOf()[0].node) !== 'Premier|KB1|Autre|KB2') bad.push('mise à jour à la main : ' + pulled + ' ' + textsOf(tablesOf()[0].node));
      if (ids() !== 'again-keep,keep-me') bad.push('fils après la mise à jour à la main : ' + ids());
      // Le modèle ne change que des largeurs : elles arrivent, les fils restent sur leurs cases.
      await modelBecomes(m, withWidths(gridHtml('K', 2, 2).replace('<p>KA2</p>', '<p>Autre</p>').replace('<p>KA1</p>', '<p>Premier</p>'), 150));
      const widened = LinkedTable.syncOpen(ed());
      await sleep(100);
      if (NAMES_OF(widened) !== m.nom || widthsOf() !== '150,150,150,150') bad.push('largeurs : ' + JSON.stringify(widened) + ' ' + widthsOf());
      if (ids() !== 'again-keep,keep-me') bad.push('fils après les largeurs : ' + ids());
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_resolve_html_gives_the_models_table_to_a_saved_document_that_has_not_moved_and_leaves_the_rest_alone',
    description: 'Les sorties hors de l\'éditeur (macro-modèle, export en lot) lisent le document tel qu\'il est enregistré : LinkedTable.resolveHtml y remplace le tableau à base que le document n\'a pas modifié et que le modèle a changé par celui du modèle (sans lien ni base, le reste du HTML intact) ; tableau modifié dans le document, modifié des deux côtés, sans base ou à base mal formée, lien ancien, modèle supprimé ou jeton étranger : le HTML est rendu tel quel (la même chaîne) ; sans tableau à base, il n\'est même pas relu. resolveTemplates ne copie que les modèles qui changent',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await model('Sortie', gridHtml('S', 2, 2));
      await placed(m);
      const saved = Editor.getHTML();
      if (!new RegExp(BASE_ATTR).test(saved)) return { pass: false, notes: 'le document enregistré n\'a pas de base : ' + saved.slice(0, 160) };
      const same = LinkedTable.resolveHtml(ed(), saved);
      if (same !== saved) bad.push('modèle inchangé : le HTML est relu');
      // Le modèle n'a pas bougé et la page a posé ses largeurs dans le tableau enregistré : le HTML est rendu tel quel (ses largeurs ne sont pas remplacées par celles du modèle).
      setWidths(0, 120);
      await sleep(100);
      const widened = Editor.getHTML();
      if (!/colwidth/.test(widened) || LinkedTable.resolveHtml(ed(), widened) !== widened) bad.push('modèle inchangé, largeurs de la page : le HTML est relu ' + /colwidth/.test(widened));
      // Le modèle ne change que de largeurs, les mêmes que celles que la page a posées dans le tableau enregistré : il est déjà à jour, le HTML est rendu tel quel (avec son lien).
      await modelBecomes(m, withWidths(gridHtml('S', 2, 2), 120));
      if (LinkedTable.resolveHtml(ed(), widened) !== widened) bad.push('modèle aux mêmes largeurs : le HTML est relu');
      Editor.setHTML(saved);
      await sleep(150);
      await modelBecomes(m, gridHtml('N', 2, 2));
      const out = LinkedTable.resolveHtml(ed(), saved);
      const cellsOut = (out.match(/[A-Z]{1}[A-C][1-9]/g) || []).join('|');
      if (!/NA1/.test(out) || /SA1/.test(out) || cellsOut !== 'NA1|NB1|NA2|NB2' || /data-linked-/.test(out) || !/<p>avant<\/p>/.test(out) || !/après/.test(out)) bad.push('tableau du modèle : ' + out.slice(0, 260));
      // Le tableau n'est pas devenu celui de l'éditeur : le texte lu est celui du modèle, sans le lien.
      if (saved.indexOf('SA1') === -1) bad.push('le HTML de départ n\'est pas celui d\'un tableau « S »');
      // Un tableau lié rangé dans la case d'un autre tableau n'est pas un tableau lié du document (le schéma ne le permet pas) : le HTML est rendu tel quel.
      const inner = (saved.match(/<table[\s\S]*<\/table>/) || [''])[0];
      const nested = '<table><tbody><tr><td>' + inner + '</td></tr></tbody></table>';
      if (!inner || LinkedTable.resolveHtml(ed(), nested) !== nested) bad.push('tableau lié dans la case d\'un autre : le HTML a changé');
      if (LinkedTable.resolveHtml(ed(), '<p>sans tableau lié</p>') !== '<p>sans tableau lié</p>' || LinkedTable.resolveHtml(ed(), '') !== '' || LinkedTable.resolveHtml(ed(), null) !== '') bad.push('HTML sans tableau lié');
      // Le tableau du document a été modifié depuis sa base : rendu tel quel.
      await cursorIn(0, 0, 0);
      await sleep(GROUP_GAP_MS);
      ed().chain().focus().insertContent('X').run();
      await sleep(100);
      const edited = Editor.getHTML();
      if (LinkedTable.resolveHtml(ed(), edited) !== edited) bad.push('tableau modifié dans le document');
      // Sans base, lien ancien, modèle supprimé, jeton étranger.
      const unbased = linkedDoc(m.id, 'S', 2, 2);
      const legacy = '<p>x</p>' + legacyHtml(m.id, 'S', 2, 2);
      const foreign = '<p>x</p>' + gridHtml('S', 2, 2).replace('<table>', `<table ${ATTR}="${m.id}" ${KEY_ATTR}="${NEW_TOKEN}" ${BASE_ATTR}="${tableAttrs().linkedBase}">`);
      const gone = '<p>x</p>' + gridHtml('S', 2, 2).replace('<table>', `<table ${ATTR}="98765" ${KEY_ATTR}="${tokens.get(m.id)}" ${BASE_ATTR}="${tableAttrs().linkedBase}">`);
      const malformed = '<p>x</p>' + gridHtml('S', 2, 2).replace('<table>', `<table ${ATTR}="${m.id}" ${KEY_ATTR}="${tokens.get(m.id)}" ${BASE_ATTR}="abc">`);
      for (const [label, html] of [['sans base', unbased], ['base mal formée', malformed], ['lien ancien', legacy], ['jeton étranger', foreign], ['modèle supprimé', gone]]) {
        if (LinkedTable.resolveHtml(ed(), html) !== html) bad.push(label + ' : le HTML a changé');
      }
      // resolveTemplates : seules les lignes qui changent sont copiées ; le cache n'est pas touché.
      const rows = [
        { id: 1, typeModele: 'document', contenu: saved },
        { id: 2, typeModele: 'macro', contenu: '{"slots":[]}' },
        { id: 3, typeModele: 'grille', contenu: gridHtml('Z', 1, 1) },
        { id: 4, typeModele: 'document', contenu: '<p>autre</p>' },
        { id: 5, typeModele: 'document', contenu: edited },
      ];
      const resolved = LinkedTable.resolveTemplates(ed(), rows);
      if (resolved === rows || resolved.length !== 5 || resolved[0] === rows[0] || !/NA1/.test(resolved[0].contenu) || resolved[0].id !== 1 || [1, 2, 3, 4].some(i => resolved[i] !== rows[i])) bad.push('resolveTemplates : ' + JSON.stringify(resolved.map((r, i) => r === rows[i])));
      if (rows[0].contenu !== saved) bad.push('la ligne d\'origine a été modifiée');
      const untouched = rows.filter((r, i) => i !== 0);
      if (LinkedTable.resolveTemplates(ed(), untouched) !== untouched) bad.push('resolveTemplates ne rend pas la même liste quand rien ne change');
      if (LinkedTable.resolveTemplates(ed(), null).length !== 0) bad.push('resolveTemplates(null)');
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  // Un document ENREGISTRÉ dont le tableau lié a sa base : le document de `openedDoc` (jeton, sans base, identique au modèle) reçoit sa base de la synchro de l'ouverture ; elle est enregistrée avec
  // lui, comme l'enregistrement automatique le fait, et le document reste ouvert. Rend { id, nom }.
  async function savedSyncedDoc(m, label, rows, cols) {
    const d = await openedDoc(m, label, rows, cols);
    const html = Editor.getHTML();
    if (!/data-linked-base=/.test(html)) throw new Error('la synchro de l\'ouverture n\'a pas posé la base : ' + html.slice(0, 200));
    await Templates.save(d.id, d.nom, html, '', null, null, 'document', null);
    await Templates.loadAll();
    return d;
  }
  // Ce que la ligne enregistrée du document dit de son tableau : ses cases (étiquettes) et sa base.
  const savedCells = id => (String(rowOf(id).Contenu).match(/>[A-Z]{1}[A-C][1-9][^<]*</g) || []).map(s => s.slice(1, -1)).join('|');
  const savedBase = id => (String(rowOf(id).Contenu).match(/data-linked-base="([^"]*)"/) || [])[1] || null;
  const waitFor = async (condition, ms) => { const started = Date.now(); while (Date.now() - started < ms) { if (condition()) return true; await sleep(150); } return condition(); };

  cases.push({
    id: 'linked_open_follows_the_model_without_writing_and_without_marking_the_document_changed',
    description: 'Un document enregistré dont le modèle a changé depuis, ouvert par la liste : son tableau est celui du modèle (cases, base refaite, ligne d\'état « mis à jour depuis le modèle »), mais ouvrir n\'écrit rien dans Grist (même après deux passages de l\'enregistrement automatique : la ligne du document garde l\'ancien tableau, pas de faux « modifié ailleurs » chez un autre) et ne rend pas le document « modifié » (en partir ne pose aucune question)',
    run: async (h) => withApp(h, async () => {
      const bad = [];
      const m = await model('Ouverture', gridHtml('O', 2, 2));
      const d = await savedSyncedDoc(m, 'O', 2, 2);
      const baseSaved = savedBase(d.id);
      await modelBecomes(m, gridHtml('N', 2, 2));
      stub().clearActionLog();
      say('');
      await openByList(d.id, d.nom);
      if (textsOf(tablesOf()[0].node) !== labels('N', 2, 2)) bad.push('cases à l\'ouverture : ' + textsOf(tablesOf()[0].node));
      if (planNow() !== 'none' || tableAttrs().linkedBase === baseSaved) bad.push('base : ' + planNow() + ' ' + tableAttrs().linkedBase + ' (enregistrée ' + baseSaved + ')');
      const line = statusLine();
      if (line.text !== I18n.t('linkedTable.pulled', { name: m.nom }) || line.error) bad.push('ligne d\'état : ' + JSON.stringify(line));
      await sleep(6500);
      if (modelWrites().length) bad.push('une écriture est partie : ' + JSON.stringify(modelWrites().map(a => [a[0], a[2], Object.keys(a[3] || {})])));
      if (savedCells(d.id) !== 'OA1|OB1|OA2|OB2' || savedBase(d.id) !== baseSaved) bad.push('la ligne enregistrée a changé : ' + savedCells(d.id));
      await h.clickButton('btn-new');
      await sleep(500);
      if (dialogOpen()) { bad.push('le document est « modifié » : la question avant de partir est posée'); await answerDialog('Abandonner'); }
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_open_follows_a_model_the_page_then_gives_column_widths_without_marking_the_document_changed',
    description: 'Le tableau du modèle n\'a de largeur que sur sa première colonne : la page gèle les autres juste après la synchro de l\'ouverture (transaction qu\'elle pose derrière la nôtre, js/editor.js:dispatchColumnWidthFix). Ces largeurs ne sont pas une modification de la personne : le document ouvert n\'est pas « modifié » (le passage de l\'enregistrement automatique n\'écrit rien, en partir ne pose aucune question) et ses largeurs sont bien posées',
    run: async (h) => withApp(h, async () => {
      const bad = [];
      const m = await model('Largeurs en vol', gridHtml('O', 2, 2));
      const d = await savedSyncedDoc(m, 'O', 2, 2);
      await modelBecomes(m, gridHtml('N', 2, 2).replace(/<td><p>(NA)/g, '<td colwidth="150"><p>$1'));
      stub().clearActionLog();
      say('');
      await openByList(d.id, d.nom);
      await sleep(800);
      if (textsOf(tablesOf()[0].node) !== labels('N', 2, 2)) bad.push('cases à l\'ouverture : ' + textsOf(tablesOf()[0].node));
      if (/-/.test(widthsOf()) || !/^150,/.test(widthsOf())) bad.push('la page n\'a pas gelé les largeurs : ' + widthsOf());
      if (planNow() !== 'none') bad.push('plan : ' + planNow());
      // Un passage de l\'enregistrement automatique (2,5 s) écrirait le document s\'il était « modifié ».
      await sleep(3300);
      if (modelWrites().length) bad.push('les largeurs de la page rendent le document « modifié » : une écriture est partie ' + JSON.stringify(modelWrites().map(a => [a[0], a[2], Object.keys(a[3] || {})])));
      await h.clickButton('btn-new');
      await sleep(500);
      if (dialogOpen()) { bad.push('les largeurs de la page rendent le document « modifié » : la question avant de partir est posée'); await answerDialog('Abandonner'); }
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_open_says_a_disagreement_again_each_time_the_document_is_opened',
    description: 'Un tableau changé dans le document ET dans le modèle n\'est pas remplacé, et la ligne d\'état dit « diffère du modèle » à chaque ouverture du document (pas seulement à la première)',
    run: async (h) => withApp(h, async () => {
      const bad = [];
      const m = await model('Deux ouvertures', gridHtml('O', 2, 2));
      const d = await savedSyncedDoc(m, 'O', 2, 2);
      await Templates.save(d.id, d.nom, Editor.getHTML().replace('OA1', 'XOA1'), '', null, null, 'document', null);
      await Templates.loadAll();
      await modelBecomes(m, gridHtml('N', 2, 2));
      for (const round of ['première', 'seconde']) {
        say('');
        await openByList(d.id, d.nom);
        const line = statusLine();
        if (line.text !== I18n.t('linkedTable.differs', { name: m.nom }) || line.error) bad.push(round + ' ouverture : « ' + line.text + ' »');
        if (textsOf(tablesOf()[0].node).split('|')[0] !== 'XOA1') bad.push(round + ' ouverture, cases : ' + textsOf(tablesOf()[0].node));
      }
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_tick_follows_the_model_of_a_document_being_edited_and_saves_the_followed_table',
    description: 'Le document est ouvert et modifié (passages de 2,5 s) pendant que le modèle change ailleurs : le passage suivant relit les modèles et le tableau prend celui du modèle sous les yeux (curseur dans le texte d\'à côté inchangé), puis l\'enregistrement du document l\'écrit avec sa nouvelle base, et la ligne d\'état garde « mis à jour depuis le modèle » après l\'écriture (« Enregistré à… » ne l\'efface pas)',
    run: async (h) => withApp(h, async () => {
      const bad = [];
      const m = await model('Passage', gridHtml('O', 2, 2));
      const d = await savedSyncedDoc(m, 'O', 2, 2);
      await openByList(d.id, d.nom);
      await cursorAt('avant');
      await sleep(GROUP_GAP_MS);
      // Le modèle change AVANT la frappe : un passage qui a déjà lu l'ancien modèle et enregistré le document ne relit qu'au repos (15 s), après le délai du cas ; ici tout passage qui suit la frappe lit le nouveau.
      stub().remoteWrite(Templates.TABLE_NAME, m.id, { Contenu: gridHtml('N', 2, 2) });
      ed().chain().focus().insertContent('x').run();
      await sleep(200);
      const cursorBefore = ed().state.selection.from;
      const followed = await waitFor(() => textsOf(tablesOf()[0].node) === labels('N', 2, 2), 9000);
      if (!followed) bad.push('le tableau ne suit pas le modèle : ' + textsOf(tablesOf()[0].node));
      if (ed().state.selection.from !== cursorBefore) bad.push('le curseur a bougé : ' + cursorBefore + ' -> ' + ed().state.selection.from);
      const saved = await waitFor(() => savedCells(d.id) === 'NA1|NB1|NA2|NB2', 9000);
      if (!saved || String(rowOf(d.id).Contenu).indexOf('axvant') === -1) bad.push('la ligne enregistrée : ' + savedCells(d.id) + ' ' + String(rowOf(d.id).Contenu).slice(0, 120));
      if (saved && savedBase(d.id) !== tableAttrs().linkedBase) bad.push('base enregistrée ' + savedBase(d.id) + ' au lieu de ' + tableAttrs().linkedBase);
      // Le passage qui enregistre ne laisse pas « Enregistré à… » effacer ce que la synchro vient de dire.
      await sleep(400);
      if (statusLine().text !== I18n.t('linkedTable.pulled', { name: m.nom }) || statusLine().error) bad.push('ligne d\'état après l\'écriture : ' + JSON.stringify(statusLine()));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_idle_tick_follows_the_model_of_an_untouched_document_without_writing',
    description: 'Le document est ouvert et n\'est pas modifié (lecture de fond toutes les 15 s) : le modèle change ailleurs, la lecture suivante donne son tableau au document, et rien n\'est écrit (la ligne du document garde ses cases, aucune écriture dans Grist)',
    run: async (h) => withApp(h, async () => {
      const bad = [];
      const m = await model('Repos', gridHtml('O', 2, 2));
      const d = await savedSyncedDoc(m, 'O', 2, 2);
      await openByList(d.id, d.nom);
      stub().clearActionLog();
      stub().remoteWrite(Templates.TABLE_NAME, m.id, { Contenu: gridHtml('N', 2, 2) });
      const followed = await waitFor(() => textsOf(tablesOf()[0].node) === labels('N', 2, 2), 24000);
      if (!followed) bad.push('le tableau ne suit pas le modèle au repos : ' + textsOf(tablesOf()[0].node));
      await sleep(3000);
      if (modelWrites().length) bad.push('une écriture est partie : ' + JSON.stringify(modelWrites().map(a => [a[0], a[2], Object.keys(a[3] || {})])));
      if (savedCells(d.id) !== 'OA1|OB1|OA2|OB2') bad.push('la ligne enregistrée a changé : ' + savedCells(d.id));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_open_in_reading_mode_shows_the_followed_table_and_a_changed_model_redraws_it',
    description: 'En Lecture, ouvrir un document dont le modèle a changé montre le tableau du modèle dans la feuille de lecture (la Lecture est redessinée après la synchro), pas l\'ancien',
    run: async (h) => withApp(h, async () => {
      const bad = [];
      const m = await model('Lecture', gridHtml('O', 2, 2));
      const d = await savedSyncedDoc(m, 'O', 2, 2);
      await feedRows([{ id: 1, Nom: 'Alpha', Genre: 'Lie' }]);
      await modelBecomes(m, gridHtml('N', 2, 2));
      await h.clickButton('btn-mode-read');
      await sleep(600);
      await openByList(d.id, d.nom);
      await sleep(900);
      const reading = (document.getElementById('reader-container').textContent || '').replace(/\s+/g, '');
      if (reading.indexOf('NA1') === -1 || reading.indexOf('OA1') !== -1) bad.push('Lecture : ' + reading.slice(0, 160));
      await h.clickButton('btn-mode-edit');
      await sleep(400);
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_return_from_the_model_brings_the_followed_table_in_the_same_cell',
    description: 'Un tableau posé par la liste (avec sa base), « Ouvrir le modèle », une modification enregistrée dans la grille, « Revenir au document » : le tableau du document est celui du modèle modifié (la synchro à l\'ouverture), le curseur est dans la même case, la ligne d\'état dit « mis à jour depuis le modèle » (pas « diffère ») ; sans base, il reste comme il était et la ligne d\'état dit qu\'il diffère',
    run: async (h) => withApp(h, async () => h.withRealChoose(async () => {
      setAutosave(false);
      const bad = [];
      const m = await model('Retour', gridHtml('E', 2, 2));
      const d = await savedSyncedDoc(m, 'E', 2, 2);
      if (!(await openFromMenu(0, 1))) return { pass: false, notes: 'la ligne « Ouvrir le modèle » est introuvable' };
      ed().chain().focus().insertContent('!').run();
      await sleep(150);
      document.getElementById('btn-linked-return').click();
      await sleep(500);
      if (dialogOpen()) await answerDialog('Enregistrer');
      await sleep(900);
      const home = screenOf();
      if (home.current !== String(d.id) || home.grid || home.bar) bad.push('le document n\'est pas revenu : ' + JSON.stringify(home));
      if (!String(rowOf(m.id).Contenu).includes('!')) bad.push('le modèle n\'a pas reçu la frappe');
      const cells = textsOf(tablesOf()[0].node);
      if (cells.indexOf('!') === -1) bad.push('le tableau du document ne suit pas le modèle : ' + cells);
      if (planNow() !== 'none') bad.push('plan : ' + planNow());
      const line = statusLine();
      if (line.text !== I18n.t('linkedTable.pulled', { name: m.nom }) || line.error) bad.push('ligne d\'état : ' + JSON.stringify(line));
      if (JSON.stringify(cursorCell()) !== '[0,1]') bad.push('curseur : ' + JSON.stringify(cursorCell()));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    })),
  });

  // Les sorties qui lisent les documents tels qu'ils sont enregistrés (js/main.js : la Lecture d'un macro-modèle, le lot, « Modèle selon la ligne ») : une ligne de la table de la page, le lot « Exporter les
  // lignes en DOCX (ZIP) » par sa vraie ligne de menu, le texte de chaque .docx de l'archive.
  const FEED_TABLE = 'LinkedSortiesTable';
  async function feedRows(rows, current) {
    const s = stub();
    s.setVariables(FEED_TABLE, { Nom: 'Text', Genre: 'Text' });
    s.setRows(FEED_TABLE, rows);
    await GristAPI.refreshSchema();
    s.fireRecord(current || rows[0], FEED_TABLE);
    await sleep(100);
  }
  async function docxBatchTexts(h) {
    const downloads = [];
    const blobsByUrl = new Map();
    const origCreate = URL.createObjectURL;
    const origClick = HTMLAnchorElement.prototype.click;
    const dialogs = h.stubDialogs({ confirm: () => true });
    URL.createObjectURL = obj => { const url = origCreate.call(URL, obj); blobsByUrl.set(url, obj); return url; };
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) { downloads.push({ name: this.download, blob: blobsByUrl.get(this.href) }); return; }
      return origClick.call(this);
    };
    try {
      document.getElementById('v2-btn-export-docx-batch').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      const startedAt = Date.now();
      while (!downloads.length && Date.now() - startedAt < 60000) await sleep(100);
      await sleep(50);
    } finally {
      dialogs.restore();
      URL.createObjectURL = origCreate;
      HTMLAnchorElement.prototype.click = origClick;
    }
    if (!downloads.length || !downloads[0].blob) return null;
    await ExportCommon.ensureJsZipLoaded();
    const zip = await JSZip.loadAsync(await downloads[0].blob.arrayBuffer());
    const texts = [];
    for (const name of Object.keys(zip.files).sort()) {
      const docx = await JSZip.loadAsync(await zip.file(name).async('arraybuffer'));
      texts.push((await docx.file('word/document.xml').async('string')).replace(/<[^>]+>/g, '').replace(/\s+/g, ''));
    }
    return texts;
  }

  cases.push({
    id: 'linked_macro_reading_and_batch_export_use_the_models_table_of_a_document_not_opened_since',
    description: 'Un macro-modèle assemble les documents tels qu\'ils sont enregistrés, et l\'enregistré n\'a pas suivi son modèle tant que personne n\'a ouvert le document : la Lecture du macro-modèle et son export en lot (DOCX, ZIP) montrent pourtant le tableau actuel du modèle Grille (celui de la base du tableau enregistré, que le document n\'a pas modifié), pas l\'ancien ; la ligne enregistrée du document n\'est pas réécrite',
    run: async (h) => withApp(h, async () => {
      const bad = [];
      const m = await model('Sorties', gridHtml('O', 2, 2));
      const d = await savedSyncedDoc(m, 'O', 2, 2);
      await feedRows([{ id: 1, Nom: 'Alpha', Genre: 'Lie' }]);
      const nom = 'Macro ' + (++counter);
      const macro = await Templates.save(null, nom, JSON.stringify({ slots: [{ type: 'fixed', modeleId: d.id }] }), '', null, null, 'macro', null);
      made.push(macro.id);
      await Templates.loadAll();
      await modelBecomes(m, gridHtml('N', 2, 2));
      if (savedCells(d.id) !== 'OA1|OB1|OA2|OB2') bad.push('le document enregistré a déjà changé : ' + savedCells(d.id));
      await openByList(macro.id, nom);
      await h.clickButton('btn-mode-read');
      await sleep(1500);
      const reading = (document.getElementById('reader-container').textContent || '').replace(/\s+/g, '');
      if (reading.indexOf('NA1') === -1 || reading.indexOf('OA1') !== -1) bad.push('Lecture du macro-modèle : ' + reading.slice(0, 160));
      await h.clickButton('btn-mode-edit');
      await sleep(400);
      stub().clearActionLog();
      const texts = await docxBatchTexts(h);
      if (!texts || texts.length !== 1 || texts[0].indexOf('NA1') === -1 || texts[0].indexOf('OA1') !== -1) bad.push('lot en DOCX : ' + JSON.stringify(texts && texts.map(t => t.slice(0, 120))));
      if (savedCells(d.id) !== 'OA1|OB1|OA2|OB2' || modelWrites().length) bad.push('une écriture est partie : ' + savedCells(d.id) + ' ' + JSON.stringify(modelWrites().length));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_row_template_batch_export_uses_the_models_table_of_a_document_not_opened_since',
    description: '« Modèle selon la ligne » : le lot en DOCX d\'une ligne que ses règles envoient vers un document lit ce document tel qu\'il est enregistré, et son tableau lié prend pourtant celui du modèle Grille qui a changé depuis (le document n\'a pas été modifié depuis sa base) ; la ligne qui reste au modèle de l\'écran n\'en a pas',
    run: async (h) => withApp(h, async () => {
      const bad = [];
      const m = await model('Sortie ligne', gridHtml('O', 2, 2));
      const d = await savedSyncedDoc(m, 'O', 2, 2);
      await h.clickButton('btn-new');
      await sleep(400);
      const rows = [{ id: 1, Nom: 'Alpha', Genre: 'Autre' }, { id: 2, Nom: 'Bravo', Genre: 'Lie' }];
      await feedRows(rows, rows[0]);
      await modelBecomes(m, gridHtml('N', 2, 2));
      stub().setWidgetOptions({ modeleSelonLigne: { enabled: true, rules: [{ column: 'Genre', operator: '=', value: 'Lie', modeleId: String(d.id) }], otherwise: 'keep' } });
      await sleep(250);
      try {
        const texts = await docxBatchTexts(h);
        if (!texts || texts.length !== 2) bad.push('lot : ' + JSON.stringify(texts && texts.map(t => t.slice(0, 80))));
        else {
          const withTable = texts.filter(t => t.indexOf('NA1') !== -1);
          if (withTable.length !== 1 || texts.some(t => t.indexOf('OA1') !== -1)) bad.push('tableaux du lot : ' + JSON.stringify(texts.map(t => t.slice(0, 120))));
        }
      } finally { stub().setWidgetOptions(null); await sleep(150); }
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  // === 12) Le modèle suit le document (lot 6c-2b) =====================================================================================================================
  // Le document qui s'enregistre - enregistrement automatique ou « Enregistrer » - écrit dans le MÊME lot, avec sa ligne, le contenu des modèles Grille que ses tableaux liés ont changé et pas leur
  // modèle (LinkedTable.prepareSend, Templates.save et son `alsoWrite`) : Grist applique le lot en entier ou pas du tout. La base du tableau, elle, n'avance qu'une fois Grist d'accord. Les cas passent
  // par les vrais gestes (le bouton Enregistrer, les vrais passages de l'enregistrement automatique) et comptent les LOTS que Grist reçoit (recordBundles) : c'est la seule façon de voir que le document
  // et ses modèles partent ensemble.

  // Les lots que Grist reçoit pour la table des modèles (un par appel d'applyUserActions) : [{ type, id, columns }] chacun, dans l'ordre. `refuse(actions)` rend le texte d'une erreur pour refuser le lot
  // en entier, comme Grist (rien n'est écrit), ou null.
  function recordBundles(refuse) {
    const api = grist.docApi;
    const real = api.applyUserActions;
    const bundles = [];
    const stats = { refused: 0 };
    api.applyUserActions = async function (actions) {
      const mine = actions.filter(a => a[1] === Templates.TABLE_NAME && (a[0] === 'UpdateRecord' || a[0] === 'AddRecord'));
      if (mine.length) bundles.push(mine.map(a => ({ type: a[0], id: a[2], columns: Object.keys(a[3] || {}).sort().join() })));
      const error = refuse ? refuse(actions) : null;
      if (error) { stats.refused++; throw new Error(error); }
      return real.apply(api, arguments);
    };
    return { bundles, stats, stop() { api.applyUserActions = real; } };
  }
  // Les lots, en une ligne : « Upd:7+Upd:9 / Upd:7 » (un lot de deux mises à jour, puis un lot d'une) ; « Add » : une ligne créée.
  const shapeOf = bundles => bundles.map(b => b.map(a => (a.type === 'AddRecord' ? 'Add' : 'Upd:' + a.id)).join('+')).join(' / ');
  // Le texte de chaque case du tableau qu'une ligne de la table des modèles garde.
  const cellsOfRow = id => Array.from(new DOMParser().parseFromString(String(rowOf(id).Contenu), 'text/html').body.querySelectorAll('td,th')).map(c => c.textContent).join('|');
  // Une frappe devant le texte de la case (row, col) du tableau de rang `t`, plus de 700 ms après le geste d'avant (l'historique en fait un évènement à part).
  async function typeInTable(text, t = 0, row = 0, col = 0) {
    await cursorIn(t, row, col);
    await sleep(GROUP_GAP_MS);
    ed().chain().focus().insertContent(text).run();
    await sleep(100);
  }
  // Un document ENREGISTRÉ avec la base de son tableau lié (savedSyncedDoc), rouvert par la liste : l'état de l'enregistrement automatique est celui de la ligne d'à présent.
  async function reopenedDoc(m, label, rows, cols) {
    const d = await savedSyncedDoc(m, label, rows, cols);
    await openByList(d.id, d.nom);
    ed().commands.focus();
    return d;
  }
  // Un clic sur le vrai bouton « Enregistrer », le temps d'en voir les écritures : les lots reçus par Grist.
  async function saveByHand(h, refuse) {
    const rec = recordBundles(refuse);
    try { await h.clickButton('btn-save'); await sleep(900); } finally { rec.stop(); }
    return rec;
  }
  const OLD_CELLS = labels('O', 2, 2);
  const TYPED_CELLS = 'X' + OLD_CELLS;

  cases.push({
    id: 'linked_save_by_hand_writes_the_document_and_the_changed_model_in_one_batch',
    description: '« Enregistrer » à la main (enregistrement automatique coupé) : le tableau lié que le document a changé - une frappe dans une case, une marque de commentaire dans une autre - et pas son modèle part dans le MÊME lot que la ligne du document (deux écritures dans un seul appel de Grist, le document d\'abord) ; le modèle ne reçoit que Contenu et DateModif, le tableau nu (ni lien, ni jeton, ni base, ni commentaire) ; son cache et la date de sa dernière écriture sont à jour ; la ligne du document garde ses commentaires et la base d\'après l\'envoi, que l\'éditeur a aussi (plus rien à envoyer) ; la ligne d\'état dit le modèle mis à jour ; un second « Enregistrer » ne réécrit que le document ; le document n\'est pas « à enregistrer » (en partir ne pose aucune question) et, rouvert, il ne dit ni mise à jour ni écart',
    run: async (h) => withApp(h, async () => h.withRealChoose(async () => {
      setAutosave(false);
      const bad = [];
      const m = await model('Envoi à la main', gridHtml('O', 2, 2));
      const d = await reopenedDoc(m, 'O', 2, 2);
      const modelBefore = rowOf(m.id);
      const at = cellText(0, 1, 1);
      ed().chain().focus().setTextSelection({ from: at, to: at + 2 }).setMark('commentMark', { id: 'send-test', resolved: false }).run();
      await typeInTable('X');
      const baseBefore = tableAttrs().linkedBase;
      if (planNow() !== 'push') bad.push('plan avant : ' + planNow());
      say('');
      const first = await saveByHand(h);
      const expected = 'Upd:' + d.id + '+Upd:' + m.id;
      if (shapeOf(first.bundles) !== expected) bad.push('lots : ' + shapeOf(first.bundles) + ' au lieu de ' + expected);
      else if (first.bundles[0][1].columns !== 'Contenu,DateModif') bad.push('colonnes écrites dans le modèle : ' + first.bundles[0][1].columns);
      const sent = rowOf(m.id);
      if (cellsOfRow(m.id) !== TYPED_CELLS) bad.push('cases du modèle : ' + cellsOfRow(m.id));
      if (/data-linked-|comment-mark|data-comment-id/.test(String(sent.Contenu)) || !/^<table[ >]/.test(String(sent.Contenu))) bad.push('le modèle a reçu autre chose que le tableau nu : ' + String(sent.Contenu).slice(0, 160));
      const alsoChanged = Object.keys(sent).filter(k => k !== 'Contenu' && k !== 'DateModif' && JSON.stringify(sent[k]) !== JSON.stringify(modelBefore[k]));
      if (alsoChanged.length) bad.push('colonnes du modèle changées en plus : ' + alsoChanged.join());
      if (Templates.byId(m.id).contenu !== sent.Contenu || !Templates.sameDateModif(Templates.byId(m.id).dateModif, sent.DateModif) || !Templates.sameDateModif(Templates.lastWritten(m.id), sent.DateModif)) bad.push('le cache ou la date de dernière écriture du modèle ne sont pas à jour');
      const base = tableAttrs().linkedBase;
      if (!BASE_FORM.test(String(base)) || base === baseBefore || savedBase(d.id) !== base) bad.push('base : éditeur ' + base + ', enregistrée ' + savedBase(d.id) + ', avant ' + baseBefore);
      if (!/comment-mark/.test(String(rowOf(d.id).Contenu)) || cellsOfRow(d.id) !== TYPED_CELLS) bad.push('la ligne du document : ' + String(rowOf(d.id).Contenu).slice(0, 160));
      if (planNow() !== 'none') bad.push('plan après : ' + planNow());
      const line = statusLine();
      if (line.text !== I18n.t('linkedTable.pushed', { name: m.nom }) || line.error) bad.push('ligne d\'état : ' + JSON.stringify(line));
      // Un second « Enregistrer » : plus rien à envoyer, seul le document s'écrit.
      const second = await saveByHand(h);
      if (shapeOf(second.bundles) !== 'Upd:' + d.id) bad.push('second Enregistrer, lots : ' + shapeOf(second.bundles));
      if (String(rowOf(m.id).Contenu) !== String(sent.Contenu)) bad.push('le second Enregistrer a réécrit le modèle');
      // En partir ne pose aucune question : l'avancée de la base n'est pas une modification (enregistrement automatique coupé, rien ne peut effacer l'indicateur à notre place).
      await h.clickButton('btn-new');
      await sleep(500);
      if (dialogOpen()) { bad.push('le document est « à enregistrer » : la question avant de partir est posée'); await answerDialog('Annuler'); }
      // Rouvert : la base enregistrée est la bonne, rien n'est mis à jour ni signalé.
      say('');
      await openByList(d.id, d.nom);
      const reopened = statusLine();
      if (textsOf(tablesOf()[0].node) !== TYPED_CELLS || tableAttrs().linkedBase !== base || planNow() !== 'none') bad.push('document rouvert : ' + textsOf(tablesOf()[0].node) + ' ' + tableAttrs().linkedBase + ' ' + planNow());
      if (reopened.text === I18n.t('linkedTable.pulled', { name: m.nom }) || reopened.text === I18n.t('linkedTable.differs', { name: m.nom })) bad.push('le document rouvert dit une mise à jour ou un écart : ' + reopened.text);
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    })),
  });

  cases.push({
    id: 'linked_undoing_a_sent_change_sends_the_old_table_with_the_next_save',
    description: 'Annuler la frappe d\'un tableau déjà envoyé au modèle : le tableau redevient celui d\'avant, donc différent de sa base - le prochain « Enregistrer » renvoie l\'ancien tableau au modèle (le modèle suit le document, y compris dans l\'autre sens)',
    run: async (h) => withApp(h, async () => {
      setAutosave(false);
      const bad = [];
      const m = await model('Envoi annulé', gridHtml('O', 2, 2));
      const d = await reopenedDoc(m, 'O', 2, 2);
      await typeInTable('X');
      await saveByHand(h);
      if (cellsOfRow(m.id) !== TYPED_CELLS || planNow() !== 'none') bad.push('premier envoi : ' + cellsOfRow(m.id) + ' ' + planNow());
      await undo();
      if (textsOf(tablesOf()[0].node) !== OLD_CELLS || planNow() !== 'push') bad.push('après Annuler : ' + textsOf(tablesOf()[0].node) + ' ' + planNow());
      const again = await saveByHand(h);
      if (shapeOf(again.bundles) !== 'Upd:' + d.id + '+Upd:' + m.id) bad.push('second envoi, lots : ' + shapeOf(again.bundles));
      if (cellsOfRow(m.id) !== OLD_CELLS || planNow() !== 'none') bad.push('second envoi : ' + cellsOfRow(m.id) + ' ' + planNow());
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_autosave_pass_sends_the_changed_table_once_and_a_second_document_follows_it',
    description: 'Le vrai passage de l\'enregistrement automatique (2,5 s après la frappe) : le tableau lié changé part avec le document dans un seul lot (le document d\'abord), avec ses largeurs de colonnes (que la page pose, qui ne comptent pas comme une modification du document mais sont dans le modèle) ; la base de l\'éditeur est celle de la ligne enregistrée, plus rien ne part ensuite (aucun lot dans les 3 s qui suivent : le document n\'est pas rendu « à enregistrer » par l\'avancée de la base) ; la ligne d\'état dit le modèle mis à jour ; un AUTRE document qui pose le même modèle prend ce tableau à son ouverture',
    run: async (h) => withApp(h, async () => {
      const bad = [];
      const m = await model('Envoi passage', gridHtml('O', 2, 2));
      const other = await savedSyncedDoc(m, 'O', 2, 2);
      const d = await reopenedDoc(m, 'O', 2, 2);
      const rec = recordBundles();
      try {
        // Les largeurs et la frappe dans le même tour : aucun passage ne peut tomber entre les deux.
        await cursorIn(0, 0, 0);
        await sleep(GROUP_GAP_MS);
        setWidths(0, 120);
        ed().chain().focus().insertContent('X').run();
        const arrived = await waitFor(() => cellsOfRow(m.id) === TYPED_CELLS, 9000);
        if (!arrived) bad.push('le modèle n\'a pas reçu le tableau au passage : ' + cellsOfRow(m.id));
        await sleep(400);
        const expected = 'Upd:' + d.id + '+Upd:' + m.id;
        if (shapeOf(rec.bundles) !== expected) bad.push('lots : ' + shapeOf(rec.bundles) + ' au lieu de ' + expected);
        if (!/colwidth="120"/.test(String(rowOf(m.id).Contenu))) bad.push('le modèle n\'a pas les largeurs du tableau : ' + String(rowOf(m.id).Contenu).slice(0, 120));
        if (savedBase(d.id) !== tableAttrs().linkedBase || !BASE_FORM.test(String(tableAttrs().linkedBase)) || planNow() !== 'none') bad.push('base : enregistrée ' + savedBase(d.id) + ', éditeur ' + tableAttrs().linkedBase + ', plan ' + planNow());
        const line = statusLine();
        if (line.text !== I18n.t('linkedTable.pushed', { name: m.nom }) || line.error) bad.push('ligne d\'état : ' + JSON.stringify(line));
        const count = rec.bundles.length;
        await sleep(3300);
        if (rec.bundles.length !== count) bad.push('un lot de plus est parti sans rien de neuf : ' + shapeOf(rec.bundles));
      } finally { rec.stop(); }
      // L'autre document prend le tableau du modèle à son ouverture.
      say('');
      await openByList(other.id, other.nom);
      if (textsOf(tablesOf()[0].node) !== TYPED_CELLS || planNow() !== 'none') bad.push('l\'autre document : ' + textsOf(tablesOf()[0].node) + ' ' + planNow());
      if (statusLine().text !== I18n.t('linkedTable.pulled', { name: m.nom })) bad.push('ligne d\'état de l\'autre document : ' + statusLine().text);
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_refused_batch_writes_nothing_and_keeps_the_typed_table_to_send_until_grist_accepts',
    description: 'Grist refuse le lot (le document et son modèle ensemble) : ni la ligne du document ni le modèle ne changent, la base de l\'éditeur n\'avance pas (le tableau reste « à envoyer »), la ligne d\'état dit l\'échec de l\'enregistrement ; le passage suivant relit le modèle SANS remplacer la frappe par l\'ancien tableau du modèle ; une fois Grist revenu, le passage suivant écrit les deux et la base avance',
    run: async (h) => withApp(h, async () => {
      const bad = [];
      const m = await model('Envoi refusé', gridHtml('O', 2, 2));
      const d = await reopenedDoc(m, 'O', 2, 2);
      const docBefore = String(rowOf(d.id).Contenu);
      const modelBefore = String(rowOf(m.id).Contenu);
      const baseBefore = tableAttrs().linkedBase;
      const rec = recordBundles(actions => (actions.some(a => a[0] === 'UpdateRecord' && a[1] === Templates.TABLE_NAME) ? 'refusé par les règles d\'accès' : null));
      try {
        await typeInTable('X');
        if (!(await waitFor(() => rec.stats.refused >= 1, 9000))) bad.push('aucun lot n\'a été tenté');
        await sleep(400);
        if (String(rowOf(d.id).Contenu) !== docBefore || String(rowOf(m.id).Contenu) !== modelBefore) bad.push('une ligne a changé malgré le refus');
        if (tableAttrs().linkedBase !== baseBefore || planNow() !== 'push') bad.push('la base a avancé malgré le refus : ' + tableAttrs().linkedBase + ' ' + planNow());
        const line = statusLine();
        if (!line.error || line.text !== I18n.t('status.autosaveError')) bad.push('ligne d\'état : ' + JSON.stringify(line));
        // Le passage suivant relit le modèle (l\'ancien tableau) : la frappe ne doit pas être remplacée par lui.
        if (!(await waitFor(() => rec.stats.refused >= 2, 9000))) bad.push('le passage suivant n\'a pas retenté');
        await sleep(400);
        if (textsOf(tablesOf()[0].node) !== TYPED_CELLS || planNow() !== 'push') bad.push('le passage suivant a remplacé la frappe : ' + textsOf(tablesOf()[0].node) + ' ' + planNow());
      } finally { rec.stop(); }
      // Grist revient : les deux s'écrivent ensemble.
      if (!(await waitFor(() => cellsOfRow(m.id) === TYPED_CELLS, 9000))) bad.push('une fois Grist revenu, le modèle n\'a pas reçu le tableau : ' + cellsOfRow(m.id));
      await sleep(400);
      if (cellsOfRow(d.id) !== TYPED_CELLS || savedBase(d.id) !== tableAttrs().linkedBase || tableAttrs().linkedBase === baseBefore || planNow() !== 'none') bad.push('après le retour de Grist : ' + cellsOfRow(d.id) + ' ' + savedBase(d.id) + ' ' + tableAttrs().linkedBase + ' ' + planNow());
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_text_typed_while_the_batch_is_written_stays_to_send_with_the_next_save',
    description: 'Une frappe faite PENDANT que Grist écrit le lot (Grist lent) : la base avance sur le tableau qui est parti, pas sur celui que la frappe a fait - le modèle a le tableau d\'avant la frappe, le tableau de l\'éditeur garde la frappe et reste à envoyer, le document est encore « à enregistrer » (en partir pose la question) ; le prochain « Enregistrer » envoie aussi cette frappe',
    run: async (h) => withApp(h, async () => h.withRealChoose(async () => {
      setAutosave(false);
      const bad = [];
      const m = await model('Envoi en vol', gridHtml('O', 2, 2));
      const d = await reopenedDoc(m, 'O', 2, 2);
      await typeInTable('X');
      const api = grist.docApi;
      const real = api.applyUserActions;
      let typed = false;
      api.applyUserActions = async function (actions) {
        const result = await real.apply(api, arguments);
        if (!typed && actions.some(a => a[0] === 'UpdateRecord' && a[1] === Templates.TABLE_NAME && a[2] === m.id)) {
          typed = true;
          ed().chain().focus().setTextSelection(cellText(0, 0, 1)).insertContent('Y').run();
        }
        return result;
      };
      try { await h.clickButton('btn-save'); await sleep(900); } finally { api.applyUserActions = real; }
      if (!typed) bad.push('la frappe en vol n\'a pas eu lieu');
      if (cellsOfRow(m.id) !== TYPED_CELLS) bad.push('le modèle n\'a pas le tableau parti : ' + cellsOfRow(m.id));
      if (textsOf(tablesOf()[0].node) !== 'XOA1|YOB1|OA2|OB2') bad.push('la frappe en vol a disparu de l\'éditeur : ' + textsOf(tablesOf()[0].node));
      if (planNow() !== 'push') bad.push('la frappe en vol n\'est plus à envoyer : ' + planNow());
      await h.clickButton('btn-new');
      await sleep(500);
      if (!dialogOpen()) return { pass: false, notes: bad.concat('la frappe en vol n\'est plus « à enregistrer » : aucune question avant de partir').join(' | ') };
      await answerDialog('Annuler');
      const next = await saveByHand(h);
      if (shapeOf(next.bundles) !== 'Upd:' + d.id + '+Upd:' + m.id || cellsOfRow(m.id) !== 'XOA1|YOB1|OA2|OB2' || planNow() !== 'none') bad.push('le prochain Enregistrer : ' + shapeOf(next.bundles) + ' ' + cellsOfRow(m.id) + ' ' + planNow());
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    })),
  });


  cases.push({
    id: 'linked_save_by_hand_reads_the_models_first_and_never_overwrites_one_changed_elsewhere',
    description: 'Le modèle a changé ailleurs depuis la dernière lecture (le cache du widget ne le sait pas encore) ET le document a changé son tableau : « Enregistrer » à la main relit les modèles avant d\'envoyer, voit que les deux ont changé et n\'écrit que la ligne du document ; le modèle garde ce qu\'une autre personne y a mis, le tableau du document garde sa frappe (plan « diffère »), la ligne d\'état dit que le tableau diffère du modèle',
    run: async (h) => withApp(h, async () => {
      setAutosave(false);
      const bad = [];
      const m = await model('Envoi écrasant', gridHtml('O', 2, 2));
      const d = await reopenedDoc(m, 'O', 2, 2);
      await typeInTable('X');
      const elsewhere = gridHtml('N', 2, 2);
      stub().remoteWrite(Templates.TABLE_NAME, m.id, { Contenu: elsewhere });
      if (planNow() !== 'push') bad.push('le cache d\'avant ne dit plus « à envoyer » : ' + planNow());
      say('');
      const saved = await saveByHand(h);
      if (shapeOf(saved.bundles) !== 'Upd:' + d.id) bad.push('lots : ' + shapeOf(saved.bundles));
      if (String(rowOf(m.id).Contenu) !== elsewhere) bad.push('le modèle a été écrasé : ' + String(rowOf(m.id).Contenu).slice(0, 120));
      if (cellsOfRow(d.id) !== TYPED_CELLS || textsOf(tablesOf()[0].node) !== TYPED_CELLS) bad.push('le document : ' + cellsOfRow(d.id) + ' / ' + textsOf(tablesOf()[0].node));
      if (planNow() !== 'differs') bad.push('plan après : ' + planNow());
      const line = statusLine();
      if (line.text !== I18n.t('linkedTable.differs', { name: m.nom }) || line.error) bad.push('ligne d\'état : ' + JSON.stringify(line));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_autosave_pass_does_not_send_over_a_model_changed_elsewhere_and_the_line_keeps_saying_so',
    description: 'Le modèle change ailleurs en même temps que le tableau du document : le passage de l\'enregistrement automatique (qui relit les modèles) n\'envoie rien - le lot n\'a que la ligne du document, le modèle garde ce qu\'une autre personne y a mis - et la ligne d\'état dit que le tableau diffère du modèle APRÈS l\'écriture (« Enregistré à… » ne l\'efface pas) ; les passages suivants ne le répètent pas ni n\'écrivent de nouveau',
    run: async (h) => withApp(h, async () => {
      const bad = [];
      const m = await model('Envoi écart', gridHtml('O', 2, 2));
      const d = await reopenedDoc(m, 'O', 2, 2);
      const elsewhere = gridHtml('N', 2, 2);
      const rec = recordBundles();
      try {
        await cursorIn(0, 0, 0);
        await sleep(GROUP_GAP_MS);
        // Le changement d'ailleurs et la frappe dans le même tour : aucune lecture de fond ne tombe entre les deux.
        stub().remoteWrite(Templates.TABLE_NAME, m.id, { Contenu: elsewhere });
        ed().chain().focus().insertContent('X').run();
        if (!(await waitFor(() => cellsOfRow(d.id) === TYPED_CELLS, 9000))) bad.push('le document n\'a pas été écrit : ' + cellsOfRow(d.id));
        await sleep(400);
        if (shapeOf(rec.bundles) !== 'Upd:' + d.id) bad.push('lots : ' + shapeOf(rec.bundles));
        if (String(rowOf(m.id).Contenu) !== elsewhere) bad.push('le modèle a été écrasé : ' + String(rowOf(m.id).Contenu).slice(0, 120));
        if (textsOf(tablesOf()[0].node) !== TYPED_CELLS || planNow() !== 'differs') bad.push('le tableau du document : ' + textsOf(tablesOf()[0].node) + ' ' + planNow());
        const line = statusLine();
        if (line.text !== I18n.t('linkedTable.differs', { name: m.nom }) || line.error) bad.push('ligne d\'état : ' + JSON.stringify(line));
        const count = rec.bundles.length;
        await sleep(3300);
        if (rec.bundles.length !== count || statusLine().text !== line.text) bad.push('les passages suivants ont écrit ou changé la ligne : ' + shapeOf(rec.bundles) + ' « ' + statusLine().text + ' »');
      } finally { rec.stop(); }
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_save_without_a_changed_table_writes_only_the_document',
    description: 'Une frappe hors du tableau lié et des largeurs de colonnes que la page pose (ce n\'est pas une modification du tableau) : « Enregistrer » n\'écrit que la ligne du document ; le modèle n\'est pas touché (même contenu, même date) et la ligne d\'état ne dit aucune mise à jour de modèle',
    run: async (h) => withApp(h, async () => {
      setAutosave(false);
      const bad = [];
      const m = await model('Rien à envoyer', gridHtml('O', 2, 2));
      const d = await reopenedDoc(m, 'O', 2, 2);
      const modelBefore = JSON.stringify(rowOf(m.id));
      await cursorAt('avant');
      await sleep(GROUP_GAP_MS);
      ed().chain().focus().insertContent('x').run();
      setWidths(0, 120);
      await sleep(100);
      if (planNow() !== 'none') bad.push('plan : ' + planNow());
      say('');
      const saved = await saveByHand(h);
      if (shapeOf(saved.bundles) !== 'Upd:' + d.id) bad.push('lots : ' + shapeOf(saved.bundles));
      if (JSON.stringify(rowOf(m.id)) !== modelBefore) bad.push('le modèle a été touché');
      if (String(rowOf(d.id).Contenu).indexOf('axvant') === -1) bad.push('la frappe n\'est pas dans la ligne du document');
      if (statusLine().text === I18n.t('linkedTable.pushed', { name: m.nom })) bad.push('la ligne d\'état dit un modèle mis à jour');
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_save_under_track_changes_keeps_the_table_to_send_and_the_next_save_sends_it',
    description: 'Le suivi des modifications est allumé au moment d\'« Enregistrer » (une suggestion ne s\'écrit pas dans un modèle partagé) : seule la ligne du document s\'écrit, le tableau reste « à envoyer » (la base n\'a pas bougé) ; une fois le suivi coupé, l\'« Enregistrer » suivant l\'envoie',
    run: async (h) => withApp(h, async () => {
      setAutosave(false);
      const bad = [];
      const m = await model('Envoi suivi', gridHtml('O', 2, 2));
      const d = await reopenedDoc(m, 'O', 2, 2);
      await typeInTable('X');
      const modelBefore = String(rowOf(m.id).Contenu);
      Editor.setTrackChanges(true);
      let held;
      try { held = await saveByHand(h); } finally { Editor.setTrackChanges(false); }
      if (shapeOf(held.bundles) !== 'Upd:' + d.id || String(rowOf(m.id).Contenu) !== modelBefore) bad.push('sous le suivi : ' + shapeOf(held.bundles));
      if (planNow() !== 'push') bad.push('plan sous le suivi : ' + planNow());
      const later = await saveByHand(h);
      if (shapeOf(later.bundles) !== 'Upd:' + d.id + '+Upd:' + m.id || cellsOfRow(m.id) !== TYPED_CELLS || planNow() !== 'none') bad.push('suivi coupé : ' + shapeOf(later.bundles) + ' ' + cellsOfRow(m.id) + ' ' + planNow());
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_save_by_hand_refused_batch_writes_nothing_and_keeps_the_table_to_send',
    description: '« Enregistrer » à la main quand Grist refuse le lot : ni la ligne du document ni le modèle ne changent, la base de l\'éditeur n\'avance pas (le tableau reste « à envoyer »), la frappe reste dans le tableau, la ligne d\'état dit l\'échec ; l\'« Enregistrer » suivant, une fois Grist revenu, écrit les deux',
    run: async (h) => withApp(h, async () => {
      setAutosave(false);
      const bad = [];
      const m = await model('Envoi refusé à la main', gridHtml('O', 2, 2));
      const d = await reopenedDoc(m, 'O', 2, 2);
      await typeInTable('X');
      const docBefore = String(rowOf(d.id).Contenu);
      const modelBefore = String(rowOf(m.id).Contenu);
      const baseBefore = tableAttrs().linkedBase;
      say('');
      const refused = await saveByHand(h, actions => (actions.some(a => a[0] === 'UpdateRecord' && a[1] === Templates.TABLE_NAME) ? 'refusé par les règles d\'accès' : null));
      if (refused.stats.refused !== 1) bad.push('le lot n\'a pas été tenté : ' + refused.stats.refused);
      if (String(rowOf(d.id).Contenu) !== docBefore || String(rowOf(m.id).Contenu) !== modelBefore) bad.push('une ligne a changé malgré le refus');
      if (tableAttrs().linkedBase !== baseBefore || planNow() !== 'push' || textsOf(tablesOf()[0].node) !== TYPED_CELLS) bad.push('après le refus : ' + tableAttrs().linkedBase + ' ' + planNow() + ' ' + textsOf(tablesOf()[0].node));
      if (!statusLine().error) bad.push('la ligne d\'état ne dit pas l\'échec : ' + JSON.stringify(statusLine()));
      const next = await saveByHand(h);
      if (shapeOf(next.bundles) !== 'Upd:' + d.id + '+Upd:' + m.id || cellsOfRow(m.id) !== TYPED_CELLS || cellsOfRow(d.id) !== TYPED_CELLS || planNow() !== 'none') bad.push('l\'Enregistrer suivant : ' + shapeOf(next.bundles) + ' ' + cellsOfRow(m.id) + ' ' + planNow());
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_save_when_the_models_cannot_be_read_saves_the_document_alone_and_sends_next_time',
    description: 'Les modèles ne se relisent pas (lecture de Grist en échec) au moment d\'un « Enregistrer » à la main : le tableau changé ne part pas (on ne sait pas si le modèle a changé ailleurs) mais le document s\'enregistre, sans erreur ; le tableau reste « à envoyer » et part à l\'« Enregistrer » suivant, une fois les modèles relus',
    run: async (h) => withApp(h, async () => {
      setAutosave(false);
      const bad = [];
      const m = await model('Envoi hors ligne', gridHtml('O', 2, 2));
      const d = await reopenedDoc(m, 'O', 2, 2);
      await typeInTable('X');
      const modelBefore = String(rowOf(m.id).Contenu);
      const realLoad = Templates.loadAll;
      let calls = 0;
      Templates.loadAll = async function () { if (calls++ === 0) throw new Error('hors ligne'); return realLoad.apply(this, arguments); };
      let first;
      try { first = await saveByHand(h); } finally { Templates.loadAll = realLoad; }
      if (calls < 1) bad.push('les modèles n\'ont pas été relus avant l\'envoi');
      if (shapeOf(first.bundles) !== 'Upd:' + d.id || String(rowOf(m.id).Contenu) !== modelBefore) bad.push('modèles illisibles : ' + shapeOf(first.bundles));
      if (cellsOfRow(d.id) !== TYPED_CELLS || statusLine().error) bad.push('le document n\'est pas enregistré sans erreur : ' + cellsOfRow(d.id) + ' ' + JSON.stringify(statusLine()));
      if (planNow() !== 'push') bad.push('plan : ' + planNow());
      const next = await saveByHand(h);
      if (shapeOf(next.bundles) !== 'Upd:' + d.id + '+Upd:' + m.id || cellsOfRow(m.id) !== TYPED_CELLS) bad.push('Enregistrer suivant : ' + shapeOf(next.bundles) + ' ' + cellsOfRow(m.id));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  // Une ligne retirée de la table des modèles sans que le widget le sache (une autre personne supprime le modèle) : la forme de la table des tests, colonne par colonne.
  function dropRowQuietly(id) {
    const table = stub().state.rows[Templates.TABLE_NAME];
    const at = table.id.indexOf(id);
    if (at !== -1) Object.keys(table).forEach(k => table[k].splice(at, 1));
  }

  cases.push({
    id: 'linked_model_deleted_while_the_batch_is_written_refuses_it_whole_then_the_document_saves_alone',
    description: 'Le modèle est supprimé dans Grist au moment où le lot part (le widget ne l\'a pas encore relu) : Grist refuse le lot en entier - la ligne du document n\'est pas écrite non plus, la base n\'avance pas, la ligne d\'état dit l\'échec - puis, au passage suivant, la relecture des modèles ne le trouve plus : le document s\'écrit seul, avec la frappe, et son tableau reste lié à un modèle disparu (sans effet, rien d\'envoyé)',
    run: async (h) => withApp(h, async () => {
      const bad = [];
      const m = await model('Envoi supprimé', gridHtml('O', 2, 2));
      const d = await reopenedDoc(m, 'O', 2, 2);
      const docBefore = String(rowOf(d.id).Contenu);
      const baseBefore = tableAttrs().linkedBase;
      let dropped = false;
      // Comme Grist : une mise à jour d'une ligne qui n'existe plus refuse tout le lot (le faux Grist, lui, ignore une mise à jour seule).
      const rec = recordBundles(actions => {
        if (!actions.some(a => a[0] === 'UpdateRecord' && a[1] === Templates.TABLE_NAME && a[2] === m.id)) return null;
        if (!dropped) { dropped = true; dropRowQuietly(m.id); }
        return stub().getRow(Templates.TABLE_NAME, m.id) ? null : 'Error : la ligne ' + m.id + ' n\'existe pas';
      });
      try {
        await typeInTable('X');
        if (!(await waitFor(() => rec.stats.refused >= 1, 9000))) bad.push('aucun lot n\'a été tenté');
        await sleep(400);
        if (String(rowOf(d.id).Contenu) !== docBefore) bad.push('la ligne du document a été écrite malgré le refus du lot');
        if (tableAttrs().linkedBase !== baseBefore || planNow() === 'none') bad.push('la base a avancé malgré le refus : ' + tableAttrs().linkedBase + ' ' + planNow());
        if (!statusLine().error) bad.push('la ligne d\'état ne dit pas l\'échec : ' + JSON.stringify(statusLine()));
        if (!(await waitFor(() => cellsOfRow(d.id) === TYPED_CELLS, 9000))) bad.push('le document ne s\'écrit pas seul au passage suivant : ' + cellsOfRow(d.id));
        await sleep(400);
        if (shapeOf(rec.bundles) !== 'Upd:' + d.id + '+Upd:' + m.id + ' / Upd:' + d.id) bad.push('lots : ' + shapeOf(rec.bundles));
        if (planNow() !== 'mort' || statusLine().error) bad.push('le tableau n\'est pas resté lié à un modèle disparu : ' + planNow() + ' ' + JSON.stringify(statusLine()));
      } finally { rec.stop(); }
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_first_save_of_a_new_document_creates_its_row_and_updates_two_models_in_one_batch',
    description: 'Un document tout neuf (pas encore de ligne) avec deux tableaux liés à deux modèles, tous deux changés : le premier « Enregistrer » crée la ligne du document ET met les deux modèles à jour dans un seul lot (la ligne créée d\'abord) ; la ligne d\'état compte les modèles (« 2 modèles mis à jour avec ces tableaux. », en anglais « 2 templates updated with these tables. ») ; un seul tableau changé ensuite : la phrase du modèle (« Modèle « … » mis à jour avec ce tableau. ») ; le lot suivant met à jour la ligne, sans en créer une autre',
    run: async (h) => withApp(h, async () => {
      setAutosave(false);
      const bad = [];
      const a = await model('Envoi premier', gridHtml('P', 2, 2));
      const b = await model('Envoi second', gridHtml('S', 2, 2));
      Templates.setCurrentId(null); // enregistrer un modèle neuf le rend courant : le document de ce cas est neuf, sans ligne
      Editor.setHTML('<p>avant</p>' + linkedHtml(a.id, 'P', 2, 2) + '<p>entre</p>' + linkedHtml(b.id, 'S', 2, 2) + '<p>après</p>');
      await sleep(200);
      const stamped = LinkedTable.syncOpen(ed());
      await sleep(100);
      if (!stamped || stamped.rebased !== 2) bad.push('bases posées : ' + JSON.stringify(stamped));
      await typeInTable('X', 0);
      await typeInTable('Y', 1);
      if (planNow(0) !== 'push' || planNow(1) !== 'push') bad.push('plans avant : ' + planNow(0) + ' ' + planNow(1));
      document.getElementById('template-name').value = 'Deux tableaux ' + (++counter);
      say('');
      const created = await saveByHand(h);
      const newId = Templates.getCurrentId();
      if (newId) made.push(newId);
      if (shapeOf(created.bundles) !== 'Add+Upd:' + a.id + '+Upd:' + b.id) bad.push('lots : ' + shapeOf(created.bundles));
      if (!newId || cellsOfRow(a.id) !== 'X' + labels('P', 2, 2) || cellsOfRow(b.id) !== 'Y' + labels('S', 2, 2)) bad.push('modèles : ' + cellsOfRow(a.id) + ' / ' + cellsOfRow(b.id));
      if (planNow(0) !== 'none' || planNow(1) !== 'none') bad.push('plans après : ' + planNow(0) + ' ' + planNow(1));
      if (statusLine().text !== '2 modèles mis à jour avec ces tableaux.' || statusLine().error) bad.push('ligne d\'état : ' + JSON.stringify(statusLine()));
      if (I18n.t('linkedTable.pushedMany', { n: 1 }) !== '1 modèle mis à jour avec ce tableau.') bad.push('singulier français : ' + I18n.t('linkedTable.pushedMany', { n: 1 }));
      I18n.setLang('en');
      try {
        if (I18n.t('linkedTable.pushedMany', { n: 1 }) !== '1 template updated with this table.') bad.push('singulier anglais : ' + I18n.t('linkedTable.pushedMany', { n: 1 }));
        await typeInTable('X', 0);
        await typeInTable('Y', 1);
        say('');
        const both = await saveByHand(h);
        if (shapeOf(both.bundles) !== 'Upd:' + newId + '+Upd:' + a.id + '+Upd:' + b.id) bad.push('lots, seconde fois : ' + shapeOf(both.bundles));
        if (statusLine().text !== '2 templates updated with these tables.') bad.push('ligne d\'état en anglais : ' + statusLine().text);
        await typeInTable('Z', 1);
        say('');
        const one = await saveByHand(h);
        if (shapeOf(one.bundles) !== 'Upd:' + newId + '+Upd:' + b.id) bad.push('lots, un seul tableau : ' + shapeOf(one.bundles));
        if (statusLine().text !== 'Template “' + b.nom + '” updated with this table.') bad.push('ligne d\'état, un seul tableau : ' + statusLine().text);
      } finally { I18n.setLang('fr'); }
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_save_as_a_copy_sends_the_changed_table_like_any_first_save_and_leaves_the_original_row',
    description: '« Enregistrer sous… » d\'un document dont le tableau lié a changé crée la copie ET met le modèle à jour dans un seul lot (comme le premier « Enregistrer » d\'un document neuf) ; la ligne du document d\'origine n\'est pas touchée',
    run: async (h) => withApp(h, async () => {
      setAutosave(false);
      const dialogs = h.stubDialogs({ prompt: 'Copie envoi' });
      try {
        const bad = [];
        const m = await model('Envoi copie', gridHtml('O', 2, 2));
        const d = await reopenedDoc(m, 'O', 2, 2);
        const originalBefore = JSON.stringify(rowOf(d.id));
        await typeInTable('X');
        const rec = recordBundles();
        try { document.getElementById('v2-btn-save-as').click(); await sleep(1200); } finally { rec.stop(); }
        const copyId = Templates.getCurrentId();
        if (copyId && copyId !== d.id) made.push(copyId);
        if (shapeOf(rec.bundles) !== 'Add+Upd:' + m.id) bad.push('lots : ' + shapeOf(rec.bundles));
        if (!copyId || copyId === d.id || cellsOfRow(copyId) !== TYPED_CELLS || cellsOfRow(m.id) !== TYPED_CELLS) bad.push('copie ou modèle : ' + copyId + ' ' + (copyId ? cellsOfRow(copyId) : '') + ' ' + cellsOfRow(m.id));
        if (JSON.stringify(rowOf(d.id)) !== originalBefore) bad.push('la ligne du document d\'origine a été touchée');
        return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
      } finally { dialogs.restore(); }
    }),
  });


  cases.push({
    id: 'editor_get_html_of_a_future_document_state_is_what_the_editor_writes_once_it_is_applied',
    description: 'Editor.getHTML(doc) écrit un état à venir du document - jamais posé dans l\'éditeur - avec le même sérialiseur que l\'éditeur : l\'état présent s\'écrit exactement comme Editor.getHTML() (titre, gras, italique, tableau lié, liste) ; un état avec une base de plus sur le tableau lié s\'écrit comme l\'éditeur l\'écrira une fois la transaction posée, sans que l\'écrire change l\'éditeur ; sans document donné, Editor.getHTML() est ce qu\'il était',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await model('Futur', gridHtml('F', 2, 2));
      Editor.setHTML('<h1>Titre</h1><p>avant <strong>gras</strong> <em>italique</em></p>' + linkedHtml(m.id, 'F', 2, 2) + '<ul><li>un</li><li>deux</li></ul><p>après</p>');
      await sleep(200);
      LinkedTable.syncOpen(ed());
      await sleep(100);
      const now = Editor.getHTML();
      if (!/<h1>Titre<\/h1>/.test(now) || !/data-linked-base=/.test(now)) bad.push('le document de départ : ' + now.slice(0, 160));
      if (Editor.getHTML(ed().state.doc) !== now) bad.push('l\'état présent s\'écrit autrement que par l\'éditeur');
      const reference = docJson();
      const tr = ed().state.tr.setNodeAttribute(tablesOf()[0].pos, 'linkedBase', 'aaaaaaaaaaa.bbbbbbbbbbb');
      const future = Editor.getHTML(tr.doc);
      if (docJson() !== reference || Editor.getHTML() !== now) bad.push('écrire un état à venir a changé l\'éditeur');
      if (future === now || future.indexOf('data-linked-base="aaaaaaaaaaa.bbbbbbbbbbb"') === -1 || stripBase(future) !== stripBase(now)) bad.push('l\'état à venir : ' + future.slice(0, 200));
      ed().view.dispatch(tr.setMeta('addToHistory', false));
      if (Editor.getHTML() !== future) bad.push('posé, l\'éditeur écrit autre chose que l\'état à venir');
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_send_waits_for_the_same_pauses_as_the_follow_and_never_touches_the_editor',
    description: 'Ce qui part avec l\'enregistrement se prépare sans toucher à l\'éditeur (le document est le même avant et après ; le HTML à écrire n\'a que la base du tableau de plus ; le modèle reçoit le tableau nu) ; rien ne se prépare - et rien ne demande de relire les modèles - tant que le suivi des modifications est allumé, qu\'un en-tête ou un pied de page est ouvert, qu\'une composition de texte est en cours, que l\'éditeur montre une grille, qu\'il est détruit ou qu\'une action à la main attend sa fin ; levé, le tableau part',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await model('Pauses envoi', gridHtml('Q', 2, 2));
      await placed(m);
      await typeInTable('X');
      if (planNow() !== 'push') bad.push('plan : ' + planNow());
      const reference = docJson();
      const send = LinkedTable.prepareSend(ed());
      if (!send || !LinkedTable.hasPending(ed()) || send.writes.length !== 1 || send.writes[0].id !== m.id) bad.push('rien à envoyer alors qu\'un tableau l\'est : ' + JSON.stringify(send && send.writes));
      else {
        if (docJson() !== reference) bad.push('préparer l\'envoi a changé l\'éditeur');
        const written = send.writes[0].contenu;
        if (!/^<table[ >]/.test(written) || /data-linked-|comment-mark/.test(written) || written.indexOf('XQA1') === -1) bad.push('ce que le modèle reçoit : ' + written.slice(0, 160));
        const current = Editor.getHTML();
        if (send.html === current || stripBase(send.html) !== stripBase(current) || !BASE_FORM.test((send.html.match(/data-linked-base="([^"]*)"/) || [])[1] || '')) bad.push('le HTML à écrire n\'a pas que la base de plus');
      }
      const attempt = (label) => {
        const refused = LinkedTable.prepareSend(ed());
        if (refused !== null || LinkedTable.hasPending(ed()) || docJson() !== reference) bad.push(label + ' : ' + JSON.stringify(refused && refused.writes));
      };
      Editor.setTrackChanges(true);
      attempt('suivi des modifications');
      Editor.setTrackChanges(false);
      const realMode = HeaderFooterPreview.getHfMode;
      HeaderFooterPreview.getHfMode = () => 'header';
      try { attempt('en-tête ouvert'); } finally { HeaderFooterPreview.getHfMode = realMode; }
      const view = ed().view;
      const own = Object.getOwnPropertyDescriptor(view, 'composing');
      Object.defineProperty(view, 'composing', { configurable: true, get: () => true });
      try { attempt('composition en cours'); } finally { if (own) Object.defineProperty(view, 'composing', own); else delete view.composing; }
      const realActive = GridEditor.isActive;
      GridEditor.isActive = () => true;
      try { attempt('éditeur de grille à l\'écran'); } finally { GridEditor.isActive = realActive; }
      const gone = Object.create(ed(), { isDestroyed: { value: true } });
      if (LinkedTable.prepareSend(gone) !== null || LinkedTable.hasPending(gone)) bad.push('éditeur détruit');
      const lifted = LinkedTable.prepareSend(ed());
      if (!lifted || lifted.writes.length !== 1) bad.push('une fois levé : ' + JSON.stringify(lifted && lifted.writes));
      // Une action à la main qui attend la relecture des modèles.
      await cursorIn(0, 0, 0);
      const holding = LinkedTable.pull(ed());
      attempt('action à la main en cours');
      await holding;
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_only_a_table_the_document_changed_alone_is_sent',
    description: 'Seul un tableau que le document a changé et pas son modèle part avec l\'enregistrement : rien pour un tableau inchangé, un modèle seul changé (le tableau le suivra), les deux changés (l\'écart), un tableau sans base (identique ou différent), un lien ancien (sans jeton), un lien dont le modèle n\'existe plus ou dont le jeton n\'est pas celui du modèle (le tableau d\'un autre document n\'écrit jamais dans ce modèle) ; revenu à « seul le document a changé », le tableau part',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await model('États envoi', gridHtml('Q', 2, 2));
      await placed(m);
      const realBase = tableAttrs().linkedBase;
      const sentTo = () => { const s = LinkedTable.prepareSend(ed()); return s ? s.writes.map(w => w.id).join() : null; };
      const expectState = (label, plan, goes) => {
        const to = sentTo();
        if (planNow() !== plan || to !== (goes ? String(m.id) : null) || LinkedTable.hasPending(ed()) !== !!goes) bad.push(label + ' : plan ' + planNow() + ', envoi ' + to);
      };
      expectState('inchangé', 'none', false);
      await modelBecomes(m, gridHtml('N', 2, 2));
      expectState('modèle seul changé', 'pull', false);
      await typeInTable('X');
      expectState('les deux changés', 'differs', false);
      await modelBecomes(m, gridHtml('Q', 2, 2));
      expectState('document seul changé', 'push', true);
      // La base est celle du modèle : sans le jeton, ce tableau-là serait « à envoyer ».
      const withBase = (id, key, label) => gridHtml(label || 'R', 2, 2).replace('<table>', `<table ${ATTR}="${id}" ${KEY_ATTR}="${key}" ${BASE_ATTR}="${realBase}">`);
      const show = async html => { Editor.setHTML('<p>avant</p>' + html + '<p>après</p>'); await sleep(200); };
      await show(linkedHtml(m.id, 'Q', 2, 2));
      expectState('sans base, identique', 'rebase', false);
      await show(linkedHtml(m.id, 'R', 2, 2));
      expectState('sans base, différent', 'differs', false);
      await show(legacyHtml(m.id, 'R', 2, 2));
      expectState('lien ancien', 'manual', false);
      await show(withBase(m.id, NEW_TOKEN));
      expectState('jeton d\'un autre modèle', 'mort', false);
      await show(withBase(98765, tokens.get(m.id)));
      expectState('modèle disparu', 'mort', false);
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_send_commit_only_moves_the_base_of_the_table_that_was_sent_and_the_line_ends_on_what_matters',
    description: 'Valider un envoi : la base de l\'éditeur devient celle du HTML écrit, une fois (un second appel ne change rien), sans compter comme un changement de la personne ni entrer dans l\'historique (Annuler défait la frappe, pas la base) ; un tableau dont la base a changé entre-temps (une relève, une action à la main), un tableau détaché ou disparu n\'est pas touché ; la ligne d\'état finit sur ce qui compte le plus : l\'écart, puis les modèles mis à jour, puis les tableaux mis à jour ; rien à dire ne la change pas',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const m = await model('Valide', gridHtml('Q', 2, 2));
      const fresh = async () => {
        Editor.setHTML('<p>avant</p>' + linkedHtml(m.id, 'Q', 2, 2) + '<p>après</p>');
        await sleep(200);
        LinkedTable.syncOpen(ed());
        await sleep(80);
        await typeInTable('X');
        return LinkedTable.prepareSend(ed());
      };
      const baseOfHtml = send => (send.html.match(/data-linked-base="([^"]*)"/) || [])[1];
      // 1) Valider.
      let send = await fresh();
      if (!send) return { pass: false, notes: 'rien à envoyer' };
      const before = tableAttrs().linkedBase;
      let changes = 0;
      const count = ({ transaction }) => { if (!LinkedTable.isSyncTransaction(transaction)) changes++; };
      ed().on('update', count);
      try { send.commit(); } finally { ed().off('update', count); }
      if (tableAttrs().linkedBase !== baseOfHtml(send) || baseOfHtml(send) === before) bad.push('la base ne suit pas le HTML écrit : ' + tableAttrs().linkedBase + ' / ' + baseOfHtml(send) + ' (avant ' + before + ')');
      if (changes) bad.push('valider compte comme un changement de la personne : ' + changes);
      const once = docJson();
      send.commit();
      if (docJson() !== once) bad.push('un second appel a changé le document');
      await undo();
      if (textsOf(tablesOf()[0].node) !== labels('Q', 2, 2) || tableAttrs().linkedBase !== baseOfHtml(send)) bad.push('Annuler : ' + textsOf(tablesOf()[0].node) + ' ' + tableAttrs().linkedBase);
      // 2) La base a changé entre-temps.
      send = await fresh();
      const other = 'zzzzzzzzzzz.yyyyyyyyyyy';
      ed().view.dispatch(ed().state.tr.setNodeAttribute(tablesOf()[0].pos, 'linkedBase', other).setMeta('addToHistory', false));
      send.commit();
      if (tableAttrs().linkedBase !== other) bad.push('base changée entre-temps : ' + tableAttrs().linkedBase);
      // 3) Un tableau du même modèle mais d'un autre jeton (collé d'un autre document), avec la même base : il n'est pas celui qui est parti.
      send = await fresh();
      const sentBase = tableAttrs().linkedBase;
      Editor.setHTML('<p>avant</p>' + gridHtml('R', 2, 2).replace('<table>', `<table ${ATTR}="${m.id}" ${KEY_ATTR}="${NEW_TOKEN}" ${BASE_ATTR}="${sentBase}">`) + '<p>après</p>');
      await sleep(200);
      send.commit();
      if (tableAttrs().linkedBase !== sentBase) bad.push('jeton étranger : la base a avancé ' + tableAttrs().linkedBase);
      // 4) Détaché.
      send = await fresh();
      LinkedTable.detach(ed());
      send.commit();
      if (tableAttrs().linkedBase || tableAttrs().linkedTemplate || tableAttrs().linkedKey) bad.push('tableau détaché : ' + JSON.stringify([tableAttrs().linkedTemplate, tableAttrs().linkedKey, tableAttrs().linkedBase]));
      // 5) Disparu.
      send = await fresh();
      Editor.setHTML('<p>autre</p>');
      await sleep(150);
      const gone = docJson();
      try { send.commit(); } catch (e) { bad.push('tableau disparu : ' + e.message); }
      if (docJson() !== gone) bad.push('tableau disparu : le document a changé');
      // 6) La ligne d'état.
      send = await fresh();
      const line = () => statusLine().text;
      say('');
      LinkedTable.tell({ pulled: ['P1'], differs: ['D1'], rebased: 0 }, send);
      if (line() !== I18n.t('linkedTable.differs', { name: 'D1' })) bad.push('écart : ' + line());
      say('');
      LinkedTable.tell({ pulled: ['P1'], differs: [], rebased: 0 }, send);
      if (line() !== I18n.t('linkedTable.pushed', { name: m.nom })) bad.push('modèle mis à jour : ' + line());
      say('');
      LinkedTable.tell({ pulled: ['P1', 'P2'], differs: [], rebased: 0 }, null);
      if (line() !== I18n.t('linkedTable.pulledMany', { n: 2 })) bad.push('tableaux mis à jour : ' + line());
      say('');
      LinkedTable.tell({ pulled: ['P1'], differs: [], rebased: 0 }, null);
      if (line() !== I18n.t('linkedTable.pulled', { name: 'P1' })) bad.push('un tableau mis à jour : ' + line());
      say('déjà là');
      LinkedTable.tell({ pulled: [], differs: [], rebased: 1 }, null);
      LinkedTable.tell(null, null);
      if (line() !== 'déjà là') bad.push('rien à dire : ' + line());
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_autosave_of_a_macro_model_never_sends_a_table_even_if_the_editor_held_one',
    description: 'Un macro-modèle n\'a rien dans l\'éditeur (sa composition vit dans sa fenêtre). Si l\'éditeur gardait pourtant, par erreur, un document dont le tableau lié est à envoyer, le passage de l\'enregistrement automatique du macro-modèle n\'écrit aucun modèle Grille (un seul lot : la ligne du macro-modèle) et la base du tableau n\'avance pas',
    run: async (h) => withApp(h, async () => {
      const bad = [];
      const m = await model('Garde du macro', gridHtml('O', 2, 2));
      const d = await savedSyncedDoc(m, 'O', 2, 2);
      const docHtml = String(rowOf(d.id).Contenu);
      // Le macro-modèle par sa vraie fenêtre de composition, comme le groupe macroModeles : il est enregistré, sélectionné et chargé, l'éditeur est vidé.
      await h.clickButton('btn-new');
      await sleep(300);
      const cover = await Templates.save(null, 'Macro garde - couverture ' + (++counter), '<p>Page de garde</p>', '', null, null, 'document', null);
      made.push(cover.id);
      await Templates.loadAll();
      MacroEditor.openModal(null);
      document.getElementById('macro-editor-name').value = 'Macro garde ' + counter;
      const select = document.getElementById('macro-editor-cover');
      select.value = String(cover.id);
      select.dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('macro-editor-save').click();
      await sleep(700);
      const macroId = Templates.getCurrentId();
      if (macroId == null) return { pass: false, notes: 'le macro-modèle n\'a pas été créé' };
      made.push(macroId);
      // Contre la règle, l'éditeur garde un document dont le tableau lié a changé et pas son modèle.
      Editor.setHTML(docHtml);
      await sleep(200);
      ed().commands.focus();
      await typeInTable('X');
      if (planNow() !== 'push') return { pass: false, notes: 'plan avant : ' + planNow() };
      const baseBefore = tableAttrs().linkedBase;
      const modelBefore = JSON.stringify(rowOf(m.id));
      const rec = recordBundles();
      try {
        const name = document.getElementById('template-name');
        name.value = 'Macro garde renommée ' + counter;
        name.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(2 * 2500 + 900);
      } finally { rec.stop(); }
      if (!rec.bundles.some(b => b.some(a => String(a.id) === String(macroId)))) bad.push('le passage n\'a pas écrit le macro-modèle : le cas ne prouve rien (' + shapeOf(rec.bundles) + ')');
      if (rec.bundles.some(b => b.some(a => String(a.id) === String(m.id)))) bad.push('le modèle Grille a été écrit avec le macro-modèle : ' + shapeOf(rec.bundles));
      if (JSON.stringify(rowOf(m.id)) !== modelBefore) bad.push('la ligne du modèle Grille a changé');
      if (tableAttrs().linkedBase !== baseBefore) bad.push('la base du tableau a avancé : ' + tableAttrs().linkedBase + ' (avant ' + baseBefore + ')');
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  cases.push({
    id: 'linked_send_base_says_what_the_model_reads_back_so_a_rich_table_is_not_pulled_back',
    description: 'Un tableau dont le HTML ne se relit pas tel quel (une marque de style de texte vide, que le HTML écrit en <span> nu et que la lecture ne reprend pas ; un fond de case posé en hexadécimal) envoyé avec l\'enregistrement : la base dit ce que le modèle relira, pas le tableau du document tel quel. Sans cela le modèle semblerait avoir changé juste après l\'envoi (plan « mise à jour ») et le tableau serait remplacé au passage suivant',
    run: async (h) => withApp(h, async () => h.withRealChoose(async () => {
      setAutosave(false);
      const bad = [];
      const m = await model('Riche envoi', gridHtml('O', 2, 2));
      const d = await reopenedDoc(m, 'O', 2, 2);
      await cursorIn(0, 1, 1);
      await sleep(GROUP_GAP_MS);
      ed().chain().focus().insertContent('X').run();
      await sleep(100);
      // Une marque de style de texte sans réglage (ce que laisse « Aucune couleur » sur du texte) : le document la garde, le HTML l'écrit en <span> nu et la lecture du HTML l'abandonne.
      const at = cellText(0, 1, 1);
      ed().chain().focus().setTextSelection({ from: at, to: at + 1 }).setMark('textStyle', { color: null }).run();
      await sleep(100);
      ed().chain().focus().updateAttributes('tableCell', { backgroundColor: '#ffe599' }).run();
      await sleep(100);
      const written = JSON.stringify(doc().toJSON());
      if (!/"textStyle"/.test(written) || !/#ffe599/i.test(written)) bad.push('le tableau de départ n\'a pas la marque vide et le fond hexadécimal : le cas ne prouve rien');
      if (planNow() !== 'push') bad.push('plan avant : ' + planNow());
      const first = await saveByHand(h);
      if (shapeOf(first.bundles) !== 'Upd:' + d.id + '+Upd:' + m.id) bad.push('lots : ' + shapeOf(first.bundles));
      if (!/background-color: *(rgb\(255, 229, 153\)|#ffe599)/i.test(String(rowOf(m.id).Contenu))) bad.push('le modèle n\'a pas le fond : ' + String(rowOf(m.id).Contenu).slice(0, 160));
      if (planNow() !== 'none') bad.push('plan après l\'envoi : ' + planNow() + ' (le modèle relu ne dit pas la même chose que la base)');
      const before = docJson();
      say('');
      const done = LinkedTable.syncOpen(ed());
      if (docJson() !== before || (done && (done.pulled.length || done.differs.length))) bad.push('la synchro suivante a touché le document : ' + JSON.stringify(done));
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    })),
  });

  cases.push({
    id: 'linked_templates_save_that_also_writes_models_leaves_their_cache_and_dates_as_grist_has_them',
    description: 'Templates.save(…, alsoWrite), ligne du document mise à jour ou créée : chaque modèle écrit dans le même lot garde, tout de suite (sans relecture de la liste après coup), son contenu et sa date dans le cache et la date notée comme écrite par ce widget ; le lot est « le document d\'abord, puis un modèle chacun » ; ses dates sont celles que Grist garde',
    run: async (h) => withDoc(h, DOC, async () => {
      const bad = [];
      const a = await model('Cache A', gridHtml('A', 2, 2));
      const b = await model('Cache B', gridHtml('B', 2, 2));
      const saved = await Templates.save(null, 'Doc du cache ' + (++counter), '<p>x</p>', '', null, null, 'document', null);
      // Le faux Grist arrondit les dates à la seconde : sans cette attente, l'ancienne date et la nouvelle seraient la même et le cache périmé passerait pour juste.
      made.push(saved.id);
      await Templates.loadAll();
      await sleep(1300);
      const settled = (label, writtenIds) => {
        writtenIds.forEach(({ id, html }) => {
          const row = rowOf(id);
          const cached = Templates.byId(id);
          if (!cached || cached.contenu !== html || row.Contenu !== html) bad.push(label + ' : contenu de ' + id + ' en cache ' + (cached && cached.contenu === html) + ', dans Grist ' + (row.Contenu === html));
          else if (!Templates.sameDateModif(cached.dateModif, row.DateModif)) bad.push(label + ' : la date en cache de ' + id + ' n\'est pas celle de Grist');
          if (!Templates.sameDateModif(Templates.lastWritten(id), row.DateModif)) bad.push(label + ' : la date notée comme écrite de ' + id + ' n\'est pas celle de Grist');
        });
      };
      // 1) La ligne du document existe : deux modèles écrits avec elle.
      const first = [{ id: a.id, html: gridHtml('C', 2, 2) }, { id: b.id, html: gridHtml('D', 2, 2) }];
      let rec = recordBundles();
      try { await Templates.save(saved.id, 'Doc du cache ' + counter, '<p>y</p>', '', null, null, 'document', null, null, first.map(({ id, html }) => ({ id, contenu: html }))); } finally { rec.stop(); }
      const expectedUpdate = 'Upd:' + saved.id + '+Upd:' + a.id + '+Upd:' + b.id;
      if (shapeOf(rec.bundles) !== expectedUpdate) bad.push('mise à jour, lots : ' + shapeOf(rec.bundles) + ' au lieu de ' + expectedUpdate);
      settled('mise à jour', first);
      // 2) La ligne du document est créée : le modèle écrit avec elle.
      await sleep(1300);
      const second = [{ id: a.id, html: gridHtml('E', 2, 2) }];
      rec = recordBundles();
      let created;
      try { created = await Templates.save(null, 'Autre doc du cache ' + (++counter), '<p>z</p>', '', null, null, 'document', null, null, second.map(({ id, html }) => ({ id, contenu: html }))); } finally { rec.stop(); }
      made.push(created.id);
      if (shapeOf(rec.bundles) !== 'Add+Upd:' + a.id) bad.push('création, lots : ' + shapeOf(rec.bundles));
      settled('création', second);
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    }),
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.linkedTable = cases;
})();
