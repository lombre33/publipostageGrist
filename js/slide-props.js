// Les propriétés d'une diapositive : sa transition, son fond et ses notes (demandes du 21/10 à 18:35 : « transitions », puis le fond, quatrième fonction, puis les notes de l'intervenant ; cartes du
// 21/10 : les réglages se posent dans le menu ⋯ d'une miniature, extensions/diapositives/slide-transitions-ui.js, slide-background-ui.js et slide-notes-ui.js). Le socle garde ici ce qui doit tenir même sans le code de l'extension « diapositives » :
// le repère caché, ses garde-fous et ce que les sorties en voient ; l'effet lui-même se joue au diaporama (extensions/diapositives/slide-show.js, slide-transitions.js).
//  - Le REPÈRE : un bloc vide de hauteur nulle, rangé tout au début de sa diapositive (nœud `slideProps`, <div class="pp-slide-props"> dans le HTML enregistré), qui dit comment la
//    diapositive APPARAÎT quand on y arrive au diaporama : `transition` (fade, push, wipe, cover, uncover, zoom, split, blinds, circle, diamond, plus ; rien : aucune), `from` (le côté d'où elle arrive : r, l, t, b) et `dur`
//    (la durée, en millisecondes) ; si elle est MASQUÉE (`hidden` : le diaporama la saute, comme celui de PowerPoint ; elle reste dans la Lecture, le PDF, le Word) et le temps après lequel le diaporama
//    PASSE SEULE à la suivante (`advance`, en millisecondes ; rien : au clic) ; de quelle couleur est son FOND (`bg`, #rrggbb ; rien : pas de fond, le blanc de la page) ; et ses NOTES (`notes`, le texte que l'intervenant garde
//    sous les yeux : des retours à la ligne, NOTES_MAX caractères au plus ; rien : pas de notes). Une diapositive qui n'a rien de tout cela n'a pas de
//    repère : le texte d'une présentation qui n'en a jamais posé s'écrit comme avant. Il est dans la diapositive (entre ses deux sauts de page) : la déplacer, la dupliquer, la copier,
//    l'importer ou la supprimer emporte sa transition, son fond et ses notes sans que ces gestes le sachent.
//  - Le SIGNET (`anchorId`, `anchorName` ; `data-anchor`, `data-anchor-name`) : l'adresse d'un lien vers cette diapositive (`#slide-3`, js/anchors.js) et son nom dans la liste « Dans ce document ». Seul l'import d'un fichier
//    PowerPoint en pose, sur les diapositives que vise un lien (js/pptx-import.js). Un repère qui n'a qu'un signet n'est pas vide (isBlank). La Lecture le reçoit comme un bloc vide qui porte l'adresse
//    (forOutput, option `anchors`) ; le PDF, le Word et le HTML ne le voient pas encore, l'export PowerPoint en fait la cible des liens.
//  - Le FOND se dessine dans l'éditeur par le repère lui-même (css/free-frame.css : un pseudo-élément de la taille de la page, sous le texte, posé depuis le coin de la page comme un cadre
//    libre) ; les miniatures en copient le rendu. Il couvre la page où la diapositive s'ouvre (comme un cadre libre) : ce que la diapositive déborde sur une deuxième page reste blanc.
//    Les sorties le voient comme un cadre libre de la page entière, sans trait ni texte, rangé avant les autres (forOutput) : la Lecture, le diaporama et l'impression le peignent sous
//    le texte, le PDF au fond de sa page, le Word en forme « derrière le texte ».
//  - Les NOTES ne se voient nulle part ailleurs que dans leur fenêtre : le repère s'en va des sorties (forOutput, strip) avec leur texte, si bien que ni la Lecture, ni le diaporama, ni
//    l'impression, ni le PDF, ni le Word, ni le HTML, ni le Markdown, ni les e-mails ne les portent. Seul l'export PowerPoint (js/pptx-export.js) garde le repère (`keepProps` de
//    SlidesEntry.outputHtml) : ses notes y sont le volet « Notes » de la diapositive, sa transition celle de PowerPoint, son fond le fond de la diapositive. Elles suivent leur diapositive (la déplacer, la dupliquer, la copier, l'importer ou la
//    supprimer les emporte) et s'écrivent avec le modèle.
//  - Les GARDE-FOUS (createExtension) : un seul repère par diapositive, le premier, rangé avant les cadres libres (js/free-frame.js) ; une diapositive qui perd son repère avec son
//    texte (tout effacer dedans) le retrouve tant qu'aucune diapositive n'a été supprimée ni ajoutée et que le texte ne le porte plus nulle part (monter ou descendre une diapositive
//    l'emporte avec elle, sans en laisser de copie sur celle qui prend sa place) ; Retour arrière au début du texte d'une diapositive n'efface pas son repère (il
//    ôte le saut de page qui la précède, comme sans repère) ; deux diapositives réunies n'ont plus qu'un repère, le premier, qui reçoit aussi les notes de l'autre (une ligne vide entre
//    les deux : un texte écrit ne se perd pas) ; un repère collé hors d'une présentation, ou dans un bloc (colonne, encadré, case), n'entre pas. Le repère n'est jamais
//    sélectionné ni saisi à la souris.
//  - Les SORTIES : la Lecture, le PDF, le Word, le diaporama, les e-mails et les lots ne voient jamais le repère (forOutput, par js/slides-entry.js:outputHtml : il y devient le cadre du
//    fond, ou rien) ; le diaporama lit les transitions dans le texte de l'éditeur (listOf). L'export PowerPoint le lit tel qu'il est (`attrsOf`) et n'en fait aucun cadre.
// Les écritures de ce module (pose, rangement) ne sont pas des modifications à suivre (TrackChanges.skipTracking) et ne rejouent pas le rangement (OWN_META).
const SlideProps = (function () {
  const NODE = 'slideProps';
  const CLASS = 'pp-slide-props';
  const ANCHOR_CLASS = 'pp-slide-anchor';
  const OWN_META = 'ppSlideProps';
  // Les effets, dans l'ordre où la fenêtre les propose ; OPTIONS : ceux qui ont un choix à faire, avec les valeurs de `from` qu'ils offrent (le côté d'où la diapositive arrive pour une
  // poussée, un balayage, un recouvrement, un dévoilement ; l'ouverture d'une division ; le sens des lames d'un store) ; SIDED : leurs noms. Un `from` que l'effet n'offre pas devient son premier choix.
  const KINDS = ['fade', 'push', 'wipe', 'cover', 'uncover', 'zoom', 'split', 'blinds', 'circle', 'diamond', 'plus'];
  const OPTIONS = { push: ['r', 'l', 'b', 't'], wipe: ['r', 'l', 'b', 't'], cover: ['r', 'l', 'b', 't'], uncover: ['r', 'l', 'b', 't'], split: ['r', 'l', 'b', 't'], blinds: ['r', 'b'] };
  const SIDED = Object.keys(OPTIONS);
  const SIDES = ['r', 'l', 't', 'b'];
  const DEFAULTS = { transition: '', from: 'r', dur: 700, bg: '', notes: '', hidden: false, advance: 0, anchorId: '', anchorName: '' };
  const ADVANCE = { min: 100, max: 3600000, step: 100 };
  const NOTES_MAX = 10000;
  const NOTES_JOIN = '\n\n';        // ce qui sépare les notes de deux diapositives réunies
  const DURATION = { min: 100, max: 5000, step: 50 };
  const DOM_ATTRS = { transition: 'data-trans', from: 'data-trans-from', dur: 'data-trans-dur', bg: 'data-bg', notes: 'data-notes', hidden: 'data-hidden', advance: 'data-advance', anchorId: 'data-anchor', anchorName: 'data-anchor-name' };
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
  // Un texte de notes lisible : des retours à la ligne (jamais de \r), aucun caractère de contrôle, au plus NOTES_MAX caractères (sans couper une paire de substitution) ; des blancs seuls ne
  // sont pas des notes.
  const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
  function notesText(raw) {
    if (typeof raw !== 'string' || !raw) return '';
    let text = raw;
    if (text.indexOf('\r') !== -1) text = text.replace(/\r\n?/g, '\n');
    text = text.replace(CONTROL, '');
    if (text.length > NOTES_MAX) {
      const last = text.charCodeAt(NOTES_MAX - 1);
      text = text.slice(0, last >= 0xD800 && last <= 0xDBFF ? NOTES_MAX - 1 : NOTES_MAX);
    }
    return text.trim() ? text : '';
  }
  // Les attributs, bornés : une valeur absente ou illisible (HTML écrit à la main, version plus récente) retombe sur sa valeur par défaut, jamais sur une erreur.
  const flagOf = raw => raw === true || raw === 1 || raw === '1' || raw === 'true';
  // Le temps avant le passage seul : 0 (au clic) ou des millisecondes entre ADVANCE.min et ADVANCE.max, à ADVANCE.step près. Un temps positif plus court que le minimum (PowerPoint en écrit : 10 ms)
  // passe seul au bout du minimum, il ne devient pas « au clic » ; 0 reste « au clic » (le « 0 s » de PowerPoint, passer aussitôt, n'a pas d'équivalent).
  function advanceOf(raw) {
    const ms = Number(raw);
    if (raw === '' || raw === null || raw === undefined || !Number.isFinite(ms) || ms <= 0) return 0;
    return Math.round(Math.min(ADVANCE.max, Math.max(ADVANCE.min, ms)) / ADVANCE.step) * ADVANCE.step;
  }
  // Le signet de la diapositive (js/anchors.js : l'adresse d'un lien « Dans ce document » et le nom qu'elle a dans la liste) : celui d'un lien vers une diapositive d'un fichier PowerPoint. L'adresse
  // que le HTML sait écrire (HtmlSanitize.internalAnchorId), ou '' ; le nom, ramené sur une ligne de 80 signes au plus.
  const anchorIdOf = raw => (typeof raw === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(raw) ? raw : '');
  const anchorNameOf = raw => (typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, 80) : '');
  function normalized(raw) {
    const a = raw || {};
    const ms = Number(a.dur);
    const dur = Number.isFinite(ms) && a.dur !== '' && a.dur !== null ? Math.round(Math.min(DURATION.max, Math.max(DURATION.min, ms)) / DURATION.step) * DURATION.step : DEFAULTS.dur;
    const transition = KINDS.includes(a.transition) ? a.transition : '';
    const from = SIDES.includes(a.from) ? a.from : DEFAULTS.from;
    return {
      transition,
      from: OPTIONS[transition] && !OPTIONS[transition].includes(from) ? OPTIONS[transition][0] : from,
      dur,
      bg: colorOf(a.bg),
      notes: notesText(a.notes),
      hidden: flagOf(a.hidden),
      advance: advanceOf(a.advance),
      anchorId: anchorIdOf(a.anchorId),
      anchorName: anchorNameOf(a.anchorName),
    };
  }
  // Sans effet : une transition « aucune ». Sans rien du tout (ni effet, ni fond, ni notes) : un repère qui n'a plus de raison d'être.
  const isNone = a => !a || !a.transition;
  const hasBackground = a => !!a && !!a.bg;
  const hasNotes = a => !!a && !!a.notes;
  const isBlank = a => isNone(a) && !hasBackground(a) && !hasNotes(a) && !a.hidden && !a.advance && !a.anchorId;
  const same = (a, b) => a.transition === b.transition && a.from === b.from && a.dur === b.dur && a.bg === b.bg && a.notes === b.notes && !!a.hidden === !!b.hidden && (a.advance || 0) === (b.advance || 0) && (a.anchorId || '') === (b.anchorId || '') && (a.anchorName || '') === (b.anchorName || '');
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
  // Le <div> que l'éditeur écrit pour le repère : rien de visible hors le fond. Les attributs d'un effet ne s'écrivent que s'il y a un effet, celui du fond que s'il y a un fond, celui des
  // notes que s'il y en a : un repère de transition s'écrit comme avant, un repère « fond seul » ne porte que sa couleur, un repère « notes seules » que son texte.
  function domAttrs(a) {
    const out = { class: CLASS, contenteditable: 'false', 'aria-hidden': 'true', style: a.bg ? STYLE_BG + ';--pp-slide-bg:' + a.bg : STYLE };
    const written = { bg: a.bg, notes: a.notes, hidden: a.hidden, advance: a.advance, anchorId: a.anchorId, anchorName: a.anchorId ? a.anchorName : '' };
    Object.keys(DOM_ATTRS).forEach((key) => {
      if (key in written ? written[key] : a.transition) out[DOM_ATTRS[key]] = key === 'hidden' ? '1' : String(a[key]);
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
  // Le passage de chaque diapositive de `doc`, dans l'ordre : { hidden, advance } (masquée ; millisecondes avant le passage seul, 0 : au clic), sans repère : { hidden: false, advance: 0 }.
  const timingsOf = doc => slidesOf(doc).map((slide) => { const a = attrsOfSlide(slide); return { hidden: !!a && a.hidden, advance: a ? a.advance : 0 }; });
  // L'adresse du signet de chaque diapositive de `doc`, dans l'ordre : `slide-3`, ou '' quand elle n'en a pas (le diaporama y mène un lien vers elle).
  const anchorsOf = doc => slidesOf(doc).map((slide) => { const a = attrsOfSlide(slide); return a ? a.anchorId : ''; });
  // Les notes de chaque diapositive de `doc`, dans l'ordre : le texte, ou '' quand elle n'en a pas.
  const notesOf = doc => slidesOf(doc).map((slide) => { const a = attrsOfSlide(slide); return a ? a.notes : ''; });

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
  // Pose la transition `spec` ({ transition, from, dur, advance } ; sans effet : aucune ; `advance` : le passage seul, 0 : au clic, absent : celui de la diapositive reste) : le fond, les notes et le masquage que la diapositive a déjà restent.
  function applyTransition(ed, indexes, spec) {
    const next = normalized(spec);
    const timed = !!spec && 'advance' in spec;
    return applyTo(ed, indexes, current => Object.assign({}, current, { transition: next.transition, from: next.from, dur: next.dur }, timed ? { advance: next.advance } : {}));
  }
  // Masque (`on`) ou montre les diapositives `indexes` au diaporama : le reste de leur repère reste.
  function applyHidden(ed, indexes, on) {
    return applyTo(ed, indexes, current => Object.assign({}, current, { hidden: !!on }));
  }
  // Pose le fond `color` (#rrggbb ; '' : aucun) : la transition que la diapositive a déjà reste.
  function applyBackground(ed, indexes, color) {
    const bg = colorOf(color);
    return applyTo(ed, indexes, current => Object.assign({}, current, { bg }));
  }

  // Pose les notes `text` (retours à la ligne gardés ; vide : aucune) : la transition et le fond que la diapositive a déjà restent.
  function applyNotes(ed, indexes, text) {
    const notes = notesText(text);
    return applyTo(ed, indexes, current => Object.assign({}, current, { notes }));
  }

  // Le HTML du repère d'une diapositive tel que l'éditeur l'écrit (domAttrs), pour ce qui compose le texte d'une présentation d'un coup : l'import PowerPoint (js/pptx-import.js). Une diapositive qui
  // n'a rien à dire (isBlank) n'a pas de repère : le texte est vide.
  function html(raw) {
    const a = normalized(raw);
    if (isBlank(a)) return '';
    const attrs = domAttrs(settled(a));
    return '<div' + Object.keys(attrs).map(name => ' ' + name + '="' + String(attrs[name]).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/\n/g, '&#10;') + '"').join('') + '></div>';
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
  // Le rangement, après une transaction de la personne : un repère par diapositive (le premier), au tout début d'elle, et seulement s'il dit un effet, un fond ou des notes ; une diapositive qui vient
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
    const updates = [];    // { pos, node } : le premier repère d'une diapositive réunie à une autre, avec les notes des repères qui partent en plus des siennes
    after.forEach((slide) => {
      slide.markers.forEach((marker, k) => { if (k || isBlank(normalized(marker.node.attrs))) removals.push(marker); });
      const first = slide.markers[0];
      // Deux diapositives réunies (Retour arrière, une sélection effacée) n'ont plus qu'un repère, le premier : les notes de ceux qui partent s'ajoutent aux siennes, elles ne se perdent pas.
      const spare = slide.markers.slice(1).map(marker => normalized(marker.node.attrs).notes).filter(Boolean);
      let node = first ? first.node : null;
      if (first && spare.length) {
        const kept = normalized(first.node.attrs).notes;
        const joined = notesText([kept].concat(spare).filter(Boolean).join(NOTES_JOIN));
        if (joined !== kept) node = first.node.type.create(Object.assign({}, first.node.attrs, { notes: joined }));
      }
      if (first && !removals.includes(first) && first.pos !== slide.start) {
        removals.push(first);
        inserts.push({ pos: slide.start, node });
      } else if (first && !removals.includes(first) && node !== first.node) {
        updates.push({ pos: first.pos, node });
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
    if (!removals.length && !inserts.length && !updates.length) return null;
    const tr = state.tr;
    updates.forEach(({ pos, node }) => tr.setNodeMarkup(pos, undefined, node.attrs));
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
  // sans texte, avant les cadres libres de la diapositive, qui sont donc au-dessus de lui). Une diapositive sans fond n'a rien de plus. `anchors` : la diapositive qui est la cible d'un lien
  // (son signet, js/anchors.js) y laisse un bloc vide de hauteur nulle qui porte son adresse (`data-anchor`), que la Lecture amène en haut de la zone qui défile.
  function forOutput(html, { anchors = false } = {}) {
    return rewrite(html, (el) => {
      const a = attrsOfEl(el);
      if (a.bg) el.after(Dom.inertTemplate(FreeFrame.backgroundHtml(a.bg)).content);
      if (anchors && a.anchorId) el.after(Dom.inertTemplate(anchorHtml(a)).content);
      el.remove();
    });
  }
  const escapeAttr = text => String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  // Le bloc qui porte l'adresse d'une diapositive dans la Lecture : rien de visible, aucune place.
  function anchorHtml(a) {
    return '<div class="' + ANCHOR_CLASS + '" data-anchor="' + escapeAttr(a.anchorId) + '"' + (a.anchorName ? ' data-anchor-name="' + escapeAttr(a.anchorName) + '"' : '') + ' aria-hidden="true" style="' + STYLE + '"></div>';
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
    NODE, CLASS, KINDS, OPTIONS, SIDED, SIDES, DEFAULTS, DURATION, NOTES_MAX, createNode, createExtension, normalized, attrsOf: attrsOfEl, isNone, hasBackground, hasNotes, isBlank, slidesOf, listOf, backgroundsOf, timingsOf, notesOf, anchorsOf,
    apply: applyTransition, applyTransition, applyHidden, ADVANCE, applyBackground, applyNotes, strip, forOutput, html,
  };
})();
