// Suite "viewerAccount" - un compte Lecteur de Grist ouvre le widget en lecture seule (js/grist-api.js:isDocumentReadOnly, js/access-rights.js, état « viewer »),
// choix d'Antoine du 2026-10-09 (carte « Ouvrir en lecture seule les comptes Lecteur de Grist ? » : « Oui, lecture seule »), après qu'un autre compte, Lecteur du
// document, lui a montré le widget complet : barre d'édition active, onglet Accès à tous les droits, Lecture épurée jamais ouverte d'emblée.
//
// Grist met `readonly=true` dans l'adresse du cadre du widget quand le document est en lecture seule pour la personne (`gristDoc.isReadonly`, lu dans le paquet de
// grist-static le 09/10 : `searchParams.append("readonly", String(readonly))`, après les paramètres de l'adresse du widget). Le faux Grist de dev-tests/grist-stub.js
// le rejoue : `setViewer(true)` pose ce paramètre dans l'adresse de la page et fait refuser toute écriture du document (`deniedWrites`) ; les scénarios appellent
// ensuite AccessRights.refresh(), comme la relecture périodique le ferait. Le démarrage réel (adresse portant déjà `readonly=true`, Lecture épurée d'emblée, 700x400)
// est dans dev-tests/verify-viewer-mouse.mjs : l'ouverture d'emblée se décide une seule fois par session, déjà passée quand ces scénarios tournent.
// Un compte Lecteur réel ne se teste pas dans grist-static (aucun autre compte) : l'adresse du cadre est lue dans grist-core, pas mesurée sur un vrai Lecteur.
(function () {
  const cases = [];
  const stub = () => window.__gristStub;
  const el = id => document.getElementById(id);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const RIGHTS_TABLE = 'PpDroitsLecteur';
  const DATA_TABLE = 'PpClientsLecteur';
  const EMAIL = 'lecteur@exemple.fr';
  const CONFIG = { table: RIGHTS_TABLE, emailColumn: 'Email', readOnlyColumn: 'LectureSeule', exportColumn: 'Export', commentsColumn: 'Commentaires' };
  const TEMPLATE_HTML = '<p>Bonjour <span class="var-badge" data-table="' + DATA_TABLE + '" data-column="Nom" data-key="' + DATA_TABLE + '.Nom"></span>, voici le contrat.</p>';
  const VIEWER_TEXT_FR = 'Compte Lecteur dans Grist : lecture seule, export, sans commentaires.';
  const VIEWER_TEXT_EN = 'Viewer account in Grist: read-only, export, no comments.';
  // Tout ce que la lecture seule grise (js/main.js:READ_ONLY_LOCKED_IDS, la barre de mise en forme, Commenter) : rien ne disparaît.
  const EDIT_IDS = ['btn-mode-edit', 'v2-save-group', 'btn-delete', 'btn-organize-templates', 'v2-new-template-group', 'btn-link-rules', 'v2-page-group', 'v2-btn-bold'];

  async function waitFor(fn, timeoutMs) {
    const t0 = Date.now();
    while (Date.now() - t0 < (timeoutMs || 3000)) { if (fn()) return true; await sleep(40); }
    return !!fn();
  }
  const locked = id => { const e = el(id); return !!e && e.classList.contains('pp-access-locked'); };
  const shown = id => { const e = el(id); return !!e && getComputedStyle(e).display !== 'none' && !e.hidden; };
  const inReadMode = () => el('reader-container').style.display === 'block' && el('editor-container').style.display === 'none';
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const verdict = checks => { const failed = Object.keys(checks).filter(k => !checks[k]); return { pass: failed.length === 0, failed }; };
  const tab = name => document.querySelector('[data-settings-tab="' + name + '"]');
  const openSettings = async name => {
    if (el('settings-modal').style.display !== 'flex') el('v2-btn-settings').click();
    await sleep(250);
    tab(name).click();
    await sleep(200);
  };
  const closeSettings = async () => { if (el('settings-modal').style.display === 'flex') { el('settings-close').click(); await sleep(250); } };

  // Modèle enregistré avec tous les droits et ligne courante fournie : le mode Lecture a de quoi se dessiner.
  async function savedTemplate(h, nom) {
    await h.resetEditor();
    stub().setVariables(DATA_TABLE, { Nom: 'Text' });
    stub().setRows(DATA_TABLE, [{ id: 1, Nom: 'Dupont' }]);
    await GristAPI.refreshSchema();
    stub().fireRecord({ id: 1, Nom: 'Dupont' }, DATA_TABLE);
    Editor.setHTML(TEMPLATE_HTML);
    el('template-name').value = nom;
    await h.clickButton('btn-save');
    await sleep(500);
    return Templates.getCurrentId();
  }
  // Le compte redevient un compte qui modifie : adresse sans `readonly=true`, écritures permises, droits relus, mode Édition rendu.
  async function finish() {
    await closeSettings();
    I18n.setLang('fr');
    stub().setViewer(false);
    stub().setWidgetOptions(null);
    await AccessRights.refresh();
    await waitFor(() => !AccessRights.getConfig() && !AccessRights.get().readOnly);
    await sleep(150);
    el('btn-mode-edit').click();
    await sleep(300);
  }
  async function asViewer() {
    stub().setViewer(true);
    await AccessRights.refresh();
    const ok = await waitFor(() => { const r = AccessRights.get(); return r.readOnly && r.canExport && !r.canComment; });
    await sleep(400);
    return ok;
  }

  cases.push({
    id: 'viewer_account_address_is_read_the_way_grist_writes_it',
    description: 'L’adresse du cadre dit « lecteur » seulement par `readonly=true` - la dernière valeur compte, Grist l’ajoutant après celles de l’adresse du widget ; rien, `false` ou autre chose : pas de lecteur, comme avant',
    run: async () => {
      const is = GristAPI.isReadOnlyAddress;
      const table = {
        empty: [is(''), false],
        undef: [is(undefined), false],
        noParam: [is('?access=full&culture=fr'), false],
        explicitFalse: [is('?access=full&readonly=false&culture=fr'), false],
        explicitTrue: [is('?access=full&readonly=true&culture=fr'), true],
        onlyTrue: [is('?readonly=true'), true],
        withoutQuestionMark: [is('readonly=true'), true],
        gristLastWinsFalse: [is('?readonly=true&access=full&readonly=false'), false],
        gristLastWinsTrue: [is('?readonly=false&access=full&readonly=true'), true],
        upperCase: [is('?readonly=TRUE'), false],
        otherName: [is('?xreadonly=true&readonly_mode=true'), false],
        otherValue: [is('?readonly=1'), false],
      };
      const bad = Object.keys(table).filter(k => table[k][0] !== table[k][1]);
      // La page elle-même : l'adresse lue à neuf, que le faux Grist change sans recharger.
      const before = GristAPI.isDocumentReadOnly();
      stub().setViewer(true);
      const during = GristAPI.isDocumentReadOnly();
      stub().setViewer(false);
      const after = GristAPI.isDocumentReadOnly();
      const pass = bad.length === 0 && before === false && during === true && after === false;
      return { pass, notes: pass ? 'ok' : 'écarts : ' + JSON.stringify({ bad, before, during, after, search: location.search }) };
    },
  });

  cases.push({
    id: 'viewer_account_opens_read_only_with_export_and_without_comments',
    description: 'Un compte Lecteur de Grist : mode Lecture imposé, commandes d’édition grisées (pas retirées), Commenter grisé, export gardé, état « viewer » ; et pas une écriture tentée, même quand l’enregistrement automatique voit un document « modifié »',
    run: async (h) => {
      await savedTemplate(h, 'Lecteur Grist');
      const before = AccessRights.get();
      try {
        const applied = await asViewer();
        const rights = AccessRights.get();
        const state = AccessRights.getStatus().state;
        const read = inReadMode();
        el('btn-mode-edit').click();
        await sleep(300);
        const stillRead = inReadMode();
        // Un document que l'enregistrement automatique voit « modifié » (comme une marque dont l'écriture aurait échoué) ; Enregistrer et Ctrl+S ne l'écrivent pas non plus.
        EditorCore.getEditor().commands.insertContentAt(1, 'x');
        el('btn-save').click();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));
        await sleep(3000); // plus d'un tick d'enregistrement automatique (2,5 s)
        const attempts = stub().state.deniedWrites.length;
        const greyed = EDIT_IDS.filter(id => locked(id) && shown(id));
        const comment = locked('v2-btn-comment') && shown('v2-btn-comment');
        const exportFree = !locked('v2-export-pdf-group') && !locked('v2-quality-group') && !locked('btn-create-email');
        const status = el('status-msg').textContent;
        const checks = {
          applied,
          rightsAreTheViewerOnes: same(rights, { readOnly: true, canExport: true, canComment: false }),
          stateIsViewer: state === 'viewer',
          wasEditableBefore: before.readOnly === false && before.canComment === true,
          readModeForced: read && stillRead,
          editCommandsGreyedNotRemoved: greyed.length === EDIT_IDS.length,
          commentGreyedNotRemoved: comment,
          exportKept: exportFree,
          noWriteAttempted: attempts === 0,
          saidReadOnly: /lecture seule/i.test(status),
        };
        const v = verdict(checks);
        return { pass: v.pass, notes: v.failed.join(', ') || 'ok (' + greyed.length + ' commandes grisées, statut « ' + status + ' »)' };
      } finally { await finish(); }
    },
  });

  cases.push({
    id: 'viewer_account_is_not_identified_and_the_rights_table_does_not_apply',
    description: 'Un Lecteur n’est pas identifié : sa ligne de la table des droits (tous les droits, ici) ne compte pas, la table n’est pas lue, aucune sonde d’email n’est tentée, l’export et les commentaires ne se règlent pas pour lui ; le réglage reste connu (la case de la Lecture épurée)',
    run: async (h) => {
      await savedTemplate(h, 'Lecteur table des droits');
      stub().setUserEmail(EMAIL);
      stub().setVariables(RIGHTS_TABLE, { Email: 'Text', LectureSeule: 'Bool', Export: 'Bool', Commentaires: 'Bool' });
      // Sa ligne, si le widget la lisait : modification, sans export, avec commentaires.
      stub().setRows(RIGHTS_TABLE, [{ id: 1, Email: EMAIL, LectureSeule: false, Export: false, Commentaires: true }]);
      await GristAPI.refreshSchema();
      const docApi = window.grist.docApi;
      const original = docApi.fetchTable;
      const reads = [];
      docApi.fetchTable = function (tableId) { if (tableId === RIGHTS_TABLE) reads.push(tableId); return original.apply(this, arguments); };
      try {
        stub().setViewer(true);
        stub().setWidgetOptions({ droitsAcces: Object.assign({ cleanReading: true }, CONFIG) });
        const known = await waitFor(() => !!AccessRights.getConfig(), 3000);
        await AccessRights.refresh();
        const applied = await waitFor(() => AccessRights.get().readOnly);
        await sleep(400);
        const rights = AccessRights.get();
        const checks = {
          applied,
          configKnown: known && AccessRights.getConfig().cleanReading === true,
          stateIsViewer: AccessRights.getStatus().state === 'viewer',
          rowIgnoredReadOnly: rights.readOnly === true,
          rowIgnoredExport: rights.canExport === true,
          rowIgnoredComments: rights.canComment === false,
          rightsTableNotRead: reads.length === 0,
          noProbeNoWrite: stub().state.deniedWrites.length === 0,
        };
        const v = verdict(checks);
        return { pass: v.pass, notes: v.failed.join(', ') || 'ok' };
      } finally {
        docApi.fetchTable = original;
        await finish();
        stub().setRows(RIGHTS_TABLE, []);
      }
    },
  });

  cases.push({
    id: 'viewer_account_settings_tabs_are_locked_and_the_access_tab_says_why',
    description: 'Réglages d’un Lecteur : l’onglet Accès (listes, case de la Lecture épurée) et l’onglet Vue sont verrouillés avec leur ligne « lecture seule », et l’onglet Accès dit « Compte Lecteur dans Grist : lecture seule, export, sans commentaires » (français, anglais) ; ni rappel « Enregistrer » ni rien d’écrit',
    run: async (h) => {
      await savedTemplate(h, 'Lecteur réglages');
      try {
        await asViewer();
        await openSettings('access');
        const selects = ['settings-access-table', 'settings-access-email', 'settings-access-readonly', 'settings-access-export', 'settings-access-comments'];
        const disabled = ids => ids.every(id => el(id).disabled);
        const statusFr = el('settings-access-status');
        const fr = { text: statusFr.textContent, hidden: statusFr.hidden, lockedHint: shown('settings-access-locked'), selects: disabled(selects), cleanBox: el('settings-access-clean-reading').disabled };
        I18n.setLang('en');
        await sleep(200);
        const en = { text: statusFr.textContent, lockedHint: shown('settings-access-locked') };
        I18n.setLang('fr');
        await sleep(200);
        await openSettings('rowTemplate');
        const viewTab = {
          rowTemplateEnable: el('settings-rowtemplate-enabled').disabled,
          rowTemplateHint: shown('settings-rowtemplate-locked'),
          viewTemplateSet: el('settings-viewtemplate-set').disabled,
          viewTemplateClear: el('settings-viewtemplate-clear').disabled,
          viewTemplateHint: shown('settings-viewtemplate-locked'),
        };
        const reminder = el('settings-save-reminder');
        const checks = {
          frStatus: fr.text === VIEWER_TEXT_FR && !fr.hidden,
          enStatus: en.text === VIEWER_TEXT_EN,
          accessLockedHint: fr.lockedHint && en.lockedHint,
          accessListsDisabled: fr.selects,
          cleanBoxDisabled: fr.cleanBox,
          viewControlsDisabled: viewTab.rowTemplateEnable && viewTab.viewTemplateSet && viewTab.viewTemplateClear,
          viewHints: viewTab.rowTemplateHint && viewTab.viewTemplateHint,
          noReminder: !!reminder && reminder.hidden,
          nothingWritten: stub().state.deniedWrites.length === 0 && !SaveReminder.isUnsaved(),
        };
        const v = verdict(checks);
        return { pass: v.pass, notes: v.failed.join(', ') || 'ok' };
      } finally { await finish(); }
    },
  });

  cases.push({
    id: 'viewer_account_opens_the_clean_reading_when_the_box_is_ticked_like_a_person_found_read_only',
    description: 'CleanReading.wouldOpenForReadOnly : le compte Lecteur ouvre sur la Lecture épurée quand la case est cochée (comme la personne trouvée « lecture seule »), jamais case décochée ; une personne absente de la table, sans identité, une table illisible ou des droits qui se calculent encore n’ouvrent toujours rien',
    run: async () => {
      const would = (state, readOnly, enabled) => CleanReading.wouldOpenForReadOnly({ state, readOnly, enabled });
      const table = {
        viewerTicked: [would('viewer', true, true), true],
        viewerNotTicked: [would('viewer', true, false), false],
        viewerNotReadOnly: [would('viewer', false, true), false],
        foundTicked: [would('found', true, true), true],
        foundNotReadOnly: [would('found', false, true), false],
        notFound: [would('notFound', true, true), false],
        noEmail: [would('noEmail', true, true), false],
        error: [would('error', true, true), false],
        pending: [would('pending', true, true), false],
        off: [would('off', true, true), false],
        nothing: [CleanReading.wouldOpenForReadOnly(null), false],
        viewerAnswersAtOnce: [CleanReading.isAnswered('viewer'), true],
      };
      const bad = Object.keys(table).filter(k => table[k][0] !== table[k][1]);
      return { pass: bad.length === 0, notes: bad.length ? 'écarts : ' + JSON.stringify(bad) : 'ok' };
    },
  });

  cases.push({
    id: 'viewer_account_creates_no_table_and_tries_no_write',
    description: 'Un compte Lecteur ne crée aucune table (Grist refuserait) et n’en tente même pas l’écriture : le refus est silencieux (isTablesDeclined), comme celui de la personne qui dit non, et sans question « Créer les tables ? » ; un compte qui modifie crée la table comme avant',
    run: async () => {
      const NAME = 'Publipostage_EssaiLecteur';
      let asked = 0;
      // Le document porte déjà des tables du widget : l'accord est déjà donné (js/grist-api.js:tableCreationConsent), la question n'est posée à personne ici.
      GristAPI.setTableConsent({ ask: async () => { asked++; return true; }, gesture: () => asked });
      let declinedAsViewer = null;
      let editorOutcome = null;
      try {
        stub().setViewer(true);
        try { await GristAPI.ensureTable(NAME, [{ id: 'A', type: 'Text' }]); declinedAsViewer = false; }
        catch (e) { declinedAsViewer = GristAPI.isTablesDeclined(e); }
        const attempts = stub().state.deniedWrites.length;
        const createdForViewer = stub().state.tables.indexOf(NAME) !== -1;
        stub().setViewer(false);
        try { editorOutcome = await GristAPI.ensureTable(NAME, [{ id: 'A', type: 'Text' }]); }
        catch (e) { editorOutcome = 'erreur : ' + (e && e.message); }
        const checks = {
          viewerDeclinedSilently: declinedAsViewer === true,
          viewerNoWriteAttempt: attempts === 0,
          viewerCreatedNothing: !createdForViewer,
          viewerNotAsked: asked === 0,
          editorCreatesAsBefore: editorOutcome === true && stub().state.tables.indexOf(NAME) !== -1,
        };
        const v = verdict(checks);
        return { pass: v.pass, notes: v.failed.join(', ') || 'ok' };
      } finally {
        GristAPI.setTableConsent(null);
        stub().setViewer(false);
        if (stub().state.tables.indexOf(NAME) !== -1) stub().dropTable(NAME);
      }
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.viewerAccount = cases;
})();
