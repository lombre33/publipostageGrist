// Suite "characterFormat" - « Caractère… » (demande d'Antoine du 24/10 : « tu peux lancer les points 9 et 10 », chantier 9 « caractères et puces », lot 9a de « Import PowerPoint sans perte » ; js/character-format.js).
// L'espacement des caractères (`letter-spacing`, en points) et les petites capitales (`font-variant: small-caps`), deux réglages de la marque `textStyle`. Quatre parties :
//  1) le RÉGLAGE : leur aller-retour HTML (bornés, px / em ramenés en points, « normal » n'est pas un réglage), la commande, la lecture de la sélection (valeurs mêlées), un seul Annuler, le style de frappe, le pinceau ;
//  2) les SORTIES : la Lecture, le PDF (relu par pdf.js : largeur du texte espacé, petites capitales dessinées), le Word (OOXML dézippé), le PowerPoint, le HTML et le Markdown exportés ;
//  3) l'IMPORT PowerPoint, qui écrit ces réglages (dev-tests/scenarios-pptx-import.js) et l'aller-retour avec l'export.
// La vraie souris et le vrai clavier à 700x400 (clair, sombre, anglais) sont dans dev-tests/verify-character-format-mouse.mjs (groupe Node "characterFormatMouse").
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const ed = () => EditorCore.getEditor();
  const near = (a, b, tolerance) => Math.abs(a - b) <= (tolerance === undefined ? 0.01 : tolerance);
  const NO_HF = { header: '', footer: '' };

  async function setDoc(h, html) {
    await h.resetEditor();
    Editor.setHTML(html);
    await sleep(150);
  }
  const written = () => Editor.getHTML().replace(/<p><\/p>$/, '');
  function positionOf(predicate) {
    let found = null;
    ed().state.doc.descendants((node, pos) => { if (found == null && predicate(node)) found = pos; });
    return found;
  }
  // La place d'un mot dans le document : { from, to }.
  function wordRange(word) {
    let found = null;
    ed().state.doc.descendants((node, pos) => {
      if (found || !node.isText) return;
      const i = node.text.indexOf(word);
      if (i !== -1) found = { from: pos + i, to: pos + i + word.length };
    });
    return found;
  }
  async function select(fromWord, toWord) {
    const a = wordRange(fromWord);
    const b = toWord ? wordRange(toWord) : a;
    ed().commands.setTextSelection({ from: a.from, to: b.to });
    await sleep(100);
  }
  // Les réglages du texte d'un mot : « 2.5pt/small-caps », « -/- » pour aucun.
  function markOf(word) {
    const out = [];
    ed().state.doc.descendants((node) => {
      if (!node.isText || node.text.indexOf(word) === -1) return;
      const m = node.marks.find(mark => mark.type.name === 'textStyle');
      out.push((m && m.attrs.letterSpacing) || '-', (m && m.attrs.fontVariant) || '-');
    });
    return out.length ? out[0] + '/' + out[1] : null;
  }

  cases.push({
    id: 'characterformat_html_round_trip_bounds_and_units',
    description: 'L\'espacement (`letter-spacing`) et les petites capitales (`font-variant`) font l\'aller-retour du HTML : 2,5 pt reste « 2.5pt » ; un texte collé en px (2px = 1,5 pt) ou en em (0,1em = 1,05 pt) est ramené en points ; « normal », 0 et une valeur illisible ne sont pas des réglages ; l\'espacement est borné (-50 à 500 pt) ; `font-variant: normal` n\'est pas des petites capitales ; sans réglage, le HTML ne change pas',
    run: async (h) => {
      await setDoc(h, '<p><span style="letter-spacing: 2.5pt">A25</span> <span style="letter-spacing: 2px">B2px</span> <span style="letter-spacing: 0.1em">C01em</span> <span style="letter-spacing: normal">Dnorm</span> <span style="letter-spacing: 0pt">E0</span> <span style="letter-spacing: 900pt">F900</span> <span style="letter-spacing: -80pt">G80</span> <span style="font-variant: small-caps">Hcaps</span> <span style="font-variant: normal">Inorm</span> <span style="font-variant: small-caps; letter-spacing: 1pt">Jboth</span></p><p>Kplain</p>');
      const got = Object.fromEntries(['A25', 'B2px', 'C01em', 'Dnorm', 'E0', 'F900', 'G80', 'Hcaps', 'Inorm', 'Jboth', 'Kplain'].map(w => [w, markOf(w)]));
      const html = written();
      await setDoc(h, html);
      const again = Object.fromEntries(Object.keys(got).map(w => [w, markOf(w)]));
      const pass = got.A25 === '2.5pt/-' && got.B2px === '1.5pt/-' && got.C01em === '1.05pt/-' && got.Dnorm === '-/-' && got.E0 === '-/-' && got.F900 === '500pt/-' && got.G80 === '-50pt/-' && got.Hcaps === '-/small-caps'
        && got.Inorm === '-/-' && got.Jboth === '1pt/small-caps' && got.Kplain === '-/-' && JSON.stringify(got) === JSON.stringify(again)
        && /<p>Kplain<\/p>/.test(html) && !/normal/.test(html);
      return { pass, notes: JSON.stringify({ got, html }) };
    },
  });

  cases.push({
    id: 'characterformat_apply_sets_both_in_one_undo_and_reads_mixed_values',
    description: 'CharacterFormat.apply pose l\'espacement et les petites capitales en UNE transaction (un Annuler les défait d\'un coup, un Rétablir les remet) ; readState dit les valeurs d\'une sélection (une seule valeur ou plusieurs) ; poser les petites capitales seules ne touche pas à l\'espacement de chacun ; un espacement nul ou null retire le réglage ; un éditeur en lecture seule ne change rien',
    run: async (h) => {
      await setDoc(h, '<p>Un deux trois</p>');
      const out = {};
      await select('Un');
      const undoDepth = () => { let n = 0; while (ed().can().undo() && n < 30) { ed().commands.undo(); n++; } for (let i = 0; i < n; i++) ed().commands.redo(); return n; };
      const before = undoDepth();
      out.applied = CharacterFormat.apply(ed(), { letterSpacing: 2, smallCaps: true });
      await sleep(100);
      out.mark = markOf('Un');
      out.depth = undoDepth() - before;
      ed().commands.undo();
      await sleep(50);
      out.undone = markOf('Un');
      ed().commands.redo();
      await sleep(50);
      out.redone = markOf('Un');
      await select('Un', 'deux');
      const mixed = CharacterFormat.readState(ed());
      out.mixed = mixed;
      CharacterFormat.apply(ed(), { smallCaps: true });
      await sleep(80);
      out.capsOnly = [markOf('Un'), markOf('deux')].join(' ');
      out.afterCaps = CharacterFormat.readState(ed());
      await select('Un', 'deux');
      CharacterFormat.apply(ed(), { letterSpacing: null, smallCaps: false });
      await sleep(80);
      out.cleared = [markOf('Un'), markOf('deux')].join(' ');
      ed().setEditable(false);
      out.readOnly = CharacterFormat.apply(ed(), { letterSpacing: 3 });
      ed().setEditable(true);
      const verdict = out.applied === true && out.mark === '2pt/small-caps' && out.depth === 1 && out.undone === '-/-' && out.redone === '2pt/small-caps'
        && JSON.stringify(mixed.spacing.sort()) === JSON.stringify(['2pt', null].sort()) && mixed.caps.length === 2
        && out.capsOnly === '2pt/small-caps -/small-caps' && out.afterCaps.caps.length === 1 && out.afterCaps.caps[0] === true && out.afterCaps.spacing.length === 2
        && out.cleared === '-/- -/-' && out.readOnly === false;
      return { pass: verdict, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'characterformat_clearing_both_leaves_no_empty_span',
    description: 'Retirer l\'espacement et les petites capitales (CharacterFormat.apply à null et faux) d\'un texte qui n\'avait que ces deux réglages rend un texte nu : plus de <span> vide dans le HTML ; un texte qui garde une taille garde son <span>',
    run: async (h) => {
      await setDoc(h, '<p><span style="letter-spacing: 2pt; font-variant: small-caps">Aa</span> <span style="letter-spacing: 2pt; font-size: 14pt">Bb</span></p>');
      await select('Aa', 'Bb');
      CharacterFormat.apply(ed(), { letterSpacing: null, smallCaps: false });
      await sleep(100);
      const html = written();
      const attrs = []; ed().state.doc.descendants((n) => { if (n.isText) attrs.push(JSON.stringify(n.marks.map(m => m.attrs))); });
      const pass = /<p>Aa <span style="font-size: 14pt;?">Bb<\/span><\/p>/.test(html);
      return { pass, notes: html + ' ' + attrs.join(' ') };
    },
  });

  cases.push({
    id: 'characterformat_typing_style_and_format_painter_carry_both',
    description: 'Le style de frappe d\'une case vide (TypingStyle) et le pinceau de mise en forme gardent l\'espacement et les petites capitales : une valeur sûre passe, une valeur étrangère (« 1px; background:url(x) », « large ») est écartée ; peindre un texte ordinaire avec un texte espacé en petites capitales lui donne les deux',
    run: async (h) => {
      const style = TypingStyle.normalize({ letterSpacing: '2pt', fontVariant: 'small-caps', bold: true });
      const bad = TypingStyle.normalize({ letterSpacing: '1px; background:url(x)', fontVariant: 'large' });
      await setDoc(h, '<p><span style="letter-spacing: 2pt; font-variant: small-caps">Modele</span> et cible</p>');
      await select('Modele');
      const copied = FormatPainter.copy();
      FormatPainter.arm(false);
      await select('cible');
      const painted = FormatPainter.apply();
      await sleep(80);
      const target = markOf('cible');
      FormatPainter.disarm();
      const pass = !!style && style.letterSpacing === '2pt' && style.fontVariant === 'small-caps' && style.bold === true && bad === null && copied && painted && target === '2pt/small-caps';
      return { pass, notes: JSON.stringify({ style, bad, copied, painted, target }) };
    },
  });

  cases.push({
    id: 'characterformat_reader_shows_the_spacing_and_the_small_capitals',
    description: 'La Lecture montre les deux réglages comme l\'éditeur : 3 pt entre les lettres (4 px) et des petites capitales sur le texte réglé, rien sur le reste',
    run: async () => {
      const reader = document.getElementById('reader-container');
      try {
        reader.style.display = 'block';
        await ReaderMode.render('<p><span style="letter-spacing: 3pt; font-variant: small-caps">Aa</span> <span>Bb</span></p>', null, { id: 1 }, NO_HF);
        const look = (text) => {
          const el = Array.from(reader.querySelectorAll('.reader-content span')).find(s => s.textContent === text);
          const cs = getComputedStyle(el);
          return { spacing: cs.letterSpacing, caps: cs.fontVariantCaps };
        };
        const a = look('Aa');
        const b = look('Bb');
        return { pass: near(parseFloat(a.spacing), 4, 0.05) && a.caps === 'small-caps' && b.spacing === 'normal' && b.caps === 'normal', notes: JSON.stringify({ a, b }) };
      } finally {
        reader.style.display = '';
        document.getElementById('editor-container').style.display = '';
      }
    },
  });

  // Le PDF d'un HTML : les morceaux peints (texte, largeur) dans l'ordre.
  async function pdfItems(h, html) {
    const result = await h.exportPdfContent(html);
    const gt = await h.extractPdfGroundTruth(result.base64);
    return gt.pages[0].textItems;
  }

  cases.push({
    id: 'characterformat_pdf_spaces_the_letters',
    description: 'PDF (relu par pdf.js) : le texte espacé de 4 pt est plus large que le même texte ordinaire de 4 pt par lettre (« MMMMMMMM » : 8 lettres, ou 7 écarts visibles et celui d\'après : de 28 à 32 pt de plus) ; un espacement négatif le resserre ; le texte voisin sans réglage garde sa largeur',
    run: async (h) => {
      const plain = await pdfItems(h, '<p>MMMMMMMM</p>');
      const wide = await pdfItems(h, '<p><span style="letter-spacing: 4pt">MMMMMMMM</span></p>');
      const tight = await pdfItems(h, '<p><span style="letter-spacing: -1pt">MMMMMMMM</span></p>');
      const width = items => items.filter(i => /M/.test(i.str)).reduce((sum, i) => sum + i.width, 0);
      const out = { plain: width(plain), wide: width(wide), tight: width(tight) };
      const pass = out.plain > 0 && near(out.wide - out.plain, 8 * 4, 5) && near(out.plain - out.tight, 8, 3) && out.wide > out.plain && out.tight < out.plain;
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'characterformat_pdf_draws_the_small_capitals',
    description: 'PDF (relu par pdf.js) : un texte en petites capitales s\'écrit en majuscules, les minuscules plus petites : « aaaa » devient « AAAA » plus étroit que quatre majuscules à la taille du texte, une majuscule d\'origine garde sa taille ; le texte ordinaire voisin reste en minuscules',
    run: async (h) => {
      const caps = await pdfItems(h, '<p><span style="font-variant: small-caps">aaaa</span></p>');
      const full = await pdfItems(h, '<p>AAAA</p>');
      const mixed = await pdfItems(h, '<p><span style="font-variant: small-caps">Ab</span> cd</p>');
      const joined = items => items.map(i => i.str).join('');
      const width = items => items.reduce((sum, i) => sum + i.width, 0);
      const out = { caps: joined(caps), full: joined(full), capsWidth: width(caps), fullWidth: width(full), mixed: joined(mixed) };
      const pass = /^AAAA$/.test(out.caps.replace(/\s/g, '')) && out.capsWidth > 0 && out.capsWidth < out.fullWidth * 0.85 && near(out.capsWidth / out.fullWidth, CharacterFormat.SMALL_CAPS_RATIO, 0.06)
        && out.mixed.replace(/\s/g, '') === 'ABcd';
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'characterformat_word_writes_the_spacing_and_the_small_capitals',
    description: 'Word (OOXML dézippé) : `w:spacing w:val` en vingtièmes de point (2,5 pt = 50, -1 pt = -20) et `w:smallCaps` sur les séries de caractères réglées ; le texte ordinaire n\'a ni l\'un ni l\'autre',
    run: async (h) => {
      const out = await h.exportDocxParts('<p><span style="letter-spacing: 2.5pt">Aa</span> <span style="letter-spacing: -1pt; font-variant: small-caps">Bb</span> <span style="font-variant: small-caps">Cc</span> Dd</p>');
      const runOf = (text) => Array.from(out.doc.getElementsByTagName('w:r')).find(r => Array.from(r.getElementsByTagName('w:t')).map(t => t.textContent).join('') === text);
      const info = (text) => {
        const r = runOf(text);
        const pr = r && r.getElementsByTagName('w:rPr')[0];
        const sp = pr && pr.getElementsByTagName('w:spacing')[0];
        return r ? { spacing: sp ? sp.getAttribute('w:val') : null, caps: !!(pr && pr.getElementsByTagName('w:smallCaps')[0]) } : null;
      };
      const got = { Aa: info('Aa'), Bb: info('Bb'), Cc: info('Cc'), Dd: info(' Dd') || info('Dd') };
      const pass = got.Aa && got.Aa.spacing === '50' && !got.Aa.caps && got.Bb && got.Bb.spacing === '-20' && got.Bb.caps && got.Cc && got.Cc.spacing === null && got.Cc.caps && (!got.Dd || (got.Dd.spacing === null && !got.Dd.caps));
      return { pass, notes: JSON.stringify(got) };
    },
  });

  cases.push({
    id: 'characterformat_powerpoint_export_writes_spc_and_cap',
    description: 'PowerPoint exporté : `spc` en centièmes de point (2,5 pt = 250, -1 pt = -100) et `cap="small"` sur les séries réglées ; rien sur le texte ordinaire',
    run: async () => {
      await ExportEngines.ensure('pptx');
      const blob = await PptxExport.fromHtml('<p><span style="letter-spacing: 2.5pt">Aa</span><span style="letter-spacing: -1pt; font-variant: small-caps">Bb</span><span style="font-variant: small-caps">Cc</span>Dd</p>', { title: 'x' });
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const xml = await zip.file('ppt/slides/slide1.xml').async('string');
      const runs = (xml.match(/<a:r>.*?<\/a:r>/g) || []).map(r => ({ text: (/<a:t>([^<]*)<\/a:t>/.exec(r) || [])[1], spc: (/ spc="(-?\d+)"/.exec(r) || [])[1] || null, cap: (/ cap="(\w+)"/.exec(r) || [])[1] || null }));
      const by = text => runs.find(r => r.text === text);
      const pass = !!by('Aa') && by('Aa').spc === '250' && !by('Aa').cap && !!by('Bb') && by('Bb').spc === '-100' && by('Bb').cap === 'small' && !!by('Cc') && !by('Cc').spc && by('Cc').cap === 'small' && !!by('Dd') && !by('Dd').spc && !by('Dd').cap;
      return { pass, notes: JSON.stringify(runs) };
    },
  });

  cases.push({
    id: 'characterformat_html_and_markdown_exports_keep_both',
    description: 'HTML exporté et Markdown exporté gardent `letter-spacing` et `font-variant` sur le texte réglé ; le texte ordinaire n\'a pas de style',
    run: async (h) => {
      const html = '<p><span style="letter-spacing: 2.5pt; font-variant: small-caps">Aa</span> Bb</p>';
      const exported = await h.exportHtml(html, null, {}, null, '', { fragment: true });
      const md = await h.exportMarkdown(html);
      const body = exported.text.slice(exported.text.lastIndexOf('</style>') + 8);
      const mdText = md.text || md.markdown || JSON.stringify(md);
      const pass = /<span[^>]*letter-spacing: 2\.5pt[^>]*>Aa<\/span>/.test(body) && /font-variant: small-caps/.test(body) && /letter-spacing: 2\.5pt/.test(mdText) && /font-variant: small-caps/.test(mdText) && /<\/span> Bb/.test(mdText);
      return { pass, notes: JSON.stringify({ body, md: mdText }) };
    },
  });


  // --- Lot 9b : le SOULIGNEMENT (double, pointillé, tireté, ondulé) ---------------------------------------------------------------------------------------------------------------------------
  const lineOfWord = (word) => {
    let out;
    ed().state.doc.descendants((node) => {
      if (out !== undefined || !node.isText || node.text.indexOf(word) === -1) return;
      const u = node.marks.find(mark => mark.type.name === 'underline');
      out = u ? (u.attrs.lineStyle || 'single') : 'none';
    });
    return out === undefined ? null : out;
  };

  cases.push({
    id: 'characterformat_underline_styles_round_trip_and_default_to_single',
    description: 'Le soulignement garde sa sorte dans le HTML : `<u style="text-decoration-style: wavy">` reste ondulé (double, pointillé, tireté aussi), un `<u>` seul est simple, `solid` et une valeur inconnue (« groove ») sont simples, un `<span style="text-decoration: underline double">` collé d\'une page web reste un soulignement simple (seul le `<u>` porte la sorte) ; le HTML écrit redit les mêmes',
    run: async (h) => {
      await setDoc(h, '<p><u style="text-decoration-style: wavy">Aw</u> <u style="text-decoration-style: double">Bd</u> <u style="text-decoration-style: dotted">Cp</u> <u style="text-decoration-style: dashed">Dt</u> <u>Es</u> <u style="text-decoration-style: solid">Fs</u> <u style="text-decoration-style: groove">Gg</u> <span style="text-decoration: underline double">Hs</span> Iplain</p>');
      const got = Object.fromEntries(['Aw', 'Bd', 'Cp', 'Dt', 'Es', 'Fs', 'Gg', 'Hs', 'Iplain'].map(w => [w, lineOfWord(w)]));
      const html = written();
      await setDoc(h, html);
      const again = Object.fromEntries(Object.keys(got).map(w => [w, lineOfWord(w)]));
      const pass = got.Aw === 'wavy' && got.Bd === 'double' && got.Cp === 'dotted' && got.Dt === 'dashed' && got.Es === 'single' && got.Fs === 'single' && got.Gg === 'single' && got.Hs === 'single' && got.Iplain === 'none'
        && JSON.stringify(got) === JSON.stringify(again) && /<u style="text-decoration-style: wavy;?">Aw<\/u>/.test(html) && /<u>Es<\/u>/.test(html);
      return { pass, notes: JSON.stringify({ got, again, html }) };
    },
  });

  cases.push({
    id: 'characterformat_underline_apply_picks_the_kind_in_one_undo',
    description: 'CharacterFormat.apply({ underline }) choisit la sorte de soulignement du texte visé en un seul Annuler : « wavy » souligne en ondulé un texte nu, « single » garde le trait et retire la sorte, « none » retire le soulignement ; readState dit la sorte (ou plusieurs)',
    run: async (h) => {
      await setDoc(h, '<p>Un deux <u style="text-decoration-style: double">trois</u></p>');
      const out = {};
      await select('Un');
      CharacterFormat.apply(ed(), { underline: 'wavy' });
      await sleep(60);
      out.wavy = lineOfWord('Un');
      ed().commands.undo();
      await sleep(60);
      out.undone = lineOfWord('Un');
      ed().commands.redo();
      await sleep(60);
      await select('Un', 'trois');
      out.mixed = CharacterFormat.readState(ed()).line.slice().sort();
      CharacterFormat.apply(ed(), { underline: 'single' });
      await sleep(60);
      out.single = [lineOfWord('Un'), lineOfWord('deux'), lineOfWord('trois')].join(' ');
      CharacterFormat.apply(ed(), { underline: 'none' });
      await sleep(60);
      out.none = [lineOfWord('Un'), lineOfWord('deux'), lineOfWord('trois')].join(' ');
      const pass = out.wavy === 'wavy' && out.undone === 'none' && JSON.stringify(out.mixed) === JSON.stringify(['none', 'single', 'wavy'].concat([]).filter(k => k !== 'single').concat(['double']).sort())
        && out.single === 'single single single' && out.none === 'none none none';
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'characterformat_pdf_gives_the_underline_its_kind',
    description: 'PDF : une série soulignée en ondulé, double, pointillé ou tireté porte `decoration: underline` et `decorationStyle` (pdfmake dessine la sorte) ; un soulignement simple n\'en porte pas',
    run: async (h) => {
      const out = await h.exportPdfContent('<p><u style="text-decoration-style: wavy">Aw</u> <u style="text-decoration-style: double">Bd</u> <u style="text-decoration-style: dotted">Cp</u> <u style="text-decoration-style: dashed">Dt</u> <u>Es</u></p>');
      const runs = h.findTextBlocks(out.content).flatMap(b => (Array.isArray(b.text) ? b.text : [b]));
      const info = text => { const r = runs.find(x => x && x.text === text); return r ? { decoration: [].concat(r.decoration || []).join(','), style: r.decorationStyle || null } : null; };
      const got = { Aw: info('Aw'), Bd: info('Bd'), Cp: info('Cp'), Dt: info('Dt'), Es: info('Es') };
      const pass = ['Aw:wavy', 'Bd:double', 'Cp:dotted', 'Dt:dashed'].every((pair) => { const [w, k] = pair.split(':'); return got[w] && /underline/.test(got[w].decoration) && got[w].style === k; })
        && got.Es && /underline/.test(got.Es.decoration) && got.Es.style === null;
      return { pass, notes: JSON.stringify(got) };
    },
  });

  cases.push({
    id: 'characterformat_word_writes_the_underline_kind',
    description: 'Word (OOXML dézippé) : `w:u w:val` vaut double, dotted, dash ou wave selon la sorte, single pour un soulignement simple',
    run: async (h) => {
      const out = await h.exportDocxParts('<p><u style="text-decoration-style: wavy">Aw</u> <u style="text-decoration-style: double">Bd</u> <u style="text-decoration-style: dotted">Cp</u> <u style="text-decoration-style: dashed">Dt</u> <u>Es</u></p>');
      const valOf = (text) => {
        const r = Array.from(out.doc.getElementsByTagName('w:r')).find(x => Array.from(x.getElementsByTagName('w:t')).map(t => t.textContent).join('') === text);
        const u = r && r.getElementsByTagName('w:u')[0];
        return u ? u.getAttribute('w:val') : null;
      };
      const got = { Aw: valOf('Aw'), Bd: valOf('Bd'), Cp: valOf('Cp'), Dt: valOf('Dt'), Es: valOf('Es') };
      return { pass: got.Aw === 'wave' && got.Bd === 'double' && got.Cp === 'dotted' && got.Dt === 'dash' && got.Es === 'single', notes: JSON.stringify(got) };
    },
  });

  cases.push({
    id: 'characterformat_powerpoint_export_writes_the_underline_kind',
    description: 'PowerPoint exporté : `u` vaut wavy, dbl, dotted, dash ou sng selon la sorte de soulignement',
    run: async () => {
      await ExportEngines.ensure('pptx');
      const blob = await PptxExport.fromHtml('<p><u style="text-decoration-style: wavy">Aw</u><u style="text-decoration-style: double">Bd</u><u style="text-decoration-style: dotted">Cp</u><u style="text-decoration-style: dashed">Dt</u><u>Es</u>Fn</p>', { title: 'x' });
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const xml = await zip.file('ppt/slides/slide1.xml').async('string');
      const runs = (xml.match(/<a:r>.*?<\/a:r>/g) || []).map(r => ({ text: (/<a:t>([^<]*)<\/a:t>/.exec(r) || [])[1], u: (/ u="(\w+)"/.exec(r) || [])[1] || null }));
      const by = text => (runs.find(r => r.text === text) || {}).u;
      const pass = by('Aw') === 'wavy' && by('Bd') === 'dbl' && by('Cp') === 'dotted' && by('Dt') === 'dash' && by('Es') === 'sng' && by('Fn') === null;
      return { pass, notes: JSON.stringify(runs) };
    },
  });

  cases.push({
    id: 'characterformat_markdown_keeps_the_underline_kind',
    description: 'Markdown exporté : un soulignement ondulé s\'écrit `<u style="text-decoration-style: wavy">…</u>`, un simple `<u>…</u>`',
    run: async (h) => {
      const md = await h.exportMarkdown('<p><u style="text-decoration-style: wavy">Aw</u> <u>Es</u></p>');
      const text = md.text || md.markdown || JSON.stringify(md);
      return { pass: /<u style="text-decoration-style: wavy">Aw<\/u>/.test(text) && /<u>Es<\/u>/.test(text), notes: text };
    },
  });

  // --- Un cadre pivoté : son texte est dessiné en SVG, mot par mot --------------------------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'characterformat_pdf_of_a_rotated_frame_keeps_the_spacing_and_the_small_capitals',
    description: 'PDF relu par pdf.js d\'un cadre pivoté (texte dessiné en SVG) : les caractères sont posés à la place du navigateur, donc l\'espacement de 6 pt écarte les lettres (l\'étendue du mot dépasse celle du mot ordinaire de 3 x 6 pt environ) et les petites capitales écrivent « ABC » pour « abc » ; le mot ordinaire voisin reste en minuscules',
    run: async (h) => {
      const turned = inner => FreeFrame.html({ x: 100, y: 100, w: 300, h: 100, rot: 90, shape: 'rect', fill: '', line: '', lw: 0 }, inner);
      const extentOf = (items, ok) => { const hit = items.filter(i => ok(i.str)); const xs = hit.map(i => i.x); const ys = hit.map(i => i.y); return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)); };
      const plain = await pdfItems(h, turned('<p>MMMM</p>'));
      const spaced = await pdfItems(h, turned('<p><span style="letter-spacing: 6pt">MMMM</span></p>'));
      const caps = await pdfItems(h, turned('<p><span style="font-variant: small-caps">abc</span> def</p>'));
      const out = { plain: extentOf(plain, t => /M/.test(t)), spaced: extentOf(spaced, t => /M/.test(t)), caps: caps.map(i => i.str).join('').replace(/\s/g, '') };
      const pass = out.plain >= 0 && out.spaced - out.plain >= 12 && /ABC/.test(out.caps) && /def/.test(out.caps);
      return { pass, notes: JSON.stringify(out) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.characterFormat = cases;
})();
