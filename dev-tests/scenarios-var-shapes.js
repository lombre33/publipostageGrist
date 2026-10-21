// Suite "varShapes" - une même cellule Grist sous les DEUX formes où le widget la reçoit, et le même verdict des deux côtés (étude « angles morts des tests » du 21/10, demandée par Antoine
// après la colonne « Date et heure » : « pourquoi cela n'avait jamais été vu dans les tests unitaires ? »).
//  - la ligne AFFICHÉE (grist.onRecord, expandRefs vrai : objets décodés, valeur affichée d'une Référence) : la Lecture, le PDF, le Word et l'export de la seule ligne courante ;
//  - la ligne BRUTE (fetchTable : GristAPI.fetchRowById / fetchTableRows, drapeau GristAPI.isRawRow) : l'export en lot, les boucles, les tables liées, l'aperçu de la fenêtre de condition ;
//    une Référence y est l'id de la ligne (0 si vide), une liste ["L", …], une date des secondes, et la valeur affichée est dans la colonne d'aide « gristHelper_Display… » de la même table.
// Les formes posées ici sont celles que Grist envoie VRAIMENT : mesurées dans un vrai Grist (grist-static 0.1.6, labo-grist-reel/probe-types-matrix.mjs, 21/10), jamais déduites du code du widget.
// Un cas dit pour quelle carte d'Antoine il est là ; il joue chaque forme avec les mêmes attendus.
(function () {
  const cases = [];

  const attr = (name, value) => ` ${name}="${JSON.stringify(value).replace(/"/g, '&quot;')}"`;
  const badge = (table, column, condition) => `<span class="var-badge" data-table="${table}" data-column="${column}" data-key="${table}.${column}"${condition ? attr('data-condition', condition) : ''}></span>`;
  const rule = (column, operator, value) => ({ column, operator, value: value == null ? '' : value });
  const when = (column, operator, value) => ({ mode: 'all', rules: [rule(column, operator, value)] });
  // Le texte de la Lecture (= PDF = Word) pour une ligne, affichée ou brute.
  async function textOf(html, table, record) {
    const box = document.createElement('div');
    box.innerHTML = await ReaderMode.preview(html, table, record);
    return box.textContent.replace(/\s+/g, ' ').trim();
  }
  // La ligne `id` sous ses deux formes : `shown` (ce que livre grist.onRecord, donné par le cas) et `raw` (ce que livre fetchTable, relu dans le faux Grist et marqué comme tel).
  async function shapesOf(table, shownRows, id) {
    const raw = await GristAPI.fetchRowById(table, id);
    return { displayed: Object.assign({}, shownRows.find(r => r.id === id)), raw };
  }
  async function seed(h, table, columns, rows, displayCols, others) {
    await h.resetEditor();
    const stub = window.__gristStub;
    Object.keys(others || {}).forEach(t => { stub.setVariables(t, others[t].columns); stub.setRows(t, others[t].rows); });
    stub.setVariables(table, columns, null, displayCols || null);
    stub.setRows(table, rows);
    await GristAPI.refreshSchema();
  }
  // Les lignes [forme, ligne, colonne, opérateur, obtenu, attendu] qui ne tiennent pas.
  const wrongRows = rows => rows.filter(r => r[4] !== r[5]).map(([shape, row, column, operator, got, expected]) => ({ shape, row, column, operator, got, expected }));

  // --- Carte « Liste vide » : « est vide » / « n'est pas vide » sur une liste de références ---
  // Mesuré dans un vrai Grist : une liste de références qu'on n'a pas remplie arrive en `[]` sur la ligne affichée ; sur la ligne brute la cellule est vide (undefined dans grist-static,
  // null sur un serveur) et sa colonne d'aide dit ["L"] ; une liste calculée par une formule (lookupRecords sans résultat) dit ["L"] dans la colonne elle-même, sans colonne d'aide.
  // Avant la correction, `[]` n'était ni null ni '' : « est vide » ne se déclenchait jamais, « n'est pas vide » toujours.
  cases.push({
    id: 'vshape_an_empty_reference_list_is_empty_in_both_shapes',
    description: 'Carte « Liste vide » : « est vide » est vrai et « n\'est pas vide » faux pour une liste de références sans élément, qu\'elle soit saisie (cellule vide, colonne d\'aide ["L"]) ou calculée par une formule (["L"] sans colonne d\'aide), sur la ligne affichée comme sur la ligne brute ; l\'inverse pour une liste qui a des éléments ; et le bloc « Aucune remise » de la Lecture ne s\'écrit que sans remise',
    run: async (h) => {
      const T = 'VsListes';
      const columns = { Titre: 'Text', Remises: 'RefList:VsRemises', Calculee: 'RefList:VsRemises', gristHelper_Display: 'Any' };
      const rows = [
        { id: 1, Titre: 'Devis A', Remises: ['L', 1, 2], Calculee: ['L', 1], gristHelper_Display: ['L', 'Fidélité', 'Été'] },
        { id: 2, Titre: 'Devis B', Remises: null, Calculee: ['L'], gristHelper_Display: ['L'] },
      ];
      const shown = [
        { id: 1, Titre: 'Devis A', Remises: ['Fidélité', 'Été'], Calculee: [1] },
        { id: 2, Titre: 'Devis B', Remises: [], Calculee: [] },
      ];
      await seed(h, T, columns, rows, { Remises: 'gristHelper_Display' }, { VsRemises: { columns: { Nom: 'Text' }, rows: [{ id: 1, Nom: 'Fidélité' }, { id: 2, Nom: 'Été' }] } });
      const bad = [];
      const flags = [];
      for (const id of [1, 2]) {
        const { displayed, raw } = await shapesOf(T, shown, id);
        flags.push(GristAPI.isRawRow(displayed), GristAPI.isRawRow(raw));
        const hasItems = id === 1;
        for (const [shape, record] of [['affichée', displayed], ['brute', raw]]) {
          for (const column of ['Remises', 'Calculee']) {
            bad.push(...wrongRows([
              [shape, id, column, 'vide', await ConditionRules.matches(rule(column, 'vide'), T, record), !hasItems],
              [shape, id, column, 'non vide', await ConditionRules.matches(rule(column, 'non vide'), T, record), hasItems],
            ]));
          }
        }
        const html = `<p>[${badge(T, 'Titre', when('Remises', 'vide'))}] [${badge(T, 'Titre', when('Remises', 'non vide'))}]</p>`;
        const expected = hasItems ? '[] [Devis A]' : '[Devis B] []';
        for (const [shape, record] of [['affichée', displayed], ['brute', raw]]) {
          const got = await textOf(html, T, record);
          if (got !== expected) bad.push({ shape, row: id, lecture: got, expected });
        }
      }
      const shapesOk = JSON.stringify(flags) === '[false,true,false,true]';
      return { pass: shapesOk && bad.length === 0, notes: JSON.stringify({ shapesOk, bad }) };
    },
  });

  // --- Carte « Virgule » : la virgule décimale dans la valeur d'une règle ---
  // Mesuré dans un vrai Grist sur une colonne qui vaut 1234,5 : « = 1234,5 », « = 1234,50 », « > 99,5 » et « ≤ 1234,5 » donnaient faux, « ≠ 1234,5 » vrai, par les deux chemins (la même
  // comparaison sert la ligne affichée et la ligne brute) ; avec le point tout était juste. Une colonne Texte garde la comparaison de texte.
  cases.push({
    id: 'vshape_a_decimal_comma_in_a_rule_value_reads_as_a_point_in_both_shapes',
    description: 'Carte « Virgule » : « Total > 99,5 », « = 1234,5 », « = 1234,50 », « ≤ 1234,5 » et « ≠ 1234,5 » se lisent comme avec le point sur une colonne Numérique ou Entier, sur la ligne affichée comme sur la ligne brute ; une colonne Texte garde la comparaison de texte ; et la bulle « Remise exceptionnelle » de la Lecture ne s\'écrit que si le total dépasse 99,5',
    run: async (h) => {
      const T = 'VsMontants';
      const columns = { Titre: 'Text', Total: 'Numeric', Quantite: 'Int', Libelle: 'Text', Creux: 'Numeric' };
      const rows = [{ id: 1, Titre: 'Devis A', Total: 1234.5, Quantite: 42, Libelle: '1234,5', Creux: null }, { id: 2, Titre: 'Devis B', Total: 50, Quantite: 3, Libelle: '12,5', Creux: null }];
      await seed(h, T, columns, rows);
      const bad = [];
      const { displayed, raw } = await shapesOf(T, rows, 1);
      const expectations = [
        ['Total', '=', '1234,5', true], ['Total', '=', '1234,50', true], ['Total', '≠', '1234,5', false], ['Total', '>', '99,5', true], ['Total', '<', '99,5', false],
        ['Total', '≥', '1234,5', true], ['Total', '≤', '1234,5', true], ['Total', '<', '1300,5', true], ['Total', '=', '1234.5', true],
        ['Quantite', '>', '9,5', true], ['Quantite', '=', '42,0', true],
        ['Libelle', '=', '1234,5', true], ['Libelle', '>', '9,5', false], ['Creux', '=', '0,5', false],
      ];
      for (const [shape, record] of [['affichée', displayed], ['brute', raw]]) {
        for (const [column, operator, value, expected] of expectations) {
          bad.push(...wrongRows([[shape, 1, column, operator + ' ' + value, await ConditionRules.matches(rule(column, operator, value), T, record), expected]]));
        }
      }
      const html = `<p>Remise : ${badge(T, 'Titre', when('Total', '>', '99,5'))}.</p>`;
      for (const [shape, record, expected] of [['affichée', displayed, 'Remise : Devis A.'], ['brute', raw, 'Remise : Devis A.']]) {
        const got = await textOf(html, T, record);
        if (got !== expected) bad.push({ shape, ligne: 1, lecture: got, expected });
      }
      const small = await shapesOf(T, rows, 2);
      for (const [shape, record] of [['affichée', small.displayed], ['brute', small.raw]]) {
        const got = await textOf(html, T, record);
        if (got !== 'Remise :.') bad.push({ shape, ligne: 2, lecture: got, expected: 'Remise :.' }); // la bulle masquée emporte l'espace qui la précède (js/space-gap.js)
      }
      return { pass: bad.length === 0, notes: JSON.stringify(bad) };
    },
  });

  // --- Cartes « Référence » : une Référence qui montre un numéro, l'identifiant de ligne, un Oui / Non ou une date ---
  // Les formes que Grist envoie (mesurées dans un vrai Grist, grist-static 0.1.6, labo-grist-reel/probe-types-matrix.mjs et probe-types-extra3.mjs, 21/10) :
  //  - ligne affichée (grist.onRecord) : un texte montré arrive en texte ; un NOMBRE montré, ou l'identifiant de ligne, arrive en objet Reference { tableId, rowId } dont `rowId` est le nombre
  //    (0 aussi bien pour une Référence vide que pour une ligne dont le nombre est 0) ; une DATE arrive en GristDate (jour, minuit UTC) ou GristDateTime (instant, `timezone`), null si elle est vide ;
  //    un Oui / Non en booléen (false aussi pour une Référence vide) ; une liste en tableau de ces valeurs (un trou : undefined) ;
  //  - ligne brute (fetchTable) : l'identifiant de la ligne référencée (0 si vide), la valeur montrée dans la colonne d'aide « gristHelper_Display… » (une date y est ['d', secondes] ou
  //    ['D', secondes, fuseau], une liste ['L', …]).
  // Les classes ci-dessous ont le nom et les propriétés que le vrai grist-plugin-api donne (objtypes.ts), pas ceux que le widget a décidés.
  class Reference { constructor(tableId, rowId) { this.tableId = tableId; this.rowId = rowId; } toString() { return this.tableId + '[' + this.rowId + ']'; } }
  class GristDate extends Date { toString() { return this.toISOString().slice(0, 10); } }
  class GristDateTime extends Date { constructor(ms, timezone) { super(ms); this.timezone = timezone; } toString() { return this.toISOString(); } }
  const day = (y, m, d) => new GristDate(Date.UTC(y, m - 1, d));
  const instant = (y, m, d, h, mi, timezone) => new GristDateTime(Date.UTC(y, m - 1, d, h, mi), timezone);
  const secs = (y, m, d, h, mi) => Date.UTC(y, m - 1, d, h || 0, mi || 0) / 1000;

  // Les cases de la première ligne du classeur .xlsx fabriqué pour `record`, relues dans le fichier même : { A1: { kind: 'text' | 'number' | 'empty', value } }.
  async function excelCells(html, table, record) {
    const { blob } = await XlsxExport.getXlsxBlobForRecord(html, table, record, '');
    await ExportCommon.ensureJsZipLoaded();
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const parse = async name => (zip.file(name) ? new DOMParser().parseFromString(await zip.file(name).async('string'), 'application/xml') : null);
    const strings = await parse('xl/sharedStrings.xml');
    const shared = strings ? Array.from(strings.getElementsByTagName('si')).map(si => Array.from(si.getElementsByTagName('t')).map(t => t.textContent).join('')) : [];
    const cells = {};
    Array.from((await parse('xl/worksheets/sheet1.xml')).getElementsByTagName('c')).forEach(c => {
      const v = c.getElementsByTagName('v')[0];
      const value = !v ? null : (c.getAttribute('t') === 's' ? shared[Number(v.textContent)] : Number(v.textContent));
      cells[c.getAttribute('r')] = { kind: value === null ? 'empty' : (typeof value === 'number' ? 'number' : 'text'), value };
    });
    return new Proxy(cells, { get: (target, ref) => target[ref] || { kind: 'empty', value: null } });
  }
  // Un tableau d'une ligne dont chaque case ne contient que la bulle de `columns` : la forme où l'export Excel écrit une vraie valeur typée.
  const rowOfBadges = (table, columns) => '<table><tbody><tr>' + columns.map(c => `<td><p>${badge(table, c)}</p></td>`).join('') + '</tr></tbody></table>';
  const CELL = ['A1', 'B1', 'C1', 'D1', 'E1'];
  // Les verdicts d'une règle sur les lignes `ids`, par forme : [forme, ligne, colonne, opérateur, obtenu, attendu] pour wrongRows ; un attendu `undefined` n'est pas contrôlé.
  async function ruleRows(table, ids, shapes, rules) {
    const out = [];
    for (const [column, operator, value, expected] of rules) {
      for (const id of ids) {
        for (const [shape, record] of [['affichée', shapes[id].displayed], ['brute', shapes[id].raw]]) {
          const want = expected[ids.indexOf(id)];
          if (want === undefined) continue;
          // `value` : un texte tapé, ou { valueColumn } pour comparer à une autre colonne de la même ligne.
          const made = value && typeof value === 'object' ? { column, operator, valueColumn: value.valueColumn } : rule(column, operator, value);
          out.push([shape, id, column, operator + ' ' + (made.valueColumn ? '[' + made.valueColumn + ']' : value), await ConditionRules.matches(made, table, record), want]);
        }
      }
    }
    return out;
  }
  // Le texte de la Lecture d'une ligne pour des colonnes séparées par « | » (aucune espace : une bulle vide n'en emporte pas), par forme.
  const barLine = (table, columns) => '<p>' + columns.map(c => badge(table, c)).join('|') + '</p>';

  // --- Carte « Référence » (nombres) ---
  // Avant la correction la ligne affichée écrivait « Produits[2024] » (le texte de l'objet Reference) et « Produits[0] » pour une Référence vide, ne se disait jamais vide, et un calcul dessus
  // échouait (« contient « Produits[2024] », qui n'est pas un nombre ») ; la ligne du lot écrivait 2024 et rien. Maintenant : le nombre, et rien pour une Référence qui ne désigne aucune ligne.
  cases.push({
    id: 'vshape_a_reference_showing_a_number_writes_the_number_in_both_shapes',
    description: 'Carte « Référence » : une Référence qui montre un nombre (ou l\'identifiant de ligne) écrit « 2024 », pas « Produits[2024] », rien quand elle ne désigne aucune ligne, « 0 » quand la ligne désignée vaut 0 ; un Oui / Non montré n\'écrit « faux » que pour une vraie ligne à faux ; les règles (= 2024, > 2000, vide), le calcul (+ 1) et la case Excel disent la même chose sur la ligne affichée et sur la ligne brute',
    run: async (h) => {
      const T = 'VsNumeros';
      const columns = { Titre: 'Text', Annee: 'Ref:VsArticles', gristHelper_Display: 'Any', Rang: 'Ref:VsArticles', Prix: 'Ref:VsArticles', gristHelper_Display2: 'Any', Actif: 'Ref:VsArticles', gristHelper_Display3: 'Any' };
      // Annee montre le Numero (Int) d'un article, Rang son identifiant de ligne (aucune colonne d'aide), Prix son prix (Numeric), Actif son Oui / Non.
      // Ligne 1 : tout renseigné. Ligne 2 : Annee, Rang et Actif ne désignent rien (id 0), Prix désigne l'article 3 dont le prix est 0. Ligne 3 : Annee désigne l'article 4 dont le Numero est 0, Prix ne désigne rien, Actif désigne un article à faux.
      const rows = [
        { id: 1, Titre: 'Devis A', Annee: 1, gristHelper_Display: 2024, Rang: 1, Prix: 1, gristHelper_Display2: 1.5, Actif: 1, gristHelper_Display3: true },
        { id: 2, Titre: 'Devis B', Annee: 0, gristHelper_Display: 0, Rang: 0, Prix: 3, gristHelper_Display2: 0, Actif: 0, gristHelper_Display3: false },
        { id: 3, Titre: 'Devis C', Annee: 4, gristHelper_Display: 0, Rang: 4, Prix: 0, gristHelper_Display2: 0, Actif: 2, gristHelper_Display3: false },
      ];
      const ref = n => new Reference('VsArticles', n);
      const shown = [
        { id: 1, Titre: 'Devis A', Annee: ref(2024), Rang: ref(1), Prix: ref(1.5), Actif: true },
        { id: 2, Titre: 'Devis B', Annee: ref(0), Rang: ref(0), Prix: ref(0), Actif: false },
        { id: 3, Titre: 'Devis C', Annee: ref(0), Rang: ref(4), Prix: ref(0), Actif: false },
      ];
      const articles = { columns: { Nom: 'Text', Numero: 'Int', Prix: 'Numeric', Actif: 'Bool' }, rows: [{ id: 1, Nom: 'Stylo', Numero: 2024, Prix: 1.5, Actif: true }, { id: 2, Nom: 'Cahier', Numero: 2025, Prix: 3, Actif: false }, { id: 3, Nom: 'Règle', Numero: 2026, Prix: 0, Actif: true }, { id: 4, Nom: 'Gomme', Numero: 0, Prix: 2.25, Actif: false }] };
      await seed(h, T, columns, rows, { Annee: 'gristHelper_Display', Prix: 'gristHelper_Display2', Actif: 'gristHelper_Display3' }, { VsArticles: articles });
      const ids = [1, 2, 3];
      const shapes = {};
      for (const id of ids) shapes[id] = await shapesOf(T, shown, id);
      const bad = [];
      // Ce que le document écrit, colonne par colonne et ligne par ligne.
      const COLUMNS = ['Annee', 'Rang', 'Prix', 'Actif'];
      const WRITES = { 1: '2024|1|1.5|vrai', 2: '||0|', 3: '0|4||faux' };
      for (const id of ids) {
        for (const [shape, record] of [['affichée', shapes[id].displayed], ['brute', shapes[id].raw]]) {
          const got = await textOf(barLine(T, COLUMNS), T, record);
          if (got !== WRITES[id]) bad.push({ lecture: shape, row: id, got, expected: WRITES[id] });
        }
      }
      // Les règles : un nombre se compare comme un nombre, « vide » ne dit vrai que pour une Référence qui ne désigne rien (le 0 de l'article 4 est une valeur).
      const RULES = [
        ['Annee', '=', '2024', [true, false, false]], ['Annee', '>', '2000', [true, false, false]], ['Annee', '=', '0', [false, false, true]],
        ['Annee', 'vide', '', [false, true, false]], ['Annee', 'non vide', '', [true, false, true]],
        ['Rang', '=', '1', [true, false, false]], ['Rang', '=', '4', [false, false, true]], ['Rang', 'vide', '', [false, true, false]],
        ['Prix', '=', '1.5', [true, false, false]], ['Prix', '=', '1,5', [true, false, false]], ['Prix', '=', '0', [false, true, false]], ['Prix', 'vide', '', [false, false, true]],
        ['Actif', 'vide', '', [false, true, false]], ['Actif', 'non vide', '', [true, false, true]],
      ];
      bad.push(...wrongRows(await ruleRows(T, ids, shapes, RULES)));
      // Le calcul : « Annee + 1 » est un nombre pour une Référence qui montre un nombre.
      const calc = `<p><span class="calc-badge" data-formula="{${T}.Annee} + 1"></span></p>`;
      const CALC = { 1: '2' + String.fromCharCode(32) + '025', 3: '1' }; // textOf range l'espace insécable des milliers en espace ordinaire
      const calcs = {};
      for (const id of ids) {
        for (const [shape, record] of [['affichée', shapes[id].displayed], ['brute', shapes[id].raw]]) {
          const got = await textOf(calc, T, record);
          (calcs[id] = calcs[id] || []).push(got);
          if (CALC[id] !== undefined && got !== CALC[id]) bad.push({ calcul: shape, row: id, got, expected: CALC[id] });
        }
        if (calcs[id][0] !== calcs[id][1]) bad.push({ calcul: 'les deux formes divergent', row: id, affichée: calcs[id][0], brute: calcs[id][1] });
      }
      // La case Excel : le même texte (la Référence n'a pas le type d'un nombre, c'est du texte), vide quand rien ne s'écrit.
      for (const id of ids) {
        const want = WRITES[id].split('|');
        for (const [shape, record] of [['affichée', shapes[id].displayed], ['brute', shapes[id].raw]]) {
          const cells = await excelCells(rowOfBadges(T, COLUMNS), T, record);
          COLUMNS.forEach((c, i) => {
            const cell = cells[CELL[i]];
            const got = cell.value === null ? '' : String(cell.value);
            if (got !== want[i] || cell.kind === 'number') bad.push({ excel: shape, row: id, column: c, got, kind: cell.kind, expected: want[i] });
          });
        }
      }
      return { pass: bad.length === 0, notes: JSON.stringify(bad) };
    },
  });

  // --- Carte « Référence » (dates) ---
  // Une table de dates (VsJalons : Lancement est une Date, Quand une Date et heure à Paris) et une table de page dont trois colonnes en montrent : Jalon (Lancement), Moment (Quand), Jalons (liste des Lancement).
  // Ligne 1 : tout renseigné. Ligne 2 : rien (Références vides). Ligne 3 : les Références désignent un jalon sans date. Ligne 4 : le soir du 31/12 à Paris (23 h 30 UTC) est déjà le 01/01/2027 à Paris.
  const DATES = 'VsRdv';
  async function seedDates(h) {
    const columns = { Titre: 'Text', Jalon: 'Ref:VsJalons', gristHelper_Display: 'Any', Moment: 'Ref:VsJalons', gristHelper_Display2: 'Any', Jalons: 'RefList:VsJalons', gristHelper_Display3: 'Any' };
    const rows = [
      { id: 1, Titre: 'Rdv A', Jalon: 2, gristHelper_Display: ['d', secs(2026, 9, 12)], Moment: 1, gristHelper_Display2: ['D', secs(2026, 9, 12, 21, 30), 'Europe/Paris'], Jalons: ['L', 1, 2], gristHelper_Display3: ['L', ['d', secs(2026, 3, 1)], ['d', secs(2026, 9, 12)]] },
      { id: 2, Titre: 'Rdv B', Jalon: 0, gristHelper_Display: null, Moment: 0, gristHelper_Display2: null, Jalons: null, gristHelper_Display3: ['L'] },
      { id: 3, Titre: 'Rdv C', Jalon: 3, gristHelper_Display: null, Moment: 3, gristHelper_Display2: null, Jalons: ['L', 3], gristHelper_Display3: ['L', null] },
      { id: 4, Titre: 'Rdv D', Jalon: 4, gristHelper_Display: ['d', secs(2026, 1, 1)], Moment: 4, gristHelper_Display2: ['D', secs(2026, 12, 31, 23, 30), 'Europe/Paris'], Jalons: ['L', 1, 4], gristHelper_Display3: ['L', ['d', secs(2026, 3, 1)], ['d', secs(2026, 1, 1)]] },
    ];
    const shown = [
      { id: 1, Titre: 'Rdv A', Jalon: day(2026, 9, 12), Moment: instant(2026, 9, 12, 21, 30, 'Europe/Paris'), Jalons: [day(2026, 3, 1), day(2026, 9, 12)] },
      { id: 2, Titre: 'Rdv B', Jalon: null, Moment: null, Jalons: [] },
      { id: 3, Titre: 'Rdv C', Jalon: null, Moment: null, Jalons: [undefined] },
      { id: 4, Titre: 'Rdv D', Jalon: day(2026, 1, 1), Moment: instant(2026, 12, 31, 23, 30, 'Europe/Paris'), Jalons: [day(2026, 3, 1), day(2026, 1, 1)] },
    ];
    const jalons = { columns: { Lancement: 'Date', Quand: 'DateTime:Europe/Paris' }, rows: [
      { id: 1, Lancement: secs(2026, 3, 1), Quand: secs(2026, 9, 12, 21, 30) }, { id: 2, Lancement: secs(2026, 9, 12), Quand: null },
      { id: 3, Lancement: null, Quand: null }, { id: 4, Lancement: secs(2026, 1, 1), Quand: secs(2026, 12, 31, 23, 30) },
    ] };
    await seed(h, DATES, columns, rows, { Jalon: 'gristHelper_Display', Moment: 'gristHelper_Display2', Jalons: 'gristHelper_Display3' }, { VsJalons: jalons });
    const shapes = {};
    for (const id of [1, 2, 3, 4]) shapes[id] = await shapesOf(DATES, shown, id);
    return shapes;
  }

  cases.push({
    id: 'vshape_a_reference_showing_a_date_writes_the_day_in_both_shapes',
    description: 'Carte « Référence » : une Référence ou une liste de références qui montre une date ou une date et heure écrit « 12/09/2026 » (le jour dans le fuseau de la colonne montrée : 23 h 30 UTC le 31/12 est le 01/01/2027 à Paris), rien quand elle est vide ; les règles (= 12/09/2026, = 2026-09-12, >, <, vide) comparent le jour, un calcul dessus dit « c\'est une date » comme sur une colonne Date, et la case Excel écrit le même texte, sur la ligne affichée comme sur la ligne brute',
    run: async (h) => {
      const shapes = await seedDates(h);
      const ids = [1, 2, 3, 4];
      const bad = [];
      const COLUMNS = ['Jalon', 'Moment', 'Jalons'];
      const WRITES = { 1: '12/09/2026|12/09/2026|01/03/2026, 12/09/2026', 2: '||', 3: '||', 4: '01/01/2026|01/01/2027|01/03/2026, 01/01/2026' };
      for (const id of ids) {
        for (const [shape, record] of [['affichée', shapes[id].displayed], ['brute', shapes[id].raw]]) {
          const got = await textOf(barLine(DATES, COLUMNS), DATES, record);
          if (got !== WRITES[id]) bad.push({ lecture: shape, row: id, got, expected: WRITES[id] });
        }
      }
      // Le jour se compare au jour : « = 12/09/2026 » comme « = 2026-09-12 » ; Moment se lit à Paris (ligne 4 : 01/01/2027, pas 31/12/2026) ; une liste est « = » quand un élément l'est. Un attendu `undefined`
      // n'est pas contrôlé : « < » sur une date vide (un texte vide est avant tout texte, comme pour une colonne Date) et « vide » sur la liste de la ligne 3, qui ne contient qu'un trou.
      const RULES = [
        ['Jalon', '=', '12/09/2026', [true, false, false, false]], ['Jalon', '=', '2026-09-12', [true, false, false, false]], ['Jalon', '≠', '12/09/2026', [false, true, true, true]],
        ['Jalon', '>', '01/06/2026', [true, false, false, false]], ['Jalon', '<', '01/06/2026', [false, undefined, undefined, true]], ['Jalon', '≥', '01/01/2026', [true, false, false, true]],
        ['Jalon', 'vide', '', [false, true, true, false]], ['Jalon', 'non vide', '', [true, false, false, true]],
        ['Moment', '=', '12/09/2026', [true, false, false, false]], ['Moment', '=', '01/01/2027', [false, false, false, true]], ['Moment', '=', '31/12/2026', [false, false, false, false]],
        ['Moment', 'vide', '', [false, true, true, false]],
        ['Jalons', '=', '12/09/2026', [true, false, false, false]], ['Jalons', '=', '01/01/2026', [false, false, false, true]], ['Jalons', '≠', '12/09/2026', [false, true, true, true]],
        ['Jalons', 'vide', '', [false, true, undefined, false]],
        // Une colonne contre une autre : le jour de Jalon contre le jour de Moment (à Paris), deux cellules vides sont égales, une seule vide les distingue.
        ['Jalon', '=', { valueColumn: 'Moment' }, [true, true, true, false]], ['Jalon', '<', { valueColumn: 'Moment' }, [false, false, false, true]], ['Jalon', '≠', { valueColumn: 'Moment' }, [false, false, false, true]],
      ];
      bad.push(...wrongRows(await ruleRows(DATES, ids, shapes, RULES)));
      // Le calcul : une date n'est pas un nombre, comme pour une colonne Date (formula.error.dateColumn) ; la ligne vide ne calcule rien de plus sur l'une que sur l'autre.
      const calc = `<p><span class="calc-badge" data-formula="{${DATES}.Jalon} + 1"></span></p>`;
      const dateError = /est une date, pas un nombre/;
      const calcs = {};
      for (const id of ids) {
        for (const [shape, record] of [['affichée', shapes[id].displayed], ['brute', shapes[id].raw]]) (calcs[id] = calcs[id] || []).push(await textOf(calc, DATES, record));
        if (calcs[id][0] !== calcs[id][1]) bad.push({ calcul: 'les deux formes divergent', row: id, affichée: calcs[id][0], brute: calcs[id][1] });
      }
      [1, 4].forEach(id => { if (!dateError.test(calcs[id][0])) bad.push({ calcul: 'affichée', row: id, got: calcs[id][0], expected: 'une erreur « est une date »' }); });
      // La case Excel : du texte, le même que la Lecture (la Référence n'a pas le type d'une date), vide quand rien ne s'écrit.
      for (const id of ids) {
        const want = WRITES[id].split('|');
        for (const [shape, record] of [['affichée', shapes[id].displayed], ['brute', shapes[id].raw]]) {
          const cells = await excelCells(rowOfBadges(DATES, COLUMNS), DATES, record);
          COLUMNS.forEach((c, i) => {
            const cell = cells[CELL[i]];
            const got = cell.value === null ? '' : String(cell.value);
            if (got !== want[i] || cell.kind === 'number') bad.push({ excel: shape, row: id, column: c, got, kind: cell.kind, expected: want[i] });
          });
        }
      }
      return { pass: bad.length === 0, notes: JSON.stringify(bad) };
    },
  });

  // Les boucles lisent les lignes brutes : filtrer et trier une table par une colonne Référence qui montre une date, et écrire la date de chaque tour d'une zone « liste de références ».
  cases.push({
    id: 'vshape_a_loop_filters_sorts_and_writes_references_that_show_a_date',
    description: 'Carte « Référence » : une boucle sur toutes les lignes filtre sur le jour d\'une Référence qui montre une date (= 12/09/2026, < 01/06/2026, vide), la trie dans l\'ordre du calendrier (les vides en bas, dans les deux sens), et la bulle d\'une liste de références de dates écrit à chaque tour la date de la fiche (« 01/03/2026 et 12/09/2026 »)',
    run: async (h) => {
      const shapes = await seedDates(h);
      const bad = [];
      const loopOf = extra => LoopRules.normalizeLoop(Object.assign({ repeat: 'row', table: DATES, all: 'table', empty: 'header' }, extra));
      const idsOf = async loop => (await LoopRules.iterate(loop, DATES, shapes[1].displayed, LoopRules.createContext())).items.map(item => item.row.id);
      const filterOf = rules => ({ mode: 'all', rules: rules.map(([operator, value]) => ({ column: 'Jalon', operator, value })) });
      const FILTERS = [[[['=', '12/09/2026']], [1]], [[['=', '2026-09-12']], [1]], [[['non vide', ''], ['<', '01/06/2026']], [4]], [[['>', '01/06/2026']], [1]], [[['vide', '']], [2, 3]], [[['non vide', '']], [1, 4]]];
      for (const [rules, expected] of FILTERS) {
        const got = await idsOf(loopOf({ filter: filterOf(rules) }));
        if (JSON.stringify(got) !== JSON.stringify(expected)) bad.push({ filtre: rules.map(r => r.join(' ')).join(' et '), got, expected });
      }
      for (const [direction, expected] of [['asc', [4, 1, 2, 3]], ['desc', [1, 4, 2, 3]]]) {
        const got = await idsOf(loopOf({ sort: { column: 'Jalon', direction } }));
        if (JSON.stringify(got) !== JSON.stringify(expected)) bad.push({ tri: direction, got, expected });
      }
      // La liste de références Jalons : la bulle de la colonne, dans la zone « dans la phrase », écrit la date de chaque fiche.
      const inline = { repeat: 'inline', table: 'VsJalons', via: { table: DATES, column: 'Jalons' }, empty: 'hide', separator: ', ', lastSeparator: ' et ' };
      const html = `<p>Jalons : ${badge(DATES, 'Jalons').replace('class="var-badge"', 'class="var-badge"' + attr('data-loop', inline))}.</p>`;
      for (const [id, expected] of [[1, 'Jalons : 01/03/2026 et 12/09/2026.'], [4, 'Jalons : 01/03/2026 et 01/01/2026.']]) {
        for (const [shape, record] of [['affichée', shapes[id].displayed], ['brute', shapes[id].raw]]) {
          const got = await textOf(html, DATES, record);
          if (got !== expected) bad.push({ boucle: shape, row: id, got, expected });
        }
      }
      return { pass: bad.length === 0, notes: JSON.stringify(bad) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.varShapes = cases;
})();
