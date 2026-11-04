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
//  - UN PDF REMPLACÉ garde ses fils (la clé ne change pas) : à chaque PDF posé, chaque fil retrouve son passage dans le texte des pages (extensions/lecture-pdf/pdf-anchor.js:relocate) - là où il était, sinon par sa citation (la
//    même page d'abord, puis les autres de proche en proche, le meilleur entourage), page par page sans bloquer la lecture. Ce qu'on retrouve ne s'écrit JAMAIS : l'ancre d'un fil reste celle de sa publication, si bien qu'une version
//    ultérieure qui rend le passage le retrouve. Un fil dont le passage n'est plus nulle part n'est pas effacé : il reste lisible, on peut y répondre, le résoudre et le supprimer, et un bandeau en haut du PDF (« N commentaires sans
//    passage », seulement quand il y en a) en ouvre la liste.
//  - ANNULER et RÉTABLIR (Ctrl + Z, Ctrl + Y, les boutons) couvrent chaque geste par js/action-history.js : publier, répondre, résoudre ou rouvrir, supprimer. Un fil qui a reçu les réponses d'une autre personne depuis n'est pas défait
//    (rien n'est écrit, le coin d'état le dit). Ces actions s'oublient quand le PDF quitte l'écran.
//    PdfComments.comment()    PdfComments.lockReason() -> texte | null    PdfComments.threads() -> [fils]    PdfComments.whenIdle() -> Promise
const PdfComments = (function () {
  const TABLE = Comments.TABLE_NAME;
  const KEY_COLUMN = 'LectureId';
  const kit = Comments.kit;

  let key = null;               // l'identifiant que GFS donne au PDF à l'écran : la clé de ses fils
  let epoch = 0;                // change à chaque PDF : ce qu'une lecture ou une écriture rend après coup n'est plus pour celui de l'écran
  let threads = new Map();      // CommentId -> { id, page, debut, fin, citation, avant, apres, resolved, anchorRow, messages: [{ id, auteur, texte, creeLe }], at, state }
  let draft = null;             // { id, anchor } : le passage choisi par « Commenter », pas encore écrit
  let win = null;               // { id, isNew, anchor } : le fil que la fenêtre montre
  let signature = null;         // ce que la fenêtre montre (résolu, messages) : relue, elle n'est redessinée que si cela a changé
  let refused = false;          // Grist a refusé la structure pour ce PDF : « Commenter » reste grisé
  let busy = false;             // un geste d'écriture est en route
  let actionIds = [];           // les actions d'Annuler / Rétablir de ce PDF
  let pages = 0;                // le nombre de pages du PDF à l'écran
  const placements = new Map(); // CommentId -> { sig, state: 'found' | 'lost', at } : ce que la recherche des passages a trouvé pour une ancre (repart de zéro à chaque PDF ; jamais écrit)
  let pass = 0;                 // le numéro de la recherche des passages en cours : une nouvelle relève l'ancienne
  let placing = Promise.resolve();
  let bar = null;               // le bandeau des fils sans passage : { element, button, text, panel, open }

  // Les écritures et les lectures se font l'une après l'autre : une lecture lancée après une écriture la voit, et deux Ctrl + Z de suite se suivent. `tail` : rendu quand tout est fini (les essais l'attendent).
  let tail = Promise.resolve();
  function enqueue(job) {
    const run = tail.then(job);
    tail = run.catch(() => {});
    return run;
  }
  // Les essais attendent que tout soit fini : les écritures, les lectures, la recherche des passages (une nouvelle relève l'ancienne : on attend la dernière).
  async function whenIdle() {
    for (;;) {
      const seen = placing;
      await tail;
      await seen;
      if (seen === placing) return;
    }
  }

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
        thread = { id: cid, page: NaN, debut: NaN, fin: NaN, citation: '', avant: '', apres: '', resolved: false, anchorRow: null, messages: [], at: null, state: 'pending' };
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
  // Où est le passage de chaque fil dans le PDF à l'écran, et ce que l'écran en montre : les marques des passages trouvés, le bandeau de ceux qui n'ont plus de place, la fenêtre d'un fil.

  // L'ancre d'un fil, en une ligne : une recherche déjà faite pour cette ancre vaut tant qu'elle ne change pas.
  const signatureOf = thread => [thread.page, thread.debut, thread.fin, thread.citation, thread.avant, thread.apres].join('\u0001');

  // Ce qu'on sait du passage d'un fil : { state, at } d'une recherche déjà faite pour cette ancre, sinon « pending » (pas de marque tant qu'on n'a pas regardé le texte du PDF à l'écran). `state` : 'found' (`at` : { page, debut,
  // fin } dans le texte de la page, là où il est maintenant), 'lost' (nulle part dans ce PDF) ou 'pending'.
  function place(thread) {
    const known = placements.get(thread.id);
    if (known && known.sig === signatureOf(thread)) { thread.state = known.state; thread.at = known.at; return; }
    thread.state = 'pending';
    thread.at = null;
  }

  // Un fil qu'on vient de publier est là où la personne l'a choisi : rien à chercher.
  function placedWhereChosen(thread) {
    thread.at = { page: thread.page, debut: thread.debut, fin: thread.fin };
    thread.state = 'found';
    placements.set(thread.id, { sig: signatureOf(thread), state: 'found', at: thread.at });
  }

  function showMarks() {
    const marks = [];
    threads.forEach((thread) => { if (thread.at) marks.push({ id: thread.id, page: thread.at.page, debut: thread.at.debut, fin: thread.at.fin, resolved: thread.resolved }); });
    if (draft) marks.push({ id: draft.id, page: draft.anchor.page, debut: draft.anchor.debut, fin: draft.anchor.fin, resolved: false });
    PdfView.setMarks(marks);
  }

  // Ce que l'écran dit des fils : les marques, et le bandeau des fils sans passage.
  function render() {
    showMarks();
    showBar();
  }

  // La recherche des passages : pour chaque fil qui n'a pas encore de place, dans le texte des pages du PDF à l'écran (extensions/lecture-pdf/pdf-anchor.js:relocate : là où il était, sinon par sa citation, la page d'origine
  // d'abord). Elle ne bloque rien (le navigateur reprend la main entre deux pages, les fils des pages à l'écran passent d'abord), ne s'écrit nulle part et s'arrête quand le PDF change, ou quand ses pages ne sont plus posées
  // (un fil que la recherche n'a pas fini reste « pending » et sera repris à la pose suivante : jamais « sans passage » par défaut).
  async function placeAll(run, mine) {
    const cancelled = () => run !== pass || mine !== epoch || !PdfView.isMounted();
    // Les pages ne sont pas encore posées (les fils se lisent plus vite que le PDF ne se pose) : rien à chercher, la pose relance la recherche (PdfView.onMounted). Un PDF dont on ne sait pas les pages ne dit rien d'aucun passage : pas de « sans passage » par défaut.
    if (cancelled() || pages < 1) return;
    const shown = PdfView.pagesShown();
    const gap = thread => (Number.isFinite(thread.page) && shown.length ? Math.min(...shown.map(n => Math.abs(n - thread.page))) : 0);
    const todo = Array.from(threads.values()).filter(thread => thread.state === 'pending').sort((a, b) => (gap(a) - gap(b)) || ((a.page || 0) - (b.page || 0)));
    for (const thread of todo) {
      if (cancelled()) return;
      const found = await PdfAnchor.relocate(thread, pages, PdfView.pageText, { cancelled });
      if (cancelled()) return;
      const current = threads.get(thread.id);
      if (!current || signatureOf(current) !== signatureOf(thread)) continue;
      const verdict = found ? { state: 'found', at: found } : { state: 'lost', at: null };
      placements.set(current.id, { sig: signatureOf(current), state: verdict.state, at: verdict.at });
      current.state = verdict.state;
      current.at = verdict.at;
      render();
      syncWindow();
    }
  }
  function placeSoon() {
    const run = ++pass;
    placing = placeAll(run, epoch).catch((e) => { console.warn('[PdfComments] passages non cherchés', e); });
    return placing;
  }

  // Les fils sans passage, dans l'ordre du PDF (la page où ils étaient), puis de leur date.
  const lostThreads = () => Array.from(threads.values()).filter(thread => thread.state === 'lost')
    .sort((a, b) => ((a.page || 0) - (b.page || 0)) || byDate(a.messages[0] || {}, b.messages[0] || {}));

  // Le bandeau : une ligne collée en haut des pages, seulement quand un fil a perdu son passage (la barre d'outils ne change pas) ; un clic ouvre la liste de ces fils, un clic sur l'un ouvre sa fenêtre.
  function buildBar() {
    const element = Dom.el('div', 'pp-pdf-bar');
    element.setAttribute('role', 'region');
    element.setAttribute('aria-label', I18n.t('pdf.comment.lost.region'));
    const button = Dom.el('button', 'pp-pdf-bar-button');
    button.type = 'button';
    button.setAttribute('aria-expanded', 'false');
    const label = Dom.el('span', 'pp-pdf-bar-text');
    const caret = Dom.el('span', 'pp-pdf-bar-caret');
    caret.setAttribute('aria-hidden', 'true');
    button.append(label, caret);
    const panel = Dom.el('div', 'pp-pdf-bar-panel');
    panel.hidden = true;
    const made = { element, button, text: label, panel, open: false };
    button.addEventListener('click', () => { if (made.open) closePanel(); else openPanel(); });
    element.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !made.open) return;
      event.preventDefault();
      event.stopPropagation();
      closePanel();
      button.focus();
    });
    element.append(button, panel);
    return made;
  }

  function drawPanel() {
    bar.panel.replaceChildren();
    lostThreads().forEach((thread) => {
      const row = Dom.el('button', 'pp-pdf-bar-row');
      row.type = 'button';
      row.setAttribute('data-comment-id', thread.id);
      const quote = Dom.el('span', 'pp-pdf-bar-quote');
      quote.textContent = thread.citation || (thread.messages[0] ? thread.messages[0].texte : '');
      const meta = Dom.el('span', 'pp-pdf-bar-meta');
      meta.textContent = [Number.isFinite(thread.page) ? I18n.t('pdf.comment.lost.page', { page: thread.page }) : '', thread.resolved ? I18n.t('comments.resolvedBadge') : ''].filter(Boolean).join(' · ');
      row.append(quote, meta);
      row.addEventListener('click', () => openLost(thread.id));
      bar.panel.appendChild(row);
    });
  }

  function outsideBar(event) { if (bar && !bar.element.contains(event.target)) closePanel(); }
  function openPanel() {
    if (!bar || bar.open) return;
    bar.open = true;
    bar.panel.hidden = false;
    bar.button.setAttribute('aria-expanded', 'true');
    drawPanel();
    document.addEventListener('mousedown', outsideBar, true);
  }
  function closePanel() {
    if (!bar || !bar.open) return;
    bar.open = false;
    bar.panel.hidden = true;
    bar.button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('mousedown', outsideBar, true);
  }

  function showBar() {
    const lost = lostThreads();
    if (!lost.length) { dropBar(); return; }
    if (!bar) { bar = buildBar(); PdfView.setBar(bar.element); }
    bar.text.textContent = I18n.t('pdf.comment.lost.banner', { n: lost.length });
    if (bar.open) drawPanel();
  }
  function dropBar() {
    if (!bar) return;
    closePanel();
    PdfView.setBar(null);
    bar = null;
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

  // Ce que la fenêtre d'un fil sans passage dit en plus, en deux lignes (elle doit encore montrer sa saisie et ses boutons à 700x400) : « Passage introuvable » et la page d'avant, puis le passage d'avant - la citation, gardée telle quelle.
  function lostNote(thread) {
    const note = Dom.el('div', 'pp-pdf-lost');
    const title = Dom.el('div', 'pp-pdf-lost-title');
    title.textContent = I18n.t('pdf.comment.lost.title');
    if (Number.isFinite(thread.page)) {
      const where = Dom.el('span', 'pp-pdf-lost-page');
      where.textContent = ' · ' + I18n.t('pdf.comment.lost.was', { page: thread.page });
      title.appendChild(where);
    }
    note.appendChild(title);
    if (thread.citation) {
      const quote = Dom.el('div', 'pp-pdf-lost-quote');
      quote.textContent = thread.citation;
      note.appendChild(quote);
    }
    return note;
  }

  function drawWindow() {
    const box = kit.box();
    const thread = threads.get(win.id);
    const messages = thread ? thread.messages : [];
    const resolved = !!(thread && thread.resolved);
    const lost = !!thread && thread.state === 'lost';
    signature = JSON.stringify([resolved, lost, messages.map(message => message.id)]);
    box.innerHTML = '';
    const replyArea = kit.replyArea(messages.length > 0, closeWindow);
    box.append(kit.header(resolved, closeWindow), ...(lost ? [lostNote(thread)] : []), kit.list(messages), replyArea, actionsOf(win.id, resolved, messages.length > 0, replyArea));
    return replyArea;
  }

  // La fenêtre se pose contre la marque du passage ; sans marque (un fil sans passage), contre le bandeau qui l'a ouverte. Dans un petit panneau (700x400 sous la barre d'outils) il n'y a pas la place sous le bandeau, et la fenêtre y défilerait sa saisie et
  // ses boutons hors de vue : elle se pose alors contre le bas du panneau, par-dessus le bandeau, tant qu'elle y tient en entier.
  function placeWindow() {
    const box = shownBox();
    if (!box || !win) return;
    const mark = PdfView.markElement(win.id);
    if (mark) { kit.place(box, mark); return; }
    const target = bar ? bar.element : win.anchor;
    kit.place(box, target);
    if (box.scrollHeight > box.clientHeight + 1) {
      const rect = target.getBoundingClientRect();
      const bottom = document.documentElement.clientHeight;
      kit.place(box, rectAnchor({ left: rect.left, right: rect.right, top: bottom, bottom, width: rect.width, height: 0 }));
    }
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
    if (JSON.stringify([!!thread.resolved, thread.state === 'lost', thread.messages.map(message => message.id)]) === signature) return;
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
    placements.forEach((known, id) => { if (!threads.has(id)) placements.delete(id); });
    render();
    syncWindow();
    placeSoon();
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
      placedWhereChosen(thread);
      threads.set(thread.id, thread);
      if (draft && draft.id === thread.id) draft = null;
      // La fenêtre fermée pendant l'écriture ne se rouvre pas : le fil est publié, sa marque est là.
      if (win && win.id === thread.id) { win.isNew = false; drawWindow(); placeWindow(); }
      render();
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
      render();
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
      placements.delete(commentId);
      closeWindow();
      render();
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

  // Un clic sur un fil du bandeau : sa fenêtre s'ouvre contre le bandeau (il n'a pas de marque).
  function openLost(commentId) {
    if (!threads.has(commentId) || !bar) return;
    const anchor = bar.element;
    closePanel();
    showWindow(commentId, false, anchor);
    reloadSoon();
  }

  // ==============================================================================================================================================================================================
  // Le PDF à l'écran arrive, change ou part.

  function stop() {
    epoch++;
    pass++;
    closeWindow();
    dropBar();
    draft = null;
    threads = new Map();
    placements.clear();
    pages = 0;
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
    // Les pages du PDF viennent d'être posées (la première fois, ou de nouveau après une Lecture qui s'est redessinée) : le texte de ses pages se lit, les fils qui n'ont pas encore de place la cherchent.
    PdfView.onMounted(() => { if (key) placeSoon(); });
  }

  function start(info) {
    wire();
    stop();
    key = text(info.id);
    pages = Number(info.pages) || 0;
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
  const list = () => Array.from(threads.values()).map(thread => ({ id: thread.id, page: thread.page, debut: thread.debut, fin: thread.fin, citation: thread.citation, resolved: thread.resolved, messages: thread.messages.length, state: thread.state, at: thread.at }));

  return { comment, lockReason, threads: list, whenIdle };
})();
