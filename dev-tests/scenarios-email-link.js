// Suite "emailLink" - l'email lié à un document ou à une grille (js/email-link.js, js/main-email-link.js, js/email-link-panel.js ; demande d'Antoine du 23/11 : « pouvoir dans les settings lier un modèle d'email,
// comme ça en un clic on bascule de l'email au document, et vice versa une fois le lien effectué » ; « dans 90 % des cas un document = un email, donc un seul clic pour ce cas-là, et deux clics si on veut choisir
// un autre modèle/email »). Le lien est le JETON de l'email, écrit seul dans la ligne du document (colonne LinkedEmail, Templates.setLinkedEmail) ; l'email retrouve ses documents en les cherchant.
// Les cas essaient ce que la personne voit : la colonne écrite et rien d'autre, un enregistrement qui garde le lien, un numéro rendu à un autre modèle qui ne le fait pas passer, le bouton à côté de l'étoile
// (un clic là, un clic en retour, le menu au survol, grisé avec sa raison), la section de Réglages > Email des deux côtés, Ctrl + Z, la lecture seule, et le français comme l'anglais.
// La vraie souris et le vrai clavier à 700x400, clair puis sombre et anglais, sont dans dev-tests/verify-email-link-mouse.mjs (groupe emailLinkMouse).
window.EditorTestSuites = window.EditorTestSuites || {};
window.EditorTestSuites.emailLink = (function () {
  const cases = [];
  const TABLE = 'Publipostage_Modeles';
  const stub = () => window.__gristStub;
  const byId = id => document.getElementById(id);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const verdict = (problems, summary) => ({ pass: problems.length === 0, notes: JSON.stringify({ summary, problems }) });
  function check(problems, label, got, want) { if (!same(got, want)) problems.push(label + ' : ' + JSON.stringify(got) + ' au lieu de ' + JSON.stringify(want)); }
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function waitFor(fn, timeoutMs) {
    const t0 = Date.now();
    while (Date.now() - t0 < (timeoutMs || 3000)) { if (fn()) return true; await sleep(40); }
    return !!fn();
  }
  const status = () => byId('status-msg').textContent;
  const row = id => stub().getRow(TABLE, id);
  const linkOnDisk = id => { const r = row(id); return r ? String(r.EmailLie || '') : null; };
  const SPARE_LINK_ID = 'autrejeton000000000000';
  const tokenOnDisk = id => { const r = row(id); return r ? String(r.Jeton || '') : null; };

  function keyEvent(key) { return new KeyboardEvent('keydown', { key, code: 'Key' + key.toUpperCase(), ctrlKey: true, bubbles: true, cancelable: true }); }
  function inPage(key) {
    if (document.activeElement && document.activeElement !== document.body && document.activeElement.blur) document.activeElement.blur();
    document.body.dispatchEvent(keyEvent(key));
  }
  const settle = async h => { await ActionHistory.whenIdle(); await h.sleep(150); };

  // Un modèle neuf par le vrai chemin (Nouveau, puis Enregistrer) : la liste, le cache et le modèle ouvert le connaissent.
  async function createTemplate(h, typeModele, name) {
    await h.resetEditor();
    h.openFlyout('#v2-new-template-group');
    await h.clickButton(typeModele === 'email' ? 'v2-btn-new-email' : typeModele === 'grille' ? 'v2-btn-new-grid' : 'v2-btn-new-document');
    await h.sleep(60);
    if (typeModele !== 'grille') Editor.setHTML('<p>Contenu de ' + name + '</p>');
    byId('template-name').value = name;
    await h.clickButton('btn-save');
    await h.sleep(500);
    return Templates.getCurrentId();
  }
  async function open(h, id) {
    await Templates.loadAll();
    const select = byId('template-select');
    select.value = String(id);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await waitFor(() => Templates.isCurrent(id), 3000);
    await h.sleep(250);
  }

  // Trois documents (dont une grille) et deux emails, rangés une fois ; chaque cas repart sans aucun lien.
  let fixture = null;
  async function ensureFixture(h) {
    if (!fixture || !Templates.getCached().some(t => String(t.id) === String(fixture.D1))) {
      const D1 = await createTemplate(h, 'document', 'Lien - courrier un');
      const D2 = await createTemplate(h, 'document', 'Lien - courrier deux');
      const G1 = await createTemplate(h, 'grille', 'Lien - grille');
      const E1 = await createTemplate(h, 'email', 'Lien - email un');
      const E2 = await createTemplate(h, 'email', 'Lien - email deux');
      fixture = { D1, D2, G1, E1, E2 };
    }
    await Templates.loadAll();
    for (const id of [fixture.D1, fixture.D2, fixture.G1]) { if (Templates.byId(id) && Templates.byId(id).emailLie) await Templates.setLinkedEmail(id, null); }
    ActionHistory.reset();
    return fixture;
  }
  async function leave(h) {
    ActionHistory.reset();
    const settings = byId('settings-modal');
    if (settings && settings.style.display !== 'none') byId('settings-close').click();
    await h.clickButton('btn-new');
    await h.sleep(300);
  }
  const button = () => byId('btn-linked-email');
  const flyoutRows = () => Array.from(byId('v2-linked-email-flyout').querySelectorAll('.v2-hover-row'));
  const buttonState = () => ({ toEmail: button().classList.contains('is-to-email'), toDocument: button().classList.contains('is-to-document'), target: button().classList.contains('has-target'), label: button().getAttribute('aria-label'), greyed: button().getAttribute('aria-disabled') === 'true', reason: button().getAttribute('data-pp-lock-reason') || '' });
  async function click(h) { button().click(); await h.sleep(900); }
  function openSettingsEmail() {
    byId('v2-btn-settings').click();
    document.querySelector('[data-settings-tab="mailClient"]').click();
  }

  cases.push({
    id: 'email_link_set_writes_the_email_token_alone_and_both_sides_find_each_other',
    description: 'Lier un email à un document écrit la colonne du lien et elle seule (le jeton de l\'email, ni Content ni ModifiedAt) ; le document trouve son email, l\'email trouve ses documents, une grille se lie comme un document ; refaire le même lien n\'écrit rien',
    async run(h) {
      const problems = [];
      try {
        const f = await ensureFixture(h);
        await open(h, f.D1);
        const dateBefore = row(f.D1).DateModif;
        stub().clearActionLog();
        const changed = await EmailLink.set(f.D1, f.E1);
        const token = tokenOnDisk(f.E1);
        check(problems, 'le lien est posé', changed, true);
        check(problems, 'l\'email a un jeton', token.length > 0, true);
        check(problems, 'la colonne du document porte le jeton de l\'email', linkOnDisk(f.D1), token);
        const updates = stub().getActionLog().filter(a => a[0] === 'UpdateRecord' && a[1] === TABLE && String(a[2]) === String(f.D1));
        check(problems, 'un seul UpdateRecord sur le document, pour la colonne du lien seule', updates.map(a => Object.keys(a[3] || {})), [['EmailLie']]);
        check(problems, 'la date de modification du document n\'a pas bougé', row(f.D1).DateModif, dateBefore);
        check(problems, 'le document trouve son email', EmailLink.emailOf(Templates.byId(f.D1)).id, f.E1);
        check(problems, 'l\'email trouve ses documents', EmailLink.documentsOf(Templates.byId(f.E1)).map(t => t.id), [f.D1]);
        stub().clearActionLog();
        check(problems, 'le même lien refait : rien de changé', await EmailLink.set(f.D1, f.E1), false);
        check(problems, 'le même lien refait : rien d\'écrit', stub().getActionLog().filter(a => a[0] === 'UpdateRecord' && a[1] === TABLE).length, 0);
        await EmailLink.set(f.G1, f.E1);
        check(problems, 'une grille se lie aussi', EmailLink.documentsOf(Templates.byId(f.E1)).map(t => t.id).sort(), [f.D1, f.G1].sort());
        let refused = '';
        try { await EmailLink.set(f.E2, f.E1); } catch (e) { refused = String(e.message); }
        check(problems, 'un email ne se lie pas à un email', refused !== '', true);
        return verdict(problems, { token, updates });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'email_link_survives_a_save_of_the_document',
    description: 'Enregistrer le document (ou le relire) ne défait pas le lien : l\'enregistrement n\'écrit jamais la colonne du lien, et la relecture de la table le rend tel quel',
    async run(h) {
      const problems = [];
      try {
        const f = await ensureFixture(h);
        await EmailLink.set(f.D1, f.E1);
        const wanted = linkOnDisk(f.D1);
        await open(h, f.D1);
        Editor.setHTML('<p>Contenu changé</p>');
        stub().clearActionLog();
        await h.clickButton('btn-save');
        await h.sleep(600);
        const sent = stub().getActionLog().filter(a => a[0] === 'UpdateRecord' && a[1] === TABLE && String(a[2]) === String(f.D1)).map(a => Object.keys(a[3] || {}));
        check(problems, 'le lien sur disque après Enregistrer', linkOnDisk(f.D1), wanted);
        check(problems, 'Enregistrer n\'envoie pas la colonne du lien', sent.some(keys => keys.includes('EmailLie')), false);
        await Templates.loadAll();
        check(problems, 'le lien du cache après relecture', EmailLink.emailOf(Templates.byId(f.D1)).id, f.E1);
        return verdict(problems, { sent });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'email_link_is_the_token_not_the_row_number',
    description: 'Un email supprimé laisse son document avec un lien « disparu » (le texte le dit, le lien se retire) ; un autre email qui reçoit le même numéro de ligne n\'hérite PAS du lien ; l\'email rendu par Annuler (même jeton) retrouve ses documents ; supprimer puis rendre un document rend son lien',
    async run(h) {
      const problems = [];
      let spare = null;
      try {
        const f = await ensureFixture(h);
        spare = await createTemplate(h, 'email', 'Lien - jetable');
        await Templates.loadAll();
        await EmailLink.set(f.D1, spare);
        const snapshotSpare = await Templates.snapshotRow(spare);
        const snapshotD = await Templates.snapshotRow(f.D1);
        check(problems, 'la ligne gardée du document porte le lien', snapshotD.values.LinkedEmail, tokenOnDisk(spare));
        await Templates.remove(spare);
        await Templates.loadAll();
        check(problems, 'email supprimé : plus d\'email pour le document', EmailLink.emailOf(Templates.byId(f.D1)), null);
        check(problems, 'email supprimé : le lien est dit « disparu »', EmailLink.isDangling(Templates.byId(f.D1)), true);
        // Un autre email reprend le même numéro de ligne : il a un autre jeton, le lien ne passe pas sur lui.
        await SchemaColumns.docApi.applyUserActions([['AddRecord', 'Publipostage_Templates', spare, { Name: 'Lien - autre email', TemplateType: 'email', Content: '<p>autre</p>', Token: SPARE_LINK_ID }]]);
        await Templates.loadAll();
        check(problems, 'le numéro est repris par un autre email', Templates.byId(spare) && Templates.byId(spare).nom, 'Lien - autre email');
        check(problems, 'le lien ne passe pas sur l\'email qui reprend le numéro', EmailLink.emailOf(Templates.byId(f.D1)), null);
        check(problems, 'il reste « disparu »', EmailLink.isDangling(Templates.byId(f.D1)), true);
        // Retirer le jeton d'un email disparu se fait par set(…, null), sans pas dans l'historique.
        ActionHistory.reset();
        check(problems, 'retirer le lien disparu', await EmailLink.set(f.D1, null), true);
        check(problems, 'plus de lien sur disque', linkOnDisk(f.D1), '');
        check(problems, 'ni pas d\'historique', ActionHistory.count(), 0);
        // Annuler la suppression de l'email : même jeton, mêmes documents.
        await Templates.remove(spare);
        await Templates.restoreRow(snapshotSpare);
        await Templates.loadAll();
        const back = Templates.getCached().find(t => t.typeModele === 'email' && t.jeton === snapshotSpare.values.Token);
        check(problems, 'l\'email revient avec son jeton', !!back, true);
        spare = back ? back.id : null;
        // Un document supprimé puis rendu rend aussi son lien.
        await Templates.setLinkedEmail(f.D1, spare);
        const snapshotLinked = await Templates.snapshotRow(f.D1);
        await Templates.remove(f.D1);
        await Templates.restoreRow(snapshotLinked);
        await Templates.loadAll();
        const restored = Templates.byId(f.D1);
        check(problems, 'le document rendu par Annuler retrouve son lien', restored && EmailLink.emailOf(restored) && EmailLink.emailOf(restored).id, spare);
        return verdict(problems, { back: spare });
      } finally {
        if (spare != null) { try { await Templates.remove(spare); } catch (e) { /* déjà parti */ } }
        await leave(h);
      }
    },
  });

  cases.push({
    id: 'email_link_button_is_one_click_there_and_one_click_back',
    description: 'Un document lié : le bouton à côté de l\'étoile (enveloppe) mène à son email en UN clic, l\'email montre le bouton « document » et ramène au document en un clic ; rien ne s\'écrit en route',
    async run(h) {
      const problems = [];
      try {
        const f = await ensureFixture(h);
        await EmailLink.set(f.D1, f.E1);
        await open(h, f.D1);
        stub().clearActionLog();
        const onDocument = buttonState();
        check(problems, 'sur le document : le bouton va à l\'email, avec son nom', [onDocument.toEmail, onDocument.toDocument, onDocument.target, onDocument.greyed], [true, false, true, false]);
        check(problems, 'sur le document : la phrase du bouton', onDocument.label, I18n.t('emailLink.button.toEmail', { name: 'Lien - email un' }));
        await click(h);
        check(problems, 'un clic : l\'email est ouvert', String(Templates.getCurrentId()), String(f.E1));
        const onEmail = buttonState();
        check(problems, 'sur l\'email : le bouton va au document, avec son nom', [onEmail.toEmail, onEmail.toDocument, onEmail.target, onEmail.greyed], [false, true, true, false]);
        check(problems, 'sur l\'email : la phrase du bouton', onEmail.label, I18n.t('emailLink.button.toDocument', { name: 'Lien - courrier un' }));
        check(problems, 'la liste montre l\'email', byId('template-select').value, String(f.E1));
        await click(h);
        check(problems, 'un clic en retour : le document est rouvert', String(Templates.getCurrentId()), String(f.D1));
        check(problems, 'rien n\'est écrit par les deux sauts', stub().getActionLog().filter(a => ['UpdateRecord', 'AddRecord', 'RemoveRecord'].includes(a[0]) && a[1] === TABLE).length, 0);
        return verdict(problems, { onDocument, onEmail });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'email_link_one_email_for_several_documents_goes_back_to_the_document_it_came_from',
    description: 'Un email lié à deux documents : ouvert d\'un document, son bouton ramène à CE document (pas à l\'autre) ; ouvert par la liste, avec deux documents et aucune origine, son clic ne devine pas : le coin d\'état dit de choisir dans le menu ; avec un seul document, il y va',
    async run(h) {
      const problems = [];
      try {
        const f = await ensureFixture(h);
        await EmailLink.set(f.D1, f.E1);
        await EmailLink.set(f.D2, f.E1);
        await open(h, f.D2);
        await click(h);
        check(problems, 'depuis le deuxième document : l\'email', String(Templates.getCurrentId()), String(f.E1));
        await click(h);
        check(problems, 'le retour va au deuxième document', String(Templates.getCurrentId()), String(f.D2));
        await open(h, f.D1);
        await click(h);
        await click(h);
        check(problems, 'depuis le premier document : le retour va au premier', String(Templates.getCurrentId()), String(f.D1));
        await open(h, f.E1);
        const several = buttonState();
        check(problems, 'ouvert seul, l\'email dit de choisir', [several.toDocument, several.target, several.label], [true, false, I18n.t('emailLink.button.chooseDocument')]);
        await click(h);
        check(problems, 'ouvert seul, le clic reste sur l\'email', String(Templates.getCurrentId()), String(f.E1));
        check(problems, 'ouvert seul, le coin d\'état dit de survoler le bouton', status(), I18n.t('emailLink.status.several'));
        await EmailLink.set(f.D2, null);
        await open(h, f.E1);
        await click(h);
        check(problems, 'un seul document : le clic y va', String(Templates.getCurrentId()), String(f.D1));
        return verdict(problems, {});
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'email_link_menu_lists_the_other_emails_and_the_second_click_opens_one',
    description: 'Le menu au survol d\'un document liste les emails, le lié en premier et marqué, puis « Choisir l\'email lié… » ; une autre ligne l\'ouvre en un deuxième clic ; l\'email ouvert ramène au document d\'où l\'on vient ; depuis un email, le menu liste les documents (les liés d\'abord)',
    async run(h) {
      const problems = [];
      try {
        const f = await ensureFixture(h);
        await EmailLink.set(f.D1, f.E1);
        await open(h, f.D1);
        byId('v2-linked-email-group').dispatchEvent(new MouseEvent('mouseenter'));
        const rows = flyoutRows().map(r => ({ text: r.textContent, active: r.classList.contains('is-active'), id: r.dataset.templateId || null, action: r.dataset.action || null }));
        const names = rows.map(r => r.text);
        check(problems, 'le premier est l\'email lié, marqué', [rows[0].text, rows[0].active, rows[0].id], ['Lien - email un', true, String(f.E1)]);
        check(problems, 'l\'autre email suit, non marqué', [rows[1].text, rows[1].active], ['Lien - email deux', false]);
        check(problems, 'la dernière ligne règle le lien', [rows[rows.length - 1].text, rows[rows.length - 1].action], [I18n.t('emailLink.menu.chooseEmail'), 'settings']);
        check(problems, 'aucun document dans la liste des emails', names.some(n => /courrier|grille/.test(n)), false);
        flyoutRows().find(r => r.dataset.templateId === String(f.E2)).click();
        await waitFor(() => Templates.isCurrent(f.E2), 3000);
        await h.sleep(300);
        check(problems, 'le deuxième clic ouvre l\'autre email', String(Templates.getCurrentId()), String(f.E2));
        check(problems, 'l\'email ouvert ramène au document d\'où l\'on vient, lié ou non', buttonState().label, I18n.t('emailLink.button.toDocument', { name: 'Lien - courrier un' }));
        byId('v2-linked-email-group').dispatchEvent(new MouseEvent('mouseenter'));
        const documents = flyoutRows().map(r => ({ text: r.textContent, id: r.dataset.templateId || null }));
        check(problems, 'depuis un email : les documents et les grilles', documents.filter(d => d.id).map(d => d.text).sort(), ['Lien - courrier deux', 'Lien - courrier un', 'Lien - grille']);
        await click(h);
        check(problems, 'un clic : on revient au document', String(Templates.getCurrentId()), String(f.D1));
        return verdict(problems, { rows, documents });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'email_link_without_a_link_the_click_opens_the_email_settings_and_the_menu_still_lists_the_emails',
    description: 'Un document sans email : le bouton dit « cliquer pour en choisir un », le clic ouvre Réglages sur l\'onglet Email ; le menu liste quand même les emails, aucun marqué',
    async run(h) {
      const problems = [];
      try {
        const f = await ensureFixture(h);
        await open(h, f.D2);
        const state = buttonState();
        check(problems, 'la phrase du bouton', state.label, I18n.t('emailLink.button.chooseEmail'));
        check(problems, 'sans compagnon', [state.toEmail, state.target, state.greyed], [true, false, false]);
        byId('v2-linked-email-group').dispatchEvent(new MouseEvent('mouseenter'));
        check(problems, 'le menu liste les emails, aucun marqué', flyoutRows().filter(r => r.dataset.templateId).map(r => [r.textContent, r.classList.contains('is-active')]), [['Lien - email deux', false], ['Lien - email un', false]]);
        button().click();
        await h.sleep(300);
        const modal = byId('settings-modal');
        check(problems, 'Réglages s\'ouvre', modal.style.display !== 'none', true);
        check(problems, 'sur l\'onglet Email', !document.querySelector('[data-settings-panel="mailClient"]').hidden, true);
        check(problems, 'le modèle ouvert n\'a pas changé', String(Templates.getCurrentId()), String(f.D2));
        return verdict(problems, { state });
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'email_link_button_is_greyed_with_its_reason_when_nothing_can_be_linked',
    description: 'Un document pas encore enregistré, un macro-modèle : le bouton est grisé (jamais retiré) et dit pourquoi, au survol et au clic ; le menu ne s\'ouvre pas',
    async run(h) {
      const problems = [];
      let macroId = null;
      try {
        const f = await ensureFixture(h);
        await h.clickButton('btn-new');
        await h.sleep(300);
        const unsaved = buttonState();
        check(problems, 'document neuf : grisé', unsaved.greyed, true);
        check(problems, 'document neuf : la raison', unsaved.reason, I18n.t('emailLink.button.unsaved'));
        check(problems, 'document neuf : le bouton est toujours là', !!button() && !button().hidden, true);
        MacroEditor.openModal(null);
        byId('macro-editor-name').value = 'Lien - macro';
        const cover = byId('macro-editor-cover');
        cover.value = String(f.D1);
        cover.dispatchEvent(new Event('change', { bubbles: true }));
        byId('macro-editor-save').click();
        await h.sleep(800);
        macroId = Templates.getCurrentId();
        const macro = buttonState();
        check(problems, 'macro-modèle : grisé', macro.greyed, true);
        check(problems, 'macro-modèle : la raison', macro.reason, I18n.t('emailLink.button.type'));
        check(problems, 'macro-modèle : le menu n\'a aucune ligne', flyoutRows().length, 0);
        return verdict(problems, { unsaved, macro });
      } finally {
        if (macroId != null) { try { await Templates.remove(macroId); } catch (e) { /* déjà parti */ } }
        await leave(h);
      }
    },
  });

  cases.push({
    id: 'email_link_settings_choose_an_email_for_the_document_and_ctrl_z_takes_it_back',
    description: 'Réglages > Email d\'un document : la liste des emails, « Aucun » compris ; choisir un email pose le lien et le dit ; Ctrl + Z le retire, Ctrl + Y le repose, depuis un AUTRE modèle que celui du geste ; le bouton suit',
    async run(h) {
      const problems = [];
      try {
        const f = await ensureFixture(h);
        await open(h, f.D1);
        openSettingsEmail();
        const select = byId('settings-emaillink-select');
        check(problems, 'la section est montrée pour un document', [byId('settings-emaillink-choose').hidden, byId('settings-emaillink-docs-block').hidden], [false, true]);
        check(problems, 'le titre', byId('settings-emaillink-title').textContent, I18n.t('emailLink.title.document'));
        check(problems, 'les choix : aucun puis les emails', Array.from(select.options).map(o => o.textContent), [I18n.t('emailLink.select.none'), 'Lien - email deux', 'Lien - email un']);
        check(problems, 'aucun email lié au départ', select.value, '');
        select.value = String(f.E1);
        select.dispatchEvent(new Event('change', { bubbles: true }));
        await waitFor(() => linkOnDisk(f.D1) !== '', 3000);
        await h.sleep(300);
        check(problems, 'le lien est écrit', linkOnDisk(f.D1), tokenOnDisk(f.E1));
        check(problems, 'le coin d\'état le dit', status(), I18n.t('status.emailLinked', { email: 'Lien - email un', name: 'Lien - courrier un' }));
        check(problems, 'le bouton suit', buttonState().label, I18n.t('emailLink.button.toEmail', { name: 'Lien - email un' }));
        byId('settings-close').click();
        await open(h, f.D2);
        inPage('z');
        await settle(h);
        check(problems, 'Ctrl + Z depuis un autre modèle : le lien est retiré', linkOnDisk(f.D1), '');
        check(problems, 'Ctrl + Z : le coin d\'état', status(), I18n.t('status.emailUnlinked', { name: 'Lien - courrier un' }));
        inPage('y');
        await settle(h);
        check(problems, 'Ctrl + Y : le lien revient', linkOnDisk(f.D1), tokenOnDisk(f.E1));
        // Ce qu'une autre personne a changé depuis n'est pas écrasé.
        await Templates.setLinkedEmail(f.D1, f.E2);
        await Templates.loadAll();
        inPage('z');
        await settle(h);
        check(problems, 'un lien changé depuis n\'est pas écrasé', linkOnDisk(f.D1), tokenOnDisk(f.E2));
        check(problems, 'le coin d\'état le dit', status(), I18n.t('emailLink.history.changed', { name: 'Lien - courrier un' }));
        return verdict(problems, {});
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'email_link_settings_on_an_email_list_its_documents_and_link_or_remove_one',
    description: 'Réglages > Email d\'un email : les documents liés (chacun avec « Retirer »), la liste pour en lier un de plus - un document qui avait un autre email passe à celui-ci -, « Retirer » retire le lien ; sans document lié la phrase le dit',
    async run(h) {
      const problems = [];
      try {
        const f = await ensureFixture(h);
        await EmailLink.set(f.D2, f.E2);
        await open(h, f.E1);
        openSettingsEmail();
        check(problems, 'la section d\'un email', [byId('settings-emaillink-choose').hidden, byId('settings-emaillink-docs-block').hidden, byId('settings-emaillink-title').textContent], [true, false, I18n.t('emailLink.title.email')]);
        check(problems, 'aucun document lié : la phrase', [byId('settings-emaillink-empty').hidden, byId('settings-emaillink-list').children.length], [false, 0]);
        const add = byId('settings-emaillink-add');
        check(problems, 'les documents à lier, celui qui a un autre email le dit', Array.from(add.options).map(o => o.textContent), [I18n.t('emailLink.add.placeholder'), I18n.t('emailLink.add.option', { name: 'Lien - courrier deux', email: 'Lien - email deux' }), 'Lien - courrier un', 'Lien - grille']);
        add.value = String(f.D2);
        add.dispatchEvent(new Event('change', { bubbles: true }));
        await waitFor(() => linkOnDisk(f.D2) === tokenOnDisk(f.E1), 3000);
        await h.sleep(200);
        check(problems, 'le document passe à cet email', [linkOnDisk(f.D2) === tokenOnDisk(f.E1), EmailLink.documentsOf(Templates.byId(f.E2)).length], [true, 0]);
        check(problems, 'la liste montre le document avec « Retirer »', Array.from(byId('settings-emaillink-list').querySelectorAll('li')).map(li => [li.querySelector('.settings-emaillink-name').textContent, li.querySelector('button').textContent]), [['Lien - courrier deux', I18n.t('emailLink.remove')]]);
        byId('settings-emaillink-list').querySelector('button').click();
        await waitFor(() => linkOnDisk(f.D2) === '', 3000);
        await h.sleep(200);
        check(problems, 'Retirer retire le lien', linkOnDisk(f.D2), '');
        check(problems, 'la phrase « aucun document » revient', byId('settings-emaillink-empty').hidden, false);
        return verdict(problems, {});
      } finally { await leave(h); }
    },
  });

  cases.push({
    id: 'email_link_settings_are_greyed_with_their_reason',
    description: 'Un document pas enregistré, un macro-modèle, aucun email enregistré, la lecture seule : la liste est grisée (jamais retirée) et une phrase visible dit pourquoi ; un email disparu s\'affiche « Email supprimé » avec sa phrase',
    async run(h) {
      const problems = [];
      const savedRights = AccessRights.get;
      let spare = null;
      try {
        const f = await ensureFixture(h);
        await h.clickButton('btn-new');
        await h.sleep(300);
        openSettingsEmail();
        check(problems, 'document neuf : la phrase', [byId('settings-emaillink-reason').hidden, byId('settings-emaillink-reason').textContent], [false, I18n.t('emailLink.reason.unsaved')]);
        check(problems, 'document neuf : aucun des deux blocs', [byId('settings-emaillink-choose').hidden, byId('settings-emaillink-docs-block').hidden], [true, true]);
        byId('settings-close').click();
        await open(h, f.D1);
        AccessRights.get = () => ({ readOnly: true, canExport: false, canComment: false });
        EmailLinkPanel.render();
        check(problems, 'lecture seule : la liste est grisée', byId('settings-emaillink-select').disabled, true);
        check(problems, 'lecture seule : la phrase du verrou', byId('settings-emaillink-reason').textContent, I18n.t('settings.viewTemplate.locked'));
        AccessRights.get = savedRights;
        spare = await createTemplate(h, 'email', 'Lien - jetable deux');
        await Templates.setLinkedEmail(f.D1, spare);
        await Templates.loadAll();
        await Templates.remove(spare);
        spare = null;
        await Templates.loadAll();
        await open(h, f.D1);
        openSettingsEmail();
        EmailLinkPanel.render();
        const select = byId('settings-emaillink-select');
        check(problems, 'email disparu : le choix « Email supprimé »', [select.value, select.options[select.selectedIndex].textContent], ['__gone__', I18n.t('emailLink.select.gone')]);
        check(problems, 'email disparu : la phrase', byId('settings-emaillink-gone').hidden, false);
        select.value = '';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        await waitFor(() => linkOnDisk(f.D1) === '', 3000);
        check(problems, 'choisir « Aucun » retire le lien disparu', linkOnDisk(f.D1), '');
        return verdict(problems, {});
      } finally {
        AccessRights.get = savedRights;
        if (spare != null) { try { await Templates.remove(spare); } catch (e) { /* déjà parti */ } }
        await leave(h);
      }
    },
  });

  cases.push({
    id: 'email_link_texts_come_in_french_and_in_english',
    description: 'Les textes de la section de Réglages et du bouton existent en français et en anglais, sans trace de « modèle » dans les gestes de tous les jours',
    async run(h) {
      const problems = [];
      const lang = I18n.getLang();
      try {
        const f = await ensureFixture(h);
        await open(h, f.D1);
        const keys = Object.keys(typeof I18nTextsEml === 'undefined' ? {} : I18nTextsEml).filter(k => /^emailLink\./.test(k) || /^status\.email(Link|Unlink)/.test(k));
        check(problems, 'les clés ne sont pas perdues', keys.length > 30, true);
        for (const lng of ['fr', 'en']) {
          I18n.setLang(lng);
          keys.forEach(key => {
            const text = I18n.t(key, { name: 'N', email: 'E' });
            if (!text || text === key) problems.push(lng + ' : texte absent pour ' + key);
            if (lng === 'fr' && /modèle/i.test(text)) problems.push('fr : « modèle » dans ' + key + ' : ' + text);
          });
        }
        I18n.setLang('en');
        EmailLinkPanel.render();
        check(problems, 'le titre en anglais', byId('settings-emaillink-title').textContent, 'Email linked to this document');
        return verdict(problems, { keys: keys.length });
      } finally { I18n.setLang(lang); await leave(h); }
    },
  });

  return cases;
})();
