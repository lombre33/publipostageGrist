// Suite "tablePadding" - les marges internes des cases d'un tableau (retour d'un utilisateur du 26/11 : « un espacement assez grand au niveau des bordures, ce qui génère des tableaux trop grands quand on a pas mal
// de données »). Trois niveaux, un réglage PAR TABLEAU (`data-cell-padding` = « compact » ou « large », attribut `cellPadding` du nœud, GridEditor.setCellPadding, menu « Bordures » de la barre du tableau) et un niveau
// de DÉPART pour les tableaux insérés ensuite (Réglages > Thème > Tableaux, PersonStore `pp_table_padding`). « Normal » est le rendu d'avant et n'écrit RIEN : mêmes marques HTML, mêmes marges, mêmes exports.
// Ici : le rendu (éditeur, Lecture, tableau dans un tableau), la marque dans le HTML, le Annuler, le niveau de départ, et chaque sortie qui lit le niveau (HTML et e-mail, ODT, Word, PDF, PowerPoint).
// Les gestes à la vraie souris (le menu « Bordures » à 700x400, les boutons enfoncés, les Réglages) sont dans dev-tests/verify-table-padding-mouse.mjs.
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const ed = () => EditorCore.getEditor();
  const NS = 'table_padding_';
  const TABLE = level => '<table' + (level ? ' data-cell-padding="' + level + '"' : '') + '><tbody><tr><td><p>un</p></td><td><p>deux</p></td></tr><tr><td><p>trois</p></td><td><p>quatre</p></td></tr></tbody></table><p>après</p>';
  const near = (a, b, tolerance) => Math.abs(a - b) <= (tolerance === undefined ? 0.05 : tolerance);
  const checker = () => {
    const bad = [];
    return { bad, expect: (label, condition, detail) => { if (!condition) bad.push(label + (detail === undefined ? '' : ' : ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)))); } };
  };
  async function withTable(h, html, body) {
    await h.resetEditor();
    GridEditor.setActive(false);
    Editor.setHTML(html);
    await sleep(200);
    try { return await body(); } finally { PersonStore.remove(CellPadding.STORAGE); await sleep(30); }
  }
  // Le curseur dans la première case du premier tableau.
  const cursorInFirstCell = async () => { ed().commands.focus(); ed().commands.setTextSelection(4); await sleep(60); };
  const firstCell = () => document.querySelector('#editor-container .tiptap table td');
  const padOf = (cell) => { const cs = getComputedStyle(cell); return { top: parseFloat(cs.paddingTop), right: parseFloat(cs.paddingRight), bottom: parseFloat(cs.paddingBottom), left: parseFloat(cs.paddingLeft) }; };
  const rowHeight = () => document.querySelector('#editor-container .tiptap table tr').getBoundingClientRect().height;
  const htmlOf = () => Editor.getHTML();

  cases.push({
    id: NS + 'normal_is_the_rendering_of_before_and_writes_nothing',
    description: 'Un tableau que personne n\'a réglé garde sa marque et son rendu d\'avant : aucun `data-cell-padding` dans le HTML, 4 px en haut et 6 px sur les côtés (le bas perd `--pp-row-grow`, nul à l\'échelle 1)',
    run: async (h) => withTable(h, TABLE(null), async () => {
      const { bad, expect } = checker();
      const pad = padOf(firstCell());
      expect('aucune marque dans le HTML', !/data-cell-padding/.test(htmlOf()), htmlOf());
      expect('4 px en haut, 6 px à gauche et à droite', near(pad.top, 4) && near(pad.left, 6) && near(pad.right, 6), pad);
      expect('le bas est de 4 px moins ce que le zoom retranche (jamais plus de 4, jamais moins de 3)', pad.bottom <= 4.05 && pad.bottom >= 3, pad);
      await cursorInFirstCell();
      expect('le niveau lu est « normal »', GridEditor.cellPaddingLevel(ed()) === 'normal');
      expect('« normal » demandé sur un tableau normal ne change rien (aucune transaction)', (() => { const before = ed().state.doc; GridEditor.setCellPadding(ed(), 'normal'); return ed().state.doc === before; })());
      return { pass: !bad.length, notes: bad.join(' | ') };
    }),
  });

  cases.push({
    id: NS + 'compact_and_large_change_the_cells_and_the_row_and_normal_gives_it_back',
    description: 'GridEditor.setCellPadding : « compact » (1 px et 3 px) resserre la case et la ligne, « large » (8 px et 12 px) les agrandit, « normal » retire la marque et rend la hauteur d\'origine ; les chiffres sont ceux de CellPadding.PX',
    run: async (h) => withTable(h, TABLE(null), async () => {
      const { bad, expect } = checker();
      await cursorInFirstCell();
      const base = rowHeight();
      expect('compact : le réglage passe', GridEditor.setCellPadding(ed(), 'compact') === true);
      await sleep(80);
      const compact = padOf(firstCell());
      expect('compact : la marque est dans le HTML, sur le tableau', /<table[^>]*data-cell-padding="compact"/.test(htmlOf()), htmlOf());
      expect('compact : 1 px en haut, 3 px sur les côtés (CellPadding.PX)', near(compact.top, CellPadding.PX.compact.y) && near(compact.left, CellPadding.PX.compact.x) && near(compact.right, CellPadding.PX.compact.x), compact);
      expect('compact : la ligne perd 6 px (2 × 3 px de marge haut et bas)', near(base - rowHeight(), 6, 0.6), { base, now: rowHeight() });
      expect('le niveau lu est « compact »', GridEditor.cellPaddingLevel(ed()) === 'compact');
      const compactRow = rowHeight();
      expect('large : le réglage passe', GridEditor.setCellPadding(ed(), 'large') === true);
      await sleep(80);
      const large = padOf(firstCell());
      expect('large : la marque dit « large » (et plus « compact »)', /<table[^>]*data-cell-padding="large"/.test(htmlOf()) && !/data-cell-padding="compact"/.test(htmlOf()));
      expect('large : 8 px en haut, 12 px sur les côtés (CellPadding.PX)', near(large.top, CellPadding.PX.large.y) && near(large.left, CellPadding.PX.large.x) && near(large.right, CellPadding.PX.large.x), large);
      expect('large : la ligne gagne 8 px sur « normal » (2 × 4 px de plus)', near(rowHeight() - base, 8, 0.6), { base, now: rowHeight() });
      expect('compact < normal < large pour la hauteur d\'une ligne', compactRow < base && base < rowHeight(), { compactRow, base, large: rowHeight() });
      expect('normal : le réglage passe', GridEditor.setCellPadding(ed(), 'normal') === true);
      await sleep(80);
      expect('normal : la marque a disparu du HTML', !/data-cell-padding/.test(htmlOf()), htmlOf());
      expect('normal : la ligne a retrouvé sa hauteur d\'origine', near(rowHeight(), base, 0.3), { base, now: rowHeight() });
      expect('un niveau inconnu ne règle rien', GridEditor.setCellPadding(ed(), 'enorme') === false && !/data-cell-padding/.test(htmlOf()));
      return { pass: !bad.length, notes: bad.join(' | ') };
    }),
  });

  cases.push({
    id: NS + 'one_undo_takes_the_setting_back',
    description: 'Le réglage est une seule transaction : un Annuler le défait, un Rétablir le refait',
    run: async (h) => withTable(h, TABLE(null), async () => {
      const { bad, expect } = checker();
      await cursorInFirstCell();
      await sleep(700);
      GridEditor.setCellPadding(ed(), 'compact');
      await sleep(150);
      expect('réglé', /data-cell-padding="compact"/.test(htmlOf()));
      ed().commands.undo();
      await sleep(150);
      expect('un Annuler défait tout le réglage', !/data-cell-padding/.test(htmlOf()), htmlOf());
      ed().commands.redo();
      await sleep(150);
      expect('un Rétablir le refait', /data-cell-padding="compact"/.test(htmlOf()), htmlOf());
      return { pass: !bad.length, notes: bad.join(' | ') };
    }),
  });

  cases.push({
    id: NS + 'html_is_read_back_and_garbage_is_ignored',
    description: 'Un HTML qui porte la marque la garde (« compact », « large ») ; une valeur étrangère, vide ou en majuscules abîmées ne casse rien : « normal », sans marque ; la marque d\'un tableau n\'est jamais celle de l\'autre',
    run: async (h) => withTable(h, TABLE('compact') + TABLE('large') + TABLE('enorme') + TABLE('LARGE'), async () => {
      const { bad, expect } = checker();
      const tables = Array.from(document.querySelectorAll('#editor-container .tiptap table'));
      const attrs = tables.map(table => table.getAttribute('data-cell-padding'));
      expect('quatre tableaux', tables.length === 4, tables.length);
      expect('compact, large, rien pour la valeur étrangère, large pour « LARGE »', JSON.stringify(attrs) === JSON.stringify(['compact', 'large', null, 'large']), attrs);
      const tops = tables.map(table => padOf(table.querySelector('td')).top);
      expect('chaque tableau a ses marges : 1, 8, 4, 8 px', tops.map((v, i) => near(v, [1, 8, 4, 8][i])).every(Boolean), tops);
      return { pass: !bad.length, notes: bad.join(' | ') };
    }),
  });

  cases.push({
    id: NS + 'a_table_in_a_cell_keeps_its_own_padding',
    description: 'Un tableau dans la case d\'un tableau compact ne reprend pas les marges de son parent (les variables de chaque tableau sont les siennes) ; l\'inverse non plus',
    run: async (h) => {
      const inner = level => '<table' + (level ? ' data-cell-padding="' + level + '"' : '') + '><tbody><tr><td><p>dedans</p></td></tr></tbody></table>';
      const outer = (level, innerLevel) => '<table' + (level ? ' data-cell-padding="' + level + '"' : '') + '><tbody><tr><td><p>dehors</p>' + inner(innerLevel) + '</td></tr></tbody></table><p>après</p>';
      return withTable(h, outer('compact', null) + outer(null, 'large'), async () => {
        const { bad, expect } = checker();
        const outers = Array.from(document.querySelectorAll('#editor-container .tiptap > .tableWrapper > table, #editor-container .tiptap > table'));
        expect('deux tableaux de premier niveau et deux tableaux dans une case', outers.length === 2 && document.querySelectorAll('#editor-container .tiptap table table').length === 2, { top: outers.length, nested: document.querySelectorAll('#editor-container .tiptap table table').length, html: htmlOf().slice(0, 600) });
        const read = table => ({ outer: padOf(table.querySelector(':scope > tbody > tr > td')).top, inner: padOf(table.querySelector('table table td')).top });
        const first = read(outers[0]);
        const second = read(outers[1]);
        expect('compact dehors, normal dedans : 1 px et 4 px', near(first.outer, 1) && near(first.inner, 4), first);
        expect('normal dehors, large dedans : 4 px et 8 px', near(second.outer, 4) && near(second.inner, 8), second);
        return { pass: !bad.length, notes: bad.join(' | ') };
      });
    },
  });

  cases.push({
    id: NS + 'reading_and_header_footer_zones_follow_the_mark',
    description: 'La Lecture (`#reader-container`) et les zones d\'en-tête et de pied (`.v2-hf-zone-body`) lisent la même marque, avec les mêmes chiffres',
    run: async (h) => withTable(h, TABLE(null), async () => {
      const { bad, expect } = checker();
      const probe = (host, level) => {
        const box = document.createElement('div');
        box.className = host.className;
        if (host.id) box.id = host.id;
        box.style.cssText = 'position:absolute;left:-9999px;top:0;width:300px;';
        box.innerHTML = '<table' + (level ? ' data-cell-padding="' + level + '"' : '') + '><tbody><tr><td><p>x</p></td></tr></tbody></table>';
        (host.parent || document.body).appendChild(box);
        const pad = padOf(box.querySelector('td'));
        box.remove();
        return pad;
      };
      const reader = document.getElementById('reader-container');
      const zone = { className: 'v2-hf-zone-body' };
      for (const level of ['compact', null, 'large']) {
        const kind = CellPadding.levelOf(level);
        const want = CellPadding.PX[kind];
        const inReader = reader ? probe({ id: 'reader-container', className: reader.className }, level) : null;
        const inZone = probe(zone, level);
        expect('Lecture, ' + kind + ' : ' + want.y + ' px en haut, ' + want.x + ' px sur les côtés', !inReader || (near(inReader.top, want.y) && near(inReader.left, want.x)), inReader);
        expect('zone d\'en-tête ou de pied, ' + kind + ' : ' + want.y + ' px et ' + want.x + ' px', near(inZone.top, want.y) && near(inZone.left, want.x), inZone);
      }
      return { pass: !bad.length, notes: bad.join(' | ') };
    }),
  });

  cases.push({
    id: NS + 'a_new_table_takes_the_start_level_of_the_settings',
    description: 'Le bouton « Tableau » pose un tableau neuf au niveau de départ des Réglages (clé pp_table_padding) : « compact » ou « large » écrit la marque, « normal » (et l\'absence de choix) n\'écrit rien ; un tableau déjà posé ne change pas ; une valeur étrangère vaut « normal »',
    run: async (h) => withTable(h, '<p>début</p>', async () => {
      const { bad, expect } = checker();
      const button = document.getElementById('v2-btn-table');
      const insert = async (start) => {
        await h.resetEditor();
        GridEditor.setActive(false);
        Editor.setHTML('<p>début</p>');
        await sleep(120);
        if (start === undefined) PersonStore.remove(CellPadding.STORAGE); else PersonStore.set(CellPadding.STORAGE, start);
        ed().commands.focus('end');
        button.click();
        await sleep(200);
        return htmlOf();
      };
      expect('le bouton Tableau existe', !!button);
      expect('sans choix : aucune marque', !/data-cell-padding/.test(await insert()));
      expect('« compact » : la marque est sur le tableau neuf', /<table[^>]*data-cell-padding="compact"/.test(await insert('compact')));
      expect('« large » : la marque est sur le tableau neuf', /<table[^>]*data-cell-padding="large"/.test(await insert('large')));
      expect('« normal » : aucune marque', !/data-cell-padding/.test(await insert('normal')));
      expect('une valeur étrangère vaut « normal » : aucune marque', !/data-cell-padding/.test(await insert('enorme')));
      PersonStore.set(CellPadding.STORAGE, 'compact');
      const withExisting = await insert('large');
      expect('le choix de départ ne change que le tableau qu\'on insère : un seul tableau, un seul niveau', (withExisting.match(/<table/g) || []).length === 1);
      expect('startLevel relit le choix', (PersonStore.set(CellPadding.STORAGE, 'large'), CellPadding.startLevel() === 'large'));
      expect('setStartLevel refuse un niveau inconnu', CellPadding.setStartLevel('enorme') === false && CellPadding.startLevel() === 'large');
      return { pass: !bad.length, notes: bad.join(' | ') };
    }),
  });

  cases.push({
    id: NS + 'html_and_email_export_write_the_padding_of_the_table',
    description: 'L\'export HTML (et l\'e-mail, qui le prend) écrit `padding` sur chaque case d\'après le niveau du tableau : « 4px 6px » pour un tableau normal comme avant, « 1px 3px » compact, « 8px 12px » large ; deux tableaux d\'un même document gardent chacun le leur',
    run: async (h) => {
      const html = TABLE('compact') + TABLE(null) + TABLE('large');
      const { text } = await h.exportHtml(html, null, {}, null, '', { fragment: true });
      const { bad, expect } = checker();
      const cells = (text.match(/<td[^>]*>/g) || []).map(tag => (/padding: ([^;"]+)/.exec(tag) || [])[1]);
      expect('douze cases', cells.length === 12, cells.length);
      expect('quatre cases de chaque niveau, dans l\'ordre des tableaux', JSON.stringify(cells) === JSON.stringify([].concat(Array(4).fill('1px 3px'), Array(4).fill('4px 6px'), Array(4).fill('8px 12px'))), cells);
      return { pass: !bad.length, notes: bad.join(' | ') };
    },
  });

  cases.push({
    id: NS + 'odt_export_writes_the_padding_of_the_table',
    description: 'L\'export OpenDocument texte écrit les marges de la case d\'après le niveau : 0,106 cm et 0,159 cm pour un tableau normal comme avant, 0,026 et 0,079 compact, 0,212 et 0,318 large',
    run: async (h) => {
      await ExportEngines.ensure(['odtExport']);
      const read = async (level) => {
        const built = await OdtExport.build(TABLE(level), { margins: { top: 20, right: 20, bottom: 20, left: 20, orientation: 'portrait', format: 'A4' } });
        const zip = await JSZip.loadAsync(await built.blob.arrayBuffer());
        const xml = await zip.file('content.xml').async('string');
        const cell = /<style:style style:name="[^"]*" style:family="table-cell"><style:table-cell-properties([^>]*)\/>/.exec(xml);
        const attr = name => (new RegExp(name + '="([^"]*)"').exec(cell ? cell[1] : '') || [])[1];
        return { top: attr('fo:padding-top'), bottom: attr('fo:padding-bottom'), left: attr('fo:padding-left'), right: attr('fo:padding-right') };
      };
      const { bad, expect } = checker();
      const normal = await read(null);
      const compact = await read('compact');
      const large = await read('large');
      expect('normal : 0.106cm en haut et en bas, 0.159cm sur les côtés (comme avant)', normal.top === '0.106cm' && normal.bottom === '0.106cm' && normal.left === '0.159cm' && normal.right === '0.159cm', normal);
      expect('compact : 0.026cm et 0.079cm', compact.top === '0.026cm' && compact.bottom === '0.026cm' && compact.left === '0.079cm' && compact.right === '0.079cm', compact);
      expect('large : 0.212cm et 0.318cm', large.top === '0.212cm' && large.bottom === '0.212cm' && large.left === '0.318cm' && large.right === '0.318cm', large);
      return { pass: !bad.length, notes: bad.join(' | ') };
    },
  });

  cases.push({
    id: NS + 'word_export_writes_the_cell_margins_of_every_level',
    description: 'L\'export Word écrit `w:tblCellMar` à chaque niveau, ceux de l\'éditeur et du PDF : « normal » 60 twips en haut et en bas (4 px) et 90 sur les côtés (6 px), « compact » 15 et 45, « large » 120 et 180 (campagne « Fiabiliser les exports » du 27/11 : avant, « normal » gardait les marges de Word et chaque ligne était 8 px plus basse que dans le PDF) ; la grille et les largeurs de case restent d\'accord, et un tableau pleine largeur reste de la largeur de la page',
    run: async (h) => {
      const { bad, expect } = checker();
      const read = async (level) => {
        const parts = await h.exportDocxParts(TABLE(level), null, PageLayout.getMarginsTwip());
        const table = parts.doc.getElementsByTagName('w:tbl')[0];
        const mar = table.getElementsByTagName('w:tblCellMar')[0];
        const side = name => { const el = mar && mar.getElementsByTagName('w:' + name)[0]; return el ? Number(el.getAttribute('w:w')) : null; };
        const grid = Array.from(table.getElementsByTagName('w:gridCol')).map(col => Number(col.getAttribute('w:w')));
        const widths = Array.from(table.getElementsByTagName('w:tcW')).map(el => Number(el.getAttribute('w:w')));
        return { hasMar: !!mar, top: side('top'), bottom: side('bottom'), left: side('left') != null ? side('left') : side('start'), right: side('right') != null ? side('right') : side('end'), grid, widths, total: grid.reduce((a, b) => a + b, 0), ok: !!parts.doc.getElementsByTagName('w:tbl').length };
      };
      const normal = await read(null);
      const compact = await read('compact');
      const large = await read('large');
      expect('normal : `w:tblCellMar` à 60 en haut et en bas (4 px), 90 sur les côtés (6 px)', normal.ok && normal.hasMar && normal.top === 60 && normal.bottom === 60 && normal.left === 90 && normal.right === 90, normal);
      expect('compact : `w:tblCellMar` à 15 en haut et en bas (1 px), 45 sur les côtés (3 px)', compact.hasMar && compact.top === 15 && compact.bottom === 15 && compact.left === 45 && compact.right === 45, compact);
      expect('large : `w:tblCellMar` à 120 en haut et en bas, 180 sur les côtés', large.hasMar && large.top === 120 && large.bottom === 120 && large.left === 180 && large.right === 180, large);
      [['normal', normal], ['compact', compact], ['large', large]].forEach(([name, got]) => {
        expect(name + ' : les largeurs de case sont celles de la grille', got.widths.slice(0, got.grid.length).every((w, i) => w === got.grid[i]), got);
        // « Normal » garde les colonnes de l'éditeur à la lettre (3 px de moins que la page ici, comme à l'écran) ; « compact » et « large » ferment ce petit reste (closeSmallGap) : au plus 3 px d'écart.
        expect(name + ' : le tableau pleine largeur reste de la largeur de la page (la somme de la grille ne bouge pas avec les marges, à 3 px près)', Math.abs(got.total - normal.total) <= 3 * 15 + 1, { name, total: got.total, normal: normal.total });
      });
      return { pass: !bad.length, notes: bad.join(' | ') };
    },
  });

  cases.push({
    id: NS + 'pdf_export_follows_the_screen_padding_and_row_height',
    description: 'Le PDF relit la marge de la première case mesurée : 3 pt et 4,5 pt (normal, comme avant), 0,75 et 2,25 (compact), 6 et 9 (large) ; la ligne du PDF (contenu + marges + trait) a la hauteur de la ligne de l\'écran',
    run: async (h) => {
      const { bad, expect } = checker();
      const PX_TO_PT = 0.75;
      for (const [level, top, side] of [[null, 3, 4.5], ['compact', 0.75, 2.25], ['large', 6, 9]]) {
        await h.resetEditor();
        GridEditor.setActive(false);
        Editor.setHTML(TABLE(level));
        await sleep(200);
        const screen = rowHeight();
        const pdf = await h.exportPdfContent(Editor.getHTML(), null, undefined);
        const block = pdf.content.find(b => b.table);
        const layout = block && block.table && block.layout;
        const name = CellPadding.levelOf(level);
        expect(name + ' : le tableau du PDF a une mise en page', !!layout);
        if (!layout) continue;
        expect(name + ' : ' + top + ' pt en haut et en bas', near(layout.paddingTop(), top, 0.01) && near(layout.paddingBottom(), top, 0.01), [layout.paddingTop(), layout.paddingBottom()]);
        expect(name + ' : ' + side + ' pt sur les côtés', near(layout.paddingLeft(), side, 0.01) && near(layout.paddingRight(), side, 0.01), [layout.paddingLeft(), layout.paddingRight()]);
        const heights = block.table.heights;
        const row = typeof heights[0] === 'number' ? heights[0] + layout.paddingTop() + layout.paddingBottom() + layout.hLineWidth() : null;
        expect(name + ' : la ligne du PDF (contenu + marges + trait) fait la hauteur de la ligne de l\'écran à 1 px près', row !== null && near(row / PX_TO_PT, screen, 1), { row, screen, heights });
      }
      return { pass: !bad.length, notes: bad.join(' | ') };
    },
  });

  cases.push({
    id: NS + 'pptx_export_writes_the_cell_margins_of_the_table',
    description: 'L\'export PowerPoint relit la marge de la case mesurée : `marL`/`marR`/`marT`/`marB` de `a:tcPr` en EMU (9 525 par px) - 57 150 et 38 100 pour un tableau normal comme avant, 28 575 et 9 525 compact, 114 300 et 76 200 large',
    run: async (h) => {
      await ExportEngines.ensure('pptx');
      const { bad, expect } = checker();
      const read = async (level) => {
        await h.resetEditor();
        GridEditor.setActive(false);
        Editor.setHTML(TABLE(level));
        await sleep(200);
        const blob = await PptxExport.fromHtml(Editor.getHTML(), { marginsPt: PageLayout.getMarginsPt(), title: 'Essai' });
        const zip = await JSZip.loadAsync(await blob.arrayBuffer());
        const name = Object.keys(zip.files).find(n => /^ppt\/slides\/slide\d+\.xml$/.test(n));
        const xml = name ? await zip.file(name).async('string') : '';
        const found = /<a:tcPr marL="(\d+)" marR="(\d+)" marT="(\d+)" marB="(\d+)"/.exec(xml);
        return found ? { left: +found[1], right: +found[2], top: +found[3], bottom: +found[4] } : null;
      };
      const normal = await read(null);
      const compact = await read('compact');
      const large = await read('large');
      expect('normal : 57150 sur les côtés, 38100 en haut et en bas (comme avant)', !!normal && normal.left === 57150 && normal.right === 57150 && normal.top === 38100 && normal.bottom === 38100, normal);
      expect('compact : 28575 sur les côtés, 9525 en haut et en bas', !!compact && compact.left === 28575 && compact.right === 28575 && compact.top === 9525 && compact.bottom === 9525, compact);
      expect('large : 114300 sur les côtés, 76200 en haut et en bas', !!large && large.left === 114300 && large.right === 114300 && large.top === 76200 && large.bottom === 76200, large);
      return { pass: !bad.length, notes: bad.join(' | ') };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.tablePadding = cases;
})();
