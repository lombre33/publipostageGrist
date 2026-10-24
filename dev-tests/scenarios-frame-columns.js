// Suite "frameColumns" - les COLONNES DE TEXTE d'un cadre ou d'une forme d'une présentation (js/free-frame.js, css/free-frame.css, js/pdf-export.js, js/docx-export.js, js/pptx-export.js, js/pptx-import.js),
// lot 9f du chantier 9 « Caractères et puces » du plan « Import PowerPoint sans perte » (`a:bodyPr numCol` et `spcCol`) :
//  1) le MODÈLE : un entier de 2 à 16 (moins de deux : une seule colonne), l'écart de 0 à 200 pt (18 pt par défaut), une ligne n'en a pas ; l'aller-retour du HTML ;
//  2) le DESSIN : le CSS met le texte en colonnes ;
//  3) les SORTIES : le PDF relu par pdf.js (le texte de la 2e colonne est bien à droite), le Word et le PowerPoint dézippés (`numCol`, `spcCol`), puis le PowerPoint relu.
// Le réglage à la vraie souris (le bouton « Colonnes » de la barre flottante, son menu et son historique à 700x400) est dans dev-tests/verify-frame-columns.mjs ; la lecture d'un fichier PowerPoint
// est dans dev-tests/scenarios-pptx-import.js.
(function () {
  const cases = [];
  const frame = (look, inner) => FreeFrame.html(Object.assign({ x: 100, y: 80, w: 300, h: 160 }, look), inner === undefined ? '<p>Texte</p>' : inner);
  const readBack = html => FreeFrame.measuresOf(new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html').body.firstElementChild);
  const WORDS = Array.from({ length: 24 }, (_, i) => '<p>Ligne ' + (i + 1) + '</p>').join('');

  // Le HTML posé dans la page, hors de l'éditeur, le temps de lire ce que le CSS en fait.
  function inPage(html, read) {
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:0;top:0;width:800px;--pp-margin-left:0px;--pp-margin-top:0px;--pp-top-band:0px;--pp-page-width:100000px;--pp-page-height:100000px';
    host.innerHTML = html;
    document.body.appendChild(host);
    try { return read(host); } finally { host.remove(); }
  }

  // Les pixels d'une page de PDF rendue par pdf.js : l'encre sombre comptée dans un rectangle (pt depuis le haut-gauche).
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
      ink: (x0, y0, x1, y1) => {
        const data = ctx.getImageData(Math.round(x0 * scale), Math.round(y0 * scale), Math.max(1, Math.round((x1 - x0) * scale)), Math.max(1, Math.round((y1 - y0) * scale))).data;
        let n = 0;
        for (let i = 0; i < data.length; i += 4) if (data[i] < 110 && data[i + 1] < 110 && data[i + 2] < 110) n++;
        return n;
      },
    };
  }

  cases.push({
    id: 'framecolumns_the_model_bounds_the_number_and_the_gap_and_round_trips_the_html',
    description: 'Le nombre de colonnes est un entier de 2 à 16 (une valeur plus petite, absente ou illisible : une colonne, 0), l\'écart va de 0 à 200 pt (18 par défaut, jamais écrit tant qu\'il est le défaut) ; une ligne n\'a pas de colonnes ; le HTML écrit puis relu garde les deux ; un cadre sans colonnes s\'écrit comme avant (aucun attribut)',
    run: async () => {
      const cols = raw => FreeFrame.normalized({ x: 0, y: 0, w: 200, h: 100, cols: raw }).cols;
      const bounds = [cols(3), cols(2.4), cols(1), cols(0), cols(-4), cols('x'), cols(40), cols(undefined)];
      const gapOf = raw => FreeFrame.normalized({ x: 0, y: 0, w: 200, h: 100, cols: 2, colGap: raw }).colGap;
      const gaps = [gapOf(undefined), gapOf(0), gapOf(30.456), gapOf(900), gapOf(-5)];
      const line = FreeFrame.normalized({ x: 0, y: 0, w: 200, h: 0, shape: 'line', cols: 3 }).cols;
      const plain = frame({}, '<p>Un</p>');
      const three = frame({ cols: 3 }, '<p>Un</p>');
      const spaced = frame({ cols: 2, colGap: 30 }, '<p>Un</p>');
      const back = [readBack(three), readBack(spaced), readBack(plain)].map(f => [f.cols, f.colGap]);
      const want = [[3, 18], [2, 30], [0, 0]];
      const pass = JSON.stringify(bounds) === JSON.stringify([3, 2, 0, 0, 0, 0, 16, 0]) && JSON.stringify(gaps) === JSON.stringify([18, 0, 30.46, 200, 0])
        && line === 0 && !/data-ff-col/.test(plain) && /data-ff-cols="3"/.test(three) && !/data-ff-col-gap/.test(three) && /data-ff-col-gap="30"/.test(spaced)
        && JSON.stringify(back) === JSON.stringify(want);
      return { pass, notes: JSON.stringify({ bounds, gaps, line, back }) };
    },
  });

  cases.push({
    id: 'framecolumns_the_css_flows_the_text_into_columns_with_the_gap',
    description: 'Le texte d\'un cadre à trois colonnes est en colonnes (`column-count` 3, l\'écart en points) : ses derniers paragraphes sont à droite des premiers et le cadre est plus bas que large ; un cadre sans colonnes les met l\'un sous l\'autre',
    run: async () => {
      const read = html => inPage(html, (host) => {
        const content = host.querySelector('.pp-free-frame-content');
        const items = content.querySelectorAll('p');
        const first = items[0].getBoundingClientRect();
        const last = items[items.length - 1].getBoundingClientRect();
        const style = getComputedStyle(content);
        return { count: style.columnCount, gap: style.columnGap, lastRight: last.left > first.left + 20, sameTop: Math.abs(last.top - first.top) < first.height * 24 };
      });
      const three = read(frame({ w: 480, h: 120, cols: 3, colGap: 24 }, WORDS));
      const one = read(frame({ w: 480, h: 120 }, WORDS));
      const pass = three.count === '3' && three.gap === '32px' && three.lastRight && one.count === 'auto' && !one.lastRight;
      return { pass, notes: JSON.stringify({ three, one }) };
    },
  });

  cases.push({
    id: 'framecolumns_the_reading_sanitizer_keeps_the_columns',
    description: 'Lecture, miniatures et aperçus passent leur HTML par HtmlSanitize.clean : les attributs `data-ff-cols` et `data-ff-col-gap` et les variables `--ff-cols` et `--ff-col-gap` du cadre y passent, le texte reste en colonnes une fois nettoyé',
    run: async () => {
      const clean = HtmlSanitize.clean(frame({ w: 480, cols: 3, colGap: 24 }, WORDS));
      const kept = /data-ff-cols="3"/.test(clean) && /data-ff-col-gap="24"/.test(clean) && /--ff-cols:\s*3/.test(clean) && /--ff-col-gap:\s*24pt/.test(clean);
      const columns = inPage(clean, host => getComputedStyle(host.querySelector('.pp-free-frame-content')).columnCount);
      return { pass: kept && columns === '3', notes: JSON.stringify({ kept, columns, clean: clean.slice(0, 300) }) };
    },
  });

  cases.push({
    id: 'framecolumns_pdf_lays_the_text_out_in_columns',
    description: 'PDF relu par pdf.js : le texte d\'un cadre de 400 pt de large à deux colonnes remplit les deux moitiés du cadre (la 2e colonne est à droite, en haut) alors que le même texte sans colonnes n\'a rien dans la moitié droite ',
    run: async (h) => {
      const short = Array.from({ length: 10 }, (_, i) => '<p>Mot ' + (i + 1) + '</p>').join('');
      const out = await h.exportPdfContent(
        frame({ x: 40, y: 40, w: 400, h: 400, cols: 2, colGap: 20 }, short) + frame({ x: 40, y: 500, w: 400, h: 200 }, short));
      const png = await renderPdfPage(out.base64);
      const columns = { left: png.ink(40, 40, 230, 440), right: png.ink(250, 40, 440, 440) };
      const plain = { left: png.ink(40, 500, 230, 700), right: png.ink(250, 500, 440, 700) };
      const pass = columns.left > 50 && columns.right > 50 && plain.left > 50 && plain.right === 0;
      return { pass, notes: JSON.stringify({ columns, plain }) };
    },
  });

  // Les mots d'une page de PDF (pdf.js) : leur texte et leur place, en points depuis le haut de la page.
  async function pdfWords(base64) {
    await TestHelpers.ensurePdfJsLoaded();
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
    const page = await pdf.getPage(1);
    const height = page.getViewport({ scale: 1 }).height;
    const content = await page.getTextContent();
    return content.items.filter(item => item.str.trim()).map(item => ({ str: item.str, x: item.transform[4], y: height - item.transform[5] }));
  }

  cases.push({
    id: 'framecolumns_pdf_keeps_the_footnotes_of_a_frame_with_columns',
    description: 'PDF relu par pdf.js : un cadre à deux colonnes (ou à texte tourné, ou pivoté) dont le texte porte une note de bas de page garde le numéro « 1 » près de son texte et la note elle-même en bas de la page',
    run: async (h) => {
      const note = '<sup class="footnote-ref-marker" data-note-id="n1" data-note-text="Texte de la note du bas"></sup>';
      const text = '<p>Debut' + note + ' fin</p>';
      const cases = { columns: { cols: 2 }, turned: { vert: 'vert' }, rotated: { rot: 20 } };
      const got = {};
      for (const name of Object.keys(cases)) {
        const out = await h.exportPdfContent(frame(Object.assign({ x: 60, y: 60, w: 400, h: 200 }, cases[name]), text));
        const words = await pdfWords(out.base64);
        const number = words.find(w => w.str.trim() === '1' && w.y < 400);
        const foot = words.find(w => w.str === 'Texte');
        got[name] = { number: !!number, foot: foot ? Math.round(foot.y) : null };
      }
      const pass = Object.keys(got).every(name => got[name].number && got[name].foot !== null && got[name].foot > 500);
      return { pass, notes: JSON.stringify(got) };
    },
  });

  cases.push({
    id: 'framecolumns_pdf_keeps_the_table_borders_of_a_frame_with_columns',
    description: 'PDF relu par pdf.js : un tableau dans un cadre à deux colonnes garde ses bordures (les traits de ses cases sont dessinés : bien plus d\'encre que le même tableau sans bordure) ; la bordure d\'une citation reste dessinée à gauche',
    run: async (h) => {
      const table = border => '<table><tbody><tr><td style="' + border + '"><p>A</p></td><td style="' + border + '"><p>B</p></td></tr><tr><td style="' + border + '"><p>C</p></td><td style="' + border + '"><p>D</p></td></tr></tbody></table>';
      const inkOf = async (html) => {
        const out = await h.exportPdfContent(frame({ x: 40, y: 40, w: 400, h: 200, cols: 2 }, html));
        const png = await renderPdfPage(out.base64);
        return png.ink(40, 40, 440, 240);
      };
      const bordered = await inkOf(table('border: 2px solid #000000'));
      const bare = await inkOf(table('border: none'));
      const quote = await inkOf('<blockquote style="border-left: 4px solid #000000; padding-left: 8px"><p> </p></blockquote>');
      return { pass: bordered > bare + 2000 && quote > 20, notes: JSON.stringify({ bordered, bare, quote }) };
    },
  });

  cases.push({
    id: 'framecolumns_word_writes_numcol_and_spccol_on_the_body',
    description: 'Word (OOXML dézippé) : le corps d\'un cadre à trois colonnes espacées de 24 pt porte `numCol="3"` et `spcCol="304800"` (EMU) sur `wps:bodyPr` ; un cadre sans colonnes ne porte ni l\'un ni l\'autre',
    run: async (h) => {
      const out = await h.exportDocxParts(frame({ cols: 3, colGap: 24 }, '<p>Un</p>') + frame({ x: 100, y: 400 }, '<p>Deux</p>'));
      const bodies = Array.from(out.doc.getElementsByTagName('wps:bodyPr'));
      const got = bodies.map(b => [b.getAttribute('numCol'), b.getAttribute('spcCol')]);
      const pass = bodies.length === 2 && got[0][0] === '3' && got[0][1] === '304800' && got[1][0] === null && got[1][1] === null;
      return { pass, notes: JSON.stringify(got) };
    },
  });

  cases.push({
    id: 'framecolumns_powerpoint_export_writes_numcol_and_spccol',
    description: 'PowerPoint exporté : `a:bodyPr` d\'un cadre à deux colonnes de 18 pt porte `numCol="2"` et `spcCol="228600"`, celui d\'un cadre sans colonnes ni l\'un ni l\'autre ; les paragraphes de la 2e colonne gardent leur retrait depuis le bord de leur colonne (le texte exporté n\'a pas de retrait fantôme de la largeur d\'une colonne)',
    run: async () => {
      await ExportEngines.ensure('pptx');
      const html = frame({ x: 60, y: 60, w: 400, h: 120, cols: 2 }, WORDS) + frame({ x: 60, y: 300, w: 400, h: 120 }, '<p>Sans</p>');
      const blob = await PptxExport.fromHtml(html, { title: 'x' });
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const xml = await zip.file('ppt/slides/slide1.xml').async('string');
      const shapes = xml.match(/<p:sp>.*?<\/p:sp>/g) || [];
      const bodyOf = text => ((shapes.find(s => text.test(s)) || '').match(/<a:bodyPr[^>]*>/) || [''])[0];
      const first = bodyOf(/Ligne 1</);
      const second = bodyOf(/Sans</);
      const margins = (shapes.find(s => /Ligne 1</.test(s)) || '').match(/<a:pPr[^>]*marL="(\d+)"/g) || [];
      const pass = /numCol="2"/.test(first) && /spcCol="228600"/.test(first) && !/numCol|spcCol/.test(second) && margins.every(m => /marL="0"/.test(m));
      return { pass, notes: JSON.stringify({ first, second, margins: margins.slice(0, 3) }) };
    },
  });

  cases.push({
    id: 'framecolumns_powerpoint_round_trip_keeps_the_columns',
    description: 'Un cadre à trois colonnes espacées de 30 pt exporté puis relu par l\'import PowerPoint garde ses trois colonnes et l\'écart ; le rapport est vide',
    run: async () => {
      await ExportEngines.ensure('pptx');
      await ExportEngines.ensure('pptxImport');
      const blob = await PptxExport.fromHtml(frame({ x: 60, y: 60, w: 480, h: 160, cols: 3, colGap: 30 }, WORDS), { title: 'x' });
      const r = await PptxImport.fromBuffer(await blob.arrayBuffer());
      const doc = new DOMParser().parseFromString('<body>' + r.html + '</body>', 'text/html').body;
      const back = Array.from(doc.querySelectorAll('.pp-free-frame')).map(el => FreeFrame.measuresOf(el)).find(f => f.cols);
      const pass = !!back && back.cols === 3 && Math.abs(back.colGap - 30) < 0.6 && r.report.length === 0;
      return { pass, notes: JSON.stringify({ cols: back && back.cols, gap: back && back.colGap, report: r.report }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.frameColumns = cases;
})();
