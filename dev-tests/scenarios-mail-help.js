// Suite "mailHelp" - l'aide « L'email ne s'ouvre pas ? » (js/mail-help.js, css/mail-help.css) et l'option « Webmail Zimbra » de Réglages > Email (js/mailto-export.js, js/settings.js ; demande du 27/11 : des collègues sous
// Chrome, hors du Windows préparé par la DSI, n'ouvrent pas les liens d'email ; leur messagerie est un webmail Zimbra). Ce que ces cas figent :
//  1) la détection du poste d'après l'agent du navigateur (Windows, macOS, Linux ; Firefox, Chrome, Edge, Safari ; Opera et autres = « autre » ; un téléphone = « autre système ») ;
//  2) les étapes suivent les trois réponses (webmail ou logiciel, système, navigateur), dans l'ordre Firefox, Chrome, Edge (« on favorise le libre ici ») ; rien tant que la première réponse manque ;
//  3) chaque texte de la fenêtre existe en français ET en anglais (étapes, repères, encadrés, option de Réglages), avec les mêmes paramètres {…} dans les deux langues ; chaque capture annoncée a ses deux fichiers ;
//  4) la réponse « webmail ou logiciel » est gardée par personne (`pp_mail_help`), une valeur inconnue = pas de réponse, un stockage qui refuse la clé = valable jusqu'au rechargement ;
//  5) « Webmail Zimbra » : l'adresse (`pp_zimbra_url`) est normalisée (https ajouté, requête et ancre ôtées, http et identifiants refusés), le lien de rédaction est celui que le gestionnaire de Zimbra suit
//     (`?view=compose&to=` + le lien mailto: entier encodé, relu à l'identique), le lien écrit pour `zimbraWeb` est celui de `zimbra`, et le brouillon s'ouvre dans un nouvel onglet (jamais dans la page du widget) ;
//  6) la fenêtre : deux listes préremplies, la question, rien d'autre tant qu'elle n'est pas répondue, puis les étapes du cas, les deux encadrés de tous et celui de Zimbra pour un webmail seulement ;
//  7) Réglages > Email : un troisième choix, le champ de l'adresse grisé tant qu'il n'est pas choisi, une adresse retenue sous sa forme normalisée, une adresse refusée dite et jamais retenue.
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const el = id => document.getElementById(id);
  const failedOf = checks => Object.keys(checks).filter(k => !checks[k]);
  const verdict = (checks, extra) => ({ pass: failedOf(checks).length === 0, notes: JSON.stringify(Object.assign({ lang: I18n.getLang(), failed: failedOf(checks), checks }, extra || {})) });

  // 1) Détection ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'mail_help_detects_the_computer_from_the_user_agent',
    description: 'La détection lit l\'agent du navigateur : Windows, macOS, Linux ; Firefox, Chrome, Edge, Safari ; Opera, Vivaldi, Samsung = « autre » ; un téléphone ou une tablette = « autre système »',
    run: async () => {
      const table = [
        ['Windows Chrome', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 'Win32', 'windows', 'chrome'],
        ['Windows Edge', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0', 'Win32', 'windows', 'edge'],
        ['Windows Firefox', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0', 'Win32', 'windows', 'firefox'],
        ['Mac Safari', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15', 'MacIntel', 'mac', 'safari'],
        ['Mac Chrome', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 'MacIntel', 'mac', 'chrome'],
        ['Linux Firefox', 'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0', 'Linux x86_64', 'linux', 'firefox'],
        ['Windows Opera', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0', 'Win32', 'windows', 'other'],
        ['Windows Vivaldi', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Vivaldi/6.5', 'Win32', 'windows', 'other'],
        ['iPhone Safari', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1', 'iPhone', 'other', 'safari'],
        ['Android Chrome', 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36', 'Linux armv81', 'other', 'chrome'],
        ['Linux Chrome sans tête (les essais)', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36', 'Linux x86_64', 'linux', 'chrome'],
        ['rien', '', '', 'other', 'other'],
      ];
      const checks = {};
      table.forEach(([name, userAgent, platform, os, browser]) => {
        const got = MailHelp.detect({ userAgent, platform });
        checks[name] = got.os === os && got.browser === browser;
      });
      checks.currentPageDoesNotThrow = (() => { const got = MailHelp.detect(); return MailHelp.OSES.includes(got.os) && MailHelp.BROWSERS.includes(got.browser); })();
      return verdict(checks);
    },
  });

  // 2) Les étapes --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'mail_help_steps_follow_the_three_answers',
    description: 'Les étapes viennent des trois réponses : rien sans « webmail ou logiciel » ; webmail + Windows = le type MAILTO puis le navigateur ; Firefox avant Chrome avant Edge dans les listes ; Safari et un navigateur inconnu ont leur texte',
    run: async () => {
      const f = MailHelp.stepsFor;
      const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      const checks = {
        noAnswerNoStep: same(f('', 'windows', 'chrome'), []) && same(f(null, 'mac', 'safari'), []) && same(f('inconnu', 'linux', 'firefox'), []),
        webmailWindowsFirefox: same(f('webmail', 'windows', 'firefox'), ['winMailto', 'firefox']),
        webmailWindowsChrome: same(f('webmail', 'windows', 'chrome'), ['winMailto', 'chrome']),
        webmailWindowsEdge: same(f('webmail', 'windows', 'edge'), ['winMailto', 'edge']),
        webmailWindowsOther: same(f('webmail', 'windows', 'other'), ['winMailto', 'otherWeb']),
        webmailLinuxFirefox: same(f('webmail', 'linux', 'firefox'), ['firefox']),
        webmailMacSafari: same(f('webmail', 'mac', 'safari'), ['safariWeb', 'macMail']),
        webmailMacChrome: same(f('webmail', 'mac', 'chrome'), ['chrome', 'macMail']),
        softwareWindowsChrome: same(f('software', 'windows', 'chrome'), ['winSoftware', 'browserAsk']),
        softwareWindowsSafari: same(f('software', 'windows', 'safari'), ['winSoftware']),
        softwareMac: same(f('software', 'mac', 'safari'), ['macSoftware']) && same(f('software', 'mac', 'firefox'), ['macSoftware', 'browserAsk']),
        softwareOther: same(f('software', 'other', 'other'), ['otherSoftware']),
        everyStepExists: ['webmail', 'software'].every(kind => MailHelp.OSES.every(os => MailHelp.BROWSERS.every(browser => f(kind, os, browser).every(id => MailHelp.STEP_IDS.includes(id))))),
        browsersInTheFreeFirstOrder: MailHelp.BROWSERS.indexOf('firefox') < MailHelp.BROWSERS.indexOf('chrome') && MailHelp.BROWSERS.indexOf('chrome') < MailHelp.BROWSERS.indexOf('edge'),
        kindsWebmailThenSoftware: JSON.stringify(MailHelp.KINDS) === '["webmail","software"]',
      };
      return verdict(checks);
    },
  });

  // 3) Les textes et les captures ------------------------------------------------------------------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'mail_help_every_text_exists_in_french_and_english',
    description: 'Chaque texte de l\'aide existe en français et en anglais (titre, phrase et repères de chaque étape, encadrés, noms des systèmes et navigateurs, option de Réglages, statuts, lien de la fenêtre « Email trop long »), avec les mêmes {paramètres} ; chaque capture annoncée a ses deux fichiers',
    run: async () => {
      const catalogs = [I18nTextsEml, I18nTextsSettings, I18nTextsExport, I18nTextsStatus];
      const entry = key => { for (const c of catalogs) if (c[key]) return c[key]; return null; };
      const keys = [
        'mailHelp.buttonTip', 'mailHelp.title', 'mailHelp.intro', 'mailHelp.device.title', 'mailHelp.device.detected', 'mailHelp.device.os', 'mailHelp.device.browser', 'mailHelp.kind.title', 'mailHelp.kind.webmail', 'mailHelp.kind.software', 'mailHelp.kind.pick',
        'mailHelp.step', 'mailHelp.zoom', 'mailHelp.unzoom', 'mailHelp.zimbra.title', 'mailHelp.zimbra.p1', 'mailHelp.zimbra.button', 'mailHelp.attachments.title', 'mailHelp.attachments.p1', 'mailHelp.attachments.p2', 'mailHelp.attachments.p3', 'mailHelp.length.title', 'mailHelp.length.p1', 'mailHelp.length.p2',
        'settings.mailClient.zimbraWeb', 'settings.mailClient.zimbraWebUrl.label', 'settings.mailClient.zimbraWebUrl.placeholder', 'settings.mailClient.zimbraWebUrl.hint', 'settings.mailClient.zimbraWebUrl.disabled', 'settings.mailClient.zimbraWebUrl.missing', 'settings.mailClient.zimbraWebUrl.invalid', 'settings.mailClient.zimbraWebUrl.none', 'settings.mailClient.help',
        'status.emailCreatedWebmail', 'status.emailCreatedWebmailWarningOff', 'status.emailCreatedWebmailNoUrl', 'dialog.emailTooLong.help',
      ];
      MailHelp.OSES.forEach(os => keys.push('mailHelp.os.' + os));
      keys.push('mailHelp.os.windows11');
      MailHelp.BROWSERS.forEach(browser => keys.push('mailHelp.browser.' + browser));
      MailHelp.STEP_IDS.forEach(id => {
        const def = MailHelp.STEPS[id];
        keys.push('mailHelp.step.' + id + '.title');
        if (def.lead) keys.push('mailHelp.step.' + id + '.lead');
        for (let n = 1; n <= def.marks; n++) keys.push('mailHelp.step.' + id + '.mark' + n);
        if (def.shot) keys.push('mailHelp.step.' + id + '.alt');
      });
      const paramsOf = text => (String(text).match(/\{[a-zA-Z]+\}/g) || []).sort().join(',');
      const missing = [], mismatched = [];
      keys.forEach(key => {
        const e = entry(key);
        if (!e || !e.fr || !e.en) { missing.push(key); return; }
        if (paramsOf(e.fr) !== paramsOf(e.en)) mismatched.push(key);
      });
      const shots = [];
      MailHelp.STEP_IDS.forEach(id => { const def = MailHelp.STEPS[id]; if (def.shot) ['fr', 'en'].forEach(lang => shots.push('img/mail-help/' + lang + '-' + def.shot.file + '.png')); });
      const absent = [];
      for (const path of shots) {
        let ok = false;
        try { const r = await fetch(path, { cache: 'no-store' }); ok = r.ok && /image\/png/.test(r.headers.get('content-type') || ''); } catch (e) { ok = false; }
        if (!ok) absent.push(path);
      }
      const checks = {
        noTextMissing: missing.length === 0,
        sameParametersInBothLanguages: mismatched.length === 0,
        everyShotHasItsTwoFiles: shots.length >= 2 && absent.length === 0,
        // Un texte d'étape qui cite le navigateur n'écrit « {browser} » que là où le navigateur est un des trois nommés (Firefox, Chrome, Edge) : « Autre navigateur » y serait faux.
        browserParameterOnlyInOwnSteps: MailHelp.STEP_IDS.every(id => !/\{browser\}/.test(entry('mailHelp.step.' + id + '.title').fr + (entry('mailHelp.step.' + id + '.lead') || { fr: '' }).fr) || id === 'browserAsk'),
      };
      return verdict(checks, { missing, mismatched, absent });
    },
  });
  cases.push({
    id: 'mail_help_every_text_exists_in_french_and_english_page_in_english',
    lang: 'en',
    description: 'Page qui démarre en anglais : les mêmes textes sont lus en anglais, sans clé brute ni texte français dans la fenêtre d\'aide ouverte',
    run: async () => {
      const checks = {};
      PersonStore.remove('pp_mail_help');
      MailHelp.setKind('webmail');
      MailHelp.open();
      await sleep(120);
      const win = el('pp-mail-help-modal');
      const text = win ? win.textContent : '';
      checks.opened = !!win && win.style.display === 'flex';
      checks.titleInEnglish = !!win && win.querySelector('h3').textContent === 'The email does not open?';
      checks.noRawKey = !/mailHelp\.|settings\.mailClient\./.test(text);
      checks.noFrenchLeft = !/Étape|Où lisez|Fermer|ouvrez|Détecté/.test(text);
      checks.englishSteps = /Step 1/.test(text) && /Where do you read your emails\?/.test(text);
      el('pp-mail-help-close').click();
      MailHelp.setKind('');
      return verdict(checks);
    },
  });

  // 4) La réponse retenue ----------------------------------------------------------------------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'mail_help_kind_is_kept_per_person',
    description: 'La réponse « webmail ou logiciel » est gardée par personne (`pp_mail_help`) ; une valeur inconnue vaut « pas de réponse » ; effacer la réponse retire la clé ; un stockage qui refuse la clé garde le choix jusqu\'au rechargement',
    run: async () => {
      const KEY = 'pp_mail_help';
      const saved = PersonStore.get(KEY);
      const checks = {};
      try {
        MailHelp.setKind('');
        checks.noneByDefault = MailHelp.getKind() === '' && PersonStore.get(KEY) == null;
        MailHelp.setKind('webmail');
        checks.webmailKept = MailHelp.getKind() === 'webmail' && PersonStore.get(KEY) === 'webmail';
        MailHelp.setKind('software');
        checks.softwareKept = MailHelp.getKind() === 'software' && PersonStore.get(KEY) === 'software';
        MailHelp.setKind('nimporte quoi');
        checks.unknownIsNoAnswer = MailHelp.getKind() === '' && PersonStore.get(KEY) == null;
        PersonStore.set(KEY, 'bizarre');
        checks.storedUnknownIsNoAnswer = MailHelp.getKind() === '';
        // Un navigateur qui refuse son stockage : le choix tient jusqu'au rechargement.
        const realGet = Storage.prototype.getItem;
        const realSet = Storage.prototype.setItem;
        Storage.prototype.getItem = function () { throw new Error('refusé'); };
        Storage.prototype.setItem = function () { throw new Error('refusé'); };
        try {
          MailHelp.setKind('webmail');
          checks.keptInMemoryWhenStorageRefuses = MailHelp.getKind() === 'webmail';
        } finally {
          Storage.prototype.getItem = realGet;
          Storage.prototype.setItem = realSet;
        }
        MailHelp.setKind('');
      } finally {
        MailHelp.setKind('');
        if (saved != null) PersonStore.set(KEY, saved);
      }
      return verdict(checks);
    },
  });

  // 5) Webmail Zimbra ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'mail_zimbra_web_address_is_normalized_and_kept',
    description: '« Webmail Zimbra » : l\'adresse reçoit https:// quand il manque, perd sa requête et son ancre, refuse http, les identifiants et un texte illisible ; elle est gardée sous `pp_zimbra_url` et une adresse refusée retire la clé',
    run: async () => {
      const KEY = 'pp_zimbra_url';
      const saved = PersonStore.get(KEY);
      const n = MailtoExport.normalizeWebmailUrl;
      const checks = {};
      try {
        checks.bareHost = n('zimbra.exemple.fr') === 'https://zimbra.exemple.fr/';
        checks.keepsHttps = n('https://zimbra.exemple.fr/') === 'https://zimbra.exemple.fr/';
        checks.keepsPath = n('https://mail.exemple.fr/zimbra/') === 'https://mail.exemple.fr/zimbra/';
        checks.dropsQueryAndHash = n('https://zimbra.exemple.fr/?view=compose&to=x#top') === 'https://zimbra.exemple.fr/';
        checks.trimsSpaces = n('  zimbra.exemple.fr  ') === 'https://zimbra.exemple.fr/';
        checks.refusesHttp = n('http://zimbra.exemple.fr/') === '';
        checks.refusesOtherSchemes = n('javascript:alert(1)') === '' && n('ftp://zimbra.exemple.fr') === '' && n('mailto:a@b.fr') === '';
        checks.refusesCredentials = n('https://moi:secret@zimbra.exemple.fr/') === '' && n('https://moi@zimbra.exemple.fr/') === '';
        checks.refusesUnreadable = n('https://') === '' && n('') === '' && n(null) === '' && n(undefined) === '' && n('https://exemple fr/') === '';
        checks.keepsPort = n('https://zimbra.exemple.fr:8443/') === 'https://zimbra.exemple.fr:8443/';
        MailtoExport.setZimbraUrl('zimbra.exemple.fr/?x=1');
        checks.keptNormalized = MailtoExport.getZimbraUrl() === 'https://zimbra.exemple.fr/' && PersonStore.get(KEY) === 'https://zimbra.exemple.fr/';
        MailtoExport.setZimbraUrl('http://pas-https.fr/');
        checks.refusedAddressRemovesTheKey = MailtoExport.getZimbraUrl() === '' && PersonStore.get(KEY) == null;
        MailtoExport.setZimbraUrl('zimbra.exemple.fr');
        MailtoExport.setZimbraUrl('');
        checks.emptiedRemovesTheKey = MailtoExport.getZimbraUrl() === '' && PersonStore.get(KEY) == null;
        PersonStore.set(KEY, 'http://ancienne-adresse-en-clair.fr/');
        checks.storedClearAddressIgnored = MailtoExport.getZimbraUrl() === '';
      } finally {
        MailtoExport.setZimbraUrl('');
        if (saved != null) PersonStore.set(KEY, saved);
      }
      return verdict(checks);
    },
  });

  cases.push({
    id: 'mail_zimbra_web_compose_link_is_the_one_zimbra_follows',
    description: '« Webmail Zimbra » : le lien de rédaction est <adresse>?view=compose&to=<le lien mailto: entier, encodé une fois>, relu à l\'identique ; sans adresse, ou pour un autre lien qu\'un mailto:, il n\'y en a pas ; le lien écrit pour `zimbraWeb` est celui de `zimbra`, au caractère près',
    run: async () => {
      const KEY = 'pp_zimbra_url';
      const savedUrl = PersonStore.get(KEY);
      const savedClient = MailtoExport.getMailClient();
      const checks = {};
      try {
        MailtoExport.setZimbraUrl('');
        const mailto = MailtoExport.buildMailtoUrl({ to: 'marie.dupont@exemple.fr', cc: 'chef+equipe@exemple.fr', subject: 'Relance & suite : 50 % <urgent>', bodyText: 'Bonjour,\nVoir https://exemple.fr/?a=1&b=2 + merci', client: 'zimbraWeb' });
        checks.noAddressNoLink = MailtoExport.zimbraComposeUrl(mailto) === null;
        MailtoExport.setZimbraUrl('zimbra.exemple.fr');
        const compose = MailtoExport.zimbraComposeUrl(mailto);
        checks.composeShape = compose === 'https://zimbra.exemple.fr/?view=compose&to=' + encodeURIComponent(mailto);
        const back = new URL(compose);
        checks.readsBackIdentically = back.searchParams.get('view') === 'compose' && back.searchParams.get('to') === mailto;
        checks.notAMailtoNoLink = MailtoExport.zimbraComposeUrl('https://exemple.fr/') === null && MailtoExport.zimbraComposeUrl('') === null && MailtoExport.zimbraComposeUrl(null) === null;
        const args = { to: 'a@b.fr', cc: 'c@d.fr', bcc: 'e@f.fr', subject: 'Objet & « essai » + 1 < 2 > 0', bodyText: 'Ligne 1\n\nLigne 2 & 3 + 4' };
        checks.sameLinkAsZimbra = MailtoExport.buildMailtoUrl(Object.assign({}, args, { client: 'zimbraWeb' })) === MailtoExport.buildMailtoUrl(Object.assign({}, args, { client: 'zimbra' }));
        checks.standardUnchanged = MailtoExport.buildMailtoUrl(Object.assign({}, args, { client: 'standard' })) !== MailtoExport.buildMailtoUrl(Object.assign({}, args, { client: 'zimbra' }));
        // La lecture qu'en fait Zimbra : le modèle de js/mailto-export.js (suite emailZimbra) n'est là que si cette suite est chargée ; sinon la relecture d'URL ci-dessus suffit.
        if (window.ZimbraModel) {
          const read = window.ZimbraModel.read(mailto);
          checks.zimbraModelReadsSubjectWithoutAmp = read && !/&amp;amp;/.test(read.subject) && /Relance &amp; suite/.test(read.subject);
        }
        // Le choix du client : `zimbraWeb` est connu, une valeur inconnue retombe sur `standard`.
        MailtoExport.setMailClient('zimbraWeb');
        checks.clientKept = MailtoExport.getMailClient() === 'zimbraWeb' && MailtoExport.opensInWebmail() === true;
        MailtoExport.setZimbraUrl('');
        checks.chosenWithoutAddressDoesNotOpenInWebmail = MailtoExport.getMailClient() === 'zimbraWeb' && MailtoExport.opensInWebmail() === false;
        MailtoExport.setZimbraUrl('zimbra.exemple.fr');
        MailtoExport.setMailClient('zimbra');
        checks.otherClientDoesNotOpenInWebmail = MailtoExport.opensInWebmail() === false;
      } finally {
        MailtoExport.setMailClient(savedClient);
        MailtoExport.setZimbraUrl('');
        if (savedUrl != null) PersonStore.set(KEY, savedUrl);
      }
      return verdict(checks);
    },
  });

  cases.push({
    id: 'mail_zimbra_web_draft_opens_in_a_new_tab',
    description: '« Webmail Zimbra » : openLink ouvre le lien de rédaction de Zimbra dans un nouvel onglet (target _blank, rel noopener noreferrer) ; hors de ce choix, le lien mailto: s\'ouvre comme avant ; choisi sans adresse, il s\'ouvre comme celui de Zimbra',
    run: async () => {
      const KEY = 'pp_zimbra_url';
      const savedUrl = PersonStore.get(KEY);
      const savedClient = MailtoExport.getMailClient();
      const realClick = HTMLAnchorElement.prototype.click;
      const clicks = [];
      const checks = {};
      HTMLAnchorElement.prototype.click = function () { clicks.push({ href: this.getAttribute('href'), target: this.target, rel: this.rel }); };
      try {
        const mailto = 'mailto:marie@exemple.fr?subject=Essai';
        MailtoExport.setZimbraUrl('zimbra.exemple.fr');
        MailtoExport.setMailClient('zimbraWeb');
        MailtoExport.openLink(mailto);
        const web = clicks.pop();
        checks.webmailHref = !!web && web.href === 'https://zimbra.exemple.fr/?view=compose&to=' + encodeURIComponent(mailto);
        checks.webmailNewTab = !!web && web.target === '_blank' && /noopener/.test(web.rel) && /noreferrer/.test(web.rel);
        MailtoExport.openLink(mailto, { newTab: true });
        const many = clicks.pop();
        checks.manyDraftsAlsoWebmail = !!many && many.href.startsWith('https://zimbra.exemple.fr/?view=compose&to=') && many.target === '_blank';
        MailtoExport.setMailClient('standard');
        MailtoExport.openLink(mailto);
        const standard = clicks.pop();
        checks.standardOpensTheMailtoLink = !!standard && standard.href === mailto && (standard.target === '' || standard.target === '_blank');
        MailtoExport.setMailClient('zimbraWeb');
        MailtoExport.setZimbraUrl('');
        MailtoExport.openLink(mailto);
        const bare = clicks.pop();
        checks.chosenWithoutAddressOpensTheMailtoLink = !!bare && bare.href === mailto;
        checks.noLinkLeftInThePage = !document.querySelector('body > a[href^="mailto:"], body > a[href*="view=compose"]');
      } finally {
        HTMLAnchorElement.prototype.click = realClick;
        MailtoExport.setMailClient(savedClient);
        MailtoExport.setZimbraUrl('');
        if (savedUrl != null) PersonStore.set(KEY, savedUrl);
      }
      return verdict(checks);
    },
  });

  // 6) La fenêtre -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const helpCase = {
    id: 'mail_help_window_shows_the_case_of_the_person',
    description: 'La fenêtre d\'aide : deux listes préremplies (corrigeables), la question « webmail ou logiciel » ; tant qu\'elle n\'a pas de réponse, aucune étape ; webmail + Windows + Firefox = deux étapes dans cet ordre, l\'encadré Zimbra, les pièces jointes et la longueur ; logiciel = ni encadré Zimbra ni étape de navigateur propre ; la réponse est retenue à la réouverture ; Fermer ferme',
    run: async () => {
      const checks = {};
      const text = () => el('pp-mail-help-modal').textContent;
      const stepIds = () => Array.from(el('pp-mail-help-modal').querySelectorAll('.mail-help-step')).map(li => li.dataset.step);
      const pick = async (value) => { const radio = el('pp-mail-help-kind-' + value); radio.click(); await sleep(60); };
      const choose = async (id, value) => { const select = el(id); select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); await sleep(60); };
      try {
        MailHelp.setKind('');
        MailHelp.open();
        await sleep(120);
        const win = el('pp-mail-help-modal');
        checks.opened = !!win && win.style.display === 'flex';
        checks.twoSelectsPrefilled = !!el('pp-mail-help-os') && !!el('pp-mail-help-browser') && MailHelp.OSES.includes(el('pp-mail-help-os').value) && MailHelp.BROWSERS.includes(el('pp-mail-help-browser').value);
        checks.browserListHasFirefoxBeforeChrome = (() => { const values = Array.from(el('pp-mail-help-browser').options).map(o => o.value); return values.indexOf('firefox') < values.indexOf('chrome') && values.indexOf('chrome') < values.indexOf('edge'); })();
        checks.detectedSentence = /^(Détecté|Detected)/.test(win.querySelector('.mail-help-device .mail-help-note').textContent);
        checks.questionBothAnswersUnticked = !el('pp-mail-help-kind-webmail').checked && !el('pp-mail-help-kind-software').checked;
        checks.noStepWithoutAnswer = stepIds().length === 0 && !!win.querySelector('.mail-help-pick');
        checks.commonCardsAlwaysThere = !!el('pp-mail-help-attachments') && !!el('pp-mail-help-length');
        checks.noZimbraCardWithoutAnswer = !el('pp-mail-help-zimbra');

        await choose('pp-mail-help-os', 'windows');
        await choose('pp-mail-help-browser', 'firefox');
        await pick('webmail');
        checks.webmailWindowsFirefoxSteps = JSON.stringify(stepIds()) === '["winMailto","firefox"]';
        checks.stepsNumbered = /Étape 1|Step 1/.test(text()) && /Étape 2|Step 2/.test(text());
        checks.threeMarksPerStep = Array.from(win.querySelectorAll('.mail-help-step')).every(li => li.querySelectorAll('.mail-help-mark-item').length === 3);
        checks.zimbraCardForWebmail = !!el('pp-mail-help-zimbra') && !!el('pp-mail-help-zimbra-button');
        checks.kindRemembered = MailHelp.getKind() === 'webmail';

        await choose('pp-mail-help-browser', 'chrome');
        checks.chromeStep = JSON.stringify(stepIds()) === '["winMailto","chrome"]';
        const shot = win.querySelector('.mail-help-step[data-step="chrome"] .mail-help-shot img');
        checks.chromeShotNamedForTheLanguage = !!shot && new RegExp('img/mail-help/' + I18n.getLang() + '-chrome\\.png').test(shot.getAttribute('src'));
        checks.chromeShotHasAlt = !!shot && shot.alt.length > 20;
        // Une capture qui ne se charge pas n'enlève que son cadre : les repères restent.
        if (shot) shot.dispatchEvent(new Event('error'));
        await sleep(30);
        checks.brokenShotRemovedMarksKept = !win.querySelector('.mail-help-step[data-step="chrome"] .mail-help-shot') && win.querySelectorAll('.mail-help-step[data-step="chrome"] .mail-help-mark-item').length === 3;

        await choose('pp-mail-help-browser', 'safari');
        await choose('pp-mail-help-os', 'mac');
        checks.safariMac = JSON.stringify(stepIds()) === '["safariWeb","macMail"]';

        await pick('software');
        await choose('pp-mail-help-os', 'windows');
        await choose('pp-mail-help-browser', 'edge');
        checks.softwareWindowsEdge = JSON.stringify(stepIds()) === '["winSoftware","browserAsk"]';
        checks.noZimbraCardForSoftware = !el('pp-mail-help-zimbra');
        checks.browserNamedInTheStep = /Microsoft Edge/.test(win.querySelector('.mail-help-step[data-step="browserAsk"]').textContent);
        checks.kindNowSoftware = MailHelp.getKind() === 'software';

        el('pp-mail-help-close').click();
        await sleep(40);
        checks.closed = win.style.display === 'none';
        MailHelp.open();
        await sleep(100);
        checks.reopenedKeepsTheAnswer = el('pp-mail-help-kind-software').checked && !el('pp-mail-help-kind-webmail').checked && stepIds().length >= 1;
        el('pp-mail-help-close').click();
        await sleep(40);

        // La rubrique demandée (le lien de la fenêtre « Email trop long ») : la fenêtre s'ouvre et l'encadré existe.
        MailHelp.open({ section: 'length' });
        await sleep(100);
        checks.sectionOpens = el('pp-mail-help-modal').style.display === 'flex' && !!el('pp-mail-help-length');
        el('pp-mail-help-close').click();
        await sleep(40);
      } finally {
        const w = el('pp-mail-help-modal');
        if (w && w.style.display === 'flex') el('pp-mail-help-close').click();
        MailHelp.setKind('');
      }
      return verdict(checks);
    },
  };
  cases.push(helpCase);
  cases.push(Object.assign({}, helpCase, {
    id: 'mail_help_window_shows_the_case_of_the_person_in_english',
    lang: 'en',
    description: 'Page qui démarre en anglais : la fenêtre d\'aide montre les mêmes étapes, dans les mêmes cas, avec ses textes en anglais',
  }));

  // 7) Réglages > Email ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const settingsCase = {
    id: 'mail_zimbra_web_settings_tab',
    description: 'Réglages > Email : « Webmail Zimbra » est un troisième choix ; le champ de l\'adresse est grisé (avec sa phrase) tant qu\'il n\'est pas choisi ; choisi sans adresse, il le dit ; une adresse tapée est retenue sous sa forme normalisée, une adresse refusée est dite et jamais retenue ; le lien « Voir l\'aide » ouvre la fenêtre d\'aide',
    run: async () => {
      const KEY_CLIENT = 'pp_mail_client';
      const KEY_URL = 'pp_zimbra_url';
      const savedClient = PersonStore.get(KEY_CLIENT);
      const savedUrl = PersonStore.get(KEY_URL);
      const open = () => { if (el('settings-modal').style.display !== 'flex') el('v2-btn-settings').click(); };
      const close = () => { if (el('settings-modal').style.display === 'flex') el('settings-close').click(); };
      const radio = value => document.querySelector(`input[name="settings-mail-client"][value="${value}"]`);
      const checks = {};
      try {
        MailtoExport.setMailClient('standard');
        MailtoExport.setZimbraUrl('');
        open();
        await sleep(100);
        document.querySelector('#settings-modal .settings-tab[data-settings-tab="mailClient"]').click();
        await sleep(60);
        const input = el('settings-zimbra-url');
        const state = el('settings-zimbra-url-state');
        checks.threeChoices = Array.from(document.querySelectorAll('input[name="settings-mail-client"]')).map(r => r.value).join(',') === 'standard,zimbra,zimbraWeb';
        checks.webmailChoiceHasItsLabel = /Webmail Zimbra|Zimbra webmail/.test(radio('zimbraWeb').parentElement.textContent);
        checks.fieldDisabledUntilChosen = input.disabled === true && !state.hidden && state.textContent.length > 10;
        checks.fieldHasItsLabelAndHint = !!document.querySelector('label[for="settings-zimbra-url"]') && el('settings-zimbra-url-hint').textContent.length > 40 && /settings-zimbra-url-hint/.test(input.getAttribute('aria-describedby'));
        radio('zimbraWeb').click();
        await sleep(60);
        checks.chosenKept = MailtoExport.getMailClient() === 'zimbraWeb' && PersonStore.get(KEY_CLIENT) === 'zimbraWeb';
        checks.fieldEnabledOnceChosen = input.disabled === false && document.activeElement === input;
        checks.missingAddressSaid = !state.hidden && state.textContent === I18n.t('settings.mailClient.zimbraWebUrl.missing') && !state.classList.contains('is-invalid');
        input.value = 'http://pas-https.fr/';
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(40);
        checks.refusedAddressSaid = !state.hidden && state.classList.contains('is-invalid') && state.textContent === I18n.t('settings.mailClient.zimbraWebUrl.invalid');
        checks.refusedAddressNotKept = MailtoExport.getZimbraUrl() === '' && PersonStore.get(KEY_URL) == null && input.value === 'http://pas-https.fr/';
        input.value = 'zimbra.exemple.fr/?x=1';
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(40);
        checks.addressKeptNormalized = MailtoExport.getZimbraUrl() === 'https://zimbra.exemple.fr/' && PersonStore.get(KEY_URL) === 'https://zimbra.exemple.fr/' && input.value === 'https://zimbra.exemple.fr/';
        checks.noMessageOnceAddressIsGood = state.hidden === true;
        close();
        open();
        await sleep(80);
        checks.reopenedShowsTheSavedAddress = input.value === 'https://zimbra.exemple.fr/' && radio('zimbraWeb').checked && input.disabled === false;
        radio('standard').click();
        await sleep(60);
        checks.backToStandardGreysTheField = input.disabled === true && MailtoExport.getZimbraUrl() === 'https://zimbra.exemple.fr/';
        // « Voir l'aide » : la fenêtre d'aide s'ouvre par-dessus Réglages.
        el('settings-mail-help').click();
        await sleep(120);
        checks.helpLinkOpensTheHelp = el('pp-mail-help-modal') && el('pp-mail-help-modal').style.display === 'flex';
        el('pp-mail-help-close').click();
        await sleep(60);
        checks.settingsStillOpenBehind = el('settings-modal').style.display === 'flex';
      } finally {
        const w = el('pp-mail-help-modal');
        if (w && w.style.display === 'flex') el('pp-mail-help-close').click();
        close();
        MailtoExport.setMailClient(savedClient || 'standard');
        if (savedClient == null) PersonStore.remove(KEY_CLIENT);
        MailtoExport.setZimbraUrl('');
        if (savedUrl != null) PersonStore.set(KEY_URL, savedUrl);
        document.querySelector('#settings-modal .settings-tab[data-settings-tab="language"]').click();
      }
      return verdict(checks);
    },
  };
  cases.push(settingsCase);
  cases.push(Object.assign({}, settingsCase, {
    id: 'mail_zimbra_web_settings_tab_in_english',
    lang: 'en',
    description: 'Page qui démarre en anglais : l\'onglet Email de Réglages écrit le troisième choix, son champ et ses phrases en anglais ; il marche comme en français',
  }));

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.mailHelp = cases;
})();
