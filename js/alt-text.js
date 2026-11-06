// Texte alternatif d'une image (demande du 06/11, « Texte alternatif des images et des objets ») : ce qu'un lecteur d'écran lit à la place de l'image, et ce que Word,
// PowerPoint, un fichier HTML ou Markdown gardent d'elle. Le nœud « image » (js/editor-nodes.js) porte `alt` (le texte) et `decorative` (« Image décorative » : rien à lire, un filet,
// un fond, un motif) ; ce fichier dit ce qui compte comme une image décrite, nettoie le texte, lit une <img> du HTML d'une Lecture ou d'un export, et pose la fenêtre.
//
// Le geste (choix du 06/11) : un bouton « Texte alternatif… » dans la barre de l'image, qui ouvre cette petite fenêtre - un champ et la case « Image décorative » - ; la
// touche Ctrl+Alt+Y (la même que Google Docs) l'ouvre sur l'image sélectionnée. Le bouton s'allume quand l'image est décrite. Un texte écrit se pose d'UN pas d'historique.
//
// L'ancien texte « Image » (le mot que l'insertion posait à toute image sans rien dire de ce qu'elle montre) ne compte pas comme une description : le champ s'ouvre vide, et les exports
// l'écrivent vide, un lecteur d'écran ne lit donc plus « Image » pour une image qu'il ne sait pas décrire.
const AltText = (function () {
  // Au plus 500 signes, comme le texte alternatif d'un cadre de diapositive (js/free-frame.js) : c'est la limite de PowerPoint.
  const MAX = 500;
  const PLACEHOLDER = 'Image';

  // Un texte alternatif : une ligne, les blancs ramenés à une espace, sans signe de commande ; '' quand il n'y en a pas.
  const clean = raw => (typeof raw === 'string' ? raw.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX) : '');
  // Le texte qui décrit vraiment l'image : '' pour l'ancien « Image ».
  const textOf = raw => { const text = clean(raw); return text === PLACEHOLDER ? '' : text; };
  const isDecorative = value => value === true || value === 'true';
  // Une image décrite : décorative, ou avec un texte.
  const isDescribed = attrs => !!attrs && (isDecorative(attrs.decorative) || !!textOf(attrs.alt));
  // Ce que le HTML d'une <img> dit (la Lecture, les exports) : `decorative`, et `text` - vide pour une image décorative, comme dans PowerPoint et Word.
  function ofImage(img) {
    const decorative = !!img && img.getAttribute('data-decorative') === 'true';
    return { decorative, text: decorative || !img ? '' : textOf(img.getAttribute('alt')) };
  }

  // La fenêtre
  let win = null;
  let refs = null;
  let state = null;

  // L'image sélectionnée : { node, pos }, sinon null.
  function selectedNode(ed) {
    const node = ed && ed.state.selection.node;
    return node && node.type && node.type.name === 'editorImage' ? { node, pos: ed.state.selection.from } : null;
  }
  const canOpen = () => { const ed = EditorCore.getEditor(); return !!ed && ed.isEditable && !!selectedNode(ed); };

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

    input.addEventListener('input', syncCount);
    // Entrée valide (un texte alternatif tient sur une ligne) ; Maj+Entrée ne fait rien de plus.
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
    const found = ed && ed.isEditable ? selectedNode(ed) : null;
    if (!found) return false;
    ensure();
    state = { pos: found.pos };
    const { label, input, hint, decorative, decorativeText, decorativeHint, cancel, ok } = refs;
    win.title.textContent = I18n.t('altText.title');
    label.textContent = I18n.t('altText.label');
    input.placeholder = I18n.t('altText.placeholder');
    input.value = textOf(found.node.attrs.alt);
    hint.textContent = I18n.t('altText.hint');
    decorative.checked = isDecorative(found.node.attrs.decorative);
    decorativeText.textContent = I18n.t('altText.decorative');
    decorativeHint.textContent = I18n.t('altText.decorativeHint');
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
    if (!current || current.type.name !== 'editorImage') { closeWindow(); return; }
    const decorative = refs.decorative.checked;
    const alt = decorative ? '' : clean(refs.input.value);
    const unchanged = alt === textOf(current.attrs.alt) && decorative === isDecorative(current.attrs.decorative);
    if (!unchanged) EditorCore.patchNodeAndReselect(ed, state.pos, Object.assign({}, current.attrs, { alt, decorative }));
    closeWindow();
  }

  return { MAX, PLACEHOLDER, clean, textOf, isDecorative, isDescribed, ofImage, canOpen, open };
})();
