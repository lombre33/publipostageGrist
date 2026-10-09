// Boucle sur les lignes liées d'une bulle #Variable : le moteur, sans fenêtre (la fenêtre est dans js/variable-loop.js). Lignes parcourues, filtre,
// tri, déroulé de la zone répétée en Lecture et à l'export (js/reader-mode.js, point d'entrée commun du mode Lecture, du PDF, du Word et de l'export
// en lot). Aucune dépendance à l'éditeur.
//
// La boucle vit dans l'attribut `loop` du nœud varBadge (js/editor-nodes.js, sérialisé en data-loop), comme la condition d'affichage :
//   { repeat: 'inline'|'row'|'item'|'paragraph', table, via: null|{ table, column }, within: null|'Table', by: null|'Colonne',
//     filter: null|{ mode, rules }, sort: { column, direction }, empty, emptyText, separator, lastSeparator }
// - `table` : la table dont les lignes sont parcourues. `via` : une colonne Liste de références de la table de la page (les fiches qu'elle référence,
//   dans l'ordre de la cellule) ; sans `via`, les lignes de `table` trouvées par la règle de liaison du document (Variables.resolveLinkedRows, la
//   même que celle qui affiche aujourd'hui toutes les valeurs jointes par des virgules).
// - Une boucle dans une zone répétée par une autre boucle (les lignes de chaque facture dans les factures d'un client) lit ses lignes dans la ligne du
//   tour de la zone qui l'entoure, pas dans celle de la page (scopeFor) : `via.table` est alors la table de la zone englobante (sa colonne Liste de
//   références), ou `within` est cette table et `by` la colonne Référence de `table` qui désigne sa ligne (Lignes.Facture). Aucun lien de plus que pour
//   une boucle de la page : la colonne Référence suffit, sans règle de liaison pour `table`.
// - `repeat` : ce qui se répète autour de la bulle - la ligne du tableau (<tr>), l'élément de liste (<li>), le paragraphe ou le titre qui la
//   contient, ou la bulle seule, dans la phrase ('inline' : ses valeurs jointes par `separator`, et `lastSeparator` avant la dernière). Une zone n'a
//   qu'une boucle, celle de sa première bulle qui en porte une ; les autres bulles de `table` placées dans la zone suivent la même ligne à chaque
//   tour.
// - Portée sur la bulle plutôt que sur la zone : supprimer ou déplacer la bulle emporte sa boucle, jamais une zone répétée qu'aucune bulle ne
//   permettrait plus d'ouvrir. Une bulle déplacée hors de sa zone (hors du tableau, de la liste) redevient une bulle ordinaire, en édition comme en
//   lecture.
// Dans chaque copie de la zone, chaque bulle (et chaque image liée à une variable) est associée à la ligne du tour (bindingOf) :
// js/variables.js:resolveRawValue lit alors la valeur dans cette ligne (opts.loop) au lieu de chercher les lignes liées - valeur, format, condition
// et images compris. Elle porte aussi le rang du tour (`turn`, 1 pour la première ligne retenue : après le filtre et le tri) que la puce « N° de
// ligne » écrit (js/reader-mode.js:resolveSmartChips) ; dans une zone répétée dans une autre, celui de la zone la plus proche.
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
    // `within` ne vaut que sans `via`, qui nomme déjà la table englobante ; `by` ne vaut qu'avec `within`.
    const within = !via && raw.within ? String(raw.within) : null;
    const sortRaw = raw.sort || {};
    const sort = { column: sortRaw.column ? String(sortRaw.column) : '', direction: sortRaw.direction === 'desc' ? 'desc' : 'asc' };
    // Choix absent ou inconnu (document modifié à la main) : 'blank' pour une bulle seule, le choix par défaut de la zone sinon - jamais un
    // paragraphe masqué que personne n'a demandé.
    const empty = EMPTY_MODES[repeat].indexOf(raw.empty) !== -1 ? raw.empty : defaultEmpty(repeat, repeat === 'inline');
    return {
      repeat, table: String(raw.table), via, within, by: within && raw.by ? String(raw.by) : null, filter: ConditionRules.normalizeCondition(raw.filter), sort, empty,
      emptyText: raw.emptyText == null ? '' : String(raw.emptyText),
      separator: typeof raw.separator === 'string' ? raw.separator : ', ',
      lastSeparator: typeof raw.lastSeparator === 'string' ? raw.lastSeparator : null,
    };
  }
  function parseLoop(json) {
    if (!json) return null;
    try { return normalizeLoop(JSON.parse(json)); } catch (e) { return null; }
  }

  // Les colonnes Référence (une seule fiche par ligne) de `table` qui désignent une ligne de `target` : ce par quoi ses lignes se rattachent à celles de
  // `target` (Lignes.Facture pour la table Factures). Une liste de références ne compte pas : elle désigne plusieurs fiches, c'est l'inverse d'un
  // rattachement.
  function referenceColumnsTo(table, target) {
    return GristAPI.getVisibleColumns(table).filter(column => {
      const ref = GristAPI.referenceOf(GristAPI.getColumnType(table, column));
      return !!ref && !ref.list && ref.table === target;
    });
  }
  // Ce que parcourt une bulle placée dans une zone répétée pour la table `enclosing` : les fiches de sa colonne Liste de références (si elle est de
  // `enclosing`), ou les lignes de sa table qui se rattachent à la ligne de `enclosing` par une colonne Référence. { table, via, within, by, columns }
  // - `columns` : toutes les colonnes qui rattachent, `by` la première. Null sinon.
  function nestedSourceFor(attrs, enclosing) {
    if (attrs.table === enclosing) {
      if (String(attrs.column).indexOf('.') !== -1) return null;
      const ref = GristAPI.referenceOf(GristAPI.getColumnType(attrs.table, attrs.column));
      return ref && ref.list && ref.table !== enclosing ? { table: ref.table, via: { table: enclosing, column: attrs.column } } : null;
    }
    const columns = referenceColumnsTo(attrs.table, enclosing);
    return columns.length ? { table: attrs.table, via: null, within: enclosing, by: columns[0], columns } : null;
  }

  // Ce qu'une bulle peut parcourir : une variable d'une autre table liée par une règle « match » qui peut trouver plusieurs lignes (la colonne
  // comparée côté table liée n'est pas son identifiant de ligne, ex. Lignes.Facture = identifiant de la facture), ou une colonne Liste de références
  // de la table de la page (ex. Factures.Formateurs). Null sinon - colonne ordinaire de la page, ligne unique, table pas liée : la Boucle est grisée.
  // `enclosingTableId` : la table que parcourt la zone répétée qui entoure la bulle ; elle remplace alors la page (nestedSourceFor).
  function sourceFor(attrs, currentTableId, enclosingTableId) {
    if (!attrs || !attrs.table || !currentTableId) return null;
    if (enclosingTableId) return nestedSourceFor(attrs, enclosingTableId);
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

  // Ordre des lignes de la table dans Grist (manualSort, celui de la vue des données brutes), à défaut l'identifiant de ligne.
  function tableOrder(rows) {
    const rank = r => (typeof r.manualSort === 'number' ? r.manualSort : r.id);
    return rows.slice().sort((a, b) => (rank(a) - rank(b)) || (a.id - b.id));
  }

  // La table dont une ligne porte les lignes de cette boucle : celle de la zone englobante pour une boucle imbriquée (`within`, ou la table de la colonne
  // Liste de références `via`), la table de la page pour une boucle ordinaire (qui peut avoir un `via`, de la page) ; null pour une boucle sans `via`.
  function parentTable(loop) { return loop.within || (loop.via ? loop.via.table : null); }
  // La table de la zone englobante d'une boucle imbriquée, null pour une boucle de la page (`currentTableId`) : une `via` de la page n'est pas imbriquée.
  function enclosingOf(loop, currentTableId) {
    return loop.within || (loop.via && loop.via.table !== currentTableId ? loop.via.table : null);
  }
  // Où une boucle lit ses lignes liées : la ligne de la page, ou - pour une boucle imbriquée dans une zone répétée - la ligne que cette zone porte à ce
  // tour. `rows` : la ligne de chaque zone englobante par table (celles d'une liaison, bindingOf). Sans la ligne de sa table englobante (zone qui ne se
  // déroule pas : source perdue), la boucle retombe sur la page, où elle ne trouve rien : sa zone reste telle quelle.
  function scopeFor(loop, rows, tableId, record) {
    const parent = parentTable(loop);
    const row = parent && rows ? rows[parent] : null;
    return row ? { tableId: parent, record: row } : { tableId, record };
  }
  function scopeOf(loop, badge, tableId, record) {
    const binding = bindingOf(badge);
    return scopeFor(loop, binding && binding.rows, tableId, record);
  }
  // Colonne par laquelle les lignes de `loop.table` se rattachent à la ligne de `loop.within` : celle que la boucle a enregistrée (`by`) tant qu'elle
  // désigne encore cette table, à défaut la seule colonne Référence qui y mène. Null s'il n'y en a aucune, ou plusieurs sans choix enregistré.
  function nestedColumn(loop) {
    const columns = referenceColumnsTo(loop.table, loop.within);
    if (loop.by) return columns.indexOf(loop.by) !== -1 ? loop.by : null;
    return columns.length === 1 ? columns[0] : null;
  }

  // Lignes parcourues pour la ligne courante, avant filtre et tri : [{ row, anchor }] - `anchor` est la valeur affichée de la fiche dans la colonne
  // Liste de références (`via`), celle que la bulle de cette colonne montre à chaque tour. `tableId` et `record` : la portée de la boucle (scopeFor).
  async function linkedItems(loop, tableId, record, fetchRows) {
    if (loop.within) {
      // Boucle imbriquée : les lignes dont la colonne Référence désigne la ligne de la zone englobante (`record`, de la table `within`).
      if (loop.within !== tableId) return { error: 'within' };
      const column = nestedColumn(loop);
      if (!column) return { error: 'within' };
      const rows = await Variables.resolveLinkedRows(loop.table, { mode: 'match', colonneSource: 'id', colonneCible: column }, record, tableId, { fetchRows });
      return { items: tableOrder(rows).map(row => ({ row, anchor: undefined })) };
    }
    if (loop.via) {
      if (loop.via.table !== tableId) return { error: 'via' };
      // La ligne de grist.onRecord livre les valeurs affichées de la liste, pas les identifiants : relue sous sa forme brute, comme l'export en lot
      // la reçoit.
      let pageRow = GristAPI.isRawRow(record) ? record : null;
      if (!pageRow && record.id != null) pageRow = (await fetchRows(tableId)).find(r => r.id === record.id) || null;
      if (!pageRow) return { items: [] };
      const ids = Variables.listItems(pageRow[loop.via.column]);
      if (!ids.length) return { items: [] };
      const displayCol = GristAPI.getDisplayColumn(tableId, loop.via.column);
      const displays = displayCol ? Variables.listItems(pageRow[displayCol]) : null;
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

  // Lignes retenues pour une ligne de la table de la page (ou, pour une boucle imbriquée, de la table englobante : scopeFor) : { items, total } (total =
  // lignes liées avant le filtre), ou { error } - 'noLink' (table plus liée), 'via' (modèle utilisé sur une autre table que celle de sa colonne Liste de
  // références) ou 'within' (boucle imbriquée sans ligne englobante, ou dont la colonne de rattachement a disparu). `record` : ligne de grist.onRecord
  // ou de fetchTable.
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
  // conditionnels (leur condition), et la puce « N° de ligne » (le rang du tour).
  const BOUND_SELECTOR = '.var-badge, .calc-badge, img.editor-image[data-var-table], img.editor-image[data-qr-text], .conditional-text, .conditional-value, .conditional-checkbox, .smart-chip[data-chip-kind="rowNumber"]';
  function bindingOf(el) { return (el && bindings.get(el)) || null; }
  // Ligne du tour ajoutée à ce qu'un élément tient déjà d'une zone englobante (une zone répétée dans une autre, copiée-collée : chacune garde sa
  // table). `turn` : le rang du tour dans sa zone (1, 2, 3...) ; sans lui (bulle en boucle dans la phrase, aperçu), la liaison n'en porte pas.
  function itemBinding(loop, item, inherited, turn) {
    const next = { rows: Object.assign({}, inherited && inherited.rows), anchors: Object.assign({}, inherited && inherited.anchors) };
    next.rows[loop.table] = item.row;
    if (loop.via) next.anchors[loop.via.table + '.' + loop.via.column] = item.anchor;
    if (turn) next.turn = turn;
    return next;
  }
  function bindClone(source, clone, loop, item, turn) {
    const src = source.querySelectorAll(BOUND_SELECTOR);
    clone.querySelectorAll(BOUND_SELECTOR).forEach((el, i) => bindings.set(el, itemBinding(loop, item, src[i] ? bindings.get(src[i]) : null, turn)));
  }

  function zoneOf(badge, repeat, root) {
    let zone = null;
    if (repeat === 'row') zone = badge.closest('tr');
    else if (repeat === 'item') zone = badge.closest('li');
    else if (repeat === 'paragraph') zone = badge.closest(TEXT_BLOCK_SELECTOR);
    return zone && zone !== root && root.contains(zone) ? zone : null;
  }
  // Les bulles qui portent encore la boucle d'une zone, avec leur zone, dans l'ordre du document ; une boucle illisible ou sans zone est retirée (la
  // bulle redevient ordinaire).
  function zoneOwners(root) {
    const owners = [];
    for (const badge of root.querySelectorAll('.var-badge[data-loop]')) {
      const loop = parseLoop(badge.getAttribute('data-loop'));
      if (!loop) { badge.removeAttribute('data-loop'); continue; }
      if (loop.repeat === 'inline') continue;
      const zone = zoneOf(badge, loop.repeat, root);
      if (!zone) { badge.removeAttribute('data-loop'); continue; }
      owners.push({ badge, loop, zone });
    }
    return owners;
  }
  // Celles dont la zone n'est dans la zone d'aucune autre : la boucle d'une zone répétée dans une autre attend les copies de la zone qui l'entoure, qui lui
  // donnent sa ligne (scopeFor).
  function outermost(owners) {
    const zones = new Set(owners.map(o => o.zone));
    return owners.filter(o => {
      for (let el = o.zone.parentElement; el; el = el.parentElement) if (zones.has(el)) return false;
      return true;
    });
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

  // Une zone : sa copie pour chaque ligne retenue, associée à cette ligne ; « si aucune ligne » sinon. Une boucle qui ne trouve plus sa source laisse la
  // zone telle quelle.
  async function expandZone({ badge, loop, zone }, tableId, record, root, context) {
    // Une seule boucle par zone : celle-ci. Une autre bulle de la même zone qui en porte une (copiée-collée) redevient une bulle ordinaire.
    zone.querySelectorAll('.var-badge[data-loop]').forEach(b => {
      const other = parseLoop(b.getAttribute('data-loop'));
      if (other && other.repeat === loop.repeat && zoneOf(b, other.repeat, root) === zone) b.removeAttribute('data-loop');
    });
    const scope = scopeOf(loop, badge, tableId, record);
    let result;
    try { result = await iterate(loop, scope.tableId, scope.record, context); }
    catch (e) { console.error('[LoopRules] échec du calcul des lignes de la boucle', loop, e); return; }
    if (result.error) { console.warn('[LoopRules] boucle sur « ' + loop.table + ' » sans source (' + result.error + ') : zone affichée une fois.'); return; }
    if (!result.items.length) { applyEmptyZone(zone, loop); return; }
    const copies = document.createDocumentFragment();
    result.items.forEach((item, index) => {
      const clone = zone.cloneNode(true);
      bindClone(zone, clone, loop, item, index + 1);
      copies.appendChild(clone);
    });
    zone.replaceWith(copies);
  }
  // Niveaux de zones dans des zones que l'on déroule au plus (le HTML d'un modèle peut venir de n'importe où : la boucle doit finir).
  const MAX_NESTING = 12;
  // Déroule chaque zone répétée de `root` (HTML déjà assaini, pas encore résolu), du dehors vers le dedans : les zones qui n'en entourent aucune autre,
  // puis - dans leurs copies, qui leur ont donné leur ligne - celles qu'elles contenaient. Une boucle qui ne trouve plus sa source (table plus liée)
  // laisse la zone telle quelle : ses bulles affichent alors toutes les valeurs, jointes par des virgules, comme avant la boucle. Les boucles « dans la
  // phrase » restent sur leur bulle (resolveInline, appelée par js/reader-mode.js).
  async function expandZones(root, tableId, record, ctx) {
    if (!root || !record || !tableId) return;
    const context = ctx || createContext();
    for (let level = 0; level < MAX_NESTING; level++) {
      const owners = outermost(zoneOwners(root));
      if (!owners.length) return;
      for (const owner of owners) {
        // Une bulle de la même zone a pu déjà la dérouler (une seule boucle par zone) : sa boucle n'est plus là.
        if (owner.badge.hasAttribute('data-loop') && root.contains(owner.zone)) await expandZone(owner, tableId, record, root, context);
      }
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
    const scope = scopeOf(loop, badge, tableId, record);
    const result = await iterate(loop, scope.tableId, scope.record, ctx);
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
    EMPTY_MODES, defaultEmpty, normalizeLoop, sourceFor, referenceColumnsTo, nestedColumn, parentTable, enclosingOf, scopeFor, createContext, iterate, itemBinding,
    bindingOf, expandZones, inlineLoopOf, resolveInline, removeHiddenBlocks, removeAndPrune, joinValues,
  };
})();
