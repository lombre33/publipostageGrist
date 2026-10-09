// Suite "scriptMarks" - exposant et indice (m³, H₂O) : deux marques de caractère (js/script-marks.js, css/script-marks.css), posées par les deux icônes du titre du menu « Lien et
// blocs de contenu » (#v2-btn-superscript, #v2-btn-subscript) ou par Ctrl+. et Ctrl+, (js/shortcuts.js), le même rendu dans l'éditeur, la Lecture, le PDF et le Word (demande
// d'Antoine, 09/10 : « Écris-tu des exposants ou des indices ? » - « oui très bonne idée » ; l'icône dans le menu du lien, pas dans la barre).
//  1) l'ÉDITEUR : les icônes du menu (place, icône, nom, touche, état enfoncé), la pose et le retrait, l'un retire l'autre, la frappe qui suit, les touches, le HTML qu'on relit
//     (balises <sup> et <sub>, style de Word et de Google Docs), la note de bas de page qui reste un nœud, la taille posée avant ou après, le pinceau, les modes grisés ;
//  2) l'EMAIL : le lien mailto: est du texte brut (js/mailto-export.js), l'exposant et l'indice y sont les caractères Unicode qui en tiennent lieu (m³, H₂O, 1ᵉʳ) - le texte, les tables
//     de caractères, un groupe qui n'a pas tous les siens, le vrai chemin de l'éditeur au lien encodé, les icônes et les touches d'un vrai modèle email, un collage ;
//  3) les RENDUS, lus sur la sortie réelle : le CSS de l'éditeur, de la Lecture et des zones d'en-tête et de pied, la feuille de l'impression par le navigateur, les runs pdfmake, les positions PEINTES du PDF décodé par pdf.js
//     (le décalage au-dessus de la ligne est celui du CSS), le XML du .docx dézippé (`w:vertAlign`).
// L'export Excel (`vertAlign` de la police d'une case) est dans scenarios-xlsx.js (ses aides de lecture du classeur y sont), l'ouverture du menu à la vraie souris à 700x400 dans
// dev-tests/verify-script-marks-mouse.mjs : une page.evaluate ne déclenche ni un survol ni une frappe « trusted ».
(function () {
  const cases = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const tiptap = () => document.querySelector('.tiptap');
  const editor = () => EditorCore.getEditor();
  const byId = id => document.getElementById(id);
  const SUP = 'v2-btn-superscript';
  const SUB = 'v2-btn-subscript';
  const near = (a, b, tolerance) => a != null && b != null && Math.abs(a - b) <= tolerance;
  const round = n => Math.round(n * 1000) / 1000;
  const px = value => parseFloat(value);
  const isActive = id => byId(id).classList.contains('is-active');
  const isLocked = id => byId(id).classList.contains('v2-hf-locked');
  // Les marques du premier texte qui contient `needle`, par leur nom ('' sans marque, null si le texte n'y est pas).
  function marksOf(needle) {
    let found = null;
    editor().state.doc.descendants(node => {
      if (found !== null || !node.isText) return;
      if (node.text.indexOf(needle) !== -1) found = node.marks.map(mark => mark.type.name).sort().join(',');
    });
    return found;
  }
  const hasMark = (needle, name) => (marksOf(needle) || '').split(',').indexOf(name) !== -1;

  // La sélection de ProseMirror sur `text` (première occurrence), puis un court délai : la barre relit son état à chaque transaction.
  async function selectText(text) {
    let range = null;
    editor().state.doc.descendants((node, pos) => {
      if (range || !node.isText) return;
      const at = node.text.indexOf(text);
      if (at !== -1) range = { from: pos + at, to: pos + at + text.length };
    });
    if (!range) throw new Error('texte introuvable dans l\'éditeur : ' + text);
    editor().chain().focus().setTextSelection(range).run();
    await sleep(60);
  }
  async function load(html) {
    Editor.setHTML(html);
    await sleep(150);
  }
  // Une frappe telle que ProseMirror la reçoit (après l'écouteur de js/shortcuts.js, qui est sur le document) ; vrai quand elle est consommée.
  function press(init) {
    const event = new KeyboardEvent('keydown', Object.assign({ bubbles: true, cancelable: true }, init));
    tiptap().dispatchEvent(event);
    return event.defaultPrevented;
  }

  // Un hôte de mesure à part, sans toucher à l'éditeur : un <div> hors de la page porte la même classe que le contexte étudié (l'éditeur, la Lecture, une bande d'en-tête...), donc
  // les mêmes règles CSS - comme l'hôte de mesure du PDF, qui porte la classe .tiptap.
  const hosts = [];
  function measureHost(html, className) {
    const host = document.createElement('div');
    host.className = className || 'tiptap';
    host.style.cssText = 'position: absolute; left: 0; top: 0; width: 600px; visibility: hidden; font-size: 14px;';
    host.innerHTML = html;
    document.body.appendChild(host);
    hosts.push(host);
    return host;
  }
  const clearHosts = () => { while (hosts.length) hosts.pop().remove(); };
  // Ce que le CSS fait d'un <sup> ou d'un <sub> : sa taille (part de celle du texte qui le porte), son décalage (part de sa propre taille) et sa place dans la ligne.
  function geometryOf(el) {
    if (!el) return null;
    const view = el.ownerDocument.defaultView; // le cadre d'impression a sa propre fenêtre
    const own = view.getComputedStyle(el);
    const parent = view.getComputedStyle(el.parentElement);
    return { ratio: round(px(own.fontSize) / px(parent.fontSize)), top: round(px(own.top) / px(own.fontSize)), position: own.position, verticalAlign: own.verticalAlign, lineHeight: own.lineHeight };
  }
  const goodSup = g => !!g && near(g.ratio, ScriptMarks.SIZE_RATIO, 0.01) && near(g.top, -0.75, 0.02) && g.position === 'relative' && g.verticalAlign === 'baseline' && g.lineHeight === '0px';
  const goodSub = g => !!g && near(g.ratio, ScriptMarks.SIZE_RATIO, 0.01) && near(g.top, 0.35, 0.02) && g.position === 'relative' && g.verticalAlign === 'baseline' && g.lineHeight === '0px';
  const SUP_SELECTOR = 'sup:not(.footnote-ref-marker)';
  // La hauteur du premier paragraphe de `html` dans un hôte de mesure de cette classe.
  function heightOf(html, className) {
    const height = measureHost(html, className).querySelector('p').getBoundingClientRect().height;
    clearHosts();
    return height;
  }
  // De combien (en px) le texte du premier `tag` est levé au-dessus de la ligne de base du texte voisin (négatif : baissé) : un point sans dimension dans l'élément, un autre à côté.
  function raiseOf(html, tag) {
    const host = measureHost(html);
    const el = host.querySelector(tag);
    const probe = () => { const dot = document.createElement('span'); dot.style.cssText = 'display: inline-block; width: 0; height: 0;'; return dot; };
    const inside = probe(); el.appendChild(inside);
    const beside = probe(); el.parentNode.insertBefore(beside, el);
    const raised = beside.getBoundingClientRect().bottom - inside.getBoundingClientRect().bottom;
    clearHosts();
    return raised;
  }

  // Les runs de texte d'un contenu pdfmake, où qu'ils soient (blocs, listes, cases de tableau, runs imbriqués).
  function runsOf(content) {
    const runs = []; const seen = new Set();
    const walk = node => {
      if (!node || typeof node !== 'object' || seen.has(node)) return;
      seen.add(node);
      if (Array.isArray(node)) { node.forEach(walk); return; }
      if (typeof node.text === 'string') runs.push(node);
      Object.keys(node).forEach(key => { if (key.charAt(0) !== '_') walk(node[key]); });
    };
    walk(content);
    return runs;
  }
  const runWith = (runs, text) => runs.find(r => typeof r.text === 'string' && r.text.trim() === text) || null;

  // --- 1) Les icônes du menu --------------------------------------------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'sm_icons_sit_on_the_title_line_of_the_blocks_menu_never_a_new_toolbar_icon',
    description: 'Exposant et Indice sont deux icônes sur la ligne du titre du volet « Lien et blocs de contenu », hors du flux (elles n\'ajoutent aucune hauteur au volet), avant « Lien… » dans l\'ordre du clavier ; chacune a son icône, son nom, sa touche dans l\'infobulle et pour les lecteurs d\'écran ; aucune n\'est dans la barre ; les lignes qui y étaient y sont toujours, dans l\'ordre (d\'autres peuvent s\'y ajouter)',
    run: async (h) => {
      await h.resetEditor();
      const flyout = byId('v2-blocks-flyout');
      const order = Array.from(flyout.querySelectorAll('.v2-menu-row, .v2-hover-icon-row button')).map(el => el.id);
      const row = flyout.querySelector('.v2-hover-icon-row');
      const label = flyout.querySelector('.v2-hover-flyout-label');
      const place = { child: row.parentElement === flyout, afterTitle: row.previousElementSibling === label, position: getComputedStyle(row).position };
      const info = [SUP, SUB].map(id => {
        const el = byId(id);
        return { id, tag: el.tagName, inRow: el.parentElement === row, inFlyout: !!el.closest('#v2-blocks-flyout'), icon: !!el.querySelector('svg'), aria: el.getAttribute('aria-label'), tip: el.getAttribute('data-tip'),
          keytip: el.getAttribute('data-keytip'), keys: el.getAttribute('aria-keyshortcuts'), pressed: el.getAttribute('aria-pressed'), count: document.querySelectorAll('#' + id).length };
      });
      // Les deux icônes d'abord (l'ordre du clavier), puis les lignes de toujours dans leur ordre : d'autres lignes (le graphique, un jour une autre) peuvent s'y ajouter, pas les déplacer.
      const known = ['v2-row-link', 'v2-btn-citation', 'v2-btn-code-block', 'v2-btn-callout', 'v2-btn-signature', 'v2-btn-qr'];
      let last = -1;
      const rowsKept = known.every(id => { const at = order.indexOf(id); const ok = at > last; last = at; return ok; });
      const pass = order[0] === SUP && order[1] === SUB && order[2] === 'v2-row-link' && rowsKept && place.child && place.afterTitle && place.position === 'absolute'
        && info.every(i => i.tag === 'BUTTON' && i.inRow && i.inFlyout && i.icon && i.pressed === 'false' && i.count === 1)
        && info[0].aria === 'Exposant' && info[0].tip === 'Exposant' && info[0].keytip === ' (Ctrl+.)' && info[0].keys === 'Control+.'
        && info[1].aria === 'Indice' && info[1].tip === 'Indice' && info[1].keytip === ' (Ctrl+,)' && info[1].keys === 'Control+,';
      return { pass, notes: JSON.stringify({ order, place, info }) };
    },
  });

  cases.push({
    id: 'sm_icons_and_names_follow_the_interface_language',
    description: 'Les deux icônes passent en anglais avec l\'interface (Superscript, Subscript) et reviennent en français',
    run: async (h) => {
      await h.resetEditor();
      const read = () => [SUP, SUB].map(id => [byId(id).getAttribute('aria-label'), byId(id).getAttribute('data-tip')].join('|'));
      const fr = read();
      I18n.setLang('en');
      await sleep(100);
      let en;
      try { en = read(); } finally { I18n.setLang('fr'); }
      await sleep(100);
      const back = read();
      const pass = JSON.stringify(fr) === JSON.stringify(['Exposant|Exposant', 'Indice|Indice']) && JSON.stringify(en) === JSON.stringify(['Superscript|Superscript', 'Subscript|Subscript'])
        && JSON.stringify(back) === JSON.stringify(fr);
      return { pass, notes: JSON.stringify({ fr, en, back }) };
    },
  });

  // --- 2) Poser, retirer, changer --------------------------------------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'sm_icons_set_and_remove_the_mark_and_show_their_state',
    description: 'Un clic sur Exposant met la sélection en <sup> (icône enfoncée, aria-pressed), un second clic la retire ; Indice de même avec <sub> ; le reste du texte n\'est pas touché',
    run: async (h) => {
      await h.resetEditor();
      await load('<p>Volume m3 et eau H2O</p>');
      await selectText('3');
      await h.clickButton(SUP);
      const setSup = Editor.getHTML();
      const stateSup = { sup: isActive(SUP), sub: isActive(SUB), pressed: [byId(SUP).getAttribute('aria-pressed'), byId(SUB).getAttribute('aria-pressed')] };
      await h.clickButton(SUP);
      const removed = Editor.getHTML();
      await selectText('2');
      await h.clickButton(SUB);
      const setSub = Editor.getHTML();
      const stateSub = { sup: isActive(SUP), sub: isActive(SUB), pressed: [byId(SUP).getAttribute('aria-pressed'), byId(SUB).getAttribute('aria-pressed')] };
      await h.clickButton(SUB);
      const removedSub = Editor.getHTML();
      const pass = setSup === '<p>Volume m<sup>3</sup> et eau H2O</p>' && stateSup.sup && !stateSup.sub && stateSup.pressed.join() === 'true,false'
        && removed === '<p>Volume m3 et eau H2O</p>'
        && setSub === '<p>Volume m3 et eau H<sub>2</sub>O</p>' && !stateSub.sup && stateSub.sub && stateSub.pressed.join() === 'false,true'
        && removedSub === '<p>Volume m3 et eau H2O</p>';
      return { pass, notes: JSON.stringify({ setSup, stateSup, removed, setSub, stateSub, removedSub }) };
    },
  });

  cases.push({
    id: 'sm_one_replaces_the_other_on_the_same_text',
    description: 'Un texte n\'est jamais exposant et indice à la fois : poser l\'un retire l\'autre, dans les deux sens, et un seul Annuler rend l\'état d\'avant',
    run: async (h) => {
      await h.resetEditor();
      await load('<p>Valeur x2 fin</p>');
      await selectText('2');
      await h.clickButton(SUP);
      await sleep(650); // l'historique regroupe ce qui se suit à moins d'une demi-seconde : chaque changement doit être son étape
      await h.clickButton(SUB);
      const toSub = Editor.getHTML();
      const marksSub = marksOf('2');
      await sleep(650);
      await h.clickButton(SUP);
      const toSup = Editor.getHTML();
      const marksSup = marksOf('2');
      editor().chain().focus().undo().run();
      await sleep(60);
      const undone = Editor.getHTML();
      const pass = toSub === '<p>Valeur x<sub>2</sub> fin</p>' && marksSub === 'subscript' && toSup === '<p>Valeur x<sup>2</sup> fin</p>' && marksSup === 'superscript' && undone === toSub;
      return { pass, notes: JSON.stringify({ toSub, marksSub, toSup, marksSup, undone }) };
    },
  });

  cases.push({
    id: 'sm_typing_after_the_icon_goes_on_in_the_mark_until_it_is_turned_off',
    description: 'Curseur sans sélection : Exposant puis « 3 » écrit un exposant, un nouveau clic revient au texte ordinaire (comme Gras)',
    run: async (h) => {
      await h.resetEditor();
      await h.focusAtEnd();
      await h.typeText('m');
      await h.clickButton(SUP);
      await h.typeText('3');
      const pressedWhileTyping = isActive(SUP);
      await h.clickButton(SUP);
      await h.typeText(' ok');
      const html = Editor.getHTML();
      const pass = html === '<p>m<sup>3</sup> ok</p>' && pressedWhileTyping && !isActive(SUP);
      return { pass, notes: JSON.stringify({ html, pressedWhileTyping, after: isActive(SUP) }) };
    },
  });

  cases.push({
    id: 'sm_keys_ctrl_dot_and_ctrl_comma_toggle_on_qwerty_and_azerty',
    description: 'Ctrl+. met en exposant et Ctrl+, en indice, sur un clavier QWERTY comme sur un AZERTY (où le point demande Maj) ; la frappe est consommée ; une seconde frappe retire la marque',
    run: async (h) => {
      await h.resetEditor();
      Shortcuts.resetAll();
      await load('<p>aa bb cc dd</p>');
      await selectText('aa');
      const qwertyDot = press({ key: '.', code: 'Period', ctrlKey: true });
      const afterQwerty = Editor.getHTML();
      const second = press({ key: '.', code: 'Period', ctrlKey: true });
      const afterSecond = Editor.getHTML();
      await selectText('bb');
      const azertyDot = press({ key: '.', code: 'Semicolon', ctrlKey: true, shiftKey: true });
      const afterAzerty = Editor.getHTML();
      await selectText('cc');
      const comma = press({ key: ',', code: 'Comma', ctrlKey: true });
      const afterComma = Editor.getHTML();
      const combo = Shortcuts.fromEvent(new KeyboardEvent('keydown', { key: '.', ctrlKey: true, shiftKey: true })).combo;
      const pass = qwertyDot && afterQwerty === '<p><sup>aa</sup> bb cc dd</p>' && second && afterSecond === '<p>aa bb cc dd</p>'
        && azertyDot && afterAzerty === '<p>aa <sup>bb</sup> cc dd</p>' && comma && afterComma === '<p>aa <sup>bb</sup> <sub>cc</sub> dd</p>' && combo === 'Mod+.';
      return { pass, notes: JSON.stringify({ qwertyDot, afterQwerty, second, afterSecond, azertyDot, afterAzerty, comma, afterComma, combo }) };
    },
  });

  cases.push({
    id: 'sm_the_shortcut_actions_are_listed_and_a_changed_key_does_what_the_icon_does',
    description: 'Exposant et Indice sont deux actions de Réglages > Raccourcis (Ctrl+. et Ctrl+,, groupe Mise en forme) ; la touche changée (Alt+X) fait ce que fait l\'icône et l\'ancienne ne fait plus rien ; « Par défaut » rend Ctrl+.',
    run: async (h) => {
      await h.resetEditor();
      Shortcuts.resetAll();
      await load('<p>aa bb</p>');
      const listed = ['superscript', 'subscript'].map(id => { const a = Shortcuts.action(id); return [id, Shortcuts.keyFor(id), a && a.group, a && a.native, Shortcuts.label(id)]; });
      await selectText('aa');
      try {
        const set = Shortcuts.setKey('superscript', 'Alt+x');
        const altX = press({ key: 'x', code: 'KeyX', altKey: true });
        await sleep(60);
        const afterAlt = Editor.getHTML();
        const oldKey = press({ key: '.', code: 'Period', ctrlKey: true });
        const afterOld = Editor.getHTML();
        Shortcuts.resetKey('superscript');
        press({ key: '.', code: 'Period', ctrlKey: true });
        const restored = Editor.getHTML();
        const pass = JSON.stringify(listed) === JSON.stringify([['superscript', 'Mod+.', 'format', true, 'Ctrl+.'], ['subscript', 'Mod+,', 'format', true, 'Ctrl+,']])
          && set.problem === '' && altX && afterAlt === '<p><sup>aa</sup> bb</p>' && oldKey && afterOld === afterAlt && restored === '<p>aa bb</p>';
        return { pass, notes: JSON.stringify({ listed, set, altX, afterAlt, oldKey, afterOld, restored }) };
      } finally { Shortcuts.resetAll(); }
    },
  });

  // --- 3) Ce que le HTML dit ---------------------------------------------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'sm_html_with_sup_and_sub_is_read_and_written_back_unchanged',
    description: 'Un modèle qui contient <sup> et <sub> s\'ouvre avec les marques et se réécrit à l\'identique ; un exposant dans un titre, une liste, une case de tableau et un lien est gardé',
    run: async (h) => {
      await h.resetEditor();
      const html = '<h2>Titre 10<sup>e</sup></h2><p>H<sub>2</sub>O et m<sup>3</sup></p><ul><li><p>1<sup>er</sup> item</p></li></ul>'
        + '<table><tbody><tr><td><p>cm<sup>2</sup></p></td><td><p>x<sub>i</sub></p></td></tr></tbody></table>'
        + '<p><a target="_blank" rel="noopener noreferrer nofollow" href="https://exemple.fr">lien<sup>1</sup></a></p>';
      await load(html);
      const back = Editor.getHTML();
      const pass = (back.match(/<sup>/g) || []).length === 5 && (back.match(/<sub>/g) || []).length === 2
        && /<h2>Titre 10<sup>e<\/sup><\/h2>/.test(back) && /H<sub>2<\/sub>O et m<sup>3<\/sup>/.test(back) && /<li><p>1<sup>er<\/sup> item<\/p><\/li>/.test(back)
        && /cm<sup>2<\/sup>/.test(back) && /x<sub>i<\/sub>/.test(back) && /lien<sup>1<\/sup><\/a>/.test(back)
        && marksOf('3') === 'superscript' && marksOf('er') === 'superscript';
      return { pass, notes: pass ? 'ok' : back };
    },
  });

  cases.push({
    id: 'sm_word_and_google_docs_vertical_align_styles_become_the_marks',
    description: 'Un <span style="vertical-align: super"> (Word, Google Docs) est lu comme un exposant et « sub » comme un indice ; « baseline » et toute autre valeur ne sont pas des marques ; la couleur du même span est gardée',
    run: async (h) => {
      await h.resetEditor();
      await load('<p>a<span style="vertical-align: super">2</span> b<span style="vertical-align: sub">X</span> c<span style="vertical-align: baseline">3</span> d<span style="vertical-align: top">4</span> e<span style="vertical-align: super; color: #c0392b">5</span></p>');
      const html = Editor.getHTML();
      const marks = { two: marksOf('2'), x: marksOf('X'), three: marksOf('3'), four: marksOf('4'), five: marksOf('5') };
      const pass = hasMark('2', 'superscript') && !hasMark('2', 'subscript') && hasMark('X', 'subscript') && !hasMark('X', 'superscript')
        && !hasMark('3', 'superscript') && !hasMark('3', 'subscript') && !hasMark('4', 'superscript') && !hasMark('4', 'subscript')
        && hasMark('5', 'superscript') && /color: ?(#c0392b|rgb\(192, ?57, ?43\))/i.test(html) && !/vertical-align/.test(html);
      return { pass, notes: JSON.stringify({ html, marks }) };
    },
  });

  cases.push({
    id: 'sm_a_footnote_marker_stays_a_footnote_and_never_becomes_the_mark',
    description: 'La note de bas de page est un <sup class="footnote-ref-marker"> : elle reste un nœud de note (jamais la marque), qu\'on la lise ou l\'écrive ; son rendu n\'est pas celui de l\'exposant ; ScriptMarks.kindOf ne la reconnaît pas',
    run: async (h) => {
      await h.resetEditor();
      await load('<p>Texte<sup class="footnote-ref-marker" data-note-id="n1" data-note-text="Une note">1</sup> et m<sup>3</sup></p>');
      const types = [];
      editor().state.doc.descendants(node => { types.push(node.type.name + (node.marks.length ? '[' + node.marks.map(m => m.type.name).join('+') + ']' : '')); });
      const html = Editor.getHTML();
      const marker = tiptap().querySelector('.footnote-ref-marker');
      const plainSup = tiptap().querySelector(SUP_SELECTOR);
      const markerStyle = getComputedStyle(marker);
      const supStyle = getComputedStyle(plainSup);
      const kinds = [ScriptMarks.kindOf(marker), ScriptMarks.kindOf(plainSup), ScriptMarks.kindOf(document.createElement('sub')), ScriptMarks.kindOf(document.createElement('b')), ScriptMarks.kindOf(null)];
      const pass = types.includes('footnoteRef') && types.filter(t => t.includes('superscript')).length === 1 && /class="footnote-ref-marker"/.test(html)
        && markerStyle.position !== 'relative' && markerStyle.top === 'auto' && supStyle.position === 'relative' && kinds.join() === ',superscript,subscript,,';
      return { pass, notes: JSON.stringify({ types, html, markerPosition: markerStyle.position, markerTop: markerStyle.top, kinds }) };
    },
  });

  cases.push({
    id: 'sm_pasted_html_keeps_the_marks_and_drops_the_size_that_would_shrink_them_twice',
    description: 'Un texte collé de Google Docs (font-size 0,6em + vertical-align) ou de Word garde son exposant ou son indice SANS sa taille (la marque réduit déjà le texte) ; un HTML sans exposant ressort tel quel',
    run: async (h) => {
      await h.resetEditor();
      await load('<p>x</p>');
      const docs = '<span style="font-size: 0.6em; vertical-align: super;">2</span>';
      const word = '<span style="font-size: 7.0pt; vertical-align: sub">i</span>';
      const cleaned = ScriptMarks.cleanPastedHtml('<p>a' + docs + word + '</p>');
      const plain = '<p>Texte <b>gras</b> sans exposant</p>';
      const untouched = ScriptMarks.cleanPastedHtml(plain) === plain && ScriptMarks.cleanPastedHtml('') === '' && ScriptMarks.cleanPastedHtml(null) === null;
      await selectText('x');
      editor().view.pasteHTML('<p>a' + docs + ' b' + word + '</p>');
      await sleep(150);
      const html = Editor.getHTML();
      const pass = !/font-size/.test(cleaned) && /vertical-align/.test(cleaned) && untouched
        && hasMark('2', 'superscript') && hasMark('i', 'subscript') && !/font-size/.test(html);
      return { pass, notes: JSON.stringify({ cleaned, untouched, html }) };
    },
  });

  cases.push({
    id: 'sm_a_size_set_before_or_after_wraps_the_mark_so_the_exponent_is_six_tenths_of_it',
    description: 'La taille choisie (14 pt) enveloppe toujours la marque (<span style="font-size: 14pt"><sup>…), qu\'on la pose avant ou après l\'exposant : l\'exposant mesure alors 6/10 de 14 pt, jamais 6/10 de la taille du paragraphe',
    run: async (h) => {
      await h.resetEditor();
      const out = {};
      for (const order of ['size-then-mark', 'mark-then-size']) {
        await load('<p>Base m3 fin</p>');
        await selectText('3');
        if (order === 'size-then-mark') { editor().chain().focus().setFontSize('14pt').run(); await sleep(60); await h.clickButton(SUP); }
        else { await h.clickButton(SUP); editor().chain().focus().setFontSize('14pt').run(); await sleep(60); }
        const html = Editor.getHTML();
        const sup = tiptap().querySelector('sup');
        const wrapper = sup.parentElement;
        out[order] = { html, wrapped: wrapper.tagName === 'SPAN' && /font-size: 14pt/.test(wrapper.getAttribute('style') || ''), size: px(getComputedStyle(sup).fontSize), parentSize: px(getComputedStyle(wrapper).fontSize) };
      }
      const good = o => /<span style="font-size: 14pt;?"><sup>3<\/sup><\/span>/.test(o.html) && o.wrapped && near(o.parentSize, 14 * 96 / 72, 0.1) && near(o.size, 0.6 * 14 * 96 / 72, 0.1);
      return { pass: good(out['size-then-mark']) && good(out['mark-then-size']), notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'sm_the_format_painter_copies_and_clears_the_mark_like_bold',
    description: 'Le pinceau copie l\'exposant d\'un texte sur un autre, copie un indice à la place d\'un exposant, et peindre un texte ordinaire retire la marque',
    run: async (h) => {
      await h.resetEditor();
      FormatPainter.disarm();
      await load('<p>a<sup>1</sup> b<sub>2</sub> cible autre ordinaire</p>');
      const paint = async (from, to) => { await selectText(from); FormatPainter.copy(); FormatPainter.arm(false); await selectText(to); FormatPainter.apply(); };
      await paint('1', 'cible');
      const first = marksOf('cible');
      await paint('2', 'cible');
      const second = marksOf('cible');
      await paint('ordinaire', 'cible');
      const third = marksOf('cible');
      FormatPainter.disarm();
      const pass = first === 'superscript' && second === 'subscript' && third === '';
      return { pass, notes: JSON.stringify({ first, second, third, html: Editor.getHTML() }) };
    },
  });

  cases.push({
    id: 'sm_icons_are_greyed_for_a_macro_template_only_and_stay_active_in_an_email_and_a_grid',
    description: 'Grisées (jamais retirées) pour un macro-modèle, comme Gras ; actives dans une grille, dans un document et dans un email, où Gras est grisé mais où le lien écrit l\'exposant et l\'indice en caractères Unicode',
    run: async (h) => {
      await h.resetEditor();
      const reset = () => { MainToolbar.setEmailMode(false); MainToolbar.setMacroMode(false); MainToolbar.setGridMode(false); MainToolbar.syncToolbarState(); };
      const state = () => [SUP, SUB, 'v2-btn-bold'].map(isLocked);
      const out = {};
      try {
        reset();
        out.normal = state();
        MainToolbar.setEmailMode(true); MainToolbar.syncToolbarState();
        out.email = state();
        reset();
        MainToolbar.setMacroMode(true); MainToolbar.syncToolbarState();
        out.macro = state();
        reset();
        MainToolbar.setGridMode(true); MainToolbar.syncToolbarState();
        out.grid = state();
      } finally { reset(); }
      out.back = state();
      const present = [SUP, SUB].every(id => !!byId(id));
      return { pass: present && out.normal.join() === 'false,false,false' && out.email.join() === 'false,false,true' && out.macro.join() === 'true,true,true' && out.grid.join() === 'false,false,false' && out.back.join() === out.normal.join(),
        notes: JSON.stringify(out) };
    },
  });

  // --- 4) L'email : des caractères Unicode dans le texte du lien -----------------------------------------------------------------------------------------------------------
  const text = html => MailtoExport.plainTextFromHtml(html);
  async function newEmail(h) { h.openFlyout('#v2-new-template-group'); await h.clickButton('v2-btn-new-email'); await sleep(300); }
  async function newDocument(h) { h.openFlyout('#v2-new-template-group'); await h.clickButton('v2-btn-new-document'); await sleep(300); }

  cases.push({
    id: 'sm_email_text_writes_superscript_and_subscript_as_unicode_characters',
    description: 'Le texte du mailto: écrit <sup> et <sub> avec les caractères Unicode qui en tiennent lieu (m³, H₂O, 1ᵉʳ, 10⁻³, xₙ₊₁) - dans un paragraphe, une liste, une citation, une case de tableau, sous un gras - ; un groupe dont un caractère n\'en a pas (ème, 1,5, q) reste tel qu\'il a été tapé, jamais à moitié ; la note de bas de page garde son écriture',
    run: async () => {
      const samples = [
        ['<p>m<sup>3</sup> et H<sub>2</sub>O, le 1<sup>er</sup> mai</p>', 'm³ et H₂O, le 1ᵉʳ mai'],
        ['<p>10<sup>-3</sup> et 10<sup>−6</sup> et x<sub>n+1</sub> et (a+b)<sup>2</sup></p>', '10⁻³ et 10⁻⁶ et xₙ₊₁ et (a+b)²'],
        ['<p>x<sup>10 000</sup> et a<sup>2&nbsp;</sup>b</p>', 'x¹⁰ ⁰⁰⁰ et a² b'],
        ['<p>le 3<sup>ème</sup>, a<sup>1,5</sup>, E<sub>q</sub>, 2<sup>nd</sup> et N<sup>o</sup></p>', 'le 3ème, a1,5, Eq, 2ⁿᵈ et Nᵒ'],
        ['<ul><li><p>m<sup>2</sup></p></li></ul>', '• m²'],
        ['<blockquote><p>H<sub>2</sub>O</p></blockquote>', '> H₂O'],
        ['<table><tbody><tr><td>m<sup>3</sup></td><td>H<sub>2</sub>O</td></tr></tbody></table>', 'm³ | H₂O'],
        ['<p>x<sup><strong>3</strong></sup> et <strong>y<sub>1</sub></strong></p>', 'x³ et y₁'],
        ['<p>x<sup>a<br>b</sup></p>', 'xa\nb'],
        ['<p>Texte<sup class="footnote-ref-marker" data-note-text="La note">1</sup> fin</p>', 'Texte (La note) fin'],
        ['<p>x<sup>2</sup></p><p>y<sub>2</sub></p>', 'x²\ny₂'],
      ];
      const got = samples.map(([html]) => text(html));
      const failed = samples.map(([html, want], i) => ({ html, want, got: got[i] })).filter(x => x.got !== x.want);
      return { pass: failed.length === 0, notes: JSON.stringify({ failed }) };
    },
  });

  cases.push({
    id: 'sm_email_character_tables_are_the_unicode_superscripts_and_subscripts',
    description: 'Chaque paire des tables de caractères est celle de l\'Unicode (la décomposition NFKC du caractère en exposant ou en indice redonne le caractère de départ), les deux listes vont de pair, tous les chiffres et les lettres annoncées y sont, et les caractères sans équivalent ne sont jamais écrits à moitié',
    run: async () => {
      const tables = ScriptMarks.PLAIN_TEXT_SCRIPTS;
      const bad = [];
      for (const kind of [ScriptMarks.SUPERSCRIPT, ScriptMarks.SUBSCRIPT]) {
        const from = Array.from(tables[kind].from);
        const to = Array.from(tables[kind].to);
        if (from.length !== to.length) bad.push(kind + ' : ' + from.length + ' caractères pour ' + to.length);
        if (new Set(from).size !== from.length) bad.push(kind + ' : un caractère de départ en double');
        from.forEach((c, i) => {
          const back = (to[i] || '').normalize('NFKC');
          if (back !== (c === '-' ? '−' : c)) bad.push(kind + ' : ' + c + ' -> ' + to[i] + ' -> ' + back);
        });
      }
      const sup = ScriptMarks.toUnicode.bind(null, ScriptMarks.SUPERSCRIPT);
      const sub = ScriptMarks.toUnicode.bind(null, ScriptMarks.SUBSCRIPT);
      const digits = '0123456789';
      const checks = {
        digitsSup: sup(digits) === '⁰¹²³⁴⁵⁶⁷⁸⁹', digitsSub: sub(digits) === '₀₁₂₃₄₅₆₇₈₉',
        signs: sup('+-=()') === '⁺⁻⁼⁽⁾' && sub('+-=()') === '₊₋₌₍₎',
        lowerSup: sup('abcdefghijklmnoprstuvwxyz') !== null, noQ: sup('q') === null, noCapitals: ['C', 'F', 'Q', 'S', 'X', 'Y', 'Z'].every(c => sup(c) === null),
        someCapitals: sup('ABDEGHIJKLMNOPRTUVW') !== null,
        subLetters: sub('aehijklmnoprstuvx') !== null && ['b', 'c', 'd', 'f', 'g', 'q', 'w', 'y', 'z', 'A'].every(c => sub(c) === null),
        accents: sup('è') === null && sup('é') === null && sub('é') === null,
        halfNever: sup('2è') === null && sub('2q') === null && sup('a b') === 'ᵃ ᵇ',
        nothing: sup('') === null && sub(null) === null && ScriptMarks.toUnicode('bold', '2') === null,
      };
      const failedChecks = Object.keys(checks).filter(k => !checks[k]);
      return { pass: bad.length === 0 && failedChecks.length === 0, notes: JSON.stringify({ bad, failedChecks }) };
    },
  });

  cases.push({
    id: 'sm_email_real_path_from_the_editor_to_the_encoded_link',
    description: 'Dans un vrai modèle email : les deux icônes ne sont pas grisées (Gras l\'est) et posent <sup> et <sub> ; l\'éditeur les montre levées et baissées comme ailleurs ; le texte lu dans la Lecture (Aperçu A4 posé ou non) a les caractères Unicode ; le lien les encode en UTF-8 et les rend à l\'identique après décodage',
    run: async (h) => {
      const out = {};
      try {
        await newEmail(h);
        out.emailMode = EmailPlainText.isActive();
        await load('<p>Volume m3 et eau H2O, le 1er mai</p>');
        await selectText('3'); await h.clickButton(SUP);
        await selectText('2'); await h.clickButton(SUB);
        await selectText('er'); await h.clickButton(SUP);
        out.locked = [SUP, SUB, 'v2-btn-bold'].map(isLocked);
        out.html = Editor.getHTML();
        out.geometry = { sup: goodSup(geometryOf(document.querySelector('.tiptap sup'))), sub: goodSub(geometryOf(document.querySelector('.tiptap sub'))) };
        const want = 'Volume m³ et eau H₂O, le 1ᵉʳ mai';
        out.texts = {};
        for (const a4 of [true, false]) {
          h.setA4Preview(a4);
          const content = await h.renderReaderMode(Editor.getHTML());
          out.texts[a4 ? 'avecAperçuA4' : 'sansAperçuA4'] = text(content.innerHTML);
        }
        h.setA4Preview(true);
        const url = MailtoExport.buildMailtoUrl({ to: 'a@b.fr', subject: 'Facture', bodyText: out.texts.avecAperçuA4 });
        const body = url.split('?')[1].split('&').map(pair => pair.split('=')).find(pair => pair[0] === 'body')[1];
        out.url = { encoded: ['%C2%B3', '%E2%82%82', '%E1%B5%89', '%CA%B3'].every(code => body.indexOf(code) !== -1), decoded: decodeURIComponent(body) === want, ascii: /^[\x21-\x7e]+$/.test(body) };
        out.pass = out.emailMode && out.locked.join() === 'false,false,true' && out.html === '<p>Volume m<sup>3</sup> et eau H<sub>2</sub>O, le 1<sup>er</sup> mai</p>' && out.geometry.sup && out.geometry.sub
          && out.texts.avecAperçuA4 === want && out.texts.sansAperçuA4 === want && out.url.encoded && out.url.decoded && out.url.ascii;
      } finally {
        await newDocument(h);
        await h.resetEditor();
      }
      return { pass: out.pass === true, notes: JSON.stringify(out) };
    },
  });

  cases.push({
    id: 'sm_email_keys_work_and_a_paste_keeps_the_marks_the_link_can_carry',
    description: 'Dans un vrai modèle email : Ctrl+. et Ctrl+, posent et retirent l\'exposant et l\'indice (le module email ne les avale pas, il avale toujours Ctrl+B) ; un collage garde <sup> et <sub> et perd le gras et la couleur ; le même collage dans un document garde tout',
    run: async (h) => {
      const PASTED = '<p><strong>gras</strong> m<sup>3</sup> H<sub>2</sub>O <span style="color: rgb(255, 0, 0);">rouge</span></p>';
      const out = {};
      try {
        await newEmail(h);
        await load('<p>aa bb cc</p>');
        await selectText('aa');
        out.ctrlDot = press({ key: '.', code: 'Period', ctrlKey: true }) && hasMark('aa', 'superscript');
        await selectText('bb');
        out.ctrlComma = press({ key: ',', code: 'Comma', ctrlKey: true }) && hasMark('bb', 'subscript');
        await selectText('aa');
        out.removed = press({ key: '.', code: 'Period', ctrlKey: true }) && !hasMark('aa', 'superscript');
        await selectText('cc');
        press({ key: 'b', code: 'KeyB', ctrlKey: true });
        out.boldStillSwallowed = !hasMark('cc', 'bold');
        await load('<p>début </p>');
        editor().commands.focus('end');
        await sleep(30);
        editor().view.pasteHTML(PASTED);
        await sleep(120);
        out.emailPaste = Editor.getHTML();
        await newDocument(h);
        await load('<p>début </p>');
        editor().commands.focus('end');
        await sleep(30);
        editor().view.pasteHTML(PASTED);
        await sleep(120);
        out.documentPaste = Editor.getHTML();
      } finally {
        await newDocument(h);
        await h.resetEditor();
      }
      const email = String(out.emailPaste);
      const document_ = String(out.documentPaste);
      const pass = out.ctrlDot && out.ctrlComma && out.removed && out.boldStillSwallowed
        && /<sup>3<\/sup>/.test(email) && /<sub>2<\/sub>/.test(email) && !/<strong>|color/.test(email) && /gras/.test(email)
        && /<strong>gras<\/strong>/.test(document_) && /<sup>3<\/sup>/.test(document_) && /<sub>2<\/sub>/.test(document_) && /color/.test(document_);
      return { pass, notes: JSON.stringify(out) };
    },
  });

  // --- 5) Le même rendu partout --------------------------------------------------------------------------------------------------------------------------------------------
  cases.push({
    id: 'sm_css_gives_the_same_size_and_offset_wherever_the_model_text_is_shown_and_never_changes_the_line',
    description: 'Dans l\'éditeur (et l\'hôte de mesure du PDF), la Lecture, les zones et les bandes d\'en-tête et de pied et les espaceurs de la Lecture : taille 6/10 de celle du texte (ScriptMarks.SIZE_RATIO), décalage −0,75 fois sa taille (exposant) ou +0,35 fois (indice), sans changer la hauteur de la ligne',
    run: async (h) => {
      await h.resetEditor();
      const html = '<p>Base m<sup>3</sup> H<sub>2</sub>O</p>';
      const contexts = ['tiptap', 'reader-content', 'v2-hf-zone-body', 'v2-page-band-header', 'v2-page-band-footer', 'v2-page-edge-spacer'];
      const geo = {};
      contexts.forEach(className => {
        const host = measureHost(html, className);
        geo[className] = { sup: geometryOf(host.querySelector(SUP_SELECTOR)), sub: geometryOf(host.querySelector('sub')) };
      });
      clearHosts();
      const bad = contexts.filter(className => !goodSup(geo[className].sup) || !goodSub(geo[className].sub));
      const heights = {};
      ['tiptap', 'reader-content'].forEach(className => { heights[className] = [heightOf('<p>Base m3 H2O</p>', className), heightOf(html, className)]; });
      const sameHeight = Object.values(heights).every(pair => near(pair[0], pair[1], 0.5));
      return { pass: !bad.length && sameHeight && ScriptMarks.SIZE_RATIO === 0.6, notes: JSON.stringify({ bad, geo, heights }) };
    },
  });

  const HF_DATA = () => ({ enabled: true, differentFirstPage: false, header: { default: '<p>En-tête x<sup>2</sup> H<sub>2</sub>O</p>', first: '' }, footer: { default: '<p>Pied y<sup>3</sup> CO<sub>2</sub></p>', first: '' } });
  const HF_BODY = '<p>Un m<sup>3</sup></p><div class="page-break-marker">Saut de page</div><p>Deux H<sub>2</sub>O</p>';
  // Pour chaque endroit (nom -> sélecteur) de `root`, la géométrie de son premier exposant et de son premier indice.
  function geometryIn(root, places) {
    const geo = {};
    Object.entries(places).forEach(([name, selector]) => { geo[name] = { sup: geometryOf(root.querySelector(selector + ' ' + SUP_SELECTOR)), sub: geometryOf(root.querySelector(selector + ' sub')) }; });
    return geo;
  }
  const badPlaces = geo => Object.keys(geo).filter(name => !goodSup(geo[name].sup) || !goodSub(geo[name].sub));

  cases.push({
    id: 'sm_header_and_footer_marks_have_the_same_size_and_offset_in_the_editor_zones_and_seams',
    description: 'Un exposant ou un indice d\'un en-tête ou d\'un pied de page a la même taille et le même décalage que celui du corps, dans les zones du haut et du bas de la feuille de l\'éditeur et dans leurs bandes de couture',
    run: async (h) => {
      await h.resetEditor();
      h.setA4Preview(true);
      PageLayout.setMarginsMm(null);
      Editor.setHeaderFooterData(HF_DATA());
      Editor.setHTML(HF_BODY);
      Editor.refreshLayout();
      await h.sleep(300);
      const geo = geometryIn(byId('editor-container'), { body: '.tiptap', top: '.v2-page-edge-top .v2-hf-zone-body', bottom: '.v2-page-edge-bottom .v2-hf-zone-body', seamHeader: '.v2-page-band-header', seamFooter: '.v2-page-band-footer' });
      const bad = badPlaces(geo);
      return { pass: !bad.length, notes: JSON.stringify({ bad, geo }) };
    },
  });

  cases.push({
    id: 'sm_reader_keeps_the_tags_and_draws_them_like_the_editor_in_the_body_the_edges_and_the_seams',
    description: 'La Lecture écrit les <sup> et <sub> du modèle (le HTML n\'est pas assaini jusqu\'à les perdre) et les dessine comme l\'éditeur : dans le texte, dans les bandes du haut et du bas de la feuille et dans les coutures',
    run: async (h) => {
      await h.resetEditor();
      h.setA4Preview(true); // la Lecture ne pose ses bandes que sous a4-preview
      PageLayout.setMarginsMm(null);
      let out;
      try {
        const reader = await h.renderReaderMode(HF_BODY, HF_DATA());
        await h.sleep(300);
        const geo = geometryIn(byId('reader-container'), { body: '.reader-content', top: '.v2-page-edge-top', bottom: '.v2-page-edge-bottom', seamHeader: '.v2-page-band-header', seamFooter: '.v2-page-band-footer' });
        const texts = Array.from(reader.querySelectorAll('sup, sub')).filter(el => !el.closest('.v2-page-band, .v2-page-edge-spacer')).map(el => el.tagName + ':' + el.textContent);
        out = { geo, texts };
      } finally {
        // renderReaderMode montre les deux conteneurs à la fois (jamais le cas en usage réel) : retour au Mode édition pour les scénarios suivants.
        byId('reader-container').style.display = '';
        byId('editor-container').style.display = '';
        byId('btn-mode-edit').click();
        await h.sleep(60);
      }
      const bad = badPlaces(out.geo);
      return { pass: !bad.length && out.texts.join() === 'SUP:3,SUB:2', notes: JSON.stringify({ bad, texts: out.texts, geo: out.geo }) };
    },
  });

  cases.push({
    id: 'sm_browser_print_sheets_draw_the_marks_like_the_reading_view_in_the_body_and_the_edges',
    description: 'L\'impression par le navigateur (PrintExport : la Lecture rendue dans un cadre caché, découpée en feuilles) dessine l\'exposant et l\'indice du corps, de l\'en-tête et du pied de page comme la Lecture : 6/10 de la taille du texte, levés de 0,75 fois leur taille (ou baissés de 0,35), sans changer la ligne',
    run: async (h) => {
      await h.resetEditor();
      h.setA4Preview(true);
      PageLayout.setMarginsMm(null);
      let out;
      let job = null;
      try {
        await h.renderReaderMode(HF_BODY, HF_DATA());
        await h.sleep(300);
        job = await PrintExport.prepare(HF_BODY, null, { id: 1 }, HF_DATA(), 'essai');
        const sheet = job.frame.contentDocument.querySelector('.pp-print-sheet');
        const geo = geometryIn(sheet, { body: '.reader-content', top: '.v2-page-edge-top', bottom: '.v2-page-edge-bottom' });
        const texts = Array.from(sheet.querySelectorAll('sup, sub')).filter(el => el.closest('.reader-content')).map(el => el.tagName + ':' + el.textContent);
        out = { geo, texts, sheets: job.pageCount };
      } finally {
        if (job) job.dispose();
        byId('reader-container').style.display = '';
        byId('editor-container').style.display = '';
        byId('btn-mode-edit').click();
        await h.sleep(60);
      }
      const bad = badPlaces(out.geo);
      return { pass: !bad.length && out.sheets === 2 && out.texts.slice(0, 2).join() === 'SUP:3,SUB:2', notes: JSON.stringify({ bad, texts: out.texts, sheets: out.sheets, geo: out.geo }) };
    },
  });

  cases.push({
    id: 'sm_pdf_runs_are_raised_or_lowered_at_six_tenths_of_the_size_they_sit_in',
    description: 'PDF : le run d\'un exposant porte sup et celui d\'un indice sub, à 6/10 de la taille du texte qui les porte (10,5 pt au corps, 6/10 de celle d\'un titre, de la taille choisie, d\'une case, d\'un item, d\'un lien) ; le texte ordinaire n\'en porte pas',
    run: async (h) => {
      await h.resetEditor();
      const html = '<p>Base m<sup>3</sup> H<sub>2</sub>O</p><h2>Titre 10<sup>e</sup></h2><p><span style="font-size: 14pt">grand x<sup>y</sup></span></p>'
        + '<ul><li><p>1<sup>er</sup> item</p></li></ul><table><tbody><tr><td><p>cm<sup>c</sup></p></td></tr></tbody></table>'
        + '<p><a href="https://exemple.fr">lien<sup>l</sup></a></p>';
      const result = await h.exportPdfContent(html, null);
      const runs = runsOf(result.content);
      const marked = runs.filter(r => r.sup || r.sub).map(r => r.text.trim() + ':' + (r.sup ? 'sup' : 'sub'));
      const body = 10.5;
      const heading = (runs.find(r => /Titre/.test(r.text)) || {}).fontSize;
      const bad = [];
      const want = (name, text, size) => {
        const run = runWith(runs, text);
        if (!run) { bad.push(name + ' : run « ' + text + ' » introuvable'); return; }
        if (!near(run.fontSize, size, 0.01)) bad.push(name + ' : taille=' + run.fontSize + ' (attendu ' + size + ')');
        if (run.sup && run.sub) bad.push(name + ' : sup et sub');
      };
      want('exposant', '3', body * 0.6);
      want('indice', '2', body * 0.6);
      want('titre', 'e', heading * 0.6);
      want('taille choisie', 'y', 14 * 0.6);
      want('item', 'er', body * 0.6);
      want('case', 'c', body * 0.6);
      want('lien', 'l', body * 0.6);
      if (JSON.stringify(marked) !== JSON.stringify(['3:sup', '2:sub', 'e:sup', 'y:sup', 'er:sup', 'c:sup', 'l:sup'])) bad.push('runs marqués = ' + marked.join());
      if (!(heading > body)) bad.push('taille du titre = ' + heading);
      if (!runWith(runs, 'l') || runWith(runs, 'l').link !== 'https://exemple.fr') bad.push('lien perdu : ' + (runWith(runs, 'l') || {}).link);
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok ' + JSON.stringify({ heading }) };
    },
  });

  cases.push({
    id: 'sm_pdf_footnote_marker_keeps_its_own_size_and_is_not_an_exposant_of_text',
    description: 'PDF : le marqueur de note de bas de page garde son rendu (sup à 0,7 fois la taille, numéro de note), il ne passe pas par la taille 6/10 de l\'exposant',
    run: async (h) => {
      await h.resetEditor();
      const result = await h.exportPdfContent('<p>Texte<sup class="footnote-ref-marker" data-note-id="n1" data-note-text="Une note"></sup> et m<sup>3</sup></p>', null);
      const runs = runsOf(result.content);
      const note = runs.find(r => r.text === '1' && r.sup);
      const text = runWith(runs, '3');
      const pass = !!note && near(note.fontSize, 10.5 * 0.7, 0.01) && !!text && near(text.fontSize, 10.5 * 0.6, 0.01);
      return { pass, notes: JSON.stringify({ note, text }) };
    },
  });

  cases.push({
    id: 'sm_the_raise_painted_in_the_pdf_is_the_one_the_editor_css_draws',
    description: 'Vérité terrain : dans le PDF décodé par pdf.js, le texte d\'un exposant est levé au-dessus de la ligne de base de la même hauteur que dans l\'éditeur (0,75 fois sa taille), un indice baissé de la même profondeur (0,35 fois) ; la ligne ne bouge pas',
    run: async (h) => {
      await h.resetEditor();
      const html = '<p>Alpha<sup>up</sup> Beta<sub>dn</sub> Gamma</p>';
      const result = await h.exportPdfContent(html, null);
      const truth = await h.extractPdfGroundTruth(result.base64);
      const items = truth.pages[0].textItems;
      const at = str => items.find(it => it.str.trim() === str);
      const base = items.find(it => it.str.includes('Alpha'));
      const sup = at('up'); const sub = at('dn'); const after = items.find(it => it.str.includes('Gamma'));
      const pdfRaise = base && sup ? base.y - sup.y : null;       // en pt : positif = levé
      const pdfLower = base && sub ? sub.y - base.y : null;       // en pt : positif = baissé
      const domRaise = raiseOf(html, 'sup') * 72 / 96;
      const domLower = -raiseOf(html, 'sub') * 72 / 96;
      const pass = !!base && !!sup && !!sub && !!after && near(pdfRaise, 0.75 * 6.3, 0.15) && near(pdfLower, 0.35 * 6.3, 0.15) && near(pdfRaise, domRaise, 0.2) && near(pdfLower, domLower, 0.2)
        && near(after.y, base.y, 0.05);
      return { pass, notes: JSON.stringify({ pdfRaise, domRaise, pdfLower, domLower, items: items.map(it => [it.str, Math.round(it.y * 100) / 100]) }) };
    },
  });

  cases.push({
    id: 'sm_docx_has_the_real_word_superscript_and_subscript',
    description: 'Word : l\'exposant et l\'indice sont écrits en vrai (<w:vertAlign w:val="superscript"> ou "subscript" sur le run), dans un titre, une liste et une case aussi ; aucun autre run n\'en a ; la note de bas de page reste une vraie note',
    run: async (h) => {
      await h.resetEditor();
      const html = '<p>Base m<sup>3</sup> H<sub>2</sub>O</p><h2>Titre 10<sup>e</sup></h2><ul><li><p>1<sup>er</sup> item</p></li></ul>'
        + '<table><tbody><tr><td><p>cm<sup>c</sup></p></td></tr></tbody></table><p>Note<sup class="footnote-ref-marker" data-note-id="n1" data-note-text="Une note"></sup> fin</p>';
      const parts = await h.exportDocxParts(html);
      const runs = [].concat(...h.docxParagraphs(parts.doc).map(p => p.runs));
      const marked = runs.filter(r => r.vertAlign).map(r => r.text + ':' + r.vertAlign);
      const note = runs.find(r => r.hasFootnoteRef);
      const bad = [];
      if (JSON.stringify(marked) !== JSON.stringify(['3:superscript', '2:subscript', 'e:superscript', 'er:superscript', 'c:superscript'])) bad.push('runs marqués = ' + marked.join());
      if (!note) bad.push('note de bas de page absente'); else if (note.vertAlign) bad.push('note : vertAlign=' + note.vertAlign);
      if (!Object.keys(parts.parts).some(name => /footnotes\.xml$/.test(name))) bad.push('footnotes.xml absent');
      return { pass: !bad.length, notes: bad.length ? bad.join(' | ') : 'ok' };
    },
  });

  window.EditorTestSuites = window.EditorTestSuites || {};
  window.EditorTestSuites.scriptMarks = cases;
})();
