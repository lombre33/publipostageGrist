// Suite "gridTable" - coller un tableau de tableur dans une grille (js/grid-table.js, planning/feature-mode-grille-excel.md, sujet 17 du 02/10 : « quand on a copié un tableau depuis Excel et que
// l'on veut le coller dans une grille, actuellement ça colle une image dans la cellule ; moi j'aimerais bien le tableau avec ses cellules, etc. y compris les cellules fusionnées et mises en
// forme si possible »). Excel pose dans le presse-papiers un tableau HTML (mise en forme dans une feuille de style : `class=xl65`), le texte tabulé ET une image de la plage : c'est l'image que
// l'éditeur collait. Les presse-papiers ci-dessous sont ceux qu'Excel (Windows, Chrome), Google Sheets et LibreOffice Calc posent, relevés de mémoire du format réel (le bac à sable n'a pas de
// tableur). Les cas lisent le modèle de cases (`GridTable.fromClipboardHtml`), puis collent pour de vrai (un évènement `paste` avec un DataTransfer qui porte HTML, texte et image) dans une vraie grille
// ET dans un document ordinaire (choix d'Antoine du 02/10, « Coller aussi un tableau Excel en cases dans un document, hors grille ? » - « Oui, en cases » : un tableau du document, sans l'image).
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const ed = () => EditorCore.getEditor();
  const doc = () => ed().state.doc;
  // Le premier tableau du document : celui d'une grille est son premier enfant, celui d'un document vient après son texte.
  const tableNode = () => { let found = null; doc().forEach((node) => { if (!found && node.type.name === 'table') found = node; }); return found; };

