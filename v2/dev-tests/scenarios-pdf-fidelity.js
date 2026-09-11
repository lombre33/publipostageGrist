// Suite "pdfFidelity" - vérifie des PROPRIÉTÉS PDFMAKE PRÉCISES (pas
// seulement "ça exporte sans planter") : gras/italique/souligné/barré,
// taille de police, alignement, largeurs de colonnes de tableau/2-colonnes,
// position d'une image en calque. Même esprit que dev-tests/formatting-
// fidelity.js (V1), adapté à v2/js/pdf-export.js.
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
    id: 'pdffid_inline_image_position_in_paragraph',
    // Anciennement CASSÉ (cf. BUGS.md, Bug 3) : une image "au coeur du texte"
    // SANS alignement gauche/droite (par défaut, ou centrée) était toujours
    // repoussée en fin de texte de son paragraphe dans le PDF, quelle que
    // soit sa position réelle dans le HTML source (début/milieu/fin de
    // phrase). Corrigé : `blockFrom` (v2/js/pdf-export.js) découpe
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
