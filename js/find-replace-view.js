// Rechercher / Remplacer, l'état de la recherche et le surlignage (une extension TipTap : les décorations, Ctrl+F / Ctrl+H sur le document). L'état vit ici, pas dans le plugin
// ProseMirror : un changement de modèle reconstruit l'état de l'éditeur (Editor.setHTML) et remettrait sinon la recherche à zéro sous le panneau resté ouvert.
// Façade : js/find-replace.js.
const FindReplaceView = (function () {
  // L'état de la recherche, partagé par le surlignage, les actions et le panneau. `win` : { from, to }, les positions du document que couvre le surlignage quand il y a plus de
  // ALL_BELOW résultats (placeWindow).
  const META = 'ppFindReplace';
  const state = { open: false, query: '', replacement: '', matchCase: false, wholeWord: false, regex: false, replaceVisible: false, flash: '', flashDoc: null, win: null };

  const editor = () => EditorCore.getEditor();

  const { findMatches } = FindReplaceEngine;

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
    if (!state.win) return [0, -1];
    return [firstWhere(matches.length, i => matches[i].to > state.win.from), firstWhere(matches.length, i => matches[i].from >= state.win.to) - 1];
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
    if (!state.win) {
      const near = firstWhere(matches.length, i => matches[i].from >= from);
      state.win = { from: matches[Math.max(0, near - MIN_SPAN)].from, to: matches[Math.min(matches.length - 1, near + MIN_SPAN)].to };
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
    state.win = { from: matches[Math.max(0, firstShown - span)].from, to: matches[Math.min(count - 1, lastShown + span)].to };
    refresh(true);
  }

  // Après la transaction en cours, et le défilement qu'elle a pu demander (select, reveal) : la mesure se fait sur l'écran tel qu'il sera.
  function scheduleWindow() {
    if (windowPending) return;
    windowPending = true;
    queueMicrotask(() => { windowPending = false; placeWindow(); });
  }

  return { META, state, editor, currentMatches, allStories, indexOfSelection, refresh, scheduleWindow, placeWindow, createExtension };
})();
