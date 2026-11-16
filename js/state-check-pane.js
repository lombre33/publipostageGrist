// Le volet « Contrôle du style de l'État » (lot 4 du mode, js/state-mode.js), à droite du texte : les constats de js/state-check.js, une ligne chacun - de quoi voir d'un coup d'œil ce qu'il reste à revoir.
// Un constat à revoir est une ligne ambre avec son bouton « Voir » (il pose la sélection sur l'endroit suivant, en boucle, et le dit : « 2 sur 5 ») ou, pour une image sans texte alternatif, « Décrire » (la fenêtre
// du texte alternatif de js/alt-text.js, sur l'image) ; un constat sans remarque est une ligne verte. Les lignes à revoir passent devant. JAMAIS un blocage et JAMAIS une écriture : le volet lit le document, déplace la
// sélection, et ne pose rien dans l'historique ; seul « Décrire » écrit, par la fenêtre du texte alternatif, qui a son propre pas d'Annuler. Le pied du volet dit ce que le contrôle ne dit pas : le droit d'utiliser
// la marque, et la lecture de la charte.
// Ouvert par la ligne « Contrôle du style de l'État » du menu « Édition collaborative » (js/main-toolbar.js) et par la palette Alt+/ ; grisé, avec sa raison au survol, tant que le mode n'est pas allumé (sans l'extension
// « etat » de Grist Factory Suite, le clic ouvre la fenêtre d'installation : js/state-style.js:lock). Il se pose comme le volet de relecture (js/track-changes-pane.js) - collé au bord droit, le texte lui laisse sa
// place, l'un ferme l'autre - et cède à la barre de GFS ce qu'elle en recouvre (GfsBar.bite). Il se relit une fois la frappe calmée. Rien n'est gardé : fermé à chaque ouverture du widget.
// Styles : css/state-check.css.
const StateCheckPane = (function () {
  const el = Dom.el;
  const REFRESH_MS = 250;
  // `report` : le dernier rapport de StateCheck.read ; `cursor` : où « Voir » en est, par constat.
  const state = { open: false, report: null, cursor: {} };
  const seenOf = {};
  let editor = null;
  let pane = null;
  let refs = null;
  let timer = 0;
  let observer = null;
  let stopBar = null;
  let host = { status: () => {} };

  const t = (key, params) => I18n.t(key, params);
  const container = () => document.getElementById('editor-container');
  const rowOf = () => document.getElementById('v2-btn-state-check');
  function wire(options) { host = Object.assign({}, host, options); }

  function iconButton(icon, className, label) {
    const button = Dom.button('pp-statepane-btn' + (className ? ' ' + className : ''));
    Dom.setMarkup(button, Icons.svg(icon));
    button.setAttribute('aria-label', label);
    button.title = label;
    return button;
  }

  function ensure() {
    if (pane) return;
    pane = el('aside', 'pp-statepane');
    pane.id = 'pp-state-pane';
    pane.setAttribute('aria-label', t('state.check.title'));
    // Ses boutons gardent le focus : le raccourci d'Annuler de js/shortcuts.js ne prend pas la touche ici.
    pane.setAttribute('data-own-undo', '');
    pane.hidden = true;
    const header = el('div', 'pp-statepane-header');
    const title = el('h2', 'pp-statepane-title', t('state.check.title'));
    const close = iconButton('closeFind', 'pp-statepane-close', t('state.check.close'));
    close.addEventListener('click', () => closePane());
    header.append(title, close);
    const summary = el('p', 'pp-statepane-summary');
    summary.setAttribute('role', 'status');
    const list = el('ul', 'pp-statepane-list');
    list.setAttribute('aria-label', t('state.check.title'));
    const note = el('p', 'pp-statepane-note', t('state.check.note'));
    // La liste et le pied défilent ensemble : dans un panneau de 400 px de haut, le pied ne prend pas de place à la liste.
    const scroll = el('div', 'pp-statepane-scroll');
    scroll.append(list, note);
    pane.append(header, summary, scroll);
    pane.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); closePane(); }
    });
    document.body.append(pane);
    refs = { header, close, summary, scroll, list, note };
  }

  // Place le volet à droite du texte, comme le volet de relecture : sous la barre, sur la hauteur de #editor-container, qui lui laisse sa place (marge à droite) - la page garde sa largeur, seule la fenêtre sur
  // elle se réduit. Appelé à chaque changement de taille du conteneur et de la barre de GFS (`GfsBar.bite` : ce que la barre recouvre, le volet le cède).
  function layout() {
    const box = container();
    if (!pane || !box) return;
    const visible = state.open && box.offsetParent !== null;
    pane.hidden = !visible;
    if (!visible) {
      box.style.marginRight = '';
      pane.style.right = '';
      return;
    }
    const rect = box.getBoundingClientRect();
    const width = pane.offsetWidth;
    const edge = document.documentElement.clientWidth;
    const bite = GfsBar.bite({ left: edge - width, top: rect.top, right: edge, bottom: rect.top + rect.height });
    const gutter = Math.max(0, Math.ceil(bite.right));
    box.style.marginRight = (width + gutter) + 'px';
    pane.style.right = gutter ? gutter + 'px' : '';
    pane.style.top = (rect.top + Math.ceil(bite.top)) + 'px';
    pane.style.height = Math.max(0, rect.height - Math.ceil(bite.top) - Math.ceil(bite.bottom)) + 'px';
  }

  // --- Les gestes d'une ligne ---

  const clamp = pos => Math.max(0, Math.min(pos, editor.state.doc.content.size));
  // Pose la sélection sur un endroit et rend le focus à l'éditeur. Une image se sélectionne en entier, un paragraphe par son texte. Le focus se prend tout de suite (`view.focus`) : `chain().focus()` ne le
  // prend qu'à l'image suivante, trop tard pour une fenêtre qui s'ouvre aussitôt et dont le focus serait repris.
  function select(item) {
    const chain = editor.chain();
    if (item.node) chain.setNodeSelection(clamp(item.from)); else chain.setTextSelection({ from: clamp(item.from), to: clamp(item.to) });
    chain.scrollIntoView().run();
    editor.view.focus();
  }
  // Pose la sélection sur l'endroit suivant du constat (en boucle) et le dit.
  function see(check) {
    if (!editor || !check.items.length) return false;
    const at = ((state.cursor[check.id] === undefined ? -1 : state.cursor[check.id]) + 1) % check.items.length;
    state.cursor[check.id] = at;
    select(check.items[at]);
    if (seenOf[check.id]) seenOf[check.id].textContent = t('state.check.seen', { at: at + 1, count: check.items.length });
    return true;
  }
  // « Décrire » : la fenêtre du texte alternatif, sur la première image sans description.
  function describeImage(check) {
    const item = check.items[0];
    if (!editor || !editor.isEditable || !item) return false;
    select(item);
    return AltText.open();
  }

  function renderItem(check) {
    const text = StateCheck.describe(check);
    const warn = check.state === 'warn';
    const item = el('li', 'pp-statepane-item ' + (warn ? 'is-warn' : 'is-ok'));
    item.setAttribute('data-check', check.id);
    const icon = el('span', 'pp-statepane-icon');
    icon.setAttribute('aria-hidden', 'true');
    Dom.setMarkup(icon, Icons.svg(warn ? 'warnMark' : 'checkMark'));
    const body = el('div', 'pp-statepane-body');
    const title = el('strong', 'pp-statepane-name', text.title);
    const detail = el('span', 'pp-statepane-detail', text.detail);
    // L'état se lit aussi sans la couleur : un mot caché pour les lecteurs d'écran, avant le titre.
    title.prepend(el('span', 'pp-statepane-sr', t(warn ? 'state.check.state.warn' : 'state.check.state.ok') + ' : '));
    body.append(title, detail);
    item.append(icon, body);
    if (warn && check.items.length) {
      const image = check.id === 'images';
      const label = t(image ? 'state.check.describe' : 'state.check.see');
      const button = Dom.button('pp-statepane-go', label);
      button.setAttribute('aria-label', label + ' : ' + text.title);
      if (image && !(editor && editor.isEditable)) button.setAttribute('aria-disabled', 'true');
      button.addEventListener('click', () => { if (image) describeImage(check); else see(check); });
      // « 2 sur 5 » : où « Voir » en est, dit à côté du bouton (et aux lecteurs d'écran).
      const seen = el('span', 'pp-statepane-seen');
      seen.setAttribute('role', 'status');
      const actions = el('div', 'pp-statepane-actions');
      actions.append(button, seen);
      body.append(actions);
      seenOf[check.id] = seen;
    }
    return item;
  }

  function render() {
    if (!refs || !state.report) return;
    const { checks, warn, ok } = state.report;
    const parts = [];
    if (warn) parts.push(t('state.check.summary.warn', { count: warn }));
    if (ok) parts.push(t('state.check.summary.ok', { count: ok }));
    refs.summary.textContent = parts.join(' · ');
    refs.list.textContent = '';
    // Les lignes à revoir d'abord ; entre elles, l'ordre de js/state-check.js.
    checks.filter(c => c.state === 'warn').concat(checks.filter(c => c.state === 'ok')).forEach(check => refs.list.append(renderItem(check)));
  }

  // Relit le document et redessine. Un constat dont les endroits ont changé repart de son premier endroit.
  function refresh() {
    timer = 0;
    if (!state.open || !editor) return;
    state.report = StateCheck.read(editor.state.doc);
    state.cursor = {};
    layout();
    render();
  }
  function schedule() {
    if (!state.open) return;
    clearTimeout(timer);
    timer = setTimeout(refresh, REFRESH_MS);
  }

  // --- Ouvrir, fermer ---

  function syncRow() {
    const row = rowOf();
    if (!row) return;
    const { reason } = StateStyle.lock();
    const locked = !!reason;
    row.setAttribute('aria-disabled', locked ? 'true' : 'false');
    row.classList.toggle('v2-hover-row-disabled', locked);
    // Grisée mais cliquable : le clic explique. `data-explains` le dit aux raccourcis et à la palette (js/shortcuts.js:usable), qui font le même geste que la souris.
    row.toggleAttribute('data-explains', locked);
    LockReasons.set(row, 'explain', reason);
    row.classList.toggle('is-active', state.open);
    row.setAttribute('aria-pressed', state.open ? 'true' : 'false');
  }

  // Ouvre le volet. Faux, sans rien ouvrir, quand le mode n'est pas allumé ou que l'éditeur n'est pas à l'écran (Lecture, macro-modèle, grille).
  function open() {
    const box = container();
    if (!editor || !box || box.offsetParent === null || StateStyle.lock().reason) return false;
    if (typeof TrackChangesPane !== 'undefined' && TrackChangesPane.isOpen()) TrackChangesPane.closePane({ focus: false });
    ensure();
    state.open = true;
    refresh();
    if (!observer && typeof ResizeObserver === 'function') { observer = new ResizeObserver(layout); observer.observe(box); }
    if (!stopBar) stopBar = GfsBar.onChange(() => layout());
    syncRow();
    refs.close.focus();
    return true;
  }
  function closePane(options) {
    if (!state.open) return;
    state.open = false;
    clearTimeout(timer);
    timer = 0;
    if (stopBar) { stopBar(); stopBar = null; }
    layout();
    syncRow();
    if (!options || options.focus !== false) editor.commands.focus();
  }
  function toggle() { if (state.open) { closePane(); return true; } return open(); }

  // Le clic sur la ligne : ouvre ou ferme quand elle est libre ; grisée, l'extension absente ouvre la fenêtre d'installation de GFS, le mode éteint le dit dans le coin d'état.
  async function onRow() {
    const locked = StateStyle.lock();
    if (locked.missing) { await StateMode.explain(); return false; }
    if (locked.reason) { host.status(locked.reason, false); return false; }
    return toggle();
  }

  function wireEditor(ed) {
    editor = ed;
    ed.on('transaction', ({ transaction }) => { if (state.open && transaction && transaction.docChanged) schedule(); });
    window.addEventListener('resize', () => { if (state.open) layout(); });
    // Le mode éteint (ou l'extension retirée, ou arrivée après le démarrage : GFS annonce ses extensions quand il veut) pendant que le volet est ouvert : il se ferme, la ligne se grise ou se libère.
    const onStateChange = () => { if (state.open && StateStyle.lock().reason) closePane({ focus: false }); syncRow(); };
    StateMode.onChange(onStateChange);
    Extensions.onChange(onStateChange);
    syncRow();
  }

  return { wire, wireEditor, open, closePane, toggle, onRow, syncRow, isOpen: () => state.open, report: () => state.report };
})();
