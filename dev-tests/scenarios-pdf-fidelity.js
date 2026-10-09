// Suite "pdfFidelity" - vérifie des propriétés pdfmake précises (pas
// seulement "ça exporte sans planter") : gras/italique/souligné/barré,
// taille de police, alignement, largeurs de colonnes de tableau/2-colonnes,
// position d'une image en calque.
(function () {
  const cases = [];

  cases.push({
    id: 'pdffid_bold_italic_underline_strike',
    description: 'Un run gras+italique+souligné+barré a bien bold/italics/decoration dans pdfmake',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.typeText('Texte combiné');
      await h.selectAllInEditor();
      await h.clickButton('v2-btn-bold');
      await h.clickButton('v2-btn-italic');
      await h.clickButton('v2-btn-underline');
      await h.clickButton('v2-btn-strike');
      const html = Editor.getHTML();
      const result = await h.exportPdfContent(html, null);
      const blocks = h.findTextBlocks(result.content, b => h.blockPlainText(b).includes('Texte combiné'));
      if (!blocks.length) return { pass: false, notes: 'aucun bloc trouvé - html=' + html };
      const run = Array.isArray(blocks[0].text) ? blocks[0].text.find(r => (r.text || '').includes('Texte combiné')) : blocks[0];
      const pass = run && run.bold === true && run.italics === true && /underline/.test(run.decoration || '') && /lineThrough/.test(run.decoration || '');
      return { pass, notes: JSON.stringify(run) };
    },
  });

  ['center', 'right', 'justify'].forEach(align => {
    cases.push({
      id: 'pdffid_alignment_' + align,
      description: 'Alignement "' + align + '" reflété par la propriété pdfmake "alignment"',
      run: async (h) => {
        await h.resetEditor();
        await h.focusAtEnd();
        await h.typeText('Paragraphe ' + align);
        await h.selectAllInEditor();
        await h.clickButton('v2-btn-align-' + align);
        const html = Editor.getHTML();
        const result = await h.exportPdfContent(html, null);
        const blocks = h.findTextBlocks(result.content, b => h.blockPlainText(b).includes('Paragraphe ' + align));
        return { pass: blocks.length > 0 && blocks[0].alignment === align, notes: JSON.stringify(blocks[0]) };
      },
    });
  });

  cases.push({
    id: 'pdffid_font_size',
    description: 'Une taille de police personnalisée (14pt) est convertie fidèlement en points pdfmake',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.typeText('Texte 14pt');
      await h.selectAllInEditor();
      // 3 clics + sur le stepper (pas de moyen direct de saisir une valeur -
      // 10.5 -> 11 -> 11.5 -> 12, donc on vise plutôt une valeur ATTEIGNABLE
      // par clics répétés et on vérifie la VALEUR AFFICHÉE, pas un chiffre
      // en dur, pour rester robuste au pas exact du stepper).
      for (let i = 0; i < 4; i++) await h.clickButton('v2-size-plus');
      const displayedSize = parseFloat(document.getElementById('v2-size-chip-val').textContent);
      const html = Editor.getHTML();
      const result = await h.exportPdfContent(html, null);
      const blocks = h.findTextBlocks(result.content, b => h.blockPlainText(b).includes('Texte 14pt'));
      const run = blocks.length && Array.isArray(blocks[0].text) ? blocks[0].text[0] : blocks[0];
      return { pass: !!run && Math.abs(run.fontSize - displayedSize) < 0.5, notes: JSON.stringify({ displayedSize, run }) };
    },
  });

  cases.push({
    id: 'pdffid_sibling_headings_no_cumulative_indent',
    description: 'Plusieurs H1 de même niveau ont tous une marge gauche nulle dans le PDF (pas d\'indentation cumulative)',
    run: async (h) => {
      await h.resetEditor();
      Editor.setHTML('<h1>Titre un</h1><p>a</p><h1>Titre deux</h1><p>b</p><h1>Titre trois</h1>');
      const numSelect = document.getElementById('v2-heading-numbering-select');
      numSelect.value = 'roman';
      numSelect.dispatchEvent(new Event('change', { bubbles: true }));
      await h.sleep(40);
      const html = Editor.getHTML();
      const result = await h.exportPdfContent(html, null);
      const headings = result.content.filter(b => b && b._isHeading);
      const pass = headings.length === 3 && headings.every(b => b.margin[0] === 0);
      return { pass, notes: JSON.stringify(headings.map(b => ({ text: b._headingText, margin0: b.margin[0] }))) };
    },
  });

  cases.push({
    id: 'pdffid_header_footer_fixed_height_regardless_of_content_length',
    description: 'La marge de page réservée pour l\'en-tête est identique pour un texte court et un texte long (hauteur fixe, pas mesurée dynamiquement)',
    run: async (h) => {
      await h.resetEditor();
      const html = Editor.getHTML();
      const shortHf = { enabled: true, differentFirstPage: false, header: { default: '<p>Court</p>', first: '' }, footer: { default: '', first: '' } };
      const longHf = { enabled: true, differentFirstPage: false, header: { default: '<p>Ligne un</p><p>Ligne deux</p><p>Ligne trois</p><p>Ligne quatre</p>', first: '' }, footer: { default: '', first: '' } };
      const shortResult = await h.exportPdfContent(html, shortHf);
      const longResult = await h.exportPdfContent(html, longHf);
      const shortTop = shortResult.docDefinition.pageMargins[1];
      const longTop = longResult.docDefinition.pageMargins[1];
      return { pass: shortTop === longTop && shortTop > 28, notes: JSON.stringify({ shortTop, longTop }) };
    },
  });

  cases.push({
    id: 'pdffid_table_column_widths_proportional',
    description: 'Les largeurs de colonnes du tableau à l\'écran se retrouvent proportionnellement dans le PDF',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.clickButton('v2-btn-table');
      await h.sleep(60);
      const html = Editor.getHTML();
      const result = await h.exportPdfContent(html, null);
      const tableBlocks = h.flattenPdfContent(result.content).filter(b => b && b.table && b.table.widths);
      if (!tableBlocks.length) return { pass: false, notes: 'aucun bloc table trouvé' };
      // Après mise en page, pdfmake mute chaque entrée de `widths` en objet
      // descripteur ({width, _minWidth, _maxWidth, _calcWidth, ...}) plutôt
      // que de garder la valeur brute ('*'/nombre) fournie en entrée - lire
      // `.width` (ou la valeur elle-même si jamais encore brute) plutôt que
      // supposer un tableau de nombres/'*' bruts.
      const widths = tableBlocks[0].table.widths;
      const resolved = widths.map(w => (w && typeof w === 'object' ? w.width : w));
      const allNumericOrStar = resolved.every(w => w === '*' || typeof w === 'number' || (typeof w === 'string' && /^[\d.]+$/.test(w)));
      const equalColumns = Math.abs(resolved[0] - resolved[1]) < 1;
      return { pass: resolved.length === 2 && allNumericOrStar && equalColumns, notes: JSON.stringify(resolved) };
    },
  });

  // Le tableau d'Antoine (« Budget validé », 05/10) : sept colonnes de 123, 221, 81, 69, 83, 70 et 73 px (720 px, toute la largeur utile de la page), des
  // en-têtes gras et centrés, des montants alignés à droite. Son PDF était plus étroit que l'écran (l'export retranchait une espace et demie de chaque
  // colonne : ~27 pt sur la page, qui s'arrêtait avant la marge de droite) et deux en-têtes (« Montant 2029 (€) », « Total Projet (€) ») se coupaient sur
  // trois lignes au lieu de deux.
  const BUDGET_COLUMN_PX = [123, 221, 81, 69, 83, 70, 73];
  const BUDGET_ROWS = [
    ['Catégorie de ressources', 'Type de ressources', 'Montant 2026 (€)', 'Montant 2027 (€)', 'Montant 2028 (€)', 'Montant 2029 (€)', 'Total Projet (€)'],
    ['Fonctionnement (Masse 10)', 'Dépenses de fonctionnement', '10 000', '5 000', '', '', '15 000'],
    ['Total', '', '10 000', '5 000', '', '', '15 000'],
  ];
  const budgetTableHtml = () => {
    const cell = (text, col, head) => '<td colspan="1" rowspan="1" colwidth="' + BUDGET_COLUMN_PX[col] + '"' + (head ? ' style="background-color: rgb(200, 230, 255);"' : '')
      + '><p style="text-align: ' + (head ? 'center' : (col >= 2 ? 'right' : 'left')) + ';">' + (head ? '<strong>' + text + '</strong>' : text) + '</p></td>';
    return '<table style="width: 720px;"><colgroup>' + BUDGET_COLUMN_PX.map(w => '<col style="width: ' + w + 'px;">').join('') + '</colgroup><tbody>'
      + BUDGET_ROWS.map((row, r) => '<tr>' + row.map((text, col) => cell(text, col, r === 0)).join('') + '</tr>').join('') + '</tbody></table>';
  };

  // Ce que le PDF peint d'un tableau (pdf.js, les octets du fichier) : les x des traits verticaux, les y des traits horizontaux, le bord droit de la zone
  // utile de la page, et le texte de chaque case rangé par ligne - sans espaces, qu'un PDF ne garde pas.
  async function paintedTable(h, html) {
    const result = await h.exportPdfContent(html, null);
    const painted = (await h.extractPdfLines(result.base64)).pages[0];
    const distinct = values => values.sort((a, b) => a - b).filter((v, i, all) => i === 0 || v - all[i - 1] > 1);
    const xs = distinct(painted.lines.filter(l => Math.abs(l.x1 - l.x2) < 0.01).map(l => l.x1));
    const ys = distinct(painted.lines.filter(l => Math.abs(l.y1 - l.y2) < 0.01).map(l => l.y1));
    const ground = (await h.extractPdfGroundTruth(result.base64)).pages[0];
    const cells = ys.slice(0, -1).map((top, r) => xs.slice(0, -1).map((left, c) => {
      const byBaseline = {};
      ground.textItems.filter(it => it.x >= left - 0.5 && it.x < xs[c + 1] && it.y > top && it.y <= ys[r + 1] + 2)
        .forEach(it => { (byBaseline[Math.round(it.y)] = byBaseline[Math.round(it.y)] || []).push(it); });
      return Object.keys(byBaseline).map(Number).sort((a, b) => a - b).map(y => byBaseline[y].sort((a, b) => a.x - b.x).map(it => it.str).join('').replace(/\s+/g, ''));
    }));
    return { xs, ys, cells, contentRightPt: ground.width - result.docDefinition.pageMargins[2], contentLeftPt: result.docDefinition.pageMargins[0] };
  }

  // Ce que le navigateur fait du même HTML : l'hôte de mesure de l'export (mêmes règles que l'éditeur, css/editor-v2.css), à la largeur utile d'une page
  // A4 de marges 28 pt. Le texte de chaque case rangé par ligne, sans espaces.
  function browserCellLines(html) {
    const host = document.createElement('div');
    const detach = ExportCommon.attachMeasureHost(host, 719.04, 'pdf-measure-host');
    host.innerHTML = html;
    const rows = Array.from(host.querySelectorAll('tr')).map(tr => Array.from(tr.children).map(td => {
      const lines = [];
      let lastTop = null;
      const walker = document.createTreeWalker(td, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        for (const word of node.nodeValue.matchAll(/\S+/g)) {
          const range = document.createRange();
          range.setStart(node, word.index);
          range.setEnd(node, word.index + word[0].length);
          const top = range.getBoundingClientRect().top;
          if (lastTop === null || Math.abs(top - lastTop) > 4) { lines.push(''); lastTop = top; }
          lines[lines.length - 1] += word[0];
        }
      }
      return lines;
    }));
    detach();
    return rows;
  }

  cases.push({
    id: 'pdffid_table_fills_the_content_width_and_keeps_its_columns',
    description: 'Un tableau de la largeur de la page (le budget d\'Antoine, sept colonnes) va jusqu\'à la marge de droite du PDF, et chaque colonne a la largeur qu\'elle a à l\'écran',
    run: async (h) => {
      await h.resetEditor();
      const table = await paintedTable(h, budgetTableHtml());
      if (table.xs.length !== BUDGET_COLUMN_PX.length + 1) return { pass: false, notes: 'traits verticaux peints : ' + JSON.stringify(table.xs) };
      // Une colonne mesure sa largeur à l'écran moins un quart de point (le trait de pdfmake est plus fin que la bordure du navigateur).
      const columnPt = table.xs.slice(1).map((x, i) => x - table.xs[i]);
      const columnGapsPt = columnPt.map((w, i) => Math.round((w - BUDGET_COLUMN_PX[i] * 0.75) * 100) / 100);
      const checks = {
        startsAtTheMargin: Math.abs(table.xs[0] - table.contentLeftPt) < 1.5,
        reachesTheRightMargin: Math.abs(table.xs[table.xs.length - 1] - table.contentRightPt) < 2.5,
        columnsKeepTheirWidths: columnGapsPt.every(gap => Math.abs(gap) < 1.5),
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, xs: table.xs, contentRightPt: table.contentRightPt, columnGapsPt }) };
    },
  });

  cases.push({
    id: 'pdffid_table_default_reaches_the_right_margin',
    description: 'Le tableau que le bouton insère (deux colonnes, toute la largeur) va jusqu\'à la marge de droite du PDF : plus aucune espace retranchée à chaque colonne',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.clickButton('v2-btn-table');
      await h.sleep(60);
      const table = await paintedTable(h, Editor.getHTML());
      const rightEdge = table.xs[table.xs.length - 1];
      return { pass: table.xs.length === 3 && Math.abs(rightEdge - table.contentRightPt) < 2.5, notes: JSON.stringify({ xs: table.xs, contentRightPt: table.contentRightPt }) };
    },
  });

  cases.push({
    id: 'pdffid_table_cells_wrap_like_the_browser',
    description: 'Chaque case du budget d\'Antoine se coupe dans le PDF comme dans le navigateur : « Montant 2029 (€) » et « Total Projet (€) » restent sur deux lignes',
    run: async (h) => {
      await h.resetEditor();
      const html = budgetTableHtml();
      const table = await paintedTable(h, html);
      const reference = browserCellLines(html);
      const differences = [];
      reference.forEach((row, r) => row.forEach((lines, c) => {
        const painted = (table.cells[r] && table.cells[r][c]) || [];
        if (JSON.stringify(lines) !== JSON.stringify(painted)) differences.push({ row: r, column: c, navigateur: lines, pdf: painted });
      }));
      return { pass: differences.length === 0 && table.cells.length === reference.length, notes: JSON.stringify({ differences, rows: table.cells.length }) };
    },
  });

  // L'ancien retrait (une espace et demie de chaque colonne) coupait autrement que le navigateur sur ~12 % des largeurs d'une case : ces largeurs-là, relevées
  // sur deux textes de plusieurs lignes (le second, gras, italique et sur une bordure d'en-tête étroite), plus quelques-unes où il coupait bien.
  cases.push({
    id: 'pdffid_table_cell_wraps_follow_the_browser_across_widths',
    description: 'Un texte de plusieurs lignes dans une case de largeur variable se coupe dans le PDF aux mêmes endroits que dans le navigateur (au plus un écart sur treize largeurs)',
    run: async (h) => {
      await h.resetEditor();
      const samples = [
        ['Achat de petit matériel, de livres et de logiciels pour le laboratoire de chimie du site', [128, 148, 168, 172, 176, 180, 200]],
        ['<strong>Total Projet (€)</strong> hors taxes et hors <em>frais</em> de gestion', [96, 116, 124, 140, 160, 188]],
      ];
      const differences = [];
      let tested = 0;
      for (const [text, widths] of samples) {
        for (const width of widths) {
          const html = '<table style="width: ' + (width + 13) + 'px;"><colgroup><col style="width: ' + (width + 13) + 'px;"></colgroup><tbody><tr><td colspan="1" rowspan="1" colwidth="' + (width + 13) + '"><p>' + text + '</p></td></tr></tbody></table>';
          const table = await paintedTable(h, html);
          const lines = browserCellLines(html)[0][0];
          tested += 1;
          if (JSON.stringify(lines) !== JSON.stringify(table.cells[0] && table.cells[0][0])) differences.push({ width, navigateur: lines, pdf: table.cells[0] && table.cells[0][0] });
        }
      }
      return { pass: differences.length <= 1, notes: JSON.stringify({ tested, differences }) };
    },
  });

  // Un mot plus large que sa case (une adresse, un identifiant) : l'éditeur le coupe dans la case (contenteditable : `overflow-wrap: break-word`) et le PDF aussi
  // (pdfmake) ; seuls l'hôte de mesure de l'export et la Lecture (non éditables, `overflow-wrap: normal`) le laissaient sur une ligne. Garde-fou : le PDF a toujours coupé
  // (la Lecture : readmode_table_long_word_breaks_in_its_cell_like_the_editor). Le PDF ne coupe pas toujours à la même lettre : pdfmake 0.2.7 (`buildNextLine`) compte les lettres
  // d'une ligne sur la largeur moyenne d'une lettre du mot, le navigateur sur la largeur de chacune ; relevé le 05/10 sur 243 largeurs de case (50 à 130 px, trois textes), la coupe
  // diffère à deux largeurs sur trois et le nombre de lignes à une sur huit : ce garde-fou ne compare que le cas de 60 px, il ne fixe aucune position de coupe.
  cases.push({
    id: 'pdffid_table_long_word_breaks_in_its_cell_like_the_editor',
    description: 'Un mot plus large que sa case de tableau se coupe dans la case du PDF comme dans l\'éditeur : même nombre de lignes, tout le mot, rien dans la case voisine',
    run: async (h) => {
      await h.resetEditor();
      const word = 'Anticonstitutionnellement';
      const html = '<table style="width: 260px;"><colgroup><col style="width: 60px;"><col style="width: 200px;"></colgroup><tbody><tr><td colspan="1" rowspan="1" colwidth="60"><p>' + word
        + '</p></td><td colspan="1" rowspan="1" colwidth="200"><p>court</p></td></tr></tbody></table>';
      Editor.setHTML(html);
      await h.sleep(200);
      const range = document.createRange();
      range.selectNodeContents(h.tiptap().querySelector('td p'));
      const tops = [];
      Array.from(range.getClientRects()).filter(r => r.width > 0).forEach(r => { if (!tops.some(t => Math.abs(t - r.top) < 2)) tops.push(r.top); });
      const table = await paintedTable(h, html);
      const lines = (table.cells[0] && table.cells[0][0]) || [];
      const neighbour = (table.cells[0] && table.cells[0][1]) || [];
      const pass = tops.length >= 2 && lines.length === tops.length && lines.join('') === word && neighbour.join('|') === 'court';
      return { pass, notes: JSON.stringify({ lignesEditeur: tops.length, lignesPdf: lines, caseVoisine: neighbour }) };
    },
  });

  cases.push({
    id: 'pdffid_twocolumns_width_ratio',
    description: 'Une zone 2-colonnes redimensionnée (63/37) donne des largeurs PDF dans le même ratio (±5%)',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.clickButton('v2-btn-two-columns');
      await h.sleep(60);
      const cols = h.tiptap().querySelectorAll('.two-columns-zone > *');
      await h.focusInElement(cols[0].querySelector('p') || cols[0]);
      await h.typeText('Gauche');
      await h.focusInElement(cols[1].querySelector('p') || cols[1]);
      await h.typeText('Droite');
      const grip = h.tiptap().querySelector('.two-columns-resize-grip');
      const rect = grip.getBoundingClientRect();
      await h.dragFromTo(grip, [rect.left, rect.top], [rect.left + 100, rect.top]);
      const html = Editor.getHTML();
      const layoutMatch = /--layout-left:\s*([\d.]+)%/.exec(html);
      const targetRatio = layoutMatch ? parseFloat(layoutMatch[1]) / 100 : 0.5;
      const result = await h.exportPdfContent(html, null);
      const columnsBlocks = h.flattenPdfContent(result.content).filter(b => b && Array.isArray(b.columns) && b.columns.length === 2);
      if (!columnsBlocks.length) return { pass: false, notes: 'aucun bloc columns trouvé - html=' + html };
      const widths = columnsBlocks[0].columns.map(c => c.width);
      const bothNumeric = widths.every(w => typeof w === 'number');
      if (!bothNumeric) return { pass: false, notes: 'largeurs non numériques : ' + JSON.stringify(widths) + ' (targetRatio=' + targetRatio + ')' };
      const actualRatio = widths[0] / (widths[0] + widths[1]);
      return { pass: Math.abs(actualRatio - targetRatio) < 0.06, notes: JSON.stringify({ targetRatio, actualRatio, widths }) };
    },
  });

  cases.push({
    id: 'pdffid_twocolumns_text_top_matches_editor_grid',
    // Bug réel (signalé par l'utilisateur, confirmé sur du texte SEUL - pas une image) : twoColumnsFrom mesurait le chrome (padding+bordure) propre à
    // CHAQUE colonne en largeur (colOwnInsetLeft/Right, leftPt/rightPt) mais jamais en hauteur - la marge intérieure du stack de colonne restait codée en
    // dur à [.., 0, .., 0] (haut/bas toujours 0), alors que .two-columns-column a bien son propre padding+bordure sur TOUS les côtés (css/style.css). Tout
    // le contenu d'une colonne (texte ET image en calque, décalage identique mesuré sur les deux) atterrissait donc plus haut que sa vraie position -
    // trouvé en comparant, pour un simple bloc de texte, sa position réelle dans l'éditeur (grille page, cf. HeaderFooterPreview.computePageGridPosition)
    // à sa position résolue dans le PDF. Corrigé avec topPt/bottomPt (symétriques à leftPt/rightPt) appliqués au stack de colonne.
    // Second correctif, même famille (signalé à nouveau par l'utilisateur sur le même scénario réel, PDF "312") : un résidu de ~4.5pt subsistait après le
    // correctif ci-dessus, d'abord attribué à tort à un écart de rendu police/interligne pdfmake-vs-navigateur (cf. mémoire table-cell) - en réalité
    // `.two-columns-zone` a AUSSI sa propre marge CSS (`margin: 6px 0`, css/editor-v2.css), distincte de son padding/bordure déjà mesurés, et jamais prise
    // en compte dans `twoColumnsFrom` (qui codait en dur 12.75/3.75 = padding+bordure seuls). Mesurée dynamiquement maintenant - la tolérance ci-dessous
    // est resserrée en conséquence (ne PAS la relâcher à nouveau sans revérifier que ce n'est pas cette même régression qui revient).
    description: 'La position Y d\'un texte dans une colonne 2-colonnes correspond exactement à sa grille page réelle dans l\'éditeur',
    run: async (h) => {
      await h.resetEditor();
      document.getElementById('editor-container').classList.add('a4-preview');
      await h.sleep(50);
      await h.focusAtEnd();
      document.getElementById('v2-btn-two-columns').click();
      await h.sleep(80);
      const ed = EditorCore.getEditor();
      const colP = h.tiptap().querySelectorAll('.two-columns-zone > .two-columns-column')[1].querySelector('p');
      ed.commands.setTextSelection(ed.view.posAtDOM(colP, 0));
      ed.commands.focus();
      await h.sleep(50);
      await h.typeText('XXXXXXXXXX texte de colonne pour verifier le chrome haut/bas');
      await h.sleep(50);
      const textP = h.tiptap().querySelectorAll('.two-columns-column')[1].querySelector('p');
      const grid = HeaderFooterPreview.computePageGridPosition(textP);
      const PAGE_MARGIN_PT = 28;
      const expected = { x: PAGE_MARGIN_PT + grid.pageLeftPt, y: PAGE_MARGIN_PT + grid.pageTopPt };
      const html = Editor.getHTML();
      const result = await h.exportPdfContent(html, null);
      const textBlock = h.findTextBlocks(result.content, b => h.blockPlainText(b).includes('XXXXXXXXXX'))[0];
      if (!textBlock || !textBlock.positions || !textBlock.positions.length) return { pass: false, notes: 'texte introuvable dans le PDF' };
      const actual = textBlock.positions[0];
      const deltaY = actual.top - expected.y;
      const pass = Math.abs(deltaY) < 1.5;
      return { pass, notes: JSON.stringify({ expected, actual: { left: actual.left, top: actual.top }, deltaY }) };
    },
  });

  cases.push({
    id: 'pdffid_layered_image_absolute_position',
    // Depuis le passage à la grille page (data-page-index/left/top-pt, capturée directement dans l'éditeur - cf. computePageGridPosition), la position
    // PDF n'est plus dérivée de left/top CSS mais lue telle quelle sur ces attributs : nécessite Aperçu A4 (sinon aucune grille n'est capturée, repli sur
    // l'ancien ancrage - viewport-dépendant, cf. mémoire project_v2_twocolumns_offsetparent_and_multiline_anchor pour l'historique de flakiness de ce test
    // précis avant ce correctif).
    description: 'Une image en calque "devant" a une absolutePosition PDF qui correspond exactement à sa grille page capturée dans l\'éditeur',
    run: async (h) => {
      await h.resetEditor();
      document.getElementById('editor-container').classList.add('a4-preview');
      await h.sleep(50);
      await h.focusAtEnd();
      await h.typeText('Texte porteur pour ancrage');
      const dialogs = h.stubDialogs({ prompt: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=' });
      await h.clickButton('v2-btn-image');
      dialogs.restore();
      await h.sleep(80);
      const img = h.tiptap().querySelector('img.editor-image');
      await h.selectAtomNode(img);
      const frontBtn = document.querySelector('.v2-floating-toolbar button[data-action="layer-front"]');
      frontBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await h.sleep(60);
      const html = Editor.getHTML();
      const pageIndexMatch = /data-page-index="(-?\d+)"/.exec(html);
      const pageLeftMatch = /data-page-left-pt="(-?[\d.]+)"/.exec(html);
      const pageTopMatch = /data-page-top-pt="(-?[\d.]+)"/.exec(html);
      if (!pageIndexMatch || !pageLeftMatch || !pageTopMatch) return { pass: false, notes: 'grille page absente - html=' + html };
      const pageLeftPt = parseFloat(pageLeftMatch[1]);
      const pageTopPt = parseFloat(pageTopMatch[1]);
      const PAGE_MARGIN_PT = 28.35;
      const result = await h.exportPdfContent(html, null);
      const images = h.findImages(result.content);
      if (!images.length) return { pass: false, notes: 'aucune image trouvée dans le PDF' };
      const abs = images[0].absolutePosition;
      if (!abs) return { pass: false, notes: 'absolutePosition absente : ' + JSON.stringify(images[0]) };
      const expectedLeftPt = PAGE_MARGIN_PT + pageLeftPt;
      const expectedTopPt = PAGE_MARGIN_PT + pageTopPt;
      const pass = Math.abs(abs.x - expectedLeftPt) < 1 && Math.abs(abs.y - expectedTopPt) < 1;
      return { pass, notes: JSON.stringify({ pageLeftPt, pageTopPt, expectedLeftPt, expectedTopPt, abs }) };
    },
  });

  cases.push({
    id: 'pdffid_layered_images_on_page_two_stay_on_page_two',
    // Trouvé en corrigeant les images en macro-modèle (01/10), mais il touche aussi un modèle seul de plusieurs pages. Deux défauts de js/pdf-export.js
    // (resolveNativePdfContent) : (1) l'index d'un bloc ancre (`content[idx]`) glissait d'un cran à chaque image déjà insérée avant lui, si bien qu'une
    // image de la page 2 posée après une image de la page 1 s'accrochait au mauvais bloc ; (2) une image « derrière » de la page 2 était insérée avant le
    // premier bloc de cette page, que pdfmake peint à la fin de la page PRÉCÉDENTE (le saut de page n'a lieu qu'au bloc suivant) : l'image sortait sur la
    // page 1, à l'ordonnée prévue pour la page 2.
    description: 'Un modèle de deux pages garde une image en calque (derrière ou devant) sur la page 2 quand une autre image est déjà sur la page 1, chacune à sa position de page',
    run: async (h) => {
      await h.resetEditor();
      h.setA4Preview(true);
      const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
      const logo = (layer, pageIndex, topPx, pageTopPt) => '<img class="editor-image" src="' + PIXEL + '" alt="" style="width: 71px; position: absolute; left: 674px; top: ' + topPx + 'px;" data-layer="' + layer
        + '" data-wrap="inline" data-page-index="' + pageIndex + '" data-page-left-pt="477.5" data-page-top-pt="' + pageTopPt + '">';
      const filler = Array.from({ length: 80 }, (_, i) => '<p>Ligne ' + i + '</p>').join('');
      const PAGE_MARGIN_PT = 28.35;
      const near = (im, y) => Math.abs(im.y - y) < 1.5;
      const seen = {};
      let pass = true;
      for (const layerOnPageTwo of ['behind', 'front']) {
        const html = '<p>DEBUT' + logo('behind', 0, 134, 100) + logo(layerOnPageTwo, 1, 1250, 220) + '</p>' + filler;
        const pdf = await h.exportPdfContent(html, null);
        const truth = await h.extractPdfGroundTruth(pdf.base64);
        const onPage = (n, y) => truth.pages[n - 1] ? truth.pages[n - 1].images.filter(im => near(im, PAGE_MARGIN_PT + y)).length : 0;
        const result = { pages: truth.pages.length, page1: { at100: onPage(1, 100), at220: onPage(1, 220) }, page2: { at100: onPage(2, 100), at220: onPage(2, 220) }, total: truth.pages.reduce((n, p) => n + p.images.length, 0) };
        seen[layerOnPageTwo] = result;
        if (!(result.pages >= 2 && result.page1.at100 === 1 && result.page1.at220 === 0 && result.page2.at220 === 1 && result.page2.at100 === 0 && result.total === 2)) pass = false;
      }
      return { pass, notes: JSON.stringify(seen) };
    },
  });

  cases.push({
    id: 'pdffid_layered_image_near_page_break_stays_within_page',
    // Bug réel : une image en calque loin de tout texte proche (ex. glissée
    // en bas de page) peut voir le bracketing par proximité de pixels
    // (resolvePendingImageAnchors, mesuré dans l'aperçu continu hors-écran,
    // donc AVANT pagination) retenir par erreur un bloc qui, une fois
    // paginé, tombe sur la page SUIVANTE (ici "Après le saut", poussée par
    // le saut de page forcé). L'extrapolation depuis cette ancre projetait
    // alors l'image très au-delà du bas de la page réelle - invisible.
    description: 'Une image en calque ancrée près d\'un saut de page reste dans les limites verticales de la page (pas projetée hors-page, invisible)',
    run: async (h) => {
      await h.resetEditor();
      const html = '<p>Ancre avant le saut</p>'
        + '<img class="editor-image" draggable="false" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" alt="" data-layer="behind" data-wrap="inline" style="width:60px;position:absolute;left:20px;top:2500px;opacity:0.5">'
        + '<div class="page-break-marker">Saut de page</div>'
        + '<h2>Après le saut</h2><p>Texte après le saut</p>';
      const result = await h.exportPdfContent(html, null);
      const images = h.findImages(result.content);
      if (!images.length) return { pass: false, notes: 'image absente du PDF (contenu perdu) : ' + JSON.stringify(result.content) };
      const abs = images[0].absolutePosition;
      if (!abs) return { pass: false, notes: 'absolutePosition absente : ' + JSON.stringify(images[0]) };
      const A4_HEIGHT_PT = 841.89, PAGE_MARGIN_PT = 28;
      const pass = abs.y >= PAGE_MARGIN_PT - 1 && abs.y <= A4_HEIGHT_PT - PAGE_MARGIN_PT;
      return { pass, notes: 'abs=' + JSON.stringify(abs) };
    },
  });

  cases.push({
    id: 'pdffid_layered_image_alone_in_column_not_stuck_at_page_top',
    // Bug réel (signalé par l'utilisateur) : une image en calque SEULE dans
    // une colonne 2-colonnes (aucun autre bloc mesurable dans la même
    // colonne pour servir d'ancre au-dessus/en-dessous/conteneur) atterrissait
    // collée au haut de la PAGE (~28pt, la marge) au lieu d'être sur sa
    // colonne, même quand celle-ci est poussée loin dans la page. Cause :
    // twoColumnsFrom résout chaque colonne via un rendu isolé détaché (son
    // propre référentiel de coordonnées) puis recale imgTopPx sur la
    // colonne réelle - mais sans AUCUNE ancre locale trouvée, le filet de
    // sécurité générique de resolveImageAbsolutePosition traitait ce
    // imgTopPx (déjà local à la colonne) comme une distance depuis le haut
    // de PAGE. Fixé en ancrant ce cas de repli sur le bloc de la zone
    // 2-colonnes elle-même (un vrai bloc du flux, avec une position de page
    // réelle) - a aussi révélé et corrigé deux bugs latents : la relocation
    // de l'image pouvait la perdre silencieusement si son ancre vit dans un
    // autre tableau que le sien, et .positions[0] d'un bloc composite
    // `columns:[...]` est une entrée de remesure interne à pdfmake
    // ({top:0}), pas la position réelle (toujours prendre la dernière).
    description: 'Une image en calque seule dans une colonne 2-colonnes (sans texte voisin dans la même colonne) atterrit sur sa colonne, pas collée au haut de page',
    run: async (h) => {
      await h.resetEditor();
      const filler = Array.from({ length: 15 }, (_, i) => '<p>Ligne de remplissage numero ' + i + ' pour pousser le contenu loin dans la page.</p>').join('');
      const html = filler + '<div class="two-columns-zone" style="--layout-left: 50%;">'
        + '<div class="two-columns-column"><p><img class="editor-image" draggable="false" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" alt="" data-layer="front" data-wrap="inline" style="width:60px;position:absolute;left:53px;top:383px;z-index:5"></p></div>'
        + '<div class="two-columns-column"><p></p></div>'
        + '</div><p></p>';
      const result = await h.exportPdfContent(html, null);
      const images = h.findImages(result.content);
      if (!images.length) return { pass: false, notes: 'image absente du PDF (perdue pendant la relocation ?) : ' + JSON.stringify(result.content) };
      const abs = images[0].absolutePosition;
      if (!abs) return { pass: false, notes: 'absolutePosition absente : ' + JSON.stringify(images[0]) };
      // "Collé en haut" (bug) donnait ~28-50pt ; la colonne réelle (15 paragraphes de remplissage avant) est bien plus bas sur la page.
      const pass = abs.y > 150;
      return { pass, notes: 'abs=' + JSON.stringify(abs) };
    },
  });

  cases.push({
    id: 'pdffid_layered_image_alone_in_right_column_not_stuck_at_page_top',
    // Même bug que pdffid_layered_image_alone_in_column_not_stuck_at_page_top,
    // mais pour la colonne de DROITE (colIdx=1) : découvert lors de l'audit de
    // couverture qui a suivi le premier correctif - la correction n'était pas
    // symétrique (ordre non déterministe des entrées `positions` de pdfmake
    // pour le bloc composite `columns:[...]`, cf. lastPosition() dans
    // resolveNativePdfContent).
    description: 'Une image en calque seule dans la colonne de DROITE (sans texte voisin) atterrit sur sa colonne, pas collée au haut de page',
    run: async (h) => {
      await h.resetEditor();
      const filler = Array.from({ length: 15 }, (_, i) => '<p>Ligne de remplissage numero ' + i + ' pour pousser le contenu loin dans la page.</p>').join('');
      const html = filler + '<div class="two-columns-zone" style="--layout-left: 50%;">'
        + '<div class="two-columns-column"><p></p></div>'
        + '<div class="two-columns-column"><p><img class="editor-image" draggable="false" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" alt="" data-layer="front" data-wrap="inline" style="width:60px;position:absolute;left:53px;top:383px;z-index:5"></p></div>'
        + '</div><p></p>';
      const result = await h.exportPdfContent(html, null);
      const images = h.findImages(result.content);
      if (!images.length) return { pass: false, notes: 'image absente du PDF : ' + JSON.stringify(result.content) };
      const abs = images[0].absolutePosition;
      if (!abs) return { pass: false, notes: 'absolutePosition absente : ' + JSON.stringify(images[0]) };
      const pass = abs.y > 150;
      return { pass, notes: 'abs=' + JSON.stringify(abs) };
    },
  });

  cases.push({
    id: 'pdffid_layered_image_above_anchor_in_column_not_stuck_at_page_top',
    // Bug réel (signalé par l'utilisateur, avec capture PDF) : une image en calque SEULE dans son propre paragraphe, précédée de texte réel dans la MÊME
    // colonne (partage le même paragraphe source, ancre "container"), atterrissait quand même collée en haut de page - deux causes cumulées trouvées par
    // mesure directe d'offsetParent : (1) twoColumnsFrom comparait l'image (positionnée relativement à .two-columns-zone, son vrai offsetParent) aux ancres
    // locales (mesurées relativement au DÉBUT DE LA COLONNE dans le clone isolé) sans convertir vers un référentiel commun ; (2) le texte du paragraphe hôte
    // enveloppe sur plusieurs lignes dans une colonne étroite, et la position PDF résolue de l'ancre prenait sa DERNIÈRE ligne (lastPosition) au lieu de sa
    // 1ère - alors que containerTopPx (côté éditeur) mesure toujours le HAUT du bloc, doublant une partie de la hauteur du paragraphe dans le delta.
    // Nécessite "Aperçu format A4" actif pour un ancrage pixel-cohérent avec la largeur cible du PDF (cf. mémoire project_floating_image_position_limits) -
    // sans lui, l'éditeur peut être bien plus large que la page PDF et une position absolue en px n'a plus le même sens une fois réinterprétée à l'export.
    description: 'Une image en calque après du texte dans la même colonne (ancre "au-dessus") atterrit sur son paragraphe, pas collée en haut de page',
    run: async (h) => {
      await h.resetEditor();
      document.getElementById('editor-container').classList.add('a4-preview');
      await h.focusAtEnd();
      document.getElementById('v2-btn-two-columns').click();
      await h.sleep(80);
      const ed = EditorCore.getEditor();
      const colP = h.tiptap().querySelectorAll('.two-columns-zone > .two-columns-column')[1].querySelector('p');
      ed.commands.setTextSelection(ed.view.posAtDOM(colP, 0));
      ed.commands.focus();
      await h.sleep(50);
      await h.typeText('Texte de colonne droite pour ancrage, assez long pour occuper plusieurs lignes dans cette colonne etroite.');
      document.execCommand('insertParagraph');
      const dialogs = h.stubDialogs({ prompt: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=' });
      document.getElementById('v2-btn-image').click();
      await h.sleep(120);
      dialogs.restore();
      const img = h.tiptap().querySelectorAll('.two-columns-column')[1].querySelector('img.editor-image');
      await h.selectAtomNode(img);
      await h.sleep(80);
      const frontBtn = document.querySelector('.v2-floating-toolbar button[data-action="layer-front"]');
      if (!frontBtn) return { pass: false, notes: 'toolbar image non trouvée' };
      frontBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await h.sleep(100);
      const html = Editor.getHTML();
      const result = await h.exportPdfContent(html, null);
      const images = h.findImages(result.content);
      if (!images.length) return { pass: false, notes: 'image absente du PDF : ' + html };
      const abs = images[0].absolutePosition;
      if (!abs) return { pass: false, notes: 'absolutePosition absente : ' + JSON.stringify(images[0]) };
      // "Collé en haut" (bug) donnait ~28-40pt (marge de page) ; le paragraphe de 3 lignes qui précède dans la même colonne place la vraie ancre nettement
      // plus bas (~90pt avec Aperçu A4 actif). Fourchette large (pas une valeur exacte) : robuste à un léger ajustement futur de la formule d'ancrage.
      const pass = abs.y > 55 && abs.y < 150;
      return { pass, notes: 'abs=' + JSON.stringify(abs) + ' html=' + html };
    },
  });

  cases.push({
    id: 'pdffid_layered_image_x_aligned_with_anchor_text_in_column',
    // Bug réel (signalé par l'utilisateur après le premier correctif offsetParent) : l'image restait décalée horizontalement de quelques points par rapport
    // au texte qu'elle est censée surplomber - `.two-columns-column` a son propre padding+bordure (css/style.css, 6px+1px) qui n'existe pas dans l'isolat
    // de htmlToPdfContent(col.innerHTML,...) utilisé pour mesurer container/above/belowTopPx|LeftPx (relatifs au DÉBUT DU CONTENU, pas à la boîte de la
    // colonne) - twoColumnsFrom comparait à tort ces ancres à colRect (boîte de BORDURE), décalant l'image d'environ ce padding+bordure (~7px ≈ 5pt).
    description: 'Une image en calque juste après du texte dans une colonne reste alignée horizontalement avec ce texte (±2pt), pas décalée par le padding de la colonne',
    run: async (h) => {
      await h.resetEditor();
      document.getElementById('editor-container').classList.add('a4-preview');
      await h.focusAtEnd();
      document.getElementById('v2-btn-two-columns').click();
      await h.sleep(80);
      const ed = EditorCore.getEditor();
      const colP = h.tiptap().querySelectorAll('.two-columns-zone > .two-columns-column')[1].querySelector('p');
      ed.commands.setTextSelection(ed.view.posAtDOM(colP, 0));
      ed.commands.focus();
      await h.sleep(50);
      await h.typeText('XXXXXXXXXX');
      document.execCommand('insertParagraph');
      const dialogs = h.stubDialogs({ prompt: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=' });
      document.getElementById('v2-btn-image').click();
      await h.sleep(120);
      dialogs.restore();
      const img = h.tiptap().querySelectorAll('.two-columns-column')[1].querySelector('img.editor-image');
      await h.selectAtomNode(img);
      await h.sleep(80);
      const frontBtn = document.querySelector('.v2-floating-toolbar button[data-action="layer-front"]');
      if (!frontBtn) return { pass: false, notes: 'toolbar image non trouvée' };
      frontBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await h.sleep(100);
      const html = Editor.getHTML();
      const result = await h.exportPdfContent(html, null);
      const images = h.findImages(result.content);
      if (!images.length) return { pass: false, notes: 'image absente du PDF : ' + html };
      const abs = images[0].absolutePosition;
      if (!abs) return { pass: false, notes: 'absolutePosition absente : ' + JSON.stringify(images[0]) };
      const textBlock = h.findTextBlocks(result.content, b => h.blockPlainText(b).includes('XXXXXXXXXX'))[0];
      if (!textBlock || !textBlock.positions || !textBlock.positions.length) return { pass: false, notes: 'texte ancre introuvable dans le PDF' };
      const textLeft = textBlock.positions[0].left;
      const deltaXPt = abs.x - textLeft;
      const pass = Math.abs(deltaXPt) < 2;
      return { pass, notes: JSON.stringify({ imageX: abs.x, textLeft, deltaXPt }) };
    },
  });

  cases.push({
    id: 'pdffid_layered_image_x_position_differs_by_column',
    // Bug réel (découvert pendant le même audit) : le X d'une image en calque
    // dans une colonne 2-colonnes utilisait toujours la formule générique
    // "page-relatif" SANS jamais tenir compte de quelle colonne l'héberge -
    // une image dans la colonne de DROITE atterrissait au même X que si elle
    // était dans la colonne de GAUCHE. Vérifie que deux images (une par
    // colonne, positions CSS réelles différentes via un vrai aller-retour
    // toolbar "calque devant") donnent des X sensiblement différents dans le
    // PDF, dans le bon ordre (gauche < droite).
    description: 'Une image en calque dans la colonne de droite a un X PDF différent (plus grand) que dans la colonne de gauche',
    run: async (h) => {
      async function layerImageInColumn(colIndex) {
        await h.resetEditor();
        await h.focusAtEnd();
        for (let i = 0; i < 15; i += 1) { await h.typeText('Ligne de remplissage ' + i + '. '); document.execCommand('insertParagraph'); }
        document.getElementById('v2-btn-two-columns').click();
        await h.sleep(80);
        const ed = EditorCore.getEditor();
        const colP = document.querySelectorAll('.two-columns-zone > .two-columns-column')[colIndex].querySelector('p');
        ed.commands.setTextSelection(ed.view.posAtDOM(colP, 0));
        ed.commands.focus();
        await h.sleep(50);
        const dialogs = h.stubDialogs({ prompt: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=' });
        document.getElementById('v2-btn-image').click();
        await h.sleep(120);
        dialogs.restore();
        const img = document.querySelectorAll('.two-columns-column')[colIndex].querySelector('img.editor-image');
        await h.selectAtomNode(img);
        await h.sleep(80);
        const frontBtn = document.querySelector('.v2-floating-toolbar button[data-action="layer-front"]');
        frontBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        await h.sleep(80);
        const html = Editor.getHTML();
        const result = await h.exportPdfContent(html, null);
        const images = h.findImages(result.content);
        return images[0] && images[0].absolutePosition;
      }
      const left = await layerImageInColumn(0);
      const right = await layerImageInColumn(1);
      if (!left || !right) return { pass: false, notes: 'image absente : ' + JSON.stringify({ left, right }) };
      const pass = right.x > left.x + 50;
      return { pass, notes: JSON.stringify({ left, right }) };
    },
  });

  cases.push({
    id: 'pdffid_layered_image_multiline_container_anchor_top_level',
    // Généralisation, hors 2-colonnes, du bug ci-dessus : l'ancre "container" (même paragraphe source que l'image) prenait la DERNIÈRE ligne rendue du
    // texte porteur (lastPosition) au lieu de sa 1ère, alors que containerTopPx (côté éditeur) mesure toujours le HAUT du bloc - un texte assez long pour
    // envelopper sur plusieurs lignes (même à pleine largeur de page) exposait le même double-comptage de hauteur que dans une colonne étroite. Corrigé par
    // firstPosition (resolveNativePdfContent) : above/below/container utilisent tous les 3 la 1ère ligne réelle, pas la dernière.
    description: 'Une image en calque juste après un long paragraphe (qui enveloppe sur plusieurs lignes) au premier niveau atterrit près de son texte, pas anormalement plus bas',
    run: async (h) => {
      await h.resetEditor();
      document.getElementById('editor-container').classList.add('a4-preview');
      await h.focusAtEnd();
      await h.typeText('Ceci est un paragraphe de texte reel suffisamment long pour envelopper sur plusieurs lignes meme a pleine largeur de page, afin de verifier que l\'ancrage ne compte pas deux fois la hauteur du paragraphe porteur.');
      const dialogs = h.stubDialogs({ prompt: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=' });
      document.getElementById('v2-btn-image').click();
      await h.sleep(120);
      dialogs.restore();
      const img = h.tiptap().querySelector('img.editor-image');
      await h.selectAtomNode(img);
      await h.sleep(80);
      const frontBtn = document.querySelector('.v2-floating-toolbar button[data-action="layer-front"]');
      if (!frontBtn) return { pass: false, notes: 'toolbar image non trouvée' };
      frontBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await h.sleep(100);
      const html = Editor.getHTML();
      const result = await h.exportPdfContent(html, null);
      const images = h.findImages(result.content);
      if (!images.length) return { pass: false, notes: 'image absente du PDF : ' + html };
      const abs = images[0].absolutePosition;
      if (!abs) return { pass: false, notes: 'absolutePosition absente : ' + JSON.stringify(images[0]) };
      // Le bug (dernière ligne au lieu de la 1ère) ajoutait la hauteur du paragraphe une 2e fois - avec Aperçu A4, un paragraphe de 3-4 lignes qui enveloppe
      // sur ~35pt de haut donnerait un y anormalement élevé (>110pt) ; la vraie position doit rester proche du bas du paragraphe (~35-70pt).
      const pass = abs.y > 20 && abs.y < 90;
      return { pass, notes: 'abs=' + JSON.stringify(abs) + ' html=' + html };
    },
  });

  cases.push({
    id: 'pdffid_layered_image_below_anchor_not_stuck_at_page_top',
    // Cas jamais testé explicitement : une image en calque SEULE (paragraphe propre, sans texte partagé ni texte au-dessus) suivie d'un VRAI paragraphe de
    // texte APRÈS elle - bracketing "en-dessous" (below) uniquement, aucune ancre "container" ni "au-dessus" disponible. Vérifie que resolveImageAbsolutePosition
    // gère bien cette branche (layer!=='front' préfère "above" puis "below" ; "front" préfère "below" puis "above" - ici seul "below" existe, quel que soit le calque).
    description: 'Une image en calque SEULE suivie de texte réel (ancre "en-dessous" uniquement) suit bien ce texte quand elle se rapproche de lui, pas une valeur figée',
    run: async (h) => {
      // Fixture HTML directe : l'image est le tout 1er contenu du document (rien avant - "au-dessus" impossible par construction), seule dans son propre
      // paragraphe (aucun texte partagé - pas d'ancre "container" non plus), suivie d'un paragraphe de VRAI texte - seul "en-dessous" (below) est
      // disponible. Deux variantes (top CSS proche vs. loin du texte suivant) : si l'ancrage "en-dessous" fonctionne vraiment (interpolation sur
      // imgTopPx/belowTopPx, pas un repli figé), la variante "loin" doit atterrir clairement plus bas dans le PDF que la variante "proche".
      async function exportWithImgTop(topPx) {
        const html = '<p><img class="editor-image" draggable="false" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" alt="" data-layer="front" data-wrap="inline" style="width:40px;position:absolute;left:37px;top:' + topPx + 'px;z-index:5"></p>'
          + '<p>Paragraphe de texte reel place juste apres l\'image dans le flux du document.</p>';
        const result = await h.exportPdfContent(html, null);
        const images = h.findImages(result.content);
        return images[0] && images[0].absolutePosition;
      }
      const near = await exportWithImgTop(5);
      const far = await exportWithImgTop(300);
      if (!near || !far) return { pass: false, notes: 'absolutePosition absente : ' + JSON.stringify({ near, far }) };
      const pass = far.y > near.y + 100;
      return { pass, notes: JSON.stringify({ near, far }) };
    },
  });

  cases.push({
    id: 'pdffid_layered_image_behind_layer_in_twoColumns_anchor',
    // Tous les tests 2-colonnes précédents (offsetParent = .two-columns-zone, firstPosition) n'exercaient que data-layer="front" - vérifie que "behind"
    // (repli/ordre d'ancrage inversé dans resolveNativePdfContent : insertAfter=false) profite du même correctif d'ancrage local à la colonne.
    description: 'Une image en calque "derrière" (behind) après du texte dans une colonne 2-colonnes atterrit aussi sur son paragraphe, pas collée en haut de page',
    run: async (h) => {
      await h.resetEditor();
      document.getElementById('editor-container').classList.add('a4-preview');
      await h.focusAtEnd();
      document.getElementById('v2-btn-two-columns').click();
      await h.sleep(80);
      const ed = EditorCore.getEditor();
      const colP = h.tiptap().querySelectorAll('.two-columns-zone > .two-columns-column')[0].querySelector('p');
      ed.commands.setTextSelection(ed.view.posAtDOM(colP, 0));
      ed.commands.focus();
      await h.sleep(50);
      await h.typeText('Texte de colonne gauche pour ancrage, assez long pour occuper plusieurs lignes dans cette colonne etroite.');
      document.execCommand('insertParagraph');
      const dialogs = h.stubDialogs({ prompt: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=' });
      document.getElementById('v2-btn-image').click();
      await h.sleep(120);
      dialogs.restore();
      const img = h.tiptap().querySelectorAll('.two-columns-column')[0].querySelector('img.editor-image');
      await h.selectAtomNode(img);
      await h.sleep(80);
      const behindBtn = document.querySelector('.v2-floating-toolbar button[data-action="layer-behind"]');
      if (!behindBtn) return { pass: false, notes: 'toolbar image non trouvée' };
      behindBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await h.sleep(100);
      const html = Editor.getHTML();
      const result = await h.exportPdfContent(html, null);
      const images = h.findImages(result.content);
      if (!images.length) return { pass: false, notes: 'image absente du PDF : ' + html };
      const abs = images[0].absolutePosition;
      if (!abs) return { pass: false, notes: 'absolutePosition absente : ' + JSON.stringify(images[0]) };
      const pass = abs.y > 55 && abs.y < 150;
      return { pass, notes: 'abs=' + JSON.stringify(abs) + ' html=' + html };
    },
  });

  cases.push({
    id: 'pdffid_inline_image_position_in_paragraph',
    // Anciennement CASSÉ (cf. BUGS.md, Bug 3) : une image "au coeur du texte"
    // SANS alignement gauche/droite (par défaut, ou centrée) était toujours
    // repoussée en fin de texte de son paragraphe dans le PDF, quelle que
    // soit sa position réelle dans le HTML source (début/milieu/fin de
    // phrase). Corrigé : `blockFrom` (js/pdf-export.js) découpe
    // maintenant le paragraphe en plusieurs blocs pdfmake successifs
    // (texte, image, texte...) qui respectent l'ordre réel, au lieu de
    // concaténer tout le texte en un seul bloc suivi des images.
    description: 'Une image sans alignement gauche/droite au MILIEU d\'un paragraphe (texte avant ET après) apparaît ENTRE les deux dans le PDF, pas après tout le texte concaténé',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.typeText('AAA ');
      const dialogs = h.stubDialogs({ prompt: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=' });
      await h.clickButton('v2-btn-image');
      dialogs.restore();
      await h.sleep(80);
      const img = h.tiptap().querySelector('img.editor-image');
      const parentP = img.closest('p');
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(parentP);
      range.collapse(false);
      sel.removeAllRanges(); sel.addRange(range);
      await h.sleep(40);
      await h.typeText(' BBB');
      await h.sleep(60);
      const html = Editor.getHTML();
      const result = await h.exportPdfContent(html, null);
      const blocks = h.flattenPdfContent(result.content);
      const textBeforeImage = blocks.some((b, i) => h.blockPlainText(b).includes('AAA') && blocks.slice(0, i).every(bb => !bb.image));
      // Attendu (cassé actuellement) : le texte "AAA" arrive AVANT l'image
      // ET le texte "BBB" arrive APRÈS - jamais les deux fusionnés dans un
      // seul bloc suivi de l'image.
      const order = blocks.map(b => (b.image ? '[image]' : h.blockPlainText(b)));
      const aaaIdx = order.findIndex(t => typeof t === 'string' && t.includes('AAA'));
      const imgIdx = order.findIndex(t => t === '[image]');
      const bbbIdx = order.findIndex(t => typeof t === 'string' && t.includes('BBB'));
      const orderPreserved = aaaIdx >= 0 && imgIdx >= 0 && bbbIdx >= 0 && aaaIdx < imgIdx && imgIdx < bbbIdx;
      return { pass: orderPreserved, notes: 'html=' + html + ' order=' + JSON.stringify(order) };
    },
  });

  // Matrice exhaustive contexte × type d'ancre pour une image en calque juste après du texte réel - le point aveugle qui a laissé passer un bug réel cette
  // session : les tests existants ne croisaient jamais "au-dessus" (image seule dans son propre paragraphe, pas de partage avec le texte) avec une
  // vérification X (seul Y était vérifié pour ce type d'ancre). Root cause trouvée : le bracketing above/below (resolvePendingImageAnchors) comparait un
  // imgTopPx déjà décalé de -A4_PREVIEW_PADDING_PX à des bottom/top de candidats qui ne l'étaient pas - ~37px d'écart, assez pour rater une ancre "au-dessus"
  // pourtant juste au-dessus dès que le texte précédent ne fait qu'une ligne (cas le plus basique qui soit). Corrigé en comparant systématiquement des
  // repères bruts des deux côtés dans le bracketing ; le X manquant pour above/below (2e cause, X toujours absent pour ce type d'ancre) corrigé séparément
  // dans resolveImageAbsolutePosition (nouvelle branche symétrique à Y).
  async function insertLayeredImageAfterAnchor(h, context, anchorType) {
    await h.resetEditor();
    document.getElementById('editor-container').classList.add('a4-preview');
    await h.focusAtEnd();
    let hostP;
    if (context === 'tableCell') {
      document.getElementById('v2-btn-table').click();
      await h.sleep(80);
      const cells = h.tiptap().querySelectorAll('table td');
      hostP = cells[cells.length - 1].querySelector('p');
    } else {
      document.getElementById('v2-btn-two-columns').click();
      await h.sleep(80);
      const colIdx = context === 'twoColumnsLeft' ? 0 : 1;
      hostP = h.tiptap().querySelectorAll('.two-columns-zone > .two-columns-column')[colIdx].querySelector('p');
    }
    const ed = EditorCore.getEditor();
    ed.commands.setTextSelection(ed.view.posAtDOM(hostP, 0));
    ed.commands.focus();
    await h.sleep(50);
    await h.typeText('XXXXXXXXXX texte ancre');
    if (anchorType === 'above') { ed.commands.enter(); await h.sleep(60); }
    const dialogs = h.stubDialogs({ prompt: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=' });
    document.getElementById('v2-btn-image').click();
    await h.sleep(120);
    dialogs.restore();
    const container = context === 'tableCell'
      ? h.tiptap().querySelectorAll('table td')[h.tiptap().querySelectorAll('table td').length - 1]
      : h.tiptap().querySelectorAll('.two-columns-column')[context === 'twoColumnsLeft' ? 0 : 1];
    const img = container.querySelector('img.editor-image');
    await h.selectAtomNode(img);
    await h.sleep(80);
    const frontBtn = document.querySelector('.v2-floating-toolbar button[data-action="layer-front"]');
    if (!frontBtn) return { html: null };
    frontBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await h.sleep(100);
    return { html: Editor.getHTML() };
  }

  ['twoColumnsLeft', 'twoColumnsRight', 'tableCell'].forEach(context => {
    ['container', 'above'].forEach(anchorType => {
      cases.push({
        id: 'pdffid_matrix_' + context + '_' + anchorType,
        description: 'Matrice image en calque : contexte=' + context + ', ancre=' + anchorType + ' - alignée avec son texte en X ET en Y',
        run: async (h) => {
          const { html } = await insertLayeredImageAfterAnchor(h, context, anchorType);
          if (!html) return { pass: false, notes: 'toolbar image non trouvée' };
          const result = await h.exportPdfContent(html, null);
          const images = h.findImages(result.content);
          if (!images.length) return { pass: false, notes: 'image absente du PDF : ' + html };
          const abs = images[0].absolutePosition;
          if (!abs) return { pass: false, notes: 'absolutePosition absente : ' + JSON.stringify(images[0]) };
          const textBlock = h.findTextBlocks(result.content, b => h.blockPlainText(b).includes('XXXXXXXXXX'))[0];
          if (!textBlock || !textBlock.positions || !textBlock.positions.length) return { pass: false, notes: 'texte ancre introuvable dans le PDF' };
          const textLeft = textBlock.positions[0].left;
          const textTop = textBlock.positions[0].top;
          const deltaX = abs.x - textLeft;
          // L'image est désormais positionnée en grille page (capturée dans l'éditeur, indépendante du texte, cf. computePageGridPosition) - elle n'est
          // plus "recalée" sur la position PDF réelle du texte comme avec l'ancien ancrage. Dans une colonne 2-colonnes, le moteur de mise en page pdfmake
          // (twoColumnsFrom, largeur/chrome mesurés sur le rendu réel) reproduit le live quasi exactement (±3pt observé). Dans une cellule de TABLEAU,
          // les colonnes du PDF ont la largeur de celles de l'éditeur (columnWidthsPt) : elles perdaient chacune une espace et le texte de la 2e colonne
          // tombait 5 pt trop à gauche (la tolérance était de 6 pt, « limitation du moteur de tableau »), aujourd'hui 1,2 pt - la position de l'image
          // elle-même correspond exactement à ce qui a été capturé dans l'éditeur, l'écart était du côté du texte de référence.
          const tolerance = 3;
          const pass = Math.abs(deltaX) < tolerance && abs.y >= textTop - tolerance && abs.y < textTop + 200;
          return { pass, notes: JSON.stringify({ imageAbs: abs, textLeft, textTop, deltaX, tolerance }) };
        },
      });
    });
  });

  // Texte barré d'un item coché d'une liste à cases : le gris de la Lecture (--paper-text-faint, #667085, 4,97:1 sur blanc) et non plus un gris clair (#98a2b3, 2,6:1) - réponse d'Antoine
  // du 01/10 à la carte « Foncer le gris du texte barré des listes à cases dans le PDF et le Word ? » : « Oui, gris foncé ». Le Word : docx_task_list_glyphs (scenarios-docx.js).
  cases.push({
    id: 'pdffid_task_list_checked_item_text_is_struck_in_the_reading_grey',
    description: 'Le texte d’un item coché d’une liste à cases (« accent, texte barré ») est barré dans le gris foncé de la Lecture (#667085, 4,5:1 au moins sur blanc, pas le #98a2b3 à 2,6:1) ; un item décoché et le style « classique » gardent leur texte normal',
    run: async (h) => {
      const item = (checked, text) => `<li data-checked="${checked}"><label><input type="checkbox"${checked ? ' checked="checked"' : ''}><span></span></label><div><p>${text}</p></div></li>`;
      const html = `<ul data-type="taskList">${item(true, 'fait')}${item(false, 'a faire')}</ul>`
        + `<ul data-type="taskList" data-tasklist-style="classic">${item(true, 'classique')}</ul>`;
      const result = await h.exportPdfContent(html, null);
      const runs = [];
      const walk = node => {
        if (Array.isArray(node)) { node.forEach(walk); return; }
        if (!node || typeof node !== 'object') return;
        if (typeof node.text === 'string') runs.push(node);
        Object.keys(node).forEach(k => walk(node[k]));
      };
      walk(result.content);
      const run = text => runs.find(r => r.text.trim() === text) || {};
      const struck = r => [].concat(r.decoration || []).indexOf('lineThrough') !== -1;
      const channel = (hex, i) => { const v = parseInt(hex.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      const onWhite = hex => /^#[0-9a-f]{6}$/i.test(hex || '') ? 1.05 / (0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5) + 0.05) : 0;
      const done = run('fait');
      const checks = {
        checkedItemIsStruck: struck(done),
        greyIsTheReadingGrey: String(done.color).toLowerCase() === '#667085',
        greyIsReadable: onWhite(String(done.color)) >= 4.5,
        uncheckedStaysPlain: !struck(run('a faire')),
        classicStaysPlain: !struck(run('classique')),
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, done, unchecked: run('a faire'), classic: run('classique'), contrast: onWhite(String(done.color)) }) };
    },
  });

  // === Un tableau de DOCUMENT réglé avec la barre de la case : bords, alignement vertical, hauteurs de lignes, quadrillage masqué ===
  // Le PDF ne lisait ces réglages (`data-border-*`, `data-valign`, `data-row-height`, `data-grid-lines`) que sur un tableau dont une ligne portait une hauteur, donc sur la grille : le tableau d'un
  // document réglé sortait avec les traits gris de départ, ses textes en haut des cases et le quadrillage que la personne avait masqué. Ces cas lisent ce que le PDF peint (pdf.js), la grille
  // n'étant PAS ouverte (c'est un document) ; la grille ouverte garde ses règles (scenarios-grid.js, `grid_pdf_*`).
  const SET_RED = '#c0392b';
  const SET_GREY = '#777777';
  const distinctRounded = values => Array.from(new Set(values.map(v => Math.round(v * 10) / 10))).sort((a, b) => a - b);

  // Les traits fins que le PDF peint sur sa première page : { lines, byColor, xs (les x des traits verticaux), ys (les y des traits horizontaux) }.
  async function paintedStrokes(h, html, gridModel) {
    const result = await h.exportPdfContent(html, null, undefined, undefined, gridModel);
    const lines = (await h.extractPdfLines(result.base64)).pages[0].lines.filter(l => l.width < 1);
    const horizontal = l => Math.abs(l.y1 - l.y2) < 0.01;
    return { result, lines, horizontal, byColor: color => lines.filter(l => l.color === color), xs: distinctRounded(lines.filter(l => !horizontal(l)).map(l => l.x1)), ys: distinctRounded(lines.filter(horizontal).map(l => l.y1)) };
  }
  // Un tableau n × n dont chaque case porte ses quatre bords : le cadre extérieur de la couleur donnée, « pas de trait » à l'intérieur (un trait partagé dit la même chose aux deux cases).
  function framedTableHtml(n, color) {
    const side = (name, framed) => ' data-border-' + name + '="' + (framed ? color : 'none') + '"';
    const cell = (r, c) => '<td' + side('top', r === 0) + side('right', c === n - 1) + side('bottom', r === n - 1) + side('left', c === 0) + '><p>r' + r + 'c' + c + '</p></td>';
    return '<table><tbody>' + Array.from({ length: n }, (_, r) => '<tr>' + Array.from({ length: n }, (_, c) => cell(r, c)).join('') + '</tr>').join('') + '</tbody></table>';
  }
  const plainTableHtml = n => '<table><tbody>' + Array.from({ length: n }, (_, r) => '<tr>' + Array.from({ length: n }, (_, c) => '<td><p>r' + r + 'c' + c + '</p></td>').join('') + '</tr>').join('') + '</tbody></table>';

  cases.push({
    id: 'pdffid_document_table_borders_set_with_the_cell_bar_are_painted',
    description: 'PDF d\'un tableau de document dont les cases portent des bords réglés : un cadre rouge sans trait à l\'intérieur ne peint que les quatre côtés du cadre, en rouge ; le même tableau sans réglage garde tout son quadrillage gris de départ',
    run: async (h) => {
      await h.resetEditor();
      const plain = await paintedStrokes(h, plainTableHtml(3));
      const frame = await paintedStrokes(h, framedTableHtml(3, SET_RED));
      const framed = frame.lines.length > 0 && frame.lines.every(l => l.color === SET_RED) && frame.xs.length === 2 && frame.ys.length === 2;
      const greyGrid = plain.lines.length > 0 && plain.lines.every(l => l.color === SET_GREY) && plain.xs.length === 4 && plain.ys.length === 4;
      return { pass: framed && greyGrid, notes: JSON.stringify({ plain: { lines: plain.lines.length, xs: plain.xs.length, ys: plain.ys.length, colors: Array.from(new Set(plain.lines.map(l => l.color))) }, frame: { lines: frame.lines.length, xs: frame.xs, ys: frame.ys, colors: Array.from(new Set(frame.lines.map(l => l.color))) } }) };
    },
  });

  cases.push({
    id: 'pdffid_document_table_hidden_grid_lines_paint_only_the_placed_lines',
    description: 'PDF d\'un tableau de document au quadrillage masqué (`data-grid-lines="off"`) : sans rien de posé aucun trait n\'est peint ; seuls les traits que la personne a posés (ici le bas de la première ligne, en rouge) sont peints, et le quadrillage de départ des autres cases reste caché',
    run: async (h) => {
      await h.resetEditor();
      const cell = (extra, text) => '<td' + (extra || '') + '><p>' + text + '</p></td>';
      const bare = '<table data-grid-lines="off"><tbody><tr>' + cell('', 'a') + cell('', 'b') + '</tr><tr>' + cell('', 'c') + cell('', 'd') + '</tr></tbody></table>';
      const placed = '<table data-grid-lines="off"><tbody><tr>' + cell(' data-border-bottom="' + SET_RED + '"', 'a') + cell(' data-border-bottom="' + SET_RED + '"', 'b') + '</tr><tr>' + cell('', 'c') + cell('', 'd') + '</tr></tbody></table>';
      const shown = await paintedStrokes(h, bare.replace(' data-grid-lines="off"', ''));
      const hidden = await paintedStrokes(h, bare);
      const line = await paintedStrokes(h, placed);
      const lineOk = line.lines.length > 0 && line.lines.every(l => l.color === SET_RED && line.horizontal(l)) && line.ys.length === 1 && line.xs.length === 0;
      return { pass: shown.lines.length > 4 && hidden.lines.length === 0 && lineOk, notes: JSON.stringify({ shown: shown.lines.length, hidden: hidden.lines.length, line: { lines: line.lines.length, ys: line.ys, xs: line.xs, colors: Array.from(new Set(line.lines.map(l => l.color))) } }) };
    },
  });

  // Une ligne de trois cases : un grand texte à gauche (cinq paragraphes) qui donne sa hauteur à la ligne, puis trois cases d'une ligne de texte posées en haut, au milieu, en bas.
  const alignedRowHtml = '<table><tbody><tr>'
    + '<td data-valign="top"><p>a1</p><p>a2</p><p>a3</p><p>a4</p><p>a5</p></td>'
    + '<td data-valign="top" style="vertical-align: top"><p>haut</p></td><td data-valign="middle" style="vertical-align: middle"><p>centre</p></td><td data-valign="bottom" style="vertical-align: bottom"><p>bas</p></td>'
    + '</tr></tbody></table>';

  cases.push({
    id: 'pdffid_document_table_vertical_align_set_with_the_cell_bar_places_the_text_like_the_editor',
    description: 'PDF d\'un tableau de document dont des cases ont un alignement vertical réglé (en haut, au milieu, en bas) : le texte de chaque case est à la même hauteur que dans l\'éditeur (au point près), sans hauteur de ligne réglée',
    run: async (h) => {
      await h.resetEditor();
      Editor.setHTML(alignedRowHtml);
      await h.sleep(250);
      const topOf = td => { const range = document.createRange(); range.selectNodeContents(td.querySelector('p')); return range.getBoundingClientRect().top; };
      const cells = Array.from(h.tiptap().querySelectorAll('td'));
      const wanted = cells.map(td => (topOf(td) - topOf(cells[0])) * 0.75);
      const result = await h.exportPdfContent(alignedRowHtml, null);
      const ground = (await h.extractPdfGroundTruth(result.base64)).pages[0];
      const yOf = str => { const item = ground.textItems.find(i => i.str === str); return item ? item.y : null; };
      const ys = ['a1', 'haut', 'centre', 'bas'].map(yOf);
      const gaps = ys.map((y, i) => (y === null || ys[0] === null ? null : Math.round(((y - ys[0]) - wanted[i]) * 100) / 100));
      const pass = ys.every(y => y !== null) && gaps.every(g => Math.abs(g) <= 1) && wanted[3] > wanted[2] && wanted[2] > wanted[1] && Math.abs(wanted[1]) < 0.5;
      return { pass, notes: JSON.stringify({ wanted, ys, gaps }) };
    },
  });

  cases.push({
    id: 'pdffid_document_table_row_heights_set_with_the_grid_are_a_minimum_and_rows_stay_whole',
    description: 'PDF d\'un tableau de document dont des lignes ont une hauteur réglée : la hauteur réglée est un minimum (comme à l\'écran, au point près), une ligne sans réglage garde la hauteur de son texte (`heights` : \'auto\'), et le tableau se range comme un autre (lignes gardées entières, titres repris)',
    run: async (h) => {
      await h.resetEditor();
      const tall = ' data-row-height="60" style="height: 60px"';
      const html = '<table><tbody><tr' + tall + '><th><p>Titre</p></th><th><p>Autre</p></th></tr><tr><td><p>un</p></td><td><p>deux</p></td></tr><tr' + tall + '><td><p>trois</p></td><td><p>quatre</p></td></tr></tbody></table>';
      Editor.setHTML(html);
      await h.sleep(250);
      const editorRows = Array.from(h.tiptap().querySelectorAll('tr')).map(tr => tr.getBoundingClientRect().height * 0.75);
      const painted = await paintedStrokes(h, html);
      const table = painted.result.content.find(b => b.table);
      const gaps = painted.ys.slice(1).map((y, i) => y - painted.ys[i]);
      const heights = table ? table.table.heights : null;
      const pass = !!table && Array.isArray(heights) && heights.length === 3 && typeof heights[0] === 'number' && heights[1] === 'auto' && typeof heights[2] === 'number'
        && table.table.dontBreakRows === true && table.table.headerRows === 1
        && gaps.length === 3 && gaps.every((gap, i) => Math.abs(gap - editorRows[i]) <= 1.5) && editorRows[0] > 40 && editorRows[1] < editorRows[0];
      return { pass, notes: JSON.stringify({ heights, dontBreakRows: table && table.table.dontBreakRows, headerRows: table && table.table.headerRows, gaps, editorRows }) };
    },
  });

  cases.push({
    id: 'pdffid_document_table_merged_rows_keep_their_set_heights_inside_the_group',
    description: 'PDF d\'un tableau de document dont les lignes liées par une case fusionnée ont une hauteur réglée : le groupe est rangé comme une seule ligne (tableau imbriqué) et porte les hauteurs de ses lignes - le tableau peint a la hauteur de celui de l\'éditeur (au point près)',
    run: async (h) => {
      await h.resetEditor();
      const rowAttrs = px => ' data-row-height="' + px + '" style="height: ' + px + 'px"';
      const html = '<table><tbody><tr' + rowAttrs(60) + '><td rowspan="2"><p>fusion</p></td><td><p>un</p></td></tr><tr' + rowAttrs(60) + '><td><p>deux</p></td></tr><tr' + rowAttrs(40) + '><td><p>trois</p></td><td><p>quatre</p></td></tr></tbody></table>';
      Editor.setHTML(html);
      await h.sleep(250);
      const editorHeight = h.tiptap().querySelector('table').getBoundingClientRect().height * 0.75;
      const painted = await paintedStrokes(h, html);
      const outer = painted.result.content.find(b => b.table);
      const group = outer && outer.table.body[0] && outer.table.body[0][0] && outer.table.body[0][0].table;
      const paintedHeight = painted.ys.length ? painted.ys[painted.ys.length - 1] - painted.ys[0] : 0;
      const pass = !!outer && !!group && outer.table.dontBreakRows === true && outer.table.body.length === 2 && group.body.length === 2
        && Array.isArray(group.heights) && group.heights.length === 2 && group.heights.every(v => typeof v === 'number' && v > 30)
        && Math.abs(paintedHeight - editorHeight) <= 2;
      return { pass, notes: JSON.stringify({ outerRows: outer && outer.table.body.length, groupRows: group && group.body.length, groupHeights: group && group.heights, outerHeights: outer && outer.table.heights, paintedHeight, editorHeight }) };
    },
  });

  // La grille ouverte n'a ni feuille ni suite de texte : son tableau garde l'ancien rangement (aucune ligne de titres reprise, lignes non gardées entières, toutes les hauteurs réglées), que le modèle
  // soit celui de l'écran ou, dans un lot « Modèle selon la ligne », celui de la ligne (`gridModel`) ; un tableau de document aux mêmes réglages se range comme un document.
  cases.push({
    id: 'pdffid_open_grid_keeps_its_table_rules_and_a_document_table_with_the_same_settings_does_not',
    description: 'PDF du même tableau (une ligne de titres <th>, des hauteurs réglées) : pour une grille (modèle ouvert ou modèle de la ligne d\'un lot) ni titres repris, ni lignes gardées entières, toutes les hauteurs réglées ; pour un document (même quand la grille de l\'écran est ouverte mais que le modèle de la ligne est un document) les titres reviennent et les lignes sont gardées entières',
    run: async (h) => {
      const realActive = GridEditor.isActive;
      try {
        await h.resetEditor();
        const heightAttrs = ' data-row-height="28" style="height: 28px"';
        const html = '<table><tbody><tr' + heightAttrs + '><th><p>Titre</p></th><th><p>Autre</p></th></tr><tr' + heightAttrs + '><td><p>un</p></td><td><p>deux</p></td></tr><tr' + heightAttrs + '><td><p>trois</p></td><td><p>quatre</p></td></tr></tbody></table>';
        const rulesOf = async (gridModel) => {
          const table = (await h.exportPdfContent(html, null, undefined, undefined, gridModel)).content.find(b => b.table);
          return table ? { headerRows: table.table.headerRows, dontBreakRows: !!table.table.dontBreakRows, heights: (table.table.heights || []).every(v => typeof v === 'number') && (table.table.heights || []).length } : null;
        };
        const got = { openDocument: await rulesOf(undefined) };
        GridEditor.isActive = () => true;
        got.openGrid = await rulesOf(undefined);
        got.rowIsDocumentInOpenGrid = await rulesOf(false);
        GridEditor.isActive = realActive;
        got.rowIsGridInOpenDocument = await rulesOf(true);
        got.rowIsDocument = await rulesOf(false);
        const doc = r => !!r && r.headerRows === 1 && r.dontBreakRows === true;
        const grid = r => !!r && r.headerRows === 0 && r.dontBreakRows === false && r.heights === 3;
        const pass = doc(got.openDocument) && grid(got.openGrid) && doc(got.rowIsDocumentInOpenGrid) && grid(got.rowIsGridInOpenDocument) && doc(got.rowIsDocument);
        return { pass, notes: JSON.stringify(got) };
      } finally { GridEditor.isActive = realActive; }
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.pdfFidelity = cases;
})();
