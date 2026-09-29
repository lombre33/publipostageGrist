// Liste déroulante avec recherche pour un <select> existant (demande d'Antoine du 2026-09-29 pour la fenêtre de choix de la clé : « faire une recherche en
// tapant du texte », liste mise à jour au fil de la frappe). Le <select> reste la source de vérité : masqué, il garde sa valeur et reçoit un évènement
// `change` à chaque choix, donc le code qui l'écoute ou qui lit `.value` ne change pas. Un clic (ou ↓, ou une lettre) sur le champ ouvre un panneau avec
// une zone de recherche et la liste des choix ; les mots tapés (accents et casse ignorés, dans n'importe quel ordre) doivent tous figurer dans le libellé.
//
// Une <option> peut porter `data-name` (le nom) et `data-hint` (ce qui s'affiche entre parenthèses, en plus discret) ; sans eux, son texte sert de nom.
// Le libellé complet (« nom (indice) ») reste le texte de l'<option> : c'est ce que voit et cherche quiconque n'a pas le panneau, et la recherche porte
// aussi sur l'indice. Une <option> désactivée (le « — Choisissez… — » de départ) n'est jamais proposée, elle ne sert qu'à l'affichage du champ fermé.
// Trois autres cas, tous lus dans le <select> :
//  - un <optgroup> : son libellé devient un intitulé au-dessus de ses lignes, et disparaît avec elles quand la recherche les écarte ;
//  - une <option> sans valeur, mais permise (« -- Choisir une colonne -- », « — Aucune — ») : le choix « rien », proposé en tête tant qu'on ne cherche pas,
//    écarté dès qu'on tape, et affiché en grisé dans le champ fermé - sauf `data-placeholder="false"` : une valeur vide qui est un vrai choix (« Ordre de la
//    table » au tri d'une boucle), proposée, cherchée, cochée et affichée comme les autres ;
//  - une <option data-pinned="true"> (la saisie avancée) : toujours en bas de la liste, quelle que soit la recherche, pour qu'un mot sans résultat
//    ne la rende pas inatteignable.
//
// Réutilisable sans copier-coller pour toute autre liste : SearchSelect.attach(select, opts) (attachColumns pour un choix de COLONNE, attachTables pour une
// TABLE, attachTemplates pour un MODÈLE, attachValues pour une VALEUR possible d'une colonne : mêmes textes partout pour chaque sorte de liste) puis, à la
// fermeture de la fenêtre, .destroy() (le <select> natif réapparaît). Si attach() lève, l'appelant garde le <select> natif, inchangé.
// Options : labelledBy, searchPlaceholder et emptyText (un texte, ou une fonction qui le relit à chaque ouverture : la langue de l'interface peut changer
// pendant que la liste reste posée), placeholder ; `inline` (champ d'une ligne de règle : même hauteur et même corps que ses voisins, largeur qui suit la
// ligne) ; `hintInTrigger: false` (l'indice reste dans la liste, pas dans le champ fermé).
// Un menu plutôt qu'un champ (« Image depuis une variable » de la barre) : `popup: true` ne montre aucun champ fermé, le panneau s'ouvre par le code
// (controller.open()) à côté du rectangle que rend `anchor()` (relu à chaque placement), et `onClose(refocus)` prévient quand il se referme - un choix, Échap,
// un clic ailleurs ; `refocus` vaut vrai quand la fermeture vient du clavier ou d'un choix, faux quand le focus est déjà parti ailleurs. À l'appelant de
// défaire ensuite le <select> (destroy()), de préférence après la fin de l'évènement en cours.
const SearchSelect = (function () {
  const MARGIN = 8;              // marge minimale entre le panneau et le bord de la fenêtre
  const GAP = 4;                 // écart entre le champ et son panneau
  const MIN_WIDTH = 300;         // un libellé « colonne (Référence → Table) » tient sur une ligne même si le champ est étroit
  const PREFERRED_HEIGHT = 250;  // hauteur visée (zone de recherche + une dizaine de lignes) ; réduite dans un panneau Grist bas
  const MIN_HEIGHT = 120;
  const PAGE = 6;                // lignes sautées par Page↓/Page↑
  const MAX_ROWS = 500;          // résultats posés dans la page : 20 000 lignes (les valeurs d'une Référence vers une grande table) mettent plus d'une seconde à s'afficher
  let _uid = 0;
  const _controllers = new WeakMap();

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  // Sans accents ni casse : « tel » retrouve « Téléphone », « reference » retrouve « Référence ».
  function normalize(text) {
    return String(text == null ? '' : text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  // Éléments de `items` (produits par readItems) dont le libellé contient TOUS les mots de `query`, dans l'ordre d'origine ; tout si la recherche est vide.
  // Une ligne épinglée reste toujours ; le choix « rien » (`empty`) ne se propose que sans recherche.
  function filterItems(items, query) {
    const words = normalize(query).split(/\s+/).filter(Boolean);
    if (!words.length) return items.slice();
    return items.filter(item => item.pinned || (!item.empty && words.every(word => item.haystack.indexOf(word) !== -1)));
  }

  // Le choix « rien » : une option de valeur vide, sauf si elle se déclare vrai choix (data-placeholder="false").
  function isNoChoice(opt) {
    return opt.value === '' && opt.dataset.placeholder !== 'false';
  }

  function readItems(select) {
    const items = [];
    Array.prototype.forEach.call(select.options, (opt) => {
      if (opt.disabled) return;
      const name = opt.dataset.name || opt.textContent;
      const hint = opt.dataset.hint || '';
      const parent = opt.parentElement;
      items.push({
        value: opt.value, name, hint, haystack: normalize(name + ' ' + hint),
        group: parent && parent.tagName === 'OPTGROUP' ? parent.label : '',
        pinned: opt.dataset.pinned === 'true',
        empty: isNoChoice(opt),
      });
    });
    return items;
  }

  function attach(select, opts) {
    if (_controllers.has(select)) return _controllers.get(select);
    opts = opts || {};
    const id = 'ss-' + (++_uid);
    const previousDisplay = select.style.display;
    // Textes de la zone de recherche et du message « aucun résultat » : une chaîne, ou une fonction qui les relit - relus à chaque ouverture du panneau, pour
    // qu'une liste posée une fois sur une fenêtre qui reste (Réglages, « Trier par ») suive un changement de langue de l'interface.
    const textOf = (value, key) => (typeof value === 'function' ? value() : value) || I18n.t(key);
    let searchPlaceholder = textOf(opts.searchPlaceholder, 'searchSelect.placeholder');
    let emptyText = textOf(opts.emptyText, 'searchSelect.empty');

    let destroyed = false;
    const wrap = el('div', 'ss-wrap' + (opts.inline ? ' ss-inline' : '') + (opts.popup ? ' ss-popup' : ''));
    const trigger = el('button', 'ss-trigger');
    trigger.type = 'button';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    const valueEl = el('span', 'ss-value');
    valueEl.id = id + '-value';
    const nameEl = el('span', 'ss-name');
    const hintEl = el('span', 'ss-hint');
    valueEl.append(nameEl, hintEl);
    const chevron = el('span', 'ss-chevron');
    chevron.setAttribute('aria-hidden', 'true');
    trigger.append(valueEl, chevron);
    // Libellés du <select> (<label for>) : son nom accessible, et un clic dessus met le focus sur le champ visible (le <select>, masqué, ne le peut plus).
    const labels = Array.prototype.slice.call(select.labels || []);
    labels.forEach((label, i) => { if (!label.id) label.id = id + '-label-' + i; });
    const labelIds = [opts.labelledBy].concat(labels.map(label => label.id)).filter(Boolean);
    trigger.setAttribute('aria-labelledby', labelIds.concat(valueEl.id).join(' '));
    const onLabelClick = () => trigger.focus({ preventScroll: true });

    const panel = el('div', 'ss-panel');
    panel.hidden = true;
    const searchRow = el('div', 'ss-search');
    const input = el('input', 'ss-input');
    input.type = 'text';
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-controls', id + '-list');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-label', searchPlaceholder);
    input.placeholder = searchPlaceholder;
    input.autocomplete = 'off';
    input.spellcheck = false;
    searchRow.appendChild(input);
    const list = el('ul', 'ss-list');
    list.id = id + '-list';
    list.setAttribute('role', 'listbox');
    const empty = el('li', 'ss-empty', emptyText);
    empty.setAttribute('role', 'presentation');
    empty.hidden = true;
    const status = el('div', 'ss-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    panel.append(searchRow, list, status);
    wrap.append(trigger, panel);

    let items = [];
    let visible = [];
    let rows = [];   // les <li> des lignes de `visible`, dans le même ordre (la liste contient aussi le message et les intitulés de groupe)
    let active = -1;
    let query = '';
    let open = false;
    let lastX = -1;
    let lastY = -1;

    // Champ fermé : le choix courant (nom + indice discret), sinon le texte de l'<option> désactivée de départ. Le choix « rien » (option permise sans valeur)
    // s'affiche en grisé, comme un texte de départ. Reprend aussi l'état grisé du <select>.
    function syncTrigger() {
      const opt = select.options[select.selectedIndex];
      const chosen = opt && !opt.disabled ? opt : null;
      trigger.classList.toggle('is-placeholder', !chosen || isNoChoice(chosen));
      trigger.disabled = select.disabled;
      if (chosen) {
        nameEl.textContent = chosen.dataset.name || chosen.textContent;
        hintEl.textContent = chosen.dataset.hint && opts.hintInTrigger !== false ? '(' + chosen.dataset.hint + ')' : '';
        trigger.title = chosen.textContent;
      } else {
        const placeholder = Array.prototype.find.call(select.options, o => o.disabled);
        nameEl.textContent = opts.placeholder || (placeholder ? placeholder.textContent : '');
        hintEl.textContent = '';
        trigger.removeAttribute('title');
      }
    }

    // Fait défiler la liste juste ce qu'il faut pour montrer la ligne active. Sans scrollIntoView : il remonterait aussi les ancêtres défilants
    // (fenêtre Grist comprise) et ferait sauter la page.
    function scrollToActive() {
      const row = rows[active];
      if (!row) return;
      // Première ligne d'un groupe : on la remonte avec son intitulé, sinon on la verrait sans savoir de quelle table elle est.
      const before = row.previousElementSibling;
      const top = before && before.classList.contains('ss-group') ? before.offsetTop : row.offsetTop;
      if (top < list.scrollTop) list.scrollTop = top;
      else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight;
    }
    function setActive(index, scroll) {
      if (active >= 0 && rows[active]) rows[active].classList.remove('is-active');
      active = index;
      const row = rows[active];
      if (row) {
        row.classList.add('is-active');
        input.setAttribute('aria-activedescendant', row.id);
        if (scroll !== false) scrollToActive();
      } else {
        input.removeAttribute('aria-activedescendant');
      }
    }

    function render() {
      const found = filterItems(items, query);
      const current = select.value;
      const searching = query.trim() !== '';
      // Les résultats proprement dits : ni la ligne épinglée ni le choix « rien », qui ne comptent pas comme une réponse à la recherche.
      const matches = found.filter(item => !item.pinned && !item.empty);
      // Liste très longue : seuls les MAX_ROWS premiers résultats sont posés, une ligne dit d'affiner la recherche (le champ cherche dans tous, le nombre annoncé
      // est le total). Aucune liste de fenêtre n'en approche : ça ne change que les valeurs d'une Référence vers une très grande table.
      const dropped = matches.length > MAX_ROWS ? new Set(matches.slice(MAX_ROWS)) : null;
      visible = dropped ? found.filter(item => !dropped.has(item)) : found;
      list.textContent = '';
      list.appendChild(empty);
      rows = [];
      let lastGroup = '';
      let moreShown = !dropped;
      // La ligne « Encore N résultats » vient après les résultats, avant la ligne épinglée (la saisie avancée reste en dernier).
      const addMore = () => {
        const more = el('li', 'ss-more', I18n.t('searchSelect.more', { count: dropped.size }));
        more.setAttribute('role', 'presentation');
        list.appendChild(more);
        moreShown = true;
      };
      visible.forEach((item, i) => {
        if (!moreShown && item.pinned) addMore();
        if (item.group && item.group !== lastGroup) {
          const header = el('li', 'ss-group', item.group);
          header.setAttribute('role', 'presentation');
          list.appendChild(header);
        }
        lastGroup = item.group;
        const row = el('li', 'ss-option' + (item.pinned ? ' is-pinned' : '') + (item.empty ? ' is-empty' : ''));
        row.id = id + '-opt-' + i;
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', item.value === current ? 'true' : 'false');
        row.dataset.index = String(i);
        row.appendChild(el('span', 'ss-name', item.name));
        if (item.hint) row.appendChild(el('span', 'ss-hint', '(' + item.hint + ')'));
        list.appendChild(row);
        rows.push(row);
      });
      if (!moreShown) addMore();
      // Message quand la recherche ne trouve rien (ou qu'il n'y a rien à lister) ; pas pour une liste qui ne propose que « rien », sans recherche.
      empty.hidden = matches.length > 0 || (!searching && visible.length > 0);
      status.textContent = !searching ? '' : (matches.length ? I18n.t('searchSelect.count', { count: matches.length }) : emptyText);
      // Recherche en cours : le premier résultat, pour que Entrée le prenne (jamais la ligne épinglée : elle ne se choisit pas par mégarde). Sinon le choix
      // courant ; rien de surligné tant qu'il n'y a ni recherche ni choix, pour qu'un Entrée à vide ne choisisse pas au hasard la première colonne.
      setActive(searching ? (matches.length ? visible.indexOf(matches[0]) : -1) : visible.findIndex(item => item.value === current), false);
    }

    // Panneau en position fixe : hors de toute zone rognante (une fenêtre à défilement, un ancêtre overflow:hidden), sous le champ, ou au-dessus si la
    // place manque dessous (panneau Grist bas, ~700x400) ; sa hauteur suit la place disponible et la liste défile dedans.
    function place() {
      // Champ retiré de la page pendant que le panneau est ouvert (règles redessinées) : refermer, sinon les écouteurs de la fenêtre resteraient.
      if (!trigger.isConnected) { closePanel(false); return; }
      const rect = opts.anchor ? opts.anchor() : trigger.getBoundingClientRect();
      const viewWidth = window.innerWidth;
      const viewHeight = window.innerHeight;
      const width = Math.min(Math.max(rect.width, MIN_WIDTH), viewWidth - 2 * MARGIN);
      const spaceBelow = viewHeight - rect.bottom - GAP - MARGIN;
      const spaceAbove = rect.top - GAP - MARGIN;
      const below = spaceBelow >= PREFERRED_HEIGHT || spaceBelow >= spaceAbove;
      panel.style.width = width + 'px';
      panel.style.left = Math.max(MARGIN, Math.min(rect.left, viewWidth - width - MARGIN)) + 'px';
      panel.style.maxHeight = Math.max(MIN_HEIGHT, Math.min(PREFERRED_HEIGHT, below ? spaceBelow : spaceAbove)) + 'px';
      if (below) { panel.style.top = (rect.bottom + GAP) + 'px'; panel.style.bottom = 'auto'; }
      else { panel.style.bottom = (viewHeight - rect.top + GAP) + 'px'; panel.style.top = 'auto'; }
    }
    function onOutsideScroll(event) {
      if (!panel.contains(event.target)) place();
    }

    function refreshTexts() {
      searchPlaceholder = textOf(opts.searchPlaceholder, 'searchSelect.placeholder');
      emptyText = textOf(opts.emptyText, 'searchSelect.empty');
      input.placeholder = searchPlaceholder;
      input.setAttribute('aria-label', searchPlaceholder);
      empty.textContent = emptyText;
    }

    function openPanel(seed) {
      if (open || select.disabled) return;
      refreshTexts();
      items = readItems(select);
      query = seed || '';
      input.value = query;
      open = true;
      panel.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      render();
      place();
      scrollToActive();
      window.addEventListener('resize', place);
      window.addEventListener('scroll', onOutsideScroll, true);
      input.focus({ preventScroll: true });
      if (seed) input.setSelectionRange(query.length, query.length); else input.select();
    }
    function closePanel(refocus) {
      if (!open) return;
      open = false;
      panel.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', onOutsideScroll, true);
      input.value = '';
      query = '';
      if (refocus) trigger.focus({ preventScroll: true });
      if (opts.onClose && !destroyed) opts.onClose(!!refocus);
    }
    function choose(item) {
      const changed = select.value !== item.value;
      select.value = item.value;
      syncTrigger();
      closePanel(true);
      if (changed) select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    function move(delta) {
      if (!visible.length) return;
      setActive(active < 0 ? (delta > 0 ? 0 : visible.length - 1) : Math.min(visible.length - 1, Math.max(0, active + delta)));
    }

    // Le champ fermé : un clic (ou Entrée / Espace, qui déclenchent le même clic) ouvre ou referme ; ↓/↑ ouvrent ; une lettre ouvre avec elle comme début
    // de recherche (preventDefault : sinon elle serait tapée une seconde fois dans la zone qui prend le focus). Échap et Tab restent à la fenêtre.
    trigger.addEventListener('mousedown', (event) => {
      // Panneau ouvert : garder le focus dans la zone de recherche, sinon son `blur` referme le panneau avant que le clic ne le referme lui-même (et le
      // rouvre aussitôt dans les navigateurs qui ne donnent pas le focus aux boutons).
      if (open) event.preventDefault();
    });
    trigger.addEventListener('click', () => { if (open) closePanel(true); else openPanel(); });
    trigger.addEventListener('keydown', (event) => {
      if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); openPanel(); }
      else if (event.key.length === 1 && event.key !== ' ') { event.preventDefault(); openPanel(event.key); }
    });

    input.addEventListener('input', () => { query = input.value; render(); });
    input.addEventListener('keydown', (event) => {
      if (event.isComposing) return;
      switch (event.key) {
        case 'ArrowDown': event.preventDefault(); move(1); break;
        case 'ArrowUp': event.preventDefault(); move(-1); break;
        case 'PageDown': event.preventDefault(); move(PAGE); break;
        case 'PageUp': event.preventDefault(); move(-PAGE); break;
        case 'Enter': event.preventDefault(); if (visible[active]) choose(visible[active]); break;
        // Échap ferme le panneau SEUL : la fenêtre qui le contient (js/modal-base.js : ModalBase.create, ModalBase.adopt ; js/main.js:wirePageModals) se fermerait sinon avec lui.
        case 'Escape': event.preventDefault(); event.stopPropagation(); closePanel(true); break;
        // Le focus revient au champ avant l'action par défaut de Tab, qui part donc de lui : champ suivant (Maj+Tab : précédent).
        case 'Tab': closePanel(true); break;
      }
    });
    input.addEventListener('blur', (event) => {
      const to = event.relatedTarget;
      if (to && (panel.contains(to) || to === trigger)) return;
      closePanel(false);
    });

    // Le clic dans le panneau ne doit pas retirer le focus à la zone de recherche (ni pendant qu'on tire l'ascenseur de la liste).
    panel.addEventListener('mousedown', (event) => { if (event.target !== input) event.preventDefault(); });
    list.addEventListener('click', (event) => {
      const row = event.target.closest('.ss-option');
      if (row && visible[Number(row.dataset.index)]) choose(visible[Number(row.dataset.index)]);
    });
    // Surbrillance à la souris seulement quand elle BOUGE : la liste change sous un pointeur immobile à chaque frappe, et le navigateur envoie alors un
    // mousemove qui volerait la ligne active (Entrée ne prendrait plus le premier résultat).
    list.addEventListener('mousemove', (event) => {
      if (event.clientX === lastX && event.clientY === lastY) return;
      lastX = event.clientX;
      lastY = event.clientY;
      const row = event.target.closest('.ss-option');
      if (row && Number(row.dataset.index) !== active) setActive(Number(row.dataset.index), false);
    });

    syncTrigger();
    // D'abord l'insertion, seule étape qui peut lever (<select> hors de la page) : si elle échoue, le <select> n'a encore rien reçu.
    select.parentNode.insertBefore(wrap, select.nextSibling);
    select.style.display = 'none';
    select.addEventListener('change', syncTrigger);
    labels.forEach(label => label.addEventListener('click', onLabelClick));
    // Le <select> masqué ne peut plus prendre le focus : ce qui l'appelait (ouverture d'une fenêtre, bouton « Ajouter une condition ») le donne au champ visible.
    select.focus = (options) => trigger.focus(options);

    const controller = {
      trigger,
      isOpen: () => open,
      open: openPanel,
      close: closePanel,
      focus: (options) => trigger.focus(options),
      // À appeler après avoir changé par programme `select.value`, ses options ou son état grisé (ça ne déclenche aucun évènement).
      sync: syncTrigger,
      destroy() {
        destroyed = true;
        closePanel(false);
        select.removeEventListener('change', syncTrigger);
        labels.forEach(label => label.removeEventListener('click', onLabelClick));
        delete select.focus;
        wrap.remove();
        select.style.display = previousDisplay;
        _controllers.delete(select);
      },
    };
    _controllers.set(select, controller);
    return controller;
  }

  // Mêmes textes partout pour une sorte de liste (zone de recherche, « Aucune … ne correspond. »), pour que chaque choix de la même sorte se lise et se cherche
  // de la même façon (demande d'Antoine du 2026-09-29 : harmoniser dès qu'on propose un choix de colonne, puis aussi les listes de tables et de modèles).
  function attachKind(select, opts, searchKey, emptyKey) {
    return attach(select, Object.assign({ searchPlaceholder: () => I18n.t(searchKey), emptyText: () => I18n.t(emptyKey) }, opts));
  }
  // Liste de COLONNES.
  function attachColumns(select, opts) { return attachKind(select, opts, 'linkConfig.searchColumns', 'linkConfig.noColumnMatch'); }
  // Liste de TABLES (Réglages > Accès).
  function attachTables(select, opts) { return attachKind(select, opts, 'searchSelect.searchTables', 'searchSelect.noTableMatch'); }
  // Liste de MODÈLES (page de garde, annexes et modèle par défaut d'un macro-modèle).
  function attachTemplates(select, opts) { return attachKind(select, opts, 'searchSelect.searchTemplates', 'searchSelect.noTemplateMatch'); }
  // Liste de VALEURS possibles d'une colonne (choix d'une colonne Choix, valeurs affichées d'une colonne Référence : champ Valeur d'une règle).
  function attachValues(select, opts) { return attachKind(select, opts, 'searchSelect.searchValues', 'searchSelect.noValueMatch'); }
  // Remet à jour le champ visible d'un <select> déjà attaché après un changement par programme de sa valeur, de ses options ou de son état grisé ; sans effet
  // sur un <select> que le composant n'a pas pris (liste native de repli) - pour un code qui ne garde pas le contrôleur, comme le grisage d'un champ Valeur.
  function sync(select) {
    const controller = _controllers.get(select);
    if (controller) controller.sync();
  }

  return { attach, attachColumns, attachTables, attachTemplates, attachValues, sync, filterItems, readItems, normalize };
})();
