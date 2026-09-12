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

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.headerFooter = cases;
})();
