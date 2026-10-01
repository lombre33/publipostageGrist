// Images trop larges : le PDF et le Word montrent une image du texte à la largeur que lui donne l'éditeur (01/10, carte « Ramener à la page les images trop larges dans le PDF
// et le Word ? » d'Antoine : « logique de WYSIWYG, si ça dépend en éditeur ça dépasse partout sinon nulle part »).
//
// L'éditeur ramène une image dans le texte à la largeur de ce qui la contient (page, case de tableau, colonne) : `.tiptap img.editor-image { max-width: 100% }`, les proportions
// restent (`height: auto`). La Lecture fait de même. Le PDF et le Word, eux, prenaient la largeur RÉGLÉE (le style de l'image) : une image réglée à 900 px sortait à 675 pt dans une
// page de 539 pt, centrée elle partait à -40 pt, dans une case de 187 px elle sortait à 525 pt (mesure du 01/10, /mnt/project-files/images-position/ecarts-mesures.md, ligne 9).
//
// Chaque cas monte le document dans le VRAI éditeur (Aperçu A4), lit la largeur que l'éditeur donne à l'image (c'est la référence), puis exporte le HTML enregistré et lit la
// taille PEINTE : dans le PDF (pdf.js sur les octets) et dans le Word (word/document.xml du .docx généré), jamais les objets pdfmake / docx.js intermédiaires.
window.EditorTestSuites = window.EditorTestSuites || {};
window.EditorTestSuites.imageWide = (function () {
  const cases = [];
  const PX_TO_PT = 0.75;
  // Image 2:1 (200 x 100) : si seule la largeur était ramenée, le rapport hauteur / largeur changerait et les cas le verraient.
  const PNG = (() => {
    const canvas = document.createElement('canvas');
    canvas.width = 200; canvas.height = 100;
    const g = canvas.getContext('2d');
    g.fillStyle = '#c33'; g.fillRect(0, 0, 200, 100);
    g.fillStyle = '#fff'; g.fillRect(10, 10, 80, 80);
    return canvas.toDataURL('image/png');
  })();
  const img = (widthPx, extra) => `<img class="editor-image" src="${PNG}" alt="Image"${extra || ''} style="width: ${widthPx}px">`;
  const zone = (left, right) => '<div class="two-columns-zone" style="--layout-left: 50%"><div class="two-columns-column">' + left + '</div><div class="two-columns-column">' + right + '</div></div>';

  async function setup(h, orientation, format) {
    await h.resetEditor();
    PageLayout.setMarginsMm(null);
    PageLayout.setFormat(format || 'A4');
    PageLayout.setOrientation(orientation || 'portrait');
    h.setA4Preview(true);
    await h.sleep(250);
  }
  async function restorePage(h) {
    PageLayout.setFormat('A4');
    PageLayout.setOrientation('portrait');
    PageLayout.setMarginsMm(null);
    await h.resetEditor();
  }

  // Le HTML tel que le modèle l'enregistre + la largeur que l'éditeur donne à la première image (la référence).
  async function loadInEditor(h, html) {
    Editor.setHTML(html);
    await h.sleep(350);
    const image = h.tiptap().querySelector('img.editor-image');
    const box = image ? image.getBoundingClientRect() : null;
    return { saved: Editor.getHTML(), editorPx: box ? box.width : null, editorHeightPx: box ? box.height : null };
  }

  // Page, marges et zone de texte telles que l'export les voit.
  async function pdfOf(h, saved) {
    const result = await h.exportPdfContent(saved, null, PageLayout.getMarginsPt());
    const gt = await h.extractPdfGroundTruth(result.base64);
    const margins = PageLayout.getMarginsPt();
    const page = gt.pages[0];
    return { gt, page, left: margins.left, right: page.width - margins.right, images: gt.pages.reduce((all, p, i) => all.concat(p.images.map(im => Object.assign({ page: i + 1 }, im))), []) };
  }
  async function wordOf(h, saved) {
    const parts = await h.exportDocxParts(saved, null, PageLayout.getMarginsTwip());
    const section = h.docxSectionProps(parts.doc);
    return { drawings: h.docxDrawings(parts.doc), contentWidthPt: (section.widthTwip - section.margins.left - section.margins.right) / 20 };
  }

  const near = (a, b, tolerance) => Math.abs(a - b) <= tolerance;
  const fmt = n => (typeof n === 'number' ? +n.toFixed(1) : n);

  // Une image dans le texte : la référence est l'éditeur ; le PDF et le Word la reprennent à 1 pt près, proportions gardées, et rien ne sort des marges.
  async function checkBothExports(h, html, label, { mustBeReduced = true, centered = false } = {}) {
    const problems = [];
    const ref = await loadInEditor(h, html);
    if (!ref.editorPx) return { pass: false, notes: 'aucune image dans l\'éditeur : ' + label };
    const expectedPt = ref.editorPx * PX_TO_PT;
    const styleWidthPx = parseFloat((ref.saved.match(/<img[^>]*style="[^"]*width:\s*([\d.]+)px/) || [])[1]);
    if (mustBeReduced && !(ref.editorPx < styleWidthPx - 1)) problems.push('le cas ne reproduit pas une image trop large : réglée ' + styleWidthPx + ' px, montrée ' + fmt(ref.editorPx) + ' px par l\'éditeur');
    const pdf = await pdfOf(h, ref.saved);
    if (pdf.images.length !== 1) problems.push('PDF : ' + pdf.images.length + ' image(s) peinte(s) au lieu d\'une');
    else {
      const im = pdf.images[0];
      if (!near(im.width, expectedPt, 1)) problems.push('PDF : image peinte à ' + fmt(im.width) + ' pt, l\'éditeur la montre à ' + fmt(expectedPt) + ' pt (' + fmt(ref.editorPx) + ' px)');
      if (!near(im.height, im.width / 2, 1)) problems.push('PDF : proportions changées, ' + fmt(im.width) + ' x ' + fmt(im.height) + ' pt pour une image 2:1');
      if (im.x < pdf.left - 0.5 || im.x + im.width > pdf.right + 0.5) problems.push('PDF : l\'image sort des marges (x ' + fmt(im.x) + ' à ' + fmt(im.x + im.width) + ' pt, marges ' + fmt(pdf.left) + ' à ' + fmt(pdf.right) + ')');
      if (centered && !near(im.x + im.width / 2, (pdf.left + pdf.right) / 2, 1)) problems.push('PDF : l\'image centrée n\'est pas au milieu de la zone de texte (' + fmt(im.x + im.width / 2) + ' pt)');
    }
    const word = await wordOf(h, ref.saved);
    if (word.drawings.length !== 1) problems.push('Word : ' + word.drawings.length + ' dessin(s) au lieu d\'un');
    else {
      const d = word.drawings[0];
      if (!near(d.widthPt, expectedPt, 1.5)) problems.push('Word : image à ' + fmt(d.widthPt) + ' pt, l\'éditeur la montre à ' + fmt(expectedPt) + ' pt (' + fmt(ref.editorPx) + ' px)');
      if (!near(d.heightPt, d.widthPt / 2, 1.5)) problems.push('Word : proportions changées, ' + fmt(d.widthPt) + ' x ' + fmt(d.heightPt) + ' pt pour une image 2:1');
      if (d.widthPt > word.contentWidthPt + 1) problems.push('Word : l\'image (' + fmt(d.widthPt) + ' pt) est plus large que la zone de texte (' + fmt(word.contentWidthPt) + ' pt)');
    }
    return { pass: problems.length === 0, notes: JSON.stringify({ problems, editorPx: fmt(ref.editorPx), styleWidthPx, pdf: pdf.images.map(i => ({ x: fmt(i.x), w: fmt(i.width), h: fmt(i.height) })), word: word.drawings.map(d => ({ kind: d.kind, w: fmt(d.widthPt), h: fmt(d.heightPt) })), contentWidthPt: fmt(word.contentWidthPt) }) };
  }

  cases.push({
    id: 'imgwide_body_image_wider_than_the_text_area_is_brought_back_to_it_in_pdf_and_word',
    description: 'Une image réglée à 900 px dans le texte (zone de texte de 719 px) : l\'éditeur la montre à 719 px, le PDF et le Word la dessinent à la même largeur (539 pt), proportions gardées, dans les marges',
    run: async (h) => {
      try {
        await setup(h);
        return await checkBothExports(h, '<p>Avant</p><p>' + img(900) + '</p><p>Après</p>', 'corps');
      } finally { await restorePage(h); }
    },
  });

  cases.push({
    id: 'imgwide_image_in_a_table_cell_is_brought_back_to_the_cell',
    description: 'Une image réglée à 700 px dans une case de tableau de 200 px : l\'éditeur la montre à la largeur de la case (187 px), le PDF et le Word aussi (140 pt), pas à 525 pt',
    run: async (h) => {
      try {
        await setup(h);
        const html = '<table><tbody><tr><td colwidth="200"><p>' + img(700) + '</p></td><td colwidth="200"><p>b</p></td><td colwidth="200"><p>c</p></td></tr></tbody></table>';
        return await checkBothExports(h, html, 'case de tableau');
      } finally { await restorePage(h); }
    },
  });

  cases.push({
    id: 'imgwide_image_in_a_two_columns_zone_is_brought_back_to_its_column',
    description: 'Une image réglée à 700 px dans la colonne gauche d\'une zone à deux colonnes : l\'éditeur la montre à la largeur de la colonne (349 px), le PDF et le Word aussi (262 pt), pas à 525 pt',
    run: async (h) => {
      try {
        await setup(h);
        return await checkBothExports(h, zone('<p>' + img(700) + '</p>', '<p>droite</p>') + '<p></p>', 'colonne');
      } finally { await restorePage(h); }
    },
  });

  cases.push({
    id: 'imgwide_centered_image_stays_inside_the_margins_and_centered',
    description: 'Une image centrée réglée à 900 px : elle est ramenée à la zone de texte et centrée dedans (avant : 675 pt de large, départ à -40 pt, hors de la feuille)',
    run: async (h) => {
      try {
        await setup(h);
        return await checkBothExports(h, '<p style="text-align: center">' + img(900, ' data-align="center"') + '</p>', 'centrée', { centered: true });
      } finally { await restorePage(h); }
    },
  });

  // Image flottante (habillage gauche / droite) aussi large que la zone de texte : rien ne tient à côté, le texte passe dessous - comme dans l'éditeur. Avant, le PDF mettait
  // l'image (675 pt) et le texte dans deux colonnes, l'ensemble dépassait la feuille et le texte n'était qu'un filet de 40 pt au bord.
  ['left', 'right'].forEach(side => {
    cases.push({
      id: 'imgwide_floated_image_as_wide_as_the_page_leaves_the_text_below_it_' + side,
      description: 'Une image à habillage ' + (side === 'left' ? 'gauche' : 'droite') + ' réglée à 900 px : elle est ramenée à la zone de texte, le texte passe dessous (PDF : ni image ni texte hors des marges, texte sur toute la largeur ; Word : image dans la zone de texte)',
      run: async (h) => {
        try {
          await setup(h);
          const words = 'puis un texte assez long qui suit l image et qui continue sur plusieurs lignes de la page A4 pour que le test voie ou il tombe, sous l image et sur toute la largeur de la zone de texte';
          const ref = await loadInEditor(h, '<p>Avant ' + img(900, ' data-align="' + side + '"') + ' ' + words + '</p><p>Paragraphe suivant.</p>');
          const problems = [];
          const pdf = await pdfOf(h, ref.saved);
          if (pdf.images.length !== 1) problems.push('PDF : ' + pdf.images.length + ' image(s) peinte(s)');
          else {
            const im = pdf.images[0];
            if (im.x < pdf.left - 0.5 || im.x + im.width > pdf.right + 0.5) problems.push('PDF : l\'image sort des marges (x ' + fmt(im.x) + ' à ' + fmt(im.x + im.width) + ' pt, marges ' + fmt(pdf.left) + ' à ' + fmt(pdf.right) + ')');
            const items = pdf.page.textItems;
            const outside = items.filter(t => t.x + t.width > pdf.right + 1.5 || t.x < pdf.left - 0.5);
            if (outside.length) problems.push('PDF : ' + outside.length + ' bout(s) de texte hors des marges, par exemple « ' + outside[0].str + ' » à x ' + fmt(outside[0].x) + ' pt');
            const beside = items.filter(t => t.y > im.y + 1 && t.y < im.y + im.height - 1);
            if (beside.length) problems.push('PDF : du texte est peint à côté de l\'image (« ' + beside[0].str + ' »), il devrait passer dessous');
            const below = items.filter(t => t.y > im.y + im.height - 1);
            const next = items.find(t => t.str.trim().startsWith('Paragraphe'));
            if (!below.length || !next || next.y < im.y + im.height) problems.push('PDF : le texte n\'est pas sous l\'image (suite ' + (below.length ? 'présente' : 'absente') + ', « Paragraphe » à y ' + (next ? fmt(next.y) : '?') + ')');
          }
          const word = await wordOf(h, ref.saved);
          if (word.drawings.length !== 1) problems.push('Word : ' + word.drawings.length + ' dessin(s)');
          else if (word.drawings[0].widthPt > word.contentWidthPt + 1) problems.push('Word : l\'image (' + fmt(word.drawings[0].widthPt) + ' pt) est plus large que la zone de texte (' + fmt(word.contentWidthPt) + ' pt)');
          return { pass: problems.length === 0, notes: JSON.stringify({ problems, editorPx: fmt(ref.editorPx), pdfImage: pdf.images[0] && { x: fmt(pdf.images[0].x), y: fmt(pdf.images[0].y), w: fmt(pdf.images[0].width) }, word: word.drawings.map(d => ({ kind: d.kind, w: fmt(d.widthPt) })) }) };
        } finally { await restorePage(h); }
      },
    });
  });

  cases.push({
    id: 'imgwide_image_that_fits_keeps_its_set_size',
    description: 'Une image qui tient (300 px dans le texte, 600 px dans une page A4 paysage) garde exactement sa taille réglée dans l\'éditeur, le PDF et le Word : rien n\'est réduit en trop',
    run: async (h) => {
      try {
        const problems = [];
        const notes = {};
        for (const [orientation, widthPx] of [['portrait', 300], ['landscape', 900]]) {
          await setup(h, orientation);
          const ref = await loadInEditor(h, '<p>' + img(widthPx) + '</p>');
          const pdf = await pdfOf(h, ref.saved);
          const word = await wordOf(h, ref.saved);
          const expectedPt = widthPx * PX_TO_PT;
          if (!near(ref.editorPx, widthPx, 1)) problems.push(orientation + ' : l\'éditeur montre ' + fmt(ref.editorPx) + ' px au lieu de ' + widthPx);
          if (pdf.images.length !== 1 || !near(pdf.images[0].width, expectedPt, 1)) problems.push(orientation + ' : PDF ' + JSON.stringify(pdf.images.map(i => fmt(i.width))) + ' pt au lieu de ' + expectedPt);
          if (word.drawings.length !== 1 || !near(word.drawings[0].widthPt, expectedPt, 1.5)) problems.push(orientation + ' : Word ' + JSON.stringify(word.drawings.map(d => fmt(d.widthPt))) + ' pt au lieu de ' + expectedPt);
          notes[orientation] = { editorPx: fmt(ref.editorPx), pdf: pdf.images.map(i => fmt(i.width)), word: word.drawings.map(d => fmt(d.widthPt)) };
        }
        return { pass: problems.length === 0, notes: JSON.stringify({ problems, notes }) };
      } finally { await restorePage(h); }
    },
  });

  cases.push({
    id: 'imgwide_limit_follows_the_page_format_and_margins',
    description: 'La zone de texte change avec la page : en A5 portrait (484 px de texte) la même image de 900 px est ramenée à 484 px (363 pt) dans le PDF et le Word, comme dans l\'éditeur ; avec des marges de 30 mm en A4, à 567 px (425 pt)',
    run: async (h) => {
      try {
        const problems = [];
        const notes = {};
        for (const [label, format, marginsMm] of [['A5', 'A5', null], ['A4 marges 30 mm', 'A4', { top: 30, right: 30, bottom: 30, left: 30 }]]) {
          await setup(h, 'portrait', format);
          if (marginsMm) { PageLayout.setMarginsMm(marginsMm); await h.sleep(200); }
          const result = await checkBothExports(h, '<p>' + img(900) + '</p>', label);
          const parsed = JSON.parse(result.notes);
          if (!result.pass) problems.push(label + ' : ' + parsed.problems.join(' ; '));
          notes[label] = { editorPx: parsed.editorPx, pdf: parsed.pdf, word: parsed.word, contentWidthPt: parsed.contentWidthPt };
        }
        return { pass: problems.length === 0, notes: JSON.stringify({ problems, notes }) };
      } finally { await restorePage(h); }
    },
  });

  return cases;
})();
