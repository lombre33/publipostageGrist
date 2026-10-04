// Sélectionner plusieurs cases d'un tableau en glissant la souris : prosemirror-tables crée la sélection de cases tant que le bouton est appuyé, mais
// ne fait pas défiler le plan de travail. Dans un panneau Grist de ~700x400 une grille ou un tableau dépasse presque toujours, et le glissé
// s'arrêterait aux cases visibles (le défilement du navigateur ne se déclenche pas : le pointeur ne bouge plus, et aucun évènement de souris ne
// redonne à prosemirror-tables la case sous le pointeur). Ici : bouton appuyé pendant une sélection de cases, le pointeur près d'un bord du plan de
// travail (ou au-delà, même hors du panneau) le fait défiler, et la sélection suit la case qui arrive sous le bord. Tableau de document et grille,
// même code. Script classique, même convention de portée globale que GridEditor.
const TableSelect = (function () {
  // bande, le long de chaque bord du plan de travail, où le défilement démarre (presque nul à son bord intérieur, maximal EDGE_PX au-delà du bord)
  const EDGE_PX = 32;
  const MAX_STEP_PX = 14; // pas maximal par image (60 images par seconde), atteint EDGE_PX au-delà du bord
  const CELL_NODES = new Set(['tableCell', 'tableHeader']);

  let editor = null;
  let drag = null; // { x, y, frame } tant que le bouton est appuyé dans une case

  // Dérive de prosemirror-tables (`tableEditingKey`) : la valeur du plugin est la position de la case où le glissé a commencé, null quand aucune
  // sélection de cases n'est en cours.
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

  // Le plan de travail et sa zone utile : sans ses barres de défilement ni, dans une grille, les bandeaux collés en haut et à gauche (une case
  // dessous n'est pas visible).
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

  // Texte brut d'une sélection de cases copiée ou coupée : une ligne par ligne du tableau, les cases séparées par une tabulation, ce que lisent
  // Grist, un tableur ou un éditeur de texte. Celui de ProseMirror par défaut sépare tous les blocs par une ligne vide, et chaque case tomberait sur
  // sa propre ligne entre deux lignes vides. Une case de plusieurs lignes, ou qui porte une tabulation ou un guillemet, est mise entre guillemets,
  // comme le font les tableurs. Autre chose que des lignes de tableau (celles d'une sélection de cases, ou le tableau entier) : null, le texte par
  // défaut.
  function clipboardText(slice) {
    const content = slice && slice.content;
    const first = content && content.firstChild;
    if (!first) return null;
    const rows = first.type.spec.tableRole === 'row' ? content : (content.childCount === 1 && first.type.spec.tableRole === 'table' ? first.content : null);
    if (!rows) return null;
    const field = text => (/[\t\n\r"]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text);
    // Un nœud sans texte propre (le retour à la ligne forcé) donne celui que son extension déclare (`renderText`, devenu `spec.toText`), comme le
    // texte par défaut de TipTap.
    const leafText = node => (node.type.spec.toText ? node.type.spec.toText({ node }) : '');
    const lines = [];
    rows.forEach(row => {
      const fields = [];
      row.forEach(cell => {
        fields.push(field(cell.textBetween(0, cell.content.size, '\n', leafText)));
        for (let i = 1; i < (cell.attrs.colspan || 1); i++) fields.push('');
      });
      lines.push(fields.join('\t'));
    });
    return lines.join('\n');
  }

  return { attach, clipboardText };
})();
