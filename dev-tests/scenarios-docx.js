// Suite "docx" - STRUCTURE du .docx généré (tout ce qui n'est pas la position des images, traité par scenarios-docx-images.js) : titres, formats de texte,
// listes, tableaux, 2-colonnes, en-tête/pied, marges de page, sauts de page, notes, sommaire.
//
// Même principe que la suite images : on DÉZIPPE le .docx et on lit l'OOXML réel (word/document.xml, numbering.xml, footnotes.xml, header*.xml), jamais
// les objets docx.js d'entrée. Un `docx.Paragraph` correct en mémoire ne prouve rien sur le fichier - la sérialisation de docx.js a déjà introduit deux
// vrais défauts dans ce projet (compteur wp:docPr repartant à 1, <w:tblGrid> à 100 twips/colonne quand `columnWidths` est absent), tous deux invisibles
// avant d'ouvrir le paquet.
//
// Périmètre : l'export DOCX est volontairement plus modeste que l'export PDF (cf. l'en-tête de js/docx-export.js). Ces scénarios testent donc ce que DOCX
// promet, pas la fidélité pixel du PDF - et vérifient explicitement, quand c'est pertinent, les choses que DOCX fait MIEUX que le PDF (vrais champs
// numéro de page, vraies notes de bas de page, vrais styles "Titre N", numérotation de liste native).
(function () {
  const cases = [];
  const add = (id, description, run) => cases.push({ id, description, run });
  // Paragraphes "utiles" : docx.js pose des <w:p> vides dans ses propres parties (séparateurs de notes...), et un paragraphe vide du document a du sens
  // dans ce projet (c'est lui qui fait l'espacement vertical). Filtrer sur "a du texte OU un dessin" donne le contenu réellement produit.
  const meaningful = ps => ps.filter(p => (p.text && p.text.trim()) || p.drawingCount);

  // --- Titres ---
  add('docx_headings_native_word_styles',
    'H1..H6 -> vrais styles Word "Heading N" (repris par le volet de navigation), avec la taille de l\'éditeur et pas la couleur du thème Word',
    async (h) => {
      const html = [1, 2, 3, 4, 5, 6].map(n => '<h' + n + '>Titre ' + n + '</h' + n + '>').join('');
      const parts = await h.exportDocxParts(html);
      const ps = meaningful(h.docxParagraphs(parts.doc));
      const expectedSizes = { 1: 48, 2: 40, 3: 32, 4: 28, 5: 26, 6: 24 }; // demi-points, cf. HEADING_HALF_PT / HEADING_SIZES de js/pdf-export.js
      const bad = [];
      ps.forEach((p, i) => {
        const n = i + 1;
        if (p.style !== 'Heading' + n) bad.push('p' + n + ' style=' + p.style);
        const r = p.runs[0] || {};
        if (r.sizeHalfPt !== expectedSizes[n]) bad.push('p' + n + ' size=' + r.sizeHalfPt + ' (attendu ' + expectedSizes[n] + ')');
        if (!r.bold) bad.push('p' + n + ' non gras');
        // 'auto' = hérite du noir du corps de texte. Sans ça, le style Word "Titre N" impose SA couleur d'accent (bleu) - régression 86cf0e7.
        if (r.color !== 'auto') bad.push('p' + n + ' color=' + r.color + ' (attendu auto)');
      });
      return { pass: ps.length === 6 && !bad.length, notes: bad.length ? bad.join(' | ') : JSON.stringify(ps.map(p => ({ style: p.style, size: p.runs[0] && p.runs[0].sizeHalfPt }))) };
    });

  add('docx_heading_numbering_marker',
    'La numérotation de titres choisie dans l\'éditeur produit le MÊME marqueur littéral que le PDF et le mode Lecture',
    async (h) => {
      const html = '<div class="heading-numbering-config" data-style="decimal"></div><h1>Alpha</h1><h2>Beta</h2><h1>Gamma</h1>';
      const parts = await h.exportDocxParts(html);
      const texts = meaningful(h.docxParagraphs(parts.doc)).map(p => p.text);
      const attendu = HeadingNumbering.markersFor(Array.from(new DOMParser().parseFromString('<div>' + html + '</div>', 'text/html').querySelectorAll('h1,h2')), 'decimal');
      const pass = texts.length === 3 && texts[0] === attendu[0] + 'Alpha' && texts[1] === attendu[1] + 'Beta' && texts[2] === attendu[2] + 'Gamma';
      return { pass, notes: JSON.stringify({ docx: texts, marqueursAttendus: attendu }) };
    });

  // --- Formats de texte (run properties) ---
  add('docx_run_formats',
    'Gras / italique / souligné / barré / couleur / surlignage / police / taille sont portés par les <w:rPr> du bon run',
    async (h) => {
      const html = '<p><strong>G</strong><em>I</em><u>U</u><s>S</s>'
        + '<span style="color: #ff0000">C</span>'
        + '<span style="background-color: rgb(255, 255, 0)">H</span>'
        + '<span style="font-family: Georgia, serif">F</span>'
        + '<span style="font-size: 24px">T</span></p>';
      const parts = await h.exportDocxParts(html);
      const runs = h.docxParagraphs(parts.doc)[0].runs;
      const by = t => runs.find(r => r.text === t) || {};
      const bad = [];
      if (!by('G').bold) bad.push('gras');
      if (!by('I').italics) bad.push('italique');
      if (!by('U').underline) bad.push('souligné');
      if (!by('S').strike) bad.push('barré');
      if (by('C').color !== 'FF0000') bad.push('couleur=' + by('C').color);
      if (by('H').highlight !== 'FFFF00') bad.push('surlignage=' + by('H').highlight);
      if (by('F').font !== 'Georgia') bad.push('police=' + by('F').font);
      // 24px = 18pt = 36 demi-points.
      if (by('T').sizeHalfPt !== 36) bad.push('taille=' + by('T').sizeHalfPt);
      return { pass: !bad.length, notes: bad.length ? 'incorrect : ' + bad.join(', ') : JSON.stringify(runs.map(r => ({ t: r.text, b: r.bold, i: r.italics, u: r.underline, s: r.strike, c: r.color, hl: r.highlight, f: r.font, sz: r.sizeHalfPt }))) };
    });

  add('docx_run_formats_inherited_through_nesting',
    'Un format posé sur un conteneur est hérité par le texte imbriqué (<strong><em>...)',
    async (h) => {
      const parts = await h.exportDocxParts('<p><strong>gras <em>et italique</em></strong></p>');
      const runs = h.docxParagraphs(parts.doc)[0].runs;
      const inner = runs.find(r => r.text === 'et italique') || {};
      return { pass: !!(inner.bold && inner.italics), notes: JSON.stringify(runs.map(r => ({ t: r.text, b: r.bold, i: r.italics }))) };
    });

  add('docx_default_font_size',
    'La taille par défaut du corps de texte est 10.5pt, la même que l\'éditeur et le PDF',
    async (h) => {
      const parts = await h.exportDocxParts('<p>texte simple</p>');
      const r = h.docxParagraphs(parts.doc)[0].runs[0];
      return { pass: r.sizeHalfPt === 21, notes: 'sz=' + r.sizeHalfPt + ' demi-points (attendu 21 = 10.5pt)' };
    });

  add('docx_line_spacing_matches_editor',
    'L\'interligne posé est celui de l\'éditeur (1.42), pas celui du style Word "Normal"',
    async (h) => {
      const parts = await h.exportDocxParts('<p>a</p>');
      const spacing = parts.doc.getElementsByTagName('w:spacing')[0];
      const line = spacing && spacing.getAttribute('w:line');
      // 240èmes de ligne quand lineRule="auto" : 240 * 1.42 = 341.
      return { pass: Number(line) === 341 && spacing.getAttribute('w:lineRule') === 'auto' && spacing.getAttribute('w:after') === '0', notes: 'line=' + line + ' rule=' + (spacing && spacing.getAttribute('w:lineRule')) + ' after=' + (spacing && spacing.getAttribute('w:after')) };
    });

  // --- Alignement ---
  add('docx_paragraph_alignment',
    'L\'alignement de paragraphe (gauche/centre/droite/justifié) se retrouve en <w:jc>',
    async (h) => {
      const parts = await h.exportDocxParts(['left', 'center', 'right', 'justify'].map(a => '<p style="text-align:' + a + '">' + a + '</p>').join(''));
      const got = meaningful(h.docxParagraphs(parts.doc)).map(p => p.align);
      // OOXML nomme "both" le justifié.
      const attendu = ['left', 'center', 'right', 'both'];
      return { pass: JSON.stringify(got) === JSON.stringify(attendu), notes: JSON.stringify({ got, attendu }) };
    });

  // --- Listes ---
  add('docx_list_native_numbering',
    'Une <ol> utilise la numérotation Word NATIVE (numbering.xml), pas un marqueur texte figé - c\'est ce qui la fait renuméroter après édition',
    async (h) => {
      const parts = await h.exportDocxParts('<ol><li>un</li><li>deux</li></ol>');
      const ps = meaningful(h.docxParagraphs(parts.doc));
      const numbering = h.docxNumbering(parts.part('word/numbering.xml'));
      const ok = ps.length === 2 && ps[0].numId && ps[0].numId === ps[1].numId && ps[0].ilvl === '0';
      const def = ps[0].numId ? numbering[ps[0].numId] : null;
      const pass = ok && def && def.format === 'decimal' && def.text === '%1.'
        && ps.every(p => !/^\s*\d+[.)]/.test(p.text)); // aucun numéro écrit en dur dans le texte
      return { pass, notes: JSON.stringify({ textes: ps.map(p => p.text), numId: ps[0].numId, def }) };
    });

  add('docx_list_number_styles',
    'Les styles de numérotation de l\'éditeur (décimal / alpha / romain) et le `start` deviennent les formats Word correspondants',
    async (h) => {
      const parts = await h.exportDocxParts('<ol><li>d</li></ol><ol data-number-style="alpha" start="3"><li>a</li></ol><ol data-number-style="roman"><li>r</li></ol>');
      const ps = meaningful(h.docxParagraphs(parts.doc));
      const numbering = h.docxNumbering(parts.part('word/numbering.xml'));
      const defs = ps.map(p => numbering[p.numId]);
      const pass = defs.length === 3
        && defs[0].format === 'decimal' && defs[0].start === '1'
        && defs[1].format === 'lowerLetter' && defs[1].start === '3'
        && defs[2].format === 'lowerRoman';
      return { pass, notes: JSON.stringify(defs) };
    });

  add('docx_list_bullet_styles',
    'Les puces de l\'éditeur (disc / circle / square) deviennent les glyphes Unicode correspondants',
    async (h) => {
      const parts = await h.exportDocxParts('<ul><li>a</li></ul><ul data-bullet-style="circle"><li>b</li></ul><ul data-bullet-style="square"><li>c</li></ul>');
      const ps = meaningful(h.docxParagraphs(parts.doc));
      const numbering = h.docxNumbering(parts.part('word/numbering.xml'));
      const glyphes = ps.map(p => numbering[p.numId] && numbering[p.numId].text);
      return { pass: JSON.stringify(glyphes) === JSON.stringify(['•', '○', '▪']), notes: JSON.stringify(glyphes) };
    });

  add('docx_each_list_has_its_own_numbering',
    'Deux <ol> distinctes ne PARTAGENT jamais une référence de numérotation : la seconde redémarre donc bien à 1',
    async (h) => {
      const parts = await h.exportDocxParts('<ol><li>a</li><li>b</li></ol><p>entre</p><ol><li>c</li></ol>');
      const ps = meaningful(h.docxParagraphs(parts.doc)).filter(p => p.numId);
      const pass = ps.length === 3 && ps[0].numId === ps[1].numId && ps[2].numId !== ps[0].numId;
      return { pass, notes: JSON.stringify(ps.map(p => ({ t: p.text, numId: p.numId }))) };
    });

  add('docx_nested_list_indent',
    'Une sous-liste est indentée d\'un cran de plus que sa liste parente (aplatie en paragraphes, pas de vraie imbrication Word - choix assumé)',
    async (h) => {
      const parts = await h.exportDocxParts('<ul><li>parent<ul><li>enfant</li></ul></li></ul>');
      const ps = meaningful(h.docxParagraphs(parts.doc));
      const numbering = h.docxNumbering(parts.part('word/numbering.xml'));
      if (ps.length !== 2) return { pass: false, notes: 'attendu 2 paragraphes, trouvé ' + ps.length + ' : ' + JSON.stringify(ps.map(p => p.text)) };
      const indents = ps.map(p => Number(numbering[p.numId].indentLeft));
      // INDENT_STEP_TWIP = 360 par niveau.
      return { pass: indents[1] === indents[0] + 360 && ps[0].text === 'parent' && ps[1].text === 'enfant', notes: JSON.stringify({ textes: ps.map(p => p.text), indents }) };
    });

  add('docx_task_list_glyphs',
    'Case à cocher : glyphe Unicode littéral (☑/☐) et texte barré gris quand l\'item est coché',
    async (h) => {
      const parts = await h.exportDocxParts('<ul data-type="taskList"><li data-checked="true">fait</li><li data-checked="false">a faire</li></ul>');
      const ps = meaningful(h.docxParagraphs(parts.doc));
      if (ps.length !== 2) return { pass: false, notes: 'attendu 2 items, trouvé ' + ps.length };
      const coche = ps[0], aFaire = ps[1];
      const texteCoche = coche.runs.find(r => r.text === 'fait') || {};
      const pass = coche.text === '☑ fait' && aFaire.text === '☐ a faire'
        && texteCoche.strike === true && texteCoche.color === '98A2B3'
        && !coche.numId; // jamais une liste numérotée Word : le glyphe EST le marqueur
      return { pass, notes: JSON.stringify({ textes: ps.map(p => p.text), barreSiCoche: texteCoche.strike, couleur: texteCoche.color, numId: coche.numId }) };
    });

  add('docx_task_list_style_classic_keeps_plain_text',
    'Style de case "classic" : la case est cochée mais le texte reste normal (pas barré) - même règle que le PDF',
    async (h) => {
      const parts = await h.exportDocxParts('<ul data-type="taskList" data-tasklist-style="classic"><li data-checked="true">fait</li></ul>');
      const run = h.docxParagraphs(parts.doc)[0].runs.find(r => r.text === 'fait') || {};
      return { pass: run.strike === false, notes: JSON.stringify(run) };
    });

  // --- Blocs ---
  add('docx_blockquote',
    'Une citation garde son retrait et son filet vertical gauche',
    async (h) => {
      const parts = await h.exportDocxParts('<blockquote><p>cite</p></blockquote>');
      const p = meaningful(h.docxParagraphs(parts.doc))[0];
      const bdr = parts.doc.getElementsByTagName('w:pBdr')[0];
      const left = bdr && bdr.getElementsByTagName('w:left')[0];
      return { pass: p.indentLeft === '400' && !!left && left.getAttribute('w:val') === 'single', notes: JSON.stringify({ indent: p.indentLeft, bordure: left && left.getAttribute('w:val') }) };
    });

  add('docx_horizontal_rule',
    'Un trait horizontal devient un paragraphe à filet bas (OOXML n\'a pas de <hr>)',
    async (h) => {
      const parts = await h.exportDocxParts('<p>avant</p><hr><p>apres</p>');
      const bdr = Array.from(parts.doc.getElementsByTagName('w:pBdr'));
      const bottom = bdr.length === 1 && bdr[0].getElementsByTagName('w:bottom')[0];
      return { pass: !!bottom && bottom.getAttribute('w:val') === 'single', notes: 'pBdr trouvés : ' + bdr.length };
    });

  add('docx_page_break',
    'Un saut de page manuel devient <w:pageBreakBefore> sur le paragraphe SUIVANT (pas un paragraphe vide en plus)',
    async (h) => {
      const parts = await h.exportDocxParts('<p>page 1</p><div class="page-break-marker"></div><p>page 2</p>');
      const ps = meaningful(h.docxParagraphs(parts.doc));
      const pass = ps.length === 2 && ps[0].pageBreakBefore === false && ps[1].pageBreakBefore === true && ps[1].text === 'page 2';
      return { pass, notes: JSON.stringify(ps.map(p => ({ t: p.text, brk: p.pageBreakBefore }))) };
    });

  add('docx_page_break_before_list',
    'Un saut de page devant une liste s\'applique à son PREMIER item seulement',
    async (h) => {
      const parts = await h.exportDocxParts('<p>a</p><div class="page-break-marker"></div><ul><li>un</li><li>deux</li></ul>');
      const ps = meaningful(h.docxParagraphs(parts.doc));
      const pass = ps.length === 3 && ps[1].pageBreakBefore === true && ps[2].pageBreakBefore === false;
      return { pass, notes: JSON.stringify(ps.map(p => ({ t: p.text, brk: p.pageBreakBefore }))) };
    });

  // --- Tableaux ---
  add('docx_table_grid_matches_cell_widths',
    'Le <w:tblGrid> correspond aux largeurs réelles des cellules (régression f7bfb78 : un tblGrid incohérent faisait refuser le fichier par Word)',
    async (h) => {
      const parts = await h.exportDocxParts('<table><tbody><tr><td><p>A</p></td><td><p>B</p></td><td><p>C</p></td></tr><tr><td><p>D</p></td><td><p>E</p></td><td><p>F</p></td></tr></tbody></table>');
      const tables = h.docxTables(parts.doc);
      if (tables.length !== 1) return { pass: false, notes: 'attendu 1 tableau, trouvé ' + tables.length };
      const t = tables[0];
      const largeursCellules = t.rows[0].cells.map(c => c.widthTwip);
      const coherent = t.gridCols.length === 3 && t.gridCols.every((w, i) => w === largeursCellules[i]);
      // 100 twips/colonne = le repli interne de docx.js quand `columnWidths` est absent : le symptôme exact de la régression.
      const pasLeRepli = t.gridCols.every(w => w > 200);
      return { pass: coherent && pasLeRepli && t.rows.length === 2, notes: JSON.stringify({ gridCols: t.gridCols, cellules: largeursCellules, lignes: t.rows.length }) };
    });

  add('docx_table_measured_widths_not_equal_split',
    'Les largeurs de colonnes sont MESURÉES sur le rendu réel (comme le PDF), pas réparties à parts égales',
    async (h) => {
      // Un <colgroup> avec des largeurs explicites, ce que TipTap sérialise après un redimensionnement de colonne : c'est exactement le cas que la
      // répartition à parts égales de la V1 ignorait (le <col> ne porte qu'un minimum px, jamais un pourcentage - d'où la mesure du rendu réel).
      const parts = await h.exportDocxParts('<table><colgroup><col style="width: 500px"><col style="width: 150px"></colgroup><tbody><tr><td><p>large</p></td><td><p>etroite</p></td></tr></tbody></table>');
      const t = h.docxTables(parts.doc)[0];
      const [a, b] = t.gridCols;
      // 500px/150px = un rapport d'environ 3.3 ; on vérifie l'ORDRE DE GRANDEUR (la mesure inclut padding/bordures), pas une égalité au twip près.
      const ratio = a / b;
      return { pass: ratio > 2.5 && ratio < 4.5, notes: JSON.stringify({ gridCols: t.gridCols, ratio }) };
    });

  add('docx_table_colspan',
    'Un colspan devient <w:gridSpan> et la cellule occupe la largeur cumulée des colonnes fusionnées',
    async (h) => {
      const parts = await h.exportDocxParts('<table><tbody><tr><td colspan="2"><p>fusion</p></td></tr><tr><td><p>A</p></td><td><p>B</p></td></tr></tbody></table>');
      const t = h.docxTables(parts.doc)[0];
      const fusion = t.rows[0].cells[0];
      const somme = t.gridCols.reduce((x, y) => x + y, 0);
      return { pass: fusion.gridSpan === 2 && Math.abs(fusion.widthTwip - somme) <= 1, notes: JSON.stringify({ gridSpan: fusion.gridSpan, largeur: fusion.widthTwip, sommeColonnes: somme }) };
    });

  add('docx_table_cell_keeps_rich_content',
    'Une cellule garde ses blocs riches (liste, titre), pas seulement du texte brut',
    async (h) => {
      const parts = await h.exportDocxParts('<table><tbody><tr><td><h2>Titre</h2><ul><li>item</li></ul></td><td><p>B</p></td></tr></tbody></table>');
      const ps = h.docxParagraphs(parts.doc);
      const titre = ps.find(p => p.text === 'Titre');
      const item = ps.find(p => p.text === 'item');
      return { pass: !!titre && titre.style === 'Heading2' && !!item && !!item.numId, notes: JSON.stringify({ titreStyle: titre && titre.style, itemNumId: item && item.numId }) };
    });

  // --- Module 2 colonnes ---
  add('docx_two_columns_borderless_table',
    'Le module 2 colonnes est émulé par un tableau SANS bordures, avec une cellule vide au milieu qui reproduit la gouttière CSS',
    async (h) => {
      const parts = await h.exportDocxParts('<div class="two-columns-zone" style="--layout-left: 50%"><div class="two-columns-column"><p>G</p></div><div class="two-columns-column"><p>D</p></div></div>');
      const t = h.docxTables(parts.doc)[0];
      if (!t) return { pass: false, notes: 'aucun tableau produit' };
      const cells = t.rows[0].cells;
      const pass = t.rows.length === 1 && cells.length === 3 && cells.every(c => c.borderless === true)
        && cells[0].text === 'G' && cells[1].text === '' && cells[2].text === 'D';
      return { pass, notes: JSON.stringify({ lignes: t.rows.length, cellules: cells.map(c => ({ t: c.text, sansBordure: c.borderless })) }) };
    });

  add('docx_two_columns_gutter_matches_css_gap',
    'La colonne séparatrice fait exactement la largeur de la gouttière CSS (gap: 16px) - sans elle, les deux colonnes se touchent dans Word',
    async (h) => {
      const parts = await h.exportDocxParts('<div class="two-columns-zone" style="--layout-left: 50%"><div class="two-columns-column"><p>G</p></div><div class="two-columns-column"><p>D</p></div></div>');
      const t = h.docxTables(parts.doc)[0];
      const gouttiere = Math.round(16 * 15); // 16px * PX_TO_TWIP
      return { pass: t.gridCols[1] === gouttiere, notes: JSON.stringify({ gridCols: t.gridCols, gouttiereAttendue: gouttiere }) };
    });

  add('docx_two_columns_cells_have_no_inner_margin',
    'Les cellules du module 2 colonnes n\'ont aucune marge interne : la largeur annoncée EST la largeur du texte (une marge Word par défaut fausserait de ~3.8mm le chiffre en mm choisi par l\'utilisateur)',
    async (h) => {
      const parts = await h.exportDocxParts('<div class="two-columns-zone" style="--layout-left: 50%"><div class="two-columns-column"><p>G</p></div><div class="two-columns-column"><p>D</p></div></div>');
      const marges = Array.from(parts.doc.getElementsByTagName('w:tcMar'));
      const toutesANul = marges.length > 0 && marges.every(m => Array.from(m.children).every(c => c.getAttribute('w:w') === '0'));
      return { pass: toutesANul, notes: 'blocs <w:tcMar> trouvés : ' + marges.length + (marges.length ? ' - ' + marges.map(m => Array.from(m.children).map(c => c.nodeName + '=' + c.getAttribute('w:w')).join(',')).join(' | ') : '') };
    });

  add('docx_two_columns_percentage_width',
    'Une répartition en POURCENTAGE est appliquée à la largeur de contenu de la page',
    async (h) => {
      const parts = await h.exportDocxParts('<div class="two-columns-zone" style="--layout-left: 34%"><div class="two-columns-column"><p>G</p></div><div class="two-columns-column"><p>D</p></div></div>');
      const t = h.docxTables(parts.doc)[0];
      const contenu = 11906 - 560 - 560; // A4 moins les marges par défaut, en twips
      const gouttiere = Math.round(16 * 15);
      const gauche = Math.round(contenu * 0.34);
      const attendu = [gauche, gouttiere, contenu - gauche - gouttiere];
      return { pass: JSON.stringify(t.gridCols) === JSON.stringify(attendu), notes: JSON.stringify({ gridCols: t.gridCols, attendu }) };
    });

  add('docx_two_columns_mm_width',
    'Une largeur de colonne réglée en MILLIMÈTRES est convertie directement, sans repasser par un pourcentage arrondi',
    async (h) => {
      const parts = await h.exportDocxParts('<div class="two-columns-zone" style="--layout-left: 50%; --layout-left-mm: 60"><div class="two-columns-column"><p>G</p></div><div class="two-columns-column"><p>D</p></div></div>');
      const t = h.docxTables(parts.doc)[0];
      const gauche = Math.round(60 * 1440 / 25.4); // 60mm en twips
      const contenu = 11906 - 560 - 560;
      const gouttiere = Math.round(16 * 15);
      // La largeur en mm choisie par l'utilisateur doit se retrouver EXACTE dans le fichier : c'est tout l'intérêt du réglage en mm.
      return { pass: t.gridCols[0] === gauche && t.gridCols[2] === contenu - gauche - gouttiere, notes: JSON.stringify({ gridCols: t.gridCols, attenduGauche: gauche }) };
    });

  // --- Mise en page de section ---
  add('docx_page_size_and_default_margins',
    'Page A4 et marges par défaut (28pt = 560 twips) identiques à celles du PDF',
    async (h) => {
      const parts = await h.exportDocxParts('<p>a</p>');
      const s = h.docxSectionProps(parts.doc);
      const pass = s.widthTwip === 11906 && s.heightTwip === 16838
        && ['top', 'right', 'bottom', 'left'].every(k => s.margins[k] === 560);
      return { pass, notes: JSON.stringify(s) };
    });

  add('docx_custom_page_margins',
    'Les marges de page configurées dans l\'éditeur (PageLayout) arrivent telles quelles en <w:pgMar>',
    async (h) => {
      const margins = { top: 1134, right: 850, bottom: 1701, left: 2268 }; // 20 / 15 / 30 / 40 mm
      const parts = await h.exportDocxParts('<p>a</p>', null, margins);
      const s = h.docxSectionProps(parts.doc);
      const ok = ['top', 'right', 'bottom', 'left'].every(k => s.margins[k] === margins[k]);
      return { pass: ok, notes: JSON.stringify({ got: s.margins, attendu: margins }) };
    });

  add('docx_custom_margins_shrink_content_width',
    'Des marges plus larges rétrécissent d\'autant la largeur de contenu utilisée par les tableaux',
    async (h) => {
      const margins = { top: 560, right: 1440, bottom: 560, left: 1440 };
      const html = '<div class="two-columns-zone" style="--layout-left: 50%"><div class="two-columns-column"><p>G</p></div><div class="two-columns-column"><p>D</p></div></div>';
      const parts = await h.exportDocxParts(html, null, margins);
      const t = h.docxTables(parts.doc)[0];
      const contenu = 11906 - 1440 - 1440;
      return { pass: t.gridCols.reduce((a, b) => a + b, 0) === contenu, notes: JSON.stringify({ gridCols: t.gridCols, contenuAttendu: contenu }) };
    });

  // --- En-tête / pied de page ---
  add('docx_header_footer_parts',
    'En-tête et pied activés -> parties header1.xml / footer1.xml référencées par la section',
    async (h) => {
      const hf = { enabled: true, differentFirstPage: false, header: { default: '<p>Mon en-tete</p>' }, footer: { default: '<p>Mon pied</p>' } };
      const parts = await h.exportDocxParts('<p>corps</p>', hf);
      const s = h.docxSectionProps(parts.doc);
      const header = parts.part('word/header1.xml');
      const footer = parts.part('word/footer1.xml');
      const pass = s.headerRefs.includes('default') && s.footerRefs.includes('default')
        && meaningful(h.docxParagraphs(header)).map(p => p.text).join('') === 'Mon en-tete'
        && meaningful(h.docxParagraphs(footer)).map(p => p.text).join('') === 'Mon pied'
        && s.titlePg === false;
      return { pass, notes: JSON.stringify({ headerRefs: s.headerRefs, footerRefs: s.footerRefs, titlePg: s.titlePg }) };
    });

  add('docx_header_footer_different_first_page',
    '"Première page différente" -> <w:titlePg> + une seconde paire de parties (type "first")',
    async (h) => {
      const hf = { enabled: true, differentFirstPage: true, header: { default: '<p>Suite</p>', first: '<p>Premiere</p>' }, footer: { default: '<p>PiedSuite</p>', first: '<p>PiedPremiere</p>' } };
      const parts = await h.exportDocxParts('<p>corps</p>', hf);
      const s = h.docxSectionProps(parts.doc);
      const textes = parts.names.filter(n => /word\/header\d+\.xml$/.test(n)).map(n => meaningful(h.docxParagraphs(parts.part(n))).map(p => p.text).join(''));
      const pass = s.titlePg === true && s.headerRefs.includes('first') && s.headerRefs.includes('default')
        && s.footerRefs.includes('first') && textes.sort().join('|') === 'Premiere|Suite';
      return { pass, notes: JSON.stringify({ titlePg: s.titlePg, headerRefs: s.headerRefs, footerRefs: s.footerRefs, textes }) };
    });

  add('docx_header_footer_absent_when_disabled',
    'En-tête/pied désactivés -> aucune partie header/footer dans le paquet',
    async (h) => {
      const parts = await h.exportDocxParts('<p>corps</p>', { enabled: false, header: { default: '<p>ignore</p>' } });
      const hf = parts.names.filter(n => /word\/(header|footer)\d+\.xml$/.test(n));
      return { pass: hf.length === 0, notes: 'parties trouvées : ' + JSON.stringify(hf) };
    });

  add('docx_page_number_native_field',
    'Le badge "numéro de page" devient un VRAI champ Word (PAGE / NUMPAGES), pas un nombre figé - ce que le PDF ne peut pas faire',
    async (h) => {
      const hf = { enabled: true, differentFirstPage: false, footer: { default: '<p><span class="page-number-badge" data-format="n-slash-total">1/1</span></p>' } };
      const parts = await h.exportDocxParts('<p>corps</p>', hf);
      const footer = parts.part('word/footer1.xml');
      const champs = h.docxFields(footer);
      const texte = meaningful(h.docxParagraphs(footer)).map(p => p.text).join('');
      return { pass: JSON.stringify(champs) === JSON.stringify(['PAGE', 'NUMPAGES']) && texte === '/', notes: JSON.stringify({ champs, texte }) };
    });

  add('docx_page_number_formats',
    'Les trois formats du badge ("n", "Page n", "n/total") produisent les bons champs et libellés',
    async (h) => {
      const attendus = { n: { champs: ['PAGE'], texte: '' }, 'page-n': { champs: ['PAGE'], texte: 'Page ' }, 'n-slash-total': { champs: ['PAGE', 'NUMPAGES'], texte: '/' } };
      const bad = [];
      for (const [format, attendu] of Object.entries(attendus)) {
        const hf = { enabled: true, footer: { default: '<p><span class="page-number-badge" data-format="' + format + '"></span></p>' } };
        const parts = await h.exportDocxParts('<p>c</p>', hf);
        const footer = parts.part('word/footer1.xml');
        const champs = h.docxFields(footer);
        const texte = meaningful(h.docxParagraphs(footer)).map(p => p.text).join('');
        if (JSON.stringify(champs) !== JSON.stringify(attendu.champs) || texte !== attendu.texte) bad.push(format + ' -> ' + JSON.stringify({ champs, texte }));
      }
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'les 3 formats sont conformes' };
    });

  // --- Notes de bas de page ---
  add('docx_footnotes_native',
    'Les notes de bas de page sont de VRAIES notes Word (footnotes.xml + <w:footnoteReference>), numérotées dans l\'ordre du document',
    async (h) => {
      const marker = (txt, n) => '<span class="footnote-ref-marker" data-note-text="' + txt + '">' + n + '</span>';
      const parts = await h.exportDocxParts('<p>a' + marker('Premiere note', 1) + ' b' + marker('Seconde note', 2) + '</p>');
      const notes = h.docxFootnotes(parts.part('word/footnotes.xml'));
      const refs = Array.from(parts.doc.getElementsByTagName('w:footnoteReference')).map(r => r.getAttribute('w:id'));
      const pass = JSON.stringify(refs) === JSON.stringify(['1', '2']) && notes['1'] === 'Premiere note' && notes['2'] === 'Seconde note';
      return { pass, notes: JSON.stringify({ refs, notes }) };
    });

  // --- Sommaire ---
  add('docx_toc_static_list',
    'Le sommaire est une liste STATIQUE des titres (choix assumé : un vrai champ TOC Word obligerait le lecteur à "mettre à jour les champs")',
    async (h) => {
      const parts = await h.exportDocxParts('<div class="toc-marker"></div><h1>Alpha</h1><h2>Beta</h2>');
      const textes = meaningful(h.docxParagraphs(parts.doc)).map(p => p.text);
      const pass = textes[0] === 'Sommaire' && textes.includes('Alpha') && textes.includes('Beta') && textes.filter(t => t === 'Alpha').length === 2;
      return { pass, notes: JSON.stringify(textes) };
    });

  add('docx_toc_without_headings',
    'Un sommaire sans aucun titre dans le document ne casse pas l\'export',
    async (h) => {
      const parts = await h.exportDocxParts('<div class="toc-marker"></div><p>juste du texte</p>');
      const textes = meaningful(h.docxParagraphs(parts.doc)).map(p => p.text);
      return { pass: textes[0] === 'Sommaire' && textes.length >= 2, notes: JSON.stringify(textes) };
    });

  add('docx_toc_ignored_inside_table',
    'Un sommaire égaré dans une cellule est ignoré silencieusement plutôt que de faire planter la sérialisation',
    async (h) => {
      const parts = await h.exportDocxParts('<h1>Titre</h1><table><tbody><tr><td><div class="toc-marker"></div><p>cellule</p></td><td><p>x</p></td></tr></tbody></table>');
      const textes = meaningful(h.docxParagraphs(parts.doc)).map(p => p.text);
      return { pass: !textes.includes('Sommaire') && textes.includes('cellule'), notes: JSON.stringify(textes) };
    });

  // --- Variables / chips ---
  add('docx_resolved_variables_are_plain_text',
    'Une #Variable déjà résolue par le mode Lecture ressort en texte simple, sans reliquat de balise',
    async (h) => {
      const parts = await h.exportDocxParts('<p>Bonjour <span class="resolved-var">Dupont</span>, bienvenue</p>');
      const p = meaningful(h.docxParagraphs(parts.doc))[0];
      return { pass: p.text === 'Bonjour Dupont, bienvenue', notes: JSON.stringify(p.text) };
    });

  add('docx_smart_chip_resolved_before_export',
    'Un smart chip (date du jour) est résolu en texte AVANT l\'export - jamais exporté comme un jeton brut',
    async (h) => {
      const parts = await h.exportDocxParts('<p>Le <span class="smart-chip" data-chip-kind="date">@date</span> a Paris</p>');
      const texte = meaningful(h.docxParagraphs(parts.doc))[0].text;
      const d = new Date();
      const attendu = 'Le ' + String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear() + ' a Paris';
      return { pass: texte === attendu, notes: JSON.stringify({ texte, attendu }) };
    });

  // --- Intégrité du paquet ---
  add('docx_package_is_complete_and_wellformed',
    'Le paquet contient les parties obligatoires d\'un .docx et chaque XML est bien formé',
    async (h) => {
      const parts = await h.exportDocxParts('<h1>T</h1><p>a</p><ul><li>b</li></ul><table><tbody><tr><td><p>c</p></td></tr></tbody></table>');
      const requises = ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml', 'word/_rels/document.xml.rels'];
      const manquantes = requises.filter(n => !parts.names.includes(n));
      const malFormees = Object.keys(parts.parts).filter(n => {
        const d = parts.part(n);
        return !d || d.getElementsByTagName('parsererror').length > 0;
      });
      return { pass: !manquantes.length && !malFormees.length, notes: JSON.stringify({ manquantes, malFormees, nbParties: parts.names.length }) };
    });

  add('docx_empty_document_still_valid',
    'Un document vide produit quand même un .docx valide (un <w:p> vide, jamais un corps sans enfant que Word refuserait)',
    async (h) => {
      const parts = await h.exportDocxParts('');
      const body = parts.doc.getElementsByTagName('w:body')[0];
      const ps = parts.doc.getElementsByTagName('w:p');
      return { pass: !!body && ps.length >= 1, notes: 'paragraphes : ' + ps.length };
    });

  add('docx_filename_from_template',
    'Le nom de fichier suit le modèle de nom configuré, comme pour le PDF',
    async (h) => {
      await PdfExport.ensurePdfLibsLoaded();
      await DocxExport.ensureDocxLibLoaded();
      const { filename } = await DocxExport.getDocxBlobForRecord('<p>a</p>', null, {}, 'contrat-fixe', null, null);
      return { pass: filename === 'contrat-fixe', notes: 'filename=' + JSON.stringify(filename) };
    });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.docx = cases;
})();
