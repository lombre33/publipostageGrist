// Le VRAI tableau croisé dynamique d'Excel, pour l'export Excel d'une grille qui porte un tableau croisé (js/pivot.js, js/pivot-zones.js). Un module PUR : aucune dépendance au DOM ni à ExcelJS ; il reçoit ce que
// PivotZones.nativeInfo a lu (la définition, le tableau que le moteur a calculé, les lignes lues à plat) et rend DE QUOI ÉCRIRE :
//   - `plan(info, labels)` : { source, sheet, ... } - les données à plat (une ligne par ligne source, une colonne par colonne de regroupement puis la valeur), la grille de cases que le tableau croisé montre
//     (pour ceux qui ne l'actualisent pas : Aperçu, LibreOffice, Excel en mode protégé) et tout ce qu'il faut pour les parties d'Office ; null quand Excel ne saurait pas le refaire à l'identique ;
//   - `xml(plan, place)` : les trois parties du fichier (la définition du cache, ses enregistrements, la définition du tableau) pour l'endroit où js/xlsx-export.js a posé les données et le tableau.
// ExcelJS ne sait pas écrire de tableau croisé : js/xlsx-export.js écrit les cases, puis ajoute à l'archive ces parties et leurs relations (comme pour les graphiques natifs). Le fichier demande à Excel de recalculer le tableau à
// l'ouverture (`refreshOnLoad`) : ce qu'il montre est alors son propre calcul des mêmes lignes ; les cases écrites ne servent qu'aux outils qui ne recalculent pas.
//
// Ce qu'Excel fait autrement que le tableau écrit en texte, et que ce module ne cache pas : l'ordre des rangées et des colonnes est celui du tableau, figé (le tri « par total » devient un ordre manuel) ; les valeurs
// nulles ne se masquent que par le format de nombre ; ni liste de choix en regroupement (une ligne y serait comptée deux fois dans les totaux) ni valeur en erreur (`plan` rend null) ; deux textes qui ne diffèrent que
// par la casse sont un seul élément pour Excel (`plan` rend null aussi).
const XlsxPivot = (function () {
  const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  // Un élément d'un tableau croisé ne dépasse pas 255 signes dans Excel.
  const MAX_ITEM = 255;
  const SUBTOTAL = { sum: null, count: 'count', average: 'average', min: 'min', max: 'max' };

  const isError = value => value !== null && value !== undefined && typeof value === 'object';
  const xmlAttr = text => String(text == null ? '' : text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  // Le texte d'un élément ou d'un nom, tel qu'il s'écrit partout (données, cache, tableau) : sans signe de commande (XML ne les accepte pas), sur une ligne, à 255 signes au plus.
  const tidy = text => {
    const clean = String(text == null ? '' : text).replace(/[\u0000-\u001F\u007F-\u009F￾￿]+/g, ' ').replace(/\s+/g, ' ').trim();
    return clean.length > MAX_ITEM ? clean.slice(0, MAX_ITEM - 1) + '…' : clean;
  };
  function columnLetters(index) {
    let n = index + 1;
    let out = '';
    while (n > 0) { const rest = (n - 1) % 26; out = String.fromCharCode(65 + rest) + out; n = Math.floor((n - 1) / 26); }
    return out;
  }
  // Un nom que les autres n'ont pas (Excel compare sans tenir compte de la casse) : « nom (2) ».
  function uniqueName(name, taken) {
    const base = tidy(name) || '-';
    let candidate = base;
    let n = 2;
    while (taken.has(candidate.toLowerCase())) candidate = base + ' (' + n++ + ')';
    taken.add(candidate.toLowerCase());
    return candidate;
  }
  // Les éléments d'un champ, dans l'ordre où le tableau les montre : { list: [texte], index: Map(texte -> rang) } ; null si deux textes ne diffèrent que par la casse.
  function itemsOf(texts) {
    const list = [];
    const index = new Map();
    const lower = new Set();
    for (const raw of texts) {
      const text = tidy(raw) || '-';
      if (index.has(text)) continue;
      if (lower.has(text.toLowerCase())) return null;
      lower.add(text.toLowerCase());
      index.set(text, list.length);
      list.push(text);
    }
    return { list, index };
  }

  // La grille des cases du tableau (celle que montre Excel en forme tabulaire) : [[{ text | value, bold, head }]], sa largeur et la place de ses en-têtes.
  function gridOf(info, names, labels, fieldNames) {
    const { def, result } = info;
    const depth = def.rows.length;
    const hasCols = def.cols.length === 1;
    const text = (value, extra) => Object.assign({ text: value }, extra);
    const number = (value, extra) => (value === null || value === undefined ? { text: '' } : Object.assign({ value }, extra));
    const grid = [];
    const header = fieldNames.slice(0, depth).map(name => text(name, { head: true }));
    if (hasCols) result.cols.forEach(column => header.push(text(tidy(column.label) || '-', { head: true })));
    else header.push(text(names.data, { head: true }));
    if (result.rowTotals) header.push(text(labels.total, { head: true }));
    const width = header.length;
    if (hasCols) {
      const top = [text(names.data, { head: true })];
      for (let i = 1; i < depth; i++) top.push(text('', { head: true }));
      top.push(text(fieldNames[depth], { head: true }));
      while (top.length < width) top.push(text('', { head: true }));
      grid.push(top);
    }
    grid.push(header);
    result.rows.forEach((row, at) => {
      const cells = row.labels.map((label, level) => text(level < row.from ? '' : (tidy(label) || '-')));
      result.cells[at].forEach(value => cells.push(number(value)));
      if (result.rowTotals) cells.push(number(result.rowTotals[at], { bold: true }));
      grid.push(cells);
    });
    if (result.colTotals) {
      const cells = [text(labels.total, { head: true })];
      for (let i = 1; i < depth; i++) cells.push(text('', { head: true }));
      result.colTotals.forEach(value => cells.push(number(value, { bold: true, head: true })));
      if (result.rowTotals) cells.push(number(result.grand, { bold: true, head: true }));
      grid.push(cells);
    }
    return { grid, width, height: grid.length, headRows: hasCols ? 2 : 1 };
  }

  // Le plan du tableau croisé d'Excel pour `info` (PivotZones.nativeInfo). `labels` : { total, line, filled(nom) } - le texte du total général, du champ qu'on compte quand rien n'est additionné et du champ « renseigné ».
  function plan(info, labels) {
    if (!info || !info.def || !info.result || !info.flat || !info.flat.rows || !info.flat.rows.length) return null;
    const { def, result, flat } = info;
    const depth = def.rows.length;
    const hasCols = def.cols.length === 1;
    if (!depth || !result.rows.length || (hasCols && !result.cols.length)) return null;
    // Une case, un total ou le total général en erreur : Excel ne saurait pas le refaire.
    const values = [].concat(...result.cells, result.rowTotals || [], result.colTotals || [], [result.grand]);
    if (values.some(isError)) return null;

    // Les champs : les colonnes de regroupement (lignes puis colonne), puis la valeur.
    const taken = new Set();
    const dimCount = depth + (hasCols ? 1 : 0);
    const fieldNames = info.names.slice(0, dimCount).map(name => uniqueName(name, taken));
    const measureName = uniqueName(def.value ? (def.agg === 'count' ? labels.filled(info.names[dimCount]) : info.names[dimCount]) : labels.line, taken);
    const dataName = uniqueName(info.valueTitle, taken);

    // Les éléments de chaque champ, dans l'ordre du tableau.
    const fields = [];
    for (let level = 0; level < depth; level++) fields.push(itemsOf(result.rows.map(row => row.labels[level])));
    if (hasCols) fields.push(itemsOf(result.cols.map(column => column.label)));
    if (fields.some(field => !field)) return null;

    // Les données à plat : une ligne par ligne source.
    const rows = [];
    for (const line of flat.rows) {
      const cells = [];
      for (let column = 0; column < dimCount; column++) {
        const text = tidy(line.labels[column]) || '-';
        if (!fields[column].index.has(text)) return null;
        cells.push(text);
      }
      cells.push(def.agg === 'count' ? (line.filled ? 1 : null) : (typeof line.n === 'number' && Number.isFinite(line.n) ? line.n : null));
      rows.push(cells);
    }

    const shown = gridOf(info, { data: dataName }, labels, fieldNames);
    return {
      title: info.title,
      fieldNames, measureName, dataName, agg: def.agg, depth, hasCols,
      fields, source: { headers: fieldNames.concat([measureName]), rows },
      result, totals: { rows: !!result.rowTotals, cols: !!result.colTotals },
      sheet: shown,
    };
  }

  // === Les parties d'Office ===

  function measureCache(rows, at) {
    // La description du champ des nombres : les bornes, les entiers, les cases vides.
    const numbers = rows.map(row => row[at]).filter(value => typeof value === 'number');
    const blank = numbers.length < rows.length;
    if (!numbers.length) return '<sharedItems containsNonDate="0" containsString="0" containsBlank="1"/>';
    const integers = numbers.every(Number.isInteger);
    const parts = [];
    if (!blank) parts.push('containsSemiMixedTypes="0"');
    parts.push('containsString="0"');
    if (blank) parts.push('containsBlank="1"');
    parts.push('containsNumber="1"');
    if (integers) parts.push('containsInteger="1"');
    parts.push('minValue="' + Math.min(...numbers) + '"', 'maxValue="' + Math.max(...numbers) + '"');
    return '<sharedItems ' + parts.join(' ') + '/>';
  }

  // Les trois parties du tableau croisé. `place` : { sourceSheet, sourceTop (la ligne des en-têtes des données, depuis 1), pivotTop (la première ligne du tableau, depuis 1), cacheId, name, numFmtId (ou 0),
  // totalLabel, valuesCaption (le nom du champ « Valeurs » d'Excel), refreshed (date du jour en numéro de série), relationId (celui, dans la définition du cache, des enregistrements) }.
  function xml(built, place) {
    const dimCount = built.depth + (built.hasCols ? 1 : 0);
    const measureAt = dimCount;
    const lastColumn = columnLetters(built.source.headers.length - 1);
    const sourceRef = 'A' + place.sourceTop + ':' + lastColumn + (place.sourceTop + built.source.rows.length);
    const refreshed = place.refreshed || 45000;

    const cacheFields = built.source.headers.map((name, column) => {
      if (column === measureAt) return '<cacheField name="' + xmlAttr(name) + '" numFmtId="0">' + measureCache(built.source.rows, measureAt) + '</cacheField>';
      const items = built.fields[column].list;
      return '<cacheField name="' + xmlAttr(name) + '" numFmtId="0"><sharedItems count="' + items.length + '">' + items.map(item => '<s v="' + xmlAttr(item) + '"/>').join('') + '</sharedItems></cacheField>';
    });
    const cacheDefinition = XML_HEAD + '<pivotCacheDefinition xmlns="' + NS_MAIN + '" xmlns:r="' + NS_REL + '" r:id="' + place.relationId + '" refreshOnLoad="1" refreshedBy="Grist Factory" refreshedDate="' + refreshed
      + '" createdVersion="6" refreshedVersion="6" minRefreshableVersion="3" recordCount="' + built.source.rows.length + '">'
      + '<cacheSource type="worksheet"><worksheetSource ref="' + sourceRef + '" sheet="' + xmlAttr(place.sourceSheet) + '"/></cacheSource>'
      + '<cacheFields count="' + cacheFields.length + '">' + cacheFields.join('') + '</cacheFields></pivotCacheDefinition>';

    const records = built.source.rows.map(row => '<r>' + row.map((value, column) => {
      if (column === measureAt) return typeof value === 'number' ? '<n v="' + value + '"/>' : '<m/>';
      return '<x v="' + built.fields[column].index.get(value) + '"/>';
    }).join('') + '</r>').join('');
    const cacheRecords = XML_HEAD + '<pivotCacheRecords xmlns="' + NS_MAIN + '" xmlns:r="' + NS_REL + '" count="' + built.source.rows.length + '">' + records + '</pivotCacheRecords>';

    // Le tableau : les champs en lignes (axisRow), en colonnes (axisCol), la valeur (dataField), en forme tabulaire, sans sous-total par groupe.
    const pivotFields = built.source.headers.map((name, column) => {
      if (column === measureAt) return '<pivotField dataField="1" compact="0" outline="0" showAll="0"/>';
      const axis = column < built.depth ? 'axisRow' : 'axisCol';
      const items = built.fields[column].list.map((item, i) => '<item x="' + i + '"/>').join('');
      return '<pivotField axis="' + axis + '" compact="0" outline="0" showAll="0" defaultSubtotal="0"><items count="' + built.fields[column].list.length + '">' + items + '</items></pivotField>';
    });
    const rowFields = [];
    for (let level = 0; level < built.depth; level++) rowFields.push('<field x="' + level + '"/>');
    // Les lignes du tableau : un élément par rangée ; `r` : les niveaux repris de la rangée d'avant.
    const rowItems = built.result.rows.map((row) => {
      const indexes = row.labels.map((label, level) => built.fields[level].index.get(tidy(label) || '-'));
      const kept = Math.min(row.from, built.depth - 1);
      return '<i' + (kept ? ' r="' + kept + '"' : '') + '>' + indexes.slice(kept).map(i => '<x v="' + i + '"/>').join('') + '</i>';
    });
    if (built.totals.cols) rowItems.push('<i t="grand"><x/></i>');
    let colItems;
    if (built.hasCols) {
      colItems = built.result.cols.map(column => '<i><x v="' + built.fields[built.depth].index.get(tidy(column.label) || '-') + '"/></i>');
      if (built.totals.rows) colItems.push('<i t="grand"><x/></i>');
    } else {
      colItems = ['<i/>'];
    }
    const subtotal = SUBTOTAL[built.agg];
    const dataField = '<dataField name="' + xmlAttr(built.dataName) + '" fld="' + measureAt + '"' + (subtotal ? ' subtotal="' + subtotal + '"' : '')
      + ' baseField="0" baseItem="0"' + (place.numFmtId ? ' numFmtId="' + place.numFmtId + '"' : '') + '/>';
    const width = built.sheet.width;
    const firstDataRow = built.hasCols ? 2 : 1;
    const ref = 'A' + place.pivotTop + ':' + columnLetters(width - 1) + (place.pivotTop + built.sheet.height - 1);
    // Les totaux généraux : `colGrandTotals` pour la ligne de totaux du bas, `rowGrandTotals` pour la colonne de totaux de droite (l'écriture de la norme ; à vérifier dans Excel quand un seul des deux est demandé). Sans colonne
    // en colonnes il n'y a que la ligne du bas : les deux réglages disent la même chose, quel que soit celui qu'Excel lit pour elle.
    const table = XML_HEAD + '<pivotTableDefinition xmlns="' + NS_MAIN + '" name="' + xmlAttr(place.name) + '" cacheId="' + place.cacheId
      + '" applyNumberFormats="0" applyBorderFormats="0" applyFontFormats="0" applyPatternFormats="0" applyAlignmentFormats="0" applyWidthHeightFormats="1" dataCaption="'
      + xmlAttr(place.valuesCaption) + '" grandTotalCaption="' + xmlAttr(place.totalLabel) + '" updatedVersion="6" minRefreshableVersion="3" useAutoFormatting="1" itemPrintTitles="1" createdVersion="6" indent="0"'
      + ' compact="0" compactData="0" outline="0" outlineData="0" multipleFieldFilters="0" rowGrandTotals="' + ((built.hasCols ? built.totals.rows : built.totals.cols) ? 1 : 0) + '" colGrandTotals="' + (built.totals.cols ? 1 : 0) + '">'
      + '<location ref="' + ref + '" firstHeaderRow="1" firstDataRow="' + firstDataRow + '" firstDataCol="' + built.depth + '"/>'
      + '<pivotFields count="' + pivotFields.length + '">' + pivotFields.join('') + '</pivotFields>'
      + '<rowFields count="' + rowFields.length + '">' + rowFields.join('') + '</rowFields>'
      + '<rowItems count="' + rowItems.length + '">' + rowItems.join('') + '</rowItems>'
      + (built.hasCols ? '<colFields count="1"><field x="' + built.depth + '"/></colFields>' : '')
      + '<colItems count="' + colItems.length + '">' + colItems.join('') + '</colItems>'
      + '<dataFields count="1">' + dataField + '</dataFields>'
      + '<pivotTableStyleInfo name="PivotStyleLight16" showRowHeaders="1" showColHeaders="1" showRowStripes="0" showColStripes="0" showLastColumn="1"/></pivotTableDefinition>';
    return { cacheDefinition, cacheRecords, table, sourceRef, ref };
  }

  return { plan, xml, columnLetters, tidy };
})();
