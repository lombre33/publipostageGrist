// Les abréviations de la personne (js/text-expansion.js ; Réglages > Raccourcis > Abréviations) dans l'historique d'Annuler / Rétablir (Ctrl + Z, Ctrl + Y, Ctrl + Maj + Z, boutons de la barre). Trois gestes de js/text-expansion-settings.js les écrivent :
// « Ajouter », « Enregistrer » (la ligne qu'on modifie) et « Supprimer ». Chacun passe ici au lieu d'appeler TextExpansion seul : le geste s'écrit comme avant, puis se pose dans la pile de js/action-history.js avec l'abréviation d'avant et celle d'après.
//
// Les abréviations sont à la personne, dans le document, pas dans un modèle : elles se défont depuis n'importe quel modèle, comme le ★. Défaire rend l'abréviation d'AVANT (aucune : elle est retirée), rétablir celle d'APRÈS, par la même écriture que le geste
// (une ligne de la table Publipostage_Abreviations, ajoutée, mise à jour ou retirée). Une abréviation retirée revient sous son ancien numéro de ligne s'il est libre, sinon sous un numéro neuf : les pas qui la visent la suivent (`line`). Une abréviation qui
// n'est plus telle que l'action l'a laissée - changée depuis, dans un autre onglet ou à la main dans Grist -, ou dont le nom est pris par une autre, n'est jamais écrasée : rien n'est écrit et le coin d'état le dit. Un geste qui ne change rien, ou que
// Grist refuse, ne laisse pas de pas à défaire.
const ExpansionHistory = (function () {
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // Une abréviation telle que l'historique la compare : son nom et son texte (son numéro de ligne n'en fait pas partie, il peut changer). null : aucune.
  const shape = entry => (entry ? { abbreviation: entry.abbreviation, text: entry.text } : null);
  // Le nom comme TextExpansion le compare : sans égard à la casse ni aux espaces de bout.
  const nameKey = abbreviation => String(abbreviation || '').trim().toLowerCase();

  // Une abréviation d'un pas à l'autre : `line.rowId` est son numéro de ligne du moment. Retirée puis rendue sous un numéro neuf, la `line` change de numéro et tous ses pas avec elle. Numéro de ligne -> `line`, pour les gestes de l'onglet.
  const lines = new Map();
  function lineOf(rowId) {
    let line = lines.get(rowId);
    if (!line) { line = { rowId }; lines.set(rowId, line); }
    return line;
  }
  function moveLine(line, rowId) {
    if (lines.get(line.rowId) === line) lines.delete(line.rowId);
    line.rowId = rowId;
    lines.set(rowId, line);
  }

  const changed = () => ActionHistory.conflict(I18n.t('history.abbreviationChanged'));

  // Amène l'abréviation de `line` de l'état `expected` à l'état `value` (null : aucune). Tout se vérifie, sur la table relue, avant d'écrire : une abréviation qui a changé depuis, un nom pris, et rien ne se passe.
  function put(line, expected, value) {
    return async function () {
      await TextExpansion.load(true);
      const found = TextExpansion.list();
      if (expected && !same(shape(found.find(entry => entry.rowId === line.rowId)), expected)) throw changed();
      // Le nom que la ligne va porter : aucune autre abréviation ne l'a (la sienne, d'avant le geste, ne compte pas).
      const others = found.filter(entry => !expected || entry.rowId !== line.rowId);
      if (value && others.some(entry => nameKey(entry.abbreviation) === nameKey(value.abbreviation))) throw ActionHistory.conflict(I18n.t('history.abbreviationTaken'));
      if (!expected) moveLine(line, (await TextExpansion.add(value.abbreviation, value.text, line.rowId)).rowId);
      else if (!value) { if (!(await TextExpansion.remove(line.rowId))) throw changed(); }
      else if (!(await TextExpansion.update(line.rowId, value.abbreviation, value.text))) throw changed();
      const abbreviation = TextExpansion.storedChar() + (value || expected).abbreviation;
      return I18n.t(value ? 'status.abbreviationRestored' : 'status.abbreviationRemoved', { abbreviation });
    };
  }

  function record(line, before, after) {
    if (same(before, after)) return;
    ActionHistory.add({ undo: put(line, after, before), redo: put(line, before, after) });
  }

  // Les trois gestes de l'onglet : ce que fait TextExpansion (mêmes arguments, même retour, mêmes erreurs), puis l'action dans la pile. Une erreur passe telle quelle, sans pas.
  async function add(abbreviation, text) {
    const entry = await TextExpansion.add(abbreviation, text);
    const line = { rowId: entry.rowId };
    lines.set(entry.rowId, line);
    record(line, null, shape(entry));
    return entry;
  }

  async function update(rowId, abbreviation, text) {
    const before = shape(TextExpansion.list().find(entry => entry.rowId === rowId));
    const entry = await TextExpansion.update(rowId, abbreviation, text);
    if (entry && before) record(lineOf(rowId), before, shape(entry));
    return entry;
  }

  async function remove(rowId) {
    const before = shape(TextExpansion.list().find(entry => entry.rowId === rowId));
    const removed = await TextExpansion.remove(rowId);
    if (removed && before) record(lineOf(rowId), before, null);
    return removed;
  }

  return { add, update, remove };
})();
