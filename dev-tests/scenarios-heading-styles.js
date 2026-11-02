// Suite "headingStyles" - le style d'un niveau de titre, pris d'après la sélection (js/heading-styles.js, deux lignes du menu « Titre » : « Mettre à jour « Titre N » d'après la sélection » et
// « Rétablir le style d'origine »), demande d'Antoine du 22/10 lancée le 02/11 : « style des titres d'après la sélection », comme « Mettre à jour Titre 2 pour correspondre à la sélection » de Word.
//  - la mise à jour : le style est écrit dans le modèle (`data-level-styles` du nœud de numérotation), tous les titres du niveau et eux seuls le prennent, dans l'éditeur, y compris un titre neuf ;
//    la mise en forme à la main des réglages que la sélection pose est retirée des titres du niveau, le gras, les liens et le reste restent ; un réglage qui varie dans la sélection ne change rien ;
//  - l'alignement du titre l'emporte sur celui du style, une marque de texte sur la mise en forme du titre ; le surlignage passe par un <span> (jamais la ligne entière) ;
//  - les deux lignes : libellé avec le niveau, grisées hors d'un titre, dans plusieurs titres et sans style à rétablir, avec leur raison, en français et en anglais ; la barre montre la police et la taille du style ;
//  - Ctrl+Z et Ctrl+Y : une mise à jour (style et titres retouchés) ou un rétablissement est UN pas ; le suivi des modifications n'en fait pas des suggestions ;
//  - le même style partout : la Lecture, l'impression, le PDF (le numéro du titre compris), le Word, le HTML ; un document sans style sort comme avant ; un texte JSON abîmé est ignoré ;
//  - le style suit le modèle : le HTML enregistré le porte, changer la numérotation des titres le garde.
// Le vrai clic à 700x400 (le menu au survol, les lignes atteignables, clair et sombre, français et anglais) est dans dev-tests/verify-heading-styles-mouse.mjs.
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const editor = () => EditorCore.getEditor();
  const add = (id, description, run, extra) => cases.push(Object.assign({ id, description, run }, extra || {}));
  const byId = id => document.getElementById(id);
  const updateRow = () => byId('v2-btn-heading-style-update');
  const resetRow = () => byId('v2-btn-heading-style-reset');
  const result = bad => ({ pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' });

  async function load(markup) {
    Editor.setHTML(markup);
    await sleep(200);
  }
  // Les bornes du texte `needle` dans le document (la première occurrence).
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
  async function select(from, to) {
    editor().chain().focus().setTextSelection({ from, to }).run();
    await sleep(80);
  }
  const selectText = async needle => { const r = range(needle); await select(r.from, r.to); };
  const caretIn = async needle => { const r = range(needle); await select(r.from + 1, r.from + 1); };
  const mark = (needle, attrs) => { const r = range(needle); return editor().chain().focus().setTextSelection(r).setMark('textStyle', attrs).run(); };
  const marksOf = needle => { const r = range(needle); return editor().state.doc.nodeAt(r.from).marks.map(m => m.type.name + (m.type.name === 'textStyle' ? JSON.stringify(Object.fromEntries(Object.entries(m.attrs).filter(([, v]) => v != null))) : '')).sort().join(','); };
  const levelStyles = () => HeadingStyles.stylesOf(editor().state.doc);
  const headings = level => Array.from(document.querySelectorAll('#editor-container .ProseMirror h' + level));
  const paint = el => { const cs = getComputedStyle(el); return { size: cs.fontSize, color: cs.color, italic: cs.fontStyle, family: cs.fontFamily, line: cs.textDecorationLine, align: cs.textAlign, fill: cs.backgroundColor }; };
  const DEFAULT_H1_PX = '32px';     // 24 pt
  const DEFAULT_H2_PX = '26.6667px';  // 20 pt
  const STYLE = { italic: true, color: '#1f4e79', fontSize: '18pt', fontFamily: 'Georgia' };
  const config = (levels, numbering) => '<div class="heading-numbering-config" data-style="' + (numbering || 'none') + '"' + (levels ? " data-level-styles='" + JSON.stringify(levels) + "'" : '') + '></div>';
  // Le geste de la personne sur une ligne du menu.
  async function clickRow(row) {
    HeadingStyles.syncRows(editor(), { update: updateRow(), reset: resetRow() });
    row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await sleep(120);
  }
  function press(key) {
    const target = document.activeElement || document.body;
    target.dispatchEvent(new KeyboardEvent('keydown', { key, code: 'Key' + key.toUpperCase(), ctrlKey: true, bubbles: true, cancelable: true }));
  }
  // Un document de trois titres de niveau 1 (le premier mis en forme à la main), un titre 2 et un paragraphe.
  const SAMPLE = '<h1>Un <strong>gras</strong></h1><h1>Deux <a href="https://exemple.fr">lien</a></h1><h1>Trois</h1><h2>Sous</h2><p>texte courant</p>';
  async function styledByHand() {
    await load(SAMPLE);
    mark('Un', { fontFamily: 'Georgia', fontSize: '18pt', color: '#1f4e79' });
    editor().chain().focus().setTextSelection(range('Un')).setMark('italic').run();
    await sleep(60);
    await selectText('Un');
  }

  add('hs_update_gives_the_style_to_every_title_of_the_level_and_only_that_level',
    'Un titre 1 mis en forme à la main (Georgia, 18 pt, bleu, italique), « Mettre à jour » : le style est écrit dans le modèle, les trois titres 1 le prennent, le titre 2 et le paragraphe non ; un autre titre 1 mis en rouge à la main perd ce rouge, le gras et le lien restent',
    async (h) => {
      await h.resetEditor();
      await styledByHand();
      mark('Deux', { color: '#c0392b' });
      await selectText('Un');
      const before = { h2: paint(headings(2)[0]), p: getComputedStyle(document.querySelector('#editor-container .ProseMirror p')).fontSize };
      const done = HeadingStyles.update(editor());
      await sleep(120);
      const one = headings(1).map(paint);
      const bad = [];
      if (!done) bad.push('update a rendu faux');
      if (JSON.stringify(levelStyles()) !== JSON.stringify({ 1: { italic: true, color: '#1f4e79', fontSize: '18pt', fontFamily: 'Georgia' } })) bad.push('style écrit : ' + JSON.stringify(levelStyles()));
      one.forEach((p, i) => {
        if (p.size !== '24px' || p.color !== 'rgb(31, 78, 121)' || p.italic !== 'italic' || !/Georgia/.test(p.family)) bad.push('titre 1 n° ' + (i + 1) + ' : ' + JSON.stringify(p));
      });
      const h2 = paint(headings(2)[0]);
      if (h2.size !== before.h2.size || h2.italic !== 'normal' || h2.color !== before.h2.color) bad.push('le titre 2 a bougé : ' + JSON.stringify(h2));
      if (getComputedStyle(document.querySelector('#editor-container .ProseMirror p')).fontSize !== before.p) bad.push('le paragraphe a bougé');
      if (marksOf('Un') !== '' || marksOf('Deux') !== '') bad.push('marques à la main restantes : ' + marksOf('Un') + ' / ' + marksOf('Deux'));
      if (marksOf('gras') !== 'bold') bad.push('le gras a bougé : ' + marksOf('gras'));
      if (!/^link/.test(marksOf('lien'))) bad.push('le lien a bougé : ' + marksOf('lien'));
      return result(bad);
    });

  add('hs_a_new_title_and_a_converted_paragraph_take_the_style_but_not_another_level',
    'Après la mise à jour du niveau 1, un paragraphe converti en titre 1 prend le style, converti en titre 2 non ; un titre 1 écrit à la fin aussi',
    async (h) => {
      await h.resetEditor();
      await styledByHand();
      HeadingStyles.update(editor());
      await sleep(100);
      await caretIn('texte courant');
      editor().chain().focus().setHeading({ level: 1 }).run();
      await sleep(100);
      const asOne = paint(headings(1)[headings(1).length - 1]);
      editor().chain().focus().setHeading({ level: 2 }).run();
      await sleep(100);
      const asTwo = paint(headings(2)[headings(2).length - 1]);
      const bad = [];
      if (asOne.size !== '24px' || asOne.color !== 'rgb(31, 78, 121)' || asOne.italic !== 'italic') bad.push('titre 1 converti : ' + JSON.stringify(asOne));
      if (asTwo.size !== DEFAULT_H2_PX || asTwo.italic !== 'normal') bad.push('titre 2 converti : ' + JSON.stringify(asTwo));
      return result(bad);
    });

  add('hs_alignment_of_the_title_wins_over_the_style_and_a_mark_wins_over_both',
    'Le style d\'un titre centré aligne les autres titres du niveau (celui qui était à droite perd son alignement) ; un alignement posé ensuite sur un titre l\'emporte ; une couleur posée sur un mot l\'emporte sur celle du style',
    async (h) => {
      await h.resetEditor();
      await load('<h1 style="text-align: center">Un</h1><h1 style="text-align: right">Deux</h1><h1>Trois</h1>');
      mark('Un', { color: '#1f4e79' });
      await selectText('Un');
      HeadingStyles.update(editor());
      await sleep(120);
      const after = headings(1).map(el => paint(el).align);
      const bad = [];
      if (after.join() !== 'center,center,center') bad.push('alignements après la mise à jour : ' + after.join());
      await caretIn('Deux');
      editor().chain().focus().setTextAlign('right').run();
      await sleep(100);
      const own = headings(1).map(el => paint(el).align).join();
      if (own !== 'center,right,center') bad.push('alignement propre : ' + own);
      mark('Trois', { color: '#c0392b' });
      await sleep(80);
      const word = getComputedStyle(headings(1)[2].querySelector('span')).color;
      if (word !== 'rgb(192, 57, 43)') bad.push('couleur du mot : ' + word);
      if (getComputedStyle(headings(1)[0]).color !== 'rgb(31, 78, 121)') bad.push('couleur du style perdue');
      return result(bad);
    });

  add('hs_a_setting_that_varies_in_the_selection_changes_nothing_and_strips_nothing',
    'Une sélection de deux mots de couleurs différentes ne change pas la couleur du style et ne retire pas ces couleurs ; la taille qu\'ils ont en commun, elle, entre dans le style',
    async (h) => {
      await h.resetEditor();
      await load(config({ 1: { color: '#1f4e79' } }) + '<h1>Rouge Vert</h1><h1>Autre</h1>');
      mark('Rouge Vert', { fontSize: '16pt' });
      mark('Rouge', { color: '#c0392b' });
      mark('Vert', { color: '#1e8449' });
      await select(range('Rouge').from, range('Vert').to);
      HeadingStyles.update(editor());
      await sleep(120);
      const styles = levelStyles();
      const bad = [];
      if (JSON.stringify(styles) !== JSON.stringify({ 1: { color: '#1f4e79', fontSize: '16pt' } })) bad.push('style : ' + JSON.stringify(styles));
      if (!/"color":"#c0392b"/.test(marksOf('Rouge')) || !/"color":"#1e8449"/.test(marksOf('Vert'))) bad.push('couleurs retirées : ' + marksOf('Rouge') + ' / ' + marksOf('Vert'));
      if (/fontSize/.test(marksOf('Rouge'))) bad.push('la taille posée à la main reste : ' + marksOf('Rouge'));
      return result(bad);
    });

  add('hs_highlight_is_a_span_around_the_text_never_the_whole_line',
    'Le surlignage du style peint le texte du titre (un <span>), pas la ligne entière ; dans l\'éditeur comme dans la Lecture',
    async (h) => {
      await h.resetEditor();
      await load(config({ 1: { backgroundColor: '#fff3a3' } }) + '<h1>Titre surligné</h1><p>texte</p>');
      const heading = headings(1)[0];
      const span = heading.querySelector('span');
      const bad = [];
      if (getComputedStyle(heading).backgroundColor !== 'rgba(0, 0, 0, 0)') bad.push('la ligne est peinte : ' + getComputedStyle(heading).backgroundColor);
      if (!span || getComputedStyle(span).backgroundColor !== 'rgb(255, 243, 163)') bad.push('le texte n\'est pas surligné : ' + (span && getComputedStyle(span).backgroundColor));
      const reader = await h.renderReaderMode(Editor.getHTML());
      const rh = reader.querySelector('h1');
      const rspan = rh && rh.querySelector('span');
      if (!rh || getComputedStyle(rh).backgroundColor !== 'rgba(0, 0, 0, 0)') bad.push('Lecture : ligne peinte');
      if (!rspan || getComputedStyle(rspan).backgroundColor !== 'rgb(255, 243, 163)') bad.push('Lecture : texte non surligné');
      document.getElementById('reader-container').style.display = 'none';
      return result(bad);
    });

  add('hs_the_two_rows_say_the_level_and_grey_out_with_their_reason_in_both_languages',
    'Hors d\'un titre : les deux lignes sont grisées avec leur raison ; dans un titre 2 sans style : « Mettre à jour » nomme « Titre 2 » et « Rétablir » reste grisée ; dans plusieurs titres : grisées ; après une mise à jour : « Rétablir » s\'allume',
    async (h) => {
      await h.resetEditor();
      const english = I18n.getLang() === 'en';
      await load('<h1>Un</h1><h2>Deux</h2><p>texte</p>');
      const sync = () => HeadingStyles.syncRows(editor(), { update: updateRow(), reset: resetRow() });
      const state = () => { sync(); return { upd: updateRow().textContent, updOff: updateRow().getAttribute('aria-disabled'), updTitle: updateRow().title, rst: resetRow().textContent, rstOff: resetRow().getAttribute('aria-disabled'), rstTitle: resetRow().title }; };
      const t = (fr, en) => (english ? en : fr);
      const bad = [];
      await caretIn('texte');
      let s = state();
      if (s.updOff !== 'true' || s.rstOff !== 'true' || !s.updTitle || !s.rstTitle) bad.push('hors titre : ' + JSON.stringify(s));
      if (s.upd !== t('Mettre à jour le style du titre d’après la sélection', 'Update the heading style to match the selection')) bad.push('libellé hors titre : ' + s.upd);
      await caretIn('Deux');
      s = state();
      if (s.updOff !== 'false' || s.updTitle) bad.push('titre 2 : mise à jour grisée ' + JSON.stringify(s));
      if (s.upd !== t('Mettre à jour « Titre 2 » d’après la sélection', 'Update “Heading 2” to match the selection')) bad.push('libellé titre 2 : ' + s.upd);
      if (s.rstOff !== 'true' || s.rstTitle !== t('Ce niveau de titre n’a pas de style personnalisé', 'This heading level has no custom style')) bad.push('rétablir sans style : ' + JSON.stringify(s));
      editor().chain().focus().selectAll().run();
      await sleep(80);
      s = state();
      if (s.updOff !== 'true' || s.rstOff !== 'true') bad.push('plusieurs blocs : ' + JSON.stringify(s));
      await caretIn('Deux');
      mark('Deux', { color: '#1f4e79' });
      await selectText('Deux');
      HeadingStyles.update(editor());
      await sleep(100);
      s = state();
      if (s.rstOff !== 'false' || s.rst !== t('Rétablir le style d’origine de « Titre 2 »', 'Restore the original style of “Heading 2”')) bad.push('rétablir avec style : ' + JSON.stringify(s));
      return result(bad);
    });
  cases.push(Object.assign({}, cases[cases.length - 1], {
    id: 'hs_the_two_rows_say_the_level_and_grey_out_with_their_reason_in_english',
    lang: 'en',
  }));

  add('hs_clicking_the_rows_updates_and_restores_through_the_toolbar_wiring',
    'Le clic sur les lignes (câblage de la barre, comme la souris) met à jour puis rétablit ; une ligne grisée ne fait rien',
    async (h) => {
      await h.resetEditor();
      await styledByHand();
      const bad = [];
      await clickRow(resetRow());
      if (levelStyles()) bad.push('« Rétablir » grisée a pourtant agi');
      await clickRow(updateRow());
      if (!levelStyles() || !levelStyles()[1]) bad.push('le clic sur « Mettre à jour » n\'a rien écrit');
      await clickRow(resetRow());
      if (levelStyles()) bad.push('« Rétablir » n\'a pas retiré le style : ' + JSON.stringify(levelStyles()));
      const p = paint(headings(1)[0]);
      if (p.size !== DEFAULT_H1_PX || p.italic !== 'normal') bad.push('le titre n\'a pas retrouvé son aspect d\'origine : ' + JSON.stringify(p));
      return result(bad);
    });

  add('hs_update_and_restore_are_one_undo_step_each_and_redo_puts_them_back',
    'Ctrl+Z défait la mise à jour d\'un coup (style ET mise en forme à la main), Ctrl+Y la remet ; de même pour « Rétablir » ; le HTML revient octet pour octet',
    async (h) => {
      await h.resetEditor();
      await styledByHand();
      await sleep(600);
      const start = Editor.getHTML();
      HeadingStyles.update(editor());
      await sleep(120);
      const updated = Editor.getHTML();
      await sleep(600);
      HeadingStyles.reset(editor());
      await sleep(120);
      const restored = Editor.getHTML();
      const bad = [];
      if (start === updated || updated === restored) bad.push('rien n\'a changé');
      press('z'); await sleep(120);
      if (Editor.getHTML() !== updated) bad.push('Ctrl+Z après « Rétablir » ne rend pas l\'état mis à jour');
      press('z'); await sleep(120);
      if (Editor.getHTML() !== start) bad.push('Ctrl+Z après « Mettre à jour » ne rend pas l\'état de départ');
      press('y'); await sleep(120);
      if (Editor.getHTML() !== updated) bad.push('Ctrl+Y ne remet pas la mise à jour');
      press('y'); await sleep(120);
      if (Editor.getHTML() !== restored) bad.push('Ctrl+Y ne remet pas le rétablissement');
      return result(bad);
    });

  add('hs_track_changes_does_not_turn_the_update_into_suggestions',
    'Le suivi des modifications allumé : la mise à jour du style n\'ajoute aucune suggestion en attente (un réglage du modèle, pas une rédaction)',
    async (h) => {
      await h.resetEditor();
      await styledByHand();
      Editor.setTrackChanges(true);
      await sleep(100);
      const bad = [];
      try {
        const done = HeadingStyles.update(editor());
        await sleep(120);
        if (!done) bad.push('update a rendu faux');
        if (Editor.hasPendingTrackedChanges()) bad.push('des modifications suivies sont en attente');
        if (!levelStyles()) bad.push('style non écrit');
      } finally { Editor.setTrackChanges(false); }
      return result(bad);
    });

  add('hs_the_toolbar_shows_the_font_and_the_size_of_the_style_in_a_styled_title',
    'Le curseur dans un titre sans marque dont le niveau a un style : la puce de police dit Georgia et la puce de taille 18pt (et non 10.5pt) ; hors d\'un titre à style, rien ne change',
    async (h) => {
      await h.resetEditor();
      await styledByHand();
      HeadingStyles.update(editor());
      await sleep(100);
      await caretIn('Trois');
      MainToolbar.syncToolbarState();
      await sleep(60);
      const bad = [];
      const font = byId('v2-font-chip-val').textContent;
      const size = byId('v2-size-chip-val').textContent;
      if (font !== 'Georgia' || size !== '18pt') bad.push('dans le titre : ' + font + ' / ' + size);
      await caretIn('Sous');
      MainToolbar.syncToolbarState();
      await sleep(60);
      if (byId('v2-size-chip-val').textContent !== '10.5pt' || byId('v2-font-chip-val').textContent !== 'Roboto') bad.push('titre 2 sans style : ' + byId('v2-font-chip-val').textContent + ' / ' + byId('v2-size-chip-val').textContent);
      return result(bad);
    });

  add('hs_the_style_travels_in_the_saved_html_and_survives_a_numbering_change_and_a_reload',
    'Le HTML enregistré porte `data-level-styles` ; recharger ce HTML redonne le même aspect ; changer la numérotation des titres garde le style ; un document sans style n\'écrit rien de plus qu\'avant',
    async (h) => {
      await h.resetEditor();
      await load('<h1>Un</h1><p>texte</p>');
      const plain = Editor.getHTML();
      const bad = [];
      if (/level-styles/.test(plain)) bad.push('un document sans style écrit `level-styles` : ' + plain);
      mark('Un', { color: '#1f4e79', fontSize: '18pt' });
      await selectText('Un');
      HeadingStyles.update(editor());
      await sleep(100);
      const saved = Editor.getHTML();
      if (!/data-level-styles="[^"]*&quot;1&quot;/.test(saved)) bad.push('style absent du HTML : ' + saved);
      editor().chain().focus().setHeadingNumberingStyle('numeric').run();
      await sleep(100);
      if (!levelStyles() || levelStyles()[1].color !== '#1f4e79') bad.push('la numérotation a effacé le style');
      const withNumbering = Editor.getHTML();
      await load('<p>autre</p>');
      await load(withNumbering);
      const p = paint(headings(1)[0]);
      if (p.size !== '24px' || p.color !== 'rgb(31, 78, 121)') bad.push('rechargé : ' + JSON.stringify(p));
      if (Editor.getHTML() !== withNumbering) bad.push('le HTML rechargé n\'est pas le même');
      return result(bad);
    });

  add('hs_a_damaged_or_hostile_style_text_is_ignored',
    'Un `data-level-styles` illisible, d\'un niveau inconnu, aux valeurs qui chargent ou sortent d\'une déclaration est écarté : aucune déclaration inventée, les valeurs sûres gardées',
    async (h) => {
      await h.resetEditor();
      const bad = [];
      const hostile = { 1: { color: 'red; background: url(http://x/y)', fontSize: '12pt}', fontFamily: 'Georgia', bold: true, unknown: 'x' }, 7: { color: '#000000' }, 2: 'texte' };
      const parsed = HeadingStyles.normalize(JSON.stringify(hostile));
      if (JSON.stringify(parsed) !== JSON.stringify({ 1: { fontFamily: 'Georgia' } })) bad.push('normalize : ' + JSON.stringify(parsed));
      if (HeadingStyles.normalize('pas du json') !== null || HeadingStyles.normalize('[1,2]') !== null || HeadingStyles.normalize(null) !== null) bad.push('normalize d\'un texte abîmé');
      await load("<div class=\"heading-numbering-config\" data-style=\"none\" data-level-styles='{\"1\":{\"color\":\"red; background: url(http://x/y)\",\"fontFamily\":\"Georgia\"}}'></div><h1>Un</h1>");
      const style = headings(1)[0].getAttribute('style') || '';
      if (/url|background/.test(style) || /url|background/.test(Editor.getHTML())) bad.push('déclaration inventée : ' + style);
      if (!/Georgia/.test(getComputedStyle(headings(1)[0]).fontFamily)) bad.push('la valeur sûre n\'est pas gardée');
      return result(bad);
    });

  add('hs_the_reader_prints_and_exports_show_the_same_title_as_the_editor',
    'La Lecture, le PDF, le Word et le HTML donnent au titre 1 la police, la taille, la couleur, l\'italique, le souligné et l\'alignement du style, le numéro du titre aussi (PDF, Word) ; le titre 2 reste comme avant',
    async (h) => {
      await h.resetEditor();
      const levels = { 1: { italic: true, underline: true, color: '#1f4e79', fontSize: '30pt', fontFamily: 'Georgia', textAlign: 'center' } };
      const html = config(levels, 'numeric') + '<h1>Alpha</h1><h2>Beta</h2><p>texte</p>';
      const bad = [];
      // L'éditeur et la Lecture
      await load(html);
      const painted = paint(headings(1)[0]);
      const reader = await h.renderReaderMode(Editor.getHTML());
      const read = paint(reader.querySelector('h1'));
      document.getElementById('reader-container').style.display = 'none';
      ['size', 'color', 'italic', 'line', 'align'].forEach((k) => { if (painted[k] !== read[k]) bad.push('éditeur ≠ Lecture sur ' + k + ' : ' + painted[k] + ' / ' + read[k]); });
      if (painted.size !== '40px' || painted.color !== 'rgb(31, 78, 121)' || painted.italic !== 'italic' || !/underline/.test(painted.line) || painted.align !== 'center') bad.push('éditeur : ' + JSON.stringify(painted));
      // Le PDF
      const pdf = await h.exportPdfContent(html);
      const blocks = h.findTextBlocks(pdf.content, b => b._isHeading);
      const one = blocks[0];
      const runs = Array.isArray(one.text) ? one.text : [{ text: one.text }];
      if (one.alignment !== 'center') bad.push('PDF : alignement ' + one.alignment);
      if (runs.length !== 2 || !runs.every(r => r.fontSize === 30 && r.italics === true && r.color === '#1f4e79' && JSON.stringify(r.decoration) === '["underline"]')) bad.push('PDF : runs du titre 1 ' + JSON.stringify(runs));
      const two = Array.isArray(blocks[1].text) ? blocks[1].text : [];
      if (!two.length || !two.every(r => r.fontSize === 20 && !r.italics && !r.color && !r.decoration)) bad.push('PDF : le titre 2 a bougé ' + JSON.stringify(two));
      // Le Word
      const parts = await h.exportDocxParts(html);
      const paragraphs = h.docxParagraphs(parts.doc).filter(p => p.text);
      const [d1, d2] = paragraphs;
      if (d1.align !== 'center' || d1.style !== 'Heading1') bad.push('Word : paragraphe ' + JSON.stringify([d1.align, d1.style]));
      if (d1.runs.length !== 2 || !d1.runs.every(r => r.sizeHalfPt === 60 && r.color === '1F4E79' && r.italics && r.underline && r.font === 'Georgia')) bad.push('Word : séries du titre 1 ' + JSON.stringify(d1.runs));
      if (!d2.runs.every(r => r.sizeHalfPt === 40 && r.color === 'auto' && !r.italics && !r.underline)) bad.push('Word : le titre 2 a bougé');
      // Le HTML
      const file = await h.exportHtml(html);
      const h1 = (file.text.match(/<h1[^>]*>/) || [''])[0];
      if (!/font-size: 30pt/.test(h1) || !/color: #1f4e79/.test(h1) || !/font-style: italic/.test(h1) || !/text-decoration: underline/.test(h1) || !/text-align: center/.test(h1) || !/Georgia/.test(h1)) bad.push('HTML : ' + h1);
      if (!/<h2>/.test(file.text)) bad.push('HTML : le titre 2 a reçu un style');
      return result(bad);
    });

  add('hs_the_powerpoint_shows_the_style_of_the_title',
    'Le PowerPoint écrit le titre 1 de la taille, de la couleur, du surlignage, de la police, de l\'italique, du souligné et de l\'alignement du style (le titre 2 reste de la taille de sa balise, sans couleur)',
    async (h) => {
      await h.resetEditor();
      const levels = { 1: { italic: true, underline: true, color: '#1f4e79', backgroundColor: '#fff3a3', fontSize: '30pt', fontFamily: 'Georgia', textAlign: 'center' } };
      const html = config(levels) + '<h1>Alpha</h1><h2>Beta</h2><p>texte</p>';
      await ExportEngines.ensure('pptx');
      // Le chemin du bouton Exporter : le HTML résolu (ExportCommon.resolveRecord), pas celui du modèle.
      const blob = await PptxExport.fromHtml(await ReaderMode.preview(html, null, {}), { title: 'Essai' });
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const xml = new DOMParser().parseFromString(await zip.file('ppt/slides/slide1.xml').async('string'), 'application/xml');
      const runOf = text => Array.from(xml.getElementsByTagName('a:r')).find(r => r.getElementsByTagName('a:t')[0].textContent === text);
      const bad = [];
      const alpha = runOf('Alpha');
      const beta = runOf('Beta');
      const attr = (run, name) => run.getElementsByTagName('a:rPr')[0].getAttribute(name);
      const child = (run, tag, name) => { const el = run.getElementsByTagName(tag)[0]; return el ? (name ? el.getAttribute(name) : true) : null; };
      if (!alpha || !beta) return { pass: false, notes: 'titres introuvables dans la diapositive' };
      if (attr(alpha, 'sz') !== '3000' || attr(alpha, 'i') !== '1' || attr(alpha, 'u') !== 'sng') bad.push('Alpha : ' + alpha.getElementsByTagName('a:rPr')[0].outerHTML.slice(0, 160));
      if (child(alpha, 'a:srgbClr', 'val') !== '1F4E79' || child(alpha, 'a:latin', 'typeface') !== 'Georgia') bad.push('Alpha : couleur ou police');
      if (alpha.getElementsByTagName('a:highlight')[0] === undefined || alpha.getElementsByTagName('a:highlight')[0].getElementsByTagName('a:srgbClr')[0].getAttribute('val') !== 'FFF3A3') bad.push('Alpha : surlignage');
      if (alpha.parentNode.getElementsByTagName('a:pPr')[0].getAttribute('algn') !== 'ctr') bad.push('Alpha : alignement');
      if (attr(beta, 'sz') !== '2000' || attr(beta, 'i') || attr(beta, 'u') || child(beta, 'a:srgbClr')) bad.push('Beta : ' + beta.getElementsByTagName('a:rPr')[0].outerHTML.slice(0, 160));
      return result(bad);
    });

  add('hs_the_highlight_marks_the_text_in_the_pdf_and_the_word_but_not_the_number',
    'Le surlignage du style entoure le texte du titre dans le PDF et le Word, sans surligner le numéro (comme dans l\'éditeur, où le numéro est un pseudo-élément)',
    async (h) => {
      await h.resetEditor();
      const html = config({ 1: { backgroundColor: '#fff3a3' } }, 'numeric') + '<h1>Alpha</h1>';
      const bad = [];
      const pdf = await h.exportPdfContent(html);
      const runs = h.findTextBlocks(pdf.content, b => b._isHeading)[0].text;
      if (runs[0].background || runs[1].background !== '#fff3a3') bad.push('PDF : ' + JSON.stringify(runs));
      const parts = await h.exportDocxParts(html);
      const d = h.docxParagraphs(parts.doc).filter(p => p.text)[0];
      if (d.runs[0].highlight || d.runs[1].highlight !== 'FFF3A3') bad.push('Word : ' + JSON.stringify(d.runs.map(r => r.highlight)));
      return result(bad);
    });

  add('hs_a_document_without_a_style_reads_and_exports_as_before',
    'Sans style, `ReaderMode.preview` rend les titres tels quels (aucun `style` ajouté), le PDF et le Word gardent leurs titres d\'origine',
    async (h) => {
      await h.resetEditor();
      const html = config(null, 'numeric') + '<h1>Alpha</h1><h2 style="text-align: right">Beta</h2><p>texte</p>';
      const bad = [];
      const resolved = await ReaderMode.preview(html, null, {});
      const wrapper = document.createElement('div');
      wrapper.innerHTML = resolved;
      if (wrapper.querySelector('h1').hasAttribute('style')) bad.push('le titre 1 a reçu un style : ' + wrapper.querySelector('h1').getAttribute('style'));
      if (wrapper.querySelector('h2').getAttribute('style') !== 'text-align: right') bad.push('le titre 2 a changé : ' + wrapper.querySelector('h2').getAttribute('style'));
      const pdf = await h.exportPdfContent(html);
      const blocks = h.findTextBlocks(pdf.content, b => b._isHeading);
      const marker = blocks[0].text[0];
      if (JSON.stringify(marker) !== JSON.stringify({ text: '1) ', fontSize: 24 })) bad.push('marqueur PDF : ' + JSON.stringify(marker));
      const parts = await h.exportDocxParts(html);
      const run = h.docxParagraphs(parts.doc).filter(p => p.text)[0].runs[0];
      if (!(run.text === '1) ' && run.bold && run.sizeHalfPt === 48 && run.color === 'auto' && !run.italics && !run.underline && !run.font)) bad.push('marqueur Word : ' + JSON.stringify(run));
      return result(bad);
    });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.headingStyles = cases;
})();
