// Suite "sinonLoop" - le texte « Si aucune ligne → Afficher un texte » d'une boucle (js/variable-loop.js, js/loop-rules.js) est le même champ à variables que le « Sinon afficher »
// d'une valeur, d'un bloc et d'une variable (suite sinonField ; demande d'Antoine du 2026-11-02 : « Oui identique partout [...] S'assurer que les variables on peut cliquer dessus
// et avoir les mêmes options que de base ») : le champ de l'objet d'un email (js/field-editor.js, js/field-codec.js) monté dans la fenêtre de la boucle, une clé « #Table.Colonne »
// tapée en entier y devient une bulle, un clic sur la bulle ouvre la barre d'une variable de la page. Écrit dans `emptyText` de la boucle (attribut `data-loop` de la bulle) : le
// texte brut d'avant tant que rien n'oblige à du HTML (une boucle déjà enregistrée se lit à l'identique), le HTML d'un champ dès qu'une variable porte un réglage ; lu par la Lecture
// et les exports dans les quatre sortes de zone (la phrase, le paragraphe, l'élément de liste, la ligne de tableau), avec la ligne de la zone qui entoure la boucle quand elle est
// dans une autre. Le vrai clavier et la vraie souris sont dans verify-sinon-loop-mouse.mjs (script sinonLoopMouse).
(function () {
  const cases = [];

  const PAGE = 'SlFactures';
  const LINES = 'SlLignes';
  const DETAILS = 'SlDetails';
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const RECORD_1 = { id: 1, Numero: 'F-1', Client: 'Atelier Durand' };
  const RECORD_3 = { id: 3, Numero: 'F-3', Client: 'Cabinet Morel' };
  const key = (table, column) => Variables.triggerChar() + table + '.' + column;

  // Une bulle, avec sa boucle quand `loop` est donnée : `data-loop` est du JSON dont les guillemets sont écrits en entités (le HTML enregistré).
  function badge(table, column, loop) {
    const attrs = loop ? ` data-loop="${JSON.stringify(loop).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}" data-loop-repeat="${loop.repeat}"` : '';
    return `<span class="var-badge" data-table="${table}" data-column="${column}" data-key="${table}.${column}"${attrs}></span>`;
  }
  const loopOf = (repeat, emptyText, extra) => Object.assign({ repeat, table: LINES, empty: 'text', emptyText }, extra);
  const withCell = inner => `<table><tbody><tr><th><p>Désignation</p></th></tr><tr><td><p>${inner}</p></td></tr></tbody></table>`;

  async function seed(h) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setViewRows(null);
    stub.setViewFailure(null);
    stub.setVariables(PAGE, { Numero: 'Text', Client: 'Text' });
    stub.setVariables(LINES, { Facture: 'Ref:' + PAGE, Designation: 'Text', Qte: 'Numeric' });
    stub.setVariables(DETAILS, { Ligne: 'Ref:' + LINES, Texte: 'Text' });
    stub.setRows(PAGE, [
      { id: 1, Numero: 'F-1', Client: 'Atelier Durand' },
      { id: 2, Numero: 'F-2', Client: 'Brasserie Roy' },
      { id: 3, Numero: 'F-3', Client: 'Cabinet Morel' },
    ]);
    // La facture n° 3 n'a aucune ligne : c'est elle qui montre le texte « Si aucune ligne ».
    stub.setRows(LINES, [
      { id: 1, Facture: 1, Designation: 'Audit', Qte: 1 },
      { id: 2, Facture: 1, Designation: 'Livret', Qte: 12 },
      { id: 3, Facture: 2, Designation: 'Suivi', Qte: 1 },
    ]);
    stub.setRows(DETAILS, [{ id: 1, Ligne: 1, Texte: 'Rapport' }]);
    await GristAPI.refreshSchema();
    for (const table of [LINES, DETAILS]) await GristAPI.deleteLinkRule(table);
    await GristAPI.saveLinkRule(LINES, { mode: 'match', colonneCible: 'Facture', colonneSource: 'id' });
    await GristAPI.refreshSchema();
    stub.fireRecord(Object.assign({}, RECORD_3), PAGE);
    await h.sleep(50);
  }
  async function setRecord(h, record) {
    window.__gristStub.fireRecord(Object.assign({}, record), PAGE);
    await h.sleep(50);
  }
  // Ce que la Lecture écrit pour ce HTML : le conteneur .reader-content, une fois résolu.
  async function renderReader(html) {
    const reader = document.getElementById('reader-container');
    reader.style.display = 'block';
    await ReaderMode.render(html, PAGE, GristAPI.getCurrentRecord(), NO_HF);
    return reader.querySelector('.reader-content');
  }
  // Ce que reçoivent le PDF, le Word et l'email : ReaderMode.preview, le même HTML résolu que la Lecture.
  async function previewHtml(html) {
    const box = document.createElement('div');
    box.innerHTML = await ReaderMode.preview(html, PAGE, GristAPI.getCurrentRecord());
    return box;
  }
  function closeReader() {
    document.getElementById('reader-container').style.display = '';
    document.getElementById('editor-container').style.display = '';
  }
  const textOf = node => (node ? node.textContent.replace(/\s+/g, ' ').trim() : null);
  const rowTexts = table => Array.from(table.querySelectorAll('tr')).map(tr => Array.from(tr.children).map(c => textOf(c)).join(' | '));

  const ed = () => EditorCore.getEditor();
  const badgeNodes = () => { const out = []; ed().state.doc.descendants((node, pos) => { if (node.type.name === 'varBadge') out.push({ node, pos }); }); return out; };
  // Sélection de la bulle comme un clic (même contournement que scenarios-var-loop.js:selectBadge), puis le bouton de sa barre.
  async function selectBadge(h, wanted) {
    document.querySelector('.tiptap').focus();
    const found = badgeNodes().find(b => b.node.attrs.key === wanted);
    if (!found) return null;
    ed().commands.setNodeSelection(found.pos);
    await h.sleep(120);
    return found;
  }
  const pressToolbarButton = action => document.querySelector('.v2-varfmt-toolbar').querySelector(`button[data-action="${action}"]`).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  const modal = () => document.getElementById('var-loop-modal');
  const emptyField = () => document.getElementById('var-loop-empty-text');
  const setInput = (input, value) => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); };
  const setSelect = (select, value) => { select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); };
  const previewLines = () => Array.from(modal().querySelectorAll('.var-condition-debug-line')).map(l => (l.hidden ? '' : l.textContent));
  const actionButton = label => Array.from(modal().querySelectorAll('.var-modal-actions button')).find(b => b.textContent === label);
  const bubblesIn = host => Array.from(host.querySelectorAll('.var-badge')).map(b => b.getAttribute('data-key'));
  const visible = el => !!el && el.style.display !== 'none' && el.getClientRects().length > 0;
  async function openLoopWindow(h, wanted) {
    await selectBadge(h, wanted);
    pressToolbarButton('var-loop');
    await h.sleep(300);
    return modal();
  }
  // Les éléments de `FieldCodec` d'une variable de la page, avec un « Avant » et un « Après » : ce que la barre du champ lui fait écrire.
  const framed = (table, column, before, after) => ({ badge: Object.assign({}, FieldCodec.itemsOf(key(table, column))[0].badge, { before, after }) });
  const savedLoop = wanted => badgeNodes().find(b => b.node.attrs.key === wanted).node.attrs.loop;

  // === La fenêtre de la boucle ===
  cases.push({
    id: 'sinonloop_window_empty_text_is_a_field_with_variables_saved_reopened_and_read',
    description: 'Fenêtre Boucle, « Si aucune ligne → Afficher un texte » : le texte est un champ à variables (une zone de saisie d’une ligne, son texte d’attente cite « #Variable ») ; une clé tapée en entier y devient une bulle, l’aperçu de la ligne sélectionnée lit la variable, la boucle enregistrée garde le texte brut avec sa clé, la fenêtre rouverte remontre la bulle et la Lecture écrit la valeur de la variable',
    run: async (h) => {
      await seed(h);
      Editor.setHTML('<p>Lignes : ' + badge(LINES, 'Designation', { repeat: 'inline', table: LINES, empty: 'hide', separator: ', ' }) + '</p>');
      await h.sleep(80);
      await openLoopWindow(h, LINES + '.Designation');
      const m = modal();
      const row = m.querySelector('.var-loop-empty-text');
      const hiddenAtStart = row.hidden;
      setSelect(m.querySelector('#var-loop-empty'), 'text');
      await h.sleep(60);
      const input = emptyField();
      const shown = {
        hiddenAtStart, shown: !row.hidden, tag: input.tagName, editor: !!FieldEditor.of(input), textbox: !!input.querySelector('.pp-field-text[role="textbox"]'),
        placeholder: input.placeholder, title: input.title, greyed: input.disabled,
      };
      setInput(input, 'Aucune ligne pour ' + key(PAGE, 'Numero'));
      await h.sleep(900);
      const typed = { value: input.value, bubbles: bubblesIn(input) };
      const line = previewLines()[0];
      m.querySelector('.var-modal-actions .var-modal-primary').click();
      await h.sleep(150);
      const saved = savedLoop(LINES + '.Designation');
      await openLoopWindow(h, LINES + '.Designation');
      const again = emptyField();
      const reopened = { value: again.value, bubbles: bubblesIn(again), mode: modal().querySelector('#var-loop-empty').value };
      actionButton(I18n.t('common.cancel')).click();
      await h.sleep(60);
      const reader = await renderReader(Editor.getHTML());
      const read = textOf(reader.querySelector('p'));
      closeReader();
      const checks = {
        hiddenThenShown: shown.hiddenAtStart === true && shown.shown === true,
        isAFieldNotAnInput: shown.tag === 'DIV' && shown.editor && shown.textbox,
        placeholderCitesVariables: shown.placeholder === I18n.t('varLoop.empty.textPlaceholder') && /#Variable/.test(shown.placeholder) && shown.title === I18n.t('varLoop.empty.textTitle'),
        notGreyed: shown.greyed === false,
        typedKeyBecomesABubble: typed.value === 'Aucune ligne pour ' + key(PAGE, 'Numero') && typed.bubbles.join() === PAGE + '.Numero',
        previewReadsTheVariable: !!line && line.includes('Aucune ligne pour F-3') && !line.includes('#'),
        savedAsPlainTextWithItsKey: !!saved && saved.empty === 'text' && saved.emptyText === 'Aucune ligne pour ' + key(PAGE, 'Numero') && saved.repeat === 'inline',
        reopenedShowsTheBubble: reopened.value === saved.emptyText && reopened.bubbles.join() === PAGE + '.Numero' && reopened.mode === 'text',
        readerWritesTheValue: read === 'Lignes : Aucune ligne pour F-3',
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: failed.length ? JSON.stringify({ failed, shown, typed, line, saved, reopened, read }) : 'ok' };
    },
  });

  cases.push({
    id: 'sinonloop_window_old_plain_text_opens_and_saves_unchanged_and_a_variable_with_settings_is_kept',
    description: 'Un texte « Si aucune ligne » enregistré avant (guillemets, « & », « < », « # » qui n’est pas une variable) se rouvre dans le champ, tel quel, et se réenregistre identique ; une variable réglée par son « Avant » / « Après » s’enregistre en HTML de champ et revient avec ses réglages ; effacé, le texte disparaît de la boucle',
    run: async (h) => {
      await seed(h);
      const tricky = 'rien : "a" & <b>b</b> #12';
      Editor.setHTML('<p>' + badge(LINES, 'Designation', loopOf('inline', tricky)) + '</p>');
      await h.sleep(80);
      await openLoopWindow(h, LINES + '.Designation');
      const first = { value: emptyField().value, bubbles: bubblesIn(emptyField()), text: textOf(emptyField().querySelector('.pp-field-text')) };
      modal().querySelector('.var-modal-actions .var-modal-primary').click();
      await h.sleep(150);
      const unchanged = savedLoop(LINES + '.Designation').emptyText;
      // Une variable avec son « Avant » / « Après » : du HTML de champ, qui revient avec ses réglages.
      const rich = FieldCodec.toStored([{ text: 'Chez ' }, framed(PAGE, 'Client', '« ', ' »')]);
      Editor.setHTML('<p>' + badge(LINES, 'Designation', loopOf('inline', rich)) + '</p>');
      await h.sleep(80);
      await openLoopWindow(h, LINES + '.Designation');
      const second = { value: emptyField().value, bubbles: bubblesIn(emptyField()), rich: FieldCodec.isRich(emptyField().value) };
      modal().querySelector('.var-modal-actions .var-modal-primary').click();
      await h.sleep(150);
      const kept = savedLoop(LINES + '.Designation').emptyText;
      const keptItems = FieldCodec.itemsOf(kept);
      // Effacé : la boucle n'a plus de texte.
      await openLoopWindow(h, LINES + '.Designation');
      setInput(emptyField(), '');
      await h.sleep(300);
      modal().querySelector('.var-modal-actions .var-modal-primary').click();
      await h.sleep(150);
      const cleared = savedLoop(LINES + '.Designation');
      const checks = {
        oldTextOpensAsWritten: first.value === tricky && first.bubbles.length === 0 && first.text === tricky,
        oldTextSavesIdentical: unchanged === tricky,
        richOpensWithItsBubble: second.rich && second.bubbles.join() === PAGE + '.Client',
        richSavedKeepsTheSettings: FieldCodec.isRich(kept) && keptItems.length === 2 && keptItems[1].badge.before === '« ' && keptItems[1].badge.after === ' »',
        clearedLeavesNoText: cleared.empty === 'text' && !cleared.emptyText,
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: failed.length ? JSON.stringify({ failed, first, unchanged, second, kept, cleared }) : 'ok' };
    },
  });

  // === La Lecture et les exports ===
  cases.push({
    id: 'sinonloop_reader_writes_the_variables_of_the_empty_text_in_every_kind_of_zone',
    description: 'Aucune ligne retenue : le texte « Si aucune ligne » écrit la valeur de ses variables dans la phrase, le paragraphe, l’élément de liste et la ligne de tableau (la facture n° 3 n’a aucune ligne), en Lecture comme pour le PDF, le Word et l’email (preview) ; une variable réglée par son « Avant » / « Après » garde ses guillemets ; un texte d’avant sans variable, et un « # » qui n’en est pas une, s’écrivent tels quels ; avec des lignes, le texte n’apparaît pas',
    run: async (h) => {
      await seed(h);
      const html = {
        inline: '<p>Lignes : ' + badge(LINES, 'Designation', loopOf('inline', 'aucune pour ' + key(PAGE, 'Numero'))) + '.</p>',
        paragraph: '<p>' + badge(LINES, 'Designation', loopOf('paragraph', 'Rien pour ' + key(PAGE, 'Client'))) + '</p>',
        item: '<ul><li><p>' + badge(LINES, 'Designation', loopOf('item', 'Aucun élément pour ' + key(PAGE, 'Numero'))) + '</p></li></ul>',
        row: withCell(badge(LINES, 'Designation', loopOf('row', 'Aucune ligne pour ' + key(PAGE, 'Numero')))),
        rich: '<p>' + badge(LINES, 'Designation', loopOf('inline', FieldCodec.toStored([{ text: 'Chez ' }, framed(PAGE, 'Client', '« ', ' »')]))) + '</p>',
        plain: '<p>' + badge(LINES, 'Designation', loopOf('inline', 'Aucune ligne')) + '</p>',
        hash: '<p>' + badge(LINES, 'Designation', loopOf('inline', 'Dossier #12 vide')) + '</p>',
      };
      const read = {};
      for (const kind of Object.keys(html)) {
        const reader = await renderReader(html[kind]);
        read[kind] = kind === 'row' ? rowTexts(reader.querySelector('table')) : textOf(reader.querySelector(kind === 'item' ? 'li' : 'p'));
      }
      const cell = (await renderReader(html.row)).querySelector('tr:last-child td');
      const colspan = cell && cell.getAttribute('colspan');
      closeReader();
      const exported = {};
      for (const kind of ['inline', 'row']) {
        const box = await previewHtml(html[kind]);
        exported[kind] = kind === 'row' ? rowTexts(box.querySelector('table')) : textOf(box.querySelector('p'));
      }
      // Avec des lignes liées, le texte « Si aucune ligne » ne s'écrit pas.
      await setRecord(h, RECORD_1);
      const withLines = textOf((await renderReader(html.inline)).querySelector('p'));
      closeReader();
      const checks = {
        inline: read.inline === 'Lignes : aucune pour F-3.',
        paragraph: read.paragraph === 'Rien pour Cabinet Morel',
        item: read.item === 'Aucun élément pour F-3',
        row: JSON.stringify(read.row) === JSON.stringify(['Désignation', 'Aucune ligne pour F-3']) && colspan === '1',
        richKeepsItsFrame: read.rich === 'Chez « Cabinet Morel »',
        oldTextUnchanged: read.plain === 'Aucune ligne',
        hashThatIsNotAVariable: read.hash === 'Dossier #12 vide',
        exportsRead: exported.inline === 'Lignes : aucune pour F-3.' && JSON.stringify(exported.row) === JSON.stringify(['Désignation', 'Aucune ligne pour F-3']),
        notWrittenWhenThereAreLines: withLines === 'Lignes : Audit, Livret.',
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: failed.length ? JSON.stringify({ failed, read, colspan, exported, withLines }) : 'ok' };
    },
  });

  cases.push({
    id: 'sinonloop_variables_of_the_empty_text_read_the_row_of_the_enclosing_zone',
    description: 'Une boucle dans une zone répétée par une autre (le détail d’une ligne de facture, dans une case de la ligne) : quand une ligne n’a aucun détail, les variables de son texte « Si aucune ligne » lisent la ligne du tour qui entoure la boucle (la désignation de CETTE ligne), pas la première ligne liée à la page',
    run: async (h) => {
      await seed(h);
      await setRecord(h, RECORD_1);
      const rowLoop = { repeat: 'row', table: LINES, empty: 'header' };
      const detail = { repeat: 'inline', table: DETAILS, within: LINES, by: 'Ligne', empty: 'text', emptyText: 'aucun détail pour ' + key(LINES, 'Designation') };
      const html = '<table><tbody><tr><th><p>Désignation</p></th><th><p>Détail</p></th></tr>'
        + `<tr><td><p>${badge(LINES, 'Designation', rowLoop)}</p></td><td><p>${badge(DETAILS, 'Texte', detail)}</p></td></tr></tbody></table>`;
      const rows = rowTexts((await renderReader(html)).querySelector('table'));
      closeReader();
      const exported = rowTexts((await previewHtml(html)).querySelector('table'));
      const expected = ['Désignation | Détail', 'Audit | Rapport', 'Livret | aucun détail pour Livret'];
      const pass = JSON.stringify(rows) === JSON.stringify(expected) && JSON.stringify(exported) === JSON.stringify(expected);
      return { pass, notes: JSON.stringify({ rows, exported }) };
    },
  });

  // === La barre d'une variable du champ ===
  cases.push({
    id: 'sinonloop_variable_of_the_empty_text_has_its_toolbar_and_its_loop_button_is_greyed',
    description: 'Un clic sur la variable du champ « Si aucune ligne » ouvre la barre d’une variable de la page (condition, format…) devant la fenêtre ; son bouton Boucle est grisé et dit pourquoi tant que la fenêtre de la boucle est ouverte (une seule fenêtre de boucle à la fois), puis se dégrise une fois la fenêtre fermée ; la barre du document, elle, reste cachée derrière la fenêtre',
    run: async (h) => {
      await seed(h);
      await setRecord(h, RECORD_1);
      Editor.setHTML('<p>Lignes : ' + badge(LINES, 'Designation', { repeat: 'inline', table: LINES, empty: 'hide', separator: ', ' }) + '</p>');
      await h.sleep(80);
      await openLoopWindow(h, LINES + '.Designation');
      setSelect(modal().querySelector('#var-loop-empty'), 'text');
      await h.sleep(60);
      const input = emptyField();
      setInput(input, 'voir ' + key(LINES, 'Designation'));
      await h.sleep(900);
      const editor = FieldEditor.of(input);
      let pos = -1;
      editor.state.doc.descendants((node, at) => { if (pos < 0 && node.type.name === 'varBadge') pos = at; });
      editor.commands.focus();
      editor.commands.setNodeSelection(pos);
      await h.sleep(250);
      const bars = Array.from(document.querySelectorAll('.v2-varfmt-toolbar')).filter(visible);
      const bar = bars[0] || null;
      const button = action => (bar ? bar.querySelector(`button[data-action="${action}"]`) : null);
      const loop = button('var-loop');
      const state = {
        bars: bars.length, condition: !!button('var-condition') && button('var-condition').getAttribute('aria-disabled') !== 'true',
        loopGreyed: !!loop && loop.classList.contains('is-disabled') && loop.getAttribute('aria-disabled') === 'true', loopTitle: loop ? loop.title : null,
      };
      if (loop) loop.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      await h.sleep(250);
      const windows = document.querySelectorAll('#var-loop-modal').length;
      const stillThere = !!emptyField() && emptyField().value === 'voir ' + key(LINES, 'Designation');
      actionButton(I18n.t('common.cancel')).click();
      await h.sleep(80);
      // La fenêtre fermée, la bulle du document redonne sa barre (le bouton Boucle y est actif : elle porte déjà une boucle).
      await selectBadge(h, LINES + '.Designation');
      await h.sleep(150);
      const documentLoop = document.querySelector('.v2-varfmt-toolbar button[data-action="var-loop"]');
      const checks = {
        oneBar: state.bars === 1 && state.condition,
        loopGreyedWithItsReason: state.loopGreyed && state.loopTitle === I18n.t('varLoop.alreadyOpen'),
        noSecondWindow: windows === 1 && stillThere,
        documentBarBackAfterClose: !!documentLoop && documentLoop.getAttribute('aria-disabled') !== 'true',
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, notes: failed.length ? JSON.stringify({ failed, state, windows, stillThere }) : 'ok' };
    },
  });

  // === Les renommages et les liens ===
  cases.push({
    id: 'sinonloop_deleting_a_link_rule_names_a_template_whose_only_use_is_a_variable_of_a_loop_empty_text',
    description: 'Supprimer la règle de liaison d’une table : la confirmation nomme aussi le modèle dont seul le texte « Si aucune ligne » d’une boucle (texte brut ou HTML d’un champ) cite une variable de cette table, et pas un modèle qui ne la cite pas',
    run: async (h) => {
      await seed(h);
      const cache = Templates.getCached();
      const empty = text => '<p>' + badge(PAGE, 'Numero', { repeat: 'inline', table: PAGE, empty: 'text', emptyText: text }) + '</p>';
      const lineBadge = FieldCodec.itemsOf(key(LINES, 'Designation'))[0];
      const viaText = { id: 987211, nom: 'Modèle à boucle en texte', contenu: empty('voir ' + key(LINES, 'Designation')) };
      const viaRich = { id: 987212, nom: 'Modèle à boucle en HTML', contenu: empty(FieldCodec.toStored([{ text: 'voir ' }, { badge: Object.assign({}, lineBadge.badge, { before: '« ' }) }])) };
      const unrelated = { id: 987213, nom: 'Modèle sans lien', contenu: empty('voir ' + key(PAGE, 'Client')) };
      cache.push(viaText, viaRich, unrelated);
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
        [viaText, viaRich, unrelated].forEach(t => cache.splice(cache.indexOf(t), 1));
      }
      const pass = !!asked && asked.message.includes(viaText.nom) && asked.message.includes(viaRich.nom) && !asked.message.includes(unrelated.nom);
      return { pass, notes: JSON.stringify(asked) };
    },
  });

  // === Les textes, en français et en anglais ===
  const textsCase = {
    id: 'sinonloop_texts_speak_french',
    lang: 'fr',
    description: 'Le texte d’attente du champ cite « #Variable », son info-bulle dit de taper « # », et le bouton Boucle grisé a sa raison ; en français et en anglais, sans clé manquante',
    run: async (h) => {
      const lang = I18n.getLang();
      const keys = ['varLoop.empty.textPlaceholder', 'varLoop.empty.textTitle', 'varLoop.alreadyOpen'];
      const missing = keys.filter(k => !I18n.has || !I18n.has(k));
      await seed(h);
      Editor.setHTML('<p>' + badge(LINES, 'Designation', { repeat: 'inline', table: LINES, empty: 'text', emptyText: '' }) + '</p>');
      await h.sleep(80);
      await openLoopWindow(h, LINES + '.Designation');
      const input = emptyField();
      const seen = { placeholder: input.placeholder, title: input.title, label: input.closest('.var-loop-empty-text').querySelector('label').textContent, reason: I18n.t('varLoop.alreadyOpen') };
      actionButton(I18n.t('common.cancel')).click();
      await h.sleep(60);
      const want = lang === 'en'
        ? { placeholder: 'E.g. No rows (#Variable allowed)', title: /Type # to add a variable\.$/, label: 'Text shown', reason: /loop/ }
        : { placeholder: 'Ex. Aucune ligne (#Variable autorisée)', title: /Tapez # pour y mettre une variable\.$/, label: 'Texte affiché', reason: /boucle/ };
      const pass = seen.placeholder === want.placeholder && want.title.test(seen.title) && seen.label === want.label && want.reason.test(seen.reason) && missing.length === 0;
      return { pass, notes: JSON.stringify({ lang, seen, missing }) };
    },
  };
  cases.push(textsCase, Object.assign({}, textsCase, {
    id: 'sinonloop_texts_speak_english',
    lang: 'en',
    description: 'Page qui démarre en anglais : le texte d’attente, l’info-bulle et le libellé du champ « Si aucune ligne » en anglais (« #Variable allowed », « Type # to add a variable. »), la raison du bouton Boucle grisé aussi',
  }));

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.sinonLoop = cases;
})();
