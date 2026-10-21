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
//  7) la fenêtre : « Exporter » grisé tant que rien n'est protégé, Entrée, Échap, Annuler, mot de passe jamais gardé et coupé à 127 octets, droits et auteur gardés, textes français et anglais ;
//  8) les trois façons de donner le mot de passe (demande d'Antoine du 12/10, « laisser 3 choix à l'utilisateur ») : « saisi à chaque export » (le conseillé, gardé nulle part), « le même pour
//     tous, enregistré dans le document » (relu à l'ouverture, écrit AVANT l'export et seulement s'il change, où il est écrit et le risque dits, compte en lecture seule, document illisible,
//     écriture refusée, lecture tardive ignorée, jamais dans le navigateur) et « un par ligne, lu dans une colonne » (la liste avec recherche ne propose que les colonnes qui peuvent en donner un,
//     le risque dit, la colonne et sa table gardées) ; le module (types de colonne, valeur d'une cellule, réglages d'une ligne, erreur qui dit pourquoi) ; le PDF d'une ligne et le ZIP : chaque PDF
//     s'ouvre avec le mot de passe de SA ligne et avec aucun autre, une cellule inutilisable fait échouer sa ligne seule (jamais un PDF sans mot de passe) et la fin du lot la liste ; le mot de
//     passe commun écrit dans le vrai stockage (js/templates.js sur le faux Grist) et retrouvé par la fenêtre suivante.
//  9) la fenêtre est la même d'une fois à l'autre : rouverte, les propriétés sont repliées et le contenu est revenu en haut (les trois façons de donner le mot de passe en vue).
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
      mode: (dialogEl().querySelector('input[name="pp-protect-mode"]:checked') || {}).value,
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
      if (!same(defaults, { mode: 'typed', password: '', passwordColumn: '', allowPrint: true, allowCopy: true, allowModify: false, author: '', subject: '', keywords: '' })) bad.push('réglages d\'origine=' + JSON.stringify(defaults));
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
        // Les raisons, dites en anglais au survol suivant (le nom des lignes est écrit dans la langue de la page : cas « Export type » en anglais, groupe exportType).
        const english = await inLang('en', async () => {
          hover();
          return { quality: qualityRow('browser-print').title, lines: linesRow('merged').title, wantQuality: I18n.t('quality.protectedOff'), wantLines: I18n.t('exportLines.protectedOff') };
        });
        if (english.quality !== english.wantQuality || english.lines !== english.wantLines || !/^Not available/.test(english.quality) || !/^Not available/.test(english.lines)) bad.push('info-bulles en anglais=' + JSON.stringify(english));
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
        if (!same(spies.calls.asked[0], { table: TABLE })) bad.push('la fenêtre d\'une ligne reçoit autre chose que sa table : ' + JSON.stringify(spies.calls.asked[0]));
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
      const SECRET = 'stub-token-mdp-9Zq';
      localStorage.removeItem(STORAGE);
      try {
        // Au départ.
        let outcome;
        let answered = false;
        const ask = ctx => { answered = false; return PdfProtectionDialog.open(ctx).then(value => { answered = true; outcome = value; }); };
        let pending = ask({});
        if (!await waitDialog(true)) { bad.push('la fenêtre ne s\'ouvre pas'); return result(bad); }
        let state = dialogState();
        if (!same(state, { title: 'PDF protégé', mode: 'typed', intro: '', passwordLabel: 'Mot de passe pour ouvrir le PDF', passwordType: 'password', password: '', print: true, copy: true, modify: false, ok: 'Exporter', okDisabled: false, cancel: 'Annuler', nothing: '', focus: true })) bad.push('état de départ=' + JSON.stringify(state));
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
        if (!answered || !same(outcome, { mode: 'typed', password: SECRET, passwordColumn: '', allowPrint: true, allowCopy: true, allowModify: true, author: 'Anne Durand', subject: 'Sujet-9Zq', keywords: 'a, b' })) bad.push('réglages rendus=' + JSON.stringify(outcome));
        if (dialogOpen()) bad.push('la fenêtre reste ouverte après Entrée');
        if (field('pp-protect-password').value !== '') bad.push('le mot de passe reste dans le champ après la fenêtre');
        // Ce qui est gardé : les trois droits et l'auteur, rien d'autre ; le mot de passe et le sujet nulle part.
        const saved = JSON.parse(localStorage.getItem(STORAGE) || 'null');
        if (!same(saved, { mode: 'typed', allowPrint: true, allowCopy: true, allowModify: true, author: 'Anne Durand', passwordTable: '', passwordColumn: '' })) bad.push('gardé dans le navigateur=' + JSON.stringify(saved));
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

  // --- Les trois façons de donner le mot de passe (demande d'Antoine du 12/10 : « laisser 3 choix à l'utilisateur ») ---
  const MODES = ['typed', 'stored', 'column'];
  const STORAGE = 'pp_pdf_protection';
  // Une table de tous les genres de colonnes : seules celles qui peuvent donner un mot de passe (texte, choix, nombre, « Tout ») se proposent.
  const PW_COLUMNS = { Nom: 'Text', Themes: 'ChoiceList', Mdp: 'Text', Code: 'Int', Prix: 'Numeric', Ville: 'Choice', Libre: 'Any', Naissance: 'Date', Actif: 'Bool' };
  const PW_CANDIDATES = ['Nom', 'Mdp', 'Code', 'Prix', 'Ville', 'Libre'];
  // Le contenu de la colonne « Mdp », ligne par ligne : un mot de passe accentué, un autre entouré d'espaces, une cellule vide, une trop longue, un dernier ordinaire.
  const PW_CELLS = { 1: 'stub-token-alpha \u00e9', 2: '  stub-token-beta  ', 3: '', 4: 'x'.repeat(130), 5: 'stub-token-echo' };

  const radio = mode => field('pp-protect-mode-' + mode);
  const pickMode = async mode => { radio(mode).click(); await sleep(40); };
  const shownIn = id => field(id).closest('[hidden]') === null;
  const storageDump = () => JSON.stringify([Object.keys(localStorage).map(key => [key, localStorage.getItem(key)]), Object.keys(sessionStorage).map(key => [key, sessionStorage.getItem(key)])]);
  const flat = text => String(text).replace(/\s+/g, ' ').trim();
  // Ce que la fenêtre montre dans le mode « le même pour tous ».
  const storedView = () => ({
    typed: shownIn('pp-protect-panel-typed'), stored: shownIn('pp-protect-panel-stored'), column: shownIn('pp-protect-panel-column'),
    value: field('pp-protect-stored').value, type: field('pp-protect-stored').type, disabled: field('pp-protect-stored').disabled, readOnly: field('pp-protect-stored').readOnly,
    status: field('pp-protect-stored-status').hidden ? '' : field('pp-protect-stored-status').textContent,
    where: field('pp-protect-where').textContent, risk: flat(field('pp-protect-stored-risk').textContent),
    error: field('pp-protect-error').hidden ? '' : field('pp-protect-error').textContent,
    ok: okButton().textContent, okDisabled: okButton().disabled,
  });
  // Ce que la fenêtre montre dans le mode « un par ligne ».
  const columnView = () => ({
    typed: shownIn('pp-protect-panel-typed'), stored: shownIn('pp-protect-panel-stored'), column: shownIn('pp-protect-panel-column'),
    options: Array.from(field('pp-protect-column').options).map(option => option.value), value: field('pp-protect-column').value, disabled: field('pp-protect-column').disabled,
    label: dialogEl().querySelector('label[for="pp-protect-column"]').textContent, hint: field('pp-protect-column-hint').textContent, risk: flat(field('pp-protect-column-risk').textContent),
    nothing: field('pp-protect-nothing').hidden ? '' : field('pp-protect-nothing').textContent, okDisabled: okButton().disabled, intro: field('pp-protect-intro').hidden ? '' : field('pp-protect-intro').textContent,
  });
  const chooseColumn = async column => { const select = field('pp-protect-column'); select.value = column; select.dispatchEvent(new Event('change', { bubbles: true })); await sleep(40); };

  // Le mot de passe du document remplacé par un faux qu'on tient à la main : ce que la fenêtre lit et écrit, quand, et si Grist l'accepte. `holds` : des promesses que les lectures
  // attendent, une par lecture ; la lecture garde le mot de passe d'avant son attente.
  function fakeStore(initial) {
    const log = { reads: 0, writes: [] };
    const state = { password: initial === undefined ? '' : initial, readOk: true, writeOk: true, writeDelay: 0, holds: [] };
    const orig = { read: Templates.readPdfPassword, write: Templates.writePdfPassword };
    Templates.readPdfPassword = async () => {
      log.reads++;
      const snapshot = state.password;
      const held = state.holds.shift();
      if (held) await held;
      return state.readOk ? { ok: true, password: snapshot } : { ok: false, password: '' };
    };
    Templates.writePdfPassword = async value => {
      log.writes.push(value);
      if (state.writeDelay) await sleep(state.writeDelay);
      if (!state.writeOk) return false;
      state.password = value;
      return true;
    };
    return { log, state, restore() { Templates.readPdfPassword = orig.read; Templates.writePdfPassword = orig.write; } };
  }

  // La table des mots de passe : trois lignes ou plus, la colonne « Mdp » remplie ligne par ligne ; la ligne affichée (grist.onRecord) ne porte PAS la colonne « Mdp ».
  async function seedPasswords(h, cells) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables(TABLE, PW_COLUMNS, { Ville: ['Paris', 'Lyon'] });
    const ids = Object.keys(cells || PW_CELLS).map(Number);
    const given = cells || PW_CELLS;
    const rowOf = id => ({ id, Nom: 'Client' + id, Themes: THEMES, Mdp: given[id], Code: 4200 + id, Prix: id + 0.5, Ville: 'Paris', Libre: 'libre-' + id, Naissance: null, Actif: false });
    stub.setRows(TABLE, ids.map(rowOf));
    await GristAPI.refreshSchema();
    stub.fireRecord({ id: ids[0], Nom: 'Client' + ids[0], Themes: THEMES }, TABLE);
    await sleep(50);
    Editor.setHTML(`<p>Bonjour ${badge('Nom')}, voici votre courrier protégé.</p>`);
    Editor.setHeaderFooterData(NO_HF);
    await sleep(80);
    return ids;
  }
  const fireRow = async id => { window.__gristStub.fireRecord({ id, Nom: 'Client' + id, Themes: THEMES }, TABLE); await sleep(60); };

  cases.push({
    id: 'pdfprotect_module_modes_row_passwords_and_column_types',
    description: 'PdfProtection, les trois modes : un mode inconnu vaut « saisi » ; le mot de passe d\'un mode « un par ligne » reste vide (chaque ligne a le sien) et protège dès qu\'une colonne est choisie, quels que soient les droits ; les types de colonne qui peuvent en donner un (texte, choix, nombre, « Tout ») et ceux qui n\'en donnent pas (dates, cases, références, listes, pièces jointes) ; ce qu\'une cellule vaut (texte sans espaces autour et sous forme composée, nombre écrit tel qu\'il est, vide, ni texte ni nombre, plus de 127 octets : jamais coupé) ; les réglages d\'UNE ligne, l\'erreur qui dit pourquoi et quelle colonne ; docFields refuse les réglages d\'un lot « un par ligne » tels quels.',
    run: async () => {
      const bad = [];
      const P = PdfProtection;
      // Les modes.
      if (!same(P.MODES, MODES)) bad.push('modes=' + JSON.stringify(P.MODES));
      const odd = P.normalize({ mode: 'secret', password: 'x' });
      if (odd.mode !== 'typed' || odd.password !== 'x') bad.push('mode inconnu=' + JSON.stringify(odd));
      const perRow = P.normalize({ mode: 'column', password: 'stub-token-ne-sert-pas', passwordColumn: 'Mdp' });
      if (perRow.mode !== 'column' || perRow.password !== '' || perRow.passwordColumn !== 'Mdp') bad.push('un par ligne=' + JSON.stringify(perRow));
      if (P.normalize({ passwordColumn: 'C'.repeat(300) }).passwordColumn.length !== 200 || P.normalize({ passwordColumn: 12 }).passwordColumn !== '') bad.push('colonne mal formée');
      if (P.normalize({ mode: 'stored', password: 'a'.repeat(200) }).password.length !== 127) bad.push('mot de passe enregistré non coupé à 127 octets');
      // Ce qui protège.
      [
        [{ mode: 'column' }, false], [{ mode: 'column', passwordColumn: 'Mdp' }, true], [{ mode: 'column', passwordColumn: 'Mdp', allowModify: true }, true],
        [{ mode: 'column', allowPrint: false }, false], [{ mode: 'stored', allowModify: true }, false], [{ mode: 'stored', password: 'x', allowModify: true }, true], [{ mode: 'stored' }, true],
      ].forEach(([given, want]) => { if (P.protects(given) !== want) bad.push('protects(' + JSON.stringify(given) + ')=' + !want); });
      // Les types de colonne.
      ['Text', 'Choice', 'Numeric', 'Int', 'Any'].forEach(type => { if (!P.isPasswordColumnType(type)) bad.push(type + ' refusé'); });
      ['Date', 'DateTime:Europe/Paris', 'Bool', 'Ref:Clients', 'RefList:Clients', 'ChoiceList', 'Attachments', '', null, undefined].forEach(type => { if (P.isPasswordColumnType(type)) bad.push(JSON.stringify(type) + ' accepté'); });
      // Ce qu'une cellule vaut.
      const cell = [
        ['abc', { password: 'abc' }], ['  abc \n', { password: 'abc' }], ['stub-token a b  c', { password: 'stub-token a b  c' }], ['é', { password: 'é' }], [12345, { password: '12345' }], [0, { password: '0' }],
        [1.5, { password: '1.5' }], [-3, { password: '-3' }], ['', { problem: 'empty' }], ['   \t', { problem: 'empty' }], [null, { problem: 'empty' }], [undefined, { problem: 'empty' }],
        [NaN, { problem: 'type' }], [Infinity, { problem: 'type' }], [true, { problem: 'type' }], [['L', 'a'], { problem: 'type' }], [{}, { problem: 'type' }], [['E', 'NameError'], { problem: 'type' }],
        ['é'.repeat(63), { password: 'é'.repeat(63) }], ['é'.repeat(64), { problem: 'tooLong' }], ['a'.repeat(127), { password: 'a'.repeat(127) }], ['a'.repeat(128), { problem: 'tooLong' }],
        ['😀'.repeat(31), { password: '😀'.repeat(31) }], ['😀'.repeat(32), { problem: 'tooLong' }],
      ];
      cell.forEach(([given, want]) => { const got = P.passwordFromCell(given); if (!same(got, want)) bad.push('cellule ' + JSON.stringify(given).slice(0, 24) + ' → ' + JSON.stringify(got).slice(0, 60)); });
      // Les réglages d'une ligne : les modes « saisi » et « enregistré » valent pour toutes, tels quels.
      const typed = P.normalize({ mode: 'typed', password: 'stub-token-saisi', allowCopy: false });
      if (!same(P.settingsForRow(typed, { Mdp: 'autre' }), typed)) bad.push('un mot de passe saisi change d\'une ligne à l\'autre');
      const stored = P.normalize({ mode: 'stored', password: 'stub-token-commun' });
      if (!same(P.settingsForRow(stored, null), stored)) bad.push('un mot de passe enregistré change d\'une ligne à l\'autre');
      // « Un par ligne » : le mot de passe de la cellule, les droits et propriétés gardés, le mode devient « saisi » (le mot de passe est posé).
      const column = P.normalize({ mode: 'column', passwordColumn: 'Mdp', allowCopy: false, author: 'Anne' });
      const first = P.settingsForRow(column, { id: 1, Mdp: '  stub-token-un ', Autre: 'x' });
      if (first.mode !== 'typed' || first.password !== 'stub-token-un' || first.allowCopy !== false || first.author !== 'Anne' || first.passwordColumn !== 'Mdp') bad.push('réglages de la ligne 1=' + JSON.stringify(first));
      if (column.password !== '' || column.mode !== 'column') bad.push('les réglages du lot ont été modifiés : ' + JSON.stringify(column));
      const second = P.settingsForRow(column, { id: 2, Mdp: 'stub-token-deux' });
      if (second.password !== 'stub-token-deux') bad.push('réglages de la ligne 2=' + JSON.stringify(second));
      // Les erreurs : le problème et la colonne.
      [
        [{ id: 1, Mdp: '' }, 'empty'], [{ id: 1, Mdp: '   ' }, 'empty'], [{ id: 1, Mdp: null }, 'empty'], [{ id: 1, Mdp: true }, 'type'], [{ id: 1, Mdp: 'a'.repeat(128) }, 'tooLong'],
        [{ id: 1 }, 'missing'], [null, 'missing'], [undefined, 'missing'], ['pas une ligne', 'missing'],
      ].forEach(([row, problem]) => {
        let error = null;
        try { P.settingsForRow(column, row); } catch (e) { error = e; }
        if (!error || error.passwordProblem !== problem || error.column !== 'Mdp' || !/Mdp/.test(error.message)) bad.push('ligne ' + JSON.stringify(row) + ' : ' + (error ? error.passwordProblem + '/' + error.column : 'aucune erreur'));
      });
      let none = null;
      try { P.settingsForRow(P.normalize({ mode: 'column' }), { Mdp: 'x' }); } catch (e) { none = e.passwordProblem; }
      if (none !== 'missing') bad.push('sans colonne choisie : ' + none);
      // docFields : les réglages d'un lot « un par ligne » tels quels sont refusés (jamais des PDF sans le mot de passe attendu) ; ceux d'une ligne passent, chacun avec son mot de passe propriétaire.
      let refused = null;
      try { P.docFields(column); } catch (e) { refused = e.message; }
      if (!refused || !/par ligne/.test(refused)) bad.push('docFields accepte un lot « un par ligne » : ' + refused);
      const fieldsOne = P.docFields(first);
      const fieldsTwo = P.docFields(second);
      if (fieldsOne.userPassword !== 'stub-token-un' || fieldsTwo.userPassword !== 'stub-token-deux' || fieldsOne.ownerPassword === fieldsTwo.ownerPassword || fieldsOne.version !== '1.7ext3' || fieldsOne.permissions.copying !== false) bad.push('champs par ligne=' + JSON.stringify([fieldsOne, fieldsTwo]));
      return result(bad);
    },
  });

  cases.push({
    id: 'pdfprotect_dialog_three_modes_and_the_password_saved_in_the_document',
    description: 'La fenêtre « PDF protégé » à trois choix : « Saisi à chaque export (recommandé) » au départ, un bloc par choix ; « Le même pour tous, enregistré dans le document » relit le mot de passe du document (champ grisé et « Exporter » grisé le temps de la lecture, une seule lecture par ouverture), nomme la table, la colonne et la ligne et dit le risque ; inchangé, rien n\'est écrit ; changé, il est écrit AVANT de rendre les réglages (« Enregistrement… ») ; refusé, la fenêtre reste ouverte et le dit, rien n\'est exporté ; document illisible ou mot de passe enregistré trop long : dit, champ libre, un champ vide n\'efface rien ; compte en lecture seule : champ en lecture seule, rien d\'écrit ; une lecture qui revient après la fermeture est ignorée ; le mot de passe saisi et celui du document sont deux champs ; le mode est gardé par navigateur, jamais un mot de passe ; textes anglais.',
    run: async () => {
      const bad = [];
      const store = fakeStore('stub-token-du-document');
      const stub = window.__gristStub;
      localStorage.removeItem(STORAGE);
      try {
        let outcome;
        let answered = false;
        const ask = ctx => { answered = false; return PdfProtectionDialog.open(ctx).then(value => { answered = true; outcome = value; }); };
        // Rend { run } et non la promesse : une fonction async qui rendrait la promesse de la fenêtre attendrait sa fermeture.
        const reopen = async () => { const run = ask({ table: TABLE }); await waitDialog(true); await sleep(60); return { run }; };
        const settingsOf = (mode, password) => ({ mode, password, passwordColumn: '', allowPrint: true, allowCopy: true, allowModify: false, author: '', subject: '', keywords: '' });

        // Au départ : le mode conseillé, un seul bloc, rien de lu dans le document.
        let pending = ask({ table: TABLE });
        if (!await waitDialog(true)) { bad.push('la fenêtre ne s\'ouvre pas'); return result(bad); }
        const labels = MODES.map(mode => radio(mode).closest('label').textContent.trim());
        if (!same(labels, ['Saisi à chaque export (recommandé)', 'Le même pour tous, enregistré dans le document', 'Un par ligne, lu dans une colonne'])) bad.push('libellés des modes=' + JSON.stringify(labels));
        const legend = dialogEl().querySelector('fieldset.pp-protect-modes legend');
        if (!legend || legend.textContent !== 'Mot de passe du PDF' || !MODES.every(mode => radio(mode).name === 'pp-protect-mode' && radio(mode).type === 'radio')) bad.push('le choix du mode n\'est pas un groupe de boutons radio nommé');
        if (!same(MODES.filter(mode => radio(mode).checked), ['typed']) || !shownIn('pp-protect-panel-typed') || shownIn('pp-protect-panel-stored') || shownIn('pp-protect-panel-column')) bad.push('départ : modes cochés=' + MODES.filter(mode => radio(mode).checked) + ' blocs=' + JSON.stringify(storedView()));
        if (store.log.reads !== 0) bad.push('le document est lu sans que « enregistré » soit choisi : ' + store.log.reads);
        if (!/^Il n’est enregistré nulle part\./.test(field('pp-protect-password-hint').textContent)) bad.push('l\'aide du mot de passe saisi=' + field('pp-protect-password-hint').textContent);

        // « Le même pour tous » : la lecture part ; le champ et « Exporter » attendent.
        let release;
        store.state.holds.push(new Promise(resolve => { release = resolve; }));
        await pickMode('stored');
        let view = storedView();
        if (!view.stored || view.typed || view.column || !view.disabled || view.status !== 'Lecture du mot de passe enregistré…' || !view.okDisabled || store.log.reads !== 1) bad.push('pendant la lecture=' + JSON.stringify(view));
        release();
        await sleep(60);
        view = storedView();
        if (view.value !== 'stub-token-du-document' || view.type !== 'password' || view.disabled || view.readOnly || view.status !== '' || view.okDisabled) bad.push('après la lecture=' + JSON.stringify(view));
        if (view.where !== 'Enregistré dans la table « Publipostage_Modeles », colonne « MotDePassePdf » (« Mot de passe des PDF protégés »), ligne « Réglages du document ».') bad.push('où il est enregistré=' + view.where);
        if (!view.risk.startsWith('Risque : ce mot de passe est écrit en clair dans le document.') || !/Toute personne qui l’ouvre peut le lire, sauf si des permissions avancées de Grist en réservent l’accès\./.test(view.risk) || !/plus sûr/.test(view.risk)) bad.push('le risque=' + view.risk);
        if (field('pp-protect-stored-risk').querySelector('strong').textContent !== 'Risque :') bad.push('« Risque : » n\'est pas en tête');
        if (field('pp-protect-error').getAttribute('role') !== 'alert' || field('pp-protect-stored-status').getAttribute('role') !== 'status') bad.push('rôles des messages de la fenêtre');
        tick(field('pp-protect-show-stored'), true);
        if (field('pp-protect-stored').type !== 'text') bad.push('« Afficher » ne démasque pas le mot de passe du document');
        tick(field('pp-protect-show-stored'), false);
        if (field('pp-protect-stored').type !== 'password') bad.push('décocher « Afficher » ne remasque pas');
        await pickMode('typed');
        await pickMode('stored');
        if (store.log.reads !== 1) bad.push('une seule lecture par ouverture : ' + store.log.reads);

        // Inchangé : rien n'est écrit.
        okButton().click();
        await pending;
        if (!same(outcome, settingsOf('stored', 'stub-token-du-document')) || store.log.writes.length) bad.push('inchangé : rendu=' + JSON.stringify(outcome) + ' écritures=' + JSON.stringify(store.log.writes));
        let kept = JSON.parse(localStorage.getItem(STORAGE) || 'null');
        if (!kept || kept.mode !== 'stored' || 'password' in kept || storageDump().includes('stub-token-du-document')) bad.push('gardé dans le navigateur=' + JSON.stringify(kept));

        // Réouverture : le mode revient, la lecture repart, le champ « saisi » est vide.
        pending = (await reopen()).run;
        view = storedView();
        if (dialogState().mode !== 'stored' || !view.stored || view.value !== 'stub-token-du-document' || store.log.reads !== 2 || field('pp-protect-password').value !== '') bad.push('réouverture=' + JSON.stringify({ mode: dialogState().mode, view, reads: store.log.reads }));

        // Changé : écrit AVANT de rendre, avec « Enregistrement… » pendant l'écriture.
        typeInto(field('pp-protect-stored'), 'stub-token-nouveau');
        store.state.writeDelay = 120;
        okButton().click();
        await sleep(30);
        view = storedView();
        if (answered || view.ok !== 'Enregistrement…' || !view.okDisabled || !view.disabled) bad.push('pendant l\'écriture=' + JSON.stringify({ answered, ok: view.ok, okDisabled: view.okDisabled, disabled: view.disabled }));
        await pending;
        store.state.writeDelay = 0;
        if (!same(store.log.writes, ['stub-token-nouveau']) || !same(outcome, settingsOf('stored', 'stub-token-nouveau')) || store.state.password !== 'stub-token-nouveau') bad.push('changé : écritures=' + JSON.stringify(store.log.writes) + ' rendu=' + JSON.stringify(outcome));

        // Écriture refusée : la fenêtre reste ouverte et le dit, rien n'est rendu.
        pending = (await reopen()).run;
        store.state.writeOk = false;
        typeInto(field('pp-protect-stored'), 'stub-token-refuse');
        okButton().click();
        await sleep(100);
        view = storedView();
        if (answered || !dialogOpen() || view.error !== 'Le mot de passe n’a pas pu être enregistré dans le document : rien n’a été exporté.' || view.okDisabled || view.ok !== 'Exporter') bad.push('écriture refusée=' + JSON.stringify({ answered, open: dialogOpen(), error: view.error, okDisabled: view.okDisabled, ok: view.ok }));
        typeInto(field('pp-protect-stored'), 'stub-token-refuse-bis');
        if (storedView().error) bad.push('l\'erreur reste affichée après une frappe');
        store.state.writeOk = true;
        okButton().click();
        await pending;
        if (outcome.password !== 'stub-token-refuse-bis' || store.state.password !== 'stub-token-refuse-bis') bad.push('après l\'écriture refusée puis acceptée=' + JSON.stringify(outcome));

        // Document illisible : dit, champ libre ; un champ vide n'efface rien, un mot de passe tapé s'écrit.
        store.state.readOk = false;
        const writesBefore = store.log.writes.length;
        pending = (await reopen()).run;
        view = storedView();
        if (view.status !== 'Le mot de passe enregistré n’a pas pu être lu.' || view.value !== '' || view.disabled || view.okDisabled) bad.push('document illisible=' + JSON.stringify(view));
        okButton().click();
        await pending;
        if (store.log.writes.length !== writesBefore || outcome.password !== '' || outcome.mode !== 'stored' || store.state.password !== 'stub-token-refuse-bis') bad.push('champ vide sur un document illisible : écritures=' + (store.log.writes.length - writesBefore) + ' rendu=' + JSON.stringify(outcome));
        pending = (await reopen()).run;
        typeInto(field('pp-protect-stored'), 'stub-token-apres-panne');
        okButton().click();
        await pending;
        if (store.log.writes.length !== writesBefore + 1 || store.state.password !== 'stub-token-apres-panne') bad.push('mot de passe tapé sur un document illisible non écrit');

        // Mot de passe enregistré trop long (écrit à la main dans Grist) : dit, jamais coupé.
        store.state.readOk = true;
        store.state.password = 'a'.repeat(200);
        pending = (await reopen()).run;
        view = storedView();
        if (view.status !== 'Le mot de passe enregistré est trop long (127 octets au plus ; un accent en compte 2) : saisissez-en un nouveau.' || view.value !== '' || view.disabled) bad.push('mot de passe enregistré trop long=' + JSON.stringify(view));
        cancelButton().click();
        await pending;

        // Compte en lecture seule : il s'en sert, ne le change pas.
        store.state.password = 'stub-token-lecteur';
        stub.setViewer(true);
        const writesAtReader = store.log.writes.length;
        pending = (await reopen()).run;
        view = storedView();
        if (!view.readOnly || view.value !== 'stub-token-lecteur' || view.status !== 'Document en lecture seule : le mot de passe enregistré s’utilise tel quel, sans pouvoir être changé.' || view.okDisabled) bad.push('lecture seule=' + JSON.stringify(view));
        okButton().click();
        await pending;
        stub.setViewer(false);
        if (outcome.password !== 'stub-token-lecteur' || store.log.writes.length !== writesAtReader) bad.push('lecture seule : rendu=' + JSON.stringify(outcome) + ' écritures=' + (store.log.writes.length - writesAtReader));

        // Une lecture qui revient après la fermeture est ignorée.
        store.state.password = 'stub-token-premiere';
        let releaseLate;
        store.state.holds.push(new Promise(resolve => { releaseLate = resolve; }));
        pending = ask({ table: TABLE });
        await waitDialog(true);
        await sleep(40);
        cancelButton().click();
        await pending;
        store.state.password = 'stub-token-seconde';
        pending = (await reopen()).run;
        releaseLate();
        await sleep(80);
        if (storedView().value !== 'stub-token-seconde') bad.push('une lecture tardive a rempli la fenêtre suivante : ' + storedView().value);
        cancelButton().click();
        await pending;

        // Deux champs : le mot de passe saisi et celui du document ne se mélangent pas.
        store.state.password = 'stub-token-du-document';
        pending = (await reopen()).run;
        await pickMode('typed');
        typeInto(field('pp-protect-password'), 'stub-token-saisi');
        await pickMode('stored');
        if (storedView().value !== 'stub-token-du-document') bad.push('le mot de passe saisi passe dans celui du document : ' + storedView().value);
        await pickMode('typed');
        if (field('pp-protect-password').value !== 'stub-token-saisi') bad.push('le mot de passe saisi est perdu en changeant de mode');
        const writesAtTyped = store.log.writes.length;
        okButton().click();
        await pending;
        if (!same(outcome, settingsOf('typed', 'stub-token-saisi')) || store.log.writes.length !== writesAtTyped) bad.push('mode « saisi » : rendu=' + JSON.stringify(outcome) + ' écritures=' + (store.log.writes.length - writesAtTyped));
        kept = JSON.parse(localStorage.getItem(STORAGE) || 'null');
        if (!kept || kept.mode !== 'typed') bad.push('le mode « saisi » n\'est pas gardé : ' + JSON.stringify(kept));

        // Un mot de passe dans le champ du document a la même limite de 127 octets que l'autre.
        pending = ask({ table: TABLE });
        await waitDialog(true);
        await pickMode('stored');
        await sleep(60);
        typeInto(field('pp-protect-stored'), 'é'.repeat(100));
        if (field('pp-protect-stored').value !== 'é'.repeat(63)) bad.push('mot de passe du document de 100 accents gardé à ' + field('pp-protect-stored').value.length + ' caractères');
        // Échap : rien n'est écrit, les champs sont vides à la sortie.
        const writesAtEscape = store.log.writes.length;
        press(field('pp-protect-stored'), 'Escape');
        await pending;
        if (outcome !== null || store.log.writes.length !== writesAtEscape || field('pp-protect-stored').value !== '' || field('pp-protect-password').value !== '') bad.push('Échap : rendu=' + JSON.stringify(outcome) + ' écritures=' + (store.log.writes.length - writesAtEscape));

        // Aucun mot de passe nulle part dans le navigateur.
        const dump = storageDump();
        ['stub-token-du-document', 'stub-token-nouveau', 'stub-token-refuse', 'stub-token-apres-panne', 'stub-token-lecteur', 'stub-token-saisi', 'stub-token-seconde'].forEach(secret => { if (dump.includes(secret)) bad.push('« ' + secret + ' » est dans le stockage du navigateur'); });

        // Les textes anglais.
        store.state.password = 'stub-token-du-document';
        await inLang('en', async () => {
          localStorage.setItem(STORAGE, JSON.stringify({ mode: 'stored' }));
          const run = ask({ table: TABLE });
          await waitDialog(true);
          await sleep(60);
          const en = storedView();
          const names = MODES.map(mode => radio(mode).closest('label').textContent.trim());
          if (!same(names, ['Typed at each export (recommended)', 'Same for all, saved in the document', 'One per row, read from a column']) || dialogEl().querySelector('fieldset.pp-protect-modes legend').textContent !== 'PDF password') bad.push('modes en anglais=' + JSON.stringify(names));
          if (en.where !== 'Saved in table “Publipostage_Modeles”, column “MotDePassePdf” (“Mot de passe des PDF protégés”), row “Réglages du document”.') bad.push('où, en anglais=' + en.where);
          if (!en.risk.startsWith('Risk: this password is written in plain text in the document. Anyone who opens it can read it, unless advanced Grist permissions restrict access.') || !/safer/.test(en.risk)) bad.push('risque en anglais=' + en.risk);
          if (document.querySelector('label[for="pp-protect-stored"]').textContent !== 'Password shared by all the PDFs') bad.push('libellé en anglais=' + document.querySelector('label[for="pp-protect-stored"]').textContent);
          store.state.writeOk = false;
          typeInto(field('pp-protect-stored'), 'stub-token-en');
          okButton().click();
          await sleep(100);
          if (storedView().error !== 'The password could not be saved in the document: nothing was exported.') bad.push('erreur en anglais=' + storedView().error);
          cancelButton().click();
          await run;
        });
      } finally {
        stub.setViewer(false);
        store.restore();
        await closeDialog();
        localStorage.removeItem(STORAGE);
      }
      return result(bad);
    },
  });

  cases.push({
    id: 'pdfprotect_dialog_per_row_mode_lists_the_right_columns_warns_and_remembers_the_choice',
    description: 'La fenêtre « PDF protégé », « Un par ligne, lu dans une colonne » : la liste avec recherche ne propose que les colonnes de la table qui peuvent donner un mot de passe (texte, choix, nombre, « Tout », y compris à formule ; ni date, ni case, ni liste, ni colonne d\'aide) ; « Exporter » grisé et « Choisir la colonne des mots de passe. » tant qu\'aucune n\'est choisie ; le risque d\'un mot de passe en clair nomme la table ; la phrase d\'un lot dit « chacun avec le mot de passe de sa ligne » ; Entrée dans la zone de recherche choisit la colonne sans valider la fenêtre ; réglages rendus avec la colonne et sans mot de passe ; le mode, la colonne et sa table sont gardés (jamais un mot de passe), la colonne ne revient que pour la même table et si elle existe encore ; aucune colonne à choisir : dit, liste grisée ; textes anglais.',
    run: async (h) => {
      await seedPasswords(h);
      const bad = [];
      const stub = window.__gristStub;
      localStorage.removeItem(STORAGE);
      try {
        let outcome;
        let answered = false;
        const ask = ctx => { answered = false; return PdfProtectionDialog.open(ctx).then(value => { answered = true; outcome = value; }); };
        let pending = ask({ table: TABLE });
        if (!await waitDialog(true)) { bad.push('la fenêtre ne s\'ouvre pas'); return result(bad); }
        await pickMode('column');
        let view = columnView();
        if (!view.column || view.typed || view.stored) bad.push('blocs affichés=' + JSON.stringify({ typed: view.typed, stored: view.stored, column: view.column }));
        if (!same(view.options, [''].concat(PW_CANDIDATES))) bad.push('colonnes proposées=' + JSON.stringify(view.options));
        if (view.value !== '' || view.disabled || !view.okDisabled || view.label !== 'Colonne des mots de passe') bad.push('départ=' + JSON.stringify(view));
        if (view.nothing !== 'Choisir la colonne des mots de passe.') bad.push('la raison d\'« Exporter » grisé=' + view.nothing);
        if (view.hint !== 'Chaque PDF s’ouvre avec le mot de passe de sa ligne. Une ligne dont la cellule est vide n’est pas exportée : la fin de l’export la liste.') bad.push('l\'aide=' + view.hint);
        if (view.risk !== 'Risque : les mots de passe sont écrits en clair dans la table « ' + TABLE + ' ». Toute personne qui ouvre le document peut les lire, sauf si des permissions avancées de Grist en réservent l’accès.') bad.push('le risque=' + view.risk);
        if (field('pp-protect-column-risk').querySelector('strong').textContent !== 'Risque :') bad.push('« Risque : » n\'est pas en tête');
        if (!dialogEl().querySelector('#pp-protect-panel-column .ss-trigger')) bad.push('la liste des colonnes n\'est pas la liste avec recherche');
        if (document.activeElement && document.activeElement.id === 'pp-protect-password') bad.push('le champ du mode « saisi » garde le focus');
        // Une colonne à formule se propose aussi (un mot de passe composé).
        stub.setFormulaColumn(TABLE, 'Libre', '$Nom + "-x"');
        await GristAPI.refreshSchema();
        cancelButton().click();
        await pending;
        pending = ask({ table: TABLE });
        await waitDialog(true);
        await pickMode('column');
        if (!columnView().options.includes('Libre')) bad.push('une colonne à formule n\'est pas proposée');
        stub.setFormulaColumn(TABLE, 'Libre', null);
        await GristAPI.refreshSchema();
        // Choisir par la recherche : Entrée dans la zone de recherche choisit sans valider la fenêtre.
        dialogEl().querySelector('#pp-protect-panel-column .ss-trigger').click();
        await sleep(80);
        const search = dialogEl().querySelector('#pp-protect-panel-column .ss-input');
        if (!search) bad.push('la zone de recherche ne s\'ouvre pas');
        else {
          typeInto(search, 'md');
          await sleep(40);
          press(search, 'Enter');
          await sleep(80);
          if (field('pp-protect-column').value !== 'Mdp' || answered || !dialogOpen()) bad.push('Entrée dans la recherche : colonne=' + field('pp-protect-column').value + ' validée=' + answered + ' ouverte=' + dialogOpen());
        }
        view = columnView();
        if (view.okDisabled || view.nothing) bad.push('colonne choisie=' + JSON.stringify({ okDisabled: view.okDisabled, nothing: view.nothing }));
        // Le mot de passe du mode « saisi » n'entre pas dans les réglages d'un mode « un par ligne ».
        await pickMode('typed');
        typeInto(field('pp-protect-password'), 'stub-token-ne-sert-pas');
        await pickMode('column');
        tick(field('pp-protect-copy'), false);
        typeInto(field('pp-protect-author'), 'Anne');
        okButton().click();
        await pending;
        const wanted = { mode: 'column', password: '', passwordColumn: 'Mdp', allowPrint: true, allowCopy: false, allowModify: false, author: 'Anne', subject: '', keywords: '' };
        if (!same(outcome, wanted)) bad.push('réglages rendus=' + JSON.stringify(outcome));
        const kept = JSON.parse(localStorage.getItem(STORAGE) || 'null');
        if (!same(kept, { mode: 'column', allowPrint: true, allowCopy: false, allowModify: false, author: 'Anne', passwordTable: TABLE, passwordColumn: 'Mdp' })) bad.push('gardé dans le navigateur=' + JSON.stringify(kept));
        if (storageDump().includes('stub-token-ne-sert-pas')) bad.push('un mot de passe est dans le stockage du navigateur');
        // Réouverture pour la même table : le mode et la colonne reviennent, « Exporter » est libre.
        pending = ask({ table: TABLE, batch: true, count: 5 });
        await waitDialog(true);
        await sleep(60);
        view = columnView();
        if (dialogState().mode !== 'column' || view.value !== 'Mdp' || view.okDisabled || !view.column) bad.push('réouverture, même table=' + JSON.stringify({ mode: dialogState().mode, value: view.value, okDisabled: view.okDisabled }));
        if (view.intro !== '5 PDF protégés pour « ' + TABLE + ' », regroupés dans une archive ZIP, chacun avec le mot de passe de sa ligne et les mêmes autorisations.') bad.push('phrase du lot=' + view.intro);
        await pickMode('typed');
        if (dialogState().intro !== '5 PDF protégés pour « ' + TABLE + ' », regroupés dans une archive ZIP avec le même mot de passe et les mêmes autorisations.') bad.push('phrase du lot en mode « saisi »=' + dialogState().intro);
        cancelButton().click();
        await pending;
        // Une autre table, sans colonne qui puisse donner un mot de passe (dates, cases, listes) : la colonne ne revient pas, rien à choisir, la liste est grisée et le dit.
        stub.setVariables('PbSansMdp', { Quand: 'Date', Fait: 'Bool', Themes: 'ChoiceList' });
        await GristAPI.refreshSchema();
        pending = ask({ table: 'PbSansMdp' });
        await waitDialog(true);
        await sleep(60);
        view = columnView();
        if (dialogState().mode !== 'column' || view.value !== '' || !view.disabled || !view.okDisabled || !same(view.options, ['']) || view.hint !== 'Aucune colonne de texte, de choix ou de nombre dans la table « PbSansMdp ». Une colonne à formule de type Texte peut composer un mot de passe.') bad.push('autre table=' + JSON.stringify(view));
        cancelButton().click();
        await pending;
        // Une colonne choisie qui n'existe plus : pas reprise.
        localStorage.setItem(STORAGE, JSON.stringify({ mode: 'column', passwordTable: TABLE, passwordColumn: 'Disparue' }));
        pending = ask({ table: TABLE });
        await waitDialog(true);
        await sleep(60);
        view = columnView();
        if (view.value !== '' || !view.okDisabled) bad.push('colonne disparue reprise=' + JSON.stringify({ value: view.value, okDisabled: view.okDisabled }));
        cancelButton().click();
        await pending;
        // Les textes anglais.
        await inLang('en', async () => {
          localStorage.setItem(STORAGE, JSON.stringify({ mode: 'column' }));
          const run = ask({ table: TABLE, batch: true, count: 1, grid: true });
          await waitDialog(true);
          await sleep(60);
          const en = columnView();
          if (en.label !== 'Password column' || en.hint !== 'Each PDF opens with the password of its row. A row whose cell is empty is not exported: the end of the export lists it.' || en.nothing !== 'Choose the password column.') bad.push('textes anglais=' + JSON.stringify({ label: en.label, hint: en.hint, nothing: en.nothing }));
          if (en.risk !== 'Risk: the passwords are written in plain text in table “' + TABLE + '”. Anyone who opens the document can read them, unless advanced Grist permissions restrict access.') bad.push('risque en anglais=' + en.risk);
          if (en.intro !== '1 protected PDF, one per value of “' + TABLE + '”, bundled in a ZIP archive, each with the password of its row and the same permissions.') bad.push('phrase du lot en anglais=' + en.intro);
          if (columnView().options[0] !== '') bad.push('liste en anglais');
          cancelButton().click();
          await run;
        });
      } finally { await closeDialog(); localStorage.removeItem(STORAGE); stub.setFormulaColumn(TABLE, 'Libre', null); }
      return result(bad);
    },
  });

  cases.push({
    id: 'pdfprotect_single_row_takes_the_password_of_its_own_row',
    description: 'Le bouton Exporter en « PDF protégé », mode « un par ligne » : la fenêtre reçoit la table ; le PDF de la ligne affichée est chiffré avec le mot de passe de SA cellule, lue dans Grist au moment de l\'export (la ligne affichée ne porte pas la colonne : la table est relue), sans espaces autour ; un nombre devient son texte ; une cellule vide, trop longue, ni texte ni nombre ou une colonne disparue : aucun PDF, une phrase qui dit laquelle et quelle colonne (français et anglais), le bouton se libère ; le mode « saisi » n\'est pas touché.',
    run: async (h) => {
      await seedPasswords(h);
      await reset(h);
      await setBody(`<p>Bonjour ${badge('Nom')}, voici votre courrier protégé.</p>`);
      const bad = [];
      const settingsFor = column => PdfProtection.normalize({ mode: 'column', passwordColumn: column, allowCopy: false, author: 'Anne' });
      let spies = spyOnSingleExport(settingsFor('Mdp'));
      try {
        await pickType('pdfProtected');
        await clickExport(spies);
        let sent = spies.calls.pdf[0];
        if (!same(spies.calls.asked[0], { table: TABLE })) bad.push('contexte de la fenêtre=' + JSON.stringify(spies.calls.asked[0]));
        if (!sent || !sent[8] || sent[8].userPassword !== PW_CELLS[1] || sent[8].permissions.copying !== false || sent[8].info.author !== 'Anne' || sent[8].version !== '1.7ext3') bad.push('ligne 1 : champs=' + JSON.stringify(sent && sent[8]));
        if (!/PDF protégé généré/.test(statusText())) bad.push('état après la ligne 1=' + statusText());
        // La ligne suivante : son propre mot de passe, sans les espaces autour.
        await fireRow(2);
        await clickExport(spies);
        sent = spies.calls.pdf[1];
        if (!sent || !sent[8] || sent[8].userPassword !== 'stub-token-beta') bad.push('ligne 2 : mot de passe=' + JSON.stringify(sent && sent[8] && sent[8].userPassword));
        if (sent && spies.calls.pdf[0] && spies.calls.pdf[0][8].ownerPassword === sent[8].ownerPassword) bad.push('le même mot de passe propriétaire pour deux lignes');
        // Une cellule vide : aucun PDF, une phrase.
        const problems = [
          [3, 'Mdp', 'Pas de mot de passe pour cette ligne : la colonne « Mdp » est vide. Aucun PDF n’a été généré.'],
          [4, 'Mdp', 'Le mot de passe de cette ligne (colonne « Mdp ») dépasse 127 octets. Aucun PDF n’a été généré.'],
          [1, 'Actif', 'La colonne « Actif » ne donne pas un mot de passe utilisable pour cette ligne (ni texte ni nombre). Aucun PDF n’a été généré.'],
          [1, 'Disparue', 'La colonne « Disparue » n’existe plus ou n’est pas lisible : choisir une autre colonne. Aucun PDF n’a été généré.'],
        ];
        for (const [id, column, want] of problems) {
          await fireRow(id);
          spies.restore();
          spies = spyOnSingleExport(settingsFor(column));
          await clickExport(spies, () => statusText() === want);
          if (spies.calls.pdf.length !== 0) bad.push('ligne ' + id + ' / ' + column + ' : un PDF est parti');
          if (statusText() !== want) bad.push('ligne ' + id + ' / ' + column + ' : état=' + statusText());
          if (document.getElementById('btn-export-pdf').style.pointerEvents === 'none') bad.push('bouton Exporter resté verrouillé après ' + column);
        }
        // Un nombre : écrit tel quel.
        await fireRow(1);
        spies.restore();
        spies = spyOnSingleExport(settingsFor('Code'));
        await clickExport(spies);
        if (!spies.calls.pdf[0] || spies.calls.pdf[0][8].userPassword !== '4201') bad.push('colonne d\'entiers : mot de passe=' + JSON.stringify(spies.calls.pdf[0] && spies.calls.pdf[0][8].userPassword));
        // Le mode « saisi » n'est pas touché : le mot de passe de la fenêtre, tel quel.
        spies.restore();
        spies = spyOnSingleExport(PdfProtection.normalize({ mode: 'typed', password: 'stub-token-saisi' }));
        await clickExport(spies);
        if (!spies.calls.pdf[0] || spies.calls.pdf[0][8].userPassword !== 'stub-token-saisi') bad.push('mode « saisi » : mot de passe=' + JSON.stringify(spies.calls.pdf[0] && spies.calls.pdf[0][8].userPassword));
        // En anglais.
        await fireRow(3);
        spies.restore();
        spies = spyOnSingleExport(settingsFor('Mdp'));
        await inLang('en', async () => {
          const want = 'No password for this row: column “Mdp” is empty. No PDF was generated.';
          await clickExport(spies, () => statusText() === want);
          if (statusText() !== want) bad.push('état en anglais=' + statusText());
        });
      } finally { spies.restore(); await reset(h); }
      return result(bad);
    },
  });

  cases.push({
    id: 'pdfprotect_zip_per_row_passwords_each_pdf_opens_with_its_own_and_the_failures_are_listed',
    description: 'Toutes les lignes (ZIP) en « PDF protégé », mode « un par ligne » (la vraie fenêtre : mode, colonne, « Générer ») : cinq lignes dont une cellule vide et une trop longue ; l\'archive contient les trois autres PDF, chacun s\'ouvre avec le mot de passe de SA ligne (espaces autour retirés, accent) et avec aucun autre, porte le texte de sa ligne ; les deux lignes sans mot de passe utilisable ne sont jamais exportées sans protection et la fenêtre de fin de lot les liste avec leur raison (français et anglais) ; l\'état de fin compte 3 générés et 2 échecs ; aucun mot de passe dans le stockage du navigateur ni dans les écritures envoyées à Grist ; une ligne qui sort en plusieurs documents (« Un document par valeur ») : une seule fenêtre, tous ses PDF ouverts par le mot de passe de sa ligne.',
    run: async (h) => {
      await seedPasswords(h);
      await reset(h);
      await setBody(`<p>Bonjour ${badge('Nom')}, voici votre courrier protégé.</p>`);
      const bad = [];
      const stub = window.__gristStub;
      stub.clearActionLog();
      localStorage.removeItem(STORAGE);
      const captured = captureDownloads();
      const dialogs = h.stubDialogs({ confirm: true, choose: null });
      try {
        await pickType('pdfProtected');
        await pickLines('zip');
        document.getElementById('btn-export-pdf').click();
        if (!await waitDialog(true)) { bad.push('la fenêtre ne s\'ouvre pas'); return result(bad); }
        if (dialogState().intro !== '5 PDF protégés pour « ' + TABLE + ' », regroupés dans une archive ZIP avec le même mot de passe et les mêmes autorisations.') bad.push('phrase du lot=' + dialogState().intro);
        await pickMode('column');
        await chooseColumn('Mdp');
        if (columnView().intro !== '5 PDF protégés pour « ' + TABLE + ' », regroupés dans une archive ZIP, chacun avec le mot de passe de sa ligne et les mêmes autorisations.') bad.push('phrase du lot « un par ligne »=' + columnView().intro);
        if (dialogState().ok !== 'Générer' || dialogState().okDisabled) bad.push('bouton du lot=' + dialogState().ok + ' grisé=' + dialogState().okDisabled);
        okButton().click();
        for (let i = 0; i < 900 && !captured.downloads.length; i++) await sleep(100);
        await sleep(300);
        const download = captured.downloads[0];
        if (captured.downloads.length !== 1 || !download || download.name !== TABLE + '-export-pdf-protege.zip') bad.push('fichiers=' + JSON.stringify(captured.downloads.map(d => d.name)));
        if (statusText() !== '3 PDF protégés générés, 2 échecs — archive ZIP téléchargée.') bad.push('état de fin=' + statusText());
        const passwords = { 1: PW_CELLS[1], 2: 'stub-token-beta', 5: PW_CELLS[5] };
        if (download && download.blob) {
          const zip = await JSZip.loadAsync(await download.blob.arrayBuffer());
          const files = Object.keys(zip.files);
          if (files.length !== 3 || !files.every(name => /\.pdf$/.test(name))) bad.push('contenu de l\'archive=' + JSON.stringify(files));
          const matched = [];
          for (const name of files) {
            const blob = await zip.file(name).async('blob');
            const without = await openPdf(h, blob);
            if (without.error !== 'PasswordException:1') bad.push(name + ' : sans mot de passe=' + (without.error || 'ouvert'));
            const opening = [];
            for (const id of Object.keys(passwords)) {
              const tried = await openPdf(h, blob, passwords[id]);
              if (tried.pdf) {
                opening.push(id);
                if (!squash(await textOf(tried.pdf)).includes('Client' + id)) bad.push(name + ' : le mot de passe de la ligne ' + id + ' ouvre un PDF qui ne porte pas son texte : ' + (await textOf(tried.pdf)).slice(0, 40));
              }
            }
            if (opening.length !== 1) bad.push(name + ' : ouvert par ' + opening.length + ' des trois mots de passe (' + opening.join() + ')');
            matched.push(opening[0]);
            // Ni le mot de passe d'une cellule vide, ni une cellule trop longue n'ouvrent quoi que ce soit.
            if ((await openPdf(h, blob, '')).pdf) bad.push(name + ' : s\'ouvre avec un mot de passe vide');
          }
          if (!same(matched.slice().sort(), ['1', '2', '5'])) bad.push('lignes dans l\'archive=' + JSON.stringify(matched));
        }
        // La fenêtre de fin de lot liste les deux lignes, avec leur raison.
        const failure = dialogs.asked.find(a => a.kind === 'choose' && /documents n’ont pas été générés/.test(a.title || ''));
        if (!failure) bad.push('aucune fenêtre de fin de lot : ' + JSON.stringify(dialogs.asked.map(a => a.kind + ':' + a.title)));
        else {
          const lines = String(failure.message).split('\n').filter(line => line.startsWith('• '));
          const lineOf = id => lines.filter(line => new RegExp('ligne n° ' + id + '\\)? : ', 'i').test(line));
          const emptyLine = lineOf(3)[0] || '';
          const longLine = lineOf(4)[0] || '';
          if (lines.length !== 2 || !/la colonne « Mdp » est vide : pas de mot de passe pour ce PDF$/.test(emptyLine) || !/le mot de passe de la colonne « Mdp » est trop long \(127 octets au plus ; un accent en compte 2\)$/.test(longLine)) bad.push('lignes en échec=' + JSON.stringify(lines));
          if (!/contient 3 autres documents/.test(failure.message)) bad.push('introduction de la fenêtre=' + String(failure.message).slice(0, 80));
        }
        const dump = storageDump();
        [PW_CELLS[1], PW_CELLS[2].trim(), PW_CELLS[5]].forEach(secret => { if (dump.includes(secret)) bad.push('le mot de passe « ' + secret + ' » est dans le stockage du navigateur'); });
        if (JSON.stringify(stub.getActionLog()).includes('stub-token')) bad.push('un mot de passe a été envoyé à Grist dans une action');
        // Les mêmes raisons en anglais, par la fenêtre de fin de lot.
        await inLang('en', async () => {
          dialogs.asked.length = 0;
          await BatchFailures.show([{ id: 3, passwordProblem: 'empty', column: 'Mdp' }, { id: 4, passwordProblem: 'tooLong', column: 'Mdp' }, { id: 6, passwordProblem: 'type', column: 'Code' }, { id: 7, passwordProblem: 'missing', column: 'Zzz' }], { ok: 1, format: 'PDF' });
          const shown = dialogs.asked.find(a => a.kind === 'choose');
          const english = shown ? String(shown.message).split('\n').filter(line => line.startsWith('• ')) : [];
          if (!same(english, ['• Row #3: column “Mdp” is empty: no password for this PDF', '• Row #4: the password in column “Mdp” is too long (127 bytes at most; an accented letter counts as 2)', '• Row #6: column “Code” gives no usable password (neither text nor number)', '• Row #7: column “Zzz” no longer exists or cannot be read'])) bad.push('raisons en anglais=' + JSON.stringify(english));
        });
        captured.downloads.length = 0;
        // Une ligne qui sort en plusieurs documents : une fenêtre, tous les PDF avec le mot de passe de sa ligne.
        await seedPasswords(h, { 1: PW_CELLS[1], 2: PW_CELLS[5] });
        await reset(h);
        await setBody(`<p>Bonjour ${badge('Nom')} ${listBadge('Themes')}</p>`);
        await pickType('pdfProtected');
        localStorage.setItem(STORAGE, JSON.stringify({ mode: 'column', passwordTable: TABLE, passwordColumn: 'Mdp' }));
        let asks = 0;
        const realOpen = PdfProtectionDialog.open;
        PdfProtectionDialog.open = function () { asks++; return realOpen.apply(this, arguments); };
        try {
          document.getElementById('btn-export-pdf').click();
          if (!await waitDialog(true)) bad.push('la fenêtre d\'une ligne découpée ne s\'ouvre pas');
          else {
            await sleep(60);
            okButton().click();
            for (let i = 0; i < 600 && !captured.downloads.length; i++) await sleep(100);
            await sleep(200);
          }
        } finally { PdfProtectionDialog.open = realOpen; }
        if (asks !== 1) bad.push('fenêtres posées pour une ligne découpée=' + asks);
        const split = captured.downloads[0];
        if (captured.downloads.length !== 1 || !split || !/\.zip$/.test(split.name)) bad.push('archive d\'une ligne découpée=' + JSON.stringify(captured.downloads.map(d => d.name)));
        else {
          const zip = await JSZip.loadAsync(await split.blob.arrayBuffer());
          const files = Object.keys(zip.files);
          if (files.length !== THEMES.length) bad.push('PDF de la ligne découpée=' + files.length);
          for (const name of files) {
            const blob = await zip.file(name).async('blob');
            const own = await openPdf(h, blob, PW_CELLS[1]);
            const other = await openPdf(h, blob, PW_CELLS[5]);
            if (!own.pdf || other.pdf) bad.push(name + ' : mot de passe de sa ligne=' + (own.pdf ? 'ouvert' : own.error) + ', celui d\'une autre ligne=' + (other.pdf ? 'ouvert' : other.error));
          }
        }
      } finally { await closeDialog(); captured.restore(); dialogs.restore(); localStorage.removeItem(STORAGE); await reset(h); }
      return result(bad);
    },
  });

  cases.push({
    id: 'pdfprotect_password_saved_in_the_document_goes_through_the_real_store_and_the_zip',
    description: 'Le mode « enregistré dans le document » avec le vrai stockage (js/templates.js sur le faux Grist, rien de remplacé) : la fenêtre relit un document sans mot de passe (vide), un mot de passe tapé s\'écrit dans la colonne MotDePassePdf de la ligne « Réglages du document » de la table des modèles (colonne créée avant la ligne), la ligne n\'est jamais un modèle et le mot de passe n\'entre dans aucun cache ; la fenêtre suivante le retrouve ; un lot ZIP part avec ce mot de passe pour chaque PDF (relus avec lui et avec aucun autre) ; le mot de passe n\'est ni dans le stockage du navigateur ni dans les réglages du document.',
    run: async (h) => {
      await seedPasswords(h, { 1: 'a', 2: 'b', 3: 'c' });
      await reset(h);
      await setBody(`<p>Bonjour ${badge('Nom')}, voici votre courrier protégé.</p>`);
      const bad = [];
      const stub = window.__gristStub;
      const SECRET = 'stub-token-du-vrai-stockage';
      localStorage.removeItem(STORAGE);
      localStorage.setItem(STORAGE, JSON.stringify({ mode: 'stored' }));
      const hadColumn = !!(stub.state.rows.Publipostage_Modeles && 'MotDePassePdf' in stub.state.rows.Publipostage_Modeles);
      stub.clearActionLog();
      const captured = captureDownloads();
      const dialogs = h.stubDialogs({ confirm: true });
      try {
        await Templates.loadAll();
        const before = await Templates.readPdfPassword();
        if (before.ok !== true || before.password !== '') bad.push('lecture avant écriture=' + JSON.stringify(before));
        await pickType('pdfProtected');
        await pickLines('zip');
        document.getElementById('btn-export-pdf').click();
        if (!await waitDialog(true)) { bad.push('la fenêtre ne s\'ouvre pas'); return result(bad); }
        await sleep(150);
        if (dialogState().mode !== 'stored' || storedView().value !== '' || storedView().disabled) bad.push('document sans mot de passe=' + JSON.stringify(storedView()));
        typeInto(field('pp-protect-stored'), SECRET);
        okButton().click();
        for (let i = 0; i < 900 && !captured.downloads.length; i++) await sleep(100);
        await sleep(300);
        // Ce que le document garde.
        const table = stub.state.rows.Publipostage_Modeles;
        const at = (table.TypeModele || []).map((type, i) => (type === 'reglages' ? i : -1)).filter(i => i !== -1);
        if (!table.MotDePassePdf || at.length !== 1 || table.MotDePassePdf[at[0]] !== SECRET || table.Nom[at[0]] !== 'Réglages du document') bad.push('ligne réservée=' + JSON.stringify(at) + ' colonne=' + JSON.stringify(table.MotDePassePdf));
        // La colonne est créée avant la ligne (sauf si une passe précédente de cette page l'a déjà créée : le stub garde ses colonnes d'une page à l'autre du même groupe).
        const log = stub.getActionLog().map(a => a[0] + ':' + a[1] + (a[0] === 'AddVisibleColumn' ? ':' + a[2] : '')).filter(entry => /Publipostage_Modeles/.test(entry));
        const addColumn = log.indexOf('AddVisibleColumn:Publipostage_Modeles:MotDePassePdf');
        const addRow = log.findIndex((entry, i) => entry.startsWith('AddRecord:') && i > addColumn);
        if (!hadColumn && (addColumn === -1 || addRow === -1 || addColumn > addRow)) bad.push('la colonne n\'est pas créée avant la ligne : ' + JSON.stringify(log));
        if (hadColumn && log.filter(entry => entry.startsWith('AddVisibleColumn:Publipostage_Modeles:MotDePassePdf')).length) bad.push('la colonne existait déjà et a pourtant été recréée : ' + JSON.stringify(log));
        if ((await Templates.readPdfPassword()).password !== SECRET) bad.push('relu=' + JSON.stringify(await Templates.readPdfPassword()));
        await Templates.loadAll();
        const leaks = JSON.stringify(Templates.getCached()) + JSON.stringify(Templates.getDocumentSettings());
        if (leaks.includes(SECRET) || Templates.getCached().some(t => t.nom === 'Réglages du document')) bad.push('la ligne réservée ou le mot de passe est dans les modèles ou les réglages');
        if (storageDump().includes(SECRET)) bad.push('le mot de passe est dans le stockage du navigateur');
        // Le lot.
        const download = captured.downloads[0];
        if (captured.downloads.length !== 1 || !download || download.name !== TABLE + '-export-pdf-protege.zip') bad.push('fichiers=' + JSON.stringify(captured.downloads.map(d => d.name)));
        if (download && download.blob) {
          const zip = await JSZip.loadAsync(await download.blob.arrayBuffer());
          const files = Object.keys(zip.files);
          if (files.length !== 3) bad.push('PDF de l\'archive=' + files.length);
          for (const name of files) {
            const blob = await zip.file(name).async('blob');
            const without = await openPdf(h, blob);
            const right = await openPdf(h, blob, SECRET);
            const wrong = await openPdf(h, blob, 'stub-token-autre');
            if (without.error !== 'PasswordException:1' || !right.pdf || wrong.error !== 'PasswordException:2') bad.push(name + ' : sans=' + (without.error || 'ouvert') + ' avec=' + (right.pdf ? 'ouvert' : right.error) + ' autre=' + (wrong.error || 'ouvert'));
          }
        }
        // La fenêtre suivante le retrouve (page « rechargée » : rien en mémoire de la fenêtre).
        const next = PdfProtectionDialog.open({ table: TABLE });
        await waitDialog(true);
        await sleep(150);
        if (storedView().value !== SECRET) bad.push('la fenêtre suivante ne le retrouve pas : ' + JSON.stringify(storedView().value));
        cancelButton().click();
        await next;
      } finally {
        await closeDialog();
        captured.restore();
        dialogs.restore();
        localStorage.removeItem(STORAGE);
        // La ligne réservée créée ici n'est pas laissée aux cas suivants (la colonne reste : la mémoire des migrations de Templates la croit présente).
        const table = window.__gristStub.state.rows.Publipostage_Modeles;
        const ids = table ? table.id.filter((id, i) => table.TypeModele && table.TypeModele[i] === 'reglages') : [];
        if (ids.length) { await grist.docApi.applyUserActions(ids.map(id => ['RemoveRecord', 'Publipostage_Modeles', id])); }
        await Templates.loadAll();
        await reset(h);
      }
      return result(bad);
    },
  });

  cases.push({
    id: 'pdfprotect_dialog_reopens_folded_and_back_at_the_top',
    description: 'La fenêtre « PDF protégé » est la même d\'une fois à l\'autre : rouverte, les propriétés sont repliées et le contenu est revenu en haut - sinon elle s\'ouvre là où la fois précédente a fini, les trois façons de donner le mot de passe hors de vue',
    run: async () => {
      const bad = [];
      localStorage.removeItem(STORAGE);
      try {
        let pending = PdfProtectionDialog.open({ table: TABLE });
        if (!await waitDialog(true)) { bad.push('la fenêtre ne s\'ouvre pas'); return result(bad); }
        const body = dialogEl().querySelector('.pp-modal-body');
        const props = dialogEl().querySelector('details.pp-protect-props');
        // Un contenu qui défile quelle que soit la taille de la page de test ; les propriétés ouvertes, le contenu descendu tout en bas.
        body.style.maxHeight = '260px';
        props.open = true;
        await sleep(60);
        body.scrollTop = body.scrollHeight;
        await sleep(60);
        if (body.scrollHeight < body.clientHeight + 40 || body.scrollTop < 20) bad.push('le cas ne fait pas défiler le contenu : ' + JSON.stringify({ scrollHeight: body.scrollHeight, clientHeight: body.clientHeight, scrollTop: body.scrollTop }));
        cancelButton().click();
        await pending;

        // La fois suivante : tout est comme au premier départ.
        pending = PdfProtectionDialog.open({ table: TABLE });
        await waitDialog(true);
        await sleep(80);
        const view = body.getBoundingClientRect();
        const modes = Array.from(dialogEl().querySelectorAll('input[name="pp-protect-mode"]')).map(input => input.closest('label').getBoundingClientRect());
        if (props.open) bad.push('les propriétés sont restées ouvertes');
        if (body.scrollTop !== 0) bad.push('le contenu n\'est pas revenu en haut : scrollTop=' + body.scrollTop);
        if (modes.length !== 3 || modes.some(r => r.top < view.top - 1 || r.bottom > view.bottom + 1)) bad.push('les trois façons ne sont pas en vue : ' + JSON.stringify({ modes: modes.map(r => [Math.round(r.top), Math.round(r.bottom)]), body: [Math.round(view.top), Math.round(view.bottom)] }));
        if (document.activeElement !== field('pp-protect-password')) bad.push('le champ du mot de passe n\'a pas le focus');
        cancelButton().click();
        await pending;
      } finally {
        const body = dialogEl() && dialogEl().querySelector('.pp-modal-body');
        if (body) body.style.maxHeight = '';
        await closeDialog();
        localStorage.removeItem(STORAGE);
      }
      return result(bad);
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.pdfProtection = cases;
})();
