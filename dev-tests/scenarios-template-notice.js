// Suite "templateNotice" - la notice du document (js/template-notice.js, css/template-notice.css ; colonne `Notice` : js/templates.js:saveNotice), demande d'Antoine du 23/11 :
// « sur fichier PP (doc, grille ou slide) pouvoir ajouter une page d'explication sur le fonctionnement du modèle, une sorte de commentaire qui explique comment se servir du modèle ».
// Choix d'Antoine : mise en forme « Titres, gras, listes, liens » ; un bandeau fin sous la barre d'outils + une fenêtre ; la notice se rouvre depuis le menu du crayon (celui de « Renommer »),
// pas depuis Enregistrer. Jamais imprimée ni exportée : elle vit dans sa propre colonne, hors du texte du document.
// Les attendus de la personne :
//  - le texte de la notice est réduit à neuf balises, sans script, sans image, sans adresse qui exécute (clean) ;
//  - le menu du crayon porte deux lignes (« Renommer » fait ce que fait le crayon, « Notice du document… » / « Ajouter une notice… ») ; la seconde est grisée avec sa raison pour un document pas encore enregistré
//    et pour un macro-modèle ;
//  - le bandeau n'apparaît que pour un document qui a une notice ; « Fermer » le range jusqu'à la prochaine ouverture du widget, et une notice changée (par quelqu'un d'autre) le rend ;
//  - écrire, enregistrer, annuler, rétablir, supprimer : la notice suit, l'écriture ne touche que sa colonne ;
//  - la notice n'est ni dans le texte du document ni dans l'éditeur (donc dans aucun export) ;
//  - en lecture seule, la personne lit la notice mais ne l'écrit pas ; sans notice, la ligne est grisée avec sa raison ;
//  - « Enregistrer sous… » donne sa notice à la copie ;
//  - tous les textes existent en français et en anglais.
(function () {
  const cases = [];
  const stub = () => window.__gristStub;
  const EMAIL = 'lecteur@exemple.fr';
  const RIGHTS_TABLE = 'PpDroits';
  const CONFIG = { table: RIGHTS_TABLE, emailColumn: 'Email', readOnlyColumn: 'LectureSeule', exportColumn: 'Export', commentsColumn: 'Commentaires' };
  const NOTICE = '<h3>Mode d’emploi</h3><p>Choisissez la <strong>ligne</strong>, puis exportez.</p><ul><li>Premier point</li><li>Second point</li></ul>';
  const MARKER = 'ZZ-NOTICE-INVISIBLE-ZZ';

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  async function waitFor(fn, timeoutMs) {
    const t0 = Date.now();
    while (Date.now() - t0 < (timeoutMs || 3000)) { if (fn()) return true; await sleep(40); }
    return !!fn();
  }
  const byId = id => document.getElementById(id);
  const barShown = () => !byId('pp-notice-bar').hidden;
  const row = () => byId('v2-notice-row');
  const rowDisabled = () => row().getAttribute('aria-disabled') === 'true';
  const windowOpen = () => { const m = byId('pp-notice-modal'); return !!m && !m.hidden && getComputedStyle(m).display !== 'none'; };
  const dialogButtons = () => Array.from(document.querySelectorAll('#pp-dialog-modal .pp-modal-actions button')).filter(b => !b.hidden);
  const noticeWrites = () => stub().getActionLog().filter(a => a[0] === 'UpdateRecord' && a[3] && Object.prototype.hasOwnProperty.call(a[3], 'Notice'));

  // Un document NEUF enregistré par le vrai flux (flyout « + » -> Nouveau document -> texte, nom, Enregistrer) : le précédent n'est pas réenregistré sous un autre nom, et sa notice ne reste pas à l'écran. Rend son numéro.
  async function savedDocument(h, nom) {
    await h.resetEditor();
    h.openFlyout('#v2-new-template-group');
    await h.clickButton('v2-btn-new-document');
    await sleep(100);
    Editor.setHTML('<p>Contenu de ' + nom + '</p>');
    byId('template-name').value = nom;
    await h.clickButton('btn-save');
    await sleep(500);
    return Templates.getCurrentId();
  }

  async function giveNotice(id, html) {
    await Templates.saveNotice(id, html);
    TemplateNotice.show(Templates.byId(id));
  }

  async function pressDialog(index) {
    await waitFor(() => dialogButtons().length > 0);
    const buttons = dialogButtons();
    buttons[index < 0 ? buttons.length + index : index].click();
    await sleep(250);
  }

  async function closeWindow() {
    if (windowOpen()) { byId('pp-notice-cancel').click(); await sleep(150); if (dialogButtons().length) await pressDialog(-1); }
    await sleep(100);
  }

  // Ligne de droits de la personne courante (comme js/main-access.js les lit), puis attente de leur application.
  async function applyRights(flags) {
    const want = { readOnly: !!flags.readOnly };
    stub().setUserEmail(EMAIL);
    stub().setVariables(RIGHTS_TABLE, { Email: 'Text', LectureSeule: 'Bool', Export: 'Bool', Commentaires: 'Bool' });
    stub().setRows(RIGHTS_TABLE, [{ id: 1, Email: 'Lecteur@Exemple.fr', LectureSeule: want.readOnly, Export: true, Commentaires: true }]);
    await GristAPI.refreshSchema();
    stub().setWidgetOptions({ droitsAcces: CONFIG });
    await sleep(60);
    await AccessRights.refresh();
    const ok = await waitFor(() => AccessRights.get().readOnly === want.readOnly);
    await sleep(500);
    return ok;
  }
  async function releaseRights() {
    stub().setWidgetOptions(null);
    await waitFor(() => !AccessRights.getConfig() && !AccessRights.get().readOnly);
    await sleep(300);
    byId('btn-mode-edit').click();
    await sleep(300);
  }

  cases.push({
    id: 'notice_clean_reduces_to_simple_formatting',
    description: 'TemplateNotice.clean ne garde que titres (un seul niveau), paragraphes, gras, italique, listes et liens http, mailto, tel : pas de script, d’image, d’attribut, de lien javascript: ; la sortie est stable ; trop long ou sans texte : vide.',
    run: async () => {
      const dirty = '<h1 onclick="x()">Titre</h1><script>window.__noticeHacked = 1</script><div style="color:red">Bloc</div><p>Un <b>gras</b> et <i>italique</i> <img src="x" onerror="window.__noticeHacked = 2"> '
        + '<a href="javascript:window.__noticeHacked = 3">piège</a> <a href="https://exemple.fr/a" onclick="y()" style="x:y">lien</a> <a href="mailto:a@b.fr">mail</a> <a href="tel:0102030405">tel</a></p>'
        + '<ul><li><p>puce seule</p></li></ul><p></p><table><tr><td>cellule</td></tr></table>';
      const out = TemplateNotice.clean(dirty);
      const box = document.createElement('div');
      box.innerHTML = out;
      const tags = Array.from(new Set(Array.from(box.querySelectorAll('*')).map(n => n.localName))).sort();
      const allowed = ['a', 'br', 'em', 'h3', 'li', 'ol', 'p', 'strong', 'ul'];
      const hrefs = Array.from(box.querySelectorAll('a')).map(a => a.getAttribute('href')).sort();
      const attrsOk = Array.from(box.querySelectorAll('*')).every(n => Array.from(n.attributes).every(a => n.localName === 'a' && a.name === 'href'));
      const checks = {
        onlyAllowedTags: tags.every(t => allowed.includes(t)),
        headingIsH3: !!box.querySelector('h3') && !box.querySelector('h1'),
        boldItalicRenamed: !!box.querySelector('strong') && !!box.querySelector('em') && !box.querySelector('b') && !box.querySelector('i'),
        noScriptNoImage: !/script|<img|onerror|onclick|javascript:/i.test(out) && window.__noticeHacked === undefined,
        hrefsKept: JSON.stringify(hrefs) === JSON.stringify(['https://exemple.fr/a', 'mailto:a@b.fr', 'tel:0102030405']),
        onlyHrefAttribute: attrsOk,
        liUnwrapped: out.includes('<li>puce seule</li>'),
        noEmptyParagraph: !out.includes('<p></p>'),
        tableTextKept: out.includes('cellule') && !/<t(?:able|r|d)/.test(out),
        stable: TemplateNotice.clean(out) === out,
        tooLong: TemplateNotice.clean('<p>' + 'a'.repeat(130000) + '</p>') === '' && TemplateNotice.clean('<p>' + 'a'.repeat(5000) + '</p>') !== '',
        emptyIsEmpty: TemplateNotice.clean('<p></p><p><br></p>') === '' && TemplateNotice.clean('') === '' && TemplateNotice.clean(null) === '' && TemplateNotice.isEmpty('<p> </p>'),
      };
      const pass = Object.values(checks).every(Boolean);
      return { pass, notes: JSON.stringify({ checks, out }) };
    },
  });

  cases.push({
    id: 'notice_pencil_menu_two_rows_and_locks',
    description: 'Le menu du crayon a « Renommer » (qui fait ce que fait le crayon) et la ligne de la notice ; celle-ci dit « Ajouter une notice… » puis « Notice du document… », et est grisée avec sa raison pour un document neuf et pour un macro-modèle.',
    run: async (h) => {
      await h.resetEditor();
      TemplateNotice.show(null);
      const unsaved = { disabled: rowDisabled(), reason: row().getAttribute('data-pp-lock-reason') || row().title || '' };
      const id = await savedDocument(h, 'Notice menu');
      const addLabel = row().textContent;
      const addEnabled = !rowDisabled();
      const menu = { group: !!byId('v2-rename-group'), flyout: !!byId('v2-rename-flyout'), renameRow: !!byId('v2-rename-row'), pencilInside: byId('v2-rename-group').contains(byId('btn-rename-template')) };
      // « Renommer » : même effet que le crayon (le champ du nom s'ouvre).
      byId('v2-rename-row').click();
      await sleep(150);
      const renameOpened = !byId('template-name').hidden;
      byId('template-name').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      byId('template-name').blur();
      await sleep(150);
      await giveNotice(id, NOTICE);
      const readLabel = row().textContent;
      TemplateNotice.show({ id, typeModele: 'macro', nom: 'Un macro', notice: NOTICE });
      const macro = { disabled: rowDisabled(), reason: row().getAttribute('data-pp-lock-reason') || row().title || '', barHidden: !barShown() };
      TemplateNotice.show(Templates.byId(id));
      const back = !rowDisabled() && barShown();
      const pass = unsaved.disabled && unsaved.reason.length > 5 && addLabel === I18n.t('notice.row.add') && addEnabled && menu.group && menu.flyout && menu.renameRow && menu.pencilInside
        && renameOpened && readLabel === I18n.t('notice.row') && macro.disabled && macro.reason.length > 5 && macro.barHidden && back;
      return { pass, notes: JSON.stringify({ unsaved, addLabel, addEnabled, menu, renameOpened, readLabel, macro, back }) };
    },
  });

  cases.push({
    id: 'notice_bar_shows_only_with_notice_close_and_change',
    description: 'Le bandeau « Notice » n’existe que pour un document qui a une notice ; « Fermer » le range ; une notice changée par quelqu’un d’autre (relecture des modèles) le rend ; « Lire » ouvre la fenêtre.',
    run: async (h) => {
      const id = await savedDocument(h, 'Notice bandeau');
      const none = !barShown();
            await giveNotice(id, NOTICE);
      const shown = barShown();
      const bar = byId('pp-notice-bar');
      const title = bar.querySelector('.pp-notice-bar-title').textContent;
      byId('pp-notice-bar').querySelector('.pp-notice-bar-close').click();
      await sleep(50);
      const closed = !barShown();
      // une autre personne change la notice : le cache est relu, le bandeau revient
      Templates.byId(id).notice = '<p>Autre texte.</p>';
      TemplateNotice.sync();
      const backOnChange = barShown();
      // une relecture sans changement ne le rouvre pas
      byId('pp-notice-bar').querySelector('.pp-notice-bar-close').click();
      TemplateNotice.sync();
      const stayedClosed = !barShown();
      TemplateNotice.show(Templates.byId(id));
      // « Lire » ouvre la fenêtre (bandeau revenu : un autre document puis celui-ci le montre encore fermé, c'est voulu)
      TemplateNotice.open();
      await sleep(250);
      const opened = windowOpen() && (byId('pp-notice-view').textContent || '').includes('Autre texte.');
      await closeWindow();
      const pass = none && shown && title === I18n.t('notice.bar.title') && closed && backOnChange && stayedClosed && opened;
      // le bandeau fermé de ce document ne reste pas fermé pour la suite : la notice change, il revient (sync)
      Templates.byId(id).notice = '<p>Fin de l’essai.</p>';
      TemplateNotice.sync();
      return { pass, notes: JSON.stringify({ none, shown, title, closed, backOnChange, stayedClosed, opened }) };
    },
  });

  cases.push({
    id: 'notice_write_save_undo_redo_remove',
    description: 'Écrire (éditeur de la fenêtre), enregistrer (une seule écriture, la colonne Notice seule), Annuler puis Rétablir par les boutons de la barre, puis supprimer (avec confirmation) : la notice, le bandeau et la table suivent.',
    run: async (h) => {
      const id = await savedDocument(h, 'Notice écriture');
      const writesBefore = noticeWrites().length;
      byId('v2-notice-row').click();
      await sleep(300);
      await waitFor(() => !!document.querySelector('#pp-notice-editor [contenteditable="true"]'), 6000);
      const editing = windowOpen() && !byId('pp-notice-editor').hidden && !byId('pp-notice-tools').hidden;
      const prose = document.querySelector('#pp-notice-editor [contenteditable="true"]');
      prose.focus();
      document.execCommand('insertText', false, 'Mode d’emploi');
      await sleep(60);
      byId('pp-notice-tool-heading').click();
      await sleep(60);
      const headingOn = byId('pp-notice-tool-heading').getAttribute('aria-pressed') === 'true';
      prose.focus();
      const sel = window.getSelection(); sel.selectAllChildren(prose); sel.collapseToEnd();
      document.execCommand('insertParagraph');
      document.execCommand('insertText', false, 'Choisissez la ligne.');
      await sleep(60);
      byId('pp-notice-ok').click();
      await waitFor(() => Templates.byId(id).notice !== '', 3000);
      await sleep(250);
      const stored = Templates.byId(id).notice;
      const writes = noticeWrites().slice(writesBefore);
      const saved = {
        notice: stored.includes('<h3>Mode d’emploi</h3>') && stored.includes('Choisissez la ligne.'),
        oneWrite: writes.length === 1 && Object.keys(writes[0][3]).join() === 'Notice',
        bar: barShown(),
        readMode: windowOpen() && !byId('pp-notice-view').hidden,
        status: /notice/i.test(byId('status-msg').textContent),
      };
      await closeWindow();
      // Annuler / Rétablir par les boutons de la barre
      byId('v2-btn-undo').click();
      await waitFor(() => Templates.byId(id).notice === '', 3000);
      await sleep(250);
      const undone = { empty: Templates.byId(id).notice === '', bar: !barShown(), table: noticeWrites().pop()[3].Notice === '' };
      byId('v2-btn-redo').click();
      await waitFor(() => Templates.byId(id).notice === stored, 3000);
      await sleep(250);
      const redone = { back: Templates.byId(id).notice === stored, bar: barShown() };
      // Supprimer : confirmation, puis plus rien
      TemplateNotice.open();
      await sleep(250);
      byId('pp-notice-remove').click();
      await sleep(250);
      const asked = dialogButtons().length >= 2;
      await pressDialog(-1);
      await waitFor(() => Templates.byId(id).notice === '', 3000);
      await sleep(250);
      const removed = { asked, empty: Templates.byId(id).notice === '', bar: !barShown(), closed: !windowOpen() };
      const pass = editing && headingOn && Object.values(saved).every(Boolean) && Object.values(undone).every(Boolean) && Object.values(redone).every(Boolean) && Object.values(removed).every(Boolean);
      return { pass, notes: JSON.stringify({ editing, headingOn, saved, undone, redone, removed, stored }) };
    },
  });

  cases.push({
    id: 'notice_cancel_asks_before_losing_text',
    description: 'Annuler dans l’éditeur d’une notice modifiée demande confirmation (rien n’est écrit tant qu’on n’enregistre pas) ; sans modification, la fenêtre se ferme sans question.',
    run: async (h) => {
      const id = await savedDocument(h, 'Notice abandon');
      await giveNotice(id, NOTICE);
      const writesBefore = noticeWrites().length;
      TemplateNotice.open();
      await sleep(250);
      byId('pp-notice-ok').click(); // Modifier la notice
      await sleep(400);
      byId('pp-notice-cancel').click();
      await sleep(250);
      const quiet = !windowOpen() || byId('pp-notice-view').hidden === false;
      TemplateNotice.open();
      await sleep(250);
      if (byId('pp-notice-view').hidden) { /* déjà en écriture */ } else { byId('pp-notice-ok').click(); await sleep(400); }
      const prose = document.querySelector('#pp-notice-editor [contenteditable="true"]');
      prose.focus();
      document.execCommand('insertText', false, ' texte tapé');
      await sleep(80);
      byId('pp-notice-cancel').click();
      await sleep(250);
      const asked = dialogButtons().length >= 2;
      await pressDialog(0); // « Continuer à écrire » ou équivalent : rester
      const stillEditing = windowOpen() && !byId('pp-notice-editor').hidden;
      byId('pp-notice-cancel').click();
      await sleep(250);
      await pressDialog(-1); // abandonner
      const leftAlone = noticeWrites().length === writesBefore && Templates.byId(id).notice === TemplateNotice.clean(NOTICE);
      await closeWindow();
      const pass = quiet && asked && stillEditing && leftAlone;
      return { pass, notes: JSON.stringify({ quiet, asked, stillEditing, leftAlone }) };
    },
  });

  cases.push({
    id: 'notice_too_long_and_refused_write_are_said_and_kept',
    description: 'Une notice trop longue n’est pas écrite : la fenêtre le dit sous le texte et reste en écriture ; une écriture que Grist refuse le dit aussi, sans perdre ce qui est tapé ni changer la notice du document.',
    run: async (h) => {
      const id = await savedDocument(h, 'Notice limites');
      const writesBefore = noticeWrites().length;
      TemplateNotice.open();
      await sleep(300);
      await waitFor(() => !!document.querySelector('#pp-notice-editor [contenteditable="true"]'), 6000);
      const prose = document.querySelector('#pp-notice-editor [contenteditable="true"]');
      prose.focus();
      document.execCommand('insertText', false, 'a'.repeat(TemplateNotice.MAX_TEXT + 10));
      await sleep(200);
      byId('pp-notice-ok').click();
      await sleep(300);
      const tooLong = {
        said: !byId('pp-notice-problem').hidden && byId('pp-notice-problem').textContent.includes(String(TemplateNotice.MAX_TEXT)),
        nothingWritten: noticeWrites().length === writesBefore && Templates.byId(id).notice === '',
        stillEditing: windowOpen() && !byId('pp-notice-editor').hidden,
      };
      // On raccourcit : l'écriture que Grist refuse est dite, le texte tapé reste
      const sel = window.getSelection(); sel.selectAllChildren(prose);
      document.execCommand('insertText', false, 'Texte court.');
      await sleep(100);
      const real = Templates.saveNotice;
      Templates.saveNotice = async () => { throw new Error('Grist refuse'); };
      const logged = console.error; console.error = () => {};
      try {
        byId('pp-notice-ok').click();
        await sleep(300);
      } finally { Templates.saveNotice = real; console.error = logged; }
      const refused = {
        said: !byId('pp-notice-problem').hidden && byId('pp-notice-problem').textContent === I18n.t('notice.saveError'),
        textKept: prose.textContent.includes('Texte court.'),
        unchanged: Templates.byId(id).notice === '' && TemplateNotice.state().notice === '',
        stillEditing: windowOpen() && !byId('pp-notice-editor').hidden,
        buttonsBack: !byId('pp-notice-ok').disabled,
      };
      // Et quand Grist répond, le même bouton écrit
      byId('pp-notice-ok').click();
      await waitFor(() => Templates.byId(id).notice !== '', 3000);
      const written = Templates.byId(id).notice.includes('Texte court.');
      await closeWindow();
      const pass = Object.values(tooLong).every(Boolean) && Object.values(refused).every(Boolean) && written;
      return { pass, notes: JSON.stringify({ tooLong, refused, written }) };
    },
  });

  cases.push({
    id: 'notice_is_never_in_the_document_text',
    description: 'La notice n’est pas dans le texte du document : ni dans l’éditeur (Editor.getHTML), ni dans le contenu enregistré, ni dans l’autosave ; elle est dans sa colonne Notice seule. Aucun export ne lit cette colonne.',
    run: async (h) => {
      const id = await savedDocument(h, 'Notice hors texte');
      await giveNotice(id, '<p>' + MARKER + '</p>');
      Editor.setHTML('<p>Le texte du document a changé.</p>');
      byId('btn-save').click();
      await sleep(600);
      const rows = stub().state.rows.Publipostage_Templates || stub().state.rows.Publipostage_Modeles || {};
      const contentColumn = rows.Content || rows.Contenu || [];
      const inContent = contentColumn.some(c => String(c || '').includes(MARKER));
      const inEditor = Editor.getHTML().includes(MARKER);
      const inCached = String(Templates.byId(id).contenu || '').includes(MARKER);
      const inPage = (byId('editor-container').textContent || '').includes(MARKER);
      const noticeColumn = rows.Notice || [];
      const inNoticeColumn = noticeColumn.some(c => String(c || '').includes(MARKER));
      const stillThere = Templates.byId(id).notice.includes(MARKER);
      const pass = !inContent && !inEditor && !inCached && !inPage && inNoticeColumn && stillThere;
      return { pass, notes: JSON.stringify({ inContent, inEditor, inCached, inPage, inNoticeColumn, stillThere }) };
    },
  });

  cases.push({
    id: 'notice_readonly_reads_but_does_not_write',
    description: 'Lecture seule : le bandeau et la ligne « Notice du document… » restent (on lit), la fenêtre n’a ni « Modifier » ni « Supprimer » ; « Renommer » est grisé ; sans notice, la ligne est grisée avec sa raison ; un compte qui écrit retrouve tout.',
    run: async (h) => {
      const id = await savedDocument(h, 'Notice lecture seule');
      await giveNotice(id, NOTICE);
      const applied = await applyRights({ readOnly: true });
      TemplateNotice.show(Templates.byId(id));
      const view = {
        bar: barShown(),
        rowEnabled: !rowDisabled(),
        label: row().textContent === I18n.t('notice.row'),
        renameGreyed: byId('v2-rename-row').getAttribute('aria-disabled') === 'true',
        editorUntouchedByPencilMenu: byId('btn-rename-template').getAttribute('aria-disabled') === 'true',
      };
      TemplateNotice.open();
      await sleep(300);
      const win = {
        open: windowOpen(),
        text: (byId('pp-notice-view').textContent || '').includes('Mode d’emploi'),
        noEdit: byId('pp-notice-ok').hidden,
        noRemove: byId('pp-notice-remove').hidden,
        closeKept: !byId('pp-notice-cancel').hidden,
      };
      await closeWindow();
      const writesBefore = noticeWrites().length;
      let refused = false;
      try { await TemplateNotice.open(); byId('pp-notice-ok').click(); await sleep(200); refused = byId('pp-notice-editor').hidden; } catch (e) { refused = true; }
      await closeWindow();
      // sans notice : grisée avec sa raison
      Templates.byId(id).notice = '';
      TemplateNotice.show(Templates.byId(id));
      const empty = { greyed: rowDisabled(), reason: (row().getAttribute('data-pp-lock-reason') || row().title || '').length > 5, bar: !barShown() };
      await releaseRights();
      Templates.byId(id).notice = TemplateNotice.clean(NOTICE);
      TemplateNotice.show(Templates.byId(id));
      TemplateNotice.refresh();
      const free = { rowEnabled: !rowDisabled(), renameBack: byId('v2-rename-row').getAttribute('aria-disabled') !== 'true', bar: barShown() };
      const pass = applied && Object.values(view).every(Boolean) && Object.values(win).every(Boolean) && refused && noticeWrites().length === writesBefore
        && empty.greyed && empty.reason && empty.bar && Object.values(free).every(Boolean);
      return { pass, notes: JSON.stringify({ applied, view, win, refused, empty, free }) };
    },
  });

  cases.push({
    id: 'notice_follows_save_as_copy',
    description: '« Enregistrer sous… » : la copie reçoit la notice du document d’origine (celui-ci la garde) ; Annuler la copie la supprime avec sa notice.',
    run: async (h) => {
      const id = await savedDocument(h, 'Notice origine');
      await giveNotice(id, NOTICE);
      h.openFlyout('#v2-save-group');
      await h.clickButton('v2-btn-save-as');
      await waitFor(() => dialogButtons().length > 0, 3000);
      const input = byId('pp-dialog-input');
      input.value = 'Notice copie';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await pressDialog(-1);
      await waitFor(() => Templates.getCurrentId() !== id && Templates.byId(Templates.getCurrentId()) && Templates.byId(Templates.getCurrentId()).notice !== '', 5000);
      await sleep(400);
      const copyId = Templates.getCurrentId();
      const copy = Templates.byId(copyId);
      const out = {
        newDocument: copyId !== id && !!copy && copy.nom === 'Notice copie',
        copyHasNotice: !!copy && copy.notice === TemplateNotice.clean(NOTICE),
        originalKeeps: Templates.byId(id).notice === TemplateNotice.clean(NOTICE),
        barOnCopy: barShown() && TemplateNotice.state().id === copyId,
      };
      const pass = Object.values(out).every(Boolean);
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'notice_texts_exist_in_french_and_english',
    description: 'Tous les textes « notice.* » existent en français et en anglais, sans clé qui s’affiche telle quelle, et l’anglais n’est pas le français recopié.',
    run: async () => {
      const keys = ['template.menu.label', 'notice.row', 'notice.row.add', 'notice.bar.aria', 'notice.bar.title', 'notice.bar.text', 'notice.bar.read', 'notice.title', 'notice.edit', 'notice.write', 'notice.save', 'notice.remove',
        'notice.remove.title', 'notice.remove.message', 'notice.hint', 'notice.editor.aria', 'notice.tool.heading', 'notice.tool.heading.title', 'notice.tool.bold', 'notice.tool.bold.title', 'notice.tool.italic', 'notice.tool.italic.title',
        'notice.tool.bullets', 'notice.tool.bullets.title', 'notice.tool.numbers', 'notice.tool.numbers.title', 'notice.tool.link', 'notice.tool.link.title', 'notice.link.title', 'notice.link.label', 'notice.link.bad',
        'notice.discard.title', 'notice.discard.message', 'notice.discard.confirm', 'notice.tooLong', 'notice.saveError', 'notice.saved', 'notice.removed', 'notice.history.back', 'notice.history.removed', 'notice.history.changed',
        'notice.lock.macro', 'notice.lock.unsaved', 'notice.lock.nothing'];
      const was = I18n.getLang();
      const missing = [];
      const same = [];
      try {
        keys.forEach(key => {
          I18n.setLang('fr'); const fr = I18n.t(key, { name: 'X' });
          I18n.setLang('en'); const en = I18n.t(key, { name: 'X' });
          if (!I18n.has(key) || fr === key || en === key || !fr || !en) missing.push(key);
          if (fr === en && !/^notice\.tool\.(bold|italic)$|^notice\.tool\.(bold|italic)\.title$|^template\.menu\.label$|^notice\.tool\.link$/.test(key)) same.push(key);
        });
      } finally { I18n.setLang(was); }
      const bar = byId('pp-notice-bar');
      const staticTexts = !!bar && !!bar.querySelector('[data-i18n="notice.bar.title"]') && !!bar.querySelector('[data-i18n="notice.bar.text"]') && !!bar.querySelector('[data-i18n="notice.bar.read"]') && bar.hasAttribute('data-i18n-aria');
      const pass = missing.length === 0 && same.length === 0 && staticTexts;
      return { pass, notes: JSON.stringify({ missing, same, staticTexts }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.templateNotice = cases;
})();
