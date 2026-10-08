// QR code de l'éditeur. C'est une image `img.editor-image` comme les autres (taille, alignement, calque, opacité, exports PDF et Word : rien de
// nouveau), qui porte en plus son texte dans `data-qr-text` (attribut `qrText` du nœud, js/editor-nodes.js). Deux cas, selon ce que le texte contient
// :
//  - une adresse ou un texte sans colonne (« https://exemple.fr ») : le QR code est dessiné à l'insertion, l'image est complète dans le modèle ;
//  - une colonne ou plus (« #Clients.Site », « https://suivi.fr/#Commandes.Numero ») : l'éditeur montre un cadre (comme « Image depuis une variable
//    »), sans image ; le QR code est dessiné à la Lecture et à l'export pour chaque ligne (resolveImage, appelé par js/reader-mode.js), jamais
//    enregistré dans le modèle. Une ligne dont toutes les colonnes sont vides n'a pas de QR code, comme une image sans pièce jointe.
// La bibliothèque (qrcode-generator 1.4.4, MIT) se charge à la première utilisation, depuis cdnjs avec un hash SRI, comme JSZip (js/export-common.js)
// ; le dessin (PNG, modules de pixels entiers, marge de 4 modules) se fait ici. La fenêtre « QR code… » s'ouvre depuis le menu « Lien et blocs de
// contenu » (index.html, js/main-toolbar.js) ; styles dans css/qr-code.css.
const QrCode = (function () {
  const el = Dom.el;

  // Recalculer le hash si la version change : `curl -s <url> | openssl dgst -sha384 -binary | openssl base64 -A`.
  const LIB = { src: 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js', integrity: 'sha384-mZT2gIty7ZDdOGkxfP6joZcYdMW1Jvj9dRlfpTmaJAKKXTqzygtB22k7FLe+KZC1' };
  const ERROR_LEVEL = 'M';      // 15 % de la surface peut manquer : le niveau d'usage pour une adresse imprimée
  const QUIET_MODULES = 4;      // la marge blanche exigée par la norme, comptée en modules
  const TARGET_PX = 640;        // côté visé de l'image : de quoi imprimer net à 3 cm, avec des modules de pixels entiers
  const DEFAULT_WIDTH_PX = 120; // ~3,2 cm à l'écran comme à l'impression : lisible sans prendre la page
  const ALT = 'QR code';

  // La bibliothèque
  let libPromise = null;
  // Résolue quand `window.qrcode` est prêt (le texte s'encode en UTF-8, pas en une lettre par octet comme par défaut) ; rejetée si le script ne
  // charge pas, et réessayée alors à l'appel suivant.
  function ensureLibrary() {
    if (!libPromise) {
      libPromise = (window.qrcode ? Promise.resolve() : ExportCommon.loadScriptOnce(LIB)).then(() => {
        const utf8 = window.qrcode.stringToBytesFuncs && window.qrcode.stringToBytesFuncs['UTF-8'];
        if (utf8) window.qrcode.stringToBytes = utf8;
      }).catch(e => { libPromise = null; throw e; });
    }
    return libPromise;
  }

  function tooLongError() {
    const error = new Error('QR code : texte trop long');
    error.tooLong = true;
    return error;
  }
  // Les modules du QR code de `text` : { count, isDark(ligne, colonne) }. Lève une erreur `tooLong` quand le texte ne tient pas dans le plus grand QR
  // code (2 331 octets).
  async function modulesOf(text) {
    await ensureLibrary();
    const qr = window.qrcode(0, ERROR_LEVEL);
    qr.addData(String(text));
    try { qr.make(); } catch (e) { throw tooLongError(); }
    return { count: qr.getModuleCount(), isDark: (row, col) => qr.isDark(row, col) };
  }

  // Le QR code de `text` en PNG (adresse `data:`) : noir sur blanc, marge comprise, chaque module un carré de pixels entiers (net à l'impression, lu
  // par tous les lecteurs). Le PDF et le Word le reprennent comme n'importe quelle image.
  async function dataUri(text) {
    const { count, isDark } = await modulesOf(text);
    const total = count + 2 * QUIET_MODULES;
    const scale = Math.max(2, Math.ceil(TARGET_PX / total));
    const canvas = document.createElement('canvas');
    canvas.width = total * scale;
    canvas.height = total * scale;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000000';
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (isDark(row, col)) ctx.fillRect((col + QUIET_MODULES) * scale, (row + QUIET_MODULES) * scale, scale, scale);
      }
    }
    return canvas.toDataURL('image/png');
  }

  // Le texte et ses colonnes
  // Les colonnes écrites dans le texte (« #Table.Colonne », comme dans l'objet d'un e-mail ou le nom du PDF) : [{ start, end, table, column }].
  function columnsIn(text) {
    try { return Variables.findTextVariables(String(text || '')); } catch (e) { return []; }
  }
  const hasColumns = text => columnsIn(text).length > 0;

  // Une colonne « Lien » de Grist peut contenir « titre adresse » : l'adresse est le dernier mot (HyperLinkTextBox.ts et constructUrl dans
  // grist-core). Quand le texte du QR code est cette colonne et rien d'autre, c'est l'adresse qu'il porte ; toute autre valeur reste telle quelle.
  function linkOf(value) {
    const text = String(value == null ? '' : value).trim();
    const cut = text.lastIndexOf(' ');
    return cut > 0 && /^https?:\/\/\S+$/i.test(text.slice(cut + 1)) ? text.slice(cut + 1) : value;
  }

  // Le texte du QR code pour la ligne `record` : { text, failed, empty }. `failed` : une colonne n'a pas pu être lue ; `empty` : le texte a des
  // colonnes et toutes sont vides pour cette ligne. `opts` : ligne du tour d'une zone répétée, comme pour une bulle (js/loop-rules.js). Les nombres
  // restent bruts (« 12000 », pas « 12 000 »).
  async function resolveTemplate(template, tableId, record, opts) {
    const found = columnsIn(template);
    if (!found.length) return { text: template, failed: false, empty: false };
    const alone = found.length === 1 && found[0].start === 0 && found[0].end === template.length;
    let text = '';
    let last = 0;
    let failed = false;
    let filled = 0;
    for (const column of found) {
      const result = await Variables.resolveVariableResult(column.table, column.column, tableId, record, null, Object.assign({ rawNumbers: true }, opts));
      if (result.isError) failed = true;
      let value = result.isError ? '' : String(result.text == null ? '' : result.text);
      if (alone) value = String(linkOf(value));
      if (value.trim()) filled += 1;
      text += template.slice(last, column.start) + value;
      last = column.end;
    }
    text += template.slice(last);
    return { text, failed, empty: filled === 0 };
  }

  // À la Lecture et à l'export
  function noteInPlaceOf(img, key) {
    const span = document.createElement('span');
    span.className = 'resolved-var error-msg';
    span.textContent = I18n.t(key);
    img.replaceWith(span);
  }
  // `needsImage` : un QR code dont le texte a des colonnes n'a pas d'image dans le modèle ; celui d'un texte seul a déjà la sienne et n'est jamais
  // redessiné.
  const needsImage = img => !!img.getAttribute('data-qr-text') && !img.getAttribute('src');
  // Dessine le QR code de `img` (un cadre sans image du modèle) pour la ligne `record`. Sans valeur il disparaît ; illisible ou trop long, il laisse
  // une note dans la langue de l'interface (la Lecture et les exports écrivent ce message, pas une image cassée).
  async function resolveImage(img, tableId, record, opts) {
    if (!needsImage(img)) return;
    let resolved;
    try { resolved = await resolveTemplate(img.getAttribute('data-qr-text'), tableId, record, opts); }
    catch (e) { console.error('[QrCode] échec de la lecture des colonnes', e); resolved = { failed: true }; }
    if (resolved.failed) { noteInPlaceOf(img, 'qr.doc.unavailable'); return; }
    if (resolved.empty || !String(resolved.text).trim()) { img.remove(); return; }
    try {
      img.setAttribute('src', await dataUri(resolved.text));
    } catch (e) {
      if (!e.tooLong) console.warn('[QrCode] bibliothèque indisponible', e);
      noteInPlaceOf(img, e.tooLong ? 'qr.doc.tooLong' : 'qr.doc.unavailable');
    }
  }

  // Dans l'éditeur
  // Le nœud « image » sélectionné quand c'est un QR code : { node, pos }, sinon null.
  function selectedNode(ed) {
    const node = ed && ed.state.selection.node;
    return node && node.type && node.type.name === 'editorImage' && node.attrs.qrText ? { node, pos: ed.state.selection.from } : null;
  }
  const isSelected = ed => !!selectedNode(ed);

  // Les attributs du nœud pour ce texte : l'image complète sans colonne, aucune image (le cadre) avec une colonne ou plus.
  async function attrsFor(text) {
    return { src: hasColumns(text) ? null : await dataUri(text), alt: ALT, qrText: text };
  }

  // La fenêtre
  let win = null;
  let refs = null;
  let state = null;
  let previewToken = 0;
  let previewTimer = 0;
  let columnSearch = null;

  function ensure() {
    if (win) return;
    // restoreFocus: false : le focus revient à l'éditeur (closeWindow), pas à la ligne du menu - la sélection y est restée.
    win = ModalBase.create({ id: 'pp-qr-modal', titleId: 'pp-qr-title', size: 'md', boxClass: 'pp-qr-box', actionsClass: 'var-modal-actions', onEscape: () => closeWindow(), restoreFocus: false });
    const grid = el('div', 'pp-qr-grid');
    const form = el('div', 'pp-qr-form');
    const label = el('label', 'pp-dialog-label');
    label.htmlFor = 'pp-qr-text';
    const input = el('input', 'pp-dialog-input');
    input.id = 'pp-qr-text';
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-describedby', 'pp-qr-hint pp-qr-error');
    // L'indication et l'erreur commencent sous le champ, pas sous son libellé.
    const column = el('button', 'pp-qr-column');
    column.type = 'button';
    const hint = el('p', 'pp-qr-note');
    hint.id = 'pp-qr-hint';
    const error = el('p', 'pp-qr-note pp-qr-error');
    error.id = 'pp-qr-error';
    error.setAttribute('role', 'alert');
    error.hidden = true;
    form.append(label, input, column, hint, error);
    const side = el('div', 'pp-qr-side');
    const previewLabel = el('span', 'pp-dialog-label');
    const paper = el('div', 'pp-qr-paper');
    const image = el('img', 'pp-qr-image');
    image.alt = ALT;
    image.hidden = true;
    const message = el('p', 'pp-qr-message');
    paper.append(image, message);
    const caption = el('p', 'pp-qr-note pp-qr-caption');
    caption.hidden = true;
    side.append(previewLabel, paper, caption);
    grid.append(form, side);
    win.body.appendChild(grid);

    const { cancel, ok } = win.addButtons();
    refs = { label, input, column, hint, error, previewLabel, paper, image, message, caption, cancel, ok };

    // La saisie d'une colonne au clavier : « # » ouvre la même liste que dans l'objet d'un e-mail (js/variables.js), rangée par-dessus la fenêtre
    // (css/qr-code.css).
    Variables.initFilenameInput(input);
    input.addEventListener('input', () => { clearError(); schedulePreview(); });
    // Entrée valide, sauf quand la liste des colonnes tapées est ouverte : elle a déjà pris la touche pour choisir.
    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.isComposing || event.defaultPrevented) return;
      event.preventDefault();
      if (!ok.disabled) ok.click();
    });
    column.addEventListener('click', () => openColumnList());
    cancel.addEventListener('click', () => closeWindow());
    ok.addEventListener('click', apply);
  }

  function clearError() {
    refs.error.hidden = true;
    refs.error.textContent = '';
    refs.input.removeAttribute('aria-invalid');
  }
  function showError(text) {
    refs.error.textContent = text;
    refs.error.hidden = false;
    refs.input.setAttribute('aria-invalid', 'true');
  }

  function closeColumnList(instance) {
    if (!columnSearch || (instance && instance !== columnSearch)) return;
    const { host, search } = columnSearch;
    columnSearch = null;
    try { search.destroy(); } catch (e) { /* déjà défait */ }
    host.remove();
  }
  // Les colonnes où mène la flèche d'une colonne Référence de la liste, sans les pièces jointes (comme la liste elle-même : un QR code est du texte).
  function columnsBelow(key) {
    const entries = Variables.columnsBelow(key);
    return entries && entries.filter(entry => {
      const cut = entry.value.indexOf('.');
      return GristAPI.getColumnType(entry.value.slice(0, cut), entry.value.slice(cut + 1)) !== 'Attachments';
    });
  }
  // « Insérer une colonne… » : la liste avec recherche de toutes les colonnes (js/search-select.js), le même choix que partout ; la colonne choisie
  // s'écrit « #Table.Colonne » à la place de la sélection du champ, ou « #Table.Référence.Colonne » quand on est descendu dans une Référence. Le
  // <select> caché qui la porte vit dans la fenêtre, pour que son panneau soit au-dessus d'elle.
  function openColumnList() {
    closeColumnList();
    const candidates = GristAPI.getAllVariables().filter(v => v.column.indexOf('gristHelper_') !== 0 && GristAPI.getColumnType(v.table, v.column) !== 'Attachments');
    const { input, column } = refs;
    if (!candidates.length) return;
    const host = el('div', 'pp-qr-column-host');
    const select = document.createElement('select');
    candidates.forEach(v => {
      const option = document.createElement('option');
      option.value = v.key;
      option.textContent = v.key;
      option.dataset.search = Variables.columnSearchText(v.table, v.column);
      // Une colonne Référence ouvre les colonnes de sa table (flèche de la liste) : « #Projet.Accompagnateur.Email » est une variable comme une autre.
      const target = Variables.referencedTable(v.table, v.column);
      if (target) option.dataset.expand = target;
      select.appendChild(option);
    });
    host.appendChild(select);
    win.body.appendChild(host);
    select.selectedIndex = -1; // rien de choisi au départ : même la première ligne déclenche `change`
    let instance = null;
    try {
      const search = SearchSelect.attachColumns(select, {
        popup: true,
        anchor: () => column.getBoundingClientRect(),
        expand: item => columnsBelow(item.value),
        // Défait après la fin de l'évènement en cours (un blur ou un clic qui ferme le panneau ne doit pas retirer l'élément qui le porte).
        onClose: refocus => { if (refocus) input.focus(); setTimeout(() => closeColumnList(instance), 0); },
      });
      instance = { host, search };
      columnSearch = instance;
      select.addEventListener('change', () => insertColumn(select.value));
      search.open();
    } catch (e) {
      console.warn('[QrCode] liste des colonnes indisponible', e);
      host.remove();
      columnSearch = null;
    }
  }
  function insertColumn(key) {
    const { input } = refs;
    if (!key) return;
    const start = input.selectionStart == null ? input.value.length : input.selectionStart;
    const end = input.selectionEnd == null ? start : input.selectionEnd;
    const token = Variables.triggerChar() + key;
    input.value = input.value.slice(0, start) + token + input.value.slice(end);
    input.setSelectionRange(start + token.length, start + token.length);
    clearError();
    schedulePreview(0);
  }

  // L'aperçu : le QR code du texte (pour la ligne en cours quand il a des colonnes) ou, à la place, la raison pour laquelle il n'y en a pas.
  function setPreview(kind, uri) {
    const { image, message, paper, caption } = refs;
    paper.dataset.state = kind;
    const shown = kind === 'qr';
    image.hidden = !shown;
    if (shown) image.src = uri; else image.removeAttribute('src');
    message.hidden = shown;
    message.textContent = shown ? '' : I18n.t('qr.preview.' + kind);
    caption.hidden = !(shown && hasColumns(refs.input.value.trim()));
    caption.textContent = caption.hidden ? '' : I18n.t('qr.preview.row');
    // Rien à insérer sans texte, avec un texte trop long ou sans la bibliothèque ; une colonne vide ou illisible pour la ligne en cours n'empêche
    // rien : une autre ligne a peut-être sa valeur.
    refs.ok.disabled = kind === 'empty' || kind === 'tooLong' || kind === 'unavailable';
  }
  function schedulePreview(delay) {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(refreshPreview, delay === undefined ? 180 : delay);
  }
  async function refreshPreview() {
    const token = ++previewToken;
    const text = refs.input.value.trim();
    if (!text) { setPreview('empty'); return; }
    try {
      let shown = text;
      if (hasColumns(text)) {
        const record = GristAPI.getCurrentRecord();
        if (!record) { setPreview('noRecord'); return; }
        const resolved = await resolveTemplate(text, GristAPI.getCurrentTableId(), record);
        if (token !== previewToken) return;
        if (resolved.failed) { setPreview('unresolved'); return; }
        if (resolved.empty || !resolved.text.trim()) { setPreview('noValue'); return; }
        shown = resolved.text;
      }
      const uri = await dataUri(shown);
      if (token === previewToken) setPreview('qr', uri);
    } catch (e) {
      if (token !== previewToken) return;
      if (!e.tooLong) console.warn('[QrCode] aperçu indisponible', e);
      setPreview(e.tooLong ? 'tooLong' : 'unavailable');
    }
  }

  function closeWindow() {
    clearTimeout(previewTimer);
    previewToken += 1;
    closeColumnList();
    if (win) win.hide();
    EditorCore.focusEditor();
  }

  // Ouvre la fenêtre : pour modifier le QR code sélectionné s'il y en a un, sinon pour en insérer un à la place du curseur. Faux quand l'éditeur
  // n'est pas modifiable.
  function open() {
    const ed = EditorCore.getEditor();
    if (!ed || !ed.isEditable) return false;
    ensure();
    const found = selectedNode(ed);
    state = { editing: !!found, pos: found ? found.pos : null };
    const { label, input, column, hint, previewLabel, cancel, ok } = refs;
    win.title.textContent = I18n.t(found ? 'qr.title.edit' : 'qr.title.new');
    label.textContent = I18n.t('qr.text.label');
    input.placeholder = I18n.t('qr.text.placeholder');
    input.value = found ? found.node.attrs.qrText : '';
    column.textContent = I18n.t('qr.column');
    hint.textContent = I18n.t('qr.text.hint');
    previewLabel.textContent = I18n.t('qr.preview');
    cancel.textContent = I18n.t('common.cancel');
    ok.textContent = I18n.t(found ? 'common.confirm' : 'common.insert');
    clearError();
    setPreview('empty');
    win.show(() => input);
    input.select();
    refreshPreview();
    return true;
  }

  async function apply() {
    const ed = EditorCore.getEditor();
    const text = refs.input.value.trim();
    if (!ed || !text) return;
    let attrs;
    try { attrs = await attrsFor(text); }
    catch (e) { showError(I18n.t(e.tooLong ? 'qr.preview.tooLong' : 'qr.preview.unavailable')); return; }
    const current = state.editing ? ed.state.doc.nodeAt(state.pos) : null;
    if (current && current.type.name === 'editorImage') {
      // Le QR code garde sa taille, sa place et son habillage : seuls son texte et son image changent.
      EditorCore.patchNodeAndReselect(ed, state.pos, Object.assign({}, current.attrs, attrs, { height: null }));
    } else {
      // Jamais à la place de ce qui est sélectionné (une image, du texte) : le QR code s'ajoute derrière.
      const selection = ed.state.selection;
      const chain = ed.chain().focus();
      if (!selection.empty) chain.setTextSelection(selection.to);
      chain.insertImage(Object.assign({ width: DEFAULT_WIDTH_PX + 'px' }, attrs)).run();
    }
    closeWindow();
  }

  return { LIB, ensureLibrary, dataUri, resolveImage, needsImage, isSelected, attrsFor, open };
})();
