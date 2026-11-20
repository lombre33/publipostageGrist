// « Quelle ligne je lis ? » (audit « confort d'usage » du 12/11, idée 4) : en Lecture, le document montre la ligne que Grist a sous le curseur, sans le dire. Une petite pastille « ‹ Martin · ligne 2 sur 3 ›
// le dit, et ses deux flèches passent à la ligne d'avant ou d'après de la vue (grist.setCursorPos : Grist déplace son curseur, le widget reçoit la ligne et la Lecture se redessine).
// Elle ne gêne pas la lecture : posée tout en bas à gauche de la zone de lecture (là où une feuille est vide : marge basse), toute petite, elle s'efface presque (elle devient transparente et ne reçoit plus aucun
// clic) tant que le document défile et un instant après, revient quand il s'arrête ; elle n'est jamais dans le document, ni dans le PDF, ni à l'impression, et la Lecture épurée ne la montre pas.
// Elle ne se montre que s'il y a une ligne d'avant ou d'après à rejoindre : Lecture d'une ligne (pas la Lecture qui boucle sur toutes les lignes), la vue du widget a plus d'une ligne et nomme celle qu'on lit.
// Le nom est la première valeur non vide des colonnes de la ligne ; au survol, la pastille donne le nom entier. Affichage et déplacement du curseur seulement : rien n'est écrit dans le document ni dans la table.
//  ReadingLine.wire({ currentRecord, readsAllRows, setStatus }) ; ReadingLine.refresh() après un changement de ligne, de vue ou de mode (main.js : onRecordChange, onViewRowsChanged, switchMode).
// Quand la ligne lue fait plusieurs documents (« Un document par valeur »), une seconde pastille se pose à côté de celle-ci : js/reading-value.js.
// SANS ligne (une table vide, un curseur sur aucune ligne) : la Lecture montre le document tout de même (js/reader-mode.js:render), et la même pastille, sans flèches, le dit tout bas -
// « Aucune ligne sélectionnée » - pour qui se demande pourquoi ses champs de fusion sont vides. Son info-bulle dit quoi faire ; un widget qui n'est pas relié par « Sélectionner par » y ajoute
// un « ? » qui ouvre le guide à quatre étapes (js/reader-guide.js:openHelp), que la Lecture sans ligne montrait à la place du document. Elle suit la Lecture AFFICHÉE (ReaderMode.showsNoRow), pas
// la ligne que Grist dit : la Lecture d'une ligne qui n'est pas redessinée quand la sélection se vide garde ses données, la pastille ne prétend pas le contraire.
//  ReadingLine.wire({ currentRecord, readsAllRows, showsNoRow, isLinked, openHelp, setStatus }).
const ReadingLine = (function () {
  const QUIET = 'is-quiet';
  const NO_ROW = 'is-norow';
  const QUIET_MS = 900;   // le temps qu'elle reste transparente après le dernier défilement
  const NAME_MAX = 24;
  const GAP = 3;
  let host = null;
  let chip = null;
  let label = null;
  let prev = null;
  let next = null;
  let help = null;
  let quietTimer = 0;
  let pending = 0; // une lecture de la vue à la fois : la plus récente gagne
  let ids = [];
  let at = -1;

  // La première valeur écrite des colonnes de la ligne, dans l'ordre de la table : « Martin ».
  function nameOf(record, tableId) {
    if (!record) return '';
    const columns = GristAPI.getVisibleColumns(tableId);
    for (const column of columns) {
      const value = record[column];
      if (value === null || value === undefined || typeof value === 'object' || typeof value === 'boolean') continue;
      const text = String(value).replace(/\s+/g, ' ').trim();
      if (text) return text;
    }
    return '';
  }
  const shorten = text => (text.length > NAME_MAX ? text.slice(0, NAME_MAX - 1).trimEnd() + '…' : text);

  // Le coin bas gauche de la zone de lecture, en pixels de l'écran : { left, bottom } de la pastille. js/reading-value.js, la pastille « valeur 2 sur 3 », s'y place à côté de celle-ci.
  function slot(container) {
    const box = container.getBoundingClientRect();
    const root = document.documentElement;
    return {
      left: Math.round(box.left + container.clientLeft + GAP + 5),
      bottom: Math.round(root.clientHeight - (box.top + container.clientTop + container.clientHeight) + GAP + (container.offsetHeight - container.clientHeight - container.clientTop * 2)),
    };
  }

  function place(container) {
    const at = slot(container);
    chip.style.left = at.left + 'px';
    chip.style.bottom = at.bottom + 'px';
  }

  function hide() { if (chip) chip.hidden = true; }

  // La pastille d'une Lecture sans ligne : le seul libellé (les flèches n'ont nulle part où aller), et le « ? » du guide quand le widget n'est pas relié.
  function showNoRow(container) {
    const text = I18n.t('readingLine.noRow');
    if (label.textContent !== text) label.textContent = text;
    chip.title = I18n.t('readingLine.noRowHint');
    chip.setAttribute('aria-label', text);
    chip.classList.add(NO_ROW);
    prev.hidden = true;
    next.hidden = true;
    help.hidden = host.isLinked();
    help.setAttribute('aria-label', I18n.t('readingLine.noRowHelp'));
    help.title = I18n.t('readingLine.noRowHelp');
    chip.hidden = false;
    place(container);
  }

  function show(record, tableId, container) {
    chip.classList.remove(NO_ROW);
    prev.hidden = false;
    next.hidden = false;
    help.hidden = true;
    const name = nameOf(record, tableId);
    const position = I18n.t('readingLine.position', { n: at + 1, total: ids.length });
    const text = name ? shorten(name) + ' · ' + position : position;
    if (label.textContent !== text) label.textContent = text;
    chip.title = name ? name + ' · ' + position : position;
    chip.setAttribute('aria-label', chip.title);
    prev.disabled = at <= 0;
    next.disabled = at >= ids.length - 1;
    chip.hidden = false;
    place(container);
  }

  // Relit la vue (ses lignes, dans son ordre) et la ligne lue, puis montre ou cache la pastille.
  async function refresh() {
    if (!chip) return;
    const token = ++pending;
    const container = document.getElementById('reader-container');
    const reading = !!container && container.getClientRects().length > 0 && !host.readsAllRows();
    if (reading && host.showsNoRow()) { showNoRow(container); return; }
    const current = host.currentRecord();
    if (!reading || !current || !current.record || typeof grist === 'undefined' || typeof grist.setCursorPos !== 'function') { hide(); return; }
    const list = await BatchScope.viewRowIds(current.tableId);
    if (token !== pending) return;
    const index = list ? list.indexOf(current.record.id) : -1;
    if (!list || list.length < 2 || index < 0) { hide(); return; }
    ids = list;
    at = index;
    show(current.record, current.tableId, container);
  }

  async function step(delta) {
    const target = ids[at + delta];
    if (target === undefined) return;
    try {
      await grist.setCursorPos({ rowId: target });
    } catch (e) {
      console.error('[ReadingLine] setCursorPos a échoué', e);
      host.setStatus(I18n.t('readingLine.failed'), true);
    }
  }

  // Elle s'efface presque pendant que le document défile (et ne gêne plus aucun clic), puis revient.
  function onScroll() {
    chip.classList.add(QUIET);
    clearTimeout(quietTimer);
    quietTimer = setTimeout(() => chip.classList.remove(QUIET), QUIET_MS);
  }

  function makeButton(icon, key, delta) {
    const button = Dom.button('pp-reading-line-btn');
    Dom.setMarkup(button, Icons.svg(icon));
    button.setAttribute('aria-label', I18n.t(key));
    button.title = I18n.t(key);
    button.addEventListener('click', () => step(delta));
    return button;
  }

  function wire(options) {
    if (chip) return;
    host = options;
    chip = Dom.el('div', 'pp-reading-line');
    chip.id = 'pp-reading-line';
    // Un repère nommé (région) : sans lui, la pastille serait du contenu hors repère pour un lecteur d'écran (comme celle du zoom, js/page-zoom.js) ; son nom est posé à chaque affichage.
    chip.setAttribute('role', 'region');
    chip.hidden = true;
    prev = makeButton('chevronLeft', 'readingLine.prev', -1);
    label = Dom.el('span', 'pp-reading-line-label');
    next = makeButton('chevronRight', 'readingLine.next', 1);
    help = Dom.button('pp-reading-line-btn pp-reading-line-help');
    Dom.setMarkup(help, Icons.svg('helpCircle'));
    help.hidden = true;
    help.addEventListener('click', () => host.openHelp());
    chip.append(prev, label, next, help);
    document.body.appendChild(chip);
    // Le lien « Sélectionner par » ou la langue qui changent pendant que la pastille est là : son « ? » et ses textes suivent.
    GristAPI.onLinkStateChange(() => { if (!chip.hidden && chip.classList.contains(NO_ROW)) refresh(); });
    const container = document.getElementById('reader-container');
    if (container) {
      container.addEventListener('scroll', onScroll, { passive: true });
      if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (!chip.hidden) place(container); }).observe(container);
    }
  }

  return { wire, refresh, slot };
})();
