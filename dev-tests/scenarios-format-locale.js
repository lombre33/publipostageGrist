// Suite "formatLocale" - le FORMAT RÉGIONAL dans lequel le DOCUMENT écrit ses dates et ses nombres (bug du 26/11 : « chez moi les dates s'affichent au format français, le même document chez une collègue
// au format anglais, je n'ai pas touché au formatage » ; sa remarque : « anglais, ce n'est pas forcément USA - ça peut être un Italien ou autre : il faut découpler complètement »). Avant, l'ordre du jour et du mois,
// le nom du mois, « 1er », « à » / « at », les séparateurs d'un nombre et la place de sa devise suivaient la langue de l'INTERFACE de la personne qui ouvre le document (celle de son navigateur, ou de GFS) :
// la colonne Date d'une bulle sans réglage s'écrivait « 12/09/2026 » chez l'un, « 09/12/2026 » chez l'autre, dans la Lecture comme dans le PDF et l'e-mail ; et l'anglais ne pouvait être qu'américain.
// Maintenant (js/format-locale.js, VariableFormat.formatLocale) : le réglage du document (Réglages > Langue > « Format des dates et des nombres du document ») l'emporte, puis la locale de Grist quand elle n'est pas
// « en-US » (celle de tout document neuf), puis la langue de l'interface comme avant ; le réglage d'un nombre (`style` FR / US) l'emporte toujours.
// Chaque cas change la langue de l'interface par I18n.setLang, comme la personne au navigateur en anglais ; le réglage du document est écrit dans la table des modèles du faux Grist.
(function () {
  const cases = [];
  const stub = () => window.__gristStub;
  const TABLE = 'FlRdv';
  const MODELS = 'Publipostage_Modeles';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (check) => { for (let i = 0; i < 60; i += 1) { if (check()) return true; await sleep(50); } return false; };
  const sec = (y, m, d, h = 0, mi = 0) => Date.UTC(y, m - 1, d, h, mi) / 1000;
  const JOUR = sec(2026, 9, 12);       // colonne Date : le 12 septembre 2026
  const PREMIER = sec(2026, 12, 1);    // le 1er décembre 2026
  const SOIR = sec(2026, 9, 12, 21, 30); // Paris (été) : 12/09/2026 à 23 h 30
  const NBSP = ' ';
  const COLUMNS = { Nom: 'Text', Montant: 'Numeric', Jour: 'Date', Premier: 'Date', Rdv: 'DateTime:Europe/Paris' };
  const ROW = { id: 1, Nom: 'Dupont', Montant: 1234.5, Jour: JOUR, Premier: PREMIER, Rdv: SOIR };
  const asOnRecord = row => Object.assign({}, row, { Jour: new Date(row.Jour * 1000), Premier: new Date(row.Premier * 1000), Rdv: new Date(row.Rdv * 1000) });
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const inLang = async (lang, fn) => { const before = I18n.getLang(); I18n.setLang(lang); try { return await fn(); } finally { I18n.setLang(before); } };

  // Le réglage du document, tel que Grist le garde : la ligne réservée de la table des modèles.
  const settingsRows = () => { const t = stub().state.rows[MODELS]; return t && t.TypeModele ? t.id.filter((id, i) => t.TypeModele[i] === 'reglages').map(id => stub().getRow(MODELS, id)) : []; };
  const settingsJson = () => { const rows = settingsRows(); try { return rows.length ? JSON.parse(rows[0].Contenu) : null; } catch (e) { return 'illisible'; } };
  async function setDocument(value) { await Templates.updateDocumentSettings({ formatLocale: value }); }
  async function setGristLocale(locale) {
    stub().setDocumentSettings(locale ? { locale, engine: 'python3' } : { engine: 'python3' });
    await GristAPI.refreshColumnTypes();
  }
  async function cleanup() {
    // Tout ce que la table des modèles a reçu pendant un cas (la ligne des réglages, les modèles que les cas du premier enregistrement ont créés) : le cas suivant part d'un document vide.
    const table = stub().state.rows[MODELS];
    const ids = table && table.id ? table.id.slice() : [];
    if (ids.length) await stub().applyUserActions([['BulkRemoveRecord', MODELS, ids]]);
    if (typeof Templates.setCurrentId === 'function') Templates.setCurrentId(null);
    await Templates.loadAll();
    stub().setDocumentSettings({ locale: 'en-US', engine: 'python3' });
    await GristAPI.refreshColumnTypes();
    if (stub().state.viewer) { stub().setViewer(false); await AccessRights.refresh(); await waitFor(() => !AccessRights.get().readOnly); }
    I18n.setLang('fr');
    const modal = document.getElementById('settings-modal');
    if (modal && modal.style.display === 'flex') { document.getElementById('settings-close').click(); await sleep(300); }
    // Un compte Lecteur ouvre la Lecture ; le retour à un compte qui modifie ne remet pas l'éditeur de lui-même.
    if (document.body.classList.contains('pp-editor-hidden')) { document.getElementById('btn-mode-edit').click(); await sleep(300); }
  }
  async function seed(h) {
    await cleanup();
    await h.resetEditor();
    stub().setVariables(TABLE, COLUMNS);
    stub().setRows(TABLE, [ROW]);
    await GristAPI.refreshSchema();
    stub().fireRecord(asOnRecord(ROW), TABLE);
    await sleep(60);
  }
  function scenario(id, description, body) {
    cases.push({
      id, description,
      run: async (h) => {
        try { return await body(h); }
        finally { await cleanup(); stub().dropTable(TABLE); await GristAPI.refreshSchema(); }
      },
    });
  }
  const fv = (seconds, format, column) => Variables.formatValue(new Date(seconds * 1000), format, TABLE, column);
  const num = (value, format) => Variables.formatValue(value, Object.assign({ type: 'number' }, format), TABLE, 'Montant');
  // Ce qu'écrit un document réglé sur une région, quelle que soit la langue de l'interface.
  function writtenTexts(chipDay) {
    return {
      jour: fv(JOUR, null, 'Jour'),
      jourVide: fv(JOUR, {}, 'Jour'),
      court: fv(JOUR, { type: 'date', preset: 'dmy_slash_short' }, 'Jour'),
      lettres: fv(JOUR, { type: 'date', preset: 'd_mmmm_yyyy' }, 'Jour'),
      semaine: fv(JOUR, { type: 'date', preset: 'dddd_d_mmmm_yyyy' }, 'Jour'),
      premier: fv(PREMIER, { type: 'date', preset: 'd_mmmm_yyyy' }, 'Premier'),
      heure: fv(SOIR, { type: 'date', preset: 'd_mmmm_yyyy', time: 'natural' }, 'Rdv'),
      heureChiffres: fv(SOIR, { type: 'date', time: 'colon' }, 'Rdv'),
      nombre: num(1234.5, { decimals: 2 }),
      monnaie: num(1234.5, { decimals: 2, currency: '€' }),
      pourcent: num(0.256, { percent: true, decimals: 1 }),
      toutesLettres: num(21, { words: true }),
      puce: VariableFormat.chipDateText(chipDay, { preset: 'd_mmmm_yyyy' }),
      puceDepart: VariableFormat.chipDateText(chipDay, null),
    };
  }
  const FRENCH = {
    jour: '12/09/2026', jourVide: '12/09/2026', court: '12/9/26', lettres: '12 septembre 2026', semaine: 'samedi 12 septembre 2026', premier: '1er décembre 2026',
    heure: '12 septembre 2026 à 23 h 30', heureChiffres: '12/09/2026 23:30', nombre: '1' + NBSP + '234,50', monnaie: '1' + NBSP + '234,50' + NBSP + '€', pourcent: '25,6' + NBSP + '%',
    toutesLettres: 'vingt et un', puce: '12 septembre 2026', puceDepart: '12/09/2026',
  };
  const AMERICAN = {
    jour: '09/12/2026', jourVide: '09/12/2026', court: '9/12/26', lettres: 'September 12, 2026', semaine: 'Saturday, September 12, 2026', premier: 'December 1, 2026',
    heure: 'September 12, 2026 at 11:30 PM', heureChiffres: '09/12/2026, 23:30', nombre: '1,234.50', monnaie: '€1,234.50', pourcent: '25.6%',
    toutesLettres: 'twenty-one', puce: 'September 12, 2026', puceDepart: '12/09/2026',
  };
  // L'anglais n'est pas forcément américain : le jour d'abord, l'horloge à 24 heures.
  const BRITISH = {
    jour: '12/09/2026', jourVide: '12/09/2026', court: '12/9/26', lettres: '12 September 2026', semaine: 'Saturday, 12 September 2026', premier: '1 December 2026',
    heure: '12 September 2026 at 23:30', heureChiffres: '12/09/2026, 23:30', nombre: '1,234.50', monnaie: '€1,234.50', pourcent: '25.6%',
    toutesLettres: 'twenty-one', puce: '12 September 2026', puceDepart: '12/09/2026',
  };
  const ITALIAN = {
    jour: '12/09/2026', jourVide: '12/09/2026', court: '12/9/26', lettres: '12 settembre 2026', semaine: 'sabato 12 settembre 2026', premier: '1 dicembre 2026',
    heure: '12 settembre 2026 alle ore 23:30', heureChiffres: '12/09/2026, 23:30', nombre: '1234,50', monnaie: '1234,50' + NBSP + '€', pourcent: '25,6%',
    puce: '12 settembre 2026', puceDepart: '12/09/2026',
  };
  const GERMAN = {
    jour: '12.09.2026', jourVide: '12.09.2026', court: '12.9.26', lettres: '12. September 2026', semaine: 'Samstag, 12. September 2026', premier: '1. Dezember 2026',
    heure: '12. September 2026 um 23:30', heureChiffres: '12.09.2026, 23:30', nombre: '1.234,50', monnaie: '1.234,50' + NBSP + '€', pourcent: '25,6' + NBSP + '%',
    puce: '12. September 2026', puceDepart: '12/09/2026',
  };
  const wrong = (got, want) => Object.keys(want).filter(k => got[k] !== want[k]).map(k => ({ cas: k, got: got[k], want: want[k] }));
  const CHIP_DAY = new Date(2026, 8, 12);

  // --- 1) Un document réglé sur la France écrit à la française, interface en anglais : le cas de la collègue ---
  scenario('fl_a_document_set_to_france_writes_french_dates_and_numbers_in_an_english_interface',
    'Réglé sur « Français (France) », le document écrit « 12/09/2026 », « 12 septembre 2026 », « 1er décembre 2026 », « 12 septembre 2026 à 23 h 30 », « 1 234,50 », « vingt et un » et la puce « Date du jour » à la française, que l\'interface de la personne soit en français OU en anglais (le cas d\'une collègue dont le navigateur est en anglais)',
    async (h) => {
      await seed(h);
      await setDocument('fr-FR');
      const bad = {};
      for (const lang of ['fr', 'en']) {
        const rows = wrong(await inLang(lang, () => writtenTexts(CHIP_DAY)), FRENCH);
        if (rows.length) bad[lang] = rows;
      }
      return { pass: Object.keys(bad).length === 0, notes: JSON.stringify(bad) };
    });

  scenario('fl_a_document_set_to_the_united_states_writes_american_dates_and_numbers_in_a_french_interface',
    'Réglé sur « English (United States) », le document écrit « 09/12/2026 », « September 12, 2026 », « 1 234,50 » à l\'américaine (« 1,234.50 ») et « twenty-one », interface en français comme en anglais',
    async (h) => {
      await seed(h);
      await setDocument('en-US');
      const bad = {};
      for (const lang of ['fr', 'en']) {
        const rows = wrong(await inLang(lang, () => writtenTexts(CHIP_DAY)), AMERICAN);
        if (rows.length) bad[lang] = rows;
      }
      return { pass: Object.keys(bad).length === 0, notes: JSON.stringify(bad) };
    });

  // --- 2) La langue n'est pas le format : l'anglais britannique, l'italien, l'allemand ---
  for (const [locale, label, want] of [['en-GB', 'English (United Kingdom)', BRITISH], ['it-IT', 'Italiano (Italia)', ITALIAN], ['de-DE', 'Deutsch (Deutschland)', GERMAN]]) {
    scenario('fl_a_document_set_to_' + locale.toLowerCase().replace('-', '_') + '_writes_its_own_regional_format',
      'Réglé sur « ' + label + ' », le document écrit à la manière de cette région (le jour avant le mois, les noms des mois, les séparateurs, la devise, l\'horloge), que l\'interface soit en français ou en anglais : « ' + want.jour + ' », « ' + want.lettres + ' », « ' + want.nombre + ' » ; « anglais » n\'est pas « USA »',
      async (h) => {
        await seed(h);
        await setDocument(locale);
        const bad = {};
        for (const lang of ['fr', 'en']) {
          const rows = wrong(await inLang(lang, () => writtenTexts(CHIP_DAY)), want);
          if (rows.length) bad[lang] = rows;
        }
        return { pass: Object.keys(bad).length === 0, notes: JSON.stringify(bad) };
      });
  }

  // --- 3) Automatique : comme avant, l'interface décide - sauf une locale que Grist porte et que le widget sait écrire ---
  scenario('fl_automatic_follows_the_interface_unless_grist_sets_a_locale_the_widget_can_write',
    'Sans réglage (« Automatique ») le document écrit comme l\'interface, comme avant (français : « 12/09/2026 », anglais : « 09/12/2026 ») ; une locale de Grist que le widget sait écrire (« fr-FR », « fr », « fr_CA » → France ; « en-GB » ; « it-IT » ; « de ») l\'emporte pour tout le monde ; « en-US » (ce que Grist met dans tout document neuf), « en », « en-AU », une locale inconnue ou absente ne décident rien',
    async (h) => {
      await seed(h);
      const bad = [];
      const writes = lang => inLang(lang, () => fv(JOUR, null, 'Jour'));
      if ((await writes('fr')) !== '12/09/2026') bad.push('auto fr');
      if ((await writes('en')) !== '09/12/2026') bad.push('auto en');
      const decides = [['fr-FR', '12/09/2026'], ['fr', '12/09/2026'], ['fr_CA', '12/09/2026'], ['FR-be', '12/09/2026'], ['en-GB', '12/09/2026'], ['it-IT', '12/09/2026'], ['de', '12.09.2026'], ['es-MX', '12/09/2026']];
      for (const [locale, expected] of decides) {
        await setGristLocale(locale);
        const en = await writes('en'); const fr = await writes('fr');
        if (en !== expected || fr !== expected) bad.push({ locale, expected, en, fr });
      }
      for (const locale of ['en-US', 'EN-us', 'en', 'en-AU', 'ja-JP', 'xx', '', null]) {
        await setGristLocale(locale);
        const en = await writes('en'); const fr = await writes('fr');
        if (en !== '09/12/2026' || fr !== '12/09/2026') bad.push({ locale, interfaceAnglaise: en, interfaceFrancaise: fr });
      }
      // Le réglage du document l'emporte sur la locale de Grist, et sa suppression rend la main à la locale de Grist.
      await setGristLocale('fr-FR');
      await setDocument('en-US');
      if ((await writes('fr')) !== '09/12/2026') bad.push({ reglage: 'en-US sur locale fr', got: await writes('fr') });
      await setDocument(null);
      if ((await writes('en')) !== '12/09/2026') bad.push({ reglage: 'retiré, locale fr', got: await writes('en') });
      return { pass: bad.length === 0, notes: JSON.stringify(bad) };
    });

  // --- 4) Le réglage d'un nombre l'emporte, comme avant ---
  scenario('fl_the_style_of_a_number_still_wins_over_the_format_of_the_document',
    'Un nombre réglé « FR » ou « US » sur sa bulle garde son écriture dans un document réglé sur une autre région, et « — » (sans séparateur) reste sans séparateur',
    async (h) => {
      await seed(h);
      await setDocument('de-DE');
      const got = await inLang('en', async () => ({
        us: num(1234.5, { decimals: 2, style: 'us' }), fr: num(1234.5, { decimals: 2, style: 'fr' }), none: num(1234.5, { decimals: 2, style: 'none' }), auto: num(1234.5, { decimals: 2 }),
      }));
      await setDocument('en-GB');
      const gotGb = await inLang('fr', async () => ({ us: num(1234.5, { decimals: 2, style: 'us' }), fr: num(1234.5, { decimals: 2, style: 'fr' }) }));
      const want = { us: '1,234.50', fr: '1' + NBSP + '234,50', none: '1234,50', auto: '1.234,50' };
      const bad = [];
      if (!same(got, want)) bad.push({ got, want });
      if (!same(gotGb, { us: want.us, fr: want.fr })) bad.push({ gotGb });
      return { pass: bad.length === 0, notes: JSON.stringify(bad) };
    });

  // --- 5) La Lecture (le chemin commun du PDF, du Word et de l'e-mail) écrit le format du document ---
  scenario('fl_the_reading_view_writes_the_format_of_the_document_not_of_the_interface',
    'La Lecture (ReaderMode.preview) d\'un modèle aux bulles sans réglage écrit « 12/09/2026 » et « 1 234,5 » dans un document réglé sur la France, même interface en anglais - et la ligne brute de l\'export en lot (fetchTable) de même ; réglé sur le Royaume-Uni : « 12/09/2026 » et « 1,234.5 » ; sur les États-Unis : « 09/12/2026 »',
    async (h) => {
      await seed(h);
      const html = '<p>' + ['Jour', 'Rdv', 'Montant'].map(c => `<span class="var-badge" data-table="${TABLE}" data-column="${c}" data-key="${TABLE}.${c}"></span>`).join(' ; ') + '</p>';
      const texts = async (record) => {
        const box = document.createElement('div');
        box.innerHTML = await ReaderMode.preview(html, TABLE, record);
        return Array.from(box.querySelectorAll('.resolved-var')).map(e => e.textContent);
      };
      const raw = await GristAPI.fetchRowById(TABLE, 1);
      const out = {};
      const wants = { 'fr-FR': ['12/09/2026', '12/09/2026', '1' + NBSP + '234,5'], 'en-GB': ['12/09/2026', '12/09/2026', '1,234.5'], 'en-US': ['09/12/2026', '09/12/2026', '1,234.5'] };
      const bad = [];
      for (const [locale, want] of Object.entries(wants)) {
        await setDocument(locale);
        for (const lang of ['fr', 'en']) {
          const seen = await inLang(lang, async () => ({ live: await texts(asOnRecord(ROW)), raw: await texts(raw) }));
          out[locale + '/' + lang] = seen;
          if (!same(seen.live, want) || !same(seen.raw, want)) bad.push({ locale, lang, seen, want });
        }
      }
      return { pass: bad.length === 0, notes: JSON.stringify({ bad, out }) };
    });

  // --- 6) Les listes de la barre disent ce que le document écrit ---
  async function selectBadge(h, column, format) {
    const attrs = format ? ` data-format="${JSON.stringify(format).replace(/"/g, '&quot;')}"` : '';
    Editor.setHTML(`<p>Valeur : <span class="var-badge" data-table="${TABLE}" data-column="${column}" data-key="${TABLE}.${column}"${attrs}></span></p>`);
    await h.sleep(150);
    const ed = EditorCore.getEditor();
    document.querySelector('.tiptap').focus();
    let pos = -1;
    ed.state.doc.descendants((node, p) => { if (node.type.name === 'varBadge') pos = p; });
    if (pos === -1) return null;
    ed.commands.setNodeSelection(pos);
    await h.sleep(150);
    return ed;
  }
  const bar = () => document.querySelector('.v2-varfmt-toolbar');
  const optionTexts = selector => Array.from(bar().querySelectorAll(selector + ' option')).map(o => o.value + '=' + o.textContent);
  scenario('fl_the_bar_lists_show_what_the_document_writes_even_after_the_document_changes_its_region',
    'La liste « Date » et la liste « Heure » de la barre d\'une bulle montrent ce que le document écrit (« 12/09/2026 », « 23 h 30 » pour la France ; « 09/12/2026 », « 11:30 PM » aux États-Unis ; « 12/09/2026 » et pas de « 23 h 30 » au Royaume-Uni ; « 12.09.2026 » en Allemagne) et se refont quand le document change de région ALORS QUE la barre est déjà construite ; la valeur choisie reste',
    async (h) => {
      await seed(h);
      const bad = [];
      const seen = {};
      await inLang('en', async () => {
        for (const [key, locale, format] of [['fr', 'fr-FR', { type: 'date', preset: 'd_mmmm_yyyy', time: 'natural' }], ['us', 'en-US', { type: 'date', preset: 'd_mmmm_yyyy', time: 'ampm' }],
          ['gb', 'en-GB', { type: 'date', preset: 'd_mmmm_yyyy', time: 'colon' }], ['de', 'de-DE', { type: 'date', preset: 'iso' }], ['back', 'fr-FR', { type: 'date', preset: 'iso' }]]) {
          await setDocument(locale);
          await selectBadge(h, 'Rdv', format);
          seen[key] = { date: optionTexts('select[data-role="date-preset"]'), time: optionTexts('select[data-role="date-time"]'), picked: bar().querySelector('select[data-role="date-preset"]').value };
        }
      });
      const first = key => seen[key].date[0];
      if (first('fr') !== 'dmy_slash_full=12/09/2026' || !seen.fr.time.includes('natural=23 h 30') || seen.fr.picked !== 'd_mmmm_yyyy') bad.push({ fr: seen.fr });
      if (first('us') !== 'dmy_slash_full=09/12/2026' || seen.us.time.some(o => o.startsWith('natural=')) || seen.us.picked !== 'd_mmmm_yyyy') bad.push({ us: seen.us });
      if (first('gb') !== 'dmy_slash_full=12/09/2026' || seen.gb.time.some(o => o.startsWith('natural=')) || !seen.gb.date.includes('d_mmmm_yyyy=12 September 2026')) bad.push({ gb: seen.gb });
      if (first('de') !== 'dmy_slash_full=12.09.2026' || seen.de.picked !== 'iso') bad.push({ de: seen.de });
      if (first('back') !== 'dmy_slash_full=12/09/2026' || seen.back.picked !== 'iso') bad.push({ back: seen.back });
      return { pass: bad.length === 0, notes: JSON.stringify({ bad, seen }) };
    });

  scenario('fl_the_date_chip_bar_lists_follow_the_format_of_the_document',
    'La liste « Date » de la barre d\'une puce « Date du jour » suit le format du document : « 12/09/2026 » une seule fois en France et au Royaume-Uni (c\'est déjà l\'écriture de départ), « 12/09/2026 » puis « 09/12/2026 » aux États-Unis, « 12/09/2026 » puis « 12.09.2026 » en Allemagne, interface en anglais dans tous les cas',
    async (h) => {
      await seed(h);
      const chipSelect = () => document.querySelector('.v2-timechip-toolbar select[data-role="chip-date"]');
      async function selectChip() {
        Editor.setHTML('<p>Le <span class="smart-chip" contenteditable="false" data-chip-kind="date"></span> fin</p>');
        await h.sleep(150);
        const ed = EditorCore.getEditor();
        document.querySelector('.tiptap').focus();
        let pos = -1;
        ed.state.doc.descendants((node, p) => { if (node.type.name === 'smartChip') pos = p; });
        if (pos === -1) return false;
        ed.commands.setNodeSelection(pos);
        await h.sleep(150);
        return true;
      }
      const seen = {};
      await inLang('en', async () => {
        for (const locale of ['fr-FR', 'en-GB', 'en-US', 'de-DE']) {
          await setDocument(locale);
          if (!(await selectChip())) return;
          seen[locale] = Array.from(chipSelect().options).map(o => o.value + '=' + o.textContent);
        }
      });
      if (Object.keys(seen).length !== 4) return { pass: false, notes: 'puce introuvable ' + JSON.stringify(seen) };
      const bad = [];
      const noDuplicate = list => !list.some(o => o.startsWith('dmy_slash_full='));
      if (seen['fr-FR'][0] !== 'dmy_chip=12/09/2026' || !noDuplicate(seen['fr-FR'])) bad.push({ fr: seen['fr-FR'] });
      if (seen['en-GB'][0] !== 'dmy_chip=12/09/2026' || !noDuplicate(seen['en-GB'])) bad.push({ gb: seen['en-GB'] });
      if (seen['en-US'][0] !== 'dmy_chip=12/09/2026' || !seen['en-US'].includes('dmy_slash_full=09/12/2026')) bad.push({ us: seen['en-US'] });
      if (seen['de-DE'][0] !== 'dmy_chip=12/09/2026' || !seen['de-DE'].includes('dmy_slash_full=12.09.2026')) bad.push({ de: seen['de-DE'] });
      return { pass: bad.length === 0, notes: JSON.stringify({ bad, seen }) };
    });

  // --- 7) « Comme dans Grist » écrit au format du document ---
  scenario('fl_the_grist_format_button_reads_the_column_in_the_format_of_the_document',
    '« Comme dans Grist » traduit le format d\'une colonne au format du document, pas à celui de l\'interface : interface en anglais, document en France ou au Royaume-Uni, « DD/MM/YYYY » passe et « MM/DD/YYYY » est refusé (« 09/12 » se lirait 9 décembre) ; document aux États-Unis, c\'est l\'inverse',
    async (h) => {
      await seed(h);
      const out = {};
      await inLang('en', async () => {
        for (const locale of ['fr-FR', 'en-GB', 'en-US']) {
          await setDocument(locale);
          out[locale] = {
            dayFirst: VariableFormat.gristColumnFormat('Date', { dateFormat: 'DD/MM/YYYY' }, null, VariableFormat.formatLocale()),
            monthFirst: VariableFormat.gristColumnFormat('Date', { dateFormat: 'MM/DD/YYYY' }, null, VariableFormat.formatLocale()),
          };
        }
      });
      const bad = [];
      for (const locale of ['fr-FR', 'en-GB']) {
        if (!out[locale].dayFirst.format || out[locale].dayFirst.format.preset !== 'dmy_slash_full') bad.push({ locale, dayFirst: out[locale].dayFirst });
        if (out[locale].monthFirst.refusal !== 'dateOrder') bad.push({ locale, monthFirst: out[locale].monthFirst });
      }
      if (!out['en-US'].monthFirst.format || out['en-US'].dayFirst.refusal !== 'dateOrder') bad.push({ us: out['en-US'] });
      return { pass: bad.length === 0, notes: JSON.stringify(bad) };
    });

  // --- 8) Réglages > Langue > « Format des dates et des nombres du document » ---
  const select = () => document.getElementById('settings-format-locale');
  const hint = () => document.getElementById('settings-format-locale-hint').textContent;
  const keyEvent = key => new KeyboardEvent('keydown', { key, code: 'Key' + key.toUpperCase(), ctrlKey: true, bubbles: true, cancelable: true });
  async function undo(h) {
    EditorCore.getEditor().commands.focus('end'); await h.sleep(60);
    EditorCore.getEditor().view.dom.dispatchEvent(keyEvent('z'));
    await ActionHistory.whenIdle(); await h.sleep(150);
  }
  async function redo(h) {
    EditorCore.getEditor().commands.focus('end'); await h.sleep(60);
    EditorCore.getEditor().view.dom.dispatchEvent(keyEvent('y'));
    await ActionHistory.whenIdle(); await h.sleep(150);
  }
  async function pick(h, value) {
    select().value = value;
    select().dispatchEvent(new Event('change', { bubbles: true }));
    await h.sleep(200);
  }
  async function written(check) {
    for (let i = 0; i < 40; i += 1) { if (check(settingsJson())) return true; await sleep(50); }
    return false;
  }
  const openSettings = async (h) => { document.getElementById('v2-btn-settings').click(); await h.sleep(300); };

  scenario('fl_the_settings_section_lists_the_regions_with_what_they_write_and_says_why',
    'Réglages > Langue a la section « Format des dates et des nombres du document » : une liste (Automatique, puis chaque région avec ce qu\'elle écrit - « Français (France) - 12/09/2026 · 1 234,50 ») ; « Automatique » choisi tant que rien n\'est écrit ; choisir « English (United Kingdom) » écrit `formatLocale: "en-GB"` dans la ligne des réglages du document et la phrase le dit pour tout le monde ; « Automatique » le retire ; la phrase dit aussi, en automatique, que chacun suit sa langue ou que Grist règle le document',
    async (h) => {
      await seed(h);
      const bad = [];
      if (!select()) return { pass: false, notes: 'liste absente' };
      await openSettings(h);
      const options = Array.from(select().options).map(o => o.value);
      if (!same(options, ['auto'].concat(VariableFormat.REGIONS.map(r => r.locale)))) bad.push({ options });
      const labels = Array.from(select().options).map(o => o.textContent);
      if (!labels.some(l => /^Français \(France\) - 12\/09\/2026 · 1 234,50$/.test(l)) || !labels.some(l => /^English \(United States\) - 09\/12\/2026 · 1,234\.50$/.test(l)) || !labels.some(l => /^English \(United Kingdom\) - 12\/09\/2026 · 1,234\.50$/.test(l))) bad.push({ labels });
      if (select().value !== 'auto') bad.push({ start: select().value });
      if (!/interface/i.test(hint()) || !/Français \(France\)/.test(hint())) bad.push({ autoHint: hint() });
      await pick(h, 'en-GB');
      if (!(await written(json => json && json.formatLocale === 'en-GB')) || select().value !== 'en-GB' || !/English \(United Kingdom\)/.test(hint()) || !/pour tout le monde/.test(hint())) bad.push({ gb: settingsJson(), hint: hint(), value: select().value });
      if (fv(JOUR, { type: 'date', preset: 'd_mmmm_yyyy' }, 'Jour') !== '12 September 2026') bad.push({ after: fv(JOUR, { type: 'date', preset: 'd_mmmm_yyyy' }, 'Jour') });
      await pick(h, 'auto');
      if (!(await written(json => json && json.formatLocale === undefined)) || select().value !== 'auto') bad.push({ auto: settingsJson() });
      // Un document réglé dans Grist : la phrase le dit.
      await setGristLocale('it-IT');
      document.getElementById('settings-close').click();
      await sleep(300);
      await openSettings(h);
      if (!/Grist/.test(hint()) || !/Italiano \(Italia\)/.test(hint())) bad.push({ gristHint: hint() });
      I18n.setLang('en');
      FormatLocale.render();
      if (!/Grist/.test(hint()) || !/Italiano \(Italia\)/.test(hint()) || !/Automatic/.test(hint())) bad.push({ gristHintEn: hint() });
      I18n.setLang('fr');
      return { pass: bad.length === 0, notes: JSON.stringify(bad) };
    });

  scenario('fl_the_choice_of_the_document_format_is_one_step_of_undo_and_redo',
    'Choisir une région dans la section est UN pas : Ctrl + Z remet « Automatique » (la clé disparaît du document), Ctrl + Y la rétablit ; choisir ce qui est déjà choisi ne laisse aucun pas',
    async (h) => {
      await seed(h);
      ActionHistory.reset();
      const bad = [];
      await openSettings(h);
      await pick(h, 'fr-FR');
      if (!(await written(json => json && json.formatLocale === 'fr-FR'))) bad.push({ set: settingsJson() });
      const stepsAfterChoice = ActionHistory.count();
      if (stepsAfterChoice !== 1) bad.push({ stepsAfterChoice });
      document.getElementById('settings-close').click();
      await sleep(300);
      await undo(h);
      if (!(await written(json => json && json.formatLocale === undefined)) || Templates.getDocumentSetting('formatLocale') !== undefined) bad.push({ undo: settingsJson() });
      await inLang('en', async () => { if (fv(JOUR, null, 'Jour') !== '09/12/2026') bad.push('après annuler, interface anglaise : retour à Automatique'); });
      await redo(h);
      if (!(await written(json => json && json.formatLocale === 'fr-FR')) || FormatLocale.choice() !== 'fr-FR') bad.push({ redo: settingsJson() });
      await openSettings(h);
      ActionHistory.reset();
      await pick(h, 'fr-FR');
      if (ActionHistory.count() !== 0) bad.push({ again: ActionHistory.count() });
      return { pass: bad.length === 0, notes: JSON.stringify(bad) };
    });

  scenario('fl_a_read_only_account_cannot_change_the_format_of_the_document',
    'Un compte Lecteur voit la liste grisée, le choix du document, la phrase « lecture seule » ; un changement ne touche pas au document',
    async (h) => {
      await seed(h);
      await setDocument('fr-FR');
      stub().setViewer(true);
      await AccessRights.refresh();
      if (!(await waitFor(() => AccessRights.get().readOnly))) return { pass: false, notes: 'compte Lecteur non pris en compte' };
      await openSettings(h);
      await h.sleep(200);
      const bad = [];
      if (!select().disabled) bad.push('liste non grisée');
      if (select().value !== 'fr-FR') bad.push({ value: select().value });
      if (document.getElementById('settings-format-locale-locked').hidden) bad.push('phrase « lecture seule » cachée');
      select().disabled = false;
      await pick(h, 'en-US');
      if (Templates.getDocumentSetting('formatLocale') !== 'fr-FR' || select().value !== 'fr-FR') bad.push({ afterChange: Templates.getDocumentSetting('formatLocale'), value: select().value });
      stub().setViewer(false);
      await AccessRights.refresh();
      await waitFor(() => !AccessRights.get().readOnly);
      document.getElementById('settings-close').click();
      await sleep(300);
      return { pass: bad.length === 0, notes: JSON.stringify(bad) };
    });

  // --- 9) Un document déjà fait, sans réglage : rien ne change ---
  scenario('fl_a_document_without_setting_writes_exactly_as_before',
    'Non-régression : sans réglage et sans locale de Grist qui compte, les dates et les nombres s\'écrivent exactement comme avant, dans chaque langue d\'interface (français : « 12/09/2026 », « 1 234,50 » ; anglais : « 09/12/2026 », « 1,234.50 »)',
    async (h) => {
      await seed(h);
      const fr = await inLang('fr', () => writtenTexts(CHIP_DAY));
      const en = await inLang('en', () => writtenTexts(CHIP_DAY));
      const bad = [].concat(wrong(fr, FRENCH).map(r => Object.assign({ lang: 'fr' }, r)), wrong(en, AMERICAN).map(r => Object.assign({ lang: 'en' }, r)));
      return { pass: bad.length === 0, notes: JSON.stringify(bad) };
    });

  // --- 10) Un document NEUF garde le format de celle ou celui qui y écrit le premier modèle ---
  async function emptyDocument() {
    const t = stub().state.rows[MODELS];
    const ids = t && t.id ? t.id.slice() : [];
    if (ids.length) await stub().applyUserActions([['BulkRemoveRecord', MODELS, ids]]);
    await Templates.loadAll();
  }
  async function create(name) { return Templates.save(null, name, '<p>' + name + '</p>', '', null, null, 'document', null, null); }
  async function settled(check) { return waitFor(() => check(settingsJson())); }

  scenario('fl_the_first_template_of_a_new_document_pins_the_format_of_the_person_who_writes_it',
    'Dans un document neuf (aucun modèle), l\'enregistrement du PREMIER modèle fixe le format du document sur celui de la personne qui l\'écrit : interface en français → « fr-FR » ; une autre personne, interface en anglais, qui ouvre ensuite le même document, lit « 12/09/2026 » comme elle ; et la liste des Réglages le montre',
    async (h) => {
      await seed(h);
      await emptyDocument();
      const bad = [];
      if (Templates.getDocumentSetting('formatLocale') !== undefined) bad.push('réglage déjà là');
      I18n.setLang('fr');
      await create('Premier modèle');
      if (!(await settled(json => json && json.formatLocale === 'fr-FR'))) bad.push({ pinned: settingsJson() });
      const reads = await inLang('en', async () => fv(JOUR, null, 'Jour'));
      if (reads !== '12/09/2026') bad.push({ colleague: reads });
      await openSettings(h);
      if (select().value !== 'fr-FR') bad.push({ settings: select().value });
      document.getElementById('settings-close').click();
      await sleep(300);
      await emptyDocument();
      await inLang('en', async () => { await create('First model'); });
      if (!(await settled(json => json && json.formatLocale === 'en-US'))) bad.push({ english: settingsJson() });
      return { pass: bad.length === 0, notes: JSON.stringify(bad) };
    });

  scenario('fl_only_the_very_first_template_pins_and_a_set_or_older_document_is_left_alone',
    'Le deuxième modèle ne fixe rien (un document déjà fait, sans réglage, reste en « Automatique ») ; un document dont le format est déjà réglé garde le sien au premier modèle ; la locale de Grist qui compte est fixée comme le reste',
    async (h) => {
      await seed(h);
      const bad = [];
      // Un document déjà fait : un modèle, aucun réglage. Le deuxième n'en fixe pas.
      await emptyDocument();
      await create('Ancien'); await settled(json => json && json.formatLocale);
      await Templates.updateDocumentSettings({ formatLocale: null });
      await settled(json => json && json.formatLocale === undefined);
      await create('Deuxième'); await sleep(400);
      if (Templates.getDocumentSetting('formatLocale') !== undefined || (settingsJson() || {}).formatLocale !== undefined) bad.push({ second: settingsJson() });
      // Un document dont le format est réglé avant le premier modèle.
      await emptyDocument();
      await setDocument('it-IT');
      await create('Réglé'); await sleep(400);
      if (Templates.getDocumentSetting('formatLocale') !== 'it-IT') bad.push({ preset: Templates.getDocumentSetting('formatLocale') });
      // La locale de Grist qui compte (« en-GB ») : fixée telle quelle, interface en français.
      await emptyDocument();
      await setGristLocale('en-GB');
      await create('Grist'); await settled(json => json && json.formatLocale);
      if (Templates.getDocumentSetting('formatLocale') !== 'en-GB') bad.push({ grist: Templates.getDocumentSetting('formatLocale') });
      return { pass: bad.length === 0, notes: JSON.stringify(bad) };
    });

  // --- 11) Une variable garde le format régional qu'elle avait à son ajout (demande d'Antoine du 26/11 : « une fois une variable ajoutée, ça ne rechange pas après - sans bouger automatiquement ») ---
  const badgeNodes = () => { const out = []; EditorCore.getEditor().state.doc.descendants((node, pos) => { if (node.type.name === 'varBadge') out.push({ node, pos }); }); return out; };
  async function addByList(h, key) {
    Editor.setHTML('<p></p>'); await h.sleep(60);
    await h.focusInElement(document.querySelector('.tiptap p'));
    await h.typeText('#' + key);
    await waitFor(() => document.querySelector('.ac-item'));
    await h.sleep(60);
    document.querySelector('.tiptap').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await waitFor(() => badgeNodes().length > 0);
    await h.sleep(80);
    return badgeNodes();
  }
  const html = (column, locale) => `<span class="var-badge" data-table="${TABLE}" data-column="${column}" data-key="${TABLE}.${column}"${locale ? ` data-locale="${locale}"` : ''}></span>`;
  async function readText(markup, record) {
    const box = document.createElement('div');
    box.innerHTML = await ReaderMode.preview('<p>' + markup + '</p>', TABLE, record);
    return Array.from(box.querySelectorAll('.resolved-var')).map(e => e.textContent);
  }

  scenario('fl_a_date_or_number_variable_keeps_the_region_it_was_added_in',
    'Ajouter une variable Date, Date et heure ou Nombre par la liste « # » lui fait garder le format régional du document à cet instant (attribut `locale`, écrit `data-locale`, sans `data-format` donc sans le point « format choisi ») ; une colonne Texte n\'en garde pas ; ajoutée dans un champ texte à bulles, aucune',
    async (h) => {
      await seed(h);
      await setDocument('en-GB');
      const bad = [];
      const kept = {};
      for (const column of ['Jour', 'Rdv', 'Montant', 'Nom']) {
        const nodes = await addByList(h, TABLE + '.' + column);
        kept[column] = nodes.length === 1 ? { locale: nodes[0].node.attrs.locale, format: nodes[0].node.attrs.format } : nodes.length;
      }
      for (const column of ['Jour', 'Rdv', 'Montant']) if (!kept[column] || kept[column].locale !== 'en-GB' || kept[column].format !== null) bad.push({ column, got: kept[column] });
      if (!kept.Nom || kept.Nom.locale !== null) bad.push({ Nom: kept.Nom, got: kept.Nom });
      await addByList(h, TABLE + '.Jour');
      const markup = Editor.getHTML();
      if (!/data-locale="en-GB"/.test(markup) || /data-format/.test(markup)) bad.push({ markup });
      // Le HTML enregistré et rouvert garde la région.
      Editor.setHTML(markup); await h.sleep(100);
      const reopened = badgeNodes();
      if (reopened.length !== 1 || reopened[0].node.attrs.locale !== 'en-GB') bad.push({ reopened: reopened.map(n => n.node.attrs.locale) });
      return { pass: bad.length === 0, notes: JSON.stringify(bad) };
    });

  scenario('fl_a_variable_added_does_not_change_when_the_document_the_interface_or_grist_change',
    'Une variable ajoutée dans un document français s\'écrit « 12/09/2026 » et « 1 234,5 » pour toujours : elle ne bouge ni quand le document passe aux États-Unis, ni quand la langue de l\'interface change, ni quand Grist prend une autre locale ; une ancienne variable, sans région gardée, suit le document comme avant',
    async (h) => {
      await seed(h);
      await setDocument('fr-FR');
      const nodes = [];
      for (const column of ['Jour', 'Montant']) { const found = await addByList(h, TABLE + '.' + column); nodes.push(found[0]); }
      const added = nodes.map(n => n.node.attrs.locale);
      const stamped = html('Jour', 'fr-FR') + ' ; ' + html('Montant', 'fr-FR');
      const legacy = html('Jour') + ' ; ' + html('Montant');
      const bad = [];
      if (!same(added, ['fr-FR', 'fr-FR'])) bad.push({ added });
      const seen = {};
      for (const [step, doIt] of [['document aux États-Unis', () => setDocument('en-US')], ['locale de Grist en italien', () => setGristLocale('it-IT')], ['document en Allemagne', () => setDocument('de-DE')]]) {
        await doIt();
        for (const lang of ['fr', 'en']) {
          const got = await inLang(lang, async () => ({ stamped: await readText(stamped, asOnRecord(ROW)), legacy: await readText(legacy, asOnRecord(ROW)) }));
          seen[step + '/' + lang] = got;
          if (!same(got.stamped, ['12/09/2026', '1' + NBSP + '234,5'])) bad.push({ step, lang, stamped: got.stamped });
        }
      }
      // Les anciennes bulles, elles, suivent le document (allemand en dernier).
      if (!same(seen['document en Allemagne/fr'].legacy, ['12.09.2026', '1.234,5'])) bad.push({ legacy: seen['document en Allemagne/fr'].legacy });
      await setDocument('en-US');
      const usLegacy = await inLang('fr', () => readText(legacy, asOnRecord(ROW)));
      if (!same(usLegacy, ['09/12/2026', '1,234.5'])) bad.push({ usLegacy });
      return { pass: bad.length === 0, notes: JSON.stringify(bad) };
    });

  scenario('fl_the_bar_of_a_variable_speaks_the_region_of_the_variable',
    'La barre d\'une variable qui a gardé « fr-FR » dans un document américain montre « 12/09/2026 » en tête de sa liste de dates et « 23 h 30 » dans celle des heures ; une ancienne variable du même document, « 09/12/2026 » ; la barre se refait d\'une bulle à l\'autre',
    async (h) => {
      await seed(h);
      await setDocument('en-US');
      const bad = [];
      const seen = {};
      for (const [key, locale] of [['fr', 'fr-FR'], ['legacy', null], ['gb', 'en-GB']]) {
        const attrs = locale ? ` data-locale="${locale}"` : '';
        Editor.setHTML(`<p>Valeur : <span class="var-badge" data-table="${TABLE}" data-column="Rdv" data-key="${TABLE}.Rdv"${attrs} data-format="${JSON.stringify({ type: 'date', preset: 'd_mmmm_yyyy', time: 'colon' }).replace(/"/g, '&quot;')}"></span></p>`);
        await h.sleep(150);
        const ed = EditorCore.getEditor();
        document.querySelector('.tiptap').focus();
        const found = badgeNodes()[0];
        ed.commands.setNodeSelection(found.pos);
        await h.sleep(200);
        seen[key] = { date: optionTexts('select[data-role="date-preset"]'), time: optionTexts('select[data-role="date-time"]') };
      }
      if (seen.fr.date[0] !== 'dmy_slash_full=12/09/2026' || !seen.fr.time.includes('natural=23 h 30') || !seen.fr.date.includes('d_mmmm_yyyy=12 septembre 2026')) bad.push({ fr: seen.fr });
      if (seen.legacy.date[0] !== 'dmy_slash_full=09/12/2026' || seen.legacy.time.some(o => o.startsWith('natural=')) || !seen.legacy.date.includes('d_mmmm_yyyy=September 12, 2026')) bad.push({ legacy: seen.legacy });
      if (seen.gb.date[0] !== 'dmy_slash_full=12/09/2026' || !seen.gb.date.includes('d_mmmm_yyyy=12 September 2026')) bad.push({ gb: seen.gb });
      return { pass: bad.length === 0, notes: JSON.stringify({ bad, seen }) };
    });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.formatLocale = cases;
})();
