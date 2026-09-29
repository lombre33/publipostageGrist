// Liste déroulante avec recherche pour un <select> existant (demande d'Antoine du 2026-09-29 pour la fenêtre de choix de la clé : « faire une recherche en
// tapant du texte », liste mise à jour au fil de la frappe). Le <select> reste la source de vérité : masqué, il garde sa valeur et reçoit un évènement
// `change` à chaque choix, donc le code qui l'écoute ou qui lit `.value` ne change pas. Un clic (ou ↓, ou une lettre) sur le champ ouvre un panneau avec
// une zone de recherche et la liste des choix ; les mots tapés (accents et casse ignorés, dans n'importe quel ordre) doivent tous figurer dans le libellé.
//
// Une <option> peut porter `data-name` (le nom) et `data-hint` (ce qui s'affiche entre parenthèses, en plus discret) ; sans eux, son texte sert de nom.
// Le libellé complet (« nom (indice) ») reste le texte de l'<option> : c'est ce que voit et cherche quiconque n'a pas le panneau, et la recherche porte
// aussi sur l'indice. Une <option> désactivée (le « — Choisissez… — » de départ) n'est jamais proposée, elle ne sert qu'à l'affichage du champ fermé.
//
// Réutilisable sans copier-coller pour toute autre liste : SearchSelect.attach(select, opts) puis, à la fermeture de la fenêtre, .destroy() (le <select>
// natif réapparaît). Si attach() lève, l'appelant garde le <select> natif, inchangé.
const SearchSelect = (function () {
  const MARGIN = 8;              // marge minimale entre le panneau et le bord de la fenêtre
  const GAP = 4;                 // écart entre le champ et son panneau
  const MIN_WIDTH = 300;         // un libellé « colonne (Référence → Table) » tient sur une ligne même si le champ est étroit
  const PREFERRED_HEIGHT = 250;  // hauteur visée (zone de recherche + une dizaine de lignes) ; réduite dans un panneau Grist bas
  const MIN_HEIGHT = 120;
  const PAGE = 6;                // lignes sautées par Page↓/Page↑
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
  function filterItems(items, query) {
    const words = normalize(query).split(/\s+/).filter(Boolean);
    if (!words.length) return items.slice();
    return items.filter(item => words.every(word => item.haystack.indexOf(word) !== -1));
  }

  function readItems(select) {
    const items = [];
    Array.prototype.forEach.call(select.options, (opt) => {
      if (opt.disabled) return;
      const name = opt.dataset.name || opt.textContent;
      const hint = opt.dataset.hint || '';
      items.push({ value: opt.value, name, hint, haystack: normalize(name + ' ' + hint) });
    });
    return items;
  }

  function attach(select, opts) {
    if (_controllers.has(select)) return _controllers.get(select);
    opts = opts || {};
    const id = 'ss-' + (++_uid);
    const previousDisplay = select.style.display;
    const searchPlaceholder = opts.searchPlaceholder || I18n.t('searchSelect.placeholder');
    const emptyText = opts.emptyText || I18n.t('searchSelect.empty');

    const wrap = el('div', 'ss-wrap');
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
    trigger.setAttribute('aria-labelledby', (opts.labelledBy ? opts.labelledBy + ' ' : '') + valueEl.id);

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
    const empty = el('div', 'ss-empty', emptyText);
    empty.hidden = true;
    const status = el('div', 'ss-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    panel.append(searchRow, list, empty, status);
    wrap.append(trigger, panel);

    let items = [];
    let visible = [];
    let active = -1;
    let query = '';
    let open = false;
    let lastX = -1;
    let lastY = -1;

    // Champ fermé : le choix courant (nom + indice discret), sinon le texte de l'<option> désactivée de départ.
    function syncTrigger() {
      const opt = select.options[select.selectedIndex];
      const chosen = opt && !opt.disabled ? opt : null;
      trigger.classList.toggle('is-placeholder', !chosen);
      if (chosen) {
        nameEl.textContent = chosen.dataset.name || chosen.textContent;
        hintEl.textContent = chosen.dataset.hint ? '(' + chosen.dataset.hint + ')' : '';
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
      const row = list.children[active];
      if (!row) return;
      if (row.offsetTop < list.scrollTop) list.scrollTop = row.offsetTop;
      else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight;
    }
    function setActive(index, scroll) {
      if (active >= 0 && list.children[active]) list.children[active].classList.remove('is-active');
      active = index;
      const row = list.children[active];
      if (row) {
        row.classList.add('is-active');
        input.setAttribute('aria-activedescendant', row.id);
        if (scroll !== false) scrollToActive();
      } else {
        input.removeAttribute('aria-activedescendant');
      }
    }

    function render() {
      visible = filterItems(items, query);
      const current = select.value;
      list.textContent = '';
      visible.forEach((item, i) => {
        const row = el('li', 'ss-option');
        row.id = id + '-opt-' + i;
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', item.value === current ? 'true' : 'false');
        row.dataset.index = String(i);
        row.appendChild(el('span', 'ss-name', item.name));
        if (item.hint) row.appendChild(el('span', 'ss-hint', '(' + item.hint + ')'));
        list.appendChild(row);
      });
      empty.hidden = visible.length > 0;
      const searching = query.trim() !== '';
      status.textContent = !searching ? '' : (visible.length ? I18n.t('searchSelect.count', { count: visible.length }) : emptyText);
      // Recherche en cours : la première ligne, pour que Entrée prenne le premier résultat. Sinon le choix courant ; rien de surligné tant qu'il n'y a
      // ni recherche ni choix, pour qu'un Entrée à vide ne choisisse pas au hasard la première colonne.
      setActive(searching ? (visible.length ? 0 : -1) : visible.findIndex(item => item.value === current), false);
    }

    // Panneau en position fixe : hors de toute zone rognante (une fenêtre à défilement, un ancêtre overflow:hidden), sous le champ, ou au-dessus si la
    // place manque dessous (panneau Grist bas, ~700x400) ; sa hauteur suit la place disponible et la liste défile dedans.
    function place() {
      const rect = trigger.getBoundingClientRect();
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

    function openPanel(seed) {
      if (open) return;
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
        // Échap ferme le panneau SEUL : la fenêtre qui le contient (cf. wireModalAccessibility) se fermerait sinon avec lui.
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

    select.addEventListener('change', syncTrigger);
    syncTrigger();
    select.parentNode.insertBefore(wrap, select.nextSibling);
    select.style.display = 'none';

    const controller = {
      trigger,
      isOpen: () => open,
      open: openPanel,
      close: closePanel,
      // À appeler après avoir changé `select.value` par programme (ça ne déclenche aucun évènement).
      sync: syncTrigger,
      destroy() {
        closePanel(false);
        select.removeEventListener('change', syncTrigger);
        wrap.remove();
        select.style.display = previousDisplay;
        _controllers.delete(select);
      },
    };
    _controllers.set(select, controller);
    return controller;
  }

  return { attach, filterItems, readItems, normalize };
})();
