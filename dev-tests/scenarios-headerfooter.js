// Suite "headerFooter" - activation, saisie via setHeaderFooterData (chemin
// direct) ET via le vrai clic sur une zone de marge (chemin UI complet),
// première page différente, formats de numéro de page, persistance du
// contenu par zone/variante.
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

  cases.push({
    id: 'hf_zone_height_limit_blocks_overflow',
    // Bug réel (signalé par l'utilisateur) : la zone d'édition reste visuellement
    // bornée (CSS max-height: 60px + overflow: hidden) mais rien n'empêchait de
    // continuer à taper indéfiniment au-delà - le surplus, invisible ici, débordait
    // aussi de la vraie bande réservée (hauteur fixe) dans le PDF/l'aperçu paginé,
    // chevauchant le corps du document.
    description: 'Appuyer sur Entrée en boucle dans une zone en-tête/pied ne fait plus grandir le contenu au-delà de l\'espace réellement disponible',
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
      for (let i = 0; i < 30; i += 1) { document.execCommand('insertParagraph'); await h.sleep(15); }
      const dom = EditorCore.getEditor().view.dom;
      const pass = dom.scrollHeight <= dom.clientHeight + 1;
      return { pass, notes: JSON.stringify({ scrollHeight: dom.scrollHeight, clientHeight: dom.clientHeight, html: Editor.getHTML() }) };
    },
  });

  cases.push({
    id: 'hf_zone_height_limit_preserves_existing_overflowing_content',
    // Un modèle existant créé AVANT cette limite peut déjà dépasser 60px de
    // contenu - l'entrée en mode édition ne doit jamais le tronquer elle-même,
    // seule une frappe qui l'agrandit ENCORE doit être bloquée.
    description: 'Un en-tête déjà trop long (modèle existant) n\'est pas tronqué à l\'entrée en mode édition, une suppression y reste possible',
    run: async (h) => {
      await h.resetEditor();
      document.getElementById('editor-container').classList.add('a4-preview'); // cf. commentaire hf_enter_via_real_ui_click
      const longHeader = '<p>Ligne un déjà longue</p><p>Ligne deux déjà longue</p><p>Ligne trois déjà longue</p><p>Ligne quatre déjà longue</p>';
      Editor.setHeaderFooterData({ enabled: true, differentFirstPage: false, header: { default: longHeader, first: '' }, footer: { default: '', first: '' } });
      await h.sleep(80);
      const zone = document.querySelector('.v2-hf-zone');
      if (!zone) return { pass: false, notes: 'zone introuvable' };
      zone.click();
      await h.sleep(100);
      const afterEnter = Editor.getHTML();
      const preserved = afterEnter.includes('Ligne un') && afterEnter.includes('Ligne quatre');
      await h.focusAtEnd();
      document.execCommand('delete');
      await h.sleep(30);
      const afterDelete = Editor.getHTML();
      const deleteAllowed = afterDelete.length < afterEnter.length;
      return { pass: preserved && deleteAllowed, notes: JSON.stringify({ afterEnter, afterDelete }) };
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

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.headerFooter = cases;
})();
