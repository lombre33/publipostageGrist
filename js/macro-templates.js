// Macro modèles (planning/feature-macro-modeles.md) — résolution d'un modèle TypeModele='macro' en un document unique, assemblé à partir d'autres modèles.
// Aucune dépendance DOM : ce module ne fait que choisir/concaténer du HTML BRUT (non résolu), toujours contre la MÊME ligne/table courante pour tous les
// slots (décision d'Antoine, 2026-09-20 - cf. le document de cadrage pour le "pourquoi", lié au Select By de Grist). Le HTML résultant est ensuite passé
// tel quel à ReaderMode.render()/preview() et aux exports PDF/DOCX, EXACTEMENT comme le contenu d'un modèle normal - aucun changement nécessaire dans ces
// modules pour ce qui est de la résolution #Variable/pagination, qui tourne une seule fois sur le document déjà assemblé.
const MacroTemplates = (function () {
  // Même marqueur que le nœud TipTap "Saut de page" (js/editor-nodes.js:899) - en réutilisant EXACTEMENT ce HTML, la pagination (reader-mode.js) et les
  // exports (pdf-export.js/docx-export.js) traitent une frontière de slot comme un saut de page manuel ordinaire, sans code spécifique aux macro modèles.
  const PAGE_BREAK_HTML = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';

  function isEmpty(v) { return v === null || v === undefined || v === ''; }

  // Reference/ReferenceList (colonnes "Ref:Table"/"RefList:Table", cf. js/grist-api.js:findReferenceColumns pour le format exact de ces chaînes de
  // type) : même déballage que Variables.unwrapRefValue (js/variables.js), pour la même raison - Grist renvoie un tableau [id, valeur affichée], jamais
  // comparable tel quel à la valeur texte saisie dans une règle. Ré-implémenté ici plutôt qu'exporté depuis variables.js : resolveRawValue lui-même ne
  // doit JAMAIS déballer automatiquement (Variables.resolveAttachmentIds a besoin de la valeur brute - un tableau d'ids de pièce jointe, jamais une
  // Reference - donc le déballage reste à la charge de chaque appelant qui connaît le vrai type de la colonne).
  function unwrapRefLike(v) { return Array.isArray(v) ? v[1] : v; }

  const BOOL_TRUE_WORDS = ['oui', 'vrai', 'true', '1', 'yes'];
  const BOOL_FALSE_WORDS = ['non', 'faux', 'false', '0', 'no'];
  function parseBoolExpected(expected) {
    const s = String(expected == null ? '' : expected).trim().toLowerCase();
    if (BOOL_TRUE_WORDS.indexOf(s) !== -1) return true;
    if (BOOL_FALSE_WORDS.indexOf(s) !== -1) return false;
    return null;
  }

  // "26/09/2026" (saisie humaine attendue, format FR) ou "2026-09-26" (ISO) - Date.parse seul est trop ambigu selon le moteur (DD/MM vs MM/DD) pour
  // être fiable ici ; une valeur qui ne correspond à aucun des deux renvoie null plutôt que de deviner.
  function parseDateExpected(expected) {
    const s = String(expected == null ? '' : expected).trim();
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    const fr = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    if (fr) return new Date(Number(fr[3]), Number(fr[2]) - 1, Number(fr[1]));
    return null;
  }
  function dayKey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  // '=', '≠', '>', '<', '≥', '≤', 'contient', 'vide', 'non vide' - même liste que planning/feature-conditional-content.md (jamais implémentée ailleurs,
  // donc rien à réutiliser). `columnType` (chaîne Grist telle que js/grist-api.js:getColumnType la renvoie - "Text","Numeric","Bool","Date",
  // "DateTime:UTC","Choice","Ref:Table",... - ou null/undefined si inconnue) pilote trois cas AVANT toute comparaison générique, chacun un vrai bug
  // trouvé le 2026-09-28 (Antoine : "la condition ne fonctionne pas") - sans elle, ces trois types de colonne ne pouvaient JAMAIS correspondre à
  // aucune valeur saisie, quel que soit son contenu :
  //  - Bool : Grist renvoie un booléen JS natif, jamais égal à la chaîne française tapée dans la règle ("Oui"/"Non").
  //  - Date/DateTime : Grist renvoie un nombre de secondes depuis 1970 (même format que js/variable-format.js:29), jamais numériquement égal à
  //    Number("26/09/2026") qui vaut NaN - la comparaison retombait alors en texte brut entre un timestamp et une date, qui ne coïncident jamais.
  //  - Reference/ReferenceList : un tableau [id, valeur affichée] ne correspond jamais à la valeur texte saisie tel quel (cf. unwrapRefLike ci-dessus).
  // Sans `columnType` (repli identique au comportement d'avant ce correctif, ex. les tests qui appellent compareValues sans ce 4e paramètre), ces trois
  // cas sont simplement ignorés et la comparaison générique s'applique comme avant.
  function compareValues(actual, operator, expected, columnType) {
    const type = String(columnType || '');
    if (type.indexOf('Ref:') === 0 || type.indexOf('RefList:') === 0) actual = unwrapRefLike(actual);

    if (operator === 'vide') return isEmpty(actual);
    if (operator === 'non vide') return !isEmpty(actual);

    if (type === 'Bool' && (actual === true || actual === false)) {
      const expectedBool = parseBoolExpected(expected);
      if (expectedBool !== null) {
        if (operator === '=') return actual === expectedBool;
        if (operator === '≠') return actual !== expectedBool;
      }
    }

    if ((type === 'Date' || type.indexOf('DateTime') === 0) && typeof actual === 'number' && isFinite(actual)) {
      const expectedDate = parseDateExpected(expected);
      if (expectedDate) {
        const actualDate = new Date(actual * 1000);
        switch (operator) {
          case '=': return dayKey(actualDate) === dayKey(expectedDate);
          case '≠': return dayKey(actualDate) !== dayKey(expectedDate);
          case '>': return actualDate.getTime() > expectedDate.getTime();
          case '<': return actualDate.getTime() < expectedDate.getTime();
          case '≥': return actualDate.getTime() >= expectedDate.getTime();
          case '≤': return actualDate.getTime() <= expectedDate.getTime();
          case 'contient': return false; // "contient" n'a pas de sens sur une date - jamais vrai plutôt que planter.
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

  async function ruleMatches(rule, tableId, record) {
    if (!rule || !rule.column) return false;
    const { table, column } = parseColumnRef(rule.column, tableId);
    let actual;
    try {
      const { value, error } = await Variables.resolveRawValue(table, column, tableId, record);
      if (error) { console.error('[MacroTemplates] valeur illisible pour la règle', rule, error); return false; }
      actual = value;
    } catch (e) {
      console.error('[MacroTemplates] échec de résolution de la règle', rule, e);
      return false;
    }
    const columnType = GristAPI.getColumnType(table, column);
    return compareValues(actual, rule.operator, rule.value, columnType);
  }

  // Renvoie l'id de modèle choisi pour ce slot contre cette ligne/table, ou null si le slot doit être absent du document assemblé.
  async function pickModeleId(slot, tableId, record) {
    if (!slot) return null;
    if (slot.type === 'fixed') return slot.modeleId != null ? slot.modeleId : null;
    if (slot.type === 'conditional') {
      const rules = Array.isArray(slot.rules) ? slot.rules : [];
      for (const rule of rules) {
        if (await ruleMatches(rule, tableId, record)) return rule.modeleId != null ? rule.modeleId : null;
      }
      return slot.defaultModeleId != null && slot.defaultModeleId !== '' ? slot.defaultModeleId : null;
    }
    return null;
  }

  // Construit le HTML BRUT (pas encore résolu) du document assemblé : un fragment par slot retenu, séparés par un saut de page. `templates` = le tableau
  // déjà chargé (Templates.getCached()), passé en paramètre plutôt que lu ici pour rester testable sans dépendre du module Templates dans dev-tests.
  async function buildConcatenatedHtml(macroSlots, tableId, record, templates) {
    const slots = (macroSlots && Array.isArray(macroSlots.slots)) ? macroSlots.slots : [];
    const fragments = [];
    for (const slot of slots) {
      let modeleId;
      try { modeleId = await pickModeleId(slot, tableId, record); }
      catch (e) { console.error('[MacroTemplates] échec de sélection de slot', slot, e); continue; }
      if (modeleId == null) continue;
      const tpl = templates.find(t => String(t.id) === String(modeleId));
      if (!tpl) { console.error('[MacroTemplates] modèle introuvable pour un slot, id=', modeleId); continue; }
      fragments.push(tpl.contenu || '');
    }
    return fragments.join(PAGE_BREAK_HTML);
  }

  return { compareValues, parseColumnRef, pickModeleId, buildConcatenatedHtml, PAGE_BREAK_HTML };
})();
