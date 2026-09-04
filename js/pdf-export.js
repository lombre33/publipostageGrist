// Module export PDF : raster (historique) ou texte natif vectoriel (pdfmake).
// Le mode texte natif reçoit le HTML déjà résolu par ReaderMode.preview et le
// convertit en structure pdfmake : le texte reste donc sélectionnable/recherchable.
const PdfExport = (function () {
  const QUALITY_PRESETS = {
    standard: { label: 'Standard', image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 } },
    high: { label: 'Haute qualité', image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 4 }, jsPDF: { compress: false } },
    print: { label: 'Impression (HD)', image: { type: 'png' }, html2canvas: { scale: 6 }, jsPDF: { compress: false } }
  };

  function getQualityPreset(quality) { return QUALITY_PRESETS[quality] || QUALITY_PRESETS.standard; }
  const PX_TO_PT = 72 / 96;
  const DEFAULT_FONT_SIZE = 11;
  const HEADING_SIZES = { H1: 24, H2: 20, H3: 16, H4: 14, H5: 13, H6: 12 };

  function cssSize(value, fallback) {
    const n = parseFloat(value);
    return Number.isFinite(n) ? Math.max(6, Math.min(72, n * (value && String(value).endsWith('px') ? PX_TO_PT : 1))) : fallback;
  }

  function alignment(node) {
    const cls = node.classList || { contains: () => false };
    if (cls.contains('ql-align-center')) return 'center';
    if (cls.contains('ql-align-right')) return 'right';
    if (cls.contains('ql-align-justify')) return 'justify';
    const style = (node.getAttribute && node.getAttribute('style')) || '';
    const match = style.match(/text-align\s*:\s*(left|center|right|justify)/i);
    return match ? match[1].toLowerCase() : undefined;
  }

  function inheritedStyle(node, parent) {
    const style = node.nodeType === 1 ? (node.getAttribute('style') || '') : '';
    const css = name => { const m = style.match(new RegExp(name + '\\s*:\\s*([^;]+)', 'i')); return m && m[1].trim(); };
    const tag = node.nodeType === 1 ? node.tagName : '';
    const out = Object.assign({}, parent);
    if (tag === 'STRONG' || tag === 'B') out.bold = true;
    if (tag === 'EM' || tag === 'I') out.italics = true;
    if (tag === 'U') out.decoration = 'underline';
    if (css('font-weight') && /bold|[6-9]00/i.test(css('font-weight'))) out.bold = true;
    if (css('font-style') === 'italic') out.italics = true;
    if (css('text-decoration') && /underline/i.test(css('text-decoration'))) out.decoration = 'underline';
    if (css('font-size')) out.fontSize = cssSize(css('font-size'), DEFAULT_FONT_SIZE);
    return out;
  }

  function inlineRuns(node, parentStyle) {
    const style = inheritedStyle(node, parentStyle || { fontSize: DEFAULT_FONT_SIZE });
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ? [{ text: node.nodeValue, ...style }] : [];
    if (node.nodeType !== Node.ELEMENT_NODE) return [];
    if (node.classList.contains('page-break-marker')) return [];
    if (node.classList.contains('var-badge')) return [{ text: node.textContent || '', ...style }];
    if (node.tagName === 'BR') return [{ text: '\n', ...style }];
    let runs = [];
    node.childNodes.forEach(child => { runs = runs.concat(inlineRuns(child, style)); });
    return runs;
  }

  function isBlock(node) {
    return node.nodeType === Node.ELEMENT_NODE && (/^(P|DIV|H[1-6]|LI|BLOCKQUOTE|PRE|TABLE|HR)$/i.test(node.tagName));
  }

  function tableFrom(node, pageBreakBefore) {
    const body = Array.from(node.querySelectorAll('tr')).map(row => Array.from(row.children).map(cell => ({ text: inlineRuns(cell, { fontSize: DEFAULT_FONT_SIZE }), margin: [4, 3, 4, 3] })));
    const table = { table: { headerRows: 0, widths: Array(body[0] ? body[0].length : 1).fill('*'), body: body.length ? body : [[{ text: ' ', margin: [4, 3, 4, 3] }]] }, layout: 'lightHorizontalLines', margin: [0, 5, 0, 5] };
    if (pageBreakBefore) table.pageBreak = 'before';
    return table;
  }

  function blockFrom(node, pageBreakBefore) {
    const tag = node.tagName.toUpperCase();
    if (tag === 'TABLE') return tableFrom(node, pageBreakBefore);
    if (tag === 'HR') return { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1 }], margin: [0, 5, 0, 5], ...(pageBreakBefore ? { pageBreak: 'before' } : {}) };
    const runs = inlineRuns(node, { fontSize: HEADING_SIZES[tag] || DEFAULT_FONT_SIZE });
    const block = { text: runs.length ? runs : ' ', margin: [0, tag.match(/^H[1-6]$/) ? 5 : 2, 0, 4] };
    const align = alignment(node); if (align) block.alignment = align;
    if (/^H[1-6]$/.test(tag)) block.bold = true;
    if (tag === 'LI') { block.text = [{ text: '• ', ...({ fontSize: DEFAULT_FONT_SIZE }) }].concat(runs); block.margin[0] = 10; }
    if (tag === 'BLOCKQUOTE') { block.italics = true; block.margin = [18, 4, 8, 4]; }
    if (pageBreakBefore) block.pageBreak = 'before';
    return block;
  }

  function htmlToPdfContent(html) {
    const root = document.createElement('div'); root.innerHTML = html || '';
    const blocks = []; let pendingPageBreak = false;
    const visit = node => {
      if (node.nodeType === Node.TEXT_NODE) { if (node.nodeValue.trim()) blocks.push({ text: node.nodeValue, margin: [0, 2, 0, 4], ...(pendingPageBreak ? { pageBreak: 'before' } : {}) }); pendingPageBreak = false; return; }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (node.classList.contains('page-break-marker')) { pendingPageBreak = true; return; }
      if (isBlock(node)) { blocks.push(blockFrom(node, pendingPageBreak)); pendingPageBreak = false; return; }
      node.childNodes.forEach(visit);
    };
    root.childNodes.forEach(visit);
    return blocks.length ? blocks : [{ text: ' ', margin: [0, 2, 0, 4] }];
  }

  async function exportNativePdf(resolvedHtml, filename) {
    if (!window.pdfMake || !window.pdfMake.createPdf) throw new Error('La bibliothèque pdfmake n’est pas disponible.');
    const docDefinition = {
      pageSize: 'A4', pageOrientation: 'portrait', pageMargins: [28, 28, 28, 28],
      defaultStyle: { font: 'Roboto', fontSize: DEFAULT_FONT_SIZE },
      content: htmlToPdfContent(resolvedHtml),
      info: { title: filename || 'publipostage' }
    };
    window.pdfMake.createPdf(docDefinition).download((filename || 'publipostage') + '.pdf');
  }

  async function exportCurrentRecord(htmlContent, currentTableId, record, filenameTemplate, quality) {
    if (!record) { alert("Aucune ligne sélectionnée : impossible d'exporter en PDF."); return; }
    const resolvedHtml = await ReaderMode.preview(htmlContent, currentTableId, record);
    const filename = await ReaderMode.resolveFilename(filenameTemplate, currentTableId, record);
    if (quality === 'native') { await exportNativePdf(resolvedHtml, filename); return; }
    const container = document.createElement('div');
    container.style.padding = '20px'; container.style.fontFamily = 'Arial, sans-serif'; container.innerHTML = resolvedHtml;
    container.querySelectorAll('.page-break-marker').forEach(marker => {
      marker.innerHTML = ''; marker.style.border = '0'; marker.style.background = 'transparent'; marker.style.color = 'transparent'; marker.style.height = '0'; marker.style.margin = '0'; marker.style.pageBreakAfter = 'always'; marker.style.breakAfter = 'page';
    });
    document.body.appendChild(container);
    const preset = getQualityPreset(quality);
    const opt = { margin: 10, filename: (filename || 'publipostage') + '.pdf', image: preset.image, html2canvas: preset.html2canvas, jsPDF: Object.assign({ unit: 'mm', format: 'a4', orientation: 'portrait' }, preset.jsPDF || {}), pagebreak: { mode: ['css', 'legacy'], avoid: '.var-badge' } };
    try { await html2pdf().set(opt).from(container).save(); } finally { document.body.removeChild(container); }
  }
  return { exportCurrentRecord };
})();