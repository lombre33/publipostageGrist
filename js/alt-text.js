// Texte alternatif d'une image (demande du 06/11, « Texte alternatif des images et des objets ») : ce qu'un lecteur d'écran lit à la place de l'image, et ce que Word,
// PowerPoint, un fichier HTML ou Markdown gardent d'elle. Le nœud « image » (js/editor-nodes.js) porte `alt` (le texte) et `decorative` (« Image décorative » : rien à lire, un filet,
// un fond, un motif) ; ce fichier dit ce qui compte comme une image décrite, nettoie le texte, lit une <img> du HTML d'une Lecture ou d'un export, et pose la fenêtre.
//
// Le geste (choix du 06/11) : un bouton « Texte alternatif… » dans la barre de l'image, qui ouvre cette petite fenêtre - un champ et la case « Image décorative » - ; la
// touche Ctrl+Alt+Y (la même que Google Docs) l'ouvre sur l'image sélectionnée. Le bouton s'allume quand l'image est décrite. Un texte écrit se pose d'UN pas d'historique.
//
// L'ancien texte « Image » (le mot que l'insertion posait à toute image sans rien dire de ce qu'elle montre) ne compte pas comme une description : le champ s'ouvre vide, et les exports
// l'écrivent vide, un lecteur d'écran ne lit donc plus « Image » pour une image qu'il ne sait pas décrire.
//
// Les OBJETS de diapositive (cadre, forme, trait : js/free-frame.js, `alt` et `decorative`) ont la même fenêtre (leurs mots : « Description de l'objet », « Objet décoratif »), ouverte par le bouton de leur
// barre ou par la même touche, que l'objet soit sélectionné ou que le curseur soit dans son texte : l'image sélectionnée passe avant.
const AltText = (function () {
  // Au plus 500 signes, comme le texte alternatif d'un cadre de diapositive (js/free-frame.js) : c'est la limite de PowerPoint.
  const MAX = 500;
  const PLACEHOLDER = 'Image';

  // Un texte alternatif : une ligne, les blancs ramenés à une espace, sans signe de commande ; '' quand il n'y en a pas.
  const clean = raw => (typeof raw === 'string' ? raw.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX) : '');
  // Le texte qui décrit vraiment l'image : '' pour l'ancien « Image ».
  const textOf = raw => { const text = clean(raw); return text === PLACEHOLDER ? '' : text; };
  // `true` / « true » (une image : data-decorative) ou « 1 » (un objet de diapositive : data-ff-decorative).
  const isDecorative = value => value === true || value === 'true' || value === '1' || value === 1;
  // Une image décrite : décorative, ou avec un texte.
  const isDescribed = attrs => !!attrs && (isDecorative(attrs.decorative) || !!textOf(attrs.alt));
  // Ce que le HTML d'une <img> dit (la Lecture, les exports) : `decorative`, et `text` - vide pour une image décorative, comme dans PowerPoint et Word.
  function ofImage(img) {
    const decorative = !!img && img.getAttribute('data-decorative') === 'true';
    return { decorative, text: decorative || !img ? '' : textOf(img.getAttribute('alt')) };
  }

  // Les mots de la fenêtre : ceux d'une image, ceux d'un objet de diapositive (cadre, forme, trait).
  const IMAGE_WORDS = { label: 'altText.label', placeholder: 'altText.placeholder', hint: 'altText.hint', decorative: 'altText.decorative', decorativeHint: 'altText.decorativeHint' };
  const OBJECT_WORDS = { label: 'altText.objectLabel', placeholder: 'altText.objectPlaceholder', hint: 'altText.objectHint', decorative: 'altText.objectDecorative', decorativeHint: 'altText.objectDecorativeHint' };

  // Les colonnes dans le texte (choix du 06/11, « comme le texte d'un QR code ») : « Photo de #Prénom #Nom » donne à chaque ligne son texte, à la Lecture et dans les exports (js/reader-mode.js :
  // resolveAltTexts). Une colonne illisible ou vide n'écrit rien ; le reste du texte demeure. Le texte reste tel quel dans le modèle (et dans l'éditeur : un lecteur d'écran y lit la clé).
  const hasColumns = text => { try { return typeof text === 'string' && Variables.findTextVariables(text).length > 0; } catch (e) { return false; } };
  async function resolveText(text, tableId, record, opts) {
    if (!hasColumns(text)) return clean(text);
    const filled = await Variables.replaceTextVariables(text, async (found) => {
      try {
        const result = await Variables.resolveVariableResult(found.table, found.column, tableId, record, null, opts);
        return result.isError || result.text == null ? '' : String(result.text);
      } catch (e) { return ''; }
    });
    return clean(filled);
  }
  // Le texte alternatif d'un élément d'un document lu (une <img> de l'éditeur, un objet de diapositive : `data-ff-alt`), rendu pour la ligne `record` ; `opts` : la ligne du tour d'une zone répétée.
  const isFrameEl = el => el.classList.contains('pp-free-frame');
  const rawOf = el => el.getAttribute(isFrameEl(el) ? 'data-ff-alt' : 'alt');
  const hasColumnsIn = el => hasColumns(rawOf(el));
  async function resolveElement(el, tableId, record, opts) {
    const text = await resolveText(rawOf(el), tableId, record, opts);
    if (!isFrameEl(el)) { el.setAttribute('alt', text); return; }
    // Un objet dont le texte devient vide n'est plus décrit : ni `data-ff-alt`, ni nom pour un lecteur d'écran.
    ['data-ff-alt', 'aria-label'].forEach((name) => {
      if (!text) el.removeAttribute(name);
      else if (name === 'data-ff-alt' || el.hasAttribute(name)) el.setAttribute(name, text);
    });
  }

  // La fenêtre
  let win = null;
  let refs = null;
  let state = null;

  // Ce qui porte le texte alternatif : l'image sélectionnée, sinon l'objet de diapositive (cadre, forme, trait) sélectionné ou dont le texte a le curseur (js/free-frame.js). { kind, pos, alt,
  // decorative, selected }, sinon null.
  function target(ed) {
    if (!ed) return null;
    const selection = ed.state.selection;
    const node = selection.node;
    if (node && node.type && node.type.name === 'editorImage') return { kind: 'image', pos: selection.from, alt: node.attrs.alt, decorative: node.attrs.decorative, selected: true };
    const frame = typeof FreeFrame === 'object' ? FreeFrame.currentFrame(ed.state) : null;
    if (!frame) return null;
    const attrs = FreeFrame.normalized(frame.node.attrs);
    return { kind: 'object', pos: frame.pos, alt: attrs.alt, decorative: attrs.decorative, selected: frame.pos === selection.from && !!node };
  }
  const canOpen = () => { const ed = EditorCore.getEditor(); return !!ed && ed.isEditable && !!target(ed); };

  function ensure() {
    if (win) return;
    // restoreFocus: false : le focus revient à l'éditeur (closeWindow), pas au bouton de la barre - l'image y est restée sélectionnée.
    win = ModalBase.create({ id: 'pp-alt-modal', titleId: 'pp-alt-title', size: 'md', boxClass: 'pp-alt-box', actionsClass: 'var-modal-actions', onEscape: () => closeWindow(), restoreFocus: false });
    const label = document.createElement('label');
    label.className = 'pp-dialog-label';
    label.htmlFor = 'pp-alt-text';
    const input = document.createElement('textarea');
    input.id = 'pp-alt-text';
    input.className = 'pp-dialog-input pp-alt-input';
    input.rows = 3;
    input.maxLength = MAX;
    input.spellcheck = true;
    input.setAttribute('aria-describedby', 'pp-alt-hint pp-alt-count');
    const hint = document.createElement('p');
    hint.id = 'pp-alt-hint';
    hint.className = 'pp-alt-note';
    const count = document.createElement('p');
    count.id = 'pp-alt-count';
    count.className = 'pp-alt-note pp-alt-count';
    const decorativeRow = document.createElement('label');
    decorativeRow.className = 'pp-alt-decorative';
    const decorative = document.createElement('input');
    decorative.type = 'checkbox';
    decorative.id = 'pp-alt-decorative';
    const decorativeText = document.createElement('span');
    decorativeRow.append(decorative, decorativeText);
    const decorativeHint = document.createElement('p');
    decorativeHint.className = 'pp-alt-note pp-alt-decorative-hint';
    win.body.append(label, input, hint, count, decorativeRow, decorativeHint);
    const { cancel, ok } = win.addButtons();
    refs = { label, input, hint, count, decorative, decorativeText, decorativeHint, cancel, ok };

    // « # » ouvre la liste des colonnes (js/variables.js), comme dans l'objet d'un e-mail ou le texte d'un QR code.
    Variables.initFilenameInput(input);
    input.addEventListener('input', syncCount);
    // Entrée valide (un texte alternatif tient sur une ligne), sauf quand la liste des colonnes est ouverte : elle a déjà pris la touche pour choisir. Maj+Entrée ne fait rien de plus.
    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.isComposing || event.defaultPrevented) return;
      event.preventDefault();
      ok.click();
    });
    decorative.addEventListener('change', syncDecorative);
    cancel.addEventListener('click', () => closeWindow());
    ok.addEventListener('click', apply);
  }

  function syncCount() {
    refs.count.textContent = I18n.t('altText.count', { n: refs.input.value.length, max: MAX });
  }
  // Une image décorative n'a rien à lire : le champ se grise (son texte reste, si la case est décochée avant d'enregistrer).
  function syncDecorative() {
    refs.input.disabled = refs.decorative.checked;
  }

  function closeWindow() {
    if (win) win.hide();
    EditorCore.focusEditor();
  }

  // Ouvre la fenêtre sur l'image sélectionnée. Faux quand aucune image n'est sélectionnée ou que l'éditeur n'est pas modifiable (la Lecture, un document en lecture seule).
  function open() {
    const ed = EditorCore.getEditor();
    const found = ed && ed.isEditable ? target(ed) : null;
    if (!found) return false;
    ensure();
    state = { pos: found.pos, kind: found.kind, selected: found.selected };
    const object = found.kind === 'object';
    const { label, input, hint, decorative, decorativeText, decorativeHint, cancel, ok } = refs;
    win.title.textContent = I18n.t('altText.title');
    const words = object ? OBJECT_WORDS : IMAGE_WORDS;
    label.textContent = I18n.t(words.label);
    input.placeholder = I18n.t(words.placeholder);
    input.value = textOf(found.alt);
    hint.textContent = I18n.t(words.hint) + ' ' + I18n.t('altText.columnHint', { key: Variables.triggerChar() });
    decorative.checked = isDecorative(found.decorative);
    decorativeText.textContent = I18n.t(words.decorative);
    decorativeHint.textContent = I18n.t(words.decorativeHint);
    cancel.textContent = I18n.t('common.cancel');
    ok.textContent = I18n.t('common.confirm');
    syncCount();
    syncDecorative();
    win.show(() => (decorative.checked ? decorative : input));
    if (!input.disabled) input.select();
    return true;
  }

  // Enregistre : le texte et la case se posent sur l'image d'un seul pas d'historique (un Ctrl+Z défait les deux). Une image décorative n'a pas de texte.
  function apply() {
    const ed = EditorCore.getEditor();
    const current = ed && state ? ed.state.doc.nodeAt(state.pos) : null;
    const decorative = refs.decorative.checked;
    const alt = decorative ? '' : clean(refs.input.value);
    if (current && state.kind === 'image' && current.type.name === 'editorImage') {
      const unchanged = alt === textOf(current.attrs.alt) && decorative === isDecorative(current.attrs.decorative);
      if (!unchanged) EditorCore.patchNodeAndReselect(ed, state.pos, Object.assign({}, current.attrs, { alt, decorative }));
    } else if (current && state.kind === 'object') {
      // FreeFrame.patch ne pose rien quand rien ne change ; l'objet reste sélectionné s'il l'était (le curseur dans son texte y reste).
      FreeFrame.patch(ed, state.pos, { alt, decorative: decorative ? '1' : '' }, state.selected);
    }
    closeWindow();
  }

  return { MAX, PLACEHOLDER, clean, textOf, isDecorative, isDescribed, ofImage, hasColumns, hasColumnsIn, resolveText, resolveElement, canOpen, open };
})();
