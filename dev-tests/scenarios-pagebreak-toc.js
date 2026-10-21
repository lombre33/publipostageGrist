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

  // Le curseur après le bouton « Saut de page » (choix d'Antoine du 14/10, « Curseur dessous ») : le saut posé est un atome, il restait sélectionné et la frappe qui suivait le REMPLAÇAIT
  // (mesuré à la vraie souris le 14/10 ; Ctrl+Z le rendait). Le curseur est maintenant sur la ligne de dessous, ajoutée quand rien ne suit.
  const BREAK_NODE = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
  // Les blocs du premier niveau : « type » et leur texte, « paragraph:X ».
  const topLevel = () => {
    const blocks = [];
    EditorCore.getEditor().state.doc.forEach(node => blocks.push(node.type.name + (node.textContent ? ':' + node.textContent : '')));
    return blocks;
  };
  // Pose le curseur dans le premier bloc de texte pour lequel `at(node)` rend un décalage (dans le bloc), ou le saut de la position `nodeAt` en sélection de nœud.
  function placeCaret(situation) {
    const editor = EditorCore.getEditor();
    editor.commands.focus();
    if (situation.nodeAt !== undefined) return editor.commands.setNodeSelection(situation.nodeAt);
    let found = null;
    editor.state.doc.descendants((node, pos) => {
      if (found === null && node.isTextblock) { const offset = situation.at(node); if (offset !== null) found = pos + 1 + offset; }
      return found === null;
    });
    return editor.commands.setTextSelection(found);
  }
  const caretState = () => {
    const { selection } = EditorCore.getEditor().state;
    const $from = selection.$from;
    const container = $from.node($from.depth - 1);
    const index = $from.index($from.depth - 1);
    const before = index > 0 ? container.child(index - 1) : null;
    return { isNodeSelection: !!selection.node, empty: selection.empty, inTextblock: $from.parent.isTextblock, offset: $from.parentOffset, afterBreak: !!before && before.type.name === 'pageBreak', breaks: (Editor.getHTML().match(/page-break-marker/g) || []).length };
  };
  const SITUATIONS = [
    { name: 'un document vide', html: '<p></p>', at: node => (node.content.size === 0 ? 0 : null), top: ['pageBreak', 'paragraph:X'] },
    { name: 'la fin d\'un paragraphe', html: '<p>Avant</p>', at: node => (node.textContent === 'Avant' ? 5 : null), top: ['paragraph:Avant', 'pageBreak', 'paragraph:X'] },
    { name: 'une ligne vide sous du texte', html: '<p>Avant</p><p></p>', at: node => (node.content.size === 0 ? 0 : null), top: ['paragraph:Avant', 'pageBreak', 'paragraph:X'] },
    { name: 'une ligne vide entre deux textes', html: '<p>Avant</p><p></p><p>Après</p>', at: node => (node.content.size === 0 ? 0 : null), top: ['paragraph:Avant', 'pageBreak', 'paragraph:XAprès'] },
    { name: 'le milieu d\'un paragraphe (le texte est coupé en deux, le curseur est déjà dessous)', html: '<p>Avant et après</p>', at: () => 6, top: ['paragraph:Avant ', 'pageBreak', 'paragraph:Xet après'] },
    { name: 'la fin d\'un titre', html: '<h1>Un titre</h1>', at: node => (node.type.name === 'heading' ? 8 : null), top: ['heading:Un titre', 'pageBreak', 'paragraph:X'] },
    { name: 'une ligne vide devant un saut de page déjà posé', html: '<p>A</p><p></p>' + BREAK_NODE + '<p>B</p>', at: node => (node.content.size === 0 ? 0 : null), top: ['paragraph:A', 'pageBreak', 'paragraph:X', 'pageBreak', 'paragraph:B'] },
    { name: 'un saut de page déjà sélectionné (le bouton ne le remplace pas par un autre : le curseur passe dessous)', html: '<p>A</p>' + BREAK_NODE + '<p>B</p>', nodeAt: 3, top: ['paragraph:A', 'pageBreak', 'paragraph:XB'] },
  ];

  cases.push({
    id: 'pagebreak_button_puts_the_caret_below_the_break',
    description: 'Le bouton « Saut de page » laisse le curseur sur la ligne de DESSOUS (ajoutée quand rien ne suit), jamais le saut sélectionné : ce que la personne tape ensuite s\'écrit sous le saut au lieu de le remplacer',
    run: async (h) => {
      await h.resetEditor();
      const problems = [];
      const seen = {};
      for (const situation of SITUATIONS) {
        Editor.setHTML(situation.html);
        await h.sleep(60);
        placeCaret(situation);
        await h.sleep(30);
        await h.clickButton('v2-btn-page-break');
        await h.sleep(60);
        const after = caretState();
        const tag = situation.name;
        seen[tag] = { apresLeBouton: after };
        if (after.isNodeSelection) problems.push(tag + ' : le saut reste sélectionné, la frappe suivante le remplacerait');
        if (!after.empty || !after.inTextblock) problems.push(tag + ' : le curseur n\'est pas dans une ligne de texte (' + JSON.stringify(after) + ')');
        if (!after.afterBreak) problems.push(tag + ' : la ligne du curseur ne suit pas directement le saut');
        const breaksBefore = after.breaks;
        EditorCore.getEditor().commands.insertContent('X');
        await h.sleep(30);
        const top = topLevel();
        seen[tag].apresLaFrappe = top;
        if (JSON.stringify(top) !== JSON.stringify(situation.top)) problems.push(tag + ' : après la frappe de « X », le document est ' + JSON.stringify(top) + ' (attendu ' + JSON.stringify(situation.top) + ')');
        if (caretState().breaks !== breaksBefore) problems.push(tag + ' : la frappe a retiré un saut de page (' + breaksBefore + ' avant, ' + caretState().breaks + ' après)');
      }
      return { pass: problems.length === 0, notes: JSON.stringify({ problems, seen }) };
    },
  });

  cases.push({
    id: 'pagebreak_button_is_one_undo_step',
    description: 'Le saut de page et la ligne ajoutée dessous s\'annulent ensemble : un seul Ctrl+Z rend le document tel qu\'il était avant le bouton',
    run: async (h) => {
      await h.resetEditor();
      const problems = [];
      const seen = {};
      for (const situation of SITUATIONS) {
        Editor.setHTML(situation.html);
        await h.sleep(60);
        placeCaret(situation);
        // Plus de 500 ms (newGroupDelay de l'historique) : sans ce délai le bouton se range dans le même pas d'annulation que le document posé à l'instant.
        await h.sleep(600);
        const html = Editor.getHTML();
        await h.clickButton('v2-btn-page-break');
        await h.sleep(60);
        const placed = Editor.getHTML();
        EditorCore.getEditor().commands.undo();
        await h.sleep(30);
        const undone = Editor.getHTML();
        seen[situation.name] = { avant: html, pose: placed !== html, apresUnCtrlZ: undone === html };
        // Un saut déjà sélectionné que le bouton ne fait que dépasser ne change pas le document : rien à annuler.
        if (situation.nodeAt === undefined && placed === html) problems.push(situation.name + ' : le bouton n\'a rien posé');
        if (undone !== html) problems.push(situation.name + ' : un Ctrl+Z ne rend pas le document d\'avant (' + undone + ' au lieu de ' + html + ')');
      }
      return { pass: problems.length === 0, notes: JSON.stringify({ problems, seen }) };
    },
  });

  // Le repère que l'éditeur montre à la place du saut (21/10, « Saut de page » en dur en français dans une interface anglaise) : la vue le dit dans la langue de l'interface, l'enregistrement
  // jamais - un document écrit en anglais est le même HTML qu'écrit en français, et la pagination, la Lecture et les exports retrouvent la même balise.
  cases.push({
    id: 'pagebreak_marker_follows_the_interface_language_but_the_saved_html_does_not',
    description: 'Le repère du saut de page dit « Saut de page » en français et « Page break » en anglais, qu\'il vienne du bouton ou d\'un modèle enregistré en français ; le HTML enregistré garde « Saut de page » dans les deux langues, et le repère reste la balise (classe, contenteditable) que la pagination et la Lecture cherchent',
    run: async (h) => {
      const wasLang = I18n.getLang();
      const wanted = { fr: 'Saut de page', en: 'Page break' };
      const labels = () => Array.from(h.tiptap().querySelectorAll('.page-break-marker')).map(el => el.textContent);
      const problems = [];
      const seen = {};
      try {
        for (const lang of ['fr', 'en']) {
          I18n.setLang(lang);
          await h.resetEditor();
          // Un modèle enregistré en français : son repère porte le texte français dans le HTML.
          Editor.setHTML('<p>Avant</p>' + BREAK_NODE + '<p>Après</p>');
          await h.sleep(80);
          const loaded = labels();
          await h.focusAtEnd();
          await h.clickButton('v2-btn-page-break');
          await h.sleep(80);
          const all = labels();
          const saved = Editor.getHTML();
          const markers = Array.from(h.tiptap().querySelectorAll('.page-break-marker'));
          const savedFrench = (saved.match(/<div class="page-break-marker" contenteditable="false">Saut de page<\/div>/g) || []).length;
          seen[lang] = { loaded, all, savedFrench, savedEnglish: /Page break/.test(saved), tags: markers.map(m => m.tagName + ':' + m.getAttribute('contenteditable')), top: topLevel() };
          if (loaded.length !== 1 || loaded[0] !== wanted[lang]) problems.push(lang + ' : le repère du modèle dit ' + JSON.stringify(loaded) + ' au lieu de « ' + wanted[lang] + ' »');
          if (all.length !== 2 || all.some(text => text !== wanted[lang])) problems.push(lang + ' : les repères disent ' + JSON.stringify(all) + ' au lieu de « ' + wanted[lang] + ' » deux fois');
          if (savedFrench !== 2 || /Page break/.test(saved)) problems.push(lang + ' : le HTML enregistré n\'est pas le même dans les deux langues (' + saved + ')');
          if (markers.some(m => m.tagName !== 'DIV' || m.getAttribute('contenteditable') !== 'false' || m.parentElement !== h.tiptap())) problems.push(lang + ' : le repère n\'est plus un <div contenteditable="false"> du premier niveau');
        }
        return { pass: problems.length === 0, notes: JSON.stringify({ problems, seen }) };
      } finally { I18n.setLang(wasLang); await h.resetEditor(); }
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
      // Du texte derrière le saut, comme dans le cas de la Lecture plus bas : un saut qui TERMINE le document n'ouvre pas de page et ne réserve rien (14/10, « Cacher dans l'éditeur »).
      Editor.setHTML('<p>Une seule ligne courte.</p>' + BREAK_NODE + '<p>Page suivante.</p>');
      await h.sleep(200);
      const marker = h.tiptap().querySelector('.page-break-marker');
      const marginBottom = parseFloat(getComputedStyle(marker).marginBottom) || 0;
      const seam = document.querySelector('.v2-page-band-footer');
      const pass = marginBottom > 400 && !!seam;
      return { pass, notes: 'marginBottom=' + marginBottom + ' seamFound=' + !!seam };
    },
  });

  cases.push({
    id: 'pagebreak_editor_final_break_reserves_no_page',
    description: 'Un saut de page qui termine le document (seul, ou suivi de la ligne vide que pose le bouton) ne réserve rien et n\'ouvre pas de page dans l\'éditeur, comme la Lecture et les exports ; avec du texte derrière lui il réserve de nouveau le reste de la page',
    run: async (h) => {
      await h.resetEditor();
      document.getElementById('editor-container').classList.add('a4-preview');
      Editor.setHeaderFooterData({ enabled: true, differentFirstPage: false, header: { default: '<p>En-tête</p>', first: '' }, footer: { default: '<p>Pied</p>', first: '' } });
      const problems = [];
      const seen = {};
      for (const [name, html, reserves] of [
        ['saut de page seul à la fin', '<p>Une seule ligne courte.</p>' + BREAK_NODE, false],
        ['saut de page + la ligne vide du bouton', '<p>Une seule ligne courte.</p>' + BREAK_NODE + '<p></p>', false],
        ['deux sauts de suite à la fin', '<p>Une seule ligne courte.</p>' + BREAK_NODE + BREAK_NODE, false],
        ['saut de page + texte', '<p>Une seule ligne courte.</p>' + BREAK_NODE + '<p>Page suivante.</p>', true],
      ]) {
        Editor.setHTML(html);
        await h.sleep(250);
        Editor.refreshPaginationPreview();
        await h.sleep(60);
        const marker = h.tiptap().querySelector('.page-break-marker');
        const marginBottom = parseFloat(getComputedStyle(marker).marginBottom) || 0;
        const seams = document.querySelectorAll('#editor-container .v2-pagination-overlay .v2-page-break-line, #editor-container .v2-pagination-overlay .v2-page-seam').length;
        seen[name] = { marginBottom, repères: seams };
        if (reserves && !(marginBottom > 400 && seams === 1)) problems.push(name + ' : le saut doit réserver le reste de la page et ouvrir la page 2 (' + marginBottom + ' px, ' + seams + ' repère(s))');
        if (!reserves && (marginBottom > 100 || seams !== 0)) problems.push(name + ' : le saut ne doit rien réserver ni ouvrir de page (' + marginBottom + ' px, ' + seams + ' repère(s))');
      }
      return { pass: problems.length === 0, notes: JSON.stringify({ problems, seen }) };
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
    // RENDUE du contenu actuel (measureHtmlHeightPx), alors que pdf-export.js réserve TOUJOURS une bande fixe (HF_MAX_ZONE_HEIGHT_PT = PageLayout.HEADER_FOOTER_ZONE_PX,
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
  // (09/10 : cela vaut encore pour une liste ; une zone à deux colonnes, elle, se coupe maintenant où la page finit - js/zone-page-cut.js, suite zonePageCut.)
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

  // Une zone dont moins de la moitié tient sur la page : avant le 09/10 elle passait en entier à la page suivante (la règle ne gardait que le bloc surtout là) ; elle se coupe
  // maintenant où la page finit, colonne par colonne, comme le PDF (js/zone-page-cut.js, demande d'Antoine du 09/10 : une zone n'ouvrait jamais de deuxième page dans l'éditeur).
  cases.push({
    id: 'pagebreak_editor_zone_mostly_beyond_page_is_cut_where_the_page_ends',
    description: 'Une zone dont moins de la moitié tient sur la page est coupée là où la page finit, comme le PDF : ses premières lignes restent sur la page, aucune « Page 2 » ne tombe au-dessus d\'elle',
    run: async (h) => {
      try {
        const zoneProbe = await paginateBigBlock(h, 'zone', lettreImages(), 30);
        // Place restante : 30 % de la hauteur de la zone, donc moins de la moitié.
        const r = await paginateBigBlock(h, 'zone', lettreImages(), zoneProbe.blockPx * 0.7);
        return { pass: r.bandsAbove === 0 && r.bands >= 1, notes: JSON.stringify(r) };
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
    id: 'pagebreak_readmode_zone_mostly_beyond_page_is_cut_where_the_page_ends',
    description: 'En mode Lecture, une zone dont moins de la moitié tient sur la page est coupée là où la page finit, comme le PDF : aucune « Page 2 » ne tombe au-dessus d\'elle',
    run: async (h) => {
      try {
        const zoneProbe = await paginateBigBlockInReader(h, 'zone', lettreImages(), 30);
        const r = await paginateBigBlockInReader(h, 'zone', lettreImages(), zoneProbe.blockPx * 0.7);
        return { pass: r.bandsAbove === 0 && r.bands >= 1, notes: JSON.stringify(r) };
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

  // « Article » dans le sommaire (16/10) : l'aperçu du sommaire de l'éditeur, les titres du PDF et le sommaire du PDF écrivent le même chemin ; le titre 2
  // repart à « a » sous chaque titre 1 (ce que les compteurs CSS de l'éditeur et de la Lecture ne faisaient pas, cf. headingNumberingMouse).
  cases.push({
    id: 'toc_article_numbering_editor_preview_and_pdf',
    description: 'Avec la numérotation « Article », l\'aperçu du sommaire de l\'éditeur, les titres du PDF et le sommaire du PDF portent « Article 1 », « 1.a », « 1.a.1 », puis « Article 2 » repart à « 2.a »',
    run: async (h) => {
      await h.resetEditor();
      Editor.setHTML('<div class="toc-marker"></div><h1>Alpha</h1><h2>Beta</h2><h3>Gamma</h3><h2>Delta</h2><h1>Epsilon</h1><h2>Zeta</h2>');
      await h.sleep(100);
      // Le réglage se pose comme la personne le pose, par le menu des titres : l'aperçu du sommaire se rafraîchit à ce changement du document.
      const numSelect = document.getElementById('v2-heading-numbering-select');
      numSelect.value = 'article';
      numSelect.dispatchEvent(new Event('change', { bubbles: true }));
      await h.sleep(150);
      const wanted = ['Article 1 Alpha', '1.a Beta', '1.a.1 Gamma', '1.b Delta', 'Article 2 Epsilon', '2.a Zeta'];
      const preview = Array.from(h.tiptap().querySelectorAll('.toc-entry-preview')).map(el => el.textContent);
      const result = await h.exportPdfContent(Editor.getHTML(), null);
      const headings = result.content.filter(b => b && b._isHeading).map(b => b._headingText);
      const texts = h.findTextBlocks(result.content).map(b => h.blockPlainText(b));
      // Une fois dans le sommaire, une fois sur le titre lui-même.
      const occurrences = wanted.map(line => texts.filter(t => t === line).length);
      numSelect.value = 'none';
      numSelect.dispatchEvent(new Event('change', { bubbles: true }));
      await h.sleep(60);
      const pass = JSON.stringify(preview) === JSON.stringify(wanted) && JSON.stringify(headings) === JSON.stringify(wanted) && occurrences.every(n => n >= 2);
      return { pass, notes: JSON.stringify({ preview, headings, occurrences }) };
    },
  });

  // L'aperçu du sommaire de l'éditeur à l'ouverture d'un modèle (16/10, carte d'Antoine « Corriger ») : Editor.setHTML pose le style de numérotation sur la racine APRÈS avoir chargé le
  // contenu, et le NodeView du sommaire ne se redessinait que sur un changement du document : l'aperçu gardait la numérotation du modèle précédent (aucun numéro, ou les siens) jusqu'à
  // la première frappe. Ici rien n'est tapé : seul le chargement par Editor.setHTML, comme l'ouverture d'un modèle.
  cases.push({
    id: 'toc_editor_preview_follows_numbering_of_opened_template',
    description: 'À l\'ouverture d\'un modèle, l\'aperçu du sommaire de l\'éditeur porte la numérotation de ce modèle sans rien taper (aucune, « Article », « 1) », puis de nouveau aucune)',
    run: async (h) => {
      await h.resetEditor();
      const docWith = style => (style ? `<div class="heading-numbering-config" data-style="${style}"></div>` : '') + '<div class="toc-marker"></div><h1>Alpha</h1><h2>Beta</h2><h1>Gamma</h1>';
      const previewAfterOpening = async style => {
        Editor.setHTML(docWith(style));
        await h.sleep(120);
        return Array.from(h.tiptap().querySelectorAll('.toc-entry-preview')).map(el => el.textContent);
      };
      const plain = ['Alpha', 'Beta', 'Gamma'];
      const opened = {
        aucune: await previewAfterOpening(null),
        article: await previewAfterOpening('article'),
        numeric: await previewAfterOpening('numeric'),
        deNouveauAucune: await previewAfterOpening(null),
      };
      const wanted = {
        aucune: plain,
        article: ['Article 1 Alpha', '1.a Beta', 'Article 2 Gamma'],
        numeric: ['1) Alpha', 'a) Beta', '2) Gamma'],
        deNouveauAucune: plain,
      };
      const pass = Object.keys(wanted).every(key => JSON.stringify(opened[key]) === JSON.stringify(wanted[key]));
      return { pass, notes: JSON.stringify({ opened, wanted }) };
    },
  });

  // Le titre du sommaire exporté en PDF suit la langue de l'interface (carte d'Antoine du 29/09, « Oui, les deux »). Chemin normal (buildTocStack) et repli
  // (js/pdf-export.js : le bloc garde son titre seul quand buildTocStack échoue) - le repli portait « Sommaire » en dur. Pour atteindre le repli sans toucher au
  // code de l'export, la clé du texte « aucun titre » lève une exception le temps de l'appel : buildTocStack échoue APRÈS avoir lu le titre, le bloc garde le
  // titre du repli.
  ['fr', 'en'].forEach(lang => cases.push({
    id: 'toc_pdf_title_follows_interface_language_' + lang,
    description: 'Le titre du sommaire exporté en PDF (' + lang + ') est celui de la langue de l\'interface, aussi dans le repli du sommaire',
    run: async (h) => {
      const previousLang = I18n.getLang();
      const realT = I18n.t;
      const realWarn = console.warn;
      try {
        I18n.setLang(lang);
        const wanted = lang === 'en' ? 'Table of Contents' : 'Sommaire';
        const other = lang === 'en' ? 'Sommaire' : 'Table of Contents';
        const titles = (result, text) => h.findTextBlocks(result.content, b => h.blockPlainText(b) === text).length;
        const normal = await h.exportPdfContent('<div class="toc-marker"></div><h1>Alpha</h1><p>texte</p>', null);
        I18n.t = (key, vars) => { if (key === 'pdf.tocEmpty') throw new Error('test : texte du sommaire vide indisponible'); return realT.call(I18n, key, vars); };
        console.warn = () => {};
        let fallback;
        try { fallback = await h.exportPdfContent('<div class="toc-marker"></div><p>juste du texte</p>', null); }
        finally { I18n.t = realT; console.warn = realWarn; }
        const counts = { normal: titles(normal, wanted), normalOther: titles(normal, other), fallback: titles(fallback, wanted), fallbackOther: titles(fallback, other) };
        return { pass: counts.normal === 1 && counts.fallback === 1 && counts.normalOther === 0 && counts.fallbackOther === 0, notes: JSON.stringify(counts) };
      } finally { I18n.t = realT; console.warn = realWarn; I18n.setLang(previousLang); }
    },
  }));

  // --- Les lignes d'un sommaire sont des liens (js/toc-links.js) : l'aperçu de l'éditeur, la Lecture, le PDF ---
  // Un document assez long pour que les titres soient hors de l'écran au départ.
  const FILLER = n => Array.from({ length: n }, (_, i) => `<p>Ligne ${i + 1} qui allonge le document.</p>`).join('');
  // Le dernier titre est suivi d'assez de texte pour que la zone puisse défiler jusqu'à lui (elle s'arrête là où le document finit).
  const LONG_DOC = '<div class="toc-marker"></div><h1>Alpha</h1>' + FILLER(40) + '<h2>Beta</h2>' + FILLER(40) + '<h1>Gamma</h1>' + FILLER(70);
  // Où un titre se pose dans la zone qui défile : sa distance au bord haut de la zone, mesurée à l'écran (js/toc-links.js garde 12 px).
  const offsetIn = (heading, scroller) => heading.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
  const clickLink = link => link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  const caretBlock = () => { const { $from } = EditorCore.getEditor().state.selection; return $from.parent.type.name + ':' + $from.parent.textContent; };

  cases.push({
    id: 'toc_editor_lines_are_links_that_bring_the_heading_to_the_top',
    description: 'Dans l\'éditeur, chaque ligne de l\'aperçu du sommaire est un lien : son texte reste celui de la ligne, il garde la couleur du sommaire (pas le bleu des liens), et un clic amène le titre en haut de la zone visible et y met le curseur',
    run: async (h) => {
      await h.resetEditor();
      Editor.setHTML(LONG_DOC);
      await h.sleep(250);
      const scroller = document.getElementById('editor-container');
      const lines = Array.from(h.tiptap().querySelectorAll('.toc-entry-preview'));
      const links = lines.map(line => line.querySelector('a.toc-link'));
      const headings = Array.from(h.tiptap().querySelectorAll(':scope > h1, :scope > h2'));
      const style = links[0] ? getComputedStyle(links[0]) : null;
      const looks = style && { notBlue: style.color !== 'rgb(5, 99, 193)' && style.color === getComputedStyle(lines[0]).color, noUnderline: style.textDecorationLine === 'none', pointer: style.cursor === 'pointer' };
      const canScroll = scroller.scrollHeight > scroller.clientHeight + 500;
      const texts = lines.map(line => line.textContent);
      clickLink(links[2]);
      await h.sleep(150);
      const gamma = { offset: offsetIn(headings[2], scroller), caret: caretBlock(), noBlockSelected: !EditorCore.getEditor().state.selection.node };
      clickLink(links[1]);
      await h.sleep(150);
      const beta = { offset: offsetIn(headings[1], scroller), caret: caretBlock() };
      clickLink(links[0]);
      await h.sleep(150);
      const alpha = { offset: offsetIn(headings[0], scroller), caret: caretBlock(), scrollTop: scroller.scrollTop };
      const pass = lines.length === 3 && links.every(Boolean) && JSON.stringify(texts) === JSON.stringify(['Alpha', 'Beta', 'Gamma']) && canScroll
        && looks && looks.notBlue && looks.noUnderline && looks.pointer
        && Math.abs(gamma.offset - 12) < 3 && gamma.caret === 'heading:Gamma' && gamma.noBlockSelected
        && Math.abs(beta.offset - 12) < 3 && beta.caret === 'heading:Beta'
        && alpha.caret === 'heading:Alpha' && Math.abs(alpha.offset - 12) < 3;
      return { pass, notes: JSON.stringify({ texts, canScroll, looks, gamma, beta, alpha }) };
    },
  });

  cases.push({
    id: 'toc_editor_link_follows_the_heading_when_numbering_and_text_change',
    description: 'La ligne du sommaire cherche son titre à chaque clic : avec la numérotation « Article » (la ligne dit « Article 2 Gamma ») et après un titre ajouté devant, elle mène toujours au titre qu\'elle nomme',
    run: async (h) => {
      await h.resetEditor();
      Editor.setHTML(LONG_DOC);
      await h.sleep(250);
      const numSelect = document.getElementById('v2-heading-numbering-select');
      numSelect.value = 'article';
      numSelect.dispatchEvent(new Event('change', { bubbles: true }));
      await h.sleep(200);
      const scroller = document.getElementById('editor-container');
      const lineTexts = () => Array.from(h.tiptap().querySelectorAll('.toc-entry-preview')).map(line => line.textContent);
      const before = lineTexts();
      clickLink(h.tiptap().querySelectorAll('.toc-entry-preview a.toc-link')[2]);
      await h.sleep(150);
      const onNumbered = caretBlock();
      // Un titre de plus au début du document : toutes les lignes se redessinent, la dernière mène toujours à « Gamma ».
      Editor.setHTML('<div class="toc-marker"></div><h1>Nouveau</h1>' + LONG_DOC.replace('<div class="toc-marker"></div>', ''));
      await h.sleep(250);
      const after = lineTexts();
      const links = Array.from(h.tiptap().querySelectorAll('.toc-entry-preview a.toc-link'));
      clickLink(links[links.length - 1]);
      await h.sleep(150);
      const lastHeading = Array.from(h.tiptap().querySelectorAll(':scope > h1, :scope > h2')).pop();
      const onLast = { caret: caretBlock(), offset: offsetIn(lastHeading, scroller) };
      numSelect.value = 'none';
      numSelect.dispatchEvent(new Event('change', { bubbles: true }));
      await h.sleep(60);
      const pass = before.join('|') === 'Article 1 Alpha|1.a Beta|Article 2 Gamma' && onNumbered === 'heading:Gamma'
        && after.length === 4 && onLast.caret === 'heading:Gamma' && Math.abs(onLast.offset - 12) < 3;
      return { pass, notes: JSON.stringify({ before, onNumbered, after, onLast }) };
    },
  });

  cases.push({
    id: 'toc_reader_lines_are_links_reachable_by_keyboard',
    description: 'En Lecture, chaque ligne du sommaire est un lien (texte et classes de la ligne inchangés) : un clic, ou Entrée et Espace au clavier, amène le titre en haut de la zone de lecture ; une autre touche ne fait rien',
    run: async (h) => {
      await h.resetEditor();
      h.setA4Preview(true);
      try {
        await h.renderReaderMode(LONG_DOC, null);
        await h.sleep(300);
        const scroller = document.getElementById('reader-container');
        const lines = Array.from(document.querySelectorAll('#reader-container .reader-content .toc-entry'));
        const links = lines.map(line => line.querySelector('a.toc-link'));
        const headings = Array.from(document.querySelectorAll('#reader-container .reader-content > h1, #reader-container .reader-content > h2'));
        const shape = lines.map(line => line.className + '=' + line.textContent);
        const style = links[0] ? getComputedStyle(links[0]) : null;
        const looks = style && { sameColorAsLine: style.color === getComputedStyle(lines[0]).color, noUnderline: style.textDecorationLine === 'none', pointer: style.cursor === 'pointer' };
        const tabbable = links.every(a => a && a.tabIndex === 0 && a.getAttribute('role') === 'link');
        const canScroll = scroller.scrollHeight > scroller.clientHeight + 500;
        clickLink(links[2]);
        await h.sleep(150);
        const byClick = offsetIn(headings[2], scroller);
        const press = (link, key) => link.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
        links[1].focus();
        press(links[1], 'Enter');
        await h.sleep(150);
        const byEnter = offsetIn(headings[1], scroller);
        // Le focus d'un lien le fait apparaître à l'écran (le navigateur défile de lui-même) : le défilement se relève une fois le focus posé.
        links[2].focus();
        await h.sleep(100);
        const topBefore = scroller.scrollTop;
        press(links[2], 'a');
        await h.sleep(100);
        const otherKeyMoved = scroller.scrollTop !== topBefore;
        links[0].focus();
        press(links[0], ' ');
        await h.sleep(150);
        const bySpace = offsetIn(headings[0], scroller);
        const pass = lines.length === 3 && links.every(Boolean) && JSON.stringify(shape) === JSON.stringify(['toc-entry toc-level-1=Alpha', 'toc-entry toc-level-2=Beta', 'toc-entry toc-level-1=Gamma'])
          && looks && looks.sameColorAsLine && looks.noUnderline && looks.pointer && tabbable && canScroll
          && Math.abs(byClick - 12) < 3 && Math.abs(byEnter - 12) < 3 && !otherKeyMoved && Math.abs(bySpace - 12) < 3;
        return { pass, notes: JSON.stringify({ shape, looks, tabbable, canScroll, byClick, byEnter, otherKeyMoved, bySpace }) };
      } finally {
        h.setA4Preview(false);
        document.getElementById('editor-container').style.display = '';
        document.getElementById('reader-container').style.display = '';
        document.getElementById('btn-mode-edit').click();
        await h.sleep(60);
      }
    },
  });

  // Le PDF : trois pages, un titre par page ou deux (Beta et Gamma partagent la deuxième). Les mots d'un titre sont chacun un morceau de texte pour pdf.js : des titres d'un mot.
  const PDF_BREAK = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
  const PDF_DOC = '<div class="toc-marker"></div><h1>Alpha</h1><p>Texte un.</p>' + PDF_BREAK + '<h1>Beta</h1><h2>Gamma</h2><p>Texte deux.</p>' + PDF_BREAK + '<h1>Delta</h1><p>Fin.</p>';
  const PDF_HEADINGS = [['Alpha', 1], ['Beta', 2], ['Gamma', 2], ['Delta', 3]];

  cases.push({
    id: 'toc_pdf_lines_link_to_their_heading',
    description: 'Dans le PDF, le texte et le numéro de page de chaque ligne du sommaire sont des liens qui mènent au haut de leur titre, sur la page où il est peint (lu dans les octets du PDF : une destination par titre, deux liens par ligne)',
    run: async (h) => {
      await h.resetEditor();
      const result = await h.exportPdfContent(PDF_DOC, null);
      const links = await h.extractPdfLinks(result.base64);
      const truth = await h.extractPdfGroundTruth(result.base64);
      const all = links.pages.flatMap((p, i) => p.links.map(l => Object.assign({ on: i + 1 }, l)));
      const items = (page, str) => truth.pages[page - 1].textItems.filter(it => it.str === str);
      const perHeading = PDF_HEADINGS.map(([text, page]) => {
        // Les liens qui mènent à ce titre : sur sa page, juste au-dessus de la ligne où le titre est peint (le haut du lieu visé précède la ligne de base de moins de 40 pt).
        const toIt = all.filter(l => l.page === page && items(page, text).some(it => it.y - l.top > 0 && it.y - l.top < 40));
        const onText = toIt.filter(l => items(1, text).some(it => it.y >= l.y - 1 && it.y <= l.y + l.height + 1 && it.x >= l.x - 1 && it.x <= l.x + l.width));
        const onNumber = toIt.filter(l => items(1, String(page)).some(it => it.y >= l.y - 1 && it.y <= l.y + l.height + 1 && it.x >= l.x - 1 && it.x <= l.x + l.width));
        return { text, page, links: toIt.length, onText: onText.length, onNumber: onNumber.length, oneName: new Set(toIt.map(l => l.name)).size === 1 };
      });
      const pass = links.pages.length === 3 && all.length === 2 * PDF_HEADINGS.length && all.every(l => l.on === 1) && links.destinations.length === PDF_HEADINGS.length
        && new Set(all.map(l => l.name)).size === PDF_HEADINGS.length
        && perHeading.every(p => p.links === 2 && p.onText === 1 && p.onNumber === 1 && p.oneName);
      return { pass, notes: JSON.stringify({ pages: links.pages.length, links: all.length, destinations: links.destinations, perHeading }) };
    },
  });

  cases.push({
    id: 'toc_pdf_without_a_toc_writes_no_destination',
    description: 'Sans sommaire, le PDF n\'écrit aucune destination ni aucun lien : rien de plus à porter dans un long document',
    run: async (h) => {
      await h.resetEditor();
      const result = await h.exportPdfContent('<h1>Alpha</h1><p>Texte.</p>' + PDF_BREAK + '<h1>Beta</h1><p>Texte.</p>', null);
      const links = await h.extractPdfLinks(result.base64);
      const ids = JSON.stringify(result.content, (key, value) => (key === 'positions' || key.charAt(0) === '_' ? undefined : value)).match(/"id":"pp-h-/g) || [];
      const pass = links.pages.length === 2 && links.destinations.length === 0 && links.pages.every(p => p.links.length === 0) && ids.length === 0;
      return { pass, notes: JSON.stringify({ pages: links.pages.length, destinations: links.destinations, ids: ids.length }) };
    },
  });

  cases.push({
    id: 'toc_pdf_two_tocs_share_one_destination_per_heading',
    description: 'Deux sommaires dans un même document : l\'export ne se plaint pas d\'un nom déjà pris (pdfmake refuse deux `id` égaux), chaque titre a UNE destination et les quatre lignes y mènent',
    run: async (h) => {
      await h.resetEditor();
      const result = await h.exportPdfContent('<div class="toc-marker"></div><h1>Alpha</h1><p>Texte.</p><div class="toc-marker"></div><h1>Beta</h1><p>Texte.</p>', null);
      const links = await h.extractPdfLinks(result.base64);
      const all = links.pages.flatMap(p => p.links);
      const names = new Set(all.map(l => l.name));
      // Deux sommaires de deux lignes, deux liens par ligne.
      const pass = links.destinations.length === 2 && names.size === 2 && all.length === 8 && Array.from(names).every(n => links.destinations.includes(n));
      return { pass, notes: JSON.stringify({ destinations: links.destinations, names: Array.from(names), links: all.length }) };
    },
  });

  cases.push({
    id: 'toc_pdf_link_text_with_a_character_the_font_lacks_still_links',
    description: 'Une ligne du sommaire dont le titre porte un caractère que la police du texte n\'a pas (repli de police, le texte se coupe en plusieurs passages) reste un lien en entier',
    run: async (h) => {
      await h.resetEditor();
      const result = await h.exportPdfContent('<div class="toc-marker"></div><h1>Écho ☑ final</h1><p>Texte.</p>', null);
      const links = await h.extractPdfLinks(result.base64);
      const all = links.pages.flatMap(p => p.links);
      const spans = all.filter(l => l.page === 1 && l.top != null);
      // Chaque passage du titre (« Écho », la case, « final ») et le numéro de page portent le lien : au moins quatre rectangles, tous vers la même destination.
      const pass = spans.length >= 4 && new Set(spans.map(l => l.name)).size === 1 && links.destinations.length === 1;
      return { pass, notes: JSON.stringify({ links: spans.length, destinations: links.destinations }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.pageBreakToc = cases;
})();
