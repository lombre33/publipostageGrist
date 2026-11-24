// Suite "webImagePaste" - ce que le collage d'une page web fait de ses images. Quand on copie une partie d'une page web (texte et photos) et qu'on la colle, le presse-papiers ne porte que
// du HTML (`text/html` + `text/plain`, aucune image « fichier » : seul « Copier l'image » du clic droit en joint une) et ses images y sont de simples `<img src="https://…">`. L'éditeur ne lit que ses
// propres images (`img.editor-image`, js/editor-nodes.js) : ProseMirror écarte chaque `<img>` collée, en silence. Du 13/11 au 23/11, `transformPastedHTML` de js/editor.js (`webImagesAsEditorImages`)
// les remettait dans la forme de l'éditeur avec leur adresse (masquées jusqu'au clic « Afficher »). DEPUIS LE 24/11 (« plus aucun appel vers un autre site », choix d'Antoine : importer une image par
// copier-coller ou depuis une pièce jointe de Grist) l'adresse d'un site n'est plus reprise : le texte arrive SANS la photo, le coin d'état le dit (`pp:webImagesNotPasted`, `image.paste.external`) avec le
// geste qui marche (« Copier l'image » du clic droit, puis coller), et rien n'est demandé à aucun site. Ne sont reprises que les images qui portent leurs octets (`data:image/…` : Word, LibreOffice,
// un logiciel de courrier), avec leur texte alternatif et leur largeur - la seule que le PDF et le Word lisent : en px. Ces cas jouent un vrai collage (un évènement `paste` portant un DataTransfer, que
// ProseMirror lit comme celui du navigateur), avec le HTML tel que Chromium l'écrit (mesuré : chaque balise reçoit ses styles, l'adresse est rendue absolue, la largeur posée par une feuille de style
// devient un `style="width: …px"`) et enveloppé comme Windows le rend.
(function () {
  const cases = [];

  const PHOTO = 'https://photos.example.org/media/photo.jpg';
  const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
  const PIXEL2 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  // Ce que Chromium recopie sur chaque balise d'une sélection copiée (relevé sur une vraie page : `color`, `font-family`, `orphans`…) : du bruit de style, jamais utile à l'image.
  const STYLE = 'color: rgb(0, 0, 0); font-family: serif; font-size: medium; font-style: normal; font-variant-ligatures: normal; font-weight: 400; letter-spacing: normal; orphans: 2; text-align: start; widows: 2; white-space: normal;';
  // La sélection d'une page : titre, paragraphe, une photo dont la feuille de style fixe la largeur (Chromium l'écrit en `style`), sa légende, puis une petite image de 20 px à texte alternatif vide.
  // `PAGE` : les deux sont des adresses web ; `PAGE_WITH_DATA` : la photo de la figure porte ses octets (une data URI), la petite image reste une adresse web.
  const page = (figureSrc) => `<h1 style="${STYLE}">Titre de la page</h1><p style="${STYLE}">Un paragraphe avant.</p>`
    + `<figure style="${STYLE}"><img class="hero" src="${figureSrc}" alt="Une photo" style="width: 300px; border: 1px solid red;"><figcaption>Légende</figcaption></figure>`
    + `<p style="${STYLE}">Un paragraphe <a href="https://photos.example.org/rel">après</a> avec <img src="${PHOTO}?small" width="20" height="20" alt="">.</p>`;
  const PAGE = page(PHOTO);
  const PAGE_WITH_DATA = page(PIXEL);
  const WINDOWS = html => `<html>\r\n<body>\r\n<!--StartFragment-->${html}<!--EndFragment-->\r\n</body>\r\n</html>`;

  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // Ce que le collage a dit : le nombre d'images d'une adresse web qu'il n'a pas reprises, une entrée par évènement `pp:webImagesNotPasted`.
  function listenNotices() {
    const heard = [];
    const on = event => heard.push(event.detail && event.detail.count);
    document.addEventListener('pp:webImagesNotPasted', on);
    return { heard, stop() { document.removeEventListener('pp:webImagesNotPasted', on); } };
  }

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
    id: 'web_page_photos_of_a_web_address_are_not_pasted_but_the_text_and_data_images_are',
    description: 'Une sélection de page web collée (HTML de Chromium : styles recopiés, adresse absolue, largeur de la feuille de style), nue, enveloppée comme Windows la rend et avec un texte brut à côté : ses deux images d\'une adresse web ne sont PAS reprises (le texte, lui, arrive en entier) et le collage le dit une fois, avec leur nombre ; avec une photo qui porte ses octets, celle-là est gardée (adresse, texte alternatif, largeur) et seule l\'autre est comptée',
    run: async (h) => {
      const plain = 'Titre de la page\nUn paragraphe avant.\n\nUne photo\nLégende\nUn paragraphe après avec .';
      const bad = [];
      const seen = {};
      const listener = listenNotices();
      try {
        for (const [name, data] of Object.entries({ bare: { html: PAGE }, windows: { html: WINDOWS(PAGE) }, withPlain: { html: PAGE, plain }, windowsWithPlain: { html: WINDOWS(PAGE), plain } })) {
          listener.heard.length = 0;
          await paste(h, data);
          const images = imagesOf();
          const text = EditorCore.getEditor().state.doc.textContent;
          seen[name] = { images: images.length, said: listener.heard.slice() };
          if (images.length !== 0 || !same(listener.heard, [2])) bad.push(name + ' images ' + JSON.stringify(images) + ' dit ' + JSON.stringify(listener.heard));
          if (!/Titre de la page/.test(text) || !/Un paragraphe avant\./.test(text) || !/Légende/.test(text) || !/Un paragraphe après avec/.test(text)) bad.push(name + ' texte ' + JSON.stringify(text));
          if (Editor.getHTML().includes('photos.example.org/media')) bad.push(name + ' : l\'adresse du site est restée dans le document');
        }
        listener.heard.length = 0;
        await paste(h, { html: WINDOWS(PAGE_WITH_DATA) });
        const kept = imagesOf();
        if (!same(kept, [{ src: PIXEL, alt: 'Une photo', width: '300px' }]) || !same(listener.heard, [1])) bad.push('avec une data URI : ' + JSON.stringify(kept) + ' dit ' + JSON.stringify(listener.heard));
      } finally { listener.stop(); }
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
        attr: await widthOf(`<img src="${PIXEL}" width="150">`),
        attrPx: await widthOf(`<img src="${PIXEL}" width="150px">`),
        decimal: await widthOf(`<img src="${PIXEL}" width="150.5">`),
        style: await widthOf(`<img src="${PIXEL}" style="width: 220px; height: auto;">`),
        styleBeatsNothing: await widthOf(`<img src="${PIXEL}" width="90" style="width: 220px">`),
        percentAttr: await widthOf(`<img src="${PIXEL}" width="100%">`),
        percentStyle: await widthOf(`<img src="${PIXEL}" style="width: 50%">`),
        em: await widthOf(`<img src="${PIXEL}" style="width: 12em">`),
        none: await widthOf(`<img src="${PIXEL}">`),
        heightOnly: await widthOf(`<img src="${PIXEL}" height="80">`),
        tinyButNotSpy: await widthOf(`<img src="${PIXEL}" width="3" height="3">`),
      };
      const spies = {
        attrs: await widthOf(`<img src="${PIXEL}" width="1" height="1">`),
        style: await widthOf(`<img src="${PIXEL}" style="width: 1px; height: 1px">`),
        two: await widthOf(`<img src="${PIXEL}" width="2" height="2">`),
      };
      const want = { attr: '150px', attrPx: '150px', decimal: '150.5px', style: '220px', styleBeatsNothing: '220px', percentAttr: '320px', percentStyle: '320px', em: '320px', none: '320px', heightOnly: '320px', tinyButNotSpy: '3px' };
      const wantSpies = { attrs: 'images:0', style: 'images:0', two: 'images:0' };
      return { pass: same(got, want) && same(spies, wantSpies), notes: JSON.stringify({ got, spies }) };
    },
  });

  cases.push({
    id: 'web_page_image_address_is_an_image_data_uri_and_nothing_else',
    description: 'Seule une data URI d\'image est gardée ; une adresse http(s) (ou « //hôte »), javascript:, vbscript:, data:text/html, file:, blob:, ftp:, un chemin relatif, une adresse vide ou absente ne deviennent jamais une image, et le texte autour reste ; seules les adresses web sont COMPTÉES dans le dire du collage',
    run: async (h) => {
      const kept = {
        dataGif: [PIXEL, PIXEL],
        dataPng: [PIXEL2, PIXEL2],
        dataSvg: ['data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=', 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4='],
        upper: [PIXEL2.replace('data:image/png', 'DATA:IMAGE/png'), PIXEL2.replace('data:image/png', 'DATA:IMAGE/png')],
        spaces: ['  ' + PIXEL + '  ', PIXEL],
      };
      const web = {
        https: 'https://photos.example.org/a.png',
        http: 'http://photos.example.org/a.png',
        protocolRelative: '//cdn.example.org/a.png',
        upper: 'HTTPS://photos.example.org/A.png',
        spaces: '  https://photos.example.org/a.png  ',
        withQuery: 'https://photos.example.org/a.png?x=1&y=2',
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
      const listener = listenNotices();
      try {
        for (const [name, [src, want]] of Object.entries(kept)) {
          listener.heard.length = 0;
          await paste(h, { html: `<p>avant <img src="${src}" alt="x"> après</p>` });
          const images = imagesOf();
          if (images.length !== 1 || images[0].src !== want) bad.push('gardée ' + name + ' -> ' + JSON.stringify(images));
          if (listener.heard.length) bad.push('gardée ' + name + ' : le collage a dit ' + JSON.stringify(listener.heard));
        }
        for (const [name, src] of Object.entries(web)) {
          listener.heard.length = 0;
          await paste(h, { html: `<p>avant <img src="${src}" alt="x"> après</p>` });
          const text = EditorCore.getEditor().state.doc.textContent;
          if (countImages() !== 0 || text !== 'avant après') bad.push('adresse web ' + name + ' -> ' + countImages() + ' ' + JSON.stringify(text));
          if (!same(listener.heard, [1])) bad.push('adresse web ' + name + ' : le collage devait dire 1, dit ' + JSON.stringify(listener.heard));
        }
        for (const [name, src] of Object.entries(refused)) {
          listener.heard.length = 0;
          await paste(h, { html: `<p>avant <img src="${src}" alt="x"> après</p>` });
          const text = EditorCore.getEditor().state.doc.textContent;
          if (countImages() !== 0 || text !== 'avant après') bad.push('refusée ' + name + ' -> ' + countImages() + ' ' + JSON.stringify(text));
          if (listener.heard.length) bad.push('refusée ' + name + ' : ce n\'est pas une adresse web, le collage ne devait rien dire : ' + JSON.stringify(listener.heard));
        }
        listener.heard.length = 0;
        await paste(h, { html: '<p>avant <img alt="x"> après</p>' });
        if (countImages() !== 0 || listener.heard.length) bad.push('refusée sans adresse');
      } finally { listener.stop(); }
      return { pass: bad.length === 0, notes: bad.join(' ; ') || 'cinq gardées, six adresses web écartées et dites, douze autres écartées sans rien dire' };
    },
  });

  cases.push({
    id: 'web_page_image_brings_nothing_from_its_tag_but_address_alt_and_width',
    description: 'Rien d\'une balise collée n\'entre dans le document que l\'adresse, le texte alternatif et la largeur : ni onerror/onload, ni srcset, ni style (url(), bordure, position), ni classe ; une adresse ou un texte alternatif qui porte des guillemets et des chevrons reste du texte, sans balise créée ; rien ne s\'exécute',
    run: async (h) => {
      window.__webImagePasteRan = 0;
      const nasty = `<p>a <img class="hero evil" id="boom" src="${PIXEL}" alt="x" onerror="window.__webImagePasteRan = 1" onload="window.__webImagePasteRan = 2" `
        + `srcset="https://evil.example.net/x.png 2x" data-src="https://evil.example.net/lazy.png" `
        + `style="width: 200px; background: url(https://evil.example.net/b.png); position: fixed; left: 0; top: 0; z-index: 9999" `
        + `data-layer="front" data-var-table="Evil" crossorigin="anonymous" referrerpolicy="no-referrer" loading="lazy"> b</p>`;
      const html = await paste(h, { html: nasty });
      const [first] = EditorCore.getEditor().state.doc.content.content;
      let attrs = null;
      first.descendants(node => { if (node.type.name === 'editorImage') attrs = node.attrs; });
      const odd = `data:image/png;base64,AAAA?q="><b>bold</b>'&x=<i>`;
      const alt = `Un "titre" <b>gras</b> & 'autre'`;
      const escaped = text => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
      const html2 = await paste(h, { html: `<p>c <img src="${escaped(odd)}" alt="${escaped(alt)}"> d</p>` });
      const images2 = imagesOf();
      const doc2 = EditorCore.getEditor().state.doc;
      let marks = 0;
      doc2.descendants(node => { if (node.marks && node.marks.length) marks += 1; });
      const checks = {
        oneImage: !!attrs,
        address: !!attrs && attrs.src === PIXEL,
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
    id: 'web_page_image_of_another_site_is_not_pasted_and_nothing_is_requested',
    description: 'Une image collée d\'un autre site n\'entre pas dans le document (ni cadre « Image non affichée », ni adresse dans le modèle) et aucune requête ne part vers ce site ; le coin d\'état dit « image d\'une page web non collée » avec le geste qui marche ; une data URI collée à côté s\'affiche tout de suite',
    run: async (h) => {
      const before = performance.getEntriesByType('resource').length;
      const status = document.getElementById('status-msg');
      await paste(h, { html: `<p>a <img src="${PHOTO}" alt="Une photo" width="120"> b <img src="${PIXEL}" alt="Un pixel" width="40"> c</p>` });
      await h.sleep(250);
      const wraps = Array.from(document.querySelectorAll('.tiptap .editor-image-view'));
      const requested = performance.getEntriesByType('resource').slice(before).map(entry => entry.name).filter(name => /photos\.example\.org/.test(name));
      const sentence = I18n.t('image.paste.external', { n: 1 });
      const checks = {
        oneView: wraps.length === 1,
        dataShown: wraps.length === 1 && !wraps[0].classList.contains('editor-image-blocked') && wraps[0].querySelector('img').getAttribute('src') === PIXEL,
        noBlockedFrame: document.querySelectorAll('.tiptap .editor-image-blocked').length === 0,
        noRequest: requested.length === 0,
        modelWithoutAddress: !Editor.getHTML().includes('photos.example.org'),
        said: !!status && status.textContent.indexOf(sentence) === 0,
        saidTheGesture: /Copier l’image|Copy image/.test(sentence) && /collez|paste/.test(sentence),
      };
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, requested, status: status && status.textContent }) };
    },
  });

  cases.push({
    id: 'web_page_image_pastes_in_a_link_a_figure_a_list_a_table_cell_and_a_grid_cell',
    description: 'Une image collée dans un lien, une figure, une liste, une case de tableau et une case de grille est une image de l\'éditeur à sa place ; <picture> et ses <source> ne donnent qu\'une image',
    run: async (h) => {
      const forms = {
        link: `<p><a href="https://photos.example.org/page"><img src="${PIXEL}" alt="L"></a></p>`,
        figure: `<figure><img src="${PIXEL}" alt="F"><figcaption>Légende</figcaption></figure>`,
        list: `<ul><li>un <img src="${PIXEL}" alt="P"></li><li>deux</li></ul>`,
        picture: `<picture><source srcset="https://photos.example.org/a.webp" type="image/webp"><source srcset="https://photos.example.org/a.avif" type="image/avif"><img src="${PIXEL}" alt="Q"></picture>`,
        alone: `<img src="${PIXEL}" alt="A">`,
        two: `<p><img src="${PIXEL}" alt="1"><img src="${PIXEL2}" alt="2"></p>`,
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
          dt.setData('text/html', WINDOWS(`<p>photo <img src="${PIXEL}" alt="C" width="80"></p>`));
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
