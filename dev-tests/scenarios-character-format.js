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


  // --- Lot 9c : l'OMBRE et le CONTOUR des lettres ------------------------------------------------------------------------------------------------------------------------------------------
  // Les réglages d'effet du texte d'un mot : « ombre|contour », « - » pour aucun.
  function effectsOf(word) {
    let out = null;
    ed().state.doc.descendants((node) => {
      if (out || !node.isText || node.text.indexOf(word) === -1) return;
      const m = node.marks.find(mark => mark.type.name === 'textStyle');
      out = ((m && m.attrs.textShadow) || '-') + '|' + ((m && m.attrs.textStroke) || '-');
    });
    return out;
  }
  cases.push({
    id: 'characterformat_shadow_and_outline_html_round_trip_and_units',
    description: 'L\'ombre (`text-shadow`) et le contour (`-webkit-text-stroke`) font l\'aller-retour du HTML : « 1.5pt 1.5pt 2pt #00000066 » reste telle ; une ombre en px, en rgba ou à couleur nommée est ramenée en points et en hexadécimal ; une liste d\'ombres garde la première ; « none », une ombre sans décalage ou une couleur transparente ne sont pas des réglages ; le contour a une épaisseur bornée (0,1 à 20 pt) et une couleur noire par défaut ; sans réglage, le HTML ne change pas',
    run: async (h) => {
      await setDoc(h, '<p><span style="text-shadow: 1.5pt 1.5pt 2pt #00000066">A1</span> <span style="text-shadow: 2px 3px 4px rgba(255, 0, 0, 0.5)">B2</span> <span style="text-shadow: 1px 1px red">C3</span> <span style="text-shadow: 1px 1px #111, 4px 4px #222">D4</span> <span style="text-shadow: none">E5</span> <span style="text-shadow: 2px 2px rgba(0, 0, 0, 0)">F6</span> <span style="-webkit-text-stroke: 0.75pt #ff0000">G7</span> <span style="-webkit-text-stroke: 2px blue">H8</span> <span style="-webkit-text-stroke: 90pt #000">I9</span> <span style="-webkit-text-stroke: 0px red">J0</span></p><p>Kplain</p>');
      const names = ['A1', 'B2', 'C3', 'D4', 'E5', 'F6', 'G7', 'H8', 'I9', 'J0', 'Kplain'];
      const got = Object.fromEntries(names.map(w => [w, effectsOf(w)]));
      const html = written();
      await setDoc(h, html);
      const again = Object.fromEntries(names.map(w => [w, effectsOf(w)]));
      const pass = got.A1 === '1.5pt 1.5pt 2pt #00000066|-' && got.B2 === '1.5pt 2.25pt 3pt #ff000080|-' && got.C3 === '0.75pt 0.75pt 0pt #ff0000|-' && got.D4 === '0.75pt 0.75pt 0pt #111111|-'
        && got.E5 === '-|-' && got.F6 === '-|-' && got.G7 === '-|0.75pt #ff0000' && got.H8 === '-|1.5pt #0000ff' && got.I9 === '-|20pt #000000' && got.J0 === '-|-' && got.Kplain === '-|-'
        && JSON.stringify(got) === JSON.stringify(again) && /<p>Kplain<\/p>/.test(html) && !/none/.test(html);
      return { pass, notes: JSON.stringify({ got, again, html }) };
    },
  });

  cases.push({
    id: 'characterformat_shadow_and_outline_apply_one_undo_and_read_mixed',
    description: 'CharacterFormat.apply pose l\'ombre et le contour d\'origine (`textShadow: true`, `textStroke: true`) en UNE transaction avec les autres réglages ; Annuler les défait d\'un coup ; readState dit si le texte visé en a (une valeur, ou plusieurs) ; `false` les retire ; retirer le dernier réglage d\'un texte ne laisse pas de <span> vide',
    run: async (h) => {
      await setDoc(h, '<p>Un deux trois</p>');
      const out = {};
      const depth = () => { let n = 0; while (ed().can().undo() && n < 40) { ed().commands.undo(); n++; } for (let i = 0; i < n; i++) ed().commands.redo(); return n; };
      await select('Un');
      const before = depth();
      out.applied = CharacterFormat.apply(ed(), { textShadow: true, textStroke: true, letterSpacing: 1 });
      await sleep(100);
      out.marks = effectsOf('Un');
      out.steps = depth() - before;
      ed().commands.undo(); await sleep(50);
      out.undone = effectsOf('Un');
      ed().commands.redo(); await sleep(50);
      await select('Un', 'deux');
      const mixed = CharacterFormat.readState(ed());
      out.mixed = { shadow: mixed.shadow.length, stroke: mixed.stroke.length };
      await select('Un');
      const one = CharacterFormat.readState(ed());
      out.one = { shadow: one.shadow, stroke: one.stroke };
      CharacterFormat.apply(ed(), { textShadow: false });
      await sleep(80);
      out.noShadow = effectsOf('Un');
      CharacterFormat.apply(ed(), { textStroke: false, letterSpacing: null });
      await sleep(80);
      out.html = written();
      const pass = out.applied === true && out.marks === '1.5pt 1.5pt 2pt #00000066|0.75pt #000000' && out.steps === 1 && out.undone === '-|-' && out.mixed.shadow === 2 && out.mixed.stroke === 2
        && JSON.stringify(out.one) === '{"shadow":[true],"stroke":[true]}' && out.noShadow === '-|0.75pt #000000' && /^<p>Un deux trois<\/p>$/.test(out.html);
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'characterformat_reader_shows_the_shadow_and_the_outline',
    description: 'La Lecture montre l\'ombre (text-shadow calculé) et le contour (épaisseur et couleur) comme l\'éditeur, sur le texte réglé seulement',
    run: async () => {
      const reader = document.getElementById('reader-container');
      try {
        reader.style.display = 'block';
        await ReaderMode.render('<p><span style="text-shadow: 1.5pt 1.5pt 2pt #00000066; -webkit-text-stroke: 0.75pt #ff0000">Aa</span> <span>Bb</span></p>', null, { id: 1 }, NO_HF);
        const look = (text) => {
          const el = Array.from(reader.querySelectorAll('.reader-content span')).find(sp => sp.textContent === text);
          const cs = getComputedStyle(el);
          return { shadow: cs.textShadow, stroke: cs.webkitTextStrokeWidth + ' ' + cs.webkitTextStrokeColor };
        };
        const a = look('Aa');
        const b = look('Bb');
        return { pass: /2px 2px/.test(a.shadow) && /^1px rgb\(255, 0, 0\)$/.test(a.stroke) && b.shadow === 'none' && /^0px/.test(b.stroke), notes: JSON.stringify({ a, b }) };
      } finally {
        reader.style.display = '';
        document.getElementById('editor-container').style.display = '';
      }
    },
  });

  cases.push({
    id: 'characterformat_word_powerpoint_html_markdown_keep_the_shadow_and_the_outline',
    description: 'Word : `w:outline` et `w:shadow` dans les propriétés de la série, avant la couleur et la taille (ordre du schéma) ; PowerPoint : `a:ln` (épaisseur en EMU, couleur) avant le remplissage, puis `a:effectLst` avec `a:outerShdw` (distance, direction, flou, couleur et opacité) ; HTML et Markdown exportés gardent `text-shadow` et `-webkit-text-stroke` ; le texte ordinaire n\'a rien de tout cela',
    run: async (h) => {
      const html = '<p><span style="text-shadow: 1.5pt 1.5pt 2pt #00000066; -webkit-text-stroke: 0.75pt #ff0000; color: #0000ff">Aa</span> Bb</p>';
      const docx = await h.exportDocxParts(html);
      const runOf = text => Array.from(docx.doc.getElementsByTagName('w:r')).find(r => Array.from(r.getElementsByTagName('w:t')).map(t => t.textContent).join('') === text);
      const names = r => Array.from((r.getElementsByTagName('w:rPr')[0] || { children: [] }).children).map(c => c.nodeName);
      const aNames = runOf('Aa') ? names(runOf('Aa')) : [];
      const bRun = Array.from(docx.doc.getElementsByTagName('w:r')).find(r => /Bb/.test(r.textContent));
      await ExportEngines.ensure('pptx');
      const blob = await PptxExport.fromHtml(html, { title: 'x' });
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const xml = await zip.file('ppt/slides/slide1.xml').async('string');
      const rPr = (/<a:r><a:rPr[^>]*>(.*?)<\/a:rPr><a:t>Aa<\/a:t>/.exec(xml) || [])[1] || '';
      const exported = await h.exportHtml(html, null, {}, null, '', { fragment: true });
      const body = exported.text.slice(exported.text.lastIndexOf('</style>') + 8);
      const md = await h.exportMarkdown(html);
      const mdText = md.text || md.markdown || JSON.stringify(md);
      const order = (list, a, b) => list.indexOf(a) !== -1 && list.indexOf(b) !== -1 && list.indexOf(a) < list.indexOf(b);
      const pass = order(aNames, 'w:outline', 'w:shadow') && order(aNames, 'w:shadow', 'w:color') && order(aNames, 'w:shadow', 'w:sz')
        && !!bRun && names(bRun).indexOf('w:shadow') === -1 && names(bRun).indexOf('w:outline') === -1
        && /^<a:ln w="9525"><a:solidFill><a:srgbClr val="FF0000"\/><\/a:solidFill><\/a:ln><a:solidFill><a:srgbClr val="0000FF"\/><\/a:solidFill><a:effectLst><a:outerShdw blurRad="25400" dist="26941" dir="2700000" algn="tl" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="40000"\/><\/a:srgbClr><\/a:outerShdw><\/a:effectLst><a:latin/.test(rPr)
        && /text-shadow: 1\.5pt 1\.5pt 2pt #00000066/.test(body) && /-webkit-text-stroke: 0\.75pt #ff0000/.test(body) && /text-shadow: [^;]*1\.5pt 1\.5pt 2pt/.test(mdText) && /-webkit-text-stroke: 0\.75pt/.test(mdText);
      return { pass, notes: JSON.stringify({ aNames, rPr, body, mdText }) };
    },
  });


  // Les pixels d'une page de PDF rendue par pdf.js : la couleur au point (x, y) en points depuis le haut-gauche.
  async function renderedPdf(h, html) {
    const result = await h.exportPdfContent(html);
    await TestHelpers.ensurePdfJsLoaded();
    const bin = atob(result.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
    const page = await pdf.getPage(1);
    const scale = 3;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    const items = (await page.getTextContent()).items.filter(i => i.str && i.str.trim()).map(i => ({ str: i.str, x: i.transform[4], y: viewport.height / scale - i.transform[5], width: i.width }));
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    // Les pixels non blancs d'un rectangle (en pt), comptés par teinte : { dark, red, grey }.
    const count = (x0, y0, x1, y1) => {
      const out = { dark: 0, red: 0, grey: 0, ink: 0 };
      for (let y = Math.floor(y0 * scale); y < Math.ceil(y1 * scale); y++) for (let x = Math.floor(x0 * scale); x < Math.ceil(x1 * scale); x++) {
        const i = (y * canvas.width + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (r > 235 && g > 235 && b > 235) continue;
        out.ink++;
        if (r > 180 && g < 90 && b < 90) out.red++;
        else if (r < 90 && g < 90 && b < 90) out.dark++;
        else if (Math.abs(r - g) < 25 && Math.abs(g - b) < 25) out.grey++;
      }
      return out;
    };
    return { items, count, width: viewport.width / scale, height: viewport.height / scale };
  }
  cases.push({
    id: 'characterformat_pdf_draws_the_shadow_and_the_outline_as_vectors',
    description: 'PDF relu par pdf.js : un paragraphe dont le texte porte une ombre (décalée de 4 pt, rouge) est dessiné en vectoriel : le texte reste du texte (relu), l\'ombre rouge se voit à droite et en dessous du texte noir, que le même texte sans ombre n\'a pas ; un contour rouge épais couvre les lettres de pixels rouges ; un titre, un point de liste et un paragraphe centré sont dessinés de même',
    run: async (h) => {
      const shadowed = '<p><span style="text-shadow: 4pt 4pt 0pt #ff0000">Ombre MMMM</span></p>';
      const plain = '<p><span>Ombre MMMM</span></p>';
      const withShadow = await renderedPdf(h, shadowed);
      const without = await renderedPdf(h, plain);
      const itemOf = (view, text) => view.items.find(i => i.str.indexOf(text) !== -1);
      const a = itemOf(withShadow, 'Ombre');
      const b = itemOf(without, 'Ombre');
      const area = view => { const i = itemOf(view, 'Ombre'); return i ? view.count(i.x, i.y - 12, i.x + i.width + 6, i.y + 8) : null; };
      const sh = area(withShadow);
      const pl = area(without);
      const outlined = await renderedPdf(h, '<p><span style="color: #ffffff; -webkit-text-stroke: 1.5pt #ff0000; font-size: 28pt">MMMM</span></p>');
      const o = itemOf(outlined, 'MMMM');
      const oc = o ? outlined.count(o.x, o.y - 30, o.x + o.width + 4, o.y + 8) : null;
      const kinds = await renderedPdf(h, '<h2><span style="text-shadow: 3pt 3pt 0pt #ff0000">Titre</span></h2><ul><li><p><span style="text-shadow: 3pt 3pt 0pt #ff0000">Point</span></p></li></ul><p style="text-align: center"><span style="text-shadow: 3pt 3pt 0pt #ff0000">Centre</span></p>');
      const found = ['Titre', 'Point', 'Centre'].map(t => !!itemOf(kinds, t));
      const reds = ['Titre', 'Point', 'Centre'].map((t) => { const i = itemOf(kinds, t); return i ? kinds.count(i.x - 2, i.y - 20, i.x + i.width + 6, i.y + 8).red : -1; });
      const pass = !!a && !!b && sh.red > 20 && pl.red === 0 && sh.dark > 20 && withShadow.items.some(i => i.str.indexOf('Ombre') !== -1 && Math.abs(i.x - b.x) < 3) && withShadow.items.filter(i => i.str.indexOf('Ombre') !== -1).length === 2 && !!o && oc.red > 60 && found.every(Boolean) && reds.every(n => n > 8);
      return { pass, notes: JSON.stringify({ sh, pl, oc, found, reds, a, b }) };
    },
  });

  cases.push({
    id: 'characterformat_pdf_effect_paragraph_keeps_the_flow_in_a_page_a_cell_a_frame_and_a_rotated_frame',
    description: 'PDF : un paragraphe à ombre ne change rien à la mise en page autour de lui (le paragraphe suivant reste au même endroit que sans l\'effet, à 1,5 pt près) ; le même texte à ombre dans une case de tableau, dans un cadre de diapositive et dans un cadre pivoté est dessiné (l\'ombre rouge est peinte)',
    run: async (h) => {
      const fx = '<span style="text-shadow: 3pt 3pt 0pt #ff0000">Effet MMMM</span>';
      const after = async (first) => { const view = await renderedPdf(h, '<p>' + first + '</p><p>Apres</p>'); const i = view.items.find(it => it.str.indexOf('Apres') !== -1); return i ? i.y : null; };
      const yWith = await after(fx);
      const yWithout = await after('Effet MMMM');
      const listAfter = async (first) => { const view = await renderedPdf(h, '<ul><li><p>' + first + '</p><ul><li><p>Sous</p></li></ul></li></ul><p>Apres</p>'); const i = view.items.find(it => it.str.indexOf('Sous') !== -1); const j = view.items.find(it => it.str.indexOf('Apres') !== -1); return i && j ? [i.y, j.y] : null; };
      const listWith = await listAfter(fx);
      const listWithout = await listAfter('Effet MMMM');
      const cell = await renderedPdf(h, '<table><tbody><tr><td><p>' + fx + '</p></td><td><p>Voisin</p></td></tr></tbody></table>');
      const cellItem = cell.items.find(i => i.str.indexOf('Effet') !== -1);
      const cellReds = cellItem ? cell.count(cellItem.x - 2, cellItem.y - 14, cellItem.x + cellItem.width + 6, cellItem.y + 8).red : -1;
      const box = rot => FreeFrame.html({ x: 100, y: 100, w: 300, h: 100, rot, shape: 'rect', fill: '', line: '', lw: 0 }, '<p>' + fx + '</p>');
      const frame = await renderedPdf(h, box(0));
      const turned = await renderedPdf(h, box(90));
      const redsIn = view => view.count(0, 0, view.width, view.height).red;
      const pass = yWith !== null && yWithout !== null && Math.abs(yWith - yWithout) < 1.5 && !!listWith && !!listWithout && Math.abs(listWith[0] - listWithout[0]) < 1.5 && Math.abs(listWith[1] - listWithout[1]) < 1.5 && cellReds > 8 && redsIn(frame) > 20 && redsIn(turned) > 20;
      return { pass, notes: JSON.stringify({ yWith, yWithout, listWith, listWithout, cellReds, frame: redsIn(frame), turned: redsIn(turned) }) };
    },
  });

  // Un texte à ombre garde, dans le PDF, ce que son bloc a d'autre : numéro de note de bas de page (et la note, en bas de page), case d'une liste de tâches, numéro d'un titre numéroté, image du texte.
  const fxOf = text => '<span style="text-shadow: 3pt 3pt 0pt #ff0000">' + text + '</span>';
  const pdfItem = (view, text) => view.items.find(i => i.str.indexOf(text) !== -1);
  const redNear = (view, text) => { const i = pdfItem(view, text); return i ? view.count(i.x - 2, i.y - 20, i.x + i.width + 6, i.y + 8).red : -1; };
  cases.push({
    id: 'characterformat_pdf_effect_paragraph_keeps_its_footnote',
    description: 'PDF relu par pdf.js : un paragraphe à ombre rouge qui porte une note de bas de page garde le numéro « 1 » près de son texte et la note elle-même en bas de la page ; le paragraphe suivant ne bouge pas',
    run: async (h) => {
      const note = '<sup class="footnote-ref-marker" data-note-id="n1" data-note-text="Texte de la note du bas"></sup>';
      const paragraph = first => '<p>Debut ' + first + note + ' fin</p><p>Apres</p>';
      const withFx = await renderedPdf(h, paragraph(fxOf('Effet')));
      const plain = await renderedPdf(h, paragraph('Effet'));
      const number = withFx.items.find(i => i.str.trim() === '1');
      // La note est écrite par pdfmake, mot à mot : le mot « Texte » est en bas de la page, le « 1 » du pied suivi du texte.
      const text = withFx.items.find(i => i.str === 'Texte');
      const after = [pdfItem(withFx, 'Apres'), pdfItem(plain, 'Apres')];
      // Le dessin suit la hauteur de ligne du navigateur (l'exposant y compris), pdfmake celle de son texte : quelques points d'écart au plus.
      const pass = !!number && !!text && text.y > withFx.height / 2 && redNear(withFx, 'Effet') > 8 && !!after[0] && !!after[1] && Math.abs(after[0].y - after[1].y) < 4;
      return { pass, notes: JSON.stringify({ number, text, red: redNear(withFx, 'Effet'), after: after.map(i => i && i.y), items: withFx.items.map(i => i.str) }) };
    },
  });
  cases.push({
    id: 'characterformat_pdf_effect_paragraph_keeps_the_task_box',
    description: 'PDF relu par pdf.js : un point de liste de tâches dont le texte porte une ombre rouge garde sa case à cocher à gauche du texte, comme sans l\'effet',
    run: async (h) => {
      const task = txt => '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox"></label><div><p>' + txt + '</p></div></li></ul>';
      const withFx = await renderedPdf(h, task(fxOf('Tache')));
      const plain = await renderedPdf(h, task('Tache'));
      const box = (view) => { const i = pdfItem(view, 'Tache'); return i ? view.count(i.x - 22, i.y - 12, i.x - 2, i.y + 4).ink : -1; };
      const pass = box(withFx) > 10 && Math.abs(box(withFx) - box(plain)) <= 0.3 * box(plain) && redNear(withFx, 'Tache') > 8;
      return { pass, notes: JSON.stringify({ boxes: [box(withFx), box(plain)], red: redNear(withFx, 'Tache'), items: withFx.items.map(i => [i.str, i.x]) }) };
    },
  });
  cases.push({
    id: 'characterformat_pdf_effect_paragraph_keeps_the_heading_number',
    description: 'PDF relu par pdf.js : un titre numéroté (« 1) ») dont le texte porte une ombre rouge garde son numéro devant son texte, comme sans l\'effet ; le paragraphe suivant ne bouge pas',
    run: async (h) => {
      const heading = txt => '<div class="heading-numbering-config" data-style="numeric"></div><h1>' + txt + '</h1><p>Apres</p>';
      const withFx = await renderedPdf(h, heading(fxOf('Titre')));
      const plain = await renderedPdf(h, heading('Titre'));
      const joined = view => view.items.map(i => i.str).join('').replace(/\s+/g, ' ');
      const after = [pdfItem(withFx, 'Apres'), pdfItem(plain, 'Apres')];
      // Dans le dessin, l'ombre est une seconde copie du texte : le numéro et le mot y sont deux fois ; le numéro est à gauche du mot, à la même hauteur et à la même distance, comme sans l'effet (le dessin suit la place du navigateur, pdfmake la sienne : quelques points d'écart sur la page, pas dans la ligne).
      const numberAt = view => view.items.find(i => /^1\)/.test(i.str.trim()));
      const wordAt = view => pdfItem(view, 'Titre');
      const placed = view => !!numberAt(view) && !!wordAt(view) && numberAt(view).x < wordAt(view).x && Math.abs(numberAt(view).y - wordAt(view).y) < 1.5;
      const pass = placed(withFx) && placed(plain) && Math.abs((wordAt(withFx).x - numberAt(withFx).x) - (wordAt(plain).x - numberAt(plain).x)) < 3 && redNear(withFx, 'Titre') > 8 && !!after[0] && !!after[1] && Math.abs(after[0].y - after[1].y) < 2;
      return { pass, notes: JSON.stringify({ withFx: joined(withFx), plain: joined(plain), number: [numberAt(withFx), numberAt(plain)], word: [wordAt(withFx), wordAt(plain)], red: redNear(withFx, 'Titre'), after: after.map(i => i && i.y) }) };
    },
  });
  cases.push({
    id: 'characterformat_pdf_effect_paragraph_keeps_its_image',
    description: 'PDF relu par pdf.js : un paragraphe dont le texte porte une ombre rouge et qui contient une image la garde à sa place dans la ligne, comme sans l\'effet',
    run: async (h) => {
      const png = h.makeImage(120, 120, { type: 'image/png' });
      const picture = txt => '<p>' + txt + ' <img class="editor-image" src="' + png + '" style="width: 40px" alt="" data-layer="normal" data-wrap="inline"> fin</p><p>Apres</p>';
      const withFx = await renderedPdf(h, picture(fxOf('Image')));
      const plain = await renderedPdf(h, picture('Image'));
      const dark = (view) => { const i = pdfItem(view, 'Image'); return i ? view.count(i.x, i.y - 40, view.width - 20, i.y + 12).dark : -1; };
      const pass = dark(withFx) > 100 && Math.abs(dark(withFx) - dark(plain)) <= 0.35 * dark(plain) && redNear(withFx, 'Image') > 8;
      return { pass, notes: JSON.stringify({ dark: [dark(withFx), dark(plain)], red: redNear(withFx, 'Image'), items: withFx.items.map(i => i.str) }) };
    },
  });

  // Les replis du dessin vectoriel (effectBlockFrom rend null) qu'un document peut atteindre - le trait horizontal, l'image habillée, le numéro de titre sans place (le quatrième, une image qui n'est ni PNG ni JPEG, est inatteignable : les images sont ré-encodées avant, une image corrompue arrête déjà l'export avant l'effet) : le bloc reste un bloc ordinaire du PDF, sans l'ombre mais avec tout son texte, une seule fois, et le paragraphe suivant à sa place. Un repli qui
  // laisserait un trou, ou ferait échouer l'export, ou dessinerait la copie rouge quand même, se verrait ici.
  cases.push({
    id: 'characterformat_pdf_effect_fallbacks_keep_the_text_without_the_effect',
    description: 'PDF relu par pdf.js : trois blocs à ombre rouge que le dessin vectoriel ne sait pas faire - une citation coupée par un trait horizontal, une image habillée par le texte, un titre numéroté dont le numéro n\'a pas sa place devant le texte - gardent tout leur texte (une seule fois, sans la copie rouge de l\'ombre) et le paragraphe suivant',
    run: async (h) => {
      const png = h.makeImage(120, 80, { type: 'image/png' });
      const words = Array.from({ length: 30 }, (_, i) => 'mot' + i).join(' ');
      const cases = [
        { name: 'trait', html: '<blockquote><p>' + fxOf('Avant') + '</p><hr><p>Apres</p></blockquote><p>Suite</p>', texts: ['Avant', 'Apres', 'Suite'], shadowed: ['Avant'] },
        { name: 'habillée', html: '<p><img class="editor-image" src="' + png + '" alt="" style="width: 120px; height: 80px;" data-align="right" data-wrap="square">' + fxOf('Habillee') + ' ' + words + '</p><p>Suite</p>', texts: ['Habillee', 'mot29', 'Suite'], shadowed: ['Habillee'] },
        { name: 'numéro', html: '<div class="heading-numbering-config" data-style="numeric"></div><h1 style="text-indent: -60px">' + fxOf('Titre') + '</h1><p>Suite</p>', texts: ['Titre', 'Suite'], shadowed: ['Titre'] },
      ];
      const out = [];
      for (const c of cases) {
        const view = await renderedPdf(h, c.html);
        const once = c.texts.map(text => view.items.filter(i => i.str.indexOf(text) !== -1).length);
        const reds = c.shadowed.map(text => redNear(view, text));
        out.push({ name: c.name, once, reds, ok: once.every(n => n === 1) && reds.every(n => n === 0) });
      }
      return { pass: out.every(o => o.ok), notes: JSON.stringify(out) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.characterFormat = cases;
})();
