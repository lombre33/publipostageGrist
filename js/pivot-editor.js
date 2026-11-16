// Le tableau croisé de la grille, côté éditeur : la ligne qui le porte, son repère et son aperçu, et ce qui la pose ou la retire.
//
// Une LIGNE de la grille porte le tableau croisé (attribut `pivot` de la ligne, écrit `data-pivot` : js/grid-editor.js:withRowAttributes, lu à la Lecture et à l'export par js/pivot-zones.js). Ici, dans l'éditeur, cette ligne
// reste une vraie ligne de la grille (ses cases, ses hauteurs, son numéro de ligne) mais elle se montre comme son tableau : une décoration de l'éditeur seulement (rien n'en reste dans le document, ni dans le HTML du
// modèle) pose un cadre sur toute la largeur de la ligne - l'étiquette « Tableau croisé : Catégorie × Zone · Somme de Stock », le bouton « Modifier » et le début du tableau calculé sur la ligne de la page -, et la ligne
// prend la hauteur de ce cadre (css/pivot.css). Aucune ligne de plus dans le DOM : les bandeaux de la grille (numéros de ligne) se calent sur les vraies lignes et resteraient décalés.
// Le texte des cases de cette ligne n'est jamais lu : la saisie y est refusée (rien ne s'écrirait que personne ne verrait).
//
// Poser, modifier, retirer : `apply` écrit l'attribut en UNE transaction, donc en un seul pas d'Annuler. Sur une ligne vide, le tableau croisé prend cette ligne ; sur une ligne qui a du contenu, il prend une ligne neuve
// posée juste après (le contenu n'est jamais écrasé). La barre du tableau (js/floating-toolbars.js) lit `status` : le bouton, grisé avec sa raison, jamais retiré ; la fenêtre de réglage est js/pivot-window.js.
const PivotEditor = (function () {
  const { el, button } = Dom;
  const ATTR = 'pivot';
  const ROW_CLASS = 'pp-pivot-row';
  const REFRESH = 'ppPivotRefresh';
  // Ce que l'aperçu montre du tableau : l'en-tête, les premières rangées et la ligne des totaux ; la suite se dit en une ligne.
  const PREVIEW_ROWS = 2;
  const PREVIEW_COLUMNS = 8;
  // Le délai qui regroupe les changements de ligne de Grist avant de redessiner les aperçus.
  const REFRESH_DELAY_MS = 300;

  let libs = null;
  let hostEditor = null;
  let revision = 0;
  let watching = false;

  // === La ligne dans le document ===

  function rowDepth($pos) {
    for (let depth = $pos.depth; depth > 0; depth--) if ($pos.node(depth).type.name === 'tableRow') return depth;
    return -1;
  }
  // La position de la ligne que vise la sélection, ou null quand elle en touche plusieurs ou aucune.
  function selectedRowStart(state) {
    const starts = [];
    state.selection.ranges.forEach(range => [range.$from, range.$to].forEach(($pos) => {
      const depth = rowDepth($pos);
      const start = depth === -1 ? -1 : $pos.before(depth);
      if (starts.indexOf(start) === -1) starts.push(start);
    }));
    return starts.length === 1 && starts[0] !== -1 ? starts[0] : null;
  }
  // Les lignes du document qui portent un tableau croisé, dans l'ordre : [{ pos, node }]. On ne descend que dans les tableaux : le coût suit le nombre de lignes, pas celui des paragraphes.
  function pivotRows(doc) {
    const found = [];
    doc.descendants((node, pos) => {
      const name = node.type.name;
      if (name === 'tableRow') {
        if (node.attrs[ATTR]) found.push({ pos, node });
        return false;
      }
      return name === 'table';
    });
    return found;
  }
  // La ligne est-elle vide : que des cases sans texte ni objet (une image, une bulle). Un retour à la ligne seul ne compte pas.
  function isBlank(row) {
    let blank = true;
    row.descendants((node) => {
      if (!blank) return false;
      if (node.isText) { if (node.text.trim()) blank = false; } else if (node.isLeaf && node.type.name !== 'hardBreak') blank = false;
      return blank;
    });
    return blank;
  }

  // La définition de la ligne à `pos` (js/pivot.js:normalize), ou null quand la ligne n'en porte pas ou qu'elle ne se lit pas.
  function defAt(state, pos) {
    const node = state.doc.nodeAt(pos);
    return node && node.type.name === 'tableRow' && node.attrs[ATTR] ? PivotZones.defOf(node.attrs[ATTR]) : null;
  }
  // Le texte enregistré d'une définition, ou null quand elle ne tient pas.
  function serialize(def) {
    const normal = Pivot.normalize(def);
    return normal ? JSON.stringify(normal) : null;
  }

  // === Le bouton de la barre du tableau ===

  // Ce que fait « Tableau croisé… » pour la sélection : { enabled, active, title, pos } - `pos` : la ligne visée. Allumé quand la ligne porte déjà un tableau croisé (le bouton la modifie). Grisé, avec sa raison en
  // info-bulle : dans un tableau de document (la grille seule le porte pour l'instant), plusieurs lignes sélectionnées, une case fusionnée qui traverse la ligne. Jamais retiré.
  function status(editor) {
    const grey = key => ({ enabled: false, active: false, title: I18n.t(key), pos: null, reason: key });
    if (!GridEditor.isActive()) return grey('table.pivotDocument');
    const state = editor.state;
    const start = selectedRowStart(state);
    if (start == null) return grey('table.pivotOne');
    const row = state.doc.nodeAt(start);
    if (row.attrs[ATTR]) return { enabled: true, active: true, title: I18n.t('table.pivotOn'), pos: start };
    const $row = state.doc.resolve(start);
    if (TableMerge.rowCrossedByMerge($row.parent, $row.index())) return grey('table.pivotMerged');
    return { enabled: true, active: false, title: I18n.t('table.pivot'), pos: start };
  }

  // === Poser, modifier, retirer ===

  // Une ligne vide de même forme que `row` (ses cases, leurs largeurs), qui porte `raw`.
  function blankRowLike(row, raw) {
    const cells = [];
    row.forEach(cell => cells.push(cell.type.createAndFill({
      colspan: cell.attrs.colspan, rowspan: 1, colwidth: cell.attrs.colwidth, verticalAlign: cell.attrs.verticalAlign,
    })));
    return row.type.create({ [ATTR]: raw }, cells);
  }
  // Écrit le tableau croisé `def` sur la ligne à `rowPos` (ou le retire quand `def` est null), en une seule transaction. Rend vrai quand quelque chose a été écrit ; faux sans rien changer (définition qui ne tient pas,
  // ligne qui a bougé, rien à retirer).
  function apply(editor, rowPos, def) {
    const state = editor.state;
    const row = state.doc.nodeAt(rowPos);
    if (!row || row.type.name !== 'tableRow') return false;
    const tr = state.tr;
    if (!def) {
      if (!row.attrs[ATTR]) return false;
      tr.setNodeAttribute(rowPos, ATTR, null);
    } else {
      const raw = serialize(def);
      if (!raw) return false;
      if (row.attrs[ATTR] || isBlank(row)) tr.setNodeAttribute(rowPos, ATTR, raw);
      else tr.insert(rowPos + row.nodeSize, blankRowLike(row, raw));
    }
    editor.view.dispatch(tr);
    return true;
  }

  // === L'aperçu ===

  // Écrit dans `host` le début du tableau calculé (`built` : le résultat de PivotZones.compute) : la ligne d'en-tête, `limits.rows` rangées, la ligne des totaux, et une ligne qui dit le reste. Le texte des cases est posé
  // en texte, jamais en balisage (ce sont des valeurs de Grist). Un tableau qui ne se lit pas est dit en une ligne, comme à la Lecture.
  function drawTable(host, built, limits) {
    host.textContent = '';
    const say = (text, className) => host.appendChild(el('div', 'pp-pivot-note' + (className ? ' ' + className : ''), text));
    if (built.error) { say(PivotZones.errorLine(built.error), 'is-error'); return; }
    if (!built.result.rows.length) { say(PivotZones.errorLine(I18n.t('pivot.error.noRows')), 'is-error'); return; }
    const laid = PivotZones.layout(built.result, built.def);
    const body = laid.rows.filter(row => row.kind === 'body');
    const total = laid.rows.find(row => row.kind === 'total');
    const shown = [laid.rows[0]].concat(body.slice(0, limits.rows));
    if (total) shown.push(total);
    const cut = laid.width > limits.columns;
    const table = el('table', 'pp-pivot-mini');
    shown.forEach((row) => {
      const tr = el('tr', 'is-' + row.kind);
      const cells = cut ? row.cells.slice(0, limits.columns - 1).concat([{ text: '…' }]) : row.cells;
      cells.forEach((cell) => {
        const td = el(row.kind === 'head' ? 'th' : 'td', null, cell.text);
        if (cell.right) td.classList.add('is-num');
        if (cell.bold) td.classList.add('is-bold');
        if (cell.error) td.classList.add('is-error');
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
    host.appendChild(table);
    if (body.length > limits.rows) say(I18n.t('pivot.zone.more', { count: body.length - limits.rows }));
  }

  // Le calcul d'un aperçu pour la ligne de la page, écrit dans `host` : « Choisir une ligne de Grist » quand la page n'en montre aucune.
  async function fillPreview(host, raw, limits) {
    const tableId = GristAPI.getCurrentTableId();
    const record = GristAPI.getCurrentRecord();
    if (!tableId || !record) { host.textContent = I18n.t('pivot.zone.noRow'); return; }
    let built;
    try { built = await PivotZones.compute(raw, tableId, record); } catch (e) {
      console.warn('[PivotEditor] aperçu du tableau croisé', e);
      built = { error: I18n.t('pivot.error.cell') };
    }
    drawTable(host, built, limits);
  }

  // Le cadre prend la largeur du tableau (et la suit quand les colonnes changent) : il est posé dans la première case de la ligne, il doit couvrir les autres.
  function followTable(root) {
    requestAnimationFrame(() => {
      const table = root.closest('table');
      if (!table) return;
      const size = () => { root.style.width = table.offsetWidth + 'px'; };
      size();
      if (typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(size);
      observer.observe(table);
      root.ppObserver = observer;
    });
  }

  function openFrom(view, pos) {
    const $pos = view.state.doc.resolve(pos);
    const depth = rowDepth($pos);
    if (depth !== -1 && hostEditor) PivotWindow.open(hostEditor, $pos.before(depth));
  }

  // Le cadre d'une ligne : l'étiquette, le bouton « Modifier » et l'aperçu.
  function previewFor(raw) {
    return (view, getPos) => {
      const def = PivotZones.defOf(raw);
      const name = def ? PivotZones.describe(def) : '';
      const root = el('div', 'pp-pivot-preview');
      root.contentEditable = 'false';
      root.setAttribute('role', 'group');
      root.setAttribute('aria-label', I18n.t('pivot.zone.aria', { name: name || I18n.t('pivot.zone.unset') }));
      const titleBar = el('div', 'pp-pivot-bar');
      const icon = el('span', 'pp-pivot-icon');
      Dom.setMarkup(icon, Icons.svg('pivot'));
      const title = el('span', 'pp-pivot-title', I18n.t('pivot.zone.tag', { name: name || I18n.t('pivot.zone.unset') }));
      const edit = button('pp-pivot-edit', I18n.t('pivot.zone.edit'));
      edit.title = I18n.t('pivot.zone.editTitle');
      // Le clic ne déplace pas le curseur de l'éditeur : la fenêtre s'ouvre sur la ligne, la sélection reste où elle est.
      edit.addEventListener('mousedown', event => event.preventDefault());
      edit.addEventListener('click', () => openFrom(view, getPos()));
      titleBar.append(icon, title, edit);
      const body = el('div', 'pp-pivot-body', I18n.t('pivot.zone.loading'));
      root.append(titleBar, body);
      fillPreview(body, raw, { rows: PREVIEW_ROWS, columns: PREVIEW_COLUMNS });
      followTable(root);
      return root;
    };
  }
  const forgetPreview = (root) => { if (root && root.ppObserver) root.ppObserver.disconnect(); };

  // Les décorations : la classe de chaque ligne de tableau croisé et son cadre. La clé du cadre dit la définition, le rang de la ligne et la « révision » (un changement de ligne de Grist) : il est redessiné quand l'une d'elles
  // change, jamais quand la ligne ne fait que se déplacer (un texte tapé plus haut).
  function build(doc) {
    if (!GridEditor.isActive()) return { on: false, set: null };
    const rows = pivotRows(doc);
    if (!rows.length) return { on: true, set: null };
    const { Decoration, DecorationSet } = libs;
    const decorations = [];
    rows.forEach(({ pos, node }, index) => {
      const raw = node.attrs[ATTR];
      decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: ROW_CLASS }));
      decorations.push(Decoration.widget(pos + 2, previewFor(raw), {
        side: -1, key: 'pivot:' + index + ':' + revision + ':' + raw, stopEvent: () => true, ignoreSelection: true, destroy: forgetPreview,
      }));
    });
    return { on: true, set: DecorationSet.create(doc, decorations) };
  }

  // La ligne de la page change (ou ses valeurs) : les aperçus se recalculent, une fois quand les changements s'enchaînent.
  function watchRecords() {
    if (watching) return;
    watching = true;
    let timer = null;
    GristAPI.onRecord(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const editor = hostEditor;
        if (!editor || editor.isDestroyed || !GridEditor.isActive() || !pivotRows(editor.state.doc).length) return;
        revision += 1;
        editor.view.dispatch(editor.state.tr.setMeta(REFRESH, true).setMeta('addToHistory', false).setMeta('preventUpdate', true));
      }, REFRESH_DELAY_MS);
    });
  }

  // La saisie dans une ligne de tableau croisé : refusée, son texte n'est jamais lu.
  function insideRow(state) {
    const start = selectedRowStart(state);
    return start != null && !!state.doc.nodeAt(start).attrs[ATTR];
  }

  function createExtension(Extension, deps) {
    libs = deps;
    const { Plugin, PluginKey } = deps;
    return Extension.create({
      name: 'pivotRows',
      addProseMirrorPlugins() {
        hostEditor = this.editor;
        watchRecords();
        const key = new PluginKey('pivotRows');
        return [new Plugin({
          key,
          state: {
            init: (config, state) => build(state.doc),
            apply: (tr, old, oldState, newState) => (tr.docChanged || tr.getMeta(REFRESH) || old.on !== GridEditor.isActive() ? build(newState.doc) : old),
          },
          props: {
            decorations(state) { const found = key.getState(state); return found && found.on ? found.set : null; },
            handleTextInput(view) { return GridEditor.isActive() && insideRow(view.state); },
          },
        })];
      },
    });
  }

  return { ATTR, createExtension, status, apply, defAt, serialize, drawTable, fillPreview, isBlank, pivotRows };
})();
