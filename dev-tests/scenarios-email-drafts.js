// Suite "emailDrafts" - les brouillons d'email de toutes les lignes (js/email-drafts.js, ReaderMode.resolvedHtml de js/reader-mode.js, MailtoExport.openLink / addressesOf / looksLikeAddress de js/mailto-export.js ;
// demande d'Antoine du 12/11 : « créer les emails de toute la table d'un coup », choix : « Ouvrir les brouillons par paquets »). Un lien mailto: ne porte qu'UN brouillon et un navigateur n'envoie rien : le widget
// prépare le lien de chaque ligne, puis les ouvre par paquets dans le logiciel de messagerie (un onglet par brouillon). Les cas :
//  1) le texte d'une ligne, résolu SANS passer par la Lecture (ReaderMode.resolvedHtml), est celui que « Créer l'email » écrit pour cette ligne (bulles à condition, « avant », gras, lignes vides, puces, citation, bloc
//     conditionnel), ligne par ligne : deux lignes qui ne se résolvent pas pareil ne s'écrasent pas ;
//  2) ce rendu n'écrit rien dans #reader-container et n'écarte pas un rendu de la Lecture qui tourne en même temps (la jauge de longueur et la Lecture se partagent ce conteneur) ;
//  3) la préparation signale ce qui est à vérifier avant d'ouvrir une ligne (aucun destinataire, adresse incorrecte, lien trop long, ligne impossible à écrire), garde l'ordre des lignes, ne laisse pas une ligne
//     en échec arrêter les autres, et « Arrêter » de la pastille l'interrompt sans rien ouvrir ;
//  4) la fenêtre : un paquet part d'un clic (N liens, un nouvel onglet chacun quand il y en a plusieurs), les lignes à vérifier ne partent pas d'office mais ont leur bouton, le compteur, « Rien d'autre à ouvrir »
//     et le focus rendu à « Fermer », « Tout remettre à ouvrir », Échap ;
//  5) la progression est gardée tant que le lien d'une ligne ne change pas, le réglage du paquet aussi ;
//  6) les adresses d'une cellule (séparées par virgule, point-virgule ou ligne) et la forme d'une adresse.
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const TABLE = 'MailDrafts';
  const HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const ROWS = [
    { id: 1, Porteur1: 'Pauline GRONDIN', Porteur2: 'Nelly VIDAL', Montant: 15000, Programme: 'Evènementiel', Ligne: 'Création de ligne' },
    { id: 2, Porteur1: 'Marc DUPUIS', Porteur2: '', Montant: 2500, Programme: 'OpenLab', Ligne: 'Renouvellement' },
  ];

  const attr = (name, value) => ` ${name}="${(typeof value === 'string' ? value : JSON.stringify(value)).replace(/"/g, '&quot;')}"`;
  const nonEmpty = column => ({ mode: 'all', rules: [{ column, operator: 'non vide', value: '' }] });
  const badge = (column, extra) => `<span class="var-badge" contenteditable="false" data-table="${TABLE}" data-column="${column}" data-key="${TABLE}.${column}"${extra || ''}>#${TABLE}.${column}</span>`;
  const BODY_HTML = `<p>Bonjour ${badge('Porteur1')} ${badge('Porteur2', attr('data-condition', nonEmpty('Porteur2')) + attr('data-before', ', '))}</p><p></p><p></p>`
    + `<p>Nous financons à hauteur de <strong>${badge('Montant')}</strong> euros votre projet.</p><p></p>`
    + `<ul><li><p>Programme : ${badge('Programme')}</p></li><li><p>Ligne : ${badge('Ligne')}</p></li></ul><p></p>`
    + `<blockquote><p>Citation ligne un</p><p>Citation ligne deux</p></blockquote><p></p>`
    + `<div class="conditional-text"${attr('data-condition', { mode: 'all', rules: [{ column: 'Programme', operator: '=', value: 'OpenLab' }] })}><p>Pour rappel : publier sur HAL.</p></div><p></p><p>Cordialement,</p>`;

  async function seed(h) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables(TABLE, { Porteur1: 'Text', Porteur2: 'Text', Montant: 'Numeric', Programme: 'Text', Ligne: 'Text' });
    stub.setRows(TABLE, ROWS);
    await GristAPI.refreshSchema();
    stub.fireRecord(ROWS[0], TABLE);
    await sleep(80);
  }

  // Les liens mailto: que la page ouvre, captés au clic de l'ancre (phase de capture) et jamais suivis.
  function captureMailtos() {
    const links = [];
    const onClick = e => {
      const a = e.target && e.target.closest && e.target.closest('a[href^="mailto:"]');
      if (a) { links.push({ href: a.getAttribute('href'), target: a.getAttribute('target') }); e.preventDefault(); }
    };
    document.addEventListener('click', onClick, true);
    return { links, stop: () => document.removeEventListener('click', onClick, true) };
  }

  cases.push({
    id: 'email_drafts_row_text_is_the_text_create_email_writes_for_that_row',
    description: 'Brouillons d\'email : le texte d\'une ligne, résolu par ReaderMode.resolvedHtml (sans la Lecture), est mot pour mot celui que « Créer l\'email » écrit - bulles à condition et « avant », gras, lignes vides, puces, citation, bloc conditionnel - pour chacune de deux lignes qui ne se résolvent pas pareil',
    run: async (h) => {
      await seed(h);
      const reader = document.getElementById('reader-container');
      reader.style.display = 'block';
      const viaReader = [];
      for (const row of ROWS) {
        window.__gristStub.fireRecord(row, TABLE);
        await sleep(60);
        await ReaderMode.render(BODY_HTML, TABLE, GristAPI.getCurrentRecord(), HF);
        viaReader.push(MailtoExport.plainTextFromHtml(reader.querySelector('.reader-content').innerHTML));
      }
      const viaResolved = await GristAPI.withReadPass(async () => {
        const out = [];
        for (const row of ROWS) {
          const resolved = await ReaderMode.resolvedHtml(BODY_HTML, TABLE, row);
          out.push(MailtoExport.plainTextFromHtml(resolved.html));
        }
        return out;
      });
      const lines = text => text.split('\n');
      const first = viaResolved[0] || '';
      const second = viaResolved[1] || '';
      const shape = /^Bonjour Pauline GRONDIN , Nelly VIDAL\n\n\nNous financons à hauteur de .+ euros votre projet\.\n\n• Programme : Evènementiel\n• Ligne : Création de ligne\n\n> Citation ligne un\n> Citation ligne deux\n\n\nCordialement,$/.test(first);
      const secondShape = /^Bonjour Marc DUPUIS\n\n\nNous financons à hauteur de .+ euros votre projet\.\n\n• Programme : OpenLab\n• Ligne : Renouvellement\n\n> Citation ligne un\n> Citation ligne deux\n\nPour rappel : publier sur HAL\.\n\nCordialement,$/.test(second);
      const same = viaResolved.every((text, i) => text === viaReader[i]);
      return { pass: same && shape && secondShape && first !== second, notes: JSON.stringify({ same, shape, secondShape, viaResolved, viaReader, lineCounts: viaResolved.map(t => lines(t).length) }) };
    },
  });

  cases.push({
    id: 'email_drafts_resolving_a_row_leaves_the_reader_and_a_running_render_alone',
    description: 'Brouillons d\'email : résoudre une ligne n\'écrit rien dans #reader-container et n\'écarte pas un rendu de la Lecture qui tourne en même temps (la jauge de longueur et la Lecture se partagent ce conteneur)',
    run: async (h) => {
      await seed(h);
      const reader = document.getElementById('reader-container');
      reader.style.display = 'block';
      reader.innerHTML = '<div class="reader-content" data-sentinel="1"><p>Contenu de la Lecture</p></div>';
      const before = reader.innerHTML;
      await GristAPI.withReadPass(() => ReaderMode.resolvedHtml(BODY_HTML, TABLE, ROWS[1]));
      const untouched = reader.innerHTML === before;
      // Un rendu de la Lecture lancé AVANT et fini APRÈS la résolution d'une ligne : il doit aboutir (le compteur de rendus ne bouge pas).
      window.__gristStub.fireRecord(ROWS[0], TABLE);
      await sleep(60);
      const running = ReaderMode.render('<p>Rendu de la Lecture ' + badge('Porteur1') + '</p>', TABLE, GristAPI.getCurrentRecord(), HF);
      await GristAPI.withReadPass(() => ReaderMode.resolvedHtml(BODY_HTML, TABLE, ROWS[1]));
      await running;
      const shown = (reader.querySelector('.reader-content') || {}).textContent || '';
      return { pass: untouched && /Rendu de la Lecture Pauline GRONDIN/.test(shown), notes: JSON.stringify({ untouched, shown }) };
    },
  });

  // La préparation, avec un describe(row) qui donne ce que main-email.js:describeMailForRecord donne : { fields, url }.
  const longUrl = 'mailto:a@b.fr?body=' + 'x'.repeat(2100);
  const fakeDescribe = row => {
    const plans = {
      1: { fields: { objet: 'Bonjour 1', destinataires: 'un@exemple.fr', cc: '', cci: '' }, url: 'mailto:un%40exemple.fr?subject=Bonjour%201' },
      2: { fields: { objet: 'Sans destinataire', destinataires: '', cc: '', cci: '' }, url: 'mailto:?subject=Sans%20destinataire' },
      3: { fields: { objet: 'Adresse incorrecte', destinataires: 'marie@, ok@exemple.fr', cc: '', cci: '' }, url: 'mailto:marie%40%2C%20ok%40exemple.fr?subject=Adresse' },
      4: { fields: { objet: 'Trop long', destinataires: 'long@exemple.fr', cc: '', cci: '' }, url: longUrl },
      5: { fields: { objet: 'Plusieurs', destinataires: 'a@exemple.fr; b@exemple.fr\nc@exemple.fr', cc: 'copie@exemple.fr', cci: 'Nom Prénom <cache@exemple.fr>' }, url: 'mailto:a%40exemple.fr?subject=Plusieurs' },
      6: { fields: { objet: 'Cc seulement', destinataires: '', cc: 'copie@exemple.fr', cci: '' }, url: 'mailto:?cc=copie%40exemple.fr' },
    };
    if (row.id === 7) throw new Error('ligne impossible');
    return plans[row.id];
  };

  cases.push({
    id: 'email_drafts_prepare_flags_what_to_check_and_keeps_the_rows_in_order',
    description: 'Brouillons d\'email : la préparation garde l\'ordre des lignes et signale ce qui est à vérifier - aucun destinataire, adresse incorrecte, lien trop long (2000 caractères), ligne impossible à écrire sans arrêter les autres ; une adresse en Cc ou Cci compte comme destinataire, des adresses séparées par virgule, point-virgule ou ligne sont toutes lues',
    run: async (h) => {
      await seed(h);
      const rows = [1, 2, 3, 4, 5, 6, 7, 1].map(id => ({ id }));
      const progress = [];
      const errors = [];
      const origError = console.error;
      console.error = (...args) => { errors.push(args.map(String).join(' ')); };
      let result;
      try { result = await EmailDrafts.prepare(rows, { describe: row => fakeDescribe(row), onProgress: (current, total) => progress.push(current + '/' + total) }); }
      finally { console.error = origError; }
      const kinds = result.items.map(item => item.issues.map(issue => issue.kind).join('+'));
      const longItem = result.items[3];
      const badItem = result.items[2];
      const failed = result.items[6];
      const pass = !result.stopped && result.items.length === 8
        && JSON.stringify(result.items.map(item => item.rowId)) === '[1,2,3,4,5,6,7,1]'
        && JSON.stringify(kinds) === JSON.stringify(['', 'noRecipient', 'badAddress', 'tooLong', '', '', 'failed', ''])
        && badItem.issues[0].address === 'marie@' && longItem.issues[0].length === longUrl.length && longItem.issues[0].limit === 2000
        && failed.url === '' && result.items[4].to === 'a@exemple.fr, b@exemple.fr, c@exemple.fr' && result.items[0].subject === 'Bonjour 1'
        && progress.length === 8 && progress[7] === '8/8' && errors.length === 1;
      return { pass, notes: JSON.stringify({ kinds, bad: badItem.issues, long: longItem.issues, failedUrl: failed.url, to: result.items[4].to, progress, errors: errors.length }) };
    },
  });

  cases.push({
    id: 'email_drafts_stop_button_ends_the_preparation_and_opens_nothing',
    description: 'Brouillons d\'email : « Arrêter » de la pastille interrompt la préparation entre deux lignes (stopped, pas de fenêtre), et la pastille disparaît ; un lot d\'une seule ligne n\'a pas de pastille',
    run: async (h) => {
      await seed(h);
      const rows = Array.from({ length: 6 }, () => ({ id: 1 }));
      let calls = 0;
      const result = await EmailDrafts.prepare(rows, {
        describe: async row => {
          calls++;
          if (calls === 2) { const stop = document.querySelector('.pp-batch-progress-stop'); if (stop) stop.click(); }
          return fakeDescribe(row);
        },
      });
      const pillGone = !document.querySelector('.pp-batch-progress');
      let single = null;
      await EmailDrafts.prepare([{ id: 1 }], { describe: async row => { single = !!document.querySelector('.pp-batch-progress'); return fakeDescribe(row); } });
      return { pass: result.stopped === true && calls === 2 && result.items.length === 2 && pillGone && single === false, notes: JSON.stringify({ stopped: result.stopped, calls, items: result.items.length, pillGone, single }) };
    },
  });

  const item = (id, over) => Object.assign({ rowId: id, url: 'mailto:p' + id + '%40exemple.fr?subject=S' + id, to: 'p' + id + '@exemple.fr', subject: 'S' + id, issues: [] }, over || {});
  const modal = () => document.getElementById('pp-email-drafts-modal');
  const q = selector => modal().querySelector(selector);
  const primary = () => q('.var-modal-actions .var-modal-primary');
  const counter = () => q('.pp-email-drafts-counter').textContent;
  const rowsIn = () => Array.from(modal().querySelectorAll('.pp-email-drafts-item'));
  const hrefId = href => Number((href.match(/mailto:p(\d+)/) || [])[1]);

  cases.push({
    id: 'email_drafts_window_opens_the_drafts_by_packs',
    description: 'Brouillons d\'email, la fenêtre : un paquet de 5 part d\'un clic (5 liens dans l\'ordre, un nouvel onglet chacun), la ligne à vérifier ne part pas d\'office mais a son bouton, le dernier clic n\'ouvre qu\'un lien (sans nouvel onglet forcé), puis « Rien d\'autre à ouvrir » et le focus sur « Fermer » ; « Tout remettre à ouvrir » ; Fermer rend le nombre ouvert',
    run: async (h) => {
      await seed(h);
      const cap = captureMailtos();
      try {
        const items = [1, 2, 3, 4, 5, 6, 7].map(id => item(id, id === 3 ? { issues: [{ kind: 'noRecipient' }], to: '' } : null));
        const done = EmailDrafts.open({ tableId: 'PacksOfFive', items });
        await sleep(80);
        const shownAtOpen = modal().style.display !== 'none' && rowsIn().length === 7;
        const issueRow = rowsIn()[2];
        const issueShown = issueRow.classList.contains('has-issue') && issueRow.querySelector('.pp-email-drafts-note').textContent === I18n.t('emailDrafts.issue.noRecipient');
        const noIssueLine = q('.pp-email-drafts-issues').hidden === false;
        const select = q('.pp-email-drafts-pack-select');
        select.value = '5';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        const labelFive = primary().textContent === I18n.t('emailDrafts.next', { n: 5 });
        primary().click();
        const firstPack = cap.links.map(link => hrefId(link.href));
        const allNewTab = cap.links.length === 5 && cap.links.every(link => link.target === '_blank');
        const counterFive = counter() === I18n.t('emailDrafts.counter', { opened: 5, total: 7 });
        const markedOpened = rowsIn().map(li => li.classList.contains('is-opened')).join(',') === 'true,true,false,true,true,true,false';
        const labelOne = primary().textContent === I18n.t('emailDrafts.next', { n: 1 });
        primary().click();
        const last = cap.links[cap.links.length - 1];
        const singleLink = cap.links.length === 6 && hrefId(last.href) === 7 && (last.target === '_blank') === GfsLink.opensInNewTab(last.href);
        const noMore = primary().disabled && primary().textContent === I18n.t('emailDrafts.nextNone');
        const closeFocused = document.activeElement && document.activeElement.textContent === I18n.t('common.close');
        issueRow.querySelector('.pp-email-drafts-open').click();
        const issueOpened = cap.links.length === 7 && hrefId(cap.links[6].href) === 3 && issueRow.querySelector('.pp-email-drafts-open').textContent === I18n.t('emailDrafts.reopen');
        const allOpened = counter() === I18n.t('emailDrafts.counter', { opened: 7, total: 7 });
        const resetButton = q('.var-modal-actions button');
        resetButton.click();
        const afterReset = counter() === I18n.t('emailDrafts.counter', { opened: 0, total: 7 }) && resetButton.disabled && !primary().disabled && rowsIn().every(li => !li.classList.contains('is-opened'));
        rowsIn()[0].querySelector('.pp-email-drafts-open').click();
        Array.from(modal().querySelectorAll('.var-modal-actions button')).find(b => b.textContent === I18n.t('common.close')).click();
        const result = await done;
        const closed = modal().style.display === 'none';
        const pass = shownAtOpen && issueShown && noIssueLine && labelFive && JSON.stringify(firstPack) === '[1,2,4,5,6]' && allNewTab && counterFive && markedOpened && labelOne && singleLink
          && noMore && closeFocused && issueOpened && allOpened && afterReset && result.opened === 1 && closed;
        return { pass, notes: JSON.stringify({ shownAtOpen, issueShown, noIssueLine, labelFive, firstPack, allNewTab, counterFive, markedOpened, labelOne, singleLink, noMore, closeFocused, issueOpened, allOpened, afterReset, opened: result.opened, closed }) };
      } finally {
        cap.stop();
        if (modal() && modal().style.display !== 'none') Array.from(modal().querySelectorAll('.var-modal-actions button')).find(b => b.textContent === I18n.t('common.close')).click();
      }
    },
  });

  cases.push({
    id: 'email_drafts_pack_of_one_opens_in_the_frame_like_create_email',
    description: 'Brouillons d\'email : avec « 1 » par clic, le lien s\'ouvre comme celui de « Créer l\'email » (MailtoExport.openLink sans nouvel onglet forcé), le choix du paquet est gardé à la réouverture, et Échap ferme la fenêtre en rendant ce qui a été ouvert',
    run: async (h) => {
      await seed(h);
      const cap = captureMailtos();
      try {
        const items = [1, 2, 3].map(id => item(id));
        let done = EmailDrafts.open({ tableId: 'PackOfOne', items });
        await sleep(60);
        const select = q('.pp-email-drafts-pack-select');
        select.value = '1';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        primary().click();
        const one = cap.links.length === 1 && (cap.links[0].target === '_blank') === GfsLink.opensInNewTab(cap.links[0].href);
        modal().querySelector('.pp-email-drafts-box').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        const result = await done;
        const closed = modal().style.display === 'none';
        done = EmailDrafts.open({ tableId: 'PackOfOne', items: [1, 2, 3].map(id => item(id)) });
        await sleep(60);
        const kept = q('.pp-email-drafts-pack-select').value === '1';
        const stillMarked = counter() === I18n.t('emailDrafts.counter', { opened: 1, total: 3 }) && rowsIn()[0].classList.contains('is-opened');
        Array.from(modal().querySelectorAll('.var-modal-actions button')).find(b => b.textContent === I18n.t('common.close')).click();
        await done;
        // Le lien d'une ligne a changé : la ligne n'est plus marquée ouverte. Une autre table non plus.
        done = EmailDrafts.open({ tableId: 'PackOfOne', items: [item(1, { url: 'mailto:p1%40exemple.fr?subject=Autre' }), item(2), item(3)] });
        await sleep(60);
        const changedLink = counter() === I18n.t('emailDrafts.counter', { opened: 0, total: 3 });
        Array.from(modal().querySelectorAll('.var-modal-actions button')).find(b => b.textContent === I18n.t('common.close')).click();
        await done;
        done = EmailDrafts.open({ tableId: 'AutreTable', items: [1, 2, 3].map(id => item(id)) });
        await sleep(60);
        const otherTable = counter() === I18n.t('emailDrafts.counter', { opened: 0, total: 3 });
        Array.from(modal().querySelectorAll('.var-modal-actions button')).find(b => b.textContent === I18n.t('common.close')).click();
        await done;
        // Le réglage du paquet revient à 10 pour la suite des cas.
        EmailDrafts.open({ tableId: 'PackOfOne', items: [item(1)] });
        await sleep(60);
        q('.pp-email-drafts-pack-select').value = '10';
        q('.pp-email-drafts-pack-select').dispatchEvent(new Event('change', { bubbles: true }));
        Array.from(modal().querySelectorAll('.var-modal-actions button')).find(b => b.textContent === I18n.t('common.close')).click();
        return { pass: one && result.opened === 1 && closed && kept && stillMarked && changedLink && otherTable, notes: JSON.stringify({ one, opened: result.opened, closed, kept, stillMarked, changedLink, otherTable }) };
      } finally {
        cap.stop();
        if (modal() && modal().style.display !== 'none') Array.from(modal().querySelectorAll('.var-modal-actions button')).find(b => b.textContent === I18n.t('common.close')).click();
      }
    },
  });

  cases.push({
    id: 'email_drafts_addresses_of_a_cell_and_their_shape',
    description: 'Brouillons d\'email : MailtoExport.addressesOf coupe une cellule à la virgule, au point-virgule et à la ligne (sans valeur vide) ; looksLikeAddress accepte « Nom <adresse> » et refuse « marie@ » ; le lien de « Créer l\'email » garde ses adresses séparées par des virgules, chacune encodée',
    run: async () => {
      const list = MailtoExport.addressesOf(' a@x.fr ;b@x.fr,\n c@x.fr ,, ');
      const none = MailtoExport.addressesOf('') .length === 0 && MailtoExport.addressesOf(null).length === 0 && MailtoExport.addressesOf(undefined).length === 0;
      const good = ['a@x.fr', 'Marie Dupont <marie@exemple.fr>', 'prenom.nom+tag@sous.exemple.fr'].every(a => MailtoExport.looksLikeAddress(a));
      const bad = ['marie@', 'marie', '@x.fr', 'marie@x', 'a b@x.fr'].every(a => !MailtoExport.looksLikeAddress(a));
      const url = MailtoExport.buildMailtoUrl({ to: 'a@x.fr, b@x.fr', cc: '', bcc: '', subject: 'S', bodyText: 'B', client: 'standard' });
      const linkOk = url.startsWith('mailto:a%40x.fr,b%40x.fr?') && !/cc=|bcc=/.test(url);
      return { pass: JSON.stringify(list) === '["a@x.fr","b@x.fr","c@x.fr"]' && none && good && bad && linkOk, notes: JSON.stringify({ list, none, good, bad, url }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.emailDrafts = cases;
})();
