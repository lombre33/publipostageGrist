// Suite "webImagePaste" - les images d'une page web collée restent dans le document. Quand on copie une partie d'une page web (texte et photos) et qu'on la colle, le presse-papiers ne porte que
// du HTML (`text/html` + `text/plain`, aucune image « fichier » : seul « Copier l'image » du clic droit en joint une) et ses images y sont de simples `<img src="https://…">`. L'éditeur ne lit que ses
// propres images (`img.editor-image`, js/editor-nodes.js) : ProseMirror écartait chaque `<img>` collée, en silence, et le texte arrivait sans aucune photo (relevé par l'étude de l'import HTML du
// 13/11, essai : 0 image gardée sur 1 collée). `transformPastedHTML` de js/editor.js (`webImagesAsEditorImages`) remet maintenant l'image dans la forme de l'éditeur : son adresse, son texte
// alternatif et sa largeur (la seule que le PDF et le Word lisent : en px). Ce qui est gardé ne l'est qu'à la façon de l'import Markdown (js/markdown-import.js) : une adresse web ou une image
// `data:image/…`, jamais `javascript:`, `file:`, `blob:` ni un chemin relatif ; une image d'un autre site reste masquée jusqu'au clic « Afficher » (js/external-images.js), le collage ne fait
// donc contacter aucun site. Ces cas jouent un vrai collage (un évènement `paste` portant un DataTransfer, que ProseMirror lit comme celui du navigateur), avec le HTML tel que Chromium l'écrit
// (mesuré : chaque balise reçoit ses styles, l'adresse est rendue absolue, la largeur posée par une feuille de style devient un `style="width: …px"`) et enveloppé comme Windows le rend.
(function () {
  const cases = [];

  const PHOTO = 'https://photos.example.org/media/photo.jpg';
  const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
  // Ce que Chromium recopie sur chaque balise d'une sélection copiée (relevé sur une vraie page : `color`, `font-family`, `orphans`…) : du bruit de style, jamais utile à l'image.
  const STYLE = 'color: rgb(0, 0, 0); font-family: serif; font-size: medium; font-style: normal; font-variant-ligatures: normal; font-weight: 400; letter-spacing: normal; orphans: 2; text-align: start; widows: 2; white-space: normal;';
  // La sélection d'une page : titre, paragraphe, une photo dont la feuille de style fixe la largeur (Chromium l'écrit en `style`), sa légende, puis une petite image de 20 px à texte alternatif vide.
  const PAGE = `<h1 style="${STYLE}">Titre de la page</h1><p style="${STYLE}">Un paragraphe avant.</p>`
    + `<figure style="${STYLE}"><img class="hero" src="${PHOTO}" alt="Une photo" style="width: 300px; border: 1px solid red;"><figcaption>Légende</figcaption></figure>`
    + `<p style="${STYLE}">Un paragraphe <a href="https://photos.example.org/rel">après</a> avec <img src="${PHOTO}?small" width="20" height="20" alt="">.</p>`;
  const WINDOWS = html => `<html>\r\n<body>\r\n<!--StartFragment-->${html}<!--EndFragment-->\r\n</body>\r\n</html>`;

  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  async function paste(h, data) {
    await h.resetEditor();
    await h.focusAtEnd();
    const dt = new DataTransfer();
    if (data.html != null) dt.setData('text/html', data.html);
    if (data.plain != null) dt.setData('text/plain', data.plain);
    EditorCore.getEditor().view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    await h.sleep(150);
    return Editor.getHTML();
  }

  // Les images du document, dans l'ordre : { src, alt, width } (les autres réglages restent à leur défaut).
  function imagesOf() {
    const found = [];
    EditorCore.getEditor().state.doc.descendants(node => {
      if (node.type.name === 'editorImage') found.push({ src: node.attrs.src, alt: node.attrs.alt, width: node.attrs.width });
    });
    return found;
  }
  const countImages = () => imagesOf().length;

  cases.push({
    id: 'web_page_images_stay_in_the_pasted_text',
    description: 'Une sélection de page web collée (HTML de Chromium : styles recopiés, adresse absolue, largeur de la feuille de style), nue, enveloppée comme Windows la rend et avec un texte brut à côté, garde ses deux images dans l\'ordre (adresse, texte alternatif, largeur en px) et tout son texte',
    run: async (h) => {
      const want = [{ src: PHOTO, alt: 'Une photo', width: '300px' }, { src: PHOTO + '?small', alt: '', width: '20px' }];
      const plain = 'Titre de la page\nUn paragraphe avant.\n\nUne photo\nLégende\nUn paragraphe après avec .';
      const bad = [];
      const seen = {};
      for (const [name, data] of Object.entries({ bare: { html: PAGE }, windows: { html: WINDOWS(PAGE) }, withPlain: { html: PAGE, plain }, windowsWithPlain: { html: WINDOWS(PAGE), plain } })) {
        await paste(h, data);
        const images = imagesOf();
        const text = EditorCore.getEditor().state.doc.textContent;
        seen[name] = images;
        if (!same(images, want)) bad.push(name + ' images ' + JSON.stringify(images));
        if (!/Titre de la page/.test(text) || !/Un paragraphe avant\./.test(text) || !/Légende/.test(text) || !/Un paragraphe après avec/.test(text)) bad.push(name + ' texte ' + JSON.stringify(text));
      }
      return { pass: bad.length === 0, notes: bad.join(' ; ') || JSON.stringify(seen) };
    },
  });

  cases.push({
    id: 'web_page_image_width_is_read_in_px_only_and_never_invented',
    description: 'La largeur d\'une image collée vient de son attribut width ou de son style en px ; en pourcentage, en em, absente ou seulement donnée par une hauteur, elle prend la largeur d\'une image de l\'éditeur (320 px) ; une image dont les deux mesures déclarées ne dépassent pas 2 px (le pixel espion d\'une infolettre) n\'est pas collée',
    run: async (h) => {
      const widthOf = async tag => {
        await paste(h, { html: `<p>a ${tag} b</p>` });
        const images = imagesOf();
        return images.length === 1 ? images[0].width : 'images:' + images.length;
      };
      const got = {
        attr: await widthOf(`<img src="${PHOTO}" width="150">`),
        attrPx: await widthOf(`<img src="${PHOTO}" width="150px">`),
        decimal: await widthOf(`<img src="${PHOTO}" width="150.5">`),
        style: await widthOf(`<img src="${PHOTO}" style="width: 220px; height: auto;">`),
        styleBeatsNothing: await widthOf(`<img src="${PHOTO}" width="90" style="width: 220px">`),
        percentAttr: await widthOf(`<img src="${PHOTO}" width="100%">`),
        percentStyle: await widthOf(`<img src="${PHOTO}" style="width: 50%">`),
        em: await widthOf(`<img src="${PHOTO}" style="width: 12em">`),
        none: await widthOf(`<img src="${PHOTO}">`),
        heightOnly: await widthOf(`<img src="${PHOTO}" height="80">`),
        tinyButNotSpy: await widthOf(`<img src="${PHOTO}" width="3" height="3">`),
      };
      const spies = {
        attrs: await widthOf(`<img src="${PHOTO}" width="1" height="1">`),
        style: await widthOf(`<img src="${PHOTO}" style="width: 1px; height: 1px">`),
        two: await widthOf(`<img src="${PHOTO}" width="2" height="2">`),
      };
      const want = { attr: '150px', attrPx: '150px', decimal: '150.5px', style: '220px', styleBeatsNothing: '220px', percentAttr: '320px', percentStyle: '320px', em: '320px', none: '320px', heightOnly: '320px', tinyButNotSpy: '3px' };
      const wantSpies = { attrs: 'images:0', style: 'images:0', two: 'images:0' };
      return { pass: same(got, want) && same(spies, wantSpies), notes: JSON.stringify({ got, spies }) };
    },
  });

  cases.push({
    id: 'web_page_image_address_is_a_web_address_or_an_image_data_uri_and_nothing_else',
    description: 'Seules une adresse http(s) (ou « //hôte », prise pour https) et une data URI d\'image sont gardées ; javascript:, vbscript:, data:text/html, file:, blob:, ftp:, un chemin relatif, une adresse vide ou absente ne deviennent jamais une image, et le texte autour reste',
    run: async (h) => {
      const kept = {
        https: [`https://photos.example.org/a.png`, `https://photos.example.org/a.png`],
        http: [`http://photos.example.org/a.png`, `http://photos.example.org/a.png`],
        protocolRelative: [`//cdn.example.org/a.png`, `https://cdn.example.org/a.png`],
        upper: [`HTTPS://photos.example.org/A.png`, `HTTPS://photos.example.org/A.png`],
        spaces: [`  https://photos.example.org/a.png  `, `https://photos.example.org/a.png`],
        dataPng: [PIXEL, PIXEL],
        dataSvg: ['data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=', 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4='],
        withQuery: [`https://photos.example.org/a.png?x=1&y=2`, `https://photos.example.org/a.png?x=1&y=2`],
      };
      const refused = {
        javascript: 'javascript:alert(1)',
        javascriptSpaced: 'java\tscript:alert(1)',
        vbscript: 'vbscript:msgbox(1)',
        dataHtml: 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
        dataText: 'data:,hello',
        file: 'file:///C:/Users/x/clip_image001.png',
        blob: 'blob:https://photos.example.org/7a1b8c4e-0000-0000-0000-000000000000',
        ftp: 'ftp://photos.example.org/a.png',
        relative: '/media/a.png',
        relativeDot: 'a.png',
        empty: '',
        hash: '#',
      };
      const bad = [];
      for (const [name, [src, want]] of Object.entries(kept)) {
        await paste(h, { html: `<p>avant <img src="${src}" alt="x"> après</p>` });
        const images = imagesOf();
        if (images.length !== 1 || images[0].src !== want) bad.push('gardée ' + name + ' -> ' + JSON.stringify(images));
      }
      for (const [name, src] of Object.entries(refused)) {
        await paste(h, { html: `<p>avant <img src="${src}" alt="x"> après</p>` });
        const text = EditorCore.getEditor().state.doc.textContent;
        if (countImages() !== 0 || text !== 'avant après') bad.push('refusée ' + name + ' -> ' + countImages() + ' ' + JSON.stringify(text));
      }
      await paste(h, { html: '<p>avant <img alt="x"> après</p>' });
      if (countImages() !== 0) bad.push('refusée sans adresse');
      return { pass: bad.length === 0, notes: bad.join(' ; ') || 'huit gardées, treize refusées' };
    },
  });

  cases.push({
    id: 'web_page_image_brings_nothing_from_its_tag_but_address_alt_and_width',
    description: 'Rien d\'une balise collée n\'entre dans le document que l\'adresse, le texte alternatif et la largeur : ni onerror/onload, ni srcset, ni style (url(), bordure, position), ni classe ; une adresse ou un texte alternatif qui porte des guillemets et des chevrons reste du texte, sans balise créée ; rien ne s\'exécute',
    run: async (h) => {
      window.__webImagePasteRan = 0;
      const nasty = `<p>a <img class="hero evil" id="boom" src="${PHOTO}" alt="x" onerror="window.__webImagePasteRan = 1" onload="window.__webImagePasteRan = 2" `
        + `srcset="https://evil.example.net/x.png 2x" data-src="https://evil.example.net/lazy.png" `
        + `style="width: 200px; background: url(https://evil.example.net/b.png); position: fixed; left: 0; top: 0; z-index: 9999" `
        + `data-layer="front" data-var-table="Evil" crossorigin="anonymous" referrerpolicy="no-referrer" loading="lazy"> b</p>`;
      const html = await paste(h, { html: nasty });
      const [first] = EditorCore.getEditor().state.doc.content.content;
      let attrs = null;
      first.descendants(node => { if (node.type.name === 'editorImage') attrs = node.attrs; });
      const odd = `https://photos.example.org/a.png?q="><b>bold</b>'&x=<i>`;
      const alt = `Un "titre" <b>gras</b> & 'autre'`;
      const escaped = text => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
      const html2 = await paste(h, { html: `<p>c <img src="${escaped(odd)}" alt="${escaped(alt)}"> d</p>` });
      const images2 = imagesOf();
      const doc2 = EditorCore.getEditor().state.doc;
      let marks = 0;
      doc2.descendants(node => { if (node.marks && node.marks.length) marks += 1; });
      const checks = {
        oneImage: !!attrs,
        address: !!attrs && attrs.src === PHOTO,
        width: !!attrs && attrs.width === '200px',
        notLayered: !!attrs && attrs.layer === 'normal' && !attrs.varTable && attrs.opacity === 1 && attrs.left == null,
        noHandlers: !/onerror|onload|srcset|data-src|url\(|evil|crossorigin|loading|boom/i.test(html),
        nothingRan: window.__webImagePasteRan === 0,
        oddAddressKept: images2.length === 1 && images2[0].src === odd && images2[0].alt === alt,
        noTagFromText: !/<b>/i.test(html2) && marks === 0 && doc2.textContent === 'c  d',
      };
      delete window.__webImagePasteRan;
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, attrs, images2, html }) };
    },
  });

  cases.push({
    id: 'web_page_image_of_another_site_is_not_loaded_by_the_paste',
    description: 'Une image collée d\'un autre site reste masquée jusqu\'au clic « Afficher » (cadre avec le site, aucune adresse donnée au navigateur, aucune requête), son export le demande comme avant (ExternalImages.siteOf) ; une data URI collée s\'affiche tout de suite',
    run: async (h) => {
      const before = performance.getEntriesByType('resource').length;
      await paste(h, { html: `<p>a <img src="${PHOTO}" alt="Une photo" width="120"> b <img src="${PIXEL}" alt="Un pixel" width="40"> c</p>` });
      await h.sleep(250);
      const wraps = Array.from(document.querySelectorAll('.tiptap .editor-image-view'));
      const [external, inline] = wraps;
      const requested = performance.getEntriesByType('resource').slice(before).map(entry => entry.name).filter(name => /photos\.example\.org/.test(name));
      const checks = {
        twoViews: wraps.length === 2,
        blocked: !!external && external.classList.contains('editor-image-blocked') && external.dataset.blockedSite === 'photos.example.org',
        noAddressGiven: !!external && !external.querySelector('img').getAttribute('src'),
        noRequest: requested.length === 0,
        siteKnown: ExternalImages.siteOf(PHOTO) === 'photos.example.org',
        dataShown: !!inline && !inline.classList.contains('editor-image-blocked') && inline.querySelector('img').getAttribute('src') === PIXEL,
        modelKeepsAddress: Editor.getHTML().includes(PHOTO),
      };
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, requested }) };
    },
  });

  cases.push({
    id: 'web_page_image_pastes_in_a_link_a_figure_a_list_a_table_cell_and_a_grid_cell',
    description: 'Une image collée dans un lien, une figure, une liste, une case de tableau et une case de grille est une image de l\'éditeur à sa place ; <picture> et ses <source> ne donnent qu\'une image',
    run: async (h) => {
      const forms = {
        link: `<p><a href="https://photos.example.org/page"><img src="${PHOTO}" alt="L"></a></p>`,
        figure: `<figure><img src="${PHOTO}" alt="F"><figcaption>Légende</figcaption></figure>`,
        list: `<ul><li>un <img src="${PHOTO}" alt="P"></li><li>deux</li></ul>`,
        picture: `<picture><source srcset="https://photos.example.org/a.webp" type="image/webp"><source srcset="https://photos.example.org/a.avif" type="image/avif"><img src="${PHOTO}" alt="Q"></picture>`,
        alone: `<img src="${PHOTO}" alt="A">`,
        two: `<p><img src="${PHOTO}" alt="1"><img src="${PHOTO}?b" alt="2"></p>`,
      };
      const bad = [];
      for (const [name, html] of Object.entries(forms)) {
        await paste(h, { html: WINDOWS(html) });
        const found = countImages();
        if (found !== (name === 'two' ? 2 : 1)) bad.push(name + ' -> ' + found);
      }
      const row = '<tr data-row-height="30" style="height: 30px"><td colwidth="160"><p>x</p></td><td colwidth="160"><p>y</p></td></tr>';
      const grid = '<table style="width: 320px;"><colgroup><col style="width: 160px;"><col style="width: 160px;"></colgroup><tbody>' + row + row + '</tbody></table>';
      const firstCellInside = () => {
        let at = -1;
        EditorCore.getEditor().state.doc.descendants((node, pos) => {
          if (at < 0 && (node.type.name === 'tableCell' || node.type.name === 'tableHeader')) { at = pos + 2; return false; }
          return true;
        });
        return at;
      };
      const inCells = {};
      try {
        for (const inGrid of [true, false]) {
          GridEditor.setActive(false);
          await h.resetEditor();
          Editor.setHTML(grid);
          if (inGrid) GridEditor.setActive(true);
          await h.sleep(300);
          const editor = EditorCore.getEditor();
          editor.commands.focus();
          editor.commands.setTextSelection(firstCellInside() + 1);
          const dt = new DataTransfer();
          dt.setData('text/html', WINDOWS(`<p>photo <img src="${PHOTO}" alt="C" width="80"></p>`));
          editor.view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
          await h.sleep(250);
          let inside = 0;
          editor.state.doc.descendants(node => {
            if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') node.descendants(child => { if (child.type.name === 'editorImage') inside += 1; });
          });
          inCells[inGrid ? 'grid' : 'table'] = inside;
        }
      } finally { GridEditor.setActive(false); }
      if (inCells.grid !== 1 || inCells.table !== 1) bad.push('cases ' + JSON.stringify(inCells));
      return { pass: bad.length === 0, notes: bad.join(' ; ') || JSON.stringify({ formes: Object.keys(forms), inCells }) };
    },
  });

  cases.push({
    id: 'web_page_paste_leaves_editor_images_emojis_and_texts_exactly_as_before',
    description: 'Une image de l\'éditeur copiée puis collée garde ses réglages (calque, largeur, place) ; l\'emoji d\'une messagerie reste le caractère du texte alternatif, jamais une image ; un HTML sans image ou un texte brut se colle comme avant ; un email (texte brut) ne reçoit toujours aucune image',
    run: async (h) => {
      const own = `<p>avant <img class="editor-image" src="${PIXEL}" alt="Logo" data-layer="front" data-wrap="inline" style="width: 80px; position: absolute; left: 12px; top: 7px; z-index: 5; opacity: 0.5"> après</p>`;
      await paste(h, { html: own });
      let kept = null;
      EditorCore.getEditor().state.doc.descendants(node => { if (node.type.name === 'editorImage') kept = node.attrs; });
      await paste(h, { html: `<p>Bravo <img alt="\u{1F600}" src="${PHOTO}" width="20" height="20"> fin</p>` });
      const emoji = { images: countImages(), text: EditorCore.getEditor().state.doc.textContent };
      await paste(h, { html: '<p>un <b>texte</b> sans image</p>' });
      const noImage = { images: countImages(), text: EditorCore.getEditor().state.doc.textContent };
      await paste(h, { plain: 'texte brut' });
      const plain = EditorCore.getEditor().state.doc.textContent;
      let email = null;
      try {
        EmailPlainText.setActive(true);
        await paste(h, { html: PAGE });
        email = { images: countImages(), text: EditorCore.getEditor().state.doc.textContent };
      } finally { EmailPlainText.setActive(false); }
      const checks = {
        ownImageKept: !!kept && kept.layer === 'front' && kept.width === '80px' && kept.left === 12 && kept.top === 7 && kept.opacity === 0.5 && kept.alt === 'Logo',
        emojiIsText: emoji.images === 0 && emoji.text === 'Bravo \u{1F600} fin',
        noImageUnchanged: noImage.images === 0 && noImage.text === 'un texte sans image',
        plainUnchanged: plain === 'texte brut',
        emailWithoutImage: !!email && email.images === 0 && /Titre de la page/.test(email.text),
      };
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, kept, emoji, email }) };
    },
  });

  cases.push({
    id: 'web_page_paste_is_one_undo_and_reaches_reader_html_pdf_and_word',
    description: 'Un seul « Annuler » retire le texte et les images collés ; une image collée en data URI arrive dans la Lecture, le HTML, le vrai PDF (une image peinte) et le vrai Word (un fichier d\'image)',
    run: async (h) => {
      const picture = h.makeImage(120, 80, { logo: true });
      await h.resetEditor();
      await h.focusAtEnd();
      const before = Editor.getHTML();
      const dt = new DataTransfer();
      dt.setData('text/html', WINDOWS(`<p>Voici <img src="${picture}" alt="Un logo" width="120"> pour vous.</p>`));
      EditorCore.getEditor().view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      await h.sleep(250);
      const html = Editor.getHTML();
      const reader = await ReaderMode.preview(html, null, {});
      const asHtml = await h.exportHtml(html, null, {}, null, '', { fragment: true });
      const pdf = await h.exportPdfContent(html, null);
      const docx = await h.exportDocxParts(html, null);
      EditorCore.getEditor().commands.undo();
      await h.sleep(150);
      const afterUndo = { images: countImages(), text: EditorCore.getEditor().state.doc.textContent };
      const checks = {
        pasted: /<img[^>]*class="editor-image"/.test(html) && html.includes('Voici'),
        reader: /<img/.test(reader) && reader.includes('Voici'),
        html: asHtml.text.includes('<img') && asHtml.text.includes(picture.slice(0, 60)),
        pdf: h.findImages(pdf.content).length === 1,
        word: Object.keys(docx.mediaSizes).length === 1,
        oneUndo: afterUndo.images === 0 && afterUndo.text === '' && before.replace(/\s/g, '') === Editor.getHTML().replace(/\s/g, ''),
      };
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, afterUndo, media: docx.mediaSizes }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.webImagePaste = cases;
})();
