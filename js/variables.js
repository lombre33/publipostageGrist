// Variables — badges #Variable + autocomplétion, sur @tiptap/suggestion. Popup : classes CSS #autocomplete-box/.ac-item/.selected (css/style.css), créée
// dynamiquement ici plutôt que déclarée dans index.html.
const Variables = (function () {
  // Touche de déclenchement configurable (panneau Réglages), lue directement depuis localStorage. Un seul caractère attendu (contrôlé par le <select> du
  // panneau) - tout le reste retombe sur '#' par défaut.
  function triggerChar() {
    try {
      const v = localStorage.getItem('pp_trigger_char');
      return (v && v.length === 1) ? v : '#';
    } catch (e) { return '#'; }
  }
  let acBox = null;
  let acItemsBox = null;
  let currentItems = [];
  let selectedIndex = 0;
  // Une colonne ajoutée après le chargement du widget n'apparaissait jamais dans #Variable (refreshSchema n'est appelé qu'une fois, à init()). Ce flag
  // déclenche un seul rafraîchissement par session de saisie plutôt qu'à chaque frappe, partagé entre le déclencheur de l'éditeur et celui du nom de fichier PDF.
  let schemaRefreshedForSession = false;

  // Onglet actif du panneau `#` (l'onglet Nom de fichier PDF n'a pas cet onglet). Toujours 'variables' par défaut à l'ouverture.
  let activeTab = 'variables';
  // 4 chips fixes, jamais issues de GristAPI - `kind:'chip'` distingue ces entrées d'une #Variable. `i18nKey` est résolu à l'affichage (displayKey), pour
  // rester réactif à un changement de langue en cours de session.
  const SMART_CHIP_ITEMS = [
    { key: 'Note de bas de page', i18nKey: 'chips.footnote', kind: 'chip', chipKind: 'footnote' },
    { key: 'Date du jour', i18nKey: 'chips.date', kind: 'chip', chipKind: 'date' },
    { key: 'Heure actuelle', i18nKey: 'chips.time', kind: 'chip', chipKind: 'time' },
    { key: 'Email de l’utilisateur', i18nKey: 'chips.email', kind: 'chip', chipKind: 'email' },
  ];
  function displayKey(item) { return item.i18nKey ? I18n.t(item.i18nKey) : item.key; }
  // Dernières props reçues de @tiptap/suggestion - permet de rejouer updateItems() depuis un clic sur un onglet, qui n'est pas un évènement du plugin
  // Suggestion et ne fournit donc pas ces props lui-même.
  let latestProps = null;

  function ensureBox() {
    if (acBox) return acBox;
    acBox = document.createElement('div');
    acBox.id = 'autocomplete-box';
    acBox.style.display = 'none';
    const tabs = document.createElement('div');
    tabs.className = 'ac-tabs';
    const tabVariables = document.createElement('div');
    tabVariables.className = 'ac-tab';
    tabVariables.textContent = I18n.t('panel.tabVariables');
    tabVariables.dataset.tab = 'variables';
    const tabChips = document.createElement('div');
    tabChips.className = 'ac-tab';
    tabChips.textContent = I18n.t('panel.tabChips');
    tabChips.dataset.tab = 'chips';
    [tabVariables, tabChips].forEach(tab => {
      // mousedown+preventDefault (pas click) : évite qu'un blur du focus éditeur en cours ne perturbe le changement d'onglet.
      tab.addEventListener('mousedown', e => {
        e.preventDefault();
        if (activeTab === tab.dataset.tab) return;
        activeTab = tab.dataset.tab;
        if (latestProps) updateItems(Object.assign({}, latestProps, { items: computeItems(latestProps.query, latestProps.editor) }));
      });
    });
    tabs.appendChild(tabVariables); tabs.appendChild(tabChips);
    acBox.appendChild(tabs);
    acItemsBox = document.createElement('div');
    acItemsBox.className = 'ac-items';
    acBox.appendChild(acItemsBox);
    document.body.appendChild(acBox);
    return acBox;
  }

  // Source des items selon l'onglet actif - centralisé pour être appelé à la fois par l'`items()` de @tiptap/suggestion (à chaque frappe) et par le clic sur
  // un onglet.
  // `editor` (facultatif) : dans une zone répétée par une boucle (js/variable-loop.js:loopTableAt), les colonnes de la table parcourue viennent en tête.
  function computeItems(query, editor) {
    const q = (query || '').toLowerCase();
    if (activeTab === 'chips') {
      // Note de bas de page exclue en édition d'en-tête/pied : cette zone est répétée sur chaque page, sans repère de page physique auquel ancrer une note.
      const items = Editor.isEditingHeaderFooter() ? SMART_CHIP_ITEMS.filter(v => v.chipKind !== 'footnote') : SMART_CHIP_ITEMS;
      return items.filter(v => displayKey(v).toLowerCase().includes(q));
    }
    if (!schemaRefreshedForSession) {
      schemaRefreshedForSession = true;
      GristAPI.refreshSchema().catch(e => console.warn('[variables] rafraîchissement du schéma #Variable échoué', e));
    }
    const all = GristAPI.getAllVariables();
    const found = all.filter(v => v.key.toLowerCase().includes(q));
    const loopTable = editor ? VariableLoop.loopTableAt(editor.state, editor.state.selection.from) : null;
    if (loopTable) {
      const first = found.filter(v => v.table === loopTable);
      return first.concat(found.filter(v => v.table !== loopTable)).slice(0, 50);
    }
    return found.slice(0, 50);
  }

  function currentTabEl(tabName) {
    return acBox && acBox.querySelector('.ac-tab[data-tab="' + tabName + '"]');
  }
  // Le champ "Nom de fichier PDF" réutilise ce même acBox mais n'a pas l'onglet Chips (aucun nœud ProseMirror à y insérer) - masqué plutôt que retiré du DOM.
  function setTabsVisible(visible) {
    const tabs = ensureBox().querySelector('.ac-tabs');
    if (tabs) tabs.style.display = visible ? '' : 'none';
  }

  // Un survol à la souris met aussi à jour la sélection (pas seulement les flèches du clavier), pour qu'Entrée suive réellement l'item survolé.
  function render(items, onPick) {
    ensureBox();
    ['variables', 'chips'].forEach(t => { const el = currentTabEl(t); if (el) el.classList.toggle('active', t === activeTab); });
    acItemsBox.innerHTML = '';
    items.forEach((item, idx) => {
      const div = document.createElement('div');
      div.className = 'ac-item' + (idx === selectedIndex ? ' selected' : '');
      div.textContent = displayKey(item);
      div.addEventListener('mouseenter', () => { if (selectedIndex !== idx) { selectedIndex = idx; render(items, onPick); } });
      div.addEventListener('mousedown', (e) => { e.preventDefault(); onPick(item); });
      acItemsBox.appendChild(div);
    });
  }

  // Appelée popup déjà affiché : ViewportFit.placePopup mesure sa vraie hauteur pour le garder dans la fenêtre - sous le curseur, ou au-dessus quand il est
  // en bas d'un panneau bas (il s'ouvrait jusque-là entièrement sous le bord, invisible).
  function position(clientRect) {
    const rect = clientRect && clientRect();
    if (!rect) return;
    const box = ensureBox();
    if (box.style.display === 'none') return;
    ViewportFit.placePopup(box, rect, { gap: 4 });
  }

  // La fonction command() n'est fournie par @tiptap/suggestion que dans les props d'onStart/onUpdate, jamais celles d'onKeyDown - mémorisée ici pour être
  // réutilisée depuis onKeyDown et depuis un survol/clic souris (render).
  let latestCommand = null;

  function updateItems(props) {
    latestProps = props;
    currentItems = props.items || [];
    selectedIndex = 0;
    latestCommand = props.command;
    setTabsVisible(true);
    render(currentItems, item => latestCommand(item));
    ensureBox().style.display = currentItems.length ? 'flex' : 'none';
    position(props.clientRect);
  }

  function hide() { if (acBox) acBox.style.display = 'none'; }

  // Objet de rendu attendu par @tiptap/suggestion : onStart/onUpdate à chaque frappe après le déclencheur, onKeyDown pour intercepter flèches/Entrée/Échap
  // (return true = "j'ai géré, n'envoie pas ça à l'éditeur"), onExit quand le déclencheur n'est plus actif (curseur sorti, espace tapé, etc.).
  function suggestionRender() {
    return {
      onStart(props) { updateItems(props); },
      onUpdate(props) { updateItems(props); },
      onKeyDown(props) {
        if (!currentItems.length) return false;
        if (props.event.key === 'ArrowDown') { selectedIndex = (selectedIndex + 1) % currentItems.length; render(currentItems, item => latestCommand(item)); return true; }
        if (props.event.key === 'ArrowUp') { selectedIndex = (selectedIndex - 1 + currentItems.length) % currentItems.length; render(currentItems, item => latestCommand(item)); return true; }
        if (props.event.key === 'Enter' || props.event.key === 'Tab') { latestCommand(currentItems[selectedIndex]); return true; }
        if (props.event.key === 'Escape') { hide(); return true; }
        return false;
      },
      onExit() { hide(); schemaRefreshedForSession = false; activeTab = 'variables'; },
    };
  }

  // Reçoit les classes Extension/Suggestion en paramètre plutôt que de les importer elle-même : évite un second import() dynamique redondant, editor.js les a
  // déjà chargées au même moment.
  function createExtension(Extension, Suggestion) {
    return Extension.create({
      name: 'varBadgeSuggestion',
      addProseMirrorPlugins() {
        return [
          Suggestion({
            editor: this.editor,
            // Redéfinissable dans le panneau Réglages ; un changement n'a effet qu'après rechargement de la page (ce `char` est un littéral capturé une seule
            // fois ici, à la construction de l'éditeur - cf. triggerChar() ci-dessus).
            char: triggerChar(),
            // GristAPI, const racine chargée avant ce script, visible par identifiant nu - jamais window.GristAPI (ne s'y attache pas).
            items: ({ query, editor }) => computeItems(query, editor),
            // Async : une variable d'une autre table peut exiger de configurer une règle de correspondance avant insertion (ensureLinkConfigured plus bas).
            // `range` reste valide pendant l'attente (position ProseMirror pure, pas liée au focus DOM).
            command: ({ editor, range, props }) => {
              // Chip (note de bas de page / date / heure / email) : jamais de colonne/table à lier, insertion synchrone directe contrairement à la branche
              // #Variable ci-dessous. La note de bas de page ouvre en plus immédiatement son popup d'édition de texte.
              if (props.kind === 'chip') {
                if (props.chipKind === 'footnote') {
                  const id = 'fn-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
                  editor.chain().focus().insertContentAt(range, { type: 'footnoteRef', attrs: { id, text: '' } }).run();
                  // Retrouve la position réelle du nœud fraîchement inséré par son id plutôt que de faire confiance à `range.from` après coup (jamais
                  // reproduit localement, mais ce balayage retire la dépendance suspectée d'une note insérée sans que la popup ne s'ouvre).
                  let insertedPos = null;
                  editor.state.doc.descendants((node, pos) => {
                    if (insertedPos != null) return false;
                    if (node.type.name === 'footnoteRef' && node.attrs.id === id) { insertedPos = pos; return false; }
                    return true;
                  });
                  // `Editor` (chargé après ce fichier) n'est résolu qu'à l'exécution de ce callback, pas à l'analyse de ce fichier.
                  if (insertedPos != null) Editor.openFootnoteEditorAt(insertedPos);
                  else console.warn('[variables] note de bas de page insérée mais introuvable ensuite (id=' + id + ') - popup non ouverte.');
                } else {
                  editor.chain().focus().insertContentAt(range, { type: 'smartChip', attrs: { kind: props.chipKind } }).run();
                }
                return;
              }
              (async () => {
                // Dans une zone répétée pour cette table, la variable lit la ligne du tour : aucun lien à configurer (js/loop-rules.js).
                const inLoop = VariableLoop.loopTableAt(editor.state, range.from) === props.table;
                const ok = inLoop || await ensureLinkConfigured(props);
                if (!ok) return;
                editor.chain().focus().insertContentAt(range, { type: 'varBadge', attrs: { table: props.table, column: props.column, key: props.key } }).run();
              })();
            },
            render: suggestionRender,
          }),
        ];
      },
    });
  }

  // Champ "Nom de fichier PDF" : un <input> plein texte, pas de @tiptap/suggestion possible (pas un contenteditable) - réutilise le même
  // acBox/currentItems/selectedIndex que l'éditeur (jamais actifs ensemble). `filenameInputState` distingue l'origine, `latestCommand` étant partagé.
  let filenameInputState = null;
  function checkForFilenameTrigger(el) {
    const caret = el.selectionStart;
    if (caret == null) { hide(); filenameInputState = null; schemaRefreshedForSession = false; return; }
    const text = el.value.slice(0, caret);
    const match = text.match(new RegExp(triggerChar().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([A-Za-z0-9_]*)$'));
    if (!match) { hide(); filenameInputState = null; schemaRefreshedForSession = false; return; }
    // Même rafraîchissement "une fois par session" que le déclencheur de l'éditeur, déclenché dès le 1er caractère tapé après # - sans ça, chercher une
    // colonne toute juste ajoutée ne trouverait jamais rien, la branche !items.length ci-dessous fermant le popup avant d'avoir pu rafraîchir.
    if (!schemaRefreshedForSession) {
      schemaRefreshedForSession = true;
      GristAPI.refreshSchema().catch(e => console.warn('[variables] rafraîchissement du schéma #Variable échoué', e));
    }
    const query = match[1].toLowerCase();
    const all = GristAPI.getAllVariables();
    const items = all.filter(v => v.key.toLowerCase().includes(query)).slice(0, 50);
    if (!items.length) { hide(); filenameInputState = null; return; }
    filenameInputState = { el, start: caret - match[0].length, end: caret };
    currentItems = items;
    selectedIndex = 0;
    latestCommand = item => insertFilenameVariable(item);
    setTabsVisible(false);
    render(currentItems, latestCommand);
    ensureBox().style.display = 'flex';
    position(() => el.getBoundingClientRect());
  }
  // ReaderMode.resolveFilename() sait déjà remplacer un motif texte brut "#Cle" par la vraie valeur à l'export (regex sur la valeur du champ) - insérer
  // directement "#Cle" en texte, sans badge (un <input> ne peut de toute façon pas contenir de HTML), est donc suffisant.
  function insertFilenameVariable(item) {
    const state = filenameInputState;
    if (!state) return;
    const { el, start, end } = state;
    const value = el.value;
    const insertion = triggerChar() + item.key;
    el.value = value.slice(0, start) + insertion + value.slice(end);
    const newCaret = start + insertion.length;
    hide();
    filenameInputState = null;
    el.focus();
    el.setSelectionRange(newCaret, newCaret);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  // À appeler depuis main.js une fois le champ de nom de fichier PDF présent dans le DOM (indépendant de createExtension, qui ne concerne que l'éditeur).
  function initFilenameInput(el) {
    if (!el) return;
    el.addEventListener('input', () => checkForFilenameTrigger(el));
    el.addEventListener('keyup', e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') checkForFilenameTrigger(el); });
    // Un <input> ne passe jamais par @tiptap/suggestion - navigation clavier gérée ici à la main, même logique que suggestionRender() ci-dessus.
    el.addEventListener('keydown', e => {
      if (!filenameInputState || !acBox || acBox.style.display !== 'flex') return;
      if (e.key === 'ArrowDown') { e.preventDefault(); selectedIndex = (selectedIndex + 1) % currentItems.length; render(currentItems, latestCommand); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); selectedIndex = (selectedIndex - 1 + currentItems.length) % currentItems.length; render(currentItems, latestCommand); }
      else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); latestCommand(currentItems[selectedIndex]); }
      else if (e.key === 'Escape') { e.preventDefault(); hide(); filenameInputState = null; }
    });
    // Un clic sur un item de la popup (mousedown, déjà en preventDefault() dans render() ci-dessus) s'exécute avant le blur du champ - ce filet de sécurité
    // (délai court) couvre les cas où le focus partirait quand même (ex. Échap ailleurs).
    el.addEventListener('blur', () => { setTimeout(() => { if (filenameInputState && filenameInputState.el === el) { hide(); filenameInputState = null; } }, 150); });
  }

  // Sans format explicite, une colonne Date/DateTime Grist reçoit quand même un préréglage par défaut (sinon valeur brute illisible) ; un nombre sans format
  // reste en revanche `String(val)` brut.
  // Un tableau (une valeur par ligne liée d'une règle "match", ou une liste) est formaté élément par élément : un simple join laissait une date d'une autre
  // table en secondes brutes et ignorait le format nombre/date de la bulle.
  function formatValue(val, format, varTable, varColumn) {
    if (val === null || val === undefined) return '';
    if (Array.isArray(val)) return val.map(v => formatValue(v, format, varTable, varColumn)).join(', ');
    let effectiveFormat = format;
    if (!effectiveFormat && varTable && varColumn) {
      const colType = GristAPI.getColumnType(varTable, varColumn);
      if (colType === 'Date' || colType === 'DateTime') effectiveFormat = { type: 'date', preset: VariableFormat.DATE_PRESETS[0].key };
    }
    if (effectiveFormat && effectiveFormat.type === 'number') return VariableFormat.formatNumber(val, effectiveFormat);
    if (effectiveFormat && effectiveFormat.type === 'date') return VariableFormat.formatDate(val, effectiveFormat);
    return String(val);
  }
  function unwrapRefValue(v) { return Array.isArray(v) ? v[1] : v; }
  function sameValue(a, b) { return String(a).trim() === String(b).trim(); }

  // Valeur d'une cellule telle que Grist l'AFFICHE, pour une ligne lue par fetchTable (autre table, export en lot, aperçu de la fenêtre de condition) :
  // cette forme brute donne l'id de la ligne référencée pour une Référence (0 si vide) et ["L", …] pour une liste, alors que grist.onRecord livre déjà
  // la valeur affichée pour la table de la page. Une Référence ou une liste de références prend la valeur de sa colonne d'affichage, que Grist calcule
  // dans la même table (GristAPI.getDisplayColumn, colonne « gristHelper_Display… » lue par fetchTable - engine.py:fetch_table, vérifié à la source
  // grist-core le 2026-09-28). Retour d'Antoine du 2026-09-28 : un attribut lui-même Référence affichait son id.
  function cellValue(table, column, row) {
    if (!row) return null;
    let value = row[column];
    const type = GristAPI.getColumnType(table, column) || '';
    const isRef = type.indexOf('Ref:') === 0;
    if (isRef || type.indexOf('RefList:') === 0) {
      if (isRef && value === 0) return null;
      const displayCol = GristAPI.getDisplayColumn(table, column);
      if (displayCol && displayCol in row) value = row[displayCol];
    }
    return (Array.isArray(value) && value[0] === 'L') ? value.slice(1) : value;
  }

  // Valeur de la colonne source d'une règle "match" pour la ligne courante. Une colonne Référence comparée à l'identifiant de ligne de la table cible doit
  // fournir l'identifiant RÉFÉRENCÉ : fetchTable (export en lot) le donne tel quel, un entier, mais grist.onRecord (mode Lecture, export de la ligne
  // courante) livre la valeur de la colonne AFFICHÉE par la référence (ex. "Dupont Jean"), ou un objet Reference quand cette valeur est un nombre
  // (WidgetFrame.ts:fetchSelectedRecord, expandRefs vrai par défaut, et objtypes.ts:decodeObject - vérifié à la source grist-core le 2026-09-28) : la
  // règle proposée d'office pour une colonne Référence (identifiant de ligne = colonne Référence) ne trouvait donc jamais la ligne en mode Lecture. Dans
  // ce seul cas, relit la ligne brute par son id ; toute autre règle garde la valeur de `record` telle quelle (une règle qui compare justement le texte
  // affiché, ex. "NomPrenom = Responsable", continue de fonctionner comme avant).
  async function ruleSourceValue(rule, record, currentTableId, fetchRows) {
    if (rule.colonneSource === 'id') return record.id;
    // Ligne de fetchTable (export en lot) : l'id brut pour une comparaison à l'identifiant de ligne, sinon la valeur affichée - celle que compare la même
    // règle en mode Lecture, où grist.onRecord la livre déjà.
    if (GristAPI.isRawRow(record)) {
      return rule.colonneCible === 'id' ? unwrapRefValue(record[rule.colonneSource]) : cellValue(currentTableId, rule.colonneSource, record);
    }
    const value = unwrapRefValue(record[rule.colonneSource]);
    if (rule.colonneCible !== 'id' || typeof value === 'number' || record.id == null) return value;
    const type = GristAPI.getColumnType(currentTableId, rule.colonneSource);
    if (!type || type.indexOf('Ref:') !== 0) return value;
    const rows = await fetchRows(currentTableId);
    const raw = rows.find(r => r.id === record.id);
    return raw ? raw[rule.colonneSource] : value;
  }
  // Ligne(s) de `varTable` qui correspondent à la ligne courante selon la règle de liaison de cette table (vide si aucune) - partagé entre la résolution
  // d'une #Variable (resolveRawValueWithRule) et la fenêtre « Autres attributs » (js/variable-linked-attrs.js), qui lit plusieurs colonnes de la MÊME
  // ligne. `opts.fetchRows(tableId)` (facultatif) remplace GristAPI.fetchTableRows, pour ne lire chaque table qu'une fois quand une condition est évaluée
  // sur toutes les lignes d'une table (aperçu de js/variable-condition.js).
  async function resolveLinkedRows(varTable, rule, record, currentTableId, opts) {
    const fetchRows = (opts && opts.fetchRows) || GristAPI.fetchTableRows;
    if (rule.mode === 'singleton') {
      const rows = await fetchRows(varTable);
      if (!rows.length) return [];
      return [rows.reduce((min, r) => (r.id < min.id ? r : min), rows[0])];
    }
    const sourceVal = await ruleSourceValue(rule, record, currentTableId, fetchRows);
    if (sourceVal === undefined || sourceVal === null) return [];
    const rows = await fetchRows(varTable);
    return rows.filter(r => {
      const cibleVal = rule.colonneCible === 'id' ? r.id : unwrapRefValue(r[rule.colonneCible]);
      return sameValue(cibleVal, sourceVal);
    });
  }
  // Trouve la valeur brute d'une #Variable avant tout formatage, réutilisable par resolveAttachmentIds (ne doit jamais passer par formatValue/String).
  // Retourne { value } ou { error } (déjà formaté "[ERREUR: ...]"). En mode "match", `value` est un tableau (une valeur par ligne liée) et `multi` le
  // signale : js/condition-rules.js:matches teste alors chaque ligne liée, sans confondre avec une ChoiceList, elle aussi un tableau.
  async function resolveRawValueWithRule(varTable, varColumn, rule, record, currentTableId, opts) {
    const rows = await resolveLinkedRows(varTable, rule, record, currentTableId, opts);
    if (rule.mode === 'singleton') return { value: rows.length ? cellValue(varTable, varColumn, rows[0]) : null };
    if (!rows.length) return { value: null };
    return { value: rows.map(r => cellValue(varTable, varColumn, r)), multi: true };
  }
  async function resolveRawValue(varTable, varColumn, currentTableId, record, opts) {
    const resolvedTableId = currentTableId || GristAPI.getCurrentTableId();
    if (!record) return { value: null };
    // Élément copié par une zone répétée (js/loop-rules.js:itemBinding) : une variable de la table de la boucle lit la ligne du tour (brute, lue par
    // fetchTable), et la colonne Liste de références qui mène à ces lignes ne vaut que la valeur affichée de l'élément du tour.
    const loop = opts && opts.loop;
    if (loop) {
      const anchorKey = varTable + '.' + varColumn;
      if (loop.anchors && Object.prototype.hasOwnProperty.call(loop.anchors, anchorKey)) return { value: loop.anchors[anchorKey] };
      const row = loop.rows && loop.rows[varTable];
      if (row) return { value: cellValue(varTable, varColumn, row) };
    }
    if (!resolvedTableId) return { error: '[ERREUR: table courante indisponible]' };
    if (varTable === resolvedTableId) {
      // `record` vient de grist.onRecord, encodage Attachments non garanti identique à fetchRowById - resolveAttachmentIds force `forceRawFetch` pour
      // repasser par ce dernier ; resolveVariable n'active jamais l'option.
      if (opts && opts.forceRawFetch && record.id != null) {
        try {
          const row = await GristAPI.fetchRowById(varTable, record.id);
          if (row) return { value: row[varColumn] };
        } catch (e) { /* repli sur record[varColumn] ci-dessous */ }
      }
      // Ligne de fetchTable (export en lot, aperçu de la fenêtre de condition) : ramenée à la valeur affichée, comme celle de grist.onRecord.
      return { value: GristAPI.isRawRow(record) ? cellValue(varTable, varColumn, record) : record[varColumn] };
    }
    const rule = GristAPI.getLinkRule(varTable);
    if (rule) return await resolveRawValueWithRule(varTable, varColumn, rule, record, resolvedTableId, opts);
    const refCols = await GristAPI.findReferenceColumns(resolvedTableId, varTable);
    if (refCols.length === 0) return { error: `[ERREUR: aucune correspondance configurée pour ${varTable} — réinsérez la variable pour la configurer]` };
    const refId = record[refCols[0]];
    if (!refId) return { value: null };
    const rowId = unwrapRefValue(refId);
    const linkedRow = await GristAPI.fetchRowById(varTable, rowId);
    if (!linkedRow) return { error: `[ERREUR: ligne introuvable dans ${varTable}]` };
    return { value: cellValue(varTable, varColumn, linkedRow) };
  }
  // `opts.loop` (facultatif) : ligne du tour d'une zone répétée, cf. resolveRawValue.
  async function resolveVariable(varTable, varColumn, currentTableId, record, format, opts) {
    try {
      const { value, error } = await resolveRawValue(varTable, varColumn, currentTableId, record, opts);
      if (error) return error;
      return formatValue(value, format, varTable, varColumn);
    } catch (e) {
      console.error('[variables] échec résolution', e);
      return `[ERREUR: résolution de ${varTable}.${varColumn} impossible]`;
    }
  }

  // Résout les #Variable d'un texte brut (pas de badge ProseMirror - même scan longest-match-first que ReaderMode.resolveFilename, sans sa sanitisation
  // spécifique aux noms de fichier qui corromprait un objet d'email ou une adresse). Utilisé par les champs Objet/À/Cc/Cci du mode email (de simples
  // <input>, cf. planning/feature-email-mode.md) au moment de "Créer l'email" (js/main.js).
  async function resolveTextVariables(text, currentTableId, record) {
    if (!text) return '';
    const allVars = GristAPI.getAllVariables();
    const sortedKeys = allVars.map(v => v.key).sort((a, b) => b.length - a.length);
    const trigger = triggerChar();
    const matches = [];
    let i = 0;
    while (i < text.length) {
      if (text[i] === trigger) {
        const rest = text.slice(i + 1);
        const key = sortedKeys.find(k => rest.startsWith(k));
        if (key) { matches.push({ start: i, key, end: i + 1 + key.length }); i += 1 + key.length; continue; }
      }
      i += 1;
    }
    if (!matches.length) return text;
    const resolved = await Promise.all(matches.map(async m => {
      const found = allVars.find(v => v.key === m.key);
      try { return String((await resolveVariable(found.table, found.column, currentTableId, record)) || ''); }
      catch (e) { return ''; }
    }));
    let result = ''; let lastEnd = 0;
    matches.forEach((m, idx) => { result += text.slice(lastEnd, m.start) + resolved[idx]; lastEnd = m.end; });
    result += text.slice(lastEnd);
    return result;
  }

  // Une cellule Attachments encode sa liste façon Grist (['L', id1, id2]) ; aplatit récursivement pour n'en garder que les nombres, le marqueur 'L' et toute
  // imbrication disparaissent naturellement.
  function flattenToNumbers(value) {
    if (value == null) return [];
    if (Array.isArray(value)) return value.flatMap(flattenToNumbers);
    if (typeof value === 'number') return [value];
    // Filet de sécurité pour une forme différente de l'encodage liste brut (ex. objet métadonnée {id, fileName, ...}), jamais rencontrée en conditions
    // réelles pour l'instant.
    if (value && typeof value === 'object' && typeof value.id === 'number') return [value.id];
    return [];
  }
  async function resolveAttachmentIds(varTable, varColumn, currentTableId, record, opts) {
    try {
      const { value, error } = await resolveRawValue(varTable, varColumn, currentTableId, record, Object.assign({}, opts, { forceRawFetch: true }));
      if (error) return [];
      return flattenToNumbers(value);
    } catch (e) {
      console.error('[variables] échec résolution pièce jointe', e);
      return [];
    }
  }

  // --- Configuration des correspondances entre tables (à l'insertion + panneau de gestion), dans une modale séparée (#link-rules-modal, cf. index.html)
  // plutôt qu'un volet repliable dédié pour ce seul besoin.

  // Nom de la colonne et table où se trouve sa donnée réelle, pour les listes de la fenêtre de liaison (demande d'Antoine du 2026-09-29 : « entre
  // parenthèses le nom de la table où est la donnée réelle de chaque colonne »). Une Référence ou une liste de références : la table visée, avec la mention
  // qu'elle stocke un identifiant de ligne et non un texte - sans ça, rien n'indique de la comparer à l'Identifiant de ligne. La colonne d'aide
  // « gristHelper_Display… » que Grist crée derrière une Référence (elle porte le texte affiché, ex. le nom de la personne) : la table de cette Référence, où
  // se trouve ce texte. Toute autre colonne : sa propre table.
  function describeColumn(tableId, colId) {
    const type = GristAPI.getColumnType(tableId, colId) || '';
    if (type.indexOf('Ref:') === 0) return { name: colId, hint: I18n.t('linkConfig.refHint', { table: type.slice(4) }) };
    if (type.indexOf('RefList:') === 0) return { name: colId, hint: I18n.t('linkConfig.refListHint', { table: type.slice(8) }) };
    if (colId.indexOf('gristHelper_') === 0) {
      const shownBy = GristAPI.getColumns(tableId).find(c => GristAPI.getDisplayColumn(tableId, c) === colId);
      const shownType = (shownBy && GristAPI.getColumnType(tableId, shownBy)) || '';
      if (shownType.indexOf('Ref:') === 0) return { name: colId, hint: shownType.slice(4) };
      if (shownType.indexOf('RefList:') === 0) return { name: colId, hint: shownType.slice(8) };
    }
    return { name: colId, hint: tableId };
  }
  // Remplit une liste de colonnes de la fenêtre de liaison. Un placeholder désactivé en 1ère position force un choix explicite - sans lui, un <select> non
  // touché par l'utilisateur reste silencieusement sur « Identifiant de ligne » (1ère option), ce qui peut produire une règle qui a l'air valide mais compare
  // deux identifiants de ligne sans rapport. Options construites par le DOM (texte, jamais du HTML) : un colId ou un nom de table créé via l'API REST Grist en
  // contournant l'UI standard (cf. AUDIT_CODE.md §3.2) ne peut rien injecter. Le nom et l'indice sont aussi en data-name/data-hint pour SearchSelect.
  function fillColumnSelect(select, tableId) {
    select.textContent = '';
    const placeholder = new Option(I18n.t('linkConfig.columnPlaceholder'), '');
    placeholder.disabled = true;
    placeholder.selected = true;
    select.appendChild(placeholder);
    const add = (value, name, hint) => {
      const option = new Option(name + ' (' + hint + ')', value);
      option.dataset.name = name;
      option.dataset.hint = hint;
      select.appendChild(option);
    };
    add('id', I18n.t('linkConfig.rowId'), tableId);
    GristAPI.getColumns(tableId).forEach(colId => { const column = describeColumn(tableId, colId); add(colId, column.name, column.hint); });
  }
  function describeRule(rule) {
    if (rule.mode === 'singleton') return I18n.t('linkConfig.describeSingleton');
    const rowIdLabel = I18n.t('linkConfig.describeRowId');
    const cible = rule.colonneCible === 'id' ? rowIdLabel : rule.colonneCible;
    const source = rule.colonneSource === 'id' ? rowIdLabel : rule.colonneSource;
    return `${cible} = ${source}`;
  }
  // Si la variable vient d'une autre table sans règle encore configurée, ouvre la modale et enregistre la règle avant l'insertion. Retourne false si
  // l'utilisateur annule (rien n'est alors inséré).
  async function ensureLinkConfigured(item) {
    const currentTableId = GristAPI.getCurrentTableId();
    if (!currentTableId || item.table === currentTableId) return true;
    if (GristAPI.getLinkRule(item.table)) return true;
    const rule = await showLinkConfigModal(item.table, currentTableId, null);
    if (!rule) return false;
    await GristAPI.saveLinkRule(item.table, rule);
    refreshLinkRulesPanel();
    return true;
  }
  // Partagée par l'insertion (existingRule=null, auto-détectée si une seule colonne Référence candidate existe) et le panneau de gestion (règle existante à
  // modifier). Résout {mode, colonneCible, colonneSource} ou null.
  async function showLinkConfigModal(targetTable, currentTableId, existingRule) {
    const modal = document.getElementById('link-config-modal');
    if (!modal) return null;
    const title = document.getElementById('link-config-title');
    const matchFields = document.getElementById('link-config-match-fields');
    const cibleLabel = document.getElementById('link-config-table-cible-name');
    const sourceLabel = document.getElementById('link-config-table-source-name');
    const selectCible = document.getElementById('link-config-col-cible');
    const selectSource = document.getElementById('link-config-col-source');
    const preview = document.getElementById('link-config-preview');
    const toggleSingletonBtn = document.getElementById('link-config-toggle-singleton');
    const toggleMatchBtn = document.getElementById('link-config-toggle-match');
    const btnOk = document.getElementById('link-config-confirm');
    const btnCancel = document.getElementById('link-config-cancel');

    title.textContent = `${currentTableId} → ${targetTable}`;
    cibleLabel.textContent = targetTable;
    sourceLabel.textContent = currentTableId;
    fillColumnSelect(selectCible, targetTable);
    fillColumnSelect(selectSource, currentTableId);

    // Par défaut, mode "match" (le cas normal) - "singleton" doit être un choix actif, pas un état par défaut dans lequel on tombe sans le réaliser.
    let initialMode = existingRule ? existingRule.mode : 'match';
    let initialCible = existingRule ? existingRule.colonneCible : '';
    let initialSource = existingRule ? existingRule.colonneSource : '';
    if (!existingRule) {
      // Sens direct : la table courante a une colonne Référence vers la table cible (ex. "Commandes" -> "Clients" en consultant Commandes).
      const forwardCandidates = await GristAPI.findReferenceColumns(currentTableId, targetTable);
      if (forwardCandidates.length === 1) {
        initialCible = 'id'; initialSource = forwardCandidates[0];
      } else {
        // Sens inverse (cas le plus courant en pratique) : la table cible a une colonne Référence vers la table courante (ex. on consulte un "Employé" et on
        // veut ses "Congés", où c'est Congés.Employe qui référence Employés, pas l'inverse).
        const reverseCandidates = await GristAPI.findReferenceColumns(targetTable, currentTableId);
        if (reverseCandidates.length === 1) { initialCible = reverseCandidates[0]; initialSource = 'id'; }
      }
    }
    if (initialCible) selectCible.value = initialCible;
    if (initialSource) selectSource.value = initialSource;
    // Listes avec recherche (js/search-select.js) par-dessus les deux <select>, qui restent la source des valeurs et des évènements `change`. Si le composant
    // échoue, les <select> natifs restent affichés et la fenêtre marche comme avant.
    const searchLists = [];
    [[selectSource, 'link-config-table-source-name'], [selectCible, 'link-config-table-cible-name']].forEach(([select, labelId]) => {
      try {
        searchLists.push(SearchSelect.attach(select, {
          labelledBy: labelId,
          searchPlaceholder: I18n.t('linkConfig.searchColumns'),
          emptyText: I18n.t('linkConfig.noColumnMatch'),
        }));
      } catch (e) {
        console.warn('[variables] showLinkConfigModal: recherche de colonne indisponible, liste native conservée', e);
      }
    });
    // Le cas rare ("ligne fixe") est un lien texte plutôt qu'un choix à égalité avec le cas normal - `currentMode` remplace les radios, togglé par les 2
    // boutons-liens.
    let currentMode = initialMode;
    function applyModeVisibility() {
      matchFields.hidden = currentMode !== 'match';
      toggleSingletonBtn.hidden = currentMode !== 'match';
      toggleMatchBtn.hidden = currentMode === 'match';
    }
    applyModeVisibility();

    function currentRuleFromForm() {
      if (currentMode === 'singleton') return { mode: 'singleton' };
      if (!selectCible.value || !selectSource.value) return null;
      return { mode: 'match', colonneCible: selectCible.value, colonneSource: selectSource.value };
    }
    // Aperçu en direct : calcule ce que la règle en cours de saisie donnerait pour la ligne actuellement sélectionnée. .is-good (bulle verte) ne marque que
    // les issues positives, le reste reste neutre.
    async function updatePreview() {
      if (!preview) return;
      preview.classList.remove('is-good');
      const rule = currentRuleFromForm();
      if (!rule) { preview.textContent = I18n.t('linkConfig.previewChooseColumns'); return; }
      const record = GristAPI.getCurrentRecord();
      if (!record) { preview.textContent = I18n.t('linkConfig.previewNoRecord'); return; }
      preview.textContent = I18n.t('linkConfig.previewComputing');
      try {
        const rows = await GristAPI.fetchTableRows(targetTable);
        if (rule.mode === 'singleton') {
          if (!rows.length) { preview.textContent = I18n.t('linkConfig.previewTableEmpty', { table: targetTable }); return; }
          const first = rows.reduce((min, r) => (r.id < min.id ? r : min), rows[0]);
          preview.textContent = I18n.t('linkConfig.previewSingleton', { id: first.id, table: targetTable });
          preview.classList.add('is-good');
          return;
        }
        // Même lecture de la colonne source que la résolution réelle (ruleSourceValue) : sinon l'aperçu annonçait « aucune ligne » pour une colonne
        // Référence alors que la variable, elle, la trouve.
        const sourceVal = await ruleSourceValue(rule, record, currentTableId, GristAPI.fetchTableRows);
        const matches = rows.filter(r => sameValue(rule.colonneCible === 'id' ? r.id : unwrapRefValue(r[rule.colonneCible]), sourceVal));
        if (matches.length) {
          preview.textContent = I18n.t('linkConfig.previewMatches', { count: matches.length, table: targetTable, ids: matches.map(r => r.id).join(', ') });
          preview.classList.add('is-good');
        } else {
          preview.textContent = I18n.t('linkConfig.previewNoMatch', { table: targetTable, value: sourceVal });
        }
      } catch (e) {
        console.warn('[variables] showLinkConfigModal: échec aperçu', e);
        preview.textContent = I18n.t('linkConfig.previewUnavailable');
      }
    }
    function onToggleSingleton() { currentMode = 'singleton'; applyModeVisibility(); updatePreview(); }
    function onToggleMatch() { currentMode = 'match'; applyModeVisibility(); updatePreview(); }
    toggleSingletonBtn.addEventListener('click', onToggleSingleton);
    toggleMatchBtn.addEventListener('click', onToggleMatch);
    selectCible.addEventListener('change', updatePreview);
    selectSource.addEventListener('change', updatePreview);
    modal.style.display = 'flex';
    updatePreview();

    return new Promise((resolve) => {
      function cleanup() {
        modal.style.display = 'none';
        searchLists.forEach(list => list.destroy());
        toggleSingletonBtn.removeEventListener('click', onToggleSingleton);
        toggleMatchBtn.removeEventListener('click', onToggleMatch);
        selectCible.removeEventListener('change', updatePreview);
        selectSource.removeEventListener('change', updatePreview);
        btnOk.removeEventListener('click', onOk);
        btnCancel.removeEventListener('click', onCancel);
      }
      function onOk() {
        const rule = currentRuleFromForm();
        if (!rule) { preview.textContent = I18n.t('linkConfig.chooseBeforeConfirm'); return; }
        cleanup();
        resolve(rule);
      }
      function onCancel() { cleanup(); resolve(null); }
      btnOk.addEventListener('click', onOk);
      btnCancel.addEventListener('click', onCancel);
    });
  }
  // Modifie la règle d'une table déjà liée (même modale qu'à l'insertion), partagé entre le panneau « Tables liées » ci-dessous et le lien « Modifier le
  // lien » de la fenêtre de condition d'une variable (js/variable-condition.js). Vrai si une nouvelle règle a été enregistrée.
  async function editLinkRule(tableCible) {
    const currentTableId = GristAPI.getCurrentTableId();
    if (!currentTableId) return false;
    const newRule = await showLinkConfigModal(tableCible, currentTableId, GristAPI.getLinkRule(tableCible));
    if (!newRule) return false;
    await GristAPI.saveLinkRule(tableCible, newRule);
    refreshLinkRulesPanel();
    return true;
  }
  // Colonne qui porte le lien d'une règle "match", pour les libellés des fenêtres d'une variable (condition, autres attributs) : côté table de la page
  // ("Dossiers.Responsable") ou côté table liée ("Planning.Dossier"), sinon les deux colonnes comparées. Vide pour "singleton" (pas de colonne de lien).
  function describeLinkVia(tableCible, rule, currentTableId) {
    if (!rule || rule.mode !== 'match') return '';
    if (rule.colonneCible === 'id') return currentTableId + '.' + rule.colonneSource;
    if (rule.colonneSource === 'id') return tableCible + '.' + rule.colonneCible;
    return currentTableId + '.' + rule.colonneSource + ' = ' + tableCible + '.' + rule.colonneCible;
  }
  // Modèles dont le contenu contient au moins un badge #Variable pointant vers `tableCible` - recherche brute sur l'attribut sérialisé, pas besoin d'un
  // DOMParser complet. Utilisé pour avertir avant de supprimer une règle encore utilisée ailleurs.
  function findTemplatesUsingTable(tableCible) {
    const templates = (typeof Templates !== 'undefined' && Templates.getCached) ? Templates.getCached() : [];
    const needle = 'data-table="' + tableCible + '"';
    return templates.filter(tpl => tpl.contenu && tpl.contenu.indexOf(needle) !== -1);
  }
  // Panneau de gestion (modale #link-rules-modal, cf. index.html) : liste les tables déjà configurées, avec un bouton pour modifier ou supprimer chaque
  // règle. Appelée au démarrage et à chaque ouverture de la modale (cf. js/main.js).
  function refreshLinkRulesPanel() {
    const list = document.getElementById('link-rules-list');
    if (!list) return;
    const rules = GristAPI.getAllLinkRules();
    list.innerHTML = '';
    if (!rules.length) {
      const empty = document.createElement('p');
      empty.className = 'link-rules-empty';
      empty.textContent = I18n.t('linkRules.empty');
      list.appendChild(empty);
      return;
    }
    rules.forEach(rule => {
      const row = document.createElement('div');
      row.className = 'link-rule-row';
      const label = document.createElement('span');
      label.className = 'link-rule-label';
      label.textContent = `${rule.tableCible} : ${describeRule(rule)}`;
      const btnEdit = document.createElement('button');
      btnEdit.type = 'button'; btnEdit.className = 'link-rule-btn link-rule-btn-edit';
      btnEdit.setAttribute('aria-label', I18n.t('linkRules.edit')); btnEdit.title = I18n.t('linkRules.edit');
      btnEdit.addEventListener('click', () => editLinkRule(rule.tableCible));
      const btnDelete = document.createElement('button');
      btnDelete.type = 'button'; btnDelete.className = 'link-rule-btn link-rule-btn-delete';
      btnDelete.setAttribute('aria-label', I18n.t('linkRules.delete')); btnDelete.title = I18n.t('linkRules.delete');
      btnDelete.addEventListener('click', async () => {
        const affected = findTemplatesUsingTable(rule.tableCible);
        let message = I18n.t('linkRules.confirmDelete', { table: rule.tableCible });
        if (affected.length) {
          message += I18n.t('linkRules.confirmDeleteAffected', {
            names: affected.map(t => t.nom || I18n.t('linkRules.unnamed')).join(', '),
            plural: affected.length > 1 ? I18n.t('linkRules.theseTemplates') : I18n.t('linkRules.thisTemplate'),
          });
        }
        if (!confirm(message)) return;
        await GristAPI.deleteLinkRule(rule.tableCible);
        refreshLinkRulesPanel();
      });
      row.appendChild(label); row.appendChild(btnEdit); row.appendChild(btnDelete);
      list.appendChild(row);
    });
  }

  // resolveRawValue exposé pour js/condition-rules.js (évaluation de conditions sur une valeur brute, non formatée - même/cross-table via le même mécanisme
  // que #Variable). ensureLinkConfigured/editLinkRule/describeLinkVia/resolveLinkedRows/formatValue/cellValue : fenêtres de condition et d'autres attributs d'une
  // variable (js/variable-condition.js, js/variable-linked-attrs.js), même liaison entre tables que l'insertion d'une #Variable.
  return {
    createExtension, resolveVariable, resolveRawValue, resolveTextVariables, resolveAttachmentIds, refreshLinkRulesPanel, initFilenameInput, triggerChar,
    ensureLinkConfigured, editLinkRule, describeLinkVia, resolveLinkedRows, formatValue, cellValue,
  };
})();
