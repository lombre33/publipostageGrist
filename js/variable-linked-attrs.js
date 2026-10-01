// Fenêtre « Autres attributs » d'une bulle #Variable (maquette validée par Antoine le 2026-09-28) : depuis une variable dont la ligne est déterminée dans
// une autre table (ex. #Annuaire.NomPrenom, trouvée via Dossiers.Responsable), insère d'autres colonnes de la MÊME ligne (ex. Annuaire.Telephone) juste
// après elle, séparées par une espace. Les bulles insérées sont des #Variable ordinaires de cette table : elles passent par la même règle de liaison (une
// par table et par document, Publipostage_LiensTables), donc désignent bien la même ligne, en lecture comme à l'export. Proposée pour :
//  - une variable d'une autre table (liée à son insertion ; sinon la fenêtre de choix de la clé s'ouvre d'abord, comme à l'insertion) ;
//  - une colonne Référence de la table de la page (ex. #Dossiers.Responsable) : la table référencée est liée par cette colonne si elle ne l'est pas encore.
// Grisée dans la barre flottante ailleurs (js/floating-toolbars.js:linkedAttrsAvailable, même règle que targetFor ci-dessous).
//
// Descente de référence en référence (retour d'Antoine du 2026-09-29 : atteindre l'email de l'accompagnateur d'un projet, sans lier l'annuaire à toute la
// table de la page, car Projet a aussi un porteur vers le même annuaire) : une colonne Référence de la liste a une flèche qui ouvre les colonnes de la
// table qu'elle désigne, et sur une variable elle-même Référence la fenêtre s'ouvre d'emblée sur la ligne qu'elle désigne (l'élément le plus bas).
// La bulle insérée porte alors un chemin, #Projet.Accompagnateur.Email (GristAPI.resolveColumnPath) : sa table reste celle de la règle de liaison, le reste
// suit les références de cette ligne, sans nouvelle règle. Les cases cochées se gardent d'un niveau à l'autre ; un fil d'Ariane remonte.
//
// Condition d'affichage (demande d'Antoine du 2026-09-29) : quand la variable d'origine en a une, chaque bulle insérée la reprend, par défaut - une ligne
// « Reprendre la condition d'affichage », cochée, permet de les insérer sans. Une copie par bulle : elles se modifient ensuite chacune de leur côté.
//
// « Remplacer » (demande d'Antoine du 2026-10-01), à côté d'« Insérer » : les attributs cochés se mettent à la place de la bulle au lieu de s'ajouter après elle.
// C'est la même bulle dont la colonne change : sa mise en forme du texte, sa boucle, sa condition et son format - quand la nouvelle colonne est du même genre,
// nombre ou date - sont gardés, comme le fait la barre flottante pour chacun de ses réglages (EditorCore.patchNodeAndReselect, setNodeMarkup).
const VariableLinkedAttrs = (function () {
  let win = null; // la fenêtre de js/modal-base.js, créée à la première ouverture
  let refs = null;
  // { editor, pos, node, base, refColumn, minHops, hops, picks } pendant que la fenêtre est ouverte. `base` : table dont partent les chemins ; `hops` : colonnes
  // Référence suivies depuis elle jusqu'au niveau affiché (vide : les colonnes de `base` elle-même) ; `picks` : cases cochées, { hops, col }, dans l'ordre du
  // choix. `opening` couvre l'éventuelle fenêtre de choix de la clé qui la précède.
  let state = null;
  let opening = false;
  let valuesGeneration = 0;

  function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text != null) e.textContent = text;
    return e;
  }
  function isOpen() { return opening || !!state; }
  function sameHops(a, b) { return a.length === b.length && a.every((hop, i) => hop === b[i]); }

  // D'où la fenêtre part, ou null si elle n'a pas de sens ici : { base, hops, refColumn, minHops }.
  //  - variable d'une autre table que celle de la page : sa table, liée par sa règle ; sur une colonne Référence (éventuellement au bout d'un chemin), le
  //    niveau de la ligne qu'elle désigne - « l'élément le plus bas » -, d'où l'on peut remonter à celui de la table de la variable ;
  //  - colonne Référence de la page (ex. #Dossiers.Responsable) : la table référencée, liée par cette colonne (`refColumn`) ;
  //  - bulle de la table de la page déjà en chemin (ex. #Projet.Accompagnateur.Email dans un widget sur Projet) : ses niveaux, sans remonter aux colonnes
  //    ordinaires de la page (`minHops` 1), qui ne sont pas des attributs d'une autre ligne.
  // Null pour une colonne ordinaire de la page, une liste de références (plusieurs lignes) ou une référence vers la page elle-même.
  function targetFor(attrs) {
    if (!attrs.table || !attrs.column) return null;
    const currentTableId = GristAPI.getCurrentTableId();
    const parts = String(attrs.column).split('.');
    const end = GristAPI.resolveColumnPath(attrs.table, attrs.column);
    const endIsRef = !!end && end.type.indexOf('Ref:') === 0;
    let found = null;
    if (attrs.table !== currentTableId) {
      found = { base: attrs.table, hops: endIsRef ? parts : parts.slice(0, -1), refColumn: null, minHops: 0 };
    } else if (parts.length > 1) {
      found = { base: attrs.table, hops: endIsRef ? parts : parts.slice(0, -1), refColumn: null, minHops: 1 };
    } else if (endIsRef) {
      const target = end.type.slice(4);
      if (target && target !== currentTableId) found = { base: target, hops: [], refColumn: attrs.column, minHops: 0 };
    }
    return found && GristAPI.tableAtEndOf(found.base, found.hops) ? found : null;
  }
  function isAvailable(attrs) { return !!targetFor(attrs); }

  // Une règle de liaison doit exister pour que les bulles insérées trouvent la ligne. Colonne Référence de la page sans règle : règle créée d'office
  // (identifiant de ligne = cette colonne - celle que la fenêtre de choix de la clé proposerait d'elle-même). Autre table sans règle : la fenêtre de
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
    // Cadre, titre, zone qui défile et ligne de boutons : js/modal-base.js (Échap ferme où que soit le focus ; le focus revient à l'éditeur, cf. close).
    win = ModalBase.create({
      id: 'var-linked-modal', titleId: 'var-linked-title', boxClass: 'var-modal-content var-linked-modal-content', actionsClass: 'var-modal-actions',
      onEscape: () => close(), restoreFocus: false,
    });
    const title = win.title;
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
    const spacer = el('span', 'var-modal-spacer');
    const cancelBtn = el('button');
    cancelBtn.type = 'button';
    // Entre « Annuler » et « Insérer », qui reste le bouton principal : remplacer est le geste moins courant.
    const replaceBtn = el('button', 'var-linked-replace');
    replaceBtn.type = 'button';
    const insertBtn = el('button', 'var-modal-primary');
    insertBtn.type = 'button';
    win.actions.append(spacer, cancelBtn, replaceBtn, insertBtn);
    win.body.append(subtitle, inheritRow, path, filter, list, note);
    refs = { title, subtitle, path, filter, list, note, inheritRow, inheritBox, inheritText, inheritSummary, cancelBtn, replaceBtn, insertBtn };

    filter.addEventListener('input', applyFilter);
    list.addEventListener('change', onPickChange);
    list.addEventListener('click', event => {
      const button = event.target.closest && event.target.closest('.var-linked-descend');
      if (!button) return;
      event.preventDefault();
      goTo(state.hops.concat(button.closest('.var-linked-row').dataset.col));
    });
    cancelBtn.addEventListener('click', close);
    replaceBtn.addEventListener('click', replace);
    insertBtn.addEventListener('click', insert);
  }

  // Cases cochées : gardées dans `state.picks` (et non lues dans la liste) pour survivre à un changement de niveau.
  function pickIndex(hops, col) { return state.picks.findIndex(p => p.col === col && sameHops(p.hops, hops)); }
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
      const show = !q || row.dataset.search.indexOf(q) !== -1;
      row.hidden = !show;
      if (show) visible += 1;
    });
    const emptyEl = refs.list.querySelector('.var-linked-empty[data-role="no-match"]');
    if (emptyEl) emptyEl.hidden = visible !== 0;
  }

  // Table du niveau affiché, et la variable sous la forme « #Projet.Accompagnateur » qui y mène (les niveaux de la fenêtre se nomment comme les bulles).
  function levelTable() { return GristAPI.tableAtEndOf(state.base, state.hops) || state.base; }
  function pathText() { return Variables.triggerChar() + [state.base].concat(state.hops).join('.'); }
  // Table désignée par la colonne Référence `col` de `table` (celle qu'ouvre la flèche de sa ligne), null si ce n'est pas une Référence simple.
  function referencedTable(table, col) {
    const type = GristAPI.getColumnType(table, col) || '';
    const target = type.indexOf('Ref:') === 0 ? type.slice(4) : '';
    return target && GristAPI.getTables().indexOf(target) !== -1 ? target : null;
  }

  // Colonnes proposées : toutes celles de la table, sauf les colonnes techniques d'affichage des références (gristHelper_*).
  function listedColumns(table) {
    return GristAPI.getColumns(table).filter(c => c.indexOf('gristHelper_') !== 0);
  }
  function renderList() {
    const { list } = refs;
    const { node, base, hops } = state;
    const table = levelTable();
    list.replaceChildren();
    const cols = listedColumns(table);
    const own = String(node.attrs.column).split('.');
    const currentCol = node.attrs.table === base && sameHops(own.slice(0, -1), hops) ? own[own.length - 1] : null;
    if (!cols.filter(c => c !== currentCol).length) {
      list.appendChild(el('div', 'var-linked-empty', I18n.t('varLinked.empty', { table })));
    }
    cols.forEach(col => {
      const row = el('div', 'var-linked-row');
      const isCurrent = col === currentCol;
      row.classList.toggle('is-current', isCurrent);
      row.dataset.col = col;
      row.dataset.search = col.toLowerCase();
      const pick = el('label', 'var-linked-pick');
      const box = el('input');
      box.type = 'checkbox';
      box.value = col;
      box.disabled = isCurrent;
      box.checked = !isCurrent && pickIndex(hops, col) !== -1;
      const name = el('span', 'var-linked-col', col);
      if (isCurrent) { name.appendChild(document.createTextNode(' ')); name.appendChild(el('small', null, I18n.t('varLinked.thisVariable'))); }
      const value = el('span', 'var-linked-value');
      pick.append(box, name, value);
      row.appendChild(pick);
      const target = referencedTable(table, col);
      if (target) {
        const label = I18n.t('varLinked.descend', { table: target, column: col });
        const descend = el('button', 'var-linked-descend', '›');
        descend.type = 'button';
        descend.title = label;
        descend.setAttribute('aria-label', label);
        row.appendChild(descend);
      }
      list.appendChild(row);
    });
    const noMatch = el('div', 'var-linked-empty', I18n.t('varLinked.noFilterMatch'));
    noMatch.dataset.role = 'no-match';
    noMatch.hidden = true;
    list.appendChild(noMatch);
    syncActionButtons();
  }

  // Fil d'Ariane « Projet › Accompagnateur » : caché au niveau de la table de départ ; les niveaux au-dessus de celui affiché reviennent au clic (sauf
  // ceux qu'interdit `minHops`, montrés en texte simple).
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
      const up = el('button', 'var-linked-crumb', crumb.label);
      up.type = 'button';
      up.title = label;
      up.setAttribute('aria-label', label);
      up.addEventListener('click', () => goTo(crumb.hops));
      path.appendChild(up);
    });
  }

  function displayValue(table, rows, col) {
    if (GristAPI.getColumnType(table, col) === 'Attachments') return I18n.t('varLinked.attachmentValue');
    // Même lecture que la bulle insérée (Variables.cellValue) : la valeur affichée d'une Référence, jamais son id. Un 0 reste visible : c'est la donnée de la ligne,
    // que la bulle insérée n'écrira pas par défaut (Variables.zeroHidden).
    const values = rows.map(r => Variables.cellValue(table, col, r));
    return Variables.formatValue(values.length === 1 ? values[0] : values, null, table, col, { keepZero: true });
  }
  // Valeurs de la ligne du niveau affiché pour la ligne sélectionnée dans Grist - même recherche que la résolution des bulles (Variables.resolveRows :
  // règle de liaison puis références du chemin), donc ce que les attributs afficheront en lecture.
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
      note.textContent = (hops.length ? I18n.t('varLinked.noteNoPathRow', { path: pathText(), id: record.id }) : I18n.t('varLinked.noteNoLinkedRow', { table, id: record.id })) + ' ' + insertHint;
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
    const badge = Variables.triggerChar() + (node.attrs.key || '');
    const rule = GristAPI.getLinkRule(base);
    if (!rule || !currentTableId) return I18n.t('varLinked.subtitlePlain', { badge });
    if (rule.mode === 'singleton') return I18n.t('varLinked.subtitleSingleton', { badge, table: base });
    const via = Variables.describeLinkVia(base, rule, currentTableId);
    // Colonne Référence déjà couverte par une AUTRE règle pour la même table (une seule par document) : les bulles insérées suivront cette règle-là, le
    // dire plutôt que d'annoncer « même ligne que » à tort.
    if (refColumn && !(rule.colonneCible === 'id' && rule.colonneSource === refColumn)) return I18n.t('varLinked.subtitleOtherLink', { table: base, via, badge });
    return I18n.t('varLinked.subtitleVia', { badge, via });
  }

  // Affiche le niveau `state.hops` : titre, fil d'Ariane, colonnes puis valeurs. `hops` neuf = un autre niveau, filtre remis à zéro et focus dessus (la
  // flèche cliquée disparaît avec l'ancienne liste).
  function renderLevel() {
    const { title, subtitle, filter } = refs;
    title.textContent = I18n.t('varLinked.title', { table: levelTable() });
    subtitle.textContent = subtitleText();
    filter.value = '';
    renderPath();
    renderList();
    loadValues();
  }
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
    const out = [];
    levels.forEach(hops => {
      const order = listedColumns(GristAPI.tableAtEndOf(state.base, hops) || state.base);
      state.picks.filter(p => sameHops(p.hops, hops)).sort((a, b) => order.indexOf(a.col) - order.indexOf(b.col)).forEach(p => out.push(p));
    });
    return out;
  }

  // Copie de la condition d'affichage de la bulle d'origine (règles complètes seulement, comme la fenêtre de condition les enregistre), ou null : chaque
  // bulle insérée en reçoit une neuve.
  function inheritedCondition(node) {
    const condition = ConditionRules.normalizeCondition(node.attrs.condition);
    return condition ? JSON.parse(JSON.stringify(condition)) : null;
  }
  // La ligne « Reprendre la condition d'affichage » : visible seulement si la variable d'origine a une condition, et cochée à chaque ouverture (reprendre est le
  // comportement par défaut ; on décoche au cas par cas). Le résumé de la condition est à côté, l'info-bulle dit ce que la case fait.
  function renderInheritOption() {
    const { inheritRow, inheritBox, inheritText, inheritSummary } = refs;
    const condition = inheritedCondition(state.node);
    inheritRow.hidden = !condition;
    inheritBox.checked = true;
    if (!condition) return;
    const summary = VariableCondition.describe(condition, { full: true });
    inheritText.textContent = I18n.t('varLinked.inherit');
    inheritSummary.textContent = '· ' + summary;
    inheritRow.title = I18n.t('varLinked.inheritTitle', { badge: Variables.triggerChar() + (state.node.attrs.key || ''), summary });
  }

  // La bulle d'origine, toujours à sa position (la fenêtre garde celle de son ouverture), ou null - alerte, fenêtre fermée - si elle a été déplacée ou supprimée
  // pendant le choix : rien n'est alors inséré ni remplacé.
  function originalBadge() {
    const { editor, pos, node: original } = state;
    const node = editor.state.doc.nodeAt(pos);
    if (node && node.type.name === 'varBadge' && node.attrs.table === original.attrs.table && node.attrs.column === original.attrs.column) return node;
    console.warn('[VariableLinkedAttrs] bulle introuvable à sa position d\'origine - rien inséré ni remplacé.');
    alert(I18n.t('varLinked.insertLost'));
    close();
    return null;
  }
  // Table et colonne (ou chemin) de la bulle d'un attribut coché.
  function pickAttrs(pick) {
    const column = pick.hops.concat(pick.col).join('.');
    return { table: state.base, column, key: state.base + '.' + column };
  }
  // Contenu à poser pour ces attributs : une espace avant chaque bulle, qui reçoit une copie de la condition de `node` quand « Reprendre la condition d'affichage »
  // est proposée et cochée.
  function badgesContent(picks, node) {
    const inherits = !refs.inheritRow.hidden && refs.inheritBox.checked;
    const content = [];
    picks.forEach(p => {
      const attrs = pickAttrs(p);
      if (inherits) attrs.condition = inheritedCondition(node);
      content.push({ type: 'text', text: ' ' });
      content.push({ type: 'varBadge', attrs });
    });
    return content;
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

  // Genre du format que porte une colonne : un format nombre n'a de sens que sur un nombre, un format date que sur une date (même répartition que la barre flottante,
  // js/floating-toolbars.js:wireVariableFloatingToolbar).
  function formatKind(type) {
    if (type === 'Numeric' || type === 'Int') return 'number';
    return type === 'Date' || type === 'DateTime' ? 'date' : null;
  }
  // « Remplacer » : la bulle d'origine prend la colonne du premier attribut coché, les autres cochés suivent, séparés par une espace, comme à l'insertion. Elle reste la
  // même bulle : ses autres réglages restent (mise en forme du texte, boucle, condition, format), sauf ce qui ne vaut que pour l'ancienne colonne - le format d'un
  // autre genre (une date sur un texte donnerait n'importe quoi), la boucle d'une autre table, la condition si on a décoché « Reprendre la condition d'affichage ».
  // Une seule transaction : un seul Annuler rend l'ancienne bulle. La bulle reste sélectionnée, sa barre revient avec les réglages de sa nouvelle colonne.
  function replace() {
    if (!state || !state.picks.length) return;
    const { editor, pos } = state;
    const node = originalBadge();
    if (!node) return;
    const [first, ...others] = orderedPicks();
    const attrs = Object.assign({}, node.attrs, pickAttrs(first));
    if (!refs.inheritRow.hidden && !refs.inheritBox.checked) attrs.condition = null;
    const oldKind = formatKind(GristAPI.getColumnType(node.attrs.table, node.attrs.column));
    if (!oldKind || oldKind !== formatKind(GristAPI.getColumnType(attrs.table, attrs.column))) attrs.format = null;
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
    replaceBtn.title = I18n.t('varLinked.replaceTitle', { badge: Variables.triggerChar() + (node.attrs.key || '') });
    renderInheritOption();
    renderLevel();
    win.show(filter);
  }

  return { open, close, isOpen, isAvailable };
})();
