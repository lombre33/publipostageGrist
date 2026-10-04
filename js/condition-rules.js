// Conditions « colonne opérateur valeur » sur une ligne Grist, évaluées de la même façon par les macro-modèles (js/macro-templates.js, choix d'une
// annexe) et les variables conditionnelles. Aucune dépendance DOM. Une règle = { column, operator, value } ; `column` nue (table courante) ou
// qualifiée « Table.Colonne » (cf. parseColumnRef).
const ConditionRules = (function () {
  // Opérateurs des fenêtres de règles (macro-modèles, variables conditionnelles), dans l'ordre des listes déroulantes.
  const OPERATORS = ['=', '≠', '>', '<', '≥', '≤', 'contient', 'vide', 'non vide'];

  function isEmpty(v) { return v === null || v === undefined || v === ''; }

  // Les mots d'une règle sur une colonne Oui / Non que la comparaison lit : seuls ceux-là valent vrai ou faux, tout autre texte ne correspond à rien.
  // Exportée : la liste Oui / Non du champ Valeur (js/condition-fields.js:buildBoolList) range une valeur déjà enregistrée avec la même lecture.
  const BOOL_TRUE_WORDS = ['oui', 'vrai', 'true', '1', 'yes'];
  const BOOL_FALSE_WORDS = ['non', 'faux', 'false', '0', 'no'];
  function parseBoolExpected(expected) {
    const s = String(expected == null ? '' : expected).trim().toLowerCase();
    if (BOOL_TRUE_WORDS.indexOf(s) !== -1) return true;
    if (BOOL_FALSE_WORDS.indexOf(s) !== -1) return false;
    return null;
  }

  // Un Date/DateTime arrive sous deux formes selon le chemin de lecture (vérifié à la source de grist-core) : un objet Date (GristDate/GristDateTime
  // décodé par grist.onRecord : aperçu et Lecture d'un macro-modèle, js/main.js) qui représente un instant UTC, ou un nombre de secondes UTC depuis
  // 1970 (export en lot, même format que js/variable-format.js). isDateLike et toUtcInstant lisent les deux sans supposer lequel le columnType
  // impose.
  function isDateLike(v) { return v instanceof Date && !isNaN(v.getTime()); }
  function toUtcInstant(actual) {
    if (isDateLike(actual)) return actual;
    if (typeof actual === 'number' && isFinite(actual)) return new Date(actual * 1000);
    return null;
  }
  function daysInMonth(year, month1based) { return new Date(Date.UTC(year, month1based, 0)).getUTCDate(); }
  // « 26/09/2026 » (saisie en français) ou « 2026-09-26 » (ISO, format de GristDate.toString()) : Date.parse seul est trop ambigu selon le moteur
  // (JJ/MM ou MM/JJ). Construite en UTC (Date.UTC, jamais `new Date(y, m, d)` qui lit en heure locale) pour que la comparaison ne dépende pas du
  // fuseau du navigateur : une valeur Grist est un jour calendaire, pas un instant local. Un jour ou un mois hors bornes (« 31/02/2026 », «
  // 09/26/2026 ») est refusé au lieu de déborder sur un autre mois : une date saisie invalide ne correspond jamais.
  function parseDateExpected(expected) {
    const s = String(expected == null ? '' : expected).trim();
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    const fr = iso ? null : /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    const parts = iso ? { y: Number(iso[1]), mo: Number(iso[2]), d: Number(iso[3]) }
      : fr ? { y: Number(fr[3]), mo: Number(fr[2]), d: Number(fr[1]) }
        : null;
    if (!parts) return null;
    if (parts.mo < 1 || parts.mo > 12) return null;
    if (parts.d < 1 || parts.d > daysInMonth(parts.y, parts.mo)) return null;
    return new Date(Date.UTC(parts.y, parts.mo - 1, parts.d));
  }
  // getUTC*, jamais getFullYear/getMonth/getDate (heure locale), pour la même raison. Jour calendaire nu (colonne Date, ou date saisie dans la règle,
  // toujours sans fuseau) ; pour une colonne DateTime:<fuseau>, voir dayKeyInZone.
  function dayKey(d) { return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0'); }
  const zoneFormatters = new Map();  // fuseau -> formateur Intl, un par fuseau de colonne du document : en construire un coûte ~60 µs, formater moins d'1 µs
  function zoneFormatter(tz) {
    if (!zoneFormatters.has(tz)) {
      let formatter;
      try { formatter = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }); }
      catch (e) { formatter = { format: dayKey }; }  // fuseau que le moteur JS ne reconnaît pas (très rare) : jour UTC plutôt que planter la comparaison
      zoneFormatters.set(tz, formatter);
    }
    return zoneFormatters.get(tz);
  }
  // Jour calendaire d'un instant dans le fuseau de la colonne (« DateTime:Europe/Paris ») : le soir à Paris (23h30, encore le 26/09) est déjà le
  // 27/09 en UTC, et « = 26/09/2026 » échouerait à tort. 'en-CA' est le format Intl qui rend directement « AAAA-MM-JJ ».
  function dayKeyInZone(d, tz) {
    try { return zoneFormatter(tz).format(d); } catch (e) { return dayKey(d); }  // date hors bornes : format() lève, jour UTC
  }
  // « DateTime:Europe/Paris » -> « Europe/Paris » ; « DateTime » seul ou « Date » -> null : jour UTC nu (dayKey), déjà correct pour ces deux cas
  // (vérifié à la source de grist-core, extractInfoFromColType : le fuseau est tout ce qui suit le premier « : »).
  function dateTimeZone(columnType) {
    const t = String(columnType || '');
    return t.indexOf('DateTime:') === 0 ? t.slice('DateTime:'.length) : null;
  }

  // Les six comparaisons communes aux dates, aux nombres et aux textes ; un autre opérateur n'est jamais vrai.
  const COMPARATORS = new Map([
    ['=', (a, b) => a === b], ['≠', (a, b) => a !== b],
    ['>', (a, b) => a > b], ['<', (a, b) => a < b],
    ['≥', (a, b) => a >= b], ['≤', (a, b) => a <= b],
  ]);
  const compare = (operator, a, b) => COMPARATORS.has(operator) && COMPARATORS.get(operator)(a, b);
  const textOf = v => String(isEmpty(v) ? '' : v);

  // Opérateurs : '=', '≠', '>', '<', '≥', '≤', 'contient', 'vide', 'non vide' (planning/feature-conditional-content.md). `columnType` (la chaîne de
  // js/grist-api.js:getColumnType : "Text", "Numeric", "Bool", "Date", "DateTime:UTC", "Choice", "Ref:Table"... ; null ou undefined si inconnue)
  // décide de trois cas avant la comparaison générale :
  //  - Liste (choix multiples, liste de références : un tableau) : « = » veut dire « contient ce choix » et « ≠ » « ne le contient pas » (« = Projet
  //    » retient donc une ligne Projet + Urgent), comme le filtre d'une boucle (js/loop-rules.js:ruleHolds) ; les autres opérateurs lisent la forme
  //    texte « Projet,Urgent ».
  //  - Bool : Grist renvoie un booléen JS, jamais égal au mot français tapé dans la règle (« Oui », « Non »).
  //  - Date/DateTime : voir toUtcInstant, parseDateExpected et dayKey ci-dessus.
  // Sans `columnType`, les cas Bool et Date sont ignorés et la comparaison générale s'applique. Reference et ReferenceList n'ont pas de cas propre :
  // une colonne de référence n'arrive pas toujours sous la forme [id, valeur affichée] selon le chemin de lecture, elle passe par la comparaison
  // générale en texte. Choice (une seule chaîne) aussi.
  function compareValues(actual, operator, expected, columnType) {
    const type = String(columnType || '');

    if (operator === 'vide') return isEmpty(actual);
    if (operator === 'non vide') return !isEmpty(actual);

    if (Array.isArray(actual) && (operator === '=' || operator === '≠')) {
      const contains = actual.some(item => compareValues(item, '=', expected, type));
      return operator === '=' ? contains : !contains;
    }

    if (type === 'Bool' && (actual === true || actual === false)) {
      const expectedBool = parseBoolExpected(expected);
      if (expectedBool !== null && (operator === '=' || operator === '≠')) return compare(operator, actual, expectedBool);
    }

    if (type === 'Date' || type.indexOf('DateTime') === 0) {
      const actualDate = toUtcInstant(actual);
      if (actualDate) {
        const tz = dateTimeZone(type);
        const aKey = tz ? dayKeyInZone(actualDate, tz) : dayKey(actualDate);
        if (operator === 'contient') return aKey.indexOf(String(expected == null ? '' : expected).trim().toLowerCase()) !== -1;
        const expectedDate = parseDateExpected(expected);
        return !!expectedDate && compare(operator, aKey, dayKey(expectedDate));
      }
    }

    if (operator === 'contient') return textOf(actual).toLowerCase().indexOf(String(expected).toLowerCase()) !== -1;
    const aNum = Number(actual);
    const eNum = Number(expected);
    if (!isEmpty(actual) && !isEmpty(expected) && actual !== true && actual !== false && isFinite(aNum) && isFinite(eNum)) return compare(operator, aNum, eNum);
    return compare(operator, textOf(actual).trim(), textOf(expected).trim());
  }

  // « Colonne » d'une règle : nue (colonne de la table courante, ex. « TypeDossier ») ou qualifiée « Table.Colonne » pour une valeur d'une autre
  // table, résolue par #Variable : une lecture ponctuelle contre la même ligne, jamais une itération.
  function parseColumnRef(rawColumn, tableId) {
    const idx = String(rawColumn || '').indexOf('.');
    if (idx === -1) return { table: tableId, column: rawColumn };
    return { table: rawColumn.slice(0, idx), column: rawColumn.slice(idx + 1) };
  }

  // `opts` (facultatif) est transmis tel quel à Variables.resolveRawValue, par exemple { fetchRows } pour lire chaque table une seule fois quand une
  // même condition est évaluée sur toutes les lignes d'une table (aperçu de la fenêtre de condition d'une variable, js/variable-condition.js).
  async function matches(rule, tableId, record, opts) {
    if (!rule || !rule.column) return false;
    const { table, column } = parseColumnRef(rule.column, tableId);
    let actual;
    let perLinkedRow = false;
    try {
      const { value, error, multi } = await Variables.resolveRawValue(table, column, tableId, record, opts);
      if (error) { console.error('[ConditionRules] valeur illisible pour la règle', rule, error); return false; }
      actual = value;
      perLinkedRow = !!multi;
    } catch (e) {
      console.error('[ConditionRules] échec de résolution de la règle', rule, e);
      return false;
    }
    const columnType = GristAPI.getColumnType(table, column);
    // Colonne d'une autre table liée par correspondance (règle « match ») : une valeur par ligne liée, que la bulle affiche séparées par des
    // virgules. La règle est remplie si au moins une ligne liée la remplit : comparer le tableau entier retombait sur String(tableau) (« a,b »), donc
    // jamais une date, un booléen ou « vide » correctement. Réservé à ce cas (`multi`, posé par js/variables.js) : une ChoiceList ou une RefList de
    // la table courante arrive aussi en tableau, que compareValues lit comme une liste (« = » : contient ce choix).
    if (perLinkedRow && Array.isArray(actual)) {
      if (!actual.length) return compareValues(null, rule.operator, rule.value, columnType);
      return actual.some(v => compareValues(v, rule.operator, rule.value, columnType));
    }
    // record[column] est undefined et la clé elle-même absente (pas seulement une valeur vide) : la colonne n'a jamais été transmise à ce widget pour
    // cette ligne. Cause la plus probable : colonne de la table courante non montrée dans le panneau de droite de ce widget (grist.onRecord,
    // includeColumns), ou renommée ou supprimée depuis la création de la règle. Sans cet avertissement, la règle échoue en « = » sans explication et
    // le cas par défaut l'emporte en silence.
    if (table === tableId && record && typeof actual === 'undefined' && !(column in record)) {
      console.warn('[ConditionRules] règle sur la colonne "' + column + '" : absente de la ligne courante (record) - vérifiez qu\'elle existe toujours '
        + 'et qu\'elle est cochée dans les colonnes visibles de CE widget (panneau de droite), ou qu\'elle a bien un accès complet.', rule);
    }
    return compareValues(actual, rule.operator, rule.value, columnType);
  }

  // Condition d'affichage d'une bulle #Variable (attribut `condition` du nœud varBadge, js/editor-nodes.js) : { mode: 'all'|'any', rules: [...] }.
  // Les règles sans colonne (ligne laissée vide dans la fenêtre) sont ignorées ; sans aucune règle complète, pas de condition (null).
  function normalizeCondition(condition) {
    if (!condition || !Array.isArray(condition.rules)) return null;
    const rules = condition.rules.filter(r => r && r.column);
    if (!rules.length) return null;
    return { mode: condition.mode === 'any' ? 'any' : 'all', rules };
  }

  // Vrai si la variable doit s'afficher pour cette ligne : pas de condition = toujours ; 'all' = toutes les règles, 'any' = au moins une. Une règle
  // illisible compte comme non remplie (comme pour les macro-modèles, cf. matches).
  async function conditionHolds(condition, tableId, record, opts) {
    const c = normalizeCondition(condition);
    if (!c) return true;
    const results = await Promise.all(c.rules.map(rule => matches(rule, tableId, record, opts)));
    return c.mode === 'any' ? results.some(Boolean) : results.every(Boolean);
  }

  return { OPERATORS, compareValues, parseBoolExpected, parseColumnRef, matches, normalizeCondition, conditionHolds };
})();
