// Les formes PRÉDÉFINIES de PowerPoint, calculées d'après la norme (chantier 4 « Plus de formes » du plan « Import PowerPoint : ce qui se perd encore ») : js/shape-presets-data.js en donne les
// définitions (ECMA-376, partie 1 : presetShapeDefinitions.xml), ce module les calcule pour une boîte de `w` sur `h` points comme PowerPoint le fait : ses guides (des formules sur la taille de la
// boîte et sur ses réglages, les poignées jaunes de PowerPoint), ses chemins (le fond, les faces éclaircies ou assombries, le trait) et le rectangle de son texte. Il ne touche à aucun élément de la
// page : js/shape-geometry.js en tire le dessin de l'éditeur, de la Lecture et du PDF ; le Word et le PowerPoint reçoivent le nom de la forme, qu'ils dessinent eux-mêmes.
//  - Les mesures sont en points depuis le coin haut gauche de la boîte de la forme, celle de PowerPoint : le trait y est à cheval sur le contour.
//  - Un arc (`arcTo`) part du point courant ; ses angles sont ceux que l'on VOIT depuis le centre de l'ellipse (la norme), ramenés à l'angle qui construit le point (x = rx cos t, y = ry sin t)
//    dans le même tour. Il est écrit en courbes de Bézier d'au plus un quart de tour (l'écart au vrai arc est sous trois dix-millièmes de son rayon), comme les courbes du second degré : le SVG,
//    le PDF et la mesure de l'encre lisent les mêmes courbes.
//  - Une forme inconnue n'a aucun chemin, et un calcul impossible (une division par zéro d'une boîte sans largeur) vaut 0 : jamais une erreur.
const ShapePresets = (function () {
  const DATA = typeof SHAPE_PRESET_DATA === 'object' && SHAPE_PRESET_DATA ? SHAPE_PRESET_DATA : {};
  const NAMES = Object.keys(DATA);
  const DEG = Math.PI / 180 / 60000;   // un angle de DrawingML : des 60 000es de degré, dans le sens des aiguilles d'une montre depuis l'axe des x
  const QUARTER = Math.PI / 2;
  const TOLERANCE_PT = 0.12;           // l'écart permis entre une courbe et les côtés qui la suivent, quand on la mesure (l'encre d'une forme)
  const MAX_STEPS = 96;                // au plus tant de côtés par courbe, quelle que soit sa taille
  const ADJ_LIMIT = 2147483647;        // un réglage est un entier de 32 bits
  const MITER_LIMIT = 8;               // un coin en onglet tant que sa pointe ne dépasse pas huit fois l'épaisseur du trait (le thème d'Office : <a:miter lim="800000"/>)
  const FIT_PT = 0.005;                // l'écart permis entre ce que la forme couvre et son cadre
  // Les faces éclaircies ou assombries (`fill` d'un chemin : le cube, le cylindre, le biseau...) : la part de blanc ajoutée, ou de couleur retirée (mesurées sur le rendu de LibreOffice).
  const SHADES = { lighten: 0.4, lightenLess: 0.2, darken: -0.4, darkenLess: -0.2 };
  const FILLS = { f0: '', fL: 'lighten', fl: 'lightenLess', fD: 'darken', fd: 'darkenLess' };
  const has = name => typeof name === 'string' && Object.prototype.hasOwnProperty.call(DATA, name);
  const round = (value, places) => { const k = Math.pow(10, places == null ? 2 : places); return Math.round(value * k) / k; };

  // Les réglages d'une forme et leur valeur d'origine : { adj1: 25000, ... } (vide pour une forme qui n'en a pas).
  function adjDefaults(name) {
    const out = {};
    const parts = has(name) && DATA[name].a ? DATA[name].a.split(' ') : [];
    for (let i = 0; i < parts.length; i += 2) out[parts[i]] = Number(parts[i + 1]);
    return out;
  }
  // Des réglages lus (« adj1 25000 adj2 -8333 », ou un objet) : seuls ceux que la forme connaît, entiers, et différents de leur valeur d'origine. Tout le reste est ignoré, jamais une erreur.
  function adjOf(name, raw) {
    const defaults = adjDefaults(name);
    const out = {};
    const pairs = [];
    if (typeof raw === 'string') {
      const parts = raw.trim().split(/\s+/);
      for (let i = 0; i + 1 < parts.length; i += 2) pairs.push([parts[i], parts[i + 1]]);
    } else if (raw && typeof raw === 'object') {
      Object.keys(raw).forEach(key => pairs.push([key, raw[key]]));
    }
    pairs.forEach(([key, value]) => {
      if (!Object.prototype.hasOwnProperty.call(defaults, key) || value === '' || value === null || typeof value === 'boolean') return;
      const number = Math.round(Number(value));
      if (Number.isFinite(number) && Math.abs(number) <= ADJ_LIMIT && number !== defaults[key]) out[key] = number;
    });
    return out;
  }
  // Les réglages en texte, dans l'ordre de la norme (« adj1 25000 adj2 -8333 ») : '' quand tous ont leur valeur d'origine.
  function adjText(name, raw) {
    const adj = adjOf(name, raw);
    return Object.keys(adjDefaults(name)).filter(key => key in adj).map(key => key + ' ' + adj[key]).join(' ');
  }

  // Les guides que la norme donne à toute forme de `w` sur `h` : les bords, le centre, les fractions de la largeur, de la hauteur et du petit côté, les angles usuels.
  function builtins(w, h) {
    const ss = Math.min(w, h);
    const v = { w, h, l: 0, t: 0, r: w, b: h, hc: w / 2, vc: h / 2, ss, ls: Math.max(w, h), cd2: 10800000, cd4: 5400000, cd8: 2700000, '3cd4': 16200000, '3cd8': 8100000, '5cd8': 13500000, '7cd8': 18900000 };
    [2, 3, 4, 5, 6, 8, 10, 12, 16, 32].forEach((n) => { v['wd' + n] = w / n; v['hd' + n] = h / n; v['ssd' + n] = ss / n; });
    return v;
  }
  // Les opérations des formules de la norme (« */ w adj 100000 » : w fois adj divisé par 100 000).
  const OPS = {
    '*/': (x, y, z) => x * y / z,
    '+-': (x, y, z) => x + y - z,
    '+/': (x, y, z) => (x + y) / z,
    '?:': (x, y, z) => (x > 0 ? y : z),
    abs: x => Math.abs(x),
    at2: (x, y) => Math.atan2(y, x) / DEG,
    cat2: (x, y, z) => x * Math.cos(Math.atan2(z, y)),
    cos: (x, y) => x * Math.cos(y * DEG),
    max: (x, y) => Math.max(x, y),
    min: (x, y) => Math.min(x, y),
    mod: (x, y, z) => Math.sqrt(x * x + y * y + z * z),
    pin: (x, y, z) => (y < x ? x : y > z ? z : y),
    sat2: (x, y, z) => x * Math.sin(Math.atan2(z, y)),
    sin: (x, y) => x * Math.sin(y * DEG),
    sqrt: x => Math.sqrt(Math.max(0, x)),
    tan: (x, y) => x * Math.tan(y * DEG),
    val: x => x,
  };
  // La lecture d'un nom ou d'un nombre des formules, une fois les guides de la forme `name` calculés pour `w` sur `h` et les réglages `adj`.
  function readerOf(name, w, h, adj) {
    const v = builtins(w, h);
    const own = adjOf(name, adj);
    const defaults = adjDefaults(name);
    Object.keys(defaults).forEach((key) => { v[key] = key in own ? own[key] : defaults[key]; });
    const read = token => (Object.prototype.hasOwnProperty.call(v, token) ? v[token] : Number(token) || 0);
    (DATA[name].g ? DATA[name].g.split('|') : []).forEach((guide) => {
      const parts = guide.split(' ');
      const op = OPS[parts[1]];
      const result = op ? op(read(parts[2]), read(parts[3]), read(parts[4])) : 0;
      v[parts[0]] = Number.isFinite(result) ? result : 0;
    });
    return read;
  }

  // L'angle « vu » d'un point d'une ellipse de rayons `rx` et `ry` (la droite du centre au point) ramené à l'angle qui le construit (rx cos t, ry sin t), dans le même tour.
  function paramOf(rx, ry, angle) {
    const t = Math.atan2(rx * Math.sin(angle), ry * Math.cos(angle));
    return t + 2 * Math.PI * Math.round((angle - t) / (2 * Math.PI));
  }

  // Les chemins de la forme `name` à `w` sur `h` points (réglages `adj`, d'origine sinon) : [{ fill, stroke, commands }]. `fill` : '' pour un chemin sans fond, sinon 'norm' (le fond), 'lighten',
  // 'lightenLess', 'darken' ou 'darkenLess' (le fond éclairci ou assombri) ; `stroke` : le chemin porte le trait. `commands` : ['M', x, y], ['L', x, y], ['C', x1, y1, x2, y2, x, y] ou ['Z'].
  function paths(name, w, h, adj) {
    if (!has(name)) return [];
    const read = readerOf(name, w, h, adj);
    return DATA[name].p.map((spec) => {
      const tokens = spec.split(' ');
      const out = { fill: 'norm', stroke: true, commands: [] };
      let pw = 0;
      let ph = 0;
      let i = 0;
      for (; i < tokens.length && !/^[MLAQCZ]$/.test(tokens[i]); i++) {
        const token = tokens[i];
        if (token in FILLS) out.fill = FILLS[token];
        else if (token === 's0') out.stroke = false;
        else if (token[0] === 'W') pw = Number(token.slice(1));
        else if (token[0] === 'H') ph = Number(token.slice(1));
      }
      // Un chemin peut avoir son propre repère (`w`, `h` de la norme) : ses mesures y sont étirées à la boîte.
      const sx = pw ? w / pw : 1;
      const sy = ph ? h / ph : 1;
      const at = () => { const x = read(tokens[i++]); const y = read(tokens[i++]); return [x * sx, y * sy]; };
      let current = [0, 0];
      let start = [0, 0];
      const list = out.commands;
      while (i < tokens.length) {
        const command = tokens[i++];
        if (command === 'M') { current = at(); start = current; list.push(['M', current[0], current[1]]); }
        else if (command === 'L') { current = at(); list.push(['L', current[0], current[1]]); }
        else if (command === 'Q') {
          // Une courbe du second degré est la courbe de Bézier cubique de mêmes extrémités dont les deux points de contrôle sont aux deux tiers vers le sien.
          const control = at();
          const end = at();
          list.push(['C', current[0] + 2 / 3 * (control[0] - current[0]), current[1] + 2 / 3 * (control[1] - current[1]),
            end[0] + 2 / 3 * (control[0] - end[0]), end[1] + 2 / 3 * (control[1] - end[1]), end[0], end[1]]);
          current = end;
        } else if (command === 'C') {
          const a = at();
          const b = at();
          current = at();
          list.push(['C', a[0], a[1], b[0], b[1], current[0], current[1]]);
        } else if (command === 'A') {
          const rx = read(tokens[i++]);
          const ry = read(tokens[i++]);
          const st = read(tokens[i++]) * DEG;
          const sw = read(tokens[i++]) * DEG;
          const t0 = paramOf(rx, ry, st);
          const t1 = paramOf(rx, ry, st + sw);
          const ax = rx * sx;
          const ay = ry * sy;
          const cx = current[0] - ax * Math.cos(t0);
          const cy = current[1] - ay * Math.sin(t0);
          // En morceaux d'au plus un quart de tour, chacun la courbe de Bézier qui le suit (tangentes justes aux deux bouts).
          const pieces = Math.max(1, Math.ceil(Math.abs(t1 - t0) / QUARTER - 1e-9));
          const step = (t1 - t0) / pieces;
          const k = 4 / 3 * Math.tan(step / 4);
          for (let n = 0; n < pieces; n++) {
            const a = t0 + step * n;
            const b = a + step;
            const p0 = [cx + ax * Math.cos(a), cy + ay * Math.sin(a)];
            const p3 = [cx + ax * Math.cos(b), cy + ay * Math.sin(b)];
            list.push(['C', p0[0] - k * ax * Math.sin(a), p0[1] + k * ay * Math.cos(a), p3[0] + k * ax * Math.sin(b), p3[1] - k * ay * Math.cos(b), p3[0], p3[1]]);
          }
          if (pieces) current = [cx + ax * Math.cos(t1), cy + ay * Math.sin(t1)];
        } else if (command === 'Z') { list.push(['Z']); current = start; }
      }
      return out;
    });
  }

  // Un chemin (`paths`) en données de chemin SVG (`d`), décalé de (`dx`, `dy`) et étiré de (`kx`, `ky`) : des points au centième.
  function pathData(path, dx, dy, kx, ky) {
    const ox = dx || 0;
    const oy = dy || 0;
    const fx = kx == null ? 1 : kx;
    const fy = ky == null ? 1 : ky;
    const x = value => String(round(ox + value * fx));
    const y = value => String(round(oy + value * fy));
    return path.commands.map((c) => {
      if (c[0] === 'Z') return 'Z';
      if (c[0] === 'C') return 'C' + x(c[1]) + ' ' + y(c[2]) + ' ' + x(c[3]) + ' ' + y(c[4]) + ' ' + x(c[5]) + ' ' + y(c[6]);
      return c[0] + x(c[1]) + ' ' + y(c[2]);
    }).join('');
  }

  // Un chemin en polygones (ses courbes suivies par des côtés, à TOLERANCE_PT près) : [{ points, closed }] - pour mesurer son encre.
  function flatten(path) {
    const out = [];
    let sub = null;
    let current = [0, 0];
    let start = [0, 0];
    const flush = (closed) => { if (sub && sub.length > 1) out.push({ points: sub, closed }); sub = null; };
    path.commands.forEach((c) => {
      if (c[0] === 'M') { flush(false); current = [c[1], c[2]]; start = current; sub = [current]; return; }
      if (c[0] === 'Z') { flush(true); current = start; return; }
      if (!sub) sub = [current];
      if (c[0] === 'L') { current = [c[1], c[2]]; sub.push(current); return; }
      // Une courbe de Bézier cubique : autant de côtés que sa courbure en demande (la formule de Wang).
      const p = [current, [c[1], c[2]], [c[3], c[4]], [c[5], c[6]]];
      let most = 0;
      for (let i = 0; i + 2 < 4; i++) most = Math.max(most, Math.hypot(p[i][0] - 2 * p[i + 1][0] + p[i + 2][0], p[i][1] - 2 * p[i + 1][1] + p[i + 2][1]));
      const n = Math.min(MAX_STEPS, Math.max(2, Math.ceil(Math.sqrt(0.75 * most / TOLERANCE_PT))));
      for (let k = 1; k <= n; k++) {
        const s = k / n;
        const r = 1 - s;
        sub.push([r * r * r * p[0][0] + 3 * r * r * s * p[1][0] + 3 * r * s * s * p[2][0] + s * s * s * p[3][0], r * r * r * p[0][1] + 3 * r * r * s * p[1][1] + 3 * r * s * s * p[2][1] + s * s * s * p[3][1]]);
      }
      current = [c[5], c[6]];
    });
    flush(false);
    return out;
  }

  // Ce que la forme dessine (son fond, ses faces et son trait), en points : [gauche, haut, droite, bas] - la boîte elle-même pour une forme qui ne dessine rien.
  function inkBox(name, w, h, adj) {
    let box = null;
    paths(name, w, h, adj).forEach((path) => {
      if (!path.fill && !path.stroke) return;
      flatten(path).forEach(sub => sub.points.forEach((p) => {
        box = box ? [Math.min(box[0], p[0]), Math.min(box[1], p[1]), Math.max(box[2], p[0]), Math.max(box[3], p[1])] : [p[0], p[1], p[0], p[1]];
      }));
    });
    return box || [0, 0, w, h];
  }
  // L'encre du TRAIT de `t` points des chemins tracés de la forme de `w` sur `h` : [gauche, haut, droite, bas], ou null sans trait. Le trait est à cheval sur le chemin, en onglet aux coins tant
  // que la pointe ne dépasse pas MITER_LIMIT fois l'épaisseur (la limite du thème d'Office, celle du dessin), en biseau au-delà ; `cap` ('round', 'square' ou '' : plat) finit un chemin ouvert. Un
  // trait en tirets n'a pas plus d'encre que le trait plein : c'est lui qu'on mesure. Les courbes sont suivies par leurs côtés (`flatten`), à TOLERANCE_PT près.
  function strokeBox(name, w, h, adj, t, cap) {
    if (!(t > 0)) return null;
    const half = t / 2;
    let box = null;
    const add = (x, y) => { box = box ? [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)] : [x, y, x, y]; };
    paths(name, w, h, adj).forEach((path) => {
      if (!path.stroke) return;
      flatten(path).forEach((sub) => {
        const points = sub.points.filter((p, i, all) => i === 0 || Math.hypot(p[0] - all[i - 1][0], p[1] - all[i - 1][1]) > 1e-9);
        if (sub.closed && points.length > 2 && Math.hypot(points[0][0] - points[points.length - 1][0], points[0][1] - points[points.length - 1][1]) <= 1e-9) points.pop();
        const n = points.length;
        if (n < 2) return;
        // Chaque côté : le rectangle de son trait.
        const sides = sub.closed ? n : n - 1;
        const dirs = [];
        for (let i = 0; i < sides; i++) {
          const a = points[i];
          const b = points[(i + 1) % n];
          const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
          const d = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
          dirs.push(d);
          [a, b].forEach((p) => { add(p[0] - d[1] * half, p[1] + d[0] * half); add(p[0] + d[1] * half, p[1] - d[0] * half); });
        }
        // Chaque coin : la pointe de l'onglet, sur la bissectrice du côté extérieur, à half / cos(φ / 2) du sommet (φ : l'angle dont le chemin tourne) ; en biseau, les côtés suffisent.
        const corner = (p, u, v) => {
          const c = Math.sqrt(Math.max(0, (1 + u[0] * v[0] + u[1] * v[1]) / 2));
          const bx = u[0] - v[0];
          const by = u[1] - v[1];
          const length = Math.hypot(bx, by);
          if (c * MITER_LIMIT < 1 || length < 1e-9) return;
          add(p[0] + bx / length * half / c, p[1] + by / length * half / c);
        };
        for (let i = sub.closed ? 0 : 1; i < (sub.closed ? n : n - 1); i++) corner(points[i], dirs[(i - 1 + sides) % sides], dirs[i]);
        // Les bouts d'un chemin ouvert : un bout rond ajoute un demi-disque, un bout carré une demi-épaisseur dans le sens du chemin.
        if (!sub.closed && cap) {
          [[points[0], dirs[0], -1], [points[n - 1], dirs[sides - 1], 1]].forEach(([p, d, sign]) => {
            if (cap === 'round') { add(p[0] - half, p[1] - half); add(p[0] + half, p[1] + half); return; }
            const x = p[0] + sign * d[0] * half;
            const y = p[1] + sign * d[1] * half;
            add(x - d[1] * half, y + d[0] * half);
            add(x + d[1] * half, y - d[0] * half);
          });
        }
      });
    });
    return box;
  }
  // Tout ce que la forme de `w` sur `h` couvre, sa boîte comprise, avec un trait de `t` points (0 : sans trait) : [gauche, haut, droite, bas], dans le repère de sa boîte. C'est la boîte du cadre de
  // l'éditeur (« la boîte est l'encre ») : la boîte de la forme, plus la queue d'une bulle ou le trait de rappel d'une légende qui en sortent, plus la moitié du trait à cheval sur le contour et les
  // pointes de ses coins.
  function reach(name, w, h, adj, t, cap) {
    const ink = inkBox(name, w, h, adj);
    const line = strokeBox(name, w, h, adj, t, cap) || ink;
    return [Math.min(0, ink[0], line[0]), Math.min(0, ink[1], line[1]), Math.max(w, ink[2], line[2]), Math.max(h, ink[3], line[3])];
  }
  // La boîte de la forme qu'il faut prendre pour que tout ce qu'elle couvre (`reach`) remplisse exactement `W` sur `H` points : { x, y, w, h }, sa place et sa taille dans ces `W` sur `H`. Une
  // bulle dont la queue sort de sa boîte, une légende et son trait de rappel, un cœur dont les courbes débordent un peu, un trait épais : la forme se resserre d'autant. Une forme qui ne dessine
  // qu'une partie de sa boîte (un arc plein en demi-anneau) la garde entière, comme PowerPoint. Le trait ne grandit pas avec la forme : chaque axe se cale par la sécante (la première fois, par
  // la règle de trois), au deux-centième de point. Sans solution exacte (un coin dont l'onglet devient biseau entre deux tailles voisines, une forme très étroite au trait épais), la forme la
  // plus grande qui tient dans le cadre, centrée : jamais d'encre hors du cadre.
  function fit(name, W, H, adj, t, cap) {
    const measure = (size) => {
      const all = reach(name, size[0], size[1], adj, t, cap);
      return { size, all, got: [all[2] - all[0], all[3] - all[1]] };
    };
    const miss = m => Math.max(Math.abs(m.got[0] - W), Math.abs(m.got[1] - H));
    const fits = m => m.got[0] <= W + FIT_PT && m.got[1] <= H + FIT_PT;
    // Le premier essai : la boîte rentrée de la moitié du trait de chaque côté (la forme exacte pour un contour sans coin aigu ni débord).
    let m = measure([Math.max(0.01, W - (t || 0)), Math.max(0.01, H - (t || 0))]);
    let best = fits(m) ? m : null;
    let before = null;
    for (let i = 0; i < 12 && miss(m) >= FIT_PT; i++) {
      const size = [0, 1].map((k) => {
        const want = k ? H : W;
        const slope = before ? (m.got[k] - before.got[k]) / (m.size[k] - before.size[k]) : NaN;
        const guess = Number.isFinite(slope) && slope > 0.1 ? m.size[k] + (want - m.got[k]) / slope : m.size[k] * want / m.got[k];
        return Math.max(0.01, Number.isFinite(guess) ? guess : want);
      });
      before = m;
      m = measure(size);
      if (fits(m) && (!best || miss(m) < miss(best))) best = m;
    }
    if (miss(m) < FIT_PT) best = m;
    else {
      // La plus grande forme aux proportions du cadre qui y tient (par dichotomie : un saut de l'encre ne la trompe pas).
      let low = 0;
      let high = 1;
      for (let i = 0; i < 24; i++) {
        const k = (low + high) / 2;
        const c = measure([Math.max(0.01, W * k), Math.max(0.01, H * k)]);
        if (fits(c)) { low = k; if (!best || miss(c) < miss(best)) best = c; } else high = k;
      }
      if (!best) best = measure([0.01, 0.01]);
    }
    return { x: (W - best.got[0]) / 2 - best.all[0], y: (H - best.got[1]) / 2 - best.all[1], w: best.size[0], h: best.size[1] };
  }
  // Le rectangle où PowerPoint pose le texte de la forme, en points : [gauche, haut, droite, bas] ; la boîte entière pour une forme qui n'en dit rien.
  function textRect(name, w, h, adj) {
    if (!has(name) || !DATA[name].r) return [0, 0, w, h];
    const read = readerOf(name, w, h, adj);
    return DATA[name].r.split(' ').map(read);
  }
  // La couleur `hex` (#rrggbb) d'une face (`fill` d'un chemin) : éclaircie (vers le blanc) ou assombrie (vers le noir) de sa part ; telle quelle pour le fond ('norm').
  function shade(hex, fill) {
    const amount = SHADES[fill];
    const match = /^#([0-9a-f]{6})$/i.exec(hex || '');
    if (!amount || !match) return hex;
    const value = parseInt(match[1], 16);
    return '#' + [16, 8, 0].map((shift) => {
      const c = (value >> shift) & 255;
      const next = Math.round(amount > 0 ? c + (255 - c) * amount : c * (1 + amount));
      return (next < 16 ? '0' : '') + next.toString(16);
    }).join('');
  }

  return { NAMES, MITER_LIMIT, has, adjDefaults, adjOf, adjText, paths, pathData, flatten, inkBox, strokeBox, reach, fit, textRect, shade };
})();
