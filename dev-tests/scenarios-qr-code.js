// Suite "qrCode" - le QR code de l'éditeur (demande d'Antoine, 2026-10-01 : « intégration d'un lien présent dans une cellule Grist (variable) ou d'un lien externe qui peut
// être rentré »), js/qr-code.js. Trois moitiés :
//  1) le DESSIN : le QR code produit est relu par un vrai décodeur (jsQR, chargé depuis le miroir hors-ligne ou jsDelivr), pas seulement comparé à une valeur attendue - un QR code
//     retourné, tronqué ou mal encodé en UTF-8 aurait la bonne allure et ne se lirait pas ;
//  2) l'ÉDITEUR : la ligne « QR code… » du menu « Lien et blocs de contenu » (choix d'Antoine, 2026-10-01), la fenêtre (adresse saisie, colonne, aperçu pour la ligne en cours), l'image complète d'un texte seul, le cadre d'un
//     texte avec une colonne, la modification, le suivi de la taille et de la position ;
//  3) les RENDUS : Lecture, PDF et Word, lus sur la sortie réelle (pixels du PDF décodé par pdf.js, image du .docx dézippé) et relus par le décodeur : chaque ligne a SON QR code.
// La vraie souris et le vrai clavier à 700x400 (clair, sombre, anglais) sont dans dev-tests/verify-qr-mouse.mjs : une page.evaluate ne déclenche ni un survol ni une frappe de confiance.
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const tiptap = () => document.querySelector('.tiptap');
  const modal = () => document.getElementById('pp-qr-modal');
  const modalOpen = () => { const m = modal(); return !!m && m.style.display !== 'none'; };
  const field = () => document.getElementById('pp-qr-text');
  const okButton = () => document.querySelector('#pp-qr-modal .var-modal-primary');
  const cancelButton = () => document.querySelector('#pp-qr-modal .var-modal-actions button:not(.var-modal-primary)');
  const columnButton = () => document.querySelector('#pp-qr-modal .pp-qr-column');
  const previewImage = () => document.querySelector('#pp-qr-modal .pp-qr-image');
  const previewMessage = () => document.querySelector('#pp-qr-modal .pp-qr-message');
  const qrRow = () => document.getElementById('v2-btn-qr');
  const isLocked = id => document.getElementById(id).classList.contains('v2-hf-locked');
  const parse = html => new DOMParser().parseFromString(html, 'text/html').body;
  // TipTap (StarterKit) garde toujours un paragraphe vide à la fin du document quand le dernier bloc n'en est pas un : on le retire pour lire le document tel qu'on l'a écrit.
  const written = () => Editor.getHTML().replace(/<p><\/p>$/, '');
  const qrNodes = () => Array.from(parse(Editor.getHTML()).querySelectorAll('img[data-qr-text]'));
  const esc = text => String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const PAGE_TABLE = 'QrClients';

  // === Le décodeur =========================================================================================================================================
  // jsQR : le miroir hors-ligne (dev-tests/offline-deps.sh) d'abord, jsDelivr sinon. Il lit une image comme le ferait un téléphone : il cherche les trois repères et décode.
  async function loadDecoder() {
    if (window.jsQR) return;
    for (const src of ['/dev-tests/.offline-cache/umd/jsqr.js', 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js']) {
      try {
        const response = await fetch(src);
        const code = await response.text();
        if (!response.ok || code.trim().startsWith('<')) continue;
        (0, eval)(code);
        if (window.jsQR) return;
      } catch (e) { /* source suivante */ }
    }
    throw new Error('jsQR introuvable (dev-tests/.offline-cache/umd/jsqr.js ni jsDelivr)');
  }
  async function pixelsOf(src) {
    const img = new Image();
    img.src = src;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }
  // Le texte que lit le décodeur dans l'image (adresse `data:` ou `blob:`), ou null quand il n'y trouve aucun QR code.
  async function decode(src) {
    await loadDecoder();
    const data = await pixelsOf(src);
    const found = window.jsQR(data.data, data.width, data.height);
    return found ? found.data : null;
  }
  // Pareil sur un canevas déjà peint (une page de PDF rendue par pdf.js).
  async function decodeCanvas(canvas) {
    await loadDecoder();
    const data = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
    const found = window.jsQR(data.data, data.width, data.height, { inversionAttempts: 'dontInvert' });
    return found ? found.data : null;
  }

  // === Données ============================================================================================================================================
  // Trois clients (la table de la page) : un lien seul, un lien précédé d'un titre (la forme « titre adresse » du widget Lien de Grist), une cellule vide ; leurs lignes de commande
  // (liées par Client) pour une boucle.
  async function seed(h) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables(PAGE_TABLE, { Nom: 'Text', Site: 'Text', Montant: 'Numeric', Notes: 'Text', Long: 'Text' });
    stub.setVariables('QrLignes', { Client: 'Ref:QrClients', Reference: 'Text' });
    // Une table sans règle de liaison et sans colonne Référence qui y mène : ses colonnes ne se lisent pas depuis la page (Variables : « pas de correspondance »).
    stub.setVariables('QrAutre', { Valeur: 'Text' });
    stub.setRows('QrAutre', [{ id: 1, Valeur: 'x' }]);
    const rows = [
      { id: 1, Nom: 'Atelier Durand', Site: 'https://durand.example/accueil', Montant: 12000, Notes: '', Long: 'x'.repeat(3000) },
      { id: 2, Nom: 'Brasserie Roy', Site: 'Notre carte https://roy.example/carte?x=1&y=é', Montant: 450, Notes: 'à emporter', Long: '' },
      { id: 3, Nom: 'Cabinet Morel', Site: '', Montant: 0, Notes: '', Long: '' },
    ];
    stub.setRows(PAGE_TABLE, rows);
    stub.setRows('QrLignes', [
      { id: 1, Client: 1, Reference: 'https://durand.example/p/alpha' },
      { id: 2, Client: 1, Reference: 'https://durand.example/p/beta' },
      { id: 3, Client: 2, Reference: 'https://roy.example/p/gamma' },
    ]);
    await GristAPI.refreshSchema();
    await GristAPI.deleteLinkRule('QrLignes');
    await GristAPI.saveLinkRule('QrLignes', { mode: 'match', colonneCible: 'Client', colonneSource: 'id' });
    await GristAPI.refreshSchema();
    stub.fireRecord(Object.assign({}, rows[0]), PAGE_TABLE);
    await sleep(60);
    return rows;
  }
  const recordOf = (rows, id) => Object.assign({}, rows.find(r => r.id === id));
  async function renderReader(html, record) {
    const reader = document.getElementById('reader-container');
    reader.style.display = 'block';
    await ReaderMode.render(html, PAGE_TABLE, record || GristAPI.getCurrentRecord(), NO_HF);
    return reader.querySelector('.reader-content');
  }
  async function previewOf(html, record) {
    const box = document.createElement('div');
    box.innerHTML = await ReaderMode.preview(html, PAGE_TABLE, record || GristAPI.getCurrentRecord());
    return box;
  }
  // Le HTML d'un QR code tel que l'éditeur l'écrit : complet pour un texte seul, sans image avec une colonne.
  async function qrHtml(text, width) {
    const attrs = await QrCode.attrsFor(text);
    return '<img class="editor-image"' + (attrs.src ? ' src="' + attrs.src + '"' : '') + ' alt="QR code" style="width: ' + (width || 120) + 'px' + (attrs.src ? '' : '; aspect-ratio: 1 / 1') + '" data-layer="normal" data-wrap="inline" data-qr-text="' + esc(text) + '">';
  }

  // === L'éditeur ===========================================================================================================================================
  async function openWindow() {
    qrRow().click();
    await sleep(220);
  }
  async function closeWindowIfOpen() {
    if (modalOpen()) cancelButton().click();
    await sleep(60);
  }
  async function typeInField(text) {
    const input = field();
    input.value = text;
    input.setSelectionRange(text.length, text.length);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(420);
  }
  // Ouvre la fenêtre, écrit `text` et valide.
  async function insertQr(text) {
    await openWindow();
    await typeInField(text);
    okButton().click();
    await sleep(350);
  }
  function qrPos() {
    let found = null;
    EditorCore.getEditor().state.doc.descendants((node, pos) => { if (node.type.name === 'editorImage' && node.attrs.qrText && found === null) found = pos; });
    return found;
  }
  async function selectQr() {
    EditorCore.getEditor().commands.setNodeSelection(qrPos());
    await sleep(160);
  }
  const qrAttrs = () => { const pos = qrPos(); return pos === null ? null : EditorCore.getEditor().state.doc.nodeAt(pos).attrs; };
  async function setDoc(h, html) {
    await h.resetEditor();
    Editor.setHTML(html);
    await sleep(150);
  }
  async function placeCursorAtEnd() {
    EditorCore.getEditor().commands.focus('end');
    await sleep(100);
  }

  // === 1) Le dessin ========================================================================================================================================
  cases.push({
    id: 'qr_png_is_read_back_by_a_decoder_for_ascii_utf8_and_long_texts',
    description: 'Le QR code dessiné se relit : une adresse, un texte accentué et en idéogrammes (UTF-8, pas un octet par lettre), un mailto, un nombre, un texte de 900 caractères (grande version)',
    run: async () => {
      const texts = ['https://exemple.fr', 'https://exemple.fr/café?q=déjà&r=日本語', 'Brasserie « Le Café » – déjà vu', 'mailto:contact@exemple.fr?subject=Bonjour%20!', '0123456789', 'https://exemple.fr/' + 'a-b/'.repeat(225)];
      const got = [];
      for (const text of texts) got.push(await decode(await QrCode.dataUri(text)));
      return { pass: texts.every((t, i) => got[i] === t), notes: JSON.stringify(texts.map((t, i) => got[i] === t ? 'ok' : { attendu: t.slice(0, 40), lu: got[i] && got[i].slice(0, 40) })) };
    },
  });

  cases.push({
    id: 'qr_png_is_square_black_on_white_with_four_modules_of_margin_and_whole_pixel_modules',
    description: 'L\'image est carrée, en noir pur sur blanc pur (aucun gris), la marge blanche fait quatre modules, chaque module est un carré de pixels entiers et le nombre de modules est celui d\'une version QR (4v+17)',
    run: async () => {
      const data = await pixelsOf(await QrCode.dataUri('https://exemple.fr/qr'));
      const { width, height } = data;
      const px = (x, y) => { const i = (y * width + x) * 4; return [data.data[i], data.data[i + 1], data.data[i + 2], data.data[i + 3]]; };
      let grey = 0;
      for (let i = 0; i < data.data.length; i += 4) { const v = data.data[i]; if ((v !== 0 && v !== 255) || data.data[i + 1] !== v || data.data[i + 2] !== v || data.data[i + 3] !== 255) grey += 1; }
      // Le premier module du repère en haut à gauche est noir : sa position donne la marge, donc la taille d'un module.
      let firstDark = -1;
      for (let x = 0; x < width && firstDark < 0; x++) if (px(x, Math.floor(height / 2) > 0 ? 0 : 0)[0] === 0) firstDark = x;
      const row = Math.round(height / 2);
      let darkX = -1;
      for (let x = 0; x < width; x++) { if (px(x, row)[0] === 0) { darkX = x; break; } }
      let diag = -1;
      for (let i = 0; i < width; i++) { if (px(i, i)[0] === 0) { diag = i; break; } }
      const scale = diag / 4;
      const modules = width / scale - 8;
      const blocks = (() => {
        // Chaque bloc de `scale` x `scale` pixels d'un module est d'une seule couleur.
        for (let by = 0; by < height / scale; by++) for (let bx = 0; bx < width / scale; bx++) {
          const first = px(bx * scale, by * scale)[0];
          for (const [dx, dy] of [[scale - 1, 0], [0, scale - 1], [scale - 1, scale - 1], [Math.floor(scale / 2), Math.floor(scale / 2)]]) if (px(bx * scale + dx, by * scale + dy)[0] !== first) return false;
        }
        return true;
      })();
      return {
        pass: width === height && grey === 0 && Number.isInteger(scale) && scale >= 8 && (modules - 17) % 4 === 0 && modules >= 21 && modules <= 177 && blocks && width >= 480 && width <= 900,
        notes: JSON.stringify({ width, height, grey, scale, modules, blocks, darkX }),
      };
    },
  });

  cases.push({
    id: 'qr_too_long_text_is_refused_with_a_flag_and_the_library_error_is_not_mistaken_for_it',
    description: 'Un texte de 3 000 caractères ne tient dans aucun QR code : l\'erreur porte `tooLong` ; une bibliothèque qui plante n\'est PAS « trop long »',
    run: async () => {
      let tooLong = null;
      try { await QrCode.dataUri('y'.repeat(3000)); } catch (e) { tooLong = !!e.tooLong; }
      const real = window.qrcode;
      let other = null;
      try { window.qrcode = () => { throw new Error('plantage'); }; await QrCode.dataUri('ok'); } catch (e) { other = { tooLong: !!e.tooLong, message: e.message }; } finally { window.qrcode = real; }
      const fine = await QrCode.dataUri('ok');
      return { pass: tooLong === true && other && other.tooLong === false && other.message === 'plantage' && fine.startsWith('data:image/png;base64,'), notes: JSON.stringify({ tooLong, other }) };
    },
  });

  cases.push({
    id: 'qr_library_is_loaded_from_cdnjs_with_a_sri_hash_like_the_other_libraries',
    description: 'La bibliothèque est demandée à cdnjs, en version fixe, avec un hash SRI sha384 (comme JSZip et pdfmake) ; le texte s\'encode en UTF-8',
    run: async () => {
      const lib = QrCode.LIB;
      return {
        pass: /^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/qrcode-generator\/1\.4\.4\/qrcode\.min\.js$/.test(lib.src) && /^sha384-[A-Za-z0-9+/]{64}$/.test(lib.integrity) && window.qrcode.stringToBytes === window.qrcode.stringToBytesFuncs['UTF-8'],
        notes: JSON.stringify(lib),
      };
    },
  });

  // === 2) La ligne du menu =================================================================================================================================
  cases.push({
    id: 'qr_row_is_in_the_chain_menu_after_signature_never_a_new_icon_and_the_image_menu_is_unchanged',
    description: 'La ligne « QR code… » est dans le menu de la chaîne (« Lien et blocs de contenu »), sous « Bloc de signature », avec son icône ; c\'est un vrai bouton (Tab, Entrée, Espace), elle se clique ; le menu Image garde sa seule ligne ; la chaîne reste la seule icône du groupe',
    run: async (h) => {
      await h.resetEditor();
      const group = document.getElementById('v2-blocks-group');
      const flyout = document.getElementById('v2-blocks-flyout');
      const chain = Array.from(flyout.querySelectorAll('.v2-menu-row')).map(r => r.id);
      const imageRows = Array.from(document.getElementById('v2-image-flyout').querySelectorAll('.v2-hover-row')).map(r => r.id);
      const row = qrRow();
      const icon = row.querySelector('.v2-menu-row-icon svg');
      const info = {
        chain, imageRows, tag: row.tagName, type: row.getAttribute('type'), label: row.textContent.trim(), aria: row.getAttribute('aria-label'), role: row.getAttribute('role'), tabIndex: row.tabIndex,
        flyoutLabel: flyout.querySelector('.v2-hover-flyout-label').textContent, icons: group.querySelectorAll(':scope > button').length, hasIcon: !!icon && icon.querySelectorAll('rect').length === 3,
        inImageMenu: !!document.getElementById('v2-image-flyout').contains(row), inToolbar: row.parentElement === document.getElementById('v2-toolbar'),
      };
      row.click();
      await sleep(200);
      const byClick = modalOpen();
      await closeWindowIfOpen();
      return {
        pass: JSON.stringify(chain) === JSON.stringify(['v2-row-link', 'v2-btn-citation', 'v2-btn-code-block', 'v2-btn-callout', 'v2-btn-signature', 'v2-btn-qr'])
          && JSON.stringify(imageRows) === JSON.stringify(['v2-btn-image-from-variable'])
          && info.tag === 'BUTTON' && info.type === 'button' && info.label === 'QR code…' && info.aria === 'Insérer un QR code' && info.role === null && info.tabIndex === 0
          && info.flyoutLabel === 'Lien et blocs de contenu' && info.icons === 1 && info.hasIcon && !info.inImageMenu && !info.inToolbar && byClick,
        notes: JSON.stringify({ info, byClick }),
      };
    },
  });

  cases.push({
    id: 'qr_row_is_greyed_in_header_email_and_macro_modes_never_removed_and_stays_active_in_a_grid',
    description: 'En-tête/pied et e-mail : la ligne se grise (jamais retirée), comme « Encadré… » ; macro-modèle : tout le menu de la chaîne se grise avec elle ; grille : elle reste active (l\'image se pose sur sa case) pendant que « Encadré… » se grise ; elle redevient active en quittant chaque mode',
    run: async (h) => {
      await setDoc(h, '<p>Texte</p>');
      MainToolbar.syncToolbarState();
      const free = !isLocked('v2-btn-qr') && !isLocked('v2-blocks-group') && !isLocked('v2-image-group');
      const realGetHfMode = HeaderFooterPreview.getHfMode;
      let inHf; let afterHf;
      try {
        HeaderFooterPreview.getHfMode = () => 'header';
        MainToolbar.syncToolbarState();
        inHf = isLocked('v2-btn-qr') && isLocked('v2-btn-callout');
      } finally {
        HeaderFooterPreview.getHfMode = realGetHfMode;
        MainToolbar.syncToolbarState();
        afterHf = !isLocked('v2-btn-qr') && !isLocked('v2-btn-callout');
      }
      MainToolbar.setEmailMode(true);
      MainToolbar.syncToolbarState();
      const inEmail = isLocked('v2-btn-qr') && isLocked('v2-btn-callout') && isLocked('v2-image-group') && !isLocked('v2-blocks-group');
      MainToolbar.setEmailMode(false);
      MainToolbar.syncToolbarState();
      const afterEmail = !isLocked('v2-btn-qr') && !isLocked('v2-image-group');
      MainToolbar.setMacroMode(true);
      MainToolbar.syncToolbarState();
      const inMacro = isLocked('v2-blocks-group') && isLocked('v2-image-group');
      MainToolbar.setMacroMode(false);
      MainToolbar.syncToolbarState();
      const afterMacro = !isLocked('v2-blocks-group') && !isLocked('v2-btn-qr');
      MainToolbar.setGridMode(true);
      MainToolbar.syncToolbarState();
      const inGrid = !isLocked('v2-btn-qr') && isLocked('v2-btn-callout') && !isLocked('v2-image-group');
      MainToolbar.setGridMode(false);
      MainToolbar.syncToolbarState();
      const after = !isLocked('v2-btn-qr') && !isLocked('v2-btn-callout');
      return { pass: free && inHf && afterHf && inEmail && afterEmail && inMacro && afterMacro && inGrid && after && !!qrRow(), notes: JSON.stringify({ free, inHf, afterHf, inEmail, afterEmail, inMacro, afterMacro, inGrid, after }) };
    },
  });

  cases.push({
    id: 'qr_row_reads_edit_when_a_qr_code_is_selected_and_texts_follow_the_interface_language',
    description: 'La ligne devient « Modifier le QR code… » (son nom accessible aussi) quand un QR code est sélectionné, pas pour une image ordinaire ; la ligne, la fenêtre (insertion puis modification) et ses messages passent en anglais avec l\'interface puis reviennent en français',
    run: async (h) => {
      await seed(h);
      Editor.setHTML('<p>Avant</p><p><img class="editor-image" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="Image" style="width: 40px"></p>');
      await sleep(150);
      let plainImage;
      EditorCore.getEditor().state.doc.descendants((node, pos) => { if (node.type.name === 'editorImage' && plainImage === undefined) plainImage = pos; });
      EditorCore.getEditor().commands.setNodeSelection(plainImage);
      await sleep(150);
      const onPlain = { label: qrRow().textContent.trim(), aria: qrRow().getAttribute('aria-label'), active: qrRow().classList.contains('is-active') };
      await placeCursorAtEnd();
      await insertQr('https://exemple.fr');
      await selectQr();
      const onQr = { label: qrRow().textContent.trim(), aria: qrRow().getAttribute('aria-label'), active: qrRow().classList.contains('is-active') };
      await placeCursorAtEnd();
      I18n.setLang('en');
      await sleep(150);
      const text = sel => (document.querySelector(sel) || {}).textContent;
      const en = {};
      try {
        en.row = qrRow().textContent.trim();
        en.aria = qrRow().getAttribute('aria-label');
        await openWindow();
        Object.assign(en, { title: text('#pp-qr-title'), label: text('#pp-qr-modal .pp-dialog-label'), column: text('#pp-qr-modal .pp-qr-column'), placeholder: field().placeholder, hint: text('#pp-qr-hint'), preview: text('#pp-qr-modal .pp-qr-side .pp-dialog-label'), ok: okButton().textContent, cancel: cancelButton().textContent });
        await typeInField('');
        en.empty = previewMessage().textContent;
        await closeWindowIfOpen();
        await selectQr();
        en.rowEdit = qrRow().textContent.trim();
        en.ariaEdit = qrRow().getAttribute('aria-label');
        await openWindow();
        en.titleEdit = text('#pp-qr-title');
        en.okEdit = okButton().textContent;
        await closeWindowIfOpen();
      } finally {
        await closeWindowIfOpen();
        I18n.setLang('fr');
        await sleep(150);
      }
      const back = { label: qrRow().textContent.trim(), aria: qrRow().getAttribute('aria-label') };
      return {
        pass: onPlain.label === 'QR code…' && onPlain.aria === 'Insérer un QR code' && !onPlain.active && onQr.label === 'Modifier le QR code…' && onQr.aria === 'Modifier le QR code' && onQr.active
          && en.row === 'QR code…' && en.aria === 'Insert a QR code' && en.title === 'Insert a QR code' && en.label === 'Address or text' && en.column === 'Insert a column…' && en.placeholder === 'https://example.com'
          && en.hint === 'A column gives each row its own QR code.' && en.preview === 'Preview' && en.ok === 'Insert' && en.cancel === 'Cancel' && en.empty === 'Enter an address or text.'
          && en.rowEdit === 'Edit QR code…' && en.ariaEdit === 'Edit the QR code' && en.titleEdit === 'Edit the QR code' && en.okEdit === 'Confirm'
          && back.label === 'Modifier le QR code…' && back.aria === 'Modifier le QR code',
        notes: JSON.stringify({ onPlain, onQr, en, back }),
      };
    },
  });

  // === 3) La fenêtre et l'insertion ========================================================================================================================
  cases.push({
    id: 'qr_window_opens_empty_with_the_field_focused_and_insert_disabled_until_there_is_a_text',
    description: 'La fenêtre s\'ouvre sur un champ vide qui a le focus, « Insérer » grisé et un message d\'aperçu ; un texte l\'active et montre le QR code ; le vider la regrise',
    run: async (h) => {
      await seed(h);
      await openWindow();
      const opened = modalOpen() && document.activeElement === field();
      const disabledAtStart = okButton().disabled;
      const messageAtStart = previewMessage().textContent;
      const imageHiddenAtStart = previewImage().hidden;
      await typeInField('https://exemple.fr');
      const enabled = !okButton().disabled;
      const shown = !previewImage().hidden && previewMessage().hidden;
      const read = await decode(previewImage().src);
      await typeInField('');
      const disabledAgain = okButton().disabled;
      await closeWindowIfOpen();
      return {
        pass: opened && disabledAtStart && messageAtStart === 'Saisissez une adresse ou un texte.' && imageHiddenAtStart && enabled && shown && read === 'https://exemple.fr' && disabledAgain,
        notes: JSON.stringify({ opened, disabledAtStart, messageAtStart, imageHiddenAtStart, enabled, shown, read, disabledAgain }),
      };
    },
  });

  cases.push({
    id: 'qr_typed_address_inserts_a_complete_image_that_is_read_back_and_costs_one_undo',
    description: 'Une adresse saisie s\'insère comme une image complète (src PNG, texte gardé, 120 px, alt « QR code ») que le décodeur relit ; un seul Annuler la retire, Rétablir la remet ; l\'éditeur reprend le focus',
    run: async (h) => {
      await setDoc(h, '<p>Avant</p>');
      await placeCursorAtEnd();
      await insertQr('https://exemple.fr/contact');
      const nodes = qrNodes();
      const node = nodes[0];
      const read = node ? await decode(node.getAttribute('src')) : null;
      const closed = !modalOpen();
      const focused = document.activeElement && document.activeElement.closest('.tiptap') !== null;
      await h.clickButton('v2-btn-undo');
      await sleep(150);
      const afterUndo = qrNodes().length;
      await h.clickButton('v2-btn-redo');
      await sleep(150);
      const afterRedo = qrNodes().length;
      return {
        pass: nodes.length === 1 && read === 'https://exemple.fr/contact' && node.getAttribute('data-qr-text') === 'https://exemple.fr/contact' && node.getAttribute('alt') === 'QR code' && node.style.width === '120px'
          && node.getAttribute('src').startsWith('data:image/png;base64,') && closed && focused && afterUndo === 0 && afterRedo === 1,
        notes: JSON.stringify({ count: nodes.length, read, width: node && node.style.width, alt: node && node.getAttribute('alt'), closed, focused, afterUndo, afterRedo }),
      };
    },
  });

  cases.push({
    id: 'qr_enter_in_the_field_inserts_and_escape_or_cancel_closes_without_inserting',
    description: 'Entrée dans le champ insère ; Échap et « Annuler » ferment sans rien insérer ; Entrée sans texte ne fait rien',
    run: async (h) => {
      await setDoc(h, '<p>Texte</p>');
      await placeCursorAtEnd();
      await openWindow();
      await typeInField('');
      field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await sleep(150);
      const stillOpen = modalOpen();
      await typeInField('https://exemple.fr/a');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await sleep(150);
      const afterEscape = { open: modalOpen(), count: qrNodes().length };
      await openWindow();
      await typeInField('https://exemple.fr/b');
      cancelButton().click();
      await sleep(150);
      const afterCancel = { open: modalOpen(), count: qrNodes().length };
      await openWindow();
      const reset = field().value === '';
      await typeInField('https://exemple.fr/c');
      field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await sleep(350);
      const afterEnter = { open: modalOpen(), count: qrNodes().length, text: qrNodes()[0] && qrNodes()[0].getAttribute('data-qr-text') };
      return {
        pass: stillOpen && !afterEscape.open && afterEscape.count === 0 && !afterCancel.open && afterCancel.count === 0 && reset && !afterEnter.open && afterEnter.count === 1 && afterEnter.text === 'https://exemple.fr/c',
        notes: JSON.stringify({ stillOpen, afterEscape, afterCancel, reset, afterEnter }),
      };
    },
  });

  cases.push({
    id: 'qr_column_in_the_text_inserts_a_square_frame_without_image_that_shows_the_text',
    description: 'Un texte avec une colonne (« #QrClients.Site ») s\'insère sans image : le HTML n\'a ni src ni PNG, seulement le texte et un cadre carré ; l\'éditeur le montre en cadre pointillé avec l\'icône d\'un QR code et le texte',
    run: async (h) => {
      await seed(h);
      Editor.setHTML('<p>Avant</p>');
      await sleep(100);
      await placeCursorAtEnd();
      await insertQr('#QrClients.Site');
      const node = qrNodes()[0];
      const view = tiptap().querySelector('.editor-image-view.editor-image-qr-placeholder');
      const label = view && view.querySelector('.editor-image-var-label');
      const rect = view && view.getBoundingClientRect();
      const labelStyle = label && getComputedStyle(label, '::before');
      const attrs = qrAttrs();
      return {
        pass: !!node && !node.hasAttribute('src') && node.getAttribute('data-qr-text') === '#QrClients.Site' && /aspect-ratio: 1 \/ 1/.test(node.getAttribute('style')) && !Editor.getHTML().includes('data:image/png')
          && !!view && label.textContent === '#QrClients.Site' && Math.abs(rect.width - rect.height) < 1.5 && rect.width > 60 && view.classList.contains('editor-image-var-placeholder') && attrs.src === null && attrs.qrText === '#QrClients.Site'
          && labelStyle.maskImage !== 'none' && labelStyle.width === '28px',
        notes: JSON.stringify({ html: written().slice(0, 240), label: label && label.textContent, rect: rect && [rect.width, rect.height], src: attrs && attrs.src, mask: labelStyle && labelStyle.maskImage.slice(0, 30) }),
      };
    },
  });

  cases.push({
    id: 'qr_insert_column_button_opens_the_searchable_list_above_the_window_and_writes_the_column_at_the_caret',
    description: '« Insérer une colonne… » ouvre la liste avec recherche des colonnes (sans les pièces jointes ni les colonnes d\'aide), AU-DESSUS de la fenêtre ; le choix s\'écrit « #Table.Colonne » à la place de la sélection du champ et l\'aperçu suit',
    run: async (h) => {
      await seed(h);
      await openWindow();
      await typeInField('https://suivi.exemple/');
      columnButton().click();
      await sleep(250);
      const panel = document.querySelector('#pp-qr-modal .ss-panel');
      const rect = panel && panel.getBoundingClientRect();
      const options = Array.from(document.querySelectorAll('#pp-qr-modal .ss-option')).map(o => o.textContent.replace(/\s+/g, ' ').trim());
      const topAtCenter = rect ? document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) : null;
      const above = !!topAtCenter && panel.contains(topAtCenter);
      const search = document.querySelector('#pp-qr-modal .ss-input');
      search.value = 'montant';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(150);
      const filtered = Array.from(document.querySelectorAll('#pp-qr-modal .ss-option')).map(o => o.textContent.replace(/\s+/g, ' ').trim());
      document.querySelector('#pp-qr-modal .ss-option').click();
      await sleep(500);
      const value = field().value;
      const listClosed = !document.querySelector('#pp-qr-modal .ss-panel') || document.querySelector('#pp-qr-modal .ss-panel').hidden;
      const focusBack = document.activeElement === field();
      const message = previewMessage().textContent;
      const previewRead = previewImage().hidden ? null : await decode(previewImage().src);
      await closeWindowIfOpen();
      return {
        pass: !!panel && above && options.includes('QrClients.Site') && options.includes('QrLignes.Reference') && !options.some(o => o.includes('gristHelper')) && filtered.length === 1 && filtered[0].startsWith('QrClients.Montant')
          && value === 'https://suivi.exemple/#QrClients.Montant' && listClosed && focusBack && previewRead === 'https://suivi.exemple/12000',
        notes: JSON.stringify({ above, options, filtered, value, listClosed, focusBack, message, previewRead }),
      };
    },
  });

  cases.push({
    id: 'qr_hash_in_the_field_opens_the_column_completion_above_the_window_and_enter_picks_without_inserting',
    description: 'Taper « # » dans le champ ouvre la même liste de colonnes que dans l\'objet d\'un e-mail, rangée AU-DESSUS du voile de la fenêtre (elle se voit et se clique : js/variables.js la range au niveau des fenêtres par la classe ac-over-window, sans niveau propre à la fenêtre) ; Entrée choisit la colonne sans valider la fenêtre',
    run: async (h) => {
      await seed(h);
      await openWindow();
      const input = field();
      input.value = 'https://x.fr/#QrClients.Sit';
      input.setSelectionRange(input.value.length, input.value.length);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(250);
      const box = document.getElementById('autocomplete-box');
      const visible = !!box && getComputedStyle(box).display !== 'none';
      const rect = box && box.getBoundingClientRect();
      const item = box && box.querySelector('.ac-item');
      const itemRect = item && item.getBoundingClientRect();
      const topAtItem = itemRect ? document.elementFromPoint(itemRect.left + itemRect.width / 2, itemRect.top + itemRect.height / 2) : null;
      const above = !!topAtItem && box.contains(topAtItem);
      const overWindow = !!box && box.classList.contains('ac-over-window');
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await sleep(300);
      const picked = input.value;
      const stillOpen = modalOpen();
      const count = qrNodes().length;
      await closeWindowIfOpen();
      return {
        pass: visible && above && overWindow && picked === 'https://x.fr/#QrClients.Site' && stillOpen && count === 0,
        notes: JSON.stringify({ visible, above, overWindow, picked, stillOpen, count, rect: rect && [rect.left, rect.top, rect.width, rect.height] }),
      };
    },
  });

  cases.push({
    id: 'qr_edit_keeps_size_position_and_wrapping_and_only_changes_text_and_image',
    description: 'Un QR code sélectionné s\'ouvre dans la même fenêtre (« Modifier »), le champ rempli ; valider change son texte et son image, mais garde sa largeur, son alignement, son habillage et son opacité ; un seul Annuler revient en arrière',
    run: async (h) => {
      await seed(h);
      Editor.setHTML('<p>Avant</p>');
      await sleep(100);
      await placeCursorAtEnd();
      await insertQr('https://exemple.fr/un');
      await selectQr();
      const pos = qrPos();
      EditorCore.patchNodeAndReselect(EditorCore.getEditor(), pos, Object.assign({}, qrAttrs(), { width: '200px', align: 'center', opacity: 0.8, wrap: 'block' }));
      await sleep(150);
      qrRow().click();
      await sleep(220);
      const prefilled = field().value;
      const title = document.getElementById('pp-qr-title').textContent;
      const okLabel = okButton().textContent;
      await typeInField('https://exemple.fr/deux');
      okButton().click();
      await sleep(350);
      const attrs = qrAttrs();
      const read = await decode(attrs.src);
      await h.clickButton('v2-btn-undo');
      await sleep(150);
      const back = qrAttrs();
      return {
        pass: prefilled === 'https://exemple.fr/un' && title === 'Modifier le QR code' && okLabel === 'Valider' && attrs.qrText === 'https://exemple.fr/deux' && read === 'https://exemple.fr/deux' && attrs.width === '200px' && attrs.align === 'center'
          && attrs.opacity === 0.8 && attrs.wrap === 'block' && qrNodes().length === 1 && back.qrText === 'https://exemple.fr/un' && back.width === '200px',
        notes: JSON.stringify({ prefilled, title, okLabel, attrs: attrs && { text: attrs.qrText, width: attrs.width, align: attrs.align, opacity: attrs.opacity, wrap: attrs.wrap }, read, back: back && back.qrText }),
      };
    },
  });

  cases.push({
    id: 'qr_edit_can_switch_between_a_complete_image_and_a_column_frame_in_both_directions',
    description: 'On passe d\'un texte seul (image complète) à une colonne (cadre sans image), puis de nouveau à un texte seul : l\'image PNG apparaît et disparaît du HTML, jamais deux QR codes',
    run: async (h) => {
      await seed(h);
      Editor.setHTML('<p>Avant</p>');
      await sleep(100);
      await placeCursorAtEnd();
      await insertQr('https://exemple.fr/fixe');
      const first = qrNodes()[0];
      const hadImage = first.getAttribute('src').startsWith('data:image/png');
      await selectQr();
      qrRow().click();
      await sleep(200);
      await typeInField('#QrClients.Site');
      okButton().click();
      await sleep(350);
      const second = qrNodes()[0];
      const frame = !second.hasAttribute('src') && second.getAttribute('data-qr-text') === '#QrClients.Site' && qrNodes().length === 1;
      const placeholderShown = !!tiptap().querySelector('.editor-image-qr-placeholder');
      await selectQr();
      qrRow().click();
      await sleep(200);
      await typeInField('https://exemple.fr/de-nouveau');
      okButton().click();
      await sleep(350);
      const third = qrNodes()[0];
      const read = await decode(third.getAttribute('src'));
      return {
        pass: hadImage && frame && placeholderShown && qrNodes().length === 1 && read === 'https://exemple.fr/de-nouveau' && !tiptap().querySelector('.editor-image-qr-placeholder'),
        notes: JSON.stringify({ hadImage, frame, placeholderShown, read, count: qrNodes().length }),
      };
    },
  });

  cases.push({
    id: 'qr_insert_never_replaces_the_selected_text_or_image_it_adds_after_it',
    description: 'Avec du texte sélectionné ou une image ordinaire sélectionnée, le QR code s\'ajoute APRÈS la sélection : le texte et l\'image restent',
    run: async (h) => {
      await seed(h);
      Editor.setHTML('<p>Bonjour tout le monde</p><p><img class="editor-image" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="Image" style="width: 40px"></p>');
      await sleep(150);
      // Texte sélectionné : « tout ».
      const walker = document.createTreeWalker(tiptap(), NodeFilter.SHOW_TEXT);
      const textNode = walker.nextNode();
      tiptap().focus();
      const range = document.createRange();
      range.setStart(textNode, 8);
      range.setEnd(textNode, 12);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
      await sleep(150);
      await insertQr('https://exemple.fr/apres-texte');
      const textKept = tiptap().textContent.includes('Bonjour tout le monde');
      const afterText = parse(Editor.getHTML()).querySelector('p').innerHTML.indexOf('tout') < parse(Editor.getHTML()).querySelector('p').innerHTML.indexOf('data-qr-text');
      // Image ordinaire sélectionnée.
      let imagePos;
      EditorCore.getEditor().state.doc.descendants((node, pos) => { if (node.type.name === 'editorImage' && !node.attrs.qrText && imagePos === undefined) imagePos = pos; });
      EditorCore.getEditor().commands.setNodeSelection(imagePos);
      await sleep(150);
      await insertQr('https://exemple.fr/apres-image');
      const images = Array.from(parse(Editor.getHTML()).querySelectorAll('img'));
      return {
        pass: textKept && afterText && images.length === 3 && images.filter(i => i.hasAttribute('data-qr-text')).length === 2 && images.filter(i => !i.hasAttribute('data-qr-text')).length === 1,
        notes: JSON.stringify({ textKept, afterText, images: images.map(i => i.getAttribute('data-qr-text') || 'image') }),
      };
    },
  });

  cases.push({
    id: 'qr_preview_uses_the_current_row_and_says_why_when_there_is_no_qr_code',
    description: 'Avec une colonne, l\'aperçu montre le QR code de la ligne en cours (relu par le décodeur) avec la mention « Pour la ligne en cours. » ; une cellule vide, un texte trop long et l\'absence de ligne ont chacun leur message ; « Insérer » reste possible pour une colonne vide ou sans ligne, pas pour un texte trop long',
    run: async (h) => {
      const rows = await seed(h);
      await openWindow();
      await typeInField('#QrClients.Site');
      const caption = document.querySelector('#pp-qr-modal .pp-qr-caption');
      const first = { read: await decode(previewImage().src), caption: !caption.hidden && caption.textContent, ok: !okButton().disabled };
      window.__gristStub.fireRecord(recordOf(rows, 2), PAGE_TABLE);
      await sleep(80);
      await typeInField('#QrClients.Site ');
      const second = await decode(previewImage().src);
      window.__gristStub.fireRecord(recordOf(rows, 3), PAGE_TABLE);
      await sleep(80);
      await typeInField('#QrClients.Site');
      const empty = { message: previewMessage().textContent, hidden: previewImage().hidden, ok: !okButton().disabled, caption: caption.hidden };
      await typeInField('Plus ' + '#QrClients.Long');
      window.__gristStub.fireRecord(recordOf(rows, 1), PAGE_TABLE);
      await sleep(80);
      await typeInField('#QrClients.Long');
      const tooLong = { message: previewMessage().textContent, ok: !okButton().disabled };
      const realRecord = GristAPI.getCurrentRecord;
      GristAPI.getCurrentRecord = () => null;
      await typeInField('#QrClients.Site');
      const noRecord = { message: previewMessage().textContent, ok: !okButton().disabled };
      GristAPI.getCurrentRecord = realRecord;
      await typeInField('https://x'.repeat(400));
      const staticTooLong = { message: previewMessage().textContent, ok: !okButton().disabled };
      await closeWindowIfOpen();
      return {
        pass: first.read === 'https://durand.example/accueil' && first.caption === 'Pour la ligne en cours.' && first.ok
          && second === 'https://roy.example/carte?x=1&y=é'
          && empty.message === 'Colonne vide pour la ligne en cours : pas de QR code.' && empty.hidden && empty.ok && empty.caption
          && tooLong.message === 'Texte trop long pour un QR code.' && !tooLong.ok
          && noRecord.message === 'Aucune ligne en cours : l’aperçu n’est pas disponible.' && noRecord.ok
          && staticTooLong.message === 'Texte trop long pour un QR code.' && !staticTooLong.ok,
        notes: JSON.stringify({ first, second, empty, tooLong, noRecord, staticTooLong }),
      };
    },
  });

  cases.push({
    id: 'qr_resizing_a_column_frame_keeps_it_square_with_the_image_toolbar',
    description: 'Le cadre d\'un QR code à colonne reste carré quand la barre flottante de l\'image l\'agrandit ou le rétrécit (zoom), et le QR code complet aussi (image carrée)',
    run: async (h) => {
      await seed(h);
      Editor.setHTML('<p>Avant</p>');
      await sleep(100);
      await placeCursorAtEnd();
      await insertQr('#QrClients.Site');
      await selectQr();
      const sizes = [];
      const measure = () => { const r = tiptap().querySelector('.editor-image-qr-placeholder').getBoundingClientRect(); sizes.push([Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10]); };
      measure();
      const press = action => document.querySelector('.v2-floating-toolbar button[data-action="' + action + '"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      press('zoom-in');
      await sleep(200);
      measure();
      press('zoom-out');
      await sleep(80);
      press('zoom-out');
      await sleep(200);
      measure();
      const widths = qrAttrs().width;
      return { pass: sizes.every(([w, hh]) => Math.abs(w - hh) < 1.5) && sizes[1][0] > sizes[0][0] && sizes[2][0] < sizes[0][0] && !qrAttrs().height, notes: JSON.stringify({ sizes, widths, height: qrAttrs().height }) };
    },
  });

  cases.push({
    id: 'qr_html_round_trip_keeps_the_text_and_old_images_are_untouched',
    description: 'Un HTML enregistré (QR code complet et QR code à colonne) se recharge à l\'identique ; une image sans texte de QR code n\'en reçoit pas',
    run: async (h) => {
      await seed(h);
      const full = await qrHtml('https://exemple.fr/garde');
      const frame = await qrHtml('Voir #QrClients.Site');
      await setDoc(h, '<p>' + full + '</p><p>' + frame + '</p><p><img class="editor-image" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="Image" style="width: 40px"></p>');
      const html = Editor.getHTML();
      const doc = parse(html);
      const imgs = Array.from(doc.querySelectorAll('img'));
      const attrs = [];
      EditorCore.getEditor().state.doc.descendants(node => { if (node.type.name === 'editorImage') attrs.push({ qr: node.attrs.qrText, hasSrc: !!node.attrs.src }); });
      return {
        pass: imgs.length === 3 && imgs[0].getAttribute('data-qr-text') === 'https://exemple.fr/garde' && imgs[0].getAttribute('src').startsWith('data:image/png') && imgs[1].getAttribute('data-qr-text') === 'Voir #QrClients.Site' && !imgs[1].hasAttribute('src')
          && !imgs[2].hasAttribute('data-qr-text') && JSON.stringify(attrs) === JSON.stringify([{ qr: 'https://exemple.fr/garde', hasSrc: true }, { qr: 'Voir #QrClients.Site', hasSrc: false }, { qr: null, hasSrc: true }]),
        notes: JSON.stringify({ attrs, srcs: imgs.map(i => i.hasAttribute('src')) }),
      };
    },
  });

  // === 4) La Lecture =======================================================================================================================================
  cases.push({
    id: 'qr_reader_shows_a_complete_qr_code_unchanged_and_draws_a_column_one_for_the_row',
    description: 'Lecture : un QR code complet reste l\'image du modèle ; un QR code à colonne est dessiné pour la ligne affichée (relu par le décodeur : l\'adresse de la ligne), à 120 px carré',
    run: async (h) => {
      const rows = await seed(h);
      const html = '<p>' + await qrHtml('https://exemple.fr/fixe') + '</p><p>' + await qrHtml('#QrClients.Site') + '</p>';
      const reader = await renderReader(html, recordOf(rows, 1));
      const imgs = Array.from(reader.querySelectorAll('img.editor-image'));
      const reads = [];
      for (const img of imgs) reads.push(await decode(img.src));
      const rects = imgs.map(i => i.getBoundingClientRect());
      return {
        pass: imgs.length === 2 && reads[0] === 'https://exemple.fr/fixe' && reads[1] === 'https://durand.example/accueil' && rects.every(r => Math.abs(r.width - r.height) < 1.5 && r.width > 90),
        notes: JSON.stringify({ reads, rects: rects.map(r => [r.width, r.height]) }),
      };
    },
  });

  cases.push({
    id: 'qr_reader_each_row_has_its_own_qr_code_and_a_link_cell_with_a_title_gives_its_address',
    description: 'Deux lignes, deux QR codes différents ; une cellule « titre adresse » (le format du widget Lien de Grist) donne l\'adresse seule quand la colonne est tout le texte, mais pas quand elle est entourée d\'autre texte',
    run: async (h) => {
      const rows = await seed(h);
      const html = '<p>' + await qrHtml('#QrClients.Site') + '</p><p>' + await qrHtml('Carte : #QrClients.Site') + '</p>';
      const r1 = await renderReader(html, recordOf(rows, 1));
      const one = await decode(r1.querySelector('img.editor-image').src);
      const r2 = await renderReader(html, recordOf(rows, 2));
      const imgs = Array.from(r2.querySelectorAll('img.editor-image'));
      const alone = await decode(imgs[0].src);
      const inside = await decode(imgs[1].src);
      return {
        pass: one === 'https://durand.example/accueil' && alone === 'https://roy.example/carte?x=1&y=é' && inside === 'Carte : Notre carte https://roy.example/carte?x=1&y=é',
        notes: JSON.stringify({ one, alone, inside }),
      };
    },
  });

  cases.push({
    id: 'qr_reader_composed_text_resolves_every_column_numbers_stay_raw',
    description: 'Un texte qui mêle adresse et colonnes (« https://suivi.fr/c/#Nom?m=#Montant ») est résolu colonne par colonne ; un nombre reste brut (12000, pas « 12 000 ») ; un accent passe en UTF-8',
    run: async (h) => {
      const rows = await seed(h);
      const html = '<p>' + await qrHtml('https://suivi.fr/c/#QrClients.Nom?m=#QrClients.Montant&n=#QrClients.Notes') + '</p>';
      const read = async id => { const r = await renderReader(html, recordOf(rows, id)); const img = r.querySelector('img.editor-image'); return img ? decode(img.src) : null; };
      const one = await read(1);
      const two = await read(2);
      return { pass: one === 'https://suivi.fr/c/Atelier Durand?m=12000&n=' && two === 'https://suivi.fr/c/Brasserie Roy?m=450&n=à emporter', notes: JSON.stringify({ one, two }) };
    },
  });

  cases.push({
    id: 'qr_reader_empty_columns_remove_the_qr_code_but_a_partly_filled_text_keeps_it',
    description: 'Toutes les colonnes vides pour la ligne : pas de QR code (la ligne de texte reste) ; une seule colonne vide sur deux : le QR code est dessiné avec le reste',
    run: async (h) => {
      const rows = await seed(h);
      const html = '<p>Site ' + await qrHtml('#QrClients.Site') + '</p><p>Mix ' + await qrHtml('#QrClients.Nom|#QrClients.Site') + '</p>';
      const reader = await renderReader(html, recordOf(rows, 3));
      const imgs = Array.from(reader.querySelectorAll('img.editor-image'));
      const mixed = imgs[0] ? await decode(imgs[0].src) : null;
      const texts = Array.from(reader.querySelectorAll('p')).map(p => p.textContent.trim());
      return { pass: imgs.length === 1 && mixed === 'Cabinet Morel|' && texts[0] === 'Site' && texts[1] === 'Mix', notes: JSON.stringify({ count: imgs.length, mixed, texts }) };
    },
  });

  cases.push({
    id: 'qr_reader_a_text_too_long_or_a_broken_library_leaves_a_note_in_the_interface_language_not_a_broken_image',
    description: 'Une cellule de 3 000 caractères, une colonne d\'une table sans liaison (illisible) ou une bibliothèque qui plante : la Lecture écrit « [QR code : texte trop long] » ou « [QR code indisponible] » (en anglais avec l\'interface), jamais d\'image cassée ; les autres QR codes se dessinent',
    run: async (h) => {
      const rows = await seed(h);
      const html = '<p>A ' + await qrHtml('#QrClients.Long') + '</p><p>B ' + await qrHtml('#QrClients.Site') + '</p><p>C ' + await qrHtml('#QrAutre.Valeur') + '</p>';
      const reader = await renderReader(html, recordOf(rows, 1));
      const notes = Array.from(reader.querySelectorAll('.error-msg')).map(n => n.textContent);
      const okImage = reader.querySelectorAll('img.editor-image').length;
      I18n.setLang('en');
      await sleep(100);
      let en;
      try {
        const readerEn = await renderReader(html, recordOf(rows, 1));
        en = Array.from(readerEn.querySelectorAll('.error-msg')).map(n => n.textContent);
      } finally { I18n.setLang('fr'); await sleep(100); }
      const real = window.qrcode;
      let broken;
      try {
        window.qrcode = () => { throw new Error('plantage'); };
        const readerBroken = await renderReader('<p>B ' + await qrHtml('#QrClients.Site') + '</p>', recordOf(rows, 1));
        broken = { notes: Array.from(readerBroken.querySelectorAll('.error-msg')).map(n => n.textContent), images: readerBroken.querySelectorAll('img').length };
      } finally { window.qrcode = real; }
      return {
        pass: JSON.stringify(notes) === JSON.stringify(['[QR code : texte trop long]', '[QR code indisponible]']) && okImage === 1 && JSON.stringify(en) === JSON.stringify(['[QR code: text too long]', '[QR code unavailable]'])
          && JSON.stringify(broken.notes) === JSON.stringify(['[QR code indisponible]']) && broken.images === 0,
        notes: JSON.stringify({ notes, okImage, en, broken }),
      };
    },
  });

  cases.push({
    id: 'qr_reader_in_a_repeated_row_zone_every_line_has_its_own_qr_code',
    description: 'Un QR code dans une ligne de tableau répétée par une boucle prend la ligne de son tour : deux lignes de commande, deux QR codes différents, relus ; la ligne du client sans commande n\'en a pas',
    run: async (h) => {
      const rows = await seed(h);
      const loop = { repeat: 'row', table: 'QrLignes', empty: 'hide' };
      const badge = '<span class="var-badge" data-table="QrLignes" data-column="Reference" data-key="QrLignes.Reference" data-loop="' + JSON.stringify(loop).replace(/"/g, '&quot;') + '" data-loop-repeat="row"></span>';
      const html = '<table><tbody><tr><td><p>' + badge + '</p></td><td><p>' + await qrHtml('#QrLignes.Reference') + '</p></td></tr></tbody></table>';
      const read = async id => {
        const reader = await renderReader(html, recordOf(rows, id));
        const imgs = Array.from(reader.querySelectorAll('img.editor-image'));
        const reads = [];
        for (const img of imgs) reads.push(await decode(img.src));
        return { rows: reader.querySelectorAll('tbody tr').length, reads };
      };
      const one = await read(1);
      const two = await read(2);
      return {
        pass: one.rows === 2 && JSON.stringify(one.reads) === JSON.stringify(['https://durand.example/p/alpha', 'https://durand.example/p/beta']) && two.rows === 1 && JSON.stringify(two.reads) === JSON.stringify(['https://roy.example/p/gamma']),
        notes: JSON.stringify({ one, two }),
      };
    },
  });

  // === 5) Le PDF et le Word ================================================================================================================================
  // Le PDF rendu par pdf.js sur un canevas : ce que le lecteur peint vraiment, relu par le décodeur - le QR code est-il lisible DANS le PDF, à sa taille ?
  async function pdfCanvas(base64) {
    await TestHelpers.ensurePdfJsLoaded();
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 3 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d', { willReadFrequently: true }), viewport }).promise;
    return canvas;
  }

  cases.push({
    id: 'qr_pdf_paints_a_readable_qr_code_per_row_at_the_size_set_in_the_editor',
    description: 'PDF : le QR code complet et le QR code à colonne sont des images de 90 pt (120 px) de côté, carrées, et le PDF rendu se relit : l\'adresse du modèle et celle de la ligne (deux lignes, deux PDF, deux adresses)',
    run: async (h) => {
      const rows = await seed(h);
      const fixed = await qrHtml('https://exemple.fr/fixe');
      const column = await qrHtml('#QrClients.Site');
      const reads = {};
      let sizes = [];
      for (const [name, html] of [['fixe', '<p>Texte avant</p><p>' + fixed + '</p>'], ['ligne1', '<p>Texte avant</p><p>' + column + '</p>'], ['ligne2', '<p>Texte avant</p><p>' + column + '</p>']]) {
        const record = recordOf(rows, name === 'ligne2' ? 2 : 1);
        const out = await h.exportPdfContent(html, null, null, { tableId: PAGE_TABLE, record });
        const images = h.findImages(out.content);
        sizes.push(images.map(i => [Math.round(i.width * 10) / 10, i.fit ? 'fit' : 'width']));
        reads[name] = await decodeCanvas(await pdfCanvas(out.base64));
      }
      return {
        pass: reads.fixe === 'https://exemple.fr/fixe' && reads.ligne1 === 'https://durand.example/accueil' && reads.ligne2 === 'https://roy.example/carte?x=1&y=é' && sizes.every(s => s.length === 1 && Math.abs(s[0][0] - 90) < 0.6 && s[0][1] === 'width'),
        notes: JSON.stringify({ reads, sizes }),
      };
    },
  });

  cases.push({
    id: 'qr_pdf_a_row_without_value_has_no_image_and_a_batch_gives_each_row_its_own_file',
    description: 'PDF : une ligne dont la colonne est vide n\'a aucune image (texte seul) ; le même modèle exporté pour trois lignes (comme le lot) donne trois PDF, deux avec leur QR code et un sans',
    run: async (h) => {
      const rows = await seed(h);
      const html = '<p>Texte avant</p><p>' + await qrHtml('#QrClients.Site') + '</p><p>Texte après</p>';
      const out = [];
      for (const id of [1, 2, 3]) {
        const result = await h.exportPdfContent(html, null, null, { tableId: PAGE_TABLE, record: recordOf(rows, id) });
        out.push({ images: h.findImages(result.content).length, read: h.findImages(result.content).length ? await decodeCanvas(await pdfCanvas(result.base64)) : null });
      }
      return {
        pass: out[0].images === 1 && out[0].read === 'https://durand.example/accueil' && out[1].images === 1 && out[1].read === 'https://roy.example/carte?x=1&y=é' && out[2].images === 0,
        notes: JSON.stringify(out),
      };
    },
  });

  async function docxFor(html, record) {
    await ExportCommon.ensureJsZipLoaded();
    await DocxExport.ensureDocxLibLoaded();
    const { blob } = await DocxExport.getDocxBlobForRecord(html, PAGE_TABLE, record, '', null, null);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const names = Object.keys(zip.files).filter(n => n.startsWith('word/media/') && !zip.files[n].dir);
    const document = new DOMParser().parseFromString(await zip.file('word/document.xml').async('string'), 'application/xml');
    const media = [];
    for (const name of names) media.push({ name, url: URL.createObjectURL(new Blob([await zip.file(name).async('uint8array')], { type: 'image/png' })) });
    return { document, media };
  }

  cases.push({
    id: 'qr_docx_embeds_a_square_png_per_qr_code_that_the_decoder_reads_back',
    description: 'Word : un QR code complet et un QR code à colonne sont deux images PNG carrées de 120 px (90 pt, 1 143 000 EMU) dans le flux du texte, relues par le décodeur : l\'adresse du modèle et celle de la ligne',
    run: async (h) => {
      const rows = await seed(h);
      const html = '<p>Avant ' + await qrHtml('https://exemple.fr/fixe') + '</p><p>Après ' + await qrHtml('#QrClients.Site') + '</p>';
      const { document: doc, media } = await docxFor(html, recordOf(rows, 1));
      const drawings = h.docxDrawings(doc);
      const reads = [];
      for (const m of media) reads.push(await decode(m.url));
      return {
        pass: drawings.length === 2 && drawings.every(d => d.kind === 'inline' && Math.abs(d.widthPt - d.heightPt) < 0.6 && Math.abs(d.widthPt - 90) < 0.6) && media.length === 2 && reads.includes('https://exemple.fr/fixe') && reads.includes('https://durand.example/accueil'),
        notes: JSON.stringify({ drawings: drawings.map(d => [d.kind, d.widthPt, d.heightPt]), media: media.map(m => m.name), reads }),
      };
    },
  });

  cases.push({
    id: 'qr_docx_a_row_without_value_has_no_image',
    description: 'Word : la ligne dont la colonne est vide n\'a aucune image ; la suivante a la sienne',
    run: async (h) => {
      const rows = await seed(h);
      const html = '<p>Avant</p><p>' + await qrHtml('#QrClients.Site') + '</p>';
      const empty = await docxFor(html, recordOf(rows, 3));
      const filled = await docxFor(html, recordOf(rows, 2));
      const read = filled.media.length ? await decode(filled.media[0].url) : null;
      return { pass: empty.media.length === 0 && h.docxDrawings(empty.document).length === 0 && filled.media.length === 1 && read === 'https://roy.example/carte?x=1&y=é', notes: JSON.stringify({ empty: empty.media.length, filled: filled.media.length, read }) };
    },
  });

  // Excel (mode grille) : la ligne « QR code… » reste active dans une grille, parce que l'image se pose sur sa case. Le classeur est dézippé, l'image relue par le décodeur.
  async function xlsxOfGrid(frame, record) {
    GridEditor.setActive(false);
    Editor.setHTML(`<table style="width: 300px;"><colgroup><col style="width: 150px;"><col style="width: 150px;"></colgroup><tbody><tr data-row-height="140" style="height: 140px"><td colwidth="150"><p>Avant</p></td><td colwidth="150"><p>${frame}</p></td></tr></tbody></table>`);
    GridEditor.setActive(true);
    await sleep(250);
    try {
      await ExportCommon.ensureJsZipLoaded();
      const { blob } = await XlsxExport.getXlsxBlobForRecord(Editor.getHTML(), PAGE_TABLE, record, '');
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const media = Object.keys(zip.files).filter(n => n.startsWith('xl/media/') && !zip.files[n].dir);
      const drawingName = Object.keys(zip.files).find(n => /^xl\/drawings\/drawing\d+\.xml$/.test(n));
      const drawing = drawingName ? await zip.file(drawingName).async('string') : '';
      const reads = [];
      for (const name of media) reads.push(await decode(URL.createObjectURL(new Blob([await zip.file(name).async('uint8array')], { type: 'image/png' }))));
      return { media: media.length, reads, anchor: /<xdr:from><xdr:col>(\d+)<\/xdr:col>.*?<xdr:row>(\d+)<\/xdr:row>/.exec(drawing), ext: /<xdr:ext cx="(\d+)" cy="(\d+)"/.exec(drawing) };
    } finally {
      GridEditor.setActive(false);
    }
  }

  cases.push({
    id: 'qr_xlsx_puts_the_qr_code_of_a_grid_cell_on_its_cell_and_a_row_without_value_has_no_image',
    description: 'Excel (grille) : le QR code à colonne d\'une case est une image PNG carrée du classeur, posée sur sa case (colonne B, ligne 1), relue par le décodeur : l\'adresse de la ligne exportée ; une ligne dont la colonne est vide n\'a aucune image',
    run: async (h) => {
      const rows = await seed(h);
      const frame = await qrHtml('#QrClients.Site');
      const filled = await xlsxOfGrid(frame, recordOf(rows, 1));
      const empty = await xlsxOfGrid(frame, recordOf(rows, 3));
      const fixed = await xlsxOfGrid(await qrHtml('https://exemple.fr/fixe'), recordOf(rows, 1));
      const square = !!filled.ext && Math.abs(Number(filled.ext[1]) - Number(filled.ext[2])) < 9525;
      return {
        pass: filled.media === 1 && filled.reads[0] === 'https://durand.example/accueil' && !!filled.anchor && filled.anchor[1] === '1' && filled.anchor[2] === '0' && square
          && empty.media === 0 && fixed.media === 1 && fixed.reads[0] === 'https://exemple.fr/fixe',
        notes: JSON.stringify({ filled: { media: filled.media, reads: filled.reads, anchor: filled.anchor && filled.anchor.slice(1, 3), ext: filled.ext && filled.ext.slice(1, 3) }, empty: empty.media, fixed: { media: fixed.media, reads: fixed.reads } }),
      };
    },
  });

  // === 6) Le suivi des modifications et les autres modes ====================================================================================================
  cases.push({
    id: 'qr_works_in_suggest_mode_and_the_frame_survives_an_edit_of_the_text_around_it',
    description: 'Suivi des modifications actif : le QR code s\'insère comme une suggestion sans casser le document ; taper du texte à côté d\'un cadre à colonne ne l\'altère pas',
    run: async (h) => {
      await seed(h);
      Editor.setHTML('<p>Avant</p>');
      await sleep(100);
      await placeCursorAtEnd();
      await insertQr('#QrClients.Site');
      await h.typeText(' puis du texte');
      await sleep(150);
      const frame = qrNodes()[0];
      const text = tiptap().textContent;
      return { pass: !!frame && frame.getAttribute('data-qr-text') === '#QrClients.Site' && !frame.hasAttribute('src') && text.includes('puis du texte'), notes: JSON.stringify({ text: text.slice(0, 60), frame: !!frame }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.qrCode = cases;
})();
