// L'ANIMATION d'un objet de diapositive (chantier 8c de l'import PowerPoint : « animations d'objets » ; un cadre, une forme ou une ligne libre, js/free-frame.js). Le socle garde ici ce qui
// doit tenir sans l'extension « diapositives » : le réglage et son texte dans le HTML (`data-ff-anim`), la suite des pas d'une diapositive et les mouvements que jouent le diaporama
// (extensions/diapositives/slide-show.js) et l'aperçu de la fenêtre « Animation… » (extensions/diapositives/frame-anim-ui.js). Rien ne bouge dans l'éditeur, la Lecture, le PDF, le Word ni
// l'impression : un objet y est à sa place, dans son état final.
//  - Le RÉGLAGE : un effet (`appear` apparition, `fade` fondu, `fly` entrée par un côté, `wipe` balayage depuis un côté, `zoom`), son côté d'où ça vient (`l` `r` `t` `b` ; pour les deux effets
//    qui en ont un), s'il s'agit d'une ENTRÉE (par défaut) ou d'une SORTIE (`out`), son DÉPART (`click` : au clic, par défaut ; `with` : avec la précédente ; `after` : après la précédente),
//    sa durée et son délai en millisecondes, et sa place dans l'ordre (`n`, 0 : la place de l'objet dans le texte). Le texte : « fly:l out with d500 w200 n3 » ; vide : pas d'animation.
//    Un objet n'a qu'UNE animation (un fichier PowerPoint qui en met plusieurs sur le même objet garde la première ; les autres sont comptées au compte rendu de l'import).
//  - Les PAS (stepsOf) : la suite des animations d'une diapositive, rangée par place (ceux qui ont un `n`, dans l'ordre de `n`, puis les autres dans l'ordre du texte), est coupée à chaque
//    animation « au clic » : le pas 0 est celui qui part tout seul à l'arrivée sur la diapositive (les animations « avec » ou « après » placées avant le premier clic), puis un pas par clic.
//    Dans un pas, « avec la précédente » part en même temps que la précédente, « après la précédente » quand celle-ci a fini (son délai et sa durée comptés) ; le délai de l'animation
//    s'ajoute à ce départ.
//  - Les MOUVEMENTS (keyframes, play) : ils s'animent sur la boîte de l'objet par ses propriétés propres (translate, scale, opacity, un masque), jamais par `transform`, que sa rotation occupe.
const FrameAnim = (function () {
  const EFFECTS = ['appear', 'fade', 'fly', 'wipe', 'zoom'];
  const SIDED = ['fly', 'wipe'];
  const SIDES = ['l', 'r', 't', 'b'];
  const SIDE_DEFAULT = 'b';
  const STARTS = ['click', 'with', 'after'];
  const DURATION = { min: 100, max: 10000, def: 500 };
  const DELAY = { max: 10000 };
  const ORDER_MAX = 99;
  const ATTR = 'data-ff-anim';
  const SLIDE_ATTR = 'data-ff-slide';
  const FRAME = '.pp-free-frame';
  const BREAK = '.page-break-marker';

  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const whole = (raw, fallback) => { const n = Math.round(Number(raw)); return Number.isFinite(n) ? n : fallback; };
  // Le réglage `raw` (un objet, ou son texte) ramené à ses valeurs permises ; null quand il n'y a pas d'effet connu.
  function normalized(raw) {
    const a = typeof raw === 'string' ? parse(raw) : (raw || {});
    if (!a || !EFFECTS.includes(a.effect)) return null;
    return {
      effect: a.effect,
      side: SIDED.includes(a.effect) ? (SIDES.includes(a.side) ? a.side : SIDE_DEFAULT) : '',
      exit: !!a.exit,
      start: STARTS.includes(a.start) ? a.start : 'click',
      dur: a.effect === 'appear' ? 0 : clamp(whole(a.dur, DURATION.def), DURATION.min, DURATION.max),
      delay: clamp(whole(a.delay, 0), 0, DELAY.max),
      order: clamp(whole(a.order, 0), 0, ORDER_MAX),
    };
  }
  // Le texte d'un réglage, tel que le HTML le garde : '' quand il n'y a pas d'animation.
  function text(raw) {
    const a = normalized(raw);
    if (!a) return '';
    const parts = [a.effect + (a.side ? ':' + a.side : '')];
    if (a.exit) parts.push('out');
    if (a.start !== 'click') parts.push(a.start);
    if (a.effect !== 'appear' && a.dur !== DURATION.def) parts.push('d' + a.dur);
    if (a.delay) parts.push('w' + a.delay);
    if (a.order) parts.push('n' + a.order);
    return parts.join(' ');
  }
  // Un texte lu : { effect, side, exit, start, dur, delay, order } (les valeurs sont bornées par `normalized`), ou null.
  function parse(raw) {
    const words = String(raw == null ? '' : raw).trim().split(/\s+/).filter(Boolean);
    if (!words.length) return null;
    const [effect, side] = words[0].split(':');
    if (!EFFECTS.includes(effect)) return null;
    const out = { effect, side: side || '', exit: false, start: 'click', dur: DURATION.def, delay: 0, order: 0 };
    words.slice(1).forEach((word) => {
      if (word === 'out') out.exit = true;
      else if (STARTS.includes(word)) out.start = word;
      else if (/^d\d+$/.test(word)) out.dur = Number(word.slice(1));
      else if (/^w\d+$/.test(word)) out.delay = Number(word.slice(1));
      else if (/^n\d+$/.test(word)) out.order = Number(word.slice(1));
    });
    return out;
  }
  const same = (a, b) => text(a) === text(b);

  // La suite des animations `list` ([{ anim }] dans l'ordre du texte) en PAS : { steps: [[{ index, begin, anim }]] }, `index` étant le rang dans `list` ; `begin`, le départ en millisecondes
  // depuis celui du pas, le délai compris. Le pas 0 est celui qui part seul (vide quand la diapositive commence par un clic).
  function stepsOf(list) {
    const ranked = list.map((item, index) => ({ index, anim: normalized(item.anim) })).filter(item => item.anim)
      .sort((a, b) => ((a.anim.order || 1000 + a.index) - (b.anim.order || 1000 + b.index)) || a.index - b.index);
    const steps = [[]];
    let base = 0;
    let end = 0;
    ranked.forEach((item) => {
      const a = item.anim;
      if (a.start === 'click') { steps.push([]); base = 0; } else if (a.start === 'after') base = end;
      const begin = base + a.delay;
      steps[steps.length - 1].push({ index: item.index, begin, anim: a });
      end = begin + a.dur;
    });
    return { steps };
  }

  const prefersReducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MASK = 'linear-gradient(#000, #000)';
  const WIPE = {
    l: { pos: 'left top', from: '0% 100%', to: '100% 100%' },
    r: { pos: 'right top', from: '0% 100%', to: '100% 100%' },
    t: { pos: 'left top', from: '100% 0%', to: '100% 100%' },
    b: { pos: 'left bottom', from: '100% 0%', to: '100% 100%' },
  };
  // Les images clés d'une ENTRÉE (une sortie les joue à l'envers). `page` : { width, height } de la page en pixels, pour que « entrée par un côté » parte du bord.
  function keyframes(a, page) {
    switch (a.effect) {
      case 'fade': return [{ opacity: 0 }, { opacity: 1 }];
      case 'zoom': return [{ scale: '0', opacity: 0 }, { scale: '1', opacity: 1 }];
      case 'fly': {
        const w = (page && page.width) || 1000;
        const h = (page && page.height) || 1000;
        const from = { l: [-w, 0], r: [w, 0], t: [0, -h], b: [0, h] }[a.side];
        return [{ translate: from[0] + 'px ' + from[1] + 'px' }, { translate: '0px 0px' }];
      }
      case 'wipe': {
        const w = WIPE[a.side];
        return [{ maskImage: MASK, maskRepeat: 'no-repeat', maskPosition: w.pos, maskSize: w.from }, { maskImage: MASK, maskRepeat: 'no-repeat', maskPosition: w.pos, maskSize: w.to }];
      }
      default: return [{ opacity: 0 }, { opacity: 0 }];
    }
  }
  // Joue l'animation `a` sur la boîte `box` : une entrée montre la boîte (au départ, avant son délai, elle tient sa première image), une sortie la cache à la fin. `begin` : le départ, en
  // millisecondes, depuis maintenant. Rend { animation, finished } : `finished` se tient quand tout est fini ; `cancel` rend la boîte à son état naturel (visible).
  function play(box, a, options) {
    const o = options || {};
    const begin = Math.max(0, o.begin || 0);
    const quick = prefersReducedMotion() || typeof box.animate !== 'function';
    const frames = keyframes(a, o.page);
    if (a.exit) frames.reverse();
    if (!a.exit) box.style.visibility = '';
    if (quick) {
      const settle = () => { if (a.exit) box.style.visibility = 'hidden'; };
      if (!begin) { settle(); return { animation: null, finished: Promise.resolve(), cancel() {} }; }
      const timer = setTimeout(settle, begin);
      return { animation: null, finished: new Promise(done => setTimeout(done, begin)), cancel() { clearTimeout(timer); } };
    }
    const animation = box.animate(frames, { duration: Math.max(1, a.dur), delay: begin, fill: a.exit ? 'forwards' : 'backwards', easing: a.effect === 'fly' ? 'ease-out' : 'ease-in-out' });
    const finished = animation.finished.then(() => {
      if (a.exit) box.style.visibility = 'hidden';
      animation.cancel();
    }, () => {});
    return { animation, finished, cancel() { animation.cancel(); } };
  }

  // Le HTML d'une présentation avec, sur chaque objet animé, le rang de sa diapositive (`data-ff-slide` : les sauts de page qui le précèdent) : le diaporama, qui ne voit que le HTML mis en
  // page, y retrouve la diapositive de chaque objet. Sans animation dans le HTML, il est rendu tel quel, sans être relu.
  function stampSlides(html) {
    const raw = String(html == null ? '' : html);
    if (raw.indexOf(ATTR) === -1) return raw;
    const body = HtmlSanitize.parseInert(raw);
    let slide = 0;
    body.querySelectorAll(BREAK + ', ' + FRAME + '[' + ATTR + ']').forEach((node) => {
      if (node.matches(BREAK)) slide += 1; else node.setAttribute(SLIDE_ATTR, String(slide));
    });
    return body.innerHTML;
  }
  // Les objets animés de la mise en page `root`, par diapositive : Map(rang de la diapositive -> [{ box, anim }]) dans l'ordre du texte.
  function framesOf(root) {
    const found = new Map();
    root.querySelectorAll(FRAME + '[' + ATTR + '][' + SLIDE_ATTR + ']').forEach((frame) => {
      const anim = normalized(frame.getAttribute(ATTR));
      const box = frame.querySelector(':scope > .pp-free-frame-box');
      if (!anim || !box) return;
      const slide = Number(frame.getAttribute(SLIDE_ATTR));
      if (!found.has(slide)) found.set(slide, []);
      found.get(slide).push({ box, anim });
    });
    return found;
  }

  return { EFFECTS, SIDED, SIDES, STARTS, DURATION, DELAY, ORDER_MAX, ATTR, SLIDE_ATTR, normalized, text, parse, same, stepsOf, keyframes, play, stampSlides, framesOf };
})();
