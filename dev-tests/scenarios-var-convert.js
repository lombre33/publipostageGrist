// Suite "varConvert" - « Convertir le texte en variables » (demande d'Antoine du 26/11 : du texte collé de l'extérieur porte les noms de variables en toutes lettres, « #Projets.Total_Fonctionnement_2026 » ;
// on sélectionne une zone et un bouton les bascule en vraies bulles, jamais tout seul à cause des vrais hashtags ; cartes « Sous le bouton Insérer une variable » et « Convertir, la bulle sera orange »).
// Le module (js/variable-convert.js) lit ce que lit déjà un champ texte (Variables.findTextVariables), pose les bulles de la liste « # » en UNE transaction, et sa ligne vit dans le menu au survol du bouton
// « Insérer une variable » (#v2-btn-convert-variables, #v2-variable-group). La vraie souris à 700x400 est dans dev-tests/verify-var-convert-mouse.mjs : une page.evaluate ne déclenche pas un survol.
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const ed = () => EditorCore.getEditor();
  const row = () => document.getElementById('v2-btn-convert-variables');
  const PAGE = 'Projets';

  // La page est sur « Projets » (le tableau d'Antoine) : deux colonnes dont l'une prolonge le nom de l'autre (« …_2026 » et « …_2026_bis » : la plus longue gagne), une Référence vers « Annuaire » (donc liée à la
  // page), une colonne Pièces jointes. « Autres » n'est reliée à rien : sa bulle sera orange.
  async function seed(h) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables('Annuaire', { Nom: 'Text', Email: 'Text' });
    stub.setRows('Annuaire', [{ id: 7, Nom: 'Dupont', Email: 'dupont@ex.fr' }]);
    stub.setVariables('Autres', { Libelle: 'Text' });
    stub.setRows('Autres', [{ id: 1, Libelle: 'x' }]);
    stub.setVariables(PAGE, { Nom: 'Text', Total_Fonctionnement_2026: 'Numeric', Total_Fonctionnement_2026_bis: 'Numeric', Partenaire: 'Ref:Annuaire', Pieces: 'Attachments', gristHelper_Display: 'Text' }, null, { Partenaire: 'gristHelper_Display' });
    stub.setRows(PAGE, [{ id: 1, Nom: 'Alpha', Total_Fonctionnement_2026: 10, Total_Fonctionnement_2026_bis: 11, Partenaire: 7, Pieces: null, gristHelper_Display: 'Dupont' }]);
    await GristAPI.refreshSchema();
    for (const t of ['Annuaire', 'Autres']) await GristAPI.deleteLinkRule(t);
    stub.fireRecord({ id: 1, Nom: 'Alpha' }, PAGE);
    await h.sleep(50);
  }
  async function setDoc(h, html) {
    await seed(h);
    Editor.setHTML(html);
    await sleep(150);
  }
  function posOfText(text) {
    let found = null;
    ed().state.doc.descendants((node, pos) => { if (found == null && node.isText && node.text.indexOf(text) !== -1) found = pos + node.text.indexOf(text); });
    return found;
  }
  // Sélectionne du début de `fromText` à la fin de `toText`.
  async function selectText(fromText, toText) {
    const from = posOfText(fromText);
    const to = posOfText(toText) + toText.length;
    ed().commands.setTextSelection({ from, to });
    await sleep(150);
  }
  // Les bulles et les images liées du document, dans l'ordre, et le texte qui reste.
  function inlineNodes() {
    const out = [];
    ed().state.doc.descendants((node) => {
      if (node.type.name === 'varBadge') out.push({ table: node.attrs.table, column: node.attrs.column, key: node.attrs.key, marks: node.marks.map(m => m.type.name) });
      else if (node.type.name === 'editorImage' && node.attrs.varTable) out.push({ image: node.attrs.varKey, column: node.attrs.varColumn });
    });
    return out;
  }
  const textLeft = () => ed().state.doc.textBetween(0, ed().state.doc.content.size, '|', '¤');
  const rowState = () => ({ disabled: row().getAttribute('aria-disabled') === 'true', greyed: row().classList.contains('v2-hover-row-disabled'), title: row().title || '', reason: row().getAttribute('data-pp-bar-reason') || '' });
  // Un clic comme la souris le donne : la ligne ne prend pas le focus (mousedown retenu), l'éditeur garde sa sélection.
  async function press() {
    row().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    row().click();
    await sleep(150);
  }
  const written = () => Editor.getHTML().replace(/<p><\/p>$/, '');

  cases.push({
    id: 'varconvert_text_in_the_selection_becomes_bubbles_and_one_undo_restores_it',
    description: 'La zone sélectionnée : « #Projets.Total_Fonctionnement_2026 » (la plus longue clé, pas « …_2026_bis » absent) et « #Projets.Nom » deviennent des bulles, le point de fin de phrase reste du texte ; le paragraphe hors de la sélection ne bouge pas ; UN Annuler défait tout',
    run: async (h) => {
      await setDoc(h, '<p>Avant #Projets.Total_Fonctionnement_2026 puis #Projets.Nom.</p><p>Hors zone #Projets.Nom</p>');
      const before = written();
      await selectText('Avant', 'puis #Projets.Nom.');
      await press();
      const nodes = inlineNodes();
      const text = textLeft();
      ed().commands.undo();
      await sleep(150);
      const afterUndo = written();
      const pass = nodes.length === 2 && nodes[0].key === 'Projets.Total_Fonctionnement_2026' && nodes[0].table === PAGE && nodes[0].column === 'Total_Fonctionnement_2026' && nodes[1].key === 'Projets.Nom'
        && text === 'Avant ¤ puis ¤.|Hors zone #Projets.Nom' && afterUndo === before;
      return { pass, notes: JSON.stringify({ nodes, text, undone: afterUndo === before, afterUndo }) };
    },
  });

  cases.push({
    id: 'varconvert_longest_key_wins_and_a_split_run_is_read_as_one',
    description: 'La plus longue colonne l\'emporte (« …_2026_bis »), et une clé que la mise en forme coupe en deux textes (« #Projets.Total_ » en gras puis « Fonctionnement_2026 ») n\'est qu\'une bulle, qui garde le gras',
    run: async (h) => {
      await setDoc(h, '<p>A #Projets.Total_Fonctionnement_2026_bis B</p><p><strong>#Projets.Total_</strong>Fonctionnement_2026 C</p>');
      ed().commands.selectAll();
      await sleep(150);
      await press();
      const nodes = inlineNodes();
      const pass = nodes.length === 2 && nodes[0].key === 'Projets.Total_Fonctionnement_2026_bis' && nodes[1].key === 'Projets.Total_Fonctionnement_2026' && nodes[1].marks.indexOf('bold') !== -1 && nodes[0].marks.length === 0
        && textLeft() === 'A ¤ B|¤ C';
      return { pass, notes: JSON.stringify({ nodes, text: textLeft() }) };
    },
  });

  cases.push({
    id: 'varconvert_a_number_bubble_keeps_the_region_of_the_document_like_the_hash_list_does',
    description: 'Une colonne Nombre convertie garde la région du document à cet instant (attribut `locale`, comme la liste « # »), une colonne Texte n\'en garde pas ; le réglage du document qui change ensuite ne la touche pas',
    run: async (h) => {
      await setDoc(h, '<p>A #Projets.Nom B #Projets.Total_Fonctionnement_2026_bis C</p>');
      try {
        await Templates.updateDocumentSettings({ formatLocale: 'en-GB' });
        ed().commands.selectAll();
        await sleep(150);
        await press();
        const kept = [];
        ed().state.doc.descendants((node) => { if (node.type.name === 'varBadge') kept.push({ key: node.attrs.key, locale: node.attrs.locale }); });
        await Templates.updateDocumentSettings({ formatLocale: 'de-DE' });
        const after = [];
        ed().state.doc.descendants((node) => { if (node.type.name === 'varBadge') after.push(node.attrs.locale); });
        const pass = kept.length === 2 && kept[0].locale === null && kept[1].locale === 'en-GB' && JSON.stringify(after) === JSON.stringify([null, 'en-GB']);
        return { pass, notes: JSON.stringify({ kept, after }) };
      } finally { await Templates.updateDocumentSettings({ formatLocale: null }); }
    },
  });

  cases.push({
    id: 'varconvert_real_hashtags_and_unknown_columns_stay_text_and_the_left_ones_are_counted',
    description: '« #Budget2026 », « #Inconnue.Nom » (table inconnue) et « #Projets.Colonne_inventée » (colonne introuvable) restent du texte ; seul le dernier a la forme d\'une clé d\'une table qui existe : il est compté « laissé tel quel » dans le coin d\'état',
    run: async (h) => {
      await setDoc(h, '<p>#Budget2026 et #Inconnue.Nom et #Projets.Colonne_inventée et #Projets.Nom</p>');
      let detail = null;
      const listen = event => { detail = event.detail; };
      document.addEventListener('pp:variablesConverted', listen);
      ed().commands.selectAll();
      await sleep(150);
      await press();
      document.removeEventListener('pp:variablesConverted', listen);
      const status = document.getElementById('status-msg').textContent;
      const nodes = inlineNodes();
      const pass = nodes.length === 1 && nodes[0].key === 'Projets.Nom' && textLeft() === '#Budget2026 et #Inconnue.Nom et #Projets.Colonne_inventée et ¤' && !!detail && detail.converted === 1 && detail.left === 1
        && status === I18n.t('varConvert.doneLeft', { n: 1, left: 1 });
      return { pass, notes: JSON.stringify({ nodes, text: textLeft(), detail, status }) };
    },
  });

  cases.push({
    id: 'varconvert_a_selection_of_table_cells_is_read_cell_by_cell',
    description: 'Le tableau d\'Antoine : une sélection de cases (ici la première colonne) convertit chaque case sélectionnée, et les cases laissées hors de la sélection gardent leur texte',
    run: async (h) => {
      await setDoc(h, '<table><tbody><tr><td><p>#Projets.Nom</p></td><td><p>#Projets.Total_Fonctionnement_2026</p></td></tr><tr><td><p>#Projets.Nom</p></td><td><p>#Projets.Nom</p></td></tr></tbody></table><p>Après</p>');
      const cells = [];
      ed().state.doc.descendants((node, pos) => { if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') cells.push(pos); });
      ed().commands.setCellSelection({ anchorCell: cells[0], headCell: cells[2] });
      await sleep(150);
      await press();
      const nodes = inlineNodes();
      const cellTexts = [];
      ed().state.doc.descendants((node) => { if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') cellTexts.push(node.textContent); });
      // De la première case à la troisième : la première colonne (deux cases) ; la seconde colonne garde son texte.
      const pass = nodes.length === 2 && cellTexts[0] === '' && cellTexts[1] === '#Projets.Total_Fonctionnement_2026' && cellTexts[2] === '' && cellTexts[3] === '#Projets.Nom'
        && nodes[0].key === 'Projets.Nom' && nodes[1].key === 'Projets.Nom';
      return { pass, notes: JSON.stringify({ nodes: nodes.map(n => n.key), cellTexts }) };
    },
  });

  cases.push({
    id: 'varconvert_a_partial_selection_converts_only_what_it_wholly_contains',
    description: 'Une sélection qui coupe une clé en deux ne la convertit pas : seul le texte ENTIÈREMENT dans la zone devient une bulle',
    run: async (h) => {
      await setDoc(h, '<p>#Projets.Nom et #Projets.Total_Fonctionnement_2026</p>');
      const start = posOfText('#Projets.Nom');
      const cut = posOfText('#Projets.Total_') + 10;
      ed().commands.setTextSelection({ from: start, to: cut });
      await sleep(150);
      await press();
      const nodes = inlineNodes();
      const pass = nodes.length === 1 && nodes[0].key === 'Projets.Nom' && textLeft() === '¤ et #Projets.Total_Fonctionnement_2026';
      return { pass, notes: JSON.stringify({ nodes: nodes.map(n => n.key), text: textLeft() }) };
    },
  });

  cases.push({
    id: 'varconvert_a_reference_path_is_one_bubble_and_an_attachment_column_becomes_the_linked_image',
    description: '« #Projets.Partenaire.Email » est UNE bulle au chemin « Partenaire.Email » (comme dans un champ texte) ; une colonne Pièces jointes devient l\'image liée à la colonne que pose la liste « # », pas une bulle',
    run: async (h) => {
      await setDoc(h, '<p>Contact #Projets.Partenaire.Email, pièce #Projets.Pieces fin</p>');
      ed().commands.selectAll();
      await sleep(150);
      await press();
      const nodes = inlineNodes();
      const pass = nodes.length === 2 && nodes[0].key === 'Projets.Partenaire.Email' && nodes[0].column === 'Partenaire.Email' && nodes[1].image === 'Projets.Pieces' && nodes[1].column === 'Pieces'
        && textLeft() === 'Contact ¤, pièce ¤ fin';
      return { pass, notes: JSON.stringify({ nodes, text: textLeft() }) };
    },
  });

  cases.push({
    id: 'varconvert_a_table_with_no_link_is_converted_without_a_window_and_its_bubble_is_amber',
    description: 'Carte « Convertir, la bulle sera orange » : « #Autres.Libelle », table que rien ne relie à la page, devient une bulle sans ouvrir la fenêtre de la clé de correspondance ; la bulle est orange (« sans lien »), pas rouge',
    run: async (h) => {
      await setDoc(h, '<p>Texte #Autres.Libelle fin</p>');
      ed().commands.selectAll();
      await sleep(150);
      await press();
      await sleep(250);
      const modal = document.getElementById('link-config-modal');
      const modalShown = !!modal && modal.style.display !== 'none';
      const badge = ed().view.dom.querySelector('.var-badge');
      const pass = inlineNodes().length === 1 && !modalShown && !!badge && badge.classList.contains('var-badge-unlinked') && !badge.classList.contains('var-badge-broken');
      return { pass, notes: JSON.stringify({ nodes: inlineNodes(), modalShown, classes: badge ? badge.className : null }) };
    },
  });

  cases.push({
    id: 'varconvert_code_texts_and_bubbles_already_there_are_left_alone',
    description: 'Un bloc de code, un texte sous la marque « code » et les bulles déjà posées ne sont pas touchés ; le reste de la même zone est converti',
    run: async (h) => {
      await setDoc(h, '<p>Un <code>#Projets.Nom</code> et #Projets.Nom</p><pre><code>#Projets.Nom</code></pre>');
      ed().commands.selectAll();
      await sleep(150);
      await press();
      const nodes = inlineNodes();
      const pass = nodes.length === 1 && textLeft().indexOf('#Projets.Nom|#Projets.Nom') === -1 && (textLeft().match(/#Projets\.Nom/g) || []).length === 2;
      return { pass, notes: JSON.stringify({ nodes: nodes.map(n => n.key), text: textLeft() }) };
    },
  });

  cases.push({
    id: 'varconvert_the_row_is_greyed_with_its_reason_without_selection_without_text_and_with_track_changes',
    description: 'La ligne est grisée (jamais retirée) et dit pourquoi : sans sélection, avec une sélection où rien ne se convertit, sous le suivi des modifications ; dégrisée sur une zone qui porte un texte à convertir ; un clic grisé ne change rien',
    run: async (h) => {
      await setDoc(h, '<p>Bonjour tout le monde</p><p>#Projets.Nom ici</p>');
      ed().commands.setTextSelection(3);
      await sleep(150);
      const cursor = rowState();
      await selectText('Bonjour', 'monde');
      const noText = rowState();
      await selectText('#Projets.Nom', 'ici');
      const ready = rowState();
      Editor.setTrackChanges(true);
      await sleep(150);
      ed().commands.setTextSelection({ from: posOfText('#Projets.Nom'), to: posOfText('ici') + 3 });
      await sleep(150);
      const tracking = rowState();
      const docBefore = written();
      await press();
      const unchanged = written() === docBefore;
      Editor.setTrackChanges(false);
      await sleep(100);
      const pass = cursor.disabled && cursor.greyed && cursor.reason === 'varConvert.noSelection' && cursor.title === I18n.t('varConvert.noSelection')
        && noText.disabled && noText.reason === 'varConvert.nothing' && noText.title === I18n.t('varConvert.nothing')
        && !ready.disabled && !ready.greyed && ready.title === ''
        && tracking.disabled && tracking.reason === 'varConvert.tracking' && unchanged;
      return { pass, notes: JSON.stringify({ cursor, noText, ready, tracking, unchanged }) };
    },
  });

  cases.push({
    id: 'varconvert_the_row_lives_in_the_variable_button_menu_and_the_button_click_is_unchanged',
    description: 'Carte « Sous le bouton Insérer une variable » : la ligne est dans le menu au survol du bouton # (#v2-variable-group), le clic du bouton fait toujours ce qu\'il faisait (poser le déclencheur « # »), et la palette de commandes (Alt+/) propose la même action',
    run: async (h) => {
      await setDoc(h, '<p>Bonjour</p>');
      const group = document.getElementById('v2-variable-group');
      const button = document.getElementById('v2-btn-insert-variable');
      const inGroup = !!group && group.contains(button) && group.contains(row()) && !!row().closest('.v2-hover-flyout') && group.classList.contains('v2-hover-group');
      ed().commands.setTextSelection(ed().state.doc.content.size - 1);
      await sleep(100);
      button.click();
      await sleep(150);
      const typed = textLeft();
      const action = Shortcuts.ACTIONS ? Shortcuts.ACTIONS.find(a => a.id === 'convertVariables') : null;
      const paletteHas = !!action || !!document.getElementById('v2-btn-convert-variables');
      const pass = inGroup && typed.indexOf('#') !== -1 && paletteHas && row().textContent.trim() === I18n.t('varConvert.row') && !button.hasAttribute('data-tip');
      return { pass, notes: JSON.stringify({ inGroup, typed, paletteHas, label: row().textContent.trim() }) };
    },
  });

  cases.push({
    id: 'varconvert_the_palette_command_runs_the_same_conversion',
    description: 'La commande « Convertir le texte en variables » de la palette (Shortcuts.run) fait ce que fait la ligne du menu, et ne fait rien quand la ligne est grisée',
    run: async (h) => {
      await setDoc(h, '<p>#Projets.Nom ici</p>');
      ed().commands.setTextSelection(2);
      await sleep(150);
      const idle = await Shortcuts.run('convertVariables');
      const unchanged = inlineNodes().length === 0;
      ed().commands.selectAll();
      await sleep(150);
      await Shortcuts.run('convertVariables');
      await sleep(150);
      const pass = unchanged && !idle && inlineNodes().length === 1;
      return { pass, notes: JSON.stringify({ idle, unchanged, nodes: inlineNodes() }) };
    },
  });

  cases.push({
    id: 'varconvert_the_texts_follow_the_language_in_english',
    lang: 'en',
    description: 'Page qui démarre en anglais : la ligne du menu, son nom accessible, la raison du grisé et la phrase du coin d\'état sont en anglais',
    run: async (h) => {
      await setDoc(h, '<p>Hello #Projets.Nom and #Projets.Oops</p>');
      ed().commands.setTextSelection(2);
      await sleep(150);
      const greyed = rowState();
      ed().commands.selectAll();
      await sleep(150);
      await press();
      const status = document.getElementById('status-msg').textContent;
      const pass = row().textContent.trim() === 'Convert text to variables' && /Convert the/.test(row().getAttribute('aria-label') || '') && greyed.title === I18n.t('varConvert.noSelection') && /^Select an area of text first/.test(greyed.title)
        && status === '1 variable created, 1 text left as is (column not found).';
      return { pass, notes: JSON.stringify({ label: row().textContent.trim(), greyed, status }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.varConvert = cases;
})();
