// Suite "sinonField" - le « Sinon afficher » d'une valeur dans la phrase et d'un bloc de texte conditionnels est un champ à variables (demande d'Antoine du 2026-11-02 :
// « Oui identique partout [...] S'assurer que les variables on peut cliquer dessus et avoir les mêmes options que de base »). Le texte y côtoie des variables tapées avec « # » -
// le champ de l'objet d'un email (js/field-editor.js, js/field-codec.js) monté dans la fenêtre de condition (js/variable-condition.js) -, une ligne pour la valeur, plusieurs pour
// le bloc ; la barre d'une variable de ce champ est celle de la page (js/floating-toolbars.js) et sa condition, son « Avant » / « Après » se règlent dans une seconde fenêtre de
// condition, ouverte par-dessus la première. Écrit dans l'attribut `data-otherwise` du nœud : le texte brut d'avant tant que rien n'oblige à du HTML (un sinon déjà enregistré se
// lit à l'identique), le HTML d'un champ dès qu'une variable porte un réglage ; résolu à la Lecture et aux exports (js/conditional-text.js, js/conditional-value.js).
// Le vrai clavier et la vraie souris sont dans verify-cond-value-mouse.mjs et verify-cond-text-mouse.mjs (scripts condValueMouse et condTextMouse).
(function () {
  const cases = [];

  const TABLE = 'SfDossiers';
  const LINES = 'SfLignes';
  const COND_URGENT = { mode: 'all', rules: [{ column: 'Statut', operator: '=', value: 'Urgent' }] };
  const RECORD_1 = { id: 1, Titre: 'Dossier A', Statut: 'Urgent', Montant: 1200 };
  const RECORD_2 = { id: 2, Titre: 'Dossier B', Statut: 'Normal', Montant: 50 };
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const KEY_TITLE = TABLE + '.Titre';

  const attr = (name, value) => ` ${name}="${JSON.stringify(value).replace(/"/g, '&quot;')}"`;
  // Un attribut HTML écrit à la main (le sinon, tel qu'il est tapé) : « & », les guillemets et « < » protégés, retours à la ligne gardés.
  const escapeAttr = text => String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const otherwiseAttr = otherwise => (otherwise == null ? '' : ` data-otherwise="${escapeAttr(otherwise)}"`);
  const val = (inner, condition, otherwise) => `<span class="conditional-value"${condition ? attr('data-condition', condition) : ''}${otherwiseAttr(otherwise)}>${inner}</span>`;
  const block = (inner, condition, otherwise) => `<div class="conditional-text"${condition ? attr('data-condition', condition) : ''}${otherwiseAttr(otherwise)}>${inner}</div>`;
  const key = (table, column) => Variables.triggerChar() + table + '.' + column;

  async function seed(h) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables(TABLE, { Titre: 'Text', Statut: 'Text', Montant: 'Numeric' });
    stub.setVariables(LINES, { Dossier: 'Ref:' + TABLE, Designation: 'Text', Qte: 'Numeric' });
    stub.setRows(TABLE, [
      { id: 1, Titre: 'Dossier A', Statut: 'Urgent', Montant: 1200 },
      { id: 2, Titre: 'Dossier B', Statut: 'Normal', Montant: 50 },
    ]);
    stub.setRows(LINES, [
      { id: 1, Dossier: 1, Designation: 'Audit', Qte: 1 },
      { id: 2, Dossier: 1, Designation: 'Livret', Qte: 12 },
      { id: 3, Dossier: 1, Designation: 'Déplacement', Qte: 1 },
    ]);
    await GristAPI.refreshSchema();
    await GristAPI.deleteLinkRule(LINES);
    await GristAPI.saveLinkRule(LINES, { mode: 'match', colonneCible: 'Dossier', colonneSource: 'id' });
    await GristAPI.refreshSchema();
    stub.fireRecord(Object.assign({}, RECORD_1), TABLE);
    await h.sleep(50);
  }
  async function setRecord(h, record) {
    window.__gristStub.fireRecord(Object.assign({}, record), TABLE);
    await h.sleep(50);
  }
  // Ce que la Lecture écrit pour ce HTML : le conteneur .reader-content, une fois résolu.
  async function renderReader(html) {
    const reader = document.getElementById('reader-container');
    reader.style.display = 'block';
    await ReaderMode.render(html, TABLE, GristAPI.getCurrentRecord(), NO_HF);
    return reader.querySelector('.reader-content');
  }
  // Ce que reçoivent le PDF, le Word et l'email : ReaderMode.preview, le même HTML résolu que la Lecture.
  async function previewHtml(html) {
    const box = document.createElement('div');
    box.innerHTML = await ReaderMode.preview(html, TABLE, GristAPI.getCurrentRecord());
    return box;
  }
  const shape = root => Array.from(root.children).filter(c => c.tagName !== 'STYLE').map(c => (c.tagName === 'P' ? 'p:' + c.textContent.trim() : c.tagName.toLowerCase())).join(' | ');
  function closeReader() {
    document.getElementById('reader-container').style.display = '';
    document.getElementById('editor-container').style.display = '';
  }

  const ed = () => EditorCore.getEditor();
  const nodeAt = type => { let found = -1; ed().state.doc.descendants((node, pos) => { if (found < 0 && node.type.name === type) found = pos; }); return found; };
  const nodeOf = type => ed().state.doc.nodeAt(nodeAt(type));
  const conditionModal = () => document.getElementById('var-condition-modal');
  const nestedModal = () => document.getElementById('var-condition-modal-2');
  const setInput = (input, value) => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); };
  const valueId = 'var-condition-otherwise-text';
  const areaId = 'var-condition-otherwise-area';
  const field = id => document.getElementById(id);
  const bubblesIn = host => Array.from(host.querySelectorAll('.var-badge')).map(b => b.getAttribute('data-key'));
  const debugLines = modal => Array.from(modal.querySelectorAll('.var-condition-debug-line')).filter(l => !l.hidden).map(l => l.textContent);
  const cancelWindow = modal => modal.querySelector('.var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)').click();
  const saveWindow = async (h, modal) => { modal.querySelector('.var-modal-actions .var-modal-primary').click(); await h.sleep(80); };
  const visible = el => !!el && el.style.display !== 'none' && el.getClientRects().length > 0;
  // Le `data-otherwise` du premier nœud conditionnel du HTML enregistré, relu par un vrai analyseur.
  const writtenOtherwise = () => { const el = new DOMParser().parseFromString(Editor.getHTML(), 'text/html').querySelector('.conditional-value, .conditional-text'); return el ? el.getAttribute('data-otherwise') : undefined; };
  async function openWindow(h, type) {
    VariableCondition.open(ed(), nodeAt(type));
    await h.sleep(120);
    return conditionModal();
  }
  // Colonne choisie comme une personne, dans le champ avec recherche (cf. suite varCondition).
  async function pickColumn(h, row, name) {
    row.querySelector('.macro-rule-column-wrap .ss-trigger').click();
    await h.sleep(30);
    const input = row.querySelector('.macro-rule-column-wrap .ss-panel .ss-input');
    setInput(input, name);
    await h.sleep(10);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await h.sleep(40);
  }
  // Une condition « Statut = Urgent » posée dans la fenêtre ouverte : le champ du sinon se dégrise avec elle.
  async function ruleUrgent(h, modal) {
    const row = modal.querySelector('.macro-rule-row');
    await pickColumn(h, row, 'Statut');
    setInput(row.querySelector('.macro-rule-value'), 'Urgent');
    await h.sleep(60);
  }
  // Les éléments de `FieldCodec` d'une variable de la page, avec un « Avant » et un « Après » : ce que la barre du champ lui fait écrire.
  const framedTitle = () => ({ badge: Object.assign({}, FieldCodec.itemsOf(key(TABLE, 'Titre'))[0].badge, { before: '« ', after: ' »' }) });
  const plainTitle = () => FieldCodec.itemsOf(key(TABLE, 'Titre'))[0];

  // La barre de la variable choisie dans un champ : sa bulle sélectionnée, puis la barre visible (il n'y en a qu'une, celles de la page se cachent quand une fenêtre est ouverte).
  async function selectBubble(h, id) {
    const editor = FieldEditor.of(field(id));
    let pos = -1;
    editor.state.doc.descendants((node, at) => { if (pos < 0 && node.type.name === 'varBadge') pos = at; });
    editor.commands.focus();
    editor.commands.setNodeSelection(pos);
    await h.sleep(200);
    return Array.from(document.querySelectorAll('.v2-varfmt-toolbar')).filter(visible);
  }
  const pressBar = (bar, action) => bar.querySelector(`button[data-action="${action}"]`).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

  // === Le codec : lignes, espaces, écriture ===
  cases.push({
    id: 'sinonfield_codec_reads_lines_keeps_the_spaces_of_a_value_and_writes_plain_or_rich',
    description: 'FieldCodec lit un sinon en lignes (le texte brut se coupe à ses retours à la ligne, le HTML a un paragraphe par ligne), garde les espaces des deux bouts quand on le lui demande (le sinon d’une valeur), nettoie les lignes d’un bloc (espaces des deux bouts, lignes vides) et l’écrit en texte brut tant qu’il se relit à l’identique, en HTML dès qu’une variable porte un réglage ; les variables qu’il cite se lisent sur toutes ses lignes',
    run: async (h) => {
      await seed(h);
      const rawLines = FieldCodec.linesOf('une\n\n deux ').map(FieldCodec.serializePlain);
      const cleaned = FieldCodec.cleanLines(FieldCodec.linesOf('une\n\n deux ')).map(FieldCodec.serializePlain);
      const spaces = { kept: FieldCodec.toStored([{ text: ' x ' }], { keepSpaces: true }), trimmed: FieldCodec.toStored([{ text: ' x ' }]) };
      const plainLines = FieldCodec.toStoredLines([[{ text: 'a' }], [], [{ text: ' b ' }]]);
      const plainWithKey = FieldCodec.toStoredLines([[{ text: 'Dossier ' }, plainTitle()], [{ text: 'fin' }]]);
      const rich = FieldCodec.toStoredLines([[{ text: 'A ' }, framedTitle()], [{ text: 'B' }]]);
      const richLines = FieldCodec.linesOf(rich);
      const richValue = FieldCodec.toStored([{ text: 'Total : ' }, framedTitle()]);
      const cited = FieldCodec.variablesIn(rich).map(v => v.table + '.' + v.column);
      const checks = {
        rawLines: JSON.stringify(rawLines) === JSON.stringify(['une', '', ' deux ']),
        cleaned: JSON.stringify(cleaned) === JSON.stringify(['une', 'deux']),
        spaces: spaces.kept === ' x ' && spaces.trimmed === 'x',
        plainLines: plainLines === 'a\nb',
        plainWithKey: plainWithKey === 'Dossier ' + key(TABLE, 'Titre') + '\nfin',
        richIsHtml: FieldCodec.isRich(rich) && (rich.match(/<p class="pp-field">/g) || []).length === 2 && rich.indexOf('data-before') !== -1,
        richLines: richLines.length === 2 && richLines[0].length === 2 && richLines[0][1].badge.before === '« ' && richLines[0][1].badge.after === ' »' && richLines[1][0].text === 'B',
        richValue: FieldCodec.isRich(richValue) && FieldCodec.itemsOf(richValue).length === 2,
        cited: JSON.stringify(cited) === JSON.stringify([KEY_TITLE]),
        none: FieldCodec.toStoredLines([[], [{ text: '  ' }]]) === '' && FieldCodec.variablesIn('rien') .length === 0,
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: failed.length ? JSON.stringify({ failed, rawLines, cleaned, spaces, plainLines, plainWithKey, rich }) : 'ok' };
    },
  });

  // === La fenêtre d'une valeur ===
  cases.push({
    id: 'sinonfield_value_window_otherwise_is_a_field_with_variables_saved_reopened_and_cancelled',
    description: 'Le « Sinon afficher » d’une valeur est un champ à variables (une zone de saisie d’une ligne, 200 caractères, son texte d’attente qui cite « #Variable ») : une clé tapée en entier y devient une bulle, l’aperçu de la ligne sélectionnée lit la variable (« à régler pour Dossier B »), Enregistrer écrit le texte brut d’avant tant que la variable n’a aucun réglage et le HTML d’un champ dès qu’elle en a un (« Avant » / « Après »), rouverte la fenêtre rend le champ avec ses bulles, Annuler n’écrit rien',
    run: async (h) => {
      await seed(h);
      await setRecord(h, RECORD_2);
      Editor.setHTML('<p>Avant ' + val('Texte') + ' après</p>');
      await h.sleep(80);
      let modal = await openWindow(h, 'conditionalValue');
      const input = field(valueId);
      const editor = FieldEditor.of(input);
      const shown = {
        tag: input.tagName, editor: !!editor, textbox: !!input.querySelector('.pp-field-text[role="textbox"][aria-multiline="false"]'), max: input.maxLength, placeholder: input.placeholder,
        greyAtStart: input.disabled, greyTitle: input.closest('.var-condition-otherwise-field').title,
      };
      await ruleUrgent(h, modal);
      shown.ready = !input.disabled;
      shown.title = input.closest('.var-condition-otherwise-field').title;
      setInput(input, 'à régler pour ' + key(TABLE, 'Titre'));
      await h.sleep(700);
      const typed = { bubbles: bubblesIn(input), value: input.value, preview: debugLines(modal)[0] };
      await saveWindow(h, modal);
      const plain = { otherwise: nodeOf('conditionalValue').attrs.otherwise, written: writtenOtherwise() };
      await h.sleep(650);
      modal = await openWindow(h, 'conditionalValue');
      const reopened = { bubbles: bubblesIn(field(valueId)), value: field(valueId).value, disabled: field(valueId).disabled };
      setInput(field(valueId), FieldCodec.toStored([{ text: 'à régler : ' }, framedTitle()]));
      await h.sleep(700);
      const framed = { bubbles: bubblesIn(field(valueId)), preview: debugLines(modal)[0] };
      await saveWindow(h, modal);
      const rich = { otherwise: nodeOf('conditionalValue').attrs.otherwise, written: writtenOtherwise() };
      await h.sleep(650);
      modal = await openWindow(h, 'conditionalValue');
      setInput(field(valueId), 'autre chose');
      cancelWindow(modal);
      await h.sleep(60);
      const afterCancel = nodeOf('conditionalValue').attrs.otherwise;
      const pass = shown.tag === 'DIV' && shown.editor && shown.textbox && shown.max === 200 && shown.placeholder === I18n.t('varCond.otherwiseTextPlaceholder') && shown.placeholder.indexOf('#Variable') !== -1
        && shown.greyAtStart && shown.ready && shown.greyTitle === I18n.t('varCond.otherwiseTextNeedsRule') && shown.title === I18n.t('varCond.otherwiseTextTitle') && /#/.test(shown.title)
        && JSON.stringify(typed.bubbles) === JSON.stringify([KEY_TITLE]) && typed.value === 'à régler pour ' + key(TABLE, 'Titre') && /à régler pour Dossier B/.test(typed.preview)
        && plain.otherwise === 'à régler pour ' + key(TABLE, 'Titre') && plain.written === plain.otherwise
        && JSON.stringify(reopened.bubbles) === JSON.stringify([KEY_TITLE]) && reopened.value === plain.otherwise && !reopened.disabled
        && JSON.stringify(framed.bubbles) === JSON.stringify([KEY_TITLE]) && /à régler : « Dossier B »/.test(framed.preview)
        && FieldCodec.isRich(rich.otherwise) && rich.written === rich.otherwise && rich.otherwise.indexOf('data-before') !== -1
        && afterCancel === rich.otherwise;
      return { pass, notes: JSON.stringify({ shown, typed, plain, reopened, framed, rich, afterCancel }) };
    },
  });

  cases.push({
    id: 'sinonfield_value_otherwise_of_before_reads_as_before',
    description: 'Un sinon de valeur enregistré avant les variables (texte brut) se lit à l’identique à la Lecture et dans ce que reçoivent le PDF, le Word et l’email : espaces des deux bouts comprises, une clé qui n’est pas une colonne reste du texte, la valeur seule quand la condition est remplie',
    run: async (h) => {
      try {
        await seed(h);
        const html = '<p>C ' + val('Texte', COND_URGENT, ' ancien  texte ') + ' D</p>'
          + '<p>E ' + val('Texte', COND_URGENT, 'sans clé : ' + key('Inconnue', 'Colonne')) + ' F</p>';
        const read1 = shape(await renderReader(html));
        await setRecord(h, RECORD_2);
        const read2 = shape(await renderReader(html));
        const prev2 = shape(await previewHtml(html));
        const want2 = 'p:C  ancien  texte  D | p:E sans clé : ' + key('Inconnue', 'Colonne') + ' F';
        return { pass: read1 === 'p:C Texte D | p:E Texte F' && read2 === want2 && prev2 === want2, notes: JSON.stringify({ read1, read2, prev2 }) };
      } finally { closeReader(); }
    },
  });

  cases.push({
    id: 'sinonfield_value_otherwise_is_read_with_its_variables',
    description: 'À la Lecture et dans ce que reçoivent le PDF, le Word et l’email : le sinon d’une valeur écrit ses variables comme le document - leur « Avant » / « Après », la valeur de la ligne -, qu’elles soient écrites en HTML de champ ou, sans réglage, en texte brut ; la valeur seule quand sa condition est remplie',
    run: async (h) => {
      try {
        await seed(h);
        const rich = FieldCodec.toStored([{ text: 'Dossier ' }, framedTitle(), { text: ' à voir' }]);
        const html = '<p>A ' + val('Texte', COND_URGENT, rich) + ' B</p>'
          + '<p>G ' + val('Texte', COND_URGENT, 'courant : ' + key(TABLE, 'Titre')) + ' H</p>';
        const read1 = shape(await renderReader(html));
        await setRecord(h, RECORD_2);
        const read2 = shape(await renderReader(html));
        const prev2 = shape(await previewHtml(html));
        const want2 = 'p:A Dossier « Dossier B » à voir B | p:G courant : Dossier B H';
        return { pass: read1 === 'p:A Texte B | p:G Texte H' && read2 === want2 && prev2 === want2, notes: JSON.stringify({ read1, read2, prev2 }) };
      } finally { closeReader(); }
    },
  });

  cases.push({
    id: 'sinonfield_value_otherwise_variable_takes_the_row_of_a_repeated_table_line',
    description: 'Dans une ligne de tableau répétée, le sinon d’une valeur lit la ligne du tour pour ses variables : « courant : Audit », « courant : Déplacement » aux tours où la condition n’est pas remplie, la valeur au tour qui la remplit',
    run: async (h) => {
      try {
        await seed(h);
        const loop = { repeat: 'row', table: LINES, empty: 'header' };
        const designation = `<span class="var-badge" data-table="${LINES}" data-column="Designation" data-key="${LINES}.Designation"${attr('data-loop', loop)} data-loop-repeat="row"></span>`;
        const bigQuantity = { mode: 'all', rules: [{ column: LINES + '.Qte', operator: '>', value: '5' }] };
        const table = '<table><tbody><tr><th><p>Désignation</p></th><th><p>Remarque</p></th></tr>'
          + '<tr><td><p>' + designation + '</p></td><td><p>Remarque : ' + val('gros volume', bigQuantity, 'courant : ' + key(LINES, 'Designation')) + '</p></td></tr></tbody></table>';
        const reader = await renderReader(table);
        const rows = Array.from(reader.querySelectorAll('tr')).map(tr => Array.from(tr.children).map(c => c.textContent.trim()).join(' | '));
        const pass = JSON.stringify(rows) === JSON.stringify(['Désignation | Remarque', 'Audit | Remarque : courant : Audit', 'Livret | Remarque : gros volume', 'Déplacement | Remarque : courant : Déplacement']);
        return { pass, notes: JSON.stringify(rows) };
      } finally { closeReader(); }
    },
  });

  // === La fenêtre d'un bloc ===
  cases.push({
    id: 'sinonfield_block_window_otherwise_is_a_multiline_field_one_paragraph_per_line_with_variables',
    description: 'Le « Sinon afficher » d’un bloc est un champ à variables de plusieurs lignes (1000 caractères, Entrée change de ligne) : les lignes vides et les espaces des deux bouts tombent à l’enregistrement, une ligne cite une variable, l’aperçu la lit, la Lecture écrit un paragraphe par ligne (« Dossier Dossier B », « à suivre ») ; avec une variable réglée le sinon est écrit en HTML, un paragraphe par ligne, et se relit pareil',
    run: async (h) => {
      try {
        await seed(h);
        await setRecord(h, RECORD_2);
        Editor.setHTML('<p>Avant</p>' + block('<p>Texte</p>') + '<p>Après</p>');
        await h.sleep(80);
        let modal = await openWindow(h, 'conditionalText');
        const area = field(areaId);
        const shown = {
          tag: area.tagName, textbox: !!area.querySelector('.pp-field-text[role="textbox"][aria-multiline="true"]'), max: area.maxLength, placeholder: area.placeholder, greyAtStart: area.disabled,
        };
        await ruleUrgent(h, modal);
        await h.fieldType(areaId, 'une');
        h.fieldKey(areaId, 'Enter');
        await h.fieldType(areaId, 'deux', true);
        const enter = { paragraphs: FieldEditor.of(area).state.doc.childCount, value: area.value };
        setInput(area, 'Dossier ' + key(TABLE, 'Titre') + '\n\n  à suivre  ');
        await h.sleep(700);
        const typed = { bubbles: bubblesIn(area), value: area.value, preview: debugLines(modal)[0] };
        await saveWindow(h, modal);
        const plain = { otherwise: nodeOf('conditionalText').attrs.otherwise, written: writtenOtherwise() };
        const html1 = Editor.getHTML();
        const read1 = shape(await renderReader(html1));
        closeReader();
        await h.sleep(650);
        modal = await openWindow(h, 'conditionalText');
        const reopened = { bubbles: bubblesIn(field(areaId)), value: field(areaId).value };
        setInput(field(areaId), FieldCodec.toStoredLines([[{ text: 'Dossier ' }, framedTitle()], [{ text: 'fin' }]]));
        await h.sleep(60);
        await saveWindow(h, modal);
        const rich = { otherwise: nodeOf('conditionalText').attrs.otherwise };
        const read2 = shape(await renderReader(Editor.getHTML()));
        const pass = shown.tag === 'DIV' && shown.textbox && shown.max === 1000 && shown.placeholder === I18n.t('varCond.otherwiseBlockPlaceholder') && shown.placeholder.indexOf('#Variable') !== -1 && shown.greyAtStart
          && enter.paragraphs === 2 && enter.value === 'une\ndeux'
          && JSON.stringify(typed.bubbles) === JSON.stringify([KEY_TITLE]) && typed.value === 'Dossier ' + key(TABLE, 'Titre') + '\nà suivre' && /Dossier Dossier B \/ à suivre/.test(typed.preview)
          && plain.otherwise === typed.value && plain.written === typed.value && read1 === 'p:Avant | p:Dossier Dossier B | p:à suivre | p:Après'
          && JSON.stringify(reopened.bubbles) === JSON.stringify([KEY_TITLE]) && reopened.value === typed.value
          && FieldCodec.isRich(rich.otherwise) && (rich.otherwise.match(/<p class="pp-field">/g) || []).length === 2 && read2 === 'p:Avant | p:Dossier « Dossier B » | p:fin | p:Après';
        return { pass, notes: JSON.stringify({ shown, enter, typed, plain, reopened, rich, read1, read2 }) };
      } finally { closeReader(); }
    },
  });

  cases.push({
    id: 'sinonfield_block_otherwise_of_before_reads_as_before',
    description: 'Un sinon de bloc enregistré avant les variables (texte brut, une ligne par ligne, lignes vides et espaces des deux bouts) se lit à l’identique : un paragraphe par ligne, sans les lignes vides ni les espaces des bouts ; la condition remplie écrit le bloc',
    run: async (h) => {
      try {
        await seed(h);
        const html = '<p>Avant</p>' + block('<p>Texte</p>', COND_URGENT, '  ligne un  \n\n   ligne deux \n') + '<p>Après</p>';
        const read1 = shape(await renderReader(html));
        await setRecord(h, RECORD_2);
        const read2 = shape(await renderReader(html));
        const prev2 = shape(await previewHtml(html));
        const want2 = 'p:Avant | p:ligne un | p:ligne deux | p:Après';
        return { pass: read1 === 'p:Avant | p:Texte | p:Après' && read2 === want2 && prev2 === want2, notes: JSON.stringify({ read1, read2, prev2 }) };
      } finally { closeReader(); }
    },
  });

  cases.push({
    id: 'sinonfield_fields_stop_at_their_limit_like_an_input',
    description: 'Les deux champs gardent leur limite comme un <input> : 200 caractères pour la valeur, 1000 pour le bloc, une saisie qui la dépasserait est refusée en bloc (une clé compte pour ses caractères « #Clé »), effacer reste possible',
    run: async (h) => {
      await seed(h);
      Editor.setHTML('<p>Avant ' + val('Texte') + ' après</p>' + block('<p>Bloc</p>'));
      await h.sleep(80);
      const out = {};
      for (const [type, id, max] of [['conditionalValue', valueId, 200], ['conditionalText', areaId, 1000]]) {
        const modal = await openWindow(h, type);
        await ruleUrgent(h, modal);
        const input = field(id);
        const editor = FieldEditor.of(input);
        setInput(input, 'x'.repeat(max));
        editor.commands.insertContent('y');
        const atLimit = input.value.length;
        editor.commands.deleteRange({ from: 1, to: 3 });
        editor.commands.insertContent('z');
        out[type] = { max: input.maxLength, atLimit, afterErase: input.value.length, endsWith: input.value.slice(-1), startsWith: input.value.slice(0, 1) };
        cancelWindow(modal);
        await h.sleep(60);
      }
      const pass = out.conditionalValue.max === 200 && out.conditionalValue.atLimit === 200 && out.conditionalValue.afterErase === 199
        && out.conditionalText.max === 1000 && out.conditionalText.atLimit === 1000 && out.conditionalText.afterErase === 999;
      return { pass, notes: JSON.stringify(out) };
    },
  });

  // === Les variables du champ : leur barre, leur seconde fenêtre ===
  cases.push({
    id: 'sinonfield_variable_in_the_field_has_the_bar_of_a_page_variable_and_its_condition_opens_a_second_window',
    description: 'Une variable du « Sinon afficher » se clique : sa barre a les mêmes boutons que celle d’une variable de la page (condition, autres attributs, boucle, liste, colonne, format) ; « Condition » ouvre une seconde fenêtre de condition par-dessus la première (la barre se cache pendant qu’elle est ouverte), son « Avant » / « Après » revient dans le champ à Enregistrer, Annuler le laisse tel quel, et la première fenêtre garde son brouillon jusqu’à son Enregistrer',
    run: async (h) => {
      await seed(h);
      await setRecord(h, RECORD_2);
      Editor.setHTML('<p>Dossier ' + `<span class="var-badge" data-table="${TABLE}" data-column="Titre" data-key="${KEY_TITLE}"></span>` + '</p><p>Avant ' + val('Texte') + ' après</p>');
      await h.sleep(80);
      // La barre d'une variable de la page, pour la comparer : le même jeu de boutons.
      let pageBar = null;
      ed().commands.setNodeSelection(nodeAt('varBadge'));
      await h.sleep(200);
      pageBar = Array.from(document.querySelectorAll('.v2-varfmt-toolbar')).filter(visible)[0];
      const actions = bar => Array.from(bar.querySelectorAll('button[data-action]')).map(b => b.dataset.action);
      const pageActions = pageBar ? actions(pageBar) : [];
      let modal = await openWindow(h, 'conditionalValue');
      await ruleUrgent(h, modal);
      setInput(field(valueId), 'à régler pour ' + key(TABLE, 'Titre'));
      await h.sleep(60);
      const bars = await selectBubble(h, valueId);
      const fieldActions = bars[0] ? actions(bars[0]) : [];
      const sameButtons = JSON.stringify(fieldActions) === JSON.stringify(pageActions);
      pressBar(bars[0], 'var-condition');
      await h.sleep(150);
      const nested = nestedModal();
      const opened = {
        first: visible(modal), second: visible(nested), isOpen1: VariableCondition.isOpen(1), barsLeft: Array.from(document.querySelectorAll('.v2-varfmt-toolbar')).filter(visible).length,
        secondOnTop: (() => { const r = nested.querySelector('.pp-modal-box').getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + 20); return !!top && nested.contains(top); })(),
        titleIds: [modal.querySelector('h3').id, nested.querySelector('h3').id],
      };
      setInput(document.getElementById('var-condition-before-2'), '« ');
      setInput(document.getElementById('var-condition-after-2'), ' »');
      await h.sleep(60);
      cancelWindow(nested);
      await h.sleep(60);
      const afterCancel = field(valueId).value;
      const barsBack = await selectBubble(h, valueId);
      pressBar(barsBack[0], 'var-condition');
      await h.sleep(150);
      setInput(document.getElementById('var-condition-before-2'), '« ');
      setInput(document.getElementById('var-condition-after-2'), ' »');
      await h.sleep(60);
      await saveWindow(h, nestedModal());
      const applied = { second: visible(nestedModal()), first: visible(conditionModal()), value: field(valueId).value, nodeStillPlain: nodeOf('conditionalValue').attrs.otherwise == null };
      await h.sleep(700);
      applied.preview = debugLines(conditionModal())[0];
      await saveWindow(h, conditionModal());
      const saved = nodeOf('conditionalValue').attrs.otherwise;
      const pass = pageActions.length > 5 && sameButtons
        && opened.first && opened.second && opened.isOpen1 && opened.barsLeft === 0 && opened.secondOnTop && opened.titleIds[0] !== opened.titleIds[1]
        && afterCancel === 'à régler pour ' + key(TABLE, 'Titre')
        && !applied.second && applied.first && FieldCodec.isRich(applied.value) && /data-before="« "/.test(applied.value) && applied.nodeStillPlain && /à régler pour « Dossier B »/.test(applied.preview)
        && saved === applied.value;
      return { pass, notes: JSON.stringify({ pageActions, fieldActions, opened, afterCancel, applied, saved }) };
    },
  });

  cases.push({
    id: 'sinonfield_a_window_opened_from_the_bar_of_a_field_variable_goes_over_the_condition_window',
    description: 'Une fenêtre ouverte par la barre d’une variable du « Sinon afficher » (la boucle, déjà créée avant la fenêtre de condition) passe devant elle, quel que soit l’ordre où leurs cadres ont été créés ; refermée, la fenêtre de condition est de nouveau devant et le champ garde sa variable',
    run: async (h) => {
      await seed(h);
      Editor.setHTML('<p>Avant ' + val('Texte') + ' après</p>');
      await h.sleep(80);
      let modal = await openWindow(h, 'conditionalValue');
      await ruleUrgent(h, modal);
      setInput(field(valueId), 'pour ' + key(TABLE, 'Titre'));
      await h.sleep(60);
      // La fenêtre de la boucle existe déjà (ouverte une fois, sur une variable de la page) et son cadre est AVANT celui de la fenêtre de condition dans la page.
      ed().commands.setTextSelection(1);
      Editor.setHTML('<p>Avant ' + val('Texte') + ' après</p>');
      const loopOverlay = document.getElementById('var-loop-modal');
      if (loopOverlay) document.body.insertBefore(loopOverlay, document.body.firstChild);
      const bars = await selectBubble(h, valueId);
      pressBar(bars[0], 'var-loop');
      await h.sleep(250);
      const loop = document.getElementById('var-loop-modal');
      const rect = loop && loop.querySelector('.pp-modal-box').getBoundingClientRect();
      const top = rect && document.elementFromPoint(rect.left + rect.width / 2, rect.top + 20);
      const over = { loopOpen: !!loop && visible(loop), loopOnTop: !!top && loop.contains(top), z: loop && getComputedStyle(loop).zIndex, conditionZ: getComputedStyle(conditionModal()).zIndex };
      VariableLoop.isOpen() && loop.querySelector('.var-modal-actions button:not(.var-modal-primary):not(.var-modal-danger)').click();
      await h.sleep(120);
      const back = conditionModal().querySelector('.pp-modal-box').getBoundingClientRect();
      const backTop = document.elementFromPoint(back.left + back.width / 2, back.top + 20);
      const after = { loopClosed: !VariableLoop.isOpen(), conditionOnTop: !!backTop && conditionModal().contains(backTop), conditionOpen: VariableCondition.isOpen(), value: field(valueId).value, loopZ: loop && loop.style.zIndex };
      cancelWindow(conditionModal());
      const pass = over.loopOpen && over.loopOnTop && after.loopClosed && after.conditionOnTop && after.conditionOpen && after.value === 'pour ' + key(TABLE, 'Titre') && !after.loopZ;
      return { pass, notes: JSON.stringify({ over, after }) };
    },
  });

  // === Annuler / Ctrl+Z ===
  cases.push({
    id: 'sinonfield_the_field_is_a_draft_one_undo_takes_back_the_condition_and_its_otherwise_together',
    description: 'Le champ du sinon est un brouillon de la fenêtre : sa frappe se défait dans le champ (Ctrl+Z) sans rien changer au modèle, il n’entre pas dans les repères de l’historique du modèle (les champs de la page, eux, y sont) ; Enregistrer pose la condition et le sinon en une seule étape, un seul Annuler rend les deux, un seul Rétablir les remet',
    run: async (h) => {
      await seed(h);
      Editor.setHTML('<p>Avant ' + val('Texte') + ' après</p>');
      await h.sleep(80);
      const before = Editor.getHTML();
      const modal = await openWindow(h, 'conditionalValue');
      await ruleUrgent(h, modal);
      await h.fieldType(valueId, 'abc');
      const typedValue = field(valueId).value;
      FieldEditor.of(field(valueId)).commands.undo();
      const undoneInField = field(valueId).value;
      const unchangedWhileOpen = Editor.getHTML() === before;
      const snapshotKeys = Object.keys(FieldEditor.snapshot());
      setInput(field(valueId), 'à régler pour ' + key(TABLE, 'Titre'));
      await saveWindow(h, modal);
      await h.sleep(650);
      const saved = Editor.getHTML();
      ed().commands.undo();
      await h.sleep(60);
      const afterUndo = Editor.getHTML();
      ed().commands.redo();
      await h.sleep(60);
      const afterRedo = Editor.getHTML();
      const pass = typedValue === 'abc' && undoneInField === '' && unchangedWhileOpen && snapshotKeys.indexOf(valueId) === -1 && snapshotKeys.indexOf(areaId) === -1
        && saved !== before && saved.indexOf('data-condition') !== -1 && saved.indexOf('data-otherwise') !== -1 && afterUndo === before && afterRedo === saved;
      return { pass, notes: JSON.stringify({ typedValue, undoneInField, unchangedWhileOpen, snapshotKeys, afterUndo: afterUndo === before, afterRedo: afterRedo === saved }) };
    },
  });

  // === Les modèles qui citent une table dans un sinon ===
  cases.push({
    id: 'sinonfield_deleting_a_link_rule_names_a_template_whose_only_use_is_a_variable_of_a_value_or_block_otherwise',
    description: 'Supprimer la règle de liaison d’une table : la confirmation nomme aussi le modèle dont seul le sinon d’une valeur (texte brut) ou d’un bloc (HTML d’un champ) cite une variable de cette table, et pas un modèle qui ne la cite pas',
    run: async (h) => {
      await seed(h);
      const cache = Templates.getCached();
      const lineBadge = FieldCodec.itemsOf(key(LINES, 'Designation'))[0];
      const viaValue = { id: 987101, nom: 'Modèle à sinon de valeur', contenu: '<p>' + val('Texte', COND_URGENT, 'voir ' + key(LINES, 'Designation')) + '</p>' };
      const viaBlock = { id: 987102, nom: 'Modèle à sinon de bloc', contenu: block('<p>Texte</p>', COND_URGENT, FieldCodec.toStoredLines([[{ text: 'voir ' }, { badge: Object.assign({}, lineBadge.badge, { before: '« ' }) }]])) };
      const unrelated = { id: 987103, nom: 'Modèle sans lien', contenu: '<p>' + val('Texte', COND_URGENT, 'voir ' + key(TABLE, 'Titre')) + '</p>' };
      cache.push(viaValue, viaBlock, unrelated);
      const dialogs = h.stubDialogs({ confirm: () => false });
      let asked = null;
      try {
        Variables.refreshLinkRulesPanel();
        const row = Array.from(document.querySelectorAll('#link-rules-list .link-rule-row')).find(r => r.querySelector('.link-rule-label').textContent.includes('→ ' + LINES + ' :'));
        if (!row) return { pass: false, notes: 'règle ' + LINES + ' absente de la fenêtre Tables liées' };
        row.querySelector('.link-rule-btn-delete').click();
        await h.sleep(80);
        asked = dialogs.asked.find(a => a.kind === 'confirm') || null;
      } finally {
        dialogs.restore();
        [viaValue, viaBlock, unrelated].forEach(t => cache.splice(cache.indexOf(t), 1));
      }
      const pass = !!asked && asked.message.includes(viaValue.nom) && asked.message.includes(viaBlock.nom) && !asked.message.includes(unrelated.nom);
      return { pass, notes: JSON.stringify(asked) };
    },
  });

  // === Les textes, en français et en anglais ===
  const textsCase = {
    id: 'sinonfield_texts_speak_french',
    lang: 'fr',
    description: 'Le texte d’attente des deux champs cite « #Variable », leur info-bulle dit de taper « # » ; en français et en anglais, sans clé manquante',
    run: async (h) => {
      const lang = I18n.getLang();
      const keys = ['varCond.otherwiseTextPlaceholder', 'varCond.otherwiseBlockPlaceholder', 'varCond.otherwiseTextTitle', 'varCond.otherwiseBlockTitle'];
      const missing = { fr: keys.filter(k => !I18n.has || !I18n.has(k)), en: [] };
      const seen = {};
      await seed(h);
      Editor.setHTML('<p>Avant ' + val('Texte', COND_URGENT, 'ok') + ' après</p>' + block('<p>Bloc</p>', COND_URGENT, 'ok'));
      await h.sleep(80);
      for (const type of ['conditionalValue', 'conditionalText']) {
        const modal = await openWindow(h, type);
        const input = field(type === 'conditionalValue' ? valueId : areaId);
        seen[type] = { placeholder: input.placeholder, title: input.closest('.var-condition-otherwise-field').title };
        cancelWindow(modal);
        await h.sleep(40);
      }
      const want = lang === 'en'
        ? { value: 'Empty: value disappears (#Variable allowed)', block: 'Empty: block disappears (#Variable allowed)', title: /Type # to add a variable\.$/ }
        : { value: 'Vide : la valeur disparaît (#Variable autorisée)', block: 'Vide : le bloc disparaît (#Variable autorisée)', title: /Tapez # pour y mettre une variable\.$/ };
      const pass = seen.conditionalValue.placeholder === want.value && seen.conditionalText.placeholder === want.block
        && want.title.test(seen.conditionalValue.title) && want.title.test(seen.conditionalText.title) && missing.fr.length === 0 && missing.en.length === 0;
      return { pass, notes: JSON.stringify({ lang, seen, missing }) };
    },
  };
  cases.push(textsCase, Object.assign({}, textsCase, {
    id: 'sinonfield_texts_speak_english',
    lang: 'en',
    description: 'Page qui démarre en anglais : le texte d’attente et l’info-bulle des deux champs en anglais (« #Variable allowed », « Type # to add a variable. ») ',
  }));

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.sinonField = cases;
})();
