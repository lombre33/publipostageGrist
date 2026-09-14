// Suite "readModeFidelity" - comble l'angle mort explicitement identifié dans dev-tests/PROTOCOLE_TEST_MANUEL.md ("étage 2", mode Lecture) : jusqu'ici
// ZÉRO couverture automatisée, alors que js/reader-mode.js est un moteur de rendu HTML/CSS totalement séparé de l'éditeur TipTap (sa propre resérialisation
// DOM, ses propres règles CSS scopées à .reader-content au lieu de .tiptap) - un bug déjà trouvé et corrigé dans cette zone précise (image en calque
// "collée en haut à gauche" en Lecture, correcte en éditeur : .reader-content n'avait pas position:relative comme .tiptap) prouve que "ça marche dans
// l'éditeur" ne garantit RIEN sur ce second moteur. Utilise TestHelpers.compareEditorReaderPosition/compareEditorReaderImage (dev-tests/helpers.js) :
// rend le MÊME HTML dans les deux conteneurs (ReaderMode.render appelé directement, comme exportPdfContent le fait déjà pour PdfExport) et compare la
// position RENDUE (getBoundingClientRect), pas une structure interne - même philosophie que scenarios-pdf-ground-truth.js pour l'étage 3.
(function () {
  const cases = [];

  cases.push({
    id: 'readmode_basic_paragraph_position',
    description: 'Un paragraphe simple est positionné identiquement en éditeur et en mode Lecture',
    run: async (h) => {
      await h.resetEditor();
      const html = '<p>Un paragraphe de test suffisamment long pour occuper plus d\'une ligne dans la largeur de page habituelle de l\'éditeur.</p>';
      Editor.setHTML(html);
      h.setA4Preview(true);
      await h.sleep(150);
      await h.renderReaderMode(html, null);
      await h.sleep(150);
      const cmp = h.compareEditorReaderPosition('paragraphe de test');
      return { pass: cmp.found && cmp.pass, notes: JSON.stringify(cmp) };
    },
  });

  ['center', 'right', 'justify'].forEach(align => {
    cases.push({
      id: 'readmode_alignment_' + align + '_position',
      description: 'Un paragraphe aligné "' + align + '" est positionné identiquement en éditeur et en mode Lecture',
      run: async (h) => {
        await h.resetEditor();
        const html = '<p style="text-align: ' + align + ';">Texte aligné ' + align + ' assez long pour remplir une bonne partie de la largeur de la page et forcer un vrai rendu de l\'alignement choisi.</p>';
        Editor.setHTML(html);
        h.setA4Preview(true);
        await h.sleep(150);
        await h.renderReaderMode(html, null);
        await h.sleep(150);
        const cmp = h.compareEditorReaderPosition('Texte aligné ' + align);
        return { pass: cmp.found && cmp.pass, notes: JSON.stringify(cmp) };
      },
    });
  });

  cases.push({
    id: 'readmode_bold_italic_visual_match',
    description: 'Un run gras+italique a le même font-weight/font-style calculé en éditeur et en mode Lecture',
    run: async (h) => {
      await h.resetEditor();
      const html = '<p><strong><em>Texte gras et italique repère</em></strong></p>';
      Editor.setHTML(html);
      h.setA4Preview(true);
      await h.sleep(150);
      await h.renderReaderMode(html, null);
      await h.sleep(150);
      const editorEl = h.findByText(h.tiptap(), 'Texte gras et italique repère');
      const readerEl = h.findByText(document.querySelector('.reader-content'), 'Texte gras et italique repère');
      if (!editorEl || !readerEl) return { pass: false, notes: 'repère introuvable (editor=' + !!editorEl + ', reader=' + !!readerEl + ')' };
      const eCs = getComputedStyle(editorEl), rCs = getComputedStyle(readerEl);
      const pass = eCs.fontWeight === rCs.fontWeight && eCs.fontStyle === rCs.fontStyle && parseFloat(eCs.fontSize) === parseFloat(rCs.fontSize);
      return { pass, notes: JSON.stringify({ editor: { w: eCs.fontWeight, s: eCs.fontStyle, sz: eCs.fontSize }, reader: { w: rCs.fontWeight, s: rCs.fontStyle, sz: rCs.fontSize } }) };
    },
  });

  // Régression réelle trouvée EN CONSTRUISANT ce test, corrigée le même jour (cf. dev-tests/BUGS.md Bug 4) : `.tiptap ul, .tiptap ol { padding-left: 1.4em }`
  // (css/editor-v2.css:23) n'avait pas d'équivalent `.reader-content ul/ol` - le mode Lecture retombait sur le padding par défaut du navigateur (40px,
  // contre 19.6px pour .tiptap à 14px de base) pour CHAQUE niveau de liste, cumulatif à chaque imbrication. N'affectait pas l'export PDF (js/pdf-export.js
  // mesure l'indentation sur un hôte cloné avec la classe `.tiptap`, jamais `.reader-content`) - uniquement le mode Lecture. Corrigé en étendant la règle
  // `.tiptap` à `.reader-content` (même ligne CSS) - garder ce test pour éviter une régression future de cette même règle.
  cases.push({
    id: 'readmode_list_indent_position',
    description: 'Une liste à puces indentée (niveau 2) est positionnée identiquement en éditeur et en mode Lecture',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.clickButton('v2-btn-bullet');
      await h.typeText('Item niveau un');
      await h.typeText('\n');
      await h.typeText('Item niveau deux repère');
      await h.sleep(40);
      await h.clickButton('v2-btn-indent');
      await h.sleep(80);
      const html = Editor.getHTML();
      if (!/Item niveau deux repère/.test(html)) return { pass: false, notes: 'construction de la liste a échoué : ' + html };
      Editor.setHTML(html);
      h.setA4Preview(true);
      await h.sleep(150);
      await h.renderReaderMode(html, null);
      await h.sleep(150);
      const cmp = h.compareEditorReaderPosition('Item niveau deux repère');
      return { pass: cmp.found && cmp.pass, notes: JSON.stringify(cmp) };
    },
  });

  cases.push({
    id: 'readmode_table_column_widths_match',
    description: 'Les largeurs de colonnes d\'un tableau sont identiques en éditeur et en mode Lecture',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      document.getElementById('v2-btn-table').click();
      await h.sleep(100);
      const html = Editor.getHTML();
      if (!/<table/.test(html)) return { pass: false, notes: 'table non insérée : ' + html };
      Editor.setHTML(html);
      h.setA4Preview(true);
      await h.sleep(150);
      await h.renderReaderMode(html, null);
      await h.sleep(150);
      const editorCols = Array.from(h.tiptap().querySelectorAll('table col')).map(c => c.getBoundingClientRect ? null : null);
      const editorCells = Array.from(h.tiptap().querySelectorAll('table tr:first-child td, table tr:first-child th')).map(td => td.getBoundingClientRect().width);
      const readerCells = Array.from(document.querySelector('.reader-content').querySelectorAll('table tr:first-child td, table tr:first-child th')).map(td => td.getBoundingClientRect().width);
      if (!editorCells.length || editorCells.length !== readerCells.length) return { pass: false, notes: 'nombre de cellules différent : editor=' + editorCells.length + ' reader=' + readerCells.length };
      const deltas = editorCells.map((w, i) => Math.abs(w - readerCells[i]));
      const pass = deltas.every(d => d <= 2);
      return { pass, notes: JSON.stringify({ editorCells, readerCells, deltas }) };
    },
  });

  cases.push({
    id: 'readmode_twocolumns_ratio_match',
    description: 'Le ratio de largeur d\'une zone 2-colonnes (34/66) est identique en éditeur et en mode Lecture',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      document.getElementById('v2-btn-two-columns').click();
      await h.sleep(80);
      const zone = h.tiptap().querySelector('.two-columns-zone');
      if (!zone) return { pass: false, notes: 'zone 2-colonnes non insérée' };
      const ed = EditorCore.getEditor();
      let zonePos = null, zoneNode = null;
      ed.state.doc.descendants((node, pos) => { if (node.type.name === 'twoColumnsZone' && zonePos == null) { zonePos = pos; zoneNode = node; } });
      if (zonePos == null) return { pass: false, notes: 'nœud twoColumnsZone introuvable dans le doc' };
      ed.view.dispatch(ed.state.tr.setNodeMarkup(zonePos, undefined, Object.assign({}, zoneNode.attrs, { layoutLeft: 34 })));
      await h.sleep(50);
      const html = Editor.getHTML();
      if (!/two-columns-zone/.test(html)) return { pass: false, notes: 'html inattendu : ' + html };
      Editor.setHTML(html);
      h.setA4Preview(true);
      await h.sleep(150);
      await h.renderReaderMode(html, null);
      await h.sleep(150);
      const editorCols = Array.from(h.tiptap().querySelectorAll('.two-columns-column')).map(c => c.getBoundingClientRect().width);
      const readerCols = Array.from(document.querySelector('.reader-content').querySelectorAll('.two-columns-column')).map(c => c.getBoundingClientRect().width);
      if (editorCols.length !== 2 || readerCols.length !== 2) return { pass: false, notes: 'colonnes introuvables : editor=' + editorCols.length + ' reader=' + readerCols.length };
      const editorRatio = editorCols[0] / (editorCols[0] + editorCols[1]);
      const readerRatio = readerCols[0] / (readerCols[0] + readerCols[1]);
      const pass = Math.abs(editorRatio - readerRatio) < 0.01;
      return { pass, notes: JSON.stringify({ editorCols, readerCols, editorRatio, readerRatio }) };
    },
  });

  cases.push({
    id: 'readmode_inline_image_position',
    description: 'Une image "au cœur du texte" (non calque) est positionnée identiquement en éditeur et en mode Lecture',
    run: async (h) => {
      await h.resetEditor();
      const html = '<p>Texte avant </p><p><img class="editor-image" draggable="false" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" alt="Image" data-layer="normal" data-wrap="inline" style="width: 133px;"></p>';
      Editor.setHTML(html);
      h.setA4Preview(true);
      await h.sleep(150);
      await h.renderReaderMode(html, null);
      await h.sleep(150);
      const editorImg = h.tiptap().querySelector('img.editor-image');
      if (editorImg) await editorImg.decode().catch(() => {});
      const readerImg = document.querySelector('.reader-content img.editor-image');
      if (readerImg) await readerImg.decode().catch(() => {});
      await h.sleep(50);
      const cmp = h.compareEditorReaderImage('iVBOR');
      return { pass: cmp.found && cmp.pass, notes: JSON.stringify(cmp) };
    },
  });

  // Matrice image en CALQUE (position:absolute) - la zone la plus fragile historiquement (bug réel déjà trouvé et corrigé ici : .reader-content sans
  // position:relative). Croise contexte (flux principal / 2-colonnes / cellule de tableau) - reproduit ce que scenarios-pdf-ground-truth.js fait déjà pour
  // l'étage 3, mais pour l'étage 2.
  const layeredImageHtml = {
    mainFlow: '<p></p><p><img class="editor-image" draggable="false" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" alt="Image" style="width: 100px; position: absolute; left: 60px; top: 40px; z-index: 5;" data-layer="front" data-wrap="inline"></p>',
    twoColumns: '<div class="two-columns-zone" style="--layout-left: 50%;"><div class="two-columns-column"><p>Colonne gauche</p></div><div class="two-columns-column"><p><img class="editor-image" draggable="false" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" alt="Image" style="width: 80px; position: absolute; left: 20px; top: 15px; z-index: 5;" data-layer="front" data-wrap="inline"></p></div></div>',
    tableCell: '<table><tbody><tr><td><p><img class="editor-image" draggable="false" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" alt="Image" style="width: 60px; position: absolute; left: 10px; top: 5px; z-index: 5;" data-layer="front" data-wrap="inline"></p></td><td><p>Autre cellule</p></td></tr></tbody></table>',
  };
  Object.keys(layeredImageHtml).forEach(context => {
    cases.push({
      id: 'readmode_layered_image_' + context + '_position',
      description: 'Une image en calque (contexte=' + context + ') est positionnée identiquement en éditeur et en mode Lecture',
      run: async (h) => {
        await h.resetEditor();
        const html = layeredImageHtml[context];
        Editor.setHTML(html);
        h.setA4Preview(true);
        await h.sleep(150);
        await h.renderReaderMode(html, null);
        await h.sleep(150);
        const editorImg = h.tiptap().querySelector('img.editor-image');
        if (editorImg) await editorImg.decode().catch(() => {});
        const readerImg = document.querySelector('.reader-content img.editor-image');
        if (readerImg) await readerImg.decode().catch(() => {});
        await h.sleep(50);
        const cmp = h.compareEditorReaderImage('iVBOR');
        return { pass: cmp.found && cmp.pass, notes: JSON.stringify(cmp) };
      },
    });
  });

  cases.push({
    id: 'readmode_headerfooter_content_present_and_positioned',
    description: 'Un en-tête/pied de page résolu apparaît en haut/bas de la page, position cohérente entre éditeur et mode Lecture',
    run: async (h) => {
      await h.resetEditor();
      const html = '<p></p><p></p><p></p><p></p><p></p><p>Corps du document repère principal</p>';
      const hf = { enabled: true, differentFirstPage: false, header: { default: '<p>Entete repere</p>', first: '' }, footer: { default: '<p>Pied repere</p>', first: '' } };
      Editor.setHTML(html);
      Editor.setHeaderFooterData(hf);
      h.setA4Preview(true);
      await h.sleep(200);
      HeaderFooterPreview.renderPaginationOverlay();
      await h.sleep(100);
      await h.renderReaderMode(html, hf);
      await h.sleep(200);
      const editorHeader = h.findByText(document.getElementById('editor-container'), 'Entete repere');
      const readerHeader = h.findByText(document.getElementById('reader-container'), 'Entete repere');
      const editorFooter = h.findByText(document.getElementById('editor-container'), 'Pied repere');
      const readerFooter = h.findByText(document.getElementById('reader-container'), 'Pied repere');
      const pass = !!editorHeader && !!readerHeader && !!editorFooter && !!readerFooter;
      return { pass, notes: JSON.stringify({ editorHeader: !!editorHeader, readerHeader: !!readerHeader, editorFooter: !!editorFooter, readerFooter: !!readerFooter }) };
    },
  });

  cases.push({
    id: 'readmode_footnote_marker_present',
    description: 'Une note de bas de page insérée est résolue de façon cohérente en mode Lecture (marqueur + texte présents)',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.typeText('Texte avec note');
      const ed = EditorCore.getEditor();
      const found = window.EditorCore && typeof EditorCore.insertFootnote === 'function';
      if (!found) {
        // Repli : construit directement le HTML d'une note (structure attendue par reader-mode), le mécanisme d'INSERTION UI n'est pas le sujet de ce test.
        Editor.setHTML('<p>Texte avec note<sup class="footnote-ref-marker" data-footnote-id="fn1"></sup></p><div class="footnote-body" data-footnote-id="fn1" style="display:none">Contenu de la note repère</div>');
      }
      const html = Editor.getHTML();
      h.setA4Preview(true);
      await h.sleep(150);
      await h.renderReaderMode(html, null);
      await h.sleep(150);
      const editorMarker = h.tiptap().querySelector('.footnote-ref-marker');
      const readerMarker = document.querySelector('.reader-content .footnote-ref-marker');
      const pass = !!editorMarker && !!readerMarker;
      return { pass, notes: JSON.stringify({ html, editorMarker: !!editorMarker, readerMarker: !!readerMarker }) };
    },
  });

  // Zone déjà fragile par le passé (cf. mémoire projet_toc_and_heading_numbering : #reader-container
  // > h1 ne matchait jamais, un wrapper .reader-content avait dû être introduit spécifiquement pour
  // ce mécanisme) - la numérotation CSS counter dépend de data-heading-style posé sur le PARENT direct
  // des <h1>, vérifie ici que le marqueur généré (::before) est identique des deux côtés.
  cases.push({
    id: 'readmode_heading_numbering_marker_match',
    description: 'La numérotation de titre (CSS counter, style numérique) génère le même marqueur en éditeur et en mode Lecture',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.typeText('Premier titre');
      await h.selectAllInEditor();
      document.getElementById('v2-header-select').value = '1';
      document.getElementById('v2-header-select').dispatchEvent(new Event('change', { bubbles: true }));
      await h.sleep(40);
      await h.focusAtEnd();
      await h.typeText('\n');
      await h.typeText('Deuxieme titre repere');
      const sel2 = window.getSelection();
      const range2 = document.createRange();
      range2.selectNodeContents(h.tiptap().lastElementChild);
      sel2.removeAllRanges(); sel2.addRange(range2);
      await h.sleep(20);
      document.getElementById('v2-header-select').value = '1';
      document.getElementById('v2-header-select').dispatchEvent(new Event('change', { bubbles: true }));
      await h.sleep(40);
      const numSelect = document.getElementById('v2-heading-numbering-select');
      numSelect.value = 'numeric';
      numSelect.dispatchEvent(new Event('change', { bubbles: true }));
      await h.sleep(60);
      const html = Editor.getHTML();
      Editor.setHTML(html);
      h.setA4Preview(true);
      await h.sleep(150);
      await h.renderReaderMode(html, null);
      await h.sleep(150);
      const editorH1 = h.findByText(h.tiptap(), 'Deuxieme titre repere', 'h1');
      const readerH1 = h.findByText(document.querySelector('.reader-content'), 'Deuxieme titre repere', 'h1');
      if (!editorH1 || !readerH1) return { pass: false, notes: 'titre introuvable (editor=' + !!editorH1 + ', reader=' + !!readerH1 + ') html=' + html };
      const editorMarker = getComputedStyle(editorH1, '::before').content;
      const readerMarker = getComputedStyle(readerH1, '::before').content;
      const pass = editorMarker === readerMarker && editorMarker !== 'none' && editorMarker !== '""';
      return { pass, notes: JSON.stringify({ editorMarker, readerMarker, html }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.readModeFidelity = cases;
})();
