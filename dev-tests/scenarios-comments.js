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

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.comments = cases;
})();
