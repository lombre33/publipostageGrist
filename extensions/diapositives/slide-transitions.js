// Les effets de transition d'une diapositive (extension « diapositives » de Grist Factory Suite ; demande du 21/10 à 18:35 : « transitions »). Ce fichier ne connaît ni le diaporama ni la
// fenêtre de réglage : il joue un effet entre DEUX calques qu'on lui donne (`play`) - au diaporama (extensions/diapositives/slide-show.js : le calque qui s'en va est une copie de celui
// qu'il montrait) comme dans l'aperçu de la fenêtre (slide-transitions-ui.js). Un calque est un élément posé sur toute la surface de son conteneur, qui en fixe la taille.
//  - Un EFFET se décrit pour le passage vers l'AVANT (`forward`) : la diapositive qui arrive (N) et celle qui s'en va (O) ont chacune une image de départ et d'arrivée (ou aucune : elle
//    reste en place), et l'une des deux passe devant. Fondu : N apparaît par-dessus O. Poussée : N entre d'un côté, O sort de l'autre. Balayage : N se découvre depuis un bord. Recouvrement :
//    N entre par-dessus O, qui ne bouge pas. Dévoilement : O s'en va et découvre N dessous. Zoom : N grandit depuis le centre en apparaissant. `from` dit le côté d'où N arrive (r, l, t, b) :
//    à l'écran, « vers la gauche » est `from: 'r'`.
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
      default:
        return null;
    }
  }
  const flip = part => (part ? { from: part.to, to: part.from } : null);
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
        if (part) animations.push(layer.animate([part.from, part.to], { duration, easing: EASING, fill: 'both' }));
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
