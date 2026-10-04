// Liens de l'éditeur. La marque `link` vient de StarterKit (js/editor.js la configure) ; ce module apporte le reste :
//  - la fenêtre « Insérer / Modifier le lien » (bouton de la barre, ligne « Lien… », Ctrl+K / ⌘K) : une adresse, plus le texte à afficher quand rien
//    n'est sélectionné ; Entrée valide, Échap annule, « Retirer le lien » quand le curseur est dans un lien ;
//  - la normalisation de l'adresse (normalizeUrl) : web, e-mail ou téléphone, rien d'autre (jamais `javascript:` ni `data:`) ;
//  - le raccourci (createExtension) et, dans l'éditeur, Ctrl/⌘+clic pour ouvrir un lien avec une info-bulle qui montre l'adresse (wireEditor) : un
//    clic simple place le curseur, sinon on ne pourrait plus corriger le lien.
// Le rendu (Lecture, PDF, Word, email) est dans leurs modules ; styles de la fenêtre : css/link-dialog.css, du lien : css/editor-v2.css.
const LinkDialog = (function () {
  const isMac = () => /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');
  const modKey = () => (isMac() ? '⌘' : 'Ctrl');
  // Même écriture que l'infobulle de Enregistrer (decorateSaveButtonShortcut dans js/main.js) : ⌘K sur macOS, Ctrl+K ailleurs, ou la touche choisie
  // dans Réglages > Raccourcis (js/shortcuts.js ; '' quand elle a été retirée).
  const shortcutLabel = () => (typeof Shortcuts !== 'undefined' ? Shortcuts.label('link') : (isMac() ? '⌘K' : 'Ctrl+K'));

  // Normalisation de l'adresse : trois familles seulement (https/http, mailto, tel), car l'adresse finit dans un href qui s'ouvre d'un clic en
  // Lecture et dans les exports. La personne n'écrit pas le schéma : « exemple.fr » devient https://exemple.fr, « nom@exemple.fr » mailto:, « 01 23
  // 45 67 89 » tel:. Retourne { href, text } (`text` : l'affichage quand aucun texte n'est donné) ou { error: 'empty' | 'invalid' }.
  const HOST = /^(?:localhost|(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?\.)+[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?)(?::\d{1,5})?(?:[/?#]\S*)?$/iu;
  const EMAIL = /^[^\s@/:?#]+@[^\s@/:?#]+\.[^\s@/:?#]{2,}$/;
  const PHONE = /^\+?\(?\d[\d\s().-]{4,}$/;
  const SCHEME = /^([a-z][a-z0-9+.-]*):/i;

  const digitsOf = value => value.replace(/\D/g, '');
  const telHref = value => 'tel:' + (value.trim().startsWith('+') ? '+' : '') + digitsOf(value);
  const isPhone = value => PHONE.test(value) && digitsOf(value).length >= 6 && digitsOf(value).length <= 15;

  function webHref(candidate) {
    let url;
    try { url = new URL(candidate); } catch (e) { return null; }
    if (!/^https?:$/.test(url.protocol) || !url.hostname) return null;
    // Une adresse sans caractère à encoder reste telle que saisie (le navigateur ajouterait une barre finale à « https://exemple.fr ») ; sinon la
    // forme encodée.
    return /[\s"<>]/.test(candidate) ? url.href : candidate;
  }

  function normalizeUrl(raw) {
    const value = String(raw == null ? '' : raw).trim();
    if (!value) return { error: 'empty' };
    const schemeMatch = value.match(SCHEME);
    // « localhost:3000 » et « exemple.fr:8080/x » ressemblent à un schéma : un numéro de port derrière les deux-points dit que c'est une machine.
    const looksLikePort = schemeMatch && /^\d+(?:[/?#]|$)/.test(value.slice(schemeMatch[0].length));
    if (schemeMatch && !looksLikePort) {
      const scheme = schemeMatch[1].toLowerCase();
      const rest = value.slice(schemeMatch[0].length);
      if (scheme === 'http' || scheme === 'https') {
        if (!rest.startsWith('//')) return { error: 'invalid' };
        const href = webHref(scheme + ':' + rest);
        return href ? { href, text: value } : { error: 'invalid' };
      }
      if (scheme === 'mailto') {
        return /^[^\s?#]+@[^\s?#]+(?:\?\S*)?$/.test(rest) ? { href: 'mailto:' + rest, text: rest.replace(/\?.*$/, '') } : { error: 'invalid' };
      }
      if (scheme === 'tel') return isPhone(rest) ? { href: telHref(rest), text: rest.trim() } : { error: 'invalid' };
      return { error: 'invalid' };
    }
    if (EMAIL.test(value)) return { href: 'mailto:' + value, text: value };
    if (isPhone(value)) return { href: telHref(value), text: value };
    if (value.startsWith('//')) { const href = webHref('https:' + value); return href ? { href, text: value } : { error: 'invalid' }; }
    if (HOST.test(value)) { const href = webHref('https://' + value); return href ? { href, text: value } : { error: 'invalid' }; }
    return { error: 'invalid' };
  }

  // Ouvre une adresse déjà normalisée par un <a> synthétique cliqué, comme partout dans le widget (window.open se comporte moins bien dans l'iframe
  // d'un widget Grist). Un lien web s'ouvre dans un nouvel onglet ; mailto: et tel: passent la main à l'application du système.
  function openExternal(href) {
    if (!/^(?:https?|mailto|tel):/i.test(href || '')) return false;
    const a = document.createElement('a');
    a.href = href;
    if (/^https?:/i.test(href)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  }

  // Ce que la sélection permet : un bloc de code n'accepte aucune marque (donc aucun lien) ; ailleurs, `can().setLink` dit si la marque passe sur la
  // sélection (une image seule, un saut de page, une sélection sans texte : non). Sans sélection, le texte du lien s'insère : il suffit que le
  // curseur soit dans un bloc de texte.
  function canLinkHere(ed) {
    if (!ed || !ed.isEditable || ed.isActive('codeBlock')) return false;
    const { selection } = ed.state;
    if (selection.empty) return selection.$from.parent.inlineContent;
    return ed.can().setLink({ href: 'https://exemple.fr' });
  }

  // La fenêtre
  let win = null;
  let refs = null;
  let ctx = null; // { from, to, empty, href, withText } : la sélection à l'ouverture

  function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function ensure() {
    if (win) return;
    // restoreFocus: false : le focus revient à l'éditeur (closeWindow), pas au bouton de la barre : la sélection y est restée.
    win = ModalBase.create({ id: 'pp-link-modal', titleId: 'pp-link-title', size: 'sm', boxClass: 'pp-link-box', actionsClass: 'var-modal-actions', onEscape: () => closeWindow(), restoreFocus: false });
    const urlLabel = el('label', 'pp-dialog-label');
    urlLabel.htmlFor = 'pp-link-url';
    const url = el('input', 'pp-dialog-input');
    url.id = 'pp-link-url';
    url.type = 'text';
    url.inputMode = 'url';
    url.autocomplete = 'off';
    url.spellcheck = false;
    url.setAttribute('aria-describedby', 'pp-link-hint pp-link-error');
    // L'indication et l'erreur commencent sous le champ, pas sous son libellé.
    const hint = el('p', 'pp-link-note');
    hint.id = 'pp-link-hint';
    const error = el('p', 'pp-link-note pp-link-error');
    error.id = 'pp-link-error';
    error.setAttribute('role', 'alert');
    error.hidden = true;
    const textField = el('div', 'pp-link-text-field');
    const textLabel = el('label', 'pp-dialog-label');
    textLabel.htmlFor = 'pp-link-text';
    const text = el('input', 'pp-dialog-input');
    text.id = 'pp-link-text';
    text.type = 'text';
    text.autocomplete = 'off';
    textField.append(textLabel, text);
    win.body.append(urlLabel, url, hint, error, textField);
    const remove = el('button', 'var-modal-danger');
    remove.type = 'button';
    const spacer = el('span', 'var-modal-spacer');
    const cancel = el('button');
    cancel.type = 'button';
    const ok = el('button', 'var-modal-primary');
    ok.type = 'button';
    win.actions.append(remove, spacer, cancel, ok);
    refs = { urlLabel, url, hint, error, textField, textLabel, text, remove, cancel, ok };

    // Le texte de l'erreur est vidé avec elle : un élément caché que aria-describedby désigne serait encore lu.
    url.addEventListener('input', () => { error.hidden = true; error.textContent = ''; url.removeAttribute('aria-invalid'); });
    const submitOnEnter = event => {
      if (event.key !== 'Enter' || event.isComposing) return;
      event.preventDefault();
      ok.click();
    };
    url.addEventListener('keydown', submitOnEnter);
    text.addEventListener('keydown', submitOnEnter);
    cancel.addEventListener('click', () => closeWindow());
    ok.addEventListener('click', applyLink);
    remove.addEventListener('click', removeLink);
  }

  function closeWindow() {
    if (win) win.hide();
    const ed = EditorCore.getEditor();
    if (ed) ed.commands.focus();
  }

  // Ouvre la fenêtre sur la sélection de l'éditeur ; faux (sans rien ouvrir) quand un lien n'a pas de sens ici : le raccourci avale alors quand même
  // la frappe, pour que Ctrl+K ne tombe pas sur le navigateur.
  function open() {
    const ed = EditorCore.getEditor();
    if (!canLinkHere(ed)) return false;
    ensure();
    const { from, to, empty } = ed.state.selection;
    const href = (ed.getAttributes('link') || {}).href || '';
    // Texte à afficher : seulement quand il n'y a rien de sélectionné ni de lien sous le curseur - sinon c'est le texte qui est déjà là, qu'on garde
    // tel quel.
    ctx = { from, to, empty, href, withText: empty && !href };
    const { urlLabel, url, hint, error, textField, textLabel, text, remove, cancel, ok } = refs;
    win.title.textContent = I18n.t(href ? 'hyperlink.title.edit' : 'hyperlink.title.new');
    urlLabel.textContent = I18n.t('hyperlink.url.label');
    url.placeholder = I18n.t('hyperlink.url.placeholder');
    url.value = href;
    url.removeAttribute('aria-invalid');
    hint.textContent = I18n.t('hyperlink.url.hint');
    error.hidden = true;
    error.textContent = '';
    textField.hidden = !ctx.withText;
    textLabel.textContent = I18n.t('hyperlink.text.label');
    text.placeholder = I18n.t('hyperlink.text.placeholder');
    text.value = '';
    remove.textContent = I18n.t('hyperlink.remove');
    remove.hidden = !href;
    cancel.textContent = I18n.t('common.cancel');
    ok.textContent = I18n.t(href ? 'common.confirm' : 'common.insert');
    win.show(url);
    url.select();
    return true;
  }

  function showError(kind) {
    const { url, error } = refs;
    error.textContent = I18n.t(kind === 'empty' ? 'hyperlink.error.empty' : 'hyperlink.error.invalid');
    error.hidden = false;
    url.setAttribute('aria-invalid', 'true');
    url.focus();
  }

  function applyLink() {
    const result = normalizeUrl(refs.url.value);
    if (result.error) { showError(result.error); return; }
    const ed = EditorCore.getEditor();
    const { href } = result;
    // La sélection de l'éditeur n'a pas bougé pendant que la fenêtre était ouverte (le focus est parti, pas la sélection) : les commandes s'y
    // appliquent.
    if (ctx.withText) {
      const label = refs.text.value.trim() || result.text;
      // Le curseur sort du lien après l'insertion : ce qui se tape ensuite ne s'ajoute pas à son texte (la marque de TipTap s'étend sinon, autolink
      // actif).
      ed.chain().focus().insertContentAt(ctx.from, { type: 'text', text: label, marks: [{ type: 'link', attrs: { href } }] }).unsetMark('link').run();
    } else if (ctx.empty) {
      // Curseur dans un lien : l'adresse change pour tout le lien, le curseur reste où il était (extendMarkRange sélectionne le lien entier).
      ed.chain().focus().extendMarkRange('link').setLink({ href }).setTextSelection(ctx.from).run();
    } else {
      ed.chain().focus().setLink({ href }).run();
    }
    closeWindow();
  }

  function removeLink() {
    EditorCore.getEditor().chain().focus().unsetLink().run();
    closeWindow();
  }

  // Raccourci, ouverture au Ctrl/⌘+clic, info-bulle
  function createExtension(Extension) {
    return Extension.create({
      name: 'linkShortcut',
      addKeyboardShortcuts() {
        // Toujours consommé quand l'éditeur a le focus : même là où un lien n'a pas de sens (bloc de code), Ctrl+K ne doit pas aller au navigateur.
        return { 'Mod-k': () => { open(); return true; } };
      },
    });
  }

  let tip = null;
  let tipTimer = null;
  function hideTip() {
    clearTimeout(tipTimer);
    tipTimer = null;
    if (tip) tip.hidden = true;
  }
  function showTip(anchor) {
    if (!anchor.isConnected) return;
    if (!tip) {
      tip = el('div', 'pp-link-tip');
      tip.setAttribute('role', 'tooltip');
      tip.hidden = true;
      document.body.appendChild(tip);
    }
    tip.textContent = '';
    tip.append(el('span', 'pp-link-tip-url', anchor.getAttribute('href') || ''), el('span', 'pp-link-tip-hint', I18n.t('hyperlink.openHint', { key: modKey() })));
    tip.hidden = false;
    const rect = anchor.getClientRects()[0] || anchor.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    const below = rect.bottom + 6 + tipRect.height <= window.innerHeight - 4;
    tip.style.top = Math.max(4, below ? rect.bottom + 6 : rect.top - 6 - tipRect.height) + 'px';
    tip.style.left = Math.max(4, Math.min(rect.left, window.innerWidth - tipRect.width - 4)) + 'px';
  }

  function wireEditor(ed) {
    const dom = ed.view.dom;
    const linkAt = event => (event.target && event.target.closest ? event.target.closest('a[href]') : null);
    dom.addEventListener('click', event => {
      const anchor = linkAt(event);
      if (!anchor || !(event.ctrlKey || event.metaKey) || !dom.contains(anchor)) return;
      event.preventDefault();
      event.stopPropagation();
      hideTip();
      openExternal(anchor.getAttribute('href'));
    }, true);
    dom.addEventListener('mouseover', event => {
      const anchor = linkAt(event);
      if (!anchor || !dom.contains(anchor)) return;
      clearTimeout(tipTimer);
      tipTimer = setTimeout(() => showTip(anchor), 350);
    });
    dom.addEventListener('mouseout', event => {
      const anchor = linkAt(event);
      if (anchor && !(event.relatedTarget && anchor.contains(event.relatedTarget))) hideTip();
    });
    // Une frappe, un clic ou un défilement ferment l'info-bulle : elle ne doit jamais rester collée à un texte qui a bougé.
    document.addEventListener('mousedown', hideTip, true);
    document.addEventListener('keydown', hideTip, true);
    document.addEventListener('scroll', hideTip, true);
  }

  return { normalizeUrl, canLinkHere, open, createExtension, wireEditor, shortcutLabel };
})();
