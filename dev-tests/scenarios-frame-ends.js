// Suite "frameEnds" - les POINTES d'une ligne (js/free-frame.js, js/shape-geometry.js, css/free-frame.css, js/html-sanitize.js, js/pdf-export.js, js/docx-export.js, js/pptx-export.js), chantier 3 « Traits et
// transparence » du plan « Import PowerPoint sans perte » (demande du 22/10 : « dev les features manquantes pour ne pas perdre d'élément à l'import »), lot 3d : la FORME de la pointe de chaque bout
// (`data-ff-head`, `data-ff-tail` : le triangle plein, la flèche ouverte `arrow`, la flèche à encoche `stealth`, le losange `diamond`, l'ovale `oval`) et sa TAILLE (`data-ff-head-w`, `data-ff-head-len`,
// `data-ff-tail-w`, `data-ff-tail-len` : la largeur et la longueur, petite `sm`, moyenne, grande `lg`) :
//  1) le MODÈLE : les cinq pointes et leur casse, `none`, un nom inconnu, les tailles, ce que `normalized` garde (une ligne seulement, une taille seulement avec sa pointe) ;
//  2) la GÉOMÉTRIE : la taille de chaque pointe (multiple de l'épaisseur du trait, d'au moins deux points), l'endroit où le corps du trait la rejoint, le losange et l'ovale centrés sur le bout de la ligne,
//     une ligne plus courte que ses pointes, le sens retourné ; une ligne à pointes triangulaires, pleine et simple, est dessinée comme avant (un polygone) ;
//  3) l'ÉCRITURE : l'aller-retour HTML, une ligne à pointes triangulaires moyennes écrite comme avant (ni attribut de plus ni image), l'image de toute autre pointe ;
//  4) l'ASSAINISSEMENT de la Lecture (js/html-sanitize.js : `isSafeArt`, inchangé) : l'image de chaque pointe passe, toute attaque ajoutée à une image complète est retirée ;
//  5) le DESSIN : le CSS peint l'image sur le calque du trait, l'image montre chaque forme à sa taille (pixels de l'image elle-même) ;
//  6) les SORTIES : le PDF relu par pdf.js, le Word et le PowerPoint dézippés (`a:headEnd`, `a:tailEnd` : `type`, `w`, `len`).
// Le réglage à la vraie souris (le menu « Extrémités » de la barre flottante à 700x400, un seul pas d'historique, pixels de l'éditeur, de la Lecture, de la miniature, du diaporama) est dans
// dev-tests/verify-frame-ends.mjs ; la lecture d'un fichier PowerPoint est dans dev-tests/scenarios-pptx-import.js.
(function () {
  const cases = [];
  const near = (a, b, tolerance) => typeof a === 'number' && Math.abs(a - b) <= (tolerance === undefined ? 0.01 : tolerance);
  const TYPES = ['triangle', 'arrow', 'stealth', 'diamond', 'oval'];
  const INK = '#0000ff';

  // Le HTML posé dans la page, hors de l'éditeur, le temps de lire ce que le CSS en fait (les marges de la page à zéro : la boîte est à ses mesures).
  function inPage(html, read) {
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:0;top:0;width:800px;--pp-margin-left:0px;--pp-margin-top:0px;--pp-top-band:0px;--pp-page-width:100000px;--pp-page-height:100000px';
    host.innerHTML = html;
    document.body.appendChild(host);
    try { return read(host); } finally { host.remove(); }
  }
  const pseudo = (box, which, property) => getComputedStyle(box, which)[property];
  const line = (look, w = 300, h = 0) => FreeFrame.html(Object.assign({ x: 100, y: 80, w, h, shape: 'line', line: INK, lw: 3 }, look), '');
  const has = (html, name) => new RegExp('--ff-' + name + ':').test(html);
  const art = (html, name) => new DOMParser().parseFromString(html, 'text/html').querySelector('.pp-free-frame').style.getPropertyValue('--ff-' + name).trim();
  const svgOf = url => decodeURIComponent(/^url\("data:image\/svg\+xml,(.*)"\)$/.exec(url)[1]);
  const pathsOf = url => (svgOf(url).match(/<path /g) || []).length;
  const dataUrl = svg => 'url("data:image/svg+xml,' + encodeURIComponent(svg).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase()) + '")';

  // Les pixels d'une page de PDF rendue par pdf.js (pt depuis le haut-gauche).
  async function renderPdfPage(base64) {
    await TestHelpers.ensurePdfJsLoaded();
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
    const page = await pdf.getPage(1);
    const scale = 4;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    await page.render({ canvasContext: ctx, viewport }).promise;
    return { pixel: (xPt, yPt) => Array.from(ctx.getImageData(Math.round(xPt * scale), Math.round(yPt * scale), 1, 1).data.slice(0, 3)) };
  }
  const WHITE = [255, 255, 255];
  const BLUE = [0, 0, 255];
  const closeTo = (rgb, want, tolerance) => Array.isArray(rgb) && rgb.every((c, i) => Math.abs(c - want[i]) <= (tolerance === undefined ? 12 : tolerance));

  // L'image d'une ligne d'art (`url("data:...")`) dessinée à `scale` pixels par point : l'opacité d'un point, en points depuis le début de la ligne (l'image est agrandie du tour `bleed`).
  async function drawLine(w, h, look) {
    const made = ShapeGeometry.lineArt(w, h, Object.assign({ flip: '', lw: 6, color: INK, dash: '', cap: '', cmpd: '' }, look));
    if (!made) return null;
    const scale = 4;
    const img = new Image();
    await new Promise((ok, ko) => { img.onload = ok; img.onerror = () => ko(new Error('image de la ligne illisible')); img.src = /^url\("(.*)"\)$/.exec(made.url)[1]; });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil((w + 2 * made.bleed) * scale);
    canvas.height = Math.ceil((h + 2 * made.bleed) * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { made, alpha: (x, y) => ctx.getImageData(Math.min(canvas.width - 1, Math.max(0, Math.round((made.bleed + x) * scale))), Math.min(canvas.height - 1, Math.max(0, Math.round((made.bleed + y) * scale))), 1, 1).data[3] };
  }
  const on = a => a > 200;
  const off = a => a < 30;

  // Ce que chaque forme et chaque taille dessinent, sur une ligne horizontale de 200 points qui finit au point (200, 0) : des points (dx, dy) depuis ce bout, `ink` de l'encre, `paper` du papier. Mesures calculées
  // à la main (l'épaisseur du trait est de 6 points : la pointe moyenne est de 18 sur 18, la grande de 30, la petite de 12), sans rien emprunter au code.
  const SHAPES = [
    { name: 'ovale moyen', look: { tail: 'oval' }, ink: [[0, 0], [0, 8], [0, -8], [-8, 0], [8, 0], [-4, 5]], paper: [[0, 10], [0, -10], [10, 0], [-10, 6], [4, 8.5]] },
    { name: 'losange moyen', look: { tail: 'diamond' }, ink: [[0, 0], [0, 8], [0, -8], [-8, 0], [8, 0], [-3, 3]], paper: [[4, 6], [-4, 6], [0, 10], [10, 0], [-10, 6]] },
    { name: 'triangle grand en largeur, petit en longueur', look: { tail: 'triangle', tailW: 'lg', tailLen: 'sm' }, ink: [[-3, 3], [-9, 10], [-11.5, 13], [-3, -3]], paper: [[-3, 4.5], [-9, 12.5], [-14, 14], [1, 0]] },
    { name: 'flèche à encoche moyenne', look: { tail: 'stealth' }, ink: [[-2, 0.5], [-10, 4.5], [-14, 5.5], [-14, 1.5]], paper: [[-10, 5.5], [-14, 3.5], [-14, -3.5], [1, 0]] },
    { name: 'flèche ouverte grande (trait de 2 points)', look: { lw: 2, tail: 'arrow', tailW: 'lg', tailLen: 'lg' }, ink: [[-1, 0], [-11, 4.4], [-11, -4.4], [-11, 0.5]], paper: [[-11, 2.1], [-11, -2.1], [-11, 6.5], [1, 0]] },
  ];

  cases.push({
    id: 'frameends_the_model_reads_the_five_end_types_and_their_sizes',
    description: 'Une pointe (`head`, `tail`) est une des cinq de PowerPoint (triangle, arrow, stealth, diamond, oval, sans tenir compte de la casse), « none » et le vide sont aucune pointe, un nom inconnu donne le triangle plein ; une taille (`headW`, `headLen`, `tailW`, `tailLen`) est « sm », « lg » ou la moyenne (le vide) ; une ligne seule garde ses pointes, une taille n\'existe qu\'avec sa pointe',
    run: async () => {
      const endOf = ShapeGeometry.endOf;
      const sizeOf = ShapeGeometry.endSizeOf;
      const n = raw => FreeFrame.normalized(raw);
      const got = {
        types: TYPES.map(type => endOf(type)),
        caseless: [endOf('OVAL'), endOf(' Stealth '), endOf('Arrow'), endOf('DIAMOND')],
        none: [endOf(''), endOf('none'), endOf('None'), endOf(undefined), endOf(null), endOf(12)],
        unknown: [endOf('chevron'), endOf('flèche'), endOf('x')],
        sizes: [sizeOf('sm'), sizeOf('LG'), sizeOf(' lg '), sizeOf('med'), sizeOf('medium'), sizeOf(''), sizeOf(undefined), sizeOf(3)],
        line: n({ shape: 'line', line: INK, lw: 3, head: 'oval', headW: 'lg', headLen: 'SM', tail: 'stealth', tailW: 'sm', tailLen: 'med' }),
        noEnd: n({ shape: 'line', line: INK, lw: 3, head: '', headW: 'lg', headLen: 'sm', tail: 'none', tailW: 'sm', tailLen: 'lg' }),
        huge: n({ shape: 'line', line: INK, lw: 3, tail: 'arrow', tailW: 'huge', tailLen: 'big' }),
        frame: n({ shape: 'rect', fill: '#ff0000', line: INK, lw: 3, head: 'oval', headW: 'lg', tail: 'arrow', tailLen: 'sm' }),
        plain: n({}),
        lists: [ShapeGeometry.END_TYPES.join(), ShapeGeometry.END_SIZES.join()],
      };
      const pass = JSON.stringify(got.types) === JSON.stringify(TYPES) && JSON.stringify(got.caseless) === JSON.stringify(['oval', 'stealth', 'arrow', 'diamond'])
        && got.none.every(value => value === '') && got.unknown.every(value => value === 'triangle')
        && JSON.stringify(got.sizes) === JSON.stringify(['sm', 'lg', 'lg', '', '', '', '', ''])
        && got.line.head === 'oval' && got.line.headW === 'lg' && got.line.headLen === 'sm' && got.line.tail === 'stealth' && got.line.tailW === 'sm' && got.line.tailLen === ''
        && got.noEnd.head === '' && got.noEnd.headW === '' && got.noEnd.headLen === '' && got.noEnd.tail === '' && got.noEnd.tailW === '' && got.noEnd.tailLen === ''
        && got.huge.tail === 'arrow' && got.huge.tailW === '' && got.huge.tailLen === ''
        && got.frame.head === '' && got.frame.headW === '' && got.frame.tail === '' && got.frame.tailLen === ''
        && got.plain.head === '' && got.plain.headW === '' && got.plain.tailLen === ''
        && got.lists[0] === 'triangle,arrow,stealth,diamond,oval' && got.lists[1] === 'sm,med,lg';
      return { pass, notes: JSON.stringify(got) };
    },
  });

  cases.push({
    id: 'frameends_the_geometry_gives_each_end_its_shape_and_its_size',
    description: 'Sur un trait de 3 points, ligne de 300 points qui finit en (300, 0) : le triangle moyen est de 9 sur 9, le corps le rejoint à 291 ; sa grande largeur et sa petite longueur 15 sur 6 ; la flèche ouverte est plus grande (4,5 fois le trait) et le corps la rejoint au creux de son V ; la flèche à encoche a son creux à six dixièmes de sa longueur ; le losange et l\'ovale sont CENTRÉS sur le bout (ils le dépassent d\'une demi-longueur) et le corps les rejoint à leur fond ; un trait plus fin que deux points a des pointes de deux points',
    run: async () => {
      const r = n => Math.round(n * 1000) / 1000;
      const extent = (look, w = 300, h = 0) => {
        const parts = ShapeGeometry.lineParts(w, h, Object.assign({ flip: '', lw: 3 }, look));
        const xs = parts.heads.flat().map(p => p[0]);
        const ys = parts.heads.flat().map(p => p[1]);
        return { x: [r(Math.min(...xs)), r(Math.max(...xs))], y: [r(Math.min(...ys)), r(Math.max(...ys))], body: parts.body ? r(parts.body.to[0]) : null, points: parts.heads[0].length };
      };
      const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      const got = {
        triangle: extent({ tail: 'triangle' }),
        triangleSized: extent({ tail: 'triangle', tailW: 'lg', tailLen: 'sm' }),
        triangleSmall: extent({ tail: 'triangle', tailW: 'sm', tailLen: 'sm' }),
        triangleLarge: extent({ tail: 'triangle', tailW: 'lg', tailLen: 'lg' }),
        arrow: extent({ tail: 'arrow' }),
        arrowSized: extent({ tail: 'arrow', tailW: 'lg', tailLen: 'sm' }),
        stealth: extent({ tail: 'stealth' }),
        diamond: extent({ tail: 'diamond' }),
        diamondSized: extent({ tail: 'diamond', tailW: 'lg', tailLen: 'sm' }),
        oval: extent({ tail: 'oval' }),
        thin: [extent({ lw: 1, tail: 'triangle', tailW: 'sm', tailLen: 'lg' }), extent({ lw: 0.5, tail: 'diamond' })],
        headTriangle: extent({ head: 'triangle' }),   // `body` est le bout du corps : celui de la fin pour une pointe au début, celui du début (0) pour une ligne retournée
        headOval: extent({ head: 'oval' }),
        flipped: extent({ flip: 'h', head: 'oval' }),
      };
      const pass = same(got.triangle, { x: [291, 300], y: [-4.5, 4.5], body: 291, points: 3 }) && same(got.triangleSized, { x: [294, 300], y: [-7.5, 7.5], body: 294, points: 3 })
        && same(got.triangleSmall, { x: [294, 300], y: [-3, 3], body: 294, points: 3 }) && same(got.triangleLarge, { x: [285, 300], y: [-7.5, 7.5], body: 285, points: 3 })
        && same(got.arrow, { x: [286.5, 300], y: [-6.75, 6.75], body: 293.292, points: 6 }) && same(got.arrowSized, { x: [289.5, 300], y: [-9, 9], body: 295.39, points: 6 })
        && same(got.stealth, { x: [291, 300], y: [-4.5, 4.5], body: 294.6, points: 4 })
        && same(got.diamond, { x: [295.5, 304.5], y: [-4.5, 4.5], body: 295.5, points: 4 }) && same(got.diamondSized, { x: [297, 303], y: [-7.5, 7.5], body: 297, points: 4 })
        && same(got.oval, { x: [295.5, 304.5], y: [-4.5, 4.5], body: 295.5, points: 40 })
        && same(got.thin[0], { x: [290, 300], y: [-2, 2], body: 290, points: 3 }) && same(got.thin[1], { x: [297, 303], y: [-3, 3], body: 297, points: 4 })
        && same(got.headTriangle, { x: [0, 9], y: [-4.5, 4.5], body: 300, points: 3 }) && same(got.headOval, { x: [-4.5, 4.5], y: [-4.5, 4.5], body: 300, points: 40 })
        && same(got.flipped, { x: [295.5, 304.5], y: [-4.5, 4.5], body: 0, points: 40 });
      return { pass, notes: JSON.stringify(got) };
    },
  });

  cases.push({
    id: 'frameends_a_short_line_shrinks_its_ends_together_and_a_flipped_line_turns_them',
    description: 'Une ligne plus courte que ses deux pointes les rétrécit toutes deux dans les mêmes proportions (jamais plus étroites que le trait) et n\'a plus de corps ; une ligne retournée (`flip`) porte la pointe du début à son bout de départ, en bas ou en haut, à droite ou à gauche ; le losange et l\'ovale d\'une courte ligne se touchent sans se recouvrir',
    run: async () => {
      const r = n => Math.round(n * 1000) / 1000;
      const both = ShapeGeometry.lineParts(8, 0, { flip: '', lw: 4, head: 'triangle', tail: 'triangle', headW: 'lg', headLen: 'lg', tailW: 'lg', tailLen: 'lg' });
      const xs = both.heads.map(poly => [r(Math.min(...poly.map(p => p[0]))), r(Math.max(...poly.map(p => p[0])))]);
      const wide = both.heads.map(poly => r(Math.max(...poly.map(p => p[1])) - Math.min(...poly.map(p => p[1]))));
      const round = ShapeGeometry.lineParts(20, 0, { flip: '', lw: 4, head: 'diamond', tail: 'oval', headW: 'lg', headLen: 'lg', tailW: 'lg', tailLen: 'lg' });
      const roundX = round.heads.map(poly => [r(Math.min(...poly.map(p => p[0]))), r(Math.max(...poly.map(p => p[0])))]);
      // Une diagonale retournée en hauteur : son début est en bas à gauche, la pointe du début y est ; le corps va de là au haut droit.
      const diagonal = ShapeGeometry.lineParts(100, 100, { flip: 'v', lw: 2, head: 'oval', tail: 'diamond' });
      const center = poly => [r(poly.reduce((s, p) => s + p[0], 0) / poly.length), r(poly.reduce((s, p) => s + p[1], 0) / poly.length)];
      const heads = diagonal.heads.map(center);
      const pass = both.body === null && both.bands.length === 0 && both.heads.length === 2 && JSON.stringify(xs) === JSON.stringify([[0, 4], [4, 8]]) && wide.every(value => near(value, 4, 0.01))
        && round.body === null && JSON.stringify(roundX) === JSON.stringify([[-10, 10], [10, 30]])
        && Math.abs(heads[0][0]) < 0.05 && near(heads[0][1], 100, 0.05) && near(heads[1][0], 100, 0.05) && Math.abs(heads[1][1]) < 0.05 && !!diagonal.body;
      return { pass, notes: JSON.stringify({ xs, wide, roundX, heads }) };
    },
  });

  cases.push({
    id: 'frameends_a_triangle_line_is_drawn_as_before_and_any_other_end_is_art',
    description: 'Une ligne pleine, simple, à bouts plats, dont les pointes sont des triangles (de toute taille) reste UN polygone (`lineOutline`, le CSS le découpe) : corps de 3 points et pointes de 9 sur 9, aux sommets d\'avant ; toute autre pointe (flèche ouverte, à encoche, losange, ovale) ou un trait en tirets, rond, composé en fait une image (`lineArt`) ; `lineIsPlain` le dit',
    run: async () => {
      const r = n => Math.round(n * 1000) / 1000;
      const outline = ShapeGeometry.lineOutline(300, 0, { flip: '', lw: 3, head: '', tail: 'triangle' });
      const pts = outline.points.map(p => [r(p[0]), r(p[1])]);
      const both = ShapeGeometry.lineOutline(300, 0, { flip: '', lw: 3, head: 'triangle', tail: 'triangle' });
      const plain = o => ShapeGeometry.lineIsPlain(Object.assign({ lw: 3 }, o));
      const arts = TYPES.map(type => ShapeGeometry.lineArt(300, 0, { flip: '', lw: 3, color: INK, tail: type }));
      const sized = ShapeGeometry.lineArt(300, 0, { flip: '', lw: 3, color: INK, tail: 'triangle', tailW: 'lg' });
      const pass = JSON.stringify(pts) === JSON.stringify([[0, 1.5], [291, 1.5], [291, 4.5], [300, 0], [291, -4.5], [291, -1.5], [0, -1.5]]) && both.points.length === 10
        && plain({}) && plain({ head: 'triangle' }) && plain({ head: 'triangle', tail: 'triangle', headW: 'lg', tailLen: 'sm' }) && !plain({ tail: 'arrow' }) && !plain({ head: 'stealth' }) && !plain({ tail: 'diamond' }) && !plain({ tail: 'oval' })
        && !plain({ tail: 'triangle', dash: 'dash' }) && !plain({ tail: 'triangle', cap: 'round' }) && !plain({ tail: 'triangle', cmpd: 'dbl' })
        && arts[0] === null && arts.slice(1).every(made => !!made && /^url\("data:image\/svg\+xml,/.test(made.url)) && sized === null;
      return { pass, notes: JSON.stringify({ pts, both: both.points.length, arts: arts.map(made => !!made) }) };
    },
  });

  cases.push({
    id: 'frameends_the_html_round_trips_and_a_line_with_triangle_ends_is_written_as_before',
    description: 'Le HTML d\'une ligne écrit `data-ff-head`, `data-ff-tail` et leurs tailles (`data-ff-head-w`, `data-ff-head-len`, `data-ff-tail-w`, `data-ff-tail-len`) seulement quand ils ne sont pas vides ; relu, il rend les mêmes valeurs ; une ligne à pointes triangulaires moyennes s\'écrit comme avant, au caractère près (aucun attribut de plus, un polygone, pas d\'image) ; une autre pointe écrit l\'image de la ligne ; un cadre ou une forme n\'écrit jamais de pointe',
    run: async () => {
      const arrowed = line({ head: 'triangle', tail: 'triangle' });
      const sizedTriangle = line({ tail: 'triangle', tailW: 'lg', tailLen: 'sm' });
      const oval = line({ head: 'oval', headW: 'lg', headLen: 'sm', tail: 'stealth', tailW: 'sm' });
      const none = line({ head: 'none', headW: 'lg' });
      const frame = FreeFrame.html({ x: 100, y: 80, w: 240, h: 120, shape: 'rect', fill: '#ffeeaa', line: INK, lw: 3, head: 'oval', headW: 'lg' }, '<p>Texte</p>');
      const back = inPage(oval + sizedTriangle + arrowed, host => Array.from(host.querySelectorAll('.pp-free-frame')).map(el => FreeFrame.measuresOf(el)));
      const checks = {
        arrowedAsBefore: /data-ff-head="triangle" data-ff-tail="triangle"/.test(arrowed) && !/data-ff-(head|tail)-(w|len)|--ff-art/.test(arrowed) && has(arrowed, 'clip'),
        sizedTrianglePolygon: /data-ff-tail="triangle" data-ff-tail-w="lg" data-ff-tail-len="sm"/.test(sizedTriangle) && has(sizedTriangle, 'clip') && !has(sizedTriangle, 'art:') && !/data-ff-head/.test(sizedTriangle),
        ovalWritten: /data-ff-head="oval" data-ff-head-w="lg" data-ff-head-len="sm" data-ff-tail="stealth" data-ff-tail-w="sm"/.test(oval) && !/data-ff-tail-len/.test(oval) && has(oval, 'art') && !has(oval, 'clip:'),
        ovalImage: pathsOf(art(oval, 'art')) === 3,
        noneNotWritten: !/data-ff-head|data-ff-tail/.test(none) && !has(none, 'art'),
        frameNoEnds: !/data-ff-(head|tail)/.test(frame),
        readBack: back.length === 3 && back[0].head === 'oval' && back[0].headW === 'lg' && back[0].headLen === 'sm' && back[0].tail === 'stealth' && back[0].tailW === 'sm' && back[0].tailLen === ''
          && back[1].tail === 'triangle' && back[1].tailW === 'lg' && back[1].tailLen === 'sm' && back[1].head === '' && back[2].head === 'triangle' && back[2].tail === 'triangle' && back[2].headW === '',
      };
      const pass = Object.values(checks).every(Boolean);
      return { pass, notes: JSON.stringify({ failed: Object.keys(checks).filter(name => !checks[name]), back: back.map(a => [a.head, a.headW, a.headLen, a.tail, a.tailW, a.tailLen]), oval: oval.slice(0, 360) }) };
    },
  });

  cases.push({
    id: 'frameends_the_reading_sanitizer_keeps_the_art_of_every_end_and_still_nothing_else',
    description: 'L\'image de chaque pointe (cinq formes, trois largeurs, trois longueurs, aux deux bouts, dans les quatre sens, avec et sans tirets, bouts ronds et trait composé) passe par HtmlSanitize.clean à l\'identique : elle ne contient que des `path` aux attributs que le filtre connaît (inchangé) ; une image complète à laquelle on ajoute un rond (`circle`, `ellipse`), un `polygon`, une couleur `currentColor`, un `transform` ou un script est retirée en entier, son témoin passe',
    run: async () => {
      const survivors = (style) => {
        const clean = HtmlSanitize.clean('<div class="pp-free-frame" data-ff-x="0" data-ff-y="0" data-ff-w="100" data-ff-h="40" style="' + style.replace(/"/g, '&quot;') + '"><div class="pp-free-frame-box"></div></div>');
        const el = new DOMParser().parseFromString(clean, 'text/html').querySelector('.pp-free-frame');
        return el ? (el.getAttribute('style') || '') : '';
      };
      const open = "<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10' preserveAspectRatio='none'>";
      const head = "<path d='M1 1L9 1L5 9Z' fill='#0000ff'/>";
      const body = "<path d='M1 5L9 5' fill='none' stroke='#0000ff' stroke-width='2'/>";
      const control = open + body + head + '</svg>';
      const attacks = {
        circle: open + body + head + "<circle cx='5' cy='5' r='4' fill='#0000ff'/></svg>",
        ellipse: open + body + head + "<ellipse cx='5' cy='5' rx='4' ry='2' fill='#0000ff'/></svg>",
        polygon: open + body + "<polygon points='1,1 9,1 5,9' fill='#0000ff'/></svg>",
        currentColor: open + body + "<path d='M1 1L9 1L5 9Z' fill='currentColor'/></svg>",
        transform: open + body + "<path d='M1 1L9 1L5 9Z' fill='#0000ff' transform='rotate(45)'/></svg>",
        script: open + body + head + '<script>alert(1)</script></svg>',
      };
      const kept = survivors('--ff-art:' + dataUrl(control));
      const stripped = Object.keys(attacks).filter(name => /url\(|--ff-art/.test(survivors('--ff-art:' + dataUrl(attacks[name]))));
      const generated = [];
      let count = 0;
      ['', 'h', 'v', 'hv'].forEach((flip) => ['', 'triangle', 'arrow', 'stealth', 'diamond', 'oval'].forEach((head) => ['', 'triangle', 'arrow', 'stealth', 'diamond', 'oval'].forEach((tail) => {
        if (!head && !tail) return;
        [['', ''], ['sm', 'lg'], ['lg', 'sm'], ['lg', 'lg']].forEach(([wide, long]) => [['', '', ''], ['sysDot', 'round', ''], ['', '', 'dbl']].forEach(([dash, cap, cmpd]) => {
          const look = { flip, lw: 6, color: '#a1b2c3', dash, cap, cmpd, head, headW: wide, headLen: long, tail, tailW: long, tailLen: wide };
          const made = ShapeGeometry.lineArt(120, 60, look);
          if (ShapeGeometry.lineIsPlain(look)) { if (made) generated.push(['plain', flip, head, tail]); return; }
          count += 1;
          if (!made || !HtmlSanitize.isSafeArt(made.url) || survivors('--ff-art:' + made.url).indexOf(made.url) < 0) generated.push(['line', flip, head, tail, wide, long, dash, cap, cmpd]);
        }));
      })));
      const pass = kept.includes('--ff-art:' + dataUrl(control)) && stripped.length === 0 && generated.length === 0 && count > 1000;
      return { pass, notes: JSON.stringify({ kept: kept.slice(0, 100), stripped, generated: generated.slice(0, 5), count }) };
    },
  });

  cases.push({
    id: 'frameends_css_paints_every_non_triangle_end_from_the_art',
    description: 'Dessinée par le CSS seul : une ligne à pointes triangulaires est un polygone découpé (calque de fond, pas d\'image), une ligne à pointe ovale, en losange, à encoche ou ouverte est l\'image du nœud sur le calque du trait (pas de découpe) ; le tour de la boîte contient les pointes qui dépassent du bout (le losange et l\'ovale) ; la bande qu\'on saisit les contient aussi',
    run: async () => {
      const read = look => inPage(line(look), (host) => {
        const box = host.querySelector('.pp-free-frame-box');
        return { bg: pseudo(box, '::after', 'backgroundImage'), clip: pseudo(box, '::before', 'clipPath'), bleed: parseFloat(box.parentElement.style.getPropertyValue('--ff-bleed')), grab: box.parentElement.style.getPropertyValue('--ff-grab') };
      });
      const isArt = value => /^url\("data:image\/svg\+xml,/.test(value);
      const triangle = read({ tail: 'triangle' });
      const sizedTriangle = read({ tail: 'triangle', tailW: 'lg', tailLen: 'lg' });
      const oval = read({ tail: 'oval' });
      const bigOval = read({ tail: 'oval', tailW: 'lg', tailLen: 'lg' });
      const diamond = read({ head: 'diamond', tail: 'arrow' });
      const stealth = read({ tail: 'stealth', tailW: 'sm' });
      const pass = !isArt(triangle.bg) && triangle.clip !== 'none' && !isArt(sizedTriangle.bg) && sizedTriangle.clip !== 'none'
        && isArt(oval.bg) && oval.clip === 'none' && isArt(bigOval.bg) && isArt(diamond.bg) && diamond.clip === 'none' && isArt(stealth.bg)
        && oval.bleed >= 6 && bigOval.bleed >= 9 && bigOval.bleed > oval.bleed && sizedTriangle.bleed > triangle.bleed && /^polygon\(/.test(oval.grab);
      return { pass, notes: JSON.stringify({ triangle: [triangle.clip.slice(0, 30), triangle.bleed], sizedTriangle: sizedTriangle.bleed, oval: [oval.bg.slice(0, 40), oval.clip, oval.bleed], bigOval: bigOval.bleed, diamond: [diamond.bg.slice(0, 40), diamond.clip] }) };
    },
  });

  cases.push({
    id: 'frameends_the_art_draws_each_shape_at_its_size',
    description: 'L\'image de la ligne, dessinée à part sur des points mesurés à la main (ligne de 200 points qui finit en (200, 0)) : l\'ovale et le losange moyens (18 sur 18) sont centrés sur le bout et se distinguent par leurs coins ; le triangle large et court est de 30 sur 12 ; la flèche à encoche a son creux entre le corps et l\'aile ; la flèche ouverte laisse du papier entre son corps et ses bras',
    run: async () => {
      const failed = [];
      const got = [];
      for (const shape of SHAPES) {
        const drawn = await drawLine(200, 0, ShapeGeometry.lineIsPlain(Object.assign({ lw: 6 }, shape.look)) ? Object.assign({ cap: 'round' }, shape.look) : shape.look);
        if (!drawn) { failed.push([shape.name, 'pas d\'image']); continue; }
        shape.ink.forEach(([dx, dy]) => { const a = drawn.alpha(200 + dx, dy); got.push([shape.name, 'encre', dx, dy, a]); if (!on(a)) failed.push([shape.name, 'encre', dx, dy, a]); });
        shape.paper.forEach(([dx, dy]) => { const a = drawn.alpha(200 + dx, dy); got.push([shape.name, 'papier', dx, dy, a]); if (!off(a)) failed.push([shape.name, 'papier', dx, dy, a]); });
      }
      // Le corps de la ligne reste de l'encre, partout où aucune pointe ne le coupe.
      const body = await drawLine(200, 0, { tail: 'oval' });
      const bodyOk = on(body.alpha(100, 0)) && on(body.alpha(100, 2.5)) && off(body.alpha(100, 3.6)) && off(body.alpha(100, -3.6));
      // La pointe du début : le même dessin à l'autre bout.
      const head = await drawLine(200, 0, { head: 'oval' });
      const headOk = on(head.alpha(0, 8)) && on(head.alpha(-8, 0)) && off(head.alpha(0, 10)) && off(head.alpha(-10, 0)) && on(head.alpha(100, 0));
      const pass = failed.length === 0 && bodyOk && headOk;
      return { pass, notes: JSON.stringify({ failed, bodyOk, headOk }) };
    },
  });

  cases.push({
    id: 'frameends_pdf_paints_the_ends_at_their_shape_and_size',
    description: 'PDF relu par pdf.js : une ligne à pointe ovale, en losange, large et courte, à encoche et ouverte porte ses pointes aux mêmes points que l\'éditeur (mêmes mesures que l\'image de la ligne) ; une ligne à pointes triangulaires moyennes est comme avant ; une pointe au début',
    run: async (h) => {
      const rows = SHAPES.map((shape, i) => ({ shape, y: 60 + 60 * i, x: 60 }));
      const html = rows.map(row => FreeFrame.html(Object.assign({ x: row.x, y: row.y, w: 200, h: 0, shape: 'line', line: INK, lw: 6 }, row.shape.look), '')).join('')
        + FreeFrame.html({ x: 330, y: 60, w: 200, h: 0, shape: 'line', line: INK, lw: 6, head: 'diamond', tail: 'triangle' }, '')
        + FreeFrame.html({ x: 330, y: 120, w: 200, h: 0, shape: 'line', line: INK, lw: 6, tail: 'triangle' }, '');
      const out = await h.exportPdfContent(html);
      const png = await renderPdfPage(out.base64);
      const failed = [];
      rows.forEach((row) => {
        row.shape.ink.forEach(([dx, dy]) => { const rgb = png.pixel(row.x + 200 + dx, row.y + dy); if (!closeTo(rgb, BLUE, 40)) failed.push([row.shape.name, 'encre', dx, dy, rgb]); });
        row.shape.paper.forEach(([dx, dy]) => { const rgb = png.pixel(row.x + 200 + dx, row.y + dy); if (!closeTo(rgb, WHITE, 40)) failed.push([row.shape.name, 'papier', dx, dy, rgb]); });
      });
      // La première ligne de la colonne de droite : un losange au début (centré en (330, 60)), un triangle moyen à la fin ; la seconde : le triangle seul, comme avant.
      const diamond = [png.pixel(330, 60), png.pixel(330, 67), png.pixel(324, 60), png.pixel(334, 66), png.pixel(326, 66), png.pixel(330, 71), png.pixel(318, 60)];
      const triangle = [png.pixel(529, 120), png.pixel(521, 123), png.pixel(521, 126), png.pixel(531, 120), png.pixel(529, 60), png.pixel(521, 63), png.pixel(521, 66)];
      const pass = failed.length === 0 && closeTo(diamond[0], BLUE, 40) && closeTo(diamond[1], BLUE, 40) && closeTo(diamond[2], BLUE, 40) && closeTo(diamond[3], WHITE, 40) && closeTo(diamond[4], WHITE, 40) && closeTo(diamond[5], WHITE, 40) && closeTo(diamond[6], WHITE, 40)
        && closeTo(triangle[0], BLUE, 40) && closeTo(triangle[1], BLUE, 40) && closeTo(triangle[2], WHITE, 40) && closeTo(triangle[3], WHITE, 40)
        && closeTo(triangle[4], BLUE, 40) && closeTo(triangle[5], BLUE, 40) && closeTo(triangle[6], WHITE, 40);
      return { pass, notes: JSON.stringify({ failed, diamond, triangle }) };
    },
  });

  cases.push({
    id: 'frameends_word_writes_the_shape_and_size_of_each_end',
    description: 'Word (OOXML dézippé) : une ligne porte `a:headEnd` et `a:tailEnd` avec leur forme (`type` : triangle, arrow, stealth, diamond, oval) et leur taille (`w`, `len`), la taille moyenne étant « med » comme avant ; une ligne sans pointe n\'en écrit pas',
    run: async (h) => {
      const html = line({ y: 80, tail: 'triangle' }) + line({ y: 120, head: 'oval', headW: 'lg', headLen: 'sm', tail: 'stealth', tailW: 'sm', tailLen: 'lg' })
        + line({ y: 160, head: 'diamond', tail: 'arrow', tailW: 'lg', tailLen: 'lg' }) + line({ y: 200 });
      const out = await h.exportDocxParts(html);
      const anchors = Array.from(out.doc.getElementsByTagName('wp:anchor'));
      const endsOf = (anchor) => {
        const ln = Array.from(anchor.getElementsByTagName('wps:spPr')[0].children).find(c => c.tagName === 'a:ln');
        const end = (name) => { const el = ln.getElementsByTagName(name)[0]; return el ? [el.getAttribute('type'), el.getAttribute('w'), el.getAttribute('len')].join('/') : null; };
        return { head: end('a:headEnd'), tail: end('a:tailEnd'), order: Array.from(ln.children).map(c => c.tagName).join() };
      };
      const got = anchors.map(endsOf);
      const pass = anchors.length === 4 && got[0].head === null && got[0].tail === 'triangle/med/med'
        && got[1].head === 'oval/lg/sm' && got[1].tail === 'stealth/sm/lg' && got[2].head === 'diamond/med/med' && got[2].tail === 'arrow/lg/lg' && got[3].head === null && got[3].tail === null
        && /a:headEnd(,a:tailEnd)?/.test(got[1].order) && got[1].order.indexOf('a:headEnd') < got[1].order.indexOf('a:tailEnd');
      return { pass, notes: JSON.stringify(got) };
    },
  });

  cases.push({
    id: 'frameends_powerpoint_export_writes_the_shape_and_size_of_each_end',
    description: 'PowerPoint exporté : le connecteur d\'une ligne porte `a:headEnd` et `a:tailEnd` avec leur forme (`type`) et leur taille (`w`, `len`), la taille moyenne écrite « med » comme avant, dans l\'ordre de PowerPoint (le début avant la fin) ; une ligne sans pointe n\'en écrit pas',
    run: async () => {
      await ExportEngines.ensure('pptx');
      const html = line({ y: 80, tail: 'triangle' }) + line({ y: 120, head: 'oval', headW: 'lg', headLen: 'sm', tail: 'stealth', tailW: 'sm', tailLen: 'lg' })
        + line({ y: 160, head: 'diamond', tail: 'arrow', tailW: 'lg', tailLen: 'lg' }) + line({ y: 200 });
      const blob = await PptxExport.fromHtml(html, { title: 'x' });
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const xml = await zip.file('ppt/slides/slide1.xml').async('string');
      const connectors = (xml.match(/<p:cxnSp>.*?<\/p:cxnSp>/g) || []).map(c => ((c.match(/<a:ln [^>]*>.*?<\/a:ln>/) || [''])[0]).replace(/<a:solidFill>.*?<\/a:solidFill>/, ''));
      const ends = c => ((c.match(/<a:(head|tail)End [^>]*\/>/g) || []).join(''));
      const got = connectors.map(ends);
      const pass = connectors.length === 4 && got[0] === '<a:tailEnd type="triangle" w="med" len="med"/>'
        && got[1] === '<a:headEnd type="oval" w="lg" len="sm"/><a:tailEnd type="stealth" w="sm" len="lg"/>'
        && got[2] === '<a:headEnd type="diamond" w="med" len="med"/><a:tailEnd type="arrow" w="lg" len="lg"/>' && got[3] === '';
      return { pass, notes: JSON.stringify(got) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.frameEnds = cases;
})();
