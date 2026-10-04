// Remplace visuellement #template-select (natif) par un arbre « épinglés + dossiers » (planning/feature-rangement-tri-modeles.md §7). Le <select>
// réel reste l'unique source de vérité (.value, .options, .selectedIndex, évènement 'change') : les appels de js/main.js fonctionnent sans
// modification ; ce module ajoute une couche visuelle synchronisée dans les deux sens (voir attach() pour les quatre pièges évités).
// Périmètre : parcourir, choisir, épingler. Créer un dossier et y ranger un modèle se fait dans js/template-organize-modal.js ; son déclencheur,
// #btn-organize-templates, est créé ici une seule fois (en-tête du panneau, en haut à droite) et js/main.js passe `onOrganize` à attach().
const TemplateTreeSelect = (function () {
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

  function iconSpan(typeModele) {
    const span = document.createElement('span');
    span.className = 'tts-icon tts-icon-' + (typeModele || 'document');
    return span;
  }

  function labelFor(tpl) {
    const isDefault = tpl.id != null && String(Templates.getDefaultId()) === String(tpl.id);
    return isDefault ? (tpl.nom + ' ★') : tpl.nom;
  }

  // Arbre affiché, à partir des mêmes données que le <select> réel (Templates.getCached(), TemplatePreferences.getCached()) et non de ses <option> :
  // celles-ci ne portent ni typeModele ni le statut « par défaut » en donnée structurée, seulement un texte déjà mis en forme par refreshTemplateList
  // (js/main.js).
  function currentTemplates() {
    return (typeof Templates !== 'undefined' && Templates.getCached()) || [];
  }
  function currentPreferences() {
    return (typeof TemplatePreferences !== 'undefined' && TemplatePreferences.getCached()) || {};
  }

  function makeRow(node, depth) {
    if (node.type === 'dossier') return makeFolderRow(node, depth);
    return makeLeafRow(node, depth);
  }

  // Un dossier s'ouvre déplié, sauf si CETTE personne l'a réglé « replié par défaut » (TemplatePreferences.isFolderCollapsed, posé depuis « Organiser
  // mes modèles ») ou l'a basculé à la main depuis l'ouverture du panneau.
  function isFolderOpen(chemin) {
    if (folderOverrides.has(chemin)) return folderOverrides.get(chemin);
    return !(typeof TemplatePreferences !== 'undefined' && TemplatePreferences.isFolderCollapsed(chemin));
  }

  function makeFolderRow(node, depth) {
    const li = document.createElement('div');
    li.className = 'tts-row tts-row-folder';
    li.setAttribute('role', 'treeitem');
    const open = isFolderOpen(node.chemin);
    li.setAttribute('aria-expanded', open ? 'true' : 'false');
    li.dataset.folderPath = node.chemin;
    li.setAttribute('tabindex', '-1');
    li.style.setProperty('--tts-depth', String(depth));
    const caret = document.createElement('span');
    caret.className = 'tts-folder-caret';
    const icon = document.createElement('span');
    icon.className = 'tts-icon tts-icon-folder';
    const label = document.createElement('span');
    label.className = 'tts-row-label';
    label.textContent = node.nom;
    li.appendChild(caret);
    li.appendChild(icon);
    li.appendChild(label);

    const group = document.createElement('div');
    group.className = 'tts-group';
    // Profondeur du dossier (pas celle de ses enfants) : css/template-tree-select.css cale le trait guide du groupe sur le caret de CE dossier ;
    // posée explicitement, sinon le groupe hériterait de celle du groupe parent.
    group.style.setProperty('--tts-depth', String(depth));
    group.setAttribute('role', 'group');
    group.classList.toggle('is-collapsed', !open);
    node.enfants.forEach((child) => group.appendChild(makeRow(child, depth + 1)));

    li.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFolder(li, group);
    });

    // Fragment plutôt qu'un <div> englobant : `group` doit rester le frère direct de `li` (toggleFolder et la navigation clavier ArrowRight/Left
    // lisent li.nextElementSibling).
    const fragment = document.createDocumentFragment();
    fragment.appendChild(li);
    fragment.appendChild(group);
    return fragment;
  }

  function toggleFolder(li, group) {
    const expanded = li.getAttribute('aria-expanded') !== 'false';
    li.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    group.classList.toggle('is-collapsed', expanded);
    if (li.dataset.folderPath) folderOverrides.set(li.dataset.folderPath, !expanded);
  }

  function makeLeafRow(node, depth) {
    const li = document.createElement('div');
    li.className = 'tts-row tts-row-leaf';
    li.setAttribute('role', 'treeitem');
    li.setAttribute('tabindex', '-1');
    li.dataset.templateId = String(node.id);
    li.style.setProperty('--tts-depth', String(depth));
    if (String(realSelect.value) === String(node.id)) li.setAttribute('aria-selected', 'true');

    li.appendChild(iconSpan(node.typeModele));
    const label = document.createElement('span');
    label.className = 'tts-row-label';
    label.textContent = labelFor({ id: node.id, nom: node.nom });
    li.appendChild(label);

    const pinBtn = document.createElement('button');
    pinBtn.type = 'button';
    pinBtn.className = 'tts-pin-btn';
    // -1 : un <button> est un arrêt de tabulation natif, ce qui casserait le focus roulant de l'arbre (Tab sortirait de la ligne vers ce bouton au
    // lieu de sortir du widget). Pas de raccourci clavier pour épingler : seule la souris y accède.
    pinBtn.tabIndex = -1;
    const prefs = currentPreferences();
    const pinned = !!(prefs[node.id] && prefs[node.id].epingle);
    pinBtn.classList.toggle('is-pinned', pinned);
    pinBtn.setAttribute('aria-pressed', String(pinned));
    pinBtn.setAttribute('aria-label', I18n.t('templateTree.pin.aria'));
    // Info-bulle native (le panneau vit dans document.body, hors de #toolbar-top : le [data-tip] de la barre ne s'y applique pas) : dit ce que fait
    // le clic dans l'état courant, pour ne pas le confondre avec l'étoile « modèle par défaut » de la barre.
    pinBtn.title = I18n.t(pinned ? 'templateTree.unpin.tip' : 'templateTree.pin.tip');
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
    li.appendChild(pinBtn);

    li.addEventListener('click', () => selectValue(node.id));
    return li;
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
    // modèle pas encore enregistré », que le déclencheur affiche.
    const view = TemplateOrganizer.buildView(currentTemplates(), currentPreferences());

    if (!view.pinned.length && !view.tree.length) {
      const empty = document.createElement('div');
      empty.className = 'tts-empty';
      empty.textContent = I18n.t('templateTree.empty');
      popup.appendChild(empty);
    }

    if (view.pinned.length) {
      const sep = document.createElement('div');
      sep.className = 'tts-section-label';
      sep.textContent = I18n.t('templateTree.pinnedSection');
      popup.appendChild(sep);
      view.pinned.forEach((p) => popup.appendChild(makeLeafRow({ id: p.id, nom: p.nom, typeModele: p.typeModele }, 0)));
    }

    if (view.tree.length) {
      const sep = document.createElement('div');
      sep.className = 'tts-section-label';
      sep.textContent = I18n.t('templateTree.allSection');
      popup.appendChild(sep);
      view.tree.forEach((n) => popup.appendChild(makeRow(n, 0)));
    }

    syncTriggerLabel();
    syncDisabledState();

    if (focusedId !== undefined) {
      const toRefocus = popup.querySelector('.tts-row[data-template-id="' + CSS.escape(focusedId) + '"]');
      if (toRefocus) setRovingFocus(toRefocus);
    }
  }

  // Synchronisation du déclencheur avec le <select> réel
  function findTemplateById(id) {
    if (id === '' || id == null) return null;
    return currentTemplates().find((t) => String(t.id) === String(id)) || null;
  }

  function syncTriggerLabel() {
    const id = realSelect.value;
    const tpl = findTemplateById(id);
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

  // Redéfinit l'accesseur `value` sur CETTE instance de <select> : seule façon fiable de détecter les écritures directes `templateSelect.value = ...`
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
  function visibleRows() {
    return Array.from(popup.querySelectorAll('.tts-row')).filter((r) => {
      // Une ligne est visible si aucun de ses groupes ancêtres n'est collapsed.
      let ancestorGroup = r.closest('.tts-group');
      while (ancestorGroup) {
        if (ancestorGroup.classList.contains('is-collapsed')) return false;
        ancestorGroup = ancestorGroup.parentElement && ancestorGroup.parentElement.closest('.tts-group');
      }
      return true;
    });
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

  function onPopupKeydown(e) {
    const rows = visibleRows();
    // « Organiser » (en-tête) fait partie du parcours au clavier : Flèche haut depuis la première ligne l'atteint, Flèche bas le quitte pour la
    // première ligne. Entrée et Espace restent au clic natif du bouton ; Échap et Tab sont traités plus bas comme depuis une ligne.
    if (organizeBtn && document.activeElement === organizeBtn) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setRovingFocus(rows[0]); return; }
      if (e.key === 'End') { e.preventDefault(); setRovingFocus(rows[rows.length - 1]); return; }
      if (e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); return; }
      if (e.key === 'Enter' || e.key === ' ') return;
    }
    const current = document.activeElement && document.activeElement.classList.contains('tts-row') ? document.activeElement : rows[0];
    const idx = rows.indexOf(current);
    if (e.key === 'Escape') { e.preventDefault(); closePopup(); trigger.focus({ preventScroll: true }); return; }
    // Tab : le panneau vit dans document.body, pas juste après le déclencheur, donc l'ordre naturel du DOM atterrirait n'importe où avec le popup
    // resté ouvert. Pas de preventDefault : on referme et on redonne le focus au déclencheur avant que le navigateur poursuive son Tab, qui part
    // alors du déclencheur (sa place dans la barre).
    if (e.key === 'Tab') { closePopup(); trigger.focus({ preventScroll: true }); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setRovingFocus(rows[Math.min(idx + 1, rows.length - 1)]); return; }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (idx <= 0 && organizeBtn) organizeBtn.focus({ preventScroll: true });
      else setRovingFocus(rows[Math.max(idx - 1, 0)]);
      return;
    }
    if (e.key === 'Home') { e.preventDefault(); setRovingFocus(rows[0]); return; }
    if (e.key === 'End') { e.preventDefault(); setRovingFocus(rows[rows.length - 1]); return; }
    // Patron WAI-ARIA « Tree View » : Droite ouvre un dossier fermé, entre dans un dossier ouvert (1er enfant) ; Gauche referme un dossier ouvert,
    // sinon remonte au dossier parent.
    if (e.key === 'ArrowRight' && current && current.classList.contains('tts-row-folder')) {
      e.preventDefault();
      if (current.getAttribute('aria-expanded') === 'false') {
        toggleFolder(current, current.nextElementSibling);
      } else {
        const firstChild = current.nextElementSibling && current.nextElementSibling.querySelector('.tts-row');
        if (firstChild) setRovingFocus(firstChild);
      }
      return;
    }
    if (e.key === 'ArrowLeft' && current) {
      e.preventDefault();
      if (current.classList.contains('tts-row-folder') && current.getAttribute('aria-expanded') !== 'false') {
        toggleFolder(current, current.nextElementSibling);
      } else {
        const parentGroup = current.closest('.tts-group');
        const parentRow = parentGroup && parentGroup.previousElementSibling;
        if (parentRow && parentRow.classList.contains('tts-row')) setRovingFocus(parentRow);
      }
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && current) {
      e.preventDefault();
      if (current.classList.contains('tts-row-folder')) toggleFolder(current, current.nextElementSibling);
      else selectValue(current.dataset.templateId);
    }
  }

  // Attache et détache
  function attach(select, options) {
    if (realSelect) detach();
    realSelect = select;
    // Gardé d'un attach() à l'autre quand on n'en repasse pas : la même vue rattachée sans options (après un échec, dev-tests) continue d'ouvrir « Organiser ».
    if (options && typeof options.onOrganize === 'function') onOrganize = options.onOrganize;

    // Piège 4 : le <select> réel est masqué (classe, tabIndex, aria-hidden ci-dessous) avant que le reste d'attach() (construction de l'arbre,
    // render() qui lit Grist et peut lever sur une donnée inattendue) ait fini. Le try/catch de js/main.js empêche l'exception de casser init(), mais
    // sans repli ici le <select> resterait masqué sans arbre à sa place : plus aucun moyen de choisir un modèle. En cas d'échec, on annule ce
    // qu'attach() a fait (retire wrap et popup, arrête le MutationObserver), on rend le <select> natif utilisable, puis on relaie l'exception.
    try {
      attachInner();
    } catch (err) {
      if (mo) { mo.disconnect(); mo = null; }
      if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
      if (popup && popup.parentNode) popup.parentNode.removeChild(popup);
      if (realSelect) {
        realSelect.classList.remove('tts-native-select');
        realSelect.removeAttribute('aria-hidden');
        realSelect.tabIndex = 0;
      }
      realSelect = wrap = trigger = triggerIcon = triggerLabel = popup = head = headTitle = organizeBtn = organizeLabel = null;
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

    wrap = document.createElement('span');
    wrap.className = 'tts-wrap';
    realSelect.parentNode.insertBefore(wrap, realSelect.nextSibling);

    trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'tts-trigger';
    trigger.setAttribute('aria-haspopup', 'tree');
    trigger.setAttribute('aria-expanded', 'false');
    triggerIcon = iconSpan('new');
    triggerLabel = document.createElement('span');
    triggerLabel.className = 'tts-trigger-label';
    const caret = document.createElement('span');
    caret.className = 'tts-caret';
    trigger.appendChild(triggerIcon);
    trigger.appendChild(triggerLabel);
    trigger.appendChild(caret);
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

    popup = document.createElement('div');
    popup.className = 'tts-popup';
    popup.setAttribute('role', 'tree');
    popup.setAttribute('aria-label', I18n.t('template.select'));
    popup.addEventListener('keydown', onPopupKeydown);

    // En-tête fixe : titre à gauche, « Organiser mes modèles » en haut à droite. tabIndex -1 : on y arrive par Flèche haut depuis la première ligne
    // (onPopupKeydown), pas par Tab, qui referme le panneau. Le clic referme le panneau et rend le focus au déclencheur avant d'ouvrir la fenêtre :
    // celle-ci le rendra à la fermeture, et le bouton, masqué avec le panneau, ne peut pas le recevoir.
    head = document.createElement('div');
    head.className = 'tts-head';
    headTitle = document.createElement('span');
    headTitle.className = 'tts-head-title';
    organizeBtn = document.createElement('button');
    organizeBtn.type = 'button';
    organizeBtn.id = 'btn-organize-templates';
    organizeBtn.className = 'tts-organize-btn';
    organizeBtn.tabIndex = -1;
    organizeLabel = document.createElement('span');
    organizeLabel.className = 'tts-organize-label';
    organizeBtn.appendChild(iconSpan('organize'));
    organizeBtn.appendChild(organizeLabel);
    organizeBtn.addEventListener('click', () => {
      closePopup();
      trigger.focus({ preventScroll: true });
      if (onOrganize) onOrganize();
    });
    head.appendChild(headTitle);
    head.appendChild(organizeBtn);
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
    if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
    // popup n'est plus un enfant de wrap (il est dans document.body) : le retirer explicitement, sinon un futur attach() en recréerait un second en
    // laissant l'ancien orphelin.
    if (popup && popup.parentNode) popup.parentNode.removeChild(popup);
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
  if (typeof I18n !== 'undefined') {
    I18n.onChange(() => {
      if (popup) { popup.setAttribute('aria-label', I18n.t('template.select')); syncHeadTexts(); render(); }
    });
  }

  return { attach, detach, refresh };
})();
