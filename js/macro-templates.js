// Macro modèles (planning/feature-macro-modeles.md) — résolution d'un modèle TypeModele='macro' en un document unique, assemblé à partir d'autres modèles.
// Aucune dépendance DOM : ce module ne fait que choisir/concaténer du HTML BRUT (non résolu), toujours contre la MÊME ligne/table courante pour tous les
// slots (décision d'Antoine, 2026-09-20 - cf. le document de cadrage pour le "pourquoi", lié au Select By de Grist). Le HTML résultant est ensuite passé
// tel quel à ReaderMode.render()/preview() et aux exports PDF/DOCX, EXACTEMENT comme le contenu d'un modèle normal - aucun changement nécessaire dans ces
// modules pour ce qui est de la résolution #Variable/pagination, qui tourne une seule fois sur le document déjà assemblé.
const MacroTemplates = (function () {
  // Même marqueur que le nœud TipTap "Saut de page" (js/editor-nodes.js:899) - en réutilisant EXACTEMENT ce HTML, la pagination (reader-mode.js) et les
  // exports (pdf-export.js/docx-export.js) traitent une frontière de slot comme un saut de page manuel ordinaire, sans code spécifique aux macro modèles.
  const PAGE_BREAK_HTML = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
  // Le saut de page qui OUVRE le slot de rang `rank` (le 2e, le 3e... du document assemblé) : le même HTML, plus data-macro-slot. Les `top` des images en calque d'un
  // modèle se comptent depuis le haut de SA première page ; une fois les slots mis bout à bout, la Lecture (ReaderMode.render) et l'export PDF (js/pdf-export.js) s'en
  // servent pour retrouver où chaque slot commence et y rebaser ses images, sans quoi elles s'empilaient toutes en haut du premier slot.
  function slotBreakHtml(rank) { return PAGE_BREAK_HTML.replace('<div ', '<div data-macro-slot="' + rank + '" '); }

  // Évaluation d'une règle { column, operator, value } contre la ligne courante (compareValues, Bool/Date/fuseau de colonne, avertissement "colonne
  // absente de la ligne") : js/condition-rules.js, partagé avec les variables conditionnelles - jamais recopié ici.

  // Les modèles qu'une position de la composition peut donner, sans doublon : celui de la page de garde, ou celui de chaque règle d'une annexe puis son modèle par défaut. Le résumé du macro-modèle
  // (js/macro-editor.js) en fait une ligne par position ; l'œil d'un modèle et l'enregistrement de la fenêtre de composition s'en servent pour savoir lesquels existent encore.
  function slotModelIds(slot) {
    if (!slot) return [];
    const ids = slot.type === 'fixed' ? [slot.modeleId] : (Array.isArray(slot.rules) ? slot.rules : []).map(rule => rule && rule.modeleId).concat(slot.defaultModeleId);
    return ids.filter((id, index) => id != null && id !== '' && ids.findIndex(other => other != null && String(other) === String(id)) === index);
  }

  // Modèle masqué (œil du résumé, demande d'Antoine du 04/10) : `hiddenModeleIds`, dans SA position de la composition, liste les modèles de cette position que la Lecture et toutes les sorties
  // (PDF, PDF unique, lots, Word, Excel, courrier) laissent de côté. Le modèle reste dans la composition, avec ses règles : masquer n'enlève rien, démasquer remet tout comme avant. Les
  // identifiants se comparent en texte (la fenêtre de composition les écrit en texte, Grist les rend en nombre).
  function isModelHidden(slot, modeleId) {
    const hidden = slot && Array.isArray(slot.hiddenModeleIds) ? slot.hiddenModeleIds : [];
    return modeleId != null && modeleId !== '' && hidden.some(id => String(id) === String(modeleId));
  }

  // La composition avec ce modèle masqué (hidden = true) ou affiché (false) dans la position `slotIndex` : une copie, jamais la composition reçue. Une position qui n'a plus rien de masqué perd sa
  // liste, pour qu'une composition sans modèle masqué reste telle qu'elle était avant cette fonction.
  function withModelHidden(macroSlots, slotIndex, modeleId, hidden) {
    const copy = JSON.parse(JSON.stringify(macroSlots && Array.isArray(macroSlots.slots) ? macroSlots : { slots: [] }));
    const slot = copy.slots[slotIndex];
    if (!slot || modeleId == null || modeleId === '') return copy;
    const kept = (Array.isArray(slot.hiddenModeleIds) ? slot.hiddenModeleIds : []).filter(id => String(id) !== String(modeleId));
    if (hidden) kept.push(modeleId);
    if (kept.length) slot.hiddenModeleIds = kept; else delete slot.hiddenModeleIds;
    return copy;
  }

  // Reporte sur `target` (une position qu'on vient de reconstruire) ceux de ses modèles que `source` (la même position avant la reconstruction) masquait : un modèle retiré de la position ne laisse
  // pas son masquage derrière lui, un autre modèle mis à sa place repart affiché.
  function keepHidden(target, source) {
    const ids = slotModelIds(target).filter(id => isModelHidden(source, id));
    if (ids.length) target.hiddenModeleIds = ids;
    return target;
  }

  // Renvoie l'id de modèle choisi pour ce slot contre cette ligne/table, ou null si le slot doit être absent du document assemblé (ni règle ni modèle par défaut, ou modèle masqué par son œil).
  // Le modèle choisi par la première règle qui correspond est le seul candidat, masqué ou non : masquer un modèle ne fait jamais passer une règle suivante ni le modèle par défaut à sa place.
  async function pickModeleId(slot, tableId, record) {
    const chosen = await chooseModeleId(slot, tableId, record);
    return chosen != null && isModelHidden(slot, chosen) ? null : chosen;
  }

  async function chooseModeleId(slot, tableId, record) {
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
    return fragments.reduce((html, fragment, rank) => html + (rank ? slotBreakHtml(rank) : '') + fragment, '');
  }

  // compareValues/parseColumnRef restent exposés ici (même API qu'avant le déplacement, utilisée par dev-tests/scenarios-macro-modeles.js).
  return { compareValues: ConditionRules.compareValues, parseColumnRef: ConditionRules.parseColumnRef, pickModeleId, buildConcatenatedHtml, PAGE_BREAK_HTML, slotBreakHtml, slotModelIds, isModelHidden, withModelHidden, keepHidden };
})();
