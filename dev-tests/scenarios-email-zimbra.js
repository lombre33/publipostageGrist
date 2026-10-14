// Suite "emailZimbra" - le lien mailto: ouvert dans Zimbra (js/mailto-export.js, réglage Réglages > Email). Retour d'Antoine du 13/10 : « le charactère "&" est devenu "&amp;" - peux-tu faire en
// sorte que tous les caractères AZERTY et si possible QWERTY fonctionnent sans souci ? ». Le lien envoie « & » en « %26 », correctement : c'est Zimbra qui le relit mal (voir js/mailto-export.js, point
// 4). Le lien de Zimbra se règle donc par personne (« Standard » ou « Zimbra ») et ces cas vérifient les deux sens, pour ne rien casser :
//  1) le MODÈLE de Zimbra ci-dessous reproduit les défauts relevés sur un lien « Standard » (« & » affiché « &amp; », « + » devenu une espace, objet coupé à un « ? ») : sans cela, un modèle qui ne voit
//     jamais rien d'anormal ferait passer tous les autres cas ;
//  2) le lien « Standard » est celui d'avant le réglage, à l'octet près (adresse web avec « & », adresse email avec « + », numéro de téléphone, guillemets, accents, toutes les touches) ;
//  3) le lien « Zimbra » est relu sans écart par le modèle : toutes les touches AZERTY et QWERTY dans l'objet et dans le corps, avec ou sans Cc et Cci, un objet jamais coupé, les adresses À, Cc et
//     Cci jamais touchées ;
//  4) les deux limites de ce choix (une adresse web avec « & » et une adresse email avec « + » dans le corps) et le coût en longueur du lien sont figés : les changer demande de changer ce cas ;
//  5) le réglage : `standard` par défaut, gardé dans le navigateur (`pp_mail_client`), valeur inconnue = `standard`, stockage refusé = valable jusqu'au rechargement, onglet « Email » des Réglages.
// MODÈLE de la lecture d'un lien mailto: par le client web de Zimbra, décrit par son comportement et non recopié (sa licence l'interdit) ; rejoué le 13/10 contre le vrai code de ZmMailApp
// (versions 8.8.15, 9.0.0, 10.0.0, 10.1.0 et develop) sur plusieurs milliers de liens, avec les mêmes résultats :
//  - le navigateur glisse le lien entier, encodé une fois, dans l'adresse du gestionnaire de mailto: de Zimbra (« ?view=compose&to=… ») ;
//  - Zimbra décode cette adresse, puis cherche chaque champ par son nom jusqu'au premier « & » ; l'objet et le corps sont décodés une fois de plus (« + » y devient une espace), les adresses Cc et Cci
//    sont décodées après le remplacement de leur « + » ; objet et corps sont ensuite encodés en HTML (« & » → « &amp; ») sans que rien ne les décode, une adresse Cc ou Cci seulement si elle ne se
//    lit pas comme une adresse email ;
//  - le champ « to » est alors le lien lui-même : ce qui précède son premier « ? » est l'adresse, le premier paramètre qui la suit est relu une seconde fois de la même manière et l'emporte sur la
//    première lecture quand il donne quelque chose.
// Le modèle est aussi exposé (`window.ZimbraModel`) pour dev-tests/verify-email-mouse.mjs, qui relit le lien capté au vrai clic.
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function zimbraReads(link) {
    const decode = text => { try { return decodeURIComponent(text); } catch (e) { return unescape(text); } };
    const htmlEncode = text => String(text == null ? '' : text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const readFields = query => {
      const decoded = decode(query);
      const field = name => { const hit = decoded.match(new RegExp('\\b' + name + '=([^&]+)', 'i')); return hit ? hit[1] : null; };
      const prose = name => { const value = field(name); return value === null ? null : decode(value).replace(/\+/g, ' '); };
      const address = name => { const value = field(name); return value === null ? null : decode(value.replace(/\+/g, ' ')); };
      return { to: address('to'), cc: address('cc'), bcc: address('bcc'), subject: prose('subject'), body: prose('body') };
    };
    // Une adresse qui se lit comme « texte@domaine.xx » reste telle quelle (« a&b@x.fr » compris) ; le champ « to » est le lien lui-même, jamais lu ainsi.
    const looksLikeAddress = text => /^[^\s@<>,;()":\[\]\\]+@[^\s@<>,;()":\[\]\\]+\.[^\s@<>,;()":\[\]\\.]+$/.test(text || '');
    const encodedUnlessAddress = text => (looksLikeAddress(text) ? text : htmlEncode(text));
    const encoded = fields => ({ to: htmlEncode(fields.to), cc: encodedUnlessAddress(fields.cc), bcc: encodedUnlessAddress(fields.bcc), subject: htmlEncode(fields.subject), body: htmlEncode(fields.body) });
    const read = encoded(readFields('?view=compose&to=' + encodeURIComponent(link)));
    if (read.to.indexOf('mailto') !== 0) return read;
    const parts = read.to.replace(/mailto:/, '').split('?');
    read.to = parts[0];
    if (parts.length > 1) {
      const again = encoded(readFields(parts[1]));
      read.to = read.to ? (again.to ? read.to + ',' + again.to : read.to) : again.to;
      ['subject', 'cc', 'bcc', 'body'].forEach(name => { read[name] = again[name] || read[name]; });
    }
    return read;
  }
  window.ZimbraModel = { read: zimbraReads };

  // Les quatre signes que Zimbra lit mal, et leur forme large : écrits ici en toutes lettres, pas pris dans le code qu'ils vérifient.
  const WIDE = { '&': '＆', '<': '＜', '>': '＞', '+': '＋' };
  const wide = text => text.replace(/[&<>+]/g, sign => WIDE[sign]);
  // Les touches d'un clavier AZERTY français (avec Maj. et Alt Gr) et QWERTY américain, les lettres et chiffres, les accents et signes courants du français.
  const AZERTY = '²&é"\'(-è_çà)=~#{[|`\\^@]}$£¤*µù%!§:/;.,?<>°+¨€' + '1234567890' + 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ' + 'éèêëàâäîïôöûüùçñœæÉÈÊÀÇÔÛ' + '«»’…–—·×¿¡ßø°²³';
  const QWERTY = '`~!@#$%^&*()-_=+[{]}\\|;:\'",<.>/?';
  const KEYS = Array.from(new Set(Array.from(AZERTY + QWERTY + ' ')));
  // Les mêmes touches placées au début, au milieu, à la fin d'un texte, et doublées.
  const textsFor = key => ['A' + key + 'B', key + 'AB', 'AB' + key, key + key];

  // Le lien tel que l'écrivait js/mailto-export.js avant le réglage « Email » : référence figée du lien « Standard ».
  function linkBeforeTheSetting({ to, cc, bcc, subject, bodyText }) {
    const list = value => (value ? value.split(/[,;]/).map(a => a.trim()).filter(Boolean).map(a => encodeURIComponent(a)).join(',') : '');
    const params = [];
    if (cc) params.push('cc=' + list(cc));
    if (bcc) params.push('bcc=' + list(bcc));
    if (subject) params.push('subject=' + encodeURIComponent(subject));
    if (bodyText) params.push('body=' + encodeURIComponent(bodyText.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n')));
    return 'mailto:' + list(to) + (params.length ? '?' + params.join('&') : '');
  }
  const LAYOUTS = {
    'objet et corps': {},
    'avec Cc': { cc: 'c@d.fr' },
    'avec Cci': { bcc: 'e@f.fr' },
    'avec Cc et Cci': { cc: 'c@d.fr', bcc: 'e@f.fr' },
    'plusieurs destinataires': { to: 'a@b.fr; z@y.fr', cc: 'c@d.fr;g@h.fr' },
    'objet seul': { bodyText: '' },
    'corps seul': { subject: '' },
    'sans destinataire': { to: '' },
  };
  const optionsFor = (layout, text, client) => Object.assign({ to: 'a@b.fr', subject: text, bodyText: text, client }, layout);
  const lines = text => text.replace(/\r\n/g, '\n');

  cases.push({
    id: 'email_zimbra_model_shows_the_reported_defects',
    description: 'E-mail, Zimbra : le modèle de Zimbra reproduit les défauts relevés sur un lien « Standard » (« & » affiché « &amp; », « < » « &lt; », « + » devenu une espace, objet coupé à un « ? » ou un « & », « + » d\'une adresse en Cc devenu une espace) - sans cela le modèle ne prouverait rien',
    run: async () => {
      const read = (extra, text) => zimbraReads(MailtoExport.buildMailtoUrl(Object.assign({ to: 'a@b.fr', subject: text, bodyText: text }, extra)));
      const got = {
        ampersand: read({}, 'R&D').body,
        lessThan: read({}, 'a < b').body,
        plus: read({}, '3 + 4').body,
        subjectAmpersand: read({}, 'Tom & Jerry').subject,
        subjectQuestion: read({}, 'Facture ? payée').subject,
        ccPlus: zimbraReads(MailtoExport.buildMailtoUrl({ to: 'a@b.fr', cc: 'jean+test@exemple.fr', subject: 'S', bodyText: 'B' })).cc,
      };
      const want = {
        ampersand: 'R&amp;D', lessThan: 'a &lt; b', plus: '3   4', subjectAmpersand: 'Tom ', subjectQuestion: 'Facture ', ccPlus: 'jean test@exemple.fr',
      };
      return { pass: JSON.stringify(got) === JSON.stringify(want), notes: JSON.stringify({ got, want }) };
    },
  });

  cases.push({
    id: 'email_standard_link_is_the_one_from_before',
    description: 'E-mail, lien « Standard » (réglage par défaut) : identique à celui d\'avant le réglage, à l\'octet près - adresse web avec « & », adresse email avec « + », numéro de téléphone, guillemets, accents, toutes les touches AZERTY et QWERTY, dans toutes les dispositions du lien',
    run: async () => {
      const different = [];
      let count = 0;
      for (const [name, layout] of Object.entries(LAYOUTS)) {
        KEYS.forEach(key => textsFor(key).forEach(text => {
          const options = optionsFor(layout, text, undefined);
          const before = linkBeforeTheSetting(options);
          count++;
          [undefined, 'standard', 'autre'].forEach(client => {
            const now = MailtoExport.buildMailtoUrl(Object.assign({}, options, { client }));
            if (now !== before) different.push(name + ' ' + JSON.stringify(text) + ' ' + client);
          });
        }));
      }
      // Les liens écrits en toutes lettres : ce que reçoit la messagerie, figé (l'objet commence le lien, sans « cc= » vide).
      const frozen = {
        webAddress: MailtoExport.buildMailtoUrl({ to: 'a@b.fr', subject: 'Lien', bodyText: 'Voir https://exemple.fr/?a=1&b=2' }),
        plusAddress: MailtoExport.buildMailtoUrl({ to: 'a@b.fr', cc: 'jean+test@exemple.fr', subject: 'Copie' }),
        phone: MailtoExport.buildMailtoUrl({ to: 'a@b.fr', bodyText: 'Appeler le +33 6 12 34 56 78' }),
        quotes: MailtoExport.buildMailtoUrl({ to: 'a@b.fr', subject: '« Bonjour » "ok" d\'accord' }),
        nothing: MailtoExport.buildMailtoUrl({ to: 'a@b.fr' }),
      };
      const frozenWant = {
        webAddress: 'mailto:a%40b.fr?subject=Lien&body=Voir%20https%3A%2F%2Fexemple.fr%2F%3Fa%3D1%26b%3D2',
        plusAddress: 'mailto:a%40b.fr?cc=jean%2Btest%40exemple.fr&subject=Copie',
        phone: 'mailto:a%40b.fr?body=Appeler%20le%20%2B33%206%2012%2034%2056%2078',
        quotes: 'mailto:a%40b.fr?subject=%C2%AB%20Bonjour%20%C2%BB%20%22ok%22%20d\'accord',
        nothing: 'mailto:a%40b.fr',
      };
      const frozenOk = JSON.stringify(frozen) === JSON.stringify(frozenWant);
      return { pass: different.length === 0 && count > 1000 && frozenOk, notes: JSON.stringify({ count, different: different.slice(0, 5), frozen, frozenWant }) };
    },
  });

  cases.push({
    id: 'email_zimbra_link_survives_the_whole_keyboard',
    description: 'E-mail, lien « Zimbra » : chaque touche AZERTY et QWERTY (et les accents du français), au début, au milieu, à la fin d\'un texte et doublée, ressort de Zimbra telle qu\'elle a été tapée dans l\'objet et dans le corps - « & », « < », « > » et « + » en forme large -, jamais « &amp; », jamais coupée, avec ou sans Cc et Cci',
    run: async () => {
      const wrong = [];
      let count = 0;
      for (const [name, layout] of Object.entries(LAYOUTS)) {
        KEYS.forEach(key => textsFor(key).forEach(text => {
          count++;
          const options = optionsFor(layout, text, 'zimbra');
          const read = zimbraReads(MailtoExport.buildMailtoUrl(options));
          const want = wide(text);
          if (options.subject && read.subject !== want) wrong.push(name + ' objet ' + JSON.stringify(text) + ' → ' + JSON.stringify(read.subject));
          if (options.bodyText && lines(read.body) !== want) wrong.push(name + ' corps ' + JSON.stringify(text) + ' → ' + JSON.stringify(read.body));
          if (!options.subject && read.subject !== '') wrong.push(name + ' objet absent lu ' + JSON.stringify(read.subject));
          if (!options.bodyText && read.body !== '') wrong.push(name + ' corps absent lu ' + JSON.stringify(read.body));
        }));
      }
      const noEntity = !wrong.some(entry => /&amp;|&lt;|&gt;/.test(entry));
      return { pass: wrong.length === 0 && noEntity && count > 1000, notes: JSON.stringify({ count, wrong: wrong.slice(0, 6) }) };
    },
  });

  cases.push({
    id: 'email_zimbra_recipients_are_read_unchanged',
    description: 'E-mail, lien « Zimbra » : les adresses À, Cc et Cci arrivent telles qu\'elles ont été écrites (« + », apostrophe, « % », « = » et les autres signes d\'une adresse compris), seule ou en liste séparée par « , » ou « ; », avec un objet et un corps qui portent « & » ou « ? » ; le « cc= » vide mis en tête ne crée aucun Cc ; sans objet ni corps ni Cc ni Cci, le lien n\'a aucun paramètre',
    run: async () => {
      const locals = Array.from('!#$%&\'*+-/=?^_`{|}~.').map(sign => 'a' + sign + 'b');
      const wrong = [];
      for (const field of ['to', 'cc', 'bcc']) {
        // « & » et « ? » dans l'adresse À : voir les limites connues (cas suivant) ; en Cc et en Cci ils passent.
        locals.filter(local => field !== 'to' || !/[&?]/.test(local)).forEach(local => {
          const address = local + '@x.fr';
          const options = { to: field === 'to' ? address : 'z@y.fr', cc: field === 'cc' ? address : '', bcc: field === 'bcc' ? address : '', subject: 'Tom & Jerry ? <x> + 1', bodyText: 'R&D ? <x> + 1', client: 'zimbra' };
          const read = zimbraReads(MailtoExport.buildMailtoUrl(options));
          if (read[field] !== address) wrong.push(field + ' ' + address + ' → ' + read[field]);
          if (read.subject !== wide(options.subject) || read.body !== wide(options.bodyText)) wrong.push(field + ' ' + address + ' objet ou corps : ' + JSON.stringify([read.subject, read.body]));
        });
      }
      const list = zimbraReads(MailtoExport.buildMailtoUrl({ to: 'a@b.fr; c@d.fr, e@f.fr', cc: 'g+h@i.fr;j@k.fr', bcc: 'l@m.fr', subject: 'S', bodyText: 'B', client: 'zimbra' }));
      const noCc = zimbraReads(MailtoExport.buildMailtoUrl({ to: 'a@b.fr', subject: 'S', bodyText: 'B', client: 'zimbra' }));
      const bare = MailtoExport.buildMailtoUrl({ to: 'a@b.fr', client: 'zimbra' });
      const checks = {
        list: list.to === 'a@b.fr,c@d.fr,e@f.fr' && list.cc === 'g+h@i.fr,j@k.fr' && list.bcc === 'l@m.fr',
        noCc: noCc.cc === '' && noCc.bcc === '' && noCc.to === 'a@b.fr',
        bare: bare === 'mailto:a%40b.fr',
        leadFirst: /^mailto:a%40b\.fr\?cc=&subject=S&body=B$/.test(MailtoExport.buildMailtoUrl({ to: 'a@b.fr', subject: 'S', bodyText: 'B', client: 'zimbra' })),
        leadBeforeCc: /\?cc=&cc=c%40d\.fr&subject=/.test(MailtoExport.buildMailtoUrl({ to: 'a@b.fr', cc: 'c@d.fr', subject: 'S', client: 'zimbra' })),
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: wrong.length === 0 && failed.length === 0, notes: JSON.stringify({ wrong: wrong.slice(0, 5), failed, list, noCc, bare }) };
    },
  });

  cases.push({
    id: 'email_zimbra_realistic_message_keeps_its_lines',
    description: 'E-mail, lien « Zimbra » : un objet et un corps de vrai message (« R&D : bilan ? (v2) <urgent> +33… », une citation « > », un total « = 10 % », des lignes vides) arrivent dans Zimbra ligne pour ligne, avec les quatre signes en forme large et aucune entité HTML',
    run: async () => {
      const subject = 'R&D : bilan ? (v2) <urgent> +33 6 12 34 56 78';
      const body = 'Bonjour,\n\n> Citation & suite <ok>\n+33 6 12 34 56 78 ?\nTotal = 10 % # a_b\n\n« Merci » - Éloïse';
      const read = zimbraReads(MailtoExport.buildMailtoUrl({ to: 'a@b.fr', subject, bodyText: body, client: 'zimbra' }));
      const wantSubject = 'R＆D : bilan ? (v2) ＜urgent＞ ＋33 6 12 34 56 78';
      const wantBody = 'Bonjour,\n\n＞ Citation ＆ suite ＜ok＞\n＋33 6 12 34 56 78 ?\nTotal = 10 % # a_b\n\n« Merci » - Éloïse';
      const entities = /&amp;|&lt;|&gt;/.test(read.subject + read.body);
      return { pass: read.subject === wantSubject && lines(read.body) === wantBody && !entities, notes: JSON.stringify({ subject: read.subject, body: read.body }) };
    },
  });

  cases.push({
    id: 'email_zimbra_known_limits_stay_known',
    description: 'E-mail, lien « Zimbra » : les limites du choix sont figées - une adresse web avec « & » et une adresse email avec « + » dans le corps y sont écrites en forme large (elles ne l\'étaient pas mieux avant : « &amp; », espace), un numéro « +33 » aussi ; chaque signe large coûte 9 caractères de lien au lieu de 3 ; les formes larges sont bien U+FF06, U+FF1C, U+FF1E et U+FF0B',
    run: async () => {
      const read = text => lines(zimbraReads(MailtoExport.buildMailtoUrl({ to: 'a@b.fr', subject: 'S', bodyText: text, client: 'zimbra' })).body);
      const readBefore = text => lines(zimbraReads(MailtoExport.buildMailtoUrl({ to: 'a@b.fr', subject: 'S', bodyText: text })).body);
      const got = {
        webAddress: read('https://exemple.fr/?a=1&b=2'),
        plusAddress: read('jean+test@exemple.fr'),
        phone: read('+33 6 12 34 56 78'),
        webAddressBefore: readBefore('https://exemple.fr/?a=1&b=2'),
        plusAddressBefore: readBefore('jean+test@exemple.fr'),
      };
      const want = {
        webAddress: 'https://exemple.fr/?a=1＆b=2', plusAddress: 'jean＋test@exemple.fr', phone: '＋33 6 12 34 56 78',
        webAddressBefore: 'https://exemple.fr/?a=1&amp;b=2', plusAddressBefore: 'jean test@exemple.fr',
      };
      const codes = Object.values(WIDE).map(sign => sign.codePointAt(0).toString(16).toUpperCase()).join(' ');
      // Une adresse email dont la partie avant « @ » porte « & » ou « ? », écrite dans le champ À (rarissime) : Zimbra l'encode ou la coupe, aucun lien ne change cela.
      const toRead = address => zimbraReads(MailtoExport.buildMailtoUrl({ to: address, subject: 'S', client: 'zimbra' })).to;
      got.toWithAmpersand = toRead('a&b@x.fr');
      got.toWithQuestionMark = toRead('a?b@x.fr');
      want.toWithAmpersand = 'a&amp;b@x.fr';
      want.toWithQuestionMark = 'a';
      const length = (client, text) => MailtoExport.buildMailtoUrl({ to: 'a@b.fr', bodyText: text, client }).length;
      const cost = { ampersand: length('zimbra', 'a&b') - length('standard', 'a&b'), plus: length('zimbra', 'a+b') - length('standard', 'a+b'), lead: length('zimbra', 'ab') - length('standard', 'ab') };
      return {
        pass: JSON.stringify(got) === JSON.stringify(want) && codes === 'FF06 FF1C FF1E FF0B' && cost.ampersand === cost.lead + 6 && cost.plus === cost.lead + 6 && cost.lead === 'cc=&'.length,
        notes: JSON.stringify({ got, want, codes, cost }),
      };
    },
  });

  cases.push({
    id: 'email_mail_client_setting_is_personal_and_safe',
    description: 'E-mail, réglage de la messagerie : `standard` tant que rien n\'est choisi, gardé dans le navigateur sous `pp_mail_client`, une valeur inconnue (ou une clé abîmée) vaut `standard`, un stockage refusé garde le choix jusqu\'au rechargement, chaque changement prévient la page (`pp:mailClientChanged`)',
    run: async () => {
      const KEY = 'pp_mail_client';
      const saved = localStorage.getItem(KEY);
      const heard = [];
      const listen = () => heard.push(MailtoExport.getMailClient());
      document.addEventListener('pp:mailClientChanged', listen);
      const checks = {};
      try {
        MailtoExport.setMailClient('standard'); // oublie un choix gardé en mémoire par un cas précédent
        localStorage.removeItem(KEY);
        checks.byDefault = MailtoExport.getMailClient() === 'standard';
        MailtoExport.setMailClient('zimbra');
        checks.stored = localStorage.getItem(KEY) === 'zimbra' && MailtoExport.getMailClient() === 'zimbra';
        MailtoExport.setMailClient('une autre messagerie');
        checks.unknownIsStandard = localStorage.getItem(KEY) === 'standard' && MailtoExport.getMailClient() === 'standard';
        localStorage.setItem(KEY, 'n\'importe quoi');
        checks.damagedKeyIsStandard = MailtoExport.getMailClient() === 'standard';
        // Un navigateur qui refuse son stockage : le choix tient jusqu'au rechargement.
        const realGet = Storage.prototype.getItem;
        const realSet = Storage.prototype.setItem;
        Storage.prototype.getItem = function () { throw new Error('refusé'); };
        Storage.prototype.setItem = function () { throw new Error('refusé'); };
        try {
          MailtoExport.setMailClient('zimbra');
          checks.refusedStorageKeepsTheChoice = MailtoExport.getMailClient() === 'zimbra';
          MailtoExport.setMailClient('standard');
          checks.refusedStorageKeepsTheChoiceBack = MailtoExport.getMailClient() === 'standard';
        } finally {
          Storage.prototype.getItem = realGet;
          Storage.prototype.setItem = realSet;
        }
        checks.heardEveryChange = JSON.stringify(heard) === JSON.stringify(['standard', 'zimbra', 'standard', 'zimbra', 'standard']);
      } finally {
        document.removeEventListener('pp:mailClientChanged', listen);
        MailtoExport.setMailClient('standard');
        if (saved === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, saved);
      }
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, heard }) };
    },
  });

  // Les textes de l'onglet sont écrits dans la langue de la page : le cas se joue en français, puis dans une seconde page qui démarre en anglais (la copie `lang: 'en'`).
  const mailClientTabCase = {
    id: 'email_settings_tab_email_chooses_the_client',
    description: 'Réglages, onglet « Email » : un onglet de plus, « Standard » coché par défaut, « Zimbra » le choisit à l\'instant (et le garde), la fenêtre rouverte montre le choix en vigueur, les textes sont dans la langue de la page',
    run: async () => {
      const el = id => document.getElementById(id);
      const KEY = 'pp_mail_client';
      const saved = localStorage.getItem(KEY);
      const open = () => { if (el('settings-modal').style.display !== 'flex') el('v2-btn-settings').click(); };
      const close = () => { if (el('settings-modal').style.display === 'flex') el('settings-close').click(); };
      const radio = value => document.querySelector(`input[name="settings-mail-client"][value="${value}"]`);
      const tab = () => document.querySelector('#settings-modal .settings-tab[data-settings-tab="mailClient"]');
      const panel = () => document.querySelector('#settings-modal .settings-panel[data-settings-panel="mailClient"]');
      const checks = {};
      try {
        localStorage.removeItem(KEY);
        MailtoExport.setMailClient('standard');
        localStorage.removeItem(KEY);
        open();
        await sleep(100);
        checks.tabExists = !!tab() && tab().textContent.trim() === 'Email';
        tab().click();
        await sleep(60);
        checks.panelShown = !panel().hidden && Array.from(document.querySelectorAll('#settings-modal .settings-panel')).filter(p => !p.hidden).length === 1;
        checks.standardByDefault = radio('standard').checked && !radio('zimbra').checked;
        radio('zimbra').click();
        await sleep(40);
        checks.zimbraChosen = MailtoExport.getMailClient() === 'zimbra' && localStorage.getItem(KEY) === 'zimbra';
        close();
        MailtoExport.setMailClient('standard');
        open();
        checks.reopenedFollowsTheChoice = radio('standard').checked && !radio('zimbra').checked;
        radio('zimbra').click();
        close();
        open();
        checks.reopenedKeepsZimbra = radio('zimbra').checked && !radio('standard').checked;
        const note = panel().querySelector('[data-i18n="settings.mailClient.zimbraNote"]').textContent;
        checks.textsInThePageLanguage = I18n.getLang() === 'en'
          ? /Zimbra misreads/.test(note) && /&amp;/.test(note) && tab().textContent.trim() === 'Email' && /Mail program|mail program/.test(panel().querySelector('[data-i18n="settings.mailClient.intro"]').textContent)
          : /Zimbra lit mal/.test(note) && /&amp;/.test(note) && /＆ ＜ ＞ ＋/.test(note) && tab().textContent.trim() === 'Email';
      } finally {
        close();
        MailtoExport.setMailClient('standard');
        if (saved === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, saved);
        document.querySelector('#settings-modal .settings-tab[data-settings-tab="language"]').click();
      }
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: JSON.stringify({ lang: I18n.getLang(), failed, checks }) };
    },
  };
  cases.push(mailClientTabCase);
  cases.push(Object.assign({}, mailClientTabCase, {
    id: 'email_settings_tab_email_chooses_the_client_in_english',
    lang: 'en',
    description: 'Page qui démarre en anglais : l\'onglet « Email » de Réglages écrit sa présentation et la note sur Zimbra en anglais ; le choix du programme de messagerie marche comme en français',
  }));

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.emailZimbra = cases;
})();
