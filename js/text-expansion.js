// Expansion de texte : un caractère déclencheur (« § » par défaut, réglable dans Réglages > Raccourcis), une abréviation, puis un espace (ou une
// ponctuation, ou Tab dans la liste), et l'abréviation est remplacée par son texte, avec la mise en forme de ce qu'on vient de taper (« §ub » devient
// « université de Bordeaux »). Retour arrière juste après l'expansion rend la saisie d'origine. Le déclencheur seul ouvre la liste des abréviations,
// filtrée à la frappe, comme le panneau # de js/variables.js (@tiptap/suggestion, flèches, Entrée ou Tab, Échap).
//
// Par personne : les abréviations vivent dans la table Publipostage_Abreviations du document (Utilisateur = email Grist, repli '' sans identité, même
// patron que js/template-preferences.js), créée à la première abréviation ajoutée. Le caractère déclencheur, comme le thème, est gardé par
// js/person-store.js (par navigateur : le navigateur, ou GFS quand elle héberge le widget). La table est lue au premier focus de l'éditeur ou à l'ouverture de Réglages > Raccourcis, jamais au démarrage du
// widget.
//
// Le caractère déclencheur se relit à chaque frappe (findSuggestion, findTypedAbbreviation) : un changement dans Réglages vaut tout de suite, alors
// que le `char` du panneau # (js/variables.js) est figé à la construction de l'éditeur.
// Ajouter, modifier et supprimer une abréviation se défont par Ctrl + Z (js/expansion-history.js, qui appelle `add`, `update` et `remove` ci-dessous) ; le caractère déclencheur aussi (js/settings-history.js).
const TextExpansion = (function () {
  const TABLE_NAME = 'Publipostage_Abreviations';
  const TABLE_COLUMNS = [
    { id: 'Utilisateur', type: 'Text' },
    { id: 'Abreviation', type: 'Text' },
    { id: 'Texte', type: 'Text' },
  ];
  const DEFAULT_CHAR = '§';
  // Tapés juste après une abréviation entière, ces caractères la remplacent par son texte : l'espace (normale, insécable, fine insécable), la
  // ponctuation et les fermants. Pas Entrée : la règle de saisie la consommerait sans couper le paragraphe ; Entrée ouvre sa propre voie, la liste.
  const DELIMITERS = '   .,;:!?)]}»';

  function lang() { return (typeof I18n !== 'undefined' && I18n.getLang()) || 'fr'; }
  // Échappe ce qui a un sens dans une expression régulière (mode `u` : seuls les caractères de syntaxe et « / » peuvent l'être).
  function escapeRegExp(text) { return String(text).replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&'); }

  // Caractère déclencheur

  const { storedChar, charProblem, triggerChar, setTriggerChar } = (function () {
    const CHAR_STORAGE = 'pp_expansion_char';

    function variablesChar() { return typeof Variables !== 'undefined' ? Variables.triggerChar() : '#'; }

    function storedChar() {
      const v = PersonStore.get(CHAR_STORAGE);
      return (v && v.length === 1) ? v : DEFAULT_CHAR;
    }

    function charProblem(value) {
      // Ni lettre, chiffre, espace, tiret ni tiret bas (ce sont les caractères d'une abréviation), ni un délimiteur (il clôt une abréviation), ni une
      // moitié de caractère sur deux positions (un emoji coupé par maxlength). Retourne '' quand le caractère convient, sinon la fin de la clé
      // `settings.expansion.char.<problème>`.
      if (typeof value !== 'string' || value.length !== 1) return 'invalid';
      if (/[\p{L}\p{N}\s_-]/u.test(value) || /[\ud800-\udfff]/.test(value) || DELIMITERS.indexOf(value) !== -1) return 'invalid';
      if (value === variablesChar()) return 'sameAsVariables';
      return '';
    }

    function triggerChar() {
      // Le caractère réellement écouté : null quand il est celui du panneau # (deux listes sur la même touche : celle des variables, plus ancienne, garde
      // la main et l'expansion s'efface - l'onglet Réglages > Raccourcis le dit).
      const char = storedChar();
      return char === variablesChar() ? null : char;
    }

    function setTriggerChar(value) {
      const problem = charProblem(value);
      if (problem) return problem;
      PersonStore.set(CHAR_STORAGE, value); // non retenu (stockage indisponible) : le choix ne survivra pas au rechargement
      return '';
    }

    return { storedChar, charProblem, triggerChar, setTriggerChar };
  })();

  // Abréviations de la personne

  // [{ rowId, abbreviation, text }] pour la personne courante seulement - jamais celles des autres, ni en cache ni lues dans la liste. null tant que
  // rien n'est lu.
  const entries = GristAPI.createMemoizedLoad(readEntries);
  let tableKnown = false; // la table existe dans le document (vue ou créée)
  // Écritures mises en file : deux « Ajouter » rapprochés ne doivent ni se doubler ni voir un état périmé (le second contrôle les doublons après que
  // le premier a fini).
  const writes = GristAPI.createWriteQueue();

  // La personne courante : identification impossible (lecteur Grist, document sans formule déclenchée) = personne anonyme, '' ; jamais bloquant. Le
  // refus de créer la table d'identification n'est pas gardé (js/grist-api.js:createUserEmailCache).
  const userEmail = GristAPI.createUserEmailCache(() => GristAPI.getCurrentUserEmail());

  async function readEntries() {
    const email = (await userEmail.get()) || '';
    const found = [];
    let tables;
    try { tables = await grist.docApi.listTables(); } catch (e) { console.warn('[text-expansion] liste des tables illisible', e); return found; }
    // Pas de table = aucune abréviation : elle n'est créée qu'à la première écriture (ensureTable), jamais pour lire.
    if (tables.indexOf(TABLE_NAME) === -1) return found;
    tableKnown = true;
    let data;
    try { data = await grist.docApi.fetchTable(TABLE_NAME); } catch (e) { console.warn('[text-expansion] lecture des abréviations impossible', e); return found; }
    for (let i = 0; i < data.id.length; i++) {
      if (((data.Utilisateur && data.Utilisateur[i]) || '') !== email) continue;
      const abbreviation = String((data.Abreviation && data.Abreviation[i]) || '').trim();
      if (!abbreviation) continue;
      found.push({ rowId: data.id[i], abbreviation, text: String((data.Texte && data.Texte[i]) || '') });
    }
    return found;
  }

  // Une seule lecture à la fois, mémorisée ; `force` relit (ouverture de l'onglet Réglages : une abréviation ajoutée depuis un autre onglet du
  // navigateur ou à la main dans Grist y apparaît).
  const load = entries.load;

  // Oublie tout (tests, changement d'identité) : la prochaine lecture repart de Grist.
  function reset() { entries.reset(); tableKnown = false; userEmail.reset(); writes.reset(); }

  const normalizeKey = value => String(value || '').trim().toLowerCase();
  function lookup(abbreviation) {
    const key = normalizeKey(abbreviation);
    const known = entries.get();
    return (known && key && known.find(e => normalizeKey(e.abbreviation) === key)) || null;
  }

  function list() {
    return (entries.get() || []).slice().sort((a, b) => a.abbreviation.localeCompare(b.abbreviation, lang()));
  }

  function rankEntries(query) {
    // Ce que la liste « § » propose pour `query` : l'abréviation entière d'abord, puis celles qui commencent par la saisie, celles qui la contiennent,
    // enfin celles dont le texte a un mot qui commence ainsi (« bordeaux » retrouve « ub »). Un mot, pas un morceau de mot : « u » ne remonterait sinon
    // que du bruit (« rue », « jour »).
    const q = normalizeKey(query);
    const wordStart = q && new RegExp('(^|[^\\p{L}\\p{N}])' + escapeRegExp(q), 'iu');
    const ranked = [];
    (entries.get() || []).forEach(entry => {
      const key = normalizeKey(entry.abbreviation);
      let rank;
      if (!q) rank = 1;
      else if (key === q) rank = 0;
      else if (key.indexOf(q) === 0) rank = 1;
      else if (key.indexOf(q) !== -1) rank = 2;
      else if (wordStart.test(entry.text)) rank = 3;
      else return;
      ranked.push({ entry, rank });
    });
    ranked.sort((a, b) => a.rank - b.rank || a.entry.abbreviation.localeCompare(b.entry.abbreviation, lang()));
    return ranked.map(r => r.entry);
  }

  function filterEntries(query) {
    // Lignes de la liste « § » : au-delà, une dernière ligne dit combien d'abréviations de plus répondent à la saisie (taper plus de lettres les
    // resserre).
    const MAX_SUGGESTIONS = 50;
    // Les MAX_SUGGESTIONS premières ; `more` : combien d'autres répondent encore à la saisie (la liste le dit : « Encore N résultats »).
    const ranked = rankEntries(query);
    const shown = ranked.slice(0, MAX_SUGGESTIONS);
    shown.more = ranked.length - shown.length;
    return shown;
  }

  function cleanEntry(abbreviation, text) {
    // Ce qu'on enregistre : l'abréviation sans espaces ni déclencheur de tête (« §ub » collé tel quel dans le champ), le texte aux retours à la ligne
    // normalisés.
    let key = String(abbreviation || '').trim();
    const char = storedChar();
    if (key.indexOf(char) === 0) key = key.slice(1).trim();
    return { abbreviation: key, text: String(text || '').replace(/\r\n?/g, '\n').trim() };
  }

  function checkEntry(abbreviation, text, exceptRowId) {
    // '' quand l'entrée est valable, sinon le code de l'erreur (js/text-expansion-settings.js l'écrit en toutes lettres). `exceptRowId` : la ligne
    // qu'on modifie, qui ne fait pas doublon avec elle-même.
    const MAX_ABBREVIATION_LENGTH = 30;
    const MAX_TEXT_LENGTH = 2000;
    // Ce qu'on peut taper après le déclencheur : lettres (toutes langues), chiffres, tiret et tiret bas. Tout autre caractère tapé juste après une
    // abréviation entière la clôt (DELIMITERS) ou n'a aucun rapport avec elle.
    const ABBREVIATION_PATTERN = /^[\p{L}\p{N}_-]+$/u;
    if (!abbreviation) return 'empty';
    if (abbreviation.length > MAX_ABBREVIATION_LENGTH) return 'tooLong';
    if (!ABBREVIATION_PATTERN.test(abbreviation)) return 'chars';
    if (!text) return 'textEmpty';
    if (text.length > MAX_TEXT_LENGTH) return 'textTooLong';
    const key = normalizeKey(abbreviation);
    if ((entries.get() || []).some(e => e.rowId !== exceptRowId && normalizeKey(e.abbreviation) === key)) return 'duplicate';
    return '';
  }

  function validationError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
  }

  async function ensureTable() {
    if (tableKnown) return;
    await GristAPI.ensureTable(TABLE_NAME, TABLE_COLUMNS);
    tableKnown = true;
  }

  // Aucune ligne de la table n'a le numéro `rowId`, de quelque personne qu'elle soit : la table est commune à toutes les personnes du document, alors que `entries` n'a que les lignes de la courante.
  async function rowIdIsFree(rowId) {
    try {
      const data = await grist.docApi.fetchTable(TABLE_NAME);
      return !!data && Array.isArray(data.id) && data.id.indexOf(rowId) === -1;
    } catch (e) { return false; }
  }

  // `wantedRowId` : le numéro de ligne d'une abréviation retirée, que l'historique d'Annuler (js/expansion-history.js) lui rend s'il est libre ; pris depuis, ou illisible, la ligne reçoit un numéro neuf.
  function add(rawAbbreviation, rawText, wantedRowId) {
    return writes.enqueue(async () => {
      await load();
      const clean = cleanEntry(rawAbbreviation, rawText);
      const problem = checkEntry(clean.abbreviation, clean.text, null);
      if (problem) throw validationError(problem);
      await ensureTable();
      const email = (await userEmail.get()) || '';
      const rowId = Number.isInteger(wantedRowId) && wantedRowId >= 1 && (await rowIdIsFree(wantedRowId)) ? wantedRowId : null;
      const result = await grist.docApi.applyUserActions([['AddRecord', TABLE_NAME, rowId, { Utilisateur: email, Abreviation: clean.abbreviation, Texte: clean.text }]]);
      const entry = { rowId: result.retValues[0], abbreviation: clean.abbreviation, text: clean.text };
      entries.get().push(entry);
      return Object.assign({}, entry);
    });
  }

  function update(rowId, rawAbbreviation, rawText) {
    return writes.enqueue(async () => {
      await load();
      const entry = entries.get().find(e => e.rowId === rowId);
      if (!entry) return null; // retirée entre-temps (autre onglet) : rien à modifier
      const clean = cleanEntry(rawAbbreviation, rawText);
      const problem = checkEntry(clean.abbreviation, clean.text, rowId);
      if (problem) throw validationError(problem);
      await grist.docApi.applyUserActions([['UpdateRecord', TABLE_NAME, rowId, { Abreviation: clean.abbreviation, Texte: clean.text }]]);
      entry.abbreviation = clean.abbreviation;
      entry.text = clean.text;
      return Object.assign({}, entry);
    });
  }

  function remove(rowId) {
    return writes.enqueue(async () => {
      await load();
      const index = entries.get().findIndex(e => e.rowId === rowId);
      if (index === -1) return false;
      await grist.docApi.applyUserActions([['RemoveRecord', TABLE_NAME, rowId]]);
      entries.get().splice(index, 1);
      return true;
    });
  }

  // Remplacement dans le document

  function replaceWithExpansion(tr, schema, from, to, text, suffix) {
    // Remplace [from, to] de `tr` par `text` (un retour à la ligne devient un saut de ligne, comme Maj+Entrée) puis `suffix` (le délimiteur tapé, que
    // la règle de saisie n'a pas encore inséré). Le texte reprend les marques de ce qu'il remplace - gras, couleur, suivi des modifications -, comme le
    // fait insertText.
    const marks = (from === to ? tr.doc.resolve(from).marks() : tr.doc.resolve(from).marksAcross(tr.doc.resolve(to))) || [];
    const nodes = [];
    String(text).split('\n').forEach((line, index) => {
      if (index) nodes.push(schema.nodes.hardBreak ? schema.nodes.hardBreak.create() : schema.text(' ', marks));
      if (line) nodes.push(schema.text(line, marks));
    });
    if (suffix) nodes.push(schema.text(suffix, marks));
    tr.replaceWith(from, to, nodes);
  }

  // Règle de saisie : « §ub » + espace

  function findTypedAbbreviation(text) {
    // `text` = tout ce qui précède le curseur dans le paragraphe, plus le caractère qu'on vient de taper (@tiptap/core, InputRule). Les bulles et
    // autres atomes y sont écrits « %leaf% » : ils comptent comme un caractère qui n'est ni lettre ni chiffre, donc « [bulle]§ub » s'étend. Le
    // déclencheur doit suivre le début du paragraphe ou un caractère qui n'est ni lettre, ni chiffre, ni tiret bas : « a§b » (une adresse, un code) ne
    // s'étend jamais.
    const known = entries.get();
    if (!known || !known.length) return null;
    const char = triggerChar();
    if (!char || text.length < 3) return null;
    const typed = text.slice(-1);
    if (DELIMITERS.indexOf(typed) === -1) return null;
    const pattern = new RegExp('(^|[^\\p{L}\\p{N}_])' + escapeRegExp(char) + '([\\p{L}\\p{N}_-]+)$', 'u');
    const match = pattern.exec(text.slice(0, -1));
    if (!match || match[1] === char) return null;
    const entry = lookup(match[2]);
    if (!entry) return null;
    return { index: match.index + match[1].length, text: char + match[2] + typed, data: { entry } };
  }

  // Liste « § »

  function findSuggestion(config) {
    // @tiptap/suggestion cherche le déclencheur dans le texte qui précède le curseur, jusqu'au début du paragraphe ou d'un autre nœud (bulle, marque
    // différente) : même lecture que sa version d'origine, mais le caractère se relit à chaque frappe, et le déclencheur doit suivre le début ou un
    // caractère qui n'est ni lettre ni chiffre.
    const char = triggerChar();
    if (!char) return null;
    const node = config.$position.nodeBefore;
    const text = node && node.isText && node.text;
    if (!text) return null;
    const pattern = new RegExp('(^|[^\\p{L}\\p{N}_])' + escapeRegExp(char) + '([\\p{L}\\p{N}_-]*)$', 'u');
    const match = pattern.exec(text);
    if (!match || match[1] === char) return null;
    const from = config.$position.pos - text.length + match.index + match[1].length;
    return { range: { from, to: config.$position.pos }, query: match[2], text: char + match[2] };
  }

  // La liste « § » : la boîte, la ligne choisie et les touches sont celles de js/suggestion-list.js (partagées avec la liste « @ » de js/mention.js) ;
  // ici, seulement ce que dit une ligne : l'abréviation en gras, puis son texte sur une seule ligne.
  const suggestions = SuggestionList.create({
    id: 'expansion-box',
    label: () => I18n.t('expansion.panel.label'),
    row: entry => {
      const abbreviation = document.createElement('span');
      abbreviation.className = 'ex-abbr';
      abbreviation.textContent = (triggerChar() || DEFAULT_CHAR) + entry.abbreviation;
      const text = document.createElement('span');
      text.className = 'ex-text';
      text.textContent = entry.text;
      return [abbreviation, text];
    },
  });

  function createExtension(Extension, Suggestion, InputRule, PluginKey) {
    // Reçoit Extension, Suggestion, InputRule et PluginKey de js/editor.js plutôt que de les importer : même principe que Variables.createExtension (un
    // seul import() dynamique, déjà fait là-bas). PluginKey : la clé par défaut de Suggestion est celle du panneau # - deux plugins ne peuvent pas la
    // partager.
    const pluginKey = new PluginKey('textExpansionSuggestion');
    return Extension.create({
      name: 'textExpansion',
      // Avant les autres extensions : le Tab d'un élément de liste ou d'une zone à deux colonnes (js/editor-nodes.js) et l'Entrée d'une liste
      // passeraient sinon avant la liste ouverte, qui ne verrait jamais la touche. Hors liste ouverte, elle rend la main sans rien consommer.
      priority: 1000,
      onCreate() {
        // Première prise de focus : les abréviations se lisent maintenant, pas au démarrage du widget - la première frappe de « §ub » n'attend alors
        // plus Grist.
        const editor = this.editor;
        const preload = () => { editor.off('focus', preload); load().catch(() => {}); };
        editor.on('focus', preload);
      },
      addInputRules() {
        return [new InputRule({
          find: findTypedAbbreviation,
          handler: ({ state, range, match }) => {
            const entry = match.data && match.data.entry;
            if (!entry) return null;
            // `range` s'arrête avant le caractère tapé, que la saisie n'a pas encore inséré : il suit le texte, sinon l'espace disparaîtrait avec
            // l'abréviation.
            replaceWithExpansion(state.tr, state.schema, range.from, range.to, entry.text, match[0].slice(-1));
          },
        })];
      },
      addProseMirrorPlugins() {
        return [
          Suggestion({
            pluginKey,
            editor: this.editor,
            char: DEFAULT_CHAR, // jamais lu : findSuggestion relit le caractère réglé
            findSuggestionMatch: findSuggestion,
            decorationClass: 'pp-expansion-suggestion',
            // Jamais dans un bloc de code : « § » y est un caractère comme un autre (le texte s'y écrit tel quel, comme pour le panneau #).
            allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code,
            items: async ({ query }) => { await load(); return filterEntries(query); },
            command: ({ editor, range, props }) => {
              editor.chain().focus().command(({ tr, state }) => {
                replaceWithExpansion(tr, state.schema, range.from, range.to, props.text, '');
                return true;
              }).run();
            },
            render: suggestions.render,
          }),
        ];
      },
    });
  }

  return {
    storedChar, triggerChar, charProblem, setTriggerChar,
    load, reset, list, filterEntries, add, update, remove,
    createExtension,
  };
})();
