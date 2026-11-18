// Suite "gridSheets" - les ONGLETS d'une grille importée d'un classeur Excel à plusieurs feuilles (js/grid-sheets.js ; choix d'Antoine du 18/11 : « Onglets seulement après un import Excel »). Une grille est UN tableau : l'éditeur ne
// contient que la feuille montrée, les autres attendent dans GridSheets, et le texte enregistré est la suite de tous les tableaux (`<table data-sheet-name="…">`, Editor.getHTML / Editor.setHTML).
//  1) l'import « Toutes les feuilles » : un tableau nommé par feuille, les feuilles masquées, vides ou trop grandes laissées de côté et comptées, le compte rendu additionné, la grille à onglets chargée (la première feuille dans l'éditeur) ;
//  2) les onglets : la barre (un onglet par feuille, le bon sélectionné), le clic qui change de feuille sans marquer le modèle modifié, le texte qui reste complet, Annuler qui reste celui de chaque feuille, le focus qui revient au texte ;
//  3) le texte enregistré se relit tel quel (aller-retour), une grille d'une feuille et tout document restent sans onglets ; 4) l'export Excel : une feuille par onglet, à son nom, les sauts de page en feuilles de plus, un classeur de plusieurs lignes.
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const ed = () => EditorCore.getEditor();
  const doc = () => ed().state.doc;
  const bar = () => document.getElementById('v2-sheet-tabs');
  const tabs = () => Array.from(document.querySelectorAll('#v2-sheet-tabs [role="tab"]'));
  const tabNames = () => tabs().map(tab => tab.textContent);
  const selectedTab = () => tabs().filter(tab => tab.getAttribute('aria-selected') === 'true').map(tab => tab.textContent).join('|');
  const barShown = () => !!bar() && getComputedStyle(bar()).display !== 'none' && bar().getBoundingClientRect().height > 0;
  const firstCell = () => doc().child(0).firstChild.firstChild.textContent;
  const tableCount = html => (html.match(/<table\b/g) || []).length;
  const namesInHtml = html => (html.match(/data-sheet-name="[^"]*"/g) || []).map(m => m.slice(17, -1));
  const statusText = () => document.getElementById('status-msg').textContent;

  async function workbookBytes(spec) {
    await XlsxExport.ensureExcelLibLoaded();
    const book = new ExcelJS.Workbook();
    spec.forEach((sheet) => {
      const ws = book.addWorksheet(sheet.name, { state: sheet.state || 'visible' });
      (sheet.rows || []).forEach(row => ws.addRow(row));
      (sheet.formulas || []).forEach(ref => { ws.getCell(ref).value = { formula: '1+1', result: 2 }; });
    });
    return new Uint8Array(await book.xlsx.writeBuffer());
  }
  async function openBook(spec) { return GridXlsxImport.openFile(new File([await workbookBytes(spec)], 'classeur.xlsx')); }

  // Les trois feuilles du classeur d'essai (une masquée, une vide), avec une formule dans deux feuilles pour le compte rendu.
  const BOOK = [
    { name: 'Ventes', rows: [['Produit', 'Total'], ['Vis', 12], ['Clou', 7]], formulas: ['C1'] },
    { name: 'Brouillon', state: 'hidden', rows: [['secret']] },
    { name: 'Vide', rows: [] },
    { name: 'Stock', rows: [['Article', 'Reste'], ['Vis', 40]], formulas: ['C1'] },
    { name: 'Notes', rows: [['Une note']] },
  ];

  async function loadGrid(html) {
    GridEditor.setActive(false);
    Editor.setHTML(html, null, { sheets: true });
    GridEditor.setActive(true);
    await sleep(300);
  }
  async function leaveGrid(h) { h.openFlyout('#v2-new-template-group'); await h.clickButton('v2-btn-new-document'); await sleep(150); }
  async function settle(h) { if (GridEditor.isActive()) await leaveGrid(h); }
  // Un tableau d'une grille, `name` pour une feuille d'un classeur importé.
  const table = (name, rows, extra) => `<table${name ? ` data-sheet-name="${name}"` : ''}><tbody>${rows.map((row, i) => `<tr${extra && extra[i] ? ' ' + extra[i] : ''}>${row.map(text => `<td colwidth="100"><p>${text}</p></td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const THREE = () => table('Ventes', [['Produit', 'Total'], ['Vis', '12']]) + table('Stock', [['Article', 'Reste'], ['Vis', '40']]) + table('Notes', [['Une note']]);
  const clickTab = (index, detail) => { const tab = tabs()[index]; tab.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: detail || 0 })); };

  // --- 1) L'import ---------------------------------------------------------------------------------------------------------------------------------------------------------

  cases.push({
    id: 'gridSheets_import_all_sheets_gives_one_named_table_per_visible_sheet',
    description: '« Toutes les feuilles » lit chaque feuille visible : un tableau nommé par feuille dans l\'ordre d\'Excel, la feuille masquée et la feuille vide laissées de côté et comptées, le compte rendu additionné, une feuille reprise seule n\'a pas d\'onglets',
    run: async (h) => {
      await settle(h);
      const book = await openBook(BOOK);
      const all = await book.buildAll({ lang: 'fr' });
      const names = namesInHtml(all.html);
      const one = await (await openBook([{ name: 'Seule', rows: [['a']] }, { name: 'Vide', rows: [] }])).buildAll({ lang: 'fr' });
      const unique = GridSheets.uniqueNames(['Données', 'données', '', 'x'.repeat(40), 'x'.repeat(31), 'Données']);
      let nothing = null;
      try { await (await openBook([{ name: 'Vide', rows: [] }, { name: 'Autre vide', rows: [] }])).buildAll({ lang: 'fr' }); } catch (e) { nothing = e.code; }
      const checks = {
        tabs: all.tabs === true && all.sheets === 3 && all.sheetCount === 4 && all.skipped === 1,
        oneTablePerSheet: tableCount(all.html) === 3 && names.join('|') === 'Ventes|Stock|Notes',
        rows: all.rows === 3 + 2 + 1,
        reportAdded: JSON.stringify(all.report) === JSON.stringify([{ key: 'formulas', n: 2 }]),
        singleSheetKeptAlone: one.tabs === false && one.skipped === 1 && tableCount(one.html) === 1 && !/data-sheet-name/.test(one.html) && one.sheetName === 'Seule',
        namesMadeUnique: unique.join('|') === 'Données|données (2)|Feuille 3|' + 'x'.repeat(31) + '|' + 'x'.repeat(27) + ' (2)|Données (3)',
        nothingToImport: nothing === 'empty',
      };
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, names, skipped: all.skipped, report: all.report, unique, one: { tabs: one.tabs, skipped: one.skipped } }) };
    },
  });

  cases.push({
    id: 'gridSheets_import_limits_keep_the_saved_text_small',
    description: 'Au plus vingt feuilles et quarante mille cases en tout : les suivantes ne sont pas reprises et sont comptées',
    run: async (h) => {
      await settle(h);
      const many = Array.from({ length: 23 }, (_, i) => ({ name: 'F' + (i + 1), rows: [['a' + i]] }));
      const wide = Array.from({ length: 3 }, (_, i) => ({ name: 'G' + (i + 1), rows: Array.from({ length: 200 }, (_, r) => Array.from({ length: 25 }, (__, c) => 'x' + r + c)) }));
      const twenty = await (await openBook(many)).buildAll({ lang: 'fr' });
      const cells = await (await openBook(wide.concat(Array.from({ length: 6 }, (_, i) => ({ name: 'H' + i, rows: Array.from({ length: 200 }, (_r, r) => Array.from({ length: 25 }, (__, c) => 'y' + r + c)) }))))).buildAll({ lang: 'fr' });
      const checks = {
        twentyOnly: twenty.tabs && twenty.sheets === 20 && twenty.skipped === 3 && twenty.sheetCount === 23,
        cellCap: cells.tabs && cells.sheets === 8 && cells.skipped === 1 && cells.sheetCount === 9,
      };
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, twenty: [twenty.sheets, twenty.skipped], cells: [cells.sheets, cells.skipped] }) };
    },
  });

  // --- 2) Les onglets -------------------------------------------------------------------------------------------------------------------------------------------------------

  cases.push({
    id: 'gridSheets_a_loaded_grid_with_sheets_shows_the_first_one_and_a_tab_per_sheet',
    description: 'Une grille dont le texte porte trois tableaux nommés : l\'éditeur contient le premier seul (un tableau, rien d\'autre), la barre d\'onglets montre les trois noms avec le premier sélectionné, et le texte enregistré les a tous',
    run: async (h) => {
      await settle(h);
      await h.resetEditor();
      const noBarBefore = !barShown();
      await loadGrid(THREE());
      const html = Editor.getHTML();
      const checks = {
        noBarBefore,
        gridOn: GridEditor.isActive() && document.body.classList.contains('pp-has-sheets'),
        oneTableInEditor: doc().childCount <= 2 && doc().child(0).type.name === 'table' && firstCell() === 'Produit',
        barShown: barShown(),
        names: tabNames().join('|') === 'Ventes|Stock|Notes',
        selected: selectedTab() === 'Ventes' && tabs().filter(tab => tab.tabIndex === 0).length === 1,
        roles: bar().getAttribute('role') === 'tablist' && tabs().every(tab => tab.getAttribute('role') === 'tab'),
        allInSavedText: tableCount(html) === 3 && namesInHtml(html).join('|') === 'Ventes|Stock|Notes' && /Reste/.test(html) && /Une note/.test(html),
        statusSilent: GridSheets.isOn() && GridSheets.count() === 3 && GridSheets.shownIndex() === 0,
      };
      await settle(h);
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, tabs: tabNames(), html: html.slice(0, 300) }) };
    },
  });

  cases.push({
    id: 'gridSheets_a_click_on_a_tab_shows_that_sheet_without_marking_the_model_modified',
    description: 'Un clic sur un onglet remplace le tableau de l\'éditeur par celui de la feuille : la case de départ change, l\'onglet choisi est sélectionné, aucun évènement de modification n\'est émis, le texte enregistré garde les trois feuilles dans le même ordre, et la souris rend la saisie au texte',
    run: async (h) => {
      await settle(h);
      await h.resetEditor();
      await loadGrid(THREE());
      const htmlBefore = Editor.getHTML();
      let updates = 0;
      const on = () => { updates += 1; };
      ed().on('update', on);
      try {
        clickTab(1, 1);
        await sleep(250);
        const second = { cell: firstCell(), selected: selectedTab(), index: GridSheets.shownIndex(), focusInText: !!document.activeElement && !!document.activeElement.closest('.tiptap') };
        tabs()[2].focus();                                          // au clavier, le focus est déjà sur l'onglet
        clickTab(2, 0);
        await sleep(250);
        const third = { cell: firstCell(), selected: selectedTab(), focusOnTab: document.activeElement === tabs()[2] };
        clickTab(2, 0);
        await sleep(100);
        clickTab(0, 1);
        await sleep(250);
        const back = { cell: firstCell(), selected: selectedTab() };
        const htmlAfter = Editor.getHTML();
        const checks = {
          second: second.cell === 'Article' && second.selected === 'Stock' && second.index === 1,
          mouseFocusesText: second.focusInText,
          third: third.cell === 'Une note' && third.selected === 'Notes',
          keyboardKeepsFocus: third.focusOnTab,
          back: back.cell === 'Produit' && back.selected === 'Ventes',
          notModified: updates === 0,
          textUnchanged: htmlAfter.replace(/\s+/g, '') === htmlBefore.replace(/\s+/g, '') || (tableCount(htmlAfter) === 3 && namesInHtml(htmlAfter).join('|') === 'Ventes|Stock|Notes' && /Une note/.test(htmlAfter) && /Reste/.test(htmlAfter) && /Produit/.test(htmlAfter)),
          oneTable: doc().childCount <= 2,
        };
        return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, second, third, back, updates }) };
      } finally { ed().off('update', on); await settle(h); }
    },
  });

  cases.push({
    id: 'gridSheets_an_edit_stays_in_its_sheet_and_undo_is_the_one_of_each_sheet',
    description: 'Un texte écrit dans la deuxième feuille reste dans la deuxième, le texte enregistré le porte, la première est intacte ; Annuler défait la frappe de la feuille montrée et pas celle d\'une autre, et revenir à une feuille lui rend son historique',
    run: async (h) => {
      await settle(h);
      await h.resetEditor();
      await loadGrid(THREE());
      try {
        ed().chain().focus().insertContent('AA').run();            // dans la feuille 1
        await sleep(100);
        clickTab(1, 1);
        await sleep(250);
        ed().chain().focus().insertContent('BB').run();            // dans la feuille 2
        await sleep(100);
        const savedWithBoth = Editor.getHTML();
        const sheet2 = firstCell();
        ed().commands.undo();                                       // défait BB (feuille 2), pas AA
        await sleep(100);
        const afterUndo2 = firstCell();
        clickTab(0, 1);
        await sleep(250);
        const sheet1 = firstCell();
        ed().commands.undo();                                       // l'historique de la feuille 1 est revenu : défait AA
        await sleep(100);
        const afterUndo1 = firstCell();
        const checks = {
          editedSheet2: /BB/.test(sheet2) && !/AA/.test(sheet2),
          savedBoth: /AA/.test(savedWithBoth) && /BB/.test(savedWithBoth) && tableCount(savedWithBoth) === 3 && namesInHtml(savedWithBoth).join('|') === 'Ventes|Stock|Notes',
          undoSheet2: afterUndo2 === 'Article',
          sheet1Kept: /AA/.test(sheet1) && !/BB/.test(sheet1),
          undoSheet1: afterUndo1 === 'Produit',
          finalText: !/AA|BB/.test(Editor.getHTML()),
        };
        return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, sheet2, afterUndo2, sheet1, afterUndo1 }) };
      } finally { await settle(h); }
    },
  });

  cases.push({
    id: 'gridSheets_arrow_keys_move_between_tabs_and_enter_opens_one',
    description: 'Au clavier : les flèches déplacent le focus d\'un onglet à l\'autre (en boucle, Début et Fin aux extrémités) sans changer de feuille, Entrée ouvre l\'onglet qui a le focus',
    run: async (h) => {
      await settle(h);
      await h.resetEditor();
      await loadGrid(THREE());
      try {
        tabs()[0].focus();
        const key = (name) => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
        key('ArrowRight');
        const right = tabs().indexOf(document.activeElement);
        key('End');
        const end = tabs().indexOf(document.activeElement);
        key('ArrowRight');
        const wrapped = tabs().indexOf(document.activeElement);
        key('ArrowLeft');
        const left = tabs().indexOf(document.activeElement);
        const stillFirst = GridSheets.shownIndex() === 0 && firstCell() === 'Produit';
        document.activeElement.click();                              // Entrée / Espace sur un bouton : un clic sans souris
        await sleep(250);
        const checks = {
          arrows: right === 1 && end === 2 && wrapped === 0 && left === 2,
          nothingOpenedYet: stillFirst,
          enterOpens: GridSheets.shownIndex() === 2 && firstCell() === 'Une note' && selectedTab() === 'Notes',
          roving: tabs().filter(tab => tab.tabIndex === 0).length === 1,
        };
        return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, right, end, wrapped, left }) };
      } finally { await settle(h); }
    },
  });

  cases.push({
    id: 'gridSheets_the_tab_bar_follows_the_editor_and_speaks_both_languages',
    description: 'La barre d\'onglets disparaît avec l\'éditeur (Lecture, macro-modèle) et à l\'impression, revient avec lui, tient dans 700 px de large (elle défile au besoin) et son nom lu par un lecteur d\'écran est écrit en français et en anglais',
    run: async (h) => {
      await settle(h);
      await h.resetEditor();
      await loadGrid(THREE());
      const before = I18n.getLang();
      try {
        const shown = barShown();
        document.body.classList.add('pp-editor-hidden');
        const hiddenWithEditor = !barShown();
        document.body.classList.remove('pp-editor-hidden');
        const backWithEditor = barShown();
        const rect = bar().getBoundingClientRect();
        const fits = rect.left >= 0 && rect.right <= innerWidth + 1 && rect.height >= 26 && rect.height <= 48;
        // Changer de langue recharge la page (js/i18n.js : le DOM statique est traduit au chargement, par `data-i18n-aria`) : on lit donc le nom que la page porte et les deux textes du dictionnaire.
        const fr = bar().getAttribute('aria-label');
        const key = bar().getAttribute('data-i18n-aria');
        const frText = I18n.t('grid.sheets.aria') + '|' + I18n.t('grid.sheets.default', { n: 2 });
        I18n.setLang('en');
        const en = I18n.t('grid.sheets.aria') + '|' + I18n.t('grid.sheets.default', { n: 2 });
        const checks = { shown, hiddenWithEditor, backWithEditor, fits, fr: fr === 'Feuilles de la grille' && key === 'grid.sheets.aria', texts: frText === 'Feuilles de la grille|Feuille 2' && en === 'Grid sheets|Sheet 2' };
        return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, fr, en, rect: [rect.left, rect.right, rect.height, innerWidth] }) };
      } finally { I18n.setLang(before); document.body.classList.remove('pp-editor-hidden'); await settle(h); }
    },
  });

  // --- 3) Le texte enregistré et ce qui n'a pas d'onglets ---------------------------------------------------------------------------------------------------------------------------

  cases.push({
    id: 'gridSheets_the_saved_text_reads_back_the_same_and_nothing_else_has_tabs',
    description: 'Le texte enregistré d\'une grille à onglets se recharge avec les mêmes onglets et le même texte ; une grille d\'une seule feuille, un document qui porte deux tableaux nommés et le chargement d\'un autre modèle n\'ont ni onglets ni barre, et leur texte ne change pas d\'un octet',
    run: async (h) => {
      await settle(h);
      await h.resetEditor();
      await loadGrid(THREE());
      clickTab(2, 1);
      await sleep(250);
      ed().chain().focus().insertContent('!').run();
      await sleep(100);
      const saved = Editor.getHTML();
      await loadGrid(saved);
      const reread = { names: tabNames().join('|'), selected: selectedTab(), cell: firstCell(), html: Editor.getHTML() };
      await loadGrid(table('', [['seule', '1']]));
      const single = { bar: barShown(), on: GridSheets.isOn(), html: Editor.getHTML() };
      const singleExpected = single.html;
      await settle(h);
      await h.resetEditor();
      Editor.setHTML(THREE());                                     // un document (pas une grille) : deux tableaux nommés ne font pas d'onglets
      await sleep(150);
      const document2 = { on: GridSheets.isOn(), bar: barShown() };
      await loadGrid(THREE());
      GridEditor.setActive(false);                                  // comme loadTemplateIntoEditor avant de charger un autre modèle
      Editor.setHTML('<p>Autre</p>', null, { sheets: false });
      await sleep(150);
      const other = { on: GridSheets.isOn(), bar: barShown(), cls: document.body.classList.contains('pp-has-sheets'), html: Editor.getHTML() };
      try {
        const checks = {
          sameTabs: reread.names === 'Ventes|Stock|Notes' && reread.selected === 'Ventes' && reread.cell === 'Produit',
          sameText: tableCount(reread.html) === 3 && /!Une note/.test(reread.html.replace(/<[^>]+>/g, '')) && /Reste/.test(reread.html),
          single: !single.bar && !single.on && tableCount(single.html) === 1 && !/data-sheet-name/.test(single.html) && /seule/.test(single.html) && singleExpected === single.html,
          documentWithTwoNamedTables: !document2.on && !document2.bar,
          otherModel: !other.on && !other.bar && !other.cls && other.html === '<p>Autre</p>',
        };
        return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, reread: { names: reread.names, selected: reread.selected, cell: reread.cell }, single: { bar: single.bar, on: single.on }, document2, other: { on: other.on, bar: other.bar, html: other.html } }) };
      } finally { await settle(h); }
    },
  });

  cases.push({
    id: 'gridSheets_each_sheet_keeps_its_cursor',
    description: 'Le curseur d\'une feuille reste où on l\'a laissé quand on la quitte puis la retrouve ; une feuille jamais ouverte s\'ouvre sur sa première case',
    run: async (h) => {
      await settle(h);
      await h.resetEditor();
      await loadGrid(THREE());
      try {
        clickTab(1, 1);
        await sleep(250);
        const fresh = ed().state.selection.from;
        ed().chain().focus().insertContent('BB').run();            // dans la première case de la feuille 2 : le curseur est après « BB »
        await sleep(100);
        const left = ed().state.selection.from;
        clickTab(0, 1);
        await sleep(250);
        const sheet1 = ed().state.selection.from;
        clickTab(1, 1);
        await sleep(250);
        const back = ed().state.selection.from;
        const checks = {
          freshAtFirstCell: fresh <= 4,
          leftAfterText: left === fresh + 2,
          otherSheetUntouched: sheet1 <= 4,
          cursorBack: back === left,
          textThere: /BB/.test(firstCell()),
        };
        return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, fresh, left, sheet1, back }) };
      } finally { await settle(h); }
    },
  });

  // --- 4) Les sorties --------------------------------------------------------------------------------------------------------------------------------------------------------------

  async function xlsxSheets(blob) {
    await ExportCommon.ensureJsZipLoaded();
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const parse = async name => new DOMParser().parseFromString(await zip.file(name).async('string'), 'application/xml');
    const names = Array.from((await parse('xl/workbook.xml')).getElementsByTagName('sheet')).map(sheet => sheet.getAttribute('name'));
    const sst = zip.file('xl/sharedStrings.xml') ? await parse('xl/sharedStrings.xml') : null;
    const strings = sst ? Array.from(sst.getElementsByTagName('si')).map(si => Array.from(si.getElementsByTagName('t')).map(t => t.textContent).join('')) : [];
    const sheets = [];
    for (let i = 0; i < names.length; i++) {
      const sheet = await parse(`xl/worksheets/sheet${i + 1}.xml`);
      const rows = Array.from(sheet.getElementsByTagName('row')).map(row => Array.from(row.getElementsByTagName('c')).map((c) => {
        const v = c.getElementsByTagName('v')[0];
        if (!v) return '';
        return c.getAttribute('t') === 's' ? strings[Number(v.textContent)] : v.textContent;
      }));
      sheets.push({ name: names[i], rows });
    }
    return sheets;
  }

  cases.push({
    id: 'gridSheets_excel_export_writes_one_sheet_per_tab_named_like_the_tab',
    description: 'L\'Excel d\'une grille à onglets écrit une feuille par onglet, à son nom et dans son ordre, avec ses cases ; un saut de page dans une feuille en fait une de plus (« Stock (2) ») ; une grille d\'une seule feuille garde le nom du fichier',
    run: async (h) => {
      await settle(h);
      await h.resetEditor();
      const html = table('Ventes', [['Produit', 'Total'], ['Vis', '12']])
        + table('Stock', [['Article', 'Reste'], ['Vis', '40'], ['Clou', '9']], [null, null, 'data-page-break-before="true"'])
        + table('Notes', [['Une note']]);
      const { blob } = await XlsxExport.getXlsxBlobForRecord(html, 'Tbl', { id: 1 }, '');
      const sheets = await xlsxSheets(blob);
      const alone = await xlsxSheets((await XlsxExport.getXlsxBlobForRecord(table('', [['seule']]), 'Tbl', { id: 1 }, '')).blob);
      const flat = rows => rows.map(r => r.join(',')).join('/');
      const checks = {
        names: sheets.map(s => s.name).join('|') === 'Ventes|Stock|Stock (2)|Notes',
        ventes: flat(sheets[0].rows) === 'Produit,Total/Vis,12',
        stock: flat(sheets[1].rows) === 'Article,Reste/Vis,40' && flat(sheets[2].rows) === 'Clou,9',
        notes: flat(sheets[3].rows) === 'Une note',
        aloneKeepsFileName: alone.length === 1 && alone[0].rows[0][0] === 'seule',
      };
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, names: sheets.map(s => s.name), alone: alone.map(s => s.name) }) };
    },
  });

  cases.push({
    id: 'gridSheets_a_single_workbook_for_several_lines_names_each_sheet_after_tab_and_file',
    description: 'Le classeur unique de plusieurs lignes de la page écrit les onglets de chaque ligne l\'un après l\'autre, chaque feuille au nom « onglet - fichier » (31 caractères au plus, sans doublon)',
    run: async (h) => {
      await settle(h);
      await h.resetEditor();
      await ExportCommon.ensureJsZipLoaded();
      const html = table('Ventes', [['a']]) + table('Stock', [['b']]);
      const book = await XlsxExport.createSingleWorkbook({});
      await book.appendRecord(html, 'Tbl', { id: 1 }, 'Nord', null, null);
      await book.appendRecord(html, 'Tbl', { id: 2 }, 'Sud', null, null);
      const sheets = await xlsxSheets(await book.toBlob());
      const names = sheets.map(s => s.name);
      const checks = {
        names: names.join('|') === 'Ventes - Nord|Stock - Nord|Ventes - Sud|Stock - Sud',
        within31: names.every(n => n.length <= 31),
      };
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, names }) };
    },
  });

  cases.push({
    id: 'gridSheets_reading_and_pdf_carry_every_sheet',
    description: 'La Lecture et le HTML résolu d\'une grille à onglets portent les trois tableaux, l\'un sous l\'autre dans l\'ordre des onglets : aucune feuille ne manque aux sorties qui lisent le texte',
    run: async (h) => {
      await settle(h);
      await h.resetEditor();
      const html = THREE();
      const resolved = await ReaderMode.resolvedHtml(html, 'Tbl', { id: 1 });
      const box = document.createElement('div');
      box.innerHTML = resolved.html;
      const tables = Array.from(box.querySelectorAll('table'));
      const checks = {
        three: tables.length === 3,
        order: tables.map(t => t.textContent.replace(/\s+/g, '')).join('|') === 'ProduitTotalVis12|ArticleResteVis40|Unenote',
      };
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, tables: tables.map(t => t.textContent.slice(0, 30)) }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.gridSheets = cases;
})();
