// Rechercher / Remplacer, le moteur : un document ProseMirror, une requête, des options. Rien d'autre : ni l'éditeur, ni l'interface, ni l'état de la recherche,
// donc il se teste sans écran (js/find-replace.js est la façade que le reste du widget appelle ; les autres morceaux sont js/find-replace-view.js, -actions.js et -panel.js).
const FindReplaceEngine = (function () {
  // Le texte d'un bloc est lu caractère pour caractère comme le document compte ses positions : un nœud qui n'est pas du texte (bulle, image,
  // pastille) vaut autant d'OBJECT que sa taille, qu'aucune requête ne trouve et qui coupe un mot ; un saut de ligne vaut « \n ». Le texte d'une
  // suppression suivie (marque `deletion`, encore dans le document tant qu'on ne l'a pas acceptée) vaut aussi des OBJECT : pour qui lit, il n'existe
  // déjà plus, et le retrouver ferait remplacer deux fois le même mot.
  const OBJECT = '\uFFFC';
  const SPACES = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g;
  const SINGLE_QUOTES = /[\u2018\u2019\u201A\u201B\u02BC]/g;
  const DOUBLE_QUOTES = /[\u201C\u201D\u201E]/g;
  const WORD_CHAR = /[\p{L}\p{N}_]/u;
  // Espace insécable, apostrophe et guillemet droits ou typographiques se valent (un texte français a des « mot ! » avec espace fine insécable, des
  // l’apostrophe courbes) ; la substitution est de un caractère pour un caractère, donc les positions trouvées dans le texte normalisé sont celles du
  // texte d'origine.
  const normalize = text => text.replace(SPACES, ' ').replace(SINGLE_QUOTES, "'").replace(DOUBLE_QUOTES, '"');
  const isDeletion = mark => mark.type.name === 'deletion';
  const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Un résultat d'expression régulière garde de quoi refaire sa substitution (expandReplacement) : le texte d'où il vient, sa place et la
  // copie « collante » du motif. Hors du résultat lui-même, pour que celui-ci reste un simple { from, to }.
  const SOURCES = new WeakMap();
  const SEGMENT = /[^\uFFFC]+/g;

  function textOfBlock(block, blockPos) {
    let text = '';
    const spans = []; // { at: indice dans `text`, pos: position dans le document }, un par enfant
    block.forEach((child, offset) => {
      spans.push({ at: text.length, pos: blockPos + 1 + offset });
      if (child.isText) text += child.marks.some(isDeletion) ? OBJECT.repeat(child.text.length) : child.text;
      else if (child.type.name === 'hardBreak') text += '\n';
      else text += OBJECT.repeat(child.nodeSize);
    });
    return { text, spans };
  }

  // Position dans le document de l'indice `index` du texte du bloc : le dernier enfant qui commence au plus tard à cet indice.
  function positionAt(spans, index) {
    let lo = 0;
    let hi = spans.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (spans[mid].at <= index) lo = mid; else hi = mid - 1;
    }
    return spans[lo].pos + (index - spans[lo].at);
  }

  // Le caractère à `index` (hors du texte : non) est-il une lettre, un chiffre ou « _ » ? Une paire de substitution (lettre hors du plan de base) se
  // lit en entier.
  function isWordCharAt(text, index) {
    if (index < 0 || index >= text.length) return false;
    let codePoint = text.codePointAt(index);
    if (index > 0 && codePoint >= 0xDC00 && codePoint <= 0xDFFF && text.codePointAt(index - 1) > 0xFFFF) codePoint = text.codePointAt(index - 1);
    return WORD_CHAR.test(String.fromCodePoint(codePoint));
  }

  // Le motif de `query` : { regex } (drapeau « g », « i » sauf « Respecter la casse », toujours « u » pour une recherche simple), { error } quand
  // l'expression régulière est fausse, {} sans requête. Une expression régulière se compile d'abord en mode Unicode (« u » : \p{L}, lettres hors du
  // plan de base) ; si elle y échoue sans rien lui devoir, on la retente sans : « \- », « \@ » ou « \_ » hors d'une classe, écritures courantes,
  // n'y sont des erreurs que dans ce mode. C'est l'erreur du mode Unicode que l'on rend, la plus fidèle à ce qui a été écrit.
  function compile(query, opts) {
    const options = opts || {};
    const flags = options.matchCase ? 'g' : 'gi';
    const text = String(query == null ? '' : query).split(OBJECT).join('');
    if (!text) return {};
    if (!options.regex) return { regex: new RegExp(escapeRegex(normalize(text)), flags + 'u') };
    try { return { regex: new RegExp(text, flags + 'u'), pattern: true }; } catch (error) {
      if (!/\\[pPu]\{/.test(text)) {
        try { return { regex: new RegExp(text, flags), pattern: true }; } catch (ignored) { /* la première erreur est celle que l'on dit */ }
      }
      return { error };
    }
  }

  // Indice qui suit `index` : deux unités quand une paire de substitution (lettre hors du plan de base) y commence.
  function advance(text, index, unicode) {
    const code = text.charCodeAt(index);
    return unicode && code >= 0xD800 && code <= 0xDBFF && index + 1 < text.length ? index + 2 : index + 1;
  }

  // Visite les résultats du motif dans `input`, dans l'ordre : `visit(début, fin)` (rend faux pour s'arrêter). `input` est le texte comparé (recherche
  // simple : espaces et guillemets unifiés). Un résultat vide (« ^ », « x* ») n'est pas un résultat : il n'a ni texte à surligner ni de quoi avancer.
  function scan(compiled, input, opts, visit) {
    const { regex } = compiled;
    regex.lastIndex = 0;
    let found;
    while ((found = regex.exec(input))) {
      const start = found.index;
      const end = start + found[0].length;
      if (end === start) { regex.lastIndex = advance(input, start, regex.unicode); continue; }
      // « Mot entier » : un mot collé à la correspondance la disqualifie ; la recherche reprend à l'indice suivant (« ana » dans « banana ana »).
      if (opts.wholeWord && (isWordCharAt(input, start - 1) || isWordCharAt(input, end))) { regex.lastIndex = start + 1; continue; }
      if (visit(start, end) === false) return;
    }
  }

  // Les résultats du motif dans le texte d'un bloc, dans l'ordre. Le texte d'une expression régulière est lu tel quel (on peut chercher une espace
  // insécable précise) et se découpe aux « objets » (bulle, image, suppression suivie) : un motif comme « \S+ » ou « .* » ne les traverse pas, un
  // « remplacer » ne peut donc pas en effacer un.
  function collect(compiled, text, spans, opts, matches, sticky) {
    const { pattern } = compiled;
    const parts = pattern ? Array.from(text.matchAll(SEGMENT), part => ({ at: part.index, input: part[0] })) : [{ at: 0, input: normalize(text) }];
    for (const { at, input } of parts) {
      scan(compiled, input, opts, (start, end) => {
        const match = { from: positionAt(spans, at + start), to: positionAt(spans, at + end - 1) + 1 };
        if (pattern) SOURCES.set(match, { input, index: start, length: end - start, sticky });
        matches.push(match);
      });
    }
  }

  // Les bulles. Une bulle est un résultat quand l'un des textes qu'elle écrit à l'écran contient la requête : son nom (« #Nom », la touche de
  // déclenchement comprise, comme on le lit), son « Avant » et son « Après », son « sinon » (nom, « Avant » et « Après »), la formule d'une bulle de
  // calcul. UN résultat par bulle, de la taille de la bulle : jamais à cheval sur du texte ni sur une autre bulle (le texte d'à côté, lui, la lit
  // toujours comme un OBJECT). Une bulle supprimée en suivi n'existe plus pour qui lit : elle n'est pas trouvée.
  const BUBBLES = new WeakSet();
  const isBubbleNode = node => node.type.name === 'varBadge' || node.type.name === 'calcBadge';
  const isBubble = match => BUBBLES.has(match);

  // Les textes d'une bulle : [{ id, text }], `id` dit lequel (name, before, after, otherwiseName, otherwiseBefore, otherwiseAfter, otherwiseText, formula).
  function bubbleParts(node) {
    const attrs = node.attrs;
    if (node.type.name === 'calcBadge') return attrs.formula ? [{ id: 'formula', text: EditorNodes.calcBadgeLabel(attrs.formula) }] : [];
    const trigger = Variables.triggerChar();
    const parts = [];
    const add = (id, text) => { if (text) parts.push({ id, text }); };
    if (attrs.key) add('name', trigger + attrs.key);
    add('before', attrs.before);
    add('after', attrs.after);
    const other = attrs.otherwise;
    if (other) {
      if (other.key) add('otherwiseName', trigger + other.key);
      add('otherwiseBefore', other.before);
      add('otherwiseAfter', other.after);
    }
    // Le sinon en texte et variables (js/variable-otherwise.js) se lit en entier, « #Clé » pour une variable.
    if (attrs.otherwiseText) add('otherwiseText', VariableOtherwise.plainText(attrs.otherwiseText));
    return parts;
  }

  function hasMatch(compiled, text, opts) {
    let hit = false;
    scan(compiled, compiled.pattern ? text : normalize(text), opts, () => { hit = true; return false; });
    return hit;
  }

  // Les bulles du bloc `block` (à la position `blockPos`) qui contiennent la requête, dans l'ordre.
  function bubbleMatches(block, blockPos, compiled, opts) {
    const found = [];
    block.forEach((child, offset) => {
      if (child.isText || !isBubbleNode(child) || child.marks.some(isDeletion)) return;
      if (!bubbleParts(child).some(part => hasMatch(compiled, part.text, opts))) return;
      const at = blockPos + 1 + offset;
      const match = { from: at, to: at + child.nodeSize };
      BUBBLES.add(match);
      found.push(match);
    });
    return found;
  }

  // Les correspondances de `query` dans `doc`, dans l'ordre du document : [{ from, to }]. Chaque bloc de texte se cherche à part (une correspondance
  // ne traverse jamais deux paragraphes ni deux cases), à travers les changements de mise en forme dans le bloc (« bon<b>jour</b> » se trouve). Sans
  // chevauchement : « aa » dans « aaaa » vaut deux. options : { matchCase, wholeWord, regex }. Casse ignorée par défaut (`i` + `u` : « É » et « é » se
  // valent, « e » et « é » non). Une expression régulière fausse ne trouve rien (`compile` dit pourquoi). Les bulles s'ajoutent à leur place
  // (`isBubble`).
  function findMatches(doc, query, options) {
    const opts = options || {};
    const compiled = compile(query, opts);
    if (!compiled.regex) return [];
    const sticky = stickyOf(compiled);
    const matches = [];
    doc.descendants((node, pos) => {
      if (!node.isTextblock) return true;
      const { text, spans } = textOfBlock(node, pos);
      if (!spans.length) return false;
      const first = matches.length;
      collect(compiled, text, spans, opts, matches, sticky);
      const bubbles = bubbleMatches(node, pos, compiled, opts);
      if (bubbles.length) {
        const block = matches.splice(first).concat(bubbles).sort((a, b) => a.from - b.from);
        for (const match of block) matches.push(match);
      }
      return false;
    });
    return matches;
  }

  // La copie « collante » du motif d'une expression régulière (rejouée à un endroit précis, expandAt), null pour une recherche simple.
  const stickyOf = compiled => (compiled.pattern ? new RegExp(compiled.regex.source, compiled.regex.flags.replace('g', '') + 'y') : null);

  // Le texte qu'écrit le motif `sticky` à `index` dans `input` (le résultat de `length` signes) : `replacement` avec ses « $1 », « $& », « $<nom> » et
  // « $$ ». La substitution est celle de String.replace : le motif est rejoué à l'endroit du résultat, sur le texte d'où il vient, pour que les
  // assertions (« (?<=…) ») voient la même chose qu'à la recherche.
  function expandAt(sticky, input, index, length, replacement) {
    sticky.lastIndex = index;
    const replaced = input.replace(sticky, replacement);
    return replaced.slice(index, replaced.length - (input.length - index - length));
  }

  // Le texte qui remplace `match` : `replacement` tel quel, ou, pour le résultat d'une expression régulière, avec ses groupes (expandAt).
  function expandReplacement(match, replacement) {
    const source = SOURCES.get(match);
    return source ? expandAt(source.sticky, source.input, source.index, source.length, replacement) : replacement;
  }

  // `input` avec `replacement` à la place de chaque résultat du motif (le texte d'une bulle).
  function replaceText(compiled, sticky, input, opts, replacement) {
    let out = '';
    let last = 0;
    scan(compiled, compiled.pattern ? input : normalize(input), opts, (start, end) => {
      out += input.slice(last, start) + (sticky ? expandAt(sticky, input, start, end - start, replacement) : replacement);
      last = end;
    });
    return out + input.slice(last);
  }

  // Le remplacement dans une bulle : { attrs } - ceux de la bulle une fois `replacement` mis à la place de ce que `query` trouve dans son « Avant » et son
  // « Après » (et dans ceux de son « sinon », ou dans le texte de son « sinon » en texte et variables, hors de ses variables) - ou { reason } quand rien ne change :
  // 'name' (le résultat n'est que dans son nom ou celui de son « sinon » : la bulle suit une colonne), 'formula' (la formule d'un calcul), 'tooLong' (le nouveau
  // texte dépasserait ce qu'un « Avant » ou un « Après » peut garder), 'tooLongOtherwise' (ou ce que peut garder le texte d'un sinon).
  function replaceInBubble(node, query, options, replacement) {
    const opts = options || {};
    const compiled = compile(query, opts);
    if (!compiled.regex) return { reason: 'name' };
    if (node.type.name !== 'varBadge') return { reason: 'formula' };
    const sticky = stickyOf(compiled);
    let tooLong = false;
    let tooLongOtherwise = false;
    let changed = false;
    const edit = value => {
      if (!value) return value;
      const out = replaceText(compiled, sticky, value, opts, replacement);
      if (out === value) return value;
      if (out.length > VariableFormat.AFFIX_MAX) { tooLong = true; return value; }
      changed = true;
      return VariableFormat.affix(out);
    };
    const attrs = Object.assign({}, node.attrs, { before: edit(node.attrs.before), after: edit(node.attrs.after) });
    if (node.attrs.otherwise) attrs.otherwise = Object.assign({}, node.attrs.otherwise, { before: edit(node.attrs.otherwise.before), after: edit(node.attrs.otherwise.after) });
    if (node.attrs.otherwiseText) {
      // Seuls les morceaux de texte se remplacent : une variable du sinon suit sa colonne, comme le nom de la bulle.
      let touched = false;
      const items = FieldCodec.itemsOf(node.attrs.otherwiseText).map(item => {
        if (!FieldCodec.isText(item)) return item;
        const out = replaceText(compiled, sticky, item.text, opts, replacement);
        if (out === item.text) return item;
        touched = true;
        return { text: out };
      });
      if (touched && FieldCodec.serializePlain(items).length > VariableOtherwise.TEXT_MAX) tooLongOtherwise = true;
      else if (touched) { attrs.otherwiseText = FieldCodec.toStored(items, { keepSpaces: true }); changed = true; }
    }
    return changed ? { attrs } : { reason: tooLong ? 'tooLong' : (tooLongOtherwise ? 'tooLongOtherwise' : 'name') };
  }

  return { findMatches, compile, expandReplacement, isBubble, replaceInBubble, escapeRegex, OBJECT };
})();
