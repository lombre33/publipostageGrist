// Suite "frameDash" - le STYLE du trait d'un cadre, d'une forme ou d'une ligne d'une présentation (js/free-frame.js, js/shape-geometry.js, css/free-frame.css, js/html-sanitize.js), chantier 3 « Traits et
// transparence » du plan « Import PowerPoint sans perte » (demande du 22/10 : « dev les features manquantes pour ne pas perdre d'élément à l'import »). Ce lot, 3b, est le tiret et le bout du trait
// (`data-ff-dash` : les dix tirets de PowerPoint ou une liste de couples « trait:vide » ; `data-ff-cap` : plat, rond ou carré) :
//  1) le MODÈLE : les dix tirets prédéfinis, les listes, leur forme canonique, les bornes, les bouts ; un trait sans épaisseur ou sans couleur n'a ni tiret ni bout ;
//  2) l'ÉCRITURE : l'aller-retour HTML, un cadre au trait plein écrit comme avant (ni attribut ni image), l'image du trait (`--ff-art`, `--ff-art-nine`) ;
//  3) l'ASSAINISSEMENT de la Lecture (js/html-sanitize.js : `isSafeArt`) : l'image du trait que le nœud écrit passe, toute autre (adresse, script, image appelée, autre variable) est retirée ;
//  4) le DESSIN : le CSS peint l'image sur le calque du trait, le fond s'arrête au milieu du trait, l'image montre le motif de PowerPoint (pixels de l'image elle-même) ;
//  5) les SORTIES : le PDF relu par pdf.js (cadre droit, ligne, cadre pivoté), le Word et le PowerPoint dézippés (`a:prstDash`, `a:custDash`, `cap`).
// Le réglage à la vraie souris (le bouton « Style du trait » de la barre flottante et son menu à 700x400, un seul pas d'historique, pixels de l'éditeur, de la Lecture, de la miniature, du diaporama) est dans
// dev-tests/verify-frame-dash.mjs ; la lecture d'un fichier PowerPoint est dans dev-tests/scenarios-pptx-import.js.
(function () {
  const cases = [];
  const near = (a, b, tolerance) => typeof a === 'number' && Math.abs(a - b) <= (tolerance === undefined ? 0.01 : tolerance);
  const PX_PER_PT = 96 / 72;

  // Un cadre tel que l'éditeur l'écrit : `look` règle sa forme, son fond, son trait, son tiret et son bout.
  const frame = (look, inner) => FreeFrame.html(Object.assign({ x: 100, y: 80, w: 240, h: 120 }, look), inner === undefined ? '<p>Texte</p>' : inner);
  const BOX = { shape: 'rect', fill: '', line: '#0000ff', lw: 4 };
  const PRESETS = ['sysDot', 'dot', 'sysDash', 'dash', 'lgDash', 'sysDashDot', 'dashDot', 'lgDashDot', 'sysDashDotDot', 'lgDashDotDot'];

  // Le HTML posé dans la page, hors de l'éditeur, le temps de lire ce que le CSS en fait (les marges de la page à zéro : la boîte est à ses mesures).
  function inPage(html, read) {
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:0;top:0;width:800px;--pp-margin-left:0px;--pp-margin-top:0px;--pp-top-band:0px;--pp-page-width:100000px;--pp-page-height:100000px';
    host.innerHTML = html;
    document.body.appendChild(host);
    try { return read(host); } finally { host.remove(); }
  }
  const pseudo = (box, which, property) => getComputedStyle(box, which)[property];

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

  // L'image d'un trait d'art (`url("data:image/svg+xml,...")`) dessinée à `scale` pixels par point : l'opacité de chaque point, en points depuis son coin.
  async function drawArt(art, widthPt, heightPt, scale) {
    const source = /^url\("(.*)"\)$/.exec(art)[1];
    const img = new Image();
    await new Promise((ok, ko) => { img.onload = ok; img.onerror = () => ko(new Error('image du trait illisible')); img.src = source; });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(widthPt * scale);
    canvas.height = Math.ceil(heightPt * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { alpha: (x, y) => ctx.getImageData(Math.min(canvas.width - 1, Math.max(0, Math.round(x * scale))), Math.min(canvas.height - 1, Math.max(0, Math.round(y * scale))), 1, 1).data[3] };
  }

  cases.push({
    id: 'framedash_the_model_reads_the_ten_powerpoint_dashes_lists_and_caps',
    description: 'Le tiret (`dash`) est un des dix de PowerPoint (sans tenir compte de la casse) ou une liste de couples « trait:vide » en largeurs de trait, ramenée à sa forme canonique (4:3 est « dash », 5:2 1:2 reste une liste) ; « solid » et tout texte illisible, trop long (plus de huit couples) ou aux mesures absurdes donnent le trait plein ; le bout (`cap`) est plat, rond ou carré (`rnd`, `sq`) ; un cadre sans couleur de trait n\'a ni tiret ni bout (sans épaisseur il les garde, sans rien en dessiner), une ligne garde les siens',
    run: async () => {
      const dashOf = ShapeGeometry.dashOf;
      const capOf = ShapeGeometry.capOf;
      const n = raw => FreeFrame.normalized(raw);
      const got = {
        presets: PRESETS.map(name => dashOf(name)),
        caseless: [dashOf('SYSDOT'), dashOf('LgDashDot'), dashOf(' dash ')],
        solid: [dashOf(''), dashOf('solid'), dashOf('Solid'), dashOf(undefined), dashOf(null), dashOf(12)],
        list: [dashOf('5:2 1:2'), dashOf('1.234:2.5'), dashOf('4:3'), dashOf('4:3 1:3'), dashOf('3:1  1:1')],
        unreadable: [dashOf('foo'), dashOf('1:2 x'), dashOf('1'), dashOf('0:1'), dashOf('1:0'), dashOf('1:101'), dashOf('-1:2'), dashOf('1:2 '.repeat(9).trim()), dashOf('1e3:2')],
        eight: dashOf('1:2 '.repeat(8).trim()),
        caps: [capOf('round'), capOf('rnd'), capOf('ROUND'), capOf('square'), capOf('sq'), capOf('flat'), capOf(''), capOf('triangle'), capOf(undefined)],
        frame: n({ shape: 'rect', fill: '#ff0000', line: '#0000ff', lw: 4, dash: 'DASH', cap: 'rnd' }),
        noWidth: n({ shape: 'rect', fill: '#ff0000', line: '#0000ff', lw: 0, dash: 'dash', cap: 'round' }),
        noColor: n({ shape: 'rect', fill: '#ff0000', line: '', lw: 4, dash: 'dash', cap: 'round' }),
        line: n({ shape: 'line', line: '#0000ff', lw: 3, dash: 'sysDot', cap: 'sq' }),
        plain: n({}),
      };
      const pass = JSON.stringify(got.presets) === JSON.stringify(PRESETS) && JSON.stringify(got.caseless) === JSON.stringify(['sysDot', 'lgDashDot', 'dash'])
        && got.solid.every(value => value === '') && JSON.stringify(got.list) === JSON.stringify(['5:2 1:2', '1.23:2.5', 'dash', 'dashDot', 'sysDashDot'])
        && got.unreadable.every(value => value === '') && got.eight === '1:2 '.repeat(8).trim()
        && JSON.stringify(got.caps) === JSON.stringify(['round', 'round', 'round', 'square', 'square', '', '', '', ''])
        && got.frame.dash === 'dash' && got.frame.cap === 'round' && got.noWidth.dash === 'dash' && got.noWidth.cap === 'round' && got.noColor.dash === '' && got.noColor.cap === ''
        && got.line.dash === 'sysDot' && got.line.cap === 'square' && got.plain.dash === '' && got.plain.cap === '';
      return { pass, notes: JSON.stringify(got) };
    },
  });

  cases.push({
    id: 'framedash_the_dash_arrays_follow_the_powerpoint_patterns_and_the_caps',
    description: 'Les longueurs du motif (`dashArray`, en points, pour SVG et PDF) sont celles de PowerPoint : « dash » d\'un trait de 3 pt est 12 pt de trait et 9 pt de vide, « sysDot » 3 et 3, « lgDashDot » 24, 9, 3, 9 ; un bout rond ou carré rallonge chaque trait d\'une demi-épaisseur de chaque côté (le trait est rogné d\'une épaisseur, jamais sous 0,01 pt : un point rond est un trait de longueur nulle, 6 pt de période pour 3 pt de large) ; la phase (`dashPhase`) fait commencer le premier trait une demi-épaisseur plus loin ; un trait plein n\'a pas de motif',
    run: async () => {
      const arrays = {
        dash: ShapeGeometry.dashArray('dash', 3, ''), sysDot: ShapeGeometry.dashArray('sysDot', 3, ''), lgDashDot: ShapeGeometry.dashArray('lgDashDot', 3, ''),
        list: ShapeGeometry.dashArray('5:2 1:2', 2, ''), solid: ShapeGeometry.dashArray('', 3, ''), noWidth: ShapeGeometry.dashArray('dash', 0, ''),
        roundDot: ShapeGeometry.dashArray('sysDot', 3, 'round'), roundDash: ShapeGeometry.dashArray('dash', 3, 'round'), squareDash: ShapeGeometry.dashArray('dash', 3, 'square'),
      };
      const phases = { flat: ShapeGeometry.dashPhase('dash', 3, ''), round: ShapeGeometry.dashPhase('dash', 3, 'round'), roundDot: ShapeGeometry.dashPhase('sysDot', 3, 'round'), solid: ShapeGeometry.dashPhase('', 3, 'round') };
      const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      const pass = same(arrays.dash, [12, 9]) && same(arrays.sysDot, [3, 3]) && same(arrays.lgDashDot, [24, 9, 3, 9]) && same(arrays.list, [10, 4, 2, 4]) && arrays.solid === null && arrays.noWidth === null
        && same(arrays.roundDot, [0.01, 5.99]) && same(arrays.roundDash, [9, 12]) && same(arrays.squareDash, [9, 12])
        && phases.flat === 0 && near(phases.round, 21 - 1.5, 0.01) && near(phases.roundDot, 6 - 1.5, 0.01) && phases.solid === 0;
      return { pass, notes: JSON.stringify({ arrays, phases }) };
    },
  });

  cases.push({
    id: 'framedash_the_html_round_trips_and_a_solid_frame_is_written_as_before',
    description: 'Le HTML d\'un cadre au trait en tirets écrit `data-ff-dash` et `data-ff-cap` (seulement quand ils ne sont pas vides) et l\'image de son trait ; relu, il rend les mêmes valeurs ; un cadre au trait plein, à bouts plats, n\'écrit ni l\'un ni l\'autre ni image (il s\'écrit comme avant) ; une ligne au trait plein garde son polygone ; l\'image est portée par `--ff-art-nine` (rectangle, rectangle arrondi, cadre de texte : neuf cases) ou par `--ff-art` (les autres formes, les lignes)',
    run: async () => {
      const dashed = frame(Object.assign({}, BOX, { fill: '#ffeeaa', dash: 'dash', cap: 'round' }));
      const solid = frame(Object.assign({}, BOX, { fill: '#ffeeaa' }));
      const text = frame({ line: '#0000ff', lw: 3, dash: 'sysDot' });
      const bare = frame({}, '<p>Nu</p>');
      const thin = frame({ shape: 'rect', fill: '#ffeeaa', line: '#0000ff', lw: 0, dash: 'dash', cap: 'round' });
      const ellipse = frame({ shape: 'ellipse', fill: '#ffeeaa', line: '#0000ff', lw: 4, dash: 'dash' });
      const rounded = frame({ shape: 'roundRect', fill: '#ffeeaa', line: '#0000ff', lw: 4, dash: 'dash' });
      const line = FreeFrame.html({ x: 100, y: 300, w: 200, h: 0, shape: 'line', line: '#0000ff', lw: 3, dash: 'lgDash', cap: 'square', tail: 'triangle' }, '');
      const flat = FreeFrame.html({ x: 100, y: 300, w: 200, h: 0, shape: 'line', line: '#0000ff', lw: 3, tail: 'triangle' }, '');
      const rounder = FreeFrame.html({ x: 100, y: 300, w: 200, h: 0, shape: 'line', line: '#0000ff', lw: 3, cap: 'round' }, '');
      const back = inPage(dashed + line + text, host => Array.from(host.querySelectorAll('.pp-free-frame')).map(el => FreeFrame.measuresOf(el)));
      const has = (html, name) => new RegExp('--ff-' + name + ':').test(html);
      const pass = /data-ff-dash="dash"/.test(dashed) && /data-ff-cap="round"/.test(dashed) && has(dashed, 'art-nine') && has(dashed, 'slice') && !has(dashed, 'art') && !has(dashed, 'line:')
        && back.length === 3 && back[0].dash === 'dash' && back[0].cap === 'round' && back[1].dash === 'lgDash' && back[1].cap === 'square' && back[2].dash === 'sysDot' && back[2].cap === ''
        && !/data-ff-dash|data-ff-cap|--ff-art/.test(solid) && /--ff-line:#0000ff/.test(solid) && !/data-ff-dash|data-ff-cap|--ff-art/.test(bare) && !/--ff-art|--ff-slice/.test(thin)
        && has(text, 'art-nine') && has(rounded, 'art-nine') && has(ellipse, 'art') && !has(ellipse, 'art-nine') && has(line, 'art') && !has(line, 'clip') && /data-ff-dash="lgDash"/.test(line)
        && !/data-ff-dash|data-ff-cap|--ff-art/.test(flat) && has(flat, 'clip') && has(rounder, 'art') && !has(rounder, 'clip') && /data-ff-cap="round"/.test(rounder) && !/data-ff-dash/.test(rounder);
      return { pass, notes: JSON.stringify({ dashed, solid: solid.slice(0, 400), back: back.map(a => [a.dash, a.cap]) }) };
    },
  });

  cases.push({
    id: 'framedash_the_reading_sanitizer_keeps_the_art_of_the_node_and_nothing_else',
    description: 'Lecture, miniatures, aperçus et historique passent leur HTML par HtmlSanitize.clean : l\'image du trait que le nœud écrit (`--ff-art`, `--ff-art-nine`, un SVG en data URI aux seuls `path` connus) y passe à l\'identique ; toute autre image est retirée : une adresse, un SVG avec script, `onload`, image appelée (`image href`), `foreignObject`, `style`, `use`, du base64, un reste après l\'image, la même image sous un autre nom de variable ou en `background`, ou une `url(...)` dans une autre variable',
    run: async () => {
      const art = ShapeGeometry.strokeArt('rect', 200, 100, { lw: 4, color: '#0000ff', dash: 'dash', cap: 'round' });
      const lineArt = ShapeGeometry.lineArt(200, 40, { flip: '', lw: 4, color: '#0000ff', dash: 'sysDot', cap: 'round', head: '', tail: 'triangle' });
      const data = svg => 'url("data:image/svg+xml,' + encodeURIComponent(svg).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase()) + '")';
      const frameOpen = "<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'>";
      const path = "<path d='M1 1L9 9' fill='none' stroke='#0000ff' stroke-width='2'/>";
      const survivors = (style) => {
        const clean = HtmlSanitize.clean('<div class="pp-free-frame" data-ff-x="0" data-ff-y="0" data-ff-w="100" data-ff-h="40" style="' + style.replace(/"/g, '&quot;') + '"><div class="pp-free-frame-box"></div></div>');
        const el = new DOMParser().parseFromString(clean, 'text/html').querySelector('.pp-free-frame');
        const css = el ? (el.getAttribute('style') || '') : '';
        return css;
      };
      const kept = {
        nine: survivors('--ff-fill:#ff0000;--ff-art-nine:' + art.url + ';--ff-slice:' + art.slice + ';--ff-edge:' + art.edge + 'pt'),
        stretch: survivors('--ff-art:' + lineArt.url + ';--ff-line-op:0.5'),
      };
      const attacks = {
        address: '--ff-art:url("https://example.org/a.svg")',
        relative: '--ff-art:url(a.svg)',
        script: '--ff-art:' + data(frameOpen + '<script>alert(1)</script>' + path + '</svg>'),
        onload: '--ff-art:' + data("<svg xmlns='http://www.w3.org/2000/svg' onload='alert(1)' width='10' height='10' viewBox='0 0 10 10'>" + path + '</svg>'),
        image: '--ff-art:' + data(frameOpen + "<image href='https://example.org/t.png' width='10' height='10'/>" + path + '</svg>'),
        foreign: '--ff-art:' + data(frameOpen + '<foreignObject width="10" height="10"><body xmlns="http://www.w3.org/1999/xhtml"/></foreignObject>' + path + '</svg>'),
        style: '--ff-art:' + data(frameOpen + "<style>@import url('https://example.org/x.css');</style>" + path + '</svg>'),
        use: '--ff-art:' + data(frameOpen + "<use href='https://example.org/x.svg#a'/>" + path + '</svg>'),
        base64: '--ff-art:url("data:image/svg+xml;base64,' + btoa(frameOpen + path + '</svg>') + '")',
        otherType: '--ff-art:url("data:image/png;base64,iVBORw0KGgo=")',
        trailing: '--ff-art:' + art.url + ',url("https://example.org/a.png")',
        pathLetters: '--ff-art:' + data(frameOpen + "<path d='M1 1L9 9ZQ1 1 2 2' fill='none' stroke='#0000ff' stroke-width='2'/></svg>"),
        badColor: '--ff-art:' + data(frameOpen + "<path d='M1 1L9 9' fill='none' stroke='url(#x)' stroke-width='2'/></svg>"),
        otherName: '--ff-ring-bg:' + art.url,
        background: 'background-image:' + art.url,
        otherVariable: '--ff-anything:url("https://example.org/a.png")',
        backslash: '--ff-art:url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%3E\\3C/svg%3E")',
      };
      const stripped = Object.keys(attacks).filter(name => /url\(|--ff-art/.test(survivors(attacks[name])));
      const generated = [];
      ['rect', 'roundRect', 'ellipse', 'triangle', 'star5', 'hexagon', 'wedgeRoundRectCallout', 'rightArrow'].forEach((kind) => {
        PRESETS.concat(['5:2 1:2']).forEach((dash) => ['', 'round', 'square'].forEach((cap) => {
          const made = ShapeGeometry.strokeArt(kind, 180, 90, { lw: 5, color: '#a1b2c3', dash, cap });
          if (!made || !HtmlSanitize.isSafeArt(made.url)) generated.push([kind, dash, cap]);
        }));
      });
      ['', 'h', 'v', 'hv'].forEach((flip) => ['', 'triangle'].forEach((head) => ['', 'triangle'].forEach((tail) => [['sysDot', ''], ['', 'round'], ['lgDash', 'square']].forEach(([dash, cap]) => {
        const made = ShapeGeometry.lineArt(120, 60, { flip, lw: 3, color: '#a1b2c3', dash, cap, head, tail });
        if (!made || !HtmlSanitize.isSafeArt(made.url)) generated.push(['line', flip, head, tail, dash, cap]);
      }))));
      const pass = kept.nine.includes('--ff-art-nine:' + art.url) && kept.nine.includes('--ff-slice:') && kept.stretch.includes('--ff-art:' + lineArt.url) && stripped.length === 0 && generated.length === 0;
      return { pass, notes: JSON.stringify({ kept: [kept.nine.slice(0, 120), kept.stretch.slice(0, 120)], stripped, generated: generated.slice(0, 5) }) };
    },
  });

  cases.push({
    id: 'framedash_css_paints_the_stroke_from_the_art_and_the_fill_stops_at_its_middle',
    description: 'Dessiné par le CSS seul : le trait en tirets d\'un rectangle, d\'un rectangle arrondi ou d\'un cadre de texte est une bordure image à neuf cases (image du nœud, épaisseur du trait), celui d\'une ellipse ou d\'un polygone une image étirée sur le calque du trait (`::after`) ; une ligne en tirets est une image sur ce calque, sans polygone de fond ; le fond s\'arrête au milieu du trait (une demi-épaisseur en retrait, comme un trait translucide) ; un trait plein à bouts plats garde sa bordure (aucune image) ; l\'opacité du trait suit',
    run: async () => {
      const read = (look, inner) => inPage(frame(look, inner), (host) => {
        const box = host.querySelector('.pp-free-frame-box');
        return {
          nine: pseudo(box, '::after', 'borderImageSource'), slice: pseudo(box, '::after', 'borderImageSlice'), bg: pseudo(box, '::after', 'backgroundImage'),
          borderWidth: parseFloat(pseudo(box, '::after', 'borderTopWidth')), borderStyle: pseudo(box, '::after', 'borderTopStyle'), borderColor: pseudo(box, '::after', 'borderTopColor'),
          fillTop: parseFloat(pseudo(box, '::before', 'top')), fillLeft: parseFloat(pseudo(box, '::before', 'left')), opacity: pseudo(box, '::after', 'opacity'), fillBg: pseudo(box, '::before', 'backgroundColor'),
          clip: pseudo(box, '::before', 'clipPath'),
        };
      });
      const half = 2 * PX_PER_PT;
      const base = { fill: '#ff0000', line: '#0000ff', lw: 4 };
      const rect = read(Object.assign({ shape: 'rect', dash: 'dash' }, base));
      const text = read({ line: '#0000ff', lw: 4, dash: 'sysDot' });
      const rounded = read(Object.assign({ shape: 'roundRect', dash: 'dash', cap: 'round' }, base));
      const ellipse = read(Object.assign({ shape: 'ellipse', dash: 'dash' }, base));
      const star = read(Object.assign({ shape: 'star5', dash: 'dash' }, base));
      const solid = read(Object.assign({ shape: 'rect' }, base));
      const faded = read(Object.assign({ shape: 'rect', dash: 'dash', lineTr: 40 }, base));
      const line = inPage(FreeFrame.html({ x: 100, y: 300, w: 200, h: 0, shape: 'line', line: '#0000ff', lw: 3, dash: 'dash' }, ''), (host) => {
        const box = host.querySelector('.pp-free-frame-box');
        return { bg: pseudo(box, '::after', 'backgroundImage'), fillBg: pseudo(box, '::before', 'backgroundColor'), clip: pseudo(box, '::before', 'clipPath') };
      });
      const isArt = value => /^url\("data:image\/svg\+xml,/.test(value);
      const pass = isArt(rect.nine) && parseFloat(rect.slice) > 0 && near(rect.borderWidth, 4 * PX_PER_PT, 1) && rect.bg === 'none' && near(rect.fillTop, half, 0.1) && near(rect.fillLeft, half, 0.1)
        && isArt(text.nine) && isArt(rounded.nine) && rounded.borderWidth >= 4 * PX_PER_PT - 1
        && !isArt(ellipse.nine) && isArt(ellipse.bg) && near(ellipse.fillTop, half, 0.1) && !isArt(star.nine) && isArt(star.bg) && star.clip !== 'none'
        && !isArt(solid.nine) && !isArt(solid.bg) && solid.borderStyle === 'solid' && near(solid.borderWidth, 4 * PX_PER_PT, 1) && solid.borderColor === 'rgb(0, 0, 255)' && near(solid.fillTop, 0, 0.01)
        && faded.opacity === '0.6' && isArt(faded.nine)
        && isArt(line.bg) && line.clip === 'none';
      return { pass, notes: JSON.stringify({ rect, text: text.nine.slice(0, 40), rounded: [rounded.borderWidth, rounded.slice], ellipse: ellipse.bg.slice(0, 40), star: [star.bg.slice(0, 30), star.clip.slice(0, 30)], solid, faded: faded.opacity, line }) };
    },
  });

  cases.push({
    id: 'framedash_the_art_draws_the_pattern_of_powerpoint',
    description: 'L\'image du trait, dessinée à part, montre le motif de PowerPoint : une ligne en tirets (4:3, trait de 6 pt) a 24 pt d\'encre puis 18 pt de vide, ses extrémités sont plates ; des points ronds (1:1, trait de 6 pt) sont des disques de 6 pt tous les 12 pt, le premier tangent au début de la ligne ; des tirets à bouts carrés (4:3, trait de 4 pt) ont 16 pt d\'encre visibles puis 12 pt de vide ; le contour d\'un rectangle (trait de 4 pt) suit son bord rentré d\'une demi-épaisseur, le motif commence au coin haut gauche ; la pointe d\'une ligne en pointillés est pleine',
    run: async () => {
      const SCALE = 4;
      const flat = ShapeGeometry.lineArt(300, 0, { flip: '', lw: 6, color: '#0000ff', dash: 'dash', cap: '', head: '', tail: '' });
      const flatImg = await drawArt(flat.url, 300 + 2 * flat.bleed, 2 * flat.bleed, SCALE);
      const dots = ShapeGeometry.lineArt(300, 0, { flip: '', lw: 6, color: '#0000ff', dash: 'sysDot', cap: 'round', head: '', tail: '' });
      const dotsImg = await drawArt(dots.url, 300 + 2 * dots.bleed, 2 * dots.bleed, SCALE);
      const squares = ShapeGeometry.lineArt(300, 0, { flip: '', lw: 4, color: '#0000ff', dash: 'dash', cap: 'square', head: '', tail: '' });
      const squaresImg = await drawArt(squares.url, 300 + 2 * squares.bleed, 2 * squares.bleed, SCALE);
      const rect = ShapeGeometry.strokeArt('rect', 200, 100, { lw: 4, color: '#0000ff', dash: 'dash', cap: '' });
      const rectImg = await drawArt(rect.url, 200, 100, SCALE);
      const arrow = ShapeGeometry.lineArt(200, 0, { flip: '', lw: 4, color: '#0000ff', dash: 'sysDot', cap: 'round', head: '', tail: 'triangle' });
      const arrowImg = await drawArt(arrow.url, 200 + 2 * arrow.bleed, 2 * arrow.bleed, SCALE);
      const on = a => a > 200;
      const off = a => a < 30;
      const at = (img, bleed, x, y) => img.alpha(bleed + x, bleed + y);
      const pass = on(at(flatImg, flat.bleed, 12, 0)) && on(at(flatImg, flat.bleed, 1, 0)) && on(at(flatImg, flat.bleed, 23, 0)) && off(at(flatImg, flat.bleed, 25, 0)) && off(at(flatImg, flat.bleed, 33, 0)) && off(at(flatImg, flat.bleed, 41, 0))
        && on(at(flatImg, flat.bleed, 43, 0)) && on(at(flatImg, flat.bleed, 12, 2.6)) && off(at(flatImg, flat.bleed, 12, 3.5)) && off(at(flatImg, flat.bleed, -1.5, 0))
        && on(at(dotsImg, dots.bleed, 3, 0)) && on(at(dotsImg, dots.bleed, 0.4, 0)) && off(at(dotsImg, dots.bleed, 9, 0)) && on(at(dotsImg, dots.bleed, 15, 0)) && on(at(dotsImg, dots.bleed, 3, 2.6)) && off(at(dotsImg, dots.bleed, 3, 3.6))
        && off(at(dotsImg, dots.bleed, 0.1, 2.5)) && on(at(dotsImg, dots.bleed, 27, 0))
        && on(at(squaresImg, squares.bleed, 8, 0)) && off(at(squaresImg, squares.bleed, -1.5, 0)) && on(at(squaresImg, squares.bleed, 0.5, 0)) && on(at(squaresImg, squares.bleed, 15, 0)) && off(at(squaresImg, squares.bleed, 22, 0)) && on(at(squaresImg, squares.bleed, 36, 0))
        && on(rectImg.alpha(10, 2)) && off(rectImg.alpha(24, 2)) && on(rectImg.alpha(36, 2)) && on(rectImg.alpha(2, 20)) && off(rectImg.alpha(100, 30)) && off(rectImg.alpha(100, 50)) && off(rectImg.alpha(1, 1))
        && on(at(arrowImg, arrow.bleed, 193, 0));
      return { pass, notes: JSON.stringify({ flatBleed: flat.bleed, rect: [rectImg.alpha(10, 2), rectImg.alpha(24, 2), rectImg.alpha(36, 2)], dots: [at(dotsImg, dots.bleed, 3, 0), at(dotsImg, dots.bleed, 9, 0), at(dotsImg, dots.bleed, 15, 0)] }) };
    },
  });

  cases.push({
    id: 'framedash_pdf_paints_the_dashes_and_the_round_dots_of_a_frame_and_of_a_line',
    description: 'PDF relu par pdf.js : un cadre en tirets (4:3, trait de 4 pt) a ses tirets de 16 pt tous les 28 pt depuis le coin haut gauche du trait ; le même cadre au trait plein est plein ; une ligne en tirets (trait de 6 pt) 24 pt d\'encre puis 18 de vide ; des points ronds (1:1) sont des disques tous les 12 pt, le premier tangent au début de la ligne ; la pointe d\'une ligne en pointillés est pleine ; un trait translucide en tirets garde ses tirets',
    run: async (h) => {
      const box = (x, y, look) => frame(Object.assign({ x, y, w: 200, h: 100 }, BOX, look), '<p></p>');
      const html = box(60, 80, { dash: 'dash' }) + box(300, 80, {})
        + FreeFrame.html({ x: 60, y: 260, w: 300, h: 0, shape: 'line', line: '#0000ff', lw: 6, dash: 'dash' }, '')
        + FreeFrame.html({ x: 60, y: 300, w: 300, h: 0, shape: 'line', line: '#0000ff', lw: 6, dash: 'sysDot', cap: 'round' }, '')
        + FreeFrame.html({ x: 60, y: 340, w: 200, h: 0, shape: 'line', line: '#0000ff', lw: 4, dash: 'sysDot', cap: 'round', tail: 'triangle' }, '')
        + box(400, 240, { dash: 'dash', lineTr: 50 });
      const out = await h.exportPdfContent(html);
      const png = await renderPdfPage(out.base64);
      // Le haut du cadre : le trait est centré à 2 pt de son bord, sa moitié extérieure (y = 80 à 82) montre l'encre ou le vide sans le fond.
      const top = x => png.pixel(x, 81);
      const framed = { on: [top(70), top(98), top(126)], off: [top(84), top(112), top(140)] };
      const solid = [png.pixel(310, 81), png.pixel(324, 81), png.pixel(350, 81)];
      const dashes = { on: [png.pixel(72, 260), png.pixel(114, 260), png.pixel(156, 260)], off: [png.pixel(93, 260), png.pixel(135, 260), png.pixel(177, 260)] };
      const dots = { on: [png.pixel(63, 300), png.pixel(75, 300), png.pixel(87, 300), png.pixel(99, 300)], off: [png.pixel(69, 300), png.pixel(81, 300), png.pixel(93, 300)], edge: [png.pixel(63, 302.4), png.pixel(63, 303.6)] };
      const arrow = png.pixel(256, 340);
      const faded = { on: png.pixel(410, 241), off: png.pixel(424, 241) };
      const pass = framed.on.every(rgb => closeTo(rgb, BLUE)) && framed.off.every(rgb => closeTo(rgb, WHITE)) && solid.every(rgb => closeTo(rgb, BLUE))
        && dashes.on.every(rgb => closeTo(rgb, BLUE)) && dashes.off.every(rgb => closeTo(rgb, WHITE))
        && dots.on.every(rgb => closeTo(rgb, BLUE)) && dots.off.every(rgb => closeTo(rgb, WHITE)) && closeTo(dots.edge[0], BLUE) && closeTo(dots.edge[1], WHITE) && closeTo(arrow, BLUE)
        && closeTo(faded.on, [128, 128, 255], 30) && closeTo(faded.off, WHITE);
      return { pass, notes: JSON.stringify({ framed, solid, dashes, dots, arrow, faded }) };
    },
  });

  cases.push({
    id: 'framedash_pdf_of_a_rotated_frame_keeps_the_dashes',
    description: 'PDF relu par pdf.js d\'un cadre pivoté (dessiné en SVG) : le trait en tirets garde son motif (tourné d\'un quart de tour, le haut du cadre devient son côté droit : encre, vide, encre de haut en bas), des points ronds restent des disques ; le même cadre au trait plein est plein',
    run: async (h) => {
      const turned = (x, y, look) => frame(Object.assign({ x, y, w: 200, h: 100, rot: 90 }, BOX, look), '<p></p>');
      const out = await h.exportPdfContent(turned(100, 100, { dash: 'dash' }) + turned(400, 100, {}) + turned(100, 400, { dash: 'sysDot', cap: 'round', lw: 6 }));
      const png = await renderPdfPage(out.base64);
      // Le centre de (100, 100, 200 x 100) est (200, 150) : tourné de 90°, son haut devient son côté droit, à x = 250, de y = 52 (le début du trait) à y = 248.
      const right = y => png.pixel(249, y);
      const dashed = { on: [right(60), right(88), right(116)], off: [right(74), right(102), right(130)] };
      const solid = [png.pixel(549, 60), png.pixel(549, 74), png.pixel(549, 130)];
      // Des points ronds de 6 pt tous les 12 pt, le premier tangent au début : le centre de (100, 400, 200 x 100) est (200, 450), le côté droit passe à x = 247 (le trait, centré à 3 pt du bord) et commence à y = 353 : les
      // centres des disques sont à 3, 15, 27 pt de là.
      const dots = { on: [png.pixel(247, 356), png.pixel(247, 368), png.pixel(247, 380)], off: [png.pixel(247, 362), png.pixel(247, 374)] };
      const pass = dashed.on.every(rgb => closeTo(rgb, BLUE)) && dashed.off.every(rgb => closeTo(rgb, WHITE)) && solid.every(rgb => closeTo(rgb, BLUE))
        && dots.on.every(rgb => closeTo(rgb, BLUE)) && dots.off.every(rgb => closeTo(rgb, WHITE));
      return { pass, notes: JSON.stringify({ dashed, solid, dots }) };
    },
  });

  cases.push({
    id: 'framedash_word_writes_the_dash_and_the_cap_of_the_outline',
    description: 'Word (OOXML dézippé) : le trait d\'une forme et d\'une ligne porte `a:prstDash` (le nom du tiret) après son remplissage et `cap="rnd"` ou `"sq"` ; une liste devient `a:custDash` et ses `a:ds d sp` (en millièmes de pour cent de l\'épaisseur) ; sur une ligne fléchée le tiret précède les pointes ; un trait plein n\'écrit ni tiret ni bout',
    run: async (h) => {
      const html = frame(Object.assign({}, BOX, { fill: '#ffeeaa', dash: 'dash', cap: 'round' }), '<p>Un</p>')
        + FreeFrame.html({ x: 100, y: 300, w: 200, h: 0, shape: 'line', line: '#0000ff', lw: 3, dash: 'sysDot', cap: 'square', head: 'triangle', tail: 'triangle' }, '')
        + frame(Object.assign({ x: 400, y: 260 }, BOX, { dash: '5:2 1:2' }), '<p>Deux</p>')
        + frame(Object.assign({ x: 400, y: 420 }, BOX, { fill: '#ffeeaa' }), '<p>Trois</p>');
      const out = await h.exportDocxParts(html);
      const anchors = Array.from(out.doc.getElementsByTagName('wp:anchor'));
      const outlineOf = (anchor) => {
        const props = anchor.getElementsByTagName('wps:spPr')[0];
        const ln = Array.from(props.children).find(c => c.tagName === 'a:ln');
        return { cap: ln.getAttribute('cap'), kids: Array.from(ln.children).map(c => c.tagName), dash: (ln.getElementsByTagName('a:prstDash')[0] || { getAttribute: () => null }).getAttribute('val'),
          custom: Array.from(ln.getElementsByTagName('a:ds')).map(ds => ds.getAttribute('d') + '/' + ds.getAttribute('sp')) };
      };
      const got = anchors.map(outlineOf);
      const pass = anchors.length === 4
        && got[0].cap === 'rnd' && got[0].dash === 'dash' && JSON.stringify(got[0].kids) === JSON.stringify(['a:solidFill', 'a:prstDash'])
        && got[1].cap === 'sq' && got[1].dash === 'sysDot' && JSON.stringify(got[1].kids) === JSON.stringify(['a:solidFill', 'a:prstDash', 'a:headEnd', 'a:tailEnd'])
        && got[2].cap === null && got[2].dash === null && JSON.stringify(got[2].kids) === JSON.stringify(['a:solidFill', 'a:custDash']) && JSON.stringify(got[2].custom) === JSON.stringify(['500000/200000', '100000/200000'])
        && got[3].cap === null && got[3].dash === null && got[3].custom.length === 0 && JSON.stringify(got[3].kids) === JSON.stringify(['a:solidFill']);
      return { pass, notes: JSON.stringify(got) };
    },
  });

  cases.push({
    id: 'framedash_powerpoint_export_writes_the_dash_and_the_cap_of_the_outline',
    description: 'PowerPoint exporté : le trait d\'une forme et d\'une ligne (connecteur) a `cap="rnd"` ou `"sq"` et le tiret de PowerPoint (`a:prstDash val`) ou sa liste (`a:custDash`) après la couleur, avant les pointes ; un trait plein garde `<a:prstDash val="solid"/>` sans `cap`, comme avant',
    run: async () => {
      await ExportEngines.ensure('pptx');
      const html = frame(Object.assign({}, BOX, { fill: '#ffeeaa', dash: 'lgDashDot', cap: 'round' }), '<p>Un</p>')
        + FreeFrame.html({ x: 100, y: 300, w: 200, h: 0, shape: 'line', line: '#0000ff', lw: 3, dash: 'sysDot', cap: 'square', tail: 'triangle' }, '')
        + frame(Object.assign({ x: 400, y: 260 }, BOX, { dash: '5:2 1:2' }), '<p>Deux</p>')
        + frame(Object.assign({ x: 400, y: 420 }, BOX, { fill: '#ffeeaa' }), '<p>Trois</p>');
      const blob = await PptxExport.fromHtml(html, { title: 'x' });
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const xml = await zip.file('ppt/slides/slide1.xml').async('string');
      const shapes = xml.match(/<p:sp>.*?<\/p:sp>/g) || [];
      const connectors = xml.match(/<p:cxnSp>.*?<\/p:cxnSp>/g) || [];
      const lineOf = text => ((shapes.find(s => text.test(s)) || '').match(/<a:ln [^>]*>.*?<\/a:ln>/) || [''])[0];
      const first = lineOf(/Un</);
      const second = lineOf(/Deux</);
      const third = lineOf(/Trois</);
      const connector = (connectors[0] || '').match(/<a:ln [^>]*>.*?<\/a:ln>/) ? (connectors[0].match(/<a:ln [^>]*>.*?<\/a:ln>/) || [''])[0] : '';
      const pass = /^<a:ln w="\d+" cap="rnd"><a:solidFill><a:srgbClr val="0000FF"\/><\/a:solidFill><a:prstDash val="lgDashDot"\/><\/a:ln>$/.test(first)
        && /^<a:ln w="\d+"><a:solidFill><a:srgbClr val="0000FF"\/><\/a:solidFill><a:custDash><a:ds d="500000" sp="200000"\/><a:ds d="100000" sp="200000"\/><\/a:custDash><\/a:ln>$/.test(second)
        && /^<a:ln w="\d+"><a:solidFill><a:srgbClr val="0000FF"\/><\/a:solidFill><a:prstDash val="solid"\/><\/a:ln>$/.test(third)
        && /^<a:ln w="38100" cap="sq"><a:solidFill><a:srgbClr val="0000FF"\/><\/a:solidFill><a:prstDash val="sysDot"\/><a:tailEnd type="triangle" w="med" len="med"\/><\/a:ln>$/.test(connector);
      return { pass, notes: JSON.stringify({ first, second, third, connector }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.frameDash = cases;
})();
