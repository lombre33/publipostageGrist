// Remplace visuellement #template-select (natif) par un arbre "épinglés + dossiers" - Piste B validée
// par Antoine (planning/feature-rangement-tri-modeles.md §7). Le <select> réel RESTE l'unique source de
// vérité pour .value/.options/.selectedIndex/l'évènement 'change' : tous les appels existants de
// js/main.js (onTemplateSelectChange, syncDefaultTemplateButton, wireDefaultTemplateButton, etc.)
// continuent de fonctionner SANS modification. Ce module ajoute une couche visuelle par-dessus et la
// tient synchronisée dans les deux sens - voir attach() pour le détail des trois pièges déjà rencontrés
// sur ce projet (relais coordinateur 2026-09-20) et explicitement évités ici.
//
// Scope limité à parcourir/choisir/épingler depuis l'arbre - pas de glisser-déposer, jamais éprouvé ici.
// Créer un dossier et y ranger un modèle se fait depuis la modale js/template-organize-modal.js
// ("Organiser mes modèles", ouverte depuis #btn-organize-templates dans la toolbar - Antoine a demandé
// le 2026-09-28 de déplacer ce déclencheur hors du panneau, où il vivait initialement en dernière ligne).
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
    // Info-bulle native (le panneau vit dans document.body, hors de #toolbar-top : le [data-tip] de la barre ne s'y applique pas) - dit ce que fait le clic dans l'état
    // courant, pour ne pas le confondre avec l'étoile "modèle par défaut" de la barre.
    pinBtn.title = I18n.t(pinned ? 'templateTree.unpin.tip' : 'templateTree.pin.tip');
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
    if (String(realSelect.value) === String(id)) { closePopup(); trigger.focus({ preventScroll: true }); return; }
    realSelect.value = id; // passe par interceptValueWrites -> syncTriggerLabel() immédiat
    realSelect.dispatchEvent(new Event('change', { bubbles: true }));
    closePopup();
    trigger.focus({ preventScroll: true });
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
    // preventScroll : ce focus automatique à l'ouverture ne doit jamais faire défiler un ancêtre pour
    // "révéler" la ligne - c'est exactement ce qui masquait le déclencheur derrière #v2-title-cluster
    // avant que le panneau ne soit détaché en position: fixed (cf. commentaire CSS de .tts-popup).
    row.focus({ preventScroll: true });
  }

  // Calé sur le rect RÉEL du déclencheur (pas du CSS top:100%/left:0, qui supposait que popup restait un
  // enfant positionné de .tts-wrap) - popup vit maintenant dans document.body, cf. commentaire CSS. Mesuré
  // APRÈS le classList.add('is-open') (display:none n'a pas de taille), pour pouvoir caler `left` en cas de
  // débordement à droite (barre d'outils qui peut être proche du bord dans un petit panneau Grist).
  function positionPopup() {
    const rect = trigger.getBoundingClientRect();
    popup.style.top = (rect.bottom + 4) + 'px';
    popup.style.left = rect.left + 'px';
    // Même correction que overflowRight ci-dessous, sur l'axe vertical : un panneau latéral Grist réel
    // descend vers 700x400 (mesure du coordinateur, 2026-09-28) - le max-height:360px fixe du CSS
    // dépassait alors le bas de la fenêtre de 9px, rognant la dernière ligne sans qu'aucun défilement
    // (page ou panneau) ne puisse plus la révéler. Borné ici sur la place RÉELLEMENT disponible sous le
    // déclencheur, jamais plus que le max-height CSS. -10 : max-height cible la boîte de CONTENU (pas de
    // box-sizing:border-box sur .tts-popup), donc la bordure+le padding (1px+4px de chaque côté, CSS)
    // s'ajoutent par-dessus - sans eux la marge de 12px se faisait grignoter et le panneau redépassait.
    popup.style.maxHeight = Math.max(80, Math.min(360, window.innerHeight - rect.bottom - 12 - 10)) + 'px';
    const popupRect = popup.getBoundingClientRect();
    const overflowRight = popupRect.right - (window.innerWidth - 8);
    if (overflowRight > 0) popup.style.left = Math.max(8, rect.left - overflowRight) + 'px';
  }

  let outsideScrollHandler = null;
  function openPopup() {
    if (popup.classList.contains('is-open')) return;
    render();
    popup.classList.add('is-open');
    positionPopup();
    trigger.setAttribute('aria-expanded', 'true');
    const rows = visibleRows();
    const selected = rows.find((r) => r.getAttribute('aria-selected') === 'true') || rows[0];
    setRovingFocus(selected);
    // Le navigateur GARDE le scrollTop de .tts-popup d'une fermeture à l'autre (overflow-y:auto, cf. CSS) -
    // sans repositionnement explicite ici, rouvrir après avoir défilé rendait visibles des lignes qui
    // n'étaient plus les mêmes que celles attendues en haut du panneau (mesure indépendante du
    // coordinateur, 2026-09-28 : ligne visible à l'endroit du déclencheur après une fermeture/réouverture
    // avec la liste défilée, un clic dessus retombait donc sur le déclencheur). scrollIntoView() est évité
    // à dessein : il peut faire défiler un ANCÊTRE (page Grist), pas seulement .tts-popup lui-même.
    if (selected) {
      const desired = selected.offsetTop - (popup.clientHeight - selected.offsetHeight) / 2;
      popup.scrollTop = Math.max(0, Math.min(desired, popup.scrollHeight - popup.clientHeight));
    } else {
      popup.scrollTop = 0;
    }
    outsideClickHandler = (e) => { if (!wrap.contains(e.target) && !popup.contains(e.target)) closePopup(); };
    document.addEventListener('mousedown', outsideClickHandler, true);
    // Un panneau en position: fixed ne suit pas tout seul un ancêtre qui défile (page Grist, panneau
    // latéral...) - le refermer plutôt que le laisser flotter à un endroit qui ne correspond plus au
    // déclencheur (capture: true pour attraper le scroll de N'IMPORTE quel ancêtre, pas seulement window).
    // MAIS `.tts-popup` a lui-même overflow-y:auto (liste longue, cf. CSS) : un scroll NE BUBBLE PAS mais
    // reste intercepté en phase de capture par ce même écouteur - sans le garde ci-dessous, la moindre
    // tentative de faire défiler la liste (molette, barre de défilement, PageDown) la refermait aussitôt et
    // remettait son scrollTop à 0, rendant tout modèle au-delà de la hauteur visible impossible à atteindre
    // (Antoine, 2026-09-28 : "dès que je fais la moindre action... que ca soit une tentative de scroll").
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
    const current = document.activeElement && document.activeElement.classList.contains('tts-row') ? document.activeElement : rows[0];
    const idx = rows.indexOf(current);
    if (e.key === 'Escape') { e.preventDefault(); closePopup(); trigger.focus({ preventScroll: true }); return; }
    // Tab (relevé 2026-09-28) : sans ce garde, Tab suivait l'ordre naturel du DOM depuis une ligne du
    // panneau - qui vit dans document.body, PAS juste après le déclencheur (cf. commentaire de attach()
    // sur #v2-title-cluster { overflow: hidden }) - et atterrissait n'importe où, popup toujours ouvert à
    // l'écran. Pas de preventDefault ici : on referme et on redonne le focus au déclencheur AVANT que le
    // navigateur ne poursuive son Tab par défaut, qui part alors du déclencheur (sa place naturelle dans
    // la barre) plutôt que de la ligne du panneau.
    if (e.key === 'Tab') { closePopup(); trigger.focus({ preventScroll: true }); return; }
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

    // Piège 4 (relevé 2026-09-28, jamais reproduit mais jamais protégé) : le <select> réel est masqué
    // (classe + tabIndex + aria-hidden ci-dessous) AVANT que le reste de cette fonction (construction de
    // l'arbre, render() en fin de fonction - lit les données Grist et peut lever sur une donnée
    // inattendue) n'ait fini. Le try/catch de js/main.js autour de TemplateTreeSelect.attach() empêche
    // bien l'exception de casser tout init(), mais SANS repli explicite ici, une exception après ce point
    // laissait le <select> déjà masqué et aucun arbre affiché à la place : plus aucun moyen de choisir un
    // modèle, silencieusement. En cas d'échec, on annule tout ce que attach() a déjà fait (retire
    // wrap/popup s'ils existent, arrête le MutationObserver) et on rend le <select> natif de nouveau
    // visible/utilisable avant de relayer l'exception à l'appelant.
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
      realSelect = wrap = trigger = triggerIcon = triggerLabel = popup = null;
      throw err;
    }
  }

  function attachInner() {
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
    // e.detail (nombre de clics que le navigateur compte pour CE geste - 2 pour un vrai double-clic natif)
    // distingue un authentique double-clic d'un simple second clic délibéré (rouvrir puis refermer, ce que
    // fait par ex. dev-tests/scenarios-toolbar-chrome.js en dispatchant deux clics synthétiques séparés,
    // toujours à detail=0) : sans ce garde, le réflexe hérité du <select> natif (double-clic pour "choisir")
    // ouvrait puis refermait aussitôt le panneau au 2e clic, ne laissant visible que le fond de survol du
    // bouton - signalé le 2026-09-28 ("fond bleu au clic, dropdown broken, impossible de changer de
    // modèle"). Une minuterie fixe (ex. "ignorer un clic dans les 250ms") avait été essayée puis écartée :
    // elle cassait aussi une fermeture délibérée rapide, exactement le geste que ce test générique exerce.
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

    wrap.appendChild(trigger);
    // popup rattaché à document.body, PAS à wrap : cf. commentaire de .tts-popup (css/template-tree-select.css)
    // sur le rognage par #v2-title-cluster { overflow: hidden }. Repositionné à chaque ouverture (openPopup()).
    document.body.appendChild(popup);

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
    if (outsideScrollHandler) { window.removeEventListener('scroll', outsideScrollHandler, true); outsideScrollHandler = null; }
    if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
    // popup n'est plus un enfant de wrap (rattaché à document.body, cf. attach()) : le retirer
    // explicitement, sinon un futur attach() en recréerait un second en laissant l'ancien orphelin.
    if (popup && popup.parentNode) popup.parentNode.removeChild(popup);
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
