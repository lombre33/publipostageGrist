// Suite "frameVertical" - le TEXTE TOURNÉ d'un quart de tour dans un cadre ou une forme d'une présentation (js/free-frame.js, css/free-frame.css, js/pdf-export.js, js/docx-export.js, js/pptx-export.js,
// js/pptx-import.js), lot 9g du chantier 9 « Caractères et puces » du plan « Import PowerPoint sans perte » (`a:bodyPr vert="vert"` et `vert="vert270"`) :
//  1) le MODÈLE : `vert` (de haut en bas) et `vert270` (de bas en haut), toute autre valeur est horizontale, une ligne n'en a pas ; l'aller-retour du HTML ;
//  2) le DESSIN : le CSS écrit le texte en colonnes verticales (les lignes se suivent de droite à gauche pour `vert`, de gauche à droite pour `vert270`) et la boîte ne grandit pas avec lui ;
//  3) les SORTIES : le PDF relu par pdf.js (le texte est haut et étroit, collé au bord droit ou gauche), le Word et le PowerPoint dézippés (`vert`), puis le PowerPoint relu.
// Le réglage à la vraie souris (le bouton « Orientation du texte » de la barre flottante) est dans dev-tests/verify-frame-columns.mjs ; la lecture d'un fichier PowerPoint est dans
// dev-tests/scenarios-pptx-import.js.
(function () {
  const cases = [];
  const frame = (look, inner) => FreeFrame.html(Object.assign({ x: 100, y: 80, w: 200, h: 300 }, look), inner === undefined ? '<p>Texte</p>' : inner);
  const readBack = html => FreeFrame.measuresOf(new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html').body.firstElementChild);

  function inPage(html, read) {
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:0;top:0;width:800px;--pp-margin-left:0px;--pp-margin-top:0px;--pp-top-band:0px;--pp-page-width:100000px;--pp-page-height:100000px';
    host.innerHTML = html;
    document.body.appendChild(host);
    try { return read(host); } finally { host.remove(); }
  }

  // L'encre sombre d'une page de PDF rendue par pdf.js : son rectangle englobant dans une zone (pt depuis le haut-gauche).
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
    return {
      bbox: (x0, y0, x1, y1) => {
        const px0 = Math.round(x0 * scale);
        const py0 = Math.round(y0 * scale);
        const w = Math.max(1, Math.round((x1 - x0) * scale));
        const h = Math.max(1, Math.round((y1 - y0) * scale));
        const data = ctx.getImageData(px0, py0, w, h).data;
        let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] < 110 && data[i + 1] < 110 && data[i + 2] < 110) {
            const x = (i / 4) % w;
            const y = Math.floor(i / 4 / w);
            if (x < left) left = x; if (x > right) right = x; if (y < top) top = y; if (y > bottom) bottom = y;
          }
        }
        return right < 0 ? null : { left: x0 + left / scale, top: y0 + top / scale, right: x0 + (right + 1) / scale, bottom: y0 + (bottom + 1) / scale };
      },
    };
  }

  cases.push({
    id: 'framevertical_the_model_keeps_two_turns_and_round_trips_the_html',
    description: 'L\'orientation du texte est « vert » ou « vert270 » ; toute autre valeur (« horz », absente, majuscules, illisible) est horizontale ; une ligne n\'en a pas ; le HTML écrit puis relu garde l\'orientation ; un cadre à plat s\'écrit comme avant (aucun attribut)',
    run: async () => {
      const vert = raw => FreeFrame.normalized({ x: 0, y: 0, w: 200, h: 100, vert: raw }).vert;
      const got = [vert('vert'), vert('vert270'), vert('horz'), vert(''), vert(undefined), vert('VERT'), vert('wordArtVert'), vert(7)];
      const line = FreeFrame.normalized({ x: 0, y: 0, w: 200, h: 0, shape: 'line', vert: 'vert' }).vert;
      const plain = frame({}, '<p>Un</p>');
      const down = frame({ vert: 'vert' }, '<p>Un</p>');
      const up = frame({ vert: 'vert270' }, '<p>Un</p>');
      const back = [readBack(down).vert, readBack(up).vert, readBack(plain).vert];
      const pass = JSON.stringify(got) === JSON.stringify(['vert', 'vert270', '', '', '', '', '', '']) && line === '' && !/data-ff-vert/.test(plain)
        && /data-ff-vert="vert"/.test(down) && /data-ff-vert="vert270"/.test(up) && JSON.stringify(back) === JSON.stringify(['vert', 'vert270', '']);
      return { pass, notes: JSON.stringify({ got, line, back }) };
    },
  });

  cases.push({
    id: 'framevertical_the_css_writes_the_lines_in_vertical_columns',
    description: 'Un cadre « vert » écrit son texte en colonnes verticales : `writing-mode` vertical-rl, le 1er paragraphe à droite du 2e, plus haut que large ; « vert270 » : sideways-lr, le 1er paragraphe à gauche du 2e ; les deux gardent la hauteur du cadre (300 pt) ; un cadre à plat est horizontal',
    run: async () => {
      const two = '<p>Premier</p><p>Second</p>';
      const read = html => inPage(html, (host) => {
        const content = host.querySelector('.pp-free-frame-content');
        const items = content.querySelectorAll('p');
        const a = items[0].getBoundingClientRect();
        const b = items[1].getBoundingClientRect();
        return { mode: getComputedStyle(content).writingMode, firstRightOfSecond: a.left > b.left + 5, firstLeftOfSecond: a.left < b.left - 5, tall: a.height > a.width, high: Math.round(content.getBoundingClientRect().height * 0.75) };
      });
      const down = read(frame({ vert: 'vert' }, two));
      const up = read(frame({ vert: 'vert270' }, two));
      const flat = read(frame({}, two));
      const pass = down.mode === 'vertical-rl' && down.firstRightOfSecond && down.tall && down.high === 300
        && up.mode === 'sideways-lr' && up.firstLeftOfSecond && up.tall && up.high === 300
        && flat.mode === 'horizontal-tb' && !flat.tall;
      return { pass, notes: JSON.stringify({ down, up, flat }) };
    },
  });

  cases.push({
    id: 'framevertical_the_reading_sanitizer_keeps_the_turn',
    description: 'Lecture, miniatures et aperçus passent leur HTML par HtmlSanitize.clean : l\'attribut `data-ff-vert` y passe et le texte reste vertical une fois nettoyé',
    run: async () => {
      const clean = HtmlSanitize.clean(frame({ vert: 'vert270' }, '<p>Premier</p>'));
      const mode = inPage(clean, host => getComputedStyle(host.querySelector('.pp-free-frame-content')).writingMode);
      return { pass: /data-ff-vert="vert270"/.test(clean) && mode === 'sideways-lr', notes: JSON.stringify({ mode, clean: clean.slice(0, 200) }) };
    },
  });

  cases.push({
    id: 'framevertical_pdf_turns_the_text_and_sticks_it_to_the_right_or_the_left',
    description: 'PDF relu par pdf.js : le texte d\'un cadre « vert » (200 x 300 pt) est plus haut que large, collé en haut à droite ; celui de « vert270 », plus haut que large, collé en bas à gauche ; un cadre à plat a son texte plus large que haut, en haut à gauche ; un cadre pivoté de 90° au texte « vert » (soit 180° en tout) a son texte horizontal, à l\'envers',
    run: async (h) => {
      const text = '<p style="font-size:20pt">Bonjour tout</p>';
      const out = await h.exportPdfContent(frame({ x: 40, y: 40, vert: 'vert' }, text) + frame({ x: 300, y: 40, vert: 'vert270' }, text) + frame({ x: 40, y: 400 , h: 100 }, text)
        + frame({ x: 300, y: 400, h: 100, w: 200, rot: 90, vert: 'vert' }, '<p style="font-size:20pt">Bonjour</p>'));
      const png = await renderPdfPage(out.base64);
      const down = png.bbox(40, 40, 240, 340);
      const up = png.bbox(300, 40, 500, 340);
      const flat = png.bbox(40, 400, 240, 500);
      const both = png.bbox(280, 345, 520, 580);
      const tall = b => !!b && (b.bottom - b.top) > 2 * (b.right - b.left);
      const pass = tall(down) && down.right > 40 + 200 - 20 && down.top < 40 + 20
        && tall(up) && up.left < 300 + 20 && up.bottom > 40 + 300 - 20
        && !!flat && (flat.right - flat.left) > 2 * (flat.bottom - flat.top) && flat.left < 40 + 20 && flat.top < 400 + 20
        && !!both && (both.right - both.left) > 2 * (both.bottom - both.top);
      return { pass, notes: JSON.stringify({ down, up, flat, both }) };
    },
  });

  cases.push({
    id: 'framevertical_word_writes_vert_on_the_body',
    description: 'Word (OOXML dézippé) : le corps d\'un cadre « vert » porte `vert="vert"`, celui d\'un « vert270 » `vert="vert270"`, celui d\'un cadre à plat aucun `vert`',
    run: async (h) => {
      const out = await h.exportDocxParts(frame({ vert: 'vert' }, '<p>Un</p>') + frame({ x: 100, y: 500, vert: 'vert270' }, '<p>Deux</p>') + frame({ x: 400, y: 80 }, '<p>Trois</p>'));
      const got = Array.from(out.doc.getElementsByTagName('wps:bodyPr')).map(b => b.getAttribute('vert'));
      return { pass: got.length === 3 && got[0] === 'vert' && got[1] === 'vert270' && got[2] === null, notes: JSON.stringify(got) };
    },
  });

  cases.push({
    id: 'framevertical_powerpoint_export_writes_vert_and_keeps_the_insets',
    description: 'PowerPoint exporté : `a:bodyPr` d\'un cadre « vert » porte `vert="vert"`, sans ajustement automatique (`a:noAutofit`), et garde ses marges d\'un cadre ordinaire (gauche et droite 91440, haut et bas 45720, quel que soit le sens) ; celui d\'un cadre à plat n\'a pas de `vert`',
    run: async () => {
      await ExportEngines.ensure('pptx');
      const blob = await PptxExport.fromHtml(frame({ x: 60, y: 60, vert: 'vert' }, '<p>Bas</p>') + frame({ x: 300, y: 60, vert: 'vert270' }, '<p>Haut</p>') + frame({ x: 60, y: 400, h: 100 }, '<p>Plat</p>'), { title: 'x' });
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const xml = await zip.file('ppt/slides/slide1.xml').async('string');
      const shapes = xml.match(/<p:sp>.*?<\/p:sp>/g) || [];
      const bodyOf = word => { const s = shapes.find(x => x.indexOf('>' + word + '<') >= 0) || ''; return { open: (s.match(/<a:bodyPr[^>]*>/) || [''])[0], fit: /<a:noAutofit\/>/.test(s) }; };
      const down = bodyOf('Bas');
      const up = bodyOf('Haut');
      const flat = bodyOf('Plat');
      const insets = '(?=[^>]*lIns="91440")(?=[^>]*tIns="45720")(?=[^>]*rIns="91440")(?=[^>]*bIns="45720")';
      const pass = new RegExp('<a:bodyPr' + insets + '[^>]*vert="vert"').test(down.open) && down.fit && new RegExp('<a:bodyPr' + insets + '[^>]*vert="vert270"').test(up.open) && up.fit
        && !/vert=/.test(flat.open) && !flat.fit;
      return { pass, notes: JSON.stringify({ down, up, flat }) };
    },
  });

  cases.push({
    id: 'framevertical_powerpoint_round_trip_keeps_the_turn',
    description: 'Un cadre « vert » et un cadre « vert270 » exportés puis relus par l\'import PowerPoint gardent leur orientation ; le rapport est vide',
    run: async () => {
      await ExportEngines.ensure('pptx');
      await ExportEngines.ensure('pptxImport');
      const blob = await PptxExport.fromHtml(frame({ x: 60, y: 60, vert: 'vert' }, '<p>Bas</p>') + frame({ x: 400, y: 60, vert: 'vert270' }, '<p>Haut</p>'), { title: 'x' });
      const r = await PptxImport.fromBuffer(await blob.arrayBuffer());
      const doc = new DOMParser().parseFromString('<body>' + r.html + '</body>', 'text/html').body;
      const got = Array.from(doc.querySelectorAll('.pp-free-frame')).map(el => FreeFrame.measuresOf(el).vert);
      return { pass: JSON.stringify(got.sort()) === JSON.stringify(['vert', 'vert270']) && r.report.length === 0, notes: JSON.stringify({ got, report: r.report }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.frameVertical = cases;
})();
