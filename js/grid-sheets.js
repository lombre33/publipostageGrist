// Les feuilles d'une grille venue d'un classeur Excel qui en a plusieurs : des onglets au bas du plan de travail, comme dans Excel.
//
// Une grille est UN tableau (js/grid-editor.js : son garde-fou refuse un second tableau, et la barre de la case, les fusions, la sélection et les exports lisent « le » tableau). Les onglets n'y changent rien :
// l'éditeur ne contient jamais que la feuille montrée, et les autres attendent ici, en HTML. Le modèle enregistré est la suite de tous les tableaux, un `<table data-sheet-name="…">` par feuille (Editor.getHTML la
// compose par `compose`, Editor.setHTML la sépare par `adopt`). Changer d'onglet remplace le tableau de l'éditeur comme un chargement de modèle (Editor.swapSheet : ni suivi, ni 'update', rien n'est marqué modifié),
// et chaque feuille garde son historique d'Annuler tant qu'on revient la retrouver.
//
// Les onglets n'existent que pour une grille importée d'un classeur à plusieurs feuilles (« Toutes les feuilles » de la liste, js/grid-xlsx-import.js) : rien ne les crée à la main, ailleurs ; une grille d'une feuille
// n'a ni onglets ni `data-sheet-name`, son HTML et son rendu sont ceux d'avant. Les exports qui lisent le texte (Excel, ODS, PDF, Lecture) voient tous les tableaux dans l'ordre des onglets.
const GridSheets = (function () {
  // Un tableau de grille ne contient jamais un autre tableau (le garde-fou refuse les blocs imbriqués) : le premier `</table>` ferme le bon.
  const TABLE = /<table\b[\s\S]*?<\/table>/g;
  const BAR_ID = 'v2-sheet-tabs';
  const HISTORY_PREFIX = 'feuille:';
  const SHEET_NAME_MAX = 31; // la limite d'un nom de feuille Excel : un nom plus long serait coupé à l'export

  let sheets = [];   // [{ name, html, at }] : `html` est le tableau de la feuille tant qu'elle n'est pas montrée (celui de la feuille montrée est dans l'éditeur), `at` la position de son curseur quand on l'a quittée
  let shown = 0;     // le rang de la feuille que l'éditeur contient
  let wired = false;

  const unescapeAttr = text => String(text).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

  function nameOf(tableHtml) {
    const open = /^<table\b[^>]*>/.exec(tableHtml);
    const found = open && /\sdata-sheet-name="([^"]*)"/.exec(open[0]);
    return found ? unescapeAttr(found[1]).trim() : '';
  }

  // Les feuilles d'un texte de grille : au moins deux tableaux, tous nommés, et rien d'autre qu'eux (le paragraphe vide que TipTap range sous le dernier est permis). Sinon null : ce n'est pas une grille à onglets.
  function split(html) {
    if (typeof html !== 'string' || html.indexOf('data-sheet-name') === -1) return null;
    const tables = html.match(TABLE) || [];
    if (tables.length < 2) return null;
    if (html.replace(TABLE, '').replace(/<p><\/p>/g, '').trim() !== '') return null;
    const list = tables.map(tableHtml => ({ name: nameOf(tableHtml), html: tableHtml }));
    return list.every(sheet => sheet.name) ? list : null;
  }

  // Le texte qu'Editor.setHTML charge dans l'éditeur : celui d'une grille à onglets donne sa première feuille (les autres sont gardées ici), tout autre texte passe tel quel et efface les onglets d'avant.
  // `isGrid` : le modèle qu'on charge est une grille (sans cela un document qui porterait par hasard deux tableaux nommés n'aurait pas d'onglets).
  function adopt(html, isGrid) {
    const list = isGrid ? split(html) : null;
    sheets = list || [];
    shown = 0;
    render();
    return list ? list[0].html : html;
  }

  // Le texte entier du modèle : `own` est le tableau que l'éditeur contient (Editor.getHTML), qui prend la place de la feuille montrée parmi celles qui attendent. Un texte qui n'est pas un seul tableau (le fragment d'un
  // en-tête que l'éditeur contient le temps de son édition) passe tel quel.
  function compose(own) {
    if (sheets.length < 2 || typeof own !== 'string' || (own.match(TABLE) || []).length !== 1) return own;
    return sheets.map((sheet, index) => (index === shown ? own : sheet.html)).join('');
  }

  const count = () => sheets.length;
  const isOn = () => sheets.length > 1;
  const names = () => sheets.map(sheet => sheet.name);
  const shownIndex = () => shown;

  // Montre la feuille de rang `index`. Faux quand rien ne change : le même onglet, un rang qui n'existe pas, ou l'écriture d'un en-tête ou d'un pied de page en cours (l'éditeur ne contient pas le tableau).
  function show(index) {
    if (!isOn() || index === shown || !sheets[index] || Editor.isEditingHeaderFooter()) return false;
    const left = Editor.swapSheet(sheets[index].html, HISTORY_PREFIX + shown, HISTORY_PREFIX + index, sheets[index].at);
    if (left === null) return false;
    sheets[shown].html = left.html;
    sheets[shown].at = left.at;
    shown = index;
    syncTabs();
    return true;
  }

  function tabs() {
    const tabBar = document.getElementById(BAR_ID);
    return tabBar ? Array.from(tabBar.querySelectorAll('[role="tab"]')) : [];
  }
  function syncTabs() {
    tabs().forEach((tab, index) => {
      const selected = index === shown;
      tab.setAttribute('aria-selected', selected ? 'true' : 'false');
      tab.tabIndex = selected ? 0 : -1;
      tab.classList.toggle('is-active', selected);
    });
    const active = tabs()[shown];
    if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function wire(tabBar) {
    if (wired) return;
    wired = true;
    tabBar.addEventListener('click', (event) => {
      const tab = event.target.closest && event.target.closest('[role="tab"]');
      if (!tab || !tabBar.contains(tab)) return;
      const changed = show(Number(tab.dataset.index));
      // Au clavier (Entrée, Espace) le focus reste sur l'onglet, pour qu'on puisse en changer encore ; à la souris, la saisie reprend dans la feuille.
      if (changed && event.detail > 0) EditorCore.focusEditor();
    });
    // Les flèches déplacent le focus d'un onglet à l'autre, Entrée ou Espace l'ouvre (onglets à activation manuelle).
    tabBar.addEventListener('keydown', (event) => {
      const list = tabs();
      const at = list.indexOf(document.activeElement);
      if (at === -1) return;
      let next = -1;
      if (event.key === 'ArrowRight') next = (at + 1) % list.length;
      else if (event.key === 'ArrowLeft') next = (at - 1 + list.length) % list.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = list.length - 1;
      if (next === -1) return;
      event.preventDefault();
      list.forEach((tab, index) => { tab.tabIndex = index === next ? 0 : -1; });
      list[next].focus();
    });
  }

  // La barre d'onglets : une ligne au bas du plan de travail, montrée quand la grille a plusieurs feuilles (css/grid.css : `pp-has-sheets`, masquée avec l'éditeur).
  function render() {
    document.body.classList.toggle('pp-has-sheets', isOn());
    const tabBar = document.getElementById(BAR_ID);
    if (!tabBar) return;
    tabBar.textContent = '';
    if (!isOn()) return;
    wire(tabBar);
    sheets.forEach((sheet, index) => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'v2-sheet-tab';
      tab.setAttribute('role', 'tab');
      tab.dataset.index = String(index);
      tab.title = sheet.name;
      tab.textContent = sheet.name;
      tabBar.appendChild(tab);
    });
    syncTabs();
  }

  // Les noms de feuille d'un classeur importé, mis d'accord pour une grille : sans doublon (à la casse près, comme Excel), non vides, et de 31 caractères au plus.
  function uniqueNames(wanted) {
    const used = new Set();
    return wanted.map((raw, index) => {
      const base = (String(raw || '').trim() || I18n.t('grid.sheets.default', { n: index + 1 })).slice(0, SHEET_NAME_MAX);
      let name = base;
      for (let n = 2; used.has(name.toLowerCase()); n++) { const suffix = ' (' + n + ')'; name = base.slice(0, SHEET_NAME_MAX - suffix.length) + suffix; }
      used.add(name.toLowerCase());
      return name;
    });
  }

  return { adopt, compose, show, count, isOn, names, shownIndex, split, uniqueNames };
})();
