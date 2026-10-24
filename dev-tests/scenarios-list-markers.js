// Suite "listMarkers" - les ronds, les tirets et les numéros d'une liste suivent leur ligne (js/list-markers.js ; choix du porteur, 22/10, « Dans tous les modèles ») : ils prennent la couleur et la taille
// du début du texte de leur point, dans l'éditeur (`li::marker`, css/editor-v2.css), la Lecture, le PDF (une puce de la couleur et de la taille du texte, dans le flux, dans une case, dans un cadre tourné),
// le Word (la marque de fin du paragraphe), le PowerPoint (la puce est de la taille du texte : aucun `buSzPct`) et le HTML. Sans réglage de couleur ni de taille sur le texte, rien ne change.
(function () {
  const cases = [];
  const RED = 'color: #ff0000; font-size: 28pt';
  const LIST = `<ul><li><p><span style="${RED}">Rouge</span></p></li><li><p>Normal</p></li></ul>`;
  const px = pt => pt * 96 / 72;
  const near = (a, b, tolerance = 0.2) => Math.abs(a - b) <= tolerance;
  const items = (root, selector) => Array.from(root.querySelectorAll(selector || 'li'));
  const marker = li => getComputedStyle(li, '::marker');
  const isRed = style => style.color === 'rgb(255, 0, 0)';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  async function load(h, html) {
    await h.resetEditor();
    Editor.setHTML(html);
    await sleep(120);
  }
  // Tous les objets d'un contenu pdfmake qui répondent à `test`, à toute profondeur.
  function findAll(node, test, out = []) {
    if (Array.isArray(node)) { node.forEach(child => findAll(child, test, out)); return out; }
    if (!node || typeof node !== 'object') return out;
    if (test(node)) out.push(node);
    Object.keys(node).forEach(key => { if (key !== 'image') findAll(node[key], test, out); });
    return out;
  }
  const isBullet = node => node && node.text === '• ' && typeof node.fontSize === 'number';

  // --- L'éditeur --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'listmarker_editor_bullet_follows_text',
    description: 'Dans l\'éditeur, le rond d\'un point dont le texte est rouge de 28 pt est rouge et de 28 pt ; celui d\'un point sans réglage garde la couleur et la taille du point',
    run: async (h) => {
      await load(h, LIST);
      const [red, plain] = items(h.tiptap());
      const m0 = marker(red);
      const m1 = marker(plain);
      const base = getComputedStyle(plain);
      return {
        pass: isRed(m0) && near(parseFloat(m0.fontSize), px(28)) && m1.color === base.color && m1.fontSize === base.fontSize,
        notes: JSON.stringify({ red: [m0.color, m0.fontSize], plain: [m1.color, m1.fontSize], base: [base.color, base.fontSize] }),
      };
    },
  });

  cases.push({
    id: 'listmarker_editor_number_follows_text',
    description: 'Un numéro de liste numérotée suit aussi la couleur et la taille du texte de son point',
    run: async (h) => {
      await load(h, '<ol><li><p><span style="color: #0000ff; font-size: 20pt">Bleu</span></p></li><li><p>Normal</p></li></ol>');
      const [blue, plain] = items(h.tiptap());
      const m0 = marker(blue);
      return {
        pass: m0.color === 'rgb(0, 0, 255)' && near(parseFloat(m0.fontSize), px(20)) && marker(plain).fontSize === getComputedStyle(plain).fontSize,
        notes: JSON.stringify([m0.color, m0.fontSize, marker(plain).fontSize]),
      };
    },
  });

  cases.push({
    id: 'listmarker_editor_color_only_or_size_only',
    description: 'Un texte qui n\'a que la couleur donne la couleur à la puce sans toucher à sa taille, et inversement',
    run: async (h) => {
      await load(h, '<ul><li><p><span style="color: #ff0000">Couleur</span></p></li><li><p><span style="font-size: 24pt">Taille</span></p></li></ul>');
      const [colored, sized] = items(h.tiptap());
      const base = getComputedStyle(colored);
      const mc = marker(colored);
      const ms = marker(sized);
      return {
        pass: isRed(mc) && mc.fontSize === base.fontSize && ms.color === base.color && near(parseFloat(ms.fontSize), px(24)),
        notes: JSON.stringify({ colored: [mc.color, mc.fontSize], sized: [ms.color, ms.fontSize], base: [base.color, base.fontSize] }),
      };
    },
  });

  cases.push({
    id: 'listmarker_editor_sublist_keeps_its_own',
    description: 'Une sous-liste ne reçoit pas le réglage de son parent : sa puce suit son propre texte',
    run: async (h) => {
      await load(h, `<ul><li><p><span style="${RED}">Parent</span></p><ul><li><p>Enfant</p></li><li><p><span style="color: #0000ff">Bleu</span></p></li></ul></li></ul>`);
      const [parent, child, blue] = items(h.tiptap());
      const mp = marker(parent);
      const mc = marker(child);
      const mb = marker(blue);
      const base = getComputedStyle(child);
      return {
        pass: isRed(mp) && near(parseFloat(mp.fontSize), px(28)) && mc.color === base.color && mc.fontSize === base.fontSize && mb.color === 'rgb(0, 0, 255)' && mb.fontSize === base.fontSize,
        notes: JSON.stringify({ parent: [mp.color, mp.fontSize], child: [mc.color, mc.fontSize], blue: [mb.color, mb.fontSize], base: [base.color, base.fontSize] }),
      };
    },
  });

  cases.push({
    id: 'listmarker_editor_first_text_decides',
    description: 'C\'est le premier texte du point qui décide : un espace, une image ou la suite du texte n\'y changent rien',
    run: async (h) => {
      await load(h, '<ul><li><p><span style="color: #ff0000; font-size: 28pt">Début</span> puis <span style="color: #0000ff; font-size: 12pt">fin</span></p></li>'
        + '<li><p> <span style="color: #0000ff; font-size: 24pt">Après un espace</span></p></li></ul>');
      const [first, second] = items(h.tiptap());
      const m0 = marker(first);
      const m1 = marker(second);
      return {
        pass: isRed(m0) && near(parseFloat(m0.fontSize), px(28)) && m1.color === 'rgb(0, 0, 255)' && near(parseFloat(m1.fontSize), px(24)),
        notes: JSON.stringify([m0.color, m0.fontSize, m1.color, m1.fontSize]),
      };
    },
  });

  cases.push({
    id: 'listmarker_editor_follows_a_change',
    description: 'Colorier et agrandir le texte d\'un point change sa puce tout de suite',
    run: async (h) => {
      await load(h, '<ul><li><p>Texte</p></li></ul>');
      const li = items(h.tiptap())[0];
      const before = marker(li).color;
      const ed = EditorCore.getEditor();
      ed.chain().focus().selectAll().setTextColor('#008000').setFontSize('24pt').run();
      await sleep(120);
      const m = marker(items(h.tiptap())[0]);
      return { pass: before !== 'rgb(0, 128, 0)' && m.color === 'rgb(0, 128, 0)' && near(parseFloat(m.fontSize), px(24)), notes: JSON.stringify({ before, after: [m.color, m.fontSize] }) };
    },
  });

  cases.push({
    id: 'listmarker_editor_new_empty_item_keeps_the_style',
    description: 'Entrée à la fin d\'une ligne rouge ouvre un point dont la puce est déjà rouge, avant la première lettre',
    run: async (h) => {
      await load(h, '<ul><li><p><span style="color: #ff0000; font-size: 24pt">Rouge</span></p></li></ul>');
      await h.focusInElement(items(h.tiptap())[0].querySelector('p'), false);
      h.tiptap().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
      await sleep(120);
      const all = items(h.tiptap());
      const empty = all[1];
      const m = empty && marker(empty);
      return { pass: all.length === 2 && !empty.textContent.trim() && isRed(m) && near(parseFloat(m.fontSize), px(24)), notes: JSON.stringify({ count: all.length, marker: m && [m.color, m.fontSize] }) };
    },
  });

  cases.push({
    id: 'listmarker_editor_nothing_in_the_saved_html',
    description: 'Le réglage de la puce n\'est qu\'à l\'écran : le HTML enregistré n\'en porte rien',
    run: async (h) => {
      await load(h, LIST);
      const html = Editor.getHTML();
      return { pass: !/pp-marker/.test(html) && /Rouge/.test(html), notes: html };
    },
  });

  cases.push({
    id: 'listmarker_editor_task_list_untouched',
    description: 'Une liste à cases n\'a pas de puce : ses points ne reçoivent aucune variable',
    run: async (h) => {
      await load(h, `<ul data-type="taskList"><li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span></span></label><div><p><span style="${RED}">Tâche</span></p></div></li></ul>`);
      const li = h.tiptap().querySelector('ul[data-type="taskList"] > li');
      return { pass: !!li && !li.getAttribute('style') && li.style.getPropertyValue('--pp-marker-color') === '', notes: li && li.outerHTML };
    },
  });

  // --- La Lecture ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'listmarker_reader_bullet_follows_text',
    description: 'Dans la Lecture, la puce suit aussi la couleur et la taille du texte du point',
    run: async (h) => {
      const content = await h.renderReaderMode(LIST);
      const [red, plain] = items(content);
      const m0 = marker(red);
      const base = getComputedStyle(plain);
      return {
        pass: isRed(m0) && near(parseFloat(m0.fontSize), px(28)) && marker(plain).color === base.color && marker(plain).fontSize === base.fontSize && !plain.style.getPropertyValue('--pp-marker-color'),
        notes: JSON.stringify({ red: [m0.color, m0.fontSize, red.getAttribute('style')], plain: [marker(plain).color, marker(plain).fontSize, plain.getAttribute('style')] }),
      };
    },
  });

  // --- Le PDF ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'listmarker_pdf_bullet_follows_text',
    description: 'Dans le PDF, la puce d\'un point au texte rouge de 28 pt est rouge et de 28 pt ; celle d\'un point sans réglage n\'a ni couleur ni autre taille que le corps',
    run: async (h) => {
      const result = await h.exportPdfContent(LIST, null);
      const bullets = findAll(result.content, isBullet);
      const red = bullets.find(b => b.fontSize === 28);
      const plain = bullets.find(b => b.fontSize !== 28);
      const body = findAll(result.content, node => node.text === 'Normal')[0];
      return {
        pass: bullets.length === 2 && !!red && red.color === '#ff0000' && red.leadingIndent < 0 && !!plain && !plain.color && !!body && plain.fontSize === body.fontSize,
        notes: JSON.stringify(bullets),
      };
    },
  });

  cases.push({
    id: 'listmarker_pdf_bullet_width_follows_size',
    description: 'Dans le PDF, la puce de 28 pt est écrite plus large que celle du corps : le retrait suspendu suit sa taille',
    run: async (h) => {
      const result = await h.exportPdfContent(LIST, null);
      const bullets = findAll(result.content, isBullet);
      const red = bullets.find(b => b.fontSize === 28);
      const plain = bullets.find(b => b.fontSize !== 28);
      return { pass: !!red && !!plain && near(red.leadingIndent / plain.leadingIndent, red.fontSize / plain.fontSize, 0.02), notes: JSON.stringify(bullets) };
    },
  });

  cases.push({
    id: 'listmarker_pdf_centered_item',
    description: 'Dans le PDF, un point centré (puce et texte en deux colonnes) garde la couleur et la taille de sa puce',
    run: async (h) => {
      const result = await h.exportPdfContent(`<ul><li><p style="text-align: center"><span style="${RED}">Centré</span></p></li></ul>`, null);
      // La colonne du signe porte ses séries de caractères en liste (`text: [{ text: '• ', fontSize, color }]`, js/pdf-export.js:markerRuns) depuis le lot 9d.
      const columns = findAll(result.content, node => Array.isArray(node.columns) && node.columns.some(column => Array.isArray(column.text) && column.text.some(isBullet)));
      const column = columns.length ? columns[0].columns.find(candidate => Array.isArray(candidate.text) && candidate.text.some(isBullet)) : null;
      const bullet = column && column.text.find(isBullet);
      return { pass: !!bullet && bullet.color === '#ff0000' && bullet.fontSize === 28 && column.noWrap === true, notes: JSON.stringify(columns) };
    },
  });

  cases.push({
    id: 'listmarker_pdf_table_cell',
    description: 'Dans le PDF, la puce d\'un point dans une case de tableau suit aussi son texte',
    run: async (h) => {
      const result = await h.exportPdfContent(`<table><tbody><tr><td><ul><li><p><span style="${RED}">Dans la case</span></p></li></ul></td></tr></tbody></table>`, null);
      const bullets = findAll(result.content, isBullet);
      return { pass: bullets.length === 1 && bullets[0].color === '#ff0000' && bullets[0].fontSize === 28 && bullets[0].leadingIndent < 0, notes: JSON.stringify(bullets) };
    },
  });

  cases.push({
    id: 'listmarker_pdf_rotated_frame',
    description: 'Dans le PDF, la puce d\'un cadre tourné (texte écrit en SVG) est rouge et de 28 pt',
    run: async (h) => {
      const frame = `<div class="pp-free-frame" role="group" data-ff-x="60" data-ff-y="80" data-ff-w="420" data-ff-h="200" data-ff-rot="30"><div class="pp-free-frame-box"><div class="pp-free-frame-content">${LIST}</div></div></div>`;
      const result = await h.exportPdfContent('<p>Avant</p>' + frame, null);
      // Un cadre devant le texte n'est pas dans le flux : il attend au pied de sa page (PdfExport.placeFrames, `_frontFramesByPage`).
      const placed = [result.content, result.content._frontFramesByPage];
      const svgs = findAll(placed, node => typeof node.svg === 'string' && node.svg.includes('<text'));
      const svg = svgs.map(node => node.svg).join('');
      const bullets = svg.match(/<text [^>]*>•<\/text>/g) || [];
      const red = bullets.find(tag => /fill="#ff0000"/.test(tag));
      return { pass: bullets.length === 2 && !!red && /font-size="28"/.test(red), notes: JSON.stringify({ bullets, svgs: svgs.length, keys: Object.keys(result.content), svg: svg.slice(0, 600) }) };
    },
  });

  // --- Le Word ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'listmarker_docx_paragraph_mark',
    description: 'Dans le Word, la puce prend la couleur et la taille du texte par la marque de fin du paragraphe ; un point sans réglage n\'en porte pas',
    run: async (h) => {
      const docx = await h.exportDocxParts(LIST, null);
      const listParagraphs = Array.from(docx.doc.getElementsByTagName('w:p')).filter(p => p.getElementsByTagName('w:numPr').length);
      const mark = p => {
        const pPr = p.getElementsByTagName('w:pPr')[0];
        const rPr = pPr && Array.from(pPr.children).find(child => child.tagName === 'w:rPr');
        const val = tag => { const el = rPr && rPr.getElementsByTagName(tag)[0]; return el ? el.getAttribute('w:val') : null; };
        return rPr ? { color: val('w:color'), size: val('w:sz') } : null;
      };
      const [red, plain] = listParagraphs.map(mark);
      return { pass: listParagraphs.length === 2 && !!red && red.color === 'FF0000' && red.size === '56' && plain === null, notes: JSON.stringify({ red, plain }) };
    },
  });

  // --- Le PowerPoint ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'listmarker_pptx_bullet_is_text_sized',
    description: 'Dans le PowerPoint, la puce d\'un texte de 28 pt est de la taille de ce texte (aucun `buSzPct`), non plus un tiers de lui',
    run: async (h) => {
      await ExportEngines.ensure('pptx');
      const blob = await PptxExport.fromHtml(`<h1>Titre</h1>${LIST}`, { title: 'Essai' });
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const xml = new DOMParser().parseFromString(await zip.file('ppt/slides/slide1.xml').async('string'), 'application/xml');
      const paragraphs = Array.from(xml.getElementsByTagName('a:p')).map(p => ({
        text: Array.from(p.getElementsByTagName('a:t')).map(t => t.textContent).join(''),
        pPr: p.getElementsByTagName('a:pPr')[0] || null,
      }));
      const red = paragraphs.find(p => p.text === 'Rouge');
      const plain = paragraphs.find(p => p.text === 'Normal');
      const scale = p => (p && p.pPr && p.pPr.getElementsByTagName('a:buSzPct')[0]) || null;
      const bulleted = p => !!(p && p.pPr && p.pPr.getElementsByTagName('a:buChar')[0]);
      return { pass: !!red && !!plain && bulleted(red) && bulleted(plain) && scale(red) === null, notes: JSON.stringify({ red: red && red.pPr && red.pPr.outerHTML, plain: plain && plain.pPr && plain.pPr.outerHTML }) };
    },
  });

  // --- Le HTML ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'listmarker_html_export',
    description: 'Dans le HTML exporté, le point au texte rouge porte les deux variables de sa puce, et la feuille de style les lit ; un point sans réglage n\'en porte pas',
    run: async (h) => {
      const out = await h.exportHtml(LIST, null, {}, null, '', { fragment: true });
      const holder = document.createElement('div');
      holder.innerHTML = out.text.replace(/<style[\s\S]*?<\/style>/g, '');
      const [red, plain] = items(holder);
      return {
        pass: !!red && red.style.getPropertyValue('--pp-marker-color') === 'rgb(255, 0, 0)' && red.style.getPropertyValue('--pp-marker-size') === '28pt'
          && !!plain && plain.style.getPropertyValue('--pp-marker-color') === '' && /\.pp-doc li::marker\s*\{[^}]*var\(--pp-marker-color/.test(out.text),
        notes: out.text.slice(0, 1500),
      };
    },
  });

  // --- Une puce à elle (« Puce… », lot 9e de « Import PowerPoint sans perte ») : `bulletColor` et `bulletSize` du point l'emportent sur le texte, couleur et taille chacune de son côté ---------------------
  // Un point vert de 24 pt devant un texte rouge de 12 pt ; un point bleu devant un texte de 28 pt (la taille vient du texte) ; un point sans réglage devant un texte rouge de 28 pt.
  const OWN = '<ul><li data-bullet-color="#00aa00" data-bullet-size="24pt" style="--pp-marker-color: #00aa00; --pp-marker-size: 24pt"><p><span style="color: #ff0000; font-size: 12pt">Propre</span></p></li>'
    + '<li data-bullet-color="#0000ff" style="--pp-marker-color: #0000ff"><p><span style="font-size: 28pt">Mixte</span></p></li>'
    + `<li><p><span style="${RED}">Suit</span></p></li></ul>`;
  cases.push({
    id: 'listmarker_own_editor_wins_over_text',
    description: 'Dans l\'éditeur, la puce du point « Propre » est verte de 24 pt (non rouge de 12 pt comme son texte), celle du point « Mixte » bleue et de 28 pt (la taille vient de son texte), celle du point « Suit » rouge de 28 pt ; le HTML de l\'éditeur garde les deux attributs et les relit',
    run: async (h) => {
      await load(h, OWN);
      const [own, mixed, follows] = items(h.tiptap());
      const m = [own, mixed, follows].map(li => ({ color: marker(li).color, fontSize: marker(li).fontSize }));
      const html = Editor.getHTML();
      await load(h, html);
      const again = items(h.tiptap()).map(li => [li.getAttribute('data-bullet-color'), li.getAttribute('data-bullet-size')]);
      return {
        pass: m[0].color === 'rgb(0, 170, 0)' && near(parseFloat(m[0].fontSize), px(24)) && m[1].color === 'rgb(0, 0, 255)' && near(parseFloat(m[1].fontSize), px(28))
          && isRed(m[2]) && near(parseFloat(m[2].fontSize), px(28)) && JSON.stringify(again) === '[["#00aa00","24pt"],["#0000ff",null],[null,null]]',
        notes: JSON.stringify({ m: m.map(s => [s.color, s.fontSize]), again, html }),
      };
    },
  });
  cases.push({
    id: 'listmarker_own_refuses_unsafe_values',
    description: 'Une couleur ou une taille de puce qui n\'en est pas une (`url(x)`, `red; x: y`, `99999pt`) n\'est pas gardée : ni attribut ni variable',
    run: async (h) => {
      await load(h, '<ul><li data-bullet-color="url(x)" data-bullet-size="99999pt"><p>A</p></li><li data-bullet-color="red; x: y"><p>B</p></li></ul>');
      const html = Editor.getHTML();
      return { pass: !/data-bullet-color|data-bullet-size|pp-marker/.test(html), notes: html };
    },
  });
  cases.push({
    id: 'listmarker_own_reader_and_html_export',
    description: 'Dans la Lecture et le HTML exporté, le point « Propre » porte --pp-marker-color #00aa00 et --pp-marker-size 24pt, le point « Mixte » la couleur bleue et la taille de son texte',
    run: async (h) => {
      const content = await h.renderReaderMode(OWN);
      const [own, mixed] = items(content);
      const out = await h.exportHtml(OWN, null, {}, null, '', { fragment: true });
      const holder = document.createElement('div');
      holder.innerHTML = out.text.replace(/<style[\s\S]*?<\/style>/g, '');
      const [hOwn, hMixed] = items(holder);
      const vars = li => [li.style.getPropertyValue('--pp-marker-color'), li.style.getPropertyValue('--pp-marker-size')].join('|');
      const reader = [vars(own), vars(mixed)];
      return {
        pass: reader[0] === '#00aa00|24pt' && /^#0000ff\|28pt$/.test(reader[1]) && marker(own).color === 'rgb(0, 170, 0)' && near(parseFloat(marker(own).fontSize), px(24))
          && vars(hOwn) === '#00aa00|24pt' && /^#0000ff\|28pt$/.test(vars(hMixed)),
        notes: JSON.stringify({ reader, html: [vars(hOwn), vars(hMixed)] }),
      };
    },
  });
  cases.push({
    id: 'listmarker_own_pdf',
    description: 'Dans le PDF, la puce du point « Propre » est verte de 24 pt, celle du point « Mixte » bleue de 28 pt, celle du point « Suit » rouge de 28 pt',
    run: async (h) => {
      const result = await h.exportPdfContent(OWN, null);
      const bullets = findAll(result.content, isBullet).map(b => [b.color, b.fontSize]);
      return { pass: JSON.stringify(bullets) === '[["#00aa00",24],["#0000ff",28],["#ff0000",28]]', notes: JSON.stringify(bullets) };
    },
  });
  cases.push({
    id: 'listmarker_own_docx',
    description: 'Dans le Word, la marque de fin du paragraphe du point « Propre » est verte de 24 pt, celle du point « Mixte » bleue de 28 pt',
    run: async (h) => {
      const docx = await h.exportDocxParts(OWN, null);
      const listParagraphs = Array.from(docx.doc.getElementsByTagName('w:p')).filter(p => p.getElementsByTagName('w:numPr').length);
      const mark = (p) => {
        const pPr = p.getElementsByTagName('w:pPr')[0];
        const rPr = pPr && Array.from(pPr.children).find(child => child.tagName === 'w:rPr');
        const val = tag => { const el = rPr && rPr.getElementsByTagName(tag)[0]; return el ? el.getAttribute('w:val') : null; };
        return rPr ? [val('w:color'), val('w:sz')] : null;
      };
      const marks = listParagraphs.map(mark);
      return { pass: JSON.stringify(marks.slice(0, 2)) === '[["00AA00","48"],["0000FF","56"]]', notes: JSON.stringify(marks) };
    },
  });
  cases.push({
    id: 'listmarker_own_pptx',
    description: 'Dans le PowerPoint, le point « Propre » écrit sa couleur propre (`a:buClr` 00AA00) et sa taille en pour cent de son texte (24 pt sur 12 pt : 200 %) ; le point « Suit », dont la puce suit son texte, n\'écrit aucune couleur',
    run: async (h) => {
      await ExportEngines.ensure('pptx');
      const blob = await PptxExport.fromHtml(`<h1>Titre</h1>${OWN}`, { title: 'Essai' });
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const name = Object.keys(zip.files).find(file => /^ppt\/slides\/slide1\.xml$/.test(file));
      const xml = new DOMParser().parseFromString(await zip.file(name).async('string'), 'application/xml');
      const paragraphs = Array.from(xml.getElementsByTagName('a:p')).map(p => ({
        text: Array.from(p.getElementsByTagName('a:t')).map(n => n.textContent).join(''),
        color: p.getElementsByTagName('a:buClr')[0] ? p.getElementsByTagName('a:buClr')[0].firstElementChild.getAttribute('val') : null,
        size: p.getElementsByTagName('a:buSzPct')[0] ? p.getElementsByTagName('a:buSzPct')[0].getAttribute('val') : null,
      }));
      const by = text => paragraphs.find(p => p.text === text);
      return { pass: !!by('Propre') && by('Propre').color === '00AA00' && by('Propre').size === '200000' && !!by('Suit') && by('Suit').color === null, notes: JSON.stringify(paragraphs) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.listMarkers = cases;
})();
