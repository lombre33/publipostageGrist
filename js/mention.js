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

  // Le nom de chaque fiche de `entry` d'après `column`, sur une ligne, comme la cellule s'écrit dans un champ texte (nombre et date tels que Grist les montre,
  // sans mise en forme de bulle) ; '' pour une cellule vide.
  function labelsOf(entry, table, column) {
    let labels = entry.labels.get(column);
    if (labels) return labels;
    const shownBy = GristAPI.getDisplayColumn(table, column);
    const values = entry.data[column] || [];
    labels = (entry.data.id || []).map((id, index) => {
      const row = { [column]: values[index] };
      if (shownBy && entry.data[shownBy]) row[shownBy] = entry.data[shownBy][index];
      const text = Variables.formatValue(Variables.cellValue(table, column, row), null, table, column, { rawNumbers: true });
      return String(text).replace(/\s+/g, ' ').trim();
    });
    entry.labels.set(column, labels);
    return labels;
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

  function createExtension(Extension, Suggestion, PluginKey) {
    // Reçoit Extension, Suggestion et PluginKey de js/editor.js plutôt que de les importer (cf. TextExpansion.createExtension) : la clé par défaut de
    // Suggestion est celle du panneau # - deux plugins ne peuvent pas la partager.
    const pluginKey = new PluginKey('mentionSuggestion');
    return Extension.create({
      name: 'mentionSuggestion',
      // Avant les autres extensions, comme celles de « # » et de « § » : dans une case de grille ou de tableau, les flèches et Tab de prosemirror-tables passeraient
      // sinon avant la liste ouverte. Hors liste ouverte, elle rend la main sans rien consommer.
      priority: 1000,
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
  const refAttributes = attrs => ({ 'data-mention-table': attrs.table, 'data-mention-row': attrs.row, 'data-mention-column': attrs.column });
  function refOf(element) {
    return { table: element.getAttribute('data-mention-table'), row: Number(element.getAttribute('data-mention-row')), column: element.getAttribute('data-mention-column') };
  }
  const attrsOf = element => Object.assign(refOf(element), { label: element.textContent });

  // Nœud atome en ligne et sélectionnable comme une bulle : <span class="mention-chip" data-mention-table data-mention-row data-mention-column>Nom</span>.
  function createNode(Node, mergeAttributes) {
    return EditorNodes.inlineAtom(Node, {
      name: 'mention',
      addAttributes() {
        // `label` : le nom de la fiche quand elle a été posée - le seul texte d'une pastille dont la table ne se lit plus, jamais celui qu'un export écrit.
        return { table: EditorNodes.internalAttr(null), row: EditorNodes.internalAttr(null), column: EditorNodes.internalAttr(null), label: EditorNodes.internalAttr('') };
      },
      parseHTML() {
        return [{ tag: 'span.mention-chip', getAttrs: attrsOf }];
      },
      renderHTML({ node }) {
        return ['span', mergeAttributes({ class: 'mention-chip', contenteditable: 'false' }, refAttributes(node.attrs)), node.attrs.label];
      },
    });
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
    return { text: labelsOf(entry, attrs.table, attrs.column)[index], isError: false };
  }

  // La pastille dans l'éditeur

  // Ce qui ne va plus dans la fiche d'une pastille d'après ce que l'on sait d'elle ('' quand tout va bien) : sa table ou sa colonne n'est plus dans le schéma,
  // ou sa ligne n'est plus dans la dernière lecture de la table (rien n'est dit d'une table pas encore lue).
  function problemOf(ref) {
    const tables = GristAPI.getTables();
    if (tables.length && tables.indexOf(ref.table) === -1) return 'table';
    const columns = GristAPI.getVisibleColumns(ref.table);
    if (columns.length && columns.indexOf(ref.column) === -1) return 'column';
    const entry = last.get(ref.table);
    return entry && rowIndex(entry, ref.row) === undefined ? 'row' : '';
  }

  // L'info-bulle d'une pastille : le message de ce qui ne va plus, sinon la table de la fiche.
  function tooltipOf(problem, ref) {
    switch (problem) {
      case 'table': return I18n.t('mention.broken.table', { table: ref.table });
      case 'column': return I18n.t('mention.broken.column', { column: ref.column, table: ref.table });
      case 'row': return I18n.t('mention.broken.row', { table: ref.table });
      default: return I18n.t('mention.title', { table: ref.table });
    }
  }

  // Le nom de la fiche d'après la dernière lecture de sa table ; null tant que la table n'est pas lue ou quand la ligne n'y est plus.
  function liveLabel(ref) {
    const entry = last.get(ref.table);
    const index = entry ? rowIndex(entry, ref.row) : undefined;
    if (index === undefined || !(ref.column in entry.data)) return null;
    return labelsOf(entry, ref.table, ref.column)[index];
  }

  // Repeint une pastille : une classe, une info-bulle et le nom du moment sur le <span> rendu, jamais dans le nœud (cela dépend d'un état externe, pas du
  // contenu), comme Editor.markBadgeValidity pour une #variable.
  function paint(chip) {
    const ref = refOf(chip);
    const problem = problemOf(ref);
    chip.classList.toggle('mention-chip-broken', !!problem);
    const tooltip = tooltipOf(problem, ref);
    if (chip.title !== tooltip) chip.title = tooltip;
    const label = problem ? null : liveLabel(ref);
    if (label !== null && label !== '' && chip.textContent !== label) chip.textContent = label;
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

  return { triggerChar, createNode, createExtension, items, resolve, attrsOf, refOf, markChips, labelColumnOf, reset };
})();
