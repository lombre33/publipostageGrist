// La fenêtre « Signet » (ligne « Signet… » du menu « Lien et blocs de contenu », ou clic sur le drapeau d'un signet) : le nom du signet du paragraphe ou du titre
// où est le curseur. Un nom pose le signet (ou le renomme : les liens qui y mènent suivent), « Retirer le signet » l'enlève. L'adresse du signet, tirée du nom,
// est montrée sous le champ : c'est celle qu'écrivent les exports (js/anchors.js). Entrée valide, Échap annule.
const BookmarkDialog = (function () {
  const el = Dom.el;

  let win = null;
  let refs = null;
  let ctx = null; // { pos, named } : le bloc visé à l'ouverture

  function ensure() {
    if (win) return;
    // Le cadre et les styles sont ceux de la fenêtre du lien (css/link-dialog.css) : même largeur, mêmes notes, même bouton « Retirer ». restoreFocus: false : le focus
    // revient à l'éditeur (closeWindow), pas à la ligne du menu.
    win = ModalBase.create({ id: 'pp-bookmark-modal', titleId: 'pp-bookmark-title', size: 'sm', boxClass: 'pp-link-box', actionsClass: 'var-modal-actions', onEscape: () => closeWindow(), restoreFocus: false });
    const nameLabel = el('label', 'pp-dialog-label');
    nameLabel.htmlFor = 'pp-bookmark-name';
    const name = el('input', 'pp-dialog-input');
    name.id = 'pp-bookmark-name';
    name.type = 'text';
    name.maxLength = Anchors.MAX_NAME;
    name.autocomplete = 'off';
    name.spellcheck = false;
    name.setAttribute('aria-describedby', 'pp-bookmark-address pp-bookmark-links pp-bookmark-error');
    // Les notes et l'erreur commencent sous le champ, pas sous son libellé.
    const address = el('p', 'pp-link-note');
    address.id = 'pp-bookmark-address';
    const links = el('p', 'pp-link-note');
    links.id = 'pp-bookmark-links';
    const error = el('p', 'pp-link-note pp-link-error');
    error.id = 'pp-bookmark-error';
    error.setAttribute('role', 'alert');
    error.hidden = true;
    win.body.append(nameLabel, name, address, links, error);
    const { first: remove, cancel, ok } = win.addButtons('var-modal-danger');
    refs = { nameLabel, name, address, links, error, remove, cancel, ok };

    name.addEventListener('input', () => { clearError(); showAddress(); });
    name.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.isComposing) return;
      event.preventDefault();
      ok.click();
    });
    cancel.addEventListener('click', () => closeWindow());
    ok.addEventListener('click', apply);
    remove.addEventListener('click', removeBookmark);
  }

  function closeWindow() {
    if (win) win.hide();
    EditorCore.focusEditor();
  }

  // Le texte de l'erreur est vidé avec elle : un élément caché que aria-describedby désigne serait encore lu.
  function clearError() {
    refs.error.hidden = true;
    refs.error.textContent = '';
    refs.name.removeAttribute('aria-invalid');
  }

  function showError(key) {
    refs.error.textContent = I18n.t(key);
    refs.error.hidden = false;
    refs.name.setAttribute('aria-invalid', 'true');
    refs.name.focus();
  }

  // L'adresse que le nom donne, relue à chaque frappe : elle ne change que si le nom en donne une autre (js/anchors.js:previewId).
  function showAddress() {
    const editor = EditorCore.getEditor();
    const name = Anchors.cleanName(refs.name.value);
    refs.address.textContent = name && editor ? I18n.t('bookmark.address', { id: Anchors.previewId(editor, ctx.pos, name) }) : I18n.t('bookmark.hint');
  }

  // Ouvre la fenêtre sur le bloc où est le curseur ; faux (sans rien ouvrir) quand un signet n'a pas de sens ici (un tableau, une liste...).
  function open() {
    const editor = EditorCore.getEditor();
    if (!editor || !editor.isEditable) return false;
    const { block, named } = Anchors.status(editor);
    if (!block) return false;
    ensure();
    const id = block.node.attrs.anchorId || null;
    ctx = { pos: block.pos, named: !!named };
    const { nameLabel, name, links, remove, cancel, ok } = refs;
    win.title.textContent = I18n.t(named ? 'bookmark.title.edit' : 'bookmark.title.new');
    nameLabel.textContent = I18n.t('bookmark.name.label');
    name.placeholder = I18n.t('bookmark.name.placeholder');
    // Un titre propose son texte : le plus souvent, c'est le nom que la personne lui donnerait.
    name.value = named || (block.node.type.name === 'heading' ? Anchors.cleanName(block.node.textContent) : '');
    clearError();
    showAddress();
    // Les liens qui mènent déjà ici : retirer le signet les laisse sans cible, la personne doit le savoir avant.
    const count = named ? Anchors.linkCount(editor, id) : 0;
    links.textContent = count ? I18n.t('bookmark.links', { n: count }) : '';
    links.hidden = !count;
    remove.textContent = I18n.t('bookmark.remove');
    remove.hidden = !named;
    cancel.textContent = I18n.t('common.cancel');
    ok.textContent = I18n.t(named ? 'common.confirm' : 'bookmark.add');
    win.show(name);
    name.select();
    return true;
  }

  function currentBlock() {
    const editor = EditorCore.getEditor();
    const block = editor ? Anchors.blockAtSelection(editor) : null;
    return { editor, pos: block ? block.pos : null };
  }

  function apply() {
    const name = Anchors.cleanName(refs.name.value);
    if (!name) { showError('bookmark.error.empty'); return; }
    const { editor, pos } = currentBlock();
    if (pos == null) { closeWindow(); return; }
    if (Anchors.nameTaken(editor, name, pos)) { showError('bookmark.error.taken'); return; }
    Anchors.save(editor, pos, name);
    closeWindow();
  }

  function removeBookmark() {
    const { editor, pos } = currentBlock();
    if (pos != null) Anchors.save(editor, pos, '');
    closeWindow();
  }

  return { open };
})();
