// Suite "comments" - commentaires façon Google Docs (js/comments.js + la marque `commentMark` de js/editor-nodes.js).
//
// La feature a deux moitiés qui peuvent diverger silencieusement, et cette suite vérifie les DEUX à chaque scénario :
//  - l'ANCRAGE (quelle portée de texte est commentée, résolu ou non) vit DANS le document, sous forme de marque ProseMirror - donc dans Editor.getHTML() ;
//  - le FIL (auteur, message, réponses) vit dans la table Grist Publipostage_Commentaires.
// Un fil supprimé côté document mais laissé en base, ou l'inverse, est exactement le genre d'incohérence que seul un test qui regarde les deux attrape.
//
// Tout passe par le vrai popup (#v2-comment-popup) et ses vrais boutons : le popup se construit à chaque rendu, donc un scénario retrouve ses boutons par
// classe (.v2-comment-popup-post / -resolve / -delete), jamais par une référence gardée d'un rendu précédent. Les boutons du popup réagissent au
// `mousedown` (pas au `click` - cf. le popup de note de bas de page dont ils reprennent les mécaniques), d'où `pressPopupButton` ci-dessous.
(function () {
  const cases = [];
  const TABLE = 'Publipostage_Commentaires';
  const stub = () => window.__gristStub;

  const popup = () => document.getElementById('v2-comment-popup');
  const popupVisible = () => { const p = popup(); return !!p && p.style.display !== 'none'; };

  // Les gestionnaires du popup sont posés sur 'mousedown' (et font preventDefault) - un .click() seul ne déclenche rien.
  async function pressPopupButton(h, selector) {
    const btn = popup() && popup().querySelector(selector);
    if (!btn) throw new Error('Bouton de popup introuvable : ' + selector);
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await h.sleep(250);
  }

  function replyArea() { return popup() && popup().querySelector('.v2-comment-popup-reply'); }

  // Un commentaire exige un modèle DÉJÀ enregistré (insertCommentAtSelection refuse sinon : currentModeleId est null tant qu'aucune ligne n'existe).
  async function savedTemplateWithText(h, nom, texte) {
    await h.resetEditor();
    Editor.setHTML('<p>' + texte + '</p>');
    document.getElementById('template-name').value = nom;
    await h.clickButton('btn-save');
    await h.sleep(500); // laisse Comments.loadForTemplate() se terminer (déclenché par le changement de modèle)
    return Templates.getCurrentId();
  }

  // Sélectionne le texte du premier paragraphe puis clique le vrai bouton "Commenter la sélection".
  async function commentFirstParagraph(h) {
    const para = document.querySelector('.tiptap p');
    await h.selectAllInElement(para);
    await h.clickButton('v2-btn-comment');
    await h.sleep(250);
    const mark = document.querySelector('.tiptap .comment-mark');
    return mark ? mark.getAttribute('data-comment-id') : null;
  }

  async function postFirstMessage(h, texte) {
    const area = replyArea();
    if (!area) throw new Error('composeur absent du popup');
    area.value = texte;
    await pressPopupButton(h, '.v2-comment-popup-post');
  }

  function rowsFor(commentId) {
    const t = stub().state.rows[TABLE];
    if (!t) return [];
    const out = [];
    for (let i = 0; i < t.id.length; i++) if (t.CommentId[i] === commentId) out.push({ id: t.id[i], texte: t.Texte[i], auteur: t.Auteur[i] });
    return out;
  }

  // Ferme un popup resté ouvert : un fil non publié laisserait sa marque dans le document du scénario SUIVANT.
  async function closePopupIfOpen(h) {
    if (!popupVisible()) return;
    await pressPopupButton(h, '.v2-comment-popup-close');
  }

  cases.push({
    id: 'comment_selection_creates_mark_and_composer',
    description: 'Sélectionner du texte puis "Commenter la sélection" pose une marque sur CE texte et ouvre le composeur',
    run: async (h) => {
      await savedTemplateWithText(h, 'Commentaires création', 'Un paragraphe à commenter');
      const id = await commentFirstParagraph(h);
      const marked = document.querySelector('.tiptap .comment-mark');
      const ok = !!id && !!marked && marked.textContent.indexOf('à commenter') !== -1 && popupVisible();
      const notes = 'commentId=' + id + ', texte marqué="' + (marked ? marked.textContent : '') + '", popup=' + popupVisible();
      await closePopupIfOpen(h);
      return { pass: ok, notes };
    },
  });

  cases.push({
    id: 'comment_first_message_persists_in_grist',
    description: 'Publier le premier message écrit bien une ligne dans Publipostage_Commentaires, rattachée au bon modèle',
    run: async (h) => {
      const modeleId = await savedTemplateWithText(h, 'Commentaires premier message', 'Texte commenté');
      const id = await commentFirstParagraph(h);
      if (!id) return { pass: false, notes: 'aucune marque posée' };
      await postFirstMessage(h, 'Mon premier commentaire');
      const rows = rowsFor(id);
      const t = stub().state.rows[TABLE];
      const idx = t.CommentId.indexOf(id);
      const bonModele = idx !== -1 && Number(t.ModeleId[idx]) === Number(modeleId);
      await closePopupIfOpen(h);
      return {
        pass: rows.length === 1 && rows[0].texte === 'Mon premier commentaire' && bonModele,
        notes: 'lignes=' + JSON.stringify(rows) + ', rattaché au modèle courant=' + bonModele,
      };
    },
  });

  cases.push({
    id: 'comment_reply_appends_to_same_thread',
    description: 'Une réponse rejoint le MÊME fil (même CommentId) au lieu d\'en ouvrir un second',
    run: async (h) => {
      await savedTemplateWithText(h, 'Commentaires réponse', 'Texte avec discussion');
      const id = await commentFirstParagraph(h);
      if (!id) return { pass: false, notes: 'aucune marque posée' };
      await postFirstMessage(h, 'Question initiale');
      const area = replyArea();
      area.value = 'Réponse à la question';
      await pressPopupButton(h, '.v2-comment-popup-post'); // après le 1er message, ce bouton porte le libellé "Répondre"
      const rows = rowsFor(id);
      const messagesAffiches = popup().querySelectorAll('.v2-comment-popup-message').length;
      await closePopupIfOpen(h);
      return {
        pass: rows.length === 2 && rows[1].texte === 'Réponse à la question' && messagesAffiches === 2,
        notes: 'lignes du fil=' + rows.length + ', messages affichés=' + messagesAffiches + ', dernier="' + (rows[1] ? rows[1].texte : '') + '"',
      };
    },
  });

  cases.push({
    id: 'comment_resolve_state_lives_in_document',
    description: "Résoudre puis rouvrir change l'état DANS le document (donc voyage avec l'enregistrement, Annuler-Rétablir et l'export), pas seulement dans le popup",
    run: async (h) => {
      await savedTemplateWithText(h, 'Commentaires résolution', 'Texte à résoudre');
      const id = await commentFirstParagraph(h);
      if (!id) return { pass: false, notes: 'aucune marque posée' };
      await postFirstMessage(h, 'À traiter');
      await pressPopupButton(h, '.v2-comment-popup-resolve');
      const htmlResolu = Editor.getHTML();
      const domResolu = document.querySelector('.tiptap .comment-mark').getAttribute('data-resolved');
      await pressPopupButton(h, '.v2-comment-popup-resolve'); // le même bouton porte alors "Rouvrir"
      const htmlRouvert = Editor.getHTML();
      const domRouvert = document.querySelector('.tiptap .comment-mark').getAttribute('data-resolved');
      await closePopupIfOpen(h);
      return {
        pass: htmlResolu.indexOf('data-resolved="true"') !== -1 && domResolu === 'true' && htmlRouvert.indexOf('data-resolved="true"') === -1 && domRouvert !== 'true',
        notes: 'résolu: dom=' + domResolu + ' html contient data-resolved="true"=' + (htmlResolu.indexOf('data-resolved="true"') !== -1) + ' | rouvert: dom=' + domRouvert,
      };
    },
  });

  cases.push({
    id: 'comment_click_mark_reopens_thread',
    description: 'Cliquer une marque existante rouvre son fil avec ses messages (et non un composeur vide)',
    run: async (h) => {
      await savedTemplateWithText(h, 'Commentaires réouverture', 'Texte déjà commenté');
      const id = await commentFirstParagraph(h);
      if (!id) return { pass: false, notes: 'aucune marque posée' };
      await postFirstMessage(h, 'Message à retrouver');
      await pressPopupButton(h, '.v2-comment-popup-close');
      if (popupVisible()) return { pass: false, notes: 'le popup ne s\'est pas fermé' };

      const mark = document.querySelector('.tiptap .comment-mark[data-comment-id="' + id + '"]');
      if (!mark) return { pass: false, notes: 'marque disparue après fermeture d\'un fil pourtant publié' };
      mark.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      await h.sleep(250);
      const rouvert = popupVisible();
      const textes = Array.from(popup().querySelectorAll('.v2-comment-popup-text')).map(e => e.textContent);
      await closePopupIfOpen(h);
      return { pass: rouvert && textes.indexOf('Message à retrouver') !== -1, notes: 'popup rouvert=' + rouvert + ', messages=' + JSON.stringify(textes) };
    },
  });

  cases.push({
    id: 'comment_cancel_unpublished_leaves_nothing',
    description: "Fermer un fil JAMAIS publié retire sa marque du document et n'écrit aucune ligne (pas de fil fantôme)",
    run: async (h) => {
      await savedTemplateWithText(h, 'Commentaires annulation', 'Texte finalement pas commenté');
      stub().clearActionLog();
      const id = await commentFirstParagraph(h);
      if (!id) return { pass: false, notes: 'aucune marque posée' };
      await pressPopupButton(h, '.v2-comment-popup-close'); // fermeture sans jamais publier
      const markGone = !document.querySelector('.tiptap .comment-mark[data-comment-id="' + id + '"]');
      const htmlClean = Editor.getHTML().indexOf(id) === -1;
      const ecritures = stub().countActions('AddRecord', TABLE);
      return { pass: markGone && htmlClean && ecritures === 0, notes: 'marque retirée du DOM=' + markGone + ', absente du HTML=' + htmlClean + ', lignes écrites=' + ecritures };
    },
  });

  cases.push({
    id: 'comment_delete_removes_mark_and_rows',
    description: 'Supprimer un fil retire la marque ET ses lignes Grist (les deux moitiés, jamais une seule)',
    run: async (h) => {
      await savedTemplateWithText(h, 'Commentaires suppression', 'Texte dont le fil sera supprimé');
      const id = await commentFirstParagraph(h);
      if (!id) return { pass: false, notes: 'aucune marque posée' };
      await postFirstMessage(h, 'Premier');
      const area = replyArea();
      area.value = 'Second';
      await pressPopupButton(h, '.v2-comment-popup-post');
      if (rowsFor(id).length !== 2) return { pass: false, notes: 'le fil ne compte pas 2 messages avant suppression : ' + rowsFor(id).length };

      const dialogs = h.stubDialogs({ confirm: true }); // le bouton Supprimer demande confirmation
      try { await pressPopupButton(h, '.v2-comment-popup-delete'); }
      finally { dialogs.restore(); }

      const rowsRestantes = rowsFor(id).length;
      const markGone = !document.querySelector('.tiptap .comment-mark[data-comment-id="' + id + '"]');
      const htmlClean = Editor.getHTML().indexOf(id) === -1;
      const texteIntact = Editor.getHTML().indexOf('dont le fil sera supprimé') !== -1;
      await closePopupIfOpen(h);
      return {
        pass: rowsRestantes === 0 && markGone && htmlClean && texteIntact,
        notes: 'lignes restantes=' + rowsRestantes + ', marque retirée=' + markGone + ', HTML nettoyé=' + htmlClean + ', texte commenté intact=' + texteIntact,
      };
    },
  });

  cases.push({
    id: 'comment_survives_save_and_reload',
    description: 'Un fil survit à un vrai cycle Enregistrer puis rechargement du modèle (marque dans le document, messages relus depuis Grist)',
    run: async (h) => {
      const modeleId = await savedTemplateWithText(h, 'Commentaires persistance', 'Texte commenté puis rechargé');
      const id = await commentFirstParagraph(h);
      if (!id) return { pass: false, notes: 'aucune marque posée' };
      await postFirstMessage(h, 'Commentaire qui doit survivre');
      await pressPopupButton(h, '.v2-comment-popup-close');
      await h.clickButton('btn-save');
      await h.sleep(500);

      // Rechargement complet par le vrai chemin : on repart d'un document vierge, puis on resélectionne ce modèle dans le sélecteur.
      await h.resetEditor();
      Editor.setHTML('<p>Document vidé entre-temps</p>');
      const select = document.getElementById('template-select');
      select.value = String(modeleId);
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await h.sleep(700);

      const html = Editor.getHTML();
      const markBack = html.indexOf(id) !== -1;
      const mark = document.querySelector('.tiptap .comment-mark[data-comment-id="' + id + '"]');
      if (!mark) return { pass: false, notes: 'marque absente après rechargement - html=' + html };
      mark.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      await h.sleep(300);
      const textes = Array.from(popup().querySelectorAll('.v2-comment-popup-text')).map(e => e.textContent);
      await closePopupIfOpen(h);
      return {
        pass: markBack && textes.indexOf('Commentaire qui doit survivre') !== -1,
        notes: 'marque rechargée=' + markBack + ', messages relus depuis Grist=' + JSON.stringify(textes),
      };
    },
  });

  cases.push({
    id: 'comment_absent_from_read_mode',
    description: "Un commentaire est un artefact d'édition : il ne doit apparaître ni en mode Lecture ni dans l'export",
    run: async (h) => {
      await savedTemplateWithText(h, 'Commentaires mode lecture', 'Texte visible en lecture');
      const id = await commentFirstParagraph(h);
      if (!id) return { pass: false, notes: 'aucune marque posée' };
      await postFirstMessage(h, 'Note interne');
      await pressPopupButton(h, '.v2-comment-popup-close');

      await h.renderReaderMode(Editor.getHTML(), Editor.getHeaderFooterData());
      await h.sleep(200);
      const readerEl = document.querySelector('#reader-container .comment-mark');
      const texteLisible = (document.getElementById('reader-container').textContent || '').indexOf('Texte visible en lecture') !== -1;
      // La marque peut rester dans le HTML (elle voyage avec le document) : ce qui compte est qu'elle ne soit jamais MISE EN ÉVIDENCE hors de l'éditeur.
      const surligne = readerEl ? getComputedStyle(readerEl).backgroundColor : 'aucun élément';
      const pasDeSurlignage = !readerEl || surligne === 'rgba(0, 0, 0, 0)' || surligne === 'transparent';
      return { pass: texteLisible && pasDeSurlignage, notes: 'texte rendu en Lecture=' + texteLisible + ', fond de la marque en Lecture=' + surligne };
    },
  });

  cases.push({
    id: 'comments_table_never_offered_as_user_table',
    description: "La table interne des fils (Publipostage_Commentaires) ne doit jamais apparaître parmi les tables de l'utilisateur (#Variable, sélecteurs de table)",
    run: async (h) => {
      // Le vrai listTables() rend TOUTES les tables du document (grist-core WidgetFrame.ts : _grist_Tables sans filtre), internes comprises - le stub, lui,
      // n'y met jamais les siennes : sans cet ajout, l'oubli dans INTERNAL_TABLES (js/grist-api.js) restait invisible ici.
      const tables = stub().state.tables;
      const added = tables.indexOf(TABLE) === -1;
      if (added) tables.push(TABLE);
      try {
        await GristAPI.refreshSchema();
        const listed = GristAPI.getTables().slice();
        const inVariables = GristAPI.getAllVariables().filter(v => v.table === TABLE).map(v => v.key);
        return {
          pass: listed.indexOf(TABLE) === -1 && inVariables.length === 0,
          notes: 'tables proposées=' + JSON.stringify(listed) + ', #Variable issues de la table interne=' + JSON.stringify(inVariables),
        };
      } finally {
        if (added) tables.splice(tables.indexOf(TABLE), 1);
        await GristAPI.refreshSchema();
      }
    },
  });

  // Lot « Lectures de fond » de « Tests de charge » : la table des fils est celle de TOUT le document (60 000 cases pour 10 000 commentaires). Un modèle qui ne porte aucune marque de
  // commentaire n'a aucun fil à relire : l'afficher ne la lit plus, et ne la crée plus dans un document qui n'en a pas (js/comments.js, loadForTemplate : carriesCommentMarks).
  // Les lectures de la table (fetchTable), tant que le cas dure.
  function watchThreadReads() {
    const docApi = window.grist.docApi;
    const original = docApi.fetchTable;
    const state = { reads: 0, stop: () => { docApi.fetchTable = original; } };
    docApi.fetchTable = function (tableId) {
      if (tableId === TABLE) state.reads++;
      return original.apply(this, arguments);
    };
    return state;
  }

  // Le modèle rouvert par la liste, depuis un document vidé : le chemin réel qui rend la main à Comments.loadForTemplate.
  async function redisplay(h, modeleId) {
    await h.resetEditor();
    Editor.setHTML('<p>Document vidé entre-temps</p>');
    const select = document.getElementById('template-select');
    select.value = String(modeleId);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await h.sleep(700);
  }

  cases.push({
    id: 'comment_template_without_marks_neither_reads_nor_creates_the_comments_table_until_the_first_message',
    description: "Un modèle sans aucune marque de commentaire n'a aucun fil : l'afficher ne lit pas la table des fils et ne la crée pas dans un document qui n'en a pas ; le premier message la crée, et le modèle commenté la relit une fois à l'affichage et retrouve son fil",
    run: async (h) => {
      const s = stub();
      const tables = s.state.tables;
      const hadTable = tables.indexOf(TABLE);
      const savedRows = s.state.rows[TABLE];
      const modeleId = await savedTemplateWithText(h, 'Commentaires sans marque', 'Texte sans aucune marque');
      if (hadTable !== -1) tables.splice(hadTable, 1); // listTables ne la rapporte plus : le widget la créerait s'il la lisait
      delete s.state.rows[TABLE];
      const watch = watchThreadReads();
      try {
        s.clearActionLog();
        await redisplay(h, modeleId);
        const readsWithoutMarks = watch.reads;
        const createdWithoutMarks = s.countActions('AddTable', TABLE);
        // Le premier message crée la table, le fil s'y écrit.
        const id = await commentFirstParagraph(h);
        if (!id) return { pass: false, notes: 'aucune marque posée' };
        await postFirstMessage(h, 'Premier message dans une table neuve');
        const createdByTheMessage = s.countActions('AddTable', TABLE);
        const rows = rowsFor(id).length;
        await pressPopupButton(h, '.v2-comment-popup-close');
        await h.clickButton('btn-save');
        await h.sleep(500);
        // Le modèle commenté : sa table est relue une fois à l'affichage, et le fil s'y retrouve.
        watch.reads = 0;
        await redisplay(h, modeleId);
        const readsWithMark = watch.reads;
        const mark = document.querySelector('.tiptap .comment-mark[data-comment-id="' + id + '"]');
        if (mark) { mark.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); await h.sleep(300); }
        const texts = Array.from(popup() ? popup().querySelectorAll('.v2-comment-popup-text') : []).map(e => e.textContent);
        await closePopupIfOpen(h);
        const checks = {
          noReadWithoutMarks: readsWithoutMarks === 0,
          noTableCreatedWithoutMarks: createdWithoutMarks === 0,
          firstMessageCreatesTheTable: createdByTheMessage === 1 && rows === 1,
          oneReadWithAMark: readsWithMark === 1,
          threadFound: texts.indexOf('Premier message dans une table neuve') !== -1,
        };
        const failed = Object.keys(checks).filter(k => !checks[k]);
        return {
          pass: failed.length === 0,
          notes: failed.length ? failed.join(', ') + ' | lectures sans marque=' + readsWithoutMarks + ', tables créées à l\'affichage=' + createdWithoutMarks + ', par le message=' + createdByTheMessage + ', lignes=' + rows + ', lectures avec marque=' + readsWithMark + ', messages=' + JSON.stringify(texts) : 'ok',
        };
      } finally {
        watch.stop();
        if (hadTable !== -1 && tables.indexOf(TABLE) === -1) tables.splice(hadTable, 0, TABLE);
        if (savedRows) s.state.rows[TABLE] = savedRows;
      }
    },
  });

  cases.push({
    id: 'comment_mark_only_in_the_header_still_reads_the_comments_table',
    description: "Un modèle dont la seule marque de commentaire est dans son en-tête (aucune dans le texte) relit quand même la table des fils à l'affichage : le fil de l'en-tête reste lisible (garde de la lecture évitée : elle regarde aussi l'en-tête et le pied)",
    run: async (h) => {
      const modeleId = await savedTemplateWithText(h, 'Commentaire dans l\'en-tête', 'Corps sans aucune marque');
      Editor.setHeaderFooterData({
        enabled: true, differentFirstPage: false,
        header: { default: '<p><span class="comment-mark" data-comment-id="cm-entete-test" data-resolved="false">En-tête commenté</span></p>', first: '' },
        footer: { default: '', first: '' },
      });
      await h.clickButton('btn-save');
      await h.sleep(500);
      const watch = watchThreadReads();
      try {
        await redisplay(h, modeleId);
        return { pass: watch.reads >= 1, notes: 'lectures de la table des fils à l\'affichage=' + watch.reads + ' (attendu au moins 1 : la marque est dans l\'en-tête)' };
      } finally { watch.stop(); }
    },
  });

  cases.push({
    id: 'comment_pose_resolve_and_delete_leave_no_suggestion_while_tracking',
    description: "Suivi des modifications allumé (et option « Suivre la mise en forme » allumée aussi) : poser, résoudre, rouvrir puis supprimer un fil ne laisse aucune suggestion - le passage commenté n'est ni barré ni réinséré : un commentaire n'est pas une modification du texte",
    run: async (h) => {
      await savedTemplateWithText(h, 'Commentaires et suivi', 'Texte commenté sous suivi');
      Editor.setFormatTracking(true);
      Editor.setTrackChanges(true);
      const clean = () => !Editor.hasPendingTrackedChanges() && !/<ins\b|<del\b|data-type="modification"/.test(Editor.getHTML());
      const out = {};
      const dialogs = h.stubDialogs({ confirm: true });
      try {
        const id = await commentFirstParagraph(h);
        if (!id) return { pass: false, notes: 'aucune marque posée' };
        out.posed = clean() && !!document.querySelector('.tiptap .comment-mark[data-comment-id="' + id + '"]');
        await postFirstMessage(h, 'À traiter');
        await pressPopupButton(h, '.v2-comment-popup-resolve');
        out.resolved = clean() && /data-resolved="true"/.test(Editor.getHTML());
        await pressPopupButton(h, '.v2-comment-popup-resolve');
        out.reopened = clean() && !/data-resolved="true"/.test(Editor.getHTML());
        await pressPopupButton(h, '.v2-comment-popup-delete');
        out.deleted = clean() && Editor.getHTML().indexOf(id) === -1 && Editor.getHTML().indexOf('Texte commenté sous suivi') !== -1;
        return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) + ' ' + Editor.getHTML() };
      } finally {
        dialogs.restore();
        await closePopupIfOpen(h);
        Editor.setTrackChanges(false);
        PersonStore.remove('pp_track_format');
      }
    },
  });

  // --- La liste des fils (js/comments-list.js, Comments.listThreads / revealThread / setThreadResolved / onChange) : le volet « Commentaires » s'appuie dessus ---
  async function commentParagraph(h, index, message) {
    const para = document.querySelectorAll('.tiptap p')[index];
    await h.selectAllInElement(para);
    await h.clickButton('v2-btn-comment');
    await h.sleep(250);
    const marks = Array.from(document.querySelectorAll('.tiptap .comment-mark'));
    const mark = marks.find(m => para.contains(m));
    const id = mark ? mark.getAttribute('data-comment-id') : null;
    if (id && message) await postFirstMessage(h, message);
    return id;
  }

  cases.push({
    id: 'comment_list_gives_each_thread_in_text_order_with_quote_state_and_messages',
    description: "Comments.listThreads rend un fil par commentaire, dans l'ordre du texte : le passage commenté, l'état (en cours ou résolu), le nombre de messages, le premier et le dernier ; résoudre un fil depuis la liste change la marque du texte, une seconde fois ne fait rien ; atteindre un fil place le curseur sur son passage et ouvre sa fenêtre",
    run: async (h) => {
      try {
        await savedTemplateWithText(h, 'Commentaires liste', 'Premier passage commenté');
        Editor.setHTML('<p>Premier passage commenté</p><p>Second passage à voir</p>');
        await h.sleep(150);
        const first = await commentParagraph(h, 0, 'Question sur le premier');
        const second = await commentParagraph(h, 1, 'Remarque sur le second');
        if (!first || !second) return { pass: false, notes: 'marques absentes : ' + first + ' / ' + second };
        replyArea().value = 'Réponse au second';
        await pressPopupButton(h, '.v2-comment-popup-post');
        await closePopupIfOpen(h);
        const out = {};
        const threads = Comments.listThreads();
        out.order = threads.map(t => t.id).join() === first + ',' + second && threads.every((t, i) => t.from < t.to && (i === 0 || t.from >= threads[i - 1].to));
        out.quotes = threads[0].quote === 'Premier passage commenté' && threads[1].quote === 'Second passage à voir';
        out.counts = threads[0].count === 1 && threads[1].count === 2 && threads[1].first.texte === 'Remarque sur le second' && threads[1].last.texte === 'Réponse au second' && threads[0].resolved === false;
        out.resolve = (await Comments.setThreadResolved(first, true)) === true && Comments.listThreads()[0].resolved === true && /data-comment-id="[^"]*"[^>]*data-resolved="true"/.test(Editor.getHTML());
        out.again = (await Comments.setThreadResolved(first, true)) === false;
        out.reopen = (await Comments.setThreadResolved(first, false)) === true && Comments.listThreads()[0].resolved === false;
        EditorCore.getEditor().commands.setTextSelection(1);
        out.reveal = Comments.revealThread(second) === true;
        await h.sleep(250);
        const caret = EditorCore.getEditor().state.selection.from;
        out.caretOnSecond = caret >= Comments.listThreads()[1].from && caret <= Comments.listThreads()[1].to && popupVisible();
        out.unknown = Comments.revealThread('inconnu') === false;
        await closePopupIfOpen(h);
        return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) + ' ' + JSON.stringify(threads.map(t => [t.id, t.quote, t.count])) };
      } finally { await closePopupIfOpen(h); }
    },
  });

  cases.push({
    id: 'comment_list_tells_its_listeners_when_a_message_is_posted',
    description: "Comments.onChange prévient quand un message est publié (réponse comprise) : le volet se redessine sans polling ; un document sans commentaire donne une liste vide",
    run: async (h) => {
      try {
        await savedTemplateWithText(h, 'Commentaires écoute', 'Texte à commenter');
        let calls = 0;
        Comments.onChange(() => { calls++; });
        const id = await commentFirstParagraph(h);
        if (!id) return { pass: false, notes: 'aucune marque posée' };
        const before = calls;
        await postFirstMessage(h, 'Un premier mot');
        const afterPost = calls;
        replyArea().value = 'Un second mot';
        await pressPopupButton(h, '.v2-comment-popup-post');
        const afterReply = calls;
        await closePopupIfOpen(h);
        const out = { post: afterPost > before, reply: afterReply > afterPost, count: Comments.listThreads()[0].count === 2 };
        Editor.setHTML('<p>Rien à commenter</p>');
        await h.sleep(150);
        out.empty = Comments.listThreads().length === 0;
        return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) + ' calls=' + calls };
      } finally { await closePopupIfOpen(h); }
    },
  });

  // --- L'onglet « Commentaires » du volet (js/track-changes-pane.js), dans la page : sa ligne du menu, ses lignes, ses boutons. La vraie souris, à 700x400, est dans dev-tests/verify-comment-pane-mouse.mjs. ---
  const paneEl = () => document.getElementById('pp-track-pane');
  const commentPanel = () => document.getElementById('pp-track-panel-comments');
  const threadRows = () => Array.from(commentPanel().querySelectorAll('.pp-trackpane-thread'));
  const closePaneIfOpen = () => { if (typeof TrackChangesPane !== 'undefined' && TrackChangesPane.isOpen()) TrackChangesPane.closePane({ focus: false }); };
  const pick = (row, sel) => { const e = row.querySelector(sel); return e ? e.textContent : null; };
  function setThreadFilter(value) {
    const select = commentPanel().querySelector('.pp-trackpane-threadfilter');
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  cases.push({
    id: 'comment_pane_lists_the_threads_filters_resolves_and_goes_to_the_passage',
    description: "La ligne « Liste des commentaires » ouvre le volet sur l'onglet « Commentaires » : un fil par ligne dans l'ordre du texte (le passage cité, le dernier mot, les réponses) ; « Ouverts / Résolus / Tous » ; « Résoudre » et « Rouvrir » sur la ligne changent la marque du texte ; un clic va au passage et ouvre le fil ; « Suivant » le fait de proche en proche ; les deux onglets s'alternent par la ligne de chacun",
    run: async (h) => {
      try {
        await savedTemplateWithText(h, 'Commentaires volet', 'Premier passage commenté');
        Editor.setHTML('<p>Premier passage commenté</p><p>Second passage à voir</p><p>Troisième passage</p><p>Fin sans commentaire</p>');
        await h.sleep(150);
        const first = await commentParagraph(h, 0, 'Question sur le premier');
        const second = await commentParagraph(h, 1, 'Remarque sur le second');
        replyArea().value = 'Réponse au second';
        await pressPopupButton(h, '.v2-comment-popup-post');
        await closePopupIfOpen(h);
        const third = await commentParagraph(h, 2, 'Un mot sur le troisième');
        await closePopupIfOpen(h);
        if (!first || !second || !third) return { pass: false, notes: 'marques absentes : ' + [first, second, third] };
        // Le curseur dans le dernier paragraphe, sans commentaire : le volet dit « 3 commentaires », pas « n sur 3 ».
        EditorCore.getEditor().commands.setTextSelection(EditorCore.getEditor().state.doc.content.size - 2);
        const out = {};
        const menuRow = () => document.getElementById('v2-btn-comment-pane');
        out.rowFirst = !!menuRow() && menuRow().getAttribute('aria-pressed') === 'false';
        await h.clickButton('v2-btn-comment-pane');
        await h.sleep(300);
        out.opened = TrackChangesPane.isOpen() && TrackChangesPane.tab() === 'comments' && !commentPanel().hidden && document.getElementById('pp-track-panel-changes').hidden
          && menuRow().getAttribute('aria-pressed') === 'true' && menuRow().classList.contains('is-active') && !document.getElementById('v2-btn-track-pane').classList.contains('is-active');
        out.rows = threadRows().map(r => r.dataset.id).join() === [first, second, third].join();
        const rows = threadRows();
        out.quote = pick(rows[1], '.pp-trackpane-quote') === 'Second passage à voir';
        out.excerpt = /: Réponse au second$/.test(pick(rows[1], '.pp-trackpane-excerpt') || '') && pick(rows[0], '.pp-trackpane-excerpt') === 'Question sur le premier';
        out.replies = pick(rows[1], '.pp-trackpane-meta') === '1 réponse' && pick(rows[0], '.pp-trackpane-meta') === null;
        out.count = paneEl().querySelector('.pp-trackpane-count').textContent === '3 commentaires';
        out.options = Array.from(commentPanel().querySelectorAll('.pp-trackpane-threadfilter option')).map(o => o.textContent).join() === 'Ouverts (3),Résolus (0),Tous (3)';
        // Résoudre : la marque du texte change, la ligne quitte « Ouverts »
        rows[0].querySelector('.pp-trackpane-resolve').click();
        await h.sleep(450);
        out.resolved = Comments.listThreads()[0].resolved === true && /data-comment-id="[^"]*"[^>]*data-resolved="true"/.test(Editor.getHTML());
        out.leaves = threadRows().map(r => r.dataset.id).join() === [second, third].join() && paneEl().querySelector('.pp-trackpane-count').textContent === '2 commentaires';
        setThreadFilter('resolved');
        await h.sleep(150);
        const resolvedRows = threadRows();
        out.resolvedList = resolvedRows.length === 1 && resolvedRows[0].dataset.id === first && resolvedRows[0].classList.contains('is-resolved') && pick(resolvedRows[0], '.pp-trackpane-meta') === 'Résolu'
          && /^Rouvrir le commentaire de/.test(resolvedRows[0].querySelector('.pp-trackpane-resolve').title);
        resolvedRows[0].querySelector('.pp-trackpane-resolve').click();
        await h.sleep(450);
        out.reopened = Comments.listThreads()[0].resolved === false && threadRows().length === 0 && commentPanel().querySelector('.pp-trackpane-empty').textContent === 'Aucun commentaire résolu.';
        setThreadFilter('all');
        await h.sleep(150);
        out.all = threadRows().length === 3;
        // Un clic sur une ligne : le curseur au passage, la fenêtre du fil
        threadRows()[1].querySelector('.pp-trackpane-go').click();
        await h.sleep(350);
        const thread = Comments.listThreads()[1];
        const caret = EditorCore.getEditor().state.selection.from;
        out.go = caret >= thread.from && caret <= thread.to && popupVisible() && /Réponse au second/.test(popup().textContent) && threadRows()[1].classList.contains('is-current')
          && paneEl().querySelector('.pp-trackpane-count').textContent === '2 sur 3';
        paneEl().querySelector('.pp-trackpane-next').click();
        await h.sleep(350);
        out.next = threadRows()[2].classList.contains('is-current') && /Un mot sur le troisième/.test(popup().textContent) && paneEl().querySelector('.pp-trackpane-next').getAttribute('aria-label') === 'Commentaire suivant';
        paneEl().querySelector('.pp-trackpane-prev').click();
        await h.sleep(350);
        out.prev = threadRows()[1].classList.contains('is-current');
        await closePopupIfOpen(h);
        // Les deux onglets
        paneEl().querySelector('#pp-track-tab-changes').click();
        await h.sleep(200);
        out.tabChanges = TrackChangesPane.tab() === 'changes' && commentPanel().hidden && !document.getElementById('pp-track-panel-changes').hidden && document.getElementById('v2-btn-track-pane').classList.contains('is-active')
          && !menuRow().classList.contains('is-active') && paneEl().querySelector('.pp-trackpane-next').getAttribute('aria-label') === 'Modification suivante';
        await h.clickButton('v2-btn-comment-pane');
        await h.sleep(250);
        out.rowSwitches = TrackChangesPane.isOpen() && TrackChangesPane.tab() === 'comments' && menuRow().classList.contains('is-active') && threadRows().length === 3;
        await h.clickButton('v2-btn-comment-pane');
        await h.sleep(200);
        out.rowCloses = !TrackChangesPane.isOpen() && menuRow().getAttribute('aria-pressed') === 'false';
        return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) };
      } finally { closePaneIfOpen(); await closePopupIfOpen(h); }
    },
  });

  cases.push({
    id: 'comment_pane_follows_posted_replies_and_a_document_without_comments',
    description: "Le volet ouvert sur les commentaires se redessine tout seul quand une réponse est publiée (le nombre de réponses, le dernier mot) et quand le texte perd ses commentaires (« Aucun commentaire dans ce modèle. ») ; sans éditeur à l'écran il n'ouvre rien",
    run: async (h) => {
      try {
        await savedTemplateWithText(h, 'Commentaires volet suivi', 'Un texte à commenter');
        const id = await commentFirstParagraph(h);
        if (!id) return { pass: false, notes: 'aucune marque posée' };
        await postFirstMessage(h, 'Un premier mot');
        const out = {};
        TrackChangesPane.open('comments');
        await h.sleep(300);
        out.one = threadRows().length === 1 && pick(threadRows()[0], '.pp-trackpane-meta') === null;
        replyArea().value = 'Une réponse tapée pendant que le volet est ouvert';
        await pressPopupButton(h, '.v2-comment-popup-post');
        await closePopupIfOpen(h);
        await h.sleep(450);
        out.replied = pick(threadRows()[0], '.pp-trackpane-meta') === '1 réponse' && /: Une réponse tapée/.test(pick(threadRows()[0], '.pp-trackpane-excerpt') || '');
        Editor.setHTML('<p>Rien à commenter</p>');
        await h.sleep(450);
        out.empty = threadRows().length === 0 && commentPanel().querySelector('.pp-trackpane-empty').textContent === 'Aucun commentaire dans ce modèle.'
          && commentPanel().querySelector('.pp-trackpane-threadfilter').closest('.pp-trackpane-filterrow').hidden && paneEl().querySelector('.pp-trackpane-count').textContent === '';
        return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) };
      } finally { closePaneIfOpen(); await closePopupIfOpen(h); }
    },
  });

  cases.push({
    id: 'comment_pane_buttons_are_greyed_without_comment_rights_and_resolve_nothing',
    description: "Sans le droit de commenter, « Résoudre » du volet est grisé (jamais retiré, atteignable, avec la raison en infobulle) et un clic ne résout rien ; le droit rendu, il résout",
    run: async (h) => {
      try {
        await savedTemplateWithText(h, 'Commentaires volet droits', 'Un texte à commenter');
        const id = await commentFirstParagraph(h);
        if (!id) return { pass: false, notes: 'aucune marque posée' };
        await postFirstMessage(h, 'Un mot');
        await closePopupIfOpen(h);
        const out = {};
        TrackChangesPane.open('comments');
        await h.sleep(300);
        const button = () => threadRows()[0].querySelector('.pp-trackpane-resolve');
        out.enabled = button().getAttribute('aria-disabled') !== 'true';
        Comments.setPermissions({ canComment: false, readerMode: false });
        await h.sleep(450);
        out.greyed = button().getAttribute('aria-disabled') === 'true' && button().title === I18n.t('lock.noComment') && !button().disabled;
        button().click();
        await h.sleep(350);
        out.untouched = Comments.listThreads()[0].resolved === false && threadRows().length === 1;
        Comments.setPermissions({ canComment: true, readerMode: false });
        await h.sleep(450);
        out.back = button().getAttribute('aria-disabled') !== 'true';
        button().click();
        await h.sleep(450);
        out.resolved = Comments.listThreads()[0].resolved === true;
        return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) };
      } finally { Comments.setPermissions({ canComment: true, readerMode: false }); closePaneIfOpen(); await closePopupIfOpen(h); }
    },
  });

  cases.push({
    id: 'comment_pane_row_click_keeps_the_window_of_a_thread_being_written',
    description: "Un clic sur la ligne d'un autre fil ne ferme pas la fenêtre d'un fil tout neuf dont le premier message est en train d'être tapé : le texte se déplace, la fenêtre et la saisie restent, et le message se publie ensuite",
    run: async (h) => {
      try {
        await savedTemplateWithText(h, 'Commentaires volet saisie', 'Premier passage commenté');
        Editor.setHTML('<p>Premier passage commenté</p><p>Second passage à voir</p>');
        await h.sleep(150);
        const first = await commentParagraph(h, 0, 'Un mot sur le premier');
        await closePopupIfOpen(h);
        const second = await commentParagraph(h, 1, null);
        if (!first || !second) return { pass: false, notes: 'marques absentes : ' + first + ' / ' + second };
        replyArea().value = 'Un premier mot encore à publier';
        TrackChangesPane.open('comments');
        await h.sleep(300);
        const out = {};
        out.listed = threadRows().map(r => r.dataset.id).join() === first + ',' + second;
        threadRows()[0].querySelector('.pp-trackpane-go').click();
        await h.sleep(400);
        out.stays = popupVisible() && replyArea() && replyArea().value === 'Un premier mot encore à publier' && !/Un mot sur le premier/.test(popup().textContent);
        out.markKept = !!document.querySelector('.tiptap .comment-mark[data-comment-id="' + second + '"]');
        await pressPopupButton(h, '.v2-comment-popup-post');
        await closePopupIfOpen(h);
        await h.sleep(400);
        out.published = Comments.listThreads()[1].count === 1 && rowsFor(second).length === 1 && rowsFor(second)[0].texte === 'Un premier mot encore à publier';
        return { pass: Object.values(out).every(Boolean), notes: JSON.stringify(out) };
      } finally { closePaneIfOpen(); await closePopupIfOpen(h); }
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.comments = cases;
})();
