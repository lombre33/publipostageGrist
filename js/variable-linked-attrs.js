// Fenêtre « Autres attributs » d'une bulle #Variable : depuis une variable dont la ligne est déterminée dans une autre table (ex.
// #Annuaire.NomPrenom, trouvée via Dossiers.Responsable), insère d'autres colonnes de la même ligne (ex. Annuaire.Telephone) juste après elle,
// séparées par une espace. Les bulles insérées sont des #Variable ordinaires de cette table : elles passent par la même règle de liaison (une par
// table et par document, Publipostage_LiensTables), donc désignent la même ligne, en lecture comme à l'export. Proposée pour :
//  - une variable d'une autre table (liée à son insertion ; sinon la fenêtre de choix de la clé s'ouvre d'abord, comme à l'insertion) ;
//  - une colonne Référence de la table de la page (ex. #Dossiers.Responsable) : la table référencée est liée par cette colonne si elle ne l'est pas
//    encore.
// Grisée dans la barre flottante ailleurs (js/floating-toolbars.js:linkedAttrsAvailable, même règle que targetFor ci-dessous).
//
// Descente de référence en référence : une colonne Référence de la liste a une flèche qui ouvre les colonnes de la table qu'elle désigne, et sur une
// variable elle-même Référence la fenêtre s'ouvre d'emblée sur la ligne qu'elle désigne (l'élément le plus bas). De quoi atteindre l'email de
// l'accompagnateur d'un projet sans lier l'annuaire à toute la table de la page, puisque Projet a aussi un porteur vers le même annuaire : la bulle
// insérée porte un chemin, #Projet.Accompagnateur.Email (GristAPI.resolveColumnPath), sa table reste celle de la règle de liaison et le reste suit
// les références de cette ligne, sans nouvelle règle. Les cases cochées se gardent d'un niveau à l'autre ; un fil d'Ariane remonte.
//
// Quand la variable d'origine a une condition d'affichage, chaque bulle insérée la reprend par défaut, en copie : « Reprendre la condition
// d'affichage », décochée, les insère sans. « Remplacer », à côté d'« Insérer », met les attributs cochés à la place de la bulle au lieu de les
// ajouter après elle : c'est la même bulle dont la colonne change, ses réglages restent (EditorCore.patchNodeAndReselect, setNodeMarkup).
const VariableLinkedAttrs = (function () {
  const { el, button } = Dom;
  let win = null; // la fenêtre de js/modal-base.js, créée à la première ouverture
  let refs = null;
  // { editor, pos, node, base, refColumn, minHops, hops, picks } pendant que la fenêtre est ouverte. `base` : table dont partent les chemins ;
  // `hops` : colonnes Référence suivies depuis elle jusqu'au niveau affiché (vide : les colonnes de `base` elle-même) ; `picks` : cases cochées,
  // { hops, col }, dans l'ordre du choix.
  let state = null;
  let opening = false; // vrai pendant la fenêtre de choix de la clé qui peut précéder celle-ci
  let valuesGeneration = 0;

  const isOpen = () => opening || !!state;
  const sameHops = (a, b) => a.length === b.length && a.every((hop, i) => hop === b[i]);

  // D'où la fenêtre part, ou null si elle n'a pas de sens ici : { base, hops, refColumn, minHops }.
  //  - variable d'une autre table que celle de la page : sa table, liée par sa règle ; sur une colonne Référence (éventuellement au bout d'un
  //    chemin), le niveau de la ligne qu'elle désigne - « l'élément le plus bas » -, d'où l'on peut remonter à celui de la table de la variable ;
  //  - colonne Référence de la page (ex. #Dossiers.Responsable) : la table référencée, liée par cette colonne (`refColumn`) ;
  //  - bulle de la table de la page déjà en chemin (ex. #Projet.Accompagnateur.Email dans un widget sur Projet) : ses niveaux, sans remonter aux
  //    colonnes ordinaires de la page (`minHops` 1), qui ne sont pas des attributs d'une autre ligne.
  // Null pour une colonne ordinaire de la page, une liste de références (plusieurs lignes) ou une référence vers la page elle-même.
  function targetFor(attrs) {
    if (!attrs.table || !attrs.column) return null;
    const currentTableId = GristAPI.getCurrentTableId();
    const parts = String(attrs.column).split('.');
    const end = GristAPI.resolveColumnPath(attrs.table, attrs.column);
    const ref = end && GristAPI.referenceOf(end.type);
    const endIsRef = !!ref && !ref.list;
    const onPage = attrs.table === currentTableId;
    let found = null;
    if (!onPage || parts.length > 1) {
      found = { base: attrs.table, hops: endIsRef ? parts : parts.slice(0, -1), refColumn: null, minHops: onPage ? 1 : 0 };
    } else if (endIsRef && ref.table !== currentTableId) {
      found = { base: ref.table, hops: [], refColumn: attrs.column, minHops: 0 };
    }
    return found && GristAPI.tableAtEndOf(found.base, found.hops) ? found : null;
  }
  const isAvailable = attrs => !!targetFor(attrs);

  // Une règle de liaison doit exister pour que les bulles insérées trouvent la ligne. Colonne Référence de la page sans règle : règle créée d'office
  // (identifiant de ligne = cette colonne, celle que la fenêtre de choix de la clé proposerait d'elle-même). Autre table sans règle : la fenêtre de
  // choix de la clé, comme à l'insertion. Faux si l'utilisateur annule.
  async function ensureLink(target, refColumn) {
    if (GristAPI.getLinkRule(target) || !GristAPI.getCurrentTableId()) return true;
    if (refColumn) {
      await GristAPI.saveLinkRule(target, { mode: 'match', colonneCible: 'id', colonneSource: refColumn });
      Variables.refreshLinkRulesPanel();
      return true;
    }
    return Variables.ensureLinkConfigured({ table: target });
  }

  function ensureModal() {
    if (win) return;
    // Échap ferme où que soit le focus ; le focus revient à l'éditeur (cf. close).
    win = ModalBase.create({
      id: 'var-linked-modal', titleId: 'var-linked-title', boxClass: 'var-modal-content var-linked-modal-content', actionsClass: 'var-modal-actions',
      onEscape: close, restoreFocus: false,
    });
    const subtitle = el('p', 'var-modal-intro');
    const path = el('nav', 'var-linked-path');
    path.hidden = true;
    const filter = el('input', 'var-linked-filter');
    filter.type = 'search';
    const list = el('div', 'var-linked-list');
    const note = el('p', 'var-linked-note');
    note.setAttribute('aria-live', 'polite');
    // Proposée seulement si la variable d'origine a une condition (cf. renderInheritOption), cochée à chaque ouverture.
    const inheritRow = el('label', 'var-linked-inherit');
    inheritRow.hidden = true;
    const inheritBox = el('input');
    inheritBox.type = 'checkbox';
    const inheritText = el('span', 'var-linked-inherit-text');
    const inheritSummary = el('span', 'var-linked-inherit-summary');
    inheritRow.append(inheritBox, inheritText, inheritSummary);
    const { cancel: cancelBtn, ok: insertBtn } = win.addButtons();
    // Entre « Annuler » et « Insérer », qui reste le bouton principal : remplacer est le geste moins courant.
    const replaceBtn = button('var-linked-replace');
    insertBtn.before(replaceBtn);
    win.body.append(subtitle, inheritRow, path, filter, list, note);
    refs = { title: win.title, subtitle, path, filter, list, note, inheritRow, inheritBox, inheritText, inheritSummary, cancelBtn, replaceBtn, insertBtn };

    filter.addEventListener('input', applyFilter);
    list.addEventListener('change', onPickChange);
    list.addEventListener('click', event => {
      const descend = event.target.closest && event.target.closest('.var-linked-descend');
      if (!descend) return;
      event.preventDefault();
      goTo(state.hops.concat(descend.closest('.var-linked-row').dataset.col));
    });
    cancelBtn.addEventListener('click', close);
    replaceBtn.addEventListener('click', replace);
    insertBtn.addEventListener('click', insert);
  }

  // Cases cochées : gardées dans `state.picks` (et non lues dans la liste) pour survivre à un changement de niveau.
  const pickIndex = (hops, col) => state.picks.findIndex(p => p.col === col && sameHops(p.hops, hops));
  function onPickChange(event) {
    const box = event.target;
    if (!state || !box || box.type !== 'checkbox') return;
    const index = pickIndex(state.hops, box.value);
    if (box.checked && index === -1) state.picks.push({ hops: state.hops.slice(), col: box.value });
    else if (!box.checked && index !== -1) state.picks.splice(index, 1);
    syncActionButtons();
  }
  // « Insérer » dit combien d'attributs il pose ; lui et « Remplacer » restent grisés tant que rien n'est coché.
  function syncActionButtons() {
    const count = state ? state.picks.length : 0;
    refs.insertBtn.textContent = I18n.t('varLinked.insert', { count });
    refs.insertBtn.disabled = count === 0;
    refs.replaceBtn.disabled = count === 0;
  }
  function applyFilter() {
    const q = refs.filter.value.trim().toLowerCase();
    let visible = 0;
    refs.list.querySelectorAll('.var-linked-row').forEach(row => {
      row.hidden = !!q && row.dataset.search.indexOf(q) === -1;
      if (!row.hidden) visible += 1;
    });
    const noMatch = refs.list.querySelector('.var-linked-empty[data-role="no-match"]');
    if (noMatch) noMatch.hidden = visible !== 0;
  }

  // Table du niveau affiché, et la variable sous la forme « #Projet.Accompagnateur » qui y mène (les niveaux de la fenêtre se nomment comme les
  // bulles).
  const levelTable = () => GristAPI.tableAtEndOf(state.base, state.hops) || state.base;
  const pathText = () => Variables.triggerChar() + [state.base].concat(state.hops).join('.');
  // Table désignée par la colonne Référence `col` de `table` (celle qu'ouvre la flèche de sa ligne), null si ce n'est pas une Référence simple.
  function referencedTable(table, col) {
    const ref = GristAPI.referenceOf(GristAPI.getColumnType(table, col));
    return ref && !ref.list && GristAPI.getTables().indexOf(ref.table) !== -1 ? ref.table : null;
  }

  // Une colonne du niveau affiché : sa case, son nom, sa valeur (posée par loadValues) et, pour une Référence, la flèche qui descend dans sa table.
  // `isCurrent` : la colonne de la bulle d'origine, montrée mais pas cochable.
  function columnRow(table, col, isCurrent) {
    const row = el('div', isCurrent ? 'var-linked-row is-current' : 'var-linked-row');
    row.dataset.col = col;
    row.dataset.search = col.toLowerCase();
    const box = el('input');
    box.type = 'checkbox';
    box.value = col;
    box.disabled = isCurrent;
    box.checked = !isCurrent && pickIndex(state.hops, col) !== -1;
    const name = el('span', 'var-linked-col', col);
    if (isCurrent) name.append(' ', el('small', null, I18n.t('varLinked.thisVariable')));
    const pick = el('label', 'var-linked-pick');
    pick.append(box, name, el('span', 'var-linked-value'));
    row.appendChild(pick);
    const target = referencedTable(table, col);
    if (target) {
      const label = I18n.t('varLinked.descend', { table: target, column: col });
      const descend = button('var-linked-descend', '›');
      descend.title = label;
      descend.setAttribute('aria-label', label);
      row.appendChild(descend);
    }
    return row;
  }
  function renderList() {
    const { list } = refs;
    const { node, base, hops } = state;
    const table = levelTable();
    const cols = GristAPI.getVisibleColumns(table);
    const own = String(node.attrs.column).split('.');
    const currentCol = node.attrs.table === base && sameHops(own.slice(0, -1), hops) ? own[own.length - 1] : null;
    list.replaceChildren();
    if (!cols.some(c => c !== currentCol)) list.appendChild(el('div', 'var-linked-empty', I18n.t('varLinked.empty', { table })));
    cols.forEach(col => list.appendChild(columnRow(table, col, col === currentCol)));
    const noMatch = el('div', 'var-linked-empty', I18n.t('varLinked.noFilterMatch'));
    noMatch.dataset.role = 'no-match';
    noMatch.hidden = true;
    list.appendChild(noMatch);
    syncActionButtons();
  }

  // Fil d'Ariane « Projet › Accompagnateur » : caché au niveau de la table de départ ; les niveaux au-dessus de celui affiché reviennent au clic
  // (sauf ceux qu'interdit `minHops`, montrés en texte simple).
  function renderPath() {
    const { path } = refs;
    const { base, hops, minHops } = state;
    path.replaceChildren();
    path.hidden = hops.length === 0;
    if (path.hidden) return;
    path.setAttribute('aria-label', I18n.t('varLinked.path'));
    const crumbs = [{ hops: [], label: base }].concat(hops.map((hop, i) => ({ hops: hops.slice(0, i + 1), label: hop })));
    crumbs.forEach((crumb, i) => {
      if (i) {
        const sep = el('span', 'var-linked-sep', '›');
        sep.setAttribute('aria-hidden', 'true');
        path.appendChild(sep);
      }
      const isHere = i === crumbs.length - 1;
      if (isHere || crumb.hops.length < minHops) {
        const text = el('span', 'var-linked-crumb' + (isHere ? ' is-here' : ''), crumb.label);
        if (isHere) text.setAttribute('aria-current', 'location');
        path.appendChild(text);
        return;
      }
      const label = I18n.t('varLinked.upTo', { table: GristAPI.tableAtEndOf(base, crumb.hops) || base });
      const up = button('var-linked-crumb', crumb.label);
      up.title = label;
      up.setAttribute('aria-label', label);
      up.addEventListener('click', () => goTo(crumb.hops));
      path.appendChild(up);
    });
  }

  function displayValue(table, rows, col) {
    if (GristAPI.getColumnType(table, col) === 'Attachments') return I18n.t('varLinked.attachmentValue');
    // Même lecture que la bulle insérée (Variables.cellValue) : la valeur affichée d'une Référence, jamais son id. Un 0 reste visible : c'est la
    // donnée de la ligne, que la bulle insérée n'écrira pas par défaut (Variables.zeroHidden).
    const values = rows.map(r => Variables.cellValue(table, col, r));
    return Variables.formatValue(values.length === 1 ? values[0] : values, null, table, col, { keepZero: true });
  }
  // Valeurs de la ligne du niveau affiché pour la ligne sélectionnée dans Grist - même recherche que la résolution des bulles
  // (Variables.resolveRows : règle de liaison puis références du chemin), donc ce que les attributs afficheront en lecture.
  async function loadValues() {
    const gen = ++valuesGeneration;
    const { note, list } = refs;
    const { base, hops } = state;
    const table = levelTable();
    const currentTableId = GristAPI.getCurrentTableId();
    const record = GristAPI.getCurrentRecord();
    const insertHint = I18n.t('varLinked.noteInsert');
    if (!record || !currentTableId) { note.textContent = I18n.t('varLinked.noteNoRecord') + ' ' + insertHint; return; }
    note.textContent = I18n.t('varCond.debug.computing');
    let rows = [];
    try {
      const found = await Variables.resolveRows(base, hops, currentTableId, record);
      rows = (found.rows || []).filter(Boolean);
    } catch (e) { console.warn('[VariableLinkedAttrs] valeurs indisponibles', e); }
    if (gen !== valuesGeneration || !state) return;
    if (!rows.length) {
      const missing = hops.length ? I18n.t('varLinked.noteNoPathRow', { path: pathText(), id: record.id }) : I18n.t('varLinked.noteNoLinkedRow', { table, id: record.id });
      note.textContent = missing + ' ' + insertHint;
      return;
    }
    list.querySelectorAll('.var-linked-row').forEach(row => {
      const text = displayValue(table, rows, row.dataset.col);
      row.querySelector('.var-linked-value').textContent = text;
      row.title = text;
      row.dataset.search = (row.dataset.col + ' ' + text).toLowerCase();
    });
    applyFilter();
    note.textContent = I18n.t('varLinked.noteRow', { id: record.id }) + ' ' + insertHint;
  }

  function subtitleText() {
    const { node, base, hops, refColumn } = state;
    if (hops.length) return I18n.t('varLinked.subtitlePath', { table: levelTable(), path: pathText() });
    const currentTableId = GristAPI.getCurrentTableId();
    const badge = VariableModal.badgeText(node);
    const rule = GristAPI.getLinkRule(base);
    if (!rule || !currentTableId) return I18n.t('varLinked.subtitlePlain', { badge });
    if (rule.mode === 'singleton') return I18n.t('varLinked.subtitleSingleton', { badge, table: base });
    const via = Variables.describeLinkVia(base, rule, currentTableId);
    // Colonne Référence déjà couverte par une autre règle pour la même table (une seule par document) : les bulles insérées suivront cette règle-là,
    // le dire plutôt que d'annoncer « même ligne que » à tort.
    if (refColumn && !(rule.colonneCible === 'id' && rule.colonneSource === refColumn)) return I18n.t('varLinked.subtitleOtherLink', { table: base, via, badge });
    return I18n.t('varLinked.subtitleVia', { badge, via });
  }

  // Affiche le niveau `state.hops` : titre, fil d'Ariane, colonnes puis valeurs.
  function renderLevel() {
    const { title, subtitle, filter } = refs;
    title.textContent = I18n.t('varLinked.title', { table: levelTable() });
    subtitle.textContent = subtitleText();
    filter.value = '';
    renderPath();
    renderList();
    loadValues();
  }
  // Un autre niveau : filtre remis à zéro et focus dessus (la flèche cliquée disparaît avec l'ancienne liste).
  function goTo(hops) {
    if (!state) return;
    state.hops = hops.slice();
    renderLevel();
    refs.filter.focus();
  }

  // Niveaux dans l'ordre où on les a cochés pour la première fois, colonnes d'un niveau dans l'ordre de leur table (jamais l'ordre des clics).
  function orderedPicks() {
    const levels = [];
    state.picks.forEach(p => { if (!levels.some(hops => sameHops(hops, p.hops))) levels.push(p.hops); });
    return levels.flatMap(hops => {
      const order = GristAPI.getVisibleColumns(GristAPI.tableAtEndOf(state.base, hops) || state.base);
      return state.picks.filter(p => sameHops(p.hops, hops)).sort((a, b) => order.indexOf(a.col) - order.indexOf(b.col));
    });
  }

  // La ligne « Reprendre la condition d'affichage » : visible seulement si la variable d'origine a une condition, et cochée à chaque ouverture
  // (reprendre est le comportement par défaut ; on décoche au cas par cas). Le résumé de la condition est à côté, l'info-bulle dit ce que la case
  // fait.
  function renderInheritOption() {
    const { inheritRow, inheritBox, inheritText, inheritSummary } = refs;
    const condition = ConditionRules.plainCondition(state.node.attrs.condition);
    inheritRow.hidden = !condition;
    inheritBox.checked = true;
    if (!condition) return;
    const summary = VariableCondition.describe(condition, { full: true });
    inheritText.textContent = I18n.t('varLinked.inherit');
    inheritSummary.textContent = '· ' + summary;
    inheritRow.title = I18n.t('varLinked.inheritTitle', { badge: VariableModal.badgeText(state.node), summary });
  }

  // La bulle d'origine, toujours à sa position (la fenêtre garde celle de son ouverture) ; sinon - déplacée ou supprimée pendant le choix - la
  // fenêtre le dit et se ferme : rien n'est alors inséré ni remplacé.
  function originalBadge() {
    const node = VariableModal.nodeAtOrigin(state, 'varLinked.insertLost', 'VariableLinkedAttrs');
    if (!node) close();
    return node;
  }
  // Table et colonne (ou chemin) de la bulle d'un attribut coché.
  function pickAttrs(pick) {
    const column = pick.hops.concat(pick.col).join('.');
    return { table: state.base, column, key: state.base + '.' + column };
  }
  // Contenu à poser pour ces attributs : une espace avant chaque bulle, qui reçoit une copie de la condition de `node` quand « Reprendre la condition
  // d'affichage » est proposée et cochée.
  function badgesContent(picks, node) {
    const inherits = !refs.inheritRow.hidden && refs.inheritBox.checked;
    return picks.flatMap(p => {
      const attrs = pickAttrs(p);
      if (inherits) attrs.condition = ConditionRules.plainCondition(node.attrs.condition);
      return [{ type: 'text', text: ' ' }, { type: 'varBadge', attrs }];
    });
  }

  function insert() {
    if (!state || !state.picks.length) return;
    const { editor, pos } = state;
    const node = originalBadge();
    if (!node) return;
    const content = badgesContent(orderedPicks(), node);
    const insertAt = pos + node.nodeSize;
    close({ keepFocus: true });
    editor.chain().focus().insertContentAt(insertAt, content).run();
  }

  // « Remplacer » : la bulle d'origine prend la colonne du premier attribut coché, les autres cochés suivent, séparés par une espace, comme à
  // l'insertion. Elle reste la même bulle : ses autres réglages restent (mise en forme du texte, boucle, condition, format), sauf ce qui ne vaut que
  // pour l'ancienne colonne - le format d'un autre genre (une date sur un texte donnerait n'importe quoi), la boucle d'une autre table, la condition
  // si « Reprendre la condition d'affichage » est décochée. Une seule transaction : un seul Annuler rend l'ancienne bulle. La bulle reste
  // sélectionnée, sa barre revient avec les réglages de sa nouvelle colonne.
  function replace() {
    if (!state || !state.picks.length) return;
    const { editor, pos } = state;
    const node = originalBadge();
    if (!node) return;
    const [first, ...others] = orderedPicks();
    const attrs = Object.assign({}, node.attrs, pickAttrs(first));
    if (!refs.inheritRow.hidden && !refs.inheritBox.checked) attrs.condition = null;
    const oldKind = VariableFormat.columnKind(GristAPI.getColumnType(node.attrs.table, node.attrs.column));
    if (!oldKind || oldKind !== VariableFormat.columnKind(GristAPI.getColumnType(attrs.table, attrs.column))) attrs.format = null;
    if (attrs.table !== node.attrs.table) attrs.loop = null;
    const after = pos + node.nodeSize;
    const content = badgesContent(others, node);
    close({ keepFocus: true });
    const chain = editor.chain().command(({ tr }) => { tr.setNodeMarkup(pos, undefined, attrs); return true; });
    if (content.length) chain.insertContentAt(after, content);
    chain.setNodeSelection(pos).run();
    editor.view.focus();
  }

  function close(opts) {
    if (!win) return;
    const editor = state && state.editor;
    win.hide();
    state = null;
    valuesGeneration += 1;
    if (editor && !(opts && opts.keepFocus)) editor.view.focus();
  }

  // `pos` : position de la bulle, capturée au clic sur l'icône de la barre flottante.
  async function open(editor, pos) {
    const node = editor && editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== 'varBadge' || opening || state) return;
    const t = targetFor(node.attrs);
    if (!t) return;
    opening = true;
    EditorCore.hideFloatingContextToolbars();
    let linked = false;
    try { linked = t.base === GristAPI.getCurrentTableId() || await ensureLink(t.base, t.refColumn); }
    catch (e) { console.error('[VariableLinkedAttrs] échec de la liaison de « ' + t.base + ' »', e); }
    finally { opening = false; }
    if (!linked) { editor.view.focus(); return; }
    ensureModal();
    state = { editor, pos, node, base: t.base, refColumn: t.refColumn, minHops: t.minHops, hops: t.hops.slice(), picks: [] };
    const { filter, cancelBtn, replaceBtn } = refs;
    filter.placeholder = I18n.t('varLinked.filter');
    filter.setAttribute('aria-label', I18n.t('varLinked.filter'));
    cancelBtn.textContent = I18n.t('common.cancel');
    replaceBtn.textContent = I18n.t('varLinked.replace');
    replaceBtn.title = I18n.t('varLinked.replaceTitle', { badge: VariableModal.badgeText(node) });
    renderInheritOption();
    renderLevel();
    win.show(filter);
  }

  return { open, close, isOpen, isAvailable };
})();
