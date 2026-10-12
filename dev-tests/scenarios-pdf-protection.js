// Suite "pdfProtection" - le type « PDF protégé » du menu Type d'export (js/pdf-protection.js, js/pdf-protection-dialog.js, js/pdf-export.js, js/main.js). Demande d'Antoine du 12/10 :
// « Protection du PDF Ok pour le dev, proposer ca dans le choix des type d'export genre "pdf protégé" » : un mot de passe pour ouvrir le fichier, ce que la personne qui l'ouvre peut en
// faire (imprimer, copier, modifier) et les propriétés du fichier (auteur, sujet, mots-clés), le tout chiffré en AES-256 par pdfmake.
// Ce que la suite garde :
//  1) le module : réglages propres, mot de passe coupé à 127 octets sans casser un caractère, droits, champs de pdfmake, mot de passe propriétaire tiré au hasard (jamais deux fois le même,
//     sans biais, sans hasard sûr = une erreur), aucune protection = refus ;
//  2) le moteur : les champs ne se posent que sur le document fini (jamais sur une passe de mesure), sans eux le PDF est ordinaire, avec eux le fichier est chiffré en AES-256 ;
//  3) le fichier relu par pdf.js : il refuse l'ouverture sans mot de passe ou avec un mauvais, l'ouvre avec le bon (accentué), y retrouve le même texte, les autorisations choisies et les
//     propriétés ; sans mot de passe il s'ouvre et ne porte que les autorisations ;
//  4) le menu : la ligne « PDF protégé » (document et grille), la qualité du PDF montrée, « Impression navigateur », « un seul PDF » et l'assemblage grisés (jamais retirés) avec leur raison
//     en info-bulle, le choix de lignes et la qualité gardés pour le retour au PDF ;
//  5) le bouton Exporter : la fenêtre d'abord (Annuler n'exporte rien), puis le PDF d'une ligne avec les champs choisis ; un PDF ordinaire ne la demande pas et ne porte aucun champ ;
//  6) le lot (ZIP) : la fenêtre tient lieu de confirmation et dit combien de PDF, chaque PDF de l'archive est chiffré avec le même mot de passe, Annuler ne génère rien ; une ligne qui sort
//     en plusieurs documents (« Un document par valeur ») : une seule fenêtre, une archive de PDF protégés ;
//  7) la fenêtre : « Exporter » grisé tant que rien n'est protégé, Entrée, Échap, Annuler, mot de passe jamais gardé et coupé à 127 octets, droits et auteur gardés, textes français et anglais.
// Le vrai clic à 700 x 400 et les fichiers relus par poppler et pypdf sont dans dev-tests/verify-pdf-protection-mouse.mjs.
(function () {
  const cases = [];
  const TABLE = 'PbProtClients';
  const NAMES = ['Alpha Durand', 'Bravo Martin', 'Charlie Petit'];
  const THEMES = ['L', 'Santé', 'Social'];
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const PER_VALUE = ` data-format="${JSON.stringify({ list: { perValue: true } }).replace(/"/g, '&quot;')}"`;
  const KEYS = ['version', 'userPassword', 'ownerPassword', 'permissions'];
  const SETTINGS = { password: 'stub-token-Sésame-ÿ 42', allowPrint: true, allowCopy: false, allowModify: false, author: 'Anne Durand', subject: 'Courrier', keywords: 'test, pdf' };
  const TYPE_FLYOUT = '#v2-quality-flyout';
  const EXPORT_FLYOUT = '#v2-export-pdf-flyout';
  // Les droits que pdf.js lit dans le fichier (PermissionFlag).
  const FLAG = { print: 0x04, modify: 0x08, copy: 0x10, annotate: 0x20, forms: 0x100, accessibility: 0x200, assemble: 0x400, printHigh: 0x800 };

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const result = bad => ({ pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' });
  const squash = s => String(s).replace(/\s+/g, '');
  const sorted = o => JSON.stringify(Object.keys(o).sort().map(key => [key, o[key]]));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const bytesOf = text => new TextEncoder().encode(text).length;
  // Une moitié de caractère à deux unités (un emoji coupé en deux).
  const hasLoneSurrogate = text => /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(text);
  const badge = column => `<span class="var-badge" data-table="${TABLE}" data-column="${column}" data-key="${TABLE}.${column}"></span>`;
  const listBadge = column => `<span class="var-badge" data-table="${TABLE}" data-column="${column}" data-key="${TABLE}.${column}"${PER_VALUE}></span>`;
  const inLang = async (lang, fn) => { const before = I18n.getLang(); I18n.setLang(lang); try { return await fn(); } finally { I18n.setLang(before); } };

  const typeSelect = () => document.getElementById('v2-export-type');
  const qualitySelect = () => document.getElementById('v2-pdf-quality');
  const linesSelect = () => document.getElementById('v2-export-lines');
  const typeRow = type => document.querySelector(TYPE_FLYOUT + ' .v2-hover-row[data-export-type="' + type + '"]');
  const qualityRow = quality => document.querySelector(TYPE_FLYOUT + ' .v2-hover-row[data-quality="' + quality + '"]');
  const linesRow = lines => document.querySelector(EXPORT_FLYOUT + ' .v2-hover-row[data-export-lines="' + lines + '"]');
  const greyed = row => row.classList.contains('v2-hover-row-disabled') && row.getAttribute('aria-disabled') === 'true';
  const live = row => !row.classList.contains('v2-hover-row-disabled') && row.getAttribute('aria-disabled') === null;
  const shown = el => el.closest('[hidden]') === null;
  const shownRows = flyout => Array.from(document.querySelectorAll(flyout + ' .v2-hover-row')).filter(shown);
  const shownLines = () => shownRows(EXPORT_FLYOUT).map(row => row.dataset.exportLines).join();
  const tickedLines = () => Array.from(document.querySelectorAll(EXPORT_FLYOUT + ' .v2-hover-row[aria-checked="true"]')).map(row => row.dataset.exportLines).join();
  const activeRows = () => Array.from(document.querySelectorAll(TYPE_FLYOUT + ' .v2-hover-row.is-active')).map(row => row.dataset.exportType || row.dataset.quality).join();
  const pickType = async type => { typeRow(type).click(); await sleep(20); };
  const pickQuality = async quality => { qualityRow(quality).click(); await sleep(20); };
  const pickLines = async lines => { linesRow(lines).click(); await sleep(20); };
  // Les menus se redessinent au survol de leur bouton (js/main.js:wireExportMenus) : de quoi relire les info-bulles dans une autre langue.
  const hover = () => document.getElementById('v2-btn-quality').closest('.v2-hover-group').dispatchEvent(new MouseEvent('mouseenter'));

  async function seed(h) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables(TABLE, { Nom: 'Text', Themes: 'ChoiceList' });
    stub.setRows(TABLE, NAMES.map((Nom, i) => ({ id: i + 1, Nom, Themes: THEMES })));
    await GristAPI.refreshSchema();
    stub.fireRecord({ id: 1, Nom: NAMES[0], Themes: THEMES }, TABLE);
    await sleep(50);
    Editor.setHTML(`<p>Bonjour ${badge('Nom')}, voici votre courrier protégé.</p>`);
    Editor.setHeaderFooterData(NO_HF);
    await sleep(80);
  }
  async function enterGrid(h) {
    h.openFlyout('#v2-new-template-group');
    await h.clickButton('v2-btn-new-grid');
    await sleep(250);
  }
  async function leaveGrid(h) {
    h.openFlyout('#v2-new-template-group');
    await h.clickButton('v2-btn-new-document');
    await sleep(250);
  }
  // Remet le menu d'avant : PDF vectoriel, une seule ligne, dans un document.
  async function reset(h) {
    await leaveGrid(h);
    typeSelect().value = 'pdf';
    qualitySelect().value = 'native';
    linesSelect().value = 'one';
    await pickType('pdf');
    await pickQuality('native');
    await pickLines('one');
  }

  // Le contenu du modèle (un « nouveau document » vide l'éditeur : à poser après `reset`).
  async function setBody(html) {
    Editor.setHTML(html);
    Editor.setHeaderFooterData(NO_HF);
    await sleep(100);
  }

  // --- La fenêtre ---
  const dialogEl = () => document.getElementById('pp-protect-modal');
  const dialogOpen = () => !!dialogEl() && getComputedStyle(dialogEl()).display !== 'none';
  async function waitDialog(open) {
    for (let i = 0; i < 250 && dialogOpen() !== open; i++) await sleep(40);
    return dialogOpen() === open;
  }
  const field = id => document.getElementById(id);
  const okButton = () => dialogEl().querySelector('.pp-modal-actions .var-modal-primary');
  const cancelButton = () => dialogEl().querySelector('.pp-modal-actions button:not(.var-modal-primary)');
  const typeInto = (input, value) => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); };
  const tick = (input, on) => { if (input.checked !== on) input.click(); };
  const press = (target, key, extra) => target.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key, bubbles: true, cancelable: true }, extra || {})));
  // Referme la fenêtre si un cas a échoué avant de la fermer.
  async function closeDialog() { if (dialogOpen()) { cancelButton().click(); await sleep(40); } }
  // Ce que la fenêtre porte : l'état dont une personne se sert pour décider.
  function dialogState() {
    return {
      title: document.getElementById('pp-protect-title').textContent,
      intro: field('pp-protect-intro').hidden ? '' : field('pp-protect-intro').textContent,
      passwordLabel: dialogEl().querySelector('label[for="pp-protect-password"]').textContent,
      passwordType: field('pp-protect-password').type,
      password: field('pp-protect-password').value,
      print: field('pp-protect-print').checked, copy: field('pp-protect-copy').checked, modify: field('pp-protect-modify').checked,
      ok: okButton().textContent, okDisabled: okButton().disabled, cancel: cancelButton().textContent,
      nothing: field('pp-protect-nothing').hidden ? '' : field('pp-protect-nothing').textContent,
      focus: document.activeElement === field('pp-protect-password'),
    };
  }

  // --- Les fichiers ---
  // Le moteur, appelé comme le fait un lot (getNativePdfBlobForRecord), avec un espion sur pdfMake.createPdf : ce que chaque passe (mesure ou document fini) porte au moment de l'appel.
  async function exportRaw(html, settings) {
    await PdfExport.ensurePdfLibsLoaded();
    const seen = [];
    const original = window.pdfMake.createPdf;
    window.pdfMake.createPdf = function (doc) {
      seen.push({ keys: KEYS.filter(key => key in doc), info: JSON.parse(JSON.stringify(doc.info || {})) });
      return original.apply(this, arguments);
    };
    try {
      const docFields = settings ? PdfProtection.docFields(settings) : undefined;
      const before = docFields ? JSON.stringify(docFields) : '';
      const { blob } = await PdfExport.getNativePdfBlobForRecord(html, TABLE, { id: 1, Nom: NAMES[0], Themes: THEMES }, '', NO_HF, PageLayout.getMarginsPt(), false, 'native', docFields);
      return { blob, seen, untouched: !docFields || JSON.stringify(docFields) === before };
    } finally { window.pdfMake.createPdf = original; }
  }
  const asText = async blob => new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
  // Le fichier ouvert comme le ferait un lecteur : avec ou sans mot de passe. Rend { pdf } ou { error: 'nom:code' } (PasswordException : 1 = il en faut un, 2 = pas le bon).
  // pdf.js lit le mot de passe octet par octet (un caractère = un octet) ; le PDF AES-256 prend le mot de passe en UTF-8 (comme poppler et la norme PDF 2.0) : on lui
  // donne donc les octets UTF-8 du mot de passe tapé. Sans cela « é » (deux octets dans le fichier) lui ferait dire « mauvais mot de passe ».
  const utf8Binary = text => String.fromCharCode(...new TextEncoder().encode(text));
  async function openPdf(h, blob, password) {
    await h.ensurePdfJsLoaded();
    const data = new Uint8Array(await blob.arrayBuffer());
    try { return { pdf: await window.pdfjsLib.getDocument(password === undefined ? { data } : { data, password: utf8Binary(password) }).promise }; }
    catch (e) { return { error: e.name + ':' + e.code }; }
  }
  async function textOf(pdf) {
    const parts = [];
    for (let n = 1; n <= pdf.numPages; n++) parts.push((await (await pdf.getPage(n)).getTextContent()).items.map(item => item.str).join(''));
    return parts.join(' ');
  }

  // Les téléchargements du lot : le <a download> est intercepté au lieu d'un vrai téléchargement.
  function captureDownloads() {
    const downloads = [];
    const blobsByUrl = new Map();
    const origCreate = URL.createObjectURL;
    const origClick = HTMLAnchorElement.prototype.click;
    URL.createObjectURL = obj => { const url = origCreate.call(URL, obj); blobsByUrl.set(url, obj); return url; };
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) { downloads.push({ name: this.download, blob: blobsByUrl.get(this.href) }); return; }
      return origClick.call(this);
    };
    return { downloads, restore() { URL.createObjectURL = origCreate; HTMLAnchorElement.prototype.click = origClick; } };
  }

  // Les moteurs qu'un export d'une ligne appelle, remplacés par des espions, et la fenêtre du mot de passe remplacée par une réponse toute faite : `answer` (les réglages, ou null pour Annuler).
  function spyOnSingleExport(answer) {
    const calls = { pdf: [], print: 0, asked: [] };
    const orig = { pdf: PdfExport.exportCurrentRecord, print: PrintExport.printRecord, open: PdfProtectionDialog.open };
    PdfExport.exportCurrentRecord = async (...args) => { calls.pdf.push(args); };
    PrintExport.printRecord = async () => { calls.print++; };
    PdfProtectionDialog.open = async opts => { calls.asked.push(opts); return answer; };
    return {
      calls,
      restore() { PdfExport.exportCurrentRecord = orig.pdf; PrintExport.printRecord = orig.print; PdfProtectionDialog.open = orig.open; },
    };
  }
  // Clique le bouton Exporter et attend la fin de ce qu'il lance : un export (`done` par défaut) ou, quand la fenêtre est annulée, la fenêtre posée (`spies.calls.asked`).
  async function clickExport(spies, done) {
    const exported = () => spies.calls.pdf.length + spies.calls.print;
    const before = { exported: exported(), asked: spies.calls.asked.length };
    const finished = done || (() => exported() !== before.exported);
    document.getElementById('btn-export-pdf').click();
    for (let i = 0; i < 200 && !finished(); i++) await sleep(50);
    for (let i = 0; i < 40 && document.getElementById('btn-export-pdf').style.pointerEvents === 'none'; i++) await sleep(50);
    await sleep(80);
  }
  const statusText = () => document.getElementById('status-msg').textContent;

  // Le hasard du navigateur remplacé le temps de `fn` (`fill` absent : plus aucun hasard sûr).
  function withRandom(fill, fn) {
    Object.defineProperty(crypto, 'getRandomValues', { value: fill, configurable: true, writable: true });
    try { return fn(); } finally { delete crypto.getRandomValues; }
  }

  cases.push({
    id: 'pdfprotect_module_cleans_the_settings_and_builds_the_pdfmake_fields',
    description: 'PdfProtection : des réglages propres (imprimer et copier permis, modifier refusé au départ ; propriétés sans retour à la ligne, 200 caractères au plus), un mot de passe coupé à 127 octets sans casser un caractère (accent, emoji), « protège-t-il quelque chose » (un mot de passe ou un droit retiré, jamais les propriétés seules), les champs de pdfmake (AES-256, mot de passe pour ouvrir seulement s\'il y en a un, droits, propriétés non vides) et un mot de passe propriétaire tiré au hasard (32 caractères sans ressemblance, jamais le même, sans biais, une erreur sans hasard sûr)',
    run: async () => {
      const bad = [];
      const P = PdfProtection;
      const defaults = P.normalize();
      if (!same(defaults, { password: '', allowPrint: true, allowCopy: true, allowModify: false, author: '', subject: '', keywords: '' })) bad.push('réglages d\'origine=' + JSON.stringify(defaults));
      const messy = P.normalize({ password: 12, allowPrint: 0, allowCopy: 'oui', author: '  Anne\nDurand\u0000  ', subject: 'x'.repeat(300), keywords: null });
      if (messy.password !== '' || messy.allowPrint !== false || messy.allowCopy !== true || messy.author !== 'Anne Durand' || messy.subject.length !== 200 || messy.keywords !== '') bad.push('réglages sales=' + JSON.stringify(messy));
      // Le mot de passe tient dans 127 octets (UTF-8), caractère entier par caractère entier.
      [
        ['é'.repeat(100), 'é'.repeat(63)],
        ['a'.repeat(127), 'a'.repeat(127)],
        ['a'.repeat(128), 'a'.repeat(127)],
        ['a'.repeat(123) + '😀', 'a'.repeat(123) + '😀'],
        ['a'.repeat(124) + '😀', 'a'.repeat(124)],
        ['a'.repeat(125) + '😀', 'a'.repeat(125)],
        ['😀'.repeat(40), '😀'.repeat(31)],
      ].forEach(([given, want]) => {
        const got = P.normalize({ password: given }).password;
        if (got !== want || bytesOf(got) > P.MAX_PASSWORD_BYTES || hasLoneSurrogate(got)) bad.push('mot de passe de ' + bytesOf(given) + ' octets : ' + got.length + ' caractères et ' + bytesOf(got) + ' octets rendus (' + (hasLoneSurrogate(got) ? 'un emoji coupé' : 'attendu ' + want.length) + ')');
      });
      // « Protège-t-il quelque chose ? »
      [
        [{}, true], [{ allowModify: true }, false], [{ allowModify: true, password: 'x' }, true], [{ allowModify: true, allowPrint: false }, true],
        [{ allowModify: true, allowCopy: false }, true], [{ allowModify: true, password: '   ' }, true], [{ allowModify: true, author: 'Anne', subject: 's', keywords: 'k' }, false],
      ].forEach(([given, want]) => { if (P.protects(given) !== want) bad.push('protects(' + JSON.stringify(given) + ')=' + !want); });
      // Les champs de pdfmake.
      const full = P.docFields({ password: 'stub-token-Sésame', allowPrint: true, allowCopy: false, allowModify: false, author: 'Anne', keywords: 'a, b' });
      const wantPermissions = { modifying: false, copying: false, annotating: false, fillingForms: false, documentAssembly: false, contentAccessibility: true, printing: 'highResolution' };
      if (full.version !== '1.7ext3' || full.userPassword !== 'stub-token-Sésame' || sorted(full.permissions) !== sorted(wantPermissions) || sorted(full.info) !== sorted({ author: 'Anne', keywords: 'a, b' })) bad.push('champs=' + JSON.stringify(full));
      if (!/^[A-HJ-NP-Za-km-z2-9]{32}$/.test(full.ownerPassword) || full.ownerPassword === full.userPassword) bad.push('mot de passe propriétaire=' + full.ownerPassword);
      const rightsOnly = P.docFields({ allowPrint: false, allowCopy: true, allowModify: true });
      if ('userPassword' in rightsOnly || 'info' in rightsOnly || 'printing' in rightsOnly.permissions || rightsOnly.permissions.copying !== true) bad.push('droits seuls=' + JSON.stringify(rightsOnly));
      if (!['modifying', 'annotating', 'fillingForms', 'documentAssembly'].every(key => rightsOnly.permissions[key] === true) || rightsOnly.permissions.contentAccessibility !== true) bad.push('« modifier » ne lève pas les quatre droits : ' + JSON.stringify(rightsOnly.permissions));
      // Rien à protéger : une erreur, jamais un PDF ordinaire présenté comme protégé.
      let nothing = null;
      try { P.docFields({ allowModify: true, author: 'Anne' }); } catch (e) { nothing = e.message; }
      if (!nothing || !/Aucune protection/.test(nothing)) bad.push('rien à protéger : ' + nothing);
      // Le mot de passe propriétaire : tiré au hasard, jamais deux fois le même.
      const owners = Array.from({ length: 30 }, () => P.docFields({ password: 'x' }).ownerPassword);
      if (owners.some(owner => !/^[A-HJ-NP-Za-km-z2-9]{32}$/.test(owner)) || new Set(owners).size !== owners.length) bad.push('mots de passe propriétaires=' + owners.slice(0, 2).join());
      // Un octet au-delà du plus grand multiple de l'alphabet (57 caractères : 228) est rejeté - sans cela les premiers caractères seraient plus probables -, celui d'en dessous est gardé
      // (227 donne le dernier caractère, « 9 »), les autres donnent les caractères dans l'ordre.
      const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
      let draws = 0;
      const drawn = withRandom(buffer => {
        draws++;
        for (let i = 0; i < buffer.length; i++) buffer[i] = draws === 1 ? 255 : i;
        if (draws === 2) { buffer[0] = 227; buffer[1] = 228; }
        return buffer;
      }, () => P.docFields({ password: 'x' }).ownerPassword);
      if (drawn !== '9' + ALPHABET.slice(2, 33) || draws !== 2) bad.push('tirage avec rejet=' + drawn + ' après ' + draws + ' tirages');
      // Sans hasard sûr : une erreur, pas un PDF « protégé » dont le mot de passe propriétaire serait prévisible.
      let noRandom = null;
      try { withRandom(undefined, () => P.docFields({ password: 'x' })); } catch (e) { noRandom = e.message; }
      if (!noRandom || !/pas protégé/.test(noRandom)) bad.push('sans hasard sûr : ' + noRandom);
      return result(bad);
    },
  });

  cases.push({
    id: 'pdfprotect_engine_puts_the_fields_on_the_final_document_only_and_the_file_is_encrypted',
    description: 'PdfExport.getNativePdfBlobForRecord avec les champs de PdfProtection : seul le document fini les porte (jamais une passe de mesure), les propriétés complètent le titre, les champs reçus ne sont pas modifiés et le fichier est chiffré en AES-256 ; sans eux le PDF est ordinaire (aucun champ posé, pas de chiffrement)',
    run: async (h) => {
      await seed(h);
      const bad = [];
      const html = `<p>Bonjour ${badge('Nom')}, voici votre courrier protégé.</p>`;
      const plain = await exportRaw(html);
      const protectedOne = await exportRaw(html, SETTINGS);
      if (!plain.seen.length || plain.seen.some(pass => pass.keys.length)) bad.push('un PDF ordinaire porte des champs de protection : ' + JSON.stringify(plain.seen.map(pass => pass.keys)));
      if (protectedOne.seen.length !== plain.seen.length) bad.push('nombre de passes : ' + protectedOne.seen.length + ' au lieu de ' + plain.seen.length);
      const last = protectedOne.seen[protectedOne.seen.length - 1];
      if (!last || last.keys.length !== KEYS.length) bad.push('le document fini ne porte pas les quatre champs : ' + JSON.stringify(last && last.keys));
      if (protectedOne.seen.slice(0, -1).some(pass => pass.keys.length)) bad.push('une passe de mesure porte des champs : ' + JSON.stringify(protectedOne.seen.map(pass => pass.keys)));
      const plainTitle = plain.seen[plain.seen.length - 1].info.title;
      if (!last || last.info.title !== plainTitle || !plainTitle || last.info.author !== 'Anne Durand' || last.info.subject !== 'Courrier' || last.info.keywords !== 'test, pdf') bad.push('propriétés=' + JSON.stringify(last && last.info) + ' (titre sans protection : ' + plainTitle + ')');
      if (!protectedOne.untouched) bad.push('les champs reçus ont été modifiés par l\'export');
      const plainText = await asText(plain.blob);
      const protectedText = await asText(protectedOne.blob);
      if (!/^%PDF-/.test(plainText) || /\/Encrypt\b/.test(plainText)) bad.push('le PDF ordinaire est chiffré ou illisible');
      if (!/^%PDF-/.test(protectedText) || !/\/Encrypt\b/.test(protectedText) || !/\/AESV3\b/.test(protectedText) || !/\/V 5\b/.test(protectedText)) bad.push('le PDF protégé n\'est pas chiffré en AES-256 : ' + (protectedText.match(/\/Encrypt[^>]*/) || ['pas de /Encrypt'])[0].slice(0, 80));
      if (/Sésame/.test(protectedText)) bad.push('le mot de passe est écrit dans le fichier');
      return result(bad);
    },
  });

  cases.push({
    id: 'pdfprotect_pdfjs_opens_the_file_only_with_the_password_and_reads_the_choices',
    description: 'Le fichier relu par pdf.js : sans mot de passe ou avec un mauvais il est refusé (PasswordException 1 puis 2), avec le bon (accentué, avec espace) il s\'ouvre et rend le même texte que le PDF ordinaire, ses autorisations (imprimer en haute qualité permis, copier et modifier refusés, lecture par lecteur d\'écran toujours permise) et ses propriétés (auteur, sujet, mots-clés, titre gardé) ; sans mot de passe pour l\'ouvrir il s\'ouvre tout seul et ne porte que les autorisations (imprimer refusé, copier et modifier permis)',
    run: async (h) => {
      await seed(h);
      const bad = [];
      const html = `<p>Bonjour ${badge('Nom')}, voici votre courrier protégé.</p>`;
      const plain = await exportRaw(html);
      const withPassword = await exportRaw(html, SETTINGS);
      const noPassword = await openPdf(h, withPassword.blob);
      const wrong = await openPdf(h, withPassword.blob, 'stub-token-Sésame-y 42');
      const right = await openPdf(h, withPassword.blob, SETTINGS.password);
      const plainOpen = await openPdf(h, plain.blob);
      if (noPassword.error !== 'PasswordException:1') bad.push('sans mot de passe : ' + (noPassword.error || 'ouvert'));
      if (wrong.error !== 'PasswordException:2') bad.push('mauvais mot de passe : ' + (wrong.error || 'ouvert'));
      if (!right.pdf) bad.push('le bon mot de passe n\'ouvre pas le fichier : ' + right.error);
      if (!plainOpen.pdf) bad.push('le PDF ordinaire ne s\'ouvre pas : ' + plainOpen.error);
      if (right.pdf && plainOpen.pdf) {
        const wantText = squash(await textOf(plainOpen.pdf));
        const gotText = squash(await textOf(right.pdf));
        if (!gotText.includes(squash('Bonjour ' + NAMES[0] + ', voici votre courrier protégé.')) || gotText !== wantText) bad.push('texte relu=' + gotText.slice(0, 60) + ' au lieu de ' + wantText.slice(0, 60));
        const flags = await right.pdf.getPermissions();
        const has = flag => Array.isArray(flags) && flags.indexOf(flag) !== -1;
        if (!has(FLAG.print) || !has(FLAG.printHigh) || !has(FLAG.accessibility)) bad.push('autorisations permises manquantes : ' + JSON.stringify(flags));
        if (has(FLAG.copy) || has(FLAG.modify) || has(FLAG.annotate) || has(FLAG.forms) || has(FLAG.assemble)) bad.push('autorisations refusées présentes : ' + JSON.stringify(flags));
        const info = (await right.pdf.getMetadata()).info;
        if (info.Author !== 'Anne Durand' || info.Subject !== 'Courrier' || info.Keywords !== 'test, pdf' || info.Title !== 'publipostage') bad.push('propriétés relues=' + JSON.stringify({ Author: info.Author, Subject: info.Subject, Keywords: info.Keywords, Title: info.Title }));
      }
      // Sans mot de passe : le fichier s'ouvre sans, la visionneuse applique les autorisations (imprimer refusé ; copier et modifier permis).
      const rightsOnly = await exportRaw(html, { allowPrint: false, allowCopy: true, allowModify: true });
      const opened = await openPdf(h, rightsOnly.blob);
      if (!opened.pdf) bad.push('sans mot de passe le fichier devrait s\'ouvrir : ' + opened.error);
      else {
        const flags = await opened.pdf.getPermissions();
        const has = flag => Array.isArray(flags) && flags.indexOf(flag) !== -1;
        if (has(FLAG.print) || has(FLAG.printHigh) || !has(FLAG.copy) || !has(FLAG.modify) || !has(FLAG.annotate)) bad.push('autorisations sans mot de passe : ' + JSON.stringify(flags));
        if (!squash(await textOf(opened.pdf)).includes(squash(NAMES[0]))) bad.push('texte du PDF sans mot de passe introuvable');
      }
      return result(bad);
    },
  });

  cases.push({
    id: 'pdfprotect_menu_greys_what_a_protected_pdf_cannot_do_and_keeps_the_choices',
    description: 'Menu Type d\'export : « PDF protégé » (document et grille, jamais grisé) est choisissable, allume le bouton du type, garde la qualité du PDF montrée ; « Impression navigateur », « Toutes les lignes en un seul PDF » et « Assemblage » restent dans les menus, grisés avec leur raison en info-bulle (français et anglais), et un clic dessus ne choisit rien ; la qualité et l\'option de lignes choisies pour le PDF reviennent avec lui (rien n\'est perdu) ; changer de genre de modèle ne rend pas le type au PDF',
    run: async (h) => {
      await seed(h);
      await reset(h);
      const bad = [];
      try {
        if (!live(typeRow('pdfProtected'))) bad.push('« PDF protégé » grisé dans un document');
        await pickQuality('browser-print');
        await pickLines('merged');
        await pickType('pdfProtected');
        if (typeSelect().value !== 'pdfProtected' || !typeRow('pdfProtected').classList.contains('is-active') || !document.getElementById('v2-btn-quality').classList.contains('active')) bad.push('« PDF protégé » non choisi : ' + typeSelect().value);
        // La qualité du PDF est montrée (intitulé, filet, trois lignes) ; l'impression navigateur est grisée avec sa raison, la ligne active est celle qui s'applique, « Vectoriel ».
        const labels = Array.from(document.querySelectorAll(TYPE_FLYOUT + ' .v2-hover-flyout-label')).filter(shown).map(el => el.textContent.trim());
        if (!same(labels, ['Type d’export', 'Qualité PDF'])) bad.push('intitulés montrés=' + JSON.stringify(labels));
        if (!['native', 'browser-print', 'light'].every(q => shown(qualityRow(q)))) bad.push('une ligne de qualité n\'est pas montrée avec le PDF protégé');
        if (!greyed(qualityRow('browser-print')) || !qualityRow('browser-print').title || qualityRow('browser-print').title !== I18n.t('quality.protectedOff')) bad.push('« Impression navigateur » non grisée avec sa raison : ' + qualityRow('browser-print').className + ' / ' + qualityRow('browser-print').title);
        if (!live(qualityRow('native')) || !live(qualityRow('light')) || qualityRow('native').title || qualityRow('light').title) bad.push('« Vectoriel » ou « Léger » grisé ou porte une info-bulle');
        if (activeRows() !== 'pdfProtected,native') bad.push('lignes actives=' + activeRows());
        if (qualitySelect().value !== 'browser-print') bad.push('la qualité choisie n\'est pas gardée : ' + qualitySelect().value);
        // Un clic sur la ligne grisée ne choisit rien : on le voit en partant d'un autre choix, « Léger ».
        await pickQuality('light');
        qualityRow('browser-print').click();
        if (qualitySelect().value !== 'light' || activeRows() !== 'pdfProtected,light') bad.push('un clic sur « Impression navigateur » grisée a changé le choix : ' + qualitySelect().value + ' / ' + activeRows());
        // Le menu Exporter : les quatre options sont montrées, « un seul PDF » et l'assemblage sont grisés avec leur raison ; la coche tombe sur « ZIP » et le choix gardé reste « un seul PDF ».
        if (shownLines() !== 'one,zip,merged,sheets') bad.push('options montrées=' + shownLines());
        if (!live(linesRow('one')) || !live(linesRow('zip')) || linesRow('one').title || linesRow('zip').title) bad.push('« une seule ligne » ou « ZIP » grisé ou avec une info-bulle');
        ['merged', 'sheets'].forEach(lines => { if (!greyed(linesRow(lines)) || !linesRow(lines).title || linesRow(lines).title !== I18n.t('exportLines.protectedOff')) bad.push('« ' + lines + ' » non grisée avec sa raison : ' + linesRow(lines).className + ' / ' + linesRow(lines).title); });
        if (tickedLines() !== 'zip') bad.push('option cochée=' + tickedLines() + ' (« un seul PDF » ne se fait pas en PDF protégé)');
        if (linesSelect().value !== 'merged') bad.push('le choix « un seul PDF » n\'est pas gardé : ' + linesSelect().value);
        linesRow('sheets').click();
        if (linesSelect().value !== 'merged') bad.push('un clic sur « Assemblage » grisée l\'a choisi : ' + linesSelect().value);
        await pickLines('one');
        linesRow('merged').click();
        if (linesSelect().value !== 'one' || tickedLines() !== 'one') bad.push('un clic sur « un seul PDF » grisée l\'a choisi : ' + linesSelect().value + ' / ' + tickedLines());
        // Les raisons, dites en anglais au survol suivant.
        const english = await inLang('en', async () => {
          hover();
          return { quality: qualityRow('browser-print').title, lines: linesRow('merged').title, type: typeRow('pdfProtected').textContent.trim(), wantQuality: I18n.t('quality.protectedOff'), wantLines: I18n.t('exportLines.protectedOff') };
        });
        if (english.quality !== english.wantQuality || english.lines !== english.wantLines || !/^Not available/.test(english.quality) || !/^Not available/.test(english.lines) || english.type !== 'Protected PDF') bad.push('info-bulles et nom en anglais=' + JSON.stringify(english));
        hover();
        if (linesRow('merged').title !== I18n.t('exportLines.protectedOff') || /^Not available/.test(linesRow('merged').title)) bad.push('l\'info-bulle n\'est pas revenue en français : ' + linesRow('merged').title);
        // Le retour au PDF rend tout : l'impression navigateur et « un seul PDF » choisis avant, plus aucun grisé ni info-bulle.
        qualitySelect().value = 'browser-print';
        linesSelect().value = 'merged';
        await pickType('pdf');
        if (typeSelect().value !== 'pdf' || document.getElementById('v2-btn-quality').classList.contains('active')) bad.push('retour au PDF : ' + typeSelect().value);
        if (activeRows() !== 'pdf,browser-print') bad.push('lignes actives au retour=' + activeRows());
        if (tickedLines() !== 'merged') bad.push('option cochée au retour=' + tickedLines());
        const stale = [qualityRow('browser-print'), linesRow('merged'), linesRow('sheets')].filter(row => !live(row) || row.title);
        if (stale.length) bad.push('grisé ou info-bulle restés au retour : ' + stale.map(row => row.dataset.quality || row.dataset.exportLines).join());
        // Dans une grille (un nouveau modèle repart du PDF, chaque modèle a ses réglages) : le type est choisissable, reste choisi au survol suivant (Word, que la grille ne sait pas faire,
        // reviendrait au PDF) et les lots y parlent des valeurs de la table.
        qualitySelect().value = 'native';
        linesSelect().value = 'one';
        await enterGrid(h);
        if (!live(typeRow('pdfProtected')) || !greyed(typeRow('docx'))) bad.push('dans une grille : « PDF protégé » grisé ou Word pas grisé');
        await pickType('pdfProtected');
        hover();
        if (typeSelect().value !== 'pdfProtected' || activeRows() !== 'pdfProtected,native') bad.push('dans une grille, « PDF protégé » n\'est pas gardé : ' + typeSelect().value + ' / ' + activeRows());
        if (shownLines() !== 'one,zip,merged,sheets' || !/valeurs de la table/.test(linesRow('zip').textContent)) bad.push('options d\'une grille=' + shownLines() + ' / ' + linesRow('zip').textContent.trim());
        if (!greyed(linesRow('merged')) || !greyed(linesRow('sheets'))) bad.push('dans une grille, « un seul PDF » ou l\'assemblage n\'est pas grisé');
      } finally { await reset(h); }
      return result(bad);
    },
  });

  cases.push({
    id: 'pdfprotect_export_button_asks_the_dialog_first_then_exports_with_the_chosen_fields',
    description: 'Le bouton Exporter en « PDF protégé », une seule ligne : la fenêtre est posée avant tout, Annuler n\'exporte rien (« Export annulé. », bouton libre) ; sinon le PDF d\'une ligne part avec les champs de pdfmake de la fenêtre (mot de passe, droits, propriétés, version AES-256) et la qualité « Léger » ; « Impression navigateur » ne s\'applique pas (vectoriel, aucune impression) ; un PDF ordinaire ne pose pas la fenêtre et ne porte aucun champ',
    run: async (h) => {
      await seed(h);
      await reset(h);
      const bad = [];
      const settings = PdfProtection.normalize(SETTINGS);
      const spies = spyOnSingleExport(settings);
      try {
        await pickType('pdfProtected');
        await clickExport(spies);
        const sent = spies.calls.pdf[0];
        if (spies.calls.asked.length !== 1 || spies.calls.pdf.length !== 1 || !sent) bad.push('fenêtres=' + spies.calls.asked.length + ' exports=' + spies.calls.pdf.length);
        else {
          const fields = sent[8];
          if (!fields || fields.version !== '1.7ext3' || fields.userPassword !== SETTINGS.password || fields.permissions.copying !== false || fields.permissions.printing !== 'highResolution' || fields.info.author !== 'Anne Durand' || !fields.ownerPassword) bad.push('champs reçus par le moteur=' + JSON.stringify(fields));
          if (sent[7] !== 'native') bad.push('qualité reçue=' + sent[7]);
        }
        if (!/PDF protégé généré/.test(statusText())) bad.push('état après l\'export=' + statusText());
        if (spies.calls.asked[0] && Object.keys(spies.calls.asked[0]).length) bad.push('la fenêtre d\'une ligne reçoit un contexte de lot : ' + JSON.stringify(spies.calls.asked[0]));
        // « Léger » suit ; « Impression navigateur » (grisée) ne s'applique pas.
        await pickQuality('light');
        await clickExport(spies);
        if (!spies.calls.pdf[1] || spies.calls.pdf[1][7] !== 'light') bad.push('qualité « Léger » reçue=' + (spies.calls.pdf[1] && spies.calls.pdf[1][7]));
        qualitySelect().value = 'browser-print';
        await clickExport(spies);
        if (!spies.calls.pdf[2] || spies.calls.pdf[2][7] !== 'native' || spies.calls.print !== 0) bad.push('avec « Impression navigateur » gardée : qualité=' + (spies.calls.pdf[2] && spies.calls.pdf[2][7]) + ' impressions=' + spies.calls.print);
        // Annuler : rien ne part.
        spies.restore();
        const cancelled = spyOnSingleExport(null);
        try {
          await clickExport(cancelled, () => cancelled.calls.asked.length === 1);
          if (cancelled.calls.asked.length !== 1 || cancelled.calls.pdf.length !== 0 || cancelled.calls.print !== 0) bad.push('Annuler a exporté : fenêtres=' + cancelled.calls.asked.length + ' exports=' + cancelled.calls.pdf.length);
          if (statusText() !== 'Export annulé.') bad.push('état après Annuler=' + statusText());
          if (document.getElementById('btn-export-pdf').style.pointerEvents === 'none') bad.push('bouton Exporter resté verrouillé après Annuler');
          // Un PDF ordinaire : pas de fenêtre, pas de champ.
          qualitySelect().value = 'native';
          await pickType('pdf');
          await clickExport(cancelled);
          const plainSent = cancelled.calls.pdf[0];
          if (cancelled.calls.asked.length !== 1 || !plainSent || plainSent[8] !== undefined) bad.push('un PDF ordinaire pose la fenêtre ou porte des champs : fenêtres=' + cancelled.calls.asked.length + ' champs=' + JSON.stringify(plainSent && plainSent[8]));
        } finally { cancelled.restore(); }
      } finally { spies.restore(); await reset(h); }
      return result(bad);
    },
  });

  cases.push({
    id: 'pdfprotect_zip_is_confirmed_by_the_dialog_and_every_pdf_is_encrypted_with_the_same_password',
    description: 'Toutes les lignes (ZIP) en « PDF protégé » : la fenêtre du mot de passe tient lieu de confirmation (aucune question « Générer… » en plus) et dit « 3 PDF protégés pour « table », regroupés dans une archive ZIP… » (« un par valeur de la table » dans une grille), l\'archive s\'appelle …-export-pdf-protege.zip, ses trois PDF demandent le mot de passe (accentué), l\'ouvrent avec lui et portent chacun le texte de leur ligne et l\'auteur ; l\'état de fin le dit ; Annuler ne génère ni ne télécharge rien',
    run: async (h) => {
      await seed(h);
      await reset(h);
      await setBody(`<p>Bonjour ${badge('Nom')}, voici votre courrier protégé.</p>`);
      const bad = [];
      const captured = captureDownloads();
      const dialogs = h.stubDialogs({ confirm: true });
      try {
        await pickType('pdfProtected');
        await pickLines('zip');
        // Annuler d'abord.
        document.getElementById('btn-export-pdf').click();
        if (!await waitDialog(true)) bad.push('la fenêtre ne s\'ouvre pas');
        else {
          const state = dialogState();
          if (state.intro !== '3 PDF protégés pour « ' + TABLE + ' », regroupés dans une archive ZIP avec le même mot de passe et les mêmes autorisations.') bad.push('phrase du lot=' + state.intro);
          if (state.ok !== 'Générer' || state.title !== 'PDF protégé') bad.push('titre et bouton du lot=' + state.title + ' / ' + state.ok);
          cancelButton().click();
          await sleep(500);
          if (captured.downloads.length || dialogs.asked.some(a => a.kind === 'confirm')) bad.push('Annuler a généré : fichiers=' + captured.downloads.length + ' questions=' + dialogs.asked.length);
          if (document.getElementById('btn-export-pdf').style.pointerEvents === 'none') bad.push('bouton Exporter resté verrouillé après Annuler');
        }
        await closeDialog();
        // Puis valider avec un mot de passe et une propriété.
        document.getElementById('btn-export-pdf').click();
        if (!await waitDialog(true)) bad.push('la fenêtre ne s\'ouvre pas la seconde fois');
        else {
          typeInto(field('pp-protect-password'), SETTINGS.password);
          typeInto(field('pp-protect-author'), 'Anne Durand');
          okButton().click();
          for (let i = 0; i < 600 && !captured.downloads.length; i++) await sleep(100);
          await sleep(100);
        }
        const download = captured.downloads[0];
        if (captured.downloads.length !== 1 || !download || download.name !== TABLE + '-export-pdf-protege.zip') bad.push('fichiers=' + JSON.stringify(captured.downloads.map(d => d.name)));
        if (dialogs.asked.some(a => a.kind === 'confirm')) bad.push('une confirmation « Générer… » est posée en plus de la fenêtre : ' + JSON.stringify(dialogs.asked.filter(a => a.kind === 'confirm').map(a => a.message)));
        if (statusText() !== '3 PDF protégés générés — archive ZIP téléchargée.') bad.push('état de fin=' + statusText());
        if (download && download.blob) {
          const zip = await JSZip.loadAsync(await download.blob.arrayBuffer());
          const files = Object.keys(zip.files).sort();
          if (!same(files, ['publipostage (2).pdf', 'publipostage (3).pdf', 'publipostage.pdf'])) bad.push('contenu de l\'archive=' + JSON.stringify(files));
          const wanted = { 'publipostage.pdf': NAMES[0], 'publipostage (2).pdf': NAMES[1], 'publipostage (3).pdf': NAMES[2] };
          for (const name of files) {
            const blob = await zip.file(name).async('blob');
            const without = await openPdf(h, blob);
            const wrong = await openPdf(h, blob, 'pas le bon');
            const right = await openPdf(h, blob, SETTINGS.password);
            if (without.error !== 'PasswordException:1' || wrong.error !== 'PasswordException:2') bad.push(name + ' : sans mot de passe=' + (without.error || 'ouvert') + ', mauvais=' + (wrong.error || 'ouvert'));
            else if (!right.pdf) bad.push(name + ' : le mot de passe n\'ouvre pas le fichier (' + right.error + ')');
            else {
              if (!squash(await textOf(right.pdf)).includes(squash(wanted[name]))) bad.push(name + ' : texte=' + (await textOf(right.pdf)).slice(0, 50));
              if ((await right.pdf.getMetadata()).info.Author !== 'Anne Durand') bad.push(name + ' : auteur absent');
            }
          }
        }
        // Dans une grille, la phrase parle des valeurs de la table.
        await enterGrid(h);
        await pickType('pdfProtected');
        await pickLines('zip');
        document.getElementById('btn-export-pdf').click();
        if (await waitDialog(true)) {
          const intro = dialogState().intro;
          if (!/^\d+ PDF protégés?, un par valeur de « /.test(intro)) bad.push('phrase du lot d\'une grille=' + intro);
          cancelButton().click();
          await sleep(300);
        } else bad.push('la fenêtre d\'une grille ne s\'ouvre pas');
      } finally { await closeDialog(); captured.restore(); dialogs.restore(); await reset(h); }
      return result(bad);
    },
  });

  cases.push({
    id: 'pdfprotect_one_row_with_several_documents_asks_once_and_zips_protected_pdfs',
    description: 'Une ligne qui sort en plusieurs documents (liste réglée « Un document par valeur ») exportée en « PDF protégé » : la fenêtre n\'est posée qu\'une fois et l\'archive ZIP contient un PDF par valeur, chacun chiffré avec le mot de passe',
    run: async (h) => {
      await seed(h);
      await reset(h);
      await setBody(`<p>Bonjour ${badge('Nom')} ${listBadge('Themes')}</p>`);
      const bad = [];
      const captured = captureDownloads();
      const dialogs = h.stubDialogs({ confirm: true });
      let asks = 0;
      const realOpen = PdfProtectionDialog.open;
      PdfProtectionDialog.open = function () { asks++; return realOpen.apply(this, arguments); };
      try {
        await pickType('pdfProtected');
        document.getElementById('btn-export-pdf').click();
        if (!await waitDialog(true)) bad.push('la fenêtre ne s\'ouvre pas');
        else {
          typeInto(field('pp-protect-password'), 'ouvre-toi');
          okButton().click();
          for (let i = 0; i < 600 && !captured.downloads.length; i++) await sleep(100);
          await sleep(100);
        }
        if (asks !== 1) bad.push('fenêtres posées=' + asks);
        const download = captured.downloads[0];
        if (captured.downloads.length !== 1 || !download || !/\.zip$/.test(download.name)) bad.push('fichiers=' + JSON.stringify(captured.downloads.map(d => d.name)));
        else {
          const zip = await JSZip.loadAsync(await download.blob.arrayBuffer());
          const files = Object.keys(zip.files);
          if (files.length !== THEMES.length || !files.every(name => /\.pdf$/.test(name))) bad.push('contenu de l\'archive=' + JSON.stringify(files));
          for (const name of files) {
            const blob = await zip.file(name).async('blob');
            const without = await openPdf(h, blob);
            const right = await openPdf(h, blob, 'ouvre-toi');
            if (without.error !== 'PasswordException:1' || !right.pdf) bad.push(name + ' : sans mot de passe=' + (without.error || 'ouvert') + ', avec=' + (right.pdf ? 'ouvert' : right.error));
          }
        }
        if (statusText() !== '3 PDF protégés générés — archive ZIP téléchargée.') bad.push('état de fin=' + statusText());
      } finally { PdfProtectionDialog.open = realOpen; await closeDialog(); captured.restore(); dialogs.restore(); await reset(h); }
      return result(bad);
    },
  });

  cases.push({
    id: 'pdfprotect_dialog_rules_validation_keys_storage_and_texts',
    description: 'La fenêtre « PDF protégé » : au départ imprimer et copier cochés, modifier décoché, « Exporter » libre, le champ du mot de passe a le focus ; tout permis sans mot de passe grise « Exporter » et dit pourquoi (rôle « status ») ; Entrée valide depuis un champ (pas sans protection), Échap et Annuler rendent null, une seconde demande annule la première ; « Afficher » démasque le mot de passe ; le mot de passe est coupé à 127 octets à la frappe, n\'est gardé nulle part (ni stockage du navigateur, ni champ à la réouverture) alors que les droits et l\'auteur le sont, pas le sujet ni les mots-clés ; la phrase du lot (pluriel, grille) et les textes en français et en anglais',
    run: async () => {
      const bad = [];
      const STORAGE = PdfProtectionDialog.STORAGE;
      const storageDump = () => JSON.stringify([Object.keys(localStorage).map(key => [key, localStorage.getItem(key)]), Object.keys(sessionStorage).map(key => [key, sessionStorage.getItem(key)])]);
      const SECRET = 'mdp-9Zq-secret';
      localStorage.removeItem(STORAGE);
      try {
        // Au départ.
        let outcome;
        let answered = false;
        const ask = ctx => { answered = false; return PdfProtectionDialog.open(ctx).then(value => { answered = true; outcome = value; }); };
        let pending = ask({});
        if (!await waitDialog(true)) { bad.push('la fenêtre ne s\'ouvre pas'); return result(bad); }
        let state = dialogState();
        if (!same(state, { title: 'PDF protégé', intro: '', passwordLabel: 'Mot de passe pour ouvrir le PDF', passwordType: 'password', password: '', print: true, copy: true, modify: false, ok: 'Exporter', okDisabled: false, cancel: 'Annuler', nothing: '', focus: true })) bad.push('état de départ=' + JSON.stringify(state));
        if (field('pp-protect-password').autocomplete !== 'new-password') bad.push('le champ du mot de passe se laisse remplir par le navigateur : ' + field('pp-protect-password').autocomplete);
        // Tout permis, sans mot de passe : rien n'est protégé.
        tick(field('pp-protect-modify'), true);
        state = dialogState();
        if (!state.okDisabled || state.nothing !== 'Rien n’est protégé : choisir un mot de passe ou retirer une autorisation.' || field('pp-protect-nothing').getAttribute('role') !== 'status') bad.push('rien n\'est protégé : ' + JSON.stringify({ disabled: state.okDisabled, nothing: state.nothing }));
        press(field('pp-protect-password'), 'Enter');
        await sleep(60);
        if (answered || !dialogOpen()) bad.push('Entrée a validé sans rien protéger');
        // Un mot de passe de plus : « Exporter » se libère.
        typeInto(field('pp-protect-password'), SECRET);
        state = dialogState();
        if (state.okDisabled || state.nothing) bad.push('avec un mot de passe : ' + JSON.stringify({ disabled: state.okDisabled, nothing: state.nothing }));
        // Afficher, masquer.
        tick(field('pp-protect-show'), true);
        if (field('pp-protect-password').type !== 'text') bad.push('« Afficher » ne démasque pas');
        tick(field('pp-protect-show'), false);
        if (field('pp-protect-password').type !== 'password') bad.push('décocher « Afficher » ne remasque pas');
        // Les propriétés dans le groupe replié (une tabulation vaut une espace, les espaces autour tombent).
        if (dialogEl().querySelector('details').open) bad.push('le groupe des propriétés est ouvert au départ');
        typeInto(field('pp-protect-author'), ' Anne\tDurand ');
        typeInto(field('pp-protect-subject'), 'Sujet-9Zq');
        typeInto(field('pp-protect-keywords'), 'a, b');
        // Entrée valide depuis un champ.
        press(field('pp-protect-password'), 'Enter');
        await pending;
        if (!answered || !same(outcome, { password: SECRET, allowPrint: true, allowCopy: true, allowModify: true, author: 'Anne Durand', subject: 'Sujet-9Zq', keywords: 'a, b' })) bad.push('réglages rendus=' + JSON.stringify(outcome));
        if (dialogOpen()) bad.push('la fenêtre reste ouverte après Entrée');
        if (field('pp-protect-password').value !== '') bad.push('le mot de passe reste dans le champ après la fenêtre');
        // Ce qui est gardé : les trois droits et l'auteur, rien d'autre ; le mot de passe et le sujet nulle part.
        const saved = JSON.parse(localStorage.getItem(STORAGE) || 'null');
        if (!same(saved, { allowPrint: true, allowCopy: true, allowModify: true, author: 'Anne Durand' })) bad.push('gardé dans le navigateur=' + JSON.stringify(saved));
        if (storageDump().includes(SECRET) || storageDump().includes('Sujet-9Zq')) bad.push('le mot de passe ou le sujet est dans le stockage du navigateur');
        // Réouverture : les droits et l'auteur reviennent, le mot de passe, le sujet et les mots-clés non ; le champ est masqué.
        pending = ask({});
        await waitDialog(true);
        state = dialogState();
        if (state.password !== '' || state.passwordType !== 'password' || !state.print || !state.copy || !state.modify || field('pp-protect-author').value !== 'Anne Durand' || field('pp-protect-subject').value !== '' || field('pp-protect-keywords').value !== '') bad.push('réouverture=' + JSON.stringify({ state, author: field('pp-protect-author').value, subject: field('pp-protect-subject').value }));
        // Un mot de passe trop long pour 127 octets : le champ refuse la frappe au-delà, ce qu'on voit est ce qui ouvre le fichier.
        typeInto(field('pp-protect-password'), 'é'.repeat(100));
        if (field('pp-protect-password').value !== 'é'.repeat(63)) bad.push('mot de passe de 100 accents gardé à ' + field('pp-protect-password').value.length + ' caractères');
        typeInto(field('pp-protect-password'), 'a'.repeat(125) + '😀😀');
        if (field('pp-protect-password').value !== 'a'.repeat(125) || hasLoneSurrogate(field('pp-protect-password').value)) bad.push('un emoji coupé en deux dans le champ : ' + field('pp-protect-password').value.length + ' unités');
        // Échap rend null et vide le champ.
        press(field('pp-protect-password'), 'Escape');
        await pending;
        if (outcome !== null || dialogOpen()) bad.push('Échap : ' + JSON.stringify(outcome) + ' / ouverte=' + dialogOpen());
        if (field('pp-protect-password').value !== '') bad.push('le mot de passe reste dans le champ après Échap');
        // Annuler rend null.
        pending = ask({});
        await waitDialog(true);
        cancelButton().click();
        await pending;
        if (outcome !== null || dialogOpen()) bad.push('Annuler : ' + JSON.stringify(outcome));
        // Une seconde demande pendant la première annule la première et prend sa place.
        const first = PdfProtectionDialog.open({});
        await waitDialog(true);
        const second = PdfProtectionDialog.open({ batch: true, count: 2, table: 'T' });
        if (await first !== null) bad.push('une seconde demande n\'annule pas la première');
        if (!dialogOpen() || !/^2 PDF protégés pour « T »/.test(dialogState().intro)) bad.push('la seconde demande n\'est pas affichée : ' + (dialogOpen() ? dialogState().intro : 'fermée'));
        cancelButton().click();
        if (await second !== null) bad.push('Annuler sur la seconde demande ne rend pas null');
        // La phrase du lot : le pluriel suit le nombre, la grille parle de ses valeurs, dans les deux langues.
        const introOf = (lang, context) => inLang(lang, async () => {
          const run = PdfProtectionDialog.open(context);
          await waitDialog(true);
          const text = dialogState().intro;
          const hidden = field('pp-protect-intro').hidden;
          cancelButton().click();
          await run;
          return hidden ? '(masquée)' : text;
        });
        const ZIP_FR = 'regroupés dans une archive ZIP avec le même mot de passe et les mêmes autorisations.';
        const ZIP_EN = 'bundled in a ZIP archive with the same password and the same permissions.';
        const wanted = [
          ['fr', { batch: true, count: 2, table: 'Clients' }, '2 PDF protégés pour « Clients », ' + ZIP_FR],
          ['fr', { batch: true, count: 1, table: 'Clients' }, '1 PDF protégé pour « Clients », regroupé dans une archive ZIP avec le même mot de passe et les mêmes autorisations.'],
          ['fr', { batch: true, count: 3, table: 'Clients', grid: true }, '3 PDF protégés, un par valeur de « Clients », ' + ZIP_FR],
          ['en', { batch: true, count: 2, table: 'Clients' }, '2 protected PDFs for “Clients”, ' + ZIP_EN],
          ['en', { batch: true, count: 1, table: 'Clients' }, '1 protected PDF for “Clients”, ' + ZIP_EN],
          ['en', { batch: true, count: 3, table: 'Clients', grid: true }, '3 protected PDFs, one per value of “Clients”, ' + ZIP_EN],
          ['fr', {}, '(masquée)'],
        ];
        for (const [lang, context, want] of wanted) {
          const got = await introOf(lang, context);
          if (got !== want) bad.push('phrase (' + lang + ', ' + JSON.stringify(context) + ')=' + got);
        }
        // Les textes anglais de la fenêtre, et l'avertissement quand rien n'est protégé.
        await inLang('en', async () => {
          localStorage.removeItem(STORAGE);
          const run = PdfProtectionDialog.open({ batch: true, count: 2, table: 'Clients' });
          await waitDialog(true);
          const en = dialogState();
          const labels = ['pp-protect-print', 'pp-protect-copy', 'pp-protect-modify'].map(id => field(id).closest('label').textContent.trim());
          if (en.title !== 'Protected PDF' || en.passwordLabel !== 'Password to open the PDF' || en.ok !== 'Generate' || en.cancel !== 'Cancel' || !same(labels, ['Print', 'Copy text and images', 'Edit or annotate'])) bad.push('textes anglais=' + JSON.stringify({ en, labels }));
          tick(field('pp-protect-modify'), true);
          if (dialogState().nothing !== 'Nothing is protected: set a password or remove a permission.') bad.push('avertissement anglais=' + dialogState().nothing);
          cancelButton().click();
          await run;
        });
      } finally { await closeDialog(); localStorage.removeItem(STORAGE); }
      return result(bad);
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.pdfProtection = cases;
})();
