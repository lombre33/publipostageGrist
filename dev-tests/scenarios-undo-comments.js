// Suite "undoComments" - Ctrl + Z, Ctrl + Y et les boutons Annuler / Rétablir défont aussi les commentaires (suite de scenarios-undo-suggestions.js : demande d'Antoine du 22/10, « Il doit prendre en compte
// 100% des actions faites dans le widget »). Un fil de commentaires a deux moitiés : sa MARQUE dans le texte (déjà dans l'historique de l'éditeur) et ses MESSAGES, des lignes de la table Grist
// Publipostage_Commentaires, qui n'y étaient pas. Avant : Ctrl + Z après « Supprimer » rendait la marque d'un fil vide (ses messages étaient perdus), après « Publier » il retirait la marque en laissant les lignes
// dans la table, et il ne défaisait jamais une réponse ; un fil refermé avant son premier message laissait deux pas d'Annuler et, entre eux, une marque sans fil.
//
// Les attendus sont ceux de la personne qui défait : publier un fil, y répondre, le supprimer sont chacun UN pas ; Ctrl + Z remet l'état d'avant - la marque ET les lignes -, Ctrl + Y l'état d'après, sans ligne en
// double ni ligne perdue. Les messages que d'autres personnes ont posés dans le même fil ne sont jamais touchés. Tout passe par le vrai popup et ses vrais boutons, comme scenarios-comments.js.
// Le même parcours à la vraie souris et au vrai clavier, dans le panneau de 700x400 : verify-undo-comments-mouse.mjs (undoCommentsMouse).
window.EditorTestSuites = window.EditorTestSuites || {};
window.EditorTestSuites.undoComments = (function () {
  const cases = [];
  const TABLE = 'Publipostage_Commentaires';
  const ed = () => EditorCore.getEditor();
  const stub = () => window.__gristStub;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const verdict = (problems, summary) => ({ pass: problems.length === 0, notes: JSON.stringify({ summary, problems }) });
  function check(problems, label, got, want) { if (!same(got, want)) problems.push(label + ' : ' + JSON.stringify(got) + ' au lieu de ' + JSON.stringify(want)); }

  // Ctrl + Z et Ctrl + Y au vrai clavier de l'éditeur (la touche passe par le raccourci de TipTap, comme sous les doigts).
  function press(key) {
    const event = new KeyboardEvent('keydown', { key, code: 'Key' + key.toUpperCase(), ctrlKey: true, bubbles: true, cancelable: true });
    ed().view.dom.dispatchEvent(event);
    return event.defaultPrevented;
  }
  const undo = () => press('z');
  const redo = () => press('y');
  // Les écritures de la table des fils que le dernier Annuler / Rétablir a lancées, terminées.
  const idle = () => (Comments.whenIdle ? Comments.whenIdle() : null);
  async function settle(h) { await h.sleep(60); await idle(); await h.sleep(60); }

  const popup = () => document.getElementById('v2-comment-popup');
  const popupVisible = () => { const p = popup(); return !!p && p.style.display !== 'none'; };
  const popupTexts = () => (popupVisible() ? Array.from(popup().querySelectorAll('.v2-comment-popup-text')).map(e => e.textContent) : []);
  const popupBadge = () => (popupVisible() ? popup().querySelector('.v2-comment-popup-badge').textContent : null);
  const popupButtonLabel = selector => (popupVisible() && popup().querySelector(selector) ? popup().querySelector(selector).textContent : null);
  const replyArea = () => popup() && popup().querySelector('.v2-comment-popup-reply');

  // Les boutons du popup réagissent au `mousedown` (cf. scenarios-comments.js).
  async function pressPopupButton(h, selector) {
    const btn = popup() && popup().querySelector(selector);
    if (!btn) throw new Error('Bouton de popup introuvable : ' + selector);
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await h.sleep(250);
  }

  // Un commentaire exige un modèle DÉJÀ enregistré.
  async function savedTemplateWithText(h, nom, texte) {
    await h.resetEditor();
    Editor.setHTML('<p>' + texte + '</p>');
    document.getElementById('template-name').value = nom;
    await h.clickButton('btn-save');
    await h.sleep(500);
    return Templates.getCurrentId();
  }
  async function commentFirstParagraph(h) {
    await h.selectAllInElement(document.querySelector('.tiptap p'));
    await h.clickButton('v2-btn-comment');
    await h.sleep(250);
    const mark = document.querySelector('.tiptap .comment-mark');
    return mark ? mark.getAttribute('data-comment-id') : null;
  }
  async function post(h, texte) {
    const area = replyArea();
    if (!area) throw new Error('composeur absent du popup');
    area.value = texte;
    await pressPopupButton(h, '.v2-comment-popup-post');
  }
  async function closePopupIfOpen(h) {
    if (popupVisible()) await pressPopupButton(h, '.v2-comment-popup-close');
  }

  function rowsFor(commentId) {
    const t = stub().state.rows[TABLE];
    const out = [];
    if (!t) return out;
    for (let i = 0; i < t.id.length; i++) if (t.CommentId[i] === commentId) out.push({ id: t.id[i], texte: t.Texte[i], auteur: t.Auteur[i], creeLe: t.CreeLe[i] });
    return out;
  }
  const textsOf = commentId => rowsFor(commentId).map(r => r.texte);
  // Les lignes de toute la table, celles des cas d'avant comprises : les cas qui comptent les doublons comptent depuis leur départ.
  const tableSize = () => (stub().state.rows[TABLE] ? stub().state.rows[TABLE].id.length : 0);
  const markInDom = commentId => !!document.querySelector('.tiptap .comment-mark[data-comment-id="' + commentId + '"]');
  const markInHtml = commentId => Editor.getHTML().indexOf(commentId) !== -1;
  const resolvedInDom = commentId => { const m = document.querySelector('.tiptap .comment-mark[data-comment-id="' + commentId + '"]'); return m ? m.getAttribute('data-resolved') === 'true' : null; };
  async function openThread(h, commentId) {
    const mark = document.querySelector('.tiptap .comment-mark[data-comment-id="' + commentId + '"]');
    if (!mark) throw new Error('marque introuvable : ' + commentId);
    mark.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await h.sleep(250);
  }
  // Un pas de plus dans le texte, tapé après coup (la marque n'est alors plus le dernier pas de l'historique).
  function typeAtEnd(text) {
    const state = ed().state;
    ed().view.dispatch(state.tr.insertText(text, state.doc.content.size - 1));
  }

  async function leave(h) {
    await closePopupIfOpen(h);
    await h.resetEditor();
  }

  cases.push({
    id: 'undo_comments_publishing_a_thread_is_one_undo_step_for_the_mark_and_its_rows',
    description: 'Publier un fil (marque + premier message) : UN Ctrl + Z retire la marque ET la ligne Grist, UN Ctrl + Y les remet, et il n\'y a rien d\'autre à défaire',
    run: async (h) => {
      const problems = [];
      await savedTemplateWithText(h, 'Annuler publication', 'Un paragraphe à commenter');
      const base = Editor.getHTML();
      const baseUndo = ed().can().undo();
      const id = await commentFirstParagraph(h);
      if (!id) return { pass: false, notes: 'aucune marque posée' };
      await post(h, 'Premier message');
      check(problems, 'après « Publier », la ligne est dans la table', textsOf(id), ['Premier message']);
      const author = rowsFor(id)[0].auteur;
      const when = rowsFor(id)[0].creeLe;

      undo();
      await settle(h);
      check(problems, 'UN Ctrl + Z retire la marque du texte', markInDom(id) || markInHtml(id), false);
      check(problems, 'UN Ctrl + Z rend le document d\'avant', Editor.getHTML(), base);
      check(problems, 'UN Ctrl + Z retire la ligne de la table', rowsFor(id).length, 0);
      check(problems, 'UN Ctrl + Z ferme le popup du fil', popupVisible(), false);
      check(problems, 'il ne reste rien à défaire derrière (comme avant le commentaire)', ed().can().undo(), baseUndo);
      check(problems, 'il y a un pas à rétablir', ed().can().redo(), true);

      redo();
      await settle(h);
      check(problems, 'UN Ctrl + Y remet la marque', markInDom(id), true);
      const back = rowsFor(id);
      check(problems, 'UN Ctrl + Y remet la ligne, la même', back.map(r => [r.texte, r.auteur, r.creeLe]), [['Premier message', author, when]]);
      check(problems, 'il ne reste rien à rétablir', ed().can().redo(), false);
      await openThread(h, id);
      check(problems, 'le fil rétabli se rouvre avec son message', popupTexts(), ['Premier message']);
      await closePopupIfOpen(h);

      undo();
      await settle(h);
      check(problems, 'un second Ctrl + Z retire de nouveau la marque et la ligne', [markInDom(id), rowsFor(id).length], [false, 0]);
      await leave(h);
      return verdict(problems, 'publier = un pas, marque et ligne ensemble');
    },
  });

  cases.push({
    id: 'undo_comments_a_reply_is_its_own_undo_step',
    description: 'Une réponse est un pas à part : Ctrl + Z la retire (ligne et popup) sans toucher au fil, le suivant retire le fil, Ctrl + Y les remet dans l\'ordre',
    run: async (h) => {
      const problems = [];
      await savedTemplateWithText(h, 'Annuler réponse', 'Texte avec discussion');
      const id = await commentFirstParagraph(h);
      if (!id) return { pass: false, notes: 'aucune marque posée' };
      await post(h, 'Question');
      await post(h, 'Réponse');
      check(problems, 'après la réponse, deux lignes', textsOf(id), ['Question', 'Réponse']);
      check(problems, 'le popup montre les deux messages', popupTexts(), ['Question', 'Réponse']);

      undo();
      await settle(h);
      check(problems, 'un Ctrl + Z retire la réponse seule', textsOf(id), ['Question']);
      check(problems, 'le fil et sa marque sont là', markInDom(id), true);
      check(problems, 'le popup ouvert ne montre plus que la question', popupTexts(), ['Question']);
      undo();
      await settle(h);
      check(problems, 'le Ctrl + Z suivant retire le fil entier', [markInDom(id), rowsFor(id).length, popupVisible()], [false, 0, false]);

      redo();
      await settle(h);
      check(problems, 'un Ctrl + Y remet le fil et sa question', [markInDom(id), textsOf(id)], [true, ['Question']]);
      redo();
      await settle(h);
      check(problems, 'le suivant remet la réponse, à sa place', textsOf(id), ['Question', 'Réponse']);
      await openThread(h, id);
      check(problems, 'le fil se rouvre avec les deux messages dans l\'ordre', popupTexts(), ['Question', 'Réponse']);
      await leave(h);
      return verdict(problems, 'une réponse = un pas');
    },
  });

  cases.push({
    id: 'undo_comments_deleting_a_thread_comes_back_with_its_mark_and_every_message',
    description: 'Supprimer un fil de deux messages : UN Ctrl + Z rend la marque ET les deux lignes (même texte, même auteur, même date, même ordre), UN Ctrl + Y le supprime de nouveau',
    run: async (h) => {
      const problems = [];
      await savedTemplateWithText(h, 'Annuler suppression', 'Texte dont le fil sera supprimé');
      const size = tableSize();
      const id = await commentFirstParagraph(h);
      if (!id) return { pass: false, notes: 'aucune marque posée' };
      await post(h, 'Premier');
      await post(h, 'Second');
      const before = rowsFor(id).map(r => [r.texte, r.auteur, r.creeLe]);
      const dialogs = h.stubDialogs({ confirm: true });
      try { await pressPopupButton(h, '.v2-comment-popup-delete'); } finally { dialogs.restore(); }
      check(problems, 'après « Supprimer », ni ligne ni marque', [rowsFor(id).length, markInDom(id), markInHtml(id)], [0, false, false]);

      undo();
      await settle(h);
      check(problems, 'UN Ctrl + Z remet la marque', markInDom(id), true);
      check(problems, 'UN Ctrl + Z remet les deux lignes, les mêmes et dans l\'ordre', rowsFor(id).map(r => [r.texte, r.auteur, r.creeLe]), before);
      await openThread(h, id);
      check(problems, 'le fil rouvert montre ses deux messages', popupTexts(), ['Premier', 'Second']);
      await closePopupIfOpen(h);

      redo();
      await settle(h);
      check(problems, 'UN Ctrl + Y supprime de nouveau la marque et les lignes', [markInDom(id), rowsFor(id).length], [false, 0]);
      undo();
      await settle(h);
      check(problems, 'un second Ctrl + Z les remet encore', [markInDom(id), rowsFor(id).map(r => r.texte)], [true, ['Premier', 'Second']]);
      check(problems, 'sans ligne en double dans toute la table', tableSize() - size, 2);
      await leave(h);
      return verdict(problems, 'supprimer = un pas, rendu entier');
    },
  });

  cases.push({
    id: 'undo_comments_a_delete_the_table_refuses_gives_back_no_duplicate_rows_on_undo',
    description: 'La table refuse de supprimer les lignes (droits) : la marque part quand même, mais les lignes restent ; Ctrl + Z rend la marque SANS recréer les lignes en double',
    run: async (h) => {
      const problems = [];
      await savedTemplateWithText(h, 'Annuler suppression refusée', 'Texte dont la suppression sera refusée');
      const size = tableSize();
      const id = await commentFirstParagraph(h);
      if (!id) return { pass: false, notes: 'aucune marque posée' };
      await post(h, 'Premier');
      await post(h, 'Second');
      const dialogs = h.stubDialogs({ confirm: true });
      stub().denyTable(TABLE);
      try { await pressPopupButton(h, '.v2-comment-popup-delete'); } finally { stub().denyTable(TABLE, false); dialogs.restore(); }
      check(problems, 'la marque est partie, les lignes sont restées (écriture refusée)', [markInDom(id), textsOf(id)], [false, ['Premier', 'Second']]);
      undo();
      await settle(h);
      check(problems, 'Ctrl + Z rend la marque', markInDom(id), true);
      check(problems, 'sans recréer les lignes : toujours deux, jamais quatre', [textsOf(id), tableSize() - size], [['Premier', 'Second'], 2]);
      await openThread(h, id);
      check(problems, 'le fil rendu montre ses deux messages, une fois chacun', popupTexts(), ['Premier', 'Second']);
      await leave(h);
      return verdict(problems, 'suppression refusée : pas de double');
    },
  });

  cases.push({
    id: 'undo_comments_a_thread_closed_before_its_first_message_leaves_no_step_behind',
    description: 'Commenter puis refermer sans publier ne laisse rien dans l\'historique : le Ctrl + Z suivant défait la frappe d\'avant, pas une marque sans fil',
    run: async (h) => {
      const problems = [];
      await savedTemplateWithText(h, 'Annuler fil abandonné', 'Un paragraphe');
      const start = Editor.getHTML();
      typeAtEnd(' et la suite');
      const typed = Editor.getHTML();
      await h.sleep(700);
      check(problems, 'la frappe est un pas à défaire', ed().can().undo(), true);
      const id = await commentFirstParagraph(h);
      if (!id) return { pass: false, notes: 'aucune marque posée' };
      check(problems, 'le composeur est ouvert', popupVisible(), true);
      stub().clearActionLog();
      await pressPopupButton(h, '.v2-comment-popup-close');
      check(problems, 'refermé sans publier : plus de marque, le texte d\'avant', Editor.getHTML(), typed);
      check(problems, 'aucune ligne écrite', stub().countActions('AddRecord', TABLE), 0);
      check(problems, 'rien à rétablir (le fil n\'a laissé aucun pas)', ed().can().redo(), false);

      undo();
      await settle(h);
      check(problems, 'UN Ctrl + Z défait la frappe d\'avant, pas une marque sans fil', Editor.getHTML(), start);
      check(problems, 'et il ne reste plus rien à défaire', ed().can().undo(), false);
      redo();
      await settle(h);
      check(problems, 'UN Ctrl + Y rend la frappe, sans marque', Editor.getHTML(), typed);
      await leave(h);
      return verdict(problems, 'un fil abandonné ne laisse pas de trace');
    },
  });

  cases.push({
    id: 'undo_comments_a_thread_closed_after_other_typing_keeps_the_history_whole',
    description: 'Le texte est retouché pendant que le composeur est ouvert, puis le fil est refermé sans publier : l\'historique reste complet, et en défaisant tout on retrouve le document de départ sans marque ni ligne',
    run: async (h) => {
      const problems = [];
      await savedTemplateWithText(h, 'Annuler fil abandonné plus tard', 'Un paragraphe');
      const start = Editor.getHTML();
      const id = await commentFirstParagraph(h);
      if (!id) return { pass: false, notes: 'aucune marque posée' };
      await h.sleep(600);
      typeAtEnd(' ajouté pendant le composeur');
      await pressPopupButton(h, '.v2-comment-popup-close');
      check(problems, 'refermé sans publier : plus de marque', markInDom(id), false);
      let steps = 0;
      while (ed().can().undo() && steps < 10) { undo(); await settle(h); steps++; }
      check(problems, 'défait pas à pas, on retrouve le document de départ', Editor.getHTML(), start);
      check(problems, 'sans marque ni ligne', [markInDom(id), rowsFor(id).length], [false, 0]);
      while (ed().can().redo() && steps < 20) { redo(); await settle(h); steps++; }
      check(problems, 'rétabli en entier, la marque d\'un fil jamais publié n\'est pas revenue', markInHtml(id), false);
      await leave(h);
      return verdict(problems, 'un fil abandonné après une frappe : historique entier');
    },
  });

  cases.push({
    id: 'undo_comments_undoing_the_mark_closes_the_open_composer',
    description: 'Ctrl + Z pendant que le composeur est ouvert retire la marque ET ferme le popup : on ne peut plus publier un message sur une marque qui n\'existe plus',
    run: async (h) => {
      const problems = [];
      await savedTemplateWithText(h, 'Annuler pendant le composeur', 'Un paragraphe');
      const start = Editor.getHTML();
      const id = await commentFirstParagraph(h);
      if (!id) return { pass: false, notes: 'aucune marque posée' };
      stub().clearActionLog();
      undo();
      await settle(h);
      check(problems, 'la marque est retirée', [markInDom(id), Editor.getHTML()], [false, start]);
      check(problems, 'le popup est fermé', popupVisible(), false);
      check(problems, 'aucune ligne écrite', stub().countActions('AddRecord', TABLE), 0);
      await leave(h);
      return verdict(problems, 'défaire la marque ferme son composeur');
    },
  });

  cases.push({
    id: 'undo_comments_resolving_is_undone_and_the_open_popup_follows_without_losing_the_typed_reply',
    description: 'Résoudre puis Ctrl + Z : la marque redevient active, le popup ouvert aussi (pastille et bouton), et la réponse qu\'on y tapait est gardée ; Ctrl + Y le résout de nouveau',
    run: async (h) => {
      const problems = [];
      await savedTemplateWithText(h, 'Annuler résolution', 'Texte à résoudre');
      const id = await commentFirstParagraph(h);
      if (!id) return { pass: false, notes: 'aucune marque posée' };
      await post(h, 'À traiter');
      await pressPopupButton(h, '.v2-comment-popup-resolve');
      check(problems, 'résolu : la pastille du popup', popupBadge(), 'Résolu');
      replyArea().value = 'réponse en cours';

      undo();
      await settle(h);
      check(problems, 'défait : la marque est active', resolvedInDom(id), false);
      check(problems, 'défait : la pastille du popup ouvert', popupBadge(), 'Commentaire');
      check(problems, 'défait : le bouton redit « Résoudre »', popupButtonLabel('.v2-comment-popup-resolve'), 'Résoudre');
      check(problems, 'la réponse en cours de frappe est gardée', replyArea() ? replyArea().value : null, 'réponse en cours');
      check(problems, 'les messages sont intacts', textsOf(id), ['À traiter']);

      redo();
      await settle(h);
      check(problems, 'rétabli : la marque est résolue', resolvedInDom(id), true);
      check(problems, 'rétabli : la pastille et le bouton', [popupBadge(), popupButtonLabel('.v2-comment-popup-resolve')], ['Résolu', 'Rouvrir']);
      check(problems, 'la réponse en cours est encore là', replyArea() ? replyArea().value : null, 'réponse en cours');
      await leave(h);
      return verdict(problems, 'résoudre défait, le popup suit');
    },
  });

  cases.push({
    id: 'undo_comments_messages_posted_by_other_people_are_never_touched',
    description: 'Une autre personne répond dans le même fil depuis : Ctrl + Z et Ctrl + Y ne touchent qu\'au message que CE geste a posé',
    run: async (h) => {
      const problems = [];
      await savedTemplateWithText(h, 'Annuler lignes des autres', 'Texte partagé');
      const modeleId = Templates.getCurrentId();
      const id = await commentFirstParagraph(h);
      if (!id) return { pass: false, notes: 'aucune marque posée' };
      await post(h, 'Mon message');
      await stub().applyUserActions([['AddRecord', TABLE, null, { ModeleId: modeleId, CommentId: id, Auteur: 'autre@example.com', Texte: 'Sa réponse', CreeLe: new Date(Date.now() + 5000).toISOString() }]]);
      undo();
      await settle(h);
      check(problems, 'mon message est retiré, le sien reste', textsOf(id), ['Sa réponse']);
      redo();
      await settle(h);
      check(problems, 'rétabli : mon message est revenu, le sien est intact et seul', textsOf(id).slice().sort(), ['Mon message', 'Sa réponse']);
      check(problems, 'sans doublon', rowsFor(id).length, 2);
      await leave(h);
      return verdict(problems, 'les lignes des autres ne bougent pas');
    },
  });

  cases.push({
    id: 'undo_comments_a_refused_write_is_told_and_the_messages_are_reread_without_duplicates',
    description: 'La table des fils refuse l\'écriture (droits) : Ctrl + Z change le texte, la personne en est avertie, les messages sont relus tels que la table les garde, et un Ctrl + Y qui suit ne double aucune ligne',
    run: async (h) => {
      const problems = [];
      await savedTemplateWithText(h, 'Annuler écriture refusée', 'Texte commenté');
      const id = await commentFirstParagraph(h);
      if (!id) return { pass: false, notes: 'aucune marque posée' };
      await post(h, 'Message gardé');
      const original = Dialogs.notice;
      const told = [];
      Dialogs.notice = async opts => { told.push(opts && opts.title); };
      stub().denyTable(TABLE);
      try {
        undo();
        await settle(h);
        await h.sleep(100);
      } finally { stub().denyTable(TABLE, false); Dialogs.notice = original; }
      check(problems, 'la personne est avertie, une fois', told, ['Commentaires non mis à jour']);
      check(problems, 'la table a gardé sa ligne (écriture refusée)', textsOf(id), ['Message gardé']);
      check(problems, 'les messages gardés en mémoire sont ceux de la table', Comments.snapshot ? Comments.snapshot(id).messages.map(m => m.texte) : null, ['Message gardé']);
      redo();
      await settle(h);
      check(problems, 'le Ctrl + Y qui suit ne double aucune ligne', textsOf(id), ['Message gardé']);
      await leave(h);
      return verdict(problems, 'écriture refusée : dite, relue, sans doublon');
    },
  });

  cases.push({
    id: 'undo_comments_quick_undo_and_redo_keep_exactly_one_row_per_message',
    description: 'Ctrl + Z, Ctrl + Y, Ctrl + Z, Ctrl + Y enchaînés sans attendre la table (réponse lente) : une ligne, ni perdue ni en double',
    run: async (h) => {
      const problems = [];
      await savedTemplateWithText(h, 'Annuler enchaîné', 'Texte commenté vite');
      const size = tableSize();
      const id = await commentFirstParagraph(h);
      if (!id) return { pass: false, notes: 'aucune marque posée' };
      await post(h, 'Un seul message');
      stub().setLatency({ applyUserActions: 60 });
      try {
        undo(); redo(); undo(); redo();
        await idle();
        await h.sleep(100);
      } finally { stub().setLatency(0); }
      check(problems, 'une seule ligne, la bonne', textsOf(id), ['Un seul message']);
      check(problems, 'la marque est là', markInDom(id), true);
      check(problems, 'une seule ligne de plus dans toute la table', tableSize() - size, 1);
      undo();
      await settle(h);
      check(problems, 'puis un Ctrl + Z la retire (le numéro de la ligne recréée était connu)', [rowsFor(id).length, tableSize() - size], [0, 0]);
      await leave(h);
      return verdict(problems, 'enchaîné : une ligne');
    },
  });

  cases.push({
    id: 'undo_comments_the_first_message_after_other_typing_is_a_step_of_its_own',
    description: 'Le texte est retouché avant la publication : le message est alors son propre pas (Ctrl + Z le retire, la marque reste), puis la frappe, puis la marque - dans l\'ordre où tout a été fait',
    run: async (h) => {
      const problems = [];
      await savedTemplateWithText(h, 'Annuler publication tardive', 'Un paragraphe');
      const start = Editor.getHTML();
      const id = await commentFirstParagraph(h);
      if (!id) return { pass: false, notes: 'aucune marque posée' };
      await h.sleep(600);
      typeAtEnd(' retouché');
      const typed = Editor.getHTML();
      await post(h, 'Publié après la retouche');
      check(problems, 'le message est dans la table', textsOf(id), ['Publié après la retouche']);

      undo();
      await settle(h);
      check(problems, 'un premier Ctrl + Z retire le message seul', [textsOf(id), Editor.getHTML() === typed, markInDom(id)], [[], true, true]);
      check(problems, 'le popup ouvert redevient celui d\'un fil sans message', [popupVisible(), popupTexts(), popupButtonLabel('.v2-comment-popup-post')], [true, [], 'Publier']);
      undo();
      await settle(h);
      check(problems, 'le suivant défait la retouche', [Editor.getHTML() === typed, markInDom(id)], [false, true]);
      undo();
      await settle(h);
      check(problems, 'le dernier retire la marque', [Editor.getHTML(), markInDom(id)], [start, false]);
      await leave(h);
      return verdict(problems, 'publication tardive : trois pas, dans l\'ordre');
    },
  });

  cases.push({
    id: 'undo_comments_publishing_with_track_changes_on_is_still_one_step',
    description: 'Le suivi des modifications est allumé : publier un fil se défait quand même d\'UN Ctrl + Z (marque et ligne), et se rétablit de même ; la réponse, elle, est son propre pas',
    run: async (h) => {
      const problems = [];
      await savedTemplateWithText(h, 'Annuler publication avec suivi', 'Un paragraphe suivi');
      const base = Editor.getHTML();
      Editor.setTrackChanges(true);
      await h.sleep(200);
      try {
        const id = await commentFirstParagraph(h);
        if (!id) return { pass: false, notes: 'aucune marque posée' };
        await post(h, 'Publié sous suivi');
        await post(h, 'Réponse sous suivi');
        check(problems, 'les deux lignes sont dans la table', textsOf(id), ['Publié sous suivi', 'Réponse sous suivi']);
        undo();
        await settle(h);
        check(problems, 'un Ctrl + Z retire la réponse seule', [textsOf(id), markInDom(id)], [['Publié sous suivi'], true]);
        undo();
        await settle(h);
        check(problems, 'le suivant retire le fil entier (marque et ligne)', [textsOf(id), markInDom(id), popupVisible()], [[], false, false]);
        check(problems, 'le document est celui d\'avant, sans modification suivie de plus', Editor.getHTML(), base);
        redo();
        redo();
        await settle(h);
        check(problems, 'deux Ctrl + Y remettent le fil et sa réponse', [textsOf(id), markInDom(id)], [['Publié sous suivi', 'Réponse sous suivi'], true]);
      } finally {
        Editor.setTrackChanges(false);
        await leave(h);
      }
      return verdict(problems, 'avec le suivi allumé');
    },
  });

  cases.push({
    id: 'undo_comments_a_thread_in_a_table_cell_and_on_a_list_item_is_one_step_too',
    description: 'Le texte commenté est dans la case d\'un tableau, puis dans une liste : publier est encore UN pas (aucune retouche automatique du document ne s\'intercale entre la marque et le message)',
    run: async (h) => {
      const problems = [];
      await h.resetEditor();
      Editor.setHTML('<table><tbody><tr><td><p>Case commentée</p></td><td><p>Autre case</p></td></tr></tbody></table><ul><li><p>Puce commentée</p></li></ul><p>Fin</p>');
      document.getElementById('template-name').value = 'Annuler commentaire tableau liste';
      await h.clickButton('btn-save');
      await h.sleep(600);
      const base = Editor.getHTML();
      for (const [label, selector] of [['la case d\'un tableau', '.tiptap td p'], ['une puce de liste', '.tiptap li p']]) {
        await h.selectAllInElement(document.querySelector(selector));
        await h.clickButton('v2-btn-comment');
        await h.sleep(250);
        const mark = document.querySelector('.tiptap .comment-mark');
        const id = mark ? mark.getAttribute('data-comment-id') : null;
        if (!id) { problems.push(label + ' : aucune marque posée'); continue; }
        await post(h, 'Commentaire sur ' + label);
        undo();
        await settle(h);
        check(problems, label + ' : UN Ctrl + Z retire la marque et la ligne', [markInDom(id), rowsFor(id).length, Editor.getHTML()], [false, 0, base]);
        check(problems, label + ' : rien d\'autre à défaire', ed().can().undo(), false);
        redo();
        await settle(h);
        check(problems, label + ' : UN Ctrl + Y remet les deux', [markInDom(id), textsOf(id)], [true, ['Commentaire sur ' + label]]);
        undo();
        await settle(h);
      }
      await leave(h);
      return verdict(problems, 'tableau et liste : un pas');
    },
  });

  cases.push({
    id: 'undo_comments_what_was_done_on_a_model_left_behind_is_not_undone_on_the_next',
    description: 'Un autre modèle s\'affiche : l\'historique est celui du nouveau modèle, un Ctrl + Z ne rend ni ne retire rien d\'un fil de l\'ancien',
    run: async (h) => {
      const problems = [];
      const modeleId = await savedTemplateWithText(h, 'Annuler modèle laissé', 'Texte commenté puis laissé');
      const id = await commentFirstParagraph(h);
      if (!id) return { pass: false, notes: 'aucune marque posée' };
      await post(h, 'Message de l\'ancien modèle');
      await pressPopupButton(h, '.v2-comment-popup-close');
      await h.clickButton('btn-save');
      await h.sleep(500);
      await h.resetEditor();
      Editor.setHTML('<p>Un autre modèle</p>');
      await h.sleep(300);
      check(problems, 'l\'historique du nouveau modèle est vide', ed().can().undo(), false);
      undo();
      await settle(h);
      check(problems, 'Ctrl + Z ne touche pas aux lignes de l\'ancien modèle', textsOf(id), ['Message de l\'ancien modèle']);
      const select = document.getElementById('template-select');
      select.value = String(modeleId);
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await h.sleep(700);
      check(problems, 'le modèle rouvert garde sa marque', markInDom(id), true);
      check(problems, 'et son historique est vide', ed().can().undo(), false);
      await openThread(h, id);
      check(problems, 'son fil se relit avec son message', popupTexts(), ['Message de l\'ancien modèle']);
      await leave(h);
      return verdict(problems, 'un modèle laissé n\'est pas défait');
    },
  });

  return cases;
})();
