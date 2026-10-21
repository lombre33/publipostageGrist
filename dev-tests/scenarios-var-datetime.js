// Suite "varDateTime" - une colonne « Date et heure » face au format de date d'une bulle (question d'Antoine du 20/10 : « est-ce que le formatage de date prend aussi en
// compte les colonnes date et heure ? » ; son choix du 21/10 : corriger, et ajouter une liste « Heure » dans la barre, sans heure par défaut).
// Ce que fait un VRAI Grist (essayé dans un vrai Grist le 20/10, labo-grist-reel/probe-datetime-format.mjs) et que ces tests posent donc tel quel :
//  - le type d'une colonne « Date et heure » arrive TOUJOURS avec son fuseau, « DateTime:Europe/Paris » - jamais « DateTime » nu ;
//  - grist.onRecord livre un objet Date (l'instant), fetchTable (lignes liées, boucles, export en lot) des secondes ;
//  - le jour d'un instant n'est pas le même à Paris et en UTC : 23 h 30 à Paris le 12/09 est 21 h 30 UTC, 00 h 30 à Paris le 13/09 est encore le 12 en UTC.
// Avant la correction, `=== 'DateTime'` n'était jamais vrai : la bulle sans réglage écrivait « 2026-09-12T21:30:00.000Z », la barre n'avait aucun réglage de date, un format
// posé à la main écrivait le jour UTC, et l'Excel, le calcul et le changement de colonne ne reconnaissaient pas la colonne (js/variable-format.js:isDateType).
// Demande d'Antoine du 21/10 (« pour date et heure, il faut prévoir les heures format am/pm et le format 12/24h ») : la liste « Heure » écrit aussi à 12 heures, « 11:30 PM », dans toutes
// les langues (réglage `ampm`) ; « 23 h 30 » (`natural`) s'écrit comme avant, et en anglais, qui n'écrit pas « 23 h 30 », c'est le même texte que `ampm`.
(function () {
  const cases = [];

  const TABLE = 'VdRdv';
  const sec = (y, m, d, h = 0, mi = 0) => Date.UTC(y, m - 1, d, h, mi) / 1000;
  // Les instants (secondes UTC) et ce que le mur de leur colonne montre.
  const SOIR = sec(2026, 9, 12, 21, 30);   // Paris (été, UTC+2) : samedi 12/09/2026 à 23 h 30
  const NUIT = sec(2026, 9, 12, 22, 30);   // Paris : dimanche 13/09/2026 à 00 h 30 - encore le 12 en UTC
  const NOUVEL_AN = sec(2026, 12, 31, 23, 30); // Paris (hiver, UTC+1) : vendredi 01/01/2027 à 00 h 30 - encore le 31/12/2026 en UTC
  const MATIN = sec(2026, 1, 5, 8, 0);     // Paris (hiver) : 05/01/2026 à 09 h 00
  const MIDI = sec(2026, 9, 12, 10, 0);    // Paris (été) : 12/09/2026 à 12 h 00
  const NEW_YORK = sec(2026, 9, 13, 2, 15); // New York (été, UTC-4) : 12/09/2026 à 22 h 15 - déjà le 13 en UTC
  const TEMPS_UNIVERSEL = sec(2026, 9, 12, 14, 5); // colonne UTC : 12/09/2026 à 14 h 05
  const JOUR = sec(2026, 9, 12);           // colonne Date : minuit UTC pour son jour civil
  const COLUMNS = {
    Nom: 'Text', Montant: 'Numeric', Libre: 'Text', Jour: 'Date',
    Rdv: 'DateTime:Europe/Paris', Nuit: 'DateTime:Europe/Paris', NouvelAn: 'DateTime:Europe/Paris', Matin: 'DateTime:Europe/Paris', Midi: 'DateTime:Europe/Paris',
    NewYork: 'DateTime:America/New_York', Utc: 'DateTime:UTC', Inde: 'DateTime:Asia/Kolkata', Bizarre: 'DateTime:Pas/Un_Fuseau',
  };
  const ROW = { id: 1, Nom: 'Dupont', Montant: 1200, Libre: '2026-09-12', Jour: JOUR, Rdv: SOIR, Nuit: NUIT, NouvelAn: NOUVEL_AN, Matin: MATIN, Midi: MIDI, NewYork: NEW_YORK, Utc: TEMPS_UNIVERSEL, Inde: SOIR, Bizarre: SOIR };
  const DATE_COLUMNS = ['Jour', 'Rdv', 'Nuit', 'NouvelAn', 'Matin', 'Midi', 'NewYork', 'Utc', 'Inde', 'Bizarre'];
  // La ligne telle que grist.onRecord la livre : un objet Date pour chaque colonne Date et Date et heure.
  const asOnRecord = row => Object.assign({}, row, Object.fromEntries(DATE_COLUMNS.map(c => [c, new Date(row[c] * 1000)])));
  const inLang = async (lang, fn) => { const before = I18n.getLang(); I18n.setLang(lang); try { return await fn(); } finally { I18n.setLang(before); } };

  async function seed(h) {
    await h.resetEditor();
    const stub = window.__gristStub;
    stub.setVariables(TABLE, COLUMNS);
    stub.setRows(TABLE, [ROW]);
    await GristAPI.refreshSchema();
    stub.fireRecord(asOnRecord(ROW), TABLE);
    await h.sleep(60);
  }
  const attr = (name, value) => ` ${name}="${JSON.stringify(value).replace(/"/g, '&quot;')}"`;
  const badge = (column, format) => `<span class="var-badge" data-table="${TABLE}" data-column="${column}" data-key="${TABLE}.${column}"${format ? attr('data-format', format) : ''}></span>`;
  // Le texte d'une valeur dans les deux formes où elle arrive : l'objet Date de grist.onRecord et les secondes de fetchTable.
  const both = (seconds, format, column, opts) => [new Date(seconds * 1000), seconds].map(v => Variables.formatValue(v, format, TABLE, column, opts));
  const same = (list, expected) => list.every(text => text === expected);
  // Les lignes [cas, obtenu, attendu] qui ne tiennent pas.
  const wrongRows = rows => rows.filter(([cas, got, expected]) => got !== expected).map(([cas, got, expected]) => ({ cas, got, expected }));

  // --- 1) La bulle sans réglage : le jour de la colonne, sans heure ---
  cases.push({
    id: 'vardt_a_date_and_time_column_writes_its_day_without_any_setting',
    description: 'Une bulle sans réglage sur une colonne « Date et heure » écrit la date par défaut (« 12/09/2026 »), comme une colonne Date, et non le texte ISO « 2026-09-12T21:30:00.000Z » ; le jour est celui du fuseau de la colonne (Paris, New York, UTC), que la valeur arrive en objet Date (grist.onRecord) ou en secondes (fetchTable) ; même texte dans un champ texte (nom du fichier, objet)',
    run: async (h) => {
      await seed(h);
      const rows = [
        ['Rdv', SOIR, '12/09/2026'], ['Nuit', NUIT, '13/09/2026'], ['NouvelAn', NOUVEL_AN, '01/01/2027'], ['NewYork', NEW_YORK, '12/09/2026'], ['Utc', TEMPS_UNIVERSEL, '12/09/2026'], ['Jour', JOUR, '12/09/2026'],
      ];
      const bad = [];
      for (const [column, seconds, expected] of rows) {
        for (const format of [null, {}]) {
          const shapes = both(seconds, format, column);
          if (!same(shapes, expected)) bad.push({ column, format, shapes, expected });
        }
        const inField = both(seconds, null, column, { rawNumbers: true });
        if (!same(inField, expected)) bad.push({ column, champ: inField, expected });
      }
      const filename = await ReaderMode.resolveFilename(`Rdv_#${TABLE}.Nuit`, TABLE, GristAPI.getCurrentRecord());
      if (filename !== 'Rdv_13_09_2026') bad.push({ filename });
      return { pass: bad.length === 0, notes: JSON.stringify(bad) };
    },
  });

  // --- 2) Un format posé à la main : le jour de la colonne, pas le jour UTC ---
  cases.push({
    id: 'vardt_every_preset_writes_the_day_of_the_column_zone',
    description: 'Les sept formats de date d\'une bulle écrivent le jour du fuseau de la colonne : 00 h 30 à Paris le 13/09 est « 13 septembre 2026 » (et non le 12, jour UTC), le soir du 31/12 UTC est « 1er janvier 2027 » ; « Lettres » écrit « premier janvier deux mille vingt-sept » ; le soir à New York reste le 12',
    run: async (h) => {
      await seed(h);
      const fv = (seconds, preset, column, extra) => Variables.formatValue(new Date(seconds * 1000), Object.assign({ type: 'date', preset }, extra), TABLE, column);
      const nuit = { dmy_slash_full: '13/09/2026', dmy_slash_short: '13/9/26', iso: '2026-09-13', d_mmm_yyyy: '13 sept. 2026', d_mmmm_yyyy: '13 septembre 2026', ddd_d_mmm_yyyy: 'dim. 13 sept. 2026', dddd_d_mmmm_yyyy: 'dimanche 13 septembre 2026' };
      const nouvelAn = { dmy_slash_full: '01/01/2027', dmy_slash_short: '1/1/27', iso: '2027-01-01', d_mmm_yyyy: '1er janv. 2027', d_mmmm_yyyy: '1er janvier 2027', ddd_d_mmm_yyyy: 'ven. 1er janv. 2027', dddd_d_mmmm_yyyy: 'vendredi 1er janvier 2027' };
      const bad = [];
      for (const [preset, expected] of Object.entries(nuit)) { const got = fv(NUIT, preset, 'Nuit'); if (got !== expected) bad.push({ cas: 'Paris 00 h 30 ' + preset, got, expected }); }
      for (const [preset, expected] of Object.entries(nouvelAn)) { const got = fv(NOUVEL_AN, preset, 'NouvelAn'); if (got !== expected) bad.push({ cas: 'Paris 1er janvier ' + preset, got, expected }); }
      const more = [
        ['New York 22 h 15, le 12', fv(NEW_YORK, 'd_mmmm_yyyy', 'NewYork'), '12 septembre 2026'],
        ['UTC', fv(TEMPS_UNIVERSEL, 'd_mmmm_yyyy', 'Utc'), '12 septembre 2026'],
        ['Lettres, 1er janvier', fv(NOUVEL_AN, 'd_mmmm_yyyy', 'NouvelAn', { words: true }), 'premier janvier deux mille vingt-sept'],
        ['Lettres, le 13', fv(NUIT, 'd_mmmm_yyyy', 'Nuit', { words: true }), 'treize septembre deux mille vingt-six'],
        ['jour retiré', fv(NUIT, 'dmy_slash_full', 'Nuit', { day: false }), '09/2026'],
        ['une colonne Date ne bouge pas', fv(JOUR, 'd_mmmm_yyyy', 'Jour'), '12 septembre 2026'],
        ['fuseau inconnu : le jour UTC, sans erreur', fv(SOIR, 'd_mmmm_yyyy', 'Bizarre'), '12 septembre 2026'],
      ];
      bad.push(...wrongRows(more));
      return { pass: bad.length === 0, notes: JSON.stringify(bad) };
    },
  });

  // --- 3) L'heure choisie : l'heure du mur de la colonne ---
  cases.push({
    id: 'vardt_the_hour_choice_writes_the_wall_clock_of_the_column',
    description: 'Avec « 23:30 » ou « 23 h 30 », la bulle écrit l\'heure que le mur du fuseau de la colonne montre, derrière la date (une espace, « à » derrière un mois en lettres) : 23:30 à Paris, 00:30 le lendemain, 22:15 à New York, 03:00 à Kolkata (demi-heure), 14 h 05 en UTC ; les mois et années retirés, « Lettres » (l\'heure reste en chiffres) et le changement d\'heure de Paris suivent',
    run: async (h) => {
      await seed(h);
      const fv = (seconds, format, column) => Variables.formatValue(new Date(seconds * 1000), Object.assign({ type: 'date' }, format), TABLE, column);
      const rows = [
        ['23:30 à Paris', fv(SOIR, { time: 'colon' }, 'Rdv'), '12/09/2026 23:30'],
        ['23 h 30 à Paris', fv(SOIR, { time: 'natural' }, 'Rdv'), '12/09/2026 23 h 30'],
        ['00:30 le lendemain', fv(NUIT, { time: 'colon' }, 'Nuit'), '13/09/2026 00:30'],
        ['0 h 30 le lendemain', fv(NUIT, { time: 'natural' }, 'Nuit'), '13/09/2026 0 h 30'],
        ['09:00 en hiver', fv(MATIN, { time: 'colon' }, 'Matin'), '05/01/2026 09:00'],
        ['9 h 00 en hiver', fv(MATIN, { time: 'natural' }, 'Matin'), '05/01/2026 9 h 00'],
        ['midi', fv(MIDI, { time: 'natural' }, 'Midi'), '12/09/2026 12 h 00'],
        ['New York', fv(NEW_YORK, { time: 'colon' }, 'NewYork'), '12/09/2026 22:15'],
        ['UTC', fv(TEMPS_UNIVERSEL, { time: 'natural' }, 'Utc'), '12/09/2026 14 h 05'],
        ['Kolkata (UTC+5:30)', fv(SOIR, { time: 'colon' }, 'Inde'), '13/09/2026 03:00'],
        ['mois en lettres : « à »', fv(SOIR, { preset: 'd_mmmm_yyyy', time: 'colon' }, 'Rdv'), '12 septembre 2026 à 23:30'],
        ['mois abrégé : « à »', fv(SOIR, { preset: 'd_mmm_yyyy', time: 'natural' }, 'Rdv'), '12 sept. 2026 à 23 h 30'],
        ['jour de la semaine', fv(SOIR, { preset: 'dddd_d_mmmm_yyyy', time: 'colon' }, 'Rdv'), 'samedi 12 septembre 2026 à 23:30'],
        ['ISO : une espace', fv(SOIR, { preset: 'iso', time: 'colon' }, 'Rdv'), '2026-09-12 23:30'],
        ['jj/m/aa', fv(SOIR, { preset: 'dmy_slash_short', time: 'colon' }, 'Rdv'), '12/9/26 23:30'],
        ['1er janvier à 0 h 30', fv(NOUVEL_AN, { preset: 'd_mmmm_yyyy', time: 'natural' }, 'NouvelAn'), '1er janvier 2027 à 0 h 30'],
        ['année retirée', fv(SOIR, { preset: 'd_mmmm_yyyy', year: false, time: 'colon' }, 'Rdv'), '12 septembre à 23:30'],
        ['jour retiré', fv(SOIR, { day: false, time: 'colon' }, 'Rdv'), '09/2026 23:30'],
        ['Lettres : la date seule', fv(SOIR, { preset: 'd_mmmm_yyyy', words: true, time: 'colon' }, 'Rdv'), 'douze septembre deux mille vingt-six à 23:30'],
        ['Lettres, 1er janvier', fv(NOUVEL_AN, { preset: 'd_mmmm_yyyy', words: true, time: 'colon' }, 'NouvelAn'), 'premier janvier deux mille vingt-sept à 00:30'],
        // Paris passe à l'heure d'été le 29/03/2026 : à 00 h 59 UTC il est 01 h 59, une minute plus tard 03 h 00 ; à l'heure d'hiver le 25/10/2026, 00 h 59 UTC est 02 h 59 et 01 h 00 UTC est 02 h 00.
        ['passage à l\'heure d\'été, avant', fv(sec(2026, 3, 29, 0, 59), { time: 'colon' }, 'Rdv'), '29/03/2026 01:59'],
        ['passage à l\'heure d\'été, après', fv(sec(2026, 3, 29, 1, 0), { time: 'colon' }, 'Rdv'), '29/03/2026 03:00'],
        ['passage à l\'heure d\'hiver, avant', fv(sec(2026, 10, 25, 0, 59), { time: 'colon' }, 'Rdv'), '25/10/2026 02:59'],
        ['passage à l\'heure d\'hiver, après', fv(sec(2026, 10, 25, 1, 0), { time: 'colon' }, 'Rdv'), '25/10/2026 02:00'],
        ['les secondes arrivent en objet Date ou en nombre', both(SOIR, { type: 'date', time: 'colon' }, 'Rdv').join(' | '), '12/09/2026 23:30 | 12/09/2026 23:30'],
        ['fuseau inconnu : l\'heure UTC, sans erreur', fv(SOIR, { time: 'colon' }, 'Bizarre'), '12/09/2026 21:30'],
      ];
      const failed = wrongRows(rows);
      return { pass: failed.length === 0, notes: JSON.stringify(failed) };
    },
  });

  // --- 3 bis) L'heure à 12 heures : « 11:30 PM », dans toutes les langues ---
  cases.push({
    id: 'vardt_the_twelve_hour_choice_writes_am_pm_whatever_the_language',
    description: 'Le réglage « 11:30 PM » (ampm) écrit l\'heure du mur de la colonne à 12 heures avec AM / PM, en français comme en anglais (« 23 h 30 » en français n\'est qu\'une autre écriture du 24 heures) : minuit est « 12:30 AM », midi « 12:00 PM », l\'heure sans zéro de tête, la date, le mois en lettres (« à » / « at »), ISO, « Lettres », les mois et années retirés, New York, Kolkata et les changements d\'heure de Paris suivent comme pour « 23:30 » ; « 23:30 » et « 23 h 30 » écrivent comme avant, et en anglais « 23 h 30 » (natural) écrit le même texte que « 11:30 PM »',
    run: async (h) => {
      await seed(h);
      const fv = (seconds, format, column) => Variables.formatValue(new Date(seconds * 1000), Object.assign({ type: 'date' }, format), TABLE, column);
      const ampm = { time: 'ampm' };
      const rows = [
        ['11:30 PM à Paris', fv(SOIR, ampm, 'Rdv'), '12/09/2026 11:30 PM'],
        ['12:30 AM le lendemain', fv(NUIT, ampm, 'Nuit'), '13/09/2026 12:30 AM'],
        ['12:00 AM, minuit pile', fv(sec(2026, 9, 12, 22, 0), ampm, 'Rdv'), '13/09/2026 12:00 AM'],
        ['9:00 AM en hiver', fv(MATIN, ampm, 'Matin'), '05/01/2026 9:00 AM'],
        ['12:00 PM à midi', fv(MIDI, ampm, 'Midi'), '12/09/2026 12:00 PM'],
        ['10:15 PM à New York', fv(NEW_YORK, ampm, 'NewYork'), '12/09/2026 10:15 PM'],
        ['2:05 PM en UTC', fv(TEMPS_UNIVERSEL, ampm, 'Utc'), '12/09/2026 2:05 PM'],
        ['3:00 AM à Kolkata', fv(SOIR, ampm, 'Inde'), '13/09/2026 3:00 AM'],
        ['mois en lettres : « à »', fv(SOIR, { preset: 'd_mmmm_yyyy', time: 'ampm' }, 'Rdv'), '12 septembre 2026 à 11:30 PM'],
        ['mois abrégé : « à »', fv(SOIR, { preset: 'd_mmm_yyyy', time: 'ampm' }, 'Rdv'), '12 sept. 2026 à 11:30 PM'],
        ['ISO : une espace', fv(SOIR, { preset: 'iso', time: 'ampm' }, 'Rdv'), '2026-09-12 11:30 PM'],
        ['jour de la semaine', fv(SOIR, { preset: 'dddd_d_mmmm_yyyy', time: 'ampm' }, 'Rdv'), 'samedi 12 septembre 2026 à 11:30 PM'],
        ['1er janvier à 12:30 AM', fv(NOUVEL_AN, { preset: 'd_mmmm_yyyy', time: 'ampm' }, 'NouvelAn'), '1er janvier 2027 à 12:30 AM'],
        ['année retirée', fv(SOIR, { preset: 'd_mmmm_yyyy', year: false, time: 'ampm' }, 'Rdv'), '12 septembre à 11:30 PM'],
        ['Lettres : la date seule', fv(SOIR, { preset: 'd_mmmm_yyyy', words: true, time: 'ampm' }, 'Rdv'), 'douze septembre deux mille vingt-six à 11:30 PM'],
        ['passage à l\'heure d\'été, après', fv(sec(2026, 3, 29, 1, 0), ampm, 'Rdv'), '29/03/2026 3:00 AM'],
        ['passage à l\'heure d\'hiver, après', fv(sec(2026, 10, 25, 1, 0), ampm, 'Rdv'), '25/10/2026 2:00 AM'],
        ['fuseau inconnu : l\'heure UTC, sans erreur', fv(SOIR, ampm, 'Bizarre'), '12/09/2026 9:30 PM'],
        ['objet Date ou secondes', both(SOIR, { type: 'date', time: 'ampm' }, 'Rdv').join(' | '), '12/09/2026 11:30 PM | 12/09/2026 11:30 PM'],
        ['une colonne Date n\'a pas d\'heure', Variables.formatValue(new Date(JOUR * 1000), { type: 'date', time: 'ampm' }, TABLE, 'Jour'), '12/09/2026'],
        // Les modèles d'avant : les deux autres écritures n'ont pas bougé.
        ['« 23:30 » comme avant', fv(SOIR, { time: 'colon' }, 'Rdv'), '12/09/2026 23:30'],
        ['« 23 h 30 » comme avant', fv(SOIR, { time: 'natural' }, 'Rdv'), '12/09/2026 23 h 30'],
      ];
      const failed = wrongRows(rows);
      // En anglais : la même heure, la date à l'anglaise ; « 23 h 30 » (natural) écrit comme « 11:30 PM » pour chaque instant et chaque format de date.
      const en = await inLang('en', async () => {
        const out = { rows: [], natural: [] };
        out.rows.push(['numérique', fv(SOIR, ampm, 'Rdv'), '09/12/2026, 11:30 PM'], ['mois en lettres', fv(SOIR, { preset: 'd_mmmm_yyyy', time: 'ampm' }, 'Rdv'), 'September 12, 2026 at 11:30 PM'],
          ['minuit passé', fv(NUIT, { preset: 'd_mmmm_yyyy', time: 'ampm' }, 'Nuit'), 'September 13, 2026 at 12:30 AM'], ['ISO', fv(SOIR, { preset: 'iso', time: 'ampm' }, 'Rdv'), '2026-09-12 11:30 PM'],
          ['« 23:30 » reste du 24 heures', fv(SOIR, { time: 'colon' }, 'Rdv'), '09/12/2026, 23:30']);
        for (const preset of VariableFormat.DATE_PRESETS) {
          for (const [seconds, column] of [[SOIR, 'Rdv'], [NUIT, 'Nuit'], [MATIN, 'Matin'], [MIDI, 'Midi'], [NOUVEL_AN, 'NouvelAn']]) {
            const natural = fv(seconds, { preset: preset.key, time: 'natural' }, column);
            const twelve = fv(seconds, { preset: preset.key, time: 'ampm' }, column);
            if (natural !== twelve) out.natural.push({ preset: preset.key, column, natural, twelve });
          }
        }
        return out;
      });
      failed.push(...wrongRows(en.rows));
      if (en.natural.length) failed.push({ natural: en.natural });
      return { pass: failed.length === 0, notes: JSON.stringify(failed) };
    },
  });

  cases.push({
    id: 'vardt_the_hour_choice_follows_the_interface_language',
    description: 'En interface anglaise : « 23:30 » reste « 23:30 », l\'autre écriture est « 11:30 PM » (12 h 30 AM la nuit, 12 h PM à midi), la date numérique prend une virgule (« 09/12/2026, 23:30 »), un mois en lettres « at » (« September 12, 2026 at 11:30 PM »), ISO une espace ; les libellés de la liste suivent',
    run: async (h) => {
      await seed(h);
      const out = await inLang('en', async () => {
        const fv = (seconds, format, column) => Variables.formatValue(new Date(seconds * 1000), Object.assign({ type: 'date' }, format), TABLE, column);
        return {
          rows: [
            ['numérique 24 h', fv(SOIR, { time: 'colon' }, 'Rdv'), '09/12/2026, 23:30'],
            ['numérique 12 h', fv(SOIR, { time: 'natural' }, 'Rdv'), '09/12/2026, 11:30 PM'],
            ['mois en lettres', fv(SOIR, { preset: 'd_mmmm_yyyy', time: 'natural' }, 'Rdv'), 'September 12, 2026 at 11:30 PM'],
            ['mois abrégé, 24 h', fv(SOIR, { preset: 'd_mmm_yyyy', time: 'colon' }, 'Rdv'), 'Sep 12, 2026 at 23:30'],
            ['ISO', fv(SOIR, { preset: 'iso', time: 'natural' }, 'Rdv'), '2026-09-12 11:30 PM'],
            ['minuit passé', fv(NUIT, { preset: 'd_mmmm_yyyy', time: 'natural' }, 'Nuit'), 'September 13, 2026 at 12:30 AM'],
            ['midi', fv(MIDI, { time: 'natural' }, 'Midi'), '09/12/2026, 12:00 PM'],
            ['matin', fv(MATIN, { time: 'natural' }, 'Matin'), '01/05/2026, 9:00 AM'],
            ['colonne Date : pas d\'heure', Variables.formatValue(new Date(JOUR * 1000), { type: 'date', time: 'natural' }, TABLE, 'Jour'), '09/12/2026'],
          ],
          labels: VariableFormat.timeChoices().map(style => style.key + '=' + VariableFormat.timeLabel(style)),
          choices: ['colon', 'natural', 'ampm', 'bogus', '', undefined].map(key => VariableFormat.timeChoiceOf(key)),
          texts: [I18n.t('varFmt.time'), I18n.t('varFmt.timeNone')],
        };
      });
      const frLabels = VariableFormat.timeChoices().map(style => style.key + '=' + VariableFormat.timeLabel(style));
      const frChoices = ['colon', 'natural', 'ampm', 'bogus', '', undefined].map(key => VariableFormat.timeChoiceOf(key));
      const frTexts = [I18n.t('varFmt.time'), I18n.t('varFmt.timeNone')];
      const failed = wrongRows(out.rows);
      // La liste montre chaque écriture une fois : en anglais « natural » et « ampm » écrivent pareil, seul « ampm » (le même dans toutes les langues) est proposé ; un modèle réglé
      // en « natural » y voit l'option qui écrit comme lui.
      const labelsOk = JSON.stringify(out.labels) === JSON.stringify(['colon=23:30', 'ampm=11:30 PM']) && JSON.stringify(frLabels) === JSON.stringify(['colon=23:30', 'natural=23 h 30', 'ampm=11:30 PM']);
      const choicesOk = JSON.stringify(out.choices) === JSON.stringify(['colon', 'ampm', 'ampm', '', '', '']) && JSON.stringify(frChoices) === JSON.stringify(['colon', 'natural', 'ampm', '', '', '']);
      const stylesOk = JSON.stringify(VariableFormat.TIME_STYLES.map(style => style.key)) === JSON.stringify(['colon', 'natural', 'ampm']);
      const textsOk = JSON.stringify(out.texts) === JSON.stringify(['Time', 'No time']) && JSON.stringify(frTexts) === JSON.stringify(['Heure', 'Sans heure']);
      return { pass: failed.length === 0 && labelsOk && choicesOk && stylesOk && textsOk, notes: JSON.stringify({ failed, labels: [out.labels, frLabels], choices: [out.choices, frChoices], styles: stylesOk, texts: [out.texts, frTexts] }) };
    },
  });

  // --- 4) Pas d'heure sans réglage, ni hors d'une colonne « Date et heure » ---
  cases.push({
    id: 'vardt_no_hour_without_the_setting_or_outside_a_date_and_time_column',
    description: 'Sans réglage « Heure » (clé absente, vide, inconnue), la bulle n\'écrit pas l\'heure : les documents d\'avant ne changent pas ; une colonne Date, une colonne Texte ou un appel sans type de colonne l\'ignorent aussi, même si le format porte une heure',
    run: async (h) => {
      await seed(h);
      const bad = [];
      for (const time of [undefined, '', null, 'bogus', 12, 'COLON', 'hm', 'AMPM', 'ampm ']) {
        const got = Variables.formatValue(new Date(SOIR * 1000), { type: 'date', time }, TABLE, 'Rdv');
        if (got !== '12/09/2026') bad.push({ time, got });
      }
      const others = [
        ['colonne Date', Variables.formatValue(new Date(JOUR * 1000), { type: 'date', time: 'colon' }, TABLE, 'Jour'), '12/09/2026'],
        ['colonne Texte', Variables.formatValue('2026-09-12', { type: 'date', time: 'colon' }, TABLE, 'Libre'), '12/09/2026'],
        ['sans type de colonne', VariableFormat.formatDate(SOIR, { type: 'date', time: 'colon' }), '12/09/2026'],
        ['colonne Date, VariableFormat', VariableFormat.formatDate(JOUR, { type: 'date', time: 'natural' }, 'Date'), '12/09/2026'],
        ['la signature d\'avant (deux paramètres) garde le jour UTC', VariableFormat.formatDate(NUIT, { type: 'date', preset: 'd_mmmm_yyyy' }), '12 septembre 2026'],
      ];
      bad.push(...wrongRows(others));
      return { pass: bad.length === 0, notes: JSON.stringify(bad) };
    },
  });

  // --- 5) Le texte que la Lecture écrit (le chemin commun de la Lecture, du PDF, du Word, de l'email) ---
  cases.push({
    id: 'vardt_reader_writes_the_day_and_the_hour_of_the_column',
    description: 'La Lecture (ReaderMode.preview, le chemin commun du PDF, du Word et de l\'email) écrit, pour une ligne livrée par grist.onRecord (objets Date) comme pour la ligne brute de l\'export en lot (fetchTable : des secondes, jamais les secondes écrites telles quelles) : « 12/09/2026 » sans réglage, « 13 septembre 2026 » pour 00 h 30 à Paris, « 12/09/2026 23:30 », « 12 septembre 2026 à 23 h 30 » et « 12 septembre 2026 à 11:30 PM » avec l\'heure ; le nom du fichier et l\'objet restent sans heure sauf réglage posé sur la bulle',
    run: async (h) => {
      await seed(h);
      const record = asOnRecord(ROW);
      const html = '<p>' + [
        badge('Rdv'), badge('Nuit', { type: 'date', preset: 'd_mmmm_yyyy' }), badge('Rdv', { type: 'date', time: 'colon' }),
        badge('Rdv', { type: 'date', preset: 'd_mmmm_yyyy', time: 'natural' }), badge('Jour'), badge('NewYork', { type: 'date', preset: 'iso', time: 'colon' }),
        badge('Rdv', { type: 'date', preset: 'd_mmmm_yyyy', time: 'ampm' }),
      ].join(' ; ') + '</p>';
      const box = document.createElement('div');
      box.innerHTML = await ReaderMode.preview(html, TABLE, record);
      const texts = Array.from(box.querySelectorAll('.resolved-var')).map(e => e.textContent);
      const expected = ['12/09/2026', '13 septembre 2026', '12/09/2026 23:30', '12 septembre 2026 à 23 h 30', '12/09/2026', '2026-09-12 22:15', '12 septembre 2026 à 11:30 PM'];
      const inName = await Variables.resolveVariable(TABLE, 'Rdv', TABLE, record, { type: 'date', time: 'colon' }, { rawNumbers: true });
      // La ligne brute de l'export en lot (fetchTable : des secondes, pas d'objet Date) écrit les mêmes textes.
      const raw = await GristAPI.fetchRowById(TABLE, 1);
      const rawBox = document.createElement('div');
      rawBox.innerHTML = await ReaderMode.preview(html, TABLE, raw);
      const rawTexts = Array.from(rawBox.querySelectorAll('.resolved-var')).map(e => e.textContent);
      const rawInName = await Variables.resolveVariable(TABLE, 'Rdv', TABLE, raw, { type: 'date', time: 'colon' }, { rawNumbers: true });
      const pass = JSON.stringify(texts) === JSON.stringify(expected) && inName === '12/09/2026 23:30' && JSON.stringify(rawTexts) === JSON.stringify(expected) && rawInName === inName;
      return { pass, notes: JSON.stringify({ texts, rawTexts, expected, inName, rawInName }) };
    },
  });

  // --- 6) Un calcul ne lit pas une date, ni une date et heure ---
  cases.push({
    id: 'vardt_a_calculation_refuses_a_date_and_time_column_like_a_date_column',
    description: 'Une colonne « Date et heure » dans un calcul donne le même message qu\'une colonne Date (« … est une date, pas un nombre ») au lieu d\'additionner les secondes de Grist sans que personne ne le voie ; la ligne livrée par fetchTable (secondes) comme celle de grist.onRecord (objet Date)',
    run: async (h) => {
      await seed(h);
      const raw = await GristAPI.fetchRowById(TABLE, 1);
      const out = {};
      for (const [shape, record] of [['onRecord', GristAPI.getCurrentRecord()], ['fetchTable', raw]]) {
        for (const column of ['Jour', 'Rdv']) {
          const r = await Variables.resolveCalcResult(`{${TABLE}.${column}} + 1`, TABLE, record, null, undefined);
          out[shape + ':' + column] = { isError: r.isError, dateMessage: /est une date, pas un nombre/.test(r.text) };
        }
      }
      const pass = Object.values(out).every(r => r.isError && r.dateMessage);
      return { pass, notes: JSON.stringify(out) };
    },
  });

  // --- 7) Les petites fonctions de type ---
  cases.push({
    id: 'vardt_column_type_helpers_know_the_zone_of_a_date_and_time_type',
    description: 'isDateType / isDateTimeType / dateTimeZone lisent « DateTime:Europe/Paris » (fuseau après les deux-points), « DateTime » nu et « Date » ; gristDateToJsDate lit l\'instant sous ses deux formes (l\'objet Date de grist.onRecord, les secondes de fetchTable) ; columnKind range une colonne Date et heure parmi les dates (le format de date suit un changement de colonne) ; wallClock donne le mur du fuseau, changements d\'heure compris ; une condition « = » compte le même jour que celui que la bulle écrit',
    run: async () => {
      const bad = [];
      const types = ['DateTime:Europe/Paris', 'DateTime:UTC', 'DateTime:America/New_York', 'DateTime', 'DateTime:', 'Date', 'Text', 'Numeric', 'Datetime', 'Ref:Rdv', 'RefList:Rdv', '', null, undefined];
      const isDate = types.map(t => VariableFormat.isDateType(t));
      const isDateTime = types.map(t => VariableFormat.isDateTimeType(t));
      if (JSON.stringify(isDate) !== JSON.stringify([true, true, true, true, true, true, false, false, false, false, false, false, false, false])) bad.push({ isDate });
      if (JSON.stringify(isDateTime) !== JSON.stringify([true, true, true, true, true, false, false, false, false, false, false, false, false, false])) bad.push({ isDateTime });
      // Les conditions (ConditionRules) et les formats lisent le fuseau chacun de leur côté : le jour qu'une bulle écrit est celui que sa condition « = » compare.
      const disagree = [];
      for (const type of ['DateTime:Europe/Paris', 'DateTime:America/New_York', 'DateTime:Asia/Kolkata', 'DateTime:UTC', 'DateTime', 'DateTime:Pas/Un_Fuseau']) {
        for (const seconds of [SOIR, NUIT, NOUVEL_AN, NEW_YORK, MATIN]) {
          const day = VariableFormat.formatDate(seconds, { type: 'date', preset: 'iso' }, type);
          if (!ConditionRules.compareValues(new Date(seconds * 1000), '=', day, type)) disagree.push({ type, seconds, day });
        }
      }
      if (disagree.length) bad.push({ disagree });
      if (VariableFormat.dateTimeZone('DateTime:Europe/Paris') !== 'Europe/Paris') bad.push('fuseau de Paris');
      const kinds = ['DateTime:Europe/Paris', 'DateTime', 'Date', 'Text', 'Numeric', 'Bool', 'ChoiceList'].map(t => VariableFormat.columnKind(t));
      if (JSON.stringify(kinds) !== JSON.stringify(['date', 'date', 'date', null, 'number', 'bool', 'list'])) bad.push({ kinds });
      const clock = (seconds, zone) => VariableFormat.wallClock(new Date(seconds * 1000), zone);
      const wall = (c) => `${c.year}-${c.month}-${c.day} ${c.hour}:${c.minute}`;
      const clocks = {
        paris: wall(clock(NUIT, 'Europe/Paris')), utc: wall(clock(NUIT, 'UTC')), vide: wall(clock(NUIT, null)), newYork: wall(clock(NEW_YORK, 'America/New_York')), kolkata: wall(clock(SOIR, 'Asia/Kolkata')),
        inconnu: wall(clock(NUIT, 'Pas/Un_Fuseau')), etéAvant: wall(clock(sec(2026, 3, 29, 0, 59), 'Europe/Paris')), étéAprès: wall(clock(sec(2026, 3, 29, 1, 0), 'Europe/Paris')),
        minuitParis: wall(clock(sec(2026, 9, 11, 22, 0), 'Europe/Paris')),
      };
      const expected = { paris: '2026-9-13 0:30', utc: '2026-9-12 22:30', vide: '2026-9-12 22:30', newYork: '2026-9-12 22:15', kolkata: '2026-9-13 3:0', inconnu: '2026-9-12 22:30', etéAvant: '2026-3-29 1:59', étéAprès: '2026-3-29 3:0', minuitParis: '2026-9-12 0:0' };
      if (JSON.stringify(clocks) !== JSON.stringify(expected)) bad.push({ clocks, expected });
      // Un instant sous ses deux formes (l'objet Date de la ligne affichée, les secondes de la ligne brute) est le même instant ; ce qui n'en est pas un ne donne rien.
      const instants = [new Date(SOIR * 1000), SOIR, new Date(SOIR * 1000).toISOString()].map(v => { const d = VariableFormat.gristDateToJsDate(v); return d && d.getTime(); });
      if (!instants.every(t => t === SOIR * 1000)) bad.push({ instants });
      const unreadable = ['', null, undefined, NaN, Infinity, 'pas une date'].filter(v => VariableFormat.gristDateToJsDate(v) !== null);
      if (unreadable.length) bad.push({ unreadable });
      return { pass: bad.length === 0, notes: JSON.stringify(bad) };
    },
  });

  // --- 8) La barre de la bulle : la liste « Heure » ---
  async function selectBadge(h, column, format) {
    await h.resetEditor();
    window.__gristStub.setVariables(TABLE, COLUMNS);
    await GristAPI.refreshSchema();
    Editor.setHTML('<p>Valeur : ' + badge(column, format) + '</p>');
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
  const timeSelect = () => bar().querySelector('select[data-role="date-time"]');
  const datePanelShown = () => !bar().querySelector('[data-var-panel="date"]').hidden;
  const badgeFormat = () => { let format; EditorCore.getEditor().state.doc.descendants(n => { if (n.type.name === 'varBadge') format = n.attrs.format; }); return format; };
  const choose = async (h, select, value) => { select.value = value; select.dispatchEvent(new Event('input', { bubbles: true })); await h.sleep(80); };

  cases.push({
    id: 'vardt_bar_shows_the_hour_list_only_for_a_date_and_time_column',
    description: 'La barre d\'une bulle sur une colonne « Date et heure » (DateTime:Europe/Paris) montre les réglages de date ET la liste « Heure » (Sans heure, 23:30, 23 h 30, 11:30 PM, « Sans heure » choisi) ; sur une colonne Date, les réglages de date sans la liste ; sur un texte, un nombre, ni l\'un ni l\'autre',
    run: async (h) => {
      const seen = {};
      for (const [id, column] of [['dateTime', 'Rdv'], ['date', 'Jour'], ['text', 'Nom'], ['number', 'Montant']]) {
        const ed = await selectBadge(h, column);
        if (!ed) return { pass: false, notes: 'bulle introuvable pour ' + id };
        const select = timeSelect();
        seen[id] = {
          open: bar().classList.contains('visible'), datePanel: datePanelShown(), hourList: !select.hidden && select.offsetParent !== null,
          options: Array.from(select.options).map(o => o.value + '=' + o.textContent), title: select.title, value: select.value,
        };
      }
      const options = ['=Sans heure', 'colon=23:30', 'natural=23 h 30', 'ampm=11:30 PM'];
      const pass = seen.dateTime.open && seen.dateTime.datePanel && seen.dateTime.hourList && JSON.stringify(seen.dateTime.options) === JSON.stringify(options) && seen.dateTime.title === 'Heure' && seen.dateTime.value === ''
        && seen.date.open && seen.date.datePanel && !seen.date.hourList
        && seen.text.open && !seen.text.datePanel && !seen.text.hourList
        && seen.number.open && !seen.number.datePanel && !seen.number.hourList;
      return { pass, notes: JSON.stringify(seen) };
    },
  });

  cases.push({
    id: 'vardt_bar_hour_list_sets_and_clears_the_hour_of_the_bubble',
    description: 'Choisir « 23:30 » dans la liste « Heure » pose { type: "date", time: "colon" } sans refermer la barre ; changer le format de date garde l\'heure ; la Lecture écrit l\'heure choisie ; « 11:30 PM » pose { time: "ampm" } et la Lecture l\'écrit à 12 heures ; « Sans heure » retire la clé (le format retrouve la forme d\'avant, rien n\'est enregistré dans le modèle) ; la liste montre le réglage de la bulle quand on la sélectionne de nouveau',
    run: async (h) => {
      const ed = await selectBadge(h, 'Rdv');
      if (!ed) return { pass: false, notes: 'bulle introuvable' };
      const steps = {};
      await choose(h, timeSelect(), 'colon');
      steps.colon = { format: badgeFormat(), open: bar().classList.contains('visible'), value: timeSelect().value };
      await choose(h, bar().querySelector('select[data-role="date-preset"]'), 'd_mmmm_yyyy');
      steps.preset = { format: badgeFormat(), value: timeSelect().value };
      const box = document.createElement('div');
      box.innerHTML = await ReaderMode.preview(Editor.getHTML(), TABLE, asOnRecord(ROW));
      steps.read = box.textContent.trim();
      await choose(h, timeSelect(), 'natural');
      steps.natural = { format: badgeFormat(), value: timeSelect().value };
      await choose(h, timeSelect(), 'ampm');
      const ampmBox = document.createElement('div');
      ampmBox.innerHTML = await ReaderMode.preview(Editor.getHTML(), TABLE, asOnRecord(ROW));
      steps.ampm = { format: badgeFormat(), value: timeSelect().value, read: ampmBox.textContent.trim(), open: bar().classList.contains('visible') };
      await choose(h, timeSelect(), '');
      const noneFormat = badgeFormat();
      steps.none = { format: noneFormat, hasKey: !!noneFormat && Object.prototype.hasOwnProperty.call(noneFormat, 'time'), value: timeSelect().value, stored: /time/.test(Editor.getHTML().replace(/datetime/gi, '')), open: bar().classList.contains('visible') };
      // Sélectionner de nouveau la bulle d'un modèle déjà réglé : la liste montre son réglage.
      const again = await selectBadge(h, 'Rdv', { type: 'date', preset: 'd_mmmm_yyyy', time: 'natural' });
      steps.reselect = again ? { value: timeSelect().value, preset: bar().querySelector('select[data-role="date-preset"]').value } : null;
      const againTwelve = await selectBadge(h, 'Rdv', { type: 'date', time: 'ampm' });
      steps.reselectTwelve = againTwelve ? { value: timeSelect().value } : null;
      const json = JSON.stringify;
      const checks = {
        colon: json(steps.colon.format) === '{"type":"date","time":"colon"}' && steps.colon.open && steps.colon.value === 'colon',
        preset: json(steps.preset.format) === '{"type":"date","time":"colon","preset":"d_mmmm_yyyy"}' && steps.preset.value === 'colon',
        read: steps.read === 'Valeur : 12 septembre 2026 à 23:30',
        natural: json(steps.natural.format) === '{"type":"date","time":"natural","preset":"d_mmmm_yyyy"}' && steps.natural.value === 'natural',
        ampm: json(steps.ampm.format) === '{"type":"date","time":"ampm","preset":"d_mmmm_yyyy"}' && steps.ampm.value === 'ampm' && steps.ampm.open && steps.ampm.read === 'Valeur : 12 septembre 2026 à 11:30 PM',
        none: json(steps.none.format) === '{"type":"date","preset":"d_mmmm_yyyy"}' && !steps.none.hasKey && steps.none.value === '' && !steps.none.stored && steps.none.open,
        reselect: !!steps.reselect && steps.reselect.value === 'natural' && steps.reselect.preset === 'd_mmmm_yyyy',
        reselectTwelve: !!steps.reselectTwelve && steps.reselectTwelve.value === 'ampm',
      };
      return { pass: Object.values(checks).every(Boolean), notes: json({ checks, steps }) };
    },
  });

  cases.push({
    id: 'vardt_bar_hour_list_in_english_lists_each_writing_once',
    lang: 'en',
    description: 'Page qui démarre en anglais : la liste « Time » d\'une colonne « Date et heure » propose « No time », « 23:30 » et « 11:30 PM » - chaque écriture une fois, « natural » et « ampm » écrivant pareil en anglais -, la bulle d\'un modèle réglé en « natural » montre « 11:30 PM », choisir « 11:30 PM » pose « ampm » (qui s\'écrit pareil si la page repart en français), la Lecture écrit « 09/12/2026, 11:30 PM » et « 23:30 » reste du 24 heures',
    run: async (h) => {
      const seen = {};
      const ed = await selectBadge(h, 'Rdv', { type: 'date', time: 'natural' });
      if (!ed) return { pass: false, notes: 'bulle introuvable' };
      seen.lang = I18n.getLang();
      seen.options = Array.from(timeSelect().options).map(o => o.value + '=' + o.textContent);
      seen.title = timeSelect().title;
      seen.natural = timeSelect().value;
      await choose(h, timeSelect(), 'colon');
      seen.colon = { format: badgeFormat(), value: timeSelect().value };
      await choose(h, timeSelect(), 'ampm');
      seen.ampm = { format: badgeFormat(), value: timeSelect().value, open: bar().classList.contains('visible') };
      const box = document.createElement('div');
      box.innerHTML = await ReaderMode.preview(Editor.getHTML(), TABLE, asOnRecord(ROW));
      seen.read = box.textContent.trim();
      await choose(h, timeSelect(), 'colon');
      const colonBox = document.createElement('div');
      colonBox.innerHTML = await ReaderMode.preview(Editor.getHTML(), TABLE, asOnRecord(ROW));
      seen.readColon = colonBox.textContent.trim();
      const json = JSON.stringify;
      const checks = {
        lang: seen.lang === 'en',
        options: json(seen.options) === json(['=No time', 'colon=23:30', 'ampm=11:30 PM']) && seen.title === 'Time',
        natural: seen.natural === 'ampm',
        colon: json(seen.colon.format) === '{"type":"date","time":"colon"}' && seen.colon.value === 'colon',
        ampm: json(seen.ampm.format) === '{"type":"date","time":"ampm"}' && seen.ampm.value === 'ampm' && seen.ampm.open,
        read: seen.read === 'Valeur : 09/12/2026, 11:30 PM',
        readColon: seen.readColon === 'Valeur : 09/12/2026, 23:30',
      };
      return { pass: Object.values(checks).every(Boolean), notes: json({ checks, seen }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.varDateTime = cases;
})();
