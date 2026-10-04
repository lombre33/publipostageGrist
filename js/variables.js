// Variables : la liste « # » (@tiptap/suggestion dans l'éditeur, une liste maison dans les champs texte), la valeur d'une bulle (autre table, chemin
// de références, calcul) et la fenêtre des règles de liaison entre tables. La liste (#autocomplete-box, css/style.css) est créée ici, pas déclarée
// dans index.html.
const Variables = (function () {
  // Touche de déclenchement, réglée dans le panneau Réglages et lue dans localStorage : un seul caractère, '#' à défaut.
  function triggerChar() {
    try {
      const char = localStorage.getItem('pp_trigger_char');
      return char && char.length === 1 ? char : '#';
    } catch (e) { return '#'; }
  }

  let acBox = null;
  let acItemsBox = null;
  let currentItems = [];
  let selectedIndex = 0;
  // Dernières props de @tiptap/suggestion : un clic sur un onglet rejoue updateItems() avec elles, n'étant pas un évènement du plugin.
  let latestProps = null;
  // La commande de l'entrée choisie : @tiptap/suggestion ne la donne qu'à onStart et onUpdate, jamais à onKeyDown ni au clic de souris.
  let latestCommand = null;
  // Onglet actif du panneau « # » (le champ du nom de fichier PDF n'a pas celui des puces) ; 'variables' à chaque ouverture.
  let activeTab = 'variables';
  // La fenêtre d'où la liste s'ouvre quand c'est depuis un de ses champs (le calcul d'une bulle) : la liste passe devant elle
  // (ViewportFit.placePopup, Layers.raise), les fenêtres étant au-dessus des menus où elle est posée. null pour la liste de l'éditeur et celle des
  // champs de la page.
  let listWindow = null;
  // Une colonne ajoutée après le chargement du widget doit apparaître dans la liste : le schéma est relu une fois par saisie, pas à chaque frappe,
  // pour l'éditeur comme pour le nom du PDF.
  let schemaRefreshedForSession = false;
  // Le champ texte (nom du PDF, Objet, À, Cc, Cci) dont la liste est ouverte, { el, start, end } : un <input> ne passe pas par @tiptap/suggestion, il
  // réutilise la même boîte, les mêmes entrées et la même ligne choisie (jamais actifs ensemble). null pour la liste de l'éditeur.
  let filenameInputState = null;
  // Vrai le temps qu'insertFilenameVariable prévient le champ (évènement input) : sans lui la liste se rouvrirait sur la clé qu'on vient de poser, le
  // point de « Table.Colonne » faisant partie de ce que la liste lit.
  let insertingFilenameVariable = false;

  // Entrées fixes de l'onglet des puces (jamais issues de GristAPI) : `kind: 'chip'` les distingue d'une #Variable ; `i18nKey` est résolu à
  // l'affichage (displayKey), pour suivre un changement de langue.
  const SMART_CHIP_ITEMS = [
    { key: 'Note de bas de page', i18nKey: 'chips.footnote', kind: 'chip', chipKind: 'footnote' },
    { key: 'Date du jour', i18nKey: 'chips.date', kind: 'chip', chipKind: 'date' },
    { key: 'Heure actuelle', i18nKey: 'chips.time', kind: 'chip', chipKind: 'time' },
    { key: 'Email de l’utilisateur', i18nKey: 'chips.email', kind: 'chip', chipKind: 'email' },
    { key: 'Nom de l’utilisateur', i18nKey: 'chips.name', kind: 'chip', chipKind: 'name' },
    // Un bloc (js/conditional-text.js), pas une puce en ligne : il entoure le texte sélectionné quand le bouton « Insérer une variable » a ouvert la
    // liste dessus, sinon il se pose vide, curseur dedans.
    { key: 'Texte conditionnel', i18nKey: 'chips.conditionalText', kind: 'chip', chipKind: 'conditionalText' },
    // Son pendant en ligne (js/conditional-value.js) : une valeur - quelques mots, un nombre - posée dans la phrase, qui grandit avec son texte. Elle
    // entoure la sélection si elle tient dans un paragraphe, sinon elle se pose vide, curseur dedans.
    { key: 'Valeur conditionnelle', i18nKey: 'chips.conditionalValue', kind: 'chip', chipKind: 'conditionalValue' },
    // Une case que sa condition coche ou non (js/conditional-checkbox.js), posée à la place de « #requête » et sélectionnée pour que sa barre
    // s'ouvre.
    { key: 'Case conditionnelle', i18nKey: 'chips.conditionalCheckbox', kind: 'chip', chipKind: 'conditionalCheckbox' },
    // Une bulle « Calcul » (js/variable-calc.js) dont la fenêtre s'ouvre à l'insertion ; elle se pose par-dessus le texte tapé après la touche de
    // déclenchement.
    { key: 'Calcul', i18nKey: 'chips.calc', kind: 'chip', chipKind: 'calc' },
  ];
  const displayKey = item => (item.i18nKey ? I18n.t(item.i18nKey) : item.key);

  function ensureBox() {
    if (acBox) return acBox;
    acBox = Dom.el('div');
    acBox.id = 'autocomplete-box';
    acBox.style.display = 'none';
    const tabs = Dom.el('div', 'ac-tabs');
    [['variables', 'panel.tabVariables'], ['chips', 'panel.tabChips']].forEach(([name, label]) => {
      const tab = Dom.el('div', 'ac-tab', I18n.t(label));
      tab.dataset.tab = name;
      // mousedown + preventDefault (pas click) : un blur du focus de l'éditeur ne perturbe pas le changement d'onglet.
      tab.addEventListener('mousedown', e => {
        e.preventDefault();
        if (activeTab === name) return;
        activeTab = name;
        if (latestProps) updateItems(Object.assign({}, latestProps, { items: computeItems(latestProps.query, latestProps.editor) }));
      });
      tabs.appendChild(tab);
    });
    acItemsBox = Dom.el('div', 'ac-items');
    // Les écouteurs sont posés une fois sur la liste, pas sur chaque ligne : elle n'a pas de limite, des milliers de lignes ne portent pas deux
    // écouteurs chacune. Un survol choisit la ligne comme les flèches, pour qu'Entrée suive la ligne survolée ; un clic l'insère, au mousedown +
    // preventDefault (pas click) pour que le focus reste dans l'éditeur ou le champ.
    acItemsBox.addEventListener('mouseover', e => {
      const row = e.target.closest('.ac-item');
      if (row) select(Number(row.dataset.idx));
    });
    acItemsBox.addEventListener('mousedown', e => {
      const row = e.target.closest('.ac-item');
      if (!row) return;
      e.preventDefault();
      latestCommand(currentItems[Number(row.dataset.idx)]);
    });
    acBox.append(tabs, acItemsBox);
    document.body.appendChild(acBox);
    return acBox;
  }

  // Tables « en cours », la plus proche d'abord : celle que parcourt la zone répétée où est le curseur (js/variable-loop.js:loopTableAt ; `editor`
  // absent hors de l'éditeur, nom du fichier PDF), puis celle de la page. Vide tant que la page n'a pas de table.
  function currentTables(editor) {
    const loopTable = editor ? VariableLoop.loopTableAt(editor.state, editor.state.selection.from) : null;
    return [loopTable, GristAPI.getCurrentTableId()].filter((table, index, all) => table && all.indexOf(table) === index);
  }
  // `items` ({ table, … }) avec les colonnes des tables « en cours » en tête : chaque table de `tables` dans cet ordre, puis les autres, l'ordre
  // d'origine gardé dans chaque groupe. À appliquer AVANT toute limite de longueur, sans quoi une table qui vient tard dans le schéma voit ses
  // colonnes écartées par celles des tables d'avant.
  function prioritizeTables(items, tables) {
    const groups = tables.map(() => []);
    const others = [];
    items.forEach(item => { const rank = tables.indexOf(item.table); (rank === -1 ? others : groups[rank]).push(item); });
    return [].concat(...groups, others);
  }

  // Les variables dont la clé « Table.Colonne » contient la saisie `query`, sans les colonnes d'aide. Sans accents ni casse, comme toutes les listes
  // à recherche (js/search-select.js:normalize) : « télé » retrouve Telephone, les identifiants de Grist n'ayant jamais d'accent. Aucune limite de
  // longueur : la personne cherche par le nom, elle ne fait pas défiler la liste.
  function matchingVariables(query) {
    const wanted = SearchSelect.normalize(query);
    return GristAPI.getAllVariables().filter(v => !GristAPI.isHelperColumn(v.column) && SearchSelect.normalize(v.key).includes(wanted));
  }

  function refreshSchemaOnce() {
    if (schemaRefreshedForSession) return;
    schemaRefreshedForSession = true;
    GristAPI.refreshSchema().catch(e => console.warn('[variables] rafraîchissement du schéma échoué', e));
  }

  // Les entrées de l'onglet actif, pour l'`items()` de @tiptap/suggestion (à chaque frappe) comme pour le clic sur un onglet. `editor` (facultatif) :
  // les colonnes de la table de la page viennent en tête ; dans une zone répétée, celles de la table parcourue passent avant elles.
  function computeItems(query, editor) {
    if (activeTab === 'chips') {
      // Pas de note de bas de page dans un en-tête ou un pied : la zone est répétée sur chaque page, sans repère de page physique où ancrer une note.
      const items = Editor.isEditingHeaderFooter() ? SMART_CHIP_ITEMS.filter(v => v.chipKind !== 'footnote') : SMART_CHIP_ITEMS;
      const wanted = SearchSelect.normalize(query);
      return items.filter(v => SearchSelect.normalize(displayKey(v)).includes(wanted));
    }
    refreshSchemaOnce();
    return prioritizeTables(matchingVariables(query), currentTables(editor));
  }

  // Le champ du nom de fichier PDF réutilise cette boîte sans l'onglet des puces (aucun nœud ProseMirror à y insérer) : masqué plutôt que retiré du
  // DOM.
  function setTabsVisible(visible) {
    ensureBox().querySelector('.ac-tabs').style.display = visible ? '' : 'none';
  }

  // Une ligne par entrée de `currentItems`, toutes : `data-idx` dit à laquelle elle répond (évènements de ensureBox).
  function render() {
    ensureBox().querySelectorAll('.ac-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.tab === activeTab));
    const rows = document.createDocumentFragment();
    currentItems.forEach((item, idx) => {
      const row = Dom.el('div', 'ac-item' + (idx === selectedIndex ? ' selected' : ''), displayKey(item));
      row.dataset.idx = idx;
      rows.appendChild(row);
    });
    acItemsBox.replaceChildren(rows);
    // Une liste neuve commence en haut, sur sa ligne choisie : refaite à la même longueur (« # » retapé), elle gardait sinon le défilement de la
    // précédente.
    acItemsBox.scrollTop = 0;
  }
  // Change la ligne choisie par sa classe, sans reconstruire la liste : un survol ou une flèche qui reconstruisait des milliers de lignes la figeait.
  function select(idx) {
    if (idx === selectedIndex) return;
    const rows = acItemsBox.children;
    if (rows[selectedIndex]) rows[selectedIndex].classList.remove('selected');
    selectedIndex = idx;
    if (rows[idx]) rows[idx].classList.add('selected');
  }

  // La liste défile seule (sa hauteur suit la place libre autour du curseur) : la ligne choisie aux flèches y est ramenée, entière. Pas de
  // scrollIntoView, qui ferait aussi défiler la fenêtre Grist ; des rectangles, `.ac-items` n'étant pas le parent de position de ses lignes.
  function keepSelectedVisible() {
    const row = acItemsBox.querySelector('.ac-item.selected');
    if (!row) return;
    const list = acItemsBox.getBoundingClientRect();
    const rect = row.getBoundingClientRect();
    if (rect.top < list.top) acItemsBox.scrollTop -= Math.ceil(list.top - rect.top);
    else if (rect.bottom > list.bottom) acItemsBox.scrollTop += Math.ceil(rect.bottom - list.bottom);
  }
  // Flèches ↑ et ↓, dans l'éditeur comme dans un champ texte : la ligne voisine (de la dernière à la première et inversement), la liste suit.
  function moveSelection(step) {
    select((selectedIndex + step + currentItems.length) % currentItems.length);
    keepSelectedVisible();
  }

  // Appelée la liste affichée : ViewportFit.placePopup mesure sa vraie hauteur pour la garder dans la fenêtre, sous le curseur ou au-dessus quand il
  // est en bas d'un panneau bas.
  function position(clientRect) {
    const rect = clientRect && clientRect();
    if (!rect) return;
    const box = ensureBox();
    if (box.style.display === 'none') return;
    ViewportFit.placePopup(box, rect, { gap: 4, over: listWindow });
  }

  // Le bouton « Insérer une variable » avec du texte sélectionné (js/conditional-text.js:startFromSelection) ouvre la liste sur l'onglet des puces :
  // la seule chose qu'elle sache faire d'une sélection est de l'entourer. L'onglet revient à « variables » à la fermeture de la liste (onExit).
  function preferChipsTab() { activeTab = 'chips'; }

  function updateItems(props) {
    latestProps = props;
    currentItems = props.items || [];
    // Avec un texte à entourer en attente, « Texte conditionnel » est l'entrée choisie : Entrée suffit.
    const wrapIndex = ConditionalText.hasPending() ? currentItems.findIndex(item => item.chipKind === 'conditionalText') : -1;
    selectedIndex = wrapIndex > 0 ? wrapIndex : 0;
    latestCommand = props.command;
    setTabsVisible(true);
    render();
    // La liste de l'éditeur retrouve son étage de menu : un champ de fenêtre l'a peut-être montée devant sa fenêtre (checkForFilenameTrigger).
    listWindow = null;
    ensureBox().style.display = currentItems.length ? 'flex' : 'none';
    position(props.clientRect);
  }

  function hide() { if (acBox) acBox.style.display = 'none'; }

  // L'objet de rendu de @tiptap/suggestion : onStart et onUpdate à chaque frappe après le déclencheur, onKeyDown pour intercepter flèches, Entrée et
  // Échap (true : géré, l'éditeur ne les reçoit pas), onExit quand le déclencheur n'est plus actif (curseur sorti, espace tapé...).
  function suggestionRender() {
    return {
      onStart: updateItems,
      onUpdate: updateItems,
      onKeyDown(props) {
        if (!currentItems.length) return false;
        if (props.event.key === 'ArrowDown') { moveSelection(1); return true; }
        if (props.event.key === 'ArrowUp') { moveSelection(-1); return true; }
        if (props.event.key === 'Enter' || props.event.key === 'Tab') { latestCommand(currentItems[selectedIndex]); return true; }
        if (props.event.key === 'Escape') { hide(); return true; }
        return false;
      },
      onExit() { hide(); schemaRefreshedForSession = false; activeTab = 'variables'; ConditionalText.cancelPending(); },
    };
  }

  // Les puces qui ouvrent leur propre insertion. Appelées à l'usage : ces modules sont chargés après celui-ci.
  const PANEL_INSERTERS = {
    conditionalText: (editor, range) => ConditionalText.insertFromPanel(editor, range),
    conditionalValue: (editor, range) => ConditionalValue.insertFromPanel(editor, range),
    conditionalCheckbox: (editor, range) => ConditionalCheckbox.insertFromPanel(editor, range),
    calc: (editor, range) => VariableCalc.insertFromPanel(editor, range),
  };
  function insertFootnote(editor, range) {
    const id = 'fn-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    editor.chain().focus().insertContentAt(range, { type: 'footnoteRef', attrs: { id, text: '' } }).run();
    // La note est retrouvée par son id plutôt que par `range.from` : sa position réelle ne dépend pas de ce que l'insertion a décalé.
    let insertedPos = null;
    editor.state.doc.descendants((node, pos) => {
      if (insertedPos != null) return false;
      if (node.type.name === 'footnoteRef' && node.attrs.id === id) { insertedPos = pos; return false; }
      return true;
    });
    // `Editor` est chargé après ce fichier : résolu ici, à l'exécution.
    if (insertedPos != null) Editor.openFootnoteEditorAt(insertedPos);
    else console.warn('[variables] note de bas de page insérée mais introuvable ensuite (id=' + id + ') : fenêtre non ouverte.');
  }
  // Une puce s'insère tout de suite, sans colonne à lier ; la note de bas de page ouvre en plus sa fenêtre de texte.
  function insertChip(editor, range, chipKind) {
    const insertFromPanel = PANEL_INSERTERS[chipKind];
    if (insertFromPanel) insertFromPanel(editor, range);
    else if (chipKind === 'footnote') insertFootnote(editor, range);
    else editor.chain().focus().insertContentAt(range, { type: 'smartChip', attrs: { kind: chipKind } }).run();
  }
  // `range` reste valide pendant l'attente de la fenêtre de liaison (position ProseMirror, pas liée au focus DOM).
  async function insertVariable(editor, range, item) {
    // Dans une zone répétée pour cette table, la variable lit la ligne du tour : aucun lien à configurer (js/loop-rules.js).
    const inLoop = VariableLoop.loopTableAt(editor.state, range.from) === item.table;
    if (!inLoop && !(await ensureLinkConfigured(item))) return;
    editor.chain().focus().insertContentAt(range, { type: 'varBadge', attrs: { table: item.table, column: item.column, key: item.key } }).run();
  }

  // Reçoit les classes Extension et Suggestion plutôt que de les importer : editor.js les a déjà chargées au même moment.
  function createExtension(Extension, Suggestion) {
    return Extension.create({
      name: 'varBadgeSuggestion',
      addProseMirrorPlugins() {
        return [
          Suggestion({
            editor: this.editor,
            // Réglable dans le panneau Réglages ; un changement n'a effet qu'après rechargement, ce `char` étant lu une fois, à la construction de
            // l'éditeur.
            char: triggerChar(),
            // Jamais dans un bloc de code : un « # » de commentaire ou de couleur (#fff) y ouvrirait la liste, et une bulle ne peut pas vivre dans du
            // texte brut.
            allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code,
            items: ({ query, editor }) => computeItems(query, editor),
            command: ({ editor, range, props }) => {
              if (props.kind === 'chip') insertChip(editor, range, props.chipKind);
              else insertVariable(editor, range, props);
            },
            render: suggestionRender,
          }),
        ];
      },
    });
  }

  // Saisie « Table.Colonne.… » d'un champ texte (`raw`, casse tapée) : quand ce qui précède le dernier point est un chemin de colonnes Référence qui
  // part d'une table (« Projet.Accompagnateur »), les colonnes de la table atteinte dont le nom contient ce qui suit le point, en variables (clé
  // « Projet.Accompagnateur.Email », colonne « Accompagnateur.Email » : le chemin que résout findTextVariables). null quand le début n'est pas un tel
  // chemin : la saisie se filtre alors comme une clé simple.
  function pathItems(raw) {
    const cut = raw.lastIndexOf('.');
    if (cut === -1) return null;
    const parts = raw.slice(0, cut).split('.');
    if (parts.length < 2) return null;
    const named = (names, wanted) => { const lower = wanted.toLowerCase(); return names.find(n => n.toLowerCase() === lower); };
    const table = named(GristAPI.getTables(), parts[0]);
    if (!table) return null;
    const hops = [];
    let reached = table;
    for (const part of parts.slice(1)) {
      const column = named(GristAPI.getColumns(reached), part);
      reached = column && GristAPI.tableAtEndOf(reached, [column]);
      if (!reached) return null;
      hops.push(column);
    }
    const partial = SearchSelect.normalize(raw.slice(cut + 1));
    return GristAPI.getVisibleColumns(reached).filter(c => SearchSelect.normalize(c).includes(partial)).map(c => {
      const path = hops.concat(c).join('.');
      return { key: table + '.' + path, table, column: path };
    });
  }
  function checkForFilenameTrigger(el) {
    if (insertingFilenameVariable) return;
    const closeList = () => { hide(); filenameInputState = null; schemaRefreshedForSession = false; };
    const caret = el.selectionStart;
    if (caret == null) { closeList(); return; }
    // Lettres accentuées comprises : « #télé » retrouve Telephone comme dans l'éditeur.
    const match = el.value.slice(0, caret).match(new RegExp(triggerChar().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([\\p{L}\\p{N}_.]*)$', 'u'));
    if (!match) { closeList(); return; }
    // Relu dès le premier caractère tapé après le déclencheur : sinon chercher une colonne toute neuve ne trouverait rien, la liste vide se fermant
    // avant d'avoir pu relire.
    refreshSchemaOnce();
    const query = SearchSelect.normalize(match[1]);
    // Après « Projet.Accompagnateur. » : les colonnes de la ligne que désigne cette Référence ; sinon la saisie filtre les clés « Table.Colonne »,
    // celles de la table de la page d'abord.
    const items = pathItems(match[1]) || prioritizeTables(matchingVariables(match[1]), currentTables());
    // Une clé tapée en entier, seule proposition, n'a rien à compléter (clé tapée à la main, curseur revenu derrière une variable posée) : la liste
    // reste fermée.
    if (!items.length || (items.length === 1 && SearchSelect.normalize(items[0].key) === query)) { hide(); filenameInputState = null; return; }
    filenameInputState = { el, start: caret - match[0].length, end: caret };
    currentItems = items;
    selectedIndex = 0;
    latestCommand = insertFilenameVariable;
    setTabsVisible(false);
    render();
    // Le champ d'une fenêtre (le calcul d'une bulle) : la liste s'ouvre devant elle, pas dessous.
    listWindow = el.closest('.pp-modal');
    ensureBox().style.display = 'flex';
    position(() => el.getBoundingClientRect());
  }
  // Pose « #Clé » en texte brut, sans bulle (un <input> ne contient pas de HTML) : ReaderMode.resolveFilename la remplace à l'export. Une variable
  // d'une AUTRE table demande sa clé de correspondance quand on la choisit dans un champ qui n'est pas dans une fenêtre, comme à l'insertion d'une
  // bulle : sans clé, « réinsérez la variable pour la configurer » (variables.error.noMatching) ne mènerait nulle part. Refusée, rien n'est posé et
  // le texte tapé reste. Les champs d'une fenêtre gardent leur propre moment : le calcul demande ses clés à la validation.
  async function insertFilenameVariable(item) {
    const state = filenameInputState;
    if (!state) return;
    const { el, start, end } = state;
    hide();
    filenameInputState = null;
    if (!el.closest('.pp-modal') && !(await ensureLinkConfigured(item))) { el.focus(); el.setSelectionRange(end, end); return; }
    const insertion = triggerChar() + item.key;
    el.value = el.value.slice(0, start) + insertion + el.value.slice(end);
    const newCaret = start + insertion.length;
    el.focus();
    el.setSelectionRange(newCaret, newCaret);
    insertingFilenameVariable = true;
    try { el.dispatchEvent(new Event('input', { bubbles: true })); } finally { insertingFilenameVariable = false; }
  }
  // À appeler depuis js/main.js une fois le champ présent dans le DOM (indépendant de createExtension, qui ne concerne que l'éditeur).
  function initFilenameInput(el) {
    if (!el) return;
    el.addEventListener('input', () => checkForFilenameTrigger(el));
    el.addEventListener('keyup', e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') checkForFilenameTrigger(el); });
    // Un <input> ne passe jamais par @tiptap/suggestion : le clavier est géré ici, comme dans suggestionRender().
    el.addEventListener('keydown', e => {
      if (!filenameInputState || !acBox || acBox.style.display !== 'flex') return;
      if (e.key === 'ArrowDown') { e.preventDefault(); moveSelection(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveSelection(-1); }
      else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); latestCommand(currentItems[selectedIndex]); }
      else if (e.key === 'Escape') { e.preventDefault(); hide(); filenameInputState = null; }
    });
    // Un clic sur une ligne (mousedown, déjà en preventDefault dans ensureBox) passe avant le blur du champ : ce délai court couvre les cas où le
    // focus part quand même (Échap ailleurs).
    el.addEventListener('blur', () => { setTimeout(() => { if (filenameInputState && filenameInputState.el === el) { hide(); filenameInputState = null; } }, 150); });
  }

  // Zéro : sans réglage, un nombre nul ne s'écrit pas du tout (ni le nombre, ni sa devise, ni « zéro » en lettres) dans une colonne Numérique ou
  // Entier : Grist y stocke 0 faute de pouvoir garder une case vide, et rien ne doit s'en voir en Lecture ni à l'export. Une bulle l'affiche avec
  // `zero: 'show'` (bouton de la barre flottante) ; `zero: 'hide'`, posé par un ancien menu, dit la même chose que l'absence de réglage. Un format
  // date garde son zéro (le 1er janvier 1970). La barre flottante lit la même règle : elle montre ce que le document écrit.
  function zeroHidden(format, colType) {
    if (format && format.type && format.type !== 'number') return false;
    if (format && format.zero === 'show') return false;
    return !!(format && format.zero === 'hide') || colType === 'Numeric' || colType === 'Int';
  }
  // Le type de la colonne lue : `opts.colType` quand la valeur ne vient d'aucune colonne (le résultat d'un calcul, js/formula.js, est un nombre écrit
  // et caché à zéro comme celui d'une colonne Numérique).
  const typeOfValue = (varTable, varColumn, opts) => opts.colType || (varTable && varColumn ? GristAPI.getColumnType(varTable, varColumn) : null);
  // Ni la bulle d'un champ texte (`rawNumbers`) ni une valeur montrée comme donnée (`keepZero`) ne cachent le zéro.
  const dropsZero = (format, colType, opts) => !opts.rawNumbers && !opts.keepZero && zeroHidden(format, colType);
  const withoutZeros = (items, drop) => (drop ? items.filter(v => !VariableFormat.isZero(v)) : items);

  // Le texte d'une valeur tel que l'écrit la bulle de `format` (null : réglages par défaut). Sans réglage, une colonne Date ou DateTime reçoit quand
  // même le préréglage par défaut, une Numérique ou Entier s'écrit comme la barre flottante l'annonce (FR : espaces entre les milliers, virgule ; US
  // quand l'interface est en anglais), un Oui / Non en « vrai » / « faux » (« true » / « false » en anglais). Seul un vrai nombre est mis en forme :
  // un texte saisi dans une colonne numérique (Grist le garde tel quel) reste ce qu'il est, « 12 EUR » ne deviendrait pas « 12 ». `opts.rawNumbers` :
  // les champs texte (nom du fichier, Objet, À, Cc, Cci) gardent nombre, zéro et booléen tels quels (« Facture 2026012 » ne doit pas devenir
  // « Facture 2 026 012 », ni un nom de fichier changer d'écriture d'un jour à l'autre). `opts.keepZero` : la valeur d'une cellule montrée comme
  // donnée (attributs d'une ligne liée), pas comme la bulle l'écrira. Une liste (une valeur par ligne liée d'une règle « match », ou une colonne
  // liste) se formate élément par élément, le zéro masqué en est retiré sans laisser de trou entre deux virgules ; avec un réglage de la fenêtre
  // « Liste » (js/variable-list.js) elle s'écrit à plat, sinon les valeurs sont jointes par « , ».
  function formatValue(val, format, varTable, varColumn, opts) {
    opts = opts || {};
    if (val === null || val === undefined) return '';
    const colType = typeOfValue(varTable, varColumn, opts);
    const drop = dropsZero(format, colType, opts);
    if (Array.isArray(val)) {
      const style = VariableFormat.listStyle(format);
      const texts = withoutZeros(style ? VariableFormat.flattenList(val) : val, drop).map(v => formatValue(v, format, varTable, varColumn, opts));
      return style ? VariableFormat.listText(texts, style) : texts.join(', ');
    }
    if (drop && VariableFormat.isZero(val)) return '';
    // Oui / Non : « vrai » / « faux » sans réglage (la barre « Oui / Non », js/floating-toolbars.js, le montre enfoncé), une case ☑ / ☐ avec l'un des
    // trois styles de case.
    if (typeof val === 'boolean') return opts.rawNumbers || opts.keepZero ? String(val) : VariableFormat.formatBool(val, format);
    let effectiveFormat = format;
    if ((!effectiveFormat || !effectiveFormat.type) && colType) {
      if (colType === 'Date' || colType === 'DateTime') effectiveFormat = Object.assign({}, effectiveFormat, { type: 'date', preset: VariableFormat.DATE_PRESETS[0].key });
      else if (!opts.rawNumbers && typeof val === 'number' && (colType === 'Numeric' || colType === 'Int')) effectiveFormat = Object.assign({}, effectiveFormat, { type: 'number' });
    }
    if (effectiveFormat && effectiveFormat.type === 'number') return VariableFormat.formatNumber(val, effectiveFormat);
    if (effectiveFormat && effectiveFormat.type === 'date') return VariableFormat.formatDate(val, effectiveFormat);
    return String(val);
  }
  // Les valeurs d'une liste, une écriture chacune, dans l'ordre et au compte où « La n-ième » (fenêtre « Liste ») les prend : à plat, le zéro caché
  // comme la bulle l'écrit, celles qui s'écrivent vides en moins. C'est la suite qu'un export « un document par valeur » parcourt
  // (js/list-split.js) : le document n° k écrit la k-ième. Une valeur qui n'est pas une liste est une suite d'un seul élément.
  function listTexts(val, format, varTable, varColumn, opts) {
    opts = opts || {};
    if (val === null || val === undefined) return [];
    const drop = dropsZero(format, typeOfValue(varTable, varColumn, opts), opts);
    const items = withoutZeros(Array.isArray(val) ? VariableFormat.flattenList(val) : [val], drop);
    return items.map(v => formatValue(v, format, varTable, varColumn, opts)).filter(text => text !== '');
  }
  const unwrapRefValue = v => (Array.isArray(v) ? v[1] : v);

  // Valeur d'une cellule telle que Grist l'AFFICHE, pour une ligne lue par fetchTable (autre table, export en lot, aperçu de la fenêtre de
  // condition) : la forme brute donne l'id de la ligne référencée pour une Référence (0 si vide) et ["L", …] pour une liste, là où grist.onRecord
  // livre déjà la valeur affichée pour la table de la page. Une Référence ou une liste de références prend donc la valeur de sa colonne d'affichage
  // (GristAPI.getDisplayColumn : la colonne « gristHelper_Display… » que Grist calcule dans la même table et que fetchTable livre,
  // engine.py:fetch_table dans grist-core).
  function cellValue(table, column, row) {
    if (!row) return null;
    let value = row[column];
    const reference = GristAPI.referenceOf(GristAPI.getColumnType(table, column));
    if (reference) {
      if (!reference.list && value === 0) return null;
      const displayCol = GristAPI.getDisplayColumn(table, column);
      if (displayCol && displayCol in row) value = row[displayCol];
    }
    return (Array.isArray(value) && value[0] === 'L') ? value.slice(1) : value;
  }

  // La ligne brute (fetchTable) de la ligne courante de la page, pour une colonne que grist.onRecord n'a PAS livrée (`record[colonne] === undefined`,
  // la clé absente : un champ rapporté - colonne à formule créée depuis une autre vue - qui n'est pas cochée dans les colonnes de CE widget tant que
  // includeColumns:'normal' ne l'a pas complétée, cf. js/grist-api.js:init). Lue une seule fois par ligne livrée : chaque livraison est un NOUVEL
  // objet, la WeakMap oublie donc d'elle-même la lecture précédente, et plusieurs colonnes absentes de la même ligne partagent une seule lecture de
  // la table. null sans identifiant de ligne (ligne « nouvelle ») ou si la lecture échoue.
  const rawRowByRecord = new WeakMap();
  function rawRowOf(table, record) {
    if (!record || typeof record !== 'object' || record.id == null) return Promise.resolve(null);
    if (!rawRowByRecord.has(record)) rawRowByRecord.set(record, GristAPI.fetchRowById(table, record.id).catch(() => null));
    return rawRowByRecord.get(record);
  }
  // L'identifiant de la ligne que désigne la colonne Référence `column` de la ligne courante de `tableId`. fetchTable (export en lot) le donne tel
  // quel, mais grist.onRecord (Lecture, export de la ligne courante) livre la valeur AFFICHÉE (« Projet Alpha ») ou un objet Reference, qui ne
  // retrouve aucune ligne (« [ERREUR: ligne introuvable] » à la place de la valeur) : il est relu sur la ligne brute, comme ruleSourceValue le fait
  // pour la colonne source d'une règle. Sans ligne brute (ligne « nouvelle »), la valeur telle quelle.
  async function referencedRowId(tableId, column, record) {
    if (!GristAPI.isRawRow(record)) {
      const raw = await rawRowOf(tableId, record);
      if (raw && column in raw) return unwrapRefValue(raw[column]);
    }
    return unwrapRefValue(record[column]);
  }

  // La valeur de la colonne source d'une règle « match » pour la ligne courante. Comparée à l'identifiant de ligne de la table cible, une colonne
  // Référence doit fournir l'identifiant RÉFÉRENCÉ : fetchTable (export en lot) le donne tel quel, mais grist.onRecord (Lecture, export de la ligne
  // courante) livre la valeur de la colonne AFFICHÉE par la Référence (« Dupont Jean »), ou un objet Reference quand cette valeur est un nombre
  // (WidgetFrame.ts:fetchSelectedRecord, expandRefs vrai par défaut, et objtypes.ts:decodeObject dans grist-core) : la règle proposée d'office pour
  // une colonne Référence (identifiant de ligne = colonne Référence) ne trouverait jamais la ligne en Lecture. Dans ce seul cas, la ligne brute est
  // relue par son id ; toute autre règle garde la valeur de `record` telle quelle (une règle qui compare le texte affiché, « NomPrenom =
  // Responsable », continue de marcher).
  async function ruleSourceValue(rule, record, currentTableId, fetchRows) {
    const { colonneSource, colonneCible } = rule;
    if (colonneSource === 'id') return record.id;
    // Une ligne de fetchTable : l'id brut pour une comparaison à l'identifiant de ligne, sinon la valeur affichée, que compare la même règle en
    // Lecture (grist.onRecord la livre déjà).
    const fromRawRow = row => (colonneCible === 'id' ? unwrapRefValue(row[colonneSource]) : cellValue(currentTableId, colonneSource, row));
    if (GristAPI.isRawRow(record)) return fromRawRow(record);
    const value = unwrapRefValue(record[colonneSource]);
    // Colonne source non livrée par grist.onRecord (un champ rapporté de la page comme clé de liaison) : lue sur la ligne brute. Sans cela la règle
    // n'aurait aucune valeur à chercher.
    if (value === undefined) {
      const row = await rawRowOf(currentTableId, record);
      if (row && colonneSource in row) return fromRawRow(row);
    }
    if (colonneCible !== 'id' || typeof value === 'number' || record.id == null) return value;
    const reference = GristAPI.referenceOf(GristAPI.getColumnType(currentTableId, colonneSource));
    if (!reference || reference.list) return value;
    const raw = (await fetchRows(currentTableId)).find(r => r.id === record.id);
    return raw ? raw[colonneSource] : value;
  }
  // La ligne d'identifiant le plus petit (la « ligne fixe » d'une règle « singleton »), null pour une table vide.
  const lowestRow = rows => rows.reduce((min, r) => (!min || r.id < min.id ? r : min), null);
  // Les lignes dont la colonne cible de la règle vaut `sourceVal` : comparées en texte, sans espaces autour.
  function matchingRows(rows, rule, sourceVal) {
    const wanted = String(sourceVal).trim();
    const keyOf = rule.colonneCible === 'id' ? (row => row.id) : (row => unwrapRefValue(row[rule.colonneCible]));
    return rows.filter(row => String(keyOf(row)).trim() === wanted);
  }
  // Les lignes de `varTable` qui correspondent à la ligne courante selon la règle de liaison de cette table (aucune : vide), pour la résolution d'une
  // variable comme pour la fenêtre « Autres attributs » (js/variable-linked-attrs.js), qui lit plusieurs colonnes de la MÊME ligne.
  // `opts.fetchRows(tableId)` remplace GristAPI.fetchTableRows, pour ne lire chaque table qu'une fois quand une condition est évaluée sur toutes les
  // lignes d'une table (aperçu de js/variable-condition.js).
  async function resolveLinkedRows(varTable, rule, record, currentTableId, opts) {
    const fetchRows = (opts && opts.fetchRows) || GristAPI.fetchTableRows;
    if (rule.mode === 'singleton') {
      const first = lowestRow(await fetchRows(varTable));
      return first ? [first] : [];
    }
    const sourceVal = await ruleSourceValue(rule, record, currentTableId, fetchRows);
    if (sourceVal === undefined || sourceVal === null) return [];
    return matchingRows(await fetchRows(varTable), rule, sourceVal);
  }

  // === Descendre de référence en référence === Une colonne « Accompagnateur.Email » (GristAPI.resolveColumnPath) part de la ligne de la table de la
  // bulle, suit la colonne Référence Accompagnateur jusqu'à la ligne de l'annuaire qu'elle désigne, et lit Email sur CETTE ligne, comme
  // $Projet.Accompagnateur.Email dans une formule Grist. Aucune règle de liaison n'est ajoutée pour les tables traversées : le chemin lui-même dit
  // quelle ligne, et deux références vers la même table (Accompagnateur et Porteur vers l'annuaire) donnent chacune la leur. Une colonne ordinaire
  // est un chemin sans maillon à suivre.

  // Les lignes brutes (fetchTable) de `varTable` d'où part la variable pour la ligne courante : la ligne du tour d'une zone répétée, la ligne
  // courante elle-même (relue par son identifiant : grist.onRecord ne livre que la valeur AFFICHÉE d'une Référence, jamais l'id qu'il faut suivre),
  // les lignes que trouve la règle de liaison de la table, à défaut la colonne Référence de la page qui y mène. `multi` : plusieurs lignes possibles
  // (règle « match »), à lire une par une.
  async function baseRows(varTable, tableId, record, opts) {
    const loopRow = opts && opts.loop && opts.loop.rows && opts.loop.rows[varTable];
    if (loopRow) return { rows: [loopRow] };
    if (!tableId) return { error: I18n.t('variables.error.noCurrentTable') };
    if (varTable === tableId) {
      if (GristAPI.isRawRow(record)) return { rows: [record] };
      const row = record.id != null ? await GristAPI.fetchRowById(varTable, record.id) : null;
      return { rows: row ? [row] : [] };
    }
    const rule = GristAPI.getLinkRule(varTable);
    if (rule) return { rows: await resolveLinkedRows(varTable, rule, record, tableId, opts), multi: rule.mode !== 'singleton' };
    const refCols = await GristAPI.findReferenceColumns(tableId, varTable);
    if (refCols.length === 0) return { error: I18n.t('variables.error.noMatching', { table: varTable }) };
    const refId = await referencedRowId(tableId, refCols[0], record);
    if (!refId) return { rows: [] };
    const linkedRow = await GristAPI.fetchRowById(varTable, refId);
    if (!linkedRow) return { error: I18n.t('variables.error.rowNotFound', { table: varTable }) };
    return { rows: [linkedRow] };
  }
  // Un pas de plus : la ligne que désigne la colonne Référence `column` sur chacune des `rows` (null quand la cellule est vide ou que la ligne
  // référencée n'existe plus). Rend { table, rows } : la table atteinte et une ligne (ou null) par ligne de départ, ou { error } quand `column` n'est
  // pas une Référence.
  async function followReference(table, column, rows, opts) {
    const reference = GristAPI.referenceOf(GristAPI.getColumnType(table, column));
    if (!reference || reference.list) return { error: I18n.t('variables.error.notReference', { table, column }) };
    if (!rows.some(Boolean)) return { table: reference.table, rows: rows.map(() => null) };
    const fetchRows = (opts && opts.fetchRows) || GristAPI.fetchTableRows;
    const byId = new Map((await fetchRows(reference.table)).map(r => [r.id, r]));
    return { table: reference.table, rows: rows.map(r => (r && byId.get(unwrapRefValue(r[column]))) || null) };
  }
  // Les lignes de la table où mène le chemin `hops` (suite de colonnes Référence) à partir de la ligne courante de `varTable` : { table, rows,
  // multi } (une ligne, ou null si le chemin s'arrête sur une référence vide, par ligne de départ) ou { error }. Sans `hops`, les lignes de départ
  // elles-mêmes. Partagé avec la fenêtre « Autres attributs » (js/variable-linked-attrs.js), qui montre les valeurs de chaque niveau du chemin.
  async function resolveRows(varTable, hops, currentTableId, record, opts) {
    if (!record) return { table: varTable, rows: [], multi: false };
    const base = await baseRows(varTable, currentTableId || GristAPI.getCurrentTableId(), record, opts);
    if (base.error) return { error: base.error };
    let table = varTable;
    let rows = base.rows;
    for (const hop of hops) {
      const step = await followReference(table, hop, rows, opts);
      if (step.error) return { error: step.error };
      ({ table, rows } = step);
    }
    return { table, rows, multi: !!base.multi };
  }
  // La valeur de `column` lue au bout du chemin `hops` : { value }, { value: [...], multi: true } quand la règle de la table trouve plusieurs lignes,
  // ou { error }.
  async function resolvePathValue(varTable, hops, column, currentTableId, record, opts) {
    const found = await resolveRows(varTable, hops, currentTableId, record, opts);
    if (found.error) return { error: found.error };
    const values = found.rows.map(row => (row ? cellValue(found.table, column, row) : null));
    if (!found.multi) return { value: values.length ? values[0] : null };
    return values.length ? { value: values, multi: true } : { value: null };
  }
  // La valeur d'une colonne de la table de la page pour la ligne courante.
  async function currentRowValue(table, column, record, opts) {
    // `record` vient de grist.onRecord, dont l'encodage des pièces jointes n'est pas garanti identique à celui de fetchRowById : resolveAttachmentIds
    // force `forceRawFetch` pour repasser par ce dernier.
    if (opts && opts.forceRawFetch && record.id != null) {
      try {
        const row = await GristAPI.fetchRowById(table, record.id);
        if (row) return { value: row[column] };
      } catch (e) { /* repli sur la ligne livrée */ }
    }
    // Une ligne de fetchTable (export en lot, aperçu de la fenêtre de condition) : ramenée à la valeur affichée, comme celle de grist.onRecord.
    if (GristAPI.isRawRow(record)) return { value: cellValue(table, column, record) };
    if (record[column] !== undefined) return { value: record[column] };
    // Colonne que grist.onRecord n'a pas livrée (champ rapporté de la page, cf. rawRowOf) : lue sur la ligne brute, ramenée à la valeur affichée ;
    // vide si la table ne l'a pas non plus.
    const row = await rawRowOf(table, record);
    return { value: row && column in row ? cellValue(table, column, row) : undefined };
  }
  // La valeur brute d'une #Variable, avant tout formatage (resolveAttachmentIds ne doit jamais passer par formatValue ni String) : { value }, ou
  // { error } (message déjà rédigé dans la langue de l'interface, clés 'variables.error.*' de js/i18n.js). Pour une table liée par une règle
  // « match », `value` est un tableau (une valeur par ligne liée) et `multi` le signale : js/condition-rules.js:matches teste alors chaque ligne
  // liée, sans confondre avec une ChoiceList, elle aussi un tableau.
  async function resolveRawValue(varTable, varColumn, currentTableId, record, opts) {
    if (!record) return { value: null };
    const hops = String(varColumn).split('.');
    const column = hops.pop();
    const loop = opts && opts.loop;
    // Un élément copié par une zone répétée (js/loop-rules.js:itemBinding) : une variable de la table de la boucle lit la ligne du tour, brute (lue
    // par fetchTable) ; la colonne Liste de références qui mène à ces lignes ne vaut que la valeur affichée de l'élément du tour.
    if (!hops.length && loop && loop.anchors && Object.prototype.hasOwnProperty.call(loop.anchors, varTable + '.' + varColumn)) return { value: loop.anchors[varTable + '.' + varColumn] };
    const inLoopRow = !!(loop && loop.rows && loop.rows[varTable]);
    if (!hops.length && !inLoopRow && varTable === (currentTableId || GristAPI.getCurrentTableId())) return currentRowValue(varTable, column, record, opts);
    return resolvePathValue(varTable, hops, column, currentTableId, record, opts);
  }
  // { text, isError } : le texte de la bulle et, à part, le fait que ce texte est un message d'erreur : le mode Lecture s'en sert pour son
  // avertissement « variables non résolues » sans reconnaître le message à ses premiers mots (« [ERREUR » / « [ERROR » changent avec la langue, et
  // une valeur de cellule peut elle-même commencer par un crochet). `opts.loop` : la ligne du tour d'une zone répétée, cf. resolveRawValue ;
  // `opts.rawNumbers` et `opts.keepZero` : cf. formatValue.
  async function resolveVariableResult(varTable, varColumn, currentTableId, record, format, opts) {
    try {
      const { value, error } = await resolveRawValue(varTable, varColumn, currentTableId, record, opts);
      if (error) return { text: error, isError: true };
      return { text: formatValue(value, format, varTable, varColumn, opts), isError: false };
    } catch (e) {
      console.error('[variables] échec résolution', e);
      return { text: I18n.t('variables.error.failed', { table: varTable, column: varColumn }), isError: true };
    }
  }
  // Le texte seul, pour ce qui l'écrit tel quel (nom de fichier, champs du mode email, boucles en ligne, aperçus des fenêtres). `opts` : cf.
  // resolveVariableResult.
  async function resolveVariable(varTable, varColumn, currentTableId, record, format, opts) {
    return (await resolveVariableResult(varTable, varColumn, currentTableId, record, format, opts)).text;
  }
  // Les valeurs d'une liste pour cette ligne, comme la bulle les compte (listTexts) : { texts }, ou { texts: [], error } quand la colonne ne se lit
  // pas. `opts` : cf. resolveVariableResult.
  async function resolveListTexts(varTable, varColumn, currentTableId, record, format, opts) {
    try {
      const { value, error } = await resolveRawValue(varTable, varColumn, currentTableId, record, opts);
      if (error) return { texts: [], error };
      return { texts: listTexts(value, format, varTable, varColumn, opts) };
    } catch (e) {
      console.error('[variables] échec de la lecture d\'une liste', e);
      return { texts: [], error: I18n.t('variables.error.failed', { table: varTable, column: varColumn }) };
    }
  }

  // === Bulle « Calcul » (js/formula.js) ===
  // Le texte d'une erreur de calcul, dans la langue de l'interface (clés `formula.error.*` de js/i18n.js).
  function formulaErrorText(error) {
    return Formula.errorMessage(error, (key, params) => I18n.t(key, params), { lang: I18n.getLang(), trigger: triggerChar() });
  }
  // La valeur d'une variable de calcul, prête pour Formula.evaluate : un nombre, null (cellule vide) ou la liste des nombres des lignes liées (règle
  // « match », colonne liste) ; { error } avec le message prêt à écrire quand la variable ne se lit pas ou n'est pas un nombre. Une date n'est pas un
  // nombre : Grist la garde en secondes, que le calcul additionnerait sans que personne ne le voie. `opts` : comme resolveRawValue (ligne du tour
  // d'une zone répétée).
  async function calcOperand(variable, currentTableId, record, opts) {
    // Une colonne ou une table disparue ne vaut pas 0 : le total dirait faux sans que personne le voie.
    const end = GristAPI.resolveColumnPath(variable.table, variable.column);
    if (!end) return { error: I18n.t('formula.error.unknownColumn', { column: variable.column, table: variable.table }) };
    // La clé est dite comme la bulle l'écrit, avec sa touche de déclenchement.
    const shown = triggerChar() + variable.key;
    if (end.type === 'Date' || end.type === 'DateTime') return { error: I18n.t('formula.error.dateColumn', { key: shown }) };
    if (end.type === 'Attachments') return { error: I18n.t('formula.error.attachments', { key: shown }) };
    const { value, error } = await resolveRawValue(variable.table, variable.column, currentTableId, record, opts);
    if (error) return { error };
    const read = raw => {
      const found = Formula.toNumber(raw);
      return found.error ? { error: formulaErrorText(Object.assign({ key: shown }, found.error)) } : found;
    };
    if (!Array.isArray(value)) { const one = read(value); return one.error ? { error: one.error } : one.value; }
    const list = [];
    for (const item of value) {
      const one = read(item);
      if (one.error) return { error: one.error };
      list.push(one.value);
    }
    return list;
  }
  // { text, isError } d'un calcul enregistré, comme resolveVariableResult pour une variable : le résultat est un nombre, écrit avec le format de la
  // bulle (FR par défaut, zéro caché par défaut) ; une erreur s'écrit « [ERREUR: …] » dans la langue de l'interface, une variable illisible avec son
  // propre message. `opts` : la ligne du tour d'une zone répétée (opts.loop) ; opts.rawNumbers et opts.keepZero comme formatValue. Plus, pour la
  // fenêtre du calcul : `value` (le nombre, null s'il n'y a rien à montrer) quand le calcul aboutit, `message` (l'erreur sans son « [ERREUR: …] »)
  // quand il échoue.
  async function resolveCalcResult(stored, currentTableId, record, format, opts) {
    // Le message d'une variable illisible arrive déjà entre « [ERREUR: … » et « ] » (variables.error.*) ; celui du calcul lui-même, non.
    const failure = error => {
      const message = error.code === 'variable' ? error.message : formulaErrorText(error);
      const wrapped = /^\[[^:\]]+:\s*([\s\S]*)\]$/.exec(message);
      return { text: wrapped ? message : I18n.t('variables.error.generic', { message }), isError: true, message: wrapped ? wrapped[1] : message };
    };
    try {
      const parsed = Formula.parse(stored);
      if (parsed.error) return failure(parsed.error);
      const values = {};
      await Promise.all(Formula.variablesOf(parsed.ast).map(async variable => { values[variable.key] = await calcOperand(variable, currentTableId, record, opts); }));
      const result = Formula.evaluate(parsed.ast, values);
      if (result.error) return failure(result.error);
      return { text: formatValue(result.value, format, null, null, Object.assign({}, opts, { colType: 'Numeric' })), isError: false, value: result.value };
    } catch (e) {
      console.error('[variables] échec du calcul', e);
      return failure({ code: 'failed' });
    }
  }
  async function resolveCalc(stored, currentTableId, record, format, opts) {
    return (await resolveCalcResult(stored, currentTableId, record, format, opts)).text;
  }
  // Ce qui empêche une bulle « Calcul » de se calculer, sans lire aucune cellule : la formule ne se lit pas, ou elle cite une table ou une colonne
  // qui n'existe plus. '' quand tout va bien. La bulle de l'éditeur devient rouge avec ce message en info-bulle
  // (Editor.refreshVariableBadgeValidity).
  function calcProblem(stored) {
    const parsed = Formula.parse(stored);
    if (parsed.error) return formulaErrorText(parsed.error);
    const tables = GristAPI.getTables();
    for (const variable of Formula.variablesOf(parsed.ast)) {
      if (tables.indexOf(variable.table) === -1) return I18n.t('formula.error.unknownTable', { table: variable.table });
      if (!GristAPI.resolveColumnPath(variable.table, variable.column)) return I18n.t('formula.error.unknownColumn', { column: variable.column, table: variable.table });
    }
    return '';
  }

  // Les variables d'un texte brut - champs Objet, À, Cc, Cci du mode email et nom du fichier PDF, de simples <input> sans bulle : à chaque
  // déclencheur, la plus longue clé « Table.Colonne » connue qui suit (pas un regex [A-Za-z0-9_]+ : une clé Grist contient elle-même des « _ »,
  // ambigus avec un séparateur tapé entre deux variables). Une clé de colonne Référence se prolonge par les colonnes de la ligne qu'elle désigne,
  // comme la bulle d'un corps de modèle : dans « #Projet.Accompagnateur.Email », « Projet.Accompagnateur » est la clé et « .Email » une colonne de
  // l'annuaire ; `column` vaut alors le chemin entier (« Accompagnateur.Email », cf. GristAPI.resolveColumnPath). Un point suivi de ce qui n'est pas
  // une colonne de la table atteinte (fin de phrase, « .pdf ») reste du texte. Partagé avec ReaderMode.resolveFilename : un seul balayage pour tous
  // les champs texte. Rend [{ start, end, table, column }] : la position du déclencheur et la fin de la variable dans `text`.
  function findTextVariables(text) {
    const variables = GristAPI.getAllVariables();
    const trigger = triggerChar();
    const found = [];
    let at = text.indexOf(trigger);
    while (at !== -1) {
      const keyAt = at + 1;
      let base = null;
      for (const variable of variables) {
        if (text.startsWith(variable.key, keyAt) && (!base || variable.key.length > base.key.length)) base = variable;
      }
      if (base) {
        const path = extendKeyPath(base.table, base.column, text, keyAt + base.key.length);
        found.push({ start: at, end: path.end, table: base.table, column: path.column });
        at = text.indexOf(trigger, path.end);
      } else {
        at = text.indexOf(trigger, keyAt);
      }
    }
    return found;
  }
  // Ajoute « .Colonne » à `column` tant que le texte, à partir de `from`, suit un chemin de colonnes Référence : la colonne la plus longue de la
  // table atteinte l'emporte, comme pour les clés. Rend { column, end } : le chemin entier et la position où il s'arrête dans `text`.
  function extendKeyPath(table, column, text, from) {
    let path = column;
    let end = from;
    for (;;) {
      const reached = GristAPI.tableAtEndOf(table, path.split('.'));
      if (!reached) break;
      const next = GristAPI.getColumns(reached).filter(c => text.startsWith('.' + c, end)).sort((a, b) => b.length - a.length)[0];
      if (!next) break;
      path += '.' + next;
      end += 1 + next.length;
    }
    return { column: path, end };
  }

  // Les variables d'un texte brut remplacées par ce que rend `valueOf(variable)` (asynchrone, toutes lues ensemble, `variable` : un élément de
  // findTextVariables) : le balayage et le recollage que partagent les champs de l'email (resolveTextVariables) et le nom d'un fichier
  // (ReaderMode.resolveFilename).
  async function replaceTextVariables(text, valueOf) {
    const matches = findTextVariables(text);
    if (!matches.length) return text;
    const values = await Promise.all(matches.map(valueOf));
    let last = 0;
    const parts = matches.map((m, idx) => {
      const part = text.slice(last, m.start) + values[idx];
      last = m.end;
      return part;
    });
    return parts.join('') + text.slice(last);
  }

  // Les variables des champs Objet, À, Cc, Cci du mode email remplacées par leur valeur, à « Créer l'email » (js/main.js, cf.
  // planning/feature-email-mode.md). Sans la sanitisation propre aux noms de fichier (ReaderMode.resolveFilename), qui corromprait un objet d'email
  // ou une adresse.
  async function resolveTextVariables(text, currentTableId, record) {
    if (!text) return '';
    return replaceTextVariables(text, m => resolveVariable(m.table, m.column, currentTableId, record, null, { rawNumbers: true }));
  }

  // Une cellule Attachments encode sa liste façon Grist (['L', id1, id2]) : aplatie récursivement pour n'en garder que les nombres, le marqueur 'L'
  // et toute imbrication disparaissent.
  function flattenToNumbers(value) {
    if (Array.isArray(value)) return value.flatMap(flattenToNumbers);
    return typeof value === 'number' ? [value] : [];
  }
  async function resolveAttachmentIds(varTable, varColumn, currentTableId, record, opts) {
    try {
      const { value, error } = await resolveRawValue(varTable, varColumn, currentTableId, record, Object.assign({}, opts, { forceRawFetch: true }));
      return error ? [] : flattenToNumbers(value);
    } catch (e) {
      console.error('[variables] échec résolution pièce jointe', e);
      return [];
    }
  }

  // === Règles de liaison entre tables ===
  // Configurées à l'insertion d'une variable d'une autre table et dans le panneau de gestion (#link-rules-modal), deux fenêtres de index.html.

  // Où se trouve la donnée réelle d'une colonne, pour les listes de la fenêtre de liaison, entre parenthèses derrière son nom. Une Référence ou une
  // liste de références : la table visée, avec la mention qu'elle stocke un identifiant de ligne et non un texte - sans cela, rien n'indique de la
  // comparer à l'Identifiant de ligne. La colonne d'aide « gristHelper_Display… » que Grist crée derrière une Référence (elle porte le texte affiché,
  // ex. le nom de la personne) : la table de cette Référence, où se trouve ce texte. Toute autre colonne : sa propre table.
  function columnHint(tableId, colId) {
    const reference = GristAPI.referenceOf(GristAPI.getColumnType(tableId, colId));
    if (reference) return I18n.t(reference.list ? 'linkConfig.refListHint' : 'linkConfig.refHint', { table: reference.table });
    if (GristAPI.isHelperColumn(colId)) {
      const shownBy = GristAPI.getColumns(tableId).find(c => GristAPI.getDisplayColumn(tableId, c) === colId);
      const shown = GristAPI.referenceOf(shownBy && GristAPI.getColumnType(tableId, shownBy));
      if (shown) return shown.table;
    }
    return tableId;
  }
  // Remplit une liste de colonnes de la fenêtre de liaison. Un choix désactivé en première position force un choix explicite : sans lui, un <select>
  // que personne n'a touché reste sur « Identifiant de ligne » (la première option), pour une règle qui a l'air valide mais compare deux identifiants
  // de ligne sans rapport. Les options sont construites par le DOM (du texte, jamais du HTML) : un identifiant créé par l'API REST de Grist ne peut
  // rien injecter. Le nom et l'indice sont aussi en data-name et data-hint, pour SearchSelect.
  function fillColumnSelect(select, tableId) {
    select.textContent = '';
    const placeholder = Dom.option('', I18n.t('linkConfig.columnPlaceholder'));
    placeholder.disabled = true;
    placeholder.selected = true;
    select.appendChild(placeholder);
    const add = (value, name, hint) => {
      const option = Dom.option(value, name + ' (' + hint + ')');
      option.dataset.name = name;
      option.dataset.hint = hint;
      select.appendChild(option);
    };
    add('id', I18n.t('linkConfig.rowId'), tableId);
    GristAPI.getColumns(tableId).forEach(colId => add(colId, colId, columnHint(tableId, colId)));
  }
  function describeRule(rule) {
    if (rule.mode === 'singleton') return I18n.t('linkConfig.describeSingleton');
    const rowIdLabel = I18n.t('linkConfig.describeRowId');
    return `${rule.colonneCible === 'id' ? rowIdLabel : rule.colonneCible} = ${rule.colonneSource === 'id' ? rowIdLabel : rule.colonneSource}`;
  }
  // La règle proposée d'office quand une seule colonne Référence relie les deux tables : de la table de la page vers la table liée (une commande vers
  // son client), sinon de la table liée vers celle de la page (les congés d'un employé : c'est Congés.Employe qui référence Employés, pas l'inverse).
  // null s'il y a plusieurs candidates ou aucune.
  async function guessLinkRule(targetTable, currentTableId) {
    const forward = await GristAPI.findReferenceColumns(currentTableId, targetTable);
    if (forward.length === 1) return { colonneCible: 'id', colonneSource: forward[0] };
    const reverse = await GristAPI.findReferenceColumns(targetTable, currentTableId);
    return reverse.length === 1 ? { colonneCible: reverse[0], colonneSource: 'id' } : null;
  }
  // L'aperçu d'une règle : ce qu'elle donnerait pour la ligne actuellement sélectionnée, { text, good } (`good` : une issue positive, que la fenêtre
  // marque en vert). La colonne source est lue comme la résolution réelle (ruleSourceValue) : sans cela l'aperçu annoncerait « aucune ligne » pour
  // une colonne Référence que la variable, elle, trouve.
  async function linkRulePreview(rule, targetTable, currentTableId, record) {
    const rows = await GristAPI.fetchTableRows(targetTable);
    if (rule.mode === 'singleton') {
      const first = lowestRow(rows);
      return first
        ? { text: I18n.t('linkConfig.previewSingleton', { id: first.id, table: targetTable }), good: true }
        : { text: I18n.t('linkConfig.previewTableEmpty', { table: targetTable }) };
    }
    const sourceVal = await ruleSourceValue(rule, record, currentTableId, GristAPI.fetchTableRows);
    const matches = matchingRows(rows, rule, sourceVal);
    return matches.length
      ? { text: I18n.t('linkConfig.previewMatches', { count: matches.length, table: targetTable, ids: matches.map(r => r.id).join(', ') }), good: true }
      : { text: I18n.t('linkConfig.previewNoMatch', { table: targetTable, value: sourceVal }) };
  }
  // La fenêtre de la règle de `targetTable` (#link-config-modal), partagée par l'insertion (`existingRule` null : règle devinée quand une seule
  // colonne Référence relie les deux tables) et le panneau de gestion (règle à modifier). Rend { mode, colonneCible, colonneSource }, ou null quand
  // la personne annule.
  async function showLinkConfigModal(targetTable, currentTableId, existingRule) {
    const modal = document.getElementById('link-config-modal');
    if (!modal) return null;
    const $ = id => document.getElementById('link-config-' + id);
    const selectCible = $('col-cible');
    const selectSource = $('col-source');
    const preview = $('preview');
    $('title').textContent = `${currentTableId} → ${targetTable}`;
    $('table-cible-name').textContent = targetTable;
    $('table-source-name').textContent = currentTableId;
    fillColumnSelect(selectCible, targetTable);
    fillColumnSelect(selectSource, currentTableId);

    // Le mode « match » est le cas normal ; « singleton » doit être un choix actif, pas un état dans lequel on tombe sans le réaliser.
    const initial = existingRule || { mode: 'match', ...(await guessLinkRule(targetTable, currentTableId)) };
    if (initial.colonneCible) selectCible.value = initial.colonneCible;
    if (initial.colonneSource) selectSource.value = initial.colonneSource;
    // Des listes avec recherche (js/search-select.js) par-dessus les deux <select>, qui restent la source des valeurs et des évènements `change` ; si
    // le composant échoue, les <select> natifs servent.
    const searchLists = [];
    [[selectSource, 'link-config-table-source-name'], [selectCible, 'link-config-table-cible-name']].forEach(([select, labelId]) => {
      try {
        searchLists.push(SearchSelect.attach(select, { labelledBy: labelId, searchPlaceholder: I18n.t('linkConfig.searchColumns'), emptyText: I18n.t('linkConfig.noColumnMatch') }));
      } catch (e) {
        console.warn('[variables] recherche de colonne indisponible, liste native conservée', e);
      }
    });

    // Le cas rare (« ligne fixe ») est un lien texte, pas un choix à égalité avec le cas normal : le mode se bascule avec les deux boutons-liens.
    let mode = initial.mode;
    const matchFields = $('match-fields');
    const toSingleton = $('toggle-singleton');
    const toMatch = $('toggle-match');
    const showMode = () => {
      matchFields.hidden = mode !== 'match';
      toSingleton.hidden = mode !== 'match';
      toMatch.hidden = mode === 'match';
    };
    const ruleOfForm = () => {
      if (mode === 'singleton') return { mode };
      return selectCible.value && selectSource.value ? { mode, colonneCible: selectCible.value, colonneSource: selectSource.value } : null;
    };
    async function updatePreview() {
      preview.classList.remove('is-good');
      const rule = ruleOfForm();
      if (!rule) { preview.textContent = I18n.t('linkConfig.previewChooseColumns'); return; }
      const record = GristAPI.getCurrentRecord();
      if (!record) { preview.textContent = I18n.t('linkConfig.previewNoRecord'); return; }
      preview.textContent = I18n.t('linkConfig.previewComputing');
      try {
        const { text, good } = await linkRulePreview(rule, targetTable, currentTableId, record);
        preview.textContent = text;
        preview.classList.toggle('is-good', !!good);
      } catch (e) {
        console.warn('[variables] aperçu de la règle indisponible', e);
        preview.textContent = I18n.t('linkConfig.previewUnavailable');
      }
    }
    const setMode = next => () => { mode = next; showMode(); updatePreview(); };

    const listeners = [];
    const on = (target, type, handler) => {
      target.addEventListener(type, handler);
      listeners.push(() => target.removeEventListener(type, handler));
    };
    on(toSingleton, 'click', setMode('singleton'));
    on(toMatch, 'click', setMode('match'));
    on(selectCible, 'change', updatePreview);
    on(selectSource, 'change', updatePreview);
    showMode();
    modal.style.display = 'flex';
    updatePreview();

    return new Promise(resolve => {
      const finish = rule => {
        modal.style.display = 'none';
        searchLists.forEach(list => list.destroy());
        listeners.forEach(off => off());
        resolve(rule);
      };
      on($('confirm'), 'click', () => {
        const rule = ruleOfForm();
        if (rule) finish(rule);
        else preview.textContent = I18n.t('linkConfig.chooseBeforeConfirm');
      });
      on($('cancel'), 'click', () => finish(null));
    });
  }
  // Ouvre la fenêtre de la règle de `targetTable` et l'enregistre ; faux quand la personne annule.
  async function configureLink(targetTable, currentTableId, existingRule) {
    const rule = await showLinkConfigModal(targetTable, currentTableId, existingRule);
    if (!rule) return false;
    await GristAPI.saveLinkRule(targetTable, rule);
    refreshLinkRulesPanel();
    return true;
  }
  // Si la variable vient d'une autre table sans règle encore configurée, ouvre la fenêtre et enregistre la règle avant l'insertion. Faux quand la
  // personne annule (rien n'est alors inséré).
  async function ensureLinkConfigured(item) {
    const currentTableId = GristAPI.getCurrentTableId();
    if (!currentTableId || item.table === currentTableId || GristAPI.getLinkRule(item.table)) return true;
    return configureLink(item.table, currentTableId, null);
  }
  // Modifie la règle d'une table déjà liée (même fenêtre qu'à l'insertion), pour le panneau « Tables liées » ci-dessous et le lien « Modifier le
  // lien » de la fenêtre de condition d'une variable (js/variable-condition.js). Vrai si une nouvelle règle a été enregistrée.
  async function editLinkRule(tableCible) {
    const currentTableId = GristAPI.getCurrentTableId();
    return !!currentTableId && configureLink(tableCible, currentTableId, GristAPI.getLinkRule(tableCible));
  }
  // La colonne qui porte le lien d'une règle « match », pour les libellés des fenêtres d'une variable (condition, autres attributs) : côté table de
  // la page (« Dossiers.Responsable ») ou côté table liée (« Planning.Dossier »), sinon les deux colonnes comparées. Vide pour « singleton » (pas de
  // colonne de lien).
  function describeLinkVia(tableCible, rule, currentTableId) {
    if (!rule || rule.mode !== 'match') return '';
    if (rule.colonneCible === 'id') return currentTableId + '.' + rule.colonneSource;
    if (rule.colonneSource === 'id') return tableCible + '.' + rule.colonneCible;
    return currentTableId + '.' + rule.colonneSource + ' = ' + tableCible + '.' + rule.colonneCible;
  }
  // Les modèles dont le contenu contient au moins une bulle #Variable vers `tableCible` : une recherche brute sur l'attribut sérialisé suffit, sans
  // DOMParser. Sert à avertir avant de supprimer une règle encore utilisée ailleurs.
  function findTemplatesUsingTable(tableCible) {
    const needle = 'data-table="' + tableCible + '"';
    return Templates.getCached().filter(tpl => tpl.contenu && tpl.contenu.indexOf(needle) !== -1);
  }
  async function confirmDeleteLinkRule(rule) {
    const affected = findTemplatesUsingTable(rule.tableCible);
    // La question fait le titre de la fenêtre ; les modèles touchés et leur conséquence en font le message (le texte commence par des retours à la
    // ligne que la fenêtre n'affiche pas).
    const message = affected.length
      ? I18n.t('linkRules.confirmDeleteAffected', {
        names: affected.map(t => t.nom || I18n.t('linkRules.unnamed')).join(', '),
        plural: affected.length > 1 ? I18n.t('linkRules.theseTemplates') : I18n.t('linkRules.thisTemplate'),
      }).trim()
      : '';
    if (!(await Dialogs.confirm({ title: I18n.t('linkRules.confirmDelete', { table: rule.tableCible }), message, confirmLabel: I18n.t('common.delete'), danger: true }))) return;
    await GristAPI.deleteLinkRule(rule.tableCible);
    refreshLinkRulesPanel();
  }
  function linkRuleRow(rule) {
    const iconButton = (kind, label, onClick) => {
      const button = Dom.button('link-rule-btn link-rule-btn-' + kind);
      button.setAttribute('aria-label', label);
      button.title = label;
      button.addEventListener('click', onClick);
      return button;
    };
    const row = Dom.el('div', 'link-rule-row');
    row.append(
      Dom.el('span', 'link-rule-label', `${rule.tableCible} : ${describeRule(rule)}`),
      iconButton('edit', I18n.t('linkRules.edit'), () => editLinkRule(rule.tableCible)),
      iconButton('delete', I18n.t('linkRules.delete'), () => confirmDeleteLinkRule(rule)),
    );
    return row;
  }
  // Le panneau de gestion (#link-rules-modal) : les tables déjà configurées, avec un bouton pour modifier ou supprimer chaque règle. Appelé au
  // démarrage et à chaque ouverture de la fenêtre (js/main.js).
  function refreshLinkRulesPanel() {
    const list = document.getElementById('link-rules-list');
    if (!list) return;
    const rules = GristAPI.getAllLinkRules();
    list.replaceChildren(...(rules.length ? rules.map(linkRuleRow) : [Dom.el('p', 'link-rules-empty', I18n.t('linkRules.empty'))]));
  }

  // Exporté pour d'autres modules : resolveRawValue (js/condition-rules.js évalue une condition sur la valeur brute, par le même chemin qu'une
  // #Variable) ; ensureLinkConfigured, editLinkRule, describeLinkVia, resolveLinkedRows, resolveRows, formatValue, cellValue (les fenêtres de
  // condition et d'autres attributs, js/variable-condition.js et js/variable-linked-attrs.js) ; zeroHidden (la barre flottante d'une bulle nombre,
  // js/floating-toolbars.js, lit la même règle que le rendu) ; currentTables et prioritizeTables (le menu Image de la barre, js/main-toolbar.js,
  // classe ses colonnes comme la liste « # »).
  return {
    createExtension, resolveVariable, resolveVariableResult, resolveRawValue, resolveTextVariables, replaceTextVariables, findTextVariables, resolveAttachmentIds, refreshLinkRulesPanel, initFilenameInput, triggerChar,
    preferChipsTab, ensureLinkConfigured, editLinkRule, describeLinkVia, resolveLinkedRows, resolveRows, formatValue, listTexts, resolveListTexts, zeroHidden, cellValue, currentTables, prioritizeTables,
    resolveCalcResult, resolveCalc, calcProblem, formulaErrorText,
  };
})();
