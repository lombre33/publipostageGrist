// Macro-modèles (planning/feature-macro-modeles.md) : un modèle de type « macro » devient un document unique, assemblé à partir d'autres modèles.
// Aucune dépendance au DOM : ce module ne fait que choisir et concaténer du HTML brut (non résolu), toujours contre la même ligne et la même table
// courantes pour tous les slots (le « Select By » de Grist en dépend ; voir le document de cadrage). Le HTML obtenu passe tel quel à
// ReaderMode.render()/preview() et aux exports PDF et Word, comme le contenu d'un modèle ordinaire : la résolution des #Variable et la pagination
// tournent une seule fois, sur le document déjà assemblé.
const MacroTemplates = (function () {
  // Même marqueur que le nœud TipTap « Saut de page » (js/editor-nodes.js) : avec exactement ce HTML, la pagination (reader-mode.js) et les exports
  // (pdf-export.js, docx-export.js) traitent la frontière entre deux slots comme un saut de page manuel ordinaire, sans code propre aux
  // macro-modèles.
  const PAGE_BREAK_HTML = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
  // Le saut de page qui ouvre le slot de rang `rank` (le 2e, le 3e... du document assemblé) : le même HTML, plus data-macro-slot. Les `top` des
  // images en calque d'un modèle se comptent depuis le haut de sa première page ; une fois les slots mis bout à bout, la Lecture (ReaderMode.render)
  // et l'export PDF (js/pdf-export.js) s'en servent pour retrouver où chaque slot commence et y rebaser ses images, sans quoi elles s'empileraient
  // toutes en haut du premier slot.
  function slotBreakHtml(rank) { return PAGE_BREAK_HTML.replace('<div ', '<div data-macro-slot="' + rank + '" '); }

  // L'évaluation d'une règle { column, operator, value } contre la ligne courante (comparaison, colonnes Oui/Non et Date, fuseau, avertissement
  // « colonne absente de la ligne ») est dans js/condition-rules.js, partagée avec les variables conditionnelles.

  // Les modèles qu'une position de la composition peut donner, sans doublon : celui de la page de garde, ou celui de chaque règle d'une annexe puis
  // son modèle par défaut. Le résumé du macro-modèle (js/macro-editor.js) en fait une ligne par position ; l'œil d'un modèle et l'enregistrement de
  // la fenêtre de composition s'en servent pour savoir lesquels existent encore.
  function slotModelIds(slot) {
    if (!slot) return [];
    const candidates = slot.type === 'fixed'
      ? [slot.modeleId]
      : (Array.isArray(slot.rules) ? slot.rules : []).map(rule => rule && rule.modeleId).concat(slot.defaultModeleId);
    const ids = candidates.filter(id => id != null && id !== '');
    return ids.filter((id, index) => ids.findIndex(other => String(other) === String(id)) === index);
  }

  // Modèle masqué (l'œil du résumé) : `hiddenModeleIds`, dans sa position de la composition, liste les modèles de cette position que la Lecture et
  // toutes les sorties (PDF, PDF unique, lots, Word, Excel, courrier) laissent de côté. Le modèle reste dans la composition, avec ses règles :
  // masquer n'enlève rien, démasquer remet tout comme avant. Les identifiants se comparent en texte (la fenêtre de composition les écrit en texte,
  // Grist les rend en nombre).
  function isModelHidden(slot, modeleId) {
    const hidden = slot && Array.isArray(slot.hiddenModeleIds) ? slot.hiddenModeleIds : [];
    return modeleId != null && modeleId !== '' && hidden.some(id => String(id) === String(modeleId));
  }

  // La composition avec ce modèle masqué (hidden = true) ou affiché (false) dans la position `slotIndex` : une copie, jamais la composition reçue.
  // Une position qui n'a plus rien de masqué perd sa liste, pour qu'une composition sans modèle masqué ne porte aucune clé en plus.
  function withModelHidden(macroSlots, slotIndex, modeleId, hidden) {
    const copy = JSON.parse(JSON.stringify(macroSlots && Array.isArray(macroSlots.slots) ? macroSlots : { slots: [] }));
    const slot = copy.slots[slotIndex];
    if (!slot || modeleId == null || modeleId === '') return copy;
    const kept = (Array.isArray(slot.hiddenModeleIds) ? slot.hiddenModeleIds : []).filter(id => String(id) !== String(modeleId));
    if (hidden) kept.push(modeleId);
    if (kept.length) slot.hiddenModeleIds = kept; else delete slot.hiddenModeleIds;
    return copy;
  }

  // Reporte sur `target` (une position qu'on vient de reconstruire) ceux de ses modèles que `source` (la même position avant la reconstruction)
  // masquait : un modèle retiré de la position ne laisse pas son masquage derrière lui, un autre modèle mis à sa place repart affiché.
  function keepHidden(target, source) {
    const ids = slotModelIds(target).filter(id => isModelHidden(source, id));
    if (ids.length) target.hiddenModeleIds = ids;
    return target;
  }

  // Renvoie l'id de modèle choisi pour ce slot contre cette ligne/table, ou null si le slot doit être absent du document assemblé (ni règle ni modèle
  // par défaut, ou modèle masqué par son œil). Le modèle choisi par la première règle qui correspond est le seul candidat, masqué ou non : masquer un
  // modèle ne fait jamais passer une règle suivante ni le modèle par défaut à sa place.
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

  // Construit le HTML brut (pas encore résolu) du document assemblé : un fragment par slot retenu, séparés par un saut de page. `templates` : le
  // tableau déjà chargé (Templates.getCached()), passé en paramètre plutôt que lu ici pour rester testable sans le module Templates.
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

  return { pickModeleId, buildConcatenatedHtml, PAGE_BREAK_HTML, slotBreakHtml, slotModelIds, isModelHidden, withModelHidden, keepHidden };
})();
