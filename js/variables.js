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

  // Ce que la liste « # » lit après le déclencheur : des lettres, des chiffres, des espaces (le navigateur écrit une espace insécable en fin de ligne),
  // « _ », « . » et « - », les mots d'un nom de colonne (js/search-select.js:searchWords). Une espace juste après le déclencheur n'ouvre rien (« # » puis
  // une espace est du texte, comme avant) et toute autre ponctuation ferme la liste : « #Titre, » n'est pas une recherche, Entrée n'y pose pas la variable.
  const QUERY_CHARS = '[\\p{L}\\p{N}_.\\s-]*';
  const NAME_QUERY = new RegExp('^(?!\\s)' + QUERY_CHARS + '$', 'u');

  let acBox = null;
  let acItemsBox = null;
  let currentItems = [];
  let selectedIndex = 0;
  // Dernières props de @tiptap/suggestion : un clic sur un onglet rejoue updateItems() avec elles, n'étant pas un évènement du plugin. `latestFieldMode` :
  // ce sont celles de la liste d'un champ texte à bulles (fieldMode).
  let latestProps = null;
  let latestFieldMode = false;
  // La commande de l'entrée choisie : @tiptap/suggestion ne la donne qu'à onStart et onUpdate, jamais à onKeyDown ni au clic de souris.
  let latestCommand = null;
  // Onglet actif du panneau « # » (le champ texte d'une fenêtre - QR code, calcul - n'a pas celui des puces) ; 'variables' à chaque ouverture.
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

  const { SMART_CHIP_ITEMS, displayKey, ensureBox } = (function () {
    // La boîte de la liste : les entrées fixes de l'onglet des puces et la création de la boîte

    // Entrées fixes de l'onglet des puces (jamais issues de GristAPI) : `kind: 'chip'` les distingue d'une #Variable ; `i18nKey` est résolu à
    // l'affichage (displayKey), pour suivre un changement de langue. `inField` : la puce se pose aussi dans un champ texte (Objet, À, Cc, Cci, nom du PDF),
    // où elle s'écrit en texte - une valeur du moment, pas un bloc ni une note.
    const SMART_CHIP_ITEMS = [
      { key: 'Note de bas de page', i18nKey: 'chips.footnote', kind: 'chip', chipKind: 'footnote' },
      { key: 'Date du jour', i18nKey: 'chips.date', kind: 'chip', chipKind: 'date', inField: true },
      { key: 'Heure actuelle', i18nKey: 'chips.time', kind: 'chip', chipKind: 'time', inField: true },
      { key: 'Email de l’utilisateur', i18nKey: 'chips.email', kind: 'chip', chipKind: 'email', inField: true },
      { key: 'Nom de l’utilisateur', i18nKey: 'chips.name', kind: 'chip', chipKind: 'name', inField: true },
      // Le rang de la ligne dans une zone répétée par une Boucle (1, 2, 3...), écrit à la Lecture et à l'export (js/loop-rules.js, itemBinding) ; une
      // puce comme la date, mais qui n'a de sens que dans un document : elle n'entre pas dans un champ texte.
      { key: 'N° de ligne', i18nKey: 'chips.rowNumber', kind: 'chip', chipKind: 'rowNumber' },
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
        // La liste n'est créée qu'une fois : data-i18n fait relire le libellé à I18n.applyTranslations quand la personne change de langue (« Puces » / « Chips »).
        tab.setAttribute('data-i18n', label);
        // mousedown + preventDefault (pas click) : un blur du focus de l'éditeur ne perturbe pas le changement d'onglet.
        tab.addEventListener('mousedown', e => {
          e.preventDefault();
          if (activeTab === name) return;
          activeTab = name;
          if (latestProps) updateItems(Object.assign({}, latestProps, { items: computeItems(latestProps.query, latestProps.editor, latestFieldMode) }), latestFieldMode);
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
    return { SMART_CHIP_ITEMS, displayKey, ensureBox };
  })();

  const { currentTables, prioritizeTables, matchingVariables, columnSearchText, referencedTable, crossedListTable, writesList, columnsBelow, refreshSchemaOnce, computeItems, fieldItems } = (function () {
    // Les entrées de la liste : tables en cours, variables qui correspondent, onglet actif

    // Tables « en cours », la plus proche d'abord : celles que parcourent les zones répétées où est le curseur, de la plus proche à la plus large
    // (js/variable-loop.js:loopTablesAt ; `editor` absent hors de l'éditeur, nom du fichier PDF), puis celle de la page. Vide tant que la page n'a pas de
    // table.
    function currentTables(editor) {
      const loopTables = editor ? VariableLoop.loopTablesAt(editor.state, editor.state.selection.from) : [];
      return loopTables.concat(GristAPI.getCurrentTableId()).filter((table, index, all) => table && all.indexOf(table) === index);
    }
    // `items` ({ table, … }) avec les colonnes des tables « en cours » en tête : chaque table de `tables` dans cet ordre, puis les autres, l'ordre
    // d'origine gardé dans chaque groupe. À appliquer avant toute limite de longueur, sans quoi une table qui vient tard dans le schéma voit ses
    // colonnes écartées par celles des tables d'avant.
    function prioritizeTables(items, tables) {
      const groups = tables.map(() => []);
      const others = [];
      items.forEach(item => { const rank = tables.indexOf(item.table); (rank === -1 ? others : groups[rank]).push(item); });
      return [].concat(...groups, others);
    }

    // Les noms sous lesquels une colonne se cherche, d'un seul tenant : sa clé « Table.Colonne » (la table se cherche avec la colonne) et son libellé Grist
    // (js/grist-api.js:getColumnLabel). Pour la liste « # » comme pour le `data-search` des listes avec recherche (js/search-select.js). `column` peut être
    // un chemin « Accompagnateur.Email » (GristAPI.resolveColumnPath) : le libellé de chacune de ses colonnes se cherche aussi.
    function columnSearchText(table, column) {
      if (String(column).indexOf('.') === -1) {
        const label = GristAPI.getColumnLabel(table, column);
        return table + '.' + column + (label ? ' ' + label : '');
      }
      const labels = [];
      let at = table;
      String(column).split('.').forEach(hop => {
        const label = at && GristAPI.getColumnLabel(at, hop);
        if (label) labels.push(label);
        at = at && GristAPI.tableAtEndOf(at, [hop]);
      });
      return table + '.' + column + (labels.length ? ' ' + labels.join(' ') : '');
    }

    // La table que désigne la colonne Référence `column` de `table` (ou le chemin « Ref.Ref » qui y mène), null pour toute autre colonne : une liste de
    // références désigne plusieurs lignes, la flèche n'en ouvre qu'une (`singleOnly`). La destination de la flèche des listes de colonnes
    // (js/search-select.js, `expand`) et de celle d'« Autres attributs » (js/variable-linked-attrs.js) ; on arrive dans une liste de références par sa
    // bulle, pas par une flèche.
    function referencedTable(table, column) {
      const target = GristAPI.tableAtEndOf(table, String(column).split('.'), true);
      return target && GristAPI.getTables().indexOf(target) !== -1 ? target : null;
    }
    // La table dont une liste de références désigne les lignes quand la suite de colonnes Référence `hops`, partie de `table`, en traverse une, null
    // sinon : ce qu'on lit au bout du chemin est alors une valeur par ligne de la liste (resolveRows, `multi`), pas une seule. La fenêtre « Liste »
    // d'une bulle (js/variable-list.js) et celle d'« Autres attributs » (js/variable-linked-attrs.js) lisent la même règle.
    function crossedListTable(table, hops) {
      let at = table;
      for (const hop of hops) {
        const ref = GristAPI.referenceOf(GristAPI.getColumnType(at, hop));
        if (!ref) return null;
        if (ref.list) return ref.table;
        at = ref.table;
      }
      return null;
    }
    // Vrai quand la colonne `column` de `table`, ou le chemin « Equipe.Email » qui y mène, s'écrit en liste : une colonne Liste de choix ou Liste de
    // références, ou un chemin qui traverse une liste de références. C'est ce que règle la fenêtre « Liste » (js/variable-list.js) ; « Remplacer »
    // d'Autres attributs en garde le réglage d'une bulle à l'autre.
    function writesList(table, column) {
      const hops = String(column).split('.');
      hops.pop();
      return VariableFormat.isListType(GristAPI.getColumnType(table, column)) || !!crossedListTable(table, hops);
    }

    // Les lignes où mène la flèche de la colonne `key` (« Table.Colonne » ou le chemin « Table.Référence.Colonne » qui y mène) dans une liste de colonnes
    // (js/search-select.js, option `expand`) : les colonnes de la table qu'elle désigne, null si `key` n'est pas une Référence simple. Chaque ligne est
    // le chemin entier (« Projet.Accompagnateur.Email », celui que résout resolveRawValue) nommé par sa colonne seule : le fil d'Ariane de la liste dit
    // par où l'on est descendu. `hintOf(table, colonne)`, facultatif, donne l'indice discret de la ligne (son type).
    function columnsBelow(key, hintOf) {
      const cut = String(key).indexOf('.');
      const table = cut === -1 ? '' : key.slice(0, cut);
      const target = table ? referencedTable(table, key.slice(cut + 1)) : null;
      if (!target) return null;
      return GristAPI.getVisibleColumns(target).map(column => ({
        value: key + '.' + column,
        name: column,
        hint: hintOf ? hintOf(target, column) : '',
        search: columnSearchText(target, column),
        expand: referencedTable(target, column) || '',
      }));
    }

    // Le test d'un nom pour la saisie `query` de la liste « # » : tous ses mots (js/search-select.js:searchWords) dans `search` (les noms de l'entrée, d'un
    // seul tenant) et, pour un mot qui finit par un point, ce point-là dans `key`, tel quel. Un point ne compte pas dans un nom (« Porteur.3 » vaut
    // « Porteur 3 »), sauf tout à la fin d'un mot, où il peut finir la phrase : « #Projets. » propose les colonnes de Projets, comme avant, mais « Voir
    // #Projets.Nom. » ne propose plus rien (la liste se refermait au point, Entrée ne pose pas la variable).
    function nameTest(query) {
      const words = SearchSelect.searchWords(query);
      const dotted = SearchSelect.normalize(query).split(/\s+/).filter(word => word.endsWith('.'));
      return (search, key) => SearchSelect.foundIn(words, SearchSelect.searchKey(search))
        && (!dotted.length || dotted.every(word => SearchSelect.normalize(key).includes(word)));
    }

    // Les variables dont les noms contiennent les mots de la saisie `query`, sans les colonnes d'aide : la recherche par nom de toutes les listes
    // (js/search-select.js:searchWords), donc sans accents ni casse, sans compter « _ », « . » ni « - », les mots (séparés par une espace) dans n'importe
    // quel ordre : « porteur 3 » et « Porteur3 » retrouvent Projets.Porteur_3. Aucune limite de longueur : la personne cherche par le nom, elle ne fait
    // pas défiler la liste.
    function matchingVariables(query) {
      const found = nameTest(query);
      return GristAPI.getAllVariables().filter(v => !GristAPI.isHelperColumn(v.column) && found(columnSearchText(v.table, v.column), v.key));
    }

    function refreshSchemaOnce() {
      if (schemaRefreshedForSession) return;
      schemaRefreshedForSession = true;
      GristAPI.refreshSchema().catch(e => console.warn('[variables] rafraîchissement du schéma échoué', e));
    }

    // Les entrées de l'onglet actif, pour l'`items()` de @tiptap/suggestion (à chaque frappe) comme pour le clic sur un onglet. `editor` (facultatif) :
    // les colonnes de la table de la page viennent en tête ; dans une zone répétée, celles de la table parcourue passent avant elles. `fieldMode` : la
    // liste d'un champ texte (Objet, À, Cc, Cci, nom du PDF), qui n'a que des variables et les puces qui s'écrivent en texte (`inField` : date, heure,
    // email et nom de l'utilisateur) - ni note de bas de page, ni bloc conditionnel, ni calcul.
    function computeItems(query, editor, fieldMode) {
      if (!NAME_QUERY.test(query)) return [];
      if (activeTab === 'chips') {
        // Pas de note de bas de page dans un en-tête ou un pied : la zone est répétée sur chaque page, sans repère de page physique où ancrer une note.
        let items = SMART_CHIP_ITEMS;
        if (fieldMode) items = items.filter(v => v.inField);
        else if (Editor.isEditingHeaderFooter()) items = items.filter(v => v.chipKind !== 'footnote');
        const found = nameTest(query);
        return items.filter(v => found(displayKey(v), displayKey(v)));
      }
      refreshSchemaOnce();
      return fieldMode ? fieldItems(query, editor) : prioritizeTables(matchingVariables(query), currentTables(editor));
    }
    // La liste d'un champ texte, celle des champs à bulles (computeItems) comme celle d'un <input> (checkForFilenameTrigger) : après « Projet.Accompagnateur. »,
    // les colonnes de la ligne que désigne cette Référence (pathItems) ; sinon la saisie cherche la colonne par son nom (matchingVariables), celles de la
    // table de la page d'abord. Une clé tapée en entier, seule proposition, n'a rien à compléter (clé tapée à la main, curseur revenu derrière une variable
    // posée) : la liste reste fermée, une espace ou un tiret tapé derrière elle n'y change rien.
    function fieldItems(query, editor) {
      const items = pathItems(query) || prioritizeTables(matchingVariables(query), currentTables(editor));
      const typed = SearchSelect.normalize(query).replace(/[\s-]+$/, '');
      if (!items.length || (items.length === 1 && SearchSelect.normalize(items[0].key) === typed)) return [];
      return items;
    }
    return { currentTables, prioritizeTables, matchingVariables, columnSearchText, referencedTable, crossedListTable, writesList, columnsBelow, refreshSchemaOnce, computeItems, fieldItems };
  })();

  const { setTabsVisible, render, select, moveSelection, position, preferChipsTab } = (function () {
    // L'affichage de la liste : onglets, lignes, ligne choisie, position

    // Le champ texte d'une fenêtre (le QR code, le calcul d'une bulle) réutilise cette boîte sans l'onglet des puces (aucun nœud ProseMirror à y insérer) :
    // masqué plutôt que retiré du DOM.
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
    return { setTabsVisible, render, select, moveSelection, position, preferChipsTab };
  })();

  const { updateItems, hide, suggestionRender } = (function () {
    // La mise à jour de la liste et l'objet de rendu de @tiptap/suggestion

    // `fieldMode` : la liste d'un champ texte, dont l'onglet des puces n'a que celles qui s'écrivent en texte.
    function updateItems(props, fieldMode) {
      latestProps = props;
      latestFieldMode = !!fieldMode;
      currentItems = props.items || [];
      // Avec un texte à entourer en attente, « Texte conditionnel » est l'entrée choisie : Entrée suffit.
      const wrapIndex = !fieldMode && ConditionalText.hasPending() ? currentItems.findIndex(item => item.chipKind === 'conditionalText') : -1;
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
    function suggestionRender(fieldMode) {
      return {
        onStart: props => updateItems(props, fieldMode),
        onUpdate: props => updateItems(props, fieldMode),
        onKeyDown(props) {
          if (!currentItems.length) return false;
          if (props.event.key === 'ArrowDown') { moveSelection(1); return true; }
          if (props.event.key === 'ArrowUp') { moveSelection(-1); return true; }
          if (props.event.key === 'Enter' || props.event.key === 'Tab') { latestCommand(currentItems[selectedIndex]); return true; }
          if (props.event.key === 'Escape') { hide(); return true; }
          return false;
        },
        onExit() {
          hide();
          schemaRefreshedForSession = false;
          activeTab = 'variables';
          if (!fieldMode) ConditionalText.cancelPending();
        },
      };
    }
    return { updateItems, hide, suggestionRender };
  })();

  const { createExtension, createFieldExtension } = (function () {
    // Les insertions (puces, note de bas de page, variable) et l'extension TipTap

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
      // Dans une zone répétée pour cette table (ou pour une table qui entoure cette zone), la variable lit la ligne du tour : aucun lien à configurer
      // (js/loop-rules.js). Aucun non plus pour une table dont les lignes se rattachent à celles de la zone : sa boucle se pose ensuite sur la bulle
      // (js/variable-loop.js:nestableAt).
      const inLoop = VariableLoop.loopTablesAt(editor.state, range.from).indexOf(item.table) !== -1 || VariableLoop.nestableAt(editor.state, range.from, item);
      if (!inLoop && !(await ensureLinkConfigured(item))) return;
      editor.chain().focus().insertContentAt(range, { type: 'varBadge', attrs: { table: item.table, column: item.column, key: item.key } }).run();
    }

    // Le choix d'une ligne de la liste, dans l'éditeur du document comme dans un champ texte à bulles : une puce ou une bulle de variable.
    function insertItem(editor, range, item) {
      if (item.kind === 'chip') insertChip(editor, range, item.chipKind);
      else insertVariable(editor, range, item);
    }

    // Ce que les deux listes « # » (le corps du modèle, les champs texte à bulles) ont en commun : le déclencheur - réglable dans le panneau Réglages, un
    // changement n'a effet qu'après rechargement, ce `char` étant lu une fois, à la construction de l'éditeur - et la saisie jusqu'au curseur, espaces
    // comprises : « #porteur 3 » cherche les deux mots (la liste se vide, et se tait, dès qu'aucune colonne ne les porte tous).
    const suggestionBase = editor => ({ editor, char: triggerChar(), allowSpaces: true });

    // Reçoit les classes Extension et Suggestion plutôt que de les importer : editor.js les a déjà chargées au même moment.
    function createExtension(Extension, Suggestion) {
      return Extension.create({
        name: 'varBadgeSuggestion',
        // Avant les autres extensions : dans une case de grille ou de tableau, les flèches (et Tab) de prosemirror-tables passeraient sinon avant la liste
        // ouverte, qui ne verrait jamais la touche - le curseur changerait de case au lieu de parcourir les colonnes. Hors liste ouverte (ou liste sans
        // ligne), elle rend la main sans rien consommer.
        priority: 1000,
        addProseMirrorPlugins() {
          return [
            Suggestion(Object.assign(suggestionBase(this.editor), {
              // Jamais dans un bloc de code : un « # » de commentaire ou de couleur (#fff) y ouvrirait la liste, et une bulle ne peut pas vivre dans du
              // texte brut.
              allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code,
              items: ({ query, editor }) => computeItems(query, editor),
              command: ({ editor, range, props }) => insertItem(editor, range, props),
              render: suggestionRender,
            })),
          ];
        },
      });
    }
    // L'extension TipTap d'un champ texte à bulles (js/field-editor.js) : le « # » ouvre la même liste que dans l'éditeur, dont l'onglet des puces n'a que
    // celles qui s'écrivent en texte, et le choix pose une bulle ou une puce. Même demande de clé de correspondance qu'à l'insertion d'une bulle du corps
    // (insertVariable). Le déclencheur s'ouvre
    // derrière n'importe quel caractère (`allowedPrefixes: null`), comme dans le champ texte d'avant : « Suivi_#Projet.Nom » est le nom de fichier
    // type, et l'éditeur du corps, lui, n'ouvre la liste qu'après une espace.
    function createFieldExtension(Extension, Suggestion) {
      return Extension.create({
        name: 'fieldVariableSuggestion',
        // La liste, partagée par tous les champs et par le document, ne reste pas ouverte sous un champ que le curseur a quitté. Un clic sur une ligne
        // de la liste garde le focus du champ (mousedown sans effet par défaut, cf. ensureBox) : il n'arrive pas ici.
        onBlur() { hide(); },
        addProseMirrorPlugins() {
          return [
            Suggestion(Object.assign(suggestionBase(this.editor), {
              allowedPrefixes: null,
              items: ({ query, editor }) => computeItems(query, editor, true),
              // La liste se ferme au choix : la fenêtre de la clé de correspondance, si elle s'ouvre, ne la retrouve pas ouverte derrière elle, et un refus laisse le
              // texte tapé sans liste, comme le champ d'avant.
              command: ({ editor, range, props }) => { hide(); insertItem(editor, range, props); },
              render: () => suggestionRender(true),
            })),
          ];
        },
      });
    }
    return { createExtension, createFieldExtension };
  })();

  const { checkForFilenameTrigger, pathItems } = (function () {
    // La liste d'un champ texte : chemins de références et déclencheur

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
      const words = SearchSelect.searchWords(raw.slice(cut + 1));
      const found = c => SearchSelect.foundIn(words, SearchSelect.searchKey(c, GristAPI.getColumnLabel(reached, c)));
      return GristAPI.getVisibleColumns(reached).filter(found).map(c => {
        const path = hops.concat(c).join('.');
        return { key: table + '.' + path, table, column: path };
      });
    }
    function checkForFilenameTrigger(el) {
      if (insertingFilenameVariable) return;
      const closeList = () => { hide(); filenameInputState = null; schemaRefreshedForSession = false; };
      const caret = el.selectionStart;
      if (caret == null) { closeList(); return; }
      // Les mêmes caractères que dans l'éditeur (QUERY_CHARS) : « #télé » retrouve Telephone et « #porteur 3 » Projets.Porteur_3.
      const match = el.value.slice(0, caret).match(new RegExp(triggerChar().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '((?!\\s)' + QUERY_CHARS + ')$', 'u'));
      if (!match) { closeList(); return; }
      // Relu dès le premier caractère tapé après le déclencheur : sinon chercher une colonne toute neuve ne trouverait rien, la liste vide se fermant
      // avant d'avoir pu relire.
      refreshSchemaOnce();
      // La même liste que celle des champs à bulles ; vide, elle reste fermée.
      const items = fieldItems(match[1]);
      if (!items.length) { hide(); filenameInputState = null; return; }
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
    return { checkForFilenameTrigger, pathItems };
  })();
  const { insertFilenameVariable, initFilenameInput } = (function () {
    // L'insertion dans un champ texte et son clavier

    // Pose « #Clé » en texte brut, sans bulle (un <input> ne contient pas de HTML) : ReaderMode.resolveFilename la remplace à l'export. Une variable
    // d'une autre table demande sa clé de correspondance quand on la choisit dans un champ qui n'est pas dans une fenêtre, comme à l'insertion d'une
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
    return { insertFilenameVariable, initFilenameInput };
  })();

  const { zeroHidden, formatValue, listTexts } = (function () {
    // Le texte d'une valeur : zéro caché, mise en forme, liste

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
      if (Array.isArray(val)) return formatList(val, format, varTable, varColumn, opts, drop);
      if (drop && VariableFormat.isZero(val)) return '';
      // Oui / Non : « vrai » / « faux » sans réglage (la barre « Oui / Non », js/floating-toolbars.js, le montre enfoncé), une case ☑ / ☐ avec l'un des
      // trois styles de case.
      if (typeof val === 'boolean') return opts.rawNumbers || opts.keepZero ? String(val) : VariableFormat.formatBool(val, format);
      const effectiveFormat = effectiveFormatOf(format, colType, val, opts);
      if (effectiveFormat && effectiveFormat.type === 'number') return VariableFormat.formatNumber(val, effectiveFormat);
      if (effectiveFormat && effectiveFormat.type === 'date') return VariableFormat.formatDate(val, effectiveFormat);
      return String(val);
    }
    // Une liste (une valeur par ligne liée d'une règle « match », ou une colonne liste) se formate élément par élément, le zéro masqué en est retiré
    // sans laisser de trou entre deux virgules ; avec un réglage de la fenêtre « Liste » (js/variable-list.js) elle s'écrit à plat, sinon les valeurs
    // sont jointes par « , ».
    function formatList(val, format, varTable, varColumn, opts, drop) {
      const style = VariableFormat.listStyle(format);
      const texts = withoutZeros(style ? VariableFormat.flattenList(val) : val, drop).map(v => formatValue(v, format, varTable, varColumn, opts));
      return style ? VariableFormat.listText(texts, style) : texts.join(', ');
    }
    // Le réglage que la valeur reçoit : celui de la bulle s'il dit son type, sinon celui que sa colonne appelle (une Date ou DateTime reçoit le
    // préréglage par défaut ; un nombre d'une colonne Numérique ou Entier, sauf dans un champ texte, s'écrit comme la barre flottante l'annonce).
    function effectiveFormatOf(format, colType, val, opts) {
      if ((format && format.type) || !colType) return format;
      if (colType === 'Date' || colType === 'DateTime') return Object.assign({}, format, { type: 'date', preset: VariableFormat.DATE_PRESETS[0].key });
      if (!opts.rawNumbers && typeof val === 'number' && (colType === 'Numeric' || colType === 'Int')) return Object.assign({}, format, { type: 'number' });
      return format;
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
    return { zeroHidden, formatValue, listTexts };
  })();
  const { unwrapRefValue, listItems, cellValue, rawRowOf, referencedRowId } = (function () {
    // La valeur d'une cellule et la ligne brute de la ligne courante

    const unwrapRefValue = v => (Array.isArray(v) ? v[1] : v);
    // Les éléments d'une cellule liste en forme brute (['L', id, id…] ; vide : null ou rien) ; une valeur seule est une liste d'un élément.
    function listItems(value) {
      if (value === null || value === undefined || value === '') return [];
      if (!Array.isArray(value)) return [value];
      return value[0] === 'L' ? value.slice(1) : value.slice();
    }

    // Valeur d'une cellule telle que Grist l'affiche, pour une ligne lue par fetchTable (autre table, export en lot, aperçu de la fenêtre de
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

    // La ligne brute (fetchTable) de la ligne courante de la page, pour une colonne que grist.onRecord n'a pas livrée (`record[colonne] === undefined`,
    // la clé absente : un champ rapporté - colonne à formule créée depuis une autre vue - qui n'est pas cochée dans les colonnes de CE widget tant que
    // includeColumns:'normal' ne l'a pas complétée, cf. js/grist-api.js:init). Lue une seule fois par ligne livrée : chaque livraison est un nouvel
    // objet, la WeakMap oublie donc d'elle-même la lecture précédente, et plusieurs colonnes absentes de la même ligne partagent une seule lecture de
    // la table. null sans identifiant de ligne (ligne « nouvelle ») ou si la lecture échoue.
    const rawRowByRecord = new WeakMap();
    function rawRowOf(table, record) {
      if (!record || typeof record !== 'object' || record.id == null) return Promise.resolve(null);
      if (!rawRowByRecord.has(record)) rawRowByRecord.set(record, GristAPI.fetchRowById(table, record.id).catch(() => null));
      return rawRowByRecord.get(record);
    }
    // L'identifiant de la ligne que désigne la colonne Référence `column` de la ligne courante de `tableId`. fetchTable (export en lot) le donne tel
    // quel, mais grist.onRecord (Lecture, export de la ligne courante) livre la valeur affichée (« Projet Alpha ») ou un objet Reference, qui ne
    // retrouve aucune ligne (« [ERREUR: ligne introuvable] » à la place de la valeur) : il est relu sur la ligne brute, comme ruleSourceValue le fait
    // pour la colonne source d'une règle. Sans ligne brute (ligne « nouvelle »), la valeur telle quelle.
    async function referencedRowId(tableId, column, record) {
      if (!GristAPI.isRawRow(record)) {
        const raw = await rawRowOf(tableId, record);
        if (raw && column in raw) return unwrapRefValue(raw[column]);
      }
      return unwrapRefValue(record[column]);
    }
    return { unwrapRefValue, listItems, cellValue, rawRowOf, referencedRowId };
  })();

  const { ruleSourceValue, lowestRow, matchingRows, resolveLinkedRows } = (function () {
    // La valeur source d'une règle de liaison et les lignes liées

    // La valeur de la colonne source d'une règle « match » pour la ligne courante. Comparée à l'identifiant de ligne de la table cible, une colonne
    // Référence doit fournir l'identifiant référencé : fetchTable (export en lot) le donne tel quel, mais grist.onRecord (Lecture, export de la ligne
    // courante) livre la valeur de la colonne affichée par la Référence (« Dupont Jean »), ou un objet Reference quand cette valeur est un nombre
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
    // variable comme pour la fenêtre « Autres attributs » (js/variable-linked-attrs.js), qui lit plusieurs colonnes de la même ligne.
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
    return { ruleSourceValue, lowestRow, matchingRows, resolveLinkedRows };
  })();

  // === Descendre de référence en référence === Une colonne « Accompagnateur.Email » (GristAPI.resolveColumnPath) part de la ligne de la table de la
  // bulle, suit la colonne Référence Accompagnateur jusqu'à la ligne de l'annuaire qu'elle désigne, et lit Email sur cette ligne, comme
  // $Projet.Accompagnateur.Email dans une formule Grist. Aucune règle de liaison n'est ajoutée pour les tables traversées : le chemin lui-même dit
  // quelle ligne, et deux références vers la même table (Accompagnateur et Porteur vers l'annuaire) donnent chacune la leur. Une colonne ordinaire
  // est un chemin sans maillon à suivre. Une liste de références (« Membres.Email ») se suit aussi : elle désigne plusieurs lignes, et l'on lit
  // Email sur chacune, dans l'ordre de la liste - une valeur par ligne, comme pour une table liée par une règle « match » (`multi`).

  const { resolveRows } = (function () {
    // Descendre de référence en référence

    // Les lignes brutes (fetchTable) de `varTable` d'où part la variable pour la ligne courante : la ligne du tour d'une zone répétée, la ligne
    // courante elle-même (relue par son identifiant : grist.onRecord ne livre que la valeur affichée d'une Référence, jamais l'id qu'il faut suivre),
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
    // référencée n'existe plus). Rend { table, rows, many } : la table atteinte et une ligne (ou null) par ligne de départ, ou { error } quand `column` n'est
    // pas une Référence. Pour une liste de références, `rows` regroupe les lignes que désignent toutes les lignes de départ, dans l'ordre de leurs listes (celles
    // qui n'existent plus sont ignorées, une liste vide ne donne rien) et `many` est vrai : il n'y a plus une ligne par ligne de départ.
    async function followReference(table, column, rows, opts) {
      const reference = GristAPI.referenceOf(GristAPI.getColumnType(table, column));
      if (!reference) return { error: I18n.t('variables.error.notReference', { table, column }) };
      if (!rows.some(Boolean)) return { table: reference.table, rows: reference.list ? [] : rows.map(() => null), many: reference.list };
      const fetchRows = (opts && opts.fetchRows) || GristAPI.fetchTableRows;
      const byId = new Map((await fetchRows(reference.table)).map(r => [r.id, r]));
      if (reference.list) {
        const listed = [];
        rows.forEach(r => { if (r) listItems(r[column]).forEach(id => { if (byId.has(id)) listed.push(byId.get(id)); }); });
        return { table: reference.table, rows: listed, many: true };
      }
      return { table: reference.table, rows: rows.map(r => (r && byId.get(unwrapRefValue(r[column]))) || null), many: false };
    }
    // Les lignes de la table où mène le chemin `hops` (suite de colonnes Référence ou liste de références) à partir de la ligne courante de `varTable` :
    // { table, rows, multi } (une ligne, ou null si le chemin s'arrête sur une référence vide, par ligne de départ ; toutes celles des listes quand le chemin en
    // traverse une, `multi` vrai) ou { error }. Sans `hops`, les lignes de départ elles-mêmes. Partagé avec la fenêtre « Autres attributs »
    // (js/variable-linked-attrs.js), qui montre les valeurs de chaque niveau du chemin.
    async function resolveRows(varTable, hops, currentTableId, record, opts) {
      if (!record) return { table: varTable, rows: [], multi: false };
      const base = await baseRows(varTable, currentTableId || GristAPI.getCurrentTableId(), record, opts);
      if (base.error) return { error: base.error };
      let table = varTable;
      let rows = base.rows;
      let multi = !!base.multi;
      for (const hop of hops) {
        const step = await followReference(table, hop, rows, opts);
        if (step.error) return { error: step.error };
        ({ table, rows } = step);
        multi = multi || step.many;
      }
      return { table, rows, multi };
    }
    return { resolveRows };
  })();
  const { resolveRawValue, resolveVariableResult, resolveVariable, resolveListTexts } = (function () {
    // La valeur brute d'une variable, son texte et ses valeurs de liste

    // La valeur de `column` lue au bout du chemin `hops` : { value }, { value: [...], multi: true } quand la règle de la table trouve plusieurs lignes ou
    // que le chemin traverse une liste de références (une valeur par ligne), ou { error }.
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
    // « match », ou un chemin qui traverse une liste de références, `value` est un tableau (une valeur par ligne liée) et `multi` le signale :
    // js/condition-rules.js:matches teste alors chaque ligne liée, sans confondre avec une ChoiceList, elle aussi un tableau.
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
    return { resolveRawValue, resolveVariableResult, resolveVariable, resolveListTexts };
  })();

  const { formulaErrorText, resolveCalcResult } = (function () {
    // Le calcul d'une bulle : message d'erreur, opérande, résultat

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
    return { formulaErrorText, resolveCalcResult };
  })();
  const { resolveCalc, badgeProblem, calcProblem, findTextVariables } = (function () {
    // Les problèmes d'un calcul et la lecture des variables d'un champ texte

    async function resolveCalc(stored, currentTableId, record, format, opts) {
      return (await resolveCalcResult(stored, currentTableId, record, format, opts)).text;
    }
    // Ce qui coupe une bulle #Variable de sa donnée, sans lire aucune cellule : null quand tout va bien, sinon 'table' (disparue), 'path' (un maillon
    // d'un chemin « Référence.Colonne » a disparu ou n'est plus une Référence) ou 'column' (absente de sa table). Rouge de la bulle de l'éditeur
    // (Editor.refreshVariableBadgeValidity) et libellé de « Colonne… » (VariableColumn.isBroken).
    function badgeProblem(table, column) {
      if (!table) return null;
      if (GristAPI.getTables().indexOf(table) === -1) return 'table';
      if (!column) return null;
      if (String(column).indexOf('.') !== -1) return GristAPI.resolveColumnPath(table, column) ? null : 'path';
      return GristAPI.getColumns(table).indexOf(column) === -1 ? 'column' : null;
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
    return { resolveCalc, badgeProblem, calcProblem, findTextVariables };
  })();

  const { replaceTextVariables, resolveTextVariables, resolveAttachmentIds } = (function () {
    // Remplacer les variables d'un champ texte, pièces jointes

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
      // Un champ dont une bulle porte un réglage est enregistré en HTML (js/field-codec.js) : la Lecture le déroule comme le corps d'un modèle.
      if (FieldCodec.isRich(text)) return ReaderMode.fieldText(text, currentTableId, record);
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
    return { replaceTextVariables, resolveTextVariables, resolveAttachmentIds };
  })();

  // === Règles de liaison entre tables ===
  // Configurées à l'insertion d'une variable d'une autre table et dans le panneau de gestion (#link-rules-modal), deux fenêtres de index.html.

  const { fillColumnSelect, describeRule, guessLinkRule, linkRulePreview } = (function () {
    // Fenêtre de liaison : indications de colonne, listes, règle devinée, aperçu

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
      const add = (value, name, hint, search) => {
        const option = Dom.option(value, name + ' (' + hint + ')');
        option.dataset.name = name;
        option.dataset.hint = hint;
        if (search) option.dataset.search = search;
        select.appendChild(option);
      };
      add('id', I18n.t('linkConfig.rowId'), tableId);
      GristAPI.getColumns(tableId).forEach(colId => add(colId, colId, columnHint(tableId, colId), columnSearchText(tableId, colId)));
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
    return { fillColumnSelect, describeRule, guessLinkRule, linkRulePreview };
  })();
  const { showLinkConfigModal } = (function () {
    // La fenêtre d'une règle de liaison : ouverture, remplissage, listes à recherche

    // La fenêtre de la règle de `targetTable` (#link-config-modal), partagée par l'insertion (`existingRule` null : règle devinée quand une seule
    // colonne Référence relie les deux tables) et le panneau de gestion (règle à modifier). Rend { mode, colonneCible, colonneSource }, ou null quand
    // la personne annule.
    async function showLinkConfigModal(targetTable, currentTableId, existingRule) {
      const modal = document.getElementById('link-config-modal');
      if (!modal) return null;
      const form = linkConfigForm(modal, targetTable, currentTableId);
      fillLinkConfigForm(form);

      // Le mode « match » est le cas normal ; « singleton » doit être un choix actif, pas un état dans lequel on tombe sans le réaliser.
      const initial = existingRule || { mode: 'match', ...(await guessLinkRule(targetTable, currentTableId)) };
      if (initial.colonneCible) form.selectCible.value = initial.colonneCible;
      if (initial.colonneSource) form.selectSource.value = initial.colonneSource;
      attachColumnSearch(form);
      form.mode = initial.mode;
      wireLinkConfigForm(form);
      return waitForLinkRule(form);
    }
    // Ce que la fenêtre ouverte garde : ses deux listes de colonnes et l'aperçu, le mode choisi, les listes à recherche et les écouteurs à défaire à la
    // fermeture.
    function linkConfigForm(modal, targetTable, currentTableId) {
      const $ = id => document.getElementById('link-config-' + id);
      return { modal, $, targetTable, currentTableId, selectCible: $('col-cible'), selectSource: $('col-source'), preview: $('preview'), mode: null, searchLists: [], listeners: [] };
    }
    function fillLinkConfigForm(form) {
      const { $, selectCible, selectSource, targetTable, currentTableId } = form;
      $('title').textContent = `${currentTableId} → ${targetTable}`;
      $('table-cible-name').textContent = targetTable;
      $('table-source-name').textContent = currentTableId;
      fillColumnSelect(selectCible, targetTable);
      fillColumnSelect(selectSource, currentTableId);
    }
    // Des listes avec recherche (js/search-select.js) par-dessus les deux <select>, qui restent la source des valeurs et des évènements `change` ; si
    // le composant échoue, les <select> natifs servent.
    function attachColumnSearch(form) {
      [[form.selectSource, 'link-config-table-source-name'], [form.selectCible, 'link-config-table-cible-name']].forEach(([select, labelId]) => {
        try {
          form.searchLists.push(SearchSelect.attach(select, { labelledBy: labelId, searchPlaceholder: I18n.t('linkConfig.searchColumns'), emptyText: I18n.t('linkConfig.noColumnMatch') }));
        } catch (e) {
          console.warn('[variables] recherche de colonne indisponible, liste native conservée', e);
        }
      });
    }
    return { showLinkConfigModal };
  })();
  const { wireLinkConfigForm, waitForLinkRule } = (function () {
    // La fenêtre d'une règle de liaison : mode, aperçu, écouteurs, réponse

    // Le cas rare (« ligne fixe ») est un lien texte, pas un choix à égalité avec le cas normal : le mode se bascule avec les deux boutons-liens.
    function showLinkMode(form) {
      form.$('match-fields').hidden = form.mode !== 'match';
      form.$('toggle-singleton').hidden = form.mode !== 'match';
      form.$('toggle-match').hidden = form.mode === 'match';
    }
    function linkRuleOfForm(form) {
      if (form.mode === 'singleton') return { mode: form.mode };
      return form.selectCible.value && form.selectSource.value ? { mode: form.mode, colonneCible: form.selectCible.value, colonneSource: form.selectSource.value } : null;
    }
    async function updateLinkPreview(form) {
      const { preview, targetTable, currentTableId } = form;
      preview.classList.remove('is-good');
      const rule = linkRuleOfForm(form);
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
    function onLinkForm(form, target, type, handler) {
      target.addEventListener(type, handler);
      form.listeners.push(() => target.removeEventListener(type, handler));
    }
    // Les boutons-liens et les deux listes relancent l'aperçu ; la fenêtre s'ouvre sur le mode retenu.
    function wireLinkConfigForm(form) {
      const setMode = next => () => { form.mode = next; showLinkMode(form); updateLinkPreview(form); };
      onLinkForm(form, form.$('toggle-singleton'), 'click', setMode('singleton'));
      onLinkForm(form, form.$('toggle-match'), 'click', setMode('match'));
      onLinkForm(form, form.selectCible, 'change', () => updateLinkPreview(form));
      onLinkForm(form, form.selectSource, 'change', () => updateLinkPreview(form));
      showLinkMode(form);
      form.modal.style.display = 'flex';
      updateLinkPreview(form);
    }
    // Rend la règle quand la personne confirme (avec deux colonnes choisies), null quand elle annule ; la fenêtre se referme et ses écouteurs s'en vont.
    function waitForLinkRule(form) {
      return new Promise(resolve => {
        const finish = rule => {
          form.modal.style.display = 'none';
          form.searchLists.forEach(list => list.destroy());
          form.listeners.forEach(off => off());
          resolve(rule);
        };
        onLinkForm(form, form.$('confirm'), 'click', () => {
          const rule = linkRuleOfForm(form);
          if (rule) finish(rule);
          else form.preview.textContent = I18n.t('linkConfig.chooseBeforeConfirm');
        });
        onLinkForm(form, form.$('cancel'), 'click', () => finish(null));
      });
    }
    return { wireLinkConfigForm, waitForLinkRule };
  })();
  const { ensureLinkConfigured, editLinkRule, describeLinkVia, refreshLinkRulesPanel } = (function () {
    // Enregistrer, modifier et supprimer une règle ; le panneau de gestion

    // Ouvre la fenêtre de la règle de `targetTable` et l'enregistre ; faux quand la personne annule.
    async function configureLink(targetTable, currentTableId, existingRule) {
      const rule = await showLinkConfigModal(targetTable, currentTableId, existingRule);
      if (!rule) return false;
      try { await GristAPI.saveLinkRule(targetTable, rule); }
      catch (e) {
        if (GristAPI.isTablesDeclined(e)) return false; // la personne refuse de créer la table des règles : comme une annulation, rien n'est inséré
        throw e;
      }
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
    // Les modèles dont le contenu contient au moins une bulle #Variable vers `tableCible`, ou une bulle dont le sinon (js/variable-otherwise.js) y va : une
    // recherche brute sur l'attribut sérialisé suffit, sans DOMParser. Les champs texte (Objet, À, Cc, Cci, nom du PDF) y comptent aussi : leurs variables
    // suivent la même règle de liaison. Sert à avertir avant de supprimer une règle encore utilisée ailleurs.
    function findTemplatesUsingTable(tableCible) {
      const needles = ['data-table="' + tableCible + '"', 'data-otherwise-table="' + tableCible + '"'];
      const fields = tpl => [tpl.nomFichierPDF, tpl.objet, tpl.destinataires, tpl.cc, tpl.cci];
      return Templates.getCached().filter(tpl => (tpl.contenu && needles.some(needle => tpl.contenu.indexOf(needle) !== -1))
        || fields(tpl).some(value => value && FieldCodec.variablesIn(value).some(v => v.table === tableCible)));
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
    return { ensureLinkConfigured, editLinkRule, describeLinkVia, refreshLinkRulesPanel };
  })();

  // Exporté pour d'autres modules : resolveRawValue (js/condition-rules.js évalue une condition sur la valeur brute, par le même chemin qu'une
  // #Variable) ; ensureLinkConfigured, editLinkRule, describeLinkVia, resolveLinkedRows, resolveRows, formatValue, cellValue (les fenêtres de
  // condition et d'autres attributs, js/variable-condition.js et js/variable-linked-attrs.js) ; listItems (les éléments d'une cellule liste brute, que
  // la boucle sur une liste de références, js/loop-rules.js, lit aussi) ; zeroHidden (la barre flottante d'une bulle nombre,
  // js/floating-toolbars.js, lit la même règle que le rendu) ; currentTables et prioritizeTables (le menu Image de la barre, js/main-toolbar.js,
  // classe ses colonnes comme la liste « # ») ; crossedListTable et writesList (la fenêtre « Liste » d'une bulle, js/variable-list.js, et
  // « Remplacer » d'Autres attributs, js/variable-linked-attrs.js : un chemin qui traverse une liste de références s'écrit en liste).
  return {
    createExtension, createFieldExtension, resolveVariable, resolveVariableResult, resolveRawValue, resolveTextVariables, replaceTextVariables, findTextVariables, resolveAttachmentIds, refreshLinkRulesPanel, initFilenameInput, triggerChar,
    preferChipsTab, ensureLinkConfigured, editLinkRule, describeLinkVia, resolveLinkedRows, resolveRows, formatValue, listTexts, resolveListTexts, zeroHidden, listItems, cellValue, currentTables, prioritizeTables, columnSearchText, referencedTable, crossedListTable, writesList, columnsBelow,
    resolveCalcResult, resolveCalc, badgeProblem, calcProblem, formulaErrorText,
  };
})();
