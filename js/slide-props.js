// Les propriétés d'une diapositive : sa transition et son fond (demandes du 21/10 à 18:35 : « transitions », puis le fond, quatrième fonction ; cartes du 21/10 : les réglages se posent dans
// le menu ⋯ d'une miniature, extensions/diapositives/slide-transitions-ui.js et slide-background-ui.js). Le socle garde ici ce qui doit tenir même sans le code de l'extension « diapositives » :
// le repère caché, ses garde-fous et ce que les sorties en voient ; l'effet lui-même se joue au diaporama (extensions/diapositives/slide-show.js, slide-transitions.js).
//  - Le REPÈRE : un bloc vide de hauteur nulle, rangé tout au début de sa diapositive (nœud `slideProps`, <div class="pp-slide-props"> dans le HTML enregistré), qui dit comment la
//    diapositive APPARAÎT quand on y arrive au diaporama : `transition` (fade, push, wipe, cover, uncover, zoom ; rien : aucune), `from` (le côté d'où elle arrive : r, l, t, b) et `dur`
//    (la durée, en millisecondes) ; et de quelle couleur est son FOND (`bg`, #rrggbb ; rien : pas de fond, le blanc de la page). Une diapositive qui n'a ni l'un ni l'autre n'a pas de
//    repère : le texte d'une présentation qui n'en a jamais posé s'écrit comme avant. Il est dans la diapositive (entre ses deux sauts de page) : la déplacer, la dupliquer, la copier,
//    l'importer ou la supprimer emporte sa transition et son fond sans que ces gestes le sachent.
//  - Le FOND se dessine dans l'éditeur par le repère lui-même (css/free-frame.css : un pseudo-élément de la taille de la page, sous le texte, posé depuis le coin de la page comme un cadre
//    libre) ; les miniatures en copient le rendu. Il couvre la page où la diapositive s'ouvre (comme un cadre libre) : ce que la diapositive déborde sur une deuxième page reste blanc.
//    Les sorties le voient comme un cadre libre de la page entière, sans trait ni texte, rangé avant les autres (forOutput) : la Lecture, le diaporama et l'impression le peignent sous
//    le texte, le PDF au fond de sa page, le Word en forme « derrière le texte ».
//  - Les GARDE-FOUS (createExtension) : un seul repère par diapositive, le premier, rangé avant les cadres libres (js/free-frame.js) ; une diapositive qui perd son repère avec son
//    texte (tout effacer dedans) le retrouve tant qu'aucune diapositive n'a été supprimée ni ajoutée et que le texte ne le porte plus nulle part (monter ou descendre une diapositive
//    l'emporte avec elle, sans en laisser de copie sur celle qui prend sa place) ; Retour arrière au début du texte d'une diapositive n'efface pas son repère (il
//    ôte le saut de page qui la précède, comme sans repère) ; un repère collé hors d'une présentation, ou dans un bloc (colonne, encadré, case), n'entre pas. Le repère n'est jamais
//    sélectionné ni saisi à la souris.
//  - Les SORTIES : la Lecture, le PDF, le Word, le diaporama, les e-mails et les lots ne voient jamais le repère (forOutput, par js/slides-entry.js:outputHtml : il y devient le cadre du
//    fond, ou rien) ; le diaporama lit les transitions dans le texte de l'éditeur (listOf).
// Les écritures de ce module (pose, rangement) ne sont pas des modifications à suivre (TrackChanges.skipTracking) et ne rejouent pas le rangement (OWN_META).
const SlideProps = (function () {
  const NODE = 'slideProps';
  const CLASS = 'pp-slide-props';
  const OWN_META = 'ppSlideProps';
  // Les effets, dans l'ordre où la fenêtre les propose ; SIDED : ceux qui ont un côté d'où la diapositive arrive.
  const KINDS = ['fade', 'push', 'wipe', 'cover', 'uncover', 'zoom'];
  const SIDED = ['push', 'wipe', 'cover', 'uncover'];
  const SIDES = ['r', 'l', 't', 'b'];
  const DEFAULTS = { transition: '', from: 'r', dur: 700, bg: '' };
  const DURATION = { min: 100, max: 5000, step: 50 };
  const DOM_ATTRS = { transition: 'data-trans', from: 'data-trans-from', dur: 'data-trans-dur', bg: 'data-bg' };
  // Ce que règle la fenêtre « Transition… » : un effet se pose en entier (sa sorte, son côté, sa durée), le fond d'une diapositive n'y est pour rien, et inversement.
  const TRANSITION_KEYS = ['transition', 'from', 'dur'];
  // Le repère ne prend aucune place : la pagination le lit comme un bloc de hauteur nulle à sa place (comme celui d'une diapositive liée, js/slide-links.js). Celui qui porte un fond
  // ne rogne rien (`overflow`) : son fond est un pseudo-élément qui sort de lui (css/free-frame.css), et la couleur qu'il lit (`--pp-slide-bg`) est écrite avec lui.
  const STYLE = 'display:block;height:0;margin:0;padding:0;border:0;overflow:hidden';
  const STYLE_BG = 'display:block;height:0;margin:0;padding:0;border:0';

  // Une couleur lisible (#rrggbb en minuscules), ou '' : aucune.
  const colorOf = (raw) => {
    const hex = typeof raw === 'string' ? ColorMath.parseCss(raw) : null;
    return hex ? hex.toLowerCase() : '';
  };
  // Les attributs, bornés : une valeur absente ou illisible (HTML écrit à la main, version plus récente) retombe sur sa valeur par défaut, jamais sur une erreur.
  function normalized(raw) {
    const a = raw || {};
    const ms = Number(a.dur);
    const dur = Number.isFinite(ms) && a.dur !== '' && a.dur !== null ? Math.round(Math.min(DURATION.max, Math.max(DURATION.min, ms)) / DURATION.step) * DURATION.step : DEFAULTS.dur;
    return {
      transition: KINDS.includes(a.transition) ? a.transition : '',
      from: SIDES.includes(a.from) ? a.from : DEFAULTS.from,
      dur,
      bg: colorOf(a.bg),
    };
  }
  // Sans effet : une transition « aucune ». Sans rien du tout (ni effet, ni fond) : un repère qui n'a plus de raison d'être.
  const isNone = a => !a || !a.transition;
  const hasBackground = a => !!a && !!a.bg;
  const isBlank = a => isNone(a) && !hasBackground(a);
  const same = (a, b) => a.transition === b.transition && a.from === b.from && a.dur === b.dur && a.bg === b.bg;
  // Un repère sans effet écrit toujours la même chose (le côté et la durée par défaut) : deux repères « fond seul » de même couleur sont le même repère.
  function settled(a) {
    const out = normalized(a);
    if (!out.transition) { out.from = DEFAULTS.from; out.dur = DEFAULTS.dur; }
    return out;
  }
  function attrsOfEl(el) {
    const raw = {};
    Object.keys(DOM_ATTRS).forEach((key) => { raw[key] = el.getAttribute(DOM_ATTRS[key]); });
    return normalized(raw);
  }
  // Le <div> que l'éditeur écrit pour le repère : rien de visible hors le fond. Les attributs d'un effet ne s'écrivent que s'il y a un effet, celui du fond que s'il y a un fond : un repère
  // de transition s'écrit comme avant, un repère « fond seul » ne porte que sa couleur.
  function domAttrs(a) {
    const out = { class: CLASS, contenteditable: 'false', 'aria-hidden': 'true', style: a.bg ? STYLE_BG + ';--pp-slide-bg:' + a.bg : STYLE };
    Object.keys(DOM_ATTRS).forEach((key) => {
      if (key === 'bg' ? a.bg : a.transition) out[DOM_ATTRS[key]] = String(a[key]);
    });
    return out;
  }

  // Le document
  const isMarker = node => !!node && node.type.name === NODE;
  const inPresentation = () => SlidesEntry.presentationShown() && !HeaderFooterPreview.getHfMode();
  // Les diapositives du texte `doc` (celles de la bande : ce qu'il y a entre deux sauts de page de premier niveau), dans l'ordre : { start, end, markers } (`markers` : ses repères de
  // premier niveau, { node, pos }, d'ordinaire un seul). Gardées par texte : une frappe lit le texte d'avant, que la transaction précédente a déjà lu.
  const read = new WeakMap();
  function slidesOf(doc) {
    const kept = read.get(doc);
    if (kept) return kept;
    const found = [];
    let slide = { start: 0, markers: [] };
    doc.forEach((node, pos) => {
      if (node.type.name === 'pageBreak') {
        found.push(Object.assign(slide, { end: pos }));
        slide = { start: pos + node.nodeSize, markers: [] };
        return;
      }
      if (isMarker(node)) slide.markers.push({ node, pos });
    });
    found.push(Object.assign(slide, { end: doc.content.size }));
    read.set(doc, found);
    return found;
  }
  // L'attribut du repère de chaque diapositive de `doc`, dans l'ordre, ou null quand elle n'en a pas.
  const attrsOfSlide = slide => (slide.markers.length ? normalized(slide.markers[0].node.attrs) : null);
  // La transition de chaque diapositive de `doc`, dans l'ordre : { transition, from, dur, bg }, ou null quand elle n'en a pas (son fond est dans `backgroundsOf`).
  function listOf(doc) {
    return slidesOf(doc).map((slide) => {
      const a = attrsOfSlide(slide);
      return isNone(a) ? null : a;
    });
  }
  // Le fond de chaque diapositive de `doc`, dans l'ordre : #rrggbb, ou '' quand elle n'en a pas.
  const backgroundsOf = doc => slidesOf(doc).map((slide) => { const a = attrsOfSlide(slide); return a ? a.bg : ''; });

  // Les commandes
  const own = tr => TrackChanges.skipTracking(tr.setMeta(OWN_META, true));
  // Change le repère des diapositives `indexes` (leurs rangs dans le texte de l'éditeur) : `change(attrs)` rend les attributs d'après ceux d'avant (le repère de la diapositive, ou ses valeurs
  // par défaut quand elle n'en a pas). Un repère qui ne dit plus rien s'efface, une diapositive qui doit en avoir un en reçoit un. Tout tient en UNE transaction : un seul Ctrl+Z la
  // défait, la sélection ne bouge pas. Rend le nombre de diapositives qui ont changé, ou -1 quand l'éditeur a refusé la transaction (une diapositive bloquée par son lien : js/slide-links.js
  // dit pourquoi).
  function applyTo(ed, indexes, change) {
    if (!ed || !ed.isEditable) return 0;
    const { state } = ed;
    const slides = slidesOf(state.doc);
    const type = state.schema.nodes[NODE];
    const tr = state.tr;
    let changed = 0;
    // Du bas vers le haut : un repère posé ou ôté plus loin ne décale pas les positions des diapositives d'avant.
    Array.from(new Set(indexes)).sort((a, b) => b - a).forEach((index) => {
      const slide = slides[index];
      if (!slide) return;
      const had = slide.markers[0] || null;
      const current = settled(had ? had.node.attrs : null);
      const next = settled(change(current));
      if (isBlank(next)) {
        if (had) { tr.delete(had.pos, had.pos + had.node.nodeSize); changed += 1; }
      } else if (had) {
        if (!same(current, next)) { tr.setNodeMarkup(had.pos, undefined, next); changed += 1; }
      } else {
        tr.insert(slide.start, type.create(next));
        changed += 1;
      }
    });
    if (!changed) return 0;
    const before = ed.state.doc;
    ed.view.dispatch(own(tr));
    return ed.state.doc === before ? -1 : changed;
  }
  // Pose la transition `spec` ({ transition, from, dur } ; sans effet : aucune) : le fond que la diapositive a déjà reste.
  function applyTransition(ed, indexes, spec) {
    const next = normalized(spec);
    return applyTo(ed, indexes, current => Object.assign({}, current, { transition: next.transition, from: next.from, dur: next.dur }));
  }
  // Pose le fond `color` (#rrggbb ; '' : aucun) : la transition que la diapositive a déjà reste.
  function applyBackground(ed, indexes, color) {
    const bg = colorOf(color);
    return applyTo(ed, indexes, current => Object.assign({}, current, { bg }));
  }

  // Le nœud
  function createNode(Node) {
    return Node.create({
      name: NODE,
      group: 'block',
      atom: true,
      selectable: false,
      draggable: false,
      addAttributes() {
        const out = {};
        Object.keys(DEFAULTS).forEach((key) => {
          out[key] = { default: DEFAULTS[key], parseHTML: el => attrsOfEl(el)[key], renderHTML: () => ({}) };
        });
        return out;
      },
      parseHTML() { return [{ tag: 'div.' + CLASS, priority: 1000 }]; },
      renderHTML({ node }) { return ['div', domAttrs(normalized(node.attrs))]; },
    });
  }

  // Les garde-fous
  // Le rangement, après une transaction de la personne : un repère par diapositive (le premier), au tout début d'elle, et seulement s'il dit un effet ou un fond ; une diapositive qui vient
  // de perdre le sien avec son texte le retrouve quand leur nombre n'a pas changé (rien n'a été supprimé en entier) et que le texte d'après ne le porte plus nulle part (une diapositive
  // déplacée garde le sien : la diapositive qui prend sa place n'en reçoit pas de copie). Rien à faire quand aucun repère n'est là ni avant ni après.
  function tidyTransaction(trs, oldState, state) {
    const before = slidesOf(oldState.doc);
    const after = slidesOf(state.doc);
    const countBefore = before.reduce((n, slide) => n + slide.markers.length, 0);
    const countAfter = after.reduce((n, slide) => n + slide.markers.length, 0);
    if (!countBefore && !countAfter) return null;
    const removals = [];   // { pos, node }
    const inserts = [];    // { pos (dans le texte d'après), node }
    after.forEach((slide) => {
      slide.markers.forEach((marker, k) => { if (k || isBlank(normalized(marker.node.attrs))) removals.push(marker); });
      const first = slide.markers[0];
      if (first && !removals.includes(first) && first.pos !== slide.start) {
        removals.push(first);
        inserts.push({ pos: slide.start, node: first.node });
      }
    });
    if (before.length === after.length) {
      // Un repère d'avant que le texte d'après a gardé, à sa place ou à une autre (monter ou descendre une diapositive l'emporte avec elle), n'est pas perdu : la diapositive qui prend la
      // place de l'ancienne n'en reçoit pas de copie. Seul revient celui que plus rien ne porte (le contenu de sa diapositive effacé d'un coup).
      const pool = after.map(slide => slide.markers.filter(marker => !isBlank(normalized(marker.node.attrs))).map(marker => marker.node));
      const unmatched = [];
      before.forEach((slide, index) => {
        const marker = slide.markers[0];
        if (!marker || isBlank(normalized(marker.node.attrs))) return;
        const here = pool[index].findIndex(node => node.eq(marker.node));
        if (here >= 0) pool[index].splice(here, 1);
        else unmatched.push({ index, node: marker.node });
      });
      unmatched.forEach(({ index, node }) => {
        const holder = pool.find(list => list.some(other => other.eq(node)));
        if (holder) holder.splice(holder.findIndex(other => other.eq(node)), 1);
        else if (!after[index].markers.length) inserts.push({ pos: after[index].start, node });
      });
    }
    if (!removals.length && !inserts.length) return null;
    const tr = state.tr;
    removals.sort((a, b) => b.pos - a.pos).forEach(({ pos, node }) => tr.delete(pos, pos + node.nodeSize));
    inserts.sort((a, b) => b.pos - a.pos).forEach(({ pos, node }) => tr.insert(tr.mapping.map(pos, -1), node));
    return own(tr);
  }

  // Retour arrière au début du premier bloc de texte d'une diapositive dont le repère est juste devant : ProseMirror effacerait le repère (un bloc sans contenu avant le curseur). Il ôte
  // plutôt le saut de page qui précède le repère - ce que Retour arrière fait sans repère : les deux diapositives n'en font plus qu'une, et le rangement garde la transition de la
  // première. Au tout début du texte, rien ne se passe.
  function handleBackspace(view) {
    const { state } = view;
    const selection = state.selection;
    if (!selection.empty || !inPresentation()) return false;
    const $from = selection.$from;
    if ($from.depth !== 1 || $from.parentOffset !== 0 || !$from.parent.isTextblock) return false;
    const index = $from.index(0);
    if (index < 1 || !isMarker(state.doc.child(index - 1))) return false;
    const previous = index > 1 ? state.doc.child(index - 2) : null;
    if (previous && previous.type.name === 'pageBreak') {
      const at = $from.before(1) - state.doc.child(index - 1).nodeSize - previous.nodeSize;
      view.dispatch(state.tr.delete(at, at + previous.nodeSize).scrollIntoView());
    }
    return true;
  }

  // Un collage ne pose de repère que sur le texte d'une présentation, au niveau des diapositives : hors de là (un document, une colonne, un encadré, une case), il reste dehors.
  const hasMarker = (fragment) => { let found = false; fragment.descendants((node) => { if (isMarker(node)) found = true; return !found; }); return found; };
  function withoutMarkers(slice) {
    const Fragment = slice.content.constructor;
    const Slice = slice.constructor;
    const clean = (fragment) => {
      const kept = [];
      fragment.forEach((node) => { if (!isMarker(node)) kept.push(node.isLeaf ? node : node.copy(clean(node.content))); });
      return Fragment.fromArray(kept);
    };
    return new Slice(clean(slice.content), slice.openStart, slice.openEnd);
  }
  function transformPasted(slice) {
    if (!hasMarker(slice.content)) return slice;
    const editor = EditorCore.getEditor();
    const nested = !editor || editor.state.selection.$from.depth > 1;
    return inPresentation() && !nested ? slice : withoutMarkers(slice);
  }

  function createExtension(Extension, deps) {
    const { Plugin, PluginKey } = deps;
    return Extension.create({
      name: 'slidePropsGuard',
      addProseMirrorPlugins() {
        return [new Plugin({
          key: new PluginKey(NODE),
          props: {
            handleKeyDown(view, event) { return event.key === 'Backspace' && handleBackspace(view); },
            transformPasted,
          },
          appendTransaction(trs, oldState, newState) {
            if (!trs.some(tr => tr.docChanged)) return null;
            if (trs.some(tr => tr.getMeta(OWN_META) || tr.getMeta('preventUpdate') || tr.getMeta('history$') || LiveEntry.isRemote(tr))) return null;
            return inPresentation() ? tidyTransaction(trs, oldState, newState) : null;
          },
        })];
      },
    });
  }

  // Le HTML sans repère. Le HTML qui n'en a pas est rendu tel quel, sans être relu.
  function strip(html) {
    return rewrite(html, el => el.remove());
  }
  // Le HTML que reçoivent la Lecture et les exports : le repère s'en va, et le fond de sa diapositive devient, à sa place, le cadre qui le peint (FreeFrame.backgroundHtml : la page entière,
  // sans texte, avant les cadres libres de la diapositive, qui sont donc au-dessus de lui). Une diapositive sans fond n'a rien de plus.
  function forOutput(html) {
    return rewrite(html, (el) => {
      const bg = attrsOfEl(el).bg;
      if (bg) el.after(Dom.inertTemplate(FreeFrame.backgroundHtml(bg)).content);
      el.remove();
    });
  }
  function rewrite(html, each) {
    const text = String(html == null ? '' : html);
    if (text.indexOf(CLASS) === -1) return text;
    const body = HtmlSanitize.parseInert(text);
    const found = body.querySelectorAll('div.' + CLASS);
    if (!found.length) return text;
    found.forEach(each);
    return body.innerHTML;
  }

  return {
    NODE, CLASS, KINDS, SIDED, SIDES, DEFAULTS, DURATION, createNode, createExtension, normalized, isNone, hasBackground, isBlank, slidesOf, listOf, backgroundsOf,
    apply: applyTransition, applyTransition, applyBackground, strip, forOutput,
  };
})();
