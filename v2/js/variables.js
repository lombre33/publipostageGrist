// Variables V2 — badges #Variable + autocomplétion, construites sur
// @tiptap/suggestion (utilitaire officiel TipTap pour exactement ce cas
// d'usage : déclencheur + liste + insertion). Remplace l'éditeur V1
// (js/variables.js) qui devait contourner à la main la détection du
// déclencheur ET la position du curseur, notamment à cause du piège des
// contenteditable imbriqués (cf. mémoire projet_nested_contenteditable_event_target_trap) -
// piège qui ne se pose PLUS ici puisqu'il n'y a plus qu'une seule instance
// d'édition, jamais de contenteditable imbriqué (cf. plan de migration V2).
//
// Popup réutilisée telle quelle de la V1 : mêmes classes CSS
// (#autocomplete-box/.ac-item/.selected, déjà stylées dans css/style.css,
// partagé sans changement) - créée dynamiquement ici plutôt que déclarée
// dans v2/index.html, pour ne rien avoir à changer côté HTML pour cet
// incrément.
const Variables = (function () {
  let acBox = null;
  let currentItems = [];
  let selectedIndex = 0;

  function ensureBox() {
    if (acBox) return acBox;
    acBox = document.createElement('div');
    acBox.id = 'autocomplete-box';
    acBox.style.display = 'none';
    document.body.appendChild(acBox);
    return acBox;
  }

  // Un survol à la souris met aussi à jour la sélection (pas seulement les
  // flèches du clavier) - cf. le bug corrigé cette même session dans
  // l'éditeur V1 (feedback : le survol donnait l'impression trompeuse d'une
  // sélection sans que Entrée ne suive réellement l'item survolé).
  function render(items, onPick) {
    const box = ensureBox();
    box.innerHTML = '';
    items.forEach((item, idx) => {
      const div = document.createElement('div');
      div.className = 'ac-item' + (idx === selectedIndex ? ' selected' : '');
      div.textContent = item.key;
      div.addEventListener('mouseenter', () => { if (selectedIndex !== idx) { selectedIndex = idx; render(items, onPick); } });
      div.addEventListener('mousedown', (e) => { e.preventDefault(); onPick(item); });
      box.appendChild(div);
    });
  }

  function position(clientRect) {
    const rect = clientRect && clientRect();
    if (!rect) return;
    const box = ensureBox();
    box.style.position = 'absolute';
    box.style.left = (rect.left + window.scrollX) + 'px';
    box.style.top = (rect.bottom + window.scrollY + 4) + 'px';
  }

  // La fonction command() n'est fournie par @tiptap/suggestion QUE dans les
  // props d'onStart/onUpdate - PAS dans celles d'onKeyDown (confirmé en
  // conditions réelles : "TypeError: props.command is not a function" en
  // l'utilisant directement depuis onKeyDown). On la mémorise donc à chaque
  // onStart/onUpdate pour pouvoir la réutiliser depuis onKeyDown (Entrée) et
  // depuis un survol/clic à la souris (render), qui n'ont pas non plus accès
  // aux props d'onKeyDown.
  let latestCommand = null;

  function updateItems(props) {
    currentItems = props.items || [];
    selectedIndex = 0;
    latestCommand = props.command;
    render(currentItems, item => latestCommand(item));
    position(props.clientRect);
    ensureBox().style.display = currentItems.length ? 'block' : 'none';
  }

  function hide() { if (acBox) acBox.style.display = 'none'; }

  // Objet de rendu attendu par @tiptap/suggestion : onStart/onUpdate à
  // chaque frappe après le déclencheur, onKeyDown pour intercepter
  // flèches/Entrée/Échap (return true = "j'ai géré, n'envoie pas ça à
  // l'éditeur"), onExit quand le déclencheur n'est plus actif (curseur
  // sorti, espace tapé, etc.).
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
      onExit() { hide(); },
    };
  }

  // Construit l'extension TipTap (Suggestion est un plugin ProseMirror, cf.
  // addProseMirrorPlugins) - reçoit les classes Extension/Suggestion en
  // paramètre plutôt que de les importer elle-même : évite un second import()
  // dynamique redondant, editor.js les a déjà chargées au même moment.
  function createExtension(Extension, Suggestion) {
    return Extension.create({
      name: 'varBadgeSuggestion',
      addProseMirrorPlugins() {
        return [
          Suggestion({
            editor: this.editor,
            char: '#',
            // GristAPI (const de niveau racine d'un script classique, chargé
            // avant celui-ci) est visible par simple identifiant nu, comme
            // Editor/Templates/ReaderMode ailleurs dans le projet - JAMAIS via
            // window.GristAPI (un `const` classique ne s'attache jamais à
            // l'objet global, cf. mémoire projet_html_source_tab sur ce même
            // piège rencontré dans dev-tests/custom-html-export.js).
            items: ({ query }) => {
              const all = GristAPI.getAllVariables();
              return all.filter(v => v.key.toLowerCase().includes(query.toLowerCase())).slice(0, 50);
            },
            // Async : une variable venant d'une AUTRE table que la table
            // courante peut nécessiter de configurer (ou de faire configurer
            // à l'utilisateur, via une modale) une règle de correspondance
            // AVANT que l'insertion ne se poursuive (cf. ensureLinkConfigured
            // plus bas, porté tel quel de la V1 - js/variables.js). `range`
            // (position ProseMirror pure, pas liée au focus DOM) reste valide
            // pendant l'attente : rien d'autre ne modifie le document entre
            // temps, exactement comme en V1 (confirmSelection y capture aussi
            // `range` avant d'attendre la modale).
            command: ({ editor, range, props }) => {
              (async () => {
                const ok = await ensureLinkConfigured(props);
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

  // Champ "Nom de fichier PDF" (#pdf-filename-template, cf. v2/index.html) :
  // un <input> HTML plein texte, jamais géré par TipTap/ProseMirror (aucun
  // @tiptap/suggestion possible dedans - ce n'est pas un contenteditable) -
  // porté quasi tel quel de la V1 (js/variables.js:checkForFilenameTrigger/
  // insertFilenameVariable/initFilenameInput), qui affrontait déjà exactement
  // ce même problème. Réutilise le MÊME acBox/currentItems/selectedIndex que
  // l'éditeur (jamais actifs en même temps - on ne tape jamais dans les deux
  // champs à la fois) plutôt que dupliquer tout l'appareil de rendu/position.
  // `filenameInputState` distingue "la popup vient de ce champ" (par
  // opposition à l'éditeur) - nécessaire ici puisque `latestCommand` est
  // partagé : sans lui, confirmer un item déclenché depuis l'éditeur
  // pourrait par erreur retomber sur la dernière commande posée par ce
  // champ (ou l'inverse) si un flux d'évènements imprévu les entrelaçait.
  let filenameInputState = null;
  function checkForFilenameTrigger(el) {
    const caret = el.selectionStart;
    if (caret == null) { hide(); filenameInputState = null; return; }
    const text = el.value.slice(0, caret);
    const match = text.match(/#([A-Za-z0-9_]*)$/);
    if (!match) { hide(); filenameInputState = null; return; }
    const query = match[1].toLowerCase();
    const all = GristAPI.getAllVariables();
    const items = all.filter(v => v.key.toLowerCase().includes(query)).slice(0, 50);
    if (!items.length) { hide(); filenameInputState = null; return; }
    filenameInputState = { el, start: caret - match[0].length, end: caret };
    currentItems = items;
    selectedIndex = 0;
    latestCommand = item => insertFilenameVariable(item);
    render(currentItems, latestCommand);
    position(() => el.getBoundingClientRect());
    ensureBox().style.display = 'block';
  }
  // ReaderMode.resolveFilename() sait déjà remplacer un motif texte brut
  // "#Cle" par la vraie valeur à l'export (regex sur la valeur du champ,
  // logique partagée avec la V1) - insérer directement "#Cle" en texte,
  // sans badge (un <input> ne peut de toute façon pas contenir de HTML), est
  // donc suffisant et cohérent avec ce mécanisme déjà en place.
  function insertFilenameVariable(item) {
    const state = filenameInputState;
    if (!state) return;
    const { el, start, end } = state;
    const value = el.value;
    const insertion = '#' + item.key;
    el.value = value.slice(0, start) + insertion + value.slice(end);
    const newCaret = start + insertion.length;
    hide();
    filenameInputState = null;
    el.focus();
    el.setSelectionRange(newCaret, newCaret);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  // À appeler depuis main.js une fois le champ de nom de fichier PDF présent
  // dans le DOM (indépendant de createExtension, qui ne concerne que
  // l'éditeur).
  function initFilenameInput(el) {
    if (!el) return;
    el.addEventListener('input', () => checkForFilenameTrigger(el));
    el.addEventListener('keyup', e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') checkForFilenameTrigger(el); });
    // Un <input> ne passe jamais par @tiptap/suggestion (aucun onKeyDown
    // fourni) - navigation clavier gérée ici à la main, même logique que
    // suggestionRender() ci-dessus.
    el.addEventListener('keydown', e => {
      if (!filenameInputState || !acBox || acBox.style.display !== 'block') return;
      if (e.key === 'ArrowDown') { e.preventDefault(); selectedIndex = (selectedIndex + 1) % currentItems.length; render(currentItems, latestCommand); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); selectedIndex = (selectedIndex - 1 + currentItems.length) % currentItems.length; render(currentItems, latestCommand); }
      else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); latestCommand(currentItems[selectedIndex]); }
      else if (e.key === 'Escape') { e.preventDefault(); hide(); filenameInputState = null; }
    });
    // Un clic sur un item de la popup (mousedown, déjà en preventDefault()
    // dans render() ci-dessus) s'exécute avant le blur du champ - ce filet de
    // sécurité (délai court) couvre les cas où le focus partirait quand même
    // (ex. Échap ailleurs), même prudence que la V1.
    el.addEventListener('blur', () => { setTimeout(() => { if (filenameInputState && filenameInputState.el === el) { hide(); filenameInputState = null; } }, 150); });
  }

  // Résolution des variables (mode Lecture, cf. ../js/reader-mode.js réutilisé
  // tel quel - il appelle Variables.resolveVariable(varTable, varColumn,
  // currentTableId, record), qui doit donc exister ici aussi). Portée telle
  // quelle depuis l'éditeur V1 (js/variables.js) - logique de résolution pure
  // (aucune dépendance à Quill/au DOM de l'éditeur), inchangée par la
  // migration. Couvre la même table (accès direct) et les tables liées
  // configurées (règle singleton/correspondance, cf. GristAPI.getLinkRule) -
  // y compris leur CONFIGURATION à l'insertion, cf. ensureLinkConfigured/
  // showLinkConfigModal plus bas (portées de la V1 juste après ce bloc).
  function formatValue(val) { if (val === null || val === undefined) return ''; if (Array.isArray(val)) return val.join(', '); return String(val); }
  function unwrapRefValue(v) { return Array.isArray(v) ? v[1] : v; }
  function sameValue(a, b) { return String(a).trim() === String(b).trim(); }
  async function resolveWithRule(varTable, varColumn, rule, record) {
    if (rule.mode === 'singleton') {
      const rows = await GristAPI.fetchTableRows(varTable);
      if (!rows.length) return '';
      const first = rows.reduce((min, r) => (r.id < min.id ? r : min), rows[0]);
      return formatValue(first[varColumn]);
    }
    const sourceVal = rule.colonneSource === 'id' ? record.id : unwrapRefValue(record[rule.colonneSource]);
    if (sourceVal === undefined || sourceVal === null) return '';
    const rows = await GristAPI.fetchTableRows(varTable);
    const matches = rows.filter(r => {
      const cibleVal = rule.colonneCible === 'id' ? r.id : unwrapRefValue(r[rule.colonneCible]);
      return sameValue(cibleVal, sourceVal);
    });
    if (!matches.length) return '';
    return formatValue(matches.map(r => r[varColumn]));
  }
  async function resolveVariable(varTable, varColumn, currentTableId, record) {
    const resolvedTableId = currentTableId || GristAPI.getCurrentTableId();
    try {
      if (!record) return '';
      if (!resolvedTableId) return '[ERREUR: table courante indisponible]';
      if (varTable === resolvedTableId) return formatValue(record[varColumn]);
      const rule = GristAPI.getLinkRule(varTable);
      if (rule) return await resolveWithRule(varTable, varColumn, rule, record);
      const refCols = await GristAPI.findReferenceColumns(resolvedTableId, varTable);
      if (refCols.length === 0) return `[ERREUR: aucune correspondance configurée pour ${varTable} — réinsérez la variable pour la configurer]`;
      const refId = record[refCols[0]];
      if (!refId) return '';
      const rowId = unwrapRefValue(refId);
      const linkedRow = await GristAPI.fetchRowById(varTable, rowId);
      if (!linkedRow) return `[ERREUR: ligne introuvable dans ${varTable}]`;
      return formatValue(linkedRow[varColumn]);
    } catch (e) {
      console.error('[variables] échec résolution', e);
      return `[ERREUR: résolution de ${varTable}.${varColumn} impossible]`;
    }
  }

  // --- Configuration des correspondances entre tables (à l'insertion +
  // panneau de gestion) - porté quasi tel quel de la V1 (js/variables.js) :
  // logique pure DOM/GristAPI, aucune dépendance à Quill ni à TipTap, donc
  // réutilisable sans changement d'engin. Seule différence : la V1 range ce
  // panneau dans un volet repliable dédié (#toolbar-panel/#btn-toggle-panel) ;
  // ici, une modale séparée (#link-rules-modal, cf. v2/index.html) plutôt que
  // d'introduire tout un système de volet repliable pour ce seul besoin.

  // Signale dans le libellé qu'une colonne est une Référence (et vers quelle
  // table) - sans ça, rien dans la modale n'indique qu'une colonne stocke en
  // réalité un identifiant de ligne plutôt qu'un texte (piège déjà rencontré
  // en V1, cf. mémoire project_cross_table_variable_links).
  function describeColumnOption(tableId, colId) {
    const type = GristAPI.getColumnType(tableId, colId);
    if (type && type.indexOf('Ref:') === 0) return `${colId} (Référence → ${type.slice(4)})`;
    if (type && type.indexOf('RefList:') === 0) return `${colId} (Références → ${type.slice(8)})`;
    return colId;
  }
  function describeRule(rule) {
    if (rule.mode === 'singleton') return 'une seule ligne (paramètres)';
    const cible = rule.colonneCible === 'id' ? 'identifiant de ligne' : rule.colonneCible;
    const source = rule.colonneSource === 'id' ? 'identifiant de ligne' : rule.colonneSource;
    return `${cible} = ${source}`;
  }
  // Appelée avant toute insertion de variable (cf. le `command` de
  // createExtension ci-dessus) : si la variable vient d'une AUTRE table que
  // la table courante et qu'aucune règle n'existe encore pour cette table,
  // ouvre la modale de configuration et enregistre la règle choisie AVANT
  // que l'insertion ne se poursuive. Retourne false si l'utilisateur annule
  // (rien n'est alors inséré).
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
  // Modale de configuration d'une règle de correspondance, partagée par
  // l'insertion (existingRule=null, pré-remplie par auto-détection si une
  // seule colonne Référence candidate existe, sens direct OU inverse) et le
  // panneau de gestion (existingRule fourni, pour modifier une règle déjà
  // enregistrée). Résout avec {mode, colonneCible, colonneSource} ou null si
  // annulé.
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
    // Un placeholder désactivé en 1ère position force un choix explicite -
    // sans lui, un <select> non touché par l'utilisateur reste silencieusement
    // sur "Identifiant de ligne" (1ère option), ce qui peut produire une règle
    // qui a l'air valide mais compare deux identifiants de ligne sans rapport.
    const placeholder = '<option value="" disabled selected>— Choisissez une colonne —</option>';
    selectCible.innerHTML = placeholder + '<option value="id">Identifiant de ligne</option>' + GristAPI.getColumns(targetTable).map(c => `<option value="${c}">${describeColumnOption(targetTable, c)}</option>`).join('');
    selectSource.innerHTML = placeholder + '<option value="id">Identifiant de ligne</option>' + GristAPI.getColumns(currentTableId).map(c => `<option value="${c}">${describeColumnOption(currentTableId, c)}</option>`).join('');

    // Par défaut, mode "match" (le cas normal) - "singleton" doit être un
    // choix actif, pas un état par défaut dans lequel on tombe sans le
    // réaliser.
    let initialMode = existingRule ? existingRule.mode : 'match';
    let initialCible = existingRule ? existingRule.colonneCible : '';
    let initialSource = existingRule ? existingRule.colonneSource : '';
    if (!existingRule) {
      // Sens direct : la table courante a une colonne Référence vers la
      // table cible (ex. "Commandes" -> "Clients" en consultant Commandes).
      const forwardCandidates = await GristAPI.findReferenceColumns(currentTableId, targetTable);
      if (forwardCandidates.length === 1) {
        initialCible = 'id'; initialSource = forwardCandidates[0];
      } else {
        // Sens inverse (cas le plus courant en pratique) : la table cible a
        // une colonne Référence vers la table courante (ex. on consulte un
        // "Employé" et on veut ses "Congés", où c'est Congés.Employe qui
        // référence Employés, pas l'inverse).
        const reverseCandidates = await GristAPI.findReferenceColumns(targetTable, currentTableId);
        if (reverseCandidates.length === 1) { initialCible = reverseCandidates[0]; initialSource = 'id'; }
      }
    }
    if (initialCible) selectCible.value = initialCible;
    if (initialSource) selectSource.value = initialSource;
    // Le cas rare ("ligne fixe") est un lien texte plutôt qu'un choix à
    // égalité avec le cas normal (cf. mémoire project_link_config_modal_redesign)
    // - `currentMode` remplace les radios, togglé par les 2 boutons-liens.
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
    // Aperçu en direct : calcule et affiche ce que la règle en cours de
    // saisie donnerait pour la ligne Grist actuellement sélectionnée -
    // permet de vérifier immédiatement que la correspondance est la bonne,
    // et que "singleton" est bien statique alors que "match" varie selon la
    // ligne courante. La classe .is-good (bulle verte) ne marque que les
    // issues positives (correspondance trouvée) - tout le reste (attente de
    // saisie, aucune ligne, erreur) reste neutre.
    async function updatePreview() {
      if (!preview) return;
      preview.classList.remove('is-good');
      const rule = currentRuleFromForm();
      if (!rule) { preview.textContent = 'Choisissez les deux colonnes pour voir un aperçu.'; return; }
      const record = GristAPI.getCurrentRecord();
      if (!record) { preview.textContent = 'Aucune ligne sélectionnée dans Grist pour prévisualiser.'; return; }
      preview.textContent = 'Calcul de l’aperçu…';
      try {
        const rows = await GristAPI.fetchTableRows(targetTable);
        if (rule.mode === 'singleton') {
          if (!rows.length) { preview.textContent = `« ${targetTable} » est vide.`; return; }
          const first = rows.reduce((min, r) => (r.id < min.id ? r : min), rows[0]);
          preview.textContent = `Toujours la ligne n°${first.id} de « ${targetTable} », quelle que soit la ligne courante.`;
          preview.classList.add('is-good');
          return;
        }
        const sourceVal = rule.colonneSource === 'id' ? record.id : unwrapRefValue(record[rule.colonneSource]);
        const matches = rows.filter(r => sameValue(rule.colonneCible === 'id' ? r.id : unwrapRefValue(r[rule.colonneCible]), sourceVal));
        if (matches.length) {
          preview.textContent = `${matches.length} ligne(s) trouvée(s) dans « ${targetTable} » (n° ${matches.map(r => r.id).join(', ')}).`;
          preview.classList.add('is-good');
        } else {
          preview.textContent = `Aucune ligne de « ${targetTable} » ne correspond à la ligne courante (valeur recherchée : ${sourceVal}).`;
        }
      } catch (e) {
        console.warn('[variables] showLinkConfigModal: échec aperçu', e);
        preview.textContent = 'Aperçu indisponible.';
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
        toggleSingletonBtn.removeEventListener('click', onToggleSingleton);
        toggleMatchBtn.removeEventListener('click', onToggleMatch);
        selectCible.removeEventListener('change', updatePreview);
        selectSource.removeEventListener('change', updatePreview);
        btnOk.removeEventListener('click', onOk);
        btnCancel.removeEventListener('click', onCancel);
      }
      function onOk() {
        const rule = currentRuleFromForm();
        if (!rule) { preview.textContent = 'Choisissez les deux colonnes avant de valider.'; return; }
        cleanup();
        resolve(rule);
      }
      function onCancel() { cleanup(); resolve(null); }
      btnOk.addEventListener('click', onOk);
      btnCancel.addEventListener('click', onCancel);
    });
  }
  // Panneau de gestion (modale #link-rules-modal, cf. v2/index.html) : liste
  // les tables déjà configurées, avec un bouton pour modifier ou supprimer
  // chaque règle. Appelée au démarrage et à chaque ouverture de la modale
  // (cf. v2/js/main.js).
  function refreshLinkRulesPanel() {
    const list = document.getElementById('link-rules-list');
    if (!list) return;
    const rules = GristAPI.getAllLinkRules();
    list.innerHTML = '';
    if (!rules.length) {
      const empty = document.createElement('p');
      empty.className = 'link-rules-empty';
      empty.textContent = 'Aucune table liée pour l’instant.';
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
      btnEdit.type = 'button'; btnEdit.textContent = 'Modifier';
      btnEdit.addEventListener('click', async () => {
        const currentTableId = GristAPI.getCurrentTableId();
        if (!currentTableId) return;
        const newRule = await showLinkConfigModal(rule.tableCible, currentTableId, rule);
        if (!newRule) return;
        await GristAPI.saveLinkRule(rule.tableCible, newRule);
        refreshLinkRulesPanel();
      });
      const btnDelete = document.createElement('button');
      btnDelete.type = 'button'; btnDelete.textContent = 'Supprimer';
      btnDelete.addEventListener('click', async () => {
        if (!confirm(`Supprimer la correspondance configurée pour « ${rule.tableCible} » ?`)) return;
        await GristAPI.deleteLinkRule(rule.tableCible);
        refreshLinkRulesPanel();
      });
      row.appendChild(label); row.appendChild(btnEdit); row.appendChild(btnDelete);
      list.appendChild(row);
    });
  }

  return { createExtension, resolveVariable, refreshLinkRulesPanel, initFilenameInput };
})();
