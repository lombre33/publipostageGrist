// Suite "tableOutputs" - un tableau de document redimensionné, vu dans l'éditeur, la Lecture, l'impression, le PDF et le Word (12/10, question « les nouveaux
// tableaux ressortent-ils proprement avec toutes les configurations possibles : redimensionnement, tous les modes d'affichage et d'export ? »). Le même tableau est
// posé, puis mesuré dans chaque sortie - largeurs de colonnes, hauteurs de ligne, bord droit contre la page - dans des pages de formats, de sens et de marges
// différents, posé AVANT ou APRÈS l'Aperçu A4, seul ou dans une liste, une citation, un encadré, une zone à deux colonnes. Le PDF est mesuré sur les traits que pdfmake
// peint (js/pdf-export.js), le Word sur son <w:tblGrid> et ses <w:tblInd> (js/docx-export.js), la Lecture et l'impression sur leur DOM (js/reader-mode.js, js/print-export.js).
// Ce que la suite ne mesure pas : le Word lui-même (le .docx n'est lu ici que comme XML ; à l'œil, LibreOffice le rend dans le conteneur de test) et Grist réel.
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const r1 = n => Math.round(n * 10) / 10;
  const ed = () => EditorCore.getEditor();
  const sum = a => a.reduce((s, x) => s + x, 0);
  const near = (a, b, tol) => !!a && !!b && a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) <= tol);
  const NO_HF = () => ({ enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } });

  // Un tableau tel que l'éditeur l'enregistre : largeurs (px de mise en page, null = automatique), hauteurs de ligne (px, null = automatique), lignes.
  function tableHtml({ widths, rows = 3, heights = [], text = (r, c) => `L${r + 1}${'ABCDEFGHIJKL'[c]}`, firstRow = null, cellAttrs = () => '', rowAttrs = () => '', tableAttrs = '' }) {
    const sized = widths.every(w => w);
    const anySized = widths.some(w => w);
    const total = sized ? sum(widths) : 0;
    const colgroup = anySized ? '<colgroup>' + widths.map(w => (w ? `<col style="width: ${w}px;">` : '<col>')).join('') + '</colgroup>' : '';
    const body = Array.from({ length: rows }, (_, r) => {
      const h = heights[r];
      const attrs = (h ? ` data-row-height="${h}" style="height: ${h}px"` : '') + rowAttrs(r);
      if (r === 0 && firstRow) return `<tr${attrs}>` + firstRow + '</tr>';
      return `<tr${attrs}>` + widths.map((w, c) => `<td colspan="1" rowspan="1"${w ? ` colwidth="${w}"` : ''}${cellAttrs(r, c)}><p>${text(r, c)}</p></td>`).join('') + '</tr>';
    }).join('');
    return `<table${sized ? ` style="width: ${total}px;"` : ''}${tableAttrs}>${colgroup}<tbody>${body}</tbody></table>`;
  }

  const topTable = root => Array.from(root.querySelectorAll('table')).find(t => !t.parentElement.closest('table'));
  // Le tableau de premier niveau d'un affichage : largeur, colonnes, lignes et bord gauche (depuis le bord gauche du texte de la page), en pixels de mise en page.
  function domGeometry(root) {
    const table = topTable(root);
    if (!table) return null;
    const z = EditorCore.layoutZoom(table);
    const cols = Array.from(table.querySelectorAll(':scope > colgroup > col')).map(c => c.getBoundingClientRect().width / z);
    const firstRow = table.querySelector('tr');
    const cells = Array.from(firstRow ? firstRow.children : []).map(c => c.getBoundingClientRect().width / z);
    const rows = Array.from(table.querySelectorAll(':scope > tbody > tr, :scope > tbody > span > tr')).map(tr => tr.getBoundingClientRect().height / z);
    const contentLeft = root.getBoundingClientRect().left / z + (parseFloat(getComputedStyle(root).paddingLeft) || 0);
    const left = table.getBoundingClientRect().left / z;
    return { table: r1(table.getBoundingClientRect().width / z), rel: r1(left - contentLeft), cols: (cols.length ? cols : cells).map(r1), rows: rows.map(r1) };
  }

  // Le tableau d'un enregistrement posé dans l'éditeur (A4 allumé ou non), puis mesuré dans l'éditeur, la Lecture, le PDF et le Word du même HTML.
  async function measureAll(h, html, { a4 = true, wrap = s => s, page = null, rowLabel = 'L1' } = {}) {
    await h.resetEditor();
    h.setA4Preview(a4);
    const before = { orientation: PageLayout.getOrientation(), format: PageLayout.getFormat(), margins: PageLayout.getMarginsMm() };
    try {
      if (page && page.format) PageLayout.setFormat(page.format);
      if (page && page.orientation) PageLayout.setOrientation(page.orientation);
      if (page && page.margins) PageLayout.setMarginsMm(Object.assign({}, PageLayout.getMarginsMm(), page.margins));
      await sleep(150);
      return await measureAllIn(h, html, { wrap, rowLabel });
    } finally {
      PageLayout.setFormat(before.format);
      PageLayout.setOrientation(before.orientation);
      PageLayout.setMarginsMm(before.margins);
      await sleep(100);
    }
  }

  // Le texte d'un nœud pdfmake (le texte, ses enfants, la pile d'une case).
  const pdfText = n => (n == null ? '' : typeof n === 'string' ? n : Array.isArray(n) ? n.map(pdfText).join('') : pdfText(n.text) + pdfText(n.stack));
  // Les blocs de premier niveau du PDF : un texte (avec sa marge gauche, en points) ou un tableau (ses cases, sa marge gauche).
  const pdfBlocks = content => content.map(node => (node.table
    ? { kind: 'table', cells: node.table.body.map(row => row.map(cell => pdfText(cell))), indentPt: Array.isArray(node.margin) ? node.margin[0] : 0 }
    : { kind: 'text', text: pdfText(node.text), indentPt: Array.isArray(node.margin) ? node.margin[0] : 0 }));

  async function measureAllIn(h, html, { wrap, rowLabel = 'L1' }) {
    if (html != null) { Editor.setHTML(wrap(html)); await sleep(350); }
    const saved = Editor.getHTML();
    const marginsPt = PageLayout.getMarginsPt();
    const out = { savedTable: (saved.match(/<table[^>]*>/) || [''])[0], content: r1(EditorCore.editorContentWidthPx(ed())) };
    out.editor = domGeometry(h.tiptap());
    const reader = await h.renderReaderMode(saved, null);
    await sleep(250);
    out.reader = domGeometry(reader);
    const pdf = await h.exportPdfContent(saved, null, marginsPt);
    const painted = (await h.extractPdfLines(pdf.base64)).pages[0];
    const truth = (await h.extractPdfGroundTruth(pdf.base64)).pages[0];
    const distinct = vals => vals.sort((a, b) => a - b).filter((v, i, all) => i === 0 || v - all[i - 1] > 1);
    const xsAll = distinct(painted.lines.filter(l => Math.abs(l.x1 - l.x2) < 0.01).map(l => l.x1));
    const ys = distinct(painted.lines.filter(l => Math.abs(l.y1 - l.y2) < 0.01).map(l => l.y1));
    // Les bords de colonnes du tableau : pour chaque case de la première ligne (L1A, L1B...), le trait vertical le plus proche à sa gauche, puis le premier à droite de la dernière.
    const firstRow = truth.textItems.filter(it => new RegExp('^' + rowLabel + '[A-L]$').test(it.str.trim())).sort((a, b) => a.x - b.x);
    let xs = xsAll;
    if (firstRow.length) {
      const leftOf = x => xsAll.filter(v => v <= x + 0.5).slice(-1)[0];
      xs = firstRow.map(it => leftOf(it.x));
      const last = firstRow[firstRow.length - 1];
      xs.push(xsAll.find(v => v > last.x + last.width));
    }
    out.pdf = {
      cols: xs.slice(1).map((x, i) => r1((x - xs[i]) / 0.75)),
      rows: ys.slice(1).map((y, i) => r1((y - ys[i]) / 0.75)),
      left: r1((xs[0] || 0) / 0.75), right: r1((xs[xs.length - 1] || 0) / 0.75),
      pageContent: r1((painted.width - pdf.docDefinition.pageMargins[0] - pdf.docDefinition.pageMargins[2]) / 0.75),
      pageLeft: r1(pdf.docDefinition.pageMargins[0] / 0.75),
      pages: pdf.pageCount, blocks: pdfBlocks(pdf.content),
    };
    const word = await h.exportDocxParts(saved, null, PageLayout.getMarginsTwip());
    const hasLabel = t => new RegExp(rowLabel + 'A').test(t.textContent);
    const tbls = Array.from(word.doc.getElementsByTagName('w:tbl')).filter(t => hasLabel(t) && !Array.from(t.getElementsByTagName('w:tbl')).some(hasLabel));
    const grid = tbls[0] ? Array.from(tbls[0].getElementsByTagName('w:tblGrid')[0].getElementsByTagName('w:gridCol')).map(g => Number(g.getAttribute('w:w'))) : null;
    const tblInd = tbls[0] ? tbls[0].getElementsByTagName('w:tblInd')[0] : null;
    const sect = h.docxSectionProps(word.doc);
    const trH = Array.from(word.doc.getElementsByTagName('w:trHeight')).map(e => Number(e.getAttribute('w:val')) / 15);
    const body = word.doc.getElementsByTagName('w:body')[0];
    const paragraphKind = p => 'p[' + Array.from(p.getElementsByTagName('w:t')).map(t => t.textContent).join('') + ']' + (p.getElementsByTagName('w:numPr').length ? '#num' : '');
    out.word = {
      cols: grid ? grid.map(w => r1(w / 15)) : null, rowH: trH.map(r1), indent: tblInd ? r1(Number(tblInd.getAttribute('w:w')) / 15) : 0,
      pageContent: sect ? r1((sect.widthTwip - sect.margins.left - sect.margins.right) / 15) : null, nTables: tbls.length,
      kinds: Array.from(body.children).filter(c => c.nodeName !== 'w:sectPr').map(c => (c.nodeName === 'w:tbl' ? 'tbl' : paragraphKind(c))),
    };
    return out;
  }

  // Les écarts entre sorties : l'éditeur est la référence. La Lecture ne s'écarte pas d'un demi-pixel ; le PDF (traits de 0,75 pt) et le Word (marges de case de
  // 216 twips) d'un pixel et demi par colonne.
  function issuesOf(m, { tolR = 1.5, tolP = 2, tolW = 3.5 } = {}) {
    const bad = [];
    const e = m.editor; const rd = m.reader; const p = m.pdf; const w = m.word;
    if (!e || !rd || !p.cols.length || !w.cols) { bad.push('une sortie sans tableau : ' + JSON.stringify({ e: !!e, r: !!rd, p: p.cols.length, w: !!w.cols })); return bad; }
    if (!near(e.cols, rd.cols, tolR)) bad.push('Lecture ≠ éditeur : ' + JSON.stringify(rd.cols) + ' / ' + JSON.stringify(e.cols));
    if (!near(e.cols, p.cols, tolP)) bad.push('PDF ≠ éditeur : ' + JSON.stringify(p.cols) + ' / ' + JSON.stringify(e.cols));
    if (!near(e.cols, w.cols, tolW)) bad.push('Word ≠ éditeur : ' + JSON.stringify(w.cols) + ' / ' + JSON.stringify(e.cols));
    if (!near(e.rows, rd.rows, tolR)) bad.push('lignes de la Lecture ≠ éditeur : ' + JSON.stringify(rd.rows) + ' / ' + JSON.stringify(e.rows));
    if (!near(e.rows, p.rows, tolP)) bad.push('lignes du PDF ≠ éditeur : ' + JSON.stringify(p.rows) + ' / ' + JSON.stringify(e.rows));
    if (e.table > m.content + 2) bad.push('éditeur : tableau ' + e.table + ' plus large que la page ' + m.content);
    if (rd.table > m.content + 2) bad.push('Lecture : tableau ' + rd.table + ' plus large que la page ' + m.content);
    if (p.right - p.left > p.pageContent + 2) bad.push('PDF : tableau ' + r1(p.right - p.left) + ' plus large que la page ' + p.pageContent);
    if (sum(w.cols) + w.indent > w.pageContent + 6) bad.push('Word : tableau ' + r1(sum(w.cols) + w.indent) + ' plus large que la page ' + w.pageContent);
    return bad;
  }
  const compact = m => 'e=' + JSON.stringify(m.editor && m.editor.cols) + ' r=' + JSON.stringify(m.reader && m.reader.cols) + ' p=' + JSON.stringify(m.pdf.cols) + ' w=' + JSON.stringify(m.word.cols) + ' (page ' + m.content + '/' + m.pdf.pageContent + '/' + m.word.pageContent + ')';

  // Les largeurs posées par la personne : ce que l'éditeur enregistre (colwidth de chaque case et <col> du tableau).
  const CONFIGS = {
    narrow3: { widths: [100, 140, 120] },
    page3: { widths: [200, 280, 240] },
    over10: { widths: [200, 290, 240] },
    wide3: { widths: [400, 400, 400] },
    huge12: { widths: Array(12).fill(120) },
    auto3: { widths: [null, null, null] },
    mixed3: { widths: [100, null, null] },
    one: { widths: [300] },
    oneWide: { widths: [1000] },
    heightsSome: { widths: [100, 140, 120], heights: [60, null, 90] },
    heightsTall: { widths: [100, 140, 120], rows: 5, heights: [200, 200, 200, 200, 200] },
  };

  cases.push({
    id: 'tableoutputs_widths_and_heights_agree_in_every_view_and_export',
    description: 'Un tableau posé avec l\'Aperçu A4 (étroit, à la largeur de la page, un peu plus large, trois fois trop large, douze colonnes, colonnes automatiques ou mêlées, une colonne, lignes à hauteur réglée) a les mêmes colonnes et les mêmes lignes dans l\'éditeur, la Lecture, le PDF et le Word, et aucune sortie ne dépasse la page',
    run: async (h) => {
      const bad = [];
      for (const [name, spec] of Object.entries(CONFIGS)) {
        const m = await measureAll(h, tableHtml(spec));
        const issues = issuesOf(m);
        if (issues.length) bad.push(name + ' : ' + issues.join(' ; ') + ' | ' + compact(m));
      }
      return { pass: !bad.length, notes: bad.length ? '\n' + bad.join('\n') : Object.keys(CONFIGS).length + ' configurations d\'accord' };
    },
  });

  const PAGES = {
    a4l: { format: 'A4', orientation: 'landscape' },
    a5p: { format: 'A5', orientation: 'portrait' },
    a3p: { format: 'A3', orientation: 'portrait' },
    a4pTight: { format: 'A4', orientation: 'portrait', margins: { left: 10, right: 10 } },
    a4pWide: { format: 'A4', orientation: 'portrait', margins: { left: 40, right: 40 } },
  };
  cases.push({
    id: 'tableoutputs_page_formats_orientations_and_margins',
    description: 'Le même tableau dans une page A4 paysage, A5, A3, aux marges étroites ou larges : éditeur, Lecture, PDF et Word le montrent aux mêmes colonnes, dans la page',
    run: async (h) => {
      const bad = [];
      for (const [pname, page] of Object.entries(PAGES)) {
        for (const cname of ['narrow3', 'page3', 'wide3']) {
          const m = await measureAll(h, tableHtml(CONFIGS[cname]), { page });
          const issues = issuesOf(m);
          if (issues.length) bad.push(pname + '/' + cname + ' : ' + issues.join(' ; ') + ' | ' + compact(m));
        }
      }
      return { pass: !bad.length, notes: bad.length ? '\n' + bad.join('\n') : 'ok' };
    },
  });

  cases.push({
    id: 'tableoutputs_page_changed_after_the_table_was_laid',
    description: 'La page change après la pose du tableau (A4 vers A5, vers paysage, marges élargies) : le tableau est ramené dans la nouvelle page, partout pareil ; un tableau qui tient déjà ne bouge pas',
    run: async (h) => {
      const bad = [];
      const trials = {
        'A4->A5': () => PageLayout.setFormat('A5'),
        'A4->paysage': () => PageLayout.setOrientation('landscape'),
        'marges 40 mm': () => { PageLayout.setMarginsMm(Object.assign({}, PageLayout.getMarginsMm(), { left: 40, right: 40 })); Editor.refreshLayout(); },
      };
      for (const [tname, mutate] of Object.entries(trials)) {
        for (const cname of ['page3', 'narrow3']) {
          await h.resetEditor();
          h.setA4Preview(true);
          const before = { orientation: PageLayout.getOrientation(), format: PageLayout.getFormat(), margins: PageLayout.getMarginsMm() };
          try {
            Editor.setHTML(tableHtml(CONFIGS[cname]));
            await sleep(350);
            mutate();
            await sleep(500);
            const m = await measureAllIn(h, null, { wrap: s => s });
            const issues = issuesOf(m);
            if (cname === 'narrow3' && !near(m.editor.cols, CONFIGS[cname].widths, 0.5)) issues.push('un tableau qui tient a bougé : ' + JSON.stringify(m.editor.cols));
            if (issues.length) bad.push(tname + '/' + cname + ' : ' + issues.join(' ; ') + ' | ' + compact(m));
          } finally {
            PageLayout.setFormat(before.format); PageLayout.setOrientation(before.orientation); PageLayout.setMarginsMm(before.margins);
            await sleep(150);
          }
        }
      }
      return { pass: !bad.length, notes: bad.length ? '\n' + bad.join('\n') : 'ok' };
    },
  });

  // Un tableau qui a de tout : cases fusionnées, fonds, alignements verticaux, bords réglés, hauteurs.
  const complexHtml = () => {
    const td = (label, { cs = 1, rs = 1, w = null, attrs = '' } = {}) => `<td colspan="${cs}" rowspan="${rs}"${w ? ` colwidth="${w}"` : ''}${attrs}><p>${label}</p></td>`;
    const rows = [
      `<tr data-row-height="40" style="height: 40px">${td('L1A', { cs: 2, w: '120,160', attrs: ' style="background-color: rgb(255, 242, 204);"' })}${td('L1C', { w: '140' })}${td('L1D', { w: '100', attrs: ' data-valign="middle"' })}</tr>`,
      `<tr>${td('L2A', { rs: 2, w: '120', attrs: ' data-valign="bottom"' })}${td('L2B', { w: '160' })}${td('L2C', { w: '140', attrs: ' data-border-top="#ff0000"' })}${td('L2D', { w: '100' })}</tr>`,
      `<tr data-row-height="70" style="height: 70px">${td('L3B', { w: '160' })}${td('L3C', { cs: 2, w: '140,100', attrs: ' data-valign="middle"' })}</tr>`,
      `<tr>${td('L4A', { w: '120' })}${td('L4B', { w: '160' })}${td('L4C', { w: '140' })}${td('L4D', { w: '100' })}</tr>`,
    ];
    return `<table style="width: 520px;"><colgroup><col style="width: 120px;"><col style="width: 160px;"><col style="width: 140px;"><col style="width: 100px;"></colgroup><tbody>${rows.join('')}</tbody></table>`;
  };
  const WRAPS = {
    twocol: t => '<div class="two-columns-zone" style="--layout-left: 50%"><div class="two-columns-column">' + t + '</div><div class="two-columns-column"><p>Texte à côté</p></div></div>',
    callout: t => '<div class="callout" data-color="green" data-icon="check"><p>Dans un encadré</p>' + t + '</div>',
    list: t => '<ul><li><p>Un item</p>' + t + '</li></ul>',
    quote: t => '<blockquote><p>Une citation</p>' + t + '</blockquote>',
  };

  cases.push({
    id: 'tableoutputs_merged_colored_bordered_table_with_set_heights_is_the_same_everywhere',
    description: 'Un tableau aux cases fusionnées, colorées, alignées, bordées et aux lignes de hauteur réglée (40 et 70 px) garde ses colonnes et ses hauteurs dans l\'éditeur, la Lecture, le PDF et le Word, seul comme dans une zone à deux colonnes ou un encadré',
    run: async (h) => {
      const bad = [];
      for (const [name, wrap] of [['seul', s => s], ['deux colonnes', WRAPS.twocol], ['encadré', WRAPS.callout]]) {
        const m = await measureAll(h, complexHtml(), { wrap, rowLabel: 'L4' });
        const issues = issuesOf(m);
        if (!near(m.word.rowH, [40, 70], 0.5)) issues.push('hauteurs du Word : ' + JSON.stringify(m.word.rowH));
        if (issues.length) bad.push(name + ' : ' + issues.join(' ; ') + ' | ' + compact(m));
      }
      return { pass: !bad.length, notes: bad.length ? '\n' + bad.join('\n') : 'ok' };
    },
  });

  // Un tableau enregistré SANS l'Aperçu A4 (aucune limite : il peut dépasser la page) : le PDF et le Word, eux, n'ont qu'une page.
  const STORED_WIDE = ['wide3', 'huge12', 'oneWide', 'over10'];
  cases.push({
    id: 'tableoutputs_a_table_stored_wider_than_the_page_fits_the_page_in_pdf_and_word',
    description: 'Un tableau posé sans Aperçu A4, 1 200 px de large pour une page de 719 px (ou 1 440, 1 000, 730), sort du PDF et du Word dans la page : colonnes au prorata (le Word écrit la grille et chaque case à la même largeur), jamais sur la marge',
    run: async (h) => {
      const bad = [];
      for (const name of STORED_WIDE) {
        const spec = CONFIGS[name];
        await h.resetEditor();
        h.setA4Preview(false);
        Editor.setHTML(tableHtml(spec));
        await sleep(350);
        const saved = Editor.getHTML();
        const stored = (saved.match(/width: (\d+)px/) || [])[1];
        if (!(Number(stored) > 719.1 + 2 - 1)) { bad.push(name + ' : le tableau posé sans la page n\'est pas plus large que la page (' + stored + ')'); continue; }
        const pdf = await h.exportPdfContent(saved, null, PageLayout.getMarginsPt());
        const painted = (await h.extractPdfLines(pdf.base64)).pages[0];
        const xs = painted.lines.filter(l => Math.abs(l.x1 - l.x2) < 0.01).map(l => l.x1).sort((a, b) => a - b);
        const pdfWidth = ((xs[xs.length - 1] || 0) - (xs[0] || 0)) / 0.75;
        const pageContent = (painted.width - pdf.docDefinition.pageMargins[0] - pdf.docDefinition.pageMargins[2]) / 0.75;
        const word = await h.exportDocxParts(saved, null, PageLayout.getMarginsTwip());
        const table = h.docxTables(word.doc)[0];
        const sect = h.docxSectionProps(word.doc);
        const wordCols = table ? table.gridCols.map(w => w / 15) : [];
        const wordPage = (sect.widthTwip - sect.margins.left - sect.margins.right) / 15;
        const cellsMatchGrid = table && table.rows[0].cells.every((c, i) => Math.abs(c.widthTwip - table.gridCols[i]) <= 2);
        const ratio = (cols, total) => cols.map(w => w / total);
        const wantRatio = ratio(spec.widths, sum(spec.widths));
        const gotRatio = ratio(wordCols, sum(wordCols));
        const proportional = wordCols.length === spec.widths.length && gotRatio.every((x, i) => Math.abs(x - wantRatio[i]) < 0.02);
        if (pdfWidth > pageContent + 2) bad.push(name + ' : PDF ' + r1(pdfWidth) + ' > page ' + r1(pageContent));
        if (sum(wordCols) > wordPage + 2) bad.push(name + ' : Word ' + r1(sum(wordCols)) + ' > page ' + r1(wordPage));
        if (!cellsMatchGrid) bad.push(name + ' : les cases du Word ne suivent pas la grille');
        if (!proportional) bad.push(name + ' : proportions du Word ' + JSON.stringify(gotRatio.map(x => r1(x * 100))));
      }
      return { pass: !bad.length, notes: bad.length ? '\n' + bad.join('\n') : 'ok' };
    },
  });

  // La Lecture et l'impression d'un tableau enregistré plus large que la page (posé sans l'Aperçu A4, repris d'un modèle Grille, assemblé dans un macro-modèle) : comme l'éditeur
  // avec l'Aperçu A4, elles le ramènent dans la page ; sans Aperçu A4 il n'y a pas de page, la Lecture le laisse comme il est écrit.
  cases.push({
    id: 'tableoutputs_reader_and_print_bring_a_stored_wide_table_into_the_page',
    description: 'Lecture (Aperçu A4) et impression du navigateur : un tableau enregistré à 1 200 px, 1 440 px ou 730 px dans une page de 719 px est ramené dans le texte de la page, colonnes au prorata ; un tableau étroit n\'est pas touché ; sans Aperçu A4 la Lecture garde la largeur écrite',
    run: async (h) => {
      const bad = [];
      const contentPx = PageLayout.getPageSizePx().width - PageLayout.getMarginsPx().left - PageLayout.getMarginsPx().right;
      for (const name of ['wide3', 'huge12', 'over10', 'narrow3']) {
        const spec = CONFIGS[name];
        const html = tableHtml(spec);
        const overWide = sum(spec.widths) > contentPx;
        const wantRatio = spec.widths.map(w => w / sum(spec.widths));
        const proportional = cols => cols.length === spec.widths.length && cols.every((c, i) => Math.abs(c / sum(cols) - wantRatio[i]) < 0.01);
        await h.resetEditor();
        h.setA4Preview(true);
        const reader = await h.renderReaderMode(html, null);
        await sleep(250);
        const g = domGeometry(reader);
        if (overWide ? !(g.table <= contentPx + 2 && proportional(g.cols)) : !near(g.cols, spec.widths, 0.5)) bad.push(name + ' : Lecture ' + g.table + ' / page ' + r1(contentPx) + ' ' + JSON.stringify(g.cols));
        const job = await PrintExport.prepare(html, null, { id: 1 }, NO_HF(), 'essai');
        try {
          const sheet = job.frame.contentDocument.querySelector('.pp-print-sheet');
          const table = sheet.querySelector('table');
          const sr = sheet.getBoundingClientRect(); const tr = table.getBoundingClientRect();
          const m = PageLayout.getMarginsPx();
          const printed = Array.from(table.querySelectorAll(':scope > colgroup > col')).map(c => c.getBoundingClientRect().width);
          const rightLimit = sr.width - m.right;
          if (overWide ? !(tr.right - sr.left <= rightLimit + 2 && proportional(printed)) : !near(printed.map(r1), spec.widths, 0.5)) bad.push(name + ' : impression, bord droit ' + r1(tr.right - sr.left) + ' / ' + r1(rightLimit) + ' ' + JSON.stringify(printed.map(r1)));
        } finally { job.dispose(); }
      }
      h.setA4Preview(false);
      const readerNoPage = await h.renderReaderMode(tableHtml(CONFIGS.wide3), null);
      await sleep(250);
      const noPage = domGeometry(readerNoPage);
      if (!near(noPage.cols, [400, 400, 400], 0.5)) bad.push('sans Aperçu A4 la Lecture a changé la largeur écrite : ' + JSON.stringify(noPage.cols));
      return { pass: !bad.length, notes: bad.length ? '\n' + bad.join('\n') : 'ok' };
    },
  });

  // Allumer l'Aperçu A4 APRÈS la pose d'un tableau trop large : le tableau rentre aussitôt (sans attendre une frappe), et ce n'est pas une modification du document.
  cases.push({
    id: 'tableoutputs_turning_the_a4_preview_on_fits_a_wide_table_without_marking_the_document_modified',
    description: 'Case « Aperçu A4 » décochée, un tableau de 1 200 px est posé et enregistré ; cochée, il rentre aussitôt dans la page (colonnes au prorata) sans une frappe, et le coin d\'état ne dit pas « Modifications non enregistrées » ; une frappe, elle, le dit',
    run: async (h) => {
      const toggle = document.getElementById('v2-toggle-a4-preview');
      const autoRow = document.getElementById('v2-btn-autosave');
      const statusEl = document.getElementById('status-msg');
      const unsaved = () => statusEl.classList.contains('is-unsaved');
      const setReal = async on => { if (toggle.checked !== on) { toggle.click(); await sleep(350); } };
      const autosaveWas = autoRow.getAttribute('aria-checked') === 'true';
      const bad = [];
      let out = {};
      try {
        await h.resetEditor();
        await setReal(true);
        // Un modèle réellement enregistré, enregistrement automatique coupé : « Modifications non enregistrées » dit alors l'état du document.
        document.getElementById('template-name').value = 'Tableau Aperçu A4';
        Editor.setHTML('<p>Départ</p>');
        await h.clickButton('btn-save');
        await h.sleep(400);
        if (autosaveWas) await h.clickButton('v2-btn-autosave');
        await setReal(false);
        Editor.setHTML(tableHtml(CONFIGS.wide3));
        await sleep(350);
        await h.clickButton('btn-save');
        await h.sleep(400);
        const offState = { table: domGeometry(h.tiptap()).table, unsaved: unsaved() };
        // Le témoin : une frappe allume bien l'état « non enregistré », qu'un Enregistrer éteint.
        await h.focusAtEnd();
        await h.typeText('x');
        await h.sleep(80);
        const typed = unsaved();
        await h.clickButton('btn-save');
        await h.sleep(400);
        const cleanBefore = !unsaved();
        await setReal(true);
        await sleep(500);
        const fitted = domGeometry(h.tiptap());
        const content = r1(EditorCore.editorContentWidthPx(ed()));
        const afterToggle = { table: fitted.table, cols: fitted.cols, unsaved: unsaved() };
        const widthsInDoc = [];
        ed().state.doc.descendants(n => { if (n.type.name === 'tableCell') widthsInDoc.push((n.attrs.colwidth || [0])[0]); return true; });
        out = { offState, typed, cleanBefore, afterToggle, content, widthsInDoc: widthsInDoc.slice(0, 3) };
        if (!(offState.table > content + 100)) bad.push('le tableau posé sans la page n\'était pas plus large que la page : ' + offState.table);
        if (!typed || !cleanBefore) bad.push('le témoin « non enregistré » ne répond pas : frappe ' + typed + ', enregistré ' + cleanBefore);
        if (!(afterToggle.table <= content + 2) || !near(afterToggle.cols, [240, 240, 240], 1)) bad.push('Aperçu A4 allumé : tableau ' + afterToggle.table + ' / page ' + content + ' ' + JSON.stringify(afterToggle.cols));
        if (afterToggle.unsaved) bad.push('Aperçu A4 allumé : le document est dit modifié');
        if (!near(widthsInDoc.slice(0, 3), [240, 240, 240], 1)) bad.push('les largeurs du document : ' + JSON.stringify(widthsInDoc.slice(0, 3)));
        // Allumé alors que rien ne dépasse : rien ne bouge.
        await setReal(false);
        Editor.setHTML(tableHtml(CONFIGS.narrow3));
        await sleep(300);
        await setReal(true);
        await sleep(400);
        const narrow = domGeometry(h.tiptap()).cols;
        if (!near(narrow, [100, 140, 120], 0.5)) bad.push('un tableau qui tient a bougé : ' + JSON.stringify(narrow));
      } finally {
        await setReal(true);
        if (autosaveWas && autoRow.getAttribute('aria-checked') !== 'true') await h.clickButton('v2-btn-autosave');
        await h.clickButton('btn-new');
        await h.sleep(300);
      }
      return { pass: !bad.length, notes: bad.length ? '\n' + bad.join('\n') + '\n' + JSON.stringify(out) : JSON.stringify(out) };
    },
  });

  // Un tableau dans un item de liste ou une citation (le bouton Tableau le pose où se trouve le curseur) : un vrai tableau, indenté, dans le PDF et le Word.
  async function listAndQuoteSamples(h, html) {
    await h.resetEditor();
    h.setA4Preview(true);
    Editor.setHTML(html);
    await sleep(350);
    const saved = Editor.getHTML();
    const pdf = await h.exportPdfContent(saved, null, PageLayout.getMarginsPt());
    const word = await h.exportDocxParts(saved, null, PageLayout.getMarginsTwip());
    const body = word.doc.getElementsByTagName('w:body')[0];
    const items = Array.from(body.children).filter(c => c.nodeName !== 'w:sectPr').map(c => {
      if (c.nodeName === 'w:tbl') {
        const ind = c.getElementsByTagName('w:tblInd')[0];
        const rows = Array.from(c.children).filter(n => n.nodeName === 'w:tr').map(tr => Array.from(tr.children).filter(n => n.nodeName === 'w:tc').map(tc => Array.from(tc.getElementsByTagName('w:t')).map(t => t.textContent).join('')));
        const grid = Array.from(c.getElementsByTagName('w:tblGrid')[0].getElementsByTagName('w:gridCol')).map(g => Number(g.getAttribute('w:w')));
        return { kind: 'tbl', rows, indentTwip: ind ? Number(ind.getAttribute('w:w')) : 0, gridTwip: sum(grid) };
      }
      const left = c.getElementsByTagName('w:ind')[0];
      return { kind: 'p', text: Array.from(c.getElementsByTagName('w:t')).map(t => t.textContent).join(''), numbered: c.getElementsByTagName('w:numPr').length > 0, leftTwip: left ? Number(left.getAttribute('w:left') || 0) : 0, quoted: c.getElementsByTagName('w:pBdr').length > 0 };
    });
    const sect = h.docxSectionProps(word.doc);
    return { pdf: pdfBlocks(pdf.content), word: items, wordPageTwip: sect.widthTwip - sect.margins.left - sect.margins.right, pdfPageMarginPt: pdf.docDefinition.pageMargins[0] };
  }
  const T = (label, widths) => tableHtml({ widths, rows: 2, text: (r, c) => `${label}${r + 1}${'ABC'[c]}` });

  cases.push({
    id: 'tableoutputs_a_table_in_a_list_item_is_a_table_in_the_pdf_and_the_word',
    description: 'Un tableau dans un item de liste à puces : le PDF et le Word le dessinent en tableau (une case par case, pas « Un itemL1AL1B… » en une ligne), sous la puce de l\'item et à l\'aplomb de son texte ; le texte qui le suit continue l\'item sans nouvelle puce',
    run: async (h) => {
      const bad = [];
      const s = await listAndQuoteSamples(h, '<ul><li><p>Un item</p>' + T('L', [60, 90, 70]) + '<p>Après le tableau</p></li><li><p>Deuxième</p></li></ul>');
      const kinds = s.pdf.map(b => b.kind + ':' + (b.kind === 'table' ? b.cells.map(r => r.join('|')).join('/') : b.text));
      const wantKinds = ['text:• Un item', 'table:L1A|L1B|L1C/L2A|L2B|L2C', 'text:Après le tableau', 'text:• Deuxième'];
      if (JSON.stringify(kinds) !== JSON.stringify(wantKinds)) bad.push('PDF : ' + JSON.stringify(kinds));
      const pdfTable = s.pdf.find(b => b.kind === 'table');
      const pdfText = s.pdf.find(b => b.kind === 'text');
      if (!pdfTable || !(pdfTable.indentPt > 5) || Math.abs(pdfTable.indentPt - pdfText.indentPt) > 1) bad.push('PDF : tableau à ' + (pdfTable && pdfTable.indentPt) + ' pt, texte de l\'item à ' + pdfText.indentPt);
      const after = s.pdf.find(b => b.text === 'Après le tableau');
      if (!after || Math.abs(after.indentPt - pdfText.indentPt) > 1) bad.push('PDF : le texte qui suit le tableau n\'est pas à l\'aplomb de l\'item');
      const wk = s.word.map(x => (x.kind === 'tbl' ? 'tbl:' + x.rows.map(r => r.join('|')).join('/') : 'p:' + x.text + (x.numbered ? '#' : '')));
      const wantWord = ['p:Un item#', 'tbl:L1A|L1B|L1C/L2A|L2B|L2C', 'p:Après le tableau', 'p:Deuxième#', 'p:'];
      if (JSON.stringify(wk) !== JSON.stringify(wantWord) && JSON.stringify(wk.slice(0, 4)) !== JSON.stringify(wantWord.slice(0, 4))) bad.push('Word : ' + JSON.stringify(wk));
      const wTable = s.word.find(x => x.kind === 'tbl');
      const wText = s.word.find(x => x.kind === 'p' && x.text === 'Un item');
      if (!wTable || !(wTable.indentTwip >= 300)) bad.push('Word : retrait du tableau ' + (wTable && wTable.indentTwip));
      const wAfter = s.word.find(x => x.text === 'Après le tableau');
      if (!wAfter || wAfter.leftTwip !== (wTable && wTable.indentTwip)) bad.push('Word : le texte qui suit est à ' + (wAfter && wAfter.leftTwip) + ' twips, le tableau à ' + (wTable && wTable.indentTwip));
      if (!wText.numbered) bad.push('Word : l\'item n\'a plus sa puce');
      return { pass: !bad.length, notes: bad.length ? '\n' + bad.join('\n') : JSON.stringify({ kinds, word: wk, indent: [pdfTable.indentPt, wTable.indentTwip] }) };
    },
  });

  cases.push({
    id: 'tableoutputs_a_table_in_an_ordered_or_nested_list_item_keeps_its_number_and_its_depth',
    description: 'Un tableau dans un item de liste numérotée, puis dans un sous-item : chacun garde son numéro (le suivant continue la suite, 2.), et le tableau du sous-item est plus indenté que celui de l\'item, dans le PDF comme dans le Word',
    run: async (h) => {
      const bad = [];
      const s = await listAndQuoteSamples(h, '<ol><li><p>Premier</p>' + T('T', [100, 120]) + '<ol><li><p>Sous-item</p>' + T('U', [100, 120]) + '</li></ol></li><li><p>Deuxième</p></li></ol>');
      const texts = s.pdf.filter(b => b.kind === 'text').map(b => b.text);
      if (JSON.stringify(texts) !== JSON.stringify(['1. Premier', '1. Sous-item', '2. Deuxième'])) bad.push('PDF : numéros ' + JSON.stringify(texts));
      const pdfTables = s.pdf.filter(b => b.kind === 'table');
      if (pdfTables.length !== 2 || !(pdfTables[1].indentPt > pdfTables[0].indentPt + 5)) bad.push('PDF : retraits ' + JSON.stringify(pdfTables.map(t => t.indentPt)));
      const wTables = s.word.filter(x => x.kind === 'tbl');
      if (wTables.length !== 2 || !(wTables[1].indentTwip > wTables[0].indentTwip + 200)) bad.push('Word : retraits ' + JSON.stringify(wTables.map(t => t.indentTwip)));
      const numbered = s.word.filter(x => x.kind === 'p' && x.numbered).map(x => x.text);
      if (JSON.stringify(numbered) !== JSON.stringify(['Premier', 'Sous-item', 'Deuxième'])) bad.push('Word : items numérotés ' + JSON.stringify(numbered));
      // Pas de ligne vide entre le tableau et la sous-liste qui le suit (un dernier paragraphe vide peut clore le corps).
      const sequence = s.word.map(x => (x.kind === 'tbl' ? 'tbl' : 'p:' + x.text + (x.numbered ? '#' : '')));
      if (sequence[sequence.length - 1] === 'p:') sequence.pop();
      if (JSON.stringify(sequence) !== JSON.stringify(['p:Premier#', 'tbl', 'p:Sous-item#', 'tbl', 'p:Deuxième#'])) bad.push('Word : suite des blocs ' + JSON.stringify(sequence));
      return { pass: !bad.length, notes: bad.length ? '\n' + bad.join('\n') : 'ok' };
    },
  });

  cases.push({
    id: 'tableoutputs_a_table_in_a_quote_is_a_table_in_the_pdf_and_the_word',
    description: 'Un tableau dans une citation (avant ou après son texte) : tableau en cases dans le PDF et le Word, indenté comme la citation, le texte de la citation gardé',
    run: async (h) => {
      const bad = [];
      const after = await listAndQuoteSamples(h, '<blockquote><p>Une citation</p>' + T('Q', [60, 90, 70]) + '<p>Suite de la citation</p></blockquote><p>Fin</p>');
      const kinds = after.pdf.map(b => b.kind + ':' + (b.kind === 'table' ? b.cells.map(r => r.join('|')).join('/') : b.text));
      if (JSON.stringify(kinds) !== JSON.stringify(['text:Une citation', 'table:Q1A|Q1B|Q1C/Q2A|Q2B|Q2C', 'text:Suite de la citation', 'text:Fin'])) bad.push('PDF : ' + JSON.stringify(kinds));
      const t = after.pdf.find(b => b.kind === 'table');
      const q = after.pdf.find(b => b.text === 'Une citation');
      if (!t || !(t.indentPt > 5) || Math.abs(t.indentPt - q.indentPt) > 1) bad.push('PDF : tableau à ' + (t && t.indentPt) + ' pt, citation à ' + q.indentPt);
      const wTable = after.word.find(x => x.kind === 'tbl');
      const wQuote = after.word.find(x => x.text === 'Une citation');
      if (!wTable || !wQuote || wTable.indentTwip !== wQuote.leftTwip || !wQuote.quoted) bad.push('Word : tableau à ' + (wTable && wTable.indentTwip) + ' twips, citation à ' + (wQuote && wQuote.leftTwip));
      if (!after.word.some(x => x.text === 'Suite de la citation' && x.quoted)) bad.push('Word : la suite de la citation a perdu sa citation');
      const first = await listAndQuoteSamples(h, '<blockquote>' + T('R', [60, 90, 70]) + '<p>Suite</p></blockquote>');
      if (!first.pdf.some(b => b.kind === 'table') || !first.word.some(x => x.kind === 'tbl')) bad.push('citation qui commence par le tableau : ' + JSON.stringify(first.pdf.map(b => b.kind)) + ' / ' + JSON.stringify(first.word.map(x => x.kind)));
      return { pass: !bad.length, notes: bad.length ? '\n' + bad.join('\n') : 'ok' };
    },
  });

  cases.push({
    id: 'tableoutputs_a_wide_table_in_a_list_item_or_quote_stays_inside_the_page',
    description: 'Un tableau de 700 px, ou de 715 px (plus étroit que la page de 719 px, plus large que la page moins le retrait de 20 px), dans un item de liste ou une citation : le PDF et le Word le ramènent entre la marge gauche du retrait et la marge droite de la page',
    run: async (h) => {
      const bad = [];
      for (const [name, wrap] of [['liste', WRAPS.list], ['citation', WRAPS.quote]]) {
        for (const widths of [[200, 250, 250], [235, 240, 240]]) {
          const m = await measureAll(h, tableHtml({ widths }), { wrap });
          const label = name + ' de ' + sum(widths) + ' px';
          if (!(m.pdf.right <= m.pdf.pageLeft + m.pdf.pageContent + 2)) bad.push(label + ' : PDF, bord droit ' + m.pdf.right + ' > ' + r1(m.pdf.pageLeft + m.pdf.pageContent));
          if (!(m.pdf.left > m.pdf.pageLeft + 5)) bad.push(label + ' : PDF, bord gauche ' + m.pdf.left + ' sans retrait');
          if (!(sum(m.word.cols) + m.word.indent <= m.word.pageContent + 2)) bad.push(label + ' : Word ' + r1(sum(m.word.cols) + m.word.indent) + ' > page ' + m.word.pageContent);
          if (!(m.word.indent > 10)) bad.push(label + ' : Word sans retrait ' + m.word.indent);
        }
      }
      return { pass: !bad.length, notes: bad.length ? '\n' + bad.join('\n') : 'ok' };
    },
  });

  // Un tableau plus large que SA COLONNE dans une zone à deux colonnes (point de la liste de polish du 12/10 : « rogné à la page, pas à la colonne, partout pareil ») :
  // l'éditeur (Aperçu A4), la Lecture, le PDF et le Word le ramènent dans la colonne qui le porte, colonnes au prorata, comme ils ramènent dans la page un tableau plus
  // large que la page. La limite est le texte de la colonne (sa boîte sans bordure ni remplissage), lue sur l'éditeur.
  const zoneHtml = (split, left, right) => '<div class="two-columns-zone" style="--layout-left: ' + split + '%"><div class="two-columns-column">' + left + '</div><div class="two-columns-column">' + right + '</div></div>';
  const BESIDE = '<p>Texte à côté</p>';
  const columnTexts = root => Array.from(root.querySelectorAll('.two-columns-column')).map(c => {
    const cs = c.ownerDocument.defaultView.getComputedStyle(c);
    return c.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
  });
  // Ce que chaque sortie doit à la colonne de `colW` px (à 3 px près : le trait du tableau et l'arrondi de `clientWidth`, comme les 2 px de la page plus haut) : un tableau qui y
  // tient, au bord gauche où l'éditeur le pose ; ses colonnes au prorata de celles qu'on lui a
  // données ; un tableau qui tenait déjà reste tel qu'il était écrit.
  function columnIssues(m, colW, widths) {
    const bad = issuesOf(m);
    const e = m.editor; const rd = m.reader; const p = m.pdf; const w = m.word;
    if (!e || !rd || !p.cols.length || !w.cols) return bad;
    if (e.table > colW + 3) bad.push('éditeur : tableau ' + e.table + ' plus large que sa colonne ' + r1(colW));
    if (rd.table > colW + 3) bad.push('Lecture : tableau ' + rd.table + ' plus large que sa colonne ' + r1(colW));
    if (p.right - p.left > colW + 3) bad.push('PDF : tableau ' + r1(p.right - p.left) + ' plus large que sa colonne ' + r1(colW));
    if (sum(w.cols) > colW + 6) bad.push('Word : tableau ' + r1(sum(w.cols)) + ' plus large que sa colonne ' + r1(colW));
    if (Math.abs(rd.rel - e.rel) > 1.5) bad.push('Lecture : bord gauche à ' + rd.rel + ' au lieu de ' + e.rel);
    if (Math.abs(p.left - p.pageLeft - e.rel) > 2.5) bad.push('PDF : bord gauche à ' + r1(p.left - p.pageLeft) + ' au lieu de ' + e.rel);
    if (sum(widths) > colW) {
      const total = sum(e.cols);
      if (!e.cols.every((c, i) => Math.abs(c / total - widths[i] / sum(widths)) < 0.02)) bad.push('éditeur : colonnes ' + JSON.stringify(e.cols) + ' pas au prorata de ' + JSON.stringify(widths));
    } else if (!near(e.cols, widths, 0.5)) {
      bad.push('un tableau qui tient dans sa colonne a bougé : ' + JSON.stringify(e.cols) + ' au lieu de ' + JSON.stringify(widths));
    }
    return bad;
  }

  const ZONE_TRIALS = [
    { name: 'colonne gauche à 50 %, 600 px', split: 50, side: 0, widths: [200, 200, 200] },
    { name: 'colonne gauche à 50 %, 450 px (plus étroit que la page)', split: 50, side: 0, widths: [150, 150, 150] },
    { name: 'colonne gauche à 50 %, colonnes de 60, 150 et 300 px', split: 50, side: 0, widths: [60, 150, 300] },
    { name: 'colonne droite à 50 %, 450 px', split: 50, side: 1, widths: [150, 150, 150] },
    { name: 'colonne gauche à 30 %, 300 px', split: 30, side: 0, widths: [100, 100, 100] },
    { name: 'colonne droite à 70 % (la plus étroite), 360 px', split: 70, side: 1, widths: [120, 120, 120] },
    { name: 'colonne gauche à 50 %, 270 px (tient déjà)', split: 50, side: 0, widths: [90, 90, 90] },
  ];
  cases.push({
    id: 'tableoutputs_a_table_wider_than_its_zone_column_fits_the_column_in_every_view_and_export',
    description: 'Un tableau plus large que la colonne d\'une zone à deux colonnes (600 px, 450 px, colonnes inégales, colonne gauche ou droite, zone à 30, 50 ou 70 %) est ramené dans sa colonne, colonnes au prorata, dans l\'éditeur, la Lecture, le PDF et le Word ; un tableau qui y tient déjà ne bouge pas',
    run: async (h) => {
      const bad = [];
      for (const trial of ZONE_TRIALS) {
        const wrap = t => zoneHtml(trial.split, trial.side === 0 ? t : BESIDE, trial.side === 0 ? BESIDE : t);
        const m = await measureAll(h, tableHtml({ widths: trial.widths }), { wrap });
        const colW = columnTexts(h.tiptap())[trial.side];
        const issues = columnIssues(m, colW, trial.widths);
        if (issues.length) bad.push(trial.name + ' : ' + issues.join(' ; ') + ' | ' + compact(m));
      }
      return { pass: !bad.length, notes: bad.length ? '\n' + bad.join('\n') : ZONE_TRIALS.length + ' tableaux d\'accord avec leur colonne' };
    },
  });

  // La colonne se rétrécit APRÈS la pose du tableau (le trait de séparation glissé : au lâcher la zone change de pourcentage) : le tableau suit, comme il suit un
  // changement de marges de la page.
  cases.push({
    id: 'tableoutputs_a_table_follows_its_zone_column_when_the_zone_is_resized',
    description: 'Un tableau qui tient dans la colonne gauche d\'une zone à 50 % est ramené dans la colonne quand la zone passe à 30 % (le trait de séparation lâché) : colonnes au prorata, mêmes colonnes dans la Lecture, le PDF et le Word ; remise à 50 %, le tableau n\'est pas élargi',
    run: async (h) => {
      const bad = [];
      const widths = [110, 110, 110];
      await h.resetEditor();
      h.setA4Preview(true);
      Editor.setHTML(zoneHtml(50, tableHtml({ widths }), BESIDE));
      await sleep(350);
      const setSplit = async (percent) => {
        let zonePos = -1; let zoneNode = null;
        ed().state.doc.descendants((node, pos) => { if (zonePos < 0 && node.type.name === 'twoColumnsZone') { zonePos = pos; zoneNode = node; } return zonePos < 0; });
        ed().view.dispatch(ed().state.tr.setNodeMarkup(zonePos, undefined, Object.assign({}, zoneNode.attrs, { layoutLeft: percent })));
        await sleep(450);
      };
      const wide = domGeometry(h.tiptap());
      if (!near(wide.cols, widths, 0.5)) bad.push('50 % : le tableau qui tient a bougé ' + JSON.stringify(wide.cols));
      await setSplit(30);
      const m = await measureAllIn(h, null, { wrap: s => s });
      const colW = columnTexts(h.tiptap())[0];
      const issues = columnIssues(m, colW, widths);
      if (issues.length) bad.push('zone passée à 30 % : ' + issues.join(' ; ') + ' | ' + compact(m));
      const narrowed = m.editor ? m.editor.cols : [];
      await setSplit(50);
      const back = domGeometry(h.tiptap());
      if (!near(back.cols, narrowed, 0.5)) bad.push('zone remise à 50 % : le tableau a changé ' + JSON.stringify(back.cols) + ' au lieu de ' + JSON.stringify(narrowed));
      return { pass: !bad.length, notes: bad.length ? '\n' + bad.join('\n') : 'ok' };
    },
  });

  // Un tableau enregistré sans l'Aperçu A4 (aucune limite à l'écran) : le PDF et le Word, eux, n'ont que la colonne de la page.
  cases.push({
    id: 'tableoutputs_a_table_stored_wider_than_its_zone_column_fits_the_column_in_pdf_and_word',
    description: 'Un tableau de 600 px posé sans Aperçu A4 dans la colonne gauche ou droite d\'une zone à 50 % sort du PDF et du Word dans sa colonne, colonnes au prorata (le Word écrit la grille et chaque case à la même largeur) ; l\'éditeur, sans page, ne le touche pas',
    run: async (h) => {
      const bad = [];
      const widths = [200, 200, 200];
      // La largeur de chaque colonne se lit sur l'éditeur en Aperçu A4 (sans page elle suit la fenêtre).
      await h.resetEditor();
      h.setA4Preview(true);
      Editor.setHTML(zoneHtml(50, BESIDE, BESIDE));
      await sleep(350);
      const colWs = columnTexts(h.tiptap());
      for (const side of [0, 1]) {
        await h.resetEditor();
        h.setA4Preview(false);
        const t = tableHtml({ widths });
        Editor.setHTML(zoneHtml(50, side === 0 ? t : BESIDE, side === 0 ? BESIDE : t));
        await sleep(350);
        const saved = Editor.getHTML();
        const stored = (saved.match(/width: (\d+)px/) || [])[1];
        if (Number(stored) !== 600) { bad.push('colonne ' + side + ' : le tableau posé sans la page a été touché (' + stored + ')'); continue; }
        const pdf = await h.exportPdfContent(saved, null, PageLayout.getMarginsPt());
        const painted = (await h.extractPdfLines(pdf.base64)).pages[0];
        const xs = painted.lines.filter(l => Math.abs(l.x1 - l.x2) < 0.01).map(l => l.x1).sort((a, b) => a - b);
        const pdfWidth = ((xs[xs.length - 1] || 0) - (xs[0] || 0)) / 0.75;
        const word = await h.exportDocxParts(saved, null, PageLayout.getMarginsTwip());
        // Le tableau du texte (celui qui porte « L1A » et aucun autre), pas le tableau à trois cases qui range la zone.
        const hasLabel = t => /L1A/.test(t.textContent);
        const wTable = Array.from(word.doc.getElementsByTagName('w:tbl')).filter(t => hasLabel(t) && !Array.from(t.getElementsByTagName('w:tbl')).some(hasLabel))[0];
        const wordCols = wTable ? Array.from(wTable.getElementsByTagName('w:tblGrid')[0].getElementsByTagName('w:gridCol')).map(g => Number(g.getAttribute('w:w')) / 15) : [];
        const cellTwips = wTable ? Array.from(wTable.getElementsByTagName('w:tr')[0].children).filter(c => c.nodeName === 'w:tc').map(tc => Number(tc.getElementsByTagName('w:tcW')[0].getAttribute('w:w'))) : [];
        const cellsMatchGrid = wordCols.length === 3 && cellTwips.length === 3 && cellTwips.every((tw, i) => Math.abs(tw - wordCols[i] * 15) <= 2);
        const gotRatio = wordCols.map(x => x / sum(wordCols));
        if (!(pdfWidth <= colWs[side] + 3)) bad.push('colonne ' + side + ' : PDF ' + r1(pdfWidth) + ' > colonne ' + r1(colWs[side]));
        if (!(wordCols.length === 3 && sum(wordCols) <= colWs[side] + 6)) bad.push('colonne ' + side + ' : Word ' + r1(sum(wordCols)) + ' > colonne ' + r1(colWs[side]));
        if (!cellsMatchGrid) bad.push('colonne ' + side + ' : les cases du Word ne suivent pas la grille');
        if (!gotRatio.every(x => Math.abs(x - 1 / 3) < 0.02)) bad.push('colonne ' + side + ' : proportions du Word ' + JSON.stringify(gotRatio.map(x => r1(x * 100))));
        // L'Aperçu A4 allumé après coup (Editor.fitTablesToPage, que la case « Aperçu A4 » rejoue) : le tableau rentre aussitôt dans sa colonne.
        h.setA4Preview(true);
        Editor.fitTablesToPage();
        await sleep(350);
        const fitted = domGeometry(h.tiptap());
        if (!(fitted.table <= colWs[side] + 3)) bad.push('colonne ' + side + ' : l\'Aperçu A4 allumé laisse un tableau de ' + fitted.table + ' dans une colonne de ' + r1(colWs[side]));
      }
      return { pass: !bad.length, notes: bad.length ? '\n' + bad.join('\n') : 'ok' };
    },
  });

  // La Lecture et l'impression d'un tableau enregistré plus large que sa colonne (sans Aperçu A4, ou repris d'un autre modèle) : comme l'éditeur avec l'Aperçu A4,
  // elles le ramènent dans sa colonne ; la page ne suffit pas, la colonne de droite d'une zone à 50 % la dépasserait.
  cases.push({
    id: 'tableoutputs_reader_and_print_bring_a_stored_table_into_its_zone_column',
    description: 'Lecture (Aperçu A4) et impression du navigateur : un tableau de 600 px enregistré dans la colonne gauche ou droite d\'une zone à 50 % est ramené dans le texte de sa colonne, colonnes au prorata ; un tableau de 270 px n\'est pas touché',
    run: async (h) => {
      const bad = [];
      for (const [side, widths] of [[0, [200, 200, 200]], [1, [200, 200, 200]], [0, [90, 90, 90]]]) {
        const t = tableHtml({ widths });
        const html = zoneHtml(50, side === 0 ? t : BESIDE, side === 0 ? BESIDE : t);
        const label = 'colonne ' + side + ', ' + sum(widths) + ' px';
        const wantRatio = widths.map(w => w / sum(widths));
        const check = (where, cols, colW) => {
          const total = sum(cols);
          if (sum(widths) > colW) {
            if (!(total <= colW + 3 && cols.every((c, i) => Math.abs(c / total - wantRatio[i]) < 0.02))) bad.push(label + ' : ' + where + ' ' + JSON.stringify(cols.map(r1)) + ' dans une colonne de ' + r1(colW));
          } else if (!near(cols.map(r1), widths, 0.5)) bad.push(label + ' : ' + where + ' a changé un tableau qui tient ' + JSON.stringify(cols.map(r1)));
        };
        await h.resetEditor();
        h.setA4Preview(true);
        const reader = await h.renderReaderMode(html, null);
        await sleep(250);
        const g = domGeometry(reader);
        check('Lecture', g.cols, columnTexts(reader)[side]);
        const job = await PrintExport.prepare(html, null, { id: 1 }, NO_HF(), 'essai');
        try {
          const sheet = job.frame.contentDocument.querySelector('.pp-print-sheet');
          const printed = Array.from(sheet.querySelector('table').querySelectorAll(':scope > colgroup > col')).map(c => c.getBoundingClientRect().width);
          check('impression', printed, columnTexts(sheet)[side]);
        } finally { job.dispose(); }
      }
      return { pass: !bad.length, notes: bad.length ? '\n' + bad.join('\n') : 'ok' };
    },
  });

  // Le plancher d'une colonne (25 px) : un tableau qui ne peut plus se resserrer reste tel qu'il est. La correction des largeurs est rejouée après chaque
  // changement du document : si elle récrivait encore les mêmes largeurs, chaque frappe ferait une écriture de plus.
  cases.push({
    id: 'tableoutputs_a_table_already_at_its_narrowest_stays_put_in_a_narrow_zone_column',
    description: 'Quinze colonnes de 25 px (le plancher, 375 px) dans la colonne gauche d\'une zone à 30 % (205 px de texte) : le tableau ne peut pas rentrer, il reste tel qu\'il est, la correction des largeurs ne récrit rien (une frappe n\'est qu\'une écriture) et l\'éditeur répond encore',
    run: async (h) => {
      const bad = [];
      const widths = Array(15).fill(25);
      const errors = [];
      const onError = e => errors.push(e.message);
      window.addEventListener('error', onError);
      let writes = 0;
      const onTransaction = ({ transaction }) => { if (transaction.docChanged) writes += 1; };
      try {
        await h.resetEditor();
        h.setA4Preview(true);
        try {
          Editor.setHTML(zoneHtml(30, tableHtml({ widths, rows: 2 }), BESIDE));
          await sleep(500);
        } catch (e) { bad.push('la pose a levé : ' + e.message); }
        const g = domGeometry(h.tiptap());
        if (!g || !near(g.cols, widths, 0.5)) bad.push('les colonnes ont bougé : ' + JSON.stringify(g && g.cols));
        await h.focusAtEnd();
        ed().on('transaction', onTransaction);
        await h.typeText('x');
        await h.sleep(250);
        if (!ed().getText().includes('x')) bad.push('l\'éditeur ne répond plus à la frappe');
        if (writes !== 1) bad.push('une frappe a fait ' + writes + ' écritures : la correction a récrit les largeurs d\'un tableau qui ne peut pas rentrer');
      } finally { ed().off('transaction', onTransaction); window.removeEventListener('error', onError); }
      if (errors.length) bad.push('erreurs : ' + errors.slice(0, 3).join(' | '));
      return { pass: !bad.length, notes: bad.length ? '\n' + bad.join('\n') : 'ok' };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.tableOutputs = cases;
})();
