// Liste déroulante avec recherche pour un <select> existant. Le <select> reste la source de vérité : masqué, il garde sa valeur et reçoit un
// évènement `change` à chaque choix, donc le code qui l'écoute ou lit `.value` ne change pas. Un clic (ou ↓, ou une lettre) sur le champ ouvre un
// panneau avec une zone de recherche et la liste ; les mots tapés (séparés par une espace) doivent tous figurer dans les noms de la ligne, dans
// n'importe quel ordre, sans compter les accents, la casse, « _ », « . » et « - » : voir « Recherche par nom » plus bas.
// Une <option> peut porter `data-name` (le nom) et `data-hint` (affiché entre parenthèses, plus discret) ; sans eux, son texte sert de nom. Le
// libellé complet (« nom (indice) ») reste le texte de l'<option> (ce que voit et cherche quiconque n'a pas le panneau) et la recherche porte aussi
// sur l'indice. `data-search` ajoute d'autres noms à chercher sans les afficher (la table et le libellé Grist d'une colonne). Une <option> désactivée
// (le « — Choisissez… — » de départ) n'est jamais proposée : elle n'affiche que le champ fermé.
// Autres cas lus dans le <select> :
//  - <optgroup> : son libellé devient un intitulé au-dessus de ses lignes, et disparaît avec elles quand la recherche les écarte ;
//  - <option> sans valeur mais permise (« -- Choisir une colonne -- », « — Aucune — ») : le choix « rien », proposé en tête tant qu'on ne cherche
//    pas, écarté dès qu'on tape, grisé dans le champ fermé ; sauf `data-placeholder="false"` : une valeur vide qui est un vrai choix (« Ordre de la
//    table »), traitée comme les autres ;
//  - <option data-pinned="true"> (la saisie avancée) : toujours en bas de la liste, quelle que soit la recherche.
// SearchSelect.attach(select, opts), ou attachColumns, attachTables, attachTemplates, attachValues, attachSheets (mêmes textes pour chaque sorte de
// liste) ; .destroy() à la fermeture de la fenêtre (le <select> natif réapparaît). Si attach() lève, l'appelant garde le <select> natif.
// Options : labelledBy, searchPlaceholder, emptyText (texte ou fonction relue à chaque ouverture : la langue peut changer), placeholder ; `inline`
// (champ d'une ligne de règle : même hauteur que ses voisins, largeur qui suit la ligne) ; `hintInTrigger: false` (l'indice reste dans la liste, pas
// dans le champ fermé).
// Un menu plutôt qu'un champ (« Image depuis une variable ») : `popup: true` ne montre aucun champ fermé, le panneau s'ouvre par controller.open() à
// côté du rectangle de `anchor()` (relu à chaque placement), et `onClose(refocus)` prévient à la fermeture (choix, Échap, clic ailleurs) ; refocus
// vaut vrai si la fermeture vient du clavier ou d'un choix. À l'appelant de défaire ensuite le <select> (destroy()), de préférence après la fin de
// l'évènement en cours.
// Descendre (une colonne Référence ouvre les colonnes de sa table, comme la flèche d'« Autres attributs ») : `expand(item)` rend les lignes où mène la
// flèche d'une ligne, sous la forme `{ value, name, hint, search, expand }` (mêmes sens que `data-value`, `data-name`, `data-hint`, `data-search` et
// `data-expand` plus bas), ou null quand elle ne mène nulle part. Une <option> porte `data-expand` (le nom de la destination, dit dans l'info-bulle de
// la flèche) pour que la liste montre sa flèche sans rien demander à `expand` ; sans l'option `expand`, `data-expand` est ignoré. Un clic sur la ligne la
// choisit, un clic sur sa flèche (ou → quand la saisie est vide ou que le curseur est à sa fin) ouvre ses lignes sous un fil d'Ariane ; ← (saisie vide),
// Retour arrière (saisie vide) et un clic sur un niveau du fil remontent. Le choix d'une ligne de ces niveaux n'a pas d'<option> dans le <select> : la liste
// lui en pose une (`data-dynamic`, addDynamicOption), qui ne reste dans la liste que tant qu'elle est choisie.
const SearchSelect = (function () {
  const el = Dom.el;

  const MARGIN = 8;              // marge minimale entre le panneau et le bord de la fenêtre
  const GAP = 4;                 // écart entre le champ et son panneau
  const MIN_WIDTH = 300;         // un libellé « colonne (Référence → Table) » tient sur une ligne même si le champ est étroit
  const PREFERRED_HEIGHT = 250;  // hauteur visée (zone de recherche + une dizaine de lignes) ; réduite dans un panneau Grist bas
  const MIN_HEIGHT = 120;
  const PAGE = 6;                // lignes sautées par Page↓/Page↑
  // résultats posés dans la page : 20 000 lignes (les valeurs d'une Référence vers une grande table) mettent plus d'une seconde à s'afficher
  const MAX_ROWS = 500;
  let _uid = 0;
  const _controllers = new WeakMap();

  // Sans accents ni casse : « tel » retrouve « Téléphone », « reference » retrouve « Référence ».
  function normalize(text) {
    return String(text == null ? '' : text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  // === Recherche par nom ===
  // La même partout où une colonne, une table ou un modèle se cherche par son nom : les listes de ce fichier et la liste « # » (js/variables.js). Une
  // espace sépare les mots de la saisie, qui peuvent venir dans n'importe quel ordre ; « _ », « . », « - » et le reste de la ponctuation ne comptent pas,
  // ni dans la saisie ni dans les noms du candidat : « porteur 3 », « Porteur3 », « 3 porteur » et « projets porteur_3 » retrouvent tous Projets.Porteur_3,
  // alors que « Porteur_3 », tapé en entier, ne retrouve pas Porteur_13 (c'est un seul mot, comme dans le nom).
  const SEPARATORS = /[^\p{L}\p{N}]+/gu;
  // Les noms déjà préparés : la liste « # » prépare chaque colonne du document à chaque frappe.
  const MAX_PREPARED_NAMES = 20000;
  const _prepared = new Map();
  function prepareName(name) {
    let key = _prepared.get(name);
    if (key === undefined) {
      key = normalize(name).replace(SEPARATORS, '');
      if (_prepared.size >= MAX_PREPARED_NAMES) _prepared.clear();
      _prepared.set(name, key);
    }
    return key;
  }
  // Les mots d'une saisie, sans séparateurs ; aucun quand elle ne porte ni lettre ni chiffre (la recherche est alors vide).
  function searchWords(query) {
    return normalize(query).split(/\s+/).map(word => word.replace(SEPARATORS, '')).filter(Boolean);
  }
  // Le texte où chercher un candidat : ses noms (nom affiché, indice, libellé, table...), chacun sans séparateurs, séparés par une espace pour qu'un mot ne
  // passe pas de l'un à l'autre.
  function searchKey(...names) {
    return names.map(prepareName).join(' ');
  }
  // Vrai quand chaque mot de `words` (searchWords) se trouve dans `key` (searchKey) ; toujours vrai sans mot.
  function foundIn(words, key) {
    return words.every(word => key.indexOf(word) !== -1);
  }
  // Le test d'une saisie pour une liste qui n'est pas une liste avec recherche (le champ de recherche de « Ranger les modèles », celui de la galerie, le filtre
  // de « Autres attributs ») : `matcher(...noms)` dit si chaque mot de `query` se trouve dans les noms ; une saisie sans lettre ni chiffre retient tout. Les
  // mots ne sont lus qu'une fois pour toute la liste.
  function nameMatcher(query) {
    const words = searchWords(query);
    return (...names) => foundIn(words, searchKey(...names));
  }

  // Éléments de `items` (produits par readItems) dont les noms contiennent tous les mots de `query`, dans l'ordre d'origine ; tout si la recherche est
  // vide. Une ligne épinglée reste toujours ; le choix « rien » (`empty`) ne se propose que sans recherche.
  function filterItems(items, query) {
    const words = searchWords(query);
    if (!words.length) return items.slice();
    return items.filter(item => item.pinned || (!item.empty && foundIn(words, item.haystack)));
  }

  // Le choix « rien » : une option de valeur vide, sauf si elle se déclare vrai choix (data-placeholder="false").
  function isNoChoice(opt) {
    return opt.value === '' && opt.dataset.placeholder !== 'false';
  }

  function readItems(select) {
    const items = [];
    Array.prototype.forEach.call(select.options, (opt) => {
      if (opt.disabled) return;
      const name = opt.dataset.name || opt.textContent;
      const hint = opt.dataset.hint || '';
      const search = opt.dataset.search || '';
      const parent = opt.parentElement;
      items.push({
        value: opt.value, name, hint, search, haystack: searchKey(name, hint, search),
        group: parent && parent.tagName === 'OPTGROUP' ? parent.label : '',
        pinned: opt.dataset.pinned === 'true',
        empty: isNoChoice(opt),
        expand: opt.dataset.expand || '',
      });
    });
    return items;
  }

  // Une ligne d'un niveau où l'on est descendu (`entry` rendu par `expand`), faite comme celles de readItems.
  function itemOf(entry) {
    const name = entry.name == null ? String(entry.value) : String(entry.name);
    const hint = entry.hint || '';
    const search = entry.search || '';
    return { value: String(entry.value), name, hint, search, haystack: searchKey(name, hint, search), group: '', pinned: false, empty: false, expand: entry.expand || '' };
  }

  // Textes de la zone de recherche et du message « aucun résultat » : une chaîne, ou une fonction relue à chaque ouverture, pour qu'une liste posée
  // une fois sur une fenêtre qui reste (Réglages, « Trier par ») suive un changement de langue.
  const textOf = (value, key) => (typeof value === 'function' ? value() : value) || I18n.t(key);

  // Une liste, c'est un objet `s` : le <select>, les options, les éléments de la page et ce qui change à l'usage. Les fonctions qui suivent le prennent en
  // premier argument.
  function createState(select, opts) {
    const id = 'ss-' + (++_uid);
    const s = {
      select, opts, id, previousDisplay: select.style.display, destroyed: false,
      searchPlaceholder: textOf(opts.searchPlaceholder, 'searchSelect.placeholder'),
      emptyText: textOf(opts.emptyText, 'searchSelect.empty'),
      items: [], visible: [], active: -1, query: '', open: false, lastX: -1, lastY: -1,
      rows: [], // les <li> des lignes de `visible`, dans le même ordre (la liste contient aussi le message et les intitulés de groupe)
      // Les niveaux ouverts, du premier (les lignes du <select>) à celui qu'on voit : { items, from (la ligne d'où l'on est descendu), table (sa destination) }.
      // `items` est toujours ceux du dernier.
      levels: [],
    };
    buildTrigger(s);
    buildPanel(s);
    s.wrap.append(s.trigger, s.panel);
    s.onResize = () => place(s);
    s.onOutsideScroll = (event) => { if (!s.panel.contains(event.target)) place(s); };
    s.onChange = () => syncTrigger(s);
    return s;
  }

  // Le champ fermé : un bouton (le nom du choix, son indice, un chevron). Son nom accessible vient du <select> (labelledBy, <label for>).
  function buildTrigger(s) {
    const { select, opts, id } = s;
    s.wrap = el('div', 'ss-wrap' + (opts.inline ? ' ss-inline' : '') + (opts.popup ? ' ss-popup' : ''));
    const trigger = s.trigger = el('button', 'ss-trigger');
    trigger.type = 'button';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    const valueEl = el('span', 'ss-value');
    valueEl.id = id + '-value';
    s.nameEl = el('span', 'ss-name');
    s.hintEl = el('span', 'ss-hint');
    valueEl.append(s.nameEl, s.hintEl);
    const chevron = el('span', 'ss-chevron');
    chevron.setAttribute('aria-hidden', 'true');
    trigger.append(valueEl, chevron);
    // Libellés du <select> (<label for>) : son nom accessible, et un clic dessus met le focus sur le champ visible (le <select>, masqué, ne le peut
    // plus).
    const labels = s.labels = Array.prototype.slice.call(select.labels || []);
    labels.forEach((label, i) => { if (!label.id) label.id = id + '-label-' + i; });
    const labelIds = [opts.labelledBy].concat(labels.map(label => label.id)).filter(Boolean);
    trigger.setAttribute('aria-labelledby', labelIds.concat(valueEl.id).join(' '));
    s.onLabelClick = () => trigger.focus({ preventScroll: true });
  }

  // Le panneau : zone de recherche, liste (avec le message « aucun résultat ») et un message d'état pour les lecteurs d'écran.
  function buildPanel(s) {
    const { id } = s;
    const panel = s.panel = el('div', 'ss-panel');
    panel.hidden = true;
    const searchRow = el('div', 'ss-search');
    const input = s.input = el('input', 'ss-input');
    input.type = 'text';
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-controls', id + '-list');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-label', s.searchPlaceholder);
    input.placeholder = s.searchPlaceholder;
    input.autocomplete = 'off';
    input.spellcheck = false;
    searchRow.appendChild(input);
    // Le fil d'Ariane des niveaux ouverts (renderPath), caché tant qu'on n'est pas descendu.
    const path = s.path = el('nav', 'ss-path');
    path.hidden = true;
    const list = s.list = el('ul', 'ss-list');
    list.id = id + '-list';
    list.setAttribute('role', 'listbox');
    const empty = s.empty = el('li', 'ss-empty', s.emptyText);
    empty.setAttribute('role', 'presentation');
    empty.hidden = true;
    const status = s.status = el('div', 'ss-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    panel.append(searchRow, path, list, status);
  }

  // Champ fermé : le choix courant (nom + indice discret), sinon le texte de l'<option> désactivée de départ ; le choix « rien » est grisé comme un
  // texte de départ. Reprend aussi l'état grisé du <select>.
  function syncTrigger(s) {
    const { select, trigger, nameEl, hintEl, opts } = s;
    const opt = select.options[select.selectedIndex];
    const chosen = opt && !opt.disabled ? opt : null;
    trigger.classList.toggle('is-placeholder', !chosen || isNoChoice(chosen));
    trigger.disabled = select.disabled;
    if (chosen) {
      nameEl.textContent = chosen.dataset.name || chosen.textContent;
      hintEl.textContent = chosen.dataset.hint && opts.hintInTrigger !== false ? '(' + chosen.dataset.hint + ')' : '';
      trigger.title = chosen.textContent;
    } else {
      const placeholder = Array.prototype.find.call(select.options, o => o.disabled);
      nameEl.textContent = opts.placeholder || (placeholder ? placeholder.textContent : '');
      hintEl.textContent = '';
      trigger.removeAttribute('title');
    }
  }

  // Fait défiler juste ce qu'il faut pour montrer la ligne active. Pas de scrollIntoView : il remonterait aussi les ancêtres défilants (fenêtre
  // Grist comprise) et ferait sauter la page.
  function scrollToActive(s) {
    const { list } = s;
    const row = s.rows[s.active];
    if (!row) return;
    // Première ligne d'un groupe : on la remonte avec son intitulé, sinon on la verrait sans savoir de quelle table elle est.
    const before = row.previousElementSibling;
    const top = before && before.classList.contains('ss-group') ? before.offsetTop : row.offsetTop;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight;
  }
  function setActive(s, index, scroll) {
    if (s.active >= 0 && s.rows[s.active]) s.rows[s.active].classList.remove('is-active');
    s.active = index;
    const row = s.rows[s.active];
    if (row) {
      row.classList.add('is-active');
      s.input.setAttribute('aria-activedescendant', row.id);
      if (scroll !== false) scrollToActive(s);
    } else {
      s.input.removeAttribute('aria-activedescendant');
    }
  }

  // `back` : la ligne d'où l'on vient de remonter, surlignée de préférence au choix courant (voir ascend).
  function render(s, back) {
    const { select, list, empty, status, id } = s;
    const found = filterItems(s.items, s.query);
    const current = select.value;
    const searching = s.query.trim() !== '';
    // Les résultats proprement dits : ni la ligne épinglée ni le choix « rien », qui ne comptent pas comme une réponse à la recherche.
    const matches = found.filter(item => !item.pinned && !item.empty);
    // Liste très longue : seuls les MAX_ROWS premiers résultats sont posés, une ligne dit d'affiner la recherche (le champ cherche dans tous, le
    // nombre annoncé est le total). Ne concerne que les valeurs d'une Référence vers une très grande table.
    const dropped = matches.length > MAX_ROWS ? new Set(matches.slice(MAX_ROWS)) : null;
    s.visible = dropped ? found.filter(item => !dropped.has(item)) : found;
    list.textContent = '';
    list.appendChild(empty);
    s.rows = [];
    let lastGroup = '';
    let moreShown = !dropped;
    // La ligne « Encore N résultats » vient après les résultats, avant la ligne épinglée (la saisie avancée reste en dernier).
    const addMore = () => {
      const more = el('li', 'ss-more', I18n.t('searchSelect.more', { count: dropped.size }));
      more.setAttribute('role', 'presentation');
      list.appendChild(more);
      moreShown = true;
    };
    s.visible.forEach((item, i) => {
      if (!moreShown && item.pinned) addMore();
      if (item.group && item.group !== lastGroup) {
        const header = el('li', 'ss-group', item.group);
        header.setAttribute('role', 'presentation');
        list.appendChild(header);
      }
      lastGroup = item.group;
      const row = el('li', 'ss-option' + (item.pinned ? ' is-pinned' : '') + (item.empty ? ' is-empty' : ''));
      row.id = id + '-opt-' + i;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', item.value === current ? 'true' : 'false');
      row.dataset.index = String(i);
      row.appendChild(el('span', 'ss-name', item.name));
      if (item.hint) row.appendChild(el('span', 'ss-hint', '(' + item.hint + ')'));
      // Une colonne Référence : la flèche qui ouvre les colonnes de sa table. Hors du clavier (Tab, la saisie garde le focus) : → fait la même chose.
      if (item.expand && s.opts.expand) {
        const label = I18n.t('searchSelect.descend', { table: item.expand, column: item.name });
        const arrow = el('button', 'ss-descend', '›');
        arrow.type = 'button';
        arrow.tabIndex = -1;
        arrow.title = label;
        arrow.setAttribute('aria-label', label);
        row.classList.add('has-children');
        row.appendChild(arrow);
      }
      list.appendChild(row);
      s.rows.push(row);
    });
    if (!moreShown) addMore();
    // Message quand la recherche ne trouve rien (ou qu'il n'y a rien à lister) ; pas pour une liste qui ne propose que « rien », sans recherche.
    empty.hidden = matches.length > 0 || (!searching && s.visible.length > 0);
    // Aux lecteurs d'écran : le nombre de résultats pendant une recherche, sinon la table dont on voit les colonnes quand on est descendu.
    const depth = s.levels.length - 1;
    status.textContent = searching ? (matches.length ? I18n.t('searchSelect.count', { count: matches.length }) : s.emptyText)
      : (depth > 0 ? I18n.t('searchSelect.level', { table: s.levels[depth].table }) : '');
    // Recherche en cours : le premier résultat, pour que Entrée le prenne (jamais la ligne épinglée, pour qu'elle ne se choisisse pas par mégarde).
    // Sinon la ligne d'où l'on remonte, sinon le choix courant ; rien de surligné sans recherche ni choix, pour qu'un Entrée à vide ne choisisse pas la
    // première colonne au hasard.
    const wanted = back ? back.value : current;
    setActive(s, searching ? (matches.length ? s.visible.indexOf(matches[0]) : -1) : s.visible.findIndex(item => item.value === wanted), false);
  }

  // Panneau en position fixe : hors de toute zone rognante (fenêtre à défilement, ancêtre overflow:hidden), sous le champ ou au-dessus si la place
  // manque (panneau Grist bas, ~700x400) ; sa hauteur suit la place disponible et la liste défile dedans.
  function place(s) {
    const { trigger, panel, opts } = s;
    // Champ retiré de la page pendant que le panneau est ouvert (règles redessinées) : refermer, sinon les écouteurs de la fenêtre resteraient.
    if (!trigger.isConnected) { closePanel(s, false); return; }
    const rect = opts.anchor ? opts.anchor() : trigger.getBoundingClientRect();
    const viewWidth = window.innerWidth;
    const viewHeight = window.innerHeight;
    const width = Math.min(Math.max(rect.width, MIN_WIDTH), viewWidth - 2 * MARGIN);
    const spaceBelow = viewHeight - rect.bottom - GAP - MARGIN;
    const spaceAbove = rect.top - GAP - MARGIN;
    const below = spaceBelow >= PREFERRED_HEIGHT || spaceBelow >= spaceAbove;
    panel.style.width = width + 'px';
    panel.style.left = Math.max(MARGIN, Math.min(rect.left, viewWidth - width - MARGIN)) + 'px';
    panel.style.maxHeight = Math.max(MIN_HEIGHT, Math.min(PREFERRED_HEIGHT, below ? spaceBelow : spaceAbove)) + 'px';
    if (below) { panel.style.top = (rect.bottom + GAP) + 'px'; panel.style.bottom = 'auto'; }
    else { panel.style.bottom = (viewHeight - rect.top + GAP) + 'px'; panel.style.top = 'auto'; }
  }

  function refreshTexts(s) {
    const { opts, input } = s;
    s.searchPlaceholder = textOf(opts.searchPlaceholder, 'searchSelect.placeholder');
    s.emptyText = textOf(opts.emptyText, 'searchSelect.empty');
    input.placeholder = s.searchPlaceholder;
    input.setAttribute('aria-label', s.searchPlaceholder);
    s.empty.textContent = s.emptyText;
  }

  function openPanel(s, seed) {
    const { select, input, panel, trigger, opts } = s;
    if (s.open || select.disabled) return;
    refreshTexts(s);
    dropStaleDynamicOptions(select);
    s.items = readItems(select);
    s.levels = [{ items: s.items, from: null, table: '' }];
    renderPath(s);
    s.query = seed || '';
    input.value = s.query;
    s.open = true;
    panel.hidden = false;
    // Le menu sans champ (popup: true) est posé sur la page, au niveau des menus : au-dessus de ce qui est déjà ouvert (js/layers.js). Celui d'une
    // fenêtre reste dans le sien.
    if (opts.popup) Layers.raise(panel);
    trigger.setAttribute('aria-expanded', 'true');
    render(s);
    place(s);
    scrollToActive(s);
    window.addEventListener('resize', s.onResize);
    window.addEventListener('scroll', s.onOutsideScroll, true);
    input.focus({ preventScroll: true });
    if (seed) input.setSelectionRange(s.query.length, s.query.length); else input.select();
  }
  function closePanel(s, refocus) {
    const { input, trigger, opts } = s;
    if (!s.open) return;
    s.open = false;
    s.panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    window.removeEventListener('resize', s.onResize);
    window.removeEventListener('scroll', s.onOutsideScroll, true);
    input.value = '';
    s.query = '';
    if (refocus) trigger.focus({ preventScroll: true });
    if (opts.onClose && !s.destroyed) opts.onClose(!!refocus);
  }
  function choose(s, item) {
    const { select } = s;
    // Une ligne d'un niveau où l'on est descendu n'a pas d'<option> : elle en reçoit une, rangée après la ligne d'où l'on est parti, qui porte pour nom sa
    // valeur (le chemin entier) et se cherche par les noms de toute la suite de colonnes.
    if (s.levels.length > 1) {
      const search = s.levels.slice(1).map(level => level.from.search).concat(item.search).join(' ');
      addDynamicOption(select, { value: item.value, hint: item.hint, search }, s.levels[1].from.value);
    }
    const changed = select.value !== item.value;
    select.value = item.value;
    syncTrigger(s);
    closePanel(s, true);
    if (changed) select.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function move(s, delta) {
    const { visible, active } = s;
    if (!visible.length) return;
    setActive(s, active < 0 ? (delta > 0 ? 0 : visible.length - 1) : Math.min(visible.length - 1, Math.max(0, active + delta)));
  }

  // === Descendre === Les niveaux ouverts sont dans `s.levels` ; la zone de recherche et la liste ne montrent que le dernier.
  // Ouvre les lignes où mène la flèche de `item` ; faux quand elle ne mène nulle part.
  function descend(s, item) {
    if (!s.open || !s.opts.expand || !item || !item.expand) return false;
    let entries = null;
    try { entries = s.opts.expand(item); } catch (e) { console.warn('[SearchSelect] lignes de la flèche illisibles', e); }
    if (!entries) return false;
    s.levels.push({ items: entries.map(itemOf), from: item, table: item.expand });
    showLevel(s, null);
    return true;
  }
  // Revient au niveau `depth` (0 : les lignes du <select>) ; la ligne d'où l'on remonte est surlignée, pour que → y redescende aussitôt.
  function ascend(s, depth) {
    if (!s.open || depth < 0 || depth >= s.levels.length - 1) return false;
    const left = s.levels[depth + 1].from;
    s.levels.length = depth + 1;
    showLevel(s, left);
    return true;
  }
  // Montre le dernier niveau : sa recherche repart à vide, sa liste au début (jusqu'à `back`, la ligne d'où l'on remonte).
  function showLevel(s, back) {
    s.items = s.levels[s.levels.length - 1].items;
    s.query = '';
    s.input.value = '';
    s.list.scrollTop = 0;
    renderPath(s);
    render(s, back);
    scrollToActive(s);
  }
  // Le fil d'Ariane « Colonnes › Accompagnateur », caché au premier niveau : chaque niveau au-dessus de celui qu'on voit revient à lui au clic (wirePath),
  // celui qu'on voit est en gras. Des boutons hors du clavier, comme la flèche des lignes : la saisie garde le focus, ← remonte d'un niveau.
  function renderPath(s) {
    const { path, levels } = s;
    path.replaceChildren();
    path.hidden = levels.length < 2;
    if (path.hidden) return;
    path.setAttribute('aria-label', I18n.t('searchSelect.path'));
    levels.forEach((level, depth) => {
      if (depth) {
        const sep = el('span', 'ss-sep', '›');
        sep.setAttribute('aria-hidden', 'true');
        path.appendChild(sep);
      }
      const label = depth ? level.from.name : I18n.t('searchSelect.rootCrumb');
      if (depth === levels.length - 1) {
        const here = el('span', 'ss-crumb is-here', label);
        here.setAttribute('aria-current', 'location');
        path.appendChild(here);
        return;
      }
      const title = depth ? I18n.t('searchSelect.upTo', { table: level.table }) : I18n.t('searchSelect.upToRoot');
      const up = el('button', 'ss-crumb', label);
      up.type = 'button';
      up.tabIndex = -1;
      up.dataset.depth = String(depth);
      up.title = title;
      up.setAttribute('aria-label', title);
      path.appendChild(up);
    });
  }

  // La ligne d'un choix fait en descendant (`entry` : { value, name, hint, search }, le nom étant par défaut la valeur) : le <select> reste la source de
  // la valeur, il lui faut donc une <option>. Elle se range juste après la ligne `rootValue` d'où l'on est parti (celle de la colonne Référence), à
  // défaut en fin de liste avant la ligne épinglée ; marquée `data-dynamic`, elle ne reste dans la liste que tant qu'elle est choisie
  // (dropStaleDynamicOptions). Exportée : une règle enregistrée avec un tel chemin reçoit sa ligne à sa construction (js/condition-fields.js).
  function addDynamicOption(select, entry, rootValue) {
    const existing = Array.prototype.find.call(select.options, option => option.value === entry.value);
    if (existing) return existing;
    const name = entry.name == null ? String(entry.value) : String(entry.name);
    const option = document.createElement('option');
    option.value = entry.value;
    option.textContent = entry.hint ? name + ' (' + entry.hint + ')' : name;
    option.dataset.name = name;
    if (entry.hint) option.dataset.hint = entry.hint;
    if (entry.search) option.dataset.search = entry.search;
    option.dataset.dynamic = 'true';
    const root = rootValue == null ? null : Array.prototype.find.call(select.options, o => o.value === rootValue);
    if (root) {
      root.after(option);
    } else {
      const pinned = Array.prototype.find.call(select.options, o => o.dataset.pinned === 'true');
      select.insertBefore(option, pinned && pinned.parentNode === select ? pinned : null);
    }
    return option;
  }
  // Retire les lignes posées par addDynamicOption qui ne sont plus le choix : à l'ouverture du panneau, quand le choix est réglé (une colonne refusée
  // par la fenêtre de la clé laisse la sienne jusque-là, pour que le choix d'avant se remette).
  function dropStaleDynamicOptions(select) {
    Array.prototype.slice.call(select.options).forEach(option => { if (option.dataset.dynamic === 'true' && !option.selected) option.remove(); });
  }

  // Champ fermé : un clic (ou Entrée / Espace, qui déclenchent le même clic) ouvre ou referme ; ↓/↑ ouvrent ; une lettre ouvre avec elle comme
  // début de recherche (preventDefault : sinon elle serait tapée deux fois dans la zone qui prend le focus). Échap et Tab restent à la fenêtre.
  function wireTrigger(s) {
    const { trigger } = s;
    trigger.addEventListener('mousedown', (event) => {
      // Panneau ouvert : garder le focus dans la zone de recherche, sinon son `blur` referme le panneau avant que le clic ne le referme (et le rouvre
      // aussitôt dans les navigateurs qui ne donnent pas le focus aux boutons).
      if (s.open) event.preventDefault();
    });
    trigger.addEventListener('click', () => { if (s.open) closePanel(s, true); else openPanel(s); });
    trigger.addEventListener('keydown', (event) => {
      if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); openPanel(s); }
      else if (event.key.length === 1 && event.key !== ' ') { event.preventDefault(); openPanel(s, event.key); }
    });
  }

  // Une touche seule : Maj, Ctrl, Alt et Cmd gardent leur sens dans le texte (sélection, saut de mot).
  const plainKey = event => !(event.shiftKey || event.ctrlKey || event.altKey || event.metaKey);
  const caretAtEnd = input => input.selectionStart === input.value.length && input.selectionEnd === input.value.length;

  function wireInput(s) {
    const { input, panel, trigger } = s;
    input.addEventListener('input', () => { s.query = input.value; render(s); });
    input.addEventListener('keydown', (event) => {
      if (event.isComposing) return;
      switch (event.key) {
        case 'ArrowDown': event.preventDefault(); move(s, 1); break;
        case 'ArrowUp': event.preventDefault(); move(s, -1); break;
        case 'PageDown': event.preventDefault(); move(s, PAGE); break;
        case 'PageUp': event.preventDefault(); move(s, -PAGE); break;
        // → ouvre les colonnes de la ligne surlignée quand le curseur est à la fin de la saisie (ailleurs, il se déplace dans le texte) ; ← et Retour
        // arrière remontent d'un niveau quand la saisie est vide.
        case 'ArrowRight':
          if (plainKey(event) && caretAtEnd(input) && descend(s, s.visible[s.active])) event.preventDefault();
          break;
        case 'ArrowLeft':
        case 'Backspace':
          if (plainKey(event) && input.value === '' && ascend(s, s.levels.length - 2)) event.preventDefault();
          break;
        case 'Enter': event.preventDefault(); if (s.visible[s.active]) choose(s, s.visible[s.active]); break;
        // Échap ferme le panneau seul : la fenêtre qui le contient (js/modal-base.js) se fermerait sinon avec lui.
        case 'Escape': event.preventDefault(); event.stopPropagation(); closePanel(s, true); break;
        // Le focus revient au champ avant l'action par défaut de Tab, qui part donc de lui : champ suivant (Maj+Tab : précédent).
        case 'Tab': closePanel(s, true); break;
      }
    });
    input.addEventListener('blur', (event) => {
      const to = event.relatedTarget;
      if (to && (panel.contains(to) || to === trigger)) return;
      closePanel(s, false);
    });
  }

  function wireList(s) {
    const { panel, input, list } = s;
    // Le clic dans le panneau ne doit pas retirer le focus à la zone de recherche (ni pendant qu'on tire l'ascenseur de la liste).
    panel.addEventListener('mousedown', (event) => { if (event.target !== input) event.preventDefault(); });
    list.addEventListener('click', (event) => {
      const row = event.target.closest('.ss-option');
      const item = row && s.visible[Number(row.dataset.index)];
      if (!item) return;
      // La flèche d'une colonne Référence ouvre ses colonnes ; le reste de la ligne la choisit.
      if (event.target.closest('.ss-descend')) descend(s, item); else choose(s, item);
    });
    // Surbrillance à la souris seulement quand elle bouge : la liste change sous un pointeur immobile à chaque frappe, et le mousemove alors envoyé
    // volerait la ligne active (Entrée ne prendrait plus le premier résultat).
    list.addEventListener('mousemove', (event) => {
      if (event.clientX === s.lastX && event.clientY === s.lastY) return;
      s.lastX = event.clientX;
      s.lastY = event.clientY;
      const row = event.target.closest('.ss-option');
      if (row && Number(row.dataset.index) !== s.active) setActive(s, Number(row.dataset.index), false);
    });
  }

  // Le fil d'Ariane : un clic sur un niveau au-dessus de celui qu'on voit y revient.
  function wirePath(s) {
    s.path.addEventListener('click', (event) => {
      const up = event.target.closest('.ss-crumb[data-depth]');
      if (up) ascend(s, Number(up.dataset.depth));
    });
  }

  // Ce que la liste rend à l'appelant : le champ fermé, ouvrir / fermer, le focus, la mise à jour par programme, et destroy() qui rend le <select>.
  function controllerOf(s) {
    const { select, trigger } = s;
    return {
      trigger,
      isOpen: () => s.open,
      open: (seed) => openPanel(s, seed),
      close: (refocus) => closePanel(s, refocus),
      focus: (options) => trigger.focus(options),
      // À appeler après avoir changé par programme `select.value`, ses options ou son état grisé (ça ne déclenche aucun évènement).
      sync: () => syncTrigger(s),
      destroy() {
        s.destroyed = true;
        closePanel(s, false);
        select.removeEventListener('change', s.onChange);
        s.labels.forEach(label => label.removeEventListener('click', s.onLabelClick));
        delete select.focus;
        s.wrap.remove();
        select.style.display = s.previousDisplay;
        _controllers.delete(select);
      },
    };
  }

  function attach(select, opts) {
    if (_controllers.has(select)) return _controllers.get(select);
    const s = createState(select, opts || {});
    wireTrigger(s);
    wireInput(s);
    wireList(s);
    wirePath(s);
    syncTrigger(s);
    // D'abord l'insertion, seule étape qui peut lever (<select> hors de la page) : si elle échoue, le <select> n'a encore rien reçu.
    select.parentNode.insertBefore(s.wrap, select.nextSibling);
    select.style.display = 'none';
    select.addEventListener('change', s.onChange);
    s.labels.forEach(label => label.addEventListener('click', s.onLabelClick));
    // Le <select> masqué ne peut plus prendre le focus : ce qui l'appelait (ouverture d'une fenêtre, bouton « Ajouter une condition ») le donne au
    // champ visible.
    select.focus = (options) => s.trigger.focus(options);
    const controller = controllerOf(s);
    _controllers.set(select, controller);
    return controller;
  }

  // Mêmes textes partout pour une sorte de liste (zone de recherche, « Aucune … ne correspond. »).
  function attachKind(select, opts, searchKey, emptyKey) {
    return attach(select, Object.assign({ searchPlaceholder: () => I18n.t(searchKey), emptyText: () => I18n.t(emptyKey) }, opts));
  }
  // Liste de colonnes.
  function attachColumns(select, opts) { return attachKind(select, opts, 'linkConfig.searchColumns', 'linkConfig.noColumnMatch'); }
  // Liste de tables (Réglages > Accès).
  function attachTables(select, opts) { return attachKind(select, opts, 'searchSelect.searchTables', 'searchSelect.noTableMatch'); }
  // Liste de modèles (page de garde, annexes et modèle par défaut d'un macro-modèle).
  function attachTemplates(select, opts) { return attachKind(select, opts, 'searchSelect.searchTemplates', 'searchSelect.noTemplateMatch'); }
  // Liste de valeurs possibles d'une colonne (choix d'une colonne Choix, valeurs affichées d'une colonne Référence : champ Valeur d'une règle).
  function attachValues(select, opts) { return attachKind(select, opts, 'searchSelect.searchValues', 'searchSelect.noValueMatch'); }
  // Liste de feuilles d'un classeur Excel (import d'une grille : js/grid-xlsx-import.js).
  function attachSheets(select, opts) { return attachKind(select, opts, 'searchSelect.searchSheets', 'searchSelect.noSheetMatch'); }
  // Remet à jour le champ visible d'un <select> déjà attaché après un changement par programme de sa valeur, de ses options ou de son état grisé ;
  // sans effet sur un <select> que le composant n'a pas pris (liste native de repli). Pour le code qui ne garde pas le contrôleur (grisage d'un champ
  // Valeur).
  function sync(select) {
    const controller = _controllers.get(select);
    if (controller) controller.sync();
  }

  return { attach, attachColumns, attachTables, attachTemplates, attachValues, attachSheets, sync, filterItems, readItems, addDynamicOption, normalize, searchWords, searchKey, foundIn, nameMatcher };
})();
