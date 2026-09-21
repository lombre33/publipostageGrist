// Remplace visuellement #template-select (natif) par un arbre "épinglés + dossiers" - Piste B validée
// par Antoine (planning/feature-rangement-tri-modeles.md §7). Le <select> réel RESTE l'unique source de
// vérité pour .value/.options/.selectedIndex/l'évènement 'change' : tous les appels existants de
// js/main.js (onTemplateSelectChange, syncDefaultTemplateButton, wireDefaultTemplateButton, etc.)
// continuent de fonctionner SANS modification. Ce module ajoute une couche visuelle par-dessus et la
// tient synchronisée dans les deux sens - voir attach() pour le détail des trois pièges déjà rencontrés
// sur ce projet (relais coordinateur 2026-09-20) et explicitement évités ici.
//
// Scope volontairement limité à parcourir/choisir/épingler depuis l'arbre. Assigner un modèle à un
// dossier reste pour l'instant à faire depuis la modale "Organiser mes modèles…" cadrée en
// planning/feature-rangement-tri-modeles.md §4 (pas encore construite) plutôt que d'improviser un
// glisser-déposer non éprouvé dans l'arbre lui-même - à annoncer à Antoine au moment du câblage, pas une
// limitation qu'il a demandée.
//
// Clés I18n utilisées ci-dessous mais PAS ENCORE ajoutées à js/i18n.js (fichier partagé/disputé,
// cf. mémoire d'équipe - modifié seulement au lot de câblage final, pas ici) : templateTree.pin.aria,
// templateTree.pinnedSection, templateTree.allSection. À ajouter (FR+EN) dans ce même lot de câblage.
const TemplateTreeSelect = (function () {
  let realSelect = null;
  let wrap, trigger, triggerIcon, triggerLabel, popup;
  let mo = null;
  let outsideClickHandler = null;

  function iconSpan(typeModele) {
    const span = document.createElement('span');
    span.className = 'tts-icon tts-icon-' + (typeModele || 'document');
    return span;
  }

  function labelFor(tpl) {
    const isDefault = tpl.id != null && String(Templates.getDefaultId()) === String(tpl.id);
    return isDefault ? (tpl.nom + ' ★') : tpl.nom;
  }

  // --- Construction de l'arbre affiché, à partir des mêmes données que le <select> réel -------------
  // (Templates.getCached()/TemplatePreferences.getCached(), pas les <option> du DOM : ceux-ci ne portent
  // ni typeModele ni le statut "par défaut" en donnée structurée, seulement un textContent déjà mis en
  // forme par refreshTemplateList - cf. js/main.js.)
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

  function makeFolderRow(node, depth) {
    const li = document.createElement('div');
    li.className = 'tts-row tts-row-folder';
    li.setAttribute('role', 'treeitem');
    li.setAttribute('aria-expanded', 'true');
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
    group.setAttribute('role', 'group');
    node.enfants.forEach((child) => group.appendChild(makeRow(child, depth + 1)));

    li.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFolder(li, group);
    });

    // Fragment (pas un <div> englobant) : `group` doit rester le frère DIRECT de `li` une fois inséré
    // chez l'appelant, sinon `li.nextElementSibling` (toggleFolder, navigation clavier ArrowRight/Left)
    // ne retrouverait plus le bon groupe pour un dossier imbriqué (li+group se retrouveraient enfants
    // d'un conteneur intermédiaire plutôt que frères directs dans `.tts-group` du parent).
    const fragment = document.createDocumentFragment();
    fragment.appendChild(li);
    fragment.appendChild(group);
    return fragment;
  }

  function toggleFolder(li, group) {
    const expanded = li.getAttribute('aria-expanded') !== 'false';
    li.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    group.classList.toggle('is-collapsed', expanded);
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
    // -1 : un <button> est nativement un arrêt de tabulation, ce qui casserait le focus roulant de
    // l'arbre (Tab sortirait de la ligne courante vers ce bouton au lieu de sortir du widget). Pas
    // encore de raccourci clavier dédié pour épingler en v1 (cf. limite de scope en tête de fichier) -
    // seule la souris y accède pour l'instant.
    pinBtn.tabIndex = -1;
    const prefs = currentPreferences();
    const pinned = !!(prefs[node.id] && prefs[node.id].epingle);
    pinBtn.classList.toggle('is-pinned', pinned);
    pinBtn.setAttribute('aria-pressed', String(pinned));
    pinBtn.setAttribute('aria-label', I18n.t('templateTree.pin.aria'));
    pinBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        // setPinned() ne lève jamais pour une identification indisponible (repli anonyme silencieux,
        // cf. js/template-preferences.js) - seule une vraie panne d'écriture Grist atterrit ici.
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
    const selectedValue = realSelect.value;
    // Un ré-affichage déclenché pendant que le popup est ouvert (ex. clic sur l'épingle d'une ligne, cf.
    // pinBtn ci-dessus) reconstruit tout popup.innerHTML : sans ceci, la ligne qui avait le focus clavier
    // roulant (tabindex=0 + focus DOM réel) disparaîtrait et le focus retomberait sur <body>, cassant la
    // navigation clavier en plein milieu d'un usage.
    let focusedId;
    if (popup.contains(document.activeElement)) {
      const focusedRow = document.activeElement.closest('.tts-row');
      if (focusedRow) focusedId = focusedRow.dataset.templateId;
    }
    popup.innerHTML = '';

    // Entrée "-- Nouveau modèle --" (value '') : toujours en tête, hors arbre - même position que la
    // 1re <option> posée par refreshTemplateList (js/main.js).
    const newRow = document.createElement('div');
    newRow.className = 'tts-row tts-row-leaf tts-row-new';
    newRow.setAttribute('role', 'treeitem');
    newRow.setAttribute('tabindex', '-1');
    newRow.dataset.templateId = '';
    if (selectedValue === '') newRow.setAttribute('aria-selected', 'true');
    const newLabel = document.createElement('span');
    newLabel.className = 'tts-row-label';
    newLabel.textContent = I18n.t('template.newOption');
    newRow.appendChild(newLabel);
    newRow.addEventListener('click', () => selectValue(''));
    popup.appendChild(newRow);

    const view = TemplateOrganizer.buildView(currentTemplates(), currentPreferences());

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

  // --- Synchronisation trigger <- <select> réel --------------------------------------------------
  function findTemplateById(id) {
    if (id === '' || id == null) return null;
    return currentTemplates().find((t) => String(t.id) === String(id)) || null;
  }

  function syncTriggerLabel() {
    const id = realSelect.value;
    const tpl = findTemplateById(id);
    triggerIcon.className = 'tts-icon tts-icon-' + (tpl ? (tpl.typeModele || 'document') : 'new');
    triggerLabel.textContent = tpl ? labelFor(tpl) : I18n.t('template.newOption');
    popup.querySelectorAll('.tts-row[aria-selected]').forEach((r) => r.removeAttribute('aria-selected'));
    const row = popup.querySelector('.tts-row-leaf[data-template-id="' + CSS.escape(String(id)) + '"]');
    if (row) row.setAttribute('aria-selected', 'true');
  }

  function syncDisabledState() {
    trigger.disabled = !!realSelect.disabled;
  }

  // Redéfinit l'accesseur `value` sur CETTE instance de <select> (masque l'accesseur du prototype
  // HTMLSelectElement pour ce seul élément) : c'est la seule façon fiable de détecter les nombreuses
  // écritures directes `templateSelect.value = ...` déjà présentes dans js/main.js (ex. après
  // Templates.setDefault, dans onNew/onDelete/onSave, au chargement du modèle par défaut) SANS modifier
  // ce code existant. Ces écritures ne déclenchent jamais d'évènement 'change' natif (le navigateur ne le
  // fait que sur une interaction utilisateur), donc les écouter directement laisserait l'arbre affiché
  // désynchronisé du <select> réel dans tous ces cas.
  function interceptValueWrites(el, onChange) {
    let proto = Object.getPrototypeOf(el);
    let desc;
    while (proto && !desc) {
      desc = Object.getOwnPropertyDescriptor(proto, 'value');
      proto = Object.getPrototypeOf(proto);
    }
    if (!desc || !desc.set) return; // pas de fallback silencieux souhaitable ici, mais ne doit jamais lever à l'attache
    Object.defineProperty(el, 'value', {
      configurable: true,
      enumerable: desc.enumerable,
      get() { return desc.get.call(el); },
      set(v) { desc.set.call(el, v); onChange(); },
    });
  }

  function selectValue(id) {
    if (String(realSelect.value) === String(id)) { closePopup(); trigger.focus(); return; }
    realSelect.value = id; // passe par interceptValueWrites -> syncTriggerLabel() immédiat
    realSelect.dispatchEvent(new Event('change', { bubbles: true }));
    closePopup();
    trigger.focus();
  }

  // --- Ouverture/fermeture + navigation clavier (patron WAI-ARIA "Tree View") ----------------------
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
    row.focus();
  }

  function openPopup() {
    if (popup.classList.contains('is-open')) return;
    render();
    popup.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    const rows = visibleRows();
    const selected = rows.find((r) => r.getAttribute('aria-selected') === 'true') || rows[0];
    setRovingFocus(selected);
    outsideClickHandler = (e) => { if (!wrap.contains(e.target)) closePopup(); };
    document.addEventListener('mousedown', outsideClickHandler, true);
  }

  function closePopup() {
    if (!popup.classList.contains('is-open')) return;
    popup.classList.remove('is-open');
    trigger.setAttribute('aria-expanded', 'false');
    if (outsideClickHandler) { document.removeEventListener('mousedown', outsideClickHandler, true); outsideClickHandler = null; }
  }

  function onPopupKeydown(e) {
    const rows = visibleRows();
    const current = document.activeElement && document.activeElement.classList.contains('tts-row') ? document.activeElement : rows[0];
    const idx = rows.indexOf(current);
    if (e.key === 'Escape') { e.preventDefault(); closePopup(); trigger.focus(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setRovingFocus(rows[Math.min(idx + 1, rows.length - 1)]); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setRovingFocus(rows[Math.max(idx - 1, 0)]); return; }
    if (e.key === 'Home') { e.preventDefault(); setRovingFocus(rows[0]); return; }
    if (e.key === 'End') { e.preventDefault(); setRovingFocus(rows[rows.length - 1]); return; }
    // ArrowRight/ArrowLeft suivent le patron WAI-ARIA "Tree View" : sur un dossier fermé, Right l'ouvre ;
    // sur un dossier déjà ouvert, Right entre dedans (1er enfant) ; Left sur un dossier ouvert le
    // referme, sur une feuille ou un dossier fermé il remonte au dossier parent.
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

  // --- Attache / détache ----------------------------------------------------------------------------
  function attach(select) {
    if (realSelect) detach();
    realSelect = select;

    // Piège 1 (2026-09-19, bandeau email resté affiché) : `hidden` seul peut être vaincu par une règle
    // CSS `display` plus spécifique ailleurs. Le <select> réel passe donc en display:none PERMANENT via
    // une classe dédiée avec !important (css/template-tree-select.css) - jamais via l'attribut hidden.
    realSelect.classList.add('tts-native-select');
    // Piège 2 : un élément juste masqué visuellement reste focusable/annoncé par un lecteur d'écran.
    // display:none règle déjà ce point, ceci est une deuxième barrière explicite si une future règle CSS
    // affaiblissait le display:none sans qu'on s'en rende compte.
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
    trigger.addEventListener('click', () => { if (popup.classList.contains('is-open')) closePopup(); else openPopup(); });
    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPopup(); }
    });

    popup = document.createElement('div');
    popup.className = 'tts-popup';
    popup.setAttribute('role', 'tree');
    popup.setAttribute('aria-label', I18n.t('template.select'));
    popup.addEventListener('keydown', onPopupKeydown);

    wrap.appendChild(trigger);
    wrap.appendChild(popup);

    interceptValueWrites(realSelect, () => { syncTriggerLabel(); });

    // Piège 3 : refreshTemplateList() (js/main.js) reconstruit tout le innerHTML du <select> sans
    // toujours ré-écrire `.value` juste après - childList/subtree capte cette reconstruction, distincte
    // de l'interception de `.value` ci-dessus qui ne capte, elle, que les écritures de valeur seule.
    mo = new MutationObserver((mutations) => {
      const structural = mutations.some((m) => m.type === 'childList');
      const attrChanged = mutations.some((m) => m.type === 'attributes');
      if (structural) render();
      else if (attrChanged) syncDisabledState();
    });
    mo.observe(realSelect, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });

    render();
  }

  function detach() {
    if (!realSelect) return;
    if (mo) { mo.disconnect(); mo = null; }
    if (outsideClickHandler) { document.removeEventListener('mousedown', outsideClickHandler, true); outsideClickHandler = null; }
    if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
    realSelect.classList.remove('tts-native-select');
    realSelect.removeAttribute('aria-hidden');
    realSelect.tabIndex = 0;
    realSelect = wrap = trigger = triggerIcon = triggerLabel = popup = null;
  }

  // Force un nouveau rendu depuis les données actuelles - utile après TemplatePreferences.loadForCurrentUser()
  // qui résout après le premier attach()/render() (l'identification utilisateur est asynchrone).
  function refresh() { if (realSelect) render(); }

  // Abonnement UNIQUE au niveau module (pas dans attach()) : I18n.onChange() (js/i18n.js) n'offre aucun
  // moyen de se désabonner, un ré-abonnement à chaque attach()/detach() empilerait donc un écouteur
  // fantôme par cycle. La garde `if (popup)` le rend inoffensif tant que rien n'est attaché - même
  // schéma que I18n.onChange(decorateSaveButtonShortcut) dans js/main.js, mais avec garde explicite ici
  // puisque ce module peut être détaché.
  if (typeof I18n !== 'undefined') {
    I18n.onChange(() => {
      if (popup) { popup.setAttribute('aria-label', I18n.t('template.select')); render(); }
    });
  }

  return { attach, detach, refresh };
})();
