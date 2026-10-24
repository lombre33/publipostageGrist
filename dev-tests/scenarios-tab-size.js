// Suite "tabSize" - le cran des tabulations d'un paragraphe (js/paragraph-format.js : `data-tab-size`, `tab-size`), lot « tabulations » du chantier 9 du plan « Import PowerPoint sans perte » :
// une tabulation d'un fichier PowerPoint tombait sur quatre espaces ; elle est maintenant le nœud-tabulation de l'éditeur (js/tab-indent.js) au cran du fichier (`defTabSz`, ou le premier cran régulier
// de `tabLst`). Ce que la suite garde :
//  1) le RÉGLAGE : l'attribut fait l'aller-retour du HTML (seul `data-tab-size` est lu, le cran de l'éditeur n'est pas écrit) ;
//  2) le DESSIN : la tabulation y tombe au cran du paragraphe, pas à celui de l'éditeur ;
//  3) les SORTIES : le PDF relu par pdf.js (le mot après la tabulation est au bon cran), le Word (`w:tabs`), le PowerPoint (`defTabSz`) et son aller-retour, le HTML exporté (`tab-size`).
// La lecture d'un fichier PowerPoint (les crans de `defTabSz` et de `tabLst`, le rapport) est dans dev-tests/scenarios-pptx-import.js.
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const ed = () => EditorCore.getEditor();
  const TAB = '<span class="pp-tab" style="white-space: pre-wrap">\t</span>';
  const SIZED = ' data-tab-size="72" style="tab-size: 72pt"';
  async function setDoc(h, html) {
    await h.resetEditor();
    Editor.setHTML(html);
    await sleep(150);
  }
  function inPage(html, read) {
    const host = document.createElement('div');
    host.className = 'tiptap';
    host.style.cssText = 'position:absolute;left:0;top:0;width:700px';
    host.innerHTML = html;
    document.body.appendChild(host);
    try { return read(host); } finally { host.remove(); }
  }
  async function pdfItems(base64) {
    await TestHelpers.ensurePdfJsLoaded();
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
    const page = await pdf.getPage(1);
    return (await page.getTextContent()).items.filter(i => i.str && i.str.trim()).map(i => ({ str: i.str, x: i.transform[4] }));
  }

  // === 1) Le réglage ===================================================================================================================================================
  cases.push({
    id: 'tabsize_attribute_survives_the_html_round_trip_and_only_data_attribute_is_read',
    description: 'Le cran des tabulations est l\'attribut `tabSize` du paragraphe (en points), écrit `data-tab-size` et `tab-size` ; seul `data-tab-size` est lu à l\'ouverture d\'un HTML (un style `tab-size` seul, collé d\'ailleurs, est ignoré) ; le cran de l\'éditeur (12,7 mm, 36 pt) n\'est pas écrit ; une valeur hors bornes est ramenée à ses bornes ; l\'aller-retour ne change pas le HTML',
    run: async (h) => {
      await setDoc(h, '<p' + SIZED + '>A' + TAB + 'B</p><p style="tab-size: 20pt">C</p><p data-tab-size="36" style="tab-size: 36pt">D</p><p data-tab-size="3">E</p><p data-tab-size="abc">F</p>');
      const attrs = [];
      ed().state.doc.forEach((node) => { if (node.type.name === 'paragraph' && node.textContent) attrs.push(node.textContent[0] + ':' + node.attrs.tabSize); });
      const html = Editor.getHTML();
      await setDoc(h, html);
      const again = Editor.getHTML();
      const pass = attrs.join(' ') === 'A:72 C:null D:null E:6 F:null' && /<p data-tab-size="72" style="tab-size: 72pt;?">A/.test(html) && !/data-tab-size="36"/.test(html) && !/tab-size: 20pt/.test(html) && again === html;
      return { pass, notes: JSON.stringify({ attrs, html }) };
    },
  });

  // === 2) Le dessin ====================================================================================================================================================
  cases.push({
    id: 'tabsize_the_tab_falls_on_the_paragraph_stop_not_the_editor_one',
    description: 'Dans l\'éditeur, la tabulation d\'un paragraphe à cran de 72 pt (96 px) tombe à 96 px de la marge, celle d\'un paragraphe ordinaire à 48 px (12,7 mm)',
    run: async (h) => {
      await setDoc(h, '<p' + SIZED + '>A' + TAB + 'B</p><p>A' + TAB + 'B</p>');
      const xs = Array.from(ed().view.dom.querySelectorAll('p')).slice(0, 2).map((p) => {
        const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = walker.nextNode())) {
          const at = n.textContent.indexOf('B');
          if (at < 0) continue;
          const r = document.createRange(); r.setStart(n, at); r.setEnd(n, at + 1);
          return Math.round(r.getBoundingClientRect().left - p.getBoundingClientRect().left);
        }
        return null;
      });
      const pass = xs[0] === 96 && xs[1] === 48;
      return { pass, notes: JSON.stringify(xs) };
    },
  });

  // === 3) Les sorties ==================================================================================================================================================
  cases.push({
    id: 'tabsize_pdf_puts_the_word_after_the_tab_on_the_paragraph_stop',
    description: 'PDF relu par pdf.js : le mot qui suit la tabulation d\'un paragraphe à cran de 72 pt est 72 pt après le début du texte, celui d\'un paragraphe ordinaire 36 pt après (12,7 mm)',
    run: async (h) => {
      const out = await h.exportPdfContent('<p' + SIZED + '>Aaa' + TAB + 'Bbb</p><p>Ccc' + TAB + 'Ddd</p>');
      const items = await pdfItems(out.base64);
      const x = word => { const i = items.find(it => it.str.indexOf(word) !== -1); return i ? i.x : null; };
      // Le texte du bloc peut être coupé en plusieurs morceaux : on lit l'écart entre le début du mot « A » et celui de « B ».
      const gap = (a, b) => (x(a) !== null && x(b) !== null ? Math.round(x(b) - x(a)) : null);
      const sized = gap('Aaa', 'Bbb');
      const plain = gap('Ccc', 'Ddd');
      const pass = sized !== null && plain !== null && Math.abs(sized - 72) <= 3 && Math.abs(plain - 36) <= 3;
      return { pass, notes: JSON.stringify({ sized, plain, items }) };
    },
  });

  cases.push({
    id: 'tabsize_word_writes_tabs_stops_for_the_paragraph',
    description: 'Word (OOXML dézippé) : un paragraphe à cran de 72 pt porte `w:tabs` avec des crans à gauche tous les 1440 twips ; un paragraphe ordinaire n\'a pas de `w:tabs` (le cran du document, 720 twips, suffit)',
    run: async (h) => {
      const out = await h.exportDocxParts('<p' + SIZED + '>Aaa' + TAB + 'Bbb</p><p>Ccc' + TAB + 'Ddd</p><ul><li><p' + SIZED + '>Eee' + TAB + 'Fff</p></li></ul>');
      const paragraphs = Array.from(out.doc.getElementsByTagName('w:p'));
      const stops = (word) => {
        const p = paragraphs.find(x => x.textContent.indexOf(word) !== -1);
        const tabs = p && p.getElementsByTagName('w:pPr')[0] && p.getElementsByTagName('w:pPr')[0].getElementsByTagName('w:tabs')[0];
        return tabs ? Array.from(tabs.getElementsByTagName('w:tab')).map(t => t.getAttribute('w:val') + ':' + t.getAttribute('w:pos')) : null;
      };
      const got = { A: stops('Aaa'), C: stops('Ccc'), E: stops('Eee') };
      const pass = !!got.A && got.A[0] === 'left:1440' && got.A[1] === 'left:2880' && got.C === null && !!got.E && got.E[0] === 'left:1440';
      return { pass, notes: JSON.stringify({ A: got.A && got.A.slice(0, 3), C: got.C, E: got.E && got.E.slice(0, 2) }) };
    },
  });

  cases.push({
    id: 'tabsize_powerpoint_export_writes_def_tab_sz_and_round_trips',
    description: 'PowerPoint exporté (cadre de diapositive) : un paragraphe à cran de 72 pt porte `defTabSz="914400"` (1 pouce), un paragraphe ordinaire à tabulation porte celui de l\'éditeur, `457200` (PowerPoint en suppose 1 pouce à défaut) ; relu par l\'import, le paragraphe garde son cran (72 pt à la taille de page près), l\'ordinaire garde le sien (rien d\'écrit) et le rapport est vide',
    run: async () => {
      await ExportEngines.ensure('pptx');
      await ExportEngines.ensure('pptxImport');
      const html = FreeFrame.html({ x: 60, y: 60, w: 500, h: 300 }, '<p' + SIZED + '>Aaa' + TAB + 'Bbb</p><p>Ccc' + TAB + 'Ddd</p>');
      const blob = await PptxExport.fromHtml(html, { title: 'x' });
      const buffer = await blob.arrayBuffer();
      const zip = await JSZip.loadAsync(buffer);
      const xml = await zip.file('ppt/slides/slide1.xml').async('string');
      const open = word => ((xml.match(/<a:p>.*?<\/a:p>/g) || []).find(p => p.indexOf(word) >= 0) || '').match(/<a:pPr[^>]*>/);
      const sized = open('Aaa'), plain = open('Ccc');
      const r = await PptxImport.fromBuffer(buffer);
      const doc = new DOMParser().parseFromString('<body>' + r.html + '</body>', 'text/html').body;
      const find = word => Array.from(doc.querySelectorAll('p')).find(p => p.textContent.indexOf(word) >= 0);
      const back = find('Aaa') && find('Aaa').getAttribute('data-tab-size');
      const plainBack = find('Ccc') && find('Ccc').getAttribute('data-tab-size');
      const pass = !!sized && /defTabSz="914400"/.test(sized[0]) && !!plain && /defTabSz="457200"/.test(plain[0]) && back !== null && Math.abs(parseFloat(back) - 72) < 3 && plainBack === null && doc.querySelectorAll('span.pp-tab').length === 2 && r.report.length === 0;
      return { pass, notes: JSON.stringify({ sized: sized && sized[0], plain: plain && plain[0], back, report: r.report }) };
    },
  });

  cases.push({
    id: 'tabsize_html_export_keeps_the_stop',
    description: 'Le HTML exporté garde le cran des tabulations (`tab-size: 72pt`) du paragraphe réglé et rien sur un paragraphe ordinaire',
    run: async (h) => {
      const out = await h.exportHtml('<p' + SIZED + '>Aaa' + TAB + 'Bbb</p><p>Ccc' + TAB + 'Ddd</p>');
      const pass = /<p[^>]*tab-size: 72pt[^>]*>\s*Aaa/.test(out.text) && !/<p[^>]*tab-size[^>]*>\s*Ccc/.test(out.text);
      return { pass, notes: out.text.slice(out.text.indexOf('Aaa') - 200, out.text.indexOf('Aaa') + 40) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.tabSize = cases;
})();
