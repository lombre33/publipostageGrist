// Liens de l'éditeur. La marque `link` vient de StarterKit (js/editor.js la configure) ; ce module apporte le reste :
//  - la fenêtre « Insérer / Modifier le lien » (bouton de la barre, ligne « Lien… », Ctrl+K / ⌘K) : une adresse, plus le texte à afficher quand rien
//    n'est sélectionné ; Entrée valide, Échap annule, « Retirer le lien » quand le curseur est dans un lien ;
//  - la normalisation de l'adresse (normalizeUrl) : web, e-mail ou téléphone, rien d'autre (jamais `javascript:` ni `data:`) ;
//  - le raccourci (createExtension) et, dans l'éditeur, Ctrl/⌘+clic pour ouvrir un lien avec une info-bulle qui montre l'adresse (wireEditor) : un
//    clic simple place le curseur, sinon on ne pourrait plus corriger le lien.
// Le rendu (Lecture, PDF, Word, email) est dans leurs modules ; styles de la fenêtre : css/link-dialog.css, du lien : css/editor-v2.css.
const LinkDialog = (function () {
  const el = Dom.el;

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

  // { href, text } d'une adresse web que le navigateur accepte, sinon { error: 'invalid' }.
  function webResult(candidate, text) {
    const href = webHref(candidate);
    return href ? { href, text } : { error: 'invalid' };
  }

  // Une adresse qui commence par un schéma : seuls http(s), mailto et tel passent, les autres (javascript:, data:, file:...) sont refusés.
  function schemeResult(scheme, rest, value) {
    if (scheme === 'http' || scheme === 'https') return rest.startsWith('//') ? webResult(scheme + ':' + rest, value) : { error: 'invalid' };
    if (scheme === 'mailto') {
      return /^[^\s?#]+@[^\s?#]+(?:\?\S*)?$/.test(rest) ? { href: 'mailto:' + rest, text: rest.replace(/\?.*$/, '') } : { error: 'invalid' };
    }
    if (scheme === 'tel') return isPhone(rest) ? { href: telHref(rest), text: rest.trim() } : { error: 'invalid' };
    return { error: 'invalid' };
  }

  function normalizeUrl(raw) {
    const value = String(raw == null ? '' : raw).trim();
    if (!value) return { error: 'empty' };
    const schemeMatch = value.match(SCHEME);
    const rest = schemeMatch ? value.slice(schemeMatch[0].length) : '';
    // « localhost:3000 » et « exemple.fr:8080/x » ressemblent à un schéma : un numéro de port derrière les deux-points dit que c'est une machine.
    // « tel: » fait exception, son adresse est un numéro (« tel:0612345678 »).
    const looksLikePort = schemeMatch && schemeMatch[1].toLowerCase() !== 'tel' && /^\d+(?:[/?#]|$)/.test(rest);
    if (schemeMatch && !looksLikePort) return schemeResult(schemeMatch[1].toLowerCase(), rest, value);
    if (EMAIL.test(value)) return { href: 'mailto:' + value, text: value };
    if (isPhone(value)) return { href: telHref(value), text: value };
    if (value.startsWith('//')) return webResult('https:' + value, value);
    if (HOST.test(value)) return webResult('https://' + value, value);
    return { error: 'invalid' };
  }

  // Ouvre une adresse déjà normalisée par un <a> synthétique cliqué, comme partout dans le widget (window.open se comporte moins bien dans l'iframe
  // d'un widget Grist). Un lien web s'ouvre dans un nouvel onglet ; mailto: et tel: passent la main à l'application du système (dans le cadre isolé de GFS, eux aussi s'ouvrent dans un
  // nouvel onglet : GfsLink.opensInNewTab).
  function openExternal(href) {
    if (!/^(?:https?|mailto|tel):/i.test(href || '')) return false;
    const a = document.createElement('a');
    a.href = href;
    if (/^https?:/i.test(href) || GfsLink.opensInNewTab(href)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
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

  // La fenêtre : où le lien mène (une adresse, ou un titre ou un signet du document : « Dans ce document », js/anchors.js), puis le texte à afficher quand rien n'est
  // sélectionné.
  let win = null;
  let refs = null;
  let ctx = null; // { from, to, empty, href, withText } : la sélection à l'ouverture
  let mode = 'web'; // 'web' ou 'document' : ce que la fenêtre montre

  // Un en-tête, un pied de page et un modèle d'e-mail n'ont pas de signet où mener (la Lecture et les exports ne le résolvent que dans le texte) : la clé de la raison, ou null.
  const documentLock = () => (HeaderFooterPreview.getHfMode() || MainToolbar.isEmailMode() ? 'hyperlink.mode.documentLocked' : null);

  // Liste avec recherche (js/search-select.js) : un titre ou un signet se cherche comme une colonne. Le <select> reste la source de la valeur, et la liste native si le composant est
  // indisponible (rend alors null).
  function searchableTargets(select) {
    try { return SearchSelect.attachTargets(select, { labelledBy: 'pp-link-target-label' }); }
    catch (e) { console.warn('[LinkDialog] recherche de titre indisponible, liste native conservée', e); return null; }
  }

  function ensure() {
    if (win) return;
    // restoreFocus: false : le focus revient à l'éditeur (closeWindow), pas au bouton de la barre : la sélection y est restée.
    win = ModalBase.create({ id: 'pp-link-modal', titleId: 'pp-link-title', size: 'sm', boxClass: 'pp-link-box', actionsClass: 'var-modal-actions', onEscape: () => closeWindow(), restoreFocus: false });
    // Deux vraies cases d'option (les flèches, Tab et le grisage sont ceux du navigateur) : une adresse, ou un endroit du document.
    const modes = el('div', 'pp-link-modes');
    modes.setAttribute('role', 'radiogroup');
    const modeBoxes = {};
    ['web', 'document'].forEach(value => {
      const label = el('label', 'pp-link-mode');
      const input = el('input');
      input.type = 'radio';
      input.name = 'pp-link-mode';
      input.value = value;
      input.addEventListener('change', () => { if (input.checked) setMode(value, true); });
      const text = el('span');
      label.append(input, text);
      modes.appendChild(label);
      modeBoxes[value] = { label, input, text };
    });
    const webField = el('div', 'pp-link-field');
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
    webField.append(urlLabel, url, hint, error);
    const docField = el('div', 'pp-link-field');
    const targetLabel = el('label', 'pp-dialog-label');
    targetLabel.id = 'pp-link-target-label';
    targetLabel.htmlFor = 'pp-link-target';
    const target = el('select', 'pp-dialog-input');
    target.id = 'pp-link-target';
    target.setAttribute('aria-describedby', 'pp-link-target-hint pp-link-target-error');
    const targetHint = el('p', 'pp-link-note');
    targetHint.id = 'pp-link-target-hint';
    const targetError = el('p', 'pp-link-note pp-link-error');
    targetError.id = 'pp-link-target-error';
    targetError.setAttribute('role', 'alert');
    targetError.hidden = true;
    docField.append(targetLabel, target, targetHint, targetError);
    const textField = el('div', 'pp-link-text-field');
    const textLabel = el('label', 'pp-dialog-label');
    textLabel.htmlFor = 'pp-link-text';
    const text = el('input', 'pp-dialog-input');
    text.id = 'pp-link-text';
    text.type = 'text';
    text.autocomplete = 'off';
    textField.append(textLabel, text);
    win.body.append(modes, webField, docField, textField);
    const { first: remove, cancel, ok } = win.addButtons('var-modal-danger');
    refs = { modes, modeBoxes, webField, docField, urlLabel, url, hint, error, targetLabel, target, targetHint, targetError, targetList: searchableTargets(target), textField, textLabel, text, remove, cancel, ok };

    // Le texte de l'erreur est vidé avec elle : un élément caché que aria-describedby désigne serait encore lu.
    url.addEventListener('input', () => { error.hidden = true; error.textContent = ''; url.removeAttribute('aria-invalid'); });
    target.addEventListener('change', () => { targetError.hidden = true; targetError.textContent = ''; target.removeAttribute('aria-invalid'); });
    const submitOnEnter = event => {
      if (event.key !== 'Enter' || event.isComposing) return;
      event.preventDefault();
      ok.click();
    };
    url.addEventListener('keydown', submitOnEnter);
    text.addEventListener('keydown', submitOnEnter);
    modes.addEventListener('keydown', submitOnEnter);
    cancel.addEventListener('click', () => closeWindow());
    ok.addEventListener('click', applyLink);
    remove.addEventListener('click', removeLink);
  }

  function closeWindow() {
    if (win) win.hide();
    EditorCore.focusEditor();
  }

  // Ce que la fenêtre montre : le champ de l'adresse ou la liste des titres et signets, et l'indication du texte à afficher qui va avec.
  function setMode(next, focus) {
    mode = next;
    const { modeBoxes, webField, docField, url, target, targetList, text } = refs;
    modeBoxes[next].input.checked = true;
    webField.hidden = next !== 'web';
    docField.hidden = next !== 'document';
    text.placeholder = I18n.t(next === 'document' ? 'hyperlink.text.placeholderDocument' : 'hyperlink.text.placeholder');
    if (focus) {
      if (next === 'document') { target.focus(); } else { url.focus(); url.select(); }
    }
    if (targetList) targetList.sync();
  }

  // Les titres et les signets du document dans la liste, les groupes étant « Titres » et « Signets » ; `selectedId` : l'adresse du lien qu'on modifie. Rend vrai quand
  // le document a au moins un titre ou un signet.
  function fillTargets(ed, selectedId) {
    const { target, targetHint, targetList } = refs;
    const { headings, bookmarks } = Anchors.targets(ed);
    target.textContent = '';
    const placeholder = Dom.option('', I18n.t('hyperlink.target.placeholder'));
    placeholder.disabled = true;
    target.appendChild(placeholder);
    const group = (labelKey, entries, valueOf, hintOf) => {
      if (!entries.length) return;
      const optgroup = el('optgroup');
      optgroup.label = I18n.t(labelKey);
      entries.forEach((entry, index) => {
        const opt = Dom.option(valueOf(entry, index), entry.text || entry.name);
        opt.dataset.name = entry.text || entry.name;
        const hint = hintOf(entry);
        if (hint) opt.dataset.hint = hint;
        optgroup.appendChild(opt);
      });
      target.appendChild(optgroup);
    };
    group('hyperlink.target.headings', headings, (entry, index) => 'h:' + index, entry => I18n.t('hyperlink.target.level', { n: entry.level }));
    group('hyperlink.target.bookmarks', bookmarks, entry => 'a:' + entry.id, entry => entry.snippet);
    // Le choix d'un lien qu'on modifie : son signet, sinon le titre qui porte cette adresse.
    let selected = '';
    if (selectedId) {
      if (bookmarks.some(entry => entry.id === selectedId)) selected = 'a:' + selectedId;
      else { const rank = headings.findIndex(entry => entry.id === selectedId); if (rank >= 0) selected = 'h:' + rank; }
    }
    target.value = selected;
    const any = headings.length + bookmarks.length > 0;
    target.disabled = !any;
    targetHint.textContent = I18n.t(!any ? 'hyperlink.target.none' : selectedId && !selected ? 'hyperlink.target.missing' : 'hyperlink.target.hint');
    if (targetList) targetList.sync();
    return any;
  }

  // Ouvre la fenêtre sur la sélection de l'éditeur ; faux (sans rien ouvrir) quand un lien n'a pas de sens ici : le raccourci avale alors quand même
  // la frappe, pour que Ctrl+K ne tombe pas sur le navigateur.
  function open() {
    const ed = EditorCore.getEditor();
    if (!canLinkHere(ed)) return false;
    ensure();
    const { from, to, empty } = ed.state.selection;
    const href = (ed.getAttributes('link') || {}).href || '';
    const anchorId = Anchors.idOfHref(href);
    // Texte à afficher : seulement quand il n'y a rien de sélectionné ni de lien sous le curseur - sinon c'est le texte qui est déjà là, qu'on garde
    // tel quel.
    ctx = { from, to, empty, href, withText: empty && !href };
    const { modes, modeBoxes, urlLabel, url, hint, error, targetLabel, target, targetError, textField, textLabel, text, remove, cancel, ok } = refs;
    win.title.textContent = I18n.t(href ? 'hyperlink.title.edit' : 'hyperlink.title.new');
    modes.setAttribute('aria-label', I18n.t('hyperlink.mode.label'));
    modeBoxes.web.text.textContent = I18n.t('hyperlink.mode.web');
    modeBoxes.document.text.textContent = I18n.t('hyperlink.mode.document');
    // Grisée avec sa raison en info-bulle, jamais retirée.
    const lock = documentLock();
    modeBoxes.document.input.disabled = !!lock;
    modeBoxes.document.label.classList.toggle('pp-link-mode-off', !!lock);
    if (lock) modeBoxes.document.label.title = I18n.t(lock); else modeBoxes.document.label.removeAttribute('title');
    urlLabel.textContent = I18n.t('hyperlink.url.label');
    url.placeholder = I18n.t('hyperlink.url.placeholder');
    url.value = anchorId ? '' : href;
    url.removeAttribute('aria-invalid');
    hint.textContent = I18n.t('hyperlink.url.hint');
    error.hidden = true;
    error.textContent = '';
    targetLabel.textContent = I18n.t('hyperlink.target.label');
    targetError.hidden = true;
    targetError.textContent = '';
    target.removeAttribute('aria-invalid');
    fillTargets(ed, anchorId);
    textField.hidden = !ctx.withText;
    textLabel.textContent = I18n.t('hyperlink.text.label');
    text.value = '';
    remove.textContent = I18n.t('hyperlink.remove');
    remove.hidden = !href;
    cancel.textContent = I18n.t('common.cancel');
    ok.textContent = I18n.t(href ? 'common.confirm' : 'common.insert');
    setMode(anchorId && !lock ? 'document' : 'web', false);
    win.show(mode === 'document' ? target : url);
    if (mode === 'web') url.select();
    return true;
  }

  function showError(kind) {
    const { url, error } = refs;
    error.textContent = I18n.t(kind === 'empty' ? 'hyperlink.error.empty' : 'hyperlink.error.invalid');
    error.hidden = false;
    url.setAttribute('aria-invalid', 'true');
    url.focus();
  }

  function showTargetError(key) {
    const { target, targetError } = refs;
    targetError.textContent = I18n.t(key);
    targetError.hidden = false;
    target.setAttribute('aria-invalid', 'true');
    target.focus();
  }

  // Le titre ou le signet choisi : { id, label (le texte qu'un lien neuf affiche), claim ({ pos, id } : l'adresse qu'un titre sans signet reçoit en même temps que le lien) },
  // ou { error }. Relu dans le document au moment de valider : il a pu changer depuis l'ouverture (écriture en direct).
  function pickedTarget(ed) {
    const value = refs.target.value;
    if (!value) return { error: 'hyperlink.error.noTarget' };
    if (value.indexOf('a:') === 0) {
      const id = value.slice(2);
      const label = Anchors.labelOf(ed, id);
      return label ? { id, label, claim: null } : { error: 'hyperlink.target.missing' };
    }
    const heading = Anchors.targets(ed).headings[parseInt(value.slice(2), 10)];
    if (!heading) return { error: 'hyperlink.target.missing' };
    if (heading.id) return { id: heading.id, label: heading.plain, claim: null };
    const id = Anchors.idFor(ed, heading.pos);
    return { id, label: heading.plain, claim: { pos: heading.pos, id } };
  }

  function applyLink() {
    const ed = EditorCore.getEditor();
    let href;
    let label;
    let claim = null;
    if (mode === 'document') {
      const picked = pickedTarget(ed);
      if (picked.error) { showTargetError(picked.error); return; }
      href = Anchors.hrefOf(picked.id);
      label = picked.label;
      claim = picked.claim;
    } else {
      const result = normalizeUrl(refs.url.value);
      if (result.error) { showError(result.error); return; }
      href = result.href;
      label = result.text;
    }
    // La sélection de l'éditeur n'a pas bougé pendant que la fenêtre était ouverte (le focus est parti, pas la sélection) : les commandes s'y
    // appliquent. Un titre sans signet reçoit son adresse dans la même transaction que le lien : un seul Annuler défait les deux.
    const chain = ed.chain().focus();
    if (claim) chain.command(({ tr }) => { tr.setNodeAttribute(claim.pos, 'anchorId', claim.id); return true; });
    if (ctx.withText) {
      // Le curseur sort du lien après l'insertion : ce qui se tape ensuite ne s'ajoute pas à son texte (la marque de TipTap s'étend sinon, autolink
      // actif).
      chain.insertContentAt(ctx.from, { type: 'text', text: refs.text.value.trim() || label, marks: [{ type: 'link', attrs: { href } }] }).unsetMark('link').run();
    } else if (ctx.empty) {
      // Curseur dans un lien : l'adresse change pour tout le lien, le curseur reste où il était (extendMarkRange sélectionne le lien entier).
      chain.extendMarkRange('link').setLink({ href }).setTextSelection(ctx.from).run();
    } else {
      chain.setLink({ href }).run();
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
    const href = anchor.getAttribute('href') || '';
    const anchorId = Anchors.idOfHref(href);
    if (anchorId) {
      // Un lien vers un titre ou un signet du document : son nom, ou « introuvable » quand il n'existe plus (il n'y a alors rien où aller).
      const label = Anchors.labelOf(EditorCore.getEditor(), anchorId);
      tip.append(el('span', 'pp-link-tip-url', I18n.t(label ? 'hyperlink.tip.internal' : 'hyperlink.tip.missing', { name: label })));
      if (label) tip.append(el('span', 'pp-link-tip-hint', I18n.t('hyperlink.openHint.internal', { key: modKey() })));
    } else {
      tip.append(el('span', 'pp-link-tip-url', href), el('span', 'pp-link-tip-hint', I18n.t('hyperlink.openHint', { key: modKey() })));
    }
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
      const anchorId = Anchors.idOfHref(anchor.getAttribute('href'));
      if (anchorId) Anchors.goTo(ed, anchorId); else openExternal(anchor.getAttribute('href'));
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
