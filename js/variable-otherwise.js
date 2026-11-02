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
// Depuis le 02/11 (« Sinon afficher » harmonisé : « Oui identique partout »), la ligne « Sinon afficher » d'une bulle est le même champ que celle d'une valeur dans la
// phrase et d'un bloc de texte (js/conditional-text.js) : du texte et des variables tapées avec « # », chacune avec ses propres réglages (« Avant » / « Après », format,
// condition), le champ de l'objet d'un e-mail (js/field-editor.js, js/field-codec.js). Il s'écrit dans l'attribut `otherwiseText` du nœud, `data-otherwise` dans le HTML.
// L'objet ci-dessus reste l'écriture d'un sinon qui n'est QUE cela - une seule variable, réglée par son « Avant » / « Après » - : un sinon enregistré avant se relit et se
// réécrit à l'identique, octet pour octet (`storedOf` ne passe au texte que si l'objet ne dit plus la même chose). Le champ le montre alors comme une bulle, son format hérité
// écrit sur elle (`fieldOf`) ; la bulle du champ n'hérite plus de rien.
//
// Résolution : js/reader-mode.js la fait une fois, juste après les blocs, valeurs et cases conditionnels et avant les bulles (`resolve` ci-dessous, par
// ConditionRules.resolveElements comme eux). Une bulle à sinon y devient la bulle du sinon (condition non remplie) ou la même bulle sans condition (condition
// remplie) - ou, pour un sinon en texte et variables, le texte et les bulles du sinon à sa place, sur la ligne du tour de la bulle : la Lecture, tous les exports, les
// en-têtes et pieds, les champs de l'e-mail, le type d'une case Excel et « Un document par valeur » n'ont ensuite que des bulles ordinaires à lire. Un sinon dans un sinon
// ne se règle pas (la fenêtre du second niveau grise la ligne) et ne se lit pas : sa bulle reste, avec sa condition.
const VariableOtherwise = (function () {
  const PREFIX = 'data-otherwise-';
  const FIELDS = ['table', 'column', 'key', 'before', 'after'];
  const SELECTOR = 'span.var-badge[data-otherwise-key], span.var-badge[data-otherwise]';
  // Les caractères que porte le sinon en texte et variables (une phrase courte, comme celui d'une valeur dans la phrase, js/conditional-value.js).
  const TEXT_MAX = 200;
  // Les signes que la pastille d'une bulle montre d'un sinon en texte (le reste se coupe par « … »).
  const SHOWN_MAX = 24;

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

  // Le sinon en texte et variables sous sa forme enregistrée (le champ lui-même, texte brut ou HTML : js/field-codec.js), ou null : rien, ou que des espaces, n'est pas un sinon.
  const typedOf = raw => (typeof raw === 'string' && FieldCodec.linesOf(raw).some(FieldCodec.hasContent) ? raw : null);

  // Son attribut DOM (js/editor-nodes.js:varBadgeAttributes), le seul `data-otherwise` d'une bulle ; rien sans sinon.
  function typedToAttributes(raw) {
    const text = typedOf(raw);
    return text ? { 'data-otherwise': text } : {};
  }

  // L'inverse : le sinon en texte qu'écrit le <span> d'une bulle, ou null (js/editor-nodes.js:varBadgeAttrsOf).
  function typedFromElement(el) {
    return typedOf(el.getAttribute('data-otherwise'));
  }

  // Le sinon en texte comme on le lit à l'écran : le texte, une variable s'y écrit « #Clé » (ce que cherche Rechercher / Remplacer, js/find-replace.js).
  const plainText = raw => FieldCodec.serializePlain(FieldCodec.itemsOf(raw));

  // Ce que la pastille d'une bulle dit d'un sinon en texte : « Dossier #Statut » sur une seule ligne, coupé à SHOWN_MAX signes.
  function shownText(raw) {
    const text = plainText(raw).replace(/\s+/g, ' ').trim();
    return text.length > SHOWN_MAX ? text.slice(0, SHOWN_MAX - 1) + '…' : text;
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

  // L'objet `other` (la forme d'avant, normalisé) tel que le champ le porte : une bulle de sa variable, avec son « Avant » / « Après » et le format qu'elle aurait hérité de la bulle
  // de format `format` (inheritedFormat) - dans le champ, ce format est écrit sur elle. Sans condition, sans boucle, sans sinon.
  const badgeOf = (other, format) => ({
    badge: {
      table: other.table, column: other.column, key: other.key, format: inheritedFormat(format, other), condition: null, loop: null,
      before: other.before, after: other.after, otherwise: null, otherwiseText: null,
    },
  });
  const storedField = items => FieldCodec.toStored(items, { keepSpaces: true });

  // La valeur du champ « Sinon afficher » pour une bulle d'attributs `attrs` : son sinon en texte et variables, ou celui d'avant montré comme une bulle (une variable, son
  // « Avant » / « Après », son format hérité), '' sans sinon. L'écriture est celle de FieldCodec : le texte brut tant qu'aucune bulle n'a de réglage, le HTML sinon.
  function fieldOf(attrs) {
    const text = typedOf(attrs && attrs.otherwiseText);
    if (text) return text;
    const other = normalize(attrs && attrs.otherwise);
    return other ? storedField([badgeOf(other, attrs.format)]) : '';
  }

  // Ce que la bulle enregistre pour la valeur `value` de son champ : { otherwise, otherwiseText }, l'un ou l'autre, jamais les deux. L'objet d'avant tant qu'il dit
  // exactement la même chose - une seule variable, réglée par son seul « Avant » / « Après », dans le format qu'elle hérite de la bulle (`format`) : le HTML enregistré reste
  // alors celui d'avant, et une bulle d'avant qu'on n'a pas touchée s'enregistre à l'identique. Sinon le texte du champ, tel qu'il est tapé.
  function storedOf(value, format) {
    const text = typedOf(value);
    if (!text) return { otherwise: null, otherwiseText: null };
    const items = FieldCodec.itemsOf(text);
    const other = items.length === 1 && items[0].badge ? normalize(items[0].badge) : null;
    if (other && storedField([badgeOf(other, format)]) === storedField(items)) return { otherwise: other, otherwiseText: null };
    return { otherwise: null, otherwiseText: text };
  }

  // Un nœud varBadge qui porte chaque réglage : de quoi lister tous les attributs data-* que l'éditeur peut écrire sur une bulle.
  const EVERY_SETTING = { table: 't', column: 'c', key: 'k', format: {}, condition: {}, loop: {}, before: 'b', after: 'a', otherwise: { table: 't', column: 'c', before: 'b', after: 'a' }, otherwiseText: 'x' };

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
  // elle prend les attributs de son sinon (whenNotMet), ou son sinon en texte et variables prend sa place, texte et bulles, lues ensuite avec le reste du document
  // sur la ligne du tour de la bulle (LoopRules.inheritBinding : les zones répétées sont déjà déroulées). Une condition illisible compte pour non remplie.
  function resolve(root, tableId, record) {
    return ConditionRules.resolveElements(root, SELECTOR, tableId, record, true, (badge, holds) => {
      const current = EditorNodes.varBadgeAttrsOf(badge);
      const items = holds || !current.otherwiseText ? null : FieldCodec.itemsOf(current.otherwiseText);
      if (items) {
        const holder = badge.ownerDocument.createElement('span');
        Dom.setMarkup(holder, FieldCodec.itemsHtml(items));
        const nodes = Array.from(holder.childNodes);
        LoopRules.inheritBinding(badge, nodes);
        badge.replaceWith(...nodes);
        return;
      }
      const next = holds ? Object.assign({}, current, { condition: null, otherwise: null, otherwiseText: null }) : whenNotMet(current);
      if (next) rewrite(badge, next);
    });
  }

  return {
    TEXT_MAX, normalize, toAttributes, fromElement, typedOf, typedToAttributes, typedFromElement, plainText, shownText, inheritedFormat, whenNotMet, fieldOf, storedOf, resolve,
  };
})();
