// Suite "chips" - notes de bas de page (ajout/édition/suppression,
// numérotation, PDF) et chips intelligents Date/Heure (résolution locale,
// aucun appel Grist requis - Email exclu, nécessite Grist réel).
(function () {
  const cases = [];

  async function openHashPanel(h) {
    await h.focusAtEnd();
    await h.typeText('#');
    await h.sleep(60);
  }

  cases.push({
    id: 'chip_footnote_insert_and_edit',
    description: 'Insertion d\'une note de bas de page via le panneau # puis édition de son texte',
    run: async (h) => {
      await h.resetEditor();
      await openHashPanel(h);
      const tabChips = Array.from(document.querySelectorAll('.ac-tab')).find(t => t.textContent === 'Chips' || t.textContent === 'Chips');
      if (!tabChips) return { pass: false, notes: 'onglet Chips introuvable' };
      tabChips.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await h.sleep(40);
      const item = Array.from(document.querySelectorAll('.ac-item')).find(i => /note de bas de page|footnote/i.test(i.textContent));
      if (!item) return { pass: false, notes: 'item note de bas de page introuvable' };
      item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await h.sleep(100);
      const popup = document.getElementById('v2-footnote-popup');
      if (!popup || popup.style.display === 'none') return { pass: false, notes: 'popup non ouverte - html=' + Editor.getHTML() };
      const textarea = popup.querySelector('textarea');
      textarea.focus();
      textarea.value = 'Texte de test de la note';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      const okBtn = Array.from(popup.querySelectorAll('button')).find(b => /OK/i.test(b.textContent));
      okBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await h.sleep(60);
      const html = Editor.getHTML();
      return { pass: html.includes('footnote-ref-marker') && html.includes('Texte de test de la note'), notes: html };
    },
  });

  cases.push({
    id: 'chip_footnote_delete',
    description: 'Le bouton Supprimer du popup retire complètement la note',
    run: async (h) => {
      await h.resetEditor();
      await openHashPanel(h);
      document.querySelectorAll('.ac-tab').forEach(t => { if (t.textContent === 'Chips') t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
      await h.sleep(40);
      const item = Array.from(document.querySelectorAll('.ac-item')).find(i => /note de bas de page/i.test(i.textContent));
      item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await h.sleep(100);
      const popup = document.getElementById('v2-footnote-popup');
      const delBtn = Array.from(popup.querySelectorAll('button')).find(b => /Supprimer/i.test(b.textContent));
      delBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await h.sleep(60);
      const html = Editor.getHTML();
      return { pass: !html.includes('footnote-ref-marker'), notes: html };
    },
  });

  cases.push({
    id: 'chip_footnote_two_notes_numbering',
    description: 'Deux notes de bas de page se numérotent 1 puis 2 (compteur CSS continu)',
    run: async (h) => {
      await h.resetEditor();
      for (let i = 0; i < 2; i++) {
        await h.focusAtEnd();
        await h.typeText('texte ' + i + ' #');
        await h.sleep(60);
        document.querySelectorAll('.ac-tab').forEach(t => { if (t.textContent === 'Chips') t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
        await h.sleep(40);
        const item = Array.from(document.querySelectorAll('.ac-item')).find(it => /note de bas de page/i.test(it.textContent));
        item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        await h.sleep(100);
        const popup = document.getElementById('v2-footnote-popup');
        const okBtn = Array.from(popup.querySelectorAll('button')).find(b => /OK/i.test(b.textContent));
        okBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        await h.sleep(60);
      }
      const markers = h.tiptap().querySelectorAll('.footnote-ref-marker');
      return { pass: markers.length === 2, notes: 'markers=' + markers.length + ' html=' + Editor.getHTML() };
    },
  });

  cases.push({
    id: 'chip_footnote_pdf_placement',
    description: 'Une note de bas de page apparaît dans le PIED DE PAGE du PDF (pas dans le corps)',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.typeText('Corps avec une note #');
      await h.sleep(60);
      document.querySelectorAll('.ac-tab').forEach(t => { if (t.textContent === 'Chips') t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
      await h.sleep(40);
      const item = Array.from(document.querySelectorAll('.ac-item')).find(it => /note de bas de page/i.test(it.textContent));
      item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await h.sleep(100);
      const popup = document.getElementById('v2-footnote-popup');
      const textarea = popup.querySelector('textarea');
      textarea.value = 'Contenu unique de la note de test';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      const okBtn = Array.from(popup.querySelectorAll('button')).find(b => /OK/i.test(b.textContent));
      okBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await h.sleep(60);
      const html = Editor.getHTML();
      const result = await h.exportPdfContent(html, null);
      const bodyHasNoteText = h.findTextBlocks(result.content, b => h.blockPlainText(b).includes('Contenu unique de la note de test')).length > 0;
      // Le footer étant une fonction (currentPage,pageCount)=>contenu (cf.
      // hf_page_number_format_* ci-dessus), même mécanique de lecture ici.
      const footerContent = typeof result.docDefinition.footer === 'function' ? result.docDefinition.footer(1, 1) : null;
      const footerHasNoteText = h.findTextBlocks(footerContent, b => h.blockPlainText(b).includes('Contenu unique de la note de test')).length > 0;
      return { pass: !bodyHasNoteText && footerHasNoteText, notes: JSON.stringify({ bodyHasNoteText, footerHasNoteText }) };
    },
  });

  ['date', 'time'].forEach(kind => {
    cases.push({
      id: 'chip_smart_' + kind + '_insert_and_resolve',
      description: 'Chip "' + (kind === 'date' ? 'Date du jour' : 'Heure actuelle') + '" inséré et résolu (aucun accès Grist nécessaire)',
      run: async (h) => {
        await h.resetEditor();
        await h.focusAtEnd();
        await h.typeText('#');
        await h.sleep(60);
        document.querySelectorAll('.ac-tab').forEach(t => { if (t.textContent === 'Chips') t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
        await h.sleep(40);
        const label = kind === 'date' ? /date du jour|today/i : /heure actuelle|current time/i;
        const item = Array.from(document.querySelectorAll('.ac-item')).find(it => label.test(it.textContent));
        if (!item) return { pass: false, notes: 'item introuvable, items=' + Array.from(document.querySelectorAll('.ac-item')).map(i => i.textContent).join(',') };
        item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        await h.sleep(60);
        const htmlBefore = Editor.getHTML();
        const hasChip = htmlBefore.includes('smart-chip');
        // Résolution : passe par ReaderMode.render (mode Lecture) - aucun
        // GristAPI.fetchTable nécessaire pour Date/Heure (cf. js/reader-mode.js,
        // pure new Date()).
        const wrapper = document.createElement('div');
        wrapper.innerHTML = htmlBefore;
        await ReaderMode.render(htmlBefore, 'FakeTable', {});
        await h.sleep(60);
        const readerContainer = document.getElementById('reader-container');
        const resolvedText = readerContainer ? readerContainer.textContent : '';
        const looksResolved = kind === 'date' ? /\d{4}/.test(resolvedText) : /\d{1,2}:\d{2}/.test(resolvedText);
        // Remet le mode édition pour ne pas perturber le scénario suivant.
        document.getElementById('btn-mode-edit').click();
        await h.sleep(60);
        return { pass: hasChip && looksResolved, notes: 'hasChip=' + hasChip + ' resolvedText="' + resolvedText.trim() + '"' };
      },
    });
  });

  cases.push({
    id: 'chip_footnote_survives_twocolumns_zone',
    // BUG CONFIRMÉ ET CORRIGÉ (cf. AUDIT_CODE_V2.md §4) : buildPdfContentFromRoot
    // (v2/js/pdf-export.js) remettait footnoteCounter/footnoteEntries à zéro à
    // CHAQUE appel, y compris les appels IMBRIQUÉS déclenchés par
    // twoColumnsFrom (un par colonne) - la note de la 1ère colonne traitée
    // disparaissait silencieusement du PDF final (écrasée par la remise à
    // zéro de la 2e colonne), reproductible même sans aucune concurrence
    // réelle. Corrigé en ne remettant à zéro qu'au VRAI appel top-level
    // (nouveau paramètre isTopLevel, déjà utilisé par ailleurs pour la
    // numérotation des titres). Construit le HTML directement (marqueur
    // <sup class="footnote-ref-marker">) plutôt que de passer par l'UI - plus
    // simple pour placer une note dans chaque colonne à coup sûr.
    description: 'Une note de bas de page DANS CHAQUE colonne d\'une zone 2-colonnes apparaît bien deux fois (numérotées 1 et 2) dans le pied de page du PDF, aucune des deux ne disparaît',
    run: async (h) => {
      await h.resetEditor();
      const html = '<div class="two-columns-zone" style="--layout-left: 50%;">'
        + '<div class="two-columns-column"><p>Colonne gauche<sup class="footnote-ref-marker" data-note-id="a" data-note-text="Note colonne gauche">1</sup></p></div>'
        + '<div class="two-columns-column"><p>Colonne droite<sup class="footnote-ref-marker" data-note-id="b" data-note-text="Note colonne droite">1</sup></p></div>'
        + '</div><p></p>';
      Editor.setHTML(html);
      await h.sleep(80);
      const result = await h.exportPdfContent(Editor.getHTML(), null);
      const footerContent = typeof result.docDefinition.footer === 'function' ? result.docDefinition.footer(1, 1) : null;
      const footerJSON = JSON.stringify(footerContent);
      const hasLeft = footerJSON.includes('Note colonne gauche');
      const hasRight = footerJSON.includes('Note colonne droite');
      const numbers = footerJSON.match(/\d\. /g) || [];
      return { pass: hasLeft && hasRight && numbers.length === 2, notes: JSON.stringify({ hasLeft, hasRight, numbers, footerJSON }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.chips = cases;
})();
