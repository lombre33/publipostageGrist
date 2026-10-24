// Suite "shapePresets" - TOUTES les formes prédéfinies de PowerPoint (js/shape-presets.js, js/shape-presets-data.js, js/shape-geometry.js, js/free-frame.js, css/free-frame.css, js/html-sanitize.js), lot 4a
// du plan « Import PowerPoint sans perte » (choix du 23/10 : « Toutes à l'import, 40 au menu » ; chaque forme d'un fichier revient telle quelle, réglages compris) :
//  1) le MOTEUR : les 187 formes de la norme (`presetShapeDefinitions`), lues par leurs formules ; les points connus de quelques-unes (rectangle arrondi réglé, étoile à quatre branches, bulle
//     rectangulaire, rectangle de texte de l'ellipse) ; les réglages (`adj`) gardés seulement s'ils sont connus, entiers et différents de ceux d'origine ; les quatre onglets du menu ;
//  2) le CADRE : « la boîte est l'encre » - le trait, les pointes de ses coins (limite 8) et ce qui sort de la forme sont dans le cadre ; le cadre calculé depuis la géométrie d'un fichier
//     redonne cette géométrie (au vingtième de point, la géométrie retenue `geo` quand le cadre seul ne la redonne pas) ; jamais d'encre hors du cadre ;
//  3) l'ÉCRITURE : `data-ff-adj` et `data-ff-geo` reviennent tels quels de l'éditeur ; une forme des seize d'avant à ses réglages d'origine s'écrit comme avant (ni réglage, ni image) ;
//  4) l'ASSAINISSEMENT de la Lecture : l'image du fond (`--ff-fill-art`) et du trait que le nœud écrit passent, avec leurs courbes (`C`) ; toute autre est retirée ;
//  5) le DESSIN : le fond et le trait sont deux images (calques `::before` et `::after`), la forme est pleine dedans et vide dehors ;
//  6) les SORTIES : le PDF relu par pdf.js (le cœur plein, vide hors du cœur, la pointe de l'étoile au trait épais peinte), le Word et le PowerPoint dézippés (`prst`, `a:avLst` et ses `a:gd`, coins
//     en onglet `a:miter lim="800000"`, la boîte de la géométrie dans le cadre).
// Le menu à onglets à la vraie souris et au vrai clavier est dans dev-tests/verify-shapes.mjs ; la lecture d'un fichier PowerPoint dans dev-tests/scenarios-pptx-import.js.
(function () {
  const cases = [];
  const near = (a, b, tolerance) => typeof a === 'number' && Math.abs(a - b) <= (tolerance === undefined ? 0.01 : tolerance);
  const frame = (look, inner) => FreeFrame.html(Object.assign({ x: 100, y: 80, w: 240, h: 120 }, look), inner === undefined ? '<p></p>' : inner);
  const has = (points, x, y, tolerance) => points.some(p => near(p[0], x, tolerance) && near(p[1], y, tolerance));
  const pointsOf = (name, w, h, adj) => [].concat(...ShapePresets.paths(name, w, h, adj).map(path => [].concat(...ShapePresets.flatten(path).map(poly => poly.points))));
  // Des nombres tirés toujours dans le même ordre (l'essai rejoue les mêmes cas).
  const seeded = (seed) => { let s = seed; return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; };
  const MENU_KINDS = () => [].concat(...ShapeGeometry.TABS.map(tab => tab.kinds));

  function inPage(html, read) {
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:0;top:0;width:800px;--pp-margin-left:0px;--pp-margin-top:0px;--pp-top-band:0px;--pp-page-width:100000px;--pp-page-height:100000px';
    host.innerHTML = html;
    document.body.appendChild(host);
    try { return read(host); } finally { host.remove(); }
  }
  async function drawArt(art, widthPt, heightPt, scale) {
    const source = /^url\("(.*)"\)$/.exec(art)[1];
    const img = new Image();
    await new Promise((ok, ko) => { img.onload = ok; img.onerror = () => ko(new Error('image illisible')); img.src = source; });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(widthPt * scale);
    canvas.height = Math.ceil(heightPt * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { pixel: (x, y) => Array.from(ctx.getImageData(Math.min(canvas.width - 1, Math.max(0, Math.round(x * scale))), Math.min(canvas.height - 1, Math.max(0, Math.round(y * scale))), 1, 1).data) };
  }
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
  const closeTo = (rgb, want, tolerance) => Array.isArray(rgb) && want.every((c, i) => Math.abs(rgb[i] - c) <= (tolerance === undefined ? 12 : tolerance));
  const WHITE = [255, 255, 255];
  const BLUE = [0, 0, 255];
  const RED = [255, 0, 0];

  // --- 1. Le moteur ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'shapepresets_the_engine_reads_every_powerpoint_preset_by_its_formulas',
    description: 'Les 187 formes de la norme sont connues ; les seize d\'avant et les traits n\'en sont pas « dessinées par la norme » à leurs réglages d\'origine, toutes les autres le sont ; des points connus : le rectangle arrondi réglé à 40 % a ses coins de 40 pt sur 200 x 100, l\'étoile à quatre branches ses pointes au milieu des côtés et ses creux à 12,5 % du centre sur les diagonales, la queue de la bulle rectangulaire finit à 1,125 fois sa hauteur, le texte de l\'ellipse est dans le rectangle inscrit ; les réglages lus ne gardent que les noms connus, différents de l\'origine, arrondis à l\'entier, dans l\'ordre de la norme ; les quatre onglets du menu ont seize formes chacun, dessinables, nommées en français et en anglais',
    run: async () => {
      const bad = [];
      const expect = (label, ok, detail) => { if (!ok) bad.push(label + (detail === undefined ? '' : ' : ' + JSON.stringify(detail))); };
      expect('187 formes', ShapePresets.NAMES.length === 187, ShapePresets.NAMES.length);
      expect('le cœur, le cylindre, la bulle ovale sont dessinés par la norme ; le rectangle arrondi seulement réglé ; la ligne jamais',
        ShapeGeometry.drawnByPresets('heart') && ShapeGeometry.drawnByPresets('can') && ShapeGeometry.drawnByPresets('wedgeEllipseCallout') && !ShapeGeometry.drawnByPresets('roundRect', '')
        && !ShapeGeometry.drawnByPresets('roundRect', 'adj 16667') && ShapeGeometry.drawnByPresets('roundRect', 'adj 40000') && !ShapeGeometry.isPreset('line') && !ShapeGeometry.isPreset('bentConnector3') && !ShapeGeometry.isPreset('rect'));
      const rounded = pointsOf('roundRect', 200, 100, 'adj 40000');
      expect('rectangle arrondi réglé à 40 % : coins de 40 pt (le côté du haut commence à x = 40, le côté gauche à y = 40)', has(rounded, 40, 0) && has(rounded, 0, 40) && has(rounded, 160, 0) && !has(rounded, 0, 0, 5), rounded.slice(0, 6));
      const star = pointsOf('star4', 100, 100);
      // Les creux : à 12,5 du centre (la moitié de la largeur x 12 500 / 50 000) sur les diagonales, soit 8,84 sur chaque axe.
      const dip = 12.5 * Math.SQRT1_2;
      expect('étoile à quatre branches : pointes (50, 0), (100, 50), (50, 100), (0, 50), creux (58,84, 41,16)', has(star, 50, 0) && has(star, 100, 50) && has(star, 50, 100) && has(star, 0, 50) && has(star, 50 + dip, 50 - dip) && has(star, 50 - dip, 50 + dip), star);
      const bubble = ShapePresets.inkBox('wedgeRectCallout', 100, 100);
      expect('bulle rectangulaire : la queue finit à 112,5 pt sous une boîte de 100 (1,125 fois), le corps est la boîte', near(bubble[3], 112.5) && near(bubble[0], 0) && near(bubble[1], 0) && near(bubble[2], 100), bubble);
      const text = ShapePresets.textRect('ellipse', 200, 100);
      expect('texte de l\'ellipse : le rectangle inscrit (29,29 ; 14,64 ; 170,71 ; 85,36)', near(text[0], 29.29, 0.01) && near(text[1], 14.64, 0.01) && near(text[2], 170.71, 0.01) && near(text[3], 85.36, 0.01), text);
      const read = [ShapePresets.adjText('wedgeRoundRectCallout', 'adj3 16667 adj2 70000 foo 3 adj1 1.5'), ShapePresets.adjText('roundRect', { adj: '40000' }), ShapePresets.adjText('heart', 'adj 5'), ShapePresets.adjText('nope', 'adj 5')];
      expect('réglages lus : origine et nom inconnu ignorés, 1,5 arrondi à 2, ordre de la norme ; une forme sans réglage ou inconnue n\'en a pas', JSON.stringify(read) === JSON.stringify(['adj1 2 adj2 70000', 'adj 40000', '', '']), read);
      const tabs = ShapeGeometry.TABS;
      const kinds = MENU_KINDS();
      expect('quatre onglets (courantes, de base, flèches, étoiles et bulles) de seize formes, les seize d\'avant dans le premier, sans doublon', JSON.stringify(tabs.map(t => t.id)) === JSON.stringify(['common', 'basic', 'arrows', 'stars']) && tabs.every(t => t.kinds.length === 16)
        && JSON.stringify(tabs[0].kinds) === JSON.stringify(ShapeGeometry.KINDS) && new Set(kinds).size === 64, tabs.map(t => t.kinds.length));
      const unnamed = kinds.filter(kind => !ShapePresets.has(kind) || !I18n.has('shape.' + kind));
      expect('chaque forme du menu est de la norme et nommée (js/i18n.js : français et anglais dans la même entrée)', unnamed.length === 0, unnamed);
      return { pass: !bad.length, notes: bad.join(' | ') || 'ok' };
    },
  });

  // --- 2. Le cadre : la boîte est l'encre ---------------------------------------------------------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'shapepresets_the_frame_holds_all_the_ink_and_gives_back_the_file_geometry',
    description: 'Un rectangle au trait de 6 pt couvre 3 pt de plus de chaque côté (coins droits en onglet) ; l\'étoile à quatre branches au trait de 6 pt, ses pointes en onglet : plus de 3 pt mais au plus 24 (limite 8) ; le bout rond ou carré d\'un crochet (chemin ouvert) dépasse d\'une demi-épaisseur, le bout plat non ; sur 400 cas tirés (les 64 formes du menu et d\'autres, tailles de 16 à 400 pt, traits de 0 à 12 pt, réglages tirés), le cadre calculé depuis la géométrie (presetFrame) redonne cette géométrie à 0,05 pt près, et la géométrie qu\'un cadre reçoit ne sort jamais du cadre (encre comprise)',
    run: async () => {
      const bad = [];
      const expect = (label, ok, detail) => { if (!ok) bad.push(label + (detail === undefined ? '' : ' : ' + JSON.stringify(detail))); };
      const rect = ShapePresets.reach('rect', 100, 50, '', 6, '');
      expect('rectangle 100 x 50, trait de 6 : [-3, -3, 103, 53]', JSON.stringify(rect.map(v => Math.round(v * 1000) / 1000)) === JSON.stringify([-3, -3, 103, 53]), rect);
      const star = ShapePresets.reach('star4', 100, 100, '', 6, '');
      expect('étoile à quatre branches, trait de 6 : les pointes passent la demi-épaisseur, sans dépasser la limite d\'onglet (24 pt)', star[0] < -3.5 && star[0] >= -24 && star[1] < -3.5 && star[2] > 103.5, star);
      const ends = ['round', 'square', ''].map(cap => ShapePresets.reach('leftBracket', 40, 100, '', 8, cap)[2]);
      expect('crochet gauche de 40 pt, trait de 8 : ses bouts (à droite) vont à 44 pt ronds ou carrés, 40 plats', near(ends[0], 44, 0.05) && near(ends[1], 44, 0.05) && near(ends[2], 40, 0.05), ends);
      const random = seeded(4242);
      const pool = MENU_KINDS().filter(kind => ShapeGeometry.drawnByPresets(kind) || ShapePresets.adjText(kind, 'adj 1') !== '').concat(['arc', 'bracePair', 'mathNotEqual', 'borderCallout1', 'accentCallout2', 'gear9', 'flowChartPunchedTape']);
      let worst = 0;
      let outside = 0;
      const misses = [];
      for (let i = 0; i < 400; i += 1) {
        const kind = pool[Math.floor(random() * pool.length)];
        const gw = 16 + Math.round(random() * 384);
        const gh = 16 + Math.round(random() * 384);
        const lw = Math.round(random() * 12 * 4) / 4;
        const defaults = ShapePresets.adjDefaults(kind);
        const adj = Object.keys(defaults).map(key => key + ' ' + Math.round(defaults[key] * (0.5 + random()))).join(' ');
        const cap = ['', 'round', 'square'][Math.floor(random() * 3)];
        const f = ShapeGeometry.presetFrame(kind, gw, gh, { lw, adj, cap });
        const back = ShapeGeometry.presetBox(kind, f.w, f.h, { lw, adj, cap, geo: f.geo });
        const miss = Math.max(Math.abs(back.w - gw), Math.abs(back.h - gh), Math.abs(back.x + f.x), Math.abs(back.y + f.y));
        if (miss > worst) worst = miss;
        if (miss >= 0.05) misses.push({ kind, gw, gh, lw, adj, cap, miss });
        // Le même cadre sans géométrie retenue (une forme posée, puis retaillée) : l'encre de la géométrie qu'il reçoit reste dans le cadre.
        const fitted = ShapeGeometry.presetBox(kind, f.w + 13, f.h + 7, { lw, adj, cap });
        const ink = ShapePresets.reach(kind, fitted.w, fitted.h, ShapePresets.adjText(kind, adj), lw, cap);
        if (fitted.x + ink[0] < -0.02 || fitted.y + ink[1] < -0.02 || fitted.x + ink[2] > f.w + 13.02 || fitted.y + ink[3] > f.h + 7.02) outside += 1;
      }
      expect('400 géométries de fichier reviennent à 0,05 pt près', misses.length === 0, { worst, misses: misses.slice(0, 3) });
      expect('aucune encre hors du cadre', outside === 0, outside);
      return { pass: !bad.length, notes: bad.join(' | ') || 'ok (pire écart ' + worst.toFixed(4) + ' pt)' };
    },
  });

  // --- 3. L'écriture ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'shapepresets_html_keeps_the_settings_and_the_kept_geometry_and_old_shapes_write_as_before',
    description: 'Le HTML d\'une forme réglée porte `data-ff-adj` (dans l\'ordre de la norme, sans les réglages d\'origine) et, quand il en faut une, `data-ff-geo` ; l\'éditeur les relit et les réécrit tels quels ; une géométrie retenue illisible ou posée sur une forme qui ne la lit pas est oubliée ; un rectangle arrondi à ses réglages d\'origine et un rectangle s\'écrivent comme avant ce lot (ni réglage, ni géométrie, ni image du fond) ; le cœur est dessiné par deux images (fond, trait)',
    run: async (h) => {
      const bad = [];
      const expect = (label, ok, detail) => { if (!ok) bad.push(label + (detail === undefined ? '' : ' : ' + JSON.stringify(detail))); };
      const attrsOf = html => inPage(html, host => { const el = host.querySelector('.pp-free-frame'); return { adj: el.getAttribute('data-ff-adj'), geo: el.getAttribute('data-ff-geo'), style: el.getAttribute('style') || '' }; });
      const plain = attrsOf(frame({ shape: 'roundRect', fill: '#ffeeaa', line: '#0000ff', lw: 2 }));
      const square = attrsOf(frame({ shape: 'rect', fill: '#ffeeaa', line: '#0000ff', lw: 2 }));
      expect('rectangle arrondi d\'origine et rectangle : ni réglage, ni géométrie, ni image', plain.adj === null && plain.geo === null && !/--ff-fill-art|--ff-art/.test(plain.style) && square.adj === null && square.geo === null && !/--ff-fill-art|--ff-art/.test(square.style), { plain, square });
      const set = attrsOf(frame({ shape: 'roundRect', fill: '#ffeeaa', adj: 'adj 40000' }));
      expect('rectangle arrondi réglé : data-ff-adj="adj 40000" et l\'image de son fond', set.adj === 'adj 40000' && /--ff-fill-art:\s*url\("data:image\/svg\+xml,/.test(set.style), set);
      const heart = attrsOf(frame({ shape: 'heart', fill: '#ffeeaa', line: '#0000ff', lw: 3, adj: 'adj 3', geo: '2 3 230.5 110' }));
      expect('le cœur : son réglage inconnu oublié, sa géométrie retenue écrite, ses deux images', heart.adj === null && heart.geo === '2 3 230.5 110' && /--ff-fill-art/.test(heart.style) && /--ff-art/.test(heart.style), heart);
      const odd = [attrsOf(frame({ shape: 'heart', geo: '1 2 x 4' })).geo, attrsOf(frame({ shape: 'heart', geo: '1 2 -5 4' })).geo, attrsOf(frame({ shape: 'rect', geo: '1 2 3 4' })).geo, attrsOf(frame({ shape: 'roundRect', geo: '1 2 3 4' })).geo];
      expect('géométrie illisible, négative, sur un rectangle ou une forme d\'origine : oubliée', odd.every(v => v === null), odd);
      // L'éditeur relit et réécrit : les réglages et la géométrie retenue reviennent tels quels.
      await h.resetEditor();
      const html = FreeFrame.html({ x: 60, y: 60, w: 240, h: 140, shape: 'wedgeEllipseCallout', fill: '#ffeeaa', line: '#0000ff', lw: 4, adj: 'adj1 -30000 adj2 70000', geo: '2 2 236 120.6' }, '<p>Bulle</p>')
        + FreeFrame.html({ x: 400, y: 60, w: 200, h: 120, shape: 'roundRect', fill: '#ffeeaa', adj: 'adj 40000' }, '<p>Arrondi</p>') + '<p></p>';
      Editor.setHTML(html, null);
      await new Promise(r => setTimeout(r, 300));
      const out = Editor.getHTML();
      expect('l\'éditeur garde la bulle ovale, ses réglages et sa géométrie retenue, et le rectangle arrondi réglé', /data-ff-shape="wedgeEllipseCallout"/.test(out) && /data-ff-adj="adj1 -30000 adj2 70000"/.test(out) && /data-ff-geo="2 2 236 120.6"/.test(out) && /data-ff-adj="adj 40000"/.test(out), out.slice(0, 600));
      return { pass: !bad.length, notes: bad.join(' | ') || 'ok' };
    },
  });

  // --- 4. L'assainissement ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'shapepresets_the_reading_sanitizer_keeps_the_fill_art_with_curves_and_nothing_else',
    description: 'Les images du fond et du trait des 64 formes du menu (avec tirets, bouts, trait double, réglages) passent par HtmlSanitize.clean à l\'identique ; `--ff-fill-art` n\'accepte que l\'image du nœud : une adresse, un script, du base64, une lettre de chemin inconnue, un autre type d\'image, un reste après l\'image, la même image sous un autre nom ou en `background` sont retirés ; le témoin à courbes (`C`) passe',
    run: async () => {
      const survivors = (style) => {
        const clean = HtmlSanitize.clean('<div class="pp-free-frame" data-ff-x="0" data-ff-y="0" data-ff-w="100" data-ff-h="40" style="' + style.replace(/"/g, '&quot;') + '"><div class="pp-free-frame-box"></div></div>');
        const el = new DOMParser().parseFromString(clean, 'text/html').querySelector('.pp-free-frame');
        return el ? (el.getAttribute('style') || '') : '';
      };
      const data = svg => 'url("data:image/svg+xml,' + encodeURIComponent(svg).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase()) + '")';
      const open = "<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10' preserveAspectRatio='none'>";
      const curve = "<path d='M1 1C2 2 3 3 9 9Z' fill='#ff0000'/>";
      const looks = [{}, { dash: 'dash', cap: 'round' }, { cmpd: 'dbl', lw: 8 }, { cap: 'square', dash: 'sysDot' }];
      const generated = [];
      MENU_KINDS().forEach((kind) => looks.forEach((look) => {
        const defaults = ShapePresets.adjDefaults(kind);
        const adj = Object.keys(defaults).map(key => key + ' ' + Math.round(defaults[key] * 0.8)).join(' ');
        const art = ShapeGeometry.presetArt(kind, 180, 90, Object.assign({ fill: '#a1b2c3', line: '#123456', lw: 4, adj }, look));
        if (!art.fill || !art.line || !HtmlSanitize.isSafeArt(art.fill) || !HtmlSanitize.isSafeArt(art.line)) generated.push([kind, look]);
      }));
      const heart = ShapeGeometry.presetArt('heart', 120, 100, { fill: '#a1b2c3', line: '#123456', lw: 4 });
      const kept = survivors('--ff-fill-art:' + heart.fill + ';--ff-art:' + heart.line + ';--ff-fill-op:0.6');
      const control = survivors('--ff-fill-art:' + data(open + curve + '</svg>'));
      const attacks = {
        address: '--ff-fill-art:url("https://example.org/a.svg")',
        script: '--ff-fill-art:' + data(open + '<script>alert(1)</script>' + curve + '</svg>'),
        base64: '--ff-fill-art:url("data:image/svg+xml;base64,' + btoa(open + curve + '</svg>') + '")',
        letters: '--ff-fill-art:' + data(open + "<path d='M1 1C2 2 3 3 9 9Q1 1 2 2' fill='#ff0000'/></svg>"),
        png: '--ff-fill-art:url("data:image/png;base64,iVBORw0KGgo=")',
        trailing: '--ff-fill-art:' + heart.fill + ',url("https://example.org/a.png")',
        otherName: '--ff-fill-image:' + heart.fill,
        background: 'background-image:' + heart.fill,
      };
      const stripped = Object.keys(attacks).filter(name => /url\(/.test(survivors(attacks[name])));
      const tight = kept.replace(/:\s+/g, ':');
      const pass = generated.length === 0 && tight.includes('--ff-fill-art:' + heart.fill) && tight.includes('--ff-art:' + heart.line) && /--ff-fill-art/.test(control) && stripped.length === 0;
      return { pass, notes: JSON.stringify({ generated: generated.slice(0, 4), kept: kept.slice(0, 160), control: control.slice(0, 80), stripped }) };
    },
  });

  // --- 5. Le dessin -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'shapepresets_css_paints_the_fill_and_the_stroke_images_and_the_shape_is_full_inside',
    description: 'Le cœur est peint par deux calques : le fond (`::before`, image étirée à la boîte) et le trait (`::after`) ; l\'image du fond est pleine au milieu du cœur, vide au coin de la boîte ; l\'image du trait est opaque sur le haut du lobe gauche, vide au milieu',
    run: async () => {
      const look = { shape: 'heart', fill: '#ff0000', line: '#0000ff', lw: 4, w: 120, h: 100 };
      const read = inPage(frame(look), (host) => {
        const box = host.querySelector('.pp-free-frame-box');
        const before = getComputedStyle(box, '::before');
        const after = getComputedStyle(box, '::after');
        return { fill: before.backgroundImage, size: before.backgroundSize, line: after.backgroundImage || after.borderImageSource };
      });
      const art = ShapeGeometry.presetArt('heart', 120, 100, { fill: '#ff0000', line: '#0000ff', lw: 4 });
      const fill = await drawArt(art.fill, 120, 100, 2);
      const line = await drawArt(art.line, 120, 100, 2);
      const box = ShapeGeometry.presetBox('heart', 120, 100, { lw: 4 });
      const lobeTop = [box.x + box.w * 0.25, box.y + box.h * 0.25 * 0.4];
      const got = { center: fill.pixel(60, 55), corner: fill.pixel(1, 1), lineMiddle: line.pixel(60, 55), lobeTopY: lobeTop };
      // Le haut du lobe : la première rangée opaque de l'image du trait au quart de la largeur.
      let firstInk = null;
      for (let y = 0; y < 50; y += 0.5) { if (line.pixel(box.x + box.w * 0.25, y)[3] > 200) { firstInk = y; break; } }
      const pass = /data:image\/svg\+xml/.test(read.fill) && /100%/.test(read.size) && /data:image\/svg\+xml/.test(read.line)
        && got.center[3] > 240 && closeTo(got.center, RED, 10) && got.corner[3] < 10 && got.lineMiddle[3] < 10 && firstInk !== null && firstInk < 12;
      return { pass, notes: JSON.stringify({ read: { fill: read.fill.slice(0, 40), size: read.size, line: read.line.slice(0, 40) }, got, firstInk }) };
    },
  });

  // --- 6. Les sorties -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'shapepresets_pdf_paints_the_same_shape_as_the_editor',
    description: 'PDF relu par pdf.js : le cœur rouge (200 x 160, sans trait) est plein en son milieu et vide au coin de son cadre ; l\'étoile à quatre branches au trait bleu de 8 pt (200 x 200) a sa pointe gauche peinte près du bord de son cadre (le cadre couvre la pointe en onglet) et rien hors du cadre ; un rectangle arrondi réglé à 50 % est vide au coin, plein au milieu du côté',
    run: async (h) => {
      const html = FreeFrame.html({ x: 60, y: 60, w: 200, h: 160, shape: 'heart', fill: '#ff0000' }, '<p></p>')
        + FreeFrame.html({ x: 320, y: 40, w: 200, h: 200, shape: 'star4', fill: '#ffffff', line: '#0000ff', lw: 8 }, '<p></p>')
        + FreeFrame.html({ x: 60, y: 300, w: 200, h: 120, shape: 'roundRect', fill: '#0000ff', adj: 'adj 50000' }, '<p></p>') + '<p></p>';
      const out = await h.exportPdfContent(html);
      const png = await renderPdfPage(out.base64);
      const star = ShapeGeometry.presetBox('star4', 200, 200, { lw: 8 });
      const got = {
        heartMiddle: png.pixel(160, 150), heartCorner: png.pixel(63, 63),
        starTip: png.pixel(320 + star.x - 1, 140), starBeyond: png.pixel(316, 140), starHollow: png.pixel(320 + 40, 40 + 40),
        roundCorner: png.pixel(62, 302), roundSide: png.pixel(160, 301.5),
      };
      const pass = closeTo(got.heartMiddle, RED) && closeTo(got.heartCorner, WHITE) && closeTo(got.starTip, BLUE, 60) && closeTo(got.starBeyond, WHITE) && closeTo(got.starHollow, WHITE)
        && closeTo(got.roundCorner, WHITE) && closeTo(got.roundSide, BLUE);
      return { pass, notes: JSON.stringify({ got, starBox: star }) };
    },
  });

  cases.push({
    id: 'shapepresets_word_and_powerpoint_write_the_preset_its_settings_and_its_geometry_box',
    description: 'Word et PowerPoint dézippés : le cœur est `prst="heart"`, la bulle ovale réglée `prst="wedgeEllipseCallout"` avec ses deux `a:gd` (« val -30000 », « val 70000 »), le rectangle arrondi réglé un `a:gd name="adj"` ; leur trait a des coins en onglet (`a:miter lim="800000"`) ; leur boîte est celle de leur géométrie dans le cadre (ShapeGeometry.presetPlace : au point près), y compris pivotée ; un rectangle s\'écrit comme avant (boîte rentrée d\'une demi-épaisseur, ni réglage ni `a:miter`)',
    run: async (h) => {
      const bad = [];
      const expect = (label, ok, detail) => { if (!ok) bad.push(label + (detail === undefined ? '' : ' : ' + JSON.stringify(detail))); };
      const shapes = [
        { x: 60, y: 60, w: 200, h: 160, shape: 'heart', fill: '#ff0000', line: '#0000ff', lw: 3 },
        { x: 320, y: 60, w: 240, h: 150, shape: 'wedgeEllipseCallout', fill: '#ffeeaa', line: '#0000ff', lw: 4, adj: 'adj1 -30000 adj2 70000', rot: 20 },
        { x: 620, y: 60, w: 200, h: 120, shape: 'roundRect', fill: '#ffeeaa', line: '#0000ff', lw: 2, adj: 'adj 40000' },
        { x: 60, y: 300, w: 200, h: 100, shape: 'rect', fill: '#ffeeaa', line: '#0000ff', lw: 2 },
      ];
      const html = shapes.map((s, i) => FreeFrame.html(s, '<p>F' + i + '</p>')).join('') + '<p></p>';
      const want = shapes.map(s => (s.shape === 'rect' ? { x: s.x + s.lw / 2, y: s.y + s.lw / 2, w: s.w - s.lw, h: s.h - s.lw } : ShapeGeometry.presetPlace(FreeFrame.normalized(s), s.h, s.lw)));
      // Word.
      const docx = await h.exportDocxParts(html);
      const anchors = Array.from(docx.doc.getElementsByTagName('wp:anchor'));
      const wordOf = (anchor) => {
        const ext = anchor.getElementsByTagName('wp:extent')[0];
        const off = tag => Number(anchor.getElementsByTagName(tag)[0].getElementsByTagName('wp:posOffset')[0].textContent) / 12700;
        const geom = anchor.getElementsByTagName('a:prstGeom')[0];
        const ln = anchor.getElementsByTagName('a:ln')[0];
        return { prst: geom.getAttribute('prst'), gd: Array.from(geom.getElementsByTagName('a:gd')).map(g => g.getAttribute('name') + '=' + g.getAttribute('fmla')), miter: ln && ln.getElementsByTagName('a:miter')[0] ? ln.getElementsByTagName('a:miter')[0].getAttribute('lim') : null,
          x: off('wp:positionH'), y: off('wp:positionV'), w: Number(ext.getAttribute('cx')) / 12700, h: Number(ext.getAttribute('cy')) / 12700 };
      };
      const word = anchors.map(wordOf);
      // PowerPoint.
      await ExportEngines.ensure('pptx');
      const blob = await PptxExport.fromHtml(html, { title: 'x' });
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const xml = new DOMParser().parseFromString(await zip.file('ppt/slides/slide1.xml').async('string'), 'application/xml');
      const sps = Array.from(xml.getElementsByTagName('p:sp')).filter(sp => sp.getElementsByTagName('a:prstGeom').length && /F\d/.test(sp.textContent));
      const pptOf = (sp) => {
        const off = sp.getElementsByTagName('a:off')[0];
        const ext = sp.getElementsByTagName('a:ext')[0];
        const geom = sp.getElementsByTagName('a:prstGeom')[0];
        const ln = sp.getElementsByTagName('a:ln')[0];
        return { prst: geom.getAttribute('prst'), gd: Array.from(geom.getElementsByTagName('a:gd')).map(g => g.getAttribute('name') + '=' + g.getAttribute('fmla')), miter: ln && ln.getElementsByTagName('a:miter')[0] ? ln.getElementsByTagName('a:miter')[0].getAttribute('lim') : null,
          x: Number(off.getAttribute('x')) / 12700, y: Number(off.getAttribute('y')) / 12700, w: Number(ext.getAttribute('cx')) / 12700, h: Number(ext.getAttribute('cy')) / 12700 };
      };
      const ppt = sps.map(pptOf);
      const gds = [[], ['adj1=val -30000', 'adj2=val 70000'], ['adj=val 40000'], []];
      [['Word', word], ['PowerPoint', ppt]].forEach(([name, list]) => {
        expect(name + ' : quatre formes', list.length === 4, list.length);
        list.forEach((got, i) => {
          const s = shapes[i];
          const w = want[i];
          expect(name + ' ' + s.shape + ' : prst, réglages, coins', got.prst === s.shape && JSON.stringify(got.gd) === JSON.stringify(gds[i]) && got.miter === (s.shape === 'rect' ? null : '800000'), got);
          expect(name + ' ' + s.shape + ' : la boîte de la géométrie au point près', near(got.x, w.x, 0.05) && near(got.y, w.y, 0.05) && near(got.w, w.w, 0.05) && near(got.h, w.h, 0.05), { got, want: w });
        });
      });
      return { pass: !bad.length, notes: bad.join(' | ') || 'ok' };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.shapePresets = cases;
})();
