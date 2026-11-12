// Les brouillons d'email de toutes les lignes (demande du 12/11 : « créer les emails de toute la table d'un coup », sur le modèle de l'export PDF en lot ; choix : « Ouvrir les brouillons par paquets »).
// Un lien `mailto:` ne porte qu'UN brouillon (js/mailto-export.js) et un navigateur n'envoie rien de lui-même : le widget prépare donc d'avance le lien de chaque ligne, puis ouvre les brouillons dans le logiciel de
// messagerie de la personne, par paquets (10 par clic au départ) - un onglet par brouillon dans un webmail comme Zimbra. Chaque brouillon s'ouvre rempli (destinataires, objet, texte) ; la personne le relit et l'envoie. Le
// widget n'envoie rien, ne copie rien dans le presse-papiers et n'écrit rien dans Grist.
//   EmailDrafts.prepare(rows, { describe(row), onProgress?(current, total) }) -> Promise<{ items, stopped }>
//    rows : les lignes à écrire ; describe(row) : { fields: { objet, destinataires, cc, cci }, url } (js/main-email.js:describeMailForRecord) ; la série est lue par paquets de CHUNK lignes dans une même passe de lecture
//    (GristAPI.withReadPass : chaque table n'est lue qu'une fois par série), WorkPacer rend la main entre deux lignes, et la pastille du lot (js/batch-progress.js) porte « Arrêter ». `stopped` : « Arrêter » cliqué, rien n'est ouvert.
//    items : [{ rowId, url, to, subject, issues }] dans l'ordre des lignes ; `issues` : ce qui est à vérifier avant d'ouvrir ce brouillon - 'noRecipient' (aucune adresse dans À, Cc ni Cci), 'badAddress' (une adresse n'a pas la
//    forme d'une adresse email : `address`), 'tooLong' (le lien dépasse la limite des logiciels de messagerie : `length`, `limit`), 'failed' (la ligne n'a pas pu être écrite : pas de lien). Ces lignes ne sont jamais ouvertes d'office.
//   EmailDrafts.open({ tableId, items }) -> Promise<{ opened }> (se résout à la fermeture - « Fermer » ou Échap - avec le nombre de brouillons ouverts)
//    La fenêtre « Brouillons d'email » : la liste des lignes (destinataire, objet, ce qui est à vérifier), un bouton « Ouvrir » par ligne, et « Ouvrir les N suivants » qui ouvre le paquet d'après, N réglé dans la fenêtre (1, 5, 10 ou 20).
//    Les liens d'un paquet sont ouverts dans la foulée du clic, sans attente entre eux : un navigateur ne laisse ouvrir une fenêtre qu'au geste de la personne (et en bloque souvent les suivantes) - d'où le choix « 1 ». Plus d'un lien
//    par clic : chacun dans un nouvel onglet (MailtoExport.openLink, `newTab`), pour que les liens ne se remplacent pas l'un l'autre dans le cadre du widget. La progression (les lignes ouvertes) est gardée jusqu'au rechargement :
//    rouvrir la fenêtre pour la même table reprend là où l'on s'était arrêté tant que le lien d'une ligne n'a pas changé.
// Les textes viennent des clés `emailDrafts.*` (fr + en) ; la fenêtre est celle de la base commune (js/modal-base.js : titre et boutons fixes, seule la liste défile, 700x400 tenu).
const EmailDrafts = (function () {
  const el = Dom.el;
  const CHUNK = 25;
  const PACK_CHOICES = [1, 5, 10, 20];
  // Les textes longs d'une cellule (un objet, une liste d'adresses) sont coupés : chaque ligne de la liste se lit d'un coup d'œil.
  const MAX_TEXT = 70;

  let pack = 10;                // brouillons ouverts à chaque clic, réglé dans la fenêtre, gardé jusqu'au rechargement
  const openedUrls = new Map(); // « table#ligne » -> le lien ouvert : la progression, gardée tant que la page vit

  const clip = text => {
    const flat = String(text || '').replace(/\s+/g, ' ').trim();
    return flat.length > MAX_TEXT ? flat.slice(0, MAX_TEXT - 1) + '…' : flat;
  };
  const keyOf = (tableId, rowId) => tableId + '#' + rowId;

  // Le brouillon d'une ligne : ce que la liste en montre et ce qu'il y a à vérifier. Une ligne dont l'écriture échoue n'arrête pas les autres : elle figure dans la liste, sans lien.
  async function itemOf(row, describe) {
    let mail;
    try {
      mail = await describe(row);
    } catch (e) {
      console.error('[EmailDrafts] ligne impossible à écrire', row.id, e);
      return { rowId: row.id, url: '', to: '', subject: '', issues: [{ kind: 'failed' }] };
    }
    const fields = mail.fields;
    const to = MailtoExport.addressesOf(fields.destinataires);
    const all = to.concat(MailtoExport.addressesOf(fields.cc), MailtoExport.addressesOf(fields.cci));
    const issues = [];
    if (!all.length) issues.push({ kind: 'noRecipient' });
    else {
      const bad = all.find(address => !MailtoExport.looksLikeAddress(address));
      if (bad) issues.push({ kind: 'badAddress', address: bad });
    }
    const check = MailtoExport.checkUrlLength(mail.url);
    if (!check.safe) issues.push({ kind: 'tooLong', length: check.length, limit: check.limit });
    return { rowId: row.id, url: mail.url, to: to.join(', '), subject: String(fields.objet || '').replace(/\s+/g, ' ').trim(), issues };
  }

  async function prepare(rows, { describe, onProgress }) {
    const items = [];
    const pace = WorkPacer.create();
    const progress = BatchProgress.begin({ key: 'emailDrafts.progress', total: rows.length });
    let stopped = false;
    try {
      for (let start = 0; start < rows.length && !stopped; start += CHUNK) {
        await GristAPI.withReadPass(async () => {
          for (let i = start; i < Math.min(rows.length, start + CHUNK); i++) {
            await pace();
            if (progress && progress.stopped()) { stopped = true; return; }
            if (progress) progress.update(i + 1);
            if (onProgress) onProgress(i + 1, rows.length);
            items.push(await itemOf(rows[i], describe));
          }
        });
      }
    } finally { if (progress) progress.end(); }
    return { items, stopped };
  }

  let win = null;
  let refs = null;
  let current = null;           // la fenêtre ouverte : { finish() }

  function ensure() {
    if (win) return;
    win = ModalBase.create({
      id: 'pp-email-drafts-modal', titleId: 'pp-email-drafts-title', size: 'md', boxClass: 'pp-email-drafts-box', actionsClass: 'var-modal-actions',
      onEscape: () => { if (current) current.finish(); },
    });
    const intro = el('p', 'pp-email-drafts-intro');
    const issues = el('p', 'pp-email-drafts-issues');
    const packRow = el('div', 'pp-email-drafts-pack');
    const packLabel = el('label', 'pp-email-drafts-pack-label');
    packLabel.htmlFor = 'pp-email-drafts-pack-select';
    const packSelect = el('select', 'pp-email-drafts-pack-select');
    packSelect.id = 'pp-email-drafts-pack-select';
    PACK_CHOICES.forEach(n => { const option = el('option', '', String(n)); option.value = String(n); packSelect.append(option); });
    const packHint = el('p', 'pp-email-drafts-hint');
    const counter = el('span', 'pp-email-drafts-counter');
    counter.setAttribute('role', 'status');
    packRow.append(packLabel, packSelect, counter);
    const list = el('ul', 'pp-email-drafts-list');
    win.body.append(intro, issues, packRow, packHint, list);
    const reset = Dom.button('', '');
    const close = Dom.button('', '');
    const next = Dom.button('var-modal-primary', '');
    win.actions.append(reset, el('span', 'var-modal-spacer'), close, next);
    refs = { intro, issues, packLabel, packSelect, packHint, counter, list, reset, close, next };
  }

  // Ce qu'un brouillon à vérifier dit, en une phrase.
  function issueText(issue) {
    if (issue.kind === 'badAddress') return I18n.t('emailDrafts.issue.badAddress', { address: clip(issue.address) });
    if (issue.kind === 'tooLong') return I18n.t('emailDrafts.issue.tooLong', { length: issue.length, limit: issue.limit });
    return I18n.t('emailDrafts.issue.' + issue.kind);
  }

  function show({ tableId, items }) {
    const { intro, issues, packLabel, packSelect, packHint, counter, list, reset, close, next } = refs;
    win.title.textContent = I18n.t('emailDrafts.title');
    intro.textContent = I18n.t('emailDrafts.intro', { n: items.length });
    const flagged = items.filter(item => item.issues.length).length;
    issues.textContent = flagged ? I18n.t('emailDrafts.introIssues', { n: flagged }) : '';
    issues.hidden = !flagged;
    packLabel.textContent = I18n.t('emailDrafts.packLabel');
    packSelect.value = String(pack);
    packHint.textContent = I18n.t('emailDrafts.packHint');
    reset.textContent = I18n.t('emailDrafts.reset');
    close.textContent = I18n.t('common.close');
    // La progression d'une séance qui précède : une ligne déjà ouverte, au même lien, reste marquée.
    items.forEach(item => { item.opened = !!item.url && openedUrls.get(keyOf(tableId, item.rowId)) === item.url; });

    const rowViews = items.map(item => {
      const li = el('li', 'pp-email-drafts-item');
      const main = el('span', 'pp-email-drafts-main');
      main.append(
        el('span', 'pp-email-drafts-to', item.to || I18n.t('emailDrafts.rowLabel', { id: item.rowId })),
        el('span', 'pp-email-drafts-subject', item.subject || I18n.t('emailDrafts.noSubject')),
      );
      const note = el('span', 'pp-email-drafts-note');
      main.append(note);
      const open = Dom.button('pp-email-drafts-open', '');
      open.disabled = !item.url;
      open.setAttribute('aria-label', I18n.t('emailDrafts.openAria', { id: item.rowId }));
      li.append(main, open);
      list.append(li);
      return { item, li, note, open };
    });

    const openable = () => items.filter(item => item.url && !item.opened && !item.issues.length);
    const openedCount = () => items.filter(item => item.opened).length;

    function refresh() {
      rowViews.forEach(({ item, li, note, open }) => {
        li.classList.toggle('is-opened', !!item.opened);
        li.classList.toggle('has-issue', item.issues.length > 0);
        note.textContent = item.opened ? I18n.t('emailDrafts.opened') : item.issues.map(issueText).join(' · ');
        open.textContent = I18n.t(item.opened ? 'emailDrafts.reopen' : 'emailDrafts.open');
      });
      counter.textContent = I18n.t('emailDrafts.counter', { opened: openedCount(), total: items.length });
      const n = Math.min(pack, openable().length);
      next.disabled = n === 0;
      next.textContent = n === 0 ? I18n.t('emailDrafts.nextNone') : I18n.t('emailDrafts.next', { n });
      reset.disabled = openedCount() === 0;
    }

    // Un lien ouvert. Plus d'un par clic : un nouvel onglet chacun (voir l'en-tête).
    function openOne(item, newTab) {
      try { MailtoExport.openLink(item.url, { newTab }); }
      catch (e) { console.error('[EmailDrafts] brouillon impossible à ouvrir', item.rowId, e); return; }
      item.opened = true;
      openedUrls.set(keyOf(tableId, item.rowId), item.url);
    }

    // Les liens du paquet partent dans la foulée du clic, sans `await` : la fenêtre du navigateur ne s'ouvre qu'au geste de la personne.
    next.onclick = () => {
      const batch = openable().slice(0, pack);
      batch.forEach(item => openOne(item, batch.length > 1));
      refresh();
      if (next.disabled) close.focus();
    };
    rowViews.forEach(({ item, open }) => { open.onclick = () => { openOne(item, false); refresh(); }; });
    packSelect.onchange = () => { pack = Number(packSelect.value) || 10; refresh(); };
    reset.onclick = () => {
      items.forEach(item => { item.opened = false; openedUrls.delete(keyOf(tableId, item.rowId)); });
      refresh();
      next.focus();
    };
    refresh();
    return { openedCount, focus: () => (next.disabled ? close : next) };
  }

  function open({ tableId, items }) {
    ensure();
    if (current) current.finish();
    refs.list.textContent = '';
    return new Promise(resolve => {
      let done = false;
      const view = show({ tableId, items: items || [] });
      const finish = () => {
        if (done) return;
        done = true;
        current = null;
        win.hide();
        resolve({ opened: view.openedCount() });
      };
      current = { finish };
      refs.close.onclick = finish;
      win.show(view.focus());
    });
  }

  return { prepare, open };
})();
