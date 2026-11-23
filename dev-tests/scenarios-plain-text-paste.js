// Suite "plainTextPaste" - un texte brut collé dans un document garde ses lignes vides. Retour d'Antoine du 23/11 : « j'ai un document .md ouvert dans Notepad++, je vois les sauts de ligne, je
// copie-colle dans un document et je ne les ai plus ». Notepad++ ne met dans le presse-papiers que `text/plain` (fins de ligne \r\n sous Windows) : ProseMirror le coupe avec
// `split(/(?:\r\n?|\n)+/)` et une ligne vide entre deux paragraphes - des retours qui se suivent - disparaissait, tous les paragraphes se collant les uns aux autres. `plainTextToSlice` de
// js/editor.js (`clipboardTextParser`) fait une ligne, un paragraphe, les lignes vides comprises (comme l'e-mail, js/email-plain-text.js). Ces cas jouent un vrai collage (un évènement `paste`
// portant un DataTransfer que ProseMirror lit comme celui du navigateur), avec les fins de ligne de Windows et celles d'Unix. Ce qui ne change pas est gardé aussi : un collage d'une seule ligne
// reste dans le paragraphe du curseur, un bloc de code garde son texte tel quel, le HTML du presse-papiers (Word, une page web) passe toujours avant le texte brut, et le Markdown n'est pas lu au
// collage (c'est l'import d'un fichier .md qui le lit).
(function () {
  const cases = [];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  async function paste(h, data, { before = '<p></p>', caret = 'end' } = {}) {
    await h.resetEditor();
    Editor.setHTML(before);
    await h.sleep(100);
    await h.focusAtEnd();
    if (caret !== 'end') {
      // Le curseur après `caret` caractères du premier paragraphe (1 : on entre dans le paragraphe).
      const editor = EditorCore.getEditor();
      editor.commands.setTextSelection(1 + caret);
      await h.sleep(50);
    }
    const dt = new DataTransfer();
    if (data.html != null) dt.setData('text/html', data.html);
    if (data.plain != null) dt.setData('text/plain', data.plain);
    EditorCore.getEditor().view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    await h.sleep(150);
    return Editor.getHTML();
  }
  const paragraphs = html => Array.from(new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html').body.children).map(node => node.textContent);

  cases.push({
    id: 'plain_text_paste_keeps_its_blank_lines_with_windows_and_unix_line_endings',
    description: 'Un texte brut collé (ce que Notepad++ met dans le presse-papiers : fins de ligne \\r\\n, ou \\n sous Unix) garde une ligne par paragraphe ET ses lignes vides : une, deux ou trois lignes vides de suite font autant de paragraphes vides, aucun paragraphe ne se colle à un autre',
    run: async (h) => {
      const text = ['# Titre', 'Ligne un', 'Ligne deux', '', 'Para deux', '', '', 'Para trois'];
      const bad = [];
      for (const [name, eol] of [['windows', '\r\n'], ['unix', '\n'], ['mac', '\r']]) {
        const html = await paste(h, { plain: text.join(eol) });
        const got = paragraphs(html);
        if (!same(got, text)) bad.push(name + ' : ' + JSON.stringify(got));
        if ((html.match(/<br/g) || []).length) bad.push(name + ' : un saut de ligne forcé est apparu : ' + html);
      }
      return { pass: bad.length === 0, notes: bad.join(' ; ') || 'trois fins de ligne, huit paragraphes dont trois vides' };
    },
  });

  cases.push({
    id: 'plain_text_paste_of_a_markdown_file_stays_text_and_is_not_read_as_markdown',
    description: 'Le texte d\'un fichier .md collé reste du texte : « # » et « - » ne deviennent ni titre ni puce (c\'est l\'import qui lit le Markdown : les règles de collage de TipTap, elles, lisent depuis toujours un « **gras** » en ligne, ce qui n\'a pas changé) ; sa mise en page - lignes et lignes vides - est celle du fichier',
    run: async (h) => {
      const md = ['# Titre', '', 'Un paragraphe', 'sur deux lignes', '', '- puce un', '- puce deux', ''].join('\r\n');
      const html = await paste(h, { plain: md });
      const dom = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html').body;
      const bad = [];
      if (dom.querySelector('h1, h2, ul, ol')) bad.push('le Markdown a été lu : ' + html);
      // Une ligne vide en tête de ligne finale (le fichier se termine par un retour) laisse un dernier paragraphe vide : comme avant.
      const got = paragraphs(html);
      if (!same(got.slice(0, 7), ['# Titre', '', 'Un paragraphe', 'sur deux lignes', '', '- puce un', '- puce deux'])) bad.push(JSON.stringify(got));
      return { pass: bad.length === 0, notes: bad.join(' ; ') || 'texte tel quel' };
    },
  });

  cases.push({
    id: 'plain_text_paste_of_one_line_stays_in_the_cursor_paragraph_and_many_lines_split_it_cleanly',
    description: 'Une ligne collée au milieu d\'un paragraphe y reste (« Avant|Après » + « X » = « AvantXAprès », un seul paragraphe) ; plusieurs lignes le coupent proprement : le début d\'« Avant » prend la première, la fin d\'« Après » la dernière, les lignes vides entre elles font des paragraphes vides',
    run: async (h) => {
      const bad = [];
      const one = paragraphs(await paste(h, { plain: 'X' }, { before: '<p>AvantAprès</p>', caret: 5 }));
      if (!same(one, ['AvantXAprès'])) bad.push('une ligne : ' + JSON.stringify(one));
      const many = paragraphs(await paste(h, { plain: 'L1\r\n\r\nL3' }, { before: '<p>AvantAprès</p>', caret: 5 }));
      if (!same(many, ['AvantL1', '', 'L3Après'])) bad.push('trois lignes : ' + JSON.stringify(many));
      return { pass: bad.length === 0, notes: bad.join(' ; ') || 'une ligne en ligne, trois lignes coupent' };
    },
  });

  cases.push({
    id: 'plain_text_paste_keeps_the_marks_at_the_cursor_like_before',
    description: 'Le texte brut collé à la suite d\'un mot en gras est en gras, comme avant (les marques du curseur sont reprises) ; un texte brut collé dans un bloc de code garde ses lignes vides telles quelles, sans paragraphes',
    run: async (h) => {
      const bad = [];
      const bold = await paste(h, { plain: 'x\r\n\r\ny' }, { before: '<p><strong>gras</strong></p>' });
      const boldDom = new DOMParser().parseFromString('<body>' + bold + '</body>', 'text/html').body;
      if (!same(Array.from(boldDom.children).map(p => p.textContent), ['grasx', '', 'y']) || boldDom.querySelectorAll('strong').length < 2) bad.push('gras : ' + bold);
      const code = await paste(h, { plain: 'a\r\n\r\nb' }, { before: '<pre><code>début </code></pre>', caret: 6 });
      const codeDom = new DOMParser().parseFromString('<body>' + code + '</body>', 'text/html').body;
      if (codeDom.querySelectorAll('pre').length !== 1 || codeDom.querySelector('pre').textContent !== 'début a\n\nb') bad.push('code : ' + code);
      return { pass: bad.length === 0, notes: bad.join(' ; ') || 'marques gardées, code intact' };
    },
  });

  cases.push({
    id: 'plain_text_paste_never_overrides_the_clipboard_html',
    description: 'Quand le presse-papiers porte du HTML (Word, une page web, la copie d\'un autre document de l\'éditeur), c\'est lui qui est collé, avec ses titres et ses gras : le texte brut qui l\'accompagne n\'est pas lu',
    run: async (h) => {
      const bad = [];
      const html = await paste(h, { html: '<h2>Titre</h2><p>Du <strong>gras</strong></p>', plain: 'Titre\r\n\r\nDu gras' });
      const dom = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html').body;
      if (!dom.querySelector('h2') || !dom.querySelector('strong')) bad.push('le HTML n\'est plus collé : ' + html);
      return { pass: bad.length === 0, notes: bad.join(' ; ') || 'le HTML passe d\'abord' };
    },
  });

  // Retour du 23/11, juste après : « je recopie depuis l'éditeur vers un éditeur de texte, j'ai deux sauts de ligne à chaque fois ». Le texte brut d'une copie séparait chaque paragraphe par une ligne
  // vide (le « \n\n » de ProseMirror) : comme une ligne collée est un paragraphe (plus haut), un texte collé puis recopié doublait ses lignes. Un paragraphe est une ligne (`blockSeparator: '\n'`
  // du `clipboardTextSerializer` de TipTap, js/editor.js `coreExtensionOptions`) : ce qui est collé revient à l'identique, une ligne vide est un paragraphe vide, comme dans Word et Google Docs.
  async function copyText(h, html, select) {
    await h.resetEditor();
    Editor.setHTML(html);
    await h.sleep(150);
    const editor = EditorCore.getEditor();
    editor.view.focus();
    if (select) select(editor); else editor.commands.selectAll();
    await h.sleep(80);
    const dt = new DataTransfer();
    editor.view.dom.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }));
    return { plain: dt.getData('text/plain'), html: dt.getData('text/html') };
  }

  cases.push({
    id: 'plain_text_copy_writes_one_line_per_paragraph',
    description: 'Le texte brut d\'une copie met un paragraphe par ligne : deux paragraphes se suivent sur deux lignes (pas séparés par une ligne vide), un paragraphe vide est une ligne vide, un saut de ligne forcé reste un retour, un titre, une puce et un paragraphe font chacun une ligne ; le HTML copié est le même qu\'avant',
    run: async (h) => {
      const bad = [];
      const check = async (label, html, want) => {
        const got = (await copyText(h, html)).plain;
        if (got !== want) bad.push(label + ' : ' + JSON.stringify(got) + ' au lieu de ' + JSON.stringify(want));
      };
      await check('paragraphes', '<p>Ligne un</p><p>Ligne deux</p><p></p><p>Para deux</p>', 'Ligne un\nLigne deux\n\nPara deux');
      await check('saut forcé', '<p>Ligne un<br>Ligne deux</p><p>Autre</p>', 'Ligne un\nLigne deux\nAutre');
      await check('titre, puces, paragraphe', '<h1>Titre</h1><ul><li><p>a</p></li><li><p>b</p></li></ul><p>Fin</p>', 'Titre\na\nb\nFin');
      const copied = await copyText(h, '<p>Un <strong>gras</strong></p><p>Deux</p>');
      if (!/<strong>gras<\/strong>/.test(copied.html) || (copied.html.match(/<p\b/g) || []).length !== 2) bad.push('html : ' + copied.html);
      return { pass: bad.length === 0, notes: bad.join(' ; ') || 'une ligne par paragraphe' };
    },
  });

  cases.push({
    id: 'plain_text_pasted_then_copied_comes_back_identical',
    description: 'Un texte brut collé puis recopié revient à l\'identique (lignes vides comprises) : Notepad++ → document → éditeur de texte ne double plus ses lignes',
    run: async (h) => {
      const bad = [];
      const text = ['# Titre', 'Ligne un', 'Ligne deux', '', 'Para deux', '', '', 'Para trois'];
      await h.resetEditor();
      Editor.setHTML('<p></p>');
      await h.focusAtEnd();
      const dt = new DataTransfer();
      dt.setData('text/plain', text.join('\r\n'));
      EditorCore.getEditor().view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      await h.sleep(150);
      const editor = EditorCore.getEditor();
      editor.commands.selectAll();
      await h.sleep(80);
      const out = new DataTransfer();
      editor.view.dom.dispatchEvent(new ClipboardEvent('copy', { clipboardData: out, bubbles: true, cancelable: true }));
      if (out.getData('text/plain') !== text.join('\n')) bad.push('aller-retour : ' + JSON.stringify(out.getData('text/plain')));
      return { pass: bad.length === 0, notes: bad.join(' ; ') || 'aller-retour identique' };
    },
  });

  // Entrée (un nouveau paragraphe) se recopiait en DOUBLE saut de ligne, Maj+Entrée (un retour forcé) en un seul (retour du 23/11, sur n'importe quel document, importé d'un .md ou non) : les deux
  // font maintenant un seul saut de ligne dans le texte copié. Un .md importé en CRLF (Notepad++) : ses titres, paragraphes, retours et puces reviennent une ligne chacun.
  cases.push({
    id: 'plain_text_copy_of_enter_and_shift_enter_and_of_an_imported_markdown_is_one_line_break_each',
    description: 'Entrée (nouveau paragraphe) et Maj+Entrée (retour forcé) se recopient chacun en UN saut de ligne ; un .md importé (titre, paragraphe de deux lignes, puces) recopié donne une ligne par ligne vue à l\'écran, sans ligne vide ajoutée',
    run: async (h) => {
      const bad = [];
      await h.resetEditor();
      Editor.setHTML('<p></p>');
      await h.focusAtEnd();
      const editor = EditorCore.getEditor();
      editor.commands.insertContent('un');
      editor.commands.splitBlock();
      editor.commands.insertContent('deux');
      editor.commands.setHardBreak();
      editor.commands.insertContent('trois');
      await h.sleep(100);
      editor.commands.selectAll();
      const dt = new DataTransfer();
      editor.view.dom.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }));
      if (dt.getData('text/plain') !== 'un\ndeux\ntrois') bad.push('Entrée / Maj+Entrée : ' + JSON.stringify(dt.getData('text/plain')));
      await MarkdownImport.ensureLibLoaded();
      const converted = MarkdownImport.toDocument(['# Titre', 'Texte sous le titre', '', 'Para', 'sur deux lignes', '', '- puce un', '- puce deux', ''].join('\r\n'));
      const copied = await copyText(h, converted.html);
      if (copied.plain.replace(/\n+$/, '') !== 'Titre\nTexte sous le titre\nPara\nsur deux lignes\npuce un\npuce deux') bad.push('.md importé : ' + JSON.stringify(copied.plain));
      return { pass: bad.length === 0, notes: bad.join(' ; ') || 'un saut de ligne chacun' };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.plainTextPaste = cases;
})();
