// Suite "paragraphFormat" - « Paragraphe… » (demande d'Antoine du 22/10 : « l'import pptx est géré qq part ? … dev les features manquantes pour ne pas perdre d'élément à l'import », chantier 2 de l'import
// PowerPoint sans perte ; js/paragraph-format.js). L'interligne, l'espace avant / après et les retraits d'un paragraphe, cinq attributs du paragraphe (`data-line-height`, `data-space-before`,
// `data-space-after` au lot 2a ; `data-indent-left`, `data-indent-first` au lot 2b).
// Quatre parties :
//  1) le RÉGLAGE : les attributs et leur aller-retour HTML (jamais lus d'un style collé, bornés, un réglage égal à celui d'origine n'est pas écrit), le rendu de l'éditeur mesuré, Entrée ;
//  2) la FENÊTRE du menu Alignement : champs remplis, pose en une transaction (un Annuler), valeurs mêlées, « Par défaut », erreurs, Entrée, Annuler, ligne grisée avec sa raison, deux langues ;
//  3) les SORTIES : la Lecture, le PDF (lu par pdf.js : positions peintes), le Word (OOXML dézippé), le PowerPoint, le HTML exporté, le pinceau de mise en forme ;
//  4) les RETRAITS (lot 2b) : l'éditeur mesuré, ce qui dort dans une liste et une citation, la fenêtre (paire retrait à gauche / première ligne), les sorties, le pinceau.
// La vraie souris et le vrai clavier à 700x400 (clair, sombre, anglais) sont dans dev-tests/verify-paragraph-format-mouse.mjs : une page.evaluate ne déclenche ni un survol ni une frappe de confiance.
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const ed = () => EditorCore.getEditor();
  const NATURAL = 1.172;
  const DEFAULT_LINE = 1.42;
  const PX_PER_PT = 96 / 72;
  const row = () => document.getElementById('v2-btn-paragraph');
  const modal = () => document.getElementById('pp-parafmt-modal');
  const input = key => document.getElementById('pp-parafmt-' + key);
  const okButton = () => modal().querySelector('.var-modal-primary');
  const cancelButton = () => modal().querySelector('.pp-modal-actions button:not(.var-modal-primary):not(.pp-parafmt-reset)');
  const resetButton = () => modal().querySelector('.pp-parafmt-reset');
  const isOpen = () => !!modal() && modal().style.display !== 'none';
  // TipTap garde toujours un paragraphe vide à la fin du document quand le dernier bloc n'en est pas un : on le retire pour lire le document tel qu'on l'a écrit.
  const written = () => Editor.getHTML().replace(/<p><\/p>$/, '');
  const near = (a, b, tolerance) => Math.abs(a - b) <= (tolerance === undefined ? 0.01 : tolerance);

  async function setDoc(h, html) {
    await h.resetEditor();
    Editor.setHTML(html);
    await sleep(150);
  }
  // Les paragraphes du document, un par un, à toute profondeur : « Aa[1.055|10|6] » (l'interligne, l'espace avant, l'espace après ; « - » pour un réglage absent), « Aa » sans aucun, puis « {36|18} »
  // (le retrait à gauche et celui de la première ligne) quand l'un des deux est posé.
  function fmtList() {
    const out = [];
    ed().state.doc.descendants((node) => {
      if (node.type.name !== 'paragraph') return;
      const a = node.attrs;
      const none = a.lineHeight == null && a.spaceBefore == null && a.spaceAfter == null;
      const part = v => (v == null ? '-' : String(v));
      const indents = a.indentLeft == null && a.indentFirst == null ? '' : '{' + part(a.indentLeft) + '|' + part(a.indentFirst) + '}';
      out.push(node.textContent + (none ? '' : '[' + part(a.lineHeight) + '|' + part(a.spaceBefore) + '|' + part(a.spaceAfter) + ']') + indents);
    });
    return out.join('~');
  }
  function positionOf(predicate) {
    let found = null;
    ed().state.doc.descendants((node, pos) => { if (found == null && predicate(node)) found = pos; });
    return found;
  }
  const textPos = text => positionOf(n => n.isText && n.text.indexOf(text) !== -1);
  async function cursorIn(text) {
    ed().commands.setTextSelection(textPos(text) + 1);
    await sleep(150);
  }
  async function selectRange(fromText, toText) {
    ed().commands.setTextSelection({ from: textPos(fromText) + 1, to: textPos(toText) + 1 });
    await sleep(150);
  }
  const rowState = () => ({ disabled: row().getAttribute('aria-disabled') === 'true', greyed: row().classList.contains('v2-hover-row-disabled'), tab: row().tabIndex, title: row().title });
  // Un clic comme la souris le donne : la ligne ne prend pas le focus (mousedown retenu), l'éditeur garde sa sélection.
  async function pressRow() {
    row().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    row().click();
    await sleep(150);
  }
  function type(key, text) {
    const field = input(key);
    field.value = text;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }
  const fieldsNow = () => ({ line: input('lineHeight').value, before: input('spaceBefore').value, after: input('spaceAfter').value });
  async function submit() {
    okButton().click();
    await sleep(150);
  }
  // La hauteur calculée d'un paragraphe de l'éditeur : son interligne (px), ses espaces (px) et sa boîte (px).
  function boxOf(text) {
    let found = null;
    document.querySelectorAll('.tiptap p').forEach((p) => { if (found == null && p.textContent.indexOf(text) !== -1) found = p; });
    const cs = getComputedStyle(found);
    return { line: parseFloat(cs.lineHeight), top: parseFloat(cs.paddingTop), bottom: parseFloat(cs.paddingBottom), height: found.getBoundingClientRect().height, font: parseFloat(cs.fontSize) };
  }

  // === 1) Le réglage ===================================================================================================================================================
  cases.push({
    id: 'paragraphformat_attributes_survive_the_html_round_trip_and_never_come_from_a_pasted_style',
    description: 'Les trois réglages d\'interligne et d\'espaces sont les attributs `data-line-height`, `data-space-before` et `data-space-after` du paragraphe (les deux retraits ont leurs cas plus bas) : lus depuis le HTML, réécrits avec leur style (line-height, padding-top, padding-bottom) seulement quand ils sont posés ; un style collé de Word ou d\'une page web (sans les attributs) ne change rien ; une valeur illisible, négative ou égale à celle d\'origine (1,42 ; 0 pt) n\'est pas gardée ; une valeur hors bornes est ramenée à la borne',
    run: async (h) => {
      await setDoc(h, '<p data-line-height="1.055" data-space-before="10" data-space-after="6">Aa</p>'
        + '<p style="line-height: 2; padding-top: 12pt; margin-top: 20px">Bb</p>'
        + '<p data-line-height="1.42" data-space-before="0" data-space-after="0">Cc</p>'
        + '<p data-line-height="abc" data-space-before="-3" data-space-after="xyz">Dd</p>'
        + '<p data-line-height="99" data-space-before="5000" data-space-after="2.555">Ee</p>');
      const parsed = fmtList();
      const html = written();
      const first = html.match(/<p[^>]*>Aa<\/p>/)[0];
      const pass = parsed === 'Aa[1.055|10|6]~Bb~Cc~Dd~Ee[11.708|1584|2.56]'
        && /data-line-height="1.055"/.test(first) && /data-space-before="10"/.test(first) && /data-space-after="6"/.test(first)
        && /line-height: 1.055/.test(first) && /padding-top: 10pt/.test(first) && /padding-bottom: 6pt/.test(first)
        && /<p>Bb<\/p><p>Cc<\/p><p>Dd<\/p>/.test(html) && !/margin|padding-top: 12pt|line-height: 2/.test(html.replace(first, ''));
      return { pass, notes: JSON.stringify({ parsed, html }) };
    },
  });

  cases.push({
    id: 'paragraphformat_editor_shows_the_line_height_and_the_spaces_and_they_add_up_between_paragraphs',
    description: 'L\'éditeur montre les réglages : l\'interligne est le facteur posé (1,055 de la taille, contre 1,42 d\'origine), l\'espace avant est un remplissage en haut du paragraphe et l\'espace après un remplissage en bas (10 pt = 13,33 px) ; la boîte d\'un paragraphe d\'une ligne est l\'interligne plus les deux espaces ; deux paragraphes qui se suivent additionnent l\'espace après du premier et l\'espace avant du second (aucune fusion de marges)',
    run: async (h) => {
      await setDoc(h, '<p>Xx</p><p data-line-height="1.055" data-space-before="10" data-space-after="6">Aa</p><p data-space-before="4" data-space-after="2">Bb</p><p>Zz</p>');
      const plain = boxOf('Xx');
      const aa = boxOf('Aa');
      const bb = boxOf('Bb');
      const gap = document.evaluate("//*[contains(@class,'tiptap')]//p[contains(.,'Bb')]", document, null, 9, null).singleNodeValue.getBoundingClientRect().top
        - document.evaluate("//*[contains(@class,'tiptap')]//p[contains(.,'Aa')]", document, null, 9, null).singleNodeValue.getBoundingClientRect().bottom;
      const out = { plain, aa, bb, gap };
      const pass = near(plain.line, plain.font * DEFAULT_LINE, 0.05) && plain.top === 0 && plain.bottom === 0
        && near(aa.line, aa.font * 1.055, 0.05) && near(aa.top, 10 * PX_PER_PT) && near(aa.bottom, 6 * PX_PER_PT) && near(aa.height, aa.line + aa.top + aa.bottom, 0.6)
        && near(bb.line, bb.font * DEFAULT_LINE, 0.05) && near(bb.top, 4 * PX_PER_PT) && near(bb.bottom, 2 * PX_PER_PT)
        && near(gap, 0, 0.6);
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'paragraphformat_enter_keeps_the_setting_on_the_new_paragraph',
    description: 'Entrée à la fin d\'un paragraphe réglé ouvre un paragraphe qui garde les mêmes réglages (comme l\'alignement et comme Word) ; au milieu, les deux moitiés les gardent',
    run: async (h) => {
      await setDoc(h, '<p data-line-height="1.055" data-space-before="10" data-space-after="6">AaBb</p>');
      ed().commands.setTextSelection(textPos('AaBb') + 2);
      ed().commands.splitBlock();
      await sleep(100);
      const middle = fmtList();
      await setDoc(h, '<p data-space-after="6">Cc</p>');
      ed().commands.setTextSelection(textPos('Cc') + 2);
      ed().commands.splitBlock();
      await sleep(100);
      const end = fmtList();
      const pass = middle === 'Aa[1.055|10|6]~Bb[1.055|10|6]' && end === 'Cc[-|-|6]~[-|-|6]';
      return { pass, notes: JSON.stringify({ middle, end }) };
    },
  });

  // === 2) La fenêtre ===================================================================================================================================================
  const FRENCH = I18n.getLang() !== 'en';
  const dec = FRENCH ? ',' : '.';
  cases.push({
    id: 'paragraphformat_window_opens_on_the_cursor_paragraph_with_the_current_values_and_applies_in_one_undo',
    description: 'Un clic sur « Paragraphe… » ouvre la fenêtre sur le paragraphe du curseur : l\'interligne d\'origine s\'y lit 1,21 (1,42 divisé par la ligne simple 1,172), les espaces 0 ; « Valider » pose 1,5 / 12 / 6 (l\'interligne en facteur CSS 1,758) en une seule transaction, un Annuler les retire ; la fenêtre rouverte montre 1,5 / 12 / 6',
    run: async (h) => {
      const out = {};
      await setDoc(h, '<p>Aa</p><p>Bb</p>');
      await cursorIn('Bb');
      out.before = rowState();
      await pressRow();
      out.opened = isOpen();
      out.initial = fieldsNow();
      type('lineHeight', '1' + dec + '5');
      type('spaceBefore', '12');
      type('spaceAfter', '6 pt');
      await submit();
      out.closed = !isOpen();
      out.list = fmtList();
      ed().commands.undo();
      await sleep(150);
      out.undone = fmtList();
      ed().commands.redo();
      await sleep(150);
      await pressRow();
      out.reopened = fieldsNow();
      cancelButton().click();
      await sleep(100);
      const pass = !out.before.disabled && out.before.title === '' && out.opened && out.initial.line === '1' + dec + '21' && out.initial.before === '0' && out.initial.after === '0'
        && out.closed && out.list === 'Aa~Bb[1.758|12|6]' && out.undone === 'Aa~Bb' && out.reopened.line === '1' + dec + '5' && out.reopened.before === '12' && out.reopened.after === '6' && !isOpen();
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'paragraphformat_window_on_several_paragraphs_applies_only_the_fields_that_changed',
    description: 'Sur plusieurs paragraphes aux réglages différents, un champ aux valeurs mêlées reste vide (avec « Plusieurs valeurs ») ; « Valider » ne pose que le champ modifié, chaque paragraphe garde ses autres réglages ; un seul Annuler défait le tout',
    run: async (h) => {
      const out = {};
      await setDoc(h, '<p data-space-before="10">Aa</p><p>Bb</p><p data-space-before="10" data-line-height="2">Cc</p>');
      await selectRange('Aa', 'Cc');
      await pressRow();
      out.initial = fieldsNow();
      out.placeholders = { line: input('lineHeight').placeholder, before: input('spaceBefore').placeholder, after: input('spaceAfter').placeholder };
      type('spaceAfter', '9');
      await submit();
      out.after = fmtList();
      ed().commands.undo();
      await sleep(150);
      out.undone = fmtList();
      const pass = out.initial.line === '' && out.initial.before === '' && out.initial.after === '0'
        && out.placeholders.line !== '' && out.placeholders.before !== '' && out.placeholders.after === ''
        && out.after === 'Aa[-|10|9]~Bb[-|-|9]~Cc[2|10|9]' && out.undone === 'Aa[-|10|-]~Bb~Cc[2|10|-]';
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'paragraphformat_reset_button_and_cleared_fields_return_the_paragraph_to_its_defaults',
    description: '« Par défaut » remet les champs aux valeurs d\'origine (1,21 / 0 / 0, et 0 / 0 pour les retraits) sans rien poser tant qu\'on ne valide pas ; « Valider » retire alors les attributs ; un champ vidé redevient « par défaut » ; un interligne saisi égal à celui d\'origine n\'est pas écrit',
    run: async (h) => {
      const out = {};
      await setDoc(h, '<p data-line-height="2.344" data-space-before="10" data-space-after="6">Aa</p><p data-line-height="2" data-space-before="3">Bb</p>');
      await cursorIn('Aa');
      await pressRow();
      out.opened = fieldsNow();
      resetButton().click();
      await sleep(50);
      out.reset = fieldsNow();
      out.notYet = fmtList();
      await submit();
      out.cleared = fmtList();
      await cursorIn('Bb');
      await pressRow();
      type('lineHeight', '');
      type('spaceBefore', '');
      await submit();
      out.emptied = fmtList();
      await setDoc(h, '<p>Cc</p>');
      await cursorIn('Cc');
      await pressRow();
      type('lineHeight', '1' + dec + '21');
      type('spaceAfter', '8');
      await submit();
      out.sameAsDefault = fmtList();
      const pass = out.opened.line === '2' && out.opened.before === '10' && out.opened.after === '6'
        && out.reset.line === '1' + dec + '21' && out.reset.before === '0' && out.reset.after === '0'
        && out.notYet === 'Aa[2.344|10|6]~Bb[2|3|-]' && out.cleared === 'Aa~Bb[2|3|-]' && out.emptied === 'Aa~Bb'
        && out.sameAsDefault === 'Cc[-|-|8]';
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'paragraphformat_window_refuses_what_is_not_a_number_or_is_out_of_range_and_keeps_the_document',
    description: 'Une saisie qui n\'est pas un nombre ou hors bornes (interligne de 0,2 à 9,99 ; espaces et retraits de 0 à 1584 pt ; la première ligne de -1584 à 1584) est refusée sous le champ (aria-invalid, message, « Valider » grisé), la fenêtre reste ouverte et le document ne change pas ; Entrée ne valide pas une saisie fausse ; corrigée, Entrée valide et ferme',
    run: async (h) => {
      const out = {};
      await setDoc(h, '<p>Aa</p>');
      await cursorIn('Aa');
      await pressRow();
      const error = () => document.getElementById('pp-parafmt-error');
      type('lineHeight', 'abc');
      out.number = { shown: !error().hidden, text: error().textContent, invalid: input('lineHeight').getAttribute('aria-invalid'), okDisabled: okButton().disabled };
      type('lineHeight', '0' + dec + '1');
      out.low = { text: error().textContent, okDisabled: okButton().disabled };
      type('lineHeight', '1' + dec + '5');
      type('spaceBefore', '1585');
      out.high = { text: error().textContent, invalid: input('spaceBefore').getAttribute('aria-invalid'), okDisabled: okButton().disabled };
      input('spaceBefore').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await sleep(100);
      out.enterOnBad = { stillOpen: isOpen(), doc: fmtList() };
      type('spaceBefore', '8');
      out.fixed = { shown: !error().hidden, invalid: input('spaceBefore').getAttribute('aria-invalid'), okDisabled: okButton().disabled };
      input('spaceBefore').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await sleep(150);
      out.enterOnGood = { closed: !isOpen(), doc: fmtList() };
      const pass = out.number.shown && out.number.invalid === 'true' && out.number.okDisabled && /nombre|number/i.test(out.number.text)
        && out.low.okDisabled && /0[,.]2/.test(out.low.text) && /9[,.]99/.test(out.low.text)
        && out.high.okDisabled && out.high.invalid === 'true' && /1584/.test(out.high.text)
        && out.enterOnBad.stillOpen && out.enterOnBad.doc === 'Aa'
        && !out.fixed.shown && out.fixed.invalid === null && !out.fixed.okDisabled
        && out.enterOnGood.closed && out.enterOnGood.doc === 'Aa[1.758|8|-]';
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'paragraphformat_cancel_and_escape_close_the_window_without_changing_the_document',
    description: '« Annuler » et Échap ferment la fenêtre sans rien poser, même après une saisie',
    run: async (h) => {
      const out = {};
      await setDoc(h, '<p>Aa</p>');
      await cursorIn('Aa');
      await pressRow();
      type('lineHeight', '3');
      cancelButton().click();
      await sleep(100);
      out.cancel = { closed: !isOpen(), doc: fmtList() };
      await pressRow();
      type('spaceAfter', '20');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await sleep(100);
      out.escape = { closed: !isOpen(), doc: fmtList() };
      const pass = out.cancel.closed && out.cancel.doc === 'Aa' && out.escape.closed && out.escape.doc === 'Aa';
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'paragraphformat_works_in_a_list_a_table_cell_a_column_a_quote_a_callout_and_a_conditional_block',
    description: 'La ligne est active et règle le paragraphe du curseur dans un élément de liste, une case de tableau, une colonne, une citation, un encadré et un bloc de texte conditionnel ; une sélection de cases règle les paragraphes de ces cases seulement',
    run: async (h) => {
      const out = {};
      const specs = {
        list: '<ul><li><p>Dd</p></li></ul><p>Ee</p>',
        cell: '<table><tbody><tr><td><p>Dd</p></td></tr></tbody></table><p>Ee</p>',
        column: '<div class="two-columns-zone" style="--layout-left: 50%;"><div class="two-columns-column"><p>Dd</p></div><div class="two-columns-column"><p>Ff</p></div></div><p>Ee</p>',
        quote: '<blockquote><p>Dd</p></blockquote><p>Ee</p>',
        callout: '<div class="callout" data-color="green" data-icon="check"><p>Dd</p></div><p>Ee</p>',
        cond: '<div class="conditional-text"><p>Dd</p></div><p>Ee</p>',
      };
      for (const [name, html] of Object.entries(specs)) {
        await setDoc(h, html);
        await cursorIn('Dd');
        const state = rowState();
        await pressRow();
        const opened = isOpen();
        if (opened) { type('spaceBefore', '7'); await submit(); }
        const list = fmtList();
        out[name] = { enabled: !state.disabled && state.title === '', opened, list };
      }
      await setDoc(h, '<table><tbody><tr><td><p>A1</p></td><td><p>A2</p></td></tr><tr><td><p>B1</p></td><td><p>B2</p></td></tr></tbody></table>');
      let cellRange = null;
      ed().state.doc.descendants((node, pos) => { if (node.type.name === 'tableCell' && node.textContent === 'A1' && cellRange == null) cellRange = pos; });
      const a1 = cellRange;
      let b1 = null;
      ed().state.doc.descendants((node, pos) => { if (node.type.name === 'tableCell' && node.textContent === 'B1') b1 = pos; });
      ed().commands.setCellSelection({ anchorCell: a1, headCell: b1 });
      await sleep(150);
      await pressRow();
      type('spaceAfter', '5');
      await submit();
      out.cells = fmtList().replace(/~$/, '');
      const pass = Object.entries(out).filter(([k]) => k !== 'cells').every(([k, v]) => v.enabled && v.opened && v.list.indexOf('Dd[-|7|-]') !== -1 && v.list.indexOf('Ee[') === -1)
        && out.cells === 'A1[-|-|5]~A2~B1[-|-|5]~B2';
      return { pass, notes: JSON.stringify(out) };
    },
  });

  // Là où le réglage n'a pas de sens : la ligne est grisée (jamais retirée), avec sa raison en info-bulle, hors de l'ordre des tabulations, et un clic ne l'ouvre pas.
  const GREYED = {
    heading: { html: '<h2>Dd</h2><p>Ee</p>', at: 'Dd' },
    caption: { html: '<p>Ee</p><p data-caption="true">Dd</p>', at: 'Dd' },
  };
  cases.push({
    id: 'paragraphformat_row_is_greyed_with_its_reason_on_a_heading_a_caption_and_in_a_header',
    description: 'Sur un titre et une légende, et dans un en-tête, la ligne est grisée (aria-disabled, hors des tabulations) avec sa raison en info-bulle, et un clic n\'ouvre rien ; le curseur de retour dans un paragraphe du texte la rend active',
    run: async (h) => {
      const out = {};
      for (const [name, spec] of Object.entries(GREYED)) {
        await setDoc(h, spec.html);
        await cursorIn(spec.at);
        const greyed = rowState();
        await pressRow();
        const opened = isOpen();
        await cursorIn('Ee');
        out[name] = { greyed: greyed.disabled && greyed.greyed && greyed.tab === -1 && /^(Seulement pour les paragraphes du texte|Only for text paragraphs)/.test(greyed.title), opened, back: !rowState().disabled && rowState().tab === 0 && rowState().title === '' };
      }
      await setDoc(h, '<p>Ee</p>');
      HeaderFooterPreview.enterHeaderFooterMode('header', 'default');
      await sleep(300);
      ed().commands.focus('end');
      await sleep(150);
      const inHeader = rowState();
      await pressRow();
      out.header = { greyed: inHeader.disabled && inHeader.greyed && inHeader.title !== '', opened: isOpen() };
      HeaderFooterPreview.exitHeaderFooterModeIfActive();
      await sleep(300);
      const pass = out.heading.greyed && !out.heading.opened && out.heading.back && out.caption.greyed && !out.caption.opened && out.caption.back && out.header.greyed && !out.header.opened;
      return { pass, notes: JSON.stringify(out) };
    },
  });

  const textsCase = {
    id: 'paragraphformat_texts_follow_the_language',
    description: 'La ligne du menu, son nom accessible, la fenêtre (titre, les cinq libellés, indication, boutons) et la raison du grisage sont dans la langue de la page',
    run: async (h) => {
      const en = I18n.getLang() === 'en';
      const want = en
        ? { row: 'Paragraph…', aria: 'Paragraph: line spacing, spaces and indents', title: 'Paragraph', line: 'Line spacing', before: 'Space before', after: 'Space after', left: 'Left indent', first: 'First line', reset: 'Default', cancel: 'Cancel', ok: 'Confirm', hint: 'Line spacing: a multiple of single spacing (default 1.21).', greyed: 'Only for text paragraphs' }
        : { row: 'Paragraphe…', aria: 'Paragraphe : interligne, espaces et retraits', title: 'Paragraphe', line: 'Interligne', before: 'Espace avant', after: 'Espace après', left: 'Retrait à gauche', first: 'Première ligne', reset: 'Par défaut', cancel: 'Annuler', ok: 'Valider', hint: 'Interligne : multiple de la ligne simple (par défaut 1,21).', greyed: 'Seulement pour les paragraphes du texte' };
      await setDoc(h, '<h2>Dd</h2><p>Ee</p>');
      await cursorIn('Ee');
      const free = { row: row().textContent.trim(), aria: row().getAttribute('aria-label') };
      await pressRow();
      const labels = Array.from(modal().querySelectorAll('.pp-parafmt-label')).map(l => l.textContent);
      const win = {
        title: modal().querySelector('h3').textContent, labels,
        hint: document.getElementById('pp-parafmt-hint').textContent,
        reset: resetButton().textContent, cancel: cancelButton().textContent, ok: okButton().textContent,
        aria: input('lineHeight').getAttribute('aria-label'),
      };
      cancelButton().click();
      await sleep(100);
      await cursorIn('Dd');
      const greyedTitle = row().title;
      const pass = free.row === want.row && free.aria === want.aria && win.title === want.title && labels.join('|') === [want.line, want.before, want.after, want.left, want.first].join('|')
        && win.hint.indexOf(want.hint) === 0 && win.reset === want.reset && win.cancel === want.cancel && win.ok === want.ok && greyedTitle.indexOf(want.greyed) === 0;
      return { pass, notes: JSON.stringify({ free, win, greyedTitle }) };
    },
  };
  cases.push(textsCase);
  cases.push(Object.assign({}, textsCase, {
    id: 'paragraphformat_texts_follow_the_language_in_english',
    lang: 'en',
    description: 'Page qui démarre en anglais : la ligne (« Paragraph… »), la fenêtre et la raison du grisage sont en anglais, les nombres s\'écrivent avec le point',
  }));

  // === 3) Les sorties ==================================================================================================================================================
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const LINE_PT = 10.5 * DEFAULT_LINE; // la hauteur d'une ligne ordinaire du PDF : 14,91 pt
  // Le haut du texte de chaque paragraphe de l'éditeur dont le texte commence par `texts[i]`, en points : les écarts entre deux paragraphes de même interligne sont ceux des lignes de base du PDF.
  function editorTextTops(texts) {
    const out = {};
    const ps = Array.from(document.querySelectorAll('.tiptap p'));
    texts.forEach((text) => {
      const p = ps.find(el => el.textContent.indexOf(text) === 0);
      const range = document.createRange();
      range.selectNodeContents(p);
      out[text] = range.getClientRects()[0].top * 0.75;
    });
    return out;
  }
  // Le PDF d'un HTML : la ligne de base (pt, depuis le haut de la page) du premier mot de chaque texte demandé.
  async function pdfBaselines(h, html, texts) {
    const result = await h.exportPdfContent(html);
    const gt = await h.extractPdfGroundTruth(result.base64);
    const items = gt.pages[0].textItems;
    const out = {};
    texts.forEach((text) => { const item = items.find(i => i.str.trim() === text); out[text] = item ? item.y : null; });
    return out;
  }

  cases.push({
    id: 'paragraphformat_reader_shows_the_line_height_and_the_spaces',
    description: 'La Lecture montre les réglages comme l\'éditeur : l\'interligne du paragraphe (1,055 de la taille) et ses espaces (10 pt avant, 6 pt après, en remplissage), un paragraphe sans réglage garde l\'interligne d\'origine',
    run: async (h) => {
      const reader = document.getElementById('reader-container');
      try {
        reader.style.display = 'block';
        await ReaderMode.render('<p>Xx</p><p data-line-height="1.055" data-space-before="10" data-space-after="6" style="line-height: 1.055; padding-top: 10pt; padding-bottom: 6pt">Aa</p>', null, { id: 1 }, NO_HF);
        const look = (text) => {
          const p = Array.from(reader.querySelectorAll('.reader-content p')).find(el => el.textContent.indexOf(text) === 0);
          const cs = getComputedStyle(p);
          return { line: parseFloat(cs.lineHeight) / parseFloat(cs.fontSize), top: parseFloat(cs.paddingTop), bottom: parseFloat(cs.paddingBottom) };
        };
        const plain = look('Xx');
        const set = look('Aa');
        const pass = near(plain.line, DEFAULT_LINE, 0.01) && plain.top === 0 && plain.bottom === 0 && near(set.line, 1.055, 0.01) && near(set.top, 10 * PX_PER_PT) && near(set.bottom, 6 * PX_PER_PT);
        return { pass, notes: JSON.stringify({ plain, set }) };
      } finally {
        reader.style.display = '';
        document.getElementById('editor-container').style.display = '';
      }
    },
  });

  cases.push({
    id: 'paragraphformat_pdf_follows_the_editor_line_height_and_spaces_in_the_flow',
    description: 'PDF (lu par pdf.js, lignes de base peintes) : l\'espace avant (20 pt) et l\'espace après (10 pt) d\'un paragraphe s\'ajoutent aux hauteurs de ligne (14,91 pt) ; les deux lignes d\'un paragraphe à 2,0 fois la ligne simple (facteur 2,344) sont à 24,61 pt l\'une de l\'autre ; la distance de deux paragraphes ordinaires de part et d\'autre de ces réglages est celle de l\'éditeur, au demi-point près',
    run: async (h) => {
      const html = '<p>Aa</p><p data-space-before="20" data-space-after="10">Bb</p><p>Cc</p><p data-line-height="2.344">Dd<br>Ee</p><p>Ff</p>';
      await setDoc(h, html);
      const tops = editorTextTops(['Aa', 'Cc', 'Ff']);
      const y = await pdfBaselines(h, html, ['Aa', 'Bb', 'Cc', 'Dd', 'Ee', 'Ff']);
      const out = { y, step: { ab: y.Bb - y.Aa, bc: y.Cc - y.Bb, de: y.Ee - y.Dd, ef: y.Ff - y.Ee }, editor: { ac: tops.Cc - tops.Aa, cf: tops.Ff - tops.Cc }, pdf: { ac: y.Cc - y.Aa, cf: y.Ff - y.Cc } };
      const pass = Object.values(y).every(v => v !== null) && near(out.step.ab, LINE_PT + 20, 0.4) && near(out.step.bc, LINE_PT + 10, 0.4) && near(out.step.de, 10.5 * 2.344, 0.4) && out.step.ef > LINE_PT + 5
        && near(out.pdf.ac, out.editor.ac, 0.6) && near(out.pdf.cf, out.editor.cf, 0.6);
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'paragraphformat_pdf_follows_the_editor_in_a_list_a_quote_and_a_table_cell',
    description: 'PDF : l\'espace avant et l\'interligne d\'un paragraphe d\'un élément de liste, d\'une citation et d\'une case de tableau sont repris (écarts de lignes de base lus par pdf.js) ; la distance entre deux points de la même liste ou case de part et d\'autre du réglage est celle de l\'éditeur, au demi-point près',
    run: async (h) => {
      const out = {};
      const list = '<ul><li><p>L1</p></li><li><p data-space-before="12">L2</p></li><li><p>L3</p></li></ul>';
      await setDoc(h, list);
      const listTops = editorTextTops(['L1', 'L3']);
      const ly = await pdfBaselines(h, list, ['L1', 'L2', 'L3']);
      out.list = { step12: ly.L2 - ly.L1, step23: ly.L3 - ly.L2, editor13: listTops.L3 - listTops.L1, pdf13: ly.L3 - ly.L1 };
      const cell = '<table><tbody><tr><td><p>T1</p><p data-space-before="9" data-line-height="2.344">T2<br>T3</p><p>T4</p></td></tr></tbody></table>';
      await setDoc(h, cell);
      const cellTops = editorTextTops(['T1', 'T4']);
      const cy = await pdfBaselines(h, cell, ['T1', 'T2', 'T3', 'T4']);
      out.cell = { step12: cy.T2 - cy.T1, step23: cy.T3 - cy.T2, editor14: cellTops.T4 - cellTops.T1, pdf14: cy.T4 - cy.T1 };
      // Une citation : le PDF lui met 4 pt de marge là où l'éditeur en met 3 (un écart plus ancien que « Paragraphe… ») ; on compare donc ce que le réglage ajoute à la même citation sans réglage.
      const measureQuote = async (html) => {
        await setDoc(h, html);
        const tops = editorTextTops(['Q0', 'Q1', 'Q2']);
        const y = await pdfBaselines(h, html, ['Q0', 'Q1', 'Q2']);
        return { editor: [tops.Q1 - tops.Q0, tops.Q2 - tops.Q1], pdf: [y.Q1 - y.Q0, y.Q2 - y.Q1] };
      };
      const quoteSet = await measureQuote('<p>Q0</p><blockquote><p data-space-before="14" data-space-after="6">Q1</p></blockquote><p>Q2</p>');
      const quotePlain = await measureQuote('<p>Q0</p><blockquote><p>Q1</p></blockquote><p>Q2</p>');
      out.quote = {
        editorAdds: [quoteSet.editor[0] - quotePlain.editor[0], quoteSet.editor[1] - quotePlain.editor[1]],
        pdfAdds: [quoteSet.pdf[0] - quotePlain.pdf[0], quoteSet.pdf[1] - quotePlain.pdf[1]],
      };
      const pass = near(out.list.step12, LINE_PT + 12, 0.5) && near(out.list.step23, LINE_PT, 0.5) && near(out.list.pdf13, out.list.editor13, 0.7)
        && near(out.cell.step12, LINE_PT + 9, 0.5) && near(out.cell.step23, 10.5 * 2.344, 0.5) && near(out.cell.pdf14, out.cell.editor14, 0.8)
        && near(out.quote.editorAdds[0], 14, 0.6) && near(out.quote.editorAdds[1], 6, 0.6) && near(out.quote.pdfAdds[0], 14, 0.6) && near(out.quote.pdfAdds[1], 6, 0.6);
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'paragraphformat_word_writes_the_spacing_of_each_paragraph',
    description: 'Word (OOXML dézippé) : `w:spacing` porte l\'espace avant (20 pt = 400 vingtièmes) et après (10 pt = 200) et l\'interligne (2,344 de la taille = 563 deux-cent-quarantièmes de ligne) des paragraphes réglés ; un paragraphe sans réglage garde `after=0`, l\'interligne d\'origine (341) et aucun `before` ; un élément de liste et un paragraphe de case suivent de même',
    run: async (h) => {
      const html = '<p>Aa</p><p data-line-height="2.344" data-space-before="20" data-space-after="10">Bb</p><ul><li><p data-space-before="12" data-space-after="3">Li</p></li></ul>'
        + '<table><tbody><tr><td><p data-space-after="7">Ce</p></td></tr></tbody></table>';
      const out = await h.exportDocxParts(html);
      const textOf = p => Array.from(p.getElementsByTagName('w:t')).map(t => t.textContent).join('');
      const spacingOf = (text) => {
        const p = Array.from(out.doc.getElementsByTagName('w:p')).find(el => textOf(el) === text);
        const sp = p && p.getElementsByTagName('w:pPr')[0] && p.getElementsByTagName('w:pPr')[0].getElementsByTagName('w:spacing')[0];
        return sp ? { before: sp.getAttribute('w:before'), after: sp.getAttribute('w:after'), line: sp.getAttribute('w:line'), rule: sp.getAttribute('w:lineRule') } : null;
      };
      const got = { Aa: spacingOf('Aa'), Bb: spacingOf('Bb'), Li: spacingOf('Li'), Ce: spacingOf('Ce') };
      const pass = got.Aa && got.Aa.before === null && got.Aa.after === '0' && got.Aa.line === '341' && got.Aa.rule === 'auto'
        && got.Bb && got.Bb.before === '400' && got.Bb.after === '200' && got.Bb.line === '563' && got.Bb.rule === 'auto'
        && got.Li && got.Li.before === '240' && got.Li.after === '60' && got.Li.line === '341'
        && got.Ce && got.Ce.before === null && got.Ce.after === '140' && got.Ce.line === '341';
      return { pass, notes: JSON.stringify(got) };
    },
  });

  cases.push({
    id: 'paragraphformat_html_export_keeps_the_line_height_and_the_spaces_of_paragraphs_only',
    description: 'HTML exporté : le paragraphe réglé garde son interligne (`line-height`) et ses espaces (`padding-top`, `padding-bottom`) en style, comme l\'éditeur les écrit ; un autre élément ne garde aucun remplissage',
    run: async (h) => {
      // Le HTML que l'éditeur écrit : les attributs et le style de chaque réglage.
      const html = '<p data-line-height="1.055" data-space-before="10" data-space-after="6" style="line-height: 1.055; padding-top: 10pt; padding-bottom: 6pt;">Aa</p><p>Bb</p>';
      const out = await h.exportHtml(html, null, {}, null, '', { fragment: true });
      const first = (out.text.match(/<p[^>]*>Aa<\/p>/) || [''])[0];
      const second = (out.text.match(/<p[^>]*>Bb<\/p>/) || [''])[0];
      const stray = await h.exportHtml('<div style="padding-top: 9pt">Cc</div><p style="padding-right: 5pt">Dd</p>', null, {}, null, '', { fragment: true });
      // L'exportateur écrit sa propre feuille de style (qui parle de remplissage) : seul le document, au-dessous, compte.
      const body = stray.text.slice(stray.text.lastIndexOf('</style>') + 8);
      const pass = /line-height: 1\.055/.test(first) && /padding-top: 10pt/.test(first) && /padding-bottom: 6pt/.test(first) && !/style/.test(second) && /Cc/.test(body) && /Dd/.test(body) && !/padding/.test(body);
      return { pass, notes: JSON.stringify({ first, second, body }) };
    },
  });

  cases.push({
    id: 'paragraphformat_powerpoint_export_writes_the_line_spacing_and_the_spaces_of_each_paragraph',
    description: 'PowerPoint exporté : `a:lnSpc` en pourcentage de la ligne simple (1,055 = 90 %, l\'interligne d\'origine 121 %), `a:spcBef` l\'espace avant posé (10 pt) plus l\'écart mesuré avec le paragraphe d\'avant, `a:spcAft` l\'espace après posé (6 pt) ; les remplissages ne sont pas comptés deux fois (le deuxième paragraphe n\'a pas d\'espace avant)',
    run: async (h) => {
      await ExportEngines.ensure('pptx');
      const html = '<p data-line-height="1.055" data-space-before="10" data-space-after="6" style="line-height: 1.055; padding-top: 10pt; padding-bottom: 6pt;">Aa</p><p>Bb</p>';
      const blob = await PptxExport.fromHtml(html, { title: 'x' });
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const xml = await zip.file('ppt/slides/slide1.xml').async('string');
      const paragraphs = xml.match(/<a:p>.*?<\/a:p>/g) || [];
      const pick = (para, name, child) => { const m = new RegExp('<a:' + name + '><a:' + child + ' val="(\\d+)"').exec(para); return m ? Number(m[1]) : null; };
      const got = paragraphs.map(para => ({ line: pick(para, 'lnSpc', 'spcPct'), before: pick(para, 'spcBef', 'spcPts'), after: pick(para, 'spcAft', 'spcPts'), text: (/<a:t>([^<]*)<\/a:t>/.exec(para) || [])[1] }));
      const a = got.find(g => g.text === 'Aa');
      const b = got.find(g => g.text === 'Bb');
      const pass = !!a && !!b && near(a.line, 90017, 80) && near(a.before, 1000, 3) && near(a.after, 600, 3) && near(b.line, 121160, 80) && b.before === null && b.after === 0;
      return { pass, notes: JSON.stringify(got) };
    },
  });

  cases.push({
    id: 'paragraphformat_format_painter_copies_and_clears_the_line_height_and_the_spaces',
    description: 'Le pinceau de mise en forme copie l\'interligne et les espaces du paragraphe source sur les paragraphes qu\'on peint, et retire ceux d\'une cible quand la source n\'en a pas ; une légende n\'en reçoit pas',
    run: async (h) => {
      const out = {};
      // Le pinceau par son interface (copy / arm / apply) : le glissé à la vraie souris est dans dev-tests/verify-format-painter-mouse.mjs.
      const paint = async (source, targetFrom, targetTo) => {
        ed().commands.setTextSelection({ from: textPos(source), to: textPos(source) + source.length });
        await sleep(80);
        FormatPainter.copy();
        FormatPainter.arm(false);
        ed().commands.setTextSelection({ from: textPos(targetFrom), to: textPos(targetTo) + targetTo.length });
        await sleep(80);
        const painted = FormatPainter.apply();
        FormatPainter.disarm();
        await sleep(80);
        return painted;
      };
      try {
        await setDoc(h, '<p data-line-height="2.344" data-space-before="10" data-space-after="6">Aa</p><p>Bb</p><p data-space-before="4">Cc</p><p data-caption="true">Dd</p><p>Ee</p>');
        out.first = await paint('Aa', 'Bb', 'Bb');
        out.afterCopy = fmtList();
        out.second = await paint('Ee', 'Cc', 'Cc');
        out.afterClear = fmtList();
        out.third = await paint('Aa', 'Dd', 'Dd');
        out.afterCaption = fmtList();
        const pass = out.first && out.afterCopy === 'Aa[2.344|10|6]~Bb[2.344|10|6]~Cc[-|4|-]~Dd~Ee'
          && out.second && out.afterClear === 'Aa[2.344|10|6]~Bb[2.344|10|6]~Cc~Dd~Ee'
          && out.third && out.afterCaption === 'Aa[2.344|10|6]~Bb[2.344|10|6]~Cc~Dd~Ee';
        return { pass, notes: JSON.stringify(out) };
      } finally {
        FormatPainter.disarm();
      }
    },
  });

  // === 4) Les retraits (lot 2b) ========================================================================================================================================
  // Le bord gauche (pt) du texte `text` dans l'éditeur : le rectangle de ses premiers caractères. Les écarts entre deux textes sont ceux des positions peintes d'un PDF.
  function editorLeft(text) {
    const walker = document.createTreeWalker(document.querySelector('.tiptap'), NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.nodeValue.indexOf(text);
      if (at === -1) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + text.length);
      return range.getClientRects()[0].left * 0.75;
    }
    return null;
  }
  // Le PDF d'un HTML : le bord gauche (pt) du premier mot de chaque texte demandé.
  async function pdfLefts(h, html, texts) {
    const result = await h.exportPdfContent(html);
    const gt = await h.extractPdfGroundTruth(result.base64);
    const items = gt.pages[0].textItems;
    const out = {};
    texts.forEach((text) => { const item = items.find(i => i.str.trim() === text); out[text] = item ? item.x : null; });
    return out;
  }
  // Les écarts de chaque texte au texte `base` (pt) : { Aa: 0, Bb: 36, ... }.
  const offsets = (lefts, base) => Object.fromEntries(Object.entries(lefts).map(([text, x]) => [text, x === null || lefts[base] === null ? null : Math.round((x - lefts[base]) * 100) / 100]));
  const sameOffsets = (got, want, tolerance) => Object.keys(want).every(text => got[text] !== null && near(got[text], want[text], tolerance));

  cases.push({
    id: 'paragraphformat_indents_survive_the_html_round_trip_pair_up_and_never_come_from_a_pasted_style',
    description: 'Les deux retraits sont les attributs `data-indent-left` et `data-indent-first` (en points) : lus depuis le HTML, réécrits avec leur style (padding-left, text-indent) seulement quand ils sont posés ; la première ligne ne passe jamais à gauche de la marge du paragraphe (-25 pour un retrait de 10 devient -10 ; une première ligne négative sans retrait à gauche n\'est pas gardée) ; un style collé de Word ou d\'une page web ne change rien ; une valeur illisible, nulle ou hors bornes est écartée ou ramenée à la borne (1 584)',
    run: async (h) => {
      await setDoc(h, '<p data-indent-left="36" data-indent-first="18">Aa</p>'
        + '<p data-indent-left="10" data-indent-first="-25">Bb</p>'
        + '<p style="padding-left: 20pt; text-indent: 10pt">Cc</p>'
        + '<p data-indent-left="abc" data-indent-first="-3">Dd</p>'
        + '<p data-indent-left="5000" data-indent-first="2000">Ee</p>'
        + '<p data-indent-left="0" data-indent-first="0">Ff</p>'
        + '<p data-indent-first="-8">Gg</p>');
      const parsed = fmtList();
      const html = written();
      const tag = text => (html.match(new RegExp('<p[^>]*>' + text + '</p>')) || [''])[0];
      const first = tag('Aa');
      const hanging = tag('Bb');
      const pass = parsed === 'Aa{36|18}~Bb{10|-10}~Cc~Dd~Ee{1584|1584}~Ff~Gg'
        && /data-indent-left="36"/.test(first) && /data-indent-first="18"/.test(first) && /padding-left: 36pt/.test(first) && /text-indent: 18pt/.test(first)
        && /data-indent-first="-10"/.test(hanging) && /text-indent: -10pt/.test(hanging)
        && /<p>Cc<\/p><p>Dd<\/p>/.test(html) && /<p>Ff<\/p><p>Gg<\/p>/.test(html) && !/20pt/.test(html);
      return { pass, notes: JSON.stringify({ parsed, first, hanging }) };
    },
  });

  cases.push({
    id: 'paragraphformat_editor_shows_the_indents_and_a_hanging_first_line',
    description: 'L\'éditeur montre les retraits : le retrait à gauche pousse toutes les lignes (36 pt), celui de la première ligne s\'y ajoute à la première seule (54 pt, puis 36), un retrait suspendu (-18) fait ressortir la première ligne (18 pt, puis 36) ; ce sont un remplissage de 48 px et un text-indent de 24 px ; la case à cocher d\'un paragraphe en retrait garde son propre text-indent (3em), une pastille ou une image en ligne ne reprend pas celui du paragraphe',
    run: async (h) => {
      await setDoc(h, '<p>Aa<br>Ab</p><p data-indent-left="36">Bb<br>Bc</p><p data-indent-left="36" data-indent-first="18">Cc<br>Cd</p><p data-indent-left="36" data-indent-first="-18">Dd<br>De</p>'
        + '<p data-indent-first="12">Ee<br>Ef</p>');
      const texts = ['Aa', 'Ab', 'Bb', 'Bc', 'Cc', 'Cd', 'Dd', 'De', 'Ee', 'Ef'];
      const lefts = {};
      texts.forEach((text) => { lefts[text] = editorLeft(text); });
      const got = offsets(lefts, 'Aa');
      const want = { Aa: 0, Ab: 0, Bb: 36, Bc: 36, Cc: 54, Cd: 36, Dd: 18, De: 36, Ee: 12, Ef: 0 };
      const styleOf = (text) => {
        const p = Array.from(document.querySelectorAll('.tiptap p')).find(el => el.textContent.indexOf(text) === 0);
        const cs = getComputedStyle(p);
        return { left: parseFloat(cs.paddingLeft), indent: parseFloat(cs.textIndent) };
      };
      const bb = styleOf('Bb');
      const cc = styleOf('Cc');
      // Une pastille de variable et une case à cocher dans un paragraphe à première ligne en retrait : leur text-indent ne vient pas du paragraphe.
      await setDoc(h, '<p data-indent-left="36" data-indent-first="18">Cc <span class="var-badge" data-table="Clients" data-column="Nom" data-key="Clients.Nom"></span> fin</p>');
      const badge = document.querySelector('.tiptap .var-badge');
      const badgeIndent = badge ? parseFloat(getComputedStyle(badge).textIndent) : null;
      const pass = sameOffsets(got, want, 0.4) && near(bb.left, 48, 0.1) && bb.indent === 0 && near(cc.indent, 24, 0.1) && badgeIndent === 0;
      return { pass, notes: JSON.stringify({ got, bb, cc, badgeIndent }) };
    },
  });

  cases.push({
    id: 'paragraphformat_indents_sleep_in_a_list_and_a_quote_and_come_back_with_the_paragraph',
    description: 'Dans un élément de liste et dans une citation, le retrait n\'a pas cours : l\'attribut reste dans le HTML (il revient avec le paragraphe) mais l\'éditeur ne le montre pas (remplissage et text-indent à 0, texte au même endroit que sans attribut) ; le paragraphe qui en sort (levé de la liste) le retrouve',
    run: async (h) => {
      const withAttrs = '<ul><li><p data-indent-left="40" data-indent-first="10">Li</p></li></ul><blockquote><p data-indent-left="40" data-indent-first="10">Qu</p></blockquote>';
      const plain = '<ul><li><p>Li</p></li></ul><blockquote><p>Qu</p></blockquote>';
      await setDoc(h, plain);
      const base = { Li: editorLeft('Li'), Qu: editorLeft('Qu') };
      await setDoc(h, '<p>Zz</p>');
      const margin = editorLeft('Zz');
      await setDoc(h, withAttrs);
      const slept = { Li: editorLeft('Li'), Qu: editorLeft('Qu') };
      const computed = Array.from(document.querySelectorAll('.tiptap li p, .tiptap blockquote p')).map((p) => { const cs = getComputedStyle(p); return [parseFloat(cs.paddingLeft), parseFloat(cs.textIndent)]; });
      const kept = written();
      // Le paragraphe de la liste, levé hors d'elle, retrouve son retrait.
      await cursorIn('Li');
      ed().commands.liftListItem('listItem');
      await sleep(150);
      const lifted = editorLeft('Li');
      const pass = near(slept.Li, base.Li, 0.2) && near(slept.Qu, base.Qu, 0.2) && computed.every(([left, indent]) => left === 0 && indent === 0)
        && (kept.match(/data-indent-left="40"/g) || []).length === 2 && /Li\{40\|10\}/.test(fmtList()) && near(lifted - margin, 50, 0.4);
      return { pass, notes: JSON.stringify({ base, slept, computed, margin, lifted, list: fmtList() }) };
    },
  });

  cases.push({
    id: 'paragraphformat_enter_keeps_the_indents_on_the_new_paragraph',
    description: 'Entrée à la fin d\'un paragraphe en retrait ouvre un paragraphe qui garde les mêmes retraits',
    run: async (h) => {
      await setDoc(h, '<p data-indent-left="36" data-indent-first="-18">AaBb</p>');
      ed().commands.setTextSelection(textPos('AaBb') + 4);
      ed().commands.splitBlock();
      await sleep(100);
      const list = fmtList();
      return { pass: list === 'AaBb{36|-18}~{36|-18}', notes: list };
    },
  });

  // La fenêtre : cinq champs.
  const fieldsAll = () => ({ line: input('lineHeight').value, before: input('spaceBefore').value, after: input('spaceAfter').value, left: input('indentLeft').value, first: input('indentFirst').value });
  cases.push({
    id: 'paragraphformat_window_sets_the_indents_in_one_undo_and_keeps_the_first_line_inside_the_margin',
    description: 'La fenêtre a un champ « Retrait à gauche » et un champ « Première ligne » (négatif : retrait suspendu) : sur un paragraphe ordinaire ils s\'ouvrent à 0, « Valider » pose 36 / 18 en une seule transaction (un Annuler les retire) ; rouverte, la fenêtre les montre ; une première ligne suspendue plus loin que le retrait à gauche (-40 pour 36) est refusée sous le champ avec la limite, « Valider » grisé ; réduire le retrait à gauche sous la première ligne suspendue est refusé de même, jusqu\'à ce qu\'elle suive',
    run: async (h) => {
      const out = {};
      const error = () => document.getElementById('pp-parafmt-error');
      await setDoc(h, '<p>Aa</p><p>Bb</p>');
      await cursorIn('Bb');
      await pressRow();
      out.initial = fieldsAll();
      type('indentLeft', '36');
      type('indentFirst', '18');
      await submit();
      out.list = fmtList();
      ed().commands.undo();
      await sleep(150);
      out.undone = fmtList();
      ed().commands.redo();
      await sleep(150);
      await pressRow();
      out.reopened = fieldsAll();
      type('indentFirst', '-40');
      out.tooFar = { text: error().textContent, invalid: input('indentFirst').getAttribute('aria-invalid'), okDisabled: okButton().disabled };
      type('indentFirst', '-18');
      out.hanging = { shown: !error().hidden, okDisabled: okButton().disabled };
      await submit();
      out.hung = fmtList();
      await pressRow();
      type('indentLeft', '10');
      out.shrunk = { text: error().textContent, invalid: input('indentFirst').getAttribute('aria-invalid'), okDisabled: okButton().disabled };
      type('indentFirst', '-10');
      out.followed = { shown: !error().hidden, okDisabled: okButton().disabled };
      await submit();
      out.final = fmtList();
      const dot = FRENCH ? ',' : '.';
      const pass = out.initial.left === '0' && out.initial.first === '0' && out.list === 'Aa~Bb{36|18}' && out.undone === 'Aa~Bb'
        && out.reopened.left === '36' && out.reopened.first === '18'
        && out.tooFar.okDisabled && out.tooFar.invalid === 'true' && /36/.test(out.tooFar.text) && out.hanging.shown === false && !out.hanging.okDisabled && out.hung === 'Aa~Bb{36|-18}'
        && out.shrunk.okDisabled && out.shrunk.invalid === 'true' && /10/.test(out.shrunk.text) && !out.followed.shown && !out.followed.okDisabled && out.final === 'Aa~Bb{10|-10}' && dot.length === 1;
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'paragraphformat_window_refuses_indents_that_are_not_numbers_or_out_of_range',
    description: 'Un retrait qui n\'est pas un nombre ou qui sort des bornes (0 à 1 584 pt, la première ligne de -1 584 à 1 584) est refusé sous le champ ; un signe moins n\'est permis que dans le champ de la première ligne (un espace de -3 est refusé) ; « − » (le vrai signe moins) et « -18 pt » sont des nombres ; un retrait suspendu sans retrait à gauche est refusé, avec la limite 0',
    run: async (h) => {
      const out = {};
      const error = () => document.getElementById('pp-parafmt-error');
      const state = key => ({ text: error().textContent, invalid: input(key).getAttribute('aria-invalid'), okDisabled: okButton().disabled });
      await setDoc(h, '<p>Aa</p>');
      await cursorIn('Aa');
      await pressRow();
      type('indentLeft', 'abc');
      out.letters = state('indentLeft');
      type('indentLeft', '1585');
      out.high = state('indentLeft');
      type('indentLeft', '-3');
      out.negative = state('indentLeft');
      type('indentLeft', '0');
      type('indentFirst', '1585');
      out.firstHigh = state('indentFirst');
      type('indentFirst', '-1585');
      out.firstLow = state('indentFirst');
      type('indentFirst', '−18 pt');
      out.minus = state('indentFirst');
      type('indentLeft', '20');
      type('indentFirst', '-18 pt');
      out.withPt = { okDisabled: okButton().disabled, shown: !error().hidden };
      type('indentLeft', '');
      out.leftEmptied = state('indentFirst');
      cancelButton().click();
      await sleep(100);
      const pass = out.letters.okDisabled && out.letters.invalid === 'true' && /nombre|number/i.test(out.letters.text)
        && out.high.okDisabled && /1584/.test(out.high.text)
        && out.negative.okDisabled && /nombre|number/i.test(out.negative.text)
        && out.firstHigh.okDisabled && /1584/.test(out.firstHigh.text) && out.firstLow.okDisabled && out.firstLow.invalid === 'true'
        && out.minus.okDisabled && out.minus.invalid === 'true' && /0/.test(out.minus.text)
        && !out.withPt.okDisabled && !out.withPt.shown
        && out.leftEmptied.okDisabled && out.leftEmptied.invalid === 'true' && !isOpen();
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'paragraphformat_indent_fields_are_greyed_with_their_reason_in_a_list_and_a_quote_and_apply_only_to_free_paragraphs',
    description: 'Dans un élément de liste ou une citation, la ligne reste active (interligne et espaces) mais les deux champs de retrait sont grisés avec leur raison ; sur une sélection qui mêle un paragraphe ordinaire et un point de liste, les champs de retrait sont ouverts, ne lisent que le paragraphe ordinaire et ne posent le retrait que sur lui (le point de liste garde le sien, endormi)',
    run: async (h) => {
      const out = {};
      await setDoc(h, '<ul><li><p data-indent-left="20">Li</p></li></ul><blockquote><p>Qu</p></blockquote><p data-indent-left="12">Fr</p>');
      for (const text of ['Li', 'Qu']) {
        await cursorIn(text);
        await pressRow();
        out[text] = { off: [input('indentLeft').disabled, input('indentFirst').disabled], reason: input('indentLeft').title !== '', spacingOn: !input('lineHeight').disabled && !input('spaceBefore').disabled, indentFields: [input('indentLeft').value, input('indentFirst').value] };
        type('spaceBefore', '5');
        await submit();
      }
      out.afterSpacing = fmtList();
      await selectRange('Li', 'Fr');
      await pressRow();
      out.mixed = { off: [input('indentLeft').disabled, input('indentFirst').disabled], left: input('indentLeft').value, placeholder: input('indentLeft').placeholder };
      type('indentLeft', '30');
      await submit();
      out.after = fmtList();
      const pass = out.Li.off.every(Boolean) && out.Li.reason && out.Li.spacingOn && out.Li.indentFields.join('|') === '|'
        && out.Qu.off.every(Boolean) && out.Qu.reason && out.Qu.spacingOn
        && out.afterSpacing === 'Li[-|5|-]{20|-}~Qu[-|5|-]~Fr{12|-}'
        && out.mixed.off.every(v => !v) && out.mixed.left === '12' && out.mixed.placeholder === ''
        && out.after === 'Li[-|5|-]{20|-}~Qu[-|5|-]~Fr{30|-}';
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'paragraphformat_reset_button_clears_the_indents_with_the_other_fields',
    description: '« Par défaut » remet aussi les retraits à 0 ; « Valider » retire alors leurs attributs',
    run: async (h) => {
      const out = {};
      await setDoc(h, '<p data-indent-left="36" data-indent-first="-18" data-space-before="4">Aa</p>');
      await cursorIn('Aa');
      await pressRow();
      out.opened = fieldsAll();
      resetButton().click();
      await sleep(50);
      out.reset = fieldsAll();
      await submit();
      out.cleared = fmtList();
      const pass = out.opened.left === '36' && out.opened.first === '-18' && out.reset.left === '0' && out.reset.first === '0' && out.cleared === 'Aa';
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'paragraphformat_reader_shows_the_indents_and_keeps_the_checkbox_text_indent',
    description: 'La Lecture montre les retraits (36 pt à gauche, 18 pt à la première ligne) ; ceux d\'un paragraphe de liste dorment ; la case à cocher d\'un paragraphe en retrait garde son text-indent de 3em et un enfant direct du paragraphe n\'hérite pas du retrait de sa première ligne',
    run: async (h) => {
      const reader = document.getElementById('reader-container');
      try {
        reader.style.display = 'block';
        await ReaderMode.render('<p data-indent-left="36" data-indent-first="18" style="padding-left: 36pt; text-indent: 18pt"><span class="resolved-checkbox">☑</span> Aa <span class="inline-child">x</span></p>'
          + '<ul><li><p data-indent-left="30" data-indent-first="10" style="padding-left: 30pt; text-indent: 10pt">Li</p></li></ul>', null, { id: 1 }, NO_HF);
        const content = reader.querySelector('.reader-content');
        const cs = el => getComputedStyle(el);
        const p = content.querySelector('p');
        const li = content.querySelector('li p');
        const box = content.querySelector('.resolved-checkbox');
        const badge = content.querySelector('.inline-child');
        const got = { left: parseFloat(cs(p).paddingLeft), first: parseFloat(cs(p).textIndent), liLeft: parseFloat(cs(li).paddingLeft), liFirst: parseFloat(cs(li).textIndent), box: box && parseFloat(cs(box).textIndent), badge: badge && parseFloat(cs(badge).textIndent), font: box && parseFloat(cs(box).fontSize) };
        const pass = near(got.left, 36 * PX_PER_PT) && near(got.first, 18 * PX_PER_PT) && got.liLeft === 0 && got.liFirst === 0 && near(got.box, 3 * got.font, 0.2) && got.badge === 0;
        return { pass, notes: JSON.stringify(got) };
      } finally {
        reader.style.display = '';
        document.getElementById('editor-container').style.display = '';
      }
    },
  });

  cases.push({
    id: 'paragraphformat_pdf_indents_follow_the_editor_and_sleep_in_a_list_and_a_quote',
    description: 'PDF (lu par pdf.js : bords gauches peints) : le retrait à gauche (36 pt) pousse les deux lignes d\'un paragraphe, celui de la première ligne (18 pt) s\'y ajoute à la première seule, un retrait suspendu (-18 pt) la fait ressortir, un retrait seul de première ligne (12 pt) ne touche pas la seconde ; les écarts sont ceux de l\'éditeur, au demi-point près ; le paragraphe d\'une case de tableau suit de même ; le retrait d\'un paragraphe de liste ou de citation ne change rien (mêmes positions que sans)',
    run: async (h) => {
      const free = '<p>Aa<br>Ab</p><p data-indent-left="36">Bb<br>Bc</p><p data-indent-left="36" data-indent-first="18">Cc<br>Cd</p><p data-indent-left="36" data-indent-first="-18">Dd<br>De</p><p data-indent-first="12">Ee<br>Ef</p>'
        + '<table><tbody><tr><td><p>T0</p><p data-indent-left="12">Te</p></td></tr></tbody></table>';
      const texts = ['Aa', 'Ab', 'Bb', 'Bc', 'Cc', 'Cd', 'Dd', 'De', 'Ee', 'Ef', 'T0', 'Te'];
      await setDoc(h, free);
      const editor = {};
      texts.forEach((text) => { editor[text] = editorLeft(text); });
      const pdf = await pdfLefts(h, free, texts);
      const pdfOffsets = offsets(pdf, 'Aa');
      const editorOffsets = offsets(editor, 'Aa');
      // La cellule a sa propre origine : ses deux paragraphes comparés entre eux.
      const cell = { pdf: pdf.Te - pdf.T0, editor: editor.Te - editor.T0 };
      const want = { Aa: 0, Ab: 0, Bb: 36, Bc: 36, Cc: 54, Cd: 36, Dd: 18, De: 36, Ee: 12, Ef: 0 };
      const sleeping = '<ul><li><p data-indent-left="40" data-indent-first="10">Li</p></li></ul><blockquote><p data-indent-left="40" data-indent-first="10">Qu</p></blockquote>';
      const plain = '<ul><li><p>Li</p></li></ul><blockquote><p>Qu</p></blockquote>';
      const slept = await pdfLefts(h, sleeping, ['Li', 'Qu']);
      const base = await pdfLefts(h, plain, ['Li', 'Qu']);
      const wantEditor = Object.fromEntries(Object.keys(want).map(text => [text, want[text]]));
      const pass = sameOffsets(pdfOffsets, want, 0.6) && sameOffsets(editorOffsets, wantEditor, 0.4) && near(cell.pdf, 12, 0.6) && near(cell.editor, 12, 0.4)
        && slept.Li !== null && near(slept.Li, base.Li, 0.05) && near(slept.Qu, base.Qu, 0.05);
      return { pass, notes: JSON.stringify({ pdfOffsets, editorOffsets, cell, slept, base }) };
    },
  });

  cases.push({
    id: 'paragraphformat_word_writes_the_indents_of_free_paragraphs_only',
    description: 'Word (OOXML dézippé) : `w:ind` porte le retrait à gauche (36 pt = 720 vingtièmes), la première ligne en plus (`w:firstLine` 360) ou suspendue (`w:hanging` 360) ; un retrait de première ligne seul n\'écrit que `w:firstLine` ; un paragraphe sans retrait n\'a pas de `w:ind` ; une case de tableau suit de même ; un paragraphe de liste ou de citation garde le `w:ind` qu\'il aurait sans l\'attribut',
    run: async (h) => {
      const free = '<p>Aa</p><p data-indent-left="36">Bb</p><p data-indent-left="36" data-indent-first="18">Cc</p><p data-indent-left="36" data-indent-first="-18">Dd</p><p data-indent-first="12">Ee</p>'
        + '<table><tbody><tr><td><p data-indent-left="9">Ce</p></td></tr></tbody></table>';
      const sleeping = '<ul><li><p data-indent-left="40" data-indent-first="10">Li</p></li></ul><blockquote><p data-indent-left="40" data-indent-first="10">Qu</p></blockquote>';
      const plain = '<ul><li><p>Li</p></li></ul><blockquote><p>Qu</p></blockquote>';
      const indOf = (parts, text) => {
        const textOf = p => Array.from(p.getElementsByTagName('w:t')).map(t => t.textContent).join('');
        const p = Array.from(parts.doc.getElementsByTagName('w:p')).find(el => textOf(el) === text);
        const ind = p && p.getElementsByTagName('w:pPr')[0] && p.getElementsByTagName('w:pPr')[0].getElementsByTagName('w:ind')[0];
        if (!ind) return null;
        const get = name => ind.getAttribute('w:' + name);
        return { left: get('left') === null ? get('start') : get('left'), firstLine: get('firstLine'), hanging: get('hanging') };
      };
      const parts = await h.exportDocxParts(free);
      const got = { Aa: indOf(parts, 'Aa'), Bb: indOf(parts, 'Bb'), Cc: indOf(parts, 'Cc'), Dd: indOf(parts, 'Dd'), Ee: indOf(parts, 'Ee'), Ce: indOf(parts, 'Ce') };
      const slept = await h.exportDocxParts(sleeping);
      const base = await h.exportDocxParts(plain);
      const twin = { Li: [indOf(slept, 'Li'), indOf(base, 'Li')], Qu: [indOf(slept, 'Qu'), indOf(base, 'Qu')] };
      const pass = got.Aa === null
        && got.Bb && got.Bb.left === '720' && got.Bb.firstLine === null && got.Bb.hanging === null
        && got.Cc && got.Cc.left === '720' && got.Cc.firstLine === '360' && got.Cc.hanging === null
        && got.Dd && got.Dd.left === '720' && got.Dd.hanging === '360' && got.Dd.firstLine === null
        && got.Ee && (got.Ee.left === null || got.Ee.left === '0') && got.Ee.firstLine === '240'
        && got.Ce && got.Ce.left === '180'
        && JSON.stringify(twin.Li[0]) === JSON.stringify(twin.Li[1]) && JSON.stringify(twin.Qu[0]) === JSON.stringify(twin.Qu[1]);
      return { pass, notes: JSON.stringify({ got, twin }) };
    },
  });

  cases.push({
    id: 'paragraphformat_html_export_keeps_the_indents_of_free_paragraphs_only',
    description: 'HTML exporté : un paragraphe garde son retrait à gauche (`padding-left`) et celui de sa première ligne (`text-indent`) en style ; ceux d\'un paragraphe de liste ou de citation, endormis, ne sont pas écrits (le fichier n\'a pas la feuille de style de l\'éditeur qui les neutralise) ; un remplissage à gauche d\'un autre élément n\'est pas gardé',
    run: async (h) => {
      const html = '<p data-indent-left="36" data-indent-first="18" style="padding-left: 36pt; text-indent: 18pt;">Aa</p>'
        + '<ul><li><p data-indent-left="30" data-indent-first="10" style="padding-left: 30pt; text-indent: 10pt;">Li</p></li></ul>'
        + '<blockquote><p data-indent-left="30" data-indent-first="10" style="padding-left: 30pt; text-indent: 10pt;">Qu</p></blockquote>'
        + '<div style="padding-left: 9pt">Cc</div>';
      const out = await h.exportHtml(html, null, {}, null, '', { fragment: true });
      const body = out.text.slice(out.text.lastIndexOf('</style>') + 8);
      const first = (body.match(/<p[^>]*>Aa<\/p>/) || [''])[0];
      const inList = (body.match(/<li[^>]*>.*?Li.*?<\/li>/) || [''])[0];
      const inQuote = (body.match(/<blockquote[^>]*>.*?Qu.*?<\/blockquote>/) || [''])[0];
      const pass = /padding-left: 36pt/.test(first) && /text-indent: 18pt/.test(first) && !/padding-left|text-indent/.test(inList) && /Li/.test(inList) && !/padding-left|text-indent/.test(inQuote) && /Qu/.test(inQuote) && !/9pt/.test(body);
      return { pass, notes: JSON.stringify({ first, inList, inQuote }) };
    },
  });

  cases.push({
    id: 'paragraphformat_powerpoint_export_writes_the_indents_of_free_paragraphs',
    description: 'PowerPoint exporté : `marL` porte le retrait à gauche (36 pt = 457 200 EMU) et `indent` celui de la première ligne (18 pt = 228 600 ; suspendu : négatif) ; un paragraphe sans retrait n\'a ni l\'un ni l\'autre ; le retrait d\'un point de liste ou d\'une citation reste celui de la liste',
    run: async (h) => {
      await ExportEngines.ensure('pptx');
      const pick = async (html) => {
        const blob = await PptxExport.fromHtml(html, { title: 'x' });
        const zip = await JSZip.loadAsync(await blob.arrayBuffer());
        const xml = await zip.file('ppt/slides/slide1.xml').async('string');
        const out = {};
        (xml.match(/<a:p>.*?<\/a:p>/g) || []).forEach((para) => {
          const text = (/<a:t>([^<]*)<\/a:t>/.exec(para) || [])[1];
          const attrs = (/<a:pPr ([^>]*)>/.exec(para) || [])[1] || '';
          const get = name => { const m = new RegExp('(?:^| )' + name + '="(-?\\d+)"').exec(attrs); return m ? Number(m[1]) : null; };
          if (text) out[text] = { marL: get('marL'), indent: get('indent') };
        });
        return out;
      };
      const free = await pick('<p>Aa</p><p data-indent-left="36" style="padding-left: 36pt;">Bb</p><p data-indent-left="36" data-indent-first="18" style="padding-left: 36pt; text-indent: 18pt;">Cc</p>'
        + '<p data-indent-left="36" data-indent-first="-18" style="padding-left: 36pt; text-indent: -18pt;">Dd</p><p data-indent-first="12" style="text-indent: 12pt;">Ee</p>');
      const sleeping = await pick('<ul><li><p data-indent-left="40" data-indent-first="10" style="padding-left: 40pt; text-indent: 10pt;">Li</p></li></ul><blockquote><p data-indent-left="40" data-indent-first="10" style="padding-left: 40pt; text-indent: 10pt;">Qu</p></blockquote>');
      const plain = await pick('<ul><li><p>Li</p></li></ul><blockquote><p>Qu</p></blockquote>');
      const is = (got, marL, indent, tolerance = 3) => !!got && (marL === null ? got.marL === null : near(got.marL, marL, tolerance)) && (indent === null ? got.indent === null : near(got.indent, indent, tolerance));
      const pass = is(free.Aa, null, null) && is(free.Bb, 457200, null) && is(free.Cc, 457200, 228600) && is(free.Dd, 457200, -228600) && is(free.Ee, null, 152400)
        && JSON.stringify(sleeping.Li) === JSON.stringify(plain.Li) && JSON.stringify(sleeping.Qu) === JSON.stringify(plain.Qu);
      return { pass, notes: JSON.stringify({ free, sleeping, plain }) };
    },
  });

  cases.push({
    id: 'paragraphformat_format_painter_copies_and_clears_the_indents_but_not_into_a_list_or_a_quote',
    description: 'Le pinceau copie les retraits d\'un paragraphe ordinaire sur les paragraphes ordinaires qu\'on peint et les retire quand la source n\'en a pas ; un paragraphe de liste ou de citation qu\'on peint garde ses retraits endormis tels quels ; une source de liste ou de citation ne montre aucun retrait (elle efface ceux de la cible)',
    run: async (h) => {
      const out = {};
      const paint = async (source, target) => {
        ed().commands.setTextSelection({ from: textPos(source), to: textPos(source) + source.length });
        await sleep(80);
        FormatPainter.copy();
        FormatPainter.arm(false);
        ed().commands.setTextSelection({ from: textPos(target), to: textPos(target) + target.length });
        await sleep(80);
        const painted = FormatPainter.apply();
        FormatPainter.disarm();
        await sleep(80);
        return painted;
      };
      try {
        await setDoc(h, '<p data-indent-left="36" data-indent-first="18">Aa</p><p>Bb</p><p data-indent-left="12">Cc</p><ul><li><p data-indent-left="20">Li</p></li></ul><p>Ee</p><ul><li><p>Lj</p></li></ul><p data-indent-left="8">Ff</p>');
        out.first = await paint('Aa', 'Bb');
        out.afterCopy = fmtList();
        out.second = await paint('Ee', 'Cc');
        out.afterClear = fmtList();
        out.third = await paint('Aa', 'Lj');
        out.intoList = fmtList();
        out.fourth = await paint('Ee', 'Li');
        out.keepsSleeping = fmtList();
        out.fifth = await paint('Li', 'Ff');
        out.fromList = fmtList();
        const pass = out.first && out.afterCopy === 'Aa{36|18}~Bb{36|18}~Cc{12|-}~Li{20|-}~Ee~Lj~Ff{8|-}'
          && out.second && out.afterClear === 'Aa{36|18}~Bb{36|18}~Cc~Li{20|-}~Ee~Lj~Ff{8|-}'
          && out.third && out.intoList === 'Aa{36|18}~Bb{36|18}~Cc~Li{20|-}~Ee~Lj~Ff{8|-}'
          && out.fourth && out.keepsSleeping === 'Aa{36|18}~Bb{36|18}~Cc~Li{20|-}~Ee~Lj~Ff{8|-}'
          && out.fifth && out.fromList === 'Aa{36|18}~Bb{36|18}~Cc~Li{20|-}~Ee~Lj~Ff';
        return { pass, notes: JSON.stringify(out) };
      } finally {
        FormatPainter.disarm();
      }
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.paragraphFormat = cases;
})();
