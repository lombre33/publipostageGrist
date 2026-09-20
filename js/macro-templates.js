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

  // '=', '≠', '>', '<', '≥', '≤', 'contient', 'vide', 'non vide' - même liste que planning/feature-conditional-content.md (jamais implémentée ailleurs,
  // donc rien à réutiliser). Comparaison numérique si les deux côtés sont des nombres valides (une colonne Numeric renvoie déjà un number, mais la valeur
  // de règle saisie dans l'éditeur macro est toujours une chaîne) ; comparaison texte sinon.
  function compareValues(actual, operator, expected) {
    if (operator === 'vide') return isEmpty(actual);
    if (operator === 'non vide') return !isEmpty(actual);
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
    const aStr = String(isEmpty(actual) ? '' : actual);
    const eStr = String(isEmpty(expected) ? '' : expected);
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
    return compareValues(actual, rule.operator, rule.value);
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
