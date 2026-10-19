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
    description: 'Le corps et l\'en-tête ont chacun leur historique : après un passage par l\'en-tête, Annuler défait la dernière frappe du corps (pas celle de l\'en-tête), Rétablir la refait, et l\'en-tête retrouve la sienne',
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
      ed.commands.undo();
      await h.sleep(60);
      const undone = Editor.getHTML();
      const headerKept = header();
      ed.commands.redo();
      await h.sleep(60);
      const redone = Editor.getHTML();
      HeaderFooterPreview.enterHeaderFooterMode('header', 'default');
      await h.sleep(100);
      ed.commands.undo();
      await h.sleep(60);
      const headerUndone = Editor.getHTML();
      const inZone = Editor.isEditingHeaderFooter();
      HeaderFooterPreview.exitHeaderFooterModeIfActive();
      await h.sleep(100);
      const bodyAfter = Editor.getHTML();
      const pass = typed === '<p>Corps un</p>' && undone === '<p>Corps</p>' && /En-tête ABC deux/.test(headerKept) && redone === '<p>Corps un</p>'
        && /^<p>En-tête ABC<\/p>$/.test(headerUndone) && inZone && bodyAfter === '<p>Corps un</p>';
      return { pass, notes: JSON.stringify({ typed, undone, headerKept, redone, headerUndone, inZone, bodyAfter }) };
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
  const hfLogoData = (src, side) => ({
    enabled: true, differentFirstPage: false,
    header: { default: '<p><img class="editor-image" src="' + src + '" alt="" data-layer="normal" data-wrap="inline" data-align="' + side + '" style="width: 100px;">Société Exemple SAS<br>12 rue de la Paix, Paris</p>', first: '' },
    footer: { default: '', first: '' },
  });
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
    description: 'PDF : un logo aligné à gauche ou à droite d\'un en-tête reste dans le fichier, au bord de la page, et son texte se range à côté de lui (le logo sortait du fichier et le texte restait décalé)',
    run: async (h) => {
      await h.resetEditor();
      PageLayout.setMarginsMm(null);
      const logo = h.makeImage(200, 100, { logo: true });
      const margins = PageLayout.getMarginsPt();
      const report = {};
      let pass = true;
      for (const side of HF_LOGO_SIDES) {
        const pdf = await h.exportPdfContent('<p>Corps du courrier</p>', hfLogoData(logo, side), margins);
        const page = (await h.extractPdfGroundTruth(pdf.base64)).pages[0];
        const img = page.images[0];
        // pdf.js rend un mot par élément : le texte de l'en-tête est tout ce qui est peint au-dessus du premier mot du corps.
        const bodyLine = page.textItems.find(t => t.str === 'Corps');
        const lines = bodyLine ? page.textItems.filter(t => t.y < bodyLine.y - 5) : [];
        if (!img || !lines.length || !bodyLine) { report[side] = { images: page.images.length, lines: lines.length, body: !!bodyLine }; pass = false; continue; }
        const atEdge = side === 'left' ? Math.abs(img.x - margins.left) < 1.5 : Math.abs(img.x + img.width - (page.width - margins.right)) < 1.5;
        const beside = lines.every(t => (side === 'left' ? t.x >= img.x + img.width - 0.5 : t.x + t.width <= img.x + 0.5) && t.y < img.y + img.height + 1);
        const clear = bodyLine.y >= img.y + img.height - 1;
        report[side] = { img: { x: round1(img.x), y: round1(img.y), w: round1(img.width), h: round1(img.height) }, lines: lines.map(t => ({ x: round1(t.x), y: round1(t.y), w: round1(t.width) })), atEdge, beside, clear, pageWidth: round1(page.width) };
        pass = pass && page.images.length === 1 && atEdge && beside && clear && Math.abs(img.width - 75) < 1.5;
      }
      return { pass, notes: JSON.stringify(report) };
    },
  });

  cases.push({
    id: 'hf_word_aligned_logo_and_its_text_share_one_borderless_row',
    description: 'Word : un logo aligné à gauche ou à droite d\'un en-tête et son texte sont les deux cases d\'une ligne sans bordure (l\'image ancrée à la marge se superposait au texte), le logo à son bord, sans ancre flottante',
    run: async (h) => {
      await h.resetEditor();
      const logo = h.makeImage(200, 100, { logo: true });
      const report = {};
      let pass = true;
      for (const side of HF_LOGO_SIDES) {
        const docx = await h.exportDocxParts('<p>Corps du courrier</p>', hfLogoData(logo, side), null);
        const header = docx.part('word/header1.xml');
        const tbl = header && header.getElementsByTagName('w:tbl')[0];
        const cells = tbl ? Array.from(tbl.getElementsByTagName('w:tc')) : [];
        const drawings = c => c.getElementsByTagName('w:drawing').length;
        const text = c => Array.from(c.getElementsByTagName('w:t')).map(t => t.textContent).join('|');
        const width = c => { const w = c.getElementsByTagName('w:tcW')[0]; return w ? Number(w.getAttribute('w:w')) : null; };
        const noBorders = tbl && Array.from(tbl.getElementsByTagName('w:tblBorders')[0] ? tbl.getElementsByTagName('w:tblBorders')[0].children : []).every(b => b.getAttribute('w:val') === 'none');
        const anchors = header ? header.getElementsByTagName('wp:anchor').length : -1;
        const imageAt = side === 'left' ? 0 : 1;
        const ok = cells.length === 2 && drawings(cells[imageAt]) === 1 && drawings(cells[1 - imageAt]) === 0
          && text(cells[1 - imageAt]).includes('Société Exemple SAS') && text(cells[1 - imageAt]).includes('12 rue de la Paix')
          && !!noBorders && anchors === 0
          // 100 px d'image = 1500 twips, plus l'air de 12 px du côté du texte (180 twips).
          && Math.abs(width(cells[imageAt]) - 1680) < 30;
        report[side] = { cells: cells.length, imageCell: cells[imageAt] ? { drawings: drawings(cells[imageAt]), width: width(cells[imageAt]) } : null, textCell: cells[1 - imageAt] ? text(cells[1 - imageAt]) : null, noBorders: !!noBorders, anchors };
        pass = pass && ok;
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

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.headerFooter = cases;
})();
