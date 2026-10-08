// Le « sinon » d'une bulle #Variable : une autre variable que la bulle écrit à sa place quand sa condition d'affichage n'est pas remplie (ligne « Sinon
// afficher » de la fenêtre de js/variable-condition.js), au lieu de deux bulles côte à côte aux conditions opposées - des conditions qui ne le sont pas
// toujours : pas d'opérateur « ne contient pas », une cellule vide rend faux tous les ordres d'une comparaison de deux colonnes, une règle illisible
// compte comme non remplie.
// Le sinon est l'attribut `otherwise` du nœud varBadge (js/editor-nodes.js) : { table, column, key, before, after } - la variable choisie et son propre
// texte « Avant » / « Après » ; `null` = pas de sinon. Dans le HTML enregistré, cinq attributs simples (data-otherwise-table, -column, -key, -before et
// -after) plutôt qu'un objet en JSON : les renommages (js/schema-renames.js) et la recherche des modèles qui utilisent une table
// (Variables.findTemplatesUsingTable) les lisent comme data-table et data-column. Une valeur simple : jamais de boucle, de liste ni de condition ; le
// format de la bulle passe au sinon quand sa colonne est du même genre (nombre, date, Oui / Non), comme « Colonne… » le fait (js/variable-column.js).
//
// Résolution : js/reader-mode.js la fait une fois, juste après les blocs, valeurs et cases conditionnels et avant les bulles (`resolve` ci-dessous, par
// ConditionRules.resolveElements comme eux). Une bulle à sinon y devient la bulle du sinon (condition non remplie) ou la même bulle sans condition (condition
// remplie) : la Lecture, tous les exports, les en-têtes et pieds, les champs de l'e-mail, le type d'une case Excel et « Un document par valeur »
// n'ont ensuite qu'une bulle ordinaire à lire.
const VariableOtherwise = (function () {
  const PREFIX = 'data-otherwise-';
  const FIELDS = ['table', 'column', 'key', 'before', 'after'];
  const SELECTOR = 'span.var-badge[data-otherwise-key]';

  const text = value => (typeof value === 'string' && value !== '' ? value : null);

  // Le sinon sous sa forme enregistrée, ou null : sans table ni colonne il ne dit rien (un attribut abîmé ne fait pas une variable). Sa clé, absente, se
  // refait de la table et de la colonne ; son texte « Avant » / « Après » est celui de toute bulle (VariableFormat.affix).
  function normalize(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const table = text(raw.table);
    const column = text(raw.column);
    if (!table || !column) return null;
    return { table, column, key: text(raw.key) || table + '.' + column, before: VariableFormat.affix(raw.before), after: VariableFormat.affix(raw.after) };
  }

  // Les attributs DOM du sinon d'une bulle (js/editor-nodes.js:varBadgeAttributes) : seulement ceux qui ont une valeur ; rien sans sinon.
  function toAttributes(raw) {
    const other = normalize(raw);
    const attrs = {};
    if (other) FIELDS.forEach(field => { if (other[field]) attrs[PREFIX + field] = other[field]; });
    return attrs;
  }

  // L'inverse : le sinon qu'écrit le <span> d'une bulle, ou null (js/editor-nodes.js:varBadgeAttrsOf).
  function fromElement(el) {
    return normalize(Object.fromEntries(FIELDS.map(field => [field, el.getAttribute(PREFIX + field)])));
  }

  // Le format de la bulle tel qu'il vaut pour la colonne du sinon : gardé quand elle est du même genre (une date sur une date, un nombre sur un nombre ;
  // une date sur un texte donnerait n'importe quoi), sinon rien - la valeur s'écrit sans réglage. Une liste ne passe jamais : le sinon est une valeur
  // simple, et « Un document par valeur » (js/list-split.js) ne retrouverait pas la colonne du sinon dans le modèle.
  function inheritedFormat(format, other) {
    const kind = VariableFormat.formatKindOf(format);
    if (!kind || kind === 'list') return null;
    return kind === VariableFormat.columnKind(GristAPI.getColumnType(other.table, other.column)) ? format : null;
  }

  // La bulle d'attributs `attrs` (ceux d'un nœud varBadge) telle qu'elle se lit quand sa condition n'est pas remplie : la variable de son sinon avec son
  // texte « Avant » / « Après » et le format qui lui va, sans condition, sans boucle ni sinon. null sans sinon lisible : la bulle reste alors cachée,
  // comme avant le sinon. L'aperçu de la fenêtre de condition lit la même.
  function whenNotMet(attrs) {
    const other = normalize(attrs && attrs.otherwise);
    if (!other) return null;
    return Object.assign({}, attrs, {
      table: other.table, column: other.column, key: other.key, before: other.before, after: other.after,
      format: inheritedFormat(attrs.format, other), condition: null, loop: null, otherwise: null,
    });
  }

  // Un nœud varBadge qui porte chaque réglage : de quoi lister tous les attributs data-* que l'éditeur peut écrire sur une bulle.
  const EVERY_SETTING = { table: 't', column: 'c', key: 'k', format: {}, condition: {}, loop: {}, before: 'b', after: 'a', otherwise: { table: 't', column: 'c', before: 'b', after: 'a' } };

  // Pose sur le <span> `badge` les attributs `next` (ceux d'un nœud varBadge) : tous les data-* que l'éditeur écrit (EditorNodes.varBadgeAttributes) sont
  // d'abord retirés - une condition illisible aussi, qui n'a pas de réglage à relire -, puis ceux de `next` posés. Le reste de l'élément - la classe, un repère
  // posé ailleurs (data-pp-atom) et la ligne du tour qu'une zone répétée lui a donnée (LoopRules.bindingOf, gardée sur l'élément lui-même) - reste tel quel.
  function rewrite(badge, next) {
    const dataOf = attrs => Object.entries(EditorNodes.varBadgeAttributes(attrs)).filter(([name]) => name.startsWith('data-'));
    dataOf(EVERY_SETTING).forEach(([name]) => badge.removeAttribute(name));
    dataOf(next).filter(([, value]) => value != null).forEach(([name, value]) => badge.setAttribute(name, value));
  }

  // Résout les bulles à sinon de `root` pour la ligne `record` (avec la ligne du tour de leur zone répétée, comme leur condition) : une bulle dont la
  // condition est remplie perd sa condition et son sinon - elle s'écrit comme une bulle ordinaire, sans que la condition soit lue une seconde fois ; sinon
  // elle prend les attributs de son sinon (whenNotMet). Une condition illisible compte pour non remplie.
  function resolve(root, tableId, record) {
    return ConditionRules.resolveElements(root, SELECTOR, tableId, record, true, (badge, holds) => {
      const current = EditorNodes.varBadgeAttrsOf(badge);
      const next = holds ? Object.assign({}, current, { condition: null, otherwise: null }) : whenNotMet(current);
      if (next) rewrite(badge, next);
    });
  }

  return { normalize, toAttributes, fromElement, inheritedFormat, whenNotMet, resolve };
})();
