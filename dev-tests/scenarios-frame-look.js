// Suite "frameLook" - l'aspect du trait et du fond d'un cadre, d'une forme ou d'une ligne d'une présentation (js/free-frame.js, js/shape-geometry.js, css/free-frame.css), chantier 3 « Traits et
// transparence » du plan « Import PowerPoint sans perte » (demande du 22/10 : « dev les features manquantes pour ne pas perdre d'élément à l'import »).
// Ce lot, 3a, est la TRANSPARENCE du fond et du trait (`data-ff-fill-tr`, `data-ff-line-tr`, en pour cent : 0 opaque, 100 invisible) :
//  1) le MODÈLE : bornes, un fond ou un trait absent n'a pas de transparence, aller-retour HTML, un cadre nu s'écrit comme avant ;
//  2) le DESSIN (CSS, sans script : l'éditeur, la Lecture, le diaporama, l'impression et les miniatures lisent les mêmes variables) : l'opacité de chaque calque, le fond qui s'arrête au milieu d'un trait translucide ;
//  3) les SORTIES : le PDF (opacités du canevas de pdfmake, SVG d'un cadre pivoté), le Word (`a:alpha`), le PowerPoint (`a:alpha`).
// Le réglage à la vraie souris (la glissière des menus de couleur à 700x400, un seul Annuler, pixels de l'éditeur, de la Lecture, du diaporama et du PDF) est dans dev-tests/verify-frame-transparency.mjs.
(function () {
  const cases = [];
  const near = (a, b, tolerance) => typeof a === 'number' && Math.abs(a - b) <= (tolerance === undefined ? 0.01 : tolerance);
  const PX_PER_PT = 96 / 72;

  // Un cadre tel que l'éditeur l'écrit : `look` règle sa forme, son fond, son trait et leurs transparences.
  const frame = (look, inner) => FreeFrame.html(Object.assign({ x: 100, y: 80, w: 240, h: 120 }, look), inner === undefined ? '<p>Texte</p>' : inner);
  const SHAPE = { shape: 'rect', fill: '#ff0000', line: '#0000ff', lw: 6 };

  // Le HTML posé dans la page, hors de l'éditeur, le temps de lire ce que le CSS en fait.
  function inPage(html, read) {
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:0;top:0;width:800px';
    host.innerHTML = html;
    document.body.appendChild(host);
    try { return read(host); } finally { host.remove(); }
  }
  const pseudo = (box, which, property) => getComputedStyle(box, which)[property];

  // Les pixels d'une page de PDF rendue par pdf.js (pt depuis le haut-gauche) : ce que le lecteur de PDF peint vraiment, que la définition pdfmake ne dit pas (un cadre y attend dans le pied de sa page).
  async function renderPdfPage(base64) {
    await TestHelpers.ensurePdfJsLoaded();
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
    const page = await pdf.getPage(1);
    const scale = 2;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    await page.render({ canvasContext: ctx, viewport }).promise;
    return { pixel: (xPt, yPt) => Array.from(ctx.getImageData(Math.round(xPt * scale), Math.round(yPt * scale), 1, 1).data.slice(0, 3)) };
  }
  const WHITE = [255, 255, 255];
  const closeTo = (rgb, want, tolerance) => Array.isArray(rgb) && rgb.every((c, i) => Math.abs(c - want[i]) <= (tolerance === undefined ? 8 : tolerance));

  cases.push({
    id: 'framelook_transparency_is_bounded_and_belongs_to_a_fill_or_a_line_that_exists',
    description: 'La transparence du fond (`fillTr`) et du trait (`lineTr`) est un entier de 0 à 100 : 40,4 donne 40, 140 donne 100, -5 et un texte donnent 0 ; un fond (ou un trait) absent n\'a pas de transparence, quoi que dise le HTML ; une ligne n\'a pas de fond mais un trait translucide',
    run: async () => {
      const n = raw => FreeFrame.normalized(raw);
      const got = {
        rounded: n(Object.assign({ fillTr: 40.4, lineTr: 24.6 }, SHAPE)),
        high: n(Object.assign({ fillTr: 140, lineTr: 1000 }, SHAPE)),
        low: n(Object.assign({ fillTr: -5, lineTr: 'abc' }, SHAPE)),
        noFill: n({ shape: 'rect', fill: '', line: '#0000ff', lw: 2, fillTr: 50, lineTr: 30 }),
        noLine: n({ shape: 'rect', fill: '#ff0000', line: '', lw: 0, fillTr: 50, lineTr: 30 }),
        line: n({ shape: 'line', line: '#0000ff', lw: 3, fillTr: 50, lineTr: 30 }),
        plain: n({}),
      };
      const pass = got.rounded.fillTr === 40 && got.rounded.lineTr === 25 && got.high.fillTr === 100 && got.high.lineTr === 100 && got.low.fillTr === 0 && got.low.lineTr === 0
        && got.noFill.fillTr === 0 && got.noFill.lineTr === 30 && got.noLine.fillTr === 50 && got.noLine.lineTr === 0
        && got.line.fillTr === 0 && got.line.lineTr === 30 && got.plain.fillTr === 0 && got.plain.lineTr === 0;
      return { pass, notes: JSON.stringify(got) };
    },
  });

  cases.push({
    id: 'framelook_transparency_round_trips_through_the_html_and_an_opaque_frame_is_written_as_before',
    description: 'Le HTML d\'un cadre translucide écrit `data-ff-fill-tr` et `data-ff-line-tr` et les relit à l\'identique ; un cadre opaque n\'écrit ni l\'un ni l\'autre ni aucune variable de transparence (il s\'écrit comme avant) ; la ligne translucide aussi',
    run: async () => {
      const translucent = frame(Object.assign({ fillTr: 40, lineTr: 25 }, SHAPE));
      const opaque = frame(SHAPE);
      const bare = frame({}, '<p>Nu</p>');
      const line = FreeFrame.html({ x: 100, y: 300, w: 200, h: 0, shape: 'line', line: '#0000ff', lw: 3, lineTr: 60 }, '');
      const back = inPage(translucent + line, host => Array.from(host.querySelectorAll('.pp-free-frame')).map(el => FreeFrame.measuresOf(el)));
      const pass = /data-ff-fill-tr="40"/.test(translucent) && /data-ff-line-tr="25"/.test(translucent) && /--ff-fill-op:0\.6/.test(translucent) && /--ff-line-op:0\.75/.test(translucent)
        && back.length === 2 && back[0].fillTr === 40 && back[0].lineTr === 25 && back[1].lineTr === 60 && back[1].fillTr === 0 && /data-ff-line-tr="60"/.test(line) && /--ff-fill-op:0\.4/.test(line)
        && !/-tr=/.test(opaque) && !/-op:/.test(opaque) && !/-inset:/.test(opaque) && !/-tr=/.test(bare) && !/--ff-fill-op|--ff-line-op/.test(bare);
      return { pass, notes: JSON.stringify({ translucent, opaque, bare, line, back: back.map(a => [a.fillTr, a.lineTr]) }) };
    },
  });

  cases.push({
    id: 'framelook_the_fill_and_the_line_are_two_layers_with_their_own_opacity',
    description: 'Dessiné par le CSS seul, le fond d\'une forme (`::before`) a l\'opacité 1 - transparence du fond, son trait (`::after`) 1 - transparence du trait ; une ligne (son encre est `::before`) a celle de son trait ; opaque, tout reste à 1',
    run: async () => {
      const html = frame(Object.assign({ fillTr: 40, lineTr: 25 }, SHAPE)) + frame(Object.assign({ x: 400 }, SHAPE))
        + FreeFrame.html({ x: 100, y: 300, w: 200, h: 0, shape: 'line', line: '#0000ff', lw: 3, lineTr: 60 }, '')
        + frame({ shape: 'ellipse', fill: '#00aa00', line: '#000000', lw: 2, fillTr: 100 });
      const got = inPage(html, (host) => {
        const boxes = Array.from(host.querySelectorAll('.pp-free-frame-box'));
        return boxes.map(box => [pseudo(box, '::before', 'opacity'), pseudo(box, '::after', 'opacity')]);
      });
      const pass = JSON.stringify(got) === JSON.stringify([['0.6', '0.75'], ['1', '1'], ['0.4', '1'], ['0', '1']]);
      return { pass, notes: JSON.stringify(got) };
    },
  });

  cases.push({
    id: 'framelook_a_translucent_line_stops_the_fill_at_the_middle_of_the_line',
    description: 'Un trait translucide ne couvre pas le fond qu\'il borde : le fond s\'arrête au MILIEU du trait (comme PowerPoint, le PDF et l\'export PowerPoint), d\'une demi-épaisseur en retrait pour un rectangle, un rectangle arrondi (son arrondi rentre aussi), une ellipse, un polygone ; un trait plein laisse le fond sous lui, sans retrait',
    run: async () => {
      const read = (look) => inPage(frame(look), (host) => {
        const box = host.querySelector('.pp-free-frame-box');
        return { top: parseFloat(pseudo(box, '::before', 'top')), left: parseFloat(pseudo(box, '::before', 'left')), radius: pseudo(box, '::before', 'borderTopLeftRadius'),
          clip: pseudo(box, '::before', 'clipPath'), width: box.getBoundingClientRect().width };
      });
      const solid = read(Object.assign({ lineTr: 0 }, SHAPE));
      const faded = read(Object.assign({ lineTr: 40 }, SHAPE));
      const rounded = read({ shape: 'roundRect', fill: '#ff0000', line: '#0000ff', lw: 6, lineTr: 40 });
      const roundedSolid = read({ shape: 'roundRect', fill: '#ff0000', line: '#0000ff', lw: 6 });
      const ellipse = read({ shape: 'ellipse', fill: '#ff0000', line: '#0000ff', lw: 6, lineTr: 40 });
      const triangle = read({ shape: 'triangle', fill: '#ff0000', line: '#0000ff', lw: 6, lineTr: 40 });
      const triangleSolid = read({ shape: 'triangle', fill: '#ff0000', line: '#0000ff', lw: 6 });
      const half = 3 * PX_PER_PT;
      const pass = near(solid.top, 0, 0.01) && near(solid.left, 0, 0.01) && near(faded.top, half, 0.05) && near(faded.left, half, 0.05)
        && parseFloat(rounded.radius) > 0 && parseFloat(rounded.radius) < parseFloat(roundedSolid.radius) && near(parseFloat(roundedSolid.radius) - parseFloat(rounded.radius), half, 0.1)
        && near(ellipse.top, half, 0.05) && ellipse.radius !== '0px'
        && triangle.clip !== triangleSolid.clip && triangle.clip !== 'none' && near(triangle.top, 0, 0.01);
      return { pass, notes: JSON.stringify({ solid, faded, rounded, roundedSolid, ellipse, triangle: triangle.clip, triangleSolid: triangleSolid.clip, half }) };
    },
  });

  cases.push({
    id: 'framelook_pdf_paints_the_translucent_fill_and_line_over_the_page',
    description: 'PDF relu par pdf.js : un fond à 40 % de transparence se mêle au blanc de la page (rouge -> 255, 102, 102), un trait à 25 % se mêle à ce qu\'il couvre (moitié extérieure sur la page : 64, 64, 255 ; moitié intérieure sur le fond : 64, 26, 217 - le fond s\'arrête au milieu du trait) ; le même cadre opaque garde ses couleurs pleines ; une ligne à 60 % est bleue à 40 % ; un fond et un trait transparents à 100 % ne peignent rien',
    run: async (h) => {
      const frames = (x, y, look, text) => frame(Object.assign({ x, y, w: 200, h: 120 }, SHAPE, look), '<p>' + text + '</p>');
      const html = frames(60, 80, { fillTr: 40, lineTr: 25 }, 'Un') + frames(300, 80, {}, 'Deux')
        + frames(60, 260, { fillTr: 100, lineTr: 100 }, 'Trois') + frames(300, 260, { fillTr: 100 }, 'Quatre')
        + FreeFrame.html({ x: 60, y: 440, w: 200, h: 0, shape: 'line', line: '#0000ff', lw: 6, lineTr: 60 }, '')
        + FreeFrame.html({ x: 300, y: 440, w: 200, h: 0, shape: 'line', line: '#0000ff', lw: 6 }, '');
      const out = await h.exportPdfContent(html);
      const png = await renderPdfPage(out.base64);
      // Le haut du cadre, son milieu (à 10 pt du bord gauche, loin du texte) et la moitié extérieure ou intérieure du trait de 6 pt.
      const probe = (x, y) => ({
        outer: png.pixel(x + 1.5, y + 60), inner: png.pixel(x + 4.5, y + 60), middle: png.pixel(x + 100, y + 100),
      });
      const un = probe(60, 80);
      const deux = probe(300, 80);
      const trois = probe(60, 260);
      const quatre = probe(300, 260);
      const faded = png.pixel(160, 440);
      const solid = png.pixel(400, 440);
      const pass = closeTo(un.middle, [255, 102, 102]) && closeTo(un.outer, [64, 64, 255]) && closeTo(un.inner, [64, 26, 217])
        && closeTo(deux.middle, [255, 0, 0]) && closeTo(deux.outer, [0, 0, 255]) && closeTo(deux.inner, [0, 0, 255])
        && closeTo(trois.middle, WHITE) && closeTo(trois.outer, WHITE) && closeTo(trois.inner, WHITE)
        && closeTo(quatre.middle, WHITE) && closeTo(quatre.outer, [0, 0, 255]) && closeTo(quatre.inner, [0, 0, 255])
        && closeTo(faded, [153, 153, 255]) && closeTo(solid, [0, 0, 255]);
      return { pass, notes: JSON.stringify({ un, deux, trois, quatre, faded, solid }) };
    },
  });

  cases.push({
    id: 'framelook_pdf_of_a_rotated_frame_keeps_the_opacities',
    description: 'PDF relu par pdf.js d\'un cadre pivoté (dessiné en SVG) : au centre, le fond à 40 % de transparence se mêle au blanc (255, 102, 102) ; opaque, il reste rouge ; un fond et un trait transparents à 100 % ne peignent rien',
    run: async (h) => {
      const turned = (x, y, look) => frame(Object.assign({ x, y, w: 160, h: 100, rot: 30 }, SHAPE, look), '<p></p>');
      const out = await h.exportPdfContent(turned(60, 120, { fillTr: 40, lineTr: 25 }) + turned(260, 120, {}) + turned(60, 320, { fillTr: 100, lineTr: 100 }));
      const png = await renderPdfPage(out.base64);
      const faded = png.pixel(60 + 80, 120 + 50);
      const solid = png.pixel(260 + 80, 120 + 50);
      const hidden = png.pixel(60 + 80, 320 + 50);
      const pass = closeTo(faded, [255, 102, 102]) && closeTo(solid, [255, 0, 0]) && closeTo(hidden, WHITE);
      return { pass, notes: JSON.stringify({ faded, solid, hidden }) };
    },
  });

  cases.push({
    id: 'framelook_word_writes_the_alpha_of_the_fill_and_of_the_line',
    description: 'Word (OOXML dézippé) : le fond et le trait d\'une forme portent `a:alpha` (l\'opacité en millièmes de pour cent : 40 % de transparence = 60000) dans leur couleur ; une ligne aussi ; une forme opaque n\'en écrit aucun',
    run: async (h) => {
      const html = frame(Object.assign({ fillTr: 40, lineTr: 25 }, SHAPE), '<p>Un</p>')
        + FreeFrame.html({ x: 100, y: 300, w: 200, h: 0, shape: 'line', line: '#0000ff', lw: 3, lineTr: 60 }, '')
        + frame(Object.assign({ x: 400, y: 260 }, SHAPE), '<p>Deux</p>');
      const out = await h.exportDocxParts(html);
      const anchors = Array.from(out.doc.getElementsByTagName('wp:anchor'));
      const alphasOf = (anchor) => {
        const props = anchor.getElementsByTagName('wps:spPr')[0];
        const fill = Array.from(props.children).find(c => c.tagName === 'a:solidFill');
        const ln = Array.from(props.children).find(c => c.tagName === 'a:ln');
        const val = el => (el && el.getElementsByTagName('a:alpha')[0] ? el.getElementsByTagName('a:alpha')[0].getAttribute('val') : null);
        return { fill: val(fill), line: val(ln) };
      };
      const got = anchors.map(alphasOf);
      const pass = anchors.length === 3 && got[0].fill === '60000' && got[0].line === '75000' && got[1].line === '40000' && got[1].fill === null && got[2].fill === null && got[2].line === null;
      return { pass, notes: JSON.stringify(got) };
    },
  });

  cases.push({
    id: 'framelook_powerpoint_export_writes_the_alpha_of_the_fill_and_of_the_line',
    description: 'PowerPoint exporté : le fond et le trait d\'une forme (`a:solidFill` > `a:srgbClr` > `a:alpha`) et le trait d\'une ligne (connecteur) portent l\'opacité en millièmes de pour cent ; une forme opaque garde la couleur seule, sans `a:alpha`',
    run: async () => {
      await ExportEngines.ensure('pptx');
      const html = frame(Object.assign({ fillTr: 40, lineTr: 25 }, SHAPE), '<p>Un</p>')
        + FreeFrame.html({ x: 100, y: 300, w: 200, h: 0, shape: 'line', line: '#0000ff', lw: 3, lineTr: 60 }, '')
        + frame(Object.assign({ x: 400, y: 260 }, SHAPE), '<p>Deux</p>');
      const blob = await PptxExport.fromHtml(html, { title: 'x' });
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const xml = await zip.file('ppt/slides/slide1.xml').async('string');
      const shapes = xml.match(/<p:sp>.*?<\/p:sp>/g) || [];
      const connectors = xml.match(/<p:cxnSp>.*?<\/p:cxnSp>/g) || [];
      const first = shapes.find(s => /Un</.test(s)) || '';
      const second = shapes.find(s => /Deux</.test(s)) || '';
      const pass = /<a:solidFill><a:srgbClr val="FF0000"><a:alpha val="60000"\/><\/a:srgbClr><\/a:solidFill><a:ln [^>]*><a:solidFill><a:srgbClr val="0000FF"><a:alpha val="75000"\/><\/a:srgbClr><\/a:solidFill>/.test(first)
        && connectors.length === 1 && /<a:srgbClr val="0000FF"><a:alpha val="40000"\/><\/a:srgbClr>/.test(connectors[0])
        && !/a:alpha/.test(second) && /<a:srgbClr val="FF0000"\/>/.test(second);
      return { pass, notes: JSON.stringify({ first: first.slice(0, 600), connector: (connectors[0] || '').slice(0, 400), second: second.slice(0, 400) }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.frameLook = cases;
})();
