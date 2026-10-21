// Suite "chips" - notes de bas de page (ajout/édition/suppression,
// numérotation, PDF) et chips intelligents Date/Heure (résolution locale,
// aucun appel Grist requis - Email exclu, nécessite Grist réel, sauf le texte
// « [Email indisponible] » que le chip écrit quand l'adresse ne se lit pas : il
// suit la langue de l'interface, l'échec est alors fabriqué dans le test).
// Le chip Nom de l'utilisateur, lui, se lit aussi par le faux Grist (colonne Name
// de la table-sonde) et se vérifie en Lecture, dans l'aperçu des exports, le PDF
// et le Word ; un nom qui ressemble à du HTML s'y écrit comme du texte.
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
      const tabChips = Array.from(document.querySelectorAll('.ac-tab')).find(t => t.dataset.tab === 'chips');
      if (!tabChips) return { pass: false, notes: 'onglet des puces introuvable' };
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
      document.querySelectorAll('.ac-tab').forEach(t => { if (t.dataset.tab === 'chips') t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
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
    id: 'chip_footnote_popup_stays_in_the_window_and_clear_of_its_note',
    description: 'Le popup d\'une note tout en bas de la fenêtre s\'ouvre entièrement visible, au-dessus de la note qu\'il édite au lieu de la recouvrir',
    run: async (h) => {
      await h.resetEditor();
      Editor.setHTML('<p>Texte<sup class="footnote-ref-marker" data-note-id="n1" data-note-text="note"></sup> suite</p>');
      await h.sleep(300);
      const editor = EditorCore.getEditor();
      let notePos = null;
      editor.state.doc.descendants((node, pos) => { if (notePos == null && node.type.name === 'footnoteRef') notePos = pos; });
      if (notePos == null) return { pass: false, notes: 'note de bas de page introuvable' };
      // La note est placée tout en bas de la fenêtre en remplaçant la mesure que le popup en prend, plutôt qu'en faisant défiler une page dont la hauteur
      // change d'un banc à l'autre.
      const note = editor.view.nodeDOM(notePos);
      const noteRect = { left: 120, right: 140, top: innerHeight - 60, bottom: innerHeight - 40, width: 20, height: 20 };
      note.getBoundingClientRect = () => noteRect;
      try {
        Editor.openFootnoteEditorAt(notePos);
        await h.sleep(60);
        const popup = document.getElementById('v2-footnote-popup');
        const r = popup.getBoundingClientRect();
        const inside = r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth;
        const clear = r.bottom <= noteRect.top || r.top >= noteRect.bottom;
        Array.from(popup.querySelectorAll('button')).find(b => /OK/i.test(b.textContent)).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        return { pass: inside && clear, notes: JSON.stringify({ popup: { top: r.top, bottom: r.bottom, left: r.left, right: r.right }, note: { top: noteRect.top, bottom: noteRect.bottom }, innerHeight, innerWidth }) };
      } finally { delete note.getBoundingClientRect; }
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
        document.querySelectorAll('.ac-tab').forEach(t => { if (t.dataset.tab === 'chips') t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
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
      document.querySelectorAll('.ac-tab').forEach(t => { if (t.dataset.tab === 'chips') t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
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
        document.querySelectorAll('.ac-tab').forEach(t => { if (t.dataset.tab === 'chips') t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
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

  // L'onglet des puces du panneau « # » (demande d'Antoine du 05/10 : corriger « Chips » en « puces » en français) : « Puces » en français, « Chips » en anglais, et le même mot partout où l'interface
  // française en parle - le nom du bouton « Insérer une variable » et l'aide du caractère déclencheur (Réglages). La page écrit ces textes une fois, dans sa langue de départ (changer de langue
  // recharge la page) : le cas lit la page où il joue, en français, puis une seconde fois dans une page qui démarre en anglais.
  const chipTabCase = {
    id: 'chip_tab_is_called_puces_in_french_and_chips_in_english',
    description: 'L\'onglet des puces du panneau « # » se lit « Puces » dans une page française (« Variables » aussi), et le nom du bouton « Insérer une variable » et l\'aide du caractère déclencheur de Réglages disent le même mot',
    run: async (h) => {
      try {
        await h.resetEditor();
        await openHashPanel(h);
        const got = {
          tabs: Array.from(document.querySelectorAll('#autocomplete-box .ac-tab')).map(t => t.dataset.tab + '=' + t.textContent).join(' | '),
          button: document.getElementById('v2-btn-insert-variable').getAttribute('aria-label'),
          help: document.getElementById('settings-trigger-intro').textContent,
        };
        const want = I18n.getLang() === 'en'
          ? { tabs: 'variables=Variables | chips=Chips', button: 'Insert a variable (#Variable or chip)', help: 'Character to type in the text to open the list of variables and Chips.' }
          : { tabs: 'variables=Variables | chips=Puces', button: 'Insérer une variable (#Variable ou puce)', help: 'Caractère à taper dans le texte pour ouvrir la liste des variables et des Puces.' };
        return { pass: Object.keys(want).every(key => got[key] === want[key]), notes: JSON.stringify({ lang: I18n.getLang(), got, want }) };
      } finally {
        await h.resetEditor();
      }
    },
  };
  cases.push(chipTabCase, Object.assign({}, chipTabCase, {
    id: 'chip_tab_is_called_chips_in_an_english_page',
    lang: 'en',
    description: 'Dans une page qui démarre en anglais, l\'onglet des puces du panneau « # » se lit « Chips » (« Variables » aussi), comme le nom du bouton « Insert a variable » et l\'aide du caractère déclencheur de Réglages',
  }));

  // La puce « N° de ligne » (point 5.1 d'Antoine, 09/10) : proposée par l'onglet Puces de la liste « # » du document, posée comme les autres puces, libellée dans
  // les deux langues, et relue telle quelle depuis le HTML enregistré. Son rang vient d'une zone répétée (suite varLoop) ; elle n'entre pas dans un champ texte (suite
  // fieldEditor, dont l'onglet Puces d'un champ n'a que les quatre puces qui s'écrivent en texte).
  cases.push({
    id: 'chip_row_number_is_offered_by_the_puces_tab_and_comes_back_from_the_html',
    description: 'La puce « N° de ligne » (« Row number » en anglais) est proposée par l’onglet Puces de la liste « # » du document, s’insère comme une puce (data-chip-kind="rowNumber") avec son libellé, et survit à un aller-retour HTML',
    run: async (h) => {
      const previousLang = I18n.getLang();
      try {
        I18n.setLang('fr');
        await h.resetEditor();
        await openHashPanel(h);
        document.querySelectorAll('.ac-tab').forEach(t => { if (t.dataset.tab === 'chips') t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
        await h.sleep(40);
        const rows = Array.from(document.querySelectorAll('#autocomplete-box .ac-item')).map(i => i.textContent.trim());
        const item = Array.from(document.querySelectorAll('#autocomplete-box .ac-item')).find(i => i.textContent.trim() === 'N° de ligne');
        if (!item) return { pass: false, notes: 'item introuvable, lignes=' + rows.join(' | ') };
        item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        await h.sleep(60);
        const html = Editor.getHTML();
        const read = markup => {
          const box = document.createElement('div');
          box.innerHTML = markup;
          return Array.from(box.querySelectorAll('.smart-chip[data-chip-kind="rowNumber"]')).map(c => c.textContent);
        };
        const inserted = read(html);
        Editor.setHTML(html);
        const again = read(Editor.getHTML());
        const labels = { fr: EditorNodes.smartChipLabel('rowNumber') };
        I18n.setLang('en');
        labels.en = EditorNodes.smartChipLabel('rowNumber');
        const pass = rows.includes('Date du jour') && rows.indexOf('N° de ligne') === rows.indexOf('Nom de l’utilisateur') + 1 && rows.indexOf('N° de ligne') > 0
          && JSON.stringify(inserted) === JSON.stringify(['N° de ligne']) && JSON.stringify(again) === JSON.stringify(['N° de ligne'])
          && labels.fr === 'N° de ligne' && labels.en === 'Row number';
        return { pass, notes: JSON.stringify({ rows, inserted, again, labels }) };
      } finally {
        I18n.setLang(previousLang);
        await h.resetEditor();
      }
    },
  });

  // Le chip « Email de l'utilisateur » écrit « [Email indisponible] » quand l'adresse ne peut pas être lue (réseau, portée du jeton insuffisante) : en Lecture et dans
  // les exports (ReaderMode.preview). Le texte suit la langue de l'interface (carte d'Antoine du 30/09, « Traduire ») ; l'échec est fabriqué ici (GristAPI.getCurrentUserEmail
  // rejette, ou rend vide) parce que le cache d'adresse de GristAPI peut avoir été rempli par une autre suite.
  ['fr', 'en'].forEach(lang => cases.push({
    id: 'chip_email_unavailable_follows_interface_language_' + lang,
    description: 'Chip Email dont l\'adresse ne se lit pas (' + lang + ') : « [Email indisponible] » en français, « [Email unavailable] » en anglais, en Lecture comme dans l\'aperçu des exports ; une adresse lisible s\'affiche telle quelle',
    run: async (h) => {
      const previousLang = I18n.getLang();
      const realGetEmail = GristAPI.getCurrentUserEmail;
      try {
        I18n.setLang(lang);
        const html = '<p>Par <span class="smart-chip" contenteditable="false" data-chip-kind="email">Email de l\'utilisateur</span>.</p>';
        const wanted = lang === 'en' ? '[Email unavailable]' : '[Email indisponible]';
        const shownIn = container => Array.from(container.querySelectorAll('.resolved-var')).map(el => ({ text: el.textContent, flagged: el.classList.contains('error-msg') }));
        const got = {};
        const failures = { rejette: async () => { throw new Error('test : jeton insuffisant'); }, vide: async () => '' };
        for (const name of Object.keys(failures)) {
          GristAPI.getCurrentUserEmail = failures[name];
          const box = document.createElement('div');
          box.innerHTML = await ReaderMode.preview(html, 'FakeTable', {});
          await ReaderMode.render(html, 'FakeTable', {});
          got[name] = { preview: shownIn(box), reader: shownIn(document.getElementById('reader-container')) };
        }
        GristAPI.getCurrentUserEmail = async () => 'lecteur@exemple.fr';
        const okBox = document.createElement('div');
        okBox.innerHTML = await ReaderMode.preview(html, 'FakeTable', {});
        got.lisible = shownIn(okBox);
        const same = list => list.length === 1 && list[0].text === wanted && list[0].flagged === true;
        const pass = Object.keys(failures).every(name => same(got[name].preview) && same(got[name].reader))
          && got.lisible.length === 1 && got.lisible[0].text === 'lecteur@exemple.fr' && got.lisible[0].flagged === false;
        return { pass, notes: JSON.stringify(got) };
      } finally {
        GristAPI.getCurrentUserEmail = realGetEmail;
        I18n.setLang(previousLang);
        document.getElementById('btn-mode-edit').click();
        await h.sleep(60);
      }
    },
  }));

  // Le chip « Nom de l'utilisateur » (demande d'Antoine du 04/10, sur le modèle de celui de l'email) : posé par le panneau #, JUSTE APRÈS « Email de l'utilisateur », il se
  // résout comme lui en Lecture, dans l'aperçu des exports, le PDF et le Word, corps et pied de page compris. Le nom vient de GristAPI.getCurrentUserName : le vrai, par le faux
  // Grist (sa table-sonde, d'avant la puce, reçoit sa colonne Name à la première lecture), dans le premier cas ; un faux dans les autres (le cache de GristAPI a pu être rempli par
  // une autre suite). La lecture elle-même (colonne ajoutée une fois, une seule lecture pour plusieurs puces, nom absent, lecteur Grist) est dans unit-user-identity.mjs.
  const NAME_CHIP_HTML = '<p>Par <span class="smart-chip" contenteditable="false" data-chip-kind="name">Nom de l\'utilisateur</span>.</p>';
  const shownChips = container => Array.from(container.querySelectorAll('.resolved-var')).map(el => ({ text: el.textContent, flagged: el.classList.contains('error-msg') }));

  cases.push({
    id: 'chip_name_insert_after_email_and_resolve_with_the_real_reader',
    description: 'Chip Nom : posé par le panneau # juste après « Email de l\'utilisateur », étiquette de l\'éditeur, HTML enregistré qui se rouvre, Lecture avec le nom lu par la vraie GristAPI (colonne Name ajoutée UNE fois à la table-sonde)',
    run: async (h) => {
      const stub = window.__gristStub;
      const previousLang = I18n.getLang();
      try {
        I18n.setLang('fr');
        stub.setUserName('Ada Lovelace');
        await h.resetEditor();
        await h.focusAtEnd();
        await h.typeText('Bonjour ');
        await h.typeText('#');
        await h.sleep(60);
        document.querySelectorAll('.ac-tab').forEach(t => { if (t.dataset.tab === 'chips') t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
        await h.sleep(40);
        const rows = Array.from(document.querySelectorAll('.ac-item')).map(i => i.textContent);
        const nameRow = Array.from(document.querySelectorAll('.ac-item')).find(i => i.textContent === 'Nom de l’utilisateur');
        if (!nameRow) return { pass: false, notes: 'ligne introuvable, lignes=' + rows.join('|') };
        const rightAfterEmail = rows.indexOf('Nom de l’utilisateur') === rows.indexOf('Email de l’utilisateur') + 1 && rows.indexOf('Email de l’utilisateur') > 0;
        nameRow.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        await h.sleep(60);
        const chip = document.querySelector('.tiptap .smart-chip[data-chip-kind="name"]');
        const html = Editor.getHTML();
        const label = chip ? chip.textContent : null;
        // Le HTML enregistré se rouvre avec la même puce (parseHTML), jamais une puce « date » par défaut.
        Editor.setHTML(html);
        await h.sleep(40);
        const reopened = document.querySelector('.tiptap .smart-chip');
        const reopenedKind = reopened ? reopened.getAttribute('data-chip-kind') : null;
        const addColumnBefore = stub.countActions('AddColumn', 'Publipostage_UserProbe');
        await ReaderMode.render(Editor.getHTML(), 'FakeTable', {});
        await h.sleep(60);
        const reader = document.getElementById('reader-container');
        const shown = reader ? shownChips(reader) : [];
        const probeColumns = Object.keys(stub.state.rows.Publipostage_UserProbe).filter(k => k !== 'id');
        const pass = rightAfterEmail && label === 'Nom de l’utilisateur' && html.includes('data-chip-kind="name"') && reopenedKind === 'name'
          && shown.length === 1 && shown[0].text === 'Ada Lovelace' && shown[0].flagged === false && /Bonjour\s+Ada Lovelace/.test(reader.textContent)
          && probeColumns.indexOf('Name') !== -1 && probeColumns.indexOf('Name2') === -1 && stub.countActions('AddColumn', 'Publipostage_UserProbe') <= 1;
        return { pass, notes: JSON.stringify({ rightAfterEmail, rows, label, reopenedKind, shown, probeColumns, addColumn: [addColumnBefore, stub.countActions('AddColumn', 'Publipostage_UserProbe')] }) };
      } finally {
        stub.setUserName(null);
        I18n.setLang(previousLang);
        document.getElementById('btn-mode-edit').click();
        await h.sleep(60);
      }
    },
  });

  // Même repli que l'email, dans la langue de l'interface : « [Nom indisponible] » / « [Name unavailable] » quand le nom ne se lit pas (GristAPI.getCurrentUserName rejette) ou
  // que Grist n'en donne aucun (vide), en rouge ; un nom lisible s'affiche tel quel. Lecture ET aperçu des exports.
  ['fr', 'en'].forEach(lang => cases.push({
    id: 'chip_name_unavailable_follows_interface_language_' + lang,
    description: 'Chip Nom dont le nom ne se lit pas (' + lang + ') : « [Nom indisponible] » en français, « [Name unavailable] » en anglais, en Lecture comme dans l\'aperçu des exports ; un nom lisible s\'affiche tel quel, et l\'étiquette de l\'éditeur suit la langue',
    run: async (h) => {
      const previousLang = I18n.getLang();
      const realGetName = GristAPI.getCurrentUserName;
      try {
        I18n.setLang(lang);
        const wanted = lang === 'en' ? '[Name unavailable]' : '[Nom indisponible]';
        const got = {};
        const failures = { rejette: async () => { throw new Error('test : colonne refusée'); }, vide: async () => '' };
        for (const name of Object.keys(failures)) {
          GristAPI.getCurrentUserName = failures[name];
          const box = document.createElement('div');
          box.innerHTML = await ReaderMode.preview(NAME_CHIP_HTML, 'FakeTable', {});
          await ReaderMode.render(NAME_CHIP_HTML, 'FakeTable', {});
          got[name] = { preview: shownChips(box), reader: shownChips(document.getElementById('reader-container')) };
        }
        GristAPI.getCurrentUserName = async () => 'Ada Lovelace';
        const okBox = document.createElement('div');
        okBox.innerHTML = await ReaderMode.preview(NAME_CHIP_HTML, 'FakeTable', {});
        got.lisible = shownChips(okBox);
        const same = list => list.length === 1 && list[0].text === wanted && list[0].flagged === true;
        // L'étiquette de la puce dans l'éditeur : dans la langue de l'interface (clé chips.name).
        await h.resetEditor();
        Editor.setHTML(NAME_CHIP_HTML);
        await h.sleep(40);
        const chip = document.querySelector('.tiptap .smart-chip[data-chip-kind="name"]');
        got.etiquette = chip ? chip.textContent : null;
        const wantedLabel = lang === 'en' ? 'User’s name' : 'Nom de l’utilisateur';
        const pass = Object.keys(failures).every(name => same(got[name].preview) && same(got[name].reader))
          && got.lisible.length === 1 && got.lisible[0].text === 'Ada Lovelace' && got.lisible[0].flagged === false && got.etiquette === wantedLabel;
        return { pass, notes: JSON.stringify(got) };
      } finally {
        GristAPI.getCurrentUserName = realGetName;
        I18n.setLang(previousLang);
        document.getElementById('btn-mode-edit').click();
        await h.sleep(60);
      }
    },
  }));

  // Les exports lisent le nom comme la Lecture : le PDF et le Word écrivent le nom (jamais l'étiquette du chip) dans le corps ET dans le pied de page ; sans nom, « [Nom indisponible] ».
  cases.push({
    id: 'chip_name_written_in_pdf_and_word_body_and_footer',
    description: 'Chip Nom dans le corps et le pied de page : le vrai PDF et le vrai Word écrivent le nom de la personne, jamais l\'étiquette du chip ; sans nom, « [Nom indisponible] »',
    run: async (h) => {
      const previousLang = I18n.getLang();
      const realGetName = GristAPI.getCurrentUserName;
      try {
        I18n.setLang('fr');
        const footerHtml = NAME_CHIP_HTML.replace('Par', 'Pied de');
        const hf = { enabled: true, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: footerHtml, first: '' } };
        const read = async name => {
          GristAPI.getCurrentUserName = async () => name;
          const pdf = await h.exportPdfContent(NAME_CHIP_HTML, hf);
          const footer = typeof pdf.docDefinition.footer === 'function' ? pdf.docDefinition.footer(1, 1) : null;
          const docx = await h.exportDocxParts(NAME_CHIP_HTML, hf);
          const footerPart = docx.part('word/footer1.xml');
          return {
            pdfBody: h.findTextBlocks(pdf.content, b => h.blockPlainText(b).includes('Par')).map(b => h.blockPlainText(b)).join(' | '),
            pdfFooter: h.findTextBlocks(footer, b => h.blockPlainText(b).includes('Pied de')).map(b => h.blockPlainText(b)).join(' | '),
            docxBody: docx.doc.documentElement.textContent,
            docxFooter: footerPart ? footerPart.documentElement.textContent : '',
          };
        };
        const withName = await read('Ada Lovelace');
        const withoutName = await read('');
        const label = 'Nom de l\'utilisateur';
        const ok = (r, text) => r.pdfBody.includes('Par ' + text + '.') && r.pdfFooter.includes('Pied de ' + text + '.') && r.docxBody.includes('Par ' + text + '.') && r.docxFooter.includes('Pied de ' + text + '.');
        const noLabel = r => !Object.values(r).some(v => v.includes(label));
        return { pass: ok(withName, 'Ada Lovelace') && ok(withoutName, '[Nom indisponible]') && noLabel(withName) && noLabel(withoutName), notes: JSON.stringify({ withName, withoutName }) };
      } finally {
        GristAPI.getCurrentUserName = realGetName;
        I18n.setLang(previousLang);
        document.getElementById('btn-mode-edit').click();
        await h.sleep(60);
      }
    },
  });

  // Le nom est une donnée que choisit la personne (son nom de profil Grist) : js/reader-mode.js:resolveSmartChips l'écrit en TEXTE (textContent), jamais en HTML. Un nom qui ressemble à des balises, à
  // une entité ou à un script garde tous ses caractères en Lecture, dans l'aperçu des exports relu comme un export le relit (innerHTML), le PDF et le Word, et ne crée ni élément ni appel de code.
  cases.push({
    id: 'chip_name_that_looks_like_html_is_written_as_plain_text',
    description: 'Chip Nom : un nom qui ressemble à du HTML (balise, entité, script) s\'écrit tel quel - Lecture, aperçu des exports relu comme le fait un export, PDF et Word - sans créer d\'élément ni lancer de code',
    run: async (h) => {
      const previousLang = I18n.getLang();
      const realGetName = GristAPI.getCurrentUserName;
      const hostile = '<img src=x onerror="window.__nameChipRan=1"><b>Ada</b> &amp; <script>window.__nameChipRan=2<\/script>';
      try {
        I18n.setLang('fr');
        window.__nameChipRan = 0;
        GristAPI.getCurrentUserName = async () => hostile;
        await ReaderMode.render(NAME_CHIP_HTML, 'FakeTable', {});
        const inReader = document.getElementById('reader-container').querySelector('.resolved-var');
        const box = document.createElement('div');
        box.innerHTML = await ReaderMode.preview(NAME_CHIP_HTML, 'FakeTable', {});
        const inPreview = box.querySelector('.resolved-var');
        const pdf = await h.exportPdfContent(NAME_CHIP_HTML, null);
        const docx = await h.exportDocxParts(NAME_CHIP_HTML, null);
        const pdfBody = h.findTextBlocks(pdf.content, b => h.blockPlainText(b).includes('Par')).map(b => h.blockPlainText(b)).join(' | ');
        // Une image « onerror » lancerait son code après le chargement : on lui laisse le temps.
        await h.sleep(250);
        const created = el => el ? el.querySelectorAll('img, b, script, [onerror]').length : -1;
        const pass = !!inReader && inReader.textContent === hostile && created(inReader) === 0
          && !!inPreview && inPreview.textContent === hostile && created(inPreview) === 0
          && pdfBody.includes('Par ' + hostile + '.') && docx.doc.documentElement.textContent.includes('Par ' + hostile + '.')
          && window.__nameChipRan === 0;
        return { pass, notes: JSON.stringify({ reader: inReader && inReader.innerHTML, preview: inPreview && inPreview.innerHTML, pdfBody, ran: window.__nameChipRan }) };
      } finally {
        GristAPI.getCurrentUserName = realGetName;
        I18n.setLang(previousLang);
        delete window.__nameChipRan;
        document.getElementById('btn-mode-edit').click();
        await h.sleep(60);
      }
    },
  });

  cases.push({
    id: 'chip_footnote_survives_twocolumns_zone',
    // DÉFAUT CONFIRMÉ ET CORRIGÉ (cf. AUDIT_CODE.md §4) : buildPdfContentFromRoot
    // (js/pdf-export.js) remettait footnoteCounter/footnoteEntries à zéro à
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

  // --- La puce « Heure actuelle » : 24 heures ou 12 heures, au choix (carte « Les deux » d'Antoine, 21/10) ---
  // Sans réglage, la puce écrit « 14:30 » comme avant ; son réglage (`data-chip-time`) est l'une des écritures de la liste « Heure » d'une bulle sur une colonne « Date et heure »
  // (VariableFormat.TIME_STYLES : colon, natural, ampm, ampmlower) ; une barre au clic de la puce (js/floating-toolbars.js:createTimeChipToolbar) le choisit, dans le document
  // comme dans un champ texte (suite fieldEditor). L'heure est celle de l'appareil : ces cas la figent.
  async function atClock(hour, minute, fn) {
    const RealDate = window.Date;
    const frozen = new RealDate(2026, 8, 12, hour, minute, 0).getTime();
    window.Date = class extends RealDate {
      constructor(...args) { if (args.length) super(...args); else super(frozen); }
      static now() { return frozen; }
    };
    try { return await fn(); } finally { window.Date = RealDate; }
  }
  const inLang = async (lang, fn) => { const before = I18n.getLang(); I18n.setLang(lang); try { return await fn(); } finally { I18n.setLang(before); } };
  const chipHtml = (kind, time) => '<span class="smart-chip" contenteditable="false" data-chip-kind="' + kind + '"' + (time === undefined ? '' : ' data-chip-time="' + time + '"') + '>' + kind + '</span>';
  const previewText = async html => { const box = document.createElement('div'); box.innerHTML = await ReaderMode.preview(html, 'FakeTable', {}); return box.textContent.trim(); };
  const wrongRows = rows => rows.filter(([, got, expected]) => got !== expected).map(([cas, got, expected]) => ({ cas, got, expected }));

  cases.push({
    id: 'chip_time_writes_the_chosen_clock_style',
    description: 'La puce « Heure actuelle » écrit l\'heure de l\'appareil dans son réglage (data-chip-time) : sans réglage - ou avec un réglage vide ou inconnu - « 23:30 » comme avant, « 23 h 30 » en français, « 11:30 PM » et « 11:30pm » ; minuit est « 12:05 AM », midi « 12:00 PM », l\'heure à 12 heures sans zéro de tête ; la puce « Date du jour » ne lit pas ce réglage ; en anglais « 23 h 30 » s\'écrit « 11:30 PM »',
    run: async (h) => {
      await h.resetEditor();
      const read = (hour, minute, time, kind) => atClock(hour, minute, () => previewText('<p>' + chipHtml(kind || 'time', time) + '</p>'));
      const rows = [];
      for (const [label, time, expected] of [
        ['sans réglage : 24 heures comme avant', undefined, '23:30'], ['« colon »', 'colon', '23:30'], ['« natural » en français', 'natural', '23 h 30'], ['« ampm »', 'ampm', '11:30 PM'],
        ['« ampmlower »', 'ampmlower', '11:30pm'], ['réglage inconnu : 24 heures', 'bogus', '23:30'], ['réglage vide : 24 heures', '', '23:30'],
      ]) rows.push([label, await read(23, 30, time), expected]);
      rows.push(['minuit, 12 heures', await read(0, 5, 'ampm'), '12:05 AM'], ['minuit, minuscules', await read(0, 5, 'ampmlower'), '12:05am'], ['minuit, 24 heures', await read(0, 5), '00:05'],
        ['midi, 12 heures', await read(12, 0, 'ampm'), '12:00 PM'], ['midi, minuscules', await read(12, 0, 'ampmlower'), '12:00pm'],
        ['9 h 05 à 12 heures : sans zéro de tête', await read(9, 5, 'ampm'), '9:05 AM'], ['9 h 05 à 24 heures : avec zéro', await read(9, 5), '09:05'],
        ['« Date du jour » ne lit pas le réglage de l\'heure', await read(23, 30, 'ampm', 'date'), '12/09/2026']);
      const en = await inLang('en', async () => {
        const out = [];
        for (const [label, time, expected] of [['sans réglage', undefined, '23:30'], ['« natural » s\'écrit « ampm »', 'natural', '11:30 PM'], ['« ampm »', 'ampm', '11:30 PM'], ['« ampmlower »', 'ampmlower', '11:30pm'], ['« colon »', 'colon', '23:30']]) {
          out.push(['en anglais : ' + label, await read(23, 30, time), expected]);
        }
        return out;
      });
      const failed = wrongRows(rows.concat(en));
      return { pass: failed.length === 0, notes: JSON.stringify(failed) };
    },
  });

  cases.push({
    id: 'chip_time_setting_comes_back_from_the_html_and_no_other_chip_carries_it',
    description: 'Le réglage d\'une puce « Heure actuelle » est enregistré dans le modèle (data-chip-time) et relu tel quel ; une puce sans réglage s\'enregistre comme avant, sans cet attribut ; un réglage inconnu est gardé ; une autre puce (la date du jour) ne le porte pas, même collée avec lui ; la puce d\'un champ texte l\'écrit de la même façon',
    run: async (h) => {
      await h.resetEditor();
      Editor.setHTML('<p>' + chipHtml('time', 'ampmlower') + ' ' + chipHtml('time') + ' ' + chipHtml('date', 'ampm') + ' ' + chipHtml('time', 'bogus') + '</p>');
      await h.sleep(100);
      const html = Editor.getHTML();
      const written = html.match(/data-chip-time="[^"]*"/g) || [];
      const nodes = [];
      EditorCore.getEditor().state.doc.descendants(node => { if (node.type.name === 'smartChip') nodes.push(node.attrs.kind + ':' + node.attrs.time); });
      const html2 = Editor.getHTML();
      const element = (kind, time) => { const el = document.createElement('span'); el.className = 'smart-chip'; el.setAttribute('data-chip-kind', kind); if (time) el.setAttribute('data-chip-time', time); return el; };
      const json = JSON.stringify;
      const checks = {
        written: json(written) === json(['data-chip-time="ampmlower"', 'data-chip-time="bogus"']),
        nodes: json(nodes) === json(['time:ampmlower', 'time:null', 'date:null', 'time:bogus']),
        stable: html2 === html,
        plainChip: /data-chip-kind="time"(?! data-chip-time)[^>]*>/.test(html) && !/data-chip-kind="date"[^>]*data-chip-time/.test(html),
        attrsOf: json([EditorNodes.smartChipAttrsOf(element('time', 'ampm')), EditorNodes.smartChipAttrsOf(element('time')), EditorNodes.smartChipAttrsOf(element('date', 'ampm')), EditorNodes.smartChipAttrsOf(element('email'))])
          === json([{ kind: 'time', time: 'ampm' }, { kind: 'time' }, { kind: 'date' }, { kind: 'email' }]),
        htmlOf: EditorNodes.smartChipHtml({ kind: 'time', time: 'ampm' }).includes('data-chip-time="ampm"') && !EditorNodes.smartChipHtml({ kind: 'time' }).includes('data-chip-time')
          && !EditorNodes.smartChipHtml({ kind: 'email', time: 'ampm' }).includes('data-chip-time') && !EditorNodes.smartChipHtml({ kind: 'time', time: null }).includes('data-chip-time'),
      };
      const failed = Object.keys(checks).filter(key => !checks[key]);
      return { pass: failed.length === 0, notes: failed.join(', ') || json({ html, nodes }) };
    },
  });

  // La barre de la puce : sélectionnée (un clic), la puce « Heure actuelle » montre la liste « Heure » ; choisir une écriture la pose (un seul Annuler), choisir « 23:30 » retire le réglage.
  async function selectChip(h, kind) {
    await h.resetEditor();
    Editor.setHTML('<p>Le ' + chipHtml('time') + ' et ' + chipHtml('date') + ' et ' + chipHtml('email') + '</p>');
    await h.sleep(150);
    const ed = EditorCore.getEditor();
    document.querySelector('.tiptap').focus();
    let pos = -1;
    ed.state.doc.descendants((node, p) => { if (node.type.name === 'smartChip' && node.attrs.kind === kind) pos = p; });
    if (pos === -1) return null;
    ed.commands.setNodeSelection(pos);
    await h.sleep(150);
    return ed;
  }
  const timeBars = () => Array.from(document.querySelectorAll('.v2-timechip-toolbar.visible'));
  const timeSelect = () => (timeBars()[0] ? timeBars()[0].querySelector('select[data-role="chip-time"]') : null);
  const chipTime = () => { const times = []; EditorCore.getEditor().state.doc.descendants(node => { if (node.type.name === 'smartChip' && node.attrs.kind === 'time') times.push(node.attrs.time); }); return times[0]; };
  const choose = async (h, value) => { const select = timeSelect(); select.value = value; select.dispatchEvent(new Event('input', { bubbles: true })); await h.sleep(80); };

  cases.push({
    id: 'chip_time_bar_opens_on_the_chip_and_sets_the_writing',
    description: 'Un clic sur la puce « Heure actuelle » ouvre sa barre : la liste « Heure » (23:30, 23 h 30, 11:30 PM, 11:30pm), sur « 23:30 » tant que rien n\'est réglé, sans « Sans heure » ; choisir « 11:30 PM » ou « 11:30pm » pose le réglage sans fermer la barre, la Lecture l\'écrit, « 23 h 30 » aussi, choisir « 23:30 » retire l\'attribut, un seul « Annuler » rend le réglage d\'avant ; la barre d\'une bulle ne s\'ouvre pas, et ni la date du jour ni l\'e-mail n\'ont de barre',
    run: async (h) => {
      const ed = await selectChip(h, 'time');
      if (!ed) return { pass: false, notes: 'puce introuvable' };
      const steps = {};
      const select = timeSelect();
      steps.open = { bars: timeBars().length, options: select ? Array.from(select.options).map(o => o.value + '=' + o.textContent) : null, title: select && select.title, value: select && select.value, varBar: !!document.querySelector('.v2-varfmt-toolbar.visible') };
      await choose(h, 'ampm');
      steps.ampm = { time: chipTime(), value: timeSelect() && timeSelect().value, open: timeBars().length, stored: /data-chip-time="ampm"/.test(Editor.getHTML()) };
      steps.readAmpm = await atClock(23, 30, () => previewText(Editor.getHTML()));
      await choose(h, 'ampmlower');
      steps.lower = { time: chipTime(), value: timeSelect().value };
      steps.readLower = await atClock(23, 30, () => previewText(Editor.getHTML()));
      await choose(h, 'natural');
      steps.natural = { time: chipTime(), value: timeSelect().value };
      steps.readNatural = await atClock(23, 30, () => previewText(Editor.getHTML()));
      await choose(h, 'colon');
      steps.colon = { time: chipTime(), value: timeSelect().value, stored: /data-chip-time/.test(Editor.getHTML()) };
      await choose(h, 'ampm');
      ed.commands.undo();
      await h.sleep(120);
      steps.undone = { time: chipTime(), value: timeSelect() ? timeSelect().value : null };
      const dateEd = await selectChip(h, 'date');
      steps.dateChip = { bars: timeBars().length, selected: !!dateEd && !!dateEd.state.selection.node };
      const mailEd = await selectChip(h, 'email');
      steps.emailChip = { bars: timeBars().length, selected: !!mailEd && !!mailEd.state.selection.node };
      await selectChip(h, 'time');
      const aside = EditorCore.getEditor();
      aside.commands.setTextSelection(1);
      await h.sleep(120);
      steps.deselected = { bars: timeBars().length };
      const json = JSON.stringify;
      const checks = {
        open: steps.open.bars === 1 && json(steps.open.options) === json(['colon=23:30', 'natural=23 h 30', 'ampm=11:30 PM', 'ampmlower=11:30pm']) && steps.open.title === 'Heure' && steps.open.value === 'colon' && !steps.open.varBar,
        ampm: steps.ampm.time === 'ampm' && steps.ampm.value === 'ampm' && steps.ampm.open === 1 && steps.ampm.stored && steps.readAmpm.startsWith('Le 11:30 PM et 12/09/2026 et '),
        lower: steps.lower.time === 'ampmlower' && steps.lower.value === 'ampmlower' && steps.readLower.startsWith('Le 11:30pm et 12/09/2026 et '),
        natural: steps.natural.time === 'natural' && steps.natural.value === 'natural' && steps.readNatural.startsWith('Le 23 h 30 et 12/09/2026 et '),
        colon: steps.colon.time === null && steps.colon.value === 'colon' && !steps.colon.stored,
        undo: steps.undone.time === null && steps.undone.value === 'colon',
        noBarOnOthers: steps.dateChip.selected && steps.dateChip.bars === 0 && steps.emailChip.selected && steps.emailChip.bars === 0,
        closes: steps.deselected.bars === 0,
      };
      return { pass: Object.values(checks).every(Boolean), notes: json({ checks, steps }) };
    },
  });

  cases.push({
    id: 'chip_time_bar_in_an_english_page_lists_each_writing_once',
    lang: 'en',
    description: 'Page qui démarre en anglais : la liste « Time » de la puce « Current time » propose « 23:30 », « 11:30 PM » et « 11:30pm » - chaque écriture une fois, « natural » et « ampm » écrivant pareil en anglais -, une puce réglée en « natural » montre « 11:30 PM », choisir « 11:30pm » pose « ampmlower » et la Lecture écrit « 11:30pm »',
    run: async (h) => {
      await h.resetEditor();
      Editor.setHTML('<p>' + chipHtml('time', 'natural') + '</p>');
      await h.sleep(150);
      const ed = EditorCore.getEditor();
      document.querySelector('.tiptap').focus();
      let pos = -1;
      ed.state.doc.descendants((node, p) => { if (node.type.name === 'smartChip') pos = p; });
      ed.commands.setNodeSelection(pos);
      await h.sleep(150);
      const select = timeSelect();
      const seen = {
        lang: I18n.getLang(), options: select ? Array.from(select.options).map(o => o.value + '=' + o.textContent) : null, title: select && select.title, natural: select && select.value,
        label: document.querySelector('.tiptap .smart-chip') && document.querySelector('.tiptap .smart-chip').textContent,
      };
      await choose(h, 'ampmlower');
      seen.lower = { time: chipTime(), value: timeSelect().value };
      seen.read = await atClock(23, 30, () => previewText(Editor.getHTML()));
      await choose(h, 'colon');
      seen.readColon = await atClock(23, 30, () => previewText(Editor.getHTML()));
      const json = JSON.stringify;
      const checks = {
        lang: seen.lang === 'en', options: json(seen.options) === json(['colon=23:30', 'ampm=11:30 PM', 'ampmlower=11:30pm']) && seen.title === 'Time', natural: seen.natural === 'ampm',
        label: seen.label === 'Current time', lower: seen.lower.time === 'ampmlower' && seen.lower.value === 'ampmlower' && seen.read === '11:30pm', colon: seen.readColon === '23:30',
      };
      return { pass: Object.values(checks).every(Boolean), notes: json({ checks, seen }) };
    },
  });

  // Les exports lisent le réglage comme la Lecture : le vrai PDF et le vrai Word écrivent l'heure dans l'écriture choisie, dans le corps comme dans le pied de page. L'horloge n'est pas figée (une attente qui
  // compte les millisecondes ne finirait plus) : l'heure est relevée avant et après l'appel, une minute qui change entre-temps ne fausse rien.
  const nowText = style => {
    const d = new Date();
    const hour = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const twelve = (hour % 12 || 12) + ':' + minutes;
    return { colon: String(hour).padStart(2, '0') + ':' + minutes, natural: String(hour).padStart(2, '0') + ' h ' + minutes, ampm: twelve + ' ' + (hour < 12 ? 'AM' : 'PM'), ampmlower: twelve + (hour < 12 ? 'am' : 'pm') }[style];
  };
  cases.push({
    id: 'chip_time_setting_is_written_in_pdf_and_word_body_and_footer',
    description: 'Puce « Heure actuelle » réglée : le vrai PDF et le vrai Word écrivent l\'heure de l\'appareil dans l\'écriture choisie - « 11:30 PM » dans le corps et « 11:30pm » dans le pied de page, puis « 23 h 30 » dans le pied de page - et sur 24 heures (« 23:30 ») sans réglage, comme avant',
    run: async (h) => {
      const previousLang = I18n.getLang();
      try {
        I18n.setLang('fr');
        const read = async (bodyTime, footerTime) => {
          const hf = { enabled: true, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '<p>Pied de ' + chipHtml('time', footerTime) + '.</p>', first: '' } };
          const body = '<p>Reçu à ' + chipHtml('time', bodyTime) + '.</p>';
          const before = { bodyTime, footerTime, colon: nowText('colon'), natural: nowText('natural'), ampm: nowText('ampm'), ampmlower: nowText('ampmlower') };
          const pdf = await h.exportPdfContent(body, hf);
          const footer = typeof pdf.docDefinition.footer === 'function' ? pdf.docDefinition.footer(1, 1) : null;
          const docx = await h.exportDocxParts(body, hf);
          const footerPart = docx.part('word/footer1.xml');
          const got = {
            pdfBody: h.findTextBlocks(pdf.content, b => h.blockPlainText(b).includes('Reçu à')).map(b => h.blockPlainText(b)).join(' | '),
            pdfFooter: h.findTextBlocks(footer, b => h.blockPlainText(b).includes('Pied de')).map(b => h.blockPlainText(b)).join(' | '),
            docxBody: docx.doc.documentElement.textContent,
            docxFooter: footerPart ? footerPart.documentElement.textContent : '',
          };
          const after = { colon: nowText('colon'), natural: nowText('natural'), ampm: nowText('ampm'), ampmlower: nowText('ampmlower') };
          const wrote = (text, lead, style) => [before[style], after[style]].some(clock => text.includes(lead + clock + '.'));
          return { got, ok: wrote(got.pdfBody, 'Reçu à ', bodyTime || 'colon') && wrote(got.docxBody, 'Reçu à ', bodyTime || 'colon') && wrote(got.pdfFooter, 'Pied de ', footerTime || 'colon') && wrote(got.docxFooter, 'Pied de ', footerTime || 'colon') };
        };
        const twelve = await read('ampm', 'ampmlower');
        const natural = await read(undefined, 'natural');
        return { pass: twelve.ok && natural.ok, notes: JSON.stringify({ twelve, natural }) };
      } finally {
        I18n.setLang(previousLang);
        document.getElementById('btn-mode-edit').click();
        await h.sleep(60);
      }
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.chips = cases;
})();
