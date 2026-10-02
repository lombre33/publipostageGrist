// Suite "formatPainter" - pinceau de mise en forme (js/format-painter.js, css/format-painter.css, bouton #v2-btn-format-painter, touches Alt+Maj+C « Reproduire la mise en forme » et
// Alt+Maj+V « Appliquer la mise en forme »), demande d'Antoine du 2026-10-02, point 8 : « ajout d'un bouton pour copier/coller la mise en forme ».
//  - le bouton : après le surlignage, icône, nom et infobulle en français et en anglais, la touche dans l'infobulle ;
//  - ce qui est copié et posé : la mise en forme du caractère (gras, italique, souligné, barré, police, taille, couleur, surlignage) REMPLACE celle de la cible, un lien ou un commentaire
//    reste ; celle du paragraphe (alignement, niveau de titre) vient d'un curseur ou d'un paragraphe entier et ne va que sur les paragraphes peints en entier ;
//  - une application est une seule étape d'historique ; rien à peindre (curseur seul, image) ne la consomme pas ;
//  - armé d'un clic (une application), d'un double-clic (reste armé), arrêté par Échap ou par un nouveau clic ; grisé en e-mail et en macro-modèle, et un pinceau armé s'arrête ;
//  - les touches : la première arme, la seconde peint la sélection du moment.
// Le vrai clic, le vrai glissé, le triple-clic et les touches réelles à 700x400 sont dans dev-tests/verify-format-painter-mouse.mjs : une sélection posée par programme ne dit pas
// si ProseMirror a suivi la souris au relâchement.
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const editor = () => EditorCore.getEditor();
  const button = () => document.getElementById('v2-btn-format-painter');

  async function load(markup) {
    FormatPainter.disarm();
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
    await sleep(60);
  }
  const selectText = async needle => { const r = range(needle); await select(r.from, r.to); };
  // Le curseur dans le texte `needle` (au début de sa première lettre + 1).
  const caretIn = async needle => { const r = range(needle); await select(r.from + 1, r.from + 1); };
  // Le bloc de texte qui contient `needle`, de son premier à son dernier caractère (un triple-clic).
  async function selectBlockOf(needle) {
    const r = range(needle);
    const $pos = editor().state.doc.resolve(r.from);
    await select($pos.start(), $pos.end());
  }
  // Les marques du texte `needle` : « bold,italic,textStyle{"color":"…"} », triées ; link et comment-mark comptent.
  function marksOf(needle) {
    const r = range(needle);
    const node = editor().state.doc.nodeAt(r.from);
    return node.marks.map(mark => {
      const attrs = Object.keys(mark.attrs).filter(k => mark.attrs[k] != null && mark.attrs[k] !== '').sort().map(k => k + ':' + mark.attrs[k]).join(';');
      return mark.type.name + (mark.type.name === 'textStyle' || mark.type.name === 'link' ? '{' + attrs + '}' : '');
    }).sort().join(',');
  }
  const blockOf = needle => { const r = range(needle); const $pos = editor().state.doc.resolve(r.from); return $pos.parent; };
  const finish = () => { FormatPainter.disarm(); };

  const STYLED = '<strong><em><u><s><span style="color: #c0392b; background-color: #fff3a3; font-size: 14pt; font-family: Georgia">Modèle</span></s></u></em></strong>';

  cases.push({
    id: 'fp_button_is_in_the_toolbar_after_the_highlight_with_an_icon_a_name_and_the_key_in_both_languages',
    description: 'Le bouton du pinceau suit le surlignage dans la barre, porte une icône, son nom et la touche de départ (Alt+Maj+C) dans l\'infobulle, son nom accessible, en français et en anglais ; les deux actions de la liste des touches existent',
    run: async (h) => {
      await h.resetEditor();
      if (I18n.getLang() !== 'fr') I18n.setLang('fr');
      const b = button();
      const out = { exists: !!b };
      if (b) {
        out.afterHighlight = b.previousElementSibling && b.previousElementSibling.id === 'v2-highlight-split';
        out.icon = !!b.querySelector('svg path, svg rect');
        out.pressed = b.getAttribute('aria-pressed');
        out.fr = { tip: b.getAttribute('data-tip'), keytip: b.getAttribute('data-keytip'), aria: b.getAttribute('aria-label'), keys: b.getAttribute('aria-keyshortcuts') };
        I18n.setLang('en');
        out.en = { tip: b.getAttribute('data-tip'), keytip: b.getAttribute('data-keytip'), aria: b.getAttribute('aria-label') };
        I18n.setLang('fr');
      }
      const keys = { painter: Shortcuts.keyFor('formatPainter'), paste: Shortcuts.keyFor('formatPaste') };
      const names = ['fr', 'en'].map(lang => { I18n.setLang(lang); return ['formatPainter', 'formatPaste'].map(id => I18n.t(Shortcuts.action(id).label)).join(' / '); });
      I18n.setLang('fr');
      const pass = out.exists && out.afterHighlight && out.icon && out.pressed === 'false'
        && out.fr.tip === 'Reproduire la mise en forme' && out.fr.keytip === ' (Alt+Maj+C)' && /double-clic/.test(out.fr.aria) && out.fr.keys === 'Alt+Shift+C'
        && out.en.tip === 'Format painter' && out.en.keytip === ' (Alt+Shift+C)' && /double-click/.test(out.en.aria)
        && keys.painter === 'Alt+Shift+c' && keys.paste === 'Alt+Shift+v'
        && names[0] === 'Reproduire la mise en forme / Appliquer la mise en forme' && names[1] === 'Format painter / Apply the copied formatting';
      return { pass, notes: JSON.stringify({ out, keys, names }) };
    },
  });

  cases.push({
    id: 'fp_character_formatting_replaces_the_targets_and_keeps_links',
    description: 'Copier un texte gras, italique, souligné, barré, de police, taille, couleur et surlignage particuliers, puis peindre un autre texte : il prend tout, et perd ce que la source n\'a pas ; peindre un texte ordinaire efface la mise en forme ; un lien reste un lien',
    run: async (h) => {
      await load('<p>' + STYLED + ' puis <strong>cible</strong> et <em>autre</em> et <a href="https://exemple.fr">lien</a> fin</p><p>ordinaire</p>');
      const source = marksOf('Modèle');
      await selectText('Modèle');
      const copied = FormatPainter.copy();
      FormatPainter.arm(false);
      await selectText('cible');
      const painted = FormatPainter.apply();
      const afterFirst = marksOf('cible');
      // La cible avait « bold » seul : elle a maintenant toute la mise en forme de la source, ni plus ni moins.
      const armedAfter = FormatPainter.isArmed();
      // Un texte ordinaire comme source : peindre efface.
      await selectText('ordinaire');
      FormatPainter.copy();
      FormatPainter.arm(false);
      await selectText('cible');
      FormatPainter.apply();
      const cleared = marksOf('cible');
      // Un lien peint garde son lien, et prend le gras de la source.
      await selectText('Modèle');
      FormatPainter.copy();
      FormatPainter.arm(false);
      await selectText('lien');
      FormatPainter.apply();
      const link = marksOf('lien');
      finish();
      const pass = copied && painted && afterFirst === source && /bold/.test(source) && /italic/.test(source) && /underline/.test(source) && /strike/.test(source) && /textStyle\{[^}]*color:rgb\(192, 57, 43\)/.test(source)
        && !armedAfter && cleared === '' && /bold/.test(link) && /link\{[^}]*href:https:\/\/exemple\.fr/.test(link);
      return { pass, notes: JSON.stringify({ source, afterFirst, cleared, link, armedAfter }) };
    },
  });

  cases.push({
    id: 'fp_paragraph_formatting_follows_a_caret_or_a_whole_paragraph_and_lands_on_whole_paragraphs',
    description: 'Un curseur dans un titre 2 centré copie le titre et son alignement, posés sur un paragraphe peint en entier ; sur un mot seul, seule la mise en forme du caractère ; une source partielle ne copie pas le paragraphe ; une source ordinaire remet un titre en paragraphe et lève l\'alignement',
    run: async (h) => {
      const markup = '<h2 style="text-align: center">Titre source</h2><p>Premier cible</p><p>Second cible</p><p style="text-align: right">Droite cible</p><p>Ordinaire source</p><h3 style="text-align: center">Autre titre</h3>';
      await load(markup);
      const out = {};
      // 1) curseur dans le titre -> paragraphe peint en entier : devient un titre 2 centré
      await caretIn('Titre source');
      FormatPainter.copy();
      out.peek = FormatPainter.peek().block;
      FormatPainter.arm(false);
      await selectBlockOf('Premier cible');
      FormatPainter.apply();
      out.first = blockOf('Premier cible').type.name + ':' + blockOf('Premier cible').attrs.level + ':' + blockOf('Premier cible').attrs.textAlign;
      // 2) le même curseur -> un mot seul : le paragraphe ne change pas
      await caretIn('Titre source');
      FormatPainter.copy();
      FormatPainter.arm(false);
      await selectText('Second');
      FormatPainter.apply();
      out.partialTarget = blockOf('Second cible').type.name + ':' + blockOf('Second cible').attrs.textAlign;
      // 3) source partielle (un mot du titre) -> paragraphe entier : seule la mise en forme du caractère, l'alignement à droite reste
      await selectText('Titre');
      FormatPainter.copy();
      out.partialSource = FormatPainter.peek().block;
      FormatPainter.arm(false);
      await selectBlockOf('Droite cible');
      FormatPainter.apply();
      out.rightKept = blockOf('Droite cible').type.name + ':' + blockOf('Droite cible').attrs.textAlign;
      // 4) curseur dans un paragraphe ordinaire -> un titre 3 centré peint en entier : redevient un paragraphe sans alignement
      await caretIn('Ordinaire source');
      FormatPainter.copy();
      FormatPainter.arm(false);
      await selectBlockOf('Autre titre');
      FormatPainter.apply();
      out.plain = blockOf('Autre titre').type.name + ':' + blockOf('Autre titre').attrs.textAlign;
      finish();
      const pass = JSON.stringify(out.peek) === JSON.stringify({ type: 'heading', level: 2, align: 'center' }) && out.first === 'heading:2:center'
        && out.partialTarget === 'paragraph:null' && out.partialSource === null && out.rightKept === 'paragraph:right' && out.plain === 'paragraph:null';
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'fp_a_caption_keeps_its_type_and_a_list_item_does_not_turn_into_a_heading',
    description: 'Un paragraphe de légende et le premier paragraphe d\'une puce ne changent pas de type sous un titre copié (le schéma ne l\'accepte pas ou la légende y perdrait son sens) ; leur alignement suit',
    run: async (h) => {
      await load('<h2 style="text-align: center">Titre source</h2><p data-caption="true">Légende cible</p><ul><li><p>Puce cible</p></li></ul>');
      await caretIn('Titre source');
      FormatPainter.copy();
      FormatPainter.arm(true);
      await selectBlockOf('Légende cible');
      FormatPainter.apply();
      await selectBlockOf('Puce cible');
      FormatPainter.apply();
      const caption = blockOf('Légende cible');
      const item = blockOf('Puce cible');
      finish();
      const pass = caption.type.name === 'paragraph' && caption.attrs.caption === true && caption.attrs.textAlign === 'center'
        && item.type.name === 'paragraph' && item.attrs.textAlign === 'center';
      return { pass, notes: JSON.stringify({ caption: caption.type.name + ':' + caption.attrs.caption + ':' + caption.attrs.textAlign, item: item.type.name + ':' + item.attrs.textAlign }) };
    },
  });

  cases.push({
    id: 'fp_one_application_is_one_undo_step_and_an_empty_selection_paints_nothing',
    description: 'Peindre un texte et son titre est une seule étape d\'historique (un Ctrl+Z rend le document d\'avant) ; un curseur seul n\'a rien à peindre : la fonction rend faux, le document ne bouge pas, le pinceau reste armé',
    run: async (h) => {
      await load('<h2 style="text-align: center"><strong>Titre source</strong></h2><p>Cible un</p>');
      const before = Editor.getHTML();
      await caretIn('Titre source');
      FormatPainter.copy();
      FormatPainter.arm(false);
      await caretIn('Cible un'); // un curseur seul : rien à peindre
      const empty = FormatPainter.apply();
      const stillArmed = FormatPainter.isArmed();
      const unchanged = Editor.getHTML() === before;
      await selectBlockOf('Cible un');
      const painted = FormatPainter.apply();
      const after = Editor.getHTML();
      editor().commands.undo();
      await sleep(80);
      const undone = Editor.getHTML();
      finish();
      const pass = empty === false && stillArmed && unchanged && painted === true && /<h2[^>]*><strong>Cible un<\/strong><\/h2>/.test(after) && undone === before;
      return { pass, notes: JSON.stringify({ empty, stillArmed, unchanged, painted, after, undone, before }) };
    },
  });

  cases.push({
    id: 'fp_armed_by_a_click_by_a_double_click_stopped_by_escape_or_a_second_click',
    description: 'Un clic arme (bouton enfoncé, aria-pressed, curseur du pinceau) et un second clic arrête ; une application range le pinceau armé d\'un clic ; armé d\'un double-clic il reste armé, avec son liseré, jusqu\'à Échap',
    run: async (h) => {
      await load('<p><strong>Gras</strong> a b c</p>');
      const html = document.documentElement;
      const b = button();
      const state = () => ({ armed: FormatPainter.isArmed(), sticky: FormatPainter.isSticky(), pressed: b.getAttribute('aria-pressed'), active: b.classList.contains('is-active'), cursorClass: html.classList.contains('pp-format-painting'), stickyAttr: b.getAttribute('data-sticky') });
      const out = {};
      await selectText('Gras');
      b.click();
      out.afterClick = state();
      b.click();
      out.afterSecondClick = state();
      // clic puis application : rangé
      b.click();
      await selectText('a');
      FormatPainter.apply();
      out.afterApply = state();
      // double-clic : armé et durable
      await selectText('Gras');
      b.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
      out.afterDouble = state();
      await selectText('b');
      FormatPainter.apply();
      await selectText('c');
      FormatPainter.apply();
      out.afterTwoApplies = state();
      out.painted = marksOf('b') + ' / ' + marksOf('c');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
      out.afterEscape = state();
      finish();
      const on = { armed: true, sticky: false, pressed: 'true', active: true, cursorClass: true, stickyAttr: null };
      const off = { armed: false, sticky: false, pressed: 'false', active: false, cursorClass: false, stickyAttr: null };
      const durable = { armed: true, sticky: true, pressed: 'true', active: true, cursorClass: true, stickyAttr: 'true' };
      const pass = JSON.stringify(out.afterClick) === JSON.stringify(on) && JSON.stringify(out.afterSecondClick) === JSON.stringify(off) && JSON.stringify(out.afterApply) === JSON.stringify(off)
        && JSON.stringify(out.afterDouble) === JSON.stringify(durable) && JSON.stringify(out.afterTwoApplies) === JSON.stringify(durable) && out.painted === 'bold / bold'
        && JSON.stringify(out.afterEscape) === JSON.stringify(off);
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'fp_is_greyed_in_email_and_macro_modes_and_an_armed_painter_stops',
    description: 'En mode e-mail et en macro-modèle le bouton est grisé (v2-hf-locked), sa touche ne fait rien ; un pinceau armé qui se retrouve grisé (Lecture, droits, e-mail) s\'arrête à la transaction suivante',
    run: async (h) => {
      await load('<p><strong>Gras</strong> a</p>');
      const b = button();
      const out = {};
      const reset = () => { MainToolbar.setEmailMode(false); MainToolbar.setMacroMode(false); MainToolbar.syncToolbarState(); b.classList.remove('pp-access-locked'); };
      reset();
      out.free = b.classList.contains('v2-hf-locked');
      MainToolbar.setEmailMode(true); MainToolbar.syncToolbarState();
      out.email = b.classList.contains('v2-hf-locked');
      out.emailKey = Shortcuts.run('formatPainter');
      reset();
      MainToolbar.setMacroMode(true); MainToolbar.syncToolbarState();
      out.macro = b.classList.contains('v2-hf-locked');
      reset();
      // armé, puis grisé par e-mail
      await selectText('Gras');
      b.click();
      out.armed = FormatPainter.isArmed();
      MainToolbar.setEmailMode(true); MainToolbar.syncToolbarState();
      await sleep(30);
      out.stoppedByEmail = !FormatPainter.isArmed();
      reset();
      // armé, puis grisé par la Lecture / les droits (classe posée par js/main.js)
      b.click();
      b.classList.add('pp-access-locked');
      await sleep(30);
      out.stoppedByAccess = !FormatPainter.isArmed();
      out.copyWhenLocked = FormatPainter.copy();
      reset();
      finish();
      const pass = out.free === false && out.email === true && out.emailKey === false && out.macro === true && out.armed === true && out.stoppedByEmail === true
        && out.stoppedByAccess === true && out.copyWhenLocked === false;
      return { pass, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'fp_with_track_changes_on_leaves_the_same_trace_as_the_bold_button_and_keeps_comments',
    description: 'Suivi des modifications allumé, le pinceau laisse la même trace que le bouton Gras posé sur le même texte (l\'original barré, la copie mise en forme insérée) sans erreur ; le commentaire posé sur le texte peint reste sur les deux',
    run: async (h) => {
      const tracking = document.getElementById('v2-btn-track-changes');
      const start = '<p><strong>Gras</strong> et <span class="comment-mark" data-comment-id="c1">cible</span> fin</p>';
      const normalized = () => Editor.getHTML().replace(/data-id="\d+"/g, 'data-id="n"');
      const traced = async paint => {
        await load(start);
        if (!Editor.isTrackChangesOn()) tracking.click();
        await sleep(80);
        await paint();
        await sleep(80);
        const html = normalized();
        if (Editor.isTrackChangesOn()) tracking.click();
        await sleep(80);
        return html;
      };
      let error = null;
      let viaPainter = '';
      let viaBold = '';
      try {
        viaBold = await traced(async () => { await selectText('cible'); document.getElementById('v2-btn-bold').click(); });
        viaPainter = await traced(async () => {
          await selectText('Gras');
          FormatPainter.copy();
          FormatPainter.arm(false);
          await selectText('cible');
          FormatPainter.apply();
        });
      } catch (e) { error = String(e && e.message || e); }
      finish();
      const pass = error === null && viaPainter === viaBold && /<del[^>]*><span[^>]*comment-mark[^>]*>cible<\/span><\/del>/.test(viaPainter) && /<ins[^>]*><strong><span[^>]*comment-mark[^>]*>cible<\/span><\/strong><\/ins>/.test(viaPainter);
      return { pass, notes: JSON.stringify({ error, viaPainter, viaBold }) };
    },
  });

  cases.push({
    id: 'fp_keys_copy_then_paint_the_selection_of_the_moment',
    description: 'Alt+Maj+C arme le pinceau (le geste de son bouton), Alt+Maj+V peint la sélection du moment et le range ; la touche d\'application sans rien à peindre ne casse rien',
    run: async (h) => {
      await load('<p><strong><em>Source</em></strong> cible un cible deux</p>');
      const press = (key, code) => {
        const event = new KeyboardEvent('keydown', { key, code, altKey: true, shiftKey: true, bubbles: true, cancelable: true, composed: true });
        (document.activeElement || document.body).dispatchEvent(event);
        return event;
      };
      await selectText('Source');
      const down = press('C', 'KeyC');
      const armed = FormatPainter.isArmed();
      const hasCopy = FormatPainter.hasCopy();
      await selectText('cible un');
      const paste = press('V', 'KeyV');
      const first = marksOf('cible un');
      const armedAfter = FormatPainter.isArmed();
      // sans pinceau armé, la touche d'application repose la dernière copie sur la sélection
      await selectText('cible deux');
      press('V', 'KeyV');
      const second = marksOf('cible deux');
      // curseur seul : rien à peindre, et la touche reste prise (pas de frappe parasite)
      await caretIn('cible deux');
      const quiet = press('V', 'KeyV');
      finish();
      const pass = down.defaultPrevented && armed && hasCopy && paste.defaultPrevented && first === 'bold,italic' && !armedAfter && second === 'bold,italic' && quiet.defaultPrevented;
      return { pass, notes: JSON.stringify({ armed, first, armedAfter, second }) };
    },
  });

  // Un glissé sur des cases d'un tableau : prosemirror-tables garde la sélection de cases pendant le glissé, puis la laisse se reconvertir en texte (celui où le navigateur a fini son glissé) juste
  // après le relâchement - tantôt avant tantôt après le tour du pinceau, selon la charge de la page. Le pinceau relève donc les cases au relâchement et les peint, pas ce qui reste du glissé.
  cases.push({
    id: 'fp_cells_released_by_the_mouse_are_painted_even_when_prosemirror_has_turned_them_back_into_text',
    description: 'Les cases d\'un tableau sélectionnées au relâchement de la souris reçoivent la mise en forme même quand ProseMirror les a déjà reconverties en texte (le mot où le glissé s\'est arrêté) : les deux cases sont peintes, pas la ligne du dessous, les cases restent sélectionnées, le pinceau se range ; des cases relevées avant un changement du document ne valent plus, la sélection du moment est peinte',
    run: async (h) => {
      await h.resetEditor();
      const markup = '<p><strong>Gras</strong> hors tableau</p><table><tbody><tr><td><p>case un</p></td><td><p>case deux</p></td></tr><tr><td><p>case trois</p></td><td><p>case quatre</p></td></tr></tbody></table>';
      await load(markup);
      await selectText('Gras');
      FormatPainter.copy();
      FormatPainter.arm(false);
      // Un texte peint à moitié est coupé en deux morceaux : « coupé » plutôt qu'une exception, pour que l'échec dise ce qui a été peint.
      const marks = needle => { try { return marksOf(needle); } catch (e) { return 'coupé'; } };
      const cellPositions = () => { const out = []; editor().state.doc.descendants((node, pos) => { if (node.type.name === 'tableCell') out.push(pos); }); return out; };
      const cells = cellPositions();
      editor().chain().focus().setCellSelection({ anchorCell: cells[0], headCell: cells[1] }).run();
      await sleep(60);
      const released = editor().state.selection;
      const wasCells = !!released.$anchorCell;
      // ProseMirror a reconverti la sélection de cases en texte : le début de la 2e case seulement
      const second = range('case deux');
      await select(second.from, second.from + 4);
      const converted = !editor().state.selection.$anchorCell;
      const applied = FormatPainter.apply(released);
      await sleep(80);
      const out = { wasCells, converted, applied, one: marks('case un'), two: marks('case deux'), three: marks('case trois'), four: marks('case quatre'),
        keptCells: !!editor().state.selection.$anchorCell, armedAfter: FormatPainter.isArmed() };
      // des cases relevées avant un changement du document ne valent plus : la sélection du moment est peinte
      await load(markup);
      await selectText('Gras');
      FormatPainter.copy();
      await selectText('case trois');
      const stale = FormatPainter.apply(released);
      await sleep(60);
      out.stale = { applied: stale, one: marks('case un'), three: marks('case trois') };
      finish();
      const pass = wasCells && converted && applied && out.one === 'bold' && out.two === 'bold' && out.three === '' && out.four === '' && out.keptCells && !out.armedAfter
        && stale && out.stale.one === '' && out.stale.three === 'bold';
      return { pass, notes: JSON.stringify(out) };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.formatPainter = cases;
})();
