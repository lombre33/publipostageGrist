// La notice d'un document : un texte court qui dit comment se servir du document (« 1. Choisis la ligne du client. 2. Passe en Lecture. 3. Exporte. »), pour un document, une grille, une présentation ou un email
// (demande du 23/11 : « une page d'explication sur le fonctionnement du modèle, une sorte de commentaire »). Comme un commentaire, elle n'est JAMAIS imprimée ni exportée : elle n'est pas dans le texte du document
// (Content) mais dans une colonne à part de la table des modèles (`Notice`, js/templates.js), que ni le PDF, ni le Word, ni l'Excel, ni l'email, ni le diaporama, ni la Lecture ne lisent.
//  - UN BANDEAU fin sous la barre d'outils (#pp-notice-bar, les mêmes classes que les autres bandeaux fins : « Revenir au document », « Polices du PDF »), en Édition comme en Lecture, tant que le document a une notice ; « Lire »
//    ouvre la fenêtre, « Fermer » le ferme pour cette session (état de session, rien n'est écrit : il revient à l'ouverture suivante, et dès que quelqu'un change la notice) ;
//  - UNE FENÊTRE (#pp-notice-modal) : la notice se lit ; qui peut modifier le document (pas la lecture seule) l'écrit dans un petit éditeur - titres, gras, italique, listes, liens, sans images - et l'enregistre, ou la
//    supprime. La fenêtre rouverte montre l'état de la table ;
//  - LA LIGNE « Notice du document… » du menu du crayon (#v2-notice-row, au survol de l'icône qui renomme le document, index.html) : c'est elle qui rouvre la notice quand le bandeau est fermé et qui permet d'en écrire une
//    (« Ajouter une notice… » tant qu'il n'y en a pas). La barre d'outils reste gelée : aucune icône de plus. Grisée, avec sa raison (LockReasons), pour un document pas encore enregistré, un macro-modèle, et pour une personne
//    en lecture seule quand il n'y a rien à lire ;
//  - ANNULER : un enregistrement ou une suppression de la notice entre dans l'historique d'Annuler / Rétablir (ActionHistory), qui rend le texte d'avant ou d'après sans écraser le geste d'une autre personne ;
//  - UN TEXTE QUI NE PASSE JAMAIS TEL QUEL : la colonne peut être écrite par une autre personne, `clean` la réduit à neuf balises (titre, paragraphe, saut de ligne, gras, italique, listes, lien) et à des liens http, mailto
//    ou tel, dans l'écriture que HtmlSanitize a déjà vérifiée.
// Styles : css/template-notice.css. Script classique ; js/main-live.js le câble (TemplateNotice.wire), js/main.js lui dit quel document est à l'écran (TemplateNotice.show) et quand le cache des modèles a été relu (sync).
//   TemplateNotice.clean(html)  -> le HTML réduit ('' quand il n'y a pas de texte)       TemplateNotice.isEmpty(html) -> vrai sans texte visible
//   TemplateNotice.show(tpl)    -> le document à l'écran change (null : document neuf)    TemplateNotice.sync()       -> le cache vient d'être relu    TemplateNotice.refresh() -> les droits ont changé
//   TemplateNotice.open()       -> ouvre la fenêtre (lecture, ou écriture quand il n'y a rien à lire et que la personne peut écrire)
//   TemplateNotice.state()      -> { id, type, notice, barShown, canWrite, canOpen } (essais)
const TemplateNotice = (function () {
  const el = Dom.el;
  const t = (key, params) => I18n.t(key, params);

  const MAX_TEXT = 20000;        // signes de texte au plus par notice
  const MAX_HTML = 120000;       // un HTML plus long n'est même pas lu
  const BAR_ID = 'pp-notice-bar';
  const ROW_ID = 'v2-notice-row';
  const MODAL_ID = 'pp-notice-modal';
  const ALLOWED = new Set(['h3', 'p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'a']);
  const RENAMED = { b: 'strong', i: 'em', h1: 'h3', h2: 'h3', h4: 'h3', h5: 'h3', h6: 'h3', div: 'p' };

  // === Le texte ===

  function textOf(html) {
    if (!html) return '';
    const root = HtmlSanitize.parseInert(html);
    return (root.textContent || '').replace(/\s+/g, ' ').trim();
  }
  const isEmpty = html => !textOf(html);

  // Une passe : l'arbre déjà parsé en inerte (HtmlSanitize.parseInert) ne garde que les neuf balises, sans autre attribut que l'adresse d'un lien sûr. Une balise de titre devient un titre, une autre balise est ouverte (son
  // texte reste), un lien sans adresse sûre n'est plus qu'un texte.
  function tighten(root) {
    Array.from(root.querySelectorAll('*')).forEach(node => {
      const doc = node.ownerDocument;
      const tag = RENAMED[node.localName] || node.localName;
      if (!ALLOWED.has(tag)) { node.replaceWith(...Array.from(node.childNodes)); return; }
      if (tag === 'a') {
        const href = HtmlSanitize.safeLinkHref(node.getAttribute('href'));
        if (!href) { node.replaceWith(...Array.from(node.childNodes)); return; }
        Array.from(node.attributes).forEach(attr => { if (attr.name !== 'href') node.removeAttribute(attr.name); });
        node.setAttribute('href', href);
        return;
      }
      const clean = tag === node.localName ? node : doc.createElement(tag);
      if (clean !== node) { while (node.firstChild) clean.appendChild(node.firstChild); node.replaceWith(clean); }
      Array.from(clean.attributes).forEach(attr => clean.removeAttribute(attr.name));
    });
    // Ce que l'éditeur écrit de trop : un paragraphe seul dans sa puce (`<li><p>…</p></li>`) se range dans la puce, et un paragraphe vide (la ligne laissée sous une liste en tapant Entrée) disparaît : l'espace entre blocs est celui de la feuille de style.
    root.querySelectorAll('li').forEach(li => {
      if (li.children.length === 1 && li.firstElementChild.localName === 'p' && !li.firstChild.nodeValue) li.firstElementChild.replaceWith(...Array.from(li.firstElementChild.childNodes));
    });
    root.querySelectorAll('p').forEach(p => { if (!p.textContent.trim() && !p.querySelector('a')) p.remove(); });
    return root;
  }

  // La notice réduite : HtmlSanitize d'abord (le HTML stable que le reste du widget accepte), puis les neuf balises, jusqu'à un texte stable (un `<a>` dans un `<a>` se réécrit en relisant). '' sans texte.
  function clean(html) {
    const input = typeof html === 'string' ? html : '';
    if (!input.trim() || input.length > MAX_HTML) return '';
    let current = HtmlSanitize.clean(input);
    for (let pass = 0; pass < 4; pass++) {
      const next = tighten(HtmlSanitize.parseInert(current)).innerHTML.trim();
      if (next === current) break;
      current = next;
    }
    return isEmpty(current) ? '' : current;
  }

  // La notice posée dans un élément, avec ses liens qui s'ouvrent à part (la fenêtre du widget ne doit jamais être remplacée).
  function paintText(box, html) {
    Dom.setMarkup(box, clean(html));
    box.querySelectorAll('a[href]').forEach(a => { a.target = '_blank'; a.rel = 'noopener noreferrer'; });
  }

  // === L'état ===

  const current = { id: null, type: '', name: '', notice: '' };
  const closedBars = new Set();       // les documents dont la personne a fermé le bandeau, pour cette session
  let wired = false;
  let host = { status: () => {} };
  let noticeBar = null;
  let row = null;
  let win = null;
  let refs = null;
  let mode = 'read';                  // 'read' ou 'edit', quand la fenêtre est ouverte
  let tipTap = null;                  // l'éditeur de la fenêtre, pendant l'écriture
  let startedWith = '';               // le texte que l'éditeur avait à l'ouverture : de quoi dire s'il a changé
  let saving = false;

  const readOnly = () => (typeof AccessRights !== 'undefined' ? !!AccessRights.get().readOnly : false);
  const isMacro = () => current.type === 'macro';
  const hasId = () => current.id != null && current.id !== '';

  // Ce que le document à l'écran permet : pourquoi la ligne est grisée ({ cause, kind, text } ou null) et si la personne peut écrire.
  function lockOf() {
    if (isMacro()) return { cause: 'mode', kind: 'macro', text: t('notice.lock.macro') };
    if (!hasId()) return { cause: 'mode', kind: 'unsaved', text: t('notice.lock.unsaved') };
    if (readOnly() && !current.notice) return { cause: 'access', kind: 'readOnly', text: t('notice.lock.nothing') };
    return null;
  }
  const canWrite = () => !readOnly() && hasId() && !isMacro();
  const barShown = () => !!current.notice && hasId() && !isMacro() && !closedBars.has(String(current.id));

  function render() {
    if (noticeBar) noticeBar.hidden = !barShown();
    if (row) {
      const lock = lockOf();
      row.textContent = t(current.notice || readOnly() ? 'notice.row' : 'notice.row.add');
      if (lock) row.setAttribute('aria-disabled', 'true'); else row.removeAttribute('aria-disabled');
      row.classList.toggle('v2-hover-row-disabled', !!lock);
      if (typeof LockReasons !== 'undefined') LockReasons.set(row, lock ? lock.cause : 'mode', lock ? lock.text : '', lock ? lock.kind : 'notice');
    }
  }

  // Le document à l'écran change : `tpl` est son entrée du cache (null : un document neuf, pas encore enregistré).
  function show(tpl) {
    current.id = tpl ? tpl.id : null;
    current.type = tpl ? tpl.typeModele || 'document' : '';
    current.name = tpl ? tpl.nom || '' : '';
    current.notice = tpl ? clean(tpl.notice) : '';
    if (win && win.isOpen()) closeWindow();
    render();
  }

  // Le cache des modèles vient d'être relu (enregistrement automatique, liste) : une autre personne a pu changer la notice. Une notice changée redonne son bandeau, même fermé.
  function sync() {
    if (typeof Templates === 'undefined') return;
    // Le document à l'écran a changé sans passer par `show` (un document neuf qui vient d'être enregistré prend son identifiant) : il est adopté, avec sa notice.
    const wanted = Templates.getCurrentId();
    const wantedKey = wanted == null ? '' : String(wanted);
    if (wantedKey !== (hasId() ? String(current.id) : '')) {
      const adopted = wantedKey ? Templates.byId(wanted) : null;
      if (adopted || !wantedKey) show(adopted);
      return;
    }
    if (!hasId()) return;
    const tpl = Templates.byId(current.id);
    if (!tpl) return;
    const next = clean(tpl.notice);
    if (next === current.notice) return;
    current.notice = next;
    closedBars.delete(String(current.id));
    render();
    if (win && win.isOpen() && mode === 'read') paintRead();
  }

  // === L'historique d'Annuler / Rétablir ===

  // La notice du document `id` est passée de `from` à `to` : défaire la rend à `from`, rétablir la pose de nouveau. Si la notice n'est plus celle que l'action avait laissée (une autre personne l'a changée), rien n'est écrit.
  function noticeAction(id, from, to) {
    async function put(target, expected) {
      if (readOnly()) throw new Error('lecture seule');
      const tpl = Templates.byId(id);
      if (!tpl) throw ActionHistory.conflict(t('history.templateGone'));
      if (clean(tpl.notice) !== expected) throw ActionHistory.conflict(t('notice.history.changed'));
      await Templates.saveNotice(id, target);
      if (String(current.id) === String(id)) {
        current.notice = target;
        closedBars.delete(String(id));
        render();
        if (win && win.isOpen() && mode === 'read') paintRead();
      }
      return t(target ? 'notice.history.back' : 'notice.history.removed', { name: tpl.nom });
    }
    return { undo: () => put(from, to), redo: () => put(to, from) };
  }

  // === La fenêtre ===

  const isDirty = () => !!tipTap && clean(tipTap.getHTML()) !== startedWith;

  function closeWindow() {
    leaveEditor();
    if (win) win.hide();
  }

  function leaveEditor() {
    if (tipTap) { try { tipTap.destroy(); } catch (e) { /* déjà détruit */ } tipTap = null; }
    if (refs && refs.editorHost) refs.editorHost.textContent = '';
  }

  function ensureWindow() {
    if (win) return;
    win = ModalBase.create({
      id: MODAL_ID, titleId: 'pp-notice-title', size: 'md', boxClass: 'pp-notice-box', actionsClass: 'var-modal-actions',
      onEscape: () => { leave(); },
    });
    const view = el('div', 'pp-notice-text');
    view.id = 'pp-notice-view';
    const hint = el('p', 'pp-notice-hint');
    hint.id = 'pp-notice-hint';
    const tools = el('div', 'pp-notice-tools');
    tools.setAttribute('role', 'toolbar');
    tools.id = 'pp-notice-tools';
    const editorHost = el('div', 'pp-notice-editor');
    editorHost.id = 'pp-notice-editor';
    const problem = el('p', 'pp-notice-problem');
    problem.id = 'pp-notice-problem';
    problem.setAttribute('role', 'alert');
    problem.hidden = true;
    win.body.append(view, hint, tools, editorHost, problem);
    const buttons = win.addButtons('var-modal-danger');
    refs = { view, hint, tools, editorHost, problem, remove: buttons.first, cancel: buttons.cancel, ok: buttons.ok, toolButtons: {} };
    refs.remove.id = 'pp-notice-remove';
    refs.cancel.id = 'pp-notice-cancel';
    refs.ok.id = 'pp-notice-ok';
    buildTools();
    refs.remove.onclick = () => removeNotice();
    refs.cancel.onclick = () => leave();
    refs.ok.onclick = () => { if (mode === 'edit') saveNotice(); else startEditing(); };
  }

  // Les boutons de l'éditeur : un texte court chacun (l'éditeur ne montre ni image ni tableau).
  const TOOLS = [
    { id: 'heading', key: 'notice.tool.heading', tip: 'notice.tool.heading.title', active: ed => ed.isActive('heading'), run: ed => ed.chain().focus().toggleHeading({ level: 3 }).run() },
    { id: 'bold', key: 'notice.tool.bold', tip: 'notice.tool.bold.title', active: ed => ed.isActive('bold'), run: ed => ed.chain().focus().toggleBold().run() },
    { id: 'italic', key: 'notice.tool.italic', tip: 'notice.tool.italic.title', active: ed => ed.isActive('italic'), run: ed => ed.chain().focus().toggleItalic().run() },
    { id: 'bullets', key: 'notice.tool.bullets', tip: 'notice.tool.bullets.title', active: ed => ed.isActive('bulletList'), run: ed => ed.chain().focus().toggleBulletList().run() },
    { id: 'numbers', key: 'notice.tool.numbers', tip: 'notice.tool.numbers.title', active: ed => ed.isActive('orderedList'), run: ed => ed.chain().focus().toggleOrderedList().run() },
    { id: 'link', key: 'notice.tool.link', tip: 'notice.tool.link.title', active: ed => ed.isActive('link'), run: ed => askLink(ed) },
  ];

  function buildTools() {
    TOOLS.forEach(tool => {
      const button = el('button', 'pp-notice-tool');
      button.type = 'button';
      button.id = 'pp-notice-tool-' + tool.id;
      button.setAttribute('aria-pressed', 'false');
      // Un clic ne prend pas le focus au texte : la sélection reste celle que la commande transforme.
      button.addEventListener('mousedown', event => event.preventDefault());
      button.onclick = () => { if (tipTap) { tool.run(tipTap); syncTools(); } };
      refs.tools.append(button);
      refs.toolButtons[tool.id] = button;
    });
  }

  function syncTools() {
    TOOLS.forEach(tool => {
      const button = refs.toolButtons[tool.id];
      button.setAttribute('aria-pressed', tipTap && tool.active(tipTap) ? 'true' : 'false');
    });
  }

  // L'adresse tapée : une adresse web, une adresse email (mailto:) ou un numéro (tel:) ; « exemple.fr » devient https://exemple.fr. Rien d'autre ne devient un lien.
  function hrefOf(raw) {
    const value = String(raw || '').trim();
    if (!value) return '';
    if (/^(?:https?:|mailto:|tel:)/i.test(value)) return HtmlSanitize.safeLinkHref(value) || '';
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'mailto:' + value;
    if (/^[^\s:]+\.[^\s:]+/.test(value) && !/\s/.test(value)) return 'https://' + value;
    return '';
  }

  async function askLink(editor) {
    const was = editor.getAttributes('link').href || '';
    const typed = await Dialogs.prompt({ title: t('notice.link.title'), label: t('notice.link.label'), value: was, placeholder: 'https://', confirmLabel: t('common.confirm') });
    if (typed == null || !tipTap) return;
    if (!String(typed).trim()) { editor.chain().focus().extendMarkRange('link').unsetLink().run(); syncTools(); return; }
    const href = hrefOf(typed);
    if (!href) { showProblem(t('notice.link.bad')); return; }
    showProblem('');
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    syncTools();
  }

  function showProblem(text) {
    if (!refs) return;
    refs.problem.textContent = text || '';
    refs.problem.hidden = !text;
  }

  // Ce que la fenêtre montre en lecture : le titre, la notice, « Modifier la notice » et « Supprimer la notice » pour qui peut écrire.
  function paintRead() {
    mode = 'read';
    leaveEditor();
    showProblem('');
    win.title.textContent = t('notice.title', { name: current.name });
    refs.view.hidden = false;
    paintText(refs.view, current.notice);
    refs.hint.hidden = true;
    refs.tools.hidden = true;
    refs.editorHost.hidden = true;
    const writable = canWrite();
    refs.remove.hidden = !(writable && current.notice);
    refs.remove.textContent = t('notice.remove');
    refs.cancel.textContent = t('common.close');
    refs.ok.hidden = !writable;
    refs.ok.textContent = t(current.notice ? 'notice.edit' : 'notice.write');
  }

  // L'éditeur : un TipTap à part, réduit à ce que la notice garde. Ses classes `tiptap` et `ProseMirror` sont celles du document (ses règles de page, et les scripts qui cherchent « l'éditeur ») : il ne les garde pas.
  async function startEditing() {
    if (!canWrite()) return;
    mode = 'edit';
    ensureWindow();
    showProblem('');
    win.title.textContent = t('notice.title', { name: current.name });
    refs.view.hidden = true;
    refs.hint.hidden = false;
    refs.hint.textContent = t('notice.hint');
    refs.tools.hidden = false;
    refs.editorHost.hidden = false;
    refs.remove.hidden = true;
    refs.cancel.textContent = t('common.cancel');
    refs.ok.hidden = false;
    refs.ok.textContent = t('notice.save');
    Object.keys(refs.toolButtons).forEach(id => {
      const tool = TOOLS.find(item => item.id === id);
      refs.toolButtons[id].textContent = t(tool.key);
      refs.toolButtons[id].title = t(tool.tip);
    });
    const libs = await Editor.loadLibraries();
    if (mode !== 'edit' || !win.isOpen()) return;
    leaveEditor();
    startedWith = current.notice;
    const instance = new libs.TiptapEditor({
      element: refs.editorHost,
      extensions: [libs.StarterKit.configure({
        heading: { levels: [3] }, bold: {}, italic: {}, bulletList: {}, orderedList: {}, listItem: {}, link: { openOnClick: false, autolink: false, defaultProtocol: 'https' },
        blockquote: false, codeBlock: false, code: false, horizontalRule: false, strike: false, underline: false, listKeymap: false,
      })],
      content: current.notice || '<p></p>',
      editorProps: { attributes: { class: 'pp-notice-prose', role: 'textbox', 'aria-multiline': 'true', 'aria-label': t('notice.editor.aria') } },
      onTransaction: () => syncTools(),
    });
    tipTap = instance;
    instance.view.dom.classList.remove('tiptap', 'ProseMirror');
    syncTools();
    win.show(instance.view.dom);
    instance.commands.focus('end');
  }

  // Quitter l'écriture : « Annuler » et Échap. Un texte changé demande confirmation ; sans notice avant, la fenêtre se ferme.
  async function leave() {
    if (mode === 'edit') {
      if (isDirty() && !(await Dialogs.confirm({ title: t('notice.discard.title'), message: t('notice.discard.message'), confirmLabel: t('notice.discard.confirm'), danger: true }))) return;
      if (current.notice) { paintRead(); win.show(refs.ok.hidden ? refs.cancel : refs.ok); return; }
    }
    closeWindow();
  }

  async function saveNotice() {
    if (saving || !tipTap || !canWrite()) return;
    const html = clean(tipTap.getHTML());
    if (textOf(html).length > MAX_TEXT) { showProblem(t('notice.tooLong', { max: String(MAX_TEXT) })); return; }
    await write(html);
  }

  async function removeNotice() {
    if (saving || !canWrite() || !current.notice) return;
    if (!(await Dialogs.confirm({ title: t('notice.remove.title'), message: t('notice.remove.message'), confirmLabel: t('notice.remove'), danger: true }))) return;
    await write('');
  }

  // Écrit la notice du document à l'écran (« » : la supprime), la range dans l'historique d'Annuler et redonne la lecture.
  async function write(html) {
    const id = current.id;
    const before = current.notice;
    saving = true;
    refs.ok.disabled = true;
    refs.remove.disabled = true;
    try {
      await Templates.saveNotice(id, html);
    } catch (e) {
      console.error('[TemplateNotice] notice non enregistrée', e);
      showProblem(t('notice.saveError'));
      return;
    } finally {
      saving = false;
      refs.ok.disabled = false;
      refs.remove.disabled = false;
    }
    if (String(current.id) !== String(id)) { closeWindow(); return; }   // un autre document est à l'écran depuis : rien à montrer
    current.notice = html;
    closedBars.delete(String(id));
    if (before !== html) ActionHistory.add(noticeAction(id, before, html));
    host.status(t(html ? 'notice.saved' : 'notice.removed'));
    render();
    if (html) { paintRead(); win.show(refs.cancel); } else closeWindow();
  }

  // Ouvre la fenêtre : la lecture quand il y a une notice (ou que la personne ne peut pas écrire), l'écriture sinon.
  function open() {
    if (lockOf()) return false;
    ensureWindow();
    paintRead();
    win.show(refs.cancel);
    if (!current.notice && canWrite()) startEditing();
    return true;
  }

  // === Le câblage ===

  function wire(options) {
    if (wired) return;
    wired = true;
    host = Object.assign({}, host, options || {});
    noticeBar = document.getElementById(BAR_ID);
    row = document.getElementById(ROW_ID);
    if (noticeBar) {
      const read = noticeBar.querySelector('.pp-notice-bar-read');
      const close = noticeBar.querySelector('.pp-notice-bar-close');
      if (read) read.addEventListener('click', () => open());
      if (close) close.addEventListener('click', () => { closedBars.add(String(current.id)); render(); });
    }
    if (row) {
      const go = () => { if (row.getAttribute('aria-disabled') !== 'true') open(); };
      row.addEventListener('click', go);
      row.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); go(); } });
    }
    render();
  }

  // Les droits de la personne ont changé en route (la table des droits est relue, js/main-access.js:applyAccessRights) : la ligne du menu et la fenêtre ouverte suivent.
  function refresh() {
    render();
    if (win && win.isOpen() && mode === 'read') paintRead();
  }

  const state = () => ({ id: current.id, type: current.type, notice: current.notice, barShown: barShown(), canWrite: canWrite(), canOpen: !lockOf() });

  return { wire, show, sync, refresh, open, clean, isEmpty, textOf, state, MAX_TEXT };
})();
