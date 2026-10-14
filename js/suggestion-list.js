// La liste flottante des suggestions à frappe maison : celle de « § » (js/text-expansion.js) et celle de « @ » (js/mention.js) la partagent. Une boîte rattachée
// à <body>, sous le curseur (ViewportFit.placePopup), des lignes qu'on choisit à la souris (mousedown : l'éditeur garde le focus, comme dans le panneau # de
// js/variables.js:render) ou au clavier (↑ ↓, Entrée ou Tab, Échap), et la ligne « Encore N résultats » quand la liste en cache. Chaque liste dit son
// identifiant, son nom accessible et ce que contient une de ses lignes ; elle reçoit en retour l'objet de rendu de @tiptap/suggestion (`render()`).
//
//   SuggestionList.create({ id, label, row, status })
//     id      l'identifiant de la boîte (css/text-expansion.css la dessine par cet identifiant) ;
//     label() son nom accessible, relu à chaque ouverture : une liste suit la langue ;
//     row(entry) les nœuds d'une ligne (texte déjà posé) ;
//     status(props) facultatif : le texte d'une liste qui n'a aucune ligne à montrer (« Recherche… », « Aucune fiche »), '' pour la fermer. Sans lui, une
//       liste vide se ferme. Ce texte n'est pas une ligne qu'on choisit : Entrée, Tab et les flèches gardent leur sens dans le texte.
//   Les `items` rendus par la liste peuvent porter `more` : combien d'autres répondent encore à la saisie (la liste le dit).
const SuggestionList = (function () {
  function create(options) {
    let box = null;
    let rowEls = [];
    let moreEl = null; // la ligne « Encore N résultats » sous les lignes montrées, quand il en reste
    let shown = [];
    let selected = 0;
    let pickItem = null;

    function ensureBox() {
      if (box) return box;
      box = document.createElement('div');
      box.id = options.id;
      box.setAttribute('role', 'listbox');
      box.style.display = 'none';
      document.body.appendChild(box);
      return box;
    }

    function paintSelection() {
      // La ligne choisie suit les flèches comme le survol ; elle reste visible quand la liste défile.
      rowEls.forEach((row, index) => {
        const on = index === selected;
        row.classList.toggle('selected', on);
        row.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      const row = rowEls[selected];
      if (!row || !box) return;
      // La ligne « Encore N résultats » reste collée au bas de la liste : la ligne choisie ne passe pas dessous.
      const covered = moreEl ? moreEl.offsetHeight : 0;
      if (row.offsetTop < box.scrollTop) box.scrollTop = row.offsetTop;
      else if (row.offsetTop + row.offsetHeight > box.scrollTop + box.clientHeight - covered) box.scrollTop = row.offsetTop + row.offsetHeight - box.clientHeight + covered;
    }

    function hide() {
      if (box) box.style.display = 'none';
      shown = [];
      rowEls = [];
      moreEl = null;
      pickItem = null;
    }

    function place(props) {
      const rect = props.clientRect && props.clientRect();
      if (rect) ViewportFit.placePopup(box, rect, { gap: 4 });
    }

    // Une liste sans ligne qui a quelque chose à dire : un texte seul, sans ligne choisie (les touches ne sont pas prises).
    function showStatus(text, props) {
      shown = [];
      rowEls = [];
      moreEl = null;
      pickItem = null;
      const el = ensureBox();
      el.setAttribute('aria-label', options.label());
      el.textContent = '';
      el.classList.remove('has-more');
      const line = document.createElement('div');
      line.className = 'ex-status';
      line.setAttribute('role', 'status');
      line.textContent = text;
      el.appendChild(line);
      el.style.display = 'flex';
      place(props);
    }

    function show(props) {
      shown = props.items || [];
      pickItem = props.command;
      if (!shown.length) {
        const text = options.status ? options.status(props) : '';
        if (text) showStatus(text, props); else hide();
        return;
      }
      selected = 0;
      const el = ensureBox();
      el.setAttribute('aria-label', options.label());
      el.textContent = '';
      rowEls = shown.map((entry, index) => {
        const row = document.createElement('div');
        row.className = 'ex-item';
        row.setAttribute('role', 'option');
        row.append(...options.row(entry));
        // mousedown + preventDefault (pas click) : l'éditeur garde le focus, comme dans le panneau # (js/variables.js:render).
        row.addEventListener('mousedown', event => { event.preventDefault(); if (pickItem) pickItem(entry); });
        row.addEventListener('mouseenter', () => { if (selected !== index) { selected = index; paintSelection(); } });
        el.appendChild(row);
        return row;
      });
      moreEl = null;
      el.classList.toggle('has-more', shown.more > 0);
      if (shown.more > 0) {
        moreEl = document.createElement('div');
        moreEl.className = 'ex-more';
        moreEl.setAttribute('role', 'presentation');
        // La phrase des listes avec recherche (js/search-select.js) : « Encore N résultats : précisez la recherche. »
        moreEl.textContent = I18n.t('searchSelect.more', { count: shown.more });
        el.appendChild(moreEl);
      }
      el.style.display = 'flex';
      paintSelection();
      place(props);
    }

    function render() {
      return {
        onStart(props) { show(props); },
        onUpdate(props) { show(props); },
        onKeyDown({ event }) {
          if (!shown.length || !box || box.style.display === 'none') return false;
          if (event.key === 'ArrowDown') { selected = (selected + 1) % shown.length; paintSelection(); return true; }
          if (event.key === 'ArrowUp') { selected = (selected - 1 + shown.length) % shown.length; paintSelection(); return true; }
          if (event.key === 'Enter' || event.key === 'Tab') {
            // Maj+Entrée (saut de ligne), Maj+Tab (remonter d'un cran dans une liste) et les raccourcis avec Ctrl/Alt/Cmd gardent leur sens.
            if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return false;
            if (pickItem) pickItem(shown[selected]);
            return true;
          }
          if (event.key === 'Escape') { hide(); return true; }
          return false;
        },
        onExit() { hide(); },
      };
    }

    return { render, hide };
  }

  return { create };
})();
