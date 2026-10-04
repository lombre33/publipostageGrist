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
  const CHAR_STORAGE = 'pp_expansion_char';
  const DEFAULT_CHAR = '§';
  const MAX_ABBREVIATION_LENGTH = 30;
  const MAX_TEXT_LENGTH = 2000;
  // Ce qu'on peut taper après le déclencheur : lettres (toutes langues), chiffres, tiret et tiret bas. Tout autre caractère tapé juste après une
  // abréviation entière la clôt (DELIMITERS) ou n'a aucun rapport avec elle.
  const ABBREVIATION_PATTERN = /^[\p{L}\p{N}_-]+$/u;
  // Tapés juste après une abréviation entière, ces caractères la remplacent par son texte : l'espace (normale, insécable, fine insécable), la
  // ponctuation et les fermants. Pas Entrée : la règle de saisie la consommerait sans couper le paragraphe ; Entrée ouvre sa propre voie, la liste.
  const DELIMITERS = '   .,;:!?)]}»';
  // Erreurs de saisie que l'onglet Réglages sait écrire (clés `settings.expansion.error.<code>`) ; toute autre erreur est un échec d'écriture dans
  // Grist.
  const VALIDATION_CODES = ['empty', 'tooLong', 'chars', 'duplicate', 'textEmpty', 'textTooLong'];

  function lang() { return (typeof I18n !== 'undefined' && I18n.getLang()) || 'fr'; }
  // Échappe ce qui a un sens dans une expression régulière (mode `u` : seuls les caractères de syntaxe et « / » peuvent l'être).
  function escapeRegExp(text) { return String(text).replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&'); }
  function variablesChar() { return typeof Variables !== 'undefined' ? Variables.triggerChar() : '#'; }

  // Caractère déclencheur

  function storedChar() {
    try {
      const v = localStorage.getItem(CHAR_STORAGE);
      return (v && v.length === 1) ? v : DEFAULT_CHAR;
    } catch (e) { return DEFAULT_CHAR; }
  }

  // Ni lettre, chiffre, espace, tiret ni tiret bas (ce sont les caractères d'une abréviation), ni un délimiteur (il clôt une abréviation), ni une
  // moitié de caractère sur deux positions (un emoji coupé par maxlength). Retourne '' quand le caractère convient, sinon la fin de la clé
  // `settings.expansion.char.<problème>`.
  function charProblem(value) {
    if (typeof value !== 'string' || value.length !== 1) return 'invalid';
    if (/[\p{L}\p{N}\s_-]/u.test(value) || /[\ud800-\udfff]/.test(value) || DELIMITERS.indexOf(value) !== -1) return 'invalid';
    if (value === variablesChar()) return 'sameAsVariables';
    return '';
  }

  // Le caractère réellement écouté : null quand il est celui du panneau # (deux listes sur la même touche : celle des variables, plus ancienne, garde
  // la main et l'expansion s'efface - l'onglet Réglages > Raccourcis le dit).
  function triggerChar() {
    const char = storedChar();
    return char === variablesChar() ? null : char;
  }

  function setTriggerChar(value) {
    const problem = charProblem(value);
    if (problem) return problem;
    try { localStorage.setItem(CHAR_STORAGE, value); } catch (e) { /* stockage indisponible : le choix ne survivra pas au rechargement */ }
    return '';
  }

  // Abréviations de la personne

  // [{ rowId, abbreviation, text }] pour la personne courante seulement - jamais celles des autres, ni en cache ni lues dans la liste. null tant que
  // rien n'est lu.
  let entries = null;
  let loading = null;
  let tableKnown = false; // la table existe dans le document (vue ou créée)
  let writeQueue = Promise.resolve();

  // Même repli que js/template-preferences.js:currentUserEmail : identification impossible (lecteur Grist, document sans formule déclenchée) =
  // personne anonyme, '' ; jamais bloquant. undefined = jamais tentée, null = tentée et échouée.
  let cachedEmail;
  async function currentUserEmail() {
    if (cachedEmail !== undefined) return cachedEmail;
    try {
      cachedEmail = await GristAPI.getCurrentUserEmail();
    } catch (e) {
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

  // Une seule lecture à la fois, mémorisée ; `force` relit (ouverture de l'onglet Réglages : une abréviation ajoutée depuis un autre onglet du
  // navigateur ou à la main dans Grist y apparaît).
  function load(force) {
    if (!force && entries) return Promise.resolve(entries);
    if (loading) return loading;
    loading = readEntries().then(found => { entries = found; return entries; }).finally(() => { loading = null; });
    return loading;
  }

  // Oublie tout (tests, changement d'identité) : la prochaine lecture repart de Grist.
  function reset() { entries = null; loading = null; tableKnown = false; cachedEmail = undefined; writeQueue = Promise.resolve(); }

  const normalizeKey = value => String(value || '').trim().toLowerCase();
  function lookup(abbreviation) {
    const key = normalizeKey(abbreviation);
    return (entries && key && entries.find(e => normalizeKey(e.abbreviation) === key)) || null;
  }

  function list() {
    return (entries || []).slice().sort((a, b) => a.abbreviation.localeCompare(b.abbreviation, lang()));
  }

  // Ce que la liste « § » propose pour `query` : l'abréviation entière d'abord, puis celles qui commencent par la saisie, celles qui la contiennent,
  // enfin celles dont le texte a un mot qui commence ainsi (« bordeaux » retrouve « ub »). Un mot, pas un morceau de mot : « u » ne remonterait sinon
  // que du bruit (« rue », « jour »).
  function filterEntries(query) {
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
    return ranked.slice(0, 50).map(r => r.entry);
  }

  // Ce qu'on enregistre : l'abréviation sans espaces ni déclencheur de tête (« §ub » collé tel quel dans le champ), le texte aux retours à la ligne
  // normalisés.
  function cleanEntry(abbreviation, text) {
    let key = String(abbreviation || '').trim();
    const char = storedChar();
    if (key.indexOf(char) === 0) key = key.slice(1).trim();
    return { abbreviation: key, text: String(text || '').replace(/\r\n?/g, '\n').trim() };
  }

  // '' quand l'entrée est valable, sinon le code de l'erreur (VALIDATION_CODES). `exceptRowId` : la ligne qu'on modifie, qui ne fait pas doublon avec
  // elle-même.
  function checkEntry(abbreviation, text, exceptRowId) {
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

  // Écritures mises en file : deux « Ajouter » rapprochés ne doivent ni se doubler ni voir un état périmé (le second contrôle les doublons après que
  // le premier a fini).
  function enqueue(job) {
    const run = writeQueue.then(job);
    writeQueue = run.catch(() => {});
    return run;
  }

  async function ensureTable() {
    if (tableKnown) return;
    const tables = await grist.docApi.listTables();
    if (tables.indexOf(TABLE_NAME) === -1) {
      await grist.docApi.applyUserActions([['AddTable', TABLE_NAME, [
        { id: 'Utilisateur', type: 'Text' },
        { id: 'Abreviation', type: 'Text' },
        { id: 'Texte', type: 'Text' },
      ]]]);
      if (typeof PageTree !== 'undefined') PageTree.afterTableCreated(TABLE_NAME);
    }
    tableKnown = true;
  }

  function add(rawAbbreviation, rawText) {
    return enqueue(async () => {
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
    return enqueue(async () => {
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
    return enqueue(async () => {
      await load();
      const index = entries.findIndex(e => e.rowId === rowId);
      if (index === -1) return false;
      await grist.docApi.applyUserActions([['RemoveRecord', TABLE_NAME, rowId]]);
      entries.splice(index, 1);
      return true;
    });
  }

  // Remplacement dans le document

  // Remplace [from, to] de `tr` par `text` (un retour à la ligne devient un saut de ligne, comme Maj+Entrée) puis `suffix` (le délimiteur tapé, que
  // la règle de saisie n'a pas encore inséré). Le texte reprend les marques de ce qu'il remplace - gras, couleur, suivi des modifications -, comme le
  // fait insertText.
  function replaceWithExpansion(tr, schema, from, to, text, suffix) {
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

  // `text` = tout ce qui précède le curseur dans le paragraphe, plus le caractère qu'on vient de taper (@tiptap/core, InputRule). Les bulles et
  // autres atomes y sont écrits « %leaf% » : ils comptent comme un caractère qui n'est ni lettre ni chiffre, donc « [bulle]§ub » s'étend. Le
  // déclencheur doit suivre le début du paragraphe ou un caractère qui n'est ni lettre, ni chiffre, ni tiret bas : « a§b » (une adresse, un code) ne
  // s'étend jamais.
  function findTypedAbbreviation(text) {
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

  // @tiptap/suggestion cherche le déclencheur dans le texte qui précède le curseur, jusqu'au début du paragraphe ou d'un autre nœud (bulle, marque
  // différente) : même lecture que sa version d'origine, mais le caractère se relit à chaque frappe, et le déclencheur doit suivre le début ou un
  // caractère qui n'est ni lettre ni chiffre.
  function findSuggestion(config) {
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

  // La ligne choisie suit les flèches comme le survol ; elle reste visible quand la liste défile.
  function paintSelection() {
    rowEls.forEach((row, index) => {
      const on = index === selected;
      row.classList.toggle('selected', on);
      row.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    const row = rowEls[selected];
    if (!row || !box) return;
    if (row.offsetTop < box.scrollTop) box.scrollTop = row.offsetTop;
    else if (row.offsetTop + row.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = row.offsetTop + row.offsetHeight - box.clientHeight;
  }

  function hide() {
    if (box) box.style.display = 'none';
    shown = [];
    rowEls = [];
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

  // Reçoit Extension, Suggestion, InputRule et PluginKey de js/editor.js plutôt que de les importer : même principe que Variables.createExtension (un
  // seul import() dynamique, déjà fait là-bas). PluginKey : la clé par défaut de Suggestion est celle du panneau # - deux plugins ne peuvent pas la
  // partager.
  function createExtension(Extension, Suggestion, InputRule, PluginKey) {
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

  // Réglages > Raccourcis : abréviations

  function wireSettingsPanel() {
    const panel = document.querySelector('.settings-panel[data-settings-panel="shortcuts"]');
    if (!panel) return;
    const byId = id => document.getElementById(id);
    const intro = byId('settings-expansion-intro');
    const charInput = byId('settings-expansion-char');
    const charStatus = byId('settings-expansion-char-status');
    const form = byId('settings-expansion-form');
    const abbreviationInput = byId('settings-expansion-abbr');
    const textInput = byId('settings-expansion-text');
    const submitButton = byId('settings-expansion-submit');
    const cancelButton = byId('settings-expansion-cancel');
    const status = byId('settings-expansion-status');
    const listEl = byId('settings-expansion-list');
    const emptyEl = byId('settings-expansion-empty');
    if (!charInput || !form || !listEl) return;
    let editingRowId = null;

    function showMessage(el, message) {
      el.hidden = !message;
      el.textContent = message || '';
    }
    function showCharProblem(problem) { showMessage(charStatus, problem ? I18n.t('settings.expansion.char.' + problem) : ''); }
    function setFormStatus(code) {
      if (!code) { showMessage(status, ''); return; }
      showMessage(status, I18n.t('settings.expansion.error.' + (VALIDATION_CODES.indexOf(code) !== -1 ? code : 'saveFailed')));
    }

    // Le texte d'explication cite le caractère réglé (« §ub ») : il se recompose, aucun data-i18n ne peut le porter.
    function renderIntro() { intro.textContent = I18n.t('settings.expansion.intro', { example: storedChar() + 'ub' }); }

    function resetForm() {
      editingRowId = null;
      abbreviationInput.value = '';
      textInput.value = '';
      submitButton.textContent = I18n.t('settings.expansion.add');
      cancelButton.hidden = true;
    }

    function startEditing(entry) {
      editingRowId = entry.rowId;
      abbreviationInput.value = entry.abbreviation;
      textInput.value = entry.text;
      submitButton.textContent = I18n.t('common.save');
      cancelButton.hidden = false;
      setFormStatus('');
      abbreviationInput.focus();
      abbreviationInput.select();
    }

    function renderList() {
      const items = list();
      const char = storedChar();
      listEl.textContent = '';
      emptyEl.hidden = items.length > 0;
      items.forEach(entry => {
        const row = document.createElement('li');
        row.className = 'settings-expansion-row';
        const abbreviation = document.createElement('span');
        abbreviation.className = 'settings-expansion-abbr';
        abbreviation.textContent = char + entry.abbreviation;
        const text = document.createElement('span');
        text.className = 'settings-expansion-text';
        text.textContent = entry.text;
        text.title = entry.text;
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.textContent = I18n.t('settings.expansion.edit');
        edit.setAttribute('aria-label', I18n.t('settings.expansion.editAria', { abbreviation: char + entry.abbreviation }));
        edit.addEventListener('click', () => startEditing(entry));
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'settings-expansion-delete';
        del.textContent = I18n.t('common.delete');
        del.setAttribute('aria-label', I18n.t('settings.expansion.deleteAria', { abbreviation: char + entry.abbreviation }));
        del.addEventListener('click', async () => {
          if (!(await Dialogs.confirm({ title: I18n.t('settings.expansion.confirmDelete', { abbreviation: char + entry.abbreviation }), confirmLabel: I18n.t('common.delete'), danger: true }))) return;
          try {
            await remove(entry.rowId);
            if (editingRowId === entry.rowId) resetForm();
            setFormStatus('');
          } catch (error) {
            console.warn('[text-expansion] suppression impossible', error);
            setFormStatus('saveFailed');
          }
          renderList();
          abbreviationInput.focus();
        });
        row.append(abbreviation, text, edit, del);
        listEl.appendChild(row);
      });
    }

    function syncChar() {
      charInput.value = storedChar();
      showCharProblem(charProblem(storedChar()) === 'sameAsVariables' ? 'sameAsVariables' : '');
      renderIntro();
    }

    function refresh() {
      syncChar();
      setFormStatus('');
      renderList(); // ce qui est déjà lu s'affiche tout de suite, la relecture complète ensuite
      load(true).then(renderList, () => renderList());
    }

    charInput.addEventListener('input', () => {
      const problem = charInput.value ? setTriggerChar(charInput.value) : 'invalid';
      showCharProblem(problem);
      if (!problem) { renderIntro(); renderList(); }
    });
    // Un caractère refusé ne reste pas affiché comme s'il était retenu : à la sortie du champ, il retrouve celui qui est réellement en vigueur.
    charInput.addEventListener('blur', () => {
      if (charInput.value !== storedChar()) syncChar();
    });

    form.addEventListener('submit', async event => {
      event.preventDefault();
      setFormStatus('');
      submitButton.disabled = true;
      try {
        if (editingRowId != null) await update(editingRowId, abbreviationInput.value, textInput.value);
        else await add(abbreviationInput.value, textInput.value);
        resetForm();
        renderList();
        abbreviationInput.focus();
      } catch (error) {
        const code = error && error.code;
        if (VALIDATION_CODES.indexOf(code) === -1) console.warn('[text-expansion] enregistrement impossible', error);
        setFormStatus(code);
        (code === 'textEmpty' || code === 'textTooLong' ? textInput : abbreviationInput).focus();
      } finally {
        submitButton.disabled = false;
      }
    });
    cancelButton.addEventListener('click', () => { resetForm(); setFormStatus(''); abbreviationInput.focus(); });
    // Ctrl/Cmd+Entrée enregistre depuis le champ de texte, où Entrée seule passe à la ligne (un texte peut en compter plusieurs).
    textInput.addEventListener('keydown', event => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); form.requestSubmit(); }
    });

    const tab = document.querySelector('.settings-tab[data-settings-tab="shortcuts"]');
    if (tab) tab.addEventListener('click', refresh);
    const openButton = document.getElementById('v2-btn-settings');
    // L'onglet reste celui qu'on avait laissé à la fermeture : rouvrir Réglages dessus doit aussi relire.
    if (openButton) openButton.addEventListener('click', () => { if (!panel.hidden) refresh(); });
    I18n.onChange(() => { renderIntro(); renderList(); resetForm(); setFormStatus(''); });
    resetForm();
    syncChar();
  }

  wireSettingsPanel();

  return {
    storedChar, triggerChar, charProblem, setTriggerChar,
    load, reset, list, filterEntries, add, update, remove,
    createExtension,
  };
})();
