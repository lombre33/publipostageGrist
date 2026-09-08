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
            command: ({ editor, range, props }) => {
              editor.chain().focus().insertContentAt(range, { type: 'varBadge', attrs: { table: props.table, column: props.column, key: props.key } }).run();
            },
            render: suggestionRender,
          }),
        ];
      },
    });
  }

  // Résolution des variables (mode Lecture, cf. ../js/reader-mode.js réutilisé
  // tel quel - il appelle Variables.resolveVariable(varTable, varColumn,
  // currentTableId, record), qui doit donc exister ici aussi). Portée telle
  // quelle depuis l'éditeur V1 (js/variables.js) - logique de résolution pure
  // (aucune dépendance à Quill/au DOM de l'éditeur), inchangée par la
  // migration. Couvre la même table (accès direct) et les tables liées déjà
  // configurées (règle singleton/correspondance, cf. GristAPI.getLinkRule) ;
  // NE couvre PAS encore la configuration d'une règle à l'insertion (modale
  // dédiée de la V1) - un incrément agile ultérieur, une variable inter-tables
  // pas encore configurée affiche pour l'instant le même message d'erreur que
  // la V1 dans ce cas (pas de plantage, juste pas encore d'UI pour la configurer).
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

  return { createExtension, resolveVariable };
})();
