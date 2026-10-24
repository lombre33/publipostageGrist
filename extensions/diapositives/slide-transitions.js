// Les effets de transition d'une diapositive (extension « diapositives » de Grist Factory Suite ; demande du 21/10 à 18:35 : « transitions »). Ce fichier ne connaît ni le diaporama ni la
// fenêtre de réglage : il joue un effet entre DEUX calques qu'on lui donne (`play`) - au diaporama (extensions/diapositives/slide-show.js : le calque qui s'en va est une copie de celui
// qu'il montrait) comme dans l'aperçu de la fenêtre (slide-transitions-ui.js). Un calque est un élément posé sur toute la surface de son conteneur, qui en fixe la taille.
//  - Un EFFET se décrit pour le passage vers l'AVANT (`forward`) : la diapositive qui arrive (N) et celle qui s'en va (O) ont chacune une image de départ et d'arrivée (ou aucune : elle
//    reste en place), et l'une des deux passe devant. Fondu : N apparaît par-dessus O. Poussée : N entre d'un côté, O sort de l'autre. Balayage : N se découvre depuis un bord. Recouvrement :
//    N entre par-dessus O, qui ne bouge pas. Dévoilement : O s'en va et découvre N dessous. Zoom : N grandit depuis le centre en apparaissant. `from` dit le côté d'où N arrive (r, l, t, b) :
//    à l'écran, « vers la gauche » est `from: 'r'`. Les effets à FORMES (demande du 23/10 : « autres transitions ») découvrent N par une découpe (`clip-path`) qui grandit : Division (une ligne au
//    centre qui s'ouvre, ou deux bords qui se rejoignent ; `from` : r vertical vers l'extérieur, l vertical vers l'intérieur, b horizontal vers l'extérieur, t horizontal vers l'intérieur), Stores
//    (des lames qui s'ouvrent ; `from` : r lames horizontales, b lames verticales), Cercle, Losange et Croix (une forme qui grandit du centre). Une découpe est un polygone au même nombre de
//    sommets du début à la fin : le navigateur passe de l'un à l'autre en ligne droite (Croix : trois images, pour que les bras s'allongent avant de s'épaissir).
//  - Le retour EN ARRIÈRE rejoue la transition de la diapositive qu'on quitte à l'envers : les rôles s'échangent (la diapositive qu'on quitte joue ce que N joue, celle où l'on revient ce que O
//    joue), chaque image va de l'arrivée au départ, et celle qui jouait N reste devant.
//  - Les animations sont celles du navigateur (Element.animate : `translate`, `scale`, `opacity`, `clip-path`, sur le compositeur) ; rien ne s'écrit dans le document. `finish` saute à
//    l'image d'arrivée et rend les calques à leur état naturel ; `prefers-reduced-motion` ramène tout effet à un fondu d'au plus 300 ms.
const SlideTransitions = (function () {
  const EASING = 'cubic-bezier(0.4, 0, 0.2, 1)';
  const REDUCED_MS = 300;
  const AT_REST = '0% 0%';
  // Du centre vers le côté d'où la diapositive arrive.
  const TOWARD = { r: [1, 0], l: [-1, 0], t: [0, -1], b: [0, 1] };
  // Le balayage : ce qui est caché au départ, selon le bord d'où il part (inset : haut, droite, bas, gauche).
  const HIDDEN = { r: 'inset(0% 0% 0% 100%)', l: 'inset(0% 100% 0% 0%)', t: 'inset(0% 0% 100% 0%)', b: 'inset(100% 0% 0% 0%)' };
  const SHOWN = 'inset(0% 0% 0% 0%)';

  // Les découpes à formes. Les nombres sont des pourcentages de la diapositive.
  const pct = n => (Math.round(n * 100) / 100) + '%';
  const polygon = points => 'polygon(' + points.map(point => pct(point[0]) + ' ' + pct(point[1])).join(', ') + ')';
  const FULL = 'inset(0% 0% 0% 0%)';
  const SLATS = 8;
  // Des lames qui grandissent de `t` (0 : fermées, 1 : jointes) : un seul polygone, qui longe le bord de départ entre deux lames (une arête sans épaisseur).
  function slats(t, vertical) {
    const points = [];
    for (let i = 0; i < SLATS; i += 1) {
      const a = (i * 100) / SLATS;
      const b = a + (t * 100) / SLATS;
      points.push(vertical ? [a, 0] : [0, a], vertical ? [a, 100] : [100, a], vertical ? [b, 100] : [100, b], vertical ? [b, 0] : [0, b]);
    }
    return polygon(points);
  }
  // Deux bords qui avancent de `w` chacun vers le centre (division « vers l'intérieur »).
  function edges(w, vertical) {
    return polygon(vertical
      ? [[0, 0], [w, 0], [w, 100], [100 - w, 100], [100 - w, 0], [100, 0], [100, 100], [0, 100]]
      : [[0, 0], [0, w], [100, w], [100, 100 - w], [0, 100 - w], [0, 100], [100, 100], [100, 0]]);
  }
  // Une croix de demi-longueur `length` et de demi-épaisseur `half`, centrée.
  const cross = (length, half) => polygon([
    [50 - half, 50 - length], [50 + half, 50 - length], [50 + half, 50 - half], [50 + length, 50 - half], [50 + length, 50 + half], [50 + half, 50 + half],
    [50 + half, 50 + length], [50 - half, 50 + length], [50 - half, 50 + half], [50 - length, 50 + half], [50 - length, 50 - half], [50 - half, 50 - half],
  ]);
  const shape = (...frames) => ({ incoming: { frames: frames.map(([clipPath, at]) => (at === undefined ? { clipPath } : { clipPath, offset: at })) }, outgoing: null, above: 'incoming' });

  const offset = (side, sign) => { const v = TOWARD[side] || TOWARD.r; return (sign * v[0] * 100) + '% ' + (sign * v[1] * 100) + '%'; };
  // L'effet `kind` vers l'avant : { incoming, outgoing, above } - `incoming` et `outgoing` : { from, to } (propriétés de l'animation) ou null, `above` : 'incoming' ou 'outgoing'.
  function forward(kind, side) {
    switch (kind) {
      case 'fade':
        return { incoming: { from: { opacity: 0 }, to: { opacity: 1 } }, outgoing: null, above: 'incoming' };
      case 'push':
        return { incoming: { from: { translate: offset(side, 1) }, to: { translate: AT_REST } }, outgoing: { from: { translate: AT_REST }, to: { translate: offset(side, -1) } }, above: 'incoming' };
      case 'cover':
        return { incoming: { from: { translate: offset(side, 1) }, to: { translate: AT_REST } }, outgoing: null, above: 'incoming' };
      case 'uncover':
        return { incoming: null, outgoing: { from: { translate: AT_REST }, to: { translate: offset(side, -1) } }, above: 'outgoing' };
      case 'wipe':
        return { incoming: { from: { clipPath: HIDDEN[side] || HIDDEN.r }, to: { clipPath: SHOWN } }, outgoing: null, above: 'incoming' };
      case 'zoom':
        return { incoming: { from: { opacity: 0, scale: 0.5 }, to: { opacity: 1, scale: 1 } }, outgoing: null, above: 'incoming' };
      case 'split':
        if (side === 'r') return shape(['inset(0% 50% 0% 50%)'], [FULL]);
        if (side === 'b') return shape(['inset(50% 0% 50% 0%)'], [FULL]);
        return shape([edges(0, side === 'l')], [edges(50, side === 'l')]);
      case 'blinds':
        return shape([slats(0, side === 'b')], [slats(1, side === 'b')]);
      case 'circle':
        return shape(['circle(0% at 50% 50%)'], ['circle(72% at 50% 50%)']);
      case 'diamond':
        return shape([polygon([[50, 50], [50, 50], [50, 50], [50, 50]])], [polygon([[50, -55], [155, 50], [50, 155], [-55, 50]])]);
      case 'plus':
        return shape([cross(0, 0), 0], [cross(50, 8), 0.5], [cross(50, 50), 1]);
      default:
        return null;
    }
  }
  // Les images d'une animation, dans l'ordre : `frames` (avec leur `offset` quand elles en ont un) ou le départ et l'arrivée.
  const framesOf = part => part.frames || [part.from, part.to];
  // L'animation à l'envers : les images en sens inverse, et leurs `offset` avec elles.
  const flip = part => (part ? (part.frames
    ? { frames: part.frames.slice().reverse().map(frame => (frame.offset === undefined ? frame : Object.assign({}, frame, { offset: 1 - frame.offset }))) }
    : { from: part.to, to: part.from }) : null);
  // Ce que joue chaque calque : { old, new, above } (`old` : celui qu'on quitte, `new` : celui où l'on arrive ; `above` : 'old' ou 'new'). En arrière, les rôles s'échangent.
  function plan(kind, side, reverse) {
    const effect = forward(kind, side);
    if (!effect) return null;
    if (!reverse) return { old: effect.outgoing, new: effect.incoming, above: effect.above === 'incoming' ? 'new' : 'old' };
    return { old: flip(effect.incoming), new: flip(effect.outgoing), above: effect.above === 'incoming' ? 'old' : 'new' };
  }

  const prefersReducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // La pile : les deux calques sont posés l'un sur l'autre dans le même conteneur, et le dernier est devant. Pour faire passer `top` devant `under`, on range `under` avant lui le temps de
  // l'effet (aucun z-index à poser : le calque d'un diaporama n'est pas une couche flottante) ; la fonction rendue remet l'ordre d'avant.
  function stack(top, under) {
    const parent = top.parentNode;
    if (!parent || under.parentNode !== parent || !(under.compareDocumentPosition(top) & Node.DOCUMENT_POSITION_PRECEDING)) return () => {};
    const after = under.nextSibling;
    parent.insertBefore(under, top);
    return () => { if (under.parentNode === parent) parent.insertBefore(under, after && after.parentNode === parent ? after : null); };
  }

  // Joue la transition `spec` ({ transition, from, dur }) du calque `oldLayer` (celui qu'on quitte) vers `newLayer` (celui où l'on arrive). `options.reverse` : le retour en arrière ;
  // `options.reduced` : force (vrai) ou lève (faux) le mouvement réduit, que le système dit sinon. Rend { kind, side, duration, reverse, finish(), cancel(), done } ; `done` se tient dès que
  // les calques ont retrouvé leur état naturel, qu'elle soit allée au bout, qu'on l'ait terminée ou annulée. Un effet inconnu ne joue rien.
  function play(oldLayer, newLayer, spec, options) {
    const a = SlideProps.normalized(spec);
    const reverse = !!(options && options.reverse);
    const reduced = options && options.reduced !== undefined ? !!options.reduced : prefersReducedMotion();
    const kind = reduced && a.transition ? 'fade' : a.transition;
    const duration = reduced ? Math.min(a.dur, REDUCED_MS) : a.dur;
    const steps = plan(kind, a.from, reverse);
    const animations = [];
    let unstack = () => {};
    if (steps && typeof newLayer.animate === 'function') {
      unstack = steps.above === 'old' ? stack(oldLayer, newLayer) : stack(newLayer, oldLayer);
      [[oldLayer, steps.old], [newLayer, steps.new]].forEach(([layer, part]) => {
        if (part) animations.push(layer.animate(framesOf(part), { duration, easing: EASING, fill: 'both' }));
      });
    }
    let ended = false;
    let settle = () => {};
    const done = new Promise((resolve) => { settle = resolve; });
    // Les calques retrouvent leur état naturel : plus d'animation en cours ni de pile imposée.
    function release() {
      if (ended) return;
      ended = true;
      animations.forEach((animation) => { try { animation.cancel(); } catch (e) { /* déjà annulée */ } });
      unstack();
      settle();
    }
    if (animations.length) Promise.all(animations.map(animation => animation.finished)).then(release, release);
    else release();
    return {
      kind, side: a.from, duration, reverse, animations, done,
      // Saute à l'image d'arrivée : le calque qui arrive est tel qu'il sera, la suite peut commencer.
      finish() { animations.forEach((animation) => { try { animation.finish(); } catch (e) { /* déjà finie */ } }); release(); },
      cancel: release,
    };
  }

  return { EASING, REDUCED_MS, plan, play, prefersReducedMotion };
})();
