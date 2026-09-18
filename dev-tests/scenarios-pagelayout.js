// Marges de page (onglet Réglages, js/page-layout.js) et largeur de colonne en mm (zone 2-colonnes, js/editor-nodes.js).
//
// Ces deux réglages ont la particularité de traverser TOUS les étages du produit : l'aperçu A4 (CSS), la pagination affichée (js/header-footer-preview.js
// et js/reader-mode.js, deux moteurs distincts), l'export PDF (js/pdf-export.js) et l'export DOCX (js/docx-export.js). Chaque étage a longtemps eu sa
// propre copie de "la marge vaut 28pt" / "la largeur de contenu vaut 719px" - les scénarios ci-dessous vérifient donc systématiquement qu'un même réglage
// donne le MÊME résultat aux 4 endroits, pas seulement qu'il est pris en compte quelque part.
window.EditorTestSuites = window.EditorTestSuites || {};
window.EditorTestSuites.pageLayout = (function () {
  const PX_PER_MM = PageLayout.MM_TO_PX;
  const DEFAULT_MARGINS = { top: PageLayout.DEFAULT_MARGIN_MM, right: PageLayout.DEFAULT_MARGIN_MM, bottom: PageLayout.DEFAULT_MARGIN_MM, left: PageLayout.DEFAULT_MARGIN_MM };
  const EMPTY_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };

  function mmOf(px) { return px / PX_PER_MM; }
  function near(a, b, tol) { return Math.abs(a - b) <= tol; }

  // Toute mesure de marge/colonne n'a de sens qu'en Aperçu A4 : hors de ce mode, .tiptap n'a ni la largeur d'une page ni le padding des marges.
  async function setupA4(h, margins) {
    await h.resetEditor();
    h.setA4Preview(true);
    PageLayout.setMarginsMm(margins || DEFAULT_MARGINS);
    await h.sleep(120);
  }

  // Les deux colonnes d'une zone 2-colonnes, en mm, telles que le navigateur les rend réellement.
  function columnWidthsMm(root) {
    return Array.from((root || h_tiptap()).querySelectorAll('.two-columns-column')).map(c => mmOf(c.getBoundingClientRect().width));
  }
  function h_tiptap() { return document.querySelector('.tiptap'); }

  const TWO_COL_HTML = leftMm => '<p>Repere avant</p>'
    + '<div class="two-columns-zone" style="--layout-left: ' + leftMm + 'mm; --layout-left-mm: ' + leftMm + 'mm">'
    + '<div class="two-columns-column"><p>GAUCHE</p></div><div class="two-columns-column"><p>DROITE</p></div></div>';

  async function docxXml(html, marginsTwip) {
    await PdfExport.ensurePdfLibsLoaded(); // JSZip fait partie du même lot (cf. js/main.js:onExportDocxBatch)
    const res = await DocxExport.getDocxBlobForRecord(html, null, {}, '', EMPTY_HF, marginsTwip);
    const zip = await JSZip.loadAsync(await res.blob.arrayBuffer());
    return zip.file('word/document.xml').async('string');
  }

  return [
    {
      id: 'margins_preview_padding',
      description: 'Les 4 marges du modèle deviennent le padding de la page, à l\'identique en édition et en lecture',
      async run(h) {
        await setupA4(h, { top: 30, right: 25, bottom: 20, left: 35 });
        Editor.setHTML('<p>Texte</p>');
        await h.sleep(200);
        await h.renderReaderMode('<p>Texte</p>', EMPTY_HF);
        await h.sleep(200);
        const ed = getComputedStyle(h.tiptap());
        const rd = getComputedStyle(document.querySelector('.reader-content'));
        const got = { top: mmOf(parseFloat(ed.paddingTop)), right: mmOf(parseFloat(ed.paddingRight)), bottom: mmOf(parseFloat(ed.paddingBottom)), left: mmOf(parseFloat(ed.paddingLeft)) };
        const okEditor = near(got.top, 30, .2) && near(got.right, 25, .2) && near(got.bottom, 20, .2) && near(got.left, 35, .2);
        const okReader = ed.paddingTop === rd.paddingTop && ed.paddingLeft === rd.paddingLeft && ed.paddingRight === rd.paddingRight && ed.paddingBottom === rd.paddingBottom;
        return { pass: okEditor && okReader, notes: 'editeur=' + JSON.stringify(got) + ' lecture=' + rd.padding };
      },
    },
    {
      id: 'margins_clamped_to_printable_page',
      description: 'Deux marges opposées démesurées ne peuvent pas rendre la largeur de contenu nulle ou négative',
      async run(h) {
        await setupA4(h, DEFAULT_MARGINS);
        PageLayout.setMarginsMm({ top: 200, right: 80, bottom: 200, left: 150 });
        await h.sleep(120);
        const w = PageLayout.getContentWidthMm();
        const hgt = PageLayout.getContentHeightMm();
        const m = PageLayout.getMarginsMm();
        const sidesPositive = m.left > 0 && m.right > 0 && m.top > 0 && m.bottom > 0;
        // Proportion conservée : 150/80 demandés doivent rester dans le même rapport une fois bornés (rabot proportionnel, pas écrasement d'un seul côté).
        const ratioKept = near(m.left / m.right, 150 / 80, .05);
        return {
          pass: near(w, PageLayout.MIN_CONTENT_MM, .01) && near(hgt, PageLayout.MIN_CONTENT_MM, .01) && sidesPositive && ratioKept,
          notes: 'largeur=' + w.toFixed(2) + 'mm hauteur=' + hgt.toFixed(2) + 'mm marges=' + JSON.stringify(m),
        };
      },
    },
    {
      id: 'margins_settings_field_shows_applied_value',
      description: 'Le champ Réglages affiche la marge réellement appliquée, pas la saisie refusée',
      async run(h) {
        await setupA4(h, DEFAULT_MARGINS);
        document.getElementById('v2-btn-settings').click();
        await h.sleep(120);
        const left = document.getElementById('settings-margin-left');
        const right = document.getElementById('settings-margin-right');
        right.value = '80';
        right.dispatchEvent(new Event('input', { bubbles: true }));
        await h.sleep(80);
        left.value = '150';
        left.dispatchEvent(new Event('input', { bubbles: true }));
        await h.sleep(120);
        const applied = PageLayout.getMarginsMm();
        const shown = { left: parseFloat(left.value), right: parseFloat(right.value) };
        document.getElementById('settings-close').click();
        return {
          pass: near(shown.left, Math.round(applied.left * 10) / 10, .05) && near(shown.right, Math.round(applied.right * 10) / 10, .05) && shown.left < 150,
          notes: 'affiche=' + JSON.stringify(shown) + ' applique=' + JSON.stringify(applied),
        };
      },
    },
    {
      id: 'margins_screen_pagination_follows_margins',
      description: 'Les sauts de page affichés suivent la hauteur de contenu réelle quand les marges haut/bas changent',
      async run(h) {
        const longHtml = Array.from({ length: 90 }, (_, i) => '<p>Ligne ' + i + ' du document de test de pagination.</p>').join('');
        await setupA4(h, DEFAULT_MARGINS);
        Editor.setHTML(longHtml);
        await h.sleep(500);
        Editor.refreshPaginationPreview();
        await h.sleep(300);
        const countBreaks = () => document.querySelectorAll('#editor-container .v2-page-break-line').length;
        const small = countBreaks();
        PageLayout.setMarginsMm({ top: 70, right: 20, bottom: 70, left: 20 });
        Editor.refreshLayout();
        await h.sleep(500);
        const big = countBreaks();
        // 297 - 2×70 = 157mm de hauteur utile contre 277mm : le même texte doit tenir sur strictement plus de pages.
        return { pass: small >= 1 && big > small, notes: 'sauts a 9.9mm=' + small + ', a 70mm=' + big };
      },
    },
    {
      id: 'margins_pdf_page_margins',
      description: 'Les marges du modèle arrivent telles quelles dans le PDF',
      async run(h) {
        await setupA4(h, { top: 30, right: 25, bottom: 20, left: 35 });
        Editor.setHTML('<p>Contenu</p>');
        await h.sleep(200);
        const { docDefinition } = await h.exportPdfContent(Editor.getHTML(), null, PageLayout.getMarginsPt());
        const mm = docDefinition.pageMargins.map(pt => pt / PageLayout.MM_TO_PT); // pdfmake : [gauche, haut, droite, bas]
        const ok = near(mm[0], 35, .05) && near(mm[1], 30, .05) && near(mm[2], 25, .05) && near(mm[3], 20, .05);
        return { pass: ok, notes: 'pageMargins(mm) = ' + mm.map(v => v.toFixed(2)).join(' / ') };
      },
    },
    {
      id: 'margins_docx_page_margins',
      description: 'Les marges du modèle arrivent telles quelles dans le DOCX (w:pgMar)',
      async run(h) {
        await setupA4(h, { top: 30, right: 25, bottom: 20, left: 35 });
        Editor.setHTML('<p>Contenu</p>');
        await h.sleep(200);
        const xml = await docxXml(Editor.getHTML(), PageLayout.getMarginsTwip());
        const m = /<w:pgMar[^>]*w:top="(\d+)"[^>]*w:right="(\d+)"[^>]*w:bottom="(\d+)"[^>]*w:left="(\d+)"/.exec(xml);
        if (!m) return { pass: false, notes: 'w:pgMar introuvable' };
        const mm = [1, 2, 3, 4].map(i => +m[i] / PageLayout.MM_TO_TWIP);
        const ok = near(mm[0], 30, .05) && near(mm[1], 25, .05) && near(mm[2], 20, .05) && near(mm[3], 35, .05);
        return { pass: ok, notes: 'pgMar(mm) haut/droite/bas/gauche = ' + mm.map(v => v.toFixed(2)).join(' / ') };
      },
    },
    {
      id: 'cols_mm_rendered_width_is_exact',
      description: 'Une colonne réglée à 60mm mesure 60mm à l\'écran, pas la largeur amputée du chrome de la zone',
      async run(h) {
        await setupA4(h, { top: 30, right: 25, bottom: 30, left: 35 }); // largeur de contenu = 150mm
        Editor.setHTML(TWO_COL_HTML(60));
        await h.sleep(400);
        const [left, right] = columnWidthsMm(h.tiptap());
        const expectedRight = 150 - 60 - PageLayout.getColumnGapMm();
        return {
          pass: near(left, 60, .5) && near(right, expectedRight, .5),
          notes: 'gauche=' + left.toFixed(2) + 'mm (attendu 60), droite=' + right.toFixed(2) + 'mm (attendu ' + expectedRight.toFixed(2) + ')',
        };
      },
    },
    {
      id: 'cols_mm_survives_margin_change',
      description: 'Changer les marges de page ne déforme pas une colonne réglée en mm, à l\'écran comme dans le HTML sérialisé',
      async run(h) {
        await setupA4(h, DEFAULT_MARGINS);
        Editor.setHTML(TWO_COL_HTML(60));
        await h.sleep(400);
        PageLayout.setMarginsMm({ top: 30, right: 25, bottom: 30, left: 35 });
        Editor.refreshLayout();
        await h.sleep(400);
        const [left] = columnWidthsMm(h.tiptap());
        const html = Editor.getHTML();
        const serialized = /--layout-left-mm:\s*([\d.]+)mm/.exec(html);
        return {
          pass: near(left, 60, .5) && !!serialized && near(+serialized[1], 60, .01),
          notes: 'ecran=' + left.toFixed(2) + 'mm, serialise=' + (serialized ? serialized[1] + 'mm' : 'absent'),
        };
      },
    },
    {
      id: 'cols_mm_editor_matches_reader',
      description: 'Les deux colonnes ont la même largeur en édition et en mode Lecture',
      async run(h) {
        await setupA4(h, { top: 30, right: 25, bottom: 30, left: 35 });
        Editor.setHTML(TWO_COL_HTML(60));
        await h.sleep(400);
        const editorCols = columnWidthsMm(h.tiptap());
        await h.renderReaderMode(Editor.getHTML(), EMPTY_HF);
        await h.sleep(300);
        const readerCols = columnWidthsMm(document.querySelector('.reader-content'));
        const ok = editorCols.length === 2 && readerCols.length === 2
          && near(editorCols[0], readerCols[0], .3) && near(editorCols[1], readerCols[1], .3);
        return { pass: ok, notes: 'editeur=' + editorCols.map(v => v.toFixed(2)) + ' lecture=' + readerCols.map(v => v.toFixed(2)) };
      },
    },
    {
      id: 'cols_mm_pdf_matches_screen',
      description: 'La colonne gauche fait la même largeur dans le PDF qu\'à l\'écran',
      async run(h) {
        await setupA4(h, { top: 30, right: 25, bottom: 30, left: 35 });
        Editor.setHTML(TWO_COL_HTML(60));
        await h.sleep(400);
        const [screenLeft] = columnWidthsMm(h.tiptap());
        const { docDefinition } = await h.exportPdfContent(Editor.getHTML(), null, PageLayout.getMarginsPt());
        const flat = h.flattenPdfContent(docDefinition.content);
        const cols = flat.find(b => b && b.columns && b.columns.length === 2);
        if (!cols) return { pass: false, notes: 'aucun bloc `columns` de 2 colonnes dans le PDF' };
        const pdfLeftMm = cols.columns[0].width / PageLayout.MM_TO_PT;
        return {
          pass: near(pdfLeftMm, 60, 1) && near(pdfLeftMm, screenLeft, 1),
          notes: 'pdf=' + pdfLeftMm.toFixed(2) + 'mm ecran=' + screenLeft.toFixed(2) + 'mm (attendu 60)',
        };
      },
    },
    {
      id: 'cols_mm_docx_matches_screen',
      description: 'Le DOCX réserve la même largeur de colonnes ET la même gouttière que l\'écran',
      async run(h) {
        await setupA4(h, { top: 30, right: 25, bottom: 30, left: 35 });
        Editor.setHTML(TWO_COL_HTML(60));
        await h.sleep(400);
        const screenCols = columnWidthsMm(h.tiptap());
        const xml = await docxXml(Editor.getHTML(), PageLayout.getMarginsTwip());
        const grid = /<w:tblGrid>[\s\S]*?<\/w:tblGrid>/.exec(xml);
        if (!grid) return { pass: false, notes: 'w:tblGrid introuvable' };
        const widthsMm = Array.from(grid[0].matchAll(/w:w="(\d+)"/g)).map(m => +m[1] / PageLayout.MM_TO_TWIP);
        if (widthsMm.length !== 3) return { pass: false, notes: 'attendu 3 colonnes (gauche, gouttière, droite), trouvé ' + widthsMm.length + ' : ' + widthsMm.map(v => v.toFixed(2)) };
        const ok = near(widthsMm[0], 60, .1)
          && near(widthsMm[1], PageLayout.getColumnGapMm(), .1)
          && near(widthsMm[2], screenCols[1], .5);
        return { pass: ok, notes: 'docx=' + widthsMm.map(v => v.toFixed(2)).join(' / ') + ' ecran=' + screenCols.map(v => v.toFixed(2)).join(' / ') };
      },
    },
    {
      id: 'cols_mm_popover_announces_real_widths',
      description: 'Le popover "mm" annonce la largeur droite réellement obtenue',
      async run(h) {
        await setupA4(h, { top: 30, right: 25, bottom: 30, left: 35 });
        Editor.setHTML(TWO_COL_HTML(60));
        await h.sleep(400);
        const btn = document.querySelector('.tiptap .two-columns-mm-button');
        if (!btn) return { pass: false, notes: 'bouton mm absent' };
        btn.click();
        await h.sleep(200);
        const announced = parseFloat(document.querySelector('.two-columns-mm-computed').textContent);
        const leftInput = document.querySelector('.two-columns-mm-popover input');
        const announcedLeft = parseFloat(leftInput.value);
        const realRight = columnWidthsMm(h.tiptap())[1];
        document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        await h.sleep(150);
        return {
          pass: near(announcedLeft, 60, .6) && near(announced, realRight, 1),
          notes: 'annonce gauche=' + announcedLeft + 'mm droite=' + announced + 'mm, reelle droite=' + realRight.toFixed(2) + 'mm',
        };
      },
    },
    {
      id: 'cols_mm_popover_input_not_swallowed_by_editor_keymap',
      description: 'Suppr/Retour arrière dans le champ mm ne sont pas interceptés par le clavier de l\'éditeur',
      async run(h) {
        // Le popover est un enfant DOM de la NodeView (donc DANS .tiptap, l'arbre contentEditable de ProseMirror) : sans stopPropagation() sur son
        // keydown, un appui sur Suppr y remonte jusqu'au gestionnaire de ProseMirror, qui l'intercepte comme une commande d'édition du DOCUMENT
        // (baseKeymap) et appelle preventDefault() - la touche semblait alors "ne rien faire" dans ce simple champ number. Repéré par l'utilisateur.
        await setupA4(h, { top: 30, right: 25, bottom: 30, left: 35 });
        Editor.setHTML(TWO_COL_HTML(60));
        await h.sleep(400);
        const btn = document.querySelector('.tiptap .two-columns-mm-button');
        btn.click();
        await h.sleep(200);
        const input = document.querySelector('.two-columns-mm-popover input');
        input.focus();
        input.select();
        // dispatchEvent renvoie `false` si un des gestionnaires en amont (ici : ProseMirror, si la propagation n'était pas coupée) a appelé
        // preventDefault() - exactement le symptôme observé (la touche semble ignorée), sans dépendre du comportement natif de saisie du navigateur.
        const del = new KeyboardEvent('keydown', { key: 'Delete', code: 'Delete', keyCode: 46, which: 46, bubbles: true, cancelable: true });
        const back = new KeyboardEvent('keydown', { key: 'Backspace', code: 'Backspace', keyCode: 8, which: 8, bubbles: true, cancelable: true });
        const deletePrevented = !input.dispatchEvent(del);
        const backspacePrevented = !input.dispatchEvent(back);
        document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        await h.sleep(150);
        return {
          pass: !deletePrevented && !backspacePrevented,
          notes: 'Suppr intercepte=' + deletePrevented + ', Retour arriere intercepte=' + backspacePrevented,
        };
      },
    },
  ];
})();
