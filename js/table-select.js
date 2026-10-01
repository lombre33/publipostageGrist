// Sélectionner plusieurs cases d'un tableau en glissant la souris (demande d'Antoine, 01/10) : prosemirror-tables crée la sélection de cases tant que le bouton est appuyé,
// mais ne fait pas défiler le plan de travail. Dans un panneau Grist de ~700x400 une grille ou un tableau dépasse presque toujours, et le glissé s'arrêtait aux cases visibles
// (le défilement du navigateur ne se déclenche pas : le pointeur ne bouge plus, et aucun évènement de souris ne vient redonner à prosemirror-tables la case sous le pointeur).
// Ici : bouton appuyé pendant une sélection de cases, le pointeur près d'un bord du plan de travail (ou au-delà, même hors du panneau) le fait défiler, et la sélection suit la case
// qui arrive sous le bord. Tableau de document et grille, même code. Script classique, même convention de portée globale que GridEditor.
const TableSelect = (function () {
  const EDGE_PX = 32;     // bande, le long de chaque bord du plan de travail, où le défilement démarre (presque nul à son bord intérieur, maximal EDGE_PX au-delà du bord)
  const MAX_STEP_PX = 14; // pas maximal par image (60 images par seconde), atteint EDGE_PX au-delà du bord
  const CELL_NODES = new Set(['tableCell', 'tableHeader']);

  let editor = null;
  let drag = null; // { x, y, frame } tant que le bouton est appuyé dans une case

  // Dérive de prosemirror-tables (`tableEditingKey`) : la valeur du plugin est la position de la case où le glissé a commencé, null quand aucune sélection de cases n'est en cours.
  function dragAnchor() {
    const plugin = editor.state.plugins.find(p => p.key === 'selectingCells$');
    return plugin ? plugin.getState(editor.state) : null;
  }

  function cellAround($pos) {
    for (let d = $pos.depth; d > 0; d--) {
      if (CELL_NODES.has($pos.node(d).type.name)) return $pos.doc.resolve($pos.before(d));
    }
    return null;
  }

  function inSameTable($a, $b) { return $a.depth === $b.depth && $a.pos >= $b.start(-1) && $a.pos <= $b.end(-1); }

  // Le plan de travail et sa zone utile : sans ses barres de défilement ni, dans une grille, les bandeaux collés en haut et à gauche (une case dessous n'est pas visible).
  function workArea() {
    const box = document.getElementById('editor-container');
    if (!box) return null;
    const r = box.getBoundingClientRect();
    const corner = document.querySelector('.v2-grid-corner');
    const c = corner ? corner.getBoundingClientRect() : null;
    return {
      box,
      left: r.left + box.clientLeft + (c ? c.width : 0), top: r.top + box.clientTop + (c ? c.height : 0),
      right: r.left + box.clientLeft + box.clientWidth, bottom: r.top + box.clientTop + box.clientHeight,
    };
  }

  // Pas de défilement selon la position du pointeur : 0 dans la zone utile, de plus en plus grand vers le bord puis au-delà.
  function stepFor(p, low, high) {
    const speed = depth => Math.max(1, Math.round(MAX_STEP_PX * Math.min(1, depth / (2 * EDGE_PX))));
    if (p < low + EDGE_PX) return -speed(low + EDGE_PX - p);
    if (p > high - EDGE_PX) return speed(p - (high - EDGE_PX));
    return 0;
  }

  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));

  function tick() {
    if (!drag) return;
    drag.frame = 0;
    const anchorPos = dragAnchor();
    const area = workArea();
    if (anchorPos == null || !area) return;
    const dx = stepFor(drag.x, area.left, area.right);
    const dy = stepFor(drag.y, area.top, area.bottom);
    if (!dx && !dy) return;
    area.box.scrollLeft += dx;
    area.box.scrollTop += dy;
    // La case sous le bord (ramenée dans la zone utile : le pointeur peut être sur la barre d'outils, voire hors du panneau) rejoint la sélection.
    const hit = editor.view.posAtCoords({ left: clamp(drag.x, area.left + 2, area.right - 2), top: clamp(drag.y, area.top + 2, area.bottom - 2) });
    if (hit) {
      const sel = editor.state.selection;
      if (!sel.$anchorCell) return;
      const $head = cellAround(editor.state.doc.resolve(hit.pos));
      const $anchor = editor.state.doc.resolve(anchorPos);
      if ($head && inSameTable($anchor, $head)) {
        const next = new sel.constructor($anchor, $head);
        if (!next.eq(sel)) editor.view.dispatch(editor.state.tr.setSelection(next));
      }
    }
    drag.frame = requestAnimationFrame(tick);
  }

  function stop() {
    if (!drag) return;
    if (drag.frame) cancelAnimationFrame(drag.frame);
    drag = null;
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('mouseup', stop, true);
    document.removeEventListener('dragstart', stop, true);
    window.removeEventListener('blur', stop);
  }

  function onMove(event) {
    if (!drag) return;
    // Le bouton a été relâché hors de la page : plus de glissé.
    if (event.buttons === 0) { stop(); return; }
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (!drag.frame) drag.frame = requestAnimationFrame(tick);
  }

  function onDown(event) {
    if (event.button !== 0 || !editor || drag || !event.target.closest) return;
    const cell = event.target.closest('td, th');
    if (!cell || !editor.view.dom.contains(cell)) return;
    drag = { x: event.clientX, y: event.clientY, frame: 0 };
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('mouseup', stop, true);
    document.addEventListener('dragstart', stop, true);
    window.addEventListener('blur', stop);
  }

  function attach(ed) {
    editor = ed;
    document.addEventListener('mousedown', onDown, true);
  }

  return { attach };
})();
