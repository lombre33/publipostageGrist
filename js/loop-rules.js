// Boucle sur les lignes liées d'une bulle #Variable : le moteur, sans fenêtre (la fenêtre est dans js/variable-loop.js). Lignes parcourues, filtre,
// tri, déroulé de la zone répétée en Lecture et à l'export (js/reader-mode.js, point d'entrée commun du mode Lecture, du PDF, du Word et de l'export
// en lot). Aucune dépendance à l'éditeur.
//
// La boucle vit dans l'attribut `loop` du nœud varBadge (js/editor-nodes.js, sérialisé en data-loop), comme la condition d'affichage :
//   { repeat: 'inline'|'row'|'item'|'paragraph', table, via: null|{ table, column }, filter: null|{ mode, rules }, sort: { column, direction },
//     empty, emptyText, separator, lastSeparator }
// - `table` : la table dont les lignes sont parcourues. `via` : une colonne Liste de références de la table de la page (les fiches qu'elle référence,
//   dans l'ordre de la cellule) ; sans `via`, les lignes de `table` trouvées par la règle de liaison du document (Variables.resolveLinkedRows, la
//   même que celle qui affiche aujourd'hui toutes les valeurs jointes par des virgules).
// - `repeat` : ce qui se répète autour de la bulle - la ligne du tableau (<tr>), l'élément de liste (<li>), le paragraphe ou le titre qui la
//   contient, ou la bulle seule, dans la phrase ('inline' : ses valeurs jointes par `separator`, et `lastSeparator` avant la dernière). Une zone n'a
//   qu'une boucle, celle de sa première bulle qui en porte une ; les autres bulles de `table` placées dans la zone suivent la même ligne à chaque
//   tour.
// - Portée sur la bulle plutôt que sur la zone : supprimer ou déplacer la bulle emporte sa boucle, jamais une zone répétée qu'aucune bulle ne
//   permettrait plus d'ouvrir. Une bulle déplacée hors de sa zone (hors du tableau, de la liste) redevient une bulle ordinaire, en édition comme en
//   lecture.
// Dans chaque copie de la zone, chaque bulle (et chaque image liée à une variable) est associée à la ligne du tour (bindingOf) :
// js/variables.js:resolveRawValue lit alors la valeur dans cette ligne (opts.loop) au lieu de chercher les lignes liées - valeur, format, condition
// et images compris.
const LoopRules = (function () {
  const REPEATS = ['inline', 'row', 'item', 'paragraph'];
  // Choix « Si aucune ligne » proposés pour chaque zone, le premier étant celui par défaut (sauf 'inline' dans une cellule de tableau, cf.
  // defaultEmpty).
  const EMPTY_MODES = { row: ['header', 'text'], item: ['none', 'text'], paragraph: ['hide', 'text', 'blank'], inline: ['hide', 'text', 'blank'] };
  const TEXT_BLOCK_SELECTOR = 'p, h1, h2, h3, h4, h5, h6';

  function defaultEmpty(repeat, inTableCell) {
    if (repeat === 'inline' && inTableCell) return 'blank';
    return EMPTY_MODES[repeat][0];
  }

  // Forme sûre d'une boucle lue dans le document (attribut du nœud ou data-loop) ; null si illisible ou sans table.
  function normalizeLoop(raw) {
    if (!raw || typeof raw !== 'object' || !raw.table) return null;
    const repeat = REPEATS.indexOf(raw.repeat) !== -1 ? raw.repeat : 'inline';
    const via = raw.via && raw.via.table && raw.via.column ? { table: String(raw.via.table), column: String(raw.via.column) } : null;
    const sortRaw = raw.sort || {};
    const sort = { column: sortRaw.column ? String(sortRaw.column) : '', direction: sortRaw.direction === 'desc' ? 'desc' : 'asc' };
    // Choix absent ou inconnu (document modifié à la main) : 'blank' pour une bulle seule, le choix par défaut de la zone sinon - jamais un
    // paragraphe masqué que personne n'a demandé.
    const empty = EMPTY_MODES[repeat].indexOf(raw.empty) !== -1 ? raw.empty : defaultEmpty(repeat, repeat === 'inline');
    return {
      repeat, table: String(raw.table), via, filter: ConditionRules.normalizeCondition(raw.filter), sort, empty,
      emptyText: raw.emptyText == null ? '' : String(raw.emptyText),
      separator: typeof raw.separator === 'string' ? raw.separator : ', ',
      lastSeparator: typeof raw.lastSeparator === 'string' ? raw.lastSeparator : null,
    };
  }
  function parseLoop(json) {
    if (!json) return null;
    try { return normalizeLoop(JSON.parse(json)); } catch (e) { return null; }
  }

  // Ce qu'une bulle peut parcourir : une variable d'une autre table liée par une règle « match » qui peut trouver plusieurs lignes (la colonne
  // comparée côté table liée n'est pas son identifiant de ligne, ex. Lignes.Facture = identifiant de la facture), ou une colonne Liste de références
  // de la table de la page (ex. Factures.Formateurs). Null sinon - colonne ordinaire de la page, ligne unique, table pas liée : la Boucle est grisée.
  function sourceFor(attrs, currentTableId) {
    if (!attrs || !attrs.table || !currentTableId) return null;
    if (attrs.table === currentTableId) {
      // Colonne en chemin (#Projet.Accompagnateur.Membres, GristAPI.resolveColumnPath) : la boucle lit sa liste dans la ligne courante sous le nom
      // d'une seule colonne, pas d'un chemin - grisée.
      if (String(attrs.column).indexOf('.') !== -1) return null;
      const ref = GristAPI.referenceOf(GristAPI.getColumnType(attrs.table, attrs.column));
      if (!ref || !ref.list) return null;
      // Une liste de références vers la table de la page elle-même lierait aussi toutes les autres variables de la page à la fiche du tour : écartée.
      return ref.table !== currentTableId ? { table: ref.table, via: { table: currentTableId, column: attrs.column } } : null;
    }
    const rule = GristAPI.getLinkRule(attrs.table);
    if (!rule || rule.mode !== 'match' || rule.colonneCible === 'id') return null;
    return { table: attrs.table, via: null };
  }
  // Lecture mémorisée des tables, pour un rendu (plusieurs boucles sur la même table) ou un aperçu sur toutes les lignes de la page.
  function memoFetchRows() {
    const cache = new Map();
    return tableId => {
      if (!cache.has(tableId)) cache.set(tableId, GristAPI.fetchTableRows(tableId));
      return cache.get(tableId);
    };
  }
  function createContext() { return { fetchRows: memoFetchRows() }; }

  function listValues(value) {
    if (value === null || value === undefined || value === '') return [];
    if (Array.isArray(value)) return value[0] === 'L' ? value.slice(1) : value.slice();
    return [value];
  }
  // Ordre des lignes de la table dans Grist (manualSort, celui de la vue des données brutes), à défaut l'identifiant de ligne.
  function tableOrder(rows) {
    const rank = r => (typeof r.manualSort === 'number' ? r.manualSort : r.id);
    return rows.slice().sort((a, b) => (rank(a) - rank(b)) || (a.id - b.id));
  }

  // Lignes parcourues pour la ligne courante, avant filtre et tri : [{ row, anchor }] - `anchor` est la valeur affichée de la fiche dans la colonne
  // Liste de références (`via`), celle que la bulle de cette colonne montre à chaque tour.
  async function linkedItems(loop, tableId, record, fetchRows) {
    if (loop.via) {
      if (loop.via.table !== tableId) return { error: 'via' };
      // La ligne de grist.onRecord livre les valeurs affichées de la liste, pas les identifiants : relue sous sa forme brute, comme l'export en lot
      // la reçoit.
      let pageRow = GristAPI.isRawRow(record) ? record : null;
      if (!pageRow && record.id != null) pageRow = (await fetchRows(tableId)).find(r => r.id === record.id) || null;
      if (!pageRow) return { items: [] };
      const ids = listValues(pageRow[loop.via.column]);
      if (!ids.length) return { items: [] };
      const displayCol = GristAPI.getDisplayColumn(tableId, loop.via.column);
      const displays = displayCol ? listValues(pageRow[displayCol]) : null;
      const byId = new Map((await fetchRows(loop.table)).map(r => [r.id, r]));
      const items = [];
      ids.forEach((id, i) => {
        const row = byId.get(id);
        if (row) items.push({ row, anchor: displays && i < displays.length ? displays[i] : id });
      });
      return { items };
    }
    const rule = GristAPI.getLinkRule(loop.table);
    if (!rule) return { error: 'noLink' };
    const rows = await Variables.resolveLinkedRows(loop.table, rule, record, tableId, { fetchRows });
    return { items: tableOrder(rows).map(row => ({ row, anchor: undefined })) };
  }

  // Une règle du filtre porte sur une colonne de la table parcourue (nom nu), comparée à la valeur telle que Grist l'affiche (Variables.cellValue :
  // une Référence vaut sa valeur affichée, une date ses secondes, que ConditionRules.compareValues sait lire). Liste (choix multiples, liste de
  // références) : « = » et « contient » sont remplis par un seul élément, « ≠ » par aucun, « vide » par une liste vide.
  function ruleHolds(rule, loop, row) {
    const ref = ConditionRules.parseColumnRef(rule.column, loop.table);
    if (ref.table !== loop.table) return false;
    const type = GristAPI.getColumnType(loop.table, ref.column);
    const actual = Variables.cellValue(loop.table, ref.column, row);
    if (Array.isArray(actual)) {
      if (rule.operator === 'vide') return !actual.length;
      if (rule.operator === 'non vide') return actual.length > 0;
      if (rule.operator === '≠') return !actual.some(v => ConditionRules.compareValues(v, '=', rule.value, type));
      return actual.some(v => ConditionRules.compareValues(v, rule.operator, rule.value, type));
    }
    return ConditionRules.compareValues(actual, rule.operator, rule.value, type);
  }
  function filterHolds(loop, row) {
    const filter = loop.filter;
    if (!filter) return true;
    const holds = rule => ruleHolds(rule, loop, row);
    return filter.mode === 'any' ? filter.rules.some(holds) : filter.rules.every(holds);
  }

  function sortKey(value) {
    if (value === null || value === undefined || value === '') return null;
    if (Array.isArray(value)) return value.length ? value.join(', ') : null;
    return value;
  }
  function compareKeys(a, b) {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    if (typeof a === 'boolean' && typeof b === 'boolean') return a === b ? 0 : (a ? 1 : -1);
    return String(a).localeCompare(String(b), I18n.getLang() === 'en' ? 'en' : 'fr', { numeric: true, sensitivity: 'base' });
  }
  // Tri stable ; les cellules vides finissent toujours en bas, quel que soit le sens.
  function sortItems(loop, items) {
    const desc = loop.sort.direction === 'desc';
    if (!loop.sort.column) return desc ? items.slice().reverse() : items;
    const column = loop.sort.column;
    const keyed = items.map((item, index) => ({ item, index, key: sortKey(Variables.cellValue(loop.table, column, item.row)) }));
    keyed.sort((x, y) => {
      if (x.key === null || y.key === null) return (x.key === null) - (y.key === null) || x.index - y.index;
      const c = compareKeys(x.key, y.key);
      return (desc ? -c : c) || x.index - y.index;
    });
    return keyed.map(k => k.item);
  }

  // Lignes retenues pour une ligne de la table de la page : { items, total } (total = lignes liées avant le filtre), ou { error } - 'noLink' (table
  // plus liée) ou 'via' (modèle utilisé sur une autre table que celle de sa colonne Liste de références). `record` : ligne de grist.onRecord ou de
  // fetchTable.
  async function iterate(loop, tableId, record, ctx) {
    if (!loop || !record || !tableId) return { items: [], total: 0 };
    const fetchRows = (ctx && ctx.fetchRows) || memoFetchRows();
    const found = await linkedItems(loop, tableId, record, fetchRows);
    if (found.error) return { error: found.error, items: [], total: 0 };
    const kept = loop.filter ? found.items.filter(item => filterHolds(loop, item.row)) : found.items;
    return { items: sortItems(loop, kept), total: found.items.length };
  }

  const bindings = new WeakMap();
  // Tout ce qui lit la ligne du tour dans une zone copiée : les bulles #Variable, les images liées à une variable, les bulles « Calcul » (« Prix ×
  // Quantité » dans une ligne répétée donne le total de cette ligne), les QR codes (le texte de leurs colonnes) et les blocs, valeurs et cases
  // conditionnels (leur condition).
  const BOUND_SELECTOR = '.var-badge, .calc-badge, img.editor-image[data-var-table], img.editor-image[data-qr-text], .conditional-text, .conditional-value, .conditional-checkbox';
  function bindingOf(el) { return (el && bindings.get(el)) || null; }
  // Ligne du tour ajoutée à ce qu'un élément tient déjà d'une zone englobante (une zone répétée dans une autre, copiée-collée : chacune garde sa
  // table).
  function itemBinding(loop, item, inherited) {
    const next = { rows: Object.assign({}, inherited && inherited.rows), anchors: Object.assign({}, inherited && inherited.anchors) };
    next.rows[loop.table] = item.row;
    if (loop.via) next.anchors[loop.via.table + '.' + loop.via.column] = item.anchor;
    return next;
  }
  function bindClone(source, clone, loop, item) {
    const src = source.querySelectorAll(BOUND_SELECTOR);
    clone.querySelectorAll(BOUND_SELECTOR).forEach((el, i) => bindings.set(el, itemBinding(loop, item, src[i] ? bindings.get(src[i]) : null)));
  }

  function zoneOf(badge, repeat, root) {
    let zone = null;
    if (repeat === 'row') zone = badge.closest('tr');
    else if (repeat === 'item') zone = badge.closest('li');
    else if (repeat === 'paragraph') zone = badge.closest(TEXT_BLOCK_SELECTOR);
    return zone && zone !== root && root.contains(zone) ? zone : null;
  }
  // Première bulle (ordre du document) qui porte encore une boucle de zone ; une boucle illisible est retirée (la bulle redevient ordinaire).
  function nextZoneOwner(root) {
    for (const badge of root.querySelectorAll('.var-badge[data-loop]')) {
      const loop = parseLoop(badge.getAttribute('data-loop'));
      if (!loop) { badge.removeAttribute('data-loop'); continue; }
      if (loop.repeat !== 'inline') return { badge, loop };
    }
    return null;
  }
  // Ce que chaque conteneur doit encore avoir pour rester : un <ul> ou un <table> sans ligne ne s'affiche pas et n'a rien à exporter ; un encadré
  // (js/callout.js) sans contenu se verrait encore : sa barre et son fond.
  const EMPTY_CONTAINERS = [
    ['ul, ol', node => !node.querySelector(':scope > li')],
    ['tbody, thead, tfoot', node => !node.querySelector(':scope > tr')],
    ['table', node => !node.querySelector('tr')],
    ['li, .callout', node => !node.children.length && !node.textContent.trim()],
  ];
  // Retire un élément, puis, de proche en proche, la liste, le tableau ou l'encadré qu'il laisse vide.
  function removeAndPrune(el) {
    let parent = el.parentElement;
    el.remove();
    while (parent && EMPTY_CONTAINERS.some(([selector, isEmpty]) => parent.matches(selector) && isEmpty(parent))) {
      const next = parent.parentElement;
      parent.remove();
      parent = next;
    }
  }
  function textParagraph(text) {
    const p = document.createElement('p');
    p.textContent = text;
    return p;
  }
  function applyEmptyZone(zone, loop) {
    if (loop.repeat === 'row') {
      if (loop.empty !== 'text') { removeAndPrune(zone); return; }
      // « Une ligne de texte » : une seule cellule sur toute la largeur de la ligne (colspan lu par les exports PDF et DOCX).
      const cells = Array.from(zone.children).filter(c => c.matches('td, th'));
      const span = cells.reduce((n, c) => n + (parseInt(c.getAttribute('colspan'), 10) || 1), 0) || 1;
      const td = document.createElement('td');
      td.setAttribute('colspan', String(span));
      td.appendChild(textParagraph(loop.emptyText));
      zone.replaceChildren(td);
      return;
    }
    if (loop.repeat === 'item') {
      if (loop.empty !== 'text') { removeAndPrune(zone); return; }
      zone.replaceChildren(textParagraph(loop.emptyText));
      return;
    }
    if (loop.empty === 'hide') { removeAndPrune(zone); return; }
    zone.textContent = loop.empty === 'text' ? loop.emptyText : '';
  }

  // Déroule chaque zone répétée de `root` (HTML déjà assaini, pas encore résolu) : une copie par ligne retenue, associée à cette ligne ; « si aucune
  // ligne » sinon. Une boucle qui ne trouve plus sa source (table plus liée) laisse la zone telle quelle : ses bulles affichent alors toutes les
  // valeurs, jointes par des virgules, comme avant la boucle. Les boucles « dans la phrase » restent sur leur bulle (resolveInline, appelée par
  // js/reader-mode.js).
  async function expandZones(root, tableId, record, ctx) {
    if (!root || !record || !tableId) return;
    const context = ctx || createContext();
    let owner;
    let guard = 0;
    while ((owner = nextZoneOwner(root)) && guard < 1000) {
      guard += 1;
      const { badge, loop } = owner;
      const zone = zoneOf(badge, loop.repeat, root);
      if (!zone) { badge.removeAttribute('data-loop'); continue; }
      // Une seule boucle par zone : celle-ci. Une autre bulle de la même zone qui en porte une (copiée-collée) redevient une bulle ordinaire.
      zone.querySelectorAll('.var-badge[data-loop]').forEach(b => {
        const other = parseLoop(b.getAttribute('data-loop'));
        if (other && other.repeat === loop.repeat && zoneOf(b, other.repeat, root) === zone) b.removeAttribute('data-loop');
      });
      let result;
      try { result = await iterate(loop, tableId, record, context); }
      catch (e) { console.error('[LoopRules] échec du calcul des lignes de la boucle', loop, e); continue; }
      if (result.error) { console.warn('[LoopRules] boucle sur « ' + loop.table + ' » sans source (' + result.error + ') : zone affichée une fois.'); continue; }
      if (!result.items.length) { applyEmptyZone(zone, loop); continue; }
      const copies = document.createDocumentFragment();
      result.items.forEach(item => {
        const clone = zone.cloneNode(true);
        bindClone(zone, clone, loop, item);
        copies.appendChild(clone);
      });
      zone.replaceWith(copies);
    }
  }

  function inlineLoopOf(badge) {
    const loop = parseLoop(badge.getAttribute('data-loop'));
    return loop && loop.repeat === 'inline' ? loop : null;
  }
  function joinValues(values, separator, lastSeparator) {
    if (values.length < 2) return values.join('');
    const last = lastSeparator == null || lastSeparator === '' ? separator : lastSeparator;
    return values.slice(0, -1).join(separator) + last + values[values.length - 1];
  }
  const HIDE_MARKER_CLASS = 'pp-loop-hide-block';
  // Nœud qui remplace une bulle en boucle sans aucune ligne retenue ; « Masquer le paragraphe » pose un repère que removeHiddenBlocks traite une fois
  // toutes les bulles remplacées (le paragraphe ne doit pas disparaître pendant que les autres bulles se résolvent encore).
  function emptyInlineNode(loop) {
    if (loop.empty === 'text' && loop.emptyText) {
      const span = document.createElement('span');
      span.className = 'resolved-var';
      span.textContent = loop.emptyText;
      return span;
    }
    if (loop.empty === 'hide') {
      const marker = document.createElement('span');
      marker.className = HIDE_MARKER_CLASS;
      return marker;
    }
    return document.createTextNode('');
  }
  function removeHiddenBlocks(root) {
    if (!root) return;
    root.querySelectorAll('.' + HIDE_MARKER_CLASS).forEach(marker => {
      const block = marker.closest(TEXT_BLOCK_SELECTOR);
      if (block && root.contains(block) && block !== root) removeAndPrune(block);
      else marker.remove();
    });
  }
  // Valeur d'une bulle en boucle « dans la phrase » : `valueFor(binding)` rend la valeur (texte formaté) de la bulle pour une ligne ; les valeurs
  // vides sont sautées. Renvoie { text } ou { node } (aucune ligne retenue), ou null si la boucle ne trouve plus sa source - la bulle se résout alors
  // comme avant la boucle.
  async function resolveInline(badge, loop, tableId, record, ctx, valueFor) {
    const result = await iterate(loop, tableId, record, ctx);
    if (result.error) return null;
    const inherited = bindingOf(badge);
    const values = [];
    for (const item of result.items) {
      const value = await valueFor(itemBinding(loop, item, inherited));
      if (value !== '' && value != null) values.push(String(value));
    }
    if (!values.length) return { node: emptyInlineNode(loop) };
    return { text: joinValues(values, loop.separator, loop.lastSeparator) };
  }

  return {
    EMPTY_MODES, defaultEmpty, normalizeLoop, sourceFor, createContext, iterate, itemBinding, bindingOf,
    expandZones, inlineLoopOf, resolveInline, removeHiddenBlocks, removeAndPrune, joinValues,
  };
})();
