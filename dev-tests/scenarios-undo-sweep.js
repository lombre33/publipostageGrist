// Suite "undoSweep" - le balayage de Ctrl + Z, piloté par le registre dev-tests/undo-ledger.json (suite de la demande d'Antoine du 22/10 : « Il doit prendre en compte 100% des actions faites dans le widget »). Les lots d'Annuler ont rangé
// chaque geste dans l'historique ; ce balayage dit, pour CHAQUE contrôle que la personne voit, qu'il est classé et - quand c'est un geste sur le modèle - qu'UN Ctrl + Z rend ce que son clic a fait.
//
// Le registre classe chaque contrôle (le fichier décrit ses classes, `classes`) : `model` (un geste sur le texte ou la page : essayé ici), `window` (une fenêtre : essayée avec le geste `drive` qui la remplit et la valide), `view` (ne change
// rien : essayé), `inside` (un choix parmi plusieurs qui suivent le chemin de celui que `via` fait essayer), `covered` (défait et essayé ailleurs, par les groupes de `cases` : une présentation, le macro-modèle, un champ de l'email, un
// commentaire...), `history`, `own-undo`, `navigation`, `export`, et `pending` (le lot qui les rangera : 2f, la bibliothèque et les Réglages ; 2g, les barres des objets d'une présentation). Deux sortes d'essais :
//   1. undo_sweep_every_control_is_classified : dans chaque document de départ, tout ce qui se clique ou se règle (la barre, ses menus, les barres flottantes - CACHÉES comprises -, les menus de couleur et de bordures, les listes, glissières
//      et champs, les boutons à identifiant de index.html) a son entrée dans le registre ; toute entrée désigne encore un contrôle ; chaque contrôle essayé se trouve dans son document de départ ;
//   2. undo_sweep_<document>_controls_come_back_with_one_ctrl_z : les contrôles `model`, `window` et `view` de ce document de départ, un à la fois, document rechargé avant chacun : le clic (ou le réglage d'une liste, d'une glissière, d'un
//      champ : `set`) change l'état, UN Ctrl + Z le rend tel qu'avant, UN Ctrl + Y le remet ; les contrôles `view` ne changent rien.
// L'état que l'on compare est tout ce que l'historique doit rendre : le texte (identifiants aléatoires gommés), la page (couleurs gardées comprises), les zones de l'en-tête et du pied, les champs de l'email, la numérotation des titres.
// Chaque essai repart du même état, celui du widget qui s'ouvre (restoreBaseline : Édition, Aperçu A4, aucune fenêtre, suivi des modifications éteint) : un contrôle `view` ou une fenêtre ne laisse rien au suivant. Un `setup` du registre met d'abord le
// contrôle en état d'agir (« Scinder » n'a d'effet qu'après « Fusionner ») ; l'essai attend alors 600 ms, car deux changements à moins de 500 ms font UN pas d'historique (prosemirror-history, newGroupDelay). Un `open` ouvre d'abord le menu qui
// porte le contrôle ; un contrôle `dynamic` n'y est dessiné qu'à son ouverture (la croix d'une couleur gardée) : l'essai le cherche alors.
// La touche part de l'élément qui a le FOCUS, là où le clic l'a laissé : une liste ou une glissière de la barre le garde, et js/shortcuts.js y laisse partir Ctrl + Z au bouton Annuler (typesNothing), qu'un champ de saisie
// garde pour sa frappe (inTextField). `keyOnFocus` au registre le dit : `field`, un champ de saisie où Ctrl + Z défait la frappe (choix du lot de la page) ; `ignored`, un trou connu où la touche ne fait RIEN tant que le focus reste
// au contrôle (l'état revient dès que le focus part, l'essai le vérifie, et il échoue le jour où la touche agit pour qu'on retire la mention) - plus aucun depuis le lot des listes et des glissières.
// Un contrôle neuf de la barre qui n'est pas dans le registre fait échouer l'essai : la règle tient pour les boutons ajoutés plus tard. Les contrôles d'une barre qu'aucun document de départ ne peut afficher (les cadres et formes d'une présentation,
// la copie de diapositive, la mention, le menu du tableau lié) sont comptés - la classification les voit, cachés - mais ne sont défaits que par leurs groupes : le registre les classe `covered`, et dev-tests/unit-undo-ledger.mjs exige que le fichier du
// groupe contienne un vrai Annuler ; sans Ctrl + Z vérifié, ils restent `pending`.
// Le balayage se lance seul : node dev-tests/run-headless.mjs undoSweep ; --case undo_sweep_list n'en joue qu'un document. Pour rejouer quelques contrôles seulement : un fichier qui écrit window.__undoSweepOnly = ['<clé du registre>', ...];
// passé à --preseed ; avec window.__undoSweepListAll = true; la classification liste TOUS les contrôles à classer (au lieu de douze).
window.EditorTestSuites = window.EditorTestSuites || {};
window.EditorTestSuites.undoSweep = (function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const ed = () => EditorCore.getEditor();
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const DATA_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const verdict = (problems, summary) => ({ pass: problems.length === 0, notes: JSON.stringify({ summary, problems }) });

  // Le geste complet de la souris sur un contrôle (les boutons de la barre sont câblés sur click, mousedown ou pointerdown selon le cas).
  function mouseGesture(el) {
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
      const Ctor = type.indexOf('pointer') === 0 ? PointerEvent : MouseEvent;
      el.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true, composed: true, button: 0, view: window }));
    });
  }
  // Le réglage d'une liste, d'une glissière ou d'un champ de la barre (`set` au registre), comme la personne le fait : le contrôle prend le focus, sa valeur change, `input` puis `change` partent. Le focus y reste.
  function setControl(el, set) {
    el.focus();
    if (set.option !== undefined) el.selectedIndex = set.option; else el.value = set.text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function press(key, target) {
    const event = new KeyboardEvent('keydown', { key, code: 'Key' + key.toUpperCase(), ctrlKey: true, bubbles: true, cancelable: true });
    (target || document.body).dispatchEvent(event);
    return event.defaultPrevented;
  }
  // La touche part de l'élément qui a le focus (l'éditeur, une glissière, une liste de la barre), comme sous les doigts.
  const keyTarget = () => document.activeElement || document.body;

  // Tout ce que l'historique est censé rendre : le texte (identifiants aléatoires gommés), la page, les zones de l'en-tête et du pied, les champs, et la numérotation des titres que la page lit sur la racine.
  function modelState() {
    return {
      html: Editor.getHTML().replace(/(data-[a-z-]*id|id)="[^"]{6,}"/g, '$1="#"'),
      page: PageLayout.snapshot(),
      zones: HeaderFooterPreview.snapshot(),
      fields: FieldEditor.snapshot(),
      headingStyle: ed().view.dom.dataset.headingStyle || 'none',
    };
  }

  const OVERLAYS = '.pp-modal, [class*="popup"], [class*="dropdown"], [class*="picker"], .v2-palette, .color-palette';
  const isShown = el => el.isConnected && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden' && el.getClientRects().length > 0;
  const visibleOverlays = () => Array.from(document.querySelectorAll(OVERLAYS)).filter(isShown).map(el => el.id || el.className).sort();
  async function closeOverlays() {
    for (let i = 0; i < 3; i++) {
      if (typeof EditorCore !== 'undefined' && EditorCore.closeDropdownPanel) EditorCore.closeDropdownPanel();
      (document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
      await sleep(40);
    }
  }

  // La clé d'un contrôle : son identifiant, sinon celui de son ancêtre et ses attributs data-* (la ligne « Titre 2 » d'un menu, une action d'une barre flottante, une ligne d'un panneau de police ou de couleur).
  const PANELS = '.v2-floating-toolbar, .v2-color-dropdown, .v2-format-panel';
  const GENERIC = ['v2-floating-toolbar', 'v2-color-dropdown', 'v2-format-panel', 'visible'];
  function keyOf(el) {
    if (el.id) return '#' + el.id;
    const anchor = el.parentElement && el.parentElement.closest('[id]');
    const panel = el.closest(PANELS);
    const own = panel && Array.from(panel.classList).filter(c => GENERIC.indexOf(c) === -1)[0];
    let where = '';
    if (panel && panel.classList.contains('v2-floating-toolbar')) where = '.' + (own || 'bar');
    else if (panel && panel.classList.contains('v2-color-dropdown')) where = '.' + (own || 'v2-color-dropdown');
    else if (anchor) where = '#' + anchor.id;
    else if (panel) where = '.v2-format-panel';
    const data = Array.from(el.attributes).filter(a => /^data-(?!i18n|keytip|keyhint|tip)/.test(a.name)).map(a => a.name.slice(5) + '=' + a.value).join(',');
    return where + ' ' + el.tagName.toLowerCase() + (data ? '[' + data + ']' : '');
  }
  const SELECTORS = [
    '.bar-row button', '.bar-row [role^="menuitem"]', '.bar-row .v2-hover-row',
    '#v2-toolbar button', '#v2-toolbar [role^="menuitem"]', '#v2-toolbar .v2-hover-row',
    '.v2-floating-toolbar [data-action]', '.v2-floating-toolbar button', '.v2-floating-toolbar [data-role]',
    '.v2-format-panel button[data-action]', '.v2-color-dropdown button[data-action]', '.v2-color-dropdown [data-role]',
    'button[id]', 'select[id]', 'input[id]', '[contenteditable="true"][id]',
  ].join(',');
  // Tout ce qui se clique ou se règle dans le document de départ affiché, clé -> élément. `everything` : les barres flottantes cachées aussi (la classification les veut toutes ; un essai n'agit que sur ce que la personne atteint).
  // Hors de portée de la personne, donc hors du compte : le texte du document (c'est lui qui change), un champ ou une liste que l'attribut `hidden` retire (la mémoire cachée d'un menu).
  function controls(everything) {
    const seen = new Map();
    document.querySelectorAll(SELECTORS).forEach(el => {
      if (!el.isConnected || el.closest('.ProseMirror:not(.pp-field-editor)')) return;
      if (el.hidden && el.id && /^(SELECT|INPUT)$/.test(el.tagName)) return;
      const bar = el.closest('.v2-floating-toolbar');
      if (bar && !everything && !bar.classList.contains('visible')) return;
      const key = keyOf(el);
      if (!seen.has(key)) seen.set(key, el);
    });
    return seen;
  }
  const disabledOf = el => !!(el.disabled || el.getAttribute('aria-disabled') === 'true' || el.classList.contains('is-disabled') || el.classList.contains('disabled'));

  // --- Le registre ---
  let ledgerPromise = null;
  const ledger = () => (ledgerPromise = ledgerPromise || fetch('dev-tests/undo-ledger.json').then(response => response.json()));
  const globRe = pattern => new RegExp('^' + pattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
  // L'entrée de ce contrôle : la première du registre dont la clé convient.
  function entryOf(registry, key) {
    for (const [pattern, entry] of Object.entries(registry.controls)) if (globRe(pattern).test(key)) return { pattern, entry };
    return null;
  }

  // --- Les documents de départ : de quoi activer chaque contrôle ---
  const PARA = '<p>Bonjour monde</p>';
  const TABLE = '<table><tbody><tr><td><p>Alpha</p></td><td><p>Beta</p></td></tr><tr><td><p>Gamma</p></td><td><p>Delta</p></td></tr></tbody></table><p>Après</p>';
  const VAR_TABLE = 'SwDossiers';
  const badge = column => '<span class="var-badge" data-table="' + VAR_TABLE + '" data-column="' + column + '" data-key="' + VAR_TABLE + '.' + column + '"></span>';
  const FIXTURES = [
    { name: 'para', markup: PARA, sel: 'all' },
    { name: 'paraEnd', markup: PARA, sel: 'end' },
    { name: 'list', markup: '<ul><li><p>a</p></li><li><p>b</p></li></ul>', sel: 'inB' },
    { name: 'heading', markup: '<h1>Titre</h1><p>texte</p>', sel: 'start' },
    { name: 'table', markup: TABLE, sel: 'cell' },
    { name: 'tableCells', markup: TABLE, sel: 'cells' },
    { name: 'tableVar', markup: '<table><tbody><tr><td><p>' + badge('Titre') + '</p></td><td><p>Beta</p></td></tr></tbody></table><p>Après</p>', sel: 'cellBeta', variables: true },
    { name: 'image', markup: '<p>Texte</p><p><img class="editor-image" src="' + DATA_PNG + '" alt=""></p>', sel: 'image' },
    { name: 'imageInline', markup: '<p>Texte <img class="editor-image" src="' + DATA_PNG + '" alt=""> suite</p>', sel: 'image' },
    { name: 'variable', markup: '<p>Dossier ' + badge('Titre') + ' fin</p>', sel: 'badge', variables: true },
    { name: 'varNum', markup: '<p>Dossier ' + badge('Montant') + ' fin</p>', sel: 'badge', variables: true },
    { name: 'varBool', markup: '<p>Dossier ' + badge('Actif') + ' fin</p>', sel: 'badge', variables: true },
    { name: 'varDate', markup: '<p>Dossier ' + badge('Echeance') + ' fin</p>', sel: 'badge', variables: true },
    { name: 'varDateTime', markup: '<p>Dossier ' + badge('Moment') + ' fin</p>', sel: 'badge', variables: true },
    { name: 'varList', markup: '<p>Dossier ' + badge('Themes') + ' fin</p>', sel: 'badge', variables: true },
    { name: 'calc', markup: '<p>Total <span class="calc-badge" data-formula="{' + VAR_TABLE + '.Montant} * 2"></span> fin</p>', sel: 'calc', variables: true },
    { name: 'colors', markup: PARA, sel: 'all', savedColors: ['#1e8449'] },
    { name: 'suggestion', markup: '<p>Bonjour <ins data-id="1">monde</ins> fin</p><p>Autre <del data-id="2">texte</del> ligne</p>', sel: 'inSuggestion' },
    { name: 'timeChip', markup: '<p>Heure <span class="smart-chip" contenteditable="false" data-chip-kind="time"></span> fin</p>', sel: 'chip' },
  ];
  async function seedVariables() {
    const stub = window.__gristStub;
    const row = { id: 1, Titre: 'Dossier A', Statut: 'Urgent', Montant: 1200, Actif: true, Echeance: 1790000000, Moment: 1790000000, Themes: ['L', 'Santé', 'Social'], Photo: null };
    stub.setVariables(VAR_TABLE, { Titre: 'Text', Statut: 'Text', Montant: 'Numeric', Actif: 'Bool', Echeance: 'Date', Moment: 'DateTime:Europe/Paris', Themes: 'ChoiceList', Photo: 'Attachments' });
    stub.setRows(VAR_TABLE, [row]);
    await GristAPI.refreshSchema();
    stub.fireRecord(row, VAR_TABLE);
  }
  // Le départ de chaque essai est le même, celui du widget qui s'ouvre : le mode Édition, hors Lecture épurée, sur l'Aperçu A4 (resetEditor() le retire), aucune fenêtre ouverte, le suivi des modifications éteint. Un contrôle
  // `view` ou une fenêtre ne laisse rien à l'essai suivant.
  async function restoreBaseline() {
    document.getElementById('editor-container').classList.add('a4-preview');
    if (document.body.classList.contains('pp-clean-reading')) { document.getElementById('btn-exit-clean-reading').click(); await sleep(250); }
    const edit = document.getElementById('btn-mode-edit');
    if (edit && !edit.classList.contains('active')) { edit.click(); await sleep(350); }
    await closeOverlays();
    if (Editor.isTrackChangesOn()) { document.getElementById('v2-btn-track-changes').click(); await sleep(100); }
  }
  const NODE_OF = { image: 'editorImage', badge: 'varBadge', chip: 'smartChip', calc: 'calcBadge' };
  async function load(h, fx) {
    await h.resetEditor();
    await restoreBaseline();
    PageLayout.setCustomColors(fx.savedColors || []); // les couleurs gardées du modèle : celles d'un document de départ qui en demande, sinon aucune
    if (fx.variables) await seedVariables();
    Editor.setHTML(fx.markup);
    await sleep(100);
    const editor = ed();
    const textPos = text => { let at = -1; editor.state.doc.descendants((node, p) => { if (at < 0 && node.isText && node.text === text) at = p; }); return at; };
    if (fx.sel === 'all') editor.chain().focus().selectAll().run();
    else if (fx.sel === 'end') editor.chain().focus('end').run();
    else if (fx.sel === 'start') editor.chain().focus('start').run();
    else if (fx.sel === 'cell' || fx.sel === 'cells' || fx.sel === 'cellBeta') {
      const at = textPos(fx.sel === 'cellBeta' ? 'Beta' : 'Alpha');
      editor.view.focus();
      editor.view.dispatch(editor.state.tr.setSelection(EditorCore.getTextSelectionClass().create(editor.state.doc, at + 2)));
      if (fx.sel === 'cells') {
        const cells = [];
        editor.state.doc.descendants((node, p) => { if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') cells.push(p); });
        editor.commands.setCellSelection({ anchorCell: cells[0], headCell: cells[3] });
      }
    } else if (NODE_OF[fx.sel]) {
      let pos = -1;
      editor.state.doc.descendants((node, p) => { if (pos < 0 && node.type.name === NODE_OF[fx.sel]) pos = p; });
      editor.view.focus();
      if (pos >= 0) editor.commands.setNodeSelection(pos);
    } else if (fx.sel === 'inSuggestion') {
      // Le curseur dans une modification suivie : sa barre (Accepter, Refuser) s'ouvre sous lui, attend un déplacement de la sélection.
      editor.view.focus();
      editor.view.dispatch(editor.state.tr.setSelection(EditorCore.getTextSelectionClass().create(editor.state.doc, textPos('monde') + 2)));
      await sleep(400);
    } else {
      const at = textPos('b');
      if (at < 0) editor.chain().focus('end').run(); else editor.chain().setTextSelection(at + 1).focus().run();
    }
    await sleep(120);
  }

  // --- Les gestes : ['click', sélecteur], ['clickText', sélecteur, texte], ['type', sélecteur, valeur], ['wait', ms] sur l'élément visible le plus bas du document (la fenêtre ouverte) ; ['control', clé] sur un contrôle du registre
  // (les `setup`) ; ['prompt', réponse] répond à la question que le clic pose (une adresse d'image) ; ['@nom'] un geste plus long, plus bas ---
  function setValue(el, value) {
    el.focus();
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function findShown(selector, text) {
    const found = Array.from(document.querySelectorAll(selector)).filter(isShown).filter(el => text === undefined || (el.textContent + ' ' + (el.title || '') + ' ' + (el.getAttribute('aria-label') || '')).indexOf(text) !== -1);
    return found.length ? found[found.length - 1] : null;
  }
  // Une fenêtre s'ouvre parfois après une lecture (le schéma des colonnes, une liste qui se bâtit) : on lui laisse deux secondes.
  async function shown(selector, text) {
    for (let i = 0; i < 25; i++) {
      const el = findShown(selector, text);
      if (el) return el;
      await sleep(80);
    }
    throw new Error('introuvable : ' + selector + (text ? ' « ' + text + ' »' : ''));
  }
  // Les gestes qui ne se disent pas en une ligne portent le nom de leur fonction dans le registre (['@condition']) : la fenêtre « Condition » - choisir une colonne dans la liste avec recherche, écrire une valeur.
  const DRIVES = {
    async condition() {
      mouseGesture(await shown('.pp-modal button.ss-trigger', 'Choisir une colonne')); await sleep(200);
      mouseGesture(await shown('.ss-panel .ss-option', 'Statut')); await sleep(200);
      setValue(await shown('.pp-modal input.macro-rule-value'), 'Urgent'); await sleep(100);
      mouseGesture(await shown('.var-modal-primary'));
    },
  };
  async function runSteps(steps) {
    for (const step of steps || []) {
      const [op, a, b] = step;
      if (op === 'prompt') continue; // la réponse est posée avant le clic (trial) : la question se pose pendant le clic
      if (op === 'wait') { await sleep(a); continue; }
      if (op === 'type') setValue(await shown(a), b);
      else if (op === 'click' || op === 'clickText') mouseGesture(await shown(a, b));
      else if (op === 'control') {
        const el = controls().get(a);
        if (!el) throw new Error('contrôle introuvable : ' + a);
        mouseGesture(el);
      } else if (op.charAt(0) === '@') { await DRIVES[op.slice(1)](); }
      else throw new Error('geste inconnu : ' + op);
      await sleep(160);
    }
  }

  // Le geste de la personne sur un contrôle, et ce qu'il a changé : rend { problem } ou { ok: true }.
  async function trial(h, fx, key, entry) {
    await load(h, fx);
    if (!ed().isEditable) return { problem: 'l\'éditeur n\'est pas modifiable au départ (un essai d\'avant a laissé le mode Lecture ?)' };
    // Deux changements à moins de 500 ms l'un de l'autre font UN pas d'historique (prosemirror-history, newGroupDelay) : le départ de l'essai attend, comme une personne qui clique deux fois.
    if (entry.setup) { await runSteps(entry.setup); await sleep(600); }
    // Le menu qui porte le contrôle s'ouvre d'abord (certains ne dessinent leurs lignes qu'à l'ouverture : les couleurs gardées) ; un menu déjà ouvert le reste.
    if (entry.open) {
      const opener = controls().get(entry.open);
      if (!opener) return { problem: 'son ouvreur ' + entry.open + ' est introuvable' };
      if (opener.getAttribute('aria-expanded') !== 'true') { mouseGesture(opener); await sleep(150); }
    }
    const el = controls().get(key);
    if (!el) return { problem: 'introuvable dans le document « ' + fx.name + ' »' + (entry.open ? ' (ouvreur ' + entry.open + ')' : '') };
    // Un contrôle `view` grisé ne peut rien changer au modèle : il n'y a rien à rendre.
    if (disabledOf(el)) return entry.class === 'view' ? { ok: true } : { problem: 'grisé dans le document « ' + fx.name + ' »' };
    const shownBefore = visibleOverlays();
    const before = modelState();
    window.__gristStub.clearActionLog();
    const answer = (entry.drive || []).find(step => step[0] === 'prompt');
    if (answer) Dialogs.prompt = async () => answer[1];
    if (entry.set) setControl(el, entry.set); else mouseGesture(el);
    await sleep(160);
    const opened = visibleOverlays().filter(name => shownBefore.indexOf(name) === -1); // ce que le geste ouvre : le menu déjà ouvert n'en est pas
    if (entry.class === 'view') {
      await closeOverlays();
      const unchanged = same(before, modelState());
      return unchanged ? { ok: true } : { problem: 'change le modèle (à classer `model`)' };
    }
    if (entry.class === 'model') {
      if (opened.length) { await closeOverlays(); return { problem: 'ouvre une fenêtre (' + opened.join(' + ') + ') : à classer `window`, avec son geste' }; }
    } else {
      if (!entry.drive) return { problem: 'pas de geste `drive`' };
      await runSteps(entry.drive);
      await sleep(250);
      const left = visibleOverlays().filter(name => opened.indexOf(name) !== -1);
      if (left.length) { await closeOverlays(); return { problem: 'la fenêtre reste ouverte après son geste (' + left.join(' + ') + ')' }; }
    }
    const after = modelState();
    if (same(before, after)) return { problem: 'ne change rien du modèle' + (entry.class === 'window' ? ' après son geste' : ' dans « ' + fx.name + ' » (un `setup`, ou un autre `start` ?)') };
    // La touche part de l'élément qui a le focus, là où le clic l'a laissé : une liste ou une glissière de la barre le garde, et js/shortcuts.js y laisse partir la touche (typesNothing) mais la laisse à un champ de saisie (inTextField).
    press('z', keyTarget());
    await sleep(110);
    let back = modelState();
    const kept = document.activeElement && document.activeElement !== document.body && same(back, after);
    if (kept) {
      // Rien ne s'est passé : la touche est restée au contrôle. Une fois le focus parti, Ctrl + Z rend-il l'état d'avant (l'historique est bon, seule la touche manquait) ?
      document.activeElement.blur();
      press('z', keyTarget()); await sleep(110);
      back = modelState();
      if (same(back, before) && !entry.keyOnFocus) return { problem: 'Ctrl + Z ne fait rien tant que le focus reste sur ce contrôle (il rend l\'état d\'avant dès que le focus est parti) : js/shortcuts.js laisse la touche à ce contrôle (inTextField, typesNothing) ; à corriger, ou à déclarer `keyOnFocus` au registre' };
    } else if (entry.keyOnFocus && same(back, before)) return { problem: 'Ctrl + Z agit maintenant avec le focus sur ce contrôle : retirer `keyOnFocus` du registre' };
    if (entry.keyOnFocus && !kept) return { problem: '`keyOnFocus` au registre, mais la touche n\'est pas restée au contrôle' };
    if (!same(back, before)) {
      const parts = Object.keys(before).filter(k => !same(before[k], back[k]));
      // Un deuxième Ctrl + Z suffirait-il ? Ce serait le « trou » d'un geste en plusieurs pas.
      press('z', keyTarget()); await sleep(110);
      const twice = same(modelState(), before);
      return { problem: 'UN Ctrl + Z ne rend pas l\'état d\'avant (' + parts.join(', ') + ')' + (twice ? ' : il en faut deux' : ' : même deux ne suffisent pas') };
    }
    press('y', keyTarget());
    await sleep(110);
    if (!same(modelState(), after)) return { problem: 'UN Ctrl + Y ne remet pas l\'état d\'après' };
    return { ok: true };
  }

  // Les contrôles d'un document de départ que le registre y fait essayer : { clé concrète, entrée }.
  function triedIn(registry, fx, present) {
    const wanted = [];
    for (const [pattern, entry] of Object.entries(registry.controls)) {
      if (entry.start !== fx.name || ['model', 'window', 'view'].indexOf(entry.class) === -1) continue;
      if (entry.dynamic) { wanted.push({ key: pattern, entry }); continue; } // dessiné à l'ouverture d'un menu : pas dans le document au départ, l'essai le cherche après `open`
      const re = globRe(pattern);
      const keys = present.filter(key => re.test(key) && entryOf(registry, key).pattern === pattern);
      keys.forEach(key => wanted.push({ key, entry }));
    }
    return wanted;
  }

  async function withDialogsStubbed(run) {
    const real = { alert: window.alert, confirm: window.confirm, prompt: window.prompt, dialogs: { prompt: Dialogs.prompt, confirm: Dialogs.confirm } };
    window.alert = () => {}; window.confirm = () => true; window.prompt = () => null;
    Dialogs.prompt = async () => null; Dialogs.confirm = async () => true;
    try { return await run(); } finally {
      Object.assign(window, { alert: real.alert, confirm: real.confirm, prompt: real.prompt });
      Dialogs.prompt = real.dialogs.prompt; Dialogs.confirm = real.dialogs.confirm;
    }
  }

  cases.push({
    id: 'undo_sweep_every_control_is_classified',
    description: 'Chaque contrôle de la barre, de ses menus, des barres flottantes et des panneaux de police est classé dans dev-tests/undo-ledger.json ; chaque entrée désigne encore un contrôle ; chaque contrôle essayé se trouve dans son document de départ',
    run: async (h) => {
      const registry = await ledger();
      const problems = [];
      const seenAnywhere = new Set();
      const presentByFixture = {};
      for (const fx of FIXTURES) {
        await load(h, fx);
        controls(true).forEach((el, key) => seenAnywhere.add(key));
        presentByFixture[fx.name] = Array.from(controls().keys());
      }
      const unknown = Array.from(seenAnywhere).filter(key => !entryOf(registry, key));
      const shownUnknown = window.__undoSweepListAll ? unknown.length : 12; // --preseed : tout lister pour bâtir le registre
      if (unknown.length) problems.push(unknown.length + ' contrôle(s) à classer dans dev-tests/undo-ledger.json : ' + unknown.slice(0, shownUnknown).join(' ; ') + (unknown.length > shownUnknown ? ' ; …' : ''));
      Object.entries(registry.controls).forEach(([pattern, entry]) => {
        const re = globRe(pattern);
        if (!entry.dynamic && !Array.from(seenAnywhere).some(key => re.test(key))) problems.push('entrée périmée, aucun contrôle ne lui correspond : ' + pattern);
      });
      Object.entries(registry.controls).forEach(([pattern, entry]) => {
        if (['model', 'window', 'view'].indexOf(entry.class) === -1 || entry.dynamic) return;
        const fx = FIXTURES.find(f => f.name === entry.start);
        if (!fx) { problems.push(pattern + ' : document de départ inconnu « ' + entry.start + ' »'); return; }
        const re = globRe(pattern);
        if (!presentByFixture[fx.name].some(key => re.test(key))) problems.push(pattern + ' : introuvable dans son document de départ « ' + fx.name + ' »');
      });
      const classes = {};
      Object.values(registry.controls).forEach(entry => { classes[entry.class] = (classes[entry.class] || 0) + 1; });
      return verdict(problems, 'contrôles vus : ' + seenAnywhere.size + ' ; entrées : ' + JSON.stringify(classes));
    },
  });

  FIXTURES.forEach(fx => {
    cases.push({
      id: 'undo_sweep_' + fx.name + '_controls_come_back_with_one_ctrl_z',
      description: 'Document de départ « ' + fx.name + ' » : chaque contrôle `model` ou `window` que le registre y fait essayer change le modèle et UN Ctrl + Z le rend tel qu\'avant (UN Ctrl + Y le remet) ; chaque contrôle `view` ne le change pas',
      run: async (h) => withDialogsStubbed(async () => {
        const registry = await ledger();
        await load(h, fx);
        const only = window.__undoSweepOnly; // pour rejouer un contrôle seul (README : --probe)
        const wanted = triedIn(registry, fx, Array.from(controls().keys())).filter(({ key }) => !only || only.indexOf(key) !== -1);
        const problems = [];
        for (const { key, entry } of wanted) {
          let result;
          try { result = await trial(h, fx, key, entry); } catch (e) { result = { problem: 'erreur : ' + String(e && e.message || e).slice(0, 120) }; }
          if (!result.ok) problems.push(key + ' : ' + result.problem);
        }
        await h.resetEditor();
        return verdict(problems, wanted.length + ' contrôle(s) essayé(s) dans « ' + fx.name + ' »');
      }),
    });
  });

  return cases;
})();
