// Suite "accessRights" - droits par personne (js/access-rights.js, câblés par js/main.js:applyAccessRights et js/comments.js:readerMode), demande
// d'Antoine du 2026-09-28 : lecture seule, export autorisé, commentaires autorisés, lus dans une table Grist choisie dans Réglages > Accès.
//
// Le réglage vit dans les options du widget : chaque scénario le pose comme Grist le ferait (stub.setWidgetOptions -> onOptions), avec une ligne de
// droits pour l'email que renvoie la formule déclenchée de Publipostage_UserProbe (stub.setUserEmail). Le même email pour toute la suite : GristAPI le
// garde en cache après la première identification, comme en vrai. Chaque scénario retire le réglage en partant (cleanup), le suivant repart avec tous
// les droits et en mode Édition.
(function () {
  const cases = [];
  const stub = () => window.__gristStub;
  const RIGHTS_TABLE = 'PpDroits';
  const DATA_TABLE = 'PpClients';
  const EMAIL = 'lecteur@exemple.fr';
  const CONFIG = { table: RIGHTS_TABLE, emailColumn: 'Email', readOnlyColumn: 'LectureSeule', exportColumn: 'Export', commentsColumn: 'Commentaires' };
  const TEMPLATE_HTML = '<p>Bonjour <span class="var-badge" data-table="' + DATA_TABLE + '" data-column="Nom" data-key="' + DATA_TABLE + '.Nom"></span>, voici le contrat de location.</p><p>Second paragraphe.</p>';

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  async function waitFor(fn, timeoutMs) {
    const t0 = Date.now();
    while (Date.now() - t0 < (timeoutMs || 3000)) { if (fn()) return true; await sleep(40); }
    return !!fn();
  }
  const locked = id => { const el = document.getElementById(id); return !!el && el.classList.contains('pp-access-locked'); };
  const shown = id => { const el = document.getElementById(id); return !!el && getComputedStyle(el).display !== 'none' && !el.hidden; };
  const inReadMode = () => document.getElementById('reader-container').style.display === 'block' && document.getElementById('editor-container').style.display === 'none';
  const popup = () => document.getElementById('v2-comment-popup');
  const popupVisible = () => { const p = popup(); return !!p && p.style.display !== 'none'; };
  async function pressPopupButton(selector) {
    const btn = popup() && popup().querySelector(selector);
    if (!btn) throw new Error('Bouton de popup introuvable : ' + selector);
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await sleep(400);
  }
  function commentRows() {
    const t = stub().state.rows.Publipostage_Commentaires;
    return t ? t.id.map((id, i) => ({ id, commentId: t.CommentId[i], texte: t.Texte[i], auteur: t.Auteur[i] })) : [];
  }

  // Modèle enregistré (avec tous les droits) et ligne courante fournie : le mode Lecture a de quoi se dessiner, variable résolue comprise.
  async function savedTemplate(h, nom, html) {
    await h.resetEditor();
    stub().setVariables(DATA_TABLE, { Nom: 'Text' });
    stub().setRows(DATA_TABLE, [{ id: 1, Nom: 'Dupont' }]);
    await GristAPI.refreshSchema();
    stub().fireRecord({ id: 1, Nom: 'Dupont' }, DATA_TABLE);
    Editor.setHTML(html || TEMPLATE_HTML);
    document.getElementById('template-name').value = nom;
    await h.clickButton('btn-save');
    await sleep(500);
    return Templates.getCurrentId();
  }

  // Ligne de droits de la personne courante + réglage du widget ; attend que l'interface les ait appliqués (mode Lecture redessiné compris).
  async function applyRights(flags) {
    const want = { readOnly: !!flags.readOnly, canExport: flags.export !== false, canComment: flags.comments !== false };
    stub().setUserEmail(EMAIL);
    stub().setVariables(RIGHTS_TABLE, { Email: 'Text', LectureSeule: 'Bool', Export: 'Bool', Commentaires: 'Bool' });
    // Email écrit autrement que celui de Grist (casse) : la comparaison ne doit pas en dépendre.
    stub().setRows(RIGHTS_TABLE, [
      { id: 1, Email: 'autre@exemple.fr', LectureSeule: true, Export: false, Commentaires: false },
      { id: 2, Email: 'Lecteur@Exemple.fr', LectureSeule: want.readOnly, Export: want.canExport, Commentaires: want.canComment },
    ]);
    await GristAPI.refreshSchema();
    stub().setWidgetOptions({ droitsAcces: CONFIG });
    await sleep(60);
    // Réglage identique au précédent : rien ne se relance tout seul, la relecture de la minuterie (10 s) est faite ici tout de suite.
    await AccessRights.refresh();
    const ok = await waitFor(() => { const r = AccessRights.get(); return r.readOnly === want.readOnly && r.canExport === want.canExport && r.canComment === want.canComment; });
    await sleep(500);
    return ok;
  }

  async function cleanup() {
    if (popupVisible()) await pressPopupButton('.v2-comment-popup-close');
    stub().setWidgetOptions(null);
    await waitFor(() => !AccessRights.getConfig() && !AccessRights.get().readOnly);
    await sleep(200);
    const btnEdit = document.getElementById('btn-mode-edit');
    btnEdit.click();
    await sleep(300);
  }

  // Sélection réelle (Range DOM) d'un texte du mode Lecture.
  function selectInReader(text) {
    const content = document.querySelector('#reader-container .reader-content');
    if (!content) return false;
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const i = node.data.indexOf(text);
      if (i === -1) continue;
      const range = document.createRange();
      range.setStart(node, i);
      range.setEnd(node, i + text.length);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      return true;
    }
    return false;
  }

  function markedTextInEditorDoc() {
    const out = [];
    EditorCore.getEditor().state.doc.descendants(node => {
      if (!node.isInline) return;
      const m = node.marks.find(mk => mk.type.name === 'commentMark');
      if (m) out.push({ id: m.attrs.id, kind: node.isText ? 'text' : node.type.name, text: node.isText ? node.text : '' });
    });
    return out;
  }

  cases.push({
    id: 'access_readonly_forces_read_mode_and_greys_editing',
    description: 'Lecture seule : mode Lecture imposé, commandes d’édition grisées (pas retirées), Enregistrer et Ctrl+S n’écrivent rien',
    run: async (h) => {
      await savedTemplate(h, 'Droits lecture seule');
      const applied = await applyRights({ readOnly: true, export: true, comments: false });
      const read = inReadMode();
      document.getElementById('btn-mode-edit').click();
      await sleep(300);
      const stillRead = inReadMode();
      // Commande grisée sans garde propre (la fenêtre Tables liées écrit des règles) : seul l'arrêt du clic en capture l'empêche de s'ouvrir.
      document.getElementById('btn-link-rules').click();
      await sleep(200);
      const linkRulesClosed = document.getElementById('link-rules-modal').style.display === 'none';
      const writesBefore = stub().countActions('UpdateRecord', 'Publipostage_Modeles') + stub().countActions('AddRecord', 'Publipostage_Modeles');
      // Document modifié sans passer par l'édition (comme une marque de commentaire dont l'enregistrement aurait échoué) : l'auto-save, qui le voit
      // "modifié", ne doit pas l'écrire pour autant.
      EditorCore.getEditor().commands.insertContentAt(1, 'x');
      document.getElementById('btn-save').click();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));
      await sleep(3000); // plus d'un tick d'auto-save (2,5 s)
      const writesAfter = stub().countActions('UpdateRecord', 'Publipostage_Modeles') + stub().countActions('AddRecord', 'Publipostage_Modeles');
      const editIds = ['btn-mode-edit', 'v2-save-group', 'btn-delete', 'btn-organize-templates', 'v2-new-template-group', 'btn-link-rules', 'v2-page-group', 'v2-btn-bold', 'v2-btn-comment'];
      const greyed = editIds.filter(id => locked(id) && shown(id));
      const exportFree = !locked('v2-export-pdf-group') && !locked('v2-quality-group');
      const status = document.getElementById('status-msg').textContent;
      await cleanup();
      const backToEdit = !inReadMode();
      const pass = applied && read && stillRead && linkRulesClosed && writesAfter === writesBefore && greyed.length === editIds.length && exportFree
        && /Lecture seule/.test(status) && backToEdit;
      return { pass, notes: JSON.stringify({ applied, read, stillRead, linkRulesClosed, writesBefore, writesAfter, greyed, exportFree, status, backToEdit }) };
    },
  });

  cases.push({
    id: 'access_export_denied_greys_every_export',
    description: 'Export non autorisé : PDF (une ligne, ZIP, PDF unique), Word et email grisés et sans effet, l’édition reste possible',
    run: async (h) => {
      await savedTemplate(h, 'Droits sans export');
      const applied = await applyRights({ readOnly: false, export: false, comments: true });
      const calls = [];
      const origPdf = PdfExport.exportCurrentRecord;
      const origDocx = DocxExport.exportCurrentRecord;
      PdfExport.exportCurrentRecord = async () => { calls.push('pdf'); };
      DocxExport.exportCurrentRecord = async () => { calls.push('docx'); };
      const dialogs = h.stubDialogs({ confirm: () => { calls.push('confirm'); return false; } });
      try {
        ['btn-export-pdf', 'v2-btn-export-pdf-batch', 'v2-btn-export-pdf-merged', 'v2-btn-export-docx', 'v2-btn-export-docx-batch', 'btn-create-email']
          .forEach(id => document.getElementById(id).click());
        await sleep(400);
      } finally {
        PdfExport.exportCurrentRecord = origPdf;
        DocxExport.exportCurrentRecord = origDocx;
        dialogs.restore();
      }
      const greyed = ['v2-export-pdf-group', 'v2-quality-group', 'btn-create-email'].filter(locked);
      const editFree = !locked('v2-save-group') && !locked('btn-mode-edit') && !inReadMode();
      await cleanup();
      const unlocked = !locked('v2-export-pdf-group') && !locked('v2-quality-group');
      const pass = applied && calls.length === 0 && greyed.length === 3 && editFree && unlocked;
      return { pass, notes: JSON.stringify({ applied, calls, greyed, editFree, unlocked }) };
    },
  });

  cases.push({
    id: 'access_rights_follow_table_and_setting_changes',
    description: 'Case décochée dans la table : la lecture seule tombe à la relecture suivante ; réglage retiré : tous les droits reviennent',
    run: async (h) => {
      await savedTemplate(h, 'Droits qui changent');
      const first = await applyRights({ readOnly: true, export: false, comments: false });
      const lockedFirst = locked('btn-mode-edit') && inReadMode();
      // Même réglage, ligne modifiée comme par quelqu'un dans la grille : seule la relecture périodique (ici forcée) la voit.
      const second = await applyRights({ readOnly: false, export: false, comments: false });
      const editBack = !locked('btn-mode-edit') && !locked('v2-save-group') && locked('v2-export-pdf-group');
      document.getElementById('btn-mode-edit').click();
      await sleep(300);
      const canEdit = !inReadMode();
      stub().setWidgetOptions(null);
      await waitFor(() => !AccessRights.getConfig());
      await sleep(300);
      const allBack = !locked('v2-export-pdf-group') && !locked('v2-btn-comment') && AccessRights.getStatus().state === 'off';
      await cleanup();
      const pass = first && lockedFirst && second && editBack && canEdit && allBack;
      return { pass, notes: JSON.stringify({ first, lockedFirst, second, editBack, canEdit, allBack }) };
    },
  });

  cases.push({
    id: 'access_unreadable_rights_table_locks',
    description: 'Table des droits illisible pour la personne (règle d’accès Grist) : tout verrouillé par précaution, jamais tous les droits',
    run: async (h) => {
      await savedTemplate(h, 'Droits illisibles');
      await applyRights({ readOnly: false, export: true, comments: true });
      const origFetch = grist.docApi.fetchTable;
      grist.docApi.fetchTable = async (tableId) => {
        if (tableId === RIGHTS_TABLE) throw new Error('Blocked by table read access rules');
        return origFetch(tableId);
      };
      let rights, state, greyed;
      try {
        await AccessRights.refresh();
        await sleep(500);
        rights = AccessRights.get();
        state = AccessRights.getStatus().state;
        greyed = ['v2-save-group', 'v2-export-pdf-group', 'v2-btn-comment'].filter(locked);
      } finally {
        grist.docApi.fetchTable = origFetch;
      }
      const read = inReadMode();
      await cleanup();
      const pass = rights.readOnly && !rights.canExport && !rights.canComment && state === 'error' && greyed.length === 3 && read;
      return { pass, notes: JSON.stringify({ rights, state, greyed, read }) };
    },
  });

  cases.push({
    id: 'access_reader_comment_anchors_selection_and_saves_template',
    description: 'Lecture seule + commentaires : sélectionner du texte en mode Lecture et publier pose la marque sur CE texte, enregistre le modèle et le fil',
    run: async (h) => {
      const modeleId = await savedTemplate(h, 'Droits commentaire en lecture');
      const applied = await applyRights({ readOnly: true, export: false, comments: true });
      const readerClass = document.getElementById('reader-container').classList.contains('pp-reader-comments');
      const selected = selectInReader('le contrat');
      await h.clickButton('v2-btn-comment');
      await waitFor(popupVisible, 3000);
      const marks = markedTextInEditorDoc();
      const readerMark = document.querySelector('#reader-container .comment-mark');
      const readerMarkText = readerMark ? readerMark.textContent : null;
      const highlight = readerMark ? getComputedStyle(readerMark).backgroundColor : null;
      const updatesBefore = stub().countActions('UpdateRecord', 'Publipostage_Modeles');
      const area = popup().querySelector('.v2-comment-popup-reply');
      area.value = 'Clause à revoir';
      await pressPopupButton('.v2-comment-popup-post');
      await sleep(400);
      const updatesAfter = stub().countActions('UpdateRecord', 'Publipostage_Modeles');
      const row = stub().getRow('Publipostage_Modeles', modeleId);
      const commentId = marks.length ? marks[0].id : null;
      const thread = commentRows().filter(r => r.commentId === commentId);
      const savedHasMark = !!row && row.Contenu.indexOf('data-comment-id="' + commentId + '"') !== -1 && /class="comment-mark">le contrat<\/span>/.test(row.Contenu);
      await pressPopupButton('.v2-comment-popup-close');
      // Clic sur le texte commenté du mode Lecture : le fil se rouvre avec son message.
      const again = document.querySelector('#reader-container .comment-mark');
      if (again) again.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await sleep(300);
      const reopened = popupVisible() && (popup().textContent || '').indexOf('Clause à revoir') !== -1;
      await cleanup();
      const pass = applied && readerClass && selected && marks.length === 1 && marks[0].text === 'le contrat' && readerMarkText === 'le contrat'
        && highlight !== 'rgba(0, 0, 0, 0)' && updatesAfter === updatesBefore + 1 && savedHasMark
        && thread.length === 1 && thread[0].texte === 'Clause à revoir' && thread[0].auteur === EMAIL && reopened;
      return { pass, notes: JSON.stringify({ applied, readerClass, selected, marks, readerMarkText, highlight, updatesBefore, updatesAfter, savedHasMark, thread, reopened }) };
    },
  });

  cases.push({
    id: 'access_reader_comment_on_variable_value_then_cancel',
    description: 'Sélection de la seule valeur d’une variable en Lecture : la marque couvre la bulle ; Fermer sans publier la retire et n’enregistre rien',
    run: async (h) => {
      await savedTemplate(h, 'Droits commentaire sur variable');
      const applied = await applyRights({ readOnly: true, export: false, comments: true });
      const selected = selectInReader('Dupont');
      await h.clickButton('v2-btn-comment');
      await waitFor(popupVisible, 3000);
      const marks = markedTextInEditorDoc();
      const readerMark = document.querySelector('#reader-container .comment-mark');
      const readerMarkText = readerMark ? readerMark.textContent : null;
      const updatesBefore = stub().countActions('UpdateRecord', 'Publipostage_Modeles');
      await pressPopupButton('.v2-comment-popup-close');
      await sleep(400);
      const marksAfter = markedTextInEditorDoc();
      const readerMarkAfter = document.querySelector('#reader-container .comment-mark');
      const updatesAfter = stub().countActions('UpdateRecord', 'Publipostage_Modeles');
      await cleanup();
      const pass = applied && selected && marks.length === 1 && marks[0].kind === 'varBadge' && readerMarkText === 'Dupont'
        && marksAfter.length === 0 && !readerMarkAfter && updatesAfter === updatesBefore;
      return { pass, notes: JSON.stringify({ applied, selected, marks, readerMarkText, marksAfter, readerMarkAfter: !!readerMarkAfter, updatesBefore, updatesAfter }) };
    },
  });

  cases.push({
    id: 'access_reader_comment_refused_when_template_changed_elsewhere',
    description: 'Modèle modifié ailleurs depuis son chargement : le commentaire posé en Lecture n’écrase rien, ni modèle ni fil, et le dit',
    run: async (h) => {
      const modeleId = await savedTemplate(h, 'Droits conflit en lecture');
      const applied = await applyRights({ readOnly: true, export: false, comments: true });
      stub().remoteWrite('Publipostage_Modeles', modeleId, { Contenu: '<p>Version de quelqu’un d’autre</p>', DateModif: new Date(Date.now() + 60000).toISOString() });
      const alerts = [];
      const origAlert = window.alert;
      window.alert = msg => { alerts.push(msg); };
      let rowsBefore, updatesBefore, updatesAfter, rowsAfter, contenu;
      try {
        selectInReader('le contrat');
        await h.clickButton('v2-btn-comment');
        await waitFor(popupVisible, 3000);
        rowsBefore = commentRows().length;
        updatesBefore = stub().countActions('UpdateRecord', 'Publipostage_Modeles');
        popup().querySelector('.v2-comment-popup-reply').value = 'Ne doit pas partir';
        await pressPopupButton('.v2-comment-popup-post');
        await sleep(400);
        updatesAfter = stub().countActions('UpdateRecord', 'Publipostage_Modeles');
        rowsAfter = commentRows().length;
        contenu = stub().getRow('Publipostage_Modeles', modeleId).Contenu;
      } finally {
        window.alert = origAlert;
      }
      const banner = document.getElementById('autosave-conflict-banner').style.display !== 'none';
      await cleanup();
      // Le bandeau "modifié ailleurs" reste affiché : on recharge la version distante pour ne pas le laisser au scénario suivant.
      document.getElementById('autosave-conflict-reload').click();
      await sleep(300);
      const pass = applied && updatesAfter === updatesBefore && rowsAfter === rowsBefore && contenu.indexOf('quelqu’un d’autre') !== -1
        && alerts.length === 1 && alerts[0] === I18n.t('comments.saveError') && banner;
      return { pass, notes: JSON.stringify({ applied, updatesBefore, updatesAfter, rowsBefore, rowsAfter, alerts, banner }) };
    },
  });

  cases.push({
    id: 'access_no_comment_right_greys_thread_controls',
    description: 'Commentaires non autorisés : bouton Commenter grisé, un fil existant reste lisible mais sa saisie et ses actions sont grisées',
    run: async (h) => {
      await savedTemplate(h, 'Droits sans commentaires', '<p>Un paragraphe déjà commenté</p>');
      await h.selectAllInElement(document.querySelector('.tiptap p'));
      await h.clickButton('v2-btn-comment');
      await sleep(250);
      popup().querySelector('.v2-comment-popup-reply').value = 'Premier message';
      await pressPopupButton('.v2-comment-popup-post');
      await pressPopupButton('.v2-comment-popup-close');
      const rowsBefore = commentRows().length;
      const applied = await applyRights({ readOnly: false, export: true, comments: false });
      const buttonGreyed = locked('v2-btn-comment');
      const mark = document.querySelector('.tiptap .comment-mark');
      mark.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      await sleep(250);
      const p = popup();
      const readable = popupVisible() && (p.textContent || '').indexOf('Premier message') !== -1;
      const controls = Array.from(p.querySelectorAll('.v2-comment-popup-reply, .v2-comment-popup-actions button'));
      const allDisabled = controls.length === 4 && controls.every(c => c.disabled);
      p.querySelector('.v2-comment-popup-reply').value = 'Ne doit pas partir';
      await pressPopupButton('.v2-comment-popup-post');
      const rowsAfter = commentRows().length;
      await cleanup();
      const pass = applied && buttonGreyed && readable && allDisabled && rowsAfter === rowsBefore;
      return { pass, notes: JSON.stringify({ applied, buttonGreyed, readable, controls: controls.length, allDisabled, rowsBefore, rowsAfter }) };
    },
  });

  cases.push({
    id: 'access_settings_tab_writes_widget_option',
    description: 'Réglages > Accès : choisir la table pré-choisit la colonne email, choisir une case écrit l’option du widget ; verrouillé pour qui est en lecture seule',
    run: async (h) => {
      await savedTemplate(h, 'Droits réglage');
      stub().setVariables(RIGHTS_TABLE, { Email: 'Text', LectureSeule: 'Bool', Export: 'Bool', Commentaires: 'Bool' });
      stub().setRows(RIGHTS_TABLE, [{ id: 1, Email: EMAIL, LectureSeule: true, Export: true, Commentaires: true }]);
      stub().setUserEmail(EMAIL);
      document.getElementById('v2-btn-settings').click();
      await sleep(300);
      const choose = async (id, value) => {
        const select = document.getElementById(id);
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(300);
      };
      // Les cinq choix (la table, puis quatre colonnes) sont des listes avec recherche (js/search-select.js) : le champ visible suit le <select> masqué.
      const searchField = id => document.getElementById(id).nextElementSibling.querySelector('.ss-trigger');
      await choose('settings-access-table', RIGHTS_TABLE);
      const tableShown = searchField('settings-access-table').textContent;
      const emailPicked = document.getElementById('settings-access-email').value;
      const emailShown = searchField('settings-access-email').textContent;
      const optionsAfterTable = stub().state.options && stub().state.options.droitsAcces;
      await choose('settings-access-readonly', 'LectureSeule');
      const option = stub().state.options && stub().state.options.droitsAcces;
      await waitFor(() => AccessRights.get().readOnly);
      await sleep(400);
      const selectsDisabled = ['settings-access-table', 'settings-access-email', 'settings-access-readonly', 'settings-access-export', 'settings-access-comments']
        .every(id => document.getElementById(id).disabled);
      const searchFields = ['settings-access-table', 'settings-access-email', 'settings-access-readonly', 'settings-access-export', 'settings-access-comments'].map(searchField);
      const readOnlyShown = searchField('settings-access-readonly').textContent;
      searchFields.forEach(field => field.click());
      const fieldsDisabled = searchFields.length === 5 && searchFields.every(field => field.disabled && field.parentNode.querySelector('.ss-panel').hidden);
      const lockedHint = !document.getElementById('settings-access-locked').hidden;
      const statusText = document.getElementById('settings-access-status').textContent;
      document.getElementById('settings-close').click();
      await cleanup();
      const pass = tableShown === RIGHTS_TABLE && emailPicked === 'Email' && emailShown === 'Email' && readOnlyShown === 'LectureSeule' && fieldsDisabled && optionsAfterTable == null
        && !!option && option.table === RIGHTS_TABLE && option.emailColumn === 'Email' && option.readOnlyColumn === 'LectureSeule'
        && option.exportColumn === '' && option.commentsColumn === '' && selectsDisabled && lockedHint && statusText.indexOf(EMAIL) !== -1;
      return { pass, notes: JSON.stringify({ tableShown, emailPicked, emailShown, readOnlyShown, fieldsDisabled, optionsAfterTable, option, selectsDisabled, lockedHint, statusText }) };
    },
  });

  // Ce mode Lecture-là bâtit son HTML autrement (Comments.buildReaderHtml : chaque texte dans un <span data-pp-pos>, positions du modèle) : les sauts de
  // ligne y passent par un chemin de plus que le mode Lecture ordinaire (dev-tests/scenarios-readmode-fidelity.js), d'où un scénario ici aussi.
  cases.push({
    id: 'access_reader_comments_html_keeps_blank_lines_and_line_breaks',
    description: 'Lecture seule + commentaires : les lignes vides du modèle, les retours à la ligne saisis et ceux d’une valeur de cellule gardent leur hauteur',
    run: async (h) => {
      const address = 'Rue de la Paix\n75002 Paris\nFrance';
      const badge = '<span class="var-badge" data-table="' + DATA_TABLE + '" data-column="Adresse" data-key="' + DATA_TABLE + '.Adresse"></span>';
      const html = '<p>Madame, Monsieur,</p><p></p><p>Cellule : ' + badge + '</p><p>Saisie : Rue de la Paix<br>75002 Paris<br>France</p><p>Fin repère</p>';
      await savedTemplate(h, 'Droits lignes vides en lecture', html);
      stub().setVariables(DATA_TABLE, { Nom: 'Text', Adresse: 'Text' });
      stub().setRows(DATA_TABLE, [{ id: 1, Nom: 'Dupont', Adresse: address }]);
      await GristAPI.refreshSchema();
      stub().fireRecord({ id: 1, Nom: 'Dupont', Adresse: address }, DATA_TABLE);
      const applied = await applyRights({ readOnly: true, export: false, comments: true });
      await sleep(300);
      const readerClass = document.getElementById('reader-container').classList.contains('pp-reader-comments');
      const content = document.querySelector('#reader-container .reader-content');
      const annotated = !!content && !!content.querySelector('[data-pp-pos]');
      const ps = content ? Array.from(content.querySelectorAll(':scope > p')) : [];
      const line = ps.length ? parseFloat(getComputedStyle(ps[0]).lineHeight) : 0;
      const heights = ps.map(p => p.getBoundingClientRect().height);
      await cleanup();
      const pass = applied && readerClass && annotated && ps.length === 5 && line > 0
        && heights[1] > 0.9 * line
        && heights[2] > 2.5 * line && Math.abs(heights[2] - heights[3]) <= 1.5;
      return { pass, notes: JSON.stringify({ applied, readerClass, annotated, line, heights }) };
    },
  });

  // Mode Lecture ordinaire (tous les droits, aucun réglage) - audit du 2026-09-29, F1 : l'éditeur y est masqué mais la barre de mise en forme restait
  // active, un clic sur Tableau, Sommaire ou Citation modifiait le modèle caché et l'auto-save l'enregistrait sans rien montrer.
  cases.push({
    id: 'access_read_mode_greys_formatting_bar_and_writes_nothing',
    description: 'Mode Lecture choisi (tous les droits) : barre de mise en forme grisée sauf Commenter, ses clics ne modifient ni le document ni le modèle enregistré ; tout redevient actif en Édition',
    run: async (h) => {
      const templateId = await savedTemplate(h, 'Lecture barre grisée');
      const children = () => Array.from(document.getElementById('v2-toolbar').children);
      const barLocked = () => children().filter(el => el.id !== 'v2-btn-comment').every(el => el.classList.contains('pp-access-locked') && el.getAttribute('aria-disabled') === 'true');
      const barFree = () => children().every(el => !el.classList.contains('pp-access-locked') && !el.hasAttribute('aria-disabled'));
      const stored = () => stub().getRow('Publipostage_Modeles', templateId).Contenu;
      const modelWrites = () => stub().countActions('UpdateRecord', 'Publipostage_Modeles') + stub().countActions('AddRecord', 'Publipostage_Modeles');
      // Le menu « Lien et blocs de contenu » : son bouton et ses six lignes, « QR code… » comprise (les lignes se cliquent par .click(), la souris ne les atteint pas sans survol).
      const insertIds = ['v2-btn-table', 'v2-btn-two-columns', 'v2-btn-page-break', 'v2-btn-toc', 'v2-btn-link', 'v2-row-link', 'v2-btn-citation', 'v2-btn-code-block', 'v2-btn-callout', 'v2-btn-signature', 'v2-btn-qr'];
      const freeBefore = barFree();
      document.getElementById('btn-mode-read').click();
      await sleep(400);
      const read = inReadMode();
      const lockedInRead = barLocked();
      // Ce qui doit rester actif en Lecture : les modes, l'aperçu A4, les réglages, l'arbre des modèles, l'export, Enregistrer et Commenter.
      const stillActiveIds = ['btn-mode-edit', 'btn-mode-read', 'v2-a4-toggle', 'v2-btn-settings', 'tts-trigger', 'v2-export-pdf-group', 'v2-quality-group', 'btn-create-email', 'v2-save-group', 'v2-btn-comment'];
      const wronglyGreyed = stillActiveIds.filter(id => locked(id));
      const docBefore = Editor.getHTML();
      const storedBefore = stored();
      const writesBefore = modelWrites();
      // Pas d'Annuler ici : les clics tombent dans un même groupe d'historique, un seul Annuler rendrait le document intact et masquerait les insertions.
      insertIds.concat(['v2-btn-track-changes', 'v2-btn-bold']).forEach(id => document.getElementById(id).click());
      await sleep(3000); // plus d'un tick d'auto-save (2,5 s)
      const docUnchanged = Editor.getHTML() === docBefore;
      // Les lignes « Lien… », « Encadré… » et « QR code… » ouvrent une fenêtre : en Lecture elle ne doit pas s'ouvrir (le document seul ne le dirait pas, rien n'y est encore écrit).
      const windowsClosed = ['pp-link-modal', 'pp-callout-modal', 'pp-qr-modal'].every(id => { const m = document.getElementById(id); return !m || m.style.display === 'none'; });
      const storedUnchanged = stored() === storedBefore && modelWrites() === writesBefore;
      document.getElementById('btn-mode-edit').click();
      await sleep(400);
      const freeAgain = barFree() && !inReadMode();
      document.getElementById('v2-btn-table').click();
      await sleep(300);
      const editStillInserts = (Editor.getHTML().match(/<table/g) || []).length === 1;
      const pass = freeBefore && read && lockedInRead && wronglyGreyed.length === 0 && docUnchanged && windowsClosed && storedUnchanged && freeAgain && editStillInserts;
      return { pass, notes: JSON.stringify({ freeBefore, read, lockedInRead, wronglyGreyed, docUnchanged, windowsClosed, storedUnchanged, freeAgain, editStillInserts }) };
    },
  });

  // Mode Lecture ordinaire (tous les droits, aucun réglage) - choix d'Antoine du 2026-09-30, « Commenter dans la Lecture ». Avant, Commenter y agissait sur la
  // sélection de l'ÉDITEUR masqué : marque posée sur un texte qu'on ne voit pas, enregistrée par l'auto-save, fenêtre dans le coin haut gauche. Il agit
  // maintenant sur le texte sélectionné DANS la Lecture, comme en lecture seule (mêmes fonctions : Comments.readerMode, positions data-pp-pos).
  cases.push({
    id: 'access_read_mode_comment_lands_on_the_reader_selection',
    description: 'Mode Lecture choisi (tous les droits) : Commenter pose la marque sur le texte sélectionné DANS la Lecture (pas sur la sélection de l’éditeur masqué), la surligne en Lecture, colle la fenêtre à elle, enregistre modèle et fil ; en Édition, Commenter reprend l’éditeur',
    run: async (h) => {
      const modeleId = await savedTemplate(h, 'Commentaire en Lecture choisie');
      // Sélection de l'éditeur différente de celle qui sera faite dans la Lecture : l'ancien Commenter la marquait, alors qu'elle est masquée.
      EditorCore.getEditor().commands.setTextSelection({ from: 1, to: 8 });
      await sleep(60);
      document.getElementById('btn-mode-read').click();
      await sleep(600);
      const inRead = inReadMode();
      const readerClass = document.getElementById('reader-container').classList.contains('pp-reader-comments');
      const readerMode = Comments.isReaderMode();
      const selected = selectInReader('le contrat');
      await h.clickButton('v2-btn-comment');
      await waitFor(popupVisible, 3000);
      const marks = markedTextInEditorDoc();
      const readerMark = document.querySelector('#reader-container .comment-mark');
      const readerMarkText = readerMark ? readerMark.textContent : null;
      const highlight = readerMark ? getComputedStyle(readerMark).backgroundColor : null;
      const pop = popup().getBoundingClientRect();
      const markBox = readerMark ? readerMark.getBoundingClientRect() : null;
      const nearMark = !!markBox && Math.min(Math.abs(pop.top - markBox.bottom), Math.abs(markBox.top - pop.bottom)) <= 12;
      popup().querySelector('.v2-comment-popup-reply').value = 'À reformuler';
      await pressPopupButton('.v2-comment-popup-post');
      await sleep(400);
      const commentId = marks.length ? marks[0].id : null;
      const row = stub().getRow('Publipostage_Modeles', modeleId);
      const savedHasMark = !!row && row.Contenu.indexOf('data-comment-id="' + commentId + '"') !== -1 && /class="comment-mark">le contrat<\/span>/.test(row.Contenu)
        && !/class="comment-mark">Bonjour/.test(row.Contenu);
      const thread = commentRows().filter(r => r.commentId === commentId);
      await pressPopupButton('.v2-comment-popup-close');
      // Clic sur le texte commenté de la Lecture : le fil se rouvre avec son message.
      const again = document.querySelector('#reader-container .comment-mark');
      if (again) again.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await sleep(300);
      const reopened = popupVisible() && (popup().textContent || '').indexOf('À reformuler') !== -1;
      if (popupVisible()) await pressPopupButton('.v2-comment-popup-close');
      // De retour en Édition : la marque est sur le même texte, et Commenter y reprend l'éditeur (plus de Lecture commentable).
      document.getElementById('btn-mode-edit').click();
      await sleep(400);
      const editorMark = document.querySelector('#editor-container .comment-mark');
      const backInEdit = !Comments.isReaderMode() && !!editorMark && editorMark.textContent === 'le contrat';
      await cleanup();
      const pass = inRead && readerClass && readerMode && selected && marks.length === 1 && marks[0].text === 'le contrat' && readerMarkText === 'le contrat'
        && highlight !== 'rgba(0, 0, 0, 0)' && nearMark && savedHasMark && thread.length === 1 && thread[0].texte === 'À reformuler' && reopened && backInEdit;
      return { pass, notes: JSON.stringify({ inRead, readerClass, readerMode, selected, marks, readerMarkText, highlight, nearMark, popupRect: [pop.top, pop.bottom], markRect: markBox && [markBox.top, markBox.bottom], savedHasMark, thread, reopened, backInEdit }) };
    },
  });

  cases.push({
    id: 'access_read_mode_comment_without_reader_selection_alerts_and_writes_nothing',
    description: 'Mode Lecture choisi : Commenter sans texte sélectionné dans la Lecture demande d’en sélectionner, même quand l’éditeur masqué garde une sélection - aucune marque, aucune fenêtre, aucune écriture',
    run: async (h) => {
      await savedTemplate(h, 'Commentaire en Lecture sans sélection');
      EditorCore.getEditor().commands.setTextSelection({ from: 1, to: 8 });
      await sleep(60);
      document.getElementById('btn-mode-read').click();
      await sleep(600);
      window.getSelection().removeAllRanges();
      const alerts = [];
      const origAlert = window.alert;
      window.alert = msg => { alerts.push(msg); };
      const updatesBefore = stub().countActions('UpdateRecord', 'Publipostage_Modeles');
      let marks, popupShown, updatesAfter;
      try {
        await h.clickButton('v2-btn-comment');
        await sleep(3500); // plus qu'un tick d'auto-save (2,5 s) : une marque posée en silence serait déjà enregistrée
        marks = markedTextInEditorDoc();
        popupShown = popupVisible();
        updatesAfter = stub().countActions('UpdateRecord', 'Publipostage_Modeles');
      } finally {
        window.alert = origAlert;
      }
      await cleanup();
      const pass = alerts.length === 1 && alerts[0] === I18n.t('comments.selectTextFirst') && marks.length === 0 && !popupShown && updatesAfter === updatesBefore;
      return { pass, notes: JSON.stringify({ alerts, marks, popupShown, updatesBefore, updatesAfter }) };
    },
  });

  cases.push({
    id: 'access_read_mode_without_comment_right_shows_no_comments',
    description: 'Mode Lecture choisi sans le droit de commenter : Commenter grisé, Lecture sans commentaires surlignés (comme l’export), et le droit de commenter rend la Lecture commentable sans recharger',
    run: async (h) => {
      await savedTemplate(h, 'Lecture sans droit de commenter', '<p>Bonjour, voici le contrat de location.</p>');
      const applied = await applyRights({ readOnly: false, export: true, comments: false });
      document.getElementById('btn-mode-read').click();
      await sleep(600);
      const readerClass = document.getElementById('reader-container').classList.contains('pp-reader-comments');
      const off = { readerMode: Comments.isReaderMode(), readerClass, greyed: locked('v2-btn-comment') };
      const granted = await applyRights({ readOnly: false, export: true, comments: true });
      await sleep(300);
      const on = { readerMode: Comments.isReaderMode(), readerClass: document.getElementById('reader-container').classList.contains('pp-reader-comments'), greyed: locked('v2-btn-comment') };
      await cleanup();
      const pass = applied && granted && !off.readerMode && !off.readerClass && off.greyed && on.readerMode && on.readerClass && !on.greyed;
      return { pass, notes: JSON.stringify({ applied, granted, off, on }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.accessRights = cases;
})();
