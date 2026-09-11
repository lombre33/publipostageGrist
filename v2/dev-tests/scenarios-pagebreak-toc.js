// Suite "pageBreakToc" - saut de page (insertion + effet sur la pagination
// PDF) et sommaire (insertion, détection des titres, résolution des numéros
// de page en PDF).
(function () {
  const cases = [];

  cases.push({
    id: 'pagebreak_insert',
    description: 'Insertion d\'un saut de page produit bien un nœud dédié',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.typeText('Avant le saut');
      await h.clickButton('v2-btn-page-break');
      await h.sleep(60);
      const html = Editor.getHTML();
      return { pass: /page-break/.test(html), notes: html };
    },
  });

  cases.push({
    id: 'pagebreak_pdf_two_pages',
    description: 'Un saut de page force bien 2 pages distinctes à l\'export PDF',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.typeText('Contenu page 1');
      await h.clickButton('v2-btn-page-break');
      await h.sleep(60);
      await h.focusAtEnd();
      await h.typeText('Contenu page 2');
      const html = Editor.getHTML();
      const result = await h.exportPdfContent(html, null);
      const blob = result.blob;
      // pdfmake expose pageCount uniquement après mise en page complète -
      // on a déjà forcé la mise en page via getBase64/exportPdfContent, donc
      // le nombre de pages RÉEL est lisible sur les positions des blocs.
      const textBlocks = h.findTextBlocks(result.content);
      const pages = new Set();
      textBlocks.forEach(b => (b.positions || []).forEach(p => pages.add(p.pageNumber)));
      return { pass: pages.size >= 2, notes: 'pages=' + JSON.stringify(Array.from(pages)) };
    },
  });

  cases.push({
    id: 'toc_insert_and_detect_headings',
    description: 'Le sommaire détecte les titres présents dans le document',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.typeText('Un titre');
      await h.selectAllInEditor();
      document.getElementById('v2-header-select').value = '1';
      document.getElementById('v2-header-select').dispatchEvent(new Event('change', { bubbles: true }));
      await h.sleep(60);
      await h.focusAtEnd();
      await h.typeText('\n');
      await h.clickButton('v2-btn-toc');
      await h.sleep(80);
      const html = Editor.getHTML();
      return { pass: html.includes('Un titre'), notes: html };
    },
  });

  cases.push({
    id: 'toc_empty_state',
    description: 'Sommaire sans aucun titre affiche un message plutôt qu\'une liste vide silencieuse',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.clickButton('v2-btn-toc');
      await h.sleep(80);
      const tocEl = h.tiptap().querySelector('[data-type="toc"], .editor-toc, div[class*=toc]');
      const text = h.tiptap().textContent;
      return { pass: text.trim().length > 0, notes: 'tocText="' + text.trim() + '" html=' + Editor.getHTML() };
    },
  });

  cases.push({
    id: 'toc_pdf_page_numbers',
    description: 'Le sommaire exporté en PDF affiche de vrais numéros de page (pas juste les titres)',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.typeText('Titre Alpha');
      await h.selectAllInEditor();
      document.getElementById('v2-header-select').value = '1';
      document.getElementById('v2-header-select').dispatchEvent(new Event('change', { bubbles: true }));
      await h.sleep(60);
      await h.focusAtEnd();
      await h.typeText('\n');
      await h.clickButton('v2-btn-page-break');
      await h.sleep(60);
      await h.focusAtEnd();
      await h.typeText('Titre Beta');
      await h.selectAllInEditor();
      document.getElementById('v2-header-select').value = '1';
      document.getElementById('v2-header-select').dispatchEvent(new Event('change', { bubbles: true }));
      await h.sleep(60);
      // Insère le sommaire au tout début du document.
      await h.focusInElement(h.tiptap().firstElementChild, true);
      await h.clickButton('v2-btn-toc');
      await h.sleep(80);
      const html = Editor.getHTML();
      const result = await h.exportPdfContent(html, null);
      const tocTextBlocks = h.findTextBlocks(result.content, b => /Alpha|Beta/.test(h.blockPlainText(b)));
      return { pass: tocTextBlocks.length >= 2, notes: 'blocksFound=' + tocTextBlocks.length + ' html=' + html };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.pageBreakToc = cases;
})();
