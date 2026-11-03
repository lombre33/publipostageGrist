// Suite "slideTheme" - le thème d'une présentation (js/slide-theme.js, css/slide-theme.css, la clé `theme` de la page dans js/page-layout.js, js/slides-entry.js:outputHtml, la rangée « Couleurs du thème » de js/color-store.js et
// js/color-palette.js, l'aspect d'une forme neuve de js/free-frame.js, la police et la couleur par défaut de la barre d'outils, le thème du fichier de js/pptx-export.js), demande du 02/11 : « Ajouter un thème de présentation ».
//  - la DONNÉE : un thème est borné (couleurs #rrggbb, six polices, un nom court ; tout le reste retombe sur la valeur d'origine), il voyage avec la page (Margins), une présentation sans thème n'a aucune clé de plus ;
//  - l'ÉCRAN : la police et la couleur du texte et des titres du thème sont celles de l'éditeur par défaut ; une marque de texte, le style d'un niveau de titre et un bloc de code gardent les leurs ; l'écriture d'en-tête ne les a pas ;
//  - les SORTIES : le HTML de la Lecture et des exports porte la police et la couleur du thème en style (jamais par-dessus ce que le bloc ou le style de son titre porte), le PDF, le Word et le HTML les écrivent, le PowerPoint
//    écrit le thème dans son thème de fichier ; sans thème, rien n'est ajouté nulle part ;
//  - le CHANGEMENT de thème : ce qui avait une couleur de l'ancien thème prend celle du nouveau (texte, titres, puces, cases, fond de diapositive), une couleur composée à la main et une police ne bougent pas, UN Ctrl+Z défait le
//    thème et les couleurs ensemble ;
//  - les menus de couleur : la rangée « Couleurs du thème » (neuf pastilles nommées, sans croix) n'existe qu'avec un thème ; une forme neuve prend l'aspect du premier accent ;
//  - les thèmes prêts de l'extension se lisent (contraste ≥ 4,5:1 sur le fond), polices parmi les six.
// La fenêtre « Thème… » à la vraie souris (700x400, clavier, anglais) est dans dev-tests/verify-slide-theme.mjs.
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const editor = () => EditorCore.getEditor();
  const add = (id, description, run) => cases.push({ id, description, run });
  const result = bad => ({ pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' });
  const OCEAN = { name: 'Océan', colors: { bg: '#ffffff', text: '#1e2a35', title: '#0b3c5d', accent1: '#1d70b8', accent2: '#00a3a3', accent3: '#5aa9e6', accent4: '#f2a541', accent5: '#6c8ead', accent6: '#3bb273' }, fonts: { title: 'Georgia', body: 'Calibri' } };
  // Un thème sombre : le fond de la page, le texte clair.
  const DARK = { name: 'Nuit', colors: Object.assign({}, OCEAN.colors, { bg: '#1b2430', text: '#f2f5f9', title: '#ffffff' }), fonts: OCEAN.fonts };
  const YELLOW = '#fde047';
  const rgb = hex => 'rgb(' + [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ') + ')';
  const paint = el => { const cs = getComputedStyle(el); return { color: cs.color, family: cs.fontFamily, size: cs.fontSize }; };
  const first = selector => document.querySelector('#editor-container .ProseMirror ' + selector);
  const BR = '<div class="page-break-marker" contenteditable="false">Saut de page</div>';
  const SAMPLE = '<h1>Titre un</h1><p>Un texte <strong>gras</strong> et <span style="color: #2f6fed">bleu</span>.</p>' + BR + '<h2>Deux</h2><p>Suite</p>';

  async function load(markup, margins) {
    PageLayout.setMarginsMm(margins || null);
    Editor.setHTML(markup);
    await sleep(200);
  }
  const withTheme = async (theme) => { PageLayout.setTheme(theme); await sleep(60); };
  const reset = async (h) => { await h.resetEditor(); PageLayout.setMarginsMm(null); document.documentElement.classList.remove('pp-themed'); };
  // Le texte `needle` dans le document : ses bornes et ses marques.
  function range(needle) {
    let found = null;
    editor().state.doc.descendants((node, pos) => {
      if (found || !node.isText) return;
      const at = node.text.indexOf(needle);
      if (at !== -1) found = { from: pos + at, to: pos + at + needle.length };
    });
    if (!found) throw new Error('texte introuvable : ' + needle);
    return found;
  }
  // Les réglages de la marque de texte posée sur `needle`, les couleurs en #rrggbb (une marque lue d'un HTML garde « rgb(r, g, b) », une marque posée par le menu un #rrggbb : les deux formes sont des couleurs).
  const textStyleOf = (needle) => {
    const mark = editor().state.doc.nodeAt(range(needle).from).marks.find(m => m.type.name === 'textStyle');
    const attrs = mark ? Object.fromEntries(Object.entries(mark.attrs).filter(([, v]) => v)) : {};
    ['color', 'backgroundColor'].forEach((name) => { if (attrs[name]) attrs[name] = ColorMath.parseCss(attrs[name]) || attrs[name]; });
    return attrs;
  };
  const rawColorOf = (needle) => { const mark = editor().state.doc.nodeAt(range(needle).from).marks.find(m => m.type.name === 'textStyle'); return mark && mark.attrs.color; };
  const mark = (needle, attrs) => editor().chain().focus().setTextSelection(range(needle)).setMark('textStyle', attrs).run();

  add('th_a_theme_is_bounded_and_a_page_without_one_has_no_key',
    'normalize garde #rrggbb en minuscules, les six polices et un nom de 40 signes ; une valeur abîmée prend la valeur d\'origine de son réglage ; ni objet ni couleurs : null ; la page d\'une présentation sans thème n\'a aucune clé de plus',
    async (h) => {
      await reset(h);
      const bad = [];
      const hostile = { name: '  Un   nom ' + 'x'.repeat(60), colors: { text: 'red', title: '#ABCDEF', bg: 'url(x)', accent1: '#12', accent2: 12, accent3: '#00FF00;background:red' }, fonts: { title: 'Comic Sans', body: 'times new roman' } };
      const t = SlideTheme.normalize(hostile);
      if (t.colors.text !== SlideTheme.DEFAULT_COLORS.text || t.colors.title !== '#abcdef' || t.colors.bg !== '#ffffff' || t.colors.accent1 !== SlideTheme.DEFAULT_COLORS.accent1 || t.colors.accent3 !== SlideTheme.DEFAULT_COLORS.accent3) bad.push('couleurs : ' + JSON.stringify(t.colors));
      if (t.fonts.title !== 'Roboto' || t.fonts.body !== 'Times New Roman') bad.push('polices : ' + JSON.stringify(t.fonts));
      if (!t.name || t.name.length > SlideTheme.NAME_MAX || /\s{2}/.test(t.name)) bad.push('nom : ' + JSON.stringify(t.name));
      if (JSON.stringify(Object.keys(t)) !== '["v","name","colors","fonts"]' || JSON.stringify(Object.keys(t.colors)) !== JSON.stringify(SlideTheme.COLOR_SLOTS)) bad.push('ordre des clés : ' + Object.keys(t) + ' / ' + Object.keys(t.colors));
      if (SlideTheme.normalize(null) !== null || SlideTheme.normalize('pas du json') !== null || SlideTheme.normalize({}) !== null || SlideTheme.normalize({ colors: 3 }) !== null || SlideTheme.normalize([1]) !== null) bad.push('une valeur qui n\'est pas un thème n\'est pas null');
      if (!SlideTheme.equals(JSON.stringify(OCEAN), OCEAN)) bad.push('un thème lu de son JSON diffère');
      PageLayout.setMarginsMm({ top: 10, right: 10, bottom: 10, left: 10, theme: hostile });
      if (!PageLayout.getTheme() || PageLayout.getTheme().colors.title !== '#abcdef') bad.push('la page n\'a pas gardé le thème borné');
      PageLayout.setMarginsMm({ top: 10, right: 10, bottom: 10, left: 10 });
      if ('theme' in PageLayout.getMarginsMm() || PageLayout.getTheme() !== null || 'theme' in PageLayout.getMarginsPt()) bad.push('une page sans thème a une clé theme');
      return result(bad);
    });

  add('th_the_theme_travels_with_the_page_and_is_announced',
    'setTheme pose, change et retire le thème en gardant les marges, le sens, le filigrane et les couleurs du modèle ; pp:themeChanged n\'est annoncé que sur un vrai changement ; le thème sort de getMarginsPt et revient d\'un aller-retour JSON',
    async (h) => {
      await reset(h);
      const bad = [];
      let events = 0;
      const listener = () => { events += 1; };
      document.addEventListener('pp:themeChanged', listener);
      try {
        PageLayout.setMarginsMm({ top: 12, right: 12, bottom: 12, left: 12, orientation: 'landscape', format: '190.5x338.7', watermark: { text: 'Brouillon' }, colors: ['#123456'] });
        if (!PageLayout.setTheme(OCEAN) || events !== 1) bad.push('setTheme n\'a pas annoncé le changement');
        if (PageLayout.setTheme(OCEAN) || events !== 1) bad.push('un même thème a été annoncé de nouveau');
        const kept = PageLayout.getMarginsMm();
        if (kept.top !== 12 || kept.orientation !== 'landscape' || kept.format !== '190.5x338.7' || !kept.watermark || kept.colors[0] !== '#123456') bad.push('le thème a abîmé le reste de la page : ' + JSON.stringify(kept));
        if (!PageLayout.getMarginsPt().theme || PageLayout.getMarginsPt().theme.fonts.title !== 'Georgia' || !PageLayout.getMarginsTwip().theme) bad.push('le thème ne voyage pas avec la page des exports');
        const stored = JSON.stringify(PageLayout.getMarginsMm());
        PageLayout.setMarginsMm(null);
        if (PageLayout.getTheme()) bad.push('setMarginsMm(null) a gardé le thème');
        PageLayout.setMarginsMm(JSON.parse(stored));
        if (!SlideTheme.equals(PageLayout.getTheme(), OCEAN)) bad.push('le thème n\'a pas fait l\'aller-retour : ' + JSON.stringify(PageLayout.getTheme()));
        if (!PageLayout.setTheme(null) || PageLayout.getTheme() !== null || events !== 2 || PageLayout.getWatermark().text !== 'Brouillon') bad.push('retirer le thème : ' + JSON.stringify(PageLayout.getMarginsMm()));
      } finally { document.removeEventListener('pp:themeChanged', listener); }
      return result(bad);
    });

  add('th_without_a_theme_the_editor_and_the_outputs_are_as_before',
    'Sans thème : ni classe `pp-themed`, ni variable `--pp-theme-*` sur <html>, le texte a la police et la couleur de l\'éditeur, outputHtml n\'écrit ni police ni couleur, la barre dit Roboto',
    async (h) => {
      await reset(h);
      await load(SAMPLE);
      const bad = [];
      if (document.documentElement.classList.contains('pp-themed')) bad.push('classe pp-themed présente');
      SlideTheme.VARS.forEach((name) => { if (document.documentElement.style.getPropertyValue(name)) bad.push('variable ' + name + ' posée'); });
      const p = paint(first('p'));
      if (p.color !== 'rgb(27, 36, 48)' || !/^Roboto/.test(p.family)) bad.push('texte : ' + JSON.stringify(p));
      const out = SlidesEntry.outputHtml('presentation', Editor.getHTML(), {});
      if (/font-family|color: rgb\(27/.test(out)) bad.push('outputHtml a écrit un style : ' + out.slice(0, 200));
      if (SlidesEntry.outputHtml('presentation', Editor.getHTML(), { theme: null }) !== out) bad.push('theme: null change le HTML');
      if (SlideTheme.shapeLook() !== null || SlideTheme.lineLook() !== null || SlideTheme.defaultsAt(editor().state) !== null) bad.push('un aspect de thème sans thème');
      if (ColorStore.themeRow() !== null || ColorStore.rows().length !== 2) bad.push('rangée du thème sans thème : ' + ColorStore.rows().map(r => r.id));
      return result(bad);
    });

  add('th_the_editor_shows_the_theme_by_default_and_what_is_chosen_wins',
    'Avec un thème : le texte et les titres prennent sa police et sa couleur dans l\'éditeur ; une couleur ou une police posée sur un mot, le style d\'un niveau de titre et un bloc de code gardent les leurs ; l\'écriture d\'en-tête n\'a pas le thème ; le retirer rend l\'éditeur d\'avant',
    async (h) => {
      await reset(h);
      const config = '<div class="heading-numbering-config" data-style="none" data-level-styles=\'{"2":{"color":"#c0392b","fontFamily":"Arial"}}\'></div>';
      await load(config + SAMPLE + '<pre><code>code</code></pre>');
      await withTheme(OCEAN);
      const bad = [];
      const h1 = paint(first('h1'));
      const p = paint(first('p'));
      if (h1.color !== rgb(OCEAN.colors.title) || !/^Georgia/.test(h1.family)) bad.push('titre : ' + JSON.stringify(h1));
      if (p.color !== rgb(OCEAN.colors.text) || !/^Calibri/.test(p.family)) bad.push('texte : ' + JSON.stringify(p));
      if (!document.documentElement.classList.contains('pp-themed')) bad.push('classe absente');
      const span = paint(first('p span'));
      if (span.color !== rgb('#2f6fed')) bad.push('la couleur d\'un mot a été remplacée : ' + span.color);
      mark('Suite', { fontFamily: 'Arial', color: '#aa0000' });
      await sleep(60);
      const marked = paint(Array.from(document.querySelectorAll('#editor-container .ProseMirror p span')).find(s => s.textContent === 'Suite'));
      if (marked.color !== rgb('#aa0000') || !/^Arial/.test(marked.family)) bad.push('une marque ne l\'emporte pas : ' + JSON.stringify(marked));
      const h2 = paint(first('h2'));
      if (h2.color !== rgb('#c0392b') || !/^Arial/.test(h2.family)) bad.push('le style du niveau de titre ne l\'emporte pas : ' + JSON.stringify(h2));
      const pre = paint(first('pre'));
      if (pre.color !== 'rgb(27, 36, 48)' || !/Cousine|Courier|monospace/.test(pre.family)) bad.push('le bloc de code a pris le thème : ' + JSON.stringify(pre));
      const container = document.getElementById('editor-container');
      container.classList.add('hf-editing');
      const inHeader = paint(first('p'));
      container.classList.remove('hf-editing');
      if (inHeader.color !== 'rgb(27, 36, 48)' || !/^Roboto/.test(inHeader.family)) bad.push('l\'en-tête a le thème : ' + JSON.stringify(inHeader));
      await withTheme(null);
      const after = paint(first('p'));
      if (after.color !== 'rgb(27, 36, 48)' || !/^Roboto/.test(after.family) || document.documentElement.classList.contains('pp-themed')) bad.push('l\'éditeur d\'avant n\'est pas rendu : ' + JSON.stringify(after));
      return result(bad);
    });

  add('th_the_toolbar_shows_the_theme_font_and_color_when_nothing_changes_them',
    'Le curseur dans un paragraphe sans marque : la puce de police dit la police du texte du thème, dans un titre celle des titres, la couleur du texte est celle du thème ; sans thème, Roboto ; une marque l\'emporte',
    async (h) => {
      await reset(h);
      await load(SAMPLE);
      const bad = [];
      const chip = () => document.getElementById('v2-font-chip-val').textContent;
      const at = (needle) => { editor().chain().focus().setTextSelection(range(needle).from + 1).run(); };
      at('Suite');
      EditorCore.getEditor && 0;
      await sleep(60);
      if (chip() !== 'Roboto') bad.push('sans thème : ' + chip());
      await withTheme(OCEAN);
      await sleep(60);
      if (chip() !== 'Calibri') bad.push('texte : ' + chip());
      at('Titre');
      await sleep(60);
      if (chip() !== 'Georgia') bad.push('titre : ' + chip());
      mark('Titre', { fontFamily: 'Arial' });
      at('Titre');
      await sleep(60);
      if (chip() !== 'Arial') bad.push('une marque ne l\'emporte pas : ' + chip());
      const themed = SlideTheme.defaultsAt(editor().state);
      if (!themed || themed.color !== OCEAN.colors.title) bad.push('couleur par défaut : ' + JSON.stringify(themed));
      await withTheme(null);
      at('Suite');
      await sleep(60);
      if (chip() !== 'Roboto') bad.push('thème retiré : ' + chip());
      return result(bad);
    });

  add('th_the_output_html_gets_the_theme_without_covering_what_is_set',
    'outputHtml écrit la police et la couleur du thème sur les paragraphes et les titres ; un style déjà là, un bloc de code, une légende et le style d\'un niveau de titre ne sont pas recouverts ; les sauts de diapositive restent marqués',
    async (h) => {
      await reset(h);
      const bad = [];
      const config = '<div class="heading-numbering-config" data-style="none" data-level-styles=\'{"2":{"color":"#c0392b"}}\'></div>';
      const html = config + '<h1>Un</h1><h2>Deux</h2><p style="color: #00aa00">Vert</p><p style="font-family: Arial">Arial</p><p>Nu</p><pre><code>code</code></pre>' + BR + '<p>Suite</p>';
      const out = SlidesEntry.outputHtml('presentation', html, { theme: OCEAN });
      const host = document.createElement('div');
      host.innerHTML = out;
      const q = selector => host.querySelector(selector);
      const para = text => Array.from(host.querySelectorAll('p')).find(p => p.textContent === text);
      const style = el => ({ color: el.style.color, family: el.style.fontFamily });
      if (JSON.stringify(style(q('h1'))) !== JSON.stringify({ color: rgb(OCEAN.colors.title), family: 'Georgia' })) bad.push('h1 : ' + JSON.stringify(style(q('h1'))));
      const h2 = style(q('h2'));
      if (h2.color || h2.family !== 'Georgia') bad.push('h2 (le style du niveau fournit la couleur) : ' + JSON.stringify(h2));
      if (style(para('Vert')).color !== 'rgb(0, 170, 0)' || style(para('Vert')).family !== 'Calibri') bad.push('un paragraphe vert : ' + JSON.stringify(style(para('Vert'))));
      if (style(para('Arial')).family !== 'Arial' || style(para('Arial')).color !== rgb(OCEAN.colors.text)) bad.push('un paragraphe en Arial : ' + JSON.stringify(style(para('Arial'))));
      if (style(para('Nu')).family !== 'Calibri' || style(para('Nu')).color !== rgb(OCEAN.colors.text)) bad.push('un paragraphe nu : ' + JSON.stringify(style(para('Nu'))));
      if (q('pre').hasAttribute('style') || (q('pre code') && q('pre code').hasAttribute('style'))) bad.push('le bloc de code a un style');
      if (!q('.page-break-marker').hasAttribute('data-slide-break')) bad.push('saut de diapositive non marqué');
      if (SlideTheme.forOutput('<p>x</p>', null) !== '<p>x</p>' || SlideTheme.forOutput('', OCEAN) !== '') bad.push('forOutput sans thème ou sans HTML');
      // La mise en forme du niveau de titre se pose ensuite, et c'est elle qui est dans le HTML résolu.
      const resolved = await ReaderMode.preview(out, null, {});
      const wrapper = document.createElement('div');
      wrapper.innerHTML = resolved;
      if (wrapper.querySelector('h2').style.color !== 'rgb(192, 57, 43)') bad.push('le style du niveau 2 n\'est pas celui du HTML résolu : ' + wrapper.querySelector('h2').getAttribute('style'));
      return result(bad);
    });

  add('th_the_reader_the_pdf_the_word_and_the_html_write_the_theme',
    'La Lecture, le PDF (Georgia → Gelasio, Calibri → Carlito, couleurs du thème), le Word (polices et couleurs) et le HTML donnent aux titres et au texte la police et la couleur du thème ; un mot colorié garde la sienne',
    async (h) => {
      await reset(h);
      const bad = [];
      const html = SlidesEntry.outputHtml('presentation', SAMPLE, { theme: OCEAN });
      const reader = await h.renderReaderMode(html);
      const h1 = paint(reader.querySelector('h1'));
      const p = paint(reader.querySelector('p'));
      document.getElementById('reader-container').style.display = 'none';
      if (h1.color !== rgb(OCEAN.colors.title) || !/Georgia/.test(h1.family) || p.color !== rgb(OCEAN.colors.text) || !/Calibri/.test(p.family)) bad.push('Lecture : ' + JSON.stringify([h1, p]));
      const pdf = await h.exportPdfContent(html);
      const heading = h.findTextBlocks(pdf.content, b => b._isHeading)[0];
      const hr = Array.isArray(heading.text) ? heading.text[0] : heading;
      const body = h.findTextBlocks(pdf.content, b => !b._isHeading && /Un texte/.test(h.blockPlainText(b)))[0];
      const runs = Array.isArray(body.text) ? body.text : [];
      const plain = runs.find(r => /Un texte/.test(r.text || ''));
      const blue = runs.find(r => r.text === 'bleu');
      if ((hr.font || heading.font) !== 'Gelasio' || (hr.color || heading.color) !== OCEAN.colors.title) bad.push('PDF titre : ' + JSON.stringify([hr.font, hr.color, heading.font, heading.color]));
      if (!plain || (plain.font || body.font) !== 'Carlito' || (plain.color || body.color) !== OCEAN.colors.text) bad.push('PDF texte : ' + JSON.stringify([plain, body.font, body.color]));
      if (!blue || blue.color !== '#2f6fed') bad.push('PDF : le mot colorié a changé ' + JSON.stringify(blue));
      const parts = await h.exportDocxParts(html);
      const paragraphs = h.docxParagraphs(parts.doc).filter(x => x.text);
      const d1 = paragraphs[0];
      const d2 = paragraphs[1];
      if (!d1.runs.every(r => r.font === 'Georgia' && r.color === '0B3C5D')) bad.push('Word titre : ' + JSON.stringify(d1.runs));
      const wordPlain = d2.runs.find(r => /Un texte/.test(r.text));
      const wordBlue = d2.runs.find(r => r.text === 'bleu');
      if (!wordPlain || wordPlain.font !== 'Calibri' || wordPlain.color !== '1E2A35' || !wordBlue || wordBlue.color !== '2F6FED') bad.push('Word texte : ' + JSON.stringify(d2.runs.map(r => [r.text, r.font, r.color])));
      const file = await h.exportHtml(html);
      if (!/<h1[^>]*font-family: Georgia/.test(file.text) || !/<p[^>]*font-family: Calibri/.test(file.text)) bad.push('HTML : ' + (file.text.match(/<h1[^>]*>/) || [''])[0]);
      return result(bad);
    });

  add('th_the_page_color_of_the_theme_is_painted_under_every_slide_in_the_outputs',
    'Le fond du thème devient, dans les sorties, le cadre de fond de chaque diapositive qui n\'a pas le sien (avant son texte, un seul par diapositive, la diapositive vide de la fin et celle dont le repère n\'a qu\'une transition comprises) ; une diapositive qui a son fond le garde ; un fond blanc n\'ajoute rien ; l\'export PowerPoint garde ses repères et n\'écrit aucun cadre',
    async (h) => {
      await reset(h);
      const bad = [];
      const html = '<h1>Un</h1><p>a</p>' + BR + SlideProps.html({ bg: YELLOW }) + '<h2>Deux</h2>' + BR + SlideProps.html({ transition: 'fade' }) + '<p>Trois</p>' + BR;
      // Les diapositives d'un HTML de sortie : les couleurs de leurs cadres de fond, la place du cadre et du premier texte, le nombre de blocs.
      const slidesOf = (out) => {
        const host = document.createElement('div');
        host.innerHTML = out;
        const slides = [[]];
        Array.from(host.children).forEach((el) => { if (el.classList.contains('page-break-marker')) slides.push([]); else slides[slides.length - 1].push(el); });
        return slides.map(blocks => ({ fills: blocks.filter(el => el.hasAttribute('data-ff-bg')).map(el => el.getAttribute('data-ff-fill')), frame: blocks.findIndex(el => el.hasAttribute('data-ff-bg')), text: blocks.findIndex(el => /^(H1|H2|P)$/.test(el.tagName)), count: blocks.length, last: blocks.length ? blocks[blocks.length - 1].tagName : '' }));
      };
      if (SlideTheme.paperOf(OCEAN) !== '' || SlideTheme.paperOf(null) !== '' || SlideTheme.paperOf('pas un thème') !== '' || SlideTheme.paperOf(DARK) !== '#1b2430') bad.push('paperOf : ' + JSON.stringify([SlideTheme.paperOf(OCEAN), SlideTheme.paperOf(null), SlideTheme.paperOf(DARK)]));
      const out = SlidesEntry.outputHtml('presentation', html, { theme: DARK });
      const slides = slidesOf(out);
      const wanted = [['#1b2430'], [YELLOW], ['#1b2430'], ['#1b2430']];
      if (slides.length !== 4) bad.push('diapositives : ' + slides.length);
      slides.forEach((slide, i) => {
        if (JSON.stringify(slide.fills) !== JSON.stringify(wanted[i])) bad.push('diapositive ' + (i + 1) + ', fonds ' + JSON.stringify(slide.fills) + ' au lieu de ' + JSON.stringify(wanted[i]));
        if (slide.text !== -1 && slide.frame > slide.text) bad.push('diapositive ' + (i + 1) + ' : le cadre de fond est après le texte');
      });
      if (slides[3] && (slides[3].count !== 2 || slides[3].last !== 'P')) bad.push('la diapositive vide de la fin : ' + JSON.stringify(slides[3]));
      if (/pp-slide-props|data-bg=/.test(out)) bad.push('un repère reste dans la sortie');
      // Le texte d'une diapositive sans repère garde la couleur du thème écrite en style, le fond ne la change pas.
      const host = document.createElement('div');
      host.innerHTML = out;
      const para = Array.from(host.querySelectorAll('p')).find(p => p.textContent === 'a');
      if (!para || para.style.color !== rgb(DARK.colors.text)) bad.push('le texte n\'a plus la couleur du thème : ' + (para && para.getAttribute('style')));
      // Un fond blanc n'ajoute rien : seul le fond jaune de la diapositive 2 est peint, comme sans thème.
      const white = slidesOf(SlidesEntry.outputHtml('presentation', html, { theme: OCEAN })).map(s => s.fills);
      const none = slidesOf(SlidesEntry.outputHtml('presentation', html, {})).map(s => s.fills);
      const plain = JSON.stringify([[], [YELLOW], [], []]);
      if (JSON.stringify(white) !== plain || JSON.stringify(none) !== plain) bad.push('un fond blanc ou aucun thème a ajouté un cadre : ' + JSON.stringify([white, none]));
      // Une couleur illisible ou absente n'ajoute rien non plus, un HTML vide reste vide.
      if (SlideProps.forOutput(html, { background: 'rouge' }) !== SlideProps.forOutput(html, {}) || SlideProps.forOutput('', { background: '#101010' }) !== '') bad.push('un fond illisible ou un HTML vide a changé la sortie');
      // L'export PowerPoint (keepProps) : les deux repères restent tels quels, aucun cadre de fond (le fond est celui du masque du fichier).
      const kept = document.createElement('div');
      kept.innerHTML = SlidesEntry.outputHtml('presentation', html, { theme: DARK, keepProps: true });
      if (kept.querySelectorAll('div.pp-slide-props').length !== 2 || kept.querySelector('[data-ff-bg]') || kept.querySelectorAll('div.pp-slide-props[data-bg]').length !== 1) bad.push('keepProps : repères ' + kept.querySelectorAll('div.pp-slide-props').length + ', cadres ' + kept.querySelectorAll('[data-ff-bg]').length);
      return result(bad);
    });

  add('th_the_editor_and_the_thumbnails_paint_the_page_color_of_the_theme',
    'La feuille de l\'éditeur (ou toute sa surface sans aperçu de page) et la page de chaque miniature ont le fond du thème ; une citation prend la couleur du texte du thème ; l\'écriture d\'en-tête, un thème au fond blanc et l\'absence de thème laissent le blanc d\'avant',
    async (h) => {
      await reset(h);
      await load('<h1>Titre</h1><blockquote><p>Citation</p></blockquote>');
      const bad = [];
      const container = document.getElementById('editor-container');
      const sheet = container.querySelector('.v2-page-sheet');
      const had = container.classList.contains('a4-preview');
      const background = el => getComputedStyle(el).backgroundColor;
      const WHITE = 'rgb(255, 255, 255)';
      const thumb = document.createElement('div');
      thumb.className = 'pp-slide-thumb';
      thumb.innerHTML = '<div class="pp-slide-page tiptap"><blockquote><p>x</p></blockquote></div>';
      document.body.appendChild(thumb);
      const page = thumb.firstElementChild;
      try {
        container.classList.add('a4-preview');
        // La page d'une miniature n'a son blanc que de la feuille de style de la bande (l'extension, qui n'est pas chargée ici) : « pas le fond du thème » est ce qu'on vérifie sans thème.
        const dark = el => background(el) === rgb(DARK.colors.bg);
        const before = { sheet: background(sheet), thumbDark: dark(page), quote: paint(first('blockquote')).color };
        if (before.sheet !== WHITE || before.thumbDark || before.quote !== 'rgb(68, 68, 68)') bad.push('sans thème : ' + JSON.stringify(before));
        await withTheme(DARK);
        const shown = { sheet: background(sheet), thumb: background(page), quote: paint(first('blockquote')).color, thumbQuote: getComputedStyle(page.querySelector('blockquote')).color };
        if (shown.sheet !== rgb(DARK.colors.bg) || shown.thumb !== rgb(DARK.colors.bg)) bad.push('fond sombre, feuille et miniature : ' + JSON.stringify(shown));
        if (shown.quote !== rgb(DARK.colors.text) || shown.thumbQuote !== rgb(DARK.colors.text)) bad.push('la citation ne prend pas la couleur du texte : ' + JSON.stringify(shown));
        container.classList.remove('a4-preview');
        const flat = background(container);
        if (flat !== rgb(DARK.colors.bg)) bad.push('sans aperçu de page, la surface n\'a pas le fond : ' + flat);
        container.classList.add('a4-preview', 'hf-editing');
        const inHeader = { sheet: background(sheet), quote: paint(first('blockquote')).color };
        container.classList.remove('hf-editing');
        if (inHeader.sheet !== WHITE || inHeader.quote !== 'rgb(68, 68, 68)') bad.push('l\'écriture d\'en-tête a le thème : ' + JSON.stringify(inHeader));
        await withTheme(OCEAN);
        container.classList.add('a4-preview');
        if (background(sheet) !== WHITE || background(page) !== WHITE || dark(page)) bad.push('un thème au fond blanc ne laisse pas le blanc : ' + background(sheet) + ' / ' + background(page));
        await withTheme(DARK);
        await withTheme(null);
        if (background(sheet) !== WHITE || dark(page) || dark(sheet) || document.documentElement.classList.contains('pp-themed')) bad.push('retiré, le thème laisse un fond : ' + background(sheet) + ' / ' + background(page));
      } finally {
        thumb.remove();
        container.classList.toggle('a4-preview', had);
        container.classList.remove('hf-editing');
      }
      return result(bad);
    });

  add('th_a_theme_change_recolors_what_had_a_theme_color_and_nothing_else',
    'Changer de thème : une couleur de texte, de titre, une puce, un fond de case et un fond de diapositive qui étaient ceux de l\'ancien thème (écrits en #rrggbb comme par le menu, ou en rgb() comme après un rechargement) prennent celle du nouveau (un mot de titre prend celle des titres, un mot de texte celle du texte) ; une couleur composée à la main, une couleur avec opacité et une police ne bougent pas',
    async (h) => {
      await reset(h);
      const O = SlideTheme.original().colors;
      await load(SlideProps.html({ bg: O.accent4 })
        + '<h1>Titre un</h1><p>Un texte <span style="color: ' + O.accent1 + '">accent</span> et <span style="color: ' + O.text + '">encre</span> et <span style="color: #123456">maison</span> et <span style="color: rgba(47, 111, 237, 0.5)">voile</span> et <span style="font-family: Arial">arial</span>.</p>'
        + '<ul><li data-bullet-color="' + O.accent2 + '"><p>Puce</p></li></ul>'
        + '<table><tbody><tr><td style="background-color: ' + O.accent3 + '"><p>Case</p></td><td style="background-color: #123456"><p>Autre</p></td></tr></tbody></table>');
      mark('Titre', { color: O.text });
      const attrOf = (typeName, text, name) => { let value; editor().state.doc.descendants((node) => { if (value === undefined && node.type.name === typeName && (text == null || node.textContent === text)) value = node.attrs[name]; return value === undefined; }); return value; };
      const hexOf = value => ColorMath.parseCss(value) || value;
      const bad = [];
      if (!/^rgb\(/.test(String(rawColorOf('maison')))) bad.push('le test ne couvre plus la forme rgb() d\'un document rechargé : ' + rawColorOf('maison'));
      const tr = editor().state.tr;
      const changes = SlideTheme.remap(tr, null, OCEAN);
      editor().view.dispatch(TrackChanges.skipTracking(tr));
      await sleep(80);
      if (changes < 6) bad.push('trop peu de réglages changés : ' + changes);
      if (textStyleOf('accent').color !== OCEAN.colors.accent1) bad.push('accent : ' + JSON.stringify(textStyleOf('accent')));
      if (textStyleOf('encre').color !== OCEAN.colors.text) bad.push('texte : ' + JSON.stringify(textStyleOf('encre')));
      if (textStyleOf('Titre').color !== OCEAN.colors.title) bad.push('mot de titre (la couleur des titres, pas celle du texte) : ' + JSON.stringify(textStyleOf('Titre')));
      if (textStyleOf('maison').color !== '#123456') bad.push('une couleur composée a bougé : ' + JSON.stringify(textStyleOf('maison')));
      if (rawColorOf('voile') !== 'rgba(47, 111, 237, 0.5)') bad.push('une couleur avec opacité a bougé : ' + rawColorOf('voile'));
      if (textStyleOf('arial').fontFamily !== 'Arial') bad.push('une police a bougé : ' + JSON.stringify(textStyleOf('arial')));
      if (hexOf(attrOf('listItem', 'Puce', 'bulletColor')) !== OCEAN.colors.accent2) bad.push('puce : ' + attrOf('listItem', 'Puce', 'bulletColor'));
      if (hexOf(attrOf('tableCell', 'Case', 'backgroundColor')) !== OCEAN.colors.accent3) bad.push('fond de case : ' + attrOf('tableCell', 'Case', 'backgroundColor'));
      if (hexOf(attrOf('tableCell', 'Autre', 'backgroundColor')) !== '#123456') bad.push('un fond de case composé a bougé : ' + attrOf('tableCell', 'Autre', 'backgroundColor'));
      if (hexOf(attrOf('slideProps', null, 'bg')) !== OCEAN.colors.accent4) bad.push('fond de diapositive : ' + attrOf('slideProps', null, 'bg'));
      // Le retour à l'aspect d'origine remet les couleurs d'origine (le chemin inverse).
      const back = editor().state.tr;
      SlideTheme.remap(back, OCEAN, null);
      editor().view.dispatch(TrackChanges.skipTracking(back));
      await sleep(60);
      if (textStyleOf('accent').color !== O.accent1 || textStyleOf('encre').color !== O.text || textStyleOf('maison').color !== '#123456') bad.push('retour : ' + JSON.stringify([textStyleOf('accent'), textStyleOf('encre'), textStyleOf('maison')]));
      if (hexOf(attrOf('slideProps', null, 'bg')) !== O.accent4 || hexOf(attrOf('tableCell', 'Case', 'backgroundColor')) !== O.accent3) bad.push('retour (fonds) : ' + [attrOf('slideProps', null, 'bg'), attrOf('tableCell', 'Case', 'backgroundColor')]);
      if (SlideTheme.remap(editor().state.tr, OCEAN, OCEAN) !== 0) bad.push('un même thème change quelque chose');
      return result(bad);
    });

  add('th_one_undo_gives_back_the_theme_and_the_colors_together',
    'Le geste « changer de thème » (page + recoloration) est UN pas d\'historique : Ctrl+Z rend l\'ancien thème et les anciennes couleurs, Ctrl+Y le nouveau et les nouvelles',
    async (h) => {
      await reset(h);
      const O = SlideTheme.original().colors;
      await load('<h1>Titre un</h1><p>Un texte <span style="color: ' + O.accent1 + '">accent</span>.</p>');
      const bad = [];
      const gesture = HistoryMarkers.begin('page');
      PageLayout.setTheme(OCEAN);
      const tr = editor().state.tr;
      SlideTheme.remap(tr, null, OCEAN);
      editor().view.dispatch(TrackChanges.skipTracking(tr));
      gesture.commit();
      await sleep(100);
      if (!PageLayout.getTheme() || textStyleOf('accent').color !== OCEAN.colors.accent1) bad.push('le geste n\'a pas posé le thème et les couleurs');
      editor().chain().focus().undo().run();
      await sleep(150);
      if (PageLayout.getTheme() !== null || textStyleOf('accent').color !== O.accent1) bad.push('un Ctrl+Z ne rend pas les deux : ' + JSON.stringify([PageLayout.getTheme() && PageLayout.getTheme().name, textStyleOf('accent').color]));
      if (document.documentElement.classList.contains('pp-themed')) bad.push('la classe reste après Ctrl+Z');
      editor().chain().focus().redo().run();
      await sleep(150);
      if (!SlideTheme.equals(PageLayout.getTheme(), OCEAN) || textStyleOf('accent').color !== OCEAN.colors.accent1) bad.push('Ctrl+Y ne rend pas les deux : ' + JSON.stringify([PageLayout.getTheme() && PageLayout.getTheme().name, textStyleOf('accent').color]));
      return result(bad);
    });

  add('th_the_color_menus_show_a_theme_row_with_named_swatches_and_no_cross',
    'Avec un thème : la rangée « Couleurs du thème » est la première des menus de couleur, neuf pastilles nommées dans l\'ordre (fond, texte, titres, six accents), sans croix pour les retirer ; la fenêtre de couleur n\'a que les deux rangées gardées ; sans thème, rien de plus',
    async (h) => {
      await reset(h);
      const bad = [];
      await withTheme(OCEAN);
      const rows = ColorStore.rows();
      if (rows.length !== 3 || rows[0].id !== 'theme' || !rows[0].readonly || rows[0].colors.length !== 9) bad.push('rangées : ' + JSON.stringify(rows.map(r => [r.id, r.colors.length])));
      if (JSON.stringify(rows[0].colors) !== JSON.stringify(SlideTheme.COLOR_SLOTS.map(slot => OCEAN.colors[slot]))) bad.push('couleurs : ' + rows[0].colors);
      if (rows[0].names[3] !== I18n.t('slides.theme.slot.accent1') || rows[0].names[0] !== I18n.t('slides.theme.slot.bg')) bad.push('noms : ' + rows[0].names);
      if (ColorStore.scopes().length !== 2 || ColorStore.scopes().some(s => s.id === 'theme')) bad.push('la fenêtre de couleur verrait la rangée du thème');
      const menu = ColorPalette.createMenu({ onPick: () => {}, onNone: () => {}, current: () => null });
      const row = menu.el.querySelector('.cp-row[data-scope="theme"]');
      try {
        if (!row || row.querySelectorAll('.cp-swatch').length !== 9) bad.push('rangée du menu : ' + (row && row.querySelectorAll('.cp-swatch').length));
        if (row && (row.querySelector('.cp-forget') || row.querySelector('.cp-saved'))) bad.push('la rangée du thème a une croix');
        if (row && !/Accent 1/.test(row.querySelectorAll('.cp-swatch')[3].title)) bad.push('infobulle : ' + row.querySelectorAll('.cp-swatch')[3].title);
        if (menu.el.querySelector('.cp-rows .cp-row') !== row) bad.push('la rangée du thème n\'est pas la première');
      } finally { menu.el.remove(); }
      await withTheme(null);
      const plain = ColorPalette.createMenu({ onPick: () => {}, onNone: () => {}, current: () => null });
      const count = plain.el.querySelectorAll('.cp-row').length;
      plain.el.remove();
      if (count !== 2) bad.push('sans thème : ' + count + ' rangées');
      return result(bad);
    });

  add('th_the_color_dialog_opened_for_a_theme_color_has_no_keep_rows',
    'La fenêtre « Couleur personnalisée » ouverte pour une couleur de thème (keep: false) n\'a pas les cases « garder » et rend une liste de rangées vide ; ouverte pour un menu de couleur, elle les montre (une case par rangée gardée) et rend celles qui sont cochées',
    async (h) => {
      await reset(h);
      const bad = [];
      const results = [];
      const state = () => { const keep = document.querySelector('#pp-color-modal .pp-color-keep'); return keep ? { hidden: keep.hidden, boxes: keep.querySelectorAll('input').length, shown: getComputedStyle(keep).display !== 'none' } : null; };
      const press = () => document.querySelector('#pp-color-modal .pp-modal-actions .var-modal-primary').click();
      ColorDialog.open({ initial: '#1d70b8', keep: false, onApply: result => results.push(result) });
      await sleep(80);
      const themed = state();
      if (!themed || !themed.hidden || themed.shown) bad.push('les cases sont là : ' + JSON.stringify(themed));
      press();
      await sleep(60);
      if (results.length !== 1 || results[0].color !== '#1d70b8' || results[0].scopes.length !== 0) bad.push('rendu : ' + JSON.stringify(results));
      ColorDialog.open({ initial: '#1d70b8', onApply: result => results.push(result) });
      await sleep(80);
      const menu = state();
      if (!menu || menu.hidden || !menu.shown || menu.boxes !== ColorStore.scopes().length) bad.push('menu de couleur : ' + JSON.stringify(menu));
      press();
      await sleep(60);
      if (results.length !== 2 || !results[1].scopes.length) bad.push('rendu du menu : ' + JSON.stringify(results[1]));
      return result(bad);
    });

  add('th_a_new_shape_and_a_new_line_take_the_look_of_the_first_accent',
    'Avec un thème, la forme et la ligne neuves ont le fond clair et le trait foncé du premier accent ; sans thème, l\'aspect d\'avant (#d9e2f3, #2f5597)',
    async (h) => {
      await reset(h);
      const bad = [];
      const shapeHtml = () => { const m = Editor.getHTML().match(/data-ff-fill="(#[0-9a-f]{6})"[^>]*data-ff-line="(#[0-9a-f]{6})"|data-ff-line="(#[0-9a-f]{6})"[^>]*data-ff-fill="(#[0-9a-f]{6})"/i); return m ? { fill: m[1] || m[4], line: m[2] || m[3] } : null; };
      const insert = async () => {
        Editor.setHTML('<p>x</p>');
        await sleep(150);
        SlidesEntry.setContext(() => ({ type: 'presentation', editing: true }));
        try { return FreeFrame.insert(editor(), 0, { shape: 'rect' }); } finally { SlidesEntry.setContext(() => ({ type: 'document', editing: false })); }
      };
      if (!(await insert())) bad.push('la forme n\'a pas été insérée');
      const plain = shapeHtml();
      if (!plain || plain.fill !== '#d9e2f3' || plain.line !== '#2f5597') bad.push('sans thème : ' + JSON.stringify(plain));
      await withTheme(OCEAN);
      await insert();
      const themed = shapeHtml();
      const look = SlideTheme.shapeLook();
      if (!themed || themed.fill !== look.fill || themed.line !== look.line || themed.fill === '#d9e2f3') bad.push('avec thème : ' + JSON.stringify([themed, look]));
      if (look.fill !== SlideTheme.lighten(OCEAN.colors.accent1, 0.8) || look.line !== SlideTheme.darken(OCEAN.colors.accent1, 0.25)) bad.push('nuances : ' + JSON.stringify(look));
      return result(bad);
    });

  add('th_the_powerpoint_file_carries_the_theme',
    'Le fichier PowerPoint écrit le thème : dk1 le texte, dk2 les titres, lt1 le fond, les six accents, la police des titres et celle du texte ; le texte de la couleur du thème n\'est pas récrit sur chaque série, le titre l\'est ; sans thème le thème d\'avant (dk2 44546A, Arial)',
    async (h) => {
      await reset(h);
      await ExportEngines.ensure('pptx');
      const bad = [];
      const build = async (theme) => {
        const html = SlidesEntry.outputHtml('presentation', '<h1>Alpha</h1><p>Beta</p>', { keepProps: true, theme });
        const marginsPt = Object.assign({}, PageLayout.getMarginsPt(), theme ? { theme } : {});
        const blob = await PptxExport.fromHtml(await ReaderMode.preview(html, null, {}), { marginsPt, title: 'Essai' });
        const zip = await JSZip.loadAsync(await blob.arrayBuffer());
        return { theme: await zip.file('ppt/theme/theme1.xml').async('string'), slide: new DOMParser().parseFromString(await zip.file('ppt/slides/slide1.xml').async('string'), 'application/xml') };
      };
      const themed = await build(SlideTheme.normalize(OCEAN));
      const x = themed.theme;
      const color = tag => (x.match(new RegExp('<a:' + tag + '><a:srgbClr val="([0-9A-F]{6})"')) || [])[1];
      if (color('dk1') !== '1E2A35' || color('dk2') !== '0B3C5D' || color('lt1') !== 'FFFFFF') bad.push('dk1 dk2 lt1 : ' + [color('dk1'), color('dk2'), color('lt1')]);
      if (['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'].map(color).join() !== SlideTheme.ACCENT_SLOTS.map(slot => OCEAN.colors[slot].slice(1).toUpperCase()).join()) bad.push('accents : ' + ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'].map(color));
      if (!/<a:majorFont><a:latin typeface="Georgia"/.test(x) || !/<a:minorFont><a:latin typeface="Calibri"/.test(x)) bad.push('polices du thème : ' + (x.match(/<a:fontScheme[\s\S]*?<\/a:fontScheme>/) || [''])[0].slice(0, 200));
      const run = text => Array.from(themed.slide.getElementsByTagName('a:r')).find(r => r.getElementsByTagName('a:t')[0].textContent === text);
      const alpha = run('Alpha');
      const beta = run('Beta');
      if (!alpha || !beta) return { pass: false, notes: 'séries introuvables' };
      const solid = r => { const el = r.getElementsByTagName('a:rPr')[0].getElementsByTagName('a:srgbClr')[0]; return el ? el.getAttribute('val') : null; };
      const face = r => { const el = r.getElementsByTagName('a:rPr')[0].getElementsByTagName('a:latin')[0]; return el ? el.getAttribute('typeface') : null; };
      if (solid(alpha) !== '0B3C5D' || face(alpha) !== 'Georgia') bad.push('titre : ' + [solid(alpha), face(alpha)]);
      if (solid(beta) !== null) bad.push('le texte de la couleur du thème a été récrit sur la série : ' + solid(beta));
      if (face(beta) !== 'Calibri') bad.push('police du texte : ' + face(beta));
      const plain = await build(null);
      if (!/<a:dk2><a:srgbClr val="44546A"\/>/.test(plain.theme) || !/<a:majorFont><a:latin typeface="Arial"/.test(plain.theme) || !/<a:dk1><a:srgbClr val="1B2430"\/>/.test(plain.theme)) bad.push('sans thème, le thème du fichier a changé');
      return result(bad);
    });

  add('th_the_ready_made_themes_read_well_and_use_the_six_fonts',
    'Les thèmes prêts de l\'extension : texte et titres à 4,5:1 au moins sur le fond, polices parmi les six, noms en français et en anglais, deux thèmes jamais identiques ; find retrouve un thème prêt, nameOf nomme un thème prêt, un thème retouché et l\'absence de thème',
    async (h) => {
      await reset(h);
      const bad = [];
      const wasLoaded = typeof SlideThemes !== 'undefined';
      if (!wasLoaded) {
        await new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = 'extensions/diapositives/slide-themes.js?v=test'; s.onload = resolve; s.onerror = () => reject(new Error('slide-themes.js introuvable')); document.head.appendChild(s); });
      }
      const list = (new Function('return SlideThemes'))().LIST;
      const seen = new Set();
      list.forEach((preset) => {
        const t = SlideTheme.normalize(preset.theme);
        if (ColorMath.contrast(t.colors.text, t.colors.bg) < 4.5 || ColorMath.contrast(t.colors.title, t.colors.bg) < 4.5) bad.push(preset.id + ' : contraste ' + ColorMath.contrast(t.colors.text, t.colors.bg).toFixed(1) + ' / ' + ColorMath.contrast(t.colors.title, t.colors.bg).toFixed(1));
        if (JSON.stringify(t.colors) !== JSON.stringify(Object.assign({ bg: '#ffffff' }, preset.theme.colors, {}) && t.colors) || !SlideTheme.fontOf(t.fonts.title) || !SlideTheme.fontOf(t.fonts.body)) bad.push(preset.id + ' : réglage hors des bornes');
        ['fr', 'en'].forEach((lang) => { if (!I18n.has('slides.theme.preset.' + preset.id)) bad.push(preset.id + ' : nom absent'); void lang; });
        const key = JSON.stringify([t.colors, t.fonts]);
        if (seen.has(key)) bad.push(preset.id + ' : identique à un autre');
        seen.add(key);
        SlideTheme.COLOR_SLOTS.forEach((slot) => { if (preset.theme.colors[slot] && preset.theme.colors[slot] !== t.colors[slot]) bad.push(preset.id + ' : ' + slot + ' corrigé par normalize'); });
      });
      if (list.length < 5) bad.push('moins de cinq thèmes prêts');
      const api = (new Function('return SlideThemes'))();
      const ocean = SlideTheme.normalize(Object.assign({ name: 'peu importe' }, api.byId('ocean').theme));
      if (!api.find(ocean) || api.find(ocean).id !== 'ocean') bad.push('find ne retrouve pas Océan');
      if (api.nameOf(ocean) !== I18n.t('slides.theme.preset.ocean') || api.nameOf(null) !== I18n.t('slides.theme.none')) bad.push('nameOf');
      const tweaked = SlideTheme.normalize({ name: 'Mon thème', colors: Object.assign({}, ocean.colors, { accent1: '#ff0000' }), fonts: ocean.fonts });
      if (api.find(tweaked) || api.nameOf(tweaked) !== 'Mon thème' || SlideTheme.displayName(Object.assign({}, tweaked, { name: '' })) !== I18n.t('slides.theme.custom')) bad.push('thème retouché : ' + api.nameOf(tweaked));
      return result(bad);
    });

  add('th_the_texts_exist_in_french_and_english',
    'Chaque texte du thème existe en français et en anglais (clés slides.theme.*, slides.decor.*, pptx.name.decor*, color.scope.theme*, toolbar.page.theme), les thèmes du document et le décor compris',
    async () => {
      const bad = [];
      const keys = ['toolbar.page.theme', 'slides.theme.function', 'slides.theme.title', 'slides.theme.intro', 'slides.theme.themes', 'slides.theme.original', 'slides.theme.none', 'slides.theme.custom', 'slides.theme.colors', 'slides.theme.font.title', 'slides.theme.font.body',
        'slides.theme.sampleTitle', 'slides.theme.sampleText', 'slides.theme.contrastWarning', 'slides.theme.apply', 'slides.theme.applied', 'slides.theme.removed', 'slides.theme.unchanged', 'color.scope.theme', 'color.scope.theme.hint',
        'slides.theme.save', 'slides.theme.save.hint', 'slides.theme.save.needsTheme', 'slides.theme.save.title', 'slides.theme.save.label', 'slides.theme.save.default', 'slides.theme.save.empty', 'slides.theme.forget', 'slides.theme.forget.hint', 'slides.theme.forget.needsMine',
        'slides.theme.saved.hint', 'slides.theme.saved.added', 'slides.theme.saved.replaced', 'slides.theme.saved.removed', 'slides.theme.saved.full', 'slides.theme.saved.failed', 'slides.theme.saved.locked', 'slides.theme.saved.now', 'slides.theme.saved.none', 'slides.theme.quoted']
        .concat(['pptx.name.decorBand', 'pptx.name.decorLogo', 'pptx.name.decorText', 'slides.theme.saved.heavy', 'slides.decor.open', 'slides.decor.open.hint', 'slides.decor.summary', 'slides.decor.summary.none', 'slides.decor.summary.band', 'slides.decor.summary.logo', 'slides.decor.summary.number', 'slides.decor.summary.footer', 'slides.decor.title', 'slides.decor.intro', 'slides.decor.band', 'slides.decor.logo', 'slides.decor.number', 'slides.decor.footer', 'slides.decor.none', 'slides.decor.edge.left', 'slides.decor.edge.top', 'slides.decor.edge.bottom', 'slides.decor.band.edge', 'slides.decor.band.thickness', 'slides.decor.band.color', 'slides.decor.thickness.thin', 'slides.decor.thickness.medium', 'slides.decor.thickness.thick', 'slides.decor.logo.choose', 'slides.decor.logo.change', 'slides.decor.logo.remove', 'slides.decor.logo.pos', 'slides.decor.logo.size', 'slides.decor.logo.small', 'slides.decor.logo.medium', 'slides.decor.logo.large', 'slides.decor.logo.fileTooBig', 'slides.decor.logo.unreadable', 'slides.decor.logo.tooBig', 'slides.decor.corner.tl', 'slides.decor.corner.tr', 'slides.decor.corner.bl', 'slides.decor.corner.br', 'slides.decor.spot.bl', 'slides.decor.spot.bc', 'slides.decor.spot.br', 'slides.decor.footer.pos', 'slides.decor.footer.placeholder', 'slides.decor.skipFirst', 'slides.decor.skipFirst.needs', 'slides.decor.clear'])
        .concat(['ocean', 'helianthe', 'forest', 'burgundy', 'sun', 'slate', 'editorial'].map(id => 'slides.theme.preset.' + id))
        .concat(SlideTheme.COLOR_SLOTS.map(slot => 'slides.theme.slot.' + slot));
      const was = I18n.getLang();
      try {
        ['fr', 'en'].forEach((lang) => {
          I18n.setLang(lang);
          keys.forEach((key) => { if (!I18n.has(key) || !I18n.t(key, { which: 'x', name: 'x' }) || I18n.t(key) === key) bad.push(lang + ' : ' + key); });
        });
        I18n.setLang('fr');
        const fr = I18n.t('slides.theme.preset.ocean');
        I18n.setLang('en');
        if (I18n.t('slides.theme.preset.burgundy') !== 'Burgundy' || fr !== 'Océan') bad.push('traduction des noms');
      } finally { I18n.setLang(was); }
      return result(bad);
    });

  // === Les thèmes du document (carte « où garder le thème » : « Enregistrer comme thème ») ===
  // Comme les couleurs du document et les mises en forme du pinceau : la ligne réservée aux réglages du document (TypeModele « reglages »), clé `themes`, sans table de plus ; extensions/diapositives/slide-themes.js.
  const TABLE = 'Publipostage_Modeles';
  const stub = () => window.__gristStub;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const settingsRows = () => { const t = stub().state.rows[TABLE]; return t && t.TypeModele ? t.id.filter((id, i) => t.TypeModele[i] === 'reglages').map(id => stub().getRow(TABLE, id)) : []; };
  const settingsJson = () => { const rows = settingsRows(); try { return rows.length ? JSON.parse(rows[0].Contenu) : null; } catch (e) { return 'illisible'; } };
  async function resetDocumentThemes() {
    if (!settingsRows().length && !Templates.getDocumentSettings().themes) return;
    for (const row of settingsRows()) await stub().applyUserActions([['RemoveRecord', TABLE, row.id]]);
    await Templates.loadAll();
  }
  async function written(check) {
    for (let i = 0; i < 40; i += 1) { if (check(settingsJson())) return true; await sleep(50); }
    return false;
  }
  const savedNames = () => SlideThemes.saved().map(theme => theme.name);
  const undo = async () => { editor().chain().focus().undo().run(); await sleep(80); await ActionHistory.whenIdle(); };
  const redo = async () => { editor().chain().focus().redo().run(); await sleep(80); await ActionHistory.whenIdle(); };
  const statusText = () => document.getElementById('status-msg').textContent;
  // Le harnais n'ouvre pas l'extension : le module des thèmes se charge comme dans le cas précédent, et reçoit le coin d'état comme le fait la fenêtre (slide-theme-ui.js).
  async function ensureSlideThemes() {
    if (typeof SlideThemes === 'undefined') {
      await new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = 'extensions/diapositives/slide-themes.js?v=test'; s.onload = resolve; s.onerror = () => reject(new Error('slide-themes.js introuvable')); document.head.appendChild(s); });
    }
    SlideThemes.wire({ status: (message, isError) => SlidesEntry.status(message, isError) });
  }
  async function themesSetup(h) {
    await reset(h);
    await ensureSlideThemes();
    await resetDocumentThemes();
    ActionHistory.reset();
    await load(SAMPLE);
  }
  async function themesCleanup(h) {
    await resetDocumentThemes();
    ActionHistory.reset();
    await reset(h);
  }

  add('slide_theme_saved_list_keeps_bounded_named_themes_in_the_reserved_settings_row',
    'SlideThemes.save range un thème sous un nom (nettoyé, 40 caractères, un nom par thème à la casse et aux espaces près : le même nom remplace le thème, à sa place), refuse un nom vide, un thème qui n\'en est pas un et une 13e entrée, remet SAVED_MAX à 12 ; la ligne réservée aux réglages du document reçoit la clé `themes` (une seule ligne, aucune table de plus, aucune clé pp_*) et la perd avec le dernier thème retiré ; un JSON abîmé ou écrit à la main (pas une liste, entrées sans nom, doublons, couleur dangereuse, nom démesuré) est relu avec les seuls thèmes valables',
    async (h) => {
      try {
        await themesSetup(h);
        const bad = [];
        const check = (label, ok, detail) => { if (!ok) bad.push(label + (detail === undefined ? '' : ' : ' + JSON.stringify(detail))); };
        check('départ vide', same(SlideThemes.saved(), []) && SlideThemes.SAVED_MAX === 12);
        check('un thème s\'ajoute', SlideThemes.save(OCEAN, '  Mon   thème ') === 'added' && same(savedNames(), ['Mon thème']), savedNames());
        const kept = Templates.getDocumentSettings().themes;
        check('les lecteurs le voient tout de suite, couleurs et polices du thème', kept && kept.length === 1 && kept[0].colors.accent1 === OCEAN.colors.accent1 && kept[0].fonts.title === OCEAN.fonts.title, kept);
        check('Grist reçoit la clé dans la ligne réservée, une seule ligne', await written(json => json && Array.isArray(json.themes) && json.themes.length === 1 && json.themes[0].name === 'Mon thème') && settingsRows().length === 1, settingsJson());
        check('le même nom, à la casse et aux espaces près, remplace le thème à sa place', SlideThemes.save(DARK, 'mon thème') === 'replaced' && savedNames().length === 1 && SlideThemes.saved()[0].colors.bg === DARK.colors.bg && SlideThemes.saved()[0].name === 'mon thème', SlideThemes.saved());
        SlideThemes.save(OCEAN, 'Deuxième');
        SlideThemes.save(DARK, 'mon thème');
        check('un thème remplacé garde sa place dans la liste', same(savedNames(), ['mon thème', 'Deuxième']), savedNames());
        check('un nom vide, un thème qui n\'en est pas un : refusés', SlideThemes.save(OCEAN, '   ') === 'invalid' && SlideThemes.save(null, 'Rien') === 'invalid' && SlideThemes.save('texte', 'Rien') === 'invalid' && savedNames().length === 2, savedNames());
        check('un nom de plus de 40 caractères est borné', SlideThemes.save(OCEAN, 'x'.repeat(60)) === 'added' && SlideThemes.saved()[2].name === 'x'.repeat(40), savedNames());
        for (let n = 4; n <= 12; n += 1) SlideThemes.save(OCEAN, 'T' + n);
        check('douze thèmes au plus', savedNames().length === 12 && SlideThemes.save(OCEAN, 'Treize') === 'full' && savedNames().length === 12, savedNames());
        check('une liste pleine remplace encore un thème de son nom', SlideThemes.save(DARK, 'T5') === 'replaced' && savedNames().length === 12);
        check('freeName propose un nom libre', SlideThemes.freeName('T5') === 'T5 2' && SlideThemes.freeName('Libre') === 'Libre', [SlideThemes.freeName('T5'), SlideThemes.freeName('Libre')]);
        check('retirer un thème absent ne change rien', SlideThemes.remove('Absent') === false && savedNames().length === 12);
        check('retirer un thème (casse et espaces près)', SlideThemes.remove(' t5 ') === true && !savedNames().includes('T5') && savedNames().length === 11, savedNames());
        // Tout retirer : la clé part.
        savedNames().forEach(name => SlideThemes.remove(name));
        check('liste vide', same(SlideThemes.saved(), []));
        check('la clé `themes` quitte la ligne réservée avec le dernier thème', await written(json => json && !('themes' in json)), settingsJson());
        // Un JSON écrit par une autre version ou à la main.
        await Templates.updateDocumentSettings({ themes: 'pas une liste' });
        check('une valeur qui n\'est pas une liste est ignorée', same(SlideThemes.saved(), []));
        const hostile = [
          { name: 'Correct', colors: { bg: '#112233', text: '#ffffff' }, fonts: { title: 'Georgia' } },
          'texte', null, 12, { colors: { bg: '#ffffff' } }, { name: '   ' },
          { name: 'correct', colors: { bg: '#000000' } },
          { name: 'Dangereux', colors: { bg: 'javascript:alert(1)', text: 'url(http://x)', accent1: '#12345' }, fonts: { title: 'Comic Sans' } },
          { name: 'Sans couleurs' }, { name: 'Couleurs vides', colors: 'rouge' },
          { name: 'y'.repeat(90), colors: { bg: '#ffffff' } },
        ];
        await Templates.updateDocumentSettings({ themes: hostile });
        const got = SlideThemes.saved();
        check('seuls les thèmes valables restent : Correct, Dangereux (valeurs d\'origine pour ce qui est refusé) et le nom borné ; un nom sans couleurs n\'est pas un thème', same(got.map(t => t.name), ['Correct', 'Dangereux', 'y'.repeat(40)]), got.map(t => t.name));
        const danger = got.find(t => t.name === 'Dangereux');
        check('une couleur dangereuse ou mal écrite retombe sur la valeur d\'origine, une police inconnue aussi', !!danger && danger.colors.bg === SlideTheme.DEFAULT_COLORS.bg && danger.colors.text === SlideTheme.DEFAULT_COLORS.text && danger.colors.accent1 === SlideTheme.DEFAULT_COLORS.accent1 && danger.fonts.title === SlideTheme.DEFAULT_FONTS.title, danger);
        const fourteen = Array.from({ length: 14 }, (_, n) => ({ name: 'N' + n, colors: { bg: '#ffffff' } }));
        await Templates.updateDocumentSettings({ themes: fourteen });
        check('quatorze thèmes écrits à la main : douze lus', SlideThemes.saved().length === 12, SlideThemes.saved().length);
        return result(bad);
      } finally { await themesCleanup(h); }
    });

  add('slide_theme_saved_list_gestures_are_one_ctrl_z_and_one_ctrl_y_each_and_never_overwrite_another_persons_change',
    'Ranger, remplacer et retirer un thème du document : chaque geste est UN pas de Ctrl+Z et de Ctrl+Y, depuis n\'importe quel modèle ; Grist reçoit chaque retour ; si une autre personne a changé la liste entre-temps, Ctrl+Z n\'écrit rien et le dit',
    async (h) => {
      try {
        await themesSetup(h);
        const bad = [];
        const check = (label, ok, detail) => { if (!ok) bad.push(label + (detail === undefined ? '' : ' : ' + JSON.stringify(detail))); };
        SlideThemes.save(OCEAN, 'Un');
        await sleep(100);
        SlideThemes.save(DARK, 'Un');
        await sleep(100);
        SlideThemes.save(OCEAN, 'Deux');
        await sleep(100);
        SlideThemes.remove('Un');
        await sleep(600);
        check('après les quatre gestes', same(savedNames(), ['Deux']), savedNames());
        await undo();
        check('Ctrl+Z du retrait', same(savedNames(), ['Un', 'Deux']) && SlideThemes.saved()[0].colors.bg === DARK.colors.bg, SlideThemes.saved().map(t => [t.name, t.colors.bg]));
        await undo();
        check('Ctrl+Z du second rangement', same(savedNames(), ['Un']), savedNames());
        await undo();
        check('Ctrl+Z du remplacement : l\'ancien thème revient', same(savedNames(), ['Un']) && SlideThemes.saved()[0].colors.bg === OCEAN.colors.bg, SlideThemes.saved().map(t => [t.name, t.colors.bg]));
        await undo();
        check('Ctrl+Z du premier rangement : la liste est vide', same(savedNames(), []), savedNames());
        check('Grist a reçu le retour (la clé est partie)', await written(json => json && !('themes' in json)), settingsJson());
        await redo();
        check('Ctrl+Y du premier rangement', same(savedNames(), ['Un']), savedNames());
        check('Grist a reçu le rétablissement', await written(json => json && json.themes && json.themes[0] && json.themes[0].name === 'Un'), settingsJson());
        // Une autre personne a changé la liste : défaire ne l'écrase pas.
        await Templates.updateDocumentSettings({ themes: [{ name: 'Collègue', colors: { bg: '#ffffff' } }] });
        await undo();
        check('Ctrl+Z n\'a pas écrasé le thème d\'une autre personne', same(savedNames(), ['Collègue']), savedNames());
        check('le coin d\'état dit le conflit', /a changé depuis|has changed since/.test(statusText()), statusText());
        return result(bad);
      } finally { await themesCleanup(h); }
    });

  add('slide_theme_saved_list_a_refused_write_is_said_and_a_read_only_account_writes_nothing',
    'Un refus d\'écriture de Grist se dit dans le coin d\'état et le thème refusé ne reste pas dans la liste ; un compte en lecture seule ne range ni ne retire rien (save rend « locked », remove rend faux, la ligne de réglages de Grist garde ce qu\'elle avait)',
    async (h) => {
      try {
        await themesSetup(h);
        const bad = [];
        const check = (label, ok, detail) => { if (!ok) bad.push(label + (detail === undefined ? '' : ' : ' + JSON.stringify(detail))); };
        SlideThemes.save(OCEAN, 'Gardé');
        check('départ', await written(json => json && json.themes && json.themes.length === 1));
        const original = grist.docApi.applyUserActions;
        grist.docApi.applyUserActions = async () => { throw new Error('refusé'); };
        const warn = console.warn;
        console.warn = () => {};
        try {
          SlideThemes.save(DARK, 'Refusé');
          await sleep(400);
        } finally { grist.docApi.applyUserActions = original; console.warn = warn; }
        check('le refus est dit', /n’a pas pu être écrite|could not be written/.test(statusText()), statusText());
        check('le thème refusé ne reste pas', same(savedNames(), ['Gardé']), savedNames());
        const realGet = AccessRights.get;
        AccessRights.get = () => Object.assign({}, realGet(), { readOnly: true });
        try {
          check('lecture seule : ranger est refusé', SlideThemes.save(DARK, 'Interdit') === 'locked' && same(savedNames(), ['Gardé']), savedNames());
          check('lecture seule : retirer est refusé', SlideThemes.remove('Gardé') === false && same(savedNames(), ['Gardé']), savedNames());
        } finally { AccessRights.get = realGet; }
        await sleep(300);
        check('Grist garde la même ligne de réglages et le seul thème écrit avant', settingsRows().length === 1 && same((settingsJson().themes || []).map(t => t.name), ['Gardé']), settingsJson());
        return result(bad);
      } finally { await themesCleanup(h); }
    });

  // --- Le décor du thème (carte « Quel décor le thème pose-t-il sur toutes les diapositives ? », option « Décor réglé dans le thème », 02/11) : un bandeau, un logo, le numéro et un texte de pied, posés derrière toutes les diapositives ---
  // La fenêtre « Décor… », l'éditeur, les miniatures, la Lecture, le diaporama, le PDF et le Word à la vraie souris sont dans dev-tests/verify-slide-theme.mjs ; ici la donnée, la géométrie, le HTML des sorties, le fichier PowerPoint et la liste du document.
  const logoPng = (w, h, color) => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext('2d');
    g.fillStyle = color || '#d9742a';
    g.fillRect(0, 0, w, h);
    return canvas.toDataURL('image/png');
  };
  const decorFull = () => ({ band: { edge: 'bottom', size: 'medium', color: 'accent2' }, logo: { src: logoPng(200, 80), w: 200, h: 80, pos: 'tr', size: 'medium' }, number: { pos: 'br' }, footer: { text: 'Grist Factory', pos: 'bl' } });
  const withDecor = (decor, theme) => Object.assign({}, theme || OCEAN, { decor });
  // Les thèmes prêts de l'extension (le harnais n'ouvre pas l'extension : son fichier de données se charge ici comme dans les autres cas).
  const readyThemes = async () => {
    if (typeof SlideThemes === 'undefined') await new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = 'extensions/diapositives/slide-themes.js?v=test'; s.onload = resolve; s.onerror = () => reject(new Error('slide-themes.js introuvable')); document.head.appendChild(s); });
    return (new Function('return SlideThemes'))().LIST.map(preset => SlideTheme.normalize(preset.theme));
  };
  const overlaps = (a, b) => a.x < b.x + b.w - 0.01 && b.x < a.x + a.w - 0.01 && a.y < b.y + b.h - 0.01 && b.y < a.y + a.h - 0.01;

  add('th_the_decor_is_bounded_and_a_theme_without_one_has_no_key',
    'normalizeDecor garde un bandeau (bord, épaisseur, réglage de couleur), un logo (PNG, JPEG, GIF ou WEBP en adresse de données de 72 000 caractères au plus, jamais un SVG), un numéro, un texte de pied (60 signes) et « pas sur la première » (avec un numéro ou un pied seulement), dans l\'ordre de ses clés ; le reste est écarté ; un thème sans décor n\'a pas de clé decor ; le décor voyage avec la page et un autre décor change le thème',
    async (h) => {
      await reset(h);
      const bad = [];
      const png = logoPng(200, 80);
      const norm = SlideTheme.normalizeDecor;
      const kept = norm({ band: { edge: 'left', size: 'thick', color: 'title', onclick: 'x' }, logo: { src: png, w: 200.4, h: 80, pos: 'bl', size: 'large', extra: 1 }, number: { pos: 'bc', x: 1 }, footer: { text: '  Un   pied  ', pos: 'br' }, skipFirst: true, evil: 1 });
      const wanted = { band: { edge: 'left', size: 'thick', color: 'title' }, logo: { src: png, w: 200, h: 80, pos: 'bl', size: 'large' }, number: { pos: 'bc' }, footer: { text: 'Un pied', pos: 'br' }, skipFirst: true };
      if (JSON.stringify(kept) !== JSON.stringify(wanted)) bad.push('décor complet : ' + JSON.stringify(kept).slice(0, 300));
      [null, undefined, 'x', 3, [], {}, { band: 3 }, { band: { edge: 'right' } }, { logo: { src: png } }, { number: true }, { footer: { text: '   ' } }, { skipFirst: true }].forEach((raw, at) => { if (norm(raw) !== null) bad.push('une valeur sans décor n\'est pas null (' + at + ') : ' + JSON.stringify(norm(raw)).slice(0, 80)); });
      const band = norm({ band: { edge: 'top', size: 'huge', color: '#ff0000' } }).band;
      if (JSON.stringify(band) !== '{"edge":"top","size":"medium","color":"accent1"}') bad.push('bandeau abîmé : ' + JSON.stringify(band));
      if (norm({ band: { edge: 'top', color: 'bg' } }).band.color !== 'accent1') bad.push('le fond n\'est pas une couleur de bandeau');
      const logo = src => norm({ logo: { src, w: 10, h: 10 } });
      const bounds = (w, h) => norm({ logo: { src: png, w, h } });
      [['svg', 'data:image/svg+xml;base64,AAAA'], ['script', 'data:image/png;base64,AAAA"><script>'], ['javascript', 'javascript:alert(1)'], ['http', 'https://example.com/a.png'], ['lourd', 'data:image/png;base64,' + 'A'.repeat(SlideTheme.LOGO_SRC_MAX)]]
        .forEach(([label, src]) => { if (logo(src) !== null) bad.push('un logo ' + label + ' est gardé'); });
      [[0, 10], [10, -1], [5000, 10], [NaN, 10]].forEach(([w, ht]) => { if (bounds(w, ht) !== null) bad.push('un logo de ' + w + 'x' + ht + ' est gardé'); });
      if (!logo('data:image/jpeg;base64,AAAA') || !logo('data:image/gif;base64,AAAA') || !logo('data:image/webp;base64,AAAA')) bad.push('un JPEG, un GIF ou un WEBP n\'est pas gardé');
      const odd = norm({ logo: { src: png, w: 10, h: 10, pos: 'zz', size: 'x' }, number: {}, footer: { text: 'y'.repeat(100), pos: 'zz' } });
      if (odd.logo.pos !== 'tr' || odd.logo.size !== 'medium' || odd.number.pos !== 'br' || odd.footer.text.length !== SlideTheme.FOOTER_MAX || odd.footer.pos !== 'bl') bad.push('valeurs d\'origine : ' + JSON.stringify(odd).slice(60, 300));
      if ('skipFirst' in norm({ band: { edge: 'left' }, skipFirst: true }) || 'skipFirst' in norm({ number: {}, skipFirst: 'true' })) bad.push('« pas sur la première » sans numéro ni pied, ou texte, est gardé');
      // Le thème.
      const t = SlideTheme.normalize(withDecor(decorFull()));
      if (JSON.stringify(Object.keys(t)) !== '["v","name","colors","fonts","decor"]') bad.push('clés du thème : ' + Object.keys(t));
      if ('decor' in SlideTheme.normalize(OCEAN) || 'decor' in SlideTheme.normalize(withDecor({ band: { edge: 'nord' } }))) bad.push('un thème sans décor a une clé decor');
      if (SlideTheme.equals(withDecor(decorFull()), OCEAN) || !SlideTheme.equals(withDecor(decorFull()), JSON.stringify(withDecor(decorFull()))) || SlideTheme.equals(withDecor(decorFull()), withDecor(Object.assign(decorFull(), { band: { edge: 'top', size: 'medium', color: 'accent2' } })))) bad.push('equals ne voit pas le décor');
      // Il voyage avec la page, et la retire.
      PageLayout.setTheme(withDecor(decorFull()));
      const stored = JSON.stringify(PageLayout.getMarginsMm());
      PageLayout.setMarginsMm(null);
      PageLayout.setMarginsMm(JSON.parse(stored));
      if (JSON.stringify(PageLayout.getTheme().decor) !== JSON.stringify(SlideTheme.normalize(withDecor(decorFull())).decor)) bad.push('le décor n\'a pas fait l\'aller-retour : ' + JSON.stringify(PageLayout.getTheme().decor).slice(0, 120));
      if (!PageLayout.getMarginsPt().theme.decor) bad.push('le décor ne sort pas de getMarginsPt');
      PageLayout.setTheme(OCEAN);
      if ('decor' in PageLayout.getTheme()) bad.push('setTheme sans décor a gardé l\'ancien');
      return result(bad);
    });

  add('th_the_decor_stays_on_the_page_and_never_covers_what_it_must_not',
    'decorItems : le bandeau est au bord dit, de l\'épaisseur dite, à l\'échelle de la hauteur de la page (autre taille, portrait compris) ; le logo garde son rapport, tient dans son coin, sous un bandeau du haut, à côté d\'un bandeau de gauche, au-dessus du numéro et du pied ; le numéro et le pied du même endroit ne font qu\'un texte « pied · 3 » ; « pas sur la première » ne retire que les textes ; sur toutes les combinaisons, deux pages, rien ne sort de la page',
    async (h) => {
      await reset(h);
      const bad = [];
      const page = { width: 960, height: 540 };
      const items = (decor, rank, size) => SlideTheme.decorItems(withDecor(decor), size || page, rank);
      const near = (a, b) => Math.abs(a - b) < 0.02;
      const same = (got, want) => ['x', 'y', 'w', 'h'].every(key => near(got[key], want[key]));
      const rect = (edge, size, at) => items({ band: { edge, size, color: 'accent1' } }, 0, at).find(i => i.kind === 'rect');
      [['left', 'thin', { x: 0, y: 0, w: 6, h: 540 }], ['bottom', 'medium', { x: 0, y: 526, w: 960, h: 14 }], ['top', 'thick', { x: 0, y: 0, w: 960, h: 28 }]].forEach(([edge, size, want]) => {
        const got = rect(edge, size);
        if (!got || !same(got, want) || got.color !== OCEAN.colors.accent1) bad.push('bandeau ' + edge + ' ' + size + ' : ' + JSON.stringify(got));
      });
      const double = rect('bottom', 'medium', { width: 1920, height: 1080 });
      if (!double || !same(double, { x: 0, y: 1052, w: 1920, h: 28 })) bad.push('une page deux fois plus grande : ' + JSON.stringify(double));
      const portrait = rect('bottom', 'medium', { width: 540, height: 960 });
      const k = 960 / 540;
      if (!portrait || !same(portrait, { x: 0, y: 960 - 14 * k, w: 540, h: 14 * k })) bad.push('portrait : ' + JSON.stringify(portrait));
      // Le logo : son rapport, son coin.
      const logoOf = (pos, size, wide, extra) => items(Object.assign({ logo: { src: logoPng(10, 10), w: wide ? 1000 : 200, h: wide ? 50 : 80, pos, size } }, extra || {}), 0).find(i => i.kind === 'image');
      const tr = logoOf('tr', 'small');
      if (!tr || !near(tr.h, 22) || !near(tr.w, 55) || !near(tr.x, 960 - 24 - 55) || !near(tr.y, 8)) bad.push('logo en haut à droite : ' + JSON.stringify(tr));
      const long = logoOf('tl', 'large', true);
      if (!long || !near(long.w, SlideTheme.LOGO_MAX_WIDTH) || !near(long.w / long.h, 20)) bad.push('logo très large : ' + JSON.stringify(long));
      const under = logoOf('tl', 'medium', false, { band: { edge: 'top', size: 'thick', color: 'title' } });
      if (!under || under.y < 28 || under.y > 28 + 8 + 0.01) bad.push('sous un bandeau du haut : ' + JSON.stringify(under));
      const beside = logoOf('tl', 'medium', false, { band: { edge: 'left', size: 'thick', color: 'title' } });
      if (!beside || beside.x < 28 + 24 - 0.01) bad.push('à côté d\'un bandeau de gauche : ' + JSON.stringify(beside));
      const bottom = logoOf('bl', 'medium', false, { footer: { text: 'Pied', pos: 'bl' } });
      const row = items({ footer: { text: 'Pied', pos: 'bl' } }, 0).find(i => i.kind === 'text');
      if (!bottom || !row || bottom.y + bottom.h > row.y - 8 + 0.01) bad.push('le logo du bas recouvre le pied : ' + JSON.stringify([bottom, row]));
      const free = logoOf('br', 'medium', false);
      if (!free || !near(free.y + free.h, 540 - 14)) bad.push('le logo du bas sans texte n\'est pas au ras de la marge : ' + JSON.stringify(free));
      // Les textes.
      const merged = items({ footer: { text: 'Société', pos: 'bc' }, number: { pos: 'bc' } }, 2).filter(i => i.kind === 'text');
      if (merged.length !== 1 || merged[0].text !== 'Société  ·  3' || merged[0].runs.length !== 3 || merged[0].runs[2].field !== 'slidenum' || merged[0].align !== 'center') bad.push('numéro et pied du même endroit : ' + JSON.stringify(merged));
      const apart = items({ footer: { text: 'Société', pos: 'bl' }, number: { pos: 'br' } }, 0).filter(i => i.kind === 'text');
      if (apart.length !== 2 || apart.map(i => i.align).join() !== 'left,right' || apart.map(i => i.text).join() !== 'Société,1') bad.push('numéro et pied à part : ' + JSON.stringify(apart.map(i => [i.text, i.align])));
      const skip = decor => ({ first: items(Object.assign({ skipFirst: true }, decor), 0).map(i => i.kind).join(), next: items(Object.assign({ skipFirst: true }, decor), 1).map(i => i.kind).join() });
      const skipped = skip({ band: { edge: 'left', size: 'thin', color: 'title' }, number: { pos: 'br' }, footer: { text: 'P', pos: 'bl' } });
      if (skipped.first !== 'rect' || skipped.next !== 'rect,text,text') bad.push('« pas sur la première » : ' + JSON.stringify(skipped));
      if (SlideTheme.decorItems(OCEAN, page, 0).length || SlideTheme.decorItems(withDecor(decorFull()), null, 0).length || SlideTheme.decorItems(withDecor(decorFull()), { width: 0, height: 540 }, 0).length) bad.push('sans décor ou sans page, il y a des objets');
      // Le texte du numéro et du pied se lit sur le fond, de tous les thèmes.
      (await readyThemes()).concat([SlideTheme.normalize(DARK), SlideTheme.normalize(OCEAN)]).forEach((theme) => {
        const text = SlideTheme.decorItems(Object.assign({}, theme, { decor: { number: { pos: 'br' } } }), page, 0).find(i => i.kind === 'text');
        if (!text || ColorMath.contrast(text.color, theme.colors.bg) < 4.5) bad.push('numéro illisible sur le fond de ' + (theme.name || 'un thème') + ' : ' + (text && text.color));
      });
      // Toutes les combinaisons, sur une page large et une page haute : rien ne sort de la page, le logo ne recouvre ni le bandeau ni un texte, le bandeau ni un texte.
      let combos = 0;
      [{ width: 960, height: 540 }, { width: 540, height: 960 }].forEach((size) => {
        [null, 'left', 'top', 'bottom'].forEach((edge) => {
          ['small', 'medium', 'large'].forEach((logoSize) => {
            ['tl', 'tr', 'bl', 'br'].forEach((corner) => {
              ['', 'bl', 'bc', 'br'].forEach((number) => {
                ['', 'bl', 'bc', 'br'].forEach((foot) => {
                  [0, 1].forEach((rank) => {
                    const decor = { logo: { src: logoPng(10, 10), w: 300, h: 120, pos: corner, size: logoSize } };
                    if (edge) decor.band = { edge, size: 'thick', color: 'accent1' };
                    if (number) decor.number = { pos: number };
                    if (foot) decor.footer = { text: 'Pied', pos: foot };
                    decor.skipFirst = rank === 0;
                    combos += 1;
                    const list = items(decor, rank, size);
                    const where = size.width + 'x' + size.height + ' ' + [edge, logoSize, corner, number, foot, rank].join('/');
                    list.forEach((i) => { if (i.x < -0.01 || i.y < -0.01 || i.x + i.w > size.width + 0.01 || i.y + i.h > size.height + 0.01) bad.push('hors page ' + where + ' : ' + i.kind); });
                    const logoItem = list.find(i => i.kind === 'image');
                    const bandItem = list.find(i => i.kind === 'rect');
                    list.filter(i => i.kind === 'text').forEach((text) => {
                      if (logoItem && overlaps(logoItem, text)) bad.push('logo sur un texte ' + where);
                      if (bandItem && overlaps(bandItem, text)) bad.push('bandeau sur un texte ' + where);
                    });
                    if (logoItem && bandItem && overlaps(logoItem, bandItem)) bad.push('logo sur le bandeau ' + where);
                  });
                });
              });
            });
          });
        });
      });
      if (combos !== 2 * 4 * 3 * 4 * 4 * 4 * 2) bad.push('combinaisons : ' + combos);
      return result(bad.slice(0, 12));
    });

  add('th_the_decor_is_written_behind_every_slide_in_the_outputs',
    'Les sorties (Lecture, PDF, Word, diaporama) reçoivent le décor en cadres derrière le texte de CHAQUE diapositive, la vide de la fin et celle qui a son fond comprises, après son fond et avant son texte : le bandeau a la couleur du réglage du thème, le numéro est celui de la diapositive, « pas sur la première » ne l\'ôte que de la première ; sans décor, pour le PowerPoint (keepProps) et pour un document, rien n\'est ajouté ; le HTML exporté n\'en garde rien ; la page est celle de CE modèle (`stored`)',
    async (h) => {
      await reset(h);
      const bad = [];
      const html = '<h1>Un</h1><p>a</p>' + BR + SlideProps.html({ bg: YELLOW }) + '<h2>Deux</h2>' + BR + SlideProps.html({ transition: 'fade' }) + '<p>Trois</p>' + BR;
      const slidesOf = (out) => {
        const host = document.createElement('div');
        host.innerHTML = out;
        const slides = [[]];
        Array.from(host.children).forEach((el) => { if (el.classList.contains('page-break-marker')) slides.push([]); else slides[slides.length - 1].push(el); });
        return slides.map(blocks => ({
          blocks,
          decor: blocks.filter(el => el.hasAttribute('data-ff-decor')),
          frame: blocks.findIndex(el => el.hasAttribute('data-ff-bg')),
          firstDecor: blocks.findIndex(el => el.hasAttribute('data-ff-decor')),
          text: blocks.findIndex(el => /^(H1|H2|P)$/.test(el.tagName)),
        }));
      };
      const theme = withDecor(decorFull(), DARK);
      const out = SlidesEntry.outputHtml('presentation', html, { theme });
      const slides = slidesOf(out);
      if (slides.length !== 4) bad.push('diapositives : ' + slides.length);
      slides.forEach((slide, at) => {
        if (slide.decor.length !== 4) bad.push('diapositive ' + (at + 1) + ' : ' + slide.decor.length + ' cadres de décor au lieu de quatre');
        if (slide.frame !== -1 && slide.frame > slide.firstDecor) bad.push('diapositive ' + (at + 1) + ' : le décor est avant le fond');
        if (slide.text !== -1 && slide.text < slide.decor.length + (slide.frame === -1 ? 0 : 1) - 1) bad.push('diapositive ' + (at + 1) + ' : le décor est après le texte');
        const numbers = slide.decor.map(el => el.textContent.trim()).filter(text => /^\d+$/.test(text));
        if (numbers.join() !== String(at + 1)) bad.push('diapositive ' + (at + 1) + ' : numéro ' + numbers.join());
        const band = slide.decor.find(el => !el.textContent.trim() && !el.querySelector('img'));
        if (!band || band.getAttribute('data-ff-fill') !== DARK.colors.accent2 || band.getAttribute('data-ff-layer') !== 'behind') bad.push('diapositive ' + (at + 1) + ' : bandeau ' + (band && [band.getAttribute('data-ff-fill'), band.getAttribute('data-ff-layer')]));
        const img = slide.decor.map(el => el.querySelector('img')).find(Boolean);
        if (!img || img.getAttribute('src') !== theme.decor.logo.src) bad.push('diapositive ' + (at + 1) + ' : logo');
        if (!slide.decor.some(el => /Grist Factory/.test(el.textContent))) bad.push('diapositive ' + (at + 1) + ' : pied');
        if (!slide.decor.every(el => el.getAttribute('role') === 'presentation' && el.getAttribute('aria-hidden') === 'true')) bad.push('diapositive ' + (at + 1) + ' : un cadre du décor se lit pour un lecteur d\'écran');
      });
      if (slides[1] && slides[1].frame === -1) bad.push('la diapositive à fond propre a perdu son fond');
      const last = slides[3] && slides[3].blocks[slides[3].blocks.length - 1];
      if (!last || last.tagName !== 'P') bad.push('la diapositive vide de la fin n\'a plus sa ligne');
      // « Pas sur la première » : le numéro et le pied seulement.
      const skipped = slidesOf(SlidesEntry.outputHtml('presentation', html, { theme: withDecor(Object.assign(decorFull(), { skipFirst: true }), DARK) }));
      if (skipped.map(s => s.decor.length).join() !== '2,4,4,4') bad.push('pas sur la première : ' + skipped.map(s => s.decor.length));
      // Le numéro et le pied du même endroit : un seul cadre.
      const merged = slidesOf(SlidesEntry.outputHtml('presentation', html, { theme: withDecor({ number: { pos: 'bl' }, footer: { text: 'Société', pos: 'bl' } }, DARK) }));
      if (merged.map(s => s.decor.length).join() !== '1,1,1,1' || !/Société\s+·\s+2/.test(merged[1].decor[0].textContent)) bad.push('un seul texte : ' + merged.map(s => s.decor.length) + ' ' + (merged[1].decor[0] && merged[1].decor[0].textContent));
      // Sans décor, la sortie est celle d'avant ; un document, le PowerPoint, rien ne s'ajoute.
      const before = SlidesEntry.outputHtml('presentation', html, { theme: DARK });
      const none = SlidesEntry.outputHtml('presentation', html, { theme: withDecor(null, DARK) });
      if (before !== none || /data-ff-decor/.test(before)) bad.push('sans décor, la sortie a changé');
      if (/data-ff-decor/.test(SlidesEntry.outputHtml('presentation', html, { theme, keepProps: true }))) bad.push('keepProps : le PowerPoint reçoit des cadres de décor');
      if (/data-ff-decor/.test(SlidesEntry.outputHtml('document', html, { theme }))) bad.push('un document a reçu du décor');
      // Le HTML exporté ne garde ni ces cadres ni leur texte ; la Lecture les a.
      const file = await h.exportHtml(out);
      if (/data-ff-decor/.test(file.text) || /Grist Factory/.test(file.text)) bad.push('le HTML exporté garde le décor');
      // La page de CE modèle : celle d'un autre modèle (un lot, un macro-modèle) n'est pas celle de l'écran.
      const bandWidth = (options) => { const band = slidesOf(SlidesEntry.outputHtml('presentation', html, Object.assign({ theme: withDecor({ band: { edge: 'bottom', size: 'thin', color: 'title' } }, DARK) }, options)))[0].decor[0]; return parseFloat(band.getAttribute('data-ff-w')); };
      const screen = PageLayout.getPageSizePt();
      if (Math.abs(bandWidth({}) - screen.width) > 0.05) bad.push('la page de l\'écran : ' + bandWidth({}) + ' au lieu de ' + screen.width);
      const wide = PageLayout.pageSizePtFor('landscape', PageLayout.SLIDE_FORMAT);
      if (Math.abs(bandWidth({ stored: null }) - wide.width) > 0.05 || Math.abs(wide.width - 960) > 1) bad.push('un modèle vierge : la diapositive 16:9 (' + wide.width + ' points), pas ' + bandWidth({ stored: null }));
      const a4 = PageLayout.pageSizePtFor('landscape', 'A4');
      if (Math.abs(bandWidth({ stored: { orientation: 'landscape', format: 'A4' } }) - a4.width) > 0.05) bad.push('un modèle en A4 paysage : ' + bandWidth({ stored: { orientation: 'landscape', format: 'A4' } }) + ' au lieu de ' + a4.width);
      if (SlidesEntry.pageSizeOf('document', null) !== null) bad.push('un document n\'a pas de page de diapositive');
      return result(bad);
    });

  add('th_the_powerpoint_file_carries_the_decor_on_its_master',
    'Le fichier PowerPoint pose le décor sur le MASQUE : le bandeau (couleur de réglage du thème : tx2 les titres, tx1 le texte, accentN), le logo (une image du fichier, relation du masque), le numéro (champ « numéro de diapositive ») et le pied, derrière les espaces réservés ; « pas sur la première » : une mise en page n° 2 qui cache le masque, reprend le bandeau et le logo et que seule la première diapositive prend ; sans décor, le fichier est celui d\'avant (une mise en page, rien de posé)',
    async (h) => {
      await reset(h);
      await ExportEngines.ensure('pptx');
      const bad = [];
      const build = async (theme) => {
        const html = SlidesEntry.outputHtml('presentation', '<h1>Alpha</h1><p>Beta</p>' + BR + '<h2>Gamma</h2><p>Delta</p>', { keepProps: true, theme });
        const marginsPt = Object.assign({}, PageLayout.getMarginsPt(), theme ? { theme } : {});
        const blob = await PptxExport.fromHtml(await ReaderMode.preview(html, null, {}), { marginsPt, title: 'Essai' });
        const zip = await JSZip.loadAsync(await blob.arrayBuffer());
        const text = async path => (zip.file(path) ? zip.file(path).async('string') : null);
        const parts = {};
        for (const path of Object.keys(zip.files)) if (/\.(xml|rels)$/.test(path)) parts[path] = await text(path);
        return { zip, parts, names: Object.keys(zip.files) };
      };
      const wellFormed = (parts) => Object.keys(parts).filter(path => new DOMParser().parseFromString(parts[path], 'application/xml').getElementsByTagName('parsererror').length);
      const full = await build(withDecor(Object.assign(decorFull(), { skipFirst: true, band: { edge: 'bottom', size: 'medium', color: 'title' } })));
      const master = full.parts['ppt/slideMasters/slideMaster1.xml'];
      if (wellFormed(full.parts).length) bad.push('XML mal formé : ' + wellFormed(full.parts));
      if (!/userDrawn="1"\/><\/p:nvSpPr><p:spPr><a:xfrm>[\s\S]*?<\/a:xfrm><a:prstGeom prst="rect"><a:avLst\/><\/a:prstGeom><a:solidFill><a:schemeClr val="tx2"\/>/.test(master)) bad.push('le bandeau (titres : tx2) n\'est pas sur le masque');
      if (!/<p:pic>[\s\S]*?<a:blip r:embed="rId4"\/>/.test(master)) bad.push('le logo n\'est pas sur le masque');
      if (!/<a:fld [^>]*type="slidenum">/.test(master) || !/<a:t>Grist Factory<\/a:t>/.test(master)) bad.push('le numéro (champ) et le pied ne sont pas sur le masque');
      if (master.indexOf('userDrawn="1"') > master.indexOf('type="title"')) bad.push('le décor n\'est pas derrière les espaces réservés');
      if ((master.match(/<p:sldLayoutId /g) || []).length !== 2) bad.push('la liste des mises en page du masque : ' + (master.match(/<p:sldLayoutId /g) || []).length);
      const masterRels = full.parts['ppt/slideMasters/_rels/slideMaster1.xml.rels'];
      const media = full.names.filter(name => /^ppt\/media\/image\d+\.png$/.test(name));
      if (media.length !== 1 || !new RegExp('Id="rId4"[^>]*Target="\\.\\./media/' + media[0].split('/').pop().replace('.', '\\.') + '"|Target="\\.\\./media/' + media[0].split('/').pop().replace('.', '\\.') + '"[^>]*Id="rId4"').test(masterRels) || !/Id="rId3"[^>]*slideLayout2\.xml|slideLayout2\.xml[^>]*Id="rId3"/.test(masterRels)) bad.push('relations du masque : ' + masterRels.slice(0, 600));
      const layout2 = full.parts['ppt/slideLayouts/slideLayout2.xml'];
      if (!layout2 || !/showMasterSp="0"/.test(layout2) || !/<p:pic>/.test(layout2) || /<a:fld /.test(layout2) || /Grist Factory/.test(layout2) || !/type="title"/.test(layout2)) bad.push('mise en page n° 2 : ' + (layout2 || '').slice(0, 300));
      if (!/Id="rId2"[^>]*media\/image\d+\.png|media\/image\d+\.png[^>]*Id="rId2"/.test(full.parts['ppt/slideLayouts/_rels/slideLayout2.xml.rels'] || '')) bad.push('le logo de la mise en page n° 2');
      if (!/slideLayout2\.xml/.test(full.parts['ppt/slides/_rels/slide1.xml.rels']) || /slideLayout2\.xml/.test(full.parts['ppt/slides/_rels/slide2.xml.rels']) || !/slideLayout1\.xml/.test(full.parts['ppt/slides/_rels/slide2.xml.rels'])) bad.push('la première diapositive seule prend la mise en page n° 2');
      if (!/slideLayout2\.xml" ContentType/.test(full.parts['[Content_Types].xml'])) bad.push('[Content_Types] ne connaît pas la mise en page n° 2');
      if (!/Extension="png"/.test(full.parts['[Content_Types].xml'])) bad.push('[Content_Types] ne connaît pas le PNG');
      // Les couleurs de réglage : texte → tx1, accent → accentN ; sans « pas sur la première » : une seule mise en page, rien de plus.
      const second = await build(withDecor({ band: { edge: 'left', size: 'thin', color: 'text' }, number: { pos: 'br' } }));
      const m2 = second.parts['ppt/slideMasters/slideMaster1.xml'];
      if (!/<a:schemeClr val="tx1"\/><\/a:solidFill><a:ln>/.test(m2) || !/<a:fld /.test(m2) || (m2.match(/<p:sldLayoutId /g) || []).length !== 1 || second.names.some(name => /slideLayout2/.test(name)) || /slideLayout2/.test(second.parts['ppt/slides/_rels/slide1.xml.rels'])) bad.push('sans « pas sur la première »');
      const third = await build(withDecor({ band: { edge: 'top', size: 'thick', color: 'accent3' } }));
      if (!/<a:schemeClr val="accent3"\/>/.test(third.parts['ppt/slideMasters/slideMaster1.xml'])) bad.push('un accent du thème n\'est pas écrit en accentN');
      // Sans décor : ni objet posé, ni autre mise en page, ni image.
      const plain = await build(OCEAN);
      const m3 = plain.parts['ppt/slideMasters/slideMaster1.xml'];
      if (/userDrawn/.test(m3) || (m3.match(/<p:sldLayoutId /g) || []).length !== 1 || plain.names.some(name => /slideLayout2|ppt\/media\//.test(name))) bad.push('sans décor, le fichier a changé');
      // Un décor sans logo ne crée aucune image.
      if (second.names.some(name => /ppt\/media\//.test(name))) bad.push('une image sans logo');
      return result(bad);
    });

  add('slide_theme_decor_a_theme_keeps_its_logo_in_the_document_list_within_a_weight_budget',
    'Un thème du document garde son décor (bandeau, logo, numéro, pied) tel que SlideTheme le borne ; « find » (les thèmes prêts) ne regarde que les couleurs et les polices ; la liste refuse (\'heavy\') ce qui la ferait peser plus de SAVED_CHARS_MAX caractères, sans rien écrire, et remplacer un thème par un plus léger reste permis',
    async (h) => {
      try {
        await themesSetup(h);
        const bad = [];
        const check = (label, ok, detail) => { if (!ok) bad.push(label + (detail === undefined ? '' : ' : ' + JSON.stringify(detail).slice(0, 200))); };
        const decor = decorFull();
        check('un thème avec décor se range', SlideThemes.save(withDecor(decor), 'Avec décor') === 'added');
        const keptDecor = SlideThemes.saved()[0].decor;
        check('le décor est gardé, borné', JSON.stringify(keptDecor) === JSON.stringify(SlideTheme.normalize(withDecor(decor)).decor), keptDecor);
        const listed = (new Function('return SlideThemes'))().LIST;
        check('un thème prêt est reconnu avec ou sans décor', SlideThemes.find(withDecor(decor, SlideTheme.normalize(listed[0].theme))) === listed[0]);
        // Des logos lourds : douze thèmes de 70 000 caractères passent le budget bien avant la douzième entrée.
        const heavyLogo = () => 'data:image/png;base64,' + 'A'.repeat(SlideTheme.LOGO_SRC_MAX - 200);
        const heavy = (n) => withDecor({ logo: { src: heavyLogo(), w: 100, h: 100, pos: 'tl', size: 'small' }, footer: { text: 'n' + n, pos: 'bl' } });
        let at = 1;
        let verdict = 'added';
        while (verdict === 'added' && at < 20) { verdict = SlideThemes.save(heavy(at), 'Lourd ' + at); at += 1; }
        check('la liste refuse à un moment ce qui la rend trop lourde, avant la douzième entrée', verdict === 'heavy' && SlideThemes.saved().length < SlideThemes.SAVED_MAX, [verdict, SlideThemes.saved().length]);
        const size = JSON.stringify(SlideThemes.saved()).length;
        check('la liste écrite reste sous le budget', size <= SlideThemes.SAVED_CHARS_MAX, size);
        const count = SlideThemes.saved().length;
        check('un refus n\'écrit rien et ne change pas la liste', SlideThemes.saved().length === count, count);
        check('remplacer un thème lourd par un thème léger est permis', SlideThemes.save(OCEAN, 'Lourd 1') === 'replaced' && SlideThemes.saved().find(theme => theme.name === 'Lourd 1').decor === undefined);
        check('et la place libérée permet d\'en ranger un autre', SlideThemes.save(heavy(99), 'Autre lourd') === 'added');
        return result(bad);
      } finally { await themesCleanup(h); }
    });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.slideTheme = cases;
})();
