// Conditions « colonne opérateur valeur » sur une ligne Grist, évaluées de la même façon par les macro-modèles (js/macro-templates.js, choix d'une
// annexe) et les variables conditionnelles. Aucune dépendance DOM : seule elementHolds lit l'attribut de l'élément qu'on lui passe. Une règle =
// { column, operator, value } ; `column` nue (table courante) ou qualifiée « Table.Colonne » (cf. parseColumnRef). Une règle peut aussi comparer la
// colonne à UNE AUTRE COLONNE de la même ligne au lieu d'une valeur saisie : { column, operator, valueColumn } (voir inColumnMode et compareOperands) ;
// une règle sans `valueColumn` se lit comme avant.
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
  function parseDateExpected(expected) {
    // « 26/09/2026 » (saisie en français) ou « 2026-09-26 » (ISO, format de GristDate.toString()) : Date.parse seul est trop ambigu selon le moteur
    // (JJ/MM ou MM/JJ). Construite en UTC (Date.UTC, jamais `new Date(y, m, d)` qui lit en heure locale) pour que la comparaison ne dépende pas du
    // fuseau du navigateur : une valeur Grist est un jour calendaire, pas un instant local. Un jour ou un mois hors bornes (« 31/02/2026 »,
    // « 09/26/2026 ») est refusé au lieu de déborder sur un autre mois : une date saisie invalide ne correspond jamais.
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
  // fuseau -> formateur Intl, un par fuseau de colonne du document : en construire un coûte ~60 µs, formater moins d'1 µs
  const zoneFormatters = new Map();
  function zoneFormatter(tz) {
    if (!zoneFormatters.has(tz)) {
      let formatter;
      try { formatter = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }); }
      // fuseau que le moteur JS ne reconnaît pas (très rare) : jour UTC plutôt que planter la comparaison
      catch (e) { formatter = { format: dayKey }; }
      zoneFormatters.set(tz, formatter);
    }
    return zoneFormatters.get(tz);
  }
  function dayKeyInZone(d, tz) {
    // Jour calendaire d'un instant dans le fuseau de la colonne (« DateTime:Europe/Paris ») : le soir à Paris (23h30, encore le 26/09) est déjà le
    // 27/09 en UTC, et « = 26/09/2026 » échouerait à tort. 'en-CA' est le format Intl qui rend directement « AAAA-MM-JJ ».
    try { return zoneFormatter(tz).format(d); } catch (e) { return dayKey(d); }  // date hors bornes : format() lève, jour UTC
  }
  function dateTimeZone(columnType) {
    // « DateTime:Europe/Paris » -> « Europe/Paris » ; « DateTime » seul ou « Date » -> null : jour UTC nu (dayKey), déjà correct pour ces deux cas
    // (vérifié à la source de grist-core, extractInfoFromColType : le fuseau est tout ce qui suit le premier « : »).
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

  function compareList(actual, operator, expected, type) {
    // Une liste (choix multiples, liste de références) : « = » veut dire « contient ce choix », « ≠ » « ne le contient pas ». null pour tout autre cas.
    if (!Array.isArray(actual) || (operator !== '=' && operator !== '≠')) return null;
    const contains = actual.some(item => compareValues(item, '=', expected, type));
    return operator === '=' ? contains : !contains;
  }

  function compareBool(actual, operator, expected, type) {
    // Une colonne Oui / Non lue en booléen, contre un des mots de parseBoolExpected. null pour tout autre cas.
    if (type !== 'Bool' || (actual !== true && actual !== false)) return null;
    const expectedBool = parseBoolExpected(expected);
    if (expectedBool === null || (operator !== '=' && operator !== '≠')) return null;
    return compare(operator, actual, expectedBool);
  }

  function compareDates(actual, operator, expected, type) {
    // Une date ou un instant, comparés au jour près (dans le fuseau d'une colonne DateTime:Zone). null quand la colonne n'est pas de ce type ou que la
    // valeur n'est pas une date lisible : la comparaison générale s'applique.
    if (type !== 'Date' && type.indexOf('DateTime') !== 0) return null;
    const actualDate = toUtcInstant(actual);
    if (!actualDate) return null;
    const tz = dateTimeZone(type);
    const aKey = tz ? dayKeyInZone(actualDate, tz) : dayKey(actualDate);
    if (operator === 'contient') return aKey.indexOf(String(expected == null ? '' : expected).trim().toLowerCase()) !== -1;
    const expectedDate = parseDateExpected(expected);
    return !!expectedDate && compare(operator, aKey, dayKey(expectedDate));
  }

  function compareGeneral(actual, operator, expected) {
    if (operator === 'contient') return textOf(actual).toLowerCase().indexOf(String(expected).toLowerCase()) !== -1;
    const aNum = Number(actual);
    const eNum = Number(expected);
    if (!isEmpty(actual) && !isEmpty(expected) && actual !== true && actual !== false && isFinite(aNum) && isFinite(eNum)) return compare(operator, aNum, eNum);
    return compare(operator, textOf(actual).trim(), textOf(expected).trim());
  }

  function compareValues(actual, operator, expected, columnType) {
    // Opérateurs : '=', '≠', '>', '<', '≥', '≤', 'contient', 'vide', 'non vide' (planning/feature-conditional-content.md). `columnType` (la chaîne de
    // js/grist-api.js:getColumnType : "Text", "Numeric", "Bool", "Date", "DateTime:UTC", "Choice", "Ref:Table"... ; null ou undefined si inconnue)
    // décide de trois cas avant la comparaison générale :
    //  - Liste (choix multiples, liste de références : un tableau) : « = » veut dire « contient ce choix » et « ≠ » « ne le contient pas » (« =
    //    Projet » retient donc une ligne Projet + Urgent), comme le filtre d'une boucle (js/loop-rules.js:ruleHolds) ; les autres opérateurs lisent la
    //    forme texte « Projet,Urgent ».
    //  - Bool : Grist renvoie un booléen JS, jamais égal au mot français tapé dans la règle (« Oui », « Non »).
    //  - Date/DateTime : voir toUtcInstant, parseDateExpected et dayKey ci-dessus.
    // Sans `columnType`, les cas Bool et Date sont ignorés et la comparaison générale s'applique. Reference et ReferenceList n'ont pas de cas propre :
    // une colonne de référence n'arrive pas toujours sous la forme [id, valeur affichée] selon le chemin de lecture, elle passe par la comparaison
    // générale en texte. Choice (une seule chaîne) aussi.
    const type = String(columnType || '');

    if (operator === 'vide') return isEmpty(actual);
    if (operator === 'non vide') return !isEmpty(actual);

    // Chaque cas rend vrai ou faux quand il s'applique, null sinon : le premier qui décide l'emporte, la comparaison générale vient en dernier.
    return compareList(actual, operator, expected, type)
      ?? compareBool(actual, operator, expected, type)
      ?? compareDates(actual, operator, expected, type)
      ?? compareGeneral(actual, operator, expected);
  }

  // « vide » et « non vide » ne lisent aucune valeur : ni celle qu'on saisit, ni celle d'une autre colonne.
  const VALUELESS_OPERATORS = ['vide', 'non vide'];
  const isValueless = operator => VALUELESS_OPERATORS.indexOf(operator) !== -1;

  // Mode « autre colonne » d'une règle : `valueColumn` est une chaîne, « Colonne » ou « Table.Colonne » comme `column`. Vide tant que la colonne n'est
  // pas choisie (la fenêtre de condition garde alors la règle en cours de saisie) : la règle est incomplète et ignorée, comme une règle sans colonne.
  // Une règle sans `valueColumn` compare à `value`, comme avant.
  const inColumnMode = rule => !!rule && typeof rule.valueColumn === 'string';
  // Elle compare vraiment deux colonnes : colonne choisie et opérateur qui lit une valeur (la colonne d'un « vide » reste dite, elle ne sert pas).
  const comparesColumn = rule => inColumnMode(rule) && rule.valueColumn !== '' && !isValueless(rule.operator);

  // Une cellule vide pour une comparaison de colonnes : rien, chaîne vide, ou liste sans élément (une ChoiceList vide arrive aussi en tableau vide).
  const isBlank = v => isEmpty(v) || (Array.isArray(v) && v.length === 0);

  function expectedFromValue(value, type) {
    // La valeur d'une colonne lue comme celle qu'on aurait tapée dans le champ Valeur, pour que compareValues la comprenne : une date devient son jour
    // « AAAA-MM-JJ » (dans le fuseau de SA colonne, dayKeyInZone), qui est le format de GristDate.toString() que parseDateExpected sait lire ; un
    // nombre, un texte et un booléen se lisent tels quels ; une liste reste une liste, élément par élément.
    if (Array.isArray(value)) return value.map(item => expectedFromValue(item, type));
    const t = String(type || '');
    if (t === 'Date' || t.indexOf('DateTime') === 0) {
      const instant = toUtcInstant(value);
      if (instant) { const tz = dateTimeZone(t); return tz ? dayKeyInZone(instant, tz) : dayKey(instant); }
    }
    return value;
  }

  const itemKey = v => textOf(v).trim();
  const sameItems = (a, b) => {
    // Les deux listes ont les mêmes éléments, dans n'importe quel ordre : l'ordre d'un choix multiple est celui du clic, pas du sens.
    const left = new Set(a.map(itemKey));
    const right = new Set(b.map(itemKey));
    return left.size === right.size && Array.from(left).every(k => right.has(k));
  };

  function compareOperands(actual, operator, other, columnType, otherType) {
    // Une colonne contre une autre, sur la même ligne : `actual` est la valeur de la colonne de la règle (de type `columnType`), `other` celle de la
    // colonne comparée (de type `otherType`). Même comparaison que contre une valeur saisie (compareValues : nombres comparés en nombres, dates au jour
    // près, Oui / Non, « contient » en texte), sauf :
    //  - une cellule vide : deux cellules vides sont égales (« = » vrai, « ≠ » faux), une seule vide les distingue (« = » faux, « ≠ » vrai) ; « > »,
    //    « < », « ≥ », « ≤ » et « contient » ne disent rien d'une cellule vide, ils sont faux. Contre une valeur saisie, une cellule vide passait en
    //    texte (« vide < 5 » était vrai), ce qui ferait afficher une date de fin non remplie comme « avant » la date de début ;
    //  - une liste : contre une valeur seule, « = » veut dire « contient ce choix » (compareValues) ; à l'envers, la valeur seule est cherchée dans
    //    la liste de l'autre colonne ; deux listes sont égales quand elles ont les mêmes éléments, quel que soit l'ordre.
    if (isValueless(operator)) return compareValues(actual, operator, null, columnType);
    const actualBlank = isBlank(actual);
    const otherBlank = isBlank(other);
    if (actualBlank || otherBlank) {
      if (operator === '=') return actualBlank && otherBlank;
      if (operator === '≠') return actualBlank !== otherBlank;
      return false;
    }
    const expected = expectedFromValue(other, otherType);
    const equalOrNot = operator === '=' || operator === '≠';
    if (Array.isArray(expected) && equalOrNot) {
      const holds = Array.isArray(actual)
        ? sameItems(actual, expected)
        : expected.some(item => compareValues(actual, '=', item, columnType));
      return operator === '=' ? holds : !holds;
    }
    return compareValues(actual, operator, expected, columnType);
  }

  function parseColumnRef(rawColumn, tableId) {
    // « Colonne » d'une règle : nue (colonne de la table courante, ex. « TypeDossier ») ou qualifiée « Table.Colonne » pour une valeur d'une autre
    // table, résolue par #Variable : une lecture ponctuelle contre la même ligne, jamais une itération.
    const idx = String(rawColumn || '').indexOf('.');
    if (idx === -1) return { table: tableId, column: rawColumn };
    return { table: rawColumn.slice(0, idx), column: rawColumn.slice(idx + 1) };
  }

  async function readOperand(rawColumn, rule, tableId, record, opts) {
    // La valeur de la colonne `rawColumn` d'une règle pour cette ligne : { table, column, type, value, multi } (`multi` : une valeur par ligne liée, que
    // js/variables.js:resolveRawValue range en tableau), ou null quand elle ne se lit pas (la raison est au journal : la règle n'est pas remplie).
    const { table, column } = parseColumnRef(rawColumn, tableId);
    let value;
    let multi = false;
    try {
      const found = await Variables.resolveRawValue(table, column, tableId, record, opts);
      if (found.error) { console.error('[ConditionRules] valeur illisible pour la règle', rule, found.error); return null; }
      value = found.value;
      multi = !!found.multi;
    } catch (e) {
      console.error('[ConditionRules] échec de résolution de la règle', rule, e);
      return null;
    }
    // record[column] est undefined et la clé elle-même absente (pas seulement une valeur vide) : la colonne n'a jamais été transmise à ce widget pour
    // cette ligne. Cause la plus probable : colonne de la table courante non montrée dans le panneau de droite de ce widget (grist.onRecord,
    // includeColumns), ou renommée ou supprimée depuis la création de la règle. Sans cet avertissement, la règle échoue en « = » sans explication et
    // le cas par défaut l'emporte en silence.
    if (table === tableId && record && typeof value === 'undefined' && !(column in record)) {
      console.warn('[ConditionRules] règle sur la colonne "' + column + '" : absente de la ligne courante (record) - vérifiez qu\'elle existe toujours '
        + 'et qu\'elle est cochée dans les colonnes visibles de CE widget (panneau de droite), ou qu\'elle a bien un accès complet.', rule);
    }
    return { table, column, type: GristAPI.getColumnType(table, column), value, multi };
  }

  // Les valeurs à essayer une par une quand la colonne vient d'une table liée par correspondance (une valeur par ligne liée) : la règle est remplie si
  // au moins une ligne liée la remplit, une liste vide de lignes valant une seule valeur vide. null pour une colonne à valeur unique : comparer le
  // tableau entier retombait sur String(tableau) (« a,b »), donc jamais une date, un booléen ou « vide » correctement. Réservé à ce cas (`multi`, posé
  // par js/variables.js) : une ChoiceList ou une RefList de la table courante arrive aussi en tableau, que compareValues lit comme une liste (« = » :
  // contient ce choix).
  const perLinkedRows = operand => (operand.multi && Array.isArray(operand.value) ? (operand.value.length ? operand.value : [null]) : null);

  function holdsAgainstColumn(rule, left, right) {
    // La règle compare deux colonnes. Une colonne d'une table liée à plusieurs lignes se lit ligne par ligne ; deux colonnes de la MÊME table liée se
    // lisent ensemble, ligne liée par ligne liée (« Annuaire.Ville = Annuaire.Ville de naissance » vaut pour une même fiche), jamais l'une contre
    // l'autre en croisant les fiches ; deux tables liées différentes n'ont pas de ligne commune : une paire qui convient suffit.
    const one = (a, b) => compareOperands(a, rule.operator, b, left.type, right.type);
    const leftRows = perLinkedRows(left);
    const rightRows = perLinkedRows(right);
    if (!leftRows && !rightRows) return one(left.value, right.value);
    if (!rightRows) return leftRows.some(a => one(a, right.value));
    if (!leftRows) return rightRows.some(b => one(left.value, b));
    if (left.table === right.table && leftRows.length === rightRows.length) return leftRows.some((a, i) => one(a, rightRows[i]));
    return leftRows.some(a => rightRows.some(b => one(a, b)));
  }

  async function matches(rule, tableId, record, opts) {
    // `opts` (facultatif) est transmis tel quel à Variables.resolveRawValue, par exemple { fetchRows } pour lire chaque table une seule fois quand une
    // même condition est évaluée sur toutes les lignes d'une table (aperçu de la fenêtre de condition d'une variable, js/variable-condition.js).
    if (!rule || !rule.column) return false;
    const columnRule = comparesColumn(rule);
    const [left, right] = await Promise.all([
      readOperand(rule.column, rule, tableId, record, opts),
      columnRule ? readOperand(rule.valueColumn, rule, tableId, record, opts) : null,
    ]);
    if (!left || (columnRule && !right)) return false;
    if (columnRule) return holdsAgainstColumn(rule, left, right);
    // Colonne d'une autre table liée par correspondance (règle « match ») : une valeur par ligne liée, que la bulle affiche séparées par des virgules.
    const rows = perLinkedRows(left);
    if (rows) return rows.some(v => compareValues(v, rule.operator, rule.value, left.type));
    return compareValues(left.value, rule.operator, rule.value, left.type);
  }

  // Une règle complète a une colonne et, en mode « autre colonne », cette autre colonne (sauf pour « vide » / « non vide », qui n'en lisent aucune).
  const isCompleteRule = r => !!r && !!r.column && !(inColumnMode(r) && r.valueColumn === '' && !isValueless(r.operator));

  function normalizeCondition(condition) {
    // Condition d'affichage d'une bulle #Variable (attribut `condition` du nœud varBadge, js/editor-nodes.js) : { mode: 'all'|'any', rules: [...] }.
    // Les règles sans colonne (ligne laissée vide dans la fenêtre), ou qui comparent à une autre colonne pas encore choisie, sont ignorées ; sans
    // aucune règle complète, pas de condition (null).
    if (!condition || !Array.isArray(condition.rules)) return null;
    const rules = condition.rules.filter(isCompleteRule);
    if (!rules.length) return null;
    return { mode: condition.mode === 'any' ? 'any' : 'all', rules };
  }

  function plainRule(r) {
    // Une règle sous sa forme enregistrée : opérateur « = » par défaut, valeur en texte. Comparée à une autre colonne, elle garde `valueColumn` et n'a
    // pas de valeur saisie (une valeur laissée dans le brouillon ne s'enregistre pas) ; un `valueColumn` vide (rien choisi, sur un « vide » / « non
    // vide » qui n'en a pas besoin) ne s'enregistre pas non plus.
    const rule = { column: r.column, operator: r.operator || '=', value: r.value == null ? '' : String(r.value) };
    if (inColumnMode(r) && r.valueColumn !== '') { rule.value = ''; rule.valueColumn = r.valueColumn; }
    return rule;
  }

  function plainCondition(condition) {
    // La condition sous la forme enregistrée dans un nœud, ou gardée en brouillon par une fenêtre : une copie neuve (jamais un lien vers les règles que
    // la fenêtre modifie en place), sans les règles incomplètes (plainRule) ; null sans aucune règle complète.
    const normalized = normalizeCondition(condition);
    return normalized && { mode: normalized.mode, rules: normalized.rules.map(plainRule) };
  }

  async function conditionHolds(condition, tableId, record, opts) {
    // Vrai si la variable doit s'afficher pour cette ligne : pas de condition = toujours ; 'all' = toutes les règles, 'any' = au moins une. Une règle
    // illisible compte comme non remplie (comme pour les macro-modèles, cf. matches).
    const c = normalizeCondition(condition);
    if (!c) return true;
    const results = await Promise.all(c.rules.map(rule => matches(rule, tableId, record, opts)));
    return c.mode === 'any' ? results.some(Boolean) : results.every(Boolean);
  }

  async function elementHolds(el, tableId, record, whenNone) {
    // Verdict de la condition d'un élément du modèle (bloc, valeur, case ou bulle conditionnels), lue dans son attribut data-condition et évaluée avec
    // la ligne du tour de la zone répétée qui le contient (js/loop-rules.js:bindingOf) : une règle sur une colonne de la table de la boucle lit alors
    // cette ligne. `whenNone` : le verdict d'un élément sans condition ou sans règle complète. Une condition illisible, ou dont l'évaluation échoue, ne
    // laisse rien passer : faux, comme une règle illisible.
    const raw = el.getAttribute('data-condition');
    if (!raw) return whenNone;
    let condition;
    try { condition = JSON.parse(raw); } catch (e) { console.error('[ConditionRules] condition illisible', e); return false; }
    if (!normalizeCondition(condition)) return whenNone;
    const binding = LoopRules.bindingOf(el);
    try { return await conditionHolds(condition, tableId, record, binding ? { loop: binding } : undefined); }
    catch (e) { console.error('[ConditionRules] échec de l\'évaluation de la condition', e); return false; }
  }

  async function resolveElements(root, selector, tableId, record, whenNone, apply) {
    // Transforme, dans l'ordre du document, chaque élément `selector` de `root` selon le verdict de sa condition. Les verdicts se lisent tous d'abord,
    // en parallèle ; `apply(element, holds)` modifie ensuite le HTML. Un élément sorti de `root` par l'application précédente (le bloc extérieur retiré
    // emporte ceux qu'il contient) n'est plus traité.
    if (!root) return;
    const elements = Array.from(root.querySelectorAll(selector));
    if (!elements.length) return;
    const verdicts = await Promise.all(elements.map(el => elementHolds(el, tableId, record, whenNone)));
    elements.forEach((el, i) => { if (root.contains(el)) apply(el, verdicts[i]); });
  }

  return {
    OPERATORS, VALUELESS_OPERATORS, compareValues, compareOperands, inColumnMode, comparesColumn, parseBoolExpected, parseColumnRef, matches, normalizeCondition, plainCondition,
    conditionHolds, elementHolds, resolveElements,
  };
})();
