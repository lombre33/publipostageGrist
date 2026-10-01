// Conditions « colonne opérateur valeur » sur une ligne Grist - évaluation partagée entre les macro-modèles (js/macro-templates.js, choix d'une annexe) et
// les variables conditionnelles (maquette du 2026-09-28). Aucune dépendance DOM. Déplacé tel quel depuis js/macro-templates.js (mêmes garde-fous Bool,
// Date/DateTime et fuseau de colonne) pour qu'il n'existe jamais deux copies de compareValues à maintenir. Une règle = { column, operator, value } ;
// `column` nue (table courante) ou qualifiée "Table.Colonne" (cf. parseColumnRef).
const ConditionRules = (function () {
  // Opérateurs proposés dans les fenêtres de règles (macro-modèles, variables conditionnelles) - l'ordre est celui des listes déroulantes.
  const OPERATORS = ['=', '≠', '>', '<', '≥', '≤', 'contient', 'vide', 'non vide'];

  function isEmpty(v) { return v === null || v === undefined || v === ''; }

  // Les mots d'une règle sur une colonne Oui / Non que la comparaison lit : seuls ceux-là valent vrai ou faux, tout autre texte ne correspond à rien. Exportée :
  // la liste Oui / Non du champ Valeur (js/condition-fields.js:buildBoolList) range une valeur déjà enregistrée avec la même lecture, jamais avec sa propre liste de mots.
  const BOOL_TRUE_WORDS = ['oui', 'vrai', 'true', '1', 'yes'];
  const BOOL_FALSE_WORDS = ['non', 'faux', 'false', '0', 'no'];
  function parseBoolExpected(expected) {
    const s = String(expected == null ? '' : expected).trim().toLowerCase();
    if (BOOL_TRUE_WORDS.indexOf(s) !== -1) return true;
    if (BOOL_FALSE_WORDS.indexOf(s) !== -1) return false;
    return null;
  }

  // Un Date/DateTime arrive sous DEUX formes réelles selon le chemin de lecture (vérifié à la source grist-core, cf. mémoire d'équipe
  // project-publipostage-macro-condition-columntype-fix) : un objet type Date (GristDate/GristDateTime, décodé par grist.onRecord - le chemin
  // aperçu/lecture d'un macro-modèle, js/main.js:530) représentant un instant UTC, OU un NOMBRE de secondes UTC depuis 1970 (chemin export en lot
  // multi-lignes, js/main.js:779/846, même format que js/variable-format.js:29). isDateLike couvre le premier cas sans supposer lequel des deux le
  // columnType impose - un même correctif sert donc les deux chemins.
  function isDateLike(v) { return v instanceof Date && !isNaN(v.getTime()); }
  function toUtcInstant(actual) {
    if (isDateLike(actual)) return actual;
    if (typeof actual === 'number' && isFinite(actual)) return new Date(actual * 1000);
    return null;
  }
  function daysInMonth(year, month1based) { return new Date(Date.UTC(year, month1based, 0)).getUTCDate(); }
  // "26/09/2026" (saisie humaine attendue, format FR) ou "2026-09-26" (ISO, format de GristDate.toString()) - Date.parse seul est trop ambigu selon
  // le moteur (DD/MM vs MM/DD) pour être fiable ici. Construit en UTC (Date.UTC, jamais `new Date(y,m,d)` qui interprète en heure LOCALE) pour que la
  // comparaison ne dépende JAMAIS du fuseau du navigateur/serveur qui l'exécute - une valeur Grist représente un jour calendaire, pas un instant local
  // (bug trouvé le 2026-09-28 : `new Date(y,m,d)` en heure locale décalait le jour d'un cran à l'ouest de l'UTC, ex. New York). Rejette un jour/mois
  // hors bornes (ex. "31/02/2026", ou "09/26/2026" pris pour DD/MM avec mois=26) au lieu de laisser Date.UTC déborder silencieusement sur un autre
  // mois/année (audit du coordinateur, 2026-09-28) - une date saisie invalide ne matche alors jamais plutôt que de matcher une date fausse.
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
  // getUTC*, jamais getFullYear/getMonth/getDate (heure locale) - même raison que parseDateExpected ci-dessus. Jour calendaire NU (colonne Date, ou la
  // valeur "expected" saisie dans la règle, toujours sans fuseau) - pour une colonne DateTime:<fuseau>, cf. dayKeyInZone ci-dessous.
  function dayKey(d) { return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0'); }
  // Jour calendaire d'un instant DANS LE FUSEAU DE LA COLONNE (ex. "DateTime:Europe/Paris") : sans ça, un DateTime pris le soir à Paris (23h30, encore
  // le 26/09 à Paris) est déjà le 27/09 en UTC, et "= 26/09/2026" échouerait à tort (audit du coordinateur, 2026-09-28, trouvé en vérifiant CE correctif,
  // séparément du bug Choice d'Antoine dont la cause est ailleurs - cf. js/grist-api.js:includeColumns). 'en-CA' est le format Intl qui rend directement
  // "AAAA-MM-JJ", sans repasser par une regex.
  function dayKeyInZone(d, tz) {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); }
    catch (e) { return dayKey(d); } // fuseau que le moteur JS ne reconnaît pas (très rare) : repli UTC plutôt que planter la comparaison.
  }
  // "DateTime:Europe/Paris" -> "Europe/Paris" ; "DateTime" seul (sans fuseau explicite) ou "Date" -> null, jour UTC nu (dayKey), déjà correct pour ces
  // deux cas (vérifié à la source grist-core, extractInfoFromColType : le fuseau est tout ce qui suit le premier ":").
  function dateTimeZone(columnType) {
    const t = String(columnType || '');
    return t.indexOf('DateTime:') === 0 ? t.slice('DateTime:'.length) : null;
  }

  // '=', '≠', '>', '<', '≥', '≤', 'contient', 'vide', 'non vide' - même liste que planning/feature-conditional-content.md (jamais implémentée ailleurs,
  // donc rien à réutiliser). `columnType` (chaîne Grist telle que js/grist-api.js:getColumnType la renvoie - "Text","Numeric","Bool","Date",
  // "DateTime:UTC","Choice","Ref:Table",... - ou null/undefined si inconnue) pilote deux cas AVANT toute comparaison générique, chacun un vrai bug
  // trouvé le 2026-09-28 (Antoine : "la condition ne fonctionne pas") - sans elle, ces deux types de colonne ne pouvaient JAMAIS correspondre à
  // aucune valeur saisie, quel que soit son contenu :
  //  - Bool : Grist renvoie un booléen JS natif, jamais égal à la chaîne française tapée dans la règle ("Oui"/"Non").
  //  - Date/DateTime : cf. toUtcInstant/parseDateExpected/dayKey ci-dessus.
  // Reference/ReferenceList N'EST PAS géré ici : une 1ère tentative (colonne toujours un tableau [id, valeur affichée]) s'est révélée fausse sur les
  // deux chemins réels (audit du coordinateur, 2026-09-28) et provoquait même une régression sur ReferenceList (repli sur comparaison générique en
  // texte, désormais explicitement conservé) - condition non fiable sur ce type de colonne pour l'instant, à traiter séparément.
  // Une LISTE (choix multiples, liste de références : un tableau) : « = » veut dire « contient ce choix » et « ≠ » « ne le contient pas » - choix d'Antoine
  // du 2026-09-29 (« = Projet » retient donc aussi une ligne Projet + Urgent), le même sens que le filtre d'une boucle (js/loop-rules.js:ruleHolds). Avant, le
  // tableau retombait sur sa forme texte « Projet,Urgent » : « = Projet » était faux et « ≠ Projet » vrai pour une ligne qui a pourtant ce choix. Une règle
  // sur une valeur seule (Choice, texte...) ne change pas ; les autres opérateurs sur une liste non plus.
  // Choice (sélection UNIQUE, une simple chaîne) passe par le repli générique ci-dessous.
  // Sans `columnType` (repli identique au comportement d'avant ce correctif, ex. les tests qui appellent compareValues sans ce 4e paramètre), les cas Bool et
  // Date sont simplement ignorés et la comparaison générique s'applique comme avant.
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
      if (expectedBool !== null) {
        if (operator === '=') return actual === expectedBool;
        if (operator === '≠') return actual !== expectedBool;
      }
    }

    if (type === 'Date' || type.indexOf('DateTime') === 0) {
      const actualDate = toUtcInstant(actual);
      if (actualDate) {
        const tz = dateTimeZone(type);
        const aKey = tz ? dayKeyInZone(actualDate, tz) : dayKey(actualDate);
        // "contient" à part, AVANT d'exiger que `expected` soit une date COMPLÈTE valide : un vrai "contient" cherche un fragment ("2026", "09-26"),
        // jamais une date entière - sinon ça revient juste à refaire "=" (audit du coordinateur, 2026-09-28 : avant ce correctif, "contient" était
        // toujours faux ici, ce qui régressait par rapport à AVANT le tout premier correctif (0b2550e), où ça marchait par coïncidence de format sur le
        // chemin aperçu seulement - String(GristDate) -> "AAAA-MM-JJ", objtypes.ts). aKey (même jour calendaire, dans le fuseau de la colonne) marche
        // pareil sur les deux chemins de lecture, sans coïncidence.
        if (operator === 'contient') return aKey.indexOf(String(expected == null ? '' : expected).trim().toLowerCase()) !== -1;
        const expectedDate = parseDateExpected(expected);
        // `expected` illisible en date (ex. "31/02/2026", ou vide) : faux pour TOUS les opérateurs restants, jamais un repli sur la comparaison
        // générique en texte ci-dessous - sinon ">"/"≥"/"<" retombaient sur un ordre lexicographique de chaînes et matchaient parfois par accident
        // (ex. "> 09/26/2026" ou "≥ 09/26/2026" matchaient le 26/09/2026 ; régression trouvée seulement sur ces opérateurs, "=" étant déjà correct
        // depuis le premier correctif - audit du coordinateur, 2026-09-28).
        if (!expectedDate) return false;
        // Comparaison à la granularité JOUR pour TOUS les autres opérateurs (dans le fuseau de la colonne pour DateTime:<fuseau>, en UTC nu pour
        // Date - déjà correct sans fuseau, cf. GristDate.toString()) : la modale ne propose de saisir qu'un jour, jamais une heure (placeholder),
        // donc comparer l'instant exact rendait "=" (jour) et ">"/"≤" (instant) incohérents entre eux pour une même valeur - ex. 14h le jour J
        // matchait à la fois "= J" et "> J", alors que "≤ J" échouait (audit du coordinateur, 2026-09-28).
        const eKey = dayKey(expectedDate);
        switch (operator) {
          case '=': return aKey === eKey;
          case '≠': return aKey !== eKey;
          case '>': return aKey > eKey;
          case '<': return aKey < eKey;
          case '≥': return aKey >= eKey;
          case '≤': return aKey <= eKey;
          default: return false;
        }
      }
    }

    if (operator === 'contient') return String(isEmpty(actual) ? '' : actual).toLowerCase().indexOf(String(expected).toLowerCase()) !== -1;
    const aNum = Number(actual);
    const eNum = Number(expected);
    const bothNumeric = !isEmpty(actual) && !isEmpty(expected) && actual !== true && actual !== false && isFinite(aNum) && isFinite(eNum);
    if (bothNumeric) {
      switch (operator) {
        case '=': return aNum === eNum;
        case '≠': return aNum !== eNum;
        case '>': return aNum > eNum;
        case '<': return aNum < eNum;
        case '≥': return aNum >= eNum;
        case '≤': return aNum <= eNum;
      }
    }
    // .trim() : une valeur copiée-collée dans Grist ou dans la règle avec un espace en trop ne doit pas suffire à casser un "=" par ailleurs correct.
    const aStr = String(isEmpty(actual) ? '' : actual).trim();
    const eStr = String(isEmpty(expected) ? '' : expected).trim();
    switch (operator) {
      case '=': return aStr === eStr;
      case '≠': return aStr !== eStr;
      case '>': return aStr > eStr;
      case '<': return aStr < eStr;
      case '≥': return aStr >= eStr;
      case '≤': return aStr <= eStr;
      default: return false;
    }
  }

  // "Colonne" d'une règle : nue (colonne de la table courante, ex. "TypeDossier") ou qualifiée "Table.Colonne" pour une valeur cross-table déjà
  // résolvable aujourd'hui via #Variable - une LECTURE ponctuelle contre la même ligne/table courante, jamais une itération (cf. le document de cadrage).
  function parseColumnRef(rawColumn, tableId) {
    const idx = String(rawColumn || '').indexOf('.');
    if (idx === -1) return { table: tableId, column: rawColumn };
    return { table: rawColumn.slice(0, idx), column: rawColumn.slice(idx + 1) };
  }

  // `opts` (facultatif) est transmis tel quel à Variables.resolveRawValue - ex. { fetchRows } pour lire chaque table une seule fois quand une même
  // condition est évaluée sur toutes les lignes d'une table (aperçu de la fenêtre de condition d'une variable, js/variable-condition.js).
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
    // Colonne d'une autre table liée par correspondance (règle "match") : une valeur PAR ligne liée, la bulle les affichant séparées par des virgules.
    // La règle est remplie si AU MOINS UNE ligne liée la remplit - comparer le tableau entier retombait sur String(tableau) ("a,b"), donc jamais une date,
    // un booléen ou « vide » correctement, même pour une seule ligne liée. Réservé à ce cas (`multi`, posé par js/variables.js) : une ChoiceList ou une
    // RefList de la table courante arrive elle aussi en tableau, que compareValues lit comme une liste (« = » : contient ce choix).
    if (perLinkedRow && Array.isArray(actual)) {
      if (!actual.length) return compareValues(null, rule.operator, rule.value, columnType);
      return actual.some(v => compareValues(v, rule.operator, rule.value, columnType));
    }
    // record[column] === undefined ET la clé elle-même absente (pas juste une valeur vide) : la colonne n'a jamais été transmise à ce widget pour cette
    // ligne. Cause la plus probable, colonne de la table courante non montrée dans le panneau de droite DE CE WIDGET (grist.onRecord, includeColumns -
    // désormais 'normal' dans js/grist-api.js, mais une colonne renommée/supprimée depuis la création de la règle donne le même symptôme). Sans cet
    // avertissement, la règle échoue en "=" sans aucune explication et le cas par défaut l'emporte silencieusement (Antoine, 2026-09-28).
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
  // illisible compte comme non remplie (même choix que pour les macro-modèles, cf. matches).
  async function conditionHolds(condition, tableId, record, opts) {
    const c = normalizeCondition(condition);
    if (!c) return true;
    const results = await Promise.all(c.rules.map(rule => matches(rule, tableId, record, opts)));
    return c.mode === 'any' ? results.some(Boolean) : results.every(Boolean);
  }

  return { OPERATORS, compareValues, parseBoolExpected, parseColumnRef, matches, normalizeCondition, conditionHolds };
})();
