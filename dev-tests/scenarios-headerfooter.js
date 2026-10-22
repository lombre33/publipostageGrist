// Suite "headerFooter" - activation, saisie via setHeaderFooterData (chemin
// direct) ET via le vrai clic sur une zone de marge (chemin UI complet),
// première page différente, formats de numéro de page, persistance du
// contenu par zone/variante, passage du corps à l'en-tête et au pied (suivi
// des modifications allumé, étapes d'annulation, historique de chaque texte).
(function () {
  const cases = [];

  cases.push({
    id: 'hf_set_and_get_roundtrip',
    description: 'setHeaderFooterData puis getHeaderFooterData renvoie exactement les mêmes données',
    run: async (h) => {
      await h.resetEditor();
      const data = { enabled: true, differentFirstPage: false, header: { default: '<p>En-tête</p>', first: '' }, footer: { default: '<p>Pied</p>', first: '' } };
      Editor.setHeaderFooterData(data);
      await h.sleep(60);
      const back = Editor.getHeaderFooterData();
      return { pass: back.header.default.includes('En-tête') && back.footer.default.includes('Pied'), notes: JSON.stringify(back) };
    },
  });

  cases.push({
    id: 'hf_enter_via_real_ui_click',
    description: 'Cliquer une vraie zone de marge entre en mode édition en-tête/pied (chemin UI complet, pas setHeaderFooterData)',
    run: async (h) => {
      await h.resetEditor();
      // Les zones de marge (.v2-hf-zone) ne sont rendues que sous a4-preview (cf. header-footer-preview.js:renderPaginationOverlay) - resetEditor() la
      // retire par défaut (isolation entre scénarios), ce scénario la repose donc explicitement.
      document.getElementById('editor-container').classList.add('a4-preview');
      Editor.setHeaderFooterData({ enabled: true, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } });
      await h.sleep(80);
      const zone = document.querySelector('.v2-hf-zone');
      if (!zone) return { pass: false, notes: 'aucune zone de marge trouvée dans le DOM - a4-preview=' + document.getElementById('editor-container').classList.contains('a4-preview') };
      zone.click();
      await h.sleep(100);
      const pill = document.getElementById('v2-hf-pill');
      return { pass: !!pill && Editor.isEditingHeaderFooter(), notes: 'pillExists=' + !!pill + ' isEditing=' + Editor.isEditingHeaderFooter() };
    },
  });

  cases.push({
    id: 'hf_type_in_zone_persists',
    description: 'Taper du texte en mode en-tête, sortir, revérifier via getHeaderFooterData',
    run: async (h) => {
      await h.resetEditor();
      document.getElementById('editor-container').classList.add('a4-preview'); // cf. commentaire hf_enter_via_real_ui_click
      Editor.setHeaderFooterData({ enabled: true, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } });
      await h.sleep(80);
      const zone = document.querySelector('.v2-hf-zone');
      if (!zone) return { pass: false, notes: 'zone introuvable' };
      zone.click();
      await h.sleep(100);
      await h.focusAtEnd();
      await h.typeText('Texte d\'en-tête réel');
      await h.sleep(60);
      const doneBtn = document.getElementById('v2-hf-btn-done');
      if (doneBtn) doneBtn.click();
      await h.sleep(100);
      const data = Editor.getHeaderFooterData();
      const inHeader = data.header.default.includes('Texte d\'en-tête réel') || data.header.first.includes('Texte d\'en-tête réel');
      return { pass: inHeader, notes: JSON.stringify(data) };
    },
  });

  cases.push({
    id: 'hf_different_first_page',
    description: '"Première page différente" donne bien 2 contenus indépendants (default vs first)',
    run: async (h) => {
      await h.resetEditor();
      Editor.setHeaderFooterData({
        enabled: true, differentFirstPage: true,
        header: { default: '<p>En-tête normal</p>', first: '<p>En-tête première page</p>' },
        footer: { default: '', first: '' },
      });
      await h.sleep(60);
      const data = Editor.getHeaderFooterData();
      return {
        pass: data.header.default.includes('En-tête normal') && data.header.first.includes('En-tête première page') && data.header.default !== data.header.first,
        notes: JSON.stringify(data),
      };
    },
  });

  ['n', 'page-n', 'n-slash-total'].forEach(format => {
    cases.push({
      id: 'hf_page_number_format_' + format,
      description: 'Badge de numéro de page format "' + format + '" inséré via le VRAI bouton toolbar, présent dans le PDF (en-tête)',
      run: async (h) => {
        await h.resetEditor();
        document.getElementById('editor-container').classList.add('a4-preview'); // cf. commentaire hf_enter_via_real_ui_click
        await h.typeText('Corps du document');
        Editor.setHeaderFooterData({ enabled: true, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } });
        await h.sleep(80);
        const zone = document.querySelector('.v2-hf-zone-top, .v2-page-edge-top');
        if (!zone) return { pass: false, notes: 'zone d\'en-tête introuvable' };
        zone.click();
        await h.sleep(100);
        await h.focusAtEnd();
        const flyoutRow = h.openFlyout('#v2-hf-pagenum-group') && document.querySelector('.v2-hover-row[data-pagenum-format="' + format + '"]');
        if (!flyoutRow) return { pass: false, notes: 'ligne de format introuvable dans le flyout' };
        flyoutRow.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        await h.sleep(80);
        const doneBtn = document.getElementById('v2-hf-btn-done');
        if (doneBtn) doneBtn.click();
        await h.sleep(100);
        const html = Editor.getHTML();
        const hfData = Editor.getHeaderFooterData();
        const result = await h.exportPdfContent(html, hfData);
        // L'en-tête/pied vit dans docDefinition.header/footer (une FONCTION
        // (currentPage,pageCount)=>contenu appelée par pdfmake page par page),
        // JAMAIS dans docDefinition.content (réservé au corps) - un premier
        // essai qui cherchait dans result.content ne pouvait donc rien
        // trouver, peu importe si le badge était correctement résolu ou non.
        const headerContent = typeof result.docDefinition.header === 'function' ? result.docDefinition.header(1, 1) : null;
        const textBlocks = h.findTextBlocks(headerContent);
        const found = textBlocks.some(b => {
          const t = h.blockPlainText(b);
          return format === 'n' ? /^1$/.test(t.trim()) : format === 'page-n' ? /Page\s*1/.test(t) : /1\s*\/\s*1/.test(t);
        });
        return { pass: found, notes: 'hfHeaderDefault=' + hfData.header.default + ' headerContent=' + JSON.stringify(headerContent) };
      },
    });
  });

  // --- La zone ouverte ne refuse plus rien (demande d'Antoine du 20/10 : « il faut qu'il retrouve de la souplesse, mais sans que jamais ça ne vienne décaller le reste
  // du texte de la page ») : elle grandit avec ce qu'on y met, dit ce qui dépasse la bande de 60 px (un trait rouge, une note sous la feuille en millimètres, « Réduire
  // l'image » quand une image est en cause) et ce qui est sous le trait est coupé dans l'impression et les exports (cas hf_word_*, hf_pdf_*, hf_reader_* plus bas). ---
  async function openHeaderZone(h, header) {
    await h.resetEditor();
    document.getElementById('editor-container').classList.add('a4-preview'); // cf. commentaire hf_enter_via_real_ui_click
    Editor.setHeaderFooterData({ enabled: true, differentFirstPage: false, header: { default: header || '', first: '' }, footer: { default: '', first: '' } });
    await h.sleep(100);
    const zone = document.querySelector('.v2-hf-zone');
    if (!zone) return false;
    zone.click();
    await h.sleep(200);
    await h.focusAtEnd();
    return true;
  }
  // Ce que la zone ouverte dit de son dépassement : `hf-over` sur le conteneur, la note sous la feuille, le bouton « Réduire l'image » et la limite du trait.
  const zoneOverflowState = () => {
    const container = document.getElementById('editor-container');
    const note = document.getElementById('v2-hf-overflow');
    const visible = !!note && !note.hidden;
    const button = visible ? note.querySelector('.v2-hf-overflow-btn') : null;
    return {
      over: container.classList.contains('hf-over'), noteVisible: visible, text: visible ? note.querySelector('.v2-hf-overflow-text').textContent : null,
      button: !!button && !button.hidden ? button.textContent : null, limit: container.style.getPropertyValue('--v2-hf-limit'),
    };
  };
  const solidPng = (width, height, color) => {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    context.fillStyle = color; context.fillRect(0, 0, width, height);
    return canvas.toDataURL('image/png');
  };
  // La hauteur de contenu d'une zone ouverte, en pixels de mise en page, hors lignes vides de la fin (les 8 px de padding du haut et du bas ne comptent pas).
  const openZoneImageBox = () => {
    const img = EditorCore.getEditor().view.dom.querySelector('img.editor-image');
    if (!img) return null;
    const zoom = EditorCore.layoutZoom(img);
    const rect = img.getBoundingClientRect();
    return { width: Math.round(rect.width / zoom), height: Math.round(rect.height / zoom), style: img.getAttribute('style') };
  };

  cases.push({
    id: 'hf_zone_takes_more_lines_than_the_band_and_says_so',
    description: 'Taper des lignes en boucle dans une zone d\'en-tête n\'est plus refusé : les trente lignes restent, la zone grandit avec elles, un trait rouge marque la limite de la bande (60 px) et la note sous la feuille dit de combien elle dépasse, en millimètres',
    run: async (h) => {
      if (!await openHeaderZone(h, '')) return { pass: false, notes: 'zone introuvable' };
      const before = zoneOverflowState();
      for (let i = 1; i <= 30; i += 1) { document.execCommand('insertText', false, 'Ligne ' + i); document.execCommand('insertParagraph'); await h.sleep(8); }
      await h.sleep(150);
      const state = zoneOverflowState();
      const lines = (Editor.getHTML().match(/<p>Ligne \d+<\/p>/g) || []).length;
      const mm = state.text ? Number((state.text.match(/de (\d+) mm/) || [])[1]) : null;
      // 30 lignes de 19,9 px, moins la bande de 60 px : environ 142 mm.
      const pass = !before.over && !before.noteVisible && lines === 30 && state.over && state.noteVisible && /^L’en-tête dépasse de \d+ mm/.test(state.text || '') && mm > 120 && mm < 160
        && state.button === null && /px$/.test(state.limit) && parseFloat(state.limit) === 8 + PageLayout.HEADER_FOOTER_ZONE_PX;
      return { pass, notes: JSON.stringify({ before, state, lines, mm }) };
    },
  });

  cases.push({
    id: 'hf_zone_taller_than_the_band_opens_whole_with_its_line_and_note_and_fits_again_once_cut',
    description: 'Un en-tête déjà trop long (modèle existant) s\'ouvre en entier, avec le trait rouge et la note ; supprimer des lignes y reste possible et, dès que le reste tient dans la bande, le trait et la note disparaissent',
    run: async (h) => {
      const longHeader = '<p>Ligne un déjà longue</p><p>Ligne deux déjà longue</p><p>Ligne trois déjà longue</p><p>Ligne quatre déjà longue</p>';
      if (!await openHeaderZone(h, longHeader)) return { pass: false, notes: 'zone introuvable' };
      const opened = zoneOverflowState();
      const afterEnter = Editor.getHTML();
      const preserved = afterEnter.includes('Ligne un') && afterEnter.includes('Ligne quatre');
      // Il ne reste que les deux premières lignes (39,8 px, dans la bande) : la mise à jour redit l'état de la zone.
      EditorCore.getEditor().commands.setContent('<p>Ligne un déjà longue</p><p>Ligne deux déjà longue</p>', true);
      await h.sleep(150);
      const fits = zoneOverflowState();
      return { pass: preserved && opened.over && opened.noteVisible && !fits.over && !fits.noteVisible && fits.limit === '', notes: JSON.stringify({ opened, fits, preserved }) };
    },
  });

  cases.push({
    id: 'hf_zone_blank_lines_at_the_end_do_not_count_and_a_one_row_table_fits',
    description: 'Les lignes vides à la fin d\'une zone ne comptent pas dans son dépassement (il n\'y a rien à couper dessous) : un texte suivi de huit retours à la ligne, et un tableau d\'une ligne avec la ligne que l\'éditeur laisse après lui, tiennent ; une ligne vide au milieu, elle, compte',
    run: async (h) => {
      if (!await openHeaderZone(h, '<p>Texte</p>' + '<p></p>'.repeat(8))) return { pass: false, notes: 'zone introuvable' };
      const blankEnd = zoneOverflowState();
      const td = text => '<td colspan="1" rowspan="1"><p>' + text + '</p></td>';
      const oneRow = '<table style="min-width: 75px;"><colgroup><col style="min-width: 25px;"><col style="min-width: 25px;"></colgroup><tbody><tr>' + td('Société') + td('Adresse') + '</tr></tbody></table><p></p>';
      EditorCore.getEditor().commands.setContent(oneRow, true);
      await h.sleep(150);
      const table = zoneOverflowState();
      EditorCore.getEditor().commands.setContent('<p>Texte</p>' + '<p></p>'.repeat(4) + '<p>Fin</p>', true);
      await h.sleep(150);
      const middle = zoneOverflowState();
      return { pass: !blankEnd.over && !blankEnd.noteVisible && !table.over && !table.noteVisible && middle.over && middle.noteVisible, notes: JSON.stringify({ blankEnd, table, middle }) };
    },
  });

  cases.push({
    id: 'hf_zone_takes_an_image_of_any_size_and_the_shrink_button_fits_it_in_one_undo_step',
    description: 'Une image de n\'importe quelle taille (400 x 300, 900 x 100, 100 x 40) entre dans une zone d\'en-tête à 320 px de large, sans être refusée ni rognée ; quand elle dépasse la bande, la note propose « Réduire l\'image » : un clic la ramène à ce qui tient dans la bande, proportions gardées, et un seul Annuler la rend telle qu\'elle était',
    run: async (h) => {
      if (!await openHeaderZone(h, '')) return { pass: false, notes: 'zone introuvable' };
      const editor = EditorCore.getEditor();
      const report = {};
      let pass = true;
      // À 320 px de large : 240 px de haut (dépasse la bande), 36 px (tient), 128 px (dépasse : une petite image agrandie à la largeur par défaut).
      for (const [name, width, height] of [['400x300', 400, 300], ['900x100', 900, 100], ['100x40', 100, 40]]) {
        editor.commands.setContent('<p></p>', true);
        await h.sleep(60);
        await Editor.insertImageAtDefaultSize(solidPng(width, height, '#2f6fed'));
        await h.sleep(300);
        const box = openZoneImageBox();
        const state = zoneOverflowState();
        const expectOver = 320 * height / width > PageLayout.HEADER_FOOTER_ZONE_PX;
        report[name] = { box, over: state.over, button: state.button };
        pass = pass && !!box && box.width === 320 && /width: 320px/.test(box.style || '') && state.over === expectOver && (expectOver ? !!state.button : !state.noteVisible);
      }
      // « Réduire l'image » sur la 400 x 300 : la zone tient, les proportions sont gardées, un Annuler défait tout.
      editor.commands.setContent('<p></p>', true);
      await h.sleep(60);
      await Editor.insertImageAtDefaultSize(solidPng(400, 300, '#cc2233'));
      await h.sleep(300);
      const tall = zoneOverflowState();
      const sizeBefore = openZoneImageBox();
      const shrink = document.querySelector('#v2-hf-overflow .v2-hf-overflow-btn');
      if (!shrink || shrink.hidden) return { pass: false, notes: JSON.stringify({ report, tall }) };
      shrink.click();
      await h.sleep(250);
      const fitted = zoneOverflowState();
      const sizeAfter = openZoneImageBox();
      const ratioKept = !!sizeAfter && Math.abs(sizeAfter.width / sizeAfter.height - 4 / 3) < 0.06;
      editor.commands.undo();
      await h.sleep(250);
      const undone = openZoneImageBox();
      const undoneState = zoneOverflowState();
      pass = pass && tall.over && !fitted.over && !fitted.noteVisible && !!sizeAfter && sizeAfter.width < sizeBefore.width && sizeAfter.height <= PageLayout.HEADER_FOOTER_ZONE_PX && ratioKept
        && !!undone && undone.width === 320 && undoneState.over;
      return { pass, notes: JSON.stringify({ report, sizeBefore, sizeAfter, undone, fitted, undoneState }) };
    },
  });

  cases.push({
    id: 'hf_zone_counts_an_aligned_logo_taller_than_the_text_and_the_shrink_button_fits_it',
    description: 'Un logo aligné à gauche, plus haut que le texte à côté de lui, agrandit la zone ouverte (il ne la laisse plus déborder sans le dire) : le trait et la note le comptent, et « Réduire l\'image » le ramène dans la bande',
    run: async (h) => {
      if (!await openHeaderZone(h, '')) return { pass: false, notes: 'zone introuvable' };
      const src = solidPng(300, 200, '#2f6fed');
      EditorCore.getEditor().commands.setContent('<p><img class="editor-image" src="' + src + '" alt="" data-layer="normal" data-wrap="inline" data-align="left" style="width: 200px;">Société Exemple SAS<br>12 rue de la Paix</p>', true);
      await h.sleep(400);
      const tall = zoneOverflowState();
      const tip = EditorCore.getEditor().view.dom;
      const grown = tip.clientHeight > 100; // la zone contient le logo flottant (flow-root)
      const shrink = document.querySelector('#v2-hf-overflow .v2-hf-overflow-btn');
      if (!shrink || shrink.hidden) return { pass: false, notes: JSON.stringify({ tall, grown }) };
      shrink.click();
      await h.sleep(250);
      const fitted = zoneOverflowState();
      return { pass: tall.over && !!tall.button && grown && !fitted.over && !fitted.noteVisible, notes: JSON.stringify({ tall, grown, fitted }) };
    },
  });

  cases.push({
    id: 'hf_zone_note_speaks_english_with_the_english_interface',
    description: 'Avec l\'interface en anglais, la note d\'une zone qui dépasse dit « The header is N mm too tall… » (« The footer… » pour un pied) et son bouton « Shrink the image » ; en français « L\'en-tête dépasse de N mm… » et « Réduire l\'image »',
    run: async (h) => {
      try {
        if (!await openHeaderZone(h, '')) return { pass: false, notes: 'zone introuvable' };
        await Editor.insertImageAtDefaultSize(solidPng(400, 300, '#2f6fed'));
        await h.sleep(300);
        const fr = zoneOverflowState();
        I18n.setLang('en');
        EditorCore.getEditor().commands.insertContent(' ');
        await h.sleep(250);
        const en = zoneOverflowState();
        const footerButton = document.querySelector('#v2-hf-zone-segment button[data-zone="footer"]');
        let footerText = null;
        if (footerButton) {
          footerButton.click();
          await h.sleep(250);
          await Editor.insertImageAtDefaultSize(solidPng(400, 300, '#cc2233'));
          await h.sleep(300);
          footerText = zoneOverflowState().text;
        }
        return {
          pass: /^L’en-tête dépasse de \d+ mm/.test(fr.text || '') && fr.button === 'Réduire l’image'
            && /^The header is \d+ mm too tall/.test(en.text || '') && en.button === 'Shrink the image' && /^The footer is \d+ mm too tall/.test(footerText || ''),
          notes: JSON.stringify({ fr, en, footerText }),
        };
      } finally { I18n.setLang('fr'); await h.sleep(100); }
    },
  });

  // Le texte d'un numéro de page vient d'une seule fonction (PageLayout.resolvePageNumberBadges) pour l'aperçu paginé de l'éditeur ET le mode Lecture : ce
  // scénario lit ce que la personne voit dans les deux, bande par bande, sur un document de 3 pages (en-tête « Page n », pied « n/total »).
  cases.push({
    id: 'hf_page_numbers_resolved_in_editor_preview_and_reader',
    description: 'Aperçu paginé de l\'éditeur et mode Lecture affichent le vrai numéro de chaque page dans les bandes d\'en-tête et de pied (« Page 2 », « 2/3 »)',
    run: async (h) => {
      const badge = format => '<span class="page-number-badge" contenteditable="false" data-format="' + format + '">#</span>';
      const hf = { enabled: true, differentFirstPage: false, header: { default: '<p>' + badge('page-n') + '</p>', first: '' }, footer: { default: '<p>' + badge('n-slash-total') + '</p>', first: '' } };
      const body = '<p>Un</p><div class="page-break-marker">Saut de page</div><p>Deux</p><div class="page-break-marker">Saut de page</div><p>Trois</p>';
      const texts = (root, sel) => Array.from(root.querySelectorAll(sel)).map(el => el.textContent.replace(/\s+/g, ' ').trim());
      const read = root => ({
        edgeTop: texts(root, '.v2-page-edge-top'), edgeBottom: texts(root, '.v2-page-edge-bottom'),
        footers: texts(root, '.v2-page-band-footer'), headers: texts(root, '.v2-page-band-header'),
      });

      await h.resetEditor();
      document.getElementById('editor-container').classList.add('a4-preview'); // cf. commentaire hf_enter_via_real_ui_click
      Editor.setHeaderFooterData(hf);
      Editor.setHTML(body);
      await h.sleep(250);
      const editorSide = read(document.getElementById('editor-container'));

      document.getElementById('editor-container').style.display = 'none';
      const readerContainer = document.getElementById('reader-container');
      readerContainer.style.display = 'block';
      readerContainer.classList.add('a4-preview');
      await ReaderMode.render(body, 'FakeTable', {}, hf);
      await h.sleep(250);
      const readerSide = read(readerContainer);
      document.getElementById('editor-container').style.display = '';
      readerContainer.style.display = '';
      document.getElementById('btn-mode-edit').click();
      await h.sleep(60);

      const expected = { edgeTop: ['Page 1'], edgeBottom: ['3/3'], footers: ['1/3', '2/3'], headers: ['Page 2', 'Page 3'] };
      const same = side => JSON.stringify(side) === JSON.stringify(expected);
      return { pass: same(editorSide) && same(readerSide), notes: JSON.stringify({ editorSide, readerSide }) };
    },
  });

  // --- Un en-tête ou un pied de page sans contenu n'est pas « activé » (Antoine, 01/10) ---
  // Un clic dans la marge, même par erreur, puis « Terminer » sans rien écrire laissait un en-tête activé : exitHeaderFooterMode gardait le « <p></p> » de
  // l'éditeur et l'état activé posé à l'entrée. En Lecture, ce fragment vide ouvrait une bande blanche de 26 px au-dessus (et au-dessous) de la feuille.
  const EMPTY_DATA = () => ({ enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } });
  const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const hfZone = pos => document.querySelector('#editor-container .v2-page-edge-' + pos);
  async function openZone(h, pos) {
    const zone = hfZone(pos);
    if (!zone) return false;
    zone.click();
    await h.sleep(100);
    return Editor.isEditingHeaderFooter();
  }
  async function clickDone(h) {
    const doneBtn = document.getElementById('v2-hf-btn-done');
    if (doneBtn) doneBtn.click();
    await h.sleep(100);
    return !Editor.isEditingHeaderFooter();
  }
  // Ce que la Lecture ouvre au-dessus et au-dessous de la feuille pour ces données (une bande par zone qui a quelque chose à montrer).
  async function readerEdges(h, hf) {
    await h.renderReaderMode('<p>Corps</p>', JSON.parse(JSON.stringify(hf)));
    await h.sleep(200);
    const container = document.getElementById('reader-container');
    const edges = { top: container.querySelectorAll('.v2-page-edge-top').length, bottom: container.querySelectorAll('.v2-page-edge-bottom').length };
    // renderReaderMode montre les deux conteneurs à la fois (jamais le cas en usage réel) : retour au Mode édition pour les scénarios suivants.
    container.style.display = '';
    document.getElementById('editor-container').style.display = '';
    document.getElementById('btn-mode-edit').click();
    await h.sleep(60);
    return edges;
  }

  cases.push({
    id: 'hf_click_then_done_without_typing_leaves_nothing_enabled',
    description: 'Un clic dans la zone d\'en-tête puis « Terminer » sans rien écrire ne laisse aucun en-tête ni pied de page activé (pas de « <p></p> » gardé)',
    run: async (h) => {
      await h.resetEditor();
      h.setA4Preview(true);
      Editor.setHeaderFooterData(EMPTY_DATA());
      await h.sleep(80);
      const entered = await openZone(h, 'top');
      const closed = await clickDone(h);
      const data = Editor.getHeaderFooterData();
      const clean = !data.enabled && !data.differentFirstPage && !data.header.default && !data.header.first && !data.footer.default && !data.footer.first;
      const edges = await readerEdges(h, data);
      return { pass: entered && closed && clean && edges.top === 0 && edges.bottom === 0, notes: JSON.stringify({ entered, closed, data, edges }) };
    },
  });

  cases.push({
    id: 'hf_empty_header_done_keeps_the_filled_footer',
    description: 'Un clic par erreur dans l\'en-tête, « Terminer » : le pied de page rempli reste activé, l\'en-tête n\'est pas gardé vide (pas de bande blanche en Lecture)',
    run: async (h) => {
      await h.resetEditor();
      h.setA4Preview(true);
      Editor.setHeaderFooterData(Object.assign(EMPTY_DATA(), { enabled: true, footer: { default: '<p>Pied du modèle</p>', first: '' } }));
      await h.sleep(80);
      const entered = await openZone(h, 'top');
      const closed = await clickDone(h);
      const data = Editor.getHeaderFooterData();
      const edges = await readerEdges(h, data);
      const pass = entered && closed && data.enabled && data.header.default === '' && data.footer.default.includes('Pied du modèle') && edges.top === 0 && edges.bottom === 1;
      return { pass, notes: JSON.stringify({ entered, closed, data, edges }) };
    },
  });

  cases.push({
    id: 'hf_emptied_header_done_is_removed',
    description: 'Un en-tête rempli puis entièrement effacé, « Terminer » : il est retiré, rien ne reste activé',
    run: async (h) => {
      await h.resetEditor();
      h.setA4Preview(true);
      Editor.setHeaderFooterData(Object.assign(EMPTY_DATA(), { enabled: true, header: { default: '<p>À effacer</p>', first: '' } }));
      await h.sleep(80);
      const entered = await openZone(h, 'top');
      await h.focusAtEnd();
      await h.selectAllInEditor();
      document.execCommand('delete');
      await h.sleep(60);
      const closed = await clickDone(h);
      const data = Editor.getHeaderFooterData();
      const pass = entered && closed && !data.enabled && !data.header.default && !data.footer.default;
      return { pass, notes: JSON.stringify({ entered, closed, data }) };
    },
  });

  cases.push({
    id: 'hf_zone_with_content_stays_enabled_after_done',
    description: 'Un texte tapé dans l\'en-tête reste après « Terminer », avec l\'en-tête activé (non-régression de la suppression automatique)',
    run: async (h) => {
      await h.resetEditor();
      h.setA4Preview(true);
      Editor.setHeaderFooterData(EMPTY_DATA());
      await h.sleep(80);
      const entered = await openZone(h, 'top');
      await h.focusAtEnd();
      await h.typeText('Courrier officiel');
      await h.sleep(60);
      const closed = await clickDone(h);
      const data = Editor.getHeaderFooterData();
      const edges = await readerEdges(h, data);
      const pass = entered && closed && data.enabled && data.header.default.includes('Courrier officiel') && !data.footer.default && edges.top === 1 && edges.bottom === 0;
      return { pass, notes: JSON.stringify({ entered, closed, data, edges }) };
    },
  });

  cases.push({
    id: 'hf_image_only_and_page_number_only_zones_are_content',
    description: 'Un en-tête qui ne contient qu\'une image et un pied qui ne contient qu\'un numéro de page ne sont pas vides : rouverts puis « Terminer », ils restent',
    run: async (h) => {
      await h.resetEditor();
      h.setA4Preview(true);
      const badge = '<span class="page-number-badge" contenteditable="false" data-format="n">#</span>';
      Editor.setHeaderFooterData(Object.assign(EMPTY_DATA(), {
        enabled: true,
        header: { default: '<p><img class="editor-image" src="' + PIXEL + '" alt="" style="width: 40px;"></p>', first: '' },
        footer: { default: '<p>' + badge + '</p>', first: '' },
      }));
      await h.sleep(80);
      const topOpened = await openZone(h, 'top');
      const topClosed = await clickDone(h);
      const bottomOpened = await openZone(h, 'bottom');
      const bottomClosed = await clickDone(h);
      const data = Editor.getHeaderFooterData();
      const pass = topOpened && topClosed && bottomOpened && bottomClosed && data.enabled && /<img/.test(data.header.default) && /page-number-badge/.test(data.footer.default);
      return { pass, notes: JSON.stringify({ topOpened, topClosed, bottomOpened, bottomClosed, data }) };
    },
  });

  cases.push({
    id: 'hf_first_page_only_header_is_kept',
    description: 'Un en-tête présent seulement sur la première page (variante « première page » remplie, l\'autre vide) reste activé, avec sa case cochée, après « Terminer »',
    run: async (h) => {
      await h.resetEditor();
      h.setA4Preview(true);
      Editor.setHeaderFooterData(Object.assign(EMPTY_DATA(), { enabled: true, differentFirstPage: true, header: { default: '', first: '<p>Première page seulement</p>' } }));
      await h.sleep(80);
      const entered = await openZone(h, 'top');
      const closed = await clickDone(h);
      const data = Editor.getHeaderFooterData();
      const pass = entered && closed && data.enabled && data.differentFirstPage && data.header.first.includes('Première page seulement') && data.header.default === '';
      return { pass, notes: JSON.stringify({ entered, closed, data }) };
    },
  });

  cases.push({
    id: 'hf_loading_an_empty_activated_header_cleans_it',
    description: 'Un modèle déjà enregistré avec un en-tête « activé » mais vide est remis à plat à l\'ouverture ; un modèle qui a un pied rempli garde son état',
    run: async (h) => {
      await h.resetEditor();
      Editor.setHeaderFooterData({ enabled: true, differentFirstPage: true, header: { default: '<p></p>', first: '<p></p>' }, footer: { default: '<p></p>', first: '' } });
      const emptied = Editor.getHeaderFooterData();
      const emptiedOk = !emptied.enabled && !emptied.differentFirstPage && !emptied.header.default && !emptied.header.first && !emptied.footer.default;
      Editor.setHeaderFooterData({ enabled: true, differentFirstPage: false, header: { default: '<p></p>', first: '' }, footer: { default: '<p>Pied</p>', first: '' } });
      const kept = Editor.getHeaderFooterData();
      const keptOk = kept.enabled && kept.header.default === '' && kept.footer.default === '<p>Pied</p>';
      // Une variante « première page » laissée dans les données alors que la case est décochée ne garde rien d'activé à elle seule.
      Editor.setHeaderFooterData({ enabled: true, differentFirstPage: false, header: { default: '', first: '<p>Oubliée</p>' }, footer: { default: '', first: '' } });
      const orphan = Editor.getHeaderFooterData();
      const orphanOk = !orphan.enabled && orphan.header.first === '<p>Oubliée</p>';
      return { pass: emptiedOk && keptOk && orphanOk, notes: JSON.stringify({ emptied, kept, orphan }) };
    },
  });

  // --- Taille du texte d'un en-tête ou d'un pied : 10,5 pt à l'écran comme dans le PDF et le Word (choix d'Antoine du 01/10, « Comme le PDF ») ---
  // Le texte d'une zone s'affichait à 10,5 PX (7,9 pt), les trois quarts de ce qui s'imprime : 10,5 pt = 14 px, la taille du corps du modèle, du PDF (DEFAULT_FONT_SIZE) et du
  // Word (21 demi-points). On compare à ce que les deux exports écrivent vraiment : la taille des glyphes décodés par pdf.js dans les octets du PDF, et le `w:sz` du XML du Word.
  const HF_TEXT_DATA = () => ({ enabled: true, differentFirstPage: false, header: { default: '<p>Rapport trimestriel confidentiel</p>', first: '' }, footer: { default: '<p>Société Exemple SA</p>', first: '' } });
  const HF_TEXT_BODY = '<p>Un</p><div class="page-break-marker">Saut de page</div><p>Deux</p>';
  const fontPx = el => el ? parseFloat(getComputedStyle(el).fontSize) : null;
  // Taille des glyphes de chaque run de texte du PDF (pt) : la matrice du texte porte la taille de police.
  async function pdfTextSizes(h, base64) {
    await h.ensurePdfJsLoaded();
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
    const out = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const content = await (await pdf.getPage(n)).getTextContent();
      content.items.filter(it => it.str && it.str.trim()).forEach(it => out.push({ page: n, str: it.str, pt: Math.round(Math.hypot(it.transform[0], it.transform[1]) * 100) / 100 }));
    }
    return out;
  }
  const docxRunHalfPoints = xml => Array.from((xml || '').matchAll(/<w:sz w:val="(\d+)"\/>/g)).map(m => Number(m[1]));

  cases.push({
    id: 'hf_text_is_10_5pt_in_editor_zones_and_seams_like_pdf_and_word',
    description: 'Le texte d\'un en-tête et d\'un pied vaut 14 px (10,5 pt) dans les zones de l\'éditeur et dans leurs bandes de couture, comme dans le PDF et le Word ; le libellé fantôme d\'une zone vide garde 10,5 px, et le texte ne change pas de taille quand on ouvre la zone',
    run: async (h) => {
      await h.resetEditor();
      h.setA4Preview(true);
      PageLayout.setMarginsMm(null);
      Editor.setHeaderFooterData(HF_TEXT_DATA());
      Editor.setHTML(HF_TEXT_BODY);
      Editor.refreshLayout();
      await h.sleep(300);
      const root = document.getElementById('editor-container');
      const bodyPx = fontPx(root.querySelector('.tiptap p'));
      const px = {
        top: fontPx(root.querySelector('.v2-page-edge-top .v2-hf-zone-body p')),
        bottom: fontPx(root.querySelector('.v2-page-edge-bottom .v2-hf-zone-body p')),
        seamHeader: fontPx(root.querySelector('.v2-page-band-header p')),
        seamFooter: fontPx(root.querySelector('.v2-page-band-footer p')),
      };
      const editorPt = Object.fromEntries(Object.entries(px).map(([k, v]) => [k, v == null ? null : Math.round(v * 0.75 * 100) / 100]));

      // Ce que écrivent les exports, lu dans leurs octets.
      const hfData = Editor.getHeaderFooterData();
      const pdf = await h.exportPdfContent(Editor.getHTML(), hfData, PageLayout.getMarginsPt());
      const sizes = await pdfTextSizes(h, pdf.base64);
      const pdfOf = word => (sizes.find(it => it.str === word) || {}).pt;
      const pdfPt = { header: pdfOf('Rapport'), footer: pdfOf('Société') };
      const docx = await h.exportDocxParts(Editor.getHTML(), hfData, null);
      const wordPt = { header: docxRunHalfPoints(docx.parts['word/header1.xml']).map(v => v / 2), footer: docxRunHalfPoints(docx.parts['word/footer1.xml']).map(v => v / 2) };

      // Le texte de la zone ouverte est celui de `.tiptap` : la taille ne saute plus à l'entrée.
      const before = px.top;
      const zone = root.querySelector('.v2-page-edge-top');
      zone.click();
      await h.sleep(150);
      const editing = Editor.isEditingHeaderFooter();
      const insidePx = fontPx(root.querySelector('.tiptap p'));
      const done = document.getElementById('v2-hf-btn-done');
      if (done) done.click();
      await h.sleep(150);

      // Le libellé « + Ajouter un en-tête » d'une zone vide n'est pas imprimé : il garde sa taille d'interface.
      Editor.setHeaderFooterData(Object.assign(EMPTY_DATA(), { enabled: true }));
      Editor.refreshLayout();
      await h.sleep(250);
      const ghostPx = fontPx(root.querySelector('.v2-page-edge-top .v2-hf-zone-ghost'));

      const same = (a, b) => a != null && b != null && Math.abs(a - b) < 0.05;
      const pass = same(bodyPx, 14)
        && Object.values(px).every(v => same(v, 14))
        && Object.values(editorPt).every(v => same(v, 10.5))
        && same(pdfPt.header, 10.5) && same(pdfPt.footer, 10.5)
        && wordPt.header.length > 0 && wordPt.header.every(v => v === 10.5) && wordPt.footer.length > 0 && wordPt.footer.every(v => v === 10.5)
        && editing && same(before, insidePx)
        && same(ghostPx, 10.5);
      return { pass, notes: JSON.stringify({ bodyPx, px, editorPt, pdfPt, wordPt, editing, before, insidePx, ghostPx }) };
    },
  });

  cases.push({
    id: 'hf_text_is_10_5pt_in_reader_edges_and_seams_like_pdf',
    description: 'En Lecture, le texte d\'un en-tête et d\'un pied vaut 14 px (10,5 pt) dans les bandes du haut et du bas de la feuille et dans les coutures, comme dans le PDF',
    run: async (h) => {
      await h.resetEditor();
      h.setA4Preview(true); // la Lecture ne pose ses bandes que sous a4-preview
      PageLayout.setMarginsMm(null);
      await h.renderReaderMode(HF_TEXT_BODY, HF_TEXT_DATA());
      await h.sleep(300);
      const root = document.getElementById('reader-container');
      const px = {
        top: fontPx(root.querySelector('.v2-page-edge-top p')),
        bottom: fontPx(root.querySelector('.v2-page-edge-bottom p')),
        seamHeader: fontPx(root.querySelector('.v2-page-band-header p')),
        seamFooter: fontPx(root.querySelector('.v2-page-band-footer p')),
      };
      const bodyPx = fontPx(root.querySelector('.reader-content p'));
      // renderReaderMode montre les deux conteneurs à la fois (jamais le cas en usage réel) : retour au Mode édition pour les scénarios suivants.
      root.style.display = '';
      document.getElementById('editor-container').style.display = '';
      document.getElementById('btn-mode-edit').click();
      await h.sleep(60);
      const same = (a, b) => a != null && b != null && Math.abs(a - b) < 0.05;
      const pass = same(bodyPx, 14) && Object.values(px).every(v => same(v, 14));
      return { pass, notes: JSON.stringify({ bodyPx, px }) };
    },
  });

  // Une variable d'en-tête ou de pied dont la valeur ne se lit pas : la bulle reste telle quelle (le reste de la zone se rend), mais l'erreur ne
  // s'avale plus sans trace, elle va à la console comme celle de la vue « comme acceptée » (js/reader-mode.js:resolveHeaderFooterZone).
  cases.push({
    id: 'hf_reader_unreadable_variable_is_logged_and_keeps_its_bubble',
    description: 'En Lecture, une variable d\'en-tête dont la valeur ne se lit pas est signalée à la console et sa bulle reste, au lieu d\'être avalée sans trace',
    run: async (h) => {
      await h.resetEditor();
      h.setA4Preview(true); // la Lecture ne pose ses bandes que sous a4-preview
      PageLayout.setMarginsMm(null);
      const realResolve = Variables.resolveVariable;
      const realWarn = console.warn;
      const warnings = [];
      Variables.resolveVariable = async () => { throw new Error('lecture impossible'); };
      console.warn = (...args) => { warnings.push(args.map(a => (a && a.message) || String(a)).join(' ')); };
      const header = '<p><span class="var-badge" data-table="Ventes" data-column="Total">#Total</span> Rapport</p>';
      let kept = false;
      let zoneText = '';
      try {
        await h.renderReaderMode('<p>Corps</p>', { enabled: true, differentFirstPage: false, header: { default: header, first: '' }, footer: { default: '', first: '' } });
        await h.sleep(250);
        const zone = document.querySelector('#reader-container .v2-page-edge-top');
        kept = !!(zone && zone.querySelector('.var-badge'));
        zoneText = zone ? zone.textContent : '';
      } finally {
        Variables.resolveVariable = realResolve;
        console.warn = realWarn;
        // renderReaderMode montre les deux conteneurs à la fois (jamais le cas en usage réel) : retour au Mode édition pour les scénarios suivants.
        document.getElementById('reader-container').style.display = '';
        document.getElementById('editor-container').style.display = '';
        document.getElementById('btn-mode-edit').click();
        await h.sleep(60);
      }
      const logged = warnings.filter(w => w.includes('[reader-mode]') && w.includes('lecture impossible'));
      return { pass: logged.length === 1 && kept && zoneText.includes('Rapport'), notes: JSON.stringify({ logged: logged.length, warnings: warnings.slice(0, 3), kept, zoneText }) };
    },
  });

  // --- Le passage d'un texte à l'autre (le corps, l'en-tête, le pied) -----------------------------------------------------------------------------------------------------
  // L'éditeur n'a qu'un document : en entrant dans une zone on y charge son fragment, en sortant on y remet le corps. Ce passage ne doit ni se proposer comme une modification
  // (suivi allumé), ni entrer dans l'historique d'Annuler, et chaque texte garde le sien.
  const ZONE_HTML = '<p>En-tête ABC</p>';
  async function bodyAndHeader(h, body) {
    await h.resetEditor();
    Editor.setHTML(body);
    Editor.setHeaderFooterData({ enabled: true, differentFirstPage: false, header: { default: ZONE_HTML, first: '' }, footer: { default: '', first: '' } });
    await h.sleep(80);
    return EditorCore.getEditor();
  }

  cases.push({
    id: 'hf_swap_with_track_changes_on_leaves_the_texts_clean',
    description: 'Suivi des modifications allumé : entrer dans l\'en-tête puis en sortir ne propose ni suppression ni insertion (ni dans le corps, ni dans l\'en-tête enregistré) et laisse le suivi allumé',
    run: async (h) => {
      await bodyAndHeader(h, '<p>Corps ABC</p>');
      Editor.setTrackChanges(true);
      let inside, back, saved, still;
      try {
        await h.sleep(60);
        HeaderFooterPreview.enterHeaderFooterMode('header', 'default');
        await h.sleep(100);
        inside = Editor.getHTML();
        HeaderFooterPreview.exitHeaderFooterModeIfActive();
        await h.sleep(100);
        back = Editor.getHTML();
        saved = Editor.getHeaderFooterData().header.default;
        still = Editor.isTrackChangesOn();
      } finally {
        Editor.setTrackChanges(false);
      }
      const clean = html => !/<(del|ins)\b/.test(html);
      const pass = inside === ZONE_HTML && back === '<p>Corps ABC</p>' && saved === ZONE_HTML && clean(inside) && clean(back) && clean(saved) && still === true;
      return { pass, notes: JSON.stringify({ inside, back, saved, still }) };
    },
  });

  cases.push({
    id: 'hf_swap_is_not_an_undo_step',
    description: 'Annuler juste après être entré dans l\'en-tête ne remet pas le corps dans l\'en-tête, et juste après en être sorti ne remet pas l\'en-tête dans le corps',
    run: async (h) => {
      const ed = await bodyAndHeader(h, '<p>Corps</p>');
      HeaderFooterPreview.enterHeaderFooterMode('header', 'default');
      await h.sleep(100);
      ed.commands.undo();
      await h.sleep(60);
      const insideAfterUndo = Editor.getHTML();
      const stillInZone = Editor.isEditingHeaderFooter();
      HeaderFooterPreview.exitHeaderFooterModeIfActive();
      await h.sleep(100);
      ed.commands.undo();
      await h.sleep(60);
      const bodyAfterUndo = Editor.getHTML();
      const stillBody = !Editor.isEditingHeaderFooter();
      return { pass: insideAfterUndo === ZONE_HTML && stillInZone && bodyAfterUndo === '<p>Corps</p>' && stillBody, notes: JSON.stringify({ insideAfterUndo, stillInZone, bodyAfterUndo, stillBody }) };
    },
  });

  cases.push({
    id: 'hf_each_text_keeps_its_own_undo_history',
    description: 'Le corps et l\'en-tête ont chacun leur historique tant qu\'on est dans la zone ; une fois sorti, la séance d\'écriture se défait d\'un pas, dans l\'ordre des gestes : Annuler rend d\'abord son texte à l\'en-tête puis défait la dernière frappe du corps, Rétablir les refait dans le même ordre, et l\'en-tête rouvert retrouve l\'historique de sa frappe',
    run: async (h) => {
      const ed = await bodyAndHeader(h, '<p>Corps</p>');
      const header = () => Editor.getHeaderFooterData().header.default;
      ed.chain().focus('end').insertContent(' un').run();
      await h.sleep(60);
      HeaderFooterPreview.enterHeaderFooterMode('header', 'default');
      await h.sleep(100);
      ed.chain().focus('end').insertContent(' deux').run();
      await h.sleep(60);
      HeaderFooterPreview.exitHeaderFooterModeIfActive();
      await h.sleep(100);
      const typed = Editor.getHTML();
      // Le dernier geste est la séance de l'en-tête : le premier Annuler la défait, le corps garde sa frappe.
      ed.commands.undo();
      await h.sleep(60);
      const sessionUndone = Editor.getHTML();
      const headerUndoneBySession = header();
      // Le second défait la frappe du corps, et l'en-tête reste comme il était.
      ed.commands.undo();
      await h.sleep(60);
      const undone = Editor.getHTML();
      const headerKept = header();
      ed.commands.redo();
      await h.sleep(60);
      const redone = Editor.getHTML();
      ed.commands.redo();
      await h.sleep(60);
      const headerRedone = header();
      HeaderFooterPreview.enterHeaderFooterMode('header', 'default');
      await h.sleep(100);
      ed.commands.undo();
      await h.sleep(60);
      const headerUndone = Editor.getHTML();
      const inZone = Editor.isEditingHeaderFooter();
      HeaderFooterPreview.exitHeaderFooterModeIfActive();
      await h.sleep(100);
      const bodyAfter = Editor.getHTML();
      const pass = typed === '<p>Corps un</p>'
        && sessionUndone === '<p>Corps un</p>' && /^<p>En-tête ABC<\/p>$/.test(headerUndoneBySession)
        && undone === '<p>Corps</p>' && /^<p>En-tête ABC<\/p>$/.test(headerKept)
        && redone === '<p>Corps un</p>' && /En-tête ABC deux/.test(headerRedone)
        && /^<p>En-tête ABC<\/p>$/.test(headerUndone) && inZone && bodyAfter === '<p>Corps un</p>';
      return { pass, notes: JSON.stringify({ typed, sessionUndone, headerUndoneBySession, undone, headerKept, redone, headerRedone, headerUndone, inZone, bodyAfter }) };
    },
  });

  cases.push({
    id: 'hf_loading_another_template_drops_the_histories_of_the_texts',
    description: 'Charger un autre modèle oublie l\'historique de l\'en-tête de l\'ancien : même si le nouvel en-tête est mot pour mot celui que l\'ancien avait après la frappe, Annuler n\'y défait rien',
    run: async (h) => {
      const ed = await bodyAndHeader(h, '<p>Corps</p>');
      HeaderFooterPreview.enterHeaderFooterMode('header', 'default');
      await h.sleep(100);
      ed.chain().focus('end').insertContent(' deux').run();
      await h.sleep(60);
      HeaderFooterPreview.exitHeaderFooterModeIfActive();
      await h.sleep(100);
      // Ce que fait main.js pour un autre modèle : sortie de la zone, nouveau corps, nouvelles zones.
      Editor.exitHeaderFooterModeIfActive();
      Editor.setHTML('<p>Autre corps</p>');
      Editor.setHeaderFooterData({ enabled: true, differentFirstPage: false, header: { default: '<p>En-tête ABC deux</p>', first: '' }, footer: { default: '', first: '' } });
      await h.sleep(100);
      HeaderFooterPreview.enterHeaderFooterMode('header', 'default');
      await h.sleep(100);
      ed.commands.undo();
      await h.sleep(60);
      const header = Editor.getHTML();
      HeaderFooterPreview.exitHeaderFooterModeIfActive();
      await h.sleep(100);
      return { pass: header === '<p>En-tête ABC deux</p>', notes: JSON.stringify({ header }) };
    },
  });

  // --- Un logo aligné à gauche ou à droite d'un en-tête, avec son texte à côté ---
  // L'éditeur le montre à côté du texte (habillage réel). La Lecture le posait seul sur sa ligne, au-dessus du texte ; le PDF le perdait (une zone n'a pas la
  // passe qui place les images habillées du corps : le logo sortait du fichier, le texte restait décalé) ; Word le superposait au texte (le texte d'un en-tête
  // ne contourne pas l'image ancrée dans LibreOffice).
  const HF_LOGO_SIDES = ['left', 'right'];
  const hfLogoData = (src, side, zone = 'header') => {
    const html = '<p><img class="editor-image" src="' + src + '" alt="" data-layer="normal" data-wrap="inline" data-align="' + side + '" style="width: 100px;">Société Exemple SAS<br>12 rue de la Paix, Paris</p>';
    return { enabled: true, differentFirstPage: false, header: { default: zone === 'header' ? html : '', first: '' }, footer: { default: zone === 'footer' ? html : '', first: '' } };
  };
  const round1 = v => Math.round(v * 10) / 10;

  cases.push({
    id: 'hf_reader_aligned_logo_floats_beside_the_text_in_the_edge_and_the_seams',
    description: 'En Lecture, un logo aligné à gauche ou à droite d\'un en-tête flotte à côté du texte, dans la bande du haut de la feuille comme dans les coutures, comme dans la zone de l\'éditeur, au lieu de prendre sa propre ligne au-dessus',
    run: async (h) => {
      await h.resetEditor();
      h.setA4Preview(true); // la Lecture ne pose ses bandes que sous a4-preview
      PageLayout.setMarginsMm(null);
      const logo = h.makeImage(200, 100, { logo: true });
      const body = '<p>Un</p><div class="page-break-marker">Saut de page</div><p>Deux</p>';
      const report = {};
      let pass = true;
      for (const side of HF_LOGO_SIDES) {
        await h.renderReaderMode(body, hfLogoData(logo, side));
        await h.sleep(300);
        const root = document.getElementById('reader-container');
        const measure = selector => {
          const zone = root.querySelector(selector);
          const img = zone && zone.querySelector('img.editor-image');
          if (!img) return null;
          const walker = document.createTreeWalker(zone, NodeFilter.SHOW_TEXT);
          let textRect = null;
          for (let node = walker.nextNode(); node && !textRect; node = walker.nextNode()) {
            if (!node.textContent.includes('Société')) continue;
            const range = document.createRange();
            range.selectNodeContents(node);
            textRect = range.getBoundingClientRect();
          }
          const imgRect = img.getBoundingClientRect();
          if (!textRect) return null;
          return {
            float: getComputedStyle(img).float,
            beside: side === 'left' ? textRect.left >= imgRect.right - 0.5 : textRect.right <= imgRect.left + 0.5,
            sameRow: textRect.top < imgRect.bottom - 2,
            imgLeft: round1(imgRect.left), imgRight: round1(imgRect.right), textLeft: round1(textRect.left), textRight: round1(textRect.right),
          };
        };
        const found = { edge: measure('.v2-page-edge-top'), seam: measure('.v2-page-band-header') };
        report[side] = found;
        pass = pass && ['edge', 'seam'].every(k => found[k] && found[k].float === side && found[k].beside && found[k].sameRow);
      }
      // renderReaderMode montre les deux conteneurs à la fois (jamais le cas en usage réel) : retour au Mode édition pour les scénarios suivants.
      document.getElementById('reader-container').style.display = '';
      document.getElementById('editor-container').style.display = '';
      document.getElementById('btn-mode-edit').click();
      await h.sleep(60);
      return { pass, notes: JSON.stringify(report) };
    },
  });

  cases.push({
    id: 'hf_pdf_aligned_logo_stays_in_the_file_beside_the_text',
    description: 'PDF : un logo aligné à gauche ou à droite d\'un en-tête ou d\'un pied reste dans le fichier, sur la page et au bord, et son texte se range à côté de lui (le logo d\'un en-tête sortait du fichier ; celui d\'un pied était peint deux fois trop bas, hors de la page)',
    run: async (h) => {
      await h.resetEditor();
      PageLayout.setMarginsMm(null);
      const logo = h.makeImage(200, 100, { logo: true });
      const margins = PageLayout.getMarginsPt();
      const report = {};
      let pass = true;
      for (const zone of ['header', 'footer']) {
        for (const side of HF_LOGO_SIDES) {
          const pdf = await h.exportPdfContent('<p>Corps du courrier</p>', hfLogoData(logo, side, zone), margins);
          const page = (await h.extractPdfGroundTruth(pdf.base64)).pages[0];
          const img = page.images[0];
          // pdf.js rend un mot par élément : le texte de la zone est tout ce qui est peint de l'autre côté du premier mot du corps (au-dessus, ou au-dessous
          // pour le pied).
          const bodyLine = page.textItems.find(t => t.str === 'Corps');
          const lines = bodyLine ? page.textItems.filter(t => (zone === 'header' ? t.y < bodyLine.y - 5 : t.y > bodyLine.y + 5)) : [];
          const key = zone + '-' + side;
          if (!img || !lines.length || !bodyLine) { report[key] = { images: page.images.length, lines: lines.length, body: !!bodyLine }; pass = false; continue; }
          const atEdge = side === 'left' ? Math.abs(img.x - margins.left) < 1.5 : Math.abs(img.x + img.width - (page.width - margins.right)) < 1.5;
          const beside = lines.every(t => (side === 'left' ? t.x >= img.x + img.width - 0.5 : t.x + t.width <= img.x + 0.5) && t.y < img.y + img.height + 1);
          const clear = zone === 'header' ? bodyLine.y >= img.y + img.height - 1 : img.y >= bodyLine.y;
          const onPage = img.y >= 0 && img.y + img.height <= page.height;
          report[key] = { img: { x: round1(img.x), y: round1(img.y), w: round1(img.width), h: round1(img.height) }, lines: lines.map(t => ({ x: round1(t.x), y: round1(t.y), w: round1(t.width) })), atEdge, beside, clear, onPage, pageWidth: round1(page.width), pageHeight: round1(page.height) };
          pass = pass && page.images.length === 1 && atEdge && beside && clear && onPage && Math.abs(img.width - 75) < 1.5;
        }
      }
      return { pass, notes: JSON.stringify(report) };
    },
  });

  cases.push({
    id: 'hf_word_aligned_logo_and_its_text_share_one_borderless_row',
    description: 'Word : un logo aligné à gauche ou à droite d\'un en-tête ou d\'un pied et son texte sont les deux cases d\'une ligne sans bordure (l\'image ancrée à la marge se superposait au texte), le logo à son bord, sans ancre flottante',
    run: async (h) => {
      await h.resetEditor();
      const logo = h.makeImage(200, 100, { logo: true });
      const report = {};
      let pass = true;
      for (const zone of ['header', 'footer']) {
        for (const side of HF_LOGO_SIDES) {
          const docx = await h.exportDocxParts('<p>Corps du courrier</p>', hfLogoData(logo, side, zone), null);
          const part = docx.part('word/' + zone + '1.xml');
          const tbl = part && part.getElementsByTagName('w:tbl')[0];
          const cells = tbl ? Array.from(tbl.getElementsByTagName('w:tc')) : [];
          const drawings = c => c.getElementsByTagName('w:drawing').length;
          const text = c => Array.from(c.getElementsByTagName('w:t')).map(t => t.textContent).join('|');
          const width = c => { const w = c.getElementsByTagName('w:tcW')[0]; return w ? Number(w.getAttribute('w:w')) : null; };
          const noBorders = tbl && Array.from(tbl.getElementsByTagName('w:tblBorders')[0] ? tbl.getElementsByTagName('w:tblBorders')[0].children : []).every(b => b.getAttribute('w:val') === 'none');
          const anchors = part ? part.getElementsByTagName('wp:anchor').length : -1;
          const imageAt = side === 'left' ? 0 : 1;
          const ok = cells.length === 2 && drawings(cells[imageAt]) === 1 && drawings(cells[1 - imageAt]) === 0
            && text(cells[1 - imageAt]).includes('Société Exemple SAS') && text(cells[1 - imageAt]).includes('12 rue de la Paix')
            && !!noBorders && anchors === 0
            // 100 px d'image = 1500 twips, plus l'air de 12 px du côté du texte (180 twips).
            && Math.abs(width(cells[imageAt]) - 1680) < 30;
          report[zone + '-' + side] = { cells: cells.length, imageCell: cells[imageAt] ? { drawings: drawings(cells[imageAt]), width: width(cells[imageAt]) } : null, textCell: cells[1 - imageAt] ? text(cells[1 - imageAt]) : null, noBorders: !!noBorders, anchors };
          pass = pass && ok;
        }
      }
      return { pass, notes: JSON.stringify(report) };
    },
  });

  cases.push({
    id: 'hf_word_lists_in_a_header_and_a_footer_keep_their_bullets_and_numbers',
    description: 'Word : une liste à puces dans l\'en-tête et une liste numérotée dans le pied pointent des numérotations qui existent dans numbering.xml (le fichier en référençait une absente, les puces et les numéros disparaissaient)',
    run: async (h) => {
      await h.resetEditor();
      const hf = {
        enabled: true, differentFirstPage: false,
        header: { default: '<ul><li><p>Premier point</p></li><li><p>Deuxième point</p></li></ul>', first: '' },
        footer: { default: '<ol><li><p>Un</p></li><li><p>Deux</p></li></ol>', first: '' },
      };
      const docx = await h.exportDocxParts('<p>Corps du courrier</p>', hf, null);
      const numbering = h.docxNumbering(docx.part('word/numbering.xml'));
      const usedBy = name => Array.from((docx.parts[name] || '').matchAll(/<w:numId w:val="(\d+)"\/>/g)).map(m => m[1]);
      const header = usedBy('word/header1.xml');
      const footer = usedBy('word/footer1.xml');
      const formatOf = ids => ids.map(id => (numbering[id] || {}).format || null);
      const pass = header.length === 2 && footer.length === 2
        && formatOf(header).every(f => f === 'bullet') && formatOf(footer).every(f => f === 'decimal');
      return { pass, notes: JSON.stringify({ header, footer, headerFormats: formatOf(header), footerFormats: formatOf(footer), defined: Object.keys(numbering) }) };
    },
  });

  // --- Une zone ne grandit jamais : ce qui dépasse sa limite (60 px, PageLayout.HEADER_FOOTER_ZONE_PX) est coupé partout, et le corps de la page ne bouge pas ---
  // Word agrandissait l'en-tête avec son contenu (le corps descendait), le PDF peignait une image entière par-dessus le corps et une quatrième ligne là où l'éditeur
  // n'en montrait que trois, la Lecture laissait le contenu déborder sur le corps. L'éditeur l'empêchait en refusant la frappe (assoupli ensuite) : les exports
  // doivent tenir seuls.
  const ZONE_LIMIT_PX = PageLayout.HEADER_FOOTER_ZONE_PX;
  const ZONE_LIMIT_PT = ZONE_LIMIT_PX * 72 / 96;
  const hfLines = (prefix, count) => Array.from({ length: count }, (_, i) => '<p>' + prefix + ' ligne ' + (i + 1) + '</p>').join('');
  const hfZones = (header, footer) => ({ enabled: true, differentFirstPage: false, header: { default: header, first: '' }, footer: { default: footer, first: '' } });
  const solidImage = (width, height, color) => {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    context.fillStyle = color; context.fillRect(0, 0, width, height);
    return '<img class="editor-image" src="' + canvas.toDataURL('image/png') + '" alt="" data-layer="normal" data-wrap="inline" style="width: ' + width + 'px;">';
  };
  const ZONE_BLUE = [0x2f, 0x6f, 0xed];
  const ZONE_RED = [0xcc, 0x22, 0x33];
  const HF_BODY = '<p>Corps du courrier</p><p>Deuxième ligne du corps</p>';

  // La ligne à hauteur exacte d'une zone de Word : { table, value, rule, texts } (texts : le nombre de <w:t>, le contenu est coupé par Word, pas retiré du fichier).
  const wordZoneRow = (docx, part) => {
    const xml = docx.part(part);
    const tbl = xml && xml.getElementsByTagName('w:tbl')[0];
    const height = tbl && tbl.getElementsByTagName('w:trHeight')[0];
    return {
      table: !!tbl, value: height ? Number(height.getAttribute('w:val')) : null, rule: height ? height.getAttribute('w:hRule') : null,
      texts: xml ? xml.getElementsByTagName('w:t').length : 0, drawings: tbl ? tbl.getElementsByTagName('w:drawing').length : 0,
    };
  };

  cases.push({
    id: 'hf_word_header_and_footer_beyond_the_zone_are_cut_in_a_fixed_height_row',
    description: 'Word : un en-tête et un pied plus hauts que la zone sont enfermés dans une ligne de tableau à hauteur exacte (Word la coupe au lieu de la laisser grandir et de repousser le corps), et le pied reste ancré sous le texte',
    run: async (h) => {
      await h.resetEditor();
      const docx = await h.exportDocxParts(HF_BODY, hfZones(hfLines('En-tête', 8), hfLines('Pied', 8)), null);
      const header = wordZoneRow(docx, 'word/header1.xml');
      const footer = wordZoneRow(docx, 'word/footer1.xml');
      const margins = h.docxSectionProps(docx.doc).margins;
      const limitTwip = ZONE_LIMIT_PX * 15;
      // Le pied tient dans la ligne de 900 twips et le paragraphe de 20 qui la suit : sa distance au bord de la feuille est la marge du bas (bande comprise) moins cette hauteur.
      const pass = header.table && header.rule === 'exact' && header.value === limitTwip && header.texts === 8
        && footer.table && footer.rule === 'exact' && footer.value === limitTwip && footer.texts === 8
        && margins.footer === margins.bottom - (limitTwip + 20);
      return { pass, notes: JSON.stringify({ header, footer, margins }) };
    },
  });

  cases.push({
    id: 'hf_word_a_tall_image_in_a_header_and_a_footer_is_cut_in_a_fixed_height_row',
    description: 'Word : une image plus haute que la zone, dans l\'en-tête comme dans le pied, reste dans le fichier mais dans une ligne à hauteur exacte (l\'image en ligne agrandissait l\'en-tête et repoussait le corps)',
    run: async (h) => {
      await h.resetEditor();
      const docx = await h.exportDocxParts(HF_BODY, hfZones('<p>' + solidImage(400, 300, '#2f6fed') + '</p>', '<p>' + solidImage(400, 300, '#cc2233') + '</p>'), null);
      const header = wordZoneRow(docx, 'word/header1.xml');
      const footer = wordZoneRow(docx, 'word/footer1.xml');
      const limitTwip = ZONE_LIMIT_PX * 15;
      const pass = header.table && header.rule === 'exact' && header.value === limitTwip && header.drawings === 1
        && footer.table && footer.rule === 'exact' && footer.value === limitTwip && footer.drawings === 1;
      return { pass, notes: JSON.stringify({ header, footer }) };
    },
  });

  cases.push({
    id: 'hf_word_blank_lines_in_a_header_and_a_footer_count_toward_the_zone',
    description: 'Word : les lignes vides d\'un en-tête et d\'un pied comptent dans la hauteur de la zone (Word les écrit toutes : un texte suivi de huit retours à la ligne passait pour une seule ligne et descendait le corps de la page) ; au-delà de la limite elles sont enfermées dans la ligne à hauteur exacte, en dessous le fichier ne change pas ; le PDF garde le corps où il est',
    run: async (h) => {
      await h.resetEditor();
      const blanks = count => '<p></p>'.repeat(count);
      const many = await h.exportDocxParts(HF_BODY, hfZones('<p>En-tête</p>' + blanks(8), '<p>Pied</p>' + blanks(8)), null);
      const few = await h.exportDocxParts(HF_BODY, hfZones('<p>En-tête</p>' + blanks(1), '<p>Pied</p>' + blanks(1)), null);
      const limitTwip = ZONE_LIMIT_PX * 15;
      const manyHeader = wordZoneRow(many, 'word/header1.xml');
      const manyFooter = wordZoneRow(many, 'word/footer1.xml');
      const fewHeader = wordZoneRow(few, 'word/header1.xml');
      const fewFooter = wordZoneRow(few, 'word/footer1.xml');
      // Le PDF : le corps est à la même place avec huit lignes vides qu'avec une.
      const pdfMany = await pdfZoneReport(h, '<p>En-tête</p>' + blanks(8), '<p>Pied</p>' + blanks(8));
      const pdfFew = await pdfZoneReport(h, '<p>En-tête</p>' + blanks(1), '<p>Pied</p>' + blanks(1));
      const pass = manyHeader.table && manyHeader.rule === 'exact' && manyHeader.value === limitTwip
        && manyFooter.table && manyFooter.rule === 'exact' && manyFooter.value === limitTwip
        && !fewHeader.table && !fewFooter.table
        && pdfMany.bodyY !== null && pdfFew.bodyY !== null && Math.abs(pdfMany.bodyY - pdfFew.bodyY) < 0.5;
      return { pass, notes: JSON.stringify({ manyHeader, manyFooter, fewHeader, fewFooter, pdfBody: [pdfMany.bodyY, pdfFew.bodyY] }) };
    },
  });

  cases.push({
    id: 'hf_word_a_header_and_a_footer_that_fit_the_zone_are_written_as_before',
    description: 'Word : un en-tête et un pied qui tiennent dans la zone (trois lignes, une petite image) ne sont enfermés dans aucune ligne à hauteur exacte : leur fichier ne change pas',
    run: async (h) => {
      await h.resetEditor();
      const docx = await h.exportDocxParts(HF_BODY, hfZones(hfLines('En-tête', 3), '<p>' + solidImage(120, 40, '#cc2233') + '</p>'), null);
      const header = wordZoneRow(docx, 'word/header1.xml');
      const footer = wordZoneRow(docx, 'word/footer1.xml');
      const pass = !header.table && !footer.table && header.texts === 3 && footer.drawings === 0;
      return { pass, notes: JSON.stringify({ header, footer }) };
    },
  });

  // La page 1 du PDF : le corps (son premier mot) et ce qui est peint de la zone, par rapport à la limite que le PDF respecte à la moitié de la marge du haut pour l'en-tête
  // et sous le texte pour le pied.
  async function pdfZoneReport(h, header, footer) {
    PageLayout.setMarginsMm(null);
    const margins = PageLayout.getMarginsPt();
    const pdf = await h.exportPdfContent(HF_BODY, hfZones(header, footer), margins);
    const page = (await h.extractPdfGroundTruth(pdf.base64)).pages[0];
    const body = page.textItems.find(t => t.str === 'Corps');
    const headerStart = margins.top / 2;
    const footerStart = page.height - (margins.bottom + 55);
    // Les lignes de la zone, une par ordonnée : tout ce qui est peint au-dessus du premier mot du corps, ou sous la bande du pied. pdf.js rend un mot par élément.
    const linesOf = items => Array.from(new Set(items.map(t => Math.round(t.y * 10) / 10))).sort((a, b) => a - b).map(y => ({ y }));
    const headerLines = linesOf(page.textItems.filter(t => body && t.y < body.y - 5));
    const footerLines = linesOf(page.textItems.filter(t => t.y > footerStart));
    const blue = await h.pdfColorRows(pdf.base64, ZONE_BLUE);
    const red = await h.pdfColorRows(pdf.base64, ZONE_RED);
    return { margins, page, bodyY: body ? body.y : null, headerStart, footerStart, headerLines, footerLines, blue, red, base64: pdf.base64 };
  }

  cases.push({
    id: 'hf_pdf_header_and_footer_text_beyond_the_zone_is_cut_at_its_limit_and_the_body_stays_put',
    description: 'PDF : un en-tête et un pied de huit lignes montrent les trois lignes qui tiennent dans la zone (60 px), la quatrième est coupée (le PDF en peignait quatre), et le corps reste à la place que lui donne un en-tête d\'une ligne',
    run: async (h) => {
      await h.resetEditor();
      const small = await pdfZoneReport(h, '<p>En-tête ligne 1</p>', '<p>Pied ligne 1</p>');
      const long = await pdfZoneReport(h, hfLines('En-tête', 8), hfLines('Pied', 8));
      // pdf.js rend un mot par élément : « En-tête » ouvre chaque ligne. Une ligne est dans la zone quand son haut (y est le bas de la ligne, au-dessus de la ligne de base) laisse la place d'une ligne.
      const within = (lines, start) => lines.every(t => t.y <= start + ZONE_LIMIT_PT + 1);
      const pass = long.headerLines.length === 3 && long.footerLines.length === 3
        && within(long.headerLines, long.headerStart) && within(long.footerLines, long.footerStart)
        && Math.abs(long.bodyY - small.bodyY) < 0.5;
      const lineYs = lines => lines.map(t => Math.round(t.y * 10) / 10);
      return { pass, notes: JSON.stringify({ headerLines: lineYs(long.headerLines), footerLines: lineYs(long.footerLines), headerStart: long.headerStart, footerStart: round1(long.footerStart), bodyY: round1(long.bodyY), smallBodyY: round1(small.bodyY) }) };
    },
  });

  cases.push({
    id: 'hf_pdf_a_tall_image_in_a_header_and_a_footer_is_cropped_at_the_zone_limit',
    description: 'PDF : une image plus haute que la zone est rognée à la limite de la zone, seule ou sous du texte (elle était peinte entière par-dessus le corps, ou jetée quand du texte la précédait), et le corps reste à sa place',
    run: async (h) => {
      await h.resetEditor();
      const small = await pdfZoneReport(h, '<p>En-tête ligne 1</p>', '<p>Pied ligne 1</p>');
      const alone = await pdfZoneReport(h, '<p>' + solidImage(400, 300, '#2f6fed') + '</p>', '<p>' + solidImage(400, 300, '#cc2233') + '</p>');
      const below = await pdfZoneReport(h, '<p>Société Exemple SAS</p><p>' + solidImage(300, 200, '#2f6fed') + '</p>', '<p>Pied court</p><p>' + solidImage(300, 200, '#cc2233') + '</p>');
      const inZone = (rows, start) => !!rows && rows.top >= start - 1 && rows.bottom <= start + ZONE_LIMIT_PT + 1;
      const seen = rows => !!rows && rows.bottom - rows.top >= 20;
      const pass = [alone, below].every(r => inZone(r.blue, r.headerStart) && inZone(r.red, r.footerStart) && seen(r.blue) && seen(r.red))
        && alone.blue.bottom - alone.blue.top > ZONE_LIMIT_PT - 6 && Math.abs(alone.bodyY - small.bodyY) < 0.5 && Math.abs(below.bodyY - small.bodyY) < 0.5;
      return { pass, notes: JSON.stringify({ alone: { blue: alone.blue, red: alone.red, headerStart: alone.headerStart, footerStart: round1(alone.footerStart) }, below: { blue: below.blue, red: below.red }, bodyY: round1(alone.bodyY), smallBodyY: round1(small.bodyY) }) };
    },
  });

  cases.push({
    id: 'hf_pdf_a_header_and_a_footer_that_fit_the_zone_are_painted_as_before',
    description: 'PDF : trois lignes et une petite image, qui tiennent dans la zone, sont peintes entières, sans rognage (la coupe ne touche que ce qui dépasse)',
    run: async (h) => {
      await h.resetEditor();
      const three = await pdfZoneReport(h, hfLines('En-tête', 3), hfLines('Pied', 3));
      const image = await pdfZoneReport(h, '<p>' + solidImage(120, 40, '#2f6fed') + '</p>', '<p>' + solidImage(120, 40, '#cc2233') + '</p>');
      // 40 px de haut = 30 pt, d'un bord à l'autre de l'image.
      const full = rows => !!rows && Math.abs((rows.bottom - rows.top) - 30) < 1.5;
      const pass = three.headerLines.length === 3 && three.footerLines.length === 3 && full(image.blue) && full(image.red);
      return { pass, notes: JSON.stringify({ headerLines: three.headerLines.length, footerLines: three.footerLines.length, blue: image.blue, red: image.red }) };
    },
  });

  cases.push({
    id: 'hf_reader_header_and_footer_beyond_the_zone_are_clipped_and_do_not_cover_the_body',
    description: 'Lecture : le contenu d\'un en-tête et d\'un pied plus haut que la zone est coupé à sa limite, dans la bande du haut de la feuille comme dans les coutures, au lieu de recouvrir le corps de la page',
    run: async (h) => {
      await h.resetEditor();
      h.setA4Preview(true);
      PageLayout.setMarginsMm(null);
      const body = '<p>Un</p><div class="page-break-marker">Saut de page</div><p>Deux</p>';
      await h.renderReaderMode(body, hfZones(hfLines('En-tête', 8), hfLines('Pied', 8)));
      await h.sleep(300);
      const root = document.getElementById('reader-container');
      // La dernière ligne de chaque zone est au-delà de la limite : sous la boîte qui coupe le contenu, qui ne montre que 60 px.
      const report = {};
      let pass = true;
      for (const selector of ['.v2-page-edge-top', '.v2-page-band-header', '.v2-page-edge-bottom', '.v2-page-band-footer']) {
        const zone = root.querySelector(selector);
        const lines = zone ? Array.from(zone.querySelectorAll('p')) : [];
        const last = lines[lines.length - 1];
        const clip = last && last.closest('.v2-hf-clip');
        if (!zone || !last || !clip) { report[selector] = { lines: lines.length, clip: !!clip }; pass = false; continue; }
        const lastRect = last.getBoundingClientRect();
        const clipRect = clip.getBoundingClientRect();
        const overflow = getComputedStyle(clip).overflowY;
        report[selector] = { lines: lines.length, clipHeight: round1(clipRect.height), lastTop: round1(lastRect.top), clipBottom: round1(clipRect.bottom), overflow };
        pass = pass && lines.length === 8 && overflow === 'hidden' && clipRect.height <= ZONE_LIMIT_PX + 0.5 && lastRect.top >= clipRect.bottom - 0.5;
      }
      document.getElementById('reader-container').style.display = '';
      document.getElementById('editor-container').style.display = '';
      document.getElementById('btn-mode-edit').click();
      await h.sleep(60);
      return { pass, notes: JSON.stringify(report) };
    },
  });

  // --- Un tableau dans l'en-tête ou le pied (demande d'Antoine du 20/10 : « pouvoir ajouter un tableau au moins d'une ligne ») : une ligne tient dans la zone et s'écrit
  // partout comme dans l'éditeur ; un tableau plus haut est coupé à la limite, comme le texte et les images, sans repousser le texte de la page. ---
  // Un tableau de zone tel que l'éditeur le pose : deux colonnes, `rows` lignes « Haut1A | Haut1B », suivi de la ligne vide que l'éditeur laisse derrière lui.
  const hfTable = (rows, prefix) => '<table style="min-width: 50px;"><colgroup><col style="min-width: 25px;"><col style="min-width: 25px;"></colgroup><tbody>'
    + Array.from({ length: rows }, (_, i) => '<tr><td colspan="1" rowspan="1"><p>' + prefix + (i + 1) + 'A</p></td><td colspan="1" rowspan="1"><p>' + prefix + (i + 1) + 'B</p></td></tr>').join('') + '</tbody></table><p></p>';

  cases.push({
    id: 'hf_word_a_table_in_a_header_and_a_footer_is_written_and_a_tall_one_is_cut_in_a_fixed_height_row',
    description: 'Word : un tableau d\'une ligne seul dans l\'en-tête et le pied tient dans la zone et est écrit tel quel ; suivi de la ligne vide que l\'éditeur laisse derrière lui, ou à quatre lignes, il dépasse la zone et est enfermé dans la ligne à hauteur exacte de 900 twips (le tableau dans une case, toutes ses cellules gardées) : Word coupe ce qui dépasse, il ne repousse pas le corps',
    run: async (h) => {
      await h.resetEditor();
      const limitTwip = ZONE_LIMIT_PX * 15;
      // Les tableaux de la partie (celui de la zone, plus la case qui l'enferme s'il y en a une), les lignes à hauteur exacte de la limite, et le texte des cases.
      const report = xml => ({
        tables: xml ? xml.getElementsByTagName('w:tbl').length : 0,
        exact: xml ? Array.from(xml.getElementsByTagName('w:trHeight')).filter(e => e.getAttribute('w:hRule') === 'exact' && Number(e.getAttribute('w:val')) === limitTwip).length : 0,
        texts: xml ? Array.from(xml.getElementsByTagName('w:t')).map(t => t.textContent).filter(Boolean) : [],
      });
      const zones = async (header, footer) => {
        const docx = await h.exportDocxParts(HF_BODY, hfZones(header, footer), null);
        return { header: report(docx.part('word/header1.xml')), footer: report(docx.part('word/footer1.xml')) };
      };
      const bare = await zones(hfTable(1, 'Haut').replace('<p></p>', ''), hfTable(1, 'Bas').replace('<p></p>', ''));
      const withBlank = await zones(hfTable(1, 'Haut'), hfTable(1, 'Bas'));
      const four = await zones(hfTable(4, 'Haut'), hfTable(4, 'Bas'));
      const cells = (zone, prefix, rows) => Array.from({ length: rows }, (_, i) => [prefix + (i + 1) + 'A', prefix + (i + 1) + 'B']).flat().every(text => zone.texts.includes(text));
      const pass = bare.header.tables === 1 && bare.header.exact === 0 && cells(bare.header, 'Haut', 1)
        && bare.footer.tables === 1 && bare.footer.exact === 0 && cells(bare.footer, 'Bas', 1)
        && withBlank.header.tables === 2 && withBlank.header.exact === 1 && cells(withBlank.header, 'Haut', 1)
        && withBlank.footer.tables === 2 && withBlank.footer.exact === 1 && cells(withBlank.footer, 'Bas', 1)
        && four.header.tables === 2 && four.header.exact === 1 && cells(four.header, 'Haut', 4)
        && four.footer.tables === 2 && four.footer.exact === 1 && cells(four.footer, 'Bas', 4);
      return { pass, notes: JSON.stringify({ bare, withBlank, four }) };
    },
  });

  cases.push({
    id: 'hf_pdf_a_table_in_a_header_and_a_footer_is_painted_and_the_rows_beyond_the_zone_are_cut_and_the_body_stays_put',
    description: 'PDF : le tableau d\'une ligne d\'un en-tête et d\'un pied est peint (ses deux cases) ; dans un tableau de quatre lignes les lignes qui ne tiennent pas dans la zone (60 px) sont retirées, la première reste, et le corps est à la place que lui donne un en-tête d\'une ligne',
    run: async (h) => {
      await h.resetEditor();
      const small = await pdfZoneReport(h, '<p>En-tête ligne 1</p>', '<p>Pied ligne 1</p>');
      const one = await pdfZoneReport(h, hfTable(1, 'Haut'), hfTable(1, 'Bas'));
      const four = await pdfZoneReport(h, hfTable(4, 'Haut'), hfTable(4, 'Bas'));
      const strings = (report, area) => report.page.textItems.filter(t => (area === 'header' ? report.bodyY !== null && t.y < report.bodyY - 5 : t.y > report.footerStart)).map(t => t.str);
      const oneHeader = strings(one, 'header'), oneFooter = strings(one, 'footer');
      const fourHeader = strings(four, 'header'), fourFooter = strings(four, 'footer');
      const within = (lines, start) => lines.every(t => t.y <= start + ZONE_LIMIT_PT + 1);
      const pass = oneHeader.includes('Haut1A') && oneHeader.includes('Haut1B') && oneFooter.includes('Bas1A') && oneFooter.includes('Bas1B')
        && fourHeader.includes('Haut1A') && fourFooter.includes('Bas1A') && !fourHeader.includes('Haut4A') && !fourFooter.includes('Bas4A')
        && within(four.headerLines, four.headerStart) && within(four.footerLines, four.footerStart)
        && Math.abs(one.bodyY - small.bodyY) < 0.5 && Math.abs(four.bodyY - small.bodyY) < 0.5;
      return { pass, notes: JSON.stringify({ oneHeader, oneFooter, fourHeader, fourFooter, bodyY: [round1(small.bodyY), round1(one.bodyY), round1(four.bodyY)] }) };
    },
  });

  cases.push({
    id: 'hf_reader_and_closed_zone_draw_a_table_with_its_grid_and_clip_a_tall_one_at_the_zone',
    description: 'Lecture et zone fermée de l\'éditeur : un tableau d\'une ligne dans l\'en-tête et le pied a son quadrillage (cases bordées, marges de case de la zone ouverte) ; un tableau de quatre lignes est coupé à la limite de la zone - sa dernière ligne est sous la boîte qui coupe - sans recouvrir le corps',
    run: async (h) => {
      await h.resetEditor();
      h.setA4Preview(true);
      PageLayout.setMarginsMm(null);
      const grid = zone => {
        const td = zone && zone.querySelector('td');
        const rows = zone ? Array.from(zone.querySelectorAll('tr')) : [];
        const cs = td ? getComputedStyle(td) : null;
        return { cells: td ? zone.querySelectorAll('td').length : 0, rows: rows.length, border: cs ? cs.borderTopStyle : null, padding: cs ? cs.paddingTop : null, lastRowTop: rows.length ? rows[rows.length - 1].getBoundingClientRect().top : null };
      };
      const report = {};
      let pass = true;
      // La zone fermée de l'éditeur : `.v2-hf-zone-body` (60 px au plus, rogne ce qui dépasse), rattachée à la feuille.
      for (const [name, rows] of [['one', 1], ['four', 4]]) {
        Editor.setHeaderFooterData(hfZones(hfTable(rows, 'Haut'), hfTable(rows, 'Bas')));
        await h.sleep(300);
        const bodies = Array.from(document.querySelectorAll('#editor-container .v2-hf-zone-body'));
        const zoom = EditorCore.layoutZoom(bodies[0]);
        const states = bodies.map(body => Object.assign(grid(body), { height: round1(body.getBoundingClientRect().height / zoom), clipTop: body.getBoundingClientRect().bottom }));
        report['editor-' + name] = states;
        const rowsPerZone = rows;
        pass = pass && states.length === 2 && states.every(state => state.rows === rowsPerZone && state.border === 'solid' && state.padding === '4px' && state.height <= ZONE_LIMIT_PX + 0.5)
          && (rows === 1 || states.every(state => state.lastRowTop >= state.clipTop - 0.5));
      }
      // La Lecture : la même chose, dans la bande du haut et du bas de la feuille.
      for (const [name, rows] of [['one', 1], ['four', 4]]) {
        await h.renderReaderMode('<p>Corps</p>', hfZones(hfTable(rows, 'Haut'), hfTable(rows, 'Bas')));
        await h.sleep(300);
        const root = document.getElementById('reader-container');
        const states = ['.v2-page-edge-top', '.v2-page-edge-bottom'].map(selector => {
          const zone = root.querySelector(selector);
          const clip = zone && zone.querySelector('.v2-hf-clip');
          return Object.assign(grid(zone), { clipBottom: clip ? clip.getBoundingClientRect().bottom : null, clipHeight: clip ? round1(clip.getBoundingClientRect().height) : null });
        });
        report['reader-' + name] = states;
        pass = pass && states.every(state => state.rows === rows && state.border === 'solid' && state.clipHeight !== null && state.clipHeight <= ZONE_LIMIT_PX + 0.5)
          && (rows === 1 || states.every(state => state.lastRowTop >= state.clipBottom - 0.5));
        root.style.display = '';
        document.getElementById('editor-container').style.display = '';
        document.getElementById('btn-mode-edit').click();
        await h.sleep(60);
      }
      return { pass, notes: JSON.stringify(report) };
    },
  });

  cases.push({
    id: 'hf_a_table_left_empty_in_a_header_is_kept_at_done_and_exported_without_error',
    description: 'Un tableau posé dans l\'en-tête et laissé vide n\'est pas jeté à « Terminer » (une zone sans texte ni image passait pour vide : le tableau et son quadrillage disparaissaient) ; Word et PDF l\'écrivent sans erreur et le PDF garde le corps où le met un en-tête d\'une ligne ; une zone qui n\'a qu\'un paragraphe vide reste une zone vide',
    run: async (h) => {
      if (!await openHeaderZone(h, '')) return { pass: false, notes: 'zone introuvable' };
      const emptyTable = '<table style="min-width: 50px;"><colgroup><col style="min-width: 25px;"><col style="min-width: 25px;"></colgroup><tbody><tr><td colspan="1" rowspan="1"><p></p></td><td colspan="1" rowspan="1"><p></p></td></tr></tbody></table><p></p>';
      EditorCore.getEditor().commands.setContent(emptyTable, true);
      await h.sleep(150);
      document.getElementById('v2-hf-btn-done').click();
      await h.sleep(300);
      const data = Editor.getHeaderFooterData();
      const kept = data.enabled && /<table/.test(data.header.default);
      const docx = await h.exportDocxParts(HF_BODY, data, null);
      const wordTables = docx.part('word/header1.xml').getElementsByTagName('w:tbl').length;
      const small = await pdfZoneReport(h, '<p>En-tête ligne 1</p>', '');
      const pdf = await pdfZoneReport(h, data.header.default, '');
      const blank = PageLayout.hasZoneContent('<p></p>') || PageLayout.hasZoneContent('') || !PageLayout.hasZoneContent(emptyTable);
      const pass = kept && wordTables >= 1 && pdf.bodyY !== null && Math.abs(pdf.bodyY - small.bodyY) < 0.5 && !blank;
      return { pass, notes: JSON.stringify({ enabled: data.enabled, header: data.header.default.slice(0, 60), wordTables, bodyY: [round1(small.bodyY), round1(pdf.bodyY)], blank }) };
    },
  });

  // --- « Sommaire » et « Saut de page » dans une zone (carte du 20/10, choix « Les deux ») : sans sens dans une bande de 60 px, ils sont grisés comme la numérotation des titres,
  // jamais retirés ; le reste de la barre ne change pas. ---
  cases.push({
    id: 'hf_toc_and_page_break_buttons_are_greyed_in_an_open_zone_and_do_nothing_there',
    description: 'Une zone d\'en-tête ouverte grise « Sommaire » et « Saut de page » (jamais retirés), comme la numérotation des titres, et seulement eux : Tableau, Deux colonnes, Image, Gras restent actifs ; ni le clavier (Alt+Entrée), ni un clic par programme n\'y posent de sommaire ni de saut de page, pas même avant la deuxième ligne d\'un tableau de la zone ; « Terminer » les rend, et dans le corps ils posent ce qu\'ils posaient ; l\'e-mail et le macro-modèle les grisent toujours',
    run: async (h) => {
      if (!await openHeaderZone(h, '<p>Titre</p>')) return { pass: false, notes: 'zone introuvable' };
      const locked = id => document.getElementById(id).classList.contains('v2-hf-locked');
      const marks = html => ({ toc: /toc-marker/.test(html), pageBreak: /page-break-marker/.test(html), rowBreak: /data-page-break-before/.test(html) });
      const zoneMarks = () => marks(EditorCore.getEditor().getHTML());
      const bystanders = ['v2-btn-bold', 'v2-btn-table', 'v2-btn-two-columns', 'v2-image-group', 'v2-btn-qr'];
      MainToolbar.syncToolbarState();
      const inZone = { toc: locked('v2-btn-toc'), pageBreak: locked('v2-btn-page-break'), numbering: locked('v2-numbering-seg'), bystandersLocked: bystanders.filter(locked) };
      const present = !!document.getElementById('v2-btn-toc') && !!document.getElementById('v2-btn-page-break');
      // Le clavier fait le geste de la souris (js/shortcuts.js) : il ne trouve rien à cliquer ; un clic par programme (Tab puis Entrée sur un bouton grisé) ne pose rien non plus.
      const byKey = [Shortcuts.run('pageBreak'), Shortcuts.run('toc')];
      document.getElementById('v2-btn-toc').click();
      document.getElementById('v2-btn-page-break').click();
      await h.sleep(120);
      const afterClicks = zoneMarks();
      // Le curseur dans la deuxième ligne d'un tableau de la zone : hors d'une zone, le bouton y poserait un saut de page avant la ligne.
      EditorCore.getEditor().commands.setContent(hfTable(2, 'Haut'), true);
      await h.sleep(120);
      const editor = EditorCore.getEditor();
      let secondRowCell = null; let cellCount = 0;
      editor.state.doc.descendants((node, pos) => { if (node.type.name === 'tableCell' && ++cellCount === 3) secondRowCell = pos; });
      editor.commands.setTextSelection(secondRowCell + 2);
      await h.sleep(120);
      MainToolbar.syncToolbarState();
      const inRow = { locked: locked('v2-btn-page-break'), byKey: Shortcuts.run('pageBreak') };
      document.getElementById('v2-btn-page-break').click();
      await h.sleep(120);
      const afterRowClick = zoneMarks();
      document.getElementById('v2-hf-btn-done').click();
      await h.sleep(300);
      const afterDone = { toc: locked('v2-btn-toc'), pageBreak: locked('v2-btn-page-break') };
      // Dans le corps, les deux posent de nouveau ce qu'ils posaient.
      await h.focusAtEnd();
      const inBody = { byKey: [Shortcuts.run('pageBreak'), Shortcuts.run('toc')] };
      await h.sleep(150);
      const bodyMarks = marks(Editor.getHTML());
      // E-mail et macro-modèle : le grisé d'avant reste (le sommaire est passé dans un groupe à part avec la condition de l'en-tête).
      MainToolbar.setEmailMode(true);
      MainToolbar.syncToolbarState();
      const inEmail = { toc: locked('v2-btn-toc'), pageBreak: locked('v2-btn-page-break') };
      MainToolbar.setEmailMode(false);
      MainToolbar.setMacroMode(true);
      MainToolbar.syncToolbarState();
      const inMacro = { toc: locked('v2-btn-toc'), pageBreak: locked('v2-btn-page-break') };
      MainToolbar.setMacroMode(false);
      MainToolbar.syncToolbarState();
      const back = { toc: locked('v2-btn-toc'), pageBreak: locked('v2-btn-page-break') };
      const pass = present && inZone.toc && inZone.pageBreak && inZone.numbering && inZone.bystandersLocked.length === 0
        && byKey.every(done => done === false) && !afterClicks.toc && !afterClicks.pageBreak
        && inRow.locked && inRow.byKey === false && !afterRowClick.rowBreak && !afterRowClick.pageBreak
        && !afterDone.toc && !afterDone.pageBreak && inBody.byKey.every(done => done === true) && bodyMarks.toc && bodyMarks.pageBreak
        && inEmail.toc && inEmail.pageBreak && inMacro.toc && inMacro.pageBreak && !back.toc && !back.pageBreak;
      return { pass, notes: JSON.stringify({ present, inZone, byKey, afterClicks, inRow, afterRowClick, afterDone, inBody, bodyMarks, inEmail, inMacro, back }) };
    },
  });

  // --- Une zone qui n'a qu'un trait (carte du 20/10, choix « Les deux ») : comme un tableau laissé vide, elle montre quelque chose et n'est plus jetée à « Terminer ». ---
  cases.push({
    id: 'hf_a_zone_with_only_a_horizontal_rule_is_kept_at_done_and_shown_and_exported_everywhere',
    description: 'Une zone qui n\'a qu\'une ligne horizontale est gardée à « Terminer » (elle passait pour vide : le trait disparaissait et l\'en-tête était désactivé) et montrée par la zone fermée, la Lecture, le PDF (le trait est peint, le corps à la place que lui donne un en-tête d\'une ligne), Word (un paragraphe à bord bas, même marge qu\'un en-tête d\'une ligne) et le Markdown ; une zone d\'un paragraphe vide ou d\'espaces reste vide',
    run: async (h) => {
      if (!await openHeaderZone(h, '')) return { pass: false, notes: 'zone introuvable' };
      EditorCore.getEditor().commands.setContent('<hr><p></p>', true);
      await h.sleep(150);
      document.getElementById('v2-hf-btn-done').click();
      await h.sleep(300);
      const data = Editor.getHeaderFooterData();
      const kept = data.enabled && /<hr/.test(data.header.default);
      const closed = !!document.querySelector('#editor-container .v2-hf-zone-body hr');
      const counts = ['<hr>', '<hr><p></p>', '<hr/>', '<hr class="x">', '<p>Titre</p><hr>'];
      const blanks = ['', '<p></p>', '<p> </p>', '<p><br></p>'];
      const predicate = { counts: counts.filter(PageLayout.hasZoneContent).length, blanks: blanks.filter(PageLayout.hasZoneContent).length };
      // La Lecture : la bande du haut et son enveloppe qui coupe à la limite portent le trait.
      h.setA4Preview(true);
      await h.renderReaderMode('<p>Corps</p>', hfZones('<hr><p></p>', ''));
      await h.sleep(300);
      const readerRule = !!document.querySelector('#reader-container .v2-page-edge-top .v2-hf-clip hr');
      document.getElementById('reader-container').style.display = '';
      document.getElementById('editor-container').style.display = '';
      document.getElementById('btn-mode-edit').click();
      await h.sleep(60);
      // Le PDF : le trait est peint (la première ligne noire de la page est dans la bande, pas le corps), la bande est réservée comme pour un en-tête d'une ligne.
      const small = await pdfZoneReport(h, '<p>En-tête ligne 1</p>', '');
      const rule = await pdfZoneReport(h, data.header.default, '');
      const black = await h.pdfColorRows(rule.base64, [0, 0, 0]);
      // Word : un paragraphe à bord bas dans l'en-tête, et la marge du haut d'un en-tête d'une ligne.
      const docx = await h.exportDocxParts(HF_BODY, hfZones(data.header.default, ''), null);
      const wordHeader = docx.part('word/header1.xml');
      const wordRule = wordHeader ? wordHeader.getElementsByTagName('w:pBdr').length : 0;
      const wordSmall = await h.exportDocxParts(HF_BODY, hfZones('<p>En-tête ligne 1</p>', ''), null);
      const marginTop = parts => h.docxSectionProps(parts.doc).margins.top;
      const markdown = await h.exportMarkdown(HF_BODY, hfZones(data.header.default, ''));
      const pass = kept && closed && predicate.counts === counts.length && predicate.blanks === 0 && readerRule
        && rule.bodyY !== null && small.bodyY !== null && Math.abs(rule.bodyY - small.bodyY) < 0.5 && !!black && black.top < small.bodyY - 10
        && wordRule === 1 && marginTop(docx) === marginTop(wordSmall)
        && /<!-- publipostage:header -->\s*---\s*<!-- \/publipostage:header -->/.test(markdown.text);
      return { pass, notes: JSON.stringify({ enabled: data.enabled, header: data.header.default, closed, predicate, readerRule, bodyY: [round1(small.bodyY), round1(rule.bodyY)], blackTop: black && black.top, wordRule, margins: [marginTop(docx), marginTop(wordSmall)], markdown: markdown.text.slice(0, 120) }) };
    },
  });

  // --- Le trait d'un en-tête ou d'un pied fermé (carte du 20/10, choix « Même trait ») : « --- » puis Espace fait un trait fin et gris clair pendant qu'on écrit. Une fois la zone terminée,
  // dans les coutures et à la Lecture il reprenait le trait du navigateur (2 px en relief gris, 7 px d'air de chaque côté), plus épais, plus foncé et 5 px moins haut. Il a maintenant celui du corps. ---
  const RULE_BODY = '<p>Un</p><hr><div class="page-break-marker">Saut de page</div><p>Deux</p>';
  const RULE_DATA = () => hfZones('<p>Rapport trimestriel confidentiel</p><hr>', '<hr><p>Société Exemple SA</p>');
  // La boîte du trait comme le navigateur la calcule, en pixels de mise en page : sa hauteur entière (air, trait, air), sa marge, son relief et sa couleur.
  const ruleLook = hr => {
    if (!hr) return null;
    const cs = getComputedStyle(hr);
    return { box: Math.round((parseFloat(cs.height) + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)) * 100) / 100, margin: cs.marginTop + ' ' + cs.marginBottom, border: cs.borderTopWidth, color: cs.backgroundColor };
  };
  // Le trait du corps : 21 px en tout (10 px d'air, 1 px de trait, 10 px d'air), sans marge ni relief, gris clair (#d0d7de).
  const isBodyRule = look => !!look && Math.abs(look.box - 21) < 0.1 && look.margin === '0px 0px' && look.border === '0px' && look.color === 'rgb(208, 215, 222)';

  cases.push({
    id: 'hf_closed_zone_and_seams_draw_the_same_rule_as_the_open_zone_and_the_body',
    description: 'Un trait (« --- ») dans l\'en-tête et le pied a le même aspect dans la zone fermée, dans les coutures et dans la zone ouverte que dans le corps : 21 px de haut en tout, sans marge ni relief, gris clair (il prenait le trait du navigateur, plus épais et plus foncé) ; le premier mot du corps reste à la même place qu\'avec un en-tête de texte',
    run: async (h) => {
      await h.resetEditor();
      h.setA4Preview(true);
      PageLayout.setMarginsMm(null);
      Editor.setHeaderFooterData(RULE_DATA());
      Editor.setHTML(RULE_BODY);
      Editor.refreshLayout();
      await h.sleep(300);
      const root = document.getElementById('editor-container');
      const bodyTop = () => { const p = root.querySelector('.tiptap p'); return p ? p.getBoundingClientRect().top : null; };
      const rules = {
        body: ruleLook(root.querySelector('.tiptap hr')),
        top: ruleLook(root.querySelector('.v2-page-edge-top .v2-hf-zone-body hr')),
        bottom: ruleLook(root.querySelector('.v2-page-edge-bottom .v2-hf-zone-body hr')),
        seamHeader: ruleLook(root.querySelector('.v2-page-band-header hr')),
        seamFooter: ruleLook(root.querySelector('.v2-page-band-footer hr')),
      };
      const topWithRule = bodyTop();
      // La zone ouverte : son trait est celui du corps (la zone fermée doit lui ressembler).
      root.querySelector('.v2-page-edge-top').click();
      await h.sleep(250);
      const open = Editor.isEditingHeaderFooter() ? ruleLook(root.querySelector('.tiptap hr')) : null;
      const done = document.getElementById('v2-hf-btn-done');
      if (done) done.click();
      await h.sleep(250);
      // Le texte de la page ne bouge pas : la bande est la même avec un trait qu'avec deux lignes de texte.
      Editor.setHeaderFooterData(hfZones('<p>Rapport trimestriel confidentiel</p><p>Suite</p>', '<p>Société Exemple SA</p><p>Suite</p>'));
      await h.sleep(300);
      const topWithText = bodyTop();
      const pass = Object.values(rules).every(isBodyRule) && isBodyRule(open) && open.box === rules.top.box && open.color === rules.top.color
        && topWithRule !== null && topWithText !== null && Math.abs(topWithRule - topWithText) < 0.5;
      return { pass, notes: JSON.stringify({ rules, open, bodyTop: [round1(topWithRule), round1(topWithText)] }) };
    },
  });

  cases.push({
    id: 'hf_reader_edges_and_seams_draw_the_same_rule_as_the_reading_body',
    description: 'À la Lecture, le trait d\'un en-tête et d\'un pied (bandes du haut et du bas de la feuille, coutures entre les pages) a la boîte et la couleur de celui du corps : 21 px de haut en tout, sans marge ni relief, gris clair (il prenait le trait du navigateur, plus épais et plus foncé)',
    run: async (h) => {
      await h.resetEditor();
      h.setA4Preview(true); // la Lecture ne pose ses bandes que sous a4-preview
      PageLayout.setMarginsMm(null);
      await h.renderReaderMode(RULE_BODY, RULE_DATA());
      await h.sleep(400);
      const root = document.getElementById('reader-container');
      const rules = {
        body: ruleLook(root.querySelector('.reader-content hr')),
        top: ruleLook(root.querySelector('.v2-page-edge-top hr')),
        bottom: ruleLook(root.querySelector('.v2-page-edge-bottom hr')),
        seamHeader: ruleLook(root.querySelector('.v2-page-band-header hr')),
        seamFooter: ruleLook(root.querySelector('.v2-page-band-footer hr')),
      };
      // renderReaderMode montre les deux conteneurs à la fois (jamais le cas en usage réel) : retour au Mode édition pour les scénarios suivants.
      root.style.display = '';
      document.getElementById('editor-container').style.display = '';
      document.getElementById('btn-mode-edit').click();
      await h.sleep(60);
      const pass = Object.values(rules).every(isBodyRule);
      return { pass, notes: JSON.stringify(rules) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.headerFooter = cases;
})();
