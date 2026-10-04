// Remplace visuellement #template-select (natif) par un arbre « épinglés + dossiers » (planning/feature-rangement-tri-modeles.md §7). Le <select>
// réel reste l'unique source de vérité (.value, .options, .selectedIndex, évènement 'change') : les appels de js/main.js fonctionnent sans
// modification ; ce module ajoute une couche visuelle synchronisée dans les deux sens (voir attach() pour les quatre pièges évités).
// Périmètre : parcourir, choisir, épingler. Créer un dossier et y ranger un modèle se fait dans js/template-organize-modal.js ; son déclencheur,
// #btn-organize-templates, est créé ici une seule fois (en-tête du panneau, en haut à droite) et js/main.js passe `onOrganize` à attach().
// Les briques de ligne (rowShell, makeGroup, pinButton, appendSections) sont aussi celles de cette fenêtre : une seule structure pour
// css/template-tree-select.css.
const TemplateTreeSelect = (function () {
  const { el, button } = Dom;

  let realSelect = null;
  let wrap, trigger, triggerIcon, triggerLabel, popup;
  // En-tête fixe du panneau (titre + « Organiser ») : créé une fois par attachInner(), render() ne redessine que les lignes en dessous.
  let head, headTitle, organizeBtn, organizeLabel;
  let onOrganize = null;
  let mo = null;
  let outsideClickHandler = null;
  // Dossiers dépliés ou repliés à la main pendant que le panneau est ouvert (chemin -> ouvert ?). Le panneau se redessine en entier à chaque écriture
  // (clic sur une épingle...) : sans cette mémoire, chaque dossier retomberait sur son état par défaut. Vidée à chaque ouverture (openPopup). Map,
  // pas {} : un dossier peut s'appeler « constructor » ou « __proto__ ».
  const folderOverrides = new Map();

  const iconSpan = typeModele => el('span', 'tts-icon tts-icon-' + (typeModele || 'document'));

  function labelFor(tpl) {
    return Templates.isDefault(tpl.id) ? (tpl.nom + ' ★') : tpl.nom;
  }

  // Une ligne de l'arbre, `kind` « folder » ou « leaf » : chevron (dossier seulement), icône, libellé. css/template-tree-select.css en dépend, dans
  // cet ordre.
  function rowShell(kind, depth, typeModele, text) {
    const row = el('div', 'tts-row tts-row-' + kind);
    row.style.setProperty('--tts-depth', String(depth));
    if (kind === 'folder') row.appendChild(el('span', 'tts-folder-caret'));
    row.append(iconSpan(kind === 'folder' ? 'folder' : typeModele), el('span', 'tts-row-label', text));
    return row;
  }

  // Le groupe des enfants d'un dossier : `makeChild(enfant, profondeur)` pour chacun.
  function makeGroup(depth, children, makeChild) {
    const group = el('div', 'tts-group');
    // Profondeur du dossier (pas celle de ses enfants) : css/template-tree-select.css cale le trait guide du groupe sur le caret de CE dossier ;
    // posée explicitement, sinon le groupe hériterait de celle du groupe parent.
    group.style.setProperty('--tts-depth', String(depth));
    children.forEach(child => group.appendChild(makeChild(child, depth + 1)));
    return group;
  }

  // Le bouton épingle d'une ligne de modèle. Info-bulle native (le panneau et la fenêtre « Organiser » vivent hors de #toolbar-top : le [data-tip] de
  // la barre ne s'y applique pas) : elle dit ce que fait le clic dans l'état courant, pour ne pas le confondre avec l'étoile « modèle par défaut »
  // de la barre.
  function pinButton(pinned) {
    const pin = button('tts-pin-btn');
    pin.classList.toggle('is-pinned', pinned);
    pin.setAttribute('aria-pressed', String(pinned));
    pin.setAttribute('aria-label', I18n.t('templateTree.pin.aria'));
    pin.title = I18n.t(pinned ? 'templateTree.unpin.tip' : 'templateTree.pin.tip');
    return pin;
  }

  // Les deux sections de la liste : « Épinglés » (à plat), puis « Tous les modèles » (l'arbre), chacune seulement si elle a des lignes.
  function appendSections(container, view, makePinnedRow, makeTreeRow) {
    const section = (titleKey, nodes, makeRow) => {
      if (!nodes.length) return;
      container.appendChild(el('div', 'tts-section-label', I18n.t(titleKey)));
      nodes.forEach(node => container.appendChild(makeRow(node)));
    };
    section('templateTree.pinnedSection', view.pinned, makePinnedRow);
    section('templateTree.allSection', view.tree, makeTreeRow);
  }

  function makeRow(node, depth) {
    return node.type === 'dossier' ? makeFolderRow(node, depth) : makeLeafRow(node, depth);
  }

  // Un dossier s'ouvre déplié, sauf si cette personne l'a réglé « replié par défaut » (TemplatePreferences.isFolderCollapsed, posé depuis « Organiser
  // mes modèles ») ou l'a basculé à la main depuis l'ouverture du panneau.
  function isFolderOpen(chemin) {
    if (folderOverrides.has(chemin)) return folderOverrides.get(chemin);
    return !TemplatePreferences.isFolderCollapsed(chemin);
  }

  function makeFolderRow(node, depth) {
    const open = isFolderOpen(node.chemin);
    const row = rowShell('folder', depth, null, node.nom);
    row.setAttribute('role', 'treeitem');
    row.setAttribute('aria-expanded', String(open));
    row.dataset.folderPath = node.chemin;
    row.tabIndex = -1;
    const group = makeGroup(depth, node.enfants, makeRow);
    group.setAttribute('role', 'group');
    group.classList.toggle('is-collapsed', !open);
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFolder(row, group);
    });

    // Fragment plutôt qu'un <div> englobant : `group` doit rester le frère direct de la ligne (toggleFolder et la navigation clavier ArrowRight/Left
    // lisent row.nextElementSibling).
    const fragment = document.createDocumentFragment();
    fragment.append(row, group);
    return fragment;
  }

  function toggleFolder(row, group) {
    const expanded = row.getAttribute('aria-expanded') !== 'false';
    row.setAttribute('aria-expanded', String(!expanded));
    group.classList.toggle('is-collapsed', expanded);
    if (row.dataset.folderPath) folderOverrides.set(row.dataset.folderPath, !expanded);
  }

  function makeLeafRow(node, depth) {
    const row = rowShell('leaf', depth, node.typeModele, labelFor(node));
    row.setAttribute('role', 'treeitem');
    row.tabIndex = -1;
    row.dataset.templateId = String(node.id);
    if (String(realSelect.value) === String(node.id)) row.setAttribute('aria-selected', 'true');

    const pinned = TemplatePreferences.isPinned(node.id);
    const pinBtn = pinButton(pinned);
    // -1 : un <button> est un arrêt de tabulation natif, ce qui casserait le focus roulant de l'arbre (Tab sortirait de la ligne vers ce bouton au
    // lieu de sortir du widget). Pas de raccourci clavier pour épingler : seule la souris y accède.
    pinBtn.tabIndex = -1;
    pinBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        // setPinned() ne lève pas pour une identification indisponible (repli anonyme) ; seule une vraie panne d'écriture Grist atterrit ici.
        await TemplatePreferences.setPinned(node.id, !pinned);
        render();
      } catch (err) {
        console.error('[template-tree-select] échec épinglage', err);
      }
    });
    row.appendChild(pinBtn);

    row.addEventListener('click', () => selectValue(node.id));
    return row;
  }

  function render() {
    // Un ré-affichage pendant que le popup est ouvert (clic sur une épingle) reconstruit tout popup.innerHTML : sans ceci, la ligne qui avait le
    // focus clavier roulant disparaîtrait et le focus retomberait sur <body>, cassant la navigation clavier.
    let focusedId;
    if (popup.contains(document.activeElement)) {
      const focusedRow = document.activeElement.closest('.tts-row');
      if (focusedRow) focusedId = focusedRow.dataset.templateId;
    }
    // Seules les lignes sont redessinées : l'en-tête (titre et « Organiser ») reste en place, avec son id et son focus.
    Array.from(popup.children).forEach((child) => { if (child !== head) popup.removeChild(child); });

    // Pas de ligne « — Nouveau modèle — » (value '') : le bouton « + » de la barre sert à ça. La 1re <option> du <select> réel reste : c'est l'état «
    // modèle pas encore enregistré », que le déclencheur affiche. L'arbre vient des mêmes données que ce <select> (Templates.getCached(),
    // TemplatePreferences.getCached()), pas de ses <option> : elles ne portent ni typeModele ni le statut « par défaut » en donnée structurée,
    // seulement un texte déjà mis en forme par refreshTemplateList (js/main.js).
    const view = TemplateOrganizer.buildView(Templates.getCached(), TemplatePreferences.getCached());

    if (!view.pinned.length && !view.tree.length) popup.appendChild(el('div', 'tts-empty', I18n.t('templateTree.empty')));
    appendSections(popup, view, p => makeLeafRow(p, 0), n => makeRow(n, 0));

    syncTriggerLabel();
    syncDisabledState();

    if (focusedId !== undefined) {
      const toRefocus = popup.querySelector('.tts-row[data-template-id="' + CSS.escape(focusedId) + '"]');
      if (toRefocus) setRovingFocus(toRefocus);
    }
  }

  // Synchronisation du déclencheur avec le <select> réel
  function syncTriggerLabel() {
    const id = realSelect.value;
    const tpl = Templates.byId(id);
    triggerIcon.className = 'tts-icon tts-icon-' + (tpl ? (tpl.typeModele || 'document') : 'new');
    // Le libellé suit l'<option> choisie, pas seulement le cache : « Renommer » (js/main.js) ne change que le texte de l'option tant que le modèle
    // n'est pas enregistré, et le nouveau nom doit se voir tout de suite.
    const opt = realSelect.options[realSelect.selectedIndex];
    triggerLabel.textContent = tpl ? ((opt && opt.value !== '' && opt.textContent) || labelFor(tpl)) : I18n.t('template.newOption');
    popup.querySelectorAll('.tts-row[aria-selected]').forEach((r) => r.removeAttribute('aria-selected'));
    const row = popup.querySelector('.tts-row-leaf[data-template-id="' + CSS.escape(String(id)) + '"]');
    if (row) row.setAttribute('aria-selected', 'true');
  }

  function syncDisabledState() {
    trigger.disabled = !!realSelect.disabled;
    // « Renommer » (js/main.js) pose hidden sur le <select> réel pour faire apparaître le champ du nom à sa place. Son display:none permanent le rend
    // déjà invisible : c'est donc le déclencheur qui doit suivre, sinon le champ s'ouvrirait à côté de la liste.
    wrap.hidden = !!realSelect.hidden;
    if (realSelect.hidden) closePopup();
  }

  // Redéfinit l'accesseur `value` sur cette instance de <select> : seule façon fiable de détecter les écritures directes `templateSelect.value = ...`
  // de js/main.js sans modifier ce code. Ces écritures ne déclenchent pas d'évènement 'change' natif (réservé aux interactions de la personne) : les
  // écouter laisserait l'arbre désynchronisé du <select>.
  function interceptValueWrites(el, onChange) {
    let proto = Object.getPrototypeOf(el);
    let desc;
    while (proto && !desc) {
      desc = Object.getOwnPropertyDescriptor(proto, 'value');
      proto = Object.getPrototypeOf(proto);
    }
    if (!desc || !desc.set) return;  // ne doit jamais lever à l'attache
    Object.defineProperty(el, 'value', {
      configurable: true,
      enumerable: desc.enumerable,
      get() { return desc.get.call(el); },
      set(v) { desc.set.call(el, v); onChange(); },
    });
  }

  function selectValue(id) {
    if (String(realSelect.value) === String(id)) { closePopup(); trigger.focus({ preventScroll: true }); return; }
    realSelect.value = id; // passe par interceptValueWrites -> syncTriggerLabel() immédiat
    realSelect.dispatchEvent(new Event('change', { bubbles: true }));
    closePopup();
    trigger.focus({ preventScroll: true });
  }

  // Ouverture, fermeture et navigation clavier (patron WAI-ARIA « Tree View »)
  // Une ligne est visible si aucun de ses groupes ancêtres n'est replié.
  function visibleRows() {
    return Array.from(popup.querySelectorAll('.tts-row')).filter(row => !row.closest('.tts-group.is-collapsed'));
  }

  function setRovingFocus(row) {
    popup.querySelectorAll('.tts-row[tabindex="0"]').forEach((r) => r.setAttribute('tabindex', '-1'));
    if (!row) return;
    row.setAttribute('tabindex', '0');
    // preventScroll : le focus automatique à l'ouverture ne doit pas faire défiler un ancêtre pour « révéler » la ligne (il masquait le déclencheur
    // derrière #v2-title-cluster avant que le panneau soit détaché en position: fixed).
    row.focus({ preventScroll: true });
  }

  // Calé sur le rect réel du déclencheur (le panneau vit dans document.body, voir .tts-popup dans le CSS). Mesuré après classList.add('is-open')
  // (display:none n'a pas de taille) pour pouvoir caler `left` en cas de débordement à droite.
  function positionPopup() {
    const rect = trigger.getBoundingClientRect();
    popup.style.top = (rect.bottom + 4) + 'px';
    popup.style.left = rect.left + 'px';
    // Même correction sur l'axe vertical : un panneau Grist descend vers 700x400, et le max-height:360px fixe du CSS dépassait le bas de la fenêtre,
    // rognant la dernière ligne sans défilement possible. Borné sur la place réellement disponible sous le déclencheur, jamais plus que le max-height
    // CSS. -10 : max-height vise la boîte de contenu (pas de box-sizing:border-box sur .tts-popup), la bordure et le padding (1px + 4px de chaque
    // côté) s'ajoutent par-dessus.
    popup.style.maxHeight = Math.max(80, Math.min(360, window.innerHeight - rect.bottom - 12 - 10)) + 'px';
    const popupRect = popup.getBoundingClientRect();
    const overflowRight = popupRect.right - (window.innerWidth - 8);
    if (overflowRight > 0) popup.style.left = Math.max(8, rect.left - overflowRight) + 'px';
  }

  let outsideScrollHandler = null;
  function openPopup() {
    if (popup.classList.contains('is-open')) return;
    folderOverrides.clear();  // chaque ouverture repart de l'état par défaut de la personne (voir folderOverrides)
    render();
    popup.classList.add('is-open');
    positionPopup();
    Layers.raise(popup); // au-dessus d'une barre flottante de tableau ou d'image et des menus déjà ouverts (js/layers.js)
    trigger.setAttribute('aria-expanded', 'true');
    const rows = visibleRows();
    const selected = rows.find((r) => r.getAttribute('aria-selected') === 'true') || rows[0];
    // Aucun modèle : le focus va sur « Organiser », sinon Échap ne serait plus capté par le panneau (le focus resterait sur le déclencheur).
    if (selected) setRovingFocus(selected);
    else if (organizeBtn) organizeBtn.focus({ preventScroll: true });
    // Le navigateur garde le scrollTop de .tts-popup d'une fermeture à l'autre (overflow-y:auto) : sans repositionnement explicite, rouvrir après
    // avoir défilé montrait d'autres lignes que celles attendues en haut, et un clic retombait sur le déclencheur. scrollIntoView() est évité : il
    // peut faire défiler un ancêtre (page Grist) et pas seulement .tts-popup.
    if (selected) {
      const desired = selected.offsetTop - (popup.clientHeight - selected.offsetHeight) / 2;
      popup.scrollTop = Math.max(0, Math.min(desired, popup.scrollHeight - popup.clientHeight));
    } else {
      popup.scrollTop = 0;
    }
    outsideClickHandler = (e) => { if (!wrap.contains(e.target) && !popup.contains(e.target)) closePopup(); };
    document.addEventListener('mousedown', outsideClickHandler, true);
    // Un panneau en position: fixed ne suit pas un ancêtre qui défile (page Grist, panneau latéral) : on le referme plutôt que de le laisser flotter
    // ailleurs que son déclencheur (capture: true pour attraper le scroll de n'importe quel ancêtre). .tts-popup a lui-même overflow-y:auto : son
    // propre défilement est aussi capté en phase de capture, d'où le garde ci-dessous ; sans lui, faire défiler la liste (molette, barre, PageDown)
    // la refermait aussitôt et rendait inaccessibles les modèles hors de la hauteur visible.
    outsideScrollHandler = (e) => { if (popup.contains(e.target)) return; closePopup(); };
    window.addEventListener('scroll', outsideScrollHandler, true);
  }

  function closePopup() {
    if (!popup.classList.contains('is-open')) return;
    popup.classList.remove('is-open');
    trigger.setAttribute('aria-expanded', 'false');
    if (outsideClickHandler) { document.removeEventListener('mousedown', outsideClickHandler, true); outsideClickHandler = null; }
    if (outsideScrollHandler) { window.removeEventListener('scroll', outsideScrollHandler, true); outsideScrollHandler = null; }
  }

  const leaveForTrigger = () => { closePopup(); trigger.focus({ preventScroll: true }); };
  const isFolderRow = row => row.classList.contains('tts-row-folder');
  const toggleFolderRow = row => toggleFolder(row, row.nextElementSibling);
  // Entrée et Espace : un dossier se replie ou se déplie, une ligne de modèle se choisit.
  function activateRow(e, { current }) {
    if (!current) return;
    e.preventDefault();
    if (isFolderRow(current)) toggleFolderRow(current);
    else selectValue(current.dataset.templateId);
  }

  // Les touches du panneau, une fonction chacune : elle reçoit l'évènement et { rows (les lignes visibles), current (la ligne qui a le focus, à
  // défaut la première), idx (son rang) } et appelle preventDefault quand elle prend la touche : une touche non prise reste au navigateur. Droite et
  // Gauche suivent le patron WAI-ARIA « Tree View » : Droite ouvre un dossier fermé et entre dans un dossier ouvert (1er enfant) ; Gauche referme un
  // dossier ouvert, sinon remonte au dossier parent.
  const ROW_KEYS = {
    Escape: e => { e.preventDefault(); leaveForTrigger(); },
    // Tab : le panneau vit dans document.body, pas juste après le déclencheur, donc l'ordre naturel du DOM atterrirait n'importe où avec le panneau
    // resté ouvert. Pas de preventDefault : on referme et on redonne le focus au déclencheur avant que le navigateur poursuive son Tab, qui part
    // alors de la place du déclencheur dans la barre.
    Tab: leaveForTrigger,
    ArrowDown: (e, { rows, idx }) => { e.preventDefault(); setRovingFocus(rows[Math.min(idx + 1, rows.length - 1)]); },
    ArrowUp: (e, { rows, idx }) => {
      e.preventDefault();
      if (idx <= 0 && organizeBtn) organizeBtn.focus({ preventScroll: true });
      else setRovingFocus(rows[Math.max(idx - 1, 0)]);
    },
    Home: (e, { rows }) => { e.preventDefault(); setRovingFocus(rows[0]); },
    End: (e, { rows }) => { e.preventDefault(); setRovingFocus(rows[rows.length - 1]); },
    ArrowRight: (e, { current }) => {
      if (!current || !isFolderRow(current)) return;
      e.preventDefault();
      if (current.getAttribute('aria-expanded') === 'false') { toggleFolderRow(current); return; }
      const firstChild = current.nextElementSibling && current.nextElementSibling.querySelector('.tts-row');
      if (firstChild) setRovingFocus(firstChild);
    },
    ArrowLeft: (e, { current }) => {
      if (!current) return;
      e.preventDefault();
      if (isFolderRow(current) && current.getAttribute('aria-expanded') !== 'false') { toggleFolderRow(current); return; }
      const parentGroup = current.closest('.tts-group');
      const parentRow = parentGroup && parentGroup.previousElementSibling;
      if (parentRow && parentRow.classList.contains('tts-row')) setRovingFocus(parentRow);
    },
    Enter: activateRow,
    ' ': activateRow,
  };
  // « Organiser » (en-tête) fait partie du parcours : Flèche haut depuis la première ligne l'atteint, Flèche bas le quitte pour la première ligne,
  // Fin pour la dernière. Les autres flèches, Début compris, ne bougent rien mais restent à la liste ; Entrée et Espace restent au clic natif du
  // bouton ; Échap et Tab s'y traitent comme depuis une ligne.
  const keepKey = e => e.preventDefault();
  const leaveKey = () => {};
  const ORGANIZE_KEYS = {
    ArrowDown: ROW_KEYS.Home, End: ROW_KEYS.End,
    ArrowUp: keepKey, Home: keepKey, ArrowLeft: keepKey, ArrowRight: keepKey,
    Enter: leaveKey, ' ': leaveKey,
  };

  function onPopupKeydown(e) {
    const action = (organizeBtn && document.activeElement === organizeBtn && ORGANIZE_KEYS[e.key]) || ROW_KEYS[e.key];
    if (!action) return;
    const rows = visibleRows();
    const current = document.activeElement && document.activeElement.classList.contains('tts-row') ? document.activeElement : rows[0];
    action(e, { rows, current, idx: rows.indexOf(current) });
  }

  // Attache et détache
  function attach(select, options) {
    if (realSelect) detach();
    realSelect = select;
    // Gardé d'un attach() à l'autre quand on n'en repasse pas : la même vue rattachée sans options (après un échec, dev-tests) continue d'ouvrir
    // « Organiser ».
    if (options && typeof options.onOrganize === 'function') onOrganize = options.onOrganize;

    // Piège 4 : le <select> réel est masqué (classe, tabIndex, aria-hidden ci-dessous) avant que le reste d'attach() (construction de l'arbre,
    // render() qui lit Grist et peut lever sur une donnée inattendue) ait fini. Le try/catch de js/main.js empêche l'exception de casser init(), mais
    // sans repli ici le <select> resterait masqué sans arbre à sa place : plus aucun moyen de choisir un modèle. En cas d'échec, detach() annule ce
    // qu'attach() a fait et rend le <select> natif utilisable, puis l'exception est relayée.
    try {
      attachInner();
    } catch (err) {
      detach();
      throw err;
    }
  }

  function attachInner() {
    // Piège 1 : `hidden` seul peut être vaincu par une règle CSS `display` plus spécifique (bandeau email resté affiché). Le <select> réel passe donc
    // en display:none permanent par une classe dédiée avec !important (css/template-tree-select.css), jamais par l'attribut hidden.
    realSelect.classList.add('tts-native-select');
    // Piège 2 : un élément seulement masqué visuellement reste focusable et annoncé par un lecteur d'écran. display:none règle déjà ce point ;
    // tabIndex -1 est une seconde barrière si une règle CSS affaiblissait display:none.
    realSelect.tabIndex = -1;
    realSelect.setAttribute('aria-hidden', 'true');

    wrap = el('span', 'tts-wrap');
    realSelect.parentNode.insertBefore(wrap, realSelect.nextSibling);

    trigger = button('tts-trigger');
    trigger.setAttribute('aria-haspopup', 'tree');
    trigger.setAttribute('aria-expanded', 'false');
    triggerIcon = iconSpan('new');
    triggerLabel = el('span', 'tts-trigger-label');
    trigger.append(triggerIcon, triggerLabel, el('span', 'tts-caret'));
    // e.detail (nombre de clics du geste : 2 pour un vrai double-clic) distingue un double-clic natif d'un second clic délibéré (rouvrir puis
    // refermer, ce que font les tests avec deux clics synthétiques à detail=0). Sans ce garde, le réflexe du <select> natif (double-clic pour
    // choisir) ouvrait puis refermait aussitôt le panneau. Une minuterie fixe (ignorer un clic dans les 250 ms) avait été écartée : elle cassait
    // aussi une fermeture délibérée rapide.
    trigger.addEventListener('click', (e) => {
      if (popup.classList.contains('is-open')) {
        if (e.detail >= 2) return;
        closePopup();
      } else {
        openPopup();
      }
    });
    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPopup(); }
    });

    popup = el('div', 'tts-popup');
    popup.setAttribute('role', 'tree');
    popup.setAttribute('aria-label', I18n.t('template.select'));
    popup.addEventListener('keydown', onPopupKeydown);

    // En-tête fixe : titre à gauche, « Organiser mes modèles » en haut à droite. tabIndex -1 : on y arrive par Flèche haut depuis la première ligne
    // (onPopupKeydown), pas par Tab, qui referme le panneau. Le clic referme le panneau et rend le focus au déclencheur avant d'ouvrir la fenêtre :
    // celle-ci le rendra à la fermeture, et le bouton, masqué avec le panneau, ne peut pas le recevoir.
    head = el('div', 'tts-head');
    headTitle = el('span', 'tts-head-title');
    organizeBtn = button('tts-organize-btn');
    organizeBtn.id = 'btn-organize-templates';
    organizeBtn.tabIndex = -1;
    organizeLabel = el('span', 'tts-organize-label');
    organizeBtn.append(iconSpan('organize'), organizeLabel);
    organizeBtn.addEventListener('click', () => {
      closePopup();
      trigger.focus({ preventScroll: true });
      if (onOrganize) onOrganize();
    });
    head.append(headTitle, organizeBtn);
    popup.appendChild(head);
    syncHeadTexts();

    wrap.appendChild(trigger);
    // popup rattaché à document.body, pas à wrap (rognage par #v2-title-cluster { overflow: hidden }, voir .tts-popup dans
    // css/template-tree-select.css). Repositionné à chaque ouverture (openPopup()).
    document.body.appendChild(popup);

    interceptValueWrites(realSelect, () => { syncTriggerLabel(); });

    // Piège 3 : refreshTemplateList() (js/main.js) reconstruit tout le innerHTML du <select> sans toujours réécrire `.value` ensuite :
    // childList/subtree capte cette reconstruction, que l'interception de `.value` ne voit pas.
    mo = new MutationObserver((mutations) => {
      const structural = mutations.some((m) => m.type === 'childList');
      const attrChanged = mutations.some((m) => m.type === 'attributes');
      if (structural) render();
      else if (attrChanged) syncDisabledState();
    });
    mo.observe(realSelect, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'hidden'] });

    render();
  }

  function detach() {
    if (!realSelect) return;
    if (mo) { mo.disconnect(); mo = null; }
    if (outsideClickHandler) { document.removeEventListener('mousedown', outsideClickHandler, true); outsideClickHandler = null; }
    if (outsideScrollHandler) { window.removeEventListener('scroll', outsideScrollHandler, true); outsideScrollHandler = null; }
    if (wrap) wrap.remove();
    // popup n'est plus un enfant de wrap (il est dans document.body) : le retirer explicitement, sinon un futur attach() en recréerait un second en
    // laissant l'ancien orphelin.
    if (popup) popup.remove();
    realSelect.classList.remove('tts-native-select');
    realSelect.removeAttribute('aria-hidden');
    realSelect.tabIndex = 0;
    realSelect = wrap = trigger = triggerIcon = triggerLabel = popup = head = headTitle = organizeBtn = organizeLabel = null;
  }

  function syncHeadTexts() {
    if (!head) return;
    headTitle.textContent = I18n.t('templateTree.title');
    organizeLabel.textContent = I18n.t('templateTree.organize');
    organizeBtn.title = I18n.t('toolbar.organizeTemplates');
    organizeBtn.setAttribute('aria-label', I18n.t('toolbar.organizeTemplates'));
  }

  // Force un nouveau rendu depuis les données actuelles : utile après TemplatePreferences.loadForCurrentUser(), qui résout après le premier
  // attach()/render() (identification asynchrone).
  function refresh() { if (realSelect) render(); }

  // Abonnement unique au niveau module (pas dans attach()) : I18n.onChange() ne permet pas de se désabonner, un ré-abonnement par attach()/detach()
  // empilerait des écouteurs fantômes. La garde `if (popup)` le rend inoffensif tant que rien n'est attaché.
  I18n.onChange(() => {
    if (popup) { popup.setAttribute('aria-label', I18n.t('template.select')); syncHeadTexts(); render(); }
  });

  return { attach, refresh, iconSpan, rowShell, makeGroup, pinButton, appendSections };
})();
