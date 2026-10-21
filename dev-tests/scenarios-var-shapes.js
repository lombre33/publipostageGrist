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

  // Les cases de la première ligne du classeur .xlsx fabriqué pour `record`, relues dans le fichier même : { A1: { kind: 'text' | 'number' | 'empty', value, fmt } } (`fmt` : le format de nombre de la case,
  // « General » sans format).
  async function excelCells(html, table, record) {
    const { blob } = await XlsxExport.getXlsxBlobForRecord(html, table, record, '');
    await ExportCommon.ensureJsZipLoaded();
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const parse = async name => (zip.file(name) ? new DOMParser().parseFromString(await zip.file(name).async('string'), 'application/xml') : null);
    const strings = await parse('xl/sharedStrings.xml');
    const shared = strings ? Array.from(strings.getElementsByTagName('si')).map(si => Array.from(si.getElementsByTagName('t')).map(t => t.textContent).join('')) : [];
    const styles = await parse('xl/styles.xml');
    const codes = {};
    Array.from(styles.getElementsByTagName('numFmt')).forEach(n => { codes[n.getAttribute('numFmtId')] = n.getAttribute('formatCode'); });
    const formats = Array.from(styles.getElementsByTagName('cellXfs')[0].getElementsByTagName('xf')).map(xf => {
      const id = xf.getAttribute('numFmtId');
      return id === '0' ? 'General' : (codes[id] || 'builtin:' + id);
    });
    const cells = {};
    Array.from((await parse('xl/worksheets/sheet1.xml')).getElementsByTagName('c')).forEach(c => {
      const v = c.getElementsByTagName('v')[0];
      const value = !v ? null : (c.getAttribute('t') === 's' ? shared[Number(v.textContent)] : Number(v.textContent));
      cells[c.getAttribute('r')] = { kind: value === null || value === '' ? 'empty' : (typeof value === 'number' ? 'number' : 'text'), value, fmt: formats[Number(c.getAttribute('s') || 0)] || 'General' };
    });
    return new Proxy(cells, { get: (target, ref) => target[ref] || { kind: 'empty', value: null, fmt: 'General' } });
  }
  // Un tableau d'une ligne dont chaque case ne contient que la bulle de `columns` : la forme où l'export Excel écrit une vraie valeur typée.
  const rowOfBadges = (table, columns) => '<table><tbody><tr>' + columns.map(c => `<td><p>${badge(table, c)}</p></td>`).join('') + '</tr></tbody></table>';
  const CELL = 'ABCDEFGHIJKL'.split('').map(letter => letter + '1');
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
    description: 'Carte « Référence » : une Référence qui montre un nombre (ou l\'identifiant de ligne) écrit « 2024 », pas « Produits[2024] », et un prix décimal « 1,5 » (« 1.5 » en anglais), rien quand elle ne désigne aucune ligne, « 0 » quand la ligne désignée vaut 0 ; un Oui / Non montré n\'écrit « faux » que pour une vraie ligne à faux ; les règles (= 2024, > 2000, vide), le calcul (+ 1) et la case Excel disent la même chose sur la ligne affichée et sur la ligne brute',
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
      const WRITES = { 1: '2024|1|1,5|vrai', 2: '||0|', 3: '0|4||faux' };
      for (const id of ids) {
        for (const [shape, record] of [['affichée', shapes[id].displayed], ['brute', shapes[id].raw]]) {
          const got = await textOf(barLine(T, COLUMNS), T, record);
          if (got !== WRITES[id]) bad.push({ lecture: shape, row: id, got, expected: WRITES[id] });
        }
      }
      // Le prix décimal prend la virgule de la langue, sans espace des milliers (une année ou un identifiant ne s'écrit jamais « 2 024 ») : en anglais, le point.
      const WRITES_EN = { 1: '2024|1|1.5|true', 2: '||0|', 3: '0|4||false' };
      const lang = I18n.getLang();
      try {
        I18n.setLang('en');
        for (const id of ids) {
          for (const [shape, record] of [['affichée', shapes[id].displayed], ['brute', shapes[id].raw]]) {
            const got = await textOf(barLine(T, COLUMNS), T, record);
            if (got !== WRITES_EN[id]) bad.push({ lecture: shape + ' (anglais)', row: id, got, expected: WRITES_EN[id] });
          }
        }
      } finally { I18n.setLang(lang); }
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
      // Le jour se compare au jour : « = 12/09/2026 » comme « = 2026-09-12 » ; Moment se lit à Paris (ligne 4 : 01/01/2027, pas 31/12/2026) ; une liste est « = » quand un élément l'est ; une date vide n'est avant
      // ni après aucun jour. Un attendu `undefined` n'est pas contrôlé : « vide » sur la liste de la ligne 3, qui ne contient qu'un trou.
      const RULES = [
        ['Jalon', '=', '12/09/2026', [true, false, false, false]], ['Jalon', '=', '2026-09-12', [true, false, false, false]], ['Jalon', '≠', '12/09/2026', [false, true, true, true]],
        ['Jalon', '>', '01/06/2026', [true, false, false, false]], ['Jalon', '<', '01/06/2026', [false, false, false, true]], ['Jalon', '≥', '01/01/2026', [true, false, false, true]],
        ['Jalon', '≤', '31/12/2026', [true, false, false, true]], ['Moment', '<', '01/01/2028', [true, false, false, true]], ['Moment', '≥', '01/01/2027', [false, false, false, true]],
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
      const FILTERS = [[[['=', '12/09/2026']], [1]], [[['=', '2026-09-12']], [1]], [[['non vide', ''], ['<', '01/06/2026']], [4]], [[['<', '01/06/2026']], [4]], [[['>', '01/06/2026']], [1]], [[['vide', '']], [2, 3]], [[['non vide', '']], [1, 4]]];
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

  // --- Carte « Formule en erreur » : une cellule dont la formule a échoué ---
  // Mesuré dans un vrai Grist (labo-grist-reel/probe-types-matrix.mjs et probe-types-extra4.mjs, 21/10), quel que soit le type de la colonne (Texte, Numérique, Entier, Oui / Non, Date, Date et heure,
  // liste de choix, Any, Référence, liste de références) : grist.onRecord livre un RaisedException { name, message, details, user_input } dont String() est le texte que Grist montre (« #DIV/0! »,
  // « #AttributeError », « #Invalid DateTime: bientôt »), fetchTable livre ['E', nom, message, détail] (la colonne d'aide d'une Référence en erreur dit la même chose). Avant la correction la ligne
  // affichée écrivait ce texte, sauf dans une colonne Date ou Date et heure (rien), et la ligne brute « E, ZeroDivisionError » (« , , , » dans une colonne Date).
  // La classe ci-dessous a les propriétés et le String() du vrai grist-plugin-api (GristData.ts), pas ceux que le widget a décidés.
  class RaisedException {
    constructor(args) {
      const rest = args.slice();
      this.name = rest.shift(); this.message = rest.shift(); this.details = rest.shift();
      const input = rest.shift();
      this.user_input = input == null ? undefined : input.u;
    }
    toString() {
      switch (this.name) {
        case 'ZeroDivisionError': return '#DIV/0!';
        case 'UnmarshallableError': return this.details || '#' + this.name;
        case 'InvalidTypedValue': return `#Invalid ${this.message}: ${this.details}`;
        default: return '#' + this.name;
      }
    }
  }
  cases.push({
    id: 'vshape_a_formula_error_cell_is_written_the_same_in_both_shapes',
    description: 'Carte « Formule en erreur » : une cellule dont la formule a échoué s\'écrit « #DIV/0! » (ou « #AttributeError », « #Invalid DateTime: bientôt »…) comme Grist la montre, dans une colonne de n\'importe quel type, sur la ligne affichée comme sur la ligne brute : ni « E, ZeroDivisionError » en lot, ni rien dans une colonne Date ; les règles, le Calcul et la case Excel disent la même chose des deux côtés.',
    run: async (h) => {
      const T = 'VsDevis';
      const columns = {
        Titre: 'Text', Marge: 'Numeric', Quantite: 'Int', Livre: 'Bool', Echeance: 'Date', Rdv: 'DateTime:Europe/Paris', Etiquette: 'Text', Libre: 'Any', Choix: 'ChoiceList',
        Produit: 'Ref:VsProduits', gristHelper_Display: 'Any', Produits: 'RefList:VsProduits', gristHelper_Display2: 'Any',
      };
      // Ligne 1 : toutes les formules échouent. Ligne 2 : les mêmes colonnes avec une valeur ordinaire.
      const failing = (name, ...rest) => ['E', name, ...rest];
      const rows = [
        {
          id: 1, Titre: 'Devis A', Marge: failing('ZeroDivisionError'), Quantite: failing('ZeroDivisionError'), Livre: failing('ZeroDivisionError'),
          Echeance: failing('InvalidTypedValue', 'DateTime', 'bientôt'), Rdv: failing('TypeError'), Etiquette: failing('AttributeError'),
          Libre: failing('UnmarshallableError', 'objet', 'objet illisible'), Choix: failing('ZeroDivisionError'),
          Produit: failing('ZeroDivisionError'), gristHelper_Display: failing('ZeroDivisionError'), Produits: failing('ZeroDivisionError'), gristHelper_Display2: failing('ZeroDivisionError'),
        },
        {
          id: 2, Titre: 'Devis B', Marge: 12.5, Quantite: 7, Livre: true, Echeance: secs(2026, 9, 12), Rdv: secs(2026, 9, 12, 19, 30), Etiquette: 'Promo', Libre: 'ok', Choix: ['L', 'A', 'B'],
          Produit: 1, gristHelper_Display: 'Stylo', Produits: ['L', 1], gristHelper_Display2: ['L', 'Stylo'],
        },
      ];
      const raised = (name, ...rest) => new RaisedException([name, ...rest]);
      const shown = [
        {
          id: 1, Titre: 'Devis A', Marge: raised('ZeroDivisionError'), Quantite: raised('ZeroDivisionError'), Livre: raised('ZeroDivisionError'),
          Echeance: raised('InvalidTypedValue', 'DateTime', 'bientôt'), Rdv: raised('TypeError'), Etiquette: raised('AttributeError'),
          Libre: raised('UnmarshallableError', 'objet', 'objet illisible'), Choix: raised('ZeroDivisionError'), Produit: raised('ZeroDivisionError'), Produits: raised('ZeroDivisionError'),
        },
        {
          id: 2, Titre: 'Devis B', Marge: 12.5, Quantite: 7, Livre: true, Echeance: day(2026, 9, 12), Rdv: instant(2026, 9, 12, 19, 30, 'Europe/Paris'), Etiquette: 'Promo', Libre: 'ok', Choix: ['A', 'B'],
          Produit: 'Stylo', Produits: ['Stylo'],
        },
      ];
      await seed(h, T, columns, rows, { Produit: 'gristHelper_Display', Produits: 'gristHelper_Display2' }, { VsProduits: { columns: { Nom: 'Text' }, rows: [{ id: 1, Nom: 'Stylo' }] } });
      const ids = [1, 2];
      const shapes = {};
      for (const id of ids) shapes[id] = await shapesOf(T, shown, id);
      const bad = [];
      const COLUMNS = ['Marge', 'Quantite', 'Livre', 'Echeance', 'Rdv', 'Etiquette', 'Libre', 'Choix', 'Produit', 'Produits'];
      const WRITES = {
        1: ['#DIV/0!', '#DIV/0!', '#DIV/0!', '#Invalid DateTime: bientôt', '#TypeError', '#AttributeError', 'objet illisible', '#DIV/0!', '#DIV/0!', '#DIV/0!'],
        2: ['12,5', '7', 'vrai', '12/09/2026', '12/09/2026', 'Promo', 'ok', 'A, B', 'Stylo', 'Stylo'],
      };
      for (const id of ids) {
        for (const [shape, record] of [['affichée', shapes[id].displayed], ['brute', shapes[id].raw]]) {
          const got = await textOf(barLine(T, COLUMNS), T, record);
          if (got !== WRITES[id].join('|')) bad.push({ lecture: shape, row: id, got, expected: WRITES[id].join('|') });
        }
      }
      // Une Référence en erreur dont la colonne d'affichage serait ordinaire (Grist la dit en erreur aussi, mais la cellule prime) : c'est l'erreur qu'on lit.
      const odd = Variables.cellValue(T, 'Produit', Object.assign({}, shapes[1].raw, { gristHelper_Display: 'Stylo' }));
      if (String(odd) !== '#DIV/0!') bad.push({ cellValue: 'Référence en erreur, colonne d\'affichage ordinaire', got: String(odd), expected: '#DIV/0!' });
      // Les règles : une cellule en erreur n'est pas vide, vaut le texte de Grist, et n'est ni une date ni un choix de la liste.
      const RULES = [
        ['Marge', '=', '#DIV/0!', [true, false]], ['Marge', '≠', '#DIV/0!', [false, true]], ['Marge', 'non vide', '', [true, true]], ['Marge', 'vide', '', [false, false]],
        ['Marge', 'contient', 'DIV', [true, false]], ['Echeance', '=', '#Invalid DateTime: bientôt', [true, false]], ['Echeance', '=', '12/09/2026', [false, true]],
        ['Rdv', '=', '12/09/2026', [false, true]], ['Choix', '=', 'A', [false, true]], ['Produit', 'non vide', '', [true, true]], ['Produits', 'non vide', '', [true, true]],
      ];
      bad.push(...wrongRows(await ruleRows(T, ids, shapes, RULES)));
      // Le Calcul refuse l'erreur en la nommant : le même message des deux côtés ; la ligne ordinaire calcule.
      const calc = `<p><span class="calc-badge" data-formula="{${T}.Marge} + 1"></span></p>`;
      const calcs = {};
      for (const id of ids) {
        for (const [shape, record] of [['affichée', shapes[id].displayed], ['brute', shapes[id].raw]]) (calcs[id] = calcs[id] || []).push(await textOf(calc, T, record));
        if (calcs[id][0] !== calcs[id][1]) bad.push({ calcul: 'les deux formes divergent', row: id, affichée: calcs[id][0], brute: calcs[id][1] });
      }
      if (!/#DIV\/0!/.test(calcs[1][0])) bad.push({ calcul: 'affichée', row: 1, got: calcs[1][0], expected: 'une erreur qui cite « #DIV/0! »' });
      if (calcs[2][0] !== '13,5') bad.push({ calcul: 'affichée', row: 2, got: calcs[2][0], expected: '13,5' });
      // La case Excel d'une cellule en erreur : du texte, le même que la Lecture (jamais un nombre ni une date), des deux côtés.
      for (const [shape, record] of [['affichée', shapes[1].displayed], ['brute', shapes[1].raw]]) {
        const cells = await excelCells(rowOfBadges(T, COLUMNS), T, record);
        COLUMNS.forEach((c, i) => {
          const cell = cells[CELL[i]];
          if (cell.value !== WRITES[1][i] || cell.kind !== 'text') bad.push({ excel: shape, row: 1, column: c, got: cell.value, kind: cell.kind, expected: WRITES[1][i] });
        });
      }
      return { pass: bad.length === 0, notes: JSON.stringify(bad) };
    },
  });

  // --- Carte « Excel d'une seule ligne » : de vraies dates ---
  // L'export en lot lit des secondes (fetchTable) et écrit une vraie date Excel ; l'export de la ligne courante lisait un objet GristDate / GristDateTime (grist.onRecord), que seul un nombre faisait passer pour
  // une valeur typée : la case contenait le TEXTE « 12/09/2026 », qu'on ne trie ni ne calcule. Maintenant les deux écrivent le même numéro de série, avec le même format de nombre.
  cases.push({
    id: 'vshape_the_excel_of_a_single_row_writes_real_dates_like_the_batch',
    description: 'Carte « Excel d\'une seule ligne » : une colonne Date ou Date et heure (à Paris, à New York) s\'écrit dans une vraie case date d\'Excel - même numéro de série, même format - que la ligne vienne de grist.onRecord (GristDate, GristDateTime) ou de fetchTable (secondes) ; l\'heure se lit dans le fuseau de la colonne (23 h 30 UTC le 31/12 est le 01/01/2027 à Paris), une date vide laisse la case vide, les nombres ne changent pas.',
    run: async (h) => {
      const T = 'VsEcheances';
      const columns = { Titre: 'Text', Jour: 'Date', Rdv: 'DateTime:Europe/Paris', Fin: 'DateTime:America/New_York', Montant: 'Numeric', Quantite: 'Int', Libre: 'Any' };
      const rows = [
        { id: 1, Titre: 'Devis A', Jour: secs(2026, 9, 12), Rdv: secs(2026, 9, 12, 21, 30), Fin: secs(2026, 9, 12, 21, 30), Montant: 1234.5, Quantite: 12, Libre: ['d', secs(2026, 9, 12)] },
        { id: 2, Titre: 'Devis B', Jour: null, Rdv: null, Fin: null, Montant: 0, Quantite: 0, Libre: null },
        { id: 3, Titre: 'Devis C', Jour: secs(2026, 12, 31), Rdv: secs(2026, 12, 31, 23, 30), Fin: secs(2026, 1, 5, 3, 0), Montant: 99, Quantite: 3, Libre: ['d', secs(2026, 12, 31)] },
      ];
      const shown = [
        { id: 1, Titre: 'Devis A', Jour: day(2026, 9, 12), Rdv: instant(2026, 9, 12, 21, 30, 'Europe/Paris'), Fin: instant(2026, 9, 12, 21, 30, 'America/New_York'), Montant: 1234.5, Quantite: 12, Libre: day(2026, 9, 12) },
        { id: 2, Titre: 'Devis B', Jour: null, Rdv: null, Fin: null, Montant: 0, Quantite: 0, Libre: null },
        { id: 3, Titre: 'Devis C', Jour: day(2026, 12, 31), Rdv: instant(2026, 12, 31, 23, 30, 'Europe/Paris'), Fin: instant(2026, 1, 5, 3, 0, 'America/New_York'), Montant: 99, Quantite: 3, Libre: day(2026, 12, 31) },
      ];
      await seed(h, T, columns, rows);
      const ids = [1, 2, 3];
      const shapes = {};
      for (const id of ids) shapes[id] = await shapesOf(T, shown, id);
      // Une bulle seule par case : la forme où l'export écrit une vraie valeur typée. Jour (défaut, puis « 12 septembre 2026 »), Rdv (le jour, puis le jour et l'heure), Fin à New York avec l'heure, un nombre, un entier.
      const withFormat = (column, format) => badge(T, column).replace('data-key=', `data-format='${JSON.stringify(format)}' data-key=`);
      const cellsHtml = [badge(T, 'Jour'), withFormat('Jour', { type: 'date', preset: 'd_mmmm_yyyy' }), badge(T, 'Rdv'), withFormat('Rdv', { type: 'date', time: 'colon' }), withFormat('Fin', { type: 'date', time: 'colon' }), badge(T, 'Montant'), badge(T, 'Quantite'), withFormat('Libre', { type: 'number' })];
      const html = '<table><tbody><tr>' + cellsHtml.map(b => `<td><p>${b}</p></td>`).join('') + '</tr></tbody></table>';
      const NAMES = ['Jour', 'Jour (mois en lettres)', 'Rdv', 'Rdv + heure', 'Fin + heure', 'Montant', 'Quantite', 'Libre (réglée en nombre)'];
      // Le numéro de série Excel d'un jour (1900, sans le jour fantôme du 29 février 1900) et d'une heure, en fraction de jour.
      const serial = (y, m, d, hh, mm) => (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000 + ((hh || 0) * 60 + (mm || 0)) / 1440;
      const WANT = {
        1: [serial(2026, 9, 12), serial(2026, 9, 12), serial(2026, 9, 12), serial(2026, 9, 12, 23, 30), serial(2026, 9, 12, 17, 30)],
        2: [null, null, null, null, null],
        3: [serial(2026, 12, 31), serial(2026, 12, 31), serial(2027, 1, 1), serial(2027, 1, 1, 0, 30), serial(2026, 1, 4, 22, 0)],
      };
      const bad = [];
      for (const id of ids) {
        const read = {};
        for (const [shape, record] of [['affichée', shapes[id].displayed], ['brute', shapes[id].raw]]) {
          const cells = await excelCells(html, T, record);
          read[shape] = NAMES.map((name, i) => cells[CELL[i]]);
        }
        NAMES.forEach((name, i) => {
          const a = read['affichée'][i];
          const b = read['brute'][i];
          // Une colonne Any qui porte une date n'est pas une colonne Date : jamais un nombre d'Excel, même réglée en nombre (les secondes d'une date ne sont pas un montant) ; son texte, lui, est le même des
          // deux côtés (carte « Colonne sans type »).
          if (i === 7) { [['affichée', a], ['brute', b]].forEach(([shape, cell]) => { if (cell.kind === 'number') bad.push({ excel: shape, row: id, column: name, got: cell, expected: 'du texte ou rien, pas un nombre' }); }); return; }
          // Les deux formes écrivent la même case : même nature, même valeur, même format.
          if (a.kind !== b.kind || a.fmt !== b.fmt || (a.kind === 'number' && Math.abs(a.value - b.value) > 1e-9) || (a.kind === 'text' && a.value !== b.value)) bad.push({ row: id, column: name, affichée: a, brute: b });
          if (i < 5) {
            const want = WANT[id][i];
            for (const [shape, cell] of [['affichée', a], ['brute', b]]) {
              const ok = want === null ? cell.kind === 'empty' : cell.kind === 'number' && Math.abs(cell.value - want) < 1e-6 && /y/i.test(cell.fmt);
              if (!ok) bad.push({ excel: shape, row: id, column: name, got: cell, expected: want });
            }
          }
        });
      }
      return { pass: bad.length === 0, notes: JSON.stringify(bad) };
    },
  });

  // --- Carte « Liste avec un trou » : une liste de références dont une valeur est vide ---
  // Mesuré dans un vrai Grist (labo-grist-reel/probe-types-matrix.mjs, 21/10) : une liste de références dont l'une désigne une fiche sans date arrive, sur la ligne affichée, avec un trou (undefined) à la place
  // de la date et, sur la ligne brute, avec null dans la colonne d'aide (['L', null, ['d', …]]) ; une fiche au texte vide donne '' des deux côtés. Avant la correction la liste s'écrivait avec une virgule de trop
  // (« , 01/01/2026 », « 01/03/2026, , 12/09/2026 ») : le trou s'écrivait vide mais gardait sa place entre deux virgules, alors que la fenêtre « Liste » et l'export « un document par valeur » sautaient déjà
  // les valeurs vides.
  cases.push({
    id: 'vshape_a_list_with_an_empty_item_writes_no_stray_comma_in_both_shapes',
    description: 'Carte « Liste avec un trou » : une liste de références de dates ou de textes dont une valeur est vide (une fiche sans date, un texte vide) s\'écrit sans virgule de trop - « 12/09/2026 », « 01/03/2026, 12/09/2026 », « Rouge, Bleu », rien quand tout est vide - sur la ligne affichée comme sur la ligne brute, dans la Lecture comme dans la case Excel',
    run: async (h) => {
      const T = 'VsAgenda';
      const columns = { Titre: 'Text', Dates: 'RefList:VsJalons', gristHelper_Display: 'Any', Etiquettes: 'RefList:VsEtiquettes', gristHelper_Display2: 'Any' };
      // Dates : le jalon 3 n'a pas de date. Etiquettes : l'étiquette 3 a un texte vide.
      const rows = [
        { id: 1, Titre: 'Agenda A', Dates: ['L', 3, 2], gristHelper_Display: ['L', null, ['d', secs(2026, 9, 12)]], Etiquettes: ['L', 1, 3], gristHelper_Display2: ['L', 'Rouge', ''] },
        { id: 2, Titre: 'Agenda B', Dates: ['L', 1, 3, 2], gristHelper_Display: ['L', ['d', secs(2026, 3, 1)], null, ['d', secs(2026, 9, 12)]], Etiquettes: ['L', 3, 2], gristHelper_Display2: ['L', '', 'Bleu'] },
        { id: 3, Titre: 'Agenda C', Dates: ['L', 1, 3], gristHelper_Display: ['L', ['d', secs(2026, 3, 1)], null], Etiquettes: ['L', 3, 3], gristHelper_Display2: ['L', '', ''] },
        { id: 4, Titre: 'Agenda D', Dates: ['L', 3, 3], gristHelper_Display: ['L', null, null], Etiquettes: ['L', 1, 3, 2], gristHelper_Display2: ['L', 'Rouge', '', 'Bleu'] },
      ];
      const shown = [
        { id: 1, Titre: 'Agenda A', Dates: [undefined, day(2026, 9, 12)], Etiquettes: ['Rouge', ''] },
        { id: 2, Titre: 'Agenda B', Dates: [day(2026, 3, 1), undefined, day(2026, 9, 12)], Etiquettes: ['', 'Bleu'] },
        { id: 3, Titre: 'Agenda C', Dates: [day(2026, 3, 1), undefined], Etiquettes: ['', ''] },
        { id: 4, Titre: 'Agenda D', Dates: [undefined, undefined], Etiquettes: ['Rouge', '', 'Bleu'] },
      ];
      const jalons = { columns: { Lancement: 'Date' }, rows: [{ id: 1, Lancement: secs(2026, 3, 1) }, { id: 2, Lancement: secs(2026, 9, 12) }, { id: 3, Lancement: null }] };
      const etiquettes = { columns: { Nom: 'Text' }, rows: [{ id: 1, Nom: 'Rouge' }, { id: 2, Nom: 'Bleu' }, { id: 3, Nom: '' }] };
      await seed(h, T, columns, rows, { Dates: 'gristHelper_Display', Etiquettes: 'gristHelper_Display2' }, { VsJalons: jalons, VsEtiquettes: etiquettes });
      const ids = [1, 2, 3, 4];
      const shapes = {};
      for (const id of ids) shapes[id] = await shapesOf(T, shown, id);
      const bad = [];
      const COLUMNS = ['Dates', 'Etiquettes'];
      const WRITES = { 1: '12/09/2026|Rouge', 2: '01/03/2026, 12/09/2026|Bleu', 3: '01/03/2026|', 4: '|Rouge, Bleu' };
      for (const id of ids) {
        for (const [shape, record] of [['affichée', shapes[id].displayed], ['brute', shapes[id].raw]]) {
          const got = await textOf(barLine(T, COLUMNS), T, record);
          if (got !== WRITES[id]) bad.push({ lecture: shape, row: id, got, expected: WRITES[id] });
        }
      }
      // La case Excel : le même texte (vide quand rien ne s'écrit), jamais un nombre.
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

  // --- Carte « Date vide » : « avant une date » ne retient pas une cellule sans date ---
  // Une cellule sans date arrive en null des deux côtés, dans une colonne Date, une colonne Date et heure et une Référence qui montre une date (null sur la ligne affichée, null dans la colonne d'aide de la
  // ligne brute, qu'elle ne désigne rien ou qu'elle désigne une fiche sans date). Avant la correction « < 01/01/2027 » et « ≤ 01/01/2027 » la disaient vraie - la comparaison de texte : le texte vide vient avant
  // tout texte - et le bloc « Avant 2027 » de la Lecture s'écrivait pour chaque ligne sans date.
  cases.push({
    id: 'vshape_an_empty_date_is_neither_before_nor_after_any_day_in_both_shapes',
    description: 'Carte « Date vide » : « < » et « ≤ » une date ne retiennent pas une cellule sans date (« > » et « ≥ » non plus), dans une colonne Date, une colonne Date et heure et une Référence qui montre une date - qu\'elle ne désigne rien ou qu\'elle désigne une fiche sans date -, sur la ligne affichée comme sur la ligne brute ; « = » reste faux, « ≠ » et « vide » vrais ; le bloc « Avant 2027 » de la Lecture ne s\'écrit que pour une vraie date',
    run: async (h) => {
      const T = 'VsEcheancier';
      const columns = { Titre: 'Text', Jour: 'Date', Rdv: 'DateTime:Europe/Paris', Jalon: 'Ref:VsJalons', gristHelper_Display: 'Any' };
      // Ligne 1 : le 12/09/2026. Ligne 2 : rien (la Référence ne désigne aucune ligne). Ligne 3 : le 01/03/2027. Ligne 4 : rien (la Référence désigne un jalon sans date).
      const rows = [
        { id: 1, Titre: 'Devis A', Jour: secs(2026, 9, 12), Rdv: secs(2026, 9, 12, 21, 30), Jalon: 2, gristHelper_Display: ['d', secs(2026, 9, 12)] },
        { id: 2, Titre: 'Devis B', Jour: null, Rdv: null, Jalon: 0, gristHelper_Display: null },
        { id: 3, Titre: 'Devis C', Jour: secs(2027, 3, 1), Rdv: secs(2027, 3, 1, 10, 0), Jalon: 1, gristHelper_Display: ['d', secs(2027, 3, 1)] },
        { id: 4, Titre: 'Devis D', Jour: null, Rdv: null, Jalon: 3, gristHelper_Display: null },
      ];
      const shown = [
        { id: 1, Titre: 'Devis A', Jour: day(2026, 9, 12), Rdv: instant(2026, 9, 12, 21, 30, 'Europe/Paris'), Jalon: day(2026, 9, 12) },
        { id: 2, Titre: 'Devis B', Jour: null, Rdv: null, Jalon: null },
        { id: 3, Titre: 'Devis C', Jour: day(2027, 3, 1), Rdv: instant(2027, 3, 1, 10, 0, 'Europe/Paris'), Jalon: day(2027, 3, 1) },
        { id: 4, Titre: 'Devis D', Jour: null, Rdv: null, Jalon: null },
      ];
      const jalons = { columns: { Lancement: 'Date' }, rows: [{ id: 1, Lancement: secs(2027, 3, 1) }, { id: 2, Lancement: secs(2026, 9, 12) }, { id: 3, Lancement: null }] };
      await seed(h, T, columns, rows, { Jalon: 'gristHelper_Display' }, { VsJalons: jalons });
      const ids = [1, 2, 3, 4];
      const shapes = {};
      for (const id of ids) shapes[id] = await shapesOf(T, shown, id);
      const bad = [];
      const RULES = [];
      for (const column of ['Jour', 'Rdv', 'Jalon']) {
        RULES.push(
          [column, '<', '01/01/2027', [true, false, false, false]], [column, '≤', '01/01/2027', [true, false, false, false]],
          [column, '>', '01/01/2027', [false, false, true, false]], [column, '≥', '01/01/2027', [false, false, true, false]],
          [column, '=', '12/09/2026', [true, false, false, false]], [column, '≠', '12/09/2026', [false, true, true, true]],
          [column, 'vide', '', [false, true, false, true]],
        );
      }
      RULES.push(['Jour', '<', '2027-01-01', [true, false, false, false]], ['Jour', '≥', '2027-01-01', [false, false, true, false]]);
      bad.push(...wrongRows(await ruleRows(T, ids, shapes, RULES)));
      // Le bloc de la Lecture : « Avant 2027 : Devis A. » pour une vraie date avant 2027, rien ensuite (la bulle masquée emporte l'espace qui la précède).
      for (const column of ['Jour', 'Rdv', 'Jalon']) {
        const html = `<p>Avant 2027 : ${badge(T, 'Titre', when(column, '<', '01/01/2027'))}.</p>`;
        for (const id of ids) {
          const expected = id === 1 ? 'Avant 2027 : Devis A.' : 'Avant 2027 :.';
          for (const [shape, record] of [['affichée', shapes[id].displayed], ['brute', shapes[id].raw]]) {
            const got = await textOf(html, T, record);
            if (got !== expected) bad.push({ lecture: shape, row: id, colonne: column, got, expected });
          }
        }
      }
      return { pass: bad.length === 0, notes: JSON.stringify(bad) };
    },
  });

  // --- Carte « Colonne sans type » : une formule ajoutée sans type qui calcule une date ---
  // Une colonne « Any » dont la formule rend une date arrive en objet GristDate (un jour) ou GristDateTime (un instant et son fuseau) sur la ligne affichée, en ['d', secondes] ou ['D', secondes, fuseau] sur la
  // ligne brute (mesuré dans un vrai Grist, colonnes AnyJour et AnyDate de dev-tests/fixtures/real-grist-shapes.json). Avant la correction la ligne affichée écrivait « 2026-09-12T21:30:00.000Z » et la ligne
  // brute « D, 1789248600, Europe/Paris » ; les règles la comparaient comme du texte et le Calcul, sur la ligne brute, lisait un tableau.
  cases.push({
    id: 'vshape_an_untyped_formula_column_that_computes_a_date_writes_a_date_in_both_shapes',
    description: 'Carte « Colonne sans type » : une colonne « Any » (formule ajoutée sans type) qui calcule un jour s\'écrit « 12/09/2026 » et qui calcule un instant « 12/09/2026 23:30 » (l\'heure du fuseau de la valeur : 23 h 30 UTC le 31/12 est le 01/01/2027 00:30 à Paris), « 09/12/2026, 23:30 » en anglais, rien quand elle est vide, sur la ligne affichée comme sur la ligne brute ; les règles (= 12/09/2026, = 2026-09-12, <, >, vide, une colonne contre une autre) comparent le jour, le Calcul dit « est une date » comme sur une colonne Date, et la case Excel est du texte, le même',
    run: async (h) => {
      const T = 'VsFormules';
      const columns = { Titre: 'Text', Jour: 'Any', Instant: 'Any', Libre: 'Any' };
      const rows = [
        { id: 1, Titre: 'Devis A', Jour: ['d', secs(2026, 9, 12)], Instant: ['D', secs(2026, 9, 12, 21, 30), 'Europe/Paris'], Libre: 'bientôt' },
        { id: 2, Titre: 'Devis B', Jour: null, Instant: null, Libre: null },
        { id: 3, Titre: 'Devis C', Jour: ['d', secs(2026, 12, 31)], Instant: ['D', secs(2026, 12, 31, 23, 30), 'Europe/Paris'], Libre: 'x' },
      ];
      const shown = [
        { id: 1, Titre: 'Devis A', Jour: day(2026, 9, 12), Instant: instant(2026, 9, 12, 21, 30, 'Europe/Paris'), Libre: 'bientôt' },
        { id: 2, Titre: 'Devis B', Jour: null, Instant: null, Libre: null },
        { id: 3, Titre: 'Devis C', Jour: day(2026, 12, 31), Instant: instant(2026, 12, 31, 23, 30, 'Europe/Paris'), Libre: 'x' },
      ];
      await seed(h, T, columns, rows);
      const ids = [1, 2, 3];
      const shapes = {};
      for (const id of ids) shapes[id] = await shapesOf(T, shown, id);
      const bad = [];
      const COLUMNS = ['Jour', 'Instant', 'Libre'];
      const WRITES = { 1: '12/09/2026|12/09/2026 23:30|bientôt', 2: '||', 3: '31/12/2026|01/01/2027 00:30|x' };
      for (const id of ids) {
        for (const [shape, record] of [['affichée', shapes[id].displayed], ['brute', shapes[id].raw]]) {
          const got = await textOf(barLine(T, COLUMNS), T, record);
          if (got !== WRITES[id]) bad.push({ lecture: shape, row: id, got, expected: WRITES[id] });
        }
      }
      // En anglais : le jour à l'américaine, l'heure après une virgule.
      const lang = I18n.getLang();
      try {
        I18n.setLang('en');
        for (const [shape, record] of [['affichée', shapes[1].displayed], ['brute', shapes[1].raw]]) {
          const got = await textOf(barLine(T, COLUMNS), T, record);
          if (got !== '09/12/2026|09/12/2026, 23:30|bientôt') bad.push({ lecture: shape + ' (anglais)', row: 1, got, expected: '09/12/2026|09/12/2026, 23:30|bientôt' });
        }
      } finally { I18n.setLang(lang); }
      // Les règles : le jour se compare au jour (Instant se lit à Paris), une date vide n'est avant ni après aucun jour, le texte garde sa comparaison.
      const RULES = [
        ['Jour', '=', '12/09/2026', [true, false, false]], ['Jour', '=', '2026-09-12', [true, false, false]], ['Jour', '≠', '12/09/2026', [false, true, true]],
        ['Jour', '<', '01/01/2027', [true, false, true]], ['Jour', '>', '01/06/2026', [true, false, true]], ['Jour', '≤', '31/12/2026', [true, false, true]],
        ['Jour', 'vide', '', [false, true, false]], ['Jour', 'non vide', '', [true, false, true]],
        ['Instant', '=', '12/09/2026', [true, false, false]], ['Instant', '=', '01/01/2027', [false, false, true]], ['Instant', '=', '31/12/2026', [false, false, false]],
        ['Instant', '>', '31/12/2026', [false, false, true]], ['Instant', '<', '01/01/2028', [true, false, true]],
        ['Libre', '=', 'bientôt', [true, false, false]],
        ['Jour', '=', { valueColumn: 'Instant' }, [true, true, false]], ['Jour', '<', { valueColumn: 'Instant' }, [false, false, true]],
      ];
      bad.push(...wrongRows(await ruleRows(T, ids, shapes, RULES)));
      // Le Calcul : une date n'est pas un nombre, comme pour une colonne Date ; les deux formes disent la même chose.
      const calc = `<p><span class="calc-badge" data-formula="{${T}.Jour} + 1"></span></p>`;
      const dateError = /est une date, pas un nombre/;
      const calcs = {};
      for (const id of ids) {
        for (const [shape, record] of [['affichée', shapes[id].displayed], ['brute', shapes[id].raw]]) (calcs[id] = calcs[id] || []).push(await textOf(calc, T, record));
        if (calcs[id][0] !== calcs[id][1]) bad.push({ calcul: 'les deux formes divergent', row: id, affichée: calcs[id][0], brute: calcs[id][1] });
      }
      [1, 3].forEach(id => { if (!dateError.test(calcs[id][0])) bad.push({ calcul: 'affichée', row: id, got: calcs[id][0], expected: 'une erreur « est une date »' }); });
      // La case Excel : du texte, le même que la Lecture (une colonne Any n'est pas une colonne Date : jamais une date d'Excel), vide quand rien ne s'écrit.
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

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.varShapes = cases;
})();
