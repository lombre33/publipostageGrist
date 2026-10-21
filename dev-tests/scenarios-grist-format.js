// Suite "gristFormat" - le bouton « Comme dans Grist » (pipette) de la barre d'une bulle nombre ou date, et la case « % » (js/floating-toolbars.js, js/variable-format.js, js/grist-api.js).
// Étude « angles morts des tests », sujet « Bouton « Comme dans Grist » » (choix d'Antoine du 21/10) : sans réglage, une bulle écrit 0,0004 « 0 » et 1234,5678 « 1 234,568 » quand la
// colonne Grist montre « 1234,5678 » ; le bouton lit le format d'affichage de la colonne (widgetOptions : numMode, decimals, maxDecimals, currency, dateFormat, timeFormat) et la devise du
// document (_grist_DocInfo.documentSettings), et pose le réglage de bulle qui écrit pareil. Les textes que Grist écrit, eux, sont mesurés dans un vrai Grist (dev-tests/unit-grist-format.mjs
// les rejoue sans navigateur) ; ici, la barre : ce qu'elle affiche, ce qu'un clic pose, ce qu'elle refuse et dit pourquoi.
(function () {
  const cases = [];
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  const TABLE = 'GfFact';
  const sec = (y, m, d, h = 0, mi = 0) => Date.UTC(y, m - 1, d, h, mi) / 1000;
  const COLUMNS = {
    Nom: 'Text', Montant: 'Numeric', Taux: 'Numeric', Brut: 'Numeric', Entier: 'Int', Sci: 'Numeric', Parentheses: 'Numeric', SansDevise: 'Numeric',
    Jour: 'Date', JourUs: 'Date', JourLettres: 'Date', JourInconnu: 'Date', Rdv: 'DateTime:Europe/Paris', RdvInconnu: 'DateTime:Europe/Paris', Libre: 'Text',
    RdvDouze: 'DateTime:Europe/Paris', RdvMinuscules: 'DateTime:Europe/Paris', RdvDouzeUs: 'DateTime:Europe/Paris',
  };
  const FORMATS = {
    Montant: { numMode: 'currency', currency: 'EUR', decimals: 2 },
    Taux: { numMode: 'percent', decimals: 1 },
    Entier: { numMode: 'decimal' },
    Sci: { numMode: 'scientific' },
    Parentheses: { numMode: 'decimal', numSign: 'parens', decimals: 2 },
    SansDevise: { numMode: 'currency' },
    Jour: { dateFormat: 'DD/MM/YYYY' },
    JourUs: { dateFormat: 'MM/DD/YYYY' },
    JourLettres: { dateFormat: 'D MMMM YYYY' },
    JourInconnu: { dateFormat: 'dddd [le] D' },
    Rdv: { dateFormat: 'DD/MM/YYYY', timeFormat: 'HH:mm' },
    RdvInconnu: { dateFormat: 'DD/MM/YYYY', timeFormat: 'LT' },
    // À 12 heures : « h:mm A » (11:30 PM) est le texte de la bulle, « h:mma » (11:30pm, le départ de Grist) un texte voisin ; la date « MM/DD/YYYY » est celle d'une interface anglaise.
    RdvDouze: { dateFormat: 'DD/MM/YYYY', timeFormat: 'h:mm A' },
    RdvMinuscules: { dateFormat: 'DD/MM/YYYY', timeFormat: 'h:mma' },
    RdvDouzeUs: { dateFormat: 'MM/DD/YYYY', timeFormat: 'h:mm A' },
  };
  const ROW = { id: 1, Nom: 'Dupont', Montant: 1234.5, Taux: 0.256, Brut: 1234.5678, Entier: 1234, Sci: 1234, Parentheses: -7.125, SansDevise: 12.5, Jour: sec(2026, 9, 12), JourUs: sec(2026, 9, 12), JourLettres: sec(2026, 9, 12),
    JourInconnu: sec(2026, 9, 12), Rdv: sec(2026, 9, 12, 21, 30), RdvInconnu: sec(2026, 9, 12, 21, 30), RdvDouze: sec(2026, 9, 12, 21, 30), RdvMinuscules: sec(2026, 9, 12, 21, 30),
    RdvDouzeUs: sec(2026, 9, 12, 21, 30), Libre: 'texte' };
  const DATE_COLUMNS = ['Jour', 'JourUs', 'JourLettres', 'JourInconnu', 'Rdv', 'RdvInconnu', 'RdvDouze', 'RdvMinuscules', 'RdvDouzeUs'];
  // La ligne telle que grist.onRecord la livre : un objet Date pour chaque colonne Date et Date et heure.
  const asOnRecord = row => Object.assign({}, row, Object.fromEntries(DATE_COLUMNS.map(c => [c, new Date(row[c] * 1000)])));
  const inLang = async (lang, fn) => { const before = I18n.getLang(); I18n.setLang(lang); try { return await fn(); } finally { I18n.setLang(before); } };
  const NB = ' ';

  async function seed(h, settings) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables(TABLE, COLUMNS);
    stub.setColumnFormats(TABLE, FORMATS);
    stub.setDocumentSettings(settings === undefined ? { locale: 'fr-FR', currency: 'EUR' } : settings);
    stub.setRows(TABLE, [ROW]);
    await GristAPI.refreshSchema();
    stub.fireRecord(asOnRecord(ROW), TABLE);
    await h.sleep(60);
  }
  const attr = (name, value) => ` ${name}="${JSON.stringify(value).replace(/"/g, '&quot;')}"`;
  const badge = (column, format) => `<span class="var-badge" data-table="${TABLE}" data-column="${column}" data-key="${TABLE}.${column}"${format ? attr('data-format', format) : ''}></span>`;
  async function select(h, column, format) {
    Editor.setHTML('<p>' + badge(column, format) + '</p>');
    const ed = EditorCore.getEditor();
    document.querySelector('.tiptap').focus();
    let pos = -1;
    ed.state.doc.descendants((node, p) => { if (node.type.name === 'varBadge') pos = p; });
    ed.commands.setNodeSelection(pos);
    await h.sleep(150);
    return ed;
  }
  const bubble = ed => { let found = null; ed.state.doc.descendants(node => { if (node.type.name === 'varBadge') found = node; }); return found; };
  const formatOf = ed => bubble(ed).attrs.format;
  const panel = () => document.querySelector('.v2-varfmt-toolbar');
  const button = action => panel().querySelector(`button[data-action="${action}"]`);
  // Le panneau flottant réagit au mousedown (js/editor-core.js:createFloatingPanel), comme au vrai clic.
  const press = action => button(action).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  const setInput = (input, value) => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); };
  const setSelect = (select, value) => { select.value = value; select.dispatchEvent(new Event('input', { bubbles: true })); };
  const state = () => { const b = button('grist-format'); return { shown: !!b && !panel().querySelector('[data-var-panel="grist"]').hidden && b.getClientRects().length > 0, disabled: b.classList.contains('is-disabled'), aria: b.getAttribute('aria-disabled'), title: b.title, label: b.getAttribute('aria-label') }; };
  const textOf = (column, format) => Variables.formatValue(asOnRecord(ROW)[column], format, TABLE, column);
  const json = value => JSON.stringify(value);

  // --- 1) Un clic pose le format de la colonne, en une seule opération ---
  cases.push({
    id: 'gf_a_click_writes_the_grist_column_format_in_one_undo_step',
    description: 'Sur une colonne dont Grist règle l\'affichage (euro à deux décimales, pourcentage, nombre brut, entier à milliers, date en jj/mm/aaaa, date et heure en 24 h), un clic sur la pipette pose le réglage de bulle qui écrit comme la colonne ; le texte du document est celui de Grist (« 1 234,50 € », « 25,6 % », « 1234,5678 » là où la bulle sans réglage écrivait « 1 234,568 »), la barre reste ouverte, et un seul « Annuler » rend la bulle telle qu\'elle était',
    run: async (h) => {
      await seed(h);
      const expected = [
        ['Montant', { type: 'number', currency: '€', decimals: 2 }, `1${NB}234,50${NB}€`],
        ['Taux', { type: 'number', percent: true, decimals: 1 }, `25,6${NB}%`],
        ['Brut', { type: 'number', style: 'none', decimals: 0, maxDecimals: 10 }, '1234,5678'],
        ['Entier', { type: 'number', decimals: 0 }, `1${NB}234`],
        ['Jour', { type: 'date', preset: 'dmy_slash_full' }, '12/09/2026'],
        ['Rdv', { type: 'date', preset: 'dmy_slash_full', time: 'colon' }, '12/09/2026 23:30'],
      ];
      const bad = [];
      for (const [column, format, text] of expected) {
        const ed = await select(h, column);
        const before = state();
        if (!before.shown || before.disabled) { bad.push({ column, before }); continue; }
        const untouched = textOf(column, null);
        press('grist-format');
        await h.sleep(250);
        const after = formatOf(ed);
        if (json(Object.entries(after || {}).sort()) !== json(Object.entries(format).sort())) bad.push({ column, after, format });
        if (textOf(column, after) !== text) bad.push({ column, text: textOf(column, after), expected: text });
        if (column === 'Brut' && untouched === text) bad.push({ column, note: 'la bulle sans réglage écrivait déjà ce texte', untouched });
        if (!panel().classList.contains('visible')) bad.push({ column, note: 'la barre s\'est fermée' });
        ed.commands.undo();
        await h.sleep(80);
        if (formatOf(ed) !== null) bad.push({ column, undo: formatOf(ed) });
      }
      return { pass: bad.length === 0, notes: json(bad) };
    },
  });

  // --- 1 bis) Une colonne que Grist montre à 12 heures ---
  cases.push({
    id: 'gf_a_twelve_hour_grist_time_is_written_at_twelve_hours_and_only_h_mm_a_is_identical',
    description: 'Une colonne « Date et heure » que Grist montre à 12 heures : un clic pose « 11:30 PM » (réglage ampm, avec la date en chiffres de la colonne) au lieu de l\'approcher en 24 heures (« 23 h 30 ») ; l\'info-bulle ne dit « (approché) » que pour « h:mma » (« 11:30pm », le départ de Grist), pas pour « h:mm A » qui s\'écrit comme Grist ; en anglais la virgule entre la date en chiffres et l\'heure fait dire « (approximate) » même pour « h:mm A »',
    run: async (h) => {
      await seed(h);
      const bad = [];
      const twelve = { type: 'date', preset: 'dmy_slash_full', time: 'ampm' };
      for (const [column, title] of [['RdvDouze', 'Comme dans Grist : 12/09/2026 9:30 PM'], ['RdvMinuscules', 'Comme dans Grist : 12/09/2026 9:30 PM (approché)']]) {
        const ed = await select(h, column);
        const before = state();
        if (before.title !== title || before.label !== title || before.disabled) bad.push({ column, tooltip: before.title, expected: title });
        press('grist-format');
        await h.sleep(250);
        const after = formatOf(ed);
        if (json(Object.entries(after || {}).sort()) !== json(Object.entries(twelve).sort())) bad.push({ column, after });
        if (textOf(column, after) !== '12/09/2026 11:30 PM') bad.push({ column, text: textOf(column, after) });
        ed.commands.undo();
        await h.sleep(80);
      }
      const en = await inLang('en', async () => {
        const ed = await select(h, 'RdvDouzeUs');
        const tooltip = state().title;
        press('grist-format');
        await h.sleep(250);
        const format = formatOf(ed);
        return { tooltip, format, text: textOf('RdvDouzeUs', format) };
      });
      if (en.tooltip !== 'Like in Grist: 09/12/2026, 9:30 PM (approximate)' || json(Object.entries(en.format || {}).sort()) !== json(Object.entries(twelve).sort()) || en.text !== '09/12/2026, 11:30 PM') bad.push({ en });
      return { pass: bad.length === 0, notes: json(bad) };
    },
  });

  // --- 2) L'info-bulle dit ce que le bouton écrirait ---
  cases.push({
    id: 'gf_the_tooltip_previews_the_result_and_says_when_it_is_approximate',
    description: 'L\'info-bulle de la pipette (qui est aussi son nom accessible) dit ce que le clic écrirait pour une valeur d\'exemple - « Comme dans Grist : 1 234,57 € », « 25,7 % », « 12/09/2026 23:30 » - et « (approché) » quand le texte de Grist ne sera pas tout à fait le même (un mois en lettres, une heure à 12 h, des parenthèses de négatifs) ; une fois posé, le bouton est grisé et dit « Déjà écrit comme dans Grist »',
    run: async (h) => {
      await seed(h);
      const rows = [
        ['Montant', `Comme dans Grist : 1${NB}234,57${NB}€`], ['Taux', `Comme dans Grist : 25,7${NB}%`], ['Jour', 'Comme dans Grist : 12/09/2026'], ['Rdv', 'Comme dans Grist : 12/09/2026 21:30'],
        ['JourLettres', 'Comme dans Grist : 12 septembre 2026 (approché)'], ['Parentheses', `Comme dans Grist : 1${NB}234,568 (approché)`],
      ];
      const bad = [];
      for (const [column, title] of rows) {
        await select(h, column);
        const s = state();
        if (s.title !== title || s.label !== title || s.disabled) bad.push({ column, got: s, expected: title });
      }
      const ed = await select(h, 'Montant');
      press('grist-format');
      await h.sleep(250);
      const after = state();
      if (!after.disabled || after.aria !== 'true' || after.title !== 'Déjà écrit comme dans Grist') bad.push({ après: after });
      press('grist-format');
      await h.sleep(150);
      if (json(formatOf(ed)) !== json({ type: 'number', currency: '€', decimals: 2 })) bad.push({ cliqueGrisé: formatOf(ed) });
      const en = await inLang('en', async () => { await select(h, 'Jour'); return state().title; });
      if (en !== 'Date format “DD/MM/YYYY”: day and month are not in the order of the interface language, the date would read the wrong way round') bad.push({ en });
      return { pass: bad.length === 0, notes: json(bad) };
    },
  });

  // --- 3) Ce que le widget ne sait pas écrire est grisé, avec sa raison ---
  cases.push({
    id: 'gf_a_format_the_widget_cannot_write_is_greyed_with_its_reason',
    description: 'Le bouton n\'est jamais retiré : grisé (aria-disabled, info-bulle = la raison) pour une écriture scientifique, une date « mm/jj/aaaa » dans une interface française (09/12 se lirait 9 décembre), un format de date ou d\'heure inconnu, une devise dont le document ne dit pas le nom, et un calcul ; un clic sur lui ne pose rien',
    run: async (h) => {
      await seed(h, null);
      const rows = [
        ['Sci', 'Écriture scientifique (1,2E3) : une variable ne sait pas l’écrire'],
        ['JourUs', 'Format de date « MM/DD/YYYY » : le jour et le mois n’y sont pas dans l’ordre de la langue de l’interface, la date se lirait à l’envers'],
        ['JourInconnu', 'Format de date « dddd [le] D » : une variable ne sait pas l’écrire'],
        ['RdvInconnu', 'Format d’heure « LT » : une variable ne sait pas l’écrire'],
        ['SansDevise', 'La devise du document n’est pas lisible : saisissez-la dans la case Devise'],
      ];
      const bad = [];
      for (const [column, reason] of rows) {
        const ed = await select(h, column);
        const s = state();
        if (!s.shown || !s.disabled || s.aria !== 'true' || s.title !== reason || s.label !== reason) bad.push({ column, got: s, expected: reason });
        press('grist-format');
        await h.sleep(250);
        if (formatOf(ed) !== null) bad.push({ column, poséMalgréLeGris: formatOf(ed) });
      }
      // Un calcul n'a pas de colonne Grist : le bouton est là, grisé, avec cette raison.
      Editor.setHTML('<p><span class="calc-badge" data-formula="{GfFact.Montant}*2"></span></p>');
      const ed = EditorCore.getEditor();
      document.querySelector('.tiptap').focus();
      let pos = -1;
      ed.state.doc.descendants((node, p) => { if (node.type.name === 'calcBadge') pos = p; });
      ed.commands.setNodeSelection(pos);
      await h.sleep(150);
      const calc = state();
      if (!calc.shown || !calc.disabled || calc.title !== 'Disponible pour une variable, pas pour un calcul : un calcul n’a pas de colonne Grist') bad.push({ calcul: calc });
      return { pass: bad.length === 0, notes: json(bad) };
    },
  });

  // --- 4) La devise du document ---
  cases.push({
    id: 'gf_the_document_currency_comes_from_its_settings_unless_the_column_names_one',
    description: 'Une colonne « Monnaie » sans devise propre prend celle du document : la sienne (JPY), sinon celle de sa langue (fr-FR : euro, de-CH : franc suisse, aucune langue : dollar) ; la devise de la colonne l\'emporte ; réglages illisibles - le bouton se grise plutôt que de deviner, sauf si la colonne dit sa devise',
    run: async (h) => {
      const bad = [];
      const write = async (settings, column) => {
        await seed(h, settings);
        const ed = await select(h, column);
        if (state().disabled) return { refused: state().title };
        press('grist-format');
        await h.sleep(250);
        return { currency: formatOf(ed) && formatOf(ed).currency };
      };
      const cases = [
        [{ locale: 'fr-FR', currency: 'JPY' }, 'SansDevise', { currency: '¥' }],
        [{ locale: 'fr-FR' }, 'SansDevise', { currency: '€' }],
        [{ locale: 'de-CH' }, 'SansDevise', { currency: 'CHF' }],
        [{}, 'SansDevise', { currency: '$' }],
        [{ locale: 'fr-FR', currency: 'JPY' }, 'Montant', { currency: '€' }],
        [null, 'Montant', { currency: '€' }],
        [null, 'SansDevise', { refused: 'La devise du document n’est pas lisible : saisissez-la dans la case Devise' }],
      ];
      for (const [settings, column, expected] of cases) {
        const got = await write(settings, column);
        if (json(got) !== json(expected)) bad.push({ settings, column, got, expected });
      }
      return { pass: bad.length === 0, notes: json(bad) };
    },
  });

  // --- 5) Un clic relit la colonne dans Grist ---
  cases.push({
    id: 'gf_a_click_reads_the_column_again_so_a_change_made_in_grist_is_not_missed',
    description: 'Le format d\'une colonne change dans Grist sans que le schéma du widget soit relu : le clic relit les réglages et pose ce que Grist montre maintenant (un nombre brut devenu des dollars à une ou deux décimales), et si la colonne est devenue scientifique il ne pose rien, la barre se met à jour et le bouton se grise avec sa raison',
    run: async (h) => {
      await seed(h);
      const stub = window.__gristStub;
      const bad = [];
      let ed = await select(h, 'Brut');
      stub.setColumnFormats(TABLE, { Brut: { numMode: 'currency', currency: 'USD', decimals: 1 } });
      if (state().disabled) bad.push({ avant: state() });
      press('grist-format');
      await h.sleep(300);
      if (json(Object.entries(formatOf(ed) || {}).sort()) !== json(Object.entries({ type: 'number', currency: '$', decimals: 1, maxDecimals: 2 }).sort())) bad.push({ relu: formatOf(ed) });
      ed = await select(h, 'Taux');
      stub.setColumnFormats(TABLE, { Taux: { numMode: 'scientific' } });
      if (state().disabled) bad.push({ aviant: state() });
      press('grist-format');
      await h.sleep(300);
      const after = state();
      if (formatOf(ed) !== null) bad.push({ poséAlorsQuIlNeSaitPas: formatOf(ed) });
      if (!after.disabled || after.title !== 'Écriture scientifique (1,2E3) : une variable ne sait pas l’écrire') bad.push({ après: after });
      stub.setColumnFormats(TABLE, { Brut: null, Taux: FORMATS.Taux });
      await GristAPI.refreshSchema();
      return { pass: bad.length === 0, notes: json(bad) };
    },
  });

  // --- 6) La case « % » et les décimales « de x à y » ---
  cases.push({
    id: 'gf_percent_toggle_excludes_currency_and_words_and_decimals_show_a_range',
    description: 'La case « % » écrit la valeur fois cent suivie de « % » (0,256 : « 25,6 % ») ; elle s\'exclut avec la devise et « Lettres » (le dernier choix reste) ; la liste des décimales montre « 0 à 10 » quand « Comme dans Grist » a posé un intervalle, et choisir un nombre le remplace (plus de maxDecimals)',
    run: async (h) => {
      await seed(h);
      const bad = [];
      const ed = await select(h, 'Taux', { type: 'number', currency: '€', decimals: 1 });
      const pressed = () => button('num-percent').getAttribute('aria-pressed');
      if (pressed() !== 'false' || button('num-percent').classList.contains('is-active')) bad.push({ départ: pressed() });
      press('num-percent');
      await h.sleep(100);
      const percent = formatOf(ed);
      if (json(Object.entries(percent).sort()) !== json(Object.entries({ type: 'number', decimals: 1, percent: true }).sort()) || pressed() !== 'true' || !button('num-percent').classList.contains('is-active')) bad.push({ percent, pressed: pressed() });
      if (textOf('Taux', percent) !== `25,6${NB}%`) bad.push({ texte: textOf('Taux', percent) });
      setInput(panel().querySelector('input[data-role="num-currency"]'), '$');
      await h.sleep(100);
      const currency = formatOf(ed);
      if (currency.percent || currency.currency !== '$' || pressed() !== 'false') bad.push({ devise: currency });
      press('num-percent');
      await h.sleep(100);
      press('num-words');
      await h.sleep(100);
      const words = formatOf(ed);
      if (words.percent || words.currency || !words.words) bad.push({ lettres: words });
      press('num-percent');
      await h.sleep(100);
      const again = formatOf(ed);
      if (!again.percent || again.words) bad.push({ denouveau: again });
      press('num-percent');
      await h.sleep(100);
      if (formatOf(ed).percent) bad.push({ retiré: formatOf(ed) });
      // Les décimales « de x à y ».
      await select(h, 'Brut');
      press('grist-format');
      await h.sleep(250);
      const decimals = panel().querySelector('select[data-role="num-decimals"]');
      const option = decimals.selectedOptions[0];
      if (decimals.value !== 'range' || option.textContent !== '0 à 10') bad.push({ liste: decimals.value, texte: option && option.textContent });
      setSelect(decimals, '2');
      await h.sleep(100);
      const fixed = formatOf(EditorCore.getEditor());
      if (fixed.decimals !== 2 || 'maxDecimals' in fixed) bad.push({ fixé: fixed });
      if (decimals.value !== '2') bad.push({ listeAprès: decimals.value });
      return { pass: bad.length === 0, notes: json(bad) };
    },
  });

  // --- 7) Le bouton n'existe que pour un nombre ou une date ---
  cases.push({
    id: 'gf_the_button_belongs_to_number_and_date_columns_only',
    description: 'La pipette est dans la barre d\'un nombre, d\'un entier, d\'une date et d\'une date et heure ; une colonne Texte n\'a ni elle ni les réglages de nombre et de date',
    run: async (h) => {
      await seed(h);
      const bad = [];
      for (const column of ['Montant', 'Entier', 'Jour', 'Rdv']) { await select(h, column); if (!state().shown) bad.push({ column, state: state() }); }
      await select(h, 'Libre');
      if (state().shown) bad.push({ texte: state() });
      return { pass: bad.length === 0, notes: json(bad) };
    },
  });

  // --- 8) Les modèles existants ne bougent pas ---
  cases.push({
    id: 'gf_existing_templates_are_untouched_and_a_saved_percent_survives',
    description: 'Une bulle d\'avant le bouton (décimales fixes, devise, lettres, aucun réglage) écrit le même texte qu\'avant ; une bulle réglée « % » ou « de x à y » se retrouve identique après un aller-retour par le HTML du modèle',
    run: async (h) => {
      await seed(h);
      const bad = [];
      const same = [
        ['Montant', { type: 'number', decimals: 2, currency: '€' }, `1${NB}234,50${NB}€`], ['Montant', { type: 'number', words: true }, 'mille deux cent trente-cinq'], ['Montant', { type: 'number', words: true, decimals: 2 }, 'mille deux cent trente-quatre virgule cinquante'],
        ['Brut', null, `1${NB}234,568`], ['Brut', { type: 'number', style: 'none', decimals: 1 }, '1234,6'], ['Jour', { type: 'date', preset: 'iso' }, '2026-09-12'], ['Jour', null, '12/09/2026'],
      ];
      for (const [column, format, text] of same) if (textOf(column, format) !== text) bad.push({ column, format, got: textOf(column, format), expected: text });
      const saved = { type: 'number', percent: true, decimals: 1 };
      const ranged = { type: 'number', decimals: 2, maxDecimals: 4 };
      Editor.setHTML('<p>' + badge('Taux', saved) + badge('Brut', ranged) + '</p>');
      await h.sleep(100);
      const html = Editor.getHTML();
      Editor.setHTML(html);
      await h.sleep(100);
      const formats = [];
      EditorCore.getEditor().state.doc.descendants(node => { if (node.type.name === 'varBadge') formats.push(node.attrs.format); });
      if (json(formats) !== json([saved, ranged])) bad.push({ aprèsAllerRetour: formats });
      return { pass: bad.length === 0, notes: json(bad) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.gristFormat = cases;
})();