// Presse-papiers de tableurs, tels qu'Excel (Windows, Chrome), Google Sheets et LibreOffice Calc les posent (relevés de mémoire du format réel, ce sandbox n'a pas de tableur).
  const EXCEL_HTML = `<html xmlns:v="urn:schemas-microsoft-com:vml"
xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:x="urn:schemas-microsoft-com:office:excel"
xmlns="http://www.w3.org/TR/REC-html40">

<head>
<meta http-equiv=Content-Type content="text/html; charset=utf-8">
<meta name=ProgId content=Excel.Sheet>
<meta name=Generator content="Microsoft Excel 15">
<style>
<!--table
	{mso-displayed-decimal-separator:"\\,";
	mso-displayed-thousand-separator:"\\ ";}
@page
	{margin:.75in .7in .75in .7in;
	mso-header-margin:.3in;
	mso-footer-margin:.3in;}
tr
	{mso-height-source:auto;}
col
	{mso-width-source:auto;}
br
	{mso-data-placement:same-cell;}
.style0
	{mso-number-format:General;
	text-align:general;
	vertical-align:bottom;
	white-space:nowrap;
	mso-rotate:0;
	mso-background-source:auto;
	mso-pattern:auto;
	color:black;
	font-size:11.0pt;
	font-weight:400;
	font-style:normal;
	text-decoration:none;
	font-family:Calibri, sans-serif;
	mso-font-charset:0;
	border:none;
	mso-protection:locked visible;
	mso-style-name:Normal;
	mso-style-id:0;}
td
	{mso-style-parent:style0;
	padding-top:1px;
	padding-right:1px;
	padding-left:1px;
	mso-ignore:padding;
	color:black;
	font-size:11.0pt;
	font-weight:400;
	font-style:normal;
	text-decoration:none;
	font-family:Calibri, sans-serif;
	mso-font-charset:0;
	mso-number-format:General;
	text-align:general;
	vertical-align:bottom;
	border:none;
	mso-background-source:auto;
	mso-pattern:auto;
	mso-protection:locked visible;
	white-space:nowrap;
	mso-rotate:0;}
.xl65
	{mso-style-parent:style0;
	font-size:14.0pt;
	font-weight:700;
	text-align:center;
	vertical-align:middle;
	border:.5pt solid windowtext;
	background:#FFC000;
	mso-pattern:black none;}
.xl66
	{mso-style-parent:style0;
	font-weight:700;
	border-bottom:1.0pt solid windowtext;}
.xl67
	{mso-style-parent:style0;
	color:#C00000;
	font-style:italic;
	text-align:center;}
.xl68
	{mso-style-parent:style0;
	text-align:right;
	mso-number-format:"\\#\\,\\#\\#0\\.00\\\\ \\0022€\\0022";}
.xl69
	{mso-style-parent:style0;
	vertical-align:top;
	white-space:normal;}
.font6
	{color:#0070C0;
	font-weight:700;
	text-decoration:underline;}
-->
</style>
</head>

<body link="#0563C1" vlink="#954F72">
<!--StartFragment-->

<table border=0 cellpadding=0 cellspacing=0 width=403 style='border-collapse:
 collapse;table-layout:fixed;width:302pt'>
 <col width=64 style='width:48pt'>
 <col width=190 style='mso-width-source:userset;mso-width-alt:6765;width:143pt'>
 <col width=149 style='mso-width-source:userset;mso-width-alt:5290;width:112pt'>
 <tr height=28 style='mso-height-source:userset;height:21.0pt'>
  <td colspan=3 height=28 class=xl65 width=403 style='border-right:.5pt solid black;
  height:21.0pt;width:302pt'>Facture Alpha</td>
 </tr>
 <tr height=20 style='height:15.0pt'>
  <td height=20 class=xl66 style='height:15.0pt'>Réf</td>
  <td class=xl66>Désignation</td>
  <td class=xl66 align=right>Montant</td>
 </tr>
 <tr height=40 style='mso-height-source:userset;height:30.0pt'>
  <td height=40 class=xl67 style='height:30.0pt'>A-1</td>
  <td rowspan=2 class=xl69 width=190 style='width:143pt'>Vis à bois<br>
    zinguée <font class="font6">4x40</font></td>
  <td class=xl68 align=right>12,50 €</td>
 </tr>
 <tr height=20 style='height:15.0pt'>
  <td height=20 class=xl67 style='height:15.0pt'>A-2</td>
  <td class=xl68 align=right>8,00 €</td>
 </tr>
 <tr height=20 style='height:15.0pt'>
  <td colspan=2 height=20 class=xl66 align=right>Total</td>
  <td class=xl68 align=right>20,50 €</td>
 </tr>
</table>

<!--EndFragment-->
</body>

</html>`;
  const EXCEL_TEXT = 'Facture Alpha\t\t\r\nRéf\tDésignation\tMontant\r\nA-1\t"Vis à bois\nzinguée 4x40"\t12,50 €\r\nA-2\t\t8,00 €\r\nTotal\t\t20,50 €\r\n';

  const SHEETS_HTML = `<meta charset='utf-8'><meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1c2d3e4f"><google-sheets-html-origin><style type="text/css"><!--td {border: 1px solid #cccccc;}br {mso-data-placement:same-cell;}--></style><table xmlns="http://www.w3.org/1999/xhtml" dir="ltr" border="1" cellspacing="0" cellpadding="0" data-sheets-root="1" style="table-layout:fixed;font-size:10pt;font-family:Arial;width:0px;border-collapse:collapse;border:none"><colgroup><col width="100"/><col width="154"/><col width="100"/></colgroup><tbody><tr style="height:21px;"><td colspan="3" rowspan="1" style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:middle;background-color:#ffd966;font-weight:bold;text-align:center;font-size:14pt;" data-sheets-value="{&quot;1&quot;:2,&quot;2&quot;:&quot;Facture Beta&quot;}">Facture Beta</td></tr><tr style="height:21px;"><td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;font-style:italic;color:#ff0000;border-bottom:1px solid #000000;" data-sheets-value="{&quot;1&quot;:2,&quot;2&quot;:&quot;B-1&quot;}">B-1</td><td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;border-bottom:1px solid #000000;" data-sheets-value="{&quot;1&quot;:2,&quot;2&quot;:&quot;Écrou&quot;}">Écrou <span style="font-size:10pt;font-family:Arial;color:#000000;background-color:transparent;font-weight:700;font-style:normal;text-decoration:none;vertical-align:baseline;white-space:pre;white-space:pre-wrap;">M8</span></td><td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;text-align:right;border-bottom:1px solid #000000;" data-sheets-value="{&quot;1&quot;:3,&quot;3&quot;:3.2}" data-sheets-numberformat="{&quot;1&quot;:2,&quot;2&quot;:&quot;#,##0.00\\&quot; €\\&quot;&quot;,&quot;3&quot;:1}">3,20 €</td></tr></tbody></table></google-sheets-html-origin></b>`;
  const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const LIBREOFFICE_HTML = `<!DOCTYPE html>
<html><head><meta http-equiv="content-type" content="text/html; charset=utf-8"/><title></title><meta name="generator" content="LibreOffice 7.3.7.2 (Linux)"/><meta name="created" content="2026-10-02T09:00:00"/><style type="text/css">
		body,div,table,thead,tbody,tfoot,tr,th,td,p { font-family:"Liberation Sans"; font-size:x-small }
		a.comment-indicator:hover + comment { background:#ffd; position:absolute; display:block; border:1px solid black; padding:0.5em;  }
		a.comment-indicator { background:red; display:inline-block; border:1px solid black; width:0.5em; height:0.5em;  }
		comment { display:none;  }
	</style>
</head>
<body>
<table cellspacing="0" border="0">
	<colgroup width="85"></colgroup>
	<colgroup width="120"></colgroup>
	<colgroup width="85"></colgroup>
	<tr>
		<td style="border-top: 1px solid #000000; border-bottom: 1px solid #000000; border-left: 1px solid #000000; border-right: 1px solid #000000" colspan=3 height="21" align="center" valign=middle bgcolor="#FFFF00"><b><font color="#FF0000">Facture Gamma</font></b></td>
		</tr>
	<tr>
		<td height="17" align="left" valign=bottom><i>C-1</i></td>
		<td align="left" valign=top rowspan=2><u>Rondelle</u><br>plate</td>
		<td align="right" valign=bottom sdval="1.75" sdnum="1036;0;#,##0.00">1,75</td>
	</tr>
	<tr>
		<td height="17" align="left" valign=bottom><s>C-2</s></td>
		<td align="right" valign=bottom sdval="0.25" sdnum="1036;0;#,##0.00">0,25</td>
	</tr>
</table>
<!-- ************************************************************************** -->
</body></html>`;

  // --- Gestes : la grille neuve, la case courante, un presse-papiers, un collage ----------------------------------------------------------------------------------------------
  async function enterGrid(h) {
    await h.resetEditor();
    h.openFlyout('#v2-new-template-group');
    await h.clickButton('v2-btn-new-grid');
    await sleep(250);
  }
  async function leaveGrid(h) {
    h.openFlyout('#v2-new-template-group');
    await h.clickButton('v2-btn-new-document');
    await sleep(150);
  }
  async function inGrid(h, body) {
    await enterGrid(h);
    try { return await body(); } finally { await leaveGrid(h); }
  }
  // Position AVANT la case (ligne, colonne) comptées en cases du document (sans fusion : la colonne de la grille).
  function cellPos(row, col) {
    const t = tableNode();
    let pos = 1;
    for (let r = 0; r < row; r++) pos += t.child(r).nodeSize;
    pos += 1;
    const rowNode = t.child(row);
    for (let c = 0; c < col; c++) pos += rowNode.child(c).nodeSize;
    return pos;
  }
  function clipboard(parts) {
    const dt = new DataTransfer();
    if (parts.html != null) dt.setData('text/html', parts.html);
    if (parts.text != null) dt.setData('text/plain', parts.text);
    if (parts.png) {
      const bytes = Uint8Array.from(atob(PNG_BASE64), c => c.charCodeAt(0));
      dt.items.add(new File([bytes], 'image.png', { type: 'image/png' }));
    }
    return dt;
  }
  // Un vrai collage de ProseMirror : un évènement `paste` qui porte le DataTransfer, le curseur dans la case (ligne, colonne).
  async function pasteAt(row, col, parts) {
    ed().chain().focus().setTextSelection(cellPos(row, col) + 2).run();
    await sleep(60);
    const ev = new ClipboardEvent('paste', { clipboardData: clipboard(parts), bubbles: true, cancelable: true });
    ed().view.dom.dispatchEvent(ev);
    await sleep(500);
    return ev.defaultPrevented;
  }
  const docJson = () => JSON.stringify(doc().toJSON());

  // Le tableau lu par EMPLACEMENT (ligne, colonne de la grille, fusions comprises) : { 'r,c': { node, row, col } } - l'indice d'une case dans sa ligne n'est pas sa colonne dès qu'une case
  // fusionnée en couvre une.
  function slots() {
    const out = {};
    const taken = {};
    tableNode().forEach((rowNode, _o, r) => {
      let c = 0;
      rowNode.forEach((cell) => {
        while (taken[r + ',' + c]) c++;
        const colspan = cell.attrs.colspan || 1, rowspan = cell.attrs.rowspan || 1;
        for (let rr = r; rr < r + rowspan; rr++) for (let cc = c; cc < c + colspan; cc++) taken[rr + ',' + cc] = true;
        out[r + ',' + c] = { node: cell, row: r, col: c };
        c += colspan;
      });
    });
    return out;
  }
  const hexOf = css => {
    const m = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(css || '');
    return m ? '#' + [m[1], m[2], m[3]].map(n => Number(n).toString(16).padStart(2, '0')).join('') : css || null;
  };
  // Ce que la case (ligne, colonne) porte : texte, fusion, fond, alignements, traits, marques du texte (gras, italique, souligné, barré, couleur, taille).
  function cellAt(row, col) {
    const slot = slots()[row + ',' + col];
    if (!slot) return null;
    const cell = slot.node;
    const marks = new Set();
    let lineBreaks = 0;
    cell.descendants((node) => {
      if (node.type.name === 'hardBreak') lineBreaks++;
      (node.marks || []).forEach((mark) => {
        const name = mark.type.name;
        marks.add(name === 'textStyle' ? 'textStyle' + (mark.attrs.color ? ':' + hexOf(mark.attrs.color) : '') + (mark.attrs.fontSize ? ':' + mark.attrs.fontSize : '') : name);
      });
    });
    return {
      text: cell.textContent, colspan: cell.attrs.colspan, rowspan: cell.attrs.rowspan, fill: hexOf(cell.attrs.backgroundColor), valign: cell.attrs.verticalAlign,
      borders: [cell.attrs.borderTop, cell.attrs.borderRight, cell.attrs.borderBottom, cell.attrs.borderLeft].map(b => b || '.').join(','),
      align: cell.firstChild.attrs.textAlign || null, marks: Array.from(marks).sort().join(' '), lineBreaks,
    };
  }
  const imageCount = () => { let n = 0; doc().descendants((node) => { if (node.type.name === 'image' || node.type.name === 'editorImage') n++; return true; }); return n; };

  // --- 1) Le modèle : un presse-papiers de tableur lu case par case ---------------------------------------------------------------------------------------------------------------

  cases.push({
    id: 'gridTable_recognizes_spreadsheet_clipboards_and_only_them',
    description: 'Excel, Google Sheets et LibreOffice Calc se reconnaissent à leur signature ; une page web, un tableau de document, des cases copiées dans la grille même (HTML de ProseMirror) et un texte sans tableau ne sont jamais réécrits : `cleanPastedHtml` les rend tels quels.',
    run: async () => {
      const own = '<table data-pm-slice="1 1 []"><tbody><tr><td colspan="1" rowspan="1" data-valign="top"><p>x</p></td></tr></tbody></table>';
      const web = '<table border="1"><tr><td style="background-color: #ff0000; font-weight: bold">x</td></tr></table>';
      const text = '<p>Bonjour <b>tout</b> le monde</p>';
      // Un HTML qui porte la signature d'Excel mais aucun tableau (une plage copiée « comme image ») : l'image se colle comme avant.
      const pictureOnly = '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><body><img src="file:///C:/Temp/clip_image001.png"></body></html>';
      const verdict = {
        excel: GridTable.isSpreadsheetHtml(EXCEL_HTML), sheets: GridTable.isSpreadsheetHtml(SHEETS_HTML), libre: GridTable.isSpreadsheetHtml(LIBREOFFICE_HTML),
        own: GridTable.isSpreadsheetHtml(own), web: GridTable.isSpreadsheetHtml(web), text: GridTable.isSpreadsheetHtml(text), empty: GridTable.isSpreadsheetHtml(''), none: GridTable.isSpreadsheetHtml(null),
        pictureOnly: GridTable.isSpreadsheetHtml(pictureOnly),
      };
      const untouched = [own, web, text, '', pictureOnly].every(html => GridTable.cleanPastedHtml(html) === html);
      const rewritten = GridTable.cleanPastedHtml(EXCEL_HTML) !== EXCEL_HTML && GridTable.cleanPastedHtml(EXCEL_HTML).startsWith('<table>');
      const dt = clipboard({ html: EXCEL_HTML, text: EXCEL_TEXT, png: true });
      const viaClipboard = GridTable.clipboardHasSpreadsheetTable(dt) && !GridTable.clipboardHasSpreadsheetTable(clipboard({ html: web })) && !GridTable.clipboardHasSpreadsheetTable(clipboard({ text: 'a\tb' }));
      const pass = verdict.excel && verdict.sheets && verdict.libre && !verdict.own && !verdict.web && !verdict.text && !verdict.empty && !verdict.none && !verdict.pictureOnly && untouched && rewritten && viaClipboard;
      return { pass, notes: JSON.stringify({ verdict, untouched, rewritten, viaClipboard }) };
    },
  });

  cases.push({
    id: 'gridTable_reads_an_excel_range_cell_by_cell',
    description: 'Une plage d\'Excel (feuille de style, classes `xl65`, `<col>`, `<tr height>`) : cinq lignes de trois colonnes, les largeurs et hauteurs, une case sur trois colonnes (fond orange, gras 14 pt, centrée au milieu, quatre traits noirs dont celui écrit en ligne), des titres gras soulignés d\'un trait, un texte rouge italique centré, une case fusionnée sur deux lignes en haut avec un retour à la ligne et une partie en gras souligné bleu (`<font class>`), des nombres à droite sans que l\'alignement soit écrit (« Standard »), « Total » à droite sur deux colonnes (`align=right`, `td { text-align: general }` n\'est pas du CSS et ne l\'écrase pas).',
    run: async () => {
      const m = GridTable.fromClipboardHtml(EXCEL_HTML);
      const cell = (r, i) => m.rows[r].cells[i];
      const title = cell(0, 0), ref = cell(1, 0), amountTitle = cell(1, 2), code = cell(2, 0), merged = cell(2, 1), price = cell(2, 2), total = cell(4, 0);
      const checks = {
        shape: m.width === 3 && m.rows.length === 5 && m.rows.map(r => r.cells.length).join() === '1,3,3,2,2',
        sizes: m.cols.join() === '64,190,149' && m.rows.map(r => Math.round(r.height)).join() === '28,20,40,20,20',
        title: title.colspan === 3 && title.fill === '#ffc000' && title.align === 'center' && title.valign === 'middle' && title.html === '<span style="font-size: 14pt"><strong>Facture Alpha</strong></span>'
          && [title.borders.top, title.borders.right, title.borders.bottom, title.borders.left].every(b => b === '#000000'),
        heads: ref.html === '<strong>Réf</strong>' && ref.borders.bottom === '#000000' && !ref.borders.top && !ref.borders.left && amountTitle.align === 'right',
        red: code.html === '<span style="color: #c00000"><em>A-1</em></span>' && code.align === 'center' && code.valign === null,
        merged: merged.rowspan === 2 && merged.valign === 'top' && merged.html === 'Vis à bois<br>zinguée <span style="color: #0070c0"><strong><u>4x40</u></strong></span>',
        numbers: price.html === '12,50 €' && price.align === 'right',
        total: total.colspan === 2 && total.align === 'right' && total.html === '<strong>Total</strong>',
        // La ligne 3 n'a que deux cases : la fusion de la ligne 2 couvre la colonne du milieu.
        covered: m.rows[3].cells.map(c => c.col).join() === '0,2',
      };
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify(checks) };
    },
  });

  cases.push({
    id: 'gridTable_reads_a_google_sheets_range',
    description: 'Une plage de Google Sheets (styles en ligne, `<colgroup>`, le quadrillage `#cccccc` de chaque case, des `<span>` pour les parties du texte) : fond jaune, gras 14 pt centré, texte rouge italique, un trait noir en bas, « M8 » en gras dans « Écrou M8 », nombre à droite ; le gris du quadrillage n\'est pas lu comme un trait choisi ; la taille de départ de la table (10 pt) n\'est pas écrite.',
    run: async () => {
      const m = GridTable.fromClipboardHtml(SHEETS_HTML);
      const title = m.rows[0].cells[0], red = m.rows[1].cells[0], part = m.rows[1].cells[1], number = m.rows[1].cells[2];
      const checks = {
        shape: m.width === 3 && m.rows.length === 2 && m.cols.join() === '100,154,100',
        title: title.colspan === 3 && title.fill === '#ffd966' && title.align === 'center' && title.valign === 'middle' && title.html === '<span style="font-size: 14pt"><strong>Facture Beta</strong></span>' && title.borders.top === null,
        red: red.html === '<span style="color: #ff0000"><em>B-1</em></span>' && red.borders.bottom === '#000000' && red.borders.top === null && red.borders.left === null,
        part: part.html === 'Écrou <strong>M8</strong>',
        number: number.html === '3,20 €' && number.align === 'right',
      };
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify(checks) };
    },
  });

  cases.push({
    id: 'gridTable_reads_a_libreoffice_range',
    description: 'Une plage de LibreOffice Calc (attributs de présentation `bgcolor`, `align`, `valign`, `<b><font color>`, `<colgroup width>`, `rowspan`) : fond jaune, gras rouge, quatre traits noirs, les largeurs des colonnes, une case fusionnée en haut avec un retour à la ligne, italique, souligné et barré.',
    run: async () => {
      const m = GridTable.fromClipboardHtml(LIBREOFFICE_HTML);
      const title = m.rows[0].cells[0], italic = m.rows[1].cells[0], merged = m.rows[1].cells[1], struck = m.rows[2].cells[0];
      const checks = {
        shape: m.width === 3 && m.rows.length === 3 && m.cols.join() === '85,120,85',
        title: title.colspan === 3 && title.fill === '#ffff00' && title.align === 'center' && title.valign === 'middle' && title.html === '<span style="color: #ff0000"><strong>Facture Gamma</strong></span>'
          && [title.borders.top, title.borders.right, title.borders.bottom, title.borders.left].every(b => b === '#000000'),
        italic: italic.html === '<em>C-1</em>' && italic.valign === null,
        merged: merged.rowspan === 2 && merged.valign === 'top' && merged.html === '<u>Rondelle</u><br>plate',
        struck: struck.html === '<s>C-2</s>',
        numbers: m.rows[1].cells[2].align === 'right' && m.rows[2].cells[1].align === 'right',
      };
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify(checks) };
    },
  });

  cases.push({
    id: 'gridTable_degenerate_tables_give_a_clean_rectangle_and_nothing_unsafe',
    description: 'Un HTML bancal donne quand même un rectangle propre : une fusion qui dépasse le bas du tableau est ramenée à ses lignes, une ligne trop courte reçoit des cases vides, ni script, ni image, ni tableau imbriqué dans une case, un lien `javascript:` perd son lien et garde son texte, un `https:` le garde ; sans tableau ou sans ligne le modèle est nul ; une table énorme n\'est pas lue.',
    run: async () => {
      const mark = '<meta name="ProgId" content="Excel.Sheet">';
      const clip = rows => `<html>${mark}<body><table>${rows}</table></body></html>`;
      const tall = GridTable.fromClipboardHtml(clip('<tr><td rowspan=9>a</td><td>b</td></tr><tr><td>c</td></tr>'));
      const ragged = GridTable.fromClipboardHtml(clip('<tr><td>a</td><td>b</td><td>c</td></tr><tr><td>d</td></tr>'));
      const wide = GridTable.fromClipboardHtml(clip('<tr><td colspan=3>a</td></tr><tr><td>b</td></tr>'));
      const unsafe = GridTable.fromClipboardHtml(clip('<tr><td>a<script>window.__pwned = 1</script><img src="x" onerror="window.__pwned = 2">b<a href="javascript:window.__pwned = 3">c</a> <a href="https://exemple.fr/x?a=1&b=2">d</a><table><tr><td>zz</td></tr></table></td></tr>'));
      const html = GridTable.toHtml(ragged, { sizes: false });
      const huge = GridTable.fromClipboardHtml(clip('<tr><td>x</td></tr>'.repeat(3001)));
      const checks = {
        tall: tall.rows[0].cells[0].rowspan === 2 && tall.rows[1].cells.length === 1 && tall.rows[1].cells[0].col === 1,
        ragged: ragged.rows[1].cells.length === 3 && ragged.rows[1].cells.map(c => c.col).join() === '0,1,2' && ragged.rows[1].cells[2].html === '' && (html.match(/<td/g) || []).length === 6,
        wide: wide.width === 3 && wide.rows[1].cells.length === 3,
        unsafe: unsafe.rows[0].cells[0].html === 'abc <a href="https://exemple.fr/x?a=1&amp;b=2">d</a>' && window.__pwned === undefined,
        none: GridTable.fromClipboardHtml('<p>pas de tableau</p>') === null && GridTable.fromClipboardHtml(clip('')) === null && GridTable.fromClipboardHtml(null) === null,
        huge: huge === null,
      };
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify(Object.assign({ unsafeHtml: unsafe.rows[0].cells[0].html }, checks)) };
    },
  });

  cases.push({
    id: 'gridTable_a_spreadsheet_beyond_3000_rows_or_300_columns_is_pasted_as_is_and_the_handler_is_told_once',
    description: 'Un tableau de tableur de plus de 3 000 lignes ou de plus de 300 colonnes est toujours collé tel quel, mais le rappel posé par `GridTable.setTooBigHandler` en est prévenu une fois, par la grille comme par le document, avec ce qu\'il compte et la limite (`{ kind: \'rows\' | \'cols\', count, max }`) ; à 3 000 lignes ou 300 colonnes, rien n\'est dit et le tableau est nettoyé ; un tableau web, un tableur lu sans rappel et un rappel qui échoue ne changent rien au collage.',
    run: async () => {
      const mark = '<meta name="ProgId" content="Excel.Sheet">';
      const clip = rows => `<html>${mark}<body><table>${rows}</table></body></html>`;
      const rows = n => '<tr><td>x</td></tr>'.repeat(n);
      const cols = n => '<tr>' + '<td>x</td>'.repeat(n) + '</tr>';
      const told = [];
      const before = GridTable.setTooBigHandler(info => told.push(info));
      try {
        // Ce que `write` en fait et ce que la personne en apprend, pour un collage dans un document puis dans une grille.
        const paste = (clean, html) => { told.length = 0; const out = clean(html); return { rewritten: out !== html, told: told.slice() }; };
        const inDoc = html => paste(GridTable.cleanPastedDocumentHtml, html);
        const inGrid = html => paste(GridTable.cleanPastedHtml, html);
        const rowsAtLimit = inDoc(clip(rows(3000)));
        const rowsOver = inDoc(clip(rows(3001)));
        const rowsOverInGrid = inGrid(clip(rows(3001)));
        const colsAtLimit = inDoc(clip(cols(300)));
        const colsOver = inDoc(clip(cols(301)));
        const colsOverInGrid = inGrid(clip(cols(301)));
        const web = inDoc('<table>' + rows(3001) + '</table>');
        const report = {};
        const model = GridTable.fromClipboardHtml(clip(rows(3001)), report);
        const okReport = {};
        GridTable.fromClipboardHtml(clip(rows(3000)), okReport);
        const emptyReport = {};
        const empty = GridTable.fromClipboardHtml(clip('<tr style="display:none"><td>z</td></tr>'), emptyReport);
        // Un rappel qui échoue ne casse pas le collage (collé tel quel, comme sans rappel).
        GridTable.setTooBigHandler(() => { throw new Error('rappel en échec'); });
        const failingHtml = clip(rows(3001));
        const failing = GridTable.cleanPastedDocumentHtml(failingHtml) === failingHtml;
        GridTable.setTooBigHandler(null);
        const silentHtml = clip(rows(3001));
        const silent = GridTable.cleanPastedDocumentHtml(silentHtml) === silentHtml;
        const checks = {
          rowsAtLimit: rowsAtLimit.rewritten && rowsAtLimit.told.length === 0,
          rowsOver: !rowsOver.rewritten && JSON.stringify(rowsOver.told) === JSON.stringify([{ kind: 'rows', count: 3001, max: 3000 }]),
          rowsOverInGrid: !rowsOverInGrid.rewritten && JSON.stringify(rowsOverInGrid.told) === JSON.stringify([{ kind: 'rows', count: 3001, max: 3000 }]),
          colsAtLimit: colsAtLimit.rewritten && colsAtLimit.told.length === 0,
          colsOver: !colsOver.rewritten && JSON.stringify(colsOver.told) === JSON.stringify([{ kind: 'cols', count: 301, max: 300 }]),
          colsOverInGrid: !colsOverInGrid.rewritten && JSON.stringify(colsOverInGrid.told) === JSON.stringify([{ kind: 'cols', count: 301, max: 300 }]),
          web: !web.rewritten && web.told.length === 0,
          report: model === null && JSON.stringify(report.tooBig) === JSON.stringify({ kind: 'rows', count: 3001, max: 3000 }) && okReport.tooBig === undefined,
          noReportForEmpty: empty === null && emptyReport.tooBig === undefined,
          failing, silent,
        };
        return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, rowsOver: rowsOver.told, colsOver: colsOver.told }) };
      } finally {
        GridTable.setTooBigHandler(before);
      }
    },
  });

  cases.push({
    id: 'gridTable_what_the_spreadsheet_hides_is_not_pasted',
    description: 'Une ligne ou une case masquée (`display:none`, comme Excel écrit une ligne cachée, y compris par une classe de sa feuille de style) ne se colle pas, et une case fusionnée qui couvre une ligne cachée ne couvre que les lignes qui restent : ici « p » sur deux lignes dont la seconde est cachée ne couvre qu\'une ligne et « r » reste sous « p ».',
    run: async () => {
      const mark = '<meta name="ProgId" content="Excel.Sheet"><style>.hid { display: none }</style>';
      const clip = rows => `<html>${mark}<body><table>${rows}</table></body></html>`;
      const m = GridTable.fromClipboardHtml(clip(
        '<tr><td rowspan=2>p</td><td>q</td><td style="display:none">cachée</td><td>s</td></tr>'
        + '<tr style="display:none"><td>z</td><td>y</td></tr>'
        + '<tr class="hid"><td>w</td></tr>'
        + '<tr><td>r</td><td>t</td><td class="hid">v</td><td>u</td></tr>'));
      const texts = m && m.rows.map(row => row.cells.map(c => c.html).join('|')).join(' / ');
      const allHidden = GridTable.fromClipboardHtml(clip('<tr style="display:none"><td>z</td></tr>'));
      const checks = {
        rows: !!m && m.rows.length === 2 && m.width === 3,
        cells: texts === 'p|q|s / r|t|u',
        span: !!m && m.rows[0].cells[0].rowspan === 1,
        allHidden: allHidden === null,
      };
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, texts }) };
    },
  });

  cases.push({
    id: 'gridTable_writes_editor_html_that_a_grid_reads_back_with_its_sizes',
    description: 'Le modèle écrit en HTML d\'éditeur avec ses largeurs et hauteurs (`sizes`) se relit dans une grille tel quel : colonnes 64, 190 et 149 px, lignes 28, 20, 40, 20 et 20 px, fusions, fond, traits, alignements et marques du texte - c\'est aussi le chemin de l\'import d\'un classeur.',
    run: async (h) => inGrid(h, async () => {
      const html = GridTable.toHtml(GridTable.fromClipboardHtml(EXCEL_HTML), { sizes: true });
      GridEditor.setActive(false);
      Editor.setHTML(html);
      GridEditor.setActive(true);
      await sleep(300);
      const widths = Array.from(document.querySelectorAll('.tiptap table > colgroup > col')).map(c => Math.round(parseFloat(c.style.width)));
      const heights = Array.from(document.querySelectorAll('.tiptap table > tbody > tr')).map(r => Math.round(r.getBoundingClientRect().height));
      const title = cellAt(0, 0), merged = cellAt(2, 1), price = cellAt(2, 2);
      const checks = {
        widths: widths.join() === '64,190,149',
        rows: tableNode().childCount === 5 && tableNode().child(0).attrs.rowHeight === 28 && tableNode().child(2).attrs.rowHeight === 40,
        title: title.colspan === 3 && title.fill === '#ffc000' && title.align === 'center' && title.valign === 'middle' && title.borders === '#000000,#000000,#000000,#000000' && title.marks === 'bold textStyle:14pt',
        merged: merged.rowspan === 2 && merged.valign === 'top' && merged.lineBreaks === 1 && merged.marks === 'bold textStyle:#0070c0 underline',
        price: price.text === '12,50 €' && price.align === 'right',
      };
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ widths, heights, checks }) };
    }),
  });

  // --- 2) Le collage : le presse-papiers d'Excel dans une vraie grille ------------------------------------------------------------------------------------------------------------

  cases.push({
    id: 'gridTable_pasting_an_excel_range_with_its_image_pastes_the_cells_not_the_image',
    description: 'Le cas d\'Antoine : le presse-papiers d\'Excel porte le tableau HTML, le texte tabulé ET une image de la plage. Collé dans une case de grille il donne les cases (aucune image), à partir de la case courante, avec les fusions (trois colonnes, deux lignes, deux colonnes), le fond, les traits (le trait du bas des titres est aussi le haut de la ligne d\'en dessous), les alignements, les marques du texte ; le reste de la grille ne change pas, et UN Annuler rend la grille d\'avant.',
    run: async (h) => inGrid(h, async () => {
      const before = docJson();
      const sizesOf = () => JSON.stringify([Array.from(document.querySelectorAll('.tiptap table > colgroup > col')).map(c => Math.round(parseFloat(c.style.width))), tableNode().content.content.map(r => r.attrs.rowHeight)]);
      const sizesBefore = sizesOf();
      const prevented = await pasteAt(1, 1, { html: EXCEL_HTML, text: EXCEL_TEXT, png: true });
      const after = docJson();
      const title = cellAt(1, 1), ref = cellAt(2, 1), amountTitle = cellAt(2, 3), code = cellAt(3, 1), merged = cellAt(3, 2), price = cellAt(3, 3), second = cellAt(4, 1), total = cellAt(5, 1), totalPrice = cellAt(5, 3);
      const aboveStaysEmpty = ['0,0', '0,1', '1,0', '2,0'].every(k => slots()[k].node.textContent === '');
      const checks = {
        prevented, noImage: imageCount() === 0 && document.querySelectorAll('.tiptap img').length === 0,
        // Les largeurs et les hauteurs de la source (64, 190, 149 px ; 28, 20, 40 px) ne s'appliquent pas : la grille garde les siennes.
        grid: tableNode().childCount === 15 && aboveStaysEmpty && sizesOf() === sizesBefore,
        title: title.text === 'Facture Alpha' && title.colspan === 3 && title.fill === '#ffc000' && title.valign === 'middle' && title.align === 'center' && title.borders === '#000000,#000000,#000000,#000000' && title.marks === 'bold textStyle:14pt',
        // Le trait du bas du titre est AUSSI le trait du haut de « Réf », et celui du bas de « Réf » le haut de « A-1 » : un trait entre deux cases est UN trait.
        heads: ref.text === 'Réf' && ref.marks === 'bold' && ref.borders === '#000000,.,#000000,.' && amountTitle.align === 'right' && amountTitle.borders === '#000000,.,#000000,.',
        sharedEdge: code.borders === '#000000,.,.,.' && code.text === 'A-1' && code.align === 'center' && code.marks === 'italic textStyle:#c00000',
        merged: merged.text === 'Vis à boiszinguée 4x40' && merged.rowspan === 2 && merged.valign === 'top' && merged.lineBreaks === 1 && merged.marks === 'bold textStyle:#0070c0 underline',
        price: price.text === '12,50 €' && price.align === 'right' && second.text === 'A-2',
        total: total.text === 'Total' && total.colspan === 2 && total.align === 'right' && total.borders === '.,.,#000000,.' && totalPrice.text === '20,50 €',
      };
      ed().commands.undo();
      await sleep(120);
      checks.undoOnce = docJson() === before && after !== before;
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, title, merged }) };
    }),
  });

  cases.push({
    id: 'gridTable_pasting_past_the_edge_of_the_grid_adds_the_rows_and_columns_it_needs',
    description: 'Une plage de trois colonnes collée sur la colonne 5 d\'une grille de six, à la ligne 14 d\'une grille de quinze : la grille gagne la colonne et les lignes qui lui manquent, prises à la taille de leurs voisines (colonne 100 px, lignes 28 px), sans toucher aux autres cases ; les fusions restent justes.',
    run: async (h) => inGrid(h, async () => {
      const rows = tableNode().childCount, cols = tableNode().child(0).childCount;
      await pasteAt(13, 4, { html: EXCEL_HTML, text: EXCEL_TEXT, png: true });
      const widths = Array.from(document.querySelectorAll('.tiptap table > colgroup > col')).map(c => Math.round(parseFloat(c.style.width)));
      const heights = tableNode().content.content.map(r => r.attrs.rowHeight);
      const title = cellAt(13, 4), merged = cellAt(15, 5), last = cellAt(17, 4);
      const checks = {
        grown: tableNode().childCount === 18 && slots()['0,6'] !== undefined && rows === 15 && cols === 6,
        sizes: widths.length === 7 && widths.every(w => w === 100) && heights.every(x => x === 28),
        title: title.text === 'Facture Alpha' && title.colspan === 3 && title.fill === '#ffc000',
        merged: merged.text === 'Vis à boiszinguée 4x40' && merged.rowspan === 2,
        last: last.text === 'Total' && last.colspan === 2 && cellAt(17, 6).text === '20,50 €',
        empty: ['0,0', '12,5', '12,6', '13,3', '14,3', '17,3'].every(k => slots()[k].node.textContent === ''),
      };
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, widths, heights: heights.join() }) };
    }),
  });

  cases.push({
    id: 'gridTable_pasting_google_sheets_and_libreoffice_ranges_pastes_the_cells',
    description: 'Les presse-papiers de Google Sheets et de LibreOffice Calc donnent eux aussi des cases mises en forme (fond, gras, couleur, fusions, traits) dans la grille, sans image ; le gris du quadrillage de Sheets ne devient pas un trait.',
    run: async (h) => inGrid(h, async () => {
      await pasteAt(0, 0, { html: SHEETS_HTML, text: 'Facture Beta\t\t\nB-1\tÉcrou M8\t3,20 €\n' });
      const sheetTitle = cellAt(0, 0), sheetRed = cellAt(1, 0), sheetPart = cellAt(1, 1), sheetNumber = cellAt(1, 2);
      await pasteAt(5, 0, { html: LIBREOFFICE_HTML, text: 'Facture Gamma\t\t\nC-1\tRondelle\nplate\t1,75\nC-2\t\t0,25\n' });
      const calcTitle = cellAt(5, 0), calcMerged = cellAt(6, 1), calcStruck = cellAt(7, 0), calcNumber = cellAt(7, 2);
      const checks = {
        sheetTitle: sheetTitle.colspan === 3 && sheetTitle.fill === '#ffd966' && sheetTitle.align === 'center' && sheetTitle.marks === 'bold textStyle:14pt' && sheetTitle.borders === '.,.,.,.',
        sheetRed: sheetRed.marks === 'italic textStyle:#ff0000' && sheetRed.borders === '.,.,#000000,.',
        sheetPart: sheetPart.text === 'Écrou M8' && sheetPart.marks === 'bold',
        sheetNumber: sheetNumber.text === '3,20 €' && sheetNumber.align === 'right',
        calcTitle: calcTitle.colspan === 3 && calcTitle.fill === '#ffff00' && calcTitle.marks === 'bold textStyle:#ff0000' && calcTitle.borders === '#000000,#000000,#000000,#000000',
        calcMerged: calcMerged.rowspan === 2 && calcMerged.valign === 'top' && calcMerged.lineBreaks === 1 && calcMerged.marks === 'underline',
        calcStruck: calcStruck.marks === 'strike' && calcNumber.align === 'right',
        noImage: imageCount() === 0,
      };
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, sheetRed }) };
    }),
  });

  cases.push({
    id: 'gridTable_cells_copied_inside_the_grid_are_pasted_as_they_are',
    description: 'Des cases copiées DANS la grille (leur HTML est celui de ProseMirror, pas celui d\'un tableur) se collent ailleurs exactement comme avant : fond, gras, alignement vertical et trait gardés, aucun réécrit.',
    run: async (h) => inGrid(h, async () => {
      ed().chain().focus().setTextSelection(cellPos(1, 1) + 2).insertContent('<strong>Gras</strong> et texte').run();
      await sleep(60);
      ed().chain().focus().setTextSelection(cellPos(1, 1) + 2).run();
      await sleep(40);
      // Fond, alignement vertical en haut et trait du bas écrits comme le fait la barre de la case.
      const pos = cellPos(1, 1);
      ed().view.dispatch(ed().state.tr.setNodeMarkup(pos, undefined, Object.assign({}, tableNode().child(1).child(1).attrs, { backgroundColor: '#ffe699', verticalAlign: 'top', borderBottom: '#c0392b' })));
      await sleep(80);
      ed().chain().focus().setCellSelection({ anchorCell: cellPos(1, 1), headCell: cellPos(1, 1) }).run();
      await sleep(60);
      const dt = new DataTransfer();
      ed().view.dom.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }));
      const copied = dt.getData('text/html');
      const spreadsheet = GridTable.isSpreadsheetHtml(copied);
      ed().chain().focus().setTextSelection(cellPos(4, 3) + 2).run();
      await sleep(60);
      ed().view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      await sleep(400);
      const source = cellAt(1, 1), copy = cellAt(4, 3);
      const pass = !spreadsheet && copy.text === 'Gras et texte' && copy.fill === '#ffe699' && copy.valign === 'top' && copy.borders.split(',')[2] === '#c0392b' && copy.marks === 'bold' && source.fill === '#ffe699';
      return { pass, notes: JSON.stringify({ spreadsheet, source, copy, htmlStart: copied.slice(0, 120) }) };
    }),
  });

  cases.push({
    id: 'gridTable_a_plain_html_table_pasted_in_a_grid_is_not_rewritten',
    description: 'Un tableau HTML qui ne vient pas d\'un tableur (une page web) est collé comme avant : ProseMirror le lit, son texte en gras garde sa marque, ses fusions restent ; la réécriture ne le touche pas.',
    run: async (h) => inGrid(h, async () => {
      const web = '<table border="1"><tr><td colspan="2" style="font-weight: bold">Titre web</td></tr><tr><td>a</td><td>b</td></tr></table>';
      const untouched = GridTable.cleanPastedHtml(web) === web;
      await pasteAt(2, 2, { html: web, text: 'Titre web\n\na\tb' });
      const title = cellAt(2, 2), a = cellAt(3, 2);
      const pass = untouched && title.text === 'Titre web' && title.colspan === 2 && title.marks === 'bold' && a.text === 'a' && cellAt(3, 3).text === 'b';
      return { pass, notes: JSON.stringify({ untouched, title, a }) };
    }),
  });

  // --- 5) Hors grille : un document reçoit le tableau, case par case -----------------------------------------------------------------------------------------------------------------
  // Un tableau du DOCUMENT : fusions, fond, texte, alignement horizontal et largeur des colonnes ; ni traits case par case, ni alignement vertical, ni hauteur de ligne (le PDF et le Word ne les
  // lisent que pour une grille : l'éditeur les montrerait, l'export non). Une ligne qui porte `data-row-height` ferait traiter le tableau en grille.

  const tableCount = () => { let n = 0; doc().descendants((node) => { if (node.type.name === 'table') n++; return true; }); return n; };
  // Colle `parts` dans un document ordinaire (un paragraphe « début », le curseur après « dé ») ; rend ce que la personne voit.
  async function pasteInDocument(h, parts, opts) {
    const { html = '<p>début</p>', caret = () => 3, prepare = null } = opts || {};
    await h.resetEditor();
    Editor.setHTML(html);
    await sleep(150);
    ed().chain().focus().setTextSelection(caret()).run();
    if (prepare) await prepare();
    await sleep(60);
    const before = docJson();
    const ev = new ClipboardEvent('paste', { clipboardData: clipboard(parts), bubbles: true, cancelable: true });
    ed().view.dom.dispatchEvent(ev);
    await sleep(700);
    return { before, prevented: ev.defaultPrevented, images: imageCount(), domImages: document.querySelectorAll('.tiptap img:not(.ProseMirror-separator)').length, tables: tableCount(), html: Editor.getHTML(), grid: GridEditor.isActive() };
  }
  const widthsOfFirstRow = () => { const out = []; tableNode().firstChild.forEach(cell => (cell.attrs.colwidth || [null]).forEach(w => out.push(w))); return out.join(','); };

  cases.push({
    id: 'gridTable_in_a_document_an_excel_clipboard_pastes_the_cells_not_the_image',
    description: 'Le cas d\'Antoine hors grille : le presse-papiers d\'Excel (tableau HTML, texte tabulé ET image de la plage) collé dans un document donne un tableau du document - aucune image - posé au curseur (le paragraphe se coupe autour) ; fusions, fond, gras, souligné, couleur et taille du texte, alignement horizontal, retour à la ligne et largeurs des colonnes d\'Excel sont repris ; ni trait case par case, ni alignement vertical, ni hauteur de ligne (rien qui fasse prendre le tableau pour une grille) ; un seul Annuler.',
    run: async (h) => {
      const out = await pasteInDocument(h, { html: EXCEL_HTML, text: EXCEL_TEXT, png: true });
      const title = cellAt(0, 0), ref = cellAt(1, 0), amountTitle = cellAt(1, 2), code = cellAt(2, 0), merged = cellAt(2, 1), price = cellAt(2, 2), second = cellAt(3, 0), total = cellAt(4, 0), totalPrice = cellAt(4, 2);
      const rows = []; tableNode().forEach(row => rows.push(row.childCount));
      const widths = widthsOfFirstRow();
      const around = [doc().firstChild.textContent, doc().lastChild.textContent];
      const checks = {
        prevented: out.prevented, noImage: out.images === 0 && out.domImages === 0, oneTable: out.tables === 1 && !out.grid,
        splitAround: doc().firstChild.type.name === 'paragraph' && around.join('|') === 'dé|but',
        shape: rows.join(',') === '1,3,3,2,2',
        title: title.text === 'Facture Alpha' && title.colspan === 3 && title.fill === '#ffc000' && title.align === 'center' && title.marks === 'bold textStyle:14pt',
        heads: ref.text === 'Réf' && ref.marks === 'bold' && amountTitle.align === 'right',
        code: code.text === 'A-1' && code.align === 'center' && code.marks === 'italic textStyle:#c00000',
        merged: merged.text === 'Vis à boiszinguée 4x40' && merged.rowspan === 2 && merged.lineBreaks === 1 && merged.marks === 'bold textStyle:#0070c0 underline',
        price: price.text === '12,50 €' && price.align === 'right' && second.text === 'A-2',
        total: total.text === 'Total' && total.colspan === 2 && total.align === 'right' && totalPrice.text === '20,50 €',
        widths: widths === '64,190,149',
        // Ce qu'un document ne sait pas rendre à l'export : ni trait case par case, ni alignement vertical, ni hauteur de ligne.
        noBorders: [title, ref, code, merged, total].every(c => c.borders === '.,.,.,.'),
        noVerticalAlign: [title, merged].every(c => c.valign === null),
        notAGrid: !/data-row-height|data-border-|data-valign/.test(out.html),
      };
      ed().commands.undo();
      await sleep(120);
      checks.undoOnce = docJson() === out.before && tableCount() === 0;
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, title, merged, widths }) };
    },
  });

  cases.push({
    id: 'gridTable_in_a_document_google_sheets_and_libreoffice_ranges_paste_the_cells',
    description: 'Les presse-papiers de Google Sheets et de LibreOffice Calc donnent eux aussi un tableau du document (fond, gras, couleur, fusions, texte barré, alignement), sans image, sans trait ni alignement vertical par case ; le gris du quadrillage de Sheets ne devient rien.',
    run: async (h) => {
      const sheets = await pasteInDocument(h, { html: SHEETS_HTML, text: 'Facture Beta\t\t\nB-1\tÉcrou M8\t3,20 €\n' });
      const sheetTitle = cellAt(0, 0), sheetRed = cellAt(1, 0), sheetPart = cellAt(1, 1), sheetNumber = cellAt(1, 2);
      const sheetsHtml = sheets.html;
      const calc = await pasteInDocument(h, { html: LIBREOFFICE_HTML, text: 'Facture Gamma\t\t\nC-1\tRondelle\nplate\t1,75\nC-2\t\t0,25\n' });
      const calcTitle = cellAt(0, 0), calcMerged = cellAt(1, 1), calcStruck = cellAt(2, 0), calcNumber = cellAt(2, 2);
      const checks = {
        sheetsNoImage: sheets.images === 0 && sheets.domImages === 0 && sheets.tables === 1,
        sheetTitle: sheetTitle.colspan === 3 && sheetTitle.fill === '#ffd966' && sheetTitle.align === 'center' && sheetTitle.marks === 'bold textStyle:14pt',
        sheetRed: sheetRed.marks === 'italic textStyle:#ff0000', sheetPart: sheetPart.text === 'Écrou M8' && sheetPart.marks === 'bold', sheetNumber: sheetNumber.text === '3,20 €' && sheetNumber.align === 'right',
        sheetsPlain: !/data-row-height|data-border-|data-valign|#cccccc/i.test(sheetsHtml) && [sheetTitle, sheetRed].every(c => c.borders === '.,.,.,.' && c.valign === null),
        calcNoImage: calc.images === 0 && calc.domImages === 0 && calc.tables === 1,
        calcTitle: calcTitle.colspan === 3 && calcTitle.fill === '#ffff00' && calcTitle.marks === 'bold textStyle:#ff0000',
        calcMerged: calcMerged.rowspan === 2 && calcMerged.lineBreaks === 1 && calcMerged.marks === 'underline',
        calcStruck: calcStruck.marks === 'strike' && calcNumber.align === 'right',
        calcPlain: !/data-row-height|data-border-|data-valign/.test(calc.html) && [calcTitle, calcMerged].every(c => c.borders === '.,.,.,.' && c.valign === null),
      };
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, sheetTitle, calcTitle }) };
    },
  });

  cases.push({
    id: 'gridTable_in_a_document_only_a_spreadsheet_table_is_rewritten_an_image_alone_is_still_pasted',
    description: 'Hors grille, rien d\'autre ne change : un tableau HTML qui ne vient pas d\'un tableur (une page web) n\'est pas réécrit (ProseMirror le lit, son texte en gras garde sa marque, sa fusion reste) ; une image seule (aucun tableau dans le presse-papiers) se colle toujours comme image ; le texte seul aussi.',
    run: async (h) => {
      const web = '<table border="1"><tr><td colspan="2" style="font-weight: bold">Titre web</td></tr><tr><td>a</td><td>b</td></tr></table>';
      const untouched = GridTable.cleanPastedDocumentHtml(web) === web && GridTable.cleanPastedDocumentHtml('<p>texte</p>') === '<p>texte</p>' && GridTable.cleanPastedDocumentHtml('') === '' && GridTable.cleanPastedDocumentHtml(null) === null;
      const pasted = await pasteInDocument(h, { html: web, text: 'Titre web\n\na\tb' });
      const title = cellAt(0, 0);
      const webOk = pasted.tables === 1 && pasted.images === 0 && pasted.domImages === 0 && title.text === 'Titre web' && title.colspan === 2 && title.marks === 'bold' && cellAt(1, 0).text === 'a' && cellAt(1, 1).text === 'b';
      const image = await pasteInDocument(h, { png: true });
      const imageOk = image.prevented && image.images === 1 && image.domImages === 1 && image.tables === 0;
      const text = await pasteInDocument(h, { text: 'seulement du texte' });
      const textOk = text.tables === 0 && text.images === 0 && text.domImages === 0 && /seulement du texte/.test(doc().textContent);
      return { pass: untouched && webOk && imageOk && textOk, notes: JSON.stringify({ untouched, webOk, imageOk, textOk, web: { tables: pasted.tables, title } }) };
    },
  });

  cases.push({
    id: 'gridTable_in_a_document_a_spreadsheet_beyond_the_limits_is_pasted_as_is_and_a_notice_says_so',
    description: 'Collé dans un document, un tableau de tableur de plus de 3 000 lignes (ou 300 colonnes) arrive tel quel - le tableau est bien là - et une fenêtre d\'information s\'ouvre une fois (« Tableau collé sans mise en forme », nombre et limite en toutes lettres, bouton « Fermer »), en français puis en anglais ; à 3 000 lignes, rien ne s\'ouvre et le tableau est nettoyé ; la fenêtre ne s\'ouvre pas dans le collage même (le tableau est posé quand elle s\'ouvre).',
    run: async (h) => {
      const mark = '<meta name="ProgId" content="Excel.Sheet">';
      const clip = rows => `<html>${mark}<body><table>${rows}</table></body></html>`;
      const rows = n => '<tr><td>x</td><td>y</td></tr>'.repeat(n);
      const spaced = text => text.replace(/[  ]/g, ' ');
      // Le nombre de tableaux du document au moment où la fenêtre est demandée : 1 si elle attend la fin du collage.
      const tablesWhenAsked = [];
      const stub = h.stubDialogs({ choose: () => { tablesWhenAsked.push(tableCount()); return null; } });
      const lang = I18n.getLang();
      try {
        const big = await pasteInDocument(h, { html: clip(rows(3001)), text: 'x\ty' });
        await sleep(200);
        const askedFr = stub.asked.slice();
        stub.asked.length = 0;
        I18n.setLang('en');
        const bigEn = await pasteInDocument(h, { html: clip(rows(3001)), text: 'x\ty' });
        await sleep(200);
        const askedEn = stub.asked.slice();
        stub.asked.length = 0;
        I18n.setLang('fr');
        const atLimit = await pasteInDocument(h, { html: clip(rows(3000)), text: 'x\ty' });
        await sleep(200);
        const askedAtLimit = stub.asked.slice();
        const checks = {
          pastedAsIs: big.tables === 1 && big.images === 0 && bigEn.tables === 1,
          oneNoticeFr: askedFr.length === 1 && askedFr[0].kind === 'choose',
          afterThePaste: tablesWhenAsked[0] === 1,
          titleFr: askedFr[0] && askedFr[0].title === 'Tableau collé sans mise en forme',
          messageFr: askedFr[0] && spaced(askedFr[0].message) === 'Le tableau collé compte 3 001 lignes : au-delà de 3 000, il est collé tel quel, sans la mise en forme du tableur (fusions, fonds, largeurs de colonnes).',
          closeFr: askedFr[0] && askedFr[0].cancelLabel === 'Fermer' && Array.isArray(askedFr[0].choices) && askedFr[0].choices.length === 0,
          oneNoticeEn: askedEn.length === 1,
          titleEn: askedEn[0] && askedEn[0].title === 'Table pasted without formatting',
          messageEn: askedEn[0] && askedEn[0].message === 'The pasted table has 3,001 rows: beyond 3,000, it is pasted as is, without the spreadsheet formatting (merged cells, fills, column widths).' && askedEn[0].cancelLabel === 'Close',
          atLimitSilent: askedAtLimit.length === 0 && atLimit.tables === 1 && !/ProgId|mso-/i.test(atLimit.html),
        };
        return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, fr: askedFr, en: askedEn }) };
      } finally {
        I18n.setLang(lang);
        stub.restore();
      }
    },
  });

  cases.push({
    id: 'gridTable_toDocumentHtml_keeps_widths_fills_and_merges_but_no_row_heights_borders_or_vertical_alignment',
    description: 'GridTable.toDocumentHtml (le tableau d\'un document) : largeurs des colonnes (`colwidth`, colgroup), fond, fusions, alignement horizontal gardés ; aucune `data-row-height`, aucun `data-border-*`, aucun `data-valign`, même quand le modèle les porte ; cleanPastedHtml (la grille) reste sans largeurs ni hauteurs.',
    run: async () => {
      const model = GridTable.fromClipboardHtml(EXCEL_HTML);
      const document = GridTable.toDocumentHtml(model);
      const gridHtml = GridTable.cleanPastedHtml(EXCEL_HTML);
      const modelKeepsThem = model.rows.some(r => r.height > 0) && model.rows.some(r => r.cells.some(c => c.valign)) && model.rows.some(r => r.cells.some(c => c.borders && Object.values(c.borders).some(Boolean)));
      const checks = {
        modelKeepsThem,
        widths: /colwidth="64"/.test(document) && /colwidth="190"/.test(document) && /colwidth="149"/.test(document) && /colwidth="64,190,149"/.test(document) && /<col style="width: 190px;">/.test(document),
        fillAndMerges: /colspan="3"[^>]*style="background-color: #ffc000"/i.test(document) && /rowspan="2"/.test(document) && /text-align: center/.test(document),
        noRowHeight: !/data-row-height|style="height/.test(document),
        noBorders: !/data-border-/.test(document), noValign: !/data-valign/.test(document),
        gridUntouched: !/colwidth|<colgroup|data-row-height/.test(gridHtml) && /data-border-/.test(gridHtml) && /data-valign/.test(gridHtml),
      };
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, head: document.slice(0, 300) }) };
    },
  });

  cases.push({
    id: 'gridTable_in_a_document_an_excel_clipboard_pasted_inside_a_table_fills_its_cells',
    description: 'Le curseur dans une case d\'un tableau du document : le tableau d\'Excel remplit les cases à partir de celle du curseur (comme tout tableau collé dans un tableau), sans image et sans second tableau dedans ; le texte avant et après le tableau ne bouge pas ; un Annuler rend le document.',
    run: async (h) => {
      const start = '<p>début</p><table><tbody><tr><td><p>un</p></td><td><p>deux</p></td></tr><tr><td><p>trois</p></td><td><p>quatre</p></td></tr></tbody></table><p>fin</p>';
      const firstCellText = () => { let at = null; doc().descendants((node, pos) => { if (at === null && node.type.name === 'tableCell') at = pos + 2; return at === null; }); return at; };
      const out = await pasteInDocument(h, { html: EXCEL_HTML, text: EXCEL_TEXT, png: true }, { html: start, caret: firstCellText });
      let nested = 0;
      doc().descendants((node, pos, parent) => { if (node.type.name === 'table' && parent && parent.type.name === 'tableCell') nested++; return true; });
      const title = cellAt(0, 0), ref = cellAt(1, 0);
      const checks = {
        noImage: out.images === 0 && out.domImages === 0, oneTable: out.tables === 1 && nested === 0,
        around: doc().firstChild.textContent === 'début' && doc().lastChild.textContent === 'fin',
        filled: !!title && title.text === 'Facture Alpha' && !!ref && ref.text === 'Réf',
      };
      ed().commands.undo();
      await sleep(120);
      checks.undoOnce = docJson() === out.before;
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, nested, title, ref, html: out.html.slice(0, 600) }) };
    },
  });

  cases.push({
    id: 'gridTable_in_a_document_a_range_wider_than_the_page_is_brought_back_to_the_page',
    description: 'Une plage de douze colonnes de largeurs différentes (1 200 px au total, plus que la page) collée dans un document : le tableau garde les proportions d\'Excel mais revient à la largeur de la page (Aperçu A4, la vue de départ : rien ne dépasse dans l\'éditeur, donc nulle part), et UN Annuler rend le document d\'avant.',
    run: async (h) => {
      const pattern = [60, 100, 140, 100, 60, 100, 140, 100, 60, 100, 140, 100];
      const cols = pattern.length;
      const colTags = pattern.map(w => `<col width=${w} style="width:${w * 0.75}pt">`).join('');
      const row = pattern.map((w, i) => `<td height=20 width=${w} style="height:15.0pt;width:${w * 0.75}pt">C${i + 1}</td>`).join('');
      const wide = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta name=ProgId content=Excel.Sheet></head><body><table border=0 cellpadding=0 cellspacing=0 width=${cols * 100} style="border-collapse:collapse;table-layout:fixed;width:${cols * 75}pt">${colTags}<tr height=20 style="height:15.0pt">${row}</tr><tr height=20 style="height:15.0pt">${row}</tr></table></body></html>`;
      // L'Aperçu A4 est la vue de départ du widget ; resetEditor() la retire entre deux scénarios, on la repose comme les autres scénarios qui en ont besoin.
      const container = document.getElementById('editor-container');
      const reader = document.getElementById('reader-container');
      const a4 = async () => { container.classList.add('a4-preview'); reader.classList.add('a4-preview'); await sleep(200); };
      const out = await pasteInDocument(h, { html: wide, text: Array.from({ length: cols }, (_, i) => 'C' + (i + 1)).join('\t') }, { prepare: a4 });
      const page = EditorCore.editorContentWidthPx(ed());
      const a4On = container.classList.contains('a4-preview');
      container.classList.remove('a4-preview'); reader.classList.remove('a4-preview');
      const widths = [];
      tableNode().firstChild.forEach(cell => (cell.attrs.colwidth || [null]).forEach(w => widths.push(w)));
      const total = widths.reduce((sum, w) => sum + (w || 0), 0);
      const domTable = document.querySelector('.tiptap table');
      const checks = {
        a4Preview: a4On && page > 0,
        oneTable: out.tables === 1 && widths.length === cols && widths.every(w => w >= 25),
        fitsThePage: total <= page + 1 && total >= page - cols,
        sameProportions: widths.length === cols && widths.every((w, i) => Math.abs(w / widths[0] - pattern[i] / pattern[0]) < 0.1),
        drawnWithinThePage: !!domTable && domTable.getBoundingClientRect().width <= page + 2,
      };
      ed().commands.undo();
      await sleep(150);
      checks.undoOnce = docJson() === out.before && tableCount() === 0;
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, page, total, widths: widths.join(',') }) };
    },
  });

  // Les presse-papiers ci-dessus, pour dev-tests/verify-doc-paste-mouse.mjs : il les pose dans le VRAI presse-papiers du navigateur (navigator.clipboard.write) et colle au vrai Ctrl+V.
  window.GridTableFixtures = { EXCEL_HTML, EXCEL_TEXT, SHEETS_HTML, LIBREOFFICE_HTML, PNG_BASE64 };
  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.gridTable = cases;
})();
