// Rechercher / Remplacer dans l'éditeur : un panneau fin entre la barre d'outils et le texte, jamais une fenêtre, pour que le modèle reste visible et
// modifiable pendant qu'on cherche.
//  - Rechercher : tous les résultats surlignés (au-delà de 500, ceux de l'écran et de ses abords), le courant plus marqué, « 3 sur 12 », précédent
//    / suivant (Entrée, Maj+Entrée), « Respecter la casse », « Mot entier » et « Expression régulière » (le motif est celui de JavaScript, il
//    ne traverse ni une bulle ni une suppression suivie ; « $1 », « $& » et « $<nom> » reprennent un groupe dans le remplacement) ;
//  - Remplacer : « Remplacer » remplace le résultat courant puis passe au suivant, « Tout remplacer » les remplace tous. Un remplacement est une
//    transaction ProseMirror (une seule étape d'annulation, « Tout remplacer » compris) qui garde la mise en forme du texte remplacé et passe par le
//    mode suivi quand il est actif : l'ancien texte devient une suppression suggérée, le nouveau une insertion suggérée (js/track-changes.js ;
//    skipTracking est l'inverse, pour ce que le widget écrit seul) ;
//    Annuler défait le texte ouvert (le corps, l'en-tête et le pied ont chacun leur historique), sauf juste après un « Remplacer » qui a fait passer
//    la recherche à un autre texte : Annuler rouvre d'abord le texte du remplacement, puis le défait (reopenForUndo) ;
//  - ouverture : Ctrl+F / ⌘F (rechercher) et Ctrl+H / ⌘⇧H (remplacer), même quand le clavier est resté sur un bouton de la barre d'outils, tant que
//    l'éditeur est à l'écran et qu'aucune fenêtre n'est ouverte (sinon la recherche du navigateur reprend la main) ; la loupe de la barre fait de
//    même. Échap ferme et rend le clavier à l'éditeur, le dernier résultat reste sélectionné (on peut taper par-dessus).
// Le moteur (findMatches) ne dépend que d'un document ProseMirror : il se teste sans interface. L'état de la recherche vit dans ce module, pas dans
// le plugin ProseMirror : un changement de modèle reconstruit l'état de l'éditeur (Editor.setHTML) et remettrait sinon la recherche à zéro sous le
// panneau resté ouvert. Styles : css/find-replace.css.
const FindReplace = (function () {
  const el = Dom.el;

  // Le moteur : un document ProseMirror, une requête, des options
  const { findMatches, compile, expandReplacement, isBubble, replaceInBubble, escapeRegex, OBJECT } = (function () {
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

    // Les textes d'une bulle : [{ id, text }], `id` dit lequel (name, before, after, otherwiseName, otherwiseBefore, otherwiseAfter, formula).
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
    // « Après » (et dans ceux de son « sinon ») - ou { reason } quand rien ne change : 'name' (le résultat n'est que dans son nom ou celui de son « sinon » :
    // la bulle suit une colonne), 'formula' (la formule d'un calcul), 'tooLong' (le nouveau texte dépasserait ce qu'un « Avant » ou un « Après » peut garder).
    function replaceInBubble(node, query, options, replacement) {
      const opts = options || {};
      const compiled = compile(query, opts);
      if (!compiled.regex) return { reason: 'name' };
      if (node.type.name !== 'varBadge') return { reason: 'formula' };
      const sticky = stickyOf(compiled);
      let tooLong = false;
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
      return changed ? { attrs } : { reason: tooLong ? 'tooLong' : 'name' };
    }

    return { findMatches, compile, expandReplacement, isBubble, replaceInBubble, escapeRegex, OBJECT };
  })();

  // L'état de la recherche
  const META = 'ppFindReplace';
  const state = { open: false, query: '', replacement: '', matchCase: false, wholeWord: false, regex: false, replaceVisible: false, flash: '', flashDoc: null };
  let win = null; // { from, to } : positions du document que couvre le surlignage quand il y a plus de ALL_BELOW résultats (placeWindow)
  let bar = null;
  let refs = null;

  const editor = () => EditorCore.getEditor();

  // Surlignage et raccourcis (une extension TipTap)
  const { currentMatches, allStories, indexOfSelection, refresh, scheduleWindow, placeWindow, createExtension } = (function () {
    // Un surlignage par résultat, c'est un <span> par résultat à poser (et à recalculer) à chaque lettre tapée : 38 760 pour un « e » dans 120 pages,
    // plus d'une seconde et demie. Au-delà de ALL_BELOW résultats, seuls ceux de l'écran et de ses abords (`win`) sont surlignés ; le compteur, Entrée
    // et « Tout remplacer » comptent et parcourent tous les résultats, surlignés ou non.
    const ALL_BELOW = 500;
    const MIN_SPAN = 100; // marge de part et d'autre de l'écran : autant de résultats que l'écran en montre, entre MIN_SPAN et MAX_SPAN
    const MAX_SPAN = 1000;
    let cache = null; // { doc, query, matchCase, wholeWord, regex, matches } : les résultats d'un même document ne se recalculent pas à chaque transaction
    let windowPending = false;
    let pm = null; // { Plugin, PluginKey, Decoration, DecorationSet, PMDOMParser } de ProseMirror, fournis par js/editor.js

    function currentMatches(pmState) {
      if (!state.query) return [];
      if (!cache || cache.doc !== pmState.doc || cache.query !== state.query || cache.matchCase !== state.matchCase || cache.wholeWord !== state.wholeWord || cache.regex !== state.regex) {
        cache = { doc: pmState.doc, query: state.query, matchCase: state.matchCase, wholeWord: state.wholeWord, regex: state.regex, matches: findMatches(pmState.doc, state.query, state) };
      }
      return cache.matches;
    }

    // Les résultats des textes que l'éditeur ne contient pas : l'en-tête et le pied de page quand il contient le corps, le corps et l'autre zone quand il contient une zone. Leur
    // HTML est lu avec le schéma de l'éditeur, comme à son chargement, puis cherché comme un document ; un texte qui n'a pas changé (même HTML, même requête) n'est pas relu.
    const hidden = new Map(); // id d'un texte -> { html, query, matchCase, wholeWord, regex, matches }
    function hiddenMatches(story) {
      if (!state.query) return [];
      const kept = hidden.get(story.id);
      if (kept && kept.html === story.html && kept.query === state.query && kept.matchCase === state.matchCase && kept.wholeWord === state.wholeWord && kept.regex === state.regex) return kept.matches;
      let matches = [];
      try {
        matches = findMatches(pm.PMDOMParser.fromSchema(editor().schema).parse(HtmlSanitize.parseInert(story.html || '')), state.query, state);
      } catch (error) { /* un fragment illisible ne trouve rien */ }
      hidden.set(story.id, { html: story.html, query: state.query, matchCase: state.matchCase, wholeWord: state.wholeWord, regex: state.regex, matches });
      return matches;
    }

    // Les textes du modèle dans l'ordre de la page, chacun avec ses résultats : [{ id, live, matches }]. Ceux du texte que l'éditeur contient sont ceux du document
    // (currentMatches) ; il n'y a qu'un texte tant que le modèle n'a ni en-tête ni pied.
    function allStories(pmState) {
      const live = currentMatches(pmState);
      const listed = state.query ? HeaderFooterPreview.listStories() : [];
      if (listed.length < 2) return [{ id: 'main', live: true, matches: live }];
      return listed.map(story => ({ id: story.id, live: story.live, matches: story.live ? live : hiddenMatches(story) }));
    }

    // Premier indice de 0 à `length` pour lequel `test` est vrai (`test` est faux puis vrai : les résultats suivent l'ordre du document), `length` si
    // aucun : une recherche par dichotomie, qui ne parcourt pas des dizaines de milliers de résultats.
    function firstWhere(length, test) {
      let lo = 0;
      let hi = length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (test(mid)) hi = mid; else lo = mid + 1;
      }
      return lo;
    }

    // Indice du résultat que la sélection de l'éditeur recouvre exactement (le « résultat courant »), -1 sinon.
    function indexOfSelection(matches, selection) {
      const at = firstWhere(matches.length, i => matches[i].from >= selection.from);
      return at < matches.length && matches[at].from === selection.from && matches[at].to === selection.to ? at : -1;
    }

    // Indices [premier, dernier] des résultats que la fenêtre `win` recouvre (dernier < premier : aucun).
    function windowRange(matches) {
      if (!win) return [0, -1];
      return [firstWhere(matches.length, i => matches[i].to > win.from), firstWhere(matches.length, i => matches[i].from >= win.to) - 1];
    }

    // Tant qu'aucune fenêtre n'est posée (le panneau vient de s'ouvrir), les résultats surlignés sont ceux qui entourent la sélection, là où l'on est
    // le plus souvent ; placeWindow la corrige aussitôt d'après l'écran. Rien n'est mesuré ici : quand ProseMirror demande les décorations, l'écran
    // montre encore le document d'avant la transaction.
    function decorationsFor(pmState) {
      if (!state.open || !state.query) return null;
      const matches = currentMatches(pmState);
      if (!matches.length) return null;
      const { from, to } = pmState.selection;
      const mark = m => pm.Decoration.inline(m.from, m.to, { class: m.from === from && m.to === to ? 'pp-find-match pp-find-current' : 'pp-find-match' });
      if (matches.length <= ALL_BELOW) return pm.DecorationSet.create(pmState.doc, matches.map(mark));
      if (!win) {
        const near = firstWhere(matches.length, i => matches[i].from >= from);
        win = { from: matches[Math.max(0, near - MIN_SPAN)].from, to: matches[Math.min(matches.length - 1, near + MIN_SPAN)].to };
      }
      const [first, last] = windowRange(matches);
      const shown = matches.slice(first, last + 1).map(mark);
      // Le résultat courant se voit toujours, où qu'il soit par rapport à la fenêtre.
      const current = indexOfSelection(matches, pmState.selection);
      if (current >= 0 && (current < first || current > last)) shown.push(mark(matches[current]));
      return pm.DecorationSet.create(pmState.doc, shown);
    }

    // pmClasses : { Plugin, PluginKey, Decoration, DecorationSet, PMDOMParser } (js/editor.js les importe déjà).
    function createExtension(Extension, pmClasses) {
      pm = pmClasses;
      return Extension.create({
        name: 'findReplace',
        addProseMirrorPlugins() {
          return [new pm.Plugin({ key: new pm.PluginKey('ppFindReplace'), props: { decorations: decorationsFor } })];
        },
      });
    }

    // Redessine le surlignage et le compteur sans toucher au document : une transaction vide, comme partout ailleurs dans l'éditeur (cf. Editor.setHTML).
    // `windowOnly` : la demande vient de placeWindow, qui n'a pas à se remesurer après elle-même.
    function refresh(windowOnly) {
      const ed = editor();
      if (ed) ed.view.dispatch(ed.state.tr.setMeta(META, windowOnly ? 'window' : true));
    }

    // Quand il y a plus de ALL_BELOW résultats, la fenêtre de surlignage suit l'écran. Les résultats suivent l'ordre du document, donc leur hauteur :
    // le premier et le dernier à l'écran se trouvent par dichotomie sur la position de chaque résultat (une vingtaine de mesures chacun), sans
    // parcourir les milliers de résultats. La fenêtre couvre l'écran plus autant de part et d'autre (entre MIN_SPAN et MAX_SPAN résultats) ; elle ne
    // bouge que si l'écran s'approche à moins de la moitié de cette marge d'un de ses bords (un défilement ne redessine pas à chaque cran), ou si elle
    // est devenue bien plus large que l'écran (passage où les résultats sont plus rares). Appelée après chaque transaction (une fois le défilement
    // qu'elle demande fait) et à chaque défilement de la zone de texte.
    function placeWindow() {
      if (!state.open || !state.query) return;
      const ed = editor();
      const scroller = document.getElementById('editor-container');
      if (!ed || !scroller) return;
      const matches = currentMatches(ed.state);
      const count = matches.length;
      if (count <= ALL_BELOW) return;
      const box = scroller.getBoundingClientRect();
      if (!box.height) return; // éditeur masqué (Lecture, macro-modèle) : rien à mesurer
      let failed = false;
      const rectOf = i => { try { return ed.view.coordsAtPos(matches[i].from); } catch (e) { failed = true; return null; } };
      // Le premier résultat qui n'est plus au-dessus de l'écran, et le premier qui est passé en dessous.
      const firstShown = firstWhere(count, i => { const rect = rectOf(i); return !!rect && rect.bottom >= box.top; });
      const firstBelow = firstWhere(count, i => { const rect = rectOf(i); return !!rect && rect.top > box.bottom; });
      if (failed) return;
      const lastShown = Math.max(firstShown, firstBelow - 1);
      const span = Math.min(MAX_SPAN, Math.max(MIN_SPAN, firstBelow - firstShown));
      const [first, last] = windowRange(matches);
      const covers = first <= Math.max(0, firstShown - (span >> 1)) && last >= Math.min(count - 1, lastShown + (span >> 1));
      if (covers && last - first + 1 <= lastShown - firstShown + 1 + 4 * span) return;
      win = { from: matches[Math.max(0, firstShown - span)].from, to: matches[Math.min(count - 1, lastShown + span)].to };
      refresh(true);
    }

    // Après la transaction en cours, et le défilement qu'elle a pu demander (select, reveal) : la mesure se fait sur l'écran tel qu'il sera.
    function scheduleWindow() {
      if (windowPending) return;
      windowPending = true;
      queueMicrotask(() => { windowPending = false; placeWindow(); });
    }

    return { currentMatches, allStories, indexOfSelection, refresh, scheduleWindow, placeWindow, createExtension };
  })();

  // Les actions sur les résultats : aller de l'un à l'autre, remplacer (le message qui le dit vient du panneau, plus bas : `setFlash`).
  const { go, applyQuery, replaceCurrent, replaceAll, reopenForUndo, forgetReplacement } = (function () {
    // Annuler juste après « Remplacer » : quand le remplacement a fait passer la recherche à un AUTRE texte (le pied s'ouvre sous les yeux), l'éditeur ne contient plus le texte
    // du remplacement, et Annuler défaisait celui qu'on vient d'ouvrir (souvent rien). On retient où le remplacement a été fait (`id`), le texte où la recherche a atterri
    // (`landedId`) et son contenu (`landed`) ; le premier Annuler qui suit, tant que ce texte est toujours ouvert et n'a pas changé (rien tapé, rien mis en forme), commence par
    // rouvrir le texte du remplacement (reopenForUndo), et c'est lui que l'Annuler défait. Tout autre geste de la recherche (suivant, précédent, nouvelle requête, autre
    // remplacement, fermeture du panneau) l'oublie.
    let afterReplace = null; // { id, landedId, landed } | null

    const liveStoryId = () => { const mode = HeaderFooterPreview.getHfMode(); return mode ? mode.zone + ':' + mode.variant : 'main'; };

    function forgetReplacement() { afterReplace = null; }

    // Appelé juste avant tout Annuler du modèle (Ctrl+Z dans le texte ou sur le panneau, bouton Annuler de la barre) : rouvre le texte du dernier remplacement quand la recherche
    // l'a quitté juste après et que rien n'a bougé depuis. Vrai quand il a rouvert ce texte. Sert une seule fois : l'Annuler d'après défait le texte ouvert, comme toujours.
    function reopenForUndo() {
      const pending = afterReplace;
      afterReplace = null;
      const ed = editor();
      if (!pending || !ed || liveStoryId() !== pending.landedId || !ed.state.doc.eq(pending.landed)) return false;
      if (!HeaderFooterPreview.openStory(pending.id)) return false;
      win = null; // les résultats sont ceux d'un autre document : la fenêtre de surlignage se repose
      return true;
    }

    // Se placer sur un résultat
    // Le résultat devient la sélection de l'éditeur (le panneau garde le focus : ProseMirror ne touche pas à la sélection du navigateur quand il ne l'a
    // pas) ; son surlignage vient des décorations, la sélection du navigateur étant alors dans le champ de recherche. La zone de défilement amène le
    // résultat au milieu quand il est hors de vue.
    function select(match) {
      const ed = editor();
      const TextSelection = EditorCore.getTextSelectionClass();
      ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, match.from, match.to)).setMeta(META, true));
      reveal(match);
    }

    function reveal(match) {
      const ed = editor();
      const scroller = document.getElementById('editor-container');
      if (!ed || !scroller) return;
      let rect;
      try { rect = ed.view.coordsAtPos(match.from); } catch (e) { return; }
      const box = scroller.getBoundingClientRect();
      const margin = 24;
      if (rect.top >= box.top + margin && rect.bottom <= box.bottom - margin) return;
      scroller.scrollTop += (rect.top + rect.bottom) / 2 - (box.top + box.bottom) / 2;
    }

    // Passe à un autre texte du modèle (l'éditeur y entre, comme après un clic sur la marge d'en-tête) et s'y place sur son résultat `ordinal` (-1 : le dernier). Les résultats du
    // texte qu'on quitte ne sont plus ceux de l'écran, ceux du nouveau se recalculent d'après son document.
    function openAndSelect(id, ordinal) {
      if (!HeaderFooterPreview.openStory(id)) return false;
      win = null;
      const matches = currentMatches(editor().state);
      if (!matches.length) return false;
      state.flash = '';
      select(matches[ordinal < 0 ? matches.length - 1 : Math.min(ordinal, matches.length - 1)]);
      return true;
    }

    // Le premier résultat d'un AUTRE texte, en allant vers la fin de la page (ou vers son début) et en repartant de l'autre bout : on y entre et on s'y place. Faux quand il
    // n'y en a nulle part ailleurs.
    function goElsewhere(backwards) {
      const stories = allStories(editor().state);
      const at = stories.findIndex(story => story.live);
      for (let step = 1; step < stories.length; step++) {
        const story = stories[(((backwards ? at - step : at + step) % stories.length) + stories.length) % stories.length];
        if (story.matches.length && openAndSelect(story.id, backwards ? -1 : 0)) return true;
      }
      return false;
    }

    // Suivant (ou précédent) à partir de la sélection ; quand il n'y en a plus dans ce texte, dans le texte suivant du modèle (l'en-tête, le corps, le pied : on y entre), et
    // en repartant de l'autre bout quand il n'y en a plus nulle part.
    function go(backwards) {
      afterReplace = null;
      const ed = editor();
      if (!ed || !state.query) return false;
      const matches = currentMatches(ed.state);
      const { from, to } = ed.state.selection;
      let target;
      if (backwards) {
        for (let i = matches.length - 1; i >= 0 && !target; i--) if (matches[i].to <= from) target = matches[i];
      } else {
        target = matches.find(m => m.from >= to);
      }
      if (target) { state.flash = ''; select(target); return true; }
      if (goElsewhere(backwards)) return true;
      if (!matches.length) return false;
      state.flash = '';
      select(backwards ? matches[matches.length - 1] : matches[0]);
      return true;
    }

    // La requête ou une option vient de changer : on se place sur le premier résultat à partir du début de la sélection (la frappe d'un mot qui
    // s'allonge reste donc sur place).
    function applyQuery() {
      afterReplace = null;
      const ed = editor();
      if (!ed) return;
      win = null; // d'autres résultats : la fenêtre de surlignage se repose autour de la sélection, puis d'après l'écran (placeWindow)
      state.flash = '';
      const matches = state.query ? currentMatches(ed.state) : [];
      const { from, to } = ed.state.selection;
      const target = matches.find(m => m.from >= from) || matches[0];
      if (target && !(target.from === from && target.to === to)) select(target); else refresh();
    }

    // Remplacer
    const TRACK_MARKS = new Set(['insertion', 'deletion', 'modification']);
    // Le texte qui remplace garde la mise en forme du premier caractère remplacé (gras, couleur, lien : une marque de lien n'est pas « inclusive »,
    // insertText la perdrait en fin de lien). En mode suivi, les marques de suivi héritées sont retirées : c'est le mode qui pose celles de
    // l'insertion.
    function replacementMarks(doc, pos, suggest) {
      const $pos = doc.resolve(pos);
      const after = $pos.nodeAfter;
      let marks = after && after.isText ? after.marks : [];
      marks = marks.filter(mark => mark.type.name !== 'deletion' && !(suggest && TRACK_MARKS.has(mark.type.name)));
      return $pos.parent.type.allowedMarks(marks);
    }

    function replaceInTransaction(tr, doc, match, text, suggest) {
      if (text) tr.replaceWith(match.from, match.to, doc.type.schema.text(text, replacementMarks(doc, match.from, suggest)));
      else tr.delete(match.from, match.to);
    }

    const KEPT_TEXT = { name: 'find.bubble.name', formula: 'find.bubble.formula', tooLong: 'find.bubble.tooLong', suggest: 'find.bubble.suggest' };
    // Remplace `match` dans `tr` : rend null quand il l'est, sinon pourquoi il reste tel quel - 'name' (le résultat n'est que dans le nom d'une bulle, qui
    // suit une colonne), 'formula' (la formule d'un calcul), 'tooLong' (un « Avant » ou un « Après » trop long), 'suggest' (une bulle ne se propose pas en
    // suppression et insertion : en mode suivi elle reste). Une bulle ne change que par le texte qu'elle porte (« Avant », « Après »), par ses attributs :
    // sa position et sa taille ne bougent pas, les résultats suivants non plus.
    function replaceMatch(tr, doc, match, suggest) {
      if (!isBubble(match)) { replaceInTransaction(tr, doc, match, expandReplacement(match, state.replacement), suggest); return null; }
      const { attrs, reason } = replaceInBubble(doc.nodeAt(match.from), state.query, state, state.replacement);
      if (!attrs) return reason;
      if (suggest) return 'suggest';
      tr.setNodeMarkup(match.from, null, attrs);
      return null;
    }

    // Envoie `tr` et rend la transaction réellement appliquée (celle que le pont du suivi a transformée en suggestions, le cas échéant), ou null si
    // elle a été refusée.
    function dispatchAndCapture(tr) {
      const ed = editor();
      let applied = null;
      const grab = ({ transaction }) => { if (transaction.docChanged) applied = transaction; };
      ed.on('transaction', grab);
      try { ed.view.dispatch(tr); } finally { ed.off('transaction', grab); }
      return applied;
    }

    // Remplace le résultat courant, puis se place sur le suivant. Sans résultat courant (la sélection n'est pas sur un résultat), « Remplacer » ne fait
    // que se placer sur le prochain : on voit ce qui va être remplacé avant de le remplacer.
    function replaceCurrent() {
      afterReplace = null;
      const ed = editor();
      if (!ed || !ed.isEditable || !state.query) return false;
      const matches = currentMatches(ed.state);
      const index = indexOfSelection(matches, ed.state.selection);
      if (index < 0) return go(false);
      const match = matches[index];
      const replacedIn = liveStoryId();
      const tr = ed.state.tr;
      const kept = replaceMatch(tr, ed.state.doc, match, Editor.isTrackChangesOn());
      // Une bulle qui ne change pas : on le dit et on passe au résultat suivant, comme après un remplacement.
      if (kept) { go(false); setFlash(I18n.t(KEPT_TEXT[kept], { max: VariableFormat.AFFIX_MAX })); return false; }
      const applied = dispatchAndCapture(tr);
      if (!applied) { setFlash(I18n.t('find.replaceFailed')); return false; }
      // Ce qui suit le texte qui vient d'être mis : la fin du remplacement dans le document final (en mode suivi, après l'insertion qui suit la
      // suppression).
      const end = applied.mapping.map(match.to, 1);
      const rest = currentMatches(ed.state);
      const next = rest.find(m => m.from >= end);
      state.flash = '';
      if (next) select(next);
      else if (!goElsewhere(false)) {
        // Plus rien dans les autres textes : on repart du début de celui-ci.
        if (rest.length) select(rest[0]);
        else {
          const TextSelection = EditorCore.getTextSelectionClass();
          ed.view.dispatch(ed.state.tr.setSelection(TextSelection.near(ed.state.doc.resolve(Math.min(end, ed.state.doc.content.size)))).setMeta(META, true));
        }
      }
      // La recherche a quitté le texte du remplacement : le prochain Annuler le rouvre.
      if (liveStoryId() !== replacedIn) afterReplace = { id: replacedIn, landedId: liveStoryId(), landed: editor().state.doc };
      return true;
    }

    // Ce que dit le compteur après « Tout remplacer » : « 3 remplacements, 1 bulle laissée, 2 autres ailleurs » - ce qui a changé, ce qui est resté tel quel, ce qui attend dans
    // un autre texte du modèle (l'en-tête, le corps, le pied).
    function replacedFlash(count, kept, elsewhere) {
      return [count ? I18n.t('find.replaced', { count }) : '', kept ? I18n.t('find.kept', { kept }) : '', elsewhere ? I18n.t('find.elsewhere', { rest: elsewhere }) : ''].filter(Boolean).join(', ');
    }

    // Tous les résultats DU TEXTE QUE L'ÉDITEUR CONTIENT (le corps, ou l'en-tête ou le pied ouvert) en une transaction (donc une seule annulation), du dernier au premier : les
    // positions des résultats d'avant ne bougent pas. Ceux des autres textes attendent : l'annulation, elle, n'a qu'un historique par texte.
    function replaceAll() {
      afterReplace = null;
      const ed = editor();
      if (!ed || !ed.isEditable || !state.query) return 0;
      const stories = allStories(ed.state);
      const matches = stories.find(story => story.live).matches;
      if (!matches.length) return 0;
      const elsewhere = stories.reduce((sum, story) => sum + (story.live ? 0 : story.matches.length), 0);
      const suggest = Editor.isTrackChangesOn();
      const doc = ed.state.doc;
      const tr = ed.state.tr;
      let kept = 0;
      for (let i = matches.length - 1; i >= 0; i--) if (replaceMatch(tr, doc, matches[i], suggest)) kept++;
      const count = matches.length - kept;
      // Que des bulles qui ne changent pas : rien à envoyer, le document reste tel quel.
      if (!count) { setFlash(replacedFlash(0, kept, elsewhere)); return 0; }
      const applied = dispatchAndCapture(tr);
      if (!applied) { setFlash(I18n.t('find.replaceFailed')); return 0; }
      setFlash(replacedFlash(count, kept, elsewhere));
      return count;
    }

    return { go, applyQuery, replaceCurrent, replaceAll, reopenForUndo, forgetReplacement };
  })();

  // Le panneau
  const { setFlash, open, closePanel, toggleOpen, wireEditor, syncOptions, queryError } = (function () {
    const MAX_PREFILL = 120; // une sélection plus longue n'est pas un mot à chercher
    const isMac = () => /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');

    function iconButton(icon, className) {
      const b = el('button', 'pp-find-btn' + (className ? ' ' + className : ''));
      b.type = 'button';
      Dom.setMarkup(b, Icons.svg(icon));
      return b;
    }
    function field(id) {
      const input = el('input', 'pp-find-input');
      input.id = id;
      input.type = 'text';
      input.autocomplete = 'off';
      input.autocapitalize = 'off';
      input.spellcheck = false;
      return input;
    }

    function setFlash(text) {
      state.flash = text;
      state.flashDoc = editor() ? editor().state.doc : null;
      updateCount();
    }

    function ensure() {
      if (bar) return;
      const container = document.getElementById('editor-container');
      bar = el('div', 'pp-find-bar');
      bar.id = 'pp-find-bar';
      bar.setAttribute('role', 'search');
      // Ses boutons gardent le focus et le panneau défait lui-même (wirePanel) : le raccourci d'Annuler de js/shortcuts.js ne prend pas la touche ici.
      bar.setAttribute('data-own-undo', '');
      bar.hidden = true;

      const findRow = el('div', 'pp-find-row');
      const toggle = iconButton('chevronRight', 'pp-find-toggle');
      toggle.id = 'pp-find-toggle-replace';
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-controls', 'pp-find-replace-row');
      const find = field('pp-find-input');
      const count = el('span', 'pp-find-count');
      count.id = 'pp-find-count';
      count.setAttribute('role', 'status');
      count.setAttribute('aria-live', 'polite');
      const prev = iconButton('chevronUp');
      prev.id = 'pp-find-prev';
      const next = iconButton('chevronDown');
      next.id = 'pp-find-next';
      const matchCase = iconButton('matchCase', 'pp-find-option');
      matchCase.id = 'pp-find-match-case';
      matchCase.setAttribute('aria-pressed', 'false');
      const wholeWord = iconButton('wholeWord', 'pp-find-option');
      wholeWord.id = 'pp-find-whole-word';
      wholeWord.setAttribute('aria-pressed', 'false');
      const regex = iconButton('regex', 'pp-find-option');
      regex.id = 'pp-find-regex';
      regex.setAttribute('aria-pressed', 'false');
      const close = iconButton('closeFind', 'pp-find-close');
      close.id = 'pp-find-close';
      findRow.append(toggle, find, count, prev, next, matchCase, wholeWord, regex, close);

      const replaceRow = el('div', 'pp-find-row');
      replaceRow.id = 'pp-find-replace-row';
      replaceRow.hidden = true;
      const spacer = el('span', 'pp-find-spacer');
      const replacement = field('pp-find-replacement');
      const one = el('button', 'pp-find-text-btn');
      one.type = 'button';
      one.id = 'pp-find-replace-one';
      const all = el('button', 'pp-find-text-btn');
      all.type = 'button';
      all.id = 'pp-find-replace-all';
      replaceRow.append(spacer, replacement, one, all);

      bar.append(findRow, replaceRow);
      container.parentNode.insertBefore(bar, container);
      container.addEventListener('scroll', placeWindow, { passive: true });
      refs = { toggle, find, count, prev, next, matchCase, wholeWord, regex, close, replaceRow, replacement, one, all };
      wirePanel();
      applyTexts();
    }

    // Textes du panneau, écrits quand il se bâtit. Info-bulle native (title) : le panneau vit hors de #toolbar-top, où s'applique le
    // [data-tip] de la barre.
    function applyTexts() {
      const t = key => I18n.t(key);
      bar.setAttribute('aria-label', t('find.aria'));
      const label = (button, key) => { button.setAttribute('aria-label', t(key)); button.title = t(key); };
      label(refs.toggle, 'find.toggleReplace');
      label(refs.prev, 'find.prev');
      label(refs.next, 'find.next');
      label(refs.matchCase, 'find.matchCase');
      label(refs.wholeWord, 'find.wholeWord');
      label(refs.regex, 'find.regex');
      label(refs.close, 'find.close');
      refs.find.setAttribute('aria-label', t('find.find.label'));
      refs.find.placeholder = t('find.find.placeholder');
      refs.replacement.setAttribute('aria-label', t('find.replacement.label'));
      refs.replacement.placeholder = t(state.regex ? 'find.replacement.placeholderRegex' : 'find.replacement.placeholder');
      refs.one.textContent = t('find.replaceOne');
      refs.all.textContent = t('find.replaceAll');
    }

    function setReplaceVisible(visible) {
      state.replaceVisible = visible;
      refs.replaceRow.hidden = !visible;
      refs.toggle.setAttribute('aria-expanded', visible ? 'true' : 'false');
    }

    function setDisabled(button, disabled) {
      // aria-disabled plutôt que disabled : le bouton garde le focus quand le dernier résultat vient d'être remplacé (un bouton désactivé le perdrait
      // au profit de <body>).
      if (disabled) button.setAttribute('aria-disabled', 'true'); else button.removeAttribute('aria-disabled');
    }

    // L'erreur de l'expression régulière en cours de frappe, null quand le motif est bon, vide, ou que l'option n'est pas allumée.
    function queryError() {
      return state.regex && state.query ? compile(state.query, state).error || null : null;
    }
    // Le champ dit que son motif est faux (lecteur d'écran : aria-invalid), et l'info-bulle du compteur donne la raison du navigateur, en anglais
    // dans la plupart d'entre eux : « 3 sur 12 » ne dit pas où est la parenthèse oubliée.
    function syncRegexError() {
      const error = queryError();
      if (error) { refs.find.setAttribute('aria-invalid', 'true'); refs.count.title = error.message; } else { refs.find.removeAttribute('aria-invalid'); refs.count.removeAttribute('title'); }
    }
    // Les trois options reflètent l'état de la recherche (il survit à la fermeture du panneau, et `setOptions` peut le changer avant que le panneau n'existe) ;
    // le champ de remplacement dit ce qu'il comprend selon l'option « Expression régulière ».
    function syncOptions() {
      if (!refs) return;
      for (const key of ['matchCase', 'wholeWord', 'regex']) refs[key].setAttribute('aria-pressed', state[key] ? 'true' : 'false');
      refs.replacement.placeholder = I18n.t(state.regex ? 'find.replacement.placeholderRegex' : 'find.replacement.placeholder');
    }

    // « 3 sur 12 » quand la sélection est sur un résultat, « 12 résultats » sinon, « Aucun résultat » ; après « Tout remplacer », le nombre de
    // remplacements jusqu'à la prochaine action.
    // `total` : les résultats de tous les textes du modèle (le corps, l'en-tête, le pied) ; `index` : le rang du résultat courant parmi eux.
    function countLabel(total, index) {
      if (queryError()) return { text: I18n.t('find.regexInvalid'), kind: 'error' };
      if (state.flash) return { text: state.flash, kind: 'flash' };
      if (state.query && !total) return { text: I18n.t('find.count.none'), kind: 'none' };
      if (!total) return { text: '', kind: 'idle' };
      return { text: index >= 0 ? I18n.t('find.count.index', { index: index + 1, count: total }) : I18n.t('find.count.total', { count: total }), kind: 'some' };
    }
    function updateCount() {
      if (!bar || !refs) return;
      const ed = editor();
      if (state.flash && ed && ed.state.doc !== state.flashDoc) state.flash = '';
      const stories = ed ? allStories(ed.state) : [];
      const at = stories.findIndex(story => story.live);
      const total = stories.reduce((sum, story) => sum + story.matches.length, 0);
      const own = at >= 0 ? indexOfSelection(stories[at].matches, ed.state.selection) : -1;
      const before = stories.slice(0, Math.max(at, 0)).reduce((sum, story) => sum + story.matches.length, 0);
      const label = countLabel(total, own >= 0 ? before + own : -1);
      if (refs.count.textContent !== label.text) refs.count.textContent = label.text;
      refs.count.dataset.kind = label.kind;
      syncRegexError();
      const none = !total;
      setDisabled(refs.prev, none);
      setDisabled(refs.next, none);
      // « Remplacer » va aussi au résultat d'un autre texte ; « Tout remplacer » agit sur le texte ouvert.
      const canReplace = !none && !!ed && ed.isEditable;
      setDisabled(refs.one, !canReplace);
      setDisabled(refs.all, !canReplace || !stories[at].matches.length);
    }

    const isDisabled = button => button.getAttribute('aria-disabled') === 'true';

    function wirePanel() {
      const { toggle, find, prev, next, matchCase, wholeWord, regex, close, replacement, one, all } = refs;
      find.addEventListener('input', () => { state.query = find.value; applyQuery(); });
      replacement.addEventListener('input', () => { state.replacement = replacement.value; });
      find.addEventListener('keydown', event => {
        if (event.key !== 'Enter' || event.isComposing) return;
        event.preventDefault();
        go(event.shiftKey);
      });
      // Entrée dans le champ de remplacement remplace, comme le bouton.
      replacement.addEventListener('keydown', event => {
        if (event.key !== 'Enter' || event.isComposing) return;
        event.preventDefault();
        replaceCurrent();
      });
      // Échap ferme depuis n'importe quel contrôle du panneau ; Ctrl+F et Ctrl+H y servent à aller au champ voulu (jamais à la recherche du
      // navigateur).
      bar.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closePanel(); return; }
        if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
        const key = event.key.toLowerCase();
        if (key === 'f') { event.preventDefault(); find.focus(); find.select(); }
        else if (key === 'h') { event.preventDefault(); showReplace(); }
        else if ((key === 'z' || key === 'y') && event.target.tagName !== 'INPUT') {
          // Un clic sur « Remplacer » laisse le clavier sur ce bouton, qui n'a pas d'historique : Ctrl+Z y défait le remplacement dans le modèle
          // (Ctrl+Maj+Z ou Ctrl+Y le refait). Dans un champ, Ctrl+Z reste celui du champ.
          event.preventDefault();
          const ed = editor();
          if (!ed || !ed.isEditable) return;
          if (key === 'y' || event.shiftKey) ed.commands.redo(); else { reopenForUndo(); ed.commands.undo(); }
        }
      });
      toggle.addEventListener('click', () => setReplaceVisible(!state.replaceVisible));
      prev.addEventListener('click', () => { if (!isDisabled(prev)) go(true); });
      next.addEventListener('click', () => { if (!isDisabled(next)) go(false); });
      const toggleOption = key => {
        state[key] = !state[key];
        syncOptions();
        applyQuery();
      };
      matchCase.addEventListener('click', () => toggleOption('matchCase'));
      wholeWord.addEventListener('click', () => toggleOption('wholeWord'));
      regex.addEventListener('click', () => toggleOption('regex'));
      close.addEventListener('click', () => closePanel());
      one.addEventListener('click', () => { if (!isDisabled(one)) replaceCurrent(); });
      all.addEventListener('click', () => { if (!isDisabled(all)) replaceAll(); });
    }

    function showReplace() {
      if (!editor() || !editor().isEditable) return;
      setReplaceVisible(true);
      refs.replacement.focus();
      refs.replacement.select();
    }

    // Le mot sélectionné dans le texte, s'il y en a un à reprendre dans le champ (une seule ligne, courte, sans bulle).
    function selectedQuery(ed) {
      const { from, to, empty } = ed.state.selection;
      if (empty || to - from > MAX_PREFILL) return null;
      const text = ed.state.doc.textBetween(from, to, '\n', OBJECT);
      return text && !/[\n\uFFFC]/.test(text) ? text : null;
    }

    function updateToolbarButton(isOpen) {
      const button = document.getElementById('v2-btn-find');
      if (!button) return;
      button.classList.toggle('is-active', isOpen);
      button.setAttribute('aria-pressed', isOpen ? 'true' : 'false');
    }

    // Ouvre le panneau (ou rend le clavier à son champ s'il l'est déjà). `replace` : montre aussi la ligne « Remplacer par ». Faux sans rien ouvrir
    // quand l'éditeur n'est pas à l'écran (Lecture, macro-modèle).
    function open(options) {
      const ed = editor();
      const container = document.getElementById('editor-container');
      if (!ed || !container || container.offsetParent === null) return false;
      ensure();
      const wantReplace = !!(options && options.replace) && ed.isEditable;
      const prefill = selectedQuery(ed);
      if (prefill !== null) state.query = state.regex ? escapeRegex(prefill) : prefill; // en expression régulière, le mot repris se cherche tel quel
      refs.find.value = state.query;
      refs.replacement.value = state.replacement;
      syncOptions();
      state.open = true;
      bar.hidden = false;
      setReplaceVisible(ed.isEditable && (wantReplace || state.replaceVisible));
      state.flash = '';
      updateToolbarButton(true);
      refresh();
      // Un mot repris de la sélection + « remplacer » : le champ utile est celui du remplacement.
      if (wantReplace && state.query) { refs.replacement.focus(); refs.replacement.select(); } else { refs.find.focus(); refs.find.select(); }
      return true;
    }

    // Ferme le panneau et efface le surlignage. `focus: false` quand l'éditeur n'est plus à l'écran (js/main.js, Mode lecture) : lui rendre le clavier
    // n'aurait pas de sens.
    function closePanel(options) {
      if (!state.open) return;
      state.open = false;
      forgetReplacement();
      win = null;
      if (bar) bar.hidden = true;
      updateToolbarButton(false);
      const ed = editor();
      if (!ed) return;
      refresh();
      if (!options || options.focus !== false) ed.commands.focus();
    }

    // Ctrl+F et Ctrl+H sur le document, pas sur l'éditeur : après un clic sur un bouton de la barre d'outils le focus n'est plus dans le texte, et la
    // recherche du navigateur s'ouvrirait à la place. Ils laissent la main à qui les a déjà pris (le champ du panneau), à une fenêtre ouverte, et au
    // navigateur quand l'éditeur n'est pas à l'écran (Mode lecture, macro-modèle).
    const anyWindowOpen = () => Array.from(document.querySelectorAll('.pp-modal')).some(overlay => getComputedStyle(overlay).display !== 'none');
    function onDocumentKeydown(event) {
      if (event.defaultPrevented || event.altKey || event.isComposing || !(isMac() ? event.metaKey : event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (!(key === 'f' && !event.shiftKey) && key !== 'h') return;
      if (anyWindowOpen()) return;
      if (open({ replace: key === 'h' })) event.preventDefault();
    }

    // Annuler (Ctrl+Z dans le texte, bouton Annuler de la barre) juste après un « Remplacer » qui a changé de texte : on rouvre d'abord le texte du remplacement (reopenForUndo), et
    // l'Annuler habituel, celui de l'éditeur ou du bouton, le défait. En capture, pour passer avant l'éditeur et avant le bouton, sans rien leur retirer ni les remplacer. Le panneau
    // fait de même pour ses propres boutons (wirePanel) ; un champ (celui du panneau, une fenêtre) défait sa frappe, il n'est pas concerné.
    function onUndoKeydown(event) {
      if (event.defaultPrevented || event.altKey || event.shiftKey || event.isComposing || !(isMac() ? event.metaKey : event.ctrlKey)) return;
      if ((event.key || '').toLowerCase() !== 'z') return;
      const ed = editor();
      if (ed && ed.view.dom.contains(event.target)) reopenForUndo();
    }
    function onUndoClick(event) {
      if (event.target.closest && event.target.closest('#v2-btn-undo')) reopenForUndo();
    }

    function wireEditor(ed) {
      ed.on('transaction', ({ transaction }) => {
        if (!state.open) return;
        updateCount();
        if (!transaction || transaction.getMeta(META) !== 'window') scheduleWindow();
      });
      document.addEventListener('keydown', onDocumentKeydown);
      document.addEventListener('keydown', onUndoKeydown, true);
      document.addEventListener('click', onUndoClick, true);
      // Le compteur compte aussi l'en-tête et le pied : il suit « Première page différente » et le chargement d'un modèle, qui ne passent par aucune transaction. Un autre modèle, ou
      // d'autres textes, ne sont plus ceux du dernier remplacement : Annuler ne le rouvre plus.
      HeaderFooterPreview.onStoriesChange(() => { forgetReplacement(); if (state.open) updateCount(); });
    }

    // La loupe de la barre : ouvre le panneau, ou le ferme quand il est déjà ouvert.
    function toggleOpen() {
      if (state.open) closePanel(); else open({ replace: false });
    }

    return { setFlash, open, closePanel, toggleOpen, wireEditor, syncOptions, queryError };
  })();

  return {
    findMatches, isBubble, createExtension, wireEditor, open, close: closePanel, toggle: toggleOpen,
    isOpen: () => state.open, queryError,
    next: () => go(false), prev: () => go(true), replaceCurrent, replaceAll,
    setQuery(query) { state.query = String(query == null ? '' : query); if (refs) refs.find.value = state.query; applyQuery(); },
    setOptions(options) {
      if (options && options.matchCase !== undefined) state.matchCase = !!options.matchCase;
      if (options && options.wholeWord !== undefined) state.wholeWord = !!options.wholeWord;
      if (options && options.regex !== undefined) state.regex = !!options.regex;
      syncOptions();
      applyQuery();
    },
    setReplacement(text) { state.replacement = String(text == null ? '' : text); if (refs) refs.replacement.value = state.replacement; },
  };
})();
