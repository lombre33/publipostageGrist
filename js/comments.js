// Commentaires : sélectionner du texte et l'entourer d'un fil de discussion (façon Google Docs), le résoudre, le supprimer, y répondre. Un
// commentaire s'ajoute par-dessus le texte sans jamais le modifier (une simple marque ProseMirror, comme le gras), là où le suivi des modifications
// doit intercepter chaque frappe de l'éditeur.
//
// L'ancrage (quelle portée de texte est commentée, son état résolu ou actif) vit dans le document lui-même, par la marque `commentMark`
// (js/editor-nodes.js:createCommentMark) : ProseMirror la déplace, l'étend et la découpe au fil des modifications, sans code de suivi. Le contenu du
// fil (qui a écrit quoi, quand) vit dans une table Grist compagnon (Publipostage_Commentaires, comme Publipostage_LiensTables), partagée entre toutes
// les personnes du document, contrairement à un stockage local.
const Comments = (function () {
  const TABLE_NAME = 'Publipostage_Commentaires';
  let editor = null;
  function setEditor(ed) { editor = ed; }

  let currentModeleId = null;
  let threadsByCommentId = {}; // { [commentId]: [{id, auteur, texte, creeLe}, ...] } trié par creeLe croissant

  // Droits par personne (js/access-rights.js), posés par js/main.js:applyCommentsPermissions. `readerMode` : le mode Lecture est affiché avec les
  // commentaires autorisés, qu'il soit imposé par la lecture seule ou choisi ; ils y sont visibles et utilisables, et Commenter y agit sur le texte
  // sélectionné dans la Lecture, plus sur l'éditeur masqué. En Édition, false.
  let canComment = true;
  let readerMode = false;
  // Fournis par js/main.js : `save` enregistre le modèle après un changement de marque fait depuis le mode Lecture (l'auto-save n'écrit rien en
  // lecture seule) et renvoie true une fois enregistré, false si le modèle a changé ailleurs entre-temps ou si l'écriture échoue ; `refresh`
  // redessine le mode Lecture pour montrer la marque ajoutée, résolue ou retirée.
  let readerHooks = { save: null, refresh: null };
  let readerRoot = null; // #reader-container, retenu par wireReader

  function setPermissions(next) {
    const nextCanComment = !!(next && next.canComment);
    const nextReaderMode = !!(next && next.readerMode);
    if (nextCanComment === canComment && nextReaderMode === readerMode) return;
    closePopup();
    canComment = nextCanComment;
    readerMode = nextReaderMode;
    readerRange = null;
  }
  function isReaderMode() { return readerMode; }
  function setReaderHooks(hooks) { readerHooks = Object.assign({ save: null, refresh: null }, hooks); }
  // Hors mode Lecture, rien à faire ici : l'auto-save (ou Enregistrer) emporte la marque avec le reste du document, comme avant.
  async function saveReaderAnchors() {
    if (!readerMode || !readerHooks.save) return true;
    try { return !!(await readerHooks.save()); } catch (e) { console.error('[Comments] enregistrement du modèle impossible', e); return false; }
  }
  function refreshReader() {
    if (!readerMode || !readerHooks.refresh) return Promise.resolve();
    return Promise.resolve(readerHooks.refresh()).catch(e => console.error('[Comments] rafraîchissement du mode Lecture impossible', e));
  }
  // Marque affichée d'un fil : en readerMode, celle du mode Lecture - l'éditeur y est masqué, ses marques n'ont aucune position (un popup placé
  // contre elles partait dans le coin haut gauche).
  function markElement(commentId) {
    const root = readerMode && readerRoot ? readerRoot : editor.view.dom;
    return root.querySelector('.comment-mark[data-comment-id="' + commentId + '"]');
  }

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
      if (typeof PageTree !== 'undefined') PageTree.afterTableCreated(TABLE_NAME);
    } catch (e) { console.error('[Comments] Erreur création table commentaires', e); }
  }

  // Appelé par js/main.js à chaque changement de modèle (chargement, nouveau, suppression), sans rafraîchissement continu : un commentaire est bien
  // moins sensible à la latence que le contenu du document, pas besoin d'un deuxième polling par-dessus l'enregistrement automatique.
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
    // `id` (la ligne Grist réelle) est capturé ici : sans lui, deleteThreadRecords() ne retrouve pas un message posté pendant cette session (jamais
    // rechargé depuis Grist), et « Supprimer » retirerait la marque en laissant le message orphelin dans la table.
    (threadsByCommentId[commentId] = threadsByCommentId[commentId] || []).push({ id: newId, auteur, texte: trimmed, creeLe });
    return true;
  }

  // Un seul niveau : tous les messages d'un même fil partagent le même CommentId, triés par date (fil linéaire façon Google Docs, pas de réponses
  // imbriquées).
  async function deleteThreadRecords(commentId) {
    const rows = (threadsByCommentId[commentId] || []).filter(r => r.id != null);
    delete threadsByCommentId[commentId];
    if (!rows.length) return;
    try { await grist.docApi.applyUserActions(rows.map(r => ['RemoveRecord', TABLE_NAME, r.id])); }
    catch (e) { console.error('[Comments] Erreur suppression du fil', e); }
  }

  // Toutes les portées de texte marquées `commentId`, les portions adjacentes fusionnées en une plage. Plusieurs plages plutôt qu'une seule supposée
  // : reste correct si une frappe a fragmenté la marque en morceaux non adjacents. Une bulle #Variable ou un chip (nœud en ligne sans texte) compte
  // aussi : commenter la seule valeur d'une variable en mode Lecture ne marque que lui.
  function findMarkRanges(commentId) {
    const ranges = [];
    let current = null;
    editor.state.doc.descendants((node, pos) => {
      if (!node.isInline) { current = null; return; }
      const mark = node.marks.find(m => m.type.name === 'commentMark' && m.attrs.id === commentId);
      if (!mark) { current = null; return; }
      if (current && current.end === pos) current.end = pos + node.nodeSize;
      else { current = { start: pos, end: pos + node.nodeSize, mark }; ranges.push(current); }
    });
    return ranges;
  }
  // Retire ou pose une marque par instance exacte (type et attributs, via Mark.eq()), jamais par type seul : deux fils indépendants peuvent se
  // chevaucher sur une même portion de texte (cf. `excludes: ''`), et un removeMark par type aurait aussi arraché l'autre fil.
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
    if (!ranges.length) return false;
    const tr = editor.state.tr;
    ranges.forEach(r => tr.removeMark(r.start, r.end, r.mark));
    editor.view.dispatch(tr);
    return true;
  }
  // Remet des plages relevées par findMarkRanges juste avant un removeMarkFromDoc - seules des marques ont changé entre-temps, les positions
  // tiennent.
  function restoreMarkRanges(ranges) {
    if (!ranges.length) return;
    const tr = editor.state.tr;
    ranges.forEach(r => tr.addMark(r.start, r.end, r.mark));
    editor.view.dispatch(tr);
  }

  // Popup : mêmes mécaniques d'ouverture et de positionnement que #v2-footnote-popup (js/editor.js) ; il ne se ferme que par une action explicite,
  // jamais au clic extérieur, comme celui des notes de bas de page.
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

  function hidePopup() {
    popupCommentId = null;
    popupIsNewThread = false;
    if (popupBox) popupBox.style.display = 'none';
  }

  function closePopup() {
    let removed = false;
    if (popupIsNewThread && popupCommentId && !(threadsByCommentId[popupCommentId] || []).length) removed = removeMarkFromDoc(popupCommentId);
    hidePopup();
    // Fil abandonné avant son premier message : sa marque n'a jamais été enregistrée, il suffit de redessiner le mode Lecture sans elle.
    if (removed) refreshReader();
  }

  function formatWhen(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleString(I18n.getLang() === 'en' ? 'en-US' : 'fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function element(tag, className, text) {
    const el = document.createElement(tag);
    el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }

  // Un bouton d'action du popup : il réagit au mousedown (pas au click, comme celui des notes de bas de page) et se grise pour qui ne peut pas
  // commenter.
  function popupButton(className, label, onPress) {
    const btn = element('button', className, label);
    btn.type = 'button';
    btn.disabled = !canComment;
    btn.addEventListener('mousedown', async event => {
      event.preventDefault();
      if (canComment) await onPress();
    });
    return btn;
  }

  function renderPopup(commentId, resolved) {
    const box = ensurePopupBox();
    const messages = threadsByCommentId[commentId] || [];
    box.innerHTML = '';

    const badge = element('span', 'v2-comment-popup-badge' + (resolved ? ' is-resolved' : ''));
    badge.textContent = I18n.t(resolved ? 'comments.resolvedBadge' : 'comments.activeBadge');
    const closeBtn = element('button', 'v2-comment-popup-close', '×');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', I18n.t('comments.close'));
    closeBtn.addEventListener('mousedown', event => { event.preventDefault(); closePopup(); });
    const header = element('div', 'v2-comment-popup-header');
    header.append(badge, closeBtn);

    const list = element('div', 'v2-comment-popup-list');
    messages.forEach(m => {
      const item = element('div', 'v2-comment-popup-message');
      const meta = element('div', 'v2-comment-popup-meta', (m.auteur || I18n.t('comments.anonymous')) + ' · ' + formatWhen(m.creeLe));
      item.append(meta, element('div', 'v2-comment-popup-text', m.texte));
      list.appendChild(item);
    });

    const replyArea = element('textarea', 'v2-comment-popup-reply');
    replyArea.rows = 2;
    replyArea.placeholder = I18n.t(messages.length ? 'comments.replyPlaceholder' : 'comments.firstMessagePlaceholder');
    // Commentaires non autorisés pour cette personne : le fil reste lisible, la saisie et les actions sont grisées (jamais retirées).
    replyArea.disabled = !canComment;
    replyArea.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); closePopup(); }
    });

    const actions = element('div', 'v2-comment-popup-actions');
    if (!messages.length) {
      // Fil tout juste créé, jamais publié - seule action possible : publier le 1er message (ou fermer/Échap, qui retire la marque via closePopup()).
      actions.appendChild(popupButton('v2-comment-popup-post', I18n.t('comments.post'), async () => {
        if (!replyArea.value.trim()) return;
        // Mode Lecture : la marque posée par insertCommentFromReader n'existe encore que dans l'éditeur ; elle est enregistrée avant le message, pour
        // qu'un échec (modèle changé ailleurs entre-temps) n'écrive rien du tout.
        if (!(await saveReaderAnchors())) { alert(I18n.t('comments.saveError')); return; }
        const ok = await postMessage(commentId, replyArea.value);
        if (ok) { popupIsNewThread = false; renderPopup(commentId, resolved); return; }
        if (readerMode) {
          // Message refusé alors que la marque vient d'être enregistrée : on la retire pour ne pas laisser un fil vide surligné dans le modèle.
          removeMarkFromDoc(commentId);
          await saveReaderAnchors();
          hidePopup();
          refreshReader();
          alert(I18n.t('comments.saveError'));
        }
      }));
    } else {
      actions.append(
        popupButton('v2-comment-popup-post', I18n.t('comments.reply'), async () => {
          if (await postMessage(commentId, replyArea.value)) renderPopup(commentId, resolved);
        }),
        popupButton('v2-comment-popup-resolve', I18n.t(resolved ? 'comments.reopen' : 'comments.resolve'), async () => {
          setResolved(commentId, !resolved);
          if (!(await saveReaderAnchors())) { setResolved(commentId, resolved); alert(I18n.t('comments.saveError')); return; }
          renderPopup(commentId, !resolved);
          refreshReader();
        }),
        popupButton('v2-comment-popup-delete', I18n.t('comments.deleteThread'), async () => {
          if (!(await Dialogs.confirm({ title: I18n.t('comments.confirmDelete'), confirmLabel: I18n.t('common.delete'), danger: true }))) return;
          // Mode Lecture : la marque retirée est d'abord enregistrée dans le modèle, les lignes du fil ne partent qu'ensuite - un échec remet la
          // marque, jamais un fil supprimé dont la marque resterait surlignée.
          const ranges = readerMode ? findMarkRanges(commentId) : [];
          if (readerMode) {
            removeMarkFromDoc(commentId);
            if (!(await saveReaderAnchors())) { restoreMarkRanges(ranges); alert(I18n.t('comments.saveError')); return; }
          }
          await deleteThreadRecords(commentId);
          if (!readerMode) removeMarkFromDoc(commentId);
          hidePopup();
          refreshReader();
        }),
      );
    }
    box.append(header, list, replyArea, actions);
    // Popup déjà ouvert dont le contenu change de hauteur (message publié, réponse, fil résolu) : replacé pour rester dans la fenêtre. Ancre relue
    // par son id - ProseMirror re-rend la marque à chaque transaction (setResolved), l'élément d'origine peut ne plus être dans le document.
    if (box.style.display !== 'none' && editor) {
      const anchor = markElement(commentId);
      if (anchor) positionPopup(box, anchor);
    }
    return { box, replyArea };
  }

  // Popup déjà affiché : sa hauteur réelle est mesurée (ViewportFit.placePopup), car une estimation fixe laisserait un fil de quelques réponses
  // sortir sous le bas du panneau.
  function positionPopup(box, anchorEl) {
    try {
      ViewportFit.placePopup(box, anchorEl.getBoundingClientRect(), { gap: 6 });
    } catch (e) {
      box.style.position = 'fixed';
      box.style.left = '40%';
      box.style.top = '30%';
    }
  }

  function openPopup(commentId, anchorEl, resolved, isNewThread) {
    if (popupCommentId && popupCommentId !== commentId) closePopup();
    popupCommentId = commentId;
    popupIsNewThread = isNewThread;
    const { box, replyArea } = renderPopup(commentId, resolved);
    box.style.display = 'block';
    positionPopup(box, anchorEl);
    // cf. footnote popup : focus différé, sinon écrasé par le refocus de .tiptap juste après le mousedown déclencheur
    if (isNewThread) setTimeout(() => { replyArea.focus(); }, 0);
  }
  function openThreadView(commentId, anchorEl, resolved) { openPopup(commentId, anchorEl, resolved, false); }
  function openComposer(commentId, anchorEl) { openPopup(commentId, anchorEl, false, true); }

  // La marque cliquée (dans l'éditeur ou dans la Lecture) ouvre son fil.
  function openMarkThread(el) {
    const id = el.getAttribute('data-comment-id');
    if (id) openThreadView(id, el, el.getAttribute('data-resolved') === 'true');
  }

  function newCommentId() { return 'cm-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function insertCommentAtSelection() {
    if (!editor || !canComment) return;
    if (readerMode) { insertCommentFromReader(); return; }
    if (editor.state.selection.empty) { alert(I18n.t('comments.selectTextFirst')); return; }
    if (!currentModeleId) { alert(I18n.t('comments.saveTemplateFirst')); return; }
    const id = newCommentId();
    editor.chain().focus().setMark('commentMark', { id, resolved: false }).run();
    openComposer(id, markElement(id) || editor.view.dom);
  }

  // Commentaires en mode Lecture (readerMode). Le mode Lecture montre du HTML résolu (valeurs à la place des #Variable), jamais l'éditeur : pour
  // poser une marque au bon endroit du modèle, chaque texte y porte sa position ProseMirror (data-pp-pos, début du texte) et chaque bulle ou chip la
  // sienne (data-pp-atom), que js/reader-mode.js recopie sur la valeur qui la remplace. Les deux sont préfixées d'un numéro de rendu : une sélection
  // faite sur un rendu dont le document a changé depuis est refusée plutôt que posée au mauvais endroit.
  let pmModel = null;
  let readerRenderVersion = 0;
  const readerDocs = new Map(); // numéro de rendu -> document ProseMirror sérialisé pour ce rendu (les derniers seulement)
  let readerRange = null; // dernière sélection non vide faite dans le mode Lecture - le clic sur le bouton Commenter peut la faire perdre au navigateur

  // Même sortie qu'editor.getHTML() (DOMSerializer du schéma, cf. @tiptap/core getHTMLFromFragment), repères de position en plus. Sous-classe plutôt
  // que la table `nodes` du sérialiseur : prosemirror-model 1.25 écrit les textes sans jamais la consulter (serializeNodeInner). Sous-classe du
  // sérialiseur du schéma (js/track-changes.js, installSerializer), pas de la classe de la bibliothèque : une colonne ou une ligne suivie s'y écrit
  // en attribut de la case (data-tc-*), sinon l'analyseur HTML de la Lecture sort la case de son tableau et sa suppression ne se voit plus.
  let AnnotatingSerializer = null;
  let annotatingBase = null;
  async function buildReaderHtml() {
    if (!editor) return '';
    if (!pmModel) pmModel = await import('prosemirror-model');
    const { DOMSerializer } = pmModel;
    const base = DOMSerializer.fromSchema(editor.schema);
    if (!AnnotatingSerializer || annotatingBase !== base.constructor) {
      annotatingBase = base.constructor;
      AnnotatingSerializer = class extends annotatingBase {
        serializeNodeInner(node, options) {
          if (node.isText) {
            const span = document.createElement('span');
            const tag = this.takeTag(node);
            if (tag) span.setAttribute('data-pp-pos', tag);
            span.textContent = node.text;
            return span;
          }
          const dom = super.serializeNodeInner(node, options);
          if (node.isInline && node.isLeaf && dom.nodeType === 1) {
            const tag = this.takeTag(node);
            if (tag) dom.setAttribute('data-pp-atom', tag);
          }
          return dom;
        }
      };
    }
    const doc = editor.state.doc;
    const version = ++readerRenderVersion;
    readerDocs.set(version, doc);
    readerDocs.forEach((d, v) => { if (v < version - 4) readerDocs.delete(v); });
    // Par objet nœud (un même nœud peut figurer plusieurs fois, ex. un collage répété) : le sérialiseur parcourt le document dans le même ordre que
    // descendants(), chaque occurrence reprend donc la position suivante de sa file.
    const positions = new Map();
    doc.descendants((node, pos) => {
      if (!node.isInline || !node.isLeaf) return;
      const list = positions.get(node);
      if (list) list.push(pos); else positions.set(node, [pos]);
    });
    const serializer = new AnnotatingSerializer(base.nodes, base.marks);
    serializer.takeTag = node => { const list = positions.get(node); return list && list.length ? version + ':' + list.shift() : null; };
    const host = document.createElement('div');
    host.appendChild(serializer.serializeFragment(doc.content, { document }));
    // Même retouche que Editor.getHTML() : la grille n'a pas la ligne vide cachée qui suit son tableau dans l'éditeur, sinon la Lecture lui ajoutait
    // une ligne de blanc.
    return GridEditor.serialize(host.innerHTML);
  }

  function parseReaderTag(value) {
    const i = value ? value.indexOf(':') : -1;
    if (i < 0) return null;
    const version = Number(value.slice(0, i));
    const pos = Number(value.slice(i + 1));
    return (isFinite(version) && isFinite(pos)) ? { version, pos } : null;
  }
  // Bord d'un repère : une bulle/chip compte pour 1 position (nœud atome), un texte pour sa longueur.
  function markerEdge(marker, side) {
    const isAtom = marker.hasAttribute('data-pp-atom');
    const tag = parseReaderTag(marker.getAttribute(isAtom ? 'data-pp-atom' : 'data-pp-pos'));
    if (!tag) return null;
    const size = isAtom ? 1 : marker.textContent.length;
    return { version: tag.version, pos: side === 'start' ? tag.pos : tag.pos + size };
  }
  // Extrémité d'une sélection du mode Lecture -> position dans le document : exacte dans un texte, bord de la valeur pour une bulle/chip résolue,
  // sinon le repère le plus proche vers l'intérieur de la sélection (début : premier repère qui suit, fin : dernier qui précède) - une sélection qui
  // commence dans un sommaire ou une marge ne déborde donc jamais au-delà de ce qui a été sélectionné.
  function readerPointToPos(content, node, offset, side) {
    const el = node.nodeType === 3 ? node.parentElement : node;
    const atom = el && el.closest('[data-pp-atom]');
    if (atom && content.contains(atom)) return markerEdge(atom, side);
    const textEl = el && el.closest('[data-pp-pos]');
    if (textEl && content.contains(textEl)) {
      const tag = parseReaderTag(textEl.getAttribute('data-pp-pos'));
      const length = textEl.textContent.length;
      if (tag) return { version: tag.version, pos: tag.pos + (node.nodeType === 3 ? Math.min(offset, length) : (offset > 0 ? length : 0)) };
    }
    const probe = document.createRange();
    probe.setStart(node, offset);
    const markers = Array.from(content.querySelectorAll('[data-pp-pos], [data-pp-atom]'));
    if (side === 'start') {
      const next = markers.find(m => probe.comparePoint(m, 0) >= 0);
      return next ? markerEdge(next, 'start') : null;
    }
    for (let i = markers.length - 1; i >= 0; i--) {
      if (probe.comparePoint(markers[i], markers[i].childNodes.length) <= 0) return markerEdge(markers[i], 'end');
    }
    return null;
  }
  function readerSelectedRange(root) {
    const sel = window.getSelection();
    if (sel && sel.rangeCount && !sel.isCollapsed) {
      const range = sel.getRangeAt(0);
      if (root.contains(range.commonAncestorContainer)) return range;
    }
    if (readerRange && readerRange.startContainer.isConnected && readerRange.endContainer.isConnected && root.contains(readerRange.commonAncestorContainer)) return readerRange;
    return null;
  }
  // { from, to, rect } dans le document de l'éditeur, { stale: true } si le rendu affiché ne correspond plus au document, null sans texte
  // sélectionné.
  function readerSelectionToDocRange() {
    const root = document.getElementById('reader-container');
    const content = root && root.querySelector('.reader-content');
    if (!content) return null;
    const range = readerSelectedRange(root);
    if (!range) return null;
    const start = readerPointToPos(content, range.startContainer, range.startOffset, 'start');
    const end = readerPointToPos(content, range.endContainer, range.endOffset, 'end');
    if (!start || !end || end.pos <= start.pos) return null;
    if (start.version !== end.version || readerDocs.get(start.version) !== editor.state.doc) return { stale: true };
    return { from: start.pos, to: end.pos, rect: range.getBoundingClientRect() };
  }
  // Ancre de repli du popup (la marque n'est pas encore redessinée, ou introuvable) : un simple objet qui répond à getBoundingClientRect.
  function rectAnchor(rect) { return { getBoundingClientRect: () => rect }; }

  async function insertCommentFromReader() {
    const target = readerSelectionToDocRange();
    if (!target) { alert(I18n.t('comments.selectTextFirst')); return; }
    if (target.stale) { readerRange = null; await refreshReader(); alert(I18n.t('comments.readerChanged')); return; }
    if (!currentModeleId) { alert(I18n.t('comments.saveTemplateFirst')); return; }
    if (popupCommentId) closePopup();
    const id = newCommentId();
    editor.view.dispatch(editor.state.tr.addMark(target.from, target.to, editor.schema.marks.commentMark.create({ id, resolved: false })));
    readerRange = null;
    const sel = window.getSelection();
    if (sel) sel.removeAllRanges();
    await refreshReader();
    openComposer(id, markElement(id) || rectAnchor(target.rect));
  }

  // Branché une seule fois par js/main.js sur #reader-container : ouvre le fil d'une marque cliquée, retient la dernière sélection. Rien ne se passe
  // hors readerMode (les marques n'y sont d'ailleurs pas surlignées, cf. css/access-rights.css).
  function wireReader(container) {
    if (!container) return;
    readerRoot = container;
    document.addEventListener('selectionchange', () => {
      if (!readerMode) return;
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount || sel.isCollapsed) return;
      const range = sel.getRangeAt(0);
      if (container.contains(range.commonAncestorContainer)) readerRange = range.cloneRange();
    });
    container.addEventListener('mouseup', () => {
      if (!readerMode) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) readerRange = null;
    });
    // `click` plutôt que le mousedown de l'éditeur : une sélection qui commence sur un texte déjà commenté ne doit pas ouvrir son fil.
    container.addEventListener('click', event => {
      // pp-reader-comments : posée par js/main.js:renderReader quand ce rendu porte vraiment les commentaires (jamais pour un macro-modèle).
      if (!readerMode || !container.classList.contains('pp-reader-comments')) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;
      const el = event.target.closest && event.target.closest('.comment-mark');
      if (el && container.contains(el)) openMarkThread(el);
    });
  }

  // Délégué sur editor.view.dom (pas un listener par marque : une marque n'a pas de NodeView comme un nœud atome, cf. footnoteRef). Pas de
  // preventDefault() : contrairement à un nœud atome non éditable, le texte commenté reste éditable, et le clic doit aussi positionner le curseur ;
  // l'ouverture du popup n'est qu'un effet en plus.
  function wireClickToOpen() {
    if (!editor) return;
    editor.view.dom.addEventListener('mousedown', event => {
      const el = event.target.closest('.comment-mark');
      if (el) openMarkThread(el);
    });
  }

  return {
    setEditor, loadForTemplate, insertCommentAtSelection, wireClickToOpen,
    setPermissions, isReaderMode, setReaderHooks, buildReaderHtml, wireReader,
  };
})();
