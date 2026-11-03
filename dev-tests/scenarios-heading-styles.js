// Suite "headingStyles" - le style d'un niveau de titre, pris d'après la sélection (js/heading-styles.js, deux lignes du menu « Titre » : « Mettre à jour « Titre N » d'après la sélection » et
// « Rétablir le style d'origine »), demande d'Antoine du 22/10 lancée le 02/11 : « style des titres d'après la sélection », comme « Mettre à jour Titre 2 pour correspondre à la sélection » de Word.
//  - la mise à jour : le style est écrit dans le modèle (`data-level-styles` du nœud de numérotation), tous les titres du niveau et eux seuls le prennent, dans l'éditeur, y compris un titre neuf ;
//    la mise en forme à la main des réglages que la sélection pose est retirée des titres du niveau, le gras, les liens et le reste restent ; un réglage qui varie dans la sélection ne change rien ;
//  - l'alignement du titre l'emporte sur celui du style, une marque de texte sur la mise en forme du titre ; le surlignage passe par un <span> (jamais la ligne entière) ;
//  - les deux lignes : libellé avec le niveau, grisées hors d'un titre, dans plusieurs titres et sans style à rétablir, avec leur raison, en français et en anglais ; la barre montre la police et la taille du style ;
//  - Ctrl+Z et Ctrl+Y : une mise à jour (style et titres retouchés) ou un rétablissement est UN pas ; le suivi des modifications n'en fait pas des suggestions ;
//  - le même style partout : la Lecture, l'impression, le PDF (le numéro du titre compris), le Word, le HTML ; un document sans style sort comme avant ; un texte JSON abîmé est ignoré ;
//  - le style suit le modèle : le HTML enregistré le porte, changer la numérotation des titres le garde.
//  - le style DU DOCUMENT (lot 3, demande d'Antoine du 03/11 : « comme pour les couleurs on doit pouvoir voir les styles liés aux modèles et ceux liés au document ») : la clé `headingStyles` des réglages du
//    document (ligne réservée de la table des modèles) ; un modèle sans style de ce niveau prend celui du document, niveau par niveau ; l'éditeur, la Lecture, le PDF, le Word et le diaporama le montrent, et il
//    n'est écrit dans aucun modèle ; « Mettre à jour » et « Rétablir » du bloc partagé : un seul pas de Ctrl+Z, la mise en forme à la main retirée sauf dans un modèle qui a son propre style du niveau, Grist qui
//    reçoit l'écriture, un refus qui se dit, une autre personne qui change le style (l'éditeur se met à jour, Ctrl+Z n'écrase pas son changement) ; la mise à jour du modèle part du style que le titre montre ;
//    le menu montre les deux blocs (intitulé et infobulle, aperçu des niveaux, « Aucun », le style du document qu'un style du modèle remplace), en français et en anglais.
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

  // === Le style du document (lot 3) ===
  const TABLE = 'Publipostage_Modeles';
  const stub = () => window.__gristStub;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const statusText = () => byId('status-msg').textContent;
  const OCEAN = { name: 'Océan', colors: { bg: '#ffffff', text: '#1e2a35', title: '#0b3c5d', accent1: '#1d70b8', accent2: '#00a3a3', accent3: '#5aa9e6', accent4: '#f2a541', accent5: '#6c8ead', accent6: '#3bb273' }, fonts: { title: 'Georgia', body: 'Calibri' } };
  // La ligne réservée aux réglages du document dans la table des modèles (ce que Grist garde) : ses lignes, une au plus.
  const settingsRows = () => { const t = stub().state.rows[TABLE]; return t && t.TypeModele ? t.id.filter((id, i) => t.TypeModele[i] === 'reglages').map(id => stub().getRow(TABLE, id)) : []; };
  const settingsJson = () => { const rows = settingsRows(); try { return rows.length ? JSON.parse(rows[0].Contenu) : null; } catch (e) { return 'illisible'; } };
  async function resetDocumentSettings() {
    if (!settingsRows().length && Templates.getDocumentSetting('headingStyles') === undefined) return;
    for (const row of settingsRows()) await stub().applyUserActions([['RemoveRecord', TABLE, row.id]]);
    await Templates.loadAll();
  }
  // Attend que Grist ait reçu l'écriture des réglages du document.
  async function written(check) {
    for (let i = 0; i < 40; i += 1) { if (check(settingsJson())) return true; await sleep(50); }
    return false;
  }
  async function docSetup(h, markup) {
    await h.resetEditor();
    await resetDocumentSettings();
    ActionHistory.reset();
    if (markup) await load(markup);
  }
  async function docCleanup(h) {
    I18n.setLang('fr');
    await h.resetEditor();
    await resetDocumentSettings();
    ActionHistory.reset();
  }
  const sharedOf = () => Templates.getDocumentSetting('headingStyles');
  const SHARED = { 1: { color: '#1f4e79', fontSize: '18pt', fontFamily: 'Georgia' }, 2: { italic: true } };
  // Toutes les lignes et les éléments des deux blocs du menu Titre.
  const allRows = () => ({
    update: updateRow(), reset: resetRow(), documentUpdate: byId('v2-btn-heading-style-doc-update'), documentReset: byId('v2-btn-heading-style-doc-reset'),
    modelScope: byId('v2-heading-scope-model'), documentScope: byId('v2-heading-scope-document'), modelLevels: byId('v2-heading-levels-model'), documentLevels: byId('v2-heading-levels-document'),
  });
  const chips = box => Array.from(box.querySelectorAll('.pp-hs-chip'));
  const undoOnce = async () => { press('z'); await sleep(150); };
  const redoOnce = async () => { press('y'); await sleep(150); };

  add('hs_doc_a_shared_style_reaches_a_model_without_its_own_level_by_level_in_the_editor_the_reader_and_the_exports',
    'Le style écrit dans les réglages du document est montré par l\'éditeur, la Lecture, le PDF et le Word d\'un modèle qui n\'en a pas, sans rien écrire dans ce modèle ; un modèle qui a son propre style du niveau 1 le garde (niveau par niveau) et prend le niveau 2 du document',
    async (h) => {
      try {
        await docSetup(h, '<h1>Alpha</h1><h2>Beta</h2><p>texte</p>');
        const bad = [];
        const before = Editor.getHTML();
        if (!(await Templates.updateDocumentSettings({ headingStyles: SHARED }))) bad.push('les réglages n\'ont pas été écrits');
        await sleep(100);
        const one = paint(headings(1)[0]);
        const two = paint(headings(2)[0]);
        if (one.size !== '24px' || one.color !== 'rgb(31, 78, 121)' || !/Georgia/.test(one.family)) bad.push('éditeur, titre 1 : ' + JSON.stringify(one));
        if (two.italic !== 'italic') bad.push('éditeur, titre 2 : ' + JSON.stringify(two));
        if (Editor.getHTML() !== before || levelStyles()) bad.push('le modèle a reçu le style du document : ' + Editor.getHTML());
        const reader = await h.renderReaderMode(Editor.getHTML());
        const read = paint(reader.querySelector('h1'));
        document.getElementById('reader-container').style.display = 'none';
        if (read.size !== '24px' || read.color !== 'rgb(31, 78, 121)' || !/Georgia/.test(read.family)) bad.push('Lecture : ' + JSON.stringify(read));
        const pdf = await h.exportPdfContent(Editor.getHTML());
        const blocks = h.findTextBlocks(pdf.content, b => b._isHeading);
        const runs = Array.isArray(blocks[0].text) ? blocks[0].text : [{ text: blocks[0].text }];
        if (!runs.length || !runs.every(r => r.fontSize === 18 && r.color === '#1f4e79')) bad.push('PDF, titre 1 : ' + JSON.stringify(runs));
        const beta = Array.isArray(blocks[1].text) ? blocks[1].text : [];
        if (!beta.length || !beta.every(r => r.italics === true)) bad.push('PDF, titre 2 : ' + JSON.stringify(beta));
        const parts = await h.exportDocxParts(Editor.getHTML());
        const [d1, d2] = h.docxParagraphs(parts.doc).filter(p => p.text);
        if (!d1.runs.every(r => r.sizeHalfPt === 36 && r.color === '1F4E79' && r.font === 'Georgia')) bad.push('Word, titre 1 : ' + JSON.stringify(d1.runs));
        if (!d2.runs.every(r => r.italics)) bad.push('Word, titre 2 : ' + JSON.stringify(d2.runs));
        // Un modèle qui a son propre style du niveau 1 : le sien l'emporte pour ce niveau, le niveau 2 vient du document.
        await load(config({ 1: { color: '#c0392b' } }) + '<h1>Alpha</h1><h2>Beta</h2><p>texte</p>');
        const own = paint(headings(1)[0]);
        if (own.color !== 'rgb(192, 57, 43)' || own.size !== DEFAULT_H1_PX || /Georgia/.test(own.family)) bad.push('le style du modèle ne l\'emporte pas : ' + JSON.stringify(own));
        if (paint(headings(2)[0]).italic !== 'italic') bad.push('le titre 2 ne prend pas celui du document');
        return result(bad);
      } finally { await docCleanup(h); }
    });

  add('hs_doc_update_writes_the_shared_style_strips_the_hand_formatting_and_is_one_undo_step',
    '« Mettre à jour » du bloc partagé : le style (police, taille, couleur, italique) entre dans les réglages du document et dans Grist, pas dans le modèle ; les titres du niveau le prennent, la mise en forme à la main est retirée (le gras et le lien restent) ; le coin d\'état le dit ; UN Ctrl+Z défait tout (le HTML revient octet pour octet, Grist aussi), Ctrl+Y le remet',
    async (h) => {
      try {
        await docSetup(h);
        await styledByHand();
        mark('Deux', { color: '#c0392b' });
        await selectText('Un');
        await sleep(600);
        const start = Editor.getHTML();
        const bad = [];
        const done = HeadingStyles.update(editor(), 'document');
        await sleep(150);
        const updated = Editor.getHTML();
        const expected = HeadingStyles.normalize({ 1: STYLE });
        if (!done) bad.push('update a rendu faux');
        if (!same(HeadingStyles.documentStyles(), expected)) bad.push('style du document : ' + JSON.stringify(HeadingStyles.documentStyles()));
        if (levelStyles()) bad.push('le modèle a reçu un style : ' + JSON.stringify(levelStyles()));
        headings(1).forEach((el, i) => {
          const p = paint(el);
          if (p.size !== '24px' || p.color !== 'rgb(31, 78, 121)' || p.italic !== 'italic' || !/Georgia/.test(p.family)) bad.push('titre 1 n° ' + (i + 1) + ' : ' + JSON.stringify(p));
        });
        if (marksOf('Un') !== '' || marksOf('Deux') !== '') bad.push('marques à la main restantes : ' + marksOf('Un') + ' / ' + marksOf('Deux'));
        if (marksOf('gras') !== 'bold' || !/^link/.test(marksOf('lien'))) bad.push('le gras ou le lien a bougé');
        if (!/pour tout le document/.test(statusText())) bad.push('le coin d\'état ne le dit pas : ' + statusText());
        if (!(await written(json => json && same(HeadingStyles.normalize(json.headingStyles), expected)))) bad.push('Grist n\'a pas reçu le style : ' + JSON.stringify(settingsJson()));
        if (start === updated) bad.push('le texte n\'a pas changé');
        await undoOnce();
        if (Editor.getHTML() !== start) bad.push('Ctrl+Z ne rend pas le texte de départ');
        if (sharedOf() !== undefined) bad.push('Ctrl+Z ne retire pas le style du document : ' + JSON.stringify(sharedOf()));
        if (!(await written(json => !json || !('headingStyles' in json)))) bad.push('Grist n\'a pas reçu le retour : ' + JSON.stringify(settingsJson()));
        await redoOnce();
        if (Editor.getHTML() !== updated) bad.push('Ctrl+Y ne remet pas le texte mis à jour');
        if (!same(HeadingStyles.documentStyles(), expected)) bad.push('Ctrl+Y ne remet pas le style du document : ' + JSON.stringify(sharedOf()));
        if (!(await written(json => json && same(HeadingStyles.normalize(json.headingStyles), expected)))) bad.push('Grist n\'a pas reçu le rétablissement');
        return result(bad);
      } finally { await docCleanup(h); }
    });

  add('hs_doc_update_in_a_model_with_its_own_level_changes_only_the_document_and_leaves_the_titles_alone',
    'Un modèle qui a son propre style du niveau 1 : « Mettre à jour » du bloc partagé part du style que le titre montre (celui du modèle) et y ajoute la sélection, écrit le document, ne retire aucune mise en forme à la main, ne change pas l\'aspect du modèle, le dit ; UN Ctrl+Z retire le style du document',
    async (h) => {
      try {
        await docSetup(h, config({ 1: { color: '#c0392b' } }) + SAMPLE);
        mark('Un', { fontFamily: 'Georgia', fontSize: '18pt' });
        await selectText('Un');
        await sleep(600);
        const start = Editor.getHTML();
        const bad = [];
        const look = headings(1).map(el => JSON.stringify(paint(el)));
        const done = HeadingStyles.update(editor(), 'document');
        await sleep(150);
        if (!done) bad.push('update a rendu faux');
        if (!same(HeadingStyles.documentStyles(), HeadingStyles.normalize({ 1: { color: '#c0392b', fontSize: '18pt', fontFamily: 'Georgia' } }))) bad.push('style du document : ' + JSON.stringify(sharedOf()));
        if (!/Georgia/.test(marksOf('Un'))) bad.push('la mise en forme à la main a été retirée malgré le style du modèle : ' + marksOf('Un'));
        if (!same(headings(1).map(el => JSON.stringify(paint(el))), look)) bad.push('l\'aspect du modèle a changé');
        if (Editor.getHTML() !== start) bad.push('le texte du modèle a changé');
        if (!/Ce modèle a le sien/.test(statusText())) bad.push('le coin d\'état ne dit pas que le modèle l\'emporte : ' + statusText());
        await undoOnce();
        if (sharedOf() !== undefined) bad.push('Ctrl+Z ne retire pas le style du document : ' + JSON.stringify(sharedOf()));
        if (Editor.getHTML() !== start) bad.push('Ctrl+Z a changé le texte');
        return result(bad);
      } finally { await docCleanup(h); }
    });

  add('hs_doc_restore_removes_the_shared_level_greys_out_without_one_and_is_one_undo_step',
    '« Rétablir » du bloc partagé retire le style du niveau du titre visé des réglages du document (Grist le reçoit), les titres reprennent l\'aspect de leur balise ; grisée sans style partagé à ce niveau ; UN Ctrl+Z le remet, Ctrl+Y le retire ; le style du modèle n\'est pas touché',
    async (h) => {
      try {
        await docSetup(h, '<h1>Un</h1><h2>Deux</h2><p>texte</p>');
        const bad = [];
        await Templates.updateDocumentSettings({ headingStyles: SHARED });
        await sleep(100);
        await caretIn('Un');
        HeadingStyles.syncRows(editor(), allRows());
        if (allRows().documentReset.getAttribute('aria-disabled') !== 'false') bad.push('« Rétablir » partagé est grisée avec un style à ce niveau');
        const done = HeadingStyles.reset(editor(), 'document');
        await sleep(150);
        if (!done) bad.push('reset a rendu faux');
        if (!same(sharedOf(), { 2: { italic: true } })) bad.push('niveau 1 non retiré : ' + JSON.stringify(sharedOf()));
        const p = paint(headings(1)[0]);
        if (p.size !== DEFAULT_H1_PX || p.color === 'rgb(31, 78, 121)' || /Georgia/.test(p.family)) bad.push('le titre 1 n\'a pas retrouvé sa balise : ' + JSON.stringify(p));
        if (paint(headings(2)[0]).italic !== 'italic') bad.push('le niveau 2 a bougé');
        if (!(await written(json => json && json.headingStyles && !json.headingStyles['1'] && json.headingStyles['2']))) bad.push('Grist n\'a pas reçu le retrait : ' + JSON.stringify(settingsJson()));
        HeadingStyles.syncRows(editor(), allRows());
        const rows = allRows();
        if (rows.documentReset.getAttribute('aria-disabled') !== 'true' || rows.documentReset.title !== 'Ce niveau de titre n’a pas de style partagé') bad.push('« Rétablir » partagé non grisée sans style : ' + rows.documentReset.getAttribute('aria-disabled') + ' / ' + rows.documentReset.title);
        if (HeadingStyles.reset(editor(), 'document') !== false) bad.push('reset sans style partagé a agi');
        await undoOnce();
        if (!same(sharedOf(), SHARED)) bad.push('Ctrl+Z ne remet pas le style : ' + JSON.stringify(sharedOf()));
        await redoOnce();
        if (!same(sharedOf(), { 2: { italic: true } })) bad.push('Ctrl+Y ne le retire pas : ' + JSON.stringify(sharedOf()));
        return result(bad);
      } finally { await docCleanup(h); }
    });

  add('hs_doc_the_model_update_starts_from_the_shared_style_the_title_already_shows',
    '« Mettre à jour » du modèle sur un niveau que le document règle déjà : le style du modèle garde l\'aspect du titre (le style du document) et y ajoute la sélection (l\'italique), le document n\'est pas touché, l\'aspect de tous les titres du niveau est inchangé',
    async (h) => {
      try {
        await docSetup(h);
        await Templates.updateDocumentSettings({ headingStyles: { 1: { color: '#1f4e79', fontSize: '18pt', fontFamily: 'Georgia' } } });
        await load('<h1>Un</h1><h1>Deux</h1><p>texte</p>');
        const bad = [];
        const before = headings(1).map(el => paint(el));
        editor().chain().focus().setTextSelection(range('Un')).setMark('italic').run();
        await sleep(60);
        await selectText('Un');
        if (!HeadingStyles.update(editor())) bad.push('update a rendu faux');
        await sleep(120);
        if (!same(levelStyles(), HeadingStyles.normalize({ 1: { italic: true, color: '#1f4e79', fontSize: '18pt', fontFamily: 'Georgia' } }))) bad.push('style du modèle : ' + JSON.stringify(levelStyles()));
        if (!same(sharedOf(), { 1: { color: '#1f4e79', fontSize: '18pt', fontFamily: 'Georgia' } })) bad.push('le document a été touché : ' + JSON.stringify(sharedOf()));
        const after = headings(1).map(el => paint(el));
        ['size', 'color', 'family'].forEach((k) => { after.forEach((p, i) => { if (p[k] !== before[i][k]) bad.push('titre ' + (i + 1) + ' : ' + k + ' ' + before[i][k] + ' -> ' + p[k]); }); });
        if (after[0].italic !== 'italic' || after[1].italic !== 'italic') bad.push('l\'italique manque : ' + after.map(p => p.italic).join());
        return result(bad);
      } finally { await docCleanup(h); }
    });

  add('hs_doc_another_persons_change_reaches_the_open_editor_and_undo_never_overwrites_it',
    'Une autre personne change le style du document : l\'éditeur ouvert le montre sans que le texte change (un seul avis par changement, aucun quand la relecture n\'apporte rien) ; si elle change le même niveau après un geste, Ctrl+Z n\'écrit rien et le dit, si elle change un autre niveau, Ctrl+Z rend le niveau du geste et garde le sien',
    async (h) => {
      try {
        await docSetup(h, SAMPLE);
        const bad = [];
        let events = 0;
        const on = () => { events += 1; };
        document.addEventListener('pp:documentSettingsChanged', on);
        try {
          await Templates.updateDocumentSettings({ headingStyles: { 1: { color: '#1f4e79' } } });
          await written(json => json && json.headingStyles);
          if (events < 1) bad.push('aucun avis pour l\'écriture d\'ici');
          const html = Editor.getHTML();
          if (paint(headings(1)[0]).color !== 'rgb(31, 78, 121)') bad.push('éditeur, avant : ' + paint(headings(1)[0]).color);
          // Une autre personne la change : le document se relit.
          let before = events;
          await stub().applyUserActions([['UpdateRecord', TABLE, settingsRows()[0].id, { Contenu: JSON.stringify({ headingStyles: { 1: { color: '#c0392b' } } }) }]]);
          await Templates.loadAll();
          await sleep(60);
          if (events !== before + 1) bad.push('avis pour le changement d\'une autre personne : ' + (events - before));
          if (paint(headings(1)[0]).color !== 'rgb(192, 57, 43)') bad.push('l\'éditeur ne montre pas le style de l\'autre personne : ' + paint(headings(1)[0]).color);
          if (Editor.getHTML() !== html) bad.push('le texte a changé');
          before = events;
          await Templates.loadAll();
          if (events !== before) bad.push('une relecture qui n\'apporte rien a prévenu');
          // Un geste, puis la même clé changée par l'autre : Ctrl+Z n'écrase pas.
          await caretIn('Un');
          mark('Un', { fontSize: '18pt' });
          await selectText('Un');
          await sleep(600);
          if (!HeadingStyles.update(editor(), 'document')) bad.push('update a rendu faux');
          await sleep(150);
          await Templates.updateDocumentSettings({ headingStyles: { 1: { color: '#0b6e4f' }, 2: { italic: true } } });
          await undoOnce();
          if (!same(sharedOf(), { 1: { color: '#0b6e4f' }, 2: { italic: true } })) bad.push('Ctrl+Z a écrasé le changement de l\'autre personne : ' + JSON.stringify(sharedOf()));
          if (!/a changé depuis/.test(statusText())) bad.push('le coin d\'état ne dit pas le conflit : ' + statusText());
          await redoOnce();
          // Un autre niveau changé par l'autre : le niveau du geste est rendu, le sien est gardé.
          await resetDocumentSettings();
          await Templates.updateDocumentSettings({ headingStyles: { 1: { color: '#1f4e79' } } });
          await written(json => json && json.headingStyles);
          await load('<h1>Un</h1><h2>Deux</h2><p>texte</p>');
          ActionHistory.reset();
          await caretIn('Un');
          mark('Un', { fontSize: '16pt' });
          await selectText('Un');
          await sleep(600);
          HeadingStyles.update(editor(), 'document');
          await sleep(150);
          await Templates.updateDocumentSettings({ headingStyles: Object.assign({}, sharedOf(), { 2: { italic: true } }) });
          await undoOnce();
          if (!same(sharedOf(), { 1: { color: '#1f4e79' }, 2: { italic: true } })) bad.push('Ctrl+Z n\'a pas rendu le niveau 1 en gardant le niveau 2 : ' + JSON.stringify(sharedOf()));
        } finally { document.removeEventListener('pp:documentSettingsChanged', on); }
        return result(bad);
      } finally { await docCleanup(h); }
    });

  add('hs_doc_a_refused_write_is_said_and_the_last_confirmed_style_comes_back',
    'Grist refuse d\'écrire le style du document : le coin d\'état le dit (et que Ctrl+Z rend la mise en forme retirée), l\'éditeur retrouve le dernier style confirmé ; Ctrl+Z rend la mise en forme à la main des titres sans rien écrire de faux',
    async (h) => {
      const original = grist.docApi.applyUserActions;
      const warn = console.warn;
      try {
        await docSetup(h, SAMPLE);
        const bad = [];
        await Templates.updateDocumentSettings({ headingStyles: { 1: { color: '#1f4e79' } } });
        await written(json => json && json.headingStyles);
        await load(SAMPLE);
        mark('Un', { fontSize: '18pt' });
        await selectText('Un');
        await sleep(600);
        const start = Editor.getHTML();
        grist.docApi.applyUserActions = async () => { throw new Error('refusé'); };
        console.warn = () => {};
        const done = HeadingStyles.update(editor(), 'document');
        await sleep(400);
        grist.docApi.applyUserActions = original;
        console.warn = warn;
        if (!done) bad.push('update a rendu faux');
        if (!/n’a pas pu être écrit/.test(statusText()) || !/Ctrl\+Z/.test(statusText())) bad.push('le refus n\'est pas dit : ' + statusText());
        if (!same(sharedOf(), { 1: { color: '#1f4e79' } })) bad.push('le dernier style confirmé n\'est pas revenu : ' + JSON.stringify(sharedOf()));
        if (paint(headings(1)[0]).size !== DEFAULT_H1_PX) bad.push('l\'éditeur montre encore le style refusé : ' + paint(headings(1)[0]).size);
        await undoOnce();
        if (Editor.getHTML() !== start) bad.push('Ctrl+Z ne rend pas le texte de départ');
        if (!same(sharedOf(), { 1: { color: '#1f4e79' } })) bad.push('Ctrl+Z a écrit un style faux : ' + JSON.stringify(sharedOf()));
        if (/a changé depuis/.test(statusText())) bad.push('Ctrl+Z annonce un conflit qui n\'existe pas : ' + statusText());
        return result(bad);
      } finally {
        grist.docApi.applyUserActions = original;
        console.warn = warn;
        await docCleanup(h);
      }
    });

  add('hs_doc_the_menu_shows_the_model_styles_and_the_shared_styles_apart_in_both_languages',
    'Le menu Titre : deux blocs (« Styles de titres du modèle » / « partagés ») avec l\'infobulle de leur portée ; sans style, « Aucun » ; avec des styles, une pastille par niveau stylé dessinée avec sa couleur, son infobulle en mots, celle du document que le style du modèle remplace en pointillés ; les lignes du bloc partagé disent le niveau et se grisent avec leur raison ; rien n\'est redessiné quand rien ne change',
    async (h) => {
      try {
        await docSetup(h, '<h1>Un</h1><h2>Deux</h2><p>texte</p>');
        const english = I18n.getLang() === 'en';
        const t = (fr, en) => (english ? en : fr);
        const bad = [];
        const sync = () => HeadingStyles.syncRows(editor(), allRows());
        await caretIn('texte');
        sync();
        let rows = allRows();
        if (rows.modelScope.textContent !== t('Styles de titres du modèle', 'Template heading styles') || rows.modelScope.title !== t('Avec ce modèle seulement', 'With this template only')) bad.push('bloc du modèle : ' + rows.modelScope.textContent + ' / ' + rows.modelScope.title);
        if (rows.documentScope.textContent !== t('Styles de titres partagés', 'Shared heading styles') || rows.documentScope.title !== t('Pour tous les modèles de ce document Grist, partagés avec l’équipe', 'For every template in this Grist document, shared with the team')) bad.push('bloc partagé : ' + rows.documentScope.textContent + ' / ' + rows.documentScope.title);
        [rows.modelLevels, rows.documentLevels].forEach((box, i) => { if (chips(box).length || box.textContent !== t('Aucun', 'None')) bad.push('bloc ' + i + ' sans style : ' + box.textContent); });
        if (rows.documentUpdate.getAttribute('aria-disabled') !== 'true' || rows.documentReset.getAttribute('aria-disabled') !== 'true' || !rows.documentUpdate.title) bad.push('lignes partagées non grisées hors d\'un titre');
        if (rows.documentUpdate.textContent !== t('Mettre à jour le style de titre partagé d’après la sélection', 'Update the shared heading style to match the selection')) bad.push('libellé hors titre : ' + rows.documentUpdate.textContent);
        // Un style du modèle (niveau 1) et du document (niveaux 1 et 2).
        await Templates.updateDocumentSettings({ headingStyles: SHARED });
        await load(config({ 1: { color: '#c0392b', italic: true, backgroundColor: '#fff3a3' } }) + '<h1>Un</h1><h2>Deux</h2><p>texte</p>');
        await caretIn('Deux');
        sync();
        rows = allRows();
        const model = chips(rows.modelLevels);
        const doc = chips(rows.documentLevels);
        if (model.length !== 1 || model[0].textContent !== t('Titre 1', 'Heading 1') || model[0].style.color !== 'rgb(192, 57, 43)' || model[0].style.fontStyle !== 'italic' || model[0].style.backgroundColor !== 'rgb(255, 243, 163)') bad.push('pastilles du modèle : ' + model.map(c => c.textContent + '|' + c.getAttribute('style')).join(' ; '));
        if (!/ — /.test(model[0].title) || model[0].title.indexOf(t('remplace le style partagé de ce niveau', 'replaces the shared style of this level')) === -1) bad.push('infobulle du modèle : ' + model[0].title);
        if (doc.length !== 2 || doc[0].textContent !== t('Titre 1', 'Heading 1') || doc[1].textContent !== t('Titre 2', 'Heading 2')) bad.push('pastilles partagées : ' + doc.map(c => c.textContent).join());
        if (doc.length === 2) {
          if (!doc[0].classList.contains('is-masked') || doc[1].classList.contains('is-masked')) bad.push('le niveau remplacé n\'est pas marqué : ' + doc.map(c => c.className).join(' / '));
          if (doc[0].title !== 'Titre 1 · Georgia · 18pt · #1f4e79 — remplacé dans ce modèle par son propre style' && doc[0].title !== 'Heading 1 · Georgia · 18pt · #1f4e79 — replaced in this template by its own style') bad.push('infobulle du niveau 1 : ' + doc[0].title);
          if (doc[1].title !== t('Titre 2 · Italique', 'Heading 2 · Italic')) bad.push('infobulle du niveau 2 : ' + doc[1].title);
          if (getComputedStyle(doc[0]).borderTopStyle !== 'dashed' || getComputedStyle(doc[1]).borderTopStyle !== 'solid') bad.push('bordures : ' + getComputedStyle(doc[0]).borderTopStyle + ' / ' + getComputedStyle(doc[1]).borderTopStyle);
          if (!/Georgia/.test(getComputedStyle(doc[0]).fontFamily) || getComputedStyle(doc[1]).fontStyle !== 'italic') bad.push('pastilles non dessinées avec le style');
        }
        // Dans le titre 2 : le bloc partagé dit le niveau, « Rétablir » du modèle reste grisée (le modèle n'a pas de style de niveau 2), celle du document est allumée.
        if (rows.documentUpdate.textContent !== t('Mettre à jour « Titre 2 » (partagé) d’après la sélection', 'Update shared “Heading 2” to match the selection') || rows.documentUpdate.getAttribute('aria-disabled') !== 'false') bad.push('« Mettre à jour » partagé dans le titre 2 : ' + rows.documentUpdate.textContent + ' / ' + rows.documentUpdate.getAttribute('aria-disabled'));
        if (rows.documentReset.textContent !== t('Rétablir le style d’origine de « Titre 2 » (partagé)', 'Restore the original style of shared “Heading 2”') || rows.documentReset.getAttribute('aria-disabled') !== 'false') bad.push('« Rétablir » partagé dans le titre 2 : ' + rows.documentReset.textContent + ' / ' + rows.documentReset.getAttribute('aria-disabled'));
        if (rows.reset.getAttribute('aria-disabled') !== 'true') bad.push('« Rétablir » du modèle allumée sans style de niveau 2');
        // Rien ne change : rien n'est redessiné (mêmes pastilles).
        sync();
        if (!doc.every((chip, i) => chips(allRows().documentLevels)[i] === chip)) bad.push('un aperçu inchangé a été redessiné');
        // Le style du document change : l'aperçu suit.
        await Templates.updateDocumentSettings({ headingStyles: { 2: { italic: true } } });
        sync();
        if (chips(allRows().documentLevels).length !== 1 || chips(allRows().documentLevels)[0].textContent !== t('Titre 2', 'Heading 2')) bad.push('l\'aperçu ne suit pas le document');
        return result(bad);
      } finally { await docCleanup(h); }
    });
  cases.push(Object.assign({}, cases[cases.length - 1], {
    id: 'hs_doc_the_menu_shows_the_model_styles_and_the_shared_styles_apart_in_english',
    lang: 'en',
  }));

  add('hs_doc_clicking_the_shared_rows_updates_and_restores_through_the_toolbar_wiring',
    'Le clic sur les lignes du bloc partagé (câblage de la barre, comme la souris) met à jour puis rétablit le style du document ; une ligne grisée ne fait rien',
    async (h) => {
      try {
        await docSetup(h);
        await styledByHand();
        const bad = [];
        const click = async (row) => {
          HeadingStyles.syncRows(editor(), allRows());
          row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          await sleep(150);
        };
        await click(allRows().documentReset);
        if (sharedOf() !== undefined) bad.push('« Rétablir » partagé grisée a pourtant agi');
        await click(allRows().documentUpdate);
        if (!sharedOf() || !sharedOf()[1]) bad.push('le clic sur « Mettre à jour » partagé n\'a rien écrit');
        if (levelStyles()) bad.push('le clic partagé a écrit dans le modèle');
        await selectText('Trois');
        await click(allRows().documentReset);
        if (sharedOf() !== undefined) bad.push('« Rétablir » partagé n\'a pas retiré le style : ' + JSON.stringify(sharedOf()));
        return result(bad);
      } finally { await docCleanup(h); }
    });

  add('hs_doc_the_slide_theme_keeps_the_shared_font_and_color_over_its_own',
    'Dans une présentation à thème, la police et la couleur du style partagé d\'un niveau l\'emportent sur celles du thème, comme le style du modèle ; un niveau sans style garde celles du thème',
    async (h) => {
      try {
        await docSetup(h);
        const bad = [];
        await Templates.updateDocumentSettings({ headingStyles: { 1: { color: '#c0392b' } } });
        const host = document.createElement('div');
        host.innerHTML = SlideTheme.forOutput('<h1>Un</h1><h2>Deux</h2>', OCEAN);
        const h1 = host.querySelector('h1');
        const h2 = host.querySelector('h2');
        if (h1.style.color !== '' || !/Georgia/.test(h1.style.fontFamily)) bad.push('titre 1 : ' + h1.getAttribute('style'));
        if (h2.style.color === '' || !/Georgia/.test(h2.style.fontFamily)) bad.push('titre 2 : ' + h2.getAttribute('style'));
        return result(bad);
      } finally { await docCleanup(h); }
    });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.headingStyles = cases;
})();
