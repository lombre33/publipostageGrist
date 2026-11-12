// Info-bulle de valeur d'une bulle de l'éditeur : laisser la souris sur une bulle #Variable (ou « Calcul ») sans cliquer montre ce qu'elle vaut pour la ligne sélectionnée dans Grist - la valeur telle
// que la Lecture l'écrit. Dans une zone répétée (ligne de tableau, élément de liste, paragraphe, section), les premiers tours de la zone (5 au plus, « + N autres » pour le reste).
// Au clavier : la bulle sélectionnée aux flèches montre la même info-bulle, dessous, après 0,6 s ; Échap la ferme.
//
// Ce que ça coûte :
//  - au repos et à la frappe, rien : deux écouteurs délégués sur le document de l'éditeur (survol d'une bulle), aucun par bulle, rien dans les transactions ni dans le signalement des bulles
//    (markBadgeValidity) ; un texte qui glisse sous une souris parquée envoie un vrai `mouseover` - l'info-bulle n'est donc armée qu'après un vrai mouvement de souris (3 px) depuis la dernière touche
//    ou le dernier défilement ;
//  - au survol, une résolution (ReaderMode.peek : la porte de la Lecture, sur une copie de la bulle) dans une passe de lecture de 10 s (GristAPI.withSharedReadPass) : balayer dix bulles ne lit chaque
//    table qu'une fois. L'attente de 0,5 s (0,15 s juste après une première info-bulle fermée) laisse passer la souris qui ne fait que traverser le texte ; le résultat est jeté si la souris est partie.
// Une bulle rouge (cassée) ou ambre (sans lien) garde son info-bulle d'origine (`title`, js/editor.js:markBadgeValidity) : elle explique le défaut, la valeur n'existe pas.
// L'info-bulle se survole et se sélectionne (WCAG 1.4.13) ; elle se ferme à la frappe, au clic, au défilement, à Échap, quand la ligne de Grist change. Tout s'écrit en texte, jamais en HTML.
// Réglage : Réglages > Thème > « Bulles et puces dans l'éditeur », une préférence de ce navigateur (PersonStore `pp_variable_tip`), allumée au départ. Styles : css/variable-tip.css ; pose : js/editor-tip.js.
//   VariableTip.wire(editor) / isOn() / setOn(vrai|faux) / showSelected() (la bulle sélectionnée, tout de suite : la palette de commandes) / close()
const VariableTip = (function () {
  const el = Dom.el;
  const SELECTOR = 'span.var-badge, span.calc-badge';
  // Les bulles qui expliquent un défaut (rouge, ambre) : leur `title` d'origine suffit.
  const FLAWED = '.var-badge-broken, .var-badge-unlinked, .var-badge-otherwise-broken, .calc-badge-broken, .calc-badge-unlinked';
  const STORAGE = 'pp_variable_tip';
  const ID = 'pp-var-tip';
  const DELAY_MS = 500;       // la souris s'arrête sur la bulle
  const WARM_DELAY_MS = 150;  // ... juste après une info-bulle fermée (on balaie plusieurs bulles)
  const WARM_WINDOW_MS = 1500;
  const KEY_DELAY_MS = 600;   // la bulle sélectionnée aux flèches
  const GRACE_MS = 150;       // le temps de passer de la bulle à l'info-bulle
  const MOVE_PX = 3;
  const MAX_TURNS = 5;
  const NAV_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']);

  let enabled = true;
  const readEnabled = () => PersonStore.get(STORAGE) !== 'off';
  const isOn = () => enabled;
  function setOn(on) {
    const kept = PersonStore.set(STORAGE, on ? 'on' : 'off');
    enabled = readEnabled();
    if (!enabled) close();
    return kept;
  }

  let editor = null;
  let dom = null;
  let tip = null;
  let live = null;
  let hoverBadge = null; // la bulle sous la souris
  let openFor = null;    // la bulle dont l'info-bulle est affichée
  let suppressed = null; // la bulle dont l'info-bulle vient d'être fermée à la main (clic, Échap) : pas de retour tant que la souris ne l'a pas quittée
  let timer = null;
  let graceTimer = null;
  let keyTimer = null;
  let token = 0;         // une lecture en cours n'écrit rien si elle n'est plus la dernière demandée
  let closedAt = 0;
  // Un vrai mouvement de souris depuis la dernière touche ou le dernier défilement ? Au départ, oui.
  let armed = true;
  let origin = null;
  let pending = null;

  const badgeOf = target => (target && target.closest ? target.closest(SELECTOR) : null);

  function resetPointer() {
    armed = false;
    origin = null;
    pending = hoverBadge;
  }
  function arm(badge, delay) {
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; open(badge, 'mouse'); }, delay);
  }
  const hoverDelay = () => (Date.now() - closedAt < WARM_WINDOW_MS ? WARM_DELAY_MS : DELAY_MS);

  function close() {
    clearTimeout(timer);
    clearTimeout(graceTimer);
    clearTimeout(keyTimer);
    timer = graceTimer = keyTimer = null;
    token++;
    if (tip && !tip.hidden) {
      tip.hidden = true;
      closedAt = Date.now();
    }
    if (openFor) {
      openFor.removeAttribute('aria-describedby');
      openFor = null;
    }
  }

  function onOver(event) {
    if (!enabled) return;
    const badge = badgeOf(event.target);
    if (!badge || badge === hoverBadge || !dom.contains(badge)) return;
    hoverBadge = badge;
    clearTimeout(graceTimer);
    if (openFor && openFor !== badge) close();
    if (openFor === badge || suppressed === badge || badge.matches(FLAWED)) return;
    if (!armed) { pending = badge; return; }
    arm(badge, hoverDelay());
  }
  function onOut(event) {
    const badge = badgeOf(event.target);
    if (!badge || badge !== hoverBadge) return;
    if (event.relatedTarget && badge.contains(event.relatedTarget)) return;
    hoverBadge = null;
    pending = null;
    clearTimeout(timer);
    timer = null;
    if (suppressed === badge) suppressed = null;
    if (openFor === badge) {
      if (!(event.relatedTarget && tip && tip.contains(event.relatedTarget))) graceTimer = setTimeout(close, GRACE_MS);
    } else {
      token++; // la lecture en cours (la souris est partie) n'écrira rien
    }
  }
  function onMove(event) {
    if (armed) return;
    if (!origin) { origin = { x: event.clientX, y: event.clientY }; return; }
    if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) < MOVE_PX) return;
    armed = true;
    if (pending && pending === hoverBadge && pending !== suppressed && !openFor && !timer) arm(pending, hoverDelay());
  }
  function onKeydown(event) {
    clearTimeout(keyTimer);
    keyTimer = null;
    if (event.key === 'Escape' && openFor) suppressed = hoverBadge;
    resetPointer();
    if (openFor || timer || graceTimer) close();
  }
  function onMousedown(event) {
    if (tip && tip.contains(event.target)) return; // sélectionner ou copier dans l'info-bulle
    suppressed = badgeOf(event.target) === hoverBadge ? hoverBadge : null;
    if (openFor || timer || graceTimer || keyTimer) close();
  }
  function onScroll() {
    resetPointer();
    if (openFor || timer || graceTimer || keyTimer) close();
  }

  // La bulle sélectionnée (flèches, ou la palette) : le nœud sélectionné, pas la bulle voisine du curseur.
  function selectedBadge() {
    const selection = editor && editor.state.selection;
    const node = selection && selection.node;
    if (!node || (node.type.name !== 'varBadge' && node.type.name !== 'calcBadge')) return null;
    const found = editor.view.nodeDOM(selection.from);
    return found && found.nodeType === 1 && found.matches(SELECTOR) ? found : null;
  }
  function onKeyup(event) {
    if (!enabled || !NAV_KEYS.has(event.key)) return;
    clearTimeout(keyTimer);
    keyTimer = null;
    const badge = selectedBadge();
    if (!badge || badge.matches(FLAWED)) return;
    keyTimer = setTimeout(() => { keyTimer = null; open(badge, 'key'); }, KEY_DELAY_MS);
  }
  // Pour la palette de commandes : la valeur de la bulle sélectionnée, tout de suite. Faux quand aucune bulle n'est sélectionnée.
  function showSelected() {
    const badge = selectedBadge();
    if (!badge) return false;
    close();
    open(badge, 'key');
    return true;
  }

  async function open(badge, how) {
    if (!enabled || !badge.isConnected || badge.matches(FLAWED)) return;
    const mine = ++token;
    const record = GristAPI.getCurrentRecord();
    const tableId = GristAPI.getCurrentTableId();
    let result = null;
    if (record && tableId) {
      try { result = await ReaderMode.peek(badge, tableId, record, { root: dom, max: MAX_TURNS }); }
      catch (e) { console.error('[VariableTip] lecture de la valeur impossible', e); return; }
    }
    if (mine !== token || !badge.isConnected || GristAPI.getCurrentRecord() !== record) return;
    if (how === 'mouse' && hoverBadge !== badge) return;
    show(badge, record, result, how);
  }

  function ensureTip() {
    if (tip) return tip;
    tip = EditorTip.create('pp-var-tip');
    tip.id = ID;
    tip.addEventListener('mouseenter', () => clearTimeout(graceTimer));
    tip.addEventListener('mouseleave', event => {
      if (openFor && !(event.relatedTarget && openFor.contains(event.relatedTarget))) graceTimer = setTimeout(close, GRACE_MS);
    });
    return tip;
  }
  function announce(text) {
    if (!live) {
      live = el('div', 'pp-var-tip-live');
      live.setAttribute('aria-live', 'polite');
      document.body.appendChild(live);
    }
    live.textContent = '';
    live.textContent = text;
  }

  // Une ligne de l'info-bulle pour une valeur : le texte tel que la Lecture l'écrit, ou - en clair - pourquoi il n'y en a pas.
  function turnText(turn) {
    if (turn.hidden) return el('span', 'pp-var-tip-dim', I18n.t('varTip.hidden'));
    if (turn.empty) return el('span', 'pp-var-tip-dim', I18n.t('varTip.empty'));
    if (turn.files) return el('span', 'pp-var-tip-value', I18n.t('varTip.files', { count: turn.files }));
    return el('span', 'pp-var-tip-value', turn.error || turn.text);
  }
  function fill(box, badge, record, result) {
    box.replaceChildren();
    const name = badge.textContent.trim();
    if (!record || !result) {
      box.append(el('span', 'pp-var-tip-dim', I18n.t('varTip.noRow')), el('span', 'pp-var-tip-foot', name));
      return;
    }
    const { turns, total, zone } = result;
    if (!turns.length) {
      box.append(el('span', 'pp-var-tip-dim', I18n.t('varTip.zoneEmpty')));
    } else if (zone) {
      box.append(el('span', 'pp-var-tip-note', I18n.t(zone.nested ? 'varTip.zoneNested' : 'varTip.zone', { count: total })));
      turns.forEach((turn, index) => {
        const row = el('span', 'pp-var-tip-turn');
        row.append(el('span', 'pp-var-tip-n', String(index + 1)), turnText(turn));
        box.append(row);
      });
      if (total > turns.length) box.append(el('span', 'pp-var-tip-note', I18n.t('varTip.more', { count: total - turns.length })));
    } else {
      if (turns[0].otherwise) box.append(el('span', 'pp-var-tip-note', I18n.t('varTip.otherwise')));
      box.append(turnText(turns[0]));
    }
    box.append(el('span', 'pp-var-tip-foot', I18n.t('varTip.foot', { name, id: record.id })));
  }
  function show(badge, record, result, how) {
    const box = ensureTip();
    fill(box, badge, record, result);
    EditorTip.place(box, badge);
    if (openFor && openFor !== badge) openFor.removeAttribute('aria-describedby');
    openFor = badge;
    badge.setAttribute('aria-describedby', ID);
    if (how === 'key') announce(box.textContent);
  }

  function wire(ed) {
    editor = ed;
    dom = ed.view.dom;
    enabled = readEnabled();
    dom.addEventListener('mouseover', onOver);
    dom.addEventListener('mouseout', onOut);
    dom.addEventListener('mousemove', onMove, { passive: true });
    dom.addEventListener('keyup', onKeyup);
    document.addEventListener('keydown', onKeydown, true);
    document.addEventListener('mousedown', onMousedown, true);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('blur', close);
    GristAPI.onRecord(close);
  }

  return { wire, isOn, setOn, showSelected, close };
})();
