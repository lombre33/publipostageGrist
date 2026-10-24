// Suite "bulletFormat" - « Puce… » (demande d'Antoine du 24/10 : « tu peux lancer les points 9 et 10 », chantier 9 « caractères et puces », lot 9d de « Import PowerPoint sans perte » ; js/bullet-format.js).
// Le signe de la puce d'une liste à puces (`bulletChar`, un attribut de la liste comme son style). Quatre parties :
//  1) le RÉGLAGE : l'aller-retour HTML (`data-bullet-char` et la variable CSS), les signes refusés (guillemet, espace, plusieurs caractères...), la commande en un seul Annuler, la liste du curseur, un bouton de style qui retire le signe ;
//  2) les SORTIES : l'éditeur et la Lecture (le `::marker` montre le signe), le PDF (relu par pdf.js : le signe est écrit, même hors de la police du texte), le Word (numbering.xml), le PowerPoint (`a:buChar`), le HTML et le texte des courriels ;
//  3) l'IMPORT PowerPoint, qui écrit ce réglage (dev-tests/scenarios-pptx-import.js) et l'aller-retour avec l'export.
// La vraie souris et le vrai clavier à 700x400 (clair, sombre, anglais) sont dans dev-tests/verify-bullet-format-mouse.mjs (groupe Node "bulletFormatMouse").
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const ed = () => EditorCore.getEditor();
  const NO_HF = { header: '', footer: '' };

  async function setDoc(h, html) {
    await h.resetEditor();
    Editor.setHTML(html);
    await sleep(150);
  }
  const written = () => Editor.getHTML().replace(/<p><\/p>$/, '');
  function wordRange(word) {
    let found = null;
    ed().state.doc.descendants((node, pos) => {
      if (found || !node.isText) return;
      const i = node.text.indexOf(word);
      if (i !== -1) found = { from: pos + i, to: pos + i + word.length };
    });
    return found;
  }
  async function cursorIn(word) {
    ed().commands.setTextSelection(wordRange(word).from + 1);
    await sleep(80);
  }
  // Le signe de la liste qui porte le mot, tel que l'éditeur le garde : le caractère, ou « - » pour le style de la liste.
  function charOf(word) {
    let out = null;
    const range = wordRange(word);
    const $pos = ed().state.doc.resolve(range.from);
    for (let depth = $pos.depth; depth > 0; depth--) {
      if ($pos.node(depth).type.name === 'bulletList') { out = $pos.node(depth).attrs.bulletChar || '-'; break; }
    }
    return out;
  }
  const markerContent = word => {
    const li = Array.from(document.querySelectorAll('#editor-container .tiptap li')).find(item => item.textContent.indexOf(word) !== -1);
    return li ? getComputedStyle(li, '::marker').content : null;
  };

  cases.push({
    id: 'bulletformat_html_round_trip_and_refused_signs',
    description: 'Le signe d\'une liste fait l\'aller-retour du HTML (`data-bullet-char` et la variable CSS que lit le `::marker`) ; le rond d\'origine, un guillemet, une barre oblique inverse, une espace, plusieurs caractères et un caractère de commande ne sont pas des réglages ; un emoji compte pour un seul caractère ; sans réglage, le HTML ne change pas',
    run: async (h) => {
      const lists = ['➢', '•', '"', '\\', ' ', 'ab', '\u0007', '👍', '–'].map((char, i) => '<ul data-bullet-char="' + char.replace(/"/g, '&quot;') + '"><li><p>L' + i + '</p></li></ul>').join('') + '<ul><li><p>Lplain</p></li></ul>';
      await setDoc(h, lists);
      const got = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => charOf('L' + i));
      const plain = charOf('Lplain');
      const html = written();
      await setDoc(h, html);
      const again = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => charOf('L' + i));
      const pass = JSON.stringify(got) === JSON.stringify(['➢', '-', '-', '-', '-', '-', '-', '👍', '–']) && plain === '-' && JSON.stringify(got) === JSON.stringify(again)
        && /<ul data-bullet-char="➢" style="--pp-bullet-char: '➢ ';?">/.test(html) && /<ul><li><p>Lplain<\/p><\/li><\/ul>/.test(html) && !/data-bullet-char="•"/.test(html);
      return { pass, notes: JSON.stringify({ got, plain, again, html }) };
    },
  });

  cases.push({
    id: 'bulletformat_apply_one_undo_nearest_list_and_style_buttons_reset',
    description: 'BulletFormat.apply pose le signe sur la liste la plus proche du curseur (la sous-liste, pas sa mère) en UNE transaction (un Annuler le défait, un Rétablir le remet) ; hors d\'une liste à puces (un paragraphe, une liste numérotée), rien ne change et la fonction rend faux ; un bouton de style de la liste (disque, cercle, carré) retire le signe ; une liste à puces non modifiable refuse',
    run: async (h) => {
      await setDoc(h, '<ul><li><p>Mere</p><ul><li><p>Fille</p></li></ul></li></ul><ol><li><p>Numero</p></li></ol><p>Libre</p>');
      const out = {};
      await cursorIn('Fille');
      const depth = () => { let n = 0; while (ed().can().undo() && n < 40) { ed().commands.undo(); n++; } for (let i = 0; i < n; i++) ed().commands.redo(); return n; };
      const before = depth();
      out.applied = BulletFormat.apply(ed(), '➢');
      await sleep(80);
      out.child = charOf('Fille');
      out.parent = charOf('Mere');
      out.steps = depth() - before;
      ed().commands.undo(); await sleep(50);
      out.undone = charOf('Fille');
      ed().commands.redo(); await sleep(50);
      out.redone = charOf('Fille');
      await cursorIn('Numero');
      out.inOrdered = BulletFormat.apply(ed(), '✓');
      await cursorIn('Libre');
      out.inParagraph = BulletFormat.apply(ed(), '✓');
      await cursorIn('Fille');
      await h.clickButton('v2-btn-bullet-square');
      await sleep(100);
      out.afterStyle = charOf('Fille');
      out.styleKept = /data-bullet-style="square"/.test(written());
      BulletFormat.apply(ed(), '◆');
      await sleep(60);
      out.again = charOf('Fille');
      BulletFormat.apply(ed(), null);
      await sleep(60);
      out.cleared = charOf('Fille');
      ed().setEditable(false);
      out.readOnly = BulletFormat.apply(ed(), '✓');
      ed().setEditable(true);
      const pass = out.applied === true && out.child === '➢' && out.parent === '-' && out.steps === 1 && out.undone === '-' && out.redone === '➢'
        && out.inOrdered === false && out.inParagraph === false && out.afterStyle === '-' && out.styleKept && out.again === '◆' && out.cleared === '-' && out.readOnly === false;
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'bulletformat_the_marker_shows_the_sign_in_the_editor_and_the_reader',
    description: 'Le `::marker` du point montre le signe choisi suivi d\'une espace (« ➢ »), dans l\'éditeur comme dans la Lecture ; une liste sans signe garde le rond ou son style (« ° » pour le cercle)',
    run: async (h) => {
      await setDoc(h, '<ul data-bullet-char="➢" style="--pp-bullet-char: \'➢ \'"><li><p>Choisi</p></li></ul><ul data-bullet-style="circle"><li><p>Cercle</p></li></ul><ul><li><p>Rond</p></li></ul>');
      const editor = { chosen: markerContent('Choisi'), circle: markerContent('Cercle'), disc: markerContent('Rond') };
      const reader = document.getElementById('reader-container');
      let inReader;
      try {
        reader.style.display = 'block';
        await ReaderMode.render('<ul data-bullet-char="➢" style="--pp-bullet-char: \'➢ \'"><li><p>Choisi</p></li></ul><ul><li><p>Rond</p></li></ul>', null, { id: 1 }, NO_HF);
        const content = text => { const li = Array.from(reader.querySelectorAll('.reader-content li')).find(item => item.textContent.indexOf(text) !== -1); return li ? getComputedStyle(li, '::marker').content : null; };
        inReader = { chosen: content('Choisi'), disc: content('Rond') };
      } finally {
        reader.style.display = '';
        document.getElementById('editor-container').style.display = '';
      }
      const pass = editor.chosen === '"➢ "' && editor.circle === '"° "' && editor.disc === '"• "' && inReader.chosen === '"➢ "' && inReader.disc === '"• "';
      return { pass, notes: JSON.stringify({ editor, inReader }) };
    },
  });

  // Le PDF d'un HTML : les morceaux peints (texte) dans l'ordre.
  async function pdfItems(h, html) {
    const result = await h.exportPdfContent(html);
    const gt = await h.extractPdfGroundTruth(result.base64);
    return gt.pages[0].textItems;
  }
  cases.push({
    id: 'bulletformat_pdf_writes_the_chosen_sign_even_outside_the_text_font',
    description: 'PDF (relu par pdf.js) : le signe choisi est écrit devant le texte du point, qu\'il soit dans la police du texte (le tiret long « — ») ou seulement dans celle des symboles (« ➢ », « ✓ ») ; le texte du point reste lisible et la puce de la liste voisine sans signe est le rond',
    run: async (h) => {
      const html = '<ul data-bullet-char="➢" style="--pp-bullet-char: \'➢ \'"><li><p>Fleche</p></li></ul><ul data-bullet-char="✓" style="--pp-bullet-char: \'✓ \'"><li><p>Coche</p></li></ul><ul data-bullet-char="—" style="--pp-bullet-char: \'— \'"><li><p>Tiret</p></li></ul><ul><li><p>Rond</p></li></ul>';
      const items = await pdfItems(h, html);
      const text = items.map(i => i.str).join('|');
      const pass = /➢/.test(text) && /✓/.test(text) && /—/.test(text) && /•/.test(text) && /Fleche/.test(text) && /Coche/.test(text) && /Tiret/.test(text);
      return { pass, notes: text };
    },
  });
  cases.push({
    id: 'bulletformat_pdf_of_a_centered_item_and_a_rotated_frame_keeps_the_sign',
    description: 'PDF : un point centré (le signe est une colonne à part) et un cadre pivoté (texte dessiné en SVG) écrivent aussi le signe choisi',
    run: async (h) => {
      const centered = await pdfItems(h, '<ul data-bullet-char="➢" style="--pp-bullet-char: \'➢ \'"><li><p style="text-align: center">Centre</p></li></ul>');
      const turned = await pdfItems(h, FreeFrame.html({ x: 100, y: 100, w: 300, h: 100, rot: 90, shape: 'rect', fill: '', line: '', lw: 0 }, '<ul data-bullet-char="➢" style="--pp-bullet-char: \'➢ \'"><li><p>Pivote</p></li></ul>'));
      const a = centered.map(i => i.str).join('|');
      const b = turned.map(i => i.str).join('|');
      return { pass: /➢/.test(a) && /Centre/.test(a) && /➢/.test(b) && /Pivote/.test(b), notes: JSON.stringify({ a, b }) };
    },
  });

  cases.push({
    id: 'bulletformat_word_writes_the_sign_in_the_numbering',
    description: 'Word (numbering.xml) : la puce de la liste est le signe choisi (`w:lvlText`), dans la police des symboles pour une flèche ou une coche ; le tiret reste dans la police du texte ; une liste sans signe garde son rond',
    run: async (h) => {
      const out = await h.exportDocxParts('<ul data-bullet-char="➢" style="--pp-bullet-char: \'➢ \'"><li><p>Fleche</p></li></ul><ul data-bullet-char="–" style="--pp-bullet-char: \'– \'"><li><p>Tiret</p></li></ul><ul><li><p>Rond</p></li></ul>');
      const numbering = out.part('word/numbering.xml');
      const levels = Array.from(numbering.getElementsByTagName('w:lvl')).filter(l => l.getAttribute('w:ilvl') === '0').map((l) => {
        const text = (l.getElementsByTagName('w:lvlText')[0] || { getAttribute: () => null }).getAttribute('w:val');
        const fonts = l.getElementsByTagName('w:rFonts')[0];
        return text + '/' + (fonts ? fonts.getAttribute('w:ascii') : '-');
      });
      const pass = levels.indexOf('➢/Segoe UI Symbol') !== -1 && levels.some(l => /^–\/(?!Segoe)/.test(l)) && levels.some(l => /^•\//.test(l));
      return { pass, notes: JSON.stringify(levels) };
    },
  });

  cases.push({
    id: 'bulletformat_powerpoint_html_and_email_exports_write_the_sign',
    description: 'PowerPoint exporté (`a:buChar`, avec sa police), HTML exporté (`list-style-type` en chaîne) et texte d\'un courriel (« ➢ Fleche ») écrivent le signe choisi ; la liste sans signe garde le rond',
    run: async (h) => {
      const html = '<ul data-bullet-char="➢" style="--pp-bullet-char: \'➢ \'"><li><p>Fleche</p></li></ul><ul><li><p>Rond</p></li></ul>';
      await ExportEngines.ensure('pptx');
      const blob = await PptxExport.fromHtml(html, { title: 'x' });
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const xml = await zip.file('ppt/slides/slide1.xml').async('string');
      const bullets = (xml.match(/<a:buFont typeface="[^"]*"\/><a:buChar char="[^"]*"\/>/g) || []);
      const exported = await h.exportHtml(html, null, {}, null, '', { fragment: true });
      const body = exported.text.slice(exported.text.lastIndexOf('</style>') + 8);
      const mail = MailtoExport.plainTextFromHtml(html);
      const pass = bullets.some(b => b.indexOf('Segoe UI Symbol') !== -1 && b.indexOf('char="➢"') !== -1) && bullets.some(b => b.indexOf('char="•"') !== -1)
        && /<ul[^>]*list-style-type: '➢ '/.test(body) && /➢ Fleche/.test(mail) && /• Rond/.test(mail);
      return { pass, notes: JSON.stringify({ bullets, body, mail }) };
    },
  });

  cases.push({
    id: 'bulletformat_every_preset_sign_has_a_glyph_in_the_pdf_fonts',
    description: 'Chaque signe courant de la fenêtre « Puce… » est dessinable dans le PDF : dans la police du texte (Roboto) ou dans celle des symboles ; aucun ne ressortirait en case vide',
    run: async () => {
      const missing = BulletFormat.PRESETS.filter((char) => {
        const code = char.codePointAt(0);
        return !(code <= 0xFF || PdfGlyphFallback.covers('Roboto', false, false, code) || PdfGlyphFallback.covers('PPSymbols', false, false, code));
      });
      return { pass: missing.length === 0, notes: JSON.stringify(missing) };
    },
  });

  // --- La couleur et la taille de la puce (lot 9e) ----------------------------------------------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'bulletformat_look_normalizers_and_one_undo',
    description: 'Les champs « Couleur » et « Taille » : #rgb et #rrggbb (dièse facultatif) en #rrggbb minuscule, tailles de 4 à 400 pt (virgule permise), le reste refusé ; `apply` pose couleur et taille sur le point du curseur seul, avec le signe, en UN Annuler ; null les retire',
    run: async (h) => {
      const colors = [['#CC0000', '#cc0000'], ['c00', '#cc0000'], [' #0a0 ', '#00aa00'], ['rouge', null], ['#12345', null], ['url(x)', null], ['', null]];
      const sizes = [['12', '12pt'], ['18,5', '18.5pt'], ['4', '4pt'], ['400', '400pt'], ['3', null], ['401', null], ['12px', null], ['1e2', null], ['', null]];
      const badColors = colors.filter(([raw, want]) => BulletFormat.colorNormalized(raw) !== want);
      const badSizes = sizes.filter(([raw, want]) => BulletFormat.sizeNormalized(raw) !== want);
      await setDoc(h, '<ul><li><p>Alpha</p></li><li><p>Beta</p></li></ul>');
      await cursorIn('Alpha');
      const before = written();
      const applied = BulletFormat.apply(ed(), '➢', { color: '#cc0000', size: '20pt' });
      await sleep(100);
      const html = written();
      const items = Array.from(ed().view.dom.querySelectorAll('li'));
      const looks = items.map(li => [li.getAttribute('data-bullet-color'), li.getAttribute('data-bullet-size')]);
      ed().commands.undo();
      await sleep(100);
      const undone = written() === before;
      ed().commands.redo();
      await sleep(100);
      BulletFormat.apply(ed(), '➢', { color: null });
      await sleep(100);
      const cleared = Array.from(ed().view.dom.querySelectorAll('li')).map(li => [li.getAttribute('data-bullet-color'), li.getAttribute('data-bullet-size')]);
      const look = BulletFormat.currentLook(ed());
      return {
        pass: applied && badColors.length === 0 && badSizes.length === 0 && JSON.stringify(looks) === '[["#cc0000","20pt"],[null,null]]' && /data-bullet-char="➢"/.test(html) && undone
          && JSON.stringify(cleared) === '[[null,"20pt"],[null,null]]' && look.color === null && look.size === '20pt',
        notes: JSON.stringify({ badColors, badSizes, looks, html, undone, cleared, look }),
      };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.bulletFormat = cases;
})();
