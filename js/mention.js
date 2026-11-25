// Citer une fiche : « @ » ouvre la liste des fiches du document (une ligne de n'importe quelle table) et le choix pose une pastille qui désigne CETTE ligne -
// sa table, son numéro de ligne et la colonne dont on lit le texte -, là où une #variable lit la ligne que la page affiche. « Rédigé par @Marie Martin » écrit
// donc toujours Marie Martin, que la page montre une facture ou un autre dossier. Le texte se relit à chaque affichage (Lecture, PDF, Word, Excel, e-mail,
// Markdown, js/reader-mode.js:resolveSmartChips) : renommer la personne dans Grist la renomme dans les modèles. Si sa ligne a disparu, le document écrit
// « [Fiche introuvable] » en rouge, comme pour une #variable cassée, et la pastille de l'éditeur rougit.
//
// La liste (js/suggestion-list.js, la même que celle de « § ») cherche dans toutes les tables à la fois, comme les listes avec recherche du widget : les mots
// tapés se retrouvent dans le nom de la fiche ou dans celui de sa table, sans compter accents ni casse (js/search-select.js). Les fiches de la table de la
// page viennent en tête ; le nom de la table se lit à droite de chaque ligne dès que le document a plusieurs tables à fiches. Le nom d'une fiche vient de la
// colonne que Grist montre quand une Référence désigne sa table (« Colonne à afficher »), à défaut de la première colonne de texte.
//
// « @ » n'ouvre la liste qu'en début de mot : une adresse e-mail tapée (marie@exemple.fr) n'ouvre rien. Il laisse la main à la touche que Réglages a donnée à
// « # » ou à « § » quand c'en est une.
//
// Les champs texte (Objet, À, Cc, Cci, nom du PDF, « Sinon afficher » des fenêtres : js/field-editor.js) ont la même pastille et le même « @ » : « Madame @Marie Martin » dans l'objet, « @Marie Martin » dans « À » puis
// « Autres colonnes de la même fiche » (la barre de la pastille) pour lire son Email au lieu de son nom. Une adresse que l'on tape (marie@exemple.fr) n'ouvre rien - le « @ » n'ouvre la liste qu'en début de mot -,
// et quand la liste s'ouvre sur un « @ » que l'on voulait en texte, Échap la ferme et le texte tapé reste tel quel (js/suggestion-list.js). Le champ s'enregistre alors en HTML (js/field-codec.js), la pastille écrite comme dans le corps d'un modèle.
//
// Dans une case de tableau ou une colonne de zone 2 colonnes, une pastille plus longue que sa place ne la traverse pas et ne passe pas sur plusieurs lignes : son nom est
// coupé par « … », comme celui d'une bulle de variable, et se lit en entier au survol (chipView, css/mention.css). L'éditeur est seul à la couper : Lecture et exports écrivent
// le nom en entier, qui passe à la ligne dans la case.
//
// Une pastille sélectionnée a sa barre flottante (js/floating-toolbars.js:createMentionToolbar), comme une bulle de variable, et un bouton, « Autres colonnes de la même fiche » :
// la fenêtre des bulles (js/variable-linked-attrs.js) s'ouvre sur la ligne de la fiche - jamais sur celle que la page affiche - pour changer la colonne que la pastille lit
// (« Remplacer », le nom de la pastille devient celui de la nouvelle colonne) ou en citer d'autres à la suite (« Insérer »).
//
// Une pastille peut citer la fiche VOISINE de la sienne dans une série (attribut `step`, le maillon « +1(Date;Cycle) » de GristAPI.stepOf, comme dans le chemin d'une variable) : « la séance
// suivante de @Séance 3 » reste liée à la fiche choisie, mais écrit le nom de celle qui la suit quand les fiches de la table sont rangées selon la colonne d'ordre. Le signe « +1 » est
// dessiné après le nom (css/mention.css) ; au bout de la série la pastille n'écrit rien. Posée par la fenêtre « Autres colonnes de la même fiche, ou fiche suivante ou précédente ».
//
// Les tables se lisent en entier (fetchTable) : une table lue il y a moins de FRESH_MS est réutilisée, pour que l'export d'un lot de lignes ne la relise pas à
// chaque document. La lecture n'est pas celle de GristAPI.withReadPass : elle ne dépend d'aucun rendu en cours.
const Mention = (function () {
  const el = Dom.el;

  const CHAR = '@';
  // Les lignes montrées par la liste : au-delà, la dernière dit combien d'autres répondent encore à la saisie.
  const MAX_SUGGESTIONS = 50;
  // Âge au-delà duquel une table déjà lue est relue pour la liste et pour les exports.
  const FRESH_MS = 10000;
  // Âge au-delà duquel l'éditeur relit la table d'une pastille (nom à jour, ligne disparue) : les pastilles se repeignent à chaque frappe, pas question de
  // relire la table à chaque fois.
  const EDITOR_REFRESH_MS = 120000;
  // Début de mot, « @ » puis la saisie : des lettres, des chiffres, des espaces, « _ », « - » et l'apostrophe (« d'Artagnan »), jamais une espace juste après
  // le « @ » (« @ » puis une espace est du texte). Toute autre ponctuation ferme la liste.
  const TYPED = /(^|[^\p{L}\p{N}_])@(?!\s)([\p{L}\p{N}_'’\s-]{0,40})$/u;

  // « @ » est aussi une des touches que Réglages propose pour le panneau des variables (onglet Déclencheur) et pour les abréviations (Raccourcis) : celle qui
  // l'a choisie la garde, la liste des fiches s'efface, comme « § » devant « # » (js/text-expansion.js:triggerChar).
  function triggerChar() {
    return Variables.triggerChar() === CHAR || TextExpansion.triggerChar() === CHAR ? null : CHAR;
  }

  // Les tables lues

  // `entry`, la dernière lecture réussie d'une table : { data (le résultat de fetchTable), at, ids (identifiant → rang, posé à la demande), labels (colonne →
  // nom de chaque fiche), keys (colonne → texte où chercher chaque fiche) }.
  const last = new Map();
  // La lecture en cours d'une table (partagée par tous ceux qui la demandent), le moment de la dernière qui a échoué (une table illisible n'est pas redemandée
  // à chaque frappe) et celui de la dernière que l'éditeur a réclamée.
  const pending = new Map();
  const failures = new Map();
  const asked = new Map();

  function read(table, maxAge) {
    const known = last.get(table);
    if (known && Date.now() - known.at < maxAge) return Promise.resolve(known);
    const failed = failures.get(table);
    if (failed && Date.now() - failed < FRESH_MS) return Promise.reject(new Error('table illisible : ' + table));
    if (!pending.has(table)) {
      const reading = new Promise(resolve => resolve(grist.docApi.fetchTable(table))).then(data => {
        const entry = { data: data || {}, at: Date.now(), ids: null, labels: new Map(), keys: new Map() };
        last.set(table, entry);
        failures.delete(table);
        return entry;
      }, error => { failures.set(table, Date.now()); throw error; });
      const done = () => { if (pending.get(table) === reading) pending.delete(table); };
      reading.then(done, done);
      pending.set(table, reading);
    }
    return pending.get(table);
  }

  // Oublie tout ce qui a été lu (tests, changement de document) : la prochaine demande repart de Grist.
  function reset() { last.clear(); pending.clear(); failures.clear(); asked.clear(); }

  // Vrai quand toutes les tables du document ont été lues il y a peu (ou viennent d'échouer) : la liste s'affiche alors sans attendre, sans « Recherche… ».
  function warm() {
    return GristAPI.getTables().every(table => {
      const entry = last.get(table);
      const failed = failures.get(table);
      return (entry && Date.now() - entry.at < FRESH_MS) || (failed && Date.now() - failed < FRESH_MS);
    });
  }

  // La ligne de `entry` qui porte l'identifiant `row` ; undefined si elle n'y est plus.
  function rowIndex(entry, row) {
    if (!entry.ids) {
      entry.ids = new Map();
      (entry.data.id || []).forEach((id, index) => entry.ids.set(id, index));
    }
    return entry.ids.get(Number(row));
  }

  // Le nom des fiches

  // Les colonnes qui peuvent nommer une fiche, à défaut de la colonne qu'une Référence montre.
  const NAMING_TYPES = ['Text', 'Choice', 'Any'];
  // La colonne qui nomme les fiches de `table` : celle que Grist montre quand une colonne Référence d'une table du document désigne celle-ci (« Colonne à
  // afficher » du panneau de droite, texte ou nombre), à défaut sa première colonne de texte, à défaut sa première colonne visible. null pour une table sans
  // colonne visible.
  function labelColumnOf(table) {
    const columns = GristAPI.getVisibleColumns(table);
    for (const source of GristAPI.getTables()) {
      for (const column of GristAPI.getVisibleColumns(source)) {
        const shown = GristAPI.getReferenceColumn(source, column);
        if (shown && shown.table === table && columns.indexOf(shown.column) !== -1) return shown.column;
      }
    }
    return columns.find(column => NAMING_TYPES.indexOf(GristAPI.getColumnType(table, column)) !== -1)
      || columns.find(column => GristAPI.getColumnType(table, column) !== 'Attachments')
      || null;
  }

  // Le nom de la fiche n° `index` de `entry` d'après `column`, sur une ligne, comme la cellule s'écrit dans un champ texte (nombre et date tels que Grist les montre, sans
  // mise en forme de bulle) ; '' pour une cellule vide. `shownBy` : la colonne cachée que Grist montre à la place de `column` (une Référence), s'il y en a une.
  function cellLabel(entry, table, column, shownBy, index) {
    const row = { [column]: (entry.data[column] || [])[index] };
    if (shownBy && entry.data[shownBy]) row[shownBy] = entry.data[shownBy][index];
    const text = Variables.formatValue(Variables.cellValue(table, column, row), null, table, column, { rawNumbers: true });
    return String(text).replace(/\s+/g, ' ').trim();
  }

  // Le nom de chaque fiche de `entry` d'après `column`.
  function labelsOf(entry, table, column) {
    let labels = entry.labels.get(column);
    if (labels) return labels;
    const shownBy = GristAPI.getDisplayColumn(table, column);
    labels = (entry.data.id || []).map((id, index) => cellLabel(entry, table, column, shownBy, index));
    entry.labels.set(column, labels);
    return labels;
  }

  // Le nom d'UNE fiche d'après `column` : celui que `labelsOf` a déjà bâti, sinon sa cellule seule - la fenêtre d'une pastille lit une ligne dans chaque colonne, pas toute la table
  // dans chacune.
  function labelAt(entry, table, column, index) {
    const known = entry.labels.get(column);
    return known ? known[index] : cellLabel(entry, table, column, GristAPI.getDisplayColumn(table, column), index);
  }

  // Les textes où chercher chaque fiche : son nom et celui de sa table (SearchSelect.searchKey), préparés une fois par lecture.
  function keysOf(entry, table, column) {
    let keys = entry.keys.get(column);
    if (!keys) {
      keys = labelsOf(entry, table, column).map(label => (label ? SearchSelect.searchKey(label, table) : ''));
      entry.keys.set(column, keys);
    }
    return keys;
  }

  // La liste

  // Le rang d'une fiche pour la saisie : 0 quand son nom commence par elle, 1 quand un mot de son nom commence par le premier mot saisi, 2 sinon (elle est
  // dans le nom, ou dans celui de la table).
  function rankOf(label, words) {
    if (!words.length) return 0;
    if (SearchSelect.searchKey(label).indexOf(words.join('')) === 0) return 0;
    return SearchSelect.searchWords(label).some(word => word.indexOf(words[0]) === 0) ? 1 : 2;
  }

  // Les fiches que la liste propose pour `query`, MAX_SUGGESTIONS au plus : [{ table, column, row, label, hint }], `more` disant combien d'autres répondent
  // encore. Une fiche sans nom n'est pas proposée (rien à chercher, rien à écrire). `hint` : la table, quand le document a plusieurs tables à fiches.
  async function items(query) {
    const page = GristAPI.getCurrentTableId();
    const tables = GristAPI.getTables().slice().sort((a, b) => (b === page) - (a === page));
    const reads = await Promise.all(tables.map(table => read(table, FRESH_MS).then(entry => ({ table, entry }), () => null)));
    const sources = reads.filter(source => source && source.entry.data.id && source.entry.data.id.length);
    const words = SearchSelect.searchWords(query);
    const found = [];
    sources.forEach(({ table, entry }, order) => {
      const column = labelColumnOf(table);
      if (!column || !(column in entry.data)) return;
      const labels = labelsOf(entry, table, column);
      const keys = keysOf(entry, table, column);
      for (let index = 0; index < labels.length; index++) {
        if (labels[index] && SearchSelect.foundIn(words, keys[index])) {
          found.push({ table, column, row: entry.data.id[index], label: labels[index], order, rank: rankOf(labels[index], words) });
        }
      }
    });
    const collator = new Intl.Collator(I18n.getLang(), { numeric: true, sensitivity: 'base' });
    found.sort((a, b) => a.rank - b.rank || a.order - b.order || collator.compare(a.label, b.label));
    const shown = found.slice(0, MAX_SUGGESTIONS);
    shown.more = found.length - shown.length;
    const named = sources.length > 1;
    shown.forEach(item => { item.hint = named ? item.table : ''; });
    return shown;
  }

  const suggestions = SuggestionList.create({
    id: 'mention-box',
    label: () => I18n.t('mention.panel.label'),
    row: item => {
      // Le nom de la fiche en gras, sur une seule ligne coupée par « … », puis sa table, plus petite.
      const name = el('span', 'ex-text mention-name', item.label);
      return item.hint ? [name, el('span', 'mention-table', item.hint)] : [name];
    },
    // Une liste sans ligne le dit au lieu de se fermer : on cherche dans toutes les tables, un vide sans explication ferait croire à une liste en panne.
    status: props => {
      if (props.loading) return warm() ? '' : I18n.t('mention.loading');
      return props.query.trim() ? I18n.t('mention.none') : I18n.t('mention.empty');
    },
  });

  // Le déclencheur et le choix d'une fiche

  function findSuggestion(config) {
    // @tiptap/suggestion cherche le déclencheur dans le texte qui précède le curseur : même lecture que js/text-expansion.js:findSuggestion (le caractère se
    // relit à chaque frappe, le déclencheur suit le début ou un caractère qui n'est ni lettre ni chiffre).
    const char = triggerChar();
    if (!char) return null;
    const node = config.$position.nodeBefore;
    const text = node && node.isText && node.text;
    if (!text) return null;
    const match = TYPED.exec(text);
    if (!match || match[1] === char) return null;
    const from = config.$position.pos - text.length + match.index + match[1].length;
    return { range: { from, to: config.$position.pos }, query: match[2], text: char + match[2] };
  }

  // `options.field` : l'extension d'un champ texte (js/field-editor.js), dont l'éditeur n'est pas celui du document : la liste, partagée avec lui, ne reste pas ouverte sous un champ que le curseur a quitté.
  function createExtension(Extension, Suggestion, PluginKey, options) {
    // Reçoit Extension, Suggestion et PluginKey de js/editor.js plutôt que de les importer (cf. TextExpansion.createExtension) : la clé par défaut de
    // Suggestion est celle du panneau # - deux plugins ne peuvent pas la partager.
    const pluginKey = new PluginKey('mentionSuggestion');
    const inField = !!(options && options.field);
    return Extension.create({
      name: inField ? 'mentionFieldSuggestion' : 'mentionSuggestion',
      // Avant les autres extensions, comme celles de « # » et de « § » : dans une case de grille ou de tableau, les flèches et Tab de prosemirror-tables passeraient
      // sinon avant la liste ouverte. Hors liste ouverte, elle rend la main sans rien consommer.
      priority: 1000,
      // Un clic sur une ligne de la liste garde le focus du champ (mousedown sans effet par défaut, js/suggestion-list.js) : il n'arrive pas ici.
      onBlur() { if (inField) suggestions.hide(); },
      addProseMirrorPlugins() {
        return [
          Suggestion({
            pluginKey,
            editor: this.editor,
            char: CHAR, // jamais lu : findSuggestion relit le caractère
            findSuggestionMatch: findSuggestion,
            // La saisie peut compter plusieurs mots (findSuggestion les lit, espaces comprises) : avec allowSpaces, Échap ferme la liste pour CE « @ » et elle ne se
            // rouvre pas à la prochaine espace ni à la prochaine lettre - un nouveau « @ » la rouvre.
            allowSpaces: true,
            decorationClass: 'pp-mention-suggestion',
            // Jamais dans un bloc de code : « @ » y est un caractère comme un autre.
            allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code,
            items: ({ query }) => items(query),
            command: ({ editor, range, props }) => {
              editor.chain().focus().insertContentAt(range, { type: 'mention', attrs: { table: props.table, row: props.row, column: props.column, label: props.label } }).run();
            },
            render: suggestions.render,
          }),
        ];
      },
    });
  }

  // La pastille

  // Les attributs DOM d'une pastille (HTML enregistré, presse-papiers) et l'inverse : la fiche (table, numéro de ligne, colonne lue), sans son nom, qui est le
  // texte de la pastille (régénéré à chaque rendu depuis l'attribut `label` du nœud, jamais stocké en double). Le « @ » n'est pas dans le texte : le CSS le
  // dessine (css/mention.css), le nom reste donc seul dans le presse-papiers, les lecteurs d'écran et les enregistrements.
  // `data-cond-style` : la mise en forme selon la ligne de la page (js/conditional-style.js), écrite seulement quand elle est posée - une pastille sans réglage garde le HTML d'avant.
  // `data-mention-step` : le maillon « ligne voisine » de la pastille, écrit seulement quand il est posé ; `data-mention-sign` en est le signe lisible (« +1 », « −2 »), que le CSS
  // dessine après le nom, et que personne ne relit (il se déduit du maillon).
  const signOf = step => {
    const jump = GristAPI.stepOf(step);
    return jump ? (jump.offset < 0 ? '\u2212' : '+') + Math.abs(jump.offset) : '';
  };
  const refAttributes = attrs => Object.assign({ 'data-mention-table': attrs.table, 'data-mention-row': attrs.row, 'data-mention-column': attrs.column },
    attrs.step ? { 'data-mention-step': attrs.step, 'data-mention-sign': signOf(attrs.step) } : {},
    attrs.condStyle ? { 'data-cond-style': JSON.stringify(attrs.condStyle) } : {});
  function refOf(element) {
    const step = element.getAttribute('data-mention-step');
    return Object.assign({ table: element.getAttribute('data-mention-table'), row: Number(element.getAttribute('data-mention-row')), column: element.getAttribute('data-mention-column') },
      step ? { step } : {});
  }
  const attrsOf = (element) => {
    const condStyle = ConditionalStyle.parse(element.getAttribute('data-cond-style'));
    return Object.assign(refOf(element), { label: element.textContent }, condStyle ? { condStyle } : {});
  };

  // Les attributs d'une pastille dans un champ texte (js/field-codec.js) : la fiche et son nom, rien d'autre - la mise en forme selon la ligne est propre au document.
  const fieldAttrsOf = element => Object.assign(refOf(element), { label: element.textContent });
  // Le HTML d'une pastille posée dans un champ texte (valeur enregistrée, texte collé) : sans TipTap, la même que celle que l'éditeur écrit.
  function html(attrs) {
    const span = document.createElement('span');
    span.className = 'mention-chip';
    span.setAttribute('contenteditable', 'false');
    const ref = refAttributes({ table: attrs.table, row: attrs.row, column: attrs.column, step: attrs.step });
    Object.keys(ref).forEach(name => span.setAttribute(name, ref[name]));
    span.textContent = attrs.label || '';
    return span.outerHTML;
  }

  // Nœud atome en ligne et sélectionnable comme une bulle : <span class="mention-chip" data-mention-table data-mention-row data-mention-column>Nom</span>.
  function createNode(Node, mergeAttributes) {
    // Spécification DOM de la pastille, une seule pour renderHTML (HTML enregistré, presse-papiers, exports) et pour la vue de l'éditeur (addNodeView).
    const chipSpec = (HTMLAttributes, node) => ['span', mergeAttributes(HTMLAttributes, { class: 'mention-chip', contenteditable: 'false' }, refAttributes(node.attrs)), node.attrs.label];
    return EditorNodes.inlineAtom(Node, {
      name: 'mention',
      addAttributes() {
        // `label` : le nom de la fiche quand elle a été posée - le seul texte d'une pastille dont la table ne se lit plus, jamais celui qu'un export écrit.
        return { table: EditorNodes.internalAttr(null), row: EditorNodes.internalAttr(null), column: EditorNodes.internalAttr(null), step: EditorNodes.internalAttr(null), label: EditorNodes.internalAttr(''), condStyle: EditorNodes.internalAttr(null) };
      },
      parseHTML() {
        return [{ tag: 'span.mention-chip', getAttrs: attrsOf }];
      },
      renderHTML({ HTMLAttributes, node }) {
        return chipSpec(HTMLAttributes, node);
      },
      // Vue de l'éditeur seulement : cf. chipView. Pas de `update` : ProseMirror garde la vue tant que le nœud est identique et la refait sinon.
      addNodeView() {
        return ({ node, HTMLAttributes }) => chipView(chipSpec(HTMLAttributes, node), node.marks);
      },
    });
  }

  // Vue de l'éditeur d'une pastille : le nom dans un <span> `mention-chip-head`, que la case d'un tableau ou la colonne d'une zone 2 colonnes rétrécit en le coupant par « … »
  // (css/mention.css), comme une bulle de variable (js/editor-nodes.js:splitBadgeView), au lieu de laisser la pastille traverser la case ou passer sur plusieurs lignes. Mêmes
  // attributs et même texte que renderHTML : getHTML(), le presse-papiers et les exports gardent le nom entier dans un seul texte. Le nom coupé est entier dans l'info-bulle, posée
  // au survol seulement quand il est vraiment coupé, devant ce que dit la pastille d'ordinaire (sa table, ou ce qui ne va plus : une pastille rouge garde son message, comme
  // une bulle cassée) ; `paint` la remet à chaque mise à jour du document. `marks` : les marques du nœud, dont la vue relève la couleur, le surlignage et les traits
  // (EditorNodes.showTextMarks, que css/variable-actions.css montre sous « Mise en forme » de Réglages).
  function chipView(spec, marks) {
    const [, attrs, label] = spec;
    const dom = document.createElement('span');
    Object.keys(attrs).forEach(name => { if (attrs[name] != null) dom.setAttribute(name, attrs[name]); });
    if (marks) EditorNodes.showTextMarks(dom, marks);
    const head = document.createElement('span');
    head.className = 'mention-chip-head';
    head.textContent = label;
    dom.appendChild(head);
    dom.addEventListener('mouseenter', () => {
      if (dom.classList.contains('mention-chip-broken')) return;
      const usual = tooltipOf('', refOf(dom));
      const cut = head.scrollWidth > head.clientWidth;
      const full = head.textContent + ' — ' + usual;
      if (cut) dom.title = full;
      else if (dom.title === full) dom.title = usual;
    });
    return { dom };
  }

  // Les fiches voisines

  // Le maillon `step` (GristAPI.stepOf) d'une pastille de `table`, quand ses colonnes d'ordre et de groupe existent encore ; null sinon.
  function jumpOf(table, step) {
    const jump = step ? GristAPI.stepOf(step) : null;
    return jump && GristAPI.tableAtEndOf(table, [step]) ? jump : null;
  }
  // Le rang, dans `entry`, de la fiche voisine de la ligne `row` pour le maillon `jump` ; undefined au bout de la série, pour une ligne hors série ou disparue. Le rangement est celui
  // des variables (Variables.stepNeighbor), gardé avec les lignes de la lecture.
  function neighborIndex(entry, table, row, jump) {
    if (!entry.rows) entry.rows = GristAPI.rowsOf(entry.data);
    const found = Variables.stepNeighbor(table, entry.rows, Number(row), jump);
    return found ? rowIndex(entry, found.id) : undefined;
  }

  // Ce que la fiche devient dans un document

  const missing = () => ({ text: I18n.t('reader.mentionMissing'), isError: true });

  // La table ne se lit pas (réseau, droits) : sa pastille garde le nom qu'elle portait, sauf si la table a disparu du document.
  function unreadable(attrs) {
    const tables = GristAPI.getTables();
    if (tables.length && tables.indexOf(attrs.table) === -1) return missing();
    return attrs.label ? { text: attrs.label, isError: false } : missing();
  }

  // Le texte d'une pastille pour la Lecture et les exports, d'après ses attributs (attrsOf) : { text, isError }. Le nom de la fiche aujourd'hui dans Grist ;
  // « [Fiche introuvable] » quand sa ligne ou sa colonne n'existe plus.
  async function resolve(attrs) {
    let entry;
    try { entry = await read(attrs.table, FRESH_MS); } catch (e) { return unreadable(attrs); }
    const index = rowIndex(entry, attrs.row);
    if (index === undefined || !(attrs.column in entry.data)) return missing();
    if (!attrs.step) return { text: labelsOf(entry, attrs.table, attrs.column)[index], isError: false };
    // La fiche voisine : sa colonne d'ordre disparue rend la pastille introuvable ; au bout de la série elle n'écrit rien, sans erreur.
    const jump = jumpOf(attrs.table, attrs.step);
    if (!jump) return missing();
    const neighbor = neighborIndex(entry, attrs.table, attrs.row, jump);
    return { text: neighbor === undefined ? '' : labelsOf(entry, attrs.table, attrs.column)[neighbor], isError: false };
  }

  // La pastille dans l'éditeur

  // Ce qui ne va plus dans la fiche d'une pastille d'après ce que l'on sait d'elle ('' quand tout va bien) : sa table ou sa colonne n'est plus dans le schéma,
  // ou sa ligne n'est plus dans la dernière lecture de la table (rien n'est dit d'une table pas encore lue).
  function problemOf(ref) {
    const tables = GristAPI.getTables();
    if (tables.length && tables.indexOf(ref.table) === -1) return 'table';
    const columns = GristAPI.getVisibleColumns(ref.table);
    if (columns.length && columns.indexOf(ref.column) === -1) return 'column';
    // Une colonne d'ordre ou de groupe de la fiche voisine qui a disparu : la même cause qu'une colonne lue.
    if (columns.length && ref.step && !jumpOf(ref.table, ref.step)) return 'column';
    const entry = last.get(ref.table);
    return entry && rowIndex(entry, ref.row) === undefined ? 'row' : '';
  }
  // La colonne que la pastille ne trouve plus : la sienne ou, pour une fiche voisine, la colonne d'ordre ou de groupe de son maillon.
  function missingColumnOf(ref) {
    const jump = ref.step ? GristAPI.stepOf(ref.step) : null;
    const known = GristAPI.getVisibleColumns(ref.table);
    if (!jump || known.indexOf(ref.column) === -1) return ref.column;
    return [jump.order, jump.group].filter(Boolean).find(column => GristAPI.getColumnType(ref.table, column) === null) || ref.column;
  }

  // L'info-bulle d'une pastille qui cite la fiche voisine : le sens, le rang, la table et la colonne d'ordre.
  function stepTitle(ref) {
    const jump = GristAPI.stepOf(ref.step);
    return I18n.t('mention.titleStep', { which: I18n.t(jump.offset < 0 ? 'varLinked.stepBefore' : 'varLinked.stepAfter'), rank: Math.abs(jump.offset), table: ref.table, order: jump.order });
  }
  // L'info-bulle d'une pastille : le message de ce qui ne va plus, sinon la table de la fiche.
  function tooltipOf(problem, ref) {
    switch (problem) {
      case 'table': return I18n.t('mention.broken.table', { table: ref.table });
      case 'column': return I18n.t('mention.broken.column', { column: missingColumnOf(ref), table: ref.table });
      case 'row': return I18n.t('mention.broken.row', { table: ref.table });
      default: return ref.step && GristAPI.stepOf(ref.step) ? stepTitle(ref) : I18n.t('mention.title', { table: ref.table });
    }
  }

  // Le nom de la fiche d'après la dernière lecture de sa table ; null tant que la table n'est pas lue ou quand la ligne n'y est plus.
  function liveLabel(ref) {
    const entry = last.get(ref.table);
    const index = entry ? rowIndex(entry, ref.row) : undefined;
    if (index === undefined || !(ref.column in entry.data)) return null;
    if (!ref.step) return labelsOf(entry, ref.table, ref.column)[index];
    const jump = jumpOf(ref.table, ref.step);
    if (!jump) return null;
    const neighbor = neighborIndex(entry, ref.table, ref.row, jump);
    return neighbor === undefined ? '' : labelsOf(entry, ref.table, ref.column)[neighbor];
  }
  // Une pastille de fiche voisine qui, d'après la dernière lecture de sa table, n'a pas de voisine à ce rang : elle n'écrit rien.
  function isAlone(ref) {
    const entry = last.get(ref.table);
    const index = entry ? rowIndex(entry, ref.row) : undefined;
    const jump = ref.step ? jumpOf(ref.table, ref.step) : null;
    return !!jump && index !== undefined && neighborIndex(entry, ref.table, ref.row, jump) === undefined;
  }

  // Repeint une pastille : une classe, une info-bulle et le nom du moment (dans son <span> de début, cf. chipView) sur le <span> rendu, jamais dans le nœud (cela
  // dépend d'un état externe, pas du contenu), comme Editor.markBadgeValidity pour une #variable.
  function paint(chip) {
    const ref = refOf(chip);
    const problem = problemOf(ref);
    chip.classList.toggle('mention-chip-broken', !!problem);
    const alone = !problem && isAlone(ref);
    chip.classList.toggle('mention-chip-alone', alone);
    const tooltip = alone ? I18n.t('mention.alone') : tooltipOf(problem, ref);
    if (chip.title !== tooltip) chip.title = tooltip;
    const label = problem ? null : liveLabel(ref);
    if (label !== null && label !== '' && chip.textContent !== label) (chip.querySelector('.mention-chip-head') || chip).textContent = label;
  }

  // Signale, dans `root` (le DOM d'un éditeur), l'état de chaque pastille « @ » : rouge quand sa fiche n'existe plus, son nom à jour sinon. ProseMirror peut
  // reconstruire un <span> à tout moment : appelée à chaque mise à jour du document (js/editor.js:markBadgeValidity), elle repeint d'après ce qui est déjà lu
  // et ne relit une table qu'au plus toutes les EDITOR_REFRESH_MS (puis repeint).
  function markChips(root) {
    const chips = root.querySelectorAll('span.mention-chip');
    if (!chips.length) return;
    const tables = new Set();
    chips.forEach(chip => { paint(chip); tables.add(chip.getAttribute('data-mention-table')); });
    tables.forEach(table => {
      if (!table || (asked.has(table) && Date.now() - asked.get(table) < EDITOR_REFRESH_MS)) return;
      asked.set(table, Date.now());
      read(table, FRESH_MS).then(() => { if (root.isConnected) markChips(root); }, () => { /* table illisible : la pastille garde son nom */ });
    });
  }

  // La barre et la fenêtre « Autres colonnes de la même fiche » d'une pastille sélectionnée (js/floating-toolbars.js:createMentionToolbar, js/variable-linked-attrs.js)

  // La pastille telle qu'on la lit dans l'éditeur, « @ » compris : ce que la fenêtre dit d'elle (sous-titre, info-bulle de « Remplacer »).
  const chipText = attrs => CHAR + (attrs.label || '');

  // Le bouton de la barre de la pastille : actif tant que la table et la ligne de sa fiche existent - une colonne disparue est justement ce que « Remplacer » répare - ; grisé sinon,
  // avec le message que dit la pastille rouge. { enabled, title }
  function columnsStatus(attrs) {
    const ref = { table: attrs.table, row: attrs.row, column: attrs.column, step: attrs.step };
    const problem = problemOf(ref);
    if (problem === 'table' || problem === 'row') return { enabled: false, title: tooltipOf(problem, ref) };
    return { enabled: true, title: I18n.t('mention.toolbar.linked') };
  }

  // Ce que la fiche (`table`, ligne `row`) écrirait dans chacune des colonnes visibles de sa table, d'après la table lue il y a moins de FRESH_MS : { labels } - colonne → texte,
  // '' pour une cellule vide, sans les pièces jointes (rien à écrire en texte) - ou { gone: true } quand sa ligne n'y est plus. Refuse quand la table ne se lit pas. Les mêmes
  // textes que `resolve`, donc ceux de la pastille une fois la colonne choisie.
  // `step` : le maillon d'une pastille de fiche voisine : les textes sont alors ceux de la voisine, { none: true } quand elle n'existe pas (bout de la série), { gone: true } aussi quand
  // la colonne d'ordre du maillon n'existe plus.
  async function valuesOf(table, row, step) {
    const entry = await read(table, FRESH_MS);
    let index = rowIndex(entry, row);
    if (index === undefined) return { gone: true };
    if (step) {
      const jump = jumpOf(table, step);
      if (!jump) return { gone: true };
      index = neighborIndex(entry, table, row, jump);
      if (index === undefined) return { none: true };
    }
    const labels = new Map();
    GristAPI.getVisibleColumns(table).forEach(column => {
      if (column in entry.data && GristAPI.getColumnType(table, column) !== 'Attachments') labels.set(column, labelAt(entry, table, column, index));
    });
    return { labels };
  }

  return { triggerChar, createNode, createExtension, items, resolve, attrsOf, refOf, fieldAttrsOf, html, markChips, labelColumnOf, reset, chipText, columnsStatus, valuesOf, hideList: suggestions.hide };
})();
