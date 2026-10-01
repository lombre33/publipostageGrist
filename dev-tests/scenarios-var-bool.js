// Suite "varBool" - la barre flottante d'une variable Oui / Non et ce que la bulle écrit (demande d'Antoine, 2026-10-01 : « Pour afficher une variable qui est un boolean, peux-tu me faire aussi
// un toolbar dédié comme pour date et image ? avec 4 format : les 3 existant déjà pour la check-list [...], laisser un vrai/faux true/false (par rapport à la langue) »).
// Une bulle sur une colonne Oui / Non (Bool) a quatre écritures, portées par `format = { type: 'bool', style }` (js/variable-format.js:formatBool) : les trois styles de la liste à cases
// (`accentStrike`, `classic`, `accentPlain`) écrivent une case ☑ / ☐ ; sans réglage - ou `text` - la bulle écrit « vrai » / « faux » (« true » / « false » en interface anglaise).
// js/variables.js:formatValue est le seul point d'application : il rend le caractère ☑ / ☐ ; js/reader-mode.js le transforme en vraie case dessinée (`.resolved-checkbox`, couleur EN LIGNE) pour la
// Lecture et pour tous les exports, qui lisent cette couleur et ce style en ligne (PDF : polices de cases js/pdf-fonts-boxes.js ; Word et Excel : police des symboles ; e-mail : « [x] » / « [ ] »).
// Les deux styles « accent » dessinent la même case : le texte qui suit n'est jamais barré, le barré n'existe que dans la liste à cases (réponse d'Antoine, 01/10 : « Non, la case seule »). Les champs
// texte (Objet, À, Cc, Cci, nom du PDF) et les valeurs montrées comme donnée (attributs d'une ligne liée) gardent « true » / « false » comme avant.
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const PAGE = 'VbDossiers';
  const LINES = 'VbLignes';
  const CHECKED = '☑';
  const UNCHECKED = '☐';
  const STYLES = ['accentStrike', 'classic', 'accentPlain'];
  const RECORD = { id: 1, Nom: 'Dupont', Actif: true, Paye: false, Montant: 12 };

  const attr = (name, value) => ` ${name}="${JSON.stringify(value).replace(/"/g, '&quot;')}"`;
  const bool = style => (style ? { type: 'bool', style } : null);
  function badge(column, format, table, loop) {
    const t = table || PAGE;
    const loopAttrs = loop ? attr('data-loop', loop) + ` data-loop-repeat="${loop.repeat || 'inline'}"` : '';
    return `<span class="var-badge" data-table="${t}" data-column="${column}" data-key="${t}.${column}"${format ? attr('data-format', format) : ''}${loopAttrs}></span>`;
  }
  const inLang = (lang, fn) => { const before = I18n.getLang(); I18n.setLang(lang); try { return fn(); } finally { I18n.setLang(before); } };
  const inLangAsync = async (lang, fn) => { const before = I18n.getLang(); I18n.setLang(lang); try { return await fn(); } finally { I18n.setLang(before); } };
  const failedOf = checks => Object.keys(checks).filter(k => !checks[k]);

  async function seed(h) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables(PAGE, { Nom: 'Text', Actif: 'Bool', Paye: 'Bool', Montant: 'Numeric', Naissance: 'Date' });
    stub.setVariables(LINES, { Dossier: 'Ref:' + PAGE, Libelle: 'Text', Livre: 'Bool', manualSort: 'ManualSortPos' });
    stub.setRows(PAGE, [Object.assign({}, RECORD)]);
    stub.setRows(LINES, [
      { id: 1, Dossier: 1, Libelle: 'Livret', Livre: true, manualSort: 1 },
      { id: 2, Dossier: 1, Libelle: 'Affiche', Livre: false, manualSort: 2 },
      { id: 3, Dossier: 1, Libelle: 'Badge', Livre: true, manualSort: 3 },
    ]);
    await GristAPI.refreshSchema();
    // Les lignes de VbLignes sont celles du dossier affiché (colonne Référence Dossier = id de la ligne de la page).
    await GristAPI.deleteLinkRule(LINES);
    await GristAPI.saveLinkRule(LINES, { mode: 'match', colonneCible: 'Dossier', colonneSource: 'id' });
    await GristAPI.refreshSchema();
    stub.fireRecord(Object.assign({}, RECORD), PAGE);
    await h.sleep(30);
  }
  async function renderReader(html, hf) {
    const reader = document.getElementById('reader-container');
    reader.style.display = 'block';
    await ReaderMode.render(html, PAGE, Object.assign({}, RECORD), hf || NO_HF);
    return reader;
  }
  async function previewBox(html) {
    const box = document.createElement('div');
    box.innerHTML = await ReaderMode.preview(html, PAGE, Object.assign({}, RECORD));
    return box;
  }
  const checkedOf = root => Array.from(root.querySelectorAll('.resolved-checkbox')).map(b => b.getAttribute('data-checked'));
  const rgb = hex => 'rgb(' + [1, 3, 5].map(i => parseInt(hex.substr(i, 2), 16)).join(', ') + ')';
  // Rapport de contraste d'une couleur « #rrggbb » sur le blanc du papier.
  const contrastOnWhite = hex => {
    const lin = [1, 3, 5].map(i => parseInt(hex.substr(i, 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 1.05 / (0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2] + 0.05);
  };

  // --- Le format et ce que formatValue écrit ---
  cases.push({
    id: 'varbool_a_yes_no_value_is_written_as_words_by_language_or_as_one_of_the_three_boxes',
    description: 'Variables.formatValue : sans réglage ou en « vrai / faux », une valeur Oui / Non s’écrit « vrai » / « faux » en français et « true » / « false » en anglais ; les trois styles de case écrivent ☑ / ☐ dans les deux langues, une liste de valeurs aussi (« ☑, ☐ ») ; un style inconnu ou un format d’un autre type retombe sur les mots ; les champs texte (Objet, À, Cc, Cci, nom du PDF) et les valeurs montrées comme donnée gardent « true » / « false » ; une valeur vide, un texte ou un nombre ne changent pas ; les couleurs des cases passent 4,5:1 sur le papier',
    run: async (h) => {
      await seed(h);
      const fv = (v, f, col, opts) => Variables.formatValue(v, f, PAGE, col || 'Actif', opts);
      const got = {
        fr: inLang('fr', () => [fv(true, null), fv(false, null), fv(true, bool('text')), fv(false, bool('text')), fv(true, {}), fv(true, { type: 'number', style: 'us' })]),
        en: inLang('en', () => [fv(true, null), fv(false, null), fv(true, bool('text')), fv(false, bool('text'))]),
        boxesFr: inLang('fr', () => STYLES.map(s => [fv(true, bool(s)), fv(false, bool(s))])),
        boxesEn: inLang('en', () => STYLES.map(s => [fv(true, bool(s)), fv(false, bool(s))])),
        unknown: inLang('fr', () => [fv(true, bool('zzz')), fv(false, { type: 'bool' })]),
        data: inLang('fr', () => [fv(true, bool('classic'), 'Actif', { rawNumbers: true }), fv(false, null, 'Actif', { rawNumbers: true }), fv(true, null, 'Actif', { keepZero: true }), fv(false, bool('accentStrike'), 'Actif', { keepZero: true })]),
        listBoxes: fv([true, false, true], bool('classic')),
        listWords: inLang('fr', () => fv([true, false], null)),
        others: [fv(null, bool('classic')), fv('', bool('classic')), fv('abc', bool('classic'), 'Nom')],
      };
      const expected = {
        fr: ['vrai', 'faux', 'vrai', 'faux', 'vrai', 'vrai'],
        en: ['true', 'false', 'true', 'false'],
        boxesFr: STYLES.map(() => [CHECKED, UNCHECKED]),
        boxesEn: STYLES.map(() => [CHECKED, UNCHECKED]),
        unknown: ['vrai', 'faux'],
        data: ['true', 'false', 'true', 'false'],
        listBoxes: CHECKED + ', ' + UNCHECKED + ', ' + CHECKED,
        listWords: 'vrai, faux',
        others: ['', '', 'abc'],
      };
      const wrong = Object.keys(expected).filter(k => JSON.stringify(got[k]) !== JSON.stringify(expected[k]));
      // Le modèle du format : le style en cours d'une bulle, et la couleur de chaque case (la couleur posée en ligne est celle que lisent les exports).
      const styleOf = f => VariableFormat.boolStyle(f);
      const styles = [styleOf(null), styleOf({}), styleOf({ type: 'bool' }), styleOf(bool('classic')), styleOf(bool('accentStrike')), styleOf(bool('accentPlain')), styleOf(bool('zzz')), styleOf({ type: 'date' }), styleOf({ type: 'number', style: 'fr' })];
      const colors = STYLES.map(s => [VariableFormat.checkboxColor(true, s), VariableFormat.checkboxColor(false, s)]);
      const expectedColors = [['#2f6fed', '#767676'], ['#222222', '#6b7684'], ['#2f6fed', '#767676']];
      const lowContrast = colors.flat().filter(c => contrastOnWhite(c) < 4.5);
      const checks = {
        values: wrong.length === 0,
        styles: JSON.stringify(styles) === JSON.stringify(['text', 'text', 'text', 'classic', 'accentStrike', 'accentPlain', 'text', 'text', 'text']),
        sameThreeStylesAsTheChecklist: JSON.stringify(VariableFormat.BOOL_CHECKBOX_STYLES) === JSON.stringify(STYLES) && STYLES.every(s => VariableFormat.isCheckboxStyle(s)) && !VariableFormat.isCheckboxStyle('text'),
        colors: JSON.stringify(colors) === JSON.stringify(expectedColors),
        contrast: lowContrast.length === 0,
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, wrong: wrong.map(k => [k, got[k], expected[k]]), styles, colors, lowContrast }) };
    },
  });

  // --- La barre flottante ---
  cases.push({
    id: 'varbool_toolbar_offers_the_three_checklist_boxes_and_vrai_faux_for_a_yes_no_bubble_only',
    description: 'La bulle d’une colonne Oui / Non ouvre un panneau « Oui / Non » (et lui seul : une colonne nombre, date ou texte garde le sien) : trois cases aux icônes de la liste à cases puis « vrai / faux », ce dernier enfoncé tant que rien n’est réglé ; un clic pose { type: "bool", style }, sauvegardé dans le modèle et retrouvé à la réouverture, « vrai / faux » retire le réglage (plus de data-format) ; la barre reste ouverte quand le focus quitte l’éditeur ; libellés et infobulles suivent la langue',
    run: async (h) => {
      await h.resetEditor();
      window.__gristStub.setVariables(PAGE, { Nom: 'Text', Actif: 'Bool', Montant: 'Numeric', Naissance: 'Date' });
      await GristAPI.refreshSchema();
      const html = `<p>${badge('Actif')} ${badge('Nom')} ${badge('Montant')} ${badge('Naissance')}</p>`;
      Editor.setHTML(html);
      const ed = EditorCore.getEditor();
      const badgeNode = column => { let found = null; ed.state.doc.descendants(n => { if (n.type.name === 'varBadge' && n.attrs.column === column) found = n; }); return found; };
      const select = async column => {
        document.querySelector('.tiptap').focus();
        let pos = -1;
        ed.state.doc.descendants((node, p) => { if (node.type.name === 'varBadge' && node.attrs.column === column) pos = p; });
        ed.commands.setNodeSelection(pos);
        await h.sleep(150);
      };
      const panel = document.querySelector('.v2-varfmt-toolbar');
      const panels = () => ['bool', 'number', 'date'].map(k => !panel.querySelector(`[data-var-panel="${k}"]`).hidden);
      const buttons = () => Array.from(panel.querySelectorAll('[data-var-panel="bool"] button'));
      const state = () => buttons().map(b => [b.getAttribute('data-action').slice(11), b.getAttribute('aria-pressed'), b.classList.contains('is-active')]);
      const press = async style => { buttons().find(b => b.getAttribute('data-action') === 'bool-style:' + style).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); await h.sleep(80); };
      const formatOf = () => badgeNode('Actif').attrs.format;

      const visibility = {};
      for (const column of ['Actif', 'Nom', 'Montant', 'Naissance']) { await select(column); visibility[column] = panels(); }
      await select('Actif');
      const opened = { visible: panel.classList.contains('visible'), actions: buttons().map(b => b.getAttribute('data-action')), state: state(), labels: buttons().map(b => b.textContent.trim()), titles: buttons().map(b => b.title) };
      // Les icônes de la liste à cases (js/icons.js), au même dessin : le SVG de chaque bouton est celui que Icons.svg fabrique pour la liste.
      const icons = STYLES.map((s, i) => {
        const wanted = document.createElement('div');
        wanted.innerHTML = Icons.svg('checklist' + s.charAt(0).toUpperCase() + s.slice(1));
        const svg = buttons()[i].querySelector('svg');
        return !!svg && !!wanted.firstElementChild && svg.outerHTML === wanted.firstElementChild.outerHTML;
      });
      // Comme les autres réglages de la barre : le focus a quitté l'éditeur, le panneau doit survivre.
      ed.view.dom.blur();
      await h.sleep(30);
      await press('classic');
      const afterClassic = { format: formatOf(), state: state(), visible: panel.classList.contains('visible') };
      const box = document.createElement('div');
      box.innerHTML = Editor.getHTML();
      const serialized = box.querySelector('span.var-badge[data-column="Actif"]').getAttribute('data-format');
      Editor.setHTML(Editor.getHTML());
      const roundTrip = formatOf();
      await select('Actif');
      const afterReload = state();
      await press('accentStrike');
      const afterStrike = { format: formatOf(), state: state() };
      await press('accentPlain');
      const afterPlain = { format: formatOf(), state: state() };
      // Le réglage d'une colonne qui a changé de type (nombre -> Oui / Non) ne reste pas : le style remplace tout le format.
      Editor.setHTML(`<p>${badge('Actif', { type: 'number', style: 'us', decimals: 2 })}</p>`);
      await select('Actif');
      await press('classic');
      const replaced = formatOf();
      await press('text');
      const backToWords = { format: formatOf(), state: state() };
      const bare = document.createElement('div');
      bare.innerHTML = Editor.getHTML();
      const stillSerialized = bare.querySelector('span.var-badge').hasAttribute('data-format');
      // Un modèle enregistré avec une case : la barre la montre enfoncée.
      Editor.setHTML(`<p>${badge('Actif', bool('accentPlain'))}</p>`);
      await select('Actif');
      const legacy = state();
      // Langue : libellé du bouton « vrai / faux » et infobulles, relus à chaque ouverture.
      const en = await inLangAsync('en', async () => { await select('Actif'); return { label: buttons()[3].textContent.trim(), titles: buttons().map(b => b.title), aria: buttons().map(b => b.getAttribute('aria-label')) }; });
      await select('Actif');
      const frAgain = { label: buttons()[3].textContent.trim(), title: buttons()[3].title };
      const checks = {
        onlyTheBoolPanelForAYesNoColumn: JSON.stringify(visibility) === JSON.stringify({ Actif: [true, false, false], Nom: [false, false, false], Montant: [false, true, false], Naissance: [false, false, true] }),
        fourButtonsInOrder: opened.visible && JSON.stringify(opened.actions) === JSON.stringify(['bool-style:accentStrike', 'bool-style:classic', 'bool-style:accentPlain', 'bool-style:text']),
        checklistIcons: icons.every(Boolean),
        wordsPressedByDefault: JSON.stringify(opened.state) === JSON.stringify([['accentStrike', 'false', false], ['classic', 'false', false], ['accentPlain', 'false', false], ['text', 'true', true]]),
        labelsFr: opened.labels[3] === 'vrai / faux' && opened.titles[3] === 'Écrire vrai ou faux' && opened.titles[1] === 'Case à cocher (classique)' && opened.titles[2] === 'Case à cocher (accent, texte normal)' && opened.titles[0] === 'Case à cocher (accent, texte barré dans une liste)',
        classicSet: JSON.stringify(afterClassic.format) === JSON.stringify({ type: 'bool', style: 'classic' }) && afterClassic.visible && JSON.stringify(afterClassic.state.map(s => s[1])) === JSON.stringify(['false', 'true', 'false', 'false']),
        savedInTheTemplate: !!serialized && JSON.stringify(JSON.parse(serialized)) === JSON.stringify({ type: 'bool', style: 'classic' }),
        reopened: JSON.stringify(roundTrip) === JSON.stringify({ type: 'bool', style: 'classic' }) && afterReload[1][1] === 'true',
        strikeAndPlain: afterStrike.format.style === 'accentStrike' && afterStrike.state[0][1] === 'true' && afterPlain.format.style === 'accentPlain' && afterPlain.state[2][1] === 'true',
        styleReplacesTheWholeFormat: JSON.stringify(replaced) === JSON.stringify({ type: 'bool', style: 'classic' }),
        wordsRemoveTheSetting: backToWords.format === null && !stillSerialized && backToWords.state[3][1] === 'true',
        savedBoxShownPressed: legacy[2][1] === 'true' && legacy[3][1] === 'false',
        english: en.label === 'true / false' && en.titles[3] === 'Write true or false' && en.titles[1] === 'Checkbox (classic)' && en.titles[2] === 'Checkbox (accent, plain text)' && en.titles[0] === 'Checkbox (accent, text struck through in a list)' && en.aria[3] === en.titles[3],
        backToFrench: frAgain.label === 'vrai / faux' && frAgain.title === 'Écrire vrai ou faux',
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, visibility, opened, afterClassic, serialized, roundTrip, afterStrike, afterPlain, replaced, backToWords, legacy, en, frAgain }) };
    },
  });

  // --- La Lecture : une vraie case, de la taille de celle de la liste ---
  cases.push({
    id: 'varbool_reading_mode_draws_a_real_box_the_size_of_the_checklist_one_and_keeps_the_line_height',
    description: 'En Lecture, une bulle réglée sur un style de case écrit une vraie case (`.resolved-checkbox`, nom accessible « Coché » / « Décoché », couleur en ligne) qui garde le caractère ☑ / ☐ hors de sa boîte et fait la taille de la case d’un item de liste, sans agrandir la ligne ; « vrai / faux » et l’absence de réglage restent du texte ; en anglais « true » / « false » et « Checked » / « Unchecked »',
    run: async (h) => {
      await seed(h);
      const row = style => `<p>${badge('Actif', bool(style))} Actif · ${badge('Paye', bool(style))} Payé</p>`;
      const list = '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked><span></span></label><div><p>Liste</p></div></li></ul>';
      const html = STYLES.map(row).join('') + row('text') + row(null) + '<p>Sans variable</p>' + list;
      const reader = await renderReader(html);
      const content = reader.querySelector('.reader-content');
      const paragraphs = Array.from(content.children).filter(c => c.tagName === 'P');
      const rows = paragraphs.slice(0, 5);
      const got = rows.map(p => ({ boxes: Array.from(p.querySelectorAll('.resolved-checkbox')).map(b => [b.getAttribute('data-checked'), b.getAttribute('data-checkbox-style'), getComputedStyle(b).color, b.getAttribute('role'), b.getAttribute('aria-label'), b.textContent]), text: p.textContent }));
      const accent = [rgb('#2f6fed'), rgb('#767676')];
      const classic = [rgb('#222222'), rgb('#6b7684')];
      const expectBoxes = (style, colors) => [['true', style, colors[0], 'img', 'Coché', CHECKED], ['false', style, colors[1], 'img', 'Décoché', UNCHECKED]];
      const box = content.querySelector('.resolved-checkbox');
      const input = content.querySelector('ul[data-type="taskList"] input');
      const boxRect = box.getBoundingClientRect();
      const inputRect = input.getBoundingClientRect();
      const glyph = document.createRange();
      glyph.selectNodeContents(box);
      const glyphRect = glyph.getBoundingClientRect(); // avant le rendu anglais ci-dessous, qui remplace la Lecture
      const overflowKept = getComputedStyle(box).overflow === 'hidden';
      const heights = paragraphs.slice(0, 6).map(p => Math.round(p.getBoundingClientRect().height * 100) / 100);
      const paragraphRect = paragraphs[0].getBoundingClientRect();
      const english = await inLangAsync('en', async () => {
        const r = await renderReader(row('classic') + row(null));
        const c = r.querySelector('.reader-content');
        return { labels: Array.from(c.querySelectorAll('.resolved-checkbox')).map(b => b.getAttribute('aria-label')), words: Array.from(c.children).pop().textContent };
      });
      const checks = {
        accentStrike: JSON.stringify(got[0].boxes) === JSON.stringify(expectBoxes('accentStrike', accent)) && got[0].text === CHECKED + ' Actif · ' + UNCHECKED + ' Payé',
        classic: JSON.stringify(got[1].boxes) === JSON.stringify(expectBoxes('classic', classic)),
        accentPlain: JSON.stringify(got[2].boxes) === JSON.stringify(expectBoxes('accentPlain', accent)),
        wordsStayText: got[3].boxes.length === 0 && got[3].text === 'vrai Actif · faux Payé',
        noSettingStaysWords: got[4].boxes.length === 0 && got[4].text === 'vrai Actif · faux Payé',
        // Une case carrée, de la taille de celle de la liste (15 px pour un texte de 14 px) ; son caractère est poussé hors de sa boîte, il ne se voit pas.
        square: Math.abs(boxRect.width - boxRect.height) < 0.5 && Math.abs(boxRect.width - inputRect.width) <= 1,
        glyphHidden: glyphRect.width > 0 && glyphRect.left >= boxRect.right - 0.5 && overflowKept,
        lineHeightKept: heights.every(v => Math.abs(v - heights[5]) < 0.5) && boxRect.top >= paragraphRect.top - 0.5 && boxRect.bottom <= paragraphRect.bottom + 0.5,
        english: JSON.stringify(english.labels) === JSON.stringify(['Checked', 'Unchecked']) && english.words === 'true Actif · false Payé',
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, got, boxRect: [boxRect.width, boxRect.height], inputRect: [inputRect.width, inputRect.height], heights, english }) };
    },
  });

  // --- « accent, texte barré » : la case seule ---
  cases.push({
    id: 'varbool_accent_strike_box_is_the_box_alone_the_text_after_it_is_never_struck',
    description: 'Le style « accent, texte barré » d’une variable Oui / Non dessine la même case que « accent, texte normal » et ne barre rien (réponse d’Antoine du 01/10 : « Non, la case seule ») : le texte qui suit une case cochée, sur la même ligne, ne reçoit ni barré ni couleur, en Lecture comme dans le HTML des exports ; le barré n’existe que dans la liste à cases',
    run: async (h) => {
      await seed(h);
      const html = [
        `<p>${badge('Actif', bool('accentStrike'))} un <strong>deux</strong><br>trois</p>`,
        `<p>${badge('Actif', bool('accentStrike'))} quatre ${badge('Paye', bool('accentStrike'))} cinq</p>`,
        `<p>${badge('Actif', bool('accentPlain'))} quatre ${badge('Paye', bool('accentPlain'))} cinq</p>`,
        `<p>${badge('Actif', bool('classic'))} six</p>`,
        `<p>${badge('Actif', bool('accentStrike'))} <span style="color: rgb(200, 0, 0)">neuf</span> dix</p>`,
      ].join('');
      const reader = await renderReader(html);
      const ps = Array.from(reader.querySelectorAll('.reader-content > p'));
      const lineThrough = el => getComputedStyle(el).textDecorationLine.indexOf('line-through') !== -1;
      const anyStruck = root => !!root.querySelector('.resolved-struck, [style*="line-through"]') || Array.from(root.querySelectorAll('*')).some(lineThrough);
      const exported = await previewBox(html);
      const sameBox = (a, b) => ['data-checked', 'aria-label', 'role', 'style'].every(k => a.getAttribute(k) === b.getAttribute(k)) && a.textContent === b.textContent;
      const strike = ps[1] ? ps[1].querySelectorAll('.resolved-checkbox') : [];
      const plain = ps[2] ? ps[2].querySelectorAll('.resolved-checkbox') : [];
      const red = ps[4] ? Array.from(ps[4].querySelectorAll('span')).find(e => e.textContent.trim() === 'neuf') : null;
      const checks = {
        fivePlainParagraphs: ps.length === 5,
        nothingIsStruck: ps.length === 5 && ps.every(p => !anyStruck(p)),
        exportsStayPlain: !/line-through|resolved-struck/.test(exported.innerHTML),
        onlyBoxesCarryInlineStyle: ps.slice(0, 4).every(p => Array.from(p.querySelectorAll('[style]')).every(e => e.classList.contains('resolved-checkbox'))),
        sameBoxAsAccentPlain: strike.length === 2 && plain.length === 2 && sameBox(strike[0], plain[0]) && sameBox(strike[1], plain[1])
          && strike[0].getAttribute('data-checkbox-style') === 'accentStrike' && plain[0].getAttribute('data-checkbox-style') === 'accentPlain',
        checkedAndUncheckedStillDrawn: JSON.stringify(checkedOf(ps[1] || document.createElement('p'))) === JSON.stringify(['true', 'false']),
        ownColourKept: !!red && getComputedStyle(red).color === 'rgb(200, 0, 0)' && !lineThrough(red),
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, paragraphs: ps.map(p => p.innerHTML.slice(0, 160)) }) };
    },
  });

  // --- Boucles, tableau et en-tête ---
  cases.push({
    id: 'varbool_boxes_in_a_row_loop_in_the_sentence_loop_and_in_the_header',
    description: 'La case se pose partout où la bulle écrit : une colonne Oui / Non d’une boucle sur les lignes d’un tableau (une case par ligne, dans l’ordre), une boucle dans la phrase (« ☑, ☐ et ☑ », une case par valeur et les séparateurs en texte), l’en-tête de page ; sans réglage la boucle écrit « vrai, faux et vrai »',
    run: async (h) => {
      await seed(h);
      const rowLoop = { repeat: 'row', table: LINES, empty: 'header' };
      const inlineLoop = { repeat: 'inline', table: LINES, empty: 'text', emptyText: 'aucune', separator: ', ', lastSeparator: ' et ' };
      const cell = content => `<td><p>${content}</p></td>`;
      const table = '<table><tbody>'
        + '<tr><th><p>Pièce</p></th><th><p>Livrée</p></th></tr>'
        + `<tr>${cell(badge('Libelle', null, LINES, rowLoop))}${cell(badge('Livre', bool('classic'), LINES))}</tr>`
        + '</tbody></table>';
      const html = table + `<p>Livré : ${badge('Livre', bool('accentPlain'), LINES, inlineLoop)}.</p><p>Mots : ${badge('Livre', null, LINES, inlineLoop)}.</p>`;
      const reader = await renderReader(html);
      const content = reader.querySelector('.reader-content');
      const tableRows = Array.from(content.querySelectorAll('table tr')).slice(1);
      const perRow = tableRows.map(tr => [tr.cells[0].textContent.trim(), checkedOf(tr.cells[1])]);
      const paragraphs = Array.from(content.children).filter(c => c.tagName === 'P');
      const sentence = paragraphs[0];
      const words = paragraphs[1];
      // L'en-tête : la case y est dessinée comme dans le corps (js/reader-mode.js:resolveHeaderFooterZone). La Lecture ne pose l'en-tête et le pied que sur une feuille A4 (`a4-preview`).
      reader.classList.add('a4-preview');
      const withHeader = await renderReader('<p>Corps</p>', { enabled: true, differentFirstPage: false, header: { default: `<p>En-tête ${badge('Actif', bool('accentStrike'))}</p>`, first: '' }, footer: { default: `<p>Pied ${badge('Paye', bool('classic'))}</p>`, first: '' } });
      const headerBoxes = Array.from(withHeader.querySelectorAll('.v2-page-edge-top .resolved-checkbox, .v2-page-edge-bottom .resolved-checkbox')).map(b => [b.getAttribute('data-checked'), b.getAttribute('data-checkbox-style')]);
      reader.classList.remove('a4-preview');
      const checks = {
        oneBoxPerRow: JSON.stringify(perRow) === JSON.stringify([['Livret', ['true']], ['Affiche', ['false']], ['Badge', ['true']]]),
        boxesInTheSentence: JSON.stringify(checkedOf(sentence)) === JSON.stringify(['true', 'false', 'true']) && sentence.textContent === 'Livré : ' + CHECKED + ', ' + UNCHECKED + ' et ' + CHECKED + '.',
        separatorsStayText: Array.from(sentence.querySelectorAll('.resolved-var')).every(s => !s.querySelector('.resolved-checkbox') || s.querySelectorAll('.resolved-checkbox').length === 3),
        wordsWithoutSetting: words.textContent === 'Mots : vrai, faux et vrai.' && words.querySelectorAll('.resolved-checkbox').length === 0,
        header: headerBoxes.some(b => b[0] === 'true' && b[1] === 'accentStrike') && headerBoxes.some(b => b[0] === 'false' && b[1] === 'classic'),
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, perRow, sentence: sentence.textContent, words: words.textContent, headerBoxes }) };
    },
  });

  // --- PDF ---
  cases.push({
    id: 'varbool_pdf_paints_the_boxes_in_their_own_font_without_shifting_the_paragraph',
    description: 'Le PDF écrit les cases dans deux polices à elles (js/pdf-fonts-boxes.js : accent et classique, les quatre graisses sur le même fichier) car celles du PDF n’ont pas ☑ / ☐ : les caractères sont peints (pdf.js), de la largeur d’un caractère, dans la couleur de la case ; un paragraphe qui commence par une case n’est pas décalé (le caractère poussé hors de la case ne compte pas dans le retrait) ; le texte qui suit une case cochée « accent, texte barré » n’est pas barré, « vrai » et « faux » restent du texte',
    run: async (h) => {
      await seed(h);
      const row = (style, extra) => `<p>${badge('Actif', bool(style))} ${extra || 'Actif'} ${badge('Paye', bool(style))} Payé</p>`;
      const html = '<p>Titre</p>' + STYLES.map(s => row(s)).join('') + row('text');
      const r = await h.exportPdfContent(html, null, null, { tableId: PAGE, record: Object.assign({}, RECORD) });
      // Les quatre paragraphes de variables (trois styles de case, puis les mots), dans l'ordre du modèle.
      const blocks = r.content.filter(b => b && Array.isArray(b.text) && JSON.stringify(b.text).indexOf('Actif') !== -1);
      const runsOf = b => b.text.filter(t => t && typeof t === 'object');
      const boxRuns = blocks.flatMap(runsOf).filter(t => t.font === 'PPBoxAccent' || t.font === 'PPBoxClassic');
      const fontsDefined = ['PPBoxAccent', 'PPBoxClassic'].map(name => { const f = pdfMake.fonts[name]; return !!f && f.normal === f.bold && f.normal === f.italics && f.normal === f.bolditalics && !!pdfMake.vfs[f.normal]; });
      const gt = await h.extractPdfGroundTruth(r.base64);
      const items = gt.pages[0].textItems;
      const painted = items.filter(i => i.str === CHECKED || i.str === UNCHECKED);
      const title = items.find(i => i.str === 'Titre');
      const firstBox = painted[0];
      const struckRun = blocks.flatMap(runsOf).find(t => /Actif/.test(t.text) && Array.isArray(t.decoration) && t.decoration.indexOf('lineThrough') !== -1);
      const checks = {
        fontsRegistered: fontsDefined.every(Boolean),
        fontByStyle: boxRuns.length === 6 && boxRuns.slice(0, 2).every(t => t.font === 'PPBoxAccent') && boxRuns.slice(2, 4).every(t => t.font === 'PPBoxClassic') && boxRuns.slice(4, 6).every(t => t.font === 'PPBoxAccent'),
        glyphsAndColours: JSON.stringify(boxRuns.map(t => [t.text, String(t.color).toLowerCase()])) === JSON.stringify([[CHECKED, '#2f6fed'], [UNCHECKED, '#767676'], [CHECKED, '#222222'], [UNCHECKED, '#6b7684'], [CHECKED, '#2f6fed'], [UNCHECKED, '#767676']]),
        paintedInThePdf: painted.length === 6 && painted.every(i => i.width > 5 && i.width < 14),
        notShifted: blocks.length === 4 && !!title && !!firstBox && Math.abs(firstBox.x - title.x) <= 1.5 && blocks.every(b => !b.margin || b.margin[0] === 0),
        noStrikeAfterTheCheckedBox: !struckRun,
        wordsStayText: items.some(i => i.str === 'vrai') && items.some(i => i.str === 'faux'),
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, fontsDefined, boxRuns, painted, title: title && [title.x, title.y], firstBox: firstBox && [firstBox.x, firstBox.width], blocks: blocks.length, margins: blocks.map(b => b.margin) }) };
    },
  });

  // --- Word, Excel, e-mail ---
  async function docxRuns(html) {
    await ExportCommon.ensureJsZipLoaded();
    await DocxExport.ensureDocxLibLoaded();
    const { blob } = await DocxExport.getDocxBlobForRecord(html, PAGE, Object.assign({}, RECORD), '', null, null);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    return window.TestHelpers.docxParagraphs(new DOMParser().parseFromString(await zip.file('word/document.xml').async('string'), 'application/xml'));
  }
  const td = html => `<td colwidth="120"><p>${html}</p></td>`;
  async function xlsxCells(html) {
    const { blob } = await XlsxExport.getXlsxBlobForRecord(html, PAGE, Object.assign({}, RECORD), '', undefined);
    const workbook = new window.ExcelJS.Workbook();
    await workbook.xlsx.load(await blob.arrayBuffer());
    const sheet = workbook.worksheets[0];
    const read = ref => { const c = sheet.getCell(ref); const text = c.value && typeof c.value === 'object' && c.value.richText ? c.value.richText.map(r => r.text).join('') : c.value; return { text, font: c.font || null, runs: c.value && c.value.richText ? c.value.richText : null }; };
    return { read };
  }
  cases.push({
    id: 'varbool_word_excel_and_email_carry_the_boxes',
    description: 'Word : la case est un caractère ☑ / ☐ dans la police des symboles et sa couleur (« accent, texte barré » ne barre pas le texte qui suit) ; Excel : la case d’une cellule est ☑ / ☐, police des symboles et couleur de la case ; e-mail : « [x] » / « [ ] » ; « vrai » et « faux » restent du texte dans les trois',
    run: async (h) => {
      await seed(h);
      const html = [
        `<p>${badge('Actif', bool('accentStrike'))} un<br>deux</p>`,
        `<p>${badge('Actif', bool('classic'))} six ${badge('Paye', bool('classic'))} sept</p>`,
        `<p>${badge('Paye')} huit</p>`,
      ].join('');
      const paragraphs = await docxRuns(html);
      const runs = paragraphs.flatMap(p => p.runs);
      const symbol = runs.filter(r => r.text === CHECKED || r.text === UNCHECKED);
      const run = text => runs.find(r => r.text.trim() === text) || {};
      const grid = '<table><tbody>'
        + `<tr>${td(badge('Actif', bool('accentStrike')))}${td(badge('Paye', bool('accentStrike')))}</tr>`
        + `<tr>${td(badge('Actif', bool('classic')))}${td(badge('Paye'))}</tr>`
        + '</tbody></table>';
      const cells = await xlsxCells(grid);
      const a1 = cells.read('A1'); const b1 = cells.read('B1'); const a2 = cells.read('A2'); const b2 = cells.read('B2');
      const mail = MailtoExport.plainTextFromHtml(await ReaderMode.preview(`<p>${badge('Actif', bool('classic'))} ok ${badge('Paye', bool('classic'))} non</p><p>${badge('Actif')} libre</p>`, PAGE, Object.assign({}, RECORD)));
      const argb = c => (c && c.font && c.font.color ? String(c.font.color.argb).toUpperCase() : null);
      const checks = {
        wordSymbols: symbol.length === 3 && symbol.every(r => r.font === 'Segoe UI Symbol' && !r.strike),
        wordColours: JSON.stringify(symbol.map(r => String(r.color).toUpperCase())) === JSON.stringify(['2F6FED', '222222', '6B7684']),
        wordNoStrike: !run('un').strike && !run('deux').strike && String(run('un').color || '').toUpperCase() !== '667085',
        wordWords: run('huit').font !== 'Segoe UI Symbol' && paragraphs.some(p => /faux/.test(p.text)),
        excelBoxes: a1.text === CHECKED && b1.text === UNCHECKED && a2.text === CHECKED && b2.text === 'faux',
        excelFont: !!a1.font && a1.font.name === 'Segoe UI Symbol' && argb(a1) === 'FF2F6FED' && argb(b1) === 'FF767676' && argb(a2) === 'FF222222' && !!b2.font && b2.font.name !== 'Segoe UI Symbol',
        email: mail.indexOf('[x] ok [ ] non') !== -1 && mail.indexOf('vrai libre') !== -1,
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, symbol, un: run('un'), deux: run('deux'), a1, b1, a2, b2: b2.text, mail }) };
    },
  });

  // --- Ce qui ne change pas ---
  cases.push({
    id: 'varbool_text_fields_and_linked_attributes_keep_true_false',
    description: 'Le nom du fichier, l’objet et les destinataires d’un e-mail écrivent toujours « true » / « false » (dans les deux langues, même sur une bulle réglée sur une case) : un nom de fichier ne change pas d’écriture ; la fenêtre « Autres attributs » montre la donnée',
    run: async (h) => {
      await seed(h);
      const filename = await ReaderMode.resolveFilename(`Dossier_#${PAGE}.Actif_#${PAGE}.Paye`, PAGE, Object.assign({}, RECORD));
      const subject = await Variables.resolveTextVariables(`Actif #${PAGE}.Actif / #${PAGE}.Paye`, PAGE, Object.assign({}, RECORD));
      const english = await inLangAsync('en', async () => ({ filename: await ReaderMode.resolveFilename(`#${PAGE}.Actif`, PAGE, Object.assign({}, RECORD)), subject: await Variables.resolveTextVariables(`#${PAGE}.Paye`, PAGE, Object.assign({}, RECORD)) }));
      // « Autres attributs » : la valeur de la colonne Livré de la ligne liée.
      Editor.setHTML(`<p>${badge('Libelle', null, LINES)}</p>`);
      const ed = EditorCore.getEditor();
      document.querySelector('.tiptap').focus();
      let pos = -1;
      ed.state.doc.descendants((node, p) => { if (node.type.name === 'varBadge') pos = p; });
      ed.commands.setNodeSelection(pos);
      await h.sleep(150);
      document.querySelector('.v2-varfmt-toolbar button[data-action="var-linked"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      await h.sleep(400);
      const modal = document.getElementById('var-linked-modal');
      const row = modal && modal.querySelector('.var-linked-row[data-col="Livre"] .var-linked-value');
      const listed = row ? row.textContent : null;
      if (modal) modal.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await h.sleep(100);
      const checks = {
        filename: filename === 'Dossier_true_false',
        subject: subject === 'Actif true / false',
        english: english.filename === 'true' && english.subject === 'false',
        linkedAttributes: listed === 'true, false, true',
      };
      const failed = failedOf(checks);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed, filename, subject, english, listed }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.varBool = cases;
})();
