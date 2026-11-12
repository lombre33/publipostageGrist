// Suite "emlExport" - l'export « Email (.eml) » du mode Email (js/eml-export.js ; demande d'Antoine du 12/11 : « que l'export mail fasse un (ou plusieurs selon le choix) .eml pour avoir PJ et mise en forme », puis
// « avec mise en page et PJ (champ PJ à rajouter après le Cci, il accepte les variables des colonnes Pièces jointes de Grist seulement) »). Le lien mailto: ne porte que du texte brut (js/mailto-export.js) ; le .eml
// porte la mise en forme du modèle (HTML), le texte brut en parallèle et les pièces jointes. ATTENTION - ce que cette suite ne prouve pas : AUCUN vrai client de messagerie n'a ouvert ces fichiers (Thunderbird, Outlook,
// Zimbra...), la lecture est celle d'un petit analyseur MIME écrit ici ; le fichier d'essai à ouvrir dans un vrai client est dans /mnt/project-files/eml-essai-2026-11-12/. Ce que la suite garde :
//  1) le message : ASCII pur, CRLF partout, `X-Unsent: 1`, un Message-ID valable, pas de From, l'objet et le corps non ASCII encodés (mots encodés, quoted-printable) et relus tels quels ;
//  2) la sûreté : une valeur de cellule (objet, À, Cc, nom d'une pièce jointe) ne peut ni ajouter un en-tête ni en changer un, les adresses qui n'en sont pas sont laissées de côté et rendues, une adresse « "Dupont, Jean" <j@d.fr> »
//     garde sa virgule ;
//  3) les pièces jointes : le fichier revient octet pour octet, son nom (accents compris) et son type, une colonne Référence ne donne jamais un fichier, un fichier illisible fait échouer la ligne avec son nom ;
//  4) le HTML : la feuille de style écrite dans chaque balise, les variables CSS laissées de côté, une image du document appelée par son Content-ID ;
//  5) le champ PJ : sa liste « # » ne propose que les colonnes Pièces jointes, le texte tapé à côté des bulles n'est pas gardé ;
//  6) le menu : le type « Email (.eml) » n'est offert qu'à un modèle email, l'éditeur n'écrit plus le texte brut du lien tant qu'il est choisi, et rien d'autre ne change ;
//  7) les VRAIS exports par le bouton Exporter : un fichier .eml pour une ligne, une archive ZIP d'un .eml par ligne.
(function () {
  const cases = [];
  const TABLE = 'EmlClients';
  const CRLF = '\r\n';
  const stub = () => window.__gristStub;
  const el = id => document.getElementById(id);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const verdict = (problems, summary) => ({ pass: problems.length === 0, notes: JSON.stringify({ summary, problems }) });
  function check(problems, label, got, want) { if (!same(got, want)) problems.push(label + ' : ' + JSON.stringify(got) + ' au lieu de ' + JSON.stringify(want)); }
  const badge = (column, table) => `<span class="var-badge" data-table="${table || TABLE}" data-column="${column}" data-key="${table || TABLE}.${column}"></span>`;

  // --- Un petit analyseur MIME, pour relire ce que le module écrit sans le croire sur parole ---
  const textOfBytes = bytes => new TextDecoder().decode(bytes);
  const bytesOfText = text => new TextEncoder().encode(text);
  function decodeWords(value) {
    const joined = value.replace(/(=\?UTF-8\?B\?[^?]*\?=)\s+(?==\?UTF-8\?B\?)/g, '$1');
    return joined.replace(/=\?UTF-8\?B\?([^?]*)\?=/g, (_, data) => textOfBytes(Uint8Array.from(atob(data), c => c.charCodeAt(0))));
  }
  function decodeQuotedPrintable(body) {
    const bytes = [];
    const source = body.replace(/=\r\n/g, '');
    for (let i = 0; i < source.length; i++) {
      if (source[i] === '=' && /^[0-9A-F]{2}$/.test(source.slice(i + 1, i + 3))) { bytes.push(parseInt(source.slice(i + 1, i + 3), 16)); i += 2; } else bytes.push(source.charCodeAt(i));
    }
    return textOfBytes(Uint8Array.from(bytes));
  }
  const decodeBase64 = body => Uint8Array.from(atob(body.replace(/\s+/g, '')), c => c.charCodeAt(0));
  // Une entité MIME : ses en-têtes (dépliés, noms en minuscules), son corps, et ses parties quand c'est un multipart.
  function parseEntity(raw) {
    const cut = raw.indexOf(CRLF + CRLF);
    const head = cut === -1 ? raw : raw.slice(0, cut);
    const body = cut === -1 ? '' : raw.slice(cut + 4);
    const headers = {};
    const order = [];
    head.replace(/\r\n[ \t]+/g, ' ').split(CRLF).forEach(line => {
      const colon = line.indexOf(':');
      if (colon === -1) return;
      const name = line.slice(0, colon).toLowerCase();
      headers[name] = line.slice(colon + 1).trim();
      order.push(name);
    });
    const boundary = /boundary="([^"]+)"/.exec(headers['content-type'] || '');
    let parts = null;
    if (boundary) parts = body.split('--' + boundary[1]).slice(1, -1).map(piece => parseEntity(piece.replace(/^\r\n/, '').replace(/\r\n$/, '')));
    return { headers, order, body, parts };
  }
  const flatten = entity => (entity.parts ? entity.parts.flatMap(flatten) : [entity]);
  const nameOf = entity => {
    const disposition = (entity.headers['content-disposition'] || '') + ' ' + (entity.headers['content-type'] || '');
    const found = /(?:filename|name)="([^"]*)"/.exec(disposition);
    return found ? decodeWords(found[1]) : '';
  };
  const attachmentsOf = message => flatten(message).filter(part => /^attachment/i.test(part.headers['content-disposition'] || ''));
  const htmlOf = message => { const part = flatten(message).find(p => /^text\/html/i.test(p.headers['content-type'] || '')); return part ? decodeQuotedPrintable(part.body) : ''; };
  const plainOf = message => { const part = flatten(message).find(p => /^text\/plain/i.test(p.headers['content-type'] || '')); return part ? decodeQuotedPrintable(part.body) : ''; };
  const readBlob = async blob => parseEntity(await blob.text());
  const bytesFrom = (length, seed) => Uint8Array.from({ length }, (_, i) => (i * 7 + seed) % 256);

  // --- 1) le message ---
  cases.push({
    id: 'eml_message_is_ascii_crlf_unsent_with_a_valid_message_id_and_no_from',
    description: 'Le .eml est de l\'ASCII pur avec CRLF partout, porte X-Unsent: 1, MIME-Version, une date, un Message-ID valable (@publipostage.invalid) et jamais de From ; l\'objet et le corps accentués sont encodés et se relisent tels quels',
    run: async () => {
      const problems = [];
      const subject = 'Réunion de l’été – 50 € à prévoir';
      const body = 'Bonjour Élodie,\nVoici le détail : a=b, ligne très longue ' + 'é'.repeat(120) + ' fin.';
      const built = EmlExport.build({ to: 'a@example.org', subject, text: body, html: '<p>' + body.replace(/\n/g, '<br>') + '</p>' });
      check(problems, 'ASCII pur', /^[\x00-\x7F]*$/.test(built.text), true);
      check(problems, 'aucun LF seul', /(^|[^\r])\n/.test(built.text), false);
      check(problems, 'aucun CR seul', /\r(?!\n)/.test(built.text), false);
      const message = parseEntity(built.text);
      check(problems, 'X-Unsent', message.headers['x-unsent'], '1');
      check(problems, 'MIME-Version', message.headers['mime-version'], '1.0');
      check(problems, 'pas de From', 'from' in message.headers, false);
      check(problems, 'Message-ID valable', /^<[0-9a-z.]+@publipostage\.invalid>$/.test(message.headers['message-id'] || ''), true);
      check(problems, 'Date', /^[A-Z][a-z]{2}, \d{1,2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} \+0000$/.test(message.headers.date || ''), true);
      check(problems, 'objet relu', decodeWords(message.headers.subject || ''), subject);
      check(problems, 'objet encodé', /=\?UTF-8\?B\?/.test(message.headers.subject || ''), true);
      check(problems, 'texte relu', plainOf(message).replace(/\r\n/g, '\n'), body);
      check(problems, 'html relu', htmlOf(message), '<p>' + body.replace(/\n/g, '<br>') + '</p>');
      const lines = built.text.split(CRLF);
      check(problems, 'lignes de 998 caractères au plus', lines.every(line => line.length <= 998), true);
      check(problems, 'lignes des corps de 76 caractères au plus', lines.filter(line => !/^[A-Za-z-]+:/.test(line)).every(line => line.length <= 76), true);
      return verdict(problems, { first: lines.slice(0, 9) });
    },
  });

  // --- 2) la sûreté ---
  cases.push({
    id: 'eml_cell_values_cannot_add_or_change_a_header',
    description: 'Une valeur de cellule avec des sauts de ligne (objet, À, Cc, Cci) n\'ajoute aucun en-tête (ni Bcc, ni X-Evil, ni un second Subject) : l\'objet tient sur une ligne, les morceaux qui ne sont pas des adresses sont rendus et jamais écrits',
    run: async () => {
      const problems = [];
      const built = EmlExport.build({
        to: 'a@example.org\r\nBcc: evil@example.org', cc: 'c@example.org\nSubject: autre', bcc: 'd@example.org',
        subject: 'Bonjour\r\nBcc: evil@example.org\r\nX-Evil: 1', text: 'x', html: '<p>x</p>',
      });
      const message = parseEntity(built.text);
      const allowed = ['mime-version', 'date', 'message-id', 'x-unsent', 'to', 'cc', 'bcc', 'subject', 'content-type'];
      check(problems, 'en-têtes', message.order.filter(name => allowed.indexOf(name) === -1), []);
      check(problems, 'un seul Bcc', message.order.filter(name => name === 'bcc').length, 1);
      check(problems, 'Bcc', message.headers.bcc, 'd@example.org');
      check(problems, 'un seul Subject', message.order.filter(name => name === 'subject').length, 1);
      check(problems, 'objet sans saut de ligne', /[\r\n]/.test(decodeWords(message.headers.subject || '')), false);
      check(problems, 'À', message.headers.to, 'a@example.org');
      check(problems, 'Cc', message.headers.cc, 'c@example.org');
      check(problems, 'morceaux laissés de côté', built.skipped.slice().sort(), ['Bcc: evil@example.org', 'Subject: autre']);
      check(problems, 'aucune ligne n\'est un en-tête de l\'attaquant', built.text.split(CRLF).some(line => /^(X-Evil|Bcc: evil)/.test(line)), false);
      return verdict(problems, { headers: message.order });
    },
  });

  cases.push({
    id: 'eml_addresses_split_on_comma_semicolon_and_newline_and_keep_quoted_commas',
    description: 'Les adresses se coupent à la virgule, au point-virgule et au saut de ligne ; « "Dupont, Jean" <j@d.fr> » garde sa virgule ; un nom accentué est encodé ; une adresse sans arobase est rendue à part',
    run: async () => {
      const problems = [];
      const parsed = EmlExport.parseAddresses('a@example.org; "Dupont, Jean" <j@d.fr>,\nÉlodie <e@example.org>, pas une adresse, mailto:z@example.org');
      check(problems, 'adresses', parsed.map(a => a.email), ['a@example.org', 'j@d.fr', 'e@example.org', 'pas une adresse', 'z@example.org']);
      check(problems, 'valables', parsed.map(a => a.valid), [true, true, true, false, true]);
      check(problems, 'nom', parsed[1].name, 'Dupont, Jean');
      const skipped = [];
      const header = EmlExport.addressHeader('To', '"Dupont, Jean" <j@d.fr>, Élodie <e@example.org>, rien', skipped);
      check(problems, 'la virgule du nom reste dans l\'en-tête', header.replace(/\r\n[ \t]+/g, ' ').indexOf('"Dupont, Jean" <j@d.fr>') !== -1, true);
      check(problems, 'nom accentué encodé', /=\?UTF-8\?B\?/.test(header) && /^[\x00-\x7F]*$/.test(header), true);
      check(problems, 'laissée de côté', skipped, ['rien']);
      return verdict(problems, { header });
    },
  });

  // --- 3) et 4) le HTML, les images et les pièces jointes ---
  cases.push({
    id: 'eml_attachments_round_trip_with_name_and_type_and_never_inject_a_path',
    description: 'Une pièce jointe revient octet pour octet (base64), avec son nom accentué (mots encodés repliés) et son type ; un nom avec des signes de chemin est nettoyé ; un type MIME mal formé devient application/octet-stream',
    run: async () => {
      const problems = [];
      const big = bytesFrom(5000, 3);
      const small = bytesFrom(10, 9);
      const built = EmlExport.build({
        to: 'a@example.org', subject: 's', text: 't', html: '<p>h</p>',
        attachments: [
          { name: EmlExport.safeFileName('Facture été n° 2026 – très longue.pdf', 'x'), type: 'application/pdf', bytes: big },
          { name: EmlExport.safeFileName('../../etc/passwd\r\nX-Evil: 1', 'x'), type: 'text/plain\r\nX-Evil: 1', bytes: small },
        ],
      });
      check(problems, 'ASCII pur', /^[\x00-\x7F]*$/.test(built.text), true);
      const message = parseEntity(built.text);
      const files = attachmentsOf(message);
      check(problems, 'deux pièces jointes', files.length, 2);
      check(problems, 'nom accentué', nameOf(files[0]), 'Facture été n° 2026 – très longue.pdf');
      check(problems, 'type', (files[0].headers['content-type'] || '').split(';')[0], 'application/pdf');
      check(problems, 'octets', Array.from(decodeBase64(files[0].body)), Array.from(big));
      check(problems, 'nom nettoyé', /[\\/:\r\n]/.test(nameOf(files[1])), false);
      check(problems, 'type mal formé', (files[1].headers['content-type'] || '').split(';')[0], 'application/octet-stream');
      check(problems, 'octets du second', Array.from(decodeBase64(files[1].body)), Array.from(small));
      check(problems, 'pas d\'en-tête injecté', built.text.split(CRLF).some(line => /^X-Evil/.test(line)), false);
      return verdict(problems, { names: files.map(nameOf) });
    },
  });

  cases.push({
    id: 'eml_html_takes_the_style_sheet_into_each_tag_and_drops_css_variables',
    description: 'La feuille de style du HTML est écrite dans chaque balise (la règle la plus précise l\'emporte, l\'attribut style de la balise garde la main), les déclarations à variable CSS sont laissées de côté (Outlook classique ne les lit pas)',
    run: async () => {
      const problems = [];
      const root = new DOMParser().parseFromString('<div class="pp-doc"><p class="a" id="b" style="margin: 0">Un</p><p>Deux</p></div>', 'text/html').body.firstElementChild;
      EmlExport.inlineStyles(root, '.pp-doc p { color: red; font-size: 12px; } .pp-doc p.a { color: blue; } #b { font-weight: 700; background: var(--x); --y: 1; }');
      const [first, second] = root.querySelectorAll('p');
      const css = node => Object.fromEntries(node.getAttribute('style').split(';').map(s => s.trim()).filter(Boolean).map(s => s.split(/:\s*/)).map(([k, v]) => [k.trim(), v]));
      const one = css(first);
      const two = css(second);
      check(problems, 'la règle précise l\'emporte', one.color, 'blue');
      check(problems, 'l\'identifiant', one['font-weight'], '700');
      check(problems, 'la balise garde son style', one.margin, '0');
      check(problems, 'taille', one['font-size'], '12px');
      check(problems, 'sans variable', /var\(|--/.test(first.getAttribute('style') + second.getAttribute('style')), false);
      check(problems, 'la seconde balise', two.color, 'red');
      check(problems, 'aucun identifiant ne gêne', 'background' in one, false);
      return verdict(problems, { one, two });
    },
  });

  cases.push({
    id: 'eml_document_images_become_inline_parts_called_by_content_id',
    description: 'Une image du document (data URI) devient une image du message appelée par son Content-ID (cid:), et le HTML ne garde aucune data URI : les messageries n\'affichent pas les data URI',
    run: async (h) => {
      const problems = [];
      await ExportEngines.ensure(['html']);
      const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
      const fragment = await HtmlExport.htmlToDocument('<p>Logo <img src="data:image/png;base64,' + png + '" style="width:40px" alt="Logo"></p>', null, { fragment: true });
      const { html, inline } = EmlExport.emailHtml(fragment, { title: 'T', lang: 'fr' });
      check(problems, 'une image du message', inline.length, 1);
      check(problems, 'cid', /^[A-Za-z0-9.@_-]+$/.test(inline[0].cid), true);
      check(problems, 'type', inline[0].type, 'image/png');
      check(problems, 'le HTML appelle le cid', html.indexOf('src="cid:' + inline[0].cid + '"') !== -1, true);
      check(problems, 'plus de data URI', /data:image/.test(html), false);
      const built = EmlExport.build({ to: 'a@example.org', subject: 's', text: 't', html, inline });
      const message = parseEntity(built.text);
      const related = flatten(message).filter(part => /^image\//i.test(part.headers['content-type'] || ''));
      check(problems, 'image dans le message', related.length, 1);
      check(problems, 'Content-ID', related[0] && related[0].headers['content-id'], '<' + inline[0].cid + '>');
      check(problems, 'octets', related[0] ? Array.from(decodeBase64(related[0].body)) : [], Array.from(Uint8Array.from(atob(png), c => c.charCodeAt(0))));
      return verdict(problems, { cid: inline[0].cid });
    },
  });

  // --- Le décor des essais qui lisent Grist ---
  const FILES = new Map();
  let realFetch = null;
  const hits = [];
  function serveFiles() {
    realFetch = window.fetch;
    hits.length = 0;
    window.fetch = async (url, init) => {
      const found = /\/attachments\/(\d+)\/download/.exec(String(url));
      if (!found) return realFetch.call(window, url, init);
      hits.push(Number(found[1]));
      const bytes = FILES.get(Number(found[1]));
      return bytes ? new Response(bytes) : new Response('', { status: 404 });
    };
  }
  function stopServing() { if (realFetch) { window.fetch = realFetch; realFetch = null; } }
  // Deux clients : la ligne 1 a deux pièces jointes (ids `a` et `b`), la ligne 2 une seule (`c`). Une colonne Référence (Lien) donne le numéro de ligne de l'autre client : s'il était pris pour un numéro de pièce jointe, le
  // fichier `a` ou `b` partirait avec la mauvaise ligne.
  async function seed(h, ids) {
    await h.resetEditor();
    I18n.setLang('fr');
    const s = stub();
    s.setAttachments([
      { id: ids.a, fileName: 'Facture été.pdf', fileType: 'application/pdf' }, { id: ids.b, fileName: 'cgv.pdf', fileType: 'application/pdf' },
      { id: ids.c, fileName: 'autre.txt', fileType: 'text/plain' },
    ]);
    s.setVariables(TABLE, { Nom: 'Text', Mail: 'Text', Pj: 'Attachments', Lien: 'Ref:' + TABLE });
    s.setRows(TABLE, [
      { id: 1, Nom: 'Alice', Mail: 'alice@example.org', Pj: ['L', ids.a, ids.b], Lien: 2 },
      { id: 2, Nom: 'Bob', Mail: 'bob@example.org', Pj: ['L', ids.c], Lien: 1 },
    ]);
    await GristAPI.refreshSchema();
    s.fireRecord({ id: 1, Nom: 'Alice', Mail: 'alice@example.org' }, TABLE);
    await sleep(50);
  }
  async function cleanup() {
    stopServing();
    stub().dropTable(TABLE);
    stub().setAttachments([]);
    await GristAPI.refreshSchema();
    I18n.setLang('fr');
  }
  const FIELDS = { objet: 'Facture #' + TABLE + '.Nom', destinataires: '#' + TABLE + '.Mail', cc: '', cci: '', pj: '' };
  const body = '<p>Bonjour ' + badge('Nom') + ',</p><p><strong>Ci-joint</strong> la facture.</p>';

  cases.push({
    id: 'eml_row_resolves_fields_and_attaches_only_the_attachments_columns_cited',
    description: 'Le .eml d\'une ligne résout l\'objet, l\'adresse et le corps pour CETTE ligne et joint les fichiers de la colonne Pièces jointes citée dans le champ PJ, dans l\'ordre du champ ; une colonne Référence citée ne donne aucun fichier, un texte tapé non plus',
    run: async (h) => {
      const problems = [];
      await seed(h, { a: 101, b: 102, c: 103 });
      FILES.set(101, bytesFrom(700, 1)); FILES.set(102, bytesFrom(40, 2)); FILES.set(103, bytesFrom(40, 3));
      serveFiles();
      try {
        await ExportEngines.ensure(['html']);
        const fields = Object.assign({}, FIELDS, { pj: '#' + TABLE + '.Pj #' + TABLE + '.Lien et du texte 1 2' });
        const result = await EmlExport.getEmlBlobForRecord(body, TABLE, { id: 1, Nom: 'Alice', Mail: 'alice@example.org' }, '', null, fields);
        const message = await readBlob(result.blob);
        check(problems, 'objet résolu', decodeWords(message.headers.subject || ''), 'Facture Alice');
        check(problems, 'destinataire résolu', message.headers.to, 'alice@example.org');
        check(problems, 'corps HTML résolu', /Bonjour Alice/.test(htmlOf(message)), true);
        check(problems, 'mise en forme gardée', /<strong[^>]*>Ci-joint<\/strong>/.test(htmlOf(message)), true);
        check(problems, 'texte brut', plainOf(message).indexOf('Bonjour Alice,') !== -1, true);
        const files = attachmentsOf(message);
        check(problems, 'les pièces jointes', files.map(nameOf), ['Facture été.pdf', 'cgv.pdf']);
        check(problems, 'octets de la première', files[0] ? Array.from(decodeBase64(files[0].body)) : [], Array.from(bytesFrom(700, 1)));
        check(problems, 'fichiers téléchargés', hits.slice().sort(), [101, 102]);
        check(problems, 'nom du fichier du résultat', result.filename, 'Facture Alice');
        check(problems, 'aucune adresse laissée de côté', result.skipped, []);
      } finally { await cleanup(); }
      return verdict(problems, {});
    },
  });

  cases.push({
    id: 'eml_row_without_attachments_field_has_no_attachment_and_other_row_has_its_own',
    description: 'Sans champ PJ le message n\'a aucune pièce jointe ; avec la même colonne, la ligne 2 joint SON fichier et pas ceux de la ligne 1',
    run: async (h) => {
      const problems = [];
      await seed(h, { a: 111, b: 112, c: 113 });
      FILES.set(111, bytesFrom(30, 1)); FILES.set(112, bytesFrom(30, 2)); FILES.set(113, bytesFrom(30, 3));
      serveFiles();
      try {
        await ExportEngines.ensure(['html']);
        const none = await readBlob((await EmlExport.getEmlBlobForRecord(body, TABLE, { id: 1, Nom: 'Alice', Mail: 'alice@example.org' }, '', null, FIELDS)).blob);
        check(problems, 'sans PJ', attachmentsOf(none).length, 0);
        const fields = Object.assign({}, FIELDS, { pj: '#' + TABLE + '.Pj' });
        const second = await readBlob((await EmlExport.getEmlBlobForRecord(body, TABLE, { id: 2, Nom: 'Bob', Mail: 'bob@example.org' }, '', null, fields)).blob);
        check(problems, 'ligne 2', attachmentsOf(second).map(nameOf), ['autre.txt']);
        check(problems, 'destinataire de la ligne 2', second.headers.to, 'bob@example.org');
        check(problems, 'seul son fichier est lu', hits.slice(), [113]);
      } finally { await cleanup(); }
      return verdict(problems, {});
    },
  });

  cases.push({
    id: 'eml_unreadable_attachment_fails_the_row_and_names_the_file',
    description: 'Une pièce jointe que Grist ne rend pas (HTTP 404) fait échouer la ligne avec une phrase qui donne le nom du fichier : jamais un email sans la pièce attendue',
    run: async (h) => {
      const problems = [];
      await seed(h, { a: 121, b: 122, c: 123 });
      FILES.set(121, bytesFrom(30, 1));   // 122 n'est pas servi : 404
      serveFiles();
      let error = null;
      try {
        await ExportEngines.ensure(['html']);
        const fields = Object.assign({}, FIELDS, { pj: '#' + TABLE + '.Pj' });
        try { await EmlExport.getEmlBlobForRecord(body, TABLE, { id: 1, Nom: 'Alice', Mail: 'alice@example.org' }, '', null, fields); } catch (e) { error = e; }
      } finally { await cleanup(); }
      check(problems, 'la ligne échoue', !!error, true);
      check(problems, 'erreur reconnue', !!(error && error.attachmentProblem), true);
      check(problems, 'la phrase donne le nom', !!(error && /cgv\.pdf/.test(error.message)), true);
      check(problems, 'en français', !!(error && /illisible/.test(error.message)), true);
      return verdict(problems, { message: error && error.message });
    },
  });

  // --- 5) le champ PJ ---
  const newEmail = async h => { h.openFlyout('#v2-new-template-group'); await h.clickButton('v2-btn-new-email'); await sleep(300); };
  const newDocument = async h => { h.openFlyout('#v2-new-template-group'); await h.clickButton('v2-btn-new-document'); await sleep(300); };
  const acBox = () => document.getElementById('autocomplete-box');
  const listed = () => (acBox() && acBox().style.display !== 'none' ? Array.from(acBox().querySelectorAll('.ac-item')).map(e => e.textContent) : null);

  cases.push({
    id: 'eml_pj_field_list_offers_only_attachments_columns',
    description: 'La liste « # » du champ PJ ne propose que les colonnes de type Pièces jointes (ni Texte, ni Référence), alors que celle de l\'Objet les propose toutes ; le champ est après le Cci et se replie par « + PJ »',
    run: async (h) => {
      const problems = [];
      await seed(h, { a: 131, b: 132, c: 133 });
      try {
        await newEmail(h);
        const pj = el('v2-email-pj');
        const cci = el('v2-email-cci');
        check(problems, 'le champ suit la Cci', !!(cci.compareDocumentPosition(pj) & Node.DOCUMENT_POSITION_FOLLOWING), true);
        check(problems, 'le bouton « + PJ » suit la Cci', !!(cci.compareDocumentPosition(el('v2-btn-toggle-pj')) & Node.DOCUMENT_POSITION_FOLLOWING), true);
        check(problems, 'replié au départ', pj.hidden, true);
        el('v2-btn-toggle-pj').click();
        check(problems, 'le bouton le montre', pj.hidden, false);
        await h.fieldType('v2-email-pj', '#');
        const mine = (listed() || []).filter(row => row.indexOf(TABLE + '.') === 0);
        check(problems, 'colonnes proposées au champ PJ', mine, [TABLE + '.Pj']);
        await h.fieldType('v2-email-subject', '#');
        const all = (listed() || []).filter(row => row.indexOf(TABLE + '.') === 0).sort();
        check(problems, 'colonnes proposées à l\'Objet', all, [TABLE + '.Lien', TABLE + '.Mail', TABLE + '.Nom', TABLE + '.Pj']);
        el('v2-btn-toggle-pj').click();
        check(problems, 'le bouton le replie', pj.hidden, true);
      } finally {
        ['v2-email-pj', 'v2-email-subject'].forEach(id => { el(id).value = ''; });
        await newDocument(h);
        await cleanup();
      }
      return verdict(problems, {});
    },
  });

  cases.push({
    id: 'eml_pj_field_keeps_the_bubbles_and_drops_the_text_typed_beside_them',
    description: 'Au départ du curseur, le champ PJ ne garde que ses bulles de variables : le texte tapé à côté disparaît, ce qui est lu à l\'export étant seulement les bulles ; l\'Objet, lui, garde son texte',
    run: async (h) => {
      const problems = [];
      await seed(h, { a: 141, b: 142, c: 143 });
      try {
        await newEmail(h);
        const pj = el('v2-email-pj');
        pj.hidden = false;
        pj.value = 'du texte #' + TABLE + '.Pj et encore';
        el('v2-email-subject').value = 'Objet #' + TABLE + '.Nom fin';
        FieldEditor.of(pj).commands.focus();
        await sleep(40);
        FieldEditor.of(pj).commands.blur();
        FieldEditor.of(el('v2-email-subject')).commands.focus();
        await sleep(80);
        FieldEditor.of(el('v2-email-subject')).commands.blur();
        await sleep(80);
        const items = FieldCodec.itemsOf(pj.value);
        check(problems, 'seules les bulles restent', items.map(item => (item.badge ? item.badge.key : 'texte')), [TABLE + '.Pj']);
        check(problems, 'l\'Objet garde son texte', FieldCodec.itemsOf(el('v2-email-subject').value).map(item => (item.badge ? item.badge.key : item.text)), ['Objet ', TABLE + '.Nom', ' fin']);
      } finally {
        ['v2-email-pj', 'v2-email-subject'].forEach(id => { el(id).value = ''; });
        await newDocument(h);
        await cleanup();
      }
      return verdict(problems, {});
    },
  });

  // --- 6) le menu et l'éditeur ---
  cases.push({
    id: 'eml_export_type_is_for_an_email_and_ungreys_the_editor_only_while_chosen',
    description: 'Le type « Email (.eml) » du menu Type d\'export n\'est offert qu\'à un modèle email (grisé, avec sa raison, dans un document) ; tant qu\'il est choisi, l\'éditeur de l\'email n\'écrit plus le texte brut du lien (gras dégrisé) mais garde grisés le sommaire, le saut de page, la vidéo et la diapositive ; en revenant au PDF, tout redevient du texte brut',
    run: async (h) => {
      const problems = [];
      const row = type => document.querySelector('#v2-quality-flyout .v2-hover-row[data-export-type="' + type + '"]');
      const locked = id => el(id).classList.contains('v2-hf-locked');
      const state = () => ({ plain: EmailPlainText.isActive(), bodyClass: document.body.classList.contains('pp-email-model'), bold: locked('v2-btn-bold'), table: locked('v2-btn-table'), toc: locked('v2-btn-toc'), pageBreak: locked('v2-btn-page-break'), video: locked('v2-btn-video'), slideText: locked('v2-btn-slide-text') });
      try {
        check(problems, 'document : la ligne est grisée', row('eml').classList.contains('v2-hover-row-disabled'), true);
        row('eml').click();
        await sleep(60);
        check(problems, 'document : un clic ne choisit rien', el('v2-export-type').value, 'pdf');
        await newEmail(h);
        check(problems, 'email : la ligne est offerte', row('eml').classList.contains('v2-hover-row-disabled'), false);
        check(problems, 'email au PDF : texte brut', state(), { plain: true, bodyClass: true, bold: true, table: true, toc: true, pageBreak: true, video: true, slideText: true });
        row('eml').click();
        await sleep(120);
        check(problems, 'email en .eml : le type est choisi', el('v2-export-type').value, 'eml');
        check(problems, 'email en .eml : mise en forme permise', state(), { plain: false, bodyClass: false, bold: false, table: false, toc: true, pageBreak: true, video: true, slideText: true });
        row('pdf').click();
        await sleep(120);
        check(problems, 'retour au PDF : texte brut', state(), { plain: true, bodyClass: true, bold: true, table: true, toc: true, pageBreak: true, video: true, slideText: true });
        row('eml').click();
        await sleep(120);
        await newDocument(h);
        check(problems, 'un document ne garde pas le type', el('v2-export-type').value, 'pdf');
        check(problems, 'un document : rien n\'est grisé par l\'email', state(), { plain: false, bodyClass: false, bold: false, table: false, toc: false, pageBreak: false, video: false, slideText: false });
      } finally {
        if (el('v2-export-type').value !== 'pdf') { const pdfRow = row('pdf'); if (pdfRow) pdfRow.click(); await sleep(60); }
        if (EmailPlainText.isActive()) await newDocument(h);
        await h.resetEditor();
      }
      return verdict(problems, {});
    },
  });

  // --- 7) les vrais exports ---
  // Clique le bouton Exporter et attend le téléchargement (mêmes gestes que scenarios-list-split.js:clickExportRow) : la confirmation acceptée et notée, le <a download> intercepté.
  async function exportByButton(h, expect) {
    const downloads = [];
    const confirms = [];
    const blobsByUrl = new Map();
    const origCreate = URL.createObjectURL;
    const origClick = HTMLAnchorElement.prototype.click;
    const dialogs = h.stubDialogs({ confirm: opts => { confirms.push(opts.message); return true; } });
    URL.createObjectURL = obj => { const url = origCreate.call(URL, obj); blobsByUrl.set(url, obj); return url; };
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) { downloads.push({ name: this.download, blob: blobsByUrl.get(this.href) }); return; }
      return origClick.call(this);
    };
    try {
      el('btn-export-pdf').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      const startedAt = Date.now();
      while (downloads.length < (expect || 1) && Date.now() - startedAt < 60000) await sleep(100);
      await sleep(80);
    } finally {
      dialogs.restore();
      URL.createObjectURL = origCreate;
      HTMLAnchorElement.prototype.click = origClick;
    }
    return { downloads, confirms, status: el('status-msg').textContent };
  }
  async function emailOnScreen(h, ids, pj) {
    await seed(h, ids);
    await newEmail(h);
    Editor.setHTML(body);
    await sleep(80);
    el('v2-email-subject').value = FIELDS.objet;
    el('v2-email-to').value = FIELDS.destinataires;
    el('v2-email-pj').value = pj;
    el('pdf-filename-template').value = 'Facture_#' + TABLE + '.Nom';
    document.querySelector('#v2-quality-flyout .v2-hover-row[data-export-type="eml"]').click();
    await sleep(120);
  }
  async function leaveEmail(h, lines) {
    ['v2-email-subject', 'v2-email-to', 'v2-email-pj', 'pdf-filename-template'].forEach(id => { el(id).value = ''; });
    const typeRow = document.querySelector('#v2-quality-flyout .v2-hover-row[data-export-type="pdf"]');
    if (typeRow) typeRow.click();
    const linesRow = document.getElementById('v2-export-lines-one');
    if (lines && linesRow) linesRow.click();
    await sleep(60);
    await newDocument(h);
    await cleanup();
  }

  cases.push({
    id: 'eml_exporter_button_writes_one_eml_for_the_displayed_row',
    description: 'Le bouton Exporter, type « Email (.eml) » et une seule ligne : un fichier .eml nommé d\'après le modèle de nom de fichier, avec l\'objet, le destinataire, la mise en forme et la pièce jointe de la ligne affichée, et une phrase d\'état qui dit que l\'email est prêt',
    run: async (h) => {
      const problems = [];
      FILES.set(151, bytesFrom(300, 5));
      serveFiles();
      try {
        await emailOnScreen(h, { a: 151, b: 152, c: 153 }, '#' + TABLE + '.Pj');
        FILES.set(152, bytesFrom(20, 6));
        const done = await exportByButton(h, 1);
        check(problems, 'un seul téléchargement', done.downloads.length, 1);
        check(problems, 'nom du fichier', done.downloads[0] && done.downloads[0].name, 'Facture_Alice.eml');
        const message = done.downloads[0] ? await readBlob(done.downloads[0].blob) : { headers: {}, parts: [] };
        check(problems, 'objet', decodeWords(message.headers.subject || ''), 'Facture Alice');
        check(problems, 'À', message.headers.to, 'alice@example.org');
        check(problems, 'brouillon', message.headers['x-unsent'], '1');
        check(problems, 'gras gardé', /<strong[^>]*>Ci-joint<\/strong>/.test(message.parts ? htmlOf(message) : ''), true);
        check(problems, 'pièces jointes', attachmentsOf(message).map(nameOf), ['Facture été.pdf', 'cgv.pdf']);
        check(problems, 'phrase d\'état', /Email \(\.eml\) généré/.test(done.status), true);
      } finally { await leaveEmail(h); }
      return verdict(problems, {});
    },
  });

  cases.push({
    id: 'eml_exporter_button_writes_a_zip_with_one_eml_per_row',
    description: 'Le bouton Exporter, type « Email (.eml) » et toutes les lignes : une archive ZIP avec un .eml par ligne (chacun avec SON destinataire et SES pièces jointes), une confirmation qui parle d\'emails (.eml), et la phrase de fin',
    run: async (h) => {
      const problems = [];
      FILES.set(161, bytesFrom(100, 1)); FILES.set(162, bytesFrom(100, 2)); FILES.set(163, bytesFrom(100, 3));
      serveFiles();
      try {
        await emailOnScreen(h, { a: 161, b: 162, c: 163 }, '#' + TABLE + '.Pj');
        document.getElementById('v2-export-lines-zip').click();
        await sleep(80);
        const done = await exportByButton(h, 1);
        check(problems, 'une archive', done.downloads.length, 1);
        check(problems, 'nom de l\'archive', /-export-eml\.zip$/.test(done.downloads[0] ? done.downloads[0].name : ''), true);
        check(problems, 'la confirmation parle d\'emails', done.confirms.some(text => /email/i.test(text) && /\.eml/.test(text) && /2 lignes/.test(text)), true);
        const zip = done.downloads[0] ? await JSZip.loadAsync(await done.downloads[0].blob.arrayBuffer()) : { files: {} };
        const names = Object.keys(zip.files).filter(name => !zip.files[name].dir).sort();
        check(problems, 'un .eml par ligne', names, ['Facture_Alice.eml', 'Facture_Bob.eml']);
        const alice = parseEntity(await zip.file('Facture_Alice.eml').async('string'));
        const bob = parseEntity(await zip.file('Facture_Bob.eml').async('string'));
        check(problems, 'destinataire d\'Alice', alice.headers.to, 'alice@example.org');
        check(problems, 'destinataire de Bob', bob.headers.to, 'bob@example.org');
        check(problems, 'pièces jointes d\'Alice', attachmentsOf(alice).map(nameOf), ['Facture été.pdf', 'cgv.pdf']);
        check(problems, 'pièce jointe de Bob', attachmentsOf(bob).map(nameOf), ['autre.txt']);
        check(problems, 'phrase de fin', /2 emails \(\.eml\) générés/.test(done.status), true);
      } finally { await leaveEmail(h, true); }
      return verdict(problems, {});
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.emlExport = cases;
})();
