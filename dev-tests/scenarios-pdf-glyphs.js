// Suite "pdfGlyphs" - un caractère que la police d'un texte n'a pas ne s'imprime plus en case vide dans le PDF (B3 du 04/10, rapport « cas d'usage » : « Nguyễn » en gras s'imprimait
// « Nguy▯n », les mots cyrilliques et grecs en gras ou en Arial étaient blancs, un ✓ ★ ☎ ⚠ → ① ₿ ✅ n'était rien). pdfmake écrit un texte tout entier dans UNE police et dessine le glyphe 0
// de cette police (.notdef : une case vide) pour tout caractère qu'elle n'a pas, sans jamais le dire. js/pdf-glyph-fallback.js découpe maintenant chaque texte (js/pdf-export.js:inlineRuns,
// et le sommaire, les lignes de code, les notes de bas de page, un texte nu) en suites de caractères d'une même police : celle du texte, Roboto de la même graisse (grec, cyrillique et
// vietnamien), puis PPSymbols (js/pdf-fonts-symbols.js : flèches, coches, étoiles, chiffres cerclés, monnaies, quelques émojis en noir et blanc) ; Roboto Bold et Bold Italic
// (js/pdf-fonts.js) ont retrouvé tout ce que la police a.
//
// Le verdict se lit dans le PDF écrit, jamais dans le docDefinition : pdf.js relit les octets et compte les glyphes dessinés qui sont la case vide de leur police (`originalCharCode`
// 0 : c'est ainsi que pdfkit écrit un caractère absent de la police, et `\u0000` dans le texte que pdf.js en extrait) ; le texte extrait doit aussi redonner les caractères
// (le glyphe vient bien de la police de repli, avec son Unicode). Chinois, japonais, arabe, hébreu et thaï restent des cases vides : aucune police assez légère, et pdfmake ne dessine
// pas de droite à gauche. Les groupes pdfFidelity et pdfGroundTruth gardent le reste de l'export.
(function () {
  const cases = [];

  const VIETNAMESE = 'Nguyễn Thị Hương';
  const CYRILLIC = 'Привет, мир';
  const GREEK = 'Αθήνα Ελληνικά';
  const SYMBOLS = '✓ ✗ ★ ☎ ⚠ → ① ② ③ ₿ ฿ ₂ ✅ ❌';
  const squash = s => String(s).replace(/[\s\u0000]+/g, '');
  const NO_HF = { enabled: false, differentFirstPage: false, header: { default: '', first: '' }, footer: { default: '', first: '' } };

  // Ce que le PDF écrit vraiment : les glyphes dessinés (`shown`), parmi eux ceux qui sont la case vide de leur police (`blank`), les pages et le texte extrait, sans espaces.
  async function painted(h, base64) {
    await h.ensurePdfJsLoaded();
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
    const OPS = window.pdfjsLib.OPS;
    let shown = 0;
    let blank = 0;
    let text = '';
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const ops = await page.getOperatorList();
      for (let i = 0; i < ops.fnArray.length; i++) {
        if (ops.fnArray[i] !== OPS.showText) continue;
        for (const glyph of ops.argsArray[i][0]) {
          if (typeof glyph === 'number') continue; // un déplacement de crénage, pas un glyphe
          shown++;
          if (glyph.originalCharCode === 0) blank++;
        }
      }
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join('');
    }
    return { shown, blank, pages: pdf.numPages, text: squash(text), rawText: text };
  }

  async function exportOf(h, html, headerFooter) {
    const out = await h.exportPdfContent(html, headerFooter || null);
    return Object.assign({ out }, await painted(h, out.base64));
  }

  // Les polices de pdfmake ne sont là qu'après le premier export : les scénarios qui lisent PdfGlyphFallback à vide les attendent.
  async function fontsReady() {
    await PdfExport.ensurePdfLibsLoaded();
    return window.pdfMake;
  }

  const runsText = runs => runs.map(run => run.text).join('');
  const fontsOf = runs => runs.map(run => run.font || '');
  // Les propriétés d'un run sans le texte ni la police : ce que le style du texte lui a donné.
  const styleOf = run => { const copy = Object.assign({}, run); delete copy.text; delete copy.font; return JSON.stringify(copy); };

  // --- Le découpage d'un texte en suites d'une même police ---------------------------------------------------------------------------------------------------------------

  cases.push({
    id: 'pdfglyph_runs_text_the_font_has_stays_one_run',
    description: 'Un texte que sa police a en entier reste un seul run, tel qu\'avant : français courant (« œ – € … ’ »), vietnamien, grec et cyrillique en gras ou en italique (Roboto Bold a retrouvé tout ce que la police a), Arial latin',
    run: async () => {
      await fontsReady();
      const french = 'Texte courant, œuvre « citée » – 12 € … l’été ; 100 % №';
      const checks = [
        ['français', french, {}],
        ['vietnamien gras', VIETNAMESE, { bold: true }],
        ['vietnamien gras italique', VIETNAMESE, { bold: true, italics: true }],
        ['cyrillique gras', CYRILLIC, { bold: true }],
        ['grec gras italique', GREEK, { bold: true, italics: true }],
        ['cyrillique normal', CYRILLIC, {}],
        ['latin en Arial', 'Café déjà vu', { font: 'Arimo' }],
        ['case à cocher', '☑', { font: 'PPBoxAccent' }],
      ];
      const bad = checks.filter(([, text, style]) => {
        const runs = PdfGlyphFallback.runsFor(text, Object.assign({ fontSize: 10.5 }, style));
        return runs.length !== 1 || runs[0].text !== text || runs[0].font !== style.font;
      }).map(c => c[0]);
      return { pass: bad.length === 0, notes: bad.length ? 'découpés à tort : ' + bad.join(', ') : 'tous d\'un seul tenant' };
    },
  });

  cases.push({
    id: 'pdfglyph_runs_a_symbol_goes_to_PPSymbols_and_the_style_follows',
    description: 'Un ✓ dans un texte gras, souligné, en lien et en couleur : le texte autour reste dans sa police, seul le signe passe dans PPSymbols, avec le même style (lien, couleur, soulignement, taille)',
    run: async () => {
      await fontsReady();
      const style = { fontSize: 10.5, bold: true, italics: true, color: '#c0392b', link: 'https://example.org', decoration: ['underline'], preserveLeadingSpaces: true };
      const runs = PdfGlyphFallback.runsFor('Fait ✓ ok', style);
      const pass = runsText(runs) === 'Fait ✓ ok' && JSON.stringify(fontsOf(runs)) === JSON.stringify(['', 'PPSymbols', '']) && runs.every(run => styleOf(run) === JSON.stringify(style));
      return { pass, notes: JSON.stringify(runs) };
    },
  });

  cases.push({
    id: 'pdfglyph_runs_other_families_fall_back_to_roboto_of_the_same_weight',
    description: 'Du cyrillique ou du grec dans Arial, Times, Georgia ou Courier (qui n\'ont que le latin) passe dans Roboto, de la même graisse et du même italique ; les espaces entre deux mots cyrilliques n\'en font pas deux runs',
    run: async () => {
      await fontsReady();
      const premise = ['Arimo', 'Tinos', 'Gelasio', 'Cousine', 'Carlito'].filter(family => PdfGlyphFallback.covers(family, false, false, 0x41F));
      const arial = PdfGlyphFallback.runsFor('Привет мир', { font: 'Arimo', bold: true, fontSize: 10.5 });
      const times = PdfGlyphFallback.runsFor('Αθήνα', { font: 'Tinos', italics: true, fontSize: 10.5 });
      const mixed = PdfGlyphFallback.runsFor('Привет, мир', { font: 'Arimo', fontSize: 10.5 });
      const code = PdfGlyphFallback.runsFor('x → y', { font: 'Cousine', fontSize: 9.5 });
      const pass = premise.length === 0
        && arial.length === 1 && arial[0].font === 'Roboto' && arial[0].bold === true && arial[0].text === 'Привет мир'
        && times.length === 1 && times[0].font === 'Roboto' && times[0].italics === true
        && JSON.stringify(fontsOf(mixed)) === JSON.stringify(['Roboto', 'Arimo', 'Roboto']) && runsText(mixed) === 'Привет, мир'
        && runsText(code) === 'x → y' && code.every(run => run.fontSize === 9.5);
      return { pass, notes: JSON.stringify({ familleAvecCyrillique: premise, arial, mixed: fontsOf(mixed), code: fontsOf(code) }) };
    },
  });

  cases.push({
    id: 'pdfglyph_runs_invisible_marks_go_and_accents_stay_with_their_letter',
    description: 'Le sélecteur « émoji » derrière un ✔, un non-joint et une marque de sens d\'écriture ne s\'écrivent pas ; une lettre décomposée (e + accent combinant) revient en une lettre ; un accent ne commence jamais un run ; ZWSP de Roboto (retour à la ligne) reste',
    run: async () => {
      await fontsReady();
      const style = { fontSize: 10.5 };
      const check = PdfGlyphFallback.runsFor('✔️ ok', style);
      const controls = PdfGlyphFallback.runsFor('a‎b‌c ★', style);
      const decomposed = PdfGlyphFallback.runsFor('Müller crème ✓', style);
      const cyrillicAccent = PdfGlyphFallback.runsFor('ма́ма ✓', { font: 'Arimo', fontSize: 10.5 });
      const zeroWidth = PdfGlyphFallback.runsFor('long​mot', style);
      const startsWithMark = [check, controls, decomposed, cyrillicAccent].some(runs => runs.some(run => /^\p{M}/u.test(run.text)));
      const pass = runsText(check) === '✔ ok' && runsText(controls) === 'abc ★'
        && runsText(decomposed) === 'Müller crème ✓' && runsText(cyrillicAccent).normalize('NFC') === 'ма́ма ✓'.normalize('NFC')
        && runsText(zeroWidth) === 'long​mot' && !startsWithMark;
      return { pass, notes: JSON.stringify({ check: runsText(check), controls: runsText(controls), decomposed: runsText(decomposed), zeroWidth: zeroWidth.length }) };
    },
  });

  cases.push({
    id: 'pdfglyph_runs_a_character_no_font_has_stays_in_the_text_font',
    description: 'Chinois, arabe, hébreu : aucune police ne les a, ils restent dans la police du texte (case vide, comme avant), sans exception ni police inventée',
    run: async () => {
      await fontsReady();
      const text = '漢字 مرحبا שלום';
      const runs = PdfGlyphFallback.runsFor(text, { fontSize: 10.5, bold: true });
      return { pass: runsText(runs) === text && fontsOf(runs).every(font => font === ''), notes: JSON.stringify(runs) };
    },
  });

  cases.push({
    id: 'pdfglyph_fonts_roboto_bold_has_what_the_regular_has_and_PPSymbols_is_registered',
    description: 'Roboto Bold et Bold Italic ont le grec, le cyrillique et le vietnamien ; PPSymbols est enregistrée dans les quatre graisses sur le même fichier, avec ✓ → ★ ① ₿ ฿ ✅ et l\'espace fine insécable',
    run: async () => {
      const pdfMake = await fontsReady();
      const files = ['Roboto-Bold.ttf', 'Roboto-BoldItalic.ttf', 'PPSymbols.ttf'].filter(file => typeof pdfMake.vfs[file] !== 'string');
      const regular = ['Α', 'Ω', 'П', 'я', 'ễ', 'ơ', 'ư', 'ạ'].map(ch => ch.codePointAt(0));
      const bold = regular.filter(code => !PdfGlyphFallback.covers('Roboto', true, false, code) || !PdfGlyphFallback.covers('Roboto', true, true, code));
      const family = pdfMake.fonts.PPSymbols || {};
      const sameFile = ['normal', 'bold', 'italics', 'bolditalics'].every(key => family[key] === 'PPSymbols.ttf');
      const symbols = [...'✓→★①₿฿✅❌☎⚠₂ '].filter(ch => !PdfGlyphFallback.covers('PPSymbols', false, false, ch.codePointAt(0)));
      return { pass: files.length === 0 && bold.length === 0 && sameFile && symbols.length === 0, notes: JSON.stringify({ fichiersAbsents: files, grasSansLeCaractere: bold, memeFichier: sameFile, symbolesAbsents: symbols }) };
    },
  });

  // --- Dans le PDF écrit -------------------------------------------------------------------------------------------------------------------------------------------------

  const FAMILIES = [['Roboto', ''], ['Arial', 'Arial'], ['Times New Roman', '"Times New Roman"'], ['Georgia', 'Georgia'], ['Courier New', '"Courier New"'], ['Calibri', 'Calibri']];
  const WEIGHTS = [['normal', '', ''], ['gras', '<strong>', '</strong>'], ['italique', '<em>', '</em>'], ['gras italique', '<strong><em>', '</em></strong>']];

  cases.push({
    id: 'pdfglyph_pdf_every_family_and_weight_prints_no_blank_glyph',
    description: 'Vietnamien, cyrillique, grec et pictogrammes dans les six familles et les quatre graisses : le PDF écrit n\'a aucune case vide, et le texte extrait redonne chaque ligne',
    run: async (h) => {
      await h.resetEditor();
      const lines = [];
      const html = FAMILIES.map(([name, css]) => WEIGHTS.map(([weight, open, close]) => {
        const text = name + ' ' + weight + ' : ' + [VIETNAMESE, CYRILLIC, GREEK, SYMBOLS].join(' · ');
        lines.push(squash(text));
        return '<p' + (css ? ' style="font-family: ' + css.replace(/"/g, '&quot;') + '"' : '') + '>' + open + text + close + '</p>';
      }).join('')).join('');
      const result = await exportOf(h, html);
      const defined = JSON.stringify(result.out.content);
      const families = ['Arimo', 'Tinos', 'Gelasio', 'Cousine', 'Carlito', 'PPSymbols'].filter(font => defined.indexOf('"font":"' + font + '"') === -1);
      const lost = lines.filter(line => result.text.indexOf(line) === -1);
      return { pass: result.blank === 0 && lost.length === 0 && families.length === 0, notes: JSON.stringify({ casesVides: result.blank, glyphes: result.shown, pages: result.pages, lignesPerdues: lost.length, famillesSansRun: families }) };
    },
  });

  cases.push({
    id: 'pdfglyph_pdf_symbols_in_every_context',
    description: 'Titre, liste, tableau, lien, texte nu, sommaire, note de bas de page, bloc de code, en-tête et pied de page : chacun écrit ses pictogrammes et son cyrillique sans case vide',
    run: async (h) => {
      const hf = { enabled: true, differentFirstPage: false, header: { default: '<p>En-tête ✓ → ①</p>', first: '' }, footer: { default: '<p>Pied ★ ☎ Привет</p>', first: '' } };
      const contexts = [
        ['titre', '<h1>Titre → Привет ✓</h1><h3><em>Sous-titre ★</em></h3>', null, ['Titre→Привет✓', 'Sous-titre★']],
        ['liste', '<ul><li><p>Item ✓ → ①</p></li></ul><ol><li><p><strong>Gras Привет ★</strong></p></li></ol>', null, ['Item✓→①', 'GrasПривет★']],
        ['tableau', '<table><tbody><tr><td><p>Cellule ✓ → ①</p></td><td><p><strong>Gras Привет ★</strong></p></td></tr></tbody></table>', null, ['Cellule✓→①', 'GrasПривет★']],
        ['lien', '<p><a href="https://example.org">Lien ✓ → Привет</a></p>', null, ['Lien✓→Привет']],
        ['texte nu', 'Texte ✓ libre → ①', null, ['Texte✓libre→①']],
        ['sommaire', '<div class="toc-marker"></div><h1>Étape → Résultat ✓</h1><p>texte</p><h2>Sous-titre ★ Привет</h2><p>fin</p>', null, ['SommaireÉtape→Résultat✓1Sous-titre★Привет1']],
        ['note de bas de page', '<p>Texte<sup class="footnote-ref-marker" data-note-id="1" data-note-text="Note ✓ → Привет ①">1</sup></p>', null, ['Note✓→Привет①']],
        ['bloc de code', '<pre><code>x → ✓ Привет ①\n  ligne 2 ★</code></pre>', null, ['x→✓Привет①ligne2★']],
        ['en-tête et pied', '<p>Corps</p>', hf, ['En-tête✓→①', 'Pied★☎Привет']],
      ];
      const failures = [];
      for (const [name, html, headerFooter, expected] of contexts) {
        await h.resetEditor();
        const result = await exportOf(h, html, headerFooter);
        const lost = expected.filter(part => result.text.indexOf(part) === -1);
        if (result.blank !== 0 || lost.length) failures.push(name + ' : ' + result.blank + ' case(s) vide(s)' + (lost.length ? ', texte absent : ' + lost.join(' / ') : ''));
      }
      return { pass: failures.length === 0, notes: failures.length ? failures.join(' ; ') : contexts.length + ' contextes sans case vide' };
    },
  });

  cases.push({
    id: 'pdfglyph_pdf_plain_french_text_never_leaves_its_font',
    description: 'Un français courant (guillemets, œ, €, tirets, points de suspension, apostrophe courbe) ne change de police nulle part : aucune police de repli dans le docDefinition, aucune case vide',
    run: async (h) => {
      await h.resetEditor();
      const html = '<h1>Œuvre complète – résumé</h1><p>« Ça coûte 12 € », dit-il… l’été dernier ; № 5, 100 % sûr.</p><p><strong>Gras : œuvre « citée » – 12 €</strong></p><p style="font-family: Arial">Arial : « Ça coûte 12 € » – œuvre</p>';
      const result = await exportOf(h, html);
      const defined = JSON.stringify(result.out.content);
      const fallbackRuns = ['PPSymbols', 'Roboto'].filter(font => defined.indexOf('"font":"' + font + '"') !== -1);
      return { pass: result.blank === 0 && fallbackRuns.length === 0 && result.text.indexOf('«Çacoûte12€»') !== -1, notes: JSON.stringify({ casesVides: result.blank, policesDeRepli: fallbackRuns }) };
    },
  });

  cases.push({
    id: 'pdfglyph_pdf_a_line_with_a_symbol_keeps_the_line_pitch',
    description: 'Une ligne qui porte un ✓ ou un mot cyrillique a la hauteur des autres lignes : PPSymbols et Roboto ont la métrique verticale du texte (position réellement peinte des trois lignes, pdf.js)',
    run: async (h) => {
      await h.resetEditor();
      const pitch = async middle => {
        const out = await h.exportPdfContent('<p>Ligne un</p><p>' + middle + '</p><p>Ligne trois</p>', null);
        const truth = await h.extractPdfGroundTruth(out.base64);
        // pdf.js rend un mot par élément : la première ligne de chaque paragraphe commence par un « Ligne ».
        const ys = truth.pages[0].textItems.filter(it => it.str === 'Ligne').map(it => it.y).sort((a, b) => a - b);
        return { first: ys.length === 3 ? ys[0] : null, second: ys.length === 3 ? ys[1] : null, third: ys.length === 3 ? ys[2] : null };
      };
      const plain = await pitch('Ligne deux');
      const marked = await pitch('Ligne deux ✓ → ① Привет');
      const known = [plain, marked].every(p => p.first !== null && p.second !== null && p.third !== null);
      const pass = known && Math.abs((marked.second - marked.first) - (plain.second - plain.first)) < 0.05 && Math.abs((marked.third - marked.second) - (plain.third - plain.second)) < 0.05;
      return { pass, notes: JSON.stringify({ sans: plain, avec: marked }) };
    },
  });

  cases.push({
    id: 'pdfglyph_pdf_unsupported_scripts_do_not_stop_the_export',
    description: 'Chinois, arabe et hébreu dans un texte : l\'export aboutit, le reste du texte (latin, symboles) est écrit sans case vide, seuls ces caractères en restent une',
    run: async (h) => {
      await h.resetEditor();
      const result = await exportOf(h, '<p>Avant ✓ 漢字 مرحبا שלום après → fin</p>');
      const hasRest = ['Avant✓', 'après→fin'].every(part => result.text.indexOf(part) !== -1);
      // 2 + 5 + 4 lettres sans police : seules leurs cases sont vides.
      return { pass: hasRest && result.blank === 11, notes: JSON.stringify({ casesVides: result.blank, texte: result.rawText.slice(0, 80) }) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.pdfGlyphs = cases;
})();
