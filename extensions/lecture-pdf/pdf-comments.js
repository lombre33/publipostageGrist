// Les fils de commentaires d'un PDF lu dans la Lecture (extension « lecture-pdf », consigne GFS 045) : la personne sélectionne un passage du PDF, ouvre un fil, y répond, le résout, le rouvre ou le supprime, avec la fenêtre, les gestes
// et les couleurs des commentaires d'un modèle (js/comments.js prête le cadre et les morceaux de sa fenêtre : `Comments.kit`). Un PDF n'a ni document ni marque où poser un fil : tout vit dans la table des commentaires du document,
// `Publipostage_Commentaires`, comme les fils des modèles, et se retrouve par une clé - l'identifiant que GFS donne au PDF (`lecture.id`, jamais changé par un renommage ni un remplacement), dans la colonne `LectureId`.
//  - UNE LIGNE PAR MESSAGE. Celle du premier message porte aussi l'ancre du passage (la page, son début et sa fin dans le texte de la page, la citation, un peu de texte avant et après : extensions/lecture-pdf/pdf-anchor.js) et
//    l'état « résolu » ; une réponse n'est que la clé, l'auteur, le texte et la date. Aucune ligne de PDF n'a de `ModeleId` : la lecture d'un modèle ne voit pas les fils des PDF, ni celle d'un PDF ceux des modèles.
//  - RIEN N'EST ÉCRIT avant la publication du premier message : « Commenter » pose seulement une marque d'essai sur le passage (jamais enregistrée) et la fenêtre ; l'abandonner ne laisse rien derrière. Ouvrir un PDF n'écrit rien non
//    plus : la table n'est lue que si elle existe et porte la colonne de la clé - sinon aucun fil, sans question ni table ni colonne créée. La table (avec toutes ses colonnes, après l'accord de la personne) ou les colonnes qui
//    manquent à une table d'avant (par `AddColumn` seulement, après avoir relu celles qui sont là) arrivent avec le premier fil publié, et une colonne absente n'est jamais écrite. Quand Grist refuse la structure, la raison est dite,
//    rien n'est écrit et « Commenter » reste grisé pour ce PDF.
//  - LES FILS se lisent à l'ouverture du PDF, à l'ouverture d'un fil et après chaque geste (jamais en continu). Une marque est un surlignage du passage dans la couche de texte (extensions/lecture-pdf/pdf-view.js) ; un clic dessus
//    ouvre le fil, comme pour un modèle. Un fil ne couvre qu'une page : une sélection qui déborde est coupée à la fin de la page où elle commence, et le coin d'état le dit.
//  - ANNULER et RÉTABLIR (Ctrl + Z, Ctrl + Y, les boutons) couvrent chaque geste par js/action-history.js : publier, répondre, résoudre ou rouvrir, supprimer. Un fil qui a reçu les réponses d'une autre personne depuis n'est pas défait
//    (rien n'est écrit, le coin d'état le dit). Ces actions s'oublient quand le PDF quitte l'écran.
//    PdfComments.comment()    PdfComments.lockReason() -> texte | null    PdfComments.threads() -> [fils]    PdfComments.whenIdle() -> Promise
const PdfComments = (function () {
  const TABLE = Comments.TABLE_NAME;
  const KEY_COLUMN = 'LectureId';
  const kit = Comments.kit;

  let key = null;               // l'identifiant que GFS donne au PDF à l'écran : la clé de ses fils
  let epoch = 0;                // change à chaque PDF : ce qu'une lecture ou une écriture rend après coup n'est plus pour celui de l'écran
  let threads = new Map();      // CommentId -> { id, page, debut, fin, citation, avant, apres, resolved, anchorRow, messages: [{ id, auteur, texte, creeLe }], at }
  let draft = null;             // { id, anchor } : le passage choisi par « Commenter », pas encore écrit
  let win = null;               // { id, isNew, anchor } : le fil que la fenêtre montre
  let signature = null;         // ce que la fenêtre montre (résolu, messages) : relue, elle n'est redessinée que si cela a changé
  let refused = false;          // Grist a refusé la structure pour ce PDF : « Commenter » reste grisé
  let busy = false;             // un geste d'écriture est en route
  let actionIds = [];           // les actions d'Annuler / Rétablir de ce PDF

  // Les écritures et les lectures se font l'une après l'autre : une lecture lancée après une écriture la voit, et deux Ctrl + Z de suite se suivent. `tail` : rendu quand tout est fini (les essais l'attendent).
  let tail = Promise.resolve();
  function enqueue(job) {
    const run = tail.then(job);
    tail = run.catch(() => {});
    return run;
  }
  const whenIdle = () => tail;

  const text = value => (value === null || value === undefined ? '' : String(value));
  const number = value => (value === null || value === undefined || value === '' ? NaN : Number(value));
  const isTrue = value => value === true || value === 1 || value === 'true';
  const byDate = (a, b) => text(a.creeLe).localeCompare(text(b.creeLe)) || (a.id - b.id);
  function reasonOf(error) {
    const said = text(error && error.message ? error.message : error).replace(/\s+/g, ' ').trim();
    return said.length > 200 ? said.slice(0, 200) + '…' : said;
  }

  // ==============================================================================================================================================================================================
  // La table : lire les fils de ce PDF, et s'assurer de la structure avant la première écriture.

  // Les données de la table, ou null quand elle n'existe pas ou n'a pas la colonne de la clé (aucun fil, et rien n'est créé).
  async function readTable() {
    const tables = await grist.docApi.listTables();
    if (tables.indexOf(TABLE) === -1) return null;
    const data = await grist.docApi.fetchTable(TABLE);
    return data && KEY_COLUMN in data ? data : null;
  }

  // Les fils de la clé `forKey` dans les données lues : le fil d'un PDF est celui dont une ligne porte sa clé ; la ligne qui porte l'ancre (une citation et un passage) est celle du premier message.
  function parse(data, forKey) {
    const found = new Map();
    const column = name => data[name] || [];
    const ids = column('id');
    for (let i = 0; i < ids.length; i++) {
      if (text(column(KEY_COLUMN)[i]) !== forKey) continue;
      const cid = text(column('CommentId')[i]);
      if (!cid) continue;
      let thread = found.get(cid);
      if (!thread) {
        thread = { id: cid, page: NaN, debut: NaN, fin: NaN, citation: '', avant: '', apres: '', resolved: false, anchorRow: null, messages: [], at: null };
        found.set(cid, thread);
      }
      thread.messages.push({ id: ids[i], auteur: text(column('Auteur')[i]), texte: text(column('Texte')[i]), creeLe: text(column('CreeLe')[i]) });
      const from = number(column('Debut')[i]);
      const to = number(column('Fin')[i]);
      if (thread.anchorRow === null && text(column('Citation')[i]) && to > from) {
        Object.assign(thread, { anchorRow: ids[i], page: number(column('Page')[i]), debut: from, fin: to, citation: text(column('Citation')[i]), avant: text(column('Avant')[i]), apres: text(column('Apres')[i]), resolved: isTrue(column('Resolu')[i]) });
      }
    }
    found.forEach(thread => thread.messages.sort(byDate));
    return found;
  }

  async function columnsOf() {
    return Object.keys(await grist.docApi.fetchTable(TABLE)).map(name => name.toLowerCase());
  }

  // Avant la première écriture d'un fil : la table (créée avec toutes ses colonnes, après l'accord de la personne) et les colonnes qui lui manquent (`AddColumn` seulement, en un seul lot : tout ou rien, après avoir relu celles
  // qui sont là). Rend { ok: true }, ou { stop: 'declined' } (la personne refuse la table), ou { stop: 'refused', reason } (Grist refuse la structure, ou la colonne ajoutée a pris un autre nom parce que le sien était pris).
  async function ensureStructure() {
    const tables = await grist.docApi.listTables();
    if (tables.indexOf(TABLE) === -1) {
      try { await GristAPI.ensureTable(TABLE, Comments.TABLE_COLUMNS); }
      catch (e) {
        if (GristAPI.isTablesDeclined(e)) return { stop: 'declined' };
        return { stop: 'refused', reason: reasonOf(e) };
      }
    }
    const present = await columnsOf();
    const missing = Comments.PDF_COLUMNS.filter(column => present.indexOf(column.id.toLowerCase()) === -1);
    if (!missing.length) return { ok: true };
    try { await grist.docApi.applyUserActions(missing.map(column => ['AddColumn', TABLE, column.id, { type: column.type, isFormula: false }])); }
    catch (e) { return { stop: 'refused', reason: reasonOf(e) }; }
    const after = await columnsOf();
    const absent = missing.filter(column => after.indexOf(column.id.toLowerCase()) === -1);
    if (absent.length) return { stop: 'refused', reason: absent.map(column => column.id).join(', ') };
    return { ok: true };
  }

  async function email() {
    try { return (await GristAPI.getCurrentUserEmail()) || ''; } catch (e) { return ''; }
  }

  // Les colonnes d'une ligne de message : la clé, l'auteur, le texte, la date - et, pour le premier message du fil seulement, l'ancre et l'état résolu.
  function rowFields(forKey, thread, message, first) {
    const fields = { [KEY_COLUMN]: forKey, CommentId: thread.id, Auteur: message.auteur, Texte: message.texte, CreeLe: message.creeLe };
    if (first) Object.assign(fields, { Page: thread.page, Debut: thread.debut, Fin: thread.fin, Citation: thread.citation, Avant: thread.avant, Apres: thread.apres, Resolu: !!thread.resolved });
    return fields;
  }

  async function addRows(list) {
    const result = await grist.docApi.applyUserActions(list.map(fields => ['AddRecord', TABLE, null, fields]));
    return list.map((fields, i) => (result && result.retValues ? result.retValues[i] : null));
  }
  const removeRows = ids => grist.docApi.applyUserActions(ids.map(id => ['RemoveRecord', TABLE, id]));

  // Un message se reconnaît à ce qu'il dit, jamais au numéro de sa ligne : Annuler qui rend une ligne supprimée lui en donne un autre (comme pour les fils d'un modèle, js/comments.js `contentKey`).
  const messageKey = (when, who, said) => [text(when), text(who), text(said)].join('\u0001');

  // Les lignes d'un fil telles que la table les a maintenant : [{ id, anchor, key, fields }] (vide quand le fil n'y est plus) ; `fields` : ce qu'il faut pour récrire la ligne (jamais un ModeleId).
  async function rowsOf(forKey, commentId) {
    const data = await readTable();
    if (!data) return [];
    const rows = [];
    const column = name => data[name] || [];
    column('id').forEach((id, i) => {
      if (text(column(KEY_COLUMN)[i]) !== forKey || text(column('CommentId')[i]) !== commentId) return;
      const anchor = !!text(column('Citation')[i]) && number(column('Fin')[i]) > number(column('Debut')[i]);
      const fields = {};
      (anchor ? ['LectureId', 'CommentId', 'Auteur', 'Texte', 'CreeLe', 'Page', 'Debut', 'Fin', 'Citation', 'Avant', 'Apres', 'Resolu'] : ['LectureId', 'CommentId', 'Auteur', 'Texte', 'CreeLe']).forEach((name) => { fields[name] = column(name)[i]; });
      rows.push({ id, anchor, key: messageKey(column('CreeLe')[i], column('Auteur')[i], column('Texte')[i]), fields });
    });
    return rows;
  }

  // ==============================================================================================================================================================================================
  // Ce que l'écran montre : les marques, la fenêtre d'un fil.

  // Où est le passage d'un fil dans le PDF à l'écran : { page, debut, fin }, ou null quand il n'a pas de place.
  function place(thread) {
    thread.at = thread.fin > thread.debut && thread.page >= 1 ? { page: thread.page, debut: thread.debut, fin: thread.fin } : null;
  }

  function showMarks() {
    const marks = [];
    threads.forEach((thread) => { if (thread.at) marks.push({ id: thread.id, page: thread.at.page, debut: thread.at.debut, fin: thread.at.fin, resolved: thread.resolved }); });
    if (draft) marks.push({ id: draft.id, page: draft.anchor.page, debut: draft.anchor.debut, fin: draft.anchor.fin, resolved: false });
    PdfView.setMarks(marks);
  }

  const rectAnchor = rect => ({ getBoundingClientRect: () => rect });
  const shownBox = () => { const box = kit.box(); return box.style.display === 'none' ? null : box; };

  function actionsOf(commentId, resolved, hasMessages, replyArea) {
    const actions = Dom.el('div', 'v2-comment-popup-actions');
    if (!hasMessages) {
      // Un fil tout neuf : seule action possible, publier son premier message (ou fermer, qui n'enregistre rien).
      actions.appendChild(kit.button('v2-comment-popup-post', I18n.t('comments.post'), () => publishFirst(replyArea.value)));
    } else {
      actions.append(
        kit.button('v2-comment-popup-post', I18n.t('comments.reply'), () => reply(commentId, replyArea.value)),
        kit.button('v2-comment-popup-resolve', I18n.t(resolved ? 'comments.reopen' : 'comments.resolve'), () => toggleResolved(commentId)),
        kit.button('v2-comment-popup-delete', I18n.t('comments.deleteThread'), () => deleteThread(commentId)),
      );
    }
    return actions;
  }

  function drawWindow() {
    const box = kit.box();
    const thread = threads.get(win.id);
    const messages = thread ? thread.messages : [];
    const resolved = !!(thread && thread.resolved);
    signature = JSON.stringify([resolved, messages.map(message => message.id)]);
    box.innerHTML = '';
    const replyArea = kit.replyArea(messages.length > 0, closeWindow);
    box.append(kit.header(resolved, closeWindow), kit.list(messages), replyArea, actionsOf(win.id, resolved, messages.length > 0, replyArea));
    return replyArea;
  }

  function placeWindow() {
    const box = shownBox();
    if (box && win) kit.place(box, PdfView.markElement(win.id) || win.anchor);
  }

  function showWindow(commentId, isNew, anchor) {
    kit.closeModelPopup();            // celle d'un modèle, ou la nôtre : le cadre est unique
    win = { id: commentId, isNew, anchor };
    const replyArea = drawWindow();
    kit.box().style.display = 'block';
    placeWindow();
    if (isNew) setTimeout(() => replyArea.focus(), 0);   // cf. la fenêtre d'un modèle : le focus différé, sinon le clic qui l'ouvre le reprend
  }

  // Le cadre vient d'être refermé : par la croix et Échap (closeWindow), ou par js/comments.js (les droits changent, un modèle se charge). Un fil jamais publié s'en va avec sa marque d'essai : rien n'a été écrit.
  function onHidden() {
    if (!win) return;
    const was = win;
    win = null;
    if (draft && draft.id === was.id) { draft = null; showMarks(); }
  }
  function closeWindow() {
    if (!win) return;
    kit.box().style.display = 'none';
    onHidden();
  }
  kit.onHide(onHidden);

  // Les fils viennent d'être relus (ou un geste vient de les changer) : la fenêtre ouverte dit la même chose, sans perdre la réponse qu'on y tape.
  function syncWindow() {
    const box = shownBox();
    if (!win || !box) return;
    const thread = threads.get(win.id);
    if (!thread) { if (!win.isNew) closeWindow(); return; }
    win.isNew = false;
    if (JSON.stringify([!!thread.resolved, thread.messages.map(message => message.id)]) === signature) return;
    // La réponse qu'on est en train de taper reste, avec le focus et la place du curseur : la fenêtre se redessine sous les doigts de la personne.
    const typing = box.querySelector('.v2-comment-popup-reply');
    const kept = typing ? typing.value : '';
    const focused = !!typing && document.activeElement === typing;
    const caret = typing ? [typing.selectionStart, typing.selectionEnd] : null;
    const area = drawWindow();
    area.value = kept;
    if (focused) {
      area.focus();
      try { area.setSelectionRange(caret[0], caret[1]); } catch (e) { /* un champ qui n'a pas de curseur à poser */ }
    }
    placeWindow();
  }

  // ==============================================================================================================================================================================================
  // La lecture : à l'ouverture du PDF, à l'ouverture d'un fil et après chaque geste.

  async function reload() {
    const mine = epoch;
    if (!key) return false;
    let data = null;
    try { data = await readTable(); }
    catch (e) { console.warn('[PdfComments] fils non relus', e); return false; }
    if (mine !== epoch || !key) return false;
    threads = data ? parse(data, key) : new Map();
    threads.forEach(place);
    showMarks();
    syncWindow();
    return true;
  }
  const reloadSoon = () => enqueue(reload).catch(() => false);

  // ==============================================================================================================================================================================================
  // Les gestes : commenter, publier, répondre, résoudre, supprimer - et leur historique.

  function remember(forKey, undo, redo) {
    const id = ActionHistory.add({ undo, redo });
    if (forKey === key) actionIds.push(id);
  }
  const gone = () => ActionHistory.conflict(I18n.t('pdf.comment.gone'));
  // Après un Annuler ou un Rétablir, les fils du PDF à l'écran se relisent (le numéro de ligne d'un message rendu n'est plus le même).
  const afterHistory = (forKey) => { if (forKey === key) reloadSoon(); };

  // Le geste « Commenter » (js/pdf-reading.js:comment) : le passage sélectionné devient un fil à publier, montré par une marque d'essai et la fenêtre.
  function comment() {
    if (!key) return;
    const reason = lockReason();
    if (reason) { PdfReading.say(reason, true); return; }
    const anchor = PdfView.selection();
    if (!anchor) { PdfReading.say(I18n.t('comments.selectTextFirst'), true); return; }
    const id = kit.newId();
    draft = { id, anchor };
    if (anchor.clipped) PdfReading.say(I18n.t('pdf.comment.clipped'));
    PdfView.clearSelection();
    showMarks();
    showWindow(id, true, PdfView.markElement(id) || rectAnchor(anchor.rect));
  }

  // Une écriture refusée ou impossible : dite dans le coin d'état, avec ce qui n'a pas été fait.
  function failed(error, textKey) {
    console.warn('[PdfComments] écriture impossible', error);
    PdfReading.say(I18n.t(textKey), true);
  }

  async function gesture(work) {
    if (busy) return;
    busy = true;
    try { await work(); } finally { busy = false; }
  }

  function publishFirst(raw) {
    const body = text(raw).trim();
    const chosen = draft;
    if (!chosen || !win || win.id !== chosen.id || !body || !key) return Promise.resolve();
    return gesture(async () => {
      const mine = epoch;
      const forKey = key;
      let outcome = null;
      try {
        outcome = await enqueue(async () => {
          const structure = await ensureStructure();
          if (structure.stop) return structure;
          const auteur = await email();
          const thread = { id: chosen.id, page: chosen.anchor.page, debut: chosen.anchor.debut, fin: chosen.anchor.fin, citation: chosen.anchor.citation, avant: chosen.anchor.avant, apres: chosen.anchor.apres, resolved: false, anchorRow: null, messages: [], at: null };
          const message = { id: null, auteur, texte: body, creeLe: new Date().toISOString() };
          const [rowId] = await addRows([rowFields(forKey, thread, message, true)]);
          message.id = rowId;
          thread.anchorRow = rowId;
          thread.messages.push(message);
          return { thread, message };
        });
      } catch (e) { if (mine === epoch) failed(e, 'pdf.comment.writeFailed'); return; }
      if (mine !== epoch) return;
      if (outcome.stop === 'declined') { PdfReading.say(I18n.t('pdf.comment.declined'), true); return; }
      if (outcome.stop === 'refused') {
        refused = true;
        PdfReading.locksChanged();
        PdfReading.say(I18n.t('pdf.locked.structure'), true);
        Dialogs.notice({ title: I18n.t('pdf.comment.structureRefused.title'), message: I18n.t('pdf.comment.structureRefused.message', { reason: outcome.reason }), closeLabel: I18n.t('common.close') });
        return;
      }
      const thread = outcome.thread;
      place(thread);
      threads.set(thread.id, thread);
      if (draft && draft.id === thread.id) draft = null;
      // La fenêtre fermée pendant l'écriture ne se rouvre pas : le fil est publié, sa marque est là.
      if (win && win.id === thread.id) { win.isNew = false; drawWindow(); placeWindow(); }
      showMarks();
      rememberPublish(forKey, thread, outcome.message);
      reloadSoon();
    });
  }

  // Annuler retire la ligne que le geste a posée - mais jamais celles des autres : un fil qui a reçu des réponses depuis garde tout. Rétablir la pose de nouveau (sa ligne reprend un autre numéro).
  function rememberPublish(forKey, thread, message) {
    const cid = thread.id;
    const fields = rowFields(forKey, thread, message, true);
    const mine = messageKey(message.creeLe, message.auteur, message.texte);
    remember(forKey, async () => {
      await enqueue(async () => {
        const rows = await rowsOf(forKey, cid);
        const row = rows.find(each => each.key === mine);
        if (!row) throw gone();
        if (rows.length > 1) throw ActionHistory.conflict(I18n.t('pdf.comment.hasReplies'));
        await removeRows([row.id]);
      });
      afterHistory(forKey);
      return I18n.t('pdf.comment.status.removed');
    }, async () => {
      await enqueue(() => addRows([fields]));
      afterHistory(forKey);
      return I18n.t('pdf.comment.status.restored');
    });
  }

  function reply(commentId, raw) {
    const body = text(raw).trim();
    const thread = threads.get(commentId);
    if (!thread || !body || !key) return Promise.resolve();
    return gesture(async () => {
      const mine = epoch;
      const forKey = key;
      let message = null;
      try {
        message = await enqueue(async () => {
          const auteur = await email();
          const added = { id: null, auteur, texte: body, creeLe: new Date().toISOString() };
          [added.id] = await addRows([rowFields(forKey, thread, added, false)]);
          return added;
        });
      } catch (e) { if (mine === epoch) failed(e, 'pdf.comment.changeFailed'); return; }
      if (mine !== epoch) return;
      const current = threads.get(commentId) || thread;
      if (!current.messages.some(known => known.id === message.id)) current.messages.push(message);
      current.messages.sort(byDate);
      if (win && win.id === commentId) { drawWindow(); placeWindow(); }
      rememberReply(forKey, thread, message);
      reloadSoon();
    });
  }

  function rememberReply(forKey, thread, message) {
    const cid = thread.id;
    const fields = rowFields(forKey, thread, message, false);
    const mine = messageKey(message.creeLe, message.auteur, message.texte);
    remember(forKey, async () => {
      await enqueue(async () => {
        const row = (await rowsOf(forKey, cid)).find(each => each.key === mine);
        if (!row) throw gone();
        await removeRows([row.id]);
      });
      afterHistory(forKey);
      return I18n.t('pdf.comment.status.replyRemoved');
    }, async () => {
      await enqueue(async () => {
        if (!(await rowsOf(forKey, cid)).some(row => row.anchor)) throw gone();
        await addRows([fields]);
      });
      afterHistory(forKey);
      return I18n.t('pdf.comment.status.replyRestored');
    });
  }

  // « Résoudre » et « Rouvrir » : une seule écriture, sur la ligne du premier message.
  const setResolved = (forKey, commentId, value) => enqueue(async () => {
    const anchor = (await rowsOf(forKey, commentId)).find(row => row.anchor);
    if (!anchor) throw gone();
    await grist.docApi.applyUserActions([['UpdateRecord', TABLE, anchor.id, { Resolu: value }]]);
  });

  function toggleResolved(commentId) {
    const thread = threads.get(commentId);
    if (!thread || !key) return Promise.resolve();
    return gesture(async () => {
      const mine = epoch;
      const forKey = key;
      const next = !thread.resolved;
      try { await setResolved(forKey, commentId, next); }
      catch (e) { if (mine === epoch) failed(e, 'pdf.comment.changeFailed'); return; }
      if (mine !== epoch) return;
      (threads.get(commentId) || thread).resolved = next;
      showMarks();
      if (win && win.id === commentId) { drawWindow(); placeWindow(); }
      const said = value => I18n.t(value ? 'pdf.comment.status.resolved' : 'pdf.comment.status.reopened');
      remember(forKey,
        async () => { await setResolved(forKey, commentId, !next); afterHistory(forKey); return said(!next); },
        async () => { await setResolved(forKey, commentId, next); afterHistory(forKey); return said(next); });
      reloadSoon();
    });
  }

  function deleteThread(commentId) {
    const thread = threads.get(commentId);
    if (!thread || !key) return Promise.resolve();
    return gesture(async () => {
      if (!(await Dialogs.confirm({ title: I18n.t('comments.confirmDelete'), confirmLabel: I18n.t('common.delete'), danger: true }))) return;
      const mine = epoch;
      const forKey = key;
      if (mine !== epoch || !threads.has(commentId)) return;
      // Les lignes du fil telles que la table les a MAINTENANT (une réponse d'une autre personne a pu arriver, une ligne rendue par Annuler a changé de numéro) : toutes partent, et de quoi les rendre est gardé.
      let removed = [];
      try {
        removed = await enqueue(async () => {
          const rows = await rowsOf(forKey, commentId);
          if (rows.length) await removeRows(rows.map(row => row.id));
          return rows;
        });
      } catch (e) { if (mine === epoch) failed(e, 'pdf.comment.changeFailed'); return; }
      if (mine !== epoch) return;
      const wanted = removed.map(row => ({ fields: row.fields, key: row.key }));
      threads.delete(commentId);
      closeWindow();
      showMarks();
      if (!wanted.length) { reloadSoon(); return; }   // le fil n'était déjà plus dans la table : rien à rendre
      remember(forKey, async () => {
        await enqueue(() => addRows(wanted.map(row => row.fields)));
        afterHistory(forKey);
        return I18n.t('pdf.comment.status.restored');
      }, async () => {
        await enqueue(async () => {
          const keys = new Set(wanted.map(row => row.key));
          const ids = (await rowsOf(forKey, commentId)).filter(row => keys.has(row.key)).map(row => row.id);
          if (!ids.length) throw gone();
          await removeRows(ids);
        });
        afterHistory(forKey);
        return I18n.t('pdf.comment.status.deleted');
      });
      reloadSoon();
    });
  }

  // Un clic sur une marque : le fil s'ouvre avec ce qu'on en sait, puis se relit pour montrer les dernières réponses.
  function openThread(commentId, element) {
    if (!threads.has(commentId)) return;
    showWindow(commentId, false, element);
    reloadSoon();
  }

  // ==============================================================================================================================================================================================
  // Le PDF à l'écran arrive, change ou part.

  function stop() {
    epoch++;
    closeWindow();
    draft = null;
    threads = new Map();
    actionIds.forEach(id => ActionHistory.forget(id));
    actionIds = [];
    key = null;
    refused = false;
    PdfView.setMarks([]);
  }

  // Les fichiers d'une extension se chargent ensemble et s'exécutent dans l'ordre où ils arrivent : l'écran des pages (PdfView) n'est sûr d'être là qu'une fois l'extension chargée, donc au premier PDF, jamais à l'exécution de ce fichier.
  let wired = false;
  function wire() {
    if (wired) return;
    wired = true;
    PdfView.onMarkClick(openThread);
    PdfView.onTextKnown(() => PdfReading.locksChanged());
  }

  function start(info) {
    wire();
    stop();
    key = text(info.id);
    reloadSoon();
  }

  PdfReading.onChange((active) => {
    const info = active ? PdfReading.info() : null;
    if (info) start(info); else stop();
  });

  // Pourquoi « Commenter » reste grisé pour ce PDF, ou null : un PDF sans texte (on ne sélectionne que du texte), ou une structure que Grist refuse. Le droit de commenter est celui de js/access-rights.js, grisé à part.
  function lockReason() {
    if (refused) return I18n.t('pdf.locked.structure');
    if (PdfView.hasText() === false) return I18n.t('pdf.locked.noText');
    return null;
  }

  // Les fils du PDF à l'écran tels que l'app les tient (pour les essais).
  const list = () => Array.from(threads.values()).map(thread => ({ id: thread.id, page: thread.page, debut: thread.debut, fin: thread.fin, citation: thread.citation, resolved: thread.resolved, messages: thread.messages.length, at: thread.at }));

  return { comment, lockReason, threads: list, whenIdle };
})();
