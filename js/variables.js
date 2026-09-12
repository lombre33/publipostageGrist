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
// dans index.html, pour ne rien avoir à changer côté HTML pour cet
// incrément.
const Variables = (function () {
  // Touche de déclenchement configurable (panneau Réglages > Touche de
  // déclenchement, js/settings.js) - lue directement depuis localStorage
  // (pas de dépendance de module pour une simple lecture, même choix que
  // js/editor.js pour le préfixe affiché d'une bulle #Variable). Un seul
  // caractère imprimable attendu (contrôlé par le <select> du panneau, pas
  // un champ libre) - tout le reste (longueur ≠ 1, valeur absente) retombe
  // sur '#' par défaut.
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
  // Une colonne Grist ajoutée après le chargement du widget n'apparaissait
  // jamais dans #Variable : GristAPI.refreshSchema() n'est appelé qu'une
  // fois, à GristAPI.init(). Ce flag déclenche UN SEUL rafraîchissement par
  // session de saisie (posé à `true` au 1er appel après l'ouverture du
  // déclencheur #, remis à `false` à la fermeture) plutôt qu'à chaque
  // frappe - un doc à plusieurs tables ne doit pas repayer un aller-retour
  // Grist par caractère tapé. Partagé entre le déclencheur de l'éditeur
  // (createExtension) et celui du champ Nom de fichier PDF
  // (checkForFilenameTrigger) : jamais actifs en même temps (mémoire
  // filenameInputState ci-dessous).
  let schemaRefreshedForSession = false;

  // Onglet actif du panneau `#` (éditeur uniquement - le champ "Nom de
  // fichier PDF" n'a pas cet onglet, cf. checkForFilenameTrigger plus bas qui
  // continue de lire directement GristAPI.getAllVariables()). Toujours
  // 'variables' par défaut à l'ouverture (remis à cette valeur dans onExit),
  // conformément à la demande explicite de l'utilisateur.
  let activeTab = 'variables';
  // 4 chips fixes, jamais issues de GristAPI - `kind:'chip'` distingue ces
  // entrées d'une #Variable dans le `command` de createExtension ci-dessous
  // (ni ensureLinkConfigured, ni table/column, ne s'appliquent à ces items).
  // `key` reste le texte français (jamais affiché directement pour un chip -
  // uniquement un identifiant de repli si `i18n.js` n'était pas chargé) ;
  // `i18nKey`, résolu à l'AFFICHAGE (cf. displayKey ci-dessous, jamais figé
  // une fois pour toutes ici) pour rester réactif à un changement de langue
  // en cours de session (panneau Réglages), sans recharger la page.
  const SMART_CHIP_ITEMS = [
    { key: 'Note de bas de page', i18nKey: 'chips.footnote', kind: 'chip', chipKind: 'footnote' },
    { key: 'Date du jour', i18nKey: 'chips.date', kind: 'chip', chipKind: 'date' },
    { key: 'Heure actuelle', i18nKey: 'chips.time', kind: 'chip', chipKind: 'time' },
    { key: 'Email de l’utilisateur', i18nKey: 'chips.email', kind: 'chip', chipKind: 'email' },
  ];
  function displayKey(item) { return item.i18nKey ? I18n.t(item.i18nKey) : item.key; }
  // Dernières props reçues de @tiptap/suggestion (onStart/onUpdate) - permet
  // de rejouer updateItems() depuis un clic sur un onglet, qui n'est PAS un
  // évènement du plugin Suggestion et ne fournit donc pas ces props lui-même
  // (même contrainte que latestCommand ci-dessous, qui existe déjà pour la
  // même raison côté clavier/souris).
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
      // mousedown+preventDefault (pas click) : même précaution que .ac-item
      // ci-dessous, évite qu'un blur du focus éditeur en cours ne perturbe
      // quoi que ce soit avant que le changement d'onglet ne s'applique.
      tab.addEventListener('mousedown', e => {
        e.preventDefault();
        if (activeTab === tab.dataset.tab) return;
        activeTab = tab.dataset.tab;
        if (latestProps) updateItems(Object.assign({}, latestProps, { items: computeItems(latestProps.query) }));
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

  // Source des items selon l'onglet actif - GristAPI.getAllVariables()
  // (comportement historique, inchangé) pour 'variables', la liste fixe de
  // chips pour 'chips'. Centralisé ici pour être appelé à la fois par
  // l'`items()` de @tiptap/suggestion (à chaque frappe) et par le clic sur un
  // onglet (même filtre par texte tapé dans les deux cas).
  function computeItems(query) {
    const q = (query || '').toLowerCase();
    if (activeTab === 'chips') {
      // Note de bas de page exclue en édition d'en-tête/pied de page (cf.
      // Editor.isEditingHeaderFooter) : cette zone est répétée sur chaque
      // page, sans repère de page physique auquel ancrer une note - jamais
      // découverte par le pipeline PDF (content._footnoteBlocks ne parcourt
      // que le corps principal).
      const items = Editor.isEditingHeaderFooter() ? SMART_CHIP_ITEMS.filter(v => v.chipKind !== 'footnote') : SMART_CHIP_ITEMS;
      return items.filter(v => displayKey(v).toLowerCase().includes(q));
    }
    if (!schemaRefreshedForSession) {
      schemaRefreshedForSession = true;
      GristAPI.refreshSchema().catch(e => console.warn('[variables] rafraîchissement du schéma #Variable échoué', e));
    }
    const all = GristAPI.getAllVariables();
    return all.filter(v => v.key.toLowerCase().includes(q)).slice(0, 50);
  }

  function currentTabEl(tabName) {
    return acBox && acBox.querySelector('.ac-tab[data-tab="' + tabName + '"]');
  }
  // Le champ "Nom de fichier PDF" (texte brut, cf. checkForFilenameTrigger
  // plus bas) réutilise ce même acBox mais n'a PAS l'onglet Chips (aucun
  // nœud ProseMirror à y insérer, hors sujet de cette feature) - masqué
  // plutôt que retiré du DOM, pour ne pas avoir à le reconstruire à chaque
  // ouverture.
  function setTabsVisible(visible) {
    const tabs = ensureBox().querySelector('.ac-tabs');
    if (tabs) tabs.style.display = visible ? '' : 'none';
  }

  // Un survol à la souris met aussi à jour la sélection (pas seulement les
  // flèches du clavier) - cf. le bug corrigé cette même session dans
  // l'éditeur V1 (feedback : le survol donnait l'impression trompeuse d'une
  // sélection sans que Entrée ne suive réellement l'item survolé).
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
    latestProps = props;
    currentItems = props.items || [];
    selectedIndex = 0;
    latestCommand = props.command;
    setTabsVisible(true);
    render(currentItems, item => latestCommand(item));
    position(props.clientRect);
    ensureBox().style.display = currentItems.length ? 'flex' : 'none';
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
      onExit() { hide(); schemaRefreshedForSession = false; activeTab = 'variables'; },
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
            // Redéfinissable dans le panneau Réglages ; un changement n'a
            // effet qu'après rechargement de la page (ce `char` est un
            // littéral capturé une seule fois ici, à la construction de
            // l'éditeur - cf. triggerChar() ci-dessus).
            char: triggerChar(),
            // GristAPI (const de niveau racine d'un script classique, chargé
            // avant celui-ci) est visible par simple identifiant nu, comme
            // Editor/Templates/ReaderMode ailleurs dans le projet - JAMAIS via
            // window.GristAPI (un `const` classique ne s'attache jamais à
            // l'objet global, cf. mémoire projet_html_source_tab sur ce même
            // piège rencontré dans dev-tests/custom-html-export.js).
            items: ({ query }) => computeItems(query),
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
              // Chip (note de bas de page / date / heure / email) : jamais de
              // colonne/table à lier, aucun besoin d'ensureLinkConfigured -
              // insertion synchrone directe, contrairement à la branche
              // #Variable ci-dessous. La note de bas de page ouvre en plus
              // immédiatement son popup d'édition de texte (cf. editor.js:
              // openFootnoteEditor), pour pouvoir taper la note tout de suite
              // après l'avoir insérée.
              if (props.kind === 'chip') {
                if (props.chipKind === 'footnote') {
                  const id = 'fn-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
                  editor.chain().focus().insertContentAt(range, { type: 'footnoteRef', attrs: { id, text: '' } }).run();
                  // Retrouve la position RÉELLE du nœud fraîchement inséré par
                  // son id (unique, généré juste au-dessus) plutôt que de
                  // faire confiance à `range.from` après coup - `range` est
                  // une position ProseMirror capturée AVANT la transaction ;
                  // en théorie stable après une transaction qui remplace
                  // exactement ce range (cf. commentaire plus haut), mais un
                  // utilisateur a signalé la note bien insérée SANS jamais
                  // voir la popup d'édition s'ouvrir - jamais reproduit
                  // localement. Ce nouveau balayage retire complètement la
                  // dépendance suspectée (au lieu d'essayer de la corriger à
                  // l'aveugle sans pouvoir reproduire le bug), et fonctionne
                  // quelle que soit la correspondance exacte de `range.from`
                  // après coup.
                  let insertedPos = null;
                  editor.state.doc.descendants((node, pos) => {
                    if (insertedPos != null) return false;
                    if (node.type.name === 'footnoteRef' && node.attrs.id === id) { insertedPos = pos; return false; }
                    return true;
                  });
                  // `Editor` (js/editor.js, chargé APRÈS ce fichier - cf.
                  // index.html) n'est résolu qu'à l'EXÉCUTION de ce callback
                  // (déclenché par une frappe utilisateur, donc bien après que
                  // tous les scripts classiques aient fini de s'exécuter), pas
                  // à l'analyse de ce fichier - même sens de dépendance
                  // inversé que Editor.js appelant Variables.createExtension.
                  if (insertedPos != null) Editor.openFootnoteEditorAt(insertedPos);
                  else console.warn('[variables] note de bas de page insérée mais introuvable ensuite (id=' + id + ') - popup non ouverte.');
                } else {
                  editor.chain().focus().insertContentAt(range, { type: 'smartChip', attrs: { kind: props.chipKind } }).run();
                }
                return;
              }
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

  // Champ "Nom de fichier PDF" (#pdf-filename-template, cf. index.html) :
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
    if (caret == null) { hide(); filenameInputState = null; schemaRefreshedForSession = false; return; }
    const text = el.value.slice(0, caret);
    const match = text.match(new RegExp(triggerChar().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([A-Za-z0-9_]*)$'));
    if (!match) { hide(); filenameInputState = null; schemaRefreshedForSession = false; return; }
    // Même rafraîchissement "une fois par session" que le déclencheur de
    // l'éditeur (cf. createExtension/items ci-dessus) - déclenché dès le 1er
    // caractère tapé après #, PAS seulement si des résultats existent déjà :
    // sans ça, chercher une colonne toute juste ajoutée ("#" + son nom
    // exact) ne trouverait jamais rien puisque la branche !items.length
    // ci-dessous ferme le popup avant même d'avoir eu la chance de
    // rafraîchir.
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
    position(() => el.getBoundingClientRect());
    ensureBox().style.display = 'flex';
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
    const insertion = triggerChar() + item.key;
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
  // `format` (optionnel) = attribut `format` du nœud varBadge (cf.
  // js/editor.js:createVarBadgeNode), déjà désérialisé par l'appelant
  // (ReaderMode, cf. js/reader-mode.js:parseBadgeFormat) - { type:'number',
  // style, decimals, currency, words } ou { type:'date', preset }. Si AUCUN
  // format explicite n'a jamais été choisi (`format` absent/`null`) ET que
  // la colonne est un type Date/DateTime Grist natif (détecté via
  // GristAPI.getColumnType, d'où varTable/varColumn ici), un préréglage de
  // date par défaut s'applique quand même - sans ça, une bulle #Variable de
  // date jamais configurée affichait la valeur brute Grist telle quelle
  // (une chaîne "2026-09-12" ou un timestamp, illisible/confus - signalé par
  // l'utilisateur, qui avait l'impression que la barre de formatage ne
  // servait à rien tant qu'on n'avait pas explicitement cliqué un
  // préréglage). Un nombre sans format explicite reste en revanche
  // `String(val)` brut (déjà lisible tel quel, aucun changement là).
  function formatValue(val, format, varTable, varColumn) {
    if (val === null || val === undefined) return '';
    if (Array.isArray(val)) return val.join(', ');
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

  // Trouve la LIGNE/valeur brute référencée par une #Variable (même table,
  // table liée via règle singleton/correspondance, ou colonne Référence),
  // AVANT tout formatage en texte - extrait de resolveVariable ci-dessous
  // pour être réutilisable par resolveAttachmentIds (une colonne Attachments
  // ne doit jamais passer par formatValue/String(val), cf. plus bas) sans
  // dupliquer cette logique de recherche de ligne. Retourne soit
  // { value } (valeur brute de cellule Grist, peut être null/undefined),
  // soit { error } (message déjà formaté "[ERREUR: ...]", comportement
  // inchangé pour resolveVariable qui le renvoie tel quel).
  async function resolveRawValueWithRule(varTable, varColumn, rule, record) {
    if (rule.mode === 'singleton') {
      const rows = await GristAPI.fetchTableRows(varTable);
      if (!rows.length) return { value: null };
      const first = rows.reduce((min, r) => (r.id < min.id ? r : min), rows[0]);
      return { value: first[varColumn] };
    }
    const sourceVal = rule.colonneSource === 'id' ? record.id : unwrapRefValue(record[rule.colonneSource]);
    if (sourceVal === undefined || sourceVal === null) return { value: null };
    const rows = await GristAPI.fetchTableRows(varTable);
    const matches = rows.filter(r => {
      const cibleVal = rule.colonneCible === 'id' ? r.id : unwrapRefValue(r[rule.colonneCible]);
      return sameValue(cibleVal, sourceVal);
    });
    if (!matches.length) return { value: null };
    return { value: matches.map(r => r[varColumn]) };
  }
  async function resolveRawValue(varTable, varColumn, currentTableId, record, opts) {
    const resolvedTableId = currentTableId || GristAPI.getCurrentTableId();
    if (!record) return { value: null };
    if (!resolvedTableId) return { error: '[ERREUR: table courante indisponible]' };
    if (varTable === resolvedTableId) {
      // Cas "même table" : les 3 AUTRES branches ci-dessous (table liée/
      // colonne Référence) lisent toutes via GristAPI.fetchTableRows/
      // fetchRowById - une lecture brute docApi, dont l'encodage d'une
      // colonne liste (Attachments/RefList, ex. ['L', id1, id2]) est connu
      // et déjà exploité par unwrapRefValue ailleurs dans ce fichier. `record`
      // ici vient en revanche de grist.onRecord (l'API "widget", pas docApi) -
      // dont l'encodage exact d'une colonne liste n'est pas garanti identique
      // (jamais vérifié en conditions réelles pour Attachments spécifiquement,
      // seulement pour du texte/nombre simple). resolveAttachmentIds passe
      // donc `opts.forceRawFetch` pour repasser par fetchRowById (même lecture
      // garantie que les 3 autres branches) plutôt que de faire confiance à
      // `record` tel quel - sans incidence sur resolveVariable (texte simple),
      // qui n'active jamais cette option et garde son comportement d'origine.
      if (opts && opts.forceRawFetch && record.id != null) {
        try {
          const row = await GristAPI.fetchRowById(varTable, record.id);
          if (row) return { value: row[varColumn] };
        } catch (e) { /* repli sur record[varColumn] ci-dessous */ }
      }
      return { value: record[varColumn] };
    }
    const rule = GristAPI.getLinkRule(varTable);
    if (rule) return await resolveRawValueWithRule(varTable, varColumn, rule, record);
    const refCols = await GristAPI.findReferenceColumns(resolvedTableId, varTable);
    if (refCols.length === 0) return { error: `[ERREUR: aucune correspondance configurée pour ${varTable} — réinsérez la variable pour la configurer]` };
    const refId = record[refCols[0]];
    if (!refId) return { value: null };
    const rowId = unwrapRefValue(refId);
    const linkedRow = await GristAPI.fetchRowById(varTable, rowId);
    if (!linkedRow) return { error: `[ERREUR: ligne introuvable dans ${varTable}]` };
    return { value: linkedRow[varColumn] };
  }
  async function resolveVariable(varTable, varColumn, currentTableId, record, format) {
    try {
      const { value, error } = await resolveRawValue(varTable, varColumn, currentTableId, record);
      if (error) return error;
      return formatValue(value, format, varTable, varColumn);
    } catch (e) {
      console.error('[variables] échec résolution', e);
      return `[ERREUR: résolution de ${varTable}.${varColumn} impossible]`;
    }
  }

  // Extrait les identifiants de pièce jointe d'une colonne Attachments
  // référencée par #Variable (cas d'usage : logo partenaire, image stockée
  // en PJ sur une autre ligne/table) - AUPARAVANT, une telle variable passait
  // par resolveVariable/formatValue comme n'importe quelle colonne, qui ne
  // sait que transformer une valeur en TEXTE (`Array.isArray(val) ?
  // val.join(', ') : String(val)`) : la valeur brute d'une cellule
  // Attachments est une liste encodée façon Grist (['L', id1, id2, ...]),
  // donc au mieux transformée en texte du genre "L, 5" - jamais une image,
  // ni dans l'aperçu ni dans le PDF - signalé par l'utilisateur. Réutilise
  // resolveRawValue (même recherche de ligne que le texte : même table,
  // règle singleton/correspondance, colonne Référence) plutôt que
  // formatValue, puis aplatit récursivement le résultat pour n'en garder que
  // les nombres (les ids) - le marqueur 'L' et toute imbrication (le cas
  // "correspondance" avec plusieurs lignes trouvées renvoie un TABLEAU de
  // valeurs de cellule, chacune elle-même une liste encodée) disparaissent
  // naturellement, sans code dédié à chaque forme.
  function flattenToNumbers(value) {
    if (value == null) return [];
    if (Array.isArray(value)) return value.flatMap(flattenToNumbers);
    if (typeof value === 'number') return [value];
    // Filet de sécurité : au cas où une forme différente de l'encodage liste
    // brut (ex. objet métadonnée {id, fileName, ...}) apparaisse un jour côté
    // lecture - jamais rencontré en conditions réelles pour l'instant, mais
    // sans coût pour les formes déjà gérées ci-dessus.
    if (value && typeof value === 'object' && typeof value.id === 'number') return [value.id];
    return [];
  }
  async function resolveAttachmentIds(varTable, varColumn, currentTableId, record) {
    try {
      const { value, error } = await resolveRawValue(varTable, varColumn, currentTableId, record, { forceRawFetch: true });
      if (error) return [];
      return flattenToNumbers(value);
    } catch (e) {
      console.error('[variables] échec résolution pièce jointe', e);
      return [];
    }
  }

  // --- Configuration des correspondances entre tables (à l'insertion +
  // panneau de gestion) - porté quasi tel quel de la V1 (js/variables.js) :
  // logique pure DOM/GristAPI, aucune dépendance à Quill ni à TipTap, donc
  // réutilisable sans changement d'engin. Seule différence : la V1 range ce
  // panneau dans un volet repliable dédié (#toolbar-panel/#btn-toggle-panel) ;
  // ici, une modale séparée (#link-rules-modal, cf. index.html) plutôt que
  // d'introduire tout un système de volet repliable pour ce seul besoin.

  // Signale dans le libellé qu'une colonne est une Référence (et vers quelle
  // table) - sans ça, rien dans la modale n'indique qu'une colonne stocke en
  // réalité un identifiant de ligne plutôt qu'un texte (piège déjà rencontré
  // en V1, cf. mémoire project_cross_table_variable_links).
  function describeColumnOption(tableId, colId) {
    const type = GristAPI.getColumnType(tableId, colId);
    if (type && type.indexOf('Ref:') === 0) return I18n.t('linkConfig.reference', { col: colId, table: type.slice(4) });
    if (type && type.indexOf('RefList:') === 0) return I18n.t('linkConfig.referenceList', { col: colId, table: type.slice(8) });
    return colId;
  }
  function describeRule(rule) {
    if (rule.mode === 'singleton') return I18n.t('linkConfig.describeSingleton');
    const rowIdLabel = I18n.t('linkConfig.describeRowId');
    const cible = rule.colonneCible === 'id' ? rowIdLabel : rule.colonneCible;
    const source = rule.colonneSource === 'id' ? rowIdLabel : rule.colonneSource;
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
    const placeholder = `<option value="" disabled selected>${I18n.t('linkConfig.columnPlaceholder')}</option>`;
    const rowIdOption = `<option value="id">${I18n.t('linkConfig.rowId')}</option>`;
    // HtmlSanitize.clean() en filet de sécurité : colId/nom de table viennent
    // du schéma Grist réel, normalement déjà contraints à des identifiants
    // valides par l'UI standard de Grist - mais rien ne le garantit si l'un
    // d'eux est un jour créé via l'API REST Grist en contournant cette UI
    // (cf. AUDIT_CODE.md §3.2).
    selectCible.innerHTML = HtmlSanitize.clean(placeholder + rowIdOption + GristAPI.getColumns(targetTable).map(c => `<option value="${c}">${describeColumnOption(targetTable, c)}</option>`).join(''));
    selectSource.innerHTML = HtmlSanitize.clean(placeholder + rowIdOption + GristAPI.getColumns(currentTableId).map(c => `<option value="${c}">${describeColumnOption(currentTableId, c)}</option>`).join(''));

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
        const sourceVal = rule.colonneSource === 'id' ? record.id : unwrapRefValue(record[rule.colonneSource]);
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
  // Modèles (Templates.getCached(), déjà chargés en mémoire par main.js -
  // aucun aller-retour Grist supplémentaire ici) dont le contenu contient au
  // moins un badge #Variable pointant vers `tableCible` - recherche brute sur
  // l'attribut sérialisé par createVarBadgeNode (js/editor.js), pas besoin
  // d'un DOMParser complet pour ce seul besoin. Utilisé pour avertir avant de
  // supprimer une règle de correspondance encore utilisée ailleurs.
  function findTemplatesUsingTable(tableCible) {
    const templates = (typeof Templates !== 'undefined' && Templates.getCached) ? Templates.getCached() : [];
    const needle = 'data-table="' + tableCible + '"';
    return templates.filter(tpl => tpl.contenu && tpl.contenu.indexOf(needle) !== -1);
  }
  // Panneau de gestion (modale #link-rules-modal, cf. index.html) : liste
  // les tables déjà configurées, avec un bouton pour modifier ou supprimer
  // chaque règle. Appelée au démarrage et à chaque ouverture de la modale
  // (cf. js/main.js).
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
      btnEdit.addEventListener('click', async () => {
        const currentTableId = GristAPI.getCurrentTableId();
        if (!currentTableId) return;
        const newRule = await showLinkConfigModal(rule.tableCible, currentTableId, rule);
        if (!newRule) return;
        await GristAPI.saveLinkRule(rule.tableCible, newRule);
        refreshLinkRulesPanel();
      });
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

  return { createExtension, resolveVariable, resolveAttachmentIds, refreshLinkRulesPanel, initFilenameInput };
})();
