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
    id: 'pdffid_layered_image_absolute_position',
    description: 'Une image en calque "devant" a une absolutePosition PDF cohérente avec sa position à l\'écran (±10pt)',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.typeText('Texte porteur pour ancrage');
      const origPrompt = window.prompt;
      window.prompt = () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
      await h.clickButton('v2-btn-image');
      window.prompt = origPrompt;
      await h.sleep(80);
      const img = h.tiptap().querySelector('img.editor-image');
      await h.selectAtomNode(img);
      const frontBtn = document.querySelector('.v2-floating-toolbar button[data-action="layer-front"]');
      frontBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await h.sleep(60);
      const html = Editor.getHTML();
      const styleMatch = /left:\s*(\d+)px;\s*top:\s*(\d+)px/.exec(html);
      if (!styleMatch) return { pass: false, notes: 'position CSS introuvable - html=' + html };
      const cssLeftPx = parseFloat(styleMatch[1]);
      const cssTopPx = parseFloat(styleMatch[2]);
      const PX_TO_PT = 0.75; // même conversion que pdf-export.js (96dpi -> 72pt)
      const result = await h.exportPdfContent(html, null);
      const images = h.findImages(result.content);
      if (!images.length) return { pass: false, notes: 'aucune image trouvée dans le PDF' };
      const abs = images[0].absolutePosition;
      if (!abs) return { pass: false, notes: 'absolutePosition absente : ' + JSON.stringify(images[0]) };
      const expectedLeftPt = cssLeftPx * PX_TO_PT;
      const expectedTopPt = cssTopPx * PX_TO_PT;
      const pass = Math.abs(abs.x - expectedLeftPt) < 10 && Math.abs(abs.y - expectedTopPt) < 10;
      return { pass, notes: JSON.stringify({ cssLeftPx, cssTopPx, expectedLeftPt, expectedTopPt, abs }) };
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
      const origPrompt = window.prompt;
      window.prompt = () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
      document.getElementById('v2-btn-image').click();
      await h.sleep(120);
      window.prompt = origPrompt;
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
      const origPrompt = window.prompt;
      window.prompt = () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
      document.getElementById('v2-btn-image').click();
      await h.sleep(120);
      window.prompt = origPrompt;
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
        const origPrompt = window.prompt;
        window.prompt = () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
        document.getElementById('v2-btn-image').click();
        await h.sleep(120);
        window.prompt = origPrompt;
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
      const origPrompt = window.prompt;
      window.prompt = () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
      document.getElementById('v2-btn-image').click();
      await h.sleep(120);
      window.prompt = origPrompt;
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
      const origPrompt = window.prompt;
      window.prompt = () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
      document.getElementById('v2-btn-image').click();
      await h.sleep(120);
      window.prompt = origPrompt;
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
      const origPrompt = window.prompt;
      window.prompt = () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
      await h.clickButton('v2-btn-image');
      window.prompt = origPrompt;
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

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.pdfFidelity = cases;
})();
