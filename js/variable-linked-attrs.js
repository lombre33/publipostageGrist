// Fenêtre « Autres attributs » d'une bulle #Variable : depuis une variable dont la ligne est déterminée dans une autre table (ex.
// #Annuaire.NomPrenom, trouvée via Dossiers.Responsable), insère d'autres colonnes de la même ligne (ex. Annuaire.Telephone) juste après elle,
// séparées par une espace. Les bulles insérées sont des #Variable ordinaires de cette table : elles passent par la même règle de liaison (une par
// table liée et par table de la page, Publipostage_TableLinks), donc désignent la même ligne, en lecture comme à l'export. Proposée pour :
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
// Ligne suivante ou précédente : un volet sous le fil d'Ariane (replié, sauf pour une colonne ordinaire de la page, où la fenêtre s'ouvre d'ailleurs aussi : c'est ce qu'elle
// y ajoute) règle un maillon « +1(Date;Cycle) » (GristAPI.stepOf : le sens et le rang, la colonne qui range les lignes, la colonne de groupe facultative) et « Aller à cette
// ligne » l'ajoute au chemin. Le niveau d'après montre les colonnes de la ligne voisine, avec leurs valeurs pour la ligne sélectionnée ; « Insérer » et « Remplacer » posent
// des bulles dont le chemin porte le maillon (#Instances.+1(Date;Cycle).Titre), lues par Variables.resolveRows comme n'importe quel chemin. La dernière colonne d'ordre et de
// groupe réglée pour une table est reprise à l'ouverture suivante. Ni sur une pastille (elle désigne une ligne précise), ni pour le choix d'une colonne.
//
// Quand la variable d'origine a une condition d'affichage, chaque bulle insérée la reprend par défaut, en copie : « Reprendre la condition
// d'affichage », décochée, les insère sans. « Remplacer », à côté d'« Insérer », met les attributs cochés à la place de la bulle au lieu de les
// ajouter après elle : c'est la même bulle dont la colonne change, ses réglages restent (EditorCore.patchNodeAndReselect, setNodeMarkup).
//
// Une pastille « @ » (js/mention.js) a la même fenêtre, ouverte par le bouton de sa barre flottante (js/floating-toolbars.js:createMentionToolbar) : les colonnes de SA fiche - la
// ligne n° `row` de sa table, quelle que soit la ligne que la page affiche -, chacune avec le texte que la pastille écrirait. « Remplacer » change la colonne que la pastille lit
// (c'est la même pastille : sa mise en forme reste, son nom devient celui de la nouvelle colonne), « Insérer » en cite d'autres à la suite, séparées par une espace. Ni lien de
// table, ni condition, ni flèche vers une autre table : une pastille désigne une ligne précise. Une colonne vide pour cette fiche, ou une pièce jointe, se montre mais ne se coche pas.
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
  // { editor, pos, node, base, refColumn, minHops, hops, picks, pick, mention } pendant que la fenêtre est ouverte. `base` : table dont partent les chemins ;
  // `hops` : colonnes Référence suivies depuis elle jusqu'au niveau affiché (vide : les colonnes de `base` elle-même) ; `picks` : cases cochées,
  // { hops, col }, dans l'ordre du choix. `pick` : { resolve, result } quand la fenêtre sert à choisir une colonne (pickColumn) - `editor`, `pos` et
  // `node` sont alors null et `picks` ne garde qu'une colonne -, null pour « Autres attributs » d'une bulle. `mention` : { row, labels } quand la fenêtre est ouverte sur une
  // pastille « @ » - `node` est la pastille, `row` la ligne de sa fiche (dans `base`, sa table), `labels` la colonne → texte que la pastille écrirait, posée quand la table est lue
  // (null avant, et si elle ne se lit pas ou que la fiche n'existe plus : aucune case ne se coche alors) -, null sinon. `noteText` : ce que disent les valeurs, sous la liste.
  let state = null;
  let opening = false; // vrai pendant la fenêtre de choix de la clé qui peut précéder celle-ci
  let valuesGeneration = 0;

  const isOpen = () => opening || !!state;
  const sameHops = (a, b) => a.length === b.length && a.every((hop, i) => hop === b[i]);

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
  // Pour une colonne ordinaire de la page ou une référence simple vers la page elle-même : sa propre table, `sameRow`, d'où la fenêtre ne propose que la ligne
  // suivante ou précédente et les autres colonnes de la même ligne. Null seulement sans table ni colonne, ou quand le chemin de la variable est cassé.
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
      found = Variables.pageReferencesTo(ref.table) > 1
        ? { base: currentTableId, hops: [attrs.column], refColumn: null, minHops: 1 }
        : { base: ref.table, hops: [], refColumn: attrs.column, minHops: 0 };
    }
    // Une colonne ordinaire de la page, ou une Référence vers la page elle-même : rien d'« autre attribut » d'une autre ligne à montrer, mais la ligne suivante ou
    // précédente (« Ligne suivante ou précédente ») se cherche aussi dans sa propre table. `sameRow` : la fenêtre ouvre ce volet d'emblée.
    if (!found) found = { base: attrs.table, hops: [], refColumn: null, minHops: 0, sameRow: true };
    return GristAPI.tableAtEndOf(found.base, found.hops) ? found : null;
  }
  const isAvailable = attrs => !!targetFor(attrs);

  // Une règle de liaison doit exister pour que les bulles insérées trouvent la ligne. Colonne Référence de la page sans règle : règle créée d'office
  // pour la table de la page (identifiant de ligne = cette colonne, celle que la fenêtre de choix de la clé proposerait d'elle-même). Autre table sans
  // règle : la fenêtre de choix de la clé, comme à l'insertion. Faux si l'utilisateur annule. La règle posée d'office est un pas de l'historique d'Annuler
  // (js/link-rule-history.js), comme celle que la fenêtre enregistre.
  async function ensureLink(target, refColumn) {
    const currentTableId = GristAPI.getCurrentTableId();
    if (!currentTableId || GristAPI.getLinkRule(target)) return true;
    if (refColumn) {
      try { await LinkRuleHistory.track(target, () => GristAPI.saveLinkRule(target, { mode: 'match', colonneCible: 'id', colonneSource: refColumn, tableSource: currentTableId })); }
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
    // « Ligne suivante ou précédente » : replié, sauf pour une colonne ordinaire de la page, où c'est tout ce que la fenêtre ajoute (cf. showFor). Le maillon
    // s'ajoute au chemin (GristAPI.stepToken) : le niveau d'après montre les colonnes de cette ligne-là, que « Insérer » et « Remplacer » posent comme à tout niveau.
    const stepBox = el('details', 'var-linked-step');
    const stepTitle = el('summary', 'var-linked-step-title');
    const stepWhich = el('div', 'var-linked-step-line');
    const stepDirection = el('select', 'var-linked-step-direction');
    const stepRank = el('input', 'var-linked-step-rank');
    stepRank.type = 'number';
    stepRank.min = '1';
    stepRank.max = '99';
    stepRank.step = '1';
    const stepOrder = el('select', 'var-linked-step-order');
    const stepGroup = el('select', 'var-linked-step-group');
    const stepGo = button('var-linked-step-go');
    const stepExists = button('var-linked-step-exists');
    stepExists.hidden = true; // seulement pour le choix d'une colonne de règle de condition (cf. pickColumn)
    const stepHint = el('p', 'var-linked-step-hint');
    const labelled = (text, control) => { const wrap = el('label', 'var-linked-step-field'); wrap.append(el('span', null, text), control); return wrap; };
    stepTitle.textContent = I18n.t('varLinked.stepTitle');
    stepHint.textContent = I18n.t('varLinked.stepHint');
    [['after', 'varLinked.stepAfter'], ['before', 'varLinked.stepBefore'], ['first', 'varLinked.stepFirst'], ['last', 'varLinked.stepLast']].forEach(([value, key]) => { const option = el('option', null, I18n.t(key)); option.value = value; stepDirection.appendChild(option); });
    stepRank.value = '1';
    stepRank.title = I18n.t('varLinked.stepRankTitle');
    stepGo.textContent = I18n.t('varLinked.stepGo');
    stepExists.title = I18n.t('varLinked.stepExistsTitle');
    stepWhich.append(labelled(I18n.t('varLinked.stepWhich'), stepDirection), labelled(I18n.t('varLinked.stepRank'), stepRank), labelled(I18n.t('varLinked.stepOrder'), stepOrder));
    const stepWho = el('div', 'var-linked-step-line');
    stepWho.append(labelled(I18n.t('varLinked.stepGroup'), stepGroup), stepGo, stepExists);
    stepBox.append(stepTitle, stepWhich, stepWho, stepHint);
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
    win.body.append(subtitle, inheritRow, path, stepBox, filter, list, note);
    refs = {
      title: win.title, subtitle, path, filter, list, note, inheritRow, inheritBox, inheritText, inheritSummary, cancelBtn, replaceBtn, insertBtn,
      stepBox, stepDirection, stepRank, stepOrder, stepGroup, stepGo, stepExists, stepHint,
    };

    filter.addEventListener('input', applyFilter);
    stepGo.addEventListener('click', goToStep);
    stepExists.addEventListener('click', pickExists);
    stepOrder.addEventListener('change', syncStepButton);
    stepDirection.addEventListener('change', syncStepRank);
    stepRank.addEventListener('keydown', event => { if (event.key === 'Enter' && !stepGo.disabled) { event.preventDefault(); goToStep(); } });
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
    replaceBtn.addEventListener('click', () => (state && state.mention ? replaceMention() : replace()));
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
  // « Insérer » dit combien de colonnes il pose (juste « Insérer » tant qu'aucune n'est cochée) ; lui et « Remplacer » restent grisés tant que rien n'est coché. Pour le choix d'une colonne, « Choisir » reste
  // grisé tant qu'aucune n'est sélectionnée, et la ligne sous la liste dit laquelle l'est.
  function syncActionButtons() {
    const count = state ? state.picks.length : 0;
    if (state && state.pick) {
      refs.insertBtn.textContent = I18n.t('varLinked.pick');
      refs.insertBtn.disabled = count === 0;
      renderNote();
      return;
    }
    // Rien de coché : le bouton, grisé, dit « Insérer » - « Insérer 0 colonne » ne dit rien qu'on puisse faire.
    refs.insertBtn.textContent = count ? I18n.t('varLinked.insert', { count }) : I18n.t('varLinked.insertNone');
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
    const tail = state.noteBare ? '' : state.pick ? I18n.t(picked ? 'varLinked.pickChosen' : 'varLinked.pickHint', picked ? { column: pickedText(picked) } : undefined)
      : I18n.t(state.mention ? 'varLinked.noteInsertMention' : 'varLinked.noteInsert');
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
  // `isCurrent` : la colonne de la bulle d'origine, montrée mais pas cochable. Sur une pastille, la case reste grisée tant que la table de sa fiche n'est pas lue
  // (loadMentionValues la dégrise si le texte de la fiche dans cette colonne s'écrit) et la colonne n'a pas de flèche : une pastille désigne une ligne, pas un chemin.
  function columnRow(table, col, isCurrent) {
    const row = el('div', isCurrent ? 'var-linked-row is-current' : 'var-linked-row');
    row.dataset.col = col;
    row.dataset.search = Variables.columnSearchText(table, col);
    const box = el('input');
    box.type = state.pick ? 'radio' : 'checkbox';
    if (state.pick) box.name = 'var-linked-pick';
    box.value = col;
    box.disabled = isCurrent || !!state.mention;
    box.checked = !isCurrent && pickIndex(state.hops, col) !== -1;
    const name = el('span', 'var-linked-col', col);
    if (isCurrent) name.append(' ', el('small', null, I18n.t(state.mention ? 'varLinked.thisMention' : 'varLinked.thisVariable')));
    const pick = el('label', 'var-linked-pick');
    pick.append(box, name, el('span', 'var-linked-value'));
    row.appendChild(pick);
    // La table que désigne une Référence simple (celle qu'ouvre la flèche de sa ligne) : la même destination que la flèche des listes de colonnes.
    const target = state.mention ? null : Variables.referencedTable(table, col);
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
    const own = !node ? [] : state.mention ? (node.attrs.step ? [node.attrs.step, node.attrs.column] : [node.attrs.column]) : String(node.attrs.column).split('.');
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
    if (state.mention) { loadMentionValues(); return; }
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

  // Sur une pastille : les valeurs de SA ligne (Mention.valuesOf), jamais celles de la ligne que la page affiche - ce que la pastille écrirait dans chaque colonne. Une colonne dont le
  // texte est vide pour cette fiche, ou une pièce jointe, se montre mais reste grisée, sa raison en info-bulle ; la colonne de la pastille aussi (c'est déjà elle). Les cases sont
  // grisées tant que la table n'est pas lue, et le restent si elle ne se lit pas ou que la fiche n'existe plus : rien ne se pose sans le texte qu'écrira la pastille.
  async function loadMentionValues() {
    const gen = ++valuesGeneration;
    const { list } = refs;
    const { base, mention } = state;
    setNote(I18n.t('varCond.debug.computing'), true);
    let found = null;
    try { found = await Mention.valuesOf(base, mention.row, mentionStep()); } catch (e) { console.warn('[VariableLinkedAttrs] fiche illisible', e); }
    if (gen !== valuesGeneration || !state) return;
    if (!found || found.gone || found.none) {
      list.querySelectorAll('.var-linked-row').forEach(row => row.classList.add('is-unavailable'));
      setNote(I18n.t(!found ? 'varLinked.noteMentionUnreadable' : found.none ? 'varLinked.noteMentionNone' : 'varLinked.noteMentionGone', { table: base }));
      return;
    }
    mention.labels = found.labels;
    list.querySelectorAll('.var-linked-row').forEach(row => {
      const col = row.dataset.col;
      const attachment = GristAPI.getColumnType(base, col) === 'Attachments';
      const text = attachment ? I18n.t('varLinked.attachmentValue') : (found.labels.get(col) || '');
      const isCurrent = row.classList.contains('is-current');
      const reason = attachment ? 'varLinked.mentionAttachment' : (text === '' && !isCurrent ? 'varLinked.mentionEmpty' : '');
      row.querySelector('.var-linked-value').textContent = text;
      row.title = reason ? I18n.t(reason) : text;
      row.dataset.value = text;
      row.classList.toggle('is-unavailable', !!reason);
      if (!isCurrent) row.querySelector('input').disabled = !!reason;
    });
    applyFilter();
    setNote(I18n.t('varLinked.noteMentionRow'));
  }

  function subtitleText() {
    const { node, base, hops, refColumn } = state;
    if (state.mention) {
      const jump = GristAPI.stepOf(mentionStep());
      if (jump && jump.edge) return I18n.t('varLinked.subtitleMentionEdge', { which: I18n.t(jump.edge === 'first' ? 'varLinked.edgeFirst' : 'varLinked.edgeLast'), id: state.mention.row, table: base, order: jump.order });
      if (jump) return I18n.t('varLinked.subtitleMentionStep', { which: I18n.t(jump.offset < 0 ? 'varLinked.stepBefore' : 'varLinked.stepAfter'), rank: Math.abs(jump.offset), id: state.mention.row, table: base, order: jump.order });
      return I18n.t('varLinked.subtitleMention', { badge: Mention.chipText(node.attrs), id: state.mention.row, table: base });
    }
    if (hops.length) return I18n.t(crossesList() ? 'varLinked.subtitleList' : 'varLinked.subtitlePath', { table: levelTable(), path: pathText() });
    const currentTableId = GristAPI.getCurrentTableId();
    const badge = VariableModal.badgeText(node);
    const rule = GristAPI.getLinkRule(base);
    if (!rule || !currentTableId) return I18n.t('varLinked.subtitlePlain', { badge });
    if (rule.mode === 'singleton') return I18n.t('varLinked.subtitleSingleton', { badge, table: base });
    const via = Variables.describeLinkVia(base, rule, currentTableId);
    // Colonne Référence déjà couverte par une autre règle pour la même table et la même page : les bulles insérées suivront cette règle-là, le dire
    // plutôt que d'annoncer « même ligne que » à tort.
    if (refColumn && !(rule.colonneCible === 'id' && rule.colonneSource === refColumn)) return I18n.t('varLinked.subtitleOtherLink', { table: base, page: currentTableId, via, badge });
    return I18n.t('varLinked.subtitleVia', { badge, via });
  }

  // Ce que la personne a réglé la dernière fois pour une table - colonne d'ordre et colonne de groupe -, pour ne pas le refaire à chaque ligne voisine : de la
  // fenêtre à la suivante, tant que la page reste ouverte.
  const lastSeries = {};
  function fillSelect(select, options, value) {
    select.replaceChildren(...options.map(({ value: v, text }) => { const option = el('option', null, text); option.value = v; return option; }));
    select.value = value;
  }
  // « Aller à cette ligne » ne se propose que quand la colonne d'ordre est choisie.
  function syncStepButton() {
    refs.stepGo.disabled = !refs.stepOrder.value;
    syncStepExists();
  }
  // Le rang ne dit rien pour « première » ni « dernière » de la série : le champ se grise.
  function syncStepRank() {
    refs.stepRank.disabled = refs.stepDirection.value === 'first' || refs.stepDirection.value === 'last';
    syncStepExists();
  }
  // « Y a-t-il une suivante ? » (ou une précédente) : pour une suivante ou une précédente seulement, et une fois la colonne d'ordre choisie.
  function syncStepExists() {
    const { stepExists, stepDirection, stepOrder } = refs;
    const edge = stepDirection.value === 'first' || stepDirection.value === 'last';
    stepExists.textContent = I18n.t(stepDirection.value === 'before' ? 'varLinked.stepExistsBefore' : 'varLinked.stepExistsAfter');
    stepExists.disabled = edge || !stepOrder.value;
  }
  // Le volet « Ligne suivante ou précédente » du niveau affiché : les colonnes de sa table pour l'ordre et le groupe (une pièce jointe ne range rien). Sur une bulle, pour le choix
  // d'une colonne (une règle de condition : le chemin choisi porte le maillon) et sur une pastille « @ » (elle cite alors la fiche voisine de la sienne).
  function renderStepBox() {
    const { stepOrder, stepGroup, stepHint } = refs;
    stepHint.textContent = I18n.t(state.mention ? 'varLinked.stepHintMention' : 'varLinked.stepHint');
    const table = levelTable();
    const columns = GristAPI.getVisibleColumns(table).filter(col => GristAPI.getColumnType(table, col) !== 'Attachments');
    const last = lastSeries[table] || {};
    const columnOptions = columns.map(col => ({ value: col, text: col }));
    fillSelect(stepOrder, [{ value: '', text: I18n.t('varLinked.stepOrderNone') }].concat(columnOptions), columns.indexOf(last.order) !== -1 ? last.order : '');
    fillSelect(stepGroup, [{ value: '', text: I18n.t('varLinked.stepGroupNone') }].concat(columnOptions), columns.indexOf(last.group) !== -1 ? last.group : '');
    syncStepButton();
  }
  // « Y a-t-il une suivante ? » : le choix d'une colonne se fait ici d'un coup, la colonne d'ordre de la ligne voisine avec « non vide » - la condition est vraie quand
  // cette ligne existe (une ligne sans valeur d'ordre est hors série : la colonne d'ordre de la voisine n'est vide que si la voisine n'existe pas).
  function pickExists() {
    if (!state || !state.pick || !refs.stepOrder.value || refs.stepExists.disabled) return;
    const { stepDirection, stepRank, stepOrder, stepGroup } = refs;
    const rank = Math.max(1, Math.min(99, Math.round(Number(stepRank.value)) || 1));
    lastSeries[levelTable()] = { order: stepOrder.value, group: stepGroup.value };
    const token = GristAPI.stepToken(stepDirection.value === 'before' ? -rank : rank, stepOrder.value, stepGroup.value);
    state.pick.result = { base: state.base, hops: state.hops.concat(token), column: stepOrder.value, operator: 'non vide' };
    close();
  }
  // Le maillon réglé (sens, rang, colonne d'ordre, groupe) rejoint le chemin : le niveau d'après montre les colonnes de la ligne voisine, avec leur valeur.
  function goToStep() {
    if (!state || !refs.stepOrder.value) return;
    const { stepDirection, stepRank, stepOrder, stepGroup, stepBox } = refs;
    const rank = Math.max(1, Math.min(99, Math.round(Number(stepRank.value)) || 1));
    lastSeries[levelTable()] = { order: stepOrder.value, group: stepGroup.value };
    const edge = stepDirection.value === 'first' || stepDirection.value === 'last' ? stepDirection.value : '';
    const token = GristAPI.stepToken(stepDirection.value === 'before' ? -rank : rank, stepOrder.value, stepGroup.value, edge);
    stepBox.open = false;
    // Une pastille cite UNE fiche voisine de la sienne : le maillon remplace celui d'avant, il ne s'y ajoute pas.
    goTo(state.mention ? [token] : state.hops.concat(token));
  }

  // Affiche le niveau `state.hops` : titre, fil d'Ariane, colonnes puis valeurs. Le choix d'une colonne n'a pas de sous-titre (il dirait comment les attributs
  // s'insèrent) : le fil d'Ariane dit où l'on est, la ligne sous la liste ce qu'on a choisi.
  function renderLevel() {
    const { title, subtitle, filter } = refs;
    title.textContent = I18n.t(state.pick ? 'varLinked.pickTitle' : 'varLinked.title', { table: levelTable() });
    subtitle.textContent = state.pick ? '' : subtitleText();
    filter.value = '';
    renderPath();
    renderStepBox();
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
    const node = VariableModal.nodeAtOrigin(state, state.mention ? 'varLinked.insertLostMention' : 'varLinked.insertLost', 'VariableLinkedAttrs');
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
  // Le nœud de l'image de la colonne `attrs`, avec la condition d'affichage de `from` (la bulle d'origine) quand il y en a une à reprendre.
  function imageNodeFor(attrs, from) {
    const image = Variables.attachmentImageNode(attrs);
    const condition = from && ConditionRules.plainCondition(from.attrs.condition);
    if (condition) image.attrs.condition = condition;
    return image;
  }
  function badgesContent(picks, node) {
    const inherits = !refs.inheritRow.hidden && refs.inheritBox.checked;
    return picks.flatMap(p => {
      const attrs = pickAttrs(p);
      // Une pièce jointe cochée se pose en image liée à la colonne (cadre, barre de l'image), comme la liste « # » : la bulle d'avant ne montrait qu'une pile de
      // photos sans cadre ni outils. Elle reprend la condition d'affichage de la bulle d'origine quand la case le demande (l'image en a une, comme une bulle).
      if (Variables.becomesImage(state.editor, attrs)) return [{ type: 'text', text: ' ' }, imageNodeFor(attrs, inherits ? node : null)];
      if (inherits) attrs.condition = ConditionRules.plainCondition(node.attrs.condition);
      return [{ type: 'text', text: ' ' }, { type: 'varBadge', attrs }];
    });
  }

  // Le maillon « fiche voisine » du niveau affiché pour une pastille ('' : la fiche elle-même).
  const mentionStep = () => state.hops.find(hop => GristAPI.stepOf(hop)) || '';
  // Contenu à poser pour ces colonnes de la fiche d'une pastille : une espace avant chaque pastille, qui cite la même ligne que `node` avec le texte lu par la fenêtre
  // (`state.mention.labels`), le même que celui que `Mention.resolve` donnera.
  function mentionContent(picks, node) {
    const { table, row } = node.attrs;
    const { labels } = state.mention;
    const step = mentionStep() || null;
    return picks.flatMap(p => (labels && labels.get(p.col)
      ? [{ type: 'text', text: ' ' }, { type: 'mention', attrs: { table, row, step, column: p.col, label: labels.get(p.col) } }]
      : []));
  }

  function insert() {
    if (!state || !state.picks.length) return;
    const { editor, pos } = state;
    const node = originalBadge();
    if (!node) return;
    const content = state.mention ? mentionContent(orderedPicks(), node) : badgesContent(orderedPicks(), node);
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
    // Une pièce jointe en premier : la bulle devient l'image (un autre nœud : ses réglages de texte - format, boucle - ne s'y appliquent pas, sa condition suit) ; les autres
    // cochés suivent comme d'habitude.
    if (Variables.becomesImage(editor, pickAttrs(first))) { replaceWithImage(editor, pos, node, first, others, !refs.inheritRow.hidden && refs.inheritBox.checked); return; }
    const attrs = Object.assign({}, node.attrs, pickAttrs(first));
    // Sans condition, le sinon (js/variable-otherwise.js) n'a plus rien à remplacer.
    if (!refs.inheritRow.hidden && !refs.inheritBox.checked) { attrs.condition = null; attrs.otherwise = null; attrs.otherwiseText = null; }
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

  // « Remplacer » par une pièce jointe : l'image liée prend la place de la bulle (et sa condition d'affichage quand « Reprendre la condition d'affichage » est cochée),
  // les autres attributs cochés la suivent. Une seule transaction (un seul Annuler rend la bulle) ; l'image reste sélectionnée, sa barre s'ouvre.
  function replaceWithImage(editor, pos, node, first, others, inherits) {
    const image = editor.schema.nodeFromJSON(imageNodeFor(pickAttrs(first), inherits ? node : null));
    const after = pos + node.nodeSize;
    const content = badgesContent(others, node);
    close({ keepFocus: true });
    const chain = editor.chain().command(({ tr }) => { tr.replaceWith(pos, after, image); return true; });
    if (content.length) chain.insertContentAt(pos + image.nodeSize, content);
    chain.setNodeSelection(pos).run();
    editor.view.focus();
  }

  // « Remplacer » sur une pastille : la première colonne cochée devient la colonne qu'elle lit, avec son texte pour nom ; les autres suivent, séparées par une espace, comme à
  // l'insertion. C'est la même pastille : sa mise en forme (gras, couleur…) reste, la fiche aussi. Une seule transaction, donc un seul Annuler rend l'ancienne ; la pastille reste
  // sélectionnée, sa barre revient.
  function replaceMention() {
    if (!state || !state.picks.length) return;
    const { editor, pos } = state;
    const node = originalBadge();
    if (!node) return;
    const picks = orderedPicks();
    const first = state.mention.labels && state.mention.labels.get(picks[0].col);
    if (!first) return;
    const attrs = Object.assign({}, node.attrs, { column: picks[0].col, step: mentionStep() || null, label: first });
    const after = pos + node.nodeSize;
    const content = mentionContent(picks.slice(1), node);
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

  // La fenêtre ouverte sur la bulle ou la pastille `node` à `pos` : `from` dit d'où part la liste ({ base, refColumn, minHops, hops }, cf. targetFor ; la table de la fiche et rien
  // d'autre pour une pastille), `mention` : { row } pour une pastille.
  function showFor(editor, pos, node, from, mention) {
    ensureModal();
    state = {
      editor, pos, node, base: from.base, refColumn: from.refColumn, minHops: from.minHops, hops: from.hops.slice(), picks: [], pick: null,
      mention: mention ? { row: mention.row, labels: null } : null, noteText: '', noteBare: false,
    };
    // Sens et rang repartent de « suivante, 1 » ; le volet s'ouvre d'emblée pour une colonne ordinaire de la page, où il est la raison d'ouvrir la fenêtre.
    refs.stepDirection.value = 'after';
    refs.stepRank.value = '1';
    refs.stepExists.hidden = true;
    syncStepRank();
    refs.stepBox.open = !!from.sameRow;
    // Une pastille qui cite déjà une fiche voisine : le volet reprend son sens, son rang et ses colonnes.
    const own = mention && node.attrs.step ? GristAPI.stepOf(node.attrs.step) : null;
    if (own) {
      refs.stepDirection.value = own.edge || (own.offset < 0 ? 'before' : 'after');
      refs.stepRank.value = String(Math.abs(own.offset) || 1);
      syncStepRank();
      lastSeries[from.base] = { order: own.order, group: own.group };
    }
    const { filter, cancelBtn, replaceBtn, subtitle, inheritRow } = refs;
    filter.placeholder = I18n.t('varLinked.filter');
    filter.setAttribute('aria-label', I18n.t('varLinked.filter'));
    cancelBtn.textContent = I18n.t('common.cancel');
    // Les éléments que le choix d'une colonne (pickColumn) cache ou change : remis comme pour une bulle.
    subtitle.hidden = false;
    replaceBtn.hidden = false;
    replaceBtn.textContent = I18n.t('varLinked.replace');
    replaceBtn.title = I18n.t('varLinked.replaceTitle', { badge: mention ? Mention.chipText(node.attrs) : VariableModal.badgeText(node) });
    if (mention) inheritRow.hidden = true; // une pastille n'a pas de condition d'affichage
    else renderInheritOption();
    renderLevel();
    // Pour une colonne ordinaire de la page, le volet est ce qu'on vient chercher : le focus part sur son premier champ réglable, la fenêtre s'ouvre sur lui.
    win.show(from.sameRow ? refs.stepOrder : filter);
  }

  // `pos` : position de la bulle ou de la pastille « @ », capturée au clic sur l'icône de sa barre flottante.
  async function openAt(editor, pos) {
    const node = editor && editor.state.doc.nodeAt(pos);
    if (node && node.type.name === 'mention') {
      if (opening || state || !Mention.columnsStatus(node.attrs).enabled) return;
      EditorCore.hideFloatingContextToolbars();
      showFor(editor, pos, node, { base: node.attrs.table, refColumn: null, minHops: 0, hops: node.attrs.step ? [node.attrs.step] : [] }, { row: node.attrs.row });
      return;
    }
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
    showFor(editor, pos, node, t, null);
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
  // choisie à ce niveau, sélectionnée d'avance), query (ce qui était tapé dans la liste, repris dans le filtre), canTest (la règle sait prendre un opérateur : le volet
  // « Ligne suivante ou précédente » propose alors « Y a-t-il une suivante ? ») }. Rend { base, hops, column } - la table de départ, les Références suivies puis la colonne
  // choisie, plus `operator: 'non vide'` quand c'est « Y a-t-il une suivante ? » qui a répondu - ou null quand la fenêtre se ferme sans choix. Une table inconnue (colonne disparue) ne dit rien : la fenêtre
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
        pick: { resolve, result: null }, mention: null, noteText: '', noteBare: false,
      };
      refs.stepDirection.value = 'after';
      refs.stepRank.value = '1';
      refs.stepExists.hidden = !(request && request.canTest);
      syncStepRank();
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

  return { openAt, pickColumn, close, isOpen, isAvailable };
})();
