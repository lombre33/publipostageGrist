// Fenêtre « Autres attributs » d'une bulle #Variable : depuis une variable dont la ligne est déterminée dans une autre table (ex.
// #Annuaire.NomPrenom, trouvée via Dossiers.Responsable), insère d'autres colonnes de la même ligne (ex. Annuaire.Telephone) juste après elle,
// séparées par une espace. Les bulles insérées sont des #Variable ordinaires de cette table : elles passent par la même règle de liaison (une par
// table et par document, Publipostage_LiensTables), donc désignent la même ligne, en lecture comme à l'export. Proposée pour :
//  - une variable d'une autre table (liée à son insertion ; sinon la fenêtre de choix de la clé s'ouvre d'abord, comme à l'insertion) ;
//  - une colonne Référence de la table de la page (ex. #Dossiers.Responsable) : la table référencée est liée par cette colonne si elle ne l'est pas
//    encore. Quand la page a plusieurs colonnes Référence vers cette même table (ex. Demandeur et Valideur vers l'Annuaire, deux personnes dans la
//    même ligne), la fenêtre suit la colonne cliquée et pose des bulles en chemin (#Dossiers.Valideur.Email) : aucun lien n'est créé ni changé ;
//  - une colonne Liste de références de la table de la page (ex. #Dossiers.Destinataires, des fiches de l'annuaire) : la fenêtre montre les colonnes
//    de la table de la liste, avec leur valeur sur chacune de ses lignes à la suite, et pose des bulles en chemin (#Dossiers.Destinataires.Email) qui
//    écrivent cette colonne pour toutes les lignes de la liste, séparées par une virgule. Aucun lien n'est créé : un lien ne suit qu'une ligne. Le réglage
//    « Liste » de la bulle (js/variable-list.js : séparateur, première, dernière) passe de la colonne au chemin par « Remplacer ».
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
//
// Choisir UNE colonne (`pickColumn`) : la même fenêtre, ouverte depuis le champ d'une colonne de règle de condition (js/condition-fields.js : le bouton à droite de
// la zone de recherche de la liste, Ctrl+Entrée, ou un clic sur la colonne choisie, qui s'y montre comme une variable du document), pour choisir la colonne de la
// règle en voyant leur valeur sur la ligne sélectionnée et en descendant de Référence en Référence comme ici. Elle part de la table de la colonne - celle de la page,
// ou une autre table liée, comme pour la bulle d'une variable de cette table -, sans bulle d'origine : une seule colonne se sélectionne (une case ronde), « Choisir »
// la rend à celui qui a ouvert la fenêtre, qui la pose comme la liste l'aurait posée ; ni insertion, ni « Remplacer », ni condition reprise, ni lien créé.
const VariableLinkedAttrs = (function () {
  const { el, button } = Dom;
  let win = null; // la fenêtre de js/modal-base.js, créée à la première ouverture
  let refs = null;
  // { editor, pos, node, base, refColumn, minHops, hops, picks, pick } pendant que la fenêtre est ouverte. `base` : table dont partent les chemins ;
  // `hops` : colonnes Référence suivies depuis elle jusqu'au niveau affiché (vide : les colonnes de `base` elle-même) ; `picks` : cases cochées,
  // { hops, col }, dans l'ordre du choix. `pick` : { resolve, result } quand la fenêtre sert à choisir une colonne (pickColumn) - `editor`, `pos` et
  // `node` sont alors null et `picks` ne garde qu'une colonne -, null pour « Autres attributs » d'une bulle. `noteText` : ce que disent les valeurs, sous la liste.
  let state = null;
  let opening = false; // vrai pendant la fenêtre de choix de la clé qui peut précéder celle-ci
  let valuesGeneration = 0;

  const isOpen = () => opening || !!state;
  const sameHops = (a, b) => a.length === b.length && a.every((hop, i) => hop === b[i]);

  // Nombre de colonnes Référence simples de la page qui désignent `table`. Une liste de références n'en compte pas : un lien ne la suit pas
  // (GristAPI.findReferenceColumns).
  function pageReferencesTo(table) {
    const page = GristAPI.getCurrentTableId();
    return GristAPI.getColumns(page).filter(column => {
      const ref = GristAPI.referenceOf(GristAPI.getColumnType(page, column));
      return !!ref && !ref.list && ref.table === table;
    }).length;
  }

  // D'où la fenêtre part, ou null si elle n'a pas de sens ici : { base, hops, refColumn, minHops }.
  //  - variable d'une autre table que celle de la page : sa table, liée par sa règle ; sur une colonne Référence (éventuellement au bout d'un
  //    chemin), le niveau de la ligne qu'elle désigne - « l'élément le plus bas » -, d'où l'on peut remonter à celui de la table de la variable ;
  //  - colonne Référence de la page (ex. #Dossiers.Responsable) : la table référencée, liée par cette colonne (`refColumn`). Sauf si la page a
  //    plusieurs Références vers cette même table (ex. Demandeur et Valideur vers l'Annuaire, deux personnes dans la même ligne) : un lien, un seul
  //    par table, n'en suivrait qu'une. La fenêtre part alors de la colonne cliquée, comme pour une bulle déjà en chemin (ci-dessous), sans créer de
  //    lien : #Dossiers.Valideur.Email lit la personne de Valideur, #Dossiers.Demandeur.Email celle de Demandeur ;
  //  - bulle de la table de la page déjà en chemin (ex. #Projet.Accompagnateur.Email dans un widget sur Projet) : ses niveaux, sans remonter aux
  //    colonnes ordinaires de la page (`minHops` 1), qui ne sont pas des attributs d'une autre ligne ;
  //  - colonne Liste de références de la page (ex. #Dossiers.Destinataires) : la fenêtre part de la colonne cliquée, comme avec plusieurs Références vers
  //    une même table, sans lien (un lien ne suit qu'une ligne) ; ses colonnes se lisent sur toutes les lignes de la liste. Une liste de références vers
  //    la page elle-même se lit de la même façon.
  // Null pour une colonne ordinaire de la page ou une référence simple vers la page elle-même.
  function targetFor(attrs) {
    if (!attrs.table || !attrs.column) return null;
    const currentTableId = GristAPI.getCurrentTableId();
    const parts = String(attrs.column).split('.');
    const end = GristAPI.resolveColumnPath(attrs.table, attrs.column);
    const ref = end && GristAPI.referenceOf(end.type);
    const onPage = attrs.table === currentTableId;
    let found = null;
    if (!onPage || parts.length > 1) {
      found = { base: attrs.table, hops: ref ? parts : parts.slice(0, -1), refColumn: null, minHops: onPage ? 1 : 0 };
    } else if (ref && ref.list) {
      found = { base: currentTableId, hops: [attrs.column], refColumn: null, minHops: 1 };
    } else if (ref && ref.table !== currentTableId) {
      found = pageReferencesTo(ref.table) > 1
        ? { base: currentTableId, hops: [attrs.column], refColumn: null, minHops: 1 }
        : { base: ref.table, hops: [], refColumn: attrs.column, minHops: 0 };
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
      try { await GristAPI.saveLinkRule(target, { mode: 'match', colonneCible: 'id', colonneSource: refColumn }); }
      catch (e) {
        if (GristAPI.isTablesDeclined(e)) return false; // la personne refuse de créer la table des règles : comme une annulation
        throw e;
      }
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
    // Choisir une colonne : un double-clic sur sa ligne la choisit d'un coup, comme un clic dans une liste (le premier clic l'a sélectionnée).
    list.addEventListener('dblclick', event => {
      if (!state || !state.pick || (event.target.closest && event.target.closest('.var-linked-descend'))) return;
      const row = event.target.closest && event.target.closest('.var-linked-row');
      const box = row && row.querySelector('input');
      if (!box || box.disabled) return;
      box.checked = true;
      onPickChange({ target: box });
      confirmPick();
    });
    cancelBtn.addEventListener('click', close);
    replaceBtn.addEventListener('click', replace);
    insertBtn.addEventListener('click', () => (state && state.pick ? confirmPick() : insert()));
  }

  // Cases cochées : gardées dans `state.picks` (et non lues dans la liste) pour survivre à un changement de niveau. Pour le choix d'une colonne, une seule
  // reste : celle qu'on vient de sélectionner (la case ronde décoche l'autre dans la liste affichée, `picks` doit suivre aussi celle d'un autre niveau).
  const pickIndex = (hops, col) => state.picks.findIndex(p => p.col === col && sameHops(p.hops, hops));
  function onPickChange(event) {
    const box = event.target;
    if (!state || !box || (box.type !== 'checkbox' && box.type !== 'radio')) return;
    if (state.pick) {
      if (box.checked) state.picks = [{ hops: state.hops.slice(), col: box.value }];
      syncActionButtons();
      return;
    }
    const index = pickIndex(state.hops, box.value);
    if (box.checked && index === -1) state.picks.push({ hops: state.hops.slice(), col: box.value });
    else if (!box.checked && index !== -1) state.picks.splice(index, 1);
    syncActionButtons();
  }
  // « Insérer » dit combien d'attributs il pose ; lui et « Remplacer » restent grisés tant que rien n'est coché. Pour le choix d'une colonne, « Choisir » reste
  // grisé tant qu'aucune n'est sélectionnée, et la ligne sous la liste dit laquelle l'est.
  function syncActionButtons() {
    const count = state ? state.picks.length : 0;
    if (state && state.pick) {
      refs.insertBtn.textContent = I18n.t('varLinked.pick');
      refs.insertBtn.disabled = count === 0;
      renderNote();
      return;
    }
    refs.insertBtn.textContent = I18n.t('varLinked.insert', { count });
    refs.insertBtn.disabled = count === 0;
    refs.replaceBtn.disabled = count === 0;
  }
  // La colonne choisie, dite comme le fil d'Ariane : « Accompagnateur › Email » (espaces insécables : la ligne ne se coupe pas au milieu du chemin).
  const pickedText = pick => pick.hops.concat(pick.col).join('\u00a0›\u00a0');
  // La ligne sous la liste : ce que disent les valeurs (`state.noteText`), puis ce que fait le bouton - « Insérer » ajoute les attributs cochés... ; pour le choix
  // d'une colonne, la colonne choisie ou comment la choisir. `state.noteBare` : sans cette seconde phrase (le calcul des valeurs est en cours).
  function renderNote() {
    if (!state) return;
    const [picked] = state.picks;
    const tail = state.noteBare ? '' : state.pick ? I18n.t(picked ? 'varLinked.pickChosen' : 'varLinked.pickHint', picked ? { column: pickedText(picked) } : undefined) : I18n.t('varLinked.noteInsert');
    refs.note.textContent = (state.noteText + ' ' + tail).trim();
  }
  function setNote(text, bare) {
    state.noteText = text;
    state.noteBare = !!bare;
    renderNote();
  }
  // Le filtre cherche comme toutes les listes de colonnes (js/search-select.js:nameMatcher) : des mots dans n'importe quel ordre, dans les noms de la
  // colonne (table, identifiant, libellé Grist) et dans la valeur affichée en face.
  function applyFilter() {
    const matches = SearchSelect.nameMatcher(refs.filter.value);
    let visible = 0;
    refs.list.querySelectorAll('.var-linked-row').forEach(row => {
      row.hidden = !matches(row.dataset.search, row.dataset.value || '');
      if (!row.hidden) visible += 1;
    });
    const noMatch = refs.list.querySelector('.var-linked-empty[data-role="no-match"]');
    if (noMatch) noMatch.hidden = visible !== 0;
  }

  // Table du niveau affiché, et la variable sous la forme « #Projet.Accompagnateur » qui y mène (les niveaux de la fenêtre se nomment comme les
  // bulles).
  const levelTable = () => GristAPI.tableAtEndOf(state.base, state.hops) || state.base;
  const pathText = () => Variables.triggerChar() + [state.base].concat(state.hops).join('.');
  // Le chemin affiché traverse-t-il une liste de références ? Alors il désigne plusieurs lignes, et les valeurs de la fenêtre sont celles de toutes.
  const crossesList = () => !!Variables.crossedListTable(state.base, state.hops);

  // Une colonne du niveau affiché : sa case, son nom, sa valeur (posée par loadValues) et, pour une Référence, la flèche qui descend dans sa table.
  // `isCurrent` : la colonne de la bulle d'origine, montrée mais pas cochable.
  function columnRow(table, col, isCurrent) {
    const row = el('div', isCurrent ? 'var-linked-row is-current' : 'var-linked-row');
    row.dataset.col = col;
    row.dataset.search = Variables.columnSearchText(table, col);
    const box = el('input');
    box.type = state.pick ? 'radio' : 'checkbox';
    if (state.pick) box.name = 'var-linked-pick';
    box.value = col;
    box.disabled = isCurrent;
    box.checked = !isCurrent && pickIndex(state.hops, col) !== -1;
    const name = el('span', 'var-linked-col', col);
    if (isCurrent) name.append(' ', el('small', null, I18n.t('varLinked.thisVariable')));
    const pick = el('label', 'var-linked-pick');
    pick.append(box, name, el('span', 'var-linked-value'));
    row.appendChild(pick);
    // La table que désigne une Référence simple (celle qu'ouvre la flèche de sa ligne) : la même destination que la flèche des listes de colonnes.
    const target = Variables.referencedTable(table, col);
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
    // La colonne de la bulle d'origine, montrée mais pas cochable ; le choix d'une colonne n'a pas de bulle d'origine : toutes se sélectionnent.
    const own = node ? String(node.attrs.column).split('.') : [];
    const currentCol = node && node.attrs.table === base && sameHops(own.slice(0, -1), hops) ? own[own.length - 1] : null;
    list.replaceChildren();
    if (!cols.some(c => c !== currentCol)) list.appendChild(el('div', 'var-linked-empty', I18n.t(state.pick ? 'varLinked.pickEmpty' : 'varLinked.empty', { table })));
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
    const { list } = refs;
    const { base, hops } = state;
    const table = levelTable();
    const currentTableId = GristAPI.getCurrentTableId();
    const record = GristAPI.getCurrentRecord();
    if (!record || !currentTableId) { setNote(I18n.t('varLinked.noteNoRecord')); return; }
    setNote(I18n.t('varCond.debug.computing'), true);
    let rows = [];
    try {
      const found = await Variables.resolveRows(base, hops, currentTableId, record);
      rows = (found.rows || []).filter(Boolean);
    } catch (e) { console.warn('[VariableLinkedAttrs] valeurs indisponibles', e); }
    if (gen !== valuesGeneration || !state) return;
    if (!rows.length) {
      const missing = hops.length ? I18n.t('varLinked.noteNoPathRow', { path: pathText(), id: record.id }) : I18n.t('varLinked.noteNoLinkedRow', { table, id: record.id });
      setNote(missing);
      return;
    }
    list.querySelectorAll('.var-linked-row').forEach(row => {
      const text = displayValue(table, rows, row.dataset.col);
      row.querySelector('.var-linked-value').textContent = text;
      row.title = text;
      row.dataset.value = text;
    });
    applyFilter();
    setNote(I18n.t('varLinked.noteRow', { id: record.id }));
  }

  function subtitleText() {
    const { node, base, hops, refColumn } = state;
    if (hops.length) return I18n.t(crossesList() ? 'varLinked.subtitleList' : 'varLinked.subtitlePath', { table: levelTable(), path: pathText() });
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

  // Affiche le niveau `state.hops` : titre, fil d'Ariane, colonnes puis valeurs. Le choix d'une colonne n'a pas de sous-titre (il dirait comment les attributs
  // s'insèrent) : le fil d'Ariane dit où l'on est, la ligne sous la liste ce qu'on a choisi.
  function renderLevel() {
    const { title, subtitle, filter } = refs;
    title.textContent = I18n.t(state.pick ? 'varLinked.pickTitle' : 'varLinked.title', { table: levelTable() });
    subtitle.textContent = state.pick ? '' : subtitleText();
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
  // si « Reprendre la condition d'affichage » est décochée. Le réglage « Liste » (js/variable-list.js : le séparateur, la première, la dernière) reste
  // tant que la bulle écrit une liste : l'email de chaque ligne d'une équipe garde le point-virgule réglé sur la colonne Liste de références. Une
  // seule transaction : un seul Annuler rend l'ancienne bulle. La bulle reste sélectionnée, sa barre revient avec les réglages de sa nouvelle colonne.
  function replace() {
    if (!state || !state.picks.length) return;
    const { editor, pos } = state;
    const node = originalBadge();
    if (!node) return;
    const [first, ...others] = orderedPicks();
    const attrs = Object.assign({}, node.attrs, pickAttrs(first));
    // Sans condition, le sinon (js/variable-otherwise.js) n'a plus rien à remplacer.
    if (!refs.inheritRow.hidden && !refs.inheritBox.checked) { attrs.condition = null; attrs.otherwise = null; }
    const oldKind = VariableFormat.columnKind(GristAPI.getColumnType(node.attrs.table, node.attrs.column));
    if (!oldKind || oldKind !== VariableFormat.columnKind(GristAPI.getColumnType(attrs.table, attrs.column))) {
      const list = node.attrs.format && node.attrs.format.list;
      attrs.format = list && Variables.writesList(attrs.table, attrs.column) ? { list } : null;
    }
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
    const choosing = state && state.pick;
    win.hide();
    state = null;
    valuesGeneration += 1;
    if (editor && !(opts && opts.keepFocus)) editor.view.focus();
    // Le choix d'une colonne : celui qui attend la reçoit une fois la fenêtre fermée, ou null (Annuler, Échap) ; le focus lui revient, pas à l'éditeur.
    if (choosing) choosing.resolve(choosing.result);
  }

  // « Choisir » : la colonne sélectionnée part à celui qui a ouvert la fenêtre pour choisir une colonne, avec les Références suivies pour l'atteindre.
  function confirmPick() {
    if (!state || !state.pick || !state.picks.length) return;
    const [picked] = state.picks;
    state.pick.result = { base: state.base, hops: picked.hops.slice(), column: picked.col };
    close();
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
    state = { editor, pos, node, base: t.base, refColumn: t.refColumn, minHops: t.minHops, hops: t.hops.slice(), picks: [], pick: null, noteText: '', noteBare: false };
    const { filter, cancelBtn, replaceBtn, subtitle } = refs;
    filter.placeholder = I18n.t('varLinked.filter');
    filter.setAttribute('aria-label', I18n.t('varLinked.filter'));
    cancelBtn.textContent = I18n.t('common.cancel');
    // Les éléments que le choix d'une colonne (pickColumn) cache ou change : remis comme pour une bulle.
    subtitle.hidden = false;
    replaceBtn.hidden = false;
    replaceBtn.textContent = I18n.t('varLinked.replace');
    replaceBtn.title = I18n.t('varLinked.replaceTitle', { badge: VariableModal.badgeText(node) });
    renderInheritOption();
    renderLevel();
    win.show(filter);
  }

  // Le niveau de la liste où est la colonne déjà choisie : elle est sélectionnée d'avance, et amenée dans la partie visible de la liste.
  function revealPick() {
    const { list } = refs;
    const box = list.querySelector('.var-linked-row input:checked');
    const line = box && box.closest('.var-linked-row');
    if (!line || line.hidden) return;
    const shift = line.getBoundingClientRect().top - list.getBoundingClientRect().top;
    list.scrollTop = Math.max(0, list.scrollTop + shift - Math.round((list.clientHeight - line.offsetHeight) / 2));
  }

  // Choisir UNE colonne d'une table ou, de Référence en Référence, d'une table qu'elle désigne : ce que fait le champ d'une colonne de règle de condition
  // (js/condition-fields.js) quand on y ouvre la fenêtre des attributs. `request` : { base (la table d'où partent les chemins : celle de la page par défaut, ou la
  // table liée de la colonne déjà choisie), hops (les colonnes Référence déjà suivies depuis elle : le niveau où la fenêtre s'ouvre), column (la colonne déjà
  // choisie à ce niveau, sélectionnée d'avance), query (ce qui était tapé dans la liste, repris dans le filtre) }. Rend { base, hops, column } - la table de départ,
  // les Références suivies puis la colonne choisie - ou null quand la fenêtre se ferme sans choix. Une table inconnue (colonne disparue) ne dit rien : la fenêtre
  // s'ouvre sur la table de la page. Rien n'est posé ici : ni bulle, ni lien de table ; celui qui a demandé pose le choix.
  function pickColumn(request) {
    const page = GristAPI.getCurrentTableId();
    if (!page || opening || state) return Promise.resolve(null);
    const known = !(request && request.base) || GristAPI.getTables().indexOf(request.base) !== -1;
    const asked = known ? (request || {}) : { query: request.query };
    const base = asked.base || page;
    const hops = GristAPI.tableAtEndOf(base, asked.hops || []) ? (asked.hops || []).slice() : [];
    const column = asked.column && GristAPI.getVisibleColumns(GristAPI.tableAtEndOf(base, hops)).indexOf(asked.column) !== -1 ? asked.column : '';
    return new Promise(resolve => {
      ensureModal();
      state = {
        editor: null, pos: null, node: null, base, refColumn: null, minHops: 0, hops, picks: column ? [{ hops: hops.slice(), col: column }] : [],
        pick: { resolve, result: null }, noteText: '', noteBare: false,
      };
      const { filter, cancelBtn, replaceBtn, subtitle, inheritRow } = refs;
      filter.placeholder = I18n.t('varLinked.filter');
      filter.setAttribute('aria-label', I18n.t('varLinked.filter'));
      cancelBtn.textContent = I18n.t('common.cancel');
      subtitle.hidden = true;
      inheritRow.hidden = true;
      replaceBtn.hidden = true;
      renderLevel();
      filter.value = asked.query || '';
      applyFilter();
      win.show(filter);
      revealPick();
    });
  }

  return { open, pickColumn, close, isOpen, isAvailable };
})();
