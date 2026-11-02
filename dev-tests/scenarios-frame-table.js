// Suite "frameTable" - un TABLEAU dans un cadre libre d'une présentation (js/free-frame.js, css/free-frame.css, js/pdf-export.js, js/docx-export.js, js/pptx-export.js, js/pptx-import.js),
// lot 10e du plan « Import PowerPoint sans perte » (choix d'Antoine, carte « Poser librement les tableaux d'un PowerPoint ») :
//  1) le MODÈLE : un cadre accepte un tableau (sans le ranger dans une citation), l'éditeur le dessine à sa place exacte (sans la marge de 6 px d'un tableau du texte) et le HTML fait l'aller-retour ;
//  2) les SORTIES : le PDF relu par pdf.js, le Word dézippé et le PowerPoint exporté puis relu par l'import gardent le tableau à la place du cadre.
// La lecture d'un fichier PowerPoint qui pose ses tableaux en cadres est dans dev-tests/scenarios-pptx-import.js.
(function () {
  const cases = [];
  const TABLE = '<table><tbody><tr data-row-height="60"><td colwidth="200"><p>A</p></td><td colwidth="200"><p>B</p></td></tr><tr data-row-height="40"><td colwidth="200"><p>C</p></td><td colwidth="200"><p>D</p></td></tr></tbody></table>';
  const PAD_X = 7.2;
  const PAD_Y = 3.6;
  const frameHtml = () => FreeFrame.html({ x: 100 - PAD_X, y: 80 - PAD_Y, w: 300 + 2 * PAD_X, h: 75 + 2 * PAD_Y }, TABLE);
  const box = el => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; };

  cases.push({
    id: 'frametable_the_editor_keeps_a_table_in_a_frame_at_its_exact_place',
    description: 'Un tableau posé dans un cadre libre y reste le tableau du cadre (pas rangé dans une citation), garde ses largeurs de colonne et ses hauteurs de ligne dans le HTML enregistré, et l\'éditeur le dessine contre le bord intérieur du cadre : sans la marge de 6 px au-dessus d\'un tableau du texte',
    run: async (h) => {
      await h.resetEditor();
      Editor.setHTML(frameHtml());
      await new Promise(r => setTimeout(r, 400));
      const dom = EditorCore.getEditor().view.dom;
      const content = dom.querySelector('.pp-free-frame-content');
      const table = dom.querySelector('.pp-free-frame-content table');
      const saved = new DOMParser().parseFromString('<body>' + Editor.getHTML() + '</body>', 'text/html').body;
      const savedContent = saved.querySelector('.pp-free-frame-content');
      const c = box(content);
      const t = table ? box(table) : null;
      const rows = Array.from(saved.querySelectorAll('tr')).map(tr => tr.getAttribute('data-row-height'));
      const widths = Array.from(saved.querySelectorAll('td')).map(td => td.getAttribute('colwidth'));
      const pass = !!table && !dom.querySelector('.pp-free-frame blockquote') && savedContent.firstElementChild.tagName === 'TABLE' && !savedContent.querySelector('blockquote')
        && JSON.stringify(rows) === '["60","40"]' && JSON.stringify(widths) === '["200","200","200","200"]'
        && Math.abs(t.top - c.top) <= 12 && Math.abs((t.height) - 100) <= 2;
      return { pass, notes: JSON.stringify({ content: c, table: t, rows, widths }) };
    },
  });

  cases.push({
    id: 'frametable_pdf_and_word_draw_the_table_where_the_frame_is',
    description: 'Le PDF (relu par pdf.js) écrit les quatre cases du tableau d\'un cadre à la place du cadre, la case « B » à droite de « A » et « C » sous « A » ; le Word garde un tableau et ses quatre textes dans le cadre',
    run: async (h) => {
      await h.resetEditor();
      const html = frameHtml();
      const pdf = await h.exportPdfContent(html, null);
      const truth = await h.extractPdfGroundTruth(pdf.base64);
      const at = name => truth.pages[0].textItems.find(t => t.str === name);
      const [a, b, c, d] = ['A', 'B', 'C', 'D'].map(at);
      const parts = await h.exportDocxParts(html, null);
      const tables = parts.doc.getElementsByTagName('w:tbl').length;
      const text = parts.doc.documentElement.textContent;
      const pass = !!(a && b && c && d) && b.x > a.x + 100 && Math.abs(b.y - a.y) < 3 && c.y > a.y + 40 && Math.abs(c.x - a.x) < 3 && a.x > 100 && a.x < 120 && a.y > 80 && a.y < 120
        && tables === 1 && /A.*B.*C.*D/.test(text);
      return { pass, notes: JSON.stringify({ pdf: [a, b, c, d].map(t => t && [Math.round(t.x), Math.round(t.y)]), tables, text }) };
    },
  });

  cases.push({
    id: 'frametable_powerpoint_export_and_import_round_trip_a_table_frame',
    description: 'Le tableau d\'un cadre exporté en PowerPoint (un tableau de la diapositive, à sa place) puis relu par l\'import redevient un tableau dans un cadre libre à la même place (à un point près), avec ses quatre cases, sans une ligne au rapport',
    run: async () => {
      await ExportEngines.ensure('pptx');
      await ExportEngines.ensure('pptxImport');
      const blob = await PptxExport.fromHtml(frameHtml(), { title: 'x' });
      const r = await PptxImport.fromBuffer(await blob.arrayBuffer());
      const doc = new DOMParser().parseFromString('<body>' + r.html + '</body>', 'text/html').body;
      const frames = Array.from(doc.querySelectorAll('.pp-free-frame')).filter(el => el.querySelector('table'));
      const back = frames.length ? FreeFrame.measuresOf(frames[0]) : null;
      const cells = frames.length ? Array.from(frames[0].querySelectorAll('td, th')).map(td => td.textContent.trim()) : [];
      const pass = frames.length === 1 && Math.abs(back.x - (100 - PAD_X)) <= 1 && Math.abs(back.y - (80 - PAD_Y)) <= 1 && JSON.stringify(cells) === '["A","B","C","D"]' && r.report.length === 0;
      return { pass, notes: JSON.stringify({ frames: frames.length, back: back && [back.x, back.y, back.w, back.h], cells, report: r.report }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.frameTable = cases;
})();
