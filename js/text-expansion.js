// Expansion de texte : un caractère déclencheur (« § » par défaut, réglable dans Réglages > Raccourcis), une abréviation, puis un espace (ou une
// ponctuation, ou Tab dans la liste), et l'abréviation est remplacée par son texte, avec la mise en forme de ce qu'on vient de taper (« §ub » devient
// « université de Bordeaux »). Retour arrière juste après l'expansion rend la saisie d'origine. Le déclencheur seul ouvre la liste des abréviations,
// filtrée à la frappe, comme le panneau # de js/variables.js (@tiptap/suggestion, flèches, Entrée ou Tab, Échap).
//
// Par personne : les abréviations vivent dans la table Publipostage_Abreviations du document (Utilisateur = email Grist, repli '' sans identité, même
// patron que js/template-preferences.js), créée à la première abréviation ajoutée. Le caractère déclencheur, comme la langue et le thème, est en
// localStorage (par navigateur). La table est lue au premier focus de l'éditeur ou à l'ouverture de Réglages > Raccourcis, jamais au démarrage du
// widget.
//
// Le caractère déclencheur se relit à chaque frappe (findSuggestion, findTypedAbbreviation) : un changement dans Réglages vaut tout de suite, alors
// que le `char` du panneau # (js/variables.js) est figé à la construction de l'éditeur.
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
      try {
        const v = localStorage.getItem(CHAR_STORAGE);
        return (v && v.length === 1) ? v : DEFAULT_CHAR;
      } catch (e) { return DEFAULT_CHAR; }
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
      try { localStorage.setItem(CHAR_STORAGE, value); } catch (e) { /* stockage indisponible : le choix ne survivra pas au rechargement */ }
      return '';
    }

    return { storedChar, charProblem, triggerChar, setTriggerChar };
  })();

  // Abréviations de la personne

  // [{ rowId, abbreviation, text }] pour la personne courante seulement - jamais celles des autres, ni en cache ni lues dans la liste. null tant que
  // rien n'est lu.
  let entries = null;
  let loading = null;
  let tableKnown = false; // la table existe dans le document (vue ou créée)
  // Écritures mises en file : deux « Ajouter » rapprochés ne doivent ni se doubler ni voir un état périmé (le second contrôle les doublons après que
  // le premier a fini).
  const writes = GristAPI.createWriteQueue();

  // Même repli que js/template-preferences.js:currentUserEmail : identification impossible (lecteur Grist, document sans formule déclenchée) =
  // personne anonyme, '' ; jamais bloquant. undefined = jamais tentée, null = tentée et échouée.
  let cachedEmail;
  async function currentUserEmail() {
    if (cachedEmail !== undefined) return cachedEmail;
    try {
      cachedEmail = await GristAPI.getCurrentUserEmail();
    } catch (e) {
      if (GristAPI.isTablesDeclined(e)) return null; // refus de créer la table d'identification : pas gardé, la personne qui accepte plus tard doit être reconnue
      cachedEmail = null;
    }
    return cachedEmail;
  }

  async function readEntries() {
    const email = (await currentUserEmail()) || '';
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

  function load(force) {
    // Une seule lecture à la fois, mémorisée ; `force` relit (ouverture de l'onglet Réglages : une abréviation ajoutée depuis un autre onglet du
    // navigateur ou à la main dans Grist y apparaît).
    if (!force && entries) return Promise.resolve(entries);
    if (loading) return loading;
    loading = readEntries().then(found => { entries = found; return entries; }).finally(() => { loading = null; });
    return loading;
  }

  // Oublie tout (tests, changement d'identité) : la prochaine lecture repart de Grist.
  function reset() { entries = null; loading = null; tableKnown = false; cachedEmail = undefined; writes.reset(); }

  const normalizeKey = value => String(value || '').trim().toLowerCase();
  function lookup(abbreviation) {
    const key = normalizeKey(abbreviation);
    return (entries && key && entries.find(e => normalizeKey(e.abbreviation) === key)) || null;
  }

  function list() {
    return (entries || []).slice().sort((a, b) => a.abbreviation.localeCompare(b.abbreviation, lang()));
  }

  function rankEntries(query) {
    // Ce que la liste « § » propose pour `query` : l'abréviation entière d'abord, puis celles qui commencent par la saisie, celles qui la contiennent,
    // enfin celles dont le texte a un mot qui commence ainsi (« bordeaux » retrouve « ub »). Un mot, pas un morceau de mot : « u » ne remonterait sinon
    // que du bruit (« rue », « jour »).
    const q = normalizeKey(query);
    const wordStart = q && new RegExp('(^|[^\\p{L}\\p{N}])' + escapeRegExp(q), 'iu');
    const ranked = [];
    (entries || []).forEach(entry => {
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
    if ((entries || []).some(e => e.rowId !== exceptRowId && normalizeKey(e.abbreviation) === key)) return 'duplicate';
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

  function add(rawAbbreviation, rawText) {
    return writes.enqueue(async () => {
      await load();
      const clean = cleanEntry(rawAbbreviation, rawText);
      const problem = checkEntry(clean.abbreviation, clean.text, null);
      if (problem) throw validationError(problem);
      await ensureTable();
      const email = (await currentUserEmail()) || '';
      const result = await grist.docApi.applyUserActions([['AddRecord', TABLE_NAME, null, { Utilisateur: email, Abreviation: clean.abbreviation, Texte: clean.text }]]);
      const entry = { rowId: result.retValues[0], abbreviation: clean.abbreviation, text: clean.text };
      entries.push(entry);
      return Object.assign({}, entry);
    });
  }

  function update(rowId, rawAbbreviation, rawText) {
    return writes.enqueue(async () => {
      await load();
      const entry = entries.find(e => e.rowId === rowId);
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
      const index = entries.findIndex(e => e.rowId === rowId);
      if (index === -1) return false;
      await grist.docApi.applyUserActions([['RemoveRecord', TABLE_NAME, rowId]]);
      entries.splice(index, 1);
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
    if (!entries || !entries.length) return null;
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

  let box = null;
  let rowEls = [];
  let moreEl = null; // la ligne « Encore N résultats » sous les abréviations montrées, quand il en reste
  let shown = [];
  let selected = 0;
  let pickItem = null;

  function ensureBox() {
    if (box) return box;
    box = document.createElement('div');
    box.id = 'expansion-box';
    box.setAttribute('role', 'listbox');
    box.style.display = 'none';
    document.body.appendChild(box);
    return box;
  }

  function paintSelection() {
    // La ligne choisie suit les flèches comme le survol ; elle reste visible quand la liste défile.
    rowEls.forEach((row, index) => {
      const on = index === selected;
      row.classList.toggle('selected', on);
      row.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    const row = rowEls[selected];
    if (!row || !box) return;
    // La ligne « Encore N résultats » reste collée au bas de la liste : la ligne choisie ne passe pas dessous.
    const covered = moreEl ? moreEl.offsetHeight : 0;
    if (row.offsetTop < box.scrollTop) box.scrollTop = row.offsetTop;
    else if (row.offsetTop + row.offsetHeight > box.scrollTop + box.clientHeight - covered) box.scrollTop = row.offsetTop + row.offsetHeight - box.clientHeight + covered;
  }

  function hide() {
    if (box) box.style.display = 'none';
    shown = [];
    rowEls = [];
    moreEl = null;
    pickItem = null;
  }

  function show(props) {
    shown = props.items || [];
    pickItem = props.command;
    if (!shown.length) { hide(); return; }
    selected = 0;
    const el = ensureBox();
    el.setAttribute('aria-label', I18n.t('expansion.panel.label'));
    el.textContent = '';
    const char = triggerChar() || DEFAULT_CHAR;
    rowEls = shown.map((entry, index) => {
      const row = document.createElement('div');
      row.className = 'ex-item';
      row.setAttribute('role', 'option');
      const abbreviation = document.createElement('span');
      abbreviation.className = 'ex-abbr';
      abbreviation.textContent = char + entry.abbreviation;
      const text = document.createElement('span');
      text.className = 'ex-text';
      text.textContent = entry.text;
      row.append(abbreviation, text);
      // mousedown + preventDefault (pas click) : l'éditeur garde le focus, comme dans le panneau # (js/variables.js:render).
      row.addEventListener('mousedown', event => { event.preventDefault(); if (pickItem) pickItem(entry); });
      row.addEventListener('mouseenter', () => { if (selected !== index) { selected = index; paintSelection(); } });
      el.appendChild(row);
      return row;
    });
    moreEl = null;
    el.classList.toggle('has-more', shown.more > 0);
    if (shown.more > 0) {
      moreEl = document.createElement('div');
      moreEl.className = 'ex-more';
      moreEl.setAttribute('role', 'presentation');
      // La phrase des listes avec recherche (js/search-select.js) : « Encore N résultats : précisez la recherche. »
      moreEl.textContent = I18n.t('searchSelect.more', { count: shown.more });
      el.appendChild(moreEl);
    }
    el.style.display = 'flex';
    paintSelection();
    const rect = props.clientRect && props.clientRect();
    if (rect) ViewportFit.placePopup(el, rect, { gap: 4 });
  }

  function suggestionRender() {
    return {
      onStart(props) { show(props); },
      onUpdate(props) { show(props); },
      onKeyDown({ event }) {
        if (!shown.length || !box || box.style.display === 'none') return false;
        if (event.key === 'ArrowDown') { selected = (selected + 1) % shown.length; paintSelection(); return true; }
        if (event.key === 'ArrowUp') { selected = (selected - 1 + shown.length) % shown.length; paintSelection(); return true; }
        if (event.key === 'Enter' || event.key === 'Tab') {
          // Maj+Entrée (saut de ligne), Maj+Tab (remonter d'un cran dans une liste) et les raccourcis avec Ctrl/Alt/Cmd gardent leur sens.
          if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return false;
          if (pickItem) pickItem(shown[selected]);
          return true;
        }
        if (event.key === 'Escape') { hide(); return true; }
        return false;
      },
      onExit() { hide(); },
    };
  }

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
            render: suggestionRender,
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
