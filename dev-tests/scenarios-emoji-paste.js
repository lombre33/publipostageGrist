// Suite "emojiPaste" - un emoji collé depuis une messagerie ou un courrier en ligne (Teams, Outlook sur le web, Gmail, WhatsApp Web, Discord, Slack) arrive dans le HTML du presse-papiers
// comme une petite image (`<img alt="😀" src="…">`), pas comme un caractère. L'éditeur ne lit que ses propres images (`img.editor-image`) : l'image était écartée et l'emoji disparaissait
// en silence, dans le document, dans une grille et dans les champs texte (Objet, À, Cc...). js/emoji-paste.js (EmojiPaste.textFromImages, appelé par `transformPastedHTML` de js/editor.js
// et par `inlineHtml` de js/field-editor.js) rend le caractère. Ces cas jouent un vrai collage (un évènement `paste` portant un DataTransfer, que ProseMirror lit comme celui du navigateur)
// et suivent le caractère jusqu'aux sorties : la Lecture, le HTML, le Markdown, le vrai PDF et le vrai Word. Le collage d'un emoji comme texte (Windows « Win + . », texte brut, Word, Google
// Docs) n'a jamais été touché : un cas le garde. Le geste à la vraie souris et au vrai presse-papiers est dans verify-emoji-chip-mouse.mjs.
(function () {
  const cases = [];

  const SMILE = '\u{1F600}';
  const FAMILY = '\u{1F468}‍\u{1F469}‍\u{1F467}';
  const THUMB_TONE = '\u{1F44D}\u{1F3FD}';
  const FLAG = '\u{1F1EB}\u{1F1F7}';
  const KEYCAP = '1️⃣';
  const HEART = '❤️';
  const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

  // Ce que chaque messagerie met dans son HTML : le caractère est le texte alternatif de l'image, le reste est propre à chacune.
  const TEAMS = emoji => `<p>Bravo <img alt="${emoji}" itemscope itemtype="http://schema.skype.com/Emoji" src="https://statics.teams.cdn.office.net/evergreen-assets/personal-expressions/v2/assets/emoticons/laugh/default/20_f.png" width="20" height="20"> fin</p>`;
  const GMAIL = emoji => `<p>Bravo <img data-emoji="${emoji}" class="an1 ajz" alt="${emoji}" aria-label="${emoji}" src="https://fonts.gstatic.com/s/e/notoemoji/15.0/1f600/72.png" style="height:1.2em;width:1.2em" data-ii="1"> fin</p>`;
  const WHATSAPP = emoji => `<p>Bravo <img crossorigin="anonymous" alt="${emoji}" draggable="false" class="emoji x1" src="${PIXEL}"> fin</p>`;
  const OUTLOOK = emoji => `<p>Bravo <img alt='${emoji}' data-outlook-emoji="1" src="${PIXEL}" width="16" height="16"> fin</p>`;
  const WINDOWS_WRAPPED = emoji => `<html>\r\n<body>\r\n<!--StartFragment-->${TEAMS(emoji)}<!--EndFragment-->\r\n</body>\r\n</html>`;
  const SOURCES = { teams: TEAMS, gmail: GMAIL, whatsapp: WHATSAPP, outlook: OUTLOOK, windowsWrapped: WINDOWS_WRAPPED };

  const hasImage = html => /<img\b/i.test(html);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  async function pasteInDocument(h, data) {
    await h.resetEditor();
    await h.focusAtEnd();
    const dt = new DataTransfer();
    if (data.html != null) dt.setData('text/html', data.html);
    if (data.plain != null) dt.setData('text/plain', data.plain);
    EditorCore.getEditor().view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    await h.sleep(150);
    return Editor.getHTML();
  }

  cases.push({
    id: 'emoji_image_from_each_chat_app_pastes_as_its_character',
    description: 'Un emoji collé comme une image (Teams, Gmail, WhatsApp Web, Outlook sur le web, le HTML enveloppé que Windows donne) se colle comme le caractère du texte alternatif, sans image ni débris de balise, et le texte autour reste ; un emoji seul, une famille (joints), une teinte de peau, un drapeau, une touche et un cœur à sélecteur de variante gardent chacun toute leur suite',
    run: async (h) => {
      const bad = [];
      const seen = {};
      for (const [name, make] of Object.entries(SOURCES)) {
        for (const emoji of [SMILE, FAMILY, THUMB_TONE, FLAG, KEYCAP, HEART]) {
          const html = await pasteInDocument(h, { html: make(emoji), plain: 'Bravo ' + emoji + ' fin' });
          const text = EditorCore.getEditor().state.doc.textContent;
          seen[name + ':' + [...emoji].length] = text;
          if (text !== 'Bravo ' + emoji + ' fin' || hasImage(html) || /[<>]/.test(text)) bad.push(name + ' ' + [...emoji].map(c => c.codePointAt(0).toString(16)).join('+') + ' -> ' + JSON.stringify(text));
        }
      }
      return { pass: bad.length === 0, notes: bad.join(' ; ') || JSON.stringify(seen) };
    },
  });

  cases.push({
    id: 'emoji_image_alone_pastes_with_nothing_else_in_the_clipboard_but_its_html',
    description: 'Le presse-papiers qui ne porte que le HTML (pas de texte brut à côté) donne aussi le caractère ; deux emojis collés à la suite et un emoji entre deux mots s\'écrivent à leur place, dans l\'ordre',
    run: async (h) => {
      const two = await pasteInDocument(h, { html: `<p>A<img alt="${SMILE}" src="${PIXEL}"><img alt="${HEART}" src="${PIXEL}">B <img alt="${KEYCAP}" src="${PIXEL}"> C</p>` });
      const text = EditorCore.getEditor().state.doc.textContent;
      return { pass: text === 'A' + SMILE + HEART + 'B ' + KEYCAP + ' C' && !hasImage(two), notes: JSON.stringify({ text, two }) };
    },
  });

  cases.push({
    id: 'emoji_image_pastes_in_a_grid_cell_and_a_document_table_cell',
    description: 'Dans une case de grille comme dans une case de tableau du document, un emoji collé comme une image se colle comme caractère',
    run: async (h) => {
      const row = '<tr data-row-height="30" style="height: 30px"><td colwidth="160"><p>x</p></td><td colwidth="160"><p>y</p></td></tr>';
      const grid = '<table style="width: 320px;"><colgroup><col style="width: 160px;"><col style="width: 160px;"></colgroup><tbody>' + row + row + '</tbody></table>';
      const read = () => {
        const cells = [];
        EditorCore.getEditor().state.doc.descendants(node => {
          if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') { cells.push(node.textContent); return false; }
          return true;
        });
        return cells;
      };
      const firstCellInside = () => {
        let at = -1;
        EditorCore.getEditor().state.doc.descendants((node, pos) => {
          if (at < 0 && (node.type.name === 'tableCell' || node.type.name === 'tableHeader')) { at = pos + 2; return false; }
          return true;
        });
        return at;
      };
      const out = {};
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
          dt.setData('text/html', TEAMS(SMILE));
          dt.setData('text/plain', 'Bravo ' + SMILE + ' fin');
          editor.view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
          await h.sleep(200);
          out[inGrid ? 'grid' : 'table'] = read()[0];
        }
      } finally { GridEditor.setActive(false); }
      const want = out.grid && out.grid.includes(SMILE) && out.table && out.table.includes(SMILE);
      return { pass: !!want && !/[<>]/.test(out.grid + out.table), notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'emoji_image_pastes_in_every_text_field_of_the_email_mode',
    description: 'Les champs Objet, À, Cc, Cci et le nom du fichier PDF gardent l\'emoji d\'une image collée (une ligne, le texte autour reste), au lieu de le perdre',
    run: async (h) => {
      const bad = [];
      for (const id of ['v2-email-subject', 'v2-email-to', 'v2-email-cc', 'v2-email-cci', 'pdf-filename-template']) {
        const view = FieldEditor.of(document.getElementById(id)).view;
        view.pasteHTML(TEAMS(SMILE));
        const text = FieldEditor.of(document.getElementById(id)).state.doc.textContent;
        if (text !== 'Bravo ' + SMILE + ' fin') bad.push(id + ' -> ' + JSON.stringify(text));
        FieldEditor.of(document.getElementById(id)).commands.clearContent(true);
      }
      return { pass: bad.length === 0, notes: bad.join(' ; ') || 'cinq champs' };
    },
  });

  cases.push({
    id: 'emoji_pasted_as_image_reaches_reader_html_markdown_pdf_and_word',
    description: 'Le caractère d\'un emoji collé comme une image arrive dans la Lecture, le HTML, le Markdown, le vrai PDF et le vrai Word (comme celui d\'un emoji collé en texte), jamais comme une image',
    run: async (h) => {
      const html = await pasteInDocument(h, { html: TEAMS(SMILE) });
      const reader = await ReaderMode.preview(html, null, {});
      const asHtml = await HtmlExport.htmlToDocument(reader, null, { fragment: true });
      const asMarkdown = await MarkdownExport.htmlToMarkdown(reader, null);
      const pdf = await h.exportPdfContent(html, null);
      const pdfText = h.findTextBlocks(pdf.content, () => true).map(b => h.blockPlainText(b)).join(' | ');
      const docx = await h.exportDocxParts(html, null);
      const wordText = docx.doc.documentElement.textContent;
      const checks = {
        editor: html.includes(SMILE) && !hasImage(html),
        reader: reader.includes(SMILE) && !hasImage(reader),
        html: asHtml.includes(SMILE) && !hasImage(asHtml),
        markdown: asMarkdown.trim() === 'Bravo ' + SMILE + ' fin',
        pdf: pdfText.includes(SMILE),
        word: wordText === 'Bravo ' + SMILE + ' fin',
      };
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, md: asMarkdown, word: wordText, pdf: pdfText }) };
    },
  });

  cases.push({
    id: 'image_that_is_not_an_emoji_is_left_exactly_as_before',
    description: 'Une image collée dont le texte alternatif n\'est pas que de l\'emoji (« Logo », « :smile: », « Bravo 😀 », sans texte alternatif, vide) garde le HTML tel quel (EmojiPaste ne la touche pas) ; une image de l\'éditeur dont le texte alternatif est un emoji reste une image de l\'éditeur après un collage ; un « > » dans un attribut ne coupe pas la balise ; un HTML sans image est rendu tel quel',
    run: async (h) => {
      const untouched = [
        `<p>a <img alt="Logo" src="${PIXEL}"> b</p>`,
        `<p>a <img alt=":smile:" src="${PIXEL}"> b</p>`,
        `<p>a <img alt="Bravo ${SMILE}" src="${PIXEL}"> b</p>`,
        `<p>a <img src="${PIXEL}"> b</p>`,
        `<p>a <img alt="" src="${PIXEL}"> b</p>`,
        `<p>a <img alt="  " src="${PIXEL}"> b</p>`,
        '<p>un texte ' + SMILE + ' sans image</p>',
        '',
      ];
      const changed = untouched.filter(html => EmojiPaste.textFromImages(html) !== html);
      const withGreater = EmojiPaste.textFromImages(`<p>a <img title="x>y" alt="${SMILE}" src="${PIXEL}"> b</p>`);
      const editorImage = `<img class="editor-image" alt="${SMILE}" src="${PIXEL}" style="width: 40px;">`;
      const keptAsIs = EmojiPaste.textFromImages('<p>' + editorImage + '</p>') === '<p>' + editorImage + '</p>';
      const pastedHtml = await pasteInDocument(h, { html: '<p>' + editorImage + '</p>' });
      const entities = EmojiPaste.textFromImages('<p><img alt="&#x1F600;" src="x"></p>');
      const checks = {
        untouched: changed.length === 0,
        greaterThan: withGreater === '<p>a ' + SMILE + ' b</p>',
        editorImageUntouched: keptAsIs,
        editorImageStillAnImage: /<img[^>]*class="editor-image"/.test(pastedHtml) || /editor-image/.test(pastedHtml),
        entities: entities === '<p>' + SMILE + '</p>',
        isEmojiOnly: EmojiPaste.isEmojiOnly(SMILE) && EmojiPaste.isEmojiOnly(FAMILY) && EmojiPaste.isEmojiOnly(FLAG) && !EmojiPaste.isEmojiOnly('A') && !EmojiPaste.isEmojiOnly('1') && !EmojiPaste.isEmojiOnly(''),
      };
      return { pass: Object.values(checks).every(Boolean), notes: JSON.stringify({ checks, changed, withGreater, entities, pastedHtml }) };
    },
  });

  cases.push({
    id: 'emoji_pasted_as_text_keeps_every_form_in_the_document',
    description: 'Un emoji collé comme texte (texte brut, Segoe UI Emoji de Windows ou Word, Google Docs) reste le même caractère - suites comprises - dans le document : le collage en texte n\'a pas changé',
    run: async (h) => {
      const all = SMILE + ' ' + FAMILY + ' ' + THUMB_TONE + ' ' + FLAG + ' ' + KEYCAP + ' ' + HEART;
      const forms = {
        plain: { plain: all },
        segoe: { html: `<span style="font-family:'Segoe UI Emoji'">${all}</span>`, plain: all },
        gdocs: { html: `<meta charset='utf-8'><b style="font-weight:normal;" id="docs-internal-guid-1"><span style="font-size:11pt;font-family:Arial,sans-serif;white-space:pre-wrap;">${all}</span></b>`, plain: all },
        wrapped: { html: `<html>\r\n<body>\r\n<!--StartFragment--><span>${all}</span><!--EndFragment-->\r\n</body>\r\n</html>`, plain: all },
      };
      const bad = [];
      for (const [name, data] of Object.entries(forms)) {
        await pasteInDocument(h, data);
        const text = EditorCore.getEditor().state.doc.textContent;
        if (text !== all) bad.push(name + ' -> ' + JSON.stringify(text));
      }
      return { pass: bad.length === 0, notes: bad.join(' ; ') || 'quatre formes' };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.emojiPaste = cases;
})();
