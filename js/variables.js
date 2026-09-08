// Module de gestion des variables : autocomplétion, badges, résolution des valeurs
const Variables = (function () {
  let activeQuill = null;
  let acBox = null;
  let acItems = [];
  let acSelectedIndex = 0;
  let acRange = null;
  let activeTableCell = null;
  // event.target NE SUFFIT PAS ici : une colonne 2-colonnes / cellule de
  // tableau est un contenteditable IMBRIQUÉ dans .ql-editor (lui-même
  // contenteditable) - par spec, un contenteditable dont le PARENT est déjà
  // éditable ne forme pas son propre "editing host" : l'évènement 'input'
  // (et 'keydown') cible alors l'éditing host englobant, c'est-à-dire
  // .ql-editor lui-même, jamais la colonne/cellule réelle où l'utilisateur
  // tape - vérifié en direct (event.target.tagName/className = DIV.ql-editor
  // pour une frappe dans une colonne). .closest() sur ce mauvais target ne
  // trouve donc jamais la colonne, et le "#" retombe sur le chemin Quill
  // (checkForTrigger), dont les coordonnées n'ont aucun sens pour du texte
  // hors du modèle Delta de Quill - d'où la popup mal positionnée. La
  // Selection/Range du navigateur, elle, n'est PAS affectée par cette regle
  // d'"editing host" : on part donc de window.getSelection() plutôt que de
  // event.target, comme le fait déjà nativeCaretOffset() plus bas. Fonction
  // partagée au niveau module (pas juste dans init()) : checkForTrigger()
  // (chemin Quill) en a aussi besoin, cf. plus bas.
  function cellFromEvent() {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return null;
    const node = selection.anchorNode;
    if (!node) return null;
    const el = node.nodeType === 1 ? node : node.parentElement;
    return el && el.closest ? el.closest('.editable-table td, .editable-table th, .two-columns-column') : null;
  }
  function init(quillInstance) {
    activeQuill = quillInstance; acBox = document.getElementById('autocomplete-box');
    activeQuill.on('text-change', function (delta, oldDelta, source) { if (source !== 'user') return; checkForTrigger(); });
    function handleCellInput(event) { const cell = cellFromEvent(event); if (!cell) return; activeTableCell = cell; checkForCellTrigger(cell); }
    document.addEventListener('input', handleCellInput, true);
    document.addEventListener('keyup', handleCellInput, true);
    activeQuill.root.addEventListener('input', handleCellInput);
    activeQuill.root.addEventListener('keyup', handleCellInput);
    activeQuill.root.addEventListener('focusin', function (event) { const cell = event.target && event.target.closest && event.target.closest('.editable-table td, .editable-table th'); activeTableCell = cell || null; if (cell) checkForCellTrigger(cell); });
    // Phase CAPTURE (dernier argument `true`) : Quill lie son propre
    // gestionnaire 'Enter' (saut de ligne/scission de bloc) directement sur
    // quill.root, en phase bulle - un keydown sur 'document' en phase bulle
    // (comme c'était le cas avant ce correctif) atteint donc quill.root
    // AVANT d'atteindre document, laissant Quill agir le premier : son
    // insertion de texte déclenche un 'text-change' synchrone -> checkForTrigger()
    // -> showAutocomplete() -> qui remet acSelectedIndex à 0 - AVANT même que
    // ce gestionnaire-ci n'ait lu confirmSelection(). Résultat observé : la
    // navigation au clavier (flèches) sélectionnait bien visuellement le bon
    // item, mais Entrée insérait toujours le PREMIER (le clic souris, qui ne
    // passe jamais par ce chemin keydown, n'était lui pas affecté). La phase
    // capture s'exécute avant tout gestionnaire bulle, où qu'il soit dans
    // l'arbre (cf. installToolbarClickSuppression/installTwoColumnsToolbarIsolation,
    // même pattern) ; stopPropagation() empêche en plus l'évènement d'atteindre
    // ensuite le gestionnaire de Quill.
    document.addEventListener('keydown', function (e) { const cell = cellFromEvent(e); if (cell) activeTableCell = cell; if (acBox.style.display === 'block') { if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); moveSelection(1); } else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); moveSelection(-1); } else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); confirmSelection(); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hideAutocomplete(); } } }, true);
    document.addEventListener('click', function (e) { if (acBox && !acBox.contains(e.target)) hideAutocomplete(); });
  }
  function checkForTrigger() {
    // Une colonne 2-colonnes / cellule de tableau est gérée EXCLUSIVEMENT par
    // checkForCellTrigger (cf. cellFromEvent ci-dessus) : ce texte n'existe
    // pas dans le modèle Delta de Quill, donc activeQuill.getSelection()/
    // getText() n'y ont aucun sens (range renvoyé n'importe quoi, souvent
    // {index:0}). Sans ce garde-fou, ce chemin Quill s'exécute quand même
    // (Quill voit une mutation DOM même à l'intérieur de l'embed) et écrase
    // - généralement en la cachant - la popup correctement positionnée par
    // checkForCellTrigger juste avant, dans le même cycle d'évènement.
    if (cellFromEvent()) return;
    const range = activeQuill.getSelection();
    if (!range) { hideAutocomplete(); return; }
    const textBefore = activeQuill.getText(0, range.index);
    const match = textBefore.match(/#([A-Za-z0-9_]*)$/);
    if (match) { const query = match[1].toLowerCase(); const startIndex = range.index - match[0].length; acRange = { index: startIndex, length: match[0].length }; showAutocomplete(query, range); } else hideAutocomplete();
  }
  function showAutocomplete(query, range) { const allVars = GristAPI.getAllVariables(); acItems = allVars.filter(v => v.key.toLowerCase().includes(query)); if (acItems.length === 0) { hideAutocomplete(); return; } acSelectedIndex = 0; renderAutocomplete(); positionAutocomplete(range); acBox.style.display = 'block'; }
  // IMPORTANT : #autocomplete-box .ac-item:hover (cf. css/style.css) applique le
  // MÊME surlignage visuel que .ac-item.selected - un survol à la souris SANS
  // clic donnait donc l'impression trompeuse que "cet item est sélectionné",
  // alors que acSelectedIndex (la seule chose que lit confirmSelection(), donc
  // Entrée) restait sur sa dernière valeur réelle (0, ou le dernier item
  // atteint au clavier/clic) - d'où le bug signalé : survoler un autre item à
  // la souris puis appuyer sur Entrée insérait quand même le premier. Le
  // listener 'mouseenter' ci-dessous fait converger l'état réel (acSelectedIndex)
  // vers ce que l'utilisateur voit déjà en survolant, exactement comme le
  // ferait n'importe quelle liste déroulante standard (survoler = pré-sélectionner).
  function renderAutocomplete() { acBox.innerHTML = ''; acItems.forEach((item, idx) => { const div = document.createElement('div'); div.className = 'ac-item' + (idx === acSelectedIndex ? ' selected' : ''); div.textContent = item.key; div.addEventListener('mouseenter', function () { if (acSelectedIndex !== idx) { acSelectedIndex = idx; renderAutocomplete(); } }); div.addEventListener('mousedown', function (e) { e.preventDefault(); acSelectedIndex = idx; confirmSelection(); }); acBox.appendChild(div); }); }
  function moveSelection(delta) { acSelectedIndex = (acSelectedIndex + delta + acItems.length) % acItems.length; renderAutocomplete(); }
  function positionAutocomplete(range) { const bounds = activeQuill.getBounds(range.index); const containerRect = activeQuill.root.getBoundingClientRect(); acBox.style.left = (containerRect.left + bounds.left + window.scrollX) + 'px'; acBox.style.top = (containerRect.top + bounds.top + bounds.height + window.scrollY + 4) + 'px'; }
  function hideAutocomplete() { if (acBox) acBox.style.display = 'none'; acRange = null; }
  // Insertion asynchrone : avant d'insérer une variable d'une AUTRE table que la
  // table courante, on doit s'assurer qu'une règle de correspondance existe (cf.
  // ensureLinkConfigured plus bas) - ce qui peut ouvrir une modale et donc
  // suspendre l'insertion. On capture item/range AVANT de cacher la popup
  // (hideAutocomplete() vide acRange), pour pouvoir insérer après coup.
  async function confirmSelection() {
    if (acItems.length === 0) return;
    const item = acItems[acSelectedIndex];
    const range = acRange;
    if (!range) return;
    hideAutocomplete();
    const ok = await ensureLinkConfigured(item);
    if (!ok) return;
    if (range.tableCell) { insertTableCellBadge(item, range); return; }
    if (range.filenameInput) { insertFilenameVariable(item, range); return; }
    insertBadge(item, range);
  }
  function insertBadge(item, range) {
    activeQuill.deleteText(range.index, range.length);
    activeQuill.insertEmbed(range.index, 'varbadge', { table: item.table, column: item.column, key: item.key });
    activeQuill.setSelection(range.index + 1, 0);
  }
  function nativeCaretOffset(cell) {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || !cell.contains(selection.anchorNode)) return null;
    const before = document.createRange();
    before.selectNodeContents(cell);
    before.setEnd(selection.anchorNode, selection.anchorOffset);
    return before.toString().length;
  }
  function nativeRangeAtOffset(cell, start, end) {
    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
    let node; let position = 0; let startPoint = null; let endPoint = null;
    while ((node = walker.nextNode())) {
      const next = position + node.nodeValue.length;
      if (!startPoint && start <= next) startPoint = [node, Math.max(0, start - position)];
      if (!endPoint && end <= next) { endPoint = [node, Math.max(0, end - position)]; break; }
      position = next;
    }
    if (!startPoint) { startPoint = [cell, cell.childNodes.length]; }
    if (!endPoint) endPoint = [cell, cell.childNodes.length];
    const range = document.createRange();
    range.setStart(startPoint[0], startPoint[1]);
    range.setEnd(endPoint[0], endPoint[1]);
    return range;
  }
  function insertTableCellBadge(item, state) {
    const cell = state.tableCell;
    const range = nativeRangeAtOffset(cell, state.start, state.end);
    range.deleteContents();
    const badge = document.createElement('span');
    badge.setAttribute('data-table', item.table);
    badge.setAttribute('data-column', item.column);
    badge.setAttribute('data-key', item.key);
    badge.setAttribute('contenteditable', 'false');
    badge.className = 'var-badge';
    badge.textContent = '#' + item.key;
    range.insertNode(badge);
    const caret = document.createRange();
    caret.setStartAfter(badge); caret.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges(); selection.addRange(caret);
    activeTableCell = cell;
    activeQuill.update(Quill.sources.USER);
  }
  function checkForCellTrigger(cell) {
    const caret = nativeCaretOffset(cell);
    if (caret === null) { hideAutocomplete(); return; }
    const text = (cell.textContent || '').slice(0, caret);
    const match = text.match(/#([A-Za-z0-9_]*)$/);
    if (!match) { hideAutocomplete(); return; }
    const query = match[1].toLowerCase();
    const allVars = GristAPI.getAllVariables();
    acItems = allVars.filter(v => v.key.toLowerCase().includes(query));
    if (acItems.length === 0) { hideAutocomplete(); return; }
    acSelectedIndex = 0;
    acRange = { tableCell: cell, start: caret - match[0].length, end: caret };
    renderAutocomplete(); positionAutocompleteForCell(cell); acBox.style.display = 'block';
  }
  // Positionne SOUS LE CURSEUR réel, pas sous tout le bloc colonne/cellule :
  // une colonne peut contenir plusieurs paragraphes bien plus hauts que le
  // popup lui-même - se caler sur cell.getBoundingClientRect() (bord du
  // bloc entier) plaçait la popup après le DERNIER paragraphe, potentiel-
  // lement très loin sous le "#" réellement tapé au milieu du bloc. Le rect
  // d'un Range collapsed (le curseur) donne directement la ligne exacte.
  function positionAutocompleteForCell(cell) {
    const selection = window.getSelection();
    let rect = null;
    if (selection && selection.rangeCount) {
      const liveRange = selection.getRangeAt(0);
      const rects = liveRange.getClientRects();
      rect = (rects && rects.length ? rects[0] : null) || liveRange.getBoundingClientRect();
    }
    // Rect vide (tout à 0) : arrive si le curseur est au tout début d'une
    // ligne/d'un bloc vide - repli sur le bord du bloc, mieux qu'un popup à
    // (0,0) en haut de la page.
    if (!rect || (rect.width === 0 && rect.height === 0 && rect.top === 0 && rect.left === 0)) {
      rect = cell.getBoundingClientRect();
      acBox.style.left = (rect.left + window.scrollX) + 'px';
      acBox.style.top = (rect.bottom + window.scrollY + 4) + 'px';
      return;
    }
    acBox.style.left = (rect.left + window.scrollX) + 'px';
    acBox.style.top = (rect.bottom + window.scrollY + 4) + 'px';
  }
  // Champ "Nom de fichier PDF" (#pdf-filename-template) : un <input> plein
  // texte, pas un contenteditable - pas de "badge" HTML possible dedans
  // (un <input> ne peut contenir que du texte). ReaderMode.resolveFilename()
  // sait déjà remplacer un motif texte brut "#Cle" par la vraie valeur à
  // l'export (regex sur la valeur du champ) : insérer directement "#Cle" en
  // texte, sans badge, est donc suffisant et cohérent avec ce mécanisme déjà
  // en place - pas besoin d'inventer un nouveau format.
  function insertFilenameVariable(item, state) {
    const el = state.filenameInput;
    const value = el.value;
    const insertion = '#' + item.key;
    el.value = value.slice(0, state.start) + insertion + value.slice(state.end);
    const newCaret = state.start + insertion.length;
    el.focus();
    el.setSelectionRange(newCaret, newCaret);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function checkForFilenameTrigger(el) {
    const caret = el.selectionStart;
    if (caret == null) { hideAutocomplete(); return; }
    const text = el.value.slice(0, caret);
    const match = text.match(/#([A-Za-z0-9_]*)$/);
    if (!match) { hideAutocomplete(); return; }
    const query = match[1].toLowerCase();
    const allVars = GristAPI.getAllVariables();
    acItems = allVars.filter(v => v.key.toLowerCase().includes(query));
    if (acItems.length === 0) { hideAutocomplete(); return; }
    acSelectedIndex = 0;
    acRange = { filenameInput: el, start: caret - match[0].length, end: caret };
    renderAutocomplete(); positionAutocompleteForInput(el); acBox.style.display = 'block';
  }
  // Un <input> est mono-ligne : pas d'ambiguïté "quelle ligne" comme pour une
  // colonne/cellule multi-lignes - se caler sous le champ entier revient déjà
  // à se caler sous le curseur.
  function positionAutocompleteForInput(el) {
    const rect = el.getBoundingClientRect();
    acBox.style.left = (rect.left + window.scrollX) + 'px';
    acBox.style.top = (rect.bottom + window.scrollY + 4) + 'px';
  }
  // À appeler depuis main.js une fois le champ de nom de fichier PDF présent
  // dans le DOM (indépendant de init(quill), qui ne concerne que l'éditeur).
  function initFilenameInput(el) {
    if (!el) return;
    el.addEventListener('input', function () { checkForFilenameTrigger(el); });
    el.addEventListener('keyup', function (e) { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') checkForFilenameTrigger(el); });
    // Un clic sur un item de la popup (mousedown) doit s'exécuter AVANT le
    // blur du champ - laisser un court délai pour ne pas fermer la popup
    // (hideAutocomplete côté document 'click', cf. init()) avant que le
    // mousedown de renderAutocomplete() n'ait eu la main.
    el.addEventListener('blur', function () { setTimeout(function () { if (acRange && acRange.filenameInput === el) hideAutocomplete(); }, 150); });
  }
  // Référencer une colonne d'une AUTRE table que la table courante repose sur
  // une règle de correspondance configurée UNE FOIS (cf. ensureLinkConfigured/
  // showLinkConfigModal, appelées à l'INSERTION de la variable, pas ici) plutôt
  // que sur une résolution ambiguë à chaque rendu - resolveVariable, appelée à
  // chaque rendu du mode lecture ET à l'export (seul point d'entrée partagé),
  // ne doit donc jamais bloquer sur une popup : elle applique la règle si elle
  // existe, sinon retombe sur l'ancien mécanisme (1ère colonne Référence
  // trouvée, sans demander confirmation) pour les variables insérées avant
  // cette fonctionnalité.
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
  function unwrapRefValue(v) { return Array.isArray(v) ? v[1] : v; }
  // Signale dans le libellé qu'une colonne est une Référence (et vers quelle
  // table) - sans ça, rien dans la modale n'indiquait qu'une colonne stocke
  // en réalité un identifiant de ligne plutôt qu'un texte, menant à des
  // comparaisons qui semblent raisonnables (comparer à un nom affiché) mais
  // qui ne peuvent jamais correspondre (cf. retour utilisateur).
  function describeColumnOption(tableId, colId) {
    const type = GristAPI.getColumnType(tableId, colId);
    if (type && type.indexOf('Ref:') === 0) return `${colId} (Référence → ${type.slice(4)})`;
    if (type && type.indexOf('RefList:') === 0) return `${colId} (Références → ${type.slice(8)})`;
    return colId;
  }
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
  function formatValue(val) { if (val === null || val === undefined) return ''; if (Array.isArray(val)) return val.join(', '); return String(val); }

  // --- Configuration des correspondances entre tables (à l'insertion + panneau
  // de gestion) --------------------------------------------------------------

  // Appelée avant toute insertion de variable (badge éditeur, badge cellule,
  // texte du nom de fichier) : si la variable vient d'une AUTRE table que la
  // table courante et qu'aucune règle n'existe encore pour cette table, ouvre
  // la modale de configuration et enregistre la règle choisie AVANT que
  // l'insertion ne se poursuive. Retourne false si l'utilisateur annule (rien
  // n'est alors inséré).
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
  // seule colonne Référence candidate existe) et le panneau de gestion
  // (existingRule fourni, pour modifier une règle déjà enregistrée). Résout
  // avec {mode, colonneCible, colonneSource} ou null si annulé.
  async function showLinkConfigModal(targetTable, currentTableId, existingRule) {
    const modal = document.getElementById('link-config-modal');
    if (!modal) return null;
    const title = document.getElementById('link-config-title');
    const radios = modal.querySelectorAll('input[name="link-config-mode"]');
    const matchFields = document.getElementById('link-config-match-fields');
    const cibleLabel = document.getElementById('link-config-table-cible-name');
    const sourceLabel = document.getElementById('link-config-table-source-name');
    const selectCible = document.getElementById('link-config-col-cible');
    const selectSource = document.getElementById('link-config-col-source');
    const preview = document.getElementById('link-config-preview');
    const btnOk = document.getElementById('link-config-confirm');
    const btnCancel = document.getElementById('link-config-cancel');

    title.textContent = `Comment trouver la bonne ligne dans « ${targetTable} » ?`;
    cibleLabel.textContent = targetTable;
    sourceLabel.textContent = currentTableId;
    // Un placeholder désactivé en 1ère position force un choix explicite -
    // sans lui, un <select> non touché par l'utilisateur reste silencieusement
    // sur "Identifiant de ligne" (1ère option), ce qui peut produire une règle
    // qui a l'air valide mais compare deux identifiants de ligne sans rapport
    // (un id de table A et un id de table B ne coïncident que par hasard).
    const placeholder = '<option value="" disabled selected>— Choisissez une colonne —</option>';
    selectCible.innerHTML = placeholder + '<option value="id">Identifiant de ligne</option>' + GristAPI.getColumns(targetTable).map(c => `<option value="${c}">${describeColumnOption(targetTable, c)}</option>`).join('');
    selectSource.innerHTML = placeholder + '<option value="id">Identifiant de ligne</option>' + GristAPI.getColumns(currentTableId).map(c => `<option value="${c}">${describeColumnOption(currentTableId, c)}</option>`).join('');

    // Par défaut, mode "match" (le cas normal) - "singleton" doit être un
    // choix actif, pas un état par défaut dans lequel on tombe sans le
    // réaliser (cf. retour utilisateur : confusion entre les deux options).
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
        // référence Employés, pas l'inverse) - sans cette détection, ce cas
        // n'était jamais pré-rempli et l'utilisateur devait deviner qu'il
        // fallait comparer cette colonne Référence à "Identifiant de ligne"
        // plutôt qu'à une colonne texte (nom affiché, etc.).
        const reverseCandidates = await GristAPI.findReferenceColumns(targetTable, currentTableId);
        if (reverseCandidates.length === 1) { initialCible = reverseCandidates[0]; initialSource = 'id'; }
      }
    }
    radios.forEach(r => { r.checked = r.value === initialMode; });
    if (initialCible) selectCible.value = initialCible;
    if (initialSource) selectSource.value = initialSource;
    matchFields.hidden = initialMode !== 'match';

    function currentRuleFromForm() {
      const checked = modal.querySelector('input[name="link-config-mode"]:checked');
      if (!checked) return null;
      if (checked.value === 'singleton') return { mode: 'singleton' };
      if (!selectCible.value || !selectSource.value) return null;
      return { mode: 'match', colonneCible: selectCible.value, colonneSource: selectSource.value };
    }
    // Aperçu en direct : calcule et affiche ce que la règle en cours de
    // saisie donnerait pour la ligne Grist actuellement sélectionnée - permet
    // de vérifier immédiatement (avant de valider) que la correspondance est
    // la bonne, et que "singleton" est bien statique alors que "match" varie
    // selon la ligne courante (cf. retour utilisateur : "pas dynamique").
    async function updatePreview() {
      if (!preview) return;
      const rule = currentRuleFromForm();
      if (!rule) { preview.textContent = 'Choisissez les deux colonnes pour voir un aperçu.'; return; }
      const record = GristAPI.getCurrentRecord();
      if (!record) { preview.textContent = 'Aucune ligne sélectionnée dans Grist pour prévisualiser.'; return; }
      preview.textContent = 'Calcul de l’aperçu…';
      try {
        const rows = await GristAPI.fetchTableRows(targetTable);
        if (rule.mode === 'singleton') {
          if (!rows.length) { preview.textContent = `Aperçu : « ${targetTable} » est vide.`; return; }
          const first = rows.reduce((min, r) => (r.id < min.id ? r : min), rows[0]);
          preview.textContent = `Aperçu : toujours la ligne n°${first.id} de « ${targetTable} », quelle que soit la ligne courante.`;
          return;
        }
        const sourceVal = rule.colonneSource === 'id' ? record.id : unwrapRefValue(record[rule.colonneSource]);
        const matches = rows.filter(r => sameValue(rule.colonneCible === 'id' ? r.id : unwrapRefValue(r[rule.colonneCible]), sourceVal));
        preview.textContent = matches.length
          ? `Aperçu : ${matches.length} ligne(s) trouvée(s) dans « ${targetTable} » pour la ligne courante (n° ${matches.map(r => r.id).join(', ')}).`
          : `Aperçu : aucune ligne de « ${targetTable} » ne correspond à la ligne courante (valeur recherchée : ${sourceVal}).`;
      } catch (e) {
        console.warn('[variables] showLinkConfigModal: échec aperçu', e);
        preview.textContent = 'Aperçu indisponible.';
      }
    }
    function onFormChange() {
      const checked = modal.querySelector('input[name="link-config-mode"]:checked');
      matchFields.hidden = !checked || checked.value !== 'match';
      updatePreview();
    }
    radios.forEach(r => r.addEventListener('change', onFormChange));
    selectCible.addEventListener('change', updatePreview);
    selectSource.addEventListener('change', updatePreview);
    modal.style.display = 'flex';
    updatePreview();

    return new Promise((resolve) => {
      function cleanup() {
        modal.style.display = 'none';
        radios.forEach(r => r.removeEventListener('change', onFormChange));
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

  function describeRule(rule) {
    if (rule.mode === 'singleton') return 'une seule ligne (paramètres)';
    const cible = rule.colonneCible === 'id' ? 'identifiant de ligne' : rule.colonneCible;
    const source = rule.colonneSource === 'id' ? 'identifiant de ligne' : rule.colonneSource;
    return `${cible} = ${source}`;
  }
  // Panneau de gestion (volet #toolbar-panel) : liste les tables déjà
  // configurées, avec un bouton pour modifier ou supprimer chaque règle.
  // Appelée au démarrage (main.js) et après chaque modification.
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
  return { init, resolveVariable, hideAutocomplete, initFilenameInput, refreshLinkRulesPanel };
})();
