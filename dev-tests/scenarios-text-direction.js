// Suite "textDirection" - « Texte de droite à gauche » (js/text-direction.js, css/text-direction.css, js/paragraph-format.js, js/pdf-export.js, js/docx-export.js, js/pptx-export.js, js/pptx-import.js),
// lot 9h du chantier 9 « Caractères et puces » du plan « Import PowerPoint sans perte » (`a:pPr rtl="1"`) :
//  1) le RÉGLAGE : l'attribut `dir` du paragraphe, du titre et de la liste et son aller-retour HTML (seul `data-dir` est lu), la ligne à cocher du menu Alignement (pose, retrait, listes, Annuler,
//     Entrée garde le sens, grisée en en-tête) ;
//  2) le DESSIN : le CSS retourne le paragraphe, la liste passe ses puces à droite, le retrait de « Paragraphe… » est un remplissage à droite ;
//  3) les SORTIES : le PDF relu par pdf.js (texte à droite, puce à droite), le Word (`w:bidi`, alignement retourné) et le PowerPoint (`rtl="1"`, alignement dit, retrait depuis la droite) dézippés, puis le
//     PowerPoint relu.
// La vraie souris et le vrai clavier à 700x400 sont dans dev-tests/verify-text-direction-mouse.mjs ; la lecture d'un fichier PowerPoint est dans dev-tests/scenarios-pptx-import.js.
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const ed = () => EditorCore.getEditor();
  const row = () => document.getElementById('v2-btn-rtl');
  const RTL = ' dir="rtl" data-dir="rtl"';
  const TASK_BOX_PT = 11.25;
  const written = () => Editor.getHTML().replace(/<p><\/p>$/, '');
  async function setDoc(h, html) {
    await h.resetEditor();
    Editor.setHTML(html);
    await sleep(150);
  }
  function positionOf(predicate) {
    let found = null;
    ed().state.doc.descendants((node, pos) => { if (found == null && predicate(node)) found = pos; });
    return found;
  }
  const textPos = text => positionOf(n => n.isText && n.text.indexOf(text) !== -1);
  async function cursorIn(text) {
    ed().commands.setTextSelection(textPos(text) + 1);
    await sleep(150);
  }
  async function press() {
    row().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    row().click();
    await sleep(150);
  }
  // Les blocs du document : « Aa* » quand le texte va de droite à gauche, listes comprises (« [liste*] »).
  function dirList() {
    const out = [];
    ed().state.doc.descendants((node) => {
      if (node.type.name === 'paragraph' || node.type.name === 'heading') { if (node.textContent || node.attrs.dir) out.push(node.textContent + (node.attrs.dir === 'rtl' ? '*' : '')); }
      else if (/List$/.test(node.type.name)) out.push('[liste' + (node.attrs.dir === 'rtl' ? '*' : '') + ']');
    });
    return out.join('|');
  }
  function inPage(html, read) {
    const host = document.createElement('div');
    host.className = 'tiptap';
    host.style.cssText = 'position:absolute;left:0;top:0;width:400px';
    host.innerHTML = html;
    document.body.appendChild(host);
    try { return read(host); } finally { host.remove(); }
  }

  // Les pixels d'une page de PDF rendue par pdf.js : le rectangle englobant de l'encre sombre (pt depuis le haut-gauche).
  async function renderPdfPage(base64) {
    await TestHelpers.ensurePdfJsLoaded();
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
    const page = await pdf.getPage(1);
    const scale = 2;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    await page.render({ canvasContext: ctx, viewport }).promise;
    const items = (await page.getTextContent()).items.filter(i => i.str && i.str.trim()).map(i => ({ str: i.str, x: i.transform[4], width: i.width }));
    return {
      width: viewport.width / scale,
      items,
      bbox: (x0, y0, x1, y1) => {
        const w = Math.round((x1 - x0) * scale);
        const h = Math.round((y1 - y0) * scale);
        const data = ctx.getImageData(Math.round(x0 * scale), Math.round(y0 * scale), w, h).data;
        let left = Infinity, right = -Infinity;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] < 110 && data[i + 1] < 110 && data[i + 2] < 110) {
            const x = (i / 4) % w;
            if (x < left) left = x; if (x > right) right = x;
          }
        }
        return right < 0 ? null : { left: x0 + left / scale, right: x0 + (right + 1) / scale };
      },
    };
  }

  // === 1) Le réglage ===================================================================================================================================================
  cases.push({
    id: 'textdirection_attribute_survives_the_html_round_trip_and_only_data_dir_is_read',
    description: 'Le sens est l\'attribut `dir` du paragraphe, du titre et de la liste, écrit avec `data-dir` ; seul `data-dir="rtl"` est lu à l\'ouverture d\'un HTML (un `dir="rtl"` seul, collé d\'une page web, est sans effet) ; un paragraphe ordinaire n\'a aucun attribut ; Entrée à la fin d\'un paragraphe de droite à gauche ouvre un paragraphe de droite à gauche',
    run: async (h) => {
      await setDoc(h, '<p' + RTL + '>Droite</p><p dir="rtl">Collé</p><h2' + RTL + '>Titre</h2><ul' + RTL + '><li><p' + RTL + '>Puce</p></li></ul><p>Gauche</p>');
      const html = written();
      const list = dirList();
      ed().commands.setTextSelection(textPos('Droite') + 6);
      ed().commands.splitBlock();
      await sleep(100);
      const split = dirList();
      const pass = list === 'Droite*|Collé|Titre*|[liste*]|Puce*|Gauche' && /<p dir="rtl" data-dir="rtl">Droite<\/p>/.test(html) && /<p>Collé<\/p>/.test(html) && /<h2 dir="rtl" data-dir="rtl">Titre<\/h2>/.test(html)
        && /<ul dir="rtl" data-dir="rtl">/.test(html) && /<p>Gauche<\/p>/.test(html) && /^Droite\*\|\*\|Collé/.test(split);
      return { pass, notes: JSON.stringify({ list, split, html }) };
    },
  });

  cases.push({
    id: 'textdirection_the_menu_row_sets_and_removes_the_direction_in_one_history_step',
    description: 'La ligne « Texte de droite à gauche » du menu Alignement est décochée sur un paragraphe ordinaire ; un clic pose le sens (la ligne se coche) ; un second le retire ; sur une sélection de plusieurs paragraphes aux sens mêlés un clic le pose à tous, puis le retire à tous ; Annuler défait un clic d\'un coup ; dans une liste le clic pose le sens de la liste et de ses paragraphes',
    run: async (h) => {
      await setDoc(h, '<p>Un</p><p' + RTL + '>Deux</p><p>Trois</p><ul><li><p>Puce</p></li></ul>');
      const out = {};
      await cursorIn('Un');
      out.before = [row().getAttribute('aria-checked'), dirList()];
      await press();
      out.on = [row().getAttribute('aria-checked'), dirList()];
      await press();
      out.off = [row().getAttribute('aria-checked'), dirList()];
      ed().commands.setTextSelection({ from: textPos('Un') + 1, to: textPos('Trois') + 1 });
      await sleep(100);
      out.mixed = row().getAttribute('aria-checked');
      await press();
      out.all = dirList();
      out.allChecked = row().getAttribute('aria-checked');
      await press();
      out.none = dirList();
      await press();
      ed().commands.undo();
      await sleep(100);
      out.undone = dirList();
      await cursorIn('Puce');
      await press();
      out.list = dirList();
      const pass = out.before[0] === 'false' && out.on[0] === 'true' && out.on[1] === 'Un*|Deux*|Trois|[liste]|Puce'.replace('Deux*', 'Deux*') && out.off[0] === 'false' && out.mixed === 'false'
        && out.all === 'Un*|Deux*|Trois*|[liste]|Puce' && out.allChecked === 'true' && out.none === 'Un|Deux|Trois|[liste]|Puce' && out.undone === 'Un|Deux|Trois|[liste]|Puce'
        && out.list === 'Un|Deux|Trois|[liste*]|Puce*';
      return { pass, notes: JSON.stringify(out) };
    },
  });

  // === 2) Le dessin ===================================================================================================================================================
  cases.push({
    id: 'textdirection_css_turns_the_paragraph_and_puts_the_list_markers_on_the_right',
    description: 'Un paragraphe `dir="rtl"` est écrit de droite à gauche et aligné à droite sans autre réglage ; une liste de droite à gauche a son remplissage à droite (rien à gauche) et ses points sont plus à gauche que le bord droit de la liste ; le retrait de « Paragraphe… » (`data-indent-left`) d\'un paragraphe de droite à gauche est un remplissage à droite, celui d\'un paragraphe ordinaire reste à gauche',
    run: async (h) => {
      await setDoc(h, '<p' + RTL + '>Droite</p><ul' + RTL + '><li><p' + RTL + '>Puce</p></li></ul><p' + RTL + ' data-indent-left="36">Retrait</p><p data-indent-left="36">Normal</p>');
      const html = written();
      const read = inPage(html, (host) => {
        const p = host.querySelector('p');
        const ul = host.querySelector('ul');
        const li = ul.querySelector('li');
        const indented = Array.from(host.querySelectorAll('p')).find(x => x.textContent === 'Retrait');
        const normal = Array.from(host.querySelectorAll('p')).find(x => x.textContent === 'Normal');
        const pr = p.getBoundingClientRect();
        const host0 = host.getBoundingClientRect();
        return {
          direction: getComputedStyle(p).direction, textRight: Math.abs(pr.right - host0.right) < 1 && getComputedStyle(p).textAlign === 'start',
          listPad: [getComputedStyle(ul).paddingLeft, getComputedStyle(ul).paddingRight], itemAtRight: Math.abs(li.getBoundingClientRect().right - (ul.getBoundingClientRect().right - parseFloat(getComputedStyle(ul).paddingRight))) < 1,
          indent: [getComputedStyle(indented).paddingRight, getComputedStyle(indented).paddingLeft], normal: [getComputedStyle(normal).paddingRight, getComputedStyle(normal).paddingLeft],
        };
      });
      const pass = read.direction === 'rtl' && read.listPad[0] === '0px' && parseFloat(read.listPad[1]) > 10 && read.itemAtRight && read.indent[0] === '48px' && read.indent[1] === '0px' && read.normal[0] === '0px' && read.normal[1] === '48px'
        && /style="padding-right: 36pt;?"/.test(html) && /<p data-indent-left="36" style="padding-left: 36pt;?">Normal<\/p>/.test(html);
      return { pass, notes: JSON.stringify({ read, html }) };
    },
  });

  // === 3) Les sorties ==================================================================================================================================================
  cases.push({
    id: 'textdirection_pdf_draws_the_text_and_the_bullet_on_the_right',
    description: 'PDF relu par pdf.js : un paragraphe de droite à gauche est collé à la marge de droite, le même paragraphe ordinaire à celle de gauche ; une liste de droite à gauche a sa puce à droite du texte, collée à la marge de droite, et une liste ordinaire sa puce à gauche',
    run: async (h) => {
      const para = (attrs, text) => '<p' + attrs + '>' + text + '</p>';
      const bboxOf = async (html) => { const out = await h.exportPdfContent(html); const png = await renderPdfPage(out.base64); return png.bbox(0, 0, png.width, 140); };
      const w = 595.28;
      const rtlText = await bboxOf(para(RTL, 'Droite'));
      const ltrText = await bboxOf(para('', 'Gauche'));
      const rtlList = await bboxOf('<ul' + RTL + '><li><p' + RTL + '>Puce droite</p></li></ul>');
      const ltrList = await bboxOf('<ul><li><p>Puce gauche</p></li></ul>');
      const pass = !!rtlText && rtlText.right > w - 90 && rtlText.left > w / 2 && !!ltrText && ltrText.left < 90 && ltrText.right < w / 2
        && !!rtlList && rtlList.right > w - 90 && rtlList.left > w / 2 && !!ltrList && ltrList.left < 90 && ltrList.right < w / 2;
      return { pass, notes: JSON.stringify({ rtlText, ltrText, rtlList, ltrList }) };
    },
  });

  cases.push({
    id: 'textdirection_pdf_fallbacks_of_the_vector_drawing_keep_the_direction',
    description: 'PDF relu par pdf.js : un bloc de droite à gauche à ombre rouge que le dessin vectoriel ne fait pas (citation coupée par un trait horizontal, paragraphe qui habille une image) tombe dans le chemin ordinaire du PDF et reste collé à la marge de droite, comme le même bloc sans ombre',
    run: async (h) => {
      const png = h.makeImage(60, 40, { type: 'image/png' });
      const fx = text => '<span style="text-shadow: 3pt 3pt 0pt #ff0000">' + text + '</span>';
      const textOf = async (html) => { const out = await h.exportPdfContent(html); const view = await renderPdfPage(out.base64); return { items: view.items, w: view.width }; };
      // Chaque bloc est comparé au même bloc ordinaire aligné à droite à la main (`text-align: right`) : le chemin du PDF doit le ranger au même endroit.
      const variants = (rtl) => {
        const dir = rtl ? RTL : '';
        const right = rtl ? '' : ' style="text-align: right"';
        return {
          trait: ['<blockquote' + dir + '><p' + dir + right + '>' + fx('Avant') + '</p><hr><p' + dir + right + '>Apres</p></blockquote>', ['Avant', 'Apres']],
          habillee: ['<p' + dir + right + '><img class="editor-image" src="' + png + '" alt="" style="width: 60px; height: 40px;" data-align="left" data-wrap="square">' + fx('Habillee') + ' mot1 mot2 mot3</p>', ['Habillee']],
        };
      };
      const gapsOf = async (set) => {
        const got = {};
        for (const key of Object.keys(set)) {
          const view = await textOf(set[key][0]);
          got[key] = set[key][1].map((word) => { const i = view.items.find(x => x.str.indexOf(word) !== -1); return i ? Math.round(view.w - (i.x + i.width)) : null; });
        }
        return got;
      };
      const got = await gapsOf(variants(true));
      const want = await gapsOf(variants(false));
      // Ordinaire (à gauche), le texte finirait à plus de 300 pt du bord droit.
      const pass = Object.keys(got).every(key => got[key].every((gap, i) => gap !== null && want[key][i] !== null && Math.abs(gap - want[key][i]) < 6 && gap < 150));
      return { pass, notes: JSON.stringify({ got, want }) };
    },
  });

  cases.push({
    id: 'textdirection_word_writes_bidi_and_turns_the_alignment',
    description: 'Word (OOXML dézippé) : un paragraphe de droite à gauche porte `w:bidi` ; son alignement à droite est écrit « left » (début), son alignement à gauche « right » (fin), son centrage reste ; un paragraphe ordinaire n\'a pas `w:bidi` et garde son alignement',
    run: async (h) => {
      const para = (attrs, align, text) => '<p' + attrs + (align ? ' style="text-align: ' + align + '"' : '') + '>' + text + '</p>';
      const out = await h.exportDocxParts(para(RTL, 'right', 'A') + para(RTL, 'left', 'B') + para(RTL, 'center', 'C') + para('', 'right', 'D') + '<ul' + RTL + '><li><p' + RTL + '>E</p></li></ul>');
      const paragraphs = Array.from(out.doc.getElementsByTagName('w:p'));
      const info = word => {
        const p = paragraphs.find(x => x.textContent.trim() === word);
        const props = p && p.getElementsByTagName('w:pPr')[0];
        const jc = props && props.getElementsByTagName('w:jc')[0];
        return p ? { bidi: !!(props && props.getElementsByTagName('w:bidi')[0]), jc: jc ? jc.getAttribute('w:val') : null } : null;
      };
      const got = { A: info('A'), B: info('B'), C: info('C'), D: info('D'), E: info('E') };
      const pass = got.A && got.A.bidi && got.A.jc === 'left' && got.B.bidi && got.B.jc === 'right' && got.C.bidi && got.C.jc === 'center' && !got.D.bidi && got.D.jc === 'right' && got.E.bidi;
      return { pass: !!pass, notes: JSON.stringify(got) };
    },
  });

  cases.push({
    id: 'textdirection_powerpoint_export_writes_rtl_the_alignment_and_the_indent_from_the_right',
    description: 'PowerPoint exporté (cadre de diapositive) : un paragraphe de droite à gauche porte `rtl="1"` et son alignement en toutes lettres (`algn="r"` par défaut, `algn="l"` quand il est aligné à gauche), son retrait de « Paragraphe… » (36 pt) en `marL` ; un point de liste de droite à gauche a son retrait depuis la droite (`marL` positif) ; un paragraphe ordinaire n\'a pas `rtl`',
    run: async () => {
      await ExportEngines.ensure('pptx');
      const html = FreeFrame.html({ x: 60, y: 60, w: 500, h: 300 },
        '<p' + RTL + '>Droite</p><p' + RTL + ' style="text-align: left">Gauche</p><p' + RTL + ' data-indent-left="36" style="padding-right: 36pt">Retrait</p><ul' + RTL + '><li><p' + RTL + '>Puce</p></li></ul><p>Normal</p>');
      const blob = await PptxExport.fromHtml(html, { title: 'x' });
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const xml = await zip.file('ppt/slides/slide1.xml').async('string');
      const para = word => (xml.match(/<a:p>.*?<\/a:p>/g) || []).find(p => p.indexOf('>' + word + '<') >= 0) || '';
      const open = word => (para(word).match(/<a:pPr[^>]*>/) || [''])[0];
      const got = { droite: open('Droite'), gauche: open('Gauche'), retrait: open('Retrait'), puce: open('Puce'), normal: open('Normal') };
      const marL = tag => parseInt((/marL="(\d+)"/.exec(tag) || [0, 0])[1], 10);
      const pass = /rtl="1"/.test(got.droite) && /algn="r"/.test(got.droite) && !/marL=/.test(got.droite) && /rtl="1"/.test(got.gauche) && /algn="l"/.test(got.gauche)
        && /rtl="1"/.test(got.retrait) && Math.abs(marL(got.retrait) - 36 * 12700) < 12700 && /rtl="1"/.test(got.puce) && marL(got.puce) > 100000 && !/rtl=/.test(got.normal);
      return { pass, notes: JSON.stringify(got) };
    },
  });

  cases.push({
    id: 'textdirection_powerpoint_round_trip_keeps_the_direction_of_paragraphs_and_lists',
    description: 'Un cadre de paragraphes et d\'une liste de droite à gauche exporté puis relu par l\'import PowerPoint garde le sens des paragraphes et de la liste, l\'alignement et le retrait ; le rapport est vide',
    run: async () => {
      await ExportEngines.ensure('pptx');
      await ExportEngines.ensure('pptxImport');
      const html = FreeFrame.html({ x: 60, y: 60, w: 500, h: 300 }, '<p' + RTL + '>Droite</p><p' + RTL + ' data-indent-left="36" style="padding-right: 36pt">Retrait</p><ul' + RTL + '><li><p' + RTL + '>Puce</p></li></ul><p>Normal</p>');
      const blob = await PptxExport.fromHtml(html, { title: 'x' });
      const r = await PptxImport.fromBuffer(await blob.arrayBuffer());
      const doc = new DOMParser().parseFromString('<body>' + r.html + '</body>', 'text/html').body;
      const find = word => Array.from(doc.querySelectorAll('p')).find(p => p.textContent.trim() === word);
      const list = doc.querySelector('ul');
      const got = {
        droite: find('Droite') && [find('Droite').getAttribute('data-dir'), find('Droite').style.textAlign], retrait: find('Retrait') && [find('Retrait').getAttribute('data-dir'), find('Retrait').style.paddingRight],
        liste: list && list.getAttribute('data-dir'), puce: find('Puce') && find('Puce').getAttribute('data-dir'), normal: find('Normal') && find('Normal').getAttribute('data-dir'),
      };
      const pass = !!got.droite && got.droite[0] === 'rtl' && got.droite[1] === 'right' && !!got.retrait && got.retrait[0] === 'rtl' && Math.abs(parseFloat(got.retrait[1]) - 36) < 1 && got.liste === 'rtl' && got.puce === 'rtl' && !got.normal && r.report.length === 0;
      return { pass, notes: JSON.stringify({ got, report: r.report }) };
    },
  });

  cases.push({
    id: 'textdirection_pdf_list_fallback_keeps_the_direction_and_the_bullet_on_the_right',
    description: 'PDF relu par pdf.js : une liste de droite à gauche dont un point a une ombre rouge et que le dessin vectoriel ne fait pas (un trait horizontal dans le point) tombe dans le chemin ordinaire du PDF : le texte reste collé à la marge de droite, comme celui de la même liste sans ombre',
    run: async (h) => {
      const fx = text => '<span style="text-shadow: 3pt 3pt 0pt #ff0000">' + text + '</span>';
      const gapsOf = async (html) => {
        const out = await h.exportPdfContent(html);
        const view = await renderPdfPage(out.base64);
        const gap = word => { const i = view.items.find(x => x.str.indexOf(word) !== -1); return i ? Math.round(view.width - (i.x + i.width)) : null; };
        return { avant: gap('Avant'), apres: gap('Apres'), w: view.width, bullet: (() => { const b = view.items.find(x => /[•◦▪]/.test(x.str)); return b ? Math.round(view.width - b.x) : null; })() };
      };
      const shadow = await gapsOf('<ul' + RTL + '><li' + RTL + '><p' + RTL + '>' + fx('Avant') + '</p><hr><p' + RTL + '>Apres</p></li></ul>');
      const plain = await gapsOf('<ul' + RTL + '><li' + RTL + '><p' + RTL + '>Avant</p><p' + RTL + '>Apres</p></li></ul>');
      // Le texte et la puce sont collés à la marge de droite, la puce à droite du texte, à quelques points près de la liste dessinée par le navigateur.
      const pass = shadow.avant !== null && shadow.apres !== null && shadow.bullet !== null && plain.bullet !== null && shadow.avant < 60 && shadow.bullet < 60 && shadow.bullet <= shadow.avant
        && Math.abs(shadow.avant - plain.avant) < 14 && Math.abs(shadow.apres - plain.apres) < 14 && Math.abs(shadow.bullet - plain.bullet) < 14;
      return { pass, notes: JSON.stringify({ shadow, plain }) };
    },
  });

  cases.push({
    id: 'textdirection_pdf_task_list_fallback_keeps_the_box_on_the_right',
    description: 'PDF relu par pdf.js : une liste de tâches de droite à gauche dont un point a une ombre rouge et un trait horizontal (le dessin vectoriel ne la fait pas : chemin ordinaire du PDF) a sa case à droite du texte, collée à la marge de droite, comme la même liste sans ombre',
    run: async (h) => {
      const fx = text => '<span style="text-shadow: 3pt 3pt 0pt #ff0000">' + text + '</span>';
      const list = inner => '<ul data-type="taskList" data-tasklist-style="classic"' + RTL + '><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div>' + inner + '</div></li></ul>';
      const viewOf = async (inner) => {
        const html = list(inner);
        const png = await renderPdfPage((await h.exportPdfContent(html)).base64);
        return { html, png, box: png.bbox(0, 0, png.width, 140), text: png.items.find(i => i.str.indexOf('Avant') !== -1) };
      };
      const shadow = await viewOf('<p' + RTL + '>' + fx('Avant') + '</p><hr><p' + RTL + '>Apres</p>');
      const plain = await viewOf('<p' + RTL + '>Avant</p><p' + RTL + '>Apres</p>');
      const edge = await renderPdfPage((await h.exportPdfContent('<p' + RTL + '>Marge</p>')).base64);
      const w = shadow.png.width;
      const textRight = view => (view.text ? view.text.x + view.text.width : null);
      const marginRight = edge.items[0] ? edge.items[0].x + edge.items[0].width : null;
      const boxLeft = view => view.box.right - TASK_BOX_PT;
      // Tout ce qui est sombre (le texte et la case) est sur la moitié de droite, et la case est à droite du texte, CONTRE la marge de droite (comme le texte d'un paragraphe ordinaire), avec l'espace de la case entre elle et le texte.
      const pass = /data-type="taskList"/.test(shadow.html) && !!shadow.box && !!plain.box && !!shadow.text && !!plain.text && marginRight != null
        && shadow.box.left > w / 2 && shadow.box.right > textRight(shadow) + 8
        && Math.abs(shadow.box.right - marginRight) < 1.6 && Math.abs(plain.box.right - marginRight) < 1.6 && Math.abs(shadow.box.right - plain.box.right) < 1.6
        && boxLeft(shadow) - textRight(shadow) > 2.5 && boxLeft(shadow) - textRight(shadow) < 7;
      return { pass, notes: JSON.stringify({ shadow: { box: shadow.box, text: shadow.text }, plain: { box: plain.box, text: plain.text }, marginRight, gap: boxLeft(shadow) - textRight(shadow), w, html: shadow.html.slice(0, 300) }) };
    },
  });

  cases.push({
    id: 'textdirection_pdf_task_list_in_a_table_cell_keeps_the_text_and_the_box_on_the_right',
    description: 'PDF relu par pdf.js : une liste de tâches de droite à gauche dans une case de tableau a son texte rangé à droite, la case contre lui et contre le bord de la case (et non le texte à gauche, la case à droite)',
    run: async (h) => {
      const cell = '<ul data-type="taskList" data-tasklist-style="classic"' + RTL + '><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p' + RTL + '>Dedans</p></div></li></ul>';
      const html = '<table><tbody><tr><td>' + cell + '</td><td><p>Voisine</p></td></tr></tbody></table>';
      // L'éditeur : le texte de la case va à droite (la case de tableau range à gauche, mais pas un bloc de droite à gauche), contre la case à cocher.
      await setDoc(h, html);
      const li = document.querySelector('.tiptap td li');
      const paragraph = li.querySelector('p').getBoundingClientRect(), label = li.querySelector('label').getBoundingClientRect();
      const inEditor = getComputedStyle(li.querySelector('p')).textAlign !== 'left' && Math.abs(label.left - paragraph.right) < 10;
      const png = await renderPdfPage((await h.exportPdfContent(html)).base64);
      const text = png.items.find(i => i.str.indexOf('Dedans') !== -1);
      const neighbour = png.items.find(i => i.str.indexOf('Voisine') !== -1);
      const ink = text && neighbour ? png.bbox(0, 0, neighbour.x - 2, 140) : null;
      const textRight = text ? text.x + text.width : null;
      // Le texte est contre la case, qui est contre le bord de droite de sa case de tableau (la colonne voisine commence à `neighbour.x`).
      const pass = inEditor && !!text && !!neighbour && !!ink && ink.right > textRight + 8 && ink.right - TASK_BOX_PT - textRight > 2.5 && ink.right - TASK_BOX_PT - textRight < 7
        && neighbour.x - ink.right > 2 && neighbour.x - ink.right < 14;
      return { pass, notes: JSON.stringify({ inEditor, text, neighbour, ink, textRight }) };
    },
  });

  cases.push({
    id: 'textdirection_pdf_list_fallback_keeps_the_indent_of_a_level',
    description: 'PDF relu par pdf.js : le point d\'un deuxième niveau d\'une liste de droite à gauche (puces, puis cases) qui tombe dans le chemin ordinaire du PDF (un trait horizontal dans le point) est en retrait depuis la marge de DROITE, du même retrait que le deuxième niveau d\'un point que le dessin vectoriel fait',
    run: async (h) => {
      const rightOf = (png, word) => { const item = png.items.find(i => i.str.indexOf(word) !== -1); return item ? item.x + item.width : null; };
      const levels = async (open, close, itemOpen, deep) => {
        const html = open + '<li' + itemOpen + '><p' + RTL + '>Haut</p>' + open + '<li' + itemOpen + '><p' + RTL + '>Milieu</p>' + (deep ? '<hr>' : '') + (deep ? '<p' + RTL + '>Bas</p>' : '') + '</li>' + close + '</li>' + close;
        const png = await renderPdfPage((await h.exportPdfContent(html)).base64);
        return { top: rightOf(png, 'Haut'), level: rightOf(png, 'Milieu') };
      };
      const bullets = '<ul' + RTL + '>';
      const tasks = '<ul data-type="taskList" data-tasklist-style="classic"' + RTL + '>';
      const task = ' data-type="taskItem" data-checked="false"';
      const got = {
        bulletsVector: await levels(bullets, '</ul>', '', false), bulletsFallback: await levels(bullets, '</ul>', '', true),
        tasksVector: await levels(tasks, '</ul>', task, false), tasksFallback: await levels(tasks, '</ul>', task, true),
      };
      const inset = view => (view.top != null && view.level != null ? view.top - view.level : null);
      const same = (a, b) => a != null && b != null && Math.abs(a - b) < 2;
      const pass = inset(got.bulletsVector) > 8 && same(inset(got.bulletsFallback), inset(got.bulletsVector)) && inset(got.tasksVector) > 8 && same(inset(got.tasksFallback), inset(got.tasksVector));
      return { pass, notes: JSON.stringify({ got, insets: [inset(got.bulletsVector), inset(got.bulletsFallback), inset(got.tasksVector), inset(got.tasksFallback)] }) };
    },
  });

  cases.push({
    id: 'textdirection_html_export_keeps_the_direction',
    description: 'Le HTML exporté garde le sens des paragraphes, des titres et des listes de droite à gauche (`dir="rtl"`) et le retrait depuis la droite (`padding-right`), et rien sur un paragraphe ordinaire',
    run: async (h) => {
      const out = await h.exportHtml('<p' + RTL + ' data-indent-left="12" style="padding-right: 12pt">Droite</p><h2' + RTL + '>Titre</h2><ul' + RTL + '><li><p' + RTL + '>Puce</p></li></ul><p>Normal</p>');
      const body = out.text.slice(out.text.indexOf('<body'));
      const tag = word => (body.match(new RegExp('<[a-z0-9]+[^>]*>(?=\\s*' + word + ')')) || [''])[0];
      const got = { droite: tag('Droite'), titre: tag('Titre'), puce: tag('Puce'), normal: tag('Normal'), liste: (body.match(/<ul[^>]*>/) || [''])[0] };
      const pass = /dir="rtl"/.test(got.droite) && /padding-right: 12pt/.test(got.droite) && /dir="rtl"/.test(got.titre) && /dir="rtl"/.test(got.liste) && !/dir=/.test(got.normal);
      return { pass, notes: JSON.stringify(got) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.textDirection = cases;
})();
