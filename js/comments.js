// Commentaires - sélectionner du texte, l'entourer d'un fil de discussion (façon Google Docs) : résoudre, supprimer, répondre. Portée du 2026-09-14 -
// choisie explicitement plus modeste que le suivi des modifications (chantier séparé, cf. discussion) : un commentaire s'AJOUTE par-dessus le texte sans
// jamais le modifier (une simple marque ProseMirror, comme gras/italique), alors que le suivi des modifications doit intercepter CHAQUE frappe/suppression/
// insertion dans tout l'éditeur - un ordre de grandeur plus risqué à improviser.
//
// Architecture : l'ANCRAGE (quelle portée de texte est commentée, + son état résolu/actif) vit DANS le document lui-même via la marque `commentMark`
// (js/editor-nodes.js:createCommentMark) - ProseMirror la déplace/étend/découpe tout seul au fil des modifications, sans code de suivi à écrire. Le
// CONTENU du fil (qui a écrit quoi, quand) vit dans une table Grist compagnon (Publipostage_Commentaires, même principe que Publipostage_LiensTables) -
// partagé entre tous les utilisateurs du document, contrairement à un stockage purement local.
const Comments = (function () {
  const TABLE_NAME = 'Publipostage_Commentaires';
  let editor = null;
  function setEditor(ed) { editor = ed; }

  let currentModeleId = null;
  let threadsByCommentId = {}; // { [commentId]: [{id, auteur, texte, creeLe}, ...] } trié par creeLe croissant

  async function ensureTableExists() {
    const tables = await grist.docApi.listTables();
    if (tables.includes(TABLE_NAME)) return;
    try {
      await grist.docApi.applyUserActions([
        ['AddTable', TABLE_NAME, [
          { id: 'ModeleId', type: 'Int' },
          { id: 'CommentId', type: 'Text' },
          { id: 'Auteur', type: 'Text' },
          { id: 'Texte', type: 'Text' },
          { id: 'CreeLe', type: 'DateTime' },
        ]]
      ]);
    } catch (e) { console.error('[Comments] Erreur création table commentaires', e); }
  }

  // Appelé par main.js à chaque changement de modèle (chargement/nouveau/suppression) - jamais de rafraîchissement continu (contrairement à l'auto-save) :
  // un commentaire est bien moins sensible à la latence que le contenu du document lui-même, pas besoin d'un 2e polling perpétuel superposé au premier.
  async function loadForTemplate(modeleId) {
    currentModeleId = modeleId || null;
    threadsByCommentId = {};
    closePopup();
    if (!modeleId) return;
    await ensureTableExists();
    try {
      const data = await grist.docApi.fetchTable(TABLE_NAME);
      for (let i = 0; i < data.id.length; i++) {
        if (Number(data.ModeleId[i]) !== Number(modeleId)) continue;
        const cid = data.CommentId[i];
        (threadsByCommentId[cid] = threadsByCommentId[cid] || []).push({
          id: data.id[i], auteur: data.Auteur[i] || '', texte: data.Texte[i] || '', creeLe: data.CreeLe[i] || '',
        });
      }
      Object.keys(threadsByCommentId).forEach(cid => threadsByCommentId[cid].sort((a, b) => String(a.creeLe).localeCompare(String(b.creeLe))));
    } catch (e) {
      console.error('[Comments] Erreur chargement commentaires', e);
      threadsByCommentId = {};
    }
  }

  async function postMessage(commentId, texte) {
    const trimmed = (texte || '').trim();
    if (!trimmed) return false;
    if (!currentModeleId) return false;
    await ensureTableExists();
    let auteur = '';
    try { auteur = await GristAPI.getCurrentUserEmail(); } catch (e) { /* repli anonyme silencieux, cohérent avec le reste de l'app (chip #Email) */ }
    const creeLe = new Date().toISOString();
    let newId = null;
    try {
      const result = await grist.docApi.applyUserActions([
        ['AddRecord', TABLE_NAME, null, { ModeleId: currentModeleId, CommentId: commentId, Auteur: auteur, Texte: trimmed, CreeLe: creeLe }]
      ]);
      newId = (result && result.retValues) ? result.retValues[0] : null;
    } catch (e) { console.error('[Comments] Erreur enregistrement du message', e); return false; }
    // `id` (la ligne Grist réelle) DOIT être capturé ici - sans lui, deleteThreadRecords() ne peut pas retrouver quoi supprimer pour un message posté
    // pendant CETTE session (jamais rechargé depuis Grist) : "Supprimer" retirerait la marque du document mais laisserait le message orphelin dans la table.
    (threadsByCommentId[commentId] = threadsByCommentId[commentId] || []).push({ id: newId, auteur, texte: trimmed, creeLe });
    return true;
  }

  // Un seul niveau (pas de vraie hiérarchie parent/enfant) - tous les messages d'un même fil partagent le même CommentId, triés par date. Suffisant pour
  // un fil de discussion linéaire façon Google Docs ; pas de réponses imbriquées les unes dans les autres.
  async function deleteThreadRecords(commentId) {
    const rows = (threadsByCommentId[commentId] || []).filter(r => r.id != null);
    delete threadsByCommentId[commentId];
    if (!rows.length) return;
    try { await grist.docApi.applyUserActions(rows.map(r => ['RemoveRecord', TABLE_NAME, r.id])); }
    catch (e) { console.error('[Comments] Erreur suppression du fil', e); }
  }

  // Scanne le document pour toutes les portées de texte marquées `commentId` - fusionne les portions adjacentes en une seule plage. Plusieurs plages
  // (plutôt qu'une seule supposée) : reste correct même si une frappe a un jour fragmenté la marque en plusieurs morceaux nom-adjacents.
  function findMarkRanges(commentId) {
    const ranges = [];
    let current = null;
    editor.state.doc.descendants((node, pos) => {
      if (!node.isText) { current = null; return; }
      const mark = node.marks.find(m => m.type.name === 'commentMark' && m.attrs.id === commentId);
      if (!mark) { current = null; return; }
      if (current && current.end === pos) current.end = pos + node.nodeSize;
      else { current = { start: pos, end: pos + node.nodeSize, mark }; ranges.push(current); }
    });
    return ranges;
  }
  // Retire/pose une marque par INSTANCE exacte (type+attrs, via Mark.eq()), jamais par type seul - deux fils de discussion indépendants peuvent
  // légitimement se chevaucher sur une même portion de texte (cf. `excludes: ''`), un removeMark par type seul aurait aussi arraché l'AUTRE fil.
  function setResolved(commentId, resolved) {
    const ranges = findMarkRanges(commentId);
    if (!ranges.length) return;
    const tr = editor.state.tr;
    ranges.forEach(r => {
      tr.removeMark(r.start, r.end, r.mark);
      tr.addMark(r.start, r.end, r.mark.type.create(Object.assign({}, r.mark.attrs, { resolved })));
    });
    editor.view.dispatch(tr);
  }
  function removeMarkFromDoc(commentId) {
    const ranges = findMarkRanges(commentId);
    if (!ranges.length) return;
    const tr = editor.state.tr;
    ranges.forEach(r => tr.removeMark(r.start, r.end, r.mark));
    editor.view.dispatch(tr);
  }

  // === Popup (mêmes mécaniques d'ouverture/positionnement que #v2-footnote-popup, js/editor.js - fermeture UNIQUEMENT via une action explicite, jamais au
  // clic extérieur : leçon déjà tirée sur ce projet, 3 régressions passées sur ce même piège pour le popup de note de bas de page). ===
  let popupBox = null;
  let popupCommentId = null;
  let popupIsNewThread = false; // true tant qu'un tout nouveau fil n'a pas reçu son premier message - Annuler retire alors la marque posée à sa création.

  function ensurePopupBox() {
    if (popupBox) return popupBox;
    popupBox = document.createElement('div');
    popupBox.id = 'v2-comment-popup';
    popupBox.style.display = 'none';
    document.body.appendChild(popupBox);
    return popupBox;
  }

  function closePopup() {
    if (popupIsNewThread && popupCommentId && !(threadsByCommentId[popupCommentId] || []).length) removeMarkFromDoc(popupCommentId);
    popupCommentId = null;
    popupIsNewThread = false;
    if (popupBox) popupBox.style.display = 'none';
  }

  function formatWhen(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleString(I18n.getLang() === 'en' ? 'en-US' : 'fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function renderPopup(commentId, resolved) {
    const box = ensurePopupBox();
    const messages = threadsByCommentId[commentId] || [];
    box.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'v2-comment-popup-header';
    const badge = document.createElement('span');
    badge.className = 'v2-comment-popup-badge' + (resolved ? ' is-resolved' : '');
    badge.textContent = resolved ? I18n.t('comments.resolvedBadge') : I18n.t('comments.activeBadge');
    header.appendChild(badge);
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'v2-comment-popup-close';
    closeBtn.textContent = '×';
    closeBtn.setAttribute('aria-label', I18n.t('comments.close'));
    closeBtn.addEventListener('mousedown', event => { event.preventDefault(); closePopup(); });
    header.appendChild(closeBtn);
    box.appendChild(header);

    const list = document.createElement('div');
    list.className = 'v2-comment-popup-list';
    messages.forEach(m => {
      const item = document.createElement('div');
      item.className = 'v2-comment-popup-message';
      const meta = document.createElement('div');
      meta.className = 'v2-comment-popup-meta';
      meta.textContent = (m.auteur || I18n.t('comments.anonymous')) + ' · ' + formatWhen(m.creeLe);
      item.appendChild(meta);
      const body = document.createElement('div');
      body.className = 'v2-comment-popup-text';
      body.textContent = m.texte;
      item.appendChild(body);
      list.appendChild(item);
    });
    box.appendChild(list);

    const replyArea = document.createElement('textarea');
    replyArea.className = 'v2-comment-popup-reply';
    replyArea.rows = 2;
    replyArea.placeholder = messages.length ? I18n.t('comments.replyPlaceholder') : I18n.t('comments.firstMessagePlaceholder');
    replyArea.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); closePopup(); }
    });
    box.appendChild(replyArea);

    const actions = document.createElement('div');
    actions.className = 'v2-comment-popup-actions';

    if (!messages.length) {
      // Fil tout juste créé, jamais publié - seule action possible : publier le 1er message (ou fermer/Échap, qui retire la marque via closePopup()).
      const postBtn = document.createElement('button');
      postBtn.type = 'button';
      postBtn.className = 'v2-comment-popup-post';
      postBtn.textContent = I18n.t('comments.post');
      postBtn.addEventListener('mousedown', async event => {
        event.preventDefault();
        const ok = await postMessage(commentId, replyArea.value);
        if (ok) { popupIsNewThread = false; renderPopup(commentId, resolved); }
      });
      actions.appendChild(postBtn);
    } else {
      const replyBtn = document.createElement('button');
      replyBtn.type = 'button';
      replyBtn.className = 'v2-comment-popup-post';
      replyBtn.textContent = I18n.t('comments.reply');
      replyBtn.addEventListener('mousedown', async event => {
        event.preventDefault();
        const ok = await postMessage(commentId, replyArea.value);
        if (ok) renderPopup(commentId, resolved);
      });
      actions.appendChild(replyBtn);

      const resolveBtn = document.createElement('button');
      resolveBtn.type = 'button';
      resolveBtn.className = 'v2-comment-popup-resolve';
      resolveBtn.textContent = resolved ? I18n.t('comments.reopen') : I18n.t('comments.resolve');
      resolveBtn.addEventListener('mousedown', event => {
        event.preventDefault();
        setResolved(commentId, !resolved);
        renderPopup(commentId, !resolved);
      });
      actions.appendChild(resolveBtn);

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'v2-comment-popup-delete';
      deleteBtn.textContent = I18n.t('comments.deleteThread');
      deleteBtn.addEventListener('mousedown', async event => {
        event.preventDefault();
        if (!confirm(I18n.t('comments.confirmDelete'))) return;
        await deleteThreadRecords(commentId);
        removeMarkFromDoc(commentId);
        popupCommentId = null;
        popupIsNewThread = false;
        box.style.display = 'none';
      });
      actions.appendChild(deleteBtn);
    }
    box.appendChild(actions);
    return { box, replyArea };
  }

  function positionPopup(box, anchorEl) {
    try {
      const rect = anchorEl.getBoundingClientRect();
      const boxWidth = 280; // cf. #v2-comment-popup { width: 280px } (editor-v2.css)
      const boxHeightEstimate = 180;
      let left = rect.left + window.scrollX;
      let top = rect.bottom + window.scrollY + 6;
      const minLeft = window.scrollX + 4;
      const minTop = window.scrollY + 4;
      const maxLeft = Math.max(minLeft, window.scrollX + window.innerWidth - boxWidth - 8);
      const maxTop = Math.max(minTop, window.scrollY + window.innerHeight - boxHeightEstimate - 8);
      left = Math.min(Math.max(left, minLeft), maxLeft);
      top = Math.min(Math.max(top, minTop), maxTop);
      box.style.position = 'absolute';
      box.style.left = left + 'px';
      box.style.top = top + 'px';
    } catch (e) {
      box.style.position = 'fixed';
      box.style.left = '40%';
      box.style.top = '30%';
    }
  }

  function openThreadView(commentId, anchorEl, resolved) {
    if (popupCommentId && popupCommentId !== commentId) closePopup();
    popupCommentId = commentId;
    popupIsNewThread = false;
    const { box } = renderPopup(commentId, resolved);
    positionPopup(box, anchorEl);
    box.style.display = 'block';
  }

  function openComposer(commentId, anchorEl) {
    if (popupCommentId && popupCommentId !== commentId) closePopup();
    popupCommentId = commentId;
    popupIsNewThread = true;
    const { box, replyArea } = renderPopup(commentId, false);
    positionPopup(box, anchorEl);
    box.style.display = 'block';
    setTimeout(() => { replyArea.focus(); }, 0); // cf. footnote popup : focus différé, sinon écrasé par le refocus de .tiptap juste après le mousedown déclencheur
  }

  function insertCommentAtSelection() {
    if (!editor) return;
    if (editor.state.selection.empty) { alert(I18n.t('comments.selectTextFirst')); return; }
    if (!currentModeleId) { alert(I18n.t('comments.saveTemplateFirst')); return; }
    const id = 'cm-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    editor.chain().focus().setMark('commentMark', { id, resolved: false }).run();
    const el = editor.view.dom.querySelector('.comment-mark[data-comment-id="' + id + '"]');
    openComposer(id, el || editor.view.dom);
  }

  // Délégué sur editor.view.dom (pas un listener par marque - une MARQUE n'a pas de NodeView comme un nœud atome, cf. footnoteRef). Pas de
  // preventDefault() : contrairement à un nœud atome non éditable, le texte commenté reste normalement éditable - le clic doit AUSSI positionner le
  // curseur normalement, l'ouverture du popup n'est qu'un effet en plus.
  function wireClickToOpen() {
    if (!editor) return;
    editor.view.dom.addEventListener('mousedown', event => {
      const el = event.target.closest('.comment-mark');
      if (!el) return;
      const id = el.getAttribute('data-comment-id');
      if (!id) return;
      openThreadView(id, el, el.getAttribute('data-resolved') === 'true');
    });
  }

  return { setEditor, loadForTemplate, insertCommentAtSelection, wireClickToOpen };
})();
