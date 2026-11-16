// PDF : la première ligne de base et le pas des lignes d'un gros texte (titre, paragraphe en grande taille) tombent là où l'éditeur les met, par rapport au texte courant.
// Avant : pdfmake posait le texte tout en haut de sa ligne (l'interligne en plus en dessous) avec le ratio de Roboto, donc un titre de 48 pt montait de 5 à 7 pt et un texte Arial avait un pas 5 % trop serré.
// Mesure : à l'écran, haut du premier mot + ascent de la police (même zoom) ; dans le PDF, `pdftotext` (pdf.js) sur le fichier réellement exporté. Le texte courant (10,5 pt) est, depuis toujours, posé 0,8 pt
// au-dessus de l'éditeur (les essais de citations, de listes, de cases et de traits partent de là) : l'écart d'un texte se lit donc par rapport à celui d'un paragraphe d'étalon, mesuré dans la même passe.
// Le navigateur arrondit ses lignes au pixel, et `fitLineBox` laisse sous 1,5 pt les écarts que les essais d'image et de titre (`imageText`, 0,6 pt) tolèrent : tolérance 1,5 pt.
(function () {
  const cases = [];
  const TOLERANCE = 1.5;

  async function blobBase64(blob) {
    const buf = new Uint8Array(await blob.arrayBuffer());
    let text = '';
    for (let i = 0; i < buf.length; i += 8192) text += String.fromCharCode.apply(null, buf.subarray(i, i + 8192));
    return btoa(text);
  }

  // { screen: [ligne de base de chaque ligne, en pt, depuis le haut du premier bloc], pdf: [idem depuis le haut de la zone de texte] }
  async function measure(h, html) {
    await h.resetEditor();
    document.getElementById('editor-container').classList.add('a4-preview');
    Editor.setHTML(html);
    await h.sleep(500);
    const dom = EditorCore.getEditor().view.dom;
    const zoom = EditorCore.layoutZoom(dom);
    const first = dom.firstElementChild;
    const top = first.getBoundingClientRect().top;
    const ctx = document.createElement('canvas').getContext('2d');
    const baselines = [];
    const walker = document.createTreeWalker(dom, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.nodeValue.trim()) continue;
      const cs = getComputedStyle(node.parentElement);
      ctx.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
      const ascent = ctx.measureText('x').fontBoundingBoxAscent;
      const range = document.createRange();
      range.setStart(node, 0);
      range.setEnd(node, node.nodeValue.length);
      Array.from(range.getClientRects()).forEach((rect) => {
        if (rect.width > 0) baselines.push(((rect.top + ascent * zoom) - top) / zoom * 0.75);
      });
    }
    const screen = Array.from(new Set(baselines.map(v => Math.round(v)))).sort((a, b) => a - b);
    const exact = [];
    baselines.sort((a, b) => a - b).forEach((v) => { if (!exact.length || v - exact[exact.length - 1] > 3) exact.push(v); });
    const result = await h.exportPdfContent(html, null, PageLayout.getMarginsPt());
    const truth = await h.extractPdfGroundTruth(await blobBase64(result.blob));
    const pageTop = result.docDefinition.pageMargins[1];
    const ys = Array.from(new Set(truth.pages[0].textItems.map(item => Math.round(item.y * 100) / 100))).sort((a, b) => a - b);
    return { screen: exact, pdf: ys.map(y => y - pageTop), screenRounded: screen };
  }

  const show = list => '[' + list.map(v => v.toFixed(2)).join(', ') + ']';

  // L'écart du texte courant (un paragraphe de 10,5 pt) : ce que le PDF a toujours eu, et que les gros textes ne doivent pas ajouter.
  async function bodyGap(h) {
    const m = await measure(h, '<p>Étalon</p>');
    return m.pdf[0] - m.screen[0];
  }

  function firstLineCase(id, description, html) {
    cases.push({
      id,
      description,
      run: async (h) => {
        const reference = await bodyGap(h);
        const m = await measure(h, html);
        const gap = m.pdf[0] - m.screen[0] - reference;
        return {
          pass: m.screen.length >= 1 && m.pdf.length >= 1 && Math.abs(gap) <= TOLERANCE,
          notes: 'ligne de base de la première ligne : écran ' + m.screen[0].toFixed(2) + ' pt, PDF ' + m.pdf[0].toFixed(2) + ' pt, écart ' + (m.pdf[0] - m.screen[0]).toFixed(2) + ' pt, moins celui du texte courant (' + reference.toFixed(2) + ') : ' + gap.toFixed(2) + ' pt (tolérance ' + TOLERANCE + ')',
        };
      },
    });
  }

  firstLineCase('first_baseline_paragraph_roboto_48pt', 'paragraphe de 48 pt (Roboto) : première ligne de base comme à l\'écran', '<p><span style="font-size: 48pt">Hxg</span></p>');
  firstLineCase('first_baseline_heading_1_roboto', 'titre 1 : première ligne de base comme à l\'écran', '<h1>Hxg</h1>');
  firstLineCase('first_baseline_heading_1_arial_48pt', 'titre 1 de 48 pt en Arial : première ligne de base comme à l\'écran', '<h1><span style="font-size: 48pt; font-family: Arial">Hxg</span></h1>');
  firstLineCase('first_baseline_paragraph_arial_48pt', 'paragraphe de 48 pt en Arial : première ligne de base comme à l\'écran', '<p><span style="font-size: 48pt; font-family: Arial">Hxg</span></p>');
  firstLineCase('first_baseline_paragraph_arial_48pt_tight', 'paragraphe de 48 pt en Arial, interligne 1,2 : première ligne de base comme à l\'écran', '<p data-line-height="1.2" style="line-height: 1.2"><span style="font-size: 48pt; font-family: Arial">Hxg</span></p>');
  firstLineCase('first_baseline_paragraph_arial_20pt', 'paragraphe de 20 pt en Arial : première ligne de base comme à l\'écran', '<p><span style="font-size: 20pt; font-family: Arial">Hxg</span></p>');
  firstLineCase('first_baseline_body_text_unchanged', 'texte courant de 10,5 pt : première ligne de base comme à l\'écran (pas de régression)', '<p>Hxg texte</p>');
  firstLineCase('first_baseline_mixed_sizes', 'petit mot puis gros mot sur la même ligne : la plus haute des deux fixe la ligne', '<p>petit <span style="font-size: 40pt; font-family: Arial">Gros</span> mot</p>');

  cases.push({
    id: 'line_pitch_arial_48pt_two_lines',
    description: 'deux lignes de 48 pt en Arial : même pas qu\'à l\'écran (le ratio de Roboto serrait de 5 %)',
    run: async (h) => {
      const m = await measure(h, '<p><span style="font-size: 48pt; font-family: Arial">Hxg<br>Hxg<br>Hxg</span></p>');
      const screenPitch = m.screen.length >= 3 ? (m.screen[2] - m.screen[0]) / 2 : NaN;
      const pdfPitch = m.pdf.length >= 3 ? (m.pdf[2] - m.pdf[0]) / 2 : NaN;
      return {
        pass: Math.abs(pdfPitch - screenPitch) <= 0.6,
        notes: 'pas entre deux lignes : écran ' + screenPitch.toFixed(2) + ' pt, PDF ' + pdfPitch.toFixed(2) + ' pt (écran ' + show(m.screen) + ', PDF ' + show(m.pdf) + ')',
      };
    },
  });

  cases.push({
    id: 'line_pitch_roboto_unchanged',
    description: 'deux lignes de 48 pt en Roboto : le pas était déjà juste, il le reste',
    run: async (h) => {
      const m = await measure(h, '<p><span style="font-size: 48pt">Hxg<br>Hxg<br>Hxg</span></p>');
      const screenPitch = m.screen.length >= 3 ? (m.screen[2] - m.screen[0]) / 2 : NaN;
      const pdfPitch = m.pdf.length >= 3 ? (m.pdf[2] - m.pdf[0]) / 2 : NaN;
      return {
        pass: Math.abs(pdfPitch - screenPitch) <= 0.6,
        notes: 'pas entre deux lignes : écran ' + screenPitch.toFixed(2) + ' pt, PDF ' + pdfPitch.toFixed(2) + ' pt',
      };
    },
  });

  cases.push({
    id: 'line_pitch_follows_the_paragraph_line_height_setting',
    description: 'un paragraphe réglé à 2,0 fois la ligne simple (data-line-height 2,344), en Arial comme en Roboto : le pas des lignes du PDF est celui de l\'éditeur (2,344 fois la taille)',
    run: async (h) => {
      const notes = [];
      let pass = true;
      for (const [label, style] of [['Roboto', ''], ['Arial', 'font-family: Arial']]) {
        const m = await measure(h, '<p data-line-height="2.344"><span style="font-size: 14pt; ' + style + '">Hxg<br>Hxg<br>Hxg</span></p>');
        const pitch = m.pdf.length >= 3 ? (m.pdf[2] - m.pdf[0]) / 2 : NaN;
        const expected = 14 * 2.344;
        if (!(Math.abs(pitch - expected) <= 0.6)) pass = false;
        notes.push(label + ' : pas ' + pitch.toFixed(2) + ' pt, attendu ' + expected.toFixed(2) + ' pt');
      }
      return { pass, notes: notes.join(' ; ') };
    },
  });

  cases.push({
    id: 'following_paragraph_stays_in_place',
    description: 'un gros titre ne déplace pas le paragraphe qui le suit (la hauteur du bloc ne change pas du fait de la ligne de base)',
    run: async (h) => {
      const m = await measure(h, '<h1><span style="font-size: 48pt; font-family: Arial">Hxg</span></h1><p>Hxg suite</p>');
      const reference = await bodyGap(h);
      const gap = m.pdf.length >= 2 && m.screen.length >= 2 ? m.pdf[1] - m.screen[1] - reference : NaN;
      return {
        pass: Math.abs(gap) <= TOLERANCE,
        notes: 'ligne de base du paragraphe suivant : écran ' + show(m.screen) + ', PDF ' + show(m.pdf) + ', écart ' + gap.toFixed(2) + ' pt',
      };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.pdfLargeText = cases;
})();
