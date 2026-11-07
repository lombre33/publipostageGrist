// Suite "videoDocument" - la VIDÉO d'un DOCUMENT (demande d'Antoine du 07/11 : « les vidéos doivent aussi être dispo dans les documents », « comme une image on peut la bouger dans et sur le
// texte » ; cartes du 07/11 : « un rectangle gris avec le titre » dans les exports, « même vidéo pour toutes les lignes »), js/video-frame.js, js/editor-nodes.js (`video`, `data-video`) et
// js/reader-mode.js (`VideoFrame.forExport` dans `preview`, `VideoFrame.fill` dans la Lecture). Ce que l'éditeur et la Lecture montrent et la pose à la souris sont dans
// dev-tests/verify-video-frame.mjs ; ici : le MODÈLE (la vidéo est une image sans adresse ni lecteur, seul l'identifiant est écrit) et les SORTIES réelles - le PDF (pdf.js), le Word (.docx
// dézippé), le HTML et le Markdown : un rectangle gris 16/9 qui porte le titre, cliquable vers la vidéo sur son site, et rien appelé chez le fournisseur.
(function () {
  const cases = [];
  const parse = html => new DOMParser().parseFromString(html, 'text/html').body;
  const written = () => Editor.getHTML().replace(/<p><\/p>$/, '');
  const WATCH = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90s';
  const VIDEO = 'youtube:dQw4w9WgXcQ@90';
  const IMG = (extra = '') => `<img class="editor-image" draggable="false" alt="Ma vidéo" data-layer="normal" data-wrap="block" data-align="center" data-video="${VIDEO}" style="width: 480px; aspect-ratio: 16 / 9;"${extra}>`;
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };

  async function docxFor(html) {
    await ExportCommon.ensureJsZipLoaded();
    await DocxExport.ensureDocxLibLoaded();
    const { blob } = await DocxExport.getDocxBlobForRecord(html, null, {}, '', null, null);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const document = new DOMParser().parseFromString(await zip.file('word/document.xml').async('string'), 'application/xml');
    const rels = zip.file('word/_rels/document.xml.rels') ? await zip.file('word/_rels/document.xml.rels').async('string') : '';
    const media = Object.keys(zip.files).filter(n => n.startsWith('word/media/') && !zip.files[n].dir);
    return { document, rels, media };
  }

  cases.push({
    id: 'videodoc_model_keeps_only_the_identifier',
    description: 'La vidéo d\'un document est une image du modèle : l\'HTML enregistré ne porte que `data-video` (l\'identifiant), jamais d\'adresse ni de `src`, ni <iframe>, <video> ou <object> ; un réglage piégé n\'est pas relu',
    run: async (h) => {
      await h.resetEditor();
      const editor = EditorCore.getEditor();
      editor.commands.setContent('<p>Avant</p>');
      editor.commands.focus('end');
      const placed = VideoFrame.insertImage(editor, VIDEO, 'Ma vidéo');
      await new Promise(r => setTimeout(r, 300));
      const html = written();
      const img = parse(html).querySelector('img[data-video]');
      editor.commands.setContent('<p>x</p><p><img class="editor-image" data-video="youtube:&quot;&gt;&lt;script&gt;" alt="piège"></p>');
      await new Promise(r => setTimeout(r, 200));
      const trapped = parse(Editor.getHTML()).querySelectorAll('img[data-video]').length;
      const trappedValue = trapped ? parse(Editor.getHTML()).querySelector('img[data-video]').getAttribute('data-video') : '';
      return {
        pass: placed === true && !!img && img.getAttribute('data-video') === VIDEO && !img.hasAttribute('src') && !/<iframe|<video|<object|<embed|youtube\.com|youtu\.be/.test(html)
          && img.getAttribute('data-wrap') === 'block' && img.getAttribute('data-align') === 'center' && /width: 480px/.test(img.getAttribute('style')) && /aspect-ratio: 16 \/ 9/.test(img.getAttribute('style'))
          && VideoFrame.valueOf(trappedValue) === '',
        notes: JSON.stringify({ placed, html, trapped, trappedValue }),
      };
    },
  });

  cases.push({
    id: 'videodoc_export_text_becomes_a_grey_one_cell_table_with_a_link',
    description: 'Le texte résolu des exports (`ReaderMode.preview`) remplace la vidéo par un tableau d\'une case : fond gris, hauteur 16/9 de la largeur, le titre en lien vers la vidéo sur son site ; le paragraphe qui la portait est coupé autour, rien d\'autre ne bouge',
    run: async (h) => {
      await h.resetEditor();
      const out = await ReaderMode.preview('<p>Avant ' + IMG() + ' après</p><p>Seul</p>', null, {});
      const body = parse(out);
      const table = body.querySelector('table[data-pp-video]');
      const cell = table && table.querySelector('td');
      const row = table && table.querySelector('tr');
      const link = cell && cell.querySelector('a');
      const paragraphs = Array.from(body.children).map(n => n.nodeName + ':' + n.textContent.trim());
      return {
        pass: !!table && table.querySelectorAll('td').length === 1 && !body.querySelector('img') && link && link.getAttribute('href') === WATCH && link.textContent === 'Ma vidéo'
          && /background-color: #f1f3f6/.test(cell.getAttribute('style')) && row.getAttribute('data-row-height') === '270' && table.querySelector('col').getAttribute('style').indexOf('width: 480px') >= 0
          && paragraphs.join('|') === 'P:Avant|TABLE:Ma vidéo|P:après|P:Seul',
        notes: JSON.stringify({ out, paragraphs }),
      };
    },
  });

  cases.push({
    id: 'videodoc_pdf_has_the_grey_cell_and_a_link_annotation',
    description: 'PDF : la vidéo est une case grise de 480 x 270 px (360 x 202,5 pt) avec son titre, et le PDF porte le lien vers la vidéo sur son site ; aucune image',
    run: async (h) => {
      await h.resetEditor();
      const result = await h.exportPdfContent('<p>Avant</p><p>' + IMG() + '</p><p>Après</p>', NO_HF, null, { tableId: null, record: {} });
      const tables = [];
      (function walk(node) { if (!node || typeof node !== 'object') return; if (node.table) tables.push(node); Object.values(node).forEach(walk); })(result.content);
      const text = h.findTextBlocks(result.content).map(b => h.blockPlainText(b));
      const links = [];
      (function walk(node) { if (!node || typeof node !== 'object') return; if (node.link) links.push(node.link); Object.values(node).forEach(walk); })(result.content);
      const bytes = atob(result.base64);
      return {
        pass: tables.length === 1 && text.indexOf('Ma vidéo') >= 0 && links.indexOf(WATCH) >= 0 && h.findImages(result.content).length === 0 && /\/URI \(https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ&t=90s\)/.test(bytes),
        notes: JSON.stringify({ tables: tables.length, text, links, images: h.findImages(result.content).length, uri: /\/URI \(https:\/\/www\.youtube\.com/.test(bytes), layout: tables[0] && { widths: tables[0].table.widths, heights: tables[0].table.heights, fill: JSON.stringify(tables[0].table.body).slice(0, 300) } }),
      };
    },
  });

  cases.push({
    id: 'videodoc_docx_has_the_shaded_cell_and_a_hyperlink',
    description: 'Word : un tableau d\'une case aux 360 pt de large, fond F1F3F6, hauteur de ligne de 202,5 pt, le titre en lien (w:hyperlink) vers la vidéo sur son site ; aucune image',
    run: async (h) => {
      await h.resetEditor();
      const { document: doc, rels, media } = await docxFor('<p>Avant</p><p>' + IMG() + '</p><p>Après</p>');
      const tables = h.docxTables(doc);
      const fills = Array.from(doc.getElementsByTagName('w:shd')).map(n => n.getAttribute('w:fill'));
      const heights = Array.from(doc.getElementsByTagName('w:trHeight')).map(n => n.getAttribute('w:val') + '/' + n.getAttribute('w:hRule'));
      const hyperlinks = Array.from(doc.getElementsByTagName('w:hyperlink')).map(n => n.textContent);
      const url = /Target="(https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ&amp;t=90s)"/.exec(rels);
      return {
        pass: tables.length === 1 && fills.indexOf('F1F3F6') >= 0 && hyperlinks.indexOf('Ma vidéo') >= 0 && !!url && media.length === 0 && h.docxDrawings(doc).length === 0,
        notes: JSON.stringify({ tables: tables.map(t => ({ gridCols: t.gridCols, rows: t.rows && t.rows.length })), fills, heights, hyperlinks, url: !!url, media }),
      };
    },
  });

  cases.push({
    id: 'videodoc_html_and_markdown_keep_the_link',
    description: 'HTML : un tableau d\'une case grise avec le titre en lien ; Markdown : une ligne `[titre](adresse de la vidéo)` ; ni l\'un ni l\'autre n\'appelle YouTube (aucune image, aucun cadre)',
    run: async (h) => {
      await h.resetEditor();
      const html = await ReaderMode.preview('<p>Avant</p><p>' + IMG() + '</p><p>Après</p>', null, {});
      const doc = await HtmlExport.htmlToDocument(html, null, { title: 'essai' });
      const body = doc.slice(doc.indexOf('<body>'), doc.indexOf('</body>'));
      const md = await MarkdownExport.htmlToMarkdown(html, null);
      return {
        pass: /<table/.test(body) && body.indexOf('href="' + WATCH.replace(/&/g, '&amp;') + '"') >= 0 && body.indexOf('>Ma vidéo<') >= 0 && !/<img|<iframe|i\.ytimg|googlevideo/.test(body)
          && md.indexOf('[Ma vidéo](' + WATCH + ')') >= 0 && !/<table|<img|\|/.test(md),
        notes: JSON.stringify({ body: body.slice(0, 1200), md }),
      };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.videoDocument = cases;
})();
