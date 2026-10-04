// Suite "paginationCost" - ce que coûte l'affichage d'un long document : la pagination de l'éditeur (js/header-footer-preview.js, renderPaginationOverlay), celle de la Lecture
// (js/reader-mode.js, renderPaginationPreview), l'affichage d'un modèle (js/editor.js, setHTML) et la lecture des largeurs de colonnes (js/editor-nodes.js, withFastColwidth). Lot
// « Gros tableaux » de « Tests de charge » (04/10).
//
// Mesuré à 1 000 lignes (tableau de 6 colonnes) : 5,6 s pour afficher le tableau dans l'éditeur, dont 3,1 s de style recalculé de force, un par saut de page (chaque coupure
// réécrivait la feuille de style entière : tout le style du document refait, 86 ms par page, donc un calcul quadratique en nombre de pages) ; 1,3 s à lire le HTML (la bibliothèque
// de tableaux cherche les <col> du tableau entier pour chaque case) ; et la pagination se faisait deux fois par affichage. Les cas ci-dessous comptent ces opérations, pas des
// millisecondes (une machine plus lente ne les fait pas échouer) : une feuille complète écrite une seule fois par calcul, une pagination par affichage, une recherche de <col> par tableau.
// Chacun échoue sur l'ancien code ; les cas « résultat inchangé » (feuille entière, hauteur des pages, largeurs lues) passent sur les deux.
(function () {
  const cases = [];
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const EMPTY_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const lines = n => Array.from({ length: n }, (_, i) => '<p>Ligne ' + (i + 1) + ' du corps du document.</p>').join('');
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  const rulesIn = text => (String(text).match(/\{/g) || []).length;

  async function setup(h, html) {
    await h.resetEditor();
    PageLayout.setMarginsMm(null);
    h.setA4Preview(true);
    Editor.setHeaderFooterData(JSON.parse(JSON.stringify(EMPTY_HF)));
    Editor.setHTML(html);
    Editor.refreshLayout();
    await h.sleep(300);
  }
  function restoreReader() {
    const container = document.getElementById('reader-container');
    if (container) container.style.display = '';
    document.getElementById('editor-container').style.display = '';
    document.getElementById('btn-mode-edit').click();
  }

  // Les écritures de texte dans une feuille de pagination (la feuille des marges de l'éditeur, celle de la Lecture et ses feuilles posées une à une) : { el, id, valeur }.
  function watchPaginationSheets() {
    const desc = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
    const writes = [];
    Object.defineProperty(Node.prototype, 'textContent', {
      configurable: true, enumerable: desc.enumerable, get: desc.get,
      set(value) {
        if (this instanceof HTMLStyleElement && (this.id === 'v2-pagination-margins-style' || this.classList.contains('v2-pagination-style'))) writes.push({ el: this, id: this.id, value: String(value) });
        desc.set.call(this, value);
      },
    });
    return { writes, stop() { Object.defineProperty(Node.prototype, 'textContent', desc); } };
  }
  // Une feuille de pagination n'est écrite en entier qu'une fois par calcul : au plus une écriture qui porte plusieurs règles, la dernière, par feuille (la Lecture
  // pose une feuille neuve à chaque calcul et en fait plus d'un par affichage : on compte par feuille, pas au total).
  const multiRuleWrites = writes => {
    const perSheet = new Map();
    writes.filter(w => rulesIn(w.value) >= 2).forEach(w => perSheet.set(w.el, (perSheet.get(w.el) || 0) + 1));
    return Math.max(0, ...perSheet.values());
  };
  const breaksInEditor = () => document.querySelectorAll('#editor-container .v2-pagination-overlay .v2-page-band').length;

  cases.push({
    id: 'pagination_editor_writes_the_whole_margins_sheet_once_per_calculation_not_once_per_page_break',
    description: "La pagination de l'éditeur (douze pages et plus) ne réécrit pas la feuille de style entière à chaque saut de page : une écriture qui porte toutes les règles, la dernière, et aucune feuille posée en route ne reste",
    run: async (h) => {
      await setup(h, lines(700));
      const breaks = breaksInEditor();
      if (breaks < 10) return { pass: false, notes: 'document trop court : ' + breaks + ' saut(s) de page seulement' };
      const headStyles = document.head.querySelectorAll('style').length;
      const watch = watchPaginationSheets();
      try {
        HeaderFooterPreview.renderPaginationOverlay();
      } finally { watch.stop(); }
      const sheet = document.getElementById('v2-pagination-margins-style');
      const marginRules = (sheet.textContent.match(/margin-bottom:/g) || []).length;
      const multi = multiRuleWrites(watch.writes);
      const leftover = document.head.querySelectorAll('style').length - headStyles;
      const same = breaksInEditor() === breaks;
      return {
        pass: multi <= 1 && marginRules === breaks && leftover === 0 && same,
        notes: breaks + ' sauts de page, écritures de la feuille portant plusieurs règles=' + multi + ' (attendu au plus 1), règles de réserve=' + marginRules + ' (attendu ' + breaks + '), feuilles <style> laissées=' + leftover + ' (attendu 0), sauts après=' + breaksInEditor(),
      };
    },
  });

  cases.push({
    id: 'pagination_editor_table_cut_over_pages_keeps_whole_sheets_and_one_pad_rule_per_cut',
    description: "Un tableau coupé entre deux lignes sur plusieurs pages : une règle de rembourrage par coupure, une seule règle de rognage, la même feuille quand le calcul est refait, sans réécriture en route",
    run: async (h) => {
      const rows = Array.from({ length: 220 }, (_, r) => '<tr>' + [1, 2, 3].map(c => '<td><p>Ligne ' + (r + 1) + ' case ' + c + '</p></td>').join('') + '</tr>').join('');
      await setup(h, '<table><tbody>' + rows + '</tbody></table>');
      const breaks = breaksInEditor();
      if (breaks < 4) return { pass: false, notes: 'tableau trop court : ' + breaks + ' saut(s) de page seulement' };
      const before = document.getElementById('v2-pagination-margins-style').textContent;
      const watch = watchPaginationSheets();
      try {
        HeaderFooterPreview.renderPaginationOverlay();
      } finally { watch.stop(); }
      const text = document.getElementById('v2-pagination-margins-style').textContent;
      const pads = (text.match(/padding-top:/g) || []).length;
      const clips = (text.match(/clip-path:/g) || []).length;
      const multi = multiRuleWrites(watch.writes);
      // Un calcul refait sur le même document rend exactement la même feuille : aucune réserve d'un calcul précédent ne reste, aucune n'est faussée par l'ordre des écritures.
      return {
        pass: pads === breaks && clips === 1 && text === before && multi <= 1,
        notes: breaks + ' coupures, règles de rembourrage=' + pads + ', règles de rognage=' + clips + ', même feuille que le calcul d\'avant=' + (text === before) + ', écritures à plusieurs règles=' + multi,
      };
    },
  });

  cases.push({
    id: 'pagination_reader_writes_the_whole_sheet_once_per_calculation_not_once_per_page_break',
    description: "La pagination de la Lecture (douze pages et plus) ne réécrit pas non plus sa feuille de style à chaque saut de page : par feuille posée, une seule écriture à plusieurs règles, une réserve par saut, et une seule feuille de pagination restante dans le texte",
    run: async (h) => {
      await setup(h, lines(700));
      const watch = watchPaginationSheets();
      let breaks = 0; let marginRules = 0; let sheets = 0; let multi = 0;
      try {
        await h.renderReaderMode(Editor.getHTML(), Editor.getHeaderFooterData());
        await h.sleep(250);
        const rc = document.getElementById('reader-container');
        breaks = rc.querySelectorAll('.v2-pagination-overlay .v2-page-band').length;
        sheets = rc.querySelectorAll('.reader-content > style.v2-pagination-style').length;
        marginRules = Array.from(rc.querySelectorAll('.reader-content > style.v2-pagination-style')).reduce((sum, el) => sum + (el.textContent.match(/margin-bottom:/g) || []).length, 0);
        multi = multiRuleWrites(watch.writes);
      } finally {
        watch.stop();
        restoreReader();
      }
      if (breaks < 10) return { pass: false, notes: 'document trop court : ' + breaks + ' saut(s) de page seulement' };
      return {
        pass: multi <= 1 && marginRules === breaks && sheets === 1,
        notes: breaks + ' sauts de page, écritures à plusieurs règles par feuille=' + multi + ' (attendu au plus 1), règles de réserve=' + marginRules + ' (attendu ' + breaks + '), feuilles de pagination=' + sheets + ' (attendu 1)',
      };
    },
  });

  // Les paginations posées pendant un affichage : chaque calcul commence par vider la feuille des marges (une écriture de texte vide).
  async function paginationsDuring(h, html) {
    await setup(h, lines(30));
    const watch = watchPaginationSheets();
    try {
      Editor.setHTML(html);
    } finally { watch.stop(); }
    return watch.writes.filter(w => w.id === 'v2-pagination-margins-style' && w.value === '').length;
  }

  cases.push({
    id: 'set_html_paginates_once_when_no_image_needs_a_new_page_grid',
    description: "Afficher un modèle sans image en calque pagine une seule fois : la deuxième pagination, celle de l'ajustement des images, refaisait exactement la même sur un document inchangé",
    run: async (h) => {
      const count = await paginationsDuring(h, lines(300));
      return { pass: count === 1, notes: 'paginations pendant setHTML=' + count + ' (attendu 1)' };
    },
  });

  cases.push({
    id: 'set_html_paginates_again_when_a_legacy_layered_image_gets_its_page_grid',
    description: "Un ancien modèle dont une image en calque n'a pas de grille de page : elle la reçoit à l'affichage (la grille s'écrit dans le HTML) et la page est reposée après, comme avant",
    run: async (h) => {
      const image = '<p><img class="editor-image" src="' + PNG + '" alt="" style="width: 80px; height: 80px; position: absolute; left: 120px; top: 90px; z-index: -1;" data-layer="behind" data-wrap="inline"></p>';
      const count = await paginationsDuring(h, image + lines(60));
      const html = Editor.getHTML();
      const gridWritten = /data-page-index="0"/.test(html);
      return { pass: count >= 2 && gridWritten, notes: 'paginations pendant setHTML=' + count + ' (attendu 2 ou plus), grille de page écrite=' + gridWritten };
    },
  });

  // Les recherches des <col> d'un tableau pendant la lecture d'un HTML.
  function watchColLookups() {
    const original = Element.prototype.querySelectorAll;
    const state = { calls: 0, stop: () => { Element.prototype.querySelectorAll = original; } };
    Element.prototype.querySelectorAll = function (selector) {
      if (selector === 'colgroup > col') state.calls++;
      return original.apply(this, arguments);
    };
    return state;
  }
  const table = (widths, rows) => '<table><colgroup>' + widths.map(w => '<col width="' + w + '">').join('') + '</colgroup><tbody>'
    + Array.from({ length: rows }, (_, r) => '<tr>' + widths.map((_, c) => '<td><p>L' + (r + 1) + 'C' + (c + 1) + '</p></td>').join('') + '</tr>').join('') + '</tbody></table>';
  const widthsOfRow = (doc, tableRank, rowIndex) => {
    let found = null; let rank = -1;
    doc.descendants(node => {
      if (node.type.name === 'table') { rank++; if (rank === tableRank) { const cells = []; node.child(rowIndex).forEach(cell => cells.push(cell.attrs.colwidth)); found = cells; } return false; }
      return true;
    });
    return found;
  };

  cases.push({
    id: 'table_column_widths_are_looked_up_once_per_table_not_once_per_cell',
    description: "Lire un HTML dont les cases n'ont pas d'attribut colwidth cherche les <col> du tableau une fois par tableau (avant : une fois par case, un parcours du tableau entier chaque fois), et chaque case garde la largeur de sa colonne",
    run: async (h) => {
      await h.resetEditor();
      const html = table([120, 80, 60], 150) + '<p>Entre deux tableaux</p>' + table([50, 70, 90], 150) + '<p>Fin</p>';
      const watch = watchColLookups();
      try {
        Editor.setHTML(html);
      } finally { watch.stop(); }
      await h.sleep(150);
      const doc = EditorCore.getEditor().state.doc;
      const first = widthsOfRow(doc, 0, 0); const firstLast = widthsOfRow(doc, 0, 149);
      const second = widthsOfRow(doc, 1, 0); const secondLast = widthsOfRow(doc, 1, 149);
      const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      const ok = same(first, [[120], [80], [60]]) && same(firstLast, [[120], [80], [60]]) && same(second, [[50], [70], [90]]) && same(secondLast, [[50], [70], [90]]);
      return {
        pass: watch.calls <= 4 && ok,
        notes: 'recherches des <col>=' + watch.calls + ' pour 2 tableaux de 450 cases (attendu au plus 4), largeurs ligne 1 du premier=' + JSON.stringify(first) + ', dernière ligne=' + JSON.stringify(firstLast)
          + ', second tableau=' + JSON.stringify(second) + ', dernière ligne=' + JSON.stringify(secondLast),
      };
    },
  });

  cases.push({
    id: 'table_without_colgroup_keeps_automatic_columns',
    description: "Un tableau sans <colgroup> et sans colwidth garde ses colonnes automatiques (aucune largeur inventée), un tableau lu juste après un autre ne reprend pas les colonnes du précédent",
    run: async (h) => {
      await h.resetEditor();
      const plain = '<table><tbody>' + Array.from({ length: 30 }, (_, r) => '<tr><td><p>a' + r + '</p></td><td><p>b' + r + '</p></td></tr>').join('') + '</tbody></table>';
      Editor.setHTML(table([111, 222], 30) + '<p>x</p>' + plain);
      await h.sleep(150);
      const doc = EditorCore.getEditor().state.doc;
      const withGroup = widthsOfRow(doc, 0, 3);
      const without = widthsOfRow(doc, 1, 3);
      const ok = JSON.stringify(withGroup) === JSON.stringify([[111], [222]]) && JSON.stringify(without) === JSON.stringify([null, null]);
      return { pass: ok, notes: 'tableau avec colgroup, ligne 4=' + JSON.stringify(withGroup) + ' (attendu [[111],[222]]), tableau sans colgroup, ligne 4=' + JSON.stringify(without) + ' (attendu [null,null])' };
    },
  });

  cases.push({
    id: 'table_cell_width_parse_prefers_the_cell_attribute_then_the_colgroup_and_forgets_between_tasks',
    description: "La largeur d'une case lue dans un HTML : l'attribut colwidth de la case l'emporte (même avec un <colgroup>), sinon la largeur de sa colonne dans le <colgroup>, sinon rien ; les <col> retenus pour un tableau ne survivent pas à la tâche (un <colgroup> changé ensuite est relu)",
    run: async (h) => {
      const host = document.createElement('div');
      host.innerHTML = '<table><colgroup><col width="100"><col width="200"><col></colgroup><tbody><tr><td colwidth="33,44">a</td><td>b</td><td>c</td></tr><tr><td>d</td><td>e</td></tr></tbody></table>'
        + '<table><tbody><tr><td>f</td></tr></tbody></table>';
      const [withGroup, without] = host.querySelectorAll('table');
      const cell = (tableEl, row, col) => tableEl.rows[row].cells[col];
      const parse = el => JSON.stringify(EditorNodes.parseColwidthOnce(el));
      const got = {
        attribute: parse(cell(withGroup, 0, 0)), second: parse(cell(withGroup, 0, 1)), colWithoutWidth: parse(cell(withGroup, 0, 2)),
        secondRowFirst: parse(cell(withGroup, 1, 0)), noGroup: parse(cell(without, 0, 0)),
      };
      const sameTask = (() => { withGroup.querySelector('col').setAttribute('width', '150'); return parse(cell(withGroup, 1, 0)); })();
      await Promise.resolve();
      const nextTask = parse(cell(withGroup, 1, 0));
      const ok = got.attribute === '[33,44]' && got.second === '[200]' && got.colWithoutWidth === 'null' && got.secondRowFirst === '[100]' && got.noGroup === 'null' && nextTask === '[150]';
      return { pass: ok, notes: JSON.stringify(got) + ', <col> changé dans la même tâche=' + sameTask + ' (la mémoire de la tâche répond encore), à la tâche suivante=' + nextTask + ' (attendu [150])' };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.paginationCost = cases;
})();
