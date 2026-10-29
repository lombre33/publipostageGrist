// Les règles de liaison entre tables (js/grist-api.js : saveLinkRule, deleteLinkRule) dans l'historique d'Annuler / Rétablir (Ctrl + Z, Ctrl + Y, Ctrl + Maj + Z, boutons de la barre). Trois gestes les écrivent : la fenêtre de la clé, ouverte
// à l'insertion d'une variable d'une autre table sans lien encore réglé ou par le crayon de « Tables liées » (js/variables.js : configureLink) ; la corbeille de « Tables liées » (confirmDeleteLinkRule) ; le lien posé d'office pour une colonne
// Référence de la page (js/variable-linked-attrs.js : ensureLink). Chacun passe par `track` au lieu d'écrire seul : le geste est écrit comme avant, puis posé dans la pile de js/action-history.js avec le lien d'avant et celui d'après,
// pour la table liée qu'il vise.
//
// Les liens sont au document, pas dans un modèle : ils se défont depuis n'importe quel modèle, comme le ★. Défaire rend le lien d'AVANT (aucun : il est retiré), rétablir celui d'APRÈS, par la même écriture que le geste (une ligne de la table des
// liens, ajoutée, mise à jour ou retirée ; une ligne rendue peut y reprendre un autre numéro, que rien ne mémorise). Un lien qui n'est plus dans l'état que l'action a laissé - réglé de nouveau depuis, suivi dans un renommage de table - n'est
// jamais écrasé : rien n'est écrit et le coin d'état le dit. Un lien qu'il faudrait rendre à une table disparue n'est pas écrit non plus. Un geste qui ne change aucun lien ne laisse pas de pas à défaire, ni une écriture refusée.
//
// Un lien créé à l'insertion d'une variable est un pas à part de la variable : Ctrl + Z défait la variable, le suivant retire le lien (l'ordre des gestes, comme pour toute autre action). Il est retiré même si d'autres modèles s'en servent déjà - comme
// la corbeille de « Tables liées », sans la question -, et Ctrl + Y le rend.
const LinkRuleHistory = (function () {
  // Un lien tel que l'historique le compare : son mode et, pour une correspondance, ses deux colonnes (la ligne fixe n'en a pas). null : pas de lien.
  function shape(rule) {
    if (!rule) return null;
    return rule.mode === 'match' ? { mode: rule.mode, colonneCible: rule.colonneCible, colonneSource: rule.colonneSource } : { mode: rule.mode };
  }
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // Les liens de la table liée `tableCible`, par table de la page ('' : le lien commun à toutes les tables).
  function linksOf(tableCible) {
    const found = {};
    GristAPI.getAllLinkRules().forEach(rule => { if (rule.tableCible === tableCible) found[rule.tableSource || ''] = shape(rule); });
    return found;
  }

  // Amène les liens à l'état d'avant (`side` 'from') ou d'après (`side` 'to') le geste. Tout est vérifié avant d'écrire : un seul lien qui a changé depuis, et rien ne se passe.
  function put(changes, side) {
    const left = side === 'from' ? 'to' : 'from';
    return async function () {
      const tables = GristAPI.getTables();
      changes.forEach(change => {
        if (!same(shape(GristAPI.findLinkRule(change.tableCible, change.tableSource)), change[left])) throw ActionHistory.conflict(I18n.t('history.linkChanged'));
        if (change[side] && [change.tableCible, change.tableSource].some(table => table && tables.indexOf(table) === -1)) throw ActionHistory.conflict(I18n.t('history.linkTableGone'));
      });
      for (const change of changes) {
        if (change[side]) await GristAPI.saveLinkRule(change.tableCible, Object.assign({}, change[side], { tableSource: change.tableSource }));
        else await GristAPI.deleteLinkRule(change.tableCible, change.tableSource);
      }
      Variables.refreshLinkRulesPanel();
      Editor.refreshLinkState();
      const first = changes[0];
      const link = Variables.linkRuleLabel(Object.assign({ tableCible: first.tableCible, tableSource: first.tableSource }, first[side] || first[left]));
      return I18n.t(first[side] ? 'status.linkRestored' : 'status.linkRemoved', { link });
    };
  }

  // `work` écrit ou retire des liens de la table liée `tableCible` (saveLinkRule, deleteLinkRule) ; ce qu'il a changé devient un pas de l'historique. Rend ce que rend `work`. Une erreur passe telle quelle, sans pas.
  async function track(tableCible, work) {
    const before = linksOf(tableCible);
    const result = await work();
    const after = linksOf(tableCible);
    const changes = Object.keys(Object.assign({}, before, after))
      .filter(source => !same(before[source] || null, after[source] || null))
      .map(source => ({ tableCible, tableSource: source, from: before[source] || null, to: after[source] || null }));
    if (changes.length) ActionHistory.add({ undo: put(changes, 'from'), redo: put(changes, 'to') });
    return result;
  }

  return { track };
})();
