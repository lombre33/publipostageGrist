// La bulle d'une icône grisée : un clic (ou Entrée, ou Espace) sur un contrôle grisé ouvre, juste dessous, son nom, ce qu'il concerne et la raison en deux lignes ; « En savoir plus » déplie le constat du document
// (js/lock-diagnostic.js : ✓ écartée, ✕ c'est celle-ci, le geste pour dégriser, ce que le widget voit), avec « Copier le constat » (le texte du forum), l'interrupteur « Masquer les noms » et, quand le geste est un simple clic
// dans le widget, son bouton. Demande du 12/11, étude du 13/11. L'icône reste grisée, à sa place, avec son info-bulle du survol : la bulle parle en plus, rien ne disparaît.
//
// Qui l'ouvre :
//   - un contrôle grisé par une cause qui ARRÊTE le clic (js/lock-reasons.js : droits, PDF, type du modèle, grille, tableau lié) : js/main-access.js (wireAccessLockGuard) ;
//   - une ligne de menu grisée par son module (aria-disabled et `v2-hover-row-disabled`, sa raison en info-bulle : Garder avec le suivant, Signet, styles de titres, Paragraphe, Puce…) : `LockBubble.wireGreyed()`, appelé par js/main-access.js ;
//   - une icône grisée d'une barre flottante (variable, tableau, image : aria-disabled + `title`) : EditorCore.createFloatingPanel. Le constat d'une icône que le code sait expliquer mieux que sa phrase (la Boucle) vient du
//     fournisseur que la barre a posé avec `LockBubble.provide(barre, (bouton) => constat | null)`.
//   LockBubble.openFor(el, { reason, keyboard })   ouvre la bulle de `el` (la referme si elle est déjà ouverte pour lui) ; vrai quand elle a répondu (ouverte ou refermée), faux sans phrase à dire ou sans boîte à l'écran où la poser
//   LockBubble.close()   ·   LockBubble.isOpen()   ·   LockBubble.current()   le contrôle dont la bulle est ouverte (null sinon)
//   LockBubble.provide(conteneur, fournisseur)   le constat des boutons grisés de `conteneur` ; le fournisseur rend un constat de js/lock-diagnostic.js, ou null (la bulle se contente de la phrase de l'info-bulle)
// Une bulle à la fois ; Échap, la croix ou un appui hors d'elle la ferme. À 700×400 elle défile en elle-même, pied (copier, bouton) fixe. Le texte est toujours posé en texte, jamais en HTML.
const LockBubble = (function () {
  const { el } = Dom;
  const providers = new WeakMap(); // conteneur -> fournisseur
  const OPEN_MARK = 'data-pp-lock-open';
  const WIDTH = 336;
  const GAP = 8;
  const MARGIN = 4;
  const COPIED_MS = 2000;
  let now = null; // { anchor, bubble, spec, name, why, expanded, rect, copyTimer, off }
  let maskNames = false; // « Masquer les noms » : gardé tant que la page vit, il ne change que le texte copié

  function provide(container, provider) {
    if (container && provider) providers.set(container, provider);
  }
  function providerOf(anchor) {
    for (let node = anchor; node; node = node.parentElement) {
      const provider = providers.get(node);
      if (provider) return provider;
    }
    return null;
  }

  // === La copie ===
  // Copie `text` : le presse-papiers du navigateur, sinon la commande de copie d'un champ (un cadre isolé n'a pas toujours le droit du premier). Faux : refusée des deux côtés.
  async function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; }
    } catch (e) { /* refusé : la commande de copie d'un champ essaie encore */ }
    try {
      const field = el('textarea', 'pp-lockbubble-offscreen');
      field.value = text;
      field.readOnly = true;
      document.body.append(field);
      field.select();
      const done = document.execCommand('copy');
      field.remove();
      return !!done;
    } catch (e) {
      return false;
    }
  }

  // === Le placement ===
  function anchorRect(state) {
    const live = state.anchor.isConnected ? (state.anchor.getClientRects()[0] || state.anchor.getBoundingClientRect()) : null;
    if (live && (live.width || live.height)) state.rect = { left: live.left, right: live.right, top: live.top, bottom: live.bottom, width: live.width };
    return state.rect;
  }
  function place(state) {
    const rect = anchorRect(state);
    const bubble = state.bubble;
    // La zone libre : tout le cadre, moins ce que la barre de GFS recouvre.
    const room = GfsBar.limits({ left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight });
    bubble.style.maxHeight = Math.max(140, room.bottom - room.top - 2 * MARGIN) + 'px';
    const width = bubble.offsetWidth;
    const height = bubble.offsetHeight;
    let top;
    if (rect.bottom + GAP + height <= room.bottom - MARGIN) top = rect.bottom + GAP;
    else if (rect.top - GAP - height >= room.top + MARGIN) top = rect.top - GAP - height;
    else top = Math.max(room.top + MARGIN, room.bottom - height - MARGIN);
    const left = Math.max(room.left + MARGIN, Math.min(rect.left + rect.width / 2 - 24, room.right - width - MARGIN));
    bubble.style.top = Math.round(top) + 'px';
    bubble.style.left = Math.round(left) + 'px';
  }

  // === Le contenu ===
  function mark(status) {
    const node = el('span', 'pp-lockbubble-mark', status === 'no' ? '✕' : '✓');
    node.setAttribute('aria-hidden', 'true');
    return node;
  }
  function checkItem(check) {
    const li = el('li', 'pp-lockbubble-check' + (check.s === 'no' ? ' is-no' : ''));
    const text = el('span');
    text.append(document.createTextNode(LockDiagnostic.resolve(check.t, false)));
    if (check.d) text.append(el('small', null, LockDiagnostic.resolve(check.d, false)));
    // Pour un lecteur d'écran, « écartée » ou « cause » dit ce que la pastille ✓ ou ✕ montre.
    text.prepend(el('span', 'pp-lockbubble-sr', I18n.t(check.s === 'no' ? 'lockBubble.markNo' : 'lockBubble.markOk') + ' : '));
    li.append(mark(check.s), text);
    return li;
  }
  function diagNode(state) {
    const spec = state.spec;
    const diag = el('div', 'pp-lockbubble-diag');
    diag.hidden = !state.expanded;
    if (spec.checks && spec.checks.length) {
      const list = el('ul', 'pp-lockbubble-checks');
      spec.checks.forEach(check => list.append(checkItem(check)));
      diag.append(list);
    }
    if (spec.fix) {
      const fix = el('p', 'pp-lockbubble-fix');
      fix.append(el('b', null, I18n.t('lockBubble.fix')), document.createTextNode(' ' + LockDiagnostic.resolve(spec.fix, false)));
      diag.append(fix);
    }
    if (spec.context && spec.context.length) {
      const box = el('div', 'pp-lockbubble-ctx');
      box.append(el('h4', null, I18n.t('lockBubble.context')));
      const dl = el('dl');
      spec.context.forEach(([label, value]) => dl.append(el('dt', null, LockDiagnostic.resolve(label, false)), el('dd', null, LockDiagnostic.resolve(value, false))));
      box.append(dl);
      diag.append(box);
    }
    return diag;
  }
  function footNode(state) {
    const foot = el('div', 'pp-lockbubble-foot');
    foot.hidden = !state.expanded;
    const mask = el('label', 'pp-lockbubble-mask');
    mask.title = I18n.t('lockBubble.maskTip');
    const box = el('input');
    box.type = 'checkbox';
    box.checked = maskNames;
    box.addEventListener('change', () => { maskNames = box.checked; });
    mask.append(box, el('span', null, I18n.t('lockBubble.mask')));
    const row = el('div', 'pp-lockbubble-actions');
    const copy = Dom.button('pp-lockbubble-copy');
    copy.title = I18n.t('lockBubble.copyTip');
    const icon = el('span', 'pp-lockbubble-btn-ico');
    Dom.setMarkup(icon, Icons.svg('duplicate'));
    const label = el('span', null, I18n.t('lockBubble.copy'));
    copy.append(icon, label);
    copy.addEventListener('click', async () => {
      const text = LockDiagnostic.report(state.spec, { name: state.name, why: state.spec.why || state.why, mask: box.checked });
      const done = await copyText(text);
      if (now !== state) return;
      label.textContent = I18n.t(done ? 'lockBubble.copied' : 'lockBubble.copyFailed');
      copy.classList.toggle('is-done', done);
      copy.dataset.copied = done ? 'true' : 'false';
      clearTimeout(state.copyTimer);
      state.copyTimer = setTimeout(() => {
        label.textContent = I18n.t('lockBubble.copy');
        copy.classList.remove('is-done');
        delete copy.dataset.copied;
      }, COPIED_MS);
    });
    row.append(copy);
    if (state.spec.action) {
      const act = Dom.button('pp-lockbubble-act', state.spec.action.label);
      act.addEventListener('click', () => { const run = state.spec.action.run; close(); run(); });
      row.append(act);
    }
    foot.append(mask, row);
    return foot;
  }

  function build(state) {
    const bubble = el('div', 'pp-lockbubble');
    bubble.setAttribute('role', 'dialog');
    bubble.setAttribute('aria-label', state.name);
    bubble.style.width = WIDTH + 'px';
    // Un appui sur un bouton, la case ou son libellé ne prend pas le focus de l'éditeur : la barre flottante de l'icône (celle du tableau se cache quand l'éditeur perd le focus) reste là, avec l'icône dont la bulle parle ;
    // le clic, lui, a toujours lieu. Le texte de la bulle reste sélectionnable.
    bubble.addEventListener('mousedown', event => { if (event.target.closest && event.target.closest('button, input, label')) event.preventDefault(); });
    const head = el('div', 'pp-lockbubble-head');
    const ico = el('span', 'pp-lockbubble-ico');
    if (state.icon) Dom.setMarkup(ico, state.icon);
    const name = el('span', 'pp-lockbubble-name');
    name.append(document.createTextNode(state.name), el('small', null, LockDiagnostic.resolve(state.spec.sub || I18n.t('lockBubble.sub'), false)));
    const x = Dom.button('pp-lockbubble-x');
    x.setAttribute('aria-label', I18n.t('lockBubble.close'));
    Dom.setMarkup(x, Icons.svg('closeFind'));
    x.addEventListener('click', () => close({ refocus: true }));
    head.append(ico, name, x);
    const why = el('p', 'pp-lockbubble-why', state.why);
    const more = Dom.button('pp-lockbubble-more');
    more.setAttribute('aria-expanded', 'false');
    more.append(document.createTextNode(I18n.t('lockBubble.more')));
    const caret = el('span', 'pp-lockbubble-caret');
    Dom.setMarkup(caret, Icons.svg('caretDown'));
    more.append(caret);
    const diag = diagNode(state);
    const foot = footNode(state);
    more.addEventListener('click', () => {
      state.expanded = !state.expanded;
      more.setAttribute('aria-expanded', state.expanded ? 'true' : 'false');
      diag.hidden = !state.expanded;
      foot.hidden = !state.expanded;
      place(state);
    });
    bubble.append(head, why, more, diag, foot);
    state.more = more;
    return bubble;
  }

  // === Ouvrir, fermer ===
  function listen(state) {
    const onDown = event => {
      if (state.bubble.contains(event.target) || state.anchor.contains(event.target)) return;
      close();
    };
    const onKey = event => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      close({ refocus: true });
    };
    const onMove = () => {
      if (!state.anchor.isConnected || !state.anchor.getClientRects().length) { close(); return; }
      place(state);
    };
    const onResize = () => close();
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onResize);
    state.off = () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onResize);
    };
  }

  function close(options) {
    const state = now;
    if (!state) return;
    now = null;
    clearTimeout(state.copyTimer);
    if (state.off) state.off();
    const inside = state.bubble.contains(document.activeElement);
    state.bubble.remove();
    state.anchor.removeAttribute(OPEN_MARK);
    if (inside && options && options.refocus && state.anchor.isConnected && state.anchor.focus) state.anchor.focus({ preventScroll: true });
  }

  // La bulle de `anchor` (un contrôle grisé) : sa phrase est `opts.reason`, ou celle que le contrôle dit (LockReasons), ou son info-bulle. Vrai quand elle a répondu : ouverte, ou refermée parce qu'un second clic sur le même contrôle la ferme.
  function openFor(anchor, opts) {
    if (!anchor) return false;
    if (now && now.anchor === anchor) { close(); return true; }
    const detail = typeof LockReasons !== 'undefined' ? LockReasons.detailOf(anchor) : null;
    const reason = (opts && opts.reason) || (detail && detail.reason) || anchor.getAttribute('title') || '';
    if (!reason) return false;
    // Un contrôle sans boîte à l'écran (caché, hors du panneau) n'a pas de dessous où poser la bulle : rien ne s'ouvre, l'appelant dit la raison autrement (le coin d'état).
    if (!anchorRect({ anchor, rect: null })) return false;
    close();
    const provider = providerOf(anchor);
    let spec = null;
    try { spec = (provider && provider(anchor)) || LockDiagnostic.forLock(anchor, detail); } catch (e) { console.warn('[lock-bubble] constat illisible', e); }
    if (!spec) spec = { checks: [], fix: '', context: [] };
    const identity = LockDiagnostic.identify(anchor);
    const state = { anchor, spec, name: identity.name, icon: identity.icon, why: LockDiagnostic.resolve(spec.why || reason, false), expanded: false, rect: null, copyTimer: 0, off: null, more: null };
    state.bubble = build(state);
    document.body.append(state.bubble);
    anchor.setAttribute(OPEN_MARK, '1');
    now = state;
    place(state);
    listen(state);
    // Ouverte au clavier, la bulle prend le focus (sa première commande) ; à la souris, le focus reste où il était : l'éditeur garde sa sélection.
    if (opts && opts.keyboard) state.more.focus({ preventScroll: true });
    return true;
  }

  // Une ligne de menu grisée par son module (aria-disabled et `v2-hover-row-disabled`, sa raison en info-bulle : js/keep-with-next.js, js/anchors.js, js/heading-styles.js, js/paragraph-format.js…), qui ne passe pas par js/lock-reasons.js :
  // son clic ouvre aussi la bulle. Le clic n'est pas arrêté, ces lignes l'ignorent déjà quand elles sont grisées ; une ligne que js/lock-reasons.js gère (elle a sa raison en `data-pp-lock-reason`) garde son chemin.
  const GREYED_ROWS = '.v2-hover-row-disabled[aria-disabled="true"][title]';
  function wireGreyed() {
    document.addEventListener('click', event => {
      const row = event.target && event.target.closest ? event.target.closest(GREYED_ROWS) : null;
      if (!row || row.hasAttribute('data-pp-lock-reason') || row.closest('.pp-lockbubble')) return;
      openFor(row, { keyboard: event.detail === 0 });
    }, true);
  }

  return { openFor, close, provide, wireGreyed, isOpen: () => !!now, current: () => (now ? now.anchor : null) };
})();
