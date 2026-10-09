// Suite "pdfLight" - la qualité « Léger » du bouton PDF : le PDF vectoriel dont les images sont ramenées à 150 points par pouce (ImageIo.lighten dans js/image-io.js, branché dans js/pdf-export.js).
// Demande d'Antoine du 09/10 : « un niveau Léger », puis « si pas de pdf en ultra hd, retirer les bouts de code en lien avec ça et pareil sur l'UI » : « Basse qualité » et « Ultra HD », grisées depuis
// que html2pdf.js était parti, ne sont plus dans le menu ni dans le code.
// Ce que la suite garde :
//  1) le menu « Qualité PDF » : trois lignes, toutes choisissables (Vectoriel, Impression navigateur, Léger), en français et en anglais ; plus aucune ligne grisée « bientôt » ;
//  2) le POIDS : une photo de 2400 x 1600 posée sur 360 px pèse près de 900 Ko dans le PDF par défaut et moins du dixième en « Léger » ; chaque image y garde ~150 ppi (ni moins, ni beaucoup plus) ;
//  3) la PAGE ne bouge pas : mêmes pages, mêmes textes (à 0,05 pt près) et mêmes rectangles d'image qu'en mode par défaut, pour une image dans le texte, dans une case de tableau, en calque et en en-tête ;
//  4) ce qui ne doit pas changer : le mode par défaut reprend toujours les images telles quelles (même juste après un « Léger »), une petite image, un code QR et la transparence d'un logo ;
//  5) un PNG opaque lourd (une photo) devient un JPEG ;
//  6) le moteur suit la qualité par ses deux entrées (un PDF, un lot : PdfExport.exportCurrentRecord et getNativePdfBlobForRecord). Le choix fait dans le menu atteint l'export d'une ligne et les
//     lots : groupe pdfBatch (cas pdfbatch_light_*).
// Le vrai clic sur la ligne du menu à 700 x 400 est dans dev-tests/verify-pdf-light-mouse.mjs.
(function () {
  const cases = [];
  const TOLERANCE_PT = 0.05;
  const PPI = 150;
  const bytesOf = uri => Math.floor(uri.length * 3 / 4);
  const typeOf = uri => uri.slice(5, uri.indexOf(';'));
  async function sizeOf(uri) {
    const image = await ImageIo.load(uri);
    return { width: image.naturalWidth, height: image.naturalHeight };
  }
  async function pixelOf(uri, x, y) {
    const image = await ImageIo.load(uri);
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    return Array.from(context.getImageData(x, y, 1, 1).data);
  }

  // Les images de la suite, faites une fois : une photo JPEG (3:2), la même en PNG, un logo à fond transparent, une petite image et une grande image qui joue le code QR (un `data-qr-text` la déclare).
  let made = null;
  const images = h => made || (made = {
    photo: h.makeImage(2400, 1600, { type: 'image/jpeg', quality: 0.92 }),
    photoPng: h.makeImage(1600, 1000),
    logo: h.makeImage(1200, 600, { logo: true }),
    small: h.makeImage(60, 60, { seed: 3 }),
    fakeQr: h.makeImage(900, 900, { seed: 5 }),
  });
  const img = (src, widthPx, extra) => '<img class="editor-image" src="' + src + '" alt="" style="width: ' + widthPx + 'px;"' + (extra || '') + '>';
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };
  const filler = (n, tag) => Array.from({ length: n }, (_, i) => '<p>' + tag + ' ' + (i + 1) + ' : un texte assez long pour remplir une ligne de la page du courrier, sans rien dire.</p>').join('');

  const exportNative = (h, html, hf) => h.exportPdfContent(html, hf || NO_HF, PageLayout.getMarginsPt());
  const exportLight = (h, html, hf) => h.exportPdfContent(html, hf || NO_HF, PageLayout.getMarginsPt(), null, undefined, 'light');
  // La data URI d'un bloc image : pdfmake range les images dans `docDefinition.images` et ne laisse qu'un nom dans le bloc.
  const sourceOf = (docDefinition, block) => (typeof block.image === 'string' && block.image.startsWith('data:') ? block.image : (docDefinition.images || {})[block.image]);
  // Le ppi d'une image du PDF : ses pixels divisés par sa largeur imprimée en pouces (le bloc pdfmake la dit en points, 72 au pouce).
  async function ppiOfBlock(docDefinition, block) {
    const size = await sizeOf(sourceOf(docDefinition, block));
    return size.width / (block.width / 72);
  }
  // Les écarts de page entre deux PDF relus par pdf.js : pages, textes (chaîne, position, largeur) et rectangles d'image, dans l'ordre de peinture.
  function geometryGaps(a, b) {
    const gaps = [];
    if (a.pages.length !== b.pages.length) return ['pages : ' + a.pages.length + ' / ' + b.pages.length];
    a.pages.forEach((page, p) => {
      const other = b.pages[p];
      const where = 'page ' + (p + 1);
      if (page.textItems.length !== other.textItems.length) gaps.push(where + ' : ' + page.textItems.length + ' textes / ' + other.textItems.length);
      else page.textItems.forEach((item, i) => {
        const o = other.textItems[i];
        if (item.str !== o.str || Math.abs(item.x - o.x) > TOLERANCE_PT || Math.abs(item.y - o.y) > TOLERANCE_PT || Math.abs(item.width - o.width) > TOLERANCE_PT) gaps.push(where + ' : texte « ' + item.str + ' » déplacé');
      });
      if (page.images.length !== other.images.length) gaps.push(where + ' : ' + page.images.length + ' images / ' + other.images.length);
      else page.images.forEach((image, i) => {
        const o = other.images[i];
        ['x', 'y', 'width', 'height'].forEach(key => { if (Math.abs(image[key] - o[key]) > TOLERANCE_PT) gaps.push(where + ' : image ' + (i + 1) + ', ' + key + ' ' + image[key].toFixed(2) + ' / ' + o[key].toFixed(2)); });
      });
    });
    return gaps;
  }

  cases.push({
    id: 'pdflight_menu_has_three_live_rows',
    description: 'Menu « Qualité PDF » : trois lignes (Vectoriel, Impression navigateur, Léger), toutes choisissables, nommées en français et en anglais ; plus de « Basse qualité » ni d\'« Ultra HD » ; un clic sur « Léger » la choisit',
    run: async () => {
      const select = document.getElementById('v2-pdf-quality');
      const flyout = document.getElementById('v2-quality-flyout');
      const options = Array.from(select.options);
      const rows = Array.from(flyout.querySelectorAll('.v2-hover-row[data-quality]'));
      const lang = I18n.getLang();
      const labels = {};
      try {
        ['fr', 'en'].forEach(code => {
          I18n.setLang(code);
          labels[code] = { options: options.map(o => o.textContent.trim()), rows: rows.map(r => r.textContent.trim()) };
        });
      } finally { I18n.setLang(lang); }
      const expected = { fr: ['Vectoriel (par défaut)', 'Impression navigateur', 'Léger (images réduites)'], en: ['Vector (default)', 'Browser print', 'Light (smaller images)'] };
      const values = options.map(o => o.value);
      const rowValues = rows.map(r => r.dataset.quality);
      const live = options.every(o => !o.disabled) && rows.every(r => !r.classList.contains('v2-hover-row-disabled') && r.getAttribute('aria-disabled') !== 'true');
      const wordsLeft = [labels.fr, labels.en].some(l => l.options.concat(l.rows).some(text => /ultra|basse|low quality|bientôt|soon/i.test(text)));
      const before = select.value;
      const light = rows.find(r => r.dataset.quality === 'light');
      let chosen = null;
      try {
        light.click();
        chosen = { value: select.value, active: flyout.querySelector('.v2-hover-row.is-active').dataset.quality };
      } finally { rows.find(r => r.dataset.quality === before).click(); }
      const pass = JSON.stringify(values) === JSON.stringify(['native', 'browser-print', 'light']) && JSON.stringify(rowValues) === JSON.stringify(values)
        && JSON.stringify(labels.fr.options) === JSON.stringify(expected.fr) && JSON.stringify(labels.fr.rows) === JSON.stringify(expected.fr)
        && JSON.stringify(labels.en.options) === JSON.stringify(expected.en) && JSON.stringify(labels.en.rows) === JSON.stringify(expected.en)
        && live && !wordsLeft && chosen && chosen.value === 'light' && chosen.active === 'light' && select.value === before;
      return { pass, notes: JSON.stringify({ values, rowValues, labels, live, wordsLeft, chosen }) };
    },
  });

  cases.push({
    id: 'pdflight_light_images_weigh_a_fraction_and_keep_150_ppi',
    description: '« Léger » : une photo JPEG de 2400 x 1600 posée sur 360 px et un logo posé sur 120 px sortent à ~150 ppi, le PDF pèse moins du dixième du PDF par défaut',
    run: async (h) => {
      const m = images(h);
      const html = '<p>Un courrier avec une photo.</p><p>' + img(m.photo, 360) + '</p><p>Et le logo de l\'association.</p><p>' + img(m.logo, 120) + '</p>';
      const native = await exportNative(h, html);
      const light = await exportLight(h, html);
      const nativeImages = h.findImages(native.content);
      const lightImages = h.findImages(light.content);
      const ppis = await Promise.all(lightImages.map(block => ppiOfBlock(light.docDefinition, block)));
      const pass = nativeImages.length === 2 && lightImages.length === 2 && native.blob.size > 800 * 1024 && light.blob.size < native.blob.size * 0.1
        && ppis.every(ppi => ppi >= PPI && ppi < PPI + 8);
      return { pass, notes: JSON.stringify({ native: native.blob.size, light: light.blob.size, ppis: ppis.map(ppi => Math.round(ppi * 10) / 10) }) };
    },
  });

  cases.push({
    id: 'pdflight_default_mode_embeds_images_as_they_are',
    description: 'Le PDF par défaut reprend toujours les images telles quelles (même chaîne), même juste après un export « Léger » (rien ne reste de la qualité précédente)',
    run: async (h) => {
      const m = images(h);
      const html = '<p>Une photo.</p><p>' + img(m.photo, 360) + '</p>';
      const light = await exportLight(h, html);
      const native = await exportNative(h, html);
      const lightBlocks = h.findImages(light.content);
      const nativeBlocks = h.findImages(native.content);
      const lightKept = lightBlocks.length === 1 && sourceOf(light.docDefinition, lightBlocks[0]) === m.photo;
      const nativeKept = nativeBlocks.length === 1 && sourceOf(native.docDefinition, nativeBlocks[0]) === m.photo;
      return { pass: lightBlocks.length === 1 && !lightKept && nativeKept, notes: JSON.stringify({ lightKept, nativeKept }) };
    },
  });

  cases.push({
    id: 'pdflight_page_does_not_move',
    description: '« Léger » ne change que le poids : mêmes pages, mêmes textes et mêmes rectangles d\'image (à 0,05 pt) que le PDF par défaut, pour une image dans le texte, dans une case de tableau, en calque, et en en-tête',
    run: async (h) => {
      const m = images(h);
      const layered = img(m.logo, 100, ' data-layer="front" data-wrap="inline"').replace('width: 100px;', 'width: 100px; position: absolute; left: 300px; top: 60px; z-index: 5;');
      const html = '<h1>Courrier</h1><p>Début du courrier, la photo juste dessous.</p><p>' + img(m.photo, 360) + '</p><p>Texte après la photo, puis un tableau.</p>'
        + '<table><tbody><tr><td><p>Le logo</p></td><td><p>' + img(m.logo, 120) + '</p></td></tr></tbody></table>'
        + '<p>Texte avec une image en calque.' + layered + '</p>' + filler(34, 'Ligne') + '<p>' + img(m.photo, 300) + '</p><p>Fin du courrier.</p>';
      const hf = { enabled: true, differentFirstPage: false, header: { default: '<p>En-tête ' + img(m.photo, 90) + '</p>', first: '' }, footer: { default: '<p>Pied de page</p>', first: '' } };
      const native = await exportNative(h, html, hf);
      const light = await exportLight(h, html, hf);
      const a = await h.extractPdfGroundTruth(native.base64);
      const b = await h.extractPdfGroundTruth(light.base64);
      const gaps = geometryGaps(a, b);
      const paintedImages = a.pages.reduce((sum, page) => sum + page.images.length, 0);
      const pass = gaps.length === 0 && a.pages.length >= 2 && paintedImages >= 5 && light.blob.size < native.blob.size * 0.2;
      return { pass, notes: JSON.stringify({ pages: [a.pages.length, b.pages.length], paintedImages, native: native.blob.size, light: light.blob.size, gaps: gaps.slice(0, 6) }) };
    },
  });

  cases.push({
    id: 'pdflight_png_photo_becomes_jpeg_and_logo_keeps_its_transparency',
    description: '« Léger » : une photo PNG opaque devient un JPEG réduit à sa boîte ; un logo à fond transparent reste un PNG réduit dont le coin est toujours transparent',
    run: async (h) => {
      const m = images(h);
      const html = '<p>Une photo en PNG.</p><p>' + img(m.photoPng, 400) + '</p><p>Un logo transparent.</p><p>' + img(m.logo, 120) + '</p>';
      const light = await exportLight(h, html);
      const [photoBlock, logoBlock] = h.findImages(light.content);
      const photo = sourceOf(light.docDefinition, photoBlock);
      const logo = sourceOf(light.docDefinition, logoBlock);
      const photoSize = await sizeOf(photo);
      const logoSize = await sizeOf(logo);
      const corner = await pixelOf(logo, 0, 0);
      const centre = await pixelOf(logo, logoSize.width >> 1, logoSize.height >> 1);
      const pass = typeOf(photo) === 'image/jpeg' && photoSize.width >= 625 && photoSize.width < 640 && bytesOf(photo) < bytesOf(m.photoPng) * 0.05
        && typeOf(logo) === 'image/png' && logoSize.width >= 188 && logoSize.width < 200 && corner[3] === 0 && centre[3] === 255 && Math.abs(centre[0] - 200) <= 4;
      return { pass, notes: JSON.stringify({ photo: [typeOf(photo), photoSize, bytesOf(photo)], logo: [typeOf(logo), logoSize, corner, centre] }) };
    },
  });

  cases.push({
    id: 'pdflight_small_images_and_qr_codes_are_untouched',
    description: '« Léger » laisse telles quelles une petite image qui tient dans sa boîte et une image de code QR (`data-qr-text`), même grande : adoucir ses modules la rendrait plus dure à lire ; la photo à côté, elle, est allégée',
    run: async (h) => {
      const m = images(h);
      const html = '<p>Une petite image.</p><p>' + img(m.small, 60) + '</p><p>Un code QR.</p><p>' + img(m.fakeQr, 60, ' data-qr-text="https://exemple.org/lettre"') + '</p><p>Une photo.</p><p>' + img(m.photo, 360) + '</p>';
      const light = await exportLight(h, html);
      const [smallBlock, qrBlock, photoBlock] = h.findImages(light.content);
      const [small, qr, photo] = [smallBlock, qrBlock, photoBlock].map(block => block && sourceOf(light.docDefinition, block));
      const pass = !!small && !!qr && !!photo && small === m.small && qr === m.fakeQr && photo !== m.photo && bytesOf(photo) < bytesOf(m.photo) * 0.1;
      return { pass, notes: JSON.stringify({ smallKept: small === m.small, qrKept: qr === m.fakeQr, photoBytes: photo ? bytesOf(photo) : null }) };
    },
  });

  cases.push({
    id: 'pdflight_header_images_are_lightened_too',
    description: '« Léger » allège aussi les images de l\'en-tête et du pied (une photo en en-tête de 200 px), sans déplacer l\'en-tête ni le corps',
    run: async (h) => {
      const m = images(h);
      const hf = { enabled: true, differentFirstPage: false, header: { default: '<p>' + img(m.photo, 200) + '</p>', first: '' }, footer: { default: '<p>Pied de page</p>', first: '' } };
      const html = '<p>Le corps du courrier.</p>' + filler(6, 'Corps');
      const native = await exportNative(h, html, hf);
      const light = await exportLight(h, html, hf);
      const gaps = geometryGaps(await h.extractPdfGroundTruth(native.base64), await h.extractPdfGroundTruth(light.base64));
      const pass = native.blob.size > 800 * 1024 && light.blob.size < native.blob.size * 0.1 && gaps.length === 0;
      return { pass, notes: JSON.stringify({ native: native.blob.size, light: light.blob.size, gaps: gaps.slice(0, 4) }) };
    },
  });

  // L'export d'une ligne (exportCurrentRecord) passe par la même préparation que celle d'un lot (getNativePdfBlobForRecord) : les deux entrées du moteur suivent la qualité reçue.
  cases.push({
    id: 'pdflight_both_engine_entries_follow_the_quality',
    description: 'PdfExport.exportCurrentRecord (le PDF d\'une ligne) et getNativePdfBlobForRecord (un lot) allègent les images quand la qualité reçue est « light », et les reprennent telles quelles sinon',
    run: async (h) => {
      const m = images(h);
      const html = '<p>Une photo.</p><p>' + img(m.photo, 360) + '</p>';
      await PdfExport.ensurePdfLibsLoaded();
      const original = window.pdfMake.createPdf;
      let captured = null;
      window.pdfMake.createPdf = function (docDefinition) {
        captured = docDefinition;
        const generator = original.call(window.pdfMake, docDefinition);
        generator.download = function () {};
        return generator;
      };
      const single = {};
      try {
        for (const quality of ['light', 'native', undefined]) {
          await PdfExport.exportCurrentRecord(html, null, { id: 1 }, '', null, PageLayout.getMarginsPt(), undefined, quality);
          single[String(quality)] = h.findImages(captured.content).map(block => sourceOf(captured, block) === m.photo ? 'as-is' : 'lightened');
        }
      } finally { window.pdfMake.createPdf = original; }
      const batch = {};
      for (const quality of ['light', 'native', undefined]) {
        const { blob } = await PdfExport.getNativePdfBlobForRecord(html, null, { id: 1 }, '', null, PageLayout.getMarginsPt(), undefined, quality);
        batch[String(quality)] = blob.size;
      }
      const pass = JSON.stringify(single) === JSON.stringify({ light: ['lightened'], native: ['as-is'], undefined: ['as-is'] })
        && batch.light < batch.native * 0.1 && Math.abs(batch.native - batch.undefined) < 2048;
      return { pass, notes: JSON.stringify({ single, batch }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.pdfLight = cases;
})();
