// Plusieurs objets de diapositive à la fois : les sélectionner ensemble, les déplacer, les aligner, les répartir, les accrocher en glissant (repères) et les grouper (chantier « alignement et sélection
// multiple » de l'audit Slides+, 02-03/11 ; carte « Idem + guides + groupes » du 03/11). js/free-frame.js ne connaît toujours qu'un cadre sélectionné (une NodeSelection) : celui-ci reste le cadre PRINCIPAL, et ce fichier
// garde à côté la liste des autres (`extras`, des positions que les transactions suivent), sans toucher à la sélection de ProseMirror. Un seul état, ici : la sélection de ProseMirror reste celle d'un cadre,
// et le reste du widget (barres, exports, Annuler) n'a rien à savoir d'une sélection multiple.
//  - Maj + clic sur le bord d'un cadre (ou dans un cadre, un cadre étant déjà sélectionné) l'ajoute à la sélection ou l'en retire ; Ctrl + A, un cadre sélectionné, prend tous ceux de la diapositive ; Échap
//    revient au cadre principal. Les cadres choisis doivent être de la même diapositive.
//  - Glisser le bord de l'un d'eux les déplace tous du même écart ; les flèches aussi (1 pt, Maj : 10) ; Suppr les supprime, Ctrl + D les duplique : chaque geste est UN pas d'historique.
//  - La barre « objets sélectionnés » (deux cadres ou plus) aligne à gauche, au centre, à droite, en haut, au milieu, en bas, sur l'ensemble choisi, et répartit à égalité les écarts (trois cadres ou plus).
//    Un cadre seul s'aligne sur la diapositive par le menu « Aligner » de sa barre (js/free-frame.js).
//  - LES REPÈRES : en déplaçant (un objet ou plusieurs), l'ensemble s'accroche à 6 pixels près aux bords et aux centres des autres objets de la diapositive et de la diapositive elle-même ; un trait
//    rose le dit tant que ça tient, Alt suspend l'accroche. Rien ne s'écrit : seul le point d'arrivée change.
//  - LES GROUPES : Ctrl + G range les objets choisis dans un groupe (attribut `group` de l'objet, js/free-frame.js), Ctrl + Maj + G le défait. Choisir l'un d'eux choisit tout le groupe (appendTransaction) ;
//    Maj + clic en ajoute ou retire tout le groupe ; un clic dans le texte d'un membre y pose le curseur comme avant. Un groupe se déplace, s'aligne, se duplique (la copie est un groupe à part) et se
//    supprime d'un bloc. Les exports (PDF, Word, HTML, PowerPoint) ne connaissent pas les groupes : les objets y sont libres, à leur place.
// Les calculs (`boundsOf`, `alignDeltas`, `distributeDeltas`, `snapMove`) sont des fonctions pures, essayées seules (dev-tests/scenarios-frame-multi.js).
const FrameMulti = (function () {
  const KEY_NAME = 'ppFrameMulti';
  const SELECTED = 'pp-ff-selected';
  const MULTI = 'pp-ff-multi';
  const NUDGE_PT = 1;
  const NUDGE_BIG_PT = 10;
  const CASCADE_PT = 12;
  const SNAP_PX = 6;            // l'accroche des repères, en pixels écran
  const GUIDE_CLASS = 'pp-ff-guide';
  // Les réglages d'alignement : le nom de l'action, l'icône (js/icons.js) et la clé de son nom (js/i18n.js).
  const ALIGNS = [
    ['left', 'alignObjLeft', 'multi.alignLeft'], ['center', 'alignObjCenter', 'multi.alignCenter'], ['right', 'alignObjRight', 'multi.alignRight'],
    ['top', 'alignObjTop', 'multi.alignTop'], ['middle', 'alignObjMiddle', 'multi.alignMiddle'], ['bottom', 'alignObjBottom', 'multi.alignBottom'],
  ];
  const DISTRIBUTES = [['distribute-h', 'distributeH', 'multi.distributeH'], ['distribute-v', 'distributeV', 'multi.distributeV']];

  let api = null;     // ce que js/free-frame.js prête (bind)
  let key = null;
  let panel = null;   // la barre « objets sélectionnés »
  let alignMenu = null;
  const bind = deps => { api = deps; };
  const hideBar = () => { if (panel) panel.hide(); };

  // ---- Les calculs ---------------------------------------------------------------------------------------------------------------------------------

  // Le rectangle que l'objet occupe vraiment, en points depuis le coin de la page : { l, t, r, b }. `a` : ses mesures (normalized), `shownH` : sa hauteur à l'écran (la hauteur demandée est un minimum, le
  // texte peut la dépasser). Un objet pivoté occupe le rectangle qui l'enveloppe, autour du même centre.
  function boundsOf(a, shownH) {
    const h = shownH == null ? a.h : shownH;
    const cx = a.x + a.w / 2;
    const cy = a.y + h / 2;
    const turn = (a.rot || 0) * Math.PI / 180;
    const cos = Math.abs(Math.cos(turn));
    const sin = Math.abs(Math.sin(turn));
    const w2 = (a.w * cos + h * sin) / 2;
    const h2 = (a.w * sin + h * cos) / 2;
    return { l: cx - w2, t: cy - h2, r: cx + w2, b: cy + h2 };
  }
  const union = list => list.reduce((u, i) => ({ l: Math.min(u.l, i.b.l), t: Math.min(u.t, i.b.t), r: Math.max(u.r, i.b.r), b: Math.max(u.b, i.b.b) }),
    { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity });
  // De combien chaque objet bouge pour s'aligner (`mode` : left, center, right, top, middle, bottom) sur `ref` (un rectangle : l'ensemble choisi ou la page). `items` : [{ id, b }]. Rend { id, dx, dy }.
  function alignDeltas(items, mode, ref) {
    return items.map(({ id, b }) => {
      let dx = 0;
      let dy = 0;
      if (mode === 'left') dx = ref.l - b.l;
      else if (mode === 'right') dx = ref.r - b.r;
      else if (mode === 'center') dx = (ref.l + ref.r) / 2 - (b.l + b.r) / 2;
      else if (mode === 'top') dy = ref.t - b.t;
      else if (mode === 'bottom') dy = ref.b - b.b;
      else if (mode === 'middle') dy = (ref.t + ref.b) / 2 - (b.t + b.b) / 2;
      return { id, dx, dy };
    });
  }
  // La répartition à égalité des écarts (`axis` : 'h' ou 'v') : les deux objets des bouts restent où ils sont, ceux d'entre eux se rangent dans l'ordre où ils sont, séparés d'un même vide. Trois objets au moins.
  function distributeDeltas(items, axis) {
    const lo = axis === 'h' ? 'l' : 't';
    const hi = axis === 'h' ? 'r' : 'b';
    const dxy = axis === 'h' ? 'dx' : 'dy';
    const sorted = items.slice().sort((p, q) => (p.b[lo] + p.b[hi]) - (q.b[lo] + q.b[hi]));
    const out = items.map(({ id }) => ({ id, dx: 0, dy: 0 }));
    if (sorted.length < 3) return out;
    const span = Math.max(...sorted.map(i => i.b[hi])) - Math.min(...sorted.map(i => i.b[lo]));
    const used = sorted.reduce((sum, i) => sum + (i.b[hi] - i.b[lo]), 0);
    const gap = (span - used) / (sorted.length - 1);
    let at = Math.min(...sorted.map(i => i.b[lo]));
    sorted.forEach((item) => {
      out.find(o => o.id === item.id)[dxy] = at - item.b[lo];
      at += (item.b[hi] - item.b[lo]) + gap;
    });
    return out;
  }

  // L'accroche : de combien (dx, dy) l'ensemble `b` { l, t, r, b } doit bouger pour que l'un de ses bords ou son centre tombe sur un bord ou un centre d'un rectangle de `targets`, à `thr` points près
  // (le plus près l'emporte, par axe), et les traits à montrer ensuite : { axis: 'x' (trait vertical) | 'y' (trait horizontal), at, from, to }. Rien à moins de `thr` : { dx: 0, dy: 0, guides: [] }.
  const edgesX = r => [r.l, (r.l + r.r) / 2, r.r];
  const edgesY = r => [r.t, (r.t + r.b) / 2, r.b];
  function snapMove(b, targets, thr) {
    const closest = (mine, edgesOf) => {
      let best = null;
      mine.forEach((m) => { targets.forEach((t) => { edgesOf(t).forEach((e) => { const d = e - m; if (Math.abs(d) <= thr && (best === null || Math.abs(d) < Math.abs(best))) best = d; }); }); });
      return best === null ? 0 : best;
    };
    const dx = closest(edgesX(b), edgesX);
    const dy = closest(edgesY(b), edgesY);
    const moved = { l: b.l + dx, t: b.t + dy, r: b.r + dx, b: b.b + dy };
    const guides = [];
    const add = (axis, at, from, to) => {
      const same = guides.find(g => g.axis === axis && Math.abs(g.at - at) < 0.01);
      if (same) { same.from = Math.min(same.from, from); same.to = Math.max(same.to, to); } else guides.push({ axis, at, from, to });
    };
    targets.forEach((t) => {
      edgesX(moved).forEach((m) => { edgesX(t).forEach((e) => { if (Math.abs(e - m) < 0.01) add('x', e, Math.min(moved.t, t.t), Math.max(moved.b, t.b)); }); });
      edgesY(moved).forEach((m) => { edgesY(t).forEach((e) => { if (Math.abs(e - m) < 0.01) add('y', e, Math.min(moved.l, t.l), Math.max(moved.r, t.r)); }); });
    });
    return { dx, dy, guides };
  }

  // ---- L'état : la liste des autres cadres choisis -------------------------------------------------------------------------------------------------

  function createPlugin(deps) {
    const { Plugin, PluginKey, Decoration, DecorationSet } = deps;
    key = new PluginKey(KEY_NAME);
    return new Plugin({
      key,
      state: {
        init: () => ({ extras: [] }),
        // Les positions suivent le document ; toute autre sélection (un clic ailleurs, une frappe) vide la liste, sauf quand la transaction la donne (meta).
        apply(tr, value) {
          const meta = tr.getMeta(key);
          if (meta) return { extras: meta.extras.slice() };
          if (!value.extras.length) return value;
          if (tr.selectionSet) return { extras: [] };
          if (!tr.docChanged) return value;
          const extras = [];
          value.extras.forEach((pos) => { const mapped = tr.mapping.mapResult(pos, 1); if (!mapped.deleted) extras.push(mapped.pos); });
          return { extras };
        },
      },
      // Choisir un objet d'un groupe choisit tout le groupe (les membres sont les « autres » cadres, le cadre pris étant le principal).
      appendTransaction(trs, oldState, newState) {
        if (!trs.some(tr => tr.selectionSet || tr.getMeta(key))) return null;
        const primary = api && api.selectedFrame(newState.selection);
        if (!primary) return null;
        const list = selected(newState).map(item => item.pos);
        const closed = closure(newState.doc, list);
        if (closed.length === list.length) return null;
        return withSelection(null, newState.tr, primary.pos, closed.filter(p => p !== primary.pos));
      },
      props: {
        // Tous les cadres choisis se dessinent comme le cadre sélectionné (contour), sans ses poignées (css/free-frame.css : `pp-ff-multi`).
        decorations(state) {
          const list = selected(state);
          if (list.length < 2) return null;
          return DecorationSet.create(state.doc, list.map(({ pos, node }) => Decoration.node(pos, pos + node.nodeSize, { class: MULTI + ' ' + SELECTED })));
        },
      },
    });
  }
  const extrasOf = state => (key && key.getState(state) ? key.getState(state).extras : []);
  // Les cadres choisis, dans l'ordre du document : { pos, node }. Vide quand le cadre principal n'est plus sélectionné.
  function selected(state) {
    const primary = api && api.selectedFrame(state.selection);
    if (!primary) return [];
    const list = [primary];
    extrasOf(state).forEach((pos) => {
      const node = state.doc.nodeAt(pos);
      if (api.isFrame(node) && pos !== primary.pos) list.push({ pos, node });
    });
    return list.sort((p, q) => p.pos - q.pos);
  }
  const count = state => selected(state).length;
  // Une transaction qui garde (ou donne) la liste des autres cadres choisis, le cadre principal sélectionné.
  function withSelection(ed, tr, primaryPos, extras) {
    tr.setSelection(api.libs().NodeSelection.create(tr.doc, primaryPos)).setMeta(key, { extras });
    return tr;
  }

  // Ajoute (ou retire) le cadre en `pos` de la sélection. Faux quand rien ne change (pas un cadre, ou une autre diapositive que celle des cadres déjà choisis).
  function toggle(ed, pos) {
    const { state } = ed;
    const node = state.doc.nodeAt(pos);
    if (!api.isFrame(node)) return false;
    const primary = api.selectedFrame(state.selection);
    if (!primary) { api.select(ed, pos); return true; }
    if (api.slideStartOf(state.doc, pos) !== api.slideStartOf(state.doc, primary.pos)) return false;
    const list = selected(state).map(item => item.pos);
    const has = list.indexOf(pos) >= 0;
    // Un objet groupé entre et sort avec tout son groupe.
    const whole = closure(state.doc, [pos]);
    const next = has ? list.filter(p => whole.indexOf(p) < 0) : closure(state.doc, list.concat(whole));
    if (!next.length) return true;
    const main = has ? (next.indexOf(primary.pos) >= 0 ? primary.pos : next[next.length - 1]) : pos;
    ed.view.dispatch(withSelection(ed, state.tr, main, next.filter(p => p !== main)));
    return true;
  }
  // Tous les cadres de la diapositive du cadre sélectionné.
  function selectAll(ed) {
    const { state } = ed;
    const primary = api.selectedFrame(state.selection);
    if (!primary) return false;
    const head = api.headRange(state.doc, api.slideStartOf(state.doc, primary.pos));
    const all = [];
    state.doc.nodesBetween(head.from, head.to, (node, pos) => { if (api.isFrame(node)) all.push(pos); return false; });
    if (all.length < 2) return false;
    const main = all.indexOf(primary.pos) >= 0 ? primary.pos : all[all.length - 1];
    ed.view.dispatch(withSelection(ed, state.tr, main, all.filter(p => p !== main)));
    return true;
  }
  // Revient au cadre principal seul.
  function collapse(ed) {
    const primary = api.selectedFrame(ed.state.selection);
    if (!primary || !extrasOf(ed.state).length) return false;
    ed.view.dispatch(withSelection(ed, ed.state.tr, primary.pos, []));
    return true;
  }

  // ---- Les groupes ---------------------------------------------------------------------------------------------------------------------------------

  const groupIdOf = node => (node && node.attrs && node.attrs.group) || '';
  // Les positions des objets de la diapositive de `pos` (dans l'ordre du document).
  function framesOfSlide(doc, pos) {
    const head = api.headRange(doc, api.slideStartOf(doc, pos));
    const all = [];
    doc.nodesBetween(head.from, head.to, (node, at) => { if (api.isFrame(node)) all.push(at); return false; });
    return all;
  }
  // `positions` et, pour chacun, les objets de son groupe (de la même diapositive) ; trié, sans doublon.
  function closure(doc, positions) {
    const out = new Set(positions);
    positions.forEach((pos) => {
      const id = groupIdOf(doc.nodeAt(pos));
      if (!id) return;
      framesOfSlide(doc, pos).forEach((at) => { if (groupIdOf(doc.nodeAt(at)) === id) out.add(at); });
    });
    return Array.from(out).sort((p, q) => p - q);
  }
  const hasGroup = list => list.some(item => groupIdOf(item.node));
  const newGroupId = (doc) => {
    const used = new Set();
    doc.descendants((node) => { if (api.isFrame(node)) { used.add(groupIdOf(node)); return false; } return true; });
    let id = '';
    do { id = 'g' + Math.random().toString(36).slice(2, 8); } while (used.has(id));
    return id;
  };
  // Ctrl + G : les objets choisis (deux au moins) forment UN groupe ; ceux qui étaient déjà dans un groupe le quittent pour celui-ci. Faux quand rien ne change.
  function group(ed) {
    const list = selected(ed.state);
    if (list.length < 2) return false;
    const ids = new Set(list.map(item => groupIdOf(item.node)));
    if (ids.size === 1 && !ids.has('')) return false;
    const id = newGroupId(ed.state.doc);
    return patchMany(ed, list.map(item => ({ pos: item.pos, changes: { group: id } })));
  }
  // Ctrl + Maj + G : les objets choisis (tout leur groupe l'est déjà) sortent de leur groupe. Faux quand aucun n'est groupé.
  function ungroup(ed) {
    const list = selected(ed.state);
    if (!hasGroup(list)) return false;
    return patchMany(ed, list.map(item => ({ pos: item.pos, changes: { group: '' } })));
  }

  // ---- Les gestes sur l'ensemble -------------------------------------------------------------------------------------------------------------------

  // Les mesures d'un cadre choisi à l'écran : { pos, node, a, b } (b : le rectangle qu'il occupe, hauteur du texte comprise).
  function measure(ed, item) {
    const a = api.normalized(item.node.attrs);
    const dom = ed.view.nodeDOM(item.pos);
    const box = dom && dom.querySelector ? dom.querySelector('.' + api.BOX) : null;
    const natural = box ? api.naturalHeight(box, EditorCore.layoutZoom(box)) : 0;
    const shownH = api.isLineAttrs(a) ? a.h : Math.max(a.h, natural);
    return { pos: item.pos, node: item.node, a, b: boundsOf(a, shownH) };
  }
  // Écrit les mesures de plusieurs cadres en UNE transaction ; la sélection (le cadre principal et les autres) reste. `moves` : [{ pos, changes }].
  function patchMany(ed, moves) {
    const { state } = ed;
    const tr = api.own(state.tr);
    let changed = false;
    moves.forEach(({ pos, changes }) => {
      const node = state.doc.nodeAt(pos);
      if (!api.isFrame(node)) return;
      const next = api.normalized(Object.assign({}, node.attrs, changes));
      if (Object.keys(next).every(name => next[name] === node.attrs[name])) return;
      tr.setNodeMarkup(pos, undefined, Object.assign({}, node.attrs, next));
      changed = true;
    });
    if (!changed) return false;
    const primary = api.selectedFrame(state.selection);
    if (primary) withSelection(ed, tr, primary.pos, extrasOf(state));
    ed.view.dispatch(tr);
    return true;
  }
  // Aligne les cadres choisis (`mode` : left, center, right, top, middle, bottom) sur l'ensemble qu'ils forment, ou sur la page quand il n'y en a qu'un. Faux quand rien ne bouge.
  function align(ed, mode) {
    const items = selected(ed.state).map(item => measure(ed, item));
    if (!items.length) return false;
    const page = api.pageSize();
    const ref = items.length === 1 ? { l: 0, t: 0, r: page.width, b: page.height } : union(items);
    const deltas = alignDeltas(items.map(i => ({ id: i.pos, b: i.b })), mode, ref);
    return patchMany(ed, deltas.map(d => ({ pos: d.id, changes: { x: items.find(i => i.pos === d.id).a.x + d.dx, y: items.find(i => i.pos === d.id).a.y + d.dy } })));
  }
  function distribute(ed, axis) {
    const items = selected(ed.state).map(item => measure(ed, item));
    if (items.length < 3) return false;
    const deltas = distributeDeltas(items.map(i => ({ id: i.pos, b: i.b })), axis);
    return patchMany(ed, deltas.map(d => ({ pos: d.id, changes: { x: items.find(i => i.pos === d.id).a.x + d.dx, y: items.find(i => i.pos === d.id).a.y + d.dy } })));
  }
  // Déplace tous les cadres choisis de (dx, dy) points ; chacun reste atteignable (keepReachable).
  function nudge(ed, dx, dy) {
    const page = api.pageSize();
    return patchMany(ed, selected(ed.state).map((item) => {
      const a = api.normalized(item.node.attrs);
      const moved = api.keepReachable({ x: a.x + dx, y: a.y + dy, w: a.w, h: a.h }, page);
      return { pos: item.pos, changes: { x: moved.x, y: moved.y } };
    }));
  }
  function remove(ed) {
    const list = selected(ed.state);
    if (!list.length) return false;
    const tr = api.own(ed.state.tr);
    list.slice().reverse().forEach((item) => { tr.delete(item.pos, item.pos + item.node.nodeSize); });
    ed.view.dispatch(tr.scrollIntoView());
    ed.view.focus();
    return true;
  }
  // Duplique tous les cadres choisis, décalés de 12 pt, devant ceux de leur diapositive ; les copies sont la nouvelle sélection.
  function duplicate(ed) {
    const { state } = ed;
    const list = selected(state);
    if (!list.length) return false;
    const page = api.pageSize();
    const head = api.headRange(state.doc, api.slideStartOf(state.doc, list[0].pos));
    // Un groupe copié en entier donne un groupe à part (jamais des copies mêlées à l'original) ; un objet seul d'un groupe copié sort du groupe.
    const fresh = {};
    list.forEach((item) => { const id = groupIdOf(item.node); if (id && !(id in fresh)) fresh[id] = list.filter(i => groupIdOf(i.node) === id).length > 1 ? newGroupId(state.doc) + Object.keys(fresh).length : ''; });
    const copies = list.map((item) => {
      const a = api.normalized(item.node.attrs);
      const spot = api.keepReachable({ x: a.x + CASCADE_PT, y: a.y + CASCADE_PT, w: a.w, h: a.h }, page);
      return item.node.type.create(Object.assign({}, item.node.attrs, { x: spot.x, y: spot.y, group: fresh[groupIdOf(item.node)] || '' }), item.node.content, item.node.marks);
    });
    const tr = api.own(state.tr);
    let at = head.to;
    const positions = copies.map((copy) => { const here = at; tr.insert(at, copy); at += copy.nodeSize; return here; });
    const main = positions[positions.length - 1];
    withSelection(ed, tr, main, positions.slice(0, -1));
    ed.view.dispatch(tr.scrollIntoView());
    return true;
  }
  // Le glissé d'un cadre choisi les déplace tous : les autres cadres du geste (leur DOM pour les peindre, leurs mesures de départ), ou [] quand le cadre en `pos` n'est pas parmi plusieurs.
  function groupFor(ed, pos) {
    const list = selected(ed.state);
    if (list.length < 2 || !list.some(item => item.pos === pos)) return [];
    return list.filter(item => item.pos !== pos).map((item) => {
      const dom = ed.view.nodeDOM(item.pos);
      return { pos: item.pos, dom, start: api.normalized(item.node.attrs) };
    });
  }
  // Écrit le glissé : `moves` [{ pos, x, y }].
  const commitMoves = (ed, moves) => patchMany(ed, moves.map(m => ({ pos: m.pos, changes: { x: m.x, y: m.y } })));

  // ---- Les repères ---------------------------------------------------------------------------------------------------------------------------------

  // Les repères d'un glissé (js/free-frame.js:startGesture) : `pos` l'objet pris, `members` les autres du geste, `box` sa boîte à l'écran, `start` ses mesures de départ, `shown` sa hauteur à l'écran, `zoom`
  // la mise à l'échelle de la feuille. `snap(current, off)` rend les mesures corrigées (accrochées) et montre les traits ; `off` (Alt) les suspend ; `end()` les retire.
  function snapper(ed, { pos, members, box, start, shown, zoom }) {
    if (!api || !box) return null;
    const all = [pos].concat(members);
    const items = all.map(at => ({ pos: at, node: ed.state.doc.nodeAt(at) })).filter(item => api.isFrame(item.node));
    if (!items.length) return null;
    const b0 = union(items.map(item => ({ b: measure(ed, item).b })));
    const page = api.pageSize();
    const targets = [{ l: 0, t: 0, r: page.width, b: page.height }];
    const mine = new Set(all);
    framesOfSlide(ed.state.doc, pos).forEach((at) => {
      const node = ed.state.doc.nodeAt(at);
      if (mine.has(at) || !api.isFrame(node) || api.normalized(node.attrs).hidden) return;
      targets.push(measure(ed, { pos: at, node }).b);
    });
    const perPx = api.ptPerPx;
    const toPx = pt => pt / perPx * zoom;
    const thr = SNAP_PX * perPx / zoom;
    // Le coin de la page à l'écran : le centre de la boîte (celui de son rectangle, pivotée ou non) moins sa place en points.
    const rect = box.getBoundingClientRect();
    const origin = { left: rect.left + rect.width / 2 - toPx(start.x + start.w / 2), top: rect.top + rect.height / 2 - toPx(start.y + shown / 2) };
    let layer = null;
    const draw = (guides) => {
      if (!guides.length) { if (layer) layer.textContent = ''; return; }
      if (!layer) {
        layer = document.createElement('div');
        layer.className = GUIDE_CLASS + 's';
        layer.setAttribute('aria-hidden', 'true');
        document.body.appendChild(layer);
      }
      layer.textContent = '';
      guides.forEach((g) => {
        const line = document.createElement('div');
        line.className = GUIDE_CLASS + ' ' + GUIDE_CLASS + '-' + g.axis;
        if (g.axis === 'x') { line.style.left = origin.left + toPx(g.at) + 'px'; line.style.top = origin.top + toPx(g.from) + 'px'; line.style.height = toPx(g.to - g.from) + 'px'; }
        else { line.style.top = origin.top + toPx(g.at) + 'px'; line.style.left = origin.left + toPx(g.from) + 'px'; line.style.width = toPx(g.to - g.from) + 'px'; }
        layer.appendChild(line);
      });
    };
    return {
      snap(current, off) {
        if (off) { draw([]); return current; }
        const dx = current.x - start.x;
        const dy = current.y - start.y;
        const hit = snapMove({ l: b0.l + dx, t: b0.t + dy, r: b0.r + dx, b: b0.b + dy }, targets, thr);
        draw(hit.guides);
        return hit.dx || hit.dy ? Object.assign({}, current, { x: current.x + hit.dx, y: current.y + hit.dy }) : current;
      },
      end() { if (layer) { layer.remove(); layer = null; } },
    };
  }

  // ---- Souris et clavier ---------------------------------------------------------------------------------------------------------------------------

  // Maj + clic dans un cadre alors qu'un cadre est déjà choisi : il entre dans la sélection ou en sort (le texte du cadre ne reçoit pas ce clic). Faux ailleurs : le clic suit son chemin.
  function onMouseDown(view, event) {
    const ed = EditorCore.getEditor();
    if (!api || !ed || !event.shiftKey || event.button !== 0 || !ed.isEditable) return false;
    if (!api.selectedFrame(view.state.selection)) return false;
    const target = event.target;
    const dom = target && target.closest ? target.closest('.' + api.CLASS) : null;
    if (!dom || !view.dom.contains(dom)) return false;
    const at = framePosOf(view, dom);
    if (at == null) return false;
    event.preventDefault();
    toggle(ed, at);
    return true;
  }
  // La position du cadre dont le DOM est `dom`, parmi les cadres du document.
  function framePosOf(view, dom) {
    let found = null;
    view.state.doc.descendants((node, pos) => {
      if (found != null) return false;
      if (api.isFrame(node)) { if (view.nodeDOM(pos) === dom) found = pos; return false; }
      return true;
    });
    return found;
  }
  // Les touches d'une sélection multiple (et Ctrl + A sur un cadre sélectionné) : vrai quand la touche est prise.
  function onKeyDown(view, event) {
    const ed = EditorCore.getEditor();
    if (!api || !ed || !ed.isEditable) return false;
    const many = count(view.state) >= 2;
    const lone = !many && api.selectedFrame(view.state.selection);
    const ctrl = event.ctrlKey || event.metaKey;
    if (ctrl && !event.altKey && !event.shiftKey && (event.key === 'a' || event.key === 'A') && (many || lone)) {
      if (selectAll(ed) || many) { event.preventDefault(); return true; }
      return false;
    }
    // Ctrl + G groupe, Ctrl + Maj + G dissocie (la touche du navigateur, « Suivant » de la recherche, n'est pas prise quand rien ne se groupe : elle garde son sens).
    if (ctrl && !event.altKey && (event.key === 'g' || event.key === 'G') && (many || lone)) {
      const list = selected(view.state);
      if (event.shiftKey ? !hasGroup(list) : !many) return false;
      event.preventDefault();
      if (event.shiftKey) ungroup(ed); else group(ed);
      return true;
    }
    if (!many) return false;
    if (ctrl && !event.altKey && !event.shiftKey && (event.key === 'd' || event.key === 'D')) { event.preventDefault(); duplicate(ed); return true; }
    if (ctrl || event.altKey) return false;
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); remove(ed); return true; }
    if (event.key === 'Escape') {
      if (hasGroup(selected(view.state))) return false;   // un groupe se choisit d'un bloc : Échap n'en laisse pas un morceau
      event.preventDefault(); collapse(ed); return true;
    }
    if (/^Arrow(Left|Right|Up|Down)$/.test(event.key)) {
      const step = event.shiftKey ? NUDGE_BIG_PT : NUDGE_PT;
      event.preventDefault();
      nudge(ed, event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0);
      return true;
    }
    return false;
  }

  // ---- Les barres ----------------------------------------------------------------------------------------------------------------------------------

  const barButton = (action, icon, nameKey) => '<button data-action="' + action + '" title="' + I18n.t(nameKey) + '" aria-label="' + I18n.t(nameKey) + '">' + Icons.svg(icon) + '</button>';
  // Le menu « Aligner » de la barre d'un cadre seul (aligne sur la diapositive) : les six réglages.
  const menuHtml = () => ALIGNS.map(([action, icon, nameKey]) => '<button type="button" role="menuitem" data-action="align:' + action + '">' + Icons.svg(icon) + '<span>' + I18n.t(nameKey) + '</span></button>').join('');
  function createAlignMenu(ed) {
    alignMenu = EditorCore.createFloatingPanel('v2-format-panel v2-frame-columns-menu v2-frame-align-menu', menuHtml(), (action) => {
      if (action.indexOf('align:') === 0) align(ed, action.slice(6));
      EditorCore.closeDropdownPanel();
    });
    alignMenu.el.setAttribute('role', 'menu');
    alignMenu.el.setAttribute('aria-label', I18n.t('frame.align'));
    return alignMenu;
  }
  // La barre « objets sélectionnés » : les six alignements, les deux répartitions, dupliquer, supprimer.
  function wireToolbar(ed) {
    const html = ALIGNS.map(([action, icon, nameKey]) => barButton(action, icon, nameKey)).join('')
      + '<span class="v2-floating-sep"></span>'
      + DISTRIBUTES.map(([action, icon, nameKey]) => barButton(action, icon, nameKey)).join('')
      + '<span class="v2-floating-sep"></span>'
      + barButton('group', 'groupObjects', 'multi.group')
      + barButton('ungroup', 'ungroupObjects', 'multi.ungroup')
      + '<span class="v2-floating-sep"></span>'
      + barButton('duplicate', 'duplicate', 'frame.duplicate')
      + '<span class="v2-floating-sep"></span>'
      + barButton('delete', 'trash', 'frame.delete');
    panel = EditorCore.createFloatingPanel('v2-floating-toolbar v2-multi-toolbar', html, (action) => {
      if (action === 'group') group(ed);
      else if (action === 'ungroup') ungroup(ed);
      else if (action === 'duplicate') duplicate(ed);
      else if (action === 'delete') remove(ed);
      else if (action === 'distribute-h') distribute(ed, 'h');
      else if (action === 'distribute-v') distribute(ed, 'v');
      else align(ed, action);
    });
    panel.el.setAttribute('role', 'toolbar');
    panel.el.setAttribute('aria-label', I18n.t('multi.label'));
    EditorCore.registerFloatingPanel(panel);
    const check = ({ transaction } = {}) => {
      if (transaction && transaction.getMeta('blur')) return;
      const list = ed.isEditable && api.inPresentation() ? selected(ed.state) : [];
      const primary = list.length >= 2 ? api.selectedFrame(ed.state.selection) : null;
      const dom = primary ? ed.view.nodeDOM(primary.pos) : null;
      const box = dom && dom.querySelector ? dom.querySelector('.' + api.BOX) : null;
      if (!box) { panel.hide(); return; }
      // « Répartir » demande trois objets : grisé avec sa raison, jamais retiré.
      DISTRIBUTES.forEach(([action, , nameKey]) => {
        const button = panel.el.querySelector('[data-action="' + action + '"]');
        if (!button) return;
        const off = list.length < 3;
        button.disabled = off;
        button.setAttribute('aria-disabled', off ? 'true' : 'false');
        button.title = I18n.t(off ? 'multi.distributeNeeds' : nameKey);
      });
      // « Grouper » demande des objets qui ne forment pas déjà UN groupe, « Dissocier » un groupe : grisés avec leur raison, jamais retirés.
      const ids = new Set(list.map(item => groupIdOf(item.node)));
      const states = [['group', ids.size === 1 && !ids.has(''), 'multi.group', 'multi.groupDone'], ['ungroup', !hasGroup(list), 'multi.ungroup', 'multi.ungroupNeeds']];
      states.forEach(([action, off, nameKey, reasonKey]) => {
        const button = panel.el.querySelector('[data-action="' + action + '"]');
        if (!button) return;
        button.disabled = off;
        button.setAttribute('aria-disabled', off ? 'true' : 'false');
        button.title = I18n.t(off ? reasonKey : nameKey);
      });
      panel.show(box, () => ({ offset: 8 + Math.ceil(api.rotateRoomPx() * EditorCore.layoutZoom(box)) }));
    };
    ed.on('selectionUpdate', check);
    ed.on('transaction', check);
    return check;
  }

  return { bind, hideBar, createPlugin, wireToolbar, createAlignMenu, menuHtml, boundsOf, alignDeltas, distributeDeltas, selected, count, toggle, selectAll, collapse, align, distribute, nudge, remove, duplicate, groupFor, commitMoves, onMouseDown, onKeyDown, snapMove, snapper, group, ungroup, closure, ALIGNS };
})();
