// Macro modèles (planning/feature-macro-modeles.md) — résolution d'un modèle TypeModele='macro' en un document unique, assemblé à partir d'autres modèles.
// Aucune dépendance DOM : ce module ne fait que choisir/concaténer du HTML BRUT (non résolu), toujours contre la MÊME ligne/table courante pour tous les
// slots (décision d'Antoine, 2026-09-20 - cf. le document de cadrage pour le "pourquoi", lié au Select By de Grist). Le HTML résultant est ensuite passé
// tel quel à ReaderMode.render()/preview() et aux exports PDF/DOCX, EXACTEMENT comme le contenu d'un modèle normal - aucun changement nécessaire dans ces
// modules pour ce qui est de la résolution #Variable/pagination, qui tourne une seule fois sur le document déjà assemblé.
const MacroTemplates = (function () {
  // Même marqueur que le nœud TipTap "Saut de page" (js/editor-nodes.js:899) - en réutilisant EXACTEMENT ce HTML, la pagination (reader-mode.js) et les
  // exports (pdf-export.js/docx-export.js) traitent une frontière de slot comme un saut de page manuel ordinaire, sans code spécifique aux macro modèles.
  const PAGE_BREAK_HTML = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';

  // Évaluation d'une règle { column, operator, value } contre la ligne courante (compareValues, Bool/Date/fuseau de colonne, avertissement "colonne
  // absente de la ligne") : js/condition-rules.js, partagé avec les variables conditionnelles - jamais recopié ici.

  // Renvoie l'id de modèle choisi pour ce slot contre cette ligne/table, ou null si le slot doit être absent du document assemblé.
  async function pickModeleId(slot, tableId, record) {
    if (!slot) return null;
    if (slot.type === 'fixed') return slot.modeleId != null ? slot.modeleId : null;
    if (slot.type === 'conditional') {
      const rules = Array.isArray(slot.rules) ? slot.rules : [];
      for (const rule of rules) {
        if (await ConditionRules.matches(rule, tableId, record)) return rule.modeleId != null ? rule.modeleId : null;
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

  // compareValues/parseColumnRef restent exposés ici (même API qu'avant le déplacement, utilisée par dev-tests/scenarios-macro-modeles.js).
  return { compareValues: ConditionRules.compareValues, parseColumnRef: ConditionRules.parseColumnRef, pickModeleId, buildConcatenatedHtml, PAGE_BREAK_HTML };
})();
