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

  // --- Pagination de l'aperçu : un bloc que l'export coupe reste sur sa page quand sa plus grande partie y tient ---
  // Antoine (29/09) : deux images en haut de page, sans en-tête, puis une zone 2 colonnes d'à peu près une page. computePageBreaks traite chaque bloc de premier
  // niveau comme insécable ; la zone, une trentaine de pixels trop haute parce que l'éditeur affiche des NOMS de variables (longs, à la ligne dans la colonne
  // étroite) là où Lecture et l'export mettent des valeurs, sautait en entier en page 2 et laissait la page 1 aux seules images. Le paragraphe vide que l'éditeur
  // ajoute derrière un bloc (zone, tableau, image) partait lui aussi seul en « Page 2 ». Aucun commit de main n'a changé cette mise en page (mesuré sur les 69).
  const A4_HEIGHT_PX = 841.89 * 96 / 72;
  const sheetZoom = () => {
    const sheet = document.querySelector('#editor-container .v2-page-sheet');
    const z = sheet ? parseFloat(getComputedStyle(sheet).zoom) : NaN;
    return (isFinite(z) && z > 0) ? z : 1;
  };
  const layoutHeight = el => el.getBoundingClientRect().height / sheetZoom();
  const tinyPng = (w, hgt, color) => {
    const c = document.createElement('canvas'); c.width = w; c.height = hgt;
    const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, w, hgt);
    return c.toDataURL('image/png');
  };
  // Les deux images d'Antoine, mêmes attributs et mêmes tailles d'affichage (228 px de large en ligne ; 71 px en calque derrière le texte), mais des PNG minuscules
  // de même rapport (1280x448 et 377x370) : la hauteur rendue ne dépend que du rapport et de la largeur.
  const lettreImages = () => '<p><img class="editor-image" draggable="false" src="' + tinyPng(20, 7, '#3a3a3a') + '" alt="Image" style="width: 228px;" data-layer="normal" data-wrap="inline">'
    + '<img class="editor-image" draggable="false" src="' + tinyPng(38, 37, '#2f6fed') + '" alt="Image" style="width: 71px; position: absolute; left: 674px; top: 34px; z-index: -1;" data-layer="behind" data-wrap="inline" data-align="right" data-page-index="0" data-page-left-pt="477.5" data-page-top-pt="-2.5"></p><p></p>';
  const emptyLines = n => Array.from({ length: n }, () => '<p></p>').join('');
  const bigZoneHtml = lines => '<div class="two-columns-zone" style="--layout-left: 26%;"><div class="two-columns-column"><p><strong>Vice-présidence</strong></p>' + emptyLines(lines) + '<p>Adresse postale</p></div>'
    + '<div class="two-columns-column"><p style="text-align: right;">Madame, Monsieur,</p>' + emptyLines(Math.round(lines / 2)) + '</div></div>';
  const bigTableHtml = rows => '<table><tbody>' + Array.from({ length: rows }, (_, i) => '<tr><td><p>Ligne ' + i + '</p></td><td><p>Valeur</p></td></tr>').join('') + '</tbody></table>';
  const bigListHtml = items => '<ul>' + Array.from({ length: items }, (_, i) => '<li><p>Élément ' + i + '</p></li>').join('') + '</ul>';
  // Règle la hauteur utile d'une page (marges haut/bas seulement : les marges latérales, donc la largeur et la hauteur des blocs, ne bougent pas).
  function setPageContentHeight(contentPx) {
    const halfMm = (A4_HEIGHT_PX - contentPx) / 2 / PageLayout.MM_TO_PX;
    PageLayout.setMarginsMm({ top: halfMm, bottom: halfMm, left: PageLayout.DEFAULT_MARGIN_MM, right: PageLayout.DEFAULT_MARGIN_MM });
  }
  const BIG_BLOCKS = {
    zone: { html: bigZoneHtml(40), pick: k => k.classList.contains('two-columns-zone-outer') },
    table: { html: bigTableHtml(30), pick: k => k.classList.contains('tableWrapper') },
    list: { html: bigListHtml(38), pick: k => k.tagName === 'UL' },
  };
  // Charge `prelude` + un gros bloc, puis règle la page pour qu'il déborde de `overshootPx` (négatif : marge de reste). Renvoie ce qu'il faut pour juger.
  async function paginateBigBlock(h, kind, prelude, overshootPx) {
    await h.resetEditor();
    h.setA4Preview(true);
    PageLayout.setMarginsMm(null);
    const block = BIG_BLOCKS[kind];
    Editor.setHTML(prelude + block.html);
    await h.sleep(500);
    const kids = () => Array.from(h.tiptap().children);
    const target = kids().find(block.pick);
    const before = kids().slice(0, kids().indexOf(target)).reduce((sum, k) => sum + layoutHeight(k), 0);
    const blockPx = layoutHeight(target);
    setPageContentHeight(before + blockPx - overshootPx);
    Editor.refreshPaginationPreview();
    await h.sleep(350);
    const targetTop = target.getBoundingClientRect().top;
    const bands = Array.from(document.querySelectorAll('#editor-container .v2-page-band'));
    return { before, blockPx, room: blockPx - overshootPx, bandsAbove: bands.filter(b => b.getBoundingClientRect().top < targetTop).length, bands: bands.length };
  }
  const restoreMargins = () => PageLayout.setMarginsMm(null);

  cases.push({
    id: 'pagebreak_editor_big_zone_after_images_no_phantom_first_page',
    description: 'Deux images en haut de page puis une zone 2 colonnes d\'une page, ~30 px trop haute : la zone reste en page 1, pas de « Page 2 » entre les images et elle',
    run: async (h) => {
      try {
        const r = await paginateBigBlock(h, 'zone', lettreImages(), 30);
        return { pass: r.bandsAbove === 0 && r.blockPx > r.room, notes: JSON.stringify(r) };
      } finally { restoreMargins(); }
    },
  });

  cases.push({
    id: 'pagebreak_editor_table_and_list_follow_the_same_rule',
    description: 'Un tableau ou une liste qui déborde de peu de la page ne saute pas non plus en entier vers la page suivante',
    run: async (h) => {
      try {
        const prelude = '<p>Titre du document</p><p></p>';
        const table = await paginateBigBlock(h, 'table', prelude, 30);
        const list = await paginateBigBlock(h, 'list', prelude, 30);
        return { pass: table.bandsAbove === 0 && list.bandsAbove === 0 && table.blockPx > table.room && list.blockPx > list.room, notes: JSON.stringify({ table, list }) };
      } finally { restoreMargins(); }
    },
  });

  cases.push({
    id: 'pagebreak_editor_block_mostly_beyond_page_still_moves_whole',
    description: 'Un gros bloc dont moins de la moitié tient sur la page passe toujours en entier à la page suivante (la règle ne garde que le bloc qui est surtout là)',
    run: async (h) => {
      try {
        const zoneProbe = await paginateBigBlock(h, 'zone', lettreImages(), 30);
        // Place restante : 30 % de la hauteur de la zone, donc moins de la moitié.
        const r = await paginateBigBlock(h, 'zone', lettreImages(), zoneProbe.blockPx * 0.7);
        return { pass: r.bandsAbove === 1, notes: JSON.stringify(r) };
      } finally { restoreMargins(); }
    },
  });

  cases.push({
    id: 'pagebreak_editor_trailing_empty_paragraph_makes_no_page',
    description: 'Le paragraphe vide que l\'éditeur ajoute derrière le dernier bloc ne crée pas à lui seul une « Page 2 » quand il ne reste que quelques pixels',
    run: async (h) => {
      try {
        await h.resetEditor();
        h.setA4Preview(true);
        PageLayout.setMarginsMm(null);
        // Un tableau en dernier : l'éditeur y ajoute un <p></p> vide (nœud de fin), que rien d'autre ne suit.
        Editor.setHTML(Array.from({ length: 20 }, (_, i) => '<p>Ligne ' + i + '</p>').join('') + bigTableHtml(3));
        await h.sleep(400);
        const kids = Array.from(h.tiptap().children);
        const last = kids[kids.length - 1];
        const trailingIsBlank = last.tagName === 'P' && !last.textContent.trim();
        const contentPx = kids.slice(0, -1).reduce((sum, k) => sum + layoutHeight(k), 0);
        // 6 px de reste : moins qu'une ligne (~20 px), donc le paragraphe final ne tient pas.
        setPageContentHeight(contentPx + 6);
        Editor.refreshPaginationPreview();
        await h.sleep(350);
        const bands = document.querySelectorAll('#editor-container .v2-page-band').length;
        return { pass: trailingIsBlank && layoutHeight(last) > 6 && bands === 0, notes: JSON.stringify({ trailingIsBlank, contentPx, bands }) };
      } finally { restoreMargins(); }
    },
  });

  // --- Même règle dans le mode Lecture (Antoine, 29/09 : « Oui, aussi en Lecture ») ---
  // computePageBreakOffsets (js/reader-mode.js) est la copie locale de computePageBreaks : elle gardait l'ancienne règle et aurait fait sauter en entier en page suivante
  // une zone, un tableau ou une liste qui déborde de peu dès que les valeurs affichées auraient été plus longues. Le HTML de la Lecture n'a pas l'enveloppe de
  // l'éditeur : `div.two-columns-zone` et `table` directement, sans `.two-columns-zone-outer` ni `.tableWrapper`. Le paragraphe vide final reste, lui, compté en
  // Lecture comme à l'export (ligne vide conservée par keepBlankLines) : seul l'éditeur l'ignore.
  const READER_PICK = {
    zone: k => k.classList.contains('two-columns-zone'),
    table: k => k.tagName === 'TABLE',
    list: k => k.tagName === 'UL',
  };
  const readerLayoutHeight = el => {
    const sheet = el.closest('.reader-content');
    const z = sheet ? parseFloat(getComputedStyle(sheet).zoom) : NaN;
    return el.getBoundingClientRect().height / ((isFinite(z) && z > 0) ? z : 1);
  };
  // Rend le document en Lecture à marges par défaut pour mesurer les blocs, règle la page pour que le bloc déborde de `overshootPx`, rend à nouveau et compte les
  // repères de page posés au-dessus du bloc (0 : il est resté sur sa page ; 1 : il est passé en entier à la page suivante).
  async function paginateBigBlockInReader(h, kind, prelude, overshootPx) {
    await h.resetEditor();
    h.setA4Preview(true);
    PageLayout.setMarginsMm(null);
    const html = prelude + BIG_BLOCKS[kind].html;
    const pick = READER_PICK[kind];
    const blocksOf = wrapper => Array.from(wrapper.children).filter(k => k.tagName !== 'STYLE');
    let wrapper = await h.renderReaderMode(html);
    await h.sleep(250);
    const first = blocksOf(wrapper);
    const target0 = first.find(pick);
    const before = first.slice(0, first.indexOf(target0)).reduce((sum, k) => sum + readerLayoutHeight(k), 0);
    const blockPx = readerLayoutHeight(target0);
    setPageContentHeight(before + blockPx - overshootPx);
    wrapper = await h.renderReaderMode(html);
    await h.sleep(350);
    const target = blocksOf(wrapper).find(pick);
    const targetTop = target.getBoundingClientRect().top;
    const bands = Array.from(document.querySelectorAll('#reader-container .v2-page-band'));
    return { before, blockPx, room: blockPx - overshootPx, bandsAbove: bands.filter(b => b.getBoundingClientRect().top < targetTop).length, bands: bands.length };
  }
  const restoreReader = () => {
    PageLayout.setMarginsMm(null);
    document.getElementById('reader-container').style.display = '';
    document.getElementById('editor-container').style.display = '';
  };

  cases.push({
    id: 'pagebreak_readmode_big_zone_after_images_stays_on_page',
    description: 'En mode Lecture, deux images en haut de page puis une zone 2 colonnes d\'une page, ~30 px trop haute : la zone reste en page 1, pas de « Page 2 » entre les images et elle',
    run: async (h) => {
      try {
        const r = await paginateBigBlockInReader(h, 'zone', lettreImages(), 30);
        return { pass: r.bandsAbove === 0 && r.blockPx > r.room, notes: JSON.stringify(r) };
      } finally { restoreReader(); }
    },
  });

  cases.push({
    id: 'pagebreak_readmode_table_and_list_follow_the_same_rule',
    description: 'En mode Lecture, un tableau ou une liste qui déborde de peu de la page ne saute pas non plus en entier vers la page suivante',
    run: async (h) => {
      try {
        const prelude = '<p>Titre du document</p><p></p>';
        const table = await paginateBigBlockInReader(h, 'table', prelude, 30);
        const list = await paginateBigBlockInReader(h, 'list', prelude, 30);
        return { pass: table.bandsAbove === 0 && list.bandsAbove === 0 && table.blockPx > table.room && list.blockPx > list.room, notes: JSON.stringify({ table, list }) };
      } finally { restoreReader(); }
    },
  });

  cases.push({
    id: 'pagebreak_readmode_block_mostly_beyond_page_still_moves_whole',
    description: 'En mode Lecture, un gros bloc dont moins de la moitié tient sur la page passe toujours en entier à la page suivante',
    run: async (h) => {
      try {
        const zoneProbe = await paginateBigBlockInReader(h, 'zone', lettreImages(), 30);
        const r = await paginateBigBlockInReader(h, 'zone', lettreImages(), zoneProbe.blockPx * 0.7);
        return { pass: r.bandsAbove === 1, notes: JSON.stringify(r) };
      } finally { restoreReader(); }
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
