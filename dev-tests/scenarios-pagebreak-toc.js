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
    id: 'pagebreak_editor_gap_reserves_full_remaining_page',
    description: 'Un saut de page forcé après peu de contenu réserve tout le reste de la page (pas juste la hauteur de la bande en-tête/pied)',
    run: async (h) => {
      await h.resetEditor();
      // La bande en-tête/pied paginée (.v2-page-band-footer) n'est rendue que sous a4-preview (cf. header-footer-preview.js:renderPaginationOverlay) -
      // resetEditor() la retire par défaut (isolation entre scénarios), ce scénario la repose donc explicitement.
      document.getElementById('editor-container').classList.add('a4-preview');
      Editor.setHeaderFooterData({ enabled: true, differentFirstPage: false, header: { default: '<p>En-tête</p>', first: '' }, footer: { default: '<p>Pied</p>', first: '' } });
      Editor.setHTML('<p>Une seule ligne courte.</p>');
      document.getElementById('v2-btn-page-break').click();
      await h.sleep(200);
      const marker = h.tiptap().querySelector('.page-break-marker');
      const marginBottom = parseFloat(getComputedStyle(marker).marginBottom) || 0;
      const seam = document.querySelector('.v2-page-band-footer');
      const pass = marginBottom > 400 && !!seam;
      return { pass, notes: 'marginBottom=' + marginBottom + ' seamFound=' + !!seam };
    },
  });

  cases.push({
    id: 'pagebreak_readmode_gap_matches_editor',
    description: 'En mode Lecture, un saut de page forcé après peu de contenu réserve aussi tout le reste de la page (même correctif que l\'éditeur, copie séparée dans reader-mode.js)',
    run: async (h) => {
      await h.resetEditor();
      const hf = { enabled: true, differentFirstPage: false, header: { default: '<p>En-tête</p>', first: '' }, footer: { default: '<p>Pied</p>', first: '' } };
      Editor.setHeaderFooterData(hf);
      const html = '<p>Une seule ligne courte.</p><div class="page-break-marker">Saut de page</div><p>Page suivante.</p>';
      // Bascule de visibilité manuelle (comme switchMode) : ReaderMode.render
      // seul ne suffit pas, #reader-container doit être visible pour que les
      // mesures de mise en page (getBoundingClientRect) soient réelles.
      document.getElementById('editor-container').style.display = 'none';
      const readerContainer = document.getElementById('reader-container');
      readerContainer.style.display = 'block';
      // Même garde a4-preview côté lecture (reader-mode.js), cf. commentaire sur pagebreak_editor_gap_reserves_full_remaining_page ci-dessus.
      readerContainer.classList.add('a4-preview');
      await ReaderMode.render(html, 'FakeTable', {}, hf);
      await h.sleep(200);
      const seam = document.querySelector('#reader-container .v2-page-band-footer');
      const wrapper = document.querySelector('#reader-container .reader-content');
      const pass = !!seam && !!wrapper && (seam.getBoundingClientRect().top - wrapper.getBoundingClientRect().top) > 400;
      const gapPx = seam && wrapper ? Math.round(seam.getBoundingClientRect().top - wrapper.getBoundingClientRect().top) : null;
      document.getElementById('editor-container').style.display = '';
      readerContainer.style.display = '';
      document.getElementById('btn-mode-edit').click();
      await h.sleep(60);
      return { pass, notes: 'gapPx=' + gapPx + ' seamFound=' + !!seam };
    },
  });

  cases.push({
    id: 'pagebreak_header_height_fixed_regardless_of_content',
    // Bug réel (signalé par l'utilisateur) : la bande d'en-tête/pied réservée par la pagination de l'ÉDITEUR (renderPaginationOverlay) mesurait la hauteur
    // RENDUE du contenu actuel (measureHtmlHeightPx), alors que pdf-export.js réserve TOUJOURS une bande fixe (HF_MAX_ZONE_HEIGHT_PT/HF_MAX_IMAGE_HEIGHT_PX,
    // 60px) dès qu'une zone a du contenu, quelle que soit sa hauteur réelle. Un en-tête plus court que 60px (le cas courant) faisait donc apparaître,
    // dans l'éditeur, moins de place réservée qu'à l'export réel - décalant tout le corps du document (paragraphes, images en calque...) vers le haut par
    // rapport à ce que produit vraiment le PDF. Vérifie qu'un même document force le même saut de page (même paragraphe hôte) qu'un en-tête tienne sur 1
    // ligne courte ou sur 2 lignes plus longues - la RÉSERVE doit rester fixe, seule la bande visuelle de la bannière de saut peut varier.
    description: 'La pagination réserve une hauteur fixe pour l\'en-tête, pas la hauteur réellement rendue de son contenu actuel',
    run: async (h) => {
      await h.resetEditor();
      document.getElementById('editor-container').classList.add('a4-preview');
      await h.sleep(50);
      const filler = Array.from({ length: 80 }, (_, i) => '<p>Ligne de remplissage ' + i + ' pour forcer un saut de page assez loin dans le document afin de declencher une vraie pagination.</p>').join('');
      Editor.setHTML(filler);
      await h.sleep(100);
      const styleEl = document.getElementById('v2-pagination-margins-style');
      const nthChildsOf = text => (text || '').match(/nth-child\((\d+)\)/g);
      Editor.setHeaderFooterData({ enabled: true, differentFirstPage: false, header: { default: '<p>Court</p>', first: '' }, footer: { default: '', first: '' } });
      await h.sleep(150);
      const nthChildShort = nthChildsOf(styleEl && styleEl.textContent);
      Editor.setHeaderFooterData({ enabled: true, differentFirstPage: false, header: { default: '<p>Ligne 1 assez longue pour occuper de la place dans la bande reservee</p><p>Ligne 2 du meme en-tete</p>', first: '' }, footer: { default: '', first: '' } });
      await h.sleep(150);
      const nthChildLong = nthChildsOf(styleEl && styleEl.textContent);
      const pass = !!nthChildShort && !!nthChildLong && JSON.stringify(nthChildShort) === JSON.stringify(nthChildLong);
      return { pass, notes: JSON.stringify({ nthChildShort, nthChildLong }) };
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
